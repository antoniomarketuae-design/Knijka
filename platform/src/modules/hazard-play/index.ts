/**
 * hazard-play module — public API (docs/architecture/05: modules talk only via
 * index.ts; a deep import is a review-blocking violation).
 *
 * WHAT THIS MODULE IS. The delivery layer for hazard-perception training: it
 * deals a run, remembers what it dealt, accepts the reaction timestamps a
 * browser observed, asks the item engine what they were worth, and records the
 * answer. It is the hazard twin of @/modules/exam's attempt lifecycle, and it
 * exists as its own module for the same reason: the thing that makes a score
 * trustworthy is that the client never computes one.
 *
 * WHAT IT IS NOT. It has no opinion about driving. Scoring windows, verdict
 * thresholds, the law-cited reveal and the item bank all belong to the item
 * engine behind `HazardEngine` (engine.ts). This module could not leak a
 * scoring window if it wanted to — it never receives one.
 *
 * THREE DOORS, ONE ENGINE. The founder's placement decision (free inside the
 * simulator · its own paid section · a theory lesson step) is expressed here as
 * exactly two configurable things — `HAZARD_RUN_LENGTH` (how long) and
 * `hazardDoorRequiresPack` (who is let in) — and nothing else. Surfacing hazard
 * training somewhere new is a routing + entitlement decision. If a change ever
 * needs a fourth branch inside startHazardRun or submitHazardReaction, the
 * change is wrong: it is forking the measurement, and two forks of a
 * measurement cannot be pooled into a safety claim.
 *
 * ── WIRING THE ENGINE ──────────────────────────────────────────────────────
 * The item engine registers itself, exactly like setPaymentsStore /
 * setExamStore / setStripeClient do elsewhere in this repo:
 *
 *     import { setHazardEngine } from "@/modules/hazard-play";
 *     import { hazardEngine } from "@/modules/hazard";
 *     setHazardEngine(hazardEngine);
 *
 * Until that one line exists, `hasHazardEngine()` is false and every surface
 * renders its „подготвя се" state. That is deliberate: a placeholder engine
 * would have to invent a scoring window (the one measurement the whole safety
 * claim rests on) and a corrective (law text nobody authored — ADR-002). An
 * honest empty state is strictly better than a dishonest full one.
 *
 * ── GDPR (ADR-004: the students are minors) ────────────────────────────────
 * A run row holds a user id, item ids, media-second numbers and a verdict.
 * A reaction timestamp is a fact about a VIDEO, not about a person: there is no
 * free text, no device fingerprint, no biometric signal anywhere in this
 * module, and nothing here is ever sent to a model.
 */

// Run lifecycle — the server-authoritative path
export {
  startHazardRun,
  submitHazardReaction,
  getHazardRunSummary,
  listHazardRuns,
  HAZARD_RUN_LENGTH,
  MAX_PRESSES_PER_ITEM,
  CLOCK_SLACK_SEC,
} from "./attempts";
export type {
  StartRunOptions,
  StartedRun,
  SubmitReactionInput,
  SubmittedReaction,
} from "./attempts";

// Door policy — admission only; the logic never forks (doors.ts explains why)
export { hazardDoorRequiresPack } from "./doors";

// The item-engine seam
export { setHazardEngine, hasHazardEngine, getHazardEngine } from "./engine";

// Persistence seam (tests inject the in-memory fake; Prisma replaces it later)
export {
  setHazardRunStore,
  getHazardRunStore,
  InMemoryHazardRunStore,
  RUN_TTL_MS,
} from "./store";
export type { HazardRunStore, CreateHazardRunInput } from "./store";

// Types + errors
export { HazardPlayError } from "./types";
export type {
  HazardEngine,
  HazardDealRequest,
  HazardDealtItem,
  HazardJudgeRequest,
  HazardJudgement,
  HazardPlayErrorCode,
  HazardRunItemRecord,
  HazardRunRecord,
} from "./types";
