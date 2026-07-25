import { hashSync } from "bcryptjs";
import { afterEach, describe, expect, it } from "vitest";
import {
  InMemoryAuthStore,
  setAuthStore,
  verifyCredentials,
  type AuthUserRecord,
} from "@/modules/auth";
import { eraseUserAccount, totalErasedRows } from "../erase";
import {
  InMemoryPrivacyStore,
  setPrivacyStore,
  type PrivacyUserRecord,
} from "../store";

const NOW = new Date("2026-07-25T10:00:00.000Z");
const PASSWORD = "parola1234";
// Cost 4 (not the production 12): this test hashes on every case and bcrypt
// at 12 would add seconds for zero extra assurance — the algorithm under test
// is the erasure path, not the KDF's work factor.
const PASSWORD_HASH = hashSync(PASSWORD, 4);

/**
 * One user table, two module fakes.
 *
 * The privacy store and the auth store are handed the SAME array, so a row
 * deleted through the privacy module genuinely disappears from the table that
 * login reads. That is what makes "a deleted user cannot log in" an assertion
 * about behaviour rather than about two independent mocks agreeing.
 */
function seed() {
  const users: PrivacyUserRecord[] = [
    {
      id: "mine",
      email: "mine@mail.bg",
      name: "Иван",
      birthYear: 2009,
      locale: "bg",
      consentAt: new Date("2026-06-01T08:00:00.000Z"),
      createdAt: new Date("2026-06-01T08:00:00.000Z"),
      hasPassword: true,
    },
    {
      id: "other",
      email: "other@mail.bg",
      name: "Мария",
      birthYear: 2008,
      locale: "bg",
      consentAt: new Date("2026-06-02T08:00:00.000Z"),
      createdAt: new Date("2026-06-02T08:00:00.000Z"),
      hasPassword: true,
    },
  ];

  // The auth view of the same rows: identical ids/e-mails, plus the columns
  // login needs. Shares the array so splices are visible on both sides.
  const authUsers = users as unknown as AuthUserRecord[];
  for (const u of authUsers) {
    u.passwordHash = PASSWORD_HASH;
    u.role = "student";
  }

  const privacy = new InMemoryPrivacyStore(users);
  for (const userId of ["mine", "other"]) {
    privacy.progress.push({
      userId,
      conceptId: "c1",
      mastery: 0.5,
      reps: 2,
      lapses: 0,
      dueAt: null,
      updatedAt: NOW,
    });
    privacy.questionAttempts.push(
      {
        userId,
        questionId: "q1",
        context: "practice",
        correct: true,
        points: 1,
        answeredAt: NOW,
      },
      {
        userId,
        questionId: "q2",
        context: "exam",
        correct: false,
        points: 3,
        answeredAt: NOW,
      },
    );
    privacy.examAttempts.push({
      userId,
      startedAt: NOW,
      finishedAt: NOW,
      score: 90,
      maxScore: 97,
      passed: true,
      answers: [],
    });
    privacy.simSessions.push({
      userId,
      lessonId: "l1",
      startedAt: NOW,
      finishedAt: null,
      score: null,
      events: [],
      debrief: null,
    });
    privacy.entitlements.push({
      userId,
      pack: "core",
      purchasedAt: NOW,
      expiresAt: null,
      provider: "stripe",
      providerRef: `cs_${userId}`,
    });
    privacy.gamification.push({
      userId,
      xp: 10,
      level: 1,
      streak: 1,
      lastActiveDay: NOW,
      achievements: [],
    });
    privacy.tutorThreads.push({
      userId,
      createdAt: NOW,
      updatedAt: NOW,
      messages: [],
    });
  }

  setPrivacyStore(privacy);
  setAuthStore(new InMemoryAuthStore(authUsers));
  return { privacy, users };
}

afterEach(() => {
  setPrivacyStore(null);
  setAuthStore(null);
});

describe("eraseUserAccount (GDPR Art. 17)", () => {
  it("removes the user and every dependent row", async () => {
    const { privacy } = seed();

    const result = await eraseUserAccount(
      { userId: "mine", email: "mine@mail.bg", password: PASSWORD },
      NOW,
    );

    expect(result.ok).toBe(true);
    expect(privacy.users.map((u) => u.id)).toEqual(["other"]);

    // Not one orphan left behind in any table.
    expect(privacy.progress.filter((r) => r.userId === "mine")).toEqual([]);
    expect(privacy.questionAttempts.filter((r) => r.userId === "mine")).toEqual([]);
    expect(privacy.examAttempts.filter((r) => r.userId === "mine")).toEqual([]);
    expect(privacy.simSessions.filter((r) => r.userId === "mine")).toEqual([]);
    expect(privacy.entitlements.filter((r) => r.userId === "mine")).toEqual([]);
    expect(privacy.gamification.filter((r) => r.userId === "mine")).toEqual([]);
    expect(privacy.tutorThreads.filter((r) => r.userId === "mine")).toEqual([]);
  });

  it("leaves every other account completely untouched", async () => {
    const { privacy } = seed();

    await eraseUserAccount(
      { userId: "mine", email: "mine@mail.bg", password: PASSWORD },
      NOW,
    );

    expect(privacy.users.find((u) => u.id === "other")).toBeDefined();
    expect(privacy.progress).toHaveLength(1);
    expect(privacy.questionAttempts).toHaveLength(2);
    expect(privacy.examAttempts).toHaveLength(1);
    expect(privacy.simSessions).toHaveLength(1);
    expect(privacy.entitlements).toHaveLength(1);
    expect(privacy.gamification).toHaveLength(1);
    expect(privacy.tutorThreads).toHaveLength(1);
    expect(privacy.questionAttempts.every((r) => r.userId === "other")).toBe(true);
  });

  it("returns a receipt counting what was deleted", async () => {
    seed();

    const result = await eraseUserAccount(
      { userId: "mine", email: "mine@mail.bg", password: PASSWORD },
      NOW,
    );

    expect(result).toMatchObject({
      ok: true,
      receipt: {
        userId: "mine",
        erasedAt: NOW.toISOString(),
        deleted: {
          progress: 1,
          questionAttempts: 2,
          examAttempts: 1,
          simSessions: 1,
          entitlements: 1,
          gamification: 1,
          tutorThreads: 1,
        },
      },
    });
    expect(result.ok && totalErasedRows(result.receipt.deleted)).toBe(8);
  });

  it("a deleted user cannot log in — with the correct password", async () => {
    seed();

    // Sanity: the credentials work BEFORE erasure, so the assertion after it
    // cannot pass for the trivial reason that the fixture was never valid.
    expect(await verifyCredentials("mine@mail.bg", PASSWORD)).toMatchObject({
      id: "mine",
    });

    await eraseUserAccount(
      { userId: "mine", email: "mine@mail.bg", password: PASSWORD },
      NOW,
    );

    expect(await verifyCredentials("mine@mail.bg", PASSWORD)).toBeNull();
    // The erased address must not become an oracle either: the answer is the
    // same "null" a never-registered address gets.
    expect(await verifyCredentials("nobody@mail.bg", PASSWORD)).toBeNull();
    // And the surviving account still logs in — erasure was surgical.
    expect(await verifyCredentials("other@mail.bg", PASSWORD)).toMatchObject({
      id: "other",
    });
  });

  it("refuses a wrong password and deletes nothing", async () => {
    const { privacy } = seed();

    const result = await eraseUserAccount(
      { userId: "mine", email: "mine@mail.bg", password: "gresna-parola" },
      NOW,
    );

    expect(result).toEqual({ ok: false, error: "wrong_password" });
    expect(privacy.users.map((u) => u.id)).toEqual(["mine", "other"]);
    expect(privacy.questionAttempts).toHaveLength(4);
    // Still able to log in afterwards — a failed delete is a no-op, not a lockout.
    expect(await verifyCredentials("mine@mail.bg", PASSWORD)).toMatchObject({
      id: "mine",
    });
  });

  it("refuses an account with no password instead of claiming a wrong one", async () => {
    const { privacy } = seed();
    const row = privacy.users.find((u) => u.id === "mine")!;
    row.hasPassword = false;
    (row as unknown as AuthUserRecord).passwordHash = null;

    const result = await eraseUserAccount(
      { userId: "mine", email: "mine@mail.bg", password: PASSWORD },
      NOW,
    );

    expect(result).toEqual({ ok: false, error: "no_password" });
    expect(privacy.users.map((u) => u.id)).toEqual(["mine", "other"]);
  });

  it("is idempotent — a second submit reports not_found, never a crash", async () => {
    seed();

    const first = await eraseUserAccount(
      { userId: "mine", email: "mine@mail.bg", password: PASSWORD },
      NOW,
    );
    const second = await eraseUserAccount(
      { userId: "mine", email: "mine@mail.bg", password: PASSWORD },
      NOW,
    );

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, error: "not_found" });
  });

  it("cannot be pointed at another account by swapping the e-mail", async () => {
    const { privacy } = seed();

    // Both halves of the identity come from the session in production; if they
    // ever diverged, the id/e-mail cross-check must stop the delete rather
    // than erase whichever row the password happened to match.
    const result = await eraseUserAccount(
      { userId: "mine", email: "other@mail.bg", password: PASSWORD },
      NOW,
    );

    expect(result).toEqual({ ok: false, error: "wrong_password" });
    expect(privacy.users.map((u) => u.id)).toEqual(["mine", "other"]);
  });
});
