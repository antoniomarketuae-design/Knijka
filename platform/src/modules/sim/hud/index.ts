/**
 * sim/hud — public API of the simulator HUD overlays (design-token styled,
 * client components). Consumed by src/components/sim and the /simulator route.
 */

// 2026 lesson HUD
export { HudStyles } from "./HudStyles";
export { SpeedCard } from "./SpeedCard";
export { GearIndicatorCard } from "./GearIndicatorCard";
export { StatusDashboard } from "./StatusDashboard";
export {
  createDashboardStatus,
  dashboardHash,
  displaySpeedKmh,
  speedTone,
  type DashboardStatus,
} from "./dashboardStatus";
// Founder 2026-07-28: armed cabin faults surfaced at the screen edges in the
// views where the instrument panel is out of frame (chase / top-down).
export { TelltaleEdgePings } from "./TelltaleEdgePings";
export {
  armedTelltaleWarnings,
  telltaleWarningsKey,
  type TelltaleWarning,
  type TelltaleWarningId,
} from "./telltaleWarnings";
export { ObjectiveBanner, type ObjectiveFlash } from "./ObjectiveBanner";
export { HudToasts, useHudToastQueue, type HudToast } from "./HudToasts";
export {
  Minimap,
  MistakeMap,
  fitMapTransform,
  type MinimapFrame,
  type MinimapMarker,
  type MinimapPolyline,
  type MinimapTransform,
  type MistakeMapMarker,
  type MistakeMapMarkerKind,
} from "./Minimap";
// PROX: rear-proximity badge — the universal rear-awareness fallback cue.
export { RearProximityCue } from "./RearProximityCue";
export type { RearCuePose, RearGapSource } from "./RearProximityCue";
export { rearCueLabelBg, stepRearCue, type RearCue, type RearCueLevel } from "./rearProximity";
export { PreDriveChecklist } from "./PreDriveChecklist";
export { SessionEndScreen, type SessionEndConcept } from "./SessionEndScreen";
export {
  retryCtaClass,
  scenarioCtaRow,
  type SessionEndCta,
  type SessionEndCtaId,
  type SessionEndScenarioTarget,
} from "./sessionEndCtas";
