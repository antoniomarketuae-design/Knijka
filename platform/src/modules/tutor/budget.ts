/**
 * The global daily Anthropic kill-switch (audit 2026-07-24, H-8).
 *
 * cost.ts has always booked what every call cost; nothing ever read that
 * number back and said "stop". The exposure is not theoretical: registration
 * is free, every fresh account gets its own daily message allowance, and the
 * key being spent is the founder's. Without a ceiling, the size of the bill is
 * decided by whoever wants to run a script the day the URL becomes public.
 *
 * Design rules this file follows:
 *
 * 1. The ceiling is on MONEY, not on requests. Tokens per reply vary; euros
 *    are what arrives on the statement.
 * 2. It is checked BEFORE the API call and booked immediately AFTER, so the
 *    worst overshoot is one reply (~$0.02 at TUTOR_MAX_REPLY_TOKENS) — a
 *    check-only-after design could overshoot by a whole concurrent burst.
 * 3. When it trips, the student gets an honest Bulgarian explanation inside
 *    the chat, in the Учител's own voice, and is pointed at the parts of the
 *    product that still work. Never an error page, never a spinner that ends
 *    in nothing: requirement-zero (doc 64 THEO-4) says this product explains
 *    itself, and "the AI is off today" is exactly the kind of thing a
 *    17-year-old deserves a straight answer about.
 * 4. It fails OPEN on a ledger read error. A database hiccup must not silently
 *    take the tutor offline for everyone; the per-user daily message cap and
 *    the free-trial allowance are still in force underneath.
 */

import { getTutorStore } from "./store";

/**
 * Daily ceiling in whole US dollars, overridable with TUTOR_DAILY_BUDGET_USD.
 *
 * $40/day ≈ 3,500 grounded answers on Sonnet 5: a steady-state turn is ~2,800
 * in / ~200 out ≈ $0.0114, because the system prompt is rebuilt on every call
 * (~1,860 tokens of instructions + 6 materials + 2 rule specs) and up to
 * TUTOR_HISTORY_MESSAGES prior messages are replayed.
 *
 * It was $5 — 438 answers, which is LESS than 500 active students asking three
 * questions each (doc 81 §5.2). A ceiling sized to survive abuse would
 * therefore have tripped mid-morning on the product's best real traffic day
 * and shown every student TUTOR_BUDGET_REPLY_BG until midnight. That is a
 * brownout dressed as a safety feature.
 *
 * RAISING IT IS ONLY SAFE BECAUSE THE PER-PACK ALLOWANCE EXISTS
 * (payments/quota.ts TUTOR_PACK_QUESTION_ALLOWANCE). Doc 81 §5.3 is emphatic
 * that the two ship together and never separately, and the reason is exactly
 * this file's own argument: before the allowance, this global number was the
 * only HARD brake on a single determined user, so loosening it eightfold on
 * its own would have removed the only brake there was. If the allowance is
 * ever taken out, put this back to 5 in the same commit.
 *
 * The figure this comment used to quote — „600 answers at ~100 in / ~350 out" —
 * was the TEST FIXTURE's usage numbers (fixtures.ts), not a measurement: 100
 * input tokens is less than the fixed instruction block alone. Sizing decisions
 * were being made against a number the product cannot produce.
 */
export const TUTOR_DAILY_BUDGET_USD_DEFAULT = 40;

const MICRO_USD_PER_USD = 1_000_000;

/** The configured ceiling in micro-USD (the unit the ledger stores). */
export function tutorDailyBudgetMicroUsd(): number {
  const raw = Number(process.env.TUTOR_DAILY_BUDGET_USD);
  const usd =
    Number.isFinite(raw) && raw > 0 ? raw : TUTOR_DAILY_BUDGET_USD_DEFAULT;
  return Math.round(usd * MICRO_USD_PER_USD);
}

/**
 * Shown instead of an answer once the day's budget is spent.
 *
 * Says what happened, when it comes back, and what still works — the same
 * shape as the per-user limit reply, so a student who hits either one is never
 * left guessing whether the product is broken or they did something wrong.
 */
export const TUTOR_BUDGET_REPLY_BG =
  "Днес Учителят изчерпа дневния си лимит за разговори (той важи за целия сайт, не само за теб). Утре сутрин съм отново на линия. Дотогава упражненията и обяснението към всеки въпрос работят напълно — точно там се учи най-много.";

/**
 * Built once. sofiaDayKey is now called per MESSAGE by the per-user daily cap
 * (service.ts), not once per request, and constructing an Intl formatter is by
 * far the expensive half of the call.
 */
const SOFIA_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Sofia",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The Europe/Sofia calendar day as "YYYY-MM-DD" — the ledger's primary key,
 * and the window both daily tutor limits are counted in.
 *
 * Sofia rather than UTC for the same reason payments/quota.ts uses it: a
 * budget that resets at 02:00 or 03:00 local looks broken to the student who
 * is still studying at midnight. `en-CA` is the locale whose short date format
 * IS ISO order, so no manual zero-padding is needed.
 */
export function sofiaDayKey(now: Date = new Date()): string {
  return SOFIA_DAY_FORMAT.format(now);
}

export interface TutorBudgetState {
  /** May we make an API call right now? */
  withinBudget: boolean;
  day: string;
  spentMicroUsd: number;
  budgetMicroUsd: number;
}

/** Read the ledger and decide. Fails OPEN — see rule 4 in the header. */
export async function checkDailyBudget(
  now: Date = new Date(),
): Promise<TutorBudgetState> {
  const day = sofiaDayKey(now);
  const budgetMicroUsd = tutorDailyBudgetMicroUsd();

  let spentMicroUsd = 0;
  try {
    spentMicroUsd = await getTutorStore().spentOnDay(day);
  } catch (err) {
    console.error("[tutor/budget] ledger read failed, failing open:", err);
    return { withinBudget: true, day, spentMicroUsd: 0, budgetMicroUsd };
  }

  return {
    withinBudget: spentMicroUsd < budgetMicroUsd,
    day,
    spentMicroUsd,
    budgetMicroUsd,
  };
}
