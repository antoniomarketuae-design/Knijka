/**
 * A three-day-old attempt must never be graded.
 *
 * THE DEFECT, exactly as it reached production. getInProgressExam checked
 * `finishedAt !== null` and nothing else, so an attempt the student opened and
 * then lost connection to resolved perfectly however old it was. /exams/[id]
 * then computed initialElapsedSec in the hundreds of thousands, ExamRunner
 * opened with remainingSec 0, its deadline effect fired on mount, and it
 * auto-submitted an empty paper. submitExam did exactly what it should with a
 * submission past the limit — graded it (no answers = 0 points) and auto-failed
 * it — and the student read a bare „Изпитът не е издържан · 0 от 97" for an
 * exam they never sat.
 *
 * Two rules are being nailed down here at once, and they pull in opposite
 * directions on purpose:
 *   RESUME expires at EXAM_ATTEMPT_TTL_SEC (the runner must not mount).
 *   SUBMIT does not (a late paper is still graded — answers are never thrown
 *   away because a clock ran out while someone was really sitting there).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setContentRepo } from "../../../lib/content/repo";
import {
  EXAM_ATTEMPT_TTL_SEC,
  EXAM_DURATION_SEC,
  EXAM_GRACE_SEC,
  getExamAttemptView,
  getExamHistory,
  getInProgressExam,
  InMemoryExamStore,
  isAttemptExpired,
  setExamStore,
  startExam,
  submitExam,
} from "..";
import { makeFixtureRepo, richBank } from "./fixtures";

let bank: ReturnType<typeof richBank>;
let store: InMemoryExamStore;

/** Same warm-up as restore.test.ts — submitExam lazily imports @/modules/learning. */
beforeAll(async () => {
  await import("@/modules/learning");
}, 120_000);

beforeEach(() => {
  bank = richBank();
  setContentRepo(makeFixtureRepo(bank));
  store = new InMemoryExamStore();
  setExamStore(store);
});

afterEach(() => {
  setExamStore(null);
  vi.restoreAllMocks();
});

/** Rewind an attempt's start so `now` sits `sec` seconds after it. */
function ageAttempt(attemptId: string, sec: number): Date {
  const attempt = store.attempts.get(attemptId)!;
  const startedAt = new Date(Date.now() - sec * 1000);
  attempt.startedAt = startedAt;
  return startedAt;
}

describe("EXAM_ATTEMPT_TTL_SEC", () => {
  it("is the official 40:00 plus the 30s grace — nothing invented", () => {
    expect(EXAM_ATTEMPT_TTL_SEC).toBe(EXAM_DURATION_SEC + EXAM_GRACE_SEC);
    expect(EXAM_ATTEMPT_TTL_SEC).toBe(2430);
  });

  it("is decided on the server clock, not on anything the client reports", () => {
    const started = new Date("2026-08-01T09:00:00Z");
    expect(isAttemptExpired(started, new Date("2026-08-01T09:40:29Z"))).toBe(false);
    expect(isAttemptExpired(started, new Date("2026-08-01T09:40:31Z"))).toBe(true);
    // Clock skew must not resurrect or kill an attempt.
    expect(isAttemptExpired(started, new Date("2026-08-01T08:00:00Z"))).toBe(false);
  });
});

describe("getExamAttemptView", () => {
  it("resumes an attempt that is still inside its window", async () => {
    const started = await startExam("u1", { seed: 11 });
    ageAttempt(started.attemptId, 600); // 10 minutes in

    const view = await getExamAttemptView("u1", started.attemptId);
    expect(view.status).toBe("in-progress");
    if (view.status !== "in-progress") throw new Error("unreachable");
    expect(view.exam.questions.map((q) => q.id)).toEqual(
      started.questions.map((q) => q.id),
    );
  });

  it("resolves the LAST second of the window — a real candidate is not cut off early", async () => {
    const started = await startExam("u1", { seed: 12 });
    ageAttempt(started.attemptId, EXAM_ATTEMPT_TTL_SEC - 1);
    expect((await getExamAttemptView("u1", started.attemptId)).status).toBe(
      "in-progress",
    );
  });

  it("reports a three-day-old attempt as EXPIRED, not as a paper to run", async () => {
    const started = await startExam("u1", { seed: 13 });
    const startedAt = ageAttempt(started.attemptId, 3 * 24 * 3600);

    const view = await getExamAttemptView("u1", started.attemptId);
    // Without the expiry check this is "in-progress" with 45 questions and the
    // runner auto-submits them blank.
    expect(view.status).toBe("expired");
    if (view.status !== "expired") throw new Error("unreachable");
    expect(view.startedAt).toEqual(startedAt);
    expect(view.elapsedSec).toBeGreaterThan(EXAM_ATTEMPT_TTL_SEC);
    // Nothing that could be rendered as a question, so nothing to auto-submit.
    expect(Object.keys(view)).not.toContain("exam");
  });

  it("says EXPIRED, not 'a question left the bank', when both are true", async () => {
    // The stale attempt is also unrestorable. „Изтече" is the true cause and
    // the actionable one; blaming the content would be us inventing an excuse.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const started = await startExam("u1", { seed: 14 });
    ageAttempt(started.attemptId, 3 * 24 * 3600);
    const doomed = started.questions[0].id;
    bank.questions.splice(
      bank.questions.findIndex((q) => q.id === doomed),
      1,
    );

    expect((await getExamAttemptView("u1", started.attemptId)).status).toBe(
      "expired",
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps the other three reasons distinguishable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const started = await startExam("u1", { seed: 15 });

    expect((await getExamAttemptView("u1", "no-such-attempt")).status).toBe(
      "unavailable",
    );
    expect((await getExamAttemptView("u2", started.attemptId)).status).toBe(
      "unavailable",
    );

    const doomed = started.questions[0].id;
    bank.questions.splice(
      bank.questions.findIndex((q) => q.id === doomed),
      1,
    );
    expect((await getExamAttemptView("u1", started.attemptId)).status).toBe(
      "unrestorable",
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(doomed));
  });

  it("reports a graded attempt as unavailable, never as expired", async () => {
    const started = await startExam("u1", { seed: 16 });
    await submitExam("u1", started.attemptId, [], 60);
    ageAttempt(started.attemptId, 3 * 24 * 3600);
    expect((await getExamAttemptView("u1", started.attemptId)).status).toBe(
      "unavailable",
    );
  });
});

describe("getInProgressExam (the narrowing view)", () => {
  it("refuses to hand the runner a paper it would instantly auto-submit", async () => {
    const started = await startExam("u1", { seed: 17 });
    ageAttempt(started.attemptId, 3 * 24 * 3600);
    expect(await getInProgressExam("u1", started.attemptId)).toBeNull();
  });
});

describe("the attempt history", () => {
  it("marks a stale attempt expired instead of offering 'Продължи'", async () => {
    const fresh = await startExam("u1", { seed: 18 });
    const stale = await startExam("u1", { seed: 19 });
    ageAttempt(stale.attemptId, 3 * 24 * 3600);

    const history = await getExamHistory("u1");
    const byId = new Map(history.map((h) => [h.attemptId, h]));
    expect(byId.get(fresh.attemptId)!.status).toBe("in-progress");
    expect(byId.get(stale.attemptId)!.status).toBe("expired");
    // Still no score and still no verdict — an expired attempt is not a failed
    // one, and must never be counted as one anywhere.
    expect(byId.get(stale.attemptId)!.score).toBeNull();
    expect(byId.get(stale.attemptId)!.passed).toBeNull();
  });
});

describe("submitting is NOT expiry", () => {
  it("still grades and persists a paper that arrives past the limit", async () => {
    // The other half of the rule. A candidate who was genuinely sitting there
    // when the clock ran out keeps every answer they gave; only `passed` is
    // forced false. Expiry governs RESUMING, never grading.
    const started = await startExam("u1", { seed: 20 });
    ageAttempt(started.attemptId, EXAM_ATTEMPT_TTL_SEC + 120);

    const result = await submitExam("u1", started.attemptId, [], 3000);
    expect(result.late).toBe(true);
    expect(result.passed).toBe(false);
    expect(store.attempts.get(started.attemptId)!.finishedAt).not.toBeNull();
  });
});
