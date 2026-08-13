"use client";

/**
 * TouchControls — the phone driving controls.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUNDER REVIEW 2026-07-28, iPhone 16, LANDSCAPE. HIS WORDS.
 *
 *   „approximately half of the screen is occupied by controls, information
 *    panels, popups"
 *   „the gas forward this slider must also allow backwards … very hard to
 *    switch to reverse"
 *   „there can be only 1 slider — up is forward middle is stop down is
 *    backwards … same goes for left and right"
 *   „it must be absolutely invisible and small"
 *   „the mobile interface needs a complete redesign rather than only reducing
 *    the size of the existing elements"
 *
 * AND THE NUMBER BEHIND IT, read straight out of the file this one replaces:
 * the steer zone sat at `bottom: calc(11.75rem + …)` = 188 px and was
 * `clamp(11rem, 34vw, 20rem)` wide; the pedal strips were 2 × 56 × 152. On an
 * 852 × 393 landscape iPhone that control band was 188 of 393 px — 48 % of the
 * screen. And because the width was 34vw, A PROPORTION OF THE SCREEN, a bigger
 * phone bought a bigger obstruction.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOW. Gran Turismo's screen budget, not its art: instruments and
 * furniture are tiny and hard against the edges, and THE CENTRE OF THE SCREEN
 * IS ROAD. Two thumb pads in the two bottom corners, where thumbs already rest:
 *
 *   BOTTOM-LEFT   ONE STEERING AXIS. Drag left / right anywhere in the corner;
 *                 springs back to centre on release.
 *   BOTTOM-RIGHT  ONE DRIVETRAIN AXIS. Up = forward, centre = neutral, down =
 *                 brake and then REVERSE (see below). Springs back too.
 *
 * THE TRICK THAT MAKES A CONTROL BOTH TINY AND EASY TO HIT: the thing you touch
 * and the thing you see are different sizes. Every pad and every button here is
 * a transparent hit area of at least 44 × 44 px — the pads are 176–208 px wide
 * — that paints NOTHING, with a small mark drawn in the middle of it. The
 * project's own measuring rule ("any pixel a control paints on is NOT road,
 * translucent or not") is what makes this the honest way to buy back the
 * screen: an element with no background, no border, no shadow and no
 * backdrop-filter costs zero road, so the hit area can be generous while the
 * ink stays under half a percent of the viewport.
 *
 * REVERSE, WITH NO GEAR CHANGE IN IT. „Very hard to switch to reverse" was
 * true: it took a pedal AND a selector — two hands of input for one intention.
 * Down on this axis is the brake; ReverseAssist (engine/reverseAssist.ts, which
 * has existed and been unit-tested since 2026-07-17) watches for a brake
 * PRESSED at a standstill and steps the REAL selector D→N→R through the same
 * DrivelineState API the [ / ] keys use, after which the pedal mapper swaps the
 * two channels — so down keeps meaning "backwards" and up becomes the brake.
 * One axis, one thumb, and the rule engine, the A2 procedure observer and the
 * trace recorder see the identical canonical events they always did. Nothing
 * about grading, scenario timing or recording was touched to get here.
 *
 * PRESSED, NOT HELD (2026-08-05). It used to be a HOLD, and a thumb planted at
 * the bottom of this axis is how a learner stops — so stopping at a Б2 sign
 * selected R and the swap then read the same planted thumb as a floored reverse
 * accelerator. The thumb must now come back to centre and go down again, and
 * even then a thumb that was already down when R engaged goes on braking until
 * it lifts. See the two laws at the top of engine/reverseAssist.ts.
 *
 * WHY A THUMB PAD AND NOT A WHEEL, A TILT SENSOR OR THE OLD LONG SLIDER:
 *  - a wheel wants two thumbs and a fixed pivot the hand has to find; the
 *    corner a thumb already rests in has neither;
 *  - iOS gates DeviceOrientation behind a permission prompt (HTTPS only) that
 *    would interrupt the first drive, tilt misbehaves under a landscape
 *    orientation lock and on a flat-propped tablet, and it is not deterministic
 *    for the rule engine — same three reasons the previous author rejected it,
 *    still true. TOUCH_STEER_MODE_STORAGE_KEY keeps the A/B seam open;
 *  - the old slider's travel was a FRACTION OF THE ZONE, so the same thumb
 *    movement steered differently on different phones. Full lock is now a fixed
 *    TOUCH_STEER_RANGE_PX (engine/touch.ts), which is the only version of this
 *    control that feels the same on a 360 px Android and a 430 px iPhone.
 *
 * Everything else — the graded mirror glances, the indicators, the horn, the
 * camera, pause, fullscreen and the driveline sheet — became glyph-only buttons
 * in two small rows hard against the corners, directly above the pads, so
 * nothing at all sits in the middle of the picture.
 *
 * Input path is unchanged: every gesture writes into the shared
 * TouchInputSource, which SimInput.read() merges by priority (touch active →
 * touch wins). Cabin buttons call the SAME CabinControls/DrivelineState methods
 * the keys and the cockpit hotspots use — one code path, so the A2 observer
 * cannot tell the devices apart.
 *
 * Perf: gesture handlers write into refs and DOM styles directly (no React
 * state at gesture rate, zero per-frame allocations); the only poll is a low-Hz
 * cabin snapshot that early-outs when nothing changed.
 *
 * Visibility: mounts only on touch-capable devices (hasTouchScreen), goes
 * INERT while the sim is paused (menu/quiz/teach/consequence/end — the `hidden`
 * prop) and while the keyboard is in recent use (hybrid laptops); a screen
 * touch brings it back.
 *
 * „INERT" AND NOT „UNMOUNTED", AND THE DIFFERENCE IS THE FOUNDER'S WORST BUG
 * (doc 91 §C1/§I3, 2026-08-11). Every hide releases the held axes — it always
 * did, which is why the car stops under a card instead of running away — AND
 * NOW ALSO THE PADS' POINTER OWNERSHIP, which it did not, so a thumb that was
 * on the throttle when the card arrived left its pad owned by a finger that
 * could never let go and the pedal was dead for the rest of the session. The
 * pads' nodes now survive the interruption too, so the same thumb picks the
 * axis straight back up when the card goes.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  driveAxisFromPadY,
  PadPointer,
  releaseTouchControls,
  shouldRemapReversePedals,
  steerFromDrag,
  TOUCH_DRIVE_ABSOLUTE_RANGE_PX,
  TOUCH_STEER_RANGE_PX,
  type TouchInputSource,
} from "@/modules/sim/engine";
import {
  NOTIFY_COLUMN_GUTTER_PX,
  NOTIFY_COLUMN_RIGHT_CSS,
  NOTIFY_COLUMN_TOP_CSS_COMPACT,
  NOTIFY_COLUMN_WIDTH_CSS_COMPACT,
  notifyColumnWidthPx,
  useTapActivation,
} from "@/modules/sim/hud";
import {
  DIFFICULTY_ORDER,
  DIFFICULTY_PRESETS,
  type DifficultyMode,
  type SelectorPosition,
  type TransmissionMode,
} from "@/modules/sim/vehicle";
import type { CabinControls, HeadlightSetting, IndicatorSetting } from "@/modules/sim/scene/cabin";
import type { CameraMode, TopdownAidHandle } from "./CameraRig";

// ---------------------------------------------------------------------------
// Steer-mode setting seam (A/B: slider vs tilt). Only the thumb pad is
// implemented; "tilt" intentionally falls back to it until a tilt source lands
// (see the header rationale) — the flag exists so an A/B test can flip cohorts
// without a schema change.
// ---------------------------------------------------------------------------

export type TouchSteerMode = "slider" | "tilt";
export const TOUCH_STEER_MODE_STORAGE_KEY = "sim.touchSteerMode";

export function readTouchSteerMode(): TouchSteerMode {
  try {
    return window.localStorage.getItem(TOUCH_STEER_MODE_STORAGE_KEY) === "tilt"
      ? "tilt"
      : "slider";
  } catch {
    return "slider";
  }
}

/** setPointerCapture that survives an already-released pointer (races on
 *  fast taps; some webviews) — losing capture only degrades edge-tracking,
 *  it must never abort the gesture. */
function capturePointer(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // NotFoundError: the pointer ended before capture — gesture continues.
  }
}

/** One pad's pointer ownership, created once per mount and never replaced.
 *  `useState`'s lazy initialiser rather than `useRef(new PadPointer())`: it
 *  allocates exactly one instance instead of one per render, the identity is
 *  stable (which is what lets it be an effect dependency), and it does not
 *  touch a ref during render. Nothing here ever calls the setter — the object
 *  is mutable state that no render reads. */
function usePadPointer(): PadPointer {
  const [pad] = useState(() => new PadPointer());
  return pad;
}

/**
 * MAY THIS FREE PAD ADOPT THE FINGER THAT IS ALREADY MOVING ON IT?
 *
 * This is the other half of "the pedal comes back the instant the card is
 * dismissed" (doc 91 §I3). The card releases the pad's ownership on the way in
 * — it has to, because the `pointerup` for that finger may never arrive — so
 * when the sim resumes there is a thumb on the throttle that owns nothing. A
 * pad that only ever claims on `pointerdown` would stay silent until the
 * student lifted and pressed again, which is precisely the ritual this wave
 * exists to delete.
 *
 * Three conditions, and each one is load-bearing:
 *   · `live` — never while the scene is interrupted, or a resting thumb would
 *     drive a paused world through the back door;
 *   · the pad is FREE — an adoption may never steal an axis from the finger
 *     that legitimately owns it;
 *   · `buttons !== 0` — a `pointermove` with nothing pressed is a hovering
 *     mouse or pen. Touch pointers only move while they are down.
 *
 * A finger that started somewhere else cannot arrive here anyway: touch
 * pointers get implicit capture at `pointerdown`, so their moves keep going to
 * the element they started on.
 */
function adoptable(
  pad: PadPointer,
  e: ReactPointerEvent<HTMLDivElement>,
  live: boolean,
): boolean {
  if (!live || e.buttons === 0 || pad.pointerId !== null) return false;
  return pad.claim(e.pointerId);
}

/** Driving keys whose use hides the overlay on hybrid (touch+keyboard)
 *  devices — a laptop student driving on WASD keeps a clean screen. */
const KEYBOARD_DRIVE_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);

/** Cabin poll cadence (ms) — button active-states only, far below frame rate. */
const CABIN_POLL_MS = 250;

/** Safe-area insets (notches, home bars) — every calc() position includes
 *  the matching env(); falls back to 0px on browsers without the API. */
const INSET_L = "env(safe-area-inset-left, 0px)";
const INSET_R = "env(safe-area-inset-right, 0px)";
const INSET_B = "env(safe-area-inset-bottom, 0px)";

/** px → a rem literal, so every length below is generated from ONE number and
 *  the resolver at the foot of this block cannot drift from the shipped CSS.
 *  Same device as modules/sim/hud/notifyColumn.ts, and for the same reason. */
function rem(px: number): string {
  return `${px / 16}rem`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ⚠ THE ONE RULE THIS FILE NOW HAS — 2026-08-13, doc 91 §N1, WAVE 9.
   „ANCHOR IT TO SOMETHING SAFARI DOES NOT MOVE."

   NO CONTROL'S POSITION OR SIZE MAY BE A FUNCTION OF A HEIGHT THE BROWSER CAN
   CHANGE AT RUNTIME.

   WHAT IT COST TO LEARN. Every length in this block used to resolve `100%`
   against the stage, and the stage is `height: visualViewport.height` (the
   shell publishes it as `--sim-vh` — LessonPlayShell, and it HAS to, or the
   controls sit under the toolbar). So Safari's URL bar sliding — which happens
   while he drives, without him touching anything — was an input to the layout.
   Measured on the deployed product with CDP `Emulation.setDeviceMetricsOverride`
   (doc 91 §L2/§N1, „⚠ THE MOST IMPORTANT OMISSION IN §I"):

     −44 px  the two thumb pads moved 44 · «Продължи» moved exactly 22 ·
             «Меню на урока» moved 0            → the arc's SPACING changed 22 px
     −90 px  90 vs 45
     on his own 402 px-wide iPhone 16 Pro, which is the only device in the set
     inside the varying band: the indicator gap compressed 25 → 20 px (−20 %)
     and the mirror gap 18 → 14 px (−22 %), and the drive pad his thumb was
     resting on SHRANK 173 → 158 px.

   A control that reshapes under the thumb is wrong however the arithmetic is
   tuned, so the arithmetic is not tuned — the INPUT is replaced:

     `svh`  THE SMALL VIEWPORT — the viewport height with all browser chrome
            SHOWN. It is constant by definition (CSS Values 4: the small
            viewport size does not change as UI expands or retracts), and
            content laid out inside it is ALWAYS VISIBLE, because the visible
            area is never smaller than it. It is the only fixed length in CSS
            that is also always on screen.
     `dvh` / `visualViewport.height` / `100%` of the live stage — THIS IS THE
            BUG. It is the quantity Safari moves.
     `lvh` — constant, but it puts controls UNDER the toolbar when the bar is
            showing. Wrong in the other direction.

   AND THE SIZES ARE NOT `svh` EITHER, THEY ARE CONSTANTS. A percentage of the
   small viewport is stable on a phone but it still makes the pad a function of
   a height, and the whole class of defect comes back the first time somebody
   measures on a device the ladder does not have. The pad is 152 px because a
   thumb is a thumb; the rise is 20 px sideways and 132 px upright because a
   hand held sideways sweeps wide and shallow. Neither is a fraction of
   anything. `--sim-svh` survives in exactly two places: the BAND LIFT below,
   which is the anchor itself, and the `@supports` fallback.

   THE FALLBACK IS THREE LINES AND IT IS MANDATORY (`svh` is iOS Safari 15.4+ /
   Chrome 108+, and the Bulgarian Android fleet is not all new): every use is
   `var(--sim-svh, 100vh)`, and `PlayAreaStyles` sets the variable to `100svh`
   inside `@supports (height: 100svh)`. On an engine without it the token is
   `100vh` — on iOS that is the LARGE viewport, which is also stable, and on
   the shell's stage `100% ≤ 100vh` so the lift is 0 and the behaviour is
   exactly what shipped before this wave. It degrades to the status quo, never
   to something new.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * THE SMALL VIEWPORT, as a token. Set to `100svh` by `PlayAreaStyles` where the
 * engine has it; `100vh` (iOS: the large viewport, equally stable) otherwise.
 */
const SVH = "var(--sim-svh, 100vh)";

/**
 * HOW FAR ABOVE THE STAGE'S BOTTOM EDGE THE CONTROL BAND'S BOTTOM EDGE SITS —
 * the anchor, in one expression.
 *
 * The stage is the live visual viewport. `100svh` is that same viewport with
 * the chrome shown. So `stage − svh` is EXACTLY how much toolbar is currently
 * retracted, and lifting the band by it pins the band's bottom edge to a line
 * the browser cannot move:
 *
 *   bar SHOWN    stage = svh        → lift 0    → band flush with the bottom
 *   bar HIDDEN   stage = svh + 44   → lift 44   → band DOES NOT MOVE
 *
 * `max(0px, …)` and not a bare subtraction: the visible viewport CAN go below
 * the small viewport (an on-screen keyboard, a pinch), and there the band must
 * follow the shrinking bottom edge or it is off screen — which is the one thing
 * worse than moving. The clamp is what makes „always visible" true in both
 * directions.
 *
 * AND IT IS WHY THE PAD'S BOTTOM EDGE IS AT `svh` AND NOT AT THE GLASS. The
 * strip below `svh` is where the toolbar WILL be; a control parked there is a
 * control that goes under the bar the instant it slides in. The pad occupies
 * the band that is usable in every chrome state, which is the whole of the
 * guarantee.
 */
const bandLiftCss = (stage: string): string => `max(0px, calc(${stage} - ${SVH}))`;
const BAND_LIFT = bandLiftCss("100%");

/**
 * THE PAD BOXES — the hit areas, which paint nothing.
 *
 * WIDTH is still `min(percentage, ceiling)`: the percentage keeps a thumb's
 * reach proportional on a small phone, the ceiling stops a tablet from handing
 * a quarter of the screen to a control that only ever needs a thumb's worth of
 * travel — and no browser chrome changes the WIDTH of the viewport, so it is
 * not a runtime variable the way the height is.
 *
 * HEIGHT IS A CONSTANT, per the rule at the top of this block. 152 px and
 * 136 px are exactly what `min(44%, 152px)` and `min(40%, 136px)` already
 * resolved to on every profile in the ladder in BOTH orientations (the cap won
 * everywhere — the percentage only bit below a 345 px stage, i.e. only once the
 * URL bar had already eaten into it), so nothing moves at rest on any device.
 * What changes is that it can no longer shrink under the thumb: 173 → 158 on
 * his phone at −90, and 152 → 139 → 119 on small-landscape, are now 173 and 152
 * at every height.
 *
 * These are HIT sizes, not ink: the steering pad is 208 px wide and paints
 * roughly 900 px² — 0.27 % of a landscape iPhone.
 */
const STEER_PAD = { fraction: 0.42, capPx: 208 } as const; // of the WIDTH
const DRIVE_PAD = { fraction: 0.36, capPx: 176 } as const; // of the WIDTH
const STEER_PAD_H_PX = 136;
const DRIVE_PAD_H_PX = 152;

const cssMin = (b: { fraction: number; capPx: number }): string =>
  `min(${b.fraction * 100}%, ${rem(b.capPx)})`;
const resolve = (b: { fraction: number; capPx: number }, againstPx: number): number =>
  Math.min(b.capPx, againstPx * b.fraction);

const STEER_PAD_W = cssMin(STEER_PAD); // ≤ 208 px

/**
 * WHAT A BOX ANCHORED TO THE OPEN DECK MUST LEAVE ON ITS LEFT TO CLEAR THE
 * STEERING PAD ENTIRELY, sideways.
 *
 * `TOUCH_CONTROLS_FLOOR` already exports this band's HEIGHT for anything that
 * has to stay above the thumbs. Nothing exported its WIDTH, and sideways that
 * is the bound that matters: the arc reaches y 236 on a landscape iPhone but
 * only x 0 → inset + 208, so the whole middle of the screen below the deck is
 * free and the only thing in the way on the left is this pad. The demonstration
 * caption lives in exactly that lane (PlayAreaStyles).
 *
 * ⚠ IT IS `vw` AND NOT `%`, AND THAT IS THE WHOLE REASON THIS CONSTANT EXISTS
 * RATHER THAN THE PAD'S OWN WIDTH BEING RE-USED. `STEER_PAD_W` is
 * `min(42%, 13rem)`, and a percentage resolves against the CONTAINING BLOCK.
 * Inside TouchControls that block is the full-bleed stage, so 42 % is 42 % of
 * the screen; inside the deck it is 42 % of the DECK. Written the obvious way
 * this lane measured 42 % of 410 px and landed 36 px too far left — measured on
 * production, caption box at x 239 against an arc whose right edge is x 267,
 * i.e. 1 792 px² of the demonstration's own prose over «Волан» as soon as a
 * caption grew past two lines. The units matter more than the number.
 *
 * The arithmetic, and it comes out inset-independent: the pad's right edge is
 * `env(safe-area-inset-left) + STEER_PAD_W`, the open deck's left edge is
 * `env(safe-area-inset-left) + 0.5rem + 3.5rem`, so the clearance is
 * `STEER_PAD_W − 4rem`, plus this HUD's 8 px gutter. 152 px on both landscape
 * profiles in the ladder, and it follows the pad if the pad is reshaped.
 */
export const STEER_PAD_DECK_CLEARANCE_CSS = `calc(min(${
  STEER_PAD.fraction * 100
}vw, ${rem(STEER_PAD.capPx)}) - 4rem + 0.5rem)`;
const DRIVE_PAD_W = cssMin(DRIVE_PAD); // ≤ 176 px
/**
 * The two pad heights, read through a variable so the ONE short-stage collapse
 * (`--sim-pad-*-h`, PlayAreaStyles) can reach them. The fallback is the value,
 * so a tree without that stylesheet still lays out correctly.
 */
const STEER_PAD_H = `var(--sim-pad-steer-h, ${rem(STEER_PAD_H_PX)})`;
const DRIVE_PAD_H = `var(--sim-pad-drive-h, ${rem(DRIVE_PAD_H_PX)})`;

/** The touch floor, in px. Every hit box on this screen is this square. */
const TOUCH_MIN_PX = 44;
/** Glyph-row height — one 44 px touch row plus nothing else. */
const ROW_H = rem(TOUCH_MIN_PX);

// ---------------------------------------------------------------------------
// THE ARCS — founder layout, `Look where I put the lines and i guess there
// should be eveyrthing.jpg`, drawn on his own screenshot on 2026-08-02.
//
// He took a phone frame of this screen and painted TWO THICK CURVES on it: one
// sweeping out of the bottom-left corner and up the left edge, one mirroring it
// on the right, captioned „there should be everything". That is not decoration
// — it is the path a thumb sweeps when the hand is holding the phone, and it is
// the reason the previous layout felt wrong to him even after the boxes shrank:
// two straight glyph ROWS stacked above the pads cut ACROSS the thumb's travel,
// so every button after the first is a reach.
//
// So the stations are placed on a quarter-arc instead of in a row. Station `k`
// of `n`, measured as its BOX from the bottom and from the near side edge:
//
//     bottom = pad height + ARC_RISE · sin(k/(n−1) · π/2)
//     inset  = ARC_EDGE + ARC_RUN_STEP · (n−1−k)
//
// — station 0 sits exactly on the pad's top edge and three run-steps inboard,
// the top one is flush against the screen edge, and the curve between them is
// the sweep he drew: constant horizontal progress, decelerating climb. The sine
// is written out as four decimals rather than called through CSS `sin()`:
// numbers that can be checked by hand beat a trig function whose browser
// support is newer than everything else this file relies on.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE ARC USED TO CLIMB AND NOW IT SWEEPS — 2026-08-10, doc 87 row C1, AND THE
// REASON IS A MEASUREMENT AND NOT A TASTE.
//
// It was written the other way round: a 44 px RISE per station and a 80 px
// total RUN, i.e. 132 px of climb against 80 px of spread — a near-vertical
// stack of four buttons up the screen edge. On the founder's phone held
// SIDEWAYS that put two driving controls inside the notification column, which
// is anchored at the top of the same edge and is 240 px wide by contract
// (modules/sim/hud/notifyColumn.ts: its left edge may never come left of 0.60
// of the width — his own drawing, and arithmetic with a ladder sweep behind
// it). Measured, WebKit, iPhone 16 landscape 852 × 393 with the real insets:
//
//   «Мигач надясно» ⇨  [707, 88, 44×44]  under «Разбрах» [704.9, 70.3, 76.1×44]
//                      → 1 157 px² of HIT-BOX overlap, and elementFromPoint at
//                        the indicator's own centre returns the dismiss button.
//                        A thumb aimed at the RIGHT INDICATOR presses «Разбрах».
//   «Контроли…» ⚙      [747, 44, 44×44]  → its centre hit the card's SENTENCE,
//                        so the settings button was dead while any line spoke.
//
// A z-index cannot fix that, and neither can a smaller column: the column is
// anchored at y 8 and a three-line briefing measures 106.3 px, so clearing a
// station whose top edge is at y 44 would need a 36 px column. THE ARC HAD TO
// MOVE, and the only direction with room is DOWN AND INBOARD.
//
// WHY THE RUN IS THE SEPARATION AND THE RISE IS THE FREE VARIABLE. Two 44 px
// boxes cannot overlap if they are 44 px apart in EITHER axis. Putting that
// guarantee in the RUN — one flat 2.75 rem step per station, which is the box's
// own width — buys the rise the freedom to be anything at all, including almost
// nothing on a short screen. That is the whole trick, and it is why the arc can
// follow the stage instead of the stage having to hold still for the arc.
//
// THE RISE, THEN, IS WHATEVER THE STAGE CAN SPARE. A thumb's sweep on a phone
// held sideways genuinely IS wide and shallow, and on a portrait phone it is
// taller — his drawing is on a phone frame and the curve is the hand, not a
// shape. The clamp is derived, not chosen, and each of its three numbers comes
// from a different device:
//
//   THE FLOOR, 1.25 rem, is set by the SMALLEST device in the ladder. At
//   780 × 360 the right corridor has to hold, top to bottom, the column's
//   0.5 rem inset, the column itself, the 1.25 rem gap in TOUCH_CONTROLS_FLOOR,
//   one 44 px station box, the rise, and a 152 px pad:
//
//       360 − 8 − 44 − 20 − 152 = 136   for the column AND the rise
//       rise 20  →  column cap 116 px, against a measured worst card of 106.3
//
//   THE CEILING, 8.25 rem, is the climb this arc has always had — three station
//   heights — and PORTRAIT KEEPS IT EXACTLY. Nothing was broken there and
//   nothing there is being paid for: a first pass at this row flattened both
//   orientations to one percentage, and the photograph showed the pause glyph
//   sitting on the speedometer's „40" — 72 px of the arc pushed off the road
//   and onto the instrument cluster, on the orientation that had no collision.
//
//   THE SLOPE between them, half of everything past 22 rem of stage, reaches
//   the ceiling at 616 px of height. So every portrait phone is at the ceiling,
//   both landscape phones are at the floor, and a tablet held sideways gets the
//   sweep in between rather than a cliff at some breakpoint.
//
// WHAT THE STATIONS MEASURE NOW, WebKit, iPhone 16 landscape, real insets —
// and note that the three x's are the ones the old four-station arc put its top
// three on, because the run step is the box's own width either way:
// Л [747, 155.5], З [703, 161.5], Д [659, 176] on the throttle flank, ⇨ [61,
// 171.5] and ⇦ [105, 192] on the steering one, against a column that ends at
// y 114.3 — 41 px of clearance, and 44 px between every pair of stations.
// ═══════════════════════════════════════════════════════════════════════════
//
// IT WAS FOUR A SIDE UNTIL 2026-08-12 AND THE WIDTH BUDGET IS WHY IT COULD NOT
// BE FIVE. A side's band is `ARC_EDGE + ARC_RUN_STEP·(n−1) + 44`, and both arcs
// start from their own screen edge, so at four a side that was 178 + 178 = 356
// px against the 360 px of the narrowest phone in the ladder — a 4 px gap
// between the two innermost stations, and five would have crossed.
//
// AT TWO AND THREE THAT BUDGET STOPS BINDING: 90 + 134 = 224 px of a 360 px
// stage, i.e. 136 px of clear corridor between the flanks where there were 4.
// (Heightwise the tallest band is `152 + rise + 44` = 216 px of a 360 px
// landscape stage, against 328 before.)
//
// WHAT LEFT, AND WHERE IT WENT — see the block on ARC_STATIONS_LEFT below.
// Pause, the horn and the ⚙ sheet went to the TOP RAIL; the camera came OUT of
// the ⚙ sheet and joined them there as a word-labelled button, which is the one
// principle of his reference frame we had never taken. Fullscreen stays a sheet
// cell. Every one of them keeps its key; nothing became unreachable.
//
// AND THE PADS GOT SHORTER TO PAY FOR THE RUN. That is affordable, but it is
// no longer free on the DRIVE pad and the difference matters now: the steering
// pad still reads a RELATIVE drag from wherever the thumb lands (full lock =
// TOUCH_STEER_RANGE_PX 84 px of travel, so a 136 px pad is 1.6 × the gesture),
// while the drivetrain axis is ABSOLUTE since the 2026-08-11 ruling and needs
// TOUCH_DRIVE_ABSOLUTE_RANGE_PX (66) of pad ON EACH SIDE of its centre — 132 px
// inside a pad that is 152 px on every profile in the ladder. **Shortening the
// drive pad below 132 px would silently cost the top of the throttle and the
// bottom of the brake**, which is why engine/touch.ts states that floor and
// touchArc.test.ts sweeps it. Nothing on this screen got smaller to buy row C1:
// every station is still a 44 × 44 hit area and both pads are the size they were.
// ---------------------------------------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO STATIONS LEFT, THREE RIGHT — THE 2026-08-12 CONTROL-SYSTEM REWORK
 * (doc 91 §H, and the founder's ruling on the indicators).
 *
 * It was FOUR A SIDE, and four a side is what put a line of the drive pad's own
 * teaching text through «Клаксон», both mirror glances and «Мигач наляво» on
 * every landscape profile: eight 44 px targets stacked into the band the
 * reference frame keeps EMPTY, with nothing left over for a sentence to be in.
 *
 * The flanks now carry ONLY the controls whose meaning is a side of the car:
 *
 *   LEFT  (steering thumb)  ⇦ ЛЯВ, ⇨ ДЯСЕН — BOTH indicators.
 *   RIGHT (throttle thumb)  Д ДЯСНО, З ЗАДНО, Л ЛЯВО — all three mirrors.
 *
 * THE INDICATORS ARE ON THE LEFT ON A FOUNDER RULING, and the reason is the
 * exam: «Мигач надясно» used to sit on the RIGHT arc, so signalling right — a
 * GRADED act, performed while still going straight — cost the accelerator
 * thumb. A real LHD car puts the stalk left of the column for the same reason,
 * and the lower station is the left signal because a real stalk is pushed DOWN
 * for left.
 *
 * THE MIRRORS ARE ON THE RIGHT, and the interaction cost is the teaching:
 * lifting off the throttle to check a mirror IS what a driver does.
 *
 * EVERYTHING ELSE LEFT THE FLANKS ALTOGETHER — pause, horn, the ⚙ sheet, and
 * the camera that used to be buried two taps inside it — for the TOP RAIL,
 * where no thumb rests (§H, and the reference's own «PAUSE»/«VIEW» corner).
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const ARC_STATIONS_LEFT = 3;
export const ARC_STATIONS_RIGHT = 4;

/** How many stations one flank carries. */
export function arcStationCount(side: "left" | "right"): number {
  return side === "left" ? ARC_STATIONS_LEFT : ARC_STATIONS_RIGHT;
}

/** The busier flank — what the band arithmetic and the sweeps have to clear. */
export const ARC_STATIONS = Math.max(ARC_STATIONS_LEFT, ARC_STATIONS_RIGHT);
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RUN — how far inboard each station sits from the one above it — AND WHY
 * IT IS NO LONGER A CONSTANT. 2026-08-13, the control redesign.
 *
 * THE RULE, ONCE: two 44 px boxes cannot overlap if they are 44 px apart in
 * EITHER axis. This file used to put that guarantee entirely in the RUN, at one
 * box-width per station, because the rise can be as little as 20 px — and that
 * is exactly why it could not carry a fourth station. A side's band is
 * `2 + run·(n−1) + 44`, so four a side at a 44 px run is 178 + 178 = 356 px
 * against the 360 px of the narrowest phone in the ladder: the 4 px corridor
 * this file's own history warns about. Worse than tight — measured, the
 * innermost station would stand squarely in `padCorridorPx`, the lane the speed
 * readout lives in, on both 360 px Androids AND the iPhone in portrait.
 *
 * But the rise is 132 px upright. At four stations that is 44 px of VERTICAL
 * separation per pair, which satisfies the rule on its own — so upright the run
 * is free, and it drops to 24 px. A four-station flank is then 118 px wide,
 * SIXTY PX NARROWER than the three-station flank it replaces. The arc got busier
 * and the screen got wider.
 *
 *     verticalGap = rise / (n − 1)
 *     run = verticalGap ≥ 44 px ? 24 px : 44 px
 *
 * …which is landscape 44 (unchanged, and it must be: the rise is 20 there and
 * the run is carrying everything) and portrait 24. `touchArc.test.ts` sweeps the
 * invariant itself over the whole ladder rather than trusting either number.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const ARC_RUN_LANDSCAPE_PX = TOUCH_MIN_PX;
const ARC_RUN_PORTRAIT_PX = 24;
const ARC_RUN = `var(--sim-arc-run, ${rem(ARC_RUN_PORTRAIT_PX)})`;
/** How close to the screen edge the TOP station sits. */
const ARC_EDGE_PX = 2;
/**
 * THE RISE — total climb from the bottom station to the top one.
 *
 * 20 px on a phone held sideways, 132 px on a portrait one, AND NOTHING IN
 * BETWEEN — 2026-08-13, doc 91 §N1.
 *
 * IT USED TO RAMP, and the ramp is the defect this wave exists to close:
 *
 *     clamp(1.25rem, (100% − 22rem) * 0.5, 8.25rem)
 *
 * Read against a stage that IS the live visual viewport, that expression is a
 * function of Safari's URL bar. Every portrait phone sat on the 8.25 rem
 * ceiling and every landscape phone in the ladder sat on the 1.25 rem floor, so
 * six waves of measurement saw a constant — but the founder's iPhone 16 Pro is
 * 402 CSS px wide held sideways, the ONLY device in the set inside the varying
 * band, and there the rise slid 25 → 20 px the first time the bar moved. That
 * is the „it is not stabilized" he reported, and no clamp fixes it, because the
 * clamp is not what is wrong — the input is.
 *
 * So the two endpoints ARE the value. They are unchanged on five of the six
 * ladder profiles (both portraits were already at 132, both landscapes already
 * at 20); the one device that changes is his, where the rise stops sliding and
 * settles at 20. The derivation of the two numbers is unchanged and still
 * stands in the block above — 20 px is what the 780 × 360 phone's notification
 * corridor can spare, 132 px is the founder's own drawn climb — and both are
 * now stated rather than computed from a height.
 *
 * The ORIENTATION is a `@media (orientation: …)` query in PlayAreaStyles, not a
 * height comparison: a media query is discrete, so it cannot produce the „a
 * little bit different at every height" behaviour this wave is deleting. A
 * phone does not change orientation while the URL bar slides.
 */
const ARC_RISE_LANDSCAPE_PX = 20;
const ARC_RISE_PORTRAIT_PX = 3 * TOUCH_MIN_PX;
const ARC_RISE = `var(--sim-arc-rise, ${rem(ARC_RISE_PORTRAIT_PX)})`;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FLOOR UNDER THE CONSTANTS — what happens when the stage is too short to
 * hold them, stated as a designed behaviour rather than left to be discovered.
 *
 * Constants have a bound the old percentages did not: the band is
 * `pad + rise + station + inset + gap` = 152 + 20 + 44 + 21 + 20 = 257 px in
 * landscape, and a stage shorter than that has the top station's box hanging
 * off the top edge. Every landscape profile in the ladder has ≥ 360 px, and
 * even after the worst measured chrome slide (−90) it has 270 — so there is
 * room, but there is not unlimited room, and „the first short-stage device to
 * appear reproduces the whole class of defect" is exactly how this comes back.
 *
 * THE THRESHOLD IS 240 px AND IT IS CHOSEN TO BE UNREACHABLE BY A URL BAR. The
 * smallest stage the ladder produces at −90 is 270; 240 is 30 px below it, so
 * no chrome slide on any device in the set can cross it. Below it the band
 * collapses ONCE, to a 140 px drive pad (still above the 132 px the absolute
 * axis needs — `TOUCH_DRIVE_ABSOLUTE_RANGE_PX` × 2, engine/touch.ts) and a
 * 12 px rise: 140 + 12 + 44 + 21 + 20 = 237, which fits.
 *
 * WHAT IS NOT BUILT, AND SAYING SO IS THE POINT: the design's fuller collapse
 * also drops to two stations a side. That is a change to `ARC_STATIONS_RIGHT`,
 * i.e. to which mirror a student can reach, and it is not something to do on
 * the way past inside a geometry fix. The three stations stay; they cannot
 * overlap at any rise because the RUN is what separates them (see above).
 * ═══════════════════════════════════════════════════════════════════════════
 */
const BAND_COLLAPSE_MAX_STAGE_PX = 240;
const STEER_PAD_H_COLLAPSED_PX = 124;
const DRIVE_PAD_H_COLLAPSED_PX = 140;
const ARC_RISE_COLLAPSED_PX = 12;

/**
 * THE FOUR VARIABLES THE BLOCK ABOVE READS THROUGH, as one authored stylesheet.
 *
 * Rendered by `PlayAreaStyles`, which the play shell mounts unconditionally.
 * They are variables and not inline styles for two reasons that are not style
 * preferences: `@supports` and `@media` cannot be written in a React `style`
 * prop, and BOTH are load-bearing here — the first is the older-engine
 * fallback, the second is the orientation split and the short-stage collapse.
 *
 * Every consumer writes `var(--name, <the same value>)`, so a tree that somehow
 * renders TouchControls without this sheet gets the portrait rise and the full
 * pads rather than a broken layout.
 */
export const TOUCH_BAND_CSS_VARS = `
      :root {
        --sim-pad-steer-h: ${rem(STEER_PAD_H_PX)};
        --sim-pad-drive-h: ${rem(DRIVE_PAD_H_PX)};
        --sim-arc-rise: ${rem(ARC_RISE_PORTRAIT_PX)};
        --sim-arc-run: ${rem(ARC_RUN_PORTRAIT_PX)};
      }
      @media (orientation: landscape) {
        :root {
          --sim-arc-rise: ${rem(ARC_RISE_LANDSCAPE_PX)};
          --sim-arc-run: ${rem(ARC_RUN_LANDSCAPE_PX)};
        }
      }
      @media (max-height: ${rem(BAND_COLLAPSE_MAX_STAGE_PX)}) {
        :root {
          --sim-pad-steer-h: ${rem(STEER_PAD_H_COLLAPSED_PX)};
          --sim-pad-drive-h: ${rem(DRIVE_PAD_H_COLLAPSED_PX)};
          --sim-arc-rise: ${rem(ARC_RISE_COLLAPSED_PX)};
        }
      }
      @supports (height: 100svh) {
        :root { --sim-svh: 100svh; }
      }
`;
/**
 * `k / (n−1)` — station `k` of `n` along a STRAIGHT RAMP.
 *
 * IT WAS `sin(k/(n−1) · π/2)` AND THE SINE HAD TO GO, for the same reason the
 * run stopped being a constant: the curve decelerated towards the top, so the
 * gaps were not equal and „44 px apart in either axis" was only ever true of the
 * widest pair. At four stations upright the sine puts the top two 17.7 px apart
 * (132 × (1 − 0.866)) — under the floor — which is precisely the pair a 24 px
 * run leaves nothing else to separate. A linear ramp makes the vertical gap one
 * number, `rise / (n−1)`, which is what the rule above can be stated in and what
 * the test can sweep.
 *
 * Sideways, where the rise is 20 px, the two curves differ by at most 6 px and
 * the run carries the separation either way — so nothing visible was traded for
 * this, and the arc is still the sweep the founder drew on his own screenshot.
 */
function arcRiseAtPx(index: number, count: number, risePx: number): number {
  if (count <= 1 || index <= 0) return 0;
  return (risePx * Math.min(index, count - 1)) / (count - 1);
}

/**
 * …and the same term as CSS. `calc(rise * k / (n−1))`, NOT `calc(rise * 0.3333)`.
 *
 * The four-decimal literal is what the sine used and it is 0.0044 px short of
 * the truth at k=1 of 4 — which sounds like nothing and is not: upright the
 * vertical gap IS the separation guarantee (the run is only 24 px there), so
 * 132 × 0.3333 = 43.9956 px puts two 44 px boxes 0.0044 px inside each other and
 * the invariant this file exists to hold becomes false by a rounding artefact.
 * CSS `calc()` divides exactly; so does the resolver above. One expression, both
 * sides, no literal to round.
 */
function arcRiseTermCss(index: number, count: number): string {
  if (count <= 1 || index <= 0) return "0px";
  return `(${ARC_RISE} * ${Math.min(index, count - 1)} / ${count - 1})`;
}

/**
 * One station's box, measured from the bottom and from the near side edge.
 *
 * `padH` is the pad this arc has to clear: station 0's box sits exactly on the
 * pad's top edge, which is what keeps a thumb-down on the lowest station from
 * being swallowed by the wheel or the throttle. Every station after it is one
 * run-step further out along the curve and a little higher.
 */
function arcStation(
  index: number,
  padH: string,
  side: "left" | "right",
): { bottom: string; inset: string } {
  const count = arcStationCount(side);
  return {
    // `BAND_LIFT` first, and it is the same term the pad below carries — the
    // two are measured independently upward from ONE fixed line rather than
    // the arc being measured from the pad's live box, so neither can move the
    // other. (`padH` here is a constant; before this wave both it and the rise
    // were functions of the stage, which is how a 15 px pad resize turned into
    // a 22 px station move.)
    bottom: `calc(${BAND_LIFT} + ${padH} + ${arcRiseTermCss(index, count)} + ${INSET_B})`,
    inset: `calc(${rem(ARC_EDGE_PX)} + (${ARC_RUN} * ${count - 1 - index}))`,
  };
}

// ---------------------------------------------------------------------------
// …AND THE SAME ARITHMETIC AS NUMBERS, so the ladder can be swept.
//
// „0 controls painted over" is the summary that let a driving control sit under
// a dismiss button for a week (doc 87 row C1). The lengths above are CSS, and
// nothing in this repo could evaluate them — so the only instrument that could
// see the defect was a browser, and the browser was only ever asked the
// question after somebody suspected the answer.
//
// These resolve the SAME constants for a given stage, which is the notifyColumn
// device: one set of numbers, the shipped CSS generated from it, and a test
// that sweeps every device in the ladder generated from it too. They cannot
// drift, because there is only one of them.
// ---------------------------------------------------------------------------

/** A rect in stage coordinates: x/y from the stage's top-left, px. */
export interface StageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The stage a phone hands this overlay, plus the device's own safe area.
 *
 * `svhHeight` — THE SMALL VIEWPORT, i.e. what `height` would be with the
 * browser chrome shown. Omitted means „they are the same", which is the state
 * every sweep in this repo measures (an emulated viewport has no toolbar) and
 * the state a real phone is in whenever the URL bar IS showing. Give it a value
 * to model a retracted toolbar and watch `bandLiftPx` hold the band still.
 */
export interface StageBox {
  width: number;
  height: number;
  insetTop?: number;
  insetRight?: number;
  insetBottom?: number;
  insetLeft?: number;
  svhHeight?: number;
}

/** Portrait ⇔ the media query PlayAreaStyles uses: height ≥ width. */
function isPortrait(stage: StageBox): boolean {
  return stage.height >= stage.width;
}

/** …and the one short-stage collapse, resolved. */
function isCollapsed(stage: StageBox): boolean {
  return stage.height <= BAND_COLLAPSE_MAX_STAGE_PX;
}

/** Total climb of one arc on a given stage, px — a constant per orientation. */
export function arcRisePx(stage: StageBox): number {
  if (isCollapsed(stage)) return ARC_RISE_COLLAPSED_PX;
  return isPortrait(stage) ? ARC_RISE_PORTRAIT_PX : ARC_RISE_LANDSCAPE_PX;
}

/**
 * How far inboard each station steps, px — the numeric twin of `--sim-arc-run`.
 *
 * Follows the rise, because the rise is what it has to make up for: see the
 * block at `ARC_RUN_LANDSCAPE_PX`. The collapsed stage keeps the landscape run,
 * and it must — its rise is 12 px, so the run is carrying the whole separation
 * guarantee there more than anywhere else.
 */
export function arcRunStepPx(stage: StageBox): number {
  if (isCollapsed(stage)) return ARC_RUN_LANDSCAPE_PX;
  return isPortrait(stage) ? ARC_RUN_PORTRAIT_PX : ARC_RUN_LANDSCAPE_PX;
}

/** One pad's height, px — a constant, and the point of this wave. */
export function padHeightPx(side: "left" | "right", stage: StageBox): number {
  if (isCollapsed(stage)) {
    return side === "left" ? STEER_PAD_H_COLLAPSED_PX : DRIVE_PAD_H_COLLAPSED_PX;
  }
  return side === "left" ? STEER_PAD_H_PX : DRIVE_PAD_H_PX;
}

/**
 * How far above the stage's bottom edge the band's bottom edge sits — the
 * numeric twin of `BAND_LIFT`. Zero whenever the stage IS the small viewport,
 * which is every emulated profile and every chrome-shown phone.
 */
export function bandLiftPx(stage: StageBox): number {
  return Math.max(0, stage.height - (stage.svhHeight ?? stage.height));
}

/** The steering / drivetrain pad hit boxes, resolved. */
export function padRectPx(side: "left" | "right", stage: StageBox): StageRect {
  const insetB = stage.insetBottom ?? 0;
  const lift = bandLiftPx(stage);
  const h = padHeightPx(side, stage) + insetB;
  if (side === "left") {
    const w = resolve(STEER_PAD, stage.width) + (stage.insetLeft ?? 0);
    return { x: 0, y: stage.height - lift - h, w, h };
  }
  const w = resolve(DRIVE_PAD, stage.width) + (stage.insetRight ?? 0);
  return { x: stage.width - w, y: stage.height - lift - h, w, h };
}

/** Station `index` of one arc, resolved to a rect on the stage. */
export function arcStationRectPx(
  index: number,
  side: "left" | "right",
  stage: StageBox,
): StageRect {
  const count = arcStationCount(side);
  const bottom =
    bandLiftPx(stage) +
    padHeightPx(side, stage) +
    arcRiseAtPx(index, count, arcRisePx(stage)) +
    (stage.insetBottom ?? 0);
  const inset =
    ARC_EDGE_PX +
    arcRunStepPx(stage) * (count - 1 - index) +
    (side === "left" ? (stage.insetLeft ?? 0) : (stage.insetRight ?? 0));
  return {
    x: side === "left" ? inset : stage.width - inset - TOUCH_MIN_PX,
    y: stage.height - bottom - TOUCH_MIN_PX,
    w: TOUCH_MIN_PX,
    h: TOUCH_MIN_PX,
  };
}

/** Top of the whole control band, px from the BOTTOM of the stage — the number
 *  `TOUCH_CONTROLS_FLOOR` spells in CSS. */
export function touchControlsFloorPx(stage: StageBox): number {
  return (
    bandLiftPx(stage) +
    padHeightPx("right", stage) +
    arcRisePx(stage) +
    TOUCH_MIN_PX +
    (stage.insetBottom ?? 0) +
    TOUCH_CONTROLS_FLOOR_GAP_PX
  );
}

/** The gap in TOUCH_CONTROLS_FLOOR. 20 px, and it is not rounding — see the
 *  export's own note: the one control that sits on this floor carries a 12 px
 *  ::before on each side. */
const TOUCH_CONTROLS_FLOOR_GAP_PX = 20;

/**
 * THE TOP OF THE WHOLE CONTROL BAND, as a CSS length, for anything that has to
 * sit ABOVE the thumbs.
 *
 * `--sim-hud-floor` is not this number and cannot be: that one is where the
 * INSTRUMENT band ends (40px of dash + 8, i.e. 48px on every phone in the
 * ladder), and this band reaches 224px higher. A widget that clears the dash
 * can still land squarely on the steering pad.
 *
 * Measured, WebKit, iPhone 16 PORTRAIT 393x852, in two passes — the second one
 * is why this is the band and not just the pads:
 *
 *   at 108px (bottom-[6.75rem], the roomy floor)  wheel 981px², throttle 363px²
 *   at 184px (drive pad + inset + gap)            wheel 0, throttle 0, but a
 *                                                 6px-wide sliver of the mirror
 *                                                 glance (24px²) and the horn
 *                                                 (164px²) — the glyph ROWS,
 *                                                 which stack above the pads
 *   at this value                                 0
 *
 * The band is the tallest stack in this file: the drive pad, plus the ARC that
 * measures from it (the `bottom:` calcs below), plus the home indicator, plus a
 * gap so nothing is flush. The steering side is shorter, so the drive side
 * decides.
 *
 * THE GAP IS 1.25 rem AND IT IS NOT ROUNDING. It used to be 0.5 rem, and the
 * one thing that sits on this floor — the demonstration deck's «🎬 Демонстрация»
 * toggle — carries a 0.75 rem ::before on each side, because row C2 grew its
 * hit rect to 44 px without growing the pill (PlayAreaStyles). So the control's
 * REAL bottom edge is 12 px below the box this floor is measured against, and
 * with an 8 px gap it reached into the top station: measured 2026-08-10 on the
 * founder's phone, «🎬 Демонстрация ▸» × «Клаксон — задръж» = 1 861 px², the
 * largest overlap on the screen, and 1 100 px² more into the drivetrain pad
 * below it. 20 px clears the pseudo-element with 8 px to spare.
 *
 * EXPORTED RATHER THAN RESTATED. These pads are the one thing on this screen
 * whose geometry is actively being reshaped; anything that reads this follows
 * the band wherever it goes instead of pinning a copy of today's number.
 */
export const TOUCH_CONTROLS_FLOOR = touchControlsFloorCss();

/**
 * ── THE SAME FLOOR, RESOLVED AGAINST A HEIGHT YOU NAME — doc 91 §I11 ────────
 *
 * ONE TERM OF THIS FLOOR IS STILL A PERCENTAGE AND IT IS THE ONLY ONE: the band
 * LIFT, `max(0px, calc(<stage> − 100svh))`. The pad, the rise, the station row
 * and the gap are all constants now, so the whole rest of the expression is
 * `calc()` on fixed lengths.
 *
 * A PERCENTAGE DOES NOT WORK IN A `max-height`, AND THAT COST A DEPLOY. It
 * resolves against the containing block's HEIGHT, and the sheet's containing
 * block is a `bottom:`-anchored box whose height is auto — an indefinite
 * reference, so the whole declaration is treated as `none`. Measured on the
 * deployed product: the cap silently did nothing, the sheet grew to its content
 * and its «Затвори» stood 123.5 px above the top of the screen.
 *
 * So the arithmetic is written ONCE and the ONE percentage is rendered against
 * whichever height token the call site can honestly resolve. The shell passes
 * `var(--sim-vh)` — the measured visual-viewport height it already publishes,
 * which on a compact stage IS the stage height (no top bar, no shell padding) —
 * and gets a percentage-free twin that is legal in a `max-height`.
 *
 * `env(safe-area-inset-bottom)` stays authored either way, which is not a
 * detail: `tools/mobile/lib/insets.mjs` substitutes the profile's real inset
 * into declarations the app AUTHORED and cannot reach a number computed in JS,
 * so a floor built here in pixels would be 21–34 px short on every sweep and
 * the harness would report green on a band it had mis-measured. The same rule
 * is why `--sim-svh` is a CSS variable set by a stylesheet rather than a number
 * this component computes: a JS-side `svh` would be invisible to the harness.
 */
export function touchControlsFloorCss(heightToken = "100%"): string {
  return `calc(${bandLiftCss(heightToken)} + ${DRIVE_PAD_H} + ${ARC_RISE} + ${ROW_H} + ${INSET_B} + ${rem(TOUCH_CONTROLS_FLOOR_GAP_PX)})`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE TOP RAIL — the one corner of a phone held sideways where NO THUMB RESTS.

   His reference frame puts «PAUSE» and «VIEW» there as two chunky, OPAQUE,
   word-labelled buttons and nothing else, and doc 91 §F names that as the one
   principle of the five we had simply not taken. Before this rework the corner
   held exactly one 48 × 44 control on every profile measured — «Меню» — and the
   camera was two taps deep inside the ⚙ sheet under the name «ИЗГЛ».

   So the rail is where the RARE controls live: camera, pause, horn, the ⚙
   sheet, and the seatbelt while it is unfastened. None of them belongs under a
   driving thumb, and every one of them is now a WORD rather than a glyph a
   17-year-old has to decode.

   THE TWO BOUNDS ARE BOTH SOMEBODY ELSE'S CONTRACT, restated from their own
   constants rather than copied as numbers:

     LEFT   past «Меню на урока» — the same `0.5rem + 3.5rem` the open landscape
            deck already stands on (DECK_COMPACT_OPEN_LEFT_CSS). One rail, one
            clearance; if the menu word ever grows, both move together.
     RIGHT  clear of the notification column, whose left edge may never come
            left of 0.60 of the width (notifyColumn.ts). The rail may therefore
            never reach it, and `topRailBandPx()` below is the same arithmetic
            in numbers so touchArc.test.ts can sweep the ladder for it.

   IT WRAPS, and that is the portrait answer. A phone held upright leaves about
   167 px between those two bounds; five 44 px word-buttons need ~310. They fold
   onto a second and third row against the TOP EDGE, which is where the
   reference puts information and where nothing else on this screen lives — the
   column is past 0.60 of the width and the whole control band is at the floor.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Where the rail starts — past the shell's «Меню» button. */
export const TOP_RAIL_LEFT_CSS = `calc(0.5rem + 3.5rem + ${INSET_L})`;
/** …and where it must stop: the notification column's own gutter. */
export const TOP_RAIL_RIGHT_CSS = `calc(${NOTIFY_COLUMN_RIGHT_CSS} + ${NOTIFY_COLUMN_WIDTH_CSS_COMPACT} + 0.5rem)`;
export const TOP_RAIL_TOP_CSS = NOTIFY_COLUMN_TOP_CSS_COMPACT;
/**
 * ONE RAIL ROW PLUS ITS GUTTER — the lane anything sharing this corridor has to
 * clear. 2026-08-12, J-WAVE-2 · surfaces.
 *
 * THE COLLISION IT EXISTS TO CLOSE, measured (WebKit, real insets,
 * `/dev/drive-rig` sc-zebra-approach@L1). The rail lands at `top: 0.5rem`,
 * `left: 0.5rem + 3.5rem` — and `DECK_COMPACT_OPEN_LEFT_CSS` is the SAME
 * `0.5rem + 3.5rem`, because the block above took the deck's own clearance as
 * its left bound. In landscape the open deck also hangs from `top: 0.5rem`. So
 * the two are not near each other, they start at the same point:
 *
 *   galaxy-gesturebar-landscape 780×360 (the Samsung gesture-bar row, 34.6 % of
 *   the market): deck [64,8 456×92] against rail [64,8 456×44]
 *     → 20 064 px² of surface;
 *       NINE overlapping control pairs (768 px²) where the transport's 44 px
 *       hit boxes reach 3 px above their own row — including «Пауза» ∩ «Пауза»,
 *       the deck's ⏸ and the rail's word, 105 px² apart;
 *       and with a caption on screen, 14 366 px² of the demonstration's own
 *       prose lying across «Изглед», «Пауза», «Клаксон», «Кола» and «Колан».
 *
 * The rail is the fixed thing here — it is where the founder's reference puts
 * the two opaque buttons and it must be findable in every state — so the deck
 * takes the lane below it, the same way it already took a lane beside the map
 * toggle. Exported rather than restated so the rail's height and the deck's
 * clearance are one number.
 */
export const TOP_RAIL_ROW_CSS = `calc(${ROW_H} + 0.5rem)`;

/** The rail's band on a given stage, px — x, width, and the column it clears. */
export function topRailBandPx(stage: StageBox): {
  x: number;
  w: number;
  columnLeftPx: number;
} {
  const x = 8 + 56 + (stage.insetLeft ?? 0);
  const columnLeftPx =
    stage.width -
    NOTIFY_COLUMN_GUTTER_PX -
    (stage.insetRight ?? 0) -
    notifyColumnWidthPx(stage.width, true);
  return { x, w: Math.max(0, columnLeftPx - 8 - x), columnLeftPx };
}

/* ── THE CENTRE CORRIDOR — the strip between the two thumb pads ──────────────
   The pads are the only two things on this screen that are wide, and they are
   at the two bottom corners. Everything BETWEEN them is road on every profile
   in the ladder, at every height: 350 px on a landscape iPhone, 78 px on a
   portrait one. Published so the one transient panel that has to speak while
   the student is driving — the first-run thumb hint — can be told to live
   inside it instead of being centred on the screen, which is how a line of its
   own type ended up across «Клаксон» and both mirror glances (doc 91, the
   founder's photograph). */
export const PAD_CORRIDOR_LEFT_CSS = `calc(${STEER_PAD_W} + ${INSET_L} + 0.5rem)`;
export const PAD_CORRIDOR_RIGHT_CSS = `calc(${DRIVE_PAD_W} + ${INSET_R} + 0.5rem)`;

/** …and in numbers, for the ladder sweep. */
export function padCorridorPx(stage: StageBox): { x: number; w: number } {
  const left = padRectPx("left", stage);
  const right = padRectPx("right", stage);
  const x = left.x + left.w + 8;
  return { x, w: Math.max(0, right.x - 8 - x) };
}

interface CabinSnap {
  gearLabel: string;
  /**
   * The real selector and the real gearbox — polled because TWO of this
   * overlay's labels are only true for some values of them (2026-08-11):
   * the drivetrain pad's reverse promise and the sheet's „D►" stepper. See
   * `reverseGestureLive` and the stepper cell.
   */
  selector: SelectorPosition;
  transmission: TransmissionMode;
  engineOn: boolean;
  parkingBrakeOn: boolean;
  hazardsOn: boolean;
  wipersOn: boolean;
  fogLightsOn: boolean;
  headlights: HeadlightSetting;
  seatbeltOn: boolean;
  indicator: IndicatorSetting;
}

function readCabinSnap(cabin: CabinControls): CabinSnap {
  const d = cabin.driveline;
  return {
    gearLabel: d.gearLabel,
    selector: d.selector,
    transmission: d.transmission,
    engineOn: d.engineOn,
    parkingBrakeOn: d.parkingBrakeOn,
    hazardsOn: d.hazardsOn,
    wipersOn: d.wipersOn,
    fogLightsOn: d.fogLightsOn,
    headlights: cabin.headlights,
    seatbeltOn: cabin.seatbeltOn,
    indicator: cabin.indicator,
  };
}

function sameSnap(a: CabinSnap | null, b: CabinSnap): boolean {
  return (
    a !== null &&
    a.gearLabel === b.gearLabel &&
    a.selector === b.selector &&
    a.transmission === b.transmission &&
    a.engineOn === b.engineOn &&
    a.parkingBrakeOn === b.parkingBrakeOn &&
    a.hazardsOn === b.hazardsOn &&
    a.wipersOn === b.wipersOn &&
    a.fogLightsOn === b.fogLightsOn &&
    a.headlights === b.headlights &&
    a.seatbeltOn === b.seatbeltOn &&
    a.indicator === b.indicator
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DOES THE REVERSE GESTURE THIS PAD ADVERTISES ACTUALLY EXIST RIGHT NOW?
 * 2026-08-11 — the „silent refusal" sweep, and the twin of the fix the
 * KEYBOARD legend already got (`ControlsHelp.reverseAssistEnabled`).
 *
 * The pad's `aria-label` has always ended „спряла кола: пусни и натисни пак
 * надолу за назад". That sentence is FALSE in two whole modes, and a sighted
 * student discovers it by pressing; a screen-reader user has no way to
 * discover it at all, which is why this is a defect and not a nicety:
 *
 *   · EXAM RUNGS. `LessonScene` sets `reverseAssistEnabled = lesson.examMode
 *     !== true`, so on an exam neither ReverseAssist nor the pedal swap runs —
 *     158 of the 169 `level: 4` rungs in the catalogue are exam rungs.
 *   · „НАПРЕДНАЛ". The manual gate is P—R—N—M1…M5 and N→R REQUIRES THE CLUTCH
 *     (vehicle/driveline.ts, „going INTO a gear needs the clutch"), so the
 *     assist's D→N→R stops at N and the car sits in neutral. It is the same
 *     shape as the founder's own 2026-07-17 report, one tier over.
 *
 * AND THE `inReverse` BRANCH IS FALSE IN THE SAME TWO MODES, which is easy to
 * miss: „надолу назад, нагоре спирачка" describes the PEDAL SWAP, and the swap
 * is `reverseAssistEnabled && shouldRemapReversePedals(selector, transmission)`
 * — automatic only. Sitting in R on an exam or on „Напреднал", up is still the
 * accelerator and down is still the brake, exactly as in a real car.
 *
 * So the question is asked of `shouldRemapReversePedals` itself rather than of
 * a re-stated `transmission === "automatic"`: that predicate is where „the
 * assist is an automatic-box affordance" is written down, and a label derived
 * from it cannot drift away from the mapper the way a copied rule would. It is
 * the same discipline `ReverseStuckWatch` follows — read the mapper, never a
 * paraphrase of it.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function reverseGestureLive(
  assistEnabled: boolean,
  transmission: TransmissionMode,
): boolean {
  return assistEnabled && shouldRemapReversePedals("R", transmission);
}

/**
 * The drivetrain pad's accessible name — one sentence per REAL behaviour.
 *
 * Four cases, not two. The pad itself is unchanged in every one of them: this
 * function does not gate, permit or refuse anything, it only stops the label
 * describing a mode the student is not in.
 *
 * Exported for the same reason the arc arithmetic is (see `padRectPx`): the
 * only instrument that could otherwise check this sentence is a person with a
 * screen reader and an exam rung open.
 */
export function driveAxisLabelBg(
  inReverse: boolean,
  gestureLive: boolean,
  transmission: TransmissionMode,
): string {
  if (gestureLive) {
    return inReverse
      ? "Ход — назад: надолу назад, нагоре спирачка"
      : "Ход — нагоре напред, в средата спиране, надолу спирачка; спряла кола: пусни и натисни пак надолу за назад";
  }
  // No assist and no swap: the pedals keep their real meanings whichever way
  // the selector points, and the selector is the only way to turn the car
  // around. Wording follows the legend's own row for the same state.
  if (inReverse) {
    return "Ход — в R: нагоре газ (колата тръгва назад), надолу спирачка. Посоката се сменя само с лоста.";
  }
  return transmission === "manual"
    ? "Ход — нагоре газ, в средата спиране, надолу спирачка. В „Напреднал“ заден ход се избира с лоста и съединителя, не с този палец."
    : "Ход — нагоре газ, в средата спиране, надолу спирачка. На изпит заден ход се избира само с лоста в ⚙ (D → N → R).";
}

/* ── THE TIER, AS A SHEET CELL ────────────────────────────────────────────────
   FOUR LETTERS, because a cell is 44 px and its type is 10 px — the same
   budget «СВЕТЛ» and «АВАР» already live on. The whole Bulgarian word is in
   the accessible name, where it costs no pixels, exactly as the rail's camera
   button does it.

   IT CYCLES rather than offering three targets, and that is arithmetic and not
   taste: three cells is 138 px of a strip that already carries thirteen, and it
   would push the 360 px Android's sheet from two rows to three. The idiom is
   this file's own — the top-down zoom cell is «Мащаб отгоре… — натисни за
   следващия» — and the order is the curriculum's (`DIFFICULTY_ORDER`), so
   „next" always means „one step less help".
   ──────────────────────────────────────────────────────────────────────────── */

/** The 4-letter face of a tier. Exported so the test reads the shipped map. */
export function tierCellTextBg(mode: DifficultyMode): string {
  return mode === "beginner" ? "НАЧ" : mode === "advanced" ? "НАПР" : "НОРМ";
}

/** …and the next one round the ring. */
export function nextTier(mode: DifficultyMode): DifficultyMode {
  const i = DIFFICULTY_ORDER.indexOf(mode);
  return DIFFICULTY_ORDER[(i + 1) % DIFFICULTY_ORDER.length] ?? mode;
}

/** The accessible name: which tier is on, and what a tap will do. */
export function tierCellLabelBg(mode: DifficultyMode): string {
  return `Ниво на помощта: ${DIFFICULTY_PRESETS[mode].labelBg} — натисни за ${DIFFICULTY_PRESETS[nextTier(mode)].labelBg}`;
}

export interface TouchControlsProps {
  /** Shared axis source, already attached to the scene's SimInput. */
  touch: TouchInputSource;
  cabinRef: RefObject<CabinControls | null>;
  /**
   * False on examMode lessons, where `ReverseAssist` and the rule-b pedal swap
   * are both off for the whole session (LessonScene: `reverseAssistEnabled =
   * lesson.examMode !== true`) — the same flag `ControlsHelp` already takes,
   * and for the same reason: the pad's label promises a gesture that mode does
   * not have. Defaults to the lesson behaviour so a legacy mount is unchanged.
   */
  reverseAssistEnabled?: boolean;
  /** True while paused / quiz / teach / consequence / end overlays are up. The
   *  overlay goes INERT (it is not unmounted — see the render) and releases
   *  every held axis AND both pads' pointer ownership. */
  hidden: boolean;
  /** The C-key cycle. Still wired (the rail's own button does not use it), so
   *  a hybrid device's keyboard keeps working exactly as it did. */
  onToggleCamera: () => void;
  /** Which view is live — the rail draws it, it does not guess it. */
  cameraMode?: CameraMode;
  /** Pick a view outright. Optional so a legacy mount is unchanged: without
   *  it the rail falls back to the C cycle on one button. */
  onSelectCameraMode?: (mode: CameraMode) => void;
  /** False on exam rungs — the rail then offers two views, not three, exactly
   *  as the C cycle and the keyboard legend already do. */
  topdownAllowed?: boolean;
  /** CameraRig's handle for the two top-down aids (G and N). */
  topdownAidRef?: RefObject<TopdownAidHandle | null>;
  /**
   * The ⚙ sheet opened or closed. The scene uses it to stand the demonstration
   * deck down — the two are anchored to the same line and cannot share it (the
   * arbitration and its measurements are at `touchSheetOpen` in LessonScene).
   */
  onSheetOpenChange?: (open: boolean) => void;
  onPause: () => void;
  onReset: () => void;
  /** Fullscreen toggle from the shell (QW1 owns the fullscreen element). */
  onToggleFullscreen: (() => void) | null;
  /**
   * THE TIER, BECAUSE ON A PHONE IT HAS NOWHERE ELSE TO STAND — J-WAVE-3.
   *
   * `[data-hud="difficulty"]` is a three-segment pill in the SCENE tree, pinned
   * to `top: 0.5rem + inset, right: 0.75rem`. Measured in WebKit with the real
   * insets it lays out **255 px** («Начинаещ» 78 + «Нормален» 78 + «Напреднал»
   * 85, two 4 px gaps and 8 px of padding). The top strip it lands in is
   * already owned:
   *
   *   the top rail       x 64 → 231.5 (`TOP_RAIL_LEFT_CSS` past «Меню», stopping
   *                      8 px short of the notification column) — 167.5 px, and
   *                      five word-buttons are already wrapping inside it;
   *   the notify column  x 239.5 → 381 — 141.5 px (`min(15rem, 36vw)`).
   *
   * 255 px of demand into a 167.5 px lane or a 141.5 px one. It does not fit in
   * either, at any font, and abbreviating it does not save it: three 44 px
   * targets plus gaps need 148 px against the 129.6 px the 360 px Android
   * leaves. So on a phone the pill is not repositioned, it is REPLACED — by the
   * cell below, in the sheet that already holds every other switch in this car.
   * The tier is not decoration here: it is what decides whether this gearbox is
   * automatic or manual (`transmissionModeFor`), i.e. whether «СЪЕД» two cells
   * along exists at all. Absent, the sheet simply does not offer the cell and
   * the scene's own pill keeps the corner, which is what a desktop does.
   */
  difficulty?: DifficultyMode;
  onSelectDifficulty?: (mode: DifficultyMode) => void;
}

export function TouchControls({
  touch,
  cabinRef,
  hidden,
  reverseAssistEnabled = true,
  onToggleCamera,
  cameraMode,
  onSelectCameraMode,
  topdownAllowed = true,
  topdownAidRef,
  onSheetOpenChange,
  onPause,
  onReset,
  onToggleFullscreen,
  difficulty,
  onSelectDifficulty,
}: TouchControlsProps) {
  // Hybrid devices: recent keyboard use hides the overlay; a screen touch
  // brings it back. Touch-only devices simply never see driving keys.
  const [keyboardActive, setKeyboardActive] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (KEYBOARD_DRIVE_CODES.has(e.code)) setKeyboardActive(true);
    };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") setKeyboardActive(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  const visible = !hidden && !keyboardActive;

  // ── The two pads' pointer ownership, and the two knobs that draw them ─────
  // Both are declared HERE, above the release effect, because that effect has
  // to be able to let go of every one of them. `PadPointer` is engine state
  // (modules/sim/engine/touch.ts) rather than a bare `useRef<number|null>` for
  // the reason written out at length there: the release used to be an
  // assignment in one place and a method call in another, and the two halves
  // drifted apart without anything noticing.
  const steerPad = usePadPointer();
  const drivePad = usePadPointer();
  const steerKnobRef = useRef<HTMLDivElement | null>(null);
  const driveKnobRef = useRef<HTMLDivElement | null>(null);

  /** Both knobs home. The ink must not go on claiming a throttle the hide just
   *  released — the pad's node now SURVIVES the interruption (see the render
   *  below), and its inline transform survives with it. */
  const parkKnobs = useCallback(() => {
    const steer = steerKnobRef.current;
    if (steer) {
      steer.style.transition = "none";
      steer.style.transform = "translateX(0px)";
    }
    const drive = driveKnobRef.current;
    if (drive) {
      drive.style.transition = "none";
      drive.style.transform = "translateY(0px)";
      drive.style.borderColor = "var(--accent)";
    }
  }, []);

  // ═══ ANY HIDE LETS GO OF EVERYTHING — THE AXES *AND* THE POINTERS ════════
  // (pause / quiz / teach card / consequence / end screen / keyboard takeover
  //  / unmount — the shell's `paused={ended || activeQuiz !== null ||
  //  teachQueue.length > 0 || consequence !== null}` → LessonScene's
  //  `physicsPaused = paused || menuPaused` → this component's `hidden`, so
  //  every one of those routes arrives here and none of them can take a
  //  different one. Asserted in touchPadRelease.test.tsx §4, because a sixth
  //  card kind added to a different prop is exactly how this comes back.)
  //
  // The axes half is original and correct: a finger resting on the throttle
  // must never keep driving a frozen scene, which is why the car STOPS when a
  // card arrives instead of running away.
  //
  // THE POINTER HALF IS DOC 91 §C1, AND IT IS THE WHOLE BUG. The finger is
  // still on the glass when the card takes the screen; its `pointerup` is
  // delivered to a node that is no longer in the interaction path, so the pad
  // went on believing that finger owned it and refused every later touch —
  // permanently, measured 3/3 with the thumb held against 0/3 with it lifted a
  // beat earlier. One call now means "let go of everything", so this can never
  // again be done by half.
  useEffect(() => {
    if (!visible) {
      releaseTouchControls(touch, steerPad, drivePad);
      parkKnobs();
    }
  }, [visible, touch, steerPad, drivePad, parkKnobs]);
  useEffect(
    () => () => releaseTouchControls(touch, steerPad, drivePad),
    [touch, steerPad, drivePad],
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [snap, setSnap] = useState<CabinSnap | null>(null);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * TELL THE SCENE, BECAUSE THE DEMONSTRATION DECK STANDS ON THIS SAME LINE.
   * Doc 91 §D4/§I11 — J-WAVE-2.
   *
   * The sheet below is `bottom: TOUCH_CONTROLS_FLOOR`. So is the demonstration
   * deck (PlayAreaStyles). They are not near each other — they are AT THE SAME
   * ANCHOR, and the sheet is painted last. Measured, WebKit, real insets,
   * `/dev/drive-rig` sc-zebra-approach@L1, 2026-08-12:
   *
   *   galaxy-gesturebar-landscape · sheet open, deck COLLAPSED
   *     deck [12,73.5 240×27] floor 260px · sheet [2,56 776×44] floor 260px
   *     → 6 240 px², and the deck's own «🎬 Демонстрация ▸» answered a sheet
   *       cell at its own centre. The control that OPENS the demonstration
   *       was dead whenever the car's controls were open.
   *   galaxy-gesturebar-landscape · sheet open, deck OPEN
   *     → 20 064 px² of surface, 16 overlapping control pairs, 13 098 px² of
   *       44 px targets and SEVEN dead controls, every one of them a deck
   *       transport control.
   *   iphone16-landscape · 6 480 px² collapsed, 9 840 px² open.
   *   Portrait, both 360 profiles: 5 590 px² with the deck merely COLLAPSED.
   *
   * The scene answers by standing the deck down — suppressed, not closed; it
   * keeps its step, its playhead and its play state, and pauses itself so
   * nothing advances off screen. `LessonScene`'s `touchSheetOpen` block has
   * the arbitration, the arithmetic for why they cannot be stacked instead,
   * and what the student loses.
   *
   * `visible &&` IS LOAD-BEARING: when a teach card arrives this overlay goes
   * inert and the sheet's node is not rendered at all (the `{visible ? …}`
   * branch below), so a `true` left published here would keep a demonstration
   * hidden behind a card that has nothing to do with it.
   * ═══════════════════════════════════════════════════════════════════════
   */
  useEffect(() => {
    onSheetOpenChange?.(visible && sheetOpen);
  }, [visible, sheetOpen, onSheetOpenChange]);
  // …and on the way out, because an unmount is not a state change the effect
  // above can see: a lesson that ends with the sheet open must not leave the
  // next mount's deck suppressed by a component that is gone.
  useEffect(() => () => onSheetOpenChange?.(false), [onSheetOpenChange]);
  /**
   * WHICH CAMERA IS LIVE, so the rail's «ИЗГЛЕД» button can say what it will
   * give you next instead of being a mystery cycle.
   *
   * Read off `<html data-sim-camera>` and not out of React state, because that
   * attribute is the ONE fact the rig publishes to the DOM and it is written
   * inside `useFrame` on change only (CameraRig: „a 60 Hz setState would be a
   * rendering bug"). Sampling it on the cabin poll that already runs costs one
   * property read every 250 ms and adds no subscription.
   *
   * NAMED `cameraModeLive`, NOT `cameraMode` (2026-08-12). A `cameraMode` PROP
   * was added to this component in the same working tree (`:844`, `:871`,
   * passed from `LessonScene:1688`) while this state was still called
   * `cameraMode` — two bindings, one scope, so `tsc` reported
   * `TS2300: Duplicate identifier 'cameraMode'` twice and Turbopack refused to
   * build ANY route that reaches TouchControls (i.e. the whole simulator).
   * Neither is deleted here, because they are not the same fact: the prop is
   * what the scene INTENDS, this is what the rig has actually PUBLISHED, and
   * they differ for one poll interval after a switch. The label prefers the
   * prop and falls back to this, so a legacy mount that passes no prop keeps
   * the behaviour this state was written for.
   */
  const [cameraModeLive, setCameraMode] = useState<string | null>(null);

  // Low-Hz cabin poll for button active-states (skips setState when equal —
  // steady-state renders are zero).
  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(() => {
      const view = document.documentElement.dataset.simCamera ?? null;
      setCameraMode((prev) => (prev === view ? prev : view));
      const cabin = cabinRef.current;
      if (!cabin) return;
      const next = readCabinSnap(cabin);
      setSnap((prev) => (sameSnap(prev, next) ? prev : next));
    }, CABIN_POLL_MS);
    return () => window.clearInterval(id);
  }, [visible, cabinRef]);

  /**
   * …AND THE SAME FACT PUBLISHED TO THE STYLESHEET, for the surfaces that are
   * neither this component's nor the scene's to hold a prop for.
   *
   * `onSheetOpenChange` above is how the SCENE learns (it suppresses the
   * demonstration deck, pausing and resuming it — `touchSheetOpen` in
   * LessonScene). This attribute is how the CASCADE learns, and it currently
   * has exactly one consumer: the first-run thumb hint, which after this wave's
   * layout change stands on the SAME `TOUCH_CONTROLS_FLOOR` line as this sheet
   * and, in portrait, inside the three rows this sheet folds to.
   *
   * MEASURED, iPhone 16 portrait, sheet open with the hint still up: 4 964 px²
   * of the hint's type over five sheet cells and TWO of them dead behind its
   * «Разбрах». The rule and the ladder it belongs to are in PlayAreaStyles.
   *
   * `html[data-sim-*]` is the grammar the camera mode and the mirror glances
   * already publish on, for the same reason: one fact, written on change only,
   * read by a stylesheet that spans component trees.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (!sheetOpen || !visible) {
      delete root.dataset.simCarSheet;
      return;
    }
    root.dataset.simCarSheet = "open";
    return () => {
      delete root.dataset.simCarSheet;
    };
  }, [sheetOpen, visible]);

  // ---- steering pad (direct DOM writes, no state) ---------------------------
  const steerStartX = useRef(0);

  /** Knob travel, px — the mark's own half-width, NOT the drag range: the
   *  ink is a state indicator for an 84 px gesture, not a scale model of it. */
  const STEER_KNOB_TRAVEL = 27;

  const steerApply = useCallback(
    (clientX: number) => {
      const dx = clientX - steerStartX.current;
      touch.setSteer(steerFromDrag(dx, TOUCH_STEER_RANGE_PX));
      const knob = steerKnobRef.current;
      if (knob) {
        const t = Math.max(
          -STEER_KNOB_TRAVEL,
          Math.min(STEER_KNOB_TRAVEL, (dx / TOUCH_STEER_RANGE_PX) * STEER_KNOB_TRAVEL),
        );
        knob.style.transform = `translateX(${t.toFixed(1)}px)`;
      }
    },
    [touch],
  );

  /** Seat the wheel's origin under the thumb and start following it. */
  const steerBegin = useCallback(
    (clientX: number) => {
      // RELATIVE, not absolute: the gesture starts wherever the thumb landed,
      // so the student never has to find a 26 px dot before they can steer.
      // (The GAS pad no longer works this way — see the drivetrain block and
      // the founder ruling quoted in engine/touch.ts. Steering keeps it: on
      // this axis „where my thumb is" is not a meaning a student holds.)
      steerStartX.current = clientX;
      const knob = steerKnobRef.current;
      if (knob) knob.style.transition = "none";
      steerApply(clientX);
    },
    [steerApply],
  );

  const onSteerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!steerPad.claim(e.pointerId)) return; // one finger owns the wheel
      capturePointer(e.currentTarget, e.pointerId);
      steerBegin(e.clientX);
    },
    [steerBegin, steerPad],
  );

  const onSteerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (steerPad.owns(e.pointerId)) {
        steerApply(e.clientX);
      } else if (adoptable(steerPad, e, visible)) {
        steerBegin(e.clientX);
      }
    },
    [steerApply, steerBegin, steerPad, visible],
  );

  const onSteerEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!steerPad.release(e.pointerId)) return;
      touch.releaseSteer(); // springs back: keyboard/gamepad regain the axis
      const knob = steerKnobRef.current;
      if (knob) {
        knob.style.transition = "transform 140ms ease-out";
        knob.style.transform = "translateX(0px)";
      }
    },
    [touch, steerPad],
  );

  // ---- drivetrain pad: ONE axis, throttle above centre, brake below --------
  //
  // ABSOLUTE (founder ruling 2026-08-11 — „up is forward, middle is stop, down
  // is backwards"): the axis is WHERE THE THUMB IS on the pad, not how far it
  // has travelled since it landed. A motionless press above the middle
  // accelerates; a motionless press below it brakes; the middle 44 px command
  // nothing. The curve, the neutral band and the sign convention all live in
  // `driveAxisFromPadY` (engine/touch.ts), which is where the ruling and the
  // property it costs are written down.
  //
  // The centre is READ FROM THE PAD'S OWN BOX at the start of every gesture
  // rather than computed from the CSS: this pad's height is a `min()` of a
  // percentage and a cap, its box grows by the home-indicator inset, and both
  // move under rotation, a URL bar and fullscreen. Asking the element is the
  // only version of this number that cannot go stale.
  const driveCentreY = useRef(0);

  const DRIVE_KNOB_TRAVEL = 30;

  const seatDriveCentre = useCallback((padEl: Element) => {
    const box = padEl.getBoundingClientRect();
    if (box.height > 0) driveCentreY.current = box.top + box.height / 2;
  }, []);

  const driveApply = useCallback(
    (clientY: number) => {
      const dy = clientY - driveCentreY.current;
      const axis = driveAxisFromPadY(clientY, driveCentreY.current);
      // Exactly one channel is ever held: both pedals down is ambiguous input
      // and would also veto ReverseAssist's standstill hold.
      if (axis > 0) {
        touch.releaseBrake();
        touch.setThrottle(axis);
      } else if (axis < 0) {
        touch.releaseThrottle();
        touch.setBrake(-axis);
      } else {
        touch.releaseThrottle();
        touch.releaseBrake();
      }
      const knob = driveKnobRef.current;
      if (knob) {
        const t = Math.max(
          -DRIVE_KNOB_TRAVEL,
          Math.min(DRIVE_KNOB_TRAVEL, (dy / TOUCH_DRIVE_ABSOLUTE_RANGE_PX) * DRIVE_KNOB_TRAVEL),
        );
        knob.style.transform = `translateY(${t.toFixed(1)}px)`;
        knob.style.borderColor =
          axis > 0 ? "var(--success)" : axis < 0 ? "var(--danger)" : "var(--accent)";
      }
    },
    [touch],
  );

  /** Take the pad: read where „middle" is, then obey the thumb immediately. */
  const driveBegin = useCallback(
    (padEl: Element, clientY: number) => {
      seatDriveCentre(padEl);
      const knob = driveKnobRef.current;
      if (knob) knob.style.transition = "none";
      driveApply(clientY);
    },
    [driveApply, seatDriveCentre],
  );

  const onDriveDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drivePad.claim(e.pointerId)) return;
      capturePointer(e.currentTarget, e.pointerId);
      driveBegin(e.currentTarget, e.clientY);
    },
    [driveBegin, drivePad],
  );

  const onDriveMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (drivePad.owns(e.pointerId)) {
        driveApply(e.clientY);
      } else if (adoptable(drivePad, e, visible)) {
        driveBegin(e.currentTarget, e.clientY);
      }
    },
    [driveApply, driveBegin, drivePad, visible],
  );

  const onDriveEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drivePad.release(e.pointerId)) return;
      touch.releaseThrottle();
      touch.releaseBrake();
      const knob = driveKnobRef.current;
      if (knob) {
        knob.style.transition = "transform 140ms ease-out, border-color 140ms linear";
        knob.style.transform = "translateY(0px)";
        knob.style.borderColor = "var(--accent)";
      }
    },
    [touch, drivePad],
  );

  const cabin = () => cabinRef.current;

  const gearLabel = snap?.gearLabel ?? "—";
  const inReverse = gearLabel === "R";
  // Before the first 250 ms poll the cabin is unread; „automatic" is what a
  // fresh scene opens in (DEFAULT_DIFFICULTY === "normal"), so the default is
  // the truth rather than a guess.
  const transmission: TransmissionMode = snap?.transmission ?? "automatic";
  const gestureLive = reverseGestureLive(reverseAssistEnabled, transmission);

  return (
    /* ═══ HIDDEN MEANS INERT, NOT GONE — doc 91 §I3 ════════════════════════════
       This used to be `if (!visible) return null`, and that one line is half of
       why the founder's session was unrecoverable. Returning null destroys the
       pads' DOM nodes while the component instance (and every ref in it) lives
       on, so the thumb that is STILL ON THE GLASS is holding a control that no
       longer exists: its `pointerup` reaches nobody, and the pad it was holding
       is left owned by a finger that can never let go (§C1).

       So the overlay now stays mounted and goes INERT for the duration of the
       card: nothing is hit-testable (`pointer-events: none` on the pads
       themselves — the root has always been `pointer-events-none` and that says
       nothing about its children), nothing is announced (`aria-hidden` on the
       root removes the whole subtree from the accessibility tree), and nothing
       is tabbable or focusable, because every BUTTON is genuinely unrendered
       while inert — only the two pads and their ink stay, and they are plain
       divs with no tabindex. `opacity: 0` keeps the screen exactly as clear as
       it was before: the pads still occupy their boxes, so anything that
       measures the control band (CameraAidHint) reads the same numbers it
       always did, and the student sees nothing.

       What survives is the node identity, which is the entire point: the finger
       already on the pad delivers its next `pointermove` to the SAME element,
       `adoptable()` above picks it back up, and the pedal answers again the
       instant the card is dismissed — no lift-and-press ritual. The axes are
       still released on the way in (`releaseTouchControls`), so the car stops
       under the card rather than running away.

       CAVEAT, measured and stated: recovery is driven by the next pointer
       event. A thumb that stays PERFECTLY motionless through the whole card
       emits no `pointermove`, so it re-arms on its first pixel of movement (or
       on the next press). A real thumb wobbles ±3 px; a resting one commands
       nothing either way, because the pad's middle 44 px are neutral. */
    <div
      data-hud="touch-controls"
      data-sim-touch-inert={visible ? undefined : "on"}
      aria-hidden={visible ? undefined : true}
      className="pointer-events-none absolute inset-0 z-10 select-none"
      style={visible ? undefined : { opacity: 0 }}
    >
      {/* ══ BOTTOM-LEFT ═ steering ═══════════════════════════════════════════
          The box is the hit area and paints nothing at all; the mark inside is
          a 62 px rule and a 22 px knob. */}
      <div
        role="slider"
        aria-label="Волан — плъзни наляво или надясно"
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={0}
        onPointerDown={onSteerDown}
        onPointerMove={onSteerMove}
        onPointerUp={onSteerEnd}
        onPointerCancel={onSteerEnd}
        className={`${visible ? "pointer-events-auto" : "pointer-events-none"} absolute touch-none`}
        style={{
          left: 0,
          // `BAND_LIFT`, not `0`: the pad's bottom edge is the small viewport's
          // bottom edge, which the URL bar cannot move. See the block at the
          // head of this file. It IS 0 whenever the chrome is showing.
          bottom: BAND_LIFT,
          width: `calc(${STEER_PAD_W} + ${INSET_L})`,
          height: `calc(${STEER_PAD_H} + ${INSET_B})`,
        }}
      >
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: `calc(1.25rem + ${INSET_L})`,
            bottom: `calc(1.1rem + ${INSET_B})`,
            width: "3.875rem",
            height: "1.5rem",
          }}
          aria-hidden
        >
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-accent/45" />
          <span className="absolute left-0 top-1/2 h-2 w-px -translate-y-1/2 bg-accent/45" />
          <span className="absolute right-0 top-1/2 h-2 w-px -translate-y-1/2 bg-accent/45" />
          <div
            ref={steerKnobRef}
            className="h-[22px] w-[22px] rounded-full border-2 border-accent bg-background/70"
          />
        </div>
      </div>

      {/* ══ BOTTOM-RIGHT ═ ONE drivetrain axis ═══════════════════════════════
          Up = forward · centre = neutral · down = brake, then reverse (centre
          the thumb, then press down again — see the header).
          …EXCEPT on an exam rung and on „Напреднал", where that last clause is
          not true and the label no longer says it (see driveAxisLabelBg). The
          pad's behaviour is untouched: nothing here gates an input. */}
      <div
        role="slider"
        aria-label={driveAxisLabelBg(inReverse, gestureLive, transmission)}
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={0}
        onPointerDown={onDriveDown}
        onPointerMove={onDriveMove}
        onPointerUp={onDriveEnd}
        onPointerCancel={onDriveEnd}
        className={`${visible ? "pointer-events-auto" : "pointer-events-none"} absolute touch-none`}
        style={{
          right: 0,
          // Same anchor as the steering pad and the arc — one fixed line, three
          // independent measurements up from it. THE HEIGHT IS A CONSTANT, and
          // that is what keeps „dead centre is exactly 0 km/h" true: the pad's
          // centre is read from its own box at the start of every gesture
          // (`seatDriveCentre`), so a box that resized under the thumb moved
          // the neutral band with it. Measured 173 → 158 px on his phone at
          // −90 before this wave.
          bottom: BAND_LIFT,
          width: `calc(${DRIVE_PAD_W} + ${INSET_R})`,
          height: `calc(${DRIVE_PAD_H} + ${INSET_B})`,
        }}
      >
        {/* THE MARK SITS ON THE PAD'S CENTRE LINE, AND THAT IS NOT DECORATION.
            Since the axis went absolute, the centre of this box IS „middle is
            stop" — so the knob's resting place has to be that same line or the
            ink is lying about where neutral is. It used to be pinned 1.1 rem
            above the bottom edge, which on the founder's phone is 14 px below
            the true neutral: a thumb pressed exactly on the dot would have read
            as a light brake. Centring it also gives the axis its full 66 px
            each way inside the pad on every device in the ladder. */}
        <div
          className="absolute flex flex-col items-center justify-center"
          style={{
            right: `calc(1.25rem + ${INSET_R})`,
            top: "50%",
            transform: "translateY(-50%)",
            width: "1.5rem",
            height: "4.25rem",
          }}
          aria-hidden
        >
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-accent/45" />
          <span className="absolute left-1/2 top-0 h-px w-2 -translate-x-1/2 bg-accent/45" />
          <span className="absolute bottom-0 left-1/2 h-px w-2 -translate-x-1/2 bg-accent/45" />
          <div
            ref={driveKnobRef}
            className="h-[22px] w-[22px] rounded-full border-2 bg-background/70"
            style={{ borderColor: "var(--accent)" }}
          />
        </div>
        {/* The selector letter, 11 px, directly ABOVE the axis mark — not in
            the corner beside it, which is precisely where the thumb sits. Shown
            only when it is NOT the everyday D: „am I in reverse?" is a real
            question, „am I in drive?" is not.
            Measured from the same 50 % centre line the mark now uses (half the
            mark's 4.25 rem, plus a 0.25 rem gap), so the letter follows the ink
            instead of holding a copy of where the ink used to be. */}
        {gearLabel !== "D" ? (
          <span
            className="absolute text-[11px] font-black leading-none"
            style={{
              right: `calc(1.6rem + ${INSET_R})`,
              bottom: "calc(50% + 2.375rem)",
              color: inReverse ? "var(--warning)" : "var(--muted)",
              textShadow: "0 1px 3px rgba(0,0,0,0.9)",
            }}
            aria-hidden
          >
            {gearLabel}
          </span>
        ) : null}
      </div>

      {/* ══ EVERY BUTTON, AND ONLY WHILE THE SIM IS LIVE ═════════════════════
          The pads above stay mounted through a card so the thumb keeps its
          node; these do not, and the distinction is the accessibility half of
          §I3. A button that is invisible to a sighted student but still in the
          tab order and still announced is not "hidden", it is a different
          defect — and `aria-hidden` alone would create exactly that, because it
          hides an element from assistive tech WITHOUT taking it out of the tab
          order. Not rendering them is the only version of inert that is true
          for every input device at once. */}
      {visible ? (
        <>
      {/* ══ THE CORNER ═ TWO OPAQUE WORDS, AND NOTHING ELSE ══════════════════
          2026-08-13, the control redesign. His reference frame has exactly two
          chunky labelled buttons in this corner — «PAUSE» and «VIEW» — and this
          rail had FIVE. Measured on the deployed build, six profiles:

            PORTRAIT   the rail gets 168 px of width between «Меню на урока» and
                       the notification column, so five 44 px word-buttons WRAP
                       ONTO THREE ROWS, and every one of them lands 101.6–118.5
                       mm from either thumb pivot. The most generous published
                       thumb envelope is ~75 mm. NO THUMB REACHES ANY OF THEM
                       without regripping the phone — and one of them,
                       «Закопчай предпазния колан», is a GRADED pre-drive step.
            LANDSCAPE  54.9–70.4 mm: reachable, but the belt is the furthest
                       control on the screen and the ⚙ sheet the second furthest.

          Two controls may legitimately cost a regrip, because neither is ever
          time-critical: the camera and the pause. They stay. The other three
          went to the flanks, under the thumb that is already there —

            «Клаксон» → left arc, top station    109.6 mm → 45 mm (portrait)
            «Кола» ⚙  → right arc, station 0     110.7 mm → 27 mm
            «Колан»   → the same station's face  101.6 mm → 27 mm

          — and with five boxes gone from this strip, the horizontal band a
          horizontal panel could land on stopped existing. */}
      <div
        data-hud="top-rail"
        role="toolbar"
        aria-label="Бутони на екрана"
        className="pointer-events-none absolute z-10 flex flex-wrap items-start gap-1"
        style={{
          top: TOP_RAIL_TOP_CSS,
          left: TOP_RAIL_LEFT_CSS,
          right: TOP_RAIL_RIGHT_CSS,
        }}
      >
        {/* THE CAMERA IS A FIRST-CLASS CONTROL NOW — doc 91 §M1/§I23.
            It was «ИЗГЛ», two taps deep inside the ⚙ sheet, on a product whose
            own codebase says reverse parking is unreadable without the top-down
            view. The reference frame gives the camera a labelled button in this
            exact corner and it is the one principle of its five we had not
            taken at all.
            The WORD does not change with the mode on purpose: a button whose
            width breathes is a button that moves under the finger reaching for
            it, which is the founder's own „elements moving". The mode is in the
            accessible name, where it costs no pixels. */}
        <ViewRailControl
          mode={cameraMode ?? cameraModeLive ?? null}
          topdownAllowed={topdownAllowed}
          onSelectMode={onSelectCameraMode}
          onToggleCamera={onToggleCamera}
          topdownAidRef={topdownAidRef}
        />
        <RailButton wordBg="Пауза" labelBg="Пауза" onClick={onPause} />
      </div>

      {/* ══ LEFT FLANK ═ BOTH INDICATORS AND THE HORN, on the steering thumb ══
          Founder ruling: signalling must never cost the accelerator. Lower
          station = left, upper = right, which is the way a real LHD stalk
          moves. Each carries its own word, because «Мигач наляво» is the thing
          being TAUGHT — a 20 %-opacity mystery glyph is fine for a throttle the
          player already knows and fatal for a graded procedure step.

          THE HORN JOINS THEM AT THE TOP STATION. It is pressed WHILE THE CAR IS
          MOVING — which is the test this whole redesign sorts controls by — and
          in the top rail it sat 109.6 mm from either thumb in portrait, past the
          far edge of any published envelope. It is the least frequent of the
          three, so it takes the furthest station: ~13 mm sideways and ~45 mm
          upright, against 54.9 and 109.6. */}
      <ArcStation index={0} padH={STEER_PAD_H} side="left">
        <GlyphButton
          labelBg="Мигач наляво"
          captionBg="Ляв"
          active={snap?.indicator === "left"}
          onClick={() => cabin()?.indicateLeft()}
        >
          ⇦
        </GlyphButton>
      </ArcStation>
      <ArcStation index={1} padH={STEER_PAD_H} side="left">
        <GlyphButton
          labelBg="Мигач надясно"
          captionBg="Дясн"
          active={snap?.indicator === "right"}
          onClick={() => cabin()?.indicateRight()}
        >
          ⇨
        </GlyphButton>
      </ArcStation>

      <ArcStation index={2} padH={STEER_PAD_H} side="left">
        {/* Momentary, and it keeps the horn's own multi-touch-safe idiom — a
            pointer HOLD, so it still answers with a second thumb on a pad. */}
        <GlyphHoldButton
          labelBg="Клаксон — задръж"
          captionBg="Клакс"
          onHold={(on) => cabin()?.driveline.setHorn(on)}
        >
          ⊙
        </GlyphHoldButton>
      </ArcStation>

      {/* ══ RIGHT FLANK ═ THE DOCK, THEN THE THREE GRADED MIRROR GLANCES ═════
          Lifting off the throttle to check a mirror is what a driver does, so
          the interaction cost teaches the right habit instead of fighting it.
          Words again: «Л З Д» is three letters a 17-year-old has no way to
          decode, and these are scored A2 steps.

          ══ STATION 0 — THE NEAREST BOX ON THE SCREEN — IS THE ⚙ DOCK, AND
             WHILE THE BELT IS OFF IT *IS* THE BELT. ═══════════════════════════

          That one move is the largest measured win in this wave. «Закопчай
          предпазния колан» was 70.4 mm away sideways and 101.6 mm upright, in a
          rail no thumb reaches — and it was buried by the expanded instruction
          panel on 6 of 6 profiles, so the card telling a student to fasten the
          belt was standing on the button that fastens it. Here it is ~25 mm, it
          is the only red thing on the screen, and fastening it hands the same
          box straight back to the ⚙ dock. A control that exists exactly when it
          is needed and vanishes when it is not.

          ONE BOX, TWO JOBS — AND THE ORDER THAT MAKES IT SAFE IS THE PRODUCT'S
          OWN. While the belt is off this station does not open the dock, so the
          question is whether anything inside the dock is ever asked for first.
          It is not: `procedures/steps.ts` fixes the canonical sequence as seat →
          mirrors → surroundings → BELT → dashboard → lights → engine → brake →
          gear → handbrake, so every dock control (ДВИГ, ◄P/D►, РЪЧНА) comes
          after the belt. Nothing is reachable-only-if is dead-locked.

          Lowest = the dock, then the right mirror (nearest that thumb), the
          rear, and the left at the top. */}
      <ArcStation index={0} padH={DRIVE_PAD_H} side="right">
        {snap !== null && !snap.seatbeltOn ? (
          <GlyphButton
            labelBg="Закопчай предпазния колан"
            captionBg="Колан"
            tone="danger"
            active
            onClick={() => cabin()?.toggleSeatbelt()}
          >
            ⚠
          </GlyphButton>
        ) : (
          <GlyphButton
            labelBg="Контроли на автомобила"
            captionBg="Кола"
            active={sheetOpen}
            onClick={() => setSheetOpen((o) => !o)}
          >
            ⚙
          </GlyphButton>
        )}
      </ArcStation>
      <ArcStation index={1} padH={DRIVE_PAD_H} side="right">
        <GlyphButton
          labelBg="Поглед в дясното огледало"
          captionBg="Дясн"
          onClick={() => cabin()?.glance("right")}
        >
          Д
        </GlyphButton>
      </ArcStation>
      <ArcStation index={2} padH={DRIVE_PAD_H} side="right">
        <GlyphButton
          labelBg="Поглед в огледалото за задно виждане"
          captionBg="Задн"
          onClick={() => cabin()?.glance("rear")}
        >
          З
        </GlyphButton>
      </ArcStation>
      <ArcStation index={3} padH={DRIVE_PAD_H} side="right">
        <GlyphButton
          labelBg="Поглед в лявото огледало"
          captionBg="Ляво"
          onClick={() => cabin()?.glance("left")}
        >
          Л
        </GlyphButton>
      </ArcStation>

      {/* ══ DRIVELINE SHEET ══════════════════════════════════════════════════
          „the popups continue to eat almost the full screen and must be
          completely redesigned". The old one was a 256 px column up to 78 % of
          the height — 23 % of a landscape iPhone, straight down the middle of
          the road, on a screen the founder is measuring in percentages.

          This is a wrapping strip of 44 px transparent cells that starts at the
          left edge and floats above the drivetrain pad and both of its rows.
          One row on a landscape phone, two on a portrait one, and its whole ink
          is a dozen short words — about 2 % of the screen while it is open,
          against 23 %.

          ⚠ THE SENTENCE THAT USED TO BE HERE — „stops 176 px short of the right
          one (so it can never share a pixel with the right-hand rails)" — WAS
          NOT TRUE OF THIS CODE, and it is corrected rather than deleted because
          somebody will otherwise read the old claim and stop looking. The style
          below is `right: 0.125rem + inset`: the strip spans the WHOLE stage,
          and on a short landscape phone the notification column stands on its
          right end. Measured 2026-08-12, J-WAVE-3, WebKit, real insets, the
          Samsung gesture-bar 780 × 360 (34.6 % of the Bulgarian market),
          `/dev/drive-rig` l0-free-drive with the sheet open and ONE card in the
          column:

            sheet  [2, 56, 776 × 44]      column card [528, 42, 240 × 44]
            → `elementFromPoint` at their own centres answered the column for
              «Рестарт на колата» and «ЗАТВОРИ КОНТРОЛИТЕ» — the ✕ that closes
              this panel — and, on the manual tier, «M►» as well.

          THE OBVIOUS FIX DOES NOT WORK and the arithmetic is written down so it
          is not re-tried blind: giving this strip the rail's own right bound
          leaves 518 px, i.e. 11 cells a row, i.e. TWO rows of 90 px hanging
          from a floor at 260 — which puts the first row at y 10–54, straight
          through «Меню на урока» at [8, 8, 48 × 44]. Capping the COLUMN instead
          leaves it 48 px against a 78 px card, which is the starved column that
          printed «ЗАЩО» and no sentence on 2026-08-09. The corridor on that one
          profile cannot hold both, so it needs the arbitration the demo deck
          got (change corridor), not a patch — handed over, not smuggled in.

          Same controls, same CabinControls / DrivelineState calls, same single
          code path as the keys and the cockpit hotspots. */}
      {sheetOpen ? (
        <div
          role="toolbar"
          aria-label="Контроли на автомобила"
          className="pointer-events-auto absolute flex flex-wrap items-end justify-start gap-x-0.5 gap-y-0.5"
          style={{
            // Above the WHOLE band — both arcs and both pads — so it can never
            // share a pixel with a station on any device in the ladder. It is
            // the same TOUCH_CONTROLS_FLOOR everything else measures from, so
            // reshaping the arcs moves this with them instead of stranding a
            // hard-coded copy of today's geometry.
            left: `calc(0.125rem + ${INSET_L})`,
            right: `calc(0.125rem + ${INSET_R})`,
            bottom: TOUCH_CONTROLS_FLOOR,
          }}
        >
          <SheetCell
            textBg="ДВИГ"
            labelBg="Двигател"
            active={snap?.engineOn ?? false}
            onClick={() => cabin()?.driveline.toggleEngine()}
          />
          <SheetCell
            textBg="РЪЧНА"
            labelBg="Ръчна спирачка"
            tone="danger"
            active={snap?.parkingBrakeOn ?? false}
            onClick={() => cabin()?.toggleParkingBrake()}
          />
          <SheetCell
            textBg="КОЛАН"
            labelBg="Предпазен колан"
            tone="danger"
            active={snap?.seatbeltOn ?? false}
            onClick={() => cabin()?.toggleSeatbelt()}
          />
          <SheetCell
            textBg={
              snap?.headlights === "high"
                ? "ДЪЛГИ"
                : snap?.headlights === "low"
                  ? "КЪСИ"
                  : "СВЕТЛ"
            }
            labelBg={
              snap?.headlights === "high"
                ? "Светлини: дълги"
                : snap?.headlights === "low"
                  ? "Светлини: къси"
                  : "Светлини: изключени"
            }
            active={(snap?.headlights ?? "off") !== "off"}
            onClick={() => cabin()?.cycleHeadlights()}
          />
          <SheetCell
            textBg="АВАР"
            labelBg="Аварийни светлини"
            tone="warning"
            active={snap?.hazardsOn ?? false}
            onClick={() => cabin()?.driveline.toggleHazards()}
          />
          <SheetCell
            textBg="ЧИСТ"
            labelBg="Чистачки"
            active={snap?.wipersOn ?? false}
            onClick={() => cabin()?.driveline.toggleWipers()}
          />
          <SheetCell
            textBg="МЪГЛА"
            labelBg="Фарове за мъгла"
            active={snap?.fogLightsOn ?? false}
            onClick={() => cabin()?.driveline.toggleFogLights()}
          />
          {/* Selector stepper — the explicit lever, kept because a student
              must always be able to reach the real control and not only the
              assist. On an exam rung and on „Напреднал" it is the ONLY way to
              reverse (the pad's gesture does not exist there — see
              driveAxisLabelBg), which is what the pad's own label now points
              at instead of promising the gesture.

              THE UP CELL IS NOT ALWAYS „towards D" (2026-08-11). The gate is
              P—R—N—D on an automatic and P—R—N—M1…M5 on „Напреднал"
              (vehicle/driveline.ts), so on the manual tier there is no D to
              step towards and `gearUp()` picks the next GEAR — and needs the
              clutch to do it. The old label said „стъпка към D" in both, which
              is the same class of defect as the pad's reverse promise: a
              sentence that was true when it was written and false in a mode
              added later. */}
          {/* ══ «СЪЕД» ═ THE CLUTCH, AND IT IS WHY „НАПРЕДНАЛ" WAS UNPLAYABLE ══
              Doc 91 §M2/§I24. The clutch had NO touch control anywhere: the
              manual gate is P—R—N—M1…M5 and vehicle/driveline.ts requires the
              clutch to go INTO a gear, so on a phone every gear change and
              every N→R on that tier silently refused. The register's answer to
              a missing capability was „gate the tier off on touch", and
              removing a tier removes functionality — so it gets the control
              instead, next to the lever it is used with.
              The horn's exact hold idiom (`RailHoldButton`'s sibling below),
              which is multi-touch-safe by construction: it is a pointer HOLD,
              so it works with a second thumb planted on a pad, and every
              release path — up, cancel, lost capture, unmount — lifts it. A
              clutch latched down by a lost event would freewheel the car. */}
          {/* ══ «НОРМ» ═ THE TIER, AND IT STANDS IMMEDIATELY BEFORE THE LEVER ══
              Doc 91 §I, J-WAVE-3. It is here and not in the sky because the
              three-word pill does not fit the phone's top strip — the
              arithmetic is on `difficulty` in TouchControlsProps — and it is
              here rather than at the end of the strip because it is what
              DECIDES the three cells after it: on „Напреднал" the box is
              manual, «СЪЕД» appears, and «M►» starts asking for it. Placed
              BEFORE the conditional clutch cell so the tier's own cell is the
              one thing in this group that never moves when the tier changes. */}
          {difficulty !== undefined && onSelectDifficulty ? (
            <SheetCell
              textBg={tierCellTextBg(difficulty)}
              labelBg={tierCellLabelBg(difficulty)}
              onClick={() => onSelectDifficulty(nextTier(difficulty))}
            />
          ) : null}
          {transmission === "manual" ? (
            <SheetHoldCell
              textBg="СЪЕД"
              labelBg="Съединител — задръж, докато сменяш предавка"
              onHold={(on) => cabin()?.driveline.setClutch(on)}
            />
          ) : null}
          <SheetCell
            textBg="◄P"
            labelBg="Скоростен лост — стъпка към P"
            onClick={() => cabin()?.driveline.gearDown()}
          />
          <SheetCell textBg={gearLabel} labelBg={`Скоростен лост: ${gearLabel}`} readOnly />
          <SheetCell
            textBg={transmission === "manual" ? "M►" : "D►"}
            labelBg={
              transmission === "manual"
                ? "Скоростен лост — към по-висока предавка (иска съединител)"
                : "Скоростен лост — стъпка към D"
            }
            onClick={() => cabin()?.driveline.gearUp()}
          />
          {/* «ИЗГЛ» IS NO LONGER HERE — it is the rail's «Изглед» button now
              (doc 91 §I23). Fullscreen stays: it is a setting, it is keyed (X),
              and unlike the camera it is not something a lesson ever asks a
              student to do. */}
          {onToggleFullscreen ? (
            <SheetCell
              textBg="ЦЯЛ"
              labelBg="Цял екран"
              onClick={onToggleFullscreen}
            />
          ) : null}
          <SheetCell
            textBg="РЕСТ"
            labelBg="Рестарт на колата"
            onClick={onReset}
          />
          <SheetCell
            textBg="✕"
            labelBg="Затвори контролите"
            onClick={() => setSheetOpen(false)}
          />
        </div>
      ) : null}
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
//
// EVERY ONE OF THESE IS A 44 × 44 TRANSPARENT HIT AREA WITH A SMALL GLYPH IN
// IT. No background, no border, no shadow, no backdrop-filter — so the button
// costs the screen exactly its glyph and nothing else, while a thumb still has
// the full 44 px target the WCAG/HIG floor asks for. The `text-shadow` is what
// keeps a 15 px glyph legible over bright tarmac; it is drawn on the glyph, not
// on a box, so it buys contrast without buying pixels.
// ---------------------------------------------------------------------------

/**
 * One station on one of the founder's arcs — an absolutely positioned 44 px
 * cell holding exactly one control.
 *
 * A component and not a style helper so the geometry is stated once: every
 * station on both arcs resolves its own `bottom` and its own side inset from
 * `arcStation()`, so moving the curve is editing four constants, not eight
 * call sites.
 */
function ArcStation({
  index,
  padH,
  side,
  children,
}: {
  index: number;
  padH: string;
  side: "left" | "right";
  children: ReactNode;
}) {
  const { bottom, inset } = arcStation(index, padH, side);
  // Spread rather than a computed key: `{ [side]: … }` widens the object to a
  // string index signature, which CSSProperties does not accept.
  const from =
    side === "left"
      ? { left: `calc(${inset} + ${INSET_L})` }
      : { right: `calc(${inset} + ${INSET_R})` };
  return (
    <div className="absolute flex items-center" style={{ bottom, height: ROW_H, ...from }}>
      {children}
    </div>
  );
}

const GLYPH_SHADOW = "0 1px 3px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.6)";

function glyphStyle(active: boolean, tone?: "danger" | "warning"): CSSProperties {
  return {
    color: active
      ? tone === "danger"
        ? "var(--danger)"
        : tone === "warning"
          ? "var(--warning)"
          : "var(--accent)"
      : "var(--foreground)",
    opacity: active ? 1 : 0.82,
    textShadow: GLYPH_SHADOW,
  };
}

/**
 * `active` IS OPTIONAL, AND THE OMISSION IS THE POINT (2026-08-11).
 *
 * It used to default to `false` and be spelled straight into `aria-pressed`,
 * so every button on both arcs announced itself as a TOGGLE THAT IS CURRENTLY
 * OFF. Four of the eight are not toggles at all — «Пауза» and the three
 * mirror glances are one-shot actions — and a glance button in particular said
 * „not pressed" for the whole second the glance was being HELD and graded. It
 * is the same defect as the drivetrain pad's label, one attribute over: a
 * state claim that was never true and that a screen-reader user has no way to
 * check.
 *
 * So a caller that has no pressed-state passes none, React omits the attribute
 * and the button is announced as the plain button it is. Nothing moves and
 * nothing changes colour: the tint still reads `active ?? false`, and the
 * ghost sweep that keys on `[aria-pressed="true"]` (PlayAreaStyles) does not
 * reach inside `[data-hud="touch-controls"]` — these controls paint nothing to
 * strip.
 */
function GlyphButton({
  labelBg,
  captionBg,
  active,
  tone,
  onClick,
  children,
}: {
  labelBg: string;
  /**
   * A WORD UNDER THE GLYPH, AND IT IS THE PEDAGOGY LINE — doc 91 §F, §I13.
   *
   * The reference hides its controls behind 20 %-opacity labels because a
   * racing player only needs throttle and steering and already knows which is
   * which. WE GRADE PROCEDURE. Measured on the founder's phone, every graded
   * control on this screen was an invisible box with a 15 px glyph in it —
   * about 2.5 mm of ink inside a 7.3 mm target — and a 17-year-old has no way
   * to know that «З» is the rear-view mirror or that «⇦» is the left indicator.
   * A student who cannot find the indicator does not signal, the rule engine
   * marks them down for it, and the product has broken its own north star with
   * its own UI.
   *
   * The word costs about 90 px² of ink and buys the control a name. It is
   * INSIDE the button, so it is the control's own label and not a line of type
   * lying across somebody else's target — which is the distinction the sweep
   * measures and the one the founder photographed.
   */
  captionBg?: string;
  /** Omit on one-shot actions; pass a boolean only on real toggles. */
  active?: boolean;
  /**
   * THE ONE PLACE `danger` IS ALLOWED ON THIS SCREEN, and the scarcity is the
   * discovery mechanism: the belt is the only red thing a student ever sees
   * while driving, so „the reddest thing on the screen" IS the instruction.
   * Same token the rail's «Колан» carried before it moved onto the arc.
   */
  tone?: "danger" | "warning";
  onClick: () => void;
  children: ReactNode;
}) {
  // Doc 91 · C2. `onClick` alone is dead while a thumb is on a pad — a touch
  // `click` is a compatibility mouse event and only the PRIMARY touch point
  // gets one. `useTapActivation` adds the pointer path the horn beside it has
  // always had, and keeps `onClick` for mouse, keyboard and screen readers.
  const tap = useTapActivation(onClick);
  return (
    <button
      type="button"
      aria-label={labelBg}
      title={labelBg}
      aria-pressed={active}
      {...tap}
      // `touch-none`, not `touch-manipulation`, and it is the horn's class
      // verbatim. A pointer sequence the browser decides was a scroll ends in
      // `pointercancel` and fires nothing — and doc 91 · L11 found this
      // document IS taller than the screen, so a press with any drift on it
      // was a candidate for exactly that. Nothing here can be panned or
      // pinched: it is a 44 px transparent target in a corner of a road.
      className="pointer-events-auto flex h-11 w-11 touch-none select-none flex-col items-center justify-center gap-px text-[15px] font-black leading-none"
      style={glyphStyle(active ?? false, tone)}
    >
      <span aria-hidden>{children}</span>
      {captionBg ? (
        <span
          aria-hidden
          className="text-[8px] font-bold uppercase leading-none tracking-tight"
        >
          {captionBg}
        </span>
      ) : null}
    </button>
  );
}

/**
 * THE HORN'S STATION — a `GlyphButton` whose action is a HOLD.
 *
 * It is `RailHoldButton` moved onto the glass in the ghost register the rest of
 * the arc uses, and it shares `useHoldButton` with the sheet's clutch so every
 * release path — up, cancel, lost capture, unmount — is the one that has always
 * been wired. A horn latched down by a lost pointer event is a car sounding
 * through a quiz.
 */
function GlyphHoldButton({
  labelBg,
  captionBg,
  onHold,
  children,
}: {
  labelBg: string;
  captionBg?: string;
  onHold: (on: boolean) => void;
  children: ReactNode;
}) {
  const { held, handlers } = useHoldButton(onHold);
  return (
    <button
      type="button"
      aria-label={labelBg}
      title={labelBg}
      {...handlers}
      className="pointer-events-auto flex h-11 w-11 touch-none select-none flex-col items-center justify-center gap-px text-[15px] font-black leading-none"
      style={glyphStyle(held)}
    >
      <span aria-hidden>{children}</span>
      {captionBg ? (
        <span
          aria-hidden
          className="text-[8px] font-bold uppercase leading-none tracking-tight"
        >
          {captionBg}
        </span>
      ) : null}
    </button>
  );
}

/**
 * THE HOLD IDIOM, ONCE — the horn's, which has always been the multi-touch-safe
 * one in this file (`onPointerDown`/`Up`/`Cancel`/`LostPointerCapture`, never
 * `onClick`), now shared by the arc's horn and the sheet's clutch.
 *
 * Every release path is wired, including unmount: a quiz pause mid-honk must
 * not latch the horn, and a clutch left down would leave the car freewheeling
 * (`hasDriveTraction` — vehicle/driveline.ts).
 */
function useHoldButton(onHold: (on: boolean) => void): {
  held: boolean;
  handlers: {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onLostPointerCapture: () => void;
    onContextMenu: (e: { preventDefault: () => void }) => void;
  };
} {
  const downRef = useRef(false);
  const holdRef = useRef(onHold);
  holdRef.current = onHold;
  const [held, setHeld] = useState(false);
  const end = useCallback(() => {
    if (!downRef.current) return;
    downRef.current = false;
    setHeld(false);
    holdRef.current(false);
  }, []);
  useEffect(() => end, [end]);
  return {
    held,
    handlers: {
      onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
        capturePointer(e.currentTarget, e.pointerId);
        downRef.current = true;
        setHeld(true);
        holdRef.current(true);
      },
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    },
  };
}

/* ── THE TOP RAIL'S OWN BUTTONS ──────────────────────────────────────────────
   The ONE register on this screen that is allowed to be opaque, and the only
   one: his reference frame has exactly two solid word-buttons, in exactly this
   corner, and everything else on the glass is ghosted. They are the shell's
   «Меню» classes verbatim rather than a second look — one top-left corner, one
   grammar, and if the ghost sweep in PlayAreaStyles ever changes, all of them
   change together.
   44 px in both axes, `min-w-11` and never a fixed width, so a Cyrillic word
   sets its own box and nothing is clipped. */
const RAIL_CLASS =
  "hud-ghost pointer-events-auto flex h-11 min-w-11 shrink-0 touch-none select-none items-center justify-center rounded-full border px-2 text-[10px] font-black uppercase tracking-[0.1em]";

function railTone(active: boolean, tone?: "danger"): string {
  if (tone === "danger") return "border-danger text-danger";
  return active ? "border-accent text-foreground" : "border-border text-foreground";
}

function RailButton({
  wordBg,
  labelBg,
  active,
  tone,
  onClick,
}: {
  wordBg: string;
  labelBg: string;
  active?: boolean;
  tone?: "danger";
  onClick: () => void;
}) {
  // Doc 91 · C2, same as every other button in this file: `onClick` alone is
  // dead while a thumb is on a pad.
  const tap = useTapActivation(onClick);
  return (
    <button
      type="button"
      aria-label={labelBg}
      title={labelBg}
      aria-pressed={active}
      {...tap}
      className={`${RAIL_CLASS} ${railTone(active ?? false, tone)}`}
    >
      <span aria-hidden>{wordBg}</span>
    </button>
  );
}

/* `RailHoldButton` STOOD HERE. The horn was its only caller and the horn is on
   the glass now (`GlyphHoldButton`). Deleted rather than left as an unused twin:
   two hold idioms in one file is how the two drift, and this one's whole value
   was that there is exactly one. */

/** What each published camera mode is called, for the rail button's name. */
const CAMERA_NAME_BG: Record<string, string> = {
  cockpit: "кабина",
  chase: "отвън",
  topdown: "отгоре",
};

/**
 * …AND THE SAME LIST AS DATA, so the ladder can be swept without a browser.
 *
 * Same device as `arcStationRectPx` and `driveAxisLabelBg` two hundred lines
 * up, for the same reason: the rule that decides what a student can reach is
 * worth more as a value a test can read than as a condition buried in JSX.
 *
 * @param topdownAllowed false on exam rungs — where the C cycle skips top-down
 *        and the keyboard legend does not advertise G or N either.
 */
export function viewMenuViewsBg(
  topdownAllowed: boolean,
): Array<{ id: CameraMode; wordBg: string }> {
  const views: Array<{ id: CameraMode; wordBg: string }> = [
    { id: "cockpit", wordBg: "Кабина" },
    { id: "chase", wordBg: "Отвън" },
  ];
  if (topdownAllowed) views.push({ id: "topdown", wordBg: "Отгоре" });
  return views;
}

/**
 * Do the two top-down aids (G's zoom, N's orientation) belong on screen?
 *
 * ONLY while the top-down view is actually live. They are inert in the other
 * two — the keys are inert there too — so showing them would be the third of
 * the founder's complaints in one control: a button that does nothing and
 * says nothing about why. `topdownAllowed` is checked as well, so an exam rung
 * that can never enter top-down cannot be shown its controls by a stale mode
 * string either.
 */
export function viewMenuShowsTopdownAids(
  mode: string | null,
  topdownAllowed: boolean,
): boolean {
  return topdownAllowed && mode === "topdown";
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «ИЗГЛЕД» — THE CAMERA, AND THE ONLY DOOR G AND N HAVE EVER HAD ON A PHONE.
 * Doc 91 §E rows 21–23, §H, §I23. J-WAVE-2.
 *
 * THE DESKTOP INVENTORY THIS HAS TO ANSWER, read off `ControlsHelp` (which IS
 * the desktop contract) and `CameraRig`:
 *
 *   C  cycle кабина → отвън → отгоре        ⚙ sheet «ИЗГЛ», two taps  → HERE
 *   G  top-down zoom 20 / 40 / 80 m         NOTHING, ever              → HERE
 *   N  top-down north-up / heading-up       NOTHING, ever              → HERE
 *   K  automatic look-back while reversing  NOTHING, ever              → not here, see below
 *   Q E F  the three GRADED mirror glances  the flank rails            → STAY THERE
 *   P  minimap                              the lesson menu            → stays there
 *
 * WHAT IS A BUTTON AND WHAT IS NOT, DECIDED BY HOW OFTEN A LEARNER NEEDS IT
 * WHILE THE CAR IS MOVING — which is the only question that matters here:
 *
 *   · THE THREE MIRROR GLANCES ARE NOT IN THIS POPOVER, and that is the most
 *     important line in this block. They are 10–30 presses a lesson, they are
 *     SCORED A2 procedure steps, and a scored action two taps behind a menu is
 *     an action the product is refusing while pretending to offer it. They
 *     stay where a thumb already rests, in the open, with a word on them.
 *   · THE VIEW ITSELF is 0–3 presses a lesson and never urgent, so it is one
 *     tap to a list rather than a blind cycle: cycling costs up to two camera
 *     transitions to reach the view you wanted, mid-drive, and a student who
 *     wants the cockpit back has to guess how many taps that is.
 *   · ЗУМ AND СЕВЕР/ПОСОКА appear ONLY while «отгоре» is live. They are
 *     meaningless in the other two views — the keys are inert there too — so
 *     progressive disclosure costs nothing the rest of the time and the
 *     popover is three cells, not five, for the whole of a normal drive.
 *   · K (automatic look-back on reverse) IS DELIBERATELY NOT HERE. It is a
 *     persisted PREFERENCE changed about once ever, not a mid-drive control,
 *     and putting a sticky setting in the same list as three momentary view
 *     choices teaches that they are the same kind of thing. It belongs in the
 *     lesson menu with the other settings — named here so the next reader
 *     knows it was decided rather than forgotten.
 *
 * NO GESTURE. A swipe or a two-finger drag on the road would be a fourth
 * meaning for a surface that already carries steering, throttle and the
 * cockpit hotspots, it is undiscoverable (the founder's own „I do not know
 * what is a button"), and it cannot be labelled — which is precisely the thing
 * §F says the reference gets away with and we cannot.
 * ═══════════════════════════════════════════════════════════════════════════
 */
function ViewRailControl({
  mode,
  topdownAllowed,
  onSelectMode,
  onToggleCamera,
  topdownAidRef,
}: {
  mode: string | null;
  topdownAllowed: boolean;
  /** Absent on a legacy mount — the button then falls back to the C cycle. */
  onSelectMode?: (mode: CameraMode) => void;
  onToggleCamera: () => void;
  topdownAidRef?: RefObject<TopdownAidHandle | null>;
}) {
  const [open, setOpen] = useState(false);
  // The two top-down aids' CURRENT values, kept as a display copy that is only
  // ever written from the return of the tap that changed it (or seeded when the
  // popover opens). CameraRig owns the real state — it is read once a frame and
  // must not become React state — and this is how a label can be drawn from it
  // without reading a mutable ref while rendering.
  const [zoomM, setZoomM] = useState<number | null>(null);
  const [headingUp, setHeadingUp] = useState(false);
  const openPopover = () => {
    const aid = topdownAidRef?.current;
    setZoomM(aid ? aid.readZoomM() : null);
    setHeadingUp(aid ? aid.readHeadingUp() : false);
    setOpen((o) => !o);
  };
  const nameBg = CAMERA_NAME_BG[mode ?? ""] ?? null;
  const canPick = typeof onSelectMode === "function";
  const choose = (next: CameraMode) => {
    onSelectMode?.(next);
    setOpen(false);
  };
  const views = viewMenuViewsBg(topdownAllowed);
  const showsAids = viewMenuShowsTopdownAids(mode, topdownAllowed);
  return (
    <div className="pointer-events-none relative flex shrink-0">
      <RailButton
        wordBg="Изглед"
        labelBg={`Изглед (камера)${nameBg ? ` — сега: ${nameBg}` : ""}`}
        active={open}
        // Without a `onSelectMode` prop there is no list to show, so the button
        // stays exactly what it was: the C cycle, one tap.
        onClick={canPick ? openPopover : onToggleCamera}
      />
      {open && canPick ? (
        <div
          data-hud="view-menu"
          role="menu"
          aria-label="Изглед"
          // Anchored to the BUTTON, not to the stage: the rail wraps to two and
          // three rows on a portrait phone (see TOP_RAIL_LEFT_CSS), so a
          // stage-anchored popover would drift away from the control that
          // opened it. `top-full` also keeps it out of the notification column,
          // which the rail itself may never reach.
          className="pointer-events-auto absolute left-0 top-full z-20 mt-1 flex w-max max-w-[70vw] flex-wrap gap-1"
        >
          {views.map((v) => (
            <RailButton
              key={v.id}
              wordBg={v.wordBg}
              labelBg={`Изглед: ${v.wordBg.toLowerCase()}`}
              active={mode === v.id}
              onClick={() => choose(v.id)}
            />
          ))}
          {/* THE TWO TOP-DOWN AIDS, only where they mean something. */}
          {showsAids && topdownAidRef ? (
            <>
              <RailButton
                wordBg={zoomM === null ? "Зум" : `${zoomM} м`}
                labelBg={`Мащаб отгоре${zoomM === null ? "" : `: ${zoomM} метра`} — натисни за следващия`}
                onClick={() => {
                  const aid = topdownAidRef.current;
                  if (aid) setZoomM(aid.cycleZoom());
                }}
              />
              <RailButton
                wordBg={headingUp ? "Посока" : "Север"}
                labelBg={
                  headingUp
                    ? "Отгоре: посоката на колата е нагоре — натисни за север нагоре"
                    : "Отгоре: север е нагоре — натисни за посоката на колата"
                }
                onClick={() => {
                  const aid = topdownAidRef.current;
                  if (aid) setHeadingUp(aid.toggleOrientation());
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Driveline-sheet cell: the same 44 × 44 transparent target, lit when the
 * control is engaged.
 *
 * A WORD, NOT A PICTOGRAM. These are the controls a learner is least likely to
 * recognise — „ЧИСТ" is unambiguous where a wiper glyph at 11 px is a smudge,
 * and this product's whole reason to exist is that the student understands what
 * they just did. A five-letter 10 px word costs about 370 px² — less than the
 * emoji it replaces, and it teaches. `readOnly` is the selector letter: a
 * readout sitting in the row, not a button.
 */
function SheetCell({
  labelBg,
  textBg,
  active,
  tone,
  onClick,
  readOnly = false,
}: {
  labelBg: string;
  textBg: string;
  /** Same rule as GlyphButton: omit on the action cells (◄P, D►, ИЗГЛ, ЦЯЛ,
   *  РЕСТ, ✕), which are not toggles and used to announce „pressed: false". */
  active?: boolean;
  tone?: "danger" | "warning";
  onClick?: () => void;
  readOnly?: boolean;
}) {
  // Same reason as GlyphButton, and it is why «Предпазен колан» could not be
  // fastened on a phone: every cell of this sheet was `onClick`-only.
  const tap = useTapActivation(onClick);
  if (readOnly) {
    return (
      <span
        aria-label={labelBg}
        title={labelBg}
        className="flex h-11 w-11 items-center justify-center text-[15px] font-black leading-none"
        style={glyphStyle(true)}
      >
        {textBg}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={labelBg}
      title={labelBg}
      aria-pressed={active}
      {...tap}
      // Same as GlyphButton. The sheet is a `flex-wrap` strip with no scroller
      // in it, so there is no gesture here for `touch-none` to take away.
      className="pointer-events-auto flex h-11 w-11 touch-none select-none items-center justify-center text-[10px] font-black uppercase leading-none tracking-tight"
      style={glyphStyle(active ?? false, tone)}
    >
      {textBg}
    </button>
  );
}

/** A sheet cell that is HELD rather than tapped — today only the clutch. */
function SheetHoldCell({
  labelBg,
  textBg,
  onHold,
}: {
  labelBg: string;
  textBg: string;
  onHold: (on: boolean) => void;
}) {
  const { held, handlers } = useHoldButton(onHold);
  return (
    <button
      type="button"
      aria-label={labelBg}
      title={labelBg}
      {...handlers}
      className="pointer-events-auto flex h-11 w-11 touch-none select-none items-center justify-center text-[10px] font-black uppercase leading-none tracking-tight"
      style={glyphStyle(held, "warning")}
    >
      {textBg}
    </button>
  );
}
