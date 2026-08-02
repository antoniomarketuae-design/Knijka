/**
 * THEO-3 — the mistake-experience compile opt-in (doc 64).
 *
 * Battery:
 *  1. ABSENT = BIT-IDENTICAL: compileScenario without opts, with {} and with
 *     { mistakeExperience: undefined } produce byte-equal LessonSpecs across
 *     EVERY template × authored rung, and no normal compile ever carries the
 *     mistakeExperience key or a `~m` id (exams/drills untouched).
 *  2. The mode delta: `~m<i>` id (foreign to the rung namespace — the wire
 *     must refuse it), the „do the wrong thing" instruction copy (fixed
 *     lead-in + STORED mistake title), the denormalized target codes,
 *     examMode dropped, everything else inherited unchanged.
 *  3. compileMistakeExperience = lowest authored rung + the opt-in.
 *  4. Out-of-range indexes throw ScenarioCompileError.
 *  5. Id round-trip: mistakeExperienceLessonId ⇄ parseMistakeExperienceLessonId,
 *     and parseScenarioLessonId rejects the mode namespace.
 */

import { describe, expect, it } from "vitest";
import {
  MISTAKE_EXPERIENCE_LEAD_IN_BG,
  ScenarioCompileError,
  compileScenario,
  mistakeExperienceLessonId,
} from "../compile";
import {
  compileMistakeExperience,
  parseMistakeExperienceLessonId,
  scenarioEntryLevel,
} from "../mistakeExperience";
import { parseScenarioLessonId } from "../resolve";
import { SCENARIO_TEMPLATES, scenarioById } from "../templates";

const ZEBRA = scenarioById("sc-zebra-approach")!;
const CURVE = scenarioById("sc-sp-curve")!;

describe("compileScenario opts — absent = bit-identical", () => {
  it("no opts / {} / explicit undefined compile byte-equal across every template rung", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const bare = compileScenario(spec, rung.level);
        const empty = compileScenario(spec, rung.level, {});
        const explicit = compileScenario(spec, rung.level, { mistakeExperience: undefined });
        expect(JSON.stringify(empty), `${spec.id}@L${rung.level}`).toBe(JSON.stringify(bare));
        expect(JSON.stringify(explicit), `${spec.id}@L${rung.level}`).toBe(
          JSON.stringify(bare),
        );
        // Normal compiles never carry the mode: exams and drills bit-identical.
        expect("mistakeExperience" in bare).toBe(false);
        expect(bare.id.includes("~m")).toBe(false);
      }
    }
  });
});

describe("the mistake-experience delta", () => {
  it("moves the id to the ~m namespace and writes the mode payload", () => {
    const lesson = compileScenario(ZEBRA, 1, { mistakeExperience: { mistakeIndex: 1 } });
    expect(lesson.id).toBe("sc-zebra-approach@L1~m1");
    expect(lesson.mistakeExperience).toEqual({
      mistakeIndex: 1,
      codes: [...ZEBRA.mistakes[1].codeRefs],
    });
    // The instruction copy tells the student to DO the wrong thing:
    // the fixed lead-in + the STORED mistake title (ADR-002).
    expect(lesson.descriptionBg).toBe(
      `${MISTAKE_EXPERIENCE_LEAD_IN_BG} ${ZEBRA.mistakes[1].titleBg}.`,
    );
    expect(lesson.titleBg).toBe(`${ZEBRA.titleBg} · Преживей грешката`);
    // A sandbox is never an exam.
    expect(lesson.examMode).toBeUndefined();
  });

  it("inherits everything else from the SAME rung unchanged (world, staged, detectors, aids)", () => {
    const base = compileScenario(ZEBRA, 1);
    const mode = compileScenario(ZEBRA, 1, { mistakeExperience: { mistakeIndex: 1 } });
    const strip = (l: typeof base) => {
      // `briefingBg` joins the deltas (2026-08-02): the sandbox's assignment is
      // the MISTAKE, so the correct numbered steps are dropped rather than
      // rendered beside „направи грешката нарочно". Asserted below.
      const { id, titleBg, descriptionBg, briefingBg, mistakeExperience, ...rest } =
        l as typeof base & { mistakeExperience?: unknown };
      void id;
      void titleBg;
      void descriptionBg;
      void briefingBg;
      void mistakeExperience;
      return rest;
    };
    expect(JSON.stringify(strip(mode))).toBe(JSON.stringify(strip(base)));
    // The delta itself, stated rather than assumed: the rung briefs, the
    // sandbox does not.
    expect(base.briefingBg?.length).toBeGreaterThan(0);
    expect(mode.briefingBg).toBeUndefined();
    // The staged encounters that CREATE the mistake's conditions ride along.
    expect(JSON.stringify(mode.stagedEvents ?? [])).toBe(
      JSON.stringify(base.stagedEvents ?? []),
    );
    expect(JSON.stringify(mode.aids ?? null)).toBe(JSON.stringify(base.aids ?? null));
  });

  it("throws ScenarioCompileError for an out-of-range mistake index", () => {
    for (const bad of [-1, ZEBRA.mistakes.length, 99, 0.5]) {
      expect(() =>
        compileScenario(ZEBRA, 1, { mistakeExperience: { mistakeIndex: bad } }),
      ).toThrow(ScenarioCompileError);
    }
  });
});

describe("compileMistakeExperience — the entry-rung helper", () => {
  it("compiles the template's LOWEST authored rung in the mode", () => {
    const lesson = compileMistakeExperience(CURVE, 0);
    const entry = scenarioEntryLevel(CURVE);
    expect(lesson.id).toBe(mistakeExperienceLessonId(CURVE.id, entry, 0));
    expect(lesson.mistakeExperience?.mistakeIndex).toBe(0);
    expect(lesson.mistakeExperience?.codes).toEqual([...CURVE.mistakes[0].codeRefs]);
  });
});

describe("the ~m id namespace", () => {
  it("round-trips through the parser", () => {
    const id = mistakeExperienceLessonId("sc-zebra-approach", 1, 1);
    expect(parseMistakeExperienceLessonId(id)).toEqual({
      templateId: "sc-zebra-approach",
      level: 1,
      mistakeIndex: 1,
    });
  });

  it("is FOREIGN to the rung namespace — the wire resolver never regrades it", () => {
    expect(parseScenarioLessonId("sc-zebra-approach@L1~m1")).toBeNull();
  });

  it("rejects junk shapes", () => {
    for (const bad of [
      "sc-zebra-approach@L1",
      "sc-zebra-approach@L6~m0",
      "sc-zebra-approach~m0",
      "l-first-drive@L1~m0",
      "sc-zebra-approach@L1~m",
      "sc-zebra-approach@L1~mX",
      "",
    ]) {
      expect(parseMistakeExperienceLessonId(bad), bad).toBeNull();
    }
  });
});
