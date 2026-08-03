import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FakeOnboardingStore,
  setOnboardingStore,
  type OnboardingStore,
} from "./store";
import {
  formatExamDay,
  MAX_EXAM_DAYS_AHEAD,
  parseExamDay,
  readOnboarding,
  saveOnboardingAnswers,
  toOnboardingPatch,
  toSnapshot,
} from "./service";
import { NO_EXAM_DATE } from "./storage";

/**
 * THE ANSWERS BELONG TO THE STUDENT, NOT TO ONE BROWSER.
 *
 * examDate, dailyGoalMin and onboardedAt existed as columns and nothing wrote
 * them: the flow put its answers in localStorage, so a student who registered
 * on a phone and opened the site on a laptop lost their exam date — and we
 * never had it server-side at all, which means „изпитът ти е след 6 дни“ was a
 * message this product could not send. On a one-time four-month pack with no
 * subscription, that countdown is the strongest retention signal collected.
 */

const NOW = new Date("2026-08-03T09:30:00.000Z");
let store: FakeOnboardingStore;

beforeEach(() => {
  store = new FakeOnboardingStore();
  store.seed("u-1");
  setOnboardingStore(store);
});

afterEach(() => setOnboardingStore(null));

describe("the exam day survives a timezone", () => {
  it("round-trips an ISO day through midnight UTC", () => {
    const day = parseExamDay("2026-09-15");
    expect(day).not.toBeNull();
    expect(day!.toISOString()).toBe("2026-09-15T00:00:00.000Z");
    expect(formatExamDay(day!)).toBe("2026-09-15");
  });

  it("formats with UTC getters, so the countdown is not a day out west of Greenwich", () => {
    // getDate() on midnight UTC returns the PREVIOUS day at any negative
    // offset, so a student in Sofia and a student in Chicago would see
    // different numbers off the same row — and the bug only ever appears for
    // users the developer is not. This assertion holds in every timezone; a
    // local-getter implementation fails it wherever the offset is negative.
    const day = new Date("2026-09-15T00:00:00.000Z");
    expect(formatExamDay(day)).toBe("2026-09-15");
    expect(formatExamDay(day)).toBe(
      [
        day.getUTCFullYear(),
        String(day.getUTCMonth() + 1).padStart(2, "0"),
        String(day.getUTCDate()).padStart(2, "0"),
      ].join("-"),
    );
    // …and both directions agree, including across a DST boundary.
    for (const iso of ["2026-01-01", "2026-03-29", "2026-10-25", "2026-12-31"]) {
      expect(formatExamDay(parseExamDay(iso)!)).toBe(iso);
    }
  });

  it("refuses a day that is not on the calendar", () => {
    // new Date("2026-02-31T00:00:00Z") silently becomes March 3rd.
    expect(parseExamDay("2026-02-31")).toBeNull();
    expect(parseExamDay("2026-13-01")).toBeNull();
    expect(parseExamDay("15/09/2026")).toBeNull();
    expect(parseExamDay("")).toBeNull();
  });
});

describe("toOnboardingPatch: a server action is a public POST", () => {
  it("takes the three answers the flow gives", () => {
    expect(
      toOnboardingPatch({ examDate: "2026-09-15", dailyGoalMin: 20 }, NOW),
    ).toEqual({
      examDate: new Date("2026-09-15T00:00:00.000Z"),
      dailyGoalMin: 20,
    });
  });

  it("writes „Още нямам дата“ as NULL, and only the stamp tells it from silence", () => {
    expect(toOnboardingPatch({ examDate: NO_EXAM_DATE }, NOW)).toEqual({
      examDate: null,
    });
    expect(toOnboardingPatch({ completed: true }, NOW)).toEqual({
      onboardedAt: NOW,
    });
  });

  it("rejects a goal that is not one of the three offered", () => {
    expect(toOnboardingPatch({ dailyGoalMin: 15 }, NOW)).toBeNull();
    expect(toOnboardingPatch({ dailyGoalMin: -1 }, NOW)).toBeNull();
    expect(toOnboardingPatch({ dailyGoalMin: 10_000 }, NOW)).toBeNull();
  });

  it("rejects an exam date past the horizon the product sells", () => {
    const far = new Date(NOW.getTime());
    far.setUTCDate(far.getUTCDate() + MAX_EXAM_DAYS_AHEAD + 1);
    expect(
      toOnboardingPatch({ examDate: formatExamDay(far) }, NOW),
      "„731 дни до изпита“ is not a countdown, it is a typo rendered",
    ).toBeNull();

    const near = new Date(NOW.getTime());
    near.setUTCDate(near.getUTCDate() + MAX_EXAM_DAYS_AHEAD - 1);
    expect(toOnboardingPatch({ examDate: formatExamDay(near) }, NOW)).not.toBeNull();
  });

  it("says nothing rather than blanking an answer it was not given", () => {
    // Step 2 posts only the goal. If `undefined` collapsed into `null`, the
    // exam date the student gave one screen earlier would be erased.
    const patch = toOnboardingPatch({ dailyGoalMin: 30 }, NOW);
    expect(patch).not.toBeNull();
    expect("examDate" in patch!).toBe(false);
    expect(toOnboardingPatch({}, NOW)).toBeNull();
  });
});

describe("the three states the UI has to tell apart", () => {
  it("never asked", () => {
    expect(toSnapshot({ examDate: null, dailyGoalMin: null, onboardedAt: null }))
      .toEqual({ examDate: null, dailyGoalMin: null, onboarded: false });
  });

  it("asked, answered „Още нямам дата“", () => {
    expect(
      toSnapshot({ examDate: null, dailyGoalMin: 20, onboardedAt: NOW }),
    ).toEqual({ examDate: NO_EXAM_DATE, dailyGoalMin: 20, onboarded: true });
  });

  it("asked, has a date", () => {
    expect(
      toSnapshot({
        examDate: new Date("2026-09-15T00:00:00.000Z"),
        dailyGoalMin: 10,
        onboardedAt: NOW,
      }),
    ).toEqual({ examDate: "2026-09-15", dailyGoalMin: 10, onboarded: true });
  });

  it("drops a goal the column should never have held", () => {
    expect(
      toSnapshot({ examDate: null, dailyGoalMin: 7, onboardedAt: NOW })
        .dailyGoalMin,
    ).toBeNull();
  });
});

describe("saveOnboardingAnswers: the write that did not exist", () => {
  it("puts the exam date on the row, where the next device can read it", async () => {
    expect(await saveOnboardingAnswers("u-1", { examDate: "2026-09-15" }, NOW)).toBe(
      true,
    );
    // The whole point: a DIFFERENT browser, with an empty localStorage.
    expect(await readOnboarding("u-1")).toEqual({
      examDate: "2026-09-15",
      dailyGoalMin: null,
      onboarded: false,
    });
  });

  it("stamps onboardedAt, so activation is one query and the flow stops re-asking", async () => {
    await saveOnboardingAnswers("u-1", { examDate: NO_EXAM_DATE, completed: true }, NOW);
    const snapshot = await readOnboarding("u-1");
    expect(snapshot.onboarded).toBe(true);
    // Answered „no date“ — NOT "never asked". Collapsing the two is what would
    // make the flow ask this student the same question forever.
    expect(snapshot.examDate).toBe(NO_EXAM_DATE);
  });

  it("keeps each step's answer when the next step writes", async () => {
    await saveOnboardingAnswers("u-1", { examDate: "2026-09-15" }, NOW);
    await saveOnboardingAnswers("u-1", { dailyGoalMin: 20 }, NOW);
    await saveOnboardingAnswers("u-1", { completed: true }, NOW);
    expect(await readOnboarding("u-1")).toEqual({
      examDate: "2026-09-15",
      dailyGoalMin: 20,
      onboarded: true,
    });
  });

  it("writes nothing at all for input that fails validation", async () => {
    expect(await saveOnboardingAnswers("u-1", { examDate: "nope" }, NOW)).toBe(false);
    expect(await saveOnboardingAnswers("u-1", { dailyGoalMin: 99 }, NOW)).toBe(false);
    expect(store.saves).toHaveLength(0);
  });

  it("does not block a student's first lesson when the database is down", async () => {
    const broken: OnboardingStore = {
      get: async () => {
        throw new Error("connection refused");
      },
      save: async () => {
        throw new Error("connection refused");
      },
    };
    setOnboardingStore(broken);
    await expect(
      saveOnboardingAnswers("u-1", { examDate: "2026-09-15" }, NOW),
    ).resolves.toBe(false);
    await expect(readOnboarding("u-1")).resolves.toEqual({
      examDate: null,
      dailyGoalMin: null,
      onboarded: false,
    });
  });

  it("is a no-op for a user row that is gone, not a crash", async () => {
    expect(await saveOnboardingAnswers("ghost", { examDate: "2026-09-15" }, NOW)).toBe(
      true,
    );
    expect(await readOnboarding("ghost")).toEqual({
      examDate: null,
      dailyGoalMin: null,
      onboarded: false,
    });
  });
});
