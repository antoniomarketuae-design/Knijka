import { beforeEach, describe, expect, it } from "vitest";
import { setContentRepo } from "@/lib/content/repo";
import { FakeLearningStore, makeFixtureRepo } from "./fixtures";
import { OPTION_ORDER_WINDOW_MS } from "./optionOrder";
import { buildPracticeSession } from "./session";
import { setLearningStore } from "./store";

const NOW = new Date("2026-07-07T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR_MS);
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * DAY_MS);

const USER = "u1";

let store: FakeLearningStore;

beforeEach(() => {
  setContentRepo(makeFixtureRepo());
  store = new FakeLearningStore();
  setLearningStore(store);
});

describe("buildPracticeSession", () => {
  it("puts due reviews first, then weak concepts; gated concepts are absent", async () => {
    // c-warning is due; c-road is seen, not due, weak (0.2).
    store.seedProgress(USER, {
      conceptId: "c-warning",
      mastery: 0.7,
      reps: 2,
      dueAt: hoursAgo(2),
    });
    store.seedProgress(USER, {
      conceptId: "c-road",
      mastery: 0.2,
      reps: 1,
      dueAt: daysFromNow(1),
    });

    const session = await buildPracticeSession(USER, { now: NOW });

    expect(session.map((s) => s.question.id)).toEqual([
      "q-warn-1",
      "q-warn-2",
      "q-road-1",
      "q-road-2",
    ]);
    expect(session.map((s) => s.reason)).toEqual([
      "due-review",
      "due-review",
      "weak-concept",
      "weak-concept",
    ]);
    // c-priority is gated (prereq c-road at 0.2 < 0.5), c-sign-priority too.
    expect(session.some((s) => s.conceptId === "c-priority")).toBe(false);
    expect(session.some((s) => s.conceptId === "c-sign-priority")).toBe(false);
  });

  it("orders due reviews most-overdue first", async () => {
    store.seedProgress(USER, {
      conceptId: "c-warning",
      mastery: 0.9,
      reps: 2,
      dueAt: hoursAgo(1),
    });
    store.seedProgress(USER, {
      conceptId: "c-road",
      mastery: 0.9,
      reps: 2,
      dueAt: hoursAgo(3), // more overdue → first
    });

    const session = await buildPracticeSession(USER, { now: NOW });
    expect(session[0].conceptId).toBe("c-road");
    expect(session[1].conceptId).toBe("c-warning");
  });

  it("never drills a concept before its prerequisites reach 0.5 mastery", async () => {
    store.seedProgress(USER, {
      conceptId: "c-road",
      mastery: 0.4,
      reps: 1,
      dueAt: daysFromNow(1),
    });
    const gated = await buildPracticeSession(USER, { now: NOW });
    expect(gated.some((s) => s.conceptId === "c-priority")).toBe(false);

    store.seedProgress(USER, {
      conceptId: "c-road",
      mastery: 0.6,
      reps: 1,
      dueAt: daysFromNow(1),
    });
    const unlocked = await buildPracticeSession(USER, { now: NOW });
    expect(unlocked.some((s) => s.conceptId === "c-priority")).toBe(true);
    // Deeper concept still gated: its prereq c-priority is unseen (0).
    expect(unlocked.some((s) => s.conceptId === "c-sign-priority")).toBe(false);
  });

  it("serves a brand-new user root concepts in topic order, round-robin", async () => {
    const session = await buildPracticeSession(USER, { now: NOW });
    expect(session.map((s) => s.question.id)).toEqual([
      "q-road-1", // topic 1 root, pass 1
      "q-warn-1", // topic 2 root, pass 1
      "q-road-2", // pass 2
      "q-warn-2",
    ]);
    expect(session.every((s) => s.reason === "new-concept")).toBe(true);
  });

  it("prioritizes weakest concepts first within the weak bucket", async () => {
    store.seedProgress(USER, {
      conceptId: "c-road",
      mastery: 0.6,
      reps: 1,
      dueAt: daysFromNow(1),
    });
    store.seedProgress(USER, {
      conceptId: "c-warning",
      mastery: 0.1,
      reps: 1,
      dueAt: daysFromNow(1),
    });
    const session = await buildPracticeSession(USER, { now: NOW });
    expect(session[0].conceptId).toBe("c-warning"); // 0.1 < 0.6
    expect(session[0].reason).toBe("weak-concept");
  });

  it("excludes questions answered correctly in the last 2 hours only", async () => {
    store.seedAttempt(USER, {
      questionId: "q-warn-1",
      correct: true,
      answeredAt: hoursAgo(1), // recent correct → excluded
    });
    store.seedAttempt(USER, {
      questionId: "q-warn-2",
      correct: true,
      answeredAt: hoursAgo(3), // outside window → included
    });
    store.seedAttempt(USER, {
      questionId: "q-road-1",
      correct: false,
      answeredAt: hoursAgo(1), // recent but WRONG → included
    });

    const session = await buildPracticeSession(USER, { now: NOW });
    const ids = session.map((s) => s.question.id);
    expect(ids).not.toContain("q-warn-1");
    expect(ids).toContain("q-warn-2");
    expect(ids).toContain("q-road-1");
  });

  it("includeUnreviewed=false drops needs-review questions but keeps drafts", async () => {
    store.seedProgress(USER, {
      conceptId: "c-road",
      mastery: 0.6,
      reps: 1,
      dueAt: daysFromNow(1),
    });

    const withUnreviewed = await buildPracticeSession(USER, { now: NOW });
    expect(withUnreviewed.map((s) => s.question.id)).toContain("q-prio-2");

    const without = await buildPracticeSession(USER, {
      now: NOW,
      includeUnreviewed: false,
    });
    const ids = without.map((s) => s.question.id);
    expect(ids).not.toContain("q-prio-2"); // needs-review
    expect(ids).toContain("q-road-2"); // draft stays eligible
  });

  it("respects size and returns fewer when eligible content runs out", async () => {
    for (const conceptId of ["c-road", "c-priority", "c-warning", "c-sign-priority"]) {
      store.seedProgress(USER, {
        conceptId,
        mastery: 0.6,
        reps: 1,
        dueAt: daysFromNow(1),
      });
    }
    // Default size 10, but the fixture only has 7 questions.
    const all = await buildPracticeSession(USER, { now: NOW });
    expect(all).toHaveLength(7);
    expect(new Set(all.map((s) => s.question.id)).size).toBe(7); // no repeats

    const three = await buildPracticeSession(USER, { now: NOW, size: 3 });
    expect(three).toHaveLength(3);
  });

  it("scopes to a topic via topicSlug and rejects unknown slugs", async () => {
    const session = await buildPracticeSession(USER, {
      now: NOW,
      topicSlug: "basics",
    });
    // Fresh user in "basics": only the root concept is available.
    expect(session.map((s) => s.question.id)).toEqual(["q-road-1", "q-road-2"]);

    await expect(
      buildPracticeSession(USER, { now: NOW, topicSlug: "nope" }),
    ).rejects.toThrow(/unknown topic slug/i);
  });

  it("scopes to an explicit concept set (a section) via conceptIds", async () => {
    // Unlock c-priority so it is eligible, then restrict to just that concept.
    store.seedProgress(USER, {
      conceptId: "c-road",
      mastery: 0.6,
      reps: 1,
      dueAt: daysFromNow(1),
    });

    const scoped = await buildPracticeSession(USER, {
      now: NOW,
      conceptIds: ["c-priority"],
    });
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((s) => s.conceptId === "c-priority")).toBe(true);

    // An empty/absent set means "no concept filter" — the whole scope is used.
    const unfiltered = await buildPracticeSession(USER, {
      now: NOW,
      conceptIds: [],
    });
    expect(unfiltered.some((s) => s.conceptId !== "c-priority")).toBe(true);
  });

  // -- option order (audit H-1a) ---------------------------------------------

  describe("option order", () => {
    /** Stored (bank) order of a fixture question — every correct option is
     *  authored first, exactly like the real bank's bias. */
    const storedIds = (questionId: string) =>
      makeFixtureRepo()
        .questionById(questionId)!
        .options.map((o) => o.id);

    it("presents options in the session's seeded order, not the stored one", async () => {
      // Seed 0 maps q-road-1's stored [a, b, c] to [b, c, a].
      const session = await buildPracticeSession(USER, { now: NOW, optionSeed: 0 });
      const roadOne = session.find((s) => s.question.id === "q-road-1")!;

      const presented = roadOne.question.options.map((o) => o.id);
      expect(presented).not.toEqual(storedIds("q-road-1"));
      expect([...presented].sort()).toEqual([...storedIds("q-road-1")].sort());
    });

    it("never reorders the content repo itself", async () => {
      const before = storedIds("q-road-1");

      await buildPracticeSession(USER, { now: NOW, optionSeed: 0 });

      // The repo is a process-lifetime singleton: an in-place shuffle would
      // scramble the bank for every other request in the process.
      expect(storedIds("q-road-1")).toEqual(before);
    });

    it("re-renders an identical order for the same seed, and a different one for the next sitting", async () => {
      const order = async (opts: { optionSeed?: number; now?: Date }) =>
        (await buildPracticeSession(USER, { now: NOW, ...opts }))
          .find((s) => s.question.id === "q-road-1")!
          .question.options.map((o) => o.id);

      expect(await order({ optionSeed: 0 })).toEqual(await order({ optionSeed: 0 }));

      // Default seed: derived from (user, clock window). Same window, same
      // order — a refresh mid-session must not move the answers around.
      const sameWindow = new Date(NOW.getTime() + 60_000);
      expect(await order({ now: sameWindow })).toEqual(await order({}));

      // A later sitting is dealt a fresh arrangement.
      const nextWindow = new Date(NOW.getTime() + OPTION_ORDER_WINDOW_MS);
      expect(await order({ now: nextWindow })).not.toEqual(await order({}));
    });
  });
});
