/**
 * THE VRU FAMILY, AGAINST WHAT THE DEPLOYED BUILD ACTUALLY DID (2026-08-17).
 *
 * The catalogue sweep drove sc-vu-cyclist-hook, sc-vu-emergency,
 * sc-vu-emergency-junction, sc-vu-pass-clearance and sc-vu-door-zone on staging
 * — a careful drive and a flat-out drive each, on a phone and on a desktop —
 * and read the credit off the DEBRIEF rather than off the task chip. Three
 * classes of defect came back, and every one of them was invisible to this
 * repository's existing batteries for the same reason: those batteries replay
 * the AUTHORED ghost, and an authored ghost does what its author meant.
 *
 *   1. FIVE reachZone rows certified a fact about ANOTHER ROAD USER.
 *      `stepReachZone(params, prevState, tick)` is the entire contract, and a
 *      `SimTick` carries position, speed, lane, indicator — no staged actor, no
 *      priority, no yield outcome. So the tick was awarded for a coordinate and
 *      the sentence beside it said the student had let a cyclist through.
 *   2. sc-vu-emergency handed the чл. 91 COMMENDATION to the drive that ignored
 *      the ambulance — «✓ Правилно отстъпено предимство» at 0:06 on a run that
 *      held the throttle for 210 s and never braked.
 *   3. sc-vu-pass-clearance graded NEITHER direction: careful and reckless came
 *      back byte-identical (ИЗДЪРЖАН · 0 наказателни точки · ★★★ · +100 XP),
 *      because the lane centre itself sat inside the runtime's silent band.
 *
 * The guards below are written so that each one is RED on the shipped
 * behaviour and GREEN on the corrected one, and — for the two grading
 * defects — so that the opposite direction is pinned in the same file. A test
 * that only proves the fault is gone is half a test: the fix for a false pass
 * is a false failure unless somebody nails the other end down.
 *
 * The vocabulary guard is a CLASS guard, not three pins, for the same reason
 * `objective-title-truth-junctions3-rail.test.ts` is one: the next VRU template
 * must not be able to reintroduce the certificate quietly.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEvalState, parseObjectiveParams, stepObjective } from "../../objectives";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES_VRU } from "../templates-vru";
import { SC_VU_EMERGENCY, SC_VU_PASS_CLEARANCE } from "../templates-vru";
import type { ScenarioSpec } from "../types";
import type { ObjectiveParams } from "../../types";
import type { ScenarioTrace } from "../../../traces/types";
import type { StagedEventSpec } from "../../../contracts";
import { recordScriptedDrive, type DriveScript, type RecordedDrive } from "../../../traces/recorder";
import { makeTick } from "../../__tests__/fixtures";
import { createWorldRuntime } from "../../../runtime";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict } from "../../../traffic/types";
import { createRuleEngine } from "../../../rules";
import { createScenarioDirector } from "../../../orchestrator/director";
import { DT, stepFrame, type Stack } from "../../../orchestrator/__tests__/helpers";

const FAMILY: readonly ScenarioSpec[] = SCENARIO_TEMPLATES_VRU;

const REPO_ROOT = join(process.cwd(), "..");
const loadDistrict = (id: string): unknown =>
  JSON.parse(readFileSync(join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));

const violations = (d: RecordedDrive) =>
  d.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
const commendations = (d: RecordedDrive) =>
  d.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);

// ---------------------------------------------------------------------------
// 1. A reachZone title may claim only what a reachZone can read
// ---------------------------------------------------------------------------

/**
 * THE VOCABULARY OF AN UNISSUABLE CERTIFICATE, VRU edition.
 *
 * `пропусн` and the halt words are the junctions3/rail set, kept verbatim so
 * the two guards agree. The other two markers are what THIS family added and
 * that guard's list never had to name:
 *
 *   · «след като … е преминал/премине» — a clause that conditions the tick on
 *     ANOTHER ACTOR'S PROGRESS. sc-vu-turned and sc-vuej-cross both used it,
 *     and neither the cyclist's arc nor the ambulance's is anywhere on a
 *     SimTick. It is the same lie as «пропуснал», told in the past perfect.
 *   · «изпревари» / «подмини» — a MANOEUVRE NAMED AGAINST A THIRD PARTY. A disc
 *     can see that the car arrived; it cannot see that anything was overtaken,
 *     and on sc-vu-pass-clearance the careful sweep drive ticked «Изпревари
 *     велосипедиста» at 2:34 with the rider still in front of it.
 *
 * Substrings, deliberately: JS `\b` is ASCII-only and misfires on Cyrillic.
 * Checked against the honest nouns this family actually uses — «преминаване»,
 * «предимство», «редицата», «Прибери се» — none of which contains one.
 */
const DUTY_CLAIMS: ReadonlyArray<{ marker: string; claimBg: string }> = [
  { marker: "пропусн", claimBg: "пропускане на друг участник" },
  { marker: "спри", claimBg: "пълно спиране" },
  { marker: "изчакай", claimBg: "изчакване на място" },
  { marker: "след като", claimBg: "напредъка на друг участник" },
  { marker: "изпревари", claimBg: "изпреварване на друг участник" },
  { marker: "подмини", claimBg: "подминаване на друг участник/обект" },
];

const dutyClaimIn = (titleBg: string) =>
  DUTY_CLAIMS.find((c) => titleBg.toLowerCase().includes(c.marker));

/**
 * The posted limit of the scenario's own map, km/h — the bar a speed cap has to
 * get under before it is a demand rather than a decoration.
 *
 * WHY THIS IS STRICTER THAN THE junctions3/rail GUARD, and the row that forced
 * it: `sc-vue-made-way` carried «пропусни линейката» with `maxSpeedKmh: 55` on
 * ln-v1, a boulevard posted 50. The older guard's `provable()` asks only
 * whether a cap EXISTS, so a 55 on a 50 road read as proof — while in fact no
 * lawfully-driven car can fail it, AND carrying it flips `inGraceRing` in
 * objectives.ts and stretches the acceptance back down the approach by
 * REACH_ZONE_GRACE_M. A cap above the limit cannot refuse anybody and can only
 * forgive; counting it as a constraint is how the certificate survived.
 */
function postedLimitKmh(spec: ScenarioSpec): number {
  const params = spec.map.params as Record<string, unknown>;
  const speeds = Object.entries(params)
    .filter(([k]) => /maxspeedkmh|maxkmh/i.test(k))
    .map(([, v]) => v)
    .filter((v): v is number => typeof v === "number");
  // No posted number in the recipe = no bar to clear; treat any cap as a demand
  // rather than invent one.
  return speeds.length > 0 ? Math.max(...speeds) : Number.POSITIVE_INFINITY;
}

/** Does anything in these params reach the evaluator as a checkable demand? */
function provable(params: ObjectiveParams, limitKmh: number): boolean {
  if (params.kind !== "reachZone") return false;
  return params.maxSpeedKmh !== undefined && params.maxSpeedKmh < limitKmh;
}

describe("vru: a reachZone title may only claim what a param proves", () => {
  it("no authored success row certifies another road user's conduct", () => {
    const offenders: string[] = [];
    for (const spec of FAMILY) {
      const limit = postedLimitKmh(spec);
      for (const o of spec.success) {
        if (o.params.kind !== "reachZone") continue;
        const claim = dutyClaimIn(o.titleBg);
        if (!claim || provable(o.params, limit)) continue;
        offenders.push(
          `${spec.id}/${o.id} — «${o.titleBg}» promises ${claim.claimBg}, ` +
            `params ${JSON.stringify(o.params)} on a road posted ${limit} км/ч prove nothing of the sort`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it("and the constraint still reaches the evaluator on every authored rung", () => {
    const offenders: string[] = [];
    for (const spec of FAMILY) {
      const limit = postedLimitKmh(spec);
      for (const rung of spec.levels) {
        for (const obj of compileScenario(spec, rung.level).objectives) {
          const params = parseObjectiveParams(obj);
          if (params.kind !== "reachZone") continue;
          const claim = dutyClaimIn(obj.titleBg);
          if (!claim || provable(params, limit)) continue;
          offenders.push(
            `${spec.id} L${rung.level} ${obj.id} — «${obj.titleBg}» promises ` +
              `${claim.claimBg}, compiled params ${JSON.stringify(params)} do not`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the honest capped rows are NOT collateral — the guard still accepts them", () => {
    // «с готовност да пропуснеш» on a disc capped at 35 км/ч (road 50) and
    // «бавно и с готовност за спиране» capped at 25 (road 40) are the two rows
    // this family gets right: the cap IS the demand and it bites. If the guard
    // above ever starts refusing these it has stopped measuring truth and
    // started banning words.
    const hook = FAMILY.find((s) => s.id === "sc-vu-cyclist-hook")!;
    const approach = hook.success.find((o) => o.id === "sc-vu-approach")!;
    expect(dutyClaimIn(approach.titleBg)).toBeDefined();
    expect(provable(approach.params, postedLimitKmh(hook))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. The proof of WHY: the gates ARE blind, in the templates' own recordings
// ---------------------------------------------------------------------------

/** The rows whose old title certified a duty their own ❌ demo failed. */
const DUTY_BLIND: ReadonlyArray<{
  specId: string;
  objectiveId: string;
  mistakeTrace: string;
  codeRef: string;
  wasBg: string;
}> = [
  {
    specId: "sc-vu-pass-clearance",
    objectiveId: "sc-vup-pass",
    mistakeTrace: "mistake-squeeze.trace.json",
    codeRef: "VULNERABLE_PASS_TOO_CLOSE",
    wasBg: "Изпревари велосипедиста с широка дъга",
  },
  {
    specId: "sc-vu-cyclist-hook",
    objectiveId: "sc-vu-turned",
    mistakeTrace: "mistake-forced-brake.trace.json",
    codeRef: "FAILED_TO_YIELD",
    wasBg: "Завий надясно, след като велосипедистът е преминал",
  },
];

function readTrace(specId: string, basename: string): ScenarioTrace {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, "content", "traces", specId, basename), "utf8"),
  ) as ScenarioTrace;
}

/** Replay a recorded drive through the SHIPPED evaluator, exactly as a session
 *  would: fresh eval state, one tick per sample, monotonic latches. */
function replay(params: ObjectiveParams, trace: ScenarioTrace): boolean {
  let state = createEvalState(params);
  let done = false;
  for (const s of trace.samples) {
    const r = stepObjective(
      params,
      state,
      makeTick({
        t: s.tSec,
        speedKmh: s.speedKmh,
        position: { x: s.x, y: s.y },
        headingDeg: s.headingDeg,
        gear: s.gear,
        indicator: s.indicator,
      }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  return done;
}

describe("vru: the gates cannot see the road user (which is why the titles changed)", () => {
  for (const row of DUTY_BLIND) {
    const spec = FAMILY.find((s) => s.id === row.specId)!;

    it(`${row.objectiveId}: the recorded drive that FAILED the duty still completes it`, () => {
      const objective = spec.success.find((o) => o.id === row.objectiveId)!;
      expect(objective.params.kind).toBe("reachZone");

      // The template still calls this drive a failure of the very duty the old
      // title certified — that is where the duty is graded now, and it has to
      // stay there for the retitle to be honesty rather than a quiet amnesty.
      const demo = spec.mistakes.find((m) => m.traceRef.path.endsWith(row.mistakeTrace))!;
      expect(demo, `${row.specId} lost its ${row.mistakeTrace} demo`).toBeDefined();
      expect(demo.codeRefs).toContain(row.codeRef);

      // …and the gate ticks for it all the same. Nothing on a SimTick could
      // have told it otherwise.
      expect(replay(objective.params, readTrace(row.specId, row.mistakeTrace))).toBe(true);

      // Which is the whole argument for the new sentence: it may not be the old
      // one, and it may not smuggle the same claim back in other words.
      expect(objective.titleBg).not.toBe(row.wasBg);
      expect(dutyClaimIn(objective.titleBg)).toBeUndefined();
    });
  }
});

// ---------------------------------------------------------------------------
// 3. sc-vu-emergency — the чл. 91 commendation, both directions
// ---------------------------------------------------------------------------

/** ln-v1 lane centres (meta.scenario; the same pins the template carries). */
const EM_RIGHT_X = 12.19;

/**
 * WHY THIS SECTION DOES NOT USE THE TRACE RECORDER, AND THE ATTEMPT THAT PROVED
 * IT HAD TO NOT.
 *
 * The whole defect is a comparison between two accelerations — the ambulance's
 * `accelMps2` and the STUDENT'S CAR'S. The recorder ramps every scripted ghost
 * at a fixed `SCRIPT_ACCEL = 2.2 m/s²`, which is exactly the number the shipped
 * spec used, so a recorder-driven ghost and the shipped ambulance ramp in
 * lockstep, `closing` never fires during the launch, and the fault cannot
 * reproduce. Written that way first: the test passed on the BROKEN value, i.e.
 * it guarded nothing, which is the one outcome a regression test may not have.
 *
 * The live hero car is SLOWER than the recorder's bot — 17 км/ч at t = 1 s and
 * 52 км/ч at t = 6 s on the deployed build, read off the sweep's own speed
 * probe = 1.94 m/s². So the player here is integrated at 1.95 m/s² and fed
 * frame-by-frame through the production stack (runtime → traffic → sample →
 * director → rules, the LessonScene order, via the orchestrator battery's own
 * `stepFrame`). That is the only rig in this repository that can express a car
 * slower than 2.2 m/s².
 */
const PLAYER_ACCEL_MPS2 = 1.95;
const PLAYER_DECEL_MPS2 = 4.0;

/** ln-v1 wired exactly as `orchestrator/__tests__/helpers.ts:makeStack` wires
 *  district-v1 — same seven query hookups, same director options, ambient
 *  traffic zeroed so the ambulance is the only other road user. */
function makeLnStack(events: StagedEventSpec[]): Stack {
  const raw = loadDistrict("ln-v1") as TrafficDistrict;
  const runtime = createWorldRuntime(raw);
  const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r) =>
    traffic.conflictFromRight(jx, jy, px, py, h, r),
  );
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
    traffic.circulatingConflict(cx, cy, px, py, h, r),
  );
  return {
    runtime,
    traffic,
    director: createScenarioDirector(events, traffic, { seed: 7, signals: runtime }),
    rules: createRuleEngine(),
    ruleEvents: [],
    ticks: [],
    outcomes: [],
    t: 0,
  };
}

/**
 * Drive the boulevard northbound in the RIGHT lane at the live car's ramp.
 *
 * `mode: "ignore"` is the drive the sweep actually made — hold the throttle,
 * stay in the lane you were spawned in, never brake, never look. It rides the
 * RIGHT lane, which is what makes it the hard case: the two mistake demos this
 * template ships sit IN the ambulance's left-lane corridor and convict on the
 * corridor story, while this car is not in anybody's way and still does nothing
 * at all. Under the shipped `accelMps2: 2.2` it came back COMMENDED.
 *
 * `mode: "makeWay"` is the same line driven by a student who does the чл. 91
 * thing once the boulevard is under him: eases to the yield pace and holds the
 * right edge (`yieldSlowKmh` 38 and `yieldShiftM` 0.8 — this does both).
 */
function driveEmergency(mode: "ignore" | "makeWay"): {
  ruleEvents: Stack["ruleEvents"];
} {
  const stack = makeLnStack([...(SC_VU_EMERGENCY.staged ?? [])] as StagedEventSpec[]);
  let y = 15;
  let v = 0;
  for (let i = 0; i < 40 * 30 && y < 358; i++) {
    const targetMps = mode === "ignore" ? 16.4 : y > 80 ? 8.3 : 13.3;
    if (v < targetMps) v = Math.min(targetMps, v + PLAYER_ACCEL_MPS2 * DT);
    else v = Math.max(targetMps, v - PLAYER_DECEL_MPS2 * DT);
    y += v * DT;
    const x = mode === "makeWay" && y > 80 ? EM_RIGHT_X + 1.0 : EM_RIGHT_X;
    stepFrame(
      stack,
      { x, y, headingDeg: 0, speedKmh: v * 3.6, brakePedal: v < targetMps ? 0 : 0.3 },
      { indicator: mode === "makeWay" && y > 70 ? "right" : "off", mirrorGlance: null },
    );
  }
  return { ruleEvents: stack.ruleEvents };
}

const codesOf = (r: Stack["ruleEvents"], kind: "violation" | "commendation") =>
  r.filter((e) => e.kind === kind).map((e) => e.code);

describe("sc-vu-emergency: the make-way commendation has to be earned", () => {
  it("the flat-out right-lane drive is NOT commended for making way, and IS convicted", () => {
    const { ruleEvents } = driveEmergency("ignore");
    // THE HALF THAT WAS RED BEFORE. With the EV's ramp at 2.2 m/s² — above this
    // car's 1.95 — the ambulance out-accelerated the launching player, the duty
    // armed while he was still under 38 км/ч on his way up from zero,
    // `slowedKeepingRight` latched on that one frame and never un-latched, and
    // this exact drive finished with «Правилно отстъпено предимство».
    expect(codesOf(ruleEvents, "commendation")).not.toContain("YIELDED_TO_PRIORITY");
    // …and the fault the lesson exists to teach does fire.
    expect(codesOf(ruleEvents, "violation")).toContain("EMERGENCY_NOT_YIELDED");
  });

  it("the drive that slows and holds the right edge IS commended, and never convicted", () => {
    // THE OTHER DIRECTION, and the reason the fix is a ramp rather than a
    // deleted latch: a student who does the чл. 91 thing must still be paid for
    // it. If this goes red the fix above has turned a false pass into a false
    // refusal, which teaches the wrong thing exactly as hard.
    const { ruleEvents } = driveEmergency("makeWay");
    expect(codesOf(ruleEvents, "commendation")).toContain("YIELDED_TO_PRIORITY");
    expect(codesOf(ruleEvents, "violation")).not.toContain("EMERGENCY_NOT_YIELDED");
  });
});

// ---------------------------------------------------------------------------
// 4. sc-vu-pass-clearance — the lesson has a gradient again, both directions
// ---------------------------------------------------------------------------

/** vu-pass-v1 northbound lane centre, and the taught wide line. */
const VUP_LANE_X = 4.06;
const VUP_WIDE_X = 2.2;

function passScript(x: number): DriveScript {
  return {
    steps: [
      {
        kind: "drive",
        points: [
          [VUP_LANE_X, 15],
          [x, 45],
          [x, 195],
        ],
        targetKmh: 45,
        stopAtEnd: false,
      },
      {
        kind: "drive",
        points: [
          [x, 195],
          [VUP_LANE_X, 215],
          [VUP_LANE_X, 300],
        ],
        targetKmh: 45,
      },
    ],
  };
}

function drivePass(x: number): RecordedDrive {
  return recordScriptedDrive(loadDistrict("vu-pass-v1"), passScript(x), {
    scenarioId: SC_VU_PASS_CLEARANCE.id,
    kind: "mistake",
    seed: 7,
    stagedEvents: [...(SC_VU_PASS_CLEARANCE.staged ?? [])] as StagedEventSpec[],
  });
}

describe("sc-vu-pass-clearance: the un-shifted line is a squeeze, the taught line is not", () => {
  it("a driver who never leaves the lane centre is CONVICTED of the clearance", () => {
    // THE HALF THAT WAS RED BEFORE, and it is worth being exact about HOW it
    // was red, because „nothing happened" was true on staging and not quite
    // true here. With the rider's curb line at x = 6.66 the lane centre gave
    // 2.60 m of centres — 1.35 m of air, fifteen centimetres inside
    // VULNERABLE_PASS_SAFE_LATERAL_M's silent grace band — so the CLEARANCE
    // grader, the one thing this lesson teaches, said nothing about this drive
    // at all. (Measured on the shipped value it came back carrying only
    // FOLLOWING_TOO_CLOSE, a fault about a different lesson; the live 59 км/ч
    // sweep run, too fast for the follow sustain, came back carrying nothing.)
    // Moving the rider to 6.35 puts the do-nothing line at 2.29 m of centres,
    // inside the convict band with 0.16 m to spare.
    const drive = drivePass(VUP_LANE_X);
    expect(violations(drive)).toContain("VULNERABLE_PASS_TOO_CLOSE");
    expect(commendations(drive)).not.toContain("YIELDED_TO_PRIORITY");
  });

  it("the taught wide line is COMMENDED, and billed nothing — not the clearance, not the distance", () => {
    // THE OTHER DIRECTION, and it is the half the FIRST attempt at this fix
    // failed. Moving the rider inward far enough to convict the lane centre
    // also moves him into LEAD_CORRIDOR_M (4.0 m of lateral), and at x = 6.16
    // the CORRECT pass came back billed «Несъобразена дистанция» at t = 13.48 s,
    // two metres behind the rider it was about to overtake — the shadow gate
    // went red and named the code. 6.35 clears the follow corridor by 0.15 m on
    // this line, so the demonstration of the right answer is clean again.
    const drive = drivePass(VUP_WIDE_X);
    expect(commendations(drive)).toContain("YIELDED_TO_PRIORITY");
    expect(violations(drive)).toEqual([]);
  });

  it("the commendation still costs a real shift — it is not handed to the lane centre", () => {
    // The third direction, and the one that stops a later hand from „fixing"
    // the convict band by sliding the rider back out: the un-shifted line must
    // not be able to earn the чл. 42 commendation. Measured ladder at 45 км/ч
    // (violations · commendations), rider at 6.35:
    //   x 4.06 → FOLLOWING + VULNERABLE_PASS · —
    //   x 3.50 → FOLLOWING · YIELDED_TO_PRIORITY
    //   x 2.20 → — · YIELDED_TO_PRIORITY + CLEAN_DRIVING
    expect(commendations(drivePass(3.5))).toContain("YIELDED_TO_PRIORITY");
  });
});
