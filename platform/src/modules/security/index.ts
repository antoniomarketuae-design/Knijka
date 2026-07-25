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
 * - `checkLockout` / `recordFailure` — per-identifier exponential backoff
 *   ("how many of them were WRONG for this account"). Wired in the credentials
 *   sign-in route, keyed on the e-mail, so a botnet with a thousand IPs still
 *   cannot grind one account.
 *
 * Storage is in-process by design — rateLimit.ts explains why, and what to
 * change on the day this moves off a single VPS.
 *
 * The tutor's spend ceiling is NOT here: it is money, not traffic, it needs
 * durable state, and it lives with the code that spends it
 * (@/modules/tutor budget.ts).
 */

export {
  consumeRateLimit,
  checkLockout,
  recordFailure,
  clearFailures,
  resetRateLimitState,
} from "./rateLimit";
export type {
  RateLimitRule,
  RateLimitVerdict,
  LockoutRule,
} from "./rateLimit";

export { RATE_LIMITS, LOGIN_LOCKOUT, rateLimitForRequest } from "./policy";

export {
  clientIp,
  rateLimitedResponse,
  tooManyRequestsResponse,
  rateLimitMessageBg,
} from "./request";
