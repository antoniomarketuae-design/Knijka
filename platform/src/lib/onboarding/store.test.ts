import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOnboardingStore, setOnboardingStore } from "./store";

/** The statement the onboarding write really issues, and nothing else. */

const h = vi.hoisted(() => ({
  updateManyArgs: [] as Record<string, unknown>[],
  findUniqueArgs: [] as Record<string, unknown>[],
  row: null as Record<string, unknown> | null,
  updateShouldThrow: false,
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      updateMany: async (args: Record<string, unknown>) => {
        h.updateManyArgs.push(args);
        return { count: 1 };
      },
      findUnique: async (args: Record<string, unknown>) => {
        h.findUniqueArgs.push(args);
        return h.row;
      },
      update: async () => {
        if (h.updateShouldThrow) throw new Error("P2025");
        throw new Error(
          "user.update throws P2025 when the row is gone — use updateMany",
        );
      },
    },
  },
}));

beforeEach(() => {
  h.updateManyArgs.length = 0;
  h.findUniqueArgs.length = 0;
  h.row = null;
  setOnboardingStore(null); // use the real Prisma-backed store
});

afterEach(() => setOnboardingStore(null));

describe("the onboarding write", () => {
  it("survives a row that is no longer there", async () => {
    // A student can finish the flow in a tab they left open across an account
    // deletion. `update` would raise P2025 and turn a preferences write into a
    // 500 on the way to the dashboard; updateMany reports zero rows, which is
    // the correct answer.
    await getOnboardingStore().save("u-1", { dailyGoalMin: 20 });
    expect(h.updateManyArgs).toHaveLength(1);
    expect(h.updateManyArgs[0]).toEqual({
      where: { id: "u-1" },
      data: { dailyGoalMin: 20 },
    });
  });

  it("carries only the columns the step actually answered", async () => {
    await getOnboardingStore().save("u-1", { examDate: null });
    const data = (h.updateManyArgs[0] as { data: Record<string, unknown> }).data;
    // „Още нямам дата“ is an explicit NULL…
    expect(data).toHaveProperty("examDate", null);
    // …while the goal this step said nothing about must not be blanked.
    expect(Object.keys(data)).toEqual(["examDate"]);
  });

  it("reads exactly the three columns, never the whole user row", async () => {
    h.row = { examDate: null, dailyGoalMin: 30, onboardedAt: null };
    const row = await getOnboardingStore().get("u-1");
    expect(row).toEqual({ examDate: null, dailyGoalMin: 30, onboardedAt: null });
    expect(h.findUniqueArgs[0]).toEqual({
      where: { id: "u-1" },
      // passwordHash and email have no business travelling for a countdown.
      select: { examDate: true, dailyGoalMin: true, onboardedAt: true },
    });
  });

  it("returns null for a user that does not exist", async () => {
    h.row = null;
    expect(await getOnboardingStore().get("ghost")).toBeNull();
  });
});
