/**
 * sc-ac-wind-truck-pass — THE RESTAGE, MEASURED (sc-ac-wind-truck-pass:ff1d4290).
 *
 * THE ROW (filed by the crosswind lane's round-2 verifier, V2-03, and builder,
 * V-13): «The truck-pass crosswind lesson never lets the student pass the
 * truck: the truck is staged matchPlayer and stays 36–80 m ahead on every
 * sample of the drive, so it is never abeam or behind. Step 8 … can never
 * trigger and a student who obeys it literally fails objectives 2 and 3 at all
 * five rungs; objective 1 … and the correct demo's last caption … describe a
 * pass the world never stages, and the lee behind and beside the truck that
 * the lesson teaches is never reachable.»
 *
 * MEASURED ON THE BASE TREE (43b4109) with the census below — the frozen `base`
 * half of `wind-lessons-live-census.json`: through the live rung chain the
 * truck is 33.2–92.8 m AHEAD on every frame of every demo at every rung, the
 * correct demo collects all three tasks beside an empty lane, and the «удар в
 * камиона» demo is billed nothing at any rung (its crash was a scripted event
 * 8 m of air from a rig that was 34 m up the road).
 *
 * WHAT THE FOUNDER'S DELEGATION OF 2026-10-08 DECIDED, and what is pinned here:
 *   1. THE TRUCK HOLDS ITS OWN SPEED — 40 км/ч on a scheduled cruise, under the
 *      motorway floor a student may lawfully hold in the overtaking lane, so a
 *      lawful drive passes it at every rung. The pass window is measured, at
 *      the taught speed and at the slowest lawful one.
 *   2. A REAL LEE — beside the truck and in its wake the wind's ONE force
 *      (ADR-012, unchanged) is multiplied by `vehicle/windShelter.ts`; one car
 *      length past the cab it is whole again. Measured on the car: the force,
 *      the wheel that holds the lane, and what a hand that ignores it does.
 *   3. THE TASKS FIRE ON A PASS AND ONLY ON A PASS — level with the cab in the
 *      overtaking lane within the cap; back in the right lane with the whole
 *      truck behind. A drive that stays behind completes nothing.
 *   4. THE DEMOS do what their captions say (`traces/__tests__/
 *      sc-ac-wind-truck-pass-traces.test.ts` measures each caption), and here
 *      each is replayed through the live chain at every rung.
 *   5. EVERY SHOWN SENTENCE that says what the wind or the truck does is read
 *      off the surface it is shown on and held against the car.
 * And sc-ac-crosswind — the only other lesson that reads the wind — is
 * byte-identical in grading: its half of the census is compared to `base`.
 *
 * ROUND 2 (the round-1 verifier's findings; §9 below and the places marked):
 *   F-01  A RETURN THAT MAKES THE TRUCK BRAKE HARD is billed
 *         (LANE_ENTRY_FORCED_BRAKING, on the truck's own account of speed shed
 *         because of him), is not praised, and does not complete the second
 *         task by the gap the truck's braking then opens. Driven on the live
 *         car: 3.0 / 4.5 / 6.5 m ahead of the bumper, at the slowest lawful
 *         speed and the taught one, at every rung; and 10 / 15 / 20 m, clean.
 *   F-04  the «рязка корекция» demo is billed EXACTLY COLLISION at every rung.
 *   F-05  «на безопасна дистанция завет няма» holds at the product's own bill
 *         line: the wake ends where FOLLOWING_TOO_CLOSE begins.
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { createRuleEngine, DEFAULT_RULE_CONFIG, LANE_ENTRY_ACT_COPY, reduceTick } from "../../../rules";
import { guidanceGoalFor } from "../../../scene/guidanceRoute";
import { advisorPromptForObjective, shownObjectiveCapKmh } from "../../advisor";
import { ROUTE_RUNOUT_ARRIVE_M, routeEndMark } from "../../finish";
import { parseObjectiveParams } from "../../objectives";
import { createLessonWindShelter, lessonWindShelterActors } from "../../../scene/lessonWindShelter";
import { parseScenarioTrace } from "../../../traces/parse";
import { recordScriptedDrive } from "../../../traces/recorder";
import type { ScenarioTrace } from "../../../traces/types";
import type { StagedEventSpec } from "../../../contracts";
import {
  CHASSIS_HALF_EXTENTS,
  CHASSIS_MASS,
  CROSSWIND_BRIDGE_N,
  CROSSWIND_GUST_AMPLITUDE_N,
  WIND_SHELTER_CAR_LENGTH_M,
  WIND_SHELTER_RESIDUAL,
  WIND_SHELTER_WAKE_M,
} from "../../../vehicle";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import { SC_AC_CROSSWIND } from "../templates-conditions";
import { SC_AC_WIND_TRUCK_PASS } from "../templates-conditions2";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import {
  initLiveWindDrive,
  liveWindDrive,
  maxSteerRadAt,
  type LiveWindDriveOptions,
  type LiveWindDriveOutcome,
  type LiveWindSample,
} from "./liveWindDrive";
import CENSUS from "./wind-lessons-live-census.json";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const TEST_TIMEOUT = 240_000;
const PRINT_TO = process.env.RESTAGE_PRINT;
const RECORD_CENSUS = process.env.RECORD_WIND_CENSUS === "1";
const note = (line: string): void => {
  if (PRINT_TO) appendFileSync(PRINT_TO, line + "\n");
};

function loadJson(rel: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, rel), "utf-8")) as unknown;
}
function loadTrace(rel: string): ScenarioTrace {
  const t = parseScenarioTrace(loadJson(rel));
  if (t === null) throw new Error(`${rel} did not parse`);
  return t;
}

const MW = loadJson("content/world/mw-v1.json");
const FO = loadJson("content/world/fo-follow-v1.json");
const SHADOW = loadTrace(SC_AC_WIND_TRUCK_PASS.shadow.path);
const LEVELS = SC_AC_WIND_TRUCK_PASS.levels.map((l) => l.level as ScenarioLevel);
const TRUCK_ID = "sc-acw-truck";
const TRUCK_HALF_LEN = 3.75;
const TRUCK_HALF_WIDTH = 1.2;
const CAR_HALF_LEN = CHASSIS_HALF_EXTENTS.z;
const BOTH_HALVES = TRUCK_HALF_LEN + CAR_HALF_LEN;
const OVERTAKE_X = -8.12;
/** The open wind's envelope and the lee's, N. */
const OPEN_MIN = CROSSWIND_BRIDGE_N - CROSSWIND_GUST_AMPLITUDE_N;
const OPEN_MAX = CROSSWIND_BRIDGE_N + CROSSWIND_GUST_AMPLITUDE_N;
/** The slowest speed a student may lawfully hold in the overtaking lane. */
const MOTORWAY_FLOOR_KMH = DEFAULT_RULE_CONFIG.motorwayMinFlowKmh;
/** The lesson's taught pass speed (the committed shadow's) and the slowest
 *  lawful one with the pedal's own ±1 км/ч of hunting above the floor. */
const TAUGHT_KMH = 62;
const SLOWEST_LAWFUL_KMH = 53;

beforeAll(async () => {
  await initLiveWindDrive();
});

// ---------------------------------------------------------------------------
// The live car, driven past the truck by a driver who watches the TRUCK
// ---------------------------------------------------------------------------

type DriveExtra = Partial<Pick<LiveWindDriveOptions, "noShelter" | "lapse" | "handScript" | "driver">> & {
  neverPass?: boolean;
  passWhenGapM?: number;
  /** Stay out until the truck's nose is this far behind the car's tail (default 12 m). */
  returnWhenClearM?: number;
  /** Metres the RETURN lane change is spread over (default: the pull-out's 80). */
  returnChangeOverM?: number;
  /** Behind the truck: the bumper gap to settle at (default 30 m). */
  followGapM?: number;
};
function passDrive(level: ScenarioLevel, kmh: number, extra: DriveExtra = {}): LiveWindDriveOutcome {
  const { neverPass, passWhenGapM, returnWhenClearM, returnChangeOverM, followGapM, driver, ...rest } = extra;
  return liveWindDrive({
    lesson: compileScenario(SC_AC_WIND_TRUCK_PASS, level),
    districtRaw: MW,
    trace: SHADOW,
    driver: driver ?? "analog",
    cruiseKmh: kmh,
    maxSec: 200,
    lanePlan: {
      homeX: 0,
      passX: OVERTAKE_X,
      // Three seconds of road to the truck's tail at the pass speed, never
      // under 45 m: the pull-out the briefing's step 4 asks for.
      passWhenGapM: passWhenGapM ?? Math.max(45, (kmh / 3.6) * 3),
      returnWhenClearM: returnWhenClearM ?? 12,
      changeOverM: 80,
      ...(returnChangeOverM !== undefined ? { returnChangeOverM } : {}),
      ...(followGapM !== undefined ? { followGapM } : {}),
      ...(neverPass ? { neverPass: true } : {}),
      stopAtY: 915,
    },
    ...rest,
  });
}

/** The car's centre ahead of the truck's (+) on a sample, or null with no truck. */
const alongOf = (s: LiveWindSample): number | null => (s.truckAheadM === null ? null : -s.truckAheadM);
const wheelShare = (s: LiveWindSample): number => s.steerRad / maxSteerRadAt(s.speedKmh);
const mean = (xs: readonly number[]): number => (xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length);

interface PassWindow {
  /** First sample with any shelter / last one, and the full-lee stretch. */
  leeFrom: LiveWindSample;
  leeTo: LiveWindSample;
  fullLee: LiveWindSample[];
  /** First sample past the cab with the whole wind back. */
  openAgain: LiveWindSample;
  drewLevelAt: LiveWindSample;
  overtakenAt: LiveWindSample;
}
function passWindow(o: LiveWindDriveOutcome): PassWindow {
  const s = o.samples;
  const lee = s.filter((x) => x.shelter < 1);
  expect(lee.length, "samples in the truck's lee").toBeGreaterThan(0);
  const leeTo = lee[lee.length - 1]!;
  const openAgain = s.find((x) => x.t > leeTo.t);
  expect(openAgain, "the whole wind came back after the lee").toBeDefined();
  const at = (tSec: number) => s.reduce((b, x) => (Math.abs(x.t - tSec) < Math.abs(b.t - tSec) ? x : b));
  const level = o.outcomes.find((x) => x.detail === "drewLevel");
  const over = o.outcomes.find((x) => x.detail === "overtaken");
  expect(o.outcomes.map((x) => x.detail), "the truck's two reports").toEqual(["drewLevel", "overtaken"]);
  if (!level || !over) throw new Error("unreachable");
  return {
    leeFrom: lee[0]!,
    leeTo,
    fullLee: s.filter((x) => x.shelter <= WIND_SHELTER_RESIDUAL + 1e-9),
    openAgain: openAgain!,
    drewLevelAt: at(level.tSec),
    overtakenAt: at(over.tSec),
  };
}

function expectCleanPass(o: LiveWindDriveOutcome, label: string): void {
  expect(o.violationCodes, `${label} violations`).toEqual([]);
  expect(o.result.score, `${label} score`).toBe(0);
  expect(o.result.objectives.map((x) => x.done), `${label} objectives`).toEqual([true, true, true]);
  expect(o.session.phase, `${label} phase`).toBe("completed");
  expect(o.result.passed, `${label} passed`).toBe(true);
  expect(o.outcomes.map((x) => x.detail), `${label} reports`).toEqual(["drewLevel", "overtaken"]);
}

// ---------------------------------------------------------------------------
// 0. What is staged — the authored facts
// ---------------------------------------------------------------------------

describe("the staging: a truck that holds its own speed, below every lawful student speed, with no limit raised and no cap dropped", () => {
  const truck = SC_AC_WIND_TRUCK_PASS.staged![0] as unknown as {
    id: string;
    paceMode?: string;
    actor: { cruiseSpeedMps: number; windShelter?: boolean; profile?: string };
    overtake?: { side: string; clearBumperGapM: number; abeamFromM: number };
  };

  it("the truck is a scheduled cruise at 40 км/ч — 10 км/ч under the motorway floor — and is the lesson's one sheltering body", () => {
    expect(truck.id).toBe(TRUCK_ID);
    expect(truck.paceMode).toBe("scheduledCruise");
    expect(truck.actor.cruiseSpeedMps * 3.6).toBeCloseTo(40, 6);
    expect(MOTORWAY_FLOOR_KMH).toBe(50);
    expect(truck.actor.cruiseSpeedMps * 3.6).toBeLessThanOrEqual(MOTORWAY_FLOOR_KMH - 10);
    expect(truck.actor.windShelter).toBe(true);
    expect(truck.actor.profile).toBe("truck");
    // 10.25 since round 2: just outside the truck's own following reach (16 m
    // ahead of its centre = 10.23 m between these two bumpers), so a return that
    // is credited is one the truck cannot be braking for
    // (`orchestrator/__tests__/overtake-return-forced.test.ts` holds it to the
    // traffic model's constant).
    expect(truck.overtake).toMatchObject({ side: "left", clearBumperGapM: 10.25, abeamFromM: 1.75 });
  });

  it("ROUND 2: the lesson arms the forced-braking rule at every rung — and so does every lesson in the catalogue that stages a vehicle to overtake", () => {
    expect(SC_AC_WIND_TRUCK_PASS.ruleConfig).toEqual({ laneEntryForcedBrakingEnabled: true });
    expect(DEFAULT_RULE_CONFIG.laneEntryForcedBrakingEnabled).toBe(false);
    const watched: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const l of spec.levels) {
        const lesson = compileScenario(spec, l.level as ScenarioLevel);
        const overtakes = (lesson.stagedEvents ?? []).some(
          (e) => e.kind === "cutInLeadCar" && (e as { overtake?: unknown }).overtake !== undefined,
        );
        if (!overtakes) continue;
        watched.push(lesson.id);
        // The runner withholds «overtaken» from a return the vehicle braked
        // for; the rule engine is what tells the student why. A lesson with the
        // first and not the second would refuse a task in silence.
        expect(lesson.ruleConfig?.laneEntryForcedBrakingEnabled, lesson.id).toBe(true);
        expect(lesson.ruleConfig?.harshBrakeDecelMps2, `${lesson.id} does not move the hard-braking line`).toBeUndefined();
      }
    }
    expect(watched.sort()).toEqual(LEVELS.map((l) => `sc-ac-wind-truck-pass@L${l}`).sort());
  });

  it("the road's limit and the pass task's cap are what they were: 140 on the map, 100 on the task at every rung's authored figure", () => {
    const raw = MW as { roads: { edges: Array<{ maxspeed?: number }> } };
    expect(Math.max(...raw.roads.edges.map((e) => e.maxspeed ?? 0))).toBe(140);
    const pass = SC_AC_WIND_TRUCK_PASS.success.find((o) => o.id === "sc-acw-pass")!;
    expect(pass.params).toMatchObject({ kind: "reachZone", maxSpeedKmh: 100 });
    expect(pass.titleBg).toBe("Излез в лявата лента до кабината със съобразена за вятъра скорост");
    // …and the two truck tasks are judged by the truck, at every compiled rung
    // (the ladder's whitelist carries the term through).
    for (const level of LEVELS) {
      const lesson = compileScenario(SC_AC_WIND_TRUCK_PASS, level);
      expect(lesson.objectives.map((o) => (o.params as { stagedPass?: unknown }).stagedPass), `L${level}`).toEqual([
        { eventId: TRUCK_ID, phase: "abeam" },
        { eventId: TRUCK_ID, phase: "returned" },
        undefined,
      ]);
      expect((lesson.objectives[0]!.params as { maxSpeedKmh: number }).maxSpeedKmh, `L${level}`).toBeGreaterThanOrEqual(100);
      expect(lesson.physics?.crosswind, `L${level}`).toBe(true);
      expect(lessonWindShelterActors(lesson), `L${level}`).toEqual([
        { actorId: TRUCK_ID, halfLengthM: TRUCK_HALF_LEN, halfWidthM: TRUCK_HALF_WIDTH },
      ]);
    }
  });

  it("the cap is ON THE GLASS at every rung — in the task sentence the strip and the banner read — and the two truck tasks draw no ring on the road", () => {
    for (const level of LEVELS) {
      const lesson = compileScenario(SC_AC_WIND_TRUCK_PASS, level);
      const pass = lesson.objectives[0]!;
      const params = parseObjectiveParams(pass);
      if (params.kind !== "reachZone") throw new Error("the pass task is a reachZone");
      // The figure the glass shows is the authored 100, whatever the rung's grace.
      expect(shownObjectiveCapKmh(pass, params.maxSpeedKmh!, lesson.postedLimitKmh), `L${level}`).toBe(100);
      const sentence = advisorPromptForObjective(pass.titleBg, params, undefined, lesson.postedLimitKmh, 100).textBg;
      expect(sentence, `L${level}`).toContain("Излез в лявата лента до кабината");
      expect(sentence, `L${level}`).toMatch(/100 км\/ч/u);
      // No marker at a spot on the road for a task judged beside a moving
      // truck: the ribbon runs on ahead in the car's own lane.
      expect(guidanceGoalFor(lesson, 0), `L${level}`).toEqual({ kind: "ahead", meters: 150 });
      expect(guidanceGoalFor(lesson, 1), `L${level}`).toEqual({ kind: "ahead", meters: 150 });
      // The finish is a place and is drawn as one.
      expect(guidanceGoalFor(lesson, 2), `L${level}`).toMatchObject({ kind: "point", marker: true, x: 0, y: 900 });
    }
  });

  it("the lee is scoped to this lesson: every other compiled lesson in the catalogue — sc-ac-crosswind included — has none", () => {
    const withLee: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const l of spec.levels) {
        const lesson = compileScenario(spec, l.level as ScenarioLevel);
        if (createLessonWindShelter(lesson, () => null) !== null) withLee.push(lesson.id);
      }
    }
    expect(withLee.sort()).toEqual(LEVELS.map((l) => `sc-ac-wind-truck-pass@L${l}`).sort());
    for (const l of SC_AC_CROSSWIND.levels) {
      expect(lessonWindShelterActors(compileScenario(SC_AC_CROSSWIND, l.level as ScenarioLevel))).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// 1. The correct demo, through the live rung chain, at every rung
// ---------------------------------------------------------------------------

describe("the correct demo through the live rung chain: it passes the truck — abeam, then the whole truck behind — with every task done, 0 т., no collision", () => {
  for (const level of LEVELS) {
    it(`L${level}`, () => {
      const lesson = compileScenario(SC_AC_WIND_TRUCK_PASS, level);
      const frames: Array<{ t: number; along: number; left: number; truckKmh: number }> = [];
      const o = liveChainReplay({
        lesson,
        districtRaw: MW,
        trace: SHADOW,
        holdAfterSec: 2,
        applyOutcomes: true,
        afterApply: (ctx) => {
          const truck = ctx.traffic.staged(TRUCK_ID);
          if (!truck) return;
          frames.push({
            t: ctx.t,
            along: ctx.tick.position.y - truck.y,
            left: truck.x - ctx.tick.position.x,
            truckKmh: truck.speedMps * 3.6,
          });
        },
      });
      // Behind → abeam in the overtaking lane → the whole truck behind.
      expect(frames[0]!.along).toBeLessThan(-BOTH_HALVES - 60);
      const abeam = frames.filter((f) => Math.abs(f.along) <= BOTH_HALVES);
      expect(abeam.length, "frames alongside the truck").toBeGreaterThan(60);
      for (const f of abeam) expect(f.left, `abeam t=${f.t.toFixed(1)}`).toBeGreaterThan(7.5);
      const last = frames[frames.length - 1]!;
      expect(last.along - BOTH_HALVES, "road between the bumpers at the end").toBeGreaterThan(100);
      expect(Math.abs(last.left), "back in the truck's lane").toBeLessThan(0.5);
      // The truck never matched the ghost's speed: it holds 40 км/ч while the
      // ghost does 62–78.
      for (const f of frames.filter((x) => x.t > 8)) expect(f.truckKmh, `t=${f.t.toFixed(1)}`).toBeLessThan(41);
      // The lesson: every task, no points, no crash.
      expect(o.outcomes.map((x) => x.detail)).toEqual(["drewLevel", "overtaken"]);
      expect(o.result.objectives.map((x) => [x.id, x.done])).toEqual([
        ["sc-acw-pass", true],
        ["sc-acw-back", true],
        ["sc-acw-finish", true],
      ]);
      expect(o.violationCodes).toEqual([]);
      expect(o.result.score).toBe(0);
      expect(o.session.phase).toBe("completed");
      expect(o.result.passed).toBe(true);
      // Each truck task is credited on the frame after the truck's own report.
      const [pass, back] = o.session.objectives;
      expect(pass!.completedAtSec! - o.outcomes[0]!.tSec).toBeGreaterThanOrEqual(0);
      expect(pass!.completedAtSec! - o.outcomes[0]!.tSec).toBeLessThan(0.05);
      expect(back!.completedAtSec! - o.outcomes[1]!.tSec).toBeLessThan(0.05);
      // …and on those frames the claims are true of the two bodies.
      const at = (tSec: number) => frames.reduce((b, f) => (Math.abs(f.t - tSec) < Math.abs(b.t - tSec) ? f : b));
      const level1 = at(o.outcomes[0]!.tSec);
      expect(level1.along, "level with the cab").toBeGreaterThanOrEqual(1.7);
      expect(level1.along).toBeLessThan(2.2);
      expect(level1.left).toBeGreaterThan(4.06);
      const behind = at(o.outcomes[1]!.tSec);
      expect(behind.along - BOTH_HALVES, "the whole truck behind").toBeGreaterThanOrEqual(10.25);
      expect(Math.abs(behind.left), "in the truck's lane").toBeLessThanOrEqual(4.06);
    });
  }

  it("WITHOUT the truck's reports the same drive completes nothing — the two tasks are the truck's to give, not a place's", () => {
    const o = liveChainReplay({
      lesson: compileScenario(SC_AC_WIND_TRUCK_PASS, 3),
      districtRaw: MW,
      trace: SHADOW,
      holdAfterSec: 2,
      // The harness's pre-restage behaviour: reports collected, never folded.
    });
    expect(o.outcomes.map((x) => x.detail)).toEqual(["drewLevel", "overtaken"]);
    expect(o.result.objectives.map((x) => x.done)).toEqual([false, false, false]);
    expect(o.result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. The live car: lawful passes at the taught speed and at the slowest lawful
// ---------------------------------------------------------------------------

describe("the live car passes the truck lawfully at every rung — at the taught 62 км/ч and at 53, just over the motorway floor — with room in hand", () => {
  for (const level of LEVELS) {
    it(
      `L${level}: both drives complete every task at 0 т.; the pass window is measured and ends at least 200 m before the stretch does`,
      () => {
        for (const kmh of [TAUGHT_KMH, SLOWEST_LAWFUL_KMH] as const) {
          const o = passDrive(level, kmh);
          const label = `L${level}@${kmh}`;
          expectCleanPass(o, label);
          const w = passWindow(o);
          // Lawful: never over the cap, and once up to speed never under the floor.
          const moving = o.samples.filter((s) => s.t > 12 && s.y < 880);
          for (const s of moving) {
            expect(s.speedKmh, `${label} t=${s.t.toFixed(1)}`).toBeLessThan(100);
            expect(s.speedKmh, `${label} t=${s.t.toFixed(1)}`).toBeGreaterThanOrEqual(MOTORWAY_FLOOR_KMH);
          }
          // Never nearer the truck than a lane.
          const nearest = Math.min(
            ...o.samples.map((s) => (s.truckAheadM === null ? Infinity : Math.hypot(s.truckAheadM, s.truckRightM ?? 0))),
          );
          expect(nearest, `${label} nearest`).toBeGreaterThan(7.5);
          // The window: alongside for a measured time, and back with margin.
          const alongside = o.samples.filter((s) => Math.abs(alongOf(s) ?? Infinity) <= BOTH_HALVES);
          const abeamSec = alongside.length / 60;
          const finishY = (SC_AC_WIND_TRUCK_PASS.success[2]!.params as { y: number }).y;
          expect(finishY - w.overtakenAt.y, `${label} road left after the return`).toBeGreaterThan(200);
          note(
            `PASS ${label}: lee y=${w.leeFrom.y.toFixed(0)}..${w.leeTo.y.toFixed(0)} (${(w.leeTo.t - w.leeFrom.t).toFixed(1)} s, full lee ${(w.fullLee.length / 60).toFixed(1)} s), ` +
              `alongside ${abeamSec.toFixed(1)} s / ${(alongside[alongside.length - 1]!.y - alongside[0]!.y).toFixed(0)} m from y=${alongside[0]!.y.toFixed(0)}, ` +
              `level with the cab t=${w.drewLevelAt.t.toFixed(1)} y=${w.drewLevelAt.y.toFixed(0)} at ${w.drewLevelAt.speedKmh.toFixed(0)} км/ч, ` +
              `whole truck behind + back in lane t=${w.overtakenAt.t.toFixed(1)} y=${w.overtakenAt.y.toFixed(0)}, margin to finish ${(finishY - w.overtakenAt.y).toFixed(0)} m, dur ${o.durationSec.toFixed(0)} s`,
          );
          if (kmh === TAUGHT_KMH) {
            expect(abeamSec, `${label} alongside`).toBeGreaterThan(1.5);
            expect(w.fullLee.length / 60, `${label} full lee`).toBeGreaterThan(2.5);
          } else {
            expect(abeamSec, `${label} alongside`).toBeGreaterThan(2.5);
          }
        }
      },
      TEST_TIMEOUT,
    );
  }
});

// ---------------------------------------------------------------------------
// 2b. The run-out on the live car: a completed drive ends AT the route's end
// ---------------------------------------------------------------------------

/*
 * WHY THIS LIVES HERE AND NOT IN THE CATALOGUE CENSUS. `lessons/__tests__/
 * route-runout.test.ts` walks every whole-route reachZone lesson with a bare
 * applyTick and no staged runner. The two truck tasks are completed only by the
 * truck's own reports, so on that walk the chain stalls at the pass task and the
 * drive is ended by the stalled-chain finish gate on the ladder-widened terminal
 * ring (17 / 15 / 12 m): 9.4 / 7.2 / 5.0 m short, L1 shortest. That is not a
 * completed route, so the census skips ANY route that has a `stagedPass` task
 * (by that property, not by name) and pins that this truck pass is the only
 * route the skip leaves out. What the census pins for every other lesson is
 * pinned here for this one, on the drive that completes it:
 * the live car past the real staged truck, at the taught pace and at the slowest
 * lawful one, ends within ROUTE_RUNOUT_ARRIVE_M of the mark at every rung, and
 * the forgiving rung does not get the shorter road.
 */
const runOutEnds = new Map<string, number>();
function runOutShortM(level: ScenarioLevel, kmh: number): number {
  const key = `L${level}@${kmh}`;
  const known = runOutEnds.get(key);
  if (known !== undefined) return known;
  const o = passDrive(level, kmh);
  // A COMPLETED drive: every task, through the truck's two reports.
  expect(o.outcomes.map((x) => x.detail), `${key} reports`).toEqual(["drewLevel", "overtaken"]);
  expect(o.result.objectives.map((x) => x.done), `${key} objectives`).toEqual([true, true, true]);
  expect(o.session.phase, `${key} phase`).toBe("completed");
  const mark = routeEndMark(o.lesson.objectives.map(parseObjectiveParams));
  expect(mark, `${key} route end`).toEqual({ x: 0, y: 900 });
  // The frame that ended the session is the last one driven (the loop stops on
  // it), and that frame's tick carried this sample's pose.
  const end = o.samples[o.samples.length - 1]!;
  const shortM = Math.hypot(end.x - mark!.x, end.y - mark!.y);
  note(`RUN-OUT ${key}: ended at (${end.x.toFixed(2)}, ${end.y.toFixed(2)}), ${shortM.toFixed(2)} m from the mark, ${end.speedKmh.toFixed(0)} км/ч`);
  runOutEnds.set(key, shortM);
  return shortM;
}

describe("the run-out on the live car: a drive that completes all three tasks ends within the arrival tolerance of (0, 900) at every rung — at the taught pace and the slowest lawful one", () => {
  for (const level of LEVELS) {
    it(
      `L${level}: both paces end at the route's end, not on the edge of its ring`,
      () => {
        for (const kmh of [TAUGHT_KMH, SLOWEST_LAWFUL_KMH] as const) {
          const shortM = runOutShortM(level, kmh);
          expect(Number.isFinite(shortM), `L${level}@${kmh} measured`).toBe(true);
          expect(shortM, `L${level}@${kmh} metres short of the route's end`).toBeLessThanOrEqual(ROUTE_RUNOUT_ARRIVE_M);
        }
      },
      TEST_TIMEOUT,
    );
  }

  it(
    "the ladder does not shorten the beginner's drive: L1 ends no further from the mark than L5, at either pace",
    () => {
      // The census's own allowance (route-runout.test.ts, «the tolerance ladder
      // no longer shortens the beginner's drive»): half a metre.
      const lo = Math.min(...LEVELS) as ScenarioLevel;
      const hi = Math.max(...LEVELS) as ScenarioLevel;
      expect([lo, hi]).toEqual([1, 5]);
      for (const kmh of [TAUGHT_KMH, SLOWEST_LAWFUL_KMH] as const) {
        const l1 = runOutShortM(lo, kmh);
        const l5 = runOutShortM(hi, kmh);
        expect(l1, `@${kmh}: L1 ${l1.toFixed(2)} m short, L5 ${l5.toFixed(2)} m`).toBeLessThanOrEqual(l5 + 0.5);
      }
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 3. The lee, on the car: force, wheel, and the return at the cab
// ---------------------------------------------------------------------------

describe("the lee on the live car: beside the trailer the wind's force is the sheltered value, and it is whole again within one car length past the cab", () => {
  for (const level of LEVELS) {
    it(
      `L${level}: force = shelter × the open wind on every sample; 30 % in the lee; back to 100 % in ≤ ${WIND_SHELTER_CAR_LENGTH_M.toFixed(2)} m; the wheel that holds the lane falls and comes back`,
      () => {
        // (He stays out for 60 m past the truck here, so the wheel he holds in
        // the open wind AFTER the cab can be read on a straight lane.)
        const o = passDrive(level, TAUGHT_KMH, { returnWhenClearM: 60 });
        const open = passDrive(level, TAUGHT_KMH, { returnWhenClearM: 60, noShelter: true });
        const w = passWindow(o);

        // ONE DEFINITION OF THE WIND: on every sample the force on the car is
        // the open wind's (the same clock, read off the control drive) times
        // the shelter the scene's function gave it — nothing else moved.
        expect(open.samples.every((s) => s.shelter === 1)).toBe(true);
        const n = Math.min(o.samples.length, open.samples.length);
        for (let i = 0; i < n; i++) {
          const s = o.samples[i]!;
          expect(s.windN, `t=${s.t.toFixed(2)}`).toBeCloseTo(open.samples[i]!.windN * s.shelter, 6);
        }
        // In the open it is the shipped envelope, westward.
        for (const s of open.samples) {
          expect(s.windN).toBeLessThanOrEqual(-OPEN_MIN + 1e-6);
          expect(s.windN).toBeGreaterThanOrEqual(-OPEN_MAX - 1e-6);
        }
        // BESIDE THE TRAILER, in the overtaking lane: the sheltered value.
        expect(w.fullLee.length).toBeGreaterThan(150);
        for (const s of w.fullLee) {
          expect(Math.abs(s.x - OVERTAKE_X), `t=${s.t.toFixed(2)} in the overtaking lane`).toBeLessThan(1);
          expect(s.shelter).toBeCloseTo(WIND_SHELTER_RESIDUAL, 9);
          expect(-s.windN).toBeGreaterThanOrEqual(WIND_SHELTER_RESIDUAL * OPEN_MIN - 1e-6);
          expect(-s.windN).toBeLessThanOrEqual(WIND_SHELTER_RESIDUAL * OPEN_MAX + 1e-6);
        }
        // The full lee runs from one car length inside the wake's end to the
        // frame the car's nose is level with the truck's.
        const leeStartAlong = alongOf(w.fullLee[0]!)!;
        const leeEndAlong = alongOf(w.fullLee[w.fullLee.length - 1]!)!;
        expect(leeStartAlong).toBeCloseTo(-TRUCK_HALF_LEN - WIND_SHELTER_WAKE_M + CAR_HALF_LEN, 0);
        expect(leeEndAlong).toBeCloseTo(TRUCK_HALF_LEN - CAR_HALF_LEN, 0);
        // PAST THE CAB THE WHOLE WIND IS BACK WITHIN ONE CAR LENGTH of relative
        // travel (plus one frame of it).
        const openAlong = alongOf(w.openAgain)!;
        expect(w.openAgain.shelter).toBe(1);
        expect(openAlong - leeEndAlong).toBeLessThanOrEqual(WIND_SHELTER_CAR_LENGTH_M + 0.25);
        expect(openAlong, "the car's tail has just cleared the truck's nose").toBeCloseTo(BOTH_HALVES, 0);
        const backSec = w.openAgain.t - w.fullLee[w.fullLee.length - 1]!.t;
        expect(backSec).toBeLessThan(1);
        // …and it stays whole for the rest of the drive.
        expect(o.samples.filter((s) => s.t > w.openAgain.t).every((s) => s.shelter === 1)).toBe(true);

        // THE WHEEL THAT HOLDS THE LANE. Same driver, same line, same gust
        // clock; the only difference between the two drives is the lee.
        const inLee = (s: LiveWindSample) => s.t >= w.fullLee[0]!.t + 0.8 && s.t <= w.fullLee[w.fullLee.length - 1]!.t;
        const after = (s: LiveWindSample) => s.t >= w.openAgain.t + 1.5 && s.t <= w.openAgain.t + 6.5;
        const leeWheel = mean(o.samples.filter(inLee).map(wheelShare));
        const leeWheelOpen = mean(open.samples.filter(inLee).map(wheelShare));
        const afterWheel = mean(o.samples.filter(after).map(wheelShare));
        const afterWheelOpen = mean(open.samples.filter(after).map(wheelShare));
        const pullLee = mean(o.samples.filter(inLee).map((s) => s.windPullRad));
        const pullLeeOpen = mean(open.samples.filter(inLee).map((s) => s.windPullRad));
        note(
          `LEE L${level}@${TAUGHT_KMH}: force in lee ${mean(w.fullLee.map((s) => -s.windN)).toFixed(0)} N [${Math.min(...w.fullLee.map((s) => -s.windN)).toFixed(0)}, ${Math.max(...w.fullLee.map((s) => -s.windN)).toFixed(0)}] vs open ${mean(open.samples.filter(inLee).map((s) => -s.windN)).toFixed(0)} N; ` +
            `full lee along ${leeStartAlong.toFixed(2)}..${leeEndAlong.toFixed(2)} m, whole again at along ${openAlong.toFixed(2)} (${(openAlong - leeEndAlong).toFixed(2)} m, ${backSec.toFixed(2)} s); ` +
            `wheel held (share of lock): lee ${(leeWheel * 100).toFixed(2)} % vs ${(leeWheelOpen * 100).toFixed(2)} % with no lee; 1.5–6.5 s past the cab ${(afterWheel * 100).toFixed(2)} % vs ${(afterWheelOpen * 100).toFixed(2)} %; ` +
            `wind pull in lee ${(pullLee * 1000).toFixed(2)} mrad vs ${(pullLeeOpen * 1000).toFixed(2)}; x in lee [${Math.min(...w.fullLee.map((s) => s.x)).toFixed(2)}, ${Math.max(...w.fullLee.map((s) => s.x)).toFixed(2)}]`,
        );
        // The wind's pull on the steered wheels is 30 % of the open pull…
        expect(pullLee / pullLeeOpen).toBeGreaterThan(0.28);
        expect(pullLee / pullLeeOpen).toBeLessThan(0.34);
        // …so the wheel the driver holds (to the right, negative) falls to
        // well under half of what the open wind asks for on the same metres,
        // and is back to it past the cab.
        expect(leeWheelOpen, "open-wind correction is to the right").toBeLessThan(-0.012);
        expect(Math.abs(leeWheel)).toBeLessThan(0.55 * Math.abs(leeWheelOpen));
        expect(afterWheel).toBeLessThan(-0.012);
        expect(Math.abs(afterWheel - afterWheelOpen)).toBeLessThan(0.006);
        // He held his lane through all of it.
        for (const s of o.samples.filter((x) => x.t >= w.leeFrom.t && x.t <= w.openAgain.t + 6.5)) {
          expect(Math.abs(s.x - OVERTAKE_X), `t=${s.t.toFixed(1)}`).toBeLessThan(1.2);
        }
        expectCleanPass(o, `L${level}`);
      },
      TEST_TIMEOUT,
    );
  }
});

// ---------------------------------------------------------------------------
// 4. A drive that never passes completes nothing
// ---------------------------------------------------------------------------

describe("a drive that stays behind the truck completes NOTHING, is never in its lee at a lawful distance, and still ends", () => {
  for (const level of LEVELS) {
    it(
      `L${level}: follows at a lawful gap to the end of the stretch — 0 of 3 tasks, no report, not passed`,
      () => {
        const o = passDrive(level, TAUGHT_KMH, { neverPass: true });
        expect(o.outcomes).toEqual([]);
        expect(o.result.objectives.map((x) => x.done)).toEqual([false, false, false]);
        expect(o.result.completedAll).toBe(false);
        expect(o.result.passed).toBe(false);
        // The truck stayed ahead, in his lane, the whole way…
        const withTruck = o.samples.filter((s) => s.truckAheadM !== null);
        expect(withTruck.length).toBeGreaterThan(1000);
        const minGap = Math.min(...withTruck.map((s) => s.truckAheadM! - BOTH_HALVES));
        expect(minGap, "bumper gap").toBeGreaterThan(20);
        for (const s of withTruck) expect(Math.abs(s.truckRightM ?? 0)).toBeLessThan(1.5);
        // …and at that distance there is no lee (briefing step 3): the whole
        // wind on every sample.
        expect(o.samples.every((s) => s.shelter === 1)).toBe(true);
        // The lesson still ends, at the route's end, with the tasks open.
        expect(o.samples[o.samples.length - 1]!.y).toBeGreaterThan(880);
        expect(["completed", "failed"]).toContain(o.session.phase);
        note(
          `NEVER-PASS L${level}: phase=${o.session.phase} V=[${o.violationCodes}] gap ${minGap.toFixed(0)}..${Math.max(...withTruck.map((s) => s.truckAheadM! - BOTH_HALVES)).toFixed(0)} m dur ${o.durationSec.toFixed(0)} s`,
        );
      },
      TEST_TIMEOUT,
    );
  }

  it(
    "a car that pulls level only in the EMERGENCY lane, and is then passed BY the truck while it dawdles in the overtaking lane, is never reported level with the cab",
    () => {
      // Two ways to be „beside the cab" that are not the task, in one drive:
      // up the truck's RIGHT (the emergency lane — the wrong side), then across
      // in front of it into the overtaking lane and down to 20 км/ч, so the
      // truck drives past the car. Kinematic, with the lesson's own truck.
      const trace = recordScriptedDrive(
        MW,
        {
          steps: [
            { kind: "drive", points: [[0, 15], [8.13, 90]], targetKmh: 80, stopAtEnd: false },
            { kind: "drive", points: [[8.13, 90], [8.13, 430]], targetKmh: 80, stopAtEnd: false },
            { kind: "drive", points: [[8.13, 430], [OVERTAKE_X, 540]], targetKmh: 80, stopAtEnd: false },
            { kind: "drive", points: [[OVERTAKE_X, 540], [OVERTAKE_X, 760]], targetKmh: 20 },
          ],
        },
        {
          scenarioId: "sc-ac-wind-truck-pass",
          kind: "mistake",
          seed: 7,
          stagedEvents: [...(SC_AC_WIND_TRUCK_PASS.staged ?? [])] as StagedEventSpec[],
        },
      ).trace;
      const frames: Array<{ along: number; left: number }> = [];
      const o = liveChainReplay({
        lesson: compileScenario(SC_AC_WIND_TRUCK_PASS, 3),
        districtRaw: MW,
        trace,
        holdAfterSec: 25,
        applyOutcomes: true,
        afterApply: (ctx) => {
          const truck = ctx.traffic.staged(TRUCK_ID);
          if (truck) frames.push({ along: ctx.tick.position.y - truck.y, left: truck.x - ctx.tick.position.x });
        },
      });
      // It WAS level with the cab twice — on the wrong side, gaining…
      const onTheRight = frames.filter((f) => f.along >= 1.75 && f.along <= BOTH_HALVES && f.left < -7);
      expect(onTheRight.length, "level with the cab in the emergency lane").toBeGreaterThan(5);
      // …and on the right side of the truck's left, LOSING: the truck passing it.
      const cabWindow = frames
        .map((f, i) => ({ ...f, i }))
        .filter((f) => f.along >= 1.75 && f.along <= BOTH_HALVES && f.left > 4.06 && f.left < 12.18);
      expect(cabWindow.length, "level with the cab in the overtaking lane").toBeGreaterThan(5);
      for (const f of cabWindow) expect(frames[f.i - 1]!.along, "the truck is the one gaining").toBeGreaterThan(f.along);
      // Neither is the task: no report, nothing credited.
      expect(o.outcomes).toEqual([]);
      expect(o.result.objectives.slice(0, 2).map((x) => x.done)).toEqual([false, false]);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 5. The cap: level with the cab over it is not the task, and is billed
// ---------------------------------------------------------------------------

describe("the pass task's cap binds where the task is judged: level with the cab over the bill line is refused and billed once", () => {
  /**
   * The only way to be over 105 км/ч beside a truck met 80 m from the start is
   * to hang back first and take a run at it — which is the drive the cap is
   * for. Kinematic (the recorder's own scripted drive, with the lesson's own
   * staged truck), replayed through the live rung chain like every demo.
   */
  function runAtIt(passKmh: number): ScenarioTrace {
    return recordScriptedDrive(
      MW,
      {
        steps: [
          { kind: "drive", points: [[0, 15], [0, 300]], targetKmh: 35, stopAtEnd: false },
          { kind: "indicator", setting: "left" },
          { kind: "glance", mirror: "left" },
          { kind: "drive", points: [[0, 300], [OVERTAKE_X, 400]], targetKmh: passKmh, stopAtEnd: false },
          { kind: "drive", points: [[OVERTAKE_X, 400], [OVERTAKE_X, 960]], targetKmh: passKmh },
        ],
      },
      {
        scenarioId: "sc-ac-wind-truck-pass",
        kind: "mistake",
        seed: 7,
        stagedEvents: [...(SC_AC_WIND_TRUCK_PASS.staged ?? [])] as StagedEventSpec[],
      },
    ).trace;
  }

  for (const level of [1, 3, 5] as const) {
    it(
      `L${level}: level with the cab at 118 км/ч (under the road's 140) — the truck is passed, the first task is NOT credited, TASK_SPEED_CAP_EXCEEDED is raised exactly once; the same run at 98 is credited and nothing is raised`,
      () => {
        const lesson = compileScenario(SC_AC_WIND_TRUCK_PASS, level);
        const fast = liveChainReplay({ lesson, districtRaw: MW, trace: runAtIt(118), applyOutcomes: true });
        const drew = fast.outcomes.find((x) => x.detail === "drewLevel")!;
        expect(drew.approachSpeedKmh!).toBeGreaterThan(112);
        expect(fast.result.objectives[0]!.done).toBe(false);
        const raised = [...fast.violationCodes, ...(fast.result.coachedMistakes ?? []).map((m) => m.code)];
        expect(raised.filter((c) => c === "TASK_SPEED_CAP_EXCEEDED")).toHaveLength(1);
        note(
          `CAP L${level}@118: level with the cab at ${drew.approachSpeedKmh!.toFixed(1)} км/ч (t=${drew.tSec.toFixed(1)}) → task 1 open, V=[${fast.violationCodes}] coached=[${(fast.result.coachedMistakes ?? []).map((m) => m.code)}] score=${fast.result.score}`,
        );
        const lawful = liveChainReplay({ lesson, districtRaw: MW, trace: runAtIt(98), applyOutcomes: true });
        const drew98 = lawful.outcomes.find((x) => x.detail === "drewLevel")!;
        expect(drew98.approachSpeedKmh!).toBeGreaterThan(95);
        expect(drew98.approachSpeedKmh!).toBeLessThanOrEqual(100);
        expect(lawful.result.objectives[0]!.done).toBe(true);
        const raised98 = [...lawful.violationCodes, ...(lawful.result.coachedMistakes ?? []).map((m) => m.code)];
        expect(raised98).not.toContain("TASK_SPEED_CAP_EXCEEDED");
      },
      TEST_TIMEOUT,
    );
  }
});

// ---------------------------------------------------------------------------
// 6. The mistake demos through the live rung chain
// ---------------------------------------------------------------------------

describe("each mistake demo, through the live rung chain at every rung, is billed for its own mistake", () => {
  const blown = loadTrace(SC_AC_WIND_TRUCK_PASS.mistakes[0]!.traceRef.path);
  const clip = loadTrace(SC_AC_WIND_TRUCK_PASS.mistakes[1]!.traceRef.path);

  for (const level of LEVELS) {
    it(`L${level}: «Изненадан от порива» → POOR_LANE_KEEPING (the lesson's own mistake: taught free the first time on a practice rung, billed on L4), lesson not taken`, () => {
      const lesson = compileScenario(SC_AC_WIND_TRUCK_PASS, level);
      const o = liveChainReplay({ lesson, districtRaw: MW, trace: blown, holdAfterSec: 2, applyOutcomes: true });
      const coached = (o.result.coachedMistakes ?? []).map((m) => m.code);
      expect([...o.violationCodes, ...coached]).toEqual(["POOR_LANE_KEEPING"]);
      // Ruling A: POOR_LANE_KEEPING is this lesson's own-mistake target on the
      // practice rungs, and only there.
      const targets = (lesson.lessonMistakeTargets ?? []).map((t) => t.code);
      if (level === 4) {
        expect(targets).toEqual([]);
        expect(o.violationCodes).toEqual(["POOR_LANE_KEEPING"]);
        expect(o.result.score).toBe(1);
      } else {
        expect(targets).toEqual(["POOR_LANE_KEEPING"]);
        expect(coached).toEqual(["POOR_LANE_KEEPING"]);
        expect(o.result.score).toBe(0);
      }
      expect(o.result.passed).toBe(false);
      expect(o.violationCodes).not.toContain("COLLISION");
      // It did draw level with the cab, in its lane, under the cap — so the
      // first task is its, and the second is not: it never came back.
      expect(o.result.objectives.map((x) => x.done)).toEqual([true, false, false]);
    });

    it(`L${level}: «Рязка корекция в тясната пролука» → EXACTLY COLLISION with the truck: 10 т., never free, nothing else raised and nothing coached (round 2, F-04)`, () => {
      const lesson = compileScenario(SC_AC_WIND_TRUCK_PASS, level);
      const o = liveChainReplay({ lesson, districtRaw: MW, trace: clip, holdAfterSec: 2, applyOutcomes: true });
      // The card says COLLISION and the sheet says COLLISION — once, ten
      // points, at every rung. In round 1 the sheet at L1–L3 and L5 was 13: the
      // first-fault grace went on LANE_CHANGE_WITHOUT_INDICATOR and the mirror
      // code was billed 3 т., neither of them on the card.
      expect(o.violationCodes).toEqual(["COLLISION"]);
      expect((o.result.coachedMistakes ?? []).map((m) => m.code)).toEqual([]);
      expect(o.result.score).toBe(10);
      expect(o.result.passed).toBe(false);
      expect(o.result.objectives.map((x) => x.done)).toEqual([false, false, false]);
      // The swerve — signalled and looked for, into the truck's side — is not
      // praised: the one SAFE_LANE_CHANGE is the pull-out's.
      expect(o.commendationCodes.filter((c) => c === "SAFE_LANE_CHANGE")).toHaveLength(1);
      // COLLISION is never an own-mistake target.
      const targets = (lesson.lessonMistakeTargets ?? []).map((t) => t.code);
      expect(targets).not.toContain("COLLISION");
      expect(targets).not.toContain("LANE_ENTRY_FORCED_BRAKING");
    });
  }
});

// ---------------------------------------------------------------------------
// 7. The census — every demo of both wind lessons, every rung, base vs tree
// ---------------------------------------------------------------------------

type CensusRow = Record<string, unknown>;
function census(spec: ScenarioSpec, district: unknown): Record<string, CensusRow> {
  const out: Record<string, CensusRow> = {};
  const refs = [spec.shadow.path, ...spec.mistakes.map((m) => m.traceRef.path)];
  for (const ref of refs) {
    const trace = loadTrace(ref);
    for (const l of spec.levels) {
      const lesson = compileScenario(spec, l.level as ScenarioLevel);
      let minAhead = Infinity;
      let maxAhead = -Infinity;
      const stagedId = (lesson.stagedEvents ?? [])[0]?.id;
      const o = liveChainReplay({
        lesson,
        districtRaw: district,
        trace,
        holdAfterSec: 2,
        applyOutcomes: true,
        afterApply: (ctx) => {
          if (stagedId === undefined) return;
          const a = ctx.traffic.staged(stagedId);
          if (!a) return;
          const ahead = a.y - ctx.tick.position.y;
          minAhead = Math.min(minAhead, ahead);
          maxAhead = Math.max(maxAhead, ahead);
        },
      });
      out[`${path.basename(ref)}@L${l.level}`] = {
        phase: o.session.phase,
        passed: o.result.passed,
        score: o.result.score,
        completedAll: o.result.completedAll,
        objectives: o.result.objectives.map((x) => `${x.id}:${x.done ? 1 : 0}`),
        violations: o.violationCodes,
        commendations: o.commendationCodes,
        teach: o.teachMomentCodes,
        coached: (o.result.coachedMistakes ?? []).map((m) => m.code),
        outcomes: o.outcomes.map((x) => `${x.eventId}:${x.detail}@${x.tSec.toFixed(2)}`),
        truckAheadM: Number.isFinite(minAhead) ? [Number(minAhead.toFixed(1)), Number(maxAhead.toFixed(1))] : null,
      };
    }
  }
  return out;
}

describe("census — every committed demo of the two wind lessons at every rung, through the live rung chain", () => {
  const crosswind = census(SC_AC_CROSSWIND, FO);
  const truck = census(SC_AC_WIND_TRUCK_PASS, MW);
  const fixture = CENSUS as unknown as {
    base: Record<string, Record<string, CensusRow>>;
    tree: Record<string, Record<string, CensusRow>>;
  };
  if (RECORD_CENSUS) {
    const file = path.join(HERE, "wind-lessons-live-census.json");
    const next = { ...(CENSUS as object), tree: { "sc-ac-crosswind": crosswind, "sc-ac-wind-truck-pass": truck } };
    writeFileSync(file, JSON.stringify(next, null, 1) + "\n");
  }

  it("sc-ac-crosswind is BYTE-IDENTICAL to the base tree in grading: 12 demo × rung rows, every field", () => {
    expect(Object.keys(crosswind)).toHaveLength(12);
    expect(crosswind).toEqual(fixture.base["sc-ac-crosswind"]);
  });

  it("sc-ac-wind-truck-pass: 15 rows, pinned — and what moved from base is the restage and nothing else", () => {
    expect(Object.keys(truck)).toHaveLength(15);
    if (!RECORD_CENSUS) expect(truck).toEqual(fixture.tree["sc-ac-wind-truck-pass"]);
    const base = fixture.base["sc-ac-wind-truck-pass"]!;
    for (const [key, row] of Object.entries(truck)) {
      const before = base[key]!;
      const [aheadMin] = row.truckAheadM as [number, number];
      const [baseAheadMin] = before.truckAheadM as [number, number];
      // BASE: the truck never nearer than 33 m ahead, on any row.
      expect(baseAheadMin, `${key} base`).toBeGreaterThan(33);
      if (key.startsWith("shadow-correct")) {
        // Same verdict, now earned: 0 т., all three tasks, and the truck ends
        // far behind instead of 35 m ahead.
        expect(row.score).toBe(0);
        expect(before.score).toBe(0);
        expect(row.passed).toBe(true);
        expect(row.objectives).toEqual(before.objectives);
        expect(row.violations).toEqual([]);
        expect(aheadMin).toBeLessThan(-200);
      } else if (key.startsWith("mistake-blown-out")) {
        // Identical grading to base: taught free on L1–L3 and L5, billed on L4.
        expect(row.violations).toEqual(before.violations);
        expect(row.coached).toEqual(before.coached);
        expect(row.score).toBe(before.score);
        expect(row.passed).toBe(false);
        expect(aheadMin).toBeLessThan(-100);
      } else {
        // The crash is real now: nothing at all on base, COLLISION on the tree.
        expect(before.violations).toEqual([]);
        expect(before.coached).toEqual([]);
        expect(row.violations).toContain("COLLISION");
        expect(row.passed).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 8. The sentences, against the car
// ---------------------------------------------------------------------------

/** The gust chip's two thresholds, read out of the component that owns them. */
function chipThresholds(): { sideDeadbandMs2: number; phaseHysteresisN: number } {
  const src = readFileSync(path.join(REPO_ROOT, "platform/src/components/sim/LessonScene.tsx"), "utf-8");
  const dead = /const WIND_PUSH_SIDE_DEADBAND_MS2 = ([0-9.]+);/.exec(src);
  const hyst = /const WIND_PUSH_PHASE_HYSTERESIS_N = ([0-9.]+);/.exec(src);
  if (!dead || !hyst) throw new Error("the gust chip's thresholds moved");
  return { sideDeadbandMs2: Number(dead[1]), phaseHysteresisN: Number(hyst[1]) };
}

describe("the shown sentences, read off the template and held against the car", () => {
  const steps = SC_AC_WIND_TRUCK_PASS.instructionsBg.map((s) => s.textBg);

  it("the briefing is the reviewed nine steps; the three that the old world made false are the three that changed", () => {
    expect(steps).toEqual([
      "Хвани волана здраво с двете ръце — вятърът бие, а отпред пъпли камион.",
      "Включи късите светлини, ако вали (чл. 70) — минаваш през водния му облак.",
      "Дръж корекцията и зад камиона: на безопасна дистанция завет няма.",
      "Намали и подай ляв мигач ПРЕДИ да излезеш за изпреварване.",
      "Помни: по-бавно покрай камиона значи по-малко отместване от порива.",
      "Отпусни корекцията плавно до камиона — в завета му вятърът отслабва.",
      "Посрещни вятъра пред кабината леко, никога рязко — връща се наведнъж.",
      "Прибери се плавно надясно с десен мигач, щом целият камион е в огледалото.",
      "Очаквай нов порив при всяко следващо открито място.",
    ]);
    const all = [
      SC_AC_WIND_TRUCK_PASS.objectiveBg,
      ...steps,
      SC_AC_WIND_TRUCK_PASS.teach.whenBg,
      SC_AC_WIND_TRUCK_PASS.teach.whyBg,
      ...SC_AC_WIND_TRUCK_PASS.mistakes.map((m) => `${m.titleBg} ${m.whatWentWrongBg}`),
    ].join(" ");
    // The sentences of the paced-rig world are gone from every surface.
    expect(all).not.toMatch(/вятърът натиска през целия участък/u);
    expect(all).not.toMatch(/камионът остава далеч пред теб/u);
    expect(all).not.toMatch(/на завет не се разчита/u);
    expect(all).not.toMatch(/вятърът мълчи/u);
    expect(all).not.toMatch(/мантинел/u);
    // The one law the lesson cites is the one it cited (ADR-002: nothing recalled).
    expect(SC_AC_WIND_TRUCK_PASS.teach.lawRef).toBe("ЗДвП чл. 20, ал. 2");
    expect([...all.matchAll(/чл\. \d+(?:, ал\. \d+)?/gu)].map((m) => m[0]).sort()).toEqual(
      ["чл. 20, ал. 2", "чл. 20, ал. 2", "чл. 20, ал. 2", "чл. 70"].sort(),
    );
  });

  it("step 3 «Дръж корекцията и зад камиона: на безопасна дистанция завет няма»: the wake ends exactly where the rule engine starts to bill a car following the 40 км/ч truck (round 2, F-05)", () => {
    const lesson = compileScenario(SC_AC_WIND_TRUCK_PASS, 3);
    const truck = { x: 0, y: 500, dirX: 0, dirY: 1 };
    const shelterAt = createLessonWindShelter(lesson, () => truck)!;
    const truckMps = (SC_AC_WIND_TRUCK_PASS.staged![0] as unknown as { actor: { cruiseSpeedMps: number } }).actor.cruiseSpeedMps;
    // TWO NUMBERS, both the rule engine's own, at the truck's own speed:
    //   the TAUGHT gap  — `followSafeSeconds` (1.8 s)                    = 20.0 m
    //   the BILL line   — `followFireRatio` (0.7) of it: FOLLOWING_TOO_CLOSE
    //                     fires under 1.26 s of gap                      = 14.0 m
    // Round 1 backed step 3 with the first and authored a 15 m wake; its
    // verifier (F-05) followed at 14.27 m, was neither billed nor coached, and
    // had 13 % of a lee. The wake is 13 now — a metre UNDER the bill line, so
    // that the frame by which the wind (stepped with the physics) and the
    // following gap (read with the traffic) disagree, 0.19 m of the truck's
    // travel at 60 Hz, cannot put a lee on a gap the engine reads as lawful.
    const taughtGapM = DEFAULT_RULE_CONFIG.followSafeSeconds * truckMps;
    const billLineM = DEFAULT_RULE_CONFIG.followSafeSeconds * DEFAULT_RULE_CONFIG.followFireRatio * truckMps;
    expect(taughtGapM).toBeCloseTo(20, 9);
    expect(billLineM).toBeCloseTo(14, 9);
    expect(WIND_SHELTER_WAKE_M).toBe(13);
    expect(billLineM - WIND_SHELTER_WAKE_M).toBeGreaterThanOrEqual(1 - 1e-9);
    // One 60 Hz frame of the truck is 0.185 m; the margin is five of them.
    expect((billLineM - WIND_SHELTER_WAKE_M) / (truckMps / 60)).toBeGreaterThan(5);
    expect(lesson.ruleConfig?.followSafeSeconds).toBeUndefined();
    expect(lesson.ruleConfig?.followFireRatio).toBeUndefined();
    const behindAt = (bumperGapM: number) => shelterAt(0, truck.y - BOTH_HALVES - bumperGapM);
    for (let gap = billLineM - 0.75; gap <= 90; gap += 0.25) expect(behindAt(gap), `gap ${gap}`).toBe(1);
    expect(behindAt(taughtGapM)).toBe(1);
    // …and the lee begins a metre inside the «твърде близо» card, not outside it.
    expect(behindAt(WIND_SHELTER_WAKE_M - 0.25)).toBeLessThan(1);
    expect(behindAt(WIND_SHELTER_WAKE_M - 1)).toBeCloseTo(1 - (1 - WIND_SHELTER_RESIDUAL) * (1 / WIND_SHELTER_CAR_LENGTH_M), 9);
    // «Плътно зад него си в завета му» (teach.whyBg): tucked under its tail, yes.
    expect(behindAt(2)).toBeCloseTo(WIND_SHELTER_RESIDUAL, 9);
    expect(behindAt(WIND_SHELTER_WAKE_M - WIND_SHELTER_CAR_LENGTH_M)).toBeCloseTo(WIND_SHELTER_RESIDUAL, 9);
    expect(behindAt(WIND_SHELTER_WAKE_M)).toBeCloseTo(1, 9);
    // The lee is on the LEEWARD side only: the wind blows west, the truck is in
    // the right lane, so the overtaking lane is sheltered and the emergency
    // lane (to windward) is not.
    expect(shelterAt(OVERTAKE_X, truck.y)).toBeCloseTo(WIND_SHELTER_RESIDUAL, 9);
    expect(shelterAt(8.13, truck.y)).toBe(1);
    // …and the median verge beyond the overtaking lane is open again.
    expect(shelterAt(-16.5, truck.y)).toBe(1);
  });

  it(
    "steps 6–7 and the gust chip, on the live car at every rung: in the lee the chip still names the side, reads «отслабва» on the way in and «се усилва» at the cab",
    () => {
      const { sideDeadbandMs2, phaseHysteresisN } = chipThresholds();
      for (const level of LEVELS) {
        const o = passDrive(level, TAUGHT_KMH);
        const w = passWindow(o);
        // THE SIDE: the chip names a side while |a_lat| ≥ its dead band. In the
        // lee the wind is weak but never under it — the push is still LEFT.
        for (const s of o.samples.filter((x) => x.t >= w.leeFrom.t && x.t <= w.openAgain.t)) {
          expect(s.windLatAccelMs2, `L${level} t=${s.t.toFixed(2)}`).toBeGreaterThanOrEqual(sideDeadbandMs2);
        }
        expect((WIND_SHELTER_RESIDUAL * OPEN_MIN) / CHASSIS_MASS).toBeGreaterThan(sideDeadbandMs2);
        // «ОТСЛАБВА» ON THE WAY IN: from the last open sample to the first
        // full-lee one the force falls by far more than the chip's hysteresis,
        // in under a second.
        const before = o.samples.filter((x) => x.t < w.leeFrom.t).pop()!;
        const firstFull = w.fullLee[0]!;
        expect(-before.windN - -firstFull.windN, `L${level} fall`).toBeGreaterThan(2 * phaseHysteresisN);
        expect(firstFull.t - before.t).toBeLessThan(1.2);
        // «СЕ УСИЛВА — ВЪЗДУХЪТ ТЕ БУТА НАЛЯВО» AT THE CAB: the rise from the
        // last full-lee sample to the first open one clears the hysteresis too.
        const lastFull = w.fullLee[w.fullLee.length - 1]!;
        expect(-w.openAgain.windN - -lastFull.windN, `L${level} rise`).toBeGreaterThan(2 * phaseHysteresisN);
        expect(w.openAgain.windLatAccelMs2).toBeGreaterThan(0); // + = pushed LEFT
        note(
          `CHIP L${level}: into the lee ${(-before.windN).toFixed(0)} → ${(-firstFull.windN).toFixed(0)} N in ${(firstFull.t - before.t).toFixed(2)} s; at the cab ${(-lastFull.windN).toFixed(0)} → ${(-w.openAgain.windN).toFixed(0)} N in ${(w.openAgain.t - lastFull.t).toFixed(2)} s; min a_lat in lee ${Math.min(...w.fullLee.map((s) => s.windLatAccelMs2)).toFixed(3)} m/s² (dead band ${sideDeadbandMs2})`,
        );
      }
    },
    TEST_TIMEOUT,
  );

  for (const level of LEVELS) {
    it(
      `L${level} — «с отпусната ръка колата тръгва наляво» / «се понесе през половин лента» / «отпусни корекцията плавно»: let go at the cab the car is carried to the median; let go in the lee it is not; a wheel LEFT where the open wind wanted it runs toward the truck`,
      () => {
        const at80 = { passWhenGapM: 70 } as const;
        const base = passDrive(level, 80, at80);
        const w = passWindow(base);
        const xAt = (o: LiveWindDriveOutcome, tSec: number) =>
          o.samples.reduce((bst, x) => (Math.abs(x.t - tSec) < Math.abs(bst.t - tSec) ? x : bst)).x;
        // 1. Hands off from the frame the wind is whole again, past the cab —
        //    the blown-out demo's moment — for 2 s and for 2.5 s.
        const tCab = w.openAgain.t;
        const loose = passDrive(level, 80, { ...at80, lapse: { atSec: tCab, forSec: 2.5 } });
        const carried2 = xAt(loose, tCab) - xAt(loose, tCab + 2);
        const carried25 = xAt(loose, tCab) - xAt(loose, tCab + 2.5);
        // 2. Hands off INSIDE the lee, for as long as the full lee lasts (≤ 2 s),
        //    and the same seconds with the lee switched off.
        const tLee = w.fullLee[0]!.t;
        const leeSec = Math.min(2, w.fullLee[w.fullLee.length - 1]!.t - tLee);
        const looseInLee = passDrive(level, 80, { ...at80, lapse: { atSec: tLee, forSec: leeSec } });
        const carriedInLee = xAt(looseInLee, tLee) - xAt(looseInLee, tLee + leeSec);
        const looseNoLee = passDrive(level, 80, { ...at80, noShelter: true, lapse: { atSec: tLee, forSec: leeSec } });
        const carriedNoLee = xAt(looseNoLee, tLee) - xAt(looseNoLee, tLee + leeSec);
        // 3. The wheel held where the OPEN wind wanted it, through the lee.
        const openHand = mean(base.samples.filter((x) => x.t > tLee - 1.5 && x.t < w.leeFrom.t).map((x) => x.steerInput));
        const hold = { atSec: tLee, steps: [{ forSec: leeSec, input: openHand }] };
        const held = passDrive(level, 80, { ...at80, handScript: hold });
        const ranEast = xAt(held, tLee + leeSec) - xAt(held, tLee);
        const heldNoLee = passDrive(level, 80, { ...at80, noShelter: true, handScript: hold });
        const ranEastNoLee = xAt(heldNoLee, tLee + leeSec) - xAt(heldNoLee, tLee);
        note(
          `HANDS L${level}@80: let go at the cab → ${carried2.toFixed(2)} m toward the median in 2 s, ${carried25.toFixed(2)} m in 2.5 s; let go ${leeSec.toFixed(2)} s in the lee → ${carriedInLee.toFixed(2)} m (same seconds, no lee: ${carriedNoLee.toFixed(2)} m); ` +
            `open-wind hand ${(openHand * 100).toFixed(1)} % held ${leeSec.toFixed(2)} s through the lee → ${ranEast.toFixed(2)} m toward the truck (same hand, no lee: ${ranEastNoLee.toFixed(2)} m)`,
        );
        // «…тръгва наляво, към разделителната ивица»: over a metre in two seconds…
        expect(carried2, "carried toward the median past the cab").toBeGreaterThan(1.2);
        // …and «през половин лента» by the time he wakes: the lane is 8.12 m
        // wide; 2.5 s of loose wheel is three to five metres of it.
        expect(carried25).toBeGreaterThan(3);
        expect(carried25).toBeLessThan(5.5);
        // In the lee the same loose hand is carried far less than in the open.
        expect(carriedInLee, "in the lee the same lapse carries it far less").toBeLessThan(0.45 * carriedNoLee);
        expect(carriedNoLee).toBeGreaterThan(0.4);
        // «Отпусни корекцията плавно»: the open-wind hand is to the right, and
        // kept through the lee it runs the car toward the truck — the lee's doing.
        expect(openHand, "the open-wind hand is to the right").toBeLessThan(0);
        expect(ranEast, "a held correction in the lee runs toward the truck").toBeGreaterThan(0.5);
        expect(ranEast - ranEastNoLee, "…and that is the lee's doing").toBeGreaterThan(0.4);
      },
      TEST_TIMEOUT,
    );
  }
});

// ---------------------------------------------------------------------------
// 8b. Step 3 on the live car: no lee at any gap the product does not bill
// ---------------------------------------------------------------------------

describe("ROUND 2 (F-05) — following the truck on the live car: a drive the product does not call too close is never in the lee; the lee begins inside the «твърде близо» card", () => {
  const BILL_LINE_M =
    DEFAULT_RULE_CONFIG.followSafeSeconds * DEFAULT_RULE_CONFIG.followFireRatio * (40 / 3.6);
  /** The gaps the follower is asked to settle at, m — from the taught side of
   *  the line, through round 1's band (14–15 m), to tucked under the tail. */
  const ASKED = [14.6, 14.0, 13.6, 13.2, 12.6, 11.5, 10] as const;
  for (const level of [1, 3, 4, 5] as const) {
    it(
      `L${level}: seven follow drives, from 16 m behind the tail down to 11 — every drive with no «твърде близо» has the whole wind on every sample; every drive in the lee has the card`,
      () => {
        const raisedBy = (o: LiveWindDriveOutcome) => [...o.violationCodes, ...(o.result.coachedMistakes ?? []).map((m) => m.code)];
        const gapOf = (s: LiveWindSample) => s.truckNorthM! - BOTH_HALVES;
        const rows: Array<{ asked: number; min: number; max: number; minShelter: number; card: boolean }> = [];
        for (const followGapM of ASKED) {
          const o = passDrive(level, TAUGHT_KMH, { neverPass: true, followGapM });
          // Settled behind the truck, in its lane (the harness's follower is a
          // proportional pedal: it settles some 1.4 m outside what it is asked).
          const run = o.samples.filter((s) => s.t > 30 && s.y < 860 && s.truckNorthM !== null);
          expect(run.length, `asked ${followGapM}`).toBeGreaterThan(1500);
          for (const s of run) expect(Math.abs(s.truckRightM ?? 9), `asked ${followGapM}`).toBeLessThan(1.5);
          const gaps = run.map(gapOf);
          rows.push({
            asked: followGapM,
            min: Math.min(...gaps),
            max: Math.max(...gaps),
            minShelter: Math.min(...o.samples.map((s) => s.shelter)),
            card: raisedBy(o).includes("FOLLOWING_TOO_CLOSE"),
          });
          // The only thing any of these drives is ever told is «твърде близо».
          for (const c of raisedBy(o)) expect(c, `asked ${followGapM}`).toBe("FOLLOWING_TOO_CLOSE");
          // ON EVERY SAMPLE OF EVERY DRIVE: no lee at or beyond the wake's end
          // (to the frame the wind and the traffic are stepped apart by).
          for (const s of o.samples) {
            if (s.truckNorthM !== null && s.shelter < 1) {
              expect(gapOf(s), `asked ${followGapM} t=${s.t.toFixed(1)}`).toBeLessThan(WIND_SHELTER_WAKE_M + 0.2);
            }
          }
        }
        for (const r of rows) {
          note(
            `FOLLOW L${level} asked ${r.asked}: settled ${r.min.toFixed(2)}..${r.max.toFixed(2)} m behind the tail, least wind share ${r.minShelter.toFixed(3)}, «твърде близо» ${r.card ? "RAISED" : "not raised"}`,
          );
          // THE CLAIM OF STEP 3: a drive the product does not call too close
          // was never in the lee — the whole wind on every sample of it.
          if (!r.card) expect(r.minShelter, `asked ${r.asked}: no card, so no lee`).toBe(1);
          // …and its converse: a drive that was in the lee has the card.
          if (r.minShelter < 1) expect(r.card, `asked ${r.asked}: in the lee, so the card`).toBe(true);
        }
        // The sweep really straddles the line: the far drives are clean — one of
        // them INSIDE round 1's band, where its verifier found a lee and no
        // card — and the near ones are in the lee, with the card.
        const clean = rows.filter((r) => !r.card);
        const inLee = rows.filter((r) => r.minShelter < 1);
        expect(clean.length).toBeGreaterThanOrEqual(2);
        expect(inLee.length).toBeGreaterThanOrEqual(2);
        expect(Math.min(...clean.map((r) => r.min)), "the nearest unbilled drive").toBeLessThan(15.2);
        expect(Math.min(...clean.map((r) => r.min))).toBeGreaterThan(WIND_SHELTER_WAKE_M);
        // The card begins OUTSIDE the lee: some billed drive still has the whole wind.
        expect(rows.some((r) => r.card && r.minShelter === 1), "a drive with the card and no lee").toBe(true);
        expect(BILL_LINE_M).toBeCloseTo(14, 9);
      },
      TEST_TIMEOUT,
    );
  }
});

// ---------------------------------------------------------------------------
// 9. ROUND 2 (F-01) — the return, on the live car, at every rung
// ---------------------------------------------------------------------------

/**
 * WHERE THE RETURN IS BEGUN so that the live car's CENTRE crosses the lane line
 * with a stated distance between its tail and the truck's nose. The return is
 * a 60 m lane change; the car gains on the truck while it makes the first half
 * of it, so it is begun that much earlier — a straight line in the stated gap,
 * measured on this harness's own driver at each speed (the tape's real gap is
 * asserted on every drive, so a drift in the calibration is a red test, not a
 * mislabelled one).
 */
const RETURN_OVER_M = 60;
const RETURN_BEGIN: Record<number, Record<number, number>> = {
  // stated gap → metres clear at which the return is begun (negative = the
  // car's tail is still that far BEHIND the truck's nose: it is alongside).
  53: { 3: -3.78, 4.5: -2.28, 6.5: -0.28, 10: 3.38, 15: 8.36, 20: 13.35 },
  62: { 3: -7.32, 4.5: -5.83, 6.5: -3.84, 10: -0.36, 15: 4.72, 20: 9.96 },
};
/** Road between the car's tail and the truck's nose on a sample, m, in the
 *  ROAD's frame (district north) — the car's own heading is 5–8° off the road
 *  while it changes lane, and the truck's runner measures along the truck. */
const roadGapBehindM = (s: LiveWindSample): number => -s.truckNorthM! - BOTH_HALVES;
/** The lane line between the overtaking lane and the truck's, district x. */
const LANE_LINE_X = -4.06;

interface ReturnTape {
  o: LiveWindDriveOutcome;
  /** The first sample with the car's centre back in the truck's lane. */
  entry: LiveWindSample;
  entryGapM: number;
  after: LiveWindSample[];
}
function returnTape(level: ScenarioLevel, kmh: 53 | 62, entryGapM: number): ReturnTape {
  const o = passDrive(level, kmh, { returnWhenClearM: RETURN_BEGIN[kmh]![entryGapM]!, returnChangeOverM: RETURN_OVER_M });
  const i = o.samples.findIndex((s) => s.truckNorthM !== null && s.truckNorthM < 0 && s.x > LANE_LINE_X && s.t > 15);
  expect(i, "the car came back into the truck's lane").toBeGreaterThan(0);
  const entry = o.samples[i]!;
  return { o, entry, entryGapM: roadGapBehindM(entry), after: o.samples.slice(i) };
}

/**
 * THE INDEPENDENT ORACLE ON THE LIVE TAPE (round 3) — the truck's own SPEED,
 * sample by sample from the frame the runner opened its watch, handed to the
 * rule engine's own harsh-brake detector as if it were a car on an empty road
 * (nothing is a cause; its 35 км/ч onset floor off and an exact 0.4 s held —
 * the two stated readings of `harshBrakeEpisode.ts`). «Hard» = it pushes
 * HARSH_BRAKING_NO_CAUSE. Not the runner, not the account.
 */
function truckBrakedHard(o: LiveWindDriveOutcome): boolean {
  const from = o.answers.find((a) => a.phase === "watching")?.t;
  if (from === undefined) return false;
  let state = createRuleEngine({
    harshBrakeMinSpeedKmh: 0,
    harshBrakeSustainSec: DEFAULT_RULE_CONFIG.harshBrakeSustainSec * (1 - 1e-9),
  });
  for (const s of o.samples) {
    if (s.t < from - 1e-9 || s.truckKmh === null) continue;
    const r = reduceTick(state, {
      t: s.t,
      speedKmh: s.truckKmh,
      maxSpeedKmh: 130,
      position: { x: 0, y: s.y },
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
    });
    state = r.state;
    if (r.events.some((e) => e.code === "HARSH_BRAKING_NO_CAUSE")) return true;
  }
  return false;
}

describe("ROUNDS 2–3 (F-01, F2-02) — an early return by a car faster than the truck: where the truck REALLY brakes hard, BILLED, NOT PRAISED, task 2 NOT credited by the gap the braking opens; where it only lifts, not billed, not praised, credited when the return is finished", () => {
  for (const level of LEVELS) {
    for (const kmh of [SLOWEST_LAWFUL_KMH, TAUGHT_KMH] as const) {
      it(
        `L${level} @ ${kmh} км/ч: back in 3.0 / 4.5 / 6.5 m ahead of the truck's bumper`,
        () => {
          for (const nominal of [3.0, 4.5, 6.5]) {
            const { o, entry, entryGapM, after } = returnTape(level, kmh, nominal);
            const label = `L${level}@${kmh} ${nominal} m`;
            // The tape is what its name says: a lawful pass, an ordinary 60 m
            // lane change, begun too soon.
            expect(Math.abs(entryGapM - nominal), `${label}: measured ${entryGapM.toFixed(2)} m`).toBeLessThan(0.4);
            expect(entry.truckKmh!, label).toBeCloseTo(40, 0);
            for (const s of o.samples.filter((x) => x.t > 14 && x.t < entry.t)) {
              expect(s.speedKmh, `${label} lawful t=${s.t.toFixed(1)}`).toBeGreaterThanOrEqual(MOTORWAY_FLOOR_KMH);
              expect(s.speedKmh).toBeLessThan(100);
            }
            const examRung = level === 4;
            const minTruck = Math.min(...after.filter((s) => s.truckKmh !== null).map((s) => s.truckKmh!));
            expect(minTruck, `${label}: the truck slowed for him`).toBeLessThan(40 - 0.3 * 3.6);
            // The watch opened BEFORE the centre crossed (the body came over
            // the line first), and nothing was decided on the entry frame.
            const watched = o.answers[0]!;
            expect(watched.phase, label).toBe("watching");
            expect(watched.t, label).toBeLessThan(entry.t);
            expect(o.answers.filter((a) => a.phase !== "watching" && a.t <= entry.t + 1e-9), label).toEqual([]);
            const hard = truckBrakedHard(o);
            // 3 m ahead the truck ALWAYS brakes hard: well inside its reach.
            if (nominal === 3.0) expect(hard, `${label}: the truck's own speed trace`).toBe(true);
            const praised = o.session.events.filter((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE");
            // NOT PRAISED either way: the one commended lane change is the
            // pull-out, seconds before — «…навреме» is false of this return.
            expect(praised, label).toHaveLength(1);
            expect(praised[0]!.t, label).toBeLessThan(entry.t - 5);
            if (hard) {
              expect(o.answers.map((a) => a.phase), label).toEqual(["watching", "braked"]);
              const braked = o.answers[1]!;
              expect(braked.heldSec, label).toBeGreaterThanOrEqual(DEFAULT_RULE_CONFIG.harshBrakeSustainSec * (1 - 1e-9));
              expect(braked.qualifiedSec, label).toBeGreaterThanOrEqual(DEFAULT_RULE_CONFIG.harshBrakeSustainSec * (1 - 1e-9));
              expect(braked.decelMps2, label).toBeGreaterThan(DEFAULT_RULE_CONFIG.harshBrakeDecelMps2);
              expect(braked.shedMps, label).toBeGreaterThanOrEqual(DEFAULT_RULE_CONFIG.harshBrakeDecelMps2 * DEFAULT_RULE_CONFIG.harshBrakeSustainSec);
              expect(braked.t - entry.t, `${label}: reported within 1.5 s of the return`).toBeLessThan(1.5);
              // BILLED — the lane-drop lessons' own code, named as this act,
              // 10 т. on the first occurrence at EVERY rung (D1: an опасна
              // fault keeps the product's ladder, as on sc-merge-lane-end).
              expect(o.violationCodes, label).toEqual(["LANE_ENTRY_FORCED_BRAKING"]);
              expect((o.result.coachedMistakes ?? []).map((m) => m.code), label).toEqual([]);
              const bill = o.session.events.find((e) => e.kind === "violation")!;
              expect(bill.kind === "violation" && bill.detail, label).toBe("overtakeReturn");
              expect(bill.titleBg, label).toBe(LANE_ENTRY_ACT_COPY.overtakeReturn.titleBg);
              expect(bill.t, label).toBeCloseTo(braked.t, 6);
              expect(o.result.score, label).toBe(10);
              // NOT CREDITED BY THE FORCED GAP.
              const opened = after.find((s) => roadGapBehindM(s) >= 10.25 && Math.abs(s.x) < 4.06);
              if (!examRung) {
                expect(opened, `${label}: the clear gap opened behind him`).toBeDefined();
                expect(opened!.t - entry.t, label).toBeLessThan(3.5);
              }
              expect(o.outcomes.map((x) => x.detail), label).toEqual(["drewLevel"]);
              expect(o.result.objectives.map((x) => [x.id, x.done]), label).toEqual([
                ["sc-acw-pass", true],
                ["sc-acw-back", false],
                ["sc-acw-finish", false],
              ]);
              expect(o.result.passed, label).toBe(false);
              if (examRung) expect(o.durationSec - bill.t, `${label}: the exam ends on the bill`).toBeLessThan(0.1);
              else expect(o.samples[o.samples.length - 1]!.y, `${label}: the drive still ends`).toBeGreaterThan(880);
              note(
                `EARLY ${label}: BRAKED — entry gap ${entryGapM.toFixed(2)} m t=${entry.t.toFixed(2)}; truck 40 → ${minTruck.toFixed(1)} км/ч; braked@${braked.t.toFixed(2)} (held ${braked.heldSec.toFixed(3)} s, mean ${braked.decelMps2.toFixed(2)} m/s², shed ${braked.shedMps.toFixed(2)} m/s); ev=[${o.eventLog}] score=${o.result.score} passed=${o.result.passed}`,
              );
            } else {
              // LIFT (D2): the truck gave way, not hard — NOT billed as forced
              // braking, not praised; the product's own «you came back too
              // soon» (OVERTAKE_RETURN_TOO_EARLY, основна — «…и го принуди да
              // намали») is raised, and task 2 is credited only when the return
              // is finished.
              expect(o.answers.map((a) => a.phase), label).toEqual(["watching", "lift"]);
              const lift = o.answers[1]!;
              expect(lift.shedMps, label).toBeGreaterThanOrEqual(0.3);
              expect(lift.shedMps, label).toBeLessThan(DEFAULT_RULE_CONFIG.harshBrakeDecelMps2 * DEFAULT_RULE_CONFIG.harshBrakeSustainSec + 0.5);
              // Raised once — billed on the exam rung, coached the first time on
              // a practice rung (founder ruling 16, the universal first-fault grace).
              const raised = [...o.violationCodes, ...(o.result.coachedMistakes ?? []).map((m) => m.code)];
              expect(raised, label).toEqual(["OVERTAKE_RETURN_TOO_EARLY"]);
              const earlyAt =
                o.session.events.find((e) => e.kind === "violation")?.t ??
                (o.result.coachedMistakes ?? []).find((m) => m.code === "OVERTAKE_RETURN_TOO_EARLY")!.t;
              expect(earlyAt, label).toBeCloseTo(lift.t, 6);
              expect(o.result.score, label).toBe(examRung ? 3 : 0);
              const over = o.outcomes.find((x) => x.detail === "overtaken")!;
              expect(over.tSec, label).toBeGreaterThan(lift.t);
              const lastShed = after.filter((s) => s.truckKmh !== null && s.truckKmh < 40 - 1e-6).pop();
              expect(over.tSec - entry.t, label).toBeGreaterThan(1.44);
              expect(o.result.objectives.map((x) => x.done), label).toEqual([true, true, true]);
              note(
                `EARLY ${label}: LIFT — entry gap ${entryGapM.toFixed(2)} m t=${entry.t.toFixed(2)}; truck 40 → ${minTruck.toFixed(1)} км/ч (shed ${lift.shedMps.toFixed(2)} m/s); lift@${lift.t.toFixed(2)}, overtaken@${over.tSec.toFixed(2)} (+${(over.tSec - entry.t).toFixed(2)} s; truck back to 40 at ${lastShed ? lastShed.t.toFixed(2) : "—"}); ev=[${o.eventLog}] score=${o.result.score} coached=[${(o.result.coachedMistakes ?? []).map((m) => m.code)}] passed=${o.result.passed}`,
              );
            }
          }
        },
        TEST_TIMEOUT,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 10. ROUND 3 (F2-01) — the return made while SLOWER than the truck
// ---------------------------------------------------------------------------

/**
 * THE ROUND-2 VERIFIER'S TWO TAPES, on this file's harness through its free
 * planner (its own "entry" mode, ported line for line): pass at `cruiseKmh`,
 * begin a 60 m return so the car's centre would cross the lane line about
 * `entryGapM` ahead of the truck's bumper at an unchanged speed, hold
 * `backKmh` on the pedals through the return (the ease-off / the brake dab —
 * which is why the real crossing is nearer), then `afterKmh` once home.
 *   slow51b36g18 — the slowest lawful passer (51) easing off to 36 (≈1.4 m/s²);
 *   dab62g20     — the taught speed (62) with a brake dab to 30, then 62 again.
 * Round 2 answered «clear» on the frame the centre crossed the line (the car
 * slower than the truck, 10.8–10.9 m ahead), credited and praised it, and the
 * truck braked from 40 to 24.6–28.6 км/ч 0.6–1.6 s later. PASS 3/3 at L1–L5.
 */
const PASS_X = OVERTAKE_X;
function slowReturnPlanner(cfg: { cruiseKmh: number; entryGapM: number; backKmh: number; afterKmh: number }): NonNullable<
  LiveWindDriveOptions["planner"]
> {
  let state: "behind" | "out" | "back" | "home" = "behind";
  let fromY = 0;
  let glanced = false;
  const over = 80;
  const backOver = 60;
  const ramp = (from: number, to: number, y0: number, len: number) => (yy: number) => {
    const u = Math.min(1, Math.max(0, (yy - y0) / len));
    return from + (to - from) * (u * u * (3 - 2 * u));
  };
  return ({ y, speedKmh, truck }) => {
    const centres = truck ? truck.y - y : Infinity;
    const gapAhead = centres - BOTH_HALVES;
    const clearBehind = -centres - BOTH_HALVES;
    const trKmh = truck ? truck.speedKmh : 40;
    let glance: "left" | "right" | null = null;
    if (state === "behind" && gapAhead <= Math.max(45, (cfg.cruiseKmh / 3.6) * 3) && speedKmh > 20) {
      state = "out";
      fromY = y;
      glanced = false;
    }
    if (state === "out" && y - fromY > over && clearBehind >= cfg.entryGapM - (1 - trKmh / Math.max(20, speedKmh)) * (backOver / 2)) {
      state = "back";
      fromY = y;
      glanced = false;
    }
    if (state === "back" && y - fromY > backOver + 15) state = "home";
    const atEnd = y >= 915;
    if (state === "behind") {
      let target = cfg.cruiseKmh;
      if (truck && gapAhead < 45) target = Math.min(target, Math.max(20, trKmh + (gapAhead - 30) * 0.6));
      return { xAt: () => 0, targetKmh: target, indicator: "off", atEnd };
    }
    if (state === "out") {
      if (!glanced) {
        glance = "left";
        glanced = true;
      }
      return { xAt: ramp(0, PASS_X, fromY, over), targetKmh: cfg.cruiseKmh, indicator: "left", glance, atEnd };
    }
    if (state === "back") {
      if (!glanced) {
        glance = "right";
        glanced = true;
      }
      return { xAt: ramp(PASS_X, 0, fromY, backOver), targetKmh: cfg.backKmh, indicator: "right", glance, atEnd };
    }
    let target = cfg.afterKmh;
    if (truck && gapAhead > 0 && gapAhead < 45) target = Math.min(target, Math.max(20, trKmh + (gapAhead - 30) * 0.6));
    return { xAt: () => 0, targetKmh: target, indicator: "off", atEnd };
  };
}

describe("ROUND 3 (F2-01) — the verifier's slower-than-truck returns at every rung: never decided on the entry frame, never praised, never credited while the truck has to answer — billed when its own speed trace says it braked hard", () => {
  const TAPES = {
    slow51b36g18: { cruiseKmh: 51, entryGapM: 18, backKmh: 36, afterKmh: 36 },
    dab62g20: { cruiseKmh: 62, entryGapM: 20, backKmh: 30, afterKmh: 62 },
  } as const;
  for (const level of LEVELS) {
    for (const [name, cfg] of Object.entries(TAPES)) {
      it(
        `L${level} ${name}`,
        () => {
          const o = liveWindDrive({
            lesson: compileScenario(SC_AC_WIND_TRUCK_PASS, level),
            districtRaw: MW,
            trace: SHADOW,
            driver: "analog",
            maxSec: 200,
            planner: slowReturnPlanner(cfg),
          });
          const label = `L${level} ${name}`;
          const i = o.samples.findIndex((s) => s.truckNorthM !== null && s.truckNorthM < 0 && s.x > LANE_LINE_X && s.t > 15);
          expect(i, `${label}: the car came back into the truck's lane`).toBeGreaterThan(0);
          const entry = o.samples[i]!;
          const after = o.samples.slice(i);
          // The tape is the verifier's: slower than the truck at the line,
          // about 11 m ahead of its bumper, the truck still at 40.
          expect(entry.speedKmh, label).toBeLessThan(40);
          expect(roadGapBehindM(entry), label).toBeGreaterThan(9.5);
          expect(roadGapBehindM(entry), label).toBeLessThan(15);
          expect(entry.truckKmh!, label).toBeCloseTo(40, 0);
          // THE FINDING, SHUT: nothing is decided on the frame the line is
          // crossed — the watch opened earlier and stays open.
          expect(o.answers[0]?.phase, label).toBe("watching");
          expect(o.answers.filter((a) => a.phase !== "watching" && a.t <= entry.t + 0.5), label).toEqual([]);
          expect(o.answers.map((a) => a.phase), label).not.toContain("clear");
          const minTruck = Math.min(...after.filter((s) => s.truckKmh !== null).map((s) => s.truckKmh!));
          expect(minTruck, `${label}: the truck had to slow for him`).toBeLessThan(38.9);
          const hard = truckBrakedHard(o);
          // NEVER PRAISED: the return is not commended (only the pull-out is).
          const praised = o.session.events.filter((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE");
          expect(praised, label).toHaveLength(1);
          expect(praised[0]!.t, label).toBeLessThan(entry.t - 5);
          const billed = o.violationCodes.includes("LANE_ENTRY_FORCED_BRAKING");
          expect(billed, `${label}: billed iff the truck's own speed trace says it braked hard`).toBe(hard);
          // …and where it only gave way, the product's own «you came back too
          // soon» is raised instead (never both for the first answer).
          const raised = [...o.violationCodes, ...(o.result.coachedMistakes ?? []).map((m) => m.code)];
          if (!hard) expect(raised, label).toContain("OVERTAKE_RETURN_TOO_EARLY");
          if (hard && o.answers[1]?.phase === "braked") expect(raised, label).not.toContain("OVERTAKE_RETURN_TOO_EARLY");
          // NEVER CREDITED while the truck had to answer: no «overtaken»
          // before the truck's last shed; and none at all after a hard brake.
          const over = o.outcomes.find((x) => x.detail === "overtaken");
          if (hard) expect(over, label).toBeUndefined();
          if (over) {
            const lastSlowing = after.filter((s, k) => k > 0 && s.truckKmh! < after[k - 1]!.truckKmh! - 1e-9).pop();
            expect(over.tSec, label).toBeGreaterThan(lastSlowing ? lastSlowing.t + 1.44 - 0.05 : 0);
          }
          note(
            `SLOW ${label}: coached=[${(o.result.coachedMistakes ?? []).map((m) => m.code)}] line at ${entry.speedKmh.toFixed(1)} км/ч, ${roadGapBehindM(entry).toFixed(2)} m, t=${entry.t.toFixed(2)}; truck 40 → ${minTruck.toFixed(1)} км/ч; hard=${hard}; answers ${o.answers.map((a) => `${a.phase}@${a.t.toFixed(2)}${a.phase === "braked" ? `(held ${a.heldSec.toFixed(3)}, mean ${a.decelMps2.toFixed(2)})` : a.phase === "lift" ? `(${a.shedMps.toFixed(2)})` : ""}`).join(" ")}; outcomes ${o.outcomes.map((x) => `${x.detail}@${x.tSec.toFixed(2)}`).join(" ")}; ev=[${o.eventLog}] score=${o.result.score} obj=${o.result.objectives.map((x) => (x.done ? 1 : 0)).join("")} passed=${o.result.passed}`,
          );
        },
        TEST_TIMEOUT,
      );
    }
  }
});

describe("ROUND 2 (F-01) — a return with the whole truck in the mirror stays clean and praised, at every lawful speed and every rung", () => {
  for (const level of LEVELS) {
    for (const kmh of [SLOWEST_LAWFUL_KMH, TAUGHT_KMH] as const) {
      it(
        `L${level} @ ${kmh} км/ч: back in 10 / 15 / 20 m ahead of the truck's bumper — the truck never brakes, 0 т., 3/3, both lane changes commended`,
        () => {
          for (const nominal of [10, 15, 20]) {
            const { o, entry, entryGapM, after } = returnTape(level, kmh, nominal);
            const label = `L${level}@${kmh} ${nominal} m`;
            expect(Math.abs(entryGapM - nominal), `${label}: measured ${entryGapM.toFixed(2)} m`).toBeLessThan(0.4);
            for (const s of o.samples.filter((x) => x.t > 12 && x.truckKmh !== null)) {
              expect(s.truckKmh!, `${label} t=${s.t.toFixed(1)}`).toBeCloseTo(40, 4);
            }
            expect(o.answers.map((a) => a.phase), label).toEqual(["watching", "clear"]);
            expectCleanPass(o, label);
            const praised = o.session.events.filter((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE");
            expect(praised, label).toHaveLength(2);
            // The return's praise carries the lane change's own time…
            expect(Math.abs(praised[1]!.t - entry.t), label).toBeLessThan(0.4);
            // …and the second task is credited on the frame the truck's runner
            // says the whole truck is behind, in its lane, unbraked-for.
            const over = o.outcomes.find((x) => x.detail === "overtaken")!;
            // ROUND 3: credited when the return is FINISHED — settled, clear,
            // not caught, the truck silent for 1.44 s — never on the frame
            // the centre crosses the line.
            expect(over.tSec - entry.t, label).toBeGreaterThan(1.44);
            expect(o.answers[1]!.t, label).toBeCloseTo(over.tSec, 6);
            const at = after.reduce((b, s) => (Math.abs(s.t - over.tSec) < Math.abs(b.t - over.tSec) ? s : b));
            expect(roadGapBehindM(at), label).toBeGreaterThanOrEqual(10.25 - 0.15);
            expect(Math.abs(at.x), label).toBeLessThanOrEqual(4.06 + 0.1);
            note(`CLEAN ${label}: entry gap ${entryGapM.toFixed(2)} m t=${entry.t.toFixed(2)}; truck 40.0 throughout; overtaken@${over.tSec.toFixed(2)}; ev=[${o.eventLog}] score=${o.result.score}`);
          }
        },
        TEST_TIMEOUT,
      );
    }
  }
});
