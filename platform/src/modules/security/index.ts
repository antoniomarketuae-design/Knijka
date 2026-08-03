/**
 * security module — public API (docs/architecture/05: modules talk only via
 * index.ts; deep imports are a review-blocking violation).
 *
 * Owns abuse limits: the one answer to "may this caller do this again right
 * now?" (audit 2026-07-24, H-8). Before this module the repo had no rate
 * limiting at all, which on a public URL means an unauthenticated stranger
 * could burn bcrypt CPU, guess passwords forever and mint Stripe sessions in a
 * loop.
 *
 * Two independent mechanisms, because they answer different questions:
 *
 * - `consumeRateLimit` — per-source budgets ("how many requests from here").
 *   Wired at the ONE chokepoint that provably runs before every handler:
 *   src/proxy.ts. The policy table (policy.ts) is the whole surface.
 * - `consumeUserRateLimit` — the same budgets keyed on the SERVER session id,
 *   for the server actions the proxy never sees. Same storage, different key,
 *   because a school shares one IP and a student does not share a session.
 * - `checkLockout` / `recordFailure` — per-identifier exponential backoff
 *   ("how many of them were WRONG for this account"). Wired in the credentials
 *   sign-in route, keyed on the e-mail, so a botnet with a thousand IPs still
 *   cannot grind one account.
 *
 * Storage is split, and the split is the argument: the per-source budgets are
 * in-process (rateLimit.ts says why, and what to change when this leaves the
 * single VPS), while the failure lockout is a DATABASE ROW — because our own
 * deploy cron restarts the process every five minutes and was resetting the
 * attacker's backoff for them (lockoutStore.ts).
 *
 * The tutor's spend ceiling is NOT here: it is money, not traffic, it needs
 * durable state, and it lives with the code that spends it
 * (@/modules/tutor budget.ts).
 */

export {
  consumeRateLimit,
  consumeUserRateLimit,
  checkLockout,
  recordFailure,
  clearFailures,
  purgeExpiredLockouts,
  resetRateLimitState,
} from "./rateLimit";
export type {
  RateLimitRule,
  RateLimitVerdict,
  LockoutRule,
} from "./rateLimit";

// Lockout persistence seam (tests inject the fake; production uses Prisma).
export {
  setLockoutStore,
  getLockoutStore,
  InMemoryLockoutStore,
} from "./lockoutStore";
export type { LockoutStore, LockoutRecord } from "./lockoutStore";

export { RATE_LIMITS, LOGIN_LOCKOUT, rateLimitForRequest } from "./policy";

export {
  clientIp,
  rateLimitedResponse,
  tooManyRequestsResponse,
  rateLimitMessageBg,
} from "./request";
