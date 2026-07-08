/**
 * sim module — public API.
 *
 * The pure grading/procedure logic is consumed by lessons, analytics and the
 * future AI debrief; the engine/vehicle/hud React internals are consumed only
 * by the /simulator route and are exposed via their own sub-barrels.
 */

export * as rules from "./rules";
export * as procedures from "./procedures";
export * as lessons from "./lessons";
