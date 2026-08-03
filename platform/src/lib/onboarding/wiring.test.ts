import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NOTHING WROTE THE COLUMNS.
 *
 * User.examDate, User.dailyGoalMin and User.onboardedAt existed — the
 * migration landed, prismaSchemaContract.test.ts pinned their shape — and not
 * one line of product code ever put a value in them. A column nobody writes is
 * indistinguishable from a column nobody added, and the cost was the exam
 * date: kept in one browser, never sent to the server, so „изпитът ти е след
 * 6 дни“ was a message the product could not send to anybody.
 *
 * The service-level tests prove the write WORKS. This file proves it is
 * CONNECTED — that each of the flow's three answers, and the skip, still reach
 * it. There is no DOM environment configured for vitest (see vitest.config.ts:
 * environment "node"), so the connection is asserted at the source, the same
 * way prismaSchemaContract.test.ts and tsconfigHygiene.test.ts assert theirs.
 */

const SRC = join(process.cwd(), "src");
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8");

const flow = read("components", "onboarding", "OnboardingFlow.tsx");
const action = read("app", "onboarding", "actions.ts");
const page = read("app", "onboarding", "page.tsx");
const countdown = read("components", "dashboard", "ExamCountdown.tsx");

describe("the onboarding flow reaches the server", () => {
  it("imports the server action at all", () => {
    expect(
      flow,
      "the flow writes localStorage only — which is the whole defect",
    ).toMatch(/from\s+"@\/app\/onboarding\/actions"/);
    expect(flow).toMatch(/saveOnboardingAction/);
  });

  it("persists every answer, not just the ones that are easy", () => {
    // Each of the three call sites the flow has. If a future edit drops one,
    // the answer silently goes back to being device-local.
    for (const [fn, field] of [
      ["submitExamDate", "examDate"],
      ["submitGoal", "dailyGoalMin"],
      ["finish", "completed"],
    ] as const) {
      const body = flow.slice(flow.indexOf(`function ${fn}(`));
      const end = body.indexOf("\n  }");
      expect(
        body.slice(0, end),
        `${fn} does not persist ${field} to the row`,
      ).toMatch(new RegExp(`persist\\(\\{[^}]*${field}`));
    }
  });

  it("stamps onboardedAt from the SKIP path too", () => {
    // „Пропусни" calls finish(). A student who skipped WAS asked, and if that
    // is not recorded the flow re-asks them forever and activation cannot be
    // counted.
    expect(flow).toMatch(/onClick=\{finish\}/);
    expect(flow.slice(flow.indexOf("function finish("))).toMatch(
      /persist\(\{\s*completed:\s*true/,
    );
  });

  it("does not await the write in front of a student", () => {
    // A preferences write must never stand between „20 минути“ and the next
    // question. Next dispatches actions sequentially per client anyway.
    expect(flow).toMatch(/startTransition\(/);
    expect(flow).not.toMatch(/await\s+saveOnboardingAction/);
  });
});

describe("the action is an untrusted entry point", () => {
  it("is a server action", () => {
    expect(action.trimStart().startsWith('"use server"')).toBe(true);
  });

  it("takes identity from the session and never from the payload", () => {
    expect(action).toMatch(/getSessionUser\(\)/);
    // A user id in the argument list is the bug where anyone can write anyone
    // else's exam date.
    expect(action).not.toMatch(/userId\s*[:,]/);
  });

  it("is metered, like every other public POST in this app", () => {
    expect(action).toMatch(/consumeUserRateLimit\(/);
    expect(action).toMatch(/RATE_LIMITS\.onboarding/);
  });
});

describe("the read side", () => {
  it("stops re-asking a student who already answered on another device", () => {
    expect(page).toMatch(/readOnboarding\(/);
    expect(page).toMatch(/redirect\("\/dashboard"\)/);
  });

  it("fills a cold device's mirror instead of showing it nothing", () => {
    expect(countdown).toMatch(/isMirrorCold\(\)/);
    expect(countdown).toMatch(/fillMirrorFromServer\(/);
  });

  it("keeps that read off the dashboard's three-query render path", () => {
    // lib/dashboard/queryBudget.test.ts pins the render at six queries total.
    // The countdown asks in an effect, once per device, and never during the
    // server render.
    expect(countdown).toMatch(/useEffect\(/);
    const data = read("lib", "dashboard", "data.ts");
    expect(data).not.toMatch(/readOnboarding|onboarding\/(service|store)/);
  });
});
