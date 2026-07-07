import { beforeEach, describe, expect, it } from "vitest";
import { setContentRepo } from "@/lib/content/repo";
import { applyGradedAnswers } from "./examFeed";
import { FakeLearningStore, makeFixtureRepo } from "./fixtures";
import { setLearningStore } from "./store";

describe("applyGradedAnswers (exam mastery feed)", () => {
  let store: FakeLearningStore;
  let repo: ReturnType<typeof makeFixtureRepo>;

  beforeEach(() => {
    repo = makeFixtureRepo();
    setContentRepo(repo);
    store = new FakeLearningStore();
    setLearningStore(store);
  });

  it("raises mastery for correct exam answers and lowers it for wrong ones", async () => {
    const questions = repo.questions();
    const qCorrect = questions[0]!;
    const qWrong = questions.find(
      (q) => q.conceptIds[0] !== qCorrect.conceptIds[0],
    )!;

    store.seedProgress("u1", { conceptId: qWrong.conceptIds[0]!, mastery: 0.8 });

    await applyGradedAnswers("u1", [
      { questionId: qCorrect.id, correct: true },
      { questionId: qWrong.id, correct: false },
    ]);

    const up = store.getProgressRow("u1", qCorrect.conceptIds[0]!);
    const down = store.getProgressRow("u1", qWrong.conceptIds[0]!);
    expect(up).toBeDefined();
    expect(up!.mastery).toBeGreaterThan(0);
    expect(down!.mastery).toBeCloseTo(0.8 * 0.6, 5);
    expect(down!.lapses).toBe(1);
  });

  it("compounds sequentially when several questions hit the same concept", async () => {
    const byConcept = new Map<string, string[]>();
    for (const q of repo.questions()) {
      for (const c of q.conceptIds) {
        byConcept.set(c, [...(byConcept.get(c) ?? []), q.id]);
      }
    }
    const [conceptId, qIds] = [...byConcept.entries()].find(
      ([, ids]) => ids.length >= 2,
    )!;

    await applyGradedAnswers("u1", [
      { questionId: qIds[0]!, correct: true },
      { questionId: qIds[1]!, correct: true },
    ]);
    const twice = store.getProgressRow("u1", conceptId)!.mastery;

    const store2 = new FakeLearningStore();
    setLearningStore(store2);
    await applyGradedAnswers("u1", [{ questionId: qIds[0]!, correct: true }]);
    const once = store2.getProgressRow("u1", conceptId)!.mastery;

    expect(twice).toBeGreaterThan(once);
  });

  it("skips unknown question ids without failing", async () => {
    await expect(
      applyGradedAnswers("u1", [{ questionId: "q-does-not-exist", correct: true }]),
    ).resolves.toBeUndefined();
  });

  it("does nothing on an empty result set", async () => {
    await applyGradedAnswers("u1", []);
    expect(await store.getProgress("u1")).toHaveLength(0);
  });
});
