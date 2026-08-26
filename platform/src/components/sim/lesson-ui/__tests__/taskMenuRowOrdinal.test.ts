/**
 * =============================================================================
 * «2/2» IS NOT A SCORE — the ⚙ sheet's «Задача» row (sc-sp-harsh-brake:2b71d0c7)
 * =============================================================================
 *
 * THE FRAME: `w11/frames/sc-sp-harsh-brake__mobile-right/07b-menu.png` —
 * «Задача    2/2» as a bare value in a settings list beside Съветник / Звук /
 * Карта / Качество, with no title and no context to mark it an ordinal, on the
 * same leg whose debrief books «✓ Стигни контролната зона … 1:52» and «– Стигни
 * края на отсечката», i.e. ONE of two done.
 *
 * WHY THE MENU AND NOT THE BANNER. The finding's first form named the banner
 * and was refuted there, correctly: `run.log` carries «Задача 1/2Стигни
 * контролната зона…» and «Задача 2/2Стигни края на отсечката» — N-of-M *plus
 * that objective's title*, which is unambiguous, and 01-arrival prints 1/2 at
 * 0 км/ч before anything can be done. The MENU row is a different widget with
 * no title beside it, and on mobile it is the ONLY task readout the student
 * gets: the banner is ✗ NOT ON THE GLASS on 43 of 43 drive beats of that leg,
 * because it retires after its TTL — which is the row's whole reason to exist.
 * The mechanism was refuted; the harm was not.
 *
 * WHAT THIS FILE HOLDS AND WHAT IT CANNOT. jsdom has no layout engine, so
 * „56.5 px fits the sheet" is not assertable here — the sheet's own block
 * comment carries that arithmetic and `soundChoice.test.ts` pins the
 * cap+scroll pair that makes an extra hint line safe. What IS assertable is
 * that the row renders the ordinal wording and the task's own sentence, and
 * that a solidus has not crept back into it. Source pins, comment-proof, for
 * the reason `soundChoice.test.ts` states: a copy change nothing renders is the
 * shape this programme keeps paying for.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** CRLF-normalised — this repo checks out CRLF on Windows and stores LF. */
const SHELL = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);

/** Comment-proof: commenting a guarded line out cannot satisfy a pin. */
const LIVE = SHELL.split("\n")
  .filter((l) => {
    const t = l.trim();
    return t !== "" && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  })
  .join("\n");

/** The source span of the `key: "task"` menu item, comments already stripped. */
function taskRowSource(): string {
  const start = LIVE.indexOf('key: "task"');
  expect(start, 'the «Задача» menu row is gone — this file guards nothing').toBeGreaterThan(-1);
  const end = LIVE.indexOf('key: "predrive"', start);
  expect(end, "the row after «Задача» moved — re-anchor this span").toBeGreaterThan(start);
  return LIVE.slice(start, end);
}

describe("the ⚙ sheet's task row reads as an ordinal, not as a completion count", () => {
  it("NON-VACUITY: the span really is the task row", () => {
    // A span that stopped matching would make every case below vacuously
    // green — the failure mode every „0 defects" instrument in this project
    // has had at least once.
    const row = taskRowSource();
    expect(row).toContain('labelBg: "Задача"');
    expect(row).toContain("setTaskPing");
  });

  it("the counter is «N от M» — the ordinal form, never the score grammar", () => {
    const row = taskRowSource();
    expect(row).toContain("} от ${snap.objectiveTotal}");
    // MUTATION: put the solidus back (`${…}/${snap.objectiveTotal}`) and this
    // goes red. A solidus is the product's own SCORE grammar one row away —
    // «Изпит 6/9», «Подготовка 4/13» — which is exactly why the bare fraction
    // read as „two of two done".
    expect(
      /\$\{snap\.objectiveIndex\}\/\$\{snap\.objectiveTotal\}/.test(row),
      "the score grammar is back on a row that grades nothing",
    ).toBe(false);
  });

  it("the task's OWN SENTENCE travels with the number", () => {
    // `taskLineBg` is `snap.objectiveTitle` outside mistake mode — the same
    // sentence the banner would carry if it were still up. Without it the row
    // says how many and never which, which is the whole finding.
    const row = taskRowSource();
    expect(row).toContain("hintBg: mistakeMode ? null : taskLineBg");
  });

  it("…and a screen reader gets one name carrying label, ordinal and sentence", () => {
    const row = taskRowSource();
    expect(row).toContain("ariaLabelBg:");
    expect(row).toContain("`Задача ${Math.min(");
    expect(row).toContain("}: ${taskLineBg}`");
  });

  it("mistake mode keeps the shape it shipped with — no ordinal to disambiguate", () => {
    // Its line is the lesson description rather than an objective title and its
    // value is already null, so neither the fraction nor the second line
    // applies. Widening the change into it would put a paragraph in a 240 px
    // sheet for no gain.
    const row = taskRowSource();
    expect(row).toContain("valueBg: mistakeMode");
    expect(row).toContain("hintBg: mistakeMode ? null");
  });
});
