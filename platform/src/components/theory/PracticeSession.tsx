"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { submitPracticeAnswer } from "@/app/(dashboard)/theory/practice/actions";
import { IconArrowRight, IconCheck, IconTarget, IconX } from "@/components/icons";
import { CheckControl } from "@/components/ui/CheckControl";
import { Gauge } from "@/components/hud/Gauge";
import type { PracticeQuestionDto, PracticeSubmitResult } from "./types";
import { hasSignOptions, QuestionMediaView, SignFace } from "./QuestionMedia";
import { WhyPanel, WhyPanelIdle } from "./WhyPanel";
import { buildWhyPanelModel } from "@/modules/clips/view";

/**
 * Client-side practice runner: one question at a time, immediate feedback
 * after each answer via the submitPracticeAnswer server action, summary at
 * the end. All grading happens on the server — the client never sees the
 * correct options before submitting.
 *
 * THEO-2 (doc 64): every submitted answer feeds the why-panel — on desktop a
 * SIDE PANEL ~20% of the viewport width beside the card (founder ruling,
 * never a modal), on mobile an in-card section right under the verdict. One
 * mount point at a time (matchMedia), so the replay never double-fetches.
 * The panel never blocks „Напред" — answering replaces its content.
 */

/** Tailwind lg — the side-panel/in-card switch. */
const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeDesktop(onChange: () => void): () => void {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function readDesktop(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

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

/**
 * THE ANSWER BOX lives in components/ui/CheckControl — drawn by us, not by the
 * user agent, because `accent-color` on a bare native control tints only the
 * CHECKED fill and the cluster scope's `color-scheme: dark` had Chromium
 * painting the empty one at 1.66 : 1. That file carries the measurements, the
 * two Tailwind scanner traps, and the reason it must stay a real <input>.
 *
 * It is imported rather than copied now that eight screens mount the same box.
 * The import is safe in the direction that used to worry us — CheckControl is a
 * leaf with no dependency of its own, so the exam route can take it without
 * dragging the why-panel or the clip replay along.
 */

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

  // THEO-2: one why-panel mount point at a time — the desktop side column or
  // the in-card mobile section — so MistakeReplay never fetches twice. Safe
  // for hydration: `result` is always null at SSR, so nothing renders early.
  const isDesktop = useSyncExternalStore(subscribeDesktop, readDesktop, () => false);
  const panelModel = useMemo(
    () =>
      result === null || current === null
        ? null
        : // THEO Half A: feed the answered question's media + options so the
          // panel can draw the picture card (correct sign / diagram) beside
          // the stored explanation. `result` already carries correctOptionIds.
          buildWhyPanelModel({
            ...result,
            media: current.media,
            options: current.options,
          }),
    [result, current],
  );

  if (current === null) {
    return <SessionSummary answers={answers} />;
  }

  const answeredCount = answers.length;
  const correctCount = answers.reduce((n, a) => n + (a.correct ? 1 : 0), 0);
  const badge = REASON_BADGES[current.reason];
  // Any sign-face option switches the whole list to the picture grid.
  const signGrid = hasSignOptions(current.options);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 lg:max-w-none lg:flex-row lg:items-start lg:justify-center lg:gap-6">
    <section
      aria-label={`Въпрос ${index + 1} от ${questions.length}`}
      className="card flex w-full min-w-0 flex-col gap-4 p-4 sm:gap-6 sm:p-7 lg:max-w-2xl"
    >
      {/* Progress.
          MOBILE FOLD (founder review): every row of chrome here is 390x844
          real estate stolen from the answers. The counter, the streak, the
          reason badge and the points used to occupy three stacked rows —
          ~90px before the question even starts. Below `sm` they collapse into
          ONE row of short forms; the long wording returns from `sm` up, and
          the section's aria-label („Въпрос N от M") carries the full sentence
          for screen readers either way. */}
      <div className="flex flex-col gap-2 sm:gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold tabular-nums text-muted">
            <span>
              <span className="sm:hidden" aria-hidden>
                <span className="font-bold text-foreground">{index + 1}</span>/
                {questions.length}
              </span>
              <span className="hidden sm:inline">
                Въпрос <span className="font-bold text-foreground">{index + 1}</span>{" "}
                от {questions.length}
              </span>
            </span>
            {answeredCount > 0 ? (
              <span className="text-xs font-semibold text-accent-2">
                <span className="sm:hidden">· {correctCount} верни</span>
                <span className="hidden sm:inline">
                  ({correctCount} верни досега)
                </span>
              </span>
            ) : null}
            {quota !== null ? (
              // Live free-tier meter: answers in this session count toward today.
              <span className="font-mono text-[11px] font-bold text-muted">
                <span className="sm:hidden">
                  ·{" "}
                  <span className="text-accent">
                    {Math.min(quota.limit, quota.usedToday + answeredCount)}
                  </span>
                  /{quota.limit} днес
                </span>
                <span className="hidden sm:inline">
                  · Днес:{" "}
                  <span className="text-accent">
                    {Math.min(quota.limit, quota.usedToday + answeredCount)}
                  </span>{" "}
                  от {quota.limit} безплатни въпроса
                </span>
              </span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold sm:py-1 ${badge.className}`}
            >
              {badge.labelBg}
            </span>
            <span className="rounded-full border border-hair px-2.5 py-0.5 font-mono text-[11px] font-bold text-muted sm:py-1">
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

      {/* THEO-1: visual media renders ABOVE the question text. Sign codes
          and scene data describe the situation, never the answer.

          The ARTWORK keeps its size on phones — the sign IS the question, and
          a shrunken pictogram is a harder question, not a smaller one. What
          goes is the FRAME: 16px of decorative padding either side of it. */}
      {current.media !== null ? (
        <QuestionMediaView media={current.media} className="max-sm:p-2.5" />
      ) : null}

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
        <ul
          className={
            signGrid
              ? "mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-3 sm:gap-2.5"
              : "mt-3 flex flex-col gap-2 sm:mt-4 sm:gap-2.5"
          }
        >
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

            if (signGrid) {
              // Sign-identification: a tappable picture tile per option. The
              // whole tile is the label; textBg stays the accessible name.
              return (
                <li key={option.id} className="min-w-0">
                  <label
                    className={`flex h-full flex-col items-center gap-1.5 rounded-xl border p-2 transition duration-200 ease-out focus-within:ring-2 focus-within:ring-accent/50 motion-reduce:transition-none motion-reduce:transform-none sm:gap-2 sm:p-3 ${stateClasses} ${
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
                      className="sr-only"
                    />
                    <span className="flex w-full items-center justify-between">
                      <span
                        aria-hidden
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-hair bg-surface font-mono text-[11px] font-bold text-muted"
                      >
                        {optionIndex + 1}
                      </span>
                      {isCorrectOption ? (
                        <IconCheck aria-hidden className="h-4 w-4 text-success" />
                      ) : isWrongPick ? (
                        <IconX aria-hidden className="h-4 w-4 text-danger" />
                      ) : null}
                    </span>
                    {option.media !== null ? (
                      <SignFace
                        signRef={option.media.signRef}
                        altBg={option.textBg}
                        className="h-20 w-20 sm:h-24 sm:w-24"
                      />
                    ) : (
                      <span className="flex min-h-20 items-center text-center text-sm leading-relaxed">
                        {option.textBg}
                      </span>
                    )}
                    {isCorrectOption ? (
                      <span className="text-[11px] font-bold text-success">
                        Верен отговор
                      </span>
                    ) : isWrongPick ? (
                      <span className="text-[11px] font-bold text-danger">
                        Твоят избор
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            }

            return (
              <li key={option.id}>
                <label
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm transition duration-200 ease-out focus-within:ring-2 focus-within:ring-accent/50 motion-reduce:transition-none motion-reduce:transform-none sm:py-3.5 ${stateClasses} ${
                    result === null ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  <CheckControl
                    type={current.type === "single" ? "radio" : "checkbox"}
                    name={`practice-${current.id}`}
                    value={option.id}
                    checked={isSelected}
                    onChange={() => toggleOption(option.id)}
                    disabled={result !== null}
                    className="mt-1"
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

      {/* Feedback — the live region stays mounted so the update is announced.
          Verdict + mastery stay in-card; the why-panel teaches beside (lg)
          or right below (mobile — the honest bottom section, not a sheet). */}
      <div aria-live="polite">
        {result !== null ? (
          <div className="flex flex-col gap-3">
            <VerdictStrip result={result} conceptTitleBg={current.conceptTitleBg} />
            {!isDesktop && panelModel !== null ? (
              <WhyPanel key={current.id} model={panelModel} />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Actions.
          On phones this is a STICKY footer inside the card (`max-sm:sticky
          bottom-0`, pulled out to the card edges with negative margins). It is
          the fix for the second half of the founder's complaint: even when the
          options fit, „Провери" sat 90–280px below the fold on every single
          question, so confirming an answer cost a scroll — and after answering
          the why-panel pushed „Напред" further still. Sticky, it is always one
          tap. Desktop keeps the plain in-flow row. */}
      <div className="flex flex-wrap items-center gap-3 max-sm:sticky max-sm:bottom-0 max-sm:z-20 max-sm:-mx-4 max-sm:-mb-4 max-sm:rounded-b-xl max-sm:border-t max-sm:border-hair max-sm:bg-surface/95 max-sm:px-4 max-sm:py-2.5 max-sm:backdrop-blur max-sm:[padding-bottom:calc(0.625rem+env(safe-area-inset-bottom))]">
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

    {/* THEO-2 founder ruling: the why-panel as a SIDE PANEL ~20% of the
        viewport width on desktop (min-width keeps it readable), sticky so
        the explanation stays in view over long option lists. Rendered even
        before the first answer (idle hint) so the card never jumps. */}
    <aside
      aria-label="Защо-панел"
      className="hidden lg:sticky lg:top-6 lg:block lg:w-[20vw] lg:min-w-[250px] lg:shrink-0"
    >
      <div aria-live="polite">
        {isDesktop && panelModel !== null ? (
          <WhyPanel key={current.id} model={panelModel} />
        ) : (
          <WhyPanelIdle />
        )}
      </div>
    </aside>
    </div>
  );
}

/* ----------------------------------------------------------- feedback */

/**
 * Slim in-card verdict: correct/wrong + the mastery move. The TEACHING
 * (explanation, citations, replay) lives in the why-panel — the founder rule
 * "never a bare Correct/Wrong" is satisfied by the pair, with the panel
 * directly below this strip on mobile and beside the card on desktop.
 */
function VerdictStrip({
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
      className={`rounded-xl border p-4 ${
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
      <p className="mt-2 font-mono text-[11px] font-semibold text-muted">
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
