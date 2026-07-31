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
    expect(entries[0].lesson.id).toBe("l0-free-drive");
    expect(entries[0].unlocked).toBe(true);
    // Every subsequent lesson in the chain is locked until its predecessor
    // has been DRIVEN (FR-06 — attempted, not necessarily passed).
    expect(entries.slice(1).every((e) => !e.unlocked)).toBe(true);
    expect(entries[0].attempts).toBe(0);
    expect(entries[0].bestScore).toBeNull();
  });

  it("unlocks exactly the next lesson when the previous one is passed", () => {
    const rows: LessonAttemptRow[] = [{ lessonId: "l0-free-drive", passed: true, score: 0 }];
    expect(entryFor(rows, "l1-preparation").unlocked).toBe(true);
    expect(entryFor(rows, "l2-intersections").unlocked).toBe(false);
  });

  /**
   * FR-06 (founder, 2026-07-29): „we should give users an option continue to
   * next question although you made mistake and come back to this later …
   * currently we are blocking them from advancing and sometimes they just
   * want to go trough all first."
   *
   * This test used to be called „failed attempts count but never unlock" and
   * asserted the wall. The rule it pinned is the one he overruled: a student
   * who drove Урок 1 to the end and failed it could not open Урок 2 at all.
   * A failed attempt now OPENS the next door and still does not claim this
   * lesson is done — those are two different facts and the entry carries both.
   */
  it("FR-06: a failed attempt opens the next lesson and still reads as not passed", () => {
    const rows: LessonAttemptRow[] = [
      { lessonId: "l0-free-drive", passed: true, score: 0 },
      { lessonId: "l1-preparation", passed: false, score: 12 },
      { lessonId: "l1-preparation", passed: false, score: 4 },
    ];
    const l1 = entryFor(rows, "l1-preparation");
    expect(l1.unlocked).toBe(true);
    expect(l1.passed).toBe(false); // the verdict is untouched — it is not a pass
    expect(l1.attempts).toBe(2);
    expect(l1.bestScore).toBe(4); // penalty points: lower is better
    // …and the door onward is open, which is the whole ask.
    const l2 = entryFor(rows, "l2-intersections");
    expect(l2.unlocked).toBe(true);
    expect(l2.passed).toBe(false);
    // ORDER still holds: nothing two steps ahead opens on one failed drive.
    expect(entryFor(rows, "l3-roundabout").unlocked).toBe(false);
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
    // Passing L0..L2 unlocks through L3 (index 3); everything after stays locked.
    expect(entries.map((e) => e.unlocked)).toEqual(entries.map((_, i) => i <= 3));
  });

  it("L0 stays open no matter what", () => {
    const rows: LessonAttemptRow[] = [{ lessonId: "l0-free-drive", passed: false, score: 40 }];
    expect(entryFor(rows, "l0-free-drive").unlocked).toBe(true);
  });
});
