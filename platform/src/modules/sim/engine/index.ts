/**
 * sim/engine — public API of the simulator runtime services:
 * driver input, telemetry channel, device capability checks.
 * React-independent; the R3F layer (src/components/sim) is the only consumer.
 */

export { SimInput } from "./input";
export type { SimInputCallbacks } from "./input";

export { createTelemetry, FpsMeter } from "./telemetry";
export type { SimTelemetry } from "./telemetry";

export { isTouchOnlyDevice } from "./capabilities";
