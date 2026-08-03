import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DAILY_GOAL_KEY,
  EXAM_DATE_KEY,
  NO_EXAM_DATE,
  ONBOARDING_DONE_KEY,
  fillMirrorFromServer,
  isMirrorCold,
  isOnboardingDone,
  readDailyGoalMin,
  readExamDate,
  writeExamDate,
} from "./storage";

/**
 * THE MIRROR, NOT THE SOURCE OF TRUTH.
 *
 * These keys used to be the only place the onboarding answers existed, which
 * is why a student who registered on a phone and opened a laptop lost their
 * exam date. The row is authoritative now; this file's job is to make the
 * dashboard chips paint synchronously and to accept what the server sends.
 */

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  // vitest runs in the node environment (no DOM): give storage.ts the two
  // things it guards for, so the guards themselves stay exercised.
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("a device that has never seen the answers", () => {
  it("reports a cold mirror", () => {
    expect(isMirrorCold()).toBe(true);
    writeExamDate("2026-09-15");
    expect(isMirrorCold()).toBe(false);
  });

  it("takes the student's answers from the server — the cross-device fix", () => {
    // This is the laptop, on the morning after the phone answered.
    fillMirrorFromServer({
      examDate: "2026-09-15",
      dailyGoalMin: 20,
      onboarded: true,
    });
    expect(readExamDate()).toBe("2026-09-15");
    expect(readDailyGoalMin()).toBe(20);
    // …and it must not re-ask a student who already answered.
    expect(isOnboardingDone()).toBe(true);
    expect(store.get(EXAM_DATE_KEY)).toBe("2026-09-15");
    expect(store.get(DAILY_GOAL_KEY)).toBe("20");
  });

  it("mirrors „Още нямам дата“ as the answer it is", () => {
    fillMirrorFromServer({
      examDate: NO_EXAM_DATE,
      dailyGoalMin: null,
      onboarded: true,
    });
    expect(readExamDate()).toBe(NO_EXAM_DATE);
    expect(readDailyGoalMin()).toBeNull();
  });

  it("writes nothing for a student the server knows nothing about", () => {
    fillMirrorFromServer({ examDate: null, dailyGoalMin: null, onboarded: false });
    expect(store.size).toBe(0);
    expect(isMirrorCold()).toBe(true);
  });

  it("refuses a goal that is not one of the three, however it got there", () => {
    fillMirrorFromServer({ examDate: null, dailyGoalMin: 7, onboarded: true });
    expect(readDailyGoalMin()).toBeNull();
    expect(store.has(DAILY_GOAL_KEY)).toBe(false);
  });

  it("does not restamp a completion this device already recorded", () => {
    fillMirrorFromServer({ examDate: null, dailyGoalMin: 10, onboarded: true });
    const first = store.get(ONBOARDING_DONE_KEY);
    fillMirrorFromServer({ examDate: null, dailyGoalMin: 10, onboarded: true });
    expect(store.get(ONBOARDING_DONE_KEY)).toBe(first);
  });
});

describe("localStorage that throws or is absent", () => {
  it("never lets a storage failure reach the flow", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    };
    expect(() =>
      fillMirrorFromServer({
        examDate: "2026-09-15",
        dailyGoalMin: 20,
        onboarded: true,
      }),
    ).not.toThrow();
    expect(readExamDate()).toBeNull();
  });

  it("is inert during SSR", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(isMirrorCold()).toBe(true);
    expect(() =>
      fillMirrorFromServer({ examDate: "2026-09-15", dailyGoalMin: 20, onboarded: true }),
    ).not.toThrow();
  });
});
