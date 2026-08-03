/**
 * THE PICTURE REACHES THE CLASSROOM (THEO-1).
 *
 * The mini-quiz DTO used to be `{questionId, conceptId, type, points, textBg,
 * options: Array<{id, textBg}>}` and its option mapper was literally
 * `(o) => ({ id: o.id, textBg: o.textBg })` — the same line that caused L1 in
 * the simulator's micro-quiz, written a second time in a second module. So
 * «Кой от показаните знаци поставя началото на жилищна зона…» reached the
 * classroom board as four captions reading „Знак 1 / Знак 2 / Знак 3 / Знак 4"
 * and nothing to look at. Not a hard question — an unanswerable one, because
 * the four captions are interchangeable.
 *
 * The content was never the defect: `q-uyazvimi-072` has carried a `media`
 * block per option since THEO-1, and the theory audit's claim that nine sign
 * questions „have media: null and need a new multi-sign media kind" is
 * retracted — the ordered set of signs IS the option list (content/SCHEMA.md,
 * „the comparison shape"; QuestionMedia.tsx `hasSignOptions`).
 *
 * These tests are the two halves of that path:
 *   1. the DTO carries what the bank holds, and still carries no answer;
 *   2. both lesson surfaces draw it, through the SAME <SignFace> the practice
 *      runner, the exam runner and the micro-quiz overlay already mount.
 *
 * Every one of them fails against the previous DTO.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import type { Question } from "@/lib/content/types";
import { allLessons, resetLessonCache } from "../compose";
import { orderOptionsForBeat, toClientQuestion } from "../quiz";
import { dealBeatQuiz } from "../session";

resetLessonCache();

// ---------------------------------------------------------------------------
// 1. The DTO
// ---------------------------------------------------------------------------

/** A four-sign comparison, the shape that was rendering as bare captions. */
function comparisonQuestion(): Question {
  return {
    id: "q-cmp",
    conceptIds: ["c-x"],
    type: "single",
    points: 1,
    textBg: "Кой от показаните знаци?",
    options: [
      { id: "a", textBg: "Знак 1", correct: false, media: { kind: "sign", signRef: "Д16" } },
      { id: "b", textBg: "Знак 2", correct: true, media: { kind: "sign", signRef: "Д24" } },
      { id: "c", textBg: "Знак 3", correct: false, media: { kind: "sign", signRef: "Д15" } },
    ],
    explanationBg: "обяснение",
    lawRefs: [],
    media: null,
    status: "approved",
  };
}

describe("the DTO carries the picture", () => {
  it("keeps a sign face on every option that has one", () => {
    const question = comparisonQuestion();
    const dto = toClientQuestion({
      question,
      conceptId: "c-x",
      options: question.options,
    });
    expect(dto.options.map((o) => o.media?.signRef)).toEqual(["Д16", "Д24", "Д15"]);
  });

  it("keeps the question's own artwork — sign and scene still alike", () => {
    const sign = comparisonQuestion();
    sign.media = { kind: "sign", signRef: "А19" };
    expect(
      toClientQuestion({ question: sign, conceptId: "c-x", options: sign.options }).media,
    ).toEqual({ kind: "sign", signRef: "А19" });

    const scene = comparisonQuestion();
    scene.media = {
      kind: "sceneStill",
      districtId: "d-1",
      focus: { x: 0, y: 0, zoomM: 40 },
      poses: [{ kind: "car", x: 0, y: 0, headingDeg: 0, variant: "ego" }],
    };
    expect(
      toClientQuestion({ question: scene, conceptId: "c-x", options: scene.options }).media,
    ).toEqual(scene.media);
  });

  it("survives the beat's option rotation — the face travels with its option", () => {
    // orderOptionsForBeat rotates so the stored order cannot be the answer key
    // (audit H-1a). A face that stayed behind while its caption moved would put
    // the picture of option 1 on option 3 — a wrong answer the student cannot
    // even see is wrong. So the pairing is asserted, not the order.
    const question = comparisonQuestion();
    for (const seed of [0, 1, 7, 12345, 99999]) {
      const options = orderOptionsForBeat(question, seed);
      const dto = toClientQuestion({ question, conceptId: "c-x", options });
      for (const option of dto.options) {
        const source = question.options.find((o) => o.id === option.id);
        expect(source).toBeDefined();
        expect(option.media?.signRef).toBe(source?.media?.signRef);
      }
    }
  });

  it("still ships no answer — media is not a leak, `correct` is", () => {
    const question = comparisonQuestion();
    question.options[1].whyWrongBg = "защото…";
    const dto = toClientQuestion({
      question,
      conceptId: "c-x",
      options: question.options,
    });
    for (const option of dto.options) {
      // Exhaustive on KEYS, not on two known names: the bank's option shape
      // grows (whyWrongBg arrived after media did), and a spread-based mapper
      // would ship the next field the day it is added.
      expect(Object.keys(option).sort()).toEqual(["id", "media", "textBg"]);
    }
    expect(JSON.stringify(dto)).not.toContain("correct");
    expect(JSON.stringify(dto)).not.toContain("защото");
  });

  it("omits `media` entirely on a text option rather than sending null", () => {
    const question = comparisonQuestion();
    for (const option of question.options) delete option.media;
    const dto = toClientQuestion({
      question,
      conceptId: "c-x",
      options: question.options,
    });
    for (const option of dto.options) {
      expect(Object.keys(option).sort()).toEqual(["id", "textBg"]);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The real bank, dealt by the real lessons
// ---------------------------------------------------------------------------

describe("nothing is dropped between the bank and the beat", () => {
  const dealt = allLessons().flatMap((lesson) =>
    lesson.beats
      .filter((beat) => beat.kind === "quiz")
      .flatMap((beat) =>
        dealBeatQuiz(lesson.id, beat.id).map((question) => ({
          lessonId: lesson.id,
          beatId: beat.id,
          question,
        })),
      ),
  );

  it("deals the four-sign residential-zone comparison with its four faces", () => {
    // The exact item, in the exact beat, that the founder was shown blind.
    const row = dealt.find(({ question }) => question.questionId === "q-uyazvimi-072");
    expect(row).toBeDefined();
    expect(row?.lessonId).toBe("l-vulnerable-zones");
    expect(row?.question.options.map((o) => o.media?.signRef).sort()).toEqual([
      "Д15",
      "Д16",
      "Д19",
      "Д24",
    ]);
    // …and its captions really are the interchangeable ones, so this test is
    // guarding the case it claims to guard.
    expect(row?.question.options.map((o) => o.textBg).sort()).toEqual([
      "Знак 1",
      "Знак 2",
      "Знак 3",
      "Знак 4",
    ]);
  });

  it("every dealt question shows whatever the bank holds for it", () => {
    const repo = getContentRepo();
    let checked = 0;
    for (const { question } of dealt) {
      const source = repo.questionById(question.questionId);
      expect(source).toBeDefined();
      if (source === undefined) continue;
      expect(question.media).toEqual(source.media);
      for (const option of question.options) {
        const from = source.options.find((o) => o.id === option.id);
        expect(option.media).toEqual(from?.media);
      }
      if (source.media !== null || source.options.some((o) => o.media !== undefined)) {
        checked += 1;
      }
    }
    // Not a vacuous pass: the lessons really do deal media-bearing items today
    // (five of the 184 dealt, four sign faces and one comparison).
    expect(checked).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// 3. The surfaces
// ---------------------------------------------------------------------------

/**
 * The classroom room is the ONE surface, as of this wave.
 *
 * `components/lesson/LessonRunner.tsx` carried the same defect on the same line
 * and was fixed here too — and then deleted mid-wave (doc 91 S8) because
 * `/lesson` permanentRedirects into the room and the runner was mounted by no
 * route at all. `lesson/one-front-door.test.ts` is what now holds that shut, so
 * this file does not name it: a second surface would be caught THERE, on the
 * whole tree, rather than here on a hard-coded path.
 */
const ROOM = readFileSync("src/app/(dashboard)/classroom/ClassroomRoom.tsx", "utf8");

describe("the lesson surface draws it", () => {
  // Source-text assertions, as micro-quiz-media.test.ts does: this repo has no
  // DOM test environment (vitest.config.ts `environment: "node"`), and the
  // property that matters — THAT the shared renderer is mounted at all — is a
  // property of the source. The pixels were checked by hand at 390x844.
  it("renders faces through the shared theory component", () => {
    // REUSE, not a second renderer. Four surfaces, one <SignFace>.
    expect(ROOM).toContain('from "@/components/theory/QuestionMedia"');
    expect(ROOM).toContain("hasSignOptions(question.options)");
    expect(ROOM).toMatch(/<QuestionArtwork[\s\S]{0,80}media=\{question\.media\}/);
    expect(ROOM).toMatch(/<SignFace\s+signRef=\{o\.media\.signRef\}/);
    // The picture grid, not a column of captions.
    expect(ROOM).toContain("grid-cols-2");
  });

  it("labels a face with the option's own caption, never the sign", () => {
    // altBg={o.textBg} is „Знак 3" — neutral. Anything derived from the sign
    // code or its name would read the answer out to a screen reader.
    expect(ROOM).toContain("altBg={o.textBg}");
    expect(ROOM).not.toMatch(/altBg=\{[^}]*signRef/);
  });

  it("gives the sideways phone one row of four, not two rows of two", () => {
    // MEASURED at 844x390 in the room, not reasoned about: two columns put the
    // four tiles on two rows and left „Отговори" 34px below the bottom of the
    // board column, which scrolls. Four signs a student can see and no button
    // to answer them with is the same defect in a different place. One row: 0px
    // of column scroll, button at y=242 of 390.
    expect(ROOM).toMatch(/dense \? "grid-cols-4" : "grid-cols-2"/);
  });

  it("caps the question's own artwork instead of pushing the answers away", () => {
    // Also measured, at 390x844: the four sign questions the lessons deal fit
    // the 503px board column with 0px to spare, and an uncapped 106px artwork
    // block put 11–81px of them under the fold. <QuestionArtwork> is the
    // product's own answer to that — capped, and one tap from full screen —
    // and it is what the practice runner already mounts.
    expect(ROOM).toContain("QuestionArtwork");
    expect(ROOM).toMatch(/heightPx=\{dense \? \d+ : \d+\}/);
  });
});
