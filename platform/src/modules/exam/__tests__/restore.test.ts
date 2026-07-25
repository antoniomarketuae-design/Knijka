/**
 * Audit H-7 / M-9: an in-progress exam must be re-rendered from the question
 * ids stored on the attempt row, never rebuilt from the seed against the live
 * bank.
 *
 * The trigger these tests reproduce is the founder's own /review workflow: a
 * `needs-review → approved` promotion deployed while a candidate has an exam
 * open. Before the fix the attempt page called buildExam(seed), which re-reads
 * the bank — a different (perfectly valid) paper came back, grading still used
 * the stored ids, and a perfect candidate was silently near-zeroed.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setContentRepo } from "../../../lib/content/repo";
import {
  buildExam,
  getInProgressExam,
  InMemoryExamStore,
  setExamStore,
  startExam,
  submitExam,
  type ExamAnswer,
} from "..";
import { correctIds, makeFixtureRepo, richBank } from "./fixtures";

/** Fresh bank per test — these tests mutate it mid-attempt on purpose. */
let bank: ReturnType<typeof richBank>;
let store: InMemoryExamStore;

/**
 * submitExam() feeds mastery through `await import("@/modules/learning")`. Under
 * Vitest that graph is transpiled on demand and costs ~5s cold — right on the
 * default per-test timeout, so whichever test submits first flakes. Pay it once,
 * outside the tests' budget; nothing about the assertions depends on it.
 */
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

const allCorrect = (questions: { id: string }[]): ExamAnswer[] =>
  questions.map((q) => ({ questionId: q.id, optionIds: correctIds(bank, q.id) }));

/**
 * The exact content change the audit measured: promote every `needs-review`
 * question to `approved`, i.e. deploy a review pass mid-attempt.
 */
function promoteNeedsReview(): void {
  for (const q of bank.questions) {
    if (q.status === "needs-review") q.status = "approved";
  }
}

describe("resuming an exam across a content change (H-7)", () => {
  it("shows the identical 45 questions, in the identical order", async () => {
    const started = await startExam("u1", { seed: 4242 });

    promoteNeedsReview();

    const resumed = await getInProgressExam("u1", started.attemptId);
    expect(resumed).not.toBeNull();
    expect(resumed!.questions).toHaveLength(45);
    expect(resumed!.questions.map((q) => q.id)).toEqual(
      started.questions.map((q) => q.id),
    );
    // byte-identical, option order included — a resume must not reshuffle
    expect(resumed!.questions).toEqual(started.questions);
  });

  it("grades a perfect candidate on those questions: still 97/97", async () => {
    const started = await startExam("u1", { seed: 4242 });

    promoteNeedsReview();

    const resumed = (await getInProgressExam("u1", started.attemptId))!;
    const res = await submitExam(
      "u1",
      started.attemptId,
      allCorrect(resumed.questions),
      1200,
    );

    // Before the fix the candidate answered a seed-rebuilt paper; grading used
    // the stored ids and threw ~84% of the answers away.
    expect(res.score).toBe(97);
    expect(res.maxScore).toBe(97);
    expect(res.passed).toBe(true);
    expect(res.perQuestion.filter((p) => p.correct)).toHaveLength(45);
  });

  it("REGRESSION GUARD: rebuilding from the seed destroys the same candidate", async () => {
    const started = await startExam("u1", { seed: 4242 });

    promoteNeedsReview();

    // This is literally what the attempt page used to render.
    const rebuilt = buildExam(4242).questions;
    const dealt = new Set(started.questions.map((q) => q.id));
    const common = rebuilt.filter((q) => dealt.has(q.id));

    // Sanity: if the fixture bank ever stops diverging here it has lost its
    // teeth, and the two tests above would keep passing with the bug reinstated.
    expect(common.length).toBeLessThan(45);

    // ...and this is the damage: answering that rebuilt paper perfectly, then
    // being graded (correctly) against the stored ids.
    const res = await submitExam("u1", started.attemptId, allCorrect(rebuilt), 1200);
    expect(res.score).toBeLessThan(97);
    expect(res.passed).toBe(false);
  });
});

describe("eligibility is decided once, at deal time", () => {
  it("keeps a dealt question that was demoted to needs-review mid-attempt", async () => {
    const started = await startExam("u1", { seed: 77 });
    const victim = started.questions[10];

    // The founder pulls this very question back for review while the candidate
    // is sitting the exam. It stays on their paper — and stays gradeable.
    bank.questions.find((q) => q.id === victim.id)!.status = "needs-review";

    const resumed = (await getInProgressExam("u1", started.attemptId))!;
    expect(resumed.questions.map((q) => q.id)).toContain(victim.id);

    const res = await submitExam(
      "u1",
      started.attemptId,
      allCorrect(resumed.questions),
      600,
    );
    expect(res.score).toBe(97);
    expect(res.perQuestion.find((p) => p.questionId === victim.id)!.correct).toBe(
      true,
    );
  });
});

describe("getInProgressExam", () => {
  it("resumes without any cookie — the seed comes off the attempt row (M-9)", async () => {
    const started = await startExam("u1", { seed: 31337 });
    const resumed = await getInProgressExam("u1", started.attemptId);
    // Nothing device-bound was consulted: the fresh call only had a user id and
    // an attempt id, which is all another device has.
    expect(resumed!.seed).toBe(31337);
    expect(resumed!.startedAt).toEqual(store.attempts.get(started.attemptId)!.startedAt);
  });

  it("is stable across repeated resumes", async () => {
    const started = await startExam("u1", { seed: 31337 });
    const first = await getInProgressExam("u1", started.attemptId);
    promoteNeedsReview();
    const second = await getInProgressExam("u1", started.attemptId);
    expect(second).toEqual(first);
  });

  it("never leaks correct flags, explanations or law refs", async () => {
    const started = await startExam("u1", { seed: 5150 });
    const resumed = (await getInProgressExam("u1", started.attemptId))!;
    const json = JSON.stringify(resumed.questions);
    expect(json).not.toContain('"correct"');
    expect(json).not.toContain("Обяснение");
    expect(json).not.toContain("lawRefs");
  });

  it("answers unknown and someone else's attempt identically (null)", async () => {
    const started = await startExam("u1", { seed: 1 });
    expect(await getInProgressExam("u1", "no-such-attempt")).toBeNull();
    expect(await getInProgressExam("u2", started.attemptId)).toBeNull();
  });

  it("returns null once the attempt is graded", async () => {
    const started = await startExam("u1", { seed: 2 });
    await submitExam("u1", started.attemptId, [], 60);
    expect(await getInProgressExam("u1", started.attemptId)).toBeNull();
  });

  it("returns null (never a short paper) when a dealt question was deleted", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const started = await startExam("u1", { seed: 3 });
    const doomed = started.questions[0].id;
    bank.questions.splice(
      bank.questions.findIndex((q) => q.id === doomed),
      1,
    );

    // maxScore is frozen at 97, so a 44-question paper is an unpassable trap.
    expect(await getInProgressExam("u1", started.attemptId)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(doomed));
  });

  it("returns null when the stored payload is unreadable", async () => {
    const started = await startExam("u1", { seed: 4 });
    store.attempts.get(started.attemptId)!.answers = { state: "nonsense" };
    expect(await getInProgressExam("u1", started.attemptId)).toBeNull();
  });
});

describe("startExam renders through the restore projection", () => {
  it("carries question and option media into the resumed views (THEO-1)", async () => {
    // Give one topic's questions media so both kinds are exercised.
    for (const q of bank.questions) {
      q.media = { kind: "sign", signRef: "Б2" };
      q.options[0].media = { kind: "sign", signRef: "Б1" };
    }

    const started = await startExam("u1", { seed: 8 });
    const resumed = (await getInProgressExam("u1", started.attemptId))!;
    for (const q of resumed.questions) {
      expect(q.media).toEqual({ kind: "sign", signRef: "Б2" });
      const withFace = q.options.filter((o) => o.media !== undefined);
      expect(withFace).toHaveLength(1);
      expect(withFace[0].media).toEqual({ kind: "sign", signRef: "Б1" });
    }
  });

  it("keeps every dealt option — the shuffle reorders, never drops", async () => {
    const started = await startExam("u1", { seed: 9 });
    for (const q of started.questions) {
      const bankQ = bank.questions.find((b) => b.id === q.id)!;
      expect([...q.options.map((o) => o.id)].sort()).toEqual(
        [...bankQ.options.map((o) => o.id)].sort(),
      );
    }
  });
});
