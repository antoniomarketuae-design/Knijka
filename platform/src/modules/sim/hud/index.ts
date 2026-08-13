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
  briefingBodyBg,
  briefingLineBg,
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
  type BriefingStepBg,
  type OverlayRect,
  type OverlaySelection,
  type SimOverlayItem,
  type SimOverlayKind,
  type SimOverlayTone,
} from "./overlayQueue";
// Doc 91 · C2/I2 — a `click` born of a touch is a compatibility mouse event and
// is dispatched only for the PRIMARY touch point, so every `onClick` control in
// the simulator was dead while a thumb was on a pad. One helper, kept beside
// the overlay it also serves, and used by TouchControls and the play shell.
export {
  createTapActivationState,
  tapClickActivates,
  tapOwnsPointerType,
  tapPointerCancel,
  tapPointerDown,
  tapPointerUp,
  tapPointWithin,
  useTapActivation,
  TAP_CLICK_SUPPRESS_MS,
  type TapActivationHandlers,
  type TapActivationState,
  type TapPoint,
  type TapRect,
} from "./tapActivation";
// Founder 2026-08-03, third asking: „MOVE EVERY TEXT PANEL OFF THE MIDDLE OF
// THE ROAD, TO THE RIGHT EDGE." One column, one set of numbers, shared by the
// shell (roomy), SimOverlay (compact) and the CSS that pulls the scene-owned
// panels over (PlayAreaStyles).
export {
  notifyColumnLeftFraction,
  notifyColumnWidthPx,
  rectIsInNotifyColumn,
  // …and the demonstration transport, which shares this corridor on a phone —
  // and, when it is OPEN, leaves it for the left one on a desktop too.
  deckCompactOpenWidthPx,
  deckTouchRowMinWidthPx,
  CONTROLS_HELP_TOP_INSET_PX,
  DECK_COMPACT_COLUMN_RESERVE_PX,
  DECK_COMPACT_OPEN_LEFT_CSS,
  DECK_COMPACT_OPEN_PORTRAIT_LEFT_CSS,
  DECK_COMPACT_OPEN_WIDTH_CSS,
  DECK_ROOMY_CAPTION_HEIGHT_PX,
  DECK_ROOMY_LEGEND_GUTTER_PX,
  DECK_ROOMY_OPEN_HEIGHT_PX,
  DECK_ROOMY_OPEN_LEFT_CSS,
  DECK_ROOMY_OPEN_WIDTH_CSS,
  DECK_TOUCH_CAPTION_HEIGHT_PORTRAIT_PX,
  DECK_TOUCH_CAPTION_HEIGHT_PX,
  DECK_TOUCH_CAPTION_ROAD_MAX_PX,
  DECK_TOUCH_CAPTION_MAX_VAR,
  DECK_TOUCH_CAPTION_VAR,
  DECK_TOUCH_GAP_PX,
  DECK_TOUCH_TRANSPORT_ROW_PX,
  DECK_TOUCH_PANEL_CHROME_PX,
  DECK_TOUCH_ROW_CONTROLS,
  DECK_TOUCH_SCRUB_MIN_PX,
  DECK_TOUCH_TARGET_PX,
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
  RIBBON_LEGEND_LANE_PX,
} from "./notifyColumn";
// Doc 91 · J-WAVE-4 item 2 — the hint copy that named a key a phone does not
// have. One authored sentence per hint; only the phrase naming the control
// changes, so the touch reader and the keyboard reader are taught the same
// decision by construction rather than by two cards agreeing today.
export {
  capBg,
  clutchHeldObjBg,
  clutchObjBg,
  gearDownActBg,
  gearDownWithBg,
  gearUpActBg,
  gearUpWithBg,
  hintInputFor,
  leverActBg,
  parkingBrakeActBg,
  starterActBg,
  starterWithBg,
  withSheetLocatorBg,
  STALL_RESTART_LABEL_BG,
  TOUCH_SHEET_LOCATOR_BG,
  type HintInput,
} from "./controlPhrases";
export { ObjectiveBanner, type ObjectiveFlash } from "./ObjectiveBanner";
export { HudToasts, useHudToastQueue, type HudToast } from "./HudToasts";
// Doc 86 L14/L15 — the DESKTOP half of the notification rework: a dismissible,
// two-card, 240 px toast column with a „по-тихи известия" setting, and an
// end-of-lesson debrief that Space skips and a setting can stop auto-opening.
export {
  endLineDemandsAnswer,
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
