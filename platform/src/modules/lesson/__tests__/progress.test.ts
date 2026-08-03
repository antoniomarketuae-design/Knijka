/**
 * WHERE THE STUDENT GOT TO — the three decisions and the one write.
 *
 * Every assertion here is red before `progress.ts` exists, because before it
 * there was no row: a student who closed the tab restarted at beat 1, the
 * course index guessed „продължи оттам" from per-CONCEPT mastery (a different
 * question, with a different answer), and doc 84's gate U3 — completion per
 * lesson — had nothing to count.
 */

import { describe, expect, it } from "vitest";
import {
  courseCompletion,
  InMemoryLessonProgressStore,
  resumeBeatIndex,
  resumePoint,
  type LessonProgressRow,
} from "../progress";

function row(over: Partial<LessonProgressRow> & { lessonId: string }): LessonProgressRow {
  return {
    beatIndex: 0,
    startedAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    completedAt: null,
    ...over,
  };
}

const COURSE = ["l-1", "l-2", "l-3"];

// ---------------------------------------------------------------------------

describe("resumeBeatIndex", () => {
  it("opens a never-watched lesson at the beginning", () => {
    expect(resumeBeatIndex(null, 9)).toBe(0);
  });

  it("opens an in-progress lesson where the student stopped", () => {
    expect(resumeBeatIndex(row({ lessonId: "l-1", beatIndex: 4 }), 9)).toBe(4);
  });

  it("opens a COMPLETED lesson at the beginning, not on its last sentence", () => {
    // Re-watching is not resuming. Dropping a student on the final beat of a
    // lesson they already finished is skipping to the end.
    const done = row({
      lessonId: "l-1",
      beatIndex: 8,
      completedAt: new Date("2026-08-01T10:30:00.000Z"),
    });
    expect(resumeBeatIndex(done, 9)).toBe(0);
  });

  it("clamps a cursor past the end — beats disappear when a trace goes pending", () => {
    expect(resumeBeatIndex(row({ lessonId: "l-1", beatIndex: 40 }), 9)).toBe(8);
    expect(resumeBeatIndex(row({ lessonId: "l-1", beatIndex: 3 }), 0)).toBe(0);
  });

  it("refuses a nonsense cursor rather than propagating NaN into a render", () => {
    expect(resumeBeatIndex(row({ lessonId: "l-1", beatIndex: Number.NaN }), 9)).toBe(0);
    expect(resumeBeatIndex(row({ lessonId: "l-1", beatIndex: -7 }), 9)).toBe(0);
  });
});

describe("resumePoint", () => {
  it("offers lesson 1 to a student who has never opened anything", () => {
    expect(resumePoint(COURSE, [])).toEqual({
      lessonId: "l-1",
      beatIndex: 0,
      kind: "start",
    });
  });

  it("offers the MOST RECENTLY TOUCHED unfinished lesson, not the lowest-numbered", () => {
    // A student who jumped to the roundabout lesson because that is what
    // scares them wants that one back — not lesson 1.
    const rows = [
      row({ lessonId: "l-1", beatIndex: 2, updatedAt: new Date("2026-08-01T09:00:00.000Z") }),
      row({ lessonId: "l-3", beatIndex: 5, updatedAt: new Date("2026-08-02T09:00:00.000Z") }),
    ];
    expect(resumePoint(COURSE, rows)).toEqual({
      lessonId: "l-3",
      beatIndex: 5,
      kind: "continue",
    });
  });

  it("skips finished lessons and falls to the first never-opened one", () => {
    const rows = [
      row({ lessonId: "l-1", completedAt: new Date("2026-08-01T09:30:00.000Z") }),
      row({ lessonId: "l-2", completedAt: new Date("2026-08-02T09:30:00.000Z") }),
    ];
    expect(resumePoint(COURSE, rows)).toEqual({
      lessonId: "l-3",
      beatIndex: 0,
      kind: "start",
    });
  });

  it("says plainly that the course is done rather than inventing a finish screen", () => {
    const rows = COURSE.map((id) =>
      row({ lessonId: id, completedAt: new Date("2026-08-02T09:30:00.000Z") }),
    );
    expect(resumePoint(COURSE, rows)?.kind).toBe("restart");
  });

  it("ignores rows for lessons that are no longer in the course", () => {
    const rows = [row({ lessonId: "l-deleted", beatIndex: 3 })];
    expect(resumePoint(COURSE, rows)?.lessonId).toBe("l-1");
  });

  it("has nothing to offer when there is no course", () => {
    expect(resumePoint([], [])).toBeNull();
  });
});

describe("courseCompletion — doc 84 gate U3", () => {
  it("counts started and completed separately", () => {
    const rows = [
      row({ lessonId: "l-1", completedAt: new Date("2026-08-01T09:30:00.000Z") }),
      row({ lessonId: "l-2", beatIndex: 3 }),
    ];
    expect(courseCompletion(COURSE, rows)).toEqual({
      total: 3,
      started: 2,
      completed: 1,
    });
  });

  it("does not count rows for lessons outside the course", () => {
    const rows = [row({ lessonId: "gone", completedAt: new Date() })];
    expect(courseCompletion(COURSE, rows)).toEqual({
      total: 3,
      started: 0,
      completed: 0,
    });
  });
});

describe("the store contract", () => {
  it("keeps one row per (student, lesson) — a retake moves the bookmark", async () => {
    const store = new InMemoryLessonProgressStore();
    await store.save("u1", "l-1", 3, false);
    await store.save("u1", "l-1", 6, false);
    const rows = await store.listForUser("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0].beatIndex).toBe(6);
  });

  it("keeps completion STICKY, so the U3 number can only go up", async () => {
    const store = new InMemoryLessonProgressStore();
    await store.save("u1", "l-1", 8, true);
    // The retake: the student re-opens the lesson and walks it again.
    await store.save("u1", "l-1", 1, false);
    const again = await store.getOne("u1", "l-1");
    expect(again?.beatIndex).toBe(1);
    expect(again?.completedAt).not.toBeNull();
  });

  it("keeps startedAt from the FIRST visit", async () => {
    const store = new InMemoryLessonProgressStore();
    await store.save("u1", "l-1", 0, false, new Date("2026-08-01T10:00:00.000Z"));
    await store.save("u1", "l-1", 4, false, new Date("2026-08-05T10:00:00.000Z"));
    const saved = await store.getOne("u1", "l-1");
    expect(saved?.startedAt.toISOString()).toBe("2026-08-01T10:00:00.000Z");
    expect(saved?.updatedAt.toISOString()).toBe("2026-08-05T10:00:00.000Z");
  });

  it("never leaks one student's position to another", async () => {
    const store = new InMemoryLessonProgressStore();
    await store.save("u1", "l-1", 5, false);
    expect(await store.listForUser("u2")).toEqual([]);
    expect(await store.getOne("u2", "l-1")).toBeNull();
  });

  it("returns the newest row first — what the resume card reads", async () => {
    const store = new InMemoryLessonProgressStore();
    await store.save("u1", "l-1", 1, false, new Date("2026-08-01T10:00:00.000Z"));
    await store.save("u1", "l-2", 1, false, new Date("2026-08-03T10:00:00.000Z"));
    expect((await store.listForUser("u1")).map((r) => r.lessonId)).toEqual(["l-2", "l-1"]);
  });
});
