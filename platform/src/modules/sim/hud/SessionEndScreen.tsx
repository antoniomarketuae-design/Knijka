"use client";

/**
 * Session-end screen — the official-style verdict after a lesson: score
 * breakdown table by severity class (опасни / основни / второстепенни, the
 * exact taxonomy of the practical exam — doc 32), pass/fail styled like the
 * mock-exam results, the mistake list with law-ref chips, the debrief text
 * and the follow-up actions.
 *
 * XP chip: renders only when `xpEarned` is a number — sim lessons award no XP
 * until the gamification event union accepts sim_lesson (see lessons/types.ts).
 */

import Link from "next/link";
import type { FailReason } from "../rules";
import type { LessonResult } from "../lessons";

export interface SessionEndConcept {
  id: string;
  titleBg: string;
  /** Theory deep link, e.g. /theory/practice?topic=… */
  href: string;
}

const FAIL_REASON_TEXT: Record<FailReason, string> = {
  "dangerous-mistake": "допусната е опасна грешка — директно неиздържан",
  "total-points-exceeded": "повече от 9 наказателни точки общо",
  "osnovni-points-exceeded": "повече от 6 точки от основни грешки",
};

function clock(tSec: number): string {
  const m = Math.floor(tSec / 60);
  const s = Math.floor(tSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SessionEndScreen({
  lessonTitleBg,
  result,
  debriefText,
  concepts,
  xpEarned,
  onRetry,
  nextLessonTitleBg,
  onNextLesson,
}: {
  lessonTitleBg: string;
  result: LessonResult;
  /** null while the session is still being saved server-side. */
  debriefText: string | null;
  concepts: SessionEndConcept[];
  xpEarned: number | null;
  onRetry: () => void;
  /** Next lesson in the curriculum; null on the last lesson. */
  nextLessonTitleBg: string | null;
  /** null = next lesson locked (this attempt did not pass). */
  onNextLesson: (() => void) | null;
}) {
  const { summary } = result;
  const score = summary.score;

  const rows = [
    { label: "Опасни грешки", per: "10 т.", count: score.opasniCount, points: score.opasniPoints, tone: "var(--danger)" },
    { label: "Основни грешки", per: "3 т.", count: score.osnovniCount, points: score.osnovniPoints, tone: "var(--warning)" },
    { label: "Второстепенни грешки", per: "1 т.", count: score.vtorostepenniCount, points: score.vtorostepenniPoints, tone: "var(--accent-soft)" },
  ];

  return (
    <div className="flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto p-1">
      {/* Verdict card */}
      <section
        aria-labelledby="sim-result-title"
        className="card flex flex-col items-center gap-3 p-6"
      >
        <h2 id="sim-result-title" className="text-base font-extrabold text-muted">
          {lessonTitleBg} · резултат
        </h2>

        <p className="flex items-baseline gap-2">
          <span
            className={`text-6xl font-black tabular-nums ${
              result.passed ? "text-success" : "text-danger"
            }`}
          >
            {result.score}
          </span>
          <span className="text-xl font-bold text-muted">наказателни точки</span>
        </p>

        <p
          className={`rounded-full px-4 py-1.5 text-sm font-black uppercase tracking-wide ${
            result.passed ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
          }`}
        >
          {result.passed ? "Издържан" : "Неиздържан"}
        </p>

        {xpEarned !== null ? (
          <p className="rounded-full bg-accent/15 px-3 py-1 text-xs font-black text-accent">
            +{xpEarned} XP
          </p>
        ) : null}

        {result.aborted ? (
          <p className="text-center text-sm font-semibold text-warning">
            Урокът беше прекъснат преди края.
          </p>
        ) : null}
        {summary.terminated ? (
          <p className="text-center text-sm font-semibold text-danger">
            Настъпи сблъсък — реалният изпит се прекратява незабавно.
          </p>
        ) : null}
        {!result.completedAll && !result.aborted ? (
          <p className="text-center text-sm font-semibold text-warning">
            Не всички задачи от маршрута бяха изпълнени.
          </p>
        ) : null}
        {!summary.passed && summary.failReasons.length > 0 ? (
          <ul className="text-center text-xs font-semibold text-muted">
            {summary.failReasons.map((r) => (
              <li key={r}>• {FAIL_REASON_TEXT[r]}</li>
            ))}
          </ul>
        ) : null}

        {/* Official-style breakdown table */}
        <table className="mt-2 w-full text-sm">
          <caption className="visually-hidden">
            Разбивка на наказателните точки по класове грешки
          </caption>
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted">
              <th scope="col" className="py-1.5 font-bold">Клас грешка</th>
              <th scope="col" className="py-1.5 text-right font-bold">Брой</th>
              <th scope="col" className="py-1.5 text-right font-bold">Точки</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border">
                <td className="py-2 font-semibold">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: r.tone }} aria-hidden />
                  {r.label} <span className="text-xs text-muted">({r.per})</span>
                </td>
                <td className="py-2 text-right font-black tabular-nums">{r.count}</td>
                <td className="py-2 text-right font-black tabular-nums">{r.points}</td>
              </tr>
            ))}
            <tr className="border-t border-border-strong">
              <td className="py-2 font-extrabold">Общо (допустими 9)</td>
              <td className="py-2 text-right font-black tabular-nums">
                {score.opasniCount + score.osnovniCount + score.vtorostepenniCount}
              </td>
              <td className={`py-2 text-right font-black tabular-nums ${result.passed ? "text-success" : "text-danger"}`}>
                {score.totalPoints}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Objectives outcome */}
      {result.objectives.length > 0 ? (
        <section aria-label="Задачи от маршрута" className="card flex flex-col gap-2 p-5">
          <h3 className="text-sm font-extrabold">Задачи от маршрута</h3>
          <ul className="flex flex-col gap-1.5">
            {result.objectives.map((o) => (
              <li key={o.id} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black"
                  style={
                    o.done
                      ? { background: "var(--success)", color: "var(--accent-foreground)" }
                      : { border: "1px solid var(--border-strong)", color: "var(--muted)" }
                  }
                >
                  {o.done ? "✓" : "–"}
                </span>
                <span className={o.done ? "font-semibold" : "font-semibold text-muted"}>
                  {o.titleBg}
                </span>
                {o.done && o.completedAtSec !== null ? (
                  <span className="ml-auto text-xs tabular-nums text-muted">{clock(o.completedAtSec)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Mistakes */}
      {summary.mistakes.length > 0 ? (
        <section aria-label="Грешки" className="card flex flex-col gap-2 p-5">
          <h3 className="text-sm font-extrabold">Грешки ({summary.mistakes.length})</h3>
          <ul className="flex flex-col gap-2">
            {summary.mistakes.map((m, i) => (
              <li
                key={`${m.code}-${m.t}-${i}`}
                className="flex flex-col gap-1 rounded-xl border border-border p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold">{m.titleBg}</span>
                  <span
                    className="shrink-0 text-xs font-black tabular-nums"
                    style={{
                      color:
                        m.severityClass === "opasna"
                          ? "var(--danger)"
                          : m.severityClass === "osnovna"
                            ? "var(--warning)"
                            : "var(--accent-soft)",
                    }}
                  >
                    −{m.points} т.
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted">{m.explanationBg}</p>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted">
                    {m.lawRef}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted">в {clock(m.t)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Commendations */}
      {summary.commendations.length > 0 ? (
        <section aria-label="Похвали" className="card flex flex-col gap-2 p-5">
          <h3 className="text-sm font-extrabold text-success">Похвали</h3>
          <ul className="flex flex-col gap-1">
            {summary.commendations.map((c, i) => (
              <li key={`${c.code}-${c.t}-${i}`} className="flex items-center gap-2 text-sm">
                <span aria-hidden className="text-success">✓</span>
                <span className="font-semibold">{c.titleBg}</span>
                <span className="ml-auto text-xs tabular-nums text-muted">{clock(c.t)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Debrief */}
      <section aria-label="Разбор" className="card flex flex-col gap-2 p-5">
        <h3 className="text-sm font-extrabold">Разбор от инструктора</h3>
        {debriefText === null ? (
          <p className="text-sm text-muted">Записване на сесията…</p>
        ) : (
          <p className="whitespace-pre-line text-sm leading-relaxed">{debriefText}</p>
        )}
        {concepts.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {concepts.map((c) => (
              <Link
                key={c.id}
                href={c.href}
                className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-accent transition hover:border-accent motion-reduce:transition-none"
              >
                {c.titleBg}
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-accent" onClick={onRetry}>
          Повтори
        </button>
        {nextLessonTitleBg !== null ? (
          onNextLesson !== null ? (
            <button type="button" className="btn-ghost" onClick={onNextLesson}>
              Следващ урок: {nextLessonTitleBg}
            </button>
          ) : (
            <span className="btn-ghost cursor-not-allowed opacity-50" aria-disabled>
              Следващ урок: заключен
            </span>
          )
        ) : null}
        <Link href="/dashboard" className="btn-ghost ml-auto">
          Към таблото
        </Link>
      </div>
    </div>
  );
}
