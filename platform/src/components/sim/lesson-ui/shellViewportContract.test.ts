import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * =============================================================================
 * THE THREE CONTRACTS THE PLAY SHELL PUBLISHES TO THE REST OF THE SCREEN, and
 * the three ways each of them has already been got wrong.
 *
 * These are source-level pins, deliberately, and the reason is written down
 * rather than assumed: all three defects are ONE ARGUMENT or ONE TERNARY in a
 * component whose render needs a WebGL context, a lesson, a session and a live
 * visual viewport to mount at all. A DOM test of this shell would be a test of
 * the mocks. What can be asserted honestly from here is that the line still
 * says what the measurement said it had to say — and each `it` carries the
 * production number that put it there, so a future reader can re-run it rather
 * than trust it. Every number below came from
 * `tools/mobile/wave6-edges.mjs` against the DEPLOYED product, authenticated
 * /simulator, with `hasCanvas === true` and a non-zero canvas rect asserted
 * before any of it was written down.
 * =============================================================================
 */

const nl = (s: string): string => s.replace(/\r\n/g, "\n");
const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SHELL = strip(nl(readFileSync(join(__dirname, "LessonPlayShell.tsx"), "utf8")));
const OVERLAY = strip(
  nl(
    readFileSync(
      join(__dirname, "..", "..", "..", "modules", "sim", "hud", "SimOverlay.tsx"),
      "utf8",
    ),
  ),
);

/**
 * ── §I7 · `--sim-vh` ────────────────────────────────────────────────────────
 *
 * `useVisualViewportHeight` returns early when its argument is false and KEEPS
 * ITS LAST VALUE. Called with `immersive && !isFullscreen`, entering fullscreen
 * froze the published height: §C6 watched it read `852px` through a whole
 * rotation that took the viewport to 852×393. Two sheets size themselves from
 * it, so a teaching panel was being allowed 528 px inside a 393 px viewport in
 * an `overflow: hidden` shell.
 *
 * Reproduced before the fix on the deployed product, WebKit, iPhone 16
 * landscape: a −44 px viewport change and back left `--sim-vh` at `349px` while
 * `visualViewport.height` was 393.
 */
describe("§I7 the published viewport height is measured whenever the shell owns the screen", () => {
  it("the hook is armed by `immersive || isFullscreen`", () => {
    expect(SHELL).toMatch(/useVisualViewportHeight\(\s*immersive\s*\|\|\s*isFullscreen\s*\)/);
  });

  it("and NEVER again by `immersive && !isFullscreen` — that conjunction IS the bug", () => {
    expect(SHELL).not.toMatch(/useVisualViewportHeight\([^)]*&&\s*!isFullscreen/);
  });

  it("the INLINE HEIGHT is still the thing that stands down in fullscreen", () => {
    // The whole argument for widening the hook is that the height is guarded
    // separately. If that guard ever moves, widening the hook starts setting a
    // height on the fullscreen element and this pin has to be re-thought, not
    // deleted.
    expect(SHELL).toMatch(
      /immersive\s*&&\s*!isFullscreen\s*\n?\s*\?\s*\{\s*height:/,
    );
  });

  it("`--sim-vh` is published unconditionally, which is only safe now", () => {
    expect(SHELL).toMatch(/\["--sim-vh" as string\]:\s*viewportH !== null/);
  });
});

/**
 * ── §I8 · sixteen pixels of road ────────────────────────────────────────────
 *
 * The `isFullscreen` arm is tested FIRST and hard-coded `gap-2 p-2`, so a phone
 * that GRANTS the Fullscreen API never reached the `compact ? "" : "gap-2 p-2"`
 * rule six lines below — the one whose own comment reads „eight pixels of page
 * gutter on each side of a driving simulator is eight pixels of road".
 *
 * Measured on the deployed product, Chromium (which grants fullscreen for a
 * <div>; iOS Safari does not, which is why four WebKit sweeps never saw it):
 * canvas 836×377 in an 852×393 viewport, and 377×836 in 393×852. Sixteen pixels
 * of width and sixteen of height, in both orientations.
 */
describe("§I8 the fullscreen arm obeys the same compact rule as the immersive arm", () => {
  const fullscreenArm = SHELL.slice(
    SHELL.indexOf("isFullscreen\n          ?"),
    SHELL.indexOf("isFullscreen\n          ?") + 900,
  );

  it("is a template that asks `compact` before it spends a pixel", () => {
    expect(fullscreenArm).toMatch(/compact \? "" : "gap-2 p-2"/);
  });

  it("carries no hard-coded gutter of its own", () => {
    // `p-2` may appear only inside the ternary's roomy branch.
    const outsideTernary = fullscreenArm.replace(/compact \? "" : "gap-2 p-2"/g, "");
    expect(outsideTernary).not.toMatch(/\bp-2\b/);
    expect(outsideTernary).not.toMatch(/\bgap-2\b/);
  });

  it("the immersive arm's rule is unchanged, so the two arms now agree", () => {
    expect(SHELL).toMatch(/compact \? "" : "gap-2 p-2"/g);
    expect((SHELL.match(/compact \? "" : "gap-2 p-2"/g) ?? []).length).toBe(2);
  });
});

/**
 * ── §I11 · the sheet stood on the driving controls ──────────────────────────
 *
 * `bottom: var(--sim-dash-h)` clears the 40 px instrument band. The band that
 * had to be cleared is the THUMB band, ~216 px. §D4's diagnosis was that
 * `TouchControls` already publishes the number and `SimOverlay` cannot see it;
 * the shell is the only component that can see both, so the shell republishes
 * it.
 *
 * Measured on the deployed product with the sheet opened by its own chip:
 * 9 680 px² of 44 px controls under it and 3 of 10 DEAD on iPhone 16 landscape;
 * 7 920 px² and 4 of 10 dead in portrait — «Мигач наляво» and «Поглед в дясното
 * огледало» among them, both GRADED actions.
 */
describe("§I11 the compact sheet has a clearance contract against the thumb band", () => {
  it("the shell publishes `--sim-touch-floor` from TOUCH_CONTROLS_FLOOR itself", () => {
    expect(SHELL).toMatch(/\["--sim-touch-floor" as string\]:/);
    // As a LENGTH, not a pixel count: the constant carries an `env()` and an
    // `ARC_RISE` clamp that only the engine can resolve against the live box —
    // and keeping it authored CSS is also what lets the notch harness
    // substitute a real inset into it.
    expect(SHELL).toMatch(
      /\["--sim-touch-floor" as string\]:[\s\S]{0,220}touchControlsFloorCss\("var\(--sim-vh, 100dvh\)"\)/,
    );
  });

  it("…and against `var(--sim-vh)`, never the percentage form", () => {
    // A percentage in the `max-height` the sheet needs resolves against a
    // `bottom:`-anchored box of auto height — indefinite, so the engine drops
    // the declaration. Measured on the deployed product exactly once: the cap
    // did nothing and «Затвори» stood 123.5 px above the top of the screen.
    expect(SHELL).not.toMatch(/\["--sim-touch-floor" as string\]:[\s\S]{0,220}: TOUCH_CONTROLS_FLOOR\b/);
  });

  it("…and it is `0px` where there is no thumb band to clear", () => {
    expect(SHELL).toMatch(/\["--sim-touch-floor" as string\]:[\s\S]{0,220}"0px"/);
  });

  it("the open sheet stands on dash + touch floor", () => {
    expect(OVERLAY).toMatch(
      /bottom:\s*sheetExpanded[\s\S]{0,180}calc\(var\(--sim-dash-h, 0px\) \+ var\(--sim-touch-floor, 0px\)\)/,
    );
  });

  it("…and its height is capped by the room that is actually left, not only by 0.62", () => {
    // §I11 is explicit that the clearance alone is not the fix: standing on the
    // thumb band leaves ~95 px on his phone sideways, so a sheet still asking
    // for 0.62 of the viewport is pushed off the TOP instead of the bottom.
    // Measured that way once, on the deployed product: «Затвори» 123.5 px above
    // the safe-area box and the overlap with the controls UP from 9 680 to
    // 12 276 px², because a box anchored only by `bottom:` grows upward.
    expect(OVERLAY).toMatch(/maxHeight:[\s\S]{0,500}min\(calc\(var\(--sim-vh, 100dvh\) \* 0\.62\)/);
    expect(OVERLAY).toMatch(/maxHeight:[\s\S]{0,500}var\(--sim-touch-floor, 0px\)/);
  });

  it("…and the cap has a floor, because `min()` alone collapses the box", () => {
    expect(OVERLAY).toMatch(/maxHeight:[\s\S]{0,500}max\(5\.5rem,\s*min\(/);
  });

  it("the sheet can never paint outside the box the cap gives it", () => {
    // Two halves, and BOTH are load-bearing: `overflow-hidden` on the section
    // (a `max-height` alone does not clip) and `min-h-0` on the scrolling body
    // (a flex column item refuses to shrink below its content without it).
    const section = OVERLAY.slice(OVERLAY.indexOf("pointer-events-auto flex w-full max-w-2xl"));
    expect(section.slice(0, 200)).toContain("overflow-hidden");
    expect(OVERLAY).toMatch(/className="min-h-0 min-w-0 shrink overflow-y-auto"/);
  });

  it("the tall case is still reachable, deliberately", () => {
    // §I11's own ruling: expanded, the sheet MAY cover the controls, „because
    // the student asked for it". A cap with no way past it would have made the
    // full checklist unreadable on the device that needs it most.
    expect(OVERLAY).toMatch(/aria-expanded=\{sheetExpanded\}/);
    expect(OVERLAY).toMatch(/setSheetExpanded/);
  });

  it("and an expand is one reading, not a mode — it resets when the sheet closes", () => {
    expect(OVERLAY).toMatch(/if \(!open\) setSheetExpanded\(false\)/);
  });
});
