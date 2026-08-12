/**
 * How big the NON-fullscreen simulator picture is allowed to get.
 *
 * WHY THIS FILE EXISTS. Founder review 2026-07-28, verbatim: „when not full
 * screen in simulator mode in the web platform there is alot of dark space
 * that we can use to make the screen bigger, thats before pushing full screen."
 *
 * Measured on the shipped layout (dev harness `?chrome=dashboard`, which
 * reproduces the (dashboard) group's 16 rem sidebar + `mx-auto max-w-6xl
 * px-4 sm:px-6 lg:px-8` <main>): at a 1920×1080 window the scene box was
 * 1088×612 — 32 % of the window — with ~390 px of unused height under it and
 * 824 px of unused width beside it. The cause was that `aspect-video w-full`
 * only ever consulted ONE axis: it took the reading column's width and derived
 * a height, so the window's height was never spent and the 72 rem prose cap
 * (which exists for text, not for a driving simulator) capped the picture.
 *
 * THE ASPECT IS NOT NEGOTIABLE, AND THAT IS A MEASURED CLAIM, NOT TASTE.
 * CameraRig holds the cockpit's ~75.4° hFOV constant and derives vFOV from the
 * live aspect (doc 71 §4.9), so a squarer box does not "show more" — it opens
 * the frame vertically and drags the interior back into it. Re-running
 * `vehicle/cockpit-camera-contract.test.ts`'s own projection math across
 * aspects (COCKPIT_EYE, pitch −4°, the v2 GLB landmarks) gives:
 *
 *   aspect | vFOV | cowl  | header | verdict
 *   1.45   | 56.0 | 0.342 | 0.892  | cowl and header both out of band
 *   1.55   | 53.0 | 0.331 | 0.918  | cowl at the 0.33 edge, header in frame
 *   1.70   | 48.9 | 0.315 | 0.959  | header 0.959 < the ≥0.97 contract band
 *   1.778  | 47.0 | 0.307 | 0.980  | THE SHIPPED FRAME — every band green
 *   2.00   | 42.3 | 0.283 | 1.040  | bands hold, but the sky is cropped
 *
 * The binding landmark is the header strip: below ~1.75 the headliner enters
 * the top of the frame, which the contract forbids in as many words („never a
 * letterbox"). So the box stays at exactly 16:9 and simply gets BIGGER — the
 * camera contract sees a frame it is already authored for, at more pixels.
 *
 * Pure arithmetic: no DOM, no React — the shell measures, this decides.
 */

/** The frame the cockpit camera contract is authored at. Do not "improve". */
export const PLAY_ASPECT = 16 / 9;

/**
 * Breathing room under the picture, px. The scene box must not run to the
 * exact bottom edge: the footer (ODbL attribution — legally required, doc
 * district meta) lives below it, and a picture flush with the viewport floor
 * reads as clipped even when it is not.
 */
export const PLAY_BOTTOM_GUTTER_PX = 44;

/**
 * Never cap the picture below this height, px. A short window (a phone in
 * landscape with the browser chrome up, a tiny restored desktop window) can
 * leave less room than this; there the picture is allowed to overflow and the
 * page to scroll, because a 150 px-tall driving view is not a product.
 */
export const PLAY_MIN_HEIGHT_PX = 260;

/**
 * First-paint estimate of the chrome above + below the picture, px. Used as
 * the CSS fallback so the very first frame is already close to the measured
 * answer instead of flashing full-column-width and snapping back. Sized from
 * the shipped desktop layout: 32 px page padding + 44 px top bar + 12 px gap +
 * PLAY_BOTTOM_GUTTER_PX ≈ 132, rounded up for the wrapped two-row top bar.
 */
export const PLAY_CHROME_FALLBACK_PX = 176;

/**
 * The picture's max WIDTH given the height available under it — the axis
 * `aspect-video w-full` never looked at. Returns null when there is nothing
 * useful to say (not measured yet, or a window so short the floor wins), and
 * the caller then leaves the box at its container width.
 *
 * @param availableHeightPx viewport height minus everything above the box
 *        minus PLAY_BOTTOM_GUTTER_PX.
 */
export function playMaxWidthPx(availableHeightPx: number): number | null {
  if (!Number.isFinite(availableHeightPx)) return null;
  const height = Math.max(availableHeightPx, PLAY_MIN_HEIGHT_PX);
  return Math.round(height * PLAY_ASPECT);
}

/**
 * THE FULL-SCREEN OVERLAY SCRIM — OPAQUE, AND NEVER A `backdrop-filter`.
 *
 * Doc 91 §I20 / §D12d. Every full-viewport card in the driving shell used to
 * be `bg-background/85 … backdrop-blur-sm`: a `backdrop-filter: blur()` the
 * size of the whole viewport, composited over a WebGL canvas. On a phone GPU
 * that is among the most expensive things the compositor can be asked for, and
 * §G6 records why nobody had ever seen it — **it runs in the compositor,
 * outside both the page's WebGL timer and CDP's main-thread metrics**, so it
 * never appeared in a single budget this project has published.
 *
 * WHAT AN OPAQUE SCRIM BUYS, and it is two things, not one:
 *   1. the blur is not requested at all — no backdrop copy, no two-pass
 *      Gaussian over the viewport, on every composited frame the card is up;
 *   2. at alpha 1 the canvas underneath is fully OCCLUDED, so the compositor
 *      has nothing to read from it either.
 * §I19 (`frameloop={physicsPaused ? "demand" : "always"}`) and this row were
 * specified to ship together and only §I19 did; §I19 made the blur's source
 * nearly static, which is the cheap half. This is the other half.
 *
 * IT IS NOT A LOOK CHANGE WORTH ARGUING ABOUT: the previous scrim was already
 * 85 % opaque AND blurred, i.e. the scene behind it was deliberately
 * unreadable. This makes unreadable cost nothing.
 *
 * ONE CONSTANT, FOUR CALL SITES, because the four drifting apart is exactly
 * how §D12d survived four waves. Keep `absolute inset-0` and the z-index at
 * the call site — those differ per overlay and are layout, not scrim.
 */
export const OVERLAY_SCRIM_CLASS =
  "flex items-start justify-center overflow-y-auto bg-background p-4 sm:p-6";
