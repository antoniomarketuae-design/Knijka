/**
 * Streak transitions — all day boundaries are SOFIA (Europe/Sofia) calendar
 * days, not UTC days. July = EEST (UTC+3), January = EET (UTC+2), so the
 * fixtures below deliberately straddle UTC midnights in both directions.
 */

import { describe, expect, it } from "vitest";
import { applyStreak, effectiveStreak, isActiveToday } from "./streak";
import { sofiaDayIndex, sofiaDayString, sofiaHour } from "./time";

describe("sofia time helpers", () => {
  it("converts instants to Sofia calendar days (UTC+3 in summer)", () => {
    // 21:30 UTC on Jul 6 is 00:30 on Jul 7 in Sofia.
    expect(sofiaDayString(new Date("2026-07-06T21:30:00.000Z"))).toBe(
      "2026-07-07",
    );
    expect(sofiaDayString(new Date("2026-07-06T20:59:00.000Z"))).toBe(
      "2026-07-06",
    );
  });

  it("converts instants to Sofia calendar days (UTC+2 in winter)", () => {
    expect(sofiaDayString(new Date("2026-01-06T22:30:00.000Z"))).toBe(
      "2026-01-07",
    );
    expect(sofiaDayString(new Date("2026-01-06T21:59:00.000Z"))).toBe(
      "2026-01-06",
    );
  });

  it("day indices differ by exactly 1 across a Sofia midnight", () => {
    const before = new Date("2026-07-06T20:59:00.000Z"); // 23:59 Sofia Jul 6
    const after = new Date("2026-07-06T21:00:00.000Z"); // 00:00 Sofia Jul 7
    expect(sofiaDayIndex(after) - sofiaDayIndex(before)).toBe(1);
  });

  it("returns the Sofia hour of day", () => {
    expect(sofiaHour(new Date("2026-07-06T23:30:00.000Z"))).toBe(2); // 02:30
    expect(sofiaHour(new Date("2026-07-07T03:00:00.000Z"))).toBe(6); // 06:00
    expect(sofiaHour(new Date("2026-07-07T12:00:00.000Z"))).toBe(15);
  });
});

describe("applyStreak", () => {
  it("starts at 1 on the first ever activity", () => {
    const now = new Date("2026-07-07T12:00:00.000Z");
    expect(applyStreak({ streak: 0, lastActiveDay: null }, now)).toEqual({
      streak: 1,
      lastActiveDay: now,
    });
  });

  it("keeps the streak within the same Sofia day", () => {
    const last = new Date("2026-07-07T05:00:00.000Z"); // 08:00 Sofia
    const now = new Date("2026-07-07T20:00:00.000Z"); // 23:00 Sofia
    const next = applyStreak({ streak: 4, lastActiveDay: last }, now);
    expect(next.streak).toBe(4);
    expect(next.lastActiveDay).toBe(now);
  });

  it("increments across a Sofia midnight even within the SAME UTC day", () => {
    const last = new Date("2026-07-06T20:59:00.000Z"); // 23:59 Sofia Jul 6
    const now = new Date("2026-07-06T21:30:00.000Z"); // 00:30 Sofia Jul 7
    expect(applyStreak({ streak: 2, lastActiveDay: last }, now).streak).toBe(3);
  });

  it("does NOT increment across a UTC midnight within the same Sofia day", () => {
    const last = new Date("2026-07-06T21:30:00.000Z"); // 00:30 Sofia Jul 7
    const now = new Date("2026-07-07T10:00:00.000Z"); // 13:00 Sofia Jul 7
    expect(applyStreak({ streak: 5, lastActiveDay: last }, now).streak).toBe(5);
  });

  it("counts ~47h-apart activity as consecutive Sofia days", () => {
    const last = new Date("2026-07-05T22:00:00.000Z"); // 01:00 Sofia Jul 6
    const now = new Date("2026-07-07T20:59:00.000Z"); // 23:59 Sofia Jul 7
    expect(applyStreak({ streak: 1, lastActiveDay: last }, now).streak).toBe(2);
  });

  it("resets to 1 after a missed Sofia day", () => {
    const last = new Date("2026-07-05T10:00:00.000Z"); // Jul 5 Sofia
    const now = new Date("2026-07-07T12:00:00.000Z"); // Jul 7 Sofia
    expect(applyStreak({ streak: 9, lastActiveDay: last }, now).streak).toBe(1);
  });

  it("handles the winter (UTC+2) midnight boundary", () => {
    const last = new Date("2026-01-06T21:59:00.000Z"); // 23:59 Sofia Jan 6
    const now = new Date("2026-01-06T22:30:00.000Z"); // 00:30 Sofia Jan 7
    expect(applyStreak({ streak: 6, lastActiveDay: last }, now).streak).toBe(7);
  });

  it("never reports 0 after real activity, even on clock skew", () => {
    const last = new Date("2026-07-07T12:00:00.000Z");
    const now = new Date("2026-07-07T11:00:00.000Z"); // now < last
    expect(
      applyStreak({ streak: 0, lastActiveDay: last }, now).streak,
    ).toBe(1);
  });
});

describe("effectiveStreak / isActiveToday", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");

  it("shows the stored streak while the chain is alive", () => {
    const today = new Date("2026-07-07T06:00:00.000Z");
    const yesterday = new Date("2026-07-06T10:00:00.000Z");
    expect(effectiveStreak({ streak: 5, lastActiveDay: today }, now)).toBe(5);
    expect(effectiveStreak({ streak: 5, lastActiveDay: yesterday }, now)).toBe(5);
  });

  it("shows 0 once a day was missed (without writing anything)", () => {
    const twoDaysAgo = new Date("2026-07-05T10:00:00.000Z");
    expect(effectiveStreak({ streak: 5, lastActiveDay: twoDaysAgo }, now)).toBe(0);
    expect(effectiveStreak({ streak: 0, lastActiveDay: null }, now)).toBe(0);
  });

  it("detects same-Sofia-day activity for streakActiveToday", () => {
    // 21:30Z Jul 6 = 00:30 Sofia Jul 7 — same Sofia day as `now`.
    const earlyToday = new Date("2026-07-06T21:30:00.000Z");
    const yesterday = new Date("2026-07-06T10:00:00.000Z");
    expect(isActiveToday({ streak: 1, lastActiveDay: earlyToday }, now)).toBe(true);
    expect(isActiveToday({ streak: 1, lastActiveDay: yesterday }, now)).toBe(false);
    expect(isActiveToday({ streak: 0, lastActiveDay: null }, now)).toBe(false);
  });
});
