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
