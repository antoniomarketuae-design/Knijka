/**
 * Capture-plan math (pure, node-testable) — the deterministic half of the
 * CaptureScene v2 rig, built to docs/development/66 (produced-media law):
 *
 *  - captureWindowFor  — the trim window anchored on the PLAN's ENGINE-computed
 *    faultTimeSec (R3 — never annotation-guessed), grown 1–2 s earlier when a
 *    positioned governing control must pass through frame (R2), and shaved off
 *    the trace end so ShadowCar's loop-wrap can never record a "hop" (R5 №6).
 *  - keyframeTimes     — the five R0 stills: window start, fault−2, fault,
 *    fault+2, window end (clamped, non-decreasing).
 *  - controlPassTimeSec / plannedChasePose — the two-keyframe exterior camera:
 *    oriented wider toward the governing control until the ghost passes it,
 *    then a smooth deterministic blend back to the standard chase framing.
 *    Pure function of playback time — no damping state, so there is nothing
 *    to "settle" and nothing that can pop (R5).
 *  - cabinChannelsFor  — belt/lights channels for the cockpit + dashboard
 *    strip. HONESTY NOTE: committed traces carry gear/indicator/brake/throttle
 *    per sample but NOT belt/lights (the scripted recorder holds those as
 *    internal channels); the graded codeRefs of the mistake are the stored
 *    machine truth of which cabin channel is wrong, so the strip derives belt/
 *    lights from them + the recorder's own defaults (belt on; lights low at
 *    night, off by day). Documented per doc 66 R4 "choose the honest cheap one".
 *  - dashModelFor      — the canvas twin of the DOM StatusDashboard's essential
 *    telltales (belt / lights / gear / speed / blinkers), field-for-field the
 *    hud/dashboardStatus vocabulary, driven from the trace samples.
 *  - actorSpawned      — the R1 checklist matcher: PLAN requiredActors vs what
 *    the capture stack actually put IN THE PLANNED FRAME during the fault beat
 *    (pilot-v2 lesson: the staged pool count LIED — a dormant actor parked
 *    540 m away, or a blind-spot pace car 39 m BEHIND the chase camera, both
 *    counted "present" while the founder saw an empty frame; presence is now
 *    measured with actorInPlannedFrame over [fault−0.5, fault+0.5]).
 */

import { CHASE_FOV, COCKPIT_EYE, COCKPIT_PITCH_BASE } from "@/modules/sim/vehicle";
import { recordingWindow, type RecordingWindow } from "./trim";

// ---------------------------------------------------------------------------
// Window + keyframes (R2, R3, R5)
// ---------------------------------------------------------------------------

/** Extra lead-in when a POSITIONED governing control must pass through frame. */
export const CONTROL_LEAD_S = 2;
/** The control must be visible AHEAD for at least this long before the ghost
 *  passes it (pilot v2 lesson: В24/В27 were already BEHIND the car at the
 *  window start — no camera can show a sign the window never contains). */
export const CONTROL_APPROACH_S = 2.5;
/** Window-length guard: never open more than this long before the fault even
 *  for an early control pass (keeps clips fault-centered per trim.ts). */
export const CONTROL_MAX_PRE_FAULT_S = 16;
/** Never let the window touch the trace end — ShadowCar wraps its clock to 0
 *  there, and one wrapped frame in the recording is the v1 №6 "hop". */
export const WINDOW_END_GUARD_S = 0.08;

/**
 * The v2 recording window: engine fault time in, hop-guarded window out.
 * `control` carries the trace-computed PASS time of the positioned governing
 * control (controlPassTimeSec over the WHOLE trace, startSec 0): the window
 * opens early enough that the sign is ahead of the car for CONTROL_APPROACH_S
 * before it passes — doc 66 R2 anchored on data, not on a fixed lead.
 */
export function captureWindowFor(
  durationSec: number,
  faultTimeSec: number,
  control: { passTSec: number } | null,
): RecordingWindow {
  const base = recordingWindow(durationSec, faultTimeSec);
  let startSec = base.startSec;
  if (control) {
    startSec = Math.min(base.startSec - CONTROL_LEAD_S, control.passTSec - CONTROL_APPROACH_S);
    startSec = Math.max(startSec, faultTimeSec - CONTROL_MAX_PRE_FAULT_S);
  }
  startSec = Math.max(0, startSec);
  const endSec = Math.max(
    Math.min(base.endSec, durationSec - WINDOW_END_GUARD_S),
    Math.min(startSec + 1, durationSec), // degenerate ultra-short traces
  );
  return { startSec, endSec };
}

/** Half-width of the fault BEAT, s — the k1..k3 keyframe band. */
export const FAULT_BEAT_SPAN_S = 2;
/** Half-width of the R1 PRESENCE band, s — deliberately narrower than the
 *  keyframe beat: the actor the mistake concerns must be in frame AT THE
 *  FAULT (founder pilot-v2 ruling on sc-roundabout-entry: the circulator
 *  visible at fault−2 but gone from the fault frame is an ABSENT conflict —
 *  the viewer never sees WHY the entry was wrong). */
export const FAULT_PRESENCE_SPAN_S = 0.5;

/** The five R0 stills: [start, fault−2, fault, fault+2, end], clamped into the
 *  window and forced non-decreasing (duplicates allowed — always 5 entries). */
/** The fewest DISTINCT capture instants an R0 strip may carry (pilot-v2 7b
 *  hardening): start, one mid-window beat, end. Fewer would leave the fault
 *  visually unverifiable on short/degenerate windows. */
export const KEYFRAME_MIN_DISTINCT = 3;

export function keyframeTimes(window: RecordingWindow, faultTimeSec: number): number[] {
  const raw = [
    window.startSec,
    faultTimeSec - FAULT_BEAT_SPAN_S,
    faultTimeSec,
    faultTimeSec + FAULT_BEAT_SPAN_S,
    window.endSec,
  ];
  const out: number[] = [];
  let floor = window.startSec;
  for (const t of raw) {
    const clamped = Math.min(Math.max(t, floor), window.endSec);
    out.push(clamped);
    floor = clamped;
  }
  // SHORT-WINDOW CLAMP LAW (7b): when the fault anchor falls outside (or on
  // the edge of) the window, the clamp above can collapse the strip onto the
  // two boundaries — an R0 strip with under three distinct instants cannot
  // show before/at/after. Fall back to the even five-point spread over the
  // window; every real window is ≥ 1 s (captureWindowFor's degenerate floor),
  // so the spread instants stay distinct.
  if (new Set(out).size < KEYFRAME_MIN_DISTINCT && window.endSec > window.startSec) {
    const span = window.endSec - window.startSec;
    return [0, 0.25, 0.5, 0.75, 1].map((u) => window.startSec + span * u);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The planned exterior camera (R2 — control in frame, then settle to chase)
// ---------------------------------------------------------------------------

/** v1 chase framing constants (kept — the founder saw and accepted this
 *  framing wherever the CONTENT was right). */
export const CAM_BACK_M = 8.5;
export const CAM_UP_M = 3.4;
export const CAM_LOOK_AHEAD_M = 7;
export const CAM_LOOK_UP_M = 1.1;

/** Control-phase framing: slightly wider + higher, look pulled toward the
 *  control, blended out over CONTROL_BLEND_OUT_S after the ghost passes it. */
export const CONTROL_EXTRA_BACK_M = 2.2;
export const CONTROL_EXTRA_UP_M = 1.0;
export const CONTROL_LOOK_WEIGHT = 0.65;
export const CONTROL_LOOK_UP_M = 1.6;
export const CONTROL_BLEND_OUT_S = 0.8;
/** The ghost "passed" the control when it is this close (a sign right at the
 *  stop line) — the behind-test catches the normal drive-past case. */
export const CONTROL_PASS_RADIUS_M = 6;

const DEG2RAD = Math.PI / 180;

/** Minimal structural slice of a trace the camera math needs. */
export interface CameraTraceLike {
  samples: ReadonlyArray<{ tSec: number; x: number; y: number; headingDeg: number }>;
}

/**
 * When the ghost passes the governing control: the first sample in
 * [startSec, faultTimeSec] where the control sits BEHIND the car (forward
 * projection < 0) or within CONTROL_PASS_RADIUS_M. Falls back to faultTimeSec
 * (orient until the fault, then settle) — deterministic per trace.
 */
export function controlPassTimeSec(
  trace: CameraTraceLike,
  control: { x: number; y: number },
  startSec: number,
  faultTimeSec: number,
): number {
  for (const s of trace.samples) {
    if (s.tSec < startSec) continue;
    if (s.tSec > faultTimeSec) break;
    const h = s.headingDeg * DEG2RAD;
    const fx = Math.sin(h); // district forward (0° = north = +y)
    const fy = Math.cos(h);
    const rx = control.x - s.x;
    const ry = control.y - s.y;
    if (rx * fx + ry * fy < 0) return s.tSec;
    if (Math.hypot(rx, ry) < CONTROL_PASS_RADIUS_M) return s.tSec;
  }
  return faultTimeSec;
}

/** District-space ghost pose in, three-space camera pose out. */
export interface ChaseCamPose {
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
}

export function createChaseCamPose(): ChaseCamPose {
  return { camX: 0, camY: 0, camZ: 0, lookX: 0, lookY: 0, lookZ: 0 };
}

/** Control-framing weight at tSec: 1 until the pass, smooth 1→0 over the
 *  blend-out, 0 after. Pure and continuous — the "no cuts" guarantee. */
export function controlWeightAt(tSec: number, passTSec: number): number {
  if (tSec <= passTSec) return 1;
  const u = (tSec - passTSec) / CONTROL_BLEND_OUT_S;
  if (u >= 1) return 0;
  return 1 - u * u * (3 - 2 * u); // 1 − smoothstep
}

/** The look-pull only engages while the control is IN FRONT of the ghost —
 *  ramped over this forward distance. Pilot-v2 lesson (sc-pk-ban-stop k0, the
 *  near-black frame): a pass at the window start left weight 1 on a control
 *  BEHIND the car and yanked the look backward through the ghost shell. */
export const CONTROL_FRONT_RAMP_M = 5;

/** 0..1: how much of the control framing applies given where the control sits
 *  relative to the ghost (1 = ≥5 m ahead, 0 = behind). Continuous in t. */
export function controlFrontness(
  ghost: { x: number; y: number; headingDeg: number },
  control: { x: number; y: number },
): number {
  const h = ghost.headingDeg * DEG2RAD;
  const proj =
    (control.x - ghost.x) * Math.sin(h) + (control.y - ghost.y) * Math.cos(h);
  return Math.max(0, Math.min(1, proj / CONTROL_FRONT_RAMP_M));
}

/**
 * The deterministic exterior camera: standard chase framing behind the ghost,
 * widened + oriented toward the governing control while `framing` is active.
 * A pure function of (tSec, ghost pose) — zero per-frame state.
 */
export function plannedChasePose(
  tSec: number,
  ghost: { x: number; y: number; headingDeg: number },
  framing: { passTSec: number; x: number; y: number } | null,
  out: ChaseCamPose,
): ChaseCamPose {
  const w = framing
    ? controlWeightAt(tSec, framing.passTSec) * controlFrontness(ghost, framing)
    : 0;
  const yaw = Math.PI - ghost.headingDeg * DEG2RAD;
  const fx = Math.sin(yaw); // three-space forward (x, z) of the ghost
  const fz = Math.cos(yaw);
  const back = CAM_BACK_M + CONTROL_EXTRA_BACK_M * w;
  const up = CAM_UP_M + CONTROL_EXTRA_UP_M * w;
  out.camX = ghost.x - fx * back;
  out.camY = up;
  out.camZ = -ghost.y - fz * back;
  // Standard chase look…
  let lx = ghost.x + fx * CAM_LOOK_AHEAD_M;
  let ly = CAM_LOOK_UP_M;
  let lz = -ghost.y + fz * CAM_LOOK_AHEAD_M;
  // …pulled toward the control while the framing weight is up.
  if (framing && w > 0) {
    const k = CONTROL_LOOK_WEIGHT * w;
    lx += (framing.x - lx) * k;
    ly += (CONTROL_LOOK_UP_M - ly) * k;
    lz += (-framing.y - lz) * k;
  }
  out.lookX = lx;
  out.lookY = ly;
  out.lookZ = lz;
  return out;
}

// ---------------------------------------------------------------------------
// The rear-aware exterior camera (R1 — actors approaching from BEHIND)
// ---------------------------------------------------------------------------

/** Exterior camera profile per clip (PLAN card `camera`): "rearAware" when
 *  the mistake's key actor approaches from BEHIND the ghost (ambulance,
 *  tailgater) — the chase framing can never show it (pilot v2:
 *  sc-vu-emergency, the ambulance entered frame only after it had passed). */
export type CameraProfile = "chase" | "rearAware";

/** Three-quarter tracking framing: camera ahead of the ghost on the KERB side
 *  (the pass corridor is the other side), looking back past the ghost at the
 *  rear approach. Held for the whole clip — nothing blends, nothing pops. */
export const REAR_CAM_AHEAD_M = 9.5;
export const REAR_CAM_SIDE_M = 6.0;
export const REAR_CAM_UP_M = 3.1;
export const REAR_LOOK_BACK_M = 14;
export const REAR_LOOK_UP_M = 1.0;

/**
 * District-space ghost pose → the rear-aware three-space camera pose. Pure —
 * the same "nothing to settle" guarantee as plannedChasePose. The ghost rides
 * the lower-left/right third; the road behind it (strobes, closing actor)
 * fills the frame.
 */
export function plannedRearAwarePose(
  ghost: { x: number; y: number; headingDeg: number },
  out: ChaseCamPose,
): ChaseCamPose {
  const yaw = Math.PI - ghost.headingDeg * DEG2RAD;
  const fx = Math.sin(yaw); // three-space forward (x, z) of the ghost
  const fz = Math.cos(yaw);
  const rx = -fz; // three-space right of travel (forward × up)
  const rz = fx;
  out.camX = ghost.x + fx * REAR_CAM_AHEAD_M + rx * REAR_CAM_SIDE_M;
  out.camY = REAR_CAM_UP_M;
  out.camZ = -ghost.y + fz * REAR_CAM_AHEAD_M + rz * REAR_CAM_SIDE_M;
  out.lookX = ghost.x - fx * REAR_LOOK_BACK_M;
  out.lookY = REAR_LOOK_UP_M;
  out.lookZ = -ghost.y - fz * REAR_LOOK_BACK_M;
  return out;
}

// ---------------------------------------------------------------------------
// Fault readability chrome (doc 66 R3/R6 — the fault must be identifiable)
// ---------------------------------------------------------------------------

/** Ground ❌ height above the road (over markings, under the ribbon). */
export const FAULT_MARKER_Y = 0.06;
/** The marker fades in over this span ending AT the fault, then holds. */
export const FAULT_MARKER_RAMP_S = 0.25;

export interface FaultMarkerPose {
  x: number;
  y: number;
  z: number;
}

/** District-space fault position → the three-space ground-marker pose (the
 *  ShadowCar pose law: (x, y) → (x, ·, −y)). The roof ❌ badge reads as a
 *  floating world marker from the chase camera (pilot v2: the lot clip's X
 *  "on the grass" was the roof badge against a near background) — lot clips
 *  swap it for this ground-anchored X at the ENGINE fault position. */
export function faultMarkerPose(pt: { x: number; y: number }): FaultMarkerPose {
  return { x: pt.x, y: FAULT_MARKER_Y, z: -pt.y };
}

/** 0..1 marker opacity: fades in over [fault−ramp, fault], holds to clip end. */
export function faultMarkerAlphaAt(tSec: number, faultTimeSec: number): number {
  const u = (tSec - (faultTimeSec - FAULT_MARKER_RAMP_S)) / FAULT_MARKER_RAMP_S;
  return Math.max(0, Math.min(1, u));
}

/** Lane-highlight pulse (positional faults): the REQUIRED lane tints green
 *  for LANE_HIGHLIGHT_DUR_S starting at the fault, soft ramps both ends —
 *  doc 66 spirit: visual explanation, not decoration. */
export const LANE_HIGHLIGHT_DUR_S = 2;
export const LANE_HIGHLIGHT_RAMP_S = 0.3;

export function laneHighlightAlphaAt(tSec: number, faultTimeSec: number): number {
  const u = tSec - faultTimeSec;
  if (u <= -LANE_HIGHLIGHT_RAMP_S || u >= LANE_HIGHLIGHT_DUR_S) return 0;
  const rise = (u + LANE_HIGHLIGHT_RAMP_S) / LANE_HIGHLIGHT_RAMP_S;
  const fall = (LANE_HIGHLIGHT_DUR_S - u) / LANE_HIGHLIGHT_RAMP_S;
  return Math.max(0, Math.min(1, Math.min(rise, fall)));
}

// ---------------------------------------------------------------------------
// The planned cockpit camera (R4 — cabin faults show the cabin)
// ---------------------------------------------------------------------------

/**
 * Chassis-centre height above the road at rest, m. Derived from the cockpit
 * camera contract (vehicle/tuning.ts): COCKPIT_EYE sits chassis-local y 0.71
 * and "1.20 m above road" — so the resting chassis centre is 1.20 − 0.71.
 * The capture cabin mounts the interior GLB on the GHOST's trace pose at this
 * height, which lands the capture eye exactly on the drill's eye.
 */
export const GHOST_CHASSIS_REST_Y = 1.2 - COCKPIT_EYE.y;

/** Pure cockpit camera pose: eye position (three space) + yaw/pitch. The rig
 *  builds the quaternion as CameraRig does (yaw about Y · flip · pitch). */
export interface CockpitCamPose {
  camX: number;
  camY: number;
  camZ: number;
  /** Three-space yaw of the CAR (+Z forward), rad — π − heading. */
  yawRad: number;
  /** Constant COCKPIT_PITCH_BASE (the drill's 5° down tilt), rad. */
  pitchRad: number;
}

export function createCockpitCamPose(): CockpitCamPose {
  return { camX: 0, camY: 0, camZ: 0, yawRad: 0, pitchRad: COCKPIT_PITCH_BASE };
}

/**
 * District-space ghost pose → the drill cockpit eye, pure (zero per-frame
 * state — the same "nothing to settle" guarantee as plannedChasePose).
 * Car-local axes: +X left, +Y up, +Z forward (ShadowCar's pose law); world =
 * R_y(yaw) · local + ghost position at the resting chassis height.
 */
export function plannedCockpitPose(
  ghost: { x: number; y: number; headingDeg: number },
  out: CockpitCamPose,
): CockpitCamPose {
  const yaw = Math.PI - ghost.headingDeg * DEG2RAD;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  out.camX = ghost.x + COCKPIT_EYE.x * cos + COCKPIT_EYE.z * sin;
  out.camY = GHOST_CHASSIS_REST_Y + COCKPIT_EYE.y;
  out.camZ = -ghost.y + (-COCKPIT_EYE.x * sin + COCKPIT_EYE.z * cos);
  out.yawRad = yaw;
  out.pitchRad = COCKPIT_PITCH_BASE;
  return out;
}

// ---------------------------------------------------------------------------
// The R0 keyframe scheduler (pure — the client's recording poll drives it)
// ---------------------------------------------------------------------------

/**
 * How far the keyframe cursor advances at playback time `tSec`: returns the
 * new next-index, i.e. every keyframe with time ≤ tSec (+ε) is DUE. Clamped
 * times may duplicate — all duplicates fall due together (they intentionally
 * copy the same frame).
 */
export function keyframesDueThrough(
  times: readonly number[],
  nextIdx: number,
  tSec: number,
): number {
  let i = Math.max(0, nextIdx);
  while (i < times.length && times[i] <= tSec + 1e-6) i++;
  return i;
}

// ---------------------------------------------------------------------------
// Cabin channels + the dashboard-strip model (R4)
// ---------------------------------------------------------------------------

export interface CaptureCabinChannels {
  seatbeltOn: boolean;
  headlights: "off" | "low" | "high";
}

/**
 * Belt/lights for the clip, derived from the mistake's GRADED codeRefs (the
 * stored machine truth of which cabin channel is wrong) over the scripted
 * recorder's defaults (belt on; lights low at night, off by day) — see the
 * module-header honesty note.
 */
export function cabinChannelsFor(
  codeRefs: readonly string[],
  isNight: boolean,
): CaptureCabinChannels {
  let headlights: CaptureCabinChannels["headlights"] = isNight ? "low" : "off";
  if (codeRefs.some((c) => c.startsWith("HEADLIGHTS_OFF"))) headlights = "off";
  if (codeRefs.some((c) => c.startsWith("HIGH_BEAM"))) headlights = "high";
  return {
    seatbeltOn: !codeRefs.some((c) => c.startsWith("SEATBELT_OFF")),
    headlights,
  };
}

/** Indicator blink clock — ShadowCar's exact lamp law (period 0.75 s, 55 %
 *  duty), a function of PLAYBACK time so scrubs/settles never desync it. */
export const BLINK_PERIOD_S = 0.75;
export function blinkOnAt(tSec: number): boolean {
  return tSec % BLINK_PERIOD_S < BLINK_PERIOD_S * 0.55;
}

/** Contract gear (−1 R / 0 N / 1.. forward) → the driveline display letter. */
export function gearLabelFor(gear: number): string {
  return gear < 0 ? "R" : gear === 0 ? "N" : "D";
}

/** The canvas dashboard strip's channels — the essential subset of the DOM
 *  StatusDashboard (hud/dashboardStatus vocabulary), trace-driven. */
export interface CaptureDashModel {
  leftLampLit: boolean;
  rightLampLit: boolean;
  seatbeltOn: boolean;
  headlights: "off" | "low" | "high";
  gearLabel: string;
  speedKmh: number;
  brakeOn: boolean;
}

export function createCaptureDashModel(): CaptureDashModel {
  return {
    leftLampLit: false,
    rightLampLit: false,
    seatbeltOn: true,
    headlights: "off",
    gearLabel: "D",
    speedKmh: 0,
    brakeOn: false,
  };
}

/** Fill the dash model from the trace point + derived cabin channels. */
export function dashModelFor(
  pt: {
    indicator: "off" | "left" | "right";
    gear: number;
    speedKmh: number;
    brakeOn: boolean;
  },
  channels: CaptureCabinChannels,
  tSec: number,
  out: CaptureDashModel,
): CaptureDashModel {
  const blink = blinkOnAt(tSec);
  out.leftLampLit = pt.indicator === "left" && blink;
  out.rightLampLit = pt.indicator === "right" && blink;
  out.seatbeltOn = channels.seatbeltOn;
  out.headlights = channels.headlights;
  out.gearLabel = gearLabelFor(pt.gear);
  out.speedKmh = pt.speedKmh;
  out.brakeOn = pt.brakeOn;
  return out;
}

/** Cheap change detector for the strip's canvas redraw (dashboardHash's law:
 *  speed pre-rounded so sub-km/h jitter never redraws). */
export function dashModelHash(m: CaptureDashModel): string {
  return (
    `${m.leftLampLit ? 1 : 0}${m.rightLampLit ? 1 : 0}${m.seatbeltOn ? 1 : 0}|` +
    `${m.headlights}|${m.gearLabel}|${m.brakeOn ? 1 : 0}|` +
    `${Math.max(0, Math.round(Math.abs(m.speedKmh)))}`
  );
}

// ---------------------------------------------------------------------------
// The R1 actor checklist matcher — presence means IN THE PLANNED FRAME
// ---------------------------------------------------------------------------

/**
 * The planned exterior frame as a pure district-space cone — the honesty test
 * behind the R1 checklist. Approximates the planned chase camera (CAM_BACK_M
 * behind the ghost, looking along its heading, CHASE_FOV vertical at the
 * pinned 16:9 output): an actor is "in frame" when it sits in front of the
 * lens inside the horizontal frustum and within a legibility cap. Deliberate
 * approximations, both conservative-in-spirit and documented:
 *  - the R2 control widen/look-pull is ignored (base framing only);
 *  - FRAME_MAX_AHEAD_M caps "visible" at a distance where a fleet car is
 *    still legible pixels, not a speck (doc 66 R1 says VISIBLE, not rendered).
 */
export const FRAME_ASPECT = 16 / 9;
export const FRAME_NEAR_M = 2;
export const FRAME_MAX_AHEAD_M = 120;
const FRAME_HALF_TAN = Math.tan((CHASE_FOV * DEG2RAD) / 2) * FRAME_ASPECT;

export function actorInPlannedFrame(
  ghost: { x: number; y: number; headingDeg: number },
  actorX: number,
  actorY: number,
): boolean {
  const h = ghost.headingDeg * DEG2RAD;
  const fx = Math.sin(h); // district forward (0° = north = +y)
  const fy = Math.cos(h);
  const rx = actorX - ghost.x;
  const ry = actorY - ghost.y;
  const ahead = rx * fx + ry * fy;
  if (ahead > FRAME_MAX_AHEAD_M) return false;
  const depth = ahead + CAM_BACK_M; // distance in front of the LENS
  if (depth < FRAME_NEAR_M) return false;
  const lat = rx * fy - ry * fx;
  return Math.abs(lat) <= depth * FRAME_HALF_TAN;
}

/**
 * The rear-aware twin of actorInPlannedFrame — the same pure cone test run
 * against plannedRearAwarePose's framing (camera ahead on the kerb side,
 * looking back past the ghost). Without it the R1 presence law would grade an
 * ambulance the rear camera plainly shows as "absent" (the chase cone points
 * the other way).
 */
export function actorInRearAwareFrame(
  ghost: { x: number; y: number; headingDeg: number },
  actorX: number,
  actorY: number,
): boolean {
  const h = ghost.headingDeg * DEG2RAD;
  const fx = Math.sin(h); // district forward
  const fy = Math.cos(h);
  const rx = fy; // district right of travel
  const ry = -fx;
  const camX = ghost.x + fx * REAR_CAM_AHEAD_M + rx * REAR_CAM_SIDE_M;
  const camY = ghost.y + fy * REAR_CAM_AHEAD_M + ry * REAR_CAM_SIDE_M;
  // View axis: camera → look point (REAR_LOOK_BACK_M behind the ghost).
  let ax = -fx * (REAR_CAM_AHEAD_M + REAR_LOOK_BACK_M) - rx * REAR_CAM_SIDE_M;
  let ay = -fy * (REAR_CAM_AHEAD_M + REAR_LOOK_BACK_M) - ry * REAR_CAM_SIDE_M;
  const len = Math.hypot(ax, ay);
  ax /= len;
  ay /= len;
  const dx = actorX - camX;
  const dy = actorY - camY;
  const depth = dx * ax + dy * ay;
  if (depth < FRAME_NEAR_M || depth > FRAME_MAX_AHEAD_M) return false;
  const lat = dx * ay - dy * ax;
  return Math.abs(lat) <= depth * FRAME_HALF_TAN;
}

/** Profile-aware dispatch — the rig passes the PLAN card's camera profile so
 *  the presence law measures the frame the viewer actually gets. */
export function actorInPlannedFrameFor(
  profile: CameraProfile,
  ghost: { x: number; y: number; headingDeg: number },
  actorX: number,
  actorY: number,
): boolean {
  return profile === "rearAware"
    ? actorInRearAwareFrame(ghost, actorX, actorY)
    : actorInPlannedFrame(ghost, actorX, actorY);
}

/**
 * What the capture actually showed. The staging-truth counters (vehicles /
 * pedestrians / profiles / obstacleVehicles: peak counts over pre-roll +
 * window) are kept for debugging, but the R1 checklist reads ONLY
 * `framedKinds` — actor kinds observed INSIDE the planned frame during the
 * presence band [fault−FAULT_PRESENCE_SPAN_S, fault+FAULT_PRESENCE_SPAN_S].
 * Pilot-v2 lesson: pool counts said "present" for a dormant walker 540 m away
 * (sc-ed-d2-city-run) and a pace car 39 m behind the camera (sc-lane-change);
 * the founder's frame-by-frame verdict was ABSENT. The log may no longer
 * disagree with looking.
 */
export interface ActorPresenceLog {
  /** Peak live vehicle-agent count over pre-roll + window (staging truth). */
  vehicles: number;
  /** Peak live pedestrian-agent count (staging truth). */
  pedestrians: number;
  /** Distinct VehicleProfile values seen ("car" for profile-less agents). */
  profiles: string[];
  /** Parked-car obstacle count from the district's occupied bays. */
  obstacleVehicles: number;
  /** Actor kinds seen INSIDE the planned frame during the fault beat —
   *  lower-case tokens: "vehicle", "pedestrian", "parkedvehicle", plus any
   *  vehicle profile ("cyclist", "tram", "emergency", …). */
  framedKinds: string[];
}

export function createActorPresenceLog(): ActorPresenceLog {
  return { vehicles: 0, pedestrians: 0, profiles: [], obstacleVehicles: 0, framedKinds: [] };
}

/** Record a kind as seen in the planned frame (deduped, normalized). */
export function markFramedKind(log: ActorPresenceLog, kind: string): void {
  const k = kind.trim().toLowerCase();
  if (k.length > 0 && !log.framedKinds.includes(k)) log.framedKinds.push(k);
}

/**
 * Was an actor of the PLAN card's kind IN THE PLANNED FRAME at the fault
 * beat? Kinds per the plan contract: "vehicle" | "pedestrian" | "cyclist" |
 * "emergency" | "police" | "controller" | "parkedVehicle" | "tram". Unknown
 * kinds return false — fail-loud into the checklist, never a silent pass
 * (doc 66 R0). KIND-level honesty, not per-actor-id: the card rows carry no
 * ids, so a same-kind prop in frame can still satisfy a row — acceptable for
 * the pilot, noted for the scale gate.
 */
export function actorSpawned(kind: string, log: ActorPresenceLog): boolean {
  const k = kind.trim().toLowerCase();
  switch (k) {
    case "pedestrian":
    case "vehicle":
    case "cyclist":
    case "tram":
    case "emergency":
      return log.framedKinds.includes(k);
    case "parkedvehicle":
      return log.framedKinds.includes("parkedvehicle") || log.framedKinds.includes("vehicle");
    case "police":
      return log.framedKinds.includes("police") || log.framedKinds.includes("emergency");
    case "controller":
      // The регулировчик figure renders through the runtime controller
      // channel, not the traffic agent pool — the frame scan cannot see it.
      // Kept on the staging-truth rule (any staged presence) with an explicit
      // honesty debt: no controller template is in the pilot; revisit at the
      // scale gate before capturing one.
      return log.vehicles > 0 || log.pedestrians > 0;
    default:
      return false;
  }
}

/** One row of the per-clip R1 checklist the rig POSTs with the clip (manifest
 *  `actors` — what R0 cross-checks against the keyframes). */
export interface ActorCheck {
  kind: string;
  label: string;
  present: boolean;
}

/** PLAN requiredActors × the capture's presence log → the R1 checklist. */
export function buildActorChecklist(
  required: ReadonlyArray<{ kind: string; label: string }>,
  log: ActorPresenceLog,
): ActorCheck[] {
  return required.map((a) => ({
    kind: a.kind,
    label: a.label,
    present: actorSpawned(a.kind, log),
  }));
}

/** "n/N" summary for the capture status pill ("" when nothing is required). */
export function checklistSummary(checks: readonly ActorCheck[]): string {
  if (checks.length === 0) return "";
  const present = checks.filter((c) => c.present).length;
  return `${present}/${checks.length}`;
}
