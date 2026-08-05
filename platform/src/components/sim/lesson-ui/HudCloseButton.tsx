"use client";

/**
 * THE CLOSE CONTROL FOR THE RIGHT-EDGE NOTIFICATION COLUMN — row A6.
 *
 * FOUNDER, VERBATIM: „those pop ups … need to be able to be removed when
 * clicked with the mouse … currently they are much much annoying, important but
 * annoying, we need a complete rework."
 *
 * He is a MOUSE user describing a product that had been built keyboard-first.
 * „Press Space to acknowledge" is not an answer to that sentence, and neither
 * is a TTL: a card that goes away on its own eight seconds later was never
 * REMOVED by him, it expired despite him. So every dismissable surface in the
 * column gets a real, visible, pointer-driven control, and this is it — ONE
 * component so there is one shape, one accessible name pattern, and one place
 * the hit-area rule in `PlayAreaStyles` has to name.
 *
 * ── THE THING THAT MAKES THIS HARDER THAN A `<button>✕</button>` ─────────────
 *
 * The column is `min(15rem, 36vw)` wide on a phone (`notifyColumn.ts`), which
 * on the founder's 393 px portrait screen is **141 px**. Row C2 was closed on
 * the rule that no control may be smaller than 44 px under a thumb. A 44 px
 * PAINTED button is 31 % of the width of that column — it would be the widest
 * thing in it, on a screen whose whole review thread is „half of it is
 * furniture".
 *
 * So this uses row C2's own answer, which is already the precedent in this
 * file's sibling (`PlayAreaStyles`, the ::before hit-area group): the GLYPH
 * stays small and the HIT RECT grows. `data-hud-close` is the handle; the rule
 * that grows it lives with the other hit-area rules rather than here, because a
 * pseudo-element cannot be expressed in Tailwind's utility grammar and because
 * one rule for the whole column is what keeps it from drifting per component.
 *
 * The ring IS painted, deliberately. `HudToasts` can leave its ✕ as a bare
 * glyph because the entire card is the button and the card is 240 px of obvious
 * target; these cards are not buttons, so the control has to LOOK like one or
 * the mouse user is back where he started. It is the reference's „small
 * translucent chip", at 18 px.
 */

export function HudCloseButton({
  onClick,
  labelBg,
}: {
  onClick: () => void;
  /** Accessible name — say WHAT is being hidden, not just „close". */
  labelBg: string;
}) {
  return (
    <button
      type="button"
      data-hud-close=""
      onClick={onClick}
      aria-label={labelBg}
      title={labelBg}
      className="pointer-events-auto relative -my-0.5 ml-auto flex h-[18px] w-[18px] shrink-0 touch-manipulation items-center justify-center rounded-full border border-border text-[10px] font-black leading-none text-muted transition hover:border-foreground hover:text-foreground motion-reduce:transition-none"
    >
      <span aria-hidden>✕</span>
    </button>
  );
}
