/**
 * hazard module — public API (docs/architecture/05: modules talk only via index.ts).
 *
 * HAZARD-PERCEPTION TRAINING: the student watches a short clip of a drive and
 * reacts the moment a hazard begins to DEVELOP — before it is obvious. It is
 * the intervention with the strongest evidence base in driver education for
 * reducing novice crashes, and it is deliberately NOT on the Bulgarian ДАИ
 * exam. It is here because the product's promise is „не само вадим книжка —
 * правим те да не се блъснеш", and because @/modules/outcomes will eventually
 * be able to test that promise against real ДАИ results.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE IS, AND WHAT IT IS NOT
 *
 * IT IS the item bank, the windows, the scoring and the law-cited reveal. It is
 * stateless and pure apart from one cached JSON read.
 *
 * IT IS NOT the run: ordering, one-shot-per-item, the media-time plausibility
 * check and persistence live in @/modules/hazard-play, which owns the run row.
 * The two meet at a two-method port (`deal`, `judge`), which is the ONLY way a
 * surface can reach the engine — so adding a fourth door can never mean adding
 * a fourth code path.
 *
 * WIRING (one line, once, in the app's server bootstrap):
 *
 *     import { setHazardEngine } from "@/modules/hazard-play";
 *     import { hazardEngine } from "@/modules/hazard";
 *     setHazardEngine(hazardEngine);
 *
 * Until that line exists the delivery layer reports „подготвя се" and nothing
 * is scored — deliberately, because a placeholder window would be inventing the
 * one measurement this whole feature rests on.
 *
 * AND, at the end of a run, the surface folds the result into the learner model:
 *
 *     await recordHazardOutcomes(userId, summary.items);
 *
 * ---------------------------------------------------------------------------
 * THREE DOORS, ONE ENGINE (founder decision)
 *
 *   simulator  free interstitial — every student meets it, so the data accrues
 *   section    the paid pack's standalone section — a differentiator has to be
 *              visible to be sold
 *   theory     a lesson type — lowest friction, they hit it while studying
 *
 * `deal()` receives the door and ignores it. Set size and entitlement are
 * routing decisions and live in the delivery layer; the measurement is
 * identical on all three or the data cannot be pooled.
 *
 * ---------------------------------------------------------------------------
 * SERVER AUTHORITY, in one paragraph
 *
 * The card served while the clip plays has no window, no fault timestamp and no
 * hazard text — the split lives in @/components/hazard/types and is enforced by
 * __tests__/no-leak.test.ts. The client reports press timestamps and nothing
 * else; `scoreHazardItem` is the only producer of points and is pure, which is
 * what makes the scoring arguable rather than merely asserted. This is the same
 * shape the exam uses, for the same reason: a score a browser can type is not
 * evidence of anything.
 *
 * ADR-002: every string in a reveal is copied from the item bank or the rule
 * catalog — no LLM is in this path. ADR-004: a press timestamp is a fact about
 * a video, not about a person; nothing this module stores describes the student.
 */

// -- the port the delivery layer registers -----------------------------------
export {
  HAZARD_ENGINE_VERSION,
  hazardCardFor,
  hazardEngine,
  type HazardDealRequest,
  type HazardDealtItem,
  type HazardJudgeRequest,
} from "./engine";

// -- scoring (pure; the part that must be provably fair) ---------------------
export {
  HAZARD_BANDS,
  HAZARD_LATE_SLACK_SEC,
  HAZARD_PRESS_DEBOUNCE_SEC,
  HAZARD_SPAM_MIN_PRESSES,
  HAZARD_SPAM_PRESS_RATE,
  HAZARD_SPAM_RHYTHM_RUN,
  HAZARD_SPAM_RHYTHM_TOL_SEC,
  bandEdges,
  bandFor,
  detectSpam,
  pointsForBand,
  sanitizePresses,
  scoreHazardItem,
} from "./scoring";

// -- the item bank ------------------------------------------------------------
export {
  buildHazardBank,
  getHazardBank,
  hazardBankAudit,
  loadHazardBankFromDisk,
  selectHazardItems,
  setHazardBank,
  type HazardBank,
  type HazardBankAuditRow,
} from "./bank";

// -- the reveal ---------------------------------------------------------------
export {
  buildHazardFeedback,
  hazardRuleCitation,
  hazardVerdictFor,
  hazardVerdictLineBg,
  parseHazardLawRef,
  type HazardRuleCitation,
} from "./feedback";

// -- learner-model coupling ---------------------------------------------------
export {
  HAZARD_SEVERITY_SOFTENING,
  hazardObservations,
  recordHazardOutcomes,
  type HazardOutcomeLine,
} from "./learningFeed";

// -- types + format constants -------------------------------------------------
export {
  HAZARD_BENCHMARK_DENOMINATOR,
  HAZARD_BENCHMARK_NUMERATOR,
  HAZARD_BENCHMARK_RATIO,
  HAZARD_DEFAULT_WINDOW_LEAD_SEC,
  HAZARD_MAX_POINTS_PER_ITEM,
  HAZARD_MIN_LEAD_IN_SEC,
  HAZARD_MIN_WINDOW_SEC,
  HAZARD_PROMPT_BG,
  HAZARD_SERVABLE_STATUSES,
  HazardError,
} from "./types";
export type {
  HazardClipRef,
  HazardErrorCode,
  HazardItem,
  HazardItemScore,
  HazardItemSource,
  HazardItemStatus,
  HazardOutcome,
  HazardSpamReason,
  HazardWindow,
} from "./types";
