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
// «Re-anchor the mirror» — the interior mirror on WIDE canvases
// (founder ruling 2026-09-22, row sc-mw-emergency-lane:3ffb0692)
// ---------------------------------------------------------------------------
//
// THE DEFECT, IN THE CAMERA'S OWN UNITS. hFOV is locked (`cockpitVFovForAspect`),
// so a wider canvas gets a NARROWER vertical field: 47° at 16:9, 39.25° on the
// audited phones in landscape (iphone16-landscape 852×393 → 2.168,
// small-landscape 780×360 → 2.167 — `tools/mobile/lib/devices.mjs`). The cabin
// geometry is authored against one window shape, so on the phones the header's
// front edge projects at fy 1.058 — above the frame — while the mirror glass
// top sits at fy ~1.0 and nothing that attaches it to the car is on screen:
// „a black housing floating detached in open sky … clipped by the top edge".
//
// THE RULING'S TWO CONSTRAINTS, and why they leave exactly one lever:
//   · „keep the cockpit camera and road-sign sizes as they are" — so the vFOV
//     floor `VitokCockpit.tsx` once routed (Math.max(…, COCKPIT_FOV)) is OUT;
//   · „pin the mirror to the VISIBLE windscreen header" — so the header must
//     be on screen and the mirror must hang below it.
// A header drawn above the glass has no room on the phones (the glass itself
// touches row 0 — `cockpitMirrorEdge.test.ts` holds the arithmetic), so BOTH
// come down, and only on the canvases that need it:
//
//   1. the header's front edge is lowered until it sits `HEADER_VISIBLE_BAND`
//      of frame height inside the top edge (`cockpitHeaderDropM`);
//   2. the whole mirror station follows so its glass keeps EXACTLY the angular
//      offset below that edge it has at 16:9, where the founder signed the
//      composition off (`rearMirrorStationDropM`).
//
// Both are pure functions of the canvas ASPECT — never of the live, speed-
// widened fov, or the header would breathe with the throttle — and both are 0
// at 16:9 and at every squarer window (PC 1440×900, phones upright), so the
// reference build does not move by a millimetre.
//
// WHAT IT COSTS, STATED, because a lever is never free:
//   · the mirror sits LOWER in the phone frame, so the DOM rail that steps
//     below it (`--sim-mirror-h`, notifyColumn's mirror band) steps further
//     down — they read this same projection, so they follow;
//   · B58 raised the station 105 mm so the В26 «50» on the speeding drill clears
//     the housing (threshold 92.8 mm at the lane centre — an ANGULAR fact,
//     identical at every aspect). A station drop spends that raise back, so the
//     drop is CAPPED at what B58 can afford — see
//     `REAR_MIRROR_STATION_DROP_MAX_M` below, and read it before reading the
//     composition figure: on the phones the cap binds, and the mirror therefore
//     does NOT reach the offset below the header that 16:9 has.

/** The interior mirror's raycast proxy — the node the station drop moves. */
const REAR_MIRROR_HOTSPOT: CockpitHotspotName = "hotspot_mirror_rear";

/**
 * The windscreen header's front edge, chassis-local — VitokCockpit's
 * `ROOF_Y` / `ROOF_FRONT_Z` (the B58 re-solve). Its projected row does not
 * depend on x in the forward pose (the camera only pitches), so one (y, z)
 * pair is the whole edge.
 */
export const COCKPIT_HEADER_EDGE = { y: 0.945, z: 0.481 } as const;

/**
 * The HIGHEST-projecting point of the rigged interior-mirror glass's top edge,
 * chassis-local: the GLB quad corner (local (+0.1125, +0.0375)) carried through
 * the node (GLB (0, 1.458, −0.5), the shipped quaternion, scale 0.84 — read off
 * hero_interior.glb), MirrorRig's REF 8 eye-ray lift (60 mm, shrink
 * (d − lift)/d) and its 14 mm MIRROR_DROP_M. Cross-check: y 0.9086 is B58's
 * own published glass-top figure, reproduced to four places.
 */
export const REAR_MIRROR_GLASS_TOP: readonly [number, number, number] = [-0.0671, 0.9086, 0.4223];

/**
 * How far inside the top of the frame the header's edge must sit to be a
 * VISIBLE header, as a fraction of frame height: 2 % = 7.9 CSS px on the
 * 393 px iPhone-16 landscape canvas, 7.2 px on the 360 px Android. Deliberately
 * the smallest band that reads as a rail rather than a stray line — every
 * extra point of band is another point the mirror has to come down, and B58's
 * sign clearance is what that comes out of (see the block above).
 */
export const HEADER_VISIBLE_BAND = 0.02;

/** tan(elevation) of a chassis point in the FORWARD pose's camera space —
 *  aspect-independent, so it can be compared against any canvas's frame top. */
function forwardTanElevation(point: readonly [number, number, number]): number {
  const p = projectCockpitPoint(point, "forward", COCKPIT_ASPECT_REF);
  if (!p.ahead) return Number.NaN;
  return (2 * p.y - 1) * Math.tan((cockpitVFovForAspect(COCKPIT_ASPECT_REF) * Math.PI) / 360);
}

/**
 * THE CAP ON THE STATION DROP — AND IT BINDS AT ZERO TODAY, 2026-09-23.
 *
 * The composition-true station drop (`rearMirrorStationDropUncappedM`: 36.4 mm
 * on both audited phones, 48.6 mm on the 780 × 340 stage) is what «the glass
 * keeps the 16:9 offset below the header» asks for. It is not affordable, and
 * neither bar that refuses it is a preference:
 *
 *  1. B58, the founder's own earlier ruling — worth 12.2 mm. The station was
 *     RAISED 105 mm so the В26 «50» the speeding drill tells the student to read
 *     clears the assembly; the measured threshold is 92.8 mm at the lane centre
 *     (`tools/glb/raise_interior_mirror.mjs`, swept at 50 mm steps along
 *     ov-keepright-v1). Occlusion is a ray question, identical at every aspect,
 *     so a station drop of d leaves 105 − d mm: d ≤ 12.2 mm. (And that spends
 *     the margin B58 bought on top: the same sweep needs 104.6 mm for a student
 *     drifting 0.75 m right, toward the plate.)
 *
 *  2. THE PHONE HUD — worth 0.1 mm, which is why this constant is 0. The
 *     notification column, the first-run touch hint and the audio prompt all
 *     hang below the mirror's projected floor
 *     (`hud/notifyColumn.MIRROR_BAND_BOTTOM_FRACTION_COMPACT_LANDSCAPE`), and
 *     that floor moves down with this drop — 0.0018 of stage height per mm. The
 *     corridor left between it and the thumb controls, measured:
 *       852 × 393  the hint needs 124.5 px, the corridor holds 126.76 → 2.26 px
 *       780 × 340  the hint already scrolls 20.94 px against a bound of 21
 *                  → 0.06 px
 *     At the B58 bar (12.2 mm) the hint would clip 6.4 px on the handset the
 *     catalogue was shot on — the one stage where the pinned answer is «clips
 *     NOTHING» — and at the composition-true 36.4 mm the 780 × 360 card's floor
 *     lands 9 px INSIDE the 0.53 hazard band.
 *
 * SO WHAT LANDED IS THE HEADER, WHICH COSTS NEITHER BAR: it comes down until it
 * is visible, and because the header pad sits BEHIND the glass (chassis z 0.481
 * vs 0.4223, with the eye behind both) the mirror now reads against a header
 * instead of against open sky — the first half of the founder's sentence. The
 * half this cap does NOT buy is the second: the glass top stays at fy 1.0199,
 * i.e. the housing is still cut by the top edge on the phones.
 *
 * THE REMAINING LEVER IS THE CARD, AND IT IS A FOUNDER QUESTION. Freeing the
 * corridor means moving the notification column out of the mirror's x band
 * (0.574 → 0.866 of the stage at every landscape aspect); the right edge has
 * 43 px of width beside it on a notched handset and the left corridor already
 * holds the «Меню» rail, the open demonstration deck and the LEFT DOOR MIRROR —
 * the instrument lane B has just made live. Once that ruling exists, this
 * constant is the one number that changes, and `mirrorAnchor.test.ts` holds what
 * each value of it costs.
 */
export const REAR_MIRROR_STATION_DROP_MAX_M = 0;

/** Smallest drop d in [0, hi] with f(d) <= limit, for f decreasing in d. */
function solveDrop(f: (d: number) => number, limit: number, hi = 0.3): number {
  if (!(f(0) > limit)) return 0;
  if (f(hi) > limit) return hi;
  let lo = 0;
  let top = hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + top) / 2;
    if (f(mid) > limit) lo = mid;
    else top = mid;
  }
  // Rounded UP to 0.1 mm: a mesh never re-uploads for float noise on resize,
  // and rounding up can only put the edge further inside the frame.
  return Math.ceil(top * 1e4) / 1e4;
}

function validAspect(aspect: number): boolean {
  return Number.isFinite(aspect) && aspect > 0;
}

let headerMemo: { aspect: number; drop: number } | null = null;
let stationMemo: { aspect: number; drop: number } | null = null;

/**
 * How far the windscreen header's front edge comes DOWN on a canvas of this
 * aspect so it is visible (`HEADER_VISIBLE_BAND` inside the top edge), metres.
 * 0 wherever it already is — 16:9, every squarer window, phones upright.
 */
export function cockpitHeaderDropM(aspect: number): number {
  if (!validAspect(aspect)) return 0;
  if (headerMemo !== null && headerMemo.aspect === aspect) return headerMemo.drop;
  const frameTop = Math.tan((cockpitVFovForAspect(aspect) * Math.PI) / 360);
  const limit = frameTop * (1 - 2 * HEADER_VISIBLE_BAND);
  const { y, z } = COCKPIT_HEADER_EDGE;
  const drop = solveDrop((d) => forwardTanElevation([0, y - d, z]), limit);
  headerMemo = { aspect, drop };
  return drop;
}

/**
 * How far the WHOLE interior-mirror station (glass, housing, authored casing,
 * the mount's lower end, the click proxy) comes DOWN on a canvas of this
 * aspect, metres: enough that the glass top keeps the angular offset below the
 * (lowered) header edge that it has at 16:9 — or `REAR_MIRROR_STATION_DROP_MAX_M`,
 * whichever is SMALLER, because that offset is not affordable on the phones (the
 * cap's own block says by which two bars). 0 wherever the header needed no drop,
 * so it is 0 at 16:9 by construction.
 */
export function rearMirrorStationDropM(aspect: number): number {
  return Math.min(rearMirrorStationDropUncappedM(aspect), REAR_MIRROR_STATION_DROP_MAX_M);
}

/**
 * …and the SAME drop before the cap — the composition-true one, which is what
 * «the glass keeps its 16:9 offset below the header» would need. Published so
 * the cost of the cap is a number a test can hold, not a sentence.
 */
export function rearMirrorStationDropUncappedM(aspect: number): number {
  if (!validAspect(aspect)) return 0;
  if (stationMemo !== null && stationMemo.aspect === aspect) return stationMemo.drop;
  const headerDrop = cockpitHeaderDropM(aspect);
  let drop = 0;
  if (headerDrop > 0) {
    const { y, z } = COCKPIT_HEADER_EDGE;
    const [gx, gy, gz] = REAR_MIRROR_GLASS_TOP;
    const gap = forwardTanElevation([0, y, z]) - forwardTanElevation(REAR_MIRROR_GLASS_TOP);
    const limit = forwardTanElevation([0, y - headerDrop, z]) - gap;
    drop = solveDrop((d) => forwardTanElevation([gx, gy - d, gz]), limit);
  }
  stationMemo = { aspect, drop };
  return drop;
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
  /**
   * The interior-mirror re-anchor drop the RENDERED cockpit carries, metres.
   * Defaults to the drop for `aspect`, which is right whenever `aspect` is the
   * canvas's real aspect. A caller that passes a SPEED-EQUIVALENT aspect
   * (CameraRig inverts the widened fov) must pass the real canvas's drop here,
   * or the projection would move the mirror with the throttle while the mesh
   * does not. Only `hotspot_mirror_rear` reads it.
   */
  rearStationDropM: number = rearMirrorStationDropM(aspect),
): FrameRect | null {
  const spec = HOTSPOT_BY_NAME.get(name);
  if (spec === undefined) return null;
  const dropY = name === REAR_MIRROR_HOTSPOT ? rearStationDropM : 0;
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
            spec.pos[1] - dropY + sy * spec.size[1],
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
