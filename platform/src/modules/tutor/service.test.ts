import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setContentRepo } from "@/lib/content/repo";
import { getReadiness, getSimWeakSpots } from "@/modules/learning";
import {
  InMemoryPaymentsStore,
  setPaymentsStore,
  TUTOR_PACK_QUESTION_ALLOWANCE,
} from "@/modules/payments";
import { resetRateLimitState } from "@/modules/security";
import { tutorAllowanceSpentReplyBg } from "./allowance";
import { sofiaDayKey } from "./budget";
import { computeCostMicroUsd } from "./cost";
import {
  FakeTutorModel,
  FakeTutorStore,
  makeTutorFixtureRepo,
} from "./fixtures";
import { setTutorModel, type TutorModel } from "./model";
import { TUTOR_NO_MATERIAL_REPLY_BG } from "./prompt";
import {
  askTutor,
  countUserMessagesOnDay,
  getThread,
  getTutorAllowance,
  previousUserQuestion,
  TUTOR_DAILY_MESSAGE_LIMIT,
  TUTOR_HISTORY_MESSAGES,
  TUTOR_LIMIT_REPLY_BG,
  TUTOR_MAX_INPUT_LENGTH,
  userQuestionTimestamps,
} from "./service";
import { setTutorStore, type TutorMessage } from "./store";

// The tutor consumes the learning module only via its public API; mock it so
// tests never touch the learning store (which would need a database).
vi.mock("@/modules/learning", () => ({
  getReadiness: vi.fn(),
  getSimWeakSpots: vi.fn(),
}));

const USER = "user-1";
const REPLY_WITH_CITATION =
  "Пропускаш идващите по пътя с предимство [ЗДвП чл. 47]. Потренирай „Предимство“!";

function userMsg(content: string, ts: number): TutorMessage {
  return { role: "user", content, ts };
}
function assistantMsg(content: string, ts: number): TutorMessage {
  return { role: "assistant", content, ts };
}

let store: FakeTutorStore;
let model: FakeTutorModel;
let payments: InMemoryPaymentsStore;

/**
 * An active pack bought a month ago, so the per-pack allowance applies AND the
 * seeded history below falls inside its window (questions asked before the
 * purchase are the free trial's, not the pack's).
 */
async function grantPack(userId = USER): Promise<void> {
  await payments.createEntitlement({
    userId,
    pack: "core",
    purchasedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    provider: "stripe",
    providerRef: `cs_test_${userId}`,
  });
}

beforeEach(() => {
  // askTutor now consumes a per-user burst budget (H-8). Its counters live in
  // a module-level Map, so without this every test after the eighth call in a
  // minute would be answered by the burst guard instead of the code it means
  // to exercise.
  resetRateLimitState();
  setContentRepo(makeTutorFixtureRepo());
  store = new FakeTutorStore();
  model = new FakeTutorModel(REPLY_WITH_CITATION);
  setTutorStore(store);
  setTutorModel(model);
  // askTutor also reads the per-pack tutor allowance (doc 81 §5.3). Injected
  // empty, so the default account in these tests is a free one and every test
  // written before the allowance existed still exercises the same path.
  payments = new InMemoryPaymentsStore();
  setPaymentsStore(payments);
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-not-real");
  vi.mocked(getReadiness).mockResolvedValue({
    score: 40,
    perTopic: [],
    weakestConcepts: [
      { conceptId: "c1", topicId: "t1", titleBg: "Слабо 1", effectiveMastery: 0.1 },
      { conceptId: "c2", topicId: "t1", titleBg: "Слабо 2", effectiveMastery: 0.2 },
      { conceptId: "c3", topicId: "t1", titleBg: "Слабо 3", effectiveMastery: 0.3 },
      { conceptId: "c4", topicId: "t1", titleBg: "Слабо 4", effectiveMastery: 0.4 },
    ],
  });
  vi.mocked(getSimWeakSpots).mockResolvedValue({
    hasRecentEvidence: false,
    spots: [],
  });
});

afterEach(() => {
  setTutorStore(null);
  setTutorModel(null);
  setPaymentsStore(null);
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("askTutor — happy path", () => {
  it("grounds, calls the model, books cost and returns validated citations", async () => {
    const result = await askTutor(USER, "Кога имам предимство?");

    expect(result.limited).toBe(false);
    expect(result.reply).toBe(REPLY_WITH_CITATION);
    expect(result.citations).toEqual([{ act: "ЗДвП", ref: "чл. 47" }]);
    expect(result.threadId).toBe(store.threadFor(USER)?.id);

    // Model got the grounded system prompt + the student's question.
    expect(model.completeCalls).toHaveLength(1);
    const call = model.completeCalls[0];
    expect(call.system).toContain("Предимство на кръстовище"); // material
    expect(call.system).toContain("[ЗДвП чл. 47]"); // its lawRef marker
    expect(call.messages.at(-1)).toEqual({
      role: "user",
      content: "Кога имам предимство?",
    });

    // Exchange persisted with usage accounting (never skipped).
    expect(store.saveExchangeCalls).toHaveLength(1);
    const saved = store.saveExchangeCalls[0];
    expect(saved.messages).toHaveLength(2);
    expect(saved.messages[0].role).toBe("user");
    expect(saved.messages[1].role).toBe("assistant");
    expect(saved.messages[1].content).toBe(REPLY_WITH_CITATION);
    expect(saved.usage).toEqual({
      tokensIn: 100,
      tokensOut: 50,
      costMicroUsd: computeCostMicroUsd(100, 50), // 100*3 + 50*15 = 1050
    });
    expect(saved.usage.costMicroUsd).toBe(1050);
  });

  it("injects at most the 3 weakest concepts into the prompt", async () => {
    await askTutor(USER, "Кога имам предимство?");
    const system = model.completeCalls[0].system;
    expect(system).toContain("- Слабо 1");
    expect(system).toContain("- Слабо 3");
    expect(system).not.toContain("Слабо 4");
  });

  it("survives a readiness failure (weakest concepts are advisory)", async () => {
    vi.mocked(getReadiness).mockRejectedValue(new Error("no db"));
    const result = await askTutor(USER, "Кога имам предимство?");
    expect(result.limited).toBe(false);
    expect(model.completeCalls[0].system).toContain(
      "(няма данни — ученикът тепърва започва)",
    );
  });

  it("drops citation markers the model invented", async () => {
    setTutorModel(new FakeTutorModel("Виж [ЗДвП чл. 999]."));
    const result = await askTutor(USER, "Кога имам предимство?");
    expect(result.citations).toEqual([]);
  });

  it("persists the validated citations onto the assistant message (D1)", async () => {
    // The UI renders law chips strictly from this stored list, so it has to
    // survive the write — otherwise every verified citation in the student's
    // history silently demotes to plain text on the next page load.
    await askTutor(USER, "Кога имам предимство?");
    const saved = store.saveExchangeCalls[0].messages;
    expect(saved[1].citations).toEqual([{ act: "ЗДвП", ref: "чл. 47" }]);
    // The student's own message is never a source of citations.
    expect(saved[0].citations).toBeUndefined();
  });

  it("persists an EMPTY list when every marker was invented (D1)", async () => {
    setTutorModel(new FakeTutorModel("Виж [ЗДвП чл. 999]."));
    await askTutor(USER, "Кога имам предимство?");
    const saved = store.saveExchangeCalls[0].messages;
    expect(saved[1].content).toContain("[ЗДвП чл. 999]");
    // Present and empty, not absent: the reply WAS validated, and it earned
    // nothing. The chip the old UI drew from this text was never legitimate.
    expect(saved[1].citations).toEqual([]);
  });

  it("replays only the most recent history to the model", async () => {
    const base = Date.now() - 60_000;
    const seeded: TutorMessage[] = [];
    for (let i = 0; i < 10; i++) {
      seeded.push(userMsg(`въпрос ${i}`, base + i));
      seeded.push(assistantMsg(`отговор ${i}`, base + i));
    }
    store.seedThread(USER, { messages: seeded });

    await askTutor(USER, "Кога имам предимство?");

    const sent = model.completeCalls[0].messages;
    expect(sent).toHaveLength(TUTOR_HISTORY_MESSAGES + 1);
    expect(sent[0]).toEqual({ role: "user", content: "въпрос 4" });
    expect(sent.at(-1)?.content).toBe("Кога имам предимство?");
  });
});

describe("askTutor — follow-up grounding (doc 81 D2)", () => {
  it("grounds „А защо?“ in the question it follows up on", async () => {
    // The second message of a normal Bulgarian conversation. Both its words
    // are stopwords, so before the fix retrieval returned nothing, the prompt
    // said „(няма намерени материали)" and rule 2 FORCED the refusal — the
    // tutor refused nearly every follow-up, deterministically.
    const now = Date.now();
    store.seedThread(USER, {
      messages: [
        userMsg("Кой има предимство на кръстовище?", now),
        assistantMsg("Пропускаш идващите отдясно.", now),
      ],
    });

    const result = await askTutor(USER, "А защо?");

    const system = model.completeCalls[0].system;
    expect(system).not.toContain("(няма намерени материали по този въпрос)");
    expect(system).toContain("Предимство на кръстовище");
    expect(result.limited).toBe(false);
  });

  it("refuses a follow-up on a brand-new topic the corpora do not cover", async () => {
    // The fallback is narrow on purpose: a question with real content tokens
    // is a NEW topic, and stale materials must not be allowed to sit under an
    // answer they do not support (ADR-002).
    const now = Date.now();
    store.seedThread(USER, {
      messages: [
        userMsg("Кой има предимство на кръстовище?", now),
        assistantMsg("Пропускаш идващите отдясно.", now),
      ],
    });

    await askTutor(USER, "Каква е глобата за изтекла застраховка?");

    expect(model.completeCalls[0].system).toContain(
      "(няма намерени материали по този въпрос)",
    );
  });
});

describe("askTutor — the student's simulator mistakes (doc 81 D4)", () => {
  it("injects recent sim weak spots alongside the theory ones", async () => {
    vi.mocked(getSimWeakSpots).mockResolvedValue({
      hasRecentEvidence: true,
      spots: [
        {
          conceptId: "c-predimstvo",
          titleBg: "Предимство на кръстовище",
          topicId: "t-priority",
          topicSlug: "predimstvo",
          violationCount: 3,
          worstSeverity: "opasna",
        },
      ],
    });

    await askTutor(USER, "Кога имам предимство?");

    const system = model.completeCalls[0].system;
    expect(system).toContain("ГРЕШКИ НА УЧЕНИКА В СИМУЛАТОРА");
    expect(system).toContain("- Предимство на кръстовище — 3 пъти");
  });

  it("survives a sim-evidence failure (it is advisory, like readiness)", async () => {
    vi.mocked(getSimWeakSpots).mockRejectedValue(new Error("no db"));
    const result = await askTutor(USER, "Кога имам предимство?");
    expect(result.limited).toBe(false);
    expect(model.completeCalls[0].system).toContain(
      "(няма скорошни карания в симулатора)",
    );
  });
});

describe("askTutor — rule-catalog grounding (audit I-1)", () => {
  // The fixture content bank knows nothing about pedestrians on purpose:
  // everything asserted here can only come from the sim rule catalog.
  const PEDESTRIAN_QUESTION =
    "Какво става, ако не пропусна пешеходец на пътеката?";

  it("grounds a driving-behaviour question in the catalog and cites its lawRef", async () => {
    const ruleModel = new FakeTutorModel(
      "Спираш пред пътеката и изчакваш [ЗДвП чл. 119].",
    );
    setTutorModel(ruleModel);

    const result = await askTutor(USER, PEDESTRIAN_QUESTION);

    const system = ruleModel.completeCalls[0].system;
    expect(system).toContain("правило от практическия изпит"); // corpus label
    expect(system).toContain("Непропускане на пешеходец"); // catalog title
    expect(system).toContain("опасна грешка — 10 наказателни точки"); // official cost
    expect(system).toContain("Правилното действие:"); // the corrective
    expect(system).toContain("[ЗДвП чл. 119]"); // citable marker

    expect(result.citations).toEqual([{ act: "ЗДвП", ref: "чл. 119" }]);
  });

  it("still drops a citation the model invented from the catalog corpus", async () => {
    const ruleModel = new FakeTutorModel(
      "Виж [ЗДвП чл. 401] и [Наредба № 99].",
    );
    setTutorModel(ruleModel);

    const result = await askTutor(USER, PEDESTRIAN_QUESTION);

    // The catalog IS grounding this answer (its real ref is in the prompt) —
    // and the whitelist still refuses the two markers the model made up.
    expect(ruleModel.completeCalls[0].system).toContain("[ЗДвП чл. 119]");
    expect(result.citations).toEqual([]);
  });

  it("gives the model no catalog material for a rule it does not contain", async () => {
    // Fines/insurance: a real driving topic, absent from both corpora. The
    // catalog must not become a licence to reason about neighbouring law.
    const ruleModel = new FakeTutorModel(TUTOR_NO_MATERIAL_REPLY_BG);
    setTutorModel(ruleModel);

    const result = await askTutor(USER, "Каква е глобата за изтекла застраховка?");

    expect(ruleModel.completeCalls[0].system).toContain(
      "(няма намерени материали по този въпрос)",
    );
    expect(result.citations).toEqual([]);
  });
});

describe("askTutor — daily budget guard", () => {
  it("blocks the 31st question of the day without calling the API", async () => {
    const now = Date.now();
    const messages: TutorMessage[] = [];
    for (let i = 0; i < TUTOR_DAILY_MESSAGE_LIMIT; i++) {
      messages.push(userMsg(`в${i}`, now), assistantMsg(`о${i}`, now));
    }
    store.seedThread(USER, { messages });

    const result = await askTutor(USER, "Още един въпрос?");

    expect(result.limited).toBe(true);
    expect(result.reply).toBe(TUTOR_LIMIT_REPLY_BG);
    expect(result.citations).toEqual([]);
    expect(model.completeCalls).toHaveLength(0);
    expect(store.saveExchangeCalls).toHaveLength(0);
  });

  it("does not count yesterday's questions", async () => {
    // 36h back is a different Europe/Sofia calendar day whatever the host
    // clock says, which is the point — see countUserMessagesOnDay below.
    const yesterday = Date.now() - 36 * 60 * 60 * 1000;
    const messages: TutorMessage[] = [];
    for (let i = 0; i < TUTOR_DAILY_MESSAGE_LIMIT; i++) {
      messages.push(userMsg(`в${i}`, yesterday), assistantMsg(`о${i}`, yesterday));
    }
    store.seedThread(USER, { messages });

    const result = await askTutor(USER, "Кога имам предимство?");
    expect(result.limited).toBe(false);
    expect(model.completeCalls).toHaveLength(1);
  });
});

describe("askTutor — the per-pack allowance (doc 81 §5.3)", () => {
  /**
   * A thread in which the pack holder has already asked `count` questions —
   * dated 36h back, i.e. on an earlier Europe/Sofia day but well inside the
   * pack's window. That is the only shape 300 questions can have: the 30/day
   * cap makes them impossible to ask today, and dating them today would mean
   * every assertion below was really testing the daily cap.
   */
  function seedAsked(count: number): void {
    const earlier = Date.now() - 36 * 60 * 60 * 1000;
    const messages: TutorMessage[] = [];
    for (let i = 0; i < count; i++) {
      messages.push(userMsg(`в${i}`, earlier), assistantMsg(`о${i}`, earlier));
    }
    store.seedThread(USER, { messages });
  }

  it("decrements by exactly one per answered question", async () => {
    await grantPack();
    const before = await getTutorAllowance(USER, []);
    expect(before.remaining).toBe(TUTOR_PACK_QUESTION_ALLOWANCE);

    await askTutor(USER, "Кога имам предимство?");
    await askTutor(USER, "А на кръгово?");

    const after = await getTutorAllowance(
      USER,
      (await getThread(USER)).messages,
    );
    expect(after.used).toBe(2);
    expect(after.remaining).toBe(TUTOR_PACK_QUESTION_ALLOWANCE - 2);
  });

  it("stops the 301st question of the pack without calling Anthropic", async () => {
    // The finding this closes: a pack used to mean „unlimited for 4 months",
    // i.e. 30/day × ~122 days = 3,660 questions = $41.72 against €12.55.
    await grantPack();
    seedAsked(TUTOR_PACK_QUESTION_ALLOWANCE);

    const result = await askTutor(USER, "Още един въпрос?");

    expect(model.completeCalls).toHaveLength(0);
    expect(result.limited).toBe(true);
    expect(store.saveExchangeCalls).toHaveLength(0);
  });

  it("explains itself in Bulgarian instead of erroring", async () => {
    await grantPack();
    seedAsked(TUTOR_PACK_QUESTION_ALLOWANCE);

    const result = await askTutor(USER, "Още един въпрос?");

    expect(result.reply).toBe(
      tutorAllowanceSpentReplyBg(TUTOR_PACK_QUESTION_ALLOWANCE),
    );
    // Requirement-zero (doc 64 THEO-4): names what still works, and the
    // student is never shown a raw failure.
    expect(result.reply).toContain("упражненията");
    expect(result.citations).toEqual([]);
  });

  it("does NOT reset overnight — the daily cap resets, this one does not", async () => {
    // The control: one question short of the allowance, same dates, and the
    // student is answered. So the 30/day cap is demonstrably NOT what stops
    // the seed above — this rule is, and it is the only reason a four-month
    // tail is bounded at all.
    await grantPack();
    seedAsked(TUTOR_PACK_QUESTION_ALLOWANCE - 1);
    expect((await askTutor(USER, "Днешен въпрос?")).limited).toBe(false);

    // That answer was the 300th. The next one is not.
    const spent = await askTutor(USER, "И още един?");
    expect(spent.limited).toBe(true);
    expect(model.completeCalls).toHaveLength(1);
  });

  it("leaves a FREE account to the lifetime trial, not to this rule", async () => {
    // No entitlement granted. 300+ questions on a free account is impossible
    // (the trial stops it at 5, in the action layer), but if this gate ever
    // starts voting on free users it would be enforcing a paid cap on people
    // who never bought a pack.
    seedAsked(TUTOR_PACK_QUESTION_ALLOWANCE + 10);
    const allowance = await getTutorAllowance(
      USER,
      (await getThread(USER)).messages,
    );
    expect(allowance.applies).toBe(false);
    expect(allowance.allowed).toBe(true);
  });

  it("is per student — a classmate's spent pack costs this one nothing", async () => {
    await grantPack();
    await grantPack("user-2");
    seedAsked(TUTOR_PACK_QUESTION_ALLOWANCE);
    // user-2 has their own (empty) thread.
    const result = await askTutor("user-2", "Кога имам предимство?");
    expect(result.limited).toBe(false);
    expect(model.completeCalls).toHaveLength(1);
  });
});

describe("askTutor — a question that was never answered is free", () => {
  /** A model that fails the way a real provider outage does. */
  class FailingTutorModel implements TutorModel {
    calls = 0;
    async complete(): Promise<never> {
      this.calls++;
      throw new Error("529 overloaded");
    }
  }

  it("does not consume the pack allowance when the model call fails", async () => {
    // The allowance is counted from PERSISTED user messages and saveExchange
    // only runs after a successful completion, so a failed call leaves no row
    // to count. Pre-debiting a credit balance is the design that gets this
    // wrong (doc 81 §5.5) — and it is why the balance is derived, not stored.
    await grantPack();
    const failing = new FailingTutorModel();
    setTutorModel(failing);

    await expect(askTutor(USER, "Кога имам предимство?")).rejects.toThrow(
      "529 overloaded",
    );

    expect(failing.calls).toBe(1);
    expect(store.saveExchangeCalls).toHaveLength(0);
    const allowance = await getTutorAllowance(
      USER,
      (await getThread(USER)).messages,
    );
    expect(allowance.used).toBe(0);
    expect(allowance.remaining).toBe(TUTOR_PACK_QUESTION_ALLOWANCE);
  });

  it("does not consume it when a guard refuses before the call", async () => {
    // askTutor can return `limited: true` from three guards without ever
    // reaching Anthropic. None of them may cost the student a question.
    await grantPack();
    vi.stubEnv("TUTOR_DAILY_BUDGET_USD", "1");
    store.seedDaySpend(sofiaDayKey(), 5_000_000);

    const result = await askTutor(USER, "Кога имам предимство?");
    expect(result.limited).toBe(true);
    expect(model.completeCalls).toHaveLength(0);

    const allowance = await getTutorAllowance(
      USER,
      (await getThread(USER)).messages,
    );
    expect(allowance.used).toBe(0);
  });
});

describe("userQuestionTimestamps", () => {
  it("returns only the student's own messages, in order", () => {
    expect(
      userQuestionTimestamps([
        userMsg("първи", 10),
        assistantMsg("отговор", 11),
        userMsg("втори", 20),
      ]),
    ).toEqual([10, 20]);
  });

  it("counts nothing for a thread the student has not written in", () => {
    expect(userQuestionTimestamps([])).toEqual([]);
    expect(userQuestionTimestamps([assistantMsg("здравей", 1)])).toEqual([]);
  });
});

describe("countUserMessagesOnDay (doc 81 D5)", () => {
  // 00:30 on 26 July in Sofia (UTC+3 in summer) — 21:30 UTC on the 25th.
  const JUST_AFTER_SOFIA_MIDNIGHT = Date.parse("2026-07-25T21:30:00Z");

  it("counts only user messages, and only on that Sofia day", () => {
    const messages = [
      userMsg("вчера", Date.parse("2026-07-25T10:00:00Z")),
      assistantMsg("отговор", Date.parse("2026-07-25T10:00:00Z")),
      userMsg("днес", JUST_AFTER_SOFIA_MIDNIGHT),
      assistantMsg("отговор", JUST_AFTER_SOFIA_MIDNIGHT),
      userMsg("пак днес", Date.parse("2026-07-26T09:00:00Z")),
    ];
    expect(countUserMessagesOnDay(messages, "2026-07-26")).toBe(2);
    expect(countUserMessagesOnDay(messages, "2026-07-25")).toBe(1);
    expect(countUserMessagesOnDay(messages, "2026-07-27")).toBe(0);
  });

  it("puts a question asked at 00:30 in Sofia on the day that just started", () => {
    // The defect this replaces: the cap counted from server-local midnight, so
    // on the UTC VPS this instant fell into the PREVIOUS day and the student's
    // 30 questions rolled over at 03:00 Bulgarian time instead of at midnight.
    const at = new Date(JUST_AFTER_SOFIA_MIDNIGHT);
    expect(at.toISOString().slice(0, 10)).toBe("2026-07-25"); // UTC says the 25th
    expect(sofiaDayKey(at)).toBe("2026-07-26"); // the student's clock says the 26th
    expect(countUserMessagesOnDay([userMsg("х", +at)], sofiaDayKey(at))).toBe(1);
  });
});

describe("previousUserQuestion", () => {
  it("returns the most recent student question", () => {
    expect(
      previousUserQuestion([
        userMsg("първи", 1),
        assistantMsg("отговор", 2),
        userMsg("втори", 3),
        assistantMsg("отговор", 4),
      ]),
    ).toBe("втори");
  });

  it("returns null when the student has not asked anything yet", () => {
    expect(previousUserQuestion([])).toBeNull();
    expect(previousUserQuestion([assistantMsg("здравей", 1)])).toBeNull();
  });
});

describe("askTutor — guards", () => {
  it("rejects empty and whitespace-only input", async () => {
    await expect(askTutor(USER, "")).rejects.toThrow("invalid message");
    await expect(askTutor(USER, "   ")).rejects.toThrow("invalid message");
  });

  it("rejects over-long input", async () => {
    const long = "а".repeat(TUTOR_MAX_INPUT_LENGTH + 1);
    await expect(askTutor(USER, long)).rejects.toThrow("invalid message");
  });

  it("throws when the tutor is not enabled (no API key)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(askTutor(USER, "Кога имам предимство?")).rejects.toThrow(
      "not enabled",
    );
    expect(model.completeCalls).toHaveLength(0);
  });
});

describe("getThread", () => {
  it("returns an empty view when the user has no thread", async () => {
    expect(await getThread(USER)).toEqual({ threadId: null, messages: [] });
  });

  it("returns the stored messages", async () => {
    const seeded = store.seedThread(USER, {
      messages: [userMsg("здравей", 1), assistantMsg("Здравей! 👋", 2)],
    });
    const view = await getThread(USER);
    expect(view.threadId).toBe(seeded.id);
    expect(view.messages).toHaveLength(2);
    expect(view.messages[1].content).toBe("Здравей! 👋");
  });
});
