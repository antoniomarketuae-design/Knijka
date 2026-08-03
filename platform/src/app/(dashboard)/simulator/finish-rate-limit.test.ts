/**
 * S4 — A THROTTLED STUDENT WAS TOLD THEIR DRIVE FAILED TO SAVE.
 *
 * `finishLessonAction` takes a per-user abuse budget (20 saves / 10 min) before
 * it does any work, and when that budget was spent it returned the SAME
 * `SAVE_FAILED` code the database-write failure returns. The shell renders that
 * code as „Сесията не се записа" — a sentence that is false about their data and
 * unactionable besides:
 *
 *   SAVE_FAILED   the write WAS attempted and Postgres refused it. Nothing the
 *                 driver did caused it, nothing they can do fixes it, and the
 *                 drive is genuinely gone.
 *   RATE_LIMITED  the write was never attempted. It is self-clearing, and the
 *                 SAME drive saves normally a few minutes later.
 *
 * The two want opposite behaviour from the reader, which is why one code cannot
 * serve both: told „it failed", the natural thing to do is drive it again
 * immediately — the one action that keeps the budget spent.
 *
 * WHAT IS EXERCISED HERE IS THE REAL LIMITER, not a mock of it: `@/modules/security`
 * is deliberately un-mocked, so the boundary this file claims is the boundary
 * the policy table actually sets. Auth and the entitlement gate are mocked
 * because neither is the subject.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMITS, resetRateLimitState } from "@/modules/security";

const getSessionUser = vi.fn();
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  getSessionUser: () => getSessionUser(),
}));

// The C-3 entitlement gate reads Prisma. Not the subject; every caller here is
// a paid-up driver.
vi.mock("./access", () => ({ canDriveSimulator: async () => true }));

// The action imports the loader for its side effect (parsing the real JSON
// bank). Nothing below reaches the content repo — the budget is refused before
// the wire is even parsed, which is half of what this file asserts.
vi.mock("@/lib/content/loader", () => ({}));

const { finishLessonAction } = await import("./actions");

const USER = { id: "u-driver", email: "ivan@mail.bg", name: "Иван", isAdmin: false };

/**
 * A payload that cannot possibly be graded. Deliberate: the budget is taken
 * BEFORE `gradeFinishWire`, so every call below is refused at the same line, and
 * the code that comes back is the only thing that varies. It also means the
 * assertion „the budget runs out before the grader" is free.
 */
const UNGRADABLE = null;

/** Spend the whole window's budget for `USER`. */
async function spendBudget(): Promise<void> {
  for (let i = 0; i < RATE_LIMITS.simFinish.limit; i++) {
    await finishLessonAction(UNGRADABLE);
  }
}

beforeEach(() => {
  resetRateLimitState();
  getSessionUser.mockResolvedValue(USER);
});

afterEach(() => resetRateLimitState());

describe("finishLessonAction — a spent budget is not a failed save", () => {
  it("answers RATE_LIMITED, never SAVE_FAILED, once the budget is gone", async () => {
    await spendBudget();

    const result = await finishLessonAction(UNGRADABLE);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // THE assertion. `SAVE_FAILED` here is the defect, restated.
    expect(result.code).toBe("RATE_LIMITED");
  });

  it("still answers INVALID_INPUT while budget remains — the codes are not merged", async () => {
    // Vacuity guard: if the action refused everything as RATE_LIMITED the test
    // above would pass while the product told every student to wait.
    const result = await finishLessonAction(UNGRADABLE);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("INVALID_INPUT");
  });

  it("refuses BEFORE grading, so the throttle is a guard and not an amplifier", async () => {
    // The same ungradable payload answers INVALID_INPUT under budget and
    // RATE_LIMITED over it. That difference is only possible if the limiter runs
    // first — a budget taken after the work is decoration.
    expect(await finishLessonAction(UNGRADABLE)).toMatchObject({
      code: "INVALID_INPUT",
    });
    for (let i = 1; i < RATE_LIMITS.simFinish.limit; i++) {
      await finishLessonAction(UNGRADABLE);
    }
    expect(await finishLessonAction(UNGRADABLE)).toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("does not put a whole classroom on one budget", async () => {
    // Keyed on the server session id, not the address: thirty teenagers on one
    // school wi-fi share an IP and share nothing else.
    await spendBudget();
    getSessionUser.mockResolvedValue({ ...USER, id: "u-classmate" });

    expect(await finishLessonAction(UNGRADABLE)).toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("checks the session before the budget, so an expired one still reads as B39", async () => {
    // Ordering that matters to a real student: a drive that ends after the
    // session quietly expired must say „впиши се", not „изчакай малко".
    getSessionUser.mockResolvedValue(null);
    for (let i = 0; i < RATE_LIMITS.simFinish.limit + 1; i++) {
      expect(await finishLessonAction(UNGRADABLE)).toMatchObject({
        code: "NOT_SIGNED_IN",
      });
    }
  });
});

describe("the student reads a sentence about what actually happened", () => {
  const SHELL = readFileSync(
    join(process.cwd(), "src", "components", "sim", "lesson-ui", "LessonPlayShell.tsx"),
    "utf8",
  );
  const TYPES = readFileSync(
    join(process.cwd(), "src", "components", "sim", "lesson-ui", "types.ts"),
    "utf8",
  );

  it("the code exists in the wire type, or the action cannot return it", () => {
    expect(TYPES).toContain('"RATE_LIMITED"');
  });

  it("the footer has a branch of its own for it", () => {
    expect(SHELL).toMatch(/saveResult\.code === "RATE_LIMITED"/);
  });

  it("that branch does NOT say the drive failed to save", () => {
    // The generic fallback is what the defect rendered. It must remain for the
    // codes it is true of and must not be what a throttled student reads.
    //
    // COMMENTS ARE STRIPPED FIRST, and that is not tidiness: the branch's own
    // note quotes the sentence it replaces, so a raw substring scan reports the
    // prose as if it were the copy. It failed exactly that way once.
    const raw = /saveResult\.code === "RATE_LIMITED"[\s\S]{0,2000}?\n\s*: `/.exec(
      SHELL,
    )?.[0];
    expect(raw, "the RATE_LIMITED branch is not where it is expected").toBeTruthy();
    const branch = (raw ?? "").replace(/\/\/[^\n]*/g, "");
    // Vacuity guard on the stripping itself — a regex that ate the whole branch
    // would make every assertion below pass on an empty string.
    expect(branch).toContain("Записа твърде много карания");
    expect(branch).not.toContain("не се записа");
    // …and it says the two things that make it actionable: this is temporary,
    // and the grading on screen is still correct.
    expect(branch).toMatch(/минут/);
    expect(branch).toContain("разборът");
  });

  it("names the real budget, so the wait it asks for is not a guess", () => {
    // If the policy table is ever retuned, this fails rather than letting the
    // copy quietly describe a limit the product no longer has.
    expect(RATE_LIMITS.simFinish.limit).toBe(20);
    expect(RATE_LIMITS.simFinish.windowSec).toBe(600);
    expect(SHELL).toContain("над 20 за десет минути");
  });
});
