/**
 * The rate-limit policy — one table, so "what is protected and how hard" is a
 * single thing to read and to argue with (audit 2026-07-24, H-8).
 *
 * Each budget below is sized from what ONE honest 17-year-old actually does,
 * plus a generous margin, and then sanity-checked against what the attack it
 * stops costs us:
 *
 * - register  → bcrypt cost 12 is ~250–320 ms of CPU per call, unauthenticated.
 *               Five accounts per quarter hour is far more than any real person
 *               creates; it also caps the CPU an anonymous client can burn at
 *               ~1.6 s per 15 min, which a 2-core VPS does not notice.
 * - login     → a student who mistypes their password ten times in ten minutes
 *               needs the reset link, not another attempt. Paired with the
 *               per-e-mail lockout below, which is the half that survives a
 *               botnet rotating source IPs.
 * - checkout  → minting a Stripe Checkout Session is a paid API call on the
 *               founder's account and creates a session object every time.
 *               Ten per ten minutes covers "changed my mind about the pack".
 * - checkout/return → each view retrieves a Stripe session server-side
 *               (M-23). Authenticated now, but a reload loop still hits
 *               Stripe, so it keeps a loose ceiling.
 * - tutor     → a burst guard only. The real ceilings are the free-trial
 *               allowance (payments/quota.ts), the per-user daily message cap
 *               and the global daily spend cap (tutor/budget.ts); this one
 *               exists so a scripted client cannot fire a day's worth of
 *               questions in ten seconds while those counters catch up.
 *
 * THE FOUR BUDGETS AT THE BOTTOM ARE KEYED ON THE USER, NOT THE IP, and that is
 * the whole reason they exist as separate rules. Server actions are public
 * POSTs that never pass through the proxy chokepoint, so `rateLimitForRequest`
 * below cannot see them; and their callers are a classroom of teenagers behind
 * ONE school wi-fi NAT, where an IP budget would throttle the class because one
 * of them is studying hard. The server session id is the only key that is both
 * unforgeable (it comes from requireUser(), never the wire) and attached to the
 * person doing the work.
 */

import type { LockoutRule, RateLimitRule } from "./rateLimit";

export const RATE_LIMITS = {
  register: { name: "register", limit: 5, windowSec: 15 * 60 },
  login: { name: "login", limit: 10, windowSec: 10 * 60 },
  checkout: { name: "checkout", limit: 10, windowSec: 10 * 60 },
  checkoutReturn: { name: "checkout-return", limit: 30, windowSec: 5 * 60 },
  tutor: { name: "tutor", limit: 8, windowSec: 60 },

  // --- per-USER budgets on the server actions (audit: unmetered public POSTs)
  //
  // practiceAnswer → one content lookup plus three DB writes (QuestionAttempt,
  //   Progress upsert, gamification) EVERY call. A student answering 30
  //   questions in a minute is not studying; the fastest honest reading of a
  //   1-point question plus four options is ~8 s, so 30/min is nearly four
  //   times real use and still caps a script at ~1 write/s.
  // examStart → the ROW is bounded by the action's in-flight check (at most one
  //   live attempt per candidate), so this budget bounds the CALLS instead —
  //   each of which costs an indexed attempt lookup before that check can
  //   answer. Ten per ten minutes leaves a double-tapped button, a resumed
  //   paper and a genuinely new exam all comfortably inside it, while a script
  //   gets ten queries per ten minutes and no extra rows at all.
  // examSubmit → grades 45 questions and writes 45 QuestionAttempt rows. Ten
  //   per ten minutes leaves room for the client's retry-on-error path.
  // simFinish → writes a SimSession, an attempt trace (~15 KB), the learner
  //   -model fold and an XP award. A drill lasts minutes; 20 per ten minutes
  //   covers a fast reviewer and an abort-heavy session.
  practiceAnswer: { name: "practice-answer", limit: 30, windowSec: 60 },
  examStart: { name: "exam-start", limit: 10, windowSec: 10 * 60 },
  examSubmit: { name: "exam-submit", limit: 10, windowSec: 10 * 60 },
  simFinish: { name: "sim-finish", limit: 20, windowSec: 10 * 60 },

  // The two /settings actions that re-authenticate with verifyCredentials —
  // changing the password and deleting the account. Each is a bcrypt compare at
  // cost 12 (~250-320 ms of CPU) behind a valid session, so a signed-in caller
  // in a loop is a CPU drain on a 2-core VPS that the login limiter never sees.
  // Ten per ten minutes is far more than anyone re-types a password, and it is
  // NOT a brute-force guard: the caller already holds the session, so guessing
  // the password guards nothing they do not already have.
  credentialCheck: { name: "credential-check", limit: 10, windowSec: 10 * 60 },

  // The onboarding answers (User.examDate / dailyGoalMin / onboardedAt). One
  // indexed UPDATE of a single row per call — the cheapest write in the app —
  // but it is still a public POST, and the flow fires it at most three times
  // in a student's life plus one mirror-fill per new device. Thirty per ten
  // minutes leaves every honest path (re-answering, going back a step, a
  // second device) untouched and caps a loop at one write every twenty
  // seconds.
  onboarding: { name: "onboarding", limit: 30, windowSec: 10 * 60 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Per-e-mail lockout on failed logins. Two free typos beyond the usual three,
 * then 30 s, 1 m, 2 m, 4 m … capped at 15 min: long enough that online
 * guessing is pointless (a 15-min ceiling allows ~100 guesses a day against
 * one account), short enough that a student who finally remembers their
 * password is not locked out of the evening's practice.
 */
export const LOGIN_LOCKOUT: LockoutRule = {
  name: "login-email",
  freeAttempts: 5,
  baseDelaySec: 30,
  maxDelaySec: 15 * 60,
};

/**
 * Which rule (if any) guards this request. Returns null for everything else —
 * the proxy runs on hot paths like `/api/auth/session`, which the client polls,
 * and those must stay free.
 *
 * Method-aware on purpose: only the mutating calls are expensive. A GET to
 * `/api/auth/session` or `/api/auth/csrf` is a cookie decode.
 */
export function rateLimitForRequest(
  method: string,
  pathname: string,
): RateLimitRule | null {
  const isWrite = method !== "GET" && method !== "HEAD";

  if (isWrite && pathname === "/api/register") return RATE_LIMITS.register;

  // next-auth mounts credential sign-in at /api/auth/callback/credentials and
  // the provider-agnostic entry at /api/auth/signin/*. Both are guessing
  // surfaces; /api/auth/session, /csrf, /providers and sign-out are not.
  if (
    isWrite &&
    (pathname.startsWith("/api/auth/callback/") ||
      pathname.startsWith("/api/auth/signin"))
  ) {
    return RATE_LIMITS.login;
  }

  if (isWrite && pathname.startsWith("/api/checkout/")) {
    return RATE_LIMITS.checkout;
  }

  // A page, not an API route — but it makes a Stripe call per render.
  if (pathname === "/checkout/return") return RATE_LIMITS.checkoutReturn;

  return null;
}
