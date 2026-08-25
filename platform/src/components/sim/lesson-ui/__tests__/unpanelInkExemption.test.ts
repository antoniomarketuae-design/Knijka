import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UNPANEL_CSS } from "../PlayAreaStyles";

/**
 * THE HALF OF THE `data-hud-ink` CONTRACT THAT NOTHING WAS HOLDING.
 *
 * ── The three criticals this exists for, and what they actually showed ──────
 *
 * Sweep 161 filed the same sentence from three lessons:
 *
 *   „On mobile the ИНСТРУКЦИИ card has NO panel background at all: the
 *    briefing text is painted straight onto the street, fades out mid-word on
 *    its third line, and hides the rest behind a «↓ ОЩЕ 14 РЕДА» label."
 *      · sc-junction-gap/mobile-right/01-arrival.png      (critical)
 *      · sc-speed-transition/mobile-right/07-end.png      (critical)
 *      · sc-rx-unguarded/mobile-right/01-arrival.png      (critical)
 *
 * OPENED, ALL THREE. The dark rectangle behind the first three or four lines
 * is NOT the card's own panel — it is the interior rear-view mirror, which the
 * card happens to be pinned over. Below the mirror's bottom edge the same
 * paragraph continues onto sky and render-white facade with nothing behind it,
 * and that is where it fades out mid-word. The card has no ground at all; it
 * borrows one for as long as the mirror is tall.
 *
 * ── Why the guard belongs HERE and not where the fix is ─────────────────────
 *
 * `SimOverlay.tsx` closed them by giving the card a shade: a child <div> at
 * `z-index: -1` carrying `data-hud-ink=""`. That attribute is the entire fix.
 * The shade is a `div` inside a `.hud-ghost`, so it is squarely inside this
 * stylesheet's UNPANEL sweep, and the sweep hands its matches
 * `background-image: none !important`. The two `:not([data-hud-ink])` clauses
 * in the sweep's selector are the only reason the shade survives to paint.
 *
 * TWO SUITES ALREADY ASSERT THE COMPONENT END of that contract
 * (`unpanel.test.ts` on the ack chip, `sim-overlay-scrim.test.ts` on the
 * shade). NOTHING asserted the stylesheet end. Delete `:not([data-hud-ink])`
 * from `PlayAreaStyles.tsx` and: tsc is silent, both of those suites stay
 * green, every existing render test stays green — and the three frames above
 * come back exactly as filed. That is the shape of failure the note above
 * `GHOST_SURFACES` was written about after the tier picker's fill survived a
 * whole unpanel pass: a CSS rule in a template literal can rot into a no-op
 * without a type error, a failing render, or one changed pixel in a test.
 *
 * ── Why this APPLIES the selector instead of matching its text ──────────────
 *
 * `expect(UNPANEL_CSS).toContain(":not([data-hud-ink])")` would pass after the
 * clause was moved onto the WRONG compound — onto the ghost root, say, where
 * it guards nothing, because the shade is a descendant. Characters kept,
 * meaning gone. So the selector is parsed and evaluated against element trees.
 *
 * The matcher below understands exactly the four constructs this one selector
 * uses (attribute presence, attribute equality, `:is(…)`, `:not(…)` including a
 * descendant argument) and nothing else — `assertUnderstood()` refuses any
 * token outside that set rather than silently answering „no match", which is
 * the reassuring direction and therefore the one that must be impossible.
 *
 * The matcher's own negative controls are in the first describe block and they
 * are not decoration: the load-bearing one runs the sweep with the two
 * exemption clauses REMOVED and requires the shade to be stripped. Without it,
 * every „is not stripped" assertion below could be passing because the matcher
 * matches nothing at all.
 *
 * IT IS NOT A SUBSTITUTE FOR LOOKING. The acceptance evidence is the three
 * frames named above, re-driven. This fails in the same commit that unwires
 * them.
 */

// ---------------------------------------------------------------------------
// A DOM small enough to reason about (vitest runs `environment: "node"` here —
// there is no document, and pulling one in for four elements would be a larger
// dependency than the matcher).
// ---------------------------------------------------------------------------

interface El {
  tag: string;
  classes: string[];
  attrs: Record<string, string>;
  parent: El | null;
}

function el(
  tag: string,
  opts: { classes?: string[]; attrs?: Record<string, string>; parent?: El | null } = {},
): El {
  return {
    tag,
    classes: opts.classes ?? [],
    attrs: opts.attrs ?? {},
    parent: opts.parent ?? null,
  };
}

function ancestors(node: El): El[] {
  const out: El[] = [];
  for (let p = node.parent; p !== null; p = p.parent) out.push(p);
  return out;
}

// ---------------------------------------------------------------------------
// The matcher
// ---------------------------------------------------------------------------

/** Split on `sep` at paren depth 0, so `:not([data-hud-ink] *)` stays whole. */
function splitTop(input: string, sep: "," | " "): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth === 0 && ch === sep) {
      if (cur.trim() !== "") out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim() !== "") out.push(cur.trim());
  return out;
}

/** Peel one compound into its parts: `div:not([x]):not([y])` → three tokens. */
function tokenize(compound: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < compound.length; i++) {
    const ch = compound[i]!;
    const boundary =
      depth === 0 && cur !== "" && (ch === "." || ch === "[" || (ch === ":" && cur !== ":"));
    if (boundary) {
      out.push(cur);
      cur = "";
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    cur += ch;
  }
  if (cur !== "") out.push(cur);
  return out;
}

const ATTR_PRESENT = /^\[([a-z-]+)\]$/;
const ATTR_EQUALS = /^\[([a-z-]+)="([^"]*)"\]$/;
const CLASS_TOKEN = /^\.([a-zA-Z0-9_-]+)$/;
const TAG_TOKEN = /^[a-z][a-z0-9]*$/;
const UNIVERSAL = "*";
// `[\s\S]` rather than the `s` flag: this tsconfig targets below es2018 and
// `/s` is a compile error there (TS1501), not a runtime one — it would have
// shipped a red gate.
const FUNCTIONAL = /^:(is|not)\(([\s\S]*)\)$/;

/**
 * Refuse anything the matcher does not genuinely implement.
 *
 * A matcher that returns `false` for a construct it does not understand is a
 * matcher that reports „not stripped" — the reassuring answer — for every
 * selector a future edit writes. It has to throw instead.
 */
function assertUnderstood(token: string): void {
  if (
    token === UNIVERSAL ||
    ATTR_PRESENT.test(token) ||
    ATTR_EQUALS.test(token) ||
    CLASS_TOKEN.test(token) ||
    TAG_TOKEN.test(token) ||
    FUNCTIONAL.test(token)
  ) {
    return;
  }
  throw new Error(
    `unpanelInkExemption: the UNPANEL sweep now uses "${token}", which this ` +
      `matcher does not implement. Teach it the construct — do NOT let it ` +
      `answer "no match", which is the reassuring direction.`,
  );
}

/**
 * Walk EVERY token of a selector, including inside `:is()` / `:not()`, and
 * refuse the whole thing before a single element is tested.
 *
 * VALIDATING UP FRONT IS THE POINT, and it was not the first design. Checking
 * each token as it is reached let `[data-sim-stage] p > span` pass silently:
 * the rightmost compound `span` fails against a `<p>`, `matchesCompound`
 * returns early, and the `>` it never reached was never questioned. A matcher
 * that answers „not stripped" for a combinator it cannot honour is precisely
 * the instrument bug this file exists to prevent, in the file that prevents it.
 */
function assertSelectorUnderstood(selector: string): void {
  for (const compound of splitTop(selector, " ")) {
    for (const token of tokenize(compound)) {
      assertUnderstood(token);
      const fn = FUNCTIONAL.exec(token);
      if (fn !== null) {
        for (const arg of splitTop((fn as unknown as [string, string, string])[2], ",")) {
          assertSelectorUnderstood(arg);
        }
      }
    }
  }
}

/** Does one compound (no combinators) match `node`? */
function matchesCompound(node: El, compound: string): boolean {
  for (const token of tokenize(compound)) {
    if (token === UNIVERSAL) continue;

    const fn = FUNCTIONAL.exec(token);
    if (fn !== null) {
      const [, name, argList] = fn as unknown as [string, string, string];
      const args = splitTop(argList, ",");
      const any = args.some((arg) => matchesSelector(node, arg));
      if (name === "is" ? !any : any) return false;
      continue;
    }

    const eq = ATTR_EQUALS.exec(token);
    if (eq !== null) {
      if (node.attrs[eq[1]!] !== eq[2]!) return false;
      continue;
    }
    const present = ATTR_PRESENT.exec(token);
    if (present !== null) {
      if (!(present[1]! in node.attrs)) return false;
      continue;
    }
    const cls = CLASS_TOKEN.exec(token);
    if (cls !== null) {
      if (!node.classes.includes(cls[1]!)) return false;
      continue;
    }
    if (node.tag !== token) return false;
  }
  return true;
}

/**
 * Does one complex selector (descendant combinators only — the sweep uses no
 * others, and `assertUnderstood` guarantees nothing else slips in) match?
 * Rightmost compound is the subject; every compound to its left must be
 * satisfied by some ancestor, in order.
 */
function matchesSelector(node: El, selector: string): boolean {
  const compounds = splitTop(selector, " ");
  const subject = compounds[compounds.length - 1]!;
  if (!matchesCompound(node, subject)) return false;

  let chain = ancestors(node);
  for (let i = compounds.length - 2; i >= 0; i--) {
    const idx = chain.findIndex((a) => matchesCompound(a, compounds[i]!));
    if (idx < 0) return false;
    chain = chain.slice(idx + 1);
  }
  return true;
}

/** Does any selector in a comma list match? Validated in full, then applied. */
function stripped(node: El, selectorList: string): boolean {
  const selectors = splitTop(selectorList, ",");
  for (const s of selectors) assertSelectorUnderstood(s);
  return selectors.some((s) => matchesSelector(node, s));
}

// ---------------------------------------------------------------------------
// The rule under test, read off the shipped stylesheet
// ---------------------------------------------------------------------------

/**
 * The sweep is the ONE rule that turns off `backdrop-filter` as well as the
 * fill. Anchoring on that rather than on a line number means a rule reordered
 * above it cannot silently hand this file the wrong selector — and the
 * anchor's own negative control is in the first `it` below.
 */
const SWEEP = (() => {
  // Comments first, or the capture in front of `{` is a paragraph of English
  // and the tokenizer meets „Fill". (It did, on the first run of this file.)
  const css = UNPANEL_CSS.replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = m[2]!;
    if (
      body.includes("background-color: transparent !important") &&
      body.includes("backdrop-filter: none !important")
    ) {
      return { selector: m[1]!.trim().replace(/\s+/g, " "), body };
    }
  }
  return null;
})();

/** The same sweep with BOTH ink exemptions removed — the mutation, on tap. */
const SWEEP_WITHOUT_INK_EXEMPTION = () =>
  SWEEP!.selector.replace(/:not\(\[data-hud-ink\][^)]*\)/g, "");

// ---------------------------------------------------------------------------
// The tree: the peek card exactly as `SimOverlay.tsx` builds it.
// ---------------------------------------------------------------------------

const stage = el("div", { attrs: { "data-sim-stage": "" } });
const card = el("div", { classes: ["hud-ghost"], attrs: {}, parent: stage });
/** The shade. `z-index:-1`, `aria-hidden`, and the reason the card has ground. */
const shade = el("div", {
  attrs: { "data-sim-overlay-scrim": "", "data-hud-ink": "" },
  parent: card,
});
/** Anything the shade might come to wrap — guarded by `:not([data-hud-ink] *)`. */
const insideShade = el("span", { parent: shade });
/** The «Разбрах» ack: a tinted chip, exempted for the same reason. */
const ack = el("button", { attrs: { "data-hud-ink": "" }, parent: card });
/** An ordinary row of the card. This one is SUPPOSED to lose its fill. */
const bodyRow = el("p", { parent: card });
/** The same row, but not on the stage — out of the sweep's reach entirely. */
const offStageRow = el("p", { parent: el("div", { classes: ["hud-ghost"] }) });

describe("the matcher and the anchor, before anything they say is believed", () => {
  it("finds the sweep, and finds nothing when the declarations are wrong", () => {
    expect(SWEEP, "the UNPANEL sweep moved — re-anchor this file").not.toBeNull();
    expect(SWEEP!.selector).toContain("[data-sim-stage]");
    // The negative control on the anchor itself: a rule body that does not
    // strip backdrop-filter is not the sweep, however much else it shares.
    const decoy = [
      ...UNPANEL_CSS.replace(/\/\*[\s\S]*?\*\//g, " ").matchAll(/([^{}]+)\{([^{}]*)\}/g),
    ].filter(
      (m) =>
        m[2]!.includes("background-color: transparent !important") &&
        !m[2]!.includes("backdrop-filter"),
    );
    expect(decoy.length, "the tier-picker rule should exist and NOT be picked").toBeGreaterThan(0);
    expect(SWEEP!.body).toContain("backdrop-filter");
  });

  it("strips an ordinary row of the card — so it is capable of saying „stripped“", () => {
    // If this is false, every "is not stripped" assertion below is vacuous.
    expect(stripped(bodyRow, SWEEP!.selector)).toBe(true);
    // …and the ghost root itself, which is the sweep's first selector.
    expect(stripped(card, SWEEP!.selector)).toBe(true);
  });

  it("reaches nothing outside [data-sim-stage]", () => {
    expect(stripped(offStageRow, SWEEP!.selector)).toBe(false);
  });

  it("refuses a construct it does not implement, instead of answering „no“", () => {
    expect(() => stripped(bodyRow, "[data-sim-stage] p > span")).toThrow(/does not implement/);
    expect(() => stripped(bodyRow, "[data-sim-stage] p:nth-child(2)")).toThrow(
      /does not implement/,
    );
  });

  /**
   * THE MUTATION, RUN IN THE SUITE RATHER THAN DESCRIBED IN A COMMENT.
   *
   * This is the edit that reopens the three criticals: drop the ink exemptions
   * and the shade is handed `background-image: none !important`. Asserting that
   * the mutated selector DOES strip the shade is what proves the three
   * assertions in the next block are load-bearing — if the matcher were simply
   * blind to the shade, this would fail too.
   */
  it("MUTATION — without the ink exemptions the shade is stripped", () => {
    const mutated = SWEEP_WITHOUT_INK_EXEMPTION();
    expect(mutated).not.toContain("data-hud-ink");
    expect(stripped(shade, mutated), "the mutation must reopen the defect").toBe(true);
    expect(stripped(ack, mutated)).toBe(true);
    expect(stripped(insideShade, mutated)).toBe(true);
  });
});

describe("UNPANEL — the sweep leaves the peek card's ground alone", () => {
  it("does not strip the shade behind the ИНСТРУКЦИИ card", () => {
    // sc-junction-gap · sc-speed-transition · sc-rx-unguarded, all mobile:
    // this is the declaration that decided whether those three frames had a
    // panel or a facade behind the briefing.
    expect(
      stripped(shade, SWEEP!.selector),
      "the peek scrim is being unpanelled — the ИНСТРУКЦИИ card has no ground again",
    ).toBe(false);
  });

  it("does not strip anything the shade contains", () => {
    // `:not([data-hud-ink] *)` — the descendant arm. A shade whose own children
    // are stripped is a partial ground, which the SimOverlay note measures at
    // 1.42 : 1 and calls the defect itself, not a milder version of it.
    expect(stripped(insideShade, SWEEP!.selector)).toBe(false);
  });

  it("does not strip the «Разбрах» ack chip's tint", () => {
    // The control that clears a blocking line has to stay visible; the tint is
    // taken from the item's TONE, so a danger line is not acknowledged with a
    // blue button.
    expect(stripped(ack, SWEEP!.selector)).toBe(false);
  });
});

describe("UNPANEL — both ends of the contract are still wired", () => {
  const overlay = readFileSync(
    join(__dirname, "..", "..", "..", "..", "modules", "sim", "hud", "SimOverlay.tsx"),
    "utf8",
  );

  it("SimOverlay still emits the attribute this stylesheet exempts", () => {
    // The other end. Read-only: that file belongs to another lane, and the
    // point of pinning it here is that the two halves of one contract are
    // otherwise asserted in two files that can be changed independently.
    expect(overlay).toContain('data-sim-overlay-scrim=""');
    const scrimAt = overlay.indexOf('data-sim-overlay-scrim=""');
    expect(
      overlay.slice(scrimAt, scrimAt + 200),
      "the scrim lost data-hud-ink — this stylesheet will now strip it",
    ).toContain('data-hud-ink=""');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   …AND THE SECOND SURFACE WITH THE SAME DEFECT — sweep w10, 2026-08-24.

   The three criticals at the top of this file were the ИНСТРУКЦИИ card. The
   shade closed them, stayed module-private inside `SimOverlay.tsx`, and the
   next sweep found the next ghost that prints PROSE rather than instruments:

     sc-ac-wet-braking/mobile-right/03-ready.png   «Ляв палец — волан. Десен
     sc-ac-crosswind/mobile-right/03-ready.png      палец — нагоре газ, надолу
                                                    спирачка.»

   Cropped and looked at, wet-braking: white 11 px type over a tower-block
   facade with a lit orange window showing through the middle of the second
   «палец», and the cyan reverse sentence — the one that teaches how to select
   R — over the same facade with nothing behind it. The dark rectangle behind
   the first two lines is the interior rear-view mirror, exactly the misreading
   recorded above; below its edge the card has no ground at all.

   THE FIX IS THE PUBLISHED SHADE, not a second recipe, and these two cases are
   what make that true rather than merely intended: the geometry is asserted to
   come from `peekScrimBackgroundCss` and the exemption to be the attribute
   this whole file is about. A hand-typed gradient would satisfy neither.
   ═══════════════════════════════════════════════════════════════════════════ */
describe("UNPANEL — the touch hint has ground too, and it is the SAME ground", () => {
  const scene = readFileSync(
    join(__dirname, "..", "..", "LessonScene.tsx"),
    "utf8",
  );
  /** The card's own element, from its `data-hud` name to its ack button. */
  const CARD = scene.slice(
    scene.indexOf('data-hud="touch-hint"'),
    scene.indexOf("{...tapDismissTouchHint}"),
  );
  /**
   * …and the same slice with the prose taken out, for every assertion whose
   * token could plausibly be WRITTEN ABOUT as well as written. The `isolate`
   * case below is this file's own worked example of why: it passed a mutation
   * that deleted the token, because the paragraph explaining the token
   * contains it. `briefingOverflow.test.tsx` keeps the same pair for the same
   * reason and states the rule — an assertion that cannot tell code from the
   * paragraph describing it is a ban on writing the reason down.
   */
  const CARD_CODE = CARD.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("the card carries a shade, and the shade carries the exemption", () => {
    expect(CARD).toContain('data-hud="touch-hint-scrim"');
    const shadeAt = CARD.indexOf('data-hud="touch-hint-scrim"');
    expect(
      CARD.slice(shadeAt, shadeAt + 200),
      "the touch-hint shade lost data-hud-ink — the sweep will strip it and " +
        "the two frames come back exactly as filed",
    ).toContain('data-hud-ink=""');
  });

  it("…and the shade survives the sweep when the tree is actually run", () => {
    // Not a text match: the same matcher the peek's shade is judged with,
    // applied to the touch-hint tree. `[data-hud="touch-hint"]` is its own
    // entry on GHOST_SURFACES, so the ghost root here is the attribute and not
    // `.hud-ghost` — a distinction a `toContain` cannot make.
    const hintStage = el("div", { attrs: { "data-sim-stage": "" } });
    const hint = el("div", { attrs: { "data-hud": "touch-hint" }, parent: hintStage });
    const hintShade = el("div", {
      attrs: { "data-hud": "touch-hint-scrim", "data-hud-ink": "" },
      parent: hint,
    });
    const hintRow = el("p", { parent: hint });
    expect(SWEEP, "the UNPANEL sweep moved — re-anchor this file").not.toBeNull();
    // The shade keeps its ground…
    expect(stripped(hintShade, SWEEP!.selector)).toBe(false);
    // …the prose row still loses its fill, which is the register the founder
    // signed off and which this fix must not quietly undo…
    expect(stripped(hintRow, SWEEP!.selector)).toBe(true);
    // …and MUTATION: with the ink exemption deleted from the stylesheet the
    // shade is stripped, i.e. this fix becomes a diff that changes no pixel.
    expect(stripped(hintShade, SWEEP_WITHOUT_INK_EXEMPTION())).toBe(true);
  });

  it("the ground is the PUBLISHED one — no second copy of the gradient", () => {
    // The failure this rules out is the cheap one: someone writes
    // `linear-gradient(to left, rgba(6,11,20,0) …)` by hand here, the frame
    // looks right, and the two numbers drift the first time the palette moves.
    // `sim-overlay-scrim.test.ts` judges `peekScrimBackgroundCss` against
    // `globals.css`; going through it is how this surface inherits that.
    expect(CARD).toContain("peekScrimBackgroundCss(");
    expect(CARD).not.toContain("linear-gradient");
    expect(scene).toContain("peekScrimBackgroundCss,");
  });

  it("the card is the shade's stacking context, or there is no shade", () => {
    // `z-index: -1` does not stop at its parent: with no stacking context on
    // the host, the shade paints behind the stage — the whole fix, invisible,
    // with every assertion above still green.
    //
    // ⚠ READ OFF THE CLASS STRING, NOT OFF THE CARD. The first version of this
    //   case sliced the card down to `role="note"` and asked for „isolate"
    //   anywhere in it — and the mutation run deleted `isolate` from the class
    //   list and the case stayed GREEN, because the comment explaining why the
    //   token is there contains the word. An assertion that cannot tell code
    //   from the paragraph describing it is a ban on writing the reason down,
    //   which is this codebase's whole register.
    //
    // ⚠ AND THE PAIR IS ASSERTED, NOT THE WORD. `isolate` alone is not what
    //   gives this card a context — `absolute` + `z-30` already does, so
    //   deleting `isolate` here changes no pixel today and a case that guards
    //   only that token is decoration. What must hold is that the card has a
    //   context AT ALL, so all three are pinned: lose `z-30` and `isolate`
    //   carries it, lose `isolate` and `z-30` carries it, lose both and this
    //   goes red. The legend panel below is the surface where the equivalent
    //   token IS load-bearing on its own, and it has its own case.
    const at = CARD.indexOf("className=");
    expect(at, "the touch-hint card's className moved — re-anchor").toBeGreaterThan(-1);
    const classAttr = CARD.slice(at, CARD.indexOf('"', CARD.indexOf('"', at) + 1) + 1);
    expect(classAttr).not.toContain("//");
    expect(classAttr).toContain("absolute");
    expect(classAttr).toContain("z-30");
    expect(classAttr).toContain("isolate");
  });

  /* ───────────────────────────────────────────────────────────────────────
     THE SECOND HALF OF THE PUBLISHED RECIPE, on the surface that needs it.

     `peekScrimBackgroundCss` ramps LEFT and RIGHT only. Taken alone it is a
     rectangle with a hard 80 %-alpha edge along the top and the bottom, and
     `SimOverlay` says why the second function exists at the function itself:
     „two background layers do not intersect … which puts a hard edge back on
     the two sides this is here to remove."

     On a ghost with no border and no radius that bottom edge lands across the
     middle of the windscreen — a plate edge by another name, i.e. exactly the
     register the 2026-08-03 ruling took out. The top ramp is 0 by the
     published constant (above this card is the mirror's lane) and its ends
     dissolve into the horizontal ramps; the BOTTOM one is 16 px and it is the
     one that must be there.
     ──────────────────────────────────────────────────────────────────── */
  it("the shade is feathered vertically too — not a rectangle with a hard edge", () => {
    expect(CARD_CODE).toContain("peekScrimMaskCss(");
    // Both spellings, or WebKit — the engine both filed frames were
    // photographed on — gets no mask and the hard edge ships anyway.
    expect(CARD_CODE).toContain("WebkitMaskImage");
    expect(CARD_CODE).toContain("maskImage");
    // …and it is the published feather, not a hand-typed 16.
    expect(CARD_CODE).toContain("PEEK_SCRIM_FEATHER_PX.bottom");

    // ⚠ AND THE BARREL IS READ, NOT THE IMPORT LINE. The first draft of this
    //   assertion was `expect(scene).toContain("peekScrimMaskCss,")` — which
    //   matches this file's OWN import statement, so deleting the name from
    //   `hud/index.ts` left it green. A cross-module name that only the
    //   consumer is asked about is not gated at all; doc-05 says modules talk
    //   through `index.ts`, so `index.ts` is what has to be looked at.
    const barrel = readFileSync(
      join(__dirname, "..", "..", "..", "..", "modules", "sim", "hud", "index.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(
      barrel,
      "the shade's vertical feather is module-private again — the second " +
        "consumer gets a rectangle with a hard 80 %-alpha bottom edge",
    ).toContain("peekScrimMaskCss,");
    expect(barrel).toContain("peekScrimBackgroundCss,");
  });

  /* ───────────────────────────────────────────────────────────────────────
     …AND THE THIRD, WHICH ASKED FOR ITS GROUND IN WRITING AND WAS REFUSED.

     `sc-junction-blind/pc-right/01-arrival.png`, 1440 × 900, cropped: the open
     «⌨ Клавиши · за напреднали» list is drawn onto the sky, the overhead power
     lines and the road. The panel's own class list has said
     `bg-background/80 backdrop-blur` the whole time — and the sweep hands
     every un-inked child of a ghost `background-color: transparent !important`
     AND `backdrop-filter: none !important`, so both declarations have been
     dead since `[data-hud="controls-help"]` joined GHOST_SURFACES.

     THIS IS THE SHAPE THE NOTE ABOVE `GHOST_SURFACES` WARNS ABOUT, running in
     the other direction: not a fill that survived a sweep, but a fill the
     sweep removed from a component that still believes it has one. Nothing in
     the tree could tell the difference, because both halves type-check and
     both render.
     ──────────────────────────────────────────────────────────────────── */
  it("the keyboard legend's asked-for plate actually reaches the screen", () => {
    const at = scene.indexOf('data-hud="controls-help-scrim"');
    expect(at, "the controls-help shade is gone — the list is back on the sky").toBeGreaterThan(-1);
    expect(scene.slice(at, at + 200)).toContain('data-hud-ink=""');
    expect(scene.slice(at, at + 900)).toContain("peekScrimBackgroundCss(");

    // Applied, not matched: the panel is a ghost by ATTRIBUTE, and the shade
    // is two levels down (stage → controls-help → panel → shade), which is
    // exactly the depth `:not([data-hud-ink] *)` also has to be right about.
    const s = el("div", { attrs: { "data-sim-stage": "" } });
    const ghost = el("div", { attrs: { "data-hud": "controls-help" }, parent: s });
    const panel = el("div", { parent: ghost });
    const shadeEl = el("div", {
      attrs: { "data-hud": "controls-help-scrim", "data-hud-ink": "" },
      parent: panel,
    });
    expect(SWEEP, "the UNPANEL sweep moved — re-anchor this file").not.toBeNull();
    expect(stripped(shadeEl, SWEEP!.selector)).toBe(false);
    // The panel itself still loses the fill it asks for — which is the point:
    // the register is unchanged and the ground arrives as ink, not as a panel.
    expect(stripped(panel, SWEEP!.selector)).toBe(true);
    // MUTATION: without the exemption clause the shade goes too, and the
    // frame comes back exactly as filed.
    expect(stripped(shadeEl, SWEEP_WITHOUT_INK_EXEMPTION())).toBe(true);
  });

  /* ───────────────────────────────────────────────────────────────────────
     …AND THE GEOMETRY, WHICH THE CASE ABOVE DOES NOT SEE AT ALL.

     THIS CASE EXISTS BECAUSE OF A MUTATION THAT SHOULD HAVE GONE RED AND DID
     NOT. An adversarial pass deleted `relative isolate` from the panel's class
     list — `pointer-events-auto relative isolate mt-1 flex …` → `pointer-
     events-auto mt-1 flex …` — and ran `unpanelInkExemption` together with
     `controlsLegendLifetime`: **24 passed, nothing red**, while the shipped
     result would have been an 80 %-alpha band painted down the ENTIRE left
     rail of the windscreen.

     WHY THOSE TWO WORDS ARE THE WHOLE FIX. The shade is `position: absolute;
     inset: 0`, so it sizes to the nearest POSITIONED ancestor. Without
     `relative` on the panel that ancestor is `[data-hud="controls-help"]`
     itself — `absolute left-3 top-3 … bottom: CONTROLS_HELP_BOTTOM_INSET`,
     the full-height rail — and the panel's own box has nothing to do with it.
     `isolate` is the second half: `position: relative` at `z-index: auto` does
     not open a stacking context, so the `z-index: -1` child keeps searching
     upwards and lands behind the stage, which is the shade existing and
     painting nothing.

     THE INK EXEMPTION WAS GATED AND THE GEOMETRY WAS NOT — a fix half-held is
     the failure mode this whole file was written about, one level down.
     ──────────────────────────────────────────────────────────────────── */
  it("…and the legend's shade is sized by the PANEL, not by the whole left rail", () => {
    const shadeAt = scene.indexOf('data-hud="controls-help-scrim"');
    expect(shadeAt, "the controls-help shade is gone — re-anchor").toBeGreaterThan(-1);

    // The host is the element the shade is declared inside: the nearest
    // `className="…"` ABOVE it. Read as a string and asserted to be code —
    // the prose around this element quotes both tokens, deliberately, and an
    // assertion that reads the prose is the trap this file already fell into
    // once (see the touch hint's stacking-context case).
    const classAt = scene.lastIndexOf('className="', shadeAt);
    expect(classAt, "no className between the panel and its shade — re-anchor").toBeGreaterThan(-1);
    const hostClass = scene.slice(classAt, scene.indexOf('"', classAt + 'className="'.length) + 1);
    expect(hostClass).not.toContain("//");
    expect(
      hostClass,
      "the legend shade's host lost `relative` — `inset: 0` now resolves " +
        "against the full-height left rail and the shade paints a band down " +
        "the whole windscreen",
    ).toContain("relative");
    expect(
      hostClass,
      "the legend shade's host lost `isolate` — a `position: relative` box at " +
        "`z-index: auto` opens no stacking context, so the shade paints behind " +
        "the stage and the panel is back on the sky",
    ).toContain("isolate");

    // …and the edge that stands in for the vertical feather this surface
    // deliberately does not take. The touch hint is a ghost with no border, so
    // it needs `peekScrimMaskCss`; this panel's hairline and radius ARE its
    // edge, and a 16 px bottom ramp here would run under the last row of keys
    // — prose on a partial ground. If the border ever goes, the mask has to
    // arrive in the same commit.
    expect(hostClass).toContain("rounded-xl");
    expect(hostClass).toContain("border-border");
    const shadeSrc = scene.slice(shadeAt, scene.indexOf("/>", shadeAt) + 2);
    expect(shadeSrc).toContain('borderRadius: "inherit"');
    expect(shadeSrc).not.toContain("MaskImage");
  });
});
