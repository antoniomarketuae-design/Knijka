/**
 * THE CROSSWIND LESSONS, DRIVEN ON THE REAL CAR — founder ruling 2026-10-04,
 * «Stronger wind» (sc-ac-crosswind:a9db1738): „tune the crosswind so that
 * HOLDING THE LANE needs a VISIBLE STEADY CORRECTION — about 3–5 % of full
 * steering input — then re-measure drift and second-swing behaviour."
 *
 * `vehicle/crosswind.test.ts` measures the wind on a bare car on a flat plane.
 * This file asks the question the ruling is actually about, on the surface the
 * student meets it: the COMPILED lesson, at EVERY rung, with the product's own
 * `VehicleSim` under the product's own wind, graded by the product's own
 * runtime and lesson engine (`liveWindDrive.ts` — the header there has the
 * stack and what it does not model).
 *
 * WHY IT HAD TO BE A NEW HARNESS. Every committed demo of these lessons is
 * kinematic: the recorder never runs `VehicleSim`, so the wind cannot change a
 * single pose of them (`s4c-crosswind-bot-completion.test.ts` says so in its
 * header, „completion here proves the LESSON pipeline, not the wind feel").
 * Before this file, „the lesson teaches a constant steering correction" had no
 * test anywhere that a wheel was turned in. MEASURED ON THE TREE BEFORE THE
 * RULING, with this harness: a student who never touched the wheel drove
 * sc-ac-crosswind L3 to both objectives with zero violations and was handed
 * CLEAN_DRIVING, and a perfect driver's mean input was 0.11 % of the wheel.
 *
 * WHAT IS PINNED, per rung of BOTH lessons that author `physics.crosswind`:
 *   1. THE CORRECT DRIVE STAYS AT 0 т. — a driver who holds the demo's line
 *      with the correction completes every objective with no violation, on a
 *      proportional wheel AND on the keyboard's digital one.
 *   2. THE CORRECTION IS THE RULED SIZE — on sc-ac-crosswind's own street, at
 *      its own taught speed, over whole gust periods: the WHEEL (what the rim
 *      shows, a share of the lock available at that speed) is held at 3–5 %,
 *      and on the default learner tier so is the student's own HAND. The two
 *      differ by the tier's steering sensitivity (`vehicle/difficulty.ts`:
 *      0.6 / 0.8 / 1), so the hand is stated per tier rather than assumed.
 *   3. IT IS RECOVERABLE — a driver whose hands come back only after the car
 *      has been carried a metre off the line still finishes at 0 т.
 *   4. IT IS NOT OPTIONAL — a driver who never touches the wheel does not
 *      complete the lesson and is billed.
 *   5. `secondSwing.ts` STAYS SILENT on every correct drive: holding 4 % into
 *      the wind is the taught duty, not the taught mistake.
 * ROUND 2 (2026-10-06) ADDS, for the round-1 verifier's findings:
 *   6. THE KEYBOARD, AT THE PRESSES FINGERS REALLY MAKE (50 / 100 / 150 ms) —
 *      0 т. with every objective at every rung of both lessons, and the
 *      «втори замах» line never raised on a driver who is holding his lane
 *      with taps; a stick with the product's dead zone likewise.
 *   7. THE HEAD LEANS WITH THE WIND FOR THE DRIVER WHO HOLDS THE LANE (V-05).
 *   8. THE SIBLING'S «завет» SENTENCES AGAINST THE CAR (V-13): the wind never
 *      stops, the truck is never abeam, the wheel is held behind it and in the
 *      overtaking lane alike — and step 5, «по-бавно покрай камиона значи
 *      по-малко отместване от порива», on the lesson's own motorway (V-01).
 *   9. THE DEMO'S WHEEL IS THE LIVE DRIVER'S WHEEL (V-06).
 * ROUND 3 (2026-10-06) ADDS, for the round-2 verifier's V2-01 / V2-02:
 *  10. EVERY REWORDED SENTENCE THAT SAYS WHAT THE WIND DOES — read off the
 *      surface it is shown on and driven at every rung: the wind blows away
 *      from the truck and a sharp correction is what throws the car at it;
 *      the wind holds a car nowhere; and «втори замах» throws the car the way
 *      the wind pushes, whatever phase the gust is in (the harness gained a
 *      scripted hand, `handScript`, to make those movements).
 * And the catalogue is swept: these nine compiled lessons are the only ones
 * that read the wind, so a tenth cannot join without being driven here.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../../../rules";
import { parseScenarioTrace } from "../../../traces/parse";
import type { ScenarioTrace } from "../../../traces/types";
import {
  CHASSIS_MASS,
  CROSSWIND_BRIDGE_N,
  CROSSWIND_GUST_AMPLITUDE_N,
  CROSSWIND_GUST_PERIOD_SEC,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_PRESETS,
  SECOND_SWING,
} from "../../../vehicle";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import { SC_AC_CROSSWIND } from "../templates-conditions";
import { SC_AC_WIND_TRUCK_PASS } from "../templates-conditions2";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import {
  GAMEPAD_DEADZONE,
  initLiveWindDrive,
  KEY_MIN_PRESS_FRAMES,
  liveWindDrive,
  maxSteerRadAt,
  type LiveWindDriveOptions,
  type LiveWindDriveOutcome,
  type LiveWindSample,
  type WindDriver,
} from "./liveWindDrive";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const TEST_TIMEOUT = 120_000;
const PRINT = process.env.LIVE_WIND_PRINT === "1";

function loadJson(rel: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, rel), "utf-8")) as unknown;
}
function loadShadow(spec: ScenarioSpec): ScenarioTrace {
  const trace = parseScenarioTrace(loadJson(spec.shadow.path));
  if (trace === null) throw new Error(`${spec.shadow.path} did not parse`);
  return trace;
}

/** The founder's band, as a fraction of full input. */
const RULED_MIN = 0.03;
const RULED_MAX = 0.05;

/** fo-follow-v1's drawn right-lane centre (half of the 8.125 m lane) — the
 *  centre the lane detectors measure from (sc-ac-crosswind-traces.test.ts). */
const FO_LANE_CENTER_X = 8.125 / 2;

const FO = loadJson("content/world/fo-follow-v1.json");
const MW = loadJson("content/world/mw-v1.json");
const CROSSWIND_SHADOW = loadShadow(SC_AC_CROSSWIND);
const TRUCK_SHADOW = loadShadow(SC_AC_WIND_TRUCK_PASS);

const CROSSWIND_LEVELS = SC_AC_CROSSWIND.levels.map((l) => l.level as ScenarioLevel);
const TRUCK_LEVELS = SC_AC_WIND_TRUCK_PASS.levels.map((l) => l.level as ScenarioLevel);

function drive(
  spec: ScenarioSpec,
  level: ScenarioLevel,
  driver: WindDriver,
  extra: Pick<
    LiveWindDriveOptions,
    "cruiseKmh" | "lateAfterM" | "difficulty" | "keyMinPressFrames" | "lapse" | "simOptions" | "handScript"
  > = {},
): LiveWindDriveOutcome {
  const o = liveWindDrive({
    lesson: compileScenario(spec, level),
    districtRaw: spec === SC_AC_CROSSWIND ? FO : MW,
    trace: spec === SC_AC_CROSSWIND ? CROSSWIND_SHADOW : TRUCK_SHADOW,
    driver,
    ...extra,
  });
  if (PRINT) {
    const w = wheelShare(o.samples, taughtRun);
    const xs = o.samples.map((s) => s.x);
    console.log(
      `${o.lesson.id} ${driver}${extra.cruiseKmh ? `@${extra.cruiseKmh}` : ""}${extra.difficulty ? ` [${extra.difficulty}]` : ""}: phase=${o.session.phase} passed=${o.result.passed} score=${o.result.score} ` +
        `obj=${o.result.objectives.map((x) => (x.done ? 1 : 0)).join("")} viol=[${o.violationCodes.join(",")}] comm=[${o.commendationCodes.join(",")}] ` +
        `maxOff=${o.maxOffPathM.toFixed(2)} x=[${Math.min(...xs).toFixed(2)},${Math.max(...xs).toFixed(2)}] ` +
        `wheel(taught run) n=${w.n} mean=${(w.mean * 100).toFixed(2)}% [${(w.min * 100).toFixed(1)},${(w.max * 100).toFixed(1)}] hand mean=${(w.hand * 100).toFixed(2)}% ` +
        `maxSteerRad=${Math.max(...o.samples.map((s) => Math.abs(s.steerRad))).toFixed(3)} swing=${o.secondSwingFires} dur=${o.durationSec.toFixed(1)}`,
    );
  }
  return o;
}

/**
 * The stretch sc-ac-crosswind teaches at ~34 км/ч, trimmed to WHOLE gust
 * periods so a mean over it is the mean of the sine and not of whichever half
 * of a gust the window happened to end in.
 */
function taughtRun(s: LiveWindSample): boolean {
  return s.speedKmh > 31 && s.speedKmh < 37;
}
function wholePeriods(samples: readonly LiveWindSample[], keep: (s: LiveWindSample) => boolean): LiveWindSample[] {
  const kept = samples.filter(keep);
  if (kept.length === 0) return kept;
  const t0 = kept[0]!.t;
  const span = kept[kept.length - 1]!.t - t0;
  const whole = Math.floor(span / CROSSWIND_GUST_PERIOD_SEC) * CROSSWIND_GUST_PERIOD_SEC;
  return kept.filter((s) => s.t < t0 + whole);
}

/**
 * Over whole gust periods of the kept stretch:
 *  · `mean` / `min` / `max` — the driver's WHEEL as a share of the lock
 *    available at that speed. This is what the cockpit rim shows and what
 *    `VehicleSim` calls full input; for a keyboard it is where the taps leave
 *    the wheel on average.
 *  · `hand` — the mean of his RAW input, before the tier's shaping.
 */
function wheelShare(
  samples: readonly LiveWindSample[],
  keep: (s: LiveWindSample) => boolean,
): { n: number; mean: number; min: number; max: number; hand: number } {
  const kept = wholePeriods(samples, keep);
  let sum = 0;
  let hand = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const s of kept) {
    const share = s.steerRad / maxSteerRadAt(s.speedKmh);
    sum += share;
    hand += s.steerInput;
    min = Math.min(min, share);
    max = Math.max(max, share);
  }
  const n = kept.length;
  return { n, mean: n > 0 ? sum / n : 0, min, max, hand: n > 0 ? hand / n : 0 };
}

function expectCleanPass(o: LiveWindDriveOutcome, label: string): void {
  expect(o.session.phase, `${label} phase`).toBe("completed");
  expect(o.violationCodes, `${label} violations`).toEqual([]);
  expect(o.result.score, `${label} score`).toBe(0);
  expect(o.result.objectives.every((x) => x.done), `${label} objectives`).toBe(true);
  expect(o.result.completedAll, `${label} completedAll`).toBe(true);
  expect(o.result.passed, `${label} passed`).toBe(true);
}

beforeAll(async () => {
  await initLiveWindDrive();
});

// ---------------------------------------------------------------------------
// 0. The catalogue — who reads the wind
// ---------------------------------------------------------------------------

describe("crosswind — every compiled lesson that reads the wind is driven below", () => {
  it("nine compiled lessons author physics.crosswind: sc-ac-crosswind L1–L4, sc-ac-wind-truck-pass L1–L5", () => {
    const users: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const l of spec.levels) {
        const lesson = compileScenario(spec, l.level as ScenarioLevel);
        if (lesson.physics?.crosswind) users.push(lesson.id);
      }
    }
    expect(users.sort()).toEqual(
      [
        ...CROSSWIND_LEVELS.map((l) => `sc-ac-crosswind@L${l}`),
        ...TRUCK_LEVELS.map((l) => `sc-ac-wind-truck-pass@L${l}`),
      ].sort(),
    );
    expect(CROSSWIND_LEVELS).toEqual([1, 2, 3, 4]);
    expect(TRUCK_LEVELS).toEqual([1, 2, 3, 4, 5]);
  });
});

// ---------------------------------------------------------------------------
// 1. sc-ac-crosswind — „Страничен вятър", every rung
// ---------------------------------------------------------------------------

describe("sc-ac-crosswind on the real car — a correct drive holds the lane WITH the correction, at 0 т.", () => {
  for (const level of CROSSWIND_LEVELS) {
    it(
      `L${level}: a proportional wheel — 0 т., CLEAN_DRIVING, and the held correction is 3–5 % of full input`,
      () => {
        const o = drive(SC_AC_CROSSWIND, level, "analog");
        expectCleanPass(o, `L${level} analog`);
        expect(o.commendationCodes).toContain("CLEAN_DRIVING");
        // The lane is HELD — inside half a metre of the demo's own line, and
        // nowhere near the 3.25 m band on either side.
        expect(o.maxOffPathM).toBeLessThan(0.5);
        for (const s of o.samples) {
          expect(Math.abs(s.x - FO_LANE_CENTER_X)).toBeLessThan(DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM / 2);
        }
        // THE RULING. This street runs north and the wind blows west, so the
        // car is pushed LEFT and the correction is to the RIGHT (negative).
        const w = wheelShare(o.samples, taughtRun);
        expect(w.n, "at least two whole gust periods at the taught speed").toBeGreaterThanOrEqual(
          2 * CROSSWIND_GUST_PERIOD_SEC * 60,
        );
        expect(-w.mean, "the wheel").toBeGreaterThanOrEqual(RULED_MIN);
        expect(-w.mean, "the wheel").toBeLessThanOrEqual(RULED_MAX);
        // …and on the product's default tier the student's own hand is in the
        // band too (measured: wheel 3.6 %, hand 4.5 %).
        expect(DEFAULT_DIFFICULTY).toBe("normal");
        expect(-w.hand, "the hand").toBeGreaterThanOrEqual(RULED_MIN);
        expect(-w.hand, "the hand").toBeLessThanOrEqual(RULED_MAX);
        // CONSTANT, as step 5 says: the wheel never comes back to centre
        // while the wind blows, and never crosses it.
        expect(w.max).toBeLessThan(-0.005);
        // …and never a swing: the largest movement a gust-following driver
        // makes is a third of `SECOND_SWING.HOLD_RAD`.
        const maxSteerRad = Math.max(...o.samples.map((s) => Math.abs(s.steerRad)));
        expect(maxSteerRad).toBeLessThan(0.04);
        expect(maxSteerRad).toBeLessThan(SECOND_SWING.HOLD_RAD / 2);
        expect(o.secondSwingFires).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      `L${level}: the KEYBOARD's digital wheel — taps, and still 0 т. with the same mean correction`,
      () => {
        const o = drive(SC_AC_CROSSWIND, level, "keyboard");
        expectCleanPass(o, `L${level} keyboard`);
        expect(o.commendationCodes).toContain("CLEAN_DRIVING");
        expect(o.maxOffPathM).toBeLessThan(0.8);
        // It really is a keyboard: every input is a key down or no key.
        for (const s of o.samples) expect([-1, 0, 1]).toContain(s.steerInput);
        // No press shorter than a finger makes.
        let run = 0;
        let prev = 0;
        for (const s of o.samples) {
          if (s.steerInput === prev) {
            run++;
          } else {
            if (prev !== 0) expect(run).toBeGreaterThanOrEqual(KEY_MIN_PRESS_FRAMES);
            prev = s.steerInput;
            run = 1;
          }
        }
        // Where the taps leave the WHEEL on average is the same correction
        // (measured 3.7 %) — and the keys are mostly the RIGHT one.
        const w = wheelShare(o.samples, taughtRun);
        expect(-w.mean).toBeGreaterThanOrEqual(RULED_MIN);
        expect(-w.mean).toBeLessThanOrEqual(RULED_MAX);
        expect(w.hand).toBeLessThan(0);
        // A tapped wheel is not a swung one.
        expect(o.secondSwingFires).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      `L${level}: recoverable — hands back only after a full metre off the line, and still 0 т.`,
      () => {
        const o = drive(SC_AC_CROSSWIND, level, "late", { lateAfterM: 1 });
        expectCleanPass(o, `L${level} late`);
        // He WAS carried off (the wind is not optional)…
        expect(o.maxOffPathM).toBeGreaterThanOrEqual(1);
        // …and came back without ever nearing the band.
        expect(o.maxOffPathM).toBeLessThan(1.6);
        expect(o.secondSwingFires).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      `L${level}: NOT OPTIONAL — a driver who never touches the wheel does not finish, and is billed`,
      () => {
        const o = drive(SC_AC_CROSSWIND, level, "handsOff");
        expect(o.result.objectives.find((x) => x.id === "sc-acx-open")!.done).toBe(false);
        expect(o.result.objectives.find((x) => x.id === "sc-acx-finish")!.done).toBe(false);
        expect(o.result.completedAll).toBe(false);
        expect(o.result.passed).toBe(false);
        expect(o.violationCodes.length).toBeGreaterThan(0);
        expect(o.commendationCodes).not.toContain("CLEAN_DRIVING");
        // He is out of the 3.25 m lane-keep band, toward the осева, within a
        // few seconds of getting up to speed — the AC-12 danger, by physics.
        const moving = o.samples.find((s) => s.speedKmh > 20)!;
        const out = o.samples.find(
          (s) => FO_LANE_CENTER_X - s.x > DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM,
        );
        expect(out, "left the band on the centre-line side").toBeDefined();
        expect(out!.t - moving.t).toBeLessThan(6);
      },
      TEST_TIMEOUT,
    );
  }

  for (const tier of ["beginner", "advanced"] as const) {
    it(
      `L3 on the ${tier} tier: still 0 т., the wheel is the same 3–5 %, and the hand is that over the tier's sensitivity`,
      () => {
        const o = drive(SC_AC_CROSSWIND, 3, "analog", { difficulty: tier });
        expectCleanPass(o, `L3 analog ${tier}`);
        expect(o.secondSwingFires).toBe(0);
        const w = wheelShare(o.samples, taughtRun);
        expect(-w.mean, "the wheel").toBeGreaterThanOrEqual(RULED_MIN);
        expect(-w.mean, "the wheel").toBeLessThanOrEqual(RULED_MAX);
        const sens = DIFFICULTY_PRESETS[tier].steerSens;
        expect(w.hand / w.mean, "hand = wheel / sensitivity").toBeGreaterThan((1 / sens) * 0.93);
        expect(w.hand / w.mean, "hand = wheel / sensitivity").toBeLessThan((1 / sens) * 1.07);
        if (tier === "advanced") {
          expect(-w.hand).toBeGreaterThanOrEqual(RULED_MIN);
          expect(-w.hand).toBeLessThanOrEqual(RULED_MAX);
        } else {
          // DISCLOSED, not hidden: the calmest tier asks the hand for a little
          // more than the ruled 5 % (measured 6.2 %), because its wheel is
          // worth 0.6 of the hand. The wheel itself is the ruled size.
          expect(-w.hand).toBeGreaterThan(RULED_MAX);
          expect(-w.hand).toBeLessThan(0.07);
        }
      },
      TEST_TIMEOUT,
    );
  }

  it(
    "briefing step 4 on the street — at 50 км/ч the same hands-off second carries the car further than at 34",
    () => {
      // Metres to the LEFT of the lane centre, a fixed time after the car
      // first reaches 30 km/h (both drives pass through it on the way up).
      const carriedAfter = (cruiseKmh: number, sec: number) => {
        const o = drive(SC_AC_CROSSWIND, 3, "handsOff", { cruiseKmh });
        const from = o.samples.find((s) => s.speedKmh >= cruiseKmh - 1);
        const at = from && o.samples.find((s) => s.t >= from.t + sec);
        // NaN, not a throw, when the car never got there: the comparisons
        // below then fail as assertions and say which number was missing.
        return from && at ? from.x - at.x : Number.NaN;
      };
      const taught = carriedAfter(34, 1.5);
      const fast = carriedAfter(50, 1.5);
      expect(taught).toBeGreaterThan(0.5);
      expect(fast).toBeGreaterThan(taught * 1.15);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 2. sc-ac-wind-truck-pass — the motorway sibling, every rung (L5 is wet)
// ---------------------------------------------------------------------------

describe("sc-ac-wind-truck-pass on the real car — the sibling that reads the same wind still passes clean", () => {
  for (const level of TRUCK_LEVELS) {
    for (const driver of ["analog", "keyboard"] as const) {
      it(
        `L${level} ${driver}: the overtake at 70–78 км/ч — 0 т., both lane changes commended, every objective`,
        () => {
          const o = drive(SC_AC_WIND_TRUCK_PASS, level, driver);
          expectCleanPass(o, `L${level} ${driver}`);
          expect(o.commendationCodes.filter((c) => c === "SAFE_LANE_CHANGE")).toHaveLength(2);
          expect(o.commendationCodes).toContain("CLEAN_DRIVING");
          // A tapped wheel at 78 км/ч wanders more than a held one (measured
          // 0.5 m analog, 1.1–1.2 m keyboard) — against a 3.25 m band.
          expect(o.maxOffPathM).toBeLessThan(driver === "analog" ? 1.0 : 2.0);
          expect(o.secondSwingFires).toBe(0);
          if (driver === "analog") {
            // The correction is real here too, and SMALLER — at motorway speed
            // the pull rolls off so that the arc it turns the car onto stays
            // under the wind's own F/m (crosswindPull.ts), and the wheel that
            // holds the lane is 1.8 %, not 3.5.
            const cruise = wheelShare(o.samples, (s) => s.speedKmh > 66);
            expect(-cruise.mean).toBeGreaterThan(0.012);
            expect(-cruise.mean).toBeLessThan(0.024);
          }
        },
        TEST_TIMEOUT,
      );
    }

    it(
      `L${level}: hands off the wheel — the pass is never made and the drive is billed`,
      () => {
        const o = drive(SC_AC_WIND_TRUCK_PASS, level, "handsOff");
        expect(o.result.completedAll).toBe(false);
        expect(o.result.passed).toBe(false);
        expect(o.violationCodes.length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. ROUND 2 — THE KEYBOARD AND THE STICK, AT THE PRESSES FINGERS REALLY MAKE
// ---------------------------------------------------------------------------
//
// The founder ratified the yaw pull with keyboard driving included (2026-10-05).
// A key is full input or none, so no keyboard HOLDS 3.5 % — it holds the lane
// with taps whose AVERAGE is the correction. Two honest styles of tapping, both
// driven here:
//   · "keyboard"         — chases the wheel: presses toward the wish, and
//                          presses the OTHER key to pull an overshoot back;
//   · "keyboardRationed" — rations presses: press, let the wheel fall back by
//                          itself, press again when the car is owed more.
// MEASURED, minimum press 50 / 100 / 150 ms, all nine rungs: the rationed
// tapper is at 0 т. with every objective everywhere (line held to 0.35 / 0.55 /
// 0.55 m on the street, 0.7 / 0.8 / 1.8 m on the motorway); the chaser is at
// 0 т. at 50 and 100 ms everywhere. At 150 ms the chaser scrubs enough speed at
// 78 км/ч to be billed DRIVING_TOO_SLOW_FOR_MOTORWAY (1 т.) on the truck
// lesson — ON THE TREE BEFORE THE WIND HAD ANY PULL AS WELL (the same bill, the
// same rungs), so it is that driver, not this wind, and it is not asserted.
//
// AND «ВТОРИ ЗАМАХ» IS NEVER SAID TO A DRIVER WHO IS HOLDING HIS LANE BY TAPS.
// Round 1 measured the line once on the chaser at 150 ms (0 before the pull),
// 4 against 3 at 200 ms. It was reading a wheel that was still falling back
// after the key was up as a „held correction". It now reads the hand
// (`secondSwing.ts`, `steerInput`): 0 lines on both styles at 50–200 ms.

const TAP_PRESSES = [
  { ms: 50, frames: 3 },
  { ms: 100, frames: 6 },
  { ms: 150, frames: 9 },
] as const;

describe("round 2 — a keyboard holds the lane with taps: 0 т. at every rung, and never «втори замах»", () => {
  for (const [spec, levels, maxOff] of [
    [SC_AC_CROSSWIND, CROSSWIND_LEVELS, 1.0],
    [SC_AC_WIND_TRUCK_PASS, TRUCK_LEVELS, 2.4],
  ] as const) {
    for (const level of levels) {
      it(
        `${spec.id} L${level}: rationed taps of 50, 100 and 150 ms — 0 т., every objective, the line held, the cue silent`,
        () => {
          for (const press of TAP_PRESSES) {
            const o = drive(spec, level, "keyboardRationed", { keyMinPressFrames: press.frames });
            expectCleanPass(o, `L${level} rationed ${press.ms} ms`);
            expect(o.commendationCodes, `${press.ms} ms`).toContain("CLEAN_DRIVING");
            for (const s of o.samples) expect([-1, 0, 1]).toContain(s.steerInput);
            expect(o.maxOffPathM, `${press.ms} ms: the line is held`).toBeLessThan(maxOff);
            expect(o.secondSwingFires, `${press.ms} ms: «втори замах»`).toBe(0);
          }
        },
        TEST_TIMEOUT,
      );

      it(
        `${spec.id} L${level}: a wheel-chasing keyboard at 100 ms — still 0 т. with every objective, the cue silent`,
        () => {
          // (50 ms is the default press of the per-rung keyboard tests above.)
          const o = drive(spec, level, "keyboard", { keyMinPressFrames: 6 });
          expectCleanPass(o, `L${level} chase 100 ms`);
          expect(o.secondSwingFires).toBe(0);
        },
        TEST_TIMEOUT,
      );
    }
  }

  it(
    "THE CUE READS THE HAND — a wheel-chaser at 150 and 200 ms is not told he over-corrected (it was 1 and 4 lines on the street)",
    () => {
      for (const frames of [9, 12]) {
        const street = drive(SC_AC_CROSSWIND, 3, "keyboard", { keyMinPressFrames: frames });
        // He IS sawing at the wheel — ±0.2–0.4 rad of it, every tap — and he is
        // still inside his lane with nothing billed. The line is not for him.
        expect(Math.max(...street.samples.map((s) => Math.abs(s.steerRad)))).toBeGreaterThan(SECOND_SWING.HOLD_RAD * 2);
        expectCleanPass(street, `street chase ${frames} frames`);
        expect(street.secondSwingFires, `street, ${frames} frames`).toBe(0);
        const truck = drive(SC_AC_WIND_TRUCK_PASS, 3, "keyboard", { keyMinPressFrames: frames });
        expect(truck.secondSwingFires, `motorway, ${frames} frames`).toBe(0);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "a STICK with the product's dead zone cannot hold 4 % either — it pulses, at 0 т., and the wheel's mean is the correction",
    () => {
      for (const frames of [3, 6]) {
        const o = drive(SC_AC_CROSSWIND, 3, "gamepad", { keyMinPressFrames: frames });
        expectCleanPass(o, `gamepad ${frames} frames`);
        expect(o.maxOffPathM).toBeLessThan(0.5); // measured 0.22 / 0.25 m
        expect(o.secondSwingFires).toBe(0);
        // It really is dead-zoned: every input is nothing, or past 12 %.
        for (const s of o.samples) {
          expect(s.steerInput === 0 || Math.abs(s.steerInput) > GAMEPAD_DEADZONE).toBe(true);
        }
        const w = wheelShare(o.samples, taughtRun);
        expect(-w.mean).toBeGreaterThanOrEqual(RULED_MIN); // measured 3.6 %
        expect(-w.mean).toBeLessThanOrEqual(RULED_MAX);
        // THE DITHER, stated: the wheel swings −9.7 … +4.2 % of the lock around
        // that mean at 50 ms pulses, −11.7 … +7.9 % at 100 ms.
        expect(w.min).toBeGreaterThan(-0.14);
        expect(w.max).toBeLessThan(0.1);
        const truck = drive(SC_AC_WIND_TRUCK_PASS, 3, "gamepad", { keyMinPressFrames: frames });
        expectCleanPass(truck, `truck gamepad ${frames} frames`);
        expect(truck.secondSwingFires).toBe(0);
      }
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 4. ROUND 2 — THE HEAD LEANS WITH THE WIND WHEN THE LANE IS HELD (V-05)
// ---------------------------------------------------------------------------

const WIND_MS2 = CROSSWIND_BRIDGE_N / CHASSIS_MASS;
const meanOf = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("round 2 — the cockpit lean reports the WIND to the driver who holds his lane", () => {
  it(
    "sc-ac-crosswind: over whole gust periods at the taught speed the lean is the wind's own F/m, breathing with the gust",
    () => {
      for (const level of CROSSWIND_LEVELS) {
        const o = drive(SC_AC_CROSSWIND, level, "analog");
        const lean = wholePeriods(o.samples, taughtRun).map((s) => s.leanMs2);
        // Pushed LEFT on this street (+). Round 1 left him 0.34 m/s² of it.
        expect(meanOf(lean), `L${level} mean`).toBeGreaterThan(WIND_MS2 * 0.9); // measured 0.984 vs 0.984
        expect(meanOf(lean), `L${level} mean`).toBeLessThan(WIND_MS2 * 1.1);
        // It swells and eases with the gust (the cue step 6 sends him to),
        // and never changes side.
        expect(Math.max(...lean) - Math.min(...lean)).toBeGreaterThan(
          (CROSSWIND_GUST_AMPLITUDE_N / CHASSIS_MASS) * 1.5,
        );
        expect(Math.min(...lean)).toBeGreaterThan(0);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "sc-ac-wind-truck-pass at 70–78 км/ч: the same — where round 1 left the lane-holder's head level",
    () => {
      for (const level of [1, 5] as const) {
        const o = drive(SC_AC_WIND_TRUCK_PASS, level, "analog");
        const lean = wholePeriods(o.samples, (s) => s.speedKmh > 66).map((s) => s.leanMs2);
        expect(lean.length).toBeGreaterThan(2 * CROSSWIND_GUST_PERIOD_SEC * 60);
        expect(meanOf(lean), `L${level}`).toBeGreaterThan(WIND_MS2 * 0.9); // measured 0.973
        expect(meanOf(lean), `L${level}`).toBeLessThan(WIND_MS2 * 1.1);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "…and a driver who lets go is leaned HARDER than one who holds — the cue never rewards the loose hand",
    () => {
      const held = drive(SC_AC_CROSSWIND, 3, "analog");
      const loose = drive(SC_AC_CROSSWIND, 3, "handsOff");
      const heldPeak = Math.max(...held.samples.map((s) => s.leanMs2));
      const loosePeak = Math.max(...loose.samples.filter((s) => s.speedKmh > 25).map((s) => s.leanMs2));
      expect(loosePeak).toBeGreaterThan(heldPeak * 1.4); // measured 2.35 vs 1.30 m/s²
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 5. ROUND 2 — THE SIBLING'S SENTENCES, HELD AGAINST THE CAR (V-13, V-01)
// ---------------------------------------------------------------------------
//
// `teach.whyBg` of sc-ac-wind-truck-pass used to say, flat: «докато си зад него
// и до него, си в неговия завет и поривът не те бута». It now marks that as the
// road's («На пътя камионът е стена…») and says of THIS drive: «на завет не се
// разчита — камионът остава далеч пред теб и вятърът те натиска през цялото
// време, затова корекцията се държи още от началото». Each clause, measured.

/** Path metres at which the shadow's line is 15 m into the overtaking lane's
 *  straight (y 200 → 290): 105 m of cruise lane + the 80.4 m lane change. */
const OVERTAKING_STRAIGHT_FROM_M = 200;

describe("round 2 — sc-ac-wind-truck-pass says what its car does: no lee, the truck far ahead, the wheel held throughout", () => {
  for (const level of TRUCK_LEVELS) {
    it(
      `L${level}: «вятърът те натиска през цялото време» / «камионът остава далеч пред теб» / «корекцията се държи още от началото»`,
      () => {
        const o = drive(SC_AC_WIND_TRUCK_PASS, level, "analog");
        expectCleanPass(o, `L${level} analog`);
        // THE WIND NEVER STOPS, anywhere on the drive: the gust's own floor.
        const floorN = CROSSWIND_BRIDGE_N - CROSSWIND_GUST_AMPLITUDE_N;
        for (const s of o.samples) {
          expect(s.windN).toBeLessThanOrEqual(-floorN + 1e-6); // westward, always
          expect(s.windPullRad).toBeGreaterThan(0); // and always turning the car LEFT
        }
        // THE TRUCK IS NEVER ABEAM — and never behind: it is ahead by at least
        // seven car lengths for the whole drive (measured 37–73 m), so there
        // is no moment at which the car is in its shadow.
        const moving = o.samples.filter((s) => s.speedKmh > 20);
        for (const s of moving) {
          expect(s.truckAheadM, `t=${s.t.toFixed(1)}`).not.toBeNull();
          expect(s.truckAheadM!, `t=${s.t.toFixed(1)}`).toBeGreaterThan(30);
        }
        // THE CORRECTION IS HELD BEHIND THE TRUCK AND IN THE OVERTAKING LANE
        // ALIKE — to the right, i.e. toward the truck from the left lane, as
        // step 7 says. Measured 1.1 % of the lock behind it (still gathering
        // speed) and 2.1 % beside where the old text put the lee.
        const behind = o.samples.filter((s) => s.speedKmh > 50 && Math.abs(s.x) < 1 && s.y < 130);
        const beside = o.samples.filter((s) => Math.abs(s.x + 8.12) < 1 && s.y > 210 && s.y < 370);
        expect(behind.length).toBeGreaterThan(120);
        expect(beside.length).toBeGreaterThan(300);
        const share = (xs: LiveWindSample[]) => meanOf(xs.map((s) => -s.steerRad / maxSteerRadAt(s.speedKmh)));
        expect(share(behind)).toBeGreaterThan(0.007);
        expect(share(beside)).toBeGreaterThan(0.012);
        expect(share(beside)).toBeLessThan(0.03);
        // …and in the overtaking lane the wheel never comes back to centre.
        expect(Math.max(...beside.map((s) => s.steerRad))).toBeLessThan(0.002);
      },
      TEST_TIMEOUT,
    );
  }

  it(
    "what believing in a lee costs there: two seconds of loose wheel in the overtaking lane carries the car more than a metre toward the median",
    () => {
      const o = drive(SC_AC_WIND_TRUCK_PASS, 3, "analog", { lapse: { atPathM: OVERTAKING_STRAIGHT_FROM_M, forSec: 2 } });
      expect(o.lapseStartedAtSec).not.toBeNull();
      const a = o.samples.find((s) => s.t >= o.lapseStartedAtSec!)!;
      const b = o.samples.find((s) => s.t >= o.lapseStartedAtSec! + 2)!;
      // In the overtaking lane, the truck 60 m ahead, at the shadow's ~74 км/ч.
      expect(Math.abs(a.x + 8.12)).toBeLessThan(1);
      expect(a.truckAheadM!).toBeGreaterThan(45);
      // LEFT — toward the median («към разделителната ивица отляво»).
      expect(a.x - b.x).toBeGreaterThan(1.0);
      expect(a.x - b.x).toBeLessThan(2.6);
      // He takes the wheel back and still finishes clean: a lesson, not a trap.
      expectCleanPass(o, "2 s lapse");
    },
    TEST_TIMEOUT,
  );

  it(
    "STEP 5 ON ITS OWN MOTORWAY — «по-бавно покрай камиона значи по-малко отместване от порива»: what letting go costs rises with speed, 54 < 60 < 70 < 78 < 90 км/ч",
    () => {
      // WHAT IS MEASURED: the displacement CAUSED BY LETTING GO — the same
      // drive with and without three seconds of loose wheel, compared at the
      // same instants — on the lesson's own stack, in the MEAN wind without
      // its gust (a faster car reaches any place at a different phase of the
      // gust, and the sentence is about speed).
      //
      // WHERE, AND WHY NOT IN THE OVERTAKING LANE ITSELF. The lesson's line
      // spends only 90 m in the overtaking lane, and they begin with the lane
      // change. For the first ~40 m after pulling out what a lapse does is
      // governed by where the driver is in his own manoeuvre, not by the wind:
      // measured the same way 15 m into that straight the figure RISES with
      // speed (1.67 m at 54 км/ч → 2.35 at 90), 30–40 m into it it FALLS
      // (1.49 → 1.11) — and it did both under round 1's law as well. So the
      // sentence is tested where a driver is settled: 64 m after the return,
      // on the same road, in the same wind. There it is the wind's own
      // property, and there round 1 was FALSE (1.85 m at 54 км/ч, 1.83 at 60,
      // 1.79 at 70, 1.78 at 78 — falling).
      const SETTLED_AT_M = 520; // 64 m into the last straight (y ≈ 534)
      const lesson = compileScenario(SC_AC_WIND_TRUCK_PASS, 3);
      expect(lesson.physics?.crosswind).toBe(true);
      const cost = (cruiseKmh: number) => {
        const base = { cruiseKmh, simOptions: { gripFactor: 1, windLateralN: -CROSSWIND_BRIDGE_N } };
        const loose = drive(SC_AC_WIND_TRUCK_PASS, 3, "analog", { ...base, lapse: { atPathM: SETTLED_AT_M, forSec: 3 } });
        const held = drive(SC_AC_WIND_TRUCK_PASS, 3, "analog", base);
        const t0 = loose.lapseStartedAtSec!;
        const a = loose.samples.find((s) => s.t >= t0)!;
        // Up to speed, in his lane and ON his line when the wheel is let go.
        expect(Math.abs(a.speedKmh - cruiseKmh), `${cruiseKmh}: at speed`).toBeLessThan(3);
        expect(Math.abs(a.offPathM), `${cruiseKmh}: settled on the line`).toBeLessThan(0.06);
        const xAt = (o: LiveWindDriveOutcome, t: number) => o.samples.find((s) => s.t >= t)!.x;
        // LEFT of where the driver who kept his hands on is, after 1 / 1.5 / 2 s.
        return [1, 1.5, 2].map((dt) => xAt(held, t0 + dt) - xAt(loose, t0 + dt));
      };
      const speeds = [54, 60, 70, 78, 90];
      const table = speeds.map(cost);
      // Measured: 1 s 0.363 / 0.367 / 0.371 / 0.377 / 0.400 m;
      //           2 s 1.529 / 1.560 / 1.590 / 1.611 / 1.674 m.
      for (let t = 0; t < 3; t++) {
        for (let i = 1; i < speeds.length; i++) {
          expect(
            table[i]![t]!,
            `${[1, 1.5, 2][t]} s: ${speeds[i]} км/ч (${table[i]![t]!.toFixed(3)} m) vs ${speeds[i - 1]} км/ч (${table[i - 1]![t]!.toFixed(3)} m)`,
          ).toBeGreaterThan(table[i - 1]![t]!);
        }
      }
      // A real difference and a small one: 5 % between 54 and 78 км/ч at 2 s.
      expect(table[0]![2]!).toBeGreaterThan(1.3);
      expect(table[4]![2]!).toBeLessThan(1.9);
      expect(table[0]![2]! / table[3]![2]!).toBeLessThan(0.97);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 6. ROUND 2 — THE DEMO'S WHEEL IS THE LIVE DRIVER'S WHEEL (V-06)
// ---------------------------------------------------------------------------

describe("round 2 — the correct demo shows the wheel a live driver on the same line actually holds", () => {
  it(
    "sc-ac-crosswind: on the taught stretch the committed shadow's wheel and the live driver's agree — in side, in size, and in never being centred",
    () => {
      const demo = CROSSWIND_SHADOW.samples.filter((s) => s.speedKmh > 31 && s.speedKmh < 37);
      const demoMean = meanOf(demo.map((s) => s.steerRad));
      const live = wholePeriods(drive(SC_AC_CROSSWIND, 3, "analog").samples, taughtRun);
      const liveMean = meanOf(live.map((s) => s.steerRad));
      // Both to the RIGHT (measured −0.0178 rad on the demo, −0.0183 live;
      // before round 2 the demo's was 0.000).
      expect(demoMean).toBeLessThan(-0.015);
      expect(liveMean).toBeLessThan(-0.015);
      expect(demoMean / liveMean).toBeGreaterThan(0.9);
      expect(demoMean / liveMean).toBeLessThan(1.1);
      expect(Math.max(...demo.map((s) => s.steerRad))).toBeLessThan(-0.004);
      // A student who copies the demo's wheel holds the ruled band.
      const share = meanOf(demo.map((s) => -s.steerRad / maxSteerRadAt(s.speedKmh)));
      expect(share).toBeGreaterThanOrEqual(RULED_MIN);
      expect(share).toBeLessThanOrEqual(RULED_MAX);
    },
    TEST_TIMEOUT,
  );

  it(
    "sc-ac-wind-truck-pass: the same at 70–78 км/ч — the shadow holds what the live car needs behind the truck and past it",
    () => {
      const demo = TRUCK_SHADOW.samples.filter((s) => s.speedKmh > 66);
      const live = wholePeriods(drive(SC_AC_WIND_TRUCK_PASS, 3, "analog").samples, (s) => s.speedKmh > 66);
      const demoMean = meanOf(demo.map((s) => s.steerRad));
      const liveMean = meanOf(live.map((s) => s.steerRad));
      expect(demoMean).toBeLessThan(-0.004); // measured −0.0056 rad
      expect(liveMean).toBeLessThan(-0.004);
      expect(demoMean / liveMean).toBeGreaterThan(0.75);
      expect(demoMean / liveMean).toBeLessThan(1.25);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 7. ROUND 3 — EVERY SENTENCE THAT SAYS WHAT THE WIND DOES, ON THE CAR
// ---------------------------------------------------------------------------
//
// Round 2's verifier (V2-01, V2-02) found sentences in both lessons giving the
// wind an effect the live wind cannot have. The wind on these lessons blows
// ONE way — west, the car's LEFT on both northbound drives, 700–1700 N on
// every sample — and it holds a car nowhere. Each rewritten sentence is read
// here from the surface the student meets it on (the template, the committed
// demo JSON in BOTH copies, the scene source), the false clause is shown gone,
// and the clause that replaced it is driven on the real car at EVERY rung.

const SCENE_SRC = readFileSync(path.resolve(HERE, "../../../../../components/sim/LessonScene.tsx"), "utf-8");

/** The annotation captions of a committed demo, from BOTH shipped copies
 *  (content/ and platform/public/), which must agree. */
function captionsOf(rel: string): string[] {
  const read = (p: string) =>
    (JSON.parse(readFileSync(path.join(REPO_ROOT, p), "utf-8")) as { events: Array<{ kind: string; textBg?: string }> }).events
      .filter((e) => e.kind === "annotation")
      .map((e) => e.textBg ?? "");
  const content = read(rel);
  expect(read(rel.replace(/^content\//, "platform/public/")), `${rel}: public copy`).toEqual(content);
  return content;
}

/** Session time → the first sample at or after it (the last one past the end). */
function at(o: LiveWindDriveOutcome, t: number): LiveWindSample {
  return o.samples.find((s) => s.t >= t) ?? o.samples[o.samples.length - 1]!;
}

/** Path metres 15 m into the sibling's overtaking straight (§5). */
const CLIP_AT_M = OVERTAKING_STRAIGHT_FROM_M;
/** «Рязката корекция срещу порива»: the hand thrown a third of the way to the
 *  right — toward the truck, against the westward gust — for 0.6 s, then the
 *  driver takes the wheel back. */
const SHARP_CORRECTION = [{ forSec: 0.6, input: -0.35 }] as const;

describe("round 3 — sc-ac-wind-truck-pass: the throw back toward the truck is the sharp correction's, never the gust's", () => {
  it("the card and the clip demo's captions say so, and no longer say the gust threw the car at the truck", () => {
    const card = SC_AC_WIND_TRUCK_PASS.mistakes[1]!.whatWentWrongBg;
    expect(card).toContain("рязката корекция срещу порива я хвърли обратно към камиона — и последва удар");
    expect(card).not.toContain("поривът я хвърли");
    const clip = captionsOf("content/traces/sc-ac-wind-truck-pass/mistake-clip-truck.trace.json");
    expect(clip).toContain(
      "До кабината, в тясната пролука между колата и ремаркето — рязката корекция срещу порива я хвърля обратно към камиона.",
    );
    expect(clip).toContain(
      "Грешката: тясна пролука до ремаркето и висока скорост — вятърът иска корекция, а пролуката не оставя място за грешка с нея.",
    );
    expect(clip.join(" ")).not.toContain("поривът я хвърля");
    expect(clip.join(" ")).not.toContain("вятърът не оставя място за реакция");
  });

  for (const level of TRUCK_LEVELS) {
    it(
      `L${level}: the wind blows away from the truck; a loose wheel goes to the median, a sharp correction against the gust goes at the truck`,
      () => {
        const held = drive(SC_AC_WIND_TRUCK_PASS, level, "analog");
        const sharp = drive(SC_AC_WIND_TRUCK_PASS, level, "analog", {
          handScript: { atPathM: CLIP_AT_M, steps: SHARP_CORRECTION },
        });
        const loose = drive(SC_AC_WIND_TRUCK_PASS, level, "analog", { lapse: { atPathM: CLIP_AT_M, forSec: 2 } });
        // THE TRUCK IS TO THE RIGHT (east) of the overtaking lane — and the
        // wind, on every sample of all three drives, pushes WEST.
        const t0 = sharp.handScriptStartedAtSec!;
        const a = at(sharp, t0);
        expect(Math.abs(a.x + 8.12), "in the overtaking lane").toBeLessThan(1);
        expect(a.truckRightM!, "the truck is to the right").toBeGreaterThan(6);
        for (const o of [held, sharp, loose]) {
          for (const s of o.samples) expect(s.windN).toBeLessThan(0);
        }
        // «…вятърът иска корекция»: let go there, the car goes the OTHER way
        // from the truck — measured 2.8–2.9 m toward the median in 2 s.
        const l0 = loose.lapseStartedAtSec!;
        const x0 = at(loose, l0).x;
        const looseEast = Math.max(...loose.samples.filter((s) => s.t >= l0 && s.t <= l0 + 2).map((s) => s.x)) - x0;
        expect(x0 - at(loose, l0 + 2).x, "loose: carried west, toward the median").toBeGreaterThan(1);
        expect(looseEast, "loose: never toward the truck").toBeLessThan(0.05);
        // «…рязката корекция срещу порива я хвърля обратно към камиона»: a
        // sharp hand toward the truck throws the car at it — measured a peak
        // of 3.0–3.8 m east within 2 s, even with the driver taking the wheel
        // straight back.
        const sharpEast = Math.max(...sharp.samples.filter((s) => s.t >= t0 && s.t <= t0 + 2).map((s) => s.x)) - a.x;
        expect(sharpEast, "sharp: thrown east, toward the truck").toBeGreaterThan(2);
        // And the held drive, which does neither, is the clean one.
        expectCleanPass(held, `L${level} held`);
      },
      TEST_TIMEOUT,
    );
  }
});

describe("round 3 — the loose-hand demos: the wind holds the car nowhere; it keeps carrying it", () => {
  it("both captions drop «вятърът я държи там» and keep the rest of the sentence", () => {
    const street = captionsOf("content/traces/sc-ac-crosswind/mistake-full-speed.trace.json");
    expect(street).toContain("Колата язди осевата линия в насрещното, докато водачът не се събуди.");
    const motorway = captionsOf("content/traces/sc-ac-wind-truck-pass/mistake-blown-out.trace.json");
    expect(motorway).toContain("Колата се понесе през половин лента към мантинелата, докато водачът се събуди.");
    for (const c of [...street, ...motorway]) expect(c).not.toContain("държи там");
  });

  for (const level of CROSSWIND_LEVELS) {
    it(
      `L${level} street, 50 км/ч with a loose hand: past the centre line nothing holds the car — and a driver who wakes there brings it back`,
      () => {
        const off = drive(SC_AC_CROSSWIND, level, "handsOff", { cruiseKmh: 50 });
        const i = off.samples.findIndex((s) => s.x <= 0.55);
        expect(i, "it reaches the centre line").toBeGreaterThan(0);
        // NOT HELD THERE: from the line on, the car never once moves back
        // toward its lane while it is moving (measured 0 frames), and 2 s
        // later it is 7 m further across (x = −6.5 m) — off the carriageway.
        let back = 0;
        for (let k = i + 1; k < off.samples.length; k++) {
          const s = off.samples[k]!;
          if (s.speedKmh > 5 && s.x > off.samples[k - 1]!.x + 1e-6) back++;
        }
        expect(back).toBe(0);
        expect(at(off, off.samples[i]!.t + 2).x).toBeLessThan(-4);
        expect(off.violationCodes).toContain("OFF_CARRIAGEWAY");
        // «…язди осевата линия в насрещното, докато водачът не се събуди»: the
        // driver who wakes up only once the car is 3.5 m off his line reaches
        // the centre line (measured 0.10 m from it) and brings it back.
        const late = drive(SC_AC_CROSSWIND, level, "late", { cruiseKmh: 50, lateAfterM: 3.5 });
        expect(Math.min(...late.samples.map((s) => s.x)), "rides the line").toBeLessThan(0.5);
        expect(Math.abs(late.samples[late.samples.length - 1]!.offPathM), "and is brought back").toBeLessThan(0.5);
      },
      TEST_TIMEOUT,
    );
  }

  for (const level of TRUCK_LEVELS) {
    it(
      `L${level} motorway, a loose wheel in the overtaking lane: carried half a lane toward the median until he takes it back — and, left alone, out of the lane`,
      () => {
        // «…се понесе през половин лента към мантинелата, докато водачът се
        // събуди»: 2.5 s of loose wheel carries the car 4.3–4.5 m west (the
        // lane's half-width is 4.06 m); he takes it back and finishes clean.
        const woke = drive(SC_AC_WIND_TRUCK_PASS, level, "analog", { lapse: { atPathM: CLIP_AT_M, forSec: 2.5 } });
        const w0 = woke.lapseStartedAtSec!;
        const x0 = at(woke, w0).x;
        const carried = x0 - Math.min(...woke.samples.filter((s) => s.t >= w0).map((s) => s.x));
        expect(carried).toBeGreaterThan(3.5);
        expect(carried).toBeLessThan(5);
        expectCleanPass(woke, `L${level} woke after 2.5 s`);
        // NOT HELD THERE: six seconds of loose wheel and the car never once
        // moves back east; by 4 s it is past the lane's median-side edge.
        const off = drive(SC_AC_WIND_TRUCK_PASS, level, "analog", { lapse: { atPathM: CLIP_AT_M, forSec: 6 } });
        const o0 = off.lapseStartedAtSec!;
        const win = off.samples.filter((s) => s.t >= o0 + 0.5 && s.t < o0 + 6);
        for (let k = 1; k < win.length; k++) expect(win[k]!.x).toBeLessThanOrEqual(win[k - 1]!.x);
        expect(at(off, o0 + 4).x).toBeLessThan(-12.19);
      },
      TEST_TIMEOUT,
    );
  }
});

// The second-swing coaching copy, shown on both lessons by `LessonScene`.
const SWING_CHIP = "Втори замах! Отпускай корекцията плавно — рязко назад изхвърля колата натам, накъдето бута вятърът.";
const SWING_REPLAY =
  "Втори замах: воланът мина рязко от задържаната корекция на другата страна, натам, накъдето бута вятърът — вятърът и воланът избутаха колата в една и съща посока.";

/** The movement the detector exists for, on each lesson: the correction held
 *  into the wind for 0.6 s, then the hand thrown to the other side for 0.5 s.
 *  Placed where the gust is still BUILDING at the fire, so the test also
 *  shows why «който вече бе отслабнал» had to go. */
const SWINGS: ReadonlyArray<{ spec: ScenarioSpec; levels: readonly ScenarioLevel[]; atPathM: number; hand: number; where: string }> = [
  { spec: SC_AC_CROSSWIND, levels: CROSSWIND_LEVELS, atPathM: 120, hand: 0.35, where: "toward the centre line" },
  { spec: SC_AC_WIND_TRUCK_PASS, levels: TRUCK_LEVELS, atPathM: 90, hand: 0.5, where: "toward the overtaking lane and the median" },
];

describe("round 3 — «втори замах» says what the detector measures, in a direction true on both lessons", () => {
  it("the chip and the replay line are the new sentences; the kerb and the eased gust are gone", () => {
    const flat = SCENE_SRC.replace(/\s+/g, " ");
    expect(flat).toContain(SWING_CHIP);
    expect(SCENE_SRC).toContain(`"${SWING_REPLAY}"`);
    expect(flat).not.toContain("рязко назад изхвърля колата към бордюра");
    expect(SCENE_SRC).not.toContain("който вече бе отслабнал");
  });

  for (const { spec, levels, atPathM, hand, where } of SWINGS) {
    for (const level of levels) {
      it(
        `${spec.id} L${level}: a held correction thrown to the other side fires the cue, and the car goes where the wind pushes — ${where}`,
        () => {
          const script = (second: { forSec: number; input: number; to?: number }) => ({
            atPathM,
            steps: [{ forSec: 0.6, input: -hand }, second],
          });
          const swung = drive(spec, level, "analog", { handScript: script({ forSec: 0.5, input: hand }) });
          const letGo = drive(spec, level, "analog", { handScript: script({ forSec: 0.5, input: 0 }) });
          const eased = drive(spec, level, "analog", { handScript: script({ forSec: 1, input: -hand, to: 0 }) });
          expect(swung.secondSwingFiredAtSec.length, "the cue fires").toBeGreaterThan(0);
          const tf = swung.secondSwingFiredAtSec[0]!;
          const f = at(swung, tf);
          // «…воланът мина рязко от задържаната корекция на другата страна,
          // натам, накъдето бута вятърът»: at the fire the wheel is on the
          // LEFT and the wind pushes LEFT (west), on both lessons.
          expect(f.windN).toBeLessThan(0);
          expect(f.steerRad).toBeGreaterThanOrEqual(SECOND_SWING.SWING_RAD);
          // NOT «вече бе отслабнал»: here the gust is still building.
          expect(Math.abs(at(swung, tf + 0.1).windN)).toBeGreaterThan(Math.abs(f.windN));
          // «…изхвърля колата натам, накъдето бута вятърът» / «вятърът и воланът
          // избутаха колата в една и съща посока»: west of where it was at the
          // fire after 1 s and 2 s (street 1.1 / 2.4 m, motorway 1.4–1.6 /
          // 8.4–9.7 m) …
          expect(at(swung, tf + 1).x - f.x).toBeLessThan(-0.5);
          expect(at(swung, tf + 2).x - f.x).toBeLessThan(-1);
          // … further west than a hand that just let go of the same correction
          // at the same instant, and far further than one that eased it off.
          expect(at(swung, tf + 1).x - at(letGo, tf + 1).x, "vs let go").toBeLessThan(-0.5);
          expect(at(swung, tf + 1).x - at(eased, tf + 1).x, "vs eased").toBeLessThan(-2);
        },
        TEST_TIMEOUT,
      );
    }
  }
});
