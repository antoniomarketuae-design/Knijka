/**
 * LINE TYPES + BUS LANES bot-completion proofs (ADR-006 stage 2b; the
 * s5-ban-bot-completion mold) — the two stage-2b templates (OV-04 escalation /
 * SN-05), each shadow driven through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization
 *   → gradeFinishWire RECOMPILES from the id and regrades → scoreRubric = 3★.
 *
 * Counter-proofs ride the same live pipeline: the taught code SURFACES
 * through the live rules and the shadow's positive signals are absent. The
 * bus-lane counter-proofs also lock the interplay from the guilty side —
 * riding the bus lane never trips the keep-right rule (laneId 0 IS the
 * rightmost), so the ONLY billed act is the bus-lane travel itself.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DriveScript, RecordedDrive } from "../../../traces/recorder";
import { recordScOvBusLaneDrive } from "../../../traces/scOvBusLane";
import {
  recordScOvSolidLineDrive,
  scOvSolidLineMistakeDriftScript,
  scOvSolidLineMistakePulloutScript,
} from "../../../traces/scOvSolidLine";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { lessonMistakeCopy } from "../../lessonMistake";
import { driveLiveRung, type LiveRungOutcome } from "./witnessLiveRung";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_OV_BUS_LANE, SC_OV_SOLID_LINE } from "../templates-lanes";
import type { ScenarioSpec } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

type OnTick = (tick: Parameters<typeof applyTick>[1]) => void;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;
}

interface DriveOutcome {
  session: LessonSessionState;
  result: LessonResult;
  drive: RecordedDrive;
}

function driveThroughSession(
  spec: ScenarioSpec,
  record: (district: unknown, onTick: OnTick) => RecordedDrive,
): DriveOutcome {
  const lesson = compileScenario(spec, 3);
  let session = createLessonSession(lesson);
  const drive = record(loadDistrict(spec.map.districtId), (tick) => {
    session = applyTick(session, tick).state;
  });
  return { session, result: buildLessonResult(session), drive };
}

function expectWireRoundTrip(spec: ScenarioSpec, outcome: DriveOutcome): void {
  const { session, result } = outcome;
  const graded = gradeFinishWire({
    lessonId: `${spec.id}@L3`,
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
  expect(graded.lesson.id).toBe(`${spec.id}@L3`);
  expect(graded.lesson).toEqual(scenarioLessonById(`${spec.id}@L3`));
  expect(graded.result.passed).toBe(true);
  expect(graded.result.score).toBe(0);
}

function driveViolationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}
function driveCommendationCodes(outcome: DriveOutcome): string[] {
  return outcome.drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code);
}

const CORRECT: Array<{ spec: ScenarioSpec; record: (d: unknown, onTick: OnTick) => RecordedDrive }> = [
  {
    spec: SC_OV_SOLID_LINE,
    record: (d, onTick) => recordScOvSolidLineDrive(d, "shadow-correct", { onTick }),
  },
  {
    spec: SC_OV_BUS_LANE,
    record: (d, onTick) => recordScOvBusLaneDrive(d, "shadow-correct", { onTick }),
  },
];

for (const { spec, record } of CORRECT) {
  describe(`LINE-TYPE bot completion — ${spec.id} („${spec.titleBg}“) correct attempt at L3`, () => {
    const outcome = driveThroughSession(spec, record);

    it("completes the session: every objective done, zero violations, passed", () => {
      expect(outcome.session.phase).toBe("completed");
      expect(outcome.result.completedAll).toBe(true);
      expect(outcome.result.passed).toBe(true);
      expect(outcome.result.score).toBe(0);
      expect(outcome.result.objectives.every((o) => o.done)).toBe(true);
      expect(outcome.session.events.filter((e) => e.kind === "violation")).toEqual([]);
    });

    it("the server regrades identically from the id alone (wire round-trip)", () => {
      expectWireRoundTrip(spec, outcome);
    });

    it("earns full stars from cleanliness (par time is informational only)", () => {
      const rubric = scoreRubric(outcome.result, spec.rubric!);
      expect(rubric.stars).toBe(3);
      const parTime = rubric.breakdownBg.find((l) => l.id === "parTime")!;
      expect(parTime.measured).toBe(true);
      expect(parTime.points).toBeNull();
    });
  });
}

describe("LINE-TYPE counter-proofs — stage-2b mistakes grade through the live pipeline", () => {
  it("signalled pull-out across the М1 line: CROSSED_SOLID_LINE surfaces, clean-driving absent", () => {
    const outcome = driveThroughSession(SC_OV_SOLID_LINE, (d, onTick) =>
      recordScOvSolidLineDrive(d, "mistake-pullout", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("CROSSED_SOLID_LINE");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("unsignalled drift across the М1 line: CROSSED_SOLID_LINE surfaces, and NEVER the touch tier", () => {
    const outcome = driveThroughSession(SC_OV_SOLID_LINE, (d, onTick) =>
      recordScOvSolidLineDrive(d, "mistake-drift", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("CROSSED_SOLID_LINE");
    expect(driveViolationCodes(outcome)).not.toContain("CENTER_LINE_TOUCHED");
  });

  it("full-span bus-lane cruise: DRIVING_IN_BUS_LANE surfaces, keep-right stays silent", () => {
    const outcome = driveThroughSession(SC_OV_BUS_LANE, (d, onTick) =>
      recordScOvBusLaneDrive(d, "mistake-cruise", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("DRIVING_IN_BUS_LANE");
    expect(driveViolationCodes(outcome)).not.toContain("NOT_KEEPING_RIGHT");
    expect(driveCommendationCodes(outcome)).not.toContain("CLEAN_DRIVING");
  });

  it("mid-span dip into the bus lane: DRIVING_IN_BUS_LANE surfaces, the general-lane objective still completes", () => {
    const outcome = driveThroughSession(SC_OV_BUS_LANE, (d, onTick) =>
      recordScOvBusLaneDrive(d, "mistake-dip-in", { onTick }),
    );
    expect(driveViolationCodes(outcome)).toContain("DRIVING_IN_BUS_LANE");
  });
});

// ---------------------------------------------------------------------------
// WITNESS — sc-ov-solid-line:3436a5e7 (critical): «The wrong drive scores 0
// наказателни точки … CROSSED_SOLID_LINE — the single fault code this lesson is
// built around — never fires. The lesson fails the student only for not
// reaching the end zone, never for the offence.»
//
// A WITNESS FOR A JUDGE, NOT A CLOSURE. Every live wrong leg filed against the
// row was flat-throttle and unsteered (w46/w47/w61: 0.03-0.55 m median off the
// CORRECT line), so the offence was never committed and the silence convicted
// nothing. The counter-proofs above show the code surfaces on the recorder's
// demo chain; THIS block drives the act through each RUNG the student actually
// gets (witnessLiveRung.ts: the compiled rung, live director seed, ambient
// baseline, createLessonSession → applyTick → buildLessonResult → buildDebrief)
// and asserts the three things the row denies:
//   1. CROSSED_SOLID_LINE FIRES, billed with the car's centre already across
//      the осева (x < 0) INSIDE zones[0] of ov-solid-v1 (ovs-e-street, fromM 90
//      → toM 230; the edge runs (0,0) → (0,340), so sM is y);
//   2. it is THE LESSON'S OWN MISTAKE (ADR-009 / Ruling A): taught free the
//      first time (ruling 16), folded into result.lessonMistakes, named under
//      «Грешката на този урок», and the lesson is NOT taken; on the exam rung
//      (L4, ADR-009-exempt) it is billed on the изпитен лист as основна 3 т.;
//   3. the offence ALONE fails the lesson: a driver who holds his lane through
//      the hold gate, crosses the М1 AFTER it and comes home completes EVERY
//      objective — and is still not taken. That is the opposite of «fails only
//      for not reaching the end zone».
// KILL-CHECKS (each reddens this block; restored, sha-verified):
//   · rules/engine.ts solidCrossCond → never true (`false && …`);
//   · lessons/lessonMistake.ts foldLessonMistakes → returns [] (no fold).
// ---------------------------------------------------------------------------

/** ov-solid-v1's own-lane centre (meta.scenario.laneCenterRightM). */
const OVS_X = 4.06;
const OVS_ZONE = { fromY: 90, toY: 230 };

/**
 * „Издържах — и после все пак." Holds the lane through sc-ovsl-hold (y = 160),
 * then a signalled pull-out fully across the М1 at y ≈ 180-200 — still deep in
 * the span — and home before it ends, on to the finish disc at y = 310.
 */
function holdThenCrossScript(): DriveScript {
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[OVS_X, 15], [OVS_X, 90], [OVS_X, 168]], targetKmh: 32, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[OVS_X, 168], [-2.5, 188]], targetKmh: 25, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[-2.5, 188], [-2.5, 196]], targetKmh: 25, stopAtEnd: false },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[-2.5, 196], [OVS_X, 218]], targetKmh: 25, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[OVS_X, 218], [OVS_X, 310]], targetKmh: 32 },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

const OVS_WRONG_ACTS: Array<{ name: string; script: () => DriveScript }> = [
  { name: "mistake-pullout (the committed demo)", script: scOvSolidLineMistakePulloutScript },
  { name: "mistake-drift (the committed demo)", script: scOvSolidLineMistakeDriftScript },
  { name: "hold-then-cross (authored here)", script: holdThenCrossScript },
];

/** The tick the first CROSSED_SOLID_LINE occurrence (coached or scored) was billed on. */
function solidBillTick(o: LiveRungOutcome): { t: number; x: number; y: number } {
  const coachedT = (o.result.coachedMistakes ?? []).find((c) => c.code === "CROSSED_SOLID_LINE")?.t;
  const scoredT = o.session.events.find((e) => e.kind === "violation" && e.code === "CROSSED_SOLID_LINE")?.t;
  const t = Math.min(coachedT ?? Infinity, scoredT ?? Infinity);
  expect(Number.isFinite(t), "CROSSED_SOLID_LINE was billed somewhere").toBe(true);
  const tk = o.ticks.reduce((b, k) => (Math.abs(k.t - t) < Math.abs(b.t - t) ? k : b));
  return { t, x: tk.position.x, y: tk.position.y };
}

describe("WITNESS sc-ov-solid-line:3436a5e7 — the crossing fires, inside the М1 span, and is the lesson's own mistake at every rung", () => {
  for (const act of OVS_WRONG_ACTS) {
    for (const level of [1, 2, 3, 5] as const) {
      it(`${act.name} @L${level}: CROSSED_SOLID_LINE taught inside zones[0], folded as the lesson mistake, НЕ Е ВЗЕТ, named in the debrief`, () => {
        const o = driveLiveRung(SC_OV_SOLID_LINE, level, act.script());
        // 1 — it fires, with the car across the осева, inside the authored span.
        const bill = solidBillTick(o);
        expect(bill.y).toBeGreaterThanOrEqual(OVS_ZONE.fromY);
        expect(bill.y).toBeLessThanOrEqual(OVS_ZONE.toY);
        expect(bill.x).toBeLessThan(0);
        // …exactly once per excursion, and never the touch tier on top.
        expect([...o.taught, ...o.scored].filter((c) => c === "CROSSED_SOLID_LINE")).toHaveLength(1);
        expect(o.scored).not.toContain("CENTER_LINE_TOUCHED");
        // 2 — first-fault grace (ruling 16): shown with a card, not charged…
        expect(o.taught).toContain("CROSSED_SOLID_LINE");
        expect(o.scored).not.toContain("CROSSED_SOLID_LINE");
        // …and Ruling A: the lesson's own target, folded, so the lesson is not taken.
        expect(o.lesson.lessonMistakeTargets?.map((t) => t.code)).toEqual(["CROSSED_SOLID_LINE"]);
        const hit = (o.result.lessonMistakes ?? []).find((h) => h.code === "CROSSED_SOLID_LINE");
        expect(hit).toBeDefined();
        expect(hit!.charged).toBe(false);
        expect(o.result.passed).toBe(false);
        expect(scoreRubric(o.result, SC_OV_SOLID_LINE.rubric!).stars).toBe(1);
        // THEO-4 — the debrief names the act, why, and what to do instead.
        const copy = lessonMistakeCopy(hit!)!;
        expect(o.debrief).toContain(
          "Грешката на този урок (при първа поява не влиза в наказателните точки, но урокът не се зачита):",
        );
        expect(o.debrief).toContain(`• ${copy.titleBg}`);
        expect(o.debrief).toContain(`→ Правилното действие: ${copy.correctiveBg}`);
        expect(o.debrief).toContain("точно грешката, която този урок учи");
      });
    }

    it(`${act.name} @L4 (exam, ADR-009-exempt): CROSSED_SOLID_LINE is billed on the изпитен лист — основна, 3 т.`, () => {
      const o = driveLiveRung(SC_OV_SOLID_LINE, 4, act.script());
      const bill = solidBillTick(o);
      expect(bill.y).toBeGreaterThanOrEqual(OVS_ZONE.fromY);
      expect(bill.y).toBeLessThanOrEqual(OVS_ZONE.toY);
      expect(o.taught).toEqual([]);
      const billed = o.result.summary.mistakes.filter((m) => m.code === "CROSSED_SOLID_LINE");
      expect(billed).toHaveLength(1);
      expect(billed[0].severityClass).toBe("osnovna");
      expect(billed[0].points).toBe(3);
      expect(o.result.lessonMistakes ?? []).toEqual([]);
    });
  }

  it("the offence ALONE fails the lesson: hold-then-cross completes EVERY objective and is still not taken (L1-L3, L5)", () => {
    for (const level of [1, 2, 3, 5] as const) {
      const o = driveLiveRung(SC_OV_SOLID_LINE, level, holdThenCrossScript());
      expect(o.done, `L${level}`).toEqual({ "sc-ovsl-hold": true, "sc-ovsl-finish": true });
      expect(o.result.completedAll, `L${level}`).toBe(true);
      expect(o.session.phase, `L${level}`).toBe("completed");
      // No objective is missing — so the only ground left for «не е взет» is the act.
      expect((o.result.lessonMistakes ?? []).map((h) => h.code), `L${level}`).toEqual(["CROSSED_SOLID_LINE"]);
      expect(o.result.passed, `L${level}`).toBe(false);
      expect(o.debrief, `L${level}`).not.toContain("останаха неизпълнени задачите");
    }
  });
});
