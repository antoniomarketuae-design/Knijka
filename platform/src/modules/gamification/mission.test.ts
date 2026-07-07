/**
 * Daily-mission derivation + progress.
 *
 * Hardcoded expectations below depend on fnv1a hash values for the fixture
 * day 2026-07-07 (guarded by the stability test):
 *   "u-solve" → hash 4065696678: even → solve-count, variant 0 (target 10)
 *   "u1"      → hash 1355210445: odd  → topic-correct
 */

import { beforeEach, describe, expect, it } from "vitest";
import { setContentRepo, type ContentRepo } from "@/lib/content/repo";
import { makeGamificationFixtureRepo } from "./fixtures";
import {
  deriveMission,
  fnv1a,
  missionProgress,
  weakestTopic,
} from "./mission";
import type { AttemptRow } from "./store";

const NOW = new Date("2026-07-07T12:00:00.000Z"); // 15:00 Sofia, day 2026-07-07
let repo: ContentRepo;

beforeEach(() => {
  repo = makeGamificationFixtureRepo();
  setContentRepo(repo);
});

function attempt(
  questionId: string,
  correct: boolean,
  answeredAt: Date,
  context = "practice",
): AttemptRow {
  return { questionId, correct, answeredAt, context };
}

describe("fnv1a", () => {
  it("is stable — changing it would silently reshuffle every user's missions", () => {
    expect(fnv1a("u-solve:2026-07-07")).toBe(4065696678);
    expect(fnv1a("u1:2026-07-07")).toBe(1355210445);
  });
});

describe("deriveMission", () => {
  it("is deterministic for (userId, Sofia day)", () => {
    const a = deriveMission("u1", NOW, repo, []);
    const b = deriveMission("u1", new Date("2026-07-07T20:00:00.000Z"), repo, []);
    expect(a).toEqual(b);
    expect(a.id).toBe("dm-2026-07-07");
  });

  it("derives a solve-count mission with target and reward from the hash", () => {
    const m = deriveMission("u-solve", NOW, repo, []);
    expect(m.kind).toBe("solve-count");
    expect(m.target).toBe(10);
    expect(m.xpReward).toBe(30);
    expect(m.titleBg).toContain("10");
  });

  it("derives a topic-correct mission targeting the weakest topic", () => {
    const m = deriveMission("u1", NOW, repo, [
      { conceptId: "c-a1", mastery: 0.9 },
      { conceptId: "c-a2", mastery: 0.9 },
      { conceptId: "c-b1", mastery: 0.3 },
    ]);
    expect(m.kind).toBe("topic-correct");
    expect(m.topicId).toBe("t-beta"); // avg 0.3 < alpha's 0.9
    expect(m.target).toBe(5);
    expect(m.xpReward).toBe(40);
    expect(m.titleBg).toContain("Тема Бета");
  });

  it("breaks weakest-topic ties by topic order (fresh users get topic 1)", () => {
    expect(weakestTopic(repo, [])?.topicId).toBe("t-alpha");
    const m = deriveMission("u1", NOW, repo, []);
    expect(m.topicId).toBe("t-alpha");
  });
});

describe("missionProgress — solve-count", () => {
  it("counts today's attempts from ANY context, capped at the target", () => {
    const m = deriveMission("u-solve", NOW, repo, []);
    const attempts = [
      attempt("q-a1", true, new Date("2026-07-07T08:00:00.000Z")),
      attempt("q-a1", false, new Date("2026-07-07T09:00:00.000Z")), // retry counts
      attempt("q-b1", true, new Date("2026-07-07T10:00:00.000Z"), "exam"),
    ];
    expect(missionProgress(m, attempts, repo, NOW)).toBe(3);
  });

  it("filters by SOFIA day, not UTC day", () => {
    const m = deriveMission("u-solve", NOW, repo, []);
    const attempts = [
      // 22:00Z Jul 6 = 01:00 Sofia Jul 7 → counts.
      attempt("q-a1", true, new Date("2026-07-06T22:00:00.000Z")),
      // 20:00Z Jul 6 = 23:00 Sofia Jul 6 → yesterday, ignored.
      attempt("q-a2", true, new Date("2026-07-06T20:00:00.000Z")),
    ];
    expect(missionProgress(m, attempts, repo, NOW)).toBe(1);
  });
});

describe("missionProgress — topic-correct", () => {
  it("counts DISTINCT correct questions of the topic only", () => {
    const m = deriveMission("u1", NOW, repo, []); // weakest = t-alpha
    const attempts = [
      attempt("q-a1", true, new Date("2026-07-07T08:00:00.000Z")),
      attempt("q-a1", true, new Date("2026-07-07T08:05:00.000Z")), // re-grind: no credit
      attempt("q-a3", true, new Date("2026-07-07T08:10:00.000Z")),
      attempt("q-a2", false, new Date("2026-07-07T08:15:00.000Z")), // wrong: no credit
      attempt("q-b1", true, new Date("2026-07-07T08:20:00.000Z")), // other topic
      attempt("q-a2", true, new Date("2026-07-06T08:00:00.000Z")), // yesterday
    ];
    expect(missionProgress(m, attempts, repo, NOW)).toBe(2); // q-a1 + q-a3
  });

  it("ignores attempts on questions missing from content (deleted)", () => {
    const m = deriveMission("u1", NOW, repo, []);
    const attempts = [
      attempt("q-gone", true, new Date("2026-07-07T08:00:00.000Z")),
    ];
    expect(missionProgress(m, attempts, repo, NOW)).toBe(0);
  });
});
