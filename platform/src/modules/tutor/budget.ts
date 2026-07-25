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
 * $5/day ≈ 600 grounded answers at the measured average (~100 in / ~350 out
 * tokens), which is far more tutoring than a Bulgarian launch cohort produces
 * in a day and still a bill the founder can absorb if it is ever hit by abuse.
 * Raise it when real usage says so — that is a one-env-var change, and the
 * number it protects is a real credit card.
 */
export const TUTOR_DAILY_BUDGET_USD_DEFAULT = 5;

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
 * The Europe/Sofia calendar day as "YYYY-MM-DD" — the ledger's primary key.
 *
 * Sofia rather than UTC for the same reason payments/quota.ts uses it: a
 * budget that resets at 02:00 or 03:00 local looks broken to the student who
 * is still studying at midnight. `en-CA` is the locale whose short date format
 * IS ISO order, so no manual zero-padding is needed.
 */
export function sofiaDayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
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
