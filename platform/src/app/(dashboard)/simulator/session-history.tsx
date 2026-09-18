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
  /**
   * ADR-009 (doc 92 §5.8): this drive committed the mistake the lesson exists
   * to teach, so it was not TAKEN — which is a different sentence from
   * «Неиздържан», and on 558 of the 654 hit drives on this tree the изпитен
   * лист is clean. Folded server-side in `historyLessonMistakes.ts` off the
   * stored rows AND the stored sheet verdict: on the other 96 the лист failed,
   * and there the word is «Неиздържан» — the cause block below still names the
   * lesson's own act.
   *
   * FALSE ON EVERY ROW STORED BEFORE 2026-09-18, and that is deliberate: a
   * stored drive is never regraded (doc 92 §6), so an old attempt keeps the
   * label it was given on the day. Nothing here infers a hit from a clean sheet
   * and a false `passed`.
   */
  notTaken: boolean;
  /**
   * The acts behind `notTaken`, retrieved from the violation catalogue at
   * render time (never stored as prose). Empty while `notTaken` is true means
   * the stored codes are no longer in the catalogue — the verdict stands and
   * the row says it cannot name the act, rather than dropping either half.
   */
  lessonMistakeTitlesBg: string[];
  /** Some occurrence reached the изпитен лист — only a repeat can (ADR-009). */
  lessonMistakeCharged: boolean;
}

/** The four things a finished row can be — one word each, in the student's
 *  own language. «Не е взет» is the product's existing word for it
 *  (`modules/sim/hud/sessionEndCtas.ts` NOTE_UNPASSED_BG, and lane E's
 *  `SESSION_VERDICT_LABEL_BG.lessonMistake` on the result screen). */
export type SessionHistoryVerdict = "aborted" | "passed" | "notTaken" | "failed";

export const SESSION_HISTORY_LABEL_BG: Record<SessionHistoryVerdict, string> = {
  aborted: "Прекъснат",
  passed: "Издържан",
  notTaken: "Не е взет",
  failed: "Неиздържан",
};

/** Tone per verdict. `notTaken` is a WARNING, not a danger: the изпитен лист is
 *  usually clean on these drives — the lesson is open, not failed. */
const VERDICT_PILL_CLASS: Record<SessionHistoryVerdict, string> = {
  aborted: "bg-warning/15 text-warning",
  passed: "bg-success/15 text-success",
  notTaken: "bg-warning/15 text-warning",
  failed: "bg-danger/15 text-danger",
};

/**
 * ONE place the row's word is decided (ADR-009 §5.8).
 *
 * An abort is reported as an abort — the drive has no grade at all — and a pass
 * cannot carry a hit, because a hit is exactly what makes `passed` false. So
 * `notTaken` is only ever read on a finished, unpassed row.
 *
 * WHERE THE ИЗПИТЕН ЛИСТ IS ASKED, and it is not here. `SessionEndScreen.
 * sessionVerdict` asks the sheet FIRST — a failed лист is «Неиздържан»,
 * whatever else the drive did — and this fold cannot, because a history row has
 * no `summary`: it has three booleans, and `passed` is the LESSON verdict. The
 * sheet's answer therefore arrives already folded into `notTaken`
 * (`historyLessonMistakes.ts`, off the stored `sheetPassed`), which is the same
 * question asked one step upstream and NOT a different rule. An earlier draft
 * of this comment claimed the order below «follows the end screen's own fold»
 * while `notTaken` ignored the sheet entirely; that cost the 96 crashed drives
 * their «Неиздържан».
 */
export function sessionHistoryVerdict(
  e: Pick<SessionHistoryEntry, "aborted" | "passed" | "notTaken">,
): SessionHistoryVerdict {
  if (e.aborted) return "aborted";
  if (e.passed) return "passed";
  if (e.notTaken) return "notTaken";
  return "failed";
}

/** „A“, „B“ — every act named, comma-joined: this is a list, not prose, so it
 *  does not shorten to «и още N» the way a sentence has to (§5.8). */
function quotedNames(titlesBg: readonly string[]): string {
  return titlesBg.map((t) => `„${t}“`).join(", ");
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

/**
 * The cause, under the verdict (ADR-009 §5.8, THEO-4).
 *
 * Both lines are REASONS, never a restatement of the pill: what the act was,
 * what it did to the изпитен лист, and what makes the lesson count. No law text
 * and no article number is written here — the act's own name is retrieved from
 * the catalogue in `historyLessonMistakes.ts`, and the full explanation +
 * corrective are two taps away on the result screen and in the stored debrief
 * below.
 */
function LessonMistakeBlock({
  titlesBg,
  charged,
}: {
  titlesBg: readonly string[];
  charged: boolean;
}) {
  // ≤ 1 covers the unnameable case too, where the sentence speaks of „грешката
  // на урока" as the one thing it is.
  const one = titlesBg.length <= 1;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-sm font-semibold text-warning">
        {titlesBg.length === 0
          ? "Кодът на грешката на урока вече не е в каталога — затова не е назована."
          : `${one ? "Грешката на урока" : "Грешките на урока"}: ${quotedNames(titlesBg)}`}
      </p>
      <p className="text-xs leading-relaxed text-muted">
        {/* Both halves are true of every drive that reaches this block: under
            ADR-009 a first occurrence is never charged, so anything that DID
            reach the sheet is a repeat and is listed below. */}
        {charged
          ? "Повторението влезе и в изпитния лист — долу."
          : "Първата поява не влиза в наказателните точки."}{" "}
        {one
          ? "Урокът се зачита само когато го изкараш без нея."
          : "Урокът се зачита само когато го изкараш без тях."}
      </p>
    </div>
  );
}

export function SessionHistorySection({
  entries,
  initialOpenId = null,
}: {
  entries: SessionHistoryEntry[];
  /**
   * Which row starts expanded. Production renders none (the student taps), and
   * the default keeps that call site byte-identical — it exists because this
   * repo has NO DOM environment configured (vitest `environment: "node"`,
   * vitest.config.ts), so a test cannot click a row, and the expanded panel is
   * where ADR-009's cause line lives. Asserting that panel through the real
   * component is the difference between testing the markup a student reads and
   * testing a helper nobody renders.
   */
  initialOpenId?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(initialOpenId);

  if (entries.length === 0) return null;

  return (
    <section aria-label="История на сесиите" className="flex flex-col gap-2">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-muted">
        История на сесиите
      </h2>
      <ul className="flex flex-col gap-2">
        {entries.map((e) => {
          const open = openId === e.id;
          const verdict = sessionHistoryVerdict(e);
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
                  className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${VERDICT_PILL_CLASS[verdict]}`}
                >
                  {SESSION_HISTORY_LABEL_BG[verdict]}
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
                  ) : /* ADR-009: a charged-mistake count of 0 no longer implies
                        «без грешки». The lesson's own mistake is free the first
                        time, so on the drives this ADR is about the sheet is
                        empty and the drive is anything but clean. The same
                        predicate as the cause block below, and not `notTaken`
                        alone: a row whose лист failed reads «Неиздържан» and
                        still had a lesson mistake, and «без грешки» is no more
                        true there. */
                  !e.notTaken &&
                    e.lessonMistakeTitlesBg.length === 0 &&
                    e.mistakeCount === 0 &&
                    !e.payloadUnreadable ? (
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

                  {/* ADR-009: FIRST in the panel, above the charged list —
                      this is the reason the row says «Не е взет», and a
                      student who opens the row is asking exactly that.

                      …AND ALSO ON A ROW THE ИЗПИТЕН ЛИСТ FAILED, where
                      `notTaken` is false and the pill correctly reads
                      «Неиздържан». 96 of the 654 hit drives on this tree are
                      that shape (68 of them a collision): the лист decides the
                      WORD, and this block is the other fact — the lesson's own
                      mistake happened too, and it is why the drive would not
                      have counted even without the points. Gating it on the
                      pill would have made the student lose one of the two.  */}
                  {e.notTaken || e.lessonMistakeTitlesBg.length > 0 ? (
                    <LessonMistakeBlock
                      titlesBg={e.lessonMistakeTitlesBg}
                      charged={e.lessonMistakeCharged}
                    />
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
