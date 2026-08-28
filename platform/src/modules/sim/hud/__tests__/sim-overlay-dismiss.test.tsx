/**
 * ROW A6, THE PHONE HALF — „those pop ups need to be able to be removed when
 * clicked with the mouse … currently they are much much annoying".
 *
 * The desktop half shipped in `HudToasts` and has a test. The phone half did
 * not, and the reason it could rot unnoticed is one expression:
 *
 *     const interactive = hasDetail || blocking;   // SimOverlay, before
 *
 * An ordinary line — a task, a piece of guidance, a „Браво" — matched neither
 * arm, so it rendered with `pointer-events: none`, no control of any kind, and
 * left only when its TTL expired. Nothing asserted otherwise, and the frame
 * that „proved" the fix was taken on the roomy column via `?state=column`,
 * which a coarse-pointer 393 px viewport never reaches.
 *
 * This file renders the real component (`react-dom/server`, the FaultCard
 * precedent — no DOM needed) and asserts the SHAPE of all three cases:
 *
 *   1. a plain line IS the dismiss button, the way a toast card is on desktop;
 *   2. a line with a WHY keeps „Защо" and gets the ✕ as a third 44 px chip;
 *   3. a BLOCKING line has no ✕ at all — it is answered, not dismissed, and
 *      that is the contract that keeps a teach moment and the end-of-session
 *      verdict from being swiped away unread (THEO-4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ THE SENTENCE THAT USED TO END THIS HEADER WAS THE HOLE — 2026-08-28.
 *
 * It read: „The click itself is proved on the device, in the real lesson shell
 * — this asserts that the control exists to be clicked." That is a test which
 * can only ever say a ✕ was PAINTED, and on 2026-08-27 a lane rebuilt the
 * card's activation into „first press scrolls the text window to its end,
 * second press dismisses" without noticing that the ✕ is a bare `<span>` with
 * no handler of its own. Every press of it was a press of the card, so on any
 * card with text under the fold THE ✕ SCROLLED INSTEAD OF CLOSING — on the very
 * founder row (A6) the lane names as its counterparty. **All 718 hud tests
 * passed with that in place**, because not one of them asked what a press DOES.
 *
 * A control that exists and lies is worse than a control that is missing: the
 * missing one gets reported. So the last group in this file drives the
 * decision itself — `cardTapAction`, the function the live activation calls —
 * and it fails on the shipped-lane behaviour by construction, because that
 * behaviour had no ✕ leg at all.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  cardTapAction,
  composeCardDismissHandlers,
  type CardTapAction,
  DISMISS_GLYPH_ATTR,
  DISMISS_GLYPH_TAP_PX,
  dismissGlyphTapRect,
  pressOnDismissGlyph,
  readRestScrollTop,
  SimOverlay,
} from "../SimOverlay";
import { OVERLAY_PEEK_HEIGHT_PX, type SimOverlayItem } from "../overlayQueue";
import {
  createTapActivationState,
  createTapHandlers,
  tapOwnsPointerType,
  tapPointWithin,
  type TapPoint,
  type TapRect,
} from "../tapActivation";

function markup(item: SimOverlayItem, queued = 0): string {
  return renderToStaticMarkup(<SimOverlay item={item} queued={queued} />);
}

/** The peek card element, whatever tag it is rendered as. */
function cardTag(html: string): string | null {
  const m = /<(\w+)([^>]*)data-sim-overlay-card="(button|panel)"/.exec(html);
  return m === null ? null : `${m[1]}:${m[3]}`;
}

const TASK: SimOverlayItem = {
  id: "task:2/3",
  kind: "task",
  tone: "neutral",
  chipBg: "Задача 2/3",
  lineBg: "Спри плътно до бордюра след кръстовището.",
};

const VIOLATION: SimOverlayItem = {
  id: "toast:7",
  kind: "violation",
  tone: "danger",
  chipBg: "−5 т.",
  lineBg: "Превишена скорост",
  detailBg: "Караш с 68 km/h там, където ограничението е 50 km/h.",
  lawRef: "ЗДвП чл. 21",
};

const TEACH: SimOverlayItem = {
  id: "teach:SPEEDING:22",
  kind: "teach",
  tone: "teach",
  chipBg: "Учебен момент",
  lineBg: "Превишена скорост",
  detailBg: "Спирачният път расте с квадрата на скоростта.",
  lawRef: "ЗДвП чл. 21, ал. 1",
  blocking: true,
  onAck: () => undefined,
};

describe("A6 — every line the drive is not waiting on can be removed", () => {
  it("makes a PLAIN line the dismiss button itself, like the desktop toast card", () => {
    const html = markup(TASK);
    expect(cardTag(html)).toBe("button:button");
    // The label names the action AND the line, so a screen reader hears what
    // it is about to remove — the same shape as „Скрий известието" on desktop.
    expect(html).toContain('aria-label="Скрий известието');
    expect(html).toContain("Спри плътно до бордюра");
    // The one thing that made this row dead: the card was pointer-events-none.
    expect(html).toContain("pointer-events-auto");
    expect(html).not.toContain("pointer-events-none absolute z-30 flex flex-col items-end\" style=\"min-height");
  });

  it("gives a line WITH a why both controls — Защо and a ✕ — and keeps them 44 px", () => {
    const html = markup(VIOLATION);
    expect(cardTag(html)).toBe("div:panel");
    expect(html).toContain("Защо");
    expect(html).toContain('aria-label="Скрий известието"');
    // h-11/w-11 is 2.75rem = 44 px in both axes. A 24 px chip with a big label
    // is the touch-target violation this project already counts 19 of.
    expect(html).toMatch(/aria-label="Скрий известието"[^>]*class="[^"]*h-11 w-11[^"]*"/);
  });

  it("NEVER offers a ✕ on a blocking line — it is answered, not swiped away", () => {
    const html = markup(TEACH);
    expect(cardTag(html)).toBe("div:panel");
    expect(html).toContain("Разбрах");
    expect(html).not.toContain("Скрий известието");
    // THEO-4: the authored WHY is still one tap behind „Защо".
    expect(html).toContain("Защо");
  });

  it("keeps the acknowledgement on a NON-blocking line that still has one", () => {
    // A2 on a phone: once the student turns the automatic debrief off, the
    // end-of-session line stops blocking — but „Резултат" has to survive that,
    // or the verdict loses its route to the law-cited debrief.
    const html = markup({
      id: "end",
      kind: "end",
      tone: "warn",
      chipBg: "−15 т.",
      lineBg: "Неиздържан — виж разбора",
      ackLabelBg: "Резултат",
      onAck: () => undefined,
    });
    expect(html).toContain("Резултат");
    expect(html).toContain('aria-label="Скрий известието"');
  });

  it("floors every card at the 44 px thumb rule, because every card is now touchable", () => {
    for (const item of [TASK, VIOLATION, TEACH]) {
      expect(markup(item)).toContain(`min-height:${OVERLAY_PEEK_HEIGHT_PX}px`);
    }
  });

  it("still counts the queue behind the line it is showing", () => {
    expect(markup(VIOLATION, 2)).toContain("+2");
  });
});

// ---------------------------------------------------------------------------
// WHAT A PRESS DOES, WHICH IS THE HALF THIS FILE WAS MISSING.
// ---------------------------------------------------------------------------

/**
 * THE FOUNDER FRAME, AS NUMBERS. `w10-1/sc-ov-solid-return__mobile-right/
 * 04-t002s.png` — iPhone 16 landscape, the ribbon-legend peek, five lines of
 * «Синя линия — колата-сянка · зелена, стрелката и светлинният стълб …» in a
 * window that shows two, with «↓ ОЩЕ 1 РЕД» printed under them.
 *
 *   5 rows × 15.125 px  = 75.625   the grid `useFoldLines` measures on
 *   + TEXT_FADE_PX      = 10       the window's own bottom pad, which joins
 *                                  the scrollable overflow and is NOT a line
 *   scrollHeight        = 85.625
 *   clientHeight        = 31       the card is 44 px and row 1 takes 18
 *
 * This is the exact state in which the shipped lane made the ✕ scroll.
 */
const FOLDED_WINDOW = {
  scrollTop: 0,
  scrollHeight: 85.625,
  clientHeight: 31,
  padBottomPx: 10,
};

/** The ✕ where the card actually paints it: 12 px (`h-3 w-3`), top right. */
const GLYPH_RECT: TapRect = { left: 360, top: 62, right: 372, bottom: 74 };

/** A card that paints a ✕ — answering only the selector the component uses. */
function cardWithGlyph(glyph: TapRect | null) {
  return {
    querySelector: (selectors: string) =>
      selectors === `[${DISMISS_GLYPH_ATTR}]` && glyph !== null
        ? { getBoundingClientRect: () => glyph }
        : null,
  };
}

const SRC = path.resolve(__dirname, "../SimOverlay.tsx");

describe("A6, wave 7 — the ✕ closes on the FIRST press", () => {
  it("PRECONDITION: this window really does have text under the fold", () => {
    // Without this the group below would be green on a card that has nothing
    // to scroll, which is the shape the regression could not occur on.
    expect(readRestScrollTop(FOLDED_WINDOW)).toBeCloseTo(54.625, 5);
  });

  it("DISMISSES on the first press of the ✕ — the case the lane regressed", () => {
    // ↓ THIS IS THE ASSERTION THE SHIPPED LANE FAILS. Its activation read the
    // window and nothing else, so on this exact window every press — the ✕
    // included — returned „scroll". A close control whose first press does not
    // close is a new defect on the founder row the lane cites.
    expect(cardTapAction({ onDismissGlyph: true, window: FOLDED_WINDOW })).toEqual({
      kind: "dismiss",
    });
  });

  it("closes on the ✕ even when the window was never measured at all", () => {
    // Server render, an engine with no ResizeObserver, a card unmounted from
    // under the ref: the ✕ still closes. It is not conditional on a
    // measurement, because a measurement that failed must not disarm a control.
    expect(cardTapAction({ onDismissGlyph: true, window: null })).toEqual({ kind: "dismiss" });
  });

  it("keeps the card BODY at read-then-dismiss — exactly two presses, always", () => {
    // The lane's own behaviour, and it is right: a press on the text finishes
    // the sentence rather than deleting words the student has not seen.
    const first = cardTapAction({ onDismissGlyph: false, window: FOLDED_WINDOW });
    expect(first).toEqual({ kind: "scroll", top: 54.625 });
    // …and the second press, from where the first one left the window, goes.
    expect(
      cardTapAction({
        onDismissGlyph: false,
        window: { ...FOLDED_WINDOW, scrollTop: first.kind === "scroll" ? first.top : 0 },
      }),
    ).toEqual({ kind: "dismiss" });
  });

  it("dismisses on a body press when nothing is cut, without a wasted press", () => {
    expect(
      cardTapAction({
        onDismissGlyph: false,
        window: { scrollTop: 0, scrollHeight: 41, clientHeight: 31, padBottomPx: 10 },
      }),
    ).toEqual({ kind: "dismiss" });
  });

  it("gives the 12 px ✕ a 44 px hit box, so a near miss still closes", () => {
    const box = dismissGlyphTapRect(GLYPH_RECT);
    expect(DISMISS_GLYPH_TAP_PX).toBe(OVERLAY_PEEK_HEIGHT_PX); // the thumb rule
    expect(box).toEqual({ left: 344, top: 46, right: 388, bottom: 90 });
    // A thumb 14 px low and 12 px left of the glyph's centre — a miss against
    // twelve pixels, a press against the rule every other control here is held
    // to — still closes the card.
    expect(tapPointWithin({ x: 354, y: 82 }, box as TapRect)).toBe(true);
    // …and the middle of the card's text, two rows down, still does not.
    expect(tapPointWithin({ x: 250, y: 100 }, box as TapRect)).toBe(false);
  });

  it("refuses a glyph box with no area — an unlaid-out ✕ is not a target", () => {
    expect(dismissGlyphTapRect({ left: 360, top: 62, right: 360, bottom: 62 })).toBeNull();
    expect(dismissGlyphTapRect(null)).toBeNull();
  });

  it("finds the ✕ by the address the card paints, and only there", () => {
    expect(pressOnDismissGlyph(cardWithGlyph(GLYPH_RECT), { x: 366, y: 68 })).toBe(true);
    // A press on the text window of the same card.
    expect(pressOnDismissGlyph(cardWithGlyph(GLYPH_RECT), { x: 250, y: 100 })).toBe(false);
    // The panel shape paints no ✕ inside the card, so nothing is ever found.
    expect(pressOnDismissGlyph(cardWithGlyph(null), { x: 366, y: 68 })).toBe(false);
    // Keyboard `Enter`, a screen reader's activation, `element.click()`: no
    // coordinates, so no ✕ press — those keep the two-press read contract,
    // which costs them nothing, the whole body being in the a11y tree anyway.
    expect(pressOnDismissGlyph(cardWithGlyph(GLYPH_RECT), null)).toBe(false);
  });

  it("paints that address on the plain-line card — the lookup's other half", () => {
    // If this attribute ever stops rendering, `pressOnDismissGlyph` silently
    // finds nothing and the ✕ goes back to scrolling. The constant is used on
    // BOTH sides here on purpose, so a rename cannot split them.
    const html = markup(TASK);
    expect(html).toContain(`${DISMISS_GLYPH_ATTR}=""`);
    // It is a SPAN, not a nested `<button>`: a button inside a button is
    // invalid HTML, React warns about it and a screen reader gets a second
    // focus stop for an action the card's own label already offers.
    expect(new RegExp(`<(\\w+)[^>]*${DISMISS_GLYPH_ATTR}`).exec(html)?.[1]).toBe("span");
    expect(html.match(/<button\b/g)?.length).toBe(1);
    // …and it sits INSIDE the card button, which is what makes it reachable
    // from that button's `currentTarget`.
    expect(html.indexOf(`${DISMISS_GLYPH_ATTR}=""`)).toBeGreaterThan(
      html.indexOf('data-sim-overlay-card="button"'),
    );
  });

  it("paints it on no other shape — the panel's ✕ is a labelled chip already", () => {
    expect(markup(VIOLATION)).not.toContain(DISMISS_GLYPH_ATTR);
    expect(markup(TEACH)).not.toContain(DISMISS_GLYPH_ATTR);
  });

  it("has the card's own pointer path actually call both of these", () => {
    // The arithmetic above is worthless if the component re-decides inline —
    // that is this corpus's dead-predicate class, and it is how a repair moves
    // a ledger without moving the product. Comments stripped first, because
    // this file's prose quotes its own code (`tap-activation.test.ts`'s rule).
    //
    // NARROWED 2026-08-28. This used to pin the FLAG WRITE
    // (`cardPressOnGlyph.current = pressOnDismissGlyph(`) as well, and that
    // pin broke the moment the composition was extracted into
    // `composeCardDismissHandlers` — while the behaviour it was standing in
    // for was, for the first time, actually asserted. A source pin that fails
    // on a refactor and passes on a regression is worse than no pin: the
    // ✕-scrolls bug lived through 729 green tests including this one.
    // What is left here is only what no behavioural test can see: that the
    // component CALLS the shared pieces instead of re-deciding inline. The
    // press path itself is now driven end-to-end in the block below.
    const source = readFileSync(SRC, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    expect(source).toContain("const action = cardTapAction({");
    expect(source).toContain('if (action.kind === "scroll" && el !== null) {');
    // The card still spreads ONE activation object, and it is the composed one.
    expect(source).toContain("{...tapDismissCard}");
    expect(source).toContain("composeCardDismissHandlers(cardPress, cardPressOnGlyph)");
  });
});

// ---------------------------------------------------------------------------
// THE HALF THAT WAS STILL MISSING — 2026-08-28, after the FIX regressed too.
// ---------------------------------------------------------------------------
//
// The block above asserts `cardTapAction` returns "dismiss" when it is HANDED
// `onDismissGlyph: true`. Every case in it calls that function directly. None
// drives an event, and that is precisely the hole `tapActivation.ts:295-303`
// warns about in its own words: "the four predicates can each be provably
// correct while the wiring between them and a real event is wrong."
//
// It was wrong. The first repair of the ✕ passed all eleven of those cases and
// 729 other HUD tests, and the ✕ STILL did not close on a mouse:
//
//   for a mouse the browser fires  pointerdown -> pointerup -> click
//   `tapOwnsPointerType` REFUSES mouse, so `tapPointerUp` fires nothing and the
//   activation arrives one event later, on `click` — but the component's
//   `onPointerUp` wrapper cleared `cardPressOnGlyph` unconditionally in
//   between. The action then read `onDismissGlyph: false` and scrolled.
//
// And the founder's row is specifically about the mouse: "those pop ups need to
// be able to be removed when clicked WITH THE MOUSE".
//
// So this block transcribes the component's handler composition verbatim over
// the REAL state machine (`createTapHandlers`, whose own header says it exists
// so the full down/up/click sequence can be exercised in the gate rather than
// only on a phone) and drives whole sequences. It is written to FAIL against
// the code as first shipped.
describe("A6 — the ✕ closes on the first press ON EVERY POINTER TYPE", () => {
  /**
   * SimOverlay's OWN composition, imported — not transcribed.
   *
   * The first version of this helper re-implemented the three handlers here,
   * and it passed with the fix REMOVED from the component: it was testing its
   * own copy. `composeCardDismissHandlers` is exported for exactly that reason,
   * and this drives it over the real `createTapHandlers` state machine.
   */
  function drivePress(
    pointerType: string,
    pressPoint: TapPoint,
    window: typeof FOLDED_WINDOW | null,
  ) {
    const acted: CardTapAction[] = [];
    const onGlyph = { current: false };
    const cardRect: TapRect = { left: 0, top: 56, right: 393, bottom: 100 };
    const state = createTapActivationState();
    let clock = 1000;
    const inner = createTapHandlers(
      state,
      () => {
        const onDismissGlyph = onGlyph.current;
        onGlyph.current = false;
        acted.push(cardTapAction({ onDismissGlyph, window }));
      },
      () => clock,
    );
    const handlers = composeCardDismissHandlers(inner, onGlyph);
    const evt = {
      pointerId: 1,
      pointerType,
      clientX: pressPoint.x,
      clientY: pressPoint.y,
      currentTarget: {
        ...cardWithGlyph(GLYPH_RECT),
        getBoundingClientRect: () => cardRect,
      },
    };
    handlers.onPointerDown(evt);
    handlers.onPointerUp(evt);
    clock += 1;
    // The compatibility click every device sends afterwards. `detail: 1` is a
    // real click; for a mouse it is the ONLY activation.
    handlers.onClick({ detail: 1 });
    return acted;
  }

  /** A point inside the painted ✕, and one in the middle of the card body. */
  const ON_GLYPH: TapPoint = { x: 366, y: 68 };
  const ON_BODY: TapPoint = { x: 40, y: 78 };

  for (const pointerType of ["touch", "pen", "", "mouse"]) {
    it(`dismisses on the FIRST press of the ✕ with pointerType "${pointerType || "(empty)"}"`, () => {
      // ↓ "mouse" is the cell that failed. The other three passed while it did,
      //   which is why a grid and not a single case.
      expect(drivePress(pointerType, ON_GLYPH, FOLDED_WINDOW)).toEqual([{ kind: "dismiss" }]);
    });

    it(`still reads-then-dismisses on a BODY press with pointerType "${pointerType || "(empty)"}"`, () => {
      // The other half of the grid, and it matters as much: a fix that makes
      // the mouse dismiss by breaking the body's read-then-dismiss has traded
      // one defect for another. A body press on a folded window must SCROLL.
      expect(drivePress(pointerType, ON_BODY, FOLDED_WINDOW)).toEqual([
        { kind: "scroll", top: 54.625 },
      ]);
    });
  }

  it("fires exactly once per press — the compatibility click is still suppressed", () => {
    // The mark `tapPointerUp` leaves is what stops touch acting twice. If a
    // future change to the glyph flag also broke that, this grid would go green
    // on `[{dismiss},{dismiss}]` without it.
    expect(drivePress("touch", ON_GLYPH, FOLDED_WINDOW)).toHaveLength(1);
    expect(drivePress("mouse", ON_GLYPH, FOLDED_WINDOW)).toHaveLength(1);
  });
});
