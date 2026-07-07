/**
 * recordActivity + read APIs, end-to-end over the in-memory store.
 *
 * Convention mirrored from production: the activity row (QuestionAttempt) is
 * persisted by the learning/exam module BEFORE recordActivity runs, so tests
 * seed the triggering attempt into the fake store first.
 *
 * NOW = 2026-07-07T12:00:00Z = 15:00 Sofia (no night-owl/early-bird noise).
 * Mission hash facts (see mission.test.ts): "u-solve" → solve-count target 10
 * reward 30; "u1" → topic-correct target 5 reward 40.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { setContentRepo } from "@/lib/content/repo";
import { FakeGamificationStore, makeGamificationFixtureRepo } from "./fixtures";
import {
  getDailyMission,
  getRecentAchievements,
  getSummary,
  recordActivity,
} from "./index";
import { setGamificationStore } from "./store";

const NOW = new Date("2026-07-07T12:00:00.000Z");
const USER = "u1";

let store: FakeGamificationStore;

beforeEach(() => {
  setContentRepo(makeGamificationFixtureRepo());
  store = new FakeGamificationStore();
  setGamificationStore(store);
});

const ids = (arr: { id: string }[]) => arr.map((a) => a.id);

describe("recordActivity — XP and level", () => {
  it("awards 10×points for a correct practice answer and starts the streak", async () => {
    store.seedAttempt(USER, { questionId: "q-a1", correct: true, answeredAt: NOW });
    const r = await recordActivity(
      USER,
      { type: "practice_answer", correct: true, points: 3 },
      NOW,
    );

    expect(r.xpAwarded).toBe(30);
    expect(r.totalXp).toBe(30);
    expect(r.level).toBe(1);
    expect(r.leveledUp).toBe(false);
    expect(r.streak).toBe(1);
    expect(r.missionCompleted).toBe(false);

    const saved = store.getStateSync(USER)!;
    expect(saved.xp).toBe(30);
    expect(saved.lastActiveDay).toEqual(NOW);
    expect(store.saveStateCalls[0].state.level).toBe(1); // level kept in sync
  });

  it("awards 2 XP for a wrong answer (effort, not guessing)", async () => {
    store.seedAttempt(USER, { questionId: "q-a1", correct: false, answeredAt: NOW });
    const r = await recordActivity(
      USER,
      { type: "practice_answer", correct: false, points: 3 },
      NOW,
    );
    expect(r.xpAwarded).toBe(2);
    expect(ids(r.newAchievements)).not.toContain("first-correct-answer");
  });

  it("accumulates XP onto existing state and reports level-ups", async () => {
    store.seedState(USER, { xp: 380, streak: 1, lastActiveDay: NOW });
    const r = await recordActivity(
      USER,
      { type: "exam_completed", passed: false, score: 0 },
      NOW,
    );
    expect(r.totalXp).toBe(430);
    expect(r.level).toBe(2);
    expect(r.leveledUp).toBe(true);
  });
});

describe("recordActivity — achievements", () => {
  it("awards first-correct-answer on the first correct answer", async () => {
    store.seedAttempt(USER, { questionId: "q-a1", correct: true, answeredAt: NOW });
    const r = await recordActivity(
      USER,
      { type: "practice_answer", correct: true, points: 1 },
      NOW,
    );
    expect(ids(r.newAchievements)).toEqual(["first-correct-answer"]);
    expect(r.newAchievements[0].earnedAt).toBe(NOW.toISOString());
    expect(r.newAchievements[0].titleBg).toBe("Първи верен отговор");
  });

  it("awards 50-correct when the lifetime correct count reaches 50", async () => {
    const old = new Date("2026-06-01T10:00:00.000Z"); // outside mission window
    for (let i = 0; i < 50; i++) {
      store.seedAttempt(USER, { questionId: `q-${i}`, correct: true, answeredAt: old });
    }
    const r = await recordActivity(
      USER,
      { type: "practice_answer", correct: true, points: 1 },
      NOW,
    );
    expect(ids(r.newAchievements)).toEqual(
      expect.arrayContaining(["first-correct-answer", "50-correct"]),
    );
    expect(ids(r.newAchievements)).not.toContain("200-correct");
  });

  it("never re-awards an already-earned achievement", async () => {
    store.seedState(USER, {
      achievements: [
        { id: "first-correct-answer", earnedAt: "2026-07-01T10:00:00.000Z" },
      ],
    });
    store.seedAttempt(USER, { questionId: "q-a1", correct: true, answeredAt: NOW });
    const r = await recordActivity(
      USER,
      { type: "practice_answer", correct: true, points: 1 },
      NOW,
    );
    expect(ids(r.newAchievements)).not.toContain("first-correct-answer");
    const markers = store.getStateSync(USER)!.achievements;
    expect(markers.filter((m) => m.id === "first-correct-answer")).toHaveLength(1);
    // Original earnedAt untouched.
    expect(markers[0].earnedAt).toBe("2026-07-01T10:00:00.000Z");
  });

  it("awards exam achievements from the event payload", async () => {
    const r = await recordActivity(
      USER,
      { type: "exam_completed", passed: true, score: 95 },
      NOW,
    );
    expect(r.xpAwarded).toBe(50 + 95 + 150);
    expect(ids(r.newAchievements)).toEqual(
      expect.arrayContaining(["first-exam", "first-passed-exam", "exam-90-plus"]),
    );
  });

  it("a failed low-score exam earns only first-exam", async () => {
    const r = await recordActivity(
      USER,
      { type: "exam_completed", passed: false, score: 60 },
      NOW,
    );
    expect(r.xpAwarded).toBe(110);
    expect(ids(r.newAchievements)).toEqual(["first-exam"]);
  });

  it("awards streak achievements when the chain crosses a threshold", async () => {
    // 23:59 Sofia Jul 6 → 00:30 Sofia Jul 7: consecutive Sofia days.
    const lateYesterday = new Date("2026-07-06T20:59:00.000Z");
    const earlyToday = new Date("2026-07-06T21:30:00.000Z");
    store.seedState(USER, { streak: 2, lastActiveDay: lateYesterday });
    store.seedAttempt(USER, { questionId: "q-a1", correct: false, answeredAt: earlyToday });

    const r = await recordActivity(
      USER,
      { type: "practice_answer", correct: false, points: 1 },
      earlyToday,
    );
    expect(r.streak).toBe(3);
    expect(ids(r.newAchievements)).toContain("streak-3");
    // 00:30 Sofia also makes this a night-owl session.
    expect(ids(r.newAchievements)).toContain("night-owl");
  });

  it("resets the streak after a missed Sofia day", async () => {
    store.seedState(USER, {
      streak: 7,
      lastActiveDay: new Date("2026-07-04T10:00:00.000Z"),
    });
    const r = await recordActivity(
      USER,
      { type: "practice_answer", correct: false, points: 1 },
      NOW,
    );
    expect(r.streak).toBe(1);
  });

  it("awards early-bird for a 06:00 Sofia session", async () => {
    const sixAmSofia = new Date("2026-07-07T03:00:00.000Z");
    const r = await recordActivity(
      USER,
      { type: "practice_answer", correct: false, points: 1 },
      sixAmSofia,
    );
    expect(ids(r.newAchievements)).toContain("early-bird");
    expect(ids(r.newAchievements)).not.toContain("night-owl");
  });

  it("awards topic-mastered lazily on practice events (avgMastery ≥ 0.9)", async () => {
    store.seedMastery(USER, [{ conceptId: "c-b1", mastery: 0.95 }]); // t-beta avg 0.95
    store.seedAttempt(USER, { questionId: "q-b1", correct: true, answeredAt: NOW });
    const r = await recordActivity(
      USER,
      { type: "practice_answer", correct: true, points: 1 },
      NOW,
    );
    expect(ids(r.newAchievements)).toContain("topic-mastered");
  });

  it("does NOT run the topic-mastered check on exam events", async () => {
    store.seedMastery(USER, [{ conceptId: "c-b1", mastery: 0.95 }]);
    const r = await recordActivity(
      USER,
      { type: "exam_completed", passed: false, score: 60 },
      NOW,
    );
    expect(ids(r.newAchievements)).not.toContain("topic-mastered");
  });

  it("stays below topic-mastered when a topic concept is unmastered", async () => {
    // t-alpha: (0.95 + 0) / 2 = 0.475 — unseen concepts count as 0.
    store.seedMastery(USER, [{ conceptId: "c-a1", mastery: 0.95 }]);
    store.seedAttempt(USER, { questionId: "q-a1", correct: true, answeredAt: NOW });
    const r = await recordActivity(
      USER,
      { type: "practice_answer", correct: true, points: 1 },
      NOW,
    );
    expect(ids(r.newAchievements)).not.toContain("topic-mastered");
  });
});

describe("recordActivity — daily mission bonus", () => {
  const SOLVER = "u-solve"; // solve-count, target 10, reward 30

  it("grants the bonus exactly once when the target is crossed", async () => {
    for (let i = 0; i < 10; i++) {
      store.seedAttempt(SOLVER, {
        questionId: `q-${i}`,
        correct: false,
        answeredAt: new Date(NOW.getTime() - i * 60_000),
      });
    }
    const r = await recordActivity(
      SOLVER,
      { type: "practice_answer", correct: false, points: 1 },
      NOW,
    );
    expect(r.missionCompleted).toBe(true);
    expect(r.xpAwarded).toBe(2 + 30);

    const markers = store.getStateSync(SOLVER)!.achievements;
    expect(markers.filter((m) => m.id === "dm-2026-07-07")).toHaveLength(1);

    // 11th answer, same day: marker guards the double award.
    store.seedAttempt(SOLVER, { questionId: "q-x", correct: false, answeredAt: NOW });
    const r2 = await recordActivity(
      SOLVER,
      { type: "practice_answer", correct: false, points: 1 },
      NOW,
    );
    expect(r2.missionCompleted).toBe(false);
    expect(r2.xpAwarded).toBe(2);
    expect(
      store.getStateSync(SOLVER)!.achievements.filter((m) => m.id === "dm-2026-07-07"),
    ).toHaveLength(1);
  });

  it("does not grant the bonus below the target", async () => {
    for (let i = 0; i < 9; i++) {
      store.seedAttempt(SOLVER, {
        questionId: `q-${i}`,
        correct: false,
        answeredAt: NOW,
      });
    }
    const r = await recordActivity(
      SOLVER,
      { type: "practice_answer", correct: false, points: 1 },
      NOW,
    );
    expect(r.missionCompleted).toBe(false);
    expect(r.xpAwarded).toBe(2);
  });

  it("yesterday's marker does not block today's mission", async () => {
    store.seedState(SOLVER, {
      achievements: [{ id: "dm-2026-07-06", earnedAt: "2026-07-06T10:00:00.000Z" }],
    });
    for (let i = 0; i < 10; i++) {
      store.seedAttempt(SOLVER, { questionId: `q-${i}`, correct: false, answeredAt: NOW });
    }
    const r = await recordActivity(
      SOLVER,
      { type: "practice_answer", correct: false, points: 1 },
      NOW,
    );
    expect(r.missionCompleted).toBe(true);
  });
});

describe("getDailyMission", () => {
  it("returns deterministic mission with live progress (distinct topic corrects)", async () => {
    // USER "u1" → topic-correct on the weakest topic (t-alpha with no mastery).
    store.seedAttempt(USER, { questionId: "q-a1", correct: true, answeredAt: NOW });
    store.seedAttempt(USER, { questionId: "q-a1", correct: true, answeredAt: NOW }); // dup
    store.seedAttempt(USER, { questionId: "q-a3", correct: true, answeredAt: NOW });
    store.seedAttempt(USER, { questionId: "q-b1", correct: true, answeredAt: NOW }); // other topic

    const m = (await getDailyMission(USER, NOW))!;
    expect(m.id).toBe("dm-2026-07-07");
    expect(m.target).toBe(5);
    expect(m.xpReward).toBe(40);
    expect(m.progress).toBe(2);
    expect(m.completed).toBe(false);

    const again = await getDailyMission(USER, NOW);
    expect(again).toEqual(m);
  });

  it("shows completed with full progress once the bonus marker exists", async () => {
    store.seedState(USER, {
      achievements: [{ id: "dm-2026-07-07", earnedAt: NOW.toISOString() }],
    });
    const m = (await getDailyMission(USER, NOW))!;
    expect(m.completed).toBe(true);
    expect(m.progress).toBe(m.target);
  });
});

describe("getSummary", () => {
  it("derives level split and live streak from stored state", async () => {
    store.seedState(USER, {
      xp: 850,
      streak: 5,
      lastActiveDay: new Date("2026-07-06T10:00:00.000Z"), // yesterday Sofia
    });
    expect(await getSummary(USER, NOW)).toEqual({
      xp: 850,
      level: 3,
      xpIntoLevel: 50,
      xpForNextLevel: 400,
      streakDays: 5,
      streakActiveToday: false,
    });
  });

  it("reports a broken chain as 0 without writing", async () => {
    store.seedState(USER, {
      xp: 100,
      streak: 5,
      lastActiveDay: new Date("2026-07-04T10:00:00.000Z"),
    });
    const s = await getSummary(USER, NOW);
    expect(s.streakDays).toBe(0);
    expect(s.streakActiveToday).toBe(false);
    expect(store.saveStateCalls).toHaveLength(0);
  });

  it("returns the zero state for a brand-new user", async () => {
    expect(await getSummary("nobody", NOW)).toEqual({
      xp: 0,
      level: 1,
      xpIntoLevel: 0,
      xpForNextLevel: 400,
      streakDays: 0,
      streakActiveToday: false,
    });
  });
});

describe("getRecentAchievements", () => {
  it("returns the newest N real achievements, excluding dm markers and unknown ids", async () => {
    store.seedState(USER, {
      achievements: [
        { id: "first-exam", earnedAt: "2026-07-02T10:00:00.000Z" },
        { id: "streak-3", earnedAt: "2026-07-03T10:00:00.000Z" },
        { id: "first-correct-answer", earnedAt: "2026-07-04T10:00:00.000Z" },
        { id: "50-correct", earnedAt: "2026-07-05T10:00:00.000Z" },
        { id: "exam-90-plus", earnedAt: "2026-07-06T10:00:00.000Z" },
        { id: "dm-2026-07-07", earnedAt: "2026-07-07T09:00:00.000Z" },
        { id: "some-future-id", earnedAt: "2026-07-07T10:00:00.000Z" },
      ],
    });

    const recent = await getRecentAchievements(USER, 4);
    expect(ids(recent)).toEqual([
      "exam-90-plus",
      "50-correct",
      "first-correct-answer",
      "streak-3",
    ]);
    expect(recent[0].titleBg).toBe("Отличен резултат");
    expect(recent[0].icon).toBe("bolt");
    expect(recent[0].earnedAt).toBe("2026-07-06T10:00:00.000Z");
  });

  it("returns [] for users without state", async () => {
    expect(await getRecentAchievements("nobody")).toEqual([]);
  });
});
