/**
 * The cascade evaluator is an instrument, so it is tested before anything is
 * measured with it (lane «swingcue»): first on synthetic sheets whose answers
 * are the CSS specification's, then on three BASE rule groups whose behaviour
 * the product already relies on — PlayAreaStyles' C1 stand-downs, the chips
 * outranking the audio card, and the landscape car sheet's column yield — read
 * from the rendered 1feba3a stylesheet.
 */
import { describe, expect, it } from "vitest";
import {
  el,
  matches,
  painted,
  parseSheets,
  resolveLengthPx,
  specificityOf,
  winnerFor,
  type El,
  type Env,
} from "./cssCascadeEvaluator";
import { baseRules, buildCell, ITEMS, type CellInput } from "./swingCueCensus";

const LAND: Env = { orientation: "landscape", widthPx: 852, heightPx: 393, reducedMotion: false };
const PORT: Env = { orientation: "portrait", widthPx: 393, heightPx: 852, reducedMotion: false };

function tree(): { html: El; root: El; a: El; b: El } {
  const a = el("div", "a", { "data-hud": "a" }, ["x"]);
  const b = el("div", "b", { "data-hud": "b" });
  const root = el("div", "root", { "data-k": "on" }, [], [], [a, b]);
  const html = el("html", "html", { "data-g": "1" }, [], [], [el("body", "body", {}, [], [], [root])]);
  return { html, root, a, b };
}

describe("the evaluator, on the specification's own answers", () => {
  it("unlayered beats layered for normal declarations, and the reverse for !important", () => {
    const { a } = tree();
    const normal = parseSheets([{ name: "s", css: `@layer utilities { .x { display: flex; } } [data-hud="a"] { display: none; }` }]);
    expect(winnerFor(normal, a, "display", LAND).value).toBe("none");
    const reversed = parseSheets([{ name: "s", css: `[data-k="on"] [data-hud="a"] { display: none !important; } @layer utilities { .x { display: block !important; } }` }]);
    expect(winnerFor(reversed, a, "display", LAND).value).toBe("block");
    // a layered utility loses to an unlayered rule of LOWER specificity
    const low = parseSheets([{ name: "s", css: `@layer utilities { .x.x.x { top: 1px; } } div { top: 2px; }` }]);
    expect(winnerFor(low, a, "top", LAND).value).toBe("2px");
  });

  it("the style attribute beats every selector; a selector !important beats a normal style attribute", () => {
    const a = el("div", "a", { "data-hud": "a" }, [], [{ prop: "top", value: "5px", important: false }]);
    el("div", "p", {}, [], [], [a]);
    expect(winnerFor(parseSheets([{ name: "s", css: `#q, [data-hud="a"][data-hud="a"] { top: 1px; }` }]), a, "top", LAND).value).toBe("5px");
    expect(winnerFor(parseSheets([{ name: "s", css: `[data-hud="a"] { top: 1px !important; }` }]), a, "top", LAND).value).toBe("1px");
  });

  it("specificity, then order", () => {
    expect(specificityOf('html[data-sim-camera="chase"] [data-sim-compact="on"] [data-hud="x"]')).toEqual([0, 3, 1]);
    expect(specificityOf('html[data-sim-camera="chase"] [data-hud="x"]')).toEqual([0, 2, 1]);
    expect(specificityOf('[data-sim-compact="on"] [data-hud="x"]')).toEqual([0, 2, 0]);
    expect(specificityOf(':is(.a, #b) :where(#c) :not(.d, .e) :has(> .f)')).toEqual([1, 2, 0]);
    const { a } = tree();
    const rules = parseSheets([{ name: "s", css: `[data-hud="a"] { top: 1px; } [data-hud="a"] { top: 2px; } div[data-hud="a"] { top: 3px; } [data-hud="a"] { top: 4px; }` }]);
    expect(winnerFor(rules, a, "top", LAND).value).toBe("3px");
  });

  it(":has / :not / :is and the combinators", () => {
    const { html, root, a, b } = tree();
    expect(matches('[data-k="on"]:has([data-hud="b"]) [data-hud="a"]', a)).toBe(true);
    expect(matches('[data-k="on"]:not(:has([data-hud="zz"])) [data-hud="a"]', a)).toBe(true);
    expect(matches('[data-k="on"]:has([data-hud="zz"]) [data-hud="a"]', a)).toBe(false);
    expect(matches('[data-k="on"] > [data-hud="a"]', a)).toBe(true);
    expect(matches('html > [data-hud="a"]', a)).toBe(false);
    expect(matches('[data-hud="a"] + [data-hud="b"]', b)).toBe(true);
    expect(matches('[data-hud="b"] ~ [data-hud="a"]', a)).toBe(false);
    expect(matches(':is(.x, .y)', a)).toBe(true);
    expect(matches('html[data-g="1"] [data-hud="b"]', b)).toBe(true);
    expect(matches(':root', html)).toBe(true);
    expect(matches(':has(> [data-hud="a"])', root)).toBe(true);
    expect(matches('[data-hud="a"]::before', a)).toBe(false);
  });

  it("an undecidable pseudo-class makes a declaration UNRESOLVED, and a refuted one stays refuted", () => {
    const { a } = tree();
    expect(matches('[data-hud="a"]:hover', a)).toBe("unknown");
    expect(matches('button:hover', a)).toBe(false);
    const rules = parseSheets([{ name: "s", css: `[data-hud="a"] { display: block; } [data-hud="a"]:hover { display: none; }` }]);
    const w = winnerFor(rules, a, "display", LAND);
    expect(w.unresolved).toMatch(/undecidable/);
    expect(painted(rules, a, LAND).unresolved.length).toBeGreaterThan(0);
  });

  it("media: orientation and max-height decided, anything else UNRESOLVED; @supports UNRESOLVED", () => {
    const { a } = tree();
    const rules = parseSheets([{ name: "s", css: `@media (orientation: landscape) { [data-hud="a"] { top: 1px; } }` }]);
    expect(winnerFor(rules, a, "top", LAND).value).toBe("1px");
    expect(winnerFor(rules, a, "top", PORT).value).toBeNull();
    const hm = parseSheets([{ name: "s", css: `@media (max-height: 560px) { [data-hud="a"] { top: 1px; } }` }]);
    expect(winnerFor(hm, a, "top", LAND).value).toBe("1px");
    expect(winnerFor(hm, a, "top", PORT).value).toBeNull();
    const odd = parseSheets([{ name: "s", css: `@media (hover: hover) { [data-hud="a"] { top: 1px; } }` }]);
    expect(winnerFor(odd, a, "top", LAND).unresolved).toMatch(/undecidable/);
    const sup = parseSheets([{ name: "s", css: `@supports (height: 1svh) { [data-hud="a"] { top: 1px; } }` }]);
    expect(winnerFor(sup, a, "top", LAND).unresolved).toMatch(/undecidable/);
  });

  it("visibility inherits and display:none on an ancestor hides the subtree", () => {
    const { a } = tree();
    const rules = parseSheets([{ name: "s", css: `[data-k="on"] { visibility: hidden; }` }]);
    expect(painted(rules, a, LAND)).toMatchObject({ visibility: "hidden", drawn: false, displayNone: false });
    const dn = parseSheets([{ name: "s", css: `[data-k="on"] { display: none; }` }]);
    expect(painted(dn, a, LAND)).toMatchObject({ displayNone: true, drawn: false });
  });

  it("a nested block inside a style rule is an error, never a silent skip", () => {
    expect(() => parseSheets([{ name: "s", css: `.a { .b { top: 1px; } }` }])).toThrow(/nested block/);
  });

  it("lengths: calc / max / env / var / % / rem / vw", () => {
    const env = { cbHeightPx: 393, safeTopPx: 0, viewportWidthPx: 852, vars: { "--g": 10 } };
    expect(resolveLengthPx("calc(max(0.5rem, 18.8% + 0.5rem) + env(safe-area-inset-top, 0px))", env)).toBeCloseTo(81.884, 3);
    expect(resolveLengthPx("calc(4rem + var(--sim-mirror-h, 0px))", env)).toBe(64);
    expect(resolveLengthPx("calc(4rem + var(--g, 0px))", env)).toBe(74);
    expect(resolveLengthPx("min(15rem, 36vw)", env)).toBe(240);
  });
});

/* ─────────────────────── the base rules it must reproduce ─────────────────── */

const BASE = baseRules();
const D: CellInput = {
  compact: true,
  active: null,
  shellSheetOpen: false,
  domSheetOpen: false,
  cue: true,
  touchHint: false,
  audioPrompt: true,
  html: {},
};
const hud = (dom: ReturnType<typeof buildCell>, name: string): El =>
  dom.witnesses.find((w) => w.name === name) as El;

describe("the evaluator on BASE (1feba3a) — PlayAreaStyles :1526-1535, :1590-1594, :1672-1676", () => {
  it(":1526-1530 — any active row stands the cue down (display:none), compact only", () => {
    const dom = buildCell({ ...D, active: ITEMS.standby }, "base");
    expect(painted(BASE, dom.cue as El, LAND).displayNone).toBe(true);
    const roomy = buildCell({ ...D, compact: false, active: ITEMS.standby }, "base");
    expect(painted(BASE, roomy.cue as El, LAND).drawn).toBe(true);
  });

  it(":1531-1535 — the touch hint stands the cue down with no row up", () => {
    const dom = buildCell({ ...D, touchHint: true }, "base");
    const w = winnerFor(BASE, dom.cue as El, "display", LAND);
    expect(w.value).toBe("none");
    expect(w.selector).toBe('[data-sim-compact="on"]:has([data-hud="touch-hint"]) [data-hud="wind-swing-cue"]');
  });

  it(":1590-1594 — a mounted cue stands the audio card down, even while the cue itself is hidden", () => {
    const up = buildCell({ ...D }, "base");
    expect(painted(BASE, hud(up, "audio-prompt"), LAND).displayNone).toBe(true);
    const off = buildCell({ ...D, cue: false }, "base");
    expect(painted(BASE, hud(off, "audio-prompt"), LAND).displayNone).toBe(false);
  });

  it(":1672-1676 — sideways, the open car sheet hides the column by VISIBILITY; upright it does not", () => {
    const dom = buildCell({ ...D, active: ITEMS.standby, html: { carSheet: true } }, "base");
    const l = painted(BASE, dom.peek as El, LAND);
    expect(l).toMatchObject({ displayNone: false, visibility: "hidden" });
    const p = painted(BASE, dom.peek as El, PORT);
    expect(p).toMatchObject({ displayNone: false, visibility: "visible", drawn: true });
  });

  it("the cue's base top is Tailwind's top-16 (64 px) in the cockpit and the chase step in chase", () => {
    const dom = buildCell({ ...D }, "base");
    expect(winnerFor(BASE, dom.cue as El, "top", LAND)).toMatchObject({ value: "calc(var(--spacing) * 16)", layer: "utilities" });
    const chase = buildCell({ ...D, html: { camera: "chase" } }, "base");
    expect(winnerFor(BASE, chase.cue as El, "top", LAND).value).toBe("calc(4rem + var(--sim-mirror-h, 0px))");
  });
});
