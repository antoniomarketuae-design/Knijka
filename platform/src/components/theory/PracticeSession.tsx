"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { submitPracticeAnswer } from "@/app/(dashboard)/theory/practice/actions";
import { IconArrowRight, IconCheck, IconTarget, IconX } from "@/components/icons";
import { Gauge } from "@/components/hud/Gauge";
import type { PracticeQuestionDto, PracticeSubmitResult } from "./types";

/**
 * Client-side practice runner: one question at a time, immediate feedback
 * after each answer via the submitPracticeAnswer server action, summary at
 * the end. All grading happens on the server — the client never sees the
 * correct options before submitting.
 */

const REASON_BADGES: Record<
  PracticeQuestionDto["reason"],
  { labelBg: string; className: string }
> = {
  "due-review": { labelBg: "Преговор", className: "bg-warning/15 text-warning" },
  // Info tone, not danger: this flags a concept to focus on *before* answering —
  // it must not wear the same red as a wrong answer.
  "weak-concept": { labelBg: "Слабо място", className: "bg-accent-2/15 text-accent-2" },
  "new-concept": { labelBg: "Ново", className: "bg-accent/15 text-accent" },
};

function toPct(value: number): number {
  return Math.round(value * 100);
}

function deltaClass(delta: number): string {
  if (delta > 0) return "text-success";
  if (delta < 0) return "text-danger";
  return "text-muted";
}

function formatDelta(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${delta}%`;
}

interface AnswerRecord {
  questionId: string;
  conceptId: string;
  conceptTitleBg: string;
  topicSlug: string | null;
  topicTitleBg: string | null;
  correct: boolean;
  masteryBefore: number;
  masteryAfter: number;
}

export function PracticeSession({
  questions,
  quota = null,
}: {
  questions: PracticeQuestionDto[];
  /** Free-tier counter („Днес: X от Y безплатни въпроса"); null = unlimited. */
  quota?: { usedToday: number; limit: number } | null;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<PracticeSubmitResult | null>(null);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, startChecking] = useTransition();

  const current = index < questions.length ? questions[index] : null;
  const isLast = index === questions.length - 1;

  const toggleOption = (optionId: string): void => {
    if (current === null || result !== null || isChecking) return;
    setSelected((prev) =>
      current.type === "single"
        ? [optionId]
        : prev.includes(optionId)
          ? prev.filter((id) => id !== optionId)
          : [...prev, optionId],
    );
  };

  const check = (): void => {
    if (current === null || result !== null || isChecking || selected.length === 0) {
      return;
    }
    setError(null);
    startChecking(async () => {
      try {
        const submitted = await submitPracticeAnswer(current.id, selected);
        setResult(submitted);
        setAnswers((prev) => [
          ...prev,
          {
            questionId: current.id,
            conceptId: current.conceptId,
            conceptTitleBg: current.conceptTitleBg,
            topicSlug: current.topicSlug,
            topicTitleBg: current.topicTitleBg,
            correct: submitted.correct,
            masteryBefore: submitted.masteryBefore,
            masteryAfter: submitted.masteryAfter,
          },
        ]);
      } catch {
        setError("Проверката не мина. Провери връзката и опитай отново.");
      }
    });
  };

  const next = (): void => {
    if (result === null) return;
    setResult(null);
    setSelected([]);
    setError(null);
    setIndex((i) => i + 1);
  };

  // Keyboard shortcuts: 1–9 / A–H pick an option, Enter confirms/advances.
  // Registered fresh each render so the handler always closes over current
  // state; buttons and links keep their native Enter activation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || current === null) return;
      const key = e.key.toLowerCase();

      if (result === null) {
        let optionIndex = -1;
        if (/^[1-9]$/.test(key)) optionIndex = Number(key) - 1;
        else if (key.length === 1 && key >= "a" && key <= "h") {
          optionIndex = key.charCodeAt(0) - "a".charCodeAt(0);
        }
        if (optionIndex >= 0 && optionIndex < current.options.length) {
          e.preventDefault();
          toggleOption(current.options[optionIndex].id);
          return;
        }
      }

      if (e.key === "Enter") {
        const tag = e.target instanceof HTMLElement ? e.target.tagName : "";
        if (tag === "BUTTON" || tag === "A") return;
        e.preventDefault();
        if (result === null) check();
        else next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (current === null) {
    return <SessionSummary answers={answers} />;
  }

  const answeredCount = answers.length;
  const correctCount = answers.reduce((n, a) => n + (a.correct ? 1 : 0), 0);
  const badge = REASON_BADGES[current.reason];

  return (
    <section
      aria-label={`Въпрос ${index + 1} от ${questions.length}`}
      className="card mx-auto flex w-full max-w-2xl flex-col gap-6 p-5 sm:p-7"
    >
      {/* Progress */}
      <div className="flex flex-col gap-2.5">
        {quota !== null ? (
          // Live free-tier meter: answers in this session count toward today.
          <p className="font-mono text-[11px] font-bold tabular-nums text-muted">
            Днес:{" "}
            <span className="text-accent">
              {Math.min(quota.limit, quota.usedToday + answeredCount)}
            </span>{" "}
            от {quota.limit} безплатни въпроса
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold tabular-nums text-muted">
            Въпрос <span className="font-bold text-foreground">{index + 1}</span> от{" "}
            {questions.length}
            {answeredCount > 0 ? (
              <span className="ml-2 text-xs font-semibold text-accent-2">
                ({correctCount} верни досега)
              </span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.className}`}
            >
              {badge.labelBg}
            </span>
            <span className="rounded-full border border-hair px-2.5 py-1 font-mono text-[11px] font-bold text-muted">
              {current.points} т.
            </span>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Напредък в тренировката"
          aria-valuemin={0}
          aria-valuemax={questions.length}
          aria-valuenow={answeredCount}
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question + options */}
      <fieldset className="min-w-0" disabled={isChecking}>
        <legend className="max-w-[62ch] text-lg font-bold leading-relaxed text-foreground sm:text-xl">
          {current.textBg}
        </legend>
        {current.type === "multi" ? (
          <p className="mt-2 text-xs font-bold text-accent">
            Избери всички верни отговори.
          </p>
        ) : null}
        <ul className="mt-4 flex flex-col gap-2.5">
          {current.options.map((option, optionIndex) => {
            const isSelected = selected.includes(option.id);
            const isCorrectOption =
              result !== null && result.correctOptionIds.includes(option.id);
            const isWrongPick = result !== null && isSelected && !isCorrectOption;

            let stateClasses =
              "border-border bg-surface-2/50 hover:border-border-strong hover:bg-surface-2";
            if (result === null) {
              if (isSelected)
                stateClasses =
                  "border-accent bg-accent/10 shadow-glow-sm motion-safe:scale-[1.01]";
            } else if (isCorrectOption) {
              stateClasses =
                "border-success bg-success/10 shadow-[0_0_18px_-6px_var(--success)] motion-safe:scale-[1.01]";
            } else if (isWrongPick) {
              stateClasses = "border-danger bg-danger/10";
            } else {
              stateClasses = "border-border opacity-55";
            }

            return (
              <li key={option.id}>
                <label
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm transition duration-200 ease-out focus-within:ring-2 focus-within:ring-accent/50 motion-reduce:transition-none motion-reduce:transform-none ${stateClasses} ${
                    result === null ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  <input
                    type={current.type === "single" ? "radio" : "checkbox"}
                    name={`practice-${current.id}`}
                    value={option.id}
                    checked={isSelected}
                    onChange={() => toggleOption(option.id)}
                    disabled={result !== null}
                    className="mt-1 h-4 w-4 shrink-0 accent-accent"
                  />
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-hair bg-surface font-mono text-[11px] font-bold text-muted"
                  >
                    {optionIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1 leading-relaxed">
                    {option.textBg}
                  </span>
                  {isCorrectOption ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-success">
                      <IconCheck className="h-4 w-4" />
                      Верен отговор
                    </span>
                  ) : null}
                  {isWrongPick ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-danger">
                      <IconX className="h-4 w-4" />
                      Твоят избор
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {/* Feedback — the live region stays mounted so the update is announced */}
      <div aria-live="polite">
        {result !== null ? (
          <FeedbackPanel result={result} conceptTitleBg={current.conceptTitleBg} />
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
          <button type="button" onClick={next} className="btn-accent">
            {isLast ? "Виж резултата" : "Напред"}
            <IconArrowRight className="h-4 w-4" />
          </button>
        )}
        {error !== null ? (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        ) : null}
        <p className="ml-auto hidden font-mono text-[11px] text-muted md:block">
          Клавиши 1–{Math.min(current.options.length, 9)} избират отговор ·
          Enter потвърждава
        </p>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- feedback */

function FeedbackPanel({
  result,
  conceptTitleBg,
}: {
  result: PracticeSubmitResult;
  conceptTitleBg: string;
}) {
  const before = toPct(result.masteryBefore);
  const after = toPct(result.masteryAfter);
  const delta = after - before;

  return (
    <div
      className={`rounded-xl border p-4 sm:p-5 ${
        result.correct
          ? "border-success/40 bg-success/10"
          : "border-danger/40 bg-danger/10"
      }`}
    >
      <p
        className={`flex items-center gap-2 font-display text-sm font-extrabold ${
          result.correct ? "text-success" : "text-danger"
        }`}
      >
        {result.correct ? (
          <IconCheck className="h-5 w-5" />
        ) : (
          <IconX className="h-5 w-5" />
        )}
        {result.correct ? "Правилен отговор!" : "Грешен отговор"}
      </p>
      <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-foreground">
        {result.explanationBg}
      </p>
      {result.lawRefs.length > 0 ? (
        <ul aria-label="Правни основания" className="mt-3 flex flex-wrap gap-1.5">
          {result.lawRefs.map((law) => (
            <li
              key={`${law.act}-${law.ref}`}
              className="rounded-full border border-hair bg-surface px-2.5 py-1 font-mono text-[11px] font-bold text-muted"
            >
              {law.act} {law.ref}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 font-mono text-[11px] font-semibold text-muted">
        Усвояване на „{conceptTitleBg}“: {before}% → {after}%{" "}
        <span className={`font-bold ${deltaClass(delta)}`}>
          ({formatDelta(delta)})
        </span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ summary */

interface ConceptSummary {
  conceptId: string;
  titleBg: string;
  topicSlug: string | null;
  topicTitleBg: string | null;
  before: number;
  after: number;
  correct: number;
  total: number;
}

function SessionSummary({ answers }: { answers: AnswerRecord[] }) {
  const router = useRouter();
  const [isRestarting, startRestarting] = useTransition();

  const total = answers.length;
  const correctCount = answers.reduce((n, a) => n + (a.correct ? 1 : 0), 0);
  const ratio = total === 0 ? 0 : correctCount / total;

  const concepts = useMemo<ConceptSummary[]>(() => {
    const byId = new Map<string, ConceptSummary>();
    for (const a of answers) {
      const row = byId.get(a.conceptId);
      if (row === undefined) {
        byId.set(a.conceptId, {
          conceptId: a.conceptId,
          titleBg: a.conceptTitleBg,
          topicSlug: a.topicSlug,
          topicTitleBg: a.topicTitleBg,
          before: a.masteryBefore,
          after: a.masteryAfter,
          correct: a.correct ? 1 : 0,
          total: 1,
        });
      } else {
        row.after = a.masteryAfter;
        row.correct += a.correct ? 1 : 0;
        row.total += 1;
      }
    }
    return [...byId.values()];
  }, [answers]);

  const weakest =
    concepts.length > 0
      ? concepts.reduce((min, c) => (c.after < min.after ? c : min))
      : null;

  const headline =
    ratio >= 0.8 ? "Отлична работа!" : ratio >= 0.5 ? "Добър напредък!" : "Продължавай — струва си.";
  const note =
    ratio >= 0.8
      ? "Движиш се уверено към изпита."
      : ratio >= 0.5
        ? "Прегледай обясненията на грешките — там е следващият скок."
        : "Всяка грешка тук е една по-малко на изпита.";

  return (
    <section
      aria-labelledby="session-summary-title"
      className="card mx-auto flex w-full max-w-2xl flex-col gap-6 p-5 sm:p-8"
    >
      <header className="flex flex-col items-center text-center">
        <h2
          id="session-summary-title"
          className="font-display text-xl font-black sm:text-2xl"
        >
          {headline}
        </h2>
        <p className="mt-1 max-w-[52ch] text-sm text-muted">{note}</p>
        <div className="mt-5">
          <Gauge
            value={Math.round(ratio * 100)}
            max={100}
            unit="% верни"
            size={168}
            tone="auto"
            label=""
            ariaLabel={`Резултат: ${correctCount} от ${total} верни отговора`}
          />
        </div>
        <p className="mt-3 text-sm font-bold tabular-nums text-muted">
          <span
            className={
              ratio >= 0.8 ? "text-success" : ratio >= 0.5 ? "text-warning" : "text-danger"
            }
          >
            {correctCount}
          </span>
          <span> / {total} </span>
          <span className="text-xs font-semibold uppercase tracking-wide">
            верни отговора
          </span>
        </p>
      </header>

      {concepts.length > 0 ? (
        <div>
          <h3 className="hud-label">Промяна в усвояването</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {concepts.map((c) => {
              const before = toPct(c.before);
              const after = toPct(c.after);
              const delta = after - before;
              return (
                <li
                  key={c.conceptId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2/50 px-4 py-3 transition-colors hover:border-border-strong motion-reduce:transition-none"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" title={c.titleBg}>
                      {c.titleBg}
                    </p>
                    <p className="text-xs text-muted">
                      {c.correct}/{c.total} верни
                    </p>
                  </div>
                  <p className="font-mono text-sm font-bold tabular-nums text-muted">
                    {before}% → <span className="text-foreground">{after}%</span>{" "}
                    <span className={deltaClass(delta)}>({formatDelta(delta)})</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {weakest !== null && weakest.after < 0.8 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <IconTarget className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <p className="text-sm leading-relaxed">
              Най-слабото ти място от тази тренировка:{" "}
              <strong>{weakest.titleBg}</strong>
              {weakest.topicTitleBg !== null ? (
                <> (тема „{weakest.topicTitleBg}“)</>
              ) : null}
              .
            </p>
          </div>
          {weakest.topicSlug !== null ? (
            <Link
              href={`/theory/practice?topic=${weakest.topicSlug}`}
              className="btn-ghost shrink-0 px-4 py-2 text-xs"
            >
              Тренирай темата
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => startRestarting(() => router.refresh())}
          disabled={isRestarting}
          className="btn-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
        >
          {isRestarting ? "Подготвям…" : "Нова тренировка"}
        </button>
        <Link href="/theory" className="btn-ghost">
          Към темите
        </Link>
        <Link href="/dashboard" className="btn-ghost">
          Начало
        </Link>
      </div>
    </section>
  );
}
