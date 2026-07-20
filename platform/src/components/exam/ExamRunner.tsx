"use client";

/**
 * Mock-exam runner — the serious mode. No feedback of any kind until submit:
 * the component only ever receives safe ExamQuestion views (no correct
 * flags), and correct answers appear exclusively in the submit action's
 * response, after the attempt is closed server-side.
 *
 * Refresh safety: answers + flags are mirrored to localStorage per attempt;
 * the server page rebuilds the same question set from the seed cookie and
 * passes the authoritative elapsed time, so a reload resumes exactly where
 * the candidate left off.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExamQuestion } from "@/modules/exam";
import { submitExamAction } from "@/app/(dashboard)/exams/actions";
import { QuestionMediaView, SignFace } from "@/components/theory/QuestionMedia";
import { ExamResultView } from "./ExamResultView";
import {
  answersStorageKey,
  formatClock,
  reviewStorageKey,
  type ResultSummary,
  type ReviewQuestion,
  type SubmitExamInput,
} from "./types";

interface ExamRunnerProps {
  attemptId: string;
  questions: ExamQuestion[];
  durationSec: number;
  /** Seconds already elapsed (server clock) — nonzero after a reload. */
  initialElapsedSec: number;
}

/** Remaining-time checkpoints (sec) announced via aria-live. */
const ANNOUNCE_AT = [1200, 600, 300, 120, 60, 30];
/** Visual warning threshold: under 5 minutes. */
const WARN_UNDER_SEC = 300;

interface StoredProgress {
  answers: Record<string, string[]>;
  flags: Record<string, boolean>;
}

function parseStoredProgress(raw: string): StoredProgress {
  const parsed: unknown = JSON.parse(raw);
  const answers: Record<string, string[]> = {};
  const flags: Record<string, boolean> = {};
  if (typeof parsed === "object" && parsed !== null) {
    const p = parsed as Record<string, unknown>;
    if (typeof p.answers === "object" && p.answers !== null) {
      for (const [k, v] of Object.entries(p.answers)) {
        if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
          answers[k] = v as string[];
        }
      }
    }
    if (typeof p.flags === "object" && p.flags !== null) {
      for (const [k, v] of Object.entries(p.flags)) {
        if (v === true) flags[k] = true;
      }
    }
  }
  return { answers, flags };
}

export function ExamRunner({
  attemptId,
  questions,
  durationSec,
  initialElapsedSec,
}: ExamRunnerProps) {
  const router = useRouter();

  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [idx, setIdx] = useState(0);
  const [restored, setRestored] = useState(false);
  const [remainingSec, setRemainingSec] = useState(() =>
    Math.max(0, durationSec - initialElapsedSec),
  );
  const [announcement, setAnnouncement] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{
    summary: ResultSummary;
    review: ReviewQuestion[];
  } | null>(null);

  /** Set once by the countdown effect on mount (Date.now() is impure in render). */
  const mountedAtRef = useRef<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const submitOnceRef = useRef(false);
  // Start at the initial remaining time so a resumed exam only announces
  // checkpoints it actually crosses (never earlier, larger ones).
  const lastAnnouncedRef = useRef(Math.max(0, durationSec - initialElapsedSec));
  const dialogRef = useRef<HTMLDivElement>(null);
  const questionBoxRef = useRef<HTMLDivElement>(null);
  const firstRenderRef = useRef(true);

  // -- restore in-progress answers after a reload (same device) -------------
  // Deferred to a task so state updates land outside the effect commit.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(answersStorageKey(attemptId));
        if (raw) {
          const stored = parseStoredProgress(raw);
          setAnswers(stored.answers);
          setFlags(stored.flags);
        }
      } catch {
        // corrupted payload — start clean rather than crash the exam
      }
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [attemptId]);

  // -- persist on every change ----------------------------------------------
  useEffect(() => {
    if (!restored || outcome) return;
    try {
      window.localStorage.setItem(
        answersStorageKey(attemptId),
        JSON.stringify({ answers, flags }),
      );
    } catch {
      // storage full/blocked — the exam still works, just without refresh safety
    }
  }, [answers, flags, restored, outcome, attemptId]);

  // -- countdown --------------------------------------------------------------
  useEffect(() => {
    if (outcome) return;
    // One-time clock anchor: survives re-runs of this effect via the refs.
    if (mountedAtRef.current === null || deadlineRef.current === null) {
      mountedAtRef.current = Date.now();
      deadlineRef.current =
        mountedAtRef.current +
        Math.max(0, durationSec - initialElapsedSec) * 1000;
    }
    const id = window.setInterval(() => {
      const deadline = deadlineRef.current;
      if (deadline === null) return;
      const rem = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSec(rem);
      if (rem <= 0) window.clearInterval(id);
    }, 500);
    return () => window.clearInterval(id);
  }, [outcome, durationSec, initialElapsedSec]);

  // -- polite screen-reader announcements at checkpoints only ----------------
  useEffect(() => {
    for (const t of ANNOUNCE_AT) {
      if (remainingSec <= t && lastAnnouncedRef.current > t) {
        lastAnnouncedRef.current = remainingSec;
        setAnnouncement(
          t >= 60
            ? `Оставащо време: ${Math.round(t / 60)} минути`
            : `Оставащо време: ${t} секунди`,
        );
        break;
      }
    }
  }, [remainingSec]);

  // -- submission --------------------------------------------------------------
  const doSubmit = useCallback(async () => {
    if (submitOnceRef.current) return;
    submitOnceRef.current = true;
    setConfirmOpen(false);
    setSubmitting(true);
    setSubmitError(null);

    const payload: SubmitExamInput = {
      attemptId,
      answers: questions.map((q) => ({
        questionId: q.id,
        optionIds: answers[q.id] ?? [],
      })),
      clientElapsedSec: Math.round(
        initialElapsedSec +
          (Date.now() - (mountedAtRef.current ?? Date.now())) / 1000,
      ),
    };

    try {
      const res = await submitExamAction(payload);
      if (!res.ok) {
        if (res.code === "ALREADY_SUBMITTED") {
          router.replace("/exams?msg=already-submitted");
        } else if (res.code === "INVALID_INPUT") {
          submitOnceRef.current = false;
          setSubmitError(
            "Изпращането не успя поради невалидни данни. Опитай отново.",
          );
        } else {
          router.replace("/exams?msg=not-found");
        }
        return;
      }
      try {
        window.localStorage.removeItem(answersStorageKey(attemptId));
        window.localStorage.setItem(
          reviewStorageKey(attemptId),
          JSON.stringify({ summary: res.summary, review: res.review }),
        );
      } catch {
        // cache is best-effort; the result below still renders
      }
      setOutcome({ summary: res.summary, review: res.review });
    } catch {
      // network hiccup: keep every answer, let the candidate retry
      submitOnceRef.current = false;
      setSubmitError(
        "Изпращането не успя. Провери интернет връзката и опитай отново.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [answers, attemptId, initialElapsedSec, questions, router]);

  // -- auto-submit at 0:00 (after restore, so stored answers are included) ---
  useEffect(() => {
    if (!restored || outcome || remainingSec > 0) return;
    const timer = window.setTimeout(() => {
      void doSubmit();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [restored, outcome, remainingSec, doSubmit]);

  // -- confirm dialog focus + Escape -----------------------------------------
  useEffect(() => {
    if (!confirmOpen) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  // -- move focus to the question when navigating (not on first paint) -------
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    questionBoxRef.current?.focus();
  }, [idx]);

  // -- derived -----------------------------------------------------------------
  const q = questions[idx];
  const answeredCount = questions.reduce(
    (n, question) => n + ((answers[question.id] ?? []).length > 0 ? 1 : 0),
    0,
  );
  const unansweredCount = questions.length - answeredCount;
  const timeLow = remainingSec < WARN_UNDER_SEC;

  const selectOption = (questionId: string, optionId: string, multi: boolean) => {
    setAnswers((prev) => {
      const current = prev[questionId] ?? [];
      if (!multi) return { ...prev, [questionId]: [optionId] };
      return {
        ...prev,
        [questionId]: current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      };
    });
  };

  const toggleFlag = (questionId: string) => {
    setFlags((prev) => {
      const next = { ...prev };
      if (next[questionId]) delete next[questionId];
      else next[questionId] = true;
      return next;
    });
  };

  // -- submitted: swap to the result view -------------------------------------
  if (outcome) {
    return (
      <div className="flex flex-col gap-6">
        <ExamResultView summary={outcome.summary} review={outcome.review} />
        <Link href="/exams" className="btn-ghost self-start">
          ← Обратно към изпитите
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar: progress + timer + submit */}
      <header className="card flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-5">
        <p className="text-sm font-bold">
          Въпрос {idx + 1} <span className="text-muted">от {questions.length}</span>
        </p>
        <p className="text-sm tabular-nums text-muted">
          Отговорени: {answeredCount}/{questions.length}
        </p>

        <div className="ml-auto flex items-center gap-4">
          <p
            aria-hidden="true"
            className={`font-mono text-2xl font-black tabular-nums ${
              timeLow ? "text-danger" : "text-foreground"
            }`}
          >
            {formatClock(remainingSec)}
          </p>
          <p aria-live="polite" role="status" className="visually-hidden">
            {announcement}
          </p>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
            className="btn-accent px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Предаване…" : "Предай изпита"}
          </button>
        </div>
      </header>

      {timeLow ? (
        <p
          role="status"
          className="card border-danger/50 px-4 py-2.5 text-sm font-bold text-danger"
        >
          Остават по-малко от 5 минути. При изтичане на времето изпитът се
          предава автоматично.
        </p>
      ) : null}

      {submitError ? (
        <div
          role="alert"
          className="card flex flex-wrap items-center gap-3 border-danger/50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-danger">{submitError}</p>
          <button
            type="button"
            onClick={() => void doSubmit()}
            className="btn-ghost px-4 py-2 text-sm"
          >
            Опитай отново
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        {/* Question card */}
        <section
          ref={questionBoxRef}
          tabIndex={-1}
          aria-label={`Въпрос ${idx + 1} от ${questions.length}`}
          className="card flex flex-col gap-4 p-5 outline-none sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-black tabular-nums text-muted">
              {q.points} {q.points === 1 ? "точка" : "точки"}
            </span>
            {q.type === "multi" ? (
              <span className="rounded-full border border-warning/50 px-2.5 py-0.5 text-xs font-bold text-warning">
                Избери всички верни
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => toggleFlag(q.id)}
              aria-pressed={!!flags[q.id]}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition motion-reduce:transition-none ${
                flags[q.id]
                  ? "border-warning/60 bg-warning/10 text-warning"
                  : "border-border text-muted hover:border-border-strong hover:bg-surface-2"
              }`}
            >
              <FlagIcon />
              {flags[q.id] ? "Отбелязан за преглед" : "Отбележи за преглед"}
            </button>
          </div>

          <fieldset className="flex flex-col gap-4">
            <legend className="text-lg font-bold leading-snug">{q.textBg}</legend>

            {q.media !== null && "kind" in q.media ? (
              // THEO-1 data-driven media — the exact components the practice
              // runner mounts, so exam and practice can never diverge.
              <QuestionMediaView media={q.media} />
            ) : q.media !== null ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                Към този въпрос има{" "}
                {q.media.type === "image" ? "изображение" : "видеоклип"}, който
                скоро ще бъде наличен в платформата.
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
              {q.options.map((option) => {
                const checked = (answers[q.id] ?? []).includes(option.id);
                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition motion-reduce:transition-none ${
                      checked
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-border-strong hover:bg-surface-2"
                    }`}
                  >
                    <input
                      type={q.type === "single" ? "radio" : "checkbox"}
                      name={`question-${q.id}`}
                      value={option.id}
                      checked={checked}
                      onChange={() =>
                        selectOption(q.id, option.id, q.type === "multi")
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                    />
                    {option.media != null ? (
                      // THEO-1 sign-face option (same <SignFace> as practice);
                      // the adjacent text is the accessible name.
                      <SignFace
                        signRef={option.media.signRef}
                        altBg=""
                        className="h-16 w-16 shrink-0"
                      />
                    ) : null}
                    <span className="text-sm leading-relaxed">
                      {option.textBg}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
              className="btn-ghost px-4 py-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Предишен
            </button>
            <button
              type="button"
              onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}
              disabled={idx === questions.length - 1}
              className="btn-ghost px-4 py-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Следващ →
            </button>
          </div>
        </section>

        {/* Navigator */}
        <nav aria-label="Навигация по въпросите" className="card h-fit p-4">
          <ol className="grid grid-cols-9 gap-1.5 sm:grid-cols-9 lg:grid-cols-5">
            {questions.map((question, i) => {
              const isAnswered = (answers[question.id] ?? []).length > 0;
              const isFlagged = !!flags[question.id];
              const isCurrent = i === idx;
              return (
                <li key={question.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setIdx(i)}
                    aria-current={isCurrent ? "true" : undefined}
                    aria-label={`Въпрос ${i + 1}${
                      isAnswered ? ", отговорен" : ", без отговор"
                    }${isFlagged ? ", отбелязан за преглед" : ""}`}
                    className={`flex h-9 w-full items-center justify-center rounded-lg border text-xs font-bold tabular-nums transition motion-reduce:transition-none ${
                      isCurrent
                        ? "border-accent bg-accent text-accent-foreground shadow-glow-sm"
                        : isAnswered
                          ? "border-accent/40 bg-accent/15 text-accent"
                          : "border-border text-muted hover:border-border-strong hover:bg-surface-2"
                    }`}
                  >
                    {i + 1}
                  </button>
                  {isFlagged ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-background bg-warning"
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>

          <ul className="mt-4 flex flex-col gap-1.5 text-xs text-muted">
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 rounded bg-accent/15 outline outline-1 outline-accent/40" />
              отговорен
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 rounded bg-accent" />
              текущ въпрос
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 rounded-full bg-warning" />
              за преглед
            </li>
          </ul>
        </nav>
      </div>

      {/* Submit confirmation dialog */}
      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Затвори прозореца"
            onClick={() => setConfirmOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-dialog-title"
            aria-describedby="submit-dialog-desc"
            tabIndex={-1}
            className="card relative z-10 flex w-full max-w-md flex-col gap-4 p-6 shadow-glow outline-none"
          >
            <h2 id="submit-dialog-title" className="text-lg font-extrabold">
              Предаване на изпита
            </h2>
            <div id="submit-dialog-desc" className="flex flex-col gap-2 text-sm">
              <p className="font-semibold">
                {unansweredCount === 0
                  ? `Отговорил си на всички ${questions.length} въпроса.`
                  : unansweredCount === 1
                    ? "Имаш 1 неотговорен въпрос."
                    : `Имаш ${unansweredCount} неотговорени въпроса.`}
              </p>
              <p className="text-muted">
                Неотговорените въпроси се броят за грешни. След предаването
                отговорите не могат да се променят.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="btn-ghost"
              >
                Продължи изпита
              </button>
              <button
                type="button"
                onClick={() => void doSubmit()}
                disabled={submitting}
                className="btn-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Предаване…" : "Предай изпита"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FlagIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5"
    >
      <path d="M3 1.5a.75.75 0 0 1 .75.75v.44l1.9-.47a4.5 4.5 0 0 1 3.06.37 3.5 3.5 0 0 0 2.37.29l1.5-.37A.75.75 0 0 1 13.5 3.2v5.6a.75.75 0 0 1-.57.73l-1.5.37a5 5 0 0 1-3.39-.42 3 3 0 0 0-2.04-.24l-2.25.56v4.45a.75.75 0 0 1-1.5 0v-12A.75.75 0 0 1 3 1.5Z" />
    </svg>
  );
}
