/**
 * Wave-8 bot-completion proofs (doc 76 §10; the s-batch2 / s-w1..s-w7 mold) —
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
 * (the main session owns that edit; templates-signals2.ts was already spread in
 * wave 1-2, so sc-sig-controller-postures resolves immediately).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recordScSigControllerPosturesDrive } from "../../../traces/scSigControllerPostures";
import { recordScRxTramStopDrive } from "../../../traces/scRxTramStopDoors";
import { recordScLnDecisiveChangeDrive } from "../../../traces/scLnDecisiveChange";
import { recordScVuBikelaneTurnDrive } from "../../../traces/scVuBikelaneTurn";
import { recordScHzAccidentSceneDrive } from "../../../traces/scHzAccidentScene";
import { recordScEdReverseLineDrive } from "../../../traces/scEdReverseLine";
import { recordScFoMotorwayGapDrive } from "../../../traces/scFoMotorwayGap";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_SIG_CONTROLLER_POSTURES } from "../templates-signals2";
import { SC_RX_TRAM_STOP } from "../templates-rail2";
import { SC_LN_DECISIVE_CHANGE } from "../templates-lanes3";
import { SC_VU_BIKELANE_TURN } from "../templates-vru2";
import { SC_HZ_ACCIDENT_SCENE } from "../templates-hazards2";
import { SC_ED_REVERSE_LINE } from "../templates-exam";
import { SC_FO_MOTORWAY_GAP } from "../templates-following2";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

// ---------------------------------------------------------------------------
// sc-sig-controller-postures — the drill is won by READING THE OFFICER at a DARK
//                              junction: no lamp to obey, only his posture. The
//                              shadow reads „стоп" (гърди/вдигната ръка), waits,
//                              and moves on the side-on profile; both mistakes
//                              move against a „стоп" posture and grade the same
//                              опасна code (ППЗДвП чл. 29, ал. 3; ЗДвП чл. 7).
// ---------------------------------------------------------------------------

describe("wave-8 bot completion — sc-sig-controller-postures at L3", () => {
  const lesson = compileScenario(SC_SIG_CONTROLLER_POSTURES, 3);
  let session = createLessonSession(lesson);
  const drive = recordScSigControllerPosturesDrive(loadDistrict("sx-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_SIG_CONTROLLER_POSTURES.rubric!).stars).toBe(3);
  });

  it("the staged controller resolves 'yielded' — the stop posture was read and waited out", () => {
    const staged = drive.outcomes.find((o) => o.eventId === "sc-sctp-officer")!;
    expect(staged.success).toBe(true);
    expect(staged.detail).toBe("yielded");
  });

  it("stages ONLY the officer and opts into NOTHING — the posture is the whole encounter", () => {
    // Every dial this drill could have reached for is deliberately empty:
    //  - one staged trafficController, no other actor;
    //  - no ruleConfig: CONTROLLER_SIGNAL_VIOLATED is default-on for everyone;
    //  - no physics: the ghost is dry-tuned (ADR-006 stage 4a);
    //  - no signalPlan: the lamps are DARK, an approach-relative pin is inert.
    expect((lesson.stagedEvents ?? []).map((e) => e.kind)).toEqual(["trafficController"]);
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
    expect(lesson.signalPlan).toBeUndefined();
  });

  it("the LIVE session bills no phantom for the lawful read-stop-proceed", () => {
    // The car approaches slowly, stops dead ~3 m short of the paint, waits ~16 s
    // with a dark lamp, then crosses on the officer's permission. Every detector
    // this map can anger is watching, and a halted approach never reads „green".
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    for (const c of [
      "CONTROLLER_SIGNAL_VIOLATED",
      "RED_LIGHT_CROSSED",
      "HESITATION_AT_GREEN",
      "STOP_LINE_OVERSHOOT",
      "HARSH_BRAKING_NO_CAUSE",
      "POOR_LANE_KEEPING",
    ]) {
      expect(codes).not.toContain(c);
    }
  });

  /** Replay a demo through a LIVE session at one rung, splitting the coach's
   *  two channels: what it TAUGHT (first-encounter pause card) vs what it
   *  SCORED (session.events → the sheet). */
  const replay = (
    name: Parameters<typeof recordScSigControllerPosturesDrive>[1],
    level: 3 | 4,
  ) => {
    let s = createLessonSession(compileScenario(SC_SIG_CONTROLLER_POSTURES, level));
    const taught: string[] = [];
    recordScSigControllerPosturesDrive(loadDistrict("sx-v1"), name, {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    return {
      taught,
      scored: s.events.filter((e) => e.kind === "violation").map((e) => e.code),
      r: buildLessonResult(s),
    };
  };

  it("counter-proof: barging past his chest is опасна — SCORED, never taught, instantly failed", () => {
    // The classic error: „the light is off, so I decide". The officer faced the
    // car (гърди = стоп) and it drove through anyway. CONTROLLER_SIGNAL_VIOLATED
    // is опасна (10 т.), so it is SCORED with a toast rather than paused into a
    // card even at L3 — the A9 teach channel stays empty.
    const l3 = replay("mistake-barge-chest", 3);
    expect(l3.taught).toEqual([]);
    expect(l3.scored).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
    expect(l3.r.score).toBe(10); // one опасна > the 9-point budget (Наредба-38)
    expect(l3.r.passed).toBe(false);
    expect(scoreRubric(l3.r, SC_SIG_CONTROLLER_POSTURES.rubric!).stars).toBe(1);
    // The exam rung grades the identical drive identically.
    const l4 = replay("mistake-barge-chest", 4);
    expect(l4.taught).toEqual([]);
    expect(l4.scored).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
    expect(l4.r.passed).toBe(false);
  });

  it("counter-proof: a CORRECT stop then a false start on the raised arm is the SAME опасна", () => {
    // The sharper claim, and the reason both demos exist. This driver did the
    // hard part right — he stopped dead at the line — and is still failed,
    // because he read the raised arm as „go". The good first half buys nothing:
    // moving against the posture is the fault, whether or not you stopped first.
    const l3 = replay("mistake-start-on-raised-arm", 3);
    expect(l3.taught).toEqual([]);
    expect(l3.scored).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
    expect(l3.r.score).toBe(10);
    expect(l3.r.passed).toBe(false);
    expect(scoreRubric(l3.r, SC_SIG_CONTROLLER_POSTURES.rubric!).stars).toBe(1);
  });

  it("compiles at every authored rung; L4 is the exam cold start; no L5", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_SIG_CONTROLLER_POSTURES, level).id).toBe(
        `sc-sig-controller-postures@L${level}`,
      );
    }
    expect(compileScenario(SC_SIG_CONTROLLER_POSTURES, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_SIG_CONTROLLER_POSTURES, 4).examMode).toBe(true);
    // No L5 (the backlog's own rung list): the difficulty axis is reading the
    // posture, not grip or light — a wet/night rung would want the ADR-006
    // stage-4a physics opt-in the dry-tuned ghost cannot honour.
    expect(SC_SIG_CONTROLLER_POSTURES.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
    // The officer rides every rung — he is the drill, not a complication.
    for (const level of [1, 2, 3, 4] as const) {
      expect(
        (compileScenario(SC_SIG_CONTROLLER_POSTURES, level).stagedEvents ?? []).map((e) => e.kind),
        `L${level}`,
      ).toEqual(["trafficController"]);
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-sig-controller-postures@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-sig-controller-postures@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sc-rx-tram-stop-doors — the RX-04 INVERSE: strip the refuge island and the
//                         stop becomes MANDATORY (чл. 66, ал. 1). The shadow
//                         stops behind the open doors, waits the alighting
//                         passenger fully off the lane, then proceeds. The two
//                         mistakes both fail to yield: threading past the doors
//                         adds a COLLISION, creeping through does not.
// ---------------------------------------------------------------------------

describe("wave-8 bot completion — sc-rx-tram-stop-doors at L3", () => {
  const lesson = compileScenario(SC_RX_TRAM_STOP, 3);
  let session = createLessonSession(lesson);
  const drive = recordScRxTramStopDrive(loadDistrict("rx-tram-stop-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: every objective done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(result.objectives.every((o) => o.done)).toBe(true);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_RX_TRAM_STOP.rubric!).stars).toBe(3);
  });

  it("the staged passenger resolves 'yielded' — the lane was cleared before crossing", () => {
    const staged = drive.outcomes.find((o) => o.eventId === "sc-rts-passenger")!;
    expect(staged.success).toBe(true);
    expect(staged.detail).toBe("yielded");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-rx-tram-stop-doors@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-rx-tram-stop-doors@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: threading past the open doors grades PEDESTRIAN_NOT_YIELDED + COLLISION, failed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_RX_TRAM_STOP, 3));
    recordScRxTramStopDrive(loadDistrict("rx-tram-stop-v1"), "mistake-thread-doors", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).toContain("COLLISION");
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_RX_TRAM_STOP.rubric!).stars).toBe(1);
  });

  it("counter-proof: creeping through the alighting passenger grades PEDESTRIAN_NOT_YIELDED (no collision), failed", () => {
    let s = createLessonSession(compileScenario(SC_RX_TRAM_STOP, 3));
    recordScRxTramStopDrive(loadDistrict("rx-tram-stop-v1"), "mistake-creep-through", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).not.toContain("COLLISION");
    expect(r.passed).toBe(false);
  });

  it("compiles at every authored rung; L4 is the exam cold start; L5 adds rain + wet grip + a late runner", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_RX_TRAM_STOP, level).id).toBe(`sc-rx-tram-stop-doors@L${level}`);
    }
    expect(compileScenario(SC_RX_TRAM_STOP, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_RX_TRAM_STOP, 4).examMode).toBe(true);
    expect(SC_RX_TRAM_STOP.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    // L5 — the conditionsNote: rain + wet grip + a THIRD passenger sprinting
    // the other way for the closing doors (the base darter is never re-timed).
    const l5 = compileScenario(SC_RX_TRAM_STOP, 5);
    expect(l5.physics).toEqual({ wetGrip: true });
    expect((l5.stagedEvents ?? []).map((e) => e.kind)).toEqual([
      "pedestrianDartOut",
      "pedestrianDartOut",
      "pedestrianDartOut",
    ]);
    // L1–L4 hold TWO alighting passengers, on every rung. 1 → 2 (founder: „the
    // question statements says … and in the map engineering its only 1"): the
    // objective says the tram „изсипва пътнициТЕ" and instruction 4 says
    // «докато и ПОСЛЕДНИЯТ пътник не се прибере», and against one figure the
    // last passenger was the first passenger — the drill the copy describes
    // (wait out the flow, not the person you were watching) was never staged.
    for (const level of [1, 2, 3, 4] as const) {
      expect(
        (compileScenario(SC_RX_TRAM_STOP, level).stagedEvents ?? []).map((e) => e.kind),
        `L${level}`,
      ).toEqual(["pedestrianDartOut", "pedestrianDartOut"]);
    }
  });
});

// ---------------------------------------------------------------------------
// sc-ln-decisive-change — the drill is won by WAITING FOR THE GAP: the target-
//                         lane car draws level and passes, and the real gap it
//                         opens is BEHIND it, not in front of it. The two ways
//                         the judgement fails are the two demos — lunging onto
//                         the car in the blind spot, and half-taking the lane so
//                         the driver already in it must brake (ЗДвП чл. 25).
// ---------------------------------------------------------------------------

describe("wave-8 bot completion — sc-ln-decisive-change at L3", () => {
  const lesson = compileScenario(SC_LN_DECISIVE_CHANGE, 3);
  let session = createLessonSession(lesson);
  recordScLnDecisiveChangeDrive(loadDistrict("ln-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_LN_DECISIVE_CHANGE.rubric!).stars).toBe(3);
  });

  it("THE POINT, on the STUDENT path: the gates are lane-exclusive, so the wait cannot be narrated", () => {
    // The trace gate proves the recorder's engine sees a clean drive; this
    // proves the student-facing session agrees, and that each half of the drill
    // is a GATE. sc-lndc-wait is a reachZone on the RIGHT lane center with
    // radiusM 4 (< half the 8.125 m lane pitch): satisfiable ONLY from the
    // cruise lane, so a driver who lunged left early misses it entirely.
    // sc-lndc-merged sits on the TARGET lane center — unreachable without
    // actually completing the merge. Wait right → merge left → home, in order.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    for (const id of ["sc-lndc-wait", "sc-lndc-merged", "sc-lndc-finish"]) {
      expect(at(id).done, id).toBe(true);
    }
    expect(at("sc-lndc-wait").completedAtSec!).toBeLessThan(at("sc-lndc-merged").completedAtSec!);
    expect(at("sc-lndc-merged").completedAtSec!).toBeLessThan(at("sc-lndc-finish").completedAtSec!);
    // …and the patience is CREDITED, not merely tolerated: the ritual earns the
    // SAFE_LANE_CHANGE commendation the whole drill is built around.
    expect(session.events.filter((e) => e.kind === "commendation").map((e) => e.code)).toContain(
      "SAFE_LANE_CHANGE",
    );
  });

  it("carries the target-lane car into the live lesson — the gap is staged, not narrated", () => {
    // Drop it and the student meets an empty boulevard: there is nothing to
    // wait for, nothing to read, and „изчакай реалната пролука" becomes a
    // sentence on a card with nothing behind it (the drill decays into
    // sc-lane-change with different copy). The passing car IS the premise.
    const staged = lesson.stagedEvents ?? [];
    expect(staged.map((e) => e.id)).toEqual(["sc-lndc-target"]);
    expect(staged[0].kind).toBe("rearTailgater"); // pressure scenery — emits ZERO SimTick events
    // Graded on SHIPPED rules alone: no dial is opted in anywhere. чл. 25's
    // lane-change duty lives in the engine's mirror/indicator/lane-keeping
    // detectors, default-on for everyone, and the ghosts are dry-tuned
    // (ADR-006 stage 4a).
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the LIVE session bills no phantom for the taught wait and the decisive merge", () => {
    // Where a sloppy tune would surface: the car paces a boulevard for ~30 s,
    // holds its lane while a faster car draws level and passes, then crosses one
    // lane boundary and settles. Every detector this map can anger is watching,
    // and the drill ORDERS all of it — the patience must cost nothing.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    for (const c of [
      "LANE_CHANGE_WITHOUT_INDICATOR",
      "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
      "POOR_LANE_KEEPING",
      "NOT_KEEPING_RIGHT",
      "FOLLOWING_TOO_CLOSE",
      "CENTER_LINE_TOUCHED",
      "COLLISION",
      "SPEEDING_OVER_LIMIT",
      "HARSH_BRAKING_NO_CAUSE",
    ]) {
      expect(codes).not.toContain(c);
    }
  });

  /** Replay a demo through a LIVE session at one rung, splitting the coach's
   *  two channels: what it TAUGHT (first-encounter pause card) vs what it
   *  SCORED (session.events → the sheet). */
  const replay = (name: Parameters<typeof recordScLnDecisiveChangeDrive>[1], level: 3 | 4) => {
    let s = createLessonSession(compileScenario(SC_LN_DECISIVE_CHANGE, level));
    const taught: string[] = [];
    recordScLnDecisiveChangeDrive(loadDistrict("ln-v1"), name, {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    return {
      taught,
      scored: s.events.filter((e) => e.kind === "violation").map((e) => e.code),
      r: buildLessonResult(s),
    };
  };

  it("counter-proof: the lunge onto the blind-spot car is SCORED — and reaches no gate at all", () => {
    // The template's sharpest claim on the student path. This driver did not
    // misjudge a gap by a second — he checked the mirror he COULD check (the
    // rear-view), signalled, and turned the wheel onto a car that was alongside
    // him in the one sector the mirror cannot see. COLLISION is опасна, so it is
    // SCORED with a toast rather than a modal (a dangerous code must never pop a
    // card mid-manoeuvre); LANE_CHANGE_WITHOUT_MIRROR_CHECK is основна, so its
    // first encounter pauses with a teach card (teach-first, doc 76 §0).
    const l3 = replay("mistake-blind-spot", 3);
    expect(l3.taught).toEqual(["LANE_CHANGE_WITHOUT_MIRROR_CHECK"]);
    expect(l3.scored).toEqual(["COLLISION"]);
    expect(l3.r.score).toBe(10); // one опасна > the 9-point budget (Наредба-38)
    expect(l3.r.passed).toBe(false);
    // He never even reached the wait gate — the crash ends the drive at y ≈ 190.
    for (const id of ["sc-lndc-wait", "sc-lndc-merged", "sc-lndc-finish"]) {
      expect(l3.r.objectives.find((o) => o.id === id)!.done, id).toBe(false);
    }
    expect(l3.r.completedAll).toBe(false);
    expect(scoreRubric(l3.r, SC_LN_DECISIVE_CHANGE.rubric!).stars).toBe(1);
    // …and at the exam rung the coach stops teaching and bills the identical
    // drive for BOTH faults.
    const l4 = replay("mistake-blind-spot", 4);
    expect(l4.taught).toEqual([]);
    expect([...new Set(l4.scored)].sort()).toEqual(["COLLISION", "LANE_CHANGE_WITHOUT_MIRROR_CHECK"]);
    expect(l4.r.passed).toBe(false);
  });

  it("counter-proof: the half-merge TEACHES the unannounced move at L3 and BILLS the wandering lane at L4", () => {
    // The mirror image, and the reason both demos exist. This driver did the
    // hard half right — he saw the car and waited it out — and then threw it
    // away: no indicator, and the wheel hovered on the divider instead of
    // committing to the center. LANE_CHANGE_WITHOUT_INDICATOR is основна, so its
    // first encounter pauses with a teach card and costs no points; the pause
    // latches the drill BEFORE the straddle sustains, so the студент hears the
    // first lesson and the second (POOR_LANE_KEEPING) waits for the exam rung —
    // honest teach-first pacing, not a double modal mid-manoeuvre.
    const l3 = replay("mistake-half-merge", 3);
    expect(l3.taught).toEqual(["LANE_CHANGE_WITHOUT_INDICATOR"]);
    expect(l3.scored).toEqual([]);
    expect(l3.r.score).toBe(0);
    // He was seen to wait and to nose into the gap — so wait+merged tick — but
    // he never centred and drove home, so the drill does not complete.
    expect(l3.r.objectives.find((o) => o.id === "sc-lndc-wait")!.done).toBe(true);
    expect(l3.r.objectives.find((o) => o.id === "sc-lndc-finish")!.done).toBe(false);
    expect(l3.r.completedAll).toBe(false);
    // …and at the exam rung the identical drive is billed for BOTH the missing
    // indicator (основна, 3) and the half-taken lane (второстепенна, 1) = 4.
    const l4 = replay("mistake-half-merge", 4);
    expect(l4.taught).toEqual([]);
    expect([...new Set(l4.scored)].sort()).toEqual([
      "LANE_CHANGE_WITHOUT_INDICATOR",
      "POOR_LANE_KEEPING",
    ]);
    expect(l4.scored).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK"); // the car WAS seen
    expect(l4.scored).not.toContain("COLLISION"); // and waited out — no contact
    expect(l4.r.score).toBe(4);
    expect(l4.r.passed).toBe(false);
  });

  it("compiles at every authored rung; L4 is the exam cold start, L5 is rain + a tighter gap", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_LN_DECISIVE_CHANGE, level).id).toBe(`sc-ln-decisive-change@L${level}`);
    }
    expect(compileScenario(SC_LN_DECISIVE_CHANGE, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_LN_DECISIVE_CHANGE, 4).examMode).toBe(true);
    expect(SC_LN_DECISIVE_CHANGE.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    // L5 — rain + tighter target-lane spacing: a SECOND car ahead in the target
    // lane bounds the gap on both ends (the passing car defines its back). The
    // difficulty axis is READING a tighter gap through a wet windscreen, so
    // physics stays DRY (ADR-006 stage 4a — the authored ghost envelope is
    // dry-tuned; a wet L5 would slide the shadow's arc).
    const l5 = compileScenario(SC_LN_DECISIVE_CHANGE, 5);
    expect(l5.environment?.rain).toBe(true);
    expect(l5.physics).toBeUndefined();
    expect((l5.stagedEvents ?? []).map((e) => e.id).sort()).toEqual([
      "sc-lndc-lead-l5",
      "sc-lndc-target",
    ]);
    // The passing car rides every rung — it is the drill, not an L5 addition.
    for (const level of [1, 2, 3, 4] as const) {
      expect((compileScenario(SC_LN_DECISIVE_CHANGE, level).stagedEvents ?? []).map((e) => e.id)).toEqual([
        "sc-lndc-target",
      ]);
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    // Integration-gated: scenarioLessonById resolves through the templates.ts
    // registry, so this goes green once SC_LN_DECISIVE_CHANGE is spread into
    // SCENARIO_TEMPLATES (the main session owns that edit — see the file header).
    const graded = gradeFinishWire({
      lessonId: "sc-ln-decisive-change@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ln-decisive-change@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sc-vu-bikelane-turn — the right turn across a TWO-WAY cycle track: the shadow
//                       stands off the junction core while BOTH cycle directions
//                       cross the mouth (with-flow AND the counter-flow rider
//                       from ahead), then turns; the counter-proof cuts the rider
//                       off and grades the опасна FAILED_TO_YIELD (ЗДвП чл. 25;
//                       чл. 37).
// ---------------------------------------------------------------------------

describe("wave-8 bot completion — sc-vu-bikelane-turn at L3", () => {
  const lesson = compileScenario(SC_VU_BIKELANE_TURN, 3);
  let session = createLessonSession(lesson);
  const drive = recordScVuBikelaneTurnDrive(loadDistrict("vu-bikelane-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: every objective done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_VU_BIKELANE_TURN.rubric!).stars).toBe(3);
  });

  it("stages BOTH cycle directions and opts into nothing — the two-way scan is the drill", () => {
    // Two cyclistRightHook riders, no ruleConfig, no physics: the base rungs are
    // dry-tuned (ADR-006 stage 4a) and every detector is default-on.
    expect((lesson.stagedEvents ?? []).map((e) => e.kind)).toEqual([
      "cyclistRightHook",
      "cyclistRightHook",
    ]);
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("both staged riders resolve 'yielded' — waited out both directions before turning", () => {
    const wf = drive.outcomes.find((o) => o.eventId === "sc-vbl-rider-wf")!;
    const cf = drive.outcomes.find((o) => o.eventId === "sc-vbl-rider-cf")!;
    expect(wf.success).toBe(true);
    expect(wf.detail).toBe("yielded");
    expect(cf.success).toBe(true);
    expect(cf.detail).toBe("yielded");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-vu-bikelane-turn@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-vu-bikelane-turn@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: cutting the rider off in the mouth grades FAILED_TO_YIELD and does not pass", () => {
    let s = createLessonSession(compileScenario(SC_VU_BIKELANE_TURN, 3));
    recordScVuBikelaneTurnDrive(loadDistrict("vu-bikelane-v1"), "mistake-cut-path", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")).toBe(true);
    expect(r.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sc-hz-accident-scene — the drill is won by PASSING A HAZARD YOU ARE NOT PART
//                        OF: slow before the scene, arc WIDE of the people and
//                        the sheet metal, and — the graded core — do NOT stop in
//                        the live lane to gawk. The В27 span over the scene turns
//                        „само да погледна" into a blockage the ambulance behind
//                        cannot pass (ЗДвП чл. 123 + чл. 20).
// ---------------------------------------------------------------------------

describe("wave-8 bot completion — sc-hz-accident-scene at L3", () => {
  const lesson = compileScenario(SC_HZ_ACCIDENT_SCENE, 3);
  let session = createLessonSession(lesson);
  recordScHzAccidentSceneDrive(loadDistrict("hz-accident-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_HZ_ACCIDENT_SCENE.rubric!).stars).toBe(3);
  });

  it("THE POINT, on the STUDENT path: passed BECAUSE it slowed, arced wide and NEVER stopped to gawk", () => {
    // The trace gate proves the recorder's engine sees a clean drive; this proves
    // the student-facing session agrees, and that each clause of the objective is
    // a GATE rather than narration. sc-hzac-slow caps 35 at the mouth of the В27
    // span — unsatisfiable by a driver who holds city speed „to get a look".
    // sc-hzac-wide sits on the wide line (x = 1.8, radius 2.5 < a lane half-pitch)
    // capped at 32 — unreachable by a squeeze on the tight line and by anyone
    // still at speed. sc-hzac-clear sits beyond the span. Slow → wide → clear.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    for (const id of ["sc-hzac-slow", "sc-hzac-wide", "sc-hzac-clear"]) {
      expect(at(id).done, id).toBe(true);
    }
    // The order IS the teaching, and objectives advance sequentially.
    expect(at("sc-hzac-slow").completedAtSec!).toBeLessThan(at("sc-hzac-wide").completedAtSec!);
    expect(at("sc-hzac-wide").completedAtSec!).toBeLessThan(at("sc-hzac-clear").completedAtSec!);
  });

  it("carries BOTH bystanders AND the arriving rig into the live lesson", () => {
    // Drop the bystanders and „мини широко" loses its reason (there is no one
    // to be wide OF); drop the rig and „не спирай да зяпаш" loses the stake (the
    // blockage blocks no one). All three are premise, staged at every rung.
    const staged = (lesson.stagedEvents ?? []).map((e) => `${e.id}:${e.kind}`).sort();
    expect(staged).toEqual([
      "sc-hzac-bystander-2:pedestrianDartOut",
      "sc-hzac-bystander:pedestrianDartOut",
      "sc-hzac-rig:emergencyApproach",
    ]);
    // Graded on SHIPPED rules alone: no dial is opted in anywhere. The В27 span
    // is map data (ILLEGAL_STOP), the wreck rects are recorder data (COLLISION),
    // and the ghosts are dry-tuned (ADR-006 stage 4a).
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the LIVE session bills no phantom for the taught slow, the wide arc and the yield", () => {
    // Where a sloppy tune would surface: the car sheds 24 km/h for a hazard the
    // engine cannot see as a forward cause, arcs a curb-half excursion around the
    // wreck, crawls ~15 s inside a no-stopping span WITHOUT stopping, and lets an
    // ambulance overtake it. Every detector this map can anger is watching, and
    // the drill ORDERS all of it.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    for (const c of [
      "ILLEGAL_STOP_IN_BAN_ZONE",
      "POOR_LANE_KEEPING",
      "HARSH_BRAKING_NO_CAUSE",
      "EMERGENCY_NOT_YIELDED",
      "COLLISION",
      "SPEEDING_OVER_LIMIT",
      "PEDESTRIAN_NOT_YIELDED",
    ]) {
      expect(codes, c).not.toContain(c);
    }
  });

  /** Replay a demo through a LIVE session at one rung, splitting the coach's two
   *  channels: what it TAUGHT (first-encounter pause card) vs what it SCORED. */
  const replay = (name: Parameters<typeof recordScHzAccidentSceneDrive>[1], level: 3 | 4) => {
    let s = createLessonSession(compileScenario(SC_HZ_ACCIDENT_SCENE, level));
    const taught: string[] = [];
    recordScHzAccidentSceneDrive(loadDistrict("hz-accident-v1"), name, {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    return {
      taught,
      scored: s.events.filter((e) => e.kind === "violation").map((e) => e.code),
      /**
       * WHICH BODY each «Пътнотранспортно произшествие» row names, in order —
       * `engine.ts`'s `collision` case stamps `detail` = the body struck. A bare
       * list of codes cannot tell ONE body billed twice from TWO bodies billed
       * once, and those are the two opposite ways this reducer has already been
       * wrong; on this template's squeeze demo the difference is whether the
       * sheet names the man under the wheels or stays silent about him.
       */
      struck: s.events
        .filter((e) => e.kind === "violation" && e.code === "COLLISION")
        .map((e) => (e as { detail?: string }).detail),
      r: buildLessonResult(s),
    };
  };

  it("counter-proof: the gawk-stop TEACHES at L3 and is SCORED at L4 — основна, but the drill never completes", () => {
    // The template's graded core. ILLEGAL_STOP_IN_BAN_ZONE is основна, so the
    // first encounter pauses with a card and costs no points (teach-first,
    // doc 76 §0) at L3, and is billed at the exam rung.
    const l3 = replay("mistake-gawk-stop", 3);
    expect(l3.taught).toContain("ILLEGAL_STOP_IN_BAN_ZONE");
    expect(l3.scored).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
    expect(l3.scored).not.toContain("COLLISION"); // nothing was struck — he just stopped
    expect(l3.r.score).toBe(0);
    // …and UNLIKE pk-rail-ban's route-perfect stop, this gawk demo does not even
    // finish: a car parked to look never arcs wide and never clears the scene, so
    // two of the three gates stay red. Stopping to gawk is not a slower pass — it
    // is not a pass.
    expect(l3.r.completedAll).toBe(false);
    expect(l3.r.objectives.find((o) => o.id === "sc-hzac-wide")!.done).toBe(false);
    expect(l3.r.objectives.find((o) => o.id === "sc-hzac-clear")!.done).toBe(false);
    // The exam rung stops teaching and starts billing the identical drive: one
    // основна is 3 of the 9-point budget (Наредба-38, rules/scoring.ts).
    const l4 = replay("mistake-gawk-stop", 4);
    expect(l4.taught).toEqual([]);
    expect(l4.scored).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(l4.r.score).toBe(3);
    expect(l4.r.passed).toBe(false);
  });

  it("counter-proof: the tight-and-fast squeeze is опасна — scored on the spot, never a card", () => {
    // The template's sharpest claim on the student path. This driver did not
    // misjudge a metre — he took the tight line at speed past people whose next
    // move he could not know, and found the wreck AND the people. COLLISION is
    // опасна, so it is SCORED with a toast rather than paused into a card (a
    // dangerous code must never pop a modal mid-manoeuvre); the A9 teach channel
    // is EMPTY even at L3.
    const l3 = replay("mistake-squeeze", 3);
    expect(l3.taught).toEqual([]);
    // TWO BODIES, TWO ROWS — and the BODIES are the assertion, never the count.
    //
    // MEASURED (2026-08-18) on this exact drive's contact channel — 26 reports
    // at 45.9 км/ч: t=13.13 the first wreck (vehicle) · t=13.43…13.82 the
    // BYSTANDER dragged along at 60 Hz (24 pedestrian reports) · t=14.23 the
    // second wreck. The graded sheet: ПТП(vehicle) t=13.13, ПТП(pedestrian)
    // t=13.43 — one row per BODY. The 24 pedestrian re-reports are ONE accident
    // still happening, and the second wreck lands 1.1 s after the first, inside
    // collisionSeparationSec (1.2 s), so the vehicle episode is still open and
    // does not re-bill.
    //
    // THIS PIN USED TO READ ["COLLISION"], and that single row was the stale
    // half of a known regression rather than a stricter test. The conjunct that
    // stopped one shunt printing thirteen «Пътнотранспортно произшествие» rows —
    // the lead vehicle must be SEEN off the bumper before a second bill — was
    // put on a latch shared by EVERY body in the world, so the bystander's bill
    // was made to wait for the WRECK's bumper to clear, which, nose-deep in it,
    // it never did. The man under the wheels cost nothing, on the one lesson
    // whose entire subject is that people are standing there. `engine.ts`'s
    // `collision` case now keys the episode per body-kind (silence and travel
    // are properties of the CAR and are asked of every kind; daylight is a
    // property of the LEAD VEHICLE and is asked only of a `vehicle` episode);
    // `rules/__tests__/sweep161-fault-episodes.test.ts` pins both directions on
    // synthetic frames and this is the same claim on the real drive.
    //
    // Both directions live in the line below: swallow the bystander and it reads
    // ["vehicle"]; re-bill either body and it grows a third entry.
    expect(l3.struck).toEqual(["vehicle", "pedestrian"]);
    expect(l3.scored).toEqual(["COLLISION", "COLLISION"]);
    // Still ten, not twenty: `rules/scoring.ts` closes the ledger at the first
    // terminating опасна (чл. 48, ал. 3) and marks every later one
    // `unscoredAfterClose`. The second row costs no points — it buys the debrief
    // the right to say a person was hit (THEO-4).
    expect(l3.r.score).toBe(10); // one опасна > the 9-point budget (Наредба-38)
    expect(l3.r.passed).toBe(false);
    // He never even earned the first gate: holding 46 km/h to the scene misses
    // the ≤ 35 cap at the В27 mouth, so the drill stalls at step one.
    expect(l3.r.objectives.find((o) => o.id === "sc-hzac-slow")!.done).toBe(false);
    expect(l3.r.completedAll).toBe(false);
    expect(scoreRubric(l3.r, SC_HZ_ACCIDENT_SCENE.rubric!).stars).toBe(1);
  });

  it("compiles at every authored rung; L4 is the exam cold start, L5 is night", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_HZ_ACCIDENT_SCENE, level).id).toBe(`sc-hz-accident-scene@L${level}`);
    }
    expect(compileScenario(SC_HZ_ACCIDENT_SCENE, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_HZ_ACCIDENT_SCENE, 4).examMode).toBe(true);
    expect(SC_HZ_ACCIDENT_SCENE.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    // L5 — night: the difficulty axis is SEEING the scene in time (flares + the
    // light bar, not the skyline). A RENDER axis only — no physics (the ghost is
    // dry-tuned), no new grading.
    const l5 = compileScenario(SC_HZ_ACCIDENT_SCENE, 5);
    expect(l5.environment).toEqual({ timeOfDay: "night" });
    expect(l5.physics).toBeUndefined();
    expect(compileScenario(SC_HZ_ACCIDENT_SCENE, 4).environment?.timeOfDay).not.toBe("night");
    // The scene rides every rung — it is the drill, not an L5 complication.
    // TWO bystanders, not one (founder: „the question statements says … and in
    // the map engineering its only 1"): the objective says «мини широко от
    // ХОРАТА» and the squeeze demo's own text says «някой се навежда над ранен,
    // ДРУГ пристъпва назад» — a second clause that described nobody. The
    // safety invariant is unchanged: both stay in the curb HALF of the lane
    // (min x = 4.6 > 4.4), so the wide line at x = 1.8 clears them by ≥ 2.8 m.
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(
        (compileScenario(SC_HZ_ACCIDENT_SCENE, level).stagedEvents ?? []).map((e) => e.kind).sort(),
        `L${level}`,
      ).toEqual(["emergencyApproach", "pedestrianDartOut", "pedestrianDartOut"]);
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-hz-accident-scene@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-hz-accident-scene@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sc-ed-reverse-line — the Наредба-38 REVERSE maneuver on the полигон, and the
//                      FIRST scenario template to drive poligon-v1. The shadow
//                      pulls away OBSERVED, then reverses 25 m straight along the
//                      curb (three corridor gates, zero violations). The two
//                      mistakes convict alone: mounting the curb is COLLISION
//                      (опасна), and beginning the maneuver with no оглед is
//                      MOVE_OFF_WITHOUT_OBSERVATION (осн — graded on the forward
//                      move-off, since the engine never grades a reverse first
//                      move; the drill's HONEST LIMIT 2).
// ---------------------------------------------------------------------------

describe("wave-8 bot completion — sc-ed-reverse-line at L3", () => {
  const lesson = compileScenario(SC_ED_REVERSE_LINE, 3);
  let session = createLessonSession(lesson);
  recordScEdReverseLineDrive(loadDistrict("poligon-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: every corridor gate done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(result.objectives.every((o) => o.done)).toBe(true);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_ED_REVERSE_LINE.rubric!).stars).toBe(3);
  });

  it("opts into the move-off drill and nothing else — the оглед is the whole point", () => {
    // The only dial this drill reaches for is the config-gated move-off detector
    // (HONEST LIMIT 2); no staged actors, no physics, no signal plan on the closed
    // полигон straight.
    expect(lesson.ruleConfig?.moveOffObservationEnabled).toBe(true);
    expect(lesson.stagedEvents ?? []).toEqual([]);
    expect(lesson.physics).toBeUndefined();
    expect(lesson.signalPlan).toBeUndefined();
  });

  it("counter-proof: mounting the curb is опасна COLLISION — SCORED, failed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_ED_REVERSE_LINE, 3));
    recordScEdReverseLineDrive(loadDistrict("poligon-v1"), "mistake-curb", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    const codes = [...new Set(s.events.filter((e) => e.kind === "violation").map((e) => e.code))];
    expect(codes).toEqual(["COLLISION"]);
    expect(codes).not.toContain("MOVE_OFF_WITHOUT_OBSERVATION");
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_ED_REVERSE_LINE.rubric!).stars).toBe(1);
  });

  it("counter-proof: no оглед is TAUGHT as MOVE_OFF_WITHOUT_OBSERVATION at L3 (осн, teach-first)", () => {
    // An осн first encounter at L3 is teach-first: it PAUSES into a mini-lesson
    // card (A9) and does NOT count toward the score. So it surfaces on the TEACH
    // channel, not session.events — the sc-sig-controller-postures replay split.
    let s = createLessonSession(compileScenario(SC_ED_REVERSE_LINE, 3));
    const taught: string[] = [];
    recordScEdReverseLineDrive(loadDistrict("poligon-v1"), "mistake-no-look", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const scored = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(taught).toContain("MOVE_OFF_WITHOUT_OBSERVATION");
    // The reverse itself is clean: no curb contact anywhere in the drive.
    expect(taught).not.toContain("COLLISION");
    expect(scored).not.toContain("COLLISION");
  });

  it("compiles at every authored rung; L4 is the exam cold start; no L5", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_ED_REVERSE_LINE, level).id).toBe(`sc-ed-reverse-line@L${level}`);
    }
    expect(compileScenario(SC_ED_REVERSE_LINE, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_ED_REVERSE_LINE, 4).examMode).toBe(true);
    expect(SC_ED_REVERSE_LINE.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ed-reverse-line@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ed-reverse-line@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sc-fo-motorway-gap — the FO-01 following rule in the SPEED domain (mw-v1
//                      REUSED). The shadow settles at flow behind the lead
//                      holding the pinned ~72 m (≈ 2 s), then absorbs the firm
//                      brake and stops with a big margin. The bumper-rider fires
//                      FOLLOWING_TOO_CLOSE and then meets the brake with no
//                      metres — COLLISION (ЗДвП чл. 23).
// ---------------------------------------------------------------------------

describe("wave-8 bot completion — sc-fo-motorway-gap at L3", () => {
  const lesson = compileScenario(SC_FO_MOTORWAY_GAP, 3);
  let session = createLessonSession(lesson);
  recordScFoMotorwayGapDrive(loadDistrict("mw-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_FO_MOTORWAY_GAP.rubric!).stars).toBe(3);
  });

  it("stages ONE in-lane lead and arms the wet-gap detector template-wide", () => {
    // A single cutInLeadCar used as an in-lane decelerating lead (see the
    // template). followRainAwareEnabled is armed for all rungs but guards on
    // `raining`, so it only bites on the wet L5 rung — L1–L4 stay dry-innocent.
    expect((lesson.stagedEvents ?? []).map((e) => e.kind)).toEqual(["cutInLeadCar"]);
    expect(lesson.ruleConfig?.followRainAwareEnabled).toBe(true);
    expect(lesson.physics).toBeUndefined(); // dry base rung (ADR-006 stage 4a)
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-fo-motorway-gap@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-fo-motorway-gap@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: riding the bumper grades FOLLOWING_TOO_CLOSE + COLLISION, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_FO_MOTORWAY_GAP, 3));
    recordScFoMotorwayGapDrive(loadDistrict("mw-v1"), "mistake-bumper-crash", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("FOLLOWING_TOO_CLOSE");
    expect(codes).toContain("COLLISION");
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_FO_MOTORWAY_GAP.rubric!).stars).toBe(1);
  });

  it("compiles at every authored rung; L4 is the exam cold start, L5 is rain + wet grip", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_FO_MOTORWAY_GAP, level).id).toBe(`sc-fo-motorway-gap@L${level}`);
    }
    expect(compileScenario(SC_FO_MOTORWAY_GAP, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_FO_MOTORWAY_GAP, 4).examMode).toBe(true);
    expect(SC_FO_MOTORWAY_GAP.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    // L5 — мокра магистрала: real reduced grip on that rung ONLY (the base rungs
    // stay dry-tuned, ADR-006 stage 4a), and the wet-gap detector then bites.
    expect(compileScenario(SC_FO_MOTORWAY_GAP, 5).physics).toEqual({ wetGrip: true });
    // The lead rides every rung — it is the drill, not a complication.
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(
        (compileScenario(SC_FO_MOTORWAY_GAP, level).stagedEvents ?? []).map((e) => e.kind),
        `L${level}`,
      ).toEqual(["cutInLeadCar"]);
    }
  });
});
