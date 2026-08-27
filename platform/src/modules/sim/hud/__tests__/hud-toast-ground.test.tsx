/**
 * THE ROOMY TOAST CARD'S GROUND, AND THE TENTH IT WAS TAKING OFF ITS OWN INK.
 * Wave 6, 2026-08-27. The long block above `ToastGround` in `HudToasts.tsx`
 * has the derivation; this file is what stops it rotting back.
 *
 * TWO ROWS, ONE ARITHMETIC:
 *
 *   sc-roundabout-entry:fe081cf1  „its own «ОПАСНА ГРЕШКА −10 ИЗПИТНИ Т.»
 *                                  header is drawn dark-red on dark and is
 *                                  barely legible" (pc-right/04-t090s)
 *   sc-ov-solid-return:70845fcc   „The card carries no panel of its own, so
 *                                  world geometry — a world sign, a lamp
 *                                  column, kerbside vehicles — reads straight
 *                                  through its body text"
 *
 * The second was filed on the phone, where `SimOverlay`'s peek was given a
 * measured shade on 2026-08-19. THIS card is the same card on the roomy leg —
 * same `GHOST_SURFACES` membership, so `PlayAreaStyles`' UNPANEL sweep strips
 * its fill to `transparent !important` — and it never got one. It also carried
 * `opacity-90` on the arm the shell actually mounts, i.e. a tenth off the class
 * word, the points, the fault name and the authored explanation, for the whole
 * of every drive.
 *
 * WHY THE TWO ARE ONE REPAIR: with the ground added and the dimming left in,
 * `--danger` reads 3.95 : 1 — still under AA. Case 4 is the one that says so,
 * and it is the reason this file exists rather than two smaller ones.
 *
 * IT RENDERS THE REAL COMPONENT rather than reading its class string, because
 * a class string is exactly what UNPANEL can delete without a type error: the
 * shade only paints because it carries `data-hud-ink`, and only a render shows
 * whether the attribute is on the element the style is on.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HudEvent } from "../../contracts";
import { HudToasts, type HudToast } from "../HudToasts";
import { PEEK_SCRIM_ALPHA, PEEK_SCRIM_RGB } from "../SimOverlay";

type Rgb = readonly [number, number, number];

function luminance([r, g, b]: Rgb): number {
  const chan = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `source` over `ground` at `alpha`, the way a browser composites it. */
function over(source: Rgb, ground: Rgb, alpha: number): Rgb {
  return [0, 1, 2].map((i) => alpha * source[i]! + (1 - alpha) * ground[i]!) as unknown as Rgb;
}

/**
 * The brightest world pixel under a HUD card across the four frames
 * `SimOverlay`'s 2026-08-19 block measured — render-white facade. Restated here
 * rather than imported because `sim-overlay-scrim.test.ts` holds it as a local
 * too; if it ever moves to a shared module both should take it from there.
 */
const WORST_WORLD: Rgb = [204, 205, 206];

/** `--danger`, the ink `SEVERITY_META` hands every ОПАСНА ГРЕШКА toast. */
const DANGER: Rgb = [255, 106, 88];
/** `--muted`, which the UNPANEL register re-pins inside a ghost — the WHY row. */
const MUTED: Rgb = [195, 207, 226];

const AA = 4.5;

/** The toast column's `gap-2` — the bound on how far one card's shade may bleed. */
const COLUMN_GAP_PX = 8;

/** The card's ground as it composites over the worst world the sweep found. */
const GROUND = over(PEEK_SCRIM_RGB as unknown as Rgb, WORST_WORLD, PEEK_SCRIM_ALPHA);

const OPASNA: HudEvent = {
  kind: "violation",
  titleBg: "Удар в неподвижно препятствие",
  explanationBg:
    "Удари неподвижен предмет — стълб, дърво, ограда, сграда или бордюр. Неподвижното препятствие не се появява внезапно и не може да сгреши.",
  points: 10,
  severity: "opasna",
  lawRef: "ЗДвП чл. 20, ал. 2",
};

/** The column exactly as `LessonPlayShell` mounts it: dismissible. */
function column(): string {
  const toasts: HudToast[] = [{ id: 1, event: OPASNA, raisedAtMs: Date.now() - 4000 }];
  return renderToStaticMarkup(
    <HudToasts toasts={toasts} quiet={false} onDismiss={() => {}} />,
  );
}

describe("wave 6 · the roomy toast card stands on the same ground the peek does", () => {
  it("bare world is the defect, and it is not a matter of taste", () => {
    // The row this closes, in one number: the authored explanation and the
    // facade behind it are the same colour to a hundredth.
    expect(contrast(MUTED, WORST_WORLD)).toBeLessThan(1.05);
    expect(contrast(DANGER, WORST_WORLD)).toBeLessThan(2);
  });

  it("the card renders a ground, and it carries the attribute that lets it paint", () => {
    const html = column();
    const at = html.indexOf('data-hud="toast-scrim"');
    expect(at, "the toast ground is not rendered at all").toBeGreaterThan(-1);
    // `data-hud-ink` is the whole fix: UNPANEL's sweep is
    // `:is(div, …):not([data-hud-ink])` with `background-image: none
    // !important`, so without it this element is a diff that changes no pixel.
    // Read off THIS element's own span, not off the document — a slice that
    // began one tag later is how a sibling's copy of the attribute gets
    // credited to the wrong element (see `sim-overlay-chip-ground.test.ts`).
    const el = html.slice(at, at + 400);
    expect(el).toContain('data-hud-ink=""');
    // It is a shade: announced to nobody, and it may not eat the click that
    // dismisses the card — on this surface the whole card IS the button.
    expect(el).toMatch(/aria-hidden/);
    expect(el).toMatch(/pointer-events:\s*none/);
    // …and it is BEHIND the words, which is what `z-index:-1` plus the card's
    // own `isolate` buys. Without `isolate` a negative z-index climbs to the
    // nearest ancestor stacking context and sinks past the WebGL backdrop.
    expect(el).toMatch(/z-index:\s*-1/);
    expect(html).toMatch(/class="[^"]*\bisolate\b/);
  });

  it("no element on this card knocks its own ink back — the peek's rule, here", () => {
    // `sim-overlay-scrim.test.ts` wrote this rule for the phone's card after
    // `opacity-90` on one 10 px label put `--danger` at 3.97 : 1. This card was
    // wearing the same class on its WHOLE subtree, over no shade at all.
    const html = column();
    // The card's own class list — the `<button>` the shell mounts.
    const card = /class="([^"]*\bhud-toast-in\b[^"]*)"/.exec(html)?.[1];
    expect(card, "the toast card class list moved — re-anchor this test").toBeDefined();
    expect(card).not.toMatch(/(^|\s)opacity-/);
    // And nowhere else on the card either: a `group-hover:opacity-100` with the
    // dimming moved onto an inner row would be the same tenth, relocated.
    expect(html).not.toMatch(/\bopacity-\d/);
  });

  it("the ground plus the dimming would still have failed — so the dimming had to go", () => {
    // THE CASE THAT MAKES THE TWO EDITS ONE REPAIR. At the documented ground:
    //   full strength  4.57 : 1   over AA
    //   at 0.9         3.95 : 1   under AA
    // so „add the shade, keep the class" is a fix that changes the pixels and
    // not the verdict.
    expect(contrast(DANGER, GROUND)).toBeGreaterThan(AA);
    expect(contrast(over(DANGER, GROUND, 0.9), GROUND)).toBeLessThan(AA);
    // The WHY row is the one the card exists for (THEO-4 requirement zero) and
    // it clears comfortably once it has a ground — 1.01 : 1 to 8.18 : 1.
    expect(contrast(MUTED, GROUND)).toBeGreaterThan(7);
  });

  it("the hover cue moved onto the ✕ and does not touch the verdict", () => {
    const html = column();
    // `group` ON THE CARD is what makes the child variant resolve; without it
    // the class below is inert and the affordance is silently gone.
    //
    // ANCHORED ON THE CARD'S OWN CLASS LIST, and that is not fussiness: the
    // first version of this case was `/class="[^"]*\bgroup\b/` over the whole
    // document, which the ✕'s own `group-hover:text-foreground` satisfies —
    // `\b` breaks at the hyphen. Deleting `group` from the card left this case
    // green while the hover cue was dead. Same trap `sim-overlay-chip-ground`
    // records about a slice that began one line too low.
    const card = /class="([^"]*\bhud-toast-in\b[^"]*)"/.exec(html)?.[1];
    expect(card, "the toast card class list moved — re-anchor this test").toBeDefined();
    expect(card!.split(/\s+/)).toContain("group");
    expect(html).toMatch(/group-hover:text-foreground/);
  });

  it("one card's shade never reaches into the card stacked under it", () => {
    // THE ONE NUMBER THIS COLUMN DOES NOT INHERIT FROM THE PEEK. The peek is a
    // column of one; this one stacks `TOAST_MAX_VISIBLE` cards `gap-2` apart,
    // so a 16 px bottom bleed would drop the older card's ramp 8 px inside the
    // newer one's flat core — two shades on one pixel, ≈0.88, past the 0.80 the
    // „shade, not a curtain" derivation bounds.
    const html = column();
    const el = html.slice(html.indexOf('data-hud="toast-scrim"'));
    const style = el.slice(0, el.indexOf(">"));
    const bottom = /bottom:\s*(-?\d+(?:\.\d+)?)px/.exec(style)?.[1];
    expect(bottom, "the shade lost its bottom inset").toBeDefined();
    expect(Math.abs(Number(bottom))).toBeLessThanOrEqual(COLUMN_GAP_PX);
    // …and the mask's own bottom stop is the same number, because feather ===
    // bleed is what keeps the flat core exactly on the card's box. A clamp
    // applied to one of the two would put a hard edge back on the side it was
    // applied to.
    expect(style).toContain(`calc(100% - ${Math.abs(Number(bottom))}px)`);
    // The class the constant restates. If the column's gap changes, this fails
    // here rather than in a screenshot six waves later.
    expect(html).toMatch(/class="[^"]*\bgap-2\b/);
  });

  it("it is still a shade and not the panel the 2026-08-03 review deleted", () => {
    const html = column();
    const el = html.slice(html.indexOf('data-hud="toast-scrim"'));
    const style = el.slice(0, el.indexOf(">"));
    // No border, no radius, no blur — the three things that make a shape read
    // as furniture. The card's own left rule is information and is untouched.
    expect(style).not.toMatch(/border-radius/);
    expect(style).not.toMatch(/backdrop-filter/);
    expect(style).not.toMatch(/\bborder:/);
    // The severity rule survives: it is what says „опасна" at a glance.
    expect(html).toMatch(/class="[^"]*\bborder-l-2\b/);
  });
});
