"use client";

/**
 * The real MicroQuizOverlay, over the real bank shape, on a stand-in for the
 * frozen 3D scene. Nothing here ships to students; the fixtures below are
 * copies of live content items (q-signs-073, q-signs-038) in exactly the shape
 * loadMicroQuizBank now returns — media carried, `correct` flags absent.
 */

import { useState } from "react";
import { MicroQuizOverlay } from "@/components/sim/lesson-ui/MicroQuizOverlay";
import type { MicroQuizAnswerResult } from "@/components/sim/lesson-ui/types";
import type { TriggeredQuiz } from "@/modules/sim/lessons";

/** q-signs-073 — the item the founder was shown as four bare captions. */
const SIGN_GRID_QUIZ: TriggeredQuiz = {
  id: "q-signs-073",
  conceptId: "c-crosswalk-yield",
  conceptIds: ["c-warning-signs", "c-crosswalk-yield"],
  type: "single",
  points: 2,
  textBg: "Кой от показаните знаци ПРЕДУПРЕЖДАВА отдалеч, че приближаваш пешеходна пътека?",
  media: null,
  options: [
    { id: "a", textBg: "Знак 1", media: { kind: "sign", signRef: "Д17" } },
    { id: "b", textBg: "Знак 2", media: { kind: "sign", signRef: "Е21" } },
    { id: "c", textBg: "Знак 3", media: { kind: "sign", signRef: "А18" } },
    { id: "d", textBg: "Знак 4", media: { kind: "sign", signRef: "А19" } },
  ],
};

/** A question-level face: the artwork sits above the text, as in theory. */
const SIGN_FACE_QUIZ: TriggeredQuiz = {
  id: "q-signs-038",
  conceptId: "c-give-way-stop-behavior",
  conceptIds: ["c-stop-give-way-signs"],
  type: "single",
  points: 2,
  textBg: "Какво изисква от теб този знак?",
  media: { kind: "sign", signRef: "Б2" },
  options: [
    { id: "a", textBg: "Спираш напълно, дори пътят да е свободен" },
    { id: "b", textBg: "Намаляваш и продължаваш, ако е чисто" },
    { id: "c", textBg: "Имаш предимство пред насрещните" },
  ],
};

/** A text-only question — the shape that always worked, kept as the control. */
const TEXT_QUIZ: TriggeredQuiz = {
  id: "q-text-control",
  conceptId: "c-crosswalk-yield",
  conceptIds: ["c-crosswalk-yield"],
  type: "single",
  points: 1,
  textBg: "Пешеходец е стъпил на пешеходната пътека. Какво правиш?",
  options: [
    { id: "a", textBg: "Спираш и го изчакваш да премине" },
    { id: "b", textBg: "Подавам звуков сигнал и продължавам" },
  ],
};

const FIXTURES: ReadonlyArray<{ key: string; labelBg: string; quiz: TriggeredQuiz }> = [
  { key: "grid", labelBg: "Sign grid (q-signs-073)", quiz: SIGN_GRID_QUIZ },
  { key: "face", labelBg: "Question face (q-signs-038)", quiz: SIGN_FACE_QUIZ },
  { key: "text", labelBg: "Text only (control)", quiz: TEXT_QUIZ },
];

const RESULTS: Record<string, MicroQuizAnswerResult> = {
  "q-signs-073": {
    correct: false,
    correctOptionIds: ["c"],
    explanationBg:
      "Триъгълникът А18 предупреждава предварително, за да намалиш навреме; синият квадрат Д17 стои на самата пътека, а Е21 сочи подлез или надлез.",
    lawRefs: [
      { act: "Наредба № РД-02-21-1/23.11.2023", ref: "знак А18" },
      { act: "ЗДвП", ref: "чл. 119" },
    ],
  },
  "q-signs-038": {
    correct: true,
    correctOptionIds: ["a"],
    explanationBg:
      "Б2 „Спри! Пропусни движещите се по пътя с предимство“ изисква ПЪЛНО спиране пред стоп-линията, дори когато няма никого.",
    lawRefs: [{ act: "ЗДвП", ref: "чл. 47" }],
  },
  "q-text-control": {
    correct: true,
    correctOptionIds: ["a"],
    explanationBg: "Пешеходец, стъпил на пътеката, е с предимство — спираш.",
    lawRefs: [{ act: "ЗДвП", ref: "чл. 119" }],
  },
};

export function MicroQuizDevClient() {
  const [pick, setPick] = useState(0);
  const quiz = FIXTURES[pick].quiz;

  return (
    // The overlay is `absolute inset-0` inside the play shell's canvas area,
    // which fills the viewport — so the stand-in scene must too, or a landscape
    // capture measures the harness's chrome instead of the overlay.
    <main className="fixed inset-0 overflow-hidden bg-surface-2">
      <MicroQuizOverlay
        key={quiz.id}
        quiz={quiz}
        onSubmit={async (questionId) =>
          RESULTS[questionId] ?? {
            correct: false,
            correctOptionIds: [],
            explanationBg: "—",
            lawRefs: [],
          }
        }
        onDone={() => setPick((p) => (p + 1) % FIXTURES.length)}
      />
      <div className="pointer-events-none absolute left-2 top-2 z-40 flex flex-wrap gap-1.5">
        {FIXTURES.map((f, i) => (
          <button
            key={f.key}
            type="button"
            data-fixture={f.key}
            onClick={() => setPick(i)}
            className={`pointer-events-auto rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              i === pick
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface text-muted"
            }`}
          >
            {f.labelBg}
          </button>
        ))}
      </div>
    </main>
  );
}
