/**
 * THE CLASSROOM'S MONEY GATE.
 *
 * `FREE_TUTOR_LIFETIME_MESSAGES` was enforced at exactly ONE call site — the
 * /tutor page and its action — while `askTeacher` → `answerInterruption` →
 * `askTutor` reached the same model without ever asking. The pack allowance
 * inside `askTutor` does not close it: `checkTutorPackAllowance` returns
 * `allowanceNotApplicable()` for an account with no purchase, because it
 * answers „has this BUYER used up the pack?" and not „may this NON-buyer ask
 * at all?". So a free account was bounded only by the tutor's 30/day cost
 * guard and the global daily ceiling — and registration is free, so it
 * multiplied by accounts, against a €12.99 pack that sells „AI Учител — пълен
 * достъп" as the thing you are paying for.
 *
 * The first assertion below calls `askTeacher` as a spent-out free account and
 * demands that `askTutor` was NOT reached. On the code before this fix it is
 * reached, and the test is red.
 *
 * The rest of the battery is the other half of the requirement, and it is not
 * padding: the gate must close the MODEL path and nothing else. Two of the
 * four interruption paths cost nothing — a board command, and an authored
 * answer read verbatim out of the content bank — and a gate that took those
 * away from every free student after five questions would be a product
 * regression bought for $0 of savings.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/lib/content/loader";
import type { SessionUser } from "@/modules/auth";
import {
  FREE_TUTOR_LIFETIME_MESSAGES,
  InMemoryPaymentsStore,
  setPaymentsStore,
} from "@/modules/payments";
import type { AskChip, Beat } from "@/modules/lesson";
import type { TutorMessage } from "@/modules/tutor";

// ---------------------------------------------------------------------------
// The seams. Identity, the tutor's model call and its thread are mocked; the
// content bank, the lesson engine and the payments rule are all REAL, because
// they are the things the gate has to agree with.
// ---------------------------------------------------------------------------

const requireUser = vi.fn<() => Promise<SessionUser>>();
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  requireUser: () => requireUser(),
}));

const askTutor = vi.fn();
const getThread = vi.fn();
vi.mock("@/modules/tutor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/tutor")>()),
  askTutor: (...args: unknown[]) => askTutor(...args),
  getThread: (...args: unknown[]) => getThread(...args),
  // ANTHROPIC_API_KEY is empty in this repo, so the real `isTutorEnabled()` is
  // false and the model path is unreachable — which would make this whole file
  // pass on the broken code. Forced true: this is the leak's live condition.
  isTutorEnabled: () => true,
}));

// The classroom quiz's mastery write. Not under test, and it is the front door
// to Prisma.
vi.mock("@/modules/gamification", () => ({ trackActivity: vi.fn() }));

const { askTeacher } = await import("./actions");
const { allLessons, resetLessonCache, resolveBeat } = await import("@/modules/lesson");

resetLessonCache();
const LESSONS = allLessons();

// ---------------------------------------------------------------------------
// Fixtures out of the real catalogue
// ---------------------------------------------------------------------------

interface Spot {
  lessonId: string;
  beatId: string;
  chips: AskChip[];
}

function spotWhere(pick: (beat: Beat, chips: AskChip[]) => boolean): Spot {
  for (const lesson of LESSONS) {
    for (const beat of lesson.beats) {
      const resolved = resolveBeat(lesson.id, beat.id);
      if (resolved === null) continue;
      if (pick(beat, resolved.chips)) {
        return { lessonId: lesson.id, beatId: beat.id, chips: resolved.chips };
      }
    }
  }
  throw new Error("no matching beat in the catalogue");
}

/** Any beat at all — free text is answerable (or refusable) on every one. */
const ANY = spotWhere(() => true);
/** A beat whose chips include a board COMMAND — the $0 player path. */
const BOARD = spotWhere((_, chips) => chips.some((c) => c.kind === "board"));
/**
 * A beat that carries a rule code AND an `ask` chip: the rule catalogue is
 * where the teacher's authored answers live, so this is a press that must keep
 * working after the trial is gone.
 */
const AUTHORED = spotWhere(
  (beat, chips) => beat.ruleCodes.length > 0 && chips.some((c) => c.kind === "ask"),
);

function askChipOf(spot: Spot): AskChip {
  const chip = spot.chips.find((c) => c.kind === "ask");
  if (chip === undefined) throw new Error("no ask chip");
  return chip;
}

function boardChipOf(spot: Spot): AskChip {
  const chip = spot.chips.find((c) => c.kind === "board");
  if (chip === undefined) throw new Error("no board chip");
  return chip;
}

// ---------------------------------------------------------------------------
// The account under test
// ---------------------------------------------------------------------------

const USER_ID = "student-1";

let store: InMemoryPaymentsStore;

/** `n` persisted questions, exactly as the tutor store records an exchange. */
function thread(n: number): { threadId: string | null; messages: TutorMessage[] } {
  const messages: TutorMessage[] = [];
  for (let i = 0; i < n; i++) {
    messages.push({ role: "user", content: `въпрос ${i}`, ts: 1_000 + i });
    messages.push({ role: "assistant", content: `отговор ${i}`, ts: 1_001 + i });
  }
  return { threadId: n === 0 ? null : "t1", messages };
}

function signIn(patch: Partial<SessionUser> = {}): void {
  requireUser.mockResolvedValue({
    id: USER_ID,
    email: "student@example.com",
    name: "Стоян",
    isAdmin: false,
    ...patch,
  } as SessionUser);
}

async function grantCore(userId: string): Promise<void> {
  await store.createEntitlement({
    userId,
    pack: "core",
    purchasedAt: new Date("2026-06-01T00:00:00.000Z"),
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    provider: "stripe",
    providerRef: `cs_test_${userId}`,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  store = new InMemoryPaymentsStore();
  setPaymentsStore(store);
  signIn();
  getThread.mockResolvedValue(thread(0));
  askTutor.mockResolvedValue({
    reply: "Отговор от модела.",
    citations: [{ act: "ЗДвП", ref: "чл. 5" }],
    limited: false,
  });
});

afterEach(() => setPaymentsStore(null));

// ---------------------------------------------------------------------------

describe("askTeacher — the free-trial gate the classroom did not have", () => {
  it("does NOT reach the model for a free account whose lifetime trial is spent", async () => {
    getThread.mockResolvedValue(thread(FREE_TUTOR_LIFETIME_MESSAGES));

    const answer = await askTeacher(
      ANY.lessonId,
      ANY.beatId,
      "а какво става ако колата пред мен спре внезапно на моста",
      null,
      0,
    );

    // THE ASSERTION. Before the fix this is 1 — a free account spending model
    // tokens through a route that never asked payments anything.
    expect(askTutor).not.toHaveBeenCalled();
    expect(answer.source).toBe("capped");
    expect(answer.debited).toBe(false);
  });

  it("counts the trial from the PERSISTED thread, for THIS user", async () => {
    getThread.mockResolvedValue(thread(FREE_TUTOR_LIFETIME_MESSAGES));
    await askTeacher(ANY.lessonId, ANY.beatId, "въпрос по темата за завоите", null, 0);
    expect(getThread).toHaveBeenCalledWith(USER_ID);
  });

  it("still serves a free account that has questions left", async () => {
    getThread.mockResolvedValue(thread(FREE_TUTOR_LIFETIME_MESSAGES - 1));
    const answer = await askTeacher(
      ANY.lessonId,
      ANY.beatId,
      "а какво става ако колата пред мен спре внезапно на моста",
      null,
      0,
    );
    expect(askTutor).toHaveBeenCalledTimes(1);
    expect(answer.source).toBe("model");
  });

  it("lifts the trial for an account with an active pack", async () => {
    await grantCore(USER_ID);
    getThread.mockResolvedValue(thread(FREE_TUTOR_LIFETIME_MESSAGES * 10));
    const answer = await askTeacher(
      ANY.lessonId,
      ANY.beatId,
      "а какво става ако колата пред мен спре внезапно на моста",
      null,
      0,
    );
    expect(askTutor).toHaveBeenCalledTimes(1);
    expect(answer.source).toBe("model");
  });

  it("another student's pack does not lift this student's trial", async () => {
    await grantCore("someone-else");
    getThread.mockResolvedValue(thread(FREE_TUTOR_LIFETIME_MESSAGES));
    await askTeacher(ANY.lessonId, ANY.beatId, "въпрос по темата за завоите", null, 0);
    expect(askTutor).not.toHaveBeenCalled();
  });

  it("serves an admin without a purchase (server-resolved role)", async () => {
    signIn({ isAdmin: true });
    getThread.mockResolvedValue(thread(FREE_TUTOR_LIFETIME_MESSAGES * 10));
    await askTeacher(
      ANY.lessonId,
      ANY.beatId,
      "а какво става ако колата пред мен спре внезапно на моста",
      null,
      0,
    );
    expect(askTutor).toHaveBeenCalledTimes(1);
  });
});

describe("what the gate must NOT close", () => {
  it("keeps board commands free — and does not even read the thread for one", async () => {
    getThread.mockResolvedValue(thread(FREE_TUTOR_LIFETIME_MESSAGES));
    const chip = boardChipOf(BOARD);

    const answer = await askTeacher(BOARD.lessonId, BOARD.beatId, chip.labelBg, chip.id, 0);

    expect(answer.source).toBe("board");
    expect(answer.boardCommand).toBeDefined();
    expect(askTutor).not.toHaveBeenCalled();
    // „Покажи го пак" is a button a student presses forty times. A quota read
    // per press would be a database round trip for a $0 UI command.
    expect(getThread).not.toHaveBeenCalled();
  });

  it("keeps AUTHORED answers free after the trial is spent — the $0 path survives", async () => {
    getThread.mockResolvedValue(thread(FREE_TUTOR_LIFETIME_MESSAGES));
    const chip = askChipOf(AUTHORED);

    const answer = await askTeacher(
      AUTHORED.lessonId,
      AUTHORED.beatId,
      chip.labelBg,
      chip.id,
      0,
    );

    expect(answer.source).toBe("authored");
    expect(answer.bodyBg.length).toBeGreaterThan(0);
    expect(askTutor).not.toHaveBeenCalled();
  });
});

describe("what the spent-out student is told", () => {
  it("names the boundary, keeps teaching, and offers a real destination (THEO-4)", async () => {
    getThread.mockResolvedValue(thread(FREE_TUTOR_LIFETIME_MESSAGES));
    const answer = await askTeacher(
      ANY.lessonId,
      ANY.beatId,
      "а какво става ако колата пред мен спре внезапно на моста",
      null,
      0,
    );

    // Not a bare „нямаш достъп": it says the number, says what still works,
    // and points somewhere the student can actually press.
    expect(answer.bodyBg).toContain(String(FREE_TUTOR_LIFETIME_MESSAGES));
    expect(answer.bodyBg.length).toBeGreaterThan(60);
    expect(answer.offer?.href).toBe("/pricing");
  });

  it("does not reuse the per-beat wording, which promises a return that never comes", async () => {
    getThread.mockResolvedValue(thread(FREE_TUTOR_LIFETIME_MESSAGES));
    const spent = await askTeacher(
      ANY.lessonId,
      ANY.beatId,
      "а какво става ако колата пред мен спре внезапно на моста",
      null,
      0,
    );
    // The same `capped` source a student gets from the per-beat budget, but a
    // different sentence: one of them comes back next beat, the other never
    // does without a purchase.
    getThread.mockResolvedValue(thread(0));
    const perBeat = await askTeacher(
      ANY.lessonId,
      ANY.beatId,
      "а какво става ако колата пред мен спре внезапно на моста",
      null,
      99,
    );
    expect(perBeat.source).toBe("capped");
    expect(spent.bodyBg).not.toBe(perBeat.bodyBg);
    expect(perBeat.offer?.href).not.toBe("/pricing");
  });
});
