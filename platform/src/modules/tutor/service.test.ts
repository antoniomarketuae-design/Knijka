import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setContentRepo } from "@/lib/content/repo";
import { getReadiness } from "@/modules/learning";
import { resetRateLimitState } from "@/modules/security";
import { computeCostMicroUsd } from "./cost";
import {
  FakeTutorModel,
  FakeTutorStore,
  makeTutorFixtureRepo,
} from "./fixtures";
import { setTutorModel } from "./model";
import { TUTOR_NO_MATERIAL_REPLY_BG } from "./prompt";
import {
  askTutor,
  countUserMessagesSince,
  getThread,
  startOfTodayMs,
  TUTOR_DAILY_MESSAGE_LIMIT,
  TUTOR_HISTORY_MESSAGES,
  TUTOR_LIMIT_REPLY_BG,
  TUTOR_MAX_INPUT_LENGTH,
} from "./service";
import { setTutorStore, type TutorMessage } from "./store";

// The tutor consumes the learning module only via its public API; mock it so
// tests never touch the learning store (which would need a database).
vi.mock("@/modules/learning", () => ({
  getReadiness: vi.fn(),
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
});

afterEach(() => {
  setTutorStore(null);
  setTutorModel(null);
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
    const yesterday = startOfTodayMs() - 60_000;
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

describe("countUserMessagesSince", () => {
  it("counts only user messages at/after the boundary", () => {
    const messages = [
      userMsg("стар", 10),
      assistantMsg("стар отговор", 10),
      userMsg("нов", 100),
      assistantMsg("нов отговор", 100),
    ];
    expect(countUserMessagesSince(messages, 50)).toBe(1);
    expect(countUserMessagesSince(messages, 0)).toBe(2);
    expect(countUserMessagesSince(messages, 200)).toBe(0);
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
