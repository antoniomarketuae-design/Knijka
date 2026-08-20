/**
 * =============================================================================
 * THE PANEL THAT CUT ITS OWN LAST RULE, AND THE CARD THAT SAID IT TWICE
 * — catalogue sweep 161, chunk routed to LessonPlayShell.tsx, 2026-08-17.
 * =============================================================================
 *
 * Two rules, both filed repeatedly by the sweep, both reproduced on the same
 * deployed frame before anything was changed:
 *
 *   sc-ac-bridge-ice/pc-right/01-arrival.png  (1440 × 900, staging)
 *     · the ИНСТРУКЦИИ panel printed steps 1–8, sliced 9 through its x-height
 *       and never showed 10 — the step that says where the ice ends — with no
 *       scrollbar and no «още» of any kind, while ~92 px of the column it lives
 *       in sat empty underneath it;
 *     · the objective banner read «ЗАДАЧА 1/3 Вдигни крака от газта ПРЕДИ
 *       близките устой» and the advisor card 30 px below it read «Вдигни крака
 *       от газта ПРЕДИ близките устой — дръж под 35 км/ч».
 *
 * WHAT EACH TEST HERE IS FOR. Both fixes have a pure half and a CSS half, and
 * the pure halves are what these hold: `rowsBelowFold` (does the card know
 * something is hidden?) and `advisorEchoTrim` (is the second card saying
 * anything new?). The CSS half is held by the contract block at the bottom,
 * which reads the shell's own source — the same technique
 * `notify-column.test.ts` and `thumb-band-clearance.test.ts` use, and for the
 * same reason: jsdom has no layout engine, so a rendered assertion about a
 * flex box's height would pass no matter what the class list said.
 *
 * EVERY CASE BELOW FAILS ON THE PRE-FIX BEHAVIOUR IN ONE DIRECTION OR THE
 * OTHER. The pairs are deliberate — a trim that returned null for everything
 * and a counter that returned 0 for everything would both have "fixed" the
 * frames while destroying the surfaces they were meant to save.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { advisorEchoTrim, listRowsInScrollCoords, rowsBelowFold } from "./LessonPlayShell";

const SHELL = readFileSync(resolve(__dirname, "./LessonPlayShell.tsx"), "utf8");

/**
 * THE SOURCE WITH ITS PROSE TAKEN OUT — and the first version of this file
 * needed it, which is why it is here rather than a bare `SHELL.includes`.
 *
 * `expect(SHELL).not.toContain("max-h-[28vh]")` FAILED against the fixed
 * shell: the comment explaining why that cap was removed quotes the cap. A
 * source assertion that cannot tell code from the paragraph describing it is
 * not a guard, it is a ban on writing the reason down — and this file's whole
 * register is writing the reason down. So every assertion below runs on code.
 */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The BriefingCard component, code only. */
const CARD = stripComments(
  SHELL.slice(
    SHELL.indexOf("export function BriefingCard({"),
    SHELL.indexOf('THE „MICRO MAJOR BUTTON WITH SUB MENU"'),
  ),
);

/** The right-edge notification column's JSX, code only. */
const COLUMN = stripComments(
  SHELL.slice(
    SHELL.indexOf('data-hud="notify-column"'),
    SHELL.indexOf("<HudToasts"),
  ),
);

/* ─────────────────────────────────────────────────────────────────────────────
   1 · THE CARD KNOWS WHEN IT IS HIDING SOMETHING
   ────────────────────────────────────────────────────────────────────────── */

/** The ten authored steps of sc-ac-bridge-ice as they laid out on the frame:
 *  11 px type, `leading-tight`, `gap-0.5` — two-line steps at 28 px, one-line
 *  at 16 px. Taken from the panel that truncated, not invented. */
const BRIDGE_ICE_ROWS = [
  { top: 0, height: 28 },
  { top: 30, height: 28 },
  { top: 60, height: 28 },
  { top: 90, height: 28 },
  { top: 120, height: 28 },
  { top: 150, height: 28 },
  { top: 180, height: 28 },
  { top: 210, height: 28 },
  { top: 240, height: 28 },
  { top: 270, height: 28 },
];

describe("rowsBelowFold · the «↓ още N» the panel never had", () => {
  it("counts the steps the old 28vh cap was eating, and counts them exactly", () => {
    // THE FRAME, AS A NUMBER. Under `max-h-[28vh]` the panel showed steps 1–8
    // whole and the top of 9 (so the fold fell inside row 9: between 240 and
    // 268 in these coordinates — 250 is the frame). Steps 9 and 10 could not be
    // read to the end, and «↓ още 2» is the honest thing to say about that.
    expect(rowsBelowFold(BRIDGE_ICE_ROWS, 0, 250)).toBe(2);
    // The pre-fix card said NOTHING in this state. That silence is the defect.
  });

  it("says nothing when the list fits — the affordance is not permanent chrome", () => {
    // The other direction, and the one that matters most: a counter that is
    // always on is the «↓ ОЩЕ 7 РЕДА» defect the sweep filed on the PHONE, where
    // the badge covered the sentence it was counting. 298 px is the full list.
    expect(rowsBelowFold(BRIDGE_ICE_ROWS, 0, 298)).toBe(0);
  });

  it("shrinks as the student scrolls, and reaches zero at the bottom", () => {
    // A count that does not move is a decoration. Scrolled to the end of a
    // 298 px list in a 224 px viewport (scrollTop 74) nothing is left below.
    expect(rowsBelowFold(BRIDGE_ICE_ROWS, 46, 224)).toBe(1);
    expect(rowsBelowFold(BRIDGE_ICE_ROWS, 74, 224)).toBe(0);
  });

  it("counts a half-visible row, and never counts a whole one", () => {
    // A row the student can start but not finish is a row they must come back
    // to, so it counts: top 0, height 28, fold at 20.
    expect(rowsBelowFold([{ top: 0, height: 28 }], 0, 20)).toBe(1);
    // The other direction — a row that fits is never counted, or the card would
    // announce «още N» over a list the student has read to the end.
    expect(rowsBelowFold([{ top: 0, height: 16 }], 0, 20)).toBe(0);
  });

  it("reports nothing before first layout instead of «още 10»", () => {
    // clientHeight 0 is „not measured yet", not „everything is hidden". Without
    // this the card flashes the full step count on every mount.
    expect(rowsBelowFold(BRIDGE_ICE_ROWS, 0, 0)).toBe(0);
  });

  it("tolerates the half-pixel line boxes an 11 px face actually produces", () => {
    // Fractional bottoms land on .5; an exact `>` reported a phantom step.
    expect(rowsBelowFold([{ top: 0, height: 224.5 }], 0, 224)).toBe(0);
    // …and the slack is 1 px, not a licence to hide a whole row.
    expect(rowsBelowFold([{ top: 0, height: 228 }], 0, 224)).toBe(1);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   1b · …AND THE NUMBERS IT IS FED COME FROM THE LIST, NOT FROM AN OFFSET PARENT
   ────────────────────────────────────────────────────────────────────────── */

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * THE COUNTER WAS RIGHT AND ITS INPUT WAS NOT — 2026-08-18.
 *
 * Every case in §1 above passes and always did: `rowsBelowFold` is correct
 * arithmetic on rows stated in the LIST's own coordinates. The component never
 * gave it those. It read `li.offsetTop` — measured from the nearest OFFSET
 * PARENT, which is not the `<ol>` (statically positioned, so the walk goes
 * straight past it) but the BriefingCard root, an element with `backdrop-blur`.
 * `scrollTop` and `clientHeight` came from the `<ol>`. Two origins, one
 * comparison.
 *
 * The difference is the card's own header band: `py-1.5` (6 px) + the
 * «ИНСТРУКЦИИ» / ✕ row + the list's `mt-1` (4 px) ≈ 25 px at the shipped
 * classes, against a 30 px step — added to every row's top and to nothing else,
 * so the fold reads ~25 px earlier than it is.
 *
 * THAT IS WHY THIS FILE COULD CERTIFY THE PROPERTY IT GUARDS. „says nothing
 * when the list fits" is the test that matters most here — its own comment says
 * so — and a briefing that fits has its last row's bottom ON the fold, i.e.
 * inside the 25 px the offset moved it by. So the answer was 1, on every
 * briefing in the catalogue, permanently: the «↓ ОЩЕ N» badge the sweep filed
 * twice for covering the sentence it was counting was on the whole time.
 *
 * The measurement is now `getBoundingClientRect` deltas — both ends in viewport
 * coordinates, so no offset parent is involved at all — and this is the pure
 * half of it, with the shipped offset as the negative control.
 * ═════════════════════════════════════════════════════════════════════════════
 */
describe("listRowsInScrollCoords · the rows arrive in the list's own frame", () => {
  /** The card as it lays out: the `<ol>` starts 25 px below the card's padding
   *  box, and the ten steps are 30 px apart inside it. Viewport coordinates,
   *  which is what `getBoundingClientRect` returns for both. */
  const LIST_TOP = 400;
  const HEADER_BAND = 25;
  const rects = BRIDGE_ICE_ROWS.map((r) => ({ top: LIST_TOP + r.top, height: r.height }));

  it("subtracts the list's own top, so the first row starts at 0", () => {
    expect(listRowsInScrollCoords(LIST_TOP, 0, rects)).toEqual(BRIDGE_ICE_ROWS);
  });

  it("puts a scrolled list back into scroll-content coordinates", () => {
    // Scrolled 74 px, the rows have moved UP the viewport by 74 — and their
    // position in the CONTENT has not changed at all, which is the frame the
    // fold is measured in.
    const scrolled = rects.map((r) => ({ top: r.top - 74, height: r.height }));
    expect(listRowsInScrollCoords(LIST_TOP, 74, scrolled)).toEqual(BRIDGE_ICE_ROWS);
  });

  it("THE FRAME, CORRECTED: «↓ още 2», where the shipped path said 3", () => {
    const rows = listRowsInScrollCoords(LIST_TOP, 0, rects);
    expect(rowsBelowFold(rows, 0, 250)).toBe(2);
    // …and the same frame through `offsetTop`, which is what shipped: every
    // row carries the header band, so step 8 joins 9 and 10 below the fold.
    const viaOffsetParent = BRIDGE_ICE_ROWS.map((r) => ({
      top: r.top + HEADER_BAND,
      height: r.height,
    }));
    expect(rowsBelowFold(viaOffsetParent, 0, 250)).toBe(3);
  });

  it("THE PROPERTY THIS FILE GUARDS, actually measured: a list that fits says nothing", () => {
    // 298 px is the full ten-step list — §1's own „the affordance is not
    // permanent chrome" case, run through the component's real measurement
    // path instead of through hand-written list coordinates.
    expect(rowsBelowFold(listRowsInScrollCoords(LIST_TOP, 0, rects), 0, 298)).toBe(0);
    // THE NEGATIVE CONTROL, and it is the whole point: through `offsetTop` the
    // same fitting list reports a hidden step. Not on the bridge-ice briefing —
    // on ANY briefing, because the offset is a property of the card and not of
    // the content.
    const viaOffsetParent = BRIDGE_ICE_ROWS.map((r) => ({
      top: r.top + HEADER_BAND,
      height: r.height,
    }));
    expect(rowsBelowFold(viaOffsetParent, 0, 298)).toBe(1);
    // A five-step briefing (the common case) fits in 148 px, and says so.
    const five = BRIDGE_ICE_ROWS.slice(0, 5);
    const fiveRects = five.map((r) => ({ top: LIST_TOP + r.top, height: r.height }));
    expect(rowsBelowFold(listRowsInScrollCoords(LIST_TOP, 0, fiveRects), 0, 148)).toBe(0);
    expect(
      rowsBelowFold(
        five.map((r) => ({ top: r.top + HEADER_BAND, height: r.height })),
        0,
        148,
      ),
    ).toBe(1);
  });

  it("THE WIRING: the card measures with rects, and `offsetTop` is gone from it", () => {
    // jsdom has no layout, so the component's own reading cannot be asserted by
    // rendering it — the technique this file's header already explains. The
    // shipped line was `top: (li as HTMLElement).offsetTop`.
    expect(CARD).toContain("listRowsInScrollCoords");
    expect(CARD).toContain("getBoundingClientRect");
    expect(CARD).not.toContain("offsetTop");
    expect(CARD).not.toContain("offsetHeight");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   1c · THE «13» THAT WAS FILED AT THIS FILE, AND WHY IT IS NOT THIS FILE'S
   ────────────────────────────────────────────────────────────────────────── */

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * DECLINED, WITH THE ARITHMETIC — sweep 161 chunk-0, routed here, 2026-08-20.
 *
 *   sc-vp-readiness/mobile-right/01-arrival.png
 *   „The inline briefing panel truncates mid-word and advertises 13 further
 *    lines, but the full briefing modal contains only 5 numbered items. The
 *    count is wrong and the cut text is unreadable."   «част от процедура… ↓ ОЩЕ 13 РЕДА»
 *
 * THE COUNT IS NOT WRONG, AND THE NOUN IS THE WHOLE ANSWER. The badge on that
 * frame says «РЕДА» — LINES. It compared 13 lines against 5 numbered ITEMS.
 * Reproduced off the frame rather than argued: the peek's text column fits
 * 27 characters (frame line 2, «предпазния колан — винаги,», is 26), and
 * greedy-wrapping sc-vp-readiness's five authored steps at 27 gives 3/4/4/4/3
 * = 18 lines. Five whole lines are on the glass. 18 − 5 = 13, which is the
 * number printed, to the line.
 *
 * AND IT IS NOT THIS FILE'S COUNTER EITHER. `BriefingCard`'s says
 * «↓ още N стъпка/стъпки» and counts `<li>` steps; the frame's says «реда» and
 * is `foldLinesBelow` in `modules/sim/hud/SimOverlay.tsx`, feeding the notify
 * column's peek (`hud/notifyColumn.ts`, «↓ още N реда» beside «ПРОЧЕТИ»).
 * Two counters, two units, one glass — which is exactly how a lane reading the
 * frame lands on the wrong file.
 *
 * THE OTHER HALF — „the cut text is unreadable" — was real and is already
 * closed, ELSEWHERE and AFTER this sweep: `git show ec1f56f:…/SimOverlay.tsx`
 * has no `foldWindowPx` at all, and the version that does masks the window to
 * the LINE GRID at both ends with a hard edge, so a line is now whole or
 * absent instead of inked to its waist. Nothing to do here.
 *
 * WHAT DOES BELONG HERE is the unit distinction itself, measured on the
 * function this file actually guards, so the next reader of that frame does not
 * have to re-derive it.
 * ═════════════════════════════════════════════════════════════════════════════
 */
describe("rowsBelowFold counts the rows it is HANDED — the «13 реда» vs «5 стъпки» split", () => {
  /** sc-vp-readiness as the peek laid it out: 27 chars per line at the notify
   *  column's 14 px leading (SimOverlay FOLD_FALLBACK_LEADING_PX), the five
   *  authored steps wrapping 3 / 4 / 4 / 4 / 3. */
  const LEADING = 14;
  const STEP_LINES = [3, 4, 4, 4, 3];
  const TOTAL_LINES = STEP_LINES.reduce((a, b) => a + b, 0); // 18
  /** Five whole lines were on the glass; the sixth was the one cut mid-word. */
  const WINDOW_PX = 5 * LEADING;

  it("in LINES it is 13 — the badge on the frame, to the line", () => {
    const lineRows = Array.from({ length: TOTAL_LINES }, (_, i) => ({
      top: i * LEADING,
      height: LEADING,
    }));
    expect(TOTAL_LINES).toBe(18);
    expect(rowsBelowFold(lineRows, 0, WINDOW_PX)).toBe(13);
  });

  it("in STEPS the SAME fold is 4 — so «5 items» never contradicted «13 lines»", () => {
    // Each step is as tall as the lines it wrapped to; the tops accumulate.
    let top = 0;
    const stepRows = STEP_LINES.map((n) => {
      const row = { top, height: n * LEADING };
      top += row.height;
      return row;
    });
    expect(stepRows).toHaveLength(5);
    // Step 1 fits inside the window; steps 2–5 do not. Four, not thirteen, and
    // not five — a counter that said «още 5 стъпки» here would be claiming the
    // student had read none of it.
    expect(rowsBelowFold(stepRows, 0, WINDOW_PX)).toBe(4);
  });

  it("…and the two agree the moment the units do: one line per step, 5 rows, 0 hidden", () => {
    // THE DIRECTION THAT MATTERS. If `rowsBelowFold` ever started counting
    // something other than what it was handed, the case above would still pass
    // by coincidence — a five-row list that FITS must report nothing at all.
    const oneLineEach = STEP_LINES.map((_, i) => ({ top: i * LEADING, height: LEADING }));
    expect(rowsBelowFold(oneLineEach, 0, 5 * LEADING)).toBe(0);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   2 · THE ADVISOR SAYS ONLY WHAT THE BANNER IS NOT SAYING
   ────────────────────────────────────────────────────────────────────────── */

describe("advisorEchoTrim · the task chip is not read aloud twice", () => {
  // The exact pair off the frame, character for character.
  const TITLE = "Вдигни крака от газта ПРЕДИ близките устой";

  it("keeps the cap and drops the echo", () => {
    expect(advisorEchoTrim(`${TITLE} — дръж под 35 км/ч`, TITLE)).toBe("дръж под 35 км/ч");
  });

  it("renders no card at all when the prompt IS the objective", () => {
    // `advisorPromptForObjective` returns `{ textBg: titleBg }` verbatim for a
    // capless reachZone — a second panel whose whole content is the sentence
    // above it. null → the shell renders nothing.
    expect(advisorEchoTrim(TITLE, TITLE)).toBeNull();
  });

  it("LEAVES REAL COACHING ALONE — the direction that matters", () => {
    // If this ever starts returning null or a fragment, the advisor mode is
    // silently gone and every frame still looks fine. These are the real
    // prompts `advisor.ts` builds for the non-reachZone objectives.
    const stop = "Спри напълно на стоп-линията при знака „Стоп“";
    expect(advisorEchoTrim(stop, TITLE)).toBe(stop);
    const signal = "Спри на стоп-линията на светофара и изчакай зелено";
    expect(advisorEchoTrim(signal, "Премини кръстовището на зелено")).toBe(signal);
  });

  it("does not trim on a shared opening word", () => {
    // `startsWith` on a PREFIX, not on a token: two objectives that both open
    // with «Спри» must not eat each other.
    expect(advisorEchoTrim("Спри преди прелеза", "Спри")).toBe("преди прелеза");
    expect(advisorEchoTrim("Спринтирай до края", "Спри")).toBe("Спринтирай до края");
  });

  it("strips the separator so the card never opens on a dangling dash", () => {
    expect(advisorEchoTrim(`${TITLE} · дръж вдясно`, TITLE)).toBe("дръж вдясно");
    expect(advisorEchoTrim(`${TITLE}: дръж вдясно`, TITLE)).toBe("дръж вдясно");
    expect(advisorEchoTrim(`${TITLE}, дръж вдясно`, TITLE)).toBe("дръж вдясно");
  });

  it("passes the prompt through when there is no objective to echo", () => {
    expect(advisorEchoTrim("Премести лоста на R", null)).toBe("Премести лоста на R");
    expect(advisorEchoTrim("Премести лоста на R", "")).toBe("Премести лоста на R");
  });

  it("survives the whitespace the compiler leaves in authored strings", () => {
    expect(advisorEchoTrim(`  ${TITLE}   —  дръж под 35 км/ч `, ` ${TITLE} `)).toBe(
      "дръж под 35 км/ч",
    );
  });

  it("is empty-safe", () => {
    expect(advisorEchoTrim("", TITLE)).toBeNull();
    expect(advisorEchoTrim("   ", TITLE)).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   3 · THE CSS HALF — held against the shell's own source
   ────────────────────────────────────────────────────────────────────────── */

describe("the briefing list yields instead of being guillotined", () => {
  it("carries no viewport-relative cap — that is the 92 px the panel wasted", () => {
    // THE PRE-FIX CODE WAS `<ol className="mt-1 flex max-h-[28vh] …">`: 28 % of
    // the WINDOW, inside a column sized from the STAGE. On the shipped desktop
    // layout the two differ by 92 px — four lines, i.e. steps 9 and 10 of
    // sc-ac-bridge-ice. Any vh/dvh cap here is the same mistake in a new number.
    expect(CARD).not.toMatch(/max-h-\[[\d.]+d?vh\]/);
  });

  it("can shrink at all — `min-h-0` on the list, the card and the column", () => {
    // A flex item defaults to `min-height: auto` and REFUSES to shrink, so
    // `overflow-hidden` on the column cut the card instead of the card
    // scrolling. All three levels need it or the chain breaks at the first one
    // that is missing — which is why this asserts three times and not once.
    const list = CARD.slice(CARD.indexOf("<ol"), CARD.indexOf("</ol>"));
    expect(list).toContain("min-h-0");
    expect(list).toContain("overflow-y-auto");

    const root = CARD.slice(CARD.indexOf('aria-label="Инструкции за упражнението"'));
    const rootClass = root.slice(root.indexOf("className="), root.indexOf(">"));
    expect(rootClass).toContain("min-h-0");
    expect(rootClass).toContain("flex-col");

    expect(COLUMN).toContain("min-h-0");
    // The column still clips rather than becoming a sidebar, and it is still
    // z-30 — thumb-band-clearance.test.ts N4 depends on that exact number.
    expect(COLUMN).toContain("overflow-hidden");
    expect(COLUMN).toContain("z-30");
  });

  it("keeps the objective banner un-shrinkable — the yield order IS the fix", () => {
    // The briefing is the ONLY child of the column carrying `min-h-0`, so it is
    // the only one that can give way. If a `shrink`/`min-h-0` ever lands on the
    // banner, the task itself starts yielding to a briefing the student has
    // already read.
    expect(COLUMN).toContain("<ObjectiveBanner");
    const banner = COLUMN.slice(COLUMN.indexOf("<ObjectiveBanner"));
    expect(banner.slice(0, banner.indexOf("/>"))).not.toMatch(/shrink|min-h-0/);
  });

  it("the «още» row is outside the scroll area, so it covers nothing", () => {
    // The phone's «↓ ОЩЕ 7 РЕДА» badge was filed twice in this same sweep for
    // sitting ON the sentence it was counting. This one is a sibling of the
    // <ol>, after it — not a child, and not absolutely positioned.
    const olEnd = CARD.indexOf("</ol>");
    const counter = CARD.indexOf("↓ още {below}");
    expect(olEnd).toBeGreaterThan(0);
    expect(counter).toBeGreaterThan(olEnd);
    expect(CARD.slice(olEnd, counter)).not.toContain("absolute");
  });
});
