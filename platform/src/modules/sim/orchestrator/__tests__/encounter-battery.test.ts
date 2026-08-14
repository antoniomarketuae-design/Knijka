/**
 * THE ENCOUNTER BATTERY — lane 7's gate (docs/simulation/86 §9, lane 7).
 *
 * Two invariants over every staged actor the 154-template catalog authors:
 *
 *   1. REACHABILITY. A synthetic drive at the objective chain's MAXIMUM
 *      permitted speed and at HALF of it must both MEET the actor. The
 *      founder's lessons 8/15/17/18 are all one defect: conflict cars were
 *      released on a pure distance gate, so a student driving at the taught
 *      slow speed reached an empty junction — obeying the instruction deleted
 *      the lesson. Lesson 12's twin: a pedestrian drill whose walker never
 *      left the curb because the student crawled under `minTriggerSpeedKmh`,
 *      and which he then PASSED.
 *
 *   2. SIGNALLING. Every lane-shift actor must show its indicator at least
 *      2.5 s before its first lateral metre. Founder lesson 43: he could not
 *      anticipate the merge because the car genuinely never signalled — the
 *      blinker was a cosmetic artefact of yaw rate and a lateral glide has
 *      almost none, so it provably never armed.
 *
 * The stack is REAL: content/world districts through `createTrafficSystem`
 * (ambient counts zeroed, so the staged actor is the only other road user)
 * and the production runners. Only the PLAYER is synthetic — a constant-speed
 * approach along the road axis, which is precisely what "a synthetic drive at
 * speed V" means.
 *
 * Scope note, stated rather than hidden: the census walks `SCENARIO_TEMPLATES`
 * (template-wide `staged` plus every rung's `stagedAdd`). The exam bank
 * (`lessons/examBankData.ts`) is covered by exam-events.test.ts instead.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  CutInLeadCarSpec,
  PedestrianDartOutSpec,
  PriorityFromRightSpec,
  RearTailgaterSpec,
  StagedEventSpec,
} from "../../contracts";
import type { SimTickEvent } from "../../rules";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import type { ScenarioSpec } from "../../lessons/scenario/types";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict, TrafficSystem } from "../../traffic/types";
import {
  CutInLeadCarRunner,
  PedestrianDartOutRunner,
  PriorityFromRightRunner,
  RearTailgaterRunner,
} from "../runners";
import type { DirectorInput, StagedTrafficPort } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const DT = 1 / 30;
const MAX_FRAMES = 150 * 30;
/** The ledger's own gate number: the lamp owes ≥ 2.5 s of warning. */
const REQUIRED_INDICATOR_LEAD_SEC = 2.5;
/** "First lateral metre" — one metre of published sideways travel. */
const FIRST_LATERAL_METRE_M = 1;
/** Chain speed fallback when no success objective authors a cap, km/h. */
const DEFAULT_CHAIN_MAX_KMH = 50;
/** Never drive the half-speed leg slower than this, km/h (it must finish). */
const MIN_PROBE_KMH = 6;
/** The car must still be inside the runtime's conflict band at the arrival. */
const CONFLICT_BAND_M = 30;
/** The taught ease-down of the stop-short probe, m/s² — deliberate, not a slam. */
const TAUGHT_STOP_DECEL_MPS2 = 2;
/** How long the stop-short probe is willing to sit and wait, s. Longer than
 *  any authored walk, so „she never came" is a finding and not a timeout. */
const TAUGHT_STOP_WAIT_SEC = 30;

// ---------------------------------------------------------------------------
// Census
// ---------------------------------------------------------------------------

interface Entry {
  scenarioId: string;
  districtId: string;
  chainMaxKmh: number;
  spec: StagedEventSpec;
}

function objectiveChainMaxKmh(t: ScenarioSpec): number {
  let best = 0;
  for (const o of t.success) {
    const cap = (o.params as unknown as { maxSpeedKmh?: number }).maxSpeedKmh;
    if (typeof cap === "number" && cap > best) best = cap;
  }
  return best > 0 ? best : DEFAULT_CHAIN_MAX_KMH;
}

function census(): Entry[] {
  const out: Entry[] = [];
  for (const t of SCENARIO_TEMPLATES as ScenarioSpec[]) {
    const chainMaxKmh = objectiveChainMaxKmh(t);
    const seen = new Set<string>();
    const all: StagedEventSpec[] = [
      ...(t.staged ?? []),
      ...t.levels.flatMap((l) => l.stagedAdd ?? []),
    ];
    for (const s of all) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({ scenarioId: t.id, districtId: t.map.districtId, chainMaxKmh, spec: s });
    }
  }
  return out;
}

const ENTRIES = census();
const of = <T extends StagedEventSpec>(kind: T["kind"]): Entry[] =>
  ENTRIES.filter((e) => e.spec.kind === kind);

// ---------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------

const districtCache = new Map<string, TrafficDistrict>();

function district(id: string): TrafficDistrict {
  const hit = districtCache.get(id);
  if (hit) return hit;
  const raw = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as TrafficDistrict;
  districtCache.set(id, raw);
  return raw;
}

/** A fresh system per probe — `stage()` is one-shot per actor id. */
function trafficFor(id: string): TrafficSystem {
  return createTrafficSystem(district(id), { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
}

/** Fixed jitter draw: every probe replays bit-identically. */
const rng = () => 0.5;

function bearingDeg(dx: number, dy: number): number {
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

function input(t: number, x: number, y: number, speedKmh: number, headingDeg: number): DirectorInput {
  return { tSec: t, dtSec: DT, x, y, speedKmh, headingDeg, brakePedal: 0, tickEvents: [] };
}

function advanceTraffic(tr: TrafficSystem, x: number, y: number, speedKmh: number, headingDeg: number): void {
  tr.update(DT, {
    signalPhase: () => "green",
    playerPos: { x, y },
    playerSpeedKmh: speedKmh,
    playerHeadingDeg: headingDeg,
  });
}

// ---------------------------------------------------------------------------
// 1. SIGNALLING — every lane-shift actor owes ≥ 2.5 s of blinker (L6)
// ---------------------------------------------------------------------------

interface LateralProbe {
  indicatorAtSec: number | null;
  firstMetreAtSec: number | null;
  indicatorSide: string | null;
  shiftM: number;
}

/**
 * Drive the player along the ROAD AXIS, re-read from the actor's own published
 * heading each frame, so the probe tracks a curving street instead of flying
 * off a straight tangent.
 */
function probeLateral(
  e: Entry,
  build: (spec: StagedEventSpec) => {
    runner: { stage: (t: StagedTrafficPort, r: () => number, f: boolean) => void; step: (t: StagedTrafficPort, i: DirectorInput, o: SimTickEvent[]) => unknown };
    id: string;
    shiftM: number;
    /** Player start offset ALONG the road from the actor's hold, m
     *  (negative = behind the actor). */
    startAlongM: number;
    /**
     * Player start offset ACROSS the road from the actor's path, m (positive =
     * to the RIGHT of the actor's travel direction). Default 0.
     *
     * B73 — why this exists. The probe used to put the player in the actor's
     * OWN lane for every kind. For a cut-in that is not the drill: the whole
     * encounter is a car in the ADJACENT lane moving into yours. Worse, it is
     * not even physical — `staged.ts`'s playerGuard clamps an actor whose
     * player is within GUARD_AHEAD_M 16 and GUARD_LATERAL_M 3.0, so a
     * same-lane probe pins the cutter ~16 m BEHIND the player forever and the
     * "lane change" it then measures is a sideways glide into empty road,
     * behind the driver's shoulder, which is exactly the defect the founder
     * reported in lesson 43. Offsetting the player by the cut distance
     * reproduces the real geometry: two lanes, the cutter pacing ahead-left,
     * the merge landing in front of the windscreen where it can be seen.
     */
    startAcrossM?: number;
    speedKmh: number;
    /** Seconds of authored choreography before the lateral move fires. */
    choreographySec: number;
  },
  speedKmh: number,
): LateralProbe {
  const built = build(e.spec);
  const tr = trafficFor(e.districtId);
  built.runner.stage(tr, rng, true);
  const hold = tr.staged(built.id);
  if (!hold) throw new Error(`${e.scenarioId}/${built.id}: failed to stage`);

  // Right normal of the actor's travel direction is (dirY, −dirX).
  const across = built.startAcrossM ?? 0;
  let px = hold.x + hold.dirX * built.startAlongM + hold.dirY * across;
  let py = hold.y + hold.dirY * built.startAlongM - hold.dirX * across;
  const mps = speedKmh / 3.6;
  const out: SimTickEvent[] = [];
  let t = 0;
  const probe: LateralProbe = {
    indicatorAtSec: null,
    firstMetreAtSec: null,
    indicatorSide: null,
    shiftM: built.shiftM,
  };

  for (let i = 0; i < MAX_FRAMES; i++) {
    const view = tr.staged(built.id)!;
    const headingDeg = bearingDeg(view.dirX, view.dirY);
    t += DT;
    px += view.dirX * mps * DT;
    py += view.dirY * mps * DT;
    advanceTraffic(tr, px, py, speedKmh, headingDeg);
    built.runner.step(tr, input(t, px, py, speedKmh, headingDeg), out);
    const after = tr.staged(built.id)!;
    if (probe.indicatorAtSec === null && after.indicator !== undefined && after.indicator !== "off") {
      probe.indicatorAtSec = t;
      probe.indicatorSide = after.indicator;
    }
    if (
      probe.firstMetreAtSec === null &&
      Math.abs(after.lateralOffsetM ?? 0) >= FIRST_LATERAL_METRE_M
    ) {
      probe.firstMetreAtSec = t;
      break;
    }
  }
  return probe;
}

/**
 * Some actors are CLOCKED (the tailgater sits on the player for `pressureSec`
 * before it passes) and some maps are short, so one fixed probe speed can run
 * the actor out of road before its manoeuvre ever fires — which would report
 * "no signal" for a car that never shifted. Walk a descending speed ladder and
 * take the first drive on which the lateral move actually happens; the
 * assertion then has something real to measure. `usedKmh` is reported so a
 * genuine failure is legible.
 */
const SPEED_LADDER = [1, 0.7, 0.5, 0.35, 0.22, 0.14];

function probeLateralAdaptive(
  e: Entry,
  build: Parameters<typeof probeLateral>[1],
): LateralProbe & { usedKmh: number } {
  const base = build(e.spec).speedKmh;
  let last: LateralProbe = { indicatorAtSec: null, firstMetreAtSec: null, indicatorSide: null, shiftM: 0 };
  let usedKmh = base;
  for (const f of SPEED_LADDER) {
    usedKmh = Math.max(8, base * f);
    last = probeLateral(e, build, usedKmh);
    if (last.firstMetreAtSec !== null) break;
  }
  return { ...last, usedKmh };
}

/** Lane-shift actors that owe nothing: a zero shift is not a lane change. */
function owesASignal(spec: StagedEventSpec): boolean {
  if (spec.kind === "cutInLeadCar") return (spec as CutInLeadCarSpec).cutShiftM !== 0;
  if (spec.kind === "rearTailgater") return (spec as RearTailgaterSpec).passShiftM !== 0;
  return false;
}

describe("encounter battery · SIGNALLING — no silent lane change (ledger L6)", () => {
  const cutIns = of<CutInLeadCarSpec>("cutInLeadCar").filter((e) => owesASignal(e.spec));
  const tailgaters = of<RearTailgaterSpec>("rearTailgater").filter((e) => owesASignal(e.spec));

  it("the catalog really does stage lane-shift actors (census guard)", () => {
    // If a refactor stops the census from finding them, the two suites below
    // would pass vacuously. Pin the shape of the population instead.
    expect(cutIns.length + tailgaters.length).toBeGreaterThanOrEqual(8);
  });

  for (const e of cutIns) {
    const s = e.spec as CutInLeadCarSpec;
    it(`${e.scenarioId}/${s.id}: cut-in blinker ≥ ${REQUIRED_INDICATOR_LEAD_SEC}s before the first lateral metre`, () => {
      const r = probeLateralAdaptive(e, (spec) => {
        const c = spec as CutInLeadCarSpec;
        return {
          runner: new CutInLeadCarRunner(c),
          id: c.id,
          shiftM: c.cutShiftM,
          startAlongM: -c.paceAheadM,
          // The player is one lane over — the lane the cutter cuts INTO.
          startAcrossM: c.cutShiftM,
          speedKmh: Math.max(c.minCutSpeedKmh + 8, 30),
          // The cut is distance-triggered, not clocked: a few seconds of
          // approach is all the budget it needs.
          choreographySec: 8,
        };
      });
      expect(r.firstMetreAtSec, `the cut never executed at any probe speed (last ${r.usedKmh.toFixed(0)} km/h)`).not.toBeNull();
      expect(r.indicatorAtSec, "the lamp never came on").not.toBeNull();
      expect(r.firstMetreAtSec! - r.indicatorAtSec!).toBeGreaterThanOrEqual(
        REQUIRED_INDICATOR_LEAD_SEC,
      );
      // …and it signals the way it is actually going.
      expect(r.indicatorSide).toBe(s.cutShiftM > 0 ? "right" : "left");
    });
  }

  for (const e of tailgaters) {
    const s = e.spec as RearTailgaterSpec;
    it(`${e.scenarioId}/${s.id}: pass blinker ≥ ${REQUIRED_INDICATOR_LEAD_SEC}s before the first lateral metre`, () => {
      const r = probeLateralAdaptive(e, (spec) => {
        const g = spec as RearTailgaterSpec;
        return {
          runner: new RearTailgaterRunner(g),
          id: g.id,
          shiftM: g.passShiftM,
          // The tailgater holds BEHIND the player: start the player ahead of it.
          startAlongM: g.releaseGapM + 6,
          // Below the actor's own match ceiling, so it can genuinely close in.
          speedKmh: Math.min(Math.max(g.actor.cruiseSpeedMps * 3.6 * 0.8, 25), g.maxMatchSpeedMps * 3.6 * 0.7),
          // The pass is CLOCKED: releaseGap closure + pressureSec of лепка.
          choreographySec: g.pressureSec + 6,
        };
      });
      expect(r.firstMetreAtSec, `the pass never executed at any probe speed (last ${r.usedKmh.toFixed(0)} km/h)`).not.toBeNull();
      expect(r.indicatorAtSec, "the lamp never came on").not.toBeNull();
      expect(r.firstMetreAtSec! - r.indicatorAtSec!).toBeGreaterThanOrEqual(
        REQUIRED_INDICATOR_LEAD_SEC,
      );
      expect(r.indicatorSide).toBe(s.passShiftM > 0 ? "right" : "left");
    });
  }
});

// ---------------------------------------------------------------------------
// 2. REACHABILITY — the actor must be MET at full pace and at half (L7 / L8)
// ---------------------------------------------------------------------------

interface DartProbe {
  released: boolean;
  onRoadWhileApproaching: boolean;
  detail: string | null;
  /**
   * The walker's own walk position AT THE MOMENT the player reaches the
   * crossing, m — the pedestrian twin of `PriorityProbe.arcAtArrivalM`, and
   * the measurement whose ABSENCE let the sc-zebra-approach defect ship.
   * `onRoadWhileApproaching` only asks whether she was ever on the tarmac
   * within 45 m of an approaching car; a walker who steps out at 55 m, crosses
   * the whole carriageway and is standing on the far pavement by the time a
   * slow car arrives satisfies it perfectly. Inside `[roadFromM, roadToM]`
   * here is the thing the lesson actually needs. `NaN` = the player never
   * reached the crossing (the stop-short drives below never do).
   */
  sAtArrivalM: number;
  /** Was she on the carriageway while the player sat at a full standstill? */
  onRoadWhileStopped: boolean;
  /** Where the player came to rest, m short of the crossing (`NaN` = rolled). */
  restedAtM: number;
}

/**
 * `stopShortM`: drive the TAUGHT approach instead of a constant one — ease off
 * and come to a full stop this many metres before the crossing, then wait.
 * That is instruction 3 of the zebra briefing verbatim („намали плавно и спри
 * напълно на няколко метра преди нея"), and it is the drive the founder made
 * when he photographed a stopped car in front of a bare zebra.
 */
function probeDart(e: Entry, speedKmh: number, stopShortM?: number): DartProbe {
  const s = e.spec as PedestrianDartOutSpec;
  const tr = trafficFor(e.districtId);
  const runner = new PedestrianDartOutRunner(s);
  runner.stage(tr, rng, true);

  // The walk axis crosses the road, so the ROAD axis is its perpendicular.
  const wn = Math.hypot(s.dir.x, s.dir.y) || 1;
  const ax = s.dir.y / wn;
  const ay = -s.dir.x / wn;
  const startBackM = Math.max(70, s.triggerDistM + 30);
  let px = s.crossing.x - ax * startBackM;
  let py = s.crossing.y - ay * startBackM;
  const headingDeg = bearingDeg(ax, ay);
  const out: SimTickEvent[] = [];
  let t = 0;
  let v = speedKmh / 3.6;
  let waitedSec = 0;
  const probe: DartProbe = {
    released: false,
    onRoadWhileApproaching: false,
    detail: null,
    sAtArrivalM: NaN,
    onRoadWhileStopped: false,
    restedAtM: NaN,
  };

  for (let i = 0; i < MAX_FRAMES; i++) {
    // Signed distance still to run to the crossing along the road axis.
    const ahead = (s.crossing.x - px) * ax + (s.crossing.y - py) * ay;
    if (stopShortM !== undefined) {
      // A comfortable, entirely ordinary stop: brake late enough to be a
      // deliberate ease-down, never a slam.
      const toRest = ahead - stopShortM;
      const brakeFromM = (v * v) / (2 * TAUGHT_STOP_DECEL_MPS2);
      if (toRest <= brakeFromM) v = Math.max(0, v - TAUGHT_STOP_DECEL_MPS2 * DT);
      if (v <= 0.05) {
        v = 0;
        if (Number.isNaN(probe.restedAtM)) probe.restedAtM = ahead;
        waitedSec += DT;
      }
    }
    t += DT;
    px += ax * v * DT;
    py += ay * v * DT;
    const nowKmh = v * 3.6;
    advanceTraffic(tr, px, py, nowKmh, headingDeg);
    const outcome = runner.step(tr, input(t, px, py, nowKmh, headingDeg), out);
    if (outcome) probe.detail = outcome.detail;
    const actor = tr.staged(s.id);
    if (actor && actor.s > 0.05) probe.released = true;
    const d = Math.hypot(px - s.crossing.x, py - s.crossing.y);
    const onRoad = !!actor && actor.s >= s.roadFromM && actor.s <= s.roadToM;
    if (onRoad && d <= 45) probe.onRoadWhileApproaching = true;
    if (onRoad && v === 0) probe.onRoadWhileStopped = true;
    // The arrival snapshot: the first frame the crossing is under the axle.
    const nowAhead = (s.crossing.x - px) * ax + (s.crossing.y - py) * ay;
    if (Number.isNaN(probe.sAtArrivalM) && nowAhead <= 0) {
      probe.sAtArrivalM = actor ? actor.s : NaN;
    }
    // Stop once the player has driven a car length past the crossing — or,
    // on a stop-short drive, once the wait has outlasted the whole walk.
    if (-nowAhead > 5) break;
    if (waitedSec > TAUGHT_STOP_WAIT_SEC) break;
  }
  return probe;
}

describe("encounter battery · REACHABILITY — the pedestrian always steps out (ledger L8)", () => {
  const all = of<PedestrianDartOutSpec>("pedestrianDartOut");
  // Ambient figures are scenery with a teaching job — the children on the
  // pavement outside the school that make a driver slow down. They are graded
  // by the OPPOSITE invariant, below.
  const darts = all.filter((e) => !(e.spec as PedestrianDartOutSpec).ambient);
  const ambient = all.filter((e) => (e.spec as PedestrianDartOutSpec).ambient);

  it("the catalog really does stage dart-out walkers (census guard)", () => {
    expect(darts.length).toBeGreaterThanOrEqual(10);
  });

  for (const e of darts) {
    const s = e.spec as PedestrianDartOutSpec;
    const full = Math.max(e.chainMaxKmh, MIN_PROBE_KMH);
    const half = Math.max(e.chainMaxKmh / 2, MIN_PROBE_KMH);
    it(`${e.scenarioId}/${s.id}: met at ${full.toFixed(0)} km/h AND at ${half.toFixed(0)} km/h`, () => {
      for (const v of [full, half]) {
        const r = probeDart(e, v);
        expect(r.released, `${v.toFixed(0)} km/h: she never left the curb`).toBe(true);
        expect(
          r.onRoadWhileApproaching,
          `${v.toFixed(0)} km/h: she never reached the carriageway while the player was approaching`,
        ).toBe(true);
        expect(r.detail, `${v.toFixed(0)} km/h: the encounter was cancelled`).not.toBe(
          "notEncountered",
        );
      }
    });
  }

  // The exemption is earned, not granted. An ambient walker is excused from
  // REACHABILITY only because this proves the stronger thing: it can never
  // reach the carriageway AT ANY SPEED. Mark a genuine hazard `ambient` to
  // quieten the assertions above and this one fails in its place.
  for (const e of ambient) {
    const s = e.spec as PedestrianDartOutSpec;
    const speeds = [
      Math.max(e.chainMaxKmh, MIN_PROBE_KMH),
      Math.max(e.chainMaxKmh / 2, MIN_PROBE_KMH),
      MIN_PROBE_KMH,
    ];
    it(`${e.scenarioId}/${s.id}: AMBIENT — never reaches the carriageway at any speed`, () => {
      for (const v of speeds) {
        expect(
          probeDart(e, v).onRoadWhileApproaching,
          `${v.toFixed(0)} km/h: an ambient figure stepped onto the road — it is a hazard, ` +
            `so drop \`ambient\` and let the reachability battery grade it`,
        ).toBe(false);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 2b. ETA SYNC — obeying the briefing must not delete the encounter
// ---------------------------------------------------------------------------

/**
 * The hole invariant 1 left open, and the reason it stayed open for so long.
 *
 * REACHABILITY above asks whether the walker ever stood on the tarmac while an
 * approaching car was within 45 m. That is satisfied by a walker who steps off
 * the kerb at 55 m, crosses the whole carriageway in 12.8 s and is standing on
 * the far pavement by the time a 14 km/h car arrives — which is exactly the
 * sc-zebra-approach defect the founder photographed: stopped at 0 км/ч in
 * front of an empty zebra, praised by the coach card for yielding to nobody.
 * The priority-car half of the same battery has always measured the right
 * thing (`arcAtArrivalM` — where the conflict car is WHEN THE PLAYER GETS
 * THERE); the pedestrian half never did.
 *
 * These are the two drives that catch it: the walk position at arrival across
 * the whole permitted speed band, and the taught ease-down-and-wait.
 */
describe("encounter battery · ETA SYNC — she is still crossing when you get there", () => {
  const synced = of<PedestrianDartOutSpec>("pedestrianDartOut").filter(
    (e) => (e.spec as PedestrianDartOutSpec).triggerEtaSec !== undefined,
  );

  it("the catalog really does author ETA-synced walkers (census guard)", () => {
    expect(synced.length).toBeGreaterThanOrEqual(1);
  });

  for (const e of synced) {
    const s = e.spec as PedestrianDartOutSpec;
    const eta = s.triggerEtaSec as number;
    // Below this the seconds bind; above it the authored metres still do.
    const crossoverKmh = (s.triggerDistM / eta) * 3.6;
    const floorKmh = s.minTriggerSpeedKmh;
    const speeds = [
      Math.max(e.chainMaxKmh, floorKmh),
      Math.max(e.chainMaxKmh / 2, floorKmh),
      floorKmh,
    ];

    it(`${e.scenarioId}/${s.id}: ON THE CARRIAGEWAY at arrival at ${speeds.map((v) => v.toFixed(0)).join(" / ")} km/h`, () => {
      for (const v of speeds) {
        const r = probeDart(e, v);
        expect(r.released, `${v.toFixed(0)} km/h: she never left the curb`).toBe(true);
        expect(
          Number.isNaN(r.sAtArrivalM),
          `${v.toFixed(0)} km/h: the probe never reached the crossing`,
        ).toBe(false);
        expect(
          r.sAtArrivalM,
          `${v.toFixed(0)} km/h: she was ${r.sAtArrivalM.toFixed(2)} m along her walk when the ` +
            `car reached the paint — the roadway is [${s.roadFromM}, ${s.roadToM}], so the ` +
            `student arrived at a BARE crossing and the lesson had nothing to teach`,
        ).toBeGreaterThanOrEqual(s.roadFromM);
        expect(r.sAtArrivalM).toBeLessThanOrEqual(s.roadToM);
      }
    });

    it(`${e.scenarioId}/${s.id}: below ${crossoverKmh.toFixed(1)} km/h the meeting point is SPEED-INVARIANT`, () => {
      // The whole point of the field: under the crossover the release is a
      // clock, so she is at `speedMps × triggerEtaSec` when the car arrives no
      // matter how slowly it came. Tolerance is frame quantisation only (the
      // battery's rng draw is fixed, so the ±3 m trigger jitter is zero).
      const want = s.speedMps * eta;
      for (const v of [floorKmh, (floorKmh + crossoverKmh) / 2, crossoverKmh - 1]) {
        if (v < floorKmh) continue;
        const r = probeDart(e, v);
        expect(
          Math.abs(r.sAtArrivalM - want),
          `${v.toFixed(1)} km/h: met her at ${r.sAtArrivalM.toFixed(2)} m, wanted ${want.toFixed(2)} m`,
        ).toBeLessThanOrEqual(0.5);
      }
    });

    it(`${e.scenarioId}/${s.id}: the TAUGHT drive — ease down, stop short, wait — meets her`, () => {
      // Stops at „няколко метра" and at the furthest halt the spec's own
      // numbers promise to cover — computed from the AUTHORED floor and
      // horizon, never from `dartFloorReleaseM`, so that neutering the runner
      // cannot quietly move this test's goalposts with it. The approach speeds
      // bracket the floor: one ordinary, one BELOW it (the crawl that used to
      // suppress her outright).
      const reach = (floorKmh / 3.6) * eta;
      for (const stopShortM of [3, 8, Math.max(3, reach - 3)]) {
        for (const approachKmh of [Math.max(e.chainMaxKmh, floorKmh), floorKmh * 0.8]) {
          const r = probeDart(e, approachKmh, stopShortM);
          expect(
            Number.isNaN(r.restedAtM),
            `${approachKmh.toFixed(1)} km/h: the probe never came to rest`,
          ).toBe(false);
          expect(
            r.onRoadWhileStopped,
            `approached at ${approachKmh.toFixed(1)} km/h and stopped ${r.restedAtM.toFixed(1)} m ` +
              `short of the crossing: she was NEVER on the carriageway while the car stood ` +
              `there. This is the founder's photograph — a student who obeys „намали плавно и ` +
              `спри напълно" waits in front of an empty zebra`,
          ).toBe(true);
          expect(r.detail, "the encounter was cancelled").not.toBe("notEncountered");
        }
      }
    });
  }
});

interface PriorityProbe {
  released: boolean;
  metUncleared: boolean;
  /**
   * The car's signed arc past the junction node AT THE MOMENT the player
   * reaches their stop line, m. This single snapshot is the whole L7
   * measurement: `< 0` = still coming, `0…30` = in the box or leaving it,
   * `> 30` = GONE — the founder arrived at an empty junction because he obeyed
   * «приближи бавно». `+Infinity` = it had already finished its whole path.
   */
  arcAtArrivalM: number;
}

function probePriority(e: Entry, speedKmh: number): PriorityProbe {
  const s = e.spec as PriorityFromRightSpec;
  const tr = trafficFor(e.districtId);
  const runner = new PriorityFromRightRunner(s);
  runner.stage(tr, rng, true);
  const hold = tr.staged(s.id);
  if (!hold) throw new Error(`${e.scenarioId}/${s.id}: failed to stage`);

  // NOTE: `staged()` hands back a LIVE view object with stable identity, so
  // every scalar the probe wants to compare against must be copied out now.
  const holdS = hold.s;
  // Approach on an arm PERPENDICULAR to the conflict car's own travel, so the
  // probe drives a crossing arm and never shares the actor's lane.
  const ax = hold.dirY;
  const ay = -hold.dirX;
  const startBackM = Math.max(s.armDistM + 25, 90);
  let px = s.junction.x - ax * startBackM;
  let py = s.junction.y - ay * startBackM;
  const headingDeg = bearingDeg(ax, ay);
  const mps = speedKmh / 3.6;
  const out: SimTickEvent[] = [];
  let t = 0;
  const probe: PriorityProbe = { released: false, metUncleared: false, arcAtArrivalM: NaN };
  let stopped = false;

  for (let i = 0; i < MAX_FRAMES; i++) {
    const d = Math.hypot(px - s.junction.x, py - s.junction.y);
    const playerLineDist = Math.max(0, d - s.lineDistM);
    // The taught drive: approach at the probe speed and STOP at the stop line
    // («приближи бавно», «спри и пропусни»), then wait.
    if (playerLineDist <= 0.5) stopped = true;
    const v = stopped ? 0 : speedKmh;
    t += DT;
    if (!stopped) {
      px += ax * mps * DT;
      py += ay * mps * DT;
    }
    advanceTraffic(tr, px, py, v, headingDeg);
    runner.step(tr, input(t, px, py, v, headingDeg), out);
    const actor = tr.staged(s.id)!;
    const carArc = actor.s - actor.nodeS[s.junctionNodeIndex];
    if (actor.s > holdS + 0.05) probe.released = true;
    if (playerLineDist <= 1 && Number.isNaN(probe.arcAtArrivalM)) {
      probe.arcAtArrivalM = actor.finished ? Infinity : carArc;
      probe.metUncleared = probe.arcAtArrivalM <= CONFLICT_BAND_M;
    }
    // The conflict is over once the car is well clear AND the player waited.
    if (stopped && carArc > CONFLICT_BAND_M + 10) break;
  }
  return probe;
}

describe("encounter battery · REACHABILITY — the conflict car is still there (ledger L7)", () => {
  const priorities = of<PriorityFromRightSpec>("priorityFromRight");

  it("the catalog really does stage priority conflicts (census guard)", () => {
    expect(priorities.length).toBeGreaterThanOrEqual(10);
  });

  for (const e of priorities) {
    const s = e.spec as PriorityFromRightSpec;
    const full = Math.max(e.chainMaxKmh, MIN_PROBE_KMH);
    const half = Math.max(e.chainMaxKmh / 2, MIN_PROBE_KMH);
    it(`${e.scenarioId}/${s.id}: uncleared at the line at ${full.toFixed(0)} km/h AND ${half.toFixed(0)} km/h`, () => {
      for (const v of [full, half]) {
        const r = probePriority(e, v);
        expect(r.released, `${v.toFixed(0)} km/h: the car never moved`).toBe(true);
        expect(
          r.metUncleared,
          `${v.toFixed(0)} km/h: the car was ${r.arcAtArrivalM.toFixed(1)} m past the node when ` +
            `the player reached the stop line — past ${CONFLICT_BAND_M} m it is GONE, and ` +
            `obeying «приближи бавно» deleted the lesson`,
        ).toBe(true);
      }
    });
  }
});
