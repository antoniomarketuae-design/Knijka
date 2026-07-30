/**
 * L1 — THE IN-DRIVE QUIZ MUST NEVER ASK ABOUT A PICTURE IT IS NOT SHOWING.
 *
 * The founder was quizzed mid-drive with «Кой от показаните знаци ПРЕДУПРЕЖДАВА
 * отдалеч, че приближаваш пешеходна пътека?» over four options reading
 * „Знак 1 / Знак 2 / Знак 3 / Знак 4" — and no signs. That question
 * (`q-signs-073`) is real, approved, and has four sign faces authored on its
 * options; the SIMULATOR's copy of the bank dropped them. `MicroQuizOption` was
 * `{ id, textBg }`, `MicroQuizQuestion` had no `media`, and the server
 * sanitizer mapped `o => ({ id, textBg })`. The artwork was truncated at the
 * module boundary and the question arrived unanswerable — not hard, not
 * ambiguous: unanswerable, because the four captions are interchangeable.
 *
 * This file is the standing gate on the repair. It asserts the INVARIANT, not
 * the incident:
 *
 *   every question the micro-quiz bank can serve either carries no media, or
 *   carries media the overlay draws in full.
 *
 * Both halves matter. Carrying the media is the fix; refusing to serve the
 * kinds we do not draw is the guard that keeps the same class of defect from
 * coming back through a media kind added later — a `sceneStill`, a photo, a
 * clip. An unanswerable question is worse than a skipped one.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import type { Question } from "@/lib/content/types";
import type { LessonSpec } from "../../contracts";
import { EXAM_LESSON, LESSONS, POLIGON_LESSONS } from "../specs";
import {
  createQuizTriggerState,
  isQuizMediaRenderable,
  observeQuizTick,
  QUIZ_RENDERABLE_MEDIA_KINDS,
  QUIZ_TARGET_CONCEPT_IDS,
  toMicroQuizMedia,
  type MicroQuizQuestion,
} from "../quiz-trigger";
import { tickWithEvents } from "./fixtures";

const SRC = resolve(__dirname, "../../../..");
const ACTIONS = readFileSync(
  resolve(SRC, "app/(dashboard)/simulator/micro-quiz-actions.ts"),
  "utf8",
);
const OVERLAY = readFileSync(
  resolve(SRC, "components/sim/lesson-ui/MicroQuizOverlay.tsx"),
  "utf8",
);

/** A numeric `const NAME = n;` out of the server action — see buildBank. */
function actionConst(name: string): number {
  const m = new RegExp(`const ${name} = (\\d+);`).exec(ACTIONS);
  if (m === null) throw new Error(`micro-quiz-actions.ts declares no ${name}`);
  return Number(m[1]);
}

/**
 * The lessons that can actually pop a quiz. LessonPlayShell never even fetches
 * a bank for an exam session (A13) or the mistake-experience sandbox (THEO-3),
 * so those are not part of "what the quiz can serve".
 */
const QUIZZABLE_LESSONS: readonly LessonSpec[] = [
  ...LESSONS,
  ...POLIGON_LESSONS,
  EXAM_LESSON,
].filter((l) => l.examMode !== true && l.mistakeExperience === undefined);

/**
 * loadMicroQuizBank's selection, replayed over the real content repo.
 *
 * It is a replay rather than a call because the action is a `"use server"`
 * module behind requireUser + the simulator entitlement. The two constants it
 * turns on are READ OUT OF ITS SOURCE, so the replay cannot drift from the
 * thing it claims to model without this file failing.
 */
function buildBank(lesson: LessonSpec): Question[] {
  const maxPerConcept = actionConst("MAX_PER_CONCEPT");
  const maxBank = actionConst("MAX_BANK");
  const repo = getContentRepo();
  const conceptIds = [...new Set([...lesson.conceptIds, ...QUIZ_TARGET_CONCEPT_IDS])];
  const bank: Question[] = [];
  const seen = new Set<string>();
  for (const conceptId of conceptIds) {
    let taken = 0;
    for (const q of repo.questionsByConcept(conceptId)) {
      if (bank.length >= maxBank) break;
      if (taken >= maxPerConcept) break;
      if (seen.has(q.id)) continue;
      if (!isQuizMediaRenderable(q)) continue; // the guard under test
      seen.add(q.id);
      taken += 1;
      bank.push(q);
    }
    if (bank.length >= maxBank) break;
  }
  return bank;
}

/** Every distinct question any quizzable lesson's bank can hold. */
function servableQuestions(): Question[] {
  const byId = new Map<string, Question>();
  for (const lesson of QUIZZABLE_LESSONS) {
    for (const q of buildBank(lesson)) byId.set(q.id, q);
  }
  return [...byId.values()];
}

/** The sanitizer's mapping, as micro-quiz-actions.ts performs it. */
function sanitize(q: Question): MicroQuizQuestion {
  return {
    id: q.id,
    conceptIds: q.conceptIds,
    type: q.type,
    textBg: q.textBg,
    points: q.points,
    media: toMicroQuizMedia(q.media),
    options: q.options.map((o) => {
      const media = toMicroQuizMedia(o.media);
      return media === null
        ? { id: o.id, textBg: o.textBg }
        : { id: o.id, textBg: o.textBg, media };
    }),
  };
}

const mediaKind = (m: unknown): string =>
  m === null || m === undefined
    ? "none"
    : String((m as { kind?: unknown; type?: unknown }).kind ??
        (m as { type?: unknown }).type ??
        "unknown");

// ---------------------------------------------------------------------------

describe("L1 — the micro-quiz bank never serves a picture it will not draw", () => {
  it("every servable question either has no media or keeps all of it", () => {
    const servable = servableQuestions();
    // Vacuity guard: an empty bank would make every assertion below pass.
    expect(servable.length).toBeGreaterThan(50);

    const broken: string[] = [];
    for (const q of servable) {
      const s = sanitize(q);
      if (q.media !== null && s.media === null) {
        broken.push(`${q.id}: question media ${mediaKind(q.media)} dropped`);
      }
      for (const [i, o] of q.options.entries()) {
        if (o.media != null && s.options[i].media === undefined) {
          broken.push(`${q.id}/${o.id}: option media ${mediaKind(o.media)} dropped`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("carries the artwork of every media question the bank now serves", () => {
    // THE CENSUS, measured 2026-07-30 over the 10 quizzable lessons
    // (8 curriculum + 2 полигон; the exam never quizzes). 98 distinct
    // questions are servable.
    //
    // BEFORE: 6 of the 98 carried artwork and ALL SIX were served stripped —
    //   3 question-level sign faces  q-signs-038, q-signs-058, q-signs-074
    //   2 sign-identification grids  q-signs-073 (the founder's), q-signs-083
    //   1 sceneStill                 q-speed-066
    // AFTER: 5 of them render — 3 question faces + 8 option faces = 11 sign
    // faces that used to be nothing at all — and q-speed-066 is refused rather
    // than served blind. The bank did NOT shrink: still 98 distinct questions,
    // because the guard runs before the concept spends a slot, so its concept
    // simply took the next question instead.
    const servable = servableQuestions();
    expect(servable).toHaveLength(98);

    const withQuestionMedia = servable.filter((q) => q.media !== null);
    const withOptionMedia = servable.filter((q) => q.options.some((o) => o.media != null));
    expect(withQuestionMedia.map((q) => q.id).sort()).toEqual([
      "q-signs-038",
      "q-signs-058",
      "q-signs-074",
    ]);
    expect(withOptionMedia.map((q) => q.id).sort()).toEqual([
      "q-signs-073",
      "q-signs-083",
    ]);
    // 11 faces on the screen where there were 0.
    const faces =
      withQuestionMedia.length +
      withOptionMedia.reduce(
        (n, q) => n + q.options.filter((o) => o.media != null).length,
        0,
      );
    expect(faces).toBe(11);
    // ...and the one item we refuse is gone from every bank.
    expect(servable.some((q) => q.id === "q-speed-066")).toBe(false);
    for (const q of withQuestionMedia) {
      expect(mediaKind(q.media), `${q.id}`).toBe("sign");
      expect(sanitize(q).media?.signRef).toBe(
        (q.media as { signRef: string }).signRef,
      );
    }
    for (const q of withOptionMedia) {
      const s = sanitize(q);
      for (const [i, o] of q.options.entries()) {
        if (o.media == null) continue;
        expect(s.options[i].media?.signRef, `${q.id}/${o.id}`).toBe(o.media.signRef);
      }
    }
  });

  it("refuses every media kind the overlay does not draw", () => {
    // The refusal is what makes the invariant hold for kinds we have NOT built
    // a render for. Checked against the whole 1,089-question repo, not just the
    // reachable slice, because the reachable slice grows with every lesson.
    const repo = getContentRepo();
    const all = new Map<string, Question>();
    for (const conceptId of new Set([
      ...QUIZZABLE_LESSONS.flatMap((l) => l.conceptIds),
      ...QUIZ_TARGET_CONCEPT_IDS,
    ])) {
      for (const q of repo.questionsByConcept(conceptId)) all.set(q.id, q);
    }
    const refused = [...all.values()].filter((q) => !isQuizMediaRenderable(q));
    for (const q of refused) {
      const kinds = [mediaKind(q.media), ...q.options.map((o) => mediaKind(o.media))];
      expect(
        kinds.some((k) => k !== "none" && !QUIZ_RENDERABLE_MEDIA_KINDS.includes(k)),
        `${q.id} was refused but every kind on it is renderable`,
      ).toBe(true);
    }
    // Today that is the sceneStill family and nothing else.
    expect(refused.map((q) => mediaKind(q.media)).every((k) => k === "sceneStill")).toBe(
      true,
    );
  });

  it("the exact question the founder was shown is now answerable", () => {
    // «Кой от показаните знаци ПРЕДУПРЕЖДАВА отдалеч, че приближаваш пешеходна
    // пътека?» — q-signs-073, concept c-crosswalk-yield, which is a
    // QUIZ_TARGET concept, so it is in EVERY lesson's bank. Its four options
    // are Д17 / Е21 / А18 / А19 and their captions are „Знак 1"…„Знак 4".
    const q = getContentRepo()
      .questionsByConcept("c-crosswalk-yield")
      .find((x) => x.id === "q-signs-073");
    expect(q, "q-signs-073 is gone from the bank").toBeDefined();
    expect(q!.options.map((o) => o.textBg)).toEqual([
      "Знак 1",
      "Знак 2",
      "Знак 3",
      "Знак 4",
    ]);
    const s = sanitize(q!);
    expect(s.options.map((o) => o.media?.signRef)).toEqual(["Д17", "Е21", "А18", "А19"]);
    // ...and it is actually reachable: it appears in a real lesson's bank.
    expect(servableQuestions().some((x) => x.id === "q-signs-073")).toBe(true);
  });
});

describe("the guard, at the trigger", () => {
  const base = {
    conceptIds: ["c-crosswalk-yield"],
    type: "single" as const,
    points: 1 as const,
    options: [
      { id: "a", textBg: "А" },
      { id: "b", textBg: "Б" },
    ],
  };
  const CROSSING = {
    kind: "crossingZoneEntered" as const,
    crossingId: "x1",
    pedestrianOnCrossing: true,
  };

  it("skips a bank item whose media kind it cannot draw, and takes the next", () => {
    // Defence in depth: even if a future server carried a kind through, the
    // pure trigger refuses it rather than popping a blank question.
    const bank = [
      {
        ...base,
        id: "q-scene",
        textBg: "Виж схемата",
        media: { kind: "sceneStill", districtId: "d" },
      } as unknown as MicroQuizQuestion,
      { ...base, id: "q-text", textBg: "Текстов въпрос" },
    ];
    const r = observeQuizTick(
      createQuizTriggerState("frequent", bank),
      tickWithEvents(5, [CROSSING]),
    );
    expect(r.quiz?.id).toBe("q-text");
  });

  it("stays silent rather than serve the only on-topic question blind", () => {
    const bank = [
      {
        ...base,
        id: "q-scene-only",
        textBg: "Виж схемата",
        media: { kind: "sceneStill", districtId: "d" },
      } as unknown as MicroQuizQuestion,
    ];
    const r = observeQuizTick(
      createQuizTriggerState("frequent", bank),
      tickWithEvents(5, [CROSSING]),
    );
    expect(r.quiz).toBeNull();
    expect(r.state.shownCount).toBe(0);
  });

  it("serves a sign question whole — question face and option faces", () => {
    const bank: MicroQuizQuestion[] = [
      {
        ...base,
        id: "q-sign",
        textBg: "Какво означава този знак?",
        media: { kind: "sign", signRef: "А18" },
        options: [
          { id: "a", textBg: "Знак 1", media: { kind: "sign", signRef: "Б2" } },
          { id: "b", textBg: "Знак 2", media: { kind: "sign", signRef: "А18" } },
        ],
      },
    ];
    const r = observeQuizTick(
      createQuizTriggerState("frequent", bank),
      tickWithEvents(5, [CROSSING]),
    );
    expect(r.quiz?.media).toEqual({ kind: "sign", signRef: "А18" });
    expect(r.quiz?.options.map((o) => o.media?.signRef)).toEqual(["Б2", "А18"]);
  });

  it("toMicroQuizMedia refuses malformed and foreign shapes", () => {
    expect(toMicroQuizMedia(null)).toBeNull();
    expect(toMicroQuizMedia(undefined)).toBeNull();
    expect(toMicroQuizMedia({ type: "image", ref: "x.png" })).toBeNull();
    expect(toMicroQuizMedia({ kind: "sceneStill", districtId: "d" })).toBeNull();
    expect(toMicroQuizMedia({ kind: "sign" })).toBeNull();
    expect(toMicroQuizMedia({ kind: "sign", signRef: "" })).toBeNull();
    expect(toMicroQuizMedia({ kind: "sign", signRef: "А18" })).toEqual({
      kind: "sign",
      signRef: "А18",
    });
  });
});

describe("the picture reaches the screen", () => {
  it("the sanitizer carries media instead of dropping it", () => {
    // The exact line that caused L1 was `o => ({ id: o.id, textBg: o.textBg })`.
    expect(ACTIONS).toMatch(/media:\s*toMicroQuizMedia\(q\.media\)/);
    expect(ACTIONS).toMatch(/toMicroQuizMedia\(o\.media\)/);
    expect(ACTIONS).toContain("isQuizMediaRenderable(q)");
    // The guard must run BEFORE the concept spends one of its slots, or
    // refusing an item would silently shrink the bank.
    const guardAt = ACTIONS.indexOf("isQuizMediaRenderable(q)");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(ACTIONS.indexOf("takenForConcept += 1"));
    expect(guardAt).toBeLessThan(ACTIONS.indexOf("seen.add(q.id)"));
  });

  it("the overlay renders the faces through the theory component", () => {
    // The same SignFace / QuestionMediaView / hasSignOptions the practice and
    // exam runners mount — one implementation, so the surfaces cannot diverge.
    expect(OVERLAY).toContain('from "@/components/theory/QuestionMedia"');
    expect(OVERLAY).toContain("hasSignOptions(quiz.options)");
    expect(OVERLAY).toMatch(/<QuestionMediaView media=\{media\}/);
    expect(OVERLAY).toMatch(/<SignFace\s+signRef=\{option\.media\.signRef\}/);
    // The picture grid, and the option's own caption as its accessible name —
    // never a label that names the sign (that would answer the question).
    expect(OVERLAY).toContain("grid-cols-2");
    expect(OVERLAY).toContain("altBg={option.textBg}");
  });

  it("sizes the faces by viewport HEIGHT, not by a width breakpoint", () => {
    // Captured at 852x393 (iPhone 16 landscape — how the simulator is held):
    // 852 is ABOVE Tailwind's `sm`, so a width-based rule served desktop sizes
    // and two of the four tiles sat below the fold. Card bottom was 370px of a
    // 393px viewport after this change, with 1px of overlay scroll.
    expect(OVERLAY).toContain("isCompactViewport");
    expect(OVERLAY).toContain("COMPACT_MAX_HEIGHT_PX");
    expect(OVERLAY).toMatch(/short \? "grid-cols-4" : "grid-cols-2"/);
    // The practice runner's 3-column rule leaves a 4th sign alone on row two
    // in this narrower card — and it is width-based, which is the bug above.
    expect(OVERLAY).not.toContain("sm:grid-cols-3");
  });
});
