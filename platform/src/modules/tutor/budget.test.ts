/**
 * The global daily Anthropic kill-switch (audit 2026-07-24, H-8).
 *
 * The finding was blunt: `cost.ts` tracks spend but nothing enforces a
 * ceiling, so "register N accounts, get N×30 calls against the founder's key".
 * The per-user caps cannot fix that — they are per ACCOUNT and accounts are
 * free — so the property these tests pin is the one that actually bounds the
 * bill: past a configured daily total, askTutor stops calling the model at
 * all, and says so in Bulgarian instead of erroring.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setContentRepo } from "@/lib/content/repo";
import { getReadiness } from "@/modules/learning";
import { resetRateLimitState } from "@/modules/security";
import {
  checkDailyBudget,
  sofiaDayKey,
  TUTOR_BUDGET_REPLY_BG,
  TUTOR_DAILY_BUDGET_USD_DEFAULT,
  tutorDailyBudgetMicroUsd,
} from "./budget";
import { computeCostMicroUsd } from "./cost";
import {
  FakeTutorModel,
  FakeTutorStore,
  makeTutorFixtureRepo,
} from "./fixtures";
import { setTutorModel } from "./model";
import { askTutor } from "./service";
import { setTutorStore } from "./store";

vi.mock("@/modules/learning", () => ({ getReadiness: vi.fn() }));

const USER = "user-1";
const REPLY = "Пропускаш идващите по пътя с предимство [ЗДвП чл. 47].";

let store: FakeTutorStore;
let model: FakeTutorModel;

beforeEach(() => {
  resetRateLimitState();
  setContentRepo(makeTutorFixtureRepo());
  store = new FakeTutorStore();
  model = new FakeTutorModel(REPLY);
  setTutorStore(store);
  setTutorModel(model);
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-not-real");
  vi.mocked(getReadiness).mockResolvedValue({
    score: 40,
    perTopic: [],
    weakestConcepts: [],
  });
});

afterEach(() => {
  setTutorStore(null);
  setTutorModel(null);
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("the day key", () => {
  it("is the Europe/Sofia calendar day, not UTC", () => {
    // 22:30 UTC on 24 July is already 25 July in Sofia (UTC+3 in summer).
    // Getting this wrong resets the budget mid-evening, while students study.
    expect(sofiaDayKey(new Date("2026-07-24T22:30:00Z"))).toBe("2026-07-25");
    expect(sofiaDayKey(new Date("2026-07-24T20:30:00Z"))).toBe("2026-07-24");
  });
});

describe("the configured ceiling", () => {
  it("defaults to the founder-set figure and is overridable by env", () => {
    expect(tutorDailyBudgetMicroUsd()).toBe(
      TUTOR_DAILY_BUDGET_USD_DEFAULT * 1_000_000,
    );

    vi.stubEnv("TUTOR_DAILY_BUDGET_USD", "12.5");
    expect(tutorDailyBudgetMicroUsd()).toBe(12_500_000);
  });

  it("ignores nonsense rather than degrading to a zero budget", () => {
    // A typo'd env var must not silently take the tutor offline for everyone.
    vi.stubEnv("TUTOR_DAILY_BUDGET_USD", "not-a-number");
    expect(tutorDailyBudgetMicroUsd()).toBe(
      TUTOR_DAILY_BUDGET_USD_DEFAULT * 1_000_000,
    );
    vi.stubEnv("TUTOR_DAILY_BUDGET_USD", "0");
    expect(tutorDailyBudgetMicroUsd()).toBe(
      TUTOR_DAILY_BUDGET_USD_DEFAULT * 1_000_000,
    );
  });
});

describe("askTutor under the kill-switch", () => {
  it("books every reply into the global day ledger", async () => {
    await askTutor(USER, "Кога имам предимство?");
    await askTutor(USER, "А на кръгово?");

    const day = sofiaDayKey();
    // Same numbers the thread was charged — one usage object, two ledgers.
    expect(await store.spentOnDay(day)).toBe(2 * computeCostMicroUsd(100, 50));
  });

  it("stops calling Anthropic once the day's budget is spent", async () => {
    vi.stubEnv("TUTOR_DAILY_BUDGET_USD", "1");
    store.seedDaySpend(sofiaDayKey(), 1_000_000);

    const result = await askTutor(USER, "Кога имам предимство?");

    // The whole point: no API call, so no further spend.
    expect(model.completeCalls).toHaveLength(0);
    expect(result.limited).toBe(true);
    expect(result.reply).toBe(TUTOR_BUDGET_REPLY_BG);
    // Degrades gracefully — a reply in the Учител's voice, not an exception,
    // and it points at what still works (requirement-zero, doc 64 THEO-4).
    expect(result.reply).toContain("Утре");
    expect(result.reply).toContain("упражненията");
    // Nothing was persisted as an exchange, so the student's own daily
    // allowance is not burned by a question that was never answered.
    expect(store.saveExchangeCalls).toHaveLength(0);
  });

  it("keeps answering while the budget still has room", async () => {
    vi.stubEnv("TUTOR_DAILY_BUDGET_USD", "1");
    store.seedDaySpend(sofiaDayKey(), 999_999);

    const result = await askTutor(USER, "Кога имам предимство?");
    expect(result.limited).toBe(false);
    expect(model.completeCalls).toHaveLength(1);
  });

  it("charges yesterday's spend to yesterday", async () => {
    vi.stubEnv("TUTOR_DAILY_BUDGET_USD", "1");
    store.seedDaySpend(sofiaDayKey(new Date(Date.now() - 86_400_000)), 5_000_000);

    const result = await askTutor(USER, "Кога имам предимство?");
    expect(result.limited).toBe(false);
  });

  it("fails OPEN when the ledger cannot be read", async () => {
    // A database hiccup must not take the tutor offline for the whole product
    // — the per-user caps are still underneath it.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(store, "spentOnDay").mockRejectedValue(new Error("ECONNREFUSED"));

    const state = await checkDailyBudget();
    expect(state.withinBudget).toBe(true);

    const result = await askTutor(USER, "Кога имам предимство?");
    expect(result.limited).toBe(false);
  });
});

describe("askTutor burst guard", () => {
  it("refuses a scripted burst from one account without spending tokens", async () => {
    // A server action is a public POST endpoint; the daily counters cannot
    // stop a client that fires everything at once.
    const rule = (await import("@/modules/security")).RATE_LIMITS.tutor;
    for (let i = 0; i < rule.limit; i++) {
      const ok = await askTutor(USER, `Въпрос ${i}`);
      expect(ok.limited).toBe(false);
    }

    const blocked = await askTutor(USER, "И още един");
    expect(blocked.limited).toBe(true);
    expect(model.completeCalls).toHaveLength(rule.limit);
    expect(blocked.reply).toContain("Твърде много опити");
  });

  it("is per student — a classmate on the same wi-fi is unaffected", async () => {
    const rule = (await import("@/modules/security")).RATE_LIMITS.tutor;
    for (let i = 0; i < rule.limit + 2; i++) await askTutor(USER, `Въпрос ${i}`);

    const classmate = await askTutor("user-2", "Кога имам предимство?");
    expect(classmate.limited).toBe(false);
  });
});
