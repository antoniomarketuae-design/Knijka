/**
 * THE ANSWER-KEY ORACLE (audit M-10), tested at the endpoint an attacker
 * actually reaches.
 *
 * The learning module has always been able to refuse an unbound submission —
 * practiceTicket.ts was written, exported and unit-tested. Nothing called it.
 * `submitPracticeAnswer` took a bare `questionId` and answered with
 * `correctOptionIds`, so the attack was three lines of fetch():
 *
 *   1. open a mock exam, read the 45 question ids out of the DOM;
 *   2. POST each one to the practice action in a second tab;
 *   3. copy the keys back, 97/97 inside the 40 minutes.
 *
 * And the cheating is the SMALLER half. Every forged answer wrote a
 * QuestionAttempt and moved mastery, which means the readiness score — the ring
 * on the dashboard, the north-star prediction, the one dataset that could ever
 * show this product makes safer drivers — was client-writable.
 *
 * These tests run the real action against in-memory content and learning
 * stores. Everything the action delegates to (quota, gamification, why-panel)
 * is mocked away; the ticket check is NOT, because it is the subject.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setContentRepo } from "@/lib/content/repo";
import {
  FakeLearningStore,
  makeFixtureRepo,
} from "@/modules/learning/fixtures";
import { setLearningStore } from "@/modules/learning/store";
import { issuePracticeTicket } from "@/modules/learning/practiceTicket";
import { resetRateLimitState, RATE_LIMITS } from "@/modules/security";

const requireUser = vi.fn();
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  requireUser: () => requireUser(),
}));

// The quota gate calls redirect() on exhaustion; every test here is inside it.
vi.mock("@/modules/payments", () => ({
  checkPracticeQuota: async () => ({
    allowed: true,
    unlimited: true,
    limit: 20,
    remainingToday: 20,
  }),
}));
vi.mock("@/modules/gamification", () => ({ trackActivity: async () => undefined }));
vi.mock("@/modules/clips", () => ({ resolveWhyPanel: () => undefined }));
// The action imports the content loader for its side effect (reading the real
// JSON bank); the fixture repo below is what the test wants instead.
vi.mock("@/lib/content/loader", () => ({}));

const { submitPracticeAnswer } = await import("./actions");

const USER = { id: "u1", email: "ivan@mail.bg", name: "Иван", isAdmin: false };

/** What a real practice session deals — and, crucially, what it does not. */
const DEALT = ["q-road-1", "q-warn-1"];
/** A question this session never dealt — stand-in for an exam id from the DOM. */
const EXAM_QUESTION = "q-prio-1";

let store: FakeLearningStore;

beforeEach(() => {
  setContentRepo(makeFixtureRepo());
  store = new FakeLearningStore();
  setLearningStore(store);
  requireUser.mockResolvedValue(USER);
  resetRateLimitState();
  vi.stubEnv("AUTH_SECRET", "test-secret-for-practice-tickets");
  // The state the product actually runs in from now on.
  vi.stubEnv("PRACTICE_TICKET_REQUIRED", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetRateLimitState();
});

describe("submitPracticeAnswer — session binding", () => {
  it("answers a question this session dealt", async () => {
    const ticket = issuePracticeTicket(USER.id, DEALT);

    const result = await submitPracticeAnswer("q-road-1", ["q-road-1-a"], ticket);

    expect(result.correct).toBe(true);
    expect(result.correctOptionIds).toEqual(["q-road-1-a"]);
    expect(store.recordAnswerCalls).toHaveLength(1);
  });

  it("REFUSES an exam question scraped from another tab, and writes nothing", async () => {
    const ticket = issuePracticeTicket(USER.id, DEALT);

    await expect(
      submitPracticeAnswer(EXAM_QUESTION, ["q-prio-1-a"], ticket),
    ).rejects.toMatchObject({ reason: "QUESTION_NOT_IN_SESSION" });

    // No key returned AND no side effect: a refusal that still moved mastery
    // would be an oracle with a write behind it.
    expect(store.recordAnswerCalls).toHaveLength(0);
  });

  it("REFUSES a submission with no ticket at all — the shape of the old attack", async () => {
    // Exactly what a hand-rolled POST looks like: the old signature took two
    // arguments and this is the third one missing.
    await expect(
      submitPracticeAnswer(EXAM_QUESTION, ["q-prio-1-a"], ""),
    ).rejects.toMatchObject({ reason: "MISSING" });
    expect(store.recordAnswerCalls).toHaveLength(0);
  });

  it("REFUSES another student's ticket", async () => {
    const ticket = issuePracticeTicket("someone-else", DEALT);

    await expect(
      submitPracticeAnswer("q-road-1", ["q-road-1-a"], ticket),
    ).rejects.toMatchObject({ reason: "WRONG_USER" });
    expect(store.recordAnswerCalls).toHaveLength(0);
  });

  it("REFUSES a ticket whose question list was edited to add the exam id", async () => {
    const ticket = issuePracticeTicket(USER.id, DEALT);
    const [version, body, signature] = ticket.split(".");
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    );
    payload.q.push(EXAM_QUESTION);
    const forged = Buffer.from(JSON.stringify(payload), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await expect(
      submitPracticeAnswer(EXAM_QUESTION, ["q-prio-1-a"], `${version}.${forged}.${signature}`),
    ).rejects.toMatchObject({ reason: "INVALID" });
    expect(store.recordAnswerCalls).toHaveLength(0);
  });

  it("rejects an oversized ticket before it reaches the verifier", async () => {
    await expect(
      submitPracticeAnswer("q-road-1", ["q-road-1-a"], "x".repeat(5000)),
    ).rejects.toThrow(/invalid ticket/);
  });
});

/**
 * THE WIRING, not just the guard.
 *
 * The whole finding was that `issuePracticeTicket` existed, was exported, was
 * unit-tested — and was called from nowhere. A guard that nothing invokes is
 * the same hole with more code in it, so the page that DEALS the session is
 * asserted to be the page that SIGNS it, over the ids it just dealt and for the
 * user it dealt them to. The prop being required is what the compiler
 * contributes; this is the part types cannot see.
 */
describe("the practice page issues the ticket it deals", () => {
  const pageSource = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "page.tsx"),
    "utf8",
  );

  it("signs the dealt question ids, for the session user", () => {
    expect(pageSource).toContain("issuePracticeTicket(");
    // The ids actually rendered, not the raw engine session or a constant.
    expect(pageSource).toMatch(/issuePracticeTicket\(\s*user\.id,\s*questions\.map\(/);
  });

  it("hands it to the runner", () => {
    expect(pageSource).toMatch(/ticket=\{issuePracticeTicket\(/);
  });
});

describe("submitPracticeAnswer — abuse budget", () => {
  it("meters the endpoint per USER, and refuses past the budget", async () => {
    const ticket = issuePracticeTicket(USER.id, DEALT);

    for (let i = 0; i < RATE_LIMITS.practiceAnswer.limit; i++) {
      await submitPracticeAnswer("q-road-1", ["q-road-1-a"], ticket);
    }
    await expect(
      submitPracticeAnswer("q-road-1", ["q-road-1-a"], ticket),
    ).rejects.toThrow(/rate limit/);
  });

  it("does not put a whole classroom on one budget", async () => {
    // The reason this is keyed on the session and not the IP: 30 students on
    // one school wi-fi share an address and share nothing else.
    const ticket = issuePracticeTicket(USER.id, DEALT);
    for (let i = 0; i < RATE_LIMITS.practiceAnswer.limit; i++) {
      await submitPracticeAnswer("q-road-1", ["q-road-1-a"], ticket);
    }

    const classmate = { ...USER, id: "u2" };
    requireUser.mockResolvedValue(classmate);
    const theirTicket = issuePracticeTicket(classmate.id, DEALT);

    await expect(
      submitPracticeAnswer("q-road-1", ["q-road-1-a"], theirTicket),
    ).resolves.toMatchObject({ correct: true });
  });

  it("takes the budget BEFORE any database work", async () => {
    const ticket = issuePracticeTicket(USER.id, DEALT);
    for (let i = 0; i < RATE_LIMITS.practiceAnswer.limit; i++) {
      await submitPracticeAnswer("q-road-1", ["q-road-1-a"], ticket);
    }
    const writesBefore = store.recordAnswerCalls.length;

    await expect(
      submitPracticeAnswer("q-road-1", ["q-road-1-a"], ticket),
    ).rejects.toThrow(/rate limit/);

    // A limiter that runs after the expensive part is decoration.
    expect(store.recordAnswerCalls).toHaveLength(writesBefore);
  });
});
