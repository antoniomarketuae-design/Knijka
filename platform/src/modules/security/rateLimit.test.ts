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

import { beforeEach, describe, expect, it } from "vitest";
import {
  checkLockout,
  clearFailures,
  consumeRateLimit,
  recordFailure,
  resetRateLimitState,
} from "./rateLimit";
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
  it("tolerates the free attempts, then backs off exponentially", () => {
    // A student mistyping their password twice waits for nothing.
    expect(recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(0);
    expect(recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(0);
    expect(checkLockout("ivan@mail.bg", LOCKOUT, T0)).toBe(0);

    // From the third failure on: 30 s, 60 s, then the 120 s ceiling.
    expect(recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(30);
    expect(recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(60);
    expect(recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(120);
    expect(recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(120);
  });

  it("reports the remaining wait and clears it when the wait is over", () => {
    for (let i = 0; i < 3; i++) recordFailure("ivan@mail.bg", LOCKOUT, T0);

    expect(checkLockout("ivan@mail.bg", LOCKOUT, T0 + 10_000)).toBe(20);
    expect(checkLockout("ivan@mail.bg", LOCKOUT, T0 + 30_000)).toBe(0);
  });

  it("is keyed per identifier — one attacked account never locks another", () => {
    for (let i = 0; i < 5; i++) recordFailure("target@mail.bg", LOCKOUT, T0);
    expect(checkLockout("target@mail.bg", LOCKOUT, T0)).toBeGreaterThan(0);
    expect(checkLockout("someone.else@mail.bg", LOCKOUT, T0)).toBe(0);
  });

  it("forgets the streak on a successful login", () => {
    for (let i = 0; i < 3; i++) recordFailure("ivan@mail.bg", LOCKOUT, T0);
    clearFailures("ivan@mail.bg", LOCKOUT);

    expect(checkLockout("ivan@mail.bg", LOCKOUT, T0)).toBe(0);
    // And the NEXT typo starts from zero again, not from the old streak.
    expect(recordFailure("ivan@mail.bg", LOCKOUT, T0)).toBe(0);
  });

  it("forgets a stale streak, so yesterday's typos cost nothing today", () => {
    for (let i = 0; i < 3; i++) recordFailure("ivan@mail.bg", LOCKOUT, T0);

    const nextDay = T0 + 24 * 60 * 60 * 1000;
    expect(checkLockout("ivan@mail.bg", LOCKOUT, nextDay)).toBe(0);
    expect(recordFailure("ivan@mail.bg", LOCKOUT, nextDay)).toBe(0);
  });
});
