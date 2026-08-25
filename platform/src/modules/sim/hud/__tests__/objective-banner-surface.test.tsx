import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ObjectiveBanner, OBJECTIVE_SCRIM_FEATHER_PX } from "../ObjectiveBanner";
import { NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX } from "../notifyColumn";
import {
  PEEK_SCRIM_FEATHER_PX,
  peekScrimBackgroundCss,
  peekScrimMaskCss,
} from "../SimOverlay";
import { GHOST_SURFACES, UNPANEL_CSS } from "../../../../components/sim/lesson-ui/PlayAreaStyles";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import { compileScenario } from "../../lessons/scenario/compile";
import type { ScenarioLevel } from "../../lessons/scenario/types";

/**
 * =============================================================================
 * „THE TASK IS PRINTED OVER ANOTHER PANEL, IN THE TELEMETRY FACE, AND NOTHING
 *  IN THE HARNESS CAN SEE IT."
 *
 * THE EVIDENCE THIS FILE EXISTS FOR is seventeen frames of the 161-scenario
 * catalogue sweep, all routed at `ObjectiveBanner.tsx`. Read off the pixels of
 * `sc-roundabout-entry/pc-right/04-t141s.png` (1440 × 900, stage at x 265 /
 * y 107, ±2 px):
 *
 *     the banner       [1096, 159, 320 × 46]
 *     «Следвай синята линия»
 *                      [1242, 162, 174 × 27]   ← entirely inside it
 *
 * Two ghost surfaces at full opacity in the same 4 698 px², compositing
 * glyph-for-glyph into «Премини през кръговото иCизлезiс десенамигачıя». Same
 * shape on sc-ov-keep-right, sc-ed-reverse-line, sc-ed-poligon-chain,
 * sc-ed-d2-city-run, sc-follow-brake and sc-ln-turn-lane-arrows.
 *
 * WHY NO PROBE HAD EVER REPORTED IT, and this is the part this file guards.
 * `tools/mobile/lesson-audit.mjs`'s census enumerates `[data-hud]`; so do the
 * overlap sweeps; so does every arbitration rule in `PlayAreaStyles`. This
 * banner — the one surface that is up for the WHOLE DRIVE — carried no such
 * attribute, so all of them read straight through it and reported nothing. That
 * is not a hypothesis: `notifyColumn.ts` records the identical failure against
 * the shadow-line legend („the first measurement reported ZERO overlaps while
 * sitting entirely on top of it"), found only by looking at a frame.
 *
 * WHAT IS ASSERTED HERE, and what deliberately is NOT. The collision itself is
 * fixed in `PlayAreaStyles` / `LessonScene` — the chip's lane, not this
 * component — and the verbatim echo below the banner is fixed in `advisor.ts`.
 * Neither is this file's to make. What IS this file's:
 *
 *   1. the surface has a NAME, on both of its branches, so a rule can address
 *      it and a census can charge for it;
 *   2. the authored instruction is a SENTENCE (`<p>`), which is the only thing
 *      that puts it back in the reading face — UNPANEL's exemption is by TAG;
 *   3. the counter is NOT, because a counter is telemetry;
 *   4. the three-file chain that makes (2) work still exists: this component
 *      carries `.hud-ghost`, `.hud-ghost` is on `GHOST_SURFACES`, and the
 *      `:is(p, …)` exemption still names `p`. Break any link and the `<p>`
 *      becomes decoration — silently, with every test still green, which is the
 *      exact failure mode `unpanel.test.ts` was written for.
 * =============================================================================
 */

/** `renderToStaticMarkup` emits no hydration comments, but never assume it. */
function markupOf(node: React.ReactElement): string {
  return renderToStaticMarkup(node).replace(/<!--\s*-->/g, "");
}

/**
 * The tag of the element whose text content IS `text` — the question „which
 * face does the UNPANEL layer set this string in", answered structurally.
 *
 * A raw-markup scan rather than a DOM query because this suite runs in
 * `environment: "node"` (vitest.config.ts) and `FaultCard`'s tests already
 * establish `react-dom/server` as the way component output is asserted here.
 */
function tagHolding(markup: string, text: string): string | null {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/gu, (c) => `\\${c}`);
  return new RegExp(`<([a-z0-9]+)[^>]*>${escaped}</\\1>`, "iu").exec(markup)?.[1] ?? null;
}

const STEADY = markupOf(
  <ObjectiveBanner
    titleBg="Приближи кръстовището овладяно, готов за завой"
    index={1}
    total={3}
    progress={0.4}
    flash={null}
  />,
);

const FLASHING = markupOf(
  <ObjectiveBanner
    titleBg="Спри плавно преди линията"
    index={2}
    total={3}
    progress={null}
    flash={{ titleBg: "Приближи кръстовището овладяно, готов за завой", key: 1 }}
  />,
);

/**
 * The banner exactly as it shipped until 2026-08-17, pasted rather than
 * described. Every assertion below is run against it too — a guard that cannot
 * be shown to fail on the behaviour it replaced is the green-assertion-as-
 * evidence this whole suite exists to end (`hud-card-fit.test.ts`'s „the
 * detector has teeth").
 */
const AS_SHIPPED_BEFORE =
  '<div role="status" class="hud-ghost hud-banner-in pointer-events-none flex w-full min-w-0 flex-col gap-1 px-1 py-0.5 select-none">' +
  '<span class="text-[10px] font-black uppercase tracking-wider text-accent">Задача 1/3</span>' +
  '<span class="break-words text-[11px] font-bold leading-tight text-foreground">' +
  "Приближи кръстовището овладяно, готов за завой</span></div>";

describe("the objective banner is a NAMED surface", () => {
  it("carries data-hud on the steady branch, so a census can see it", () => {
    expect(STEADY).toContain('data-hud="objective-banner"');
  });

  it("…and on the completion-flash branch, which is the same surface", () => {
    // A panel that renames itself for 1.6 s every time an objective completes
    // would drop out of any census taken in that window — and a completion is
    // exactly when a sweep tends to photograph.
    expect(FLASHING).toContain('data-hud="objective-banner"');
  });

  it("the detector has teeth: the shape that shipped before carries no name", () => {
    expect(AS_SHIPPED_BEFORE).not.toContain("data-hud");
  });

  it("is not accidentally sharing a name with another surface", () => {
    // `objective-banner` must be new vocabulary; if it collided with an existing
    // `data-hud` the PlayAreaStyles rules for that surface would silently start
    // applying here.
    expect(UNPANEL_CSS).not.toContain('data-hud="objective-banner"');
    expect(GHOST_SURFACES).not.toContain('[data-hud="objective-banner"]');
  });
});

describe("the authored instruction is prose; the counter is telemetry", () => {
  const TITLE = "Приближи кръстовището овладяно, готов за завой";

  it("prints the objective title inside a <p>", () => {
    expect(tagHolding(STEADY, TITLE)).toBe("p");
  });

  it("prints the completed objective inside a <p> as well", () => {
    expect(tagHolding(FLASHING, TITLE)).toBe("p");
  });

  it("keeps «Задача i/т» a <span> — the other direction", () => {
    // The failure this guards is the over-correction: a pass that turns every
    // string in the HUD into prose loses the telemetry face for the readouts,
    // which is the half of the founder's 2026-08-02 reference that the FIRST
    // unpanel pass got right.
    expect(tagHolding(STEADY, "Задача 1/3")).toBe("span");
  });

  it("the detector has teeth: the shape that shipped before set the task in mono", () => {
    // `<span>` is outside `:is(p, h1, h2, h3, blockquote)`, so the register's
    // `font-family: var(--font-mono)` reached the sentence.
    expect(tagHolding(AS_SHIPPED_BEFORE, TITLE)).toBe("span");
    expect(tagHolding(AS_SHIPPED_BEFORE, "Задача 1/3")).toBe("span");
  });
});

/**
 * =============================================================================
 * …AND THE FACE IS WORTH NOTHING IF THE GLYPHS HAVE NO GROUND.
 *
 * `sc-junction-blind:a3d5e632`. The row has two clauses and only one of them
 * was repaired: the coach bubble no longer repeats the sentence, and the chip
 * is still transparent. Read off
 * `w10-1/frames/sc-junction-blind__pc-right/01-arrival.png` at 2.8×
 * (x 1050-1440 / y 250-380): «ЗАДАЧА 1/2» and «Приближи кръстовището бавно, с
 * готовност за спиране» are white text with NO background, over a pale building
 * facade and a dark green tree crown — white-on-pale then white-on-dark inside
 * ONE line — and over the demonstration picture-in-picture panel behind them.
 * Same shape at `04-t092s.png` (task 2/2, over sky).
 *
 * THE SPLIT THAT MADE IT SURVIVE TEN ROUNDS: on COMPACT there is no banner —
 * `LessonPlayShell` hides this column and the objective travels as the queue's
 * `task` item, which `SimOverlay` has painted on a shaded peek since
 * 2026-08-14. So the same lesson in the same sweep is legible on the phone and
 * not on the laptop, which is how a repair „landed on one platform only".
 *
 * WHAT IS ASSERTED, and why each one is separately breakable:
 *   1. the shade EXISTS on both branches, and is the PUBLISHED gradient rather
 *      than a hand-kept near-copy — the recipe is exported from `SimOverlay`
 *      precisely because two numbers that must agree need something making
 *      them;
 *   2. BOTH halves of it travel. A consumer that takes the background and not
 *      the mask ships a hard 80 %-alpha horizontal edge across the windscreen
 *      — `hud/index.ts` calls publishing one without the other „publishing a
 *      trap";
 *   3. it carries `data-hud-ink`, WITHOUT WHICH IT PAINTS NOTHING. The shade is
 *      a `div` inside a `.hud-ghost`, so the UNPANEL sweep hands it
 *      `background-image: none !important` unless the attribute exempts it.
 *      This is the whole fix, and it is one attribute;
 *   4. the host is `relative isolate`. Without `isolate` a `z-index: -1` child
 *      escapes the stacking context and paints behind the stage — no shade, and
 *      not one pixel of test output changes (measured at bc5a279: 139 tests
 *      green over exactly that); without `relative` it covers its own text.
 * =============================================================================
 */
describe("the objective banner has a ground under it", () => {
  const BACKGROUND = peekScrimBackgroundCss({
    left: OBJECTIVE_SCRIM_FEATHER_PX.left,
    right: OBJECTIVE_SCRIM_FEATHER_PX.right,
  });
  const MASK = peekScrimMaskCss({
    top: OBJECTIVE_SCRIM_FEATHER_PX.top,
    bottom: OBJECTIVE_SCRIM_FEATHER_PX.bottom,
  });

  it("both branches carry a named shade", () => {
    expect(STEADY).toContain('data-hud="objective-banner-scrim"');
    expect(FLASHING).toContain('data-hud="objective-banner-scrim"');
  });

  it("the shade is the PUBLISHED gradient, not a near-copy of it", () => {
    // Compared against the function's own output, so a token edit in
    // `globals.css` or a feather change in `PEEK_SCRIM_FEATHER_PX` re-picks
    // this automatically instead of leaving two numbers to drift.
    expect(STEADY).toContain(`background-image:${BACKGROUND}`);
    expect(FLASHING).toContain(`background-image:${BACKGROUND}`);
  });

  it("…and BOTH halves of the recipe travel — background AND mask", () => {
    for (const markup of [STEADY, FLASHING]) {
      expect(markup).toContain(`-webkit-mask-image:${MASK}`);
      expect(markup).toContain(`mask-image:${MASK}`);
    }
  });

  it("the top feather stays 0, because above this card is the mirror's lane", () => {
    // This banner is the TOP item of the notify column and the column's ceiling
    // sits on `NOTIFY_COLUMN_TOP_CSS_*`, which leaves no slack over the interior
    // mirror. A top ramp here is not „a ramp over the stage's edge", it is shade
    // on the mirror — „the mirror does not move, the HUD does".
    //
    // TAKEN AND NOT RE-DECIDED: this is the ONE side whose reason is about the
    // column rather than about this card's own height, so it is imported from
    // the published constant instead of being re-picked with the other three.
    expect(PEEK_SCRIM_FEATHER_PX.top).toBe(0);
    expect(OBJECTIVE_SCRIM_FEATHER_PX.top).toBe(PEEK_SCRIM_FEATHER_PX.top);
    expect(MASK).toContain("transparent 0px, #000 0px");
  });

  it("the shade carries data-hud-ink — without it the UNPANEL sweep erases it", () => {
    // One attribute IS the fix. `[data-sim-stage] .hud-ghost :is(div, …)
    // :not([data-hud-ink])` sets `background-image: none !important`, so a shade
    // without it is a no-op that changes no test and no type.
    const scrim = STEADY.slice(STEADY.indexOf('data-hud="objective-banner-scrim"'));
    expect(scrim.slice(0, scrim.indexOf(">"))).toContain("data-hud-ink");
    expect(UNPANEL_CSS).toContain(":not([data-hud-ink])");
  });

  it("the host isolates its own stacking context", () => {
    // MUTATION: drop `isolate` from either branch's className and the shade
    // paints behind the stage with every other case here still green — which is
    // the measured shape of the token bc5a279 found guarded by nothing.
    for (const markup of [STEADY, FLASHING]) {
      const host = markup.slice(0, markup.indexOf(">"));
      expect(host).toMatch(/class="[^"]*\brelative\b/);
      expect(host).toMatch(/class="[^"]*\bisolate\b/);
    }
  });

  it("the shade sits BEHIND the words and never eats a click", () => {
    expect(STEADY).toContain("z-index:-1");
    expect(STEADY).toContain("pointer-events:none");
  });

  it("the detector has teeth: the shape that shipped before had no ground at all", () => {
    expect(AS_SHIPPED_BEFORE).not.toContain("objective-banner-scrim");
    expect(AS_SHIPPED_BEFORE).not.toContain("isolate");
    expect(AS_SHIPPED_BEFORE).not.toContain("background-image");
  });

  it("…and it is a shade, not the panel the 2026-08-03 ruling removed", () => {
    // The other direction, and the founder's own note on this card: „an
    // instruction he can read but which hides the hazard it is about is a
    // different failure". The alpha is bounded — a flat 1.0 rectangle would be
    // the plate this register does not have — and the steady branch keeps no
    // border, no radius and no blur of its own.
    expect(BACKGROUND).toContain("0.8");
    expect(BACKGROUND).not.toContain(", 1)");
    const host = STEADY.slice(0, STEADY.indexOf(">"));
    expect(host).not.toMatch(/class="[^"]*\bbackdrop-blur\b/);
    expect(host).not.toMatch(/class="[^"]*\brounded-/);
  });
});

/**
 * =============================================================================
 * …AND A GROUND THAT ONLY THE COUNTER STANDS ON IS NOT A GROUND.
 *
 * THE GATE ABOVE PASSED THE WRONG FIX AND THE RIGHT ONE IDENTICALLY, and that
 * is the finding this block exists for. Every case up there compares an emitted
 * CSS STRING against the function that produced it; not one of them asks WHERE
 * THE BOX IS. Swap the shade's four insets for anything at all and all of them
 * stay green — measured, 25/25, on the day they were written.
 *
 * What the missing half costs, read off `w10-1/frames/
 * sc-ac-crosswind__pc-right/04-t084s.png` cropped (1080, 255, 360 × 110) at 4×,
 * which renders the same steady banner as the `a3d5e632` frames:
 *
 *     «ЗАДАЧА 1/2»        glyphs y 268.75 - 275.0     box top    ~265.0
 *     «Мини отсечката …»  glyphs y 285.0  - 294.5     box bottom ~296.5
 *     the peek's bottom feather of 16 px → the mask fades from y ~280.5
 *
 * The counter got the full 0.8 and the INSTRUCTION — the string both
 * `sc-junction-blind:a3d5e632` and `sc-ac-crosswind:b30bdf77` name — stood in
 * the fade at alpha ~0.33 falling to ~0.13. Sideways the same: text starts at
 * the card's own padding and the flat core started 26 px in.
 *
 * THE INVARIANT, and it is the whole block:
 *
 *     feather[side] <= padding[side]      on every side of BOTH branches
 *
 * `SimOverlay` satisfies it by BLEEDING — four negative insets, each equal to
 * its own feather, „so the ramps live entirely in the overhang". This card
 * cannot: the roomy column is `overflow-hidden` and its cards are `w-full`, so
 * a bled shade is clipped at the card's own box, the ramps never paint, and
 * what is left is a flat 0.8 rectangle with a hard vertical edge on the road
 * side. So the padding IS the overhang here, and it was raised to pay for it.
 *
 * Everything below reads a BOX — the class list the card actually renders, the
 * insets the shade actually mounts on, and the clip in the column's own source.
 * =============================================================================
 */
type Side = "top" | "right" | "bottom" | "left";

const SIDES_OF: Record<string, readonly Side[]> = {
  p: ["top", "right", "bottom", "left"],
  px: ["right", "left"],
  py: ["top", "bottom"],
  pt: ["top"],
  pr: ["right"],
  pb: ["bottom"],
  pl: ["left"],
};

/**
 * The card's padding in px, off the class list it actually rendered.
 *
 * PARSED AND NOT RESTATED. A padding written down twice is a padding that
 * drifts, and this block exists because two numbers that must agree had nothing
 * making them. Tailwind's scale is 0.25 rem a step on this project's default
 * 16 px root, so `px-2` is 8 and `pb-1.5` is 6.
 *
 * The keys are walked in the stylesheet's own order (`p`, `px`, `py`, `pt`,
 * `pr`, `pb`, `pl`) rather than in class-list order, because that is what
 * decides the winner when a shorthand and a per-side utility name the same
 * side — equal specificity, so it is source order in the sheet, not the
 * order somebody typed the classes in.
 */
function paddingPx(className: string): Record<Side, number> {
  const out: Record<Side, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  const tokens = className.split(/\s+/u);
  for (const key of ["p", "px", "py", "pt", "pr", "pb", "pl"]) {
    for (const token of tokens) {
      const m = new RegExp(`^${key}-(\\d+(?:\\.5)?)$`, "u").exec(token);
      if (!m) continue;
      for (const side of SIDES_OF[key]!) out[side] = Number(m[1]) * 4;
    }
  }
  return out;
}

/** The opening tag of the host, i.e. the card's own box. */
function hostClass(markup: string): string {
  return /class="([^"]*)"/u.exec(markup.slice(0, markup.indexOf(">")))?.[1] ?? "";
}

/** The shade's inline style — the four insets and the radius live here. */
function scrimStyle(markup: string): string {
  const at = markup.indexOf('data-hud="objective-banner-scrim"');
  return /style="([^"]*)"/u.exec(markup.slice(at, markup.indexOf(">", at)))?.[1] ?? "";
}

/** Comments removed, so no assertion below can be satisfied by a commented-out line. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

const SHELL_SRC = stripComments(
  readFileSync(
    join(__dirname, "..", "..", "..", "..", "components", "sim", "lesson-ui", "LessonPlayShell.tsx"),
    "utf8",
  ),
);

describe("the shade's ramps live where no glyph stands", () => {
  const BRANCHES: ReadonlyArray<[string, string]> = [
    ["steady", STEADY],
    ["flash", FLASHING],
  ];

  it("every ramp fits inside the card's own padding, on both branches", () => {
    for (const [name, markup] of BRANCHES) {
      const pad = paddingPx(hostClass(markup));
      for (const side of ["top", "right", "bottom", "left"] as const) {
        expect(
          pad[side],
          `${name} branch: the ${side} ramp is ${OBJECTIVE_SCRIM_FEATHER_PX[side]} px and the ` +
            `card pads ${pad[side]} px there, so a line box stands on a partial ground`,
        ).toBeGreaterThanOrEqual(OBJECTIVE_SCRIM_FEATHER_PX[side]);
      }
    }
  });

  it("the detector has teeth: the peek's own feather does NOT fit this card", () => {
    // This is the shape that shipped on the morning of 2026-08-25 — the
    // published gradient with the published 26/16 feather, mounted at
    // `inset: 0` on a 31.5 px card — and it is what put the sentence in the
    // fade. If this case ever goes green, the padding grew enough to take the
    // long ramps and the constant should simply be the published one again.
    const pad = paddingPx(hostClass(STEADY));
    expect(pad.left).toBeLessThan(PEEK_SCRIM_FEATHER_PX.left);
    expect(pad.bottom).toBeLessThan(PEEK_SCRIM_FEATHER_PX.bottom);
  });

  it("…and the shape that shipped before could not have carried these ramps either", () => {
    // `px-1 py-0.5` — 4 px and 2 px. Nothing this file calls a ramp fits in it.
    const pad = paddingPx(hostClass(AS_SHIPPED_BEFORE));
    expect(pad).toEqual({ top: 2, right: 4, bottom: 2, left: 4 });
    expect(pad.left).toBeLessThan(OBJECTIVE_SCRIM_FEATHER_PX.left);
    expect(pad.bottom).toBeLessThan(OBJECTIVE_SCRIM_FEATHER_PX.bottom);
  });

  it("the road side still DISSOLVES — a 0 ramp is the plate, not a shade", () => {
    // The other direction. „feather <= padding" is satisfied trivially by
    // feather 0 on every side, which is a flat 0.8 rectangle with four hard
    // edges: the 2026-08-03 register, bought with the diff that closes this row.
    expect(OBJECTIVE_SCRIM_FEATHER_PX.left).toBeGreaterThan(0);
    expect(OBJECTIVE_SCRIM_FEATHER_PX.right).toBeGreaterThan(0);
    expect(OBJECTIVE_SCRIM_FEATHER_PX.bottom).toBeGreaterThan(0);
  });

  it("the shade takes NO overhang, because the column would clip it", () => {
    // MUTATION: give it SimOverlay's four negative insets and this goes red.
    // Before this case existed the same swap left all 25 assertions green,
    // which is how „measured, gated and reaching nobody" looks one level in.
    for (const [name, markup] of BRANCHES) {
      const style = scrimStyle(markup);
      expect(style, `${name} branch`).toContain("inset:0");
      expect(style, `${name} branch bleeds past a clipping column`).not.toMatch(
        /(?:^|;)\s*(?:top|right|bottom|left):-/u,
      );
    }
  });

  it("…and the premise is read out of the column, not asserted from memory", () => {
    // If this ever goes red the column stopped clipping, and the trade this
    // block records is off: the ramps can go back into an overhang and the
    // padding can go back to `px-1`. Comments are stripped first — a class list
    // quoted in prose is not a class list.
    const at = SHELL_SRC.indexOf('data-hud="notify-column"');
    expect(at, "the roomy column lost its handle — re-anchor this test").toBeGreaterThan(0);
    const classAttr = SHELL_SRC.slice(at, SHELL_SRC.indexOf("style={", at));
    expect(classAttr, "the roomy notify column no longer clips its cards").toContain(
      "overflow-hidden",
    );
  });

  it("the shade takes the card's radius, so it cannot paint square shoulders", () => {
    // The flash card is `rounded-2xl` — 16 px — and 8 px of ramp does not
    // dissolve a 16 px corner. `inherit` is 0 on the steady branch, which has
    // no radius of its own and must not gain one.
    expect(hostClass(FLASHING)).toContain("rounded-2xl");
    for (const [name, markup] of BRANCHES) {
      expect(scrimStyle(markup), `${name} branch`).toContain("border-radius:inherit");
    }
    expect(hostClass(STEADY)).not.toMatch(/\brounded-/u);
  });
});

describe("the three-file chain that makes the <p> mean anything", () => {
  it("the banner is still a ghost surface — the rule is scoped to those", () => {
    expect(STEADY).toContain("hud-ghost");
    expect(FLASHING).toContain("hud-ghost");
    expect(GHOST_SURFACES).toContain(".hud-ghost");
  });

  it("UNPANEL still exempts <p> from the telemetry face", () => {
    // The same assertion `unpanel.test.ts` makes about the toast, restated here
    // because THIS component now depends on it: drop `p` from that selector and
    // the objective goes back to mono with nothing failing.
    expect(UNPANEL_CSS).toMatch(/:is\(p, h1, h2, h3, blockquote\)[\s\S]{0,80}var\(--font-sans\)/);
  });

  it("…and still strips the <p>'s own fill, so it did not become a panel", () => {
    // The sweep's element list has to keep naming `p`, or a `<p>` inside a ghost
    // surface would keep any background it inherits — trading a face problem for
    // the panel the 2026-08-02 pass removed.
    expect(UNPANEL_CSS).toMatch(/:is\(div, span, button, kbd, p, li, a, section\)/);
  });
});

/**
 * =============================================================================
 * WHAT THE TELEMETRY FACE COSTS THE OBJECTIVE, OVER THE WHOLE CATALOGUE.
 *
 * MEASURED, off the shipped frame rather than assumed: on
 * `sc-roundabout-entry/pc-right/04-t141s.png` the 45-character title
 * «Приближи кръстовището овладяно, готов за завой» laid out 307 px in this
 * column — 6.8 px a character in JetBrains Mono at `text-[11px]`. The roomy
 * column is `NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX` wide and the banner spends
 * `px-1` (4 px) a side, so the line budget is 45 characters.
 *
 * `PlayAreaStyles`' own comparison of the two faces in one box is „about 24
 * characters per line [mono] against about 35 in the body face" — 1.46× — which
 * puts the reading face at 65 characters on this line. That ratio is QUOTED, not
 * re-measured here: only the mono figure came off a frame.
 *
 * SWEPT over every objective of every compiled rung of the shipped catalogue,
 * 2026-08-17:
 *
 *     1 563 rung-objectives
 *       684 (43.8 %) longer than the 45-character telemetry line
 *       664 of those fit the 65-character reading line — one line instead of two
 *        20 are long in either face (worst 77 characters) and simply wrap
 * =============================================================================
 */
const MONO_PX_PER_CHAR = 6.8;
const BANNER_SIDE_PADDING_PX = 4;
const SANS_CHARS_PER_MONO_CHAR = 35 / 24;

const CONTENT_PX = NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX - 2 * BANNER_SIDE_PADDING_PX;
const MONO_BUDGET_CHARS = Math.floor(CONTENT_PX / MONO_PX_PER_CHAR);
const SANS_BUDGET_CHARS = Math.floor(MONO_BUDGET_CHARS * SANS_CHARS_PER_MONO_CHAR);

const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4];

/** Every objective title the catalogue actually ships, one entry per rung. */
const TITLES = SCENARIO_TEMPLATES.flatMap((spec) =>
  LEVELS.filter((level) => spec.levels.some((l) => l.level === level)).flatMap((level) =>
    compileScenario(spec, level).objectives.map((o) => ({
      id: `${spec.id}@L${level}/${o.id}`,
      titleBg: o.titleBg,
    })),
  ),
);

describe("the line budget the face change buys back", () => {
  it("states the arithmetic, so the numbers can be re-run rather than trusted", () => {
    expect(CONTENT_PX).toBe(312);
    expect(MONO_BUDGET_CHARS).toBe(45);
    expect(SANS_BUDGET_CHARS).toBe(65);
  });

  it("has a corpus to sweep at all (the selectors.test.mjs lesson)", () => {
    // A sweep over an empty list is the `mustFit` selector that vouched for a
    // screen it had never looked at, for four months.
    expect(TITLES.length).toBeGreaterThan(600);
  });

  it("the catalogue really does overflow a mono line — the change is not cosmetic", () => {
    const overMono = TITLES.filter((t) => t.titleBg.length > MONO_BUDGET_CHARS);
    // MEASURED 2026-08-17 over all 1 563 rung-objectives: 684 (43.8 %). The
    // assertion is a FLOOR and not the count, because titles are authored copy
    // and this must not redden when somebody shortens one; a floor at half the
    // measured value still cannot be satisfied by an empty or broken sweep.
    expect(overMono.length).toBeGreaterThan(300);
  });

  it("…and the reading face is where they come back onto one line", () => {
    // The direction that matters, and the reason the `<p>` is not taste: every
    // title the telemetry face wrapped and the reading face does not.
    // MEASURED: 664 of the 684 recover; the remaining 20 are long in either face
    // (worst 77 characters) and wrap, which is what `break-words` is for.
    const recovered = TITLES.filter(
      (t) => t.titleBg.length > MONO_BUDGET_CHARS && t.titleBg.length <= SANS_BUDGET_CHARS,
    );
    expect(recovered.length).toBeGreaterThan(300);
  });

  it("no title is beyond BOTH budgets without being able to wrap", () => {
    // `break-words` is what keeps a 16-letter Bulgarian compound from being
    // amputated by the column's `overflow-hidden` (hud-card-fit's photograph).
    // A long title is fine; a long title in a box that cannot wrap is not.
    expect(STEADY).toMatch(/class="[^"]*\bbreak-words\b/);
  });
});
