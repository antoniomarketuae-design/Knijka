/**
 * Fixed-window rate limiter — the abuse primitive (audit 2026-07-24, H-8).
 *
 * WHY IN-PROCESS AND NOT REDIS / @upstash/ratelimit:
 * the deployment this protects is ONE `next start` Node process on one VPS
 * behind nginx (docs/development/54, 61). A network round trip per request to
 * a store we would also have to run, monitor and back up buys nothing there —
 * and a limiter that can fail closed on a Redis blip is a worse outage than
 * the attack it prevents. A Map is exact for a single process, has no failure
 * mode, and adds zero dependencies to a repo that ships 9.8 MB to phones.
 *
 * WHAT IT COSTS US: the counters are per-process, so they reset on deploy and
 * do not add up across instances. Two consequences to keep in mind the day
 * this moves to Vercel (docs/development/54 names it as the eventual target):
 * an attacker gets a fresh budget after every deploy, and N instances mean an
 * effective limit of N × `limit`. That is the moment to swap the two functions
 * below for a shared store — everything else, including the policy table and
 * every call site, keeps working unchanged, which is the point of putting the
 * storage behind this narrow a seam.
 *
 * Fixed window (not sliding): a caller can spend a full budget at the end of
 * one window and another at the start of the next, i.e. up to 2 × `limit` in a
 * burst. Deliberate — the limits here are sized so that even the doubled
 * number is harmless (10 logins/10 min is 20 in the worst case, still nothing
 * like a guessing attack), and a sliding log would cost memory per request.
 */

/** One budget: `limit` hits per `windowSec`, per key. */
export interface RateLimitRule {
  /** Stable id — namespaces the key AND names the rule in the 429 body/logs. */
  readonly name: string;
  readonly limit: number;
  readonly windowSec: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** Hits left in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the window resets — feeds the `Retry-After` header. */
  retryAfterSec: number;
}

interface WindowState {
  count: number;
  /** Epoch ms at which the window (and this entry) expires. */
  resetAt: number;
}

/**
 * Upper bound on tracked keys. An attacker rotating source IPs would
 * otherwise turn the limiter itself into the memory leak — on a 16 GB box
 * that shares RAM with the founder's dev tools, that is a real DoS.
 * 10k entries × ~100 B is ~1 MB, and a real Bulgarian launch will never have
 * 10k distinct clients in one window.
 */
const MAX_TRACKED_KEYS = 10_000;

const windows = new Map<string, WindowState>();

/** Drop expired entries; if still over the cap, evict oldest-inserted keys. */
function evictIfNeeded(now: number): void {
  if (windows.size <= MAX_TRACKED_KEYS) return;

  for (const [key, state] of windows) {
    if (state.resetAt <= now) windows.delete(key);
  }
  // Still full: a flood of live keys. Map iterates in insertion order, so the
  // front is the oldest. Evicting fails OPEN for those keys — the honest
  // trade: a limiter that starts rejecting everyone under key pressure would
  // hand the attacker the outage they came for.
  while (windows.size > MAX_TRACKED_KEYS) {
    const oldest = windows.keys().next();
    if (oldest.done) break;
    windows.delete(oldest.value);
  }
}

/**
 * Count one hit against `rule` for `key` and say whether it is allowed.
 *
 * NOT idempotent — every call consumes budget, so call it once per request,
 * at the chokepoint, and never "just to look". `now` is injectable for tests.
 */
export function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): RateLimitVerdict {
  const bucketKey = `${rule.name}:${key}`;
  const windowMs = rule.windowSec * 1000;
  const existing = windows.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    windows.set(bucketKey, { count: 1, resetAt: now + windowMs });
    evictIfNeeded(now);
    return { allowed: true, remaining: rule.limit - 1, retryAfterSec: rule.windowSec };
  }

  existing.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  if (existing.count > rule.limit) {
    return { allowed: false, remaining: 0, retryAfterSec };
  }
  return {
    allowed: true,
    remaining: rule.limit - existing.count,
    retryAfterSec,
  };
}

// ---------------------------------------------------------------------------
// Failure lockout (credential guessing)
// ---------------------------------------------------------------------------

/**
 * Exponential lockout after repeated FAILURES for one identifier.
 *
 * Different question from the rate limit above, which is why it is a separate
 * structure: the rate limit asks "how many requests from this source", the
 * lockout asks "how many of them were wrong for this account". A botnet with a
 * thousand IPs defeats the first and not the second.
 */
export interface LockoutRule {
  readonly name: string;
  /** Free failures before any delay — a real student mistyping a password. */
  readonly freeAttempts: number;
  /** Delay after the first locking failure; doubles with each further one. */
  readonly baseDelaySec: number;
  /** Ceiling, so a forgotten password is never an all-day ban. */
  readonly maxDelaySec: number;
}

interface FailureState {
  failures: number;
  lockedUntil: number;
  /** Epoch ms after which the streak is forgotten entirely. */
  forgetAt: number;
}

/**
 * A streak is forgotten after this long with no further failure, so yesterday's
 * typos never count against today's login.
 */
const FAILURE_MEMORY_SEC = 60 * 60;

const failures = new Map<string, FailureState>();

function lockoutKey(rule: LockoutRule, identifier: string): string {
  return `${rule.name}:${identifier}`;
}

/** Seconds still to wait for `identifier`, or 0 when it may try now. */
export function checkLockout(
  identifier: string,
  rule: LockoutRule,
  now: number = Date.now(),
): number {
  const state = failures.get(lockoutKey(rule, identifier));
  if (!state) return 0;
  if (state.forgetAt <= now) {
    failures.delete(lockoutKey(rule, identifier));
    return 0;
  }
  if (state.lockedUntil <= now) return 0;
  return Math.max(1, Math.ceil((state.lockedUntil - now) / 1000));
}

/** Record a failed attempt and return the new wait in seconds (0 = none yet). */
export function recordFailure(
  identifier: string,
  rule: LockoutRule,
  now: number = Date.now(),
): number {
  const key = lockoutKey(rule, identifier);
  const previous = failures.get(key);
  const carried = previous && previous.forgetAt > now ? previous.failures : 0;
  const count = carried + 1;

  const over = count - rule.freeAttempts;
  const delaySec =
    over <= 0
      ? 0
      : Math.min(rule.maxDelaySec, rule.baseDelaySec * 2 ** (over - 1));

  failures.set(key, {
    failures: count,
    lockedUntil: now + delaySec * 1000,
    forgetAt: now + FAILURE_MEMORY_SEC * 1000,
  });
  evictFailuresIfNeeded(now);
  return delaySec;
}

/** A successful attempt clears the streak — the account is demonstrably fine. */
export function clearFailures(
  identifier: string,
  rule: LockoutRule,
): void {
  failures.delete(lockoutKey(rule, identifier));
}

function evictFailuresIfNeeded(now: number): void {
  if (failures.size <= MAX_TRACKED_KEYS) return;
  for (const [key, state] of failures) {
    if (state.forgetAt <= now) failures.delete(key);
  }
  while (failures.size > MAX_TRACKED_KEYS) {
    const oldest = failures.keys().next();
    if (oldest.done) break;
    failures.delete(oldest.value);
  }
}

/** Test-only: wipe all counters so suites do not leak state into each other. */
export function resetRateLimitState(): void {
  windows.clear();
  failures.clear();
}
