/**
 * THE COCKPIT DOOR-MIRROR WINDOWS — founder item 45, the half that was never
 * built.
 *
 * His words, verbatim from the hand-written review:
 *
 *   «when the user clicks Q or E or whatever button we have for side rear
 *    windows view, we must pop some Small window on the screen on the right
 *    side if he press right and on the left side if he press left, which small
 *    window will be rear view window showing whats happening behind, as well
 *    because small Dashboard window not more than 10% of the screen must be
 *    added because currently I cant see whats happening behind.»
 *
 * WHAT WAS ACTUALLY TRUE BEFORE THIS FILE (checked, not assumed):
 *
 *  · `scene/chaseRearView.ts` + `CameraRig` built this for the CHASE camera and
 *    it works: a persistent centre mirror, and Q/E slide a full-size window to
 *    the glanced side. `CameraRig.tsx:722` reads
 *    `mode === "chase" ? (heldSide ?? "rear") : null` — the window is **null in
 *    every other camera**. In the COCKPIT camera, Q and E have only ever yawed
 *    the head (`GLANCE_OFFSETS`, `cabin.ts` CABIN_KEYS glanceLeft/glanceRight).
 *
 *  · What that head turn lands on is the GLB door glass, and
 *    `vitok/MirrorRig.tsx:289` `activeKindsFor()` returns `["rear"]` for BOTH
 *    `medium` and `low`, while `lesson-ui/QualityPresetSelector.tsx:17` makes
 *    `medium` the default. So on the preset almost everybody plays, turning your
 *    head toward a door mirror shows authored dark gloss — nothing. That is his
 *    „I press E but nothing much is seen", and it is why this window renders its
 *    OWN pass from the door-mirror vantage instead of sampling MirrorRig's glass
 *    target: the window then works identically on low, medium and high, and it
 *    does not depend on a budget decision that belongs to the glass.
 *
 * WHAT THIS FILE IS. The pure geometry, split out from the rig exactly the way
 * `chaseRearView.ts` is, so „not more than 10% of the screen" is a unit test and
 * not a promise. `doorMirrorRect` CLAMPS to the ceiling rather than trusting the
 * authored numbers to stay under it at every window shape — the chase window's
 * portrait case sits at 9.0 % by arithmetic, one authoring tweak from breaking
 * a contract the founder stated in a number.
 *
 * GRADING IS UNTOUCHED. Like every other mirror surface in this sim, the window
 * is visual truth only: the graded mirror-check signal is still the Q/E press
 * latched by `CabinControls.glance()`. What changes is that the graded press now
 * SHOWS the student something — the founder's glance-payoff law. A student who
 * is told to check his mirror and is shown dark gloss learns to press a key; a
 * student shown the lane beside him learns to check his mirror.
 */

/** Which door mirror is being looked through — and therefore which side of the
 *  screen the window sits on. Q → left, E → right, exactly as he wrote it. */
export type DoorMirrorSide = "left" | "right";

/**
 * Hard contract from item 45, stated by him as a number: the window may never
 * occupy more than a tenth of the screen. Asserted over a sweep of aspect
 * ratios from portrait phone to 21:9 in `cockpitDoorMirror.test.ts`.
 */
export const DOOR_MIRROR_MAX_SCREEN_FRACTION = 0.1;

/**
 * The authored size, before the ceiling clamp: window height as a fraction of
 * viewport height, and its PIXEL aspect ratio.
 *
 * 0.27 × 1.6 lands at 6.6 % of a 16:9 screen (≈389×243 px at 1440×900) and
 * 8.8 % at 4:3 — deliberately most of the budget he allowed rather than a
 * timid sliver, because the complaint being answered is literally „I cant see
 * whats happening behind". The 1.6:1 pixel aspect matches the render target
 * below one-to-one, so nothing is resampled or squeezed.
 */
export const DOOR_MIRROR_HEIGHT_FRACTION = 0.27;
export const DOOR_MIRROR_PIXEL_ASPECT = 1.6;

/** Gap from the viewport edge, as a fraction of viewport height (the same unit
 *  chaseRearView uses, so the two instruments share one visual rhythm). */
export const DOOR_MIRROR_MARGIN_FRACTION = 0.035;

/**
 * Vertical centre of the window in NDC (+y up) — below the middle of the frame.
 *
 * WHY NOT THE TOP, which is where the chase window lives: the window is a quad
 * INSIDE the WebGL canvas and every HUD card is DOM painted over that canvas, so
 * a scene instrument and a DOM panel cannot negotiate — one simply covers the
 * other. That is rows B74/B76, where the „Клавиши" legend covered 60 % of the
 * chase Q window and the toast card half of the E one. The fix there was to move
 * the HUD; the fix here is to put the window where no HUD is, so no other lane's
 * stylesheet has to change and nothing can drift over it later.
 *
 * WHY THIS FAR DOWN, measured rather than assumed. The first render of this
 * window (1440×900, /dev/ghost-demo, cockpit) put it at −0.08 and the „Клавиши"
 * legend — `controls-help`, which is not a small chip but a full key table
 * reaching 378 px down a 900 px play area — clipped its top-left corner. So the
 * band is not „the middle": it is BELOW the legend's foot (42 % of height) and
 * ABOVE the touch-control cluster (≈93 %). −0.24 puts the window's top edge at
 * 48.5 % and its foot at 75.5 % on a 16:9 play area, with ~58 px of clearance
 * above and ~150 px below. The centre-bottom demo deck shares that vertical band
 * but never the horizontal one: the window hugs an edge, the deck is centred.
 * Below centre is also simply where a door mirror is — outboard and down.
 */
export const DOOR_MIRROR_CENTER_Y_NDC = -0.24;

/** The window's size as fractions of the viewport. */
export interface DoorMirrorRect {
  /** Width as a fraction of viewport width. */
  widthFraction: number;
  /** Height as a fraction of viewport height. */
  heightFraction: number;
  /** Share of the total screen area — the item-45 contract. */
  screenAreaFraction: number;
}

/**
 * `aspect` = viewport width / height. Width in *pixels* is height ×
 * DOOR_MIRROR_PIXEL_ASPECT, so as a fraction of viewport WIDTH it is divided by
 * the aspect — which means a narrow (portrait) viewport inflates it.
 *
 * Two guards, in order:
 *  1. never wider than 62 % of the viewport (past that an inset stops reading
 *     as a window and becomes a letterbox), and
 *  2. the item-45 ceiling: if the result still exceeds
 *     DOOR_MIRROR_MAX_SCREEN_FRACTION, both dimensions are scaled by
 *     √(max / area) — which preserves the pixel shape exactly while landing
 *     the area ON the ceiling.
 *
 * `scale` (default 1) shrinks the window about its own centre, so it can only
 * ever REDUCE the share; it exists for the open/close ease.
 */
export function doorMirrorRect(aspect: number, scale = 1): DoorMirrorRect {
  const a = Number.isFinite(aspect) && aspect > 0.2 ? aspect : 1;
  const s = Number.isFinite(scale) && scale > 0 ? Math.min(1, scale) : 1;
  let heightFraction = DOOR_MIRROR_HEIGHT_FRACTION * s;
  let widthFraction = (heightFraction * DOOR_MIRROR_PIXEL_ASPECT) / a;

  const MAX_WIDTH_FRACTION = 0.62 * s;
  if (widthFraction > MAX_WIDTH_FRACTION) {
    const shrink = MAX_WIDTH_FRACTION / widthFraction;
    widthFraction = MAX_WIDTH_FRACTION;
    heightFraction *= shrink;
  }

  const area = widthFraction * heightFraction;
  if (area > DOOR_MIRROR_MAX_SCREEN_FRACTION) {
    const shrink = Math.sqrt(DOOR_MIRROR_MAX_SCREEN_FRACTION / area);
    widthFraction *= shrink;
    heightFraction *= shrink;
  }

  return {
    widthFraction,
    heightFraction,
    screenAreaFraction: widthFraction * heightFraction,
  };
}

/**
 * Where the window's CENTRE sits, in normalised device coordinates
 * (x, y ∈ [-1, 1], +x right, +y up).
 *
 * Item 45 is explicit about the placement and there is nothing to interpret:
 * left glance → left of the screen, right glance → right.
 */
export function doorMirrorCenterNdc(
  side: DoorMirrorSide,
  aspect: number,
  scale = 1,
): { x: number; y: number } {
  const rect = doorMirrorRect(aspect, scale);
  const a = Number.isFinite(aspect) && aspect > 0.2 ? aspect : 1;
  // The margin is authored in viewport-HEIGHT units so the visual gap is the
  // same number of pixels on every edge.
  const marginX = (DOOR_MIRROR_MARGIN_FRACTION / a) * 2;
  // fraction → NDC doubles, half-size halves: the two cancel.
  const x = 1 - marginX - rect.widthFraction;
  return { x: side === "left" ? -x : x, y: DOOR_MIRROR_CENTER_Y_NDC };
}

/**
 * Camera-local half-size (world m) of the quad that carries the window when it
 * is parked `distance` metres in front of a camera with vertical FOV `vFovRad`
 * at `aspect`. Keeping the quad camera-locked and sizing it from the LIVE fov is
 * what holds the on-screen fraction constant while the cockpit camera's
 * speed-widen moves its FOV around.
 */
export function doorMirrorQuadHalfSize(
  distance: number,
  vFovRad: number,
  aspect: number,
  scale = 1,
): { halfWidth: number; halfHeight: number } {
  const rect = doorMirrorRect(aspect, scale);
  const viewHeight = 2 * distance * Math.tan(vFovRad / 2);
  const viewWidth = viewHeight * aspect;
  return {
    halfWidth: (viewWidth * rect.widthFraction) / 2,
    halfHeight: (viewHeight * rect.heightFraction) / 2,
  };
}

/** Camera-local offset (x, y) of the quad centre at `distance`, from the same
 *  NDC centre the rect uses. */
export function doorMirrorQuadOffset(
  side: DoorMirrorSide,
  distance: number,
  vFovRad: number,
  aspect: number,
  scale = 1,
): { x: number; y: number } {
  const ndc = doorMirrorCenterNdc(side, aspect, scale);
  const viewHeight = 2 * distance * Math.tan(vFovRad / 2);
  const viewWidth = viewHeight * aspect;
  return { x: (ndc.x * viewWidth) / 2, y: (ndc.y * viewHeight) / 2 };
}

/**
 * The pass camera's eye, in the CHASSIS frame (m) where +Z is forward and +X is
 * car-LEFT: the GLB door-glass positions themselves, copied from
 * `vitok/MirrorRig.tsx` MIRROR_DEFS. This is the whole point of the window —
 * a vantage 0.9 m outboard is what makes a door mirror show the lane beside you
 * and your own flank as the reference, which no camera at the driver's eye can
 * reproduce.
 *
 * Duplicated as literals rather than imported because MIRROR_DEFS is a private
 * const inside a `"use client"` component that the cockpit tree owns; the two
 * are pinned together by `cockpitDoorMirror.test.ts`, which fails if they drift.
 */
export const DOOR_MIRROR_EYE: Record<DoorMirrorSide, { x: number; y: number; z: number }> = {
  left: { x: 0.905, y: 0.455, z: 0.592 },
  right: { x: -0.905, y: 0.455, z: 0.592 },
};

/**
 * Aim, in the chassis frame. Yaw stays ZERO — parallel to the body axis, the
 * ruling MirrorRig's REF 6 post-mortem arrived at the hard way (an outward yaw
 * of ∓0.14 aimed the left glass ~8° into the roadside lawn and the mirror read
 * as „solid green"). The outboard EYE, not a yaw, is what puts the adjacent
 * lane in frame. Pitch is the door mirrors' authored −0.08 rad (≈4.6° down),
 * which keeps road in the lower two-thirds and horizon in the upper third.
 */
export const DOOR_MIRROR_YAW_RAD = 0;
export const DOOR_MIRROR_PITCH_RAD = -0.08;

/**
 * Vertical FOV (deg) of the pass. WIDER than the 18° MirrorRig gives the
 * physical glass, and deliberately so: 18° is right for ~0.15 m of glass
 * glimpsed at the edge of vision, and would be a telephoto crop across a
 * 389 px window. At 30° vertical on a 1.6 aspect the horizontal field is
 * 2·atan(tan(15°)·1.6) ≈ 46°, which covers the adjacent lane, the blind-spot
 * quarter and the car's own flank — the three things a mirror check is for.
 * The physical glass keeps its own authored aim untouched.
 */
export const DOOR_MIRROR_FOV_DEG = 30;

/** Near/far planes (m). The far plane is short for the same reason MirrorRig's
 *  is: it culls the CityBuildings 200 m chunk grid, so the pass is a small
 *  neighbourhood render and not a second full district. */
export const DOOR_MIRROR_NEAR_M = 0.3;
export const DOOR_MIRROR_FAR_M = 200;
/** Sky-dome radius during the pass — just inside the far plane, or the dome is
 *  clipped to black clear-colour (MirrorRig REF 6 failure #1). */
export const DOOR_MIRROR_SKY_RADIUS_M = 190;
/** Fog-density floor so geometry fades out BEFORE the short far plane instead
 *  of popping at it. */
export const DOOR_MIRROR_FOG_MIN_DENSITY = 1.5 / DOOR_MIRROR_FAR_M;

/** Render-target size, 1.6:1 to match the window's pixel aspect exactly. ONE
 *  target serves both sides: only one glance is ever held at a time, so a
 *  second would be dead VRAM. */
export const DOOR_MIRROR_TARGET_WIDTH = 256;
export const DOOR_MIRROR_TARGET_HEIGHT = 160;

/**
 * Render every Nth frame while the window is open (~30 Hz at 60 fps).
 *
 * THE BUDGET, stated plainly so it can be argued with rather than discovered.
 * MirrorRig runs AT MOST ONE reduced-scene pass per frame (its phases are
 * disjoint by construction) and it keeps doing exactly that — this file changes
 * nothing about the glass. This window adds AT MOST 0.5 passes per frame, and
 * only for the second or so a glance is actually held; the moment Q/E comes up
 * it costs nothing at all. So the worst case in the cockpit is 1.5 reduced-scene
 * passes per frame during a held glance, against the 1.0 it already pays every
 * frame just to look out of the windscreen.
 *
 * The two counters live in different components and are NOT in lockstep, so no
 * claim is made here that the passes never land on the same frame — that would
 * be a promise about state this file cannot see. 30 Hz is the same rate the
 * chase window (`chaseRearView.REAR_VIEW_CADENCE`) has been shipping at, on a
 * window the founder has looked at and accepted.
 */
export const DOOR_MIRROR_CADENCE = 2;
export const DOOR_MIRROR_CADENCE_PHASE = 1;

/**
 * The window's size at the START of the open, as a fraction of its settled
 * size; it grows to 1 on the glance's own smoothstep envelope, so no ease time
 * is authored here — the window opens on exactly the rhythm the head turns
 * (`GLANCE_EASE_S` in `scene/cabin.ts`).
 *
 * The grow is small on purpose. It exists so the window reads as leaning toward
 * the glass rather than a panel being switched on, and because a shape that
 * arrives at full size in one frame is the thing the eye reads as a HUD popup.
 * Being ≤ 1 it can only ever REDUCE the screen share, so the item-45 ceiling
 * holds through the whole animation for free.
 */
export const DOOR_MIRROR_OPEN_SCALE = 0.86;
