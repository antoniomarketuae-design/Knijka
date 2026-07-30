/**
 * THE CHASE-VIEW REAR WINDOW (doc 86 L16 — founder items 44 and 45).
 *
 * His words, verbatim from the hand-written review:
 *
 *   44 — «I drive from the back of the car POV and I dont see Rear Mirror at
 *        all … we must put Rear Mirror some small window in the POV after
 *        pressing C»
 *   45 — «when the user clicks Q or E … we must pop some Small window on the
 *        screen on the right side if he press right and on the left side if he
 *        press left, which small window will be rear view window showing whats
 *        happening behind … not more than 10% of the screen»
 *
 * WHAT WAS ACTUALLY TRUE, checked before building anything (the R0 discipline):
 *
 *  · `docs/simulation/82` §3.2 and §7 still carry a P0 „the rear-view mirror is
 *    a solid black rectangle … fix immediately", open since 26 July. **That bug
 *    is FIXED.** `scene/vitok/mirrorPass.ts` landed in `8442b91` (2026-07-26
 *    08:22) and owns `autoClear` for the pass — the composer had switched it
 *    off globally, so the raw `gl.render` never cleared colour or depth and the
 *    glass was black on every composer tier. MirrorRig's REF 7/REF 8 blocks
 *    then lifted the glass clear of its authored casing. Doc 82's entries are
 *    stale; the founder's live mirror reflection on 29 July is the confirmation.
 *
 *  · So L16 is NOT that bug wearing a different hat. `VitokCockpit.tsx:1508`
 *    mounts `<MirrorRig … active={cockpitView} />`: the render-to-texture
 *    mirrors exist **only in the cockpit camera**. In the chase view — the POV
 *    the founder plays in, and the default — there has never been a mirror of
 *    any kind. `CameraRig`'s Q/E/F did exactly what he described: `chaseGlanceOrbit`
 *    swings the camera a few degrees toward the glanced quarter, which is not a
 *    rear view and cannot show a tailgater sitting on the bumper.
 *
 * THIS FILE is the pure geometry of the fix, split out so the „not more than
 * 10% of the screen" contract is a unit test and not a promise. The rig that
 * renders it lives in `components/sim/CameraRig.tsx`.
 *
 * GRADING IS UNTOUCHED. Like the cockpit mirrors, this is visual truth only:
 * the graded mirror-check signal is still the Q/E/F press latched by
 * `CabinControls.glance()`. The window makes the graded press HONEST — the
 * founder's glance-payoff law, that a graded press must SHOW something.
 */

/** Which quarter the window is looking at, and therefore which side it sits on. */
export type RearViewSide = "left" | "right" | "rear";

/**
 * Hard contract from item 45: the window may never occupy more than a tenth of
 * the screen. Asserted over a sweep of aspect ratios in
 * `chaseRearView.test.ts`.
 */
export const REAR_VIEW_MAX_SCREEN_FRACTION = 0.1;

/**
 * Window height as a fraction of viewport height, and its PIXEL aspect ratio.
 *
 * 0.19 × 2.4 lands at 4.6–5.7 % of the screen across every aspect from 4:3 to
 * 21:9 — comfortably inside his 10 % ceiling while still being a window you can
 * read a car in (at 1440×900 it is ~410×171 px). The 2.4:1 pixel aspect is the
 * letterbox shape of a real interior mirror; the cockpit rig's own rear target
 * is 256×96 = 2.67:1, so the two views read as the same instrument.
 */
export const REAR_VIEW_HEIGHT_FRACTION = 0.19;
export const REAR_VIEW_PIXEL_ASPECT = 2.4;

/** Gap from the viewport edges, as a fraction of viewport height. */
export const REAR_VIEW_MARGIN_FRACTION = 0.035;

/** Ease time (s) for the window to open on press and close on release. */
export const REAR_VIEW_FADE_S = 0.12;

/** The window's size as fractions of the viewport (width uses the LIVE aspect
 *  so the pixel shape is constant on any window). */
export interface RearViewRect {
  /** Width as a fraction of viewport width. */
  widthFraction: number;
  /** Height as a fraction of viewport height. */
  heightFraction: number;
  /** Share of the total screen area — the item-45 contract. */
  screenAreaFraction: number;
}

/**
 * `aspect` = viewport width / height. Width in *pixels* is height × 2.4, so as
 * a fraction of width it must be divided by the aspect; on very narrow
 * (portrait) viewports that would overflow, so the whole window is scaled down
 * to fit a usable share of the width instead.
 */
export function rearViewRect(aspect: number): RearViewRect {
  const a = Number.isFinite(aspect) && aspect > 0.2 ? aspect : 1;
  let heightFraction = REAR_VIEW_HEIGHT_FRACTION;
  let widthFraction = (heightFraction * REAR_VIEW_PIXEL_ASPECT) / a;
  // Portrait guard: never let the window span more than 62 % of the width
  // (two of them never coexist — only one glance is held at a time — but a
  // window wider than that stops being an inset and becomes a letterbox).
  const MAX_WIDTH_FRACTION = 0.62;
  if (widthFraction > MAX_WIDTH_FRACTION) {
    const shrink = MAX_WIDTH_FRACTION / widthFraction;
    widthFraction = MAX_WIDTH_FRACTION;
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
 * Item 45 is explicit about the placement: left glance → left of the screen,
 * right glance → right. The rear glance (F) is the interior mirror, so it
 * centres, where a real one hangs. All three ride the top of the frame, clear
 * of the HUD cards along the bottom edge.
 */
export function rearViewCenterNdc(
  side: RearViewSide,
  aspect: number,
): { x: number; y: number } {
  const rect = rearViewRect(aspect);
  const a = Number.isFinite(aspect) && aspect > 0.2 ? aspect : 1;
  // The margin is authored in viewport-HEIGHT units so the visual gap is the
  // same number of pixels top and side.
  const marginX = (REAR_VIEW_MARGIN_FRACTION / a) * 2;
  const marginY = REAR_VIEW_MARGIN_FRACTION * 2;
  const halfW = rect.widthFraction; // fraction→NDC doubles, half-size halves
  const halfH = rect.heightFraction;
  const y = 1 - marginY - halfH;
  if (side === "rear") return { x: 0, y };
  const x = 1 - marginX - halfW;
  return { x: side === "left" ? -x : x, y };
}

/**
 * Yaw (rad) applied to the rear-facing camera for each side, in the chassis
 * frame where +Z is forward and +X is car-LEFT. A camera whose quaternion is
 * the chassis quaternion already looks down chassis −Z, i.e. straight back;
 * rotating it about +Y by θ swings its view axis to (−sin θ, 0, −cos θ), so a
 * NEGATIVE θ swings toward car-left.
 *
 * ±0.42 rad (24°) puts the adjacent lane and the over-the-shoulder blind spot
 * in frame without losing the car's own flank as a reference — the same job a
 * door mirror does, from a vantage the chase camera cannot otherwise offer.
 */
export const REAR_VIEW_YAW_RAD: Record<RearViewSide, number> = {
  left: -0.42,
  right: 0.42,
  rear: 0,
};

/** Vertical FOV (deg) per side. The rear window is the long look down the
 *  road behind (narrow, like the cockpit's 14° interior mirror, widened for
 *  the bigger inset); the quarters need more lateral coverage. */
export const REAR_VIEW_FOV_DEG: Record<RearViewSide, number> = {
  left: 34,
  right: 34,
  rear: 26,
};

/**
 * Eye offset of the rear-view camera in the CHASSIS frame (m): centred, at
 * roof height, just behind the B-pillar. Not the chase camera's own position —
 * the window must show what is behind the CAR, which is the only thing the
 * founder can act on, and a vantage 8 m further back would show the car's own
 * boot filling the frame.
 */
export const REAR_VIEW_EYE = { x: 0, y: 1.05, z: -0.2 } as const;

/** Near/far planes of the rear-view pass (m). The far plane is short for the
 *  same reason MirrorRig's is — it culls the distant building chunks so the
 *  pass is a small neighbourhood render, not a second full district. */
export const REAR_VIEW_NEAR_M = 0.4;
export const REAR_VIEW_FAR_M = 200;
/** Sky-dome radius during the pass — just inside the far plane, so the dome is
 *  not clipped to black clear-colour (MirrorRig REF 6 failure #1). */
export const REAR_VIEW_SKY_RADIUS_M = 190;
/** Fog-density floor so geometry fades before the short far plane pops. */
export const REAR_VIEW_FOG_MIN_DENSITY = 1.5 / REAR_VIEW_FAR_M;

/** Render-target size. One target, reused by all three sides — only one glance
 *  is ever held at a time, so a second would be dead VRAM. 2.4:1 to match the
 *  window's pixel aspect exactly (no resampling squeeze). */
export const REAR_VIEW_TARGET_WIDTH = 384;
export const REAR_VIEW_TARGET_HEIGHT = 160;

/** Render every Nth frame while open (~30 Hz at 60 fps) — the same budget
 *  reasoning as MIRROR_CADENCE: a glance is a look, not a mirror you stare at,
 *  and one reduced-scene pass per two frames is what the 16 GB box can pay. */
export const REAR_VIEW_CADENCE = 2;

/**
 * World-space half-size of the quad that shows the window, when it is parked
 * `distance` metres in front of a camera with vertical FOV `vFovRad` and the
 * given aspect. Keeping the quad camera-locked at a fixed distance and sizing
 * it from the live FOV is what makes the window a constant fraction of the
 * screen while the chase camera's speed-widen moves its FOV around.
 */
export function rearViewQuadHalfSize(
  distance: number,
  vFovRad: number,
  aspect: number,
): { halfWidth: number; halfHeight: number } {
  const rect = rearViewRect(aspect);
  const viewHeight = 2 * distance * Math.tan(vFovRad / 2);
  const viewWidth = viewHeight * aspect;
  return {
    halfWidth: (viewWidth * rect.widthFraction) / 2,
    halfHeight: (viewHeight * rect.heightFraction) / 2,
  };
}

/** Camera-local offset (x, y) of the quad centre at `distance`, from the same
 *  NDC centre the rect uses. */
export function rearViewQuadOffset(
  side: RearViewSide,
  distance: number,
  vFovRad: number,
  aspect: number,
): { x: number; y: number } {
  const ndc = rearViewCenterNdc(side, aspect);
  const viewHeight = 2 * distance * Math.tan(vFovRad / 2);
  const viewWidth = viewHeight * aspect;
  return { x: (ndc.x * viewWidth) / 2, y: (ndc.y * viewHeight) / 2 };
}
