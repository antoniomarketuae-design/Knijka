/**
 * tutor module — public API (docs/architecture/05).
 *
 * Route handlers / server actions / pages consume ONLY these exports.
 * ADR-002: the tutor never free-recalls law — every reply is grounded in
 * retrieved content-bank material and cites its lawRefs.
 *
 * Callers of askTutor must ensure the content repo is initialized
 * (import '@/lib/content/loader' server-side) before calling.
 */

export {
  askTutor,
  getThread,
  getTutorAllowance,
  TUTOR_DAILY_MESSAGE_LIMIT,
  TUTOR_LIMIT_REPLY_BG,
  TUTOR_MAX_INPUT_LENGTH,
} from "./service";
export type {
  AskTutorResult,
  TutorCitation,
  TutorLessonContext,
  TutorThreadView,
} from "./service";
export type { TutorMessage } from "./store";
export { isTutorEnabled } from "./model";

// The classroom's interruption path (doc 84 §2.2). A lesson beat names its own
// materials, so it INJECTS them as Tier 1 rather than retrieving them; these
// three are what a caller needs to build that injection and to keep its
// citations on the same whitelist as every other tutor answer.
//
// `parseCatalogLawRef` is here rather than duplicated in the lesson module on
// purpose: „ЗДвП чл. 21" must split into {act, ref} the SAME way everywhere,
// or a lesson citation chip and a chat citation chip render as two different
// sources for one article.
export {
  MAX_RETRIEVED_ITEMS,
  parseCatalogLawRef,
  ruleMaterial,
} from "./retrieval";
export type { RetrievedItem } from "./retrieval";

// THE GATE ON RETRIEVAL (the third door). Retrieval filters the content bank
// through the SAME `conceptClearance` / `questionClearance` / `signClearance`
// the classroom uses, so nothing unreviewed becomes grounding for a model —
// which is ADR-002's requirement stated the other way round: retrieval that
// hands the model unreviewed law is free recall with an extra step.
//
// These three are the instrument. A gate whose refusals nobody can see is a
// gate the next person removes because they cannot explain why the tutor went
// quiet on first aid — so read `recentWithheldMaterials()` before concluding
// the retriever is broken.
export {
  recentWithheldMaterials,
  resetWithheldMaterials,
  setWithheldMaterialSink,
} from "./retrieval";
export type { WithheldMaterial } from "./retrieval";

// Global daily spend ceiling on the Anthropic key (audit H-8). Exported so an
// ops/admin surface can show today's burn, and so the message the student sees
// when it trips is testable from outside the module.
export {
  checkDailyBudget,
  sofiaDayKey,
  tutorDailyBudgetMicroUsd,
  TUTOR_BUDGET_REPLY_BG,
  TUTOR_DAILY_BUDGET_USD_DEFAULT,
} from "./budget";
export type { TutorBudgetState } from "./budget";

// What a pack buys in tutor questions, in the Учител's own words. The RULE is
// payments' (checkTutorPackAllowance); getTutorAllowance above answers it for
// a given student, and these two turn that answer into something a
// 17-year-old reads without feeling metered (doc 81 §5.3).
export {
  tutorAllowanceNoticeBg,
  tutorAllowanceSpentReplyBg,
  TUTOR_ALLOWANCE_NOTICE_FRACTION,
} from "./allowance";

// WHEN the tutor is allowed to speak in the driving loop (doc 81 §4.3). Pure
// and dependency-free, so the sim shell adapts its SimTick into SpeakGateTick
// and consumes the decision through this barrel — the tutor's speaking policy
// stays in one place, and the sim never reaches into the tutor's internals.
//
// The audio it names is PRE-RENDERED (tools/theory/synthesize_bg.mjs): the gate
// carries an utteranceId, never a sentence, so nothing unauthored can reach a
// student's ears in the fast lane. No LLM, no network, no ADR-002 surface.
export {
  createSpeakGateState,
  isSafeToInterrupt,
  observeSpeakTick,
  SPEAK_CODE_LOCKOUT_SEC,
  SPEAK_COOLDOWN_SEC,
  SPEAK_MAX_PER_SESSION,
  SPEAK_QUEUE_MAX_WAIT_SEC,
  SPEAK_SAFE_LEAD_GAP_M,
  SPEAK_SAFE_SPEED_KMH,
  SPEAK_MANOEUVRE_QUIET_SEC,
  SPEAK_TOAST_QUIET_SEC,
  SPEAK_TRIGGER_PRIORITY,
} from "./speakGate";
export type {
  SpeakGateResult,
  SpeakGateState,
  SpeakGateTick,
  SpeakRequest,
  SpeakTrigger,
} from "./speakGate";
