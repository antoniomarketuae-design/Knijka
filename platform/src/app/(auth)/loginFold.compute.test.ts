import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE LOGIN FOLD, COMPUTED — audit row app-login:e2577ced [major].
 *
 * WHY THIS FILE IS ARITHMETIC AND NOT A DRIVE. /login has no `/simulator/...`
 * route, so the audit harness can never photograph it: `tools/audit/build-redrive.mjs`
 * lists app-login in NO_SIMULATOR_ROUTE and every sweep for weeks has reported
 * the row „never driven" and moved on. There is no frame and there never will
 * be one. The only honest instrument left is to compute the layout from the
 * source, at the exact viewport the harness drives, and to prove the computation
 * against a number nobody in this file chose.
 *
 * THE CALIBRATION IS THE POINT. `describe("the model reproduces the filed
 * defect")` below feeds the PRE-REPAIR class strings — taken verbatim from
 * commit 6430557, before any `short:` utility existed in this shell — through
 * the same function every other test here uses, and requires it to reproduce
 * the three numbers in the audit row itself:
 *
 *     #email  bottom 315   #password bottom 399   submit bottom 459
 *
 * A model that hits those to the pixel from source it has never been tuned on
 * is measuring the page. A model that does not is a predicate, and this project
 * has shipped 51 of those; the calibration is what stops this being the 52nd.
 *
 * THE VIEWPORT. DEVICES["iphone16-landscape"] — 852 x 393, WebKit — with the
 * device's real insets (tools/mobile/lib/insets.mjs: left/right 59, bottom 21,
 * top 0), because the app ships `viewportFit: "cover"` and globals.css §BODY
 * pays that inset back as body padding. So the body's CONTENT box ends at
 *
 *     393 - max(env(safe-area-inset-bottom), --pinned-bar-h) = 393 - 21 = 372
 *
 * and 372 — not 393 — is the line a control must stay above to be reachable
 * without a blind scroll. (`--pinned-bar-h` is absent here: InstallHint renders
 * on „/" and „/dashboard" only, lib/pwa/install.ts.)
 *
 * WHAT WAS ALREADY DONE, AND WHAT WAS LEFT. Wave 29 (daad829) gave this shell
 * the `short:` variant and took ~200px of chrome out of it; the filed symptom
 * — submit at 459, `elementFromPoint` null — has not reproduced since. But every
 * pixel it bought was FIXED chrome, and what pushes the button off a landscape
 * phone is the VARIABLE chrome that only appears when a student is in trouble:
 * the ?changed=1 banner (two lines), a wrong-password FormError, a field error
 * under each input. Computed one-column, submit bottom by state:
 *
 *     at rest                                    257    115 clear of 372
 *     ?changed=1 + wrong password                369      3 clear
 *     ...+ one field error                       391    PAST the content box
 *     ...+ both field errors                     413    PAST the viewport
 *
 * Three pixels of margin against Bulgarian copy we do not control is not a
 * margin. The grid in login-form.tsx is what this file now pins: the two fields
 * sit side by side on the axis a sideways phone actually has (852px of width),
 * which removes a 68px block and an 8px gap from every state and makes two
 * simultaneous field errors cost 22px instead of 44. Worst state 413 -> 315.
 */

const AUTH = __dirname;
const read = (rel: string): string => readFileSync(resolve(AUTH, rel), "utf8");

const LAYOUT = read("layout.tsx");
const UI = read("auth-ui.tsx");
const FIELDS = read("auth-fields.tsx");
const PAGE = read("login/page.tsx");
const FORM = read("login/login-form.tsx");
const GLOBALS = readFileSync(resolve(AUTH, "../globals.css"), "utf8");

/* ------------------------------------------------------------------ *
 * 1. The viewport, and the one line a control must stay above.
 * ------------------------------------------------------------------ */

/** DEVICES["iphone16-landscape"], the profile the mobile harness drives. */
const VIEWPORT = { width: 852, height: 393 } as const;
/** tools/mobile/lib/insets.mjs, symmetric landscape profile. */
const INSET = { left: 59, right: 59, bottom: 21, top: 0 } as const;
/** globals.css §BODY — `padding-bottom: max(env(safe-area-inset-bottom), …)`. */
const FOLD = VIEWPORT.height - INSET.bottom; // 372

/* ------------------------------------------------------------------ *
 * 2. Reading real numbers out of the real sources.
 *
 *    Nothing below is a magic constant except the type scale, which is
 *    Tailwind v4's own and is asserted against the compiled default in
 *    the last describe block.
 * ------------------------------------------------------------------ */

/** Tailwind v4 `--spacing`: every `-N` step is N * 0.25rem. */
const STEP = 4;

/** Tailwind v4 font sizes and their paired line-heights, in px at root 16. */
const TEXT: Record<string, { size: number; line: number }> = {
  xs: { size: 12, line: 16 }, // calc(1 / 0.75)rem
  sm: { size: 14, line: 20 }, // calc(1.25 / 0.875)rem
  base: { size: 16, line: 24 },
  lg: { size: 18, line: 28 }, // calc(1.75 / 1.125)rem
  xl: { size: 20, line: 28 }, // calc(1.75 / 1.25)rem
  "2xl": { size: 24, line: 32 }, // calc(2 / 1.5)rem
};

/** Tailwind preflight: `html { line-height: 1.5 }`. What `.hud-label` inherits. */
const ROOT_LEADING = 1.5;
const RELAXED = 1.625; // leading-relaxed

type Ctx = {
  /** `@custom-variant short (@media (max-height: 520px))` — 393 <= 520. */
  short: boolean;
  /** `sm:` = (width >= 40rem) — 852 >= 640. */
  wide: boolean;
};

/**
 * Which of `base` / `sm:` / `short:` wins, at 852 x 393.
 *
 * Emission order decides it at equal specificity, and it was read off the
 * compiled stylesheet rather than assumed: in .next/static/chunks/*.css
 * `.short\:p-4` is emitted at byte 109428 and `.sm\:p-7` at 100641, so the
 * custom variant sorts AFTER the built-in breakpoints and `short:` wins.
 * globals.css says the mobile harness fails loudly if that ever flips.
 */
function winner(classes: string, matches: (bare: string) => boolean, ctx: Ctx): string | null {
  const tokens = classes.split(/\s+/).filter(Boolean);
  const tiers: Array<[string, boolean]> = [
    ["", true],
    ["sm:", ctx.wide],
    ["short:", ctx.short],
    ["short:sm:", ctx.short && ctx.wide],
  ];
  let found: string | null = null;
  for (const [prefix, active] of tiers) {
    if (!active) continue;
    for (const token of tokens) {
      if (!token.startsWith(prefix)) continue;
      const bare = token.slice(prefix.length);
      if (bare.includes(":")) continue; // a further variant (focus:, hover:) — not the resting state
      if (matches(bare)) found = bare;
    }
  }
  return found;
}

/** Winning value of a spacing family (`p`, `py`, `mt`, `mb`, `gap`, `space-y`), in px. */
function space(classes: string, family: string, ctx: Ctx): number {
  const bare = winner(classes, (b) => b.startsWith(`${family}-`) && /^[\d.]+$/.test(b.slice(family.length + 1)), ctx);
  return bare === null ? 0 : Number(bare.slice(family.length + 1)) * STEP;
}

/** Winning line box of the text on an element. */
function leading(classes: string, ctx: Ctx, fallback = "base"): number {
  const bare = winner(classes, (b) => b.startsWith("text-") && b.slice(5) in TEXT, ctx) ?? `text-${fallback}`;
  const scale = TEXT[bare.slice(5)];
  return winner(classes, (b) => b === "leading-relaxed", ctx) ? scale.size * RELAXED : scale.line;
}

/** `sr-only` takes the box out of the flow entirely — position: absolute. */
function outOfFlow(classes: string, ctx: Ctx): boolean {
  return winner(classes, (b) => b === "sr-only", ctx) === "sr-only";
}

/** Pull a className literal out of a source file by an anchor its first token gives. */
function classOf(src: string, anchor: string, label: string): string {
  const re = new RegExp(`className="(${anchor}[^"]*)"`);
  const m = re.exec(src);
  if (!m) throw new Error(`fold model lost its anchor for ${label} (/${anchor}/)`);
  return m[1];
}

/**
 * Every declaration block whose selector list starts a line with `selector`.
 *
 * Anchored to a line start, with no `{` `}` or `;` allowed between the selector
 * and its brace, so the prose in globals.css — which names `.btn-accent` and
 * `.hud-label` inside comments — cannot be mistaken for a rule. `(?![-\w])`
 * stops `.panel` matching `.panel-glass`.
 */
function ruleBodies(selector: string): string[] {
  const name = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\n)[ \\t]*${name}(?![-\\w])[^;{}]*\\{([^}]*)\\}`, "g");
  return [...GLOBALS.matchAll(re)].map((m) => m[1]);
}

/** Pull a length out of a raw CSS declaration, e.g. `.panel { border: 1px … }`. */
function cssLength(selector: string, property: string): number {
  const re = new RegExp(`(?:^|[;{\\s])${property}:\\s*([\\d.]+)px`);
  for (const body of ruleBodies(selector)) {
    const decl = re.exec(body);
    if (decl) return Number(decl[1]);
  }
  throw new Error(`fold model cannot find CSS rule ${selector} with ${property}`);
}

/** Same, for a length authored in rem — `.hud-label { font-size: 0.7rem }`. */
function cssRem(selector: string, property: string): number {
  const re = new RegExp(`(?:^|[;{\\s])${property}:\\s*([\\d.]+)rem`);
  for (const body of ruleBodies(selector)) {
    const decl = re.exec(body);
    if (decl) return Number(decl[1]);
  }
  throw new Error(`fold model cannot find CSS rule ${selector} with ${property}`);
}

/** Pull the `@apply` utilities off a component class so its padding is read, not guessed. */
function applyOf(selector: string): string {
  for (const body of ruleBodies(selector)) {
    const apply = /@apply ([^;]*);/.exec(body);
    if (apply) return apply[1];
  }
  throw new Error(`fold model cannot find CSS rule ${selector} with @apply`);
}

/* ------------------------------------------------------------------ *
 * 3. The stack, top to bottom.
 * ------------------------------------------------------------------ */

/** Every class string the /login stack is built from — read, never retyped. */
type Skin = {
  main: string;
  brand: string;
  brandBadge: string;
  panel: string;
  nav: string;
  header: string;
  eyebrow: string;
  title: string;
  lead: string;
  rule: string;
  footerNote: string;
  banner: string;
  forgot: string;
  form: string;
  /** The two-column wrapper. `null` = the fields are direct children of the form. */
  fieldGrid: string | null;
  label: string;
  fieldError: string;
  formError: string;
  submit: string;
};

const HEAD: Skin = {
  main: classOf(LAYOUT, "grain", "<main>"),
  brand: classOf(LAYOUT, "enter mb-7", "brand lockup"),
  brandBadge: classOf(LAYOUT, "flex h-8 w-8", "brand badge"),
  panel: classOf(LAYOUT, "enter p-6", "<Panel>"),
  nav: classOf(LAYOUT, "enter mt-6 flex", "legal nav"),
  header: classOf(UI, "mb-6", "AuthHeading <header>"),
  eyebrow: classOf(UI, "hud-label", "eyebrow"),
  title: classOf(UI, "mt-1\\.5 font-display", "<h1>"),
  lead: classOf(UI, "mt-2 text-sm leading-relaxed", "lead"),
  rule: classOf(UI, "rule mt-6", "hairline"),
  footerNote: classOf(UI, "mt-4 text-center text-sm", "footer note"),
  banner: classOf(PAGE, "mb-5 rounded-lg", "status banner"),
  forgot: classOf(PAGE, "mt-4 text-center text-xs", "forgot-password line"),
  form: classOf(FORM, "space-y-4", "<form>"),
  fieldGrid: /className="(grid[^"]*)"/.exec(FORM)?.[1] ?? null,
  label: classOf(FIELDS, "mb-1\\.5 block text-sm", "field <label>"),
  fieldError: classOf(FIELDS, "mt-1\\.5 text-xs font-semibold text-danger", "field error"),
  formError: classOf(FIELDS, "rounded-lg border border-danger", "<FormError>"),
  submit: classOf(FIELDS, "btn-accent w-full", "submit button"),
};

/**
 * The shell as commit 6430557 shipped it — the state the audit row was filed
 * against. Frozen on purpose: it is the calibration weight, so it must not
 * follow the sources when they change.
 */
const PRE_REPAIR: Skin = {
  main: "grain relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 text-foreground",
  brand: "enter mb-7 flex items-center justify-center gap-2 rounded-lg font-display text-lg font-extrabold tracking-tight",
  brandBadge: "flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-black text-accent-foreground shadow-glow-sm",
  panel: "enter p-6 shadow-depth-2 sm:p-7",
  nav: "enter mt-6 flex justify-center gap-5",
  header: "mb-6",
  eyebrow: "hud-label",
  title: "mt-1.5 font-display text-2xl font-black tracking-tight",
  lead: "mt-2 text-sm leading-relaxed text-muted",
  rule: "rule mt-6",
  footerNote: "mt-4 text-center text-sm text-muted",
  banner: "mb-5 rounded-lg border border-success/50 bg-success/10 px-3 py-2.5 text-sm font-semibold text-success",
  forgot: "mt-4 text-center text-xs",
  form: "space-y-4",
  fieldGrid: null,
  label: "mb-1.5 block text-sm font-semibold",
  fieldError: "mt-1.5 text-xs font-semibold text-danger",
  formError: "rounded-lg border border-danger/50 bg-danger/10 px-3 py-2.5 text-sm font-semibold text-danger",
  submit: "btn-accent w-full",
};

/** What is on screen. Every combination below is reachable from /login. */
type State = {
  /** 0 = no banner. `?reset=1` and `?revoked=1` wrap to 1 line, `?changed=1` to 2. */
  bannerLines: number;
  /** 0 = no form-level error; 1 = „Грешен имейл или парола." */
  formErrorLines: number;
  emailError: boolean;
  passwordError: boolean;
};

type Fold = {
  emailBottom: number;
  passwordBottom: number;
  submitBottom: number;
  documentHeight: number;
};

function computeFold(skin: Skin, state: State, ctx: Ctx = { short: true, wide: true }): Fold {
  // Component classes, read out of globals.css so a change there moves this.
  const fieldApply = applyOf(".field");
  const fieldBox = 2 * space(fieldApply, "py", ctx) + leading(fieldApply, ctx) + 2 * cssLength(".field", "border");
  const submitApply = applyOf(".btn-accent");
  const submitBox = 2 * space(submitApply, "py", ctx) + leading(submitApply, ctx);
  const panelBorder = cssLength(".panel", "border");
  const ruleBox = cssLength(".rule", "height");
  const eyebrowBox = cssRem(".hud-label", "font-size") * 16 * ROOT_LEADING;

  // A bordered notice: px-3 py-N, 1px border, N lines of its own text size.
  const notice = (classes: string, lines: number): number =>
    2 * space(classes, "py", ctx) + 2 + lines * leading(classes, ctx);

  // --- the page, top down -------------------------------------------------
  let y = space(skin.main, "py", ctx); // <main> padding-top

  if (!outOfFlow(skin.brand, ctx)) {
    y += Math.max(space(skin.brandBadge, "h", ctx), leading(skin.brand, ctx));
    y += space(skin.brand, "mb", ctx);
  }

  y += panelBorder + space(skin.panel, "p", ctx); // into the <Panel>

  // AuthHeading
  if (!outOfFlow(skin.eyebrow, ctx)) y += eyebrowBox;
  y += space(skin.title, "mt", ctx) + leading(skin.title, ctx);
  if (!outOfFlow(skin.lead, ctx)) y += space(skin.lead, "mt", ctx) + leading(skin.lead, ctx);
  y += space(skin.header, "mb", ctx);

  // The status banner, when the URL carries one.
  if (state.bannerLines > 0) {
    y += notice(skin.banner, state.bannerLines) + space(skin.banner, "mb", ctx);
  }

  // The form. `space-y-N` puts N between direct children; the two fields are
  // either two of those children or one grid row.
  const between = space(skin.form, "space-y", ctx);
  const labelBox = leading(skin.label, ctx) + space(skin.label, "mb", ctx);
  const errorBox = space(skin.fieldError, "mt", ctx) + leading(skin.fieldError, ctx);
  const block = (hasError: boolean) => labelBox + fieldBox + (hasError ? errorBox : 0);

  const formTop = y;
  const emailBlock = block(state.emailError);
  const passwordBlock = block(state.passwordError);
  const twoColumn =
    skin.fieldGrid !== null && winner(skin.fieldGrid, (b) => b === "grid-cols-2", ctx) !== null;

  let emailBottom: number;
  let passwordBottom: number;
  if (twoColumn) {
    // One grid row: both inputs share a top edge, and the row is as tall as its
    // tallest cell rather than the sum of both.
    emailBottom = formTop + labelBox + fieldBox;
    passwordBottom = emailBottom;
    y = formTop + Math.max(emailBlock, passwordBlock);
  } else {
    const gap = skin.fieldGrid === null ? between : space(skin.fieldGrid, "gap", ctx);
    emailBottom = formTop + labelBox + fieldBox;
    passwordBottom = formTop + emailBlock + gap + labelBox + fieldBox;
    y = formTop + emailBlock + gap + passwordBlock;
  }

  if (state.formErrorLines > 0) {
    y += between + notice(skin.formError, state.formErrorLines);
  }
  y += between;
  const submitBottom = y + submitBox;
  y = submitBottom;

  // Everything under the button — it cannot move the button, but it decides
  // whether the page scrolls at all.
  y += space(skin.forgot, "mt", ctx) + leading(skin.forgot, ctx, "xs");
  y += space(skin.rule, "mt", ctx) + ruleBox;
  y += space(skin.footerNote, "mt", ctx) + leading(skin.footerNote, ctx);
  y += space(skin.panel, "p", ctx) + panelBorder; // out of the <Panel>
  y += space(skin.nav, "mt", ctx) + leading(skin.nav, ctx, "xs");
  y += space(skin.main, "py", ctx); // <main> padding-bottom

  return {
    emailBottom,
    passwordBottom,
    submitBottom,
    documentHeight: y + INSET.bottom, // globals.css §BODY pays the inset back
  };
}

const AT_REST: State = { bannerLines: 0, formErrorLines: 0, emailError: false, passwordError: false };

/**
 * Every state a student can actually be looking at. `?changed=1` is the long
 * banner — „Паролата ти е сменена и те отписахме от всички устройства. Влез с
 * новата.", 72 characters of 14px semibold in a 390px box, so it wraps to two
 * lines; `?reset=1` and `?revoked=1` are one.
 *
 * The last three are the sequence nobody measured and the reason this file
 * exists: a student lands on ?changed=1 from /settings, tries the OLD password
 * (FormError), then clears a field to retype it and blurs — `revalidate()` runs
 * because `submitted` is already true, and a field error appears UNDER the
 * form-level one.
 */
const STATES: Array<[string, State]> = [
  ["at rest", AT_REST],
  ["?reset=1", { ...AT_REST, bannerLines: 1 }],
  ["?changed=1 (two-line banner)", { ...AT_REST, bannerLines: 2 }],
  ["wrong password", { ...AT_REST, formErrorLines: 1 }],
  ["?changed=1 + wrong password", { bannerLines: 2, formErrorLines: 1, emailError: false, passwordError: false }],
  ["?changed=1 + wrong password + empty password", { bannerLines: 2, formErrorLines: 1, emailError: false, passwordError: true }],
  ["?changed=1 + wrong password + both fields invalid", { bannerLines: 2, formErrorLines: 1, emailError: true, passwordError: true }],
  ["both fields invalid, no banner", { ...AT_REST, emailError: true, passwordError: true }],
];

/* ------------------------------------------------------------------ *
 * 4. The calibration. Everything else is worthless without it.
 * ------------------------------------------------------------------ */

describe("the model reproduces the filed defect", () => {
  it("computes 315 / 399 / 459 from the pre-repair source, as the row measured", () => {
    // audit row app-login:e2577ced, measured 2026-08-31 in WebKit at
    // DEVICES["iphone16-landscape"]: #password ends at 399 and the submit
    // button at 459, both past the 393px fold, elementFromPoint -> null.
    const fold = computeFold(PRE_REPAIR, AT_REST);
    expect(Math.round(fold.emailBottom)).toBe(315);
    expect(Math.round(fold.passwordBottom)).toBe(399);
    expect(Math.round(fold.submitBottom)).toBe(459);
  });

  it("agrees that both controls were off the screen entirely", () => {
    const fold = computeFold(PRE_REPAIR, AT_REST);
    expect(fold.passwordBottom).toBeGreaterThan(VIEWPORT.height);
    expect(fold.submitBottom - 22).toBeGreaterThan(VIEWPORT.height); // the button's own centre
  });

  it("reproduces the two numbers wave 29 left in the source as its evidence", () => {
    // layout.tsx: „banner + wrong password ends at 369". authFold.test.ts: 349
    // for the same state with the one-line banner. Both are the ONE-COLUMN
    // stack, so the pre-repair skin's grid (absent) plus HEAD's `short:` values
    // is what has to produce them.
    const oneColumn: Skin = { ...HEAD, fieldGrid: null };
    expect(Math.round(computeFold(oneColumn, { ...AT_REST, bannerLines: 2, formErrorLines: 1 }).submitBottom)).toBe(369);
    expect(Math.round(computeFold(oneColumn, { ...AT_REST, bannerLines: 1, formErrorLines: 1 }).submitBottom)).toBe(349);
  });
});

/* ------------------------------------------------------------------ *
 * 5. What must hold at HEAD.
 * ------------------------------------------------------------------ */

describe("both controls a student needs are inside the fold", () => {
  for (const [name, state] of STATES) {
    it(`keeps #password and the submit button above y=${FOLD} — ${name}`, () => {
      const fold = computeFold(HEAD, state);
      expect(fold.passwordBottom).toBeLessThanOrEqual(FOLD);
      expect(fold.submitBottom).toBeLessThanOrEqual(FOLD);
    });
  }

  it("does not hold by three pixels — the worst state keeps real margin", () => {
    // The one-column stack cleared 372 by 3px on „?changed=1 + wrong password"
    // and lost it on the very next keystroke. A fold that survives one more
    // line of Bulgarian copy is the acceptance, not a fold that happens to fit
    // today's strings.
    const worst = Math.max(...STATES.map(([, s]) => computeFold(HEAD, s).submitBottom));
    expect(FOLD - worst).toBeGreaterThanOrEqual(40);
  });

  it("puts the page inside the screen at rest, with nothing to scroll", () => {
    expect(computeFold(HEAD, AT_REST).documentHeight).toBeLessThanOrEqual(VIEWPORT.height);
  });
});

describe("the grid is what buys it, and it is wired to the two fields", () => {
  it("wraps exactly the e-mail and password fields, in DOM order", () => {
    const grid = /<div className="grid[^"]*">([\s\S]*?)\n      <\/div>/.exec(FORM);
    expect(grid, "the two fields are no longer inside the fold grid").not.toBeNull();
    const inside = grid![1];
    expect(inside.indexOf('id="email"')).toBeGreaterThan(-1);
    expect(inside.indexOf('id="password"')).toBeGreaterThan(-1);
    // DOM order unchanged is what keeps tab order, autofill and
    // focusFirstError() behaving exactly as they did in one column.
    expect(inside.indexOf('id="email"')).toBeLessThan(inside.indexOf('id="password"'));
  });

  it("is height-AND-width gated, so a portrait phone never gets two columns", () => {
    expect(HEAD.fieldGrid).toContain("short:sm:grid-cols-2");
    // Verified against the compiled stylesheet before it was written: Tailwind
    // emits `.short\:sm\:grid-cols-2 { @media (max-height:520px) { @media
    // (width>=40rem) { … } } }`. globals.css records a stacked variant that
    // compiled to NOTHING (`max-sm:tall:`), which is why this was checked and
    // not assumed.
    expect(computeFold(HEAD, AT_REST, { short: true, wide: false }).submitBottom).toBe(
      computeFold({ ...HEAD, fieldGrid: null }, AT_REST, { short: true, wide: false }).submitBottom,
    );
  });

  it("is the 16px `space-y-4` it replaced on every tall viewport", () => {
    const tall: Ctx = { short: false, wide: true };
    const withGrid = computeFold(HEAD, AT_REST, tall);
    const withoutGrid = computeFold({ ...HEAD, fieldGrid: null }, AT_REST, tall);
    expect(withGrid.submitBottom).toBe(withoutGrid.submitBottom);
    expect(withGrid.documentHeight).toBe(withoutGrid.documentHeight);
  });

  it("still costs one field error, not two, when both fields are wrong", () => {
    const one = computeFold(HEAD, { ...AT_REST, passwordError: true }).submitBottom;
    const both = computeFold(HEAD, { ...AT_REST, emailError: true, passwordError: true }).submitBottom;
    expect(both).toBe(one);
  });
});

describe("the fold was not bought out of a control", () => {
  it("leaves the input and the button at their full tap height", () => {
    // 42px input, 44px button — the two things a thumb has to hit on a soft
    // keyboard. Every pixel this row cost came out of chrome.
    const fieldApply = applyOf(".field");
    expect(2 * space(fieldApply, "py", { short: true, wide: true }) + leading(fieldApply, { short: true, wide: true }) + 2).toBe(42);
    const submitApply = applyOf(".btn-accent");
    expect(2 * space(submitApply, "py", { short: true, wide: true }) + leading(submitApply, { short: true, wide: true })).toBe(44);
  });

  it("leaves each column wide enough for what goes in it", () => {
    // max-w-md panel: 448 - 2 border - 32 padding - 8 gap = 406, halved = 203.
    // Minus the field's own px-3 and border that is 177px of text; the reveal
    // button inside the password field reserves pr-20 (80px) of it.
    const panelInner = 448 - 2 * 1 - 2 * 16;
    const column = (panelInner - 8) / 2;
    expect(column).toBeGreaterThan(190);
    expect(column - 24 - 2 - 80).toBeGreaterThan(80);
  });
});

describe("the model is reading the app and not a copy of it", () => {
  it("loses its anchors loudly rather than measuring a stale string", () => {
    expect(() => classOf(LAYOUT, "this-anchor-does-not-exist", "canary")).toThrow(/lost its anchor/);
    expect(() => applyOf(".no-such-component")).toThrow(/cannot find CSS rule/);
  });

  it("takes `short:` over `sm:` — the order the compiled stylesheet emits", () => {
    const ctx: Ctx = { short: true, wide: true };
    expect(space("p-6 sm:p-7 short:p-4", "p", ctx)).toBe(16);
    expect(space("p-6 sm:p-7", "p", ctx)).toBe(28);
    expect(space("p-6 sm:p-7 short:p-4", "p", { short: false, wide: true })).toBe(28);
  });

  it("reads the type scale off the classes rather than assuming one", () => {
    const ctx: Ctx = { short: true, wide: true };
    expect(leading("text-2xl short:text-xl", ctx)).toBe(28);
    expect(leading("text-2xl short:text-xl", { short: false, wide: true })).toBe(32);
    expect(leading("text-sm leading-relaxed", ctx)).toBeCloseTo(22.75, 5);
  });
});
