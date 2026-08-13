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
 * ── §I11 + §W2 · THE READ MODE, AND WHY ITS TWO HALVES MAY NOT BE SEPARATED ──
 *
 * THE DEFECT, measured on the deployed build `d795eab`, WebKit, six profiles,
 * `hasCanvas === true` + a non-zero canvas rect + a mounted
 * `[data-hud="touch-controls"]` asserted before any number, with the panel
 * expanded from the INSTRUCTION hint (expanding the BELT WARNING instead is the
 * instrument error the previous commit is named after — see
 * `tools/mobile/wave8-panel-and-pro.mjs` header):
 *
 *   iphone16-landscape  panel 852×88 at y 8, full-bleed, 22.4 % of the screen
 *                       7 controls dead — 5 of 5 in the top rail, plus
 *                       «Меню на урока», plus its own «Разбрах» CLIPPED
 *   small-L / galaxy-L  88 px strips — 6 dead, 5 of 5 rail
 *   all three portraits 294–327 px, 34.5–41.9 % — 3 dead, 3 of 5 rail
 *
 * «Закопчай предпазния колан» and «Контроли на автомобила» were buried on 6 of
 * 6 profiles in BOTH orientations: the card telling a student to fasten the belt
 * standing on the button that fastens it.
 *
 * THE TRAP §I11 NAMES is that hiding the rail is self-defeating, because the
 * rail is where «КОЛАН» lives while the panel is pointing at it. So the answer
 * is not a z-order or a clearance — it is that a sentence of law and a row of
 * driving controls belong to different DURATIONS. The read surface takes the
 * screen and the CAR STOPS.
 *
 * ⚠ THE TWO HALVES ARE ONE CHANGE. The full-bleed geometry is a defect without
 * the pause, and the pause is pointless without the geometry. This block asserts
 * both, in one place, so neither can be reverted alone.
 */
describe("§I11 + §W2 the read mode stops the car, and that is what earns it the screen", () => {
  it("HALF 1 — opening the compact overlay sheet pauses the scene", () => {
    // `paused` reaches LessonScene as `physicsPaused` and TouchControls as
    // `hidden`, which releases both axes AND both pads' pointer ownership and
    // renders every button inert. That is what makes „the panel covers the
    // controls" true-and-fine instead of the 7-dead-controls measurement above.
    const paused = SHELL.slice(SHELL.indexOf("paused={\n"));
    expect(paused.slice(0, 400)).toMatch(
      /paused=\{[\s\S]{0,300}\boverlaySheetOpen\b[\s\S]{0,40}\}/,
    );
  });

  it("…and the shell still feeds that state from SimOverlay's own callback", () => {
    expect(SHELL).toMatch(/onOpenChange=\{setOverlaySheetOpen\}/);
    expect(SHELL).toMatch(/const \[overlaySheetOpen, setOverlaySheetOpen\] = useState\(false\)/);
  });

  it("HALF 2 — the read surface clears the instrument band and nothing else", () => {
    // It used to stand on `--sim-touch-floor` too. On a 393 px-tall stage that
    // left 95 px: a box whose own «Разбрах» is clipped by it, that STILL landed
    // on the rail (an 88 px box anchored at the bottom and grown upward lands
    // exactly there), and that fixed nothing it was written to fix.
    expect(OVERLAY).toMatch(/style=\{\{ bottom: "var\(--sim-dash-h, 0px\)" \}\}/);
    expect(OVERLAY).not.toMatch(/bottom:[^\n]{0,120}var\(--sim-touch-floor/);
  });

  it("…and its height is the whole screen above that band, capped by `--sim-vh`", () => {
    expect(OVERLAY).toMatch(
      /maxHeight: "calc\(var\(--sim-vh, 100dvh\) - var\(--sim-dash-h, 0px\) - 0\.75rem\)"/,
    );
    // `--sim-vh` and never `100%`: a percentage in `max-height` resolves against
    // a `bottom:`-anchored box of auto height — an indefinite reference the
    // engine answers by dropping the declaration. Measured once, deployed: the
    // cap did nothing and «Затвори» stood 123.5 px above the safe-area box.
    expect(OVERLAY).not.toMatch(/maxHeight:[^\n]{0,160}100%/);
  });

  it("…so the height cap has no budget left in it that a sentence can lose to", () => {
    // `0.62 of the viewport` was a budget against a road the student is no
    // longer driving; `max(5.5rem, min(…))` was the floor that budget needed.
    // Both are gone with the thing they were rationing.
    expect(OVERLAY).not.toMatch(/0\.62/);
    expect(OVERLAY).not.toMatch(/max\(5\.5rem,\s*min\(/);
  });

  it("the surface still cannot paint outside the box the cap gives it", () => {
    // Two halves, BOTH load-bearing: `overflow-hidden` on the section (a
    // `max-height` alone does not clip) and `min-h-0` on the scrolling body (a
    // flex column item refuses to shrink below its content without it).
    const section = OVERLAY.slice(OVERLAY.indexOf("pointer-events-auto flex w-full max-w-2xl"));
    expect(section.slice(0, 200)).toContain("overflow-hidden");
    expect(OVERLAY).toMatch(/className="min-h-0 min-w-0 shrink overflow-y-auto"/);
  });

  it("the «⤢» expand is gone, with the cap it was the escape hatch from", () => {
    // A 44 px control that toggles between the whole screen and the whole
    // screen is one of the founder's own three complaints, and it was taking a
    // third of the header's width on a 360 px phone.
    expect(OVERLAY).not.toMatch(/sheetExpanded/);
    expect(OVERLAY).not.toMatch(/Разгъни панела/);
  });

  it("the read mode announces itself to the whole document", () => {
    // `html[data-sim-overlay-read]` — the grammar `data-sim-car-sheet`,
    // `data-sim-camera` and `data-sim-glance` already use. Belt and braces: the
    // pause is the mechanism; this reaches the one live control the pause
    // cannot, which is the shell's own «Меню на урока» in a different tree.
    expect(OVERLAY).toMatch(/root\.dataset\.simOverlayRead = "open"/);
    expect(OVERLAY).toMatch(/delete root\.dataset\.simOverlayRead/);
  });

  it("…and the peek is replaced by it, never stacked with it", () => {
    // The precedent this whole wave copies. If both rendered, the ribbon would
    // be a second panel on a screen whose entire complaint is stacked panels.
    expect(OVERLAY).toMatch(/\{open \? null : \(/);
  });

  it("the shell still publishes `--sim-touch-floor` as an authored length", () => {
    // Its first consumer gave it back (the read mode has no live thumb band to
    // clear), but it is still true and still read — `tools/mobile/wave6-edges.mjs`
    // asserts clearances against it and `lib/insets.mjs` substitutes real insets
    // into it, which it can only do while this stays authored CSS.
    expect(SHELL).toMatch(
      /\["--sim-touch-floor" as string\]:[\s\S]{0,220}touchControlsFloorCss\("var\(--sim-vh, 100dvh\)"\)/,
    );
    expect(SHELL).toMatch(/\["--sim-touch-floor" as string\]:[\s\S]{0,220}"0px"/);
  });
});
