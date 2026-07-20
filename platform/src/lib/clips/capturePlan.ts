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
 *    the capture stack actually staged (ambient traffic is zero in capture, so
 *    every live agent IS a staged actor).
 */

import { COCKPIT_EYE, COCKPIT_PITCH_BASE } from "@/modules/sim/vehicle";
import { recordingWindow, type RecordingWindow } from "./trim";

// ---------------------------------------------------------------------------
// Window + keyframes (R2, R3, R5)
// ---------------------------------------------------------------------------

/** Extra lead-in when a POSITIONED governing control must pass through frame. */
export const CONTROL_LEAD_S = 2;
/** Never let the window touch the trace end — ShadowCar wraps its clock to 0
 *  there, and one wrapped frame in the recording is the v1 №6 "hop". */
export const WINDOW_END_GUARD_S = 0.08;

/** The v2 recording window: engine fault time in, hop-guarded window out. */
export function captureWindowFor(
  durationSec: number,
  faultTimeSec: number,
  hasPositionedControl: boolean,
): RecordingWindow {
  const base = recordingWindow(durationSec, faultTimeSec);
  const startSec = Math.max(0, base.startSec - (hasPositionedControl ? CONTROL_LEAD_S : 0));
  const endSec = Math.max(
    Math.min(base.endSec, durationSec - WINDOW_END_GUARD_S),
    Math.min(startSec + 1, durationSec), // degenerate ultra-short traces
  );
  return { startSec, endSec };
}

/** The five R0 stills: [start, fault−2, fault, fault+2, end], clamped into the
 *  window and forced non-decreasing (duplicates allowed — always 5 entries). */
export function keyframeTimes(window: RecordingWindow, faultTimeSec: number): number[] {
  const raw = [
    window.startSec,
    faultTimeSec - 2,
    faultTimeSec,
    faultTimeSec + 2,
    window.endSec,
  ];
  const out: number[] = [];
  let floor = window.startSec;
  for (const t of raw) {
    const clamped = Math.min(Math.max(t, floor), window.endSec);
    out.push(clamped);
    floor = clamped;
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
  const w = framing ? controlWeightAt(tSec, framing.passTSec) : 0;
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
// The R1 actor checklist matcher
// ---------------------------------------------------------------------------

/** What the capture stack actually staged (ambient traffic is ZERO in the
 *  capture mount — recorder parity — so every live agent is a staged actor). */
export interface ActorPresenceLog {
  /** Peak live vehicle-agent count over pre-roll + window. */
  vehicles: number;
  /** Peak live pedestrian-agent count. */
  pedestrians: number;
  /** Distinct VehicleProfile values seen ("car" for profile-less agents). */
  profiles: string[];
  /** Parked-car obstacle count from the district's occupied bays. */
  obstacleVehicles: number;
}

export function createActorPresenceLog(): ActorPresenceLog {
  return { vehicles: 0, pedestrians: 0, profiles: [], obstacleVehicles: 0 };
}

/**
 * Did an actor of the PLAN card's kind actually spawn? Kinds per the plan
 * contract: "vehicle" | "pedestrian" | "cyclist" | "emergency" | "police" |
 * "controller" | "parkedVehicle" | "tram". Unknown kinds return false —
 * fail-loud into the checklist, never a silent pass (doc 66 R0).
 */
export function actorSpawned(kind: string, log: ActorPresenceLog): boolean {
  const k = kind.trim().toLowerCase();
  switch (k) {
    case "pedestrian":
      return log.pedestrians > 0;
    case "vehicle":
      return log.vehicles > 0;
    case "parkedvehicle":
      return log.obstacleVehicles > 0 || log.vehicles > 0;
    case "cyclist":
    case "tram":
    case "emergency":
      return log.profiles.includes(k);
    case "police":
      return log.profiles.includes("police") || log.profiles.includes("emergency");
    case "controller":
      // The регулировчик figure renders through the runtime controller
      // channel, not the traffic agent pool — count any staged presence.
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
