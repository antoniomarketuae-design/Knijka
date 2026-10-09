/**
 * THE RETURN IN FRONT OF AN OVERTAKEN VEHICLE, MEASURED ON THE VEHICLE'S OWN
 * ACCOUNT — `CutInLeadCarRunner.stepOvertakeWatch`, rounds 2–3 of
 * sc-ac-wind-truck-pass:ff1d4290.
 *
 * ROUND 2's FINDING (round-1 verifier, F-01): a return 3.0–6.5 m ahead of the
 * truck was credited a second later by the gap its own braking opened. Round 2
 * watched the truck's account — and answered «clear» on the frame the car's
 * centre crossed the lane line.
 *
 * ROUND 3's FINDING (round-2 verifier, F2-01): THAT WAS THE WRONG FRAME. A car
 * slower than the truck crossed the line 10.9 m ahead — «clear», credited,
 * praised — and 0.6–1.6 s later, with the lane change still under way, the
 * truck's guard met it and braked from 40 to 28.6 км/ч at 8 m/s². The watch had
 * watched zero frames. And the line it did draw billed the benign side (F2-02):
 * a car pulling away at +10 км/ч, 9 m ahead, touched the guard for 50 ms, cost
 * the truck 1.44 км/ч, and was billed 10 т. under «…трябваше да спира рязко».
 *
 * WHAT THIS FILE DRIVES. The lesson's OWN staged truck (the template's spec,
 * unedited), on the lesson's own map, through the real traffic system and the
 * real director — and a kinematic car whose line and speed are exact, so a
 * return can be placed at a stated distance ahead of the truck's bumper, at a
 * stated speed and acceleration, to the centimetre. (The product's car, under
 * rapier and the wind, on the live lesson stack and through the rule engine,
 * is `lessons/scenario/__tests__/wind-truck-pass-restage.test.ts` §9.)
 *
 * THE CRITERION, AND WHERE EACH NUMBER COMES FROM (nothing here is new):
 *   · OPEN from the first frame ANY PART of the car is over the truck's lane
 *     ahead of it — its centre within half the lane (4.06) plus its own
 *     half-width (`PLAYER_HALF_WIDTH_M` 0.85) of the truck's line;
 *   · CLOSED only when the return is FINISHED: centre within 3.0 m (the
 *     truck's own corridor `GUARD_LATERAL_M`, inside the lane-keeping band
 *     3.25), heading within 15° (`TURN_REARM_DEG`), at least `clearBumperGapM`
 *     between the bumpers (outside the guard's reach), not slower than the
 *     truck, and the truck's account not growing — all held for the time the
 *     truck takes to drive its guard's reach (16.0 m / 11.11 m/s = 1.44 s);
 *   · HARD (billed) — the account through the product's own harsh-brake gates
 *     (`rules/harshBrakeEpisode.ts`: ≥ 7 m/s² for ≥ 0.4 s, mean over 7);
 *   · LIFT (not billed, not praised, credited when finished) — the account
 *     grew by the brake-lamp line 0.3 m/s (`STAGED_BRAKE_LAMP_MARGIN_MPS`, the
 *     roundabout ruling's size) but never hard.
 */

import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../collision";
import type { CutInLeadCarSpec, StagedEventOutcome, StagedEventSpec } from "../../contracts";
import { SC_AC_WIND_TRUCK_PASS } from "../../lessons/scenario/templates-conditions2";
import { createRuleEngine, DEFAULT_RULE_CONFIG, reduceTick, type SimTick, type SimTickEvent } from "../../rules";
import { TURN_REARM_DEG } from "../../runtime/turns";
import { ROUNDABOUT_FORCED_SHED_MPS } from "../../runtime/worldRuntime";
import { GUARD_AHEAD_M, GUARD_LATERAL_M, HOLD_DECEL_MPS2, STAGED_BRAKE_LAMP_MARGIN_MPS } from "../../traffic/staged";
import { createTrafficSystem } from "../../traffic/system";
import { vehicleHalfLengthM, type StagedActorView, type TrafficDistrict } from "../../traffic/types";
import { createScenarioDirector } from "../director";
import { CutInLeadCarRunner, OVERTAKE_BRAKED_SHED_MPS } from "../runners";
import type { DirectorInput, StagedTrafficPort } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const MW = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "mw-v1.json"), "utf-8")) as TrafficDistrict;

const TRUCK = SC_AC_WIND_TRUCK_PASS.staged![0] as CutInLeadCarSpec;
const WATCH = TRUCK.overtake!;
const TRUCK_HALF = vehicleHalfLengthM(TRUCK.actor.profile);
const HALVES = TRUCK_HALF + PLAYER_HALF_LENGTH_M;
const TRUCK_MPS = TRUCK.actor.cruiseSpeedMps;
const SETTLE_SEC = (WATCH.clearBumperGapM + HALVES) / TRUCK_MPS;
const HARSH = DEFAULT_RULE_CONFIG.harshBrakeDecelMps2;
const SUSTAIN = DEFAULT_RULE_CONFIG.harshBrakeSustainSec;
const DT = 1 / 60;
/** Set to a file path to have the measurements written there. */
const PRINT_TO = process.env.OVERTAKE_PRINT;
const X_HOME = 0;
const X_PASS = -8.12;
/** The lane line between the two, seen from the truck's own line. */
const LANE_LINE_M = WATCH.ownLaneHalfWidthM;
const print = (line: string): void => {
  if (PRINT_TO) appendFileSync(PRINT_TO, line + "\n");
};

type Answer = Extract<SimTickEvent, { kind: "laneEntryAnswer" }>;
interface Frame {
  t: number;
  x: number;
  y: number;
  kmh: number;
  /** Road between the car's tail and the truck's nose, m (+ = truck behind). */
  gapM: number;
  truckKmh: number;
  shedMps: number;
}
interface Drive {
  frames: Frame[];
  answers: Array<Answer & { t: number }>;
  outcomes: StagedEventOutcome[];
  collisions: number;
  /** The frame the car's centre crossed into the truck's lane on the return. */
  entry: Frame | null;
  /** The first frame any part of the car was over the truck's lane on the return. */
  touch: Frame | null;
  /** The first frame the car's centre was within 3.0 m of the truck's line. */
  settledIn: Frame | null;
}

const smooth = (u: number): number => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};

/**
 * Pass the truck at a steady `kmh` and come back so that the car's CENTRE
 * crosses the lane line with exactly `entryGapM` of road between its tail and
 * the truck's nose. The return is a smooth `overM`-metre lane change whose
 * midpoint is the line; during it the car accelerates at `returnAccelMps2`
 * (negative: eases off / brakes), and from its end holds `afterKmh` (reached
 * at 3 m/s²; default: the speed it ended the lane change at). `then*` script
 * the rest.
 */
function passAndReturn(opts: {
  kmh: number;
  entryGapM: number;
  overM?: number;
  returnAccelMps2?: number;
  afterKmh?: number;
  /** After the return: go back out when the car's centre is this far inside the line. */
  bailOutAtLateralM?: number;
  /** …then, once out, come back in again (a second return in the same attempt). */
  reenterAfterM?: number;
  /** Stop the return short: hold this lateral distance from the truck's line… */
  holdLateralM?: number;
  /** …until the car is this far up the road, then finish the return. */
  holdUntilY?: number;
  /** After the return is complete, slow to this speed (a brake check). */
  thenKmh?: number;
  maxSec?: number;
}): Drive {
  const traffic = createTrafficSystem(MW, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  const director = createScenarioDirector([TRUCK as StagedEventSpec], traffic, { seed: 7 });
  const vp = opts.kmh / 3.6;
  const overM = opts.overM ?? 60;
  const a = opts.returnAccelMps2 ?? 0;
  // Time from the start of the return to the lane line (the car covers
  // overM/2 at vp + a·τ); the truck covers TRUCK_MPS·τ meanwhile.
  const tauLine = a === 0 ? overM / 2 / vp : (-vp + Math.sqrt(Math.max(0, vp * vp + a * overM))) / a;
  const startGapM = opts.entryGapM - (overM / 2 - TRUCK_MPS * tauLine);
  let x = X_HOME;
  let y = 15;
  let t = 0;
  let speed = vp;
  let heading = 0;
  let phase: "behind" | "out" | "passing" | "back" | "home" | "bail" | "out2" = "behind";
  let fromY = 0;
  let fromX = 0;
  let backAt = 0;
  const frames: Frame[] = [];
  const answers: Drive["answers"] = [];
  const outcomes: StagedEventOutcome[] = [];
  let collisions = 0;
  let entry: Frame | null = null;
  let touch: Frame | null = null;
  let settledIn: Frame | null = null;
  const maxSec = opts.maxSec ?? 80;

  while (t < maxSec) {
    t += DT;
    const truck0 = traffic.staged(TRUCK.id) as StagedActorView;
    const gapAheadM = truck0.y - y - HALVES; // road to the truck's tail
    const gapBehindM = y - truck0.y - HALVES; // road back to the truck's nose
    if (phase === "behind" && gapAheadM <= Math.max(45, 3 * vp)) {
      phase = "out";
      fromY = y;
    } else if (phase === "out" && y - fromY >= 80) {
      phase = "passing";
    } else if (phase === "passing" && gapBehindM >= startGapM) {
      phase = "back";
      fromY = y;
      backAt = t;
    }
    // Speed.
    if (phase === "back") speed = Math.max(1.5, speed + a * DT);
    else if (phase === "home" || phase === "bail" || phase === "out2") {
      const want = opts.thenKmh !== undefined && y - fromY > 40 ? opts.thenKmh / 3.6 : (opts.afterKmh ?? NaN) / 3.6;
      if (Number.isFinite(want)) speed = want > speed ? Math.min(want, speed + 3 * DT) : Math.max(want, speed - 6 * DT);
    }
    const yPrev = y;
    const xPrev = x;
    y += speed * DT;
    // Line.
    if (phase === "out") x = X_HOME + (X_PASS - X_HOME) * smooth((y - fromY) / 80);
    else if (phase === "passing") x = X_PASS;
    else if (phase === "back") {
      x = X_PASS + (X_HOME - X_PASS) * smooth((y - fromY) / overM);
      const holding = opts.holdLateralM !== undefined && (opts.holdUntilY === undefined || y < opts.holdUntilY);
      if (holding) x = Math.min(x, X_HOME - opts.holdLateralM!);
      if (opts.bailOutAtLateralM !== undefined && X_HOME - x <= opts.bailOutAtLateralM) {
        phase = "bail";
        fromY = y;
        fromX = x;
      } else if (y - fromY >= overM && !holding) {
        phase = "home";
        fromY = y;
      }
    } else if (phase === "bail") {
      x = fromX + (X_PASS - fromX) * smooth((y - fromY) / 30);
      if (opts.reenterAfterM !== undefined && y - fromY >= opts.reenterAfterM) {
        phase = "out2";
        fromY = y;
        fromX = x;
      }
    } else if (phase === "out2") {
      x = fromX + (X_HOME - fromX) * smooth((y - fromY) / 40);
    }
    heading = Math.atan2(x - xPrev, y - yPrev) * (180 / Math.PI);

    traffic.update(DT, {
      signalPhase: () => "green",
      playerPos: { x, y },
      playerSpeedKmh: speed * 3.6,
      playerHeadingDeg: heading,
    });
    const input: DirectorInput = {
      tSec: t,
      dtSec: DT,
      x,
      y,
      speedKmh: speed * 3.6,
      headingDeg: heading,
      brakePedal: 0,
      tickEvents: [],
    };
    const res = director.step(input);
    for (const e of res.events) {
      if (e.kind === "laneEntryAnswer") answers.push({ ...e, t });
      if (e.kind === "collision") collisions++;
    }
    for (const o of res.outcomes) outcomes.push(o);
    const truck = traffic.staged(TRUCK.id) as StagedActorView;
    const f: Frame = {
      t,
      x,
      y,
      kmh: speed * 3.6,
      gapM: y - truck.y - HALVES,
      truckKmh: truck.speedMps * 3.6,
      shedMps: truck.playerShedMps ?? NaN,
    };
    frames.push(f);
    const returning = phase !== "behind" && phase !== "out" && phase !== "passing";
    if (touch === null && returning && X_HOME - x < LANE_LINE_M + PLAYER_HALF_WIDTH_M) touch = f;
    if (entry === null && returning && X_HOME - x <= LANE_LINE_M) entry = f;
    if (settledIn === null && returning && X_HOME - x < WATCH.establishedHalfWidthM) settledIn = f;
    if (y > 1500) break;
    if (backAt > 0 && t - backAt > 30) break;
  }
  return { frames, answers, outcomes, collisions, entry, touch, settledIn };
}

const phases = (d: Drive): string[] => d.answers.map((a) => a.phase);
const details = (d: Drive): string[] => d.outcomes.map((o) => o.detail);
const after = (d: Drive): Frame[] => d.frames.filter((f) => d.touch !== null && f.t >= d.touch.t);

/**
 * THE INDEPENDENT ORACLE — the TRUCK'S OWN SPEED TRACE (not its account, not
 * the runner, not `harshBrakeEpisode.ts`) handed to the product's own
 * harsh-brake detector as if it were a car: the rule engine's reducer, fed
 * one tick per frame with the truck's speed and nothing else on the road, so
 * nothing is a cause. «Hard» = it pushes HARSH_BRAKING_NO_CAUSE after the car
 * first came over the truck's lane. Its 35 км/ч onset floor (a student's
 * clumsy low-speed stab) is switched off — the one difference the runner's
 * reading states — and an exact 0.4 s is held (the runner's tie rule). `slowed`: the truck lost the brake-lamp line, 0.3 m/s, below
 * its cruise. `bestSpanSec` (for the record only): the longest run of frames
 * each losing 7 m/s² or more, first to last.
 */
function truckOracle(d: Drive): { hard: boolean; slowed: boolean; minKmh: number; bestSpanSec: number } {
  const fr = after(d);
  // The engine's own reducer — with its 35 км/ч onset floor off (the stated
  // difference) and its sustain read so that an EXACT 0.4 s is held, as its
  // `>=` says, rather than by how 24 frames of 1/60 s happen to sum.
  let state = createRuleEngine({
    harshBrakeMinSpeedKmh: 0,
    harshBrakeSustainSec: DEFAULT_RULE_CONFIG.harshBrakeSustainSec * (1 - 1e-9),
  });
  let hard = false;
  for (const f of fr) {
    const tk: SimTick = {
      t: f.t,
      speedKmh: f.truckKmh,
      maxSpeedKmh: 130,
      position: { x: 0, y: f.y },
      headingDeg: 0,
      laneOffsetM: 0,
      laneId: 0,
      indicator: "off",
      headlights: "low",
      seatbeltOn: true,
      handbrakeOn: false,
      gear: 3,
      isNight: false,
      events: [],
    };
    const r = reduceTick(state, tk);
    state = r.state;
    if (r.events.some((e) => e.code === "HARSH_BRAKING_NO_CAUSE")) hard = true;
  }
  let minKmh = Infinity;
  let run: number | null = null;
  let best = 0;
  for (let i = 0; i < fr.length; i++) {
    minKmh = Math.min(minKmh, fr[i]!.truckKmh);
    const decel = i === 0 ? 0 : (fr[i - 1]!.truckKmh - fr[i]!.truckKmh) / 3.6 / (fr[i]!.t - fr[i - 1]!.t);
    if (decel >= HARSH) {
      run ??= fr[i]!.t;
      best = Math.max(best, fr[i]!.t - run);
    } else run = null;
  }
  return { hard, slowed: minKmh < TRUCK_MPS * 3.6 - OVERTAKE_BRAKED_SHED_MPS * 3.6, minKmh, bestSpanSec: best };
}

// ---------------------------------------------------------------------------
// 0. The numbers the criterion is made of
// ---------------------------------------------------------------------------

describe("the criterion is made of numbers the product already owns", () => {
  it("«it gave way» is the traffic model's own brake-lamp line, the size the roundabout ruling is built on", () => {
    expect(OVERTAKE_BRAKED_SHED_MPS).toBe(STAGED_BRAKE_LAMP_MARGIN_MPS);
    expect(OVERTAKE_BRAKED_SHED_MPS).toBe(ROUNDABOUT_FORCED_SHED_MPS);
    expect(OVERTAKE_BRAKED_SHED_MPS).toBe(0.3);
  });

  it("«it braked hard» is the rule engine's harsh-brake line WITH its sustain: 7 m/s² for 0.4 s — 2.8 m/s at least — and the lesson does not move it", () => {
    expect(HARSH).toBe(7);
    expect(SUSTAIN).toBe(0.4);
    expect(HARSH * SUSTAIN).toBeCloseTo(2.8, 9);
    expect(SC_AC_WIND_TRUCK_PASS.ruleConfig).toEqual({ laneEntryForcedBrakingEnabled: true });
    // The truck's guard brakes at 8 — over the line — so a guard that holds its
    // brake for the sustain is a harsh brake, and one that lets go sooner is not.
    expect(HOLD_DECEL_MPS2).toBe(8);
    expect(HOLD_DECEL_MPS2).toBeGreaterThan(HARSH);
  });

  it("where a SLOWER car is met: at the edge of its 16 m reach the guard asks the 40 км/ч truck for 8.0 m/s — 3.11 m/s at 8 m/s² is 0.389 s, 0.011 s short of the sustain: a lift, not a harsh brake", () => {
    const targetAtEdge = (GUARD_AHEAD_M - 6) * 0.8; // traffic/staged.ts GUARD_STOP_SHORT_M 6, GUARD_APPROACH_GAIN 0.8
    expect(targetAtEdge).toBeCloseTo(8.0, 9);
    const sec = (TRUCK_MPS - targetAtEdge) / HOLD_DECEL_MPS2;
    expect(sec).toBeCloseTo(0.389, 3);
    expect(sec).toBeLessThan(SUSTAIN);
  });

  it("«the whole truck is behind» is authored just outside the truck's own reach", () => {
    const guardReachBumperM = GUARD_AHEAD_M - TRUCK_HALF - PLAYER_HALF_LENGTH_M;
    expect(guardReachBumperM).toBeCloseTo(10.23, 2);
    expect(WATCH.clearBumperGapM).toBeGreaterThanOrEqual(guardReachBumperM);
    expect(WATCH.clearBumperGapM - guardReachBumperM).toBeLessThan(0.05);
    expect(TRUCK.paceMode).toBe("scheduledCruise");
  });

  it("«settled in the lane» is the truck's own corridor (inside the lane-keeping band) and the runtime's «straightened out»; the watch opens on any part of the body over the lane", () => {
    expect(WATCH.establishedHalfWidthM).toBe(GUARD_LATERAL_M);
    expect(WATCH.establishedHalfWidthM).toBeLessThanOrEqual(DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM);
    expect(DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM).toBeCloseTo(3.25, 9);
    expect(WATCH.establishedHeadingDeg).toBe(TURN_REARM_DEG);
    expect(PLAYER_HALF_WIDTH_M).toBeCloseTo(0.85, 9);
    expect(WATCH.ownLaneHalfWidthM).toBeGreaterThan(WATCH.establishedHalfWidthM);
  });

  it("the settle time is the truck driving its guard's whole reach: 16.0 m at 11.11 m/s = 1.44 s", () => {
    expect(WATCH.clearBumperGapM + HALVES).toBeCloseTo(GUARD_AHEAD_M, 1);
    expect(SETTLE_SEC).toBeCloseTo(1.44, 2);
  });
});

// ---------------------------------------------------------------------------
// 1. Faster car, early return: 3.0 / 4.5 / 6.5 m ahead of the bumper
// ---------------------------------------------------------------------------

describe("F-01 — a return 3.0 / 4.5 / 6.5 m ahead by a car FASTER than the truck: where the truck brakes HARD, «braked» on the frame the sustain is met, never «overtaken»; where its brake is shorter than the sustain, «lift»", () => {
  for (const kmh of [50, 53, 62] as const) {
    for (const entryGapM of [3.0, 4.5, 6.5] as const) {
      it(`${kmh} км/ч, centre over the line ${entryGapM.toFixed(1)} m ahead of the bumper`, () => {
        const d = passAndReturn({ kmh, entryGapM });
        expect(d.entry, "the car came back into the truck's lane").not.toBeNull();
        expect(d.entry!.gapM).toBeGreaterThan(entryGapM - 0.2);
        expect(d.entry!.gapM).toBeLessThan(entryGapM + 0.2);
        expect(d.entry!.truckKmh).toBeCloseTo(40, 1);
        const o = truckOracle(d);
        expect(o.slowed).toBe(true);
        // 3 m ahead the truck always brakes hard (well inside its reach).
        if (entryGapM === 3.0) expect(o.hard, `harsh stretch ${o.bestSpanSec.toFixed(3)} s`).toBe(true);
        if (!o.hard) {
          expect(phases(d)).toEqual(["watching", "lift"]);
          expect(details(d)).toEqual(["drewLevel", "overtaken"]);
          print(`FAST ${kmh} ${entryGapM}: LIFT — truck min ${o.minKmh.toFixed(1)} км/ч, harsh stretch ${o.bestSpanSec.toFixed(3)} s, shed ${d.answers[1]!.shedMps.toFixed(2)}`);
          return;
        }
        // The watch opened when the first part of the car came over the lane —
        // before its centre crossed — and the answer is the harsh brake.
        expect(phases(d)).toEqual(["watching", "braked"]);
        const [w, b] = d.answers;
        expect(w!.t).toBeCloseTo(d.touch!.t, 5);
        expect(w!.t).toBeLessThan(d.entry!.t);
        expect(b!.heldSec).toBeGreaterThanOrEqual(SUSTAIN * (1 - 1e-9));
        expect(b!.qualifiedSec).toBeGreaterThanOrEqual(SUSTAIN * (1 - 1e-9));
        expect(b!.decelMps2).toBeGreaterThan(HARSH);
        expect(b!.shedMps).toBeGreaterThanOrEqual(HARSH * SUSTAIN);
        expect(b!.speedMps).toBeCloseTo(TRUCK_MPS, 3);
        expect(b!.act).toBe("overtakeReturn");
        // THE GAP THE BRAKING OPENED IS NOT A RETURN.
        const opened = after(d).find((f) => f.gapM >= WATCH.clearBumperGapM && Math.abs(f.x - X_HOME) <= 3);
        expect(opened, "the clear gap did open behind him").toBeDefined();
        expect(details(d)).toEqual(["drewLevel"]);
        expect(d.collisions).toBe(0);
        print(
          `FAST ${kmh} ${entryGapM}: braked at +${(b!.t - d.entry!.t).toFixed(2)} s after the line, held ${b!.heldSec.toFixed(3)} s, mean ${b!.decelMps2.toFixed(2)}, shed ${b!.shedMps.toFixed(2)}; truck min ${o.minKmh.toFixed(1)} км/ч`,
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 2. A return with the whole truck in the mirror, by a car at or above its speed
// ---------------------------------------------------------------------------

describe("a return 10.25 / 15 / 20 m ahead by a car at or above the truck's speed is clean — and it is credited when the return is FINISHED, never on the frame the car crosses the line", () => {
  // `40`: passes at 62 and eases off through the return to EXACTLY the
  // truck's speed, then holds it — «at the truck's speed».
  for (const kmh of [40, 50, 53, 62, 95] as const) {
    for (const entryGapM of [10.25, 15, 20] as const) {
      it(`${kmh} км/ч, ${entryGapM} m`, () => {
        const d =
          kmh === 40
            ? passAndReturn({ kmh: 62, entryGapM, returnAccelMps2: -((62 / 3.6) ** 2 - TRUCK_MPS ** 2) / 120, afterKmh: TRUCK_MPS * 3.6 })
            : passAndReturn({ kmh, entryGapM });
        if (kmh === 40) expect(d.frames[d.frames.length - 1]!.kmh / 3.6).toBeCloseTo(TRUCK_MPS, 6);
        expect(d.entry!.gapM).toBeGreaterThan(entryGapM - 0.2);
        for (const f of d.frames.filter((x) => x.t > 8)) expect(f.truckKmh, `t=${f.t.toFixed(2)}`).toBeCloseTo(40, 6);
        expect(d.frames[d.frames.length - 1]!.shedMps).toBe(0);
        expect(phases(d)).toEqual(["watching", "clear"]);
        expect(details(d)).toEqual(["drewLevel", "overtaken"]);
        const [w, c] = d.answers;
        const over = d.outcomes[1]!;
        expect(over.tSec).toBeCloseTo(c!.t, 6);
        // NOT on the entry frame: it waited for the car to settle and then for
        // the settle time.
        expect(w!.t).toBeLessThan(d.entry!.t);
        expect(over.tSec - d.settledIn!.t).toBeGreaterThanOrEqual(SETTLE_SEC - DT);
        expect(over.tSec - d.settledIn!.t).toBeLessThan(SETTLE_SEC + 0.5);
        const at = d.frames.find((f) => Math.abs(f.t - over.tSec) < 1e-6)!;
        expect(at.gapM).toBeGreaterThanOrEqual(WATCH.clearBumperGapM);
        expect(Math.abs(at.x - X_HOME)).toBeLessThan(WATCH.establishedHalfWidthM);
        print(`CLEAN ${kmh} ${entryGapM}: credited ${(over.tSec - d.entry!.t).toFixed(2)} s after the line, gap then ${at.gapM.toFixed(2)} m`);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 3. F2-01 — the car SLOWER than the truck as it comes back
// ---------------------------------------------------------------------------

describe("F2-01 — a return made while slower than the truck is judged by what the truck then does, like a faster one: never «clear» on the entry frame, never credited or praised while the truck has to answer", () => {
  it("the slowest lawful passer eases off at 1.44 m/s² through the return (the verifier's slow51b36g18): no answer on the entry frame; the truck meets him and gives way; «lift» — not billed, not praised — and no «overtaken» while he is slower", () => {
    const d = passAndReturn({ kmh: 50.3, entryGapM: 10.94, returnAccelMps2: -1.44, afterKmh: 36 });
    expect(d.entry!.kmh).toBeLessThan(40);
    expect(d.entry!.gapM).toBeGreaterThan(10.7);
    // Nothing was decided on the frame he crossed the line.
    expect(d.answers.filter((a) => Math.abs(a.t - d.entry!.t) < 1e-6 && a.phase !== "watching")).toEqual([]);
    const o = truckOracle(d);
    expect(o.slowed, "the truck had to slow for him").toBe(true);
    // The truck's own answer, and the runner's — the same, from different reads.
    expect(phases(d)).not.toContain("clear");
    if (o.hard) expect(phases(d)).toContain("braked");
    else expect(phases(d)).not.toContain("braked");
    expect(details(d)).toEqual(["drewLevel"]);
    print(
      `SLOW-EASE 50.3→: line at ${d.entry!.kmh.toFixed(1)} км/ч, ${d.entry!.gapM.toFixed(2)} m; truck min ${o.minKmh.toFixed(1)} км/ч, harsh stretch ${o.bestSpanSec.toFixed(3)} s; answers ${phases(d).join(",")}`,
    );
  });

  it("the taught speed with a brake dab through the return (the verifier's dab62g20): crosses the line slower than the truck; never «clear» while the truck answers; when he picks up again and finishes the return, «lift» (not praised) and credited then — or «braked» and never", () => {
    const d = passAndReturn({ kmh: 61, entryGapM: 10.82, returnAccelMps2: -3.2, afterKmh: 62 });
    expect(d.entry!.kmh).toBeLessThan(40);
    const o = truckOracle(d);
    expect(o.slowed).toBe(true);
    expect(phases(d)).not.toContain("clear");
    if (o.hard) {
      expect(phases(d)).toEqual(["watching", "braked"]);
      expect(details(d)).toEqual(["drewLevel"]);
    } else {
      expect(phases(d)).toEqual(["watching", "lift"]);
      expect(details(d)).toEqual(["drewLevel", "overtaken"]);
      // Credited only once the truck had stopped shedding for the settle time.
      const over = d.outcomes[1]!;
      const lastGrowth = d.frames.filter((f, i) => i > 0 && f.shedMps > d.frames[i - 1]!.shedMps).pop()!;
      expect(over.tSec - lastGrowth.t).toBeGreaterThanOrEqual(SETTLE_SEC - DT);
    }
    print(
      `SLOW-DAB 61: line at ${d.entry!.kmh.toFixed(1)} км/ч, ${d.entry!.gapM.toFixed(2)} m; truck min ${o.minKmh.toFixed(1)} км/ч, harsh stretch ${o.bestSpanSec.toFixed(3)} s; answers ${phases(d).join(",")}; outcomes ${details(d).join(",")}`,
    );
  });

  it("a car that comes back slower and STAYS slower is never credited, whatever the gap: the truck catches it and has to answer", () => {
    for (const gap of [12, 20, 30]) {
      const d = passAndReturn({ kmh: 62, entryGapM: gap, returnAccelMps2: -2.5, afterKmh: 32 });
      expect(truckOracle(d).slowed, `gap ${gap}`).toBe(true);
      expect(phases(d), `gap ${gap}`).not.toContain("clear");
      expect(details(d), `gap ${gap}`).toEqual(["drewLevel"]);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. F2-02 — the benign side is not billed
// ---------------------------------------------------------------------------

describe("F2-02 — a return by a car pulling AWAY that only touches the truck's guard is a «lift» — not billed, not praised, credited when finished; only a brake held for the sustain is «braked»", () => {
  for (const kmh of [50, 60.4, 77.9, 92.5] as const) {
    it(`${kmh} км/ч: swept 5–10.25 m at the lane line`, () => {
      let lifts = 0;
      for (let g = 5; g <= 10.2501; g += 0.25) {
        const d = passAndReturn({ kmh, entryGapM: g });
        const o = truckOracle(d);
        const tag = `${kmh} км/ч, ${g.toFixed(2)} m`;
        print(`PULL-AWAY ${tag}: ${o.hard ? "BRAKED" : o.slowed ? "lift" : "clean"} — truck min ${o.minKmh.toFixed(2)} км/ч, harsh stretch ${o.bestSpanSec.toFixed(3)} s; answers ${phases(d).join(",")}`);
        if (o.hard) {
          expect(phases(d), tag).toEqual(["watching", "braked"]);
          expect(details(d), tag).toEqual(["drewLevel"]);
        } else if (o.slowed) {
          lifts++;
          expect(phases(d), tag).toEqual(["watching", "lift"]);
          expect(d.answers[1]!.shedMps, tag).toBeGreaterThanOrEqual(OVERTAKE_BRAKED_SHED_MPS);
          expect(details(d), tag).toEqual(["drewLevel", "overtaken"]);
        } else {
          expect(phases(d), tag).toEqual(["watching", "clear"]);
          expect(details(d), tag).toEqual(["drewLevel", "overtaken"]);
        }
      }
      // The benign side exists at every speed: a touch of the guard, not billed.
      expect(lifts, "returns the truck only lifted for").toBeGreaterThan(0);
    }, 120_000);
  }
});

// ---------------------------------------------------------------------------
// 5. The sweep, judged by the independent oracle
// ---------------------------------------------------------------------------

describe("THE SWEEP — entry gap 3–25 m × speed at the line 30–70 км/ч × acceleration through the return −2…+1 m/s²: no cell credited or praised that the truck then brakes hard for; no cell billed that it did not", () => {
  const GAPS = [3, 5, 7, 9, 10.25, 12, 15, 20, 25];
  const SPEEDS = [30, 40, 50, 60, 70];
  const ACCELS = [-2, -1, -0.5, 0, 0.5, 1];
  for (const vLineKmh of SPEEDS) {
    it(`${vLineKmh} км/ч at the line`, () => {
      let feasible = 0;
      for (const a of ACCELS) {
        for (const gap of GAPS) {
          // The speed it passed at, from the speed at the line and the
          // acceleration over the first half of the 60 m lane change.
          const vLine = vLineKmh / 3.6;
          const vp2 = vLine * vLine - a * 60;
          if (!(vp2 > 0) || Math.sqrt(vp2) * 3.6 < 45) continue; // could not have overtaken
          feasible++;
          const d = passAndReturn({ kmh: Math.sqrt(vp2) * 3.6, entryGapM: gap, returnAccelMps2: a });
          const o = truckOracle(d);
          const billed = phases(d).includes("braked");
          const praised = phases(d).includes("clear") && !billed && !phases(d).includes("lift");
          const credited = details(d).includes("overtaken");
          const cell = `line ${vLineKmh} км/ч (${d.entry?.kmh.toFixed(1)}), a ${a}, gap ${gap} (${d.entry?.gapM.toFixed(2)})`;
          if (credited || praised) expect(o.hard, `${cell}: credited/praised and the truck braked hard`).toBe(false);
          if (billed) expect(o.hard, `${cell}: billed and the truck never braked hard`).toBe(true);
          if (o.hard) expect(billed, `${cell}: the truck braked hard and nothing was billed`).toBe(true);
          // …and the lift: the truck slowed for him, never hard ⇒ «lift»
          // (OVERTAKE_RETURN_TOO_EARLY in the engine); it never slowed ⇒ no
          // answer but «clear» (or none, if he never finished).
          if (o.slowed && !o.hard) expect(phases(d), `${cell}: it gave way, not hard`).toContain("lift");
          if (!o.slowed) expect(phases(d).filter((p) => p === "lift" || p === "braked"), `${cell}: it never slowed`).toEqual([]);
          if (praised) expect(o.slowed, `${cell}: praised and the truck slowed`).toBe(false);
          print(
            `SWEEP ${cell}: ${billed ? "BILLED" : phases(d).includes("lift") ? "lift" : praised ? "clean" : "open"}${credited ? " credited" : ""} — truck min ${o.minKmh.toFixed(1)}, harsh stretch ${o.bestSpanSec.toFixed(3)} s`,
          );
        }
      }
      expect(feasible).toBeGreaterThan(0);
    }, 300_000);
  }
});

// ---------------------------------------------------------------------------
// 6. What is, and is not, a return
// ---------------------------------------------------------------------------

describe("the watch is about being IN THE TRUCK'S LANE IN FRONT OF IT — nothing else opens it, closes it or spends it", () => {
  it("V7: a car that dips over the line 3 m ahead and goes straight back out is watched, answered by what the truck did, and credited nothing", () => {
    // In over the line by 0.6 m (3.46 m from the truck's line: inside its lane,
    // outside its guard's 3 m corridor), then back out to the overtaking lane.
    const d = passAndReturn({ kmh: 62, entryGapM: 3.0, bailOutAtLateralM: 3.46 });
    expect(d.entry).not.toBeNull();
    expect(phases(d)).toEqual(["watching", "clear"]);
    expect(d.frames[d.frames.length - 1]!.shedMps).toBe(0);
    expect(details(d)).toEqual(["drewLevel"]);
  });

  it("a car that rides its centre 3.4 m off the truck's line (in the lane, outside its corridor) has not finished the return: watched, never credited, until it settles — then credited", () => {
    const d = passAndReturn({ kmh: 62, entryGapM: 3.0, holdLateralM: 3.4, holdUntilY: 500 });
    for (const f of d.frames.filter((x) => x.t > 8)) expect(f.truckKmh).toBeCloseTo(40, 6);
    const over = d.outcomes.find((o) => o.detail === "overtaken")!;
    expect(over).toBeDefined();
    const at = d.frames.find((f) => Math.abs(f.t - over.tSec) < 1e-6)!;
    expect(at.y).toBeGreaterThan(500);
    expect(phases(d)).toEqual(["watching", "clear"]);
  });

  it("F2-03(b): a return the truck braked HARD for stays spent through leaving its lane and coming back in clear — no «overtaken» until the car drops wholly behind", () => {
    const d = passAndReturn({ kmh: 62, entryGapM: 4.5, bailOutAtLateralM: 1.0, reenterAfterM: 60 });
    expect(phases(d)[1]).toBe("braked");
    // It left the lane and came back with the truck far behind and holding…
    const back = d.frames.filter((f) => Math.abs(f.x - X_HOME) < 0.5 && f.t > d.answers[1]!.t + 3);
    expect(back.length).toBeGreaterThan(60);
    expect(back[0]!.gapM).toBeGreaterThan(20);
    // …and a second watch opened and closed clean — but the attempt is spent.
    expect(phases(d).slice(2)).toEqual(["watching", "clear"]);
    expect(details(d)).toEqual(["drewLevel"]);
  });

  it("after a FINISHED clean return the watch is closed: a driver who then brake-checks the truck makes it brake, and that is NOT reported as a lane entry", () => {
    const d = passAndReturn({ kmh: 62, entryGapM: 15, thenKmh: 15, maxSec: 60 });
    expect(details(d)).toEqual(["drewLevel", "overtaken"]);
    expect(d.frames[d.frames.length - 1]!.shedMps).toBeGreaterThan(1);
    expect(phases(d)).toEqual(["watching", "clear"]);
  });

  it("a return that runs into the truck's SIDE, beside the trailer, is the collision's: watched, and neither «braked» nor «clear» nor «overtaken» is ever said", () => {
    const d = passAndReturn({ kmh: 62, entryGapM: -9, overM: 40, maxSec: 40 });
    expect(d.collisions).toBeGreaterThan(0);
    const hit = d.frames.find((f) => f.gapM < 0 && f.gapM > -2 * HALVES && Math.abs(f.x - X_HOME) < 2.05)!;
    expect(hit, "the bodies overlap").toBeDefined();
    expect(hit.shedMps, "the truck had not braked for him before the contact").toBe(0);
    expect(d.frames[d.frames.length - 1]!.shedMps).toBeGreaterThan(1);
    expect(phases(d)).toEqual(["watching"]);
    expect(details(d)).not.toContain("overtaken");
  });

  it("…and one that comes across the truck's BOW: the truck brakes, the bodies meet before its brake has been held for the sustain — the collision's, never «braked» on top, never «overtaken»", () => {
    const d = passAndReturn({ kmh: 62, entryGapM: -4.5, overM: 40, maxSec: 40 });
    expect(d.collisions).toBeGreaterThan(0);
    expect(d.frames[d.frames.length - 1]!.shedMps).toBeGreaterThan(1);
    expect(phases(d)).toEqual(["watching"]);
    expect(details(d)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7. The port: without the account, nothing is claimed
// ---------------------------------------------------------------------------

describe("a fake port: without an account the truck is read as never slowing; without a state id nothing is published; the gates and the settle time are the runner's own", () => {
  function fakePort(view: Partial<StagedActorView>): { port: StagedTrafficPort; v: Record<string, unknown> } {
    const v: Record<string, unknown> = {
      id: TRUCK.id,
      kind: "vehicle",
      x: 0,
      y: 200,
      dirX: 0,
      dirY: 1,
      speedMps: TRUCK_MPS,
      s: 0,
      pathLengthM: 2600,
      nodeS: [0, 2600],
      finished: false,
      ...view,
    };
    return {
      v,
      port: { stage: () => v as unknown as StagedActorView, stagedCommand: () => undefined, staged: () => v as unknown as StagedActorView },
    };
  }
  const step = (runner: CutInLeadCarRunner, port: StagedTrafficPort, t: number, x: number, y: number, out: SimTickEvent[], kmh = 62) =>
    runner.step(port, { tSec: t, dtSec: DT, x, y, speedKmh: kmh, headingDeg: 0, brakePedal: 0, tickEvents: [] }, out);
  /** Hold a pose (the truck standing in the fake world) for `sec`, frame by frame. */
  const hold = (runner: CutInLeadCarRunner, port: StagedTrafficPort, t0: number, sec: number, x: number, y: number, out: SimTickEvent[], say: (o: StagedEventOutcome | null) => void, kmh = 62) => {
    let t = t0;
    for (let i = 0; i < Math.round(sec / DT); i++) {
      t += DT;
      say(step(runner, port, t, x, y, out, kmh));
    }
    return t;
  };

  it("no account: «overtaken» needs the settled return held for the settle time, and no event reaches the rule engine without a state id", () => {
    const { port } = fakePort({});
    const runner = new CutInLeadCarRunner(TRUCK);
    runner.stage(port, () => 0.5, true);
    const out: SimTickEvent[] = [];
    const got: string[] = [];
    const say = (o: StagedEventOutcome | null) => void (o && got.push(o.detail));
    say(step(runner, port, 1, 0, 150, out)); // wholly behind
    say(step(runner, port, 2, X_PASS, 201.9, out));
    say(step(runner, port, 2.1, X_PASS, 202.2, out)); // level with the cab, gaining
    say(step(runner, port, 3, 0, 200 + HALVES + 3, out)); // back, 3 m ahead: not clear
    let t = hold(runner, port, 4, SETTLE_SEC - 3 * DT, 0, 200 + HALVES + 11, out, say);
    expect(got).toEqual(["drewLevel"]); // not yet
    t = hold(runner, port, t, 4 * DT, 0, 200 + HALVES + 11, out, say);
    expect(got).toEqual(["drewLevel", "overtaken"]);
    expect(out.filter((e) => e.kind === "laneEntryAnswer")).toEqual([]);
  });

  it("a car settled INSIDE the truck's reach is never «finished», however long it holds there and however steady the truck (V7's term, held without the guard's help: a port with no account)", () => {
    const { port } = fakePort({});
    const runner = new CutInLeadCarRunner(TRUCK);
    runner.stage(port, () => 0.5, true);
    const out: SimTickEvent[] = [];
    const got: string[] = [];
    const say = (o: StagedEventOutcome | null) => void (o && got.push(o.detail));
    say(step(runner, port, 1, 0, 150, out));
    say(step(runner, port, 2, X_PASS, 201.9, out));
    say(step(runner, port, 2.1, X_PASS, 202.2, out));
    let t = hold(runner, port, 3, SETTLE_SEC + 1, 0, 200 + HALVES + 9, out, say); // 9 m: under the 10.25
    expect(got).toEqual(["drewLevel"]);
    hold(runner, port, t, SETTLE_SEC + 2 * DT, 0, 200 + HALVES + 10.5, out, say);
    expect(got).toEqual(["drewLevel", "overtaken"]);
  });

  it("a car SLOWER than the truck is never «finished», however clear: the settle clock does not run", () => {
    const { port } = fakePort({ playerShedMps: 0, stateId: 42 });
    const runner = new CutInLeadCarRunner(TRUCK);
    runner.stage(port, () => 0.5, true);
    const out: SimTickEvent[] = [];
    const got: string[] = [];
    const say = (o: StagedEventOutcome | null) => void (o && got.push(o.detail));
    say(step(runner, port, 1, 0, 150, out));
    say(step(runner, port, 2, X_PASS, 201.9, out));
    say(step(runner, port, 2.1, X_PASS, 202.2, out));
    hold(runner, port, 3, 5, 0, 200 + HALVES + 15, out, say, 39.9);
    expect(got).toEqual(["drewLevel"]);
    expect(out.filter((e): e is Answer => e.kind === "laneEntryAnswer").map((a) => a.phase)).toEqual(["watching"]);
  });

  it("with an account: a growth of 0.4 m/s in one frame is a LIFT (not hard), published when the return finishes; and the harsh gates need the sustain", () => {
    const { port, v } = fakePort({ playerShedMps: 0, stateId: 42 });
    const runner = new CutInLeadCarRunner(TRUCK);
    runner.stage(port, () => 0.5, true);
    const out: SimTickEvent[] = [];
    const got: string[] = [];
    const say = (o: StagedEventOutcome | null) => void (o && got.push(o.detail));
    say(step(runner, port, 1, 0, 150, out));
    say(step(runner, port, 2, X_PASS, 201.9, out));
    say(step(runner, port, 2.1, X_PASS, 202.2, out));
    say(step(runner, port, 3, 0, 200 + HALVES + 3, out));
    v.playerShedMps = 0.4;
    say(step(runner, port, 3 + DT, 0, 200 + HALVES + 3.1, out));
    hold(runner, port, 4, SETTLE_SEC + 2 * DT, 0, 200 + HALVES + 11, out, say);
    expect(got).toEqual(["drewLevel", "overtaken"]);
    const ans = out.filter((e): e is Answer => e.kind === "laneEntryAnswer");
    expect(ans.map((a) => a.phase)).toEqual(["watching", "lift"]);
    expect(ans[1]!.vehicleId).toBe(42);
    expect(ans[1]!.shedMps).toBeCloseTo(0.4, 9);
  });

  it("with an account growing at 8 m/s² frame after frame: «braked» on the frame the sustain is met (0.4 s), not before; and the 11 m that follow are not «overtaken» — until a second, clean attempt", () => {
    const { port, v } = fakePort({ playerShedMps: 0, stateId: 42 });
    const runner = new CutInLeadCarRunner(TRUCK);
    runner.stage(port, () => 0.5, true);
    const out: SimTickEvent[] = [];
    const got: string[] = [];
    const say = (o: StagedEventOutcome | null) => void (o && got.push(o.detail));
    say(step(runner, port, 1, 0, 150, out));
    say(step(runner, port, 2, X_PASS, 201.9, out));
    say(step(runner, port, 2.1, X_PASS, 202.2, out));
    say(step(runner, port, 3, 0, 200 + HALVES + 3, out));
    let t = 3;
    let shed = 0;
    let brakedAt: number | null = null;
    for (let i = 0; i < 40; i++) {
      t += DT;
      shed += 8 * DT;
      v.playerShedMps = shed;
      v.speedMps = TRUCK_MPS - shed; // its speed falls with its account
      say(step(runner, port, t, 0, 200 + HALVES + 3, out));
      if (brakedAt === null && out.some((e) => e.kind === "laneEntryAnswer" && e.phase === "braked")) brakedAt = i + 1;
    }
    // The window anchors on the first braking frame; 0.4 s later is frame 25
    // (24 frames of 1/60 s — an exact tie, held).
    expect(brakedAt).toBe(25);
    hold(runner, port, t, SETTLE_SEC + 0.2, 0, 200 + HALVES + 11, out, say);
    expect(got).toEqual(["drewLevel"]);
    // RE-ARMED BY DROPPING WHOLLY BEHIND: a second pass, made properly, counts.
    say(step(runner, port, 20, 0, 150, out));
    say(step(runner, port, 21, X_PASS, 201.9, out));
    say(step(runner, port, 21.1, X_PASS, 202.2, out));
    hold(runner, port, 22, SETTLE_SEC + 0.2, 0, 200 + HALVES + 11, out, say);
    expect(got).toEqual(["drewLevel", "drewLevel", "overtaken"]);
  });

  it("a hard brake that is NOT on the truck's account of speed shed because of him (it braked for something else) is not «braked»", () => {
    const { port, v } = fakePort({ playerShedMps: 0, stateId: 42 });
    const runner = new CutInLeadCarRunner(TRUCK);
    runner.stage(port, () => 0.5, true);
    const out: SimTickEvent[] = [];
    step(runner, port, 1, 0, 150, out);
    step(runner, port, 2, X_PASS, 201.9, out);
    step(runner, port, 2.1, X_PASS, 202.2, out);
    step(runner, port, 3, 0, 200 + HALVES + 3, out);
    let t = 3;
    for (let i = 1; i <= 40; i++) {
      t += DT;
      v.speedMps = TRUCK_MPS - 8 * DT * i; // braking hard…
      v.playerShedMps = 0.2 * (i / 40); // …but only 0.2 m/s of it for him
      step(runner, port, t, 0, 200 + HALVES + 3, out);
    }
    expect(out.filter((e): e is Answer => e.kind === "laneEntryAnswer").map((a) => a.phase)).toEqual(["watching"]);
  });

  it("F2-03(b) on the fake port: after «braked», out of the lane and back in clear does NOT re-arm the attempt", () => {
    const { port, v } = fakePort({ playerShedMps: 0, stateId: 42 });
    const runner = new CutInLeadCarRunner(TRUCK);
    runner.stage(port, () => 0.5, true);
    const out: SimTickEvent[] = [];
    const got: string[] = [];
    const say = (o: StagedEventOutcome | null) => void (o && got.push(o.detail));
    say(step(runner, port, 1, 0, 150, out));
    say(step(runner, port, 2, X_PASS, 201.9, out));
    say(step(runner, port, 2.1, X_PASS, 202.2, out));
    let t = 3;
    let shed = 0;
    for (let i = 0; i < 40; i++) {
      t += DT;
      shed += 8 * DT;
      v.playerShedMps = shed;
      v.speedMps = TRUCK_MPS - shed; // its speed falls with its account
      say(step(runner, port, t, 0, 200 + HALVES + 3, out));
    }
    say(step(runner, port, t + 1, X_PASS, 200 + HALVES + 20, out)); // out of the lane
    hold(runner, port, t + 2, SETTLE_SEC + 0.2, 0, 200 + HALVES + 25, out, say); // back in, clear
    expect(got).toEqual(["drewLevel"]);
    expect(out.filter((e): e is Answer => e.kind === "laneEntryAnswer").map((a) => a.phase)).toEqual([
      "watching",
      "braked",
      "watching",
      "clear",
    ]);
  });

  it("the account's growth BEFORE he came in front is not his return's: the baseline is the last frame he was not there", () => {
    const { port, v } = fakePort({ playerShedMps: 5, stateId: 42 });
    const runner = new CutInLeadCarRunner(TRUCK);
    runner.stage(port, () => 0.5, true);
    const out: SimTickEvent[] = [];
    const got: string[] = [];
    const say = (o: StagedEventOutcome | null) => void (o && got.push(o.detail));
    say(step(runner, port, 1, 0, 150, out));
    v.playerShedMps = 9; // something earlier in the drive
    say(step(runner, port, 2, X_PASS, 201.9, out));
    say(step(runner, port, 2.1, X_PASS, 202.2, out));
    hold(runner, port, 4, SETTLE_SEC + 2 * DT, 0, 200 + HALVES + 11, out, say);
    expect(got).toEqual(["drewLevel", "overtaken"]);
    expect(out.filter((e): e is Answer => e.kind === "laneEntryAnswer").map((a) => a.phase)).toEqual(["watching", "clear"]);
  });

  it("the watch opens on the BODY, not the centre: 4.06 + 0.85 m off the truck's line is in; 4.92 is not", () => {
    const { port } = fakePort({ playerShedMps: 0, stateId: 42 });
    const runner = new CutInLeadCarRunner(TRUCK);
    runner.stage(port, () => 0.5, true);
    const out: SimTickEvent[] = [];
    step(runner, port, 1, 0, 150, out);
    step(runner, port, 2, -(LANE_LINE_M + PLAYER_HALF_WIDTH_M + 0.01), 210, out);
    expect(out.filter((e) => e.kind === "laneEntryAnswer")).toEqual([]);
    step(runner, port, 2 + DT, -(LANE_LINE_M + PLAYER_HALF_WIDTH_M - 0.01), 210.2, out);
    expect(out.filter((e): e is Answer => e.kind === "laneEntryAnswer").map((a) => a.phase)).toEqual(["watching"]);
  });
});
