/**
 * askTutor / getThread — the tutor module's core flow.
 *
 * askTutor(userId, message):
 *   guard input → per-user burst limit → per-user daily message cap → GLOBAL
 *   daily spend cap → retrieve materials from the content bank AND the sim
 *   rule catalog → build the grounded system prompt (+ the student's 3 weakest
 *   concepts) → call the model → book tokens/cost (never skipped) → persist
 *   the exchange + the day's global ledger → return reply + citations.
 *
 * The three limits stack deliberately (audit 2026-07-24, H-8) and each one
 * answers a different question: how fast may ONE student ask (burst), how much
 * may ONE student ask today (message cap), and how much may the PRODUCT spend
 * today (money). Registration is free, so the first two are per-account
 * ceilings an attacker multiplies by simply registering again — only the third
 * one bounds the bill.
 */

import { getContentRepo } from "@/lib/content/repo";
import type { LawRef } from "@/lib/content/types";
import { getReadiness } from "@/modules/learning";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitMessageBg,
} from "@/modules/security";
import { checkDailyBudget, TUTOR_BUDGET_REPLY_BG } from "./budget";
import { computeCostMicroUsd } from "./cost";
import { getTutorModel, isTutorEnabled } from "./model";
import { buildTutorSystemPrompt, extractCitations } from "./prompt";
import { retrieveGrounding } from "./retrieval";
import { getTutorStore, type TutorMessage } from "./store";

/** Per-user daily cap on tutor questions — cheap to change, hard to miss. */
export const TUTOR_DAILY_MESSAGE_LIMIT = 30;
/** Max characters accepted for one student question. */
export const TUTOR_MAX_INPUT_LENGTH = 500;
/** How many prior messages are replayed as conversation context. */
export const TUTOR_HISTORY_MESSAGES = 12;
/** Output cap per reply — the tutor answers "in one breath". */
export const TUTOR_MAX_REPLY_TOKENS = 1024;
/** How many weakest concepts are injected for proactive suggestions. */
export const TUTOR_WEAKEST_CONCEPTS = 3;

export const TUTOR_LIMIT_REPLY_BG = `Стигна дневния лимит от ${TUTOR_DAILY_MESSAGE_LIMIT} въпроса към Учителя за днес. Ела пак утре — а дотогава най-полезното е една умна тренировка.`;

export interface TutorCitation {
  act: string;
  ref: string;
}

export interface AskTutorResult {
  threadId: string;
  reply: string;
  citations: TutorCitation[];
  /** True when the daily budget blocked the call (no API call was made). */
  limited: boolean;
}

export interface TutorThreadView {
  threadId: string | null;
  messages: TutorMessage[];
}

/** Local-server midnight — the daily budget window boundary. */
export function startOfTodayMs(now: Date = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Pure budget primitive: student questions sent since `sinceMs`. */
export function countUserMessagesSince(
  messages: TutorMessage[],
  sinceMs: number,
): number {
  return messages.filter((m) => m.role === "user" && m.ts >= sinceMs).length;
}

export async function getThread(userId: string): Promise<TutorThreadView> {
  const thread = await getTutorStore().getThreadByUser(userId);
  if (!thread) return { threadId: null, messages: [] };
  return { threadId: thread.id, messages: thread.messages };
}

export async function askTutor(
  userId: string,
  message: string,
): Promise<AskTutorResult> {
  const question = message.trim();
  if (question.length === 0 || question.length > TUTOR_MAX_INPUT_LENGTH) {
    throw new Error("askTutor: invalid message");
  }
  if (!isTutorEnabled()) {
    // The page/action layer gates on isTutorEnabled() and shows the
    // "активира скоро" state — reaching this is a programming error.
    throw new Error("askTutor: tutor is not enabled (missing ANTHROPIC_API_KEY)");
  }

  const store = getTutorStore();
  const thread =
    (await store.getThreadByUser(userId)) ?? (await store.createThread(userId));

  // Burst guard (H-8) — BEFORE the DB-backed ceilings, because it is the one
  // that costs nothing to evaluate. A server action is a public POST endpoint,
  // so a scripted client can fire a day's worth of questions in a few seconds;
  // this keeps the concurrent spend bounded while the counters below catch up.
  // Keyed on the user id, not the IP: the surface is authenticated, and one
  // student on shared school wi-fi must not throttle their whole class.
  const burst = consumeRateLimit(userId, RATE_LIMITS.tutor);
  if (!burst.allowed) {
    return {
      threadId: thread.id,
      reply: `${rateLimitMessageBg(burst.retryAfterSec)} Пиши ми въпроса спокойно — отговарям по-добре на един ясен въпрос, отколкото на десет бързи.`,
      citations: [],
      limited: true,
    };
  }

  // Per-user daily message cap — checked BEFORE any API spend.
  const usedToday = countUserMessagesSince(thread.messages, startOfTodayMs());
  if (usedToday >= TUTOR_DAILY_MESSAGE_LIMIT) {
    return {
      threadId: thread.id,
      reply: TUTOR_LIMIT_REPLY_BG,
      citations: [],
      limited: true,
    };
  }

  // GLOBAL daily spend ceiling — the kill-switch on the founder's Anthropic
  // key (budget.ts explains why the per-user caps above cannot bound the bill:
  // registration is free, so they multiply by the number of accounts an
  // attacker cares to create).
  const budget = await checkDailyBudget();
  if (!budget.withinBudget) {
    return {
      threadId: thread.id,
      reply: TUTOR_BUDGET_REPLY_BG,
      citations: [],
      limited: true,
    };
  }

  // Grounding: retrieval over OUR authored corpora only (ADR-002) — the
  // content bank plus the sim rule catalog, which is the only place that
  // knows what a mistake costs on the exam and what the right action was.
  const materials = retrieveGrounding(getContentRepo(), question);

  // Weakest concepts for proactive practice suggestions — advisory only,
  // a readiness failure must never block the tutor.
  let weakestConceptTitlesBg: string[] = [];
  try {
    const readiness = await getReadiness(userId);
    weakestConceptTitlesBg = readiness.weakestConcepts
      .slice(0, TUTOR_WEAKEST_CONCEPTS)
      .map((c) => c.titleBg);
  } catch {
    weakestConceptTitlesBg = [];
  }

  const system = buildTutorSystemPrompt({ materials, weakestConceptTitlesBg });
  const history = thread.messages
    .slice(-TUTOR_HISTORY_MESSAGES)
    .map(({ role, content }) => ({ role, content }));

  const result = await getTutorModel().complete({
    system,
    messages: [...history, { role: "user", content: question }],
    maxTokens: TUTOR_MAX_REPLY_TOKENS,
  });

  // Cost accounting from the API usage block — NEVER skipped.
  const costMicroUsd = computeCostMicroUsd(
    result.inputTokens,
    result.outputTokens,
  );

  const now = Date.now();
  const usage = {
    tokensIn: result.inputTokens,
    tokensOut: result.outputTokens,
    costMicroUsd,
  };
  const messages: TutorMessage[] = [
    ...thread.messages,
    { role: "user", content: question, ts: now },
    { role: "assistant", content: result.text, ts: now },
  ];
  await store.saveExchange(thread.id, messages, usage);

  // The global ledger the kill-switch reads. Booked from the SAME usage
  // object as the thread's counters, immediately after the call, so the two
  // can never disagree about what a day cost. A ledger-write failure must not
  // lose the student the answer they already paid for (it is in hand), so it
  // is logged rather than thrown — the next call re-reads the ledger anyway.
  try {
    await store.recordDaySpend(budget.day, usage);
  } catch (err) {
    console.error("[tutor] daily spend ledger write failed:", err);
  }

  // Citations validated against the injected materials — a marker the model
  // invented never becomes a chip.
  const knownRefs: LawRef[] = materials.flatMap((m) => m.lawRefs);
  const citations = extractCitations(result.text, knownRefs).map(
    ({ act, ref }) => ({ act, ref }),
  );

  return { threadId: thread.id, reply: result.text, citations, limited: false };
}
