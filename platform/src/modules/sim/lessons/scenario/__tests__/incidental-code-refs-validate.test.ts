/**
 * ADR-009 — `MistakeDemo.incidentalCodeRefs` IS REFUSED AT AUTHORING TIME
 * (doc 92 §3.4 + §8.2 T8e; founder Ruling A, 2026-09-17).
 *
 * WHY THIS FILE IS NOT OPTIONAL. `contracts.ts` types `LessonMistakeTarget.code`
 * as a plain string — it may not depend on `rules/` — and its docblock used to
 * end «and `lessons/scenario/validate.ts` refuses an uncatalogued code at
 * authoring time, so the looseness here costs nothing at runtime». Lane A had to
 * RETRACT that sentence, because the validator did not exist (doc 92 addendum 1
 * item 3), and measured what the looseness actually costs: one transposed pair
 * of letters and the code is carried into the target map intact, never matches a
 * graded or coached event, returns `null` from `lessonMistakeRuleBg` so the
 * student is never warned, and strips ADR-009 from that rung with no type error,
 * no failing test and no runtime warning.
 *
 * `incidentalCodeRefs` is the LAST door that could let such a code in, and it is
 * the one that opens outward: every other source is already checked (a demo's
 * `codeRefs` against VIOLATIONS six lines above the new block, the detector table
 * by its type and by T8b). Requiring every entry to be IN `codeRefs` closes it —
 * a typo is by definition not in `codeRefs`, and is reported by name.
 *
 * EVERY ASSERTION HERE WAS MUTATION-TESTED. Each refusal was deleted from a
 * scratch copy of validate.ts one at a time, and the case that must go red is
 * named in the comment above it. A guard nobody has watched fail is not a guard:
 * this repository has shipped three source scanners that were green and blind,
 * and lane A caught a fourth inside this very spec's suggested regex.
 */

import { describe, expect, it } from "vitest";

import { VIOLATIONS } from "../../../rules/catalog";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioSpec } from "../types";
import { ScenarioSpecError, assertScenarioSpec, validateScenarioSpec } from "../validate";

/**
 * A REAL template, deep-copied, with one demo's marker replaced. Real and not
 * hand-built on purpose: a synthetic spec would drift from what the validator
 * is actually handed, and a validator that only ever sees fixtures is how a
 * whole-spec gate ends up passing on something the compiler cannot compile.
 */
const BASE = SCENARIO_TEMPLATES.find((s) => s.id === "sc-ln-turn-lane-arrows")!;

function withMarker(value: unknown, demoIndex = 0): ScenarioSpec {
  const spec = structuredClone(BASE) as ScenarioSpec;
  // `unknown` on purpose: four of the six cases below are values TypeScript
  // would refuse, and they are exactly the ones the runtime guard exists for —
  // agent-authored specs reach `validateScenarioSpec` as data, not as typed
  // literals (see validate.ts's own header on why this layer is not zod).
  const demo = spec.mistakes[demoIndex] as unknown as { incidentalCodeRefs?: unknown };
  if (value === undefined) delete demo.incidentalCodeRefs;
  else demo.incidentalCodeRefs = value;
  return spec;
}

/** Only the errors this field is responsible for — the rest of the spec is valid. */
function markerErrors(spec: ScenarioSpec): string[] {
  return validateScenarioSpec(spec).filter((e) => e.includes("incidentalCodeRefs"));
}

describe("incidentalCodeRefs — the four refusals", () => {
  it("the shipped template validates, so a red below is the mutation and not the fixture", () => {
    expect(validateScenarioSpec(BASE)).toEqual([]);
    // …and the marker it ships is the real one, not an empty array that would
    // make every case below vacuous.
    expect(BASE.mistakes[0].incidentalCodeRefs).toEqual(["TURN_WITHOUT_INDICATOR", "POOR_LANE_KEEPING"]);
    expect(BASE.mistakes[0].codeRefs).toContain("WRONG_LANE_FOR_DIRECTION");
  });

  // MUTATION M-A: delete the `!Array.isArray(inc) || inc.some(...)` arm.
  // These four cases go red; the rest stay green (a bare string still fails the
  // codeRefs arm, character by character, but with an unreadable message).
  it("refuses a value that is not an array of strings", () => {
    for (const bad of ["POOR_LANE_KEEPING", 7, {}, null, true]) {
      const errs = markerErrors(withMarker(bad));
      expect(errs.length, `a ${typeof bad} marker was accepted: ${JSON.stringify(bad)}`).toBeGreaterThan(0);
      expect(errs[0]).toMatch(/must be an array of ViolationCode strings/);
    }
    // An array with a non-string member is the same defect one level down —
    // `["POOR_LANE_KEEPING", 3]` would otherwise reach `refs.includes(3)` and be
    // reported as a missing code rather than as a broken type.
    const mixed = markerErrors(withMarker(["POOR_LANE_KEEPING", 3]));
    expect(mixed[0]).toMatch(/must be an array of ViolationCode strings/);
  });

  // MUTATION M-B: delete the `!refs.includes(code)` arm. This case and the
  // uncatalogued-typo case below go red together — they are one refusal.
  it("refuses a code the demo does not grade", () => {
    const errs = markerErrors(withMarker(["SPEEDING_OVER_LIMIT"]));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/"SPEEDING_OVER_LIMIT" is not in this demo's codeRefs/);
    // The message names the codes that ARE there, so the fix needs no second look.
    expect(errs[0]).toContain("WRONG_LANE_FOR_DIRECTION");
  });

  // Same mutation as M-B. Stated separately because THIS is the case
  // `contracts.ts` cites: an uncatalogued code is refused because it cannot be
  // in `codeRefs`, which validate.ts has already checked against VIOLATIONS.
  it("refuses an uncatalogued code — the claim lane A had to retract", () => {
    expect("HARSH_BRAKIGN_NO_CAUSE" in VIOLATIONS).toBe(false);
    const errs = markerErrors(withMarker(["HARSH_BRAKIGN_NO_CAUSE"]));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/"HARSH_BRAKIGN_NO_CAUSE" is not in this demo's codeRefs/);
    // And it is refused by THROWING where the compiler stands, not merely listed:
    // `compileScenario` calls `assertScenarioSpec` first, so a typo can never
    // reach `deriveLessonMistakeTargets` through the product's own path.
    expect(() => assertScenarioSpec(withMarker(["HARSH_BRAKIGN_NO_CAUSE"]))).toThrow(ScenarioSpecError);
    expect(() => compileScenario(withMarker(["HARSH_BRAKIGN_NO_CAUSE"]), 3)).toThrow(/HARSH_BRAKIGN_NO_CAUSE/);
  });

  // MUTATION M-C: delete the `seen.has(code)` arm. Only this case goes red.
  it("refuses a duplicate", () => {
    const errs = markerErrors(withMarker(["TURN_WITHOUT_INDICATOR", "TURN_WITHOUT_INDICATOR"]));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/duplicate "TURN_WITHOUT_INDICATOR"/);
    // A duplicate of a code that is ALSO absent reports both, because they are
    // two different mistakes by the author.
    expect(markerErrors(withMarker(["SPEEDING_OVER_LIMIT", "SPEEDING_OVER_LIMIT"]))).toHaveLength(3);
  });

  // MUTATION M-D: delete the `refs.every(...)` arm. Only this case goes red —
  // and it is the one that matters most, because marking everything is how a
  // lesson opts out of ADR-009 without the diff saying so.
  it("refuses a demo whose every code is marked incidental", () => {
    const all = [...BASE.mistakes[0].codeRefs];
    const errs = markerErrors(withMarker(all));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/marks EVERY code this demo grades/);
    // Order must not matter, and neither must the route there.
    expect(markerErrors(withMarker([...all].reverse()))).toHaveLength(1);
  });

  // …AND A DUPLICATE IN codeRefs MUST NOT BUY THE OPT-OUT. Found by an
  // adversarial verifier: the guard also demanded `seen.size >= refs.length`,
  // so an author who repeated one code in codeRefs could mark every act the
  // demo grades and pass — 2 marked < 3 refs. The count, not the set, was
  // doing the deciding. MUTATION: restore ` seen.size >= refs.length &&` in
  // validate.ts and only this case goes red.
  it("refuses it even when codeRefs repeats a code, so the COUNT cannot excuse the SET", () => {
    const spec = withMarker(["TURN_WITHOUT_INDICATOR", "POOR_LANE_KEEPING"]);
    const demo = spec.mistakes[0] as unknown as { codeRefs: string[] };
    demo.codeRefs = ["TURN_WITHOUT_INDICATOR", "TURN_WITHOUT_INDICATOR", "POOR_LANE_KEEPING"];
    const errs = markerErrors(spec);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/marks EVERY code this demo grades/);
  });

  it("accepts the legitimate shapes — absent, and a proper subset", () => {
    expect(markerErrors(withMarker(undefined))).toEqual([]);
    expect(markerErrors(withMarker(["POOR_LANE_KEEPING"]))).toEqual([]);
    expect(markerErrors(withMarker([]))).toEqual([]);
    // An empty array is accepted and is a no-op, which is honest: it says
    // «looked, found nothing incidental». The derivation treats it as absent.
    const empty = compileScenario(withMarker([]), 3);
    const absent = compileScenario(withMarker(undefined), 3);
    expect(empty.lessonMistakeTargets).toEqual(absent.lessonMistakeTargets);
  });

  it("a legitimate marker actually removes the code from the compiled targets", () => {
    // The wiring, end to end: validate accepts it, compile derives past it, and
    // the lesson the student plays no longer costs him the lesson for that code.
    const marked = compileScenario(withMarker(["POOR_LANE_KEEPING", "TURN_WITHOUT_INDICATOR"]), 3);
    const unmarked = compileScenario(withMarker(undefined), 3);
    const codes = (l: typeof marked) => (l.lessonMistakeTargets ?? []).map((t) => t.code);
    expect(codes(unmarked)).toContain("POOR_LANE_KEEPING");
    expect(codes(unmarked)).toContain("TURN_WITHOUT_INDICATOR");
    expect(codes(marked)).not.toContain("POOR_LANE_KEEPING");
    expect(codes(marked)).not.toContain("TURN_WITHOUT_INDICATOR");
    // …and the act itself survives, or the marker would be a deletion.
    expect(codes(marked)).toContain("WRONG_LANE_FOR_DIRECTION");
  });

  it("the refusal is per demo, not per template", () => {
    // The second demo of this template carries no marker. Breaking it must name
    // `mistakes[1]`, or an author with four demos reads the wrong line.
    const errs = markerErrors(withMarker(["SPEEDING_OVER_LIMIT"], 1));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/^mistakes\[1\]\.incidentalCodeRefs/);
  });
});
