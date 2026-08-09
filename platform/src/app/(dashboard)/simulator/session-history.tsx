"use client";

/**
 * „История на сесиите" (A15) — a compact list of the student's recent sim
 * sessions under the lesson-select screen. Server-built plain data (page.tsx
 * reads the SimSession store and rebuilds mistake groups from the STORED
 * canonical events via the violation catalog — same trust model as the wire);
 * this component only expands/collapses rows and formats.
 *
 * Honesty about persistence: v1 stores the debrief TEXT and the canonical
 * event log, so an expanded row can show the full mistake list + the stored
 * debrief. It does NOT store enough to re-render the mistake MAP for old
 * sessions (positions persist only for sessions saved after A15, and the
 * district polylines live client-side in the 3D bundle) — the map stays an
 * end-of-session view for now; rows note nothing and omit what they lack.
 */

import { useState } from "react";
import { minusPointsBg, pointsBg } from "@/modules/sim/rules";

export interface SessionHistoryMistake {
  titleBg: string;
  lawRef: string;
  severityClass: "opasna" | "osnovna" | "vtorostepenna";
  points: number;
  count: number;
  /** A15 authored corrective from the catalog; null for unknown codes. */
  correctiveBg: string | null;
}

export interface SessionHistoryEntry {
  id: string;
  lessonTitleBg: string;
  /** ISO string (Dates do not cross the RSC boundary as-is); null = unfinished row. */
  finishedAtIso: string | null;
  passed: boolean;
  aborted: boolean;
  terminated: boolean;
  /** Official penalty points (lower is better); null on legacy rows. */
  score: number | null;
  /** A9 training score (repeat escalations); null on rows saved before A15. */
  effectiveScore: number | null;
  mistakeCount: number;
  /** null = stat unknown (rows saved before A15). */
  nearMissCount: number | null;
  topMistakeTitleBg: string | null;
  mistakes: SessionHistoryMistake[];
  debrief: string | null;
  /** Stored events payload unreadable — summary columns only, said honestly. */
  payloadUnreadable: boolean;
}

const SEVERITY_TONE: Record<SessionHistoryMistake["severityClass"], string> = {
  opasna: "var(--danger)",
  osnovna: "var(--warning)",
  vtorostepenna: "var(--accent-soft)",
};

function formatWhen(iso: string | null): string {
  if (iso === null) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("bg-BG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function SessionHistorySection({ entries }: { entries: SessionHistoryEntry[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (entries.length === 0) return null;

  return (
    <section aria-label="История на сесиите" className="flex flex-col gap-2">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-muted">
        История на сесиите
      </h2>
      <ul className="flex flex-col gap-2">
        {entries.map((e) => {
          const open = openId === e.id;
          return (
            <li key={e.id} className="card overflow-hidden p-0">
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition hover:bg-surface-2 motion-reduce:transition-none"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : e.id)}
              >
                {/* Server TZ may differ from the visitor's — the wall-clock
                    rendering is allowed to differ across the hydration pass. */}
                <span suppressHydrationWarning className="text-xs tabular-nums text-muted">
                  {formatWhen(e.finishedAtIso)}
                </span>
                <span className="text-sm font-bold">{e.lessonTitleBg}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                    e.aborted
                      ? "bg-warning/15 text-warning"
                      : e.passed
                        ? "bg-success/15 text-success"
                        : "bg-danger/15 text-danger"
                  }`}
                >
                  {e.aborted ? "Прекъснат" : e.passed ? "Издържан" : "Неиздържан"}
                </span>
                {e.score !== null ? (
                  <span className="text-xs font-black tabular-nums">
                    {/* Same scale as the result screen, said the same way — this
                        row is the founder's own history of it, one page from the
                        drive, and it read „12 т." with nothing naming the unit. */}
                    {pointsBg("exam", e.score)}
                    {e.effectiveScore !== null && e.effectiveScore > e.score ? (
                      <span
                        className="ml-1 font-semibold text-muted"
                        title="Тренировъчен резултат — повторените грешки тежат повече (×1.5/×2.0); официалният резултат е отляво."
                      >
                        (трен.{" "}
                        {Number.isInteger(e.effectiveScore)
                          ? e.effectiveScore
                          : e.effectiveScore.toFixed(1)}
                        )
                      </span>
                    ) : null}
                  </span>
                ) : null}
                <span className="ml-auto flex items-center gap-2 text-xs text-muted">
                  {e.topMistakeTitleBg !== null ? (
                    <span className="max-w-52 truncate">{e.topMistakeTitleBg}</span>
                  ) : e.mistakeCount === 0 && !e.payloadUnreadable ? (
                    <span className="text-success">без грешки</span>
                  ) : null}
                  <span aria-hidden>{open ? "▴" : "▾"}</span>
                </span>
              </button>

              {open ? (
                <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
                  {e.payloadUnreadable ? (
                    <p className="text-xs text-muted">
                      Детайлите на тази сесия не могат да бъдат прочетени (стар или
                      повреден запис) — показваме само резултата.
                    </p>
                  ) : null}

                  {e.mistakes.length > 0 ? (
                    <ul className="flex flex-col gap-1.5">
                      {e.mistakes.map((m, i) => (
                        <li key={`${m.titleBg}-${i}`} className="flex flex-col gap-0.5 text-sm">
                          <div className="flex items-baseline gap-2">
                            <span
                              aria-hidden
                              className="inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full"
                              style={{ background: SEVERITY_TONE[m.severityClass] }}
                            />
                            <span className="font-semibold">
                              {m.titleBg}
                              {m.count > 1 ? ` ×${m.count}` : ""}
                            </span>
                            {/* The expanded history row is a FaultCard in
                                miniature and had the same bare unit the card
                                itself was repaired of. */}
                            <span
                              className="whitespace-nowrap text-xs font-black tabular-nums"
                              style={{ color: SEVERITY_TONE[m.severityClass] }}
                            >
                              {minusPointsBg("exam", m.points * m.count)}
                            </span>
                            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted">
                              {m.lawRef}
                            </span>
                          </div>
                          {m.correctiveBg !== null ? (
                            <p className="pl-4 text-xs leading-relaxed text-muted">
                              ✔ {m.correctiveBg}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {e.nearMissCount !== null && e.nearMissCount > 0 ? (
                    <p className="text-xs font-semibold text-warning">
                      Разминавания на косъм: {e.nearMissCount}
                    </p>
                  ) : null}

                  {e.debrief !== null && e.debrief.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted">
                        Разбор от инструктора
                      </h3>
                      <p className="whitespace-pre-line text-sm leading-relaxed">{e.debrief}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
