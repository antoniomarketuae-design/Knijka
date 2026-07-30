"use client";

/**
 * MicroQuiz overlay — the visible half of the theory↔driving closed loop.
 * The quiz-trigger (pure) decides WHEN and WHICH; this overlay presents the
 * concept-linked question over the frozen scene (the shell pauses physics
 * while it's up), grades it via the submitMicroQuizAnswer server action —
 * which feeds the SAME mastery/readiness as theory (context "micro") — then
 * reveals the correct answer + explanation + law-ref chips and hands control
 * back so the drive resumes.
 *
 * Design-token native, Bulgarian, and modeled on the theory PracticeSession
 * so the two surfaces feel like one learning system. Answers never reach the
 * client before submission (the bank is sanitized server-side).
 */

import { useEffect, useState, useTransition } from "react";
import { IconBook, IconCheck, IconX } from "@/components/icons";
import { QuestionMediaView, SignFace, hasSignOptions } from "@/components/theory/QuestionMedia";
import { CheckControl } from "@/components/ui/CheckControl";
import type { TriggeredQuiz } from "@/modules/sim/lessons";
import { COMPACT_MAX_HEIGHT_PX, isCompactViewport } from "./immersive";
import type { MicroQuizAnswerResult } from "./types";

/**
 * WHICH VIEWPORT IS ASKING — and why this is not a `sm:` breakpoint.
 *
 * The artwork sizing here is a HEIGHT problem, not a width one, and the
 * Tailwind `sm:` breakpoint reads width. Captured at 852x393 (iPhone 16 in
 * landscape, which is how the simulator is actually held): 852 is above `sm`,
 * so every width-based rule served the DESKTOP sizes, and the card ran two of
 * its four sign tiles below the fold — a picture question with half its
 * pictures off screen, while the drive is paused waiting for an answer.
 *
 * So it reuses the product's own definition (`immersive.ts`, the one the play
 * shell already uses for its compact HUD) rather than inventing a second one.
 * `short` is the landscape-phone case that needs everything on ONE row;
 * `compact` also covers portrait phones, where two columns are still right.
 */
function useQuizViewport(): { compact: boolean; short: boolean } {
  const [v, setV] = useState({ compact: false, short: false });
  useEffect(() => {
    const read = (): void => {
      const coarse = window.matchMedia?.("(pointer: coarse)").matches === true;
      setV({
        compact: isCompactViewport(window.innerWidth, window.innerHeight, coarse),
        short: coarse && window.innerHeight <= COMPACT_MAX_HEIGHT_PX,
      });
    };
    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
    };
  }, []);
  return v;
}

/**
 * THE ARTWORK, IN A PAUSED DRIVE (L1).
 *
 * The same component the theory practice runner mounts — deliberately, because
 * a micro-quiz IS a theory question asked mid-drive and the student must not
 * have to learn a second visual language for it. Only the height budget
 * differs: the runner owns a whole page and measures the fold; this card
 * floats over a frozen 3D scene and must not push its own answers away.
 */
function QuizArtwork({
  quiz,
  compact,
  short,
}: {
  quiz: TriggeredQuiz;
  compact: boolean;
  short: boolean;
}) {
  const media = quiz.media ?? null;
  if (media === null) return null;
  const cap = short ? 64 : compact ? 80 : undefined;
  return <QuestionMediaView media={media} maxHeightPx={cap} />;
}

export function MicroQuizOverlay({
  quiz,
  onSubmit,
  onDone,
}: {
  quiz: TriggeredQuiz;
  onSubmit: (questionId: string, selectedOptionIds: string[]) => Promise<MicroQuizAnswerResult>;
  /** Resume the drive; `correct` counts into the session's quiz tally. */
  onDone: (correct: boolean) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<MicroQuizAnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, startChecking] = useTransition();

  const toggleOption = (optionId: string): void => {
    if (result !== null || isChecking) return;
    setSelected((prev) =>
      quiz.type === "single"
        ? [optionId]
        : prev.includes(optionId)
          ? prev.filter((id) => id !== optionId)
          : [...prev, optionId],
    );
  };

  const check = (): void => {
    if (result !== null || isChecking || selected.length === 0) return;
    setError(null);
    startChecking(async () => {
      try {
        setResult(await onSubmit(quiz.id, selected));
      } catch {
        setError("Проверката не мина. Продължи карането — въпросът не се брои.");
      }
    });
  };

  // Any sign-face option switches the whole list to the picture grid — the
  // same rule the practice runner uses, so the two surfaces cannot diverge.
  const signGrid = hasSignOptions(quiz.options);
  const { compact, short } = useQuizViewport();
  /* Measured at 852x393 / 393x852 / 1280x800: 64 / 80 / 96 px faces are the
     largest that keep all four tiles and the „Провери" button on screen at
     once. The student must never scroll to see an option they are being asked
     to choose between. */
  const faceClass = short ? "h-16 w-16" : compact ? "h-20 w-20" : "h-24 w-24";

  // Keyboard: 1–9 pick, Enter checks / resumes. Registered fresh each render.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (result === null && /^[1-9]$/.test(key)) {
        const i = Number(key) - 1;
        if (i < quiz.options.length) {
          e.preventDefault();
          toggleOption(quiz.options[i].id);
        }
        return;
      }
      if (e.key === "Enter") {
        const tag = e.target instanceof HTMLElement ? e.target.tagName : "";
        if (tag === "BUTTON" || tag === "A") return;
        e.preventDefault();
        if (result === null) check();
        else onDone(result.correct);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="micro-quiz-title"
    >
      <section className="card my-auto flex w-full max-w-lg flex-col gap-4 p-5 sm:p-6">
        {/* Header — "paused for a lightning question" */}
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"
          >
            <IconBook className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="micro-quiz-title" className="text-sm font-black leading-tight">
              Проверка в движение
            </h2>
            <p className="text-xs text-muted">Пауза — светкавичен въпрос от пътната ситуация</p>
          </div>
          <span className="ml-auto rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-muted">
            {quiz.points} т.
          </span>
        </div>

        {/* The artwork the question is ABOUT — above the text, as in theory. */}
        <QuizArtwork quiz={quiz} compact={compact} short={short} />

        {/* Question + options */}
        <fieldset className="min-w-0" disabled={isChecking}>
          <legend className="text-base font-extrabold leading-snug">{quiz.textBg}</legend>
          {quiz.type === "multi" ? (
            <p className="mt-1.5 text-xs font-bold text-accent">Избери всички верни отговори.</p>
          ) : null}
          {/* THE PICTURE GRID's SHAPE.
              Two columns, not the three the practice runner uses: that runner
              owns a max-w-2xl page, this card is max-w-lg, and three columns
              leave a fourth sign alone on a second row — which reads as three
              options and an afterthought. On a LANDSCAPE phone all four go in
              ONE row instead, because there a second row is below the fold and
              a picture question with half its pictures off screen is the same
              defect L1 was, wearing a different costume. */}
          <ul
            className={
              signGrid
                ? `mt-3 grid gap-2 ${short ? "grid-cols-4" : "grid-cols-2"}`
                : "mt-3 flex flex-col gap-2"
            }
          >
            {quiz.options.map((option, i) => {
              const isSelected = selected.includes(option.id);
              const isCorrectOption = result !== null && result.correctOptionIds.includes(option.id);
              const isWrongPick = result !== null && isSelected && !isCorrectOption;

              let stateClasses = "border-border bg-surface-2/60 hover:border-border-strong";
              if (result === null) {
                if (isSelected) stateClasses = "border-accent bg-accent/10 shadow-glow-sm";
              } else if (isCorrectOption) {
                stateClasses = "border-success bg-success/10";
              } else if (isWrongPick) {
                stateClasses = "border-danger bg-danger/10";
              } else {
                stateClasses = "border-border opacity-60";
              }

              if (signGrid) {
                // SIGN IDENTIFICATION — the option IS the picture (L1).
                // `textBg` here is only the accessible name („Знак 3"), which
                // is exactly why the text-only rendering was unanswerable: the
                // four captions are interchangeable. Same tile as the practice
                // runner, including the sr-only control (the whole picture is
                // the label; a tick box in a sign grid is a stray square) —
                // the one exception checkControl.test.ts sanctions.
                return (
                  <li key={option.id} className="min-w-0">
                    <label
                      className={`flex h-full flex-col items-center gap-1.5 rounded-xl border p-2 transition focus-within:ring-2 focus-within:ring-accent/50 motion-reduce:transition-none ${stateClasses} ${
                        result === null ? "cursor-pointer" : "cursor-default"
                      }`}
                    >
                      <input
                        type={quiz.type === "single" ? "radio" : "checkbox"}
                        name={`micro-quiz-${quiz.id}`}
                        value={option.id}
                        checked={isSelected}
                        onChange={() => toggleOption(option.id)}
                        disabled={result !== null}
                        className="sr-only"
                      />
                      <span className="flex w-full items-center justify-between">
                        <span
                          aria-hidden
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface font-mono text-[11px] font-bold text-muted"
                        >
                          {i + 1}
                        </span>
                        {isCorrectOption ? (
                          <IconCheck aria-hidden className="h-4 w-4 text-success" />
                        ) : isWrongPick ? (
                          <IconX aria-hidden className="h-4 w-4 text-danger" />
                        ) : null}
                      </span>
                      {option.media !== undefined ? (
                        <SignFace
                          signRef={option.media.signRef}
                          /* Neutral by design: the label must never name the
                             sign on an identification question. */
                          altBg={option.textBg}
                          className={faceClass}
                        />
                      ) : (
                        <span className="flex min-h-16 items-center text-center text-sm leading-relaxed">
                          {option.textBg}
                        </span>
                      )}
                      {isCorrectOption ? (
                        <span className="text-[11px] font-bold text-success">Верен отговор</span>
                      ) : isWrongPick ? (
                        <span className="text-[11px] font-bold text-danger">Твоят избор</span>
                      ) : null}
                    </label>
                  </li>
                );
              }

              return (
                <li key={option.id}>
                  <label
                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm transition motion-reduce:transition-none ${stateClasses} ${
                      result === null ? "cursor-pointer" : "cursor-default"
                    }`}
                  >
                    {/* Same control as the theory runners — a micro-quiz IS a
                        theory question, asked mid-drive, and the student who
                        has ten seconds of paused physics to answer it is the
                        one who can least afford to hunt for the box. */}
                    <CheckControl
                      type={quiz.type === "single" ? "radio" : "checkbox"}
                      name={`micro-quiz-${quiz.id}`}
                      value={option.id}
                      checked={isSelected}
                      onChange={() => toggleOption(option.id)}
                      disabled={result !== null}
                      className="mt-1"
                    />
                    <span
                      aria-hidden
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-[11px] font-bold text-muted"
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 leading-relaxed">{option.textBg}</span>
                    {isCorrectOption ? (
                      <IconCheck className="h-4 w-4 shrink-0 text-success" aria-label="Верен отговор" />
                    ) : null}
                    {isWrongPick ? (
                      <IconX className="h-4 w-4 shrink-0 text-danger" aria-label="Твоят избор" />
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        {/* Feedback */}
        <div aria-live="polite">
          {result !== null ? (
            <div
              className={`rounded-xl border p-4 ${
                result.correct ? "border-success/40 bg-success/10" : "border-danger/40 bg-danger/10"
              }`}
            >
              <p
                className={`flex items-center gap-2 text-sm font-extrabold ${
                  result.correct ? "text-success" : "text-danger"
                }`}
              >
                {result.correct ? <IconCheck className="h-5 w-5" /> : <IconX className="h-5 w-5" />}
                {result.correct ? "Правилно!" : "Грешен отговор"}
              </p>
              <p className="mt-2 text-sm leading-relaxed">{result.explanationBg}</p>
              {result.lawRefs.length > 0 ? (
                <ul aria-label="Правни основания" className="mt-3 flex flex-wrap gap-1.5">
                  {result.lawRefs.map((law) => (
                    <li
                      key={`${law.act}-${law.ref}`}
                      className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-muted"
                    >
                      {law.act} {law.ref}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {result === null ? (
            <button
              type="button"
              onClick={check}
              disabled={selected.length === 0 || isChecking}
              className="btn-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
            >
              {isChecking ? "Проверявам…" : "Провери"}
            </button>
          ) : (
            <button type="button" onClick={() => onDone(result.correct)} className="btn-accent">
              Продължи карането
            </button>
          )}
          {error !== null ? (
            <button type="button" onClick={() => onDone(false)} className="btn-ghost px-4 py-2 text-xs">
              Продължи
            </button>
          ) : null}
          {error !== null ? (
            <p role="alert" className="w-full text-sm font-semibold text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
