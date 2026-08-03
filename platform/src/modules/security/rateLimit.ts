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
 *
 * ONE HALF OF THIS FILE NO LONGER LIVES IN THE MAP. The failed-login lockout
 * moved to the LoginLockout table (lockoutStore.ts) because our own deploy
 * cron restarts this process every five minutes, which reset the backoff an
 * attacker is supposed to be paying. The per-source budgets below stay
 * in-process for exactly the reason they were written that way.
 */

import { createHash } from "node:crypto";
import {
  getLockoutStore,
  InMemoryLockoutStore,
  setLockoutStore,
  type LockoutRecord,
} from "./lockoutStore";

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

/**
 * Count one hit against `rule` for a SIGNED-IN USER.
 *
 * The only difference from `consumeRateLimit` is the key, and the key is the
 * entire point: server actions never reach the proxy, so their budget has to be
 * taken inside the action — and keying it on the source IP would put a whole
 * school behind one NAT on a single allowance. `userId` must come from the
 * server session (requireUser/getSessionUser), never from the request payload;
 * a client-supplied id would let an attacker pick a fresh bucket per call and
 * make the limiter decorative.
 *
 * Namespaced away from IP keys so a user id shaped like an address can never
 * collide with one.
 */
export function consumeUserRateLimit(
  userId: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): RateLimitVerdict {
  return consumeRateLimit(`user:${userId}`, rule, now);
}

// ---------------------------------------------------------------------------
// Failure lockout (credential guessing) — DURABLE, see lockoutStore.ts
// ---------------------------------------------------------------------------

/**
 * Exponential lockout after repeated FAILURES for one identifier.
 *
 * Different question from the rate limit above, which is why it is a separate
 * structure: the rate limit asks "how many requests from this source", the
 * lockout asks "how many of them were wrong for this account". A botnet with a
 * thousand IPs defeats the first and not the second.
 *
 * And a different STORE, which is the second half of that argument: a budget
 * that resets on deploy is a nuisance, a backoff that resets on deploy is a
 * hole — ours reset every five minutes, on a cron. The decision below is still
 * pure; only the counter it reads survives a restart now. All three functions
 * are therefore async, and all three fail OPEN if the database is unreachable.
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

/**
 * A streak is forgotten after this long with no further failure, so yesterday's
 * typos never count against today's login.
 */
const FAILURE_MEMORY_SEC = 60 * 60;

/**
 * The row key. NEVER the raw identifier: the lockout has to work for addresses
 * that were never registered (otherwise the endpoint becomes an account-
 * enumeration oracle), so the table must accept anything anyone types at the
 * login form — and it must not thereby become a permanent list of every such
 * address (ADR-004, users are minors). sha256 is the right primitive for the
 * same reason it is on PasswordResetToken: the lookup must be one indexed
 * probe, and there is no secret inside an e-mail for a salt to protect.
 */
function identifierHash(identifier: string): string {
  return createHash("sha256").update(identifier).digest("hex");
}

/**
 * DB failures FAIL OPEN, deliberately. If Postgres is unreachable the login
 * itself cannot succeed anyway (verifyCredentials reads the User row), so a
 * lockout that threw would convert a database blip into a 500 on the login
 * route and teach nobody anything. Logged, never silent.
 */
function lockoutUnavailable(op: string, err: unknown): void {
  console.warn(`security: login lockout ${op} failed, failing open`, err);
}

/**
 * How often one process bothers to sweep forgotten streaks.
 *
 * `checkLockout` already deletes any row it walks past, so this only reaches
 * the ones nobody ever came back for — which is precisely the set an attacker
 * rotating addresses leaves behind. Opportunistic rather than a cron because
 * the alternative is an unused export, and an unused export is exactly how the
 * practice ticket ended up built, tested and switched off.
 */
const LOCKOUT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
let lastSweepAt = 0;

async function sweepOccasionally(now: number): Promise<void> {
  if (now - lastSweepAt < LOCKOUT_SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  await purgeExpiredLockouts(new Date(now));
}

/** Seconds still to wait for `identifier`, or 0 when it may try now. */
export async function checkLockout(
  identifier: string,
  rule: LockoutRule,
  now: number = Date.now(),
): Promise<number> {
  // Sign-in is a rare path (bcrypt-bound by design), so one bulk DELETE an
  // hour rides on it unnoticed. Errors are swallowed inside purgeExpired.
  await sweepOccasionally(now);

  const hash = identifierHash(identifier);
  let record: LockoutRecord | null;
  try {
    record = await getLockoutStore().find(rule.name, hash);
  } catch (err) {
    lockoutUnavailable("read", err);
    return 0;
  }
  if (!record) return 0;

  if (record.forgetAt.getTime() <= now) {
    // The streak aged out. Drop the row on the way past — this is most of the
    // housekeeping the table needs, done by the traffic that created it.
    try {
      await getLockoutStore().clear(rule.name, hash);
    } catch (err) {
      lockoutUnavailable("clear", err);
    }
    return 0;
  }

  const lockedUntil = record.lockedUntil?.getTime() ?? 0;
  if (lockedUntil <= now) return 0;
  return Math.max(1, Math.ceil((lockedUntil - now) / 1000));
}

/** Record a failed attempt and return the new wait in seconds (0 = none yet). */
export async function recordFailure(
  identifier: string,
  rule: LockoutRule,
  now: number = Date.now(),
): Promise<number> {
  const hash = identifierHash(identifier);
  const store = getLockoutStore();

  let previous: LockoutRecord | null = null;
  try {
    previous = await store.find(rule.name, hash);
  } catch (err) {
    lockoutUnavailable("read", err);
  }

  // Read-then-write, not an atomic increment: two simultaneous wrong guesses
  // can both read the same count and cost the attacker one attempt less than
  // they should. That is the whole slop, it is bounded by concurrency, and the
  // alternative (increment, then a second write to derive lockedUntil from the
  // result) buys a single attempt for an extra round trip on every failure.
  const carried =
    previous && previous.forgetAt.getTime() > now ? previous.failures : 0;
  const count = carried + 1;

  const over = count - rule.freeAttempts;
  const delaySec =
    over <= 0
      ? 0
      : Math.min(rule.maxDelaySec, rule.baseDelaySec * 2 ** (over - 1));

  try {
    await store.save(rule.name, hash, {
      failures: count,
      lockedUntil: delaySec > 0 ? new Date(now + delaySec * 1000) : null,
      forgetAt: new Date(now + FAILURE_MEMORY_SEC * 1000),
    });
  } catch (err) {
    lockoutUnavailable("write", err);
  }
  return delaySec;
}

/** A successful attempt clears the streak — the account is demonstrably fine. */
export async function clearFailures(
  identifier: string,
  rule: LockoutRule,
): Promise<void> {
  try {
    await getLockoutStore().clear(rule.name, identifierHash(identifier));
  } catch (err) {
    lockoutUnavailable("clear", err);
  }
}

/**
 * Housekeeping sweep — forgotten streaks, deleted in bulk. `checkLockout`
 * already drops rows it walks past, so this only reaches the ones nobody ever
 * came back for. Safe to call from a cron or a route; returns the row count.
 */
export async function purgeExpiredLockouts(
  now: Date = new Date(),
): Promise<number> {
  try {
    return await getLockoutStore().purgeExpired(now);
  } catch (err) {
    lockoutUnavailable("purge", err);
    return 0;
  }
}

/**
 * Test-only: wipe all counters so suites do not leak state into each other.
 *
 * It also swaps the lockout store for a FRESH in-memory one. That is not a
 * convenience — it is what keeps a unit test from reaching Prisma (and needing
 * DATABASE_URL) simply because it exercised a login, which is the one thing
 * the old all-in-a-Map design got right and this seam must not lose.
 */
export function resetRateLimitState(): void {
  windows.clear();
  lastSweepAt = 0;
  setLockoutStore(new InMemoryLockoutStore());
}
