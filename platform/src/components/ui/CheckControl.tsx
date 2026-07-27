import type { ComponentPropsWithoutRef } from "react";

/**
 * CHECK CONTROL — the product's one checkbox / radio.
 *
 * WHY THIS FILE EXISTS. Eight places in the app mount a tick box: the practice
 * runner, the exam runner, the registration consent gate, the checkout consent
 * gate, the outcome report, the admin question editor, the sim micro-quiz and
 * the sim session-end map toggle. All eight shipped a BARE native control with
 * at most `accent-accent` on it, and every one of them renders inside
 * `data-surface="cluster"` — landing/auth pin the scope on their own layout,
 * the rest inherit it from the (dashboard) shell.
 *
 * That combination is the bug. `accent-color` tints only the CHECKED fill; an
 * EMPTY box is painted entirely by the user agent from `color-scheme`, and the
 * cluster scope pins that to dark, so Chromium fills it flat rgb(59,59,59) —
 * 1.66 : 1 against a resting option row (pixel-sampled at 390 × 844, not
 * computed from tokens). The ring it draws around that fill is a single
 * antialiased pixel: on the RADIO it drops to 1.73 : 1 at the diagonals and
 * only 79 % of the perimeter clears 3 : 1. WCAG 1.4.11 asks ≥ 3 : 1 of the
 * boundary that IDENTIFIES an active control. The CSS described none of it.
 *
 * So the box stops being the UA's and becomes ours: `appearance-none` plus a
 * real 2px border on --control-edge — the same token .btn-ghost and .field rest
 * on, for the same reason (globals.css §TEXT INPUT). Recessed fill, like
 * .field: a tick box is a slot you put a mark INTO. Measured on the same
 * captures, that stroke is 3.51–3.65 : 1 at every one of the eight sites, and
 * the five radios that were at 78–79 % of their outline are now at 99–100 %.
 * checkControl.test.ts carries the full per-site table.
 *
 * IT STAYS A REAL <input>. Keyboard focus, Space to toggle, arrow-key traversal
 * inside a radio group and the announced role/checked state are all still the
 * browser's. Nothing here sets `outline`: the keyboard ring is the global
 * `:focus-visible` rule in globals.css (2px --accent at 2px offset), measured on
 * the same captures at rgb(68,161,244) — 6.77 : 1 against the row.
 *
 * FORCED COLORS IS THE OTHER HALF, and it lives in globals.css, not here.
 * `appearance: none` bought every number above by taking the box off the user
 * agent — and the user agent's painting is the ONLY painting Windows High
 * Contrast can rewrite. Captured under `forced-colors: active`, the first
 * version of this file left a CHECKED RADIO PIXEL-IDENTICAL to an unchecked
 * one at all five radio sites: its indicator was an inset box-shadow, which
 * that mode does not paint, and checked:bg-accent / checked:border-accent were
 * both rewritten to the same Canvas/CanvasText pair as an empty box. The
 * checkbox kept its tick — background-image is left alone there — with the ink
 * frozen near-black on a Canvas that is black. Two of the ten sites are the
 * GDPR consent gate and the withdrawal waiver, and the students are minors.
 *
 * The repaint is a `@media (forced-colors: active)` block in globals.css hung
 * off the `check-control` class below, in system colours only (Canvas /
 * CanvasText / Highlight / HighlightText / GrayText), so the OS theme still
 * chooses the pixels. It has to be CSS rather than a Tailwind variant here for
 * two reasons: `forced-color-adjust` and the pseudo-element that draws the mark
 * have no utilities worth trusting, and the override must sit OUTSIDE Tailwind's
 * layers to outrank `checked:bg-accent`. checkControl.test.ts guards all of it.
 *
 * WHAT CALLERS MAY CHANGE. `size` and `className`, and only those. `size` is a
 * SLOT rather than an append because Tailwind orders utilities by property, not
 * by source position — appending `size-5` after a baked-in `h-4 w-4` is a
 * coin-flip, not an override. `className` is for POSITION (`mt-1`, `ml-auto`);
 * colour and shape are not a call-site decision, which is the whole point of
 * there being one of these instead of eight.
 */

export type CheckControlType = "checkbox" | "radio";

/**
 * The class strings below are deliberately NOT exported. `CheckControl` is the
 * whole public surface: hand a caller the pieces and the next screen composes
 * its own almost-right variant, which is the state this file was created to
 * end. checkControl.test.ts reads them out of this source text instead.
 */

/**
 * The box itself. `border-2` and `border-control-edge` are the load-bearing
 * pair — measured 3.51–3.65 : 1 on every ground a call site paints behind it
 * (checkControl.test.ts recomputes all of them from globals.css).
 *
 * `check-control` is not a Tailwind class and is not decorative: it is the
 * hook for the `@media (forced-colors: active)` block in globals.css, which
 * repaints this control in system colours. See FORCED COLORS in the header.
 *
 * `disabled:cursor-not-allowed` is the whole of the NORMAL-mode disabled
 * treatment, and the omission is the decision. `.field:disabled` dims to
 * `opacity: .55`, but the only disabled tick boxes in this product are the
 * answered options in the practice and micro-quiz runners — the box still
 * showing the student which answer they gave. Dimming those drops the border
 * measured above under 3 : 1 on the very rows a student is reading their
 * result off. The rows themselves already carry frozen-ness (the runners put
 * `opacity-55` / `opacity-60` on every option that was not picked), and
 * forced colors, where that row tint is flattened to Canvas, gets a real
 * GrayText treatment in globals.css instead.
 */
const CONTROL_BOX =
  "check-control shrink-0 appearance-none border-2 border-control-edge bg-background " +
  "transition-colors duration-200 ease-out checked:border-accent checked:bg-accent " +
  "disabled:cursor-not-allowed motion-reduce:transition-none";

/**
 * The tick, as a data URI: a 12 × 12 stroke in --accent-foreground, the ink this
 * palette pairs with an accent fill. It carries no width/height, only a viewBox,
 * so it scales to whatever padding box `size` produces. Inlined rather than
 * mounted as a sibling <svg> because a sibling needs a wrapper and a
 * `peer-checked` hop, and this control has to stay ONE element.
 *
 * TWO THINGS HERE ARE LOAD-BEARING AND NEITHER IS OBVIOUS. Tailwind scans raw
 * source TEXT for class candidates, so (a) every space and quote inside the URL
 * is percent-encoded, because the scanner ends a candidate at the first of
 * either, and (b) the utility is one unbroken literal — split it across two
 * concatenated strings for line length and the scanner sees an unclosed
 * bracket, emits no rule, and the tick vanishes with typecheck and lint still
 * green. Both were verified against a from-scratch Tailwind compile, and
 * checkControl.test.ts pins them.
 */
const CONTROL_TICK =
  // Do not wrap this line. See above — a split candidate compiles to nothing.
  "checked:bg-[url(data:image/svg+xml,%3Csvg%20xmlns=%22http:%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox=%220%200%2012%2012%22%3E%3Cpath%20d=%22M2.5%206.4%204.8%208.7%209.5%203.5%22%20fill=%22none%22%20stroke=%22%2304070e%22%20stroke-width=%222%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22%2F%3E%3C%2Fsvg%3E)]" +
  " checked:bg-center checked:bg-no-repeat";

/**
 * Shape carries ARITY, so it must survive any restyle: a circle means "one of
 * these", a square means "as many as apply". The radio's inset ring keeps a
 * checked circle a dot rather than a filled disc; the checkbox keeps the tick
 * the user agent used to draw, because losing it would trade one quiet state
 * (empty) for another (full) on exactly the question type that needs the
 * difference most („Избери всички верни отговори").
 */
const CONTROL_SHAPE: Record<CheckControlType, string> = {
  radio: "rounded-full checked:shadow-[inset_0_0_0_3px_var(--background)]",
  checkbox: `rounded-[5px] ${CONTROL_TICK}`,
};

/**
 * 16px. Big enough for the 2px stroke to read at arm's length, small enough to
 * sit on the first line of a label — and the size every measurement in
 * checkControl.test.ts was taken at. Callers that need a bigger hit area should
 * grow the LABEL, not this.
 */
const CONTROL_SIZE = "h-4 w-4";

/** The composed class string. Internal — see the note above the constants. */
function checkControlClass(
  type: CheckControlType,
  size: string = CONTROL_SIZE,
  className = "",
): string {
  return [size, CONTROL_BOX, CONTROL_SHAPE[type], className]
    .filter(Boolean)
    .join(" ");
}

interface CheckControlProps
  extends Omit<ComponentPropsWithoutRef<"input">, "type" | "size"> {
  /** Arity, and therefore shape. Pass the real input type — this IS an <input>. */
  type: CheckControlType;
  /** Box size utilities. One slot, not an append — see the header. */
  size?: string;
  /** Position only (`mt-1`, `ml-auto`). Colour and shape are not yours. */
  className?: string;
}

/**
 * No "use client" on purpose: this has no state and no hooks, so it compiles
 * into whichever environment the caller already is. Every call site today is a
 * client island, but a tick box inside a plain server-rendered form is a
 * perfectly ordinary thing to want, and this must not be the reason that form
 * has to become one.
 */
export function CheckControl({
  type,
  size = CONTROL_SIZE,
  className = "",
  ...rest
}: CheckControlProps) {
  return (
    // `type` and `className` come last so a spread cannot quietly unstyle the
    // control or turn it into a text field.
    <input {...rest} type={type} className={checkControlClass(type, size, className)} />
  );
}
