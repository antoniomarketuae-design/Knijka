/**
 * SWEEP 161 — TWO CLEAN PASSES WERE GRADED, SHOWN, AND THEN DELETED.
 *
 * `.audit-frames/sweep161/sc-vp-telltale-red/mobile-right/08-debrief.png` and
 * `.audit-frames/sweep161/sc-follow-standstill/mobile-right/08-debrief.png` are
 * the same picture twice: „0 наказателни точки", a green ИЗДЪРЖАН pill, the full
 * instructor debrief — and along the foot of the viewport, in red,
 *
 *   „Сесията не се записа (SAVE_FAILED) — оценката и разборът са верни, но
 *    остават само на този екран."
 *
 * A finished drive has no second chance: the result lives in that browser tab
 * and the end screen offers „Повтори" (drive it again), not „save it again".
 *
 * THE CAUSE, and it is not a grading bug. `lib/db.ts` runs the pg pool with
 * `max: 20` and `connectionTimeoutMillis: 5000` — deliberately, so a saturated
 * pool fails loudly instead of hanging forever. Its own note defends that with
 * „A student who is shown a failure can retry". Every page can. This path could
 * not: `finishLessonAction` made exactly one attempt at the single row in the
 * product that cannot be rebuilt afterwards, and one 5 s pool-acquire timeout
 * threw it away for good.
 *
 * WHAT THESE TESTS PIN, in both directions, because a retry aimed one notch too
 * wide is a worse bug than the one it fixes — `saveSession` is a bare `create()`
 * with no idempotency key, so replaying an error that MIGHT have reached
 * Postgres would give one drive two SimSession rows, two XP awards and two
 * history entries:
 *   1. the pool-acquire timeout is survived (it is provably pre-execution —
 *      pg-pool rejects it straight out of `_pendingQueue`, so no statement was
 *      ever sent);
 *   2. every other error is still fatal on the FIRST throw, and the store is
 *      called exactly once;
 *   3. the retry is bounded;
 *   4. the entitlement gate is retried but never relaxed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimitState } from "@/modules/security";
import {
  setSimSessionStore,
  type SaveSimSessionInput,
  type SimSessionListRow,
  type SimSessionStore,
} from "@/modules/sim/lessons/store";

const getSessionUser = vi.fn();
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  getSessionUser: () => getSessionUser(),
}));

const canDriveSimulator = vi.fn();
vi.mock("../access", () => ({ canDriveSimulator: () => canDriveSimulator() }));

// The action imports the loader for its side effect only; nothing asserted here
// reads the content bank (the debrief's concept titles degrade to a generic
// pointer, which is already its documented behaviour).
vi.mock("@/lib/content/loader", () => ({}));

// A14's two post-save folds are not the subject and both talk to Prisma. The
// gamification spy IS read once, though — see the history-read test.
const recordActivity = vi.fn();
vi.mock("@/modules/gamification", () => ({ recordActivity: (...a: unknown[]) => recordActivity(...a) }));
vi.mock("@/modules/learning", () => ({ recordSimObservations: async () => undefined }));

const { finishLessonAction } = await import("../actions");

const USER = { id: "u-driver", email: "ivan@mail.bg", name: "Иван", isAdmin: false };

/** pg-pool's exact rejection (`pg-pool/index.js:224`), built the way pg builds
 *  it: a bare Error, no `code`, no `severity` — which is why `adapter-pg`
 *  rethrows it untouched instead of turning it into a Prisma code. */
function poolAcquireTimeout(): Error {
  return new Error("timeout exceeded when trying to connect");
}

/** Any OTHER database refusal. Shaped like a real Prisma known-request error so
 *  the test cannot pass by the retry predicate simply not recognising it. */
function unrelatedDbError(): Error {
  return Object.assign(new Error("Unique constraint failed on the fields: (`id`)"), {
    code: "P2002",
  });
}

/** A gradable payload for a lesson with no objectives → a clean pass, which is
 *  what both frames show. */
function passingDrive(): unknown {
  const startedAtMs = Date.UTC(2026, 7, 17, 21, 26, 0);
  return {
    lessonId: "l0-free-drive",
    startedAtMs,
    finishedAtMs: startedAtMs + 209_000,
    aborted: false,
    ruleEvents: [],
    objectives: [],
  };
}

interface Recording {
  saveAttempts: number;
  listAttempts: number;
  saved: SaveSimSessionInput[];
}

/**
 * Install a store whose `saveSession` throws `throws[n]` on attempt n (a null
 * entry succeeds), and whose `listSessions` does the same with `listThrows`.
 */
function installStore(opts: {
  saveThrows?: Array<Error | null>;
  listThrows?: Array<Error | null>;
  history?: SimSessionListRow[];
}): Recording {
  const rec: Recording = { saveAttempts: 0, listAttempts: 0, saved: [] };
  const store: SimSessionStore = {
    async saveSession(_userId, input) {
      const err = opts.saveThrows?.[rec.saveAttempts] ?? null;
      rec.saveAttempts++;
      if (err !== null) throw err;
      rec.saved.push(input);
      return { id: `sess-${rec.saveAttempts}` };
    },
    async listSessions() {
      const err = opts.listThrows?.[rec.listAttempts] ?? null;
      rec.listAttempts++;
      if (err !== null) throw err;
      return opts.history ?? [];
    },
    async listRecentSessions() {
      return [];
    },
  };
  setSimSessionStore(store);
  return rec;
}

beforeEach(() => {
  resetRateLimitState();
  getSessionUser.mockResolvedValue(USER);
  canDriveSimulator.mockResolvedValue(true);
  recordActivity.mockResolvedValue({
    xpAwarded: 30,
    totalXp: 30,
    level: 1,
    leveledUp: false,
    streak: 1,
    newAchievements: [],
    missionCompleted: false,
  });
});

afterEach(() => {
  resetRateLimitState();
  setSimSessionStore(null);
  // resetAllMocks, not clearAllMocks: `mockRejectedValueOnce` queues a one-shot
  // implementation, and a test that does not consume it leaks it into the next
  // one. Caught here by a mutant — the entitlement test passed for the wrong
  // reason because a leftover `mockResolvedValueOnce(true)` outranked its own
  // `mockResolvedValue(false)`. beforeEach re-installs every implementation.
  vi.resetAllMocks();
});

describe("a passed drive survives a pool-acquire timeout on the write", () => {
  it("saves on the second attempt instead of returning SAVE_FAILED", async () => {
    const rec = installStore({ saveThrows: [poolAcquireTimeout(), null] });

    const result = await finishLessonAction(passingDrive());

    // THE assertion. `{ ok: false, code: "SAVE_FAILED" }` here is the two
    // frames, restated: graded, passed, discarded.
    expect(result).toMatchObject({ ok: true, sessionId: "sess-2" });
    expect(rec.saveAttempts).toBe(2);
    expect(rec.saved).toHaveLength(1);
  });

  it("writes the session exactly once — one drive is never two rows", async () => {
    // The half that makes the retry admissible. `saveSession` is a plain
    // `create()`, so the retry is only correct because pg-pool rejects a
    // pool-acquire timeout before any statement is sent.
    const rec = installStore({ saveThrows: [poolAcquireTimeout(), null] });

    await finishLessonAction(passingDrive());

    expect(rec.saved).toHaveLength(1);
    expect(rec.saved[0]?.lessonId).toBe("l0-free-drive");
    expect(rec.saved[0]?.score).toBe(0);
    expect(rec.saved[0]?.events.passed).toBe(true);
  });

  it("gives up after a bounded number of attempts", async () => {
    // A pool that is genuinely gone must still end in an answer, not a loop.
    const rec = installStore({
      saveThrows: [
        poolAcquireTimeout(),
        poolAcquireTimeout(),
        poolAcquireTimeout(),
        poolAcquireTimeout(),
      ],
    });

    const result = await finishLessonAction(passingDrive());

    expect(result).toMatchObject({ ok: false, code: "SAVE_FAILED" });
    expect(rec.saveAttempts).toBe(3); // one attempt + SAVE_RETRY_BACKOFF_MS.length
  });
});

describe("every other write failure stays fatal on the first throw", () => {
  it("does not retry a database refusal that may already have executed", async () => {
    // The opposite direction, and the one that matters most: a blanket retry
    // would replay a statement that could have committed, and the student would
    // end the day with two rows, two XP awards and two history entries for one
    // drive. The second entry below would let that pass unnoticed.
    const rec = installStore({ saveThrows: [unrelatedDbError(), null] });

    const result = await finishLessonAction(passingDrive());

    expect(result).toMatchObject({ ok: false, code: "SAVE_FAILED" });
    expect(rec.saveAttempts).toBe(1);
    expect(rec.saved).toHaveLength(0);
  });

  it("still answers SAVE_FAILED (the code is unchanged for a real refusal)", async () => {
    // Guard against curing the banner by renaming it. SAVE_FAILED remains the
    // true sentence when Postgres genuinely refused the write.
    installStore({ saveThrows: [unrelatedDbError()] });
    const result = await finishLessonAction(passingDrive());
    expect(result).toMatchObject({ ok: false, code: "SAVE_FAILED" });
  });
});

describe("the entitlement gate is retried, never relaxed", () => {
  it("a pool-acquire timeout on the gate no longer costs the drive", async () => {
    // The gate READS the DB, so it shares the write's failure mode — and a throw
    // here rejects the whole action, which LessonPlayShell can only render as
    // the same SAVE_FAILED banner.
    const rec = installStore({});
    canDriveSimulator
      .mockRejectedValueOnce(poolAcquireTimeout())
      .mockResolvedValueOnce(true);

    const result = await finishLessonAction(passingDrive());

    expect(result).toMatchObject({ ok: true });
    expect(canDriveSimulator).toHaveBeenCalledTimes(2);
    expect(rec.saved).toHaveLength(1);
  });

  it("an unentitled account is still refused, and nothing is written", async () => {
    // The retry must not have become „ask again until it says yes". A clean
    // `false` is an answer, not a failure.
    const rec = installStore({});
    canDriveSimulator.mockResolvedValue(false);

    await expect(finishLessonAction(passingDrive())).rejects.toThrow(
      /no simulator entitlement/,
    );
    expect(canDriveSimulator).toHaveBeenCalledTimes(1);
    expect(rec.saved).toHaveLength(0);
  });

  it("a non-timeout error on the gate still propagates on the first throw", async () => {
    const rec = installStore({});
    canDriveSimulator.mockRejectedValue(unrelatedDbError());

    await expect(finishLessonAction(passingDrive())).rejects.toThrow(/Unique constraint/);
    expect(canDriveSimulator).toHaveBeenCalledTimes(1);
    expect(rec.saved).toHaveLength(0);
  });
});

describe("the history read is retried too — it is not only coaching", () => {
  it("a lost history read no longer re-awards the one-time first-pass bonus", async () => {
    // `previouslyPassed` comes from this read. Swallowed, it reads as „never
    // passed before", and gamification is told `firstPass: true` for a lesson
    // the student already passed — the achievement-shaped double credit the
    // catch block only accepted because it was thought rare.
    const history: SimSessionListRow[] = [
      {
        id: "sess-old",
        lessonId: "l0-free-drive",
        finishedAt: new Date(),
        score: 0,
        passed: true,
        rubricStars: null,
      },
    ];
    const rec = installStore({ listThrows: [poolAcquireTimeout(), null], history });

    await finishLessonAction(passingDrive());

    expect(rec.listAttempts).toBe(2);
    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity.mock.calls[0]?.[1]).toMatchObject({ firstPass: false });
  });

  it("a first pass is still a first pass — the flag was not pinned to false", async () => {
    // Vacuity guard on the test above: if `firstPass` had simply been hardcoded
    // off, that test would pass while every student lost the bonus forever.
    installStore({ history: [] });

    await finishLessonAction(passingDrive());

    expect(recordActivity.mock.calls[0]?.[1]).toMatchObject({ firstPass: true });
  });
});
