import { afterEach, describe, expect, it } from "vitest";
import {
  checkPracticeQuota,
  FREE_DAILY_PRACTICE_LIMIT,
  FREE_MOCK_EXAM_LIMIT,
  requireEntitlementForExam,
  sofiaDayRange,
} from "../quota";
import { InMemoryPaymentsStore, setPaymentsStore } from "../store";

// Summer (EEST, UTC+3): Sofia's 2026-07-07 = [2026-07-06T21:00Z, 2026-07-07T21:00Z)
const SUMMER_NOON = new Date("2026-07-07T12:00:00.000Z");
// Winter (EET, UTC+2): Sofia's 2026-01-15 = [2026-01-14T22:00Z, 2026-01-15T22:00Z)
const WINTER_NOON = new Date("2026-01-15T12:00:00.000Z");

const USER = "user-1";

let store: InMemoryPaymentsStore;

function freshStore(): InMemoryPaymentsStore {
  store = new InMemoryPaymentsStore();
  setPaymentsStore(store);
  return store;
}

function addPractice(userId: string, answeredAt: Date, count = 1): void {
  for (let i = 0; i < count; i++) {
    store.questionAttempts.push({ userId, context: "practice", answeredAt });
  }
}

async function grantCore(userId: string): Promise<void> {
  await store.createEntitlement({
    userId,
    pack: "core",
    purchasedAt: new Date("2026-06-01T00:00:00.000Z"),
    expiresAt: new Date("2026-10-01T00:00:00.000Z"),
    provider: "stripe",
    providerRef: `cs_test_${userId}`,
  });
}

afterEach(() => setPaymentsStore(null));

describe("sofiaDayRange (Europe/Sofia calendar day)", () => {
  it("summer (EEST, UTC+3): day runs 21:00Z → 21:00Z", () => {
    const { start, end } = sofiaDayRange(SUMMER_NOON);
    expect(start.toISOString()).toBe("2026-07-06T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-07T21:00:00.000Z");
  });

  it("winter (EET, UTC+2): day runs 22:00Z → 22:00Z", () => {
    const { start, end } = sofiaDayRange(WINTER_NOON);
    expect(start.toISOString()).toBe("2026-01-14T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-15T22:00:00.000Z");
  });

  it("late UTC evening already belongs to Sofia's NEXT day in summer", () => {
    // 2026-07-07T21:30Z = 2026-07-08 00:30 in Sofia
    const { start, end } = sofiaDayRange(new Date("2026-07-07T21:30:00.000Z"));
    expect(start.toISOString()).toBe("2026-07-07T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-08T21:00:00.000Z");
  });
});

describe("checkPracticeQuota (free tier, injected store + now)", () => {
  it("fresh free user: full allowance", async () => {
    freshStore();
    const quota = await checkPracticeQuota(USER, SUMMER_NOON);
    expect(quota).toEqual({
      allowed: true,
      remainingToday: FREE_DAILY_PRACTICE_LIMIT,
      limit: FREE_DAILY_PRACTICE_LIMIT,
      unlimited: false,
    });
  });

  it("counts only TODAY'S Sofia-day practice attempts", async () => {
    freshStore();
    // Inside today's window (both are 2026-07-07 in Sofia):
    addPractice(USER, new Date("2026-07-06T21:30:00.000Z"), 3); // 00:30 Sofia
    addPractice(USER, new Date("2026-07-07T11:00:00.000Z"), 2); // 14:00 Sofia
    // Outside (2026-07-06 23:30 Sofia = yesterday):
    addPractice(USER, new Date("2026-07-06T20:30:00.000Z"), 5);

    const quota = await checkPracticeQuota(USER, SUMMER_NOON);
    expect(quota.remainingToday).toBe(FREE_DAILY_PRACTICE_LIMIT - 5);
    expect(quota.allowed).toBe(true);
  });

  it("ignores non-practice contexts (exam answers are free)", async () => {
    freshStore();
    store.questionAttempts.push(
      { userId: USER, context: "exam", answeredAt: SUMMER_NOON },
      { userId: USER, context: "micro", answeredAt: SUMMER_NOON },
    );
    const quota = await checkPracticeQuota(USER, SUMMER_NOON);
    expect(quota.remainingToday).toBe(FREE_DAILY_PRACTICE_LIMIT);
  });

  it("ignores other users' attempts", async () => {
    freshStore();
    addPractice("someone-else", SUMMER_NOON, 20);
    const quota = await checkPracticeQuota(USER, SUMMER_NOON);
    expect(quota.remainingToday).toBe(FREE_DAILY_PRACTICE_LIMIT);
  });

  it("blocks at the limit and never reports negative remaining", async () => {
    freshStore();
    addPractice(USER, new Date("2026-07-07T10:00:00.000Z"), FREE_DAILY_PRACTICE_LIMIT + 3);
    const quota = await checkPracticeQuota(USER, SUMMER_NOON);
    expect(quota.allowed).toBe(false);
    expect(quota.remainingToday).toBe(0);
  });

  it("resets across the Sofia midnight boundary", async () => {
    freshStore();
    addPractice(USER, new Date("2026-07-07T10:00:00.000Z"), FREE_DAILY_PRACTICE_LIMIT);

    const blockedToday = await checkPracticeQuota(USER, SUMMER_NOON);
    expect(blockedToday.allowed).toBe(false);

    // 21:01Z the same UTC day = 00:01 Sofia on July 8 → fresh allowance
    const afterMidnight = await checkPracticeQuota(
      USER,
      new Date("2026-07-07T21:01:00.000Z"),
    );
    expect(afterMidnight.allowed).toBe(true);
    expect(afterMidnight.remainingToday).toBe(FREE_DAILY_PRACTICE_LIMIT);
  });

  it("active pack lifts the cap entirely", async () => {
    freshStore();
    await grantCore(USER);
    addPractice(USER, new Date("2026-07-07T10:00:00.000Z"), 500);

    const quota = await checkPracticeQuota(USER, SUMMER_NOON);
    expect(quota.allowed).toBe(true);
    expect(quota.unlimited).toBe(true);
    expect(quota.remainingToday).toBe(Number.POSITIVE_INFINITY);
  });

  it("an EXPIRED pack does not lift the cap", async () => {
    freshStore();
    await store.createEntitlement({
      userId: USER,
      pack: "core",
      purchasedAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: new Date("2026-05-01T00:00:00.000Z"), // expired before NOW
      provider: "stripe",
      providerRef: "cs_test_expired",
    });
    addPractice(USER, new Date("2026-07-07T10:00:00.000Z"), FREE_DAILY_PRACTICE_LIMIT);

    const quota = await checkPracticeQuota(USER, SUMMER_NOON);
    expect(quota.unlimited).toBe(false);
    expect(quota.allowed).toBe(false);
  });
});

describe("requireEntitlementForExam (1 free mock exam total)", () => {
  it("free user with no attempts may start", async () => {
    freshStore();
    expect(await requireEntitlementForExam(USER, SUMMER_NOON)).toBe(true);
  });

  it("free user who used the freebie is paywalled — even if it was abandoned", async () => {
    freshStore();
    store.examAttemptUserIds.push(USER); // started once, ever
    expect(FREE_MOCK_EXAM_LIMIT).toBe(1);
    expect(await requireEntitlementForExam(USER, SUMMER_NOON)).toBe(false);
  });

  it("any active pack allows unlimited mock exams", async () => {
    freshStore();
    store.examAttemptUserIds.push(USER, USER, USER);
    await grantCore(USER);
    expect(await requireEntitlementForExam(USER, SUMMER_NOON)).toBe(true);
  });

  it("other users' attempts do not consume the freebie", async () => {
    freshStore();
    store.examAttemptUserIds.push("someone-else");
    expect(await requireEntitlementForExam(USER, SUMMER_NOON)).toBe(true);
  });
});
