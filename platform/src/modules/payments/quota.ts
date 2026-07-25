/**
 * Free-tier quota helpers — the four gates that make /pricing true.
 *
 * Every row of the /pricing comparison table is enforced by exactly one
 * function here, wired at exactly one server-side choke point. The rule is
 * blunt on purpose: if a row is sold, a function below decides it; if no
 * function below decides it, the row must not claim to be paid.
 *
 * 1. Practice: checkPracticeQuota() before recording a practice answer —
 *    theory/practice/actions.ts, before @/modules/learning submitAnswer
 *    (context "practice"). Free users get FREE_DAILY_PRACTICE_LIMIT
 *    questions per Europe/Sofia calendar day; any active pack lifts the cap.
 *
 * 2. Mock exams: requireEntitlementForExam() at the TOP of
 *    startExamAction() in src/app/(dashboard)/exams/actions.ts, before
 *    startExam() opens an attempt. Free users get FREE_MOCK_EXAM_LIMIT
 *    (= 1) exam EVER — a started attempt counts as used, so abandoning
 *    an exam does not refund the freebie. On `false`, redirect to
 *    /pricing instead of starting.
 *
 * 3. Simulator: requireEntitlementForSimulator() — simulator/access.ts, the
 *    single decision the /simulator page AND both simulator server actions
 *    call. Premium-only: it is the one thing the €21.99 pack sells over the
 *    €12.99 one, so a free (or core-only) account gets the paywall screen.
 *
 * 4. AI tutor: checkTutorQuota() — tutor/trial.ts, called by the page and by
 *    askTutorAction before any model spend. Free users get
 *    FREE_TUTOR_LIFETIME_MESSAGES questions EVER (the „кратък пробен достъп"
 *    the pricing table promises); any active pack lifts the cap to the
 *    module's own daily cost guard.
 *
 * All four read entitlements from the DB through the store — never from a
 * cookie, a prop or anything else the browser can write. A server action is a
 * public POST endpoint, so the gate lives in the action, not in the component
 * that renders the button.
 *
 * Day boundary: the student's wall clock (Europe/Sofia, UTC+2/+3 with DST),
 * NOT UTC — resetting the counter at 02:00/03:00 local would feel broken.
 */

import { getEntitlements } from "./entitlements";
import { getPaymentsStore } from "./store";
import type { PracticeQuota, TutorQuota } from "./types";

/** Free practice questions per Sofia day. Founder-adjustable. */
export const FREE_DAILY_PRACTICE_LIMIT = 20;

/** Free mock exams TOTAL (not per day). Founder-adjustable. */
export const FREE_MOCK_EXAM_LIMIT = 1;

/**
 * Free questions to the AI tutor TOTAL (not per day). Founder-adjustable.
 *
 * Lifetime rather than daily on purpose: the tutor is the only surface that
 * spends real model tokens per request, so a daily free trickle is an
 * unbounded bill across an unbounded number of free accounts. A handful of
 * questions is enough for the student to feel what a grounded, law-citing
 * answer is like — which is the whole point of a trial.
 *
 * Typed `number` rather than left as a literal so the Bulgarian singular /
 * plural copy that quotes it ("1 въпрос" vs "5 въпроса") still type-checks
 * after the founder edits the value.
 */
export const FREE_TUTOR_LIFETIME_MESSAGES: number = 5;

const SOFIA_TZ = "Europe/Sofia";

// ---------------------------------------------------------------------------
// Time-zone day window (no dependencies — Intl only)
// ---------------------------------------------------------------------------

interface WallClockDate {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

function wallClockDate(at: Date, timeZone: string): WallClockDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Zone offset (ms east of UTC) in `timeZone` at instant `at`. */
function timeZoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  // Drop sub-second precision — formatToParts only carries whole seconds.
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The UTC instant of local midnight on (y, m, d) in `timeZone`. */
function zonedMidnightUtc(
  { year, month, day }: WallClockDate,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day);
  // Two-step fixpoint: the offset can differ between the naive guess and the
  // true midnight on DST transition days. (Bulgaria switches at 03:00/04:00
  // local, so midnight itself always exists.)
  let guess = new Date(naive - timeZoneOffsetMs(new Date(naive), timeZone));
  guess = new Date(naive - timeZoneOffsetMs(guess, timeZone));
  return guess;
}

/**
 * The half-open UTC window [start, end) of the Europe/Sofia calendar day
 * containing `now`. Exported for the integrator (e.g. "resets at midnight"
 * countdown copy) and for tests.
 */
export function sofiaDayRange(now: Date): { start: Date; end: Date } {
  const today = wallClockDate(now, SOFIA_TZ);
  // Normalize day+1 through Date.UTC (handles month/year rollover).
  const next = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const tomorrow: WallClockDate = {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
  return {
    start: zonedMidnightUtc(today, SOFIA_TZ),
    end: zonedMidnightUtc(tomorrow, SOFIA_TZ),
  };
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Free-tier practice gate. Call BEFORE recording a practice answer; when
 * `allowed` is false show the paywall (remainingToday/limit feed the
 * "X от 20 за днес" counter). Users with an active pack are always allowed.
 * `now` is injectable for tests.
 */
export async function checkPracticeQuota(
  userId: string,
  now: Date = new Date(),
): Promise<PracticeQuota> {
  const access = await getEntitlements(userId, now);
  if (access.hasCore) {
    return {
      allowed: true,
      remainingToday: Number.POSITIVE_INFINITY,
      limit: FREE_DAILY_PRACTICE_LIMIT,
      unlimited: true,
    };
  }

  const { start, end } = sofiaDayRange(now);
  const usedToday = await getPaymentsStore().countQuestionAttempts(
    userId,
    "practice",
    start,
    end,
  );
  const remainingToday = Math.max(0, FREE_DAILY_PRACTICE_LIMIT - usedToday);
  return {
    allowed: remainingToday > 0,
    remainingToday,
    limit: FREE_DAILY_PRACTICE_LIMIT,
    unlimited: false,
  };
}

/**
 * Mock-exam gate: true = the user may start a mock exam now.
 * Active pack → always true. Free tier → true only while lifetime exam
 * attempts < FREE_MOCK_EXAM_LIMIT (started attempts count — no farming by
 * abandoning). On false, send the user to /pricing.
 * `now` is injectable for tests.
 */
export async function requireEntitlementForExam(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const access = await getEntitlements(userId, now);
  if (access.hasCore) return true;
  const attempts = await getPaymentsStore().countExamAttempts(userId);
  return attempts < FREE_MOCK_EXAM_LIMIT;
}

/**
 * Simulator gate: true = the user may drive.
 *
 * PREMIUM ONLY — no free allowance, no core allowance. The €12.99 „Пълна
 * подготовка" pack deliberately does NOT include the simulator: it is the
 * entire delta the €21.99 „Изпит + Симулатор" pack sells, so `hasCore` (which
 * premium implies) is the wrong question here. `hasPremium` is the only
 * correct one.
 *
 * On `false` the caller shows the simulator paywall — never a redirect loop
 * and never a half-loaded lesson screen: a free account must not receive the
 * lesson catalog at all.
 * `now` is injectable for tests.
 */
export async function requireEntitlementForSimulator(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const access = await getEntitlements(userId, now);
  return access.hasPremium;
}

/**
 * AI-tutor gate: how much of the free trial is left.
 *
 * `usedLifetime` is the number of questions this student has EVER sent, and
 * the caller must count it from the persisted thread (@/modules/tutor
 * getThread) — never from the wire. It is passed in rather than read here so
 * the payments module keeps no dependency on the tutor's storage; the trial
 * *rule* still lives in exactly one place, this function.
 *
 * Any active pack lifts the trial entirely; the tutor module's own daily
 * TUTOR_DAILY_MESSAGE_LIMIT (a cost guard, not a paywall) still applies on
 * top for everyone.
 * `now` is injectable for tests.
 */
export async function checkTutorQuota(
  userId: string,
  usedLifetime: number,
  now: Date = new Date(),
): Promise<TutorQuota> {
  const access = await getEntitlements(userId, now);
  if (access.hasCore) {
    return {
      allowed: true,
      remaining: Number.POSITIVE_INFINITY,
      limit: FREE_TUTOR_LIFETIME_MESSAGES,
      unlimited: true,
    };
  }

  const remaining = Math.max(0, FREE_TUTOR_LIFETIME_MESSAGES - usedLifetime);
  return {
    allowed: remaining > 0,
    remaining,
    limit: FREE_TUTOR_LIFETIME_MESSAGES,
    unlimited: false,
  };
}
