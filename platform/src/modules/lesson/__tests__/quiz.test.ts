/**
 * The mini-quiz picker.
 *
 * The two properties that matter and would be invisible in a screenshot:
 *
 *  1. DETERMINISM. Same lesson, same beat ⇒ the same questions in the same
 *     option order, forever. A student who retakes a lesson to fix one thing
 *     must be able to meet that thing again — quiz-trigger.ts makes this
 *     argument for the in-sim quiz and it is stronger here, because a lesson
 *     is something you deliberately return to.
 *  2. REVIEWED MATERIAL ONLY. 84 of the 1,089 questions are still
 *     `needs-review`. Practice may show them (it is where a student explores);
 *     a lesson is the teacher asserting that this IS the material, so it deals
 *     approved items and nothing else.
 */
import { describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import type { Question } from "@/lib/content/types";
import { allLessons, resetLessonCache } from "../compose";
import { isLessonEligible, orderOptionsForBeat, pickBeatQuiz, quizSeed } from "../quiz";
import { dealBeatQuiz } from "../session";

resetLessonCache();
const LESSONS = allLessons();

function q(id: string, status: Question["status"], options = 4): Question {
  return {
    id,
    conceptIds: ["c-x"],
    type: "single",
    points: 1,
    textBg: `въпрос ${id}`,
    options: Array.from({ length: options }, (_, i) => ({
      id: `${id}-o${i}`,
      textBg: `опция ${i}`,
      correct: i === 0,
    })),
    explanationBg: "обяснение",
    lawRefs: [],
    media: null,
    status,
  };
}

describe("selection", () => {
  it("walks the beat's concepts round-robin", () => {
    const picks = pickBeatQuiz(
      [
        { conceptId: "c-a", questions: [q("a1", "approved"), q("a2", "approved")] },
        { conceptId: "c-b", questions: [q("b1", "approved")] },
      ],
      2,
      1,
    );
    expect(picks.map((p) => p.question.id)).toEqual(["a1", "b1"]);
  });

  it("skips unreviewed questions", () => {
    const picks = pickBeatQuiz(
      [
        {
          conceptId: "c-a",
          questions: [q("a1", "needs-review"), q("a2", "draft"), q("a3", "approved")],
        },
      ],
      2,
      1,
    );
    expect(picks.map((p) => p.question.id)).toEqual(["a3"]);
    expect(isLessonEligible(q("x", "needs-review"))).toBe(false);
    expect(isLessonEligible(q("x", "draft"))).toBe(false);
  });

  it("comes up short rather than repeating a question", () => {
    const picks = pickBeatQuiz(
      [{ conceptId: "c-a", questions: [q("a1", "approved")] }],
      3,
      1,
    );
    expect(picks).toHaveLength(1);
  });

  it("never leaves the stored option order alone for every question", () => {
    // The stored order puts the correct answer first far too often to be a
    // fair check (audit H-1a). The rotation is per (seed, question id), so two
    // questions in one beat do not rotate in lockstep.
    const seed = quizSeed("l-x", "b-x");
    const rotations = ["a1", "a2", "a3", "a4"].map((id) => {
      const question = q(id, "approved");
      return orderOptionsForBeat(question, seed)[0].id.endsWith("-o0");
    });
    expect(rotations.some((unchanged) => !unchanged)).toBe(true);
  });
});

describe("determinism against the real bank", () => {
  it("deals the same questions in the same order, twice", () => {
    for (const lesson of LESSONS.slice(0, 12)) {
      for (const beat of lesson.beats.filter((b) => b.kind === "quiz")) {
        const first = dealBeatQuiz(lesson.id, beat.id);
        const second = dealBeatQuiz(lesson.id, beat.id);
        expect(second).toEqual(first);
      }
    }
  });

  it("deals a question for every quiz beat in the course", () => {
    const empty: string[] = [];
    for (const lesson of LESSONS) {
      for (const beat of lesson.beats.filter((b) => b.kind === "quiz")) {
        if (dealBeatQuiz(lesson.id, beat.id).length === 0) {
          empty.push(`${lesson.id}/${beat.id}`);
        }
      }
    }
    expect(empty).toEqual([]);
  });

  it("deals only approved questions, and never leaks the key", () => {
    const repo = getContentRepo();
    for (const lesson of LESSONS) {
      for (const beat of lesson.beats.filter((b) => b.kind === "quiz")) {
        for (const dealt of dealBeatQuiz(lesson.id, beat.id)) {
          expect(repo.questionById(dealt.questionId)!.status).toBe("approved");
          // The client-safe projection: no `correct` flag survives it.
          //
          // `media` JOINED THIS SET, and the widening is the point rather than
          // a concession. The projection used to be exactly `{id, textBg}`, and
          // the sign faces the bank carries per option were dropped with the
          // answer key — so «Кой от показаните знаци…» reached the classroom as
          // four captions reading „Знак 1 / Знак 2 / Знак 3 / Знак 4" (doc 91
          // S2). A sign CODE is not an answer; it is the thing the student is
          // being asked to look at, and the exam DTO has carried it since
          // THEO-1. What this test actually guards is stated below as well as
          // by the list, so a future field cannot slip in by widening the list
          // again without saying so.
          for (const option of dealt.options) {
            expect(Object.keys(option).sort()).toEqual(
              option.media === undefined ? ["id", "textBg"] : ["id", "media", "textBg"],
            );
            expect(option).not.toHaveProperty("correct");
            expect(option).not.toHaveProperty("whyWrongBg");
          }
        }
      }
    }
  });

  it("deals nothing for a non-quiz beat", () => {
    const lesson = LESSONS[0];
    const explain = lesson.beats.find((b) => b.kind !== "quiz")!;
    expect(dealBeatQuiz(lesson.id, explain.id)).toEqual([]);
    expect(dealBeatQuiz("l-nope", "b-nope")).toEqual([]);
  });
});
