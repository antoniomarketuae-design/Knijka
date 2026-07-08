import { describe, expect, it } from "vitest";
import { computeProgression, type LessonAttemptRow } from "../progression";
import { LESSONS } from "../specs";

function entryFor(rows: LessonAttemptRow[], lessonId: string) {
  const entry = computeProgression(LESSONS, rows).find((e) => e.lesson.id === lessonId);
  if (!entry) throw new Error(`no entry for ${lessonId}`);
  return entry;
}

describe("computeProgression", () => {
  it("opens only L0 for a brand-new student", () => {
    const entries = computeProgression(LESSONS, []);
    expect(entries.map((e) => [e.lesson.id, e.unlocked])).toEqual([
      ["l0-free-drive", true],
      ["l1-preparation", false],
      ["l2-intersections", false],
      ["l3-roundabout", false],
      ["l4-crossings", false],
    ]);
    expect(entries[0].attempts).toBe(0);
    expect(entries[0].bestScore).toBeNull();
  });

  it("unlocks exactly the next lesson when the previous one is passed", () => {
    const rows: LessonAttemptRow[] = [{ lessonId: "l0-free-drive", passed: true, score: 0 }];
    expect(entryFor(rows, "l1-preparation").unlocked).toBe(true);
    expect(entryFor(rows, "l2-intersections").unlocked).toBe(false);
  });

  it("failed attempts count but never unlock", () => {
    const rows: LessonAttemptRow[] = [
      { lessonId: "l0-free-drive", passed: true, score: 0 },
      { lessonId: "l1-preparation", passed: false, score: 12 },
      { lessonId: "l1-preparation", passed: false, score: 4 },
    ];
    const l1 = entryFor(rows, "l1-preparation");
    expect(l1.unlocked).toBe(true);
    expect(l1.passed).toBe(false);
    expect(l1.attempts).toBe(2);
    expect(l1.bestScore).toBe(4); // penalty points: lower is better
    expect(entryFor(rows, "l2-intersections").unlocked).toBe(false);
  });

  it("keeps best (lowest) score across passes and failures", () => {
    const rows: LessonAttemptRow[] = [
      { lessonId: "l0-free-drive", passed: false, score: 15 },
      { lessonId: "l0-free-drive", passed: true, score: 3 },
      { lessonId: "l0-free-drive", passed: true, score: 7 },
    ];
    const l0 = entryFor(rows, "l0-free-drive");
    expect(l0.passed).toBe(true);
    expect(l0.attempts).toBe(3);
    expect(l0.bestScore).toBe(3);
  });

  it("unlocks the full chain lesson by lesson", () => {
    const rows: LessonAttemptRow[] = [
      { lessonId: "l0-free-drive", passed: true, score: 0 },
      { lessonId: "l1-preparation", passed: true, score: 2 },
      { lessonId: "l2-intersections", passed: true, score: 1 },
    ];
    const entries = computeProgression(LESSONS, rows);
    expect(entries.map((e) => e.unlocked)).toEqual([true, true, true, true, false]);
  });

  it("L0 stays open no matter what", () => {
    const rows: LessonAttemptRow[] = [{ lessonId: "l0-free-drive", passed: false, score: 40 }];
    expect(entryFor(rows, "l0-free-drive").unlocked).toBe(true);
  });
});
