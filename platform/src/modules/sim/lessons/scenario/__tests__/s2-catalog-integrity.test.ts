/**
 * S2 revision — catalog integrity across the whole Studio ladder. Beyond the
 * per-template gates: every registered template must compile at EVERY authored
 * level, expose loadable trace refs, and carry a well-formed spec (Bulgarian
 * copy, cited archetypes, an objective set the compiler accepts).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import { compileScenario } from "../compile";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

describe("S2 catalog integrity", () => {
  it("registers the full S1+S2 wave (11 templates across the families)", () => {
    const ids = SCENARIO_TEMPLATES.map((s) => s.id).sort();
    expect(ids).toEqual(
      [
        "sc-park-perp-rev",
        "sc-park-parallel",
        "sc-park-45",
        "sc-park-narrow",
        "sc-junction-rhr",
        "sc-junction-stop",
        "sc-signal-response",
        "sc-turn-left-oncoming",
        "sc-zebra-approach",
        "sc-roundabout-entry",
        "sc-lane-change",
      ].sort(),
    );
  });

  it("every template has unique ids, Bulgarian copy, cited archetypes and ≥ 2 mistake demos", () => {
    const seen = new Set<string>();
    for (const spec of SCENARIO_TEMPLATES) {
      expect(seen.has(spec.id), `duplicate ${spec.id}`).toBe(false);
      seen.add(spec.id);
      expect(spec.titleBg, spec.id).toMatch(/[Ѐ-ӿ]/);
      expect(spec.objectiveBg, spec.id).toMatch(/[Ѐ-ӿ]/);
      expect(spec.archetypeIds.length, spec.id).toBeGreaterThanOrEqual(1);
      expect(spec.mistakes.length, spec.id).toBeGreaterThanOrEqual(2);
      expect(spec.instructionsBg.length, spec.id).toBeGreaterThanOrEqual(4);
      expect(spec.teach.lawRef, spec.id).toBeTruthy();
    }
  });

  it("every template compiles at EVERY authored level into a valid LessonSpec", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      for (const level of spec.levels) {
        const lesson = compileScenario(spec, level.level);
        expect(lesson.id, `${spec.id}@L${level.level}`).toBe(`${spec.id}@L${level.level}`);
        expect(lesson.objectives.length, `${spec.id}@L${level.level}`).toBeGreaterThan(0);
      }
    }
  });

  it("the difficulty ladder is real: L1 guides (shadow car), the exam rung strips aids", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      const levels = spec.levels.map((l) => l.level);
      if (levels.includes(1)) {
        const l1 = compileScenario(spec, 1);
        expect(l1.aids?.shadowCar, `${spec.id}@L1 should show the shadow car`).toBe(true);
        expect(l1.examMode, `${spec.id}@L1 is not an exam`).toBeFalsy();
      }
      // L4 is the exam rung (examMode default); L5, where authored, is the
      // ADVANCED beyond-exam rung (harder conditions), not exam mode.
      if (levels.includes(4)) {
        const exam = compileScenario(spec, 4);
        expect(exam.examMode, `${spec.id}@L4 should be exam mode`).toBe(true);
        expect(exam.aids?.shadowCar, `${spec.id}@L4 must not show the shadow`).toBeFalsy();
        expect(exam.aids?.pathRibbon, `${spec.id}@L4 must not show the ribbon`).toBeFalsy();
      }
    }
  });

  it("every shadow + mistake trace ref points at a committed, parseable file", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      const refs = [spec.shadow, ...spec.mistakes.map((m) => m.traceRef)];
      for (const ref of refs) {
        expect(ref.pending, `${spec.id} ${ref.path}`).not.toBe(true);
        const file = path.join(REPO_ROOT, ref.path);
        expect(existsSync(file), `${ref.path} missing`).toBe(true);
        const publicFile = path.join(REPO_ROOT, "platform", "public", ref.path.replace(/^content\//, ""));
        expect(existsSync(publicFile), `public copy of ${ref.path} missing`).toBe(true);
        const parsed = JSON.parse(readFileSync(file, "utf-8"));
        expect(parsed.meta?.scenarioId, ref.path).toBe(spec.id);
      }
    }
  });
});
