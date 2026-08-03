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
// Founder 2026-08-03, third asking: „MOVE EVERY TEXT PANEL OFF THE MIDDLE OF
// THE ROAD, TO THE RIGHT EDGE." One column, one set of numbers, shared by the
// shell (roomy), SimOverlay (compact) and the CSS that pulls the scene-owned
// panels over (PlayAreaStyles).
export {
  notifyColumnLeftFraction,
  notifyColumnWidthPx,
  rectIsInNotifyColumn,
  NOTIFY_COLUMN_DECK_MAX_LIFT_COMPACT,
  NOTIFY_COLUMN_DECK_RESERVE_PX,
  NOTIFY_COLUMN_GUTTER_PX,
  NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX,
  NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX,
  NOTIFY_COLUMN_MIN_LEFT_FRACTION,
  NOTIFY_COLUMN_RIGHT_CSS,
  NOTIFY_COLUMN_TOP_CSS_COMPACT,
  NOTIFY_COLUMN_TOP_CSS_ROOMY,
  NOTIFY_COLUMN_WIDTH_CSS_COMPACT,
  NOTIFY_COLUMN_WIDTH_CSS_ROOMY,
} from "./notifyColumn";
export { ObjectiveBanner, type ObjectiveFlash } from "./ObjectiveBanner";
export { HudToasts, useHudToastQueue, type HudToast } from "./HudToasts";
// Doc 86 L14/L15 — the DESKTOP half of the notification rework: a dismissible,
// two-card, 240 px toast column with a „по-тихи известия" setting, and an
// end-of-lesson debrief that Space skips and a setting can stop auto-opening.
export {
  hudToastCarriesWhy,
  parseStoredFlag,
  quietSuppresses,
  readStoredFlag,
  serializeFlag,
  shouldShowDebrief,
  shouldShowEndBar,
  toastCapacity,
  toastColumnFraction,
  visibleToasts,
  writeStoredFlag,
  QUIET_SUPPRESSED_KINDS,
  ROOMY_MIN_WIDTH_PX,
  SESSION_END_AUTO_DEFAULT,
  SESSION_END_AUTO_STORAGE_KEY,
  SESSION_END_SKIP_HINT_BG,
  TOAST_CARD_WIDTH_CLASS,
  TOAST_CARD_WIDTH_PX,
  TOAST_COLUMN_MAX_FRACTION,
  TOAST_MAX_VISIBLE,
  TOAST_QUIET_DEFAULT,
  TOAST_QUIET_MAX_VISIBLE,
  TOAST_QUIET_STORAGE_KEY,
  type DebriefVisibility,
  type HudToastKind,
} from "./hudPreferences";
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
