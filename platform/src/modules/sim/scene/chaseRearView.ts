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

/**
 * ── SECOND PASS, 2026-07-30 (register rows B74 / B76). ─────────────────────
 *
 * The window above shipped bound to the GLANCE HOLD: it existed only while
 * Q/E/F was down. Rendered again and looked at, that reads as item 44 still
 * unmet — the auditor's frame of `sc-follow-tailgater` (the one drill whose
 * whole subject is a car glued to your bumper) has no mirror anywhere on the
 * screen, because a student who never presses a key never sees one. His words
 * were „put Rear Mirror some small window in the POV **after pressing C**" —
 * C is the view, not a glance. A mirror is an INSTRUMENT: it is there because
 * the car has one, and you look at it when you choose to.
 *
 * So the rear window is now PERSISTENT in the chase view, at
 * `REAR_VIEW_IDLE_SCALE` of the glanced size and `REAR_VIEW_IDLE_OPACITY`, on a
 * slower cadence; a held glance opens it to full size, full opacity, full
 * cadence, and moves it to the glanced side exactly as item 45 asks. The idle
 * instrument is deliberately smaller than the glance: it must be readable at a
 * flick of the eye without competing with the road, and the size difference is
 * what makes the deliberate look feel like leaning toward the glass.
 *
 * GRADING IS STILL UNTOUCHED. The idle mirror latches nothing — the graded
 * signal remains the Q/E/F press through `CabinControls.glance()`. Seeing a
 * tailgater in the idle glass is exactly like seeing one in a real mirror
 * without turning your head: it informs, it does not score.
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

/**
 * The PERSISTENT interior mirror's size, relative to the glanced window
 * (row B74). 0.68 puts it at ~2.1 % of a 16:9 screen — about the share a real
 * interior mirror takes of a windscreen, small enough that the roomy HUD only
 * has to step down ~120 px on a 900 px play area, and still 116 px wide at
 * 1440×900, which is wide enough to tell a car from an empty road.
 */
export const REAR_VIEW_IDLE_SCALE = 0.68;

/** Opacity of the idle mirror. Glass, not a screen: present without shouting,
 *  and it goes to 1 the moment the student actually looks (glance held). */
export const REAR_VIEW_IDLE_OPACITY = 0.72;

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
 *
 * `scale` (default 1) is the persistent-mirror rung — REAR_VIEW_IDLE_SCALE.
 * It shrinks the window about its own centre and therefore can only ever
 * REDUCE the screen share, so the ≤10 % contract holds for free at any rung.
 */
export function rearViewRect(aspect: number, scale = 1): RearViewRect {
  const a = Number.isFinite(aspect) && aspect > 0.2 ? aspect : 1;
  const s = Number.isFinite(scale) && scale > 0 ? Math.min(1, scale) : 1;
  let heightFraction = REAR_VIEW_HEIGHT_FRACTION * s;
  let widthFraction = (heightFraction * REAR_VIEW_PIXEL_ASPECT) / a;
  // Portrait guard: never let the window span more than 62 % of the width
  // (two of them never coexist — only one glance is held at a time — but a
  // window wider than that stops being an inset and becomes a letterbox).
  // The guard is scaled with the rung, or the persistent mirror and the open
  // window would clamp to the SAME size on a phone in portrait — the idle
  // instrument has to be smaller than the deliberate look in every orientation,
  // otherwise the glance has nothing to show for itself.
  const MAX_WIDTH_FRACTION = 0.62 * s;
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
  scale = 1,
): { x: number; y: number } {
  const rect = rearViewRect(aspect, scale);
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
 * …and the cadence of the PERSISTENT mirror, which nobody is staring at:
 * every 4th frame (~15 Hz at 60 fps). A mirror you are not looking at only has
 * to answer „is there something back there", and 15 Hz answers it.
 *
 * THE BUDGET, stated so it can be argued with: this is 0.25 reduced-scene
 * passes per frame. The COCKPIT camera already runs MirrorRig at rear
 * interval 2 plus two doors at interval 4 (MirrorRig.MIRROR_CADENCE) — one
 * full pass per frame, four times this — and it does so on the same box, on
 * the default camera, and nobody has ever called that the reason the sim is
 * slow. Making the chase mirror permanent costs a quarter of what looking out
 * of the windscreen already costs.
 */
export const REAR_VIEW_IDLE_CADENCE = 4;

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
  scale = 1,
): { halfWidth: number; halfHeight: number } {
  const rect = rearViewRect(aspect, scale);
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
  scale = 1,
): { x: number; y: number } {
  const ndc = rearViewCenterNdc(side, aspect, scale);
  const viewHeight = 2 * distance * Math.tan(vFovRad / 2);
  const viewWidth = viewHeight * aspect;
  return { x: (ndc.x * viewWidth) / 2, y: (ndc.y * viewHeight) / 2 };
}

/**
 * How far down the viewport the window's LOWER edge sits, as a fraction of
 * viewport height (0 = top edge, 1 = bottom edge).
 *
 * This is the number the DOM needs (row B76). The window is a quad inside the
 * WebGL scene, so every DOM layer paints over it no matter what renderOrder it
 * carries — the auditor's frames show the objective chips covering the top 40 %
 * of the F window and the „Клавиши" legend covering 60 % of the Q one. A HUD
 * that hides the instrument it is describing is worse than no instrument, so
 * the roomy top-centre stack steps down BELOW the persistent mirror instead of
 * standing on it, and the play shell needs this fraction in pixels to do that.
 */
export function rearViewBottomFraction(aspect: number, scale = 1): number {
  const rect = rearViewRect(aspect, scale);
  // NDC top edge is 1 − marginY; the window is 2·heightFraction tall in NDC,
  // and NDC→screen-fraction is (1 − y) / 2.
  return REAR_VIEW_MARGIN_FRACTION + rect.heightFraction;
}
