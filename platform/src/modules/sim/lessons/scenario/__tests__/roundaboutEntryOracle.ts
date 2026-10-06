/**
 * ROUNDABOUT-ENTRY ORACLE — test support for the acceptance property of the
 * founder ruling 2026-10-05, «BILL FORCED BRAKING», as the integrator pinned it
 * for round 4:
 *
 *   „Bill it only when a circulating car actually has to brake or swerve
 *    because of the entry, or there is contact. … Patient or careful entries
 *    are never billed."
 *
 *   Yielding at a roundabout is about ONE place — the mouth he enters by — and
 *   about the cars that had not yet passed it when he entered.
 *
 * The product convicts on each circulating car's OWN account of the speed it
 * lost to the student (`traffic/vehicles.ts playerShedThisStep`, read by the
 * runtime's roundabout tracker), and decides who had priority and when a car
 * has cleared the mouth with its own geometry. An acceptance test that read
 * the same account through the same geometry would be the product agreeing
 * with itself (round 3's oracle shared the product's 35° window, and so could
 * not see a driver who stops in the lane). This oracle reads neither. It works
 * from PUBLISHED poses and speeds only:
 *
 *   THE ENTRY. The frame the NOSE of his car (centre + half the chassis along
 *   the heading) is first on the ring carriageway — ring radius plus half the
 *   drawn ring width, computed here from the district file — having been off
 *   it on the frame before. Each such frame is its own entry.
 *
 *   THE MOUTH. The azimuth, about the ring centre, of the point where his nose
 *   crossed the ring's edge (the two nose positions either side of the edge,
 *   interpolated on their radius).
 *
 *   PASSED THE MOUTH. The whole car has gone by: its rear end is beyond the
 *   mouth (its centre is past by more than half its length, along its own
 *   circle).
 *
 *   THE PRIORITY SET P. Every staged car that is circulating at that frame and
 *   has not passed the mouth — wherever on the ring it is. Measured as a RUN:
 *   the sense the ring is driven in is read off each car's own published
 *   motion, and the run is the distance its rear end has still to travel in
 *   that sense to be past the mouth. At most half a lap of it: a car that
 *   would need more has just gone by (the car he let pass) — not in P.
 *
 *   …AND IT STAYS OPEN WHILE HE OCCUPIES HIS MOUTH (round 5). From the entry
 *   frame until HIS OWN rear end is past the mouth — the same run, measured
 *   for him from his published pose in the sense the ring is driven in — or
 *   his nose is published off the ring again, a car that is circulating and
 *   has a run to the mouth (it had gone by and has come round to the
 *   approaching half; it has driven onto the ring) JOINS P on that frame: its
 *   run and its odometer start there, and so does its sum. Once he has left
 *   the mouth nobody joins.
 *
 *   CLEARED THE MOUTH. The car has travelled that run — an ODOMETER (its own
 *   azimuth steps, summed from the entry frame), not a second look at where it
 *   stands, so «cleared» cannot come undone half a lap later.
 *
 *   OFF THE RING. A car of P that is published beyond the ring carriageway
 *   before it has cleared the mouth has left the ring by an exit: it is out
 *   of P from that frame, and if it comes back it has joined the ring later.
 *
 *   BECAUSE OF HIM — THE COUNTERFACTUAL TWIN. The same drive is run a second
 *   time, frame for frame, in a world whose traffic is never told where the
 *   student is — the same district, the same staged cast under the same
 *   director at the same seed, fed the same poses so every runner arms, syncs
 *   and locks on the same frames. Whatever speed a car of P loses in the real
 *   world that its twin does not lose on the same frame, from the entry frame
 *   until it has cleared the mouth, it lost because of his entry. (A car that
 *   was a car of P of his PREVIOUS entry, had not cleared, and is in P of the
 *   new one too keeps its sum: he has come on ahead of the same car twice.)
 *
 *   THE EVENT (the ruling's two grounds). A car of P has lost
 *   ORACLE_FORCED_SHED_MPS that way, or his chassis has touched a car of P
 *   that has not cleared the mouth (the collision module's own box test).
 *   Whether he is moving or standing is not asked.
 *
 * It also reports the BOUNDARY BAND — drives within ORACLE_BAND_SHED_MPS of the
 * threshold, or with the deciding car within ORACLE_BAND_MOUTH_M of the mouth
 * (at the entry frame, or when it braked / was touched), or of the point half a
 * lap from it where «not yet passed» turns into «just passed» — so a caller
 * can hold the two-way property strictly outside it and list the band
 * separately.
 *
 * WHAT IT CAN SEE. Staged actors — the whole cast of every roundabout-family
 * rung. The twin carries the rung's ambient fleet too (so a staged car that
 * brakes for an AMBIENT car brakes in both worlds and is charged to nobody),
 * but ambient cars themselves are not measured: an ambient car's twin diverges
 * from it for good after their first interaction, so a frame-for-frame
 * comparison says nothing about it afterwards. `ambientCars` reports the count
 * so a caller can refuse to draw conclusions on a rung that has any.
 *
 * THE INSTRUCTOR'S VOICE. It also notes when the teach channel said
 * «Интервалът беше добър» (the yield voice's verdict on a ring entry), read off
 * the HUD events the live chain produced — so a caller can hold that the
 * praise never comes before a bill for the same drive, and never AFTER
 * somebody on the ring has paid for the entry: `firstPShedT` (a car of P eased
 * off for him at all), `notCountedForcedT` (any other circulating car's loss
 * to him reached the line) and the two contact times say when that was.
 *
 * Test support only; nothing in the product imports it.
 */

import { obbSeparationM, PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../../collision";
import { DEFAULT_LESSON_TRAFFIC } from "../../../contracts";
import type { LessonSpec, StagedEventSpec } from "../../../contracts";
import { createScenarioDirector, lessonSeed } from "../../../orchestrator/director";
import { createWorldRuntime } from "../../../runtime";
import { applySignalModes } from "../../../scene/lessonWorldRecipe";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import { ambientSidewalkBudget } from "../../../traffic/pedestrians";
import { createTrafficSystem } from "../../../traffic/system";
import {
  DEFAULT_TRAFFIC_CONFIG,
  vehicleHalfLengthM,
  vehicleHalfWidthM,
  type TrafficDistrict,
} from "../../../traffic/types";
import { LANE_WIDTH_M } from "../../../world/builders/constants";
import { sessionClockAdvance } from "../../../../../components/sim/lesson-ui/sessionClock";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";

/** «Forced to brake»: a car of P loses this much speed to him, m/s. */
export const ORACLE_FORCED_SHED_MPS = 0.3;
/** «Any speed at all»: the measured floor is exactly 0, so anything above this is a loss, m/s. */
export const ORACLE_ANY_SHED_MPS = 1e-6;
/** The boundary band: this close to the threshold, m/s … */
export const ORACLE_BAND_SHED_MPS = 0.1;
/** … or with the deciding car this close to the mouth, m along its own circle. */
export const ORACLE_BAND_MOUTH_M = 0.5;
/** A car is going ROUND the ring when its heading is more tangential than radial. */
const MAX_RADIAL = Math.SQRT1_2;

export interface OracleCar {
  /** Was it in the priority set of an entry (circulating, its rear end not yet past the mouth). */
  inP: boolean;
  /**
   * When it JOINED the set on a frame after an entry frame — he was still in
   * his mouth and it came short of it (round 5) — or null: it was a member
   * from an entry frame, or never one.
   */
  joinedLateT: number | null;
  /** The run its rear end had to the mouth on that frame, m. */
  runAtJoinM: number | null;
  /** How far HIS rear end still was from being past the mouth on that frame, m (the set closes at 0). */
  hisRunAtJoinM: number | null;
  /**
   * Not a member on the frame the set closed (he left his mouth): how far its
   * centre then was from the point half a lap from the mouth, where it would
   * have joined, m along its own circle. Null: a member then, or not circulating.
   */
  marginAtCloseM: number | null;
  /**
   * The run its REAR END still had to the mouth at the (first) entry frame, m
   * along its own circle: positive = not yet passed (in P), negative = it had
   * passed by that much. Null: not circulating at that frame.
   */
  runAtEntryM: number | null;
  /**
   * How far its centre stood, at the (first) entry frame, from the point half a
   * lap from the mouth — where «still coming» turns into «just passed» — m
   * along its own circle. Null: not circulating at that frame.
   */
  halfLapMarginM: number | null;
  /** When its rear end cleared the mouth, or null. */
  clearedT: number | null;
  /** Speed it lost to him from the entry frame until it cleared the mouth, m/s (real loss − twin loss). */
  shedBeforeClearMps: number;
  /** When that reached ORACLE_FORCED_SHED_MPS, or null. */
  forcedT: number | null;
  /** The run its rear end still had to the mouth at that moment, m. */
  runAtForcedM: number | null;
  /** The same sum stopped ORACLE_BAND_MOUTH_M short of the mouth / carried that far past it (the band). */
  shedShortOfMouthMps: number;
  shedPastMouthMps: number;
  /** Speed it lost to him with his nose on the ring that does NOT count: not in P, or after clearing. */
  shedNotCountedMps: number;
  /** When that reached ORACLE_FORCED_SHED_MPS, or null. */
  notCountedForcedT: number | null;
  /** Speed it lost that its twin did not, over the whole drive, m/s. */
  driveShedMps: number;
  /** Its slowest published speed while circulating, real and twin, m/s. */
  minSpeedMps: number;
  twinMinSpeedMps: number;
  /** Centre-to-centre distance to him at its closest, m. */
  nearestM: number;
}

export interface EntryOracle {
  /** Ring geometry the oracle measured from the district file. */
  ring: { x: number; y: number; radiusM: number; outerM: number };
  /** Entry events in the drive (nose onto the ring from outside). */
  entries: number;
  /** First frame his nose was on the ring, having been outside it. */
  enteredT: number | null;
  /** Compass azimuth of the mouth of the first entry, degrees. */
  mouthAzDeg: number | null;
  /** His speed on that frame, км/ч. */
  enteredKmh: number | null;
  cars: Record<string, OracleCar>;
  /** Members of P over the drive's entries. */
  prioritySet: string[];
  /** First time a car of P had lost ORACLE_FORCED_SHED_MPS to him before clearing the mouth. */
  forcedT: number | null;
  forcedBy: string | null;
  /** Was he standing (≤ 1 км/ч) on that frame. */
  forcedWhileStanding: boolean;
  /** First frame his body touched a car of P that had not cleared the mouth. */
  contactT: number | null;
  contactWith: string | null;
  /** First frame his body touched a circulating car that was NOT such a car (a collision, not this fault). */
  otherContactT: number | null;
  otherContactWith: string | null;
  /** forcedT or contactT: the ruling's two grounds. */
  event: boolean;
  /** The car that grounds the event joined the set AFTER the entry frame (round 5: the returning car). */
  groundedByLateJoiner: boolean;
  /** Cars that joined the set after an entry frame, in order. */
  lateJoiners: string[];
  /** When the set closed for the first entry: he had left his mouth (or backed off the ring). Null: it never did. */
  setClosedT: number | null;
  /** …and why: his rear end went past the mouth ("passed") or his nose came off the ring ("backedOff"). */
  setClosedHow: "passed" | "backedOff" | null;
  /** How far onto the carriageway his nose was on the first frame he STOOD with the set open, m (null: he never did). */
  restNoseInM: number | null;
  /** Seconds he stood (≤ 1 км/ч) with his nose on the ring and the set open, over the drive. */
  restOpenSec: number;
  /** Largest `shedBeforeClearMps` over P, and largest `shedNotCountedMps` over the cast. */
  maxPShedMps: number;
  maxNotCountedShedMps: number;
  /** First time a car of P had lost ANY speed to him before clearing the mouth (an easing, however small), or null. */
  firstPShedT: number | null;
  /** First time any car's not-counted loss had reached ORACLE_FORCED_SHED_MPS, or null. */
  notCountedForcedT: number | null;
  /** The drive sits in the boundary band (see the header), and why. */
  band: boolean;
  bandWhy: string[];
  /** Ambient cars in the live world — the oracle cannot see them (see header). */
  ambientCars: number;
}

export interface OracleDrive {
  out: LiveReplayOutcome;
  oracle: EntryOracle;
  /** Session time FAILED_TO_YIELD was billed, or null. */
  billedT: number | null;
  /** Was YIELDED_TO_PRIORITY awarded. */
  commended: boolean;
  /** Session time the teach channel first said «Интервалът беше добър», or null. */
  voicePraisedT: number | null;
}

interface RingGeom {
  x: number;
  y: number;
  radius: number;
  edgeIds: string[];
}

function ringOf(raw: unknown): { x: number; y: number; radiusM: number; outerM: number } {
  const d = raw as {
    roundabouts?: RingGeom[];
    roads: { edges: { id: string; lanes: number; roundabout: boolean }[] };
  };
  const rb = (d.roundabouts ?? [])[0];
  if (!rb) throw new Error("roundaboutEntryOracle: the district has no roundabout");
  const ids = new Set(rb.edgeIds);
  let half = 0;
  for (const e of d.roads.edges) {
    if (!ids.has(e.id)) continue;
    half = Math.max(half, Math.max((Math.max(1, e.lanes) * LANE_WIDTH_M) / 2, 2.4));
  }
  return { x: rb.x, y: rb.y, radiusM: rb.radius, outerM: rb.radius + half };
}

function spawnOf(lesson: LessonSpec, raw: unknown): { x: number; y: number } {
  const pts = ((raw as { spawnPoints?: { id: string; x: number; y: number }[] }).spawnPoints ?? []);
  const explicit = lesson.spawn.position;
  if (lesson.spawn.pointId) {
    const p = pts.find((s) => s.id === lesson.spawn.pointId);
    return { x: p?.x ?? explicit?.x ?? 0, y: p?.y ?? explicit?.y ?? 0 };
  }
  return { x: explicit?.x ?? 0, y: explicit?.y ?? 0 };
}

/** Compass azimuth of (x, y) about the ring centre, degrees in [0, 360). */
function azimuthDeg(x: number, y: number): number {
  const a = (Math.atan2(x, y) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
}

/** The step from azimuth `from` to azimuth `to`, degrees in (−180, 180]. */
function stepDeg(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

export interface OracleOptions {
  /** Render-frame deltas, cycled (default a steady 60 Hz) — see liveChainReplay. */
  frameDeltas?: readonly number[];
  holdAfterSec?: number;
}

/**
 * Record `script` against the rung's own cast, replay it through the live chain,
 * and measure the entry from outside — see the header.
 */
export function driveWithOracle(
  lesson: LessonSpec,
  districtRaw: unknown,
  script: DriveScript,
  opts: OracleOptions = {},
): OracleDrive {
  const staged = (lesson.stagedEvents ?? []) as StagedEventSpec[];
  const rec = recordScriptedDrive(districtRaw, script, {
    scenarioId: lesson.id,
    kind: "shadow",
    seed: 7,
    stagedEvents: staged,
    collisionMinKmh: 0,
  });
  const ring = ringOf(districtRaw);

  // ── the twin world: the same cast, never told where he is ────────────────
  const twinRuntime = createWorldRuntime(districtRaw);
  const anchor = spawnOf(lesson, districtRaw);
  if (lesson.signalPlan) twinRuntime.armSignalPlan(lesson.signalPlan, anchor);
  applySignalModes(twinRuntime, lesson);
  // LessonScene's own traffic options (liveChainReplay builds the live world
  // from exactly these), so the twin carries the same ambient fleet — which,
  // never told where he is, does what it would have done without him.
  const trafficSpec = lesson.traffic;
  const twinTraffic = createTrafficSystem(districtRaw as TrafficDistrict, {
    anchor,
    anchorRadiusM: trafficSpec?.anchorRadiusM ?? DEFAULT_LESSON_TRAFFIC.anchorRadiusM,
    anchorPath: trafficSpec?.anchorPath,
    vehicleCount: trafficSpec?.vehicleCount ?? DEFAULT_LESSON_TRAFFIC.vehicleCount,
    pedestrianCount: trafficSpec?.pedestrianCount ?? DEFAULT_LESSON_TRAFFIC.pedestrianCount,
    sidewalkPedestrianCount:
      trafficSpec?.sidewalkPedestrianCount ??
      ambientSidewalkBudget(
        districtRaw as TrafficDistrict,
        DEFAULT_TRAFFIC_CONFIG.footwaylessRoadClasses,
        DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      ),
  });
  const twinDirector =
    staged.length > 0
      ? createScenarioDirector(staged, twinTraffic, { seed: lessonSeed(lesson.id), signals: twinRuntime })
      : null;

  // Every staged VEHICLE of the cast, by the id the runner staged it under.
  const ids: string[] = [];
  const cars: Record<string, OracleCar> = {};
  /** Per car, frame to frame: last published speeds and azimuth, and the sense it goes round in. */
  interface Track {
    real: number;
    twin: number;
    azDeg: number;
    /** +1 = compass azimuth rising, −1 = falling, 0 = not yet seen going round. */
    sense: number;
    /** This entry: in P; metres its rear end had to run to the mouth at the entry frame; metres run since. */
    inP: boolean;
    runM: number;
    ranM: number;
    /** Half its length, m (from its published profile). */
    halfM: number;
    cleared: boolean;
    shed: number;
    shedShort: number;
    shedPast: number;
    /** Its present membership began on a frame after the entry frame (round 5). */
    late: boolean;
  }
  const track: Record<string, Track | undefined> = {};

  const oracle: EntryOracle = {
    ring,
    entries: 0,
    enteredT: null,
    mouthAzDeg: null,
    enteredKmh: null,
    cars,
    prioritySet: [],
    forcedT: null,
    forcedBy: null,
    forcedWhileStanding: false,
    contactT: null,
    contactWith: null,
    otherContactT: null,
    otherContactWith: null,
    event: false,
    groundedByLateJoiner: false,
    lateJoiners: [],
    setClosedT: null,
    setClosedHow: null,
    restNoseInM: null,
    restOpenSec: 0,
    maxPShedMps: 0,
    maxNotCountedShedMps: 0,
    firstPShedT: null,
    notCountedForcedT: null,
    band: false,
    bandWhy: [],
    ambientCars: 0,
  };
  const bandWhy = new Set<string>();

  const deltas = opts.frameDeltas && opts.frameDeltas.length > 0 ? opts.frameDeltas : [1 / 60];
  let frame = 0;
  /** His nose on the previous frame (about the ring centre) and whether he was on the ring; null before frame 1. */
  let nosePrev: { x: number; y: number; on: boolean } | null = null;
  /** An entry is live from its frame until the next one. */
  let entryLive = false;
  /** He still occupies the mouth of the live entry: the set takes new members (round 5). */
  let setOpen = false;
  /** The live entry's mouth, compass degrees. */
  let liveMouthAz = 0;
  /** The sense the ring is driven in, as the cast's own motion shows it (0 until one has moved). */
  let ringSense = 0;
  let billedT: number | null = null;
  let voicePraisedT: number | null = null;
  /** Was the grounding car's membership a late one, for each ground. */
  let forcedLate = false;
  let contactLate = false;

  const out = liveChainReplay({
    lesson,
    districtRaw,
    trace: rec.trace,
    holdAfterSec: opts.holdAfterSec ?? 3,
    ...(opts.frameDeltas ? { frameDeltas: opts.frameDeltas } : {}),
    afterApply: ({ t, tick, traffic, session, step }) => {
      const dt = sessionClockAdvance(deltas[frame % deltas.length]);
      frame++;
      // Step the twin on this frame's pose, in LessonScene's order.
      twinRuntime.update(dt);
      twinTraffic.update(dt, { signalPhase: (id) => twinRuntime.signalPhase(id), playerPos: null });
      if (twinDirector) {
        twinDirector.step({
          tSec: t,
          dtSec: dt,
          x: tick.position.x,
          y: tick.position.y,
          speedKmh: tick.speedKmh,
          headingDeg: tick.headingDeg,
          brakePedal: 0,
          tickEvents: [],
        });
      }
      if (frame === 1) {
        for (const s of staged) {
          const view = traffic.staged(s.id);
          if (view && view.kind === "vehicle" && twinTraffic.staged(s.id)) ids.push(s.id);
        }
        // Also any extra vehicles a runner stages under another id are not in
        // the cast list; the roundabout runners stage exactly `spec.id`.
        oracle.ambientCars = traffic.vehicles.length - ids.length;
      }
      if (billedT === null) {
        const before = session.events.length;
        for (let i = before; i < step.state.events.length; i++) {
          const e = step.state.events[i];
          if (e.kind === "violation" && e.code === "FAILED_TO_YIELD") billedT = t;
        }
      }
      if (voicePraisedT === null) {
        for (const h of step.hudEvents) {
          if (h.kind === "lesson" && h.titleBg === "Интервалът беше добър") voicePraisedT = t;
        }
      }

      // ── his entry, measured from his published pose ─────────────────────
      const px = tick.position.x;
      const py = tick.position.y;
      const rad = (tick.headingDeg * Math.PI) / 180;
      const nx = px + Math.sin(rad) * PLAYER_HALF_LENGTH_M - ring.x;
      const ny = py + Math.cos(rad) * PLAYER_HALF_LENGTH_M - ring.y;
      const noseR = Math.hypot(nx, ny);
      const centreR = Math.hypot(px - ring.x, py - ring.y);
      const on = centreR <= ring.outerM || noseR <= ring.outerM;
      const isEntry = on && nosePrev !== null && !nosePrev.on;
      let mouthAz = 0;
      if (isEntry) {
        // Where the nose crossed the edge: between its last position off the
        // ring and this one, by how far each is from the edge.
        const prevR = Math.hypot(nosePrev!.x, nosePrev!.y);
        const span = prevR - noseR;
        const f = span > 1e-9 ? Math.min(1, Math.max(0, (prevR - ring.outerM) / span)) : 1;
        mouthAz = azimuthDeg(nosePrev!.x + (nx - nosePrev!.x) * f, nosePrev!.y + (ny - nosePrev!.y) * f);
        oracle.entries++;
        entryLive = true;
        setOpen = true;
        liveMouthAz = mouthAz;
        if (oracle.enteredT === null) {
          oracle.enteredT = t;
          oracle.mouthAzDeg = mouthAz;
          oracle.enteredKmh = tick.speedKmh;
        }
      }
      nosePrev = { x: nx, y: ny, on };
      const standing = Math.abs(tick.speedKmh) <= 1;

      // The sense the ring is driven in: read off whichever car is going round.
      for (const id of ids) {
        const real = traffic.staged(id);
        const p = track[id];
        if (!real || !p || ringSense !== 0) continue;
        const dx = real.x - ring.x;
        const dy = real.y - ring.y;
        if (Math.hypot(dx, dy) > ring.outerM) continue;
        const turned = stepDeg(p.azDeg, azimuthDeg(dx, dy));
        if (Math.abs(turned) > 1e-9) ringSense = turned > 0 ? 1 : -1;
      }

      // ── does he still occupy his mouth? ─────────────────────────────────
      // His own run to the mouth, as a car's: the degrees his centre has
      // still to travel to it in the sense the ring is driven in, as metres
      // of his own circle, plus half his length. Below zero his rear end is
      // past it — he has left the mouth. (Asked before the cars are looked
      // at: on the frame he has left it nobody joins.)
      let hisRunM = Infinity;
      if (setOpen && !isEntry) {
        if (ringSense !== 0) {
          const hisAz = azimuthDeg(px - ring.x, py - ring.y);
          const toMouth = stepDeg(0, ringSense > 0 ? liveMouthAz - hisAz : hisAz - liveMouthAz);
          hisRunM = toMouth * (Math.PI / 180) * centreR + PLAYER_HALF_LENGTH_M;
        }
        const how = !on ? "backedOff" : hisRunM < 0 ? "passed" : null;
        if (how !== null) {
          setOpen = false;
          if (oracle.entries === 1 && oracle.setClosedT === null) {
            oracle.setClosedT = t;
            oracle.setClosedHow = how;
            for (const id of ids) {
              const real = traffic.staged(id);
              const p = track[id];
              const car = cars[id];
              if (!real || !p || !car || (p.inP && !p.cleared)) continue;
              const cdx = real.x - ring.x;
              const cdy = real.y - ring.y;
              const cr = Math.hypot(cdx, cdy);
              if (cr > ring.outerM || cr < 1e-6 || Math.abs((real.dirX * cdx + real.dirY * cdy) / cr) > MAX_RADIAL) continue;
              const cs = p.sense !== 0 ? p.sense : ringSense;
              const az = azimuthDeg(cdx, cdy);
              const toMouth = stepDeg(0, cs > 0 ? liveMouthAz - az : az - liveMouthAz);
              car.marginAtCloseM = (180 - Math.abs(toMouth)) * (Math.PI / 180) * cr;
            }
          }
        }
      }
      if (setOpen && on && standing) {
        oracle.restOpenSec += dt;
        if (oracle.restNoseInM === null) oracle.restNoseInM = ring.outerM - Math.min(noseR, centreR);
      }

      for (const id of ids) {
        const real = traffic.staged(id);
        const twin = twinTraffic.staged(id);
        if (!real || !twin) continue;
        let car = cars[id];
        if (!car) {
          car = cars[id] = {
            inP: false,
            joinedLateT: null,
            runAtJoinM: null,
            hisRunAtJoinM: null,
            marginAtCloseM: null,
            runAtEntryM: null,
            halfLapMarginM: null,
            clearedT: null,
            shedBeforeClearMps: 0,
            forcedT: null,
            runAtForcedM: null,
            shedShortOfMouthMps: 0,
            shedPastMouthMps: 0,
            shedNotCountedMps: 0,
            notCountedForcedT: null,
            driveShedMps: 0,
            minSpeedMps: Infinity,
            twinMinSpeedMps: Infinity,
            nearestM: Infinity,
          };
        }
        const dx = real.x - ring.x;
        const dy = real.y - ring.y;
        const r = Math.hypot(dx, dy);
        const az = azimuthDeg(dx, dy);
        const p = track[id];
        // What it did since the previous frame.
        const turned = p ? stepDeg(p.azDeg, az) : 0;
        let sense = p ? p.sense : 0;
        if (Math.abs(turned) > 1e-9) sense = turned > 0 ? 1 : -1;
        const his = p ? Math.max(0, Math.max(0, p.real - real.speedMps) - Math.max(0, p.twin - twin.speedMps)) : 0;
        const cur: Track = (track[id] = {
          real: real.speedMps,
          twin: twin.speedMps,
          azDeg: az,
          sense,
          inP: p ? p.inP : false,
          runM: p ? p.runM : 0,
          ranM: p ? p.ranM : 0,
          halfM: p ? p.halfM : vehicleHalfLengthM(traffic.vehicles.find((v) => v.x === real.x && v.y === real.y)?.profile),
          cleared: p ? p.cleared : false,
          shed: p ? p.shed : 0,
          shedShort: p ? p.shedShort : 0,
          shedPast: p ? p.shedPast : 0,
          late: p ? p.late : false,
        });
        const near = Math.hypot(real.x - px, real.y - py);
        if (near < car.nearestM) car.nearestM = near;
        car.driveShedMps += his;
        // CIRCULATING: on the ring carriageway and going round it.
        const circulating =
          r <= ring.outerM && r > 1e-6 && Math.abs((real.dirX * dx + real.dirY * dy) / r) <= MAX_RADIAL;
        if (circulating) {
          if (real.speedMps < car.minSpeedMps) car.minSpeedMps = real.speedMps;
          if (twin.speedMps < car.twinMinSpeedMps) car.twinMinSpeedMps = twin.speedMps;
        }
        const mPerDeg = (Math.PI / 180) * r;

        if (isEntry) {
          // THE PRIORITY SET of this entry. The run to the mouth is the angle
          // the car has still to travel in the sense it goes round in (a car
          // not yet seen moving takes the sense the rest of the cast shows).
          const s = sense !== 0 ? sense : ringSense;
          if (circulating && s === 0) {
            throw new Error("roundaboutEntryOracle: no car has gone round the ring yet — its sense is unknown");
          }
          // Degrees its CENTRE has still to travel to the mouth, in (−180, 180]:
          // negative = the centre is already beyond it.
          const toMouth = stepDeg(0, s > 0 ? mouthAz - az : az - mouthAz);
          // One car, one account: a car of P of the entry before, not cleared,
          // that is in P again keeps its sum.
          const carried = p !== undefined && p.inP && !p.cleared;
          cur.runM = toMouth * mPerDeg + cur.halfM;
          cur.inP = circulating && cur.runM >= 0;
          cur.ranM = 0;
          cur.cleared = false;
          cur.late = false;
          if (!(cur.inP && carried)) {
            cur.shed = 0;
            cur.shedShort = 0;
            cur.shedPast = 0;
          }
          if (cur.inP) {
            car.inP = true;
            if (!oracle.prioritySet.includes(id)) oracle.prioritySet.push(id);
          }
          if (oracle.entries === 1) {
            car.runAtEntryM = circulating ? cur.runM : null;
            car.halfLapMarginM = circulating ? (180 - Math.abs(toMouth)) * mPerDeg : null;
          }
        } else if (entryLive) {
          cur.ranM += sense !== 0 ? turned * sense * mPerDeg : 0;
          // A LATE JOINER (round 5): he is still in his mouth, and this car —
          // not a member, or a member that has cleared — is circulating with
          // a run to the mouth again. It joins here; its run, its odometer
          // and its sum start on this frame.
          const member = cur.inP && !cur.cleared;
          const s = sense !== 0 ? sense : ringSense;
          if (setOpen && !member && circulating && s !== 0) {
            const toMouth = stepDeg(0, s > 0 ? liveMouthAz - az : az - liveMouthAz);
            const runNow = toMouth * mPerDeg + cur.halfM;
            // A member that has only just cleared stands a hair past the
            // mouth; it comes back to the set when its CENTRE is short of the
            // mouth again — half a lap on.
            if (runNow >= 0 && (!cur.cleared || toMouth > 0)) {
              cur.inP = true;
              cur.cleared = false;
              cur.runM = runNow;
              cur.ranM = 0;
              cur.shed = 0;
              cur.shedShort = 0;
              cur.shedPast = 0;
              cur.late = true;
              car.inP = true;
              if (car.joinedLateT === null) {
                car.joinedLateT = t;
                car.runAtJoinM = runNow;
                car.hisRunAtJoinM = hisRunM;
              }
              if (!oracle.prioritySet.includes(id)) oracle.prioritySet.push(id);
              if (!oracle.lateJoiners.includes(id)) oracle.lateJoiners.push(id);
            }
          }
        }

        if (!entryLive) continue;
        // OFF THE RING before clearing the mouth: it took an exit — out of P.
        if (cur.inP && !cur.cleared && r > ring.outerM) cur.inP = false;
        const leftM = cur.runM - cur.ranM; // run its rear end has still to go to be past the mouth
        if (cur.inP && !cur.cleared && cur.ranM > cur.runM) {
          cur.cleared = true;
          if (car.clearedT === null) car.clearedT = t;
        }
        if (cur.inP) {
          // The band's two sums stop either side of the mouth.
          if (leftM >= ORACLE_BAND_MOUTH_M) cur.shedShort += his;
          if (leftM >= -ORACLE_BAND_MOUTH_M) cur.shedPast += his;
          if (cur.shedShort > car.shedShortOfMouthMps) car.shedShortOfMouthMps = cur.shedShort;
          if (cur.shedPast > car.shedPastMouthMps) car.shedPastMouthMps = cur.shedPast;
        }
        if (cur.inP && !cur.cleared) {
          cur.shed += his;
          if (cur.shed > ORACLE_ANY_SHED_MPS && oracle.firstPShedT === null) oracle.firstPShedT = t;
          if (cur.shed > car.shedBeforeClearMps) car.shedBeforeClearMps = cur.shed;
          if (cur.shed >= ORACLE_FORCED_SHED_MPS && car.forcedT === null) {
            car.forcedT = t;
            car.runAtForcedM = leftM;
            if (oracle.forcedT === null) {
              oracle.forcedT = t;
              oracle.forcedBy = id;
              oracle.forcedWhileStanding = standing;
              forcedLate = cur.late;
            }
          }
        } else if (on && circulating) {
          car.shedNotCountedMps += his;
          if (car.shedNotCountedMps >= ORACLE_FORCED_SHED_MPS && car.notCountedForcedT === null) {
            car.notCountedForcedT = t;
            if (oracle.notCountedForcedT === null) oracle.notCountedForcedT = t;
          }
        }
        // …OR THERE IS CONTACT.
        if (on && circulating && (oracle.contactT === null || oracle.otherContactT === null)) {
          const profile = traffic.vehicles.find((v) => v.x === real.x && v.y === real.y)?.profile;
          const sep = obbSeparationM(
            {
              x: px,
              y: py,
              headingDeg: tick.headingDeg,
              halfLengthM: PLAYER_HALF_LENGTH_M,
              halfWidthM: PLAYER_HALF_WIDTH_M,
            },
            {
              x: real.x,
              y: real.y,
              headingDeg: (Math.atan2(real.dirX, real.dirY) * 180) / Math.PI,
              halfLengthM: vehicleHalfLengthM(profile),
              halfWidthM: vehicleHalfWidthM(profile),
            },
          );
          if (sep <= 0) {
            const grounds = cur.inP && !cur.cleared;
            if (grounds && oracle.contactT === null) {
              oracle.contactT = t;
              oracle.contactWith = id;
              contactLate = cur.late;
            } else if (!grounds && oracle.otherContactT === null) {
              oracle.otherContactT = t;
              oracle.otherContactWith = id;
            }
            // A touch decided by half a metre of where the car stood.
            if (Math.abs(cur.runM) <= ORACLE_BAND_MOUTH_M) {
              bandWhy.add(`${id} was ${cur.runM.toFixed(2)} m from having passed the mouth at the entry frame and was touched`);
            }
            if (cur.inP && Math.abs(leftM) <= ORACLE_BAND_MOUTH_M) {
              bandWhy.add(`${id} was touched ${leftM.toFixed(2)} m from clearing the mouth`);
            }
          }
        }
      }
    },
  });

  for (const id of ids) {
    const c = cars[id];
    if (!c) continue;
    if (c.inP && c.shedBeforeClearMps > oracle.maxPShedMps) oracle.maxPShedMps = c.shedBeforeClearMps;
    if (c.shedNotCountedMps > oracle.maxNotCountedShedMps) oracle.maxNotCountedShedMps = c.shedNotCountedMps;
    // THE BOUNDARY BAND.
    if (c.inP && Math.abs(c.shedBeforeClearMps - ORACLE_FORCED_SHED_MPS) <= ORACLE_BAND_SHED_MPS) {
      bandWhy.add(`${id} lost ${c.shedBeforeClearMps.toFixed(3)} m/s before clearing the mouth`);
    }
    if (c.inP && c.shedShortOfMouthMps >= ORACLE_FORCED_SHED_MPS !== c.shedPastMouthMps >= ORACLE_FORCED_SHED_MPS) {
      bandWhy.add(`${id} reached the threshold within ${ORACLE_BAND_MOUTH_M} m of the mouth`);
    }
    if (
      c.runAtEntryM !== null &&
      Math.abs(c.runAtEntryM) <= ORACLE_BAND_MOUTH_M &&
      c.shedBeforeClearMps + c.shedNotCountedMps >= ORACLE_FORCED_SHED_MPS - ORACLE_BAND_SHED_MPS
    ) {
      bandWhy.add(`${id} was ${c.runAtEntryM.toFixed(2)} m from having passed the mouth at the entry frame and braked for him`);
    }
    // Round 5 — a membership decided by half a metre of where HE stood: the
    // car joined with his rear end that close to having left the mouth, or
    // missed joining by that much of its own run when he left it.
    if (
      c.hisRunAtJoinM !== null &&
      c.hisRunAtJoinM <= ORACLE_BAND_MOUTH_M &&
      c.shedBeforeClearMps + c.shedNotCountedMps >= ORACLE_FORCED_SHED_MPS - ORACLE_BAND_SHED_MPS
    ) {
      bandWhy.add(`${id} joined the set with his rear end ${c.hisRunAtJoinM.toFixed(2)} m from having left the mouth and braked for him`);
    }
    if (
      c.marginAtCloseM !== null &&
      c.marginAtCloseM <= ORACLE_BAND_MOUTH_M &&
      c.shedBeforeClearMps + c.shedNotCountedMps >= ORACLE_FORCED_SHED_MPS - ORACLE_BAND_SHED_MPS
    ) {
      bandWhy.add(`${id} was ${c.marginAtCloseM.toFixed(2)} m from joining the set when he left the mouth and braked for him`);
    }
    if (
      c.halfLapMarginM !== null &&
      c.halfLapMarginM <= ORACLE_BAND_MOUTH_M &&
      c.shedBeforeClearMps + c.shedNotCountedMps >= ORACLE_FORCED_SHED_MPS - ORACLE_BAND_SHED_MPS
    ) {
      bandWhy.add(`${id} was ${c.halfLapMarginM.toFixed(2)} m from the point half a lap from the mouth at the entry frame and braked for him`);
    }
  }
  oracle.event = oracle.forcedT !== null || oracle.contactT !== null;
  oracle.groundedByLateJoiner =
    oracle.forcedT !== null && oracle.forcedT <= (oracle.contactT ?? Infinity) ? forcedLate : oracle.contactT !== null && contactLate;
  oracle.bandWhy = [...bandWhy];
  oracle.band = oracle.bandWhy.length > 0;
  return {
    out,
    oracle,
    billedT,
    commended: out.commendationCodes.includes("YIELDED_TO_PRIORITY"),
    voicePraisedT,
  };
}
