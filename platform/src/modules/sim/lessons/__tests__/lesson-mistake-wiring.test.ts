/**
 * ADR-009 T1 — THE WIRING: what the compiler derived actually reaches the
 * verdict, and what it deliberately did not derive actually does not (founder
 * Ruling A, 2026-09-17; spec `docs/simulation/92_ADR009_LESSON_MISTAKE_SPEC.md`
 * §8.1 T1a–T1d).
 *
 * WHY THIS IS A SEPARATE FILE FROM LANE B'S DERIVATION SUITE.
 * `lessons/scenario/__tests__/lesson-mistake-targets.test.ts` pins the TABLE —
 * 808 rungs against a committed fixture, the three incidental markers, the
 * seven detector opt-ins, the policy resolution. Every one of those assertions
 * would stay green on a build where `LessonSpec.lessonMistakeTargets` is written
 * and NOTHING READS IT. That is the dead-predicate shape this programme has
 * measured 51 times in 82 repairs, and it is the shape a derivation suite cannot
 * see by construction. So this file asks the other question, through the engine:
 * does the derived row change the student's verdict?
 *
 * THE FOUR, and the control each carries:
 *   T1a  a MARKED incidental code (`incidentalCodeRefs`) does NOT cost the
 *        lesson — beside the act on the same demo, which does;
 *   T1b  an ARMED DETECTOR's code, on no demo at all, DOES cost the lesson —
 *        the source that reaches 5 codes nothing else would;
 *   T1c  an ordinary incidental mistake keeps teach-first, byte for byte;
 *   T1d  the 64-lesson case, driven: an incidental code first, then a TARGET of
 *        the SAME TOPIC. Before ADR-009 the second was graded on sight with no
 *        card — the act the lesson is about, delivered as a bare verdict.
 */

import { describe, expect, it, vi } from "vitest";

import type { LessonSpec } from "../../contracts";
import { makeViolation, type ScorableEvent } from "../../rules";
import { foldLessonMistakes } from "../lessonMistake";
import { compileScenario } from "../scenario/compile";
import { scenarioById } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { CoachedMistake } from "../types";
import { makeTick } from "./fixtures";

/** The compiled practice rung a learner actually plays. */
function practice(id: string, level: ScenarioLevel = 3): LessonSpec {
  const spec = scenarioById(id);
  expect(spec, `${id} must still be in the catalogue`).toBeDefined();
  return compileScenario(spec!, level);
}

const targetCodes = (lesson: LessonSpec): string[] =>
  (lesson.lessonMistakeTargets ?? []).map((t) => t.code);

/** One coached row, the shape `recordCoached` builds. */
const coached = (code: string, t: number): CoachedMistake => ({
  code,
  titleBg: makeViolation(code as never, t).titleBg,
  t,
});

/** One charged row, the shape the ledger carries. */
const charged = (code: string, t: number): ScorableEvent => makeViolation(code as never, t);

// ---------------------------------------------------------------------------
// T1a — THE MARKER: a code the template's own source calls a side effect
// ---------------------------------------------------------------------------

describe("T1a the incidental marker reaches the verdict (and the act beside it does too)", () => {
  // `templates-cockpit.ts` marks NOT_KEEPING_RIGHT incidental on
  // `sc-vp-police-stop/mistake-drive-past`: the demo drives past the officer and
  // drifts left as a SIDE EFFECT of driving past him. The act the lesson teaches
  // is ignoring the signal.
  const lesson = practice("sc-vp-police-stop");

  it("the marked code is off the list and the act is on it", () => {
    expect(targetCodes(lesson)).toContain("POLICE_STOP_SIGNAL_IGNORED");
    expect(targetCodes(lesson)).not.toContain("NOT_KEEPING_RIGHT");
  });

  it("…so a drive that only drifts left keeps its pass, and one that ignores the signal loses it", () => {
    // The pair, through the one function that decides the verdict. Same lesson,
    // same channel, same time — only the code differs, so nothing but the
    // marker can explain the two answers.
    expect(foldLessonMistakes(lesson, [], [coached("NOT_KEEPING_RIGHT", 12)])).toEqual([]);
    expect(
      foldLessonMistakes(lesson, [], [coached("POLICE_STOP_SIGNAL_IGNORED", 12)]),
    ).toEqual([expect.objectContaining({ code: "POLICE_STOP_SIGNAL_IGNORED" })]);
  });

  it("M5 — remove the marker from the compiled rung and the drift starts costing the lesson", () => {
    // The mutation the spec names, run on a COPY: this is what the template's
    // one `incidentalCodeRefs` line is buying, stated as a difference rather
    // than as a comment.
    const withoutMarker: LessonSpec = {
      ...lesson,
      lessonMistakeTargets: [
        ...(lesson.lessonMistakeTargets ?? []),
        { code: "NOT_KEEPING_RIGHT", source: "demo" as const },
      ],
    };
    expect(foldLessonMistakes(withoutMarker, [], [coached("NOT_KEEPING_RIGHT", 12)])).toEqual([
      expect.objectContaining({ code: "NOT_KEEPING_RIGHT" }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// T1b — THE ARMED DETECTOR: a target no demo cites
// ---------------------------------------------------------------------------

describe("T1b an armed detector's code reaches the verdict, though no demo names it", () => {
  // `sc-follow-tailgater` arms `needlessStopEnabled`, and the template says why:
  // «so the student's own attempt grades the taught fault». STOPPED_WITHOUT_CAUSE
  // appears on no ❌ demo of this lesson, so the demo source alone would miss it
  // — one of the 5 codes this source is the only route for.
  const lesson = practice("sc-follow-tailgater");

  it("the detector's code is a target although the demos never grade it", () => {
    expect(targetCodes(lesson)).toContain("STOPPED_WITHOUT_CAUSE");
  });

  it("…and stamping on the brakes to punish the tailgater costs the lesson", () => {
    expect(foldLessonMistakes(lesson, [], [coached("STOPPED_WITHOUT_CAUSE", 21)])).toEqual([
      expect.objectContaining({ code: "STOPPED_WITHOUT_CAUSE", charged: false }),
    ]);
  });

  it("M6 — a lesson that did NOT arm the detector is untouched by the same drive", () => {
    // `sc-follow-brake` is the control: same family of lesson, same code, no
    // opt-in. If this ever reported a hit, the derivation has stopped being
    // keyed on the arming and the case above proves nothing.
    const unarmed = practice("sc-follow-brake");
    expect(targetCodes(unarmed)).not.toContain("STOPPED_WITHOUT_CAUSE");
    expect(foldLessonMistakes(unarmed, [], [coached("STOPPED_WITHOUT_CAUSE", 21)])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T1c — AN ORDINARY INCIDENTAL MISTAKE IS UNTOUCHED
// ---------------------------------------------------------------------------

describe("T1c an incidental mistake keeps teach-first and keeps the pass", () => {
  it("a code this lesson does not teach never enters the verdict, on either channel", () => {
    const lesson = practice("sc-vu-pass-clearance");
    expect(targetCodes(lesson)).toEqual(["VULNERABLE_PASS_TOO_CLOSE"]);
    // Coached AND charged, both — the fold reads both records, so „untouched"
    // has to be shown on both or it is only half a claim.
    expect(
      foldLessonMistakes(
        lesson,
        [charged("HARSH_BRAKING_NO_CAUSE", 30)],
        [coached("SPEEDING_OVER_LIMIT", 12)],
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T1d — THE 64-LESSON CASE, DRIVEN THROUGH `applyTick`
// ---------------------------------------------------------------------------

/**
 * `reduceTick` is mocked so two specific violations arrive on two consecutive
 * ticks. NOTHING ELSE about the engine is mocked: the coach, the teach arm, the
 * coached record and `buildLessonResult` are the shipped ones.
 *
 * WHY A MOCK IS THE HONEST INSTRUMENT HERE, and not a shortcut. The census of
 * all 2,434 committed drives contains ZERO incidental-then-target sequences —
 * the authored ❌ demos commit one act each, deliberately. So this path cannot
 * be reached from a tape, and the choice is between proving it by construction
 * and not proving it at all. Its live frequency is a content question (64 of the
 * 105 target lessons CAN reach it); its correctness is this file's.
 *
 * `sc-ov-keep-right@L3` is the lesson: NOT_KEEPING_RIGHT is its derived target,
 * POOR_LANE_KEEPING is not, and both map to `ev-lane-discipline` — one topic,
 * one free teach, which is the whole mechanism under test.
 */
describe("T1d incidental first, then the TARGET of the same topic", () => {
  const INCIDENTAL = "POOR_LANE_KEEPING";
  const TARGET = "NOT_KEEPING_RIGHT";

  async function driveTwoTicks(tweak?: (l: LessonSpec) => LessonSpec) {
    vi.resetModules();
    const rules = await vi.importActual<typeof import("../../rules")>("../../rules");
    const scripted = [
      [rules.makeViolation(INCIDENTAL, 1)],
      [rules.makeViolation(TARGET, 2)],
    ];
    let call = 0;
    vi.doMock("../../rules", () => ({
      ...rules,
      reduceTick: (state: unknown) => ({ state, events: scripted[call++] ?? [] }),
    }));
    const engine = await import("../engine");
    const compile = await import("../scenario/compile");
    const templates = await import("../scenario/templates");
    const base = compile.compileScenario(templates.scenarioById("sc-ov-keep-right")!, 3);
    const lesson = tweak === undefined ? base : tweak(base);
    // The two codes share `ev-lane-discipline`, which is the premise of the
    // whole case — asserted, not assumed, so a mapping change reds here rather
    // than quietly turning this into two independent teaches.
    const mapping = await import("../../scenarios/mapping");
    expect(mapping.scenarioForCode(INCIDENTAL)).toBe(mapping.scenarioForCode(TARGET));
    expect((lesson.lessonMistakeTargets ?? []).map((t) => t.code)).toEqual(
      tweak === undefined ? [TARGET] : [],
    );

    let session = engine.createLessonSession(lesson);
    const teachMoments: { code: string; lessonMistake?: true }[] = [];
    for (const t of [1, 2]) {
      const step = engine.applyTick(session, makeTick({ t, speedKmh: 40 }));
      session = step.state;
      for (const m of step.teachMoments ?? []) teachMoments.push(m);
    }
    vi.doUnmock("../../rules");
    return { result: engine.buildLessonResult(session), teachMoments };
  }

  it("the target is TAUGHT, costs nothing, gets a card, and the lesson is not taken", () => {
    return driveTwoTicks().then(({ result, teachMoments }) => {
      // The incidental code spent the topic's single free lesson…
      expect(teachMoments.map((m) => m.code)).toContain(INCIDENTAL);
      // …and the target still got its own card, under its own code.
      const card = teachMoments.find((m) => m.code === TARGET);
      expect(card, "the lesson's own mistake must never arrive without a card").toBeDefined();
      expect(card!.lessonMistake).toBe(true);
      // No points for it (Ruling A), and it is on the coached record, which is
      // the only place a never-charged fault can be.
      expect(result.summary.mistakes.map((m) => m.code)).not.toContain(TARGET);
      expect((result.coachedMistakes ?? []).map((c) => c.code)).toContain(TARGET);
      // …and the verdict.
      expect((result.lessonMistakes ?? []).map((h) => h.code)).toEqual([TARGET]);
      expect(result.passed).toBe(false);
    });
  });

  it("M12 control — with no targets the SAME two ticks charge it and print no card", () => {
    // The pre-ADR-009 answer, reached by removing the one field: the topic was
    // spent, so the act the lesson teaches is graded on sight — points, and
    // nothing on the glass to explain them. That is the defect, driven.
    return driveTwoTicks((l) => {
      const copy = { ...l };
      delete (copy as { lessonMistakeTargets?: unknown }).lessonMistakeTargets;
      return copy;
    }).then(({ result, teachMoments }) => {
      expect(teachMoments.map((m) => m.code)).not.toContain(TARGET);
      expect(result.summary.mistakes.map((m) => m.code)).toContain(TARGET);
      expect(result.score).toBeGreaterThan(0);
      expect(result.lessonMistakes).toBeUndefined();
    });
  });
});
