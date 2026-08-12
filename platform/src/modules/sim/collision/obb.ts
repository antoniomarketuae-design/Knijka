/**
 * sim/collision — EXACT 2D body geometry for contact adjudication.
 *
 * WHY THIS MODULE EXISTS. The orchestrator used to adjudicate "did the player
 * hit that car?" with an isotropic circle:
 *
 *     const VEHICLE_CONTACT_M = 3.0;                       // runners.ts
 *     dist(player.x, player.y, actor.x, actor.y) < VEHICLE_CONTACT_M
 *
 * A circle cannot tell nose-to-tail from side-by-side, and a car is 4.1 m long
 * and 1.84 m wide. The 3.0 m was derived nose-to-tail (two half-lengths, minus
 * slack) and it is WRONG IN BOTH DIRECTIONS:
 *
 *   · SIDE BY SIDE the two flanks are 0.92 + 0.92 = 1.84 m of body apart, so the
 *     test fired with 1.16 m of CLEAR AIR between them. Passing a parked car
 *     with over a metre of daylight was graded «Пътнотранспортно произшествие»,
 *     10 points, session terminated — the founder's report. Roughly a metre is
 *     the lateral clearance the lesson is TEACHING.
 *   · NOSE TO TAIL two 4.1 m cars touch at 4.1 m centre-to-centre, so the same
 *     constant demanded 1.1 m of INTERPENETRATION before it fired. It missed
 *     real rear-end contacts while inventing side-swipes.
 *
 * The exact, standard, cheap answer for two rectangles with headings is the
 * SEPARATING AXIS THEOREM on oriented bounding boxes: two convex rectangles are
 * disjoint IF AND ONLY IF one of the four face normals (two per box) separates
 * them. Four projections, no square roots, exact for every relative
 * orientation — including the reversing case, where the circle is worst.
 *
 * WHAT THE FUNCTIONS RETURN. `obbSeparationM` returns a SIGNED separation, not
 * a boolean, because the number is worth more than the verdict: a coaching line
 * («мина на 0,4 m») and this module's own verification both need it. Positive =
 * metres of air along the best separating axis; negative = penetration depth
 * (the minimum-translation distance that would pull them apart).
 *
 * Convention (district space, shared with traffic/runtime/world):
 *   x = east, y = north, metres; headingDeg 0 = north, clockwise positive.
 *   A box's LENGTH axis runs along its heading; its WIDTH axis is to its right.
 *
 * Pure TypeScript, allocation-free on the hot path (module scratch for the
 * swept interpolation), no React/three/Rapier — vitest-safe.
 */

/** An oriented bounding box on the ground plane (district space). */
export interface Obb2D {
  /** Body centre, m. */
  x: number;
  y: number;
  /** Heading of the LENGTH axis: 0 = north, clockwise positive, degrees. */
  headingDeg: number;
  /** Half the body length (along the heading), m. */
  halfLengthM: number;
  /** Half the body width (across the heading), m. */
  halfWidthM: number;
}

const DEG = Math.PI / 180;

/**
 * Half-extent of `b` projected onto the unit axis (ux, uy) — the standard SAT
 * radius: |half-length · (forward·u)| + |half-width · (right·u)|.
 */
function extentAlong(b: Obb2D, ux: number, uy: number): number {
  const h = b.headingDeg * DEG;
  const fx = Math.sin(h); // forward (length axis)
  const fy = Math.cos(h);
  // right (width axis) = forward rotated 90° clockwise = (cos h, −sin h)
  return (
    b.halfLengthM * Math.abs(fx * ux + fy * uy) + b.halfWidthM * Math.abs(fy * ux - fx * uy)
  );
}

/** Interval overlap of a and b along the unit axis (ux, uy): > 0 = they
 *  overlap by that much, < 0 = they are separated by that much. */
function axisOverlap(a: Obb2D, b: Obb2D, ux: number, uy: number, dx: number, dy: number): number {
  return extentAlong(a, ux, uy) + extentAlong(b, ux, uy) - Math.abs(dx * ux + dy * uy);
}

/**
 * SIGNED separation between two oriented boxes, metres.
 *
 *   > 0  disjoint: metres of clear air along the best separating axis
 *   = 0  exactly touching
 *   < 0  overlapping: −(penetration depth along the minimum-translation axis)
 *
 * Exact SAT over the four face normals. No square roots; ~40 flops.
 *
 * HONEST BOUND, worth knowing before you quote the number to a student: when
 * two boxes are disjoint CORNER TO CORNER, the true Euclidean gap runs along
 * the corner-to-corner direction, which is not a face normal. In that one
 * configuration this returns a value SMALLER than the true distance (two
 * 1 m squares 2 m apart diagonally: 1.0 here, √2 ≈ 1.414 truly). That error is
 * always in the safe direction — it never overstates clearance, so it can never
 * turn a real contact into a miss — and it is ZERO for the case the grader
 * lives on: flank-to-flank and nose-to-tail, where the face normal IS the
 * shortest line between the bodies.
 */
export function obbSeparationM(a: Obb2D, b: Obb2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ha = a.headingDeg * DEG;
  const hb = b.headingDeg * DEG;
  const afx = Math.sin(ha);
  const afy = Math.cos(ha);
  const bfx = Math.sin(hb);
  const bfy = Math.cos(hb);
  // Four candidate axes: each box's forward and right face normals.
  let least = axisOverlap(a, b, afx, afy, dx, dy);
  const a2 = axisOverlap(a, b, afy, -afx, dx, dy);
  if (a2 < least) least = a2;
  const a3 = axisOverlap(a, b, bfx, bfy, dx, dy);
  if (a3 < least) least = a3;
  const a4 = axisOverlap(a, b, bfy, -bfx, dx, dy);
  if (a4 < least) least = a4;
  return -least;
}

/** True when the two boxes touch or interpenetrate (separation ≤ 0). */
export function obbOverlap(a: Obb2D, b: Obb2D): boolean {
  return obbSeparationM(a, b) <= 0;
}

/**
 * SIGNED separation between an oriented box and a DISC, metres — the right
 * shape for a pedestrian, who has no meaningful heading and whose physics body
 * is a capsule (a circle on the ground plane).
 *
 * Exact: closest point on the box to the disc centre, minus the radius.
 * Negative = the disc is inside the inflated box by that depth.
 */
export function obbDiscSeparationM(
  box: Obb2D,
  cx: number,
  cy: number,
  radiusM: number,
): number {
  const h = box.headingDeg * DEG;
  const fx = Math.sin(h);
  const fy = Math.cos(h);
  const dx = cx - box.x;
  const dy = cy - box.y;
  const along = dx * fx + dy * fy; // along the box's length axis
  const lat = dx * fy - dy * fx; // along the box's width axis (right)
  const ex = Math.abs(along) - box.halfLengthM;
  const ey = Math.abs(lat) - box.halfWidthM;
  const d =
    ex <= 0 && ey <= 0
      ? Math.max(ex, ey) // centre inside the box: negative depth to nearest face
      : Math.hypot(Math.max(ex, 0), Math.max(ey, 0));
  return d - radiusM;
}

// ---------------------------------------------------------------------------
// Sweeping — why a single-pose test is not enough
//
// The director steps ONCE PER RENDER FRAME with `dt = Math.min(delta, 0.1)`
// (LessonScene), not once per physics step. Measured/derived worst case:
//   · player terminal speed 46.8 m/s (168.4 km/h, tuning.ts's own rig
//     measurement) meeting a staged actor at up to 36 m/s (the fastest
//     authored cruiseSpeedMps) = 82.8 m/s of closing speed;
//   · at 60 fps that is 82.8 × 1/60 = 1.38 m of relative travel per director
//     tick; at 30 fps 2.76 m; AT THE 0.1 s CLAMP 8.28 m — twice the length of
//     the car being tested.
// A pose-only test therefore CAN step over a contact, and a missed contact is
// the more dangerous error in a driving school: a false positive annoys, a
// false negative teaches a student that the manoeuvre was survivable.
//
// The alternative — inflating the boxes by half a tick of travel — buys tunnel
// protection with a permanent false-positive band, which is the exact bug this
// module exists to delete. So: no inflation (CONTACT_TOLERANCE_M = 0, real
// contact IS overlap) and a swept test instead. The sweep sub-samples the pose
// pair between the previous and the current frame at SWEEP_RESOLUTION_M; in a
// normal 60 fps frame the relative travel is a few centimetres and it costs ONE
// extra SAT evaluation.
// ---------------------------------------------------------------------------

/**
 * Contact threshold on a signed separation, m. ZERO by ruling: real contact is
 * overlap. Any positive value is a band of clear air billed as a crash, which
 * is the defect this module replaces; tunnelling is answered by the sweep
 * below, not by inflation.
 */
export const CONTACT_TOLERANCE_M = 0;

/**
 * Sub-sample the swept interval at least this finely, m. Below the narrowest
 * half-extent in the fleet (the child bicycle's 0.17 m half-width), so the only
 * contact this can still step over is one whose whole overlap window along the
 * relative motion is under 15 cm — a graze no examiner calls a crash either.
 * Exactness is bounded and stated rather than assumed.
 */
export const SWEEP_RESOLUTION_M = 0.15;

/** Hard cap on sub-samples per test. SWEEP_TELEPORT_M / SWEEP_RESOLUTION_M = 80
 *  would be the exact cap; 48 keeps a hitch frame's cost bounded and only
 *  coarsens the sampling above 7.2 m of single-frame relative travel, which is
 *  past the 0.1 s clamp's own worst case (8.28 m at 82.8 m/s closing). */
export const SWEEP_MAX_STEPS = 48;

/**
 * Relative travel above this in ONE tick is not motion, m — it is a teleport
 * (an actor `reset`, a re-stage, a respawn) or a gap in observation (a runner
 * whose contact branch was skipped for several frames). Sweeping across either
 * would drag a body through the player and INVENT a collision, so the fallback
 * is the current pose alone. 12 m sits above the physical worst case a real
 * frame can produce: 82.8 m/s of closing speed × the 0.1 s director clamp =
 * 8.28 m.
 */
export const SWEEP_TELEPORT_M = 12;

/** A pose pair remembered from the previous frame. */
export interface SweepPose {
  x: number;
  y: number;
  headingDeg: number;
}

/** Shortest-arc angular span between two headings, degrees (0..180). */
function headingSpanDeg(from: number, to: number): number {
  return Math.abs(((((to - from) % 360) + 540) % 360) - 180);
}

function lerpHeadingDeg(from: number, to: number, t: number): number {
  const d = ((((to - from) % 360) + 540) % 360) - 180;
  return from + d * t;
}

// Scratch boxes for the swept interpolation. Safe because the sweep is not
// re-entrant: obbSeparationM/obbDiscSeparationM never call back into it.
const SCRATCH_A: Obb2D = { x: 0, y: 0, headingDeg: 0, halfLengthM: 0, halfWidthM: 0 };
const SCRATCH_B: Obb2D = { x: 0, y: 0, headingDeg: 0, halfLengthM: 0, halfWidthM: 0 };

function lerpInto(out: Obb2D, prev: SweepPose, now: Obb2D, t: number): Obb2D {
  out.x = prev.x + (now.x - prev.x) * t;
  out.y = prev.y + (now.y - prev.y) * t;
  out.headingDeg = lerpHeadingDeg(prev.headingDeg, now.headingDeg, t);
  out.halfLengthM = now.halfLengthM;
  out.halfWidthM = now.halfWidthM;
  return out;
}

/** Sub-sample count for a given amount of relative travel. */
function sweepSteps(travelM: number): number {
  if (!(travelM > SWEEP_RESOLUTION_M)) return 1;
  return Math.min(SWEEP_MAX_STEPS, Math.ceil(travelM / SWEEP_RESOLUTION_M));
}

/**
 * Relative travel between two frames, m — centre displacement of a relative to
 * b, plus the arc each body's far corner swept while rotating.
 */
function relativeTravelM(prevA: SweepPose, a: Obb2D, prevB: SweepPose, b: Obb2D): number {
  const rx = a.x - prevA.x - (b.x - prevB.x);
  const ry = a.y - prevA.y - (b.y - prevB.y);
  const spinA = headingSpanDeg(prevA.headingDeg, a.headingDeg) * DEG * Math.hypot(a.halfLengthM, a.halfWidthM);
  const spinB = headingSpanDeg(prevB.headingDeg, b.headingDeg) * DEG * Math.hypot(b.halfLengthM, b.halfWidthM);
  return Math.hypot(rx, ry) + spinA + spinB;
}

/**
 * The MINIMUM signed separation over the motion from the previous pose pair to
 * the current one, metres — same sign convention as `obbSeparationM`.
 *
 * `prevA`/`prevB` null (the first frame of an encounter, or right after a
 * re-stage) falls back to the current pose alone.
 */
export function sweptObbSeparationM(
  prevA: SweepPose | null,
  a: Obb2D,
  prevB: SweepPose | null,
  b: Obb2D,
): number {
  if (prevA === null || prevB === null) return obbSeparationM(a, b);
  const travel = relativeTravelM(prevA, a, prevB, b);
  if (travel > SWEEP_TELEPORT_M) return obbSeparationM(a, b);
  const steps = sweepSteps(travel);
  if (steps === 1) return obbSeparationM(a, b);
  let best = Infinity;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const sep = obbSeparationM(
      lerpInto(SCRATCH_A, prevA, a, t),
      lerpInto(SCRATCH_B, prevB, b, t),
    );
    if (sep < best) best = sep;
    if (best <= CONTACT_TOLERANCE_M) return best; // already contact
  }
  return best;
}

/** `sweptObbSeparationM` for a box against a DISC (pedestrian). */
export function sweptObbDiscSeparationM(
  prevBox: SweepPose | null,
  box: Obb2D,
  prevDisc: SweepPose | null,
  discX: number,
  discY: number,
  radiusM: number,
): number {
  if (prevBox === null || prevDisc === null) {
    return obbDiscSeparationM(box, discX, discY, radiusM);
  }
  const discNow: Obb2D = SCRATCH_B;
  discNow.x = discX;
  discNow.y = discY;
  discNow.headingDeg = 0;
  discNow.halfLengthM = radiusM;
  discNow.halfWidthM = radiusM;
  const travel = relativeTravelM(prevBox, box, prevDisc, discNow);
  if (travel > SWEEP_TELEPORT_M) return obbDiscSeparationM(box, discX, discY, radiusM);
  const steps = sweepSteps(travel);
  if (steps === 1) return obbDiscSeparationM(box, discX, discY, radiusM);
  let best = Infinity;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const sep = obbDiscSeparationM(
      lerpInto(SCRATCH_A, prevBox, box, t),
      prevDisc.x + (discX - prevDisc.x) * t,
      prevDisc.y + (discY - prevDisc.y) * t,
      radiusM,
    );
    if (sep < best) best = sep;
    if (best <= CONTACT_TOLERANCE_M) return best;
  }
  return best;
}
