/**
 * sim/engine — public API of the simulator runtime services:
 * driver input, telemetry channel, device capability checks.
 * React-independent; the R3F layer (src/components/sim) is the only consumer.
 */

export {
  SimInput,
  stepPedal,
  THROTTLE_ATTACK_S,
  THROTTLE_RELEASE_S,
  BRAKE_ATTACK_S,
  BRAKE_RELEASE_S,
  MAX_RAMP_DT_S,
} from "./input";
export type { SimInputCallbacks } from "./input";

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
