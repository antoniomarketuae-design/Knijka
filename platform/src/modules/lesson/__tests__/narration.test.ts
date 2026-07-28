/**
 * The authored-lecture socket.
 *
 * This is the contract between this module and `content/lessons/*.json`
 * (docs/ai/85). It has one job and one safety property:
 *
 *   JOB — an approved authored beat speaks instead of the composed line, and
 *   nothing else about the lesson changes.
 *   SAFETY — an UNAPPROVED beat does not. Reviewed material outranks
 *   better-written material, always. A gap gets fixed; a fluent, confident,
 *   subtly wrong sentence about Bulgarian law gets memorised by a
 *   seventeen-year-old who then gets in a car.
 */
import { afterEach, describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { allLessons, resetLessonCache } from "../compose";
import { setLessonNarrationProvider } from "../narration";
import { resolveBeat, resolveOutline } from "../resolve";

resetLessonCache();
const LESSON = allLessons()[2];
const BEAT = LESSON.beats.find((b) => b.kind === "explain") ?? LESSON.beats[1];

afterEach(() => setLessonNarrationProvider(null));

const AUTHORED =
  "Коланът е задължителен при всяко пътуване, на всяка седалка, при всяка скорост.";

describe("with no corpus registered", () => {
  it("changes nothing — every lesson is composed, exactly as before", () => {
    const resolved = resolveBeat(LESSON.id, BEAT.id)!;
    expect(resolved.utterances.length).toBeGreaterThan(0);
    expect(resolved.utterances[0].textBg).not.toBe(AUTHORED);
  });
});

describe("with an approved authored beat", () => {
  it("speaks the author's paragraph and carries its citations", () => {
    setLessonNarrationProvider((lessonId, beatId) =>
      lessonId === LESSON.id && beatId === BEAT.id
        ? {
            textBg: AUTHORED,
            lawRefs: [{ act: "ЗДвП", ref: "чл. 137а" }],
            status: "approved",
          }
        : null,
    );
    const resolved = resolveBeat(LESSON.id, BEAT.id)!;
    expect(resolved.utterances).toHaveLength(1);
    expect(resolved.utterances[0].textBg).toBe(AUTHORED);
    expect(resolved.utterances[0].lawRefs).toEqual([
      { act: "ЗДвП", ref: "чл. 137а" },
    ]);
    // Same beat, same board, same chips — only the words moved.
    expect(resolved.board).toEqual(resolveBeatBoardWithoutProvider());
  });

  it("keeps the outline's sayCount in step with what will actually arrive", () => {
    setLessonNarrationProvider(() => ({
      textBg: AUTHORED,
      lawRefs: [],
      status: "approved",
    }));
    const outline = resolveOutline(LESSON.id)!;
    for (const b of outline.beats) {
      expect(b.sayCount).toBe(resolveBeat(LESSON.id, b.id)!.utterances.length);
    }
  });
});

describe("safety", () => {
  it("refuses draft and needs-review beats — the composed line stands", () => {
    for (const status of ["draft", "needs-review"] as const) {
      setLessonNarrationProvider(() => ({ textBg: AUTHORED, lawRefs: [], status }));
      expect(resolveBeat(LESSON.id, BEAT.id)!.utterances[0].textBg).not.toBe(
        AUTHORED,
      );
    }
  });

  it("refuses an empty entry rather than rendering a silent beat", () => {
    setLessonNarrationProvider(() => ({ textBg: "   ", lawRefs: [], status: "approved" }));
    expect(resolveBeat(LESSON.id, BEAT.id)!.utterances.length).toBeGreaterThan(0);
    expect(resolveBeat(LESSON.id, BEAT.id)!.utterances[0].textBg.trim().length)
      .toBeGreaterThan(0);
  });

  it("survives a corpus that throws — the classroom does not go down with it", () => {
    setLessonNarrationProvider(() => {
      throw new Error("corrupt lesson file");
    });
    expect(resolveBeat(LESSON.id, BEAT.id)!.utterances.length).toBeGreaterThan(0);
  });
});

/** The beat's board as composed, with the provider momentarily out of the way. */
function resolveBeatBoardWithoutProvider() {
  setLessonNarrationProvider(null);
  const board = resolveBeat(LESSON.id, BEAT.id)!.board;
  setLessonNarrationProvider((lessonId, beatId) =>
    lessonId === LESSON.id && beatId === BEAT.id
      ? { textBg: AUTHORED, lawRefs: [{ act: "ЗДвП", ref: "чл. 137а" }], status: "approved" }
      : null,
  );
  return board;
}
