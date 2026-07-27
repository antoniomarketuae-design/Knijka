import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE TICK BOX — every checkbox and radio in the product, now one component.
 *
 * WHAT WENT WRONG. Eight screens shipped a bare native control with at most
 * `accent-accent` on it. `accent-color` tints only the CHECKED fill; an EMPTY
 * box is painted entirely by the user agent from `color-scheme`, and every one
 * of those eight renders inside `data-surface="cluster"`, which pins that to
 * dark. So the CSS described nothing about the pixels a student actually saw,
 * and what Chromium drew was flat rgb(59,59,59) — 1.66 : 1 against a resting
 * option row. That is why this file's floor is a MEASURED one: token arithmetic
 * would happily "prove" a control the browser was drawing its own way.
 *
 * The numbers were pixel-sampled from headless-Chromium captures at 390 × 844,
 * rendered against the app's own compiled stylesheet inside the real cluster
 * scope, with each site's real container and label classes. The boundary is
 * read as a 360-ray crossing profile out of the box centre — shape-agnostic,
 * and immune to the corner pollution that makes a 2px frame mean lie about a
 * circle. `p10` is the honest number; a `min` just under 3 is one antialiased
 * corner subpixel, which is why the pass rate is 99 % and not 100 %.
 *
 *                        BEFORE  p10  med  >=3:1     AFTER  p10  med  >=3:1
 *   practice radio               2.74 3.59   79 %          3.51 3.51   99 %
 *   practice checkbox            3.18 5.04  100 %          3.51 3.51   99 %
 *   exam radio                   2.84 3.73   79 %          3.65 3.65  100 %
 *   register consent (cb)        3.02 4.25   97 %          3.65 3.65  100 %
 *   checkout consent (cb)        1.68 5.11   87 %          3.56 3.56  100 %
 *   outcome radio                2.66 3.97   78 %          3.56 3.56  100 %
 *   outcome consent (cb)         3.22 5.16  100 %          3.59 3.59  100 %
 *   review correct radio         2.84 3.73   79 %          3.65 3.65  100 %
 *   sim micro-quiz radio         2.74 3.59   79 %          3.51 3.51   99 %
 *   sim session-end (cb)         3.26 5.23  100 %          3.65 3.65  100 %
 *
 *   box fill, unchecked  was  rgb(59,59,59) — 1.66-1.72 : 1 against the row
 *                        now  --background; nothing the UA chose is painted
 *   :focus-visible ring  6.77-7.72 : 1 at all ten, captured with autofocus
 *
 * The RADIO is the case that mattered: a single-choice question mounts one, and
 * single-choice is most of the exam. Chromium gave it a 1px antialiased ring
 * that dropped to 1.73 : 1 on the diagonals — five of the ten sites sat at
 * 78–79 % of their outline. Checkout's 20px checkbox was the other bad one:
 * the UA's 1px border does not thicken with the box, so its p10 fell to 1.68.
 *
 * The four sites that already passed are where this trades headroom: a 1px UA
 * edge at ~5 : 1 becomes a 2px --control-edge at ~3.6 : 1 — roughly 70 painted
 * edge pixels against the old 40, in the product's own token instead of an OS
 * grey the CSS never described, and with an EMPTY state that is finally legible
 * at all. That trade is the point: one control, one number, everywhere.
 *
 * WHY THIS FILE CHANGED SHAPE. It used to pin two duplicated copies (practice
 * and exam) equal to each other. Equality between two copies is a weak thing to
 * guard once there are eight, and it says nothing about the six that never had
 * the fix — so it now guards the SHARED component and the fact that every call
 * site consumes it. There is no copy left to drift.
 *
 * WHAT IT GUARDS, since it cannot run a browser:
 *
 *   1. that the control is OURS — `appearance-none` plus a real border. The
 *      moment that goes, the browser is back to drawing whatever its dark
 *      scheme feels like and the measurement above means nothing.
 *   2. that all eight tick boxes are THIS control. Not "the same string in
 *      eight files" — the same element, imported.
 *   3. that --control-edge still clears 3 : 1 on every ground any call site
 *      paints behind a box — computed from globals.css, over the same sRGB
 *      compositing the browser does. This half IS token arithmetic, and it is
 *      only trustworthy because 1. holds: it describes the boundary only while
 *      the boundary is one we drew. (The composites land within 1/255 of the
 *      captured pixels, which is the check that the model is the browser's.)
 *   4. that it is still a real <input>, and that nothing sets `outline` on it —
 *      the keyboard ring is globals.css's :focus-visible rule, verified on the
 *      same captures at rgb(68,161,244), 6.77 : 1 against the row.
 *   5. that the checked tick survives Tailwind's SCANNER, which is a different
 *      failure mode from the rest of this file: it reads raw source text, so an
 *      unencoded space or quote, or a class split across two concatenated
 *      literals, produces no CSS rule at all — silently, with typecheck and
 *      lint green and only the pixels different.
 *   6. that a call site cannot resize the box by APPENDING a utility. Tailwind
 *      orders by property, not by source position, so `size-5` after a baked-in
 *      `h-4 w-4` is a coin-flip; the component takes size as a slot, and this
 *      pins that nobody routes around it.
 *   7. that the CHECKED state survives FORCED COLORS — see below.
 *
 * ---------------------------------------------------------------------------
 * FORCED COLORS, and why half of this file is about it now.
 *
 * `appearance: none` is what bought every number above. It also opted the
 * control out of the only painting that is forced-colors aware — the user
 * agent's — and nothing replaced it. Captured under
 * `Emulation.setEmulatedMedia` with `forced-colors: active` (the same lever
 * Playwright's `forcedColors` option pulls), on the same ten sites, same
 * harness, same 390 × 844:
 *
 *                          BEFORE  on:off  px≠      AFTER  on:off  px≠
 *   practice radio                 1.00 : 1   0 %         14.37 : 1  78 %
 *   practice checkbox              1.00 : 1   4 %         14.37 : 1  92 %
 *   exam radio                     1.00 : 1   0 %         14.37 : 1  78 %
 *   register consent (cb)          1.00 : 1  21 %         14.37 : 1  94 %
 *   checkout consent (cb)          1.00 : 1   6 %         14.37 : 1  95 %
 *   outcome radio                  1.00 : 1   0 %         14.37 : 1  78 %
 *   outcome consent (cb)           1.00 : 1   4 %         14.37 : 1  92 %
 *   review correct radio           1.00 : 1   2 %         14.37 : 1  78 %
 *   sim micro-quiz radio           1.00 : 1   0 %         14.37 : 1  78 %
 *   sim session-end (cb)           1.00 : 1   4 %         14.37 : 1  92 %
 *
 *   `on:off` is the contrast between the box interior CHECKED and the same box
 *   UNCHECKED; `px≠` is the share of the box's pixels that differ between the
 *   two. All five RADIOS were PIXEL-IDENTICAL checked and unchecked: their only
 *   indicator was `box-shadow: inset …`, which forced colors does not paint,
 *   and both checked:bg-accent and checked:border-accent were rewritten to the
 *   same Canvas/CanvasText pair as an empty box. The checkboxes' 2–6 % is the
 *   data-URI tick, which forced colors leaves alone — so it survived with its
 *   ink frozen near-black, on a Canvas that is black.
 *
 *   Disabled measured 0 % different from live at every site. It is now
 *   38–50 % different (GrayText), and a disabled CHECKED box still stands
 *   13.98 : 1 clear of a disabled unchecked one — which matters because the
 *   practice and micro-quiz runners disable their options the instant an
 *   answer is submitted, with the student still reading what they picked.
 *
 *   Two of those ten are the GDPR consent gate at registration and the 14-day
 *   withdrawal waiver at checkout, and the students are minors (ADR-004).
 *
 * THE NORMAL-MODE NUMBERS DID NOT MOVE, and that is measured too, not argued:
 * the two normal-mode captures — all forty controls, before and after — are
 * pixel-identical, 0 of 1 627 080 pixels different. Everything new lives
 * inside `@media (forced-colors: active)`, plus one `cursor` utility.
 * ---------------------------------------------------------------------------
 */

const SRC = resolve(__dirname, "../..");
const read = (rel: string): string => readFileSync(resolve(SRC, rel), "utf8");

const CONTROL_PATH = "components/ui/CheckControl.tsx";
const CONTROL = read(CONTROL_PATH);
const CSS = read("app/globals.css");

/**
 * Every screen in the product that mounts a tick box. This list IS the claim —
 * a new checkbox anywhere else is caught by the sweep at the bottom of the
 * file, which walks the whole tree rather than trusting this table.
 */
const CALL_SITES = [
  ["practice runner", "components/theory/PracticeSession.tsx"],
  ["exam runner", "components/exam/ExamRunner.tsx"],
  ["register consent", "app/(auth)/auth-fields.tsx"],
  ["checkout consent", "app/(dashboard)/checkout/consent-gate.tsx"],
  ["outcome report", "app/(dashboard)/outcome/outcome-client.tsx"],
  ["question review", "app/(dashboard)/review/ReviewClient.tsx"],
  ["sim micro-quiz", "components/sim/lesson-ui/MicroQuizOverlay.tsx"],
  ["sim session end", "modules/sim/hud/SessionEndScreen.tsx"],
] as const;

// ---------------------------------------------------------------------------
// Pulling the control out of the source
// ---------------------------------------------------------------------------

/** The concatenated string literals of `const <name> = "…" + "…";`. */
function stringConst(src: string, name: string): string {
  const at = src.indexOf(`const ${name} =`);
  if (at === -1) throw new Error(`${name} is not declared`);
  return [...src.slice(at, src.indexOf(";", at)).matchAll(/"([^"]*)"/g)]
    .map((m) => m[1])
    .join("");
}

/** The `radio` / `checkbox` entries of the shape record, `${CONTROL_TICK}` resolved. */
function shapes(src: string): Record<string, string> {
  const at = src.indexOf("const CONTROL_SHAPE");
  if (at === -1) throw new Error("CONTROL_SHAPE is not declared");
  const body = src.slice(at, src.indexOf("};", at));
  const tick = stringConst(src, "CONTROL_TICK");
  const out: Record<string, string> = {};
  for (const [, key, value] of body.matchAll(/(radio|checkbox):\s*[`"]([^`"]*)[`"]/g)) {
    out[key] = value.replace("${CONTROL_TICK}", tick);
  }
  return out;
}

/**
 * Every JSX opening tag in `src`, as {tag, props}.
 *
 * Hand-scanned rather than regexed: a props list routinely contains `>` inside
 * an arrow function (`onChange={(e) => …}`), so the obvious `[^<>]*?` matcher
 * finds NOTHING and every assertion built on it passes by default. That is the
 * same silent-vacuum failure this whole file exists to catch, so the scanner
 * tracks brace depth and quotes and stops at the first `>` outside both.
 */
function jsxElements(src: string): { tag: string; props: string }[] {
  const out: { tag: string; props: string }[] = [];
  for (const m of src.matchAll(/<([A-Za-z][\w.]*)(?=[\s/>])/g)) {
    const start = (m.index ?? 0) + m[0].length;
    let depth = 0;
    let quote: string | null = null;
    let i = start;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote !== null) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push({ tag: m[1], props: src.slice(start, i) });
  }
  return out;
}

/** Those of them that declare a checkbox/radio `type`. */
function tickBoxElements(src: string): { tag: string; props: string }[] {
  return jsxElements(src).filter(
    ({ props }) =>
      /type=["'](checkbox|radio)["']/.test(props) ||
      /["'](radio|checkbox)["']\s*:\s*["'](radio|checkbox)["']/.test(props),
  );
}

// ---------------------------------------------------------------------------
// WCAG 2.1, re-implemented rather than imported (same reasoning as
// clusterScope.test.ts: borrowing the arithmetic from the code under test only
// proves the two agree with each other).
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

/** sRGB compositing of `fg` at `alpha` over `bg` — what a Tailwind `/10` paints. */
function over(fg: string, bg: string, alpha: number): string {
  const f = Number.parseInt(fg.slice(1), 16);
  const b = Number.parseInt(bg.slice(1), 16);
  const mix = (shift: number) =>
    Math.round(((f >> shift) & 0xff) * alpha + ((b >> shift) & 0xff) * (1 - alpha))
      .toString(16)
      .padStart(2, "0");
  return `#${mix(16)}${mix(8)}${mix(0)}`;
}

/** The cluster block's `--name: #rrggbb` declarations. */
const CLUSTER: Record<string, string> = (() => {
  const at = CSS.indexOf('\n[data-surface="cluster"],');
  const body = CSS.slice(CSS.indexOf("{", at) + 1, CSS.indexOf("\n}", at));
  const out: Record<string, string> = {};
  for (const [, name, hex] of body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[name] = hex.toLowerCase();
  }
  return out;
})();

/** WCAG 1.4.11: the boundary that identifies an active control. */
const AA_NON_TEXT = 3;

// ---------------------------------------------------------------------------
// The forced-colors block, pulled out of globals.css by balanced braces
// ---------------------------------------------------------------------------

/** Comments are prose, and prose is not a declaration. */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The `@media (forced-colors: active)` rule: where it spans, and its body. */
const FORCED = (() => {
  const at = CSS.indexOf("@media (forced-colors: active)");
  if (at === -1) throw new Error("globals.css declares no forced-colors block");
  const open = CSS.indexOf("{", at);
  let depth = 0;
  let i = open;
  for (; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}" && --depth === 0) break;
  }
  return { at, end: i + 1, body: stripComments(CSS.slice(open + 1, i)) };
})();

/**
 * The declarations of one selector inside that block. Exact-matched on the
 * selector text: a substring match would let `.check-control` swallow
 * `.check-control:checked` and every assertion below would read the wrong rule.
 */
function forcedRule(selector: string): string {
  const rules = [...FORCED.body.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const hit = rules.find(([, sel]) => sel.trim() === selector);
  if (hit === undefined) {
    throw new Error(
      `no \`${selector}\` rule in the forced-colors block; it has: ` +
        rules.map(([, s]) => s.trim()).join(" | "),
    );
  }
  return hit[2];
}

/** The used value of one property in that rule, or undefined. */
function forcedValue(selector: string, property: string): string | undefined {
  const m = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(
    forcedRule(selector),
  );
  return m?.[1].trim();
}

// ---------------------------------------------------------------------------

describe("the tick box is ours, not the browser's", () => {
  it("the control is drawn by CSS", () => {
    const box = stringConst(CONTROL, "CONTROL_BOX");
    // Without appearance-none the UA repaints the whole thing from
    // color-scheme and every number in this file's header stops describing
    // the screen. This is the assertion the bug would have failed.
    expect(box).toContain("appearance-none");
    expect(box).toContain("border-2");
    expect(box).toContain("border-control-edge");
  });

  it("checked state is unmistakable", () => {
    const box = stringConst(CONTROL, "CONTROL_BOX");
    expect(box).toContain("checked:border-accent");
    expect(box).toContain("checked:bg-accent");
  });

  it("arity is still carried by the shape", () => {
    const shape = shapes(CONTROL);
    // A circle promises "one of these" and a square "as many as apply". A
    // restyle that made both the same shape would lose information the
    // question type is the only other source of.
    expect(shape.radio).toContain("rounded-full");
    expect(shape.checkbox).not.toContain("rounded-full");
    // The inset ring is what keeps a checked circle a dot rather than a disc.
    expect(shape.radio).toContain("checked:shadow-[inset_0_0_0_3px_var(--background)]");
  });

  it("a ticked checkbox still shows a tick", () => {
    // The UA drew one; dropping it to a bare accent square would have traded
    // the quiet EMPTY state for a quiet FULL one, on the question type that
    // most needs the difference („Избери всички верни отговори").
    const tick = stringConst(CONTROL, "CONTROL_TICK");
    expect(tick).toContain("checked:bg-[url(data:image/svg+xml,");
    // Tailwind's candidate scanner ends a class at the first quote or space,
    // so a conventionally written url('… … …') compiles to NO RULE AT ALL —
    // silently, and invisibly to typecheck. Percent-encoding both is the only
    // thing keeping this class from being decorative.
    const payload = /url\(([^)]*)\)/.exec(tick)?.[1] ?? "";
    expect(payload).not.toMatch(/['" ]/);
    // Same trap, other end: the scanner reads TEXT, so a candidate broken
    // across two concatenated literals is an unclosed bracket it discards. The
    // tick then compiles to nothing while typecheck and lint stay green, which
    // is why this asserts the utility survives CONTIGUOUSLY in the source.
    const utility = tick.split(" ").find((c) => c.includes("url(")) ?? "";
    expect(CONTROL).toContain(utility);
    // --accent-foreground, the ink this palette pairs with an accent fill.
    expect(tick).toContain(CLUSTER["--accent-foreground"].replace("#", "%23"));
    expect(shapes(CONTROL).checkbox).toContain(tick);
    expect(shapes(CONTROL).radio).not.toContain("url(");
  });

  it("the size the measurements were taken at is the default", () => {
    // 16px. Every ratio in this file's header was read off a box this size;
    // a silent change to the default would leave them describing nothing.
    expect(stringConst(CONTROL, "CONTROL_SIZE")).toBe("h-4 w-4");
    // …and it must not ALSO be baked into the box class, or the `size` slot
    // becomes an append and Tailwind's property ordering decides the winner.
    expect(stringConst(CONTROL, "CONTROL_BOX")).not.toMatch(/\b[hw]-4\b/);
  });
});

describe("every tick box in the product is this one", () => {
  it.each(CALL_SITES)("%s imports the shared control", (_name, path) => {
    expect(read(path)).toContain('from "@/components/ui/CheckControl"');
  });

  it.each(CALL_SITES)("%s has no accent-color left to mislead anyone", (_name, path) => {
    // `accent-accent` (and the `accent-[var(--accent)]` spelling checkout used)
    // colours only the checked fill. Leaving either beside a hand-drawn box
    // would read as if it were doing the work.
    expect(read(path)).not.toMatch(/\baccent-(accent\b|\[var\(--accent\)\])/);
  });

  it.each(CALL_SITES)("%s mounts no bare <input> tick box", (_name, path) => {
    const src = read(path);
    const boxes = tickBoxElements(src);
    // Vacuity guard: a matcher that silently stopped matching would make this
    // whole describe block pass by finding nothing, which is exactly the shape
    // of failure the original bug had.
    expect(boxes.length, `${path} declares no tick box at all`).toBeGreaterThan(0);
    for (const { tag, props } of boxes) {
      // The sign-picture grid is the one deliberate exception: THEO-1 makes the
      // whole picture tile the label, so its control is sr-only. Styling that
      // one would put a stray square in the middle of a sign grid.
      if (props.includes('className="sr-only"')) {
        expect(tag).toBe("input");
        continue;
      }
      expect(tag, `${path} still renders a bare <${tag}> tick box`).toBe(
        "CheckControl",
      );
    }
  });

  it.each(CALL_SITES)("%s does not resize the box by appending", (_name, path) => {
    // Tailwind orders utilities by property, not by source position, so a size
    // utility appended in `className` may or may not beat the component's own.
    // The `size` prop is the slot; this pins that nobody routes around it.
    const src = read(path);
    for (const { tag, props } of tickBoxElements(src)) {
      if (tag !== "CheckControl") continue;
      const className = /className="([^"]*)"/.exec(props)?.[1] ?? "";
      expect(
        className,
        `${path} sizes a CheckControl through className instead of size=`,
      ).not.toMatch(/(^|\s)(size-|[hw]-)/);
    }
  });

  it("the sign-picture grid keeps its visually-hidden control", () => {
    // Guarded from the other side too, so a well-meaning sweep that replaced
    // every input in the practice runner would fail here rather than ship.
    expect(read("components/theory/PracticeSession.tsx")).toContain(
      'className="sr-only"',
    );
  });

  it("and there is no ninth one hiding anywhere in src/", () => {
    // The table above is a claim about today; this is the claim that survives
    // tomorrow. The original bug was not that eight boxes were wrong — it was
    // that nobody knew there were eight. A new bare <input type="checkbox">
    // anywhere in the tree lands here, in the file that explains why it is a
    // problem, instead of on a student's screen at 1.66 : 1.
    const listed = new Set<string>(CALL_SITES.map(([, path]) => path));
    const strays: string[] = [];

    for (const file of readdirSync(SRC, { recursive: true, encoding: "utf8" })) {
      if (!file.endsWith(".tsx")) continue;
      const path = file.split("\\").join("/");
      if (path === CONTROL_PATH) continue;
      const src = readFileSync(resolve(SRC, file), "utf8");
      for (const { tag, props } of tickBoxElements(src)) {
        if (tag === "CheckControl") continue;
        if (props.includes('className="sr-only"')) continue;
        strays.push(`${path} <${tag}>`);
      }
      if (!listed.has(path) && src.includes("CheckControl")) {
        strays.push(`${path} uses CheckControl but is not in CALL_SITES`);
      }
    }

    expect(strays, "add it to CALL_SITES, or give it the shared control").toEqual([]);
  });

  it("the sweep is actually walking the tree it claims to", () => {
    // A green sweep over an empty directory is the failure mode that would
    // make everything above decorative, so the walk is proved to reach the
    // deepest call site in the table before its silence is trusted.
    const tsx = [...readdirSync(SRC, { recursive: true, encoding: "utf8" })]
      .map((f) => f.split("\\").join("/"))
      .filter((f) => f.endsWith(".tsx"));
    expect(tsx).toContain("app/(dashboard)/checkout/consent-gate.tsx");
    expect(tsx.length).toBeGreaterThan(100);
  });
});

describe("it is still a real form control", () => {
  it("renders an <input>, not a div", () => {
    // Keyboard focus, Space to toggle, arrow-key traversal inside a radio
    // group and the announced role/checked state are all the browser's, and
    // all of them are lost the moment this becomes a styled div.
    expect(CONTROL).toMatch(/<input\b/);
    expect(CONTROL).not.toMatch(/<div\b/);
    // `type` is the component's own prop, not something a spread can clobber:
    // {...rest} first, then type — a caller cannot turn this into a text field.
    expect(CONTROL).toMatch(/\{\.\.\.rest\}\s+type=\{type\}/);
  });

  it("takes the caller's a11y wiring rather than swallowing it", () => {
    // aria-invalid / aria-describedby / disabled / name / value all arrive
    // through the spread. If the props type stopped extending the input's, the
    // register form's error wiring would vanish with typecheck still green.
    expect(CONTROL).toContain('ComponentPropsWithoutRef<"input">');
  });

  it("leaves the focus ring to globals.css", () => {
    // globals.css paints `:focus-visible { outline: 2px solid var(--accent) }`
    // for every control in the app. A local outline utility here would either
    // duplicate it or, worse, win and be quieter.
    expect(stringConst(CONTROL, "CONTROL_BOX")).not.toMatch(/\boutline/);
    expect(CSS).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
  });
});

describe("checked is still checked under forced colors", () => {
  /**
   * The properties forced colors REWRITES, and which therefore still say
   * something once the OS palette takes over. Everything the control used to
   * rely on is outside this set: `box-shadow` is not painted at all in this
   * mode, and `background-image` is deliberately left alone — which is how a
   * tick with #04070e baked into its data URI ended up invisible on a black
   * Canvas. These four are the whole vocabulary available here.
   */
  const FORCED_SAFE = ["background-color", "border-color", "outline-color", "color"];

  it("the component carries the hook the block styles", () => {
    // Without this class the whole block below is dead CSS, silently — every
    // rule in it would still parse, still compile, and match nothing.
    expect(stringConst(CONTROL, "CONTROL_BOX")).toContain("check-control");
    expect(FORCED.body.length).toBeGreaterThan(200);
    expect(FORCED.body).toContain(".check-control");
  });

  it("the block is UNLAYERED, or Tailwind's utilities beat it", () => {
    // This is the silent one. `checked:bg-accent` is a `@layer utilities`
    // rule, and utilities outrank components — so the identical block written
    // one indent deeper, inside `@layer components`, would lose the checked
    // state back to the accent fill and forced colors would repaint it to
    // Canvas again, exactly as before. Unlayered beats every layer.
    const layers = [...CSS.matchAll(/@layer\s+[a-z-]+\s*\{/g)];
    // The claim below only holds while there is one layer block to be outside
    // of; a second one added later must be checked too.
    expect(layers.length).toBe(1);
    const layerAt = layers[0].index ?? 0;
    let depth = 0;
    let end = CSS.indexOf("{", layerAt);
    for (let i = end; i < CSS.length; i++) {
      if (CSS[i] === "{") depth++;
      else if (CSS[i] === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    expect(FORCED.at > layerAt && FORCED.at < end).toBe(false);
  });

  it("the control takes the palette instead of being repainted by it", () => {
    // forced-color-adjust: none is what makes every declaration below a USED
    // value. Without it the UA overwrites background-color and border-color
    // with the same Canvas/CanvasText pair for both states — which is the
    // defect, restated.
    expect(forcedValue(".check-control", "forced-color-adjust")).toBe("none");
    // …and taking the palette only stays honest while the values ARE the
    // palette. A literal colour here would hard-code one OS theme's idea of
    // contrast into a mode whose entire point is that the user chose it.
    for (const [selector, property] of [
      [".check-control", "background-color"],
      [".check-control", "border-color"],
      [".check-control:checked", "background-color"],
      [".check-control:checked", "border-color"],
      [".check-control:disabled", "border-color"],
      [".check-control:disabled:checked", "background-color"],
      [".check-control:focus-visible", "outline-color"],
    ] as const) {
      expect(
        forcedValue(selector, property),
        `${selector} { ${property} } must be a system colour`,
      ).toMatch(/^(Canvas|CanvasText|Highlight|HighlightText|GrayText|ButtonBorder)$/);
    }
  });

  it("CHECKED differs from UNCHECKED in a property forced colors paints", () => {
    // THE assertion of this describe block, and the one the bug would have
    // failed: the checked and unchecked boxes must not resolve to the same
    // system colour. Captured, the difference is 14.37 : 1 and 78-95 % of the
    // box's pixels; here it is the fact that makes those numbers possible.
    const differs = FORCED_SAFE.filter(
      (property) =>
        forcedValue(".check-control", property) !== undefined &&
        forcedValue(".check-control:checked", property) !== undefined &&
        forcedValue(".check-control", property) !==
          forcedValue(".check-control:checked", property),
    );
    expect(
      differs,
      "checked and unchecked resolve to the same forced colours — a ticked " +
        "consent box would look untouched",
    ).toContain("background-color");
    // Specifically the OS's own selected pair, which is what a native control
    // uses and the only pair the palette PROMISES contrasts with itself.
    expect(forcedValue(".check-control", "background-color")).toBe("Canvas");
    expect(forcedValue(".check-control:checked", "background-color")).toBe("Highlight");
  });

  it("nothing here leans on box-shadow or background-image again", () => {
    // Both were tried by the code this replaces, and both failed in this mode:
    // one is not painted, the other cannot be recoloured. Neutralising them
    // explicitly is what stops the checked state quietly depending on either.
    expect(forcedValue(".check-control", "box-shadow")).toBe("none");
    expect(forcedValue(".check-control", "background-image")).toBe("none");
    for (const rule of [".check-control:checked", ".check-control:disabled:checked"]) {
      expect(forcedRule(rule)).not.toMatch(/box-shadow|background-image/);
    }
  });

  it("the mark is a real generated box, and arity still reads", () => {
    // A ::before with no `content` renders nothing, so a ticked box would go
    // back to being a flat fill and a radio to a flat disc.
    expect(forcedValue(".check-control:checked::before", "content")).toBe('""');
    expect(forcedValue(".check-control:checked::before", "display")).toBe("block");
    // Circle means "one of these", square means "as many as apply" — the same
    // split CONTROL_SHAPE draws in normal mode has to survive the repaint.
    const tick = forcedRule('.check-control[type="checkbox"]:checked::before');
    const dot = forcedRule('.check-control[type="radio"]:checked::before');
    expect(tick).toContain("border-top-width: 0");
    expect(tick).toContain("rotate(");
    expect(tick).not.toContain("border-radius");
    expect(dot).toContain("border-radius: 50%");
    expect(dot).not.toContain("rotate(");
    // The ink is the palette's partner to the fill, never a literal.
    expect(tick).toContain("HighlightText");
    expect(dot).toContain("HighlightText");
  });

  it("disabled says so, and a disabled tick is still a tick", () => {
    // GrayText is the palette's one "not for you" colour. The pair below is
    // the part that is easy to lose: the practice and micro-quiz runners
    // disable every option the moment an answer is submitted, so if disabled
    // flattened both states the student could no longer see what they chose.
    expect(forcedValue(".check-control:disabled", "border-color")).toBe("GrayText");
    expect(forcedValue(".check-control:disabled:checked", "background-color")).toBe(
      "GrayText",
    );
    expect(forcedValue(".check-control:disabled", "background-color")).toBeUndefined();
    // …so disabled-unchecked keeps the base Canvas fill and disabled-checked
    // does not: 13.98 : 1 apart on the capture.
    expect(forcedValue(".check-control", "background-color")).toBe("Canvas");
    // The mark stays legible on the grey fill rather than staying HighlightText.
    expect(
      forcedRule('.check-control[type="checkbox"]:disabled:checked::before'),
    ).toContain("Canvas");
    expect(
      forcedRule('.check-control[type="radio"]:disabled:checked::before'),
    ).toContain("Canvas");
  });

  it("the keyboard ring comes back to the palette", () => {
    // forced-color-adjust: none also stops the ring being rewritten, and
    // globals.css paints it in --accent — an app colour, in the one mode
    // whose whole point is that the user picked the colours.
    expect(forcedValue(".check-control:focus-visible", "outline-color")).toBe(
      "Highlight",
    );
  });

  it("normal mode is not touched by any of it", () => {
    // Everything above is inside the media query, and the ONE thing added
    // outside it paints no pixels: the two normal-mode captures, all forty
    // controls, came back pixel-identical (0 of 1 627 080).
    const outside = stripComments(CSS.slice(0, FORCED.at) + CSS.slice(FORCED.end));
    expect(outside).not.toContain(".check-control");
    expect(stringConst(CONTROL, "CONTROL_BOX")).toContain("disabled:cursor-not-allowed");
    // A dimmed disabled box is the tempting version of finding 3 and it is
    // wrong here: the only disabled tick boxes in the product are answered
    // practice / micro-quiz options, whose border is one of the boundaries
    // measured at 3.51 : 1 — `.field`'s opacity: .55 would put it under 3.
    expect(stringConst(CONTROL, "CONTROL_BOX")).not.toMatch(
      /disabled:(opacity|border-|bg-|text-)/,
    );
  });
});

describe("the boundary clears WCAG 1.4.11 on every ground a call site paints", () => {
  /**
   * What sits DIRECTLY behind a box at each site. Every one of them is a
   * Tailwind opacity modifier composited over the card, and the card is
   * --surface. [label, tint token, alpha] — alpha 1 means the tint is flat.
   *
   * Every site is inside `data-surface="cluster"`: the (dashboard) shell sets
   * it, and (auth) sets it on its own <main>, so one palette covers all eight.
   */
  const GROUNDS = [
    // PracticeSession
    ["practice resting", "--surface-2", 0.5],
    ["practice hover", "--surface-2", 1],
    ["practice correct (answered)", "--success", 0.1],
    ["practice wrong pick (answered)", "--danger", 0.1],
    // ExamRunner rests straight on the card, and hovers to --surface-2.
    ["exam resting", "--surface", 1],
    ["exam hover", "--surface-2", 1],
    // Register consent — the Panel's opaque surface, no tint.
    ["register consent", "--surface", 1],
    // Checkout consent rows, inside the .card on /checkout.
    ["checkout consent row", "--surface-2", 0.4],
    // Outcome: the radio pills and the consent row use different tints.
    ["outcome radio pill", "--surface-2", 0.4],
    ["outcome consent row", "--surface-2", 0.3],
    // The review editor's option chip is flat --surface.
    ["review option chip", "--surface", 1],
    // Micro-quiz option rows, and their answered states.
    ["micro-quiz resting", "--surface-2", 0.6],
    ["micro-quiz correct", "--success", 0.1],
    ["micro-quiz wrong pick", "--danger", 0.1],
    // Session-end map toggle sits on the bare card.
    ["session-end map toggle", "--surface", 1],
  ] as const;

  it.each(GROUNDS)("%s", (_label, tint, alpha) => {
    const ground = over(CLUSTER[tint], CLUSTER["--surface"], alpha);
    expect(ratio(CLUSTER["--control-edge"], ground)).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
  });

  it("the model agrees with the pixels it claims to describe", () => {
    // The captured resting row was rgb(14,19,29); if this composite ever stops
    // reproducing it, the ratios above are describing a page nobody renders.
    expect(over(CLUSTER["--surface-2"], CLUSTER["--surface"], 0.5)).toBe("#0e131d");
  });

  it("a SELECTED row is carried by the accent fill, not by the edge", () => {
    // Once checked, the box is solid --accent and the edge stops being the
    // boundary — measured at 6.80 : 1 on the capture. Worth pinning: a future
    // "let's tone the accent down" would fail here rather than in a screenshot.
    const selected = over(CLUSTER["--accent"], CLUSTER["--surface"], 0.1);
    expect(ratio(CLUSTER["--accent"], selected)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("the tick reads against the fill it is drawn on", () => {
    // The tick's ink is baked into a data URI, which cannot read a custom
    // property — so it is --accent-foreground frozen as a literal. If the
    // accent ever moves far enough that the frozen ink stops clearing 3 : 1,
    // this fails instead of the tick quietly disappearing into the fill.
    const ink = `#${/%23([0-9a-f]{6})/.exec(stringConst(CONTROL, "CONTROL_TICK"))?.[1]}`;
    expect(ink).toBe(CLUSTER["--accent-foreground"]);
    expect(ratio(ink, CLUSTER["--accent"])).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});
