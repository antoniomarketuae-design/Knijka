/**
 * The support surface, and the one property that makes it a support tool
 * rather than an unlogged production write with a nicer font: EVERY mutation
 * leaves a row naming the admin who did it.
 *
 * The scenario driving all of this is in the module header — a free student
 * taps „Започни пробен изпит", their phone drops connection, and
 * requireEntitlementForExam counts STARTED attempts, so their one lifetime
 * free exam is gone. The last describe() block proves the remedy actually
 * lands in the gate that took it away, rather than only in a column.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_GRANT_PROVIDER,
  AdminError,
  deleteStuckAttempt,
  getUserDossier,
  grantEntitlement,
  InMemoryAdminStore,
  restoreFreeExam,
  revokeEntitlement,
  setAdminStore,
  type AdminActor,
} from "..";
import {
  FREE_MOCK_EXAM_LIMIT,
  InMemoryPaymentsStore,
  requireEntitlementForExam,
  setPaymentsStore,
} from "@/modules/payments";
import { EXAM_ATTEMPT_TTL_SEC } from "@/modules/exam";

const ACTOR: AdminActor = { id: "u-admin", email: "founder@knijka.ai" };
const NOW = new Date("2026-08-03T12:00:00Z");
const STUDENT = "u-student";

let store: InMemoryAdminStore;

beforeEach(() => {
  store = new InMemoryAdminStore();
  store.users.push({
    id: STUDENT,
    email: "Ivan.Petrov@example.com",
    name: "Иван",
    role: "student",
    createdAt: new Date("2026-07-01T08:00:00Z"),
    freeExamGrants: 0,
  });
  setAdminStore(store);
});

afterEach(() => {
  setAdminStore(null);
  setPaymentsStore(null);
});

// ---------------------------------------------------------------------------

describe("getUserDossier", () => {
  it("finds the account however the ticket capitalised the address", async () => {
    // A support ticket quotes whatever the phone's keyboard produced.
    const d = await getUserDossier("ivan.petrov@EXAMPLE.com", NOW);
    expect(d.user.id).toBe(STUDENT);
  });

  it("throws USER_NOT_FOUND rather than returning an empty dossier", async () => {
    await expect(getUserDossier("nobody@example.com", NOW)).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
    });
  });

  it("says which entitlements are ACTIVE with the same rule the paywalls use", async () => {
    store.entitlements.push(
      {
        id: "e-live",
        userId: STUDENT,
        pack: "core",
        provider: "stripe",
        providerRef: "cs_1",
        purchasedAt: new Date("2026-07-01T00:00:00Z"),
        expiresAt: new Date("2026-11-01T00:00:00Z"),
      },
      {
        id: "e-dead",
        userId: STUDENT,
        pack: "premium_sim",
        provider: "stripe",
        providerRef: "cs_0",
        purchasedAt: new Date("2026-01-01T00:00:00Z"),
        expiresAt: new Date("2026-05-01T00:00:00Z"),
      },
    );
    const d = await getUserDossier("ivan.petrov@example.com", NOW);
    expect(d.entitlements.find((e) => e.id === "e-live")!.active).toBe(true);
    expect(d.entitlements.find((e) => e.id === "e-dead")!.active).toBe(false);
  });

  it("classifies attempts exactly as the student's own screens do", async () => {
    store.attempts.push(
      {
        id: "a-running",
        userId: STUDENT,
        startedAt: new Date(NOW.getTime() - 600_000),
        finishedAt: null,
        score: null,
        maxScore: 97,
        passed: null,
      },
      {
        id: "a-stuck",
        userId: STUDENT,
        startedAt: new Date(NOW.getTime() - (EXAM_ATTEMPT_TTL_SEC + 60) * 1000),
        finishedAt: null,
        score: null,
        maxScore: 97,
        passed: null,
      },
      {
        id: "a-done",
        userId: STUDENT,
        startedAt: new Date("2026-07-02T09:00:00Z"),
        finishedAt: new Date("2026-07-02T09:35:00Z"),
        score: 90,
        maxScore: 97,
        passed: true,
      },
    );
    const byId = new Map(
      (await getUserDossier("ivan.petrov@example.com", NOW)).attempts.map((a) => [
        a.id,
        a,
      ]),
    );
    expect(byId.get("a-running")!.status).toBe("in-progress");
    // This is the row support is hunting for: unfinishable, and still counted.
    expect(byId.get("a-stuck")!.status).toBe("expired");
    expect(byId.get("a-done")!.status).toBe("completed");
  });

  it("spells the free-exam position out instead of leaving it as arithmetic", async () => {
    store.attempts.push({
      id: "a1",
      userId: STUDENT,
      startedAt: new Date(NOW.getTime() - 4_000_000),
      finishedAt: null,
      score: null,
      maxScore: 97,
      passed: null,
    });
    const d = await getUserDossier("ivan.petrov@example.com", NOW);
    expect(d.freeExam).toEqual({
      attempts: 1,
      grants: 0,
      allowance: FREE_MOCK_EXAM_LIMIT,
      hasFreeExamLeft: false,
    });
  });

  it("rolls up what the tutor has cost this one account", async () => {
    store.tutorThreads.push(
      {
        userId: STUDENT,
        messages: [{ role: "user" }, { role: "assistant" }, { role: "user" }],
        tokensIn: 100,
        tokensOut: 400,
        costMicroUsd: 2_100,
      },
      {
        userId: STUDENT,
        messages: [{ role: "user" }],
        tokensIn: 50,
        tokensOut: 90,
        costMicroUsd: 700,
      },
      {
        userId: "someone-else",
        messages: [{ role: "user" }],
        tokensIn: 9_999,
        tokensOut: 9_999,
        costMicroUsd: 9_999,
      },
    );
    const d = await getUserDossier("ivan.petrov@example.com", NOW);
    expect(d.tutor).toEqual({
      threads: 2,
      questions: 3,
      tokensIn: 150,
      tokensOut: 490,
      costMicroUsd: 2_800,
    });
  });
});

// ---------------------------------------------------------------------------

describe("every mutation writes a row naming the admin", () => {
  it("grant", async () => {
    await grantEntitlement({
      actor: ACTOR,
      userId: STUDENT,
      pack: "core",
      reason: "goodwill: exam ate their free attempt",
      now: NOW,
    });
    expect(store.actions).toHaveLength(1);
    expect(store.actions[0]).toMatchObject({
      actorId: "u-admin",
      actorEmail: "founder@knijka.ai",
      action: "grant_entitlement",
      subjectId: STUDENT,
      reason: "goodwill: exam ate their free attempt",
    });
  });

  it("revoke", async () => {
    store.entitlements.push({
      id: "e1",
      userId: STUDENT,
      pack: "core",
      provider: "stripe",
      providerRef: "cs_1",
      purchasedAt: NOW,
      expiresAt: null,
    });
    await revokeEntitlement({
      actor: ACTOR,
      userId: STUDENT,
      entitlementId: "e1",
      reason: "chargeback received",
    });
    expect(store.actions.map((a) => a.action)).toEqual(["revoke_entitlement"]);
    // The snapshot is the undo: the exact row, reconstructible from the log.
    expect(store.actions[0].detail).toMatchObject({
      pack: "core",
      provider: "stripe",
      providerRef: "cs_1",
    });
  });

  it("restore free exam", async () => {
    await restoreFreeExam({ actor: ACTOR, userId: STUDENT, reason: "dropped connection" });
    expect(store.actions.map((a) => a.action)).toEqual(["reset_free_exams"]);
  });

  it("delete stuck attempt", async () => {
    store.attempts.push({
      id: "a-stuck",
      userId: STUDENT,
      startedAt: new Date(NOW.getTime() - 3 * 24 * 3600 * 1000),
      finishedAt: null,
      score: null,
      maxScore: 97,
      passed: null,
    });
    await deleteStuckAttempt({
      actor: ACTOR,
      userId: STUDENT,
      attemptId: "a-stuck",
      reason: "stuck since Friday",
      now: NOW,
    });
    expect(store.actions.map((a) => a.action)).toEqual(["delete_attempt"]);
    expect(store.actions[0].targetRef).toBe("a-stuck");
    expect(store.actions[0].detail).toMatchObject({ expired: true });
  });

  it("refuses without a stated reason — and writes nothing", async () => {
    for (const reason of ["", "   ", "x"]) {
      await expect(
        grantEntitlement({ actor: ACTOR, userId: STUDENT, pack: "core", reason, now: NOW }),
      ).rejects.toBeInstanceOf(AdminError);
    }
    expect(store.entitlements).toHaveLength(0);
    expect(store.actions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("grantEntitlement", () => {
  it("marks the grant as promo, never as a Stripe purchase", async () => {
    // The provider column is what separates access that was BOUGHT from access
    // that was GIVEN. A grant claiming to be Stripe corrupts every revenue
    // figure derived from this table, permanently and invisibly.
    const { entitlementId, expiresAt } = await grantEntitlement({
      actor: ACTOR,
      userId: STUDENT,
      pack: "premium_sim",
      reason: "beta tester",
      now: NOW,
    });
    const row = store.entitlements.find((e) => e.id === entitlementId)!;
    expect(row.provider).toBe(ADMIN_GRANT_PROVIDER);
    expect(row.provider).not.toBe("stripe");
    // providerRef NULL is what keeps promo grants repeatable under the PARTIAL
    // unique index on (provider, providerRef).
    expect(row.providerRef).toBeNull();
    expect(expiresAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("stays repeatable — two goodwill grants are not a duplicate purchase", async () => {
    await grantEntitlement({ actor: ACTOR, userId: STUDENT, pack: "core", reason: "one", now: NOW });
    await grantEntitlement({ actor: ACTOR, userId: STUDENT, pack: "core", reason: "two", now: NOW });
    expect(store.entitlements).toHaveLength(2);
  });

  it("refuses a pack that does not exist", async () => {
    await expect(
      grantEntitlement({
        actor: ACTOR,
        userId: STUDENT,
        pack: "premium_sim_pro_max",
        reason: "typo in the ticket",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(store.actions).toHaveLength(0);
  });
});

describe("revokeEntitlement", () => {
  it("never touches another student's row, even when handed its id", async () => {
    store.entitlements.push({
      id: "e-other",
      userId: "u-someone-else",
      pack: "core",
      provider: "stripe",
      providerRef: "cs_9",
      purchasedAt: NOW,
      expiresAt: null,
    });
    await expect(
      revokeEntitlement({
        actor: ACTOR,
        userId: STUDENT,
        entitlementId: "e-other",
        reason: "wrong id pasted from the ticket",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.entitlements).toHaveLength(1);
    expect(store.actions).toHaveLength(0);
  });
});

describe("deleteStuckAttempt", () => {
  it("refuses to delete a GRADED attempt — that is the student's record", async () => {
    store.attempts.push({
      id: "a-done",
      userId: STUDENT,
      startedAt: new Date("2026-07-02T09:00:00Z"),
      finishedAt: new Date("2026-07-02T09:35:00Z"),
      score: 90,
      maxScore: 97,
      passed: true,
    });
    await expect(
      deleteStuckAttempt({
        actor: ACTOR,
        userId: STUDENT,
        attemptId: "a-done",
        reason: "student asked",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "NOT_IN_PROGRESS" });
    expect(store.attempts).toHaveLength(1);
    expect(store.actions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("restoreFreeExam actually reaches the gate that took it away", () => {
  /**
   * The end-to-end of the whole feature. A promo Entitlement would also unblock
   * this student, but it hands them the entire pack for a ticket about one lost
   * attempt; deleting the attempt row would also unblock them, but that is
   * their history. This proves the surgical remedy works through the real
   * quota function, not just as a number in a column.
   */
  it("lets a student start again after their one free exam was eaten", async () => {
    const payments = new InMemoryPaymentsStore();
    setPaymentsStore(payments);
    // One started attempt: the exam they never saw.
    payments.examAttemptUserIds.push(STUDENT);

    expect(await requireEntitlementForExam(STUDENT, NOW)).toBe(false);

    const { grants } = await restoreFreeExam({
      actor: ACTOR,
      userId: STUDENT,
      reason: "connection dropped 30s in, never saw a question",
    });
    expect(grants).toBe(1);

    // The admin store moved User.freeExamGrants; the payments store reads the
    // same column in production. Mirror it here so the gate sees the grant.
    payments.freeExamGrants.set(STUDENT, grants);
    expect(await requireEntitlementForExam(STUDENT, NOW)).toBe(true);

    // And exactly one more — the grant buys back one exam, not the pack.
    payments.examAttemptUserIds.push(STUDENT);
    expect(await requireEntitlementForExam(STUDENT, NOW)).toBe(false);
  });
});
