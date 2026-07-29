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
// Founder 2026-07-29: ONE overlay at a time, one line at an edge, with a
// queue — the replacement for a task card, a teach card and a belt warning all
// deciding independently that they owned the top of the screen.
export { SimOverlay } from "./SimOverlay";
export {
  hasWhy,
  isAmbientOverlay,
  overlayCentreBand,
  overlayPriority,
  peekWithinBudget,
  rectClearsCentreBand,
  rectViewportFraction,
  requiresWhy,
  selectOverlay,
  OVERLAY_CENTRE_BAND,
  OVERLAY_PEEK_HEIGHT_PX,
  OVERLAY_PEEK_MAX_FRACTION,
  OVERLAY_PEEK_STATUS_HEIGHT_PX,
  type OverlayRect,
  type OverlaySelection,
  type SimOverlayItem,
  type SimOverlayKind,
  type SimOverlayTone,
} from "./overlayQueue";
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
