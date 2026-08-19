/**
 * =============================================================================
 * THE CARD HAD NO GROUND — the ONE critical finding routed to SimOverlay.tsx,
 * plus the second clause of twenty-three more. Catalogue sweep 161, 2026-08-19.
 * =============================================================================
 *
 * FILED, verbatim (sc-ov-lane-keeping/mobile-right/04-t152s.png, critical):
 *
 *   „On mobile the ИНСТРУКЦИИ overlay has NO panel background at all. The
 *    'ИНСТРУКЦИИ' title is drawn over the demo picture-in-picture video, the
 *    body text runs straight over sky and buildings … The lesson's
 *    instructions are unreadable on a phone."
 *
 * and, as the second half of one sentence filed against twenty-three lessons:
 *
 *   „It carries no panel of its own, so its first two lines render directly
 *    over the rear-view mirror image and the sky, and the «ЗАЩО»/«×» controls
 *    land on top of world geometry."
 *
 * ── THE MEASUREMENT THIS FILE STANDS ON ──────────────────────────────────────
 *
 * Four filed frames were opened at device resolution (2556 × 1179 = iPhone 16
 * landscape 852 × 393 at dpr 3) and a 55 × 130 CSS-px block of world was
 * sampled IMMEDIATELY LEFT OF THE CARD'S OWN BOX, on the same rows. Left of the
 * box and not inside it, deliberately: it is the same material — the same
 * facade, the same sky — and it cannot contain one glyph or one halo pixel the
 * card itself drew, so the number is the ground and not the card.
 *
 *   sc-jx-blocked-exit  06-waited   L50 0.351  L90 0.518  L99 0.597  max 0.610
 *   sc-rb-exit-signal   04-t035s    L50 0.332  L90 0.523  L99 0.595  max 0.604
 *   sc-merge-lane-end   04-t115s    L50 0.273  L90 0.507  L99 0.570  max 0.589
 *   sc-ov-lane-keeping  04-t152s    L50 0.405  L90 0.467  L99 0.499  max 0.543
 *
 * The brightest single pixel across all four is rgb(204, 205, 206), and it is
 * the render-white facade in `sc-jx-blocked-exit/mobile-right/06-waited.png` —
 * the frame in which the whole authored WHY is pale grey type on pale grey
 * masonry. That pixel is `WORST_WORLD` below and it is what every assertion in
 * this file is computed against, because a HUD that is legible on the average
 * pixel and invisible on the bright one is a HUD that goes dark exactly when a
 * student is driving into the sun.
 *
 * ── WHY THIS IS A NODE TEST AND NOT A RENDER ────────────────────────────────
 *
 * The sibling files say it and it is the same reason here: vitest runs
 * `environment: "node"` in this suite, and jsdom would not composite an alpha
 * over a background or resolve a `mask-image` even if it did. What CAN be
 * proved without a browser is the arithmetic — an alpha, a colour and a
 * background determine a contrast ratio exactly — and the arithmetic is the
 * part that was wrong. The acceptance evidence is still a frame.
 *
 * ── THE INSTRUMENT SELF-CHECKS, BECAUSE EVERY „0 DEFECTS" IN THIS PROJECT WAS
 *    AN INSTRUMENT BUG AND ALL OF THEM LIED IN THE REASSURING DIRECTION ──────
 *
 * `contrast()` below is checked against the two anchors WCAG publishes before
 * it is trusted with anything: black on white is exactly 21 : 1, and #767676 on
 * white is the canonical 4.5 : 1 boundary case. A luminance function with a
 * transposed coefficient or a missing gamma step passes neither.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PEEK_SCRIM_ALPHA,
  PEEK_SCRIM_FEATHER_PX,
  PEEK_SCRIM_RGB,
  peekScrimBackgroundCss,
  peekScrimMaskCss,
} from "../SimOverlay";

const SRC = readFileSync(resolve(__dirname, "../SimOverlay.tsx"), "utf8");

type Rgb = readonly [number, number, number];

/** sRGB relative luminance, WCAG 2.x. */
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

/** `source` laid over `ground` at `alpha`, the way a browser composites it. */
function over(source: Rgb, ground: Rgb, alpha: number): Rgb {
  return [0, 1, 2].map((i) => alpha * source[i]! + (1 - alpha) * ground[i]!) as unknown as Rgb;
}

function hex(h: string): Rgb {
  const n = Number.parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The brightest world pixel under this card across the four filed frames —
 * `sc-jx-blocked-exit/mobile-right/06-waited.png`, the render-white facade.
 */
const WORST_WORLD: Rgb = [204, 205, 206];

/* ─────────────────────────────────────────────────────────────────────────────
   THE INKS ARE READ OUT OF THE SHIPPED STYLESHEETS, NOT RESTATED HERE.
   2026-08-19, second pass, and the reason is the defect this replaced.

   The first version of this file hard-coded three hexes and named the third
   `--accent #3fa1ff`. That is the APP theme's accent. `/lesson/[lessonId]`
   renders under the (dashboard) layout's `data-surface="cluster"`, whose block
   in globals.css re-declares the whole semantic palette — `--accent` is
   #48a9ff there — and the ink that actually binds is not the accent at all: it
   is `--danger #ff6a58`, which `TONE_COLOR` hands to every ГРУБА violation, and
   which is 0.58 of a ratio quieter than the token this file was measuring.

   So a comment stating a measurement nothing checks became a test asserting a
   measurement of the wrong colour, which is the same fault one layer down. Both
   sources are now PARSED:

     · the five tone tokens, out of the `[data-surface="cluster"]` block;
     · `--foreground` / `--muted`, out of the UNPANEL register in
       PlayAreaStyles, which re-pins exactly those two inside a `.hud-ghost`
       („Ink, pinned light in BOTH themes") and deliberately leaves the semantic
       colours to the component — asserted below, because that omission is what
       makes the cluster block the right source for the other five.

   A token edit in either file now fails a test here instead of rotting a
   paragraph in SimOverlay.tsx. The parser self-checks first: it must find every
   token the component uses, and it must find NOTHING when pointed at an anchor
   that does not exist — a silently empty parse would make every assertion below
   vacuous, in the reassuring direction.
   ────────────────────────────────────────────────────────────────────────── */

const APP_CSS = readFileSync(resolve(__dirname, "../../../../app/globals.css"), "utf8");
const PLAY_AREA_SRC = readFileSync(
  resolve(__dirname, "../../../../components/sim/lesson-ui/PlayAreaStyles.tsx"),
  "utf8",
);

/**
 * The body of the rule whose selector list ends at `anchor`.
 *
 * `anchor` MUST end with the opening brace, which is not fussiness: the first
 * attempt took „the next `{` after the selector", and PlayAreaStyles' selector
 * is written `[data-sim-stage] ${GHOST} {` — so the `{` of the `${` template
 * hole won, and the parse silently returned the wrong span. Ending the anchor
 * at the brace removes the ambiguity instead of coping with it. The close is
 * `\n<indent>}` because one of the two rules lives inside a template literal
 * and is indented six spaces; the flat `\n}` this started with found nothing
 * there and handed back null.
 */
function ruleBody(css: string, anchor: string): string | null {
  if (!anchor.endsWith("{")) throw new Error("anchor must end at the opening brace");
  const at = css.indexOf(anchor);
  if (at < 0) return null;
  const open = at + anchor.length;
  const close = /\n[ \t]*\}/.exec(css.slice(open));
  return close === null ? null : css.slice(open, open + close.index);
}

/** `--name: #rrggbb;` declarations in a rule body. */
function customProps(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out.set(m[1]!, m[2]!.toLowerCase());
  }
  return out;
}

const CLUSTER_BODY = ruleBody(APP_CSS, ':is(:root:has([data-surface="cluster"])) {');
/** The UNPANEL register's own rule — the block that re-pins the two text inks. */
const GHOST_BODY = (() => {
  const from = PLAY_AREA_SRC.indexOf("export const UNPANEL_CSS");
  if (from < 0) return null;
  return ruleBody(PLAY_AREA_SRC.slice(from), "[data-sim-stage] ${GHOST} {");
})();

/** The five tokens `TONE_COLOR` resolves — read off the component, in its order. */
const TONE_VARS = (() => {
  const body = /const TONE_COLOR: Record<SimOverlayTone, string> = \{([^}]*)\}/.exec(SRC)?.[1];
  return body === undefined ? [] : [...body.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]!);
})();

describe("the parser, before anything it reads is believed", () => {
  it("finds both rule bodies, and finds nothing when the anchor is wrong", () => {
    expect(CLUSTER_BODY, "the cluster palette block moved — re-anchor").not.toBeNull();
    expect(GHOST_BODY, "the UNPANEL register moved — re-anchor").not.toBeNull();
    // The negative control. Without it a renamed selector would empty every map
    // below and hand back a suite that passes because it asserts nothing.
    expect(ruleBody(APP_CSS, ':is(:root:has([data-surface="no-such-scope"])) {')).toBeNull();
    expect(customProps("").size).toBe(0);
    // …and the parse must stop at its own rule. `--background` is the FIRST
    // declaration in the cluster block and `--ease-out` is in the `:root` block
    // that follows it: if the close ever runs long, the second appears here.
    expect(CLUSTER_BODY!).toContain("--background");
    expect(CLUSTER_BODY!).not.toContain("--ease-out");
  });

  it("the ghost re-pins the two text inks and NOT the semantic five", () => {
    // This is why the two maps have different sources. The register's own
    // comment says it („Semantic borders (danger / success / accent) are set by
    // the component and untouched"); if that ever changes, the tone inks below
    // are being read from the wrong stylesheet and this fails first.
    const ghost = customProps(GHOST_BODY!);
    expect(ghost.get("--foreground")).toBeDefined();
    expect(ghost.get("--muted")).toBeDefined();
    expect(GHOST_BODY!).not.toMatch(/--(?:accent|accent-2|warning|danger|success)\s*:/);
  });

  it("reads the five tones off TONE_COLOR, so a sixth tone cannot slip past", () => {
    expect(TONE_VARS).toHaveLength(5);
    expect(TONE_VARS).toContain("--danger");
    for (const v of TONE_VARS) {
      expect(customProps(CLUSTER_BODY!).get(v), `${v} is not in the cluster block`).toBeDefined();
    }
  });
});

/**
 * Every ink this card paints, at the value it RESOLVES TO on the shipped page.
 *
 * Rows 2 and 2b are `text-foreground` / `text-muted`; the tone glyph, the
 * «−N т.» chip, «↓ още N реда», the «ЗАЩО» label and both chip tints inherit
 * the card's own `color`, which is `TONE_COLOR[tone]`. So the card has SEVEN
 * inks, not three, and the quiet one is a tone rather than the accent.
 */
const INK: Record<string, Rgb> = (() => {
  const cluster = customProps(CLUSTER_BODY ?? "");
  const ghost = customProps(GHOST_BODY ?? "");
  // Named rather than `!`-asserted: a missing token used to surface four tests
  // later as „undefined is not iterable", which names the symptom and hides
  // which stylesheet moved.
  const need = (m: Map<string, string>, k: string, where: string): Rgb => {
    const v = m.get(k);
    if (v === undefined) throw new Error(`${k} is not in ${where} — re-anchor the parser`);
    return hex(v);
  };
  const out: Record<string, Rgb> = {
    /** Row 2, the authored line — and «Разбрах»'s own label. */
    "--foreground": need(ghost, "--foreground", "the UNPANEL register"),
    /** Row 2b, the authored WHY — and the ✕ chip's glyph. */
    "--muted": need(ghost, "--muted", "the UNPANEL register"),
  };
  for (const v of TONE_VARS) out[v] = need(cluster, v, "the cluster palette");
  return out;
})();

/** WCAG AA for body-sized text. The floor, not a target. */
const AA = 4.5;

/** The quietest ink over a given ground — derived, never named by hand again. */
function bindingInk(ground: Rgb): [string, number] {
  let worst: [string, number] = ["", Number.POSITIVE_INFINITY];
  for (const [name, rgb] of Object.entries(INK)) {
    const c = contrast(rgb, ground);
    if (c < worst[1]) worst = [name, c];
  }
  return worst;
}

describe("the instrument, before it is believed", () => {
  it("reproduces the two contrast anchors WCAG publishes", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6);
    // The canonical boundary grey: #767676 on white is 4.54 : 1.
    expect(contrast(hex("#767676"), [255, 255, 255])).toBeCloseTo(4.54, 2);
    expect(contrast([128, 128, 128], [128, 128, 128])).toBeCloseTo(1, 6);
  });

  it("composites the way a browser does — alpha 0 and 1 are the two ends", () => {
    expect(over([0, 0, 0], WORST_WORLD, 0)).toEqual([204, 205, 206]);
    expect(over([0, 0, 0], WORST_WORLD, 1)).toEqual([0, 0, 0]);
  });
});

describe("the defect, stated as a number so it cannot come back quietly", () => {
  /**
   * This is the frame, in arithmetic. If a later wave deletes the ground, these
   * are the ratios it goes back to — and 1.01 : 1 is not „low contrast", it is
   * the same colour twice.
   */
  it("bare ink on the filed facade is 1.01–1.77 : 1, i.e. no contrast at all", () => {
    expect(contrast(INK["--foreground"]!, WORST_WORLD)).toBeCloseTo(1.47, 2);
    expect(contrast(INK["--danger"]!, WORST_WORLD)).toBeCloseTo(1.77, 2);
    // THE NUMBERS THAT ARE THE FINDING. `--warning` is L 0.6035 and `--muted`
    // L 0.6172 against that facade pixel's L 0.6096: the authored WHY, and the
    // «−N т.» chip of every second-degree violation, are the same colour as the
    // wall behind them to a hundredth. Not „hard to read" — not there.
    expect(contrast(INK["--muted"]!, WORST_WORLD)).toBeLessThan(1.05);
    expect(contrast(INK["--warning"]!, WORST_WORLD)).toBeLessThan(1.02);
    // …and ALL SEVEN are far under the floor, which is the whole finding. The
    // loop is the assertion; the two named rows above only say where to look.
    expect(Object.keys(INK)).toHaveLength(7);
    for (const [name, ink] of Object.entries(INK)) {
      expect(contrast(ink, WORST_WORLD), name).toBeLessThan(1.8);
    }
  });
});

describe("the ground, over the brightest world the sweep put under this card", () => {
  const shade = PEEK_SCRIM_RGB as unknown as Rgb;
  /**
   * ROUNDED, AND THAT IS THE POINT OF THIS WHOLE `describe`. A browser stores
   * the composited ground as 8-bit integers; the un-rounded float is a number
   * no pixel ever holds. The first alpha tried here (0.78) cleared AA by
   * 0.0016 — less than one unit of that rounding moves the ratio — and the
   * un-rounded form said it was fine.
   */
  const groundedAt = (alpha: number): Rgb =>
    over(shade, WORST_WORLD, alpha).map(Math.round) as unknown as Rgb;
  const grounded = groundedAt(PEEK_SCRIM_ALPHA);
  const [BINDS, BINDING_RATIO] = bindingInk(grounded);
  /** One 8-bit step of the composited ground, in ratio, for the ink that binds. */
  const stepAt = (ground: Rgb): number => {
    const [, ratio] = bindingInk(ground);
    return Math.abs(contrast(INK[BINDS]!, [ground[0] + 1, ground[1] + 1, ground[2] + 1]) - ratio);
  };
  const STEP = stepAt(grounded);
  /**
   * THE DOCUMENTED GROUND, AT THE LITERAL 0.80 — and it is separate from
   * `grounded` on purpose, because the first draft of this block pinned every
   * number to `PEEK_SCRIM_ALPHA` and then refused a DARKER shade for being
   * darker. (Run: at 0.85 five assertions went red, of which exactly one — „it
   * is a shade, not a curtain" — was the one that should have.) A test that
   * fails a correct change is the same fault as one that passes a wrong one.
   *
   * So the split is: the numbers written into SimOverlay.tsx's header are
   * checked HERE, against the alpha they were computed at, where they can never
   * be stale and can never refuse anything; and the SHIPPED alpha is checked
   * against floors, which a later wave may clear by any margin it likes.
   */
  const GROUND_080 = groundedAt(0.8);

  it("carries every ink on the card over AA", () => {
    for (const [name, ink] of Object.entries(INK)) {
      expect(contrast(ink, grounded), name).toBeGreaterThanOrEqual(AA);
    }
  });

  it("the ink that binds is `--danger`, and it is the ГРУБА violation's own", () => {
    // DERIVED, then named. The first pass named `--accent` by hand and was
    // measuring a token this surface does not resolve to; if a palette edit
    // ever makes some other ink the quiet one, this fails and the paragraph in
    // SimOverlay.tsx gets rewritten instead of quietly becoming false again.
    expect(BINDS).toBe("--danger");
    // …and it is not an exotic tone: `LessonPlayShell` gives `danger` to every
    // first-degree violation, so the quietest ink on this card is the chip on
    // the card that says a student has just made a serious mistake.
    expect(contrast(INK["--accent"]!, grounded)).toBeGreaterThan(BINDING_RATIO);
  });

  it("clears the floor by more than the compositor's own rounding", () => {
    // What 0.78 failed. A margin thinner than one 8-bit step is not a margin —
    // it is the un-rounded arithmetic flattering itself. The step is DERIVED
    // from the binding ink rather than typed: on `--danger` one unit of ground
    // is worth 0.066 of ratio, where on the accent the first pass measured it
    // at 0.027 and then wrote a 0.05 floor it called „~4 steps of slack".
    expect(BINDING_RATIO - AA, `${BINDS} margin`).toBeGreaterThan(STEP);
  });

  it("the numbers SimOverlay.tsx states at 0.80 are the numbers 0.80 gives", () => {
    // Every figure in the header block's ladder, checked at the alpha it was
    // computed at. These cannot go stale and they cannot refuse a later change.
    expect(GROUND_080).toEqual([46, 50, 57]);
    expect(contrast(INK["--danger"]!, GROUND_080), "--danger").toBeCloseTo(4.57, 2);
    expect(contrast(INK["--accent"]!, GROUND_080), "--accent").toBeCloseTo(5.15, 2);
    expect(contrast(INK["--foreground"]!, GROUND_080), "--foreground").toBeCloseTo(11.87, 2);
    expect(contrast(INK["--muted"]!, GROUND_080), "--muted").toBeCloseTo(8.18, 2);
    expect(contrast(INK["--warning"]!, GROUND_080), "--warning").toBeCloseTo(8.01, 2);
    expect(contrast(INK["--accent-2"]!, GROUND_080), "--accent-2").toBeCloseTo(7.73, 2);
    expect(contrast(INK["--success"]!, GROUND_080), "--success").toBeCloseTo(7.54, 2);
    // One 8-bit step, and the margin in steps — „1.04 steps of real slack, and
    // the first two-decimal alpha that has any", verbatim from that block.
    expect(stepAt(GROUND_080)).toBeCloseTo(0.066, 3);
    expect((contrast(INK["--danger"]!, GROUND_080) - AA) / stepAt(GROUND_080)).toBeCloseTo(1.04, 2);
    // …and the two rejected alphas it names.
    expect(contrast(INK["--danger"]!, groundedAt(0.78))).toBeCloseTo(4.31, 2);
    expect(contrast(INK["--danger"]!, groundedAt(0.75))).toBeCloseTo(3.93, 2);
    expect(contrast(INK["--danger"]!, groundedAt(0.73))).toBeCloseTo(3.75, 2);
  });

  it("0.80 is the SMALLEST alpha that clears by a step, computed not chosen", () => {
    // WHY THIS IS A SEARCH AND NOT `toBe(0.8)`. „0.80 is the floor" is the
    // claim the header block makes, and a test that just restated the constant
    // would prove nothing about it. This walks the ladder and asks which
    // two-decimal alpha is the first whose margin exceeds one 8-bit step.
    //
    // And it asserts `>=`, not `===`, deliberately: a LATER wave that darkens
    // the shade for a real reason must not be failed by this file. The other
    // end is already guarded — „it is a shade, not a curtain" below caps how
    // dark it may get, and that is the assertion that owns that direction. A
    // check that refuses a correct change is the same fault as one that passes
    // a wrong one.
    let smallest = Number.NaN;
    for (let a = 0.5; a <= 1.0001; a += 0.01) {
      const g = groundedAt(a);
      const [, ratio] = bindingInk(g);
      const step = Math.abs(contrast(INK[BINDS]!, [g[0] + 1, g[1] + 1, g[2] + 1]) - ratio);
      if (ratio - AA > step) {
        smallest = Math.round(a * 100) / 100;
        break;
      }
    }
    expect(smallest).toBeCloseTo(0.8, 2);
    expect(PEEK_SCRIM_ALPHA).toBeGreaterThanOrEqual(smallest);
  });

  it("0.80 is the floor and not a preference — the near miss just under it", () => {
    // 1. THE ALPHA BELOW IT, AS A LITERAL. 0.795 puts `--danger` at 4.5029 —
    //    over the floor by a twentieth of one step, i.e. by less than the
    //    arithmetic can see. Written as `PEEK_SCRIM_ALPHA - 0.005` this said
    //    nothing: at any darker shipped alpha it would have been comfortably
    //    over and passed for the wrong reason. The near miss is a fixed number.
    const nearMiss = contrast(INK["--danger"]!, groundedAt(0.795));
    expect(nearMiss).toBeGreaterThan(AA);
    expect(nearMiss - AA).toBeLessThan(stepAt(GROUND_080));
    // 2. AND THE SHIPPED ALPHA IS NOT BELOW IT. The floor, checked against what
    //    actually ships — a later wave may go darker (the curtain test below
    //    owns that end), it may not go lighter.
    expect(PEEK_SCRIM_ALPHA).toBeGreaterThanOrEqual(0.8);
    // 3. A STEP FURTHER DOWN AND IT FAILS OUTRIGHT. Without this, „0.80" reads
    //    as taste and the next wave rounds it to 0.7 to show more road.
    expect(contrast(INK["--danger"]!, groundedAt(0.75))).toBeLessThan(AA);
    // …and no shade at all is the defect itself.
    expect(contrast(INK["--muted"]!, groundedAt(0))).toBeLessThan(2);
  });

  it("no element on this card knocks its own ink back under the floor", () => {
    // THE HALF THE GROUND DOES NOT COVER. „↓ още N реда" carried `opacity-90`,
    // and it inherits the card's `color` — so on a ГРУБА violation it was 0.9
    // of `--danger` over this ground: 3.97 : 1, under AA, on the only label
    // that tells a student the reason he was marked down continues below the
    // fold. The class is gone; this is why it may not come back.
    //
    // At the DOCUMENTED ground, so the 3.97 in SimOverlay.tsx is the number
    // this checks and a later alpha cannot make the reason evaporate quietly.
    expect(contrast(over(INK["--danger"]!, GROUND_080, 0.9), GROUND_080)).toBeCloseTo(3.97, 2);
    const fold = /data-sim-overlay-fold=""[\s\S]{0,400}?className="([^"]*)"/.exec(SRC)?.[1];
    expect(fold, "the fold label moved — re-anchor this test").toBeDefined();
    expect(fold).not.toMatch(/opacity-/);
    // The row-1 ✕ INDICATOR is deliberately not on this rule and the number is
    // recorded rather than asserted: it is a glyph, not text, so its floor is
    // 3 : 1, it reads 2.94 at `opacity-70` in the danger tone, and it is not
    // the control — the whole card is the `<button>` and carries the label.
    // Whoever raises that to `opacity-80` (3.36 : 1) should do it here.
    expect(contrast(over(INK["--danger"]!, GROUND_080, 0.7), GROUND_080)).toBeCloseTo(2.94, 2);
    expect(contrast(over(INK["--danger"]!, GROUND_080, 0.8), GROUND_080)).toBeGreaterThan(3);
  });

  it("still lets the world through — it is a shade, not a curtain", () => {
    // A FALSE FIX IN THE OTHER DIRECTION. „An instruction he can read but which
    // hides the hazard it is about is a different failure" is the founder's own
    // note on this card, so the ground is asserted from BOTH sides.
    //
    // The measurement is the world's OWN contrast, not a taste threshold: the
    // dark bonnet rgb(70, 78, 92) against the lit facade is 5.27 : 1 bare. Under
    // the shipped shade it is 1.37 : 1 — dimmed, still two different things. At
    // 0.90 it would be 1.13 and at 1.00 exactly 1.00, i.e. one flat rectangle,
    // which is the panel this may not become. 1.25 is the floor because a
    // luminance step of a quarter is plainly visible over a field this size.
    const BONNET: Rgb = [70, 78, 92];
    expect(contrast(BONNET, WORST_WORLD)).toBeGreaterThan(5);
    const seen = contrast(
      over(shade, BONNET, PEEK_SCRIM_ALPHA),
      over(shade, WORST_WORLD, PEEK_SCRIM_ALPHA),
    );
    expect(seen).toBeGreaterThan(1.25);
    // …and the direction of travel is checked, so „> 1.25" cannot be satisfied
    // by an alpha so low that the first half of this file fails instead.
    expect(
      contrast(over(shade, BONNET, 0.9), over(shade, WORST_WORLD, 0.9)),
    ).toBeLessThan(seen);
    expect(contrast(over(shade, BONNET, 1), over(shade, WORST_WORLD, 1))).toBeCloseTo(1, 6);
  });
});

describe("it has no edge, which is the whole difference from the box he had removed", () => {
  const bg = peekScrimBackgroundCss();
  const mask = peekScrimMaskCss();

  it("both horizontal ends ramp to alpha 0", () => {
    // `to left`: 0px is the RIGHT edge, 100% is the LEFT edge. Both ends must
    // be the transparent stop, or the shade is a rectangle with a visible side.
    expect(bg.startsWith(`linear-gradient(to left, rgba(6, 11, 20, 0) 0px,`)).toBe(true);
    expect(bg.endsWith(`rgba(6, 11, 20, 0) 100%)`)).toBe(true);
  });

  it("the BOTTOM ramps to alpha 0; the top is a hard stop, and on purpose", () => {
    expect(mask.endsWith("transparent 100%)")).toBe(true);
    // ── THE ONE SIDE THAT HAS NO ROOM FOR A RAMP — 2026-08-19, second pass.
    //
    // `NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN` puts this column's top EXACTLY on
    // the interior mirror's lane, so the slack above the card is zero on every
    // sideways profile and ANY top overhang is shade on an instrument. It was
    // 12 px, which spent all 8 px of `NOTIFY_COLUMN_MIRROR_GUTTER_PX` and then
    // 4 px of the mirror's own box. „The mirror does not move, the HUD does."
    //
    // So the mask's first two stops collapse onto 0 and the flat core starts at
    // the card's own top edge. `sim-overlay-mirror-lane.test.ts` is where that
    // is judged as geometry — including the 12 px version, kept as its
    // mutation — and this is the shape of the string it produces.
    expect(mask.startsWith("linear-gradient(to bottom, transparent 0px, #000 0px,")).toBe(true);
  });

  it("every ramp lives in the overhang, so the flat core is exactly the card", () => {
    // The ramp lengths and the negative insets are THE SAME CONSTANT, which is
    // what makes the claim true rather than approximately true: the shade is
    // full strength from the card's own top-left to its own bottom-right, and
    // fades only in the part of itself that hangs past the card.
    expect(bg).toContain(`rgba(6, 11, 20, ${PEEK_SCRIM_ALPHA}) ${PEEK_SCRIM_FEATHER_PX.right}px`);
    expect(bg).toContain(
      `rgba(6, 11, 20, ${PEEK_SCRIM_ALPHA}) calc(100% - ${PEEK_SCRIM_FEATHER_PX.left}px)`,
    );
    expect(mask).toContain(`#000 ${PEEK_SCRIM_FEATHER_PX.top}px`);
    expect(mask).toContain(`#000 calc(100% - ${PEEK_SCRIM_FEATHER_PX.bottom}px)`);
    // THE TOP IS EXACTLY 0 AND THE OTHER THREE ARE RAMPS. A range check that
    // admitted „0 to 32" everywhere would let the three sides that DO have room
    // quietly lose their ramps too — the loosening that answers one finding by
    // excusing four. The top's zero is pinned to its reason above, not waived.
    expect(PEEK_SCRIM_FEATHER_PX.top, "the mirror owns the space above this card").toBe(0);
    for (const side of ["right", "bottom", "left"] as const) {
      const px = PEEK_SCRIM_FEATHER_PX[side];
      // A ramp shorter than ~8 px reads as an edge at dpr 3; longer than ~32 px
      // and the shade starts covering road the card was never standing on.
      expect(px, `${side} feather`).toBeGreaterThanOrEqual(8);
      expect(px, `${side} feather`).toBeLessThanOrEqual(32);
    }
    for (const side of ["top", "right", "bottom", "left"] as const) {
      expect(SRC).toContain(`${side}: \`\${-PEEK_SCRIM_FEATHER_PX.${side}}px\``);
    }
    // …and the hard edge is bounded: the BACKGROUND gradient is untouched, so
    // that top line still dissolves over the last 26 px on the left and 12 on
    // the right. A stroke with no corners is not the rounded strip the
    // 2026-08-03 ruling removed — the three absences below are the rest of it.
    expect(PEEK_SCRIM_FEATHER_PX.left).toBeGreaterThan(0);
    expect(PEEK_SCRIM_FEATHER_PX.right).toBeGreaterThan(0);
  });

  it("the RAMPS are px, not per cent — the column is two widths, not one", () => {
    // 180 px sideways and up to 240 px upright (`notifyColumn.ts`). A percentage
    // ramp is a different number of pixels on each, so the flat core would stop
    // coinciding with the card's box on one orientation and nothing rendered in
    // node would notice. This file has already shipped one orientation-only
    // half-fix (the `@media` override the cascade discarded).
    //
    // `100%` and `calc(100% − Npx)` are the box's own far edge and are the ONE
    // legitimate use of a percentage here; every other stop must be absolute.
    // The check is therefore „no percentage stop other than 100%", not „no `%`".
    // `calc(…)` first, or the `[^,)]` arm eats the stop at its own parenthesis
    // and silently hands back a THREE-stop list that passes — the reassuring
    // direction, again. The length assertion below is what caught that.
    const stops = [...bg.matchAll(/rgba\([^)]*\)\s+(calc\([^)]*\)|[^,)]+)/g)].map((m) => m[1]!);
    expect(stops).toHaveLength(4);
    for (const stop of stops) {
      expect(stop, `stop "${stop}"`).toMatch(/^(\d+px|calc\(100% - \d+px\)|100%)$/);
    }
    // …and a `%` ramp would show up as a stop this pattern rejects:
    expect(/^(\d+px|calc\(100% - \d+px\)|100%)$/.test("62%")).toBe(false);
  });

  it("is not the shape the founder had removed — no border, no radius, no blur", () => {
    // „a full-width rounded strip ending in a SOLID BRAND-BLUE «Разбрах»
    // button. THAT IS A COOKIE BANNER." The three words that make that shape.
    expect(bg + mask).not.toMatch(/border|radius|blur/i);
  });
});

describe("the wiring, because a stripped style is a diff that changes no pixel", () => {
  const el = SRC.slice(
    SRC.indexOf('data-sim-overlay-scrim=""'),
    SRC.indexOf("Row 1 — the tone glyph"),
  );

  it("the shade element is findable (anchor check)", () => {
    expect(el.length, "the scrim element moved — re-anchor the tests below").toBeGreaterThan(200);
  });

  it("carries the UNPANEL exemption, or the stylesheet deletes it", () => {
    // `[data-sim-stage] :is(.hud-ghost, …) :is(div, …):not([data-hud-ink])` sets
    // `background-image: none !important`. Without this attribute the whole fix
    // is invisible on the deployed build and green here — which is precisely
    // how the tier picker's filled segment survived an entire unpanel pass.
    expect(el).toContain('data-hud-ink=""');
  });

  it("paints behind the words rather than over them", () => {
    // In-flow content paints BEFORE positioned descendants, so an absolutely
    // positioned sibling at `z-index: auto` lands ON TOP of the type it exists
    // to make readable — a fix that makes the finding worse.
    expect(el).toContain("zIndex: -1");
    expect(el).toContain('position: "absolute"');
  });

  it("never eats the tap that dismisses the card, and is never announced", () => {
    // The plain-line shape makes the WHOLE CARD a `<button aria-label="Скрий
    // известието">` (doc 87 · A6). A shade that swallowed that press would
    // re-open the founder's „those pop ups need to be able to be removed when
    // clicked" one layer down.
    expect(el).toContain('pointerEvents: "none"');
    expect(el).toContain("aria-hidden");
  });

  it("ships both mask spellings, for the WebKit versions still in this market", () => {
    expect(el).toContain("WebkitMaskImage: peekScrimMaskCss()");
    expect(el).toContain("maskImage: peekScrimMaskCss()");
  });

  it("the card is the shade's containing block AND its stacking context", () => {
    // `absolute` without a positioned ancestor escapes to the notification
    // column — which is `max-height`-capped at 95.76 px sideways while the card
    // it holds lays out taller, so the control row would be left unshaded.
    const cls = /const CARD_CLASS =\s*\n?\s*"([^"]*)"/.exec(SRC)?.[1];
    expect(cls, "CARD_CLASS moved — re-anchor this test").toBeDefined();
    expect(cls).toContain("relative");
    // ── AND `isolate`, WHICH WAS CAUGHT BY LOOKING AND BY NOTHING ELSE.
    //
    // A negative z-index does not stop at its parent: it climbs to the nearest
    // ancestor that HAS a stacking context and paints at the bottom of THAT
    // one. Rendered in WebKit over a patch of the facade this finding was filed
    // on, the first version of this fix produced a screenshot identical to the
    // defect — the shade sank past the backdrop and painted nothing — while
    // every assertion in this file was green. The column happens to carry
    // `z-30`, so on the shipped page it would have worked by coincidence, one
    // edit to somebody else's z-index away from silently reverting to 1.0 : 1.
    expect(cls).toContain("isolate");
    // …and it is still not the strip: `unpanel.test.ts` asserts these two from
    // its own side, and they are restated here because THIS is the commit that
    // added a background to this card and had to not put the box back.
    expect(cls).not.toMatch(/\bborder\b/);
    expect(cls).not.toMatch(/\brounded-full\b/);
  });
});
