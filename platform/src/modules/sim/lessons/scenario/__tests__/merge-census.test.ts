/**
 * THE GENERATED MERGE CENSUS — sc-merge-lane-end:0487bcec, round 3.
 *
 * WHY IT EXISTS. Rounds 1 and 2 each repaired the row for its own class and
 * were each refuted on the acceptance bar alone: an adversarial verifier wrote
 * a new SPELLING of the same mistake that changed contact and no test noticed.
 * Round 2's survivors were V14 (the staged layer can arm the pass guard but
 * never disarm it, so on a SECOND station episode its 8 m/s² cap overrides the
 * station's 12) and V12 (the first-pass commands re-fire every frame for a
 * second, restarting the laneShift ramp). Every round the next verifier finds
 * the next spelling. So this file does not enumerate spellings: it drives
 * THOUSANDS of seeded, reproducible student programmes through the real
 * product stack and holds every one of them to an ORACLE written here, from
 * the law and the founder's rulings, that never asks the code under test what
 * it thinks.
 *
 * WHAT IS REAL. The committed ln-merge-v1 / hz-roadworks-v1 districts through
 * createWorldRuntime + createTrafficSystem + the lesson's own compiled
 * stagedEvents under createScenarioDirector, wired with the product's own
 * `wireTrafficQueries` (the exact hookups LessonScene runs), graded by the
 * production rule engine under the lesson's own compiled ruleConfig. The
 * student is kinematic (the hero's 1.95 m/s² ramp; brakes as the programme
 * says; glides across lanes at the programme's lateral rate; may reverse), and
 * a physics contact is reported the way LessonScene reports one for a staged
 * body outside the sentinel's cast: the rising edge of
 * `isContact(playerObb, actorObb)` pushed as `runtime.pushCollision("vehicle")`
 * before the frame's sample(). The director's traffic port is wrapped only to
 * RECORD the commands it sends.
 *
 * THE PROGRAMMES (seeded mulberry32, reproducible by index): a pace (10–58
 * км/ч), then 3–8 moves, each fired by a road position, a clock time, or the
 * through car coming within a chosen window of him (so cut-ins land at every
 * gap, including beside the car): change lane (to either lane, 0–2.5 m off its
 * centre — or, three times in ten, HUGGING THE LINE: 2.6–3.4 m off centre
 * towards it, which leaves his body from 0.3 m clear of the line to 0.5 m over
 * it, round 4's hover — at 0.5–4.5 m/s lateral), change pace, brake-check
 * (2–9 m/s², to a crawl or a stop), or — standing, with the car behind him —
 * reverse. Most drives go into AND out of the through lane more than once, so
 * the pass meets him several times: station, cruise, station again.
 *
 * THE ORACLE (independent — imports no runner, staged or rule code; its three
 * numbers are the law's and the rulings', pinned against the product at the
 * end):
 *
 *   T_R  = 1.0 s   a driver's reaction time (the product's one reaction time,
 *                  AMBER_REACTION_SEC — the C3 ruling's comfortable-stop model)
 *   HARD = 7 m/s²  „brake hard" (the product's own harsh-braking line,
 *                  harshBrakeDecelMps2 — «emergency-grade only; a firm 4–5 m/s²
 *                  stop never fires»)
 *
 *   A_CAR = the brake the lesson's car is STAGED with (read off the stage call
 *                  the runner makes — its declared capability, pinned 12 m/s²)
 *
 *   HIS BODY (round 4, F6b — stated here from the geometry, not borrowed from
 *   the product): the chassis rectangle, PLAYER_HALF_LENGTH_M ×
 *   PLAYER_HALF_WIDTH_M about his position, TURNED TO HIS HEADING. Its four
 *   corners are computed below; a gliding car's front corner crosses a line
 *   before its flank does.
 *
 *   ENTRY. ЗДвП чл. 25, ал. 2 speaks of „навлизане изцяло или ЧАСТИЧНО в
 *   съседна пътна лента": the entry is a frame on which some corner of his
 *   body is over the lane while on the previous frame NONE was, moving
 *   forward. There is NO deadband (round 4, F3/F6b): a body wholly back in the
 *   lane he came from has left the other one, by however little — the law
 *   knows no 35 cm of grace, and round 3's verifier billed nothing for a
 *   student who hovered 23 cm clear of the line for four seconds and then
 *   darted in front of the car.
 *
 *   WHAT IT DEMANDS of the vehicle already in that lane behind him (centre
 *   behind his, centre in the lane): with gap = its nose to his body's
 *   rearmost point and c = its speed minus his, the deceleration it needs
 *   after T_R to shed c before the gap is gone — c²/2(gap − c·T_R). A vehicle
 *   that is NOT CLOSING on him (c ≤ 0 — stopped, slower, or level-pegging) is
 *   forced to do nothing, however close: 0 (round 4, F6a — round 3 called
 *   every gap ≤ 0 „unavoidable", which billed students for entering beside a
 *   parked car). A closing vehicle with no room (gap ≤ 0 or gap ≤ c·T_R): ∞.
 *
 *   O1 LAWFUL IS NEVER STRUCK AND NEVER BILLED. An entry with at least the
 *      follower's stopping distance ahead of it (gap ≥ v·T_R + v²/2·HARD) —
 *      and every entry into an empty lane — is never billed
 *      LANE_ENTRY_FORCED_BRAKING, and the student is never struck from behind
 *      in that lane while he holds it (only a student who REVERSES into the car
 *      makes that contact, and it is his).
 *   O2 THE RULING. An entry demanding more than HARD of the follower is billed
 *      at the entry (founder ruling 2026-09-30, contact or not); one demanding
 *      less than HARD is never billed. (±3 % around HARD is not judged: the
 *      product and this oracle read the same pose on the same frame, and the
 *      band only absorbs float noise.) No bill without an entry. ONE CUT-IN IS
 *      ONE ACT: with no deadband a body riding the line crosses it again and
 *      again in front of the same car, and that car is answering ONE cut-in
 *      for a driver's reaction plus its own hard stop (T_R + v/HARD from the
 *      billed entry, v its speed then) — a forced crossing in front of that
 *      same car inside that time is the same act and is NOT billed again;
 *      after it, or in front of another car, it is a new act.
 *   O3 A CONTACT THE STUDENT CAUSES IS STILL BILLED — reversing into the car,
 *      running into it, or cutting in inside its stopping distance: the first
 *      contact of every drive bills COLLISION. And a contact inside the
 *      follower's react-and-stop time after a forced cut-in reads the cut-in's
 *      copy (detail vehicleCutIn), never the forward-collision one.
 *   O7 EVERY CONTACT IS ACCOUNTED FOR (round 4, F1 — round 3's oracle let a
 *      car that brakes at half its authored force strike fifteen students
 *      after their cut-ins and reported 0 breaches). „The car still brakes and
 *      avoids the crash" (the ruling): a contact is the student's only when
 *        · he was reversing, or
 *        · he moved onto the car — it was ahead of him, or not closing on him
 *          (standing, slower, level-pegging: a side-swipe or a run-in), or
 *        · it struck him from behind after a cut-in so close that even a car
 *          braking at its full declared force A_CAR from REACT_FRAMES after his
 *          body crossed the line, against what he actually did afterwards,
 *          could not have stayed behind him.
 *      ANY OTHER CONTACT IS A BREACH — a car that could have stopped and did
 *      not is the car's failure, and the student was billed for it.
 *   O4 THE CAR NEVER RE-ISSUES ITS FIRST-PASS COMMANDS: one laneShift per
 *      stage, and after the pass starts no command is sent twice in a row.
 *   O5 ITS GUARD IS DISARMED IN STATION and armed in the cruise — read off what
 *      the staged layer published (StagedActorView.passGuardArmed), not off the
 *      commands that were sent.
 *   O6 A PASS WITH NOWHERE TO PASS IS A CAR FOLLOWING YOU: while any of his
 *      body is over the car's lane ahead of it, the pass keeps station.
 *
 * EXPOSURE: the file also counts that each class actually happened, in
 * volume — a census that never cut in beside the car would pass by measuring
 * nothing.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../../runtime";
import { LANE_WIDTH_M } from "../../../world";
import { createTrafficSystem } from "../../../traffic/system";
import { mulberry32 } from "../../../traffic/rng";
import { vehicleHalfLengthM, type StagedCommand, type TrafficDistrict } from "../../../traffic/types";
import { createRuleEngine, reduceTick } from "../../../rules";
import type { ViolationEvent } from "../../../rules/types";
import { createScenarioDirector } from "../../../orchestrator/director";
import { wireTrafficQueries } from "../../../scene/lessonWorldRecipe";
import {
  actorObb,
  isContact,
  obbSeparationM,
  playerObb,
  PLAYER_HALF_LENGTH_M,
  PLAYER_HALF_WIDTH_M,
} from "../../../collision";
import type { RearTailgaterSpec, StagedEventSpec } from "../../../contracts";
import { compileScenario } from "../compile";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { SC_MERGE_LANE_END, SC_MERGE_ROADWORKS_SHIFT } from "../templates-merging";

// ---------------------------------------------------------------------------
// The oracle's own numbers (see the header; pinned against the product below)
// ---------------------------------------------------------------------------

const T_R = 1.0;
const HARD = 7;
/** tan 25° — the most yaw the programmes' lane changes may use */
const MAX_YAW_TAN = Math.tan((25 * Math.PI) / 180);
const BAND = 0.03;
/** O7: the frames between his body crossing the line and the car's brake
 *  biting — the director decides on the frame after traffic moved, and a
 *  command takes effect on the next traffic update. */
const REACT_FRAMES = 2;
/** O7: how far behind his body the best-case car nose must be to count as
 *  „could have stayed behind" — absorbs the per-frame quantisation of both
 *  bodies' positions (a car at 50 км/ч moves 0.46 m a frame). */
const O7_TOL_M = 0.5;

const REPO_ROOT = join(process.cwd(), "..");
const DT = 1 / 30;
/** Lane centres (one one-way 2-lane carriageway on x = 0, drawn lanes 8.125 m). */
const X_ENDING = LANE_WIDTH_M / 2;
const X_THROUGH = -LANE_WIDTH_M / 2;
/** The runner's station law (O6) is a statement about his CENTRE: within half
 *  the drawn lane + his half-width of the lane centre. */
const REACH = LANE_WIDTH_M / 2 + PLAYER_HALF_WIDTH_M;

/** HIS BODY — the four corners of the chassis rectangle turned to his heading
 *  (north = 0°, clockwise), reduced to its extent across (x) and along (y)
 *  the road. Written here; the product's own body arithmetic is not used. */
function bodyBox(x: number, y: number, headingDeg: number): { minX: number; maxX: number; minY: number; maxY: number } {
  const r = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(r);
  const fy = Math.cos(r);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      const cx = x + a * PLAYER_HALF_LENGTH_M * fx + b * PLAYER_HALF_WIDTH_M * fy;
      const cy = y + a * PLAYER_HALF_LENGTH_M * fy - b * PLAYER_HALF_WIDTH_M * fx;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
    }
  }
  return { minX, maxX, minY, maxY };
}
/** Some of his body is over the through lane (x ∈ (−W, 0)) / the ending lane (x ∈ (0, W)). */
const overThrough = (b: { minX: number; maxX: number }) => b.minX < 0 && b.maxX > -LANE_WIDTH_M;
const overEnding = (b: { minX: number; maxX: number }) => b.maxX > 0 && b.minX < LANE_WIDTH_M;

function demanded(gapM: number, closing: number): number {
  if (closing <= 0) return 0; // not catching him: nobody has to brake, however close
  if (gapM <= 0) return Infinity;
  const rem = gapM - closing * T_R;
  return rem <= 0 ? Infinity : (closing * closing) / (2 * rem);
}
const stoppingDistance = (v: number) => v * T_R + (v * v) / (2 * HARD);
/** O2: how long a car is answering one cut-in — a reaction, then its own hard stop. */
const actWindow = (v: number) => T_R + v / HARD;

// ---------------------------------------------------------------------------
// Programmes
// ---------------------------------------------------------------------------

type Trigger =
  | { on: "y"; y: number }
  | { on: "t"; t: number }
  /** car `car` (index into the lesson's through cars, default 0)'s centre is
   *  within [lo, hi] m BEHIND his (negative = ahead) */
  | { on: "car"; lo: number; hi: number; closingMin: number; car?: number };
type Action =
  | { do: "lane"; to: "through" | "ending"; offM: number; glide: number }
  | { do: "pace"; kmh: number }
  | { do: "brake"; kmh: number; decel: number }
  | { do: "reverse"; mps: number; sec: number };
interface Move {
  when: Trigger;
  /** …or this long after the previous move, whichever comes first (so a
   *  window the car never visits cannot stall the rest of the programme) */
  timeoutSec: number;
  act: Action;
}
interface Programme {
  seed: number;
  paceKmh: number;
  moves: Move[];
}

function makeProgramme(seed: number): Programme {
  const r = mulberry32(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const between = (a: number, b: number) => a + (b - a) * r();
  const paceKmh = Math.round(between(10, 58));
  const n = 3 + Math.floor(r() * 6);
  const moves: Move[] = [];
  let lane: "through" | "ending" = "ending";
  let y = 15;
  for (let i = 0; i < n; i++) {
    const kind = r();
    let when: Trigger;
    const w = r();
    // a third of the car windows wait for the car to be COMING PAST him (its
    // speed above his), which is where a cut-in forces it to brake
    if (w < 0.5) when = { on: "car", lo: Math.round(between(-6, 30)), hi: 0, closingMin: r() < 0.35 ? between(1, 5) : -99 };
    else if (w < 0.8) when = { on: "y", y: (y = Math.min(260, y + between(10, 70))) };
    else when = { on: "t", t: between(2, 40) };
    if (when.on === "car") when.hi = when.lo + Math.round(between(2, 12));
    let act: Action;
    if (kind < 0.56) {
      lane = lane === "ending" ? "through" : "ending";
      // three in ten HUG THE LINE (round 4): 2.6–3.4 m off the lane centre
      // towards the other lane — his body from ~0.3 m clear of the line to
      // ~0.5 m over it; the rest keep 0–2.5 m either side of the centre
      const hug = r() < 0.3;
      const towardLine = lane === "ending" ? -1 : 1;
      const offM = hug ? towardLine * between(2.6, 3.4) : between(-2.5, 2.5);
      act = { do: "lane", to: lane, offM: Math.round(offM * 100) / 100, glide: Math.round(between(0.5, 4.5) * 10) / 10 };
    } else if (kind < 0.72) act = { do: "pace", kmh: Math.round(between(8, 58)) };
    else if (kind < 0.9) act = { do: "brake", kmh: pick([0, 0, 5, 12, 20]), decel: Math.round(between(2, 9)) };
    else act = { do: "reverse", mps: Math.round(between(1, 3) * 10) / 10, sec: Math.round(between(1.5, 6) * 10) / 10 };
    moves.push({ when, timeoutSec: Math.round(between(3, 14)), act });
  }
  return { seed, paceKmh, moves };
}

// ---------------------------------------------------------------------------
// One drive
// ---------------------------------------------------------------------------

/** One through car's kinematics on an entry frame. */
interface CarAt {
  id: string;
  x: number;
  y: number;
  v: number;
  /** its speed minus his on the entry frame (+ = catching him) */
  closing: number;
  half: number;
  /** behind him (centre behind his) and in the entered lane (centre in it) */
  behindInLane: boolean;
}
interface Entry {
  t: number;
  lane: "through" | "ending";
  follower: { id: string; gap: number; closing: number; v: number; demand: number } | null;
  /** every through car on the entry frame (O7 replays the best case from here) */
  cars: CarAt[];
  /** the most his body was clear of this lane's line while he was wholly
   *  outside it before this entry (exposure: a hover re-entry has a small one) */
  clearanceBeforeM: number;
  /** a previous entry into this same lane exists in the drive */
  reentry: boolean;
  /** his body is still over that lane — closed when he leaves it */
  open: boolean;
}
interface Contact {
  t: number;
  id: string;
  carBehind: boolean;
  /** the car was moving into him (its speed along the road above his) */
  carClosing: boolean;
  reversing: boolean;
  entry: Entry | null;
}
interface DriveLog {
  label: string;
  entries: Entry[];
  contacts: Contact[];
  forced: ViolationEvent[];
  collisions: ViolationEvent[];
  breaches: string[];
  /** his body's rearmost point along the road, every frame */
  tail: number[];
  /** his pose every frame (O7 replays the car's best case against it) */
  pose: { x: number; y: number; h: number }[];
  /** each through car's profile (its body for O7) */
  profiles: Record<string, RearTailgaterSpec["actor"]["profile"]>;
  /** the brake each through car was STAGED with (its declared capability) */
  carDecel: Record<string, number>;
  /** exposure */
  stationAfterCruise: number;
  /** a second station episode after a second cruise in one pass (V14's ground) */
  secondStation: number;
  farAheadStationFrames: number;
}

const districtCache = new Map<string, TrafficDistrict>();
function districtOf(spec: ScenarioSpec): TrafficDistrict {
  const id = spec.map.districtId!;
  if (!districtCache.has(id)) {
    districtCache.set(id, JSON.parse(readFileSync(join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")));
  }
  return districtCache.get(id)!;
}
function spawnY(spec: ScenarioSpec): number {
  const d = districtOf(spec) as TrafficDistrict & { spawnPoints: { id: string; y: number }[] };
  return d.spawnPoints.find((p) => p.id === spec.start.spawnPointId)!.y;
}

function driveProgramme(spec: ScenarioSpec, level: ScenarioLevel, p: Programme): DriveLog {
  const lesson = compileScenario(spec, level);
  const staged = (lesson.stagedEvents ?? []) as StagedEventSpec[];
  const cars = staged.filter((s): s is RearTailgaterSpec => s.kind === "rearTailgater");
  const raw = districtOf(spec);
  const runtime = createWorldRuntime(raw);
  const traffic = createTrafficSystem(raw, { seed: p.seed % 97, vehicleCount: 0, pedestrianCount: 0 });
  wireTrafficQueries(runtime, traffic);
  const sent = new Map<string, { frame: number; cmd: StagedCommand }[]>();
  for (const c of cars) sent.set(c.id, []);
  let frame = 0;
  const carDecel: Record<string, number> = {};
  const port = {
    stage: (s: Parameters<typeof traffic.stage>[0]) => {
      if (s.kind === "vehicle") carDecel[s.id] = s.decelMps2 ?? NaN;
      return traffic.stage(s);
    },
    staged: (id: string) => traffic.staged(id),
    stagedCommand: (id: string, cmd: StagedCommand) => {
      sent.get(id)?.push({ frame, cmd });
      traffic.stagedCommand(id, cmd);
    },
  };
  const director = createScenarioDirector(staged, port, { seed: p.seed, signals: runtime });
  let rules = createRuleEngine(lesson.ruleConfig);
  const log: DriveLog = {
    label: `${spec.id}@L${level}#${p.seed}`,
    entries: [],
    contacts: [],
    forced: [],
    collisions: [],
    breaches: [],
    tail: [0],
    pose: [{ x: 0, y: 0, h: 0 }],
    profiles: Object.fromEntries(cars.map((c) => [c.id, c.actor.profile])),
    carDecel,
    stationAfterCruise: 0,
    secondStation: 0,
    farAheadStationFrames: 0,
  };
  const seenBreach = new Set<string>();
  /** one line per (rule, actor) per drive — the first frame it happened */
  const breach = (s: string) => {
    const key = s.slice(0, 24);
    if (seenBreach.has(key)) return;
    seenBreach.add(key);
    log.breaches.push(`${log.label} t${(frame * DT).toFixed(2)}: ${s}`);
  };

  let x = X_ENDING;
  let y = spawnY(spec);
  let v = 0; // forward speed ≥ 0, or reverse speed < 0
  let targetX = X_ENDING;
  let glide = 2;
  let targetV = p.paceKmh / 3.6;
  let brake = 3;
  let reverseUntil = -1;
  /** a reverse move waits for standstill, then backs only if a car is behind him in his lane */
  let pendingReverse: { mps: number; sec: number; until: number } | null = null;
  let moveIx = 0;
  let lastMoveT = 0;
  let wasOver = { through: false, ending: true };
  /** the most his body has been clear of each lane since he last left it (a
   *  hover re-entry has a small one) */
  const lastClear = { through: X_ENDING - PLAYER_HALF_WIDTH_M, ending: 0 };
  const touching: Record<string, boolean> = {};
  // O6 bookkeeping: frames the student has been ahead in the car's lane
  const aheadFrames: Record<string, number> = {};
  const passStarted: Record<string, boolean> = {};
  /** the runner resolved (its outcome was published) — the pass is over */
  const resolved: Record<string, boolean> = {};
  const lastLong: Record<string, { type: string; frame: number } | undefined> = {};
  const lastSent: Record<string, string | undefined> = {};
  const laneShifts: Record<string, number> = {};
  const modeHistory: Record<string, string[]> = {};

  for (frame = 1; frame <= 150 * 30 && y < 276; frame++) {
    const t = frame * DT;
    // ---- the programme ------------------------------------------------------
    while (moveIx < p.moves.length) {
      const m = p.moves[moveIx];
      const ref = m.when.on === "car" ? traffic.staged(cars[Math.min(m.when.car ?? 0, cars.length - 1)].id) : null;
      const fire =
        t - lastMoveT >= m.timeoutSec ||
        (m.when.on === "y" && y >= m.when.y) ||
        (m.when.on === "t" && t >= m.when.t) ||
        (m.when.on === "car" &&
          ref !== null &&
          y - ref.y >= m.when.lo &&
          y - ref.y <= m.when.hi &&
          ref.speedMps - v >= m.when.closingMin &&
          t > 3);
      if (!fire) break;
      const a = m.act;
      if (a.do === "lane") {
        targetX = (a.to === "through" ? X_THROUGH : X_ENDING) + a.offM;
        glide = a.glide;
      } else if (a.do === "pace") {
        targetV = a.kmh / 3.6;
        brake = 3;
      } else if (a.do === "brake") {
        targetV = a.kmh / 3.6;
        brake = a.decel;
      } else if (a.do === "reverse") {
        pendingReverse = { mps: a.mps, sec: a.sec, until: t + 8 };
        targetV = 0;
        brake = 6;
      }
      moveIx++;
      lastMoveT = t;
    }
    if (pendingReverse !== null) {
      if (t > pendingReverse.until) {
        pendingReverse = null;
        targetV = p.paceKmh / 3.6;
        brake = 3;
      } else if (Math.abs(v) < 0.05) {
        const behind = cars.some((c) => {
          const s = traffic.staged(c.id);
          return s !== null && y - s.y > 0 && y - s.y < 30 && Math.abs(s.x - x) < REACH;
        });
        if (behind) {
          reverseUntil = t + pendingReverse.sec;
          targetV = -pendingReverse.mps;
        } else {
          targetV = p.paceKmh / 3.6;
          brake = 3;
        }
        pendingReverse = null;
      }
    }
    if (reverseUntil > 0 && t >= reverseUntil) {
      reverseUntil = -1;
      targetV = p.paceKmh / 3.6;
      brake = 3;
    }
    // ---- kinematics ---------------------------------------------------------
    if (v < targetV) v = Math.min(targetV, v + (v < 0 ? brake : 1.95) * DT);
    else if (v > targetV) v = Math.max(targetV, v - (v > 0 ? brake : 1.95) * DT);
    const reversing = v < 0;
    const dy = v * DT;
    // A car moves sideways only by yawing: its lateral rate is capped by its own
    // forward speed (25° of yaw is already a harsh lane change), so a car at
    // rest cannot slide into a lane — and its heading never swings the body
    // round on the spot.
    const gl = Math.min(glide, Math.max(0, v) * MAX_YAW_TAN) * DT;
    const nx = reversing ? x : Math.abs(targetX - x) <= gl ? targetX : x + Math.sign(targetX - x) * gl;
    const headingDeg = !reversing && dy > 1e-6 ? (Math.atan2(nx - x, dy) * 180) / Math.PI : 0;
    x = nx;
    y += dy;

    runtime.update(DT);
    traffic.update(DT, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x, y },
      playerSpeedKmh: Math.abs(v) * 3.6,
      playerHeadingDeg: headingDeg,
    });

    // ---- oracle: entries ----------------------------------------------------
    const body = bodyBox(x, y, headingDeg);
    log.tail[frame] = body.minY;
    log.pose[frame] = { x, y, h: headingDeg };
    const nowOver = { through: overThrough(body), ending: overEnding(body) };
    for (const lane of ["through", "ending"] as const) {
      if (!nowOver[lane]) {
        for (const e of log.entries) if (e.lane === lane) e.open = false;
        const clear = lane === "through" ? body.minX : -body.maxX;
        lastClear[lane] = wasOver[lane] ? clear : Math.max(lastClear[lane], clear);
      }
      if (nowOver[lane] && !wasOver[lane] && !reversing) {
        const laneX = lane === "through" ? X_THROUGH : X_ENDING;
        let best: Entry["follower"] = null;
        const snap: CarAt[] = [];
        for (const c of cars) {
          const a = traffic.staged(c.id);
          if (!a) continue;
          const half = vehicleHalfLengthM(c.actor.profile);
          const behindInLane = y - a.y > 0 && Math.abs(a.x - laneX) < LANE_WIDTH_M / 2;
          snap.push({ id: c.id, x: a.x, y: a.y, v: a.speedMps, closing: a.speedMps - Math.max(0, v), half, behindInLane });
          if (!behindInLane) continue;
          const gap = body.minY - (a.y + half);
          if (best !== null && gap >= best.gap) continue;
          const closing = a.speedMps - Math.max(0, v);
          best = { id: c.id, gap, closing, v: a.speedMps, demand: demanded(gap, closing) };
        }
        log.entries.push({
          t,
          lane,
          follower: best,
          cars: snap,
          open: true,
          clearanceBeforeM: lastClear[lane],
          reentry: log.entries.some((e) => e.lane === lane),
        });
      }
    }
    wasOver = nowOver;

    // ---- oracle: contacts ---------------------------------------------------
    for (const c of cars) {
      const a = traffic.staged(c.id);
      if (!a) continue;
      const now = isContact(obbSeparationM(playerObb(x, y, headingDeg), actorObb(a, c.actor.profile)));
      if (now && !touching[c.id]) {
        const carLaneOpen = [...log.entries].reverse().find((e) => e.lane === "through" && e.open) ?? null;
        log.contacts.push({ t, id: c.id, carBehind: a.y < y, carClosing: a.speedMps > v + 0.05, reversing, entry: carLaneOpen });
        runtime.pushCollision("vehicle");
      }
      touching[c.id] = now;
    }

    // ---- oracle: the car's own promises (O4–O6) -------------------------------
    for (const c of cars) {
      const a = traffic.staged(c.id);
      if (!a) continue;
      const cmds = sent.get(c.id)!;
      for (const s of cmds) {
        if (s.frame !== frame - 1) continue;
        const key = JSON.stringify(s.cmd);
        if (s.cmd.type === "laneShift") {
          laneShifts[c.id] = (laneShifts[c.id] ?? 0) + 1;
          passStarted[c.id] = true;
          if (laneShifts[c.id] > 1) breach(`O4 ${c.id} re-issued its first-pass laneShift (${laneShifts[c.id]}×)`);
        }
        if (passStarted[c.id] && s.cmd.type !== "setIndicator" && s.cmd.type !== "laneShift" && lastSent[c.id] === key) {
          breach(`O4 ${c.id} sent ${key} twice in a row during the pass`);
        }
        if (s.cmd.type !== "setIndicator") lastSent[c.id] = key;
        if (s.cmd.type === "cruise" || s.cmd.type === "matchPlayer") {
          lastLong[c.id] = { type: s.cmd.type, frame: s.frame };
          if (passStarted[c.id] || s.cmd.type === "cruise") {
            const h = (modeHistory[c.id] ??= []);
            if (h[h.length - 1] !== s.cmd.type) h.push(s.cmd.type);
          }
        }
      }
      if (!passStarted[c.id]) continue;
      const mode = lastLong[c.id];
      // O5 — commands issued on frame f take effect on frame f+1's update
      if (mode && frame - mode.frame >= 2) {
        const wantArmed = mode.type === "cruise";
        if (a.passGuardArmed !== wantArmed) {
          breach(`O5 ${c.id} in ${mode.type === "cruise" ? "cruise" : "station"} with passGuardArmed=${String(a.passGuardArmed)}`);
        }
      }
      // O6 — body over the car's lane, centre ahead of its centre
      const aheadInLane = Math.abs(x - a.x) < REACH && y - a.y > 0;
      aheadFrames[c.id] = aheadInLane ? (aheadFrames[c.id] ?? 0) + 1 : 0;
      if (!resolved[c.id] && aheadFrames[c.id] >= 3 && mode && frame - mode.frame >= 1 && mode.type !== "matchPlayer") {
        breach(`O6 ${c.id} kept cruising with the student ahead in its lane (${(y - a.y).toFixed(1)} m)`);
      }
      if (aheadFrames[c.id] >= 3 && y - a.y > 30 && mode?.type === "matchPlayer") log.farAheadStationFrames++;
    }

    if (TRACE_LABEL === log.label) {
      const cs = cars.map((c) => {
        const a = traffic.staged(c.id);
        return a ? `${c.id.slice(-5)}(${a.x.toFixed(2)},${a.y.toFixed(1)},${(a.speedMps * 3.6).toFixed(1)},g${a.passGuardArmed ? 1 : 0},${lastLong[c.id]?.type ?? "-"})` : "";
      });
      traceLines.push(`t${t.toFixed(2)} me(${x.toFixed(2)},${y.toFixed(1)},${(v * 3.6).toFixed(1)},h${headingDeg.toFixed(1)}) ${cs.join(" ")}`);
    }
    // ---- the product's frame ------------------------------------------------
    const tick = runtime.sample(
      {
        position: { x, y },
        headingDeg,
        speedKmh: v * 3.6,
        indicator: "off",
        headlights: "low",
        seatbeltOn: true,
        handbrakeOn: false,
        gear: reversing ? -1 : 3,
        mirrorGlance: null,
      },
      t,
      false,
      false,
      Infinity,
    );
    if (TRACE_LABEL === log.label) {
      for (const e of tick.events) if (e.kind === "laneEntered") traceLines.push(`  laneEntered ${JSON.stringify(e)} edge ${tick.edgeId}`);
    }
    const st = director.step({ tSec: t, dtSec: DT, x, y, speedKmh: v * 3.6, headingDeg, brakePedal: 0, tickEvents: tick.events });
    for (const o of st.outcomes) resolved[o.eventId] = true;
    if (st.events.length > 0) tick.events.push(...st.events);
    const r = reduceTick(rules, tick);
    rules = r.state;
    for (const e of r.events) {
      if (e.kind !== "violation") continue;
      if (e.code === "LANE_ENTRY_FORCED_BRAKING") log.forced.push(e);
      if (e.code === "COLLISION") log.collisions.push(e);
    }
  }
  for (const h of Object.values(modeHistory)) {
    let n = 0;
    for (let i = 1; i < h.length; i++) if (h[i] === "matchPlayer" && h[i - 1] === "cruise") n++;
    log.stationAfterCruise += n;
    if (n >= 2) log.secondStation++;
  }
  return log;
}

// ---------------------------------------------------------------------------
// The verdicts (O1–O3, O7; O4–O6 were recorded as breaches while driving)
// ---------------------------------------------------------------------------

/** O7: could the car that struck him have avoided him — braking at its full
 *  declared force A_CAR from REACT_FRAMES after his body crossed the line,
 *  keeping its lane (it does not swerve: the ruling says it BRAKES), against
 *  his ACTUAL path afterwards (his lateral glide, any brake-check)? The best-
 *  case car is boxed exactly as the contact model boxes the real one, and the
 *  two bodies are tested frame by frame from the entry to the contact. If the
 *  best case never touches him — and keeps at least O7_TOL_M of air — the car
 *  could have avoided him, and a contact is the car's failure. */
function couldHaveStayedBehind(d: DriveLog, c: Contact): { could: boolean; why: string; clearanceM: number } {
  const e = c.entry!;
  const car = e.cars.find((k) => k.id === c.id)!;
  const a = d.carDecel[c.id];
  const f0 = Math.round(e.t / DT);
  const f1 = Math.round(c.t / DT);
  const tr = REACT_FRAMES * DT;
  let closest = Infinity;
  for (let f = f0; f <= f1; f++) {
    const tau = (f - f0) * DT;
    let s = car.v * Math.min(tau, tr);
    if (tau > tr) {
      const tb = Math.min(tau - tr, car.v / a); // it stops, it does not reverse
      s += car.v * tb - 0.5 * a * tb * tb;
    }
    const best = actorObb({ x: car.x, y: car.y + s, dirX: 0, dirY: 1 }, d.profiles[c.id]);
    const me = d.pose[f];
    const sep = obbSeparationM(playerObb(me.x, me.y, me.h), best);
    if (sep < closest) closest = sep;
  }
  return { could: closest > O7_TOL_M, why: `the best-case car comes no closer than ${closest.toFixed(2)} m`, clearanceM: closest };
}

/** Tally helper: the contacts O1/O7 judge — struck from behind by a closing
 *  car that was behind him in the lane when he entered it. */
function o7Applies(c: Contact): boolean {
  if (c.reversing || !c.carBehind || !c.carClosing || c.entry === null) return false;
  return c.entry.cars.some((k) => k.id === c.id && k.behindInLane);
}

function judge(d: DriveLog): string[] {
  const out = [...d.breaches];
  const near = (a: number, b: number) => Math.abs(a - b) <= 1.5 * DT;
  // O2 + O1 (billing) — chronological, with the same-act window per car
  const claimed = new Set<ViolationEvent>();
  const actUntil = new Map<string, number>();
  for (const e of d.entries) {
    const bill = d.forced.find((b) => near(b.t, e.t));
    if (bill) claimed.add(bill);
    const f = e.follower;
    const safe = f === null || f.gap >= stoppingDistance(f.v);
    if (safe && bill) out.push(`${d.label} O1 billed a lawful entry at t${e.t.toFixed(2)} ${JSON.stringify(f)}`);
    if (f === null) continue;
    const forced = f.demand > HARD * (1 + BAND);
    const until = actUntil.get(f.id);
    const sameAct = until !== undefined && e.t <= until + 1e-9;
    const onEdge = until !== undefined && Math.abs(e.t - until) <= 1.5 * DT;
    if (forced && !sameAct && !bill && !onEdge) out.push(`${d.label} O2 forced entry NOT billed at t${e.t.toFixed(2)} ${JSON.stringify(f)}`);
    if (forced && sameAct && bill && !onEdge) out.push(`${d.label} O2 the same cut-in billed twice at t${e.t.toFixed(2)} (act open until t${until!.toFixed(2)}) ${JSON.stringify(f)}`);
    if (f.demand < HARD * (1 - BAND) && bill) out.push(`${d.label} O2 unforced entry billed at t${e.t.toFixed(2)} ${JSON.stringify(f)}`);
    if (bill) actUntil.set(f.id, e.t + actWindow(f.v));
  }
  for (const b of d.forced) if (!claimed.has(b)) out.push(`${d.label} O2 a bill with no entry at t${b.t.toFixed(2)}`);
  // O1 (never struck) and O7 (every contact accounted for)
  for (const c of d.contacts) {
    // His own motion into the car is his contact (O3), not a strike: backing
    // into it, running into a car whose centre is ahead of his, or steering
    // into one that is NOT closing on him at the touch — standing, slower,
    // level-pegging, including a car level with him that braked for his
    // cut-in and is dropping back (round 2 decided — tailgater-pass-guard E4 —
    // that a car already level with him does not brake into his path, and the
    // round-4 census measured what a car that DID keep braking there does: it
    // puts its tail across his path, 7 more contacts on the builder seeds).
    if (c.reversing || !c.carBehind || !c.carClosing) continue;
    const e = c.entry;
    if (e === null) {
      out.push(`${d.label} O7 struck from behind by ${c.id} at t${c.t.toFixed(2)} with no entry into its lane on record`);
      continue;
    }
    const f = e.follower;
    if (f === null || f.gap >= stoppingDistance(f.v)) {
      out.push(`${d.label} O1 struck from behind by ${c.id} at t${c.t.toFixed(2)} after a lawful entry at t${e.t.toFixed(2)} ${JSON.stringify(f)}`);
      continue;
    }
    // O7 — a closing car that struck him from behind after a cut-in must
    // have been unable to avoid him.
    const car = e.cars.find((k) => k.id === c.id);
    if (!car || !car.behindInLane) {
      out.push(`${d.label} O7 struck from behind by ${c.id} at t${c.t.toFixed(2)}, which was not behind him in the lane when he entered it (t${e.t.toFixed(2)})`);
      continue;
    }
    const o7 = couldHaveStayedBehind(d, c);
    if (o7.could) {
      out.push(`${d.label} O7 struck from behind by ${c.id} at t${c.t.toFixed(2)} after the entry at t${e.t.toFixed(2)}, though braking at its declared ${d.carDecel[c.id]} m/s² it could have avoided him (${o7.why}) ${JSON.stringify(f)}`);
    }
  }
  // O3 — the first contact bills; the cut-in copy
  if (d.contacts.length > 0) {
    const c0 = d.contacts[0];
    const bill = d.collisions.find((b) => b.t >= c0.t - 1e-9 && b.t <= c0.t + 2 * DT);
    if (!bill) out.push(`${d.label} O3 the first contact (t${c0.t.toFixed(2)}, ${c0.id}) was not billed`);
    else {
      const throughEntries = d.entries.filter((e) => e.lane === "through" && e.follower !== null && e.t <= c0.t + 1e-9);
      const cutIn = throughEntries.some(
        (e) => e.follower!.demand > HARD * (1 + BAND) && c0.t - e.t <= actWindow(e.follower!.v) - 2 * DT,
      );
      const maybeCutIn = throughEntries.some(
        (e) => e.follower!.demand > HARD * (1 - BAND) && c0.t - e.t <= actWindow(e.follower!.v) + 2 * DT,
      );
      if (cutIn && bill.detail !== "vehicleCutIn") out.push(`${d.label} O3 a cut-in contact read «${bill.titleBg}» (${bill.detail})`);
      if (bill.detail === "vehicleCutIn" && !maybeCutIn) {
        out.push(`${d.label} O3 a contact that followed no forced cut-in read the cut-in copy`);
      }
    }
  }
  return out;
}

interface Tally {
  drives: number;
  entriesWithFollower: number;
  safeEntriesWithFollower: number;
  forcedEntries: number;
  bills: number;
  multiEntryDrives: number;
  contacts: number;
  reverseContacts: number;
  stationAfterCruise: number;
  secondStation: number;
  farAheadStationFrames: number;
  /** round 4: re-entries into the through lane after his body was less than
   *  round 3's 0.35 m deadband clear of the line (the F3 hover class) */
  hoverReentries: number;
  /** …of which the car behind was forced (the hover-and-dart class) */
  hoverForcedReentries: number;
  /** forced crossings inside an open act (billed once, not twice) */
  sameActCrossings: number;
  /** contacts with a CLOSING car that was behind him in the lane when he
   *  entered it — each one checked by O1/O7 */
  o7Checked: number;
  /** touches inside a forced cut-in's act window with a car that was level
   *  with him or not closing at the touch — accounted to him (see judge) */
  cutInSideContacts: number;
}

function runCensus(spec: ScenarioSpec, levels: ScenarioLevel[], perLevel: number, seed0: number) {
  const breaches: string[] = [];
  const tally: Tally = {
    drives: 0,
    entriesWithFollower: 0,
    safeEntriesWithFollower: 0,
    forcedEntries: 0,
    bills: 0,
    multiEntryDrives: 0,
    contacts: 0,
    reverseContacts: 0,
    stationAfterCruise: 0,
    secondStation: 0,
    farAheadStationFrames: 0,
    hoverReentries: 0,
    hoverForcedReentries: 0,
    sameActCrossings: 0,
    o7Checked: 0,
    cutInSideContacts: 0,
  };
  const carDecels = new Set<number>();
  /** O7 diagnostics: the best-case clearance of every checked contact (≤ O7_TOL_M = accounted) */
  const o7Clearances: number[] = [];
  for (const level of levels) {
    for (let i = 0; i < perLevel; i++) {
      const p = makeProgramme(seed0 + level * 100_000 + i);
      const d = driveProgramme(spec, level, p);
      breaches.push(...judge(d));
      if (process.env.MERGE_CENSUS_CONTACTS_OUT) for (const c of d.contacts) contactLines.push(`${d.label} t${c.t.toFixed(2)} ${c.id} behind=${c.carBehind} closing=${c.carClosing} rev=${c.reversing} entry=${c.entry ? c.entry.t.toFixed(2) + " " + JSON.stringify(c.entry.follower) : "-"}`);
      for (const k of Object.values(d.carDecel)) carDecels.add(k);
      tally.drives++;
      const throughEntries = d.entries.filter((e) => e.lane === "through");
      if (throughEntries.length >= 2) tally.multiEntryDrives++;
      const billedUntil = new Map<string, number>();
      for (const e of throughEntries) {
        if (e.reentry && e.clearanceBeforeM < 0.35) {
          tally.hoverReentries++;
          if (e.follower !== null && e.follower.demand > HARD * (1 + BAND)) tally.hoverForcedReentries++;
        }
        if (e.follower === null) continue;
        tally.entriesWithFollower++;
        if (e.follower.gap >= stoppingDistance(e.follower.v)) tally.safeEntriesWithFollower++;
        if (e.follower.demand > HARD * (1 + BAND)) {
          tally.forcedEntries++;
          const u = billedUntil.get(e.follower.id);
          if (u !== undefined && e.t <= u) tally.sameActCrossings++;
          else billedUntil.set(e.follower.id, e.t + actWindow(e.follower.v));
        }
      }
      tally.bills += d.forced.length;
      tally.contacts += d.contacts.length;
      tally.reverseContacts += d.contacts.filter((c) => c.reversing).length;
      tally.o7Checked += d.contacts.filter(
        (c) => o7Applies(c),
      ).length;
      for (const c of d.contacts) {
        if (o7Applies(c)) {
          o7Clearances.push(Math.round(couldHaveStayedBehind(d, c).clearanceM * 100) / 100);
        }
      }
      tally.cutInSideContacts += d.contacts.filter((c) => {
        if (c.reversing || (c.carBehind && c.carClosing) || c.entry === null) return false;
        const f = c.entry.follower;
        return f !== null && f.id === c.id && f.demand > HARD * (1 + BAND) && c.t - c.entry.t <= actWindow(f.v);
      }).length;
      tally.stationAfterCruise += d.stationAfterCruise;
      tally.secondStation += d.secondStation;
      tally.farAheadStationFrames += d.farAheadStationFrames;
    }
  }
  return { breaches, tally, carDecels: [...carDecels], o7Clearances: o7Clearances.sort((a, b) => b - a) };
}

// ---------------------------------------------------------------------------

/** Debug aid: MERGE_CENSUS_TRACE="<label>" writes that drive's frames to
 *  MERGE_CENSUS_TRACE_OUT (nothing is written otherwise). */
const TRACE_LABEL = process.env.MERGE_CENSUS_TRACE ?? "";
const traceLines: string[] = [];
/** …and MERGE_CENSUS_CONTACTS_OUT="<file>" writes every contact with its classification. */
const contactLines: string[] = [];
/** …and MERGE_CENSUS_TALLY_OUT="<file>" writes the exposure tallies (and the
 *  first breaches, if any). */
const tallies: Record<string, unknown> = {};
afterAll(() => {
  if (process.env.MERGE_CENSUS_TALLY_OUT) writeFileSync(process.env.MERGE_CENSUS_TALLY_OUT, JSON.stringify(tallies, null, 1));
  if (process.env.MERGE_CENSUS_CONTACTS_OUT) writeFileSync(process.env.MERGE_CENSUS_CONTACTS_OUT, contactLines.join("\n"));
  if (TRACE_LABEL && process.env.MERGE_CENSUS_TRACE_OUT) writeFileSync(process.env.MERGE_CENSUS_TRACE_OUT, traceLines.join("\n"));
});

const PER_LEVEL_LANE_END = Number(process.env.MERGE_CENSUS_N ?? 300);
const PER_LEVEL_ROADWORKS = Math.ceil(PER_LEVEL_LANE_END / 2);
/** The seed sets: the committed ones by default; a verifier runs fresh ones by
 *  setting these (round 3's verifier used 31,000,000 / 47,000,000). */
const SEED_LANE_END = Number(process.env.MERGE_CENSUS_SEED_LE ?? 7_000_000);
const SEED_ROADWORKS = Number(process.env.MERGE_CENSUS_SEED_RW ?? 9_000_000);

describe("the oracle's numbers are the product's (so a drift in either is a red here, not a silent disagreement)", () => {
  it("T_R is AMBER_REACTION_SEC / LANE_ENTRY_REACTION_SEC, HARD is the default harsh-braking line", async () => {
    const rt = await import("../../../runtime");
    const rules = await import("../../../rules/types");
    expect(rt.AMBER_REACTION_SEC).toBe(T_R);
    expect(rt.LANE_ENTRY_REACTION_SEC).toBe(T_R);
    expect(rules.DEFAULT_RULE_CONFIG.harshBrakeDecelMps2).toBe(HARD);
  });
  it("A_CAR — every through car is staged with the authored 12 m/s² (≥ the hero's own hardest brake, the runner's structural-safety claim)", () => {
    for (const [spec, level] of [
      [SC_MERGE_LANE_END, 1],
      [SC_MERGE_LANE_END, 5],
      [SC_MERGE_ROADWORKS_SHIFT, 1],
    ] as const) {
      const d = driveProgramme(spec, level as ScenarioLevel, { seed: 1, paceKmh: 30, moves: [] });
      const decels = Object.values(d.carDecel);
      expect(decels.length, `${spec.id}@L${level}`).toBe(level === 5 && spec === SC_MERGE_LANE_END ? 2 : 1);
      for (const k of decels) expect(k).toBe(12);
    }
  });
  it("both lessons ARM the rule (the ruling covers the lane-drop lessons)", () => {
    for (const spec of [SC_MERGE_LANE_END, SC_MERGE_ROADWORKS_SHIFT]) {
      for (const level of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
        expect(compileScenario(spec, level).ruleConfig?.laneEntryForcedBrakingEnabled, `${spec.id}@L${level}`).toBe(true);
      }
    }
  });
  it("the programmes are reproducible by index", () => {
    expect(makeProgramme(12345)).toEqual(makeProgramme(12345));
    expect(makeProgramme(12345)).not.toEqual(makeProgramme(12346));
  });
  it("the body is the chassis turned to his heading: straight, the corners are ± the half-extents; yawed, a front corner reaches further across", () => {
    const s = bodyBox(0, 0, 0);
    expect(s.maxX).toBeCloseTo(PLAYER_HALF_WIDTH_M, 9);
    expect(s.maxY).toBeCloseTo(PLAYER_HALF_LENGTH_M, 9);
    const y = bodyBox(0, 0, -20);
    const r = (20 * Math.PI) / 180;
    expect(-y.minX).toBeCloseTo(PLAYER_HALF_WIDTH_M * Math.cos(r) + PLAYER_HALF_LENGTH_M * Math.sin(r), 9);
  });
});

describe("O7 can fail — a contact the car could have avoided is a breach (negative control on a synthetic log)", () => {
  const base = (carV: number, gap: number): DriveLog => {
    const tail = Array.from({ length: 200 }, (_, f) => 100 + 8 * f * DT); // he holds 8 m/s
    const e: Entry = {
      t: 30 * DT,
      lane: "through",
      follower: { id: "car", gap, closing: carV - 8, v: carV, demand: demanded(gap, carV - 8) },
      cars: [{ id: "car", x: X_THROUGH, y: tail[30] - gap - vehicleHalfLengthM(), v: carV, closing: carV - 8, half: vehicleHalfLengthM(), behindInLane: true }],
      clearanceBeforeM: 1,
      reentry: false,
      open: true,
    };
    return {
      label: "synthetic",
      entries: [e],
      contacts: [{ t: 60 * DT, id: "car", carBehind: true, carClosing: true, reversing: false, entry: e }],
      forced: [{ t: 30 * DT } as ViolationEvent],
      collisions: [{ t: 60 * DT, detail: "vehicleCutIn" } as ViolationEvent],
      breaches: [],
      tail,
      // he rides the through lane's centre, nose straight
      pose: tail.map((t) => ({ x: X_THROUGH, y: t + PLAYER_HALF_LENGTH_M, h: 0 })),
      profiles: { car: undefined },
      carDecel: { car: 12 },
      stationAfterCruise: 0,
      secondStation: 0,
      farAheadStationFrames: 0,
    };
  };
  it("closing 6 m/s with 4 m of room: braking at 12 it stays 2.4 m clear — a strike is the car's (breach)", () => {
    expect(judge(base(14, 4)).some((s) => s.includes("O7"))).toBe(true);
  });
  it("closing 6 m/s with 0.5 m of room: no brake keeps it off him — the student's (no breach)", () => {
    expect(judge(base(14, 0.5)).some((s) => s.includes("O7"))).toBe(false);
  });
});

describe(`sc-merge-lane-end L1–L5 — ${PER_LEVEL_LANE_END * 5} generated programmes (seed ${SEED_LANE_END})`, () => {
  const { breaches, tally, o7Clearances } = runCensus(SC_MERGE_LANE_END, [1, 2, 3, 4, 5], PER_LEVEL_LANE_END, SEED_LANE_END);
  tallies[SC_MERGE_LANE_END.id] = { ...tally, breaches: breaches.length, first: breaches.slice(0, 20), o7Clearances };
  it("no programme breaches O1–O7", () => {
    expect(breaches.slice(0, 40)).toEqual([]);
    expect(breaches.length).toBe(0);
  });
  it("…and every class was actually exercised, in volume", () => {
    const k = PER_LEVEL_LANE_END / 300;
    expect(tally.entriesWithFollower, JSON.stringify(tally)).toBeGreaterThan(600 * k);
    expect(tally.safeEntriesWithFollower, JSON.stringify(tally)).toBeGreaterThan(150 * k);
    expect(tally.forcedEntries, JSON.stringify(tally)).toBeGreaterThan(100 * k);
    expect(tally.bills, JSON.stringify(tally)).toBeGreaterThan(100 * k);
    expect(tally.multiEntryDrives, JSON.stringify(tally)).toBeGreaterThan(200 * k);
    expect(tally.stationAfterCruise, JSON.stringify(tally)).toBeGreaterThan(50 * k);
    expect(tally.contacts, JSON.stringify(tally)).toBeGreaterThan(10 * k);
    expect(tally.reverseContacts, JSON.stringify(tally)).toBeGreaterThan(3 * k);
    expect(tally.farAheadStationFrames, JSON.stringify(tally)).toBeGreaterThan(0);
    expect(tally.hoverReentries, JSON.stringify(tally)).toBeGreaterThan(20 * k);
    expect(tally.hoverForcedReentries, JSON.stringify(tally)).toBeGreaterThan(2 * k);
  });
});

describe(`sc-merge-roadworks-shift L1–L5 — ${PER_LEVEL_ROADWORKS * 5} generated programmes (seed ${SEED_ROADWORKS})`, () => {
  const { breaches, tally, o7Clearances } = runCensus(SC_MERGE_ROADWORKS_SHIFT, [1, 2, 3, 4, 5], PER_LEVEL_ROADWORKS, SEED_ROADWORKS);
  tallies[SC_MERGE_ROADWORKS_SHIFT.id] = { ...tally, breaches: breaches.length, first: breaches.slice(0, 20), o7Clearances };
  it("no programme breaches O1–O7", () => {
    expect(breaches.slice(0, 40)).toEqual([]);
    expect(breaches.length).toBe(0);
  });
  it("…and every class was actually exercised", () => {
    const k = PER_LEVEL_ROADWORKS / 150;
    expect(tally.entriesWithFollower, JSON.stringify(tally)).toBeGreaterThan(300 * k);
    expect(tally.forcedEntries, JSON.stringify(tally)).toBeGreaterThan(40 * k);
    expect(tally.stationAfterCruise, JSON.stringify(tally)).toBeGreaterThan(20 * k);
    expect(tally.hoverReentries, JSON.stringify(tally)).toBeGreaterThan(10 * k);
  });
});

describe("ROUND 4 (F3): the round-3 verifier's hover-and-dart drives, through the real stack", () => {
  // manual1.json of the round-3 verification, verbatim: enter lawfully at y 35,
  // come back to hug the line (offM −2.95 / −2.7 off the ending-lane centre),
  // then dart in when the car is a few metres behind and coming past.
  const lane = (to: "through" | "ending", offM: number, glide: number) => ({ do: "lane" as const, to, offM, glide });
  const drives: Programme[] = [
    { seed: 1, paceKmh: 25, moves: [
      { when: { on: "y", y: 35 }, timeoutSec: 99, act: lane("through", 3.2, 1.5) },
      { when: { on: "y", y: 60 }, timeoutSec: 99, act: lane("ending", -2.95, 1.0) },
      { when: { on: "car", lo: 4, hi: 8, closingMin: 2 }, timeoutSec: 99, act: lane("through", 0, 3) } ] },
    { seed: 2, paceKmh: 25, moves: [
      { when: { on: "y", y: 35 }, timeoutSec: 99, act: lane("through", 3.2, 1.5) },
      { when: { on: "y", y: 60 }, timeoutSec: 99, act: lane("ending", -2.95, 1.0) },
      { when: { on: "car", lo: 8, hi: 12, closingMin: 2 }, timeoutSec: 99, act: lane("through", 0, 3) } ] },
    { seed: 3, paceKmh: 25, moves: [
      { when: { on: "y", y: 60 }, timeoutSec: 99, act: lane("ending", -2.95, 1.0) },
      { when: { on: "car", lo: 4, hi: 8, closingMin: 2 }, timeoutSec: 99, act: lane("through", 0, 3) } ] },
    { seed: 4, paceKmh: 25, moves: [
      { when: { on: "y", y: 35 }, timeoutSec: 99, act: lane("through", 3.2, 1.5) },
      { when: { on: "y", y: 60 }, timeoutSec: 99, act: lane("ending", -2.7, 1.0) },
      { when: { on: "car", lo: 4, hi: 8, closingMin: 2 }, timeoutSec: 99, act: lane("through", 0, 3) } ] },
  ];
  const logs = drives.map((p) => driveProgramme(SC_MERGE_LANE_END, 1, p));
  it("the oracle finds no breach in any of them", () => {
    expect(logs.flatMap(judge)).toEqual([]);
  });
  it("drive 1 (entered lawfully, back to 0.25 m clear, darted 4–8 m in front of the car) is billed — round 3 billed nothing", () => {
    const d = logs[0];
    const dart = d.entries.filter((e) => e.lane === "through").pop()!;
    expect(dart.reentry).toBe(true);
    expect(dart.clearanceBeforeM).toBeLessThan(0.35); // inside round 3's deadband
    expect(dart.follower!.demand).toBeGreaterThan(HARD);
    expect(d.forced.map((b) => b.t)).toEqual([dart.t]);
  });
  it("drives 3 and 4 (the dart with no earlier entry, and from 0.5 m clear) are billed too, once each", () => {
    for (const d of [logs[2], logs[3]]) {
      const dart = d.entries.filter((e) => e.lane === "through").pop()!;
      expect(dart.follower!.demand, d.label).toBeGreaterThan(HARD);
      expect(d.forced.map((b) => b.t), d.label).toEqual([dart.t]);
    }
  });
});

describe("ROUND 4 (F5): instruction 4 is true on every rung — «пролуката зад нея е твоята»", () => {
  // The instruction, as a student follows it: hold the dying lane at a pace;
  // when the car beside you is almost level, EASE OFF (by the lesson's own
  // easeKmh 8 — the runner's measure of „yielded" — or more) and let it pass;
  // the moment its tail is ahead of your nose, take the gap behind it with one
  // smooth glide. At L5 the gap behind car 1 is ahead of car 2 — which is the
  // point of L5 — so it must be a gap a lawful merge fits in.
  const instructed = (paceKmh: number, easeKmh: number, marginM: number, glide: number): Programme => ({
    seed: 100 + paceKmh,
    paceKmh,
    moves: [
      { when: { on: "car", lo: -3, hi: 3, closingMin: -99 }, timeoutSec: 99, act: { do: "pace", kmh: easeKmh } },
      { when: { on: "car", lo: -(4.25 + marginM) - 8, hi: -(4.25 + marginM), closingMin: -99 }, timeoutSec: 99, act: { do: "lane", to: "through", offM: 0, glide } },
    ],
  });
  const runs: { level: ScenarioLevel; label: string; d: DriveLog }[] = [];
  for (const level of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
    for (const pace of [20, 25, 30, 35, 40, 45, 50]) {
      for (const ease of [pace - 8, pace - 15]) {
        if (ease < 6) continue;
        for (const margin of [0, 2]) {
          for (const glide of [1.5, 3]) {
            const p = instructed(pace, ease, margin, glide);
            runs.push({ level, label: `L${level} ${pace}→${ease} m${margin} g${glide}`, d: driveProgramme(SC_MERGE_LANE_END, level, p) });
          }
        }
      }
    }
  }
  it("no instruction-following drive is billed LANE_ENTRY_FORCED_BRAKING, on any rung, and the oracle agrees", () => {
    const billed = runs.filter((r) => r.d.forced.length > 0).map((r) => `${r.label}: ${JSON.stringify(r.d.entries.find((e) => e.lane === "through")?.follower)}`);
    expect(billed).toEqual([]);
    expect(runs.flatMap((r) => judge(r.d))).toEqual([]);
  });
  it("…and at L5 the second car is really there: it is behind him in the lane he enters in most of those drives, and the gap he takes is a lawful one", () => {
    const l5 = runs.filter((r) => r.level === 5);
    const withCar2 = l5.filter((r) => {
      const e = r.d.entries.find((x) => x.lane === "through");
      return e?.follower?.id === "sc-mle-through-car-2";
    });
    expect(withCar2.length).toBeGreaterThan(l5.length / 2);
    for (const r of withCar2) {
      const f = r.d.entries.find((x) => x.lane === "through")!.follower!;
      expect(f.demand, r.label).toBeLessThan(HARD);
    }
  });
  it("…and L5 still asks him to JUDGE it: a student who lets car 1 pass, then dawdles until car 2 is on him and cuts in, is billed against car 2", () => {
    const dawdle: Programme = {
      seed: 7,
      paceKmh: 30,
      moves: [
        { when: { on: "car", lo: -3, hi: 3, closingMin: -99 }, timeoutSec: 99, act: { do: "pace", kmh: 22 } },
        { when: { on: "car", car: 1, lo: 4, hi: 9, closingMin: 2 }, timeoutSec: 99, act: { do: "lane", to: "through", offM: 0, glide: 3.5 } },
      ],
    };
    const d = driveProgramme(SC_MERGE_LANE_END, 5, dawdle);
    const e = d.entries.find((x) => x.lane === "through")!;
    expect(e.follower?.id).toBe("sc-mle-through-car-2");
    expect(e.follower!.demand).toBeGreaterThan(HARD);
    expect(d.forced.length).toBe(1);
    expect(judge(d)).toEqual([]);
  });
});
