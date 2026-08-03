/**
 * The abuse primitives (audit 2026-07-24, H-8).
 *
 * These tests are the specification of two properties that are easy to get
 * subtly wrong and impossible to notice in production until the bill arrives:
 * that a budget actually REFUSES rather than just counting, and that a failed
 * -login streak grows the wait instead of resetting it. Both are pure
 * functions of (key, rule, now), so `now` is passed explicitly everywhere —
 * a limiter test that sleeps is a flaky test.
 */

import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkLockout,
  clearFailures,
  consumeRateLimit,
  consumeUserRateLimit,
  purgeExpiredLockouts,
  recordFailure,
  resetRateLimitState,
} from "./rateLimit";
import { InMemoryLockoutStore, setLockoutStore } from "./lockoutStore";
import type { LockoutRule, RateLimitRule } from "./rateLimit";

const RULE: RateLimitRule = { name: "test", limit: 3, windowSec: 60 };
const OTHER: RateLimitRule = { name: "other", limit: 3, windowSec: 60 };

const LOCKOUT: LockoutRule = {
  name: "test-lock",
  freeAttempts: 2,
  baseDelaySec: 30,
  maxDelaySec: 120,
};

const T0 = Date.UTC(2026, 6, 25, 10, 0, 0);

beforeEach(() => {
  resetRateLimitState();
});

describe("consumeRateLimit", () => {
  it("allows exactly `limit` hits in a window and refuses the next one", () => {
    for (let i = 0; i < RULE.limit; i++) {
      const verdict = consumeRateLimit("1.2.3.4", RULE, T0);
      expect(verdict.allowed).toBe(true);
      expect(verdict.remaining).toBe(RULE.limit - 1 - i);
    }

    const blocked = consumeRateLimit("1.2.3.4", RULE, T0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    // Feeds `Retry-After` — a 429 without a usable wait is a 429 clients hammer.
    expect(blocked.retryAfterSec).toBe(60);
  });

  it("keeps refusing for the rest of the window, then reopens after it", () => {
    for (let i = 0; i < RULE.limit + 5; i++) consumeRateLimit("ip", RULE, T0);

    // One second before the window ends: still shut.
    expect(consumeRateLimit("ip", RULE, T0 + 59_000).allowed).toBe(false);
    // The instant it expires: a fresh full budget.
    const reopened = consumeRateLimit("ip", RULE, T0 + 60_000);
    expect(reopened.allowed).toBe(true);
    expect(reopened.remaining).toBe(RULE.limit - 1);
  });

  it("counts each key and each rule separately", () => {
    for (let i = 0; i < RULE.limit; i++) consumeRateLimit("attacker", RULE, T0);
    expect(consumeRateLimit("attacker", RULE, T0).allowed).toBe(false);

    // A different student behind a different IP is untouched...
    expect(consumeRateLimit("student", RULE, T0).allowed).toBe(true);
    // ...and so is the same IP on a different surface: burning the login
    // budget must not lock someone out of checkout.
    expect(consumeRateLimit("attacker", OTHER, T0).allowed).toBe(true);
  });

  it("shrinks Retry-After as the window drains", () => {
    for (let i = 0; i < RULE.limit; i++) consumeRateLimit("ip", RULE, T0);
    expect(consumeRateLimit("ip", RULE, T0 + 45_000).retryAfterSec).toBe(15);
  });
});

describe("failed-login lockout", () => {
  it("tolerates the free attempts, then backs off exponentially", async () => {
    // A student mistyping their password twice waits for nothing.
    expect(await recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(0);
    expect(await recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(0);
    expect(await checkLockout("ivan@mail.bg", LOCKOUT, T0)).toBe(0);

    // From the third failure on: 30 s, 60 s, then the 120 s ceiling.
    expect(await recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(30);
    expect(await recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(60);
    expect(await recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(120);
    expect(await recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(120);
  });

  it("reports the remaining wait and clears it when the wait is over", async () => {
    for (let i = 0; i < 3; i++) await recordFailure("ivan@mail.bg", LOCKOUT, T0);

    expect(await checkLockout("ivan@mail.bg", LOCKOUT, T0 + 10_000)).toBe(20);
    expect(await checkLockout("ivan@mail.bg", LOCKOUT, T0 + 30_000)).toBe(0);
  });

  it("is keyed per identifier — one attacked account never locks another", async () => {
    for (let i = 0; i < 5; i++) await recordFailure("target@mail.bg", LOCKOUT, T0);
    expect(await checkLockout("target@mail.bg", LOCKOUT, T0)).toBeGreaterThan(0);
    expect(await checkLockout("someone.else@mail.bg", LOCKOUT, T0)).toBe(0);
  });

  it("forgets the streak on a successful login", async () => {
    for (let i = 0; i < 3; i++) await recordFailure("ivan@mail.bg", LOCKOUT, T0);
    await clearFailures("ivan@mail.bg", LOCKOUT);

    expect(await checkLockout("ivan@mail.bg", LOCKOUT, T0)).toBe(0);
    // And the NEXT typo starts from zero again, not from the old streak.
    expect(await recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(0);
  });

  it("forgets a stale streak, so yesterday's typos cost nothing today", async () => {
    for (let i = 0; i < 3; i++) await recordFailure("ivan@mail.bg", LOCKOUT, T0);

    const nextDay = T0 + 24 * 60 * 60 * 1000;
    expect(await checkLockout("ivan@mail.bg", LOCKOUT, nextDay)).toBe(0);
    expect(await recordFailure("ivan@mail.bg", LOCKOUT, nextDay)).toBe(0);
  });
});

describe("consumeUserRateLimit", () => {
  it("keys on the user, so a school behind one NAT is not one bucket", () => {
    // The whole reason the server actions do not use the IP key: 30 students
    // on one school wi-fi share a source address and share nothing else.
    for (let i = 0; i < RULE.limit; i++) {
      expect(consumeUserRateLimit("student-a", RULE, T0).allowed).toBe(true);
    }
    expect(consumeUserRateLimit("student-a", RULE, T0).allowed).toBe(false);
    expect(consumeUserRateLimit("student-b", RULE, T0).allowed).toBe(true);
  });

  it("cannot be reached by an IP that names itself like a user id", () => {
    for (let i = 0; i < RULE.limit; i++) consumeUserRateLimit("u1", RULE, T0);
    expect(consumeUserRateLimit("u1", RULE, T0).allowed).toBe(false);
    // A raw key of the same text is a different bucket — namespaced apart.
    expect(consumeRateLimit("u1", RULE, T0).allowed).toBe(true);
  });
});

/**
 * THE BUG THIS SECTION EXISTS FOR IS OUR RELEASE CADENCE, not a coding error.
 * tools/deploy/knijka.cron redeploys every five minutes; while the streak was a
 * per-process Map, every one of those restarts handed an attacker a fresh
 * budget, so the 15-minute ceiling was never reachable and online guessing
 * against one account was effectively unlimited.
 */
describe("lockout durability across a process restart", () => {
  it("survives a restart — the streak is a row, not a Map entry", async () => {
    const store = new InMemoryLockoutStore();
    setLockoutStore(store);

    for (let i = 0; i < 4; i++) await recordFailure("ivan@mail.bg", LOCKOUT, T0);
    const waitBefore = await checkLockout("ivan@mail.bg", LOCKOUT, T0);
    expect(waitBefore).toBeGreaterThan(0);

    // A deploy: the whole in-process world is thrown away. The DB is not.
    resetRateLimitState();
    setLockoutStore(store);

    expect(await checkLockout("ivan@mail.bg", LOCKOUT, T0)).toBe(waitBefore);
    // And the streak CONTINUES rather than restarting at the free attempts.
    expect(await recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(
      LOCKOUT.maxDelaySec,
    );
  });

  it("stores sha256 of the address, never the address", async () => {
    const store = new InMemoryLockoutStore();
    setLockoutStore(store);

    await recordFailure("ivan@mail.bg", LOCKOUT, T0);

    const keys = [...store.rows.keys()];
    expect(keys).toHaveLength(1);
    // The table must be writable for addresses that were never registered (or
    // it becomes an enumeration oracle) — so it must not become a permanent
    // list of every address anyone typed at the login form (ADR-004).
    expect(keys[0]).not.toContain("ivan@mail.bg");
    expect(keys[0]).toBe(
      `${LOCKOUT.name}:${createHash("sha256").update("ivan@mail.bg").digest("hex")}`,
    );
  });

  it("fails OPEN when the database is unreachable", async () => {
    // A Postgres blip must not turn the login route into a 500. Login cannot
    // succeed without the DB anyway, so refusing here teaches nobody anything.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setLockoutStore({
      find: async () => {
        throw new Error("db is down");
      },
      save: async () => {
        throw new Error("db is down");
      },
      clear: async () => {
        throw new Error("db is down");
      },
      purgeExpired: async () => {
        throw new Error("db is down");
      },
    });

    expect(await checkLockout("ivan@mail.bg", LOCKOUT, T0)).toBe(0);
    expect(await recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(0);
    await expect(clearFailures("ivan@mail.bg", LOCKOUT)).resolves.toBeUndefined();
    expect(await purgeExpiredLockouts(new Date(T0))).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("purges forgotten streaks in bulk, and leaves live ones alone", async () => {
    const store = new InMemoryLockoutStore();
    setLockoutStore(store);

    await recordFailure("old@mail.bg", LOCKOUT, T0);
    await recordFailure("fresh@mail.bg", LOCKOUT, T0 + 60 * 60 * 1000);

    expect(await purgeExpiredLockouts(new Date(T0 + 61 * 60 * 1000))).toBe(1);
    expect(store.rows.size).toBe(1);
  });

  it("sweeps on its own, so the table cannot only ever grow", async () => {
    // checkLockout deletes rows it walks past, so the leftovers are exactly the
    // addresses nobody returns to — i.e. the ones an attacker rotating through
    // a word list creates. An export nobody calls would not fix that.
    const store = new InMemoryLockoutStore();
    setLockoutStore(store);

    await recordFailure("abandoned@mail.bg", LOCKOUT, T0);
    expect(store.rows.size).toBe(1);

    // Someone else signs in, much later, and never touches that key.
    const wellPastMemory = T0 + 25 * 60 * 60 * 1000;
    await checkLockout("someone.else@mail.bg", LOCKOUT, wellPastMemory);

    expect(store.rows.size).toBe(0);
  });
});
