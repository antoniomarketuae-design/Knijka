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
import type { TriggeredQuiz } from "@/modules/sim/lessons";
import type { MicroQuizAnswerResult } from "./types";

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

        {/* Question + options */}
        <fieldset className="min-w-0" disabled={isChecking}>
          <legend className="text-base font-extrabold leading-snug">{quiz.textBg}</legend>
          {quiz.type === "multi" ? (
            <p className="mt-1.5 text-xs font-bold text-accent">Избери всички верни отговори.</p>
          ) : null}
          <ul className="mt-3 flex flex-col gap-2">
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

              return (
                <li key={option.id}>
                  <label
                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm transition motion-reduce:transition-none ${stateClasses} ${
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
                      className="mt-1 h-4 w-4 shrink-0 accent-accent"
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
