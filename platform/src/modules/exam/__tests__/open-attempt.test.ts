/**
 * IN-FLIGHT ATTEMPTS — the check `startExamAction` did not have.
 *
 * The action opened a brand-new ExamAttempt row on every call, with nothing
 * asking whether the candidate already had one. Two consequences, one abusive
 * and one ordinary:
 *
 *  - a server action is a public POST, so a script could open unlimited rows;
 *  - a student who double-tapped „Започни пробен изпит" — or whose phone
 *    retried the form — silently abandoned the paper they had just been dealt
 *    and started a different one, 40 minutes at a time.
 *
 * `getOpenExamAttempt` answers both. "Open" deliberately means the SAME thing
 * the resume route means (isAttemptExpired), so the hub can never send someone
 * to a page that then tells them the attempt is over.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setContentRepo } from "../../../lib/content/repo";
import {
  EXAM_ATTEMPT_TTL_SEC,
  getOpenExamAttempt,
  InMemoryExamStore,
  setExamStore,
  startExam,
  submitExam,
} from "..";
import { makeFixtureRepo, richBank } from "./fixtures";

let store: InMemoryExamStore;

/** Same warm-up as the other lifecycle suites — submitExam lazily imports
 *  @/modules/learning, and the first import is slow on a cold cache. */
beforeAll(async () => {
  await import("@/modules/learning");
}, 120_000);

beforeEach(() => {
  setContentRepo(makeFixtureRepo(richBank()));
  store = new InMemoryExamStore();
  setExamStore(store);
});

afterEach(() => {
  setExamStore(null);
});

describe("getOpenExamAttempt", () => {
  it("is null for a candidate who has never started one", async () => {
    expect(await getOpenExamAttempt("u1")).toBeNull();
  });

  it("finds the attempt that is still running", async () => {
    const started = await startExam("u1");
    expect(await getOpenExamAttempt("u1")).toMatchObject({
      attemptId: started.attemptId,
    });
  });

  it("is null once the paper has been submitted", async () => {
    const started = await startExam("u1");
    await submitExam("u1", started.attemptId, [], 60);
    expect(await getOpenExamAttempt("u1")).toBeNull();
  });

  it("never returns somebody else's attempt", async () => {
    await startExam("u1");
    expect(await getOpenExamAttempt("u2")).toBeNull();
  });

  it("lets a stale attempt go, so a lost connection is not a permanent block", async () => {
    const started = await startExam("u1");
    const attempt = store.attempts.get(started.attemptId)!;

    const justInside = new Date(
      attempt.startedAt.getTime() + (EXAM_ATTEMPT_TTL_SEC - 1) * 1000,
    );
    const pastIt = new Date(
      attempt.startedAt.getTime() + (EXAM_ATTEMPT_TTL_SEC + 1) * 1000,
    );

    expect(await getOpenExamAttempt("u1", justInside)).not.toBeNull();
    // Beyond the TTL the runner refuses to mount anyway; treating it as live
    // would leave this student unable to ever start another exam.
    expect(await getOpenExamAttempt("u1", pastIt)).toBeNull();
  });

  it("skips an attempt whose payload cannot be read", async () => {
    // Sending a student to an unrestorable attempt strands them on a dead page
    // instead of starting the exam they asked for.
    const started = await startExam("u1");
    store.attempts.get(started.attemptId)!.answers = { state: "nonsense" };
    expect(await getOpenExamAttempt("u1")).toBeNull();
  });
});
