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
 *    still true. (This line used to end „TOUCH_STEER_MODE_STORAGE_KEY keeps the
 *    A/B seam open"; it did not — nothing ever read that key. See the block
 *    where the seam stood.)
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
// THE STEER-MODE A/B SEAM STOOD HERE AND IT WAS NOT A SEAM — removed 2026-08-26.
//
// `TouchSteerMode`, `TOUCH_STEER_MODE_STORAGE_KEY` and `readTouchSteerMode()`
// shipped as „the flag exists so an A/B test can flip cohorts without a schema
// change". Counted: ZERO readers. Not one line of this component, of any other
// component, of any module, or of any TEST ever called the reader or named the
// key — so writing `"tilt"` into `sim.touchSteerMode` on a real device flips
// nothing and never could, because the tilt branch does not exist either.
//
// A flag nothing reads is not an open seam, it is a claim that a decision has
// been prepared for. The three reasons tilt was rejected are in the header and
// they stand on their own; when a tilt source actually lands, the setting comes
// back with the branch that consumes it, in the same commit.
// ---------------------------------------------------------------------------

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
 *
 * ── AND AN ADOPTION MUST CAPTURE, EXACTLY AS A PRESS DOES — 2026-08-18 ───────
 *
 * This is a SECOND DOOR into the same gesture, and until now only the first one
 * (`onPointerDown`) called `capturePointer`. That asymmetry is not cosmetic,
 * because of what was wired to the pads the day before: `onLostPointerCapture`
 * — „the fourth release edge", the block at `onDriveEnd` — CAN ONLY FIRE FOR A
 * POINTER THAT HAS CAPTURE. An adopted pointer had none, so for a gesture that
 * came through this door the pads were back to the two edges they had before
 * that fix, in a file whose own tests assert that they have four.
 *
 * WHAT THAT COSTS, in this component's own vocabulary. The sentence above —
 * „touch pointers get implicit capture at `pointerdown`" — is the reason it has
 * never bitten a thumb: a finger that reaches this branch got its implicit
 * capture on THIS pad, so its `pointerup` lands here whatever happens next. It
 * is not true of a mouse. A mouse has no implicit capture, and `buttons !== 0`
 * admits one: press outside the pad, drag across it (adopted, uncaptured),
 * release outside it. The `pointerup` goes to the element under the cursor, the
 * pad is never told, and `PadPointer` goes on owning a button that is no longer
 * down — with its axis still ACTIVE. `TouchInputSource.mergeInto` is a priority
 * REPLACE and not a max, so from that moment the overlay overwrites that axis
 * on every `SimInput.read()`: a stale brake is a car that will not pull away, a
 * stale throttle is a car that accelerates under a held brake key, and neither
 * heals — `reconcileHeldAxes` only ever frees a pad that owns NOBODY.
 *
 * A mouse on a touch-capable device is a 2-in-1 or a tablet with a trackpad,
 * i.e. exactly the machine `keyboardTakeoverAllowed()` answers `true` for; the
 * takeover used to sweep this away as a side effect, and since 2026-08-17 it
 * only does so if the student also presses a driving key. One call closes it
 * for good, and it is the same call the other door already makes.
 */
function adoptable(
  pad: PadPointer,
  e: ReactPointerEvent<HTMLDivElement>,
  live: boolean,
): boolean {
  if (!live || e.buttons === 0 || pad.pointerId !== null) return false;
  return pad.claim(e.pointerId);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE INVARIANT THE FOUR RELEASE EDGES ARE ONLY AN IMPLEMENTATION OF:
 * AN AXIS IS HELD ONLY WHILE ITS PAD OWNS A FINGER.
 *
 * Every writer of the touch axes in this component sits behind pad ownership
 * — `steerApply`/`driveApply` run only for the owning pointer or an
 * `adoptable()` one, `onSteerEnd`/`onDriveEnd` only for the owner. So the
 * invariant holds BY CONSTRUCTION, and it holds only as long as every browser
 * edge that ends a gesture is wired to one of those two enders. That is four
 * edges (up, cancel, lost capture, hide) maintained by hand at two call sites,
 * and this file's own history is what happens when a hand-maintained release
 * covers two of the four: doc 91 §C1, „the two halves of «let go of
 * everything» were written in two different vocabularies".
 *
 * So the invariant is also CHECKED, on a low-Hz clock of its own, and the
 * check is deliberately one-directional. It can only ever RELEASE a touch
 * axis — which hands that axis back to the keyboard and the gamepad — and it
 * cannot do that to an axis a finger is actually holding, because a held axis
 * is a pad with a `pointerId`. It cannot fabricate an input; it can only stop
 * this overlay from vetoing one. That asymmetry is the whole reason a
 * watchdog is admissible here at all.
 *
 * Pure and DOM-free so the sequence that strands an axis is three lines of a
 * unit test rather than a phone, a thumb and a browser bug.
 */
export function reconcileHeldAxes(
  touch: Pick<TouchInputSource, "releaseSteer" | "releaseThrottle" | "releaseBrake">,
  steerPad: Pick<PadPointer, "pointerId">,
  drivePad: Pick<PadPointer, "pointerId">,
): void {
  if (steerPad.pointerId === null) touch.releaseSteer();
  if (drivePad.pointerId === null) {
    touch.releaseThrottle();
    touch.releaseBrake();
  }
}

/** How often the invariant above is re-checked (ms). It is the cabin poll's
 *  cadence because that is already the slowest thing on this screen and four
 *  method calls on a free pad cost nothing — but it is its OWN constant and
 *  its own effect, because this number is a stuck-pedal window and not a UI
 *  refresh rate, and a future „the cabin poll got cheaper at 1 Hz" must not
 *  silently make it four times longer. */
export const AXIS_RECONCILE_MS = 250;

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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * …AND THE DEVICE TEST THE TAKEOVER NEVER HAD — 2026-08-17, PART A/C/D.
 *
 * The set above is an INFERENCE: „a drive key arrived, therefore this student
 * has a keyboard, therefore the glass controls are clutter." On a laptop that
 * is right. On a phone it is unfalsifiable and its failure is total, because
 * `visible` gates the ENTIRE overlay — both indicators, all three mirror
 * glances, the horn, the belt and the ⚙ dock — and the only route back is a
 * `pointerdown` whose `pointerType` is exactly "touch". A keyboard-driven
 * session never produces one, and neither does switch control, a stylus, or a
 * screen reader's activation.
 *
 * MEASURED ON THE DEPLOYED BUILD, WebKit, iPhone 16 landscape with real insets,
 * sc-ac-night-lights@L1, 2026-08-17 — one `KeyW` and nothing else:
 *
 *   before   7 stations · left ⇦Ляв ⇨Дясн ⊙Клакс · right ⚠Колан ДДясн ЗЗадн ЛЛяво
 *   after    0 stations
 *
 * Three catalogue rows are that one line: sc-rb-exit-signal grades «Излез на
 * третия изход с включен десен мигач» while the indicator is off the screen,
 * sc-sig-controller-live loses signalling AND all three glances for 128 s, and
 * sc-ln-turn-lane-arrows grades a lane change whose own briefing says
 * „огледало, мигач, после маневра". All three are GRADED acts performed with a
 * control the student cannot see.
 *
 * SO THE INFERENCE GETS THE PREMISE IT WAS ALWAYS MISSING: a keyboard is only
 * plausible where a desktop-class pointer is. `(any-pointer: fine)` is true of
 * every mouse, trackpad and stylus the browser can see — a laptop, a 2-in-1, an
 * iPad with a Magic Keyboard — and false of a phone. It is also the vocabulary
 * this codebase already uses for this exact question: `hasTouchScreen()`
 * (modules/sim/engine/capabilities.ts) decides whether this overlay is mounted
 * at all by asking `(any-pointer: coarse)`, so the mount gate and the takeover
 * gate now read the SAME property off the same device instead of one of them
 * guessing from a keystroke.
 *
 * WHICH ALSO BOUNDS THE CHANGE: a desktop with no touchscreen never mounts this
 * component, so the takeover only ever ran on touch-capable machines. After
 * this, a 2-in-1 or a keyboard-attached tablet still loses the overlay on WASD
 * — the case the feature was written for — and only the coarse-pointer-only
 * device keeps its controls. Measured on the same run:
 *
 *   any-pointer: fine   false      pointer: fine     false
 *   any-pointer: coarse true       pointer: coarse   true
 *   any-hover:   hover  false      navigator.maxTouchPoints  0
 *
 * `maxTouchPoints` is in that list because it was the obvious discriminator and
 * the measurement REFUTED it: this WebKit profile reports 0 with touch
 * emulation on, so a `maxTouchPoints > 0` guard would have shipped green and
 * changed nothing on his phone.
 *
 * IT IS READ PER KEYSTROKE, not once at mount: a Bluetooth mouse paired
 * mid-lesson must start hiding the overlay, and one media-query match on a
 * keydown is free.
 *
 * AND THE ABSENT-API DEFAULT IS „KEEP THE CONTROLS". Without `matchMedia` we
 * cannot tell the two devices apart, and the two mistakes are not symmetric:
 * an unwanted overlay on a laptop is clutter over a screen that still has a
 * keyboard, while a stripped overlay on a phone is a lesson with no inputs at
 * all. The cheap failure is the one we take.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function keyboardTakeoverAllowed(
  matchMediaFn: ((query: string) => { matches: boolean }) | undefined = typeof window ===
  "undefined"
    ? undefined
    : window.matchMedia?.bind(window),
): boolean {
  try {
    return matchMediaFn?.("(any-pointer: fine)").matches ?? false;
  } catch {
    // A browser that throws on an unknown feature query is a browser that
    // cannot answer the question — same default, same reason.
    return false;
  }
}

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
 *   LEFT  (steering thumb)  ⇦ ЛЯВ, ⇨ ДЯСЕН — BOTH indicators; the horn; and,
 *                           since 2026-08-17, the ⚙ dock at the top station.
 *   RIGHT (throttle thumb)  Д ДЯСНО, З ЗАДНО, Л ЛЯВО — all three mirrors, over
 *                           the belt's own station.
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
 *
 * ── AND THE FOURTH LEFT STATION — 2026-08-17, PART C ────────────────────────
 *
 * THE ⚙ DOCK IS NOT A CONTROL THAT SHARES A BOX ANY MORE. It used to be the
 * second face of right station 0 — «the belt while the belt is off» — and the
 * argument for that (written out at the station itself) was about ORDER: every
 * control inside the dock comes after the belt in `procedures/steps.ts`, so
 * nothing is reachable-only-if. The order argument is still true. It was
 * answering the wrong question.
 *
 * MEASURED ON THE DEPLOYED BUILD, WebKit, iPhone 16 landscape with real insets,
 * sc-ac-night-lights@L1, belt off (`wave12-flanks.mjs`, 2026-08-17):
 *
 *   right flank bottom→top   ⚠Колан  ДДясн  ЗЗадн  ЛЛяво
 *   ⚙ dock                   NOT ON THE SCREEN
 *
 * and the dock is the ONLY door to «СВЕТЛ/КЪСИ/ДЪЛГИ», «МЪГЛА», «ЧИСТ»,
 * «ДВИГ», «РЪЧНА» and the gear lever. So on a phone, for as long as the belt
 * is off, this car has no lights, no wipers, no fog lamps, no engine switch and
 * no gearbox — and four lessons open by telling the student to use them:
 *
 *   sc-ac-night-lights  «Включи късите светлини още със запалването…»
 *   sc-ac-rain-lights   «Включи късите светлини — вали… „чистачки → светлини"»
 *   sc-ac-highbeam-lead «Мини на дълги чак когато няма… кола»
 *   sc-ac-fog           «Включи късите светлини и фаровете за мъгла…»
 *
 * The catalogue sweep opened 24 mobile frames across those four and the sheet
 * appeared in NONE of them. A control that exists only after an unrelated
 * control has been used is, for the student reading instruction 1, a control
 * that does not exist.
 *
 * WHY THE DOCK MOVED AND NOT THE BELT. The belt's station is load-bearing
 * OUTSIDE this file: `PlayAreaStyles.tsx` pins its fill, hairline and pulse to
 * `[data-arc="0"][data-arc-side="right"] button[aria-label="Закопчай…"]` —
 * yesterday's answer to „«КОЛАН» is the least visible thing on screen". Moving
 * the belt would have deleted that silently from a file this change does not
 * own. So the belt keeps its box, its selector and its rect, and the dock takes
 * a station of its own.
 *
 * WHY THE LEFT FLANK, AND WHY THE TOP OF IT. The band arithmetic is sized by
 * the BUSIER flank (`ARC_STATIONS` is a max), so a fourth left station changes
 * no clearance anywhere: the left band hangs off `STEER_PAD_H` (136) and the
 * right off `DRIVE_PAD_H` (152), so four left stations top out 16 px BELOW the
 * four right ones that every sweep already clears. And the top station is where
 * this file already puts the least time-critical control — the horn's own
 * reason for being there. You set the lights before you move; you do not reach
 * for the gearbox in an emergency.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const ARC_STATIONS_LEFT = 4;
export const ARC_STATIONS_RIGHT = 4;

/** How many stations one flank carries. */
export function arcStationCount(side: "left" | "right"): number {
  return side === "left" ? ARC_STATIONS_LEFT : ARC_STATIONS_RIGHT;
}

/*
 * `ARC_STATIONS = Math.max(ARC_STATIONS_LEFT, ARC_STATIONS_RIGHT)` used to sit
 * here, described as „the busier flank — what the band arithmetic and the
 * sweeps have to clear". Removed 2026-08-26: nothing read it, in this file or
 * anywhere else, tests included. The band arithmetic 300 lines down does NOT go
 * through a max — it hangs the left band off `STEER_PAD_H` and the right off
 * `DRIVE_PAD_H` with `ARC_STATIONS_RIGHT` (`:1103`), which is the honest shape,
 * because the two flanks have different pad heights and a single max cannot
 * describe both. The paragraph above still says „`ARC_STATIONS` is a max"; the
 * sentence survives as history of the argument, not as a live reference.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RUN IS GONE — 2026-08-14, „FIX · FLANKS". IT IS WHY HE CALLED THEM DEBRIS.
 *
 * THE RUN was how far inboard each station stepped from the one above it, and
 * for two waves it was ALSO the separation guarantee ("two 44 px boxes cannot
 * overlap if they are 44 px apart in EITHER axis"). Putting the guarantee in the
 * horizontal axis is what made a flank a DIAGONAL, and a diagonal over a moving
 * 3-D scene is litter. Measured on the deployed build (`wave12-flanks.mjs`,
 * WebKit, real insets, sc-zebra-approach@L1, all six profiles):
 *
 *   iPhone 16 LANDSCAPE   left  ⊙[61,172] ⇨[105,182] ⇦[149,192]
 *                         right Л[747,156] З[703,163] Д[659,169] ⚠[615,176]
 *     → THREE and FOUR different depths, 88 px and 132 px of stagger, against
 *       10 px and 6.7 px of vertical pitch. That is not an arc. It is a ROW
 *       tilted eight degrees, walking out of the corner and onto the road —
 *       and on the left the ⇦ label ends up to the RIGHT of the ⇨ one, which is
 *       why they read as scattered text rather than as controls.
 *   iPhone 16 PORTRAIT    the same shape at 48 px and 72 px of stagger, laid
 *       across the instrument cluster: «Дясн» printed over the dial's «120».
 *
 * SO THE GUARANTEE MOVES TO THE AXIS THAT CAN AFFORD IT. Every station on a
 * flank now shares ONE inset — that is what makes it a BAND — and the vertical
 * PITCH is 44 px, the box's own height, which satisfies the same rule with
 * nothing left over to argue about:
 *
 *     inset  = ARC_EDGE                      (identical for every station)
 *     bottom = padH + ARC_LIFT + PITCH · k   (44 px apart, always)
 *
 * `insetSpread` — max inset minus min inset across a flank — is therefore 0,
 * and `touchArc.test.ts` sweeps THAT rather than trusting this paragraph. It
 * was 88 and 132.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * The vertical step between two stations on the same band, px.
 *
 * IT IS THE BOX'S OWN HEIGHT AND IT CANNOT BE LESS. With the run at zero this
 * single number IS the separation guarantee — there is no horizontal offset
 * left to fall back on — so `TOUCH_MIN_PX` is not a coincidence here and not a
 * value to tune: below 44 the boxes overlap, above 44 the band grows taller
 * than the stage can spare (see THE HEIGHT BUDGET below).
 */
const ARC_PITCH_PX = TOUCH_MIN_PX;
const ARC_PITCH = `var(--sim-arc-pitch, ${rem(ARC_PITCH_PX)})`;
/**
 * How far the WHOLE band sits above the pad it measures from, px — and it is
 * the piece PORTRAIT NEEDED ITS OWN ARITHMETIC FOR.
 *
 * „the LEFT flank is on the dashboard rather than beside the road." Measured,
 * iPhone 16 portrait 393 × 852, the deployed build: the left band ran y 506–682
 * and the cockpit's cowl starts at y ≈ 558, so two of its three stations were
 * painted on the DASHBOARD and one of them — «⇨ Дясн» at [26, 572] — sat
 * squarely on the speedometer's «120». Landscape has no such problem: the frame
 * is wide and shallow, the cowl is below everything, and the band clears it at
 * a lift of zero.
 *
 * 132 px = 3 × 44, i.e. three rows of the same grid the band is built on, and
 * it is derived from the picture rather than chosen: the cowl's top edge is at
 * 0.663 of the portrait frame's height (measured off the shipped camera, both
 * portrait profiles have the same aspect to within 0.0002), so the road's lower
 * edge is 0.337 × H above the bottom — 287 px at 852, 263 px at 780. The band's
 * LOWEST station must start above that line:
 *
 *   iPhone 16 portrait   left 34 + 136 + 132 = 302 ≥ 287 ✓   right 318 ✓
 *   360 × 780            left  0 + 136 + 132 = 268 ≥ 263 ✓   right 284 ✓
 *   360 × 780 + gesture  left 24 + 136 + 132 = 292 ≥ 263 ✓   right 308 ✓
 *
 * IT IS A CONSTANT, NOT A FRACTION OF THE HEIGHT, and that is the whole point
 * of the last wave: `clamp(…, (100% − 22rem) × 0.5, …)` read against a stage
 * that IS the live visual viewport is a function of Safari's URL bar, which is
 * the „it is not stabilized" the founder reported. Two constants and an
 * `@media (orientation: …)` cannot do that.
 */
const ARC_LIFT_LANDSCAPE_PX = 0;
const ARC_LIFT_PORTRAIT_PX = 3 * TOUCH_MIN_PX;
const ARC_LIFT = `var(--sim-arc-lift, ${rem(ARC_LIFT_PORTRAIT_PX)})`;
/**
 * How close to the screen edge the band sits, px.
 *
 * IT WAS 2 AND HE COULD SEE IT: „the right-flank labels sit hard against the
 * right edge". Measured, iPhone 16 portrait: «Л ЛЯВО» ended at x = 379.6 of a
 * 393 px screen — 13.4 px of glass — and 2 px of that is the box, the rest is
 * the caption's own centring inside it. 8 px puts the WORD about 19 px in,
 * which is a margin rather than a near-miss, and it costs the corridor between
 * the two bands 12 px it demonstrably has (see `padCorridorPx`).
 */
const ARC_EDGE_PX = 8;
/**
 * THE LANE EACH BAND OWNS, px — and this is the mechanism behind „NOTHING may
 * ever cover them".
 *
 * A band is 44 px wide against the edge and it is now TALL: 132 px on the
 * steering flank, 176 px on the throttle one. Everything else on this screen
 * that hangs from `TOUCH_CONTROLS_FLOOR` sits INSIDE that vertical span, so
 * clearance can no longer be bought with height — measured, iPhone 16
 * landscape, the ⚙ sheet lands at y 92–136 and the band runs y 44–220.
 *
 * So clearance is bought SIDEWAYS instead: the band's lane is reserved, and the
 * two surfaces that would otherwise reach into it — the ⚙ sheet and the
 * notification column — are given left/right offsets that end before it starts.
 * Disjoint lanes are a guarantee no z-index and no measurement can undo, and
 * `wave12-flanks.mjs` tests it the way a student meets it: `elementFromPoint`
 * at every station's centre AND its four corners.
 *
 * 8 (edge) + 44 (the box) + 8 (a gap wide enough to read as a gap) = 60.
 */
export const FLANK_LANE_PX = ARC_EDGE_PX + TOUCH_MIN_PX + 8;
export const FLANK_LANE_LEFT_CSS = `calc(${rem(FLANK_LANE_PX)} + ${INSET_L})`;
export const FLANK_LANE_RIGHT_CSS = `calc(${rem(FLANK_LANE_PX)} + ${INSET_R})`;
/**
 * …AND THE SAME LANE AS A VARIABLE, WHICH IS THE ONLY FORM THAT REACHES THE
 * NOTIFICATION COLUMN. Measured on the first deployed attempt at this wave:
 * the band was correct on all six profiles and `elementFromPoint` still
 * answered the briefing card at the centre of all FOUR throttle stations.
 *
 * The cause is not specificity, it is the cascade: `SimOverlay` writes the
 * column's `right` and `width` as INLINE STYLES, and an inline style outranks
 * every selector in every stylesheet. So the `@media (orientation: landscape)`
 * override this file's stylesheet shipped could not have worked no matter how
 * it was written — the rule was applied and then thrown away.
 *
 * A variable is the one thing that crosses that line: the media query stays in
 * the stylesheet, where a media query has to be, and the inline style reads it.
 * 0 upright (the column is 141 px wide there and 141 − 60 is not a card; it
 * buys its separation with height instead), 60 px sideways.
 */
const FLANK_LANE_PORTRAIT_PX = 0;
/** The variable's NAME lives with its other consumer (modules/sim/hud/
 *  notifyColumn.ts) so the two spellings cannot drift; this file DECLARES it,
 *  and `touchArc.test.ts` asserts the declaration and the reader agree. */
export const FLANK_LANE_VAR_NAME = "--sim-flank-lane";
/** …and the same lane as a length this file can write into its own `calc()`s.
 *  0 upright, 60 px sideways — the orientation split lives in
 *  `TOUCH_BAND_CSS_VARS` and nowhere else. */
const FLANK_LANE = `var(${FLANK_LANE_VAR_NAME}, ${rem(FLANK_LANE_PORTRAIT_PX)})`;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «МЕНЮ» IS THE THIRD SURFACE IN THE LEFT LANE, AND IT WAS THE ONE NOBODY
 * GAVE THE LANE TO — 2026-08-18.
 *
 * The block at `FLANK_LANE_PX` names the two surfaces that would otherwise
 * reach into the steering band's lane and says they are given offsets that end
 * before it starts: the ⚙ sheet and the notification column. There is a THIRD,
 * and it is not in this file — `LessonPlayShell`'s «МЕНЮ» button, which is
 * shell chrome in another tree and was therefore never counted.
 *
 * IT DID NOT MATTER UNTIL THE BAND GREW A FOURTH STATION. The ⚙ dock took left
 * station 3 on 2026-08-17, and the clearance argument written for it compared
 * the LEFT band to the RIGHT band — „four left stations top out 16 px BELOW the
 * four right ones that every sweep already clears" — which is true, and is an
 * argument about the wrong neighbour. Nothing checked what sits ABOVE the left
 * column. Resolved through the shipped `arcStationRectPx(3, "left", stage)`
 * against this button's own box:
 *
 *   iphone16-landscape           dock [67,60,44,44]  menu [67,8,48,44]   +8 px
 *   small-landscape 780×360      dock [ 8,48,44,44]  menu [ 8,8,48,44]   −4 px
 *   galaxy-gesturebar-landscape  dock [ 8,24,44,44]  menu [ 8,8,48,44]  −28 px
 *
 * 28 of 44 px — 64 % of the dock — under a `z-20` shell button on the Samsung
 * profile, i.e. 34.6 % of the Bulgarian fleet, and the four lessons the dock
 * was moved for (sc-ac-night-lights, -rain-lights, -highbeam-lead, -fog) are
 * exactly the ones that open by asking for what is behind it.
 *
 * WHY THE MENU YIELDS AND NOT THE DOCK. It cannot be bought with height: the
 * left lane runs from this button's bottom edge (52 px) to the steering pad's
 * top, which is 148 px on a 360-tall stage with a gesture bar — three stations,
 * not four. So one of the two leaves the lane, and the menu is the only
 * candidate that costs nothing: it is a PAUSED-STATE object (pause, quality,
 * quit, „← Всички уроци" — see its own `onOpenChange` note), while the dock is
 * the sole door to the lights, wipers, fog lamps, engine and gearbox and has to
 * exist unconditionally while the car moves. Moving the dock back to the top
 * rail would also undo a MEASURED improvement — the reach table at the ⚙ row
 * below records «Кола» going from 110.7 mm to 27 mm when it left the rail.
 *
 * SO THE MENU PAYS THE SAME LANE THE COLUMN PAYS, and by the same mechanism:
 * a variable, read by an INLINE style, because that is the only form that
 * crosses the cascade (the block at `FLANK_LANE_PORTRAIT_PX` records the deploy
 * this cost). Sideways the button starts at 60 px and the lane is disjoint from
 * it with 8 px to spare; upright the variable is 0 and the corner is exactly
 * where it has always been — upright the dock lands at y 374 and there was
 * never a conflict to pay for.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/** The «МЕНЮ» button's own box, px — `h-11 min-w-11 px-2`, measured 47.6 × 44
 *  on the deployed build and rounded up to the 48 the rail already reserves. */
export const PLAY_MENU_W_PX = 48;
/** The gutter between «МЕНЮ» and whatever stands next to it, px. */
const PLAY_MENU_GUTTER_PX = 8;
/** The button's offset from the stage's own top-left corner, px (before the
 *  safe-area inset and before the lane). `0.5rem`, as authored in the shell. */
const PLAY_MENU_EDGE_PX = 8;
/** Where the shell must put «МЕНЮ» — the ONE definition, imported by
 *  LessonPlayShell so the button and this file's arithmetic cannot drift. */
export const PLAY_MENU_LEFT_CSS = `calc(${rem(PLAY_MENU_EDGE_PX)} + ${INSET_L} + ${FLANK_LANE})`;
export const PLAY_MENU_TOP_CSS = `calc(${rem(PLAY_MENU_EDGE_PX)} + env(safe-area-inset-top, 0px))`;

/** …and the same button resolved, so the ladder sweep can hold it against the
 *  band. `insetTop` is the DEVICE's inset: the app ships an opaque status bar,
 *  so a real phone reports 0 here — the profiles carry it anyway (devices.mjs),
 *  and a rect that survives it is a rect that survives `black-translucent`. */
export function playMenuRectPx(stage: StageBox): StageRect {
  const lane = isPortrait(stage) ? FLANK_LANE_PORTRAIT_PX : FLANK_LANE_PX;
  return {
    x: PLAY_MENU_EDGE_PX + (stage.insetLeft ?? 0) + lane,
    y: PLAY_MENU_EDGE_PX + (stage.insetTop ?? 0),
    w: PLAY_MENU_W_PX,
    h: TOUCH_MIN_PX,
  };
}
/**
 * THE RISE — AND WHAT IT MEANS SINCE THE BAND REPLACED THE ARC. READ THIS
 * BEFORE USING IT FOR ANYTHING; THE NAME IS OLDER THAN THE THING.
 *
 * It USED to be the arc's total climb. It is not that any more — the band's
 * climb is `ARC_PITCH × (stations − 1)`, and it is 88 px on the steering flank
 * and 132 px on the throttle one, in BOTH orientations.
 *
 * What this variable still is, and the only thing it is still used for, is the
 * RESERVE INSIDE `TOUCH_CONTROLS_FLOOR`: the height above the drivetrain pad
 * that every surface hanging from that floor keeps clear. It is deliberately
 * left at its 2026-08-13 values, 20 px sideways and 132 px upright, because
 * moving it moves the ⚙ sheet, the demonstration deck, the minimap, the trace
 * timeline and the rotate hint, none of which this wave is about — and because
 * the band's own clearance is now HORIZONTAL (`FLANK_LANE_PX`) rather than
 * vertical, so the floor no longer has to be tall enough to clear it. On a
 * 393 px landscape stage a floor that cleared the whole band would be 369 px of
 * 393, i.e. every one of those surfaces pushed off the top of the screen.
 *
 * The ORIENTATION is a `@media (orientation: …)` query in PlayAreaStyles, not a
 * height comparison: a media query is discrete, so it cannot produce the „a
 * little bit different at every height" behaviour the last wave deleted. A
 * phone does not change orientation while the URL bar slides.
 */
const ARC_RISE_LANDSCAPE_PX = 20;
const ARC_RISE_PORTRAIT_PX = 3 * TOUCH_MIN_PX;
const ARC_RISE = `var(--sim-arc-rise, ${rem(ARC_RISE_PORTRAIT_PX)})`;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE HEIGHT BUDGET — what a band costs a stage, per profile, at rest.
 *
 * A band is `insetBottom + padH + ARC_LIFT + PITCH × (n − 1) + 44` tall, and
 * the throttle flank is the tall one (four stations, the 152 px pad):
 *
 *   iPhone 16   852 × 393   21 + 152 +   0 + 132 + 44 = 349 of 393   44 spare
 *   Android     780 × 360    0 + 152 +   0 + 132 + 44 = 328 of 360   32 spare
 *   Galaxy      780 × 360   24 + 152 +   0 + 132 + 44 = 352 of 360    8 spare
 *   iPhone 16   393 × 852   34 + 152 + 132 + 132 + 44 = 494 of 852  358 spare
 *   Android     360 × 780    0 + 152 + 132 + 132 + 44 = 460 of 780  320 spare
 *   Galaxy      360 × 780   24 + 152 + 132 + 132 + 44 = 484 of 780  296 spare
 *
 * IT FITS ON ALL SIX AT REST AND THE GALAXY SIDEWAYS IS THE ONE TO WATCH: 8 px.
 * A browser toolbar that takes more than that off a 360 px landscape stage
 * clips the top station, and `BAND_LIFT` cannot help — it holds the band still
 * against a GROWING stage, not a shrinking one.
 *
 * WHAT IS NOT BUILT, AND SAYING SO IS THE POINT (the same stance the collapse
 * block below already takes): there is no two-station fallback. Four stations
 * at a 44 px pitch simply do not fit a 270 px landscape stage — 270 − 24 − 132
 * leaves 114 px of pad against the 132 px the absolute drivetrain axis needs —
 * so the honest options there are dropping a station or dropping the pitch, and
 * both are decisions about which control a student can reach, not geometry to
 * be picked on the way past. No device in the ladder reaches that at rest.
 * ═══════════════════════════════════════════════════════════════════════════
 */

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
/** The gap in `TOUCH_CONTROLS_FLOOR` and in the column's floor. 20 px, and it
 *  is not rounding — see the export's own note: the one control that sits on
 *  that floor carries a 12 px ::before on each side. */
const TOUCH_CONTROLS_FLOOR_GAP_PX = 20;

/* The column's two floors, resolved. The block below `TOUCH_BAND_CSS_VARS`
   explains why the column does not share `TOUCH_CONTROLS_FLOOR`; these have to
   be declared here because the stylesheet interpolates them. */
const COLUMN_FLOOR_LANDSCAPE_PX = DRIVE_PAD_H_PX + TOUCH_CONTROLS_FLOOR_GAP_PX;
const COLUMN_FLOOR_PORTRAIT_PX =
  DRIVE_PAD_H_PX +
  ARC_LIFT_PORTRAIT_PX +
  ARC_PITCH_PX * (ARC_STATIONS_RIGHT - 1) +
  TOUCH_MIN_PX +
  TOUCH_CONTROLS_FLOOR_GAP_PX;

export const TOUCH_BAND_CSS_VARS = `
      :root {
        --sim-pad-steer-h: ${rem(STEER_PAD_H_PX)};
        --sim-pad-drive-h: ${rem(DRIVE_PAD_H_PX)};
        --sim-arc-rise: ${rem(ARC_RISE_PORTRAIT_PX)};
        --sim-arc-pitch: ${rem(ARC_PITCH_PX)};
        --sim-arc-lift: ${rem(ARC_LIFT_PORTRAIT_PX)};
        --sim-column-floor: ${rem(COLUMN_FLOOR_PORTRAIT_PX)};
        --sim-flank-lane: ${rem(FLANK_LANE_PORTRAIT_PX)};
      }
      @media (orientation: landscape) {
        :root {
          --sim-arc-rise: ${rem(ARC_RISE_LANDSCAPE_PX)};
          --sim-arc-lift: ${rem(ARC_LIFT_LANDSCAPE_PX)};
          --sim-column-floor: ${rem(COLUMN_FLOOR_LANDSCAPE_PX)};
          --sim-flank-lane: ${rem(FLANK_LANE_PX)};
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
 * ═══════════════════════════════════════════════════════════════════════════
 * THE NOTIFICATION COLUMN'S OWN FLOOR — why it is not `TOUCH_CONTROLS_FLOOR`.
 *
 * The column is the ONE surface in this shell that shares the throttle flank's
 * corner, so it is the one whose clearance cannot be a copy of everybody
 * else's. The two orientations solve it in opposite directions, and that is why
 * this is a variable rather than a number:
 *
 *   LANDSCAPE — the lanes are DISJOINT. `PlayAreaStyles` gives the column a
 *     right offset of `FLANK_LANE_PX` and takes the same width off it, so its
 *     box ends 8 px before the band starts and its LEFT edge does not move at
 *     all (852 − 59 − 12 − 240 = 541 before; 852 − 59 − 72 − 180 = 541 after —
 *     the column's left fraction is unchanged and so is its 0.60 contract).
 *     Having stopped sharing the lane, the column no longer has to clear the
 *     band's HEIGHT either — it only has to clear the drivetrain pad. That
 *     takes the compact cap from 128 px to 192 px on the founder's phone:
 *     180 × 192 = 34 560 px² against 240 × 128 = 30 720, i.e. THE CARD GETS
 *     12 % MORE ROOM out of this wave rather than less, which matters because
 *     it is already hiding 333 px of the body it is given.
 *
 *   PORTRAIT — the column is only `min(15rem, 36vw)` = 141 px wide, so taking
 *     a 60 px lane off it would leave 81 px and that is not a card. Upright
 *     there is height to spare instead, so the column keeps its full width and
 *     stops ABOVE the band: floor = pad + lift + climb + one box + the gap.
 *     393 × 852 → cap 330 px against a briefing card measured at ~205 px, so
 *     nothing is actually given up; 360 × 780 → 292; the Galaxy → 268.
 *
 * Both arms keep `BAND_LIFT`, which is the term that holds everything still
 * while Safari's URL bar slides.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/** The floor the notification column hangs above — see the block above. */
export function notifyColumnFloorCss(heightToken = "100%"): string {
  return `calc(${bandLiftCss(heightToken)} + var(--sim-column-floor, ${rem(
    COLUMN_FLOOR_PORTRAIT_PX,
  )}) + ${INSET_B})`;
}

/** …resolved, for the ladder sweep. */
export function notifyColumnFloorPx(stage: StageBox): number {
  const isP = stage.height >= stage.width;
  return (
    bandLiftPx(stage) +
    (isP ? COLUMN_FLOOR_PORTRAIT_PX : COLUMN_FLOOR_LANDSCAPE_PX) +
    (stage.insetBottom ?? 0)
  );
}
/**
 * `PITCH · k` — station `k`'s climb above the band's lowest box, px.
 *
 * IT WAS `rise · k / (n−1)`, i.e. a total climb SHARED OUT between however many
 * stations the flank carried, and that is why the two flanks disagreed: the
 * same 132 px rise gave the three-station flank a 66 px pitch and the
 * four-station one 44 px. A band cannot be built out of a total — it is built
 * out of a STEP, the same step on both sides, so the two flanks read as one
 * system and the separation rule is a single number that no station count can
 * dilute.
 *
 * There is nothing to round: `44 · k` is exact in both this resolver and CSS
 * `calc()`, which is what the old division needed a whole paragraph to promise.
 */
function arcRiseAtPx(index: number, count: number, pitchPx: number): number {
  if (count <= 1 || index <= 0) return 0;
  return pitchPx * Math.min(index, count - 1);
}

/** …and the same term as CSS. */
function arcRiseTermCss(index: number, count: number): string {
  if (count <= 1 || index <= 0) return "0px";
  return `(${ARC_PITCH} * ${Math.min(index, count - 1)})`;
}

/**
 * One station's box, measured from the bottom and from the near side edge.
 *
 * TWO TERMS AND NEITHER OF THEM DEPENDS ON THE STATION'S NEIGHBOURS ANY MORE:
 *
 *   inset  = ARC_EDGE                     — the SAME for every station on the
 *            flank. That single fact is what turns a scatter into a band, and
 *            it is what `insetSpreadPx === 0` asserts.
 *   bottom = padH + ARC_LIFT + PITCH · k  — 44 px apart, always, both flanks.
 *
 * `padH` is the pad this band has to clear: without the lift, station 0's box
 * sits exactly on the pad's top edge, which is what keeps a thumb-down on the
 * lowest station from being swallowed by the wheel or the throttle. `ARC_LIFT`
 * then raises the WHOLE band together — zero sideways, 132 px upright, where
 * the pads alone would have left it on the dashboard.
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
    // the band being measured from the pad's live box, so neither can move the
    // other. (`padH` here is a constant; before the 2026-08-13 wave both it and
    // the climb were functions of the stage, which is how a 15 px pad resize
    // turned into a 22 px station move.)
    bottom: `calc(${BAND_LIFT} + ${padH} + ${ARC_LIFT} + ${arcRiseTermCss(index, count)} + ${INSET_B})`,
    inset: rem(ARC_EDGE_PX),
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

/**
 * `TOUCH_CONTROLS_FLOOR`'s reserve above the drivetrain pad, px.
 *
 * NOT the band's climb any more — see the block at `ARC_RISE_LANDSCAPE_PX`. It
 * is exported under its old name because that is what every consumer and every
 * pinned test already calls it, and renaming an exported number across five
 * files is not a thing to do inside a geometry fix.
 */
export function arcRisePx(stage: StageBox): number {
  if (isCollapsed(stage)) return ARC_RISE_COLLAPSED_PX;
  return isPortrait(stage) ? ARC_RISE_PORTRAIT_PX : ARC_RISE_LANDSCAPE_PX;
}

/**
 * The vertical step between two neighbouring stations, px — the numeric twin of
 * `--sim-arc-pitch`, and the ONLY thing keeping two 44 px boxes apart now that
 * the run is gone. One number, both orientations, both flanks, every stage:
 * that is what makes the separation rule checkable in one line instead of a
 * case analysis over rises and counts.
 */
export function arcPitchPx(_stage: StageBox): number {
  return ARC_PITCH_PX;
}

/** How far the whole band sits above its pad, px — 0 sideways, 132 upright. */
export function arcLiftPx(stage: StageBox): number {
  return isPortrait(stage) ? ARC_LIFT_PORTRAIT_PX : ARC_LIFT_LANDSCAPE_PX;
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

/** Station `index` of one band, resolved to a rect on the stage. */
export function arcStationRectPx(
  index: number,
  side: "left" | "right",
  stage: StageBox,
): StageRect {
  const count = arcStationCount(side);
  const bottom =
    bandLiftPx(stage) +
    padHeightPx(side, stage) +
    arcLiftPx(stage) +
    arcRiseAtPx(index, count, arcPitchPx(stage)) +
    (stage.insetBottom ?? 0);
  // ONE inset for every station on the flank — this is the band, stated as the
  // absence of an index term. It used to read `+ arcRunStepPx · (n−1−index)`.
  const inset =
    ARC_EDGE_PX + (side === "left" ? (stage.insetLeft ?? 0) : (stage.insetRight ?? 0));
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

/** Where the rail starts — past the shell's «Меню» button.
 *
 *  DERIVED FROM THAT BUTTON'S OWN BOX SINCE 2026-08-18, and it used to be the
 *  literal `0.5rem + 3.5rem`. The block above moved «МЕНЮ» out of the steering
 *  band's lane, and this file's own promise about the rail is „One rail, one
 *  clearance; if the menu word ever grows, both move together" — a promise a
 *  second copy of the number cannot keep. `PLAY_MENU_LEFT_CSS` already carries
 *  the inset and the lane, so the rail follows the button wherever it goes and
 *  `topRailBandPx` resolves the identical sum. */
export const TOP_RAIL_LEFT_CSS = `calc(${PLAY_MENU_LEFT_CSS} + ${rem(
  PLAY_MENU_W_PX + PLAY_MENU_GUTTER_PX,
)})`;
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
  const menu = playMenuRectPx(stage);
  const x = menu.x + menu.w + PLAY_MENU_GUTTER_PX;
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

/* ═══════════════════════════════════════════════════════════════════════════
   WHAT THE TWO PADS ANNOUNCE — AND WHY A PINNED `aria-valuenow` IS A DEFECT
   AND NOT A MISSING NICETY. Catalogue row sc-zebra-approach:952e056d.

   BOTH PADS ARE `role="slider"`, both declare `aria-valuemin={-100}` and
   `aria-valuemax={100}`, and until this change both hardcoded
   `aria-valuenow={0}` as a LITERAL. Nothing ever updated it, because the
   gesture path deliberately writes through refs and DOM styles (no React state
   at gesture rate — see the header's „Perf" note), and the accessible value was
   never part of that path. So the WHEEL reported itself centred at full lock
   and the DRIVETRAIN axis reported itself centred with the pedal on the floor,
   in both directions, forever.

   THAT IS WORSE THAN OMITTING THE ROLE, and the reason is specific rather than
   pedantic: `valuemin`/`valuemax` are a PROMISE that the control has a readable
   position. A student who cannot see the screen is told this pad is a slider
   with a −100..100 range, asks it where it is, and is told „centre" whatever
   their thumb is doing. They cannot discover the lie by exploring, because
   every position they can reach answers the same. On a phone this pad is the
   ONLY way to drive, and the audience is 17–18-year-olds.

   THE SHAPE OF THE FIX, and each part of it is load-bearing:

   · THE ANNOUNCED NUMBER IS DERIVED FROM THE COMMANDED ONE. `steerAxisAria`
     takes the value that was just handed to `TouchInputSource.setSteer`, and
     `driveAxisAria` takes the axis `driveAxisFromPadY` just returned — not the
     pixel geometry, not a second copy of the curve. A recomputation is a second
     source of truth and this file has been bitten by those (see the block above
     `reverseGestureLive`). What the pad SAYS therefore cannot drift from what
     the car DOES without the drive breaking first.

   · IT IS WRITTEN IMPERATIVELY, next to the knob's `style.transform`, for the
     same reason the transform is: a `setState` at gesture rate is a rendering
     bug on this screen. React never re-applies a JSX attribute whose value did
     not change between renders, so the constant `aria-valuenow={0}` in the
     markup is the AT-REST truth (which it genuinely is) and the imperative
     writes own the attribute from the first `pointerdown` onward.

   · AND IT SAYS WHAT THE NUMBER MEANS. Doc 64 THEO-4: this product explains,
     it does not merely report. „−100" is a verdict; «Волан докрай наляво —
     пълен волан» is an instructor. `aria-valuetext` carries the sentence and
     the number stays underneath it for anything that wants to compute.

   · THE SWAP IS IN THE SENTENCE, NOT IN THE PAD. In R with the assist live the
     two channels are exchanged downstream (`applyReversePedalRemap`), so „up"
     is the brake and „down" is the reverse accelerator — the same fact
     `driveAxisLabelBg` already carries. The pad's behaviour is untouched here
     too; only the words know.

   WHAT THIS DELIBERATELY DOES NOT DO: give the pads `tabIndex` and arrow-key
   increments, which is the rest of a conforming slider. The arrows ARE the
   steering keys (`engine/input.ts`: `on("KeyA") || on("ArrowLeft")`), so a
   focusable pad that consumed them would fight the car for its own control.
   Making the reported position TRUE is separable from that and is the half the
   catalogue row is about; the other half needs a decision about the whole
   screen's focus order and is not this change's to take.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The two attributes a `role="slider"` owes its user, as one value. */
export interface AxisAria {
  /** −100..100, in the SCREEN's direction (see `steerAxisAria`). */
  valueNow: number;
  /** The same position as a sentence a person can act on. */
  valueText: string;
}

/** Both pads at rest. Exported because the markup, the release edges and the
 *  „a hide parks everything" path must all say the identical thing. */
export const STEER_ARIA_CENTRE_TEXT = "Волан в центъра — колелата са прави.";
export const DRIVE_ARIA_CENTRE_TEXT =
  "Педалът е в средата — нито газ, нито спирачка; колата се движи по инерция.";

/**
 * The wheel's announced position, FROM THE VALUE THE CAR IS BEING STEERED ON.
 *
 * `steerValue` is `VehicleInput.steer` — engine convention, **+1 = LEFT**
 * (`steerFromDrag` says so in its own last line). The slider's convention is
 * the SCREEN's: dragging right raises the value, because that is what the thumb
 * and the knob do and because a left-to-right slider that counts down as it
 * moves right is a second thing to have to know. The sign is flipped exactly
 * once, here, and the side is ALSO spelled out in words so nothing rests on a
 * reader having internalised either convention.
 */
export function steerAxisAria(steerValue: number): AxisAria {
  const valueNow = Math.round(-steerValue * 100);
  if (valueNow === 0) return { valueNow: 0, valueText: STEER_ARIA_CENTRE_TEXT };
  const side = valueNow > 0 ? "надясно" : "наляво";
  const magnitude = Math.abs(valueNow);
  return {
    valueNow,
    valueText:
      magnitude >= 100
        ? `Волан докрай ${side} — пълен волан.`
        : `Волан ${magnitude}% ${side}.`,
  };
}

/**
 * The drivetrain axis's announced position, from the axis `driveAxisFromPadY`
 * just returned: **positive = up = throttle, negative = down = brake**, which
 * is already the screen's direction, so nothing is flipped.
 *
 * `reverseGesture` is `inReverse && reverseGestureLive(…)` — the one state in
 * which the channels are swapped underneath the student (see the block above).
 * A pad that announced «Газ 80%» while the car was braking would be the same
 * defect this function exists to end, one mode over.
 */
export function driveAxisAria(axis: number, reverseGesture: boolean): AxisAria {
  const valueNow = Math.round(axis * 100);
  if (valueNow === 0) return { valueNow: 0, valueText: DRIVE_ARIA_CENTRE_TEXT };
  const up = valueNow > 0;
  const channel = reverseGesture ? (up ? "brake" : "reverse") : up ? "throttle" : "brake";
  const name =
    channel === "brake" ? "Спирачка" : channel === "throttle" ? "Газ" : "Заден ход";
  const floored =
    channel === "brake"
      ? "аварийно спиране"
      : channel === "throttle"
        ? "газта е до дупка"
        : "докрай назад";
  const magnitude = Math.abs(valueNow);
  return {
    valueNow,
    valueText:
      magnitude >= 100 ? `${name} 100% — ${floored}.` : `${name} ${magnitude}%.`,
  };
}

/** The narrowest thing this can be written to — a pad's own node, and in the
 *  tests a recorder. Deliberately not `HTMLElement`: nothing here needs one. */
export interface AxisAriaTarget {
  setAttribute(name: string, value: string): void;
}

/**
 * Publish a pad's position to the accessibility tree.
 *
 * Both attributes, always, from one call: `aria-valuenow` without
 * `aria-valuetext` is a bare number and `aria-valuetext` without
 * `aria-valuenow` leaves the range unreadable, and this file's own history
 * (doc 91 §C1) is what happens when two halves of one statement are written at
 * two call sites in two vocabularies.
 */
export function publishAxisAria(el: AxisAriaTarget | null | undefined, aria: AxisAria): void {
  if (!el) return;
  el.setAttribute("aria-valuenow", String(aria.valueNow));
  el.setAttribute("aria-valuetext", aria.valueText);
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

/* ═══════════════════════════════════════════════════════════════════════════
   THE BEAM VOCABULARY, IN ONE PLACE — sc-ac-highbeam-lead:b0ee7eff and
   sc-ac-night-lights:ebeb0e44, 2026-08-27.

   TWO SURFACES IN THIS FILE NOW SAY THE BEAM STATE — the flank station (right
   station 0, once the belt is on) and the ⚙ sheet's cell — and they must not
   be able to drift apart, which is what a copied ternary always does. The
   sheet used to carry its own pair of nested ternaries; both are derived here
   now, from the one `HeadlightSetting` the cabin owns.

   ── WHY THE «OFF» FACE IS «СВЕТЛ» AND NOT «ИЗКЛ» ──────────────────────────
   `modules/sim/procedures/performedSteps.ts:219` teaches the control BY NAME:
   „Отвори „Кола“ … и натисни „СВЕТЛ“". So the unlit face is the CLASS (the
   name the procedure sends the student to look for) and the two lit faces are
   the STATE — «къси» / «дълги» are the words a Bulgarian learner already has
   for the two beams, and they appear on no other control on either flank, so
   the two-flank vocabulary rule (the block above the left flank) holds.

   ── WHY «ДЪЛГИ» IS `warning` AND «КЪСИ» IS NOT — THE WHOLE OF b0ee7eff ─────
   The row is „this lesson is about switching between long and dipped beam and
   there is no long-beam indicator anywhere". The face already differed; the
   INK did not — `active` was `headlights !== "off"`, so «КЪСИ» and «ДЪЛГИ»
   were painted in the identical accent, on the lesson whose whole subject is
   telling the two apart. Main beam is the state that hurts SOMEBODY ELSE
   («иначе я заслепяваш през огледалата ѝ» — the lesson's own briefing), so it
   gets the one register that is not the accent. It is the only amber ON THE
   FLANK — the sheet's two other `warning` cells, «АВАР» and «СЪЕД», live
   behind the ⚙ door and are never on the glass beside it — and `danger` stays
   the belt's alone (see GlyphButton).

   ── THEO-4: NO BARE STATE ─────────────────────────────────────────────────
   The label is not „Светлини: дълги". It says what the state DOES and what to
   do about it, in the reader's own terms — the accessible name AND the title,
   i.e. the sentence a screen-reader user and a mouse user both get. No article
   number and no offence code: this is instructor reasoning, not law recall
   (ADR-002), and the citation for the duty itself already rides on the
   telltale warning the shell prints (`hud/telltaleWarnings.ts`, «Светлините не
   са включени», with `VIOLATIONS[code].lawRef`).
   ═══════════════════════════════════════════════════════════════════════════ */

/** The face a student reads: the class while unlit, the state while lit. */
export function beamFaceBg(setting: HeadlightSetting): string {
  return setting === "high" ? "ДЪЛГИ" : setting === "low" ? "КЪСИ" : "СВЕТЛ";
}

/** The accessible name — state, consequence, and the next act. */
export function beamLabelBg(setting: HeadlightSetting): string {
  if (setting === "high") {
    return "Светлини: дълги — виждаш по-далеч, но заслепяваш насрещните и предния през огледалата му. Натисни за изключване; за движение зад кола са късите.";
  }
  if (setting === "low") {
    return "Светлини: къси — режимът, с който се кара зад друга кола и в насрещно движение. Натисни за дълги.";
  }
  return "Светлини: изключени — натисни, за да включиш късите, щом се стъмни или видимостта падне.";
}

/** Amber only on main beam: the state that dazzles somebody else. */
export function beamTone(setting: HeadlightSetting): "warning" | undefined {
  return setting === "high" ? "warning" : undefined;
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
  // brings it back. „Touch-only devices simply never see driving keys" is what
  // this comment used to claim on its own, and the measurement above is what it
  // is worth — a phone that receives one keydown from ANY source loses every
  // control it has, permanently. `keyboardTakeoverAllowed()` is the premise.
  const [keyboardActive, setKeyboardActive] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!KEYBOARD_DRIVE_CODES.has(e.code)) return;
      if (!keyboardTakeoverAllowed()) return;
      setKeyboardActive(true);
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

  /* ── THE PADS' OWN NODES, SEATED FROM `e.currentTarget` AND NOT FROM `ref=` ──
     These carry the announced position (`publishAxisAria`), and they are taken
     from the event rather than from a JSX `ref` on purpose: `e.currentTarget`
     for a pad handler IS the element that carries `role="slider"`, so the node
     the position is written to cannot be a different node from the one the
     gesture arrived on. The identity is stable across a card — the whole point
     of §I3 is that these nodes SURVIVE the interruption — so a ref seated once
     stays correct for the session, and before the first press the markup's own
     at-rest values are already the truth. */
  const steerPadRef = useRef<AxisAriaTarget | null>(null);
  const drivePadRef = useRef<AxisAriaTarget | null>(null);

  /** True only in R with the assist live, i.e. exactly when „up" is the brake
   *  and „down" is the reverse accelerator. Assigned during render (below,
   *  beside `gestureLive`) and read by the gesture handlers, which must not be
   *  rebuilt at gesture rate — the same idiom `useHoldButton` uses. */
  const reverseGestureRef = useRef(false);

  /** The drivetrain axis this pad last drove the pedals on, kept so the swap
   *  below can re-announce the position WITHOUT inventing one. Written in
   *  `driveApply` beside the pedals themselves, so it cannot be a second
   *  reading of the geometry; cleared on the two edges that let the pad go. */
  const driveAxisRef = useRef(0);

  /** Both knobs home, AND both pads announcing centre. The ink must not go on
   *  claiming a throttle the hide just released — the pad's node now SURVIVES
   *  the interruption (see the render below), and its inline transform survives
   *  with it. So does its `aria-valuenow`, which is ink for anyone who cannot
   *  see the knob: a hide releases the axes, so the announced position has to
   *  come home in the same call or the two disagree for the length of a card. */
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
    driveAxisRef.current = 0;
    publishAxisAria(steerPadRef.current, steerAxisAria(0));
    publishAxisAria(drivePadRef.current, driveAxisAria(0, reverseGestureRef.current));
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

  // …AND THE SAME PROMISE CHECKED RATHER THAN ASSUMED — the block at
  // `reconcileHeldAxes` has the argument, including why a watchdog is allowed
  // to exist here when it would not be anywhere else on this screen. Only
  // while `visible`: an inert overlay has already been through the effect
  // above and its pads are `pointer-events: none`, so no gesture can start
  // and no axis can be stranded while it is down.
  useEffect(() => {
    if (!visible) return;
    const id = window.setInterval(
      () => reconcileHeldAxes(touch, steerPad, drivePad),
      AXIS_RECONCILE_MS,
    );
    return () => window.clearInterval(id);
  }, [visible, touch, steerPad, drivePad]);

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
      const steer = steerFromDrag(dx, TOUCH_STEER_RANGE_PX);
      touch.setSteer(steer);
      // THE ANNOUNCED POSITION COMES OFF THE SAME LOCAL THE CAR IS STEERED ON,
      // one line down from `setSteer` — not off `dx`, which would be a second
      // copy of the expo curve and free to drift. See the block at
      // `steerAxisAria`.
      publishAxisAria(steerPadRef.current, steerAxisAria(steer));
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
      steerPadRef.current = e.currentTarget;
      steerBegin(e.clientX);
    },
    [steerBegin, steerPad],
  );

  const onSteerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (steerPad.owns(e.pointerId)) {
        steerApply(e.clientX);
      } else if (adoptable(steerPad, e, visible)) {
        // The adoption door captures too — see the block at `adoptable()`.
        // Without this the pad's `onLostPointerCapture` edge cannot fire for
        // this gesture, and an uncaptured pointer that lifts elsewhere leaves
        // the wheel owned for the rest of the session.
        capturePointer(e.currentTarget, e.pointerId);
        // …and seats the node the position is announced on, for the same
        // reason: the adoption door is a full second entrance to the gesture,
        // so everything the press door does it must do too.
        steerPadRef.current = e.currentTarget;
        steerBegin(e.clientX);
      }
    },
    [steerApply, steerBegin, steerPad, visible],
  );

  const onSteerEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!steerPad.release(e.pointerId)) return;
      touch.releaseSteer(); // springs back: keyboard/gamepad regain the axis
      publishAxisAria(steerPadRef.current, steerAxisAria(0));
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
      // Same discipline as the wheel: announced from the axis the pedals were
      // just driven from, in every one of the three branches above, including
      // the neutral band — which is a POSITION the thumb can hold and not an
      // absence of one. `reverseGestureRef` is what stops the sentence naming
      // the wrong channel in R (block at `driveAxisAria`).
      driveAxisRef.current = axis;
      publishAxisAria(drivePadRef.current, driveAxisAria(axis, reverseGestureRef.current));
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
      drivePadRef.current = e.currentTarget;
      driveBegin(e.currentTarget, e.clientY);
    },
    [driveBegin, drivePad],
  );

  const onDriveMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (drivePad.owns(e.pointerId)) {
        driveApply(e.clientY);
      } else if (adoptable(drivePad, e, visible)) {
        // …and the same on the pedals, where a stranded axis is the one that
        // OVERWRITES the keyboard's brake rather than merely failing to add to
        // it (the block at `adoptable()`, and the priority-replace note at
        // `onDriveEnd`).
        capturePointer(e.currentTarget, e.pointerId);
        drivePadRef.current = e.currentTarget;
        driveBegin(e.currentTarget, e.clientY);
      }
    },
    [driveApply, driveBegin, drivePad, visible],
  );

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * THE FOURTH RELEASE EDGE, AND WHY THE PEDALS ARE THE ONE CONTROL THAT
   * CANNOT DO WITHOUT IT — 2026-08-18, sweep161 part F.
   *
   * `useHoldButton` at the foot of this file wires FOUR ways a press can end
   * — „up, cancel, lost capture, unmount" — and says why in one line: „A horn
   * latched down by a lost pointer event is a car sounding through a quiz."
   * These two pads, which are the steering wheel and BOTH PEDALS, wired two.
   * `lostpointercapture` was not among them, and neither was the invariant it
   * belongs to (the poll below).
   *
   * WHY IT IS WORSE HERE THAN ON THE HORN. `TouchInputSource.mergeInto` is a
   * PRIORITY REPLACE and not a max (engine/touch.ts: „while a finger owns an
   * axis, its value REPLACES that axis outright"). So a pad that keeps
   * `brakeActive` after its finger is gone does not merely fail to brake — it
   * OVERWRITES the keyboard∪gamepad result for that axis on every `read()`,
   * for the rest of the session. A held brake key stops reaching the car, and
   * a stale positive throttle makes the car speed up while it is held.
   *
   * WHICH IS THE SHAPE THE CATALOGUE SWEEP REPORTS, WORD FOR WORD:
   *
   *   !! the brake is held and the car went 7 -> 10 км/ч — the sim never got
   *      the key; re-asserting it.
   *
   * Counted over the whole of `.audit-frames/sweep161`: 218 firings, and the
   * platform split is 73 of 195 mobile legs against 1 of 189 PC legs.
   *
   * HONESTY ABOUT WHAT THIS DOES AND DOES NOT EXPLAIN. Those runs were
   * captured BEFORE `keyboardTakeoverAllowed()` (the block above): the first
   * `KeyW` hid this whole overlay, the `!visible` effect released every axis,
   * and the frames prove it — `sweep161/sc-crossing-child-ball/mobile-right/
   * 05-stopped.png` shows «МЕНЮ» alone where the strip was. An overlay that
   * has released everything cannot have been the veto path in those runs, so
   * this is NOT a retro-diagnosis of them.
   *
   * ── AND THE CAUSE THAT SENTENCE USED TO LEAVE UNNAMED — 2026-08-18 ───────
   *
   * It is the FOURTH CLOCK, and it is a sibling of the three
   * `lesson-ui/sessionClock.ts` was written to reconcile („three clocks that
   * only agreed above 10 fps"). `engine/input.ts` ramps the KEYBOARD pedals
   * against wall time and clamped each `read()` to `MAX_RAMP_DT_S = 0.1`, while
   * the world advances on rapier's own `PHYSICS_MAX_FRAME_DT = 0.5` — and
   * `read()` writes `lastReadMs` on every call, so the FIRST read of a frame
   * takes the whole elapsed and the rest of that frame's reads take nothing.
   * One frame therefore bought 0.1 s of PEDAL and 0.5 s of WORLD:
   *
   *   ≥10 fps   0.1 : 0.1   the clamp never binds — this is the PC leg
   *    2 fps    0.1 : 0.5   BRAKE_ATTACK_S 0.25 → 2.5 frames → 1.25 s of world
   *                         with the brake still arriving, and
   *                         THROTTLE_RELEASE_S 0.25 → 1.25 s more of world with
   *                         the throttle still leaving
   *
   * AND THE SWEEP'S TWO LEGS ARE NOT TWO DEVICES, THEY ARE TWO BROWSERS — which
   * is what makes „only ever on the mobile leg" a statement about frame rate.
   * `lesson-audit.mjs` launches the PC leg as headless CHROMIUM with
   * `--use-angle=d3d11 --enable-gpu` at DPR 1, and records why: it read
   * `UNMASKED_RENDERER_WEBGL` before and after and went from SwiftShader to a
   * GTX 1060. The mobile leg is `webkit.launch({ headless: true })` — no args,
   * because there are none to pass — on the iPhone 16 profile at DPR 3, i.e.
   * nine times the pixels on the software rasteriser the PC leg was just taken
   * off. The frame time that leg is left with is the one `sessionClock.ts`
   * measured on the PC leg BEFORE that flag: 2.33 s at DPR 1, 3.57 s at DPR 2.
   * Both are far below the 10 fps at which this clamp starts to bind, and the
   * guard's platform split is dated after the flag landed.
   *
   * So on the mobile leg a held brake key genuinely did take ~1.25 s of WORLD
   * time to arrive while the car kept its throttle for the same span — which
   * is „7 -> 10 км/ч, brake held", exactly. IT IS A KEYBOARD PATH. The pads on
   * this screen are not ramped at all (`driveApply` writes the position
   * straight through and `mergeInto` REPLACES), so the one input this defect
   * cannot reach is the one a phone student actually uses — and the one it hit
   * hardest is a student on a weak laptop, which is the device the product is
   * aimed at. The fix was never here; it was `MAX_RAMP_DT_S`, which belongs
   * beside `PHYSICS_MAX_FRAME_DT` rather than five times under it — AND LANDED
   * THERE 2026-08-24 (sweep161 ea19f/327f9): the two clamps are now the same
   * 0.5 and `engine/__tests__/input.test.ts` asserts the equality across the
   * module boundary, so one slow frame hands the pedal exactly the world time
   * it hands the physics at every frame rate.
   *
   * What the takeover fix DID do is make this overlay live on a phone for the
   * whole drive for the first time. Until 2026-08-17 a stray drive key was
   * also, accidentally, the thing that swept a stranded axis away every few
   * seconds. That crutch is gone. A stranded axis is now permanent, and the
   * three edges that can strand one — a capture lost without an up, a gesture
   * ADOPTED without one (the block at `adoptable()`), and any release path a
   * future edit forgets — are closed here, above and below.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const onDriveEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drivePad.release(e.pointerId)) return;
      touch.releaseThrottle();
      touch.releaseBrake();
      driveAxisRef.current = 0;
      publishAxisAria(drivePadRef.current, driveAxisAria(0, reverseGestureRef.current));
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
  /** The live beam, read once for the two surfaces that draw it — the flank
   *  station and the ⚙ sheet's cell. Before the first 250 ms cabin poll the
   *  car is unread; `"off"` is what a fresh scene opens in on every lesson
   *  except the ones `scene/cabin.ts initialHeadlightsFor` starts lit, and the
   *  station is not on the glass until the belt is on anyway (below), so the
   *  fallback is never what a student sees. */
  const beam: HeadlightSetting = snap?.headlights ?? "off";
  const inReverse = gearLabel === "R";
  // Before the first 250 ms poll the cabin is unread; „automatic" is what a
  // fresh scene opens in (DEFAULT_DIFFICULTY === "normal"), so the default is
  // the truth rather than a guess.
  const transmission: TransmissionMode = snap?.transmission ?? "automatic";
  const gestureLive = reverseGestureLive(reverseAssistEnabled, transmission);
  // The one state in which the drivetrain axis's two channels are exchanged
  // underneath the student, published to the gesture handlers as a ref so they
  // keep their identity — a `driveApply` rebuilt whenever the cabin poll sees a
  // new selector letter is a callback churning at 4 Hz for a sentence.
  const reverseGesture = inReverse && gestureLive;
  reverseGestureRef.current = reverseGesture;

  /* ── AND THE SWAP CAN ARRIVE UNDER A THUMB THAT IS ALREADY DOWN ───────────
     The gesture handlers publish on pointer events, which is every position
     change — but this mode change is not one. LAW 1 (`reverseAssist.ts`) is
     „brake held at a standstill for REVERSE_ASSIST_HOLD_S toggles the direction
     of travel": the flip D→R happens WITH THE PEDAL STILL HELD, so the finger
     that caused it emits no `pointermove` and, on a thumb that does not wobble,
     nothing would re-announce. The pad would go on saying «Спирачка 100% —
     аварийно спиране» after „down" had stopped meaning brake — the same defect
     the block at `steerAxisAria` is about, arriving through the one door a
     gesture cannot close.

     So the announcement follows the mode as well as the thumb. It re-publishes
     ONLY while the pad owns a finger (`pointerId !== null`) and ONLY from the
     axis `driveApply` last drove the pedals on — it never invents a position,
     and with no finger down `onDriveEnd`/`parkKnobs` have already brought the
     announced value home. The `aria-label` beside it has always updated on this
     render; this is the other half of the same sentence.

     TWO GUARDS, ONE INVARIANT, AND THAT IS ON PURPOSE. „No finger, no
     announcement" is stated by the ownership check here AND by the release
     edges clearing `driveAxisRef`. Either alone is sufficient today — measured
     by mutation, removing one leaves the suite green — so this is redundancy,
     not two thirds of a rule. It is kept because the failure it prevents is a
     pad announcing a pedal nobody is pressing, and a future edit that forgets
     the clear should meet a second wall rather than a student.

     It reads `reverseGesture`, the const from THIS render, and not
     `reverseGestureRef.current`. The two hold the same value the instant the
     effect is scheduled, so no test can tell them apart — but the ref is
     whatever the NEWEST render assigned, and an effect is entitled to describe
     the render it belongs to. */
  useEffect(() => {
    if (drivePad.pointerId === null) return;
    publishAxisAria(drivePadRef.current, driveAxisAria(driveAxisRef.current, reverseGesture));
  }, [reverseGesture, drivePad]);

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
        // AT REST, AND ONLY AT REST — these two are the wheel's honest position
        // before the first press and after every release, and React never
        // re-applies a JSX attribute whose value did not change between
        // renders, so from the first `pointerdown` they belong to
        // `publishAxisAria` (block at `steerAxisAria`). They used to be the
        // whole story, which is what the catalogue row is about: a literal
        // `aria-valuenow={0}` under a declared −100..100 range told a student
        // who cannot see the knob that the wheel was centred at full lock.
        aria-valuenow={0}
        aria-valuetext={STEER_ARIA_CENTRE_TEXT}
        onPointerDown={onSteerDown}
        onPointerMove={onSteerMove}
        onPointerUp={onSteerEnd}
        onPointerCancel={onSteerEnd}
        // The fourth edge — see the block at `onDriveEnd`. `onSteerEnd` is
        // idempotent (`steerPad.release()` answers false the second time), so
        // the `up → lostpointercapture` pair costs one refused release.
        onLostPointerCapture={onSteerEnd}
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
        // THIS PAD IS VERTICAL AND `role="slider"` IS NOT — the role's default
        // orientation is horizontal, so without this line the number published
        // below is announced against the wrong axis: a student is told the
        // control they are pushing UP for throttle runs left-to-right, and
        // every AT that offers a slider a direction offers this one the two
        // that do nothing. Same class of defect as the pinned `aria-valuenow`
        // this block is about (sc-zebra-approach:952e056d) — an accessible
        // description that contradicts the control — and the same one-line
        // shape of fix. The WHEEL needs no counterpart: it is horizontal, which
        // is what the role already assumes.
        aria-orientation="vertical"
        // At rest, and only at rest — see the wheel above. The centre sentence
        // is mode-independent: with no pedal down, R and D feel the same.
        aria-valuenow={0}
        aria-valuetext={DRIVE_ARIA_CENTRE_TEXT}
        onPointerDown={onDriveDown}
        onPointerMove={onDriveMove}
        onPointerUp={onDriveEnd}
        onPointerCancel={onDriveEnd}
        // The fourth edge — see the block at `onDriveEnd`.
        onLostPointerCapture={onDriveEnd}
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

            «Клаксон» → left arc, station 2      109.6 mm → 45 mm (portrait)
            «Кола» ⚙  → right arc, station 0     110.7 mm → 27 mm
            «Колан»   → the same station's face  101.6 mm → 27 mm

          — and with five boxes gone from this strip, the horizontal band a
          horizontal panel could land on stopped existing.

          THE ⚙ ROW ABOVE IS HISTORY AS OF 2026-08-17: sharing that one box is
          what took the dock off the screen entirely whenever the belt was off,
          so «Кола» is now the LEFT arc's own top station and «Колан» keeps
          right station 0 alone. The full measurement is at `ARC_STATIONS_LEFT`.
          Both are still on a flank under a thumb, which is what this table was
          about; the dock trades one station of reach for existing at all. */}
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

      {/* ══ THE WORD UNDER A GLYPH NAMES THE CONTROL'S CLASS, NOT ITS SIDE ═════
          Catalogue sweep 2026-08-17, four rows, and the auditor's own reading of
          the two flanks is the measurement:

            sc-junction-gap/mobile-right/01-arrival.png — «the gear cluster
              Л/З/Д is ghost text on the building facade»
            sc-pk-move-off  · sc-vp-handbrake — «the mobile HUD offers no mirror
              control … of any kind», on the two lessons whose graded core IS
              the mirror check
            sc-park-night — the same column enumerated as «Д/З/Л», unnamed

          Those three letters ARE the three graded mirror glances. Somebody who
          had driven all 195 legs and had every frame in front of him read them
          as a gearbox and then wrote, twice, that the control does not exist.

          COUNTED OFF THE SHIPPED FACES, which is why it happened. The eight
          words on the two flanks were «Ляв · Дясн · Клакс · Кола | Колан · Дясн
          · Задн · Ляво». «ДЯСН» named two different controls on two flanks and
          so did «ЛЯВ/ЛЯВО»; «ЗАДН» is the Bulgarian selector word for reverse
          and it stood three rows from a cluster reading «D»; and the word
          «огледало» — the noun both lessons grade — appeared in ZERO pixels of
          visible ink, only inside `aria-label`, where an eye cannot reach it.
          Four faces, two meanings, and the two flanks shared a vocabulary.

          SO THE CAPTION CARRIES THE CLASS AND THE GLYPH CARRIES THE SIDE. «⇦ /
          ⇨» and «Л / З / Д» are unambiguous about WHICH; nothing was unambiguous
          about WHAT. The two rails now share no word at all, and neither word is
          a gear.

          THE SIDE IS NOT LOST AND IT MUST NOT BE FAKED. The full sentence stays
          in `labelBg` («Мигач наляво», «Поглед в дясното огледало») for the
          screen reader, and the glyph is the sighted student's — a mirror button
          that merely SAID «оглед» would be claiming the whole procedure, and the
          procedure is mirror AND a look over the shoulder into the blind spot.
          There is no shoulder-check station to claim: `MirrorGlanceKind` is
          `"left" | "right" | "rear"` and stops there (scene/cabin.ts), which is
          the other half of those two rows and is not this file's to close.

          AND THE ADDRESS, so the third lane to be sent here stops at the door.
          sc-pk-move-off:6aa68f53 (critical) and sc-vp-handbrake:20bf57db both
          name this file. A station is 20 lines of JSX; the capability it would
          have to call does not exist anywhere in the product, so a «РАМО» cell
          added here would be a button wired to nothing — the dead-predicate
          class, filed as a repair. What has to move first, in order:
            · `modules/sim/scene/cabin.ts:22` — `MirrorGlanceKind`, and the
              `GlanceState` machine at :422 that starts/ends/updates one;
            · `components/sim/CameraRig.tsx:290` — `GLANCE_OFFSETS`, a
              `Record<MirrorGlanceKind, …>`, so a new kind must be given a yaw
              and a pitch or the camera cannot perform the look;
            · `modules/sim/engine/glanceView.ts:54` — the structurally identical
              twin that must stay assignable;
            · the A2 procedure observer, which is what makes the glance GRADED
              rather than a camera trick — and grading is the whole of both rows
              („the graded blind-spot step cannot be performed").
          `modules/sim/engine/reverseView.ts:57` already states the same gap
          from the other side: „a student who wants to look over his shoulder on
          demand has no button for it — the shoulder check is automatic-on-R
          only". Two files now say it; neither of them is this one.

          WIDTH, MEASURED RATHER THAN HOPED. A station is `TOUCH_MIN_PX` = 44 px
          and `FLANK_LANE_PX` = 8 + 44 + 8 keeps a further 8 px clear on each
          side of it, so a caption has 60 px before it reaches any other surface.
          «ОГЛЕДАЛО» is the longest new face: 8 uppercase Cyrillic glyphs at
          `text-[8px] tracking-tight`, ≈ 5.2 px each ⇒ ≈ 42 px. It is
          `whitespace-nowrap` so it can only ever overflow CENTRED into that
          gutter, never wrap into a second line that would move the glyph.

          ══ LEFT FLANK ═ BOTH INDICATORS AND THE HORN, on the steering thumb ══
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
      <FlankGhost side="left" padH={STEER_PAD_H} stations={ARC_STATIONS_LEFT} />
      <ArcStation index={0} padH={STEER_PAD_H} side="left">
        <GlyphButton
          labelBg="Мигач наляво"
          captionBg="Мигач"
          active={snap?.indicator === "left"}
          onClick={() => cabin()?.indicateLeft()}
        >
          ⇦
        </GlyphButton>
      </ArcStation>
      <ArcStation index={1} padH={STEER_PAD_H} side="left">
        <GlyphButton
          labelBg="Мигач надясно"
          captionBg="Мигач"
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

      {/* ══ THE ⚙ DOCK, AND IT IS ON THE SCREEN UNCONDITIONALLY ═════════════
          Doc 91 §I, PART C of the 2026-08-17 catalogue sweep. The whole
          argument — what was measured, why the dock moved rather than the
          belt, and why this is the top station — is at `ARC_STATIONS_LEFT`.

          The one thing to keep in mind while editing here: this button is the
          ONLY door to the lights, the wipers, the fog lamps, the engine, the
          handbrake and the gear lever. Anything that can make it conditional —
          a state, a tier, a lesson flag — takes those seven controls with it,
          and the four lessons named at `ARC_STATIONS_LEFT` become unplayable
          again. `touchDock.test.tsx` fails on any such condition. */}
      <ArcStation index={3} padH={STEER_PAD_H} side="left">
        <GlyphButton
          labelBg="Контроли на автомобила"
          captionBg="Кола"
          active={sheetOpen}
          onClick={() => setSheetOpen((o) => !o)}
        >
          ⚙
        </GlyphButton>
      </ArcStation>

      {/* ══ RIGHT FLANK ═ THE DOCK, THEN THE THREE GRADED MIRROR GLANCES ═════
          Lifting off the throttle to check a mirror is what a driver does, so
          the interaction cost teaches the right habit instead of fighting it.
          Words again: «Л З Д» is three letters a 17-year-old has no way to
          decode, and these are scored A2 steps.

          THAT SENTENCE STOOD HERE WHILE THE FACES READ «ДЯСН · ЗАДН · ЛЯВО» —
          i.e. the file named the defect and then shipped it, and the words it
          shipped were the gearbox's. The caption is «ОГЛЕДАЛО» on all three now
          and the letter is only the side; the block above the left flank has the
          sweep rows, the face census and the width arithmetic.

          ══ STATION 0 — THE NEAREST BOX ON THE SCREEN — IS THE BELT ══════════

          That one move is the largest measured win in the 2026-08-12 wave.
          «Закопчай предпазния колан» was 70.4 mm away sideways and 101.6 mm
          upright, in a rail no thumb reaches — and it was buried by the
          expanded instruction panel on 6 of 6 profiles, so the card telling a
          student to fasten the belt was standing on the button that fastens it.
          Here it is ~25 mm and it is the only red thing on the screen.

          IT NO LONGER SHARES THE BOX WITH THE ⚙ DOCK — 2026-08-17, PART C. The
          dock is left station 3 now and is on the screen unconditionally; the
          measurement that forced the split, and the reason the DOCK moved
          rather than the belt (`PlayAreaStyles.tsx` pins the belt's fill,
          hairline and pulse to `[data-arc="0"][data-arc-side="right"]`, and
          this change does not own that file), are both at `ARC_STATIONS_LEFT`.
          The note that used to be here argued the sharing was safe because
          `procedures/steps.ts` puts the belt before every dock control — seat →
          mirrors → surroundings → BELT → dashboard → lights → engine → brake →
          gear → handbrake. That is still true. It is an answer about ORDER, and
          the defect was about EXISTENCE.

          SO THIS STATION IS EMPTY ONCE THE BELT IS ON, and the ghost behind it
          is still drawn for four stations: the band's silhouette must not
          change height under a thumb the instant the student buckles up —
          „elements moving" is the founder's own complaint — and the three
          mirrors are indexed from the BOTTOM, so they hold their rects either
          way.

          Lowest = the belt, then the right mirror (nearest that thumb), the
          rear, and the left at the top. */}
      <FlankGhost side="right" padH={DRIVE_PAD_H} stations={ARC_STATIONS_RIGHT} />
      {snap !== null && !snap.seatbeltOn ? (
        <ArcStation index={0} padH={DRIVE_PAD_H} side="right">
          {/* THE ONE FILLED SURFACE ON THIS SCREEN GETS THE ONE OPAQUE GROUND —
              catalogue row sc-junction-gap:e87d5be1, 2026-08-27. See the block
              at `WarningPlate` for the measurement; it is the only station that
              needs one, because it is the only station that is a DISC. */}
          <WarningPlate />
          <GlyphButton
            labelBg="Закопчай предпазния колан"
            captionBg="Колан"
            tone="danger"
            active
            onClick={() => cabin()?.toggleSeatbelt()}
          >
            ⚠
          </GlyphButton>
        </ArcStation>
      ) : null}
      {/* ══ …AND THE SAME BOX IS THE BEAM ONCE THE BELT IS ON ════════════════
          sc-ac-night-lights:ebeb0e44 („no СВЕТЛИНИ control or indicator
          anywhere on the mobile glass, on a lesson whose instruction 1 is to
          turn on the dipped beams") and sc-ac-highbeam-lead:b0ee7eff.

          WHAT THE FRAMES SHOW, and it is why this is not a taste change.
          `.audit-frames/w14/frames/sc-ac-night-lights__mobile-right/04-t007s
          .png` and `…/sc-ac-highbeam-lead__mobile-wrong/04-t016s.png`: the
          phone's whole furniture is «Меню · Изглед · Пауза», «Кола · Клакс ·
          Мигач · Мигач» and «Л · З · Д ОГЛЕДАЛО» — and RIGHT STATION 0 IS
          EMPTY for the entire drive, because the w12+ harness fastens the belt
          in the first seconds. The beam state was nowhere on either frame. The
          PC leg of the same lesson (`…__pc-right/04-t006s.png`) prints a full
          ДВИГАТЕЛ · КОЛАН · СВЕТЛИНИ · МЪГЛА · ЧИСТАЧКИ · РЪЧНА · АВАР. strip
          along the dash. A student on a phone could not see the state of the
          thing the lesson is about.

          THIS IS NOT A FIFTH STATION AND IT COSTS NO GEOMETRY. That is the
          whole reason it can land in this file at all. `ARC_STATIONS_RIGHT` is
          already 4, `FlankGhost` already paints four boxes, and
          `arcStationRectPx("right", 0)` already reserves this rect — the
          previous note here argued (correctly) that a FIFTH station does not
          fit on any profile in `touchArc.test.ts`'s ladder. Nothing here adds
          one. It fills a box the band has been drawing empty.

          AND IT IS ON THE GLASS ESSENTIALLY ALWAYS, counted rather than hoped.
          The harness prints the visible control set at every beat; over the
          five w14 mobile-right legs this lane re-drove — sc-vp-handbrake,
          sc-ac-night-lights, sc-junction-gap, sc-ov-oncoming-gap,
          sc-sig-controller-live — 274 of 284 censuses carry NO «⚠Колан», i.e.
          station 0 is free in 96.5 % of the beats and the belt owns it for
          exactly two beats a leg, at the start.

          WHY GATING ON THE BELT IS NOT THE 2026-08-17 DOCK DEFECT REBUILT.
          That defect was that the ONLY door to seven controls disappeared
          while the belt was off. The ⚙ dock is unconditional and still is
          (`touchDock.test.tsx` §3 pins it), so the lights keep a door that
          never closes; this is a SECOND, nearer door plus the state readout,
          and it appears exactly where the taught order puts it —
          `procedures/steps.ts` runs seat → mirrors → surroundings → BELT →
          dashboard → LIGHTS → engine, so the belt is done before the lights
          step is reached. A student who has not buckled up is being asked for
          the belt, and the belt owns the box while it is.

          ONE CONTROL PER STATION, AND THE TWO BRANCHES ARE EXCLUSIVE — they
          are separate blocks rather than one ternary so the belt's own JSX
          stays the FIRST `<ArcStation index={0} … side="right">` in this file,
          which is the anchor `touchDock.test.tsx` §3/§3d slice from.

          TAPPABLE, NOT ONLY READABLE, and the same `cycleHeadlights()`
          (scene/cabin.ts:673) the L key and the cockpit stalk hotspot call —
          off → къси → дълги → off. A 44 px box on the flank that only reported
          would be the one control-shaped thing on this screen that answers a
          thumb with nothing. The interaction cost is the mirrors' own and it
          teaches the same habit: changing beams is worth lifting off. */}
      {snap !== null && snap.seatbeltOn ? (
        <ArcStation index={0} padH={DRIVE_PAD_H} side="right">
          <GlyphButton
            labelBg={beamLabelBg(beam)}
            captionBg={beamFaceBg(beam)}
            tone={beamTone(beam)}
            active={beam !== "off"}
            onClick={() => cabin()?.cycleHeadlights()}
          >
            {/* CONSTANT ON PURPOSE. The caption carries the state and the mark
                carries the class, which is the flank's own grammar one level
                over (the block above the left flank: „the caption carries the
                CLASS and the glyph carries the SIDE" — here there is no side,
                so the two swap roles and the ARGUMENT is preserved: exactly one
                of the two changes with state, so the control never changes
                identity under a thumb reaching for it). «≡» is the beam mark
                and it collides with nothing on either flank — ⇦ ⇨ ⊙ ⚙ ⚠ Д З Л
                are the eight faces in use. */}
            ≡
          </GlyphButton>
        </ArcStation>
      ) : null}
      <ArcStation index={1} padH={DRIVE_PAD_H} side="right">
        <GlyphButton
          labelBg="Поглед в дясното огледало"
          captionBg="Огледало"
          onClick={() => cabin()?.glance("right")}
        >
          Д
        </GlyphButton>
      </ArcStation>
      <ArcStation index={2} padH={DRIVE_PAD_H} side="right">
        <GlyphButton
          labelBg="Поглед в огледалото за задно виждане"
          captionBg="Огледало"
          onClick={() => cabin()?.glance("rear")}
        >
          З
        </GlyphButton>
      </ArcStation>
      <ArcStation index={3} padH={DRIVE_PAD_H} side="right">
        <GlyphButton
          labelBg="Поглед в лявото огледало"
          captionBg="Огледало"
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
            // ── THE LANES, 2026-08-14 ────────────────────────────────────────
            // It used to run edge to edge at `0.125rem`, and the comment above
            // it claimed clearance it did not have — this file already carried
            // the correction. With the arcs replaced by BANDS the claim is not
            // even arguable: a band is 132–176 px tall and this strip hangs at
            // `TOUCH_CONTROLS_FLOOR`, which is INSIDE that span on every
            // profile (iPhone 16 sideways: strip y 92–136, band y 44–220). So
            // the clearance is horizontal now and it is structural — the strip
            // simply stops where each band's lane begins, 8 px short of it.
            // Landscape leaves it 732 px of a 852 px stage (16 cells in a row,
            // it needs 13); portrait 273 px, i.e. the three rows it already
            // folded into.
            left: FLANK_LANE_LEFT_CSS,
            right: FLANK_LANE_RIGHT_CSS,
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
          {/* ══ THE LIGHTS ARE HERE — AND SO IS THE TELLTALE NOW ════════════
              2026-08-27, rows sc-ac-night-lights:ebeb0e44 and
              sc-ac-highbeam-lead:b0ee7eff („no СВЕТЛИНИ control or indicator
              anywhere on the mobile glass"). Both halves are answered in this
              file now; the reasoning below is kept because two thirds of it is
              still load-bearing and because the paragraph that WAS wrong is
              more useful corrected than deleted.

              THE CONTROL EXISTS AND IS ONE TAP DEEP. This cell's face is the
              live beam state («СВЕТЛ» / «КЪСИ» / «ДЪЛГИ») and its handler is
              the same `cycleHeadlights()` the cockpit hotspot and the L key
              call. Its door — the ⚙ dock — is on the glass unconditionally
              (see `ARC_STATIONS_LEFT`, and every mobile run.log in the w11
              sweep carries «⚙Кола» in its control census, 78 beats of
              sc-ac-night-lights included). The row's „the shared settings
              sheet has no lights entry either" is measurable and false. What
              IS true is that no drive in that sweep ever tapped the dock, and
              that a log grep for «СВЕТЛИНИ» cannot match a cell whose face is
              «СВЕТЛ» — which is how a present control was read as absent.

              ⚠ THE PARAGRAPH THAT USED TO STAND HERE — „THE TELLTALE DOES NOT
              EXIST, AND IT IS TWO FILES AWAY" — WAS TRUE ABOUT THOSE TWO FILES
              AND WRONG ABOUT THE CONCLUSION IT DREW. Both are still true as
              facts and both are still worth fixing:
                · `modules/sim/hud/StatusDashboard.tsx` — the `compact` branch
                  drops „both blinker arrows, the seatbelt, headlight, fog,
                  wiper, parking-brake and hazard telltales" on the stated
                  premise that „the car already lights [them]";
                · `modules/sim/cockpit/clusterLayout.ts:LAMP_KEYS` — the car
                  lights eight lamps (arrowLeft, belt, brake, engine, oil,
                  battery, temp, arrowRight) and NONE of them is a beam lamp;
                  `clusterReadout.ts`'s `ClusterInputs` carries no headlight
                  channel to light one with.
              …so the cabin premise IS false. But „neither file is this one"
              did not follow: the overlay already reserves a 44 px box that it
              paints EMPTY on every phone drive from the moment the belt goes
              on, and a state the student must read belongs in it. The station
              is at right index 0 (above), it changes no geometry, and it
              leaves both cabin gaps exactly where they were for whoever owns
              them.

              WHAT REMAINS TRUE ABOUT WHERE IT COULD NOT GO, in the ladder's own
              numbers (`touchArc.test.ts`'s LADDER). A fifth station makes the
              band `insetB + padH + ARC_LIFT + 44·4 + 44`:
                iphone16-landscape 852×393  21 + 136 + 0 + 220 = 377 of 393 →
                  the top box lands 16 px from the top edge;
                small-landscape   780×360    0 + 136 + 0 + 220 = 356 of 360 → 4 px.
              And a third top-rail WORD wraps the rail onto a second row in
              portrait (~167 px between «Меню» and the column against ~176 px of
              button), past the single row `TOP_RAIL_ROW_CSS` promises to every
              surface that has to clear this corridor. Both are geometry
              changes that need the six-profile browser sweep this lane cannot
              run, and neither was taken.

              …AND THE THIRD OBJECTION, ANSWERED WITH A NEWER SWEEP. It ran:
              „gating the lights on the belt is the 2026-08-17 dock defect
              rebuilt — the w11 night-lights drive carries «⚠Колан» in all 78
              of its control censuses, so a cell behind it would not have
              appeared in one frame of the lesson it is for." That was a
              measurement of a HARNESS, not of the product: w11's driver never
              pressed KeyB, and the w12+ one does (`lesson-audit.mjs`, „KeyB is
              the binding"). On w14 the belt is on within seconds and right
              station 0 is empty for the whole of both light lessons — which is
              the frame this repair was written against. The dock-defect
              objection still holds for a DOOR and this is not one: the ⚙ dock
              never closes, so nothing here can make the lights unreachable. */}
          <SheetCell
            textBg={beamFaceBg(beam)}
            labelBg={beamLabelBg(beam)}
            tone={beamTone(beam)}
            active={beam !== "off"}
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
    // `data-arc` / `data-arc-side` ARE THE INSTRUMENT'S HANDLE, and they are in
    // the shipped markup on purpose. Every sweep before wave 12 had to GUESS
    // which boxes were stations — the first run of `wave12-flanks.mjs` matched
    // on shape and reported a fourth left station reading «ИзгледПауза», which
    // is the top rail. A layout that can be read off the DOM is a layout whose
    // claims can be checked by somebody who has not read this file.
    <div
      data-arc={index}
      data-arc-side={side}
      className="absolute flex items-center"
      style={{ bottom, height: ROW_H, ...from }}
    >
      {children}
    </div>
  );
}

/**
 * THE GHOST BAND — the ink that makes three controls read as ONE RAIL.
 *
 * Doc 91 §H asks for „ghost fill + word, not a bare glyph", and this is the
 * fill half. Until now every station was a fully transparent 44 px box with a
 * 15 px glyph in it, so what the founder's eye received was three or four
 * unrelated marks floating over a moving street — his word for it was DEBRIS,
 * and the geometry fix alone does not answer that: boxes in a column with
 * nothing behind them are still boxes with nothing behind them.
 *
 * It is a GRADIENT and not a slab, and the direction is the argument: strongest
 * against the glass, 0 at the inboard edge. That reads as an edge rail rather
 * than as a panel laid on the road.
 *
 * No `backdrop-filter`, deliberately: doc 91 §I20/§D12d priced a blur over a
 * live WebGL canvas and it is among the most expensive things a phone
 * compositor can be asked for. A flat gradient is free.
 *
 * ── THE RAMP RAN ACROSS THE CONTROL, WHICH IS THE SAME AS NO RAMP AT ALL ────
 * 2026-08-27, catalogue rows sc-junction-gap:7c020096 / :e87d5be1 / :3c4f9a27.
 *
 * The sentence above used to end „…and it puts the density where the eye needs
 * it — the outer half of each glyph — for a fraction of a slab's ink." Both
 * halves of that were wrong about this code. The band is `ARC_EDGE` (8) +
 * `ROW_H` (44) = 52 px wide, and the STATION BOX starts at 8 and runs to 52 —
 * so the ramp's strong end was spent entirely on the 8 px gutter OUTBOARD of
 * the control, and the whole caption stood on the tail. There is no „outer half
 * of the glyph" in a 52 px band whose last 44 px are the glyph.
 *
 * MEASURED, and it needs no browser: the ghost's own TOP EDGE is a horizontal
 * line with the same building wall above it and below it, so one subtraction
 * reads the alpha off a shipped frame. `.audit-frames/w11/frames/
 * sc-crossing-bus-shadow__mobile-right/03-ready.png`, iPhone 16 landscape,
 * DPR 3, edge at device y 179, luminance above → below:
 *
 *   device x 178   the band's OUTER edge (0 px; that is the safe-area inset,
 *                  not the physical glass)             85.5 → 52.4    α 0.39
 *   device x 202   the station box's OUTER edge       86.2 → 60.4    α 0.30
 *   device x 240…290  the caption «МИГАЧ» itself      83.6 → 63.5    α 0.13–0.24
 *   device x 330   the inboard edge                   82.9 → 81.4    α 0.02
 *
 * against the α 0.78 the PC's own keyboard panel achieves on the same wave
 * (srgb(29,32,35) inside it vs srgb(134,132,126) on the same facade band). A
 * caption standing on 0.17 of black is a caption standing on a parked car, and
 * that is exactly what the three rows above photographed: a yellow car's door
 * line through «Д ОГЛЕДАЛО», its wheel arch through the red «КОЛАН» disc.
 *
 * SO THE PLATEAU IS THE FIX, AND IT IS STATED IN THE BAND'S OWN LENGTHS rather
 * than in percentages, because the two ends of this gradient are not decorative
 * positions — they are `ARC_EDGE` and `ROW_H`, the same two constants
 * `arcStation()` builds the box out of. Written as percentages they would
 * silently stop lining up with the control the day either one moves:
 *
 *   0 px                       α 0 — feathered in, so the OUTBOARD edge cannot
 *                              become a hard black rule floating in the road
 *   ARC_EDGE (8 px)            α EDGE 0.88 — the station box starts here
 *   8 + 44 − FEATHER (46 px)   α INBOARD 0.72 — still under the caption
 *   52 px (100 %)              α 0 — the inner feather, 6 px
 *
 * so every column the glyph and the caption stand on is 0.72–0.88, i.e. at or
 * past the PC panel's 0.78, and NEITHER edge of the fill is a step. That second
 * half is not cosmetics: a first pass at this repair used one hard-edged ramp,
 * and composited over the shipped frame it put a 0.88 black rule down the road
 * 59 px inboard of the glass — the safe-area inset the band is offset by — which
 * is a worse surface than the one it replaced. Feather both ends and the fill
 * reads as a shadow under the rail, which is what „ghost fill" meant.
 *
 * WHAT THIS COSTS THE ROAD: NOTHING, and that is the project's own arithmetic,
 * not a plea. „Any pixel a control paints on is NOT road, translucent or not"
 * (the rule at the top of this file) means this 52 × 176 rect per flank has
 * been fully charged since the day it was drawn. The rect is untouched here —
 * same `width` (so `touchArc.test.ts`'s „a band is edge + 44 wide, full stop"
 * stays true of the PAINT and not only of the hit boxes), same `height`
 * (`touchDock.test.tsx` pins that string), same `bottom`, same radii. Only the
 * alpha profile moves.
 *
 * AND THE GEOMETRY CLAIM IN :3c4f9a27 IS REFUTED, not repaired. That row reads
 * „the two МИГАЧ controls got none [no plate]". They have one: the measurement
 * above puts the ghost's top edge at device y 179 = CSS 59.7 from the top, and
 * `bottom + height` = (0 + 136 + 0 + 21) + (44·3 + 44) = 333 CSS off the bottom
 * of a 393 CSS stage = 60.0 from the top. The band IS the four stations' own
 * column, top to bottom, on both flanks — `stations` has been 4 on each side
 * since the dock moved. What the frame shows under the two indicators is an
 * A-pillar that is already near-black, where 0.17 of black adds nothing an eye
 * can find. Weak, not absent; the plateau fixes the same symptom either way.
 */
/** Alpha at the station box's outer edge, and at its far side. Both ends of the
 *  fill run out to 0 across `FLANK_GHOST_FEATHER_PX`, so it has no step. */
const FLANK_GHOST_ALPHA_EDGE = 0.88;
const FLANK_GHOST_ALPHA_INBOARD = 0.72;
/** The inner run-out, px. It eats the caption's last ~4 px of the 42 px
 *  «ОГЛЕДАЛО» sets, which is the whole price of not having a hard edge. */
const FLANK_GHOST_FEATHER_PX = 6;
function FlankGhost({
  side,
  padH,
  stations,
}: {
  side: "left" | "right";
  padH: string;
  stations: number;
}) {
  const bottom = `calc(${BAND_LIFT} + ${padH} + ${ARC_LIFT} + ${INSET_B})`;
  const height = `calc(${ARC_PITCH} * ${stations - 1} + ${ROW_H})`;
  const edge = side === "left" ? INSET_L : INSET_R;
  const from = side === "left" ? { left: edge } : { right: edge };
  return (
    <div
      aria-hidden
      data-flank-ghost={side}
      className="pointer-events-none absolute"
      style={{
        bottom,
        height,
        width: `calc(${rem(ARC_EDGE_PX)} + ${ROW_H})`,
        ...from,
        background:
          `linear-gradient(to ${side === "left" ? "right" : "left"}, ` +
          `rgba(0,0,0,0) 0px, ` +
          `rgba(0,0,0,${FLANK_GHOST_ALPHA_EDGE}) ${rem(ARC_EDGE_PX)}, ` +
          `rgba(0,0,0,${FLANK_GHOST_ALPHA_INBOARD}) calc(${rem(ARC_EDGE_PX)} + ${ROW_H} - ${rem(
            FLANK_GHOST_FEATHER_PX,
          )}), ` +
          `rgba(0,0,0,0) 100%)`,
        [side === "left" ? "borderTopRightRadius" : "borderTopLeftRadius"]: "0.75rem",
        [side === "left" ? "borderBottomRightRadius" : "borderBottomLeftRadius"]: "0.75rem",
      }}
    />
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BELT DISC WAS A WINDOW — sc-junction-gap:e87d5be1, 2026-08-27.
 *
 * „Unlike the Л/З/Д stack beside it, the КОЛАН warning disc has no backing
 *  plate of its own — it is a translucent red circle floating directly on
 *  world geometry, and on this frame the geometry under it is a parked yellow
 *  car."
 *
 * THE FRAME IS RIGHT, AND THE GHOST BAND ABOVE IS NOT THE ANSWER.
 *
 *   · `FlankGhost` DOES reach this station, by construction and not by luck:
 *     the band's `bottom` is `arcStation(0, …).bottom` term for term, and its
 *     `height` is `ARC_PITCH · (4 − 1) + ROW_H`, i.e. station 0's box to
 *     station 3's top. Nothing here is missing a plate for want of geometry.
 *   · IT IS STILL A WINDOW, because a gradient is not a ground. The band's
 *     plateau is α 0.72–0.88 and the disc's own fill is `color-mix(danger
 *     20 %, transparent)` pulsing to 42 % (PlayAreaStyles, the belt rule).
 *     Composite them and 12–28 % of the world survives the black, ~70 % of
 *     THAT survives the red.
 *
 * MEASURED on `.audit-frames/w12/frames/sc-junction-gap__mobile-right/
 * 01-arrival.png` (2556 × 1179, iPhone 16 landscape, DPR 3), which is the row's
 * own evidence frame. Outside the disc the parked car reads srgb(113, 90, 37)
 * where its body is lit and near-black where its glass is — ~100 levels of
 * contrast. INSIDE the disc, sampling two rows clear of the ⚠ glyph, the
 * «КОЛАН» caption and the border ring (device y 570 and y 620, x 2245 → 2330),
 * the red returns 42 … 64: a 10–22 level swing that tracks the car's window and
 * panel edges. That is ~11–20 % of the scene's contrast landing inside a
 * WARNING, and at 2.2× the door line and the window rectangle are unmistakable
 * — which is exactly what the row photographed.
 *
 * SO THE FIX IS A GROUND, NOT A DARKER GRADIENT. Raising the ghost's alpha
 * would pay for one control by pushing three captions' worth of band toward a
 * black slab down the edge of the road — the thing the plateau block above
 * spent a whole round NOT doing. This station is the only one on either flank
 * that is a FILLED shape rather than a glyph on a halo, so it is the only one
 * that reads as a surface, and a surface you can see a car through is not a
 * surface. It gets its own opaque disc, exactly its own 44 px box, and nothing
 * else on the flank changes.
 *
 * WHY BLACK AND NOT DANGER RED: the ink is the flank register's own
 * (`FlankGhost` is `rgba(0,0,0,α)`), so composited under the 20–42 % danger
 * fill the disc arrives at the same deep maroon the frames already show —
 * the founder's „the reddest thing on the screen" is untouched, minus the
 * world behind it. A solid red plate would also have made the `--danger`
 * caption «КОЛАН» unreadable on its own ground.
 *
 * `zIndex: -1` rather than a stacking order the button has to opt into: the
 * plate must sit UNDER the button's fill, its border, its glyph and its
 * caption, and `[data-hud="touch-controls"]` is `absolute z-10`, i.e. a
 * stacking context of its own — so a negative index can only ever fall to the
 * back of THIS overlay and never behind the canvas. `pointer-events-none` and
 * `aria-hidden` keep it out of both the hit test and the a11y tree: the
 * station's target is still the 44 px button and nothing else.
 *
 * LIVE, AND SAY WHERE: `LessonScene` mounts `TouchControls` on
 * `hasTouchScreen()`, and this station renders on `!snap.seatbeltOn` — i.e.
 * on every phone drive from the moment the scene loads until the student
 * buckles up, which is the whole of the pre-drive checklist every lesson
 * opens with. NOTE for whoever re-drives it: the w12+ harness now fastens the
 * belt, so a sweep leg will photograph this disc only before that step.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const WARNING_PLATE_INK = "rgb(0, 0, 0)";
function WarningPlate() {
  return (
    <span
      aria-hidden
      data-warning-plate=""
      className="pointer-events-none absolute inset-0 rounded-full"
      style={{ backgroundColor: WARNING_PLATE_INK, zIndex: -1 }}
    />
  );
}

const GLYPH_SHADOW = "0 1px 3px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.6)";

/**
 * The word under a glyph, in ONE place — `GlyphButton` and `GlyphHoldButton`
 * carried this string twice and the horn is the only member of the second
 * family, so a caption change made for the rail was a coin-flip on whether
 * «КЛАКС» came with it.
 *
 * `whitespace-nowrap` is the part with an argument behind it. The longest face
 * is now the eight-letter «ОГЛЕДАЛО» in a 44 px box (the block above the left
 * flank has the arithmetic: ≈ 42 px of type, with `FLANK_LANE_PX` keeping a
 * further 8 px clear each side). A wrap would push the 15 px glyph up out of the
 * station's vertical centre and move a control under a thumb already reaching
 * for it — the founder's own „elements moving" — where an overflow is centred,
 * stays inside that gutter and moves nothing.
 */
const CAPTION_CLASS =
  "whitespace-nowrap text-[8px] font-bold uppercase leading-none tracking-tight";

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
        <span aria-hidden className={CAPTION_CLASS}>
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
        <span aria-hidden className={CAPTION_CLASS}>
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
