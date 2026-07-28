/**
 * askTutor / getThread — the tutor module's core flow.
 *
 * askTutor(userId, message):
 *   guard input → per-user burst limit → per-user daily message cap → per-PACK
 *   allowance → GLOBAL daily spend cap → retrieve materials from the content
 *   bank AND the sim rule catalog → build the grounded system prompt (+ the
 *   student's weakest theory concepts AND their recent simulator mistakes) →
 *   call the model → book tokens/cost (never skipped) → validate the citations
 *   against this turn's materials → persist the exchange (citations included)
 *   + the day's global ledger → return reply + citations.
 *
 * The four limits stack deliberately (audit 2026-07-24 H-8; doc 81 §5.3) and
 * each one answers a different question: how fast may ONE student ask (burst),
 * how much may ONE student ask today (message cap), how much does their PACK
 * buy in total (allowance), and how much may the PRODUCT spend today (money).
 * Registration is free, so the first two are per-account ceilings an attacker
 * multiplies by simply registering again; the allowance is the one that bounds
 * a single PAYING student's four-month tail, and the global one bounds the
 * bill in every other case.
 */

import { getContentRepo } from "@/lib/content/repo";
import type { LawRef } from "@/lib/content/types";
import { getReadiness, getSimWeakSpots } from "@/modules/learning";
import { checkTutorPackAllowance } from "@/modules/payments";
import type { TutorPackAllowance } from "@/modules/payments";
import {
  consumeRateLimit,
  RATE_LIMITS,
  rateLimitMessageBg,
} from "@/modules/security";
import { tutorAllowanceSpentReplyBg } from "./allowance";
import { checkDailyBudget, sofiaDayKey, TUTOR_BUDGET_REPLY_BG } from "./budget";
import { computeCostMicroUsd } from "./cost";
import { getTutorModel, isTutorEnabled } from "./model";
import { buildTutorSystemPrompt, extractCitations } from "./prompt";
import {
  MAX_RETRIEVED_ITEMS,
  retrieveGroundingForTurn,
  retrieveMaterialsInTopic,
  type RetrievedItem,
} from "./retrieval";
import {
  getTutorStore,
  type TutorCitation,
  type TutorMessage,
} from "./store";

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
/** How many recent simulator weak spots are injected alongside them (D4). */
export const TUTOR_SIM_WEAK_SPOTS = 3;

export const TUTOR_LIMIT_REPLY_BG = `Стигна дневния лимит от ${TUTOR_DAILY_MESSAGE_LIMIT} въпроса към Учителя за днес. Ела пак утре — а дотогава най-полезното е една умна тренировка.`;

export type { TutorCitation };

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

/**
 * A question asked FROM INSIDE A LESSON (doc 84 §2.2) — the founder's „the
 * student can interrupt the teacher and ask questions".
 *
 * A lesson beat is the best-specified context this product will ever have: it
 * names a concept, a rule code, a scenario and a set of questions all at once,
 * and it names them because an author wrote them down, not because a scorer
 * ranked them. So an interruption gets a STRICTER grounding contract than free
 * chat, and a cheaper one:
 *
 *   Tier 1  `materials` — the beat's own concepts/questions/rules/signs,
 *           INJECTED, not retrieved. No scoring, no ranking, no threshold.
 *   Tier 2  the remaining slots, ranked but scoped to `topicId`
 *           (retrieveMaterialsInTopic) — never widened to the whole bank.
 *   Tier 3  nothing above the floor ⇒ the caller refuses. The refusal is the
 *           feature; the lesson layer makes it constructive rather than bare.
 *
 * The thread's history is NOT replayed for a lesson turn: a beat is a bounded
 * topic, and doc 81's 12-message replay is what makes the free-chat prompt
 * grow. All four spending ceilings still apply, unchanged — there is exactly
 * one budgeted model path in this product and this is it.
 */
export interface TutorLessonContext {
  kind: "lesson";
  lessonId: string;
  beatId: string;
  /** Content-bank topic id ("t-…") the lesson belongs to. Scopes Tier 2. */
  topicId: string;
  /** Tier-1 materials, injected verbatim. */
  materials: RetrievedItem[];
}

/**
 * Pure budget primitive: student questions sent on the Europe/Sofia calendar
 * day `day` ("YYYY-MM-DD", from sofiaDayKey).
 *
 * Sofia, not server-local (doc 81 §1.4, D5). This used to count „since
 * `d.setHours(0,0,0,0)`" — midnight on whatever clock the box happens to run.
 * The staging VPS is UTC, so a student's 30-question day rolled over at 02:00
 * or 03:00 Bulgarian time: ask at 00:30, and it came out of yesterday's
 * allowance. budget.ts and payments/quota.ts had both already settled on the
 * student's wall clock for exactly this reason; this counter was the one that
 * did not, and it is the one the student actually feels.
 */
export function countUserMessagesOnDay(
  messages: TutorMessage[],
  day: string,
): number {
  return messages.filter(
    (m) => m.role === "user" && sofiaDayKey(new Date(m.ts)) === day,
  ).length;
}

/**
 * When every question the student has ever asked was sent, oldest first.
 *
 * This is what the per-pack allowance is counted from (payments/quota.ts
 * checkTutorPackAllowance): only `role: "user"` rows, because the allowance
 * buys QUESTIONS, and only rows the tutor itself wrote through saveExchange —
 * which is what makes a failed or refused call free. A reply that never
 * happened leaves no user row behind, so it can never cost the student one of
 * their 300.
 */
export function userQuestionTimestamps(messages: TutorMessage[]): number[] {
  return messages.filter((m) => m.role === "user").map((m) => m.ts);
}

/**
 * How much of the pack's tutor allowance this student has left.
 *
 * Exported for the page, which renders the „остават ти N от 300" counter above
 * the chat (allowance.ts tutorAllowanceNoticeBg decides whether it appears at
 * all). `messages` comes from getThread, so a caller that already loaded the
 * thread does not read it twice.
 */
export async function getTutorAllowance(
  userId: string,
  messages: TutorMessage[],
): Promise<TutorPackAllowance> {
  return checkTutorPackAllowance(userId, userQuestionTimestamps(messages));
}

/**
 * Run a personalization read that the tutor can do without. Anything it throws
 * — a database hiccup, an uninitialized repo, a shape that changed — costs the
 * student a hint, never the answer they came for.
 */
async function advisory(read: () => Promise<string[]>): Promise<string[]> {
  try {
    return await read();
  } catch {
    return [];
  }
}

/**
 * The student's previous question in this thread, for follow-up grounding
 * (retrieval.ts retrieveGroundingForTurn). Null when this is the first one.
 */
export function previousUserQuestion(messages: TutorMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return null;
}

/**
 * Tier 1 (injected) then Tier 2 (topic-scoped, ranked), deduplicated by id and
 * capped at the same MAX_RETRIEVED_ITEMS the free-chat path uses. Tier 1 keeps
 * its slots: an authored material a human attached to this beat outranks
 * anything a keyword scorer found, always.
 */
function lessonGrounding(
  context: TutorLessonContext,
  question: string,
): RetrievedItem[] {
  const seen = new Set(context.materials.map((m) => m.id));
  const room = Math.max(0, MAX_RETRIEVED_ITEMS - context.materials.length);
  const tier2 =
    room === 0
      ? []
      : retrieveMaterialsInTopic(
          getContentRepo(),
          question,
          context.topicId,
          MAX_RETRIEVED_ITEMS,
        )
          .filter((m) => !seen.has(m.id))
          .slice(0, room);
  return [...context.materials, ...tier2];
}

export async function getThread(userId: string): Promise<TutorThreadView> {
  const thread = await getTutorStore().getThreadByUser(userId);
  if (!thread) return { threadId: null, messages: [] };
  return { threadId: thread.id, messages: thread.messages };
}

export async function askTutor(
  userId: string,
  message: string,
  context?: TutorLessonContext,
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
  const usedToday = countUserMessagesOnDay(thread.messages, sofiaDayKey());
  if (usedToday >= TUTOR_DAILY_MESSAGE_LIMIT) {
    return {
      threadId: thread.id,
      reply: TUTOR_LIMIT_REPLY_BG,
      citations: [],
      limited: true,
    };
  }

  // What the PACK bought (doc 81 §5.3). The daily cap above says how much a
  // student may ask TODAY; this says how much their €12.99 buys in total, and
  // it is the only ceiling here that a paying student can reach. It has to be
  // enforced at this line rather than at the page's trial gate, because this
  // is the one place model tokens are actually spent — every future tutor
  // surface (why-panel, debrief) arrives through here too.
  const allowance = await getTutorAllowance(userId, thread.messages);
  if (!allowance.allowed) {
    return {
      threadId: thread.id,
      reply: tutorAllowanceSpentReplyBg(allowance.limit),
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
  // The previous question rides along so a bare „А защо?“ still lands on the
  // topic it is asking about instead of forcing a refusal (D2).
  const materials =
    context === undefined
      ? retrieveGroundingForTurn(
          getContentRepo(),
          question,
          previousUserQuestion(thread.messages),
        )
      : lessonGrounding(context, question);

  // What the student is weak at — in theory AND behind the wheel. Advisory
  // only: neither read may block the tutor, so each degrades to an empty list.
  // They are fetched together because they answer the same question about the
  // same student, and asking only the first is what made this "the theory
  // tutor" rather than "the tutor" (D4).
  const [weakestConceptTitlesBg, simWeakSpotsBg] = await Promise.all([
    advisory(async () =>
      (await getReadiness(userId)).weakestConcepts
        .slice(0, TUTOR_WEAKEST_CONCEPTS)
        .map((c) => c.titleBg),
    ),
    advisory(async () =>
      (await getSimWeakSpots(userId, TUTOR_SIM_WEAK_SPOTS)).spots.map(
        (s) => `${s.titleBg} — ${s.violationCount} пъти`,
      ),
    ),
  ]);

  const system = buildTutorSystemPrompt({
    materials,
    weakestConceptTitlesBg,
    simWeakSpotsBg,
  });
  // A lesson turn replays no history: the beat IS the context, and it is a
  // better one than twelve messages of chat. This is most of why an
  // interruption is ~2.3× cheaper per turn than a free-chat turn.
  const history =
    context === undefined
      ? thread.messages
          .slice(-TUTOR_HISTORY_MESSAGES)
          .map(({ role, content }) => ({ role, content }))
      : [];

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

  // Citations validated against the injected materials — a marker the model
  // invented never becomes a chip. Computed BEFORE the write, because the
  // whitelist is only meaningful against THIS turn's materials and the UI now
  // renders chips strictly from the stored list (D1): re-deriving it on a
  // later read would score a hallucinated marker against a different
  // retrieval, which is how an invented reference gets approved by accident.
  const knownRefs: LawRef[] = materials.flatMap((m) => m.lawRefs);
  const citations: TutorCitation[] = extractCitations(
    result.text,
    knownRefs,
  ).map(({ act, ref }) => ({ act, ref }));

  const now = Date.now();
  const usage = {
    tokensIn: result.inputTokens,
    tokensOut: result.outputTokens,
    costMicroUsd,
  };
  const messages: TutorMessage[] = [
    ...thread.messages,
    { role: "user", content: question, ts: now },
    { role: "assistant", content: result.text, ts: now, citations },
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

  return { threadId: thread.id, reply: result.text, citations, limited: false };
}
