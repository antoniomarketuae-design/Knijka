/**
 * The two call sites that turn hazard training from a compiled module into a
 * running feature.
 *
 * The item engine and its delivery layer are deliberately not allowed to import
 * each other (@/modules/hazard-play engine.ts explains the inversion), and
 * `judge()` deliberately never learns who is watching. Both gaps are closed
 * from OUTSIDE, by the surface — which means neither is covered by either
 * module's own tests, and either one can be dropped without a single red line
 * anywhere. That is what this file nails shut:
 *
 *  1. REGISTRATION. Importing the hazard server action must be enough for the
 *     REAL engine to be installed. Without it `hasHazardEngine()` is false in a
 *     live server, every run fails with NO_ITEMS, and the section quietly
 *     renders „подготвя се" — a wiring gap that looks exactly like a content gap.
 *  2. THE LEARNER-MODEL FOLD. Finishing a run must feed the same Progress rows
 *     practice, exams and the simulator write to. A differentiator that keeps
 *     its score in its own corner is a silo, and a silo that was never wired
 *     looks identical to one nobody has trained on yet.
 *
 * The fold is asserted through the ACTION rather than through
 * recordHazardOutcomes, because the unit test for that function already passes
 * today: the defect being guarded is nobody calling it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HazardBank, HazardItemSource } from "@/modules/hazard";
import type {
  HazardDealtItem,
  HazardEngine,
  HazardJudgement,
} from "@/modules/hazard-play";

const requireUser = vi.fn<() => Promise<{ id: string; isAdmin: boolean }>>();
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  requireUser: () => requireUser(),
}));

// Stubbed wholesale rather than spied on: @/modules/learning is the front door
// to the content repo and Prisma, and what is under test is that the call
// HAPPENS — not what the learner model then does with it.
const recordSimObservations = vi.fn();
vi.mock("@/modules/learning", () => ({
  recordSimObservations: (...args: unknown[]) => recordSimObservations(...args),
}));

const { startHazardRunAction, submitHazardReactionAction } = await import("./actions");
const { HAZARD_ENGINE_VERSION, buildHazardBank, setHazardBank } = await import(
  "@/modules/hazard"
);
const {
  InMemoryHazardRunStore,
  getHazardEngine,
  hasHazardEngine,
  setHazardEngine,
  setHazardRunStore,
} = await import("@/modules/hazard-play");

/**
 * Read at import time, BEFORE any test swaps in a fake: this is the state a
 * cold server process is in once it has loaded the action module, which is the
 * only state the registration assertion is about.
 */
const engineAtImport = hasHazardEngine() ? getHazardEngine() : null;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER = "user-1";

/** Short enough that a submit sent immediately is physically plausible. */
const CLIP_SEC = 2;

/**
 * PEDESTRIAN_CROSSING_TOO_FAST is опасна and carries `c-crosswalk-yield` in the
 * rule catalog, so a missed clip must arrive at the learner model softened one
 * step, to основна (@/modules/hazard learningFeed.ts).
 */
function itemSource(id: string): HazardItemSource {
  const slug = id.replace(/^hz-/, "");
  return {
    id,
    status: "approved",
    clip: {
      id: `sc-${slug}__m0`,
      templateId: `sc-${slug}`,
      mistakeIndex: 0,
      tracePath: `content/traces/sc-${slug}/mistake-0.trace.json`,
    },
    clipStartSec: 6,
    faultSec: 14,
    windowOpenSec: 4,
    cutSec: 8,
    difficulty: 2,
    titleBg: "Заглавие",
    briefBg: "Караш по улица.",
    hazardBg: "Дете зад паркиран бус.",
    developingBg: "Топка излиза на платното преди детето.",
    violationCode: "PEDESTRIAN_CROSSING_TOO_FAST",
    lawRefEcho: "ЗДвП чл. 119",
    notesBg: "",
  };
}

/** The observation a missed PEDESTRIAN_CROSSING_TOO_FAST clip must produce. */
const SOFTENED_MISS = {
  conceptId: "c-crosswalk-yield",
  kind: "violation",
  severity: "osnovna",
};

/**
 * Deals the ids it is given and calls every clip missed. A fake rather than the
 * shipped engine because the shipped bank has no APPROVED item yet — approval
 * is a human watching each cut, and it is deliberately not something a test may
 * grant itself.
 */
function fakeEngine(itemIds: string[]): HazardEngine {
  return {
    version: "fake-1",
    async deal(): Promise<HazardDealtItem[]> {
      return itemIds.map((itemId) => ({
        itemId,
        card: {
          itemId,
          clipSrc: `/clips/${itemId}.webm`,
          posterSrc: null,
          durationSec: CLIP_SEC,
          titleBg: "Заглавие",
          briefBg: "Караш по улица.",
        },
      }));
    },
    async judge(): Promise<HazardJudgement> {
      return {
        verdict: "missed",
        points: 0,
        maxPoints: 5,
        reactionAtSec: null,
        windowStartSec: 4,
        windowEndSec: 8,
        hazardAtSec: 8,
        hazardBg: "Дете зад паркиран бус.",
        developingBg: "Топка излиза на платното преди детето.",
        correctiveBg: "Сваляш скоростта още при буса.",
        lawRefs: [{ act: "ЗДвП", ref: "чл. 119" }],
      };
    },
  };
}

/** Never pressed: the student watched the whole clip and saw nothing. */
function submitMissed(runId: string, itemId: string) {
  return submitHazardReactionAction({
    runId,
    itemId,
    pressesMediaSec: [],
    watchedToSec: CLIP_SEC,
  });
}

beforeEach(() => {
  requireUser.mockResolvedValue({ id: USER, isAdmin: false });
  setHazardRunStore(new InMemoryHazardRunStore());
});

afterEach(() => {
  // The real engine is restored rather than nulled: the first assertion in this
  // file is about what a loaded server process holds, and leaving the seam empty
  // would make that untrue for whatever suite runs next in this worker.
  setHazardEngine(engineAtImport);
  setHazardBank(null);
  setHazardRunStore(null);
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------

describe("engine registration", () => {
  it("installs the REAL item engine merely by loading the server action", () => {
    expect(engineAtImport).not.toBeNull();
    // Not merely "something is registered": the version tag is stamped onto
    // every run row, so a stand-in here would silently poison the data the
    // safety claim is eventually argued from.
    expect(engineAtImport?.version).toBe(HAZARD_ENGINE_VERSION);
  });
});

describe("the learner-model fold", () => {
  it("feeds a finished run into the same Progress rows practice and the sim write", async () => {
    setHazardBank(buildHazardBank({ version: 1, items: [itemSource("hz-ped")] }));
    setHazardEngine(fakeEngine(["hz-ped"]));

    const started = await startHazardRunAction("simulator");
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const done = await submitMissed(started.runId, started.item.itemId);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.summary).not.toBeNull();

    expect(recordSimObservations).toHaveBeenCalledTimes(1);
    expect(recordSimObservations).toHaveBeenCalledWith(USER, [SOFTENED_MISS], expect.any(Date));
  });

  it("folds ONCE, at the end — per clip would count one sitting twice", async () => {
    setHazardBank(
      buildHazardBank({
        version: 1,
        items: [itemSource("hz-ped-1"), itemSource("hz-ped-2")],
      }),
    );
    setHazardEngine(fakeEngine(["hz-ped-1", "hz-ped-2"]));

    const started = await startHazardRunAction("simulator");
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const first = await submitMissed(started.runId, "hz-ped-1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.summary).toBeNull();
    expect(recordSimObservations).not.toHaveBeenCalled();

    await submitMissed(started.runId, "hz-ped-2");

    expect(recordSimObservations).toHaveBeenCalledTimes(1);
    expect(recordSimObservations).toHaveBeenCalledWith(
      USER,
      [SOFTENED_MISS, SOFTENED_MISS],
      expect.any(Date),
    );
  });

  it("still returns the reveal when the mastery write is impossible", async () => {
    // The run row is the evidence; mastery is derived from it. A bank that
    // cannot be read at fold time must never cost the student the run they just
    // finished — so the fold is guarded at the call site, not merely inside
    // recordHazardOutcomes (whose own try/catch does not cover the bank read).
    const brokenBank: HazardBank = {
      items: [],
      servable: [],
      byId() {
        throw new Error("bank unreadable");
      },
    };
    setHazardBank(brokenBank);
    setHazardEngine(fakeEngine(["hz-ped"]));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const started = await startHazardRunAction("simulator");
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const done = await submitMissed(started.runId, "hz-ped");

    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.summary?.items).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
