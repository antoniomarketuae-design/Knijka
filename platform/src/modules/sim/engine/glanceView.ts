/**
 * Chase-view glances (founder ruling 2026-07-20, doc 62 S5: a graded action
 * must always have an information payoff). In the cockpit Q/E/F already turn
 * the head toward the mirror; in the CHASE view the same press used to grade
 * silently while the camera stared straight ahead — the founder's "pressing a
 * button with no meaning — remove it or make it real". This module makes it
 * real: while a glance is HELD the chase camera orbits toward the glanced
 * quarter — LEFT shows the car's left-forward quarter (the cross street the
 * glance was checking for), RIGHT its exact mirror, REAR the over-the-boot
 * aspect the reversing POV already owns (reused, never duplicated).
 *
 * Pure decision logic — no DOM, no three.js, no React, fully unit-testable in
 * Node; nothing here allocates. Same decide-then-render split as
 * reverseView.ts: once per frame CameraRig asks chaseGlanceOrbit() how far
 * the view axis SHOULD be orbited and renders it through the existing
 * applyAxisAngle path (+Y orbit, the convention the reverse swing pins).
 *
 * HOLD-TO-LOOK, ONE GESTURE: the orbit is driven by the SAME GlanceHold 0..1
 * envelope whose press latches the graded mirrorGlance sample — the visual
 * payoff and the graded act are literally one press/hold/release. Release =
 * the envelope easing home over GLANCE_EASE_S = a damped return, never a cut
 * (cabin keeps the mirror kind set through the ease-out, so the orbit unwinds
 * through the exact aspect it swung out on). This module only ever CONSUMES
 * the glance state; the graded channel (press → mirrorGlance sample) is
 * untouched — grading never reads the camera.
 *
 * PRIORITIES (first wins):
 *  1. Explicit camera choice — only the chase view orbits. The cockpit head
 *     swing is already real, top-down already sees everything, and a mode
 *     SWITCH snaps in the rig like every other camera state.
 *  2. An active reverse swing wins over a glance: the glance can only claim
 *     the share of the orbit the reverse has released (the
 *     (1 − reverseEnvelope) blend). For REAR both aim at the same
 *     CHASE_REVERSE_ORBIT_RAD aspect, so a handover in either direction
 *     (R engaged while F held, F pressed while reversing) holds the boot view
 *     without a dip; a side glance blends smoothly out of a fading reverse
 *     swing instead of fighting it. (The cockpit rule is the inverse — there
 *     the explicit glance zeroes the reverse TARGET, see reverseViewTarget —
 *     because a head is quick; the chase orbit is the big ~0.5 s motion, so
 *     here it keeps the right of way.)
 *  3. Glance release = damped return (the envelope, above).
 *
 * EXAM HONESTY: glances are graded acts, not aids — the swing stays available
 * on exam rungs, the same ruling as the reversing POV and top-down. There is
 * deliberately no exam/rung input here to gate on (a test pins the arity).
 */

import {
  CHASE_REVERSE_ORBIT_RAD,
  COCKPIT_SHOULDER_YAW,
  reverseSwingEnvelope,
  type ReverseViewMode,
} from "./reverseView";

/** Structurally identical to (and assignable from) cabin's MirrorGlanceKind —
 *  declared here so the module never imports a type out of the component
 *  layer (the ReverseViewMode pattern). `shoulder` is the blind-spot look and
 *  NOT a mirror; it is here because it is an ACT the camera must perform, and
 *  it gets an aspect of its own below. */
export type GlanceViewMirror = "left" | "right" | "rear" | "shoulder";

/**
 * Side-glance orbit depth, rad. π/3 (60°): deep enough that traffic on the
 * crossing arm enters the 44° chase frame well before it reaches the nose —
 * the information the glance exists to buy — while the own car and lane stay
 * in the picture, so the payoff ADDS a quarter instead of trading the road
 * ahead for it. Positive +Y rotation turns the view axis toward car-LEFT
 * (pinned by the chase reverse orbit), so left = +, right = −. TUNE HERE.
 */
export const CHASE_GLANCE_SIDE_ORBIT_RAD = Math.PI / 3;

/**
 * OVER-THE-LEFT-SHOULDER aspect, rad about +Y — the ONE definition of "looking
 * into the left blind spot", shared by the chase orbit below and by the
 * cockpit head turn (`CameraRig.GLANCE_OFFSETS.shoulder` imports it), the same
 * one-aspect discipline REAR keeps with the reversing POV.
 *
 * IT IS NOT A NEW NUMBER. It is `COCKPIT_SHOULDER_YAW` mirrored: reverseView.ts
 * already derives −1.85 rad (≈ −106°) as the RIGHT-shoulder check the reversing
 * POV performs, and states why it stops there — „beyond ~90–110° a driver's
 * head stops and the TORSO does the rest, which the cockpit camera (a head at
 * COCKPIT_EYE, not a body) cannot model". A left shoulder check is the same
 * head on the same neck, so it is the same magnitude with the sign flipped
 * (positive = toward car-LEFT, the convention the chase reverse orbit pins).
 * Read against this file's other two aspects it also lands where the blind
 * spot is: past the door mirror's quarter (CHASE_GLANCE_SIDE_ORBIT_RAD, π/3)
 * and short of the over-the-boot aspect (CHASE_REVERSE_ORBIT_RAD, π) — the
 * wedge no glass on the car can show. TUNE IT IN reverseView.ts, once.
 */
export const SHOULDER_GLANCE_ORBIT_RAD = -COCKPIT_SHOULDER_YAW;

/**
 * Full-hold aspect per look (rad about +Y). REAR deliberately IS the
 * reverse-view aspect — one definition of "looking over the boot" across the
 * whole reverse/glance family, which is also what lets the reverse-priority
 * blend hold that aspect through handovers without a dip.
 */
export const CHASE_GLANCE_ASPECT_RAD: Record<GlanceViewMirror, number> = {
  left: CHASE_GLANCE_SIDE_ORBIT_RAD,
  right: -CHASE_GLANCE_SIDE_ORBIT_RAD,
  rear: CHASE_REVERSE_ORBIT_RAD,
  shoulder: SHOULDER_GLANCE_ORBIT_RAD,
};

/**
 * The glance's share of the chase orbit this frame, rad about +Y — ADD to the
 * reverse swing's own `swing * CHASE_REVERSE_ORBIT_RAD` before applyAxisAngle.
 *
 * Positional args (no frame object): this runs inside useFrame and must not
 * force the caller to allocate. `mode` is taken even though the rig only asks
 * from its chase branch — priority 1 lives HERE, testable, not in the
 * caller's control flow. `glanceStrength` is the raw GlanceHold envelope;
 * the smoothstep the cockpit head already uses (reverseSwingEnvelope — the
 * shared easing) is applied here so both POVs ease identically.
 * `reverseEnvelope` is the RENDERED reverse swing 0..1 (post-envelope).
 */
export function chaseGlanceOrbit(
  mode: ReverseViewMode,
  glanceMirror: GlanceViewMirror | null,
  glanceStrength: number,
  reverseEnvelope: number,
): number {
  if (mode !== "chase") return 0; // priority 1: the chosen POV wins
  if (!glanceMirror) return 0;
  const env = reverseSwingEnvelope(glanceStrength); // shared smoothstep ease
  if (env === 0) return 0;
  // Priority 2: the reverse swing keeps what it holds; the glance gets the rest.
  const r = reverseEnvelope < 0 ? 0 : reverseEnvelope > 1 ? 1 : reverseEnvelope;
  if (r >= 1) return 0; // fully held by the reverse swing (and never -0)
  return (1 - r) * env * CHASE_GLANCE_ASPECT_RAD[glanceMirror];
}

/**
 * Observed orbital rate (rad/s) at and above which the chase follow is fully
 * locked to the arc. Same physics as chaseOrbitLock (a π/3 orbit on the 6 m
 * chase radius in the 0.18 s glance ease sweeps the desired position at
 * ~35 m/s — an order of magnitude past what the CHASE_STIFFNESS lerp can
 * track; it would cut across the arc, not ride it), but keyed on the RATE of
 * the composed orbit angle because the glance envelope has no 0/1 target to
 * measure distance from. Below the threshold the lock fades linearly, handing
 * the trailing chase feel back as the swing settles (residual trailing error
 * at the threshold ≈ rate·CHASE_DISTANCE/CHASE_STIFFNESS ≈ 0.6 m).
 */
export const CHASE_GLANCE_LOCK_RATE_RADS = 0.5;

/**
 * How rigidly the chase camera must ride the orbit arc this frame, from the
 * observed change of the TOTAL orbit angle (reverse + glance): 0 = normal
 * trailing lerp, 1 = glued to the arc. Complements chaseOrbitLock — take the
 * max of both. A dead frame (dt ≤ 0: paused tab, mode re-entry) is 0, never
 * NaN; at a steady hold the angle is constant, so the lock is 0 and the
 * chase trails exactly as it always has — just around the glanced aspect.
 */
export function glanceOrbitLock(
  prevOrbitRad: number,
  orbitRad: number,
  dtSec: number,
): number {
  if (!(dtSec > 0)) return 0;
  const lock = Math.abs(orbitRad - prevOrbitRad) / dtSec / CHASE_GLANCE_LOCK_RATE_RADS;
  return lock > 1 ? 1 : lock;
}
