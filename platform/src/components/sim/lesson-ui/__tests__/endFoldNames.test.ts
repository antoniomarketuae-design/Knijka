/**
 * THE DEBRIEF'S FOLD PILL NAMED A SECTION THE STUDENT HAD ALREADY PASSED
 * — sc-roundabout-entry:fe081cf1, 2026-09-08.
 *
 * The row is „the fault card's body text is cut, so the explanation the student
 * is judged by is not on screen". Its filed address (`hud/FaultCard.tsx`) is
 * refuted at HEAD — the debrief's card prints the whole authored explanation,
 * unclamped — but the surface it lives on has a cut of its own, and the one
 * sentence that says what is behind that cut was a CONSTANT:
 *
 *     ↓ Разборът продължава — превърти за оценката по задачи
 *
 * MEASURED AT HEAD, not argued: `.audit-frames/w28/frames/
 * sc-roundabout-entry__mobile-right/_audit-debrief.json`, recorded 2026-09-08
 * against commit 6363677 with `target.attested: true` and `dirtyCount: 0`.
 * The scroller is 360 px of a 5006 px document and the landmarks are
 *
 *     Оценка на маневрата    790 → 1057
 *     Карта на грешките     1073 → 1428
 *     Задачи от маршрута    1443 → 1559
 *     Грешки                1575 → 2994
 *     Разбор                3010 → 4824
 *
 * and the frame `08-debrief-p6.png` is taken at scrollTop 1567. «Задачи от
 * маршрута» ended eight pixels above the top of that window: the pill was
 * sending a student DOWN for a section he had scrolled PAST, while what was
 * actually under the cut was the rest of «Грешки» — the law-cited explanation
 * of the fault he had just been charged ten points for — and then «Разбор».
 * A cue that names the wrong thing is worse than a bare one, because it tells
 * him he has read the part he has not: THEO-4's bare verdict arriving through
 * a scroll hint.
 *
 * Both halves are asserted, the way this file's sibling splits them: the PURE
 * derivation (jsdom has no layout engine, so a rendered assertion about which
 * section is under a fold would pass whatever the DOM said) and the SOURCE
 * wiring that feeds it.
 *
 * EVERY CASE WAS PROVED BY MUTATION — the box that should flip it was
 * constructed and watched to flip it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  endFoldLabelBg,
  endFoldNextSection,
  type EndSectionBox,
} from "../LessonPlayShell";

const SHELL = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CODE = stripComments(SHELL);

/** The w28 debrief, in the scroller's own content pixels. */
const W28: EndSectionBox[] = [
  { labelBg: "Оценка на маневрата", topPx: 790, bottomPx: 1057 },
  { labelBg: "Карта на грешките", topPx: 1073, bottomPx: 1428 },
  { labelBg: "Задачи от маршрута", topPx: 1443, bottomPx: 1559 },
  { labelBg: "Грешки", topPx: 1575, bottomPx: 2994 },
  { labelBg: "Разбор", topPx: 3010, bottomPx: 4824 },
];

/** `08-debrief-p6.png`: scrollTop 1567 in a 360 px window. */
const P6_FOLD = 1567 + 360;

describe("the debrief's fold pill names what is really under the cut", () => {
  it("THE FRAME: at w28's own scroll position the answer is «Грешки», not the tasks", () => {
    const next = endFoldNextSection(W28, P6_FOLD);
    expect(next).toEqual({ labelBg: "Грешки", continues: true });
    // The whole of the defect in one assertion: the retired constant named
    // this, and this section is 368 px ABOVE the top of the window.
    expect(next!.labelBg).not.toBe("Задачи от маршрута");
    expect(endFoldLabelBg(next)).toBe("↓ „Грешки“ продължава — превърти надолу");
  });

  it("the section the cut RUNS THROUGH outranks the one that starts below it", () => {
    // At P6_FOLD both are true — «Грешки» straddles the cut and «Разбор»
    // starts below it — and the nearer answer to „what am I scrolling to" is
    // the sentence that was severed. Mutation: swap the two loops in
    // `endFoldNextSection` and this case returns «Разбор».
    expect(endFoldNextSection(W28, P6_FOLD)!.labelBg).toBe("Грешки");
    // …and where nothing straddles the cut, the next heading is the answer.
    const between = 1570; // after «Задачи» ends (1559), before «Грешки» (1575)
    expect(endFoldNextSection(W28, between)).toEqual({
      labelBg: "Грешки",
      continues: false,
    });
    expect(endFoldLabelBg(endFoldNextSection(W28, between))).toBe(
      "↓ Следва „Грешки“ — превърти надолу",
    );
  });

  it("BOTH DIRECTIONS: it moves with the student instead of standing still", () => {
    // The property the constant could not have: four scroll positions, four
    // different answers. This is what „it says WHAT is below" was claiming.
    const seen = [900, 1100, 1500, P6_FOLD, 3500].map(
      (fold) => endFoldNextSection(W28, fold)?.labelBg ?? null,
    );
    expect(seen).toEqual([
      "Оценка на маневрата",
      "Карта на грешките",
      "Задачи от маршрута",
      "Грешки",
      "Разбор",
    ]);
    expect(new Set(seen).size).toBe(5);
  });

  it("the last section read to its end has nothing left to name, and says so", () => {
    // Past the bottom of everything: no straddle, no next. The pill's own
    // condition (`endHasMore`) is what stops it rendering at all here — this
    // arm exists for the render between „laid out" and „measured", where a
    // wrong name would be worse than no name.
    expect(endFoldNextSection(W28, 5000)).toBeNull();
    expect(endFoldNextSection([], P6_FOLD)).toBeNull();
    expect(endFoldLabelBg(null)).toBe("↓ Разборът продължава — превърти надолу");
    // …and it still says the reading continues, which is the whole reason
    // `scrollRemainingPx` exists.
    expect(endFoldLabelBg(null)).toContain("продължава");
  });

  it("no sentence is authored twice — the name is the section's own label", () => {
    // ADR-002's neighbour rule for copy: the cue and the heading the student
    // lands on are ONE string, so they cannot drift. Mutation: a table of
    // hand-written names here would pass every case above and go stale the
    // first time a section is renamed.
    const invented = endFoldLabelBg({ labelBg: "Разминавания на косъм", continues: false });
    expect(invented).toContain("Разминавания на косъм");
    // The labels come from `hud/SessionEndScreen.tsx`'s own landmarks.
    const END = readFileSync(
      resolve(__dirname, "../../../../modules/sim/hud/SessionEndScreen.tsx"),
      "utf8",
    );
    for (const box of W28) {
      expect(END, box.labelBg).toContain(`<section aria-label="${box.labelBg}"`);
    }
  });

  it("THE WIRING — the pill renders the measurement and not a literal", () => {
    // The half a pure test cannot see. `endFoldNames` shipped once before as a
    // predicate nothing read; these three lines are what make it live.
    expect(CODE).toContain("const [endFoldBg, setEndFoldBg] = useState(() => endFoldLabelBg(null));");
    expect(CODE).toContain(
      "setEndFoldBg(endFoldLabelBg(endFoldNextSection(sections, el.scrollTop + el.clientHeight)));",
    );
    const pill = CODE.slice(CODE.indexOf('data-hud="end-fold"'));
    const element = pill.slice(0, pill.indexOf("</p>"));
    expect(element).toContain("{endFoldBg}");
    // …and the constant it replaced is gone from the render, not merely
    // shadowed by it.
    expect(CODE).not.toContain("превърти за оценката по задачи");
  });

  it("the walk is skipped when there is no fold, so a scroll costs nothing extra", () => {
    // The section walk is `querySelectorAll` + a rect per landmark on every
    // scroll event. It runs only past the guard, i.e. only while the pill is
    // on the glass; without this the cost is paid on every debrief that fits.
    const fn = CODE.slice(CODE.indexOf("const measureEndScroll"));
    const body = fn.slice(0, fn.indexOf("}, []);"));
    const guard = body.indexOf(
      "if (scrollRemainingPx(el.scrollTop, el.clientHeight, el.scrollHeight) <= 0) return;",
    );
    expect(guard).toBeGreaterThan(-1);
    expect(body.indexOf('querySelectorAll("section[aria-label]")')).toBeGreaterThan(guard);
  });
});
