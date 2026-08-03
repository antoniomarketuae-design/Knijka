import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSimSessionStore,

  setSimSessionStore,
  type SimSessionEventsJson,
} from "../store";

/**
 * WHAT /simulator ASKS POSTGRES FOR.
 *
 * The existing store tests all drive the in-memory fake, so nothing had ever
 * looked at the query the Prisma-backed store actually builds — and that query
 * selected `events: true` for every session the student had ever driven, with
 * no `take`. The events payload is the full rule-event log; each ViolationEvent
 * carries titleBg + explanationBg, ~430 bytes of Bulgarian prose apiece. A
 * premium student at ~350 sessions pulled megabytes out of TOAST and parsed it
 * in Node, on page load AND at the end of every drive, to compute two booleans.
 *
 * So this file mocks @/lib/db and asserts the SHAPE of the call.
 */

const h = vi.hoisted(() => ({
  findManyArgs: [] as Record<string, unknown>[],
  createArgs: [] as Record<string, unknown>[],
  rows: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db", () => ({
  db: {
    simSession: {
      findMany: async (args: Record<string, unknown>) => {
        h.findManyArgs.push(args);
        return h.rows;
      },
      create: async (args: Record<string, unknown>) => {
        h.createArgs.push(args);
        return { id: "sess-db-1" };
      },
    },
  },
}));

const EVENTS: SimSessionEventsJson = {
  version: 1,
  passed: true,
  aborted: false,
  terminated: false,
  completedAll: true,
  ruleEvents: [],
  objectives: [],
  rubricStars: 2,
};

beforeEach(() => {
  h.findManyArgs.length = 0;
  h.createArgs.length = 0;
  h.rows.length = 0;
  setSimSessionStore(null); // use the real Prisma-backed store
});

afterEach(() => setSimSessionStore(null));

function lastSelect(): Record<string, unknown> {
  const args = h.findManyArgs.at(-1);
  expect(args, "no query was issued").toBeDefined();
  return (args as { select: Record<string, unknown> }).select;
}

describe("listSessions: the query, not the fake", () => {
  it("does not select the event log", async () => {
    await getSimSessionStore().listSessions("u-1");
    expect(
      lastSelect(),
      "selecting `events` here is the megabyte read — the history screen (listRecentSessions) is where the payload belongs",
    ).not.toHaveProperty("events");
  });

  it("selects the summary columns the three consumers actually read", async () => {
    await getSimSessionStore().listSessions("u-1");
    const select = lastSelect();
    // /simulator page.tsx: lessonId + passed + score → progression; lessonId +
    // rubricStars → the scenario catalog. simulator/actions.ts: score + passed
    // for the debrief's personal best. Nothing else is ever touched.
    for (const column of [
      "id",
      "lessonId",
      "finishedAt",
      "score",
      "passed",
      "rubricStars",
    ]) {
      expect(select).toHaveProperty(column, true);
    }
  });

  it("takes the WHOLE history — a window here silently locks the exam", async () => {
    await getSimSessionStore().listSessions("u-1");
    const args = h.findManyArgs.at(-1) as {
      take?: number;
      orderBy?: unknown;
      where?: unknown;
    };
    // A `take: 200` was here once and no test went red for it. Newest-first
    // means a window drops the OLDEST rows — the curriculum drives — and both
    // unlock gates need a row PRESENT IN THIS LIST: computeProgression
    // (progression.ts:74) and isExamUnlocked (progression.ts:109). Measured
    // over 260 scenario drives + 8 older curriculum passes, a 200-row window
    // took 8 unlocked lessons and an open exam down to 1 and LOCKED.
    //
    // The megabytes were the `events` blob, which the select above already
    // drops. The row count was never the cost. If a bound is ever needed, give
    // the unlock gates their own groupBy — do not window this list.
    expect(
      args.take,
      "a take here re-locks the exam for the heaviest user and breaks no test",
    ).toBeUndefined();
    expect(args.orderBy).toEqual({ startedAt: "desc" });
    expect(args.where).toEqual({ userId: "u-1" });
  });

  it("maps the columns back to the row shape progression already consumes", async () => {
    h.rows.push(
      {
        id: "s1",
        lessonId: "l0-free-drive",
        finishedAt: new Date("2026-08-01T10:00:00Z"),
        score: 3,
        passed: true,
        rubricStars: 3,
      },
      // A row whose payload was unreadable, or that never finished: both used
      // to fall out of parseSimSessionEvents as passed=false / stars=null.
      {
        id: "s2",
        lessonId: "l1-preparation",
        finishedAt: null,
        score: null,
        passed: null,
        rubricStars: null,
      },
    );

    const rows = await getSimSessionStore().listSessions("u-1");
    expect(rows[0]).toEqual({
      id: "s1",
      lessonId: "l0-free-drive",
      finishedAt: new Date("2026-08-01T10:00:00Z"),
      score: 3,
      passed: true,
      rubricStars: 3,
    });
    expect(rows[1]).toMatchObject({ passed: false, rubricStars: null });
  });
});

describe("saveSession keeps the summary columns honest", () => {
  it("writes the verdict and the stars from the same payload, in the same INSERT", async () => {
    // If the write ever stopped filling these, listSessions would report every
    // drive as failed and the whole catalogue would lock behind the student.
    await getSimSessionStore().saveSession("u-1", {
      lessonId: "sc-vu-pass@L2",
      startedAt: new Date("2026-08-01T10:00:00Z"),
      finishedAt: new Date("2026-08-01T10:06:00Z"),
      score: 4,
      events: EVENTS,
      debrief: "текст",
    });

    const data = (h.createArgs.at(-1) as { data: Record<string, unknown> }).data;
    expect(data.passed).toBe(EVENTS.passed);
    expect(data.rubricStars).toBe(EVENTS.rubricStars);
    // …and the payload itself still lands, unchanged: it stays the source of
    // truth these two columns are projected from.
    expect(data.events).toMatchObject({ version: 1, passed: true, rubricStars: 2 });
  });

  it("stores no stars for a non-scenario drive rather than a zero", async () => {
    const withoutStars: SimSessionEventsJson = { ...EVENTS };
    delete withoutStars.rubricStars;
    await getSimSessionStore().saveSession("u-1", {
      lessonId: "l0-free-drive",
      startedAt: new Date("2026-08-01T10:00:00Z"),
      finishedAt: new Date("2026-08-01T10:06:00Z"),
      score: 0,
      events: withoutStars,
      debrief: "текст",
    });

    const data = (h.createArgs.at(-1) as { data: Record<string, unknown> }).data;
    expect(data.rubricStars).toBeNull();
  });
});
