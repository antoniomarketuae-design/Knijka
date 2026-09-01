/**
 * sim/engine — public API of the simulator runtime services:
 * driver input, telemetry channel, device capability checks.
 * React-independent (the R3F layer, src/components/sim, is the only consumer)
 * with ONE exception: reverseViewStore, a client-side user setting, which
 * exposes a useSyncExternalStore hook like the quality store it copies.
 */

export {
  SimInput,
  stepPedal,
  THROTTLE_ATTACK_S,
  THROTTLE_RELEASE_S,
  BRAKE_ATTACK_S,
  BRAKE_RELEASE_S,
  MAX_RAMP_DT_S,
  KEY_LOG_SIZE,
} from "./input";
export type { SimInputCallbacks } from "./input";

export {
  ReverseAssist,
  ReversePedalMapper,
  applyReversePedalRemap,
  shouldRemapReversePedals,
  REVERSE_ASSIST_STANDSTILL_KMH,
  REVERSE_ASSIST_HOLD_S,
  REVERSE_ASSIST_LIFT_S,
  REVERSE_ASSIST_SUPPRESS_S,
  REVERSE_ASSIST_PEDAL_ON,
} from "./reverseAssist";
export type {
  ReverseAssistCommand,
  ReverseAssistFrame,
  ReverseShiftSource,
} from "./reverseAssist";

// …and the MOUTH LAW 2 never had: `isDisowned` was read by nothing, so a
// cockpit that had refused the pedal on purpose refused it in silence
// (founder 2026-08-09: „it turns to R (reverse) but the car does not move did
// it break or ?"). This decides WHEN that is confusion rather than an
// ordinary shift; the words are the shell's.
export {
  ReverseStuckWatch,
  REVERSE_STUCK_HINT_S,
  REVERSE_STUCK_REPEAT_S,
} from "./reverseStuck";
export type { ReverseStuckDirection, ReverseStuckFrame } from "./reverseStuck";

// The same silence, one layer up: the pedal is not refused by a GUARD, it is
// refused by the CAR — engine off, selector in P/N, parking brake on. The QW10
// „Колата още не е готова за потегляне" hint says exactly this and is reachable
// only in the pre-drive phase, which no scenario rung ever has. See the
// measurement in stuckStart.ts.
export {
  StuckStartWatch,
  stuckStartReason,
  STUCK_START_HINT_S,
  STUCK_START_REPEAT_S,
  STUCK_START_SETTLE_S,
  STUCK_START_PEDAL_ON,
} from "./stuckStart";
export type { StuckStartReason, StuckStartFrame } from "./stuckStart";

export {
  reverseViewTarget,
  stepReverseSwing,
  reverseSwingEnvelope,
  chaseOrbitLock,
  REVERSE_SWING_LAMBDA,
  REVERSE_SWING_EPSILON,
  REVERSE_VIEW_FORWARD_HOLD_KMH,
  CHASE_REVERSE_ORBIT_RAD,
  CHASE_ORBIT_LOCK_GAIN,
  COCKPIT_SHOULDER_YAW,
  COCKPIT_SHOULDER_PITCH,
} from "./reverseView";
export type { ReverseViewFrame, ReverseViewMode } from "./reverseView";

export {
  chaseGlanceOrbit,
  glanceOrbitLock,
  CHASE_GLANCE_SIDE_ORBIT_RAD,
  CHASE_GLANCE_ASPECT_RAD,
  CHASE_GLANCE_LOCK_RATE_RADS,
  SHOULDER_GLANCE_ORBIT_RAD,
} from "./glanceView";
export type { GlanceViewMirror } from "./glanceView";

export {
  getReverseViewEnabled,
  setReverseViewEnabled,
  toggleReverseViewEnabled,
  subscribeReverseView,
  useReverseViewEnabled,
  REVERSE_VIEW_STORAGE_KEY,
} from "./reverseViewStore";

export {
  TouchInputSource,
  PadPointer,
  releaseTouchControls,
  steerFromDrag,
  driveAxisFromDrag,
  driveAxisFromPadY,
  pedalFromPointerY,
  TOUCH_STEER_EXPO,
  TOUCH_STEER_RANGE_FRACTION,
  TOUCH_STEER_RANGE_PX,
  TOUCH_DRIVE_RANGE_PX,
  TOUCH_DRIVE_DEADZONE_PX,
  TOUCH_DRIVE_ABSOLUTE_RANGE_PX,
  TOUCH_DRIVE_NEUTRAL_HALF_PX,
} from "./touch";

// doc 82 §4.3 F5 — three discrete haptic events, always redundant with a
// visual or audio cue (a quarter of the phone audience is on iOS Safari,
// where navigator.vibrate does not exist at any version).
export {
  SimHaptics,
  collisionVibrationPattern,
  loadHapticsEnabled,
  supportsVibration,
  BRAKE_ONSET_MIN_KMH,
  BRAKE_ONSET_PEDAL,
  BRAKE_ONSET_RELEASE_PEDAL,
  BRAKE_ONSET_VIBRATION_MS,
  COLLISION_GAP_MS,
  COLLISION_MAX_MS,
  COLLISION_MIN_MS,
  CURB_VIBRATION_MS,
  HAPTICS_STORAGE_KEY,
  HAPTIC_MIN_GAP_MS,
} from "./haptics";
export type { SimHapticsDeps } from "./haptics";

export { createTelemetry, FpsMeter } from "./telemetry";
export type { SimTelemetry } from "./telemetry";

export { hasTouchScreen, isTouchOnlyDevice } from "./capabilities";
