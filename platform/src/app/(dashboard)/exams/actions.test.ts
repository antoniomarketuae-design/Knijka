/**
 * The two mock-exam server actions as PUBLIC POST ENDPOINTS.
 *
 * Both were unmetered and one had no in-flight check, so a script could open
 * unlimited ExamAttempt rows (`startExamAction`) and fire unlimited 45-question
 * gradings (`submitExamAction`) — each of which writes 45 QuestionAttempt rows.
 * Neither passes through src/proxy.ts, where every other budget in the product
 * is taken, so the guard has to be inside the action or it does not exist.
 *
 * The budgets are keyed on the SERVER session id, never the IP: the users are
 * a classroom of teenagers behind one school wi-fi NAT, where an IP budget
 * throttles the class because one of them is studying hard.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setContentRepo } from "@/lib/content/repo";
import {
  InMemoryExamStore,
  setExamStore,
  startExam,
} from "@/modules/exam";
import { makeFixtureRepo, richBank } from "@/modules/exam/__tests__/fixtures";
import { RATE_LIMITS, resetRateLimitState } from "@/modules/security";

const requireUser = vi.fn();
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  requireUser: () => requireUser(),
}));

/** redirect() throws NEXT_REDIRECT in Next; the fake keeps the target visible. */
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`NEXT_REDIRECT:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

vi.mock("@/modules/gamification", () => ({ trackActivity: async () => undefined }));
vi.mock("@/modules/payments", () => ({
  requireEntitlementForExam: async () => true,
}));
vi.mock("@/lib/content/loader", () => ({}));

const { startExamAction, submitExamAction } = await import("./actions");

const USER = { id: "u1", email: "ivan@mail.bg", name: "Иван", isAdmin: false };

let store: InMemoryExamStore;

beforeAll(async () => {
  await import("@/modules/learning");
}, 120_000);

beforeEach(() => {
  setContentRepo(makeFixtureRepo(richBank()));
  store = new InMemoryExamStore();
  setExamStore(store);
  requireUser.mockResolvedValue(USER);
  resetRateLimitState();
});

afterEach(() => {
  setExamStore(null);
  resetRateLimitState();
});

/** Runs the action and returns where it redirected to. */
async function startAndCatch(): Promise<string> {
  try {
    await startExamAction();
  } catch (err) {
    if (err instanceof Redirected) return err.to;
    throw err;
  }
  throw new Error("startExamAction returned without redirecting");
}

describe("startExamAction", () => {
  it("opens exactly ONE attempt for a double-tapped button", async () => {
    const first = await startAndCatch();
    const second = await startAndCatch();

    // The second click resumes the paper it was about to throw away — a mock
    // exam is 40 minutes, and losing one to a stray tap is how someone stops
    // using the app.
    expect(second).toBe(first);
    expect(store.attempts.size).toBe(1);
  });

  it("stops a script from looping on it, however many attempts it closes", async () => {
    // Every call finishes the previous attempt, so the in-flight check cannot
    // be what refuses here — the budget has to.
    const opened: string[] = [];
    for (let i = 0; i < RATE_LIMITS.examStart.limit; i++) {
      const to = await startAndCatch();
      opened.push(to);
      const attemptId = to.replace("/exams/", "");
      store.attempts.get(attemptId)!.finishedAt = new Date();
    }
    expect(new Set(opened).size).toBe(RATE_LIMITS.examStart.limit);

    expect(await startAndCatch()).toBe("/exams?msg=too-many");
    expect(store.attempts.size).toBe(RATE_LIMITS.examStart.limit);
  });

  it("refuses BEFORE the attempt lookup — a guard must not be an amplifier", async () => {
    // A refusal that first spends the database read it is protecting has made
    // the endpoint cheaper to abuse, not dearer.
    for (let i = 0; i < RATE_LIMITS.examStart.limit; i++) {
      const to = await startAndCatch();
      store.attempts.get(to.replace("/exams/", ""))!.finishedAt = new Date();
    }

    const listCalls = vi.spyOn(store, "listAttempts");
    expect(await startAndCatch()).toBe("/exams?msg=too-many");
    expect(listCalls).not.toHaveBeenCalled();
    listCalls.mockRestore();
  });

  it("does not spend one student's budget on another's", async () => {
    for (let i = 0; i < RATE_LIMITS.examStart.limit; i++) {
      const to = await startAndCatch();
      store.attempts.get(to.replace("/exams/", ""))!.finishedAt = new Date();
    }
    expect(await startAndCatch()).toBe("/exams?msg=too-many");

    requireUser.mockResolvedValue({ ...USER, id: "u2" });
    expect(await startAndCatch()).toMatch(/^\/exams\/attempt-/);
  });
});

describe("submitExamAction", () => {
  async function submitOnce() {
    const started = await startExam(USER.id);
    return submitExamAction({
      attemptId: started.attemptId,
      answers: [],
      clientElapsedSec: 60,
    });
  }

  it("refuses past the budget instead of grading 45 questions again", async () => {
    for (let i = 0; i < RATE_LIMITS.examSubmit.limit; i++) {
      expect((await submitOnce()).ok).toBe(true);
    }
    expect(await submitOnce()).toEqual({ ok: false, code: "RATE_LIMITED" });
  });

  it("keeps the refusal per-user", async () => {
    for (let i = 0; i < RATE_LIMITS.examSubmit.limit; i++) await submitOnce();
    expect(await submitOnce()).toEqual({ ok: false, code: "RATE_LIMITED" });

    requireUser.mockResolvedValue({ ...USER, id: "u2" });
    const started = await startExam("u2");
    const result = await submitExamAction({
      attemptId: started.attemptId,
      answers: [],
      clientElapsedSec: 60,
    });
    expect(result.ok).toBe(true);
  });
});
