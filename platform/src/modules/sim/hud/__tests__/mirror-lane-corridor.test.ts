/**
 * =============================================================================
 * EVERY SURFACE IN THE COMPACT RIGHT CORRIDOR CLEARS THE INTERIOR MIRROR —
 * the general form of the swap `SimOverlay` made for ONE of them. 2026-08-24.
 * =============================================================================
 *
 * `notify-column-mirror.test.ts` derives WHERE the mirror is and asserts that
 * `NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN` clears it.
 * `sim-overlay-mirror-lane.test.ts` asserts that the PEEK adopted it, from both
 * sides. Between them they left the thing that actually went wrong unguarded:
 * the corridor has more than one tenant, and a rule with ONE enforced instance
 * is a convention, not a rule.
 *
 * MEASURED, not argued. On 2026-08-19 `notifyColumn.ts` recorded that „the
 * remaining `NOTIFY_COLUMN_TOP_CSS_COMPACT` readers are the ones this block
 * says should keep it: `TouchControls.TOP_RAIL_TOP_CSS` and the demonstration
 * deck". Re-read against the tree on 2026-08-24 that sentence was wrong by two,
 * and both of the two are RIGHT-corridor surfaces standing in the corner the
 * cockpit's interior mirror is projected into:
 *
 *   [data-hud="touch-hint"]     top: <datum>  — the first-run thumb card, filed
 *                               TWENTY-FOUR times in one steered sweep as
 *                               „painted with no panel straight onto the
 *                               rear-view mirror and the sky". Measured off
 *                               `w10-3/sc-rb-busy-gap__mobile-right/03-ready.png`
 *                               (852 × 393 stage): the card's ink runs y 11.0 →
 *                               132.3 against a mirror painted 0 → 70.
 *   [data-hud="audio-prompt"]   top: <datum>  — same corner, same instrument,
 *                               and its own ROOMY rule two lines above already
 *                               carried the lane.
 *
 * WHAT THIS FILE HOLDS, and why it is written as a scan rather than as two more
 * `toContain` lines: it enumerates EVERY `top:` declaration in the shipped
 * stylesheet that is scoped to `[data-sim-compact="on"]` and names a
 * `data-hud` surface, and requires each one to be either
 *
 *   (a) a member of `CORNER_DATUM_TENANTS` — the two surfaces `notifyColumn.ts`
 *       argues MUST keep the corner (moving the datum drops the top rail's two
 *       opaque buttons onto the road and pushes the sideways deck through the
 *       control band), or
 *   (b) written from `NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN`.
 *
 * so a surface added to this corridor next month fails here instead of on a
 * phone. The mirror itself is inside the WebGL canvas and no DOM probe in this
 * project can see it; what is asserted is that the lengths this stylesheet
 * writes resolve to tops the module's own mirror predicate accepts.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HAZARD_BAND_TOP_FRACTION,
  NOTIFY_COLUMN_MAX_STAGE_FRACTION,
  NOTIFY_COLUMN_TOP_CSS_COMPACT,
  NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,
  notifyColumnMaxHeightCss,
  notifyColumnMaxHeightPx,
  notifyColumnMirrorLanePx,
  notifyColumnTopPx,
} from "../notifyColumn";
import { notifyColumnFloorPx } from "../../../../components/sim/TouchControls";

const nl = (s: string): string => s.replace(/\r\n/g, "\n");
const CSS = nl(
  readFileSync(
    resolve(__dirname, "../../../../components/sim/lesson-ui/PlayAreaStyles.tsx"),
    "utf8",
  ),
);
/** The prose in this file ARGUES about tops it no longer ships. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The three sideways phones the catalogue was photographed on. */
const PHONES = [
  { id: "iphone16 852×393", width: 852, height: 393, insetBottom: 21 },
  { id: "android 780×360", width: 780, height: 360, insetBottom: 0 },
  { id: "samsung gesture 780×340", width: 780, height: 340, insetBottom: 0 },
];

/**
 * The two surfaces that MUST keep the corner datum — `notifyColumn.ts`'s own
 * list, with its own reasons, quoted so this file cannot silently grow a third.
 *
 *  · the «Меню · Изглед · Пауза» rail (x 64 → 231.5, the LEFT corridor), via
 *    `TouchControls.TOP_RAIL_TOP_CSS`;
 *  · the sideways demonstration deck, written `top: calc(<datum> +
 *    TOP_RAIL_ROW_CSS)` — adding 0.166 of the stage moves it to 125 → 183 on a
 *    393 px stage, i.e. straight through a control band that starts at 135.5.
 *
 * `deck-caption` rides in on the deck's own rule and is not a third tenant: its
 * `top` is `calc(100% + 0.5rem)`, i.e. measured from the DECK's box, not the
 * stage's, so no lane on the stage can be owed by it.
 */
const CORNER_DATUM_TENANTS = ["demo-deck", "deck-caption"] as const;

/** The card measured on the frames this round was judged against, CSS px. */
const TOUCH_HINT_CARD_PX = 124.5;

/** `[data-sim-compact="on"] … [data-hud="X"] { … top: … }` in the shipped CSS. */
interface CompactTop {
  hud: string;
  top: string;
}
/**
 * EVERY LENGTH IN THIS STYLESHEET IS A `${…}` INTERPOLATION, i.e. the source
 * text is full of braces that are not CSS braces. A rule scanner that does not
 * mask them finds one rule in the file and reports the corridor clean — the
 * reassuring direction again. So the interpolations are collapsed FIRST, with
 * their identifiers kept (they are the thing being asserted on) and their
 * braces and newlines removed.
 */
function maskInterpolations(src: string): string {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== "$" || src[i + 1] !== "{") {
      out += src[i];
      continue;
    }
    let depth = 1;
    let j = i + 2;
    for (; j < src.length && depth > 0; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") depth--;
    }
    out += `«${src.slice(i + 2, j - 1).replace(/[{}\n]/g, " ")}»`;
    i = j - 1;
  }
  return out;
}

function compactTopDeclarations(css: string): CompactTop[] {
  const out: CompactTop[] = [];
  // Innermost blocks only — `[^{}]*` cannot cross a nested brace, so an
  // `@media` head never matches and its children do.
  const ruleRe = /([^{}]*)\{([^{}]*)\}/g;
  const masked = maskInterpolations(css);
  for (let m = ruleRe.exec(masked); m !== null; m = ruleRe.exec(masked)) {
    const [, head, body] = m;
    if (!head.includes('[data-sim-compact="on"]')) continue;
    // A pseudo-element's `top` is an inset on its OWN host box — the 44 px
    // hit-area group further up this stylesheet — not a place on the stage.
    if (head.includes("::before") || head.includes("::after")) continue;
    // A HELD-GLANCE step is a CHASE-view rule and it is judged by the chase
    // window, not by the interior mirror: `CameraRig` publishes a non-null
    // `side` only from the chase branch (`publishRearView(heldSide, …)`), and
    // the cockpit branch passes `null`, which DELETES `data-sim-glance`. So in
    // every frame that has an interior mirror on it, these selectors cannot
    // match at all.
    if (head.includes("[data-sim-glance=")) continue;
    const top = /(?:^|\n)\s*top:\s*([^;]+);/.exec(body);
    if (!top) continue;
    // Every `data-hud` the head names — a rule may list two surfaces.
    const huds = [...head.matchAll(/\[data-hud="([^"]+)"\]/g)].map((h) => h[1]);
    for (const hud of huds) out.push({ hud, top: top[1].replace(/\s+/g, " ").trim() });
  }
  return out;
}

describe("the corridor's tops — enumerated, not sampled", () => {
  it("finds the compact rules at all (the scan is the instrument; prove it works)", () => {
    // A regex that matched nothing would pass every assertion below in the
    // reassuring direction, which is this project's standing failure mode.
    const found = compactTopDeclarations(CODE);
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found.map((f) => f.hud)).toContain("touch-hint");
    expect(found.map((f) => f.hud)).toContain("audio-prompt");
  });

  it("every right-corridor surface is written from the COLUMN constant", () => {
    for (const { hud, top } of compactTopDeclarations(CODE)) {
      if ((CORNER_DATUM_TENANTS as readonly string[]).includes(hud)) continue;
      // A held glance steps a surface further DOWN from wherever it starts, so
      // those rules are judged by the datum they add to, not by the sum.
      expect(top, `[data-hud="${hud}"] stands on the corner datum, i.e. on the mirror`)
        .toContain("NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN");
    }
  });

  it("…and the corner datum still has exactly the tenants that argued for it", () => {
    for (const { hud, top } of compactTopDeclarations(CODE)) {
      if (!(CORNER_DATUM_TENANTS as readonly string[]).includes(hud)) continue;
      // The claim about a tenant is that it did NOT swap — the deck's own block
      // measures what the swap would cost it (125 → 183 px through a control
      // band that starts at 135.5 on a 393 px stage).
      expect(top, `[data-hud="${hud}"]`).not.toContain("NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN");
    }
    // …and the deck is on the datum specifically, not on some third length.
    const deck = compactTopDeclarations(CODE).find((d) => d.hud === "demo-deck");
    expect(deck?.top).toContain("NOTIFY_COLUMN_TOP_CSS_COMPACT");
    // The rail is TouchControls' export, not a stylesheet rule — pinned here so
    // the pair of tenants is one list rather than two half-lists.
    const touch = nl(
      readFileSync(resolve(__dirname, "../../../../components/sim/TouchControls.tsx"), "utf8"),
    );
    expect(touch).toContain("export const TOP_RAIL_TOP_CSS = NOTIFY_COLUMN_TOP_CSS_COMPACT;");
  });

  it("the two constants are still different lengths (else the swap is a no-op)", () => {
    expect(NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN).not.toBe(NOTIFY_COLUMN_TOP_CSS_COMPACT);
  });
});

describe("what the swapped tops resolve to on the three sideways phones", () => {
  it("the corner datum does NOT clear the mirror and the column constant does", () => {
    for (const p of PHONES) {
      const lane = notifyColumnMirrorLanePx(p, true);
      expect(8, p.id).toBeLessThan(lane);
      expect(notifyColumnTopPx(p, true), p.id).toBeGreaterThanOrEqual(lane);
    }
  });

  it("the hint's whole box — top AND ceiling — stays out of the hazard band", () => {
    // The half that was left half-landed once already: a `max-height` is
    // measured from the box's own top edge, so a swap that moved only the top
    // would drop the floor to 0.596 of the stage.
    for (const p of PHONES) {
      const top = notifyColumnTopPx(p, true);
      const cap = notifyColumnMaxHeightPx(
        p.height,
        notifyColumnFloorPx(p),
        top,
        HAZARD_BAND_TOP_FRACTION,
      );
      expect((top + cap) / p.height, `${p.id} floor fraction`).toBeLessThanOrEqual(
        HAZARD_BAND_TOP_FRACTION + 1e-9,
      );
    }
  });

  it("…and on the handset the catalogue was shot on, it clips NOTHING", () => {
    // 124.5 px is the card measured off `03-ready.png` at dpr 3 (ink 11.0 →
    // 82.0, «РАЗБРАХ» 88.7 → 132.3 from a box top of 8). The peek's own 0.43
    // ceiling leaves 95.8 px here — and this card CLIPS, inside a
    // `pointer-events-none` parent, so 28.7 px of it would be two lines of the
    // founder's reverse-gear sentence deleted with no gesture to get them back.
    const p = PHONES[0];
    const top = notifyColumnTopPx(p, true);
    const band = notifyColumnMaxHeightPx(
      p.height,
      notifyColumnFloorPx(p),
      top,
      HAZARD_BAND_TOP_FRACTION,
    );
    const peek = notifyColumnMaxHeightPx(p.height, notifyColumnFloorPx(p), top);
    expect(peek).toBeLessThan(TOUCH_HINT_CARD_PX);
    expect(band).toBeGreaterThanOrEqual(TOUCH_HINT_CARD_PX);
  });

  it("…and what the two SMALLER phones must SCROLL is pinned, not hoped", () => {
    // STATE WHAT WAS NOT FIXED — and state it accurately, which the first
    // version of this comment did not.
    //
    // On a 340 px stage there are only 103.56 px between the mirror's lane and
    // the thumb pads, and this card wants 124.5. It said "the tail of the
    // reverse-gear sentence is CLIPPED there", and a lane verifier read that as
    // deleted teaching text and held the whole patch over it — correctly, on
    // those words: a repair that trades a layout overlap for a lost sentence
    // would not be a repair.
    //
    // NOTHING IS LOST. LessonScene's card says so in its own voice — "THE WORDS
    // SCROLL, THE BUTTON DOES NOT": the text sits in a `min-h-0 shrink`
    // `overflow-y-auto` window with «РАЗБРАХ» `shrink-0` beneath it at its
    // natural 44 px, which is SimOverlay's shape and was chosen precisely so the
    // control that clears the card can never fall below its own fold.
    //
    // So this number is HOW MUCH MUST BE SCROLLED, not how much is deleted. It
    // is still a cost — a first-run hint the student has to scroll is worse than
    // one they do not — so it stays pinned and cannot grow quietly, and the day
    // the copy is short enough to need no scroll, this line says so.
    const clipped = PHONES.map((p) => {
      const top = notifyColumnTopPx(p, true);
      const cap = notifyColumnMaxHeightPx(
        p.height,
        notifyColumnFloorPx(p),
        top,
        HAZARD_BAND_TOP_FRACTION,
      );
      // Overflow, i.e. scroll distance — not deletion. See the note above.
      return Math.max(0, TOUCH_HINT_CARD_PX - cap);
    });
    expect(clipped[0]).toBe(0);
    expect(clipped[1]).toBeLessThan(5);
    expect(clipped[2]).toBeLessThan(21);
    // …and every one of them is BETTER than what the peek's fraction would do,
    // which is the whole reason this surface got its own bound.
    for (const p of PHONES) {
      const top = notifyColumnTopPx(p, true);
      const peek = notifyColumnMaxHeightPx(p.height, notifyColumnFloorPx(p), top);
      const band = notifyColumnMaxHeightPx(
        p.height,
        notifyColumnFloorPx(p),
        top,
        HAZARD_BAND_TOP_FRACTION,
      );
      expect(band, p.id).toBeGreaterThan(peek);
    }
  });

  it("the hint's ceiling is the BAND's and the peek's is still the 0.43 margin", () => {
    // Two surfaces, two lifetimes, and the stylesheet has to say which is which.
    expect(NOTIFY_COLUMN_MAX_STAGE_FRACTION).toBeLessThan(HAZARD_BAND_TOP_FRACTION);
    const hint = CODE.slice(CODE.indexOf('[data-sim-compact="on"] [data-hud="touch-hint"] {'));
    const block = hint.slice(0, hint.indexOf("\n      }"));
    expect(block).toContain("HAZARD_BAND_TOP_FRACTION");
    expect(block).toContain("NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN");
    // ...AND THE CEILING TAKES THE COLUMN TOP AS ITS ARGUMENT, not merely the
    // same words somewhere in the block. THE MUTATION THAT ESCAPED THIS FILE
    // (found by the lane verifier, 2026-08-25): keep the top: declaration and
    // revert ONLY the second argument of the max-height call to
    // NOTIFY_COLUMN_TOP_CSS_COMPACT. All 1,165 tests stayed GREEN, and the card
    // then resolved 65.2 px into the thumb control band and 57.0 px into the
    // hazard band on the 852x393 handset. The two assertions above cannot see
    // it: the top: declaration alone already contains both names.
    //
    // So pin the ARGUMENT LIST. A ceiling measured from a different top than the
    // one the card is placed at is the half-landed swap this file exists to
    // prevent, and it is invisible to any test that greps vocabulary.
    const ceiling = block.slice(block.indexOf("max-height:"));
    const args = ceiling.slice(0, ceiling.indexOf(")}"));
    expect(args).toContain("NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN");
    expect(args).not.toContain("NOTIFY_COLUMN_TOP_CSS_COMPACT,");
    // The peek's rule, one screen up, must NOT have inherited the wider bound.
    const peek = CODE.slice(CODE.indexOf('[data-hud="notify-column"] {\n        max-height'));
    expect(peek.slice(0, 400)).not.toContain("HAZARD_BAND_TOP_FRACTION");
  });

  it("…and the GENERATOR honours the argument — the call site is not decoration", () => {
    // Passing a fraction that the CSS template then ignores is a change with a
    // green test and no shipped pixel behind it, which is the one failure mode
    // a `${…}` stylesheet can have without a type error. So the two strings are
    // compared, not the call.
    const floor = "var(--f)";
    const top = "var(--t)";
    const peek = notifyColumnMaxHeightCss(floor, top);
    const hint = notifyColumnMaxHeightCss(floor, top, HAZARD_BAND_TOP_FRACTION);
    expect(peek).toContain(`${NOTIFY_COLUMN_MAX_STAGE_FRACTION * 100}%`);
    expect(hint).toContain(`${HAZARD_BAND_TOP_FRACTION * 100}%`);
    expect(hint).not.toBe(peek);
  });
});
