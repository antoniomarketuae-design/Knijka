/**
 * ADR-009 — DERIVING A PRACTICE LESSON'S OWN-MISTAKE TARGETS (founder Ruling A,
 * 2026-09-17; doc `docs/simulation/92_ADR009_LESSON_MISTAKE_SPEC.md` §2, §3.4).
 *
 * The ruling: commit the mistake a practice lesson exists to teach and the lesson
 * is NOT taken, even the first time. This module answers the question that ruling
 * makes load-bearing — WHICH mistake is that, for each of 646 practice rungs — and
 * it answers it from data the templates already carry, never from a hand-written
 * list.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY DERIVED AND NOT AUTHORED
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A hand-authored `lessonMistakeTargets` on 167 templates is 167 chances to hang
 * "you have not taken this lesson" on a code the lesson does not teach, and no
 * gate could tell a wrong entry from a right one. Both sources below are fields
 * an author already writes for a different, independently checked reason, so a
 * target is a consequence of the template rather than an opinion about it:
 *
 *   D. `MistakeDemo.codeRefs` — «codes the demo trace MUST grade when replayed»
 *      (types.ts), validated against the catalogue in validate.ts and asserted by
 *      every `traces/__tests__/*-traces.test.ts`. The author put the code on the
 *      demo: the demo IS the lesson's mistake. Minus `incidentalCodeRefs`, the
 *      one escape hatch, which validate.ts constrains to a proper subset.
 *   A. A detector the template ARMED — a `ruleConfig` key whose default is
 *      `false` compiled to `true`. `compile.ts` states the intent where it
 *      carries the key: «so the student's own attempt grades the taught fault».
 *      See `rules/detectorOptIns.ts` for why this is keyed on the VALUE.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE ОПАСНА FILTER IS NOT A LENIENCY
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Dropping опасна and session-terminating codes looks like it weakens the ruling
 * and does the opposite. `scenarios/policy.ts policyForViolation` already returns
 * `always-grade` for them: they are billed on FIRST sight today, with no teach
 * step, so ADR-009 has nothing to change about them. Keeping them would instead
 * make a CONSEQUENCE read as the lesson's own act — COLLISION is cited by 98 of
 * the 336 authored mistake demos, across 71 lessons (counted over the
 * templates' own `codeRefs` arrays, 2026-09-18; an earlier draft of this line
 * said «39 demos in 38 lessons», which reproduced nothing), and «you crashed»
 * is the result of the mistake, not the mistake.
 * Doc 92 §2.3 R5: those 62 lessons resolve to an empty set and carry no field at
 * all, which is byte-for-byte today's behaviour.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * It does not read objective titles, concept ids, law refs or `require*Clean`
 * demands. Doc 92 §2.1 measured each: title keywords and concepts lose 59 targets
 * to overlap, and every demand code is already in D ∪ A (`demandNotCovered: 0`,
 * re-asserted here by T8d). A second source that adds nothing is a second place
 * for the answer to drift.
 */

import type { LessonMistakeTarget } from "../../contracts";
import { VIOLATIONS } from "../../rules/catalog";
import { DETECTOR_OPT_IN_CODES, armsDetector } from "../../rules/detectorOptIns";
import type { RuleEngineConfig } from "../../rules/types";
import { MAX_LESSON_MISTAKE_TARGETS } from "../lessonMistake";
import { ScenarioCompileError } from "./compile";
import type { ScenarioLevel, ScenarioSpec } from "./types";

/**
 * Derive the ADR-009 target codes for ONE compiled rung.
 *
 * @param spec               the template
 * @param level              the rung, for the error messages only — the rung's
 *                           own contribution arrives already merged in
 *                           `compiledRuleConfig`, which is what makes "no
 *                           lesson's set differs between its practice rungs"
 *                           (doc 92 §2.2) a measurement rather than an assumption
 * @param compiledRuleConfig `{...spec.ruleConfig, ...rung.ruleConfig}` as
 *                           `compile.ts` merges it — NEVER `spec.ruleConfig`
 *                           alone, or a rung that disarms a detector would still
 *                           be told it armed one
 * @param examMode           the rung's compiled exam flag (`rungExamMode`), not
 *                           `rung.examMode`: the ladder default is `level === 4`
 *
 * Returns `[]` for an exam rung and for a lesson with no targets; `compile.ts`
 * writes no field in either case, and absent is today's behaviour.
 */
export function deriveLessonMistakeTargets(
  spec: ScenarioSpec,
  level: ScenarioLevel,
  compiledRuleConfig: Partial<RuleEngineConfig>,
  examMode: boolean,
): LessonMistakeTarget[] {
  // Ruling A is about PRACTICE. The exam rung grades the way the official exam
  // grades, and doc 92 §9 pass criterion 5 is 488 L4 drives graded identically.
  if (examMode) return [];

  // ── D. Demos, by DISTINCT trace path.
  //
  // The identity is `traceRef.path` and not the array index, because `demoTitleBg`
  // is written only when EXACTLY ONE demo cites a code (doc 92 §1 graft 19): two
  // entries pointing at one recording are one demonstration, and counting them as
  // two would suppress the author's own name for the act on the reasoning that it
  // is ambiguous — when it is the same name twice.
  const demoCodes = new Map<string, Set<string>>(); // code -> distinct demo paths citing it
  const demoTitleByPath = new Map<string, string>();
  for (const demo of spec.mistakes ?? []) {
    const path = demo.traceRef?.path ?? "";
    demoTitleByPath.set(path, demo.titleBg);
    const incidental = new Set(demo.incidentalCodeRefs ?? []);
    for (const code of demo.codeRefs ?? []) {
      if (incidental.has(code)) continue;
      let paths = demoCodes.get(code);
      if (paths === undefined) demoCodes.set(code, (paths = new Set()));
      paths.add(path);
    }
  }

  // ── A. Detectors this rung ARMED.
  const detectorCodes = new Set<string>();
  for (const key of Object.keys(DETECTOR_OPT_IN_CODES) as (keyof RuleEngineConfig)[]) {
    if (!armsDetector(key, compiledRuleConfig[key])) continue;
    for (const code of DETECTOR_OPT_IN_CODES[key] ?? []) detectorCodes.add(code);
  }

  const targets: LessonMistakeTarget[] = [];
  for (const code of new Set([...demoCodes.keys(), ...detectorCodes])) {
    const spec_ = VIOLATIONS[code as keyof typeof VIOLATIONS];
    if (spec_ === undefined) {
      // SECOND LINE, NOT THE FIRST. Every door into this loop is already checked
      // at authoring time — `codeRefs` and `incidentalCodeRefs` by validate.ts,
      // `DETECTOR_OPT_IN_CODES` by its type and by T8b — so reaching here through
      // `compileScenario` should be impossible. It is an error and not a silent
      // `continue` because the alternative is the failure mode doc 92 addendum 1
      // measured: a code that matches nothing, warns nobody, and strips ADR-009
      // from the rung while every test stays green.
      throw new ScenarioCompileError(
        spec.id,
        level,
        `ADR-009: "${code}" is not a rules-catalog ViolationCode, so it can never match a graded or coached ` +
          `event — the lesson would silently lose its own mistake. Fix the code in the demo's codeRefs or in ` +
          `rules/detectorOptIns.ts.`,
      );
    }
    // Already graded on first sight (scenarios/policy.ts:77) — nothing for the
    // ruling to change, and a consequence is not the act. See the header.
    if (spec_.severityClass === "opasna" || spec_.terminateSession === true) continue;

    const paths = demoCodes.get(code);
    const target: LessonMistakeTarget = {
      code,
      source: paths !== undefined && paths.size > 0 ? "demo" : "detector",
    };
    if (paths !== undefined && paths.size === 1) {
      const titleBg = demoTitleByPath.get([...paths][0]);
      if (titleBg !== undefined) target.demoTitleBg = titleBg;
    }
    targets.push(target);
  }

  // Sorted by code so the compiled lesson is byte-stable: the golden snapshot in
  // compile.test.ts and the fixture in T8a both compare structure, and an order
  // that followed the authoring order would churn on an unrelated demo re-order.
  targets.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  // A CAP IS A REFUSAL, NEVER A TRUNCATION (doc 92 §3.4). Silently dropping the
  // ninth target would mean the student is told about eight mistakes and judged
  // on the same eight, while a ninth act the author wrote a demo for costs him
  // nothing and appears nowhere — the lesson quietly disagreeing with itself.
  // The measured maximum across all 167 templates is 4 (`sc-rb-lane-choice`), so
  // this fires only for a template that has changed shape, which is exactly when
  // a human should look.
  if (targets.length > MAX_LESSON_MISTAKE_TARGETS) {
    throw new ScenarioCompileError(
      spec.id,
      level,
      `ADR-009: ${targets.length} own-mistake targets exceeds MAX_LESSON_MISTAKE_TARGETS=${MAX_LESSON_MISTAKE_TARGETS} ` +
        `(${targets.map((t) => t.code).join(", ")}). A lesson that costs a pass for nine different acts is not one ` +
        `lesson — split the template, or mark the side effects with incidentalCodeRefs.`,
    );
  }

  return targets;
}
