/**
 * ADR-009 — THE HISTORY ROW, RENDERED (doc 92 §5.8, lane F).
 *
 * THE SCREEN THIS IS ABOUT. Before this change the list printed, for a practice
 * drive that finished its route with a clean изпитен лист and committed the one
 * mistake its lesson exists to teach:
 *
 *     17 сеп 21:26   Изпреварване на велосипедист · Ниво 3   НЕИЗДЪРЖАН
 *                    0 наказателни изпитни т.                  без грешки
 *
 * Three claims, of which the second is not the verdict the product reached and
 * the third is false. Doc 64 THEO-4 (founder-ratified) counts a verdict with no
 * reason as a defect in itself, so the row now carries the word AND the cause.
 *
 * WHY IT RENDERS THE REAL COMPONENT. `historyMistakes.test.ts` beside this file
 * proves the fold; a fold is not a screen. This repo has shipped four
 * green-and-blind checks, so the assertions below read the markup a student
 * reads — `renderToStaticMarkup`, the same way `point-scales-rendered.test.tsx`
 * does, because vitest runs with `environment: "node"` and there is no DOM to
 * click a row open with (that is what `initialOpenId` is for).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
// Deep import, test-only — see the last case in this file for why the two
// surfaces keep their own copy of the word.
import { SESSION_VERDICT_LABEL_BG } from "@/modules/sim/hud/SessionEndScreen";
import { historyLessonMistakeRowFields } from "./historyLessonMistakes";
import {
  SESSION_HISTORY_LABEL_BG,
  SessionHistorySection,
  sessionHistoryVerdict,
  type SessionHistoryEntry,
} from "./session-history";

/** The catalogue title `page.tsx` retrieves for the squeeze. */
const SQUEEZE_BG = "Тясно изпреварване на велосипедист";

/** The same act as the SERVER stores it — a code and a clock, never a name. */
const SQUEEZE_ROW = { code: "VULNERABLE_PASS_TOO_CLOSE", t: 20.9, charged: false };

function entry(extra: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry {
  return {
    id: "sess-1",
    lessonTitleBg: "Изпреварване на велосипедист · Ниво 3 — Градско каране",
    finishedAtIso: "2026-09-17T21:26:00.000Z",
    passed: false,
    aborted: false,
    terminated: false,
    score: 0,
    effectiveScore: 0,
    mistakeCount: 0,
    nearMissCount: 0,
    topMistakeTitleBg: null,
    mistakes: [],
    debrief: null,
    payloadUnreadable: false,
    notTaken: false,
    lessonMistakeTitlesBg: [],
    lessonMistakeCharged: false,
    ...extra,
  };
}

/** The not-taken row as `page.tsx` builds it. */
function notTakenEntry(extra: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry {
  return entry({
    notTaken: true,
    lessonMistakeTitlesBg: [SQUEEZE_BG],
    topMistakeTitleBg: SQUEEZE_BG,
    ...extra,
  });
}

/** Markup with the tags stripped — what a reader actually reads. */
function textOf(entries: SessionHistoryEntry[], openId: string | null = null): string {
  return renderToStaticMarkup(
    <SessionHistorySection entries={entries} initialOpenId={openId} />,
  )
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

describe("the collapsed row", () => {
  const row = textOf([notTakenEntry()]);

  it("reads «Не е взет», not «Неиздържан»", () => {
    expect(row).toContain("Не е взет");
    expect(row).not.toContain("Неиздържан");
  });

  it("names the cause beside the word", () => {
    // THEO-4: the pill alone is a bare verdict. The corner line was the top
    // CHARGED mistake, and a lesson mistake's first occurrence is never
    // charged — so on exactly these drives it had nothing to show.
    expect(row).toContain(SQUEEZE_BG);
  });

  it("no longer calls the drive clean", () => {
    // «без грешки» was reached through `mistakeCount === 0`, which is TRUE on
    // this drive and means only that the изпитен лист took nothing.
    expect(row).not.toContain("без грешки");
  });

  it("still refuses «без грешки» when the act cannot be named either", () => {
    // The row the suppression is actually FOR: the catalogue no longer carries
    // the stored code, so the corner has no title to print and falls through to
    // the «without mistakes» branch — over a drive that was refused for a
    // mistake. (With a title present, the corner is occupied and the branch is
    // unreachable; that is why this case exists separately.)
    const row = textOf([notTakenEntry({ lessonMistakeTitlesBg: [], topMistakeTitleBg: null })]);
    expect(row).toContain("Не е взет");
    expect(row).not.toContain("без грешки");
  });

  it("does not suppress «без грешки» on a drive that really was clean", () => {
    // Vacuity guard for the assertion above: the word must still appear where
    // it is true, or the repair has simply deleted a true sentence.
    const clean = textOf([entry({ passed: true, mistakeCount: 0 })]);
    expect(clean).toContain("без грешки");
    expect(clean).toContain("Издържан");
  });

  it("keeps the other three words exactly as they were", () => {
    expect(textOf([entry({ aborted: true })])).toContain("Прекъснат");
    expect(textOf([entry({ passed: true })])).toContain("Издържан");
    expect(
      textOf([
        entry({
          score: 12,
          mistakeCount: 2,
          topMistakeTitleBg: "Превишена скорост",
        }),
      ]),
    ).toContain("Неиздържан");
  });
});

describe("the expanded row — the reason, above the sheet", () => {
  it("opens with the lesson's own mistake, named", () => {
    const panel = textOf([notTakenEntry()], "sess-1");
    expect(panel).toContain(`Грешката на урока: „${SQUEEZE_BG}“`);
  });

  it("says what it cost, and what makes the lesson count", () => {
    const panel = textOf([notTakenEntry()], "sess-1");
    // Both halves are reasons, not a restatement of the pill: the first
    // occurrence is free (so the 0 on the same row is not a contradiction),
    // and the lesson counts only when the drive goes without it.
    expect(panel).toContain("Първата поява не влиза в наказателните точки.");
    expect(panel).toContain("Урокът се зачита само когато го изкараш без нея.");
  });

  it("points at the изпитен лист instead, once a repeat has been charged", () => {
    // The uncharged sentence would be false here — the repeat DID take points,
    // and they are listed in the same panel.
    const panel = textOf([notTakenEntry({ lessonMistakeCharged: true, score: 3 })], "sess-1");
    expect(panel).toContain("Повторението влезе и в изпитния лист — долу.");
    expect(panel).not.toContain("Първата поява не влиза");
  });

  it("speaks of several acts in the plural", () => {
    const panel = textOf(
      [
        notTakenEntry({
          lessonMistakeTitlesBg: [SQUEEZE_BG, "Резки спирачки без причина"],
        }),
      ],
      "sess-1",
    );
    expect(panel).toContain(
      `Грешките на урока: „${SQUEEZE_BG}“, „Резки спирачки без причина“`,
    );
    expect(panel).toContain("Урокът се зачита само когато го изкараш без тях.");
  });

  it("says WHY it cannot name the act, rather than printing a bare verdict", () => {
    // A code the catalogue has since dropped: the drive was still refused, and
    // the panel owes the student the reason it has — that the name is gone.
    const panel = textOf([notTakenEntry({ lessonMistakeTitlesBg: [] })], "sess-1");
    expect(panel).toContain("вече не е в каталога");
    expect(panel).toContain("Урокът се зачита само когато го изкараш без нея.");
  });

  it("prints nothing of the sort on a row with no hit", () => {
    const panel = textOf([entry({ score: 12, mistakeCount: 0 })], "sess-1");
    expect(panel).not.toContain("Грешката на урока");
    expect(panel).not.toContain("Урокът се зачита");
  });
});

describe("sessionHistoryVerdict — one place the word is decided", () => {
  it("reports an abort as an abort, a pass as a pass, a hit as not taken", () => {
    expect(sessionHistoryVerdict({ aborted: true, passed: false, notTaken: true })).toBe("aborted");
    expect(sessionHistoryVerdict({ aborted: false, passed: true, notTaken: false })).toBe("passed");
    expect(sessionHistoryVerdict({ aborted: false, passed: false, notTaken: true })).toBe(
      "notTaken",
    );
    expect(sessionHistoryVerdict({ aborted: false, passed: false, notTaken: false })).toBe(
      "failed",
    );
  });

  /**
   * IS TOTAL — over the FOUR things a stored row can be, not the three the
   * label function takes.
   *
   * The first draft of this case swept `sessionHistoryVerdict`'s own three
   * booleans and concluded «eight rows ARE all the drives there are». They are
   * not: `notTaken` arrives from a fold, and that fold had three inputs of its
   * own with the изпитен лист missing from them. So the exhaustive case was
   * TOTAL OVER THE WRONG SPACE, and it pinned the defect in place — 96 crashed
   * drives reading «Не е взет» in warning tone, and eight green rows saying the
   * fold could not do that.
   *
   * The sweep now starts where the row does: the stored payload. `sheetPassed`
   * carries three values because absent is a third answer (a row written before
   * 2026-09-18), and the census instrument doc 92 §9 names still does not exist
   * (lane H), so exhaustion over the stored shape is the only whole claim
   * available.
   */
  it("is total over the four stored inputs — a failed лист always reads «Неиздържан»", () => {
    const seen: Record<string, string> = {};
    for (const aborted of [false, true]) {
      for (const passed of [false, true]) {
        for (const sheetPassed of [true, false, undefined]) {
          for (const hits of [[SQUEEZE_ROW], []]) {
            const fields = historyLessonMistakeRowFields(
              { lessonMistakes: hits, aborted, sheetPassed } as never,
              null,
            );
            const key =
              `${aborted ? "A" : "-"}${passed ? "P" : "-"}` +
              `${sheetPassed === undefined ? "?" : sheetPassed ? "P" : "F"}` +
              `${hits.length > 0 ? "H" : "-"}`;
            seen[key] =
              SESSION_HISTORY_LABEL_BG[
                sessionHistoryVerdict({ aborted, passed, notTaken: fields.notTaken })
              ];
          }
        }
      }
    }
    expect(seen).toEqual({
      // Not aborted, not passed — where the whole question lives.
      "--PH": "Не е взет", // the 558
      "--FH": "Неиздържан", // the 96, and the pill now matches the end screen
      "--?H": "Не е взет", // stored before 2026-09-18: the label it was given
      "--P-": "Неиздържан",
      "--F-": "Неиздържан",
      "--?-": "Неиздържан",
      // A pass cannot carry a hit (a hit is what makes `passed` false), and the
      // pass still wins, so a stored row can never contradict its own pill.
      "-PPH": "Издържан",
      "-PFH": "Издържан",
      "-P?H": "Издържан",
      "-PP-": "Издържан",
      "-PF-": "Издържан",
      "-P?-": "Издържан",
      // An abort has no grade at all, on any лист, with or without a hit.
      "A-PH": "Прекъснат",
      "A-FH": "Прекъснат",
      "A-?H": "Прекъснат",
      "A-P-": "Прекъснат",
      "A-F-": "Прекъснат",
      "A-?-": "Прекъснат",
      APPH: "Прекъснат",
      APFH: "Прекъснат",
      "AP?H": "Прекъснат",
      "APP-": "Прекъснат",
      "APF-": "Прекъснат",
      "AP?-": "Прекъснат",
    });
  });

  /**
   * THE CRASHED ROW, RENDERED — the drive the sweep above is about.
   *
   * `sc-ac-aquaplane@L3`: the student hit another vehicle, 10 наказателни
   * точки, and also committed the lesson's own mistake. Before the sheet was
   * folded in, this row read «Не е взет» in WARNING tone with «Несъобразена с
   * условията скорост» in the corner — while the result screen for the same
   * drive read «Неиздържан» in danger tone with the collision. 96 of the 654
   * hit drives on this tree are this shape and 68 of them struck something.
   */
  it("a drive that crashed reads «Неиздържан», in danger tone, with the crash in the corner", () => {
    const fields = historyLessonMistakeRowFields(
      {
        lessonMistakes: [{ code: "SPEED_TOO_FAST_FOR_CONDITIONS", t: 18.4, charged: false }],
        aborted: false,
        sheetPassed: false,
      } as never,
      "Удар в друго превозно средство",
    );
    const crashed = entry({ ...fields, id: "sess-crash", score: 10, mistakeCount: 1 });
    const markup = renderToStaticMarkup(
      <SessionHistorySection entries={[crashed]} initialOpenId="sess-crash" />,
    );
    const row = textOf([crashed], "sess-crash");
    expect(row).toContain("Неиздържан");
    expect(row).not.toContain("Не е взет");
    // The tone is the pill's, and a crash is not a warning. Read off the
    // rendered row rather than imported: the tone table is private to the
    // component, and a copy of it here would agree with itself.
    expect(markup).toContain('bg-danger/15 text-danger">Неиздържан');
    expect(markup).not.toContain('bg-warning/15 text-warning">');
    // The corner is about the same thing the pill is…
    expect(row).toContain("Удар в друго превозно средство");
    // …and the lesson's own act is NOT lost: the panel still explains it, which
    // is the half a student would have lost if the block were gated on the pill.
    expect(row).toContain("Грешката на урока: „Несъобразена с условията скорост“");
    expect(row).toContain("Урокът се зачита само когато го изкараш без нея.");
  });

  it("«без грешки» stays off a «Неиздържан» row that carries a lesson mistake", () => {
    // The corner used to be suppressed on `notTaken` alone, and folding the лист
    // into `notTaken` would have handed «без грешки» back to a drive with a
    // lesson mistake on it — the exact sentence this ADR came to delete, moved
    // one verdict across. Reachable when the лист failed on codes this
    // catalogue no longer carries, so `mistakeCount` is 0 with the sheet red:
    // rare, and it is the shape the suppression exists for.
    const row = textOf(
      [
        entry({
          notTaken: false,
          score: 10,
          mistakeCount: 0,
          topMistakeTitleBg: null,
          lessonMistakeTitlesBg: [SQUEEZE_BG],
        }),
      ],
      "sess-1",
    );
    expect(row).toContain("Неиздържан");
    expect(row).not.toContain("без грешки");
    expect(row).toContain(`Грешката на урока: „${SQUEEZE_BG}“`);
  });

  it("carries the product's own four words", () => {
    expect(SESSION_HISTORY_LABEL_BG).toEqual({
      aborted: "Прекъснат",
      passed: "Издържан",
      notTaken: "Не е взет",
      failed: "Неиздържан",
    });
  });

  it("says the same word as the result screen that produced the row", () => {
    // The two surfaces deliberately do NOT share a module: this list lives in a
    // client component that the /simulator page renders, and importing the HUD
    // barrel for three words would drag the whole result screen into that
    // page's bundle (audit M-26). So the coupling is asserted HERE, where the
    // import costs nothing — if either side is reworded, this goes red instead
    // of the student meeting two names for one verdict.
    expect(SESSION_HISTORY_LABEL_BG.notTaken).toBe(SESSION_VERDICT_LABEL_BG.lessonMistake);
    expect(SESSION_HISTORY_LABEL_BG.passed).toBe(SESSION_VERDICT_LABEL_BG.passed);
    expect(SESSION_HISTORY_LABEL_BG.failed).toBe(SESSION_VERDICT_LABEL_BG.failed);
  });
});
