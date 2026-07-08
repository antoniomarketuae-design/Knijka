/**
 * sim/hud — public API of the simulator HUD overlays (design-token styled,
 * client components). Consumed by src/components/sim and the /simulator route.
 */

// Legacy tech-demo HUD (test track) — kept until the integrator retires it.
export { SimHud } from "./SimHud";

// 2026 lesson HUD
export { HudStyles } from "./HudStyles";
export { SpeedCard } from "./SpeedCard";
export { GearIndicatorCard } from "./GearIndicatorCard";
export { ObjectiveBanner, type ObjectiveFlash } from "./ObjectiveBanner";
export { HudToasts, useHudToastQueue, type HudToast } from "./HudToasts";
export {
  Minimap,
  type MinimapFrame,
  type MinimapMarker,
  type MinimapPolyline,
  type MinimapTransform,
} from "./Minimap";
export {
  DEFAULT_PRE_DRIVE_KEY_HINTS,
  PreDriveChecklist,
} from "./PreDriveChecklist";
export { SessionEndScreen, type SessionEndConcept } from "./SessionEndScreen";
