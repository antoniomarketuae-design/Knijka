/**
 * sim/hud — public API of the simulator HUD overlays (design-token styled,
 * client components). Consumed by src/components/sim and the /simulator route.
 */

// 2026 lesson HUD
export { HudStyles } from "./HudStyles";
// `SpeedCard` WAS EXPORTED HERE AND RENDERED NOWHERE — removed 2026-08-26.
// `StatusDashboard` below replaced it in full ("Replaces the old bottom-left
// SpeedCard + GearIndicatorCard pair", its own header), and the component's own
// header had been carrying the epitaph since 2026-08-19: „there is no
// `<SpeedCard` in the tree. It survives only as a named export". A public API
// with no consumer is not a spare part, it is a second surface that can print a
// limit disagreeing with the disc the student is billed against — the file said
// that too, under DO NOT RE-MOUNT IT WITHOUT READING THAT FRAME FIRST. The
// frame, the В26-disc collision and the resolution all live in
// `StatusDashboard.tsx`'s `GovernorCapMark`, which is where they belong.
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
/**
 * THE SHADE, PUBLISHED — sweep w10, 2026-08-24.
 *
 * `SimOverlay` grew this recipe to close three criticals that all said the same
 * sentence: „the ИНСТРУКЦИИ card has NO panel background at all … the text is
 * painted straight onto the street." It stayed module-private, so the next
 * surface with the same defect could not have it, and the sweep found that
 * surface immediately — `[data-hud="touch-hint"]`, two lanes over, filed twice
 * (`sc-ac-wet-braking`, `sc-ac-crosswind`): «Ляв палец — волан…» in white
 * 11 px type over a lit tower-block facade, an orange window showing through
 * the middle of a word.
 *
 * IT IS PUBLISHED RATHER THAN COPIED for the reason this module keeps
 * re-learning (the census block in `overlayQueue.ts`, the weather vocabulary in
 * `dashboardStatus.ts`): a hand-kept near-copy of a gradient is two numbers
 * that must agree with nothing making them. `sim-overlay-scrim.test.ts` reads
 * the palette out of `globals.css` and the ghost pins out of `PlayAreaStyles`
 * to judge THIS function, and a second consumer inherits that judgement whole.
 *
 * ── BOTH HALVES TRAVEL, and the first draft of this export shipped only one.
 *    An adversarial pass on that draft named it: the recipe is
 *    `peekScrimBackgroundCss` (the horizontal ramps) AND `peekScrimMaskCss`
 *    (the vertical ones), and `SimOverlay` says why in writing at the second
 *    function — „two background layers do not intersect … which puts a hard
 *    edge back on the two sides this is here to remove." A consumer that takes
 *    only the background gets a rectangle with a hard 80 %-alpha horizontal
 *    edge, i.e. a plate edge by another name, which is exactly the register
 *    the 2026-08-03 ruling removed. Publishing one without the other is
 *    publishing a trap.
 */
export {
  PEEK_SCRIM_ALPHA,
  PEEK_SCRIM_FEATHER_PX,
  PEEK_SCRIM_RGB,
  peekScrimBackgroundCss,
  peekScrimMaskCss,
} from "./SimOverlay";
/**
 * THE LINE-GRID SNAP, PUBLISHED — sweep w10 round 11, and it was ROUTED here
 * in writing before it was asked for.
 *
 * `LessonPlayShell`'s desktop ИНСТРУКЦИИ list carries this note at its own fade:
 *
 *   „NOT THE LINE-GRID SNAP. `SimOverlay.foldMaskCss` has a second branch that
 *    moves the cut onto a line boundary so no glyph is ever partly painted …
 *    That is the stronger repair and it is NOT done here — faded-through is
 *    better than sliced-through and is not the same as uncut."
 *
 * The sweep kept filing the difference. `sc-pe-night-unlit/pc-right/01-arrival`
 * and `sc-pe-zone-living/pc-right/04-t017s` are both „a numbered step sliced
 * horizontally through its letterforms by the card's bottom edge", on the
 * DESKTOP panel, where a 10 px fade over an 11 px `leading-tight` line box
 * cannot land anywhere but inside a line.
 *
 * Same reasoning as the shade above it: published rather than copied, because a
 * hand-kept near-copy of this arithmetic is two grids that must agree with
 * nothing making them — and `sim-overlay-fold.test.ts` already holds this one
 * against real numbers, so a second consumer inherits that judgement whole.
 *
 * THREE NAMES, NOT FIVE, and the two that are missing were in the first draft
 * of this block. `FOLD_SLACK_PX` and `FOLD_FALLBACK_LEADING_PX` went on the
 * barrel beside these because they are part of the same table — and then had
 * ZERO importers: `foldWindowPx` already takes the slack as a defaulted
 * parameter, the fallback leading is internal to it, and this module's own
 * tests reach past the barrel to `../SimOverlay` for both. A public name with
 * no caller is the same defect as a repair with no reader, one layer out: it
 * widens the module boundary doc 05 draws and buys nothing. They are still
 * exported from `SimOverlay.tsx`, where the four files that use them read them.
 */
export { foldMaskCss, foldWindowPx, type FoldRow } from "./SimOverlay";
export {
  briefingBodyBg,
  briefingLineBg,
  briefingLineOrdinal,
  hasWhy,
  isAmbientOverlay,
  overlayCentreBand,
  // Rule 4, 2026-08-17: the census of surfaces that can take the drive screen,
  // and the TWO answers derived from it — „may the queue speak" and „must the
  // car be frozen". They are exported together because the defect they close
  // was the two being kept apart by hand in `LessonPlayShell`.
  overlayHoldsDrive,
  overlayPriority,
  overlayQueueMaySpeak,
  overlaySilencesQueue,
  rectViewportFraction,
  requiresWhy,
  selectOverlay,
  OVERLAY_CENTRE_BAND,
  OVERLAY_PEEK_HEIGHT_PX,
  OVERLAY_PEEK_MAX_FRACTION,
  OVERLAY_SCREEN_OWNERS,
  type BriefingStepBg,
  type OverlayRect,
  type OverlayScreenOwner,
  type OverlayScreenOwnerSpec,
  type OverlaySelection,
  type SelectOverlayOptions,
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
  // The driving band's reserved lane, as the variable name this column reads.
  // Declared by components/sim/TouchControls (TOUCH_BAND_CSS_VARS); pinned to
  // that declaration by touchArc.test.ts.
  FLANK_LANE_VAR,
  notifyColumnWidthPx,
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
