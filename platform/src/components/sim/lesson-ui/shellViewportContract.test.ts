import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lessonById } from "@/modules/sim/lessons";
import { collectProps, mountHook } from "@/modules/sim/hud/__tests__/hookHarness";
import { LessonPlayShell } from "./LessonPlayShell";

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
    expect(SHELL).toMatch(/useVisualViewportBox\(\s*immersive\s*\|\|\s*isFullscreen\s*\)/);
  });

  it("and NEVER again by `immersive && !isFullscreen` — that conjunction IS the bug", () => {
    expect(SHELL).not.toMatch(/useVisualViewportBox\([^)]*&&\s*!isFullscreen/);
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
 * ── 2026-08-14 · THE OTHER THREE AXES ───────────────────────────────────────
 *
 * The founder photographed the simulator on his iPhone 16 Pro with the HUD cut
 * on BOTH edges at once — «ЕНЮ» sliced left and «Л ЛЯВО» sliced right in one
 * frame. Height had followed `visualViewport` since §I7; width, left and top
 * still came from the class list (`fixed left-0 top-0 w-full`), i.e. the LAYOUT
 * viewport. Under site zoom that box is wider than the window, so both ends
 * hang off the screen.
 *
 * ⚠ THE NUMBERS THAT USED TO STAND HERE WERE MEASURED ON A PHONE NOBODY OWNS,
 *   AND ARE REPLACED BELOW (O30, 2026-08-19).
 *
 * The rig that produced them — `tools/mobile/zoom-follows-window.mjs` — opened
 * its own `browser.newContext({ viewport: {402, 874}, … })` instead of going
 * through `lib/insets.mjs`'s `newDeviceContext`. A bare Playwright context has
 * no safe-area emulation, so `env(safe-area-inset-*)` resolved to 0 and the app
 * laid out with no camera housing and no home indicator. `insets.test.mjs:140`
 * („newDeviceContext is the one door") had convicted that line since the day it
 * was added; the gate that runs it is a FOURTH runner nobody was invoking.
 * The rig is fixed. The reading it produced was still quoted here, and a
 * corrected instrument that leaves its old readings standing has fixed nothing.
 *
 * RE-MEASURED 2026-08-19 on the profile that has a notch — same rig, now
 * through the one door; Chromium (CDP is the only API that can express the
 * gesture), iPhone 16 Pro portrait 402×874, insets REAL t59 r0 b34 l0,
 * `KNIJKA_BASE`/base = http://localhost:3460, a harness `next dev` serving THIS
 * TREE at 7404468 (`/api/health` commit-stamped and checked — the hardcoded
 * staging tunnel reports `commit: "unknown"` and measures somebody else's
 * build), authenticated /simulator?scenario=sc-zebra-approach&level=1.
 *
 * BOTH CONTROLS PASSED BEFORE A NUMBER WAS READ, which is the whole reason
 * these are quotable at all:
 *   inset control     58 CSS + 85 inline declarations rewritten over 50 passes,
 *                     <body> padded l0 r0 b34 — i.e. the notch really is on
 *   positive control  visualViewport.scale 1 → 1.15, window 402×874 → 350×760
 *
 *   post-fix (this tree)  shell 349×760 in a 350×760 window
 *                         → 0 HUD text nodes off-screen: horizontal 0, vertical 0
 *   pre-fix   (the same tree with the three lines below reverted to the layout
 *              viewport — `...(false ? { left, top, width } : null)`)
 *                         shell 402×760 in the same 350×760 window
 *                         → 8 off-screen, all horizontal, cut 40–43 px:
 *                           «Колан», «Огледало» ×3 (the whole right rail), the
 *                           instruction line, step 2, «↓ още 23 реда», «Разбрах»
 *
 * AND THE FRAME WAS LOOKED AT, both legs, because „0 off-screen" on a page with
 * no HUD on it is this project's signature instrument bug: the post-fix frame
 * shows a mounted cockpit with МЕНЮ/ИЗГЛЕД/ПАУЗА, both flanks, the instruction
 * card and the cluster — about fifteen text nodes for the 0 to be a count OF.
 *
 * WHAT MOVED AGAINST THE STALE READING, and both moved in the REASSURING
 * direction, which is the direction this project's instruments always fail in:
 * 7 nodes → 8, and „cut by 33–40 px" → 40–43 px. The width axis is unaffected
 * by the substitution (left/right insets are 0 in portrait), so the delta is
 * the ladder's own context — locale, colour scheme, an explicit motion mode —
 * arriving with the door. The VERTICAL half is the half that was never a claim
 * at all: the old „0 off-screen" summed all four edges with 34 px of home
 * indicator missing from every `env(safe-area-inset-bottom)` the HUD authors.
 * It is now measured and it is 0.
 *
 * Note the fix is NOT pinch suppression: §I6 already stops a pinch on the
 * driving canvas, and the rig's positive control proved it does. Safari stores
 * zoom PER SITE, so the zoom arrives from the lesson list, the dashboard or a
 * theory screen — where pinch is deliberately allowed for minors reading legal
 * text — and no gesture handler on the sim can undo it. The shell has to follow
 * the window instead. There is also no API to reset browser zoom, and Safari
 * has ignored `user-scalable` / `maximum-scale` since iOS 10.
 */
describe("the shell follows the VISIBLE window on every axis, not just height", () => {
  it("left, top and width are driven by the measured box", () => {
    expect(SHELL).toMatch(/left:\s*`\$\{viewportBox\.left\}px`/);
    expect(SHELL).toMatch(/top:\s*`\$\{viewportBox\.top\}px`/);
    expect(SHELL).toMatch(/width:\s*`\$\{viewportBox\.w\}px`/);
  });

  it("they stand down together with the height, inside the same non-fullscreen arm", () => {
    // Same argument as the height pin above: in fullscreen the UA sizes the
    // element, and pinning it to the visual viewport there would fight it.
    expect(SHELL).toMatch(/viewportBox !== null\s*\n?\s*\?\s*\{\s*\n?\s*left:/);
  });

  it("the box tracks PANNING, not only zooming", () => {
    // offsetLeft/offsetTop change on `scroll`, not `resize`. Losing this
    // listener leaves the shell correct in size and in the wrong place — which
    // still puts the left rail off the screen.
    expect(SHELL).toMatch(/vv\?\.addEventListener\("scroll", read\)/);
  });

  it("the compact decision reads the visible width, not the layout width", () => {
    expect(SHELL).toMatch(/vv\?\.width \?\? window\.innerWidth/);
    expect(SHELL).not.toMatch(/isCompactViewport\(\s*\n?\s*window\.innerWidth/);
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
    // Matched as a TERM inside the expression rather than as its last line:
    // §W3 added `playMenuOpen` after it, and an assertion that breaks when a
    // second correct term joins the seam is an assertion that teaches people to
    // delete assertions.
    const paused = SHELL.slice(SHELL.indexOf("paused={\n"));
    const expr = paused.slice(0, paused.indexOf("driveLocked="));
    expect(expr).toMatch(/\boverlaySheetOpen\b/);
    expect(expr.length).toBeLessThan(900);
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

/**
 * ── §W3 · «МЕНЮ НА УРОКА» IS A PAUSED-STATE OBJECT ──────────────────────────
 *
 * The defect wave 9 closed one surface and left open on the next. Measured on
 * the deployed build (f85f49a), WebKit, real insets, six profiles, THE CAR
 * MOVING and `paused false`:
 *
 *   landscape  both indicator stations dead under the sheet; on the Samsung
 *              gesture-bar 780×360 THE STEERING PAD ITSELF, 208×160, 24 602 px²
 *   portrait   «Клаксон», «Кола» and «Колан» dead
 *   6 of 6     2–3 live controls answering for the menu instead of themselves
 *
 * There is no geometric fix and the arithmetic is on PlayMenu's `onOpenChange`:
 * eight rows, landscape already two-column to keep the seventh above the fold,
 * both flanks owned by the arc from the corner down, 360 px of stage.
 *
 * So it is the same answer as the read mode, one surface over — every row in
 * there is a between-attempts decision, so the car stops while it is up and the
 * covering stops being a defect. ⚠ AND THE TWO HALVES ARE ONE CHANGE, exactly
 * as they are for the read mode: without the pause this is 24 602 px² of dead
 * steering pad; without the sheet there is nothing to pause for.
 */
describe("§W3 the lesson menu stops the car too", () => {
  it("HALF 1 — opening «Меню на урока» pauses the scene", () => {
    const paused = SHELL.slice(SHELL.indexOf("paused={\n"));
    const expr = paused.slice(0, paused.indexOf("driveLocked="));
    expect(expr).toMatch(/\bplayMenuOpen\b/);
  });

  it("HALF 2 — and the shell feeds that state from PlayMenu's own callback", () => {
    expect(SHELL).toMatch(/const \[playMenuOpen, setPlayMenuOpen\] = useState\(false\)/);
    expect(SHELL).toMatch(/onOpenChange=\{setPlayMenuOpen\}/);
  });

  it("…published by an EFFECT, so no close path can leave the car frozen", () => {
    // The sheet closes from the trigger, from `onChosen` on every row, and on
    // unmount. A callback wired at one call site and not the others is a car
    // that stays stopped after the menu has gone — worse than the defect.
    const menu = SHELL.slice(SHELL.indexOf("function PlayMenu("));
    expect(menu.slice(0, 2600)).toMatch(/useEffect\(\(\) => \{\s*onOpenChange\?\.\(open\);\s*\}, \[open, onOpenChange\]\)/);
    expect(menu.slice(0, 2600)).toMatch(/useEffect\(\(\) => \(\) => onOpenChange\?\.\(false\), \[onOpenChange\]\)/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   §RUN — THE SHELL IS MOUNTED AND ITS EFFECTS ARE RUN.

   ── WHY THIS SECTION EXISTS, MEASURED ───────────────────────────────────────

   Everything above this line is a source pin, and on 2026-08-19 the whole file
   was proved to guard nothing by running it against its own defect restored.
   THE MUTATION, which leaves every string above intact character for character:

       function useVisualViewportBox(active: boolean): VisualViewportBox | null {
         const [box, setBox] = useState<VisualViewportBox | null>(null);
         useEffect(() => {
           if (!active) return;
    +      if (1 > 0) return;            ← the hook now publishes nothing, ever

   `useVisualViewportBox(immersive || isFullscreen)` still reads exactly as §I7
   demands; ``left: `${viewportBox.left}px` `` is still in the style object; the
   `vv?.addEventListener("scroll", read)` line is still there to be grepped.
   THE FILE RAN 24/24 GREEN.

   AND THE SAME DEFECT WAS THEN DRIVEN ON A PHONE, because a vitest verdict is
   not the product. Reverting the three inline axes to the layout viewport
   (`...(false ? { left, top, width } : null)`) and re-running
   `tools/mobile/zoom-follows-window.mjs` against this tree on localhost:3460 put
   EIGHT HUD text nodes off the visible window at page scale 1.15 — «Колан», all
   three «Огледало» of the right rail, the instruction line, step 2, «↓ още 23
   реда» and «Разбрах», cut by 40–43 px. That is the founder's own photograph,
   reproduced, while this file stayed green.

   So the source pins keep their job — they are the cheap net that catches a
   plausible-looking edit in a diff — and the rows below add the one thing they
   cannot do, which is EXECUTE. The shell is called with a real dispatcher
   (`hookHarness.ts`, the technique `touchPadRelease.test.tsx` §7 proved), so
   `useVisualViewportBox` runs, its listeners register on a recording
   `visualViewport`, and the style object the shell hands its root is read off
   the returned tree rather than off the file.

   WHAT THIS CANNOT DO, stated so nobody reads more into it: there is no layout
   engine here. These rows prove the shell PUBLISHES the window it measured;
   only the probe above proves that the published box keeps the rails on screen.
   ═══════════════════════════════════════════════════════════════════════════ */

/** A `visualViewport` that records who subscribed to it, and can be moved. */
function recordingViewport(box: { width: number; height: number; left: number; top: number }) {
  const listeners: Array<{ type: string; fn: () => void }> = [];
  return {
    width: box.width,
    height: box.height,
    offsetLeft: box.left,
    offsetTop: box.top,
    scale: 1,
    listeners,
    addEventListener(type: string, fn: () => void) {
      listeners.push({ type, fn });
    },
    removeEventListener(type: string, fn: () => void) {
      const at = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (at >= 0) listeners.splice(at, 1);
    },
    /** What the engine does when the student pinches or pans. */
    moveTo(next: Partial<{ width: number; height: number; left: number; top: number }>) {
      if (next.width !== undefined) this.width = next.width;
      if (next.height !== undefined) this.height = next.height;
      if (next.left !== undefined) this.offsetLeft = next.left;
      if (next.top !== undefined) this.offsetTop = next.top;
      for (const l of [...listeners]) l.fn();
    },
  };
}

/** Mount the shell with the window a zoomed phone reports. */
function mountShell(vv: ReturnType<typeof recordingViewport> | null) {
  return mountHook(
    () =>
      LessonPlayShell({
        lesson: lessonById("l0-free-drive")!,
        quality: "auto",
        nextLesson: null,
        onExitToSelect: () => undefined,
        onStartLesson: () => undefined,
      } as unknown as Parameters<typeof LessonPlayShell>[0]),
    { window: { visualViewport: vv, innerWidth: 402, innerHeight: 874 } },
  );
}

/** The style object the shell hands its own root, read off the returned tree. */
function shellRootStyle(tree: unknown): Record<string, unknown> {
  const roots = collectProps(tree, (p) => "data-sim-shell" in p);
  expect(roots.length, "the shell must still render exactly one `data-sim-shell` root").toBe(1);
  return (roots[0]!.style ?? {}) as Record<string, unknown>;
}

describe("§RUN the mounted shell really measures the window and publishes it", () => {
  it("THE MUTATION ROW: left/top/width/height come from the VISIBLE window", () => {
    // The founder's zoom, as the probe measured it: a 402x874 phone whose
    // visual viewport is 350x760 once Safari's «AA» is one notch up. The
    // fractional pixels are deliberate — §I7's own comment says sizes floor and
    // offsets round, and a whole-pixel fixture could not tell the two apart.
    const vv = recordingViewport({ width: 350.6, height: 760.4, left: 12.4, top: 3.6 });
    const m = mountShell(vv);
    const style = shellRootStyle(m.settle());

    expect(style.width, "the shell took the LAYOUT width — the founder's picture").toBe("350px");
    expect(style.height).toBe("760px");
    expect(style.left).toBe("12px");
    expect(style.top).toBe("4px");
    m.unmount();
  });

  it("THE OTHER DIRECTION: with no visualViewport it falls back and publishes NO nonsense", () => {
    // An engine without the API — and the same branch a server render takes.
    // The measured contract is that it falls back to the WINDOW's own numbers,
    // not that it publishes nothing: `window.innerWidth/innerHeight` at 0,0.
    // What it must never do is publish `NaNpx`, which would put the rails off
    // the screen of every browser that never had the defect. A false failure is
    // as bad as a false certificate, so this row asserts the fallback rather
    // than forbidding it.
    const m = mountShell(null);
    const style = shellRootStyle(m.settle());
    expect(style.width).toBe("402px");
    expect(style.height).toBe("874px");
    expect(style.left).toBe("0px");
    expect(style.top).toBe("0px");
    for (const [axis, v] of Object.entries(style)) {
      if (typeof v === "string") expect(v, `${axis} is not a number`).not.toContain("NaN");
    }
    m.unmount();
  });

  it("it tracks PANNING, not only zooming — it subscribes to `scroll` as well", () => {
    // offsetLeft/offsetTop change on `scroll`, never on `resize`. Losing this
    // subscription leaves the shell the right SIZE in the wrong PLACE, which
    // still puts the left rail off the screen.
    //
    // The subscription is asserted by KIND and not by count: two independent
    // hooks watch `resize` on this object (the box and the compact decision),
    // and a count would turn a correct second reader into a red test about
    // nothing — the „exact-line assertion" trap thumb-band-clearance names.
    const vv = recordingViewport({ width: 350, height: 760, left: 0, top: 0 });
    const m = mountShell(vv);
    m.settle();
    expect(vv.listeners.some((l) => l.type === "scroll"), "nothing watches panning").toBe(true);
    expect(vv.listeners.some((l) => l.type === "resize")).toBe(true);

    vv.moveTo({ left: 145, top: 20 });
    const style = shellRootStyle(m.settle());
    expect(style.left, "a pan moved the window and the shell stayed behind").toBe("145px");
    expect(style.top).toBe("20px");
    m.unmount();
  });

  it("…and a re-zoom moves the size axes with it", () => {
    const vv = recordingViewport({ width: 402, height: 874, left: 0, top: 0 });
    const m = mountShell(vv);
    expect(shellRootStyle(m.settle()).width).toBe("402px");

    vv.moveTo({ width: 350, height: 760 });
    const zoomed = shellRootStyle(m.settle());
    expect(zoomed.width).toBe("350px");
    expect(zoomed.height).toBe("760px");
    m.unmount();
  });

  it("it unsubscribes on unmount — no listener outlives the lesson", () => {
    const vv = recordingViewport({ width: 350, height: 760, left: 0, top: 0 });
    const m = mountShell(vv);
    m.settle();
    expect(vv.listeners.length, "nothing subscribed — the mount is not exercising it").toBeGreaterThan(0);
    m.unmount();
    expect(vv.listeners.length, "a shell that leaks these leaks one per lesson").toBe(0);
  });
});
