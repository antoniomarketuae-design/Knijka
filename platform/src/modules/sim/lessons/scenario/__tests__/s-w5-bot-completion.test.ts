/**
 * Wave-5 bot-completion proofs (doc 76 §10; the s-batch2 / s-w1..s-w4 mold) —
 * each NEW template of the wave driven through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization →
 *   gradeFinishWire RECOMPILES from the id and regrades → scoreRubric.
 *
 * One describe block per template; the wave's agents APPEND to this file (add
 * an import + a block, never edit a neighbour's).
 *
 * NOTE for the integration pass: the gradeFinishWire round-trip resolves the
 * lesson id through the templates.ts registry, so each block's wire test goes
 * green only once that template's family file is spread into SCENARIO_TEMPLATES
 * (the main session owns that edit).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recordScAcTruckSprayDrive } from "../../../traces/scAcTruckSpray";
import { recordScJxBlockedExitDrive } from "../../../traces/scJxBlockedExit";
import { recordScMergeFromPropertyDrive } from "../../../traces/scMergeFromProperty";
import { recordScMwMinSpeedDrive } from "../../../traces/scMwMinSpeed";
import { recordScOvSolidReturnDrive } from "../../../traces/scOvSolidReturn";
import { recordScParkBayExitRevDrive } from "../../../traces/scParkBayExitRev";
import { recordScRxBarrierDropDrive } from "../../../traces/scRxBarrierDrop";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_AC_TRUCK_SPRAY } from "../templates-conditions2";
import { SC_JX_BLOCKED_EXIT } from "../templates-junctions4";
import { SC_OV_SOLID_RETURN } from "../templates-lanes2";
import { SC_MERGE_FROM_PROPERTY } from "../templates-merging";
import { SC_PARK_BAY_EXIT_REV } from "../templates-parking2";
import { SC_RX_BARRIER_DROP } from "../templates-rail";
import { SC_MW_MIN_SPEED } from "../templates-speed2";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;
}

// ---------------------------------------------------------------------------
// sc-ac-truck-spray — the drill is won by the GAP: 115 km/h is lawful on this
//                     road and still convicted, because the pelena took the
//                     vision the gap has to buy back
// ---------------------------------------------------------------------------

describe("wave-5 bot completion — sc-ac-truck-spray at L3", () => {
  const lesson = compileScenario(SC_AC_TRUCK_SPRAY, 3);
  let session = createLessonSession(lesson);
  recordScAcTruckSprayDrive(loadDistrict("mw-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: both objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_AC_TRUCK_SPRAY.rubric!).stars).toBe(3);
  });

  it("carries BOTH authored dials into the LIVE lesson — the template's whole spine", () => {
    // followRainAwareEnabled ships OFF (rules/types.ts: the exam bot never widens
    // its rain time-gap, so a default-on grade would flag its innocent rainy
    // drives). WITHOUT this propagation the student's own dry-habit gap would
    // grade NOTHING while the committed trace still shows the fault — the drill
    // would quietly become „drive a motorway in the rain". The recorder passes
    // the same override, so the trace gate and the student path grade identically.
    expect(lesson.ruleConfig?.followRainAwareEnabled).toBe(true);
    // ADR-006 stage 4a: unlike every rain template whose ghost is dry-tuned, this
    // one AUTHORS wet grip — so the student's car really does need ~1.4× the
    // braking distance the pelena is hiding. The ghosts are kinematic and author
    // their ramps at WET_DECEL to match (traces/scAcTruckSpray.ts).
    expect(lesson.physics?.wetGrip).toBe(true);
  });

  it("carries the spray rig into the live lesson (the pelena is staged, not painted)", () => {
    // Drop the rig and the student meets an empty motorway: no lead, no gap, no
    // lesson — and the objective copy's „зад камиона" becomes a claim about
    // nothing. It must survive compilation, wearing the truck profile.
    const rig = (lesson.stagedEvents ?? []).find((s) => s.id === "sc-acts-truck");
    expect(rig).toBeDefined();
    expect(rig!.kind).toBe("cutInLeadCar"); // see the template header: the ONLY
    // staged kind that forwards extraRightOffsetM, which is the only way to put
    // a lead in mw-v1's cruise lane at all.
  });

  it("the drill runs in the taught order: survive the pelena, then finish", () => {
    const gap = result.objectives.find((o) => o.id === "sc-acts-gap")!;
    const finish = result.objectives.find((o) => o.id === "sc-acts-finish")!;
    expect(gap.done).toBe(true);
    expect(finish.done).toBe(true);
    expect(gap.completedAtSec!).toBeLessThan(finish.completedAtSec!);
  });

  it("the LIVE session agrees the prudent drive is innocent — no phantom motorway bill", () => {
    // The recorder's own engine proves this on the trace gate; this proves the
    // STUDENT-facing path agrees. This is where a sloppy tune would surface: 64
    // km/h on a 140 road is 76 under the limit, so the SP-10 crawl detector is
    // watching the whole way (it stays innocent only because 64 ≥ its 50 km/h
    // floor), and laneId 1 must read as the rightmost REQUIRED lane through the
    // emergencyLaneRight seam or a 55 s cruise would bill keep-right twice over.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
    expect(codes).not.toContain("NOT_KEEPING_RIGHT");
    expect(codes).not.toContain("EMERGENCY_LANE_DRIVING");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE_FOR_RAIN");
    expect(codes).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ac-truck-spray@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ac-truck-spray@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the lawful-but-blind 115 TEACHES чл. 23 — and reaches NO gate", () => {
    // The template's sharpest claim, made checkable. FOLLOWING_TOO_CLOSE_FOR_RAIN
    // is a teachable второстепенна fault, so its FIRST encounter PAUSES with a
    // card instead of merely docking a point — which is the entire pedagogy: this
    // student is inside every number on every sign (115 ≤ 140, ≤ the 119 rain
    // envelope) and believes he is driving correctly. Only a card can tell him
    // that 60 metres is a distance in DRY and 1.9 seconds in the wet. The §9
    // exact-code assert lives on the trace gate.
    let s = createLessonSession(compileScenario(SC_AC_TRUCK_SPRAY, 3));
    const taught: string[] = [];
    recordScAcTruckSprayDrive(loadDistrict("mw-v1"), "mistake-dry-gap", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    expect(taught).toContain("FOLLOWING_TOO_CLOSE_FOR_RAIN");
    const r = buildLessonResult(s);
    // …and the drill's own verdict is independent of the card: the gap gate
    // carries maxSpeedKmh 80, so a car doing 115 is simply never there slowly
    // enough — and objectives advance SEQUENTIALLY, so the finish gate never
    // arms either. „Спазвах ограничението" completes NOTHING.
    expect(r.objectives.every((o) => !o.done)).toBe(true);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("counter-proof: the unlit drive TEACHES чл. 70, then GRADES it once — on a sheet that still COMPLETES", () => {
    // The mirror image of the demo above, and the reason both exist: this driver's
    // gap and speed are the shadow's, verbatim. The route was never the problem,
    // the lamp was — so the drill completes and the card IS the lesson
    // (teach-first, not punish; doc 76 §0). If this demo also billed a following
    // code — or the one above also billed the lamp — each card would name two
    // faults and teach neither. That claim is untouched: still exactly one code
    // on both channels.
    //
    // WHAT CHANGED, 2026-08-26, AND WHY THE OLD LINE WAS THE DEFECT ITSELF
    // (`rules/engine.ts STANDING_DUTY_REGRADE_SEC`). This asserted
    // `expect(...violations).toEqual([])` — the unlit drive taught and NEVER
    // charged, however long the lamps stayed off. That is the finding filed
    // against this very lesson: `.audit-frames/sweep161/sc-ac-truck-spray/
    // pc-wrong/08-debrief.png` prints «Какво се получи добре: чисто каране по
    // изпитния лист — нито едно нарушение не влезе в точките» over a drive
    // that ran the whole rain section dark. Teach-first forgives a first
    // MISTAKE; billing a standing duty once meant it forgave the whole drive.
    // The lamp now also books the ONE charge Наредба № 38 prices it at, ten
    // driving seconds after the student was shown the rule — and never a
    // third time (`STANDING_DUTY_MAX_BILLS`).
    let s = createLessonSession(compileScenario(SC_AC_TRUCK_SPRAY, 3));
    const taught: string[] = [];
    recordScAcTruckSprayDrive(loadDistrict("mw-v1"), "mistake-lights-off", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    expect(taught).toEqual(["HEADLIGHTS_OFF_IN_RAIN"]);
    expect(s.events.filter((e) => e.kind === "violation").map((e) => e.code)).toEqual([
      "HEADLIGHTS_OFF_IN_RAIN",
    ]);
    expect(buildLessonResult(s).completedAll).toBe(true);
  });

  it("…and at L4, which is EXAM MODE, the same unlit drive is charged ONCE, not twice", () => {
    // THE SECOND HALF OF THE SAME REPAIR, AND THE HALF THAT COULD HAVE FAILED A
    // CANDIDATE. L4 of this template compiles with `examMode: true` (asserted in
    // the rung test below), and `coach.ts` grades from tick one under examMode —
    // there is no free mini-lesson to absorb the first of the two standing-duty
    // bills. MEASURED on this very trace with the guard disabled: charges at
    // t=3.63 s AND t=13.63 s, i.e. one continuous unlit run billed twice. On the
    // основна codes that is 6 наказателни точки for a breach Наредба № 38 prices
    // at 3, against exam gates of `osnovniPoints > 6` / `totalPoints > 9` — a
    // FALSE FAIL. The reducer marks the re-grade and `lessons/engine.ts` drops it
    // once the code has been charged, so the exam charge is single and lands at
    // the FIRST bill (3.63 s), where an examiner would have written it.
    const l4 = compileScenario(SC_AC_TRUCK_SPRAY, 4);
    expect(l4.examMode).toBe(true);
    let s = createLessonSession(l4);
    const taught: string[] = [];
    recordScAcTruckSprayDrive(loadDistrict("mw-v1"), "mistake-lights-off", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    expect(taught).toEqual([]); // no teach pass on an exam
    expect(s.events.filter((e) => e.kind === "violation").map((e) => e.code)).toEqual([
      "HEADLIGHTS_OFF_IN_RAIN",
    ]);
  });

  it("compiles at every authored rung; L5 drops the night ON the rain without re-tuning", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_AC_TRUCK_SPRAY, level).id).toBe(`sc-ac-truck-spray@L${level}`);
    }
    expect(compileScenario(SC_AC_TRUCK_SPRAY, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_AC_TRUCK_SPRAY, 4).examMode).toBe(true);
    const l5 = compileScenario(SC_AC_TRUCK_SPRAY, 5);
    // The rung spreads OVER the template's conditions, so the rain survives and
    // the night joins it. The shipped night factor is 1 and the engine composes
    // conditions by MIN, so the envelope stays 0.85 × 140 = 119: the rung adds
    // visibility pressure and re-tunes NOTHING (the sc-ac-night-overdrive ruling).
    expect(l5.environment?.rain).toBe(true);
    expect(l5.environment?.timeOfDay).toBe("night");
    // Both dials must survive EVERY rung — they are the grading spine, not an
    // L5 complication.
    for (const level of [1, 3, 5] as const) {
      const l = compileScenario(SC_AC_TRUCK_SPRAY, level);
      expect(l.ruleConfig?.followRainAwareEnabled, `L${level}`).toBe(true);
      expect(l.physics?.wetGrip, `L${level}`).toBe(true);
      expect(l.stagedEvents?.map((e) => e.kind), `L${level}`).toEqual(["cutInLeadCar"]);
    }
  });
});

// ---------------------------------------------------------------------------
// sc-jx-blocked-exit — the drill is won by REFUSING a green: the exit, not the
//                      lamp, decides whether you may enter (JU-16)
// ---------------------------------------------------------------------------

describe("wave-5 bot completion — sc-jx-blocked-exit at L3", () => {
  const lesson = compileScenario(SC_JX_BLOCKED_EXIT, 3);
  let session = createLessonSession(lesson);
  recordScJxBlockedExitDrive(loadDistrict("sx-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: every objective done, zero violations, passed, 3★", () => {
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_JX_BLOCKED_EXIT.rubric!).stars).toBe(3);
  });

  it("the LIVE session honours the drill's ruleConfig — the wait at green is not billed", () => {
    // The template's whole innocence rides on compileScenario propagating
    // ruleConfig to the LessonSpec: without it the live student session grades
    // with the 12 m default, and a student who correctly refuses a blocked
    // green gets billed HESITATION_AT_GREEN for it. Prove the wiring, not just
    // the recorder's copy of it.
    // T12 (doc 86 §2) moved the staged column from y = 16 (parked inside the
    // 54.25 m junction square) to y = 31 (clear of the far paint), so the gap
    // the flag must cover went 41.4 → 56.4 m and the flag went 48 → 63.
    expect(lesson.ruleConfig).toMatchObject({ hesitationClearGapM: 63 });
    expect(
      session.events.some((e) => e.kind === "violation" && e.code === "HESITATION_AT_GREEN"),
    ).toBe(false);
  });

  it("the objectives encode the lesson: held short of the line, entered only after the queue moved", () => {
    const hold = result.objectives.find((o) => o.id === "sc-jxb-hold")!;
    const cross = result.objectives.find((o) => o.id === "sc-jxb-cross")!;
    const exit = result.objectives.find((o) => o.id === "sc-jxb-exit")!;
    expect([hold.done, cross.done, exit.done]).toEqual([true, true, true]);
    // The order IS the teaching: the near-stop hold before the line completes
    // first, and the zone 12 m past the column's rest pose is unreachable until
    // the queue actually rolls away — so „чакай" is graded before „премини".
    expect(hold.completedAtSec!).toBeLessThan(cross.completedAtSec!);
    expect(cross.completedAtSec!).toBeLessThan(exit.completedAtSec!);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-jx-blocked-exit@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-jx-blocked-exit@L3"));
    expect(graded.result.passed).toBe(true);
  });

  it("counter-proof: following the column into the full box TEACHES STANDSTILL_GAP_TOO_CLOSE and never reaches the exit gate", () => {
    let s = createLessonSession(compileScenario(SC_JX_BLOCKED_EXIT, 3));
    const taught: string[] = [];
    recordScJxBlockedExitDrive(loadDistrict("sx-v1"), "mistake-enter-full-box", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // STANDSTILL_GAP_TOO_CLOSE is a teachable второстепенна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card), not on
    // session.events — the student is taught the rule, not merely docked (the
    // sc-rx-queue-clear precedent). The §9 exact-code assert lives on the trace
    // gate, where the recorder's own engine grades every encounter:
    // traces/__tests__/sc-jx-blocked-exit-traces.
    expect(taught).toEqual(["STANDSTILL_GAP_TOO_CLOSE"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    // It entered on a LAWFUL green — no signal code anywhere. That contrast IS
    // the lesson: the lamp said yes and the driver was still wrong.
    expect(taught).not.toContain("RED_LIGHT_CROSSED");
    // …and the drill cannot be passed by following the column in: the car
    // parked itself inside the box and never reached the gate past the tail.
    expect(r.objectives.find((o) => o.id === "sc-jxb-hold")!.done).toBe(false);
    expect(r.objectives.find((o) => o.id === "sc-jxb-cross")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("counter-proof: going with the column on the new red grades RED_LIGHT_CROSSED, not passed", () => {
    let s = createLessonSession(compileScenario(SC_JX_BLOCKED_EXIT, 3));
    recordScJxBlockedExitDrive(loadDistrict("sx-v1"), "mistake-impatient-red", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("RED_LIGHT_CROSSED");
    expect(codes).not.toContain("STANDSTILL_GAP_TOO_CLOSE");
    expect(r.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sc-mw-min-speed — the family's FLOOR rung: every other SP template grades the
//                   ceiling; this one proves that on a motorway the too-slow
//                   car is a fault too — and that crawling in the LEFT lane
//                   bills twice
// ---------------------------------------------------------------------------

describe("wave-5 bot completion — sc-mw-min-speed at L3", () => {
  const lesson = compileScenario(SC_MW_MIN_SPEED, 3);
  let session = createLessonSession(lesson);
  recordScMwMinSpeedDrive(loadDistrict("mw-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: all three objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_MW_MIN_SPEED.rubric!).stars).toBe(3);
  });

  it("grades on SHIPPED data alone — no ruleConfig, no physics (the template's honesty claim)", () => {
    // Both detectors are default-ON and armed by data mw-v1 already carries
    // (the edge `motorway` tag + the emergencyLane zone span). If a future
    // change made either config-gated, this drill would silently stop grading
    // the student while its trace gate kept passing — the exact split the
    // ruleConfig propagation exists to prevent. Asserting their ABSENCE pins
    // that the student's own attempt is graded by the same shipped rules.
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("carries the flow car into the live lesson (the pressure is staged, not narrated)", () => {
    // Drop it and the student meets an empty motorway: the cards' „колата зад
    // теб" becomes a claim about nothing, and the drill loses the one thing
    // that makes чл. 22, ал. 1's harm visible rather than asserted.
    const flow = (lesson.stagedEvents ?? []).find((s) => s.id === "sc-mwms-flow-car");
    expect(flow).toBeDefined();
    expect(flow!.kind).toBe("rearTailgater");
  });

  it("the drill runs in the taught order: join the rhythm, hold it, finish", () => {
    const join = result.objectives.find((o) => o.id === "sc-mwms-join")!;
    const hold = result.objectives.find((o) => o.id === "sc-mwms-hold")!;
    const finish = result.objectives.find((o) => o.id === "sc-mwms-finish")!;
    expect(join.done).toBe(true);
    expect(hold.done).toBe(true);
    expect(finish.done).toBe(true);
    expect(join.completedAtSec!).toBeLessThan(hold.completedAtSec!);
    expect(hold.completedAtSec!).toBeLessThan(finish.completedAtSec!);
  });

  it("the LIVE session agrees the flow-speed drive is innocent — no phantom motorway bill", () => {
    // The recorder's own engine proves this on the trace gate; this proves the
    // STUDENT-facing path agrees. 110 on a 140 road is watched from both sides
    // at once: the SP-10 crawl floor sits 60 km/h below and the speeding
    // ceiling 30 above, and a 44 s cruise must read laneId 1 as the rightmost
    // REQUIRED lane through the emergencyLaneRight seam or keep-right would
    // bill three times over.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
    expect(codes).not.toContain("NOT_KEEPING_RIGHT");
    expect(codes).not.toContain("EMERGENCY_LANE_DRIVING");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-mw-min-speed@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-mw-min-speed@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: at L3 the right-lane crawl TEACHES чл. 22, ал. 1 — and never finishes the road", () => {
    // DRIVING_TOO_SLOW_FOR_MOTORWAY is второстепенна, and the coach warns once
    // before grading regardless of mapping (scenarios/coach.ts) — so the FIRST
    // encounter PAUSES with a card and does NOT dock a point. That is the right
    // pedagogy for this fault in particular: „твърде бавно" is the one mistake a
    // learner makes while believing he is being SAFE. A point would just confuse
    // him; the card tells him why slow is not the same as safe. The §9 exact-code
    // assert lives on the trace gate.
    let s = createLessonSession(compileScenario(SC_MW_MIN_SPEED, 3));
    const taught: string[] = [];
    recordScMwMinSpeedDrive(loadDistrict("mw-v1"), "mistake-crawl-right", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toEqual(["DRIVING_TOO_SLOW_FOR_MOTORWAY"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(r.score).toBe(0); // taught, not punished
    // The lane was RIGHT, so the crawler DOES clear the first gate — and then
    // simply never gets to the end of the kilometre. That asymmetry is the
    // template's grading claim: this driver is not lost, he is too slow.
    expect(r.objectives.find((o) => o.id === "sc-mwms-join")!.done).toBe(true);
    expect(r.objectives.find((o) => o.id === "sc-mwms-finish")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("counter-proof: at L3 the LEFT-lane crawl adds the keep-right card and clears NOTHING", () => {
    // Same speed, one lane over — and the student-facing channels split, which
    // is worth pinning because it is NOT obvious: the crawl card pauses at
    // t = 9.03, and keep-right lands at t = 12.62, INSIDE the engine's
    // TEACH_PAUSE_MIN_GAP_S (15 s) window. So the second fault deliberately
    // does NOT chain a second modal — it downgrades to the classic lesson toast
    // (engine.ts). Two pauses 3.6 s apart would be the wrong teaching act; the
    // learner is still reading the first card.
    let s = createLessonSession(compileScenario(SC_MW_MIN_SPEED, 3));
    const taught: string[] = [];
    const lessonToasts: string[] = [];
    recordScMwMinSpeedDrive(loadDistrict("mw-v1"), "mistake-crawl-left", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
        for (const h of step.hudEvents ?? []) if (h.kind === "lesson") lessonToasts.push(h.titleBg);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toEqual(["DRIVING_TOO_SLOW_FOR_MOTORWAY"]);
    expect(lessonToasts).toEqual(["Движение в лявата лента без причина"]);
    // …and unlike the right-lane crawler, this one does not even clear the join
    // gate: radius 6 pins the cruise lane, so the wrong lane fails it outright.
    expect(r.objectives.every((o) => !o.done)).toBe(true);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("counter-proof: at L4 the compound bill is REAL — the left-lane crawl costs DOUBLE", () => {
    // The template's central claim, stated where it is actually enforceable.
    // L3 teaches (both faults are второстепенна, so the coach warns first), which
    // means the training rung can never show the student what the second fault
    // COSTS. The exam rung can: A13 exam mode grades unconditionally at official
    // base points (scenarios/coach.ts), so the identical crawl bills 1 point in
    // the right lane and 2 in the left. Same speed, same map, same duration —
    // the lane alone doubles the price. If a future change let one detector
    // swallow the other, this is the assertion that would catch it.
    const run = (name: "mistake-crawl-right" | "mistake-crawl-left") => {
      let s = createLessonSession(compileScenario(SC_MW_MIN_SPEED, 4));
      recordScMwMinSpeedDrive(loadDistrict("mw-v1"), name, {
        onTick: (tick) => {
          s = applyTick(s, tick).state;
        },
      });
      return {
        codes: s.events.filter((e) => e.kind === "violation").map((e) => e.code),
        score: buildLessonResult(s).score,
      };
    };
    const right = run("mistake-crawl-right");
    const left = run("mistake-crawl-left");
    expect(right.codes).toEqual(["DRIVING_TOO_SLOW_FOR_MOTORWAY"]);
    expect(right.score).toBe(1);
    expect(left.codes).toEqual(["DRIVING_TOO_SLOW_FOR_MOTORWAY", "NOT_KEEPING_RIGHT"]);
    expect(left.score).toBe(2);
  });

  it("compiles at every authored rung; L4 is the exam rung and the staged car survives all of them", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_MW_MIN_SPEED, level).id).toBe(`sc-mw-min-speed@L${level}`);
    }
    expect(compileScenario(SC_MW_MIN_SPEED, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_MW_MIN_SPEED, 4).examMode).toBe(true);
    // The flow car is the drill's spine, not an L5 complication — every rung
    // gets it, or the lower rungs would teach a motorway with nobody on it.
    for (const level of [1, 2, 3, 4] as const) {
      const l = compileScenario(SC_MW_MIN_SPEED, level);
      expect(l.stagedEvents?.map((e) => e.kind), `L${level}`).toEqual(["rearTailgater"]);
    }
  });
});

// ---------------------------------------------------------------------------
// sc-ov-solid-return — the marking as a CLOCK: the drill is decided 200 m before
//                      the fault, and both mistakes are the same mistake
// ---------------------------------------------------------------------------

describe("wave-5 bot completion — sc-ov-solid-return at L3", () => {
  const lesson = compileScenario(SC_OV_SOLID_RETURN, 3);
  let session = createLessonSession(lesson);
  recordScOvSolidReturnDrive(loadDistrict("ov-solid2-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: all three objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_OV_SOLID_RETURN.rubric!).stars).toBe(3);
  });

  it("carries BOTH staged actors into the live lesson — the crawler and the clock", () => {
    // Drop the crawler and there is nothing to overtake, so the window stops
    // meaning anything; drop the stream and the driver gets the WHOLE 285 m to
    // dawdle in, which is exactly the pressure this template exists to create.
    expect((lesson.stagedEvents ?? []).map((s) => [s.id, s.kind])).toEqual([
      ["sc-ovsr-lead", "brakingLeadCar"],
      ["sc-ovsr-stream", "oncomingStream"],
    ]);
    // No ruleConfig and no physics by design: the М1 span is authored district
    // data, so the shipped CROSSED_SOLID_LINE / overtake-return detectors grade
    // it as-is. A lesson that quietly grew a dial would fail here.
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the drill is won in the taught ORDER: out early, home before the wall, then through it", () => {
    // The sequence IS the lesson, and it is not decoration. sc-ovsr-pass sits at
    // y = 180 (post-B8: centred between the lanes, radius 6, satisfiable from
    // either): it grades REACHING the last mark from which the whole maneuver
    // still fits — the decision point, not the excursion.
    // sc-ovsr-home sits on the own-lane center at the map's own returnByY = 270
    // (radius 4 < the 8.125 m lane pitch): it grades being HOME, 30 m of dashes
    // before the М1 span. A drive that reached „home" before „pass" would be a
    // driver who never overtook at all.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    for (const id of ["sc-ovsr-pass", "sc-ovsr-home", "sc-ovsr-finish"]) {
      expect(at(id).done, id).toBe(true);
    }
    expect(at("sc-ovsr-pass").completedAtSec!).toBeLessThan(at("sc-ovsr-home").completedAtSec!);
    expect(at("sc-ovsr-home").completedAtSec!).toBeLessThan(at("sc-ovsr-finish").completedAtSec!);
  });

  it("the LIVE session agrees the lawful pass is lawful — no phantom marking or чл. 42 bill", () => {
    // The recorder's own engine proves this on the trace gate; this proves the
    // STUDENT-facing path agrees. A 75 m ride of the oncoming bank at 80 km/h on
    // a 1+1, ending 50 m before an М1 span, must not read as crossing the solid
    // line, as cutting the crawler off, or as wandering.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("CROSSED_SOLID_LINE");
    expect(codes).not.toContain("OVERTAKE_RETURN_TOO_EARLY");
    expect(codes).not.toContain("OVERTAKE_INSUFFICIENT_GAP");
    expect(codes).not.toContain("CENTER_LINE_TOUCHED");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ov-solid-return@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ov-solid-return@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the solid return TEACHES основна — and still reaches NO gate", () => {
    // RE-BASELINED 2026-08-09 with the Наредба № 38 grounding pass, and the
    // re-baseline is the finding, so it is written out rather than trimmed.
    //
    // This assert used to read „SCORED 10 (опасна, never a modal)". The 10 had
    // no basis: приложение № 5, т. 10, б. „в" is a CLOSED list of six cases,
    // and full occupancy of the opposing bank on a TWO-WAY road is none of
    // them — case 2 names „път с еднопосочно движение" and this detector
    // requires `oneway === false`, while case 5 („предпоставка за допускане на
    // ПТП") asks for a danger the detector never queries. CROSSED_SOLID_LINE is
    // now основна (3), so it joins the A12 ladder every other основна is on:
    // first encounter TEACHES with a card, the repeat grades. Exactly the shape
    // the sibling counter-proof below already documents for чл. 42.
    //
    // WHAT DID NOT CHANGE, and it is the half that matters here: the rule
    // engine still convicts on the identical frame, and the drive still fails —
    // on the OBJECTIVES, which were always the honest half of this demo.
    let s = createLessonSession(compileScenario(SC_OV_SOLID_RETURN, 3));
    const taught: string[] = [];
    recordScOvSolidReturnDrive(loadDistrict("ov-solid2-v1"), "mistake-return-on-solid", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // Taught, not docked — the first-encounter half of the основна ladder. Note
    // what that costs, recorded because it is easy to miss: a TAUGHT violation
    // never reaches `session.events`, so it is absent from the result sheet and
    // from `summary.conceptIds` too. That is the shipped A12 design for every
    // основна (the card teaches instead of the sheet), not something this
    // downgrade invented — but this code now lives under it.
    expect(taught).toEqual(["CROSSED_SOLID_LINE"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(r.score).toBe(0);
    // …and the objectives say the same thing the code does, independently: he
    // is never fully home in his own lane before the М1 span, so sc-ovsr-home
    // never arms and — objectives being SEQUENTIAL — neither does the finish.
    // „Щях да успея" is measurably false.
    //
    // RE-BASELINED for ledger B8 (doc 86 §3). This used to assert that NOTHING
    // completed, which was true only because sc-ovsr-pass was authored radius 5
    // on the oncoming bank alone — the same lane exclusivity that made a
    // NON-overtaking (always lawful) drive score `completedAll: false` and lock
    // the next rung. The gate is now lane-agnostic ("you reached the last mark
    // from which a whole pass still fits"), so this driver legitimately ticks it
    // and then fails the drill's real gate. The verdict is unchanged where it
    // matters and is asserted right here: home false, completedAll false,
    // passed false.
    expect(r.objectives.find((o) => o.id === "sc-ovsr-home")!.done).toBe(false);
    expect(r.objectives.find((o) => o.id === "sc-ovsr-finish")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    // The drill is still LOST, and now it is lost on the gate rather than on a
    // charge the act does not authorise. This assertion is the one that keeps
    // the downgrade honest: dropping 10 points did NOT hand him the lesson.
    expect(r.passed).toBe(false);
  });

  it("counter-proof: the late cut TEACHES чл. 42 on the A9 channel — and fails the SAME gate", () => {
    // The pair's whole point, made checkable on the student path. This driver
    // committed the IDENTICAL mistake as the demo above — 78 m of dawdling — and
    // his sheet looks completely different: OVERTAKE_RETURN_TOO_EARLY is a
    // teachable основна fault, so his first encounter PAUSES with a card instead
    // of docking points, and his отсечка is clean at zero. That asymmetry is the
    // teaching: the same cause, two prices, and only one of them stings. The
    // objectives are what tie the two back together — both drives miss the very
    // same commitment gate, 200 m before either fault happened.
    let s = createLessonSession(compileScenario(SC_OV_SOLID_RETURN, 3));
    const taught: string[] = [];
    recordScOvSolidReturnDrive(loadDistrict("ov-solid2-v1"), "mistake-late-cut", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toEqual(["OVERTAKE_RETURN_TOO_EARLY"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(r.score).toBe(0);
    // RE-BASELINED for ledger B8, exactly as one block up: the commitment gate
    // is no longer lane-exclusive, so both late drives tick it and both still
    // miss the gate the drill is actually about.
    expect(r.objectives.find((o) => o.id === "sc-ovsr-home")!.done).toBe(false);
    expect(r.objectives.find((o) => o.id === "sc-ovsr-finish")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
  });

  it("compiles at every authored rung; L4 is the exam cold start", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_OV_SOLID_RETURN, level).id).toBe(`sc-ov-solid-return@L${level}`);
    }
    expect(compileScenario(SC_OV_SOLID_RETURN, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_OV_SOLID_RETURN, 4).examMode).toBe(true);
    // No L5 by design (the backlog's own rung list): this drill's difficulty
    // axis is the CLOCK, and rain would only add a grip story the dry-tuned
    // ghost cannot honour (ADR-006 stage 4a).
    expect(SC_OV_SOLID_RETURN.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
    // The crawler and the clock ride every rung — without them there is no drill.
    for (const level of [1, 3, 4] as const) {
      expect(
        compileScenario(SC_OV_SOLID_RETURN, level).stagedEvents?.map((e) => e.kind),
        `L${level}`,
      ).toEqual(["brakingLeadCar", "oncomingStream"]);
    }
  });
});

// ---------------------------------------------------------------------------
// sc-park-bay-exit-rev — the P0's other half: the drill has no bay to land in,
//                        so the graded contract is a CORRIDOR, and the rubric
//                        has to be honest about what it cannot measure
// ---------------------------------------------------------------------------

describe("wave-5 bot completion — sc-park-bay-exit-rev at L3", () => {
  const lesson = compileScenario(SC_PARK_BAY_EXIT_REV, 3);
  let session = createLessonSession(lesson);
  recordScParkBayExitRevDrive(loadDistrict("lot-perp-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: both gates done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_PARK_BAY_EXIT_REV.rubric!).stars).toBe(3);
  });

  it("starts INSIDE the bay, not at a spawn point — the pose seam is the drill", () => {
    // Every other lot template spawns on the approach and drives in. This one's
    // premise is that the car is already boxed: swap the pose for a spawn and
    // there is no maneuver left to teach.
    expect(lesson.spawn).toEqual({ position: { x: 5.03, y: 0 }, headingDeg: 90 });
    // Nose-in (90°) is the load-bearing half: the P0's shadow rests here at
    // 270°, nose-OUT, and drives away forward. Same rect, opposite lesson.
    expect(lesson.world?.districtId).toBe("lot-perp-v1");
  });

  it("grades a CORRIDOR, not a bay: no parkInBay, no painted rect", () => {
    // The compiler writes LessonSpec.parkingBay from the first parkInBay
    // objective (the L7 single-truth rule). This drill authors none — the bay is
    // where the car STARTS — so the field must stay absent; a painted target
    // rect here would tell the student to aim at the place he is leaving.
    expect(lesson.parkingBay).toBeUndefined();
    expect(lesson.objectives.map((o) => o.kind)).toEqual(["reachZone", "reachZone"]);
    expect(lesson.collisionMinKmh).toBe(0); // a 2 km/h bay touch IS the mistake
  });

  it("the rubric refuses to score what it cannot measure (placement/economy)", () => {
    // Both components read the parkInBay ObjectiveDetail; with no such objective
    // they would report measured:false forever. Authoring them anyway would put
    // two permanent „няма измерване" lines on the end screen and drag the star
    // fold onto a channel that structurally cannot fill. The star therefore
    // falls back to official cleanliness — which is exactly what a corridor
    // drill measures: did you get out without billing anything.
    expect(SC_PARK_BAY_EXIT_REV.rubric!.placement).toBeUndefined();
    expect(SC_PARK_BAY_EXIT_REV.rubric!.economy).toBeUndefined();
    const rubric = scoreRubric(result, SC_PARK_BAY_EXIT_REV.rubric!);
    expect(rubric.breakdownBg.map((l) => l.id)).toEqual(["observation", "parTime"]);
    // Observation stays honest too: the glance channel is not wired into the
    // headless result, so it reports "not measured" rather than a silent 0.
    expect(rubric.breakdownBg.find((l) => l.id === "observation")!.measured).toBe(false);
    expect(rubric.stars).toBe(3);
  });

  it("the drill runs in the taught order: out of the bay, THEN away up the aisle", () => {
    const out = result.objectives.find((o) => o.id === "sc-pbe-out")!;
    const away = result.objectives.find((o) => o.id === "sc-pbe-away")!;
    expect(out.done).toBe(true);
    expect(away.done).toBe(true);
    expect(out.completedAtSec!).toBeLessThan(away.completedAtSec!);
  });

  it("carries the staged walker into the live lesson, armed above the reverse", () => {
    // Drop her and the drill ends at „reverse out of a box" — the aisle is
    // empty and the „пропусни всеки пешеходец" instruction is about nobody.
    const walker = (lesson.stagedEvents ?? []).find((s) => s.id === "pbe-aisle-walker");
    expect(walker).toBeDefined();
    expect(walker!.kind).toBe("pedestrianDartOut");
    if (walker!.kind !== "pedestrianDartOut") return;
    // The one dial that keeps her out of the arc: 7 km/h is above the 4 km/h
    // reverse and below the 9 km/h drive-away, so she can ONLY fire on the
    // forward leg — where the runner's `approaching` test can actually see the
    // car. (A walker staged behind a reversing car never triggers: reverse
    // keeps the heading pointed into the bay.)
    expect(walker!.minTriggerSpeedKmh).toBe(7);
  });

  it("the LIVE session agrees the slow, checked exit is innocent — no phantom bill", () => {
    // Where a sloppy tune would surface: the arc crosses the aisle at x ≈ 2–5
    // (acquitted only because reverse is exempt from the lane detectors, A12),
    // and the drive-away rides x = 1.0, which is 3.06 m off the drawn lane
    // centre — 0.19 m inside the 3.25 m arming threshold.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("COLLISION");
    expect(codes).not.toContain("WRONG_WAY");
    expect(codes).not.toContain("LANE_DISCIPLINE");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-park-bay-exit-rev@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-park-bay-exit-rev@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the blind reverse grades COLLISION in a LIVE session, 1★", () => {
    let s = createLessonSession(compileScenario(SC_PARK_BAY_EXIT_REV, 3));
    recordScParkBayExitRevDrive(loadDistrict("lot-perp-v1"), "mistake-blind-reverse", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_PARK_BAY_EXIT_REV.rubric!).stars).toBe(1);
  });

  it("counter-proof: the one-motion swing grades COLLISION over the SAME arc, 1★", () => {
    // The sharpest claim of the template, made checkable: this demo drives the
    // shadow's own geometry. It is convicted for the two missing pauses and the
    // missing look, not for a wilder line — so the student cannot read the
    // lesson as „the arc was wrong".
    let s = createLessonSession(compileScenario(SC_PARK_BAY_EXIT_REV, 3));
    recordScParkBayExitRevDrive(loadDistrict("lot-perp-v1"), "mistake-swing-out", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(s.events.filter((e) => e.kind === "violation").map((e) => e.code)).toEqual(["COLLISION"]);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_PARK_BAY_EXIT_REV.rubric!).stars).toBe(1);
  });

  it("compiles at every authored rung; L4 is the exam cold start, L5 the dark lot", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_PARK_BAY_EXIT_REV, level).id).toBe(
        `sc-park-bay-exit-rev@L${level}`,
      );
    }
    expect(compileScenario(SC_PARK_BAY_EXIT_REV, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_PARK_BAY_EXIT_REV, 4).examMode).toBe(true);
    const l5 = compileScenario(SC_PARK_BAY_EXIT_REV, 5);
    expect(l5.examMode).toBeFalsy();
    expect(l5.environment?.timeOfDay).toBe("night");
    // L5 adds a SECOND walker rather than the backlog's aisle car: lot-e-aisle
    // is class "service" and stays out of the lane graph, so no staged vehicle
    // can be pathed on it at all (pinned in world/__tests__/lot-exit-districts).
    expect(l5.stagedEvents?.map((e) => e.id)).toEqual([
      "pbe-aisle-walker",
      "pbe-aisle-walker-late",
    ]);
    // The walker rides every rung — she is the drill's only live participant.
    for (const level of [1, 3, 4] as const) {
      expect(
        compileScenario(SC_PARK_BAY_EXIT_REV, level).stagedEvents?.map((e) => e.id),
        `L${level}`,
      ).toEqual(["pbe-aisle-walker"]);
    }
  });
});

// ---------------------------------------------------------------------------
// sc-merge-from-property — the smallest merge in the family and the strictest:
//                          leaving a property you yield to EVERYONE, in order —
//                          and the signal you give is not the permission you need
// ---------------------------------------------------------------------------

describe("wave-5 bot completion — sc-merge-from-property at L3", () => {
  const lesson = compileScenario(SC_MERGE_FROM_PROPERTY, 3);
  let session = createLessonSession(lesson);
  recordScMergeFromPropertyDrive(loadDistrict("mg-property-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: all four objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_MERGE_FROM_PROPERTY.rubric!).stars).toBe(3);
  });

  it("carries BOTH staged actors into the live lesson — the pavement AND the flow", () => {
    // Drop the walker and „пропусни пешеходците“ is a claim about an empty
    // pavement; drop the поток and „изчакай потока“ is a claim about an empty
    // road — the student would then win the drill by driving straight out, which
    // is precisely the behaviour it exists to prevent.
    expect((lesson.stagedEvents ?? []).map((s) => s.id)).toEqual(["sc-mfp-walker", "sc-mfp-stream"]);
    // No ruleConfig and no physics by design: чл. 25 is graded by shipped
    // detectors over map data the runtime DERIVES (the Б2 at the exit mouth) —
    // no dial is opted in anywhere. A lesson that quietly grew one fails here.
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the drill is won IN ORDER: pavement, sign, merge, finish — чл. 25's own sequence", () => {
    // The objective order IS the lesson. чл. 25 does not say „внимавай на
    // изхода“, it says пропусни пешеходците, ПОСЛЕ се включи в движението — and
    // a driver who reached the merge gate before the pavement gate would be one
    // who found his gap first and dealt with the тротоар on the way out.
    // Objectives advance sequentially (lessons/engine.ts), so the order is
    // enforced, not merely observed.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    for (const id of ["sc-mfp-walk-yield", "sc-mfp-stop-line", "sc-mfp-merged", "sc-mfp-finish"]) {
      expect(at(id).done, id).toBe(true);
    }
    expect(at("sc-mfp-walk-yield").completedAtSec!).toBeLessThan(at("sc-mfp-stop-line").completedAtSec!);
    expect(at("sc-mfp-stop-line").completedAtSec!).toBeLessThan(at("sc-mfp-merged").completedAtSec!);
    expect(at("sc-mfp-merged").completedAtSec!).toBeLessThan(at("sc-mfp-finish").completedAtSec!);
  });

  it("the LIVE session commends both duties — and bills no phantom for doing them", () => {
    // The recorder's own engine proves this on the trace gate; this proves the
    // STUDENT-facing path agrees. This map is exactly where a phantom would
    // surface if one existed: the drive stops twice on one approach, crawls a
    // service edge at 12 km/h, sits on a Б2 for nine seconds and then turns
    // across a junction — every one of those is a shape some detector could
    // misread.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(codes).not.toContain("STOP_SIGN_NO_FULL_STOP");
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    const commended = session.events.filter((e) => e.kind === "commendation").map((e) => e.code);
    expect(commended).toContain("PEDESTRIAN_YIELDED");
    expect(commended).toContain("FULL_STOP_AT_STOP_SIGN");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-merge-from-property@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-merge-from-property@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the pavement demo is SCORED (never a modal) and reaches NO gate", () => {
    // PEDESTRIAN_NOT_YIELDED is опасна and COLLISION is terminating, so both are
    // SCORED with non-blocking toasts rather than pausing into a teach card — a
    // safety event must never pop a modal mid-drive (the student may be
    // mid-braking, and interrupting the handling would teach the worst possible
    // reflex). So they land on session.events and the A9 teach channel stays
    // empty. The §9 exact-code assert lives on the trace gate:
    // traces/__tests__/sc-merge-from-property-traces.
    let s = createLessonSession(compileScenario(SC_MERGE_FROM_PROPERTY, 3));
    const taught: string[] = [];
    recordScMergeFromPropertyDrive(loadDistrict("mg-property-v1"), "mistake-walk-through", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toEqual([]);
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).toContain("COLLISION");
    // The template's sharpest claim, made checkable: sc-mfp-walk-yield carries
    // maxSpeedKmh 5 in a 3 m radius on the PROPERTY side of the band. A driver
    // who never stopped is simply never there slowly enough — so he completes
    // NOTHING, and the run is lost at the FIRST duty, before the boulevard he
    // was so busy looking at ever became relevant. „Гледах за пролука“ is
    // measurably the wrong order, and this is the assert that measures it.
    expect(r.objectives.every((o) => !o.done)).toBe(true);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_MERGE_FROM_PROPERTY.rubric!).stars).toBe(1);
  });

  it("counter-proof: the „с мигача“ demo runs the SAME route and still fails — on one decision", () => {
    // The mirror of the demo above, and the reason both exist. This driver does
    // everything the shadow does: stops for the walker, clears the band, halts
    // fully on the Б2, looks, indicates. He completes EVERY objective — the
    // route was never the problem — and still fails, because FAILED_TO_YIELD is
    // опасна. That asymmetry IS the template's claim: the gates measure where
    // the car went, the code measures who was coming while it went. A drill that
    // failed him on geometry instead would let a student believe чл. 25 is about
    // lines on the ground rather than about the people already on the road.
    let s = createLessonSession(compileScenario(SC_MERGE_FROM_PROPERTY, 3));
    const taught: string[] = [];
    recordScMergeFromPropertyDrive(loadDistrict("mg-property-v1"), "mistake-signal-and-go", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toEqual([]); // опасна → scored, never a modal
    expect(s.events.filter((e) => e.kind === "violation").map((e) => e.code)).toEqual([
      "FAILED_TO_YIELD",
    ]);
    expect(r.completedAll).toBe(true);
    expect(r.passed).toBe(false);
    // …and the sheet still credits the two duties he DID discharge. The card is
    // „едно решение“, not „лош водач“, and the events say exactly that.
    const commended = s.events.filter((e) => e.kind === "commendation").map((e) => e.code);
    expect(commended).toContain("PEDESTRIAN_YIELDED");
    expect(commended).toContain("FULL_STOP_AT_STOP_SIGN");
  });

  it("compiles at every authored rung; L5 adds a second column WITHOUT touching the dry physics", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_MERGE_FROM_PROPERTY, level).id).toBe(`sc-merge-from-property@L${level}`);
    }
    expect(compileScenario(SC_MERGE_FROM_PROPERTY, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_MERGE_FROM_PROPERTY, 4).examMode).toBe(true);
    const l5 = compileScenario(SC_MERGE_FROM_PROPERTY, 5);
    // „Пролуката струва цяла минута търпение“: a second column arriving behind
    // the first, so the road is never briefly-empty and the first hole is never
    // the answer. No weather and no grip dial — the L5 delta here is PATIENCE,
    // not braking distance (ADR-006 stage 4a: this ghost is dry-tuned).
    expect(l5.environment?.rain).toBeFalsy();
    expect(l5.physics).toBeUndefined();
    expect((l5.stagedEvents ?? []).map((s) => s.id)).toEqual([
      "sc-mfp-walker",
      "sc-mfp-stream",
      "sc-mfp-stream-2",
    ]);
    // Both duties ride EVERY rung — they are the template's spine, not an L5
    // complication. Without the walker on L1 the beginner would learn that the
    // pavement is optional.
    for (const level of [1, 3, 5] as const) {
      expect(
        compileScenario(SC_MERGE_FROM_PROPERTY, level).stagedEvents?.map((e) => e.kind),
        `L${level}`,
      ).toContain("pedestrianDartOut");
    }
  });
});

// ---------------------------------------------------------------------------
// sc-rx-barrier-drop — the DESCENDING barrier (RX-01): the arm drops in front
//                      of the player at t = 20; „вдигната бариера" is not
//                      „минавай" once it starts down (чл. 52)
// ---------------------------------------------------------------------------

describe("wave-5 bot completion — sc-rx-barrier-drop at L3", () => {
  const lesson = compileScenario(SC_RX_BARRIER_DROP, 3);
  let session = createLessonSession(lesson);
  recordScRxBarrierDropDrive(loadDistrict("rx-drop-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: both objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_RX_BARRIER_DROP.rubric!).stars).toBe(3);
  });

  it("the drill is won by the WAIT: hold the line through the down-window, then cross", () => {
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    // The wait gate has teeth: maxSpeedKmh 5 at the stop line — diving under the
    // descending arm can never satisfy „изчакай зад стоп-линията".
    expect(at("sc-rxd-wait").done).toBe(true);
    expect(at("sc-rxd-finish").done).toBe(true);
    // In order — waited at the line FIRST, crossed after the lift.
    expect(at("sc-rxd-wait").completedAtSec!).toBeLessThan(at("sc-rxd-finish").completedAtSec!);
    // And the wait was real: the barrier is down [20, 60), so a whole 40 s
    // separates reaching the line from clearing the crossing — the arm starting
    // up was never the moment to go.
    expect(at("sc-rxd-finish").completedAtSec! - at("sc-rxd-wait").completedAtSec!).toBeGreaterThan(30);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-rx-barrier-drop@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-rx-barrier-drop@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: diving under the descending arm grades RAIL_CROSSING_VIOLATION, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_RX_BARRIER_DROP, 3));
    recordScRxBarrierDropDrive(loadDistrict("rx-drop-v1"), "mistake-dive-barrier", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // RAIL_CROSSING_VIOLATION is опасна (10 points) — SCORED on the first
    // encounter rather than softened onto the teach-moment channel.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "RAIL_CROSSING_VIOLATION")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_RX_BARRIER_DROP.rubric!).stars).toBe(1);
    // …and it never even reaches the wait gate — it blew through the line at
    // speed, so „изчакай зад стоп-линията" stays incomplete.
    expect(r.objectives.find((o) => o.id === "sc-rxd-wait")!.done).toBe(false);
  });

  it("counter-proof: freezing on the rails grades RAIL_CROSSING_VIOLATION too, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_RX_BARRIER_DROP, 3));
    recordScRxBarrierDropDrive(loadDistrict("rx-drop-v1"), "mistake-stop-on-track", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // The SAME опасна code from a DIFFERENT act (the rest on the band): the
    // entry was innocent (guarded + open), the freeze is the kill — see the
    // trace gate, which pins the "stopped-on-track" detail. Here we prove the
    // student-facing verdict: scored, failed, one star.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "RAIL_CROSSING_VIOLATION")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_RX_BARRIER_DROP.rubric!).stars).toBe(1);
    // It braked to a halt ON the rails, so it never held the line at ≤ 5 km/h —
    // the wait gate is unreachable from a car that stops between the rails.
    expect(r.objectives.find((o) => o.id === "sc-rxd-wait")!.done).toBe(false);
  });

  it("the barrier is the GRADING trap, the TRAIN is the staged hazard, and the ladder runs 1→5 with L4 the exam rung", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_RX_BARRIER_DROP, level).id).toBe(`sc-rx-barrier-drop@L${level}`);
    }
    expect(compileScenario(SC_RX_BARRIER_DROP, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_RX_BARRIER_DROP, 4).examMode).toBe(true);
    // The descent is WORLD DATA (rx-drop-v1's timetable) — grading needs no
    // staged actor. The only staged event is the TRAIN the barrier guards
    // (ADR-006 stage 3c): byte-neutral to grading (its runner emits no SimTick
    // events), on every rung; the authored ghost envelope stays dry (no physics).
    for (const level of [1, 3, 5] as const) {
      const staged = compileScenario(SC_RX_BARRIER_DROP, level).stagedEvents ?? [];
      expect(staged.map((e) => e.kind), `L${level}`).toEqual(["trainPass"]);
      expect(staged[0].id, `L${level}`).toBe("sc-rxd-train");
      expect(compileScenario(SC_RX_BARRIER_DROP, level).physics, `L${level}`).toBeUndefined();
    }
  });
});
