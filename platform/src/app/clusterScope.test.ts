import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The cluster scope, as numbers — so "carry the futuristic look past the login"
 * is a test rather than a screenshot somebody once took.
 *
 * Two things are guarded here, and they fail for different reasons.
 *
 * 1. THE SCOPE IS APPLIED. `data-surface="cluster"` on the (dashboard) layout
 *    is the entire mechanism by which ~90% of the product's surface area gets
 *    the instrument identity — and it is one attribute, on a file whose job
 *    looks like "render a sidebar". A refactor that rebuilds the shell and
 *    forgets it does not break a single test, does not fail typecheck, and
 *    silently hands every light-mode student the pale SaaS dashboard back.
 *    That is precisely the class of regression a comment cannot stop.
 *
 * 2. THE PALETTE STILL READS. Before this change the cluster tokens dressed a
 *    landing page and four auth screens — surfaces made of headlines, where a
 *    retune that cost a point of contrast would be a cosmetic call. They now
 *    carry the theory reader, the exam runner and every verdict surface. So
 *    the ratios stop being documentation and become a floor, and the floor has
 *    to be computed from the CSS that actually ships, not transcribed beside
 *    it (docs/platform/83 §3 measured them once; a copy is a thing that
 *    drifts).
 *
 * The WCAG maths below is deliberately re-implemented rather than imported
 * from components/marketing/hero/heroContrast.ts. Two reasons: that barrel
 * declares that nothing behind the login may import from it, and a contrast
 * test that borrows its arithmetic from the code under test only proves the
 * two agree with each other.
 */

const CSS = readFileSync(resolve(__dirname, "globals.css"), "utf8");
const DASHBOARD_LAYOUT = readFileSync(
  resolve(__dirname, "(dashboard)/layout.tsx"),
  "utf8",
);
const MARKETING_LAYOUT = readFileSync(
  resolve(__dirname, "(marketing)/layout.tsx"),
  "utf8",
);
const AUTH_LAYOUT = readFileSync(resolve(__dirname, "(auth)/layout.tsx"), "utf8");

// ---------------------------------------------------------------------------
// Reading the tokens out of the stylesheet
// ---------------------------------------------------------------------------

/**
 * The declaration body of the rule whose selector list starts at `anchor`.
 *
 * `anchor` is matched at the start of a line so a mention of the same selector
 * inside a comment (the CLUSTER block explains `:root:has(...)` in prose before
 * it uses it) cannot be mistaken for the rule itself.
 */
function ruleBody(anchor: string): string {
  const at = CSS.indexOf(`\n${anchor}`);
  if (at === -1) throw new Error(`no rule found for selector ${anchor}`);
  const open = CSS.indexOf("{", at);
  const close = CSS.indexOf("\n}", open);
  return CSS.slice(open + 1, close);
}

/** Every `--name: #rrggbb` in a rule body, lowercased. */
function tokens(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, hex] of body.matchAll(
    /(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g,
  )) {
    out[name] = hex.toLowerCase();
  }
  return out;
}

const CLUSTER_RULE = ruleBody('[data-surface="cluster"],');
const CLUSTER = tokens(CLUSTER_RULE);
const APP_LIGHT = tokens(ruleBody(':root[data-theme="light"] {'));

/** The cluster rule's selector list, i.e. everything before its `{`. */
const CLUSTER_SELECTORS = (() => {
  const at = CSS.indexOf('\n[data-surface="cluster"],');
  return CSS.slice(at, CSS.indexOf("{", at));
})();

/** The declaration body of the bare `html { … }` rule. */
const ROOT_RULE = ruleBody("html {");

// ---------------------------------------------------------------------------
// WCAG 2.x
// ---------------------------------------------------------------------------

function channel(byte: number): number {
  const s = byte / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `color-mix`-free srgb compositing of `fg` at `alpha` over `bg` — what a
 * Tailwind `/10` opacity modifier actually paints. Browsers composite these in
 * sRGB space, so this is the browser's arithmetic rather than a model of it.
 */
function over(fg: string, bg: string, alpha: number): string {
  const f = Number.parseInt(fg.slice(1), 16);
  const b = Number.parseInt(bg.slice(1), 16);
  const mix = (shift: number) =>
    Math.round((((f >> shift) & 0xff) * alpha + ((b >> shift) & 0xff) * (1 - alpha)))
      .toString(16)
      .padStart(2, "0");
  return `#${mix(16)}${mix(8)}${mix(0)}`;
}

/** WCAG 2.1: 4.5 : 1 for body text, 3 : 1 for large text and UI boundaries. */
const AA_BODY = 4.5;
const AA_NON_TEXT = 3;

// ---------------------------------------------------------------------------

describe("cluster scope — application", () => {
  it("the authenticated shell carries the scope", () => {
    // The founder's whole complaint in one assertion: "dashboard and all the
    // rest are OLD". If this attribute goes, they are old again.
    expect(DASHBOARD_LAYOUT).toContain('data-surface="cluster"');
  });

  it("the public shells still carry it too", () => {
    expect(MARKETING_LAYOUT).toContain('data-surface="cluster"');
    expect(AUTH_LAYOUT).toContain('data-surface="cluster"');
  });

  it("a viewport-owning scope also paints the root", () => {
    // Scrollbars, the overscroll canvas, anything portalled to document.body
    // (Celebration.tsx) and anything reading a token off documentElement
    // (RouteGuidance.tsx) all live outside every scope. Without the root in the
    // selector list they fall back to whatever the OS asked for, which on a
    // light-mode machine means an OS-coloured hole in a black app.
    expect(CLUSTER_RULE.length).toBeGreaterThan(0);
    expect(CLUSTER_SELECTORS).toContain(':root:has([data-surface="cluster"])');
  });

  it("the :has() half is forgiving, so an engine without it loses only that half", () => {
    // A selector list is all-or-nothing: one member the engine cannot parse
    // invalidates the WHOLE rule. Written bare, `:root:has(…)` therefore took
    // `[data-surface="cluster"]` down with it on any engine without `:has()`,
    // and the product fell back to the pale :root light theme this block exists
    // to overrule — the opposite of the graceful degradation the comment beside
    // it promises. `:is()` has a FORGIVING argument list: the unparseable
    // argument is dropped and the other two selectors survive.
    expect(CLUSTER_SELECTORS).toContain(
      ':is(:root:has([data-surface="cluster"]))',
    );
  });

  it("a bounded band never claims the root", () => {
    // /pricing's showroom is a band inside a page it does not own. A dark
    // scrollbar gutter beside a light page is the tell that a band escaped its
    // box — so `cluster-band` must stay out of the :has().
    expect(CSS).not.toContain(':root:has([data-surface="cluster-band"])');
  });

  it("the scope pins colour-scheme so native controls follow", () => {
    expect(CLUSTER_RULE).toContain("color-scheme: dark");
  });
});

describe("the canvas — window minus document", () => {
  /**
   * Founder review, verbatim: „it is going beyond the borders and a black sides
   * start to appear / this is for the whole platform/web page".
   *
   * That region — exposed by a rubber-band bounce, a pinch-zoom-out or a
   * notched phone's letterbox — is painted from the ROOT element's background.
   * The app painted its ground on <body> and on the scope <div>s and left `html`
   * transparent, so the canvas was correct only via the body→canvas propagation
   * rule. Remove just that (measured: `body { background-color: transparent }`,
   * nothing else touched) and the canvas returns rgb(18, 18, 18) — the UA's
   * default under the `color-scheme: dark` this file pins. Near-black bands at
   * the edge of a near-black page.
   *
   * These two lines are the whole fix, they are one deletion away from
   * regressing, and the regression is invisible on a desktop browser — which is
   * exactly the shape of bug a test has to hold.
   */
  it("the root paints the ground, so the canvas cannot be UA black", () => {
    expect(ROOT_RULE).toContain("background-color: var(--background)");
  });

  it("the horizontal axis cannot rubber-band", () => {
    // No route can scroll horizontally (verified at 390×844, 360×780 and
    // 844×390 with isMobile: documentElement.scrollWidth === clientWidth on all
    // of them), so a horizontal bounce shows a gutter and nothing else. The Y
    // axis is deliberately NOT pinned — vertical scrolling is real content.
    expect(ROOT_RULE).toContain("overscroll-behavior-x: none");
    expect(ROOT_RULE).not.toContain("overscroll-behavior-y");
  });

  it("the browser chrome meets the page at the same colour", () => {
    // `theme-color` is the frame the CSS canvas does not reach: Android
    // Chrome's URL bar, iOS Safari's status area. The pre-cluster pair
    // advertised #eef3fb to a light-mode phone — a colour no pinned surface
    // paints — putting a white bar hard against a black page.
    const ROOT_LAYOUT = readFileSync(resolve(__dirname, "layout.tsx"), "utf8");
    const themeColor = /themeColor:\s*("#[0-9a-f]{6}")/i.exec(ROOT_LAYOUT)?.[1];
    expect(themeColor).toBe(`"${CLUSTER["--background"]}"`);
  });
});

describe("cluster scope — contrast (WCAG 2.1 AA)", () => {
  const GROUNDS = ["--background", "--surface", "--surface-2"] as const;
  const INKS = [
    "--foreground",
    "--muted",
    "--accent",
    "--accent-2",
    "--success",
    "--warning",
    "--danger",
    "--flame",
    "--gold",
  ] as const;

  it.each(
    INKS.flatMap((ink) => GROUNDS.map((ground) => [ink, ground] as const)),
  )("%s on %s clears AA body text", (ink, ground) => {
    expect(ratio(CLUSTER[ink], CLUSTER[ground])).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("the primary button's label clears AA on its own fill", () => {
    expect(
      ratio(CLUSTER["--accent-foreground"], CLUSTER["--accent"]),
    ).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("--control-edge clears 1.4.11 on both grounds it outlines", () => {
    // The edge is the only thing that IDENTIFIES a ghost button or a text
    // input; doc 83 introduced the token for exactly this.
    for (const ground of ["--background", "--surface"] as const) {
      expect(
        ratio(CLUSTER["--control-edge"], CLUSTER[ground]),
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});

describe("cluster scope — the theory reader's own grounds", () => {
  /**
   * The practice runner never paints ink on a bare token. Every option row and
   * every why-panel is a Tailwind opacity modifier composited over `--surface`,
   * and those composites are where a dark theme actually fails: `--success` at
   * full strength is a comfortable 11.3 : 1, but „Верен отговор" is drawn on a
   * `success/10` tile, and that tile is lighter than the panel it sits on.
   *
   * This is the measurement that decided the whole lane. In the app's LIGHT
   * theme the same label scores 3.02 : 1 — below AA, on the most load-bearing
   * word in the theory module. Pinning the cluster palette is what fixes it,
   * which is why extending the scope is a correction and not a taste change.
   *
   * Each entry: [what the surface is, tint token, alpha, the inks drawn on it].
   */
  const SURFACES = [
    // PracticeSession option rows, in each of their four states.
    ["resting option", "--surface-2", 0.5, ["--foreground", "--muted"]],
    ["selected option", "--accent", 0.1, ["--foreground", "--accent"]],
    ["correct option", "--success", 0.1, ["--foreground", "--success"]],
    ["wrong option", "--danger", 0.1, ["--foreground", "--danger"]],
    // WhyPanel — the explanation body and its verdict header.
    ["why-panel (correct)", "--success", 0.05, ["--foreground", "--muted", "--success"]],
    ["why-panel (wrong)", "--danger", 0.05, ["--foreground", "--muted", "--danger"]],
  ] as const;

  it.each(
    SURFACES.flatMap(([label, tint, alpha, inks]) =>
      inks.map((ink) => [label, ink, tint, alpha] as const),
    ),
  )("%s: %s clears AA body text", (_label, ink, tint, alpha) => {
    const ground = over(CLUSTER[tint], CLUSTER["--surface"], alpha);
    expect(ratio(CLUSTER[ink], ground)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("a dimmed-out option is still readable, not just legally exempt", () => {
    // After submitting, the options that were neither correct nor picked get
    // `opacity-55`. WCAG 1.4.3 would let that off — they are text in an
    // INACTIVE user interface component, which the success criterion exempts —
    // but a student re-reading the question to work out why they were wrong is
    // reading exactly these rows, so the exemption is legally true and
    // pedagogically useless. `opacity` dims the ink toward its own ground, so
    // the composite is what has to be measured.
    //
    // Cluster 5.49 : 1, app-light 4.08 : 1. Another pair the pinned palette
    // fixes rather than costs.
    const dimmed = over(CLUSTER["--foreground"], CLUSTER["--surface"], 0.55);
    expect(ratio(dimmed, CLUSTER["--surface"])).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe("cluster scope — long-form reading", () => {
  it("body text is no harsher on the pinned dark ground than on the light one", () => {
    // The specific risk flagged for the theory reader: long-form reading is
    // where dark themes fail, and they fail at BOTH ends. Too little contrast
    // is a WCAG failure the block above already catches; too much is halation
    // — pure white on pure black, where the glyph edges bloom and a paragraph
    // becomes tiring long before it becomes illegible.
    //
    // The floor for "too much" is not a number anyone can defend in the
    // abstract, but there is a defensible one here: the theme this scope
    // REPLACES for a light-mode student. If a page of prose is no harsher than
    // it was, pinning has not cost that student any reading comfort — and the
    // assertion holds the ink off #fff and the ground off #000, which is the
    // property that actually prevents halation.
    const cluster = ratio(CLUSTER["--foreground"], CLUSTER["--surface"]);
    const light = ratio(APP_LIGHT["--foreground"], APP_LIGHT["--surface"]);
    expect(cluster).toBeGreaterThanOrEqual(AA_BODY);
    expect(cluster).toBeLessThanOrEqual(light);
  });

  it("neither the reading ink nor its ground is clipped", () => {
    expect(CLUSTER["--foreground"]).not.toBe("#ffffff");
    expect(CLUSTER["--surface"]).not.toBe("#000000");
  });
});
