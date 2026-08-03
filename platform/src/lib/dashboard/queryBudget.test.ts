import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getContentRepo, setContentRepo } from "@/lib/content/repo";
import { withRequestScope } from "@/lib/requestScope";
// The two stores are reached at their own module paths, not through the
// barrels: setLearningStore/setGamificationStore are test seams, and the row
// types they take are internal to their modules by design (docs/architecture/05
// governs what PRODUCT code may import; every module's own tests already reach
// its store directly).
import {
  setGamificationStore,
  type AttemptRow,
  type GamificationStateRow,
  type GamificationStore,
  type MasteryRow,
} from "@/modules/gamification/store";
import {
  setLearningStore,
  type LearningStore,
  type ProgressRow,
  type SimEvidenceRow,
} from "@/modules/learning/store";

/**
 * ONE DASHBOARD RENDER, COUNTED.
 *
 * The audit counted THIRTEEN queries for a single paint of
 * app/(dashboard)/dashboard/page.tsx, against a pg pool whose default max is
 * ten. That is not a slow page — it is a page that cannot finish, because the
 * eleventh query waits for a connection that will not free up until the page
 * it is blocking completes.
 *
 * Counting happens at the two store seams. Every method below is exactly one
 * Prisma call in the real store, one-to-one:
 *
 *   LearningStore.getProgress          → db.progress.findMany
 *   LearningStore.getSimEvidenceSince  → db.$queryRaw (SimSession, projected
 *                                        and LIMITed — learning/store.ts)
 *   GamificationStore.getState         → db.gamificationState.findUnique
 *   GamificationStore.getMastery       → db.progress.findMany
 *   GamificationStore.getAttemptsSince → db.questionAttempt.findMany
 */

vi.mock("@/modules/auth", () => ({
  requireUser: async () => ({
    id: "u-1",
    email: "student@example.com",
    name: "Иван Петров",
    isAdmin: false,
  }),
}));

/**
 * The one query this harness does not issue. getSessionUser() reads User.role
 * fresh per request and has been deduped since it was written — React cache(),
 * auth/session.ts:13 — so it costs one query however many of the seven callers
 * ask for the user. Counted as a constant so the totals below are the same
 * thirteen and six the audit is talking about, not a subset of them.
 */
const AUTH_ROLE_QUERIES = 1;

const queries: string[] = [];

function record<T>(label: string, value: T): Promise<T> {
  queries.push(label);
  return Promise.resolve(value);
}

let progressRows: ProgressRow[] = [];

const learningStore: LearningStore = {
  getProgress: () => record("progress.findMany", progressRows),
  getSimEvidenceSince: () => record("simSession.evidence", [] as SimEvidenceRow[]),
  getCorrectlyAnsweredSince: () => record("questionAttempt.findMany", [] as string[]),
  recordAnswer: async () => {},
  upsertProgress: async () => {},
};

const gamificationStore: GamificationStore = {
  getState: () =>
    record("gamificationState.findUnique", null as GamificationStateRow | null),
  saveState: async () => {},
  countCorrectAnswers: () => record("questionAttempt.count", 0),
  getAttemptsSince: () => record("questionAttempt.findMany", [] as AttemptRow[]),
  getMastery: () => record("progress.findMany", [] as MasteryRow[]),
};

/** Exactly the fan-out in app/(dashboard)/dashboard/page.tsx:29-45. */
async function renderDashboard(): Promise<void> {
  const data = await import("./data");
  await Promise.all([
    data.getStudentProfile(),
    data.getReadiness(),
    data.getGamification(),
    data.getDailyMission(),
    data.getRecentAchievements(),
    data.getContinueLesson(),
    data.getSimWeakSpots(),
  ]);
}

describe("one dashboard render, in queries", () => {
  beforeEach(async () => {
    // Freeze the clock. getReadiness and getSimWeakSpots each take their own
    // `new Date()` and the sim-evidence window is keyed to the minute, so a run
    // that straddled a minute boundary would flake on nothing.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-03T09:30:00.000Z"));

    queries.length = 0;
    setLearningStore(learningStore);
    setGamificationStore(gamificationStore);

    // One Progress row against a REAL concept, so getContinueLesson finds a
    // started topic and takes its full path — with nothing started it returns
    // early and stops being the caller this file is about.
    await import("@/lib/content/loader");
    const repo = getContentRepo();
    const concept = repo.conceptsByTopic(repo.topics()[0]!.id)[0]!;
    progressRows = [
      {
        conceptId: concept.id,
        mastery: 0.4,
        reps: 2,
        lapses: 1,
        dueAt: new Date("2026-08-05T09:00:00.000Z"),
        updatedAt: new Date("2026-08-01T09:00:00.000Z"),
      },
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
    setGamificationStore(null);
  });

  it("is under half the pool — six queries, not thirteen", async () => {
    await withRequestScope(renderDashboard);

    const total = queries.length + AUTH_ROLE_QUERIES;
    expect(total, `queries issued:\n  ${queries.join("\n  ")}`).toBeLessThan(10); // POOL_MAX / 2
    expect(total).toBe(6);
  });

  it("reads a student's Progress ONCE per store, not five times", async () => {
    await withRequestScope(renderDashboard);

    // Five callers wanted these rows: readiness, the topic grid, the daily
    // mission's mastery check, the continue-lesson card's overview and its
    // second readiness pass. Two stores read the table — the learning store
    // (whole rows) and the gamification store (conceptId + mastery, for the
    // mission) — so the floor is two, not one.
    expect(queries.filter((q) => q === "progress.findMany")).toHaveLength(2);
  });

  it("reads the sim-evidence window ONCE, not three times", async () => {
    await withRequestScope(renderDashboard);
    expect(queries.filter((q) => q === "simSession.evidence")).toHaveLength(1);
  });

  it("reads the GamificationState row ONCE, not three times", async () => {
    await withRequestScope(renderDashboard);
    expect(
      queries.filter((q) => q === "gamificationState.findUnique"),
    ).toHaveLength(1);
  });

  it("still issues all thirteen when there is no request to share", async () => {
    // The other half of the contract, and the reason every existing unit test
    // with an injected fake is unaffected by any of this: outside a request the
    // memo degrades to no dedupe at all, never to a cache shared between
    // students. Thirteen is also the number the audit measured.
    await renderDashboard();
    expect(queries.length + AUTH_ROLE_QUERIES).toBe(13);
  });

  it("does not compute the readiness snapshot twice", async () => {
    // getContinueLesson recomputed the FULL readiness fold — every concept in
    // the content repo, weighted, blended with sim evidence and sorted — to
    // read ONE concept title getReadiness had already fetched. Queries cannot
    // see that (the rows are shared either way), so count the fold instead:
    // computeReadiness is the only thing on this page that calls conceptById.
    const real = getContentRepo();
    let conceptByIdCalls = 0;
    setContentRepo({
      ...real,
      conceptById: (id: string) => {
        conceptByIdCalls += 1;
        return real.conceptById(id);
      },
    });

    try {
      const data = await import("./data");

      await withRequestScope(() => data.getReadiness());
      const oneFold = conceptByIdCalls;
      expect(oneFold, "the fold should touch the content graph").toBeGreaterThan(
        0,
      );

      conceptByIdCalls = 0;
      await withRequestScope(async () => {
        await Promise.all([data.getReadiness(), data.getContinueLesson()]);
      });

      expect(
        conceptByIdCalls,
        "the continue-lesson card folded the whole content graph a second time",
      ).toBe(oneFold);
    } finally {
      setContentRepo(real);
    }
  });

  it("does not fold readiness at all for a student who has started nothing", async () => {
    // The overview alone decides whether there is anything to continue. A
    // brand-new account used to pay for a full readiness snapshot — rows and
    // fold — in order to return null.
    progressRows = [];
    const data = await import("./data");

    expect(await data.getContinueLesson()).toBeNull();
    expect(queries).toEqual(["progress.findMany"]);
  });
});
