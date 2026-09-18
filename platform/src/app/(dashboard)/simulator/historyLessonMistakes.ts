/**
 * ADR-009 in „История на сесиите" — the stored lesson-mistake rows of one past
 * drive, folded into what the row is allowed to SAY (doc 92 §5.8).
 *
 * WHY IT IS ITS OWN FILE, for exactly the reason `historyMistakes.ts` beside it
 * is: the only caller is `page.tsx buildHistoryEntries`, a server component that
 * reaches for `requireUser` and the SimSession store at module scope and
 * therefore cannot be unit-tested. A fold a gate has to be able to mutate does
 * not live inside the route.
 *
 * THE ONE THING THIS FILE EXISTS TO PREVENT. Before it, a practice drive that
 * finished the route with a clean изпитен лист and committed the lesson's own
 * mistake stored `passed: false`, and the list printed the red pill
 * «Неиздържан» beside „0 наказателни точки" and, in the corner,
 * «без грешки» — three statements, of which the middle one is not the verdict
 * the product reached and the last one is false. THEO-4 (doc 64,
 * founder-ratified) calls a verdict with no reason a defect in itself, so the
 * label and its cause are folded in one place and travel together.
 *
 * TRUST MODEL, unchanged from `historyMistakes.ts` and restated because this
 * fold names an act too: the stored row carries a CODE and a `detail`, never a
 * sentence. `lessonMistakeCopy` retrieves the Bulgarian title from the
 * violation catalogue — act-aware first, pooled second — so a tampered or stale
 * payload may list what happened and can never re-word it, re-price it or cite
 * an article (ADR-002). A code the catalogue no longer carries is dropped from
 * the names, and the verdict below still stands: see `notTaken`.
 */

import { lessonMistakeCopy } from "@/modules/sim/lessons";
import type { SimSessionEventsJson, StoredLessonMistake } from "@/modules/sim/lessons/store";

/** What one history row may say about its lesson mistakes. */
export interface HistoryLessonMistakeView {
  /**
   * The row reads «Не е взет» rather than «Неиздържан».
   *
   * It follows the STORED ROWS, not the retitling: a catalogue rename must
   * never be able to turn a not-taken drive back into «Неиздържан» — that would
   * be a stored row silently regraded by an edit somewhere else (doc 92 §6:
   * stored history is not regraded). An aborted drive keeps «Прекъснат»: the
   * student stopped before the end, and the end screen's own note says the
   * lesson would not have counted either way (§5.2).
   *
   * AND A FAILED ИЗПИТЕН ЛИСТ KEEPS «Неиздържан», which the first draft of this
   * file got wrong in the student's favour and against the truth. MEASURED
   * 2026-09-18 over all 2,434 authored drives: 654 carry a hit, 558 with a
   * clean sheet and **96 with a failed one** — 68 of those 96 having struck
   * something (COLLISION, 10 т.). On those 96 this row printed «Не е взет» in
   * WARNING tone, with the corner naming the lesson's own act, over a crash the
   * end screen calls «Неиздържан» in danger tone. Two surfaces, one drive, two
   * verdicts — and the softer one is the surface the student comes back to. The
   * sheet is asked FIRST here, exactly as `SessionEndScreen.sessionVerdict`
   * asks it, and for the same reason it gives: the лист is the only authority
   * for «Неиздържан».
   */
  notTaken: boolean;
  /** Retrieved catalogue titles, in the order the student met them. */
  titlesBg: string[];
  /**
   * Some occurrence of some hit reached the изпитен лист — under ADR-009 only a
   * REPEAT can (the first occurrence is always taught and always free), which
   * is what lets the expanded row point at the charged list below it instead of
   * claiming the mistake cost nothing.
   */
  anyCharged: boolean;
}

const EMPTY: HistoryLessonMistakeView = { notTaken: false, titlesBg: [], anyCharged: false };

/**
 * Stored rows → the row's lesson-mistake view.
 *
 * `rows` is whatever `parseSimSessionEvents` handed back (already shape-checked
 * per entry, malformed ones dropped); `aborted` is that row's stored flag;
 * `sheetPassed` is the изпитен лист on its own (`SimSessionEventsJson.
 * sheetPassed`).
 *
 * `sheetPassed !== false` and NOT `=== true`, deliberately: the field is absent
 * on every row written before 2026-09-18, and an absent field has to date the
 * row rather than mute a new one. An old not-taken row keeps its word (doc 92
 * §6), and a new row with a failed лист loses it.
 */
export function historyLessonMistakeView(
  rows: readonly StoredLessonMistake[] | null | undefined,
  aborted: boolean,
  sheetPassed?: boolean,
): HistoryLessonMistakeView {
  if (rows === null || rows === undefined || rows.length === 0) return EMPTY;

  const titlesBg: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    // One name per CODE. The fold that wrote the payload already emits one row
    // per code, so this only guards a duplicated/tampered column — but a reason
    // list that printed the same act twice would read as two failed lessons.
    if (seen.has(row.code)) continue;
    seen.add(row.code);
    const copy = lessonMistakeCopy(row);
    if (copy === null) continue; // uncatalogued code — unnameable, not unreal
    titlesBg.push(copy.titleBg);
  }

  return {
    notTaken: !aborted && sheetPassed !== false,
    titlesBg,
    anyCharged: rows.some((r) => r.charged),
  };
}

/**
 * THE WHOLE ROW-SIDE OF ADR-009, IN ONE CALL — because the four expressions
 * that read the fold used to live inside `page.tsx buildHistoryEntries`, which
 * no test can import (a server component that reaches for `requireUser` at
 * module scope). MEASURED by lane F's own verifier: with the fold fully tested,
 * setting `notTaken: false` for every row inside that map left **3,088 tests
 * green** — no student would ever have seen «Не е взет» in history again and
 * every gate would have agreed. A fold a gate can mutate is not enough when the
 * wiring is what carries it.
 *
 * So the wiring moved here, where the same gate reaches it, and `page.tsx`
 * spreads the result: leaving the spread out is a tsc error (the four fields
 * are required on `SessionHistoryEntry`), and changing any of the four answers
 * is a red test rather than a silent one.
 *
 * `topChargedTitleBg` is the gravest CHARGED fault's title, or null — the
 * pre-ADR-009 corner, passed in rather than recomputed so this file stays free
 * of the mistakes fold beside it.
 */
export function historyLessonMistakeRowFields(
  ev: Pick<SimSessionEventsJson, "lessonMistakes" | "aborted" | "sheetPassed"> | null | undefined,
  topChargedTitleBg: string | null,
): {
  topMistakeTitleBg: string | null;
  notTaken: boolean;
  lessonMistakeTitlesBg: string[];
  lessonMistakeCharged: boolean;
} {
  const view = historyLessonMistakeView(
    ev?.lessonMistakes,
    ev?.aborted ?? false,
    ev?.sheetPassed,
  );
  return {
    /**
     * ADR-009: on a not-taken row the one-line summary is the LESSON's own
     * mistake, not the gravest charged one. A hit's first occurrence is free,
     * so on the drives this ADR is about there is no charged fault at all and
     * this corner printed «без грешки» beside a red «Неиздържан» pill. On a row
     * the лист failed the corner stays the charged fault — that IS what the
     * pill is about there, and the lesson's act is named in the panel below.
     */
    topMistakeTitleBg:
      view.notTaken && view.titlesBg.length > 0 ? view.titlesBg[0] : topChargedTitleBg,
    notTaken: view.notTaken,
    lessonMistakeTitlesBg: view.titlesBg,
    lessonMistakeCharged: view.anyCharged,
  };
}
