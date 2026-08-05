import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX,
  NOTIFY_COLUMN_WIDTH_FRACTION_COMPACT,
  notifyColumnWidthPx,
} from "@/modules/sim/hud/notifyColumn";

/**
 * ROWS A2 / A6 — „THE POPUPS HE CANNOT GET RID OF", GUARDED.
 *
 * ── What this file is defending against, specifically ────────────────────────
 *
 * A6 is one sentence: „those pop ups … need to be able to be removed when
 * clicked with the mouse … complete rework". A2 is the same complaint about the
 * end-of-lesson debrief, plus „say that Space skips it" and „let me turn it
 * off". Both were reported PARTIAL for the same reason: the CONTROL existed
 * somewhere in the tree and nobody had established that it could be pressed.
 *
 * Three failure modes have actually happened in this repo, and this file is
 * shaped around them rather than around „CSS deserves a test":
 *
 *  1. A CONTROL TOO SMALL TO PRESS. Row C2 shipped four targets under 44 px,
 *     and the last one to be fixed was «Разбрах» — the control that dismissed
 *     the popup row C1 was about. The briefing's ✕ was the same defect: it had
 *     `px-1.5 text-xs` and no height of its own, i.e. ~24 × 18 px.
 *  2. A SELECTOR THAT MATCHES NOTHING. `tools/mobile/selectors.test.mjs` exists
 *     because a `mustFit` selector vouched for a screen it had never matched for
 *     four months, and `unpanel.test.ts` exists because a rename can silently
 *     turn a `data-hud` rule into a no-op. The end-screen hit-area rule below
 *     reaches ACROSS A MODULE BOUNDARY into `modules/sim/hud/SessionEndScreen`
 *     by attribute. If those attributes are ever renamed, the CSS keeps parsing,
 *     the page keeps rendering, and the two smallest controls in the product
 *     quietly go back to 30 px and 22 px. That is the exact shape of miss this
 *     project keeps paying for, so it is asserted here and not assumed.
 *  3. A FIX THAT DOES NOT FIT THE SCREEN IT IS FOR. The column is 141 px on the
 *     founder's phone. Solving „44 px" by painting a 44 px button would eat 31 %
 *     of it — the fix would become the next complaint.
 *
 * IT IS NOT A SUBSTITUTE FOR LOOKING. The acceptance evidence for both rows is
 * the rendered click captures (desktop 1440×900 and a 393×852 phone, real mouse
 * events, before/after). This only guarantees that what was verified by eye
 * stays wired to something.
 */

const LESSON_UI = __dirname;
const SIM_HUD = join(__dirname, "..", "..", "..", "modules", "sim", "hud");
const read = (path: string) => readFileSync(path, "utf8");

const PLAY_AREA_STYLES = read(join(LESSON_UI, "PlayAreaStyles.tsx"));
const HUD_CLOSE_BUTTON = read(join(LESSON_UI, "HudCloseButton.tsx"));
const ADVISOR_CARD = read(join(LESSON_UI, "AdvisorCard.tsx"));
const PLAY_SHELL = read(join(LESSON_UI, "LessonPlayShell.tsx"));
/** Read, never written: modules/sim belongs to another lane. */
const SESSION_END = read(join(SIM_HUD, "SessionEndScreen.tsx"));

/** Apple's minimum, and the number row C2 was closed on. */
const MIN_TOUCH_PX = 44;
const MIN_TOUCH_REM = `${MIN_TOUCH_PX / 16}rem`;

describe("A6 — every dismissable panel in the column has a mouse control", () => {
  it("the advisor card renders a close control (it was pointer-events-none)", () => {
    expect(ADVISOR_CARD).toContain("HudCloseButton");
    expect(ADVISOR_CARD).toContain("onDismiss");
  });

  it("the briefing card uses the same control, not its own ✕", () => {
    expect(PLAY_SHELL).toContain("HudCloseButton");
    // The old target: a bare glyph with horizontal padding and no height.
    expect(PLAY_SHELL).not.toContain('className="ml-auto rounded-lg px-1.5 text-xs');
  });

  it("the control is a real button with an accessible name, not a div", () => {
    expect(HUD_CLOSE_BUTTON).toContain("<button");
    expect(HUD_CLOSE_BUTTON).toContain('type="button"');
    expect(HUD_CLOSE_BUTTON).toContain("aria-label={labelBg}");
  });

  it("the control takes the pointer (the card around it deliberately does not)", () => {
    expect(HUD_CLOSE_BUTTON).toContain("pointer-events-auto");
    // The card stays transparent to clicks so a click on the prompt's own text
    // still reaches the road behind it.
    expect(ADVISOR_CARD).toContain("pointer-events-none");
  });

  it("dismissing the advisor is scoped to ONE prompt, never to the mode", () => {
    // THEO-4: „I have read this one" must not silently become „never explain
    // anything to me again". The shell compares the dismissed TEXT.
    expect(PLAY_SHELL).toContain("advisorDismissed");
    expect(PLAY_SHELL).toContain("snap.advisorPrompt.textBg !== advisorDismissed");
    // …and a retry starts advised again.
    expect(PLAY_SHELL).toContain("setAdvisorDismissed(null)");
  });
});

describe("A6 — the hit rect is 44 px in BOTH axes and paints nothing", () => {
  /** The `[data-hud-close]::before` block, as shipped. */
  const closeRule = /\[data-hud-close\]::before\s*\{([^}]*)\}/.exec(PLAY_AREA_STYLES)?.[1] ?? "";

  it("the rule exists at all", () => {
    expect(closeRule).not.toBe("");
    expect(PLAY_AREA_STYLES).toMatch(/\[data-hud-close\]\s*\{[^}]*position:\s*relative/);
  });

  it("is 44 px wide AND 44 px tall — a wide, short pill is the C2 defect", () => {
    expect(closeRule).toContain(`width: ${MIN_TOUCH_REM}`);
    expect(closeRule).toContain(`height: ${MIN_TOUCH_REM}`);
  });

  it("is centred on the glyph, so neither axis depends on the glyph's own box", () => {
    expect(closeRule).toContain("translate(-50%, -50%)");
  });

  it("paints nothing — no background, border, outline or shadow", () => {
    expect(closeRule).not.toMatch(/background|border|outline|box-shadow/);
  });

  it("is NOT scoped to compact: he is a MOUSE user on a desktop", () => {
    // Row C2's rules are `[data-sim-compact="on"] …` because a thumb is what
    // 44 px is about. A6 is not a thumb row, and scoping it to phones would
    // leave the surface he actually reviewed on untouched — which is precisely
    // how the previous pass at this row reported green.
    const line = PLAY_AREA_STYLES.slice(
      PLAY_AREA_STYLES.indexOf("[data-hud-close] {") - 200,
      PLAY_AREA_STYLES.indexOf("[data-hud-close]::before"),
    );
    expect(line).not.toContain('data-sim-compact="on"] [data-hud-close');
  });

  it("stays small enough to PAINT inside a 141 px column", () => {
    // The founder's phone: min(240, 393 × 0.36) = 141.5 px.
    const columnPx = notifyColumnWidthPx(393, true);
    expect(columnPx).toBeCloseTo(
      Math.min(NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX, 393 * NOTIFY_COLUMN_WIDTH_FRACTION_COMPACT),
      3,
    );
    expect(columnPx).toBeLessThan(142);
    // The painted ring, from the component's own class list.
    const painted = /h-\[(\d+)px\] w-\[(\d+)px\]/.exec(HUD_CLOSE_BUTTON);
    expect(painted).not.toBeNull();
    const paintedPx = Number(painted![2]);
    expect(paintedPx).toBeLessThan(MIN_TOUCH_PX);
    // A 44 px button would be 31 % of that column. Hold the paint under 15 %.
    expect(paintedPx / columnPx).toBeLessThan(0.15);
  });
});

describe("A2 — the end screen's own controls, and the cross-lane selector", () => {
  it("the shell names the end screen so the rule has a handle", () => {
    expect(PLAY_SHELL).toContain('data-hud="end-screen"');
  });

  it("the rule gives both controls a 44 px hit rect", () => {
    const rule =
      /\[data-hud="end-screen"\] button\[aria-keyshortcuts="Space"\]::before,\s*\[data-hud="end-screen"\] button\[aria-pressed\]::before\s*\{([^}]*)\}/.exec(
        PLAY_AREA_STYLES,
      )?.[1] ?? "";
    expect(rule).not.toBe("");
    expect(rule).toContain(`height: ${MIN_TOUCH_REM}`);
    expect(rule).not.toMatch(/background|border|outline|box-shadow/);
  });

  // ── THE NO-OP-SELECTOR NET ────────────────────────────────────────────────
  // These two assertions are the whole reason this describe block exists. The
  // CSS above lives in components/sim; the markup it names lives in
  // modules/sim, which this lane may not edit. If the other lane renames either
  // attribute, nothing breaks, nothing warns, and the two smallest controls in
  // the product silently go back under the thumb minimum.
  it("`aria-keyshortcuts=\"Space\"` still exists on the skip control", () => {
    expect(SESSION_END).toContain('aria-keyshortcuts="Space"');
  });

  it("`aria-pressed` still exists on the „не показвай автоматично\" toggle", () => {
    expect(SESSION_END).toContain("aria-pressed={!autoOpen}");
  });

  it("the screen still SAYS Space skips it — a shortcut nobody is told about is not a feature", () => {
    expect(SESSION_END).toContain("SESSION_END_SKIP_HINT_BG");
    expect(SESSION_END).toContain("Пропусни разбора");
    expect(SESSION_END).toContain("Не показвай автоматично");
  });

  it("Space is bound in the CAPTURE phase — the cabin reads it as the handbrake", () => {
    expect(SESSION_END).toContain('window.addEventListener("keydown", onKey, true)');
  });
});
