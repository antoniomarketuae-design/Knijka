/**
 * THE CONVERSION BETWEEN THE TWO THINGS BOTH CALLED „beat".
 *
 * `LessonProgress.beatIndex` indexes ENGINE beats (units of teaching); the room
 * plays one beat per SENTENCE. Get the conversion wrong by one and a student is
 * sent back a paragraph every single time they reopen a lesson — the exact
 * annoyance that makes resuming feel worse than not having it.
 *
 * The last block runs it against the REAL catalogue rather than a fixture,
 * because the property that has to hold is about the mapping `lessonToRoom.ts`
 * actually produces, not about a hand-written example of one.
 */

import { describe, expect, it, vi } from "vitest";
import "@/lib/content/loader";
import { allLessons } from "@/modules/lesson";
import { bookmarkAfterRoomBeat, engineIndexOfRoomBeat, roomStartIndex } from "./resume";

// `server-only` is a Next build-time marker with no npm package behind it, so
// the bundler resolves it and Node cannot. Stubbed so this test can import the
// real adapter rather than re-implementing its mapping — a conversion test
// whose fixture is a copy of the code under test proves only that the copy
// agrees with itself.
vi.mock("server-only", () => ({}));
const { roomLessonFor } = await import("./lessonToRoom");

// One engine beat („e2") speaks three sentences; the others speak one.
const ROOM = ["e1~0", "e2~0", "e2~1", "e2~2", "e3~0"];
const SOURCE: Record<string, string> = {
  "e1~0": "e1",
  "e2~0": "e2",
  "e2~1": "e2",
  "e2~2": "e2",
  "e3~0": "e3",
};
const ENGINE = ["e1", "e2", "e3"];

describe("engineIndexOfRoomBeat", () => {
  it("maps every sentence of a beat back to that beat", () => {
    expect(engineIndexOfRoomBeat("e2~0", SOURCE, ENGINE)).toBe(1);
    expect(engineIndexOfRoomBeat("e2~2", SOURCE, ENGINE)).toBe(1);
    expect(engineIndexOfRoomBeat("e3~0", SOURCE, ENGINE)).toBe(2);
  });

  it("returns -1 for an unmapped room beat, never 0", () => {
    // 0 would be a silent rewind to the start of the lesson on every save.
    expect(engineIndexOfRoomBeat("ghost~0", SOURCE, ENGINE)).toBe(-1);
    expect(engineIndexOfRoomBeat("e9~0", { "e9~0": "e9" }, ENGINE)).toBe(-1);
  });
});

describe("roomStartIndex", () => {
  it("opens on the FIRST sentence of the saved beat, not the middle of it", () => {
    // Saved „engine beat 1" ⇒ the student hears the idea from its first
    // sentence. Landing on e2~2 would drop them into the end of a thought.
    expect(roomStartIndex(ROOM, SOURCE, ENGINE, 1)).toBe(1);
    expect(roomStartIndex(ROOM, SOURCE, ENGINE, 2)).toBe(4);
  });

  it("opens at the start for beat 0, and for anything nonsensical", () => {
    expect(roomStartIndex(ROOM, SOURCE, ENGINE, 0)).toBe(0);
    expect(roomStartIndex(ROOM, SOURCE, ENGINE, -3)).toBe(0);
    expect(roomStartIndex(ROOM, SOURCE, ENGINE, Number.NaN)).toBe(0);
  });

  it("falls back to the start when the saved beat no longer resolves", () => {
    // A template whose trace went `pending` drops a beat out of the room. A
    // blank room is a worse answer than the first sentence.
    expect(roomStartIndex(ROOM, SOURCE, ENGINE, 99)).toBe(0);
  });
});

describe("bookmarkAfterRoomBeat", () => {
  it("stays on the SAME idea when the student stops halfway through it", () => {
    // Finished sentence 1 of 3 in engine beat „e2" ⇒ still e2. Saving e3 here
    // would skip two sentences the student has never heard.
    expect(bookmarkAfterRoomBeat(ROOM, SOURCE, ENGINE, 1)).toBe(1);
    expect(bookmarkAfterRoomBeat(ROOM, SOURCE, ENGINE, 2)).toBe(1);
  });

  it("moves on once the last sentence of an idea is done", () => {
    // Finished the third and final sentence of e2 ⇒ the bookmark is e3.
    expect(bookmarkAfterRoomBeat(ROOM, SOURCE, ENGINE, 3)).toBe(2);
    expect(bookmarkAfterRoomBeat(ROOM, SOURCE, ENGINE, 0)).toBe(1);
  });

  it("writes nothing at the end of the lesson — completion is its own write", () => {
    expect(bookmarkAfterRoomBeat(ROOM, SOURCE, ENGINE, ROOM.length - 1)).toBeNull();
  });

  it("writes nothing rather than 0 when the next sentence has no beat behind it", () => {
    const broken = [...ROOM, "orphan~0"];
    expect(bookmarkAfterRoomBeat(broken, SOURCE, ENGINE, ROOM.length - 1)).toBeNull();
  });
});

describe("against the real catalogue", () => {
  const lessons = allLessons();
  const room = roomLessonFor(lessons[0].id, lessons.length);
  if (room === null) throw new Error("lesson 1 does not resolve");
  const engineBeatIds = lessons[0].beats.map((b) => b.id);
  const roomBeatIds = room.lesson.beats.map((b) => b.id);

  it("round-trips: saving where a student stopped reopens on that same idea", () => {
    for (let i = 0; i < roomBeatIds.length; i++) {
      const saved = engineIndexOfRoomBeat(roomBeatIds[i], room.beatSource, engineBeatIds);
      expect(saved).toBeGreaterThanOrEqual(0);
      const reopened = roomStartIndex(roomBeatIds, room.beatSource, engineBeatIds, saved);
      // Not necessarily `i` — it is the first sentence of the same idea, which
      // is the deliberate behaviour. It must never be LATER than where they
      // were, because that would skip material they have not heard.
      expect(reopened).toBeLessThanOrEqual(i);
      expect(
        engineIndexOfRoomBeat(roomBeatIds[reopened], room.beatSource, engineBeatIds),
      ).toBe(saved);
    }
  });

  it("never skips unheard material and never replays a finished idea", () => {
    // The two failure modes the bookmark rule exists to avoid, checked over a
    // whole real lesson: whatever a student was doing when they closed the tab,
    // reopening lands on a sentence they had reached or were about to reach —
    // never past it, and never back at an idea they had completed.
    for (let i = 0; i < roomBeatIds.length - 1; i++) {
      const saved = bookmarkAfterRoomBeat(roomBeatIds, room.beatSource, engineBeatIds, i);
      expect(saved).not.toBeNull();
      const reopened = roomStartIndex(roomBeatIds, room.beatSource, engineBeatIds, saved!);
      // Never past the next unheard sentence…
      expect(reopened).toBeLessThanOrEqual(i + 1);
      // …and never back before the idea the next sentence belongs to.
      expect(
        engineIndexOfRoomBeat(roomBeatIds[reopened], room.beatSource, engineBeatIds),
      ).toBe(engineIndexOfRoomBeat(roomBeatIds[i + 1], room.beatSource, engineBeatIds));
    }
  });

  it("maps every room beat of every lesson — no orphan sentences", () => {
    for (const lesson of lessons) {
      const mapped = roomLessonFor(lesson.id, lessons.length);
      if (mapped === null) continue;
      const ids = lesson.beats.map((b) => b.id);
      for (const beat of mapped.lesson.beats) {
        expect(engineIndexOfRoomBeat(beat.id, mapped.beatSource, ids)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
