/**
 * CABIN LOOK — the mouse's way of reaching a control that is not in the
 * windscreen frame (founder review 2026-07-30, register rows FR-17/FR-25).
 *
 * HIS WORDS: „we must re-work the whole engine, first and upmost it must be
 * with the mouse" and „in the web if we make the Dashboard clickable its gonna
 * be user-friendly for example to put seat belt with B and with Mouse click
 * over the Dashboard seat-belt icon, and like that for ALL the buttons on the
 * dashboard".
 *
 * THE MEASURED GAP THIS CLOSES. All thirteen doc-69 hotspots have existed and
 * been clickable since A2 — but three of them are not IN THE PICTURE at the
 * shipped cockpit pose, so no mouse can reach them:
 *
 *   hotspot_belt          the buckle sits 0.66 m BELOW the eye and 0.035 m in
 *                         front of it — 80.5° straight down, i.e. at your own
 *                         right hip. It projects to frame-y −8.8.
 *   hotspot_mirror_right  x −0.905 across the cabin: frame-x 1.358, a third of
 *                         a screen off the right edge of a ~75.4° hFOV.
 *   hotspot_headlights    IS in frame (0.228, 0.151) — it was the „Подготовка
 *                         преди потегляне" panel on top of it, fixed in
 *                         PreDriveChecklist, not here.
 *
 * A real driver reaches those two by MOVING HIS HEAD, and that is what this
 * module encodes: named look poses (a yaw/pitch pair applied exactly like the
 * existing mirror-glance head turn in CameraRig) plus the projection math that
 * PROVES which control each pose puts on screen. Nothing here fakes a control
 * and nothing here completes a step: the student still operates the real
 * hotspot, which drives the same CabinControls/DrivelineState transition the
 * keyboard does, so `procedures/performedSteps.ts` cannot tell the devices
 * apart.
 *
 * WHY THE PROJECTION IS RE-DERIVED HERE INSTEAD OF IMPORTED FROM three: this
 * table is read by the DOM checklist (which control is on screen, and where),
 * by the camera rig and by the tests. Hand-rolling ~40 lines of matrix maths
 * keeps it a pure, allocation-free, framework-free function that a unit test
 * can sweep over every aspect ratio. It is validated against the shipped
 * three.js composition in `cabin-look.test.ts` — the same landmarks the
 * cockpit-camera contract pins, to 3 decimal places.
 *
 * Frame convention in this file: `FrameRect` fractions are measured from the
 * TOP-LEFT (CSS space), because every consumer compares them with a
 * getBoundingClientRect. The intermediate projection returns bottom-left NDC
 * fractions, like three's `Vector3.project` — the one place that flips.
 */

import {
  COCKPIT_ASPECT_REF,
  COCKPIT_EYE,
  COCKPIT_PITCH_BASE,
  cockpitVFovForAspect,
} from "../../vehicle/tuning";
import type { CockpitHotspotName } from "../../procedures/performedSteps";
import { COCKPIT_HOTSPOTS } from "./hotspots";

// ---------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------

/**
 * A head pose the student can put the cockpit camera into with the mouse.
 * `forward` is the driving pose and the only one the car is ever driven in —
 * every other pose is a temporary look that eases home when its step is done.
 */
export type CabinLookPoseId =
  | "forward"
  | "belt"
  | "console"
  | "mirrorLeft"
  | "mirrorRight"
  | "mirrorRear";

export interface CabinLookPose {
  id: CabinLookPoseId;
  /** Head yaw (rad); positive turns toward car-LEFT — same sign convention as
   *  CameraRig's GLANCE_OFFSETS, which these compose with. */
  yaw: number;
  /** Head pitch (rad) RELATIVE to the pitched base view; negative looks down. */
  pitch: number;
  /** Button copy in the checklist. */
  labelBg: string;
  /** What the student is being shown, for the aria-label / tooltip. */
  hintBg: string;
}

/**
 * The three poses, and where their angles come from.
 *
 *  · belt — aimed at hotspot_belt (yaw −71.6°, pitch −76.5° from the base
 *    view) and then biased BACK UP by +0.18 rad on pitch and +0.11 rad on yaw,
 *    which lands the buckle in the lower-left third of the frame
 *    (x 0.38–0.57, y 0.10–0.40 measured below) instead of dead centre. The
 *    bias is the difference between a lap-cam and a glance down: two thirds of
 *    the picture stay seat, console and door card, so the student can see WHAT
 *    he is looking at.
 *  · console — a SMALL drop of the chin (−8.6°) that exists for a defect this
 *    lane found while measuring the founder's row rather than for the row
 *    itself. The cockpit holds its ~75.4° HORIZONTAL FOV across window shapes
 *    (doc 71 §4.9), so a WIDE window buys its width by shrinking the vertical
 *    field: at 21:9 the vFOV falls from 47° to 36.7° and the SELECTOR, the
 *    PARKING BRAKE and the HORN drop off the bottom edge; a landscape phone
 *    (2.17:1) loses the last two. Ten of thirteen was a 16:9 number. This pose
 *    brings all of them back at every shape the app serves — and because the
 *    checklist only ever offers a look when the control is genuinely off
 *    screen, a 16:9 student never sees it.
 *  · mirrorRight — deliberately the EXACT angles of the graded right-mirror
 *    glance (CameraRig GLANCE_OFFSETS.right). Two consequences, both wanted:
 *    the pose is a head turn the student already performs during the mirror
 *    steps, and pressing the mirror after looking produces NO camera jump at
 *    all, because the glance crossfades onto the identical angle.
 *  · mirrorLeft / mirrorRear — THE TWO THE TABLE NEVER HAD, added by doc 91
 *    §I15 because the centre test below turned their absence from a silent
 *    inaccuracy into a dead end. Both pointed at `forward`, and at `forward`
 *    the geometry says (measured, every aspect the app serves):
 *      · the LEFT door mirror's centre projects at x −0.005 — five thousandths
 *        of a frame OUTSIDE the left edge. That is §L10's «🖱 Задръж Ляво
 *        огледало» at x −76: the chip is centred on that point and is ~145 px
 *        wide, so −4 px minus half a chip is −76 px, to the pixel.
 *      · the INTERIOR mirror's box top is ABOVE the frame from 2.0:1 onward
 *        (−0.134 at his 2.17:1), and the chip is anchored above the box top —
 *        §L10's «🖱 Задръж Вътрешно огледало» at y −83.
 *    `looksNeededFor()` skips `forward` by construction (the way home is its
 *    own permanent control), so „unreachable, pose = forward" would have
 *    offered the student nothing at all. These two are the honest answer, and
 *    they are GLANCE_OFFSETS.left / .rear verbatim for exactly the reason
 *    mirrorRight is: the pose IS the graded glance, so there is no jump when
 *    the student presses the mirror he has just turned to look at.
 */
export const CABIN_LOOK_POSES: Record<CabinLookPoseId, CabinLookPose> = {
  forward: {
    id: "forward",
    yaw: 0,
    pitch: 0,
    labelBg: "Върни погледа напред",
    hintBg: "Обратно към нормалния изглед през предното стъкло",
  },
  belt: {
    id: "belt",
    yaw: -1.141,
    pitch: -1.155,
    labelBg: "Погледни надолу към колана",
    hintBg: "Наведи поглед към ключалката на предпазния колан до седалката",
  },
  console: {
    id: "console",
    yaw: 0,
    pitch: -0.15,
    labelBg: "Погледни към конзолата",
    hintBg: "Наведи поглед към скоростния лост, ръчната спирачка и клаксона",
  },
  mirrorLeft: {
    id: "mirrorLeft",
    // CameraRig GLANCE_OFFSETS.left, verbatim.
    yaw: 0.67,
    pitch: -0.15,
    labelBg: "Погледни към лявото огледало",
    hintBg: "Обърни глава наляво, към лявото външно огледало",
  },
  mirrorRight: {
    id: "mirrorRight",
    yaw: -0.93,
    pitch: -0.09,
    labelBg: "Погледни към дясното огледало",
    hintBg: "Обърни глава надясно, към дясното външно огледало",
  },
  mirrorRear: {
    id: "mirrorRear",
    // CameraRig GLANCE_OFFSETS.rear, verbatim.
    yaw: -0.28,
    pitch: 0.06,
    labelBg: "Погледни в огледалото за задно виждане",
    hintBg: "Вдигни поглед към вътрешното огледало над таблото",
  },
};

export const CABIN_LOOK_POSE_IDS: readonly CabinLookPoseId[] = [
  "forward",
  "belt",
  "console",
  "mirrorLeft",
  "mirrorRight",
  "mirrorRear",
];

// ---------------------------------------------------------------------------
// Projection (the shipped cockpit camera, re-derived without three)
// ---------------------------------------------------------------------------

type Mat3 = readonly number[]; // row-major 3×3

function mul(a: Mat3, b: Mat3): number[] {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

function rotY(t: number): number[] {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

function rotX(t: number): number[] {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

/**
 * The camera's world rotation, matching CameraRig exactly:
 *   quat = FLIP_Y · Euler(COCKPIT_PITCH_BASE,0,0) · Euler(headPitch,headYaw,0,"YXZ")
 * (three's YXZ order composes as Ry·Rx·Rz, and roll is 0 here).
 */
function cameraRotation(yaw: number, pitch: number): number[] {
  return mul(mul(rotY(Math.PI), rotX(COCKPIT_PITCH_BASE)), mul(rotY(yaw), rotX(pitch)));
}

/** Frame fractions from the BOTTOM-LEFT (three's NDC convention). */
export interface ProjectedPoint {
  x: number;
  y: number;
  /** False when the point is behind the lens — its x/y are then meaningless. */
  ahead: boolean;
}

/**
 * Project a chassis-local point through the cockpit camera at a look pose.
 * Pure and allocation-light; called at most a few dozen times per step change.
 */
export function projectCockpitPoint(
  point: readonly [number, number, number],
  poseId: CabinLookPoseId,
  aspect: number = COCKPIT_ASPECT_REF,
): ProjectedPoint {
  const pose = CABIN_LOOK_POSES[poseId];
  const r = cameraRotation(pose.yaw, pose.pitch);
  const dx = point[0] - COCKPIT_EYE.x;
  const dy = point[1] - COCKPIT_EYE.y;
  const dz = point[2] - COCKPIT_EYE.z;
  // v = Rᵀ·d — the point in camera space (cameras look down their local −Z).
  const vx = r[0] * dx + r[3] * dy + r[6] * dz;
  const vy = r[1] * dx + r[4] * dy + r[7] * dz;
  const vz = r[2] * dx + r[5] * dy + r[8] * dz;
  if (vz >= 0) return { x: 0, y: 0, ahead: false };
  const t = Math.tan((cockpitVFovForAspect(aspect) * Math.PI) / 360);
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : COCKPIT_ASPECT_REF;
  return {
    x: (vx / (-vz * t * safeAspect) + 1) / 2,
    y: (vy / (-vz * t) + 1) / 2,
    ahead: true,
  };
}

// ---------------------------------------------------------------------------
// Hotspot screen rects
// ---------------------------------------------------------------------------

/** Fractions of the canvas measured from its TOP-LEFT corner (CSS space). */
export interface FrameRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const HOTSPOT_BY_NAME = new Map(COCKPIT_HOTSPOTS.map((h) => [h.name, h]));

/**
 * Screen-space bounding box of a hotspot's raycast proxy at a look pose, or
 * null when any corner of the box falls behind the lens (the honest answer:
 * "there is no rectangle on this screen for this control").
 */
export function hotspotScreenRect(
  name: CockpitHotspotName,
  poseId: CabinLookPoseId,
  aspect: number = COCKPIT_ASPECT_REF,
): FrameRect | null {
  const spec = HOTSPOT_BY_NAME.get(name);
  if (spec === undefined) return null;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let topFromBottom = Number.NEGATIVE_INFINITY;
  let bottomFromBottom = Number.POSITIVE_INFINITY;
  for (const sx of [-0.5, 0.5]) {
    for (const sy of [-0.5, 0.5]) {
      for (const sz of [-0.5, 0.5]) {
        const p = projectCockpitPoint(
          [
            spec.pos[0] + sx * spec.size[0],
            spec.pos[1] + sy * spec.size[1],
            spec.pos[2] + sz * spec.size[2],
          ],
          poseId,
          aspect,
        );
        if (!p.ahead) return null;
        left = Math.min(left, p.x);
        right = Math.max(right, p.x);
        bottomFromBottom = Math.min(bottomFromBottom, p.y);
        topFromBottom = Math.max(topFromBottom, p.y);
      }
    }
  }
  // Flip to CSS space: NDC y grows upward, CSS y grows downward.
  return { left, right, top: 1 - topFromBottom, bottom: 1 - bottomFromBottom };
}

/**
 * Smallest span (fraction of the canvas, per axis) a control's VISIBLE part
 * must have before it counts as something a mouse can hit. 0.02 is ~22 px wide
 * on an 1100 px scene box and ~12 px tall on the 619 px it is actually served
 * at — a small but real target, the size of a checkbox.
 *
 * The predicate deliberately clips to the frame instead of demanding the whole
 * proxy box be inside it: several real controls (the left door mirror, the
 * selector, the horn) sit half out of the picture at the shipped pose and are
 * hit every day on the half that shows. Demanding the whole box would have
 * declared three MORE controls unreachable than the founder measured, and
 * "unreachable" would then have meant nothing.
 */
export const MIN_TARGET_SPAN = 0.02;

/**
 * THE CENTRE TEST — doc 91 · L10/D11/I15, and it is the half this predicate was
 * missing rather than a tightening of the half it had.
 *
 * MEASURED (§L10, on his handset at 2.17:1): «🖱 Задръж Ляво огледало» rendered
 * at **x −76** and «🖱 Задръж Вътрешно огледало» at **y −83**. Both chips are
 * gated on `hotspotIsReachable`, so a `true` there is what PUT them there — the
 * control kept a sliver inside the frame, the span test passed on that sliver,
 * and the chip was then positioned at the control's own CENTRE, which is off
 * the canvas. `looksNeededFor()` reads the same predicate, so no head turn was
 * offered either: the app silently claimed a mirror was in the picture while
 * the only thing in the picture was its edge.
 *
 * So the span rule and this one answer two different questions and the code
 * needs both:
 *   · SPAN (`MIN_TARGET_SPAN`) — „is there enough of it to hit?"  Deliberately
 *     forgiving, because the left door mirror, the selector and the horn are
 *     half out of frame at the shipped pose and are hit every day on the half
 *     that shows. That reasoning is unchanged and the constant is untouched.
 *   · CENTRE — „is the thing itself in the picture, or only its edge?"  This is
 *     what a LABEL and a CLICK POINT need, and both are derived from here.
 *
 * The rect passed to the test is the UNCLIPPED one on purpose: the clipped
 * rect's centre is inside [0,1] by construction (it is clipped to it), so
 * testing that would be a no-op that reads like a fix.
 */
function screenCentreIsInFrame(r: FrameRect): boolean {
  const cx = (r.left + r.right) / 2;
  const cy = (r.top + r.bottom) / 2;
  return cx >= 0 && cx <= 1 && cy >= 0 && cy <= 1;
}

/** The visible part of a hotspot, clipped to the canvas — null if nothing of
 *  it is on screen, if only its edge is (see `screenCentreIsInFrame`), or if
 *  it is behind the lens. */
export function hotspotVisibleRect(
  name: CockpitHotspotName,
  poseId: CabinLookPoseId,
  aspect: number = COCKPIT_ASPECT_REF,
): FrameRect | null {
  const r = hotspotScreenRect(name, poseId, aspect);
  if (r === null) return null;
  if (!screenCentreIsInFrame(r)) return null;
  const left = Math.max(0, r.left);
  const right = Math.min(1, r.right);
  const top = Math.max(0, r.top);
  const bottom = Math.min(1, r.bottom);
  if (right - left < MIN_TARGET_SPAN || bottom - top < MIN_TARGET_SPAN) return null;
  return { left, right, top, bottom };
}

/**
 * ── THE LABEL ANCHOR, AND WHY `hotspotIsReachable` IS NOT IT ─────────────────
 *
 * MEASURED ON THE PRODUCTION BUILD, three landscape profiles, authenticated
 * `/simulator`, on step 2 («Настройка на огледалата») —
 * `tools/mobile/wave6-cards.mjs`:
 *
 *     iPhone 16 landscape          «🖱 Задръж Вътрешно огледало»  @ 509, **−88**
 *     small landscape 780×360      same chip                      @ 458, **−81**
 *     galaxy gesture-bar landscape same chip                      @ 458, **−81**
 *
 * §L10 photographed that chip at **y −83** on his own handset. The centre test
 * above did NOT close it, and the reason is worth stating because it is the
 * whole lesson of this row: at 2.17:1 the interior mirror's centre is at
 * y 0.015 — six pixels inside the top edge, so `centre ∈ [0,1]` says yes —
 * while its BOX TOP is at −0.134, and `VitokCockpit` anchors the chip ABOVE the
 * box top (`pos.y + size.y/2 + 0.045`) precisely so the label does not cover
 * the control it names. The predicate was answering a different question from
 * the one the caller was asking.
 *
 * So the anchor is computed HERE, from the same numbers the component renders
 * with, and the component asks about the point it is actually going to use.
 * `hotspotIsReachable` keeps its own meaning — „can a pointer hit it" — which
 * is the right question for the checklist's head-turn logic and the wrong one
 * for a label.
 */
export const HOTSPOT_LABEL_LIFT_M = 0.045;

/**
 * Where the „🖱 Задръж …" chip lands, in canvas fractions from the top-left,
 * plus WHICH SIDE of the control it had to go on — or null when neither side is
 * on the canvas, in which case no chip may be drawn at all.
 *
 * ABOVE IS THE DEFAULT AND BELOW IS THE FALLBACK, and the fallback is not
 * hypothetical: the INTERIOR MIRROR sits high in the frame by construction (it
 * is above the windscreen), so a chip 45 mm above its top edge projects off the
 * canvas at *every* pose, including the `mirrorRear` glance that exists for it.
 * „Then it gets no chip" was the other option and it is worse — the mirror step
 * is a graded A2 action and the label is how a 17-year-old learns which mirror
 * is which. So it flips under, where there is always room, and the caller
 * renders it there.
 */
export function hotspotLabelPoint(
  name: CockpitHotspotName,
  poseId: CabinLookPoseId,
  aspect: number = COCKPIT_ASPECT_REF,
): { x: number; y: number; side: "above" | "below"; lift: number } | null {
  const spec = HOTSPOT_BY_NAME.get(name);
  if (spec === undefined) return null;
  const half = spec.size[1] / 2;
  for (const [side, lift] of [
    ["above", half + HOTSPOT_LABEL_LIFT_M],
    ["below", -half - HOTSPOT_LABEL_LIFT_M],
  ] as const) {
    const p = projectCockpitPoint(
      [spec.pos[0], spec.pos[1] + lift, spec.pos[2]],
      poseId,
      aspect,
    );
    if (!p.ahead) continue;
    const x = p.x;
    const y = 1 - p.y; // NDC grows upward, CSS grows downward
    if (x < 0 || x > 1 || y < 0 || y > 1) continue;
    return { x, y, side, lift };
  }
  return null;
}

/** True when a chip for this control would be drawn ON the canvas. */
export function hotspotLabelIsOnScreen(
  name: CockpitHotspotName,
  poseId: CabinLookPoseId,
  aspect: number = COCKPIT_ASPECT_REF,
): boolean {
  return hotspotLabelPoint(name, poseId, aspect) !== null;
}

/** True when enough of the control is on screen for a mouse to hit it. */
export function hotspotIsReachable(
  name: CockpitHotspotName,
  poseId: CabinLookPoseId,
  aspect: number = COCKPIT_ASPECT_REF,
): boolean {
  return hotspotVisibleRect(name, poseId, aspect) !== null;
}

/**
 * Where to put the pointer to operate a control: the centre of its visible
 * part, in canvas fractions from the top-left. Null when it is not on screen.
 * This is what the acceptance drive clicks — the same number the checklist
 * uses to decide whether it is standing on top of the control.
 */
export function hotspotClickPoint(
  name: CockpitHotspotName,
  poseId: CabinLookPoseId,
  aspect: number = COCKPIT_ASPECT_REF,
): { x: number; y: number } | null {
  const r = hotspotVisibleRect(name, poseId, aspect);
  if (r === null) return null;
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}

/**
 * THE REACH TABLE: for each of the thirteen controls, the pose that is
 * GUARANTEED to put it on screen — the fallback a UI turns to when the control
 * is not reachable from where the student is already looking. `cabinLook.test`
 * asserts every entry by projection at every window shape the app serves, so
 * this map can never drift from the geometry it claims.
 *
 * Read it as a fallback, not as an instruction: at the 16:9 reference exactly
 * two of these are needed (belt, right mirror) and a student is never asked to
 * move his head for the other eleven. The `console` entries only come into
 * play on a window wide enough to squeeze the vertical field — see the pose's
 * own note above.
 */
export const CABIN_LOOK_FOR_HOTSPOT: Record<CockpitHotspotName, CabinLookPoseId> = {
  hotspot_engine_start: "forward",
  hotspot_belt: "belt",
  hotspot_gear_selector: "console",
  hotspot_parking_brake: "console",
  // The two STALKS sit lower in the frame than the switches beside them
  // (cy 0.935 at 16:9), so on a wide window they cross the bottom edge with
  // everything else on the lower console. `console` is their fallback for the
  // same reason it is the selector's — and, exactly as with the selector, a
  // 16:9 student never sees it offered, because at 16:9 they are reachable
  // from `forward` and the checklist only offers a look when they are not.
  hotspot_indicator_stalk: "console",
  hotspot_wiper_stalk: "console",
  hotspot_headlights: "forward",
  hotspot_hazard: "forward",
  hotspot_horn: "console",
  hotspot_mirror_left: "mirrorLeft",
  hotspot_mirror_right: "mirrorRight",
  hotspot_mirror_rear: "mirrorRear",
  hotspot_fog: "forward",
};

export function cabinLookForHotspot(name: CockpitHotspotName): CabinLookPoseId {
  return CABIN_LOOK_FOR_HOTSPOT[name];
}

/**
 * The topmost edge of any control whose visible part enters a vertical column
 * of the canvas — i.e. how far down a HUD panel pinned in that column may
 * reach before it starts covering a control the lesson tells the student to
 * click.
 *
 * This is the number the checklist's height cap is derived from, and the
 * reason it is computed rather than eyeballed: the founder measured a light
 * switch that „falls under the Подготовка преди потегляне panel", and a
 * hand-picked pixel value would drift the first time a hotspot moves.
 * Returns 1 when the column is clear of every control at that pose.
 */
export function topmostControlEdgeInColumn(
  columnLeft: number,
  columnRight: number,
  poseId: CabinLookPoseId = "forward",
  aspect: number = COCKPIT_ASPECT_REF,
): number {
  let top = 1;
  for (const spec of COCKPIT_HOTSPOTS) {
    const r = hotspotVisibleRect(spec.name, poseId, aspect);
    if (r === null) continue;
    if (r.right <= columnLeft || r.left >= columnRight) continue;
    top = Math.min(top, r.top);
  }
  return top;
}

/**
 * WIDTH of the top-left HUD column the pre-drive panel is allowed to occupy
 * (fraction of the scene box). `w-80` = 320 px inside a scene box that is
 * 1100 px wide at the shipped /simulator geometry ⇒ 0.30, and the +12 px
 * `left-3` inset is inside this. Kept as a named number so the cap below and
 * the panel's own Tailwind width are checked against each other by a test.
 */
export const HUD_LEFT_COLUMN_FRACTION = 0.32;

/**
 * HOW TALL a top-left HUD panel may be, as a fraction of the scene box, before
 * it covers a cockpit control. Derived, not chosen: the highest control that
 * reaches into the left column at the driving pose is the LEFT DOOR MIRROR,
 * whose visible top edge sits at 0.65 of the canvas; 0.55 leaves a tenth of the
 * frame of clearance, which survives a scene box of any shape the app serves.
 * `cabin-look.test.ts` fails if a hotspot ever moves above it.
 */
export const HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION = 0.55;
