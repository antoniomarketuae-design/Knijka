import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * =============================================================================
 * THE ROAD TAKES NO BROWSER GESTURES — doc 91 §I6/§T1, and the two ways this
 * fix can be "tidied" into a regression.
 *
 * HIS WORDS: „the interface can move left/right and portions of the platform
 * can effectively slide outside the visible screen."
 *
 * WHAT IT IS NOT, measured on this branch (Chromium, 852×393, dpr 3, the
 * project's real insets, `matchMedia("(pointer: coarse)")` verified true and
 * `data-sim-compact="on"`, so this was the phone layout and not the desktop one
 * an in-app pane renders): `documentElement.scrollWidth === clientWidth === 852`
 * and a walk of every rendered element found ZERO nodes crossing 100vw or with
 * a negative left edge. A one-finger drag left `scrollX` and
 * `visualViewport.offsetLeft` at 0. There is no overflow, so `overflow-x:
 * hidden` would hide nothing — it would only stop us finding the real cause.
 *
 * WHAT IT IS: the VISUAL viewport. A real two-finger pinch — fired through CDP
 * `Input.dispatchTouchEvent` with an explicit two-point `touchPoints` array,
 * because Playwright's touchscreen is single-tap and cannot express a pinch —
 * took the road to `visualViewport.scale` 5, and one finger then panned it to
 * `offsetLeft` 247. Post-fix, the identical gesture leaves scale 1 and
 * offsetLeft 0, while a known-zoomable POSITIVE CONTROL still zooms 1 → 5 in
 * the same instrument. (That control is not decoration: the audit had to throw
 * away an entire gesture lane whose "no zoom anywhere" turned out to be a blind
 * instrument.)
 *
 * ── THE TWO REGRESSIONS THIS FILE EXISTS TO CATCH ───────────────────────────
 *
 *  1. MOVING THE DECLARATION UP THE TREE. `touch-action` resolves up the DOM
 *     ancestor chain, so `none` on the shell or on `data-sim-stage` also
 *     disables touch SCROLLING in every descendant — and the stage contains a
 *     full-screen overlay scroller, while the pre-drive tutorial card is
 *     743–821 px tall in a 393 px viewport with its «Разбрах» 300–423 px below
 *     the fold on 13 of 13 landscape steps (§L8). Scrolling that card is the
 *     only way to complete a step. Hoisting this one line would trade a
 *     nuisance for an unwinnable lesson, and it would look like a cleanup.
 *
 *  2. REACHING FOR THE VIEWPORT META. `maximum-scale` / `user-scalable=no` in
 *     app/layout.tsx is the famous answer and it is wrong twice over: that
 *     export is GLOBAL, so it would disable pinch-zoom on the theory and exam
 *     screens where minors read dense Bulgarian legal text (an accessibility
 *     regression), and iOS Safari has ignored both since iOS 10, so it would
 *     not even fix the phone that reported the bug.
 * =============================================================================
 */

const nl = (s: string): string => s.replace(/\r\n/g, "\n");

const SHELL = nl(readFileSync(join(__dirname, "LessonPlayShell.tsx"), "utf8"));
/** The shell with comments stripped — this file's prose quotes the very
 *  attributes it forbids, and a substring search must not find the story
 *  about the bug instead of the bug. */
const SHELL_CODE = SHELL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LAYOUT = nl(readFileSync(join(__dirname, "..", "..", "..", "app", "layout.tsx"), "utf8"));
const LAYOUT_CODE = LAYOUT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("§1 the driving stage refuses browser gestures", () => {
  it("the wrapper that holds the scene declares touch-action: none", () => {
    // The element whose only child is <SceneSlot>: the road, and nothing else.
    const wrapper = SHELL_CODE.match(
      /<div className="h-full w-full"[^>]*>\s*\n\s*<SceneSlot/,
    );
    expect(
      wrapper,
      "the scene wrapper must still be the `h-full w-full` div directly around <SceneSlot>",
    ).not.toBeNull();
    expect(wrapper?.[0]).toContain('touchAction: "none"');
  });

  it("a pinch has nowhere to start ON THE ROAD (the declaration is not merely present somewhere)", () => {
    // Guards against the line surviving on some unrelated element after a
    // refactor moves <SceneSlot>.
    const idxDecl = SHELL_CODE.indexOf('touchAction: "none"');
    const idxSlot = SHELL_CODE.indexOf("<SceneSlot");
    expect(idxDecl).toBeGreaterThan(0);
    expect(idxSlot).toBeGreaterThan(idxDecl);
    // …and immediately before it, not 400 lines away.
    expect(idxSlot - idxDecl).toBeLessThan(120);
  });
});

describe("§2 it stays scoped — the hoist that would brick the pre-drive", () => {
  it("does NOT sit on the shell root", () => {
    const shellRoot = SHELL_CODE.slice(
      SHELL_CODE.indexOf('data-sim-shell=""'),
      SHELL_CODE.indexOf('data-sim-shell=""') + 600,
    );
    expect(
      shellRoot,
      "touch-action:none on the shell would disable scrolling in every overlay under it",
    ).not.toContain('touchAction: "none"');
  });

  it("does NOT sit on data-sim-stage, which contains the overlay scrollers", () => {
    const stage = SHELL_CODE.slice(
      SHELL_CODE.indexOf('data-sim-stage=""'),
      SHELL_CODE.indexOf('data-sim-stage=""') + 600,
    );
    expect(
      stage,
      "the stage runs to the end of the component and holds the scrollable cards",
    ).not.toContain('touchAction: "none"');
  });

  it("exactly one element in the shell carries it", () => {
    const hits = SHELL_CODE.match(/touchAction: "none"/g) ?? [];
    expect(hits.length).toBe(1);
  });

  it("the overlay scroller inside the stage is still a scroller", () => {
    // If this ever stops being true the fix above has no cost to weigh, and the
    // §2 assertions become meaningless rather than false.
    expect(SHELL_CODE).toMatch(/overflow-y-auto/);
  });
});

/**
 * =============================================================================
 * §2b — AND THE ROAD WAS ONLY HALF THE SURFACE.
 *
 * §1 and §2 above are correct and they were not enough, which this section
 * exists to state rather than imply. `touch-action` is intersected across the
 * elements the TOUCH POINTS are over, and every card on this screen — the
 * notification peek, the teach sheet, the first-run hint, the pre-drive
 * tutorial — is a SIBLING of the scene wrapper, not a descendant of it. So the
 * scoping §2 defends also meant a pinch that started on a card was never
 * covered, and a card is exactly where his thumbs are while a card is up.
 *
 * MEASURED ON THE DEPLOYED PRODUCT (tools/mobile/wave6-edges.mjs, Chromium with
 * the Fullscreen API refused so the shell takes the same `immersive` arm iOS
 * Safari takes, authenticated /simulator, live canvas asserted, iPhone 16
 * landscape, real insets):
 *
 *     pinch on the road   scale 1 → 1      offsetLeft 0 → 0
 *     pinch on a CARD     scale 1 → 1.28   offsetLeft 0 → 145   ← his complaint
 *     positive control    /theory 1 → 3.568                     ← instrument honest
 *
 * THE ANSWER IS `pan-y` ON THE SHELL ROOT, AND THE VALUE IS THE WHOLE CARE.
 * `none` there is the regression §2 forbids — it would kill the tutorial card's
 * scroller and with it the only way to finish a step. `pan-y` removes exactly
 * two behaviours, pinch-zoom and horizontal pan, and leaves every vertical
 * scroller in the subtree working. A descendant can only ever narrow what an
 * ancestor allows, so the scene wrapper's `none` is unaffected.
 * =============================================================================
 */
describe("§2b no card is a doorway back to pinch-zoom", () => {
  it("the shell root declares touch-action: pan-y", () => {
    expect(
      SHELL_CODE,
      "the driving shell must refuse pinch-zoom on EVERY surface it owns, not just the road",
    ).toMatch(/touchAction:\s*"pan-y"/);
  });

  it("…and it is gated on the shell owning the screen, so a roomy page is untouched", () => {
    const decl = SHELL_CODE.match(/\.\.\.\((immersive|isFullscreen)[^)]*\?\s*\{\s*touchAction:\s*"pan-y"\s*\}/);
    expect(
      decl,
      "pan-y must be conditional on `immersive || isFullscreen` — the letterboxed shell is a " +
        "component on an ordinary scrolling page and must not change that page's gestures",
    ).not.toBeNull();
  });

  it("it is pan-y and never none — `none` here is the §2 regression by another name", () => {
    // A future tidy-up that "simplifies" pan-y to none passes §2 (which only
    // looks 600 chars past the attribute) and bricks the pre-drive. Count both.
    const panY = SHELL_CODE.match(/touchAction:\s*"pan-y"/g) ?? [];
    const none = SHELL_CODE.match(/touchAction:\s*"none"/g) ?? [];
    expect(panY.length, "exactly one shell-level declaration").toBe(1);
    expect(none.length, "exactly one scene-wrapper declaration").toBe(1);
  });

  it("the theory and exam screens are not touched by any of this", () => {
    // The declaration lives on an element that only exists inside a session.
    // If it ever moves to <body>, html, or a layout, this catches it.
    expect(LAYOUT_CODE).not.toMatch(/touchAction/);
  });
});

describe("§3 the global viewport meta is left alone (accessibility, and it would not work anyway)", () => {
  it("declares no maximum-scale", () => {
    expect(LAYOUT_CODE).not.toMatch(/maximumScale/);
  });

  it("declares no user-scalable", () => {
    expect(LAYOUT_CODE).not.toMatch(/userScalable/);
  });

  it("still ships viewportFit: cover (the founder's black sides)", () => {
    expect(LAYOUT_CODE).toMatch(/viewportFit:\s*"cover"/);
  });
});
