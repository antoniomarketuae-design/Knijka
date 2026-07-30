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

      /* ------------------------------------------------------------------
         THE MIRROR AND THE HUD — rows B74 / B76.

         The chase view now carries a PERSISTENT rear-view window and Q/E/F
         open it to full size on the glanced side (CameraRig +
         scene/chaseRearView.ts). That window is a quad INSIDE the WebGL
         canvas, so every DOM card painted over the canvas covers it, whatever
         renderOrder it carries — which is exactly what the audit photographed:
         the „Клавиши" legend over ~60 % of the Q window, the toast card over
         half of the E one, the objective chips over the top 40 % of F.

         An instrument you cannot see is not an instrument, so the HUD moves,
         not the mirror. CameraRig publishes on the document root which camera
         is live, whether a glance is held and on which side, and the two window
         edges in CSS pixels; these rules step each panel below whichever edge
         concerns it. Nothing is hidden — a teaching card that arrives
         mid-glance is still on screen, one window-height lower, and it slides
         back the moment the key is released.

         Written here, in the shell's own stylesheet, for the same reason the
         two rules above are: the panels belong to three different components in
         two different lanes, and their only shared vocabulary is data-hud.
         ------------------------------------------------------------------ */
      [data-hud="controls-help"],
      [data-hud="follow-hint"],
      [data-hud="objective-stack"] {
        transition: top 180ms ease-out;
      }
      [data-hud="toasts"] {
        transition: margin-top 180ms ease-out;
      }
      [data-hud="difficulty"] {
        transition: opacity 140ms ease-out;
      }
      @media (prefers-reduced-motion: reduce) {
        [data-hud="controls-help"],
        [data-hud="follow-hint"],
        [data-hud="objective-stack"],
        [data-hud="difficulty"],
        [data-hud="toasts"] {
          transition: none;
        }
      }

      /* The interior mirror hangs where the objective banner used to start, so
         the banner starts under it — for the whole time the chase camera is
         live, because the mirror is permanent. The „follow the blue line" chip
         sits at top-16, i.e. inside the same glass, and goes with it. */
      html[data-sim-camera="chase"] [data-hud="objective-stack"] {
        top: calc(0.75rem + var(--sim-mirror-h, 0px));
      }
      html[data-sim-camera="chase"] [data-hud="follow-hint"] {
        top: calc(4rem + var(--sim-mirror-h, 0px));
      }

      /* …and while a glance is HELD the window is full size and on that side. */
      html[data-sim-glance="left"] [data-hud="controls-help"] {
        top: calc(0.75rem + var(--sim-glance-h, 0px));
      }
      html[data-sim-glance="rear"] [data-hud="objective-stack"] {
        top: calc(0.75rem + var(--sim-glance-h, 0px));
      }
      html[data-sim-glance="rear"] [data-hud="follow-hint"] {
        top: calc(4rem + var(--sim-glance-h, 0px));
      }
      html[data-sim-glance="right"] [data-hud="toasts"] {
        margin-top: var(--sim-glance-h, 0px);
      }

      /* The tier picker shares the top-right corner with the E window and with
         the toast column, and three things do not fit in one corner. It is the
         only one of the three that carries no information — Начинаещ /
         Нормален / Напреднал is a SETTING, and a setting you are not touching
         while your head is turned. So it stands down for the second the glance
         lasts, instead of being stepped into the toasts' new place. A teaching
         card is never treated this way: it moves, it does not disappear. */
      html[data-sim-glance="right"] [data-hud="difficulty"] {
        opacity: 0;
        pointer-events: none;
      }

      /* ------------------------------------------------------------------
         ROW C7 — one speedometer per screen.

         In the cockpit camera the „Виток" 3D cluster draws speed and the
         selector letter inside the cabin, at the resolution four review rounds
         were spent on. The compact readout was drawing both AGAIN, 40 px lower,
         because it had no way to know which camera was live; the audit frame has
         the analogue dial, its digital „0 км/ч" and its „D" in the same picture
         as a DOM „D 0 км/ч". Two speedometers do not make a student faster at
         reading one.

         What does NOT go away is the limit disc: the cluster shows what the car
         is doing, never what the law allows, and speed discipline is the whole
         claim of this product. So in the cockpit the readout is exactly the one
         number the instrument panel cannot give you.

         Chase and top-down are untouched — there the cluster is not in frame at
         all, which is why this readout was kept in the first place.
         ------------------------------------------------------------------ */
      html[data-sim-camera="cockpit"] [data-hud="speed-block"] {
        display: none;
      }

      /* ------------------------------------------------------------------
         ROW C2 — 44 px under the thumb, 0 px more paint.

         Measured in WebKit on iPhone 16: „Начинаещ" 75.6×24.5, „Нормален"
         73.5×24.5, „Напреднал" 78.8×24.5 and „🎬 Демонстрация ▸" 137.2×26.5.
         Wide enough, half as tall as a thumb needs.

         Growing the buttons would have grown the chrome with them — the tier
         group alone is already 2.6 % of a landscape phone, and this is the
         screen the founder measured as „half furniture". So the TAP AREA grows
         and the pill does not: an absolutely positioned ::before at −0.75 rem
         top and bottom puts the hit rect at 24.5 + 24 ≈ 48 px. A pseudo-element
         paints nothing and is in no DOM, so it is charged nothing — and the
         mobile probe unions exactly these insets into the measured hit rect
         (tools/mobile/lib/probe.mjs, „a common and legitimate trick").
         ------------------------------------------------------------------ */
      [data-sim-compact="on"] [data-hud="difficulty"] button,
      [data-sim-compact="on"] [data-hud="demo-deck"] > button {
        position: relative;
      }
      [data-sim-compact="on"] [data-hud="difficulty"] button::before,
      [data-sim-compact="on"] [data-hud="demo-deck"] > button::before {
        content: "";
        position: absolute;
        top: -0.75rem;
        bottom: -0.75rem;
        left: 0;
        right: 0;
      }
    `}</style>
  );
}
