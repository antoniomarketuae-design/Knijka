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
  applyReversePedalRemap,
  shouldRemapReversePedals,
  REVERSE_ASSIST_STANDSTILL_KMH,
  REVERSE_ASSIST_HOLD_S,
  REVERSE_ASSIST_SUPPRESS_S,
  REVERSE_ASSIST_PEDAL_ON,
} from "./reverseAssist";
export type { ReverseAssistCommand, ReverseAssistFrame } from "./reverseAssist";

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
  getReverseViewEnabled,
  setReverseViewEnabled,
  toggleReverseViewEnabled,
  subscribeReverseView,
  useReverseViewEnabled,
  REVERSE_VIEW_STORAGE_KEY,
} from "./reverseViewStore";

export {
  TouchInputSource,
  steerFromDrag,
  pedalFromPointerY,
  TOUCH_STEER_EXPO,
  TOUCH_STEER_RANGE_FRACTION,
} from "./touch";

export { createTelemetry, FpsMeter } from "./telemetry";
export type { SimTelemetry } from "./telemetry";

export { hasTouchScreen, isTouchOnlyDevice } from "./capabilities";
