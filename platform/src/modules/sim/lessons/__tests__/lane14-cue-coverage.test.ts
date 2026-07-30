/**
 * D9 / D11 — CUE COVERAGE over the real catalog (founder review 2026-07-30).
 *
 * The ledger's §6 verdict on both cues was the same sentence: „ALREADY BUILT …
 * he did not see them". Neither was missing; both were gated down to almost
 * nothing. This file is the census that keeps them from being re-gated:
 *
 *  · GLANCE PINGS („◄ огледай") were live on **6 of 679 authored rungs**
 *    (3 templates: SC_JUNCTION_SCAN, SC_JX_PRIORITY_CONFIDENCE and the exam
 *    drill, which `examMode` then disqualified) and on **0 curriculum
 *    lessons** — including Урок 2 „Кръстовища и предимство", the lesson he was
 *    playing when he asked for them. The flag is out of the gate; arming stays
 *    world-driven (a Б1/Б2 stop line inside 45 m), which the derivation tests
 *    in glance-pings.test.ts pin.
 *
 *  · The „виж мястото отгоре" cue is new, and its whole risk is over-firing.
 *    It resolves from the authored objective params, so the census below is
 *    also the proof that it lands on the bay/turn drills and nowhere else.
 */

import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../contracts";
import { cameraAidHintEligible, lessonHasOverheadManeuver } from "../../hud/overheadHint";
import { glancePingsEligible } from "../advisor";
import { SCENARIO_TEMPLATES } from "../scenario";
import { compileScenario } from "../scenario/compile";
import { parseScenarioLessonId } from "../scenario/resolve";
import { EXAM_LESSON, LESSONS } from "../specs";

/** Every authored rung of every template, compiled the way the shell does. */
const RUNGS: readonly LessonSpec[] = SCENARIO_TEMPLATES.flatMap((spec) =>
  spec.levels.map((lvl) => compileScenario(spec, lvl.level)),
);

const templateIdOf = (lesson: LessonSpec): string => lesson.id.split("@")[0];

describe("glance pings — coverage after the D9 widening", () => {
  it("is exactly 'teaching rung, not an exam' on every compiled rung", () => {
    for (const lesson of RUNGS) {
      const level = parseScenarioLessonId(lesson.id)?.level ?? 0;
      const expected = lesson.examMode !== true && level <= 3;
      expect(glancePingsEligible(lesson), lesson.id).toBe(expected);
    }
  });

  it("covers hundreds of rungs where it used to cover six", () => {
    const eligible = RUNGS.filter(glancePingsEligible);
    // Measured 2026-07-30: 465 of 679 rungs, 155 of 155 templates (the
    // remainder are the L4 exam rungs and the L5 „Усложнени" rungs).
    expect(eligible.length).toBeGreaterThanOrEqual(400);
    expect(new Set(eligible.map(templateIdOf)).size).toBe(SCENARIO_TEMPLATES.length);

    // The old gate, reconstructed: the JU-23 opt-in AND rungs L1–L2.
    const oldGate = RUNGS.filter(
      (l) =>
        l.ruleConfig?.junctionScanObservationEnabled === true &&
        l.examMode !== true &&
        (parseScenarioLessonId(l.id)?.level ?? 0) <= 2,
    );
    expect(oldGate.length).toBeLessThanOrEqual(10);
    expect(eligible.length).toBeGreaterThan(oldGate.length * 40);
  });

  it("reaches every curriculum lesson, and never the exam", () => {
    for (const lesson of LESSONS) expect(glancePingsEligible(lesson), lesson.id).toBe(true);
    expect(glancePingsEligible(EXAM_LESSON)).toBe(false);
    // Урок 2 — the lesson of his report — by name, not by count.
    const l2 = LESSONS.find((l) => l.id === "l2-intersections");
    expect(l2).toBeDefined();
    expect(glancePingsEligible(l2 as LessonSpec)).toBe(true);
  });
});

describe("'виж мястото отгоре' — coverage of the D11 cue", () => {
  it("lands on the bay / three-point-turn drills and nowhere else", () => {
    for (const lesson of RUNGS) {
      const level = parseScenarioLessonId(lesson.id)?.level ?? 0;
      const expected =
        lessonHasOverheadManeuver(lesson) && lesson.examMode !== true && level <= 3;
      expect(cameraAidHintEligible(lesson, true), lesson.id).toBe(expected);
    }
  });

  it("covers the four parking lessons he reviewed, plus the turn drills", () => {
    const ids = new Set(RUNGS.filter((l) => cameraAidHintEligible(l, true)).map(templateIdOf));
    // His parking list 1–4, in his order.
    for (const id of ["sc-park-perp-rev", "sc-park-parallel", "sc-park-45", "sc-park-narrow"]) {
      expect(ids.has(id), id).toBe(true);
    }
    // The same problem with more kerbs.
    for (const id of ["sc-maneuver-3point", "sc-maneuver-uturn"]) {
      expect(ids.has(id), id).toBe(true);
    }
    // Measured 2026-07-30: 9 templates / 27 rungs — a narrow cue, by design.
    expect(ids.size).toBeLessThanOrEqual(20);
    expect(cameraAidHintEligible(EXAM_LESSON, true)).toBe(false);
  });

  it("covers Урок 7 'Паркиране' — the curriculum bay lesson", () => {
    const l7 = LESSONS.find((l) => l.id === "l7-parking");
    expect(l7).toBeDefined();
    expect(cameraAidHintEligible(l7 as LessonSpec, true)).toBe(true);
    // …and is silenced on any rung that has locked the overhead view out.
    expect(cameraAidHintEligible(l7 as LessonSpec, false)).toBe(false);
  });

  it("never fires on a lesson with no maneuver to look down on", () => {
    const l2 = LESSONS.find((l) => l.id === "l2-intersections") as LessonSpec;
    expect(lessonHasOverheadManeuver(l2)).toBe(false);
    expect(cameraAidHintEligible(l2, true)).toBe(false);
  });
});
