/**
 * Admin gate bypass (User.role="admin") — the explicit `unlockAll` flag on
 * the pure progression folds. Callers resolve it SERVER-SIDE from the
 * session (never from client input); these tests pin down both directions:
 * with the flag every gate opens, without it nothing changes.
 */

import { describe, expect, it } from "vitest";
import { computeProgression, isExamUnlocked } from "../progression";
import {
  isScenarioLevelUnlocked,
  scenarioLevelProgress,
  type ScenarioAttemptRow,
} from "../scenario/progress";
import { SC_PARK_PERP_REV } from "../scenario/templates";
import { EXAM_LESSON, LESSONS } from "../specs";

const row = (level: number, stars: number | null): ScenarioAttemptRow => ({
  lessonId: `${SC_PARK_PERP_REV.id}@L${level}`,
  rubricStars: stars,
});

describe("admin unlockAll — curriculum lessons (computeProgression)", () => {
  it("opens EVERY lesson for a brand-new admin", () => {
    const entries = computeProgression(LESSONS, [], { unlockAll: true });
    expect(entries.length).toBeGreaterThan(1);
    expect(entries.every((e) => e.unlocked)).toBe(true);
  });

  it("does not touch stats: attempts/pass/best fold exactly as before", () => {
    const attempts = [{ lessonId: "l0-free-drive", passed: false, score: 7 }];
    const admin = computeProgression(LESSONS, attempts, { unlockAll: true });
    const normal = computeProgression(LESSONS, attempts);
    expect(admin.map((e) => [e.lesson.id, e.passed, e.attempts, e.bestScore])).toEqual(
      normal.map((e) => [e.lesson.id, e.passed, e.attempts, e.bestScore]),
    );
  });

  it("non-admin behavior unchanged: only L0 open without the flag", () => {
    for (const opts of [undefined, {}, { unlockAll: false }]) {
      const entries = computeProgression(LESSONS, [], opts);
      expect(entries[0].unlocked).toBe(true);
      expect(entries.slice(1).every((e) => !e.unlocked)).toBe(true);
    }
  });
});

describe("admin unlockAll — exam gate (isExamUnlocked)", () => {
  it("opens the exam with zero history for an admin", () => {
    expect(EXAM_LESSON.unlockAfterLessonId).toBeDefined(); // gate is real
    expect(isExamUnlocked(EXAM_LESSON, [], { unlockAll: true })).toBe(true);
  });

  it("non-admin behavior unchanged: prerequisite still required", () => {
    expect(isExamUnlocked(EXAM_LESSON, [])).toBe(false);
    expect(isExamUnlocked(EXAM_LESSON, [], { unlockAll: false })).toBe(false);
    expect(
      isExamUnlocked(EXAM_LESSON, [
        { lessonId: EXAM_LESSON.unlockAfterLessonId!, passed: true, score: 0 },
      ]),
    ).toBe(true);
  });
});

describe("admin unlockAll — scenario levels (scenario/progress)", () => {
  it("opens every authored rung with zero history", () => {
    const p = scenarioLevelProgress(SC_PARK_PERP_REV, [], { unlockAll: true });
    expect(p.length).toBeGreaterThan(1);
    expect(p.every((l) => l.unlocked)).toBe(true);
  });

  it("save-action guard admits any authored level, still refuses unauthored", () => {
    const top = Math.max(...SC_PARK_PERP_REV.levels.map((l) => l.level));
    expect(
      isScenarioLevelUnlocked(SC_PARK_PERP_REV, top as 1 | 2 | 3 | 4 | 5, [], {
        unlockAll: true,
      }),
    ).toBe(true);
    // unlockAll opens real rungs, it never invents a level 5 the template
    // does not author.
    if (top < 5) {
      expect(isScenarioLevelUnlocked(SC_PARK_PERP_REV, 5, [], { unlockAll: true })).toBe(
        false,
      );
    }
  });

  it("does not touch stars/attempts folding", () => {
    const rows = [row(1, 1), row(1, 3), row(2, null)];
    const admin = scenarioLevelProgress(SC_PARK_PERP_REV, rows, { unlockAll: true });
    const normal = scenarioLevelProgress(SC_PARK_PERP_REV, rows);
    expect(admin.map((l) => [l.level, l.attempts, l.bestStars])).toEqual(
      normal.map((l) => [l.level, l.attempts, l.bestStars]),
    );
  });

  it("non-admin behavior unchanged: star ladder still gates L2+", () => {
    for (const opts of [undefined, {}, { unlockAll: false }]) {
      const p = scenarioLevelProgress(SC_PARK_PERP_REV, [row(1, 1)], opts);
      expect(p.find((l) => l.level === 1)!.unlocked).toBe(true);
      expect(p.find((l) => l.level === 2)!.unlocked).toBe(false);
    }
    expect(isScenarioLevelUnlocked(SC_PARK_PERP_REV, 2, [row(1, 2)])).toBe(true);
  });
});
