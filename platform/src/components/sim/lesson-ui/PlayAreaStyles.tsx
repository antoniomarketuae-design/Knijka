"use client";

import { TOUCH_CONTROLS_FLOOR } from "../TouchControls";

/**
 * One CSS rule, mounted by the play shell: while a LETTERBOXED session is on
 * screen, the page's prose width cap does not apply to it.
 *
 * WHY IT IS A GLOBAL SELECTOR AND NOT A CLASS. The cap does not live on the
 * shell — it lives on the (dashboard) group's
 * `<main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">`,
 * a 72 rem reading measure that is exactly right for the theory reader, the
 * exam runner and the lesson-select shelf, and exactly wrong for a driving
 * simulator. Measured in the harness at 1920×1080: it held the picture to
 * 1088×612 with 824 px of empty column beside it (founder review 2026-07-28:
 * „there is alot of dark space that we can use to make the screen bigger").
 * The shell cannot widen an ancestor from the inside, and editing the layout
 * would widen every dashboard page, not the one that needs it.
 *
 * `:has()` scopes it precisely: the cap lifts only for a <main> that currently
 * contains a letterboxed session, and drops back the instant the session ends
 * or goes fullscreen (the attribute is absent in the immersive layout). The
 * sidebar is untouched — <main> is a grid column, so it grows into the content
 * area and never under the nav.
 *
 * Specificity/cascade: `main:has([data-sim-play])` is (0,1,1) against
 * `.max-w-6xl` (0,1,0), and this <style> is unlayered while Tailwind's
 * utilities are layered — it wins on both counts.
 *
 * The padding goes with it, and to the same 0.5 rem the IMMERSIVE layout
 * already uses (`p-2` on the shell root) — so entering fullscreen is a change
 * of size, not a change of framing. On a 1366×768 laptop the column is already
 * narrower than the 72 rem cap, so the padding is the only lever there at all
 * (1044 px → 1094 px of picture); on a 1920×1080 window it is worth another
 * 48 px on top of the cap being lifted.
 *
 * GRACEFUL DEGRADATION IS THE POINT of doing it this way: a browser without
 * `:has()` simply keeps today's layout (a 16:9 picture in the reading column),
 * which is a smaller picture, never a broken one. The height cap the shell
 * applies inline is independent of this rule and works everywhere.
 */
export function PlayAreaStyles() {
  return (
    <style>{`
      main:has([data-sim-play="letterbox"]) {
        max-width: none;
        padding: 0.5rem;
      }

      /* ------------------------------------------------------------------
         COMPACT (phone-shaped viewport, 2026-07-28 second pass).

         Two pieces of DESKTOP chrome are rendered by the scene itself, not by
         this shell, and both land in the corner the micro menu needs:

           [data-hud="controls-help"]  the „⌨ Клавиши" keyboard legend, at
             left-3 top-3 — a list of key bindings on a device with no keys.
             It is already collapsed on touch, but the chip still sits exactly
             where the one control a phone DOES need has to go.
           [data-hud="difficulty"]     the Начинаещ/Нормален/Напреднал picker
             at right-3 top-3. It stays (difficulty is a real choice), it just
             moves clear of the notch now that the app ships viewport-fit=cover
             and that corner can be under a cutout.

         A CSS rule and not a prop, deliberately: LessonScene belongs to the
         scene lane, both elements already carry stable data-hud names, and a
         media-query-free rule driven by the shell's own attribute keeps ONE
         definition of "compact" in the codebase (immersive.ts) instead of a
         second one written in @media that would drift from it.
         ------------------------------------------------------------------ */
      [data-sim-compact="on"] [data-hud="controls-help"] {
        display: none;
      }
      [data-sim-compact="on"] [data-hud="difficulty"] {
        right: calc(0.75rem + env(safe-area-inset-right, 0px));
        top: calc(0.5rem + env(safe-area-inset-top, 0px));
      }

      /* ------------------------------------------------------------------
         …and the same treatment for the demonstration deck, which is the
         third piece of scene-owned chrome tuned on a roomy screen.

         It sits at bottom-[6.75rem] — 108px, ROOMY_HUD_FLOOR_PX — and on a
         phone that is inside the control band. So is --sim-hud-floor, which
         resolves to 48px on every phone in the ladder (40px of instrument band
         plus 8): that variable is where the DASH ends, and the touch pads reach
         176px above the bottom, 68px higher than this deck was sitting.

         Measured in WebKit (tools/mobile/stability-probe.mjs) on iPhone 16
         PORTRAIT 393x852 and on a 360x780 Android: the deck is
         min(88%, 26rem) = 346px wide, the steering pad occupies x 0-165 and
         the drive pad x 252-393, so there is no horizontal gap for it to sit
         in — it overlapped the wheel by 981px² and the throttle by 363px².
         Landscape was clean at the same 108px only because the two pads are
         644px apart there. That is how a constant tuned in landscape survived
         a portrait review.

         TOUCH_CONTROLS_FLOOR is interpolated from TouchControls rather than
         written out here: the pads are the one thing on this screen actively
         being reshaped, and whatever the band becomes, this follows it.
         ------------------------------------------------------------------ */
      [data-sim-compact="on"] [data-hud="demo-deck"] {
        bottom: ${TOUCH_CONTROLS_FLOOR};
      }
    `}</style>
  );
}
