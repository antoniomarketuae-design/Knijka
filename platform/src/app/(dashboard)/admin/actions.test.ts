/**
 * THE FOUR SUPPORT MUTATIONS AS PUBLIC POST ENDPOINTS.
 *
 * modules/admin/__tests__/service.test.ts proves the rules — what a grant may
 * be, what may never be deleted, that every mutation writes a row naming the
 * admin. It says nothing about who is allowed to call them, and these four are
 * the most dangerous endpoints in the product: they hand out paid access, take
 * it away, and delete rows belonging to a minor.
 *
 * A server action is a POST endpoint like any other. Gating only the PAGE would
 * leave all four reachable by anyone who has ever seen the request shape — the
 * exact "a page guard alone leaves the POST endpoints live" failure the kill
 * switch is built around, except here the blast radius is other people's money.
 *
 * So this file asserts the two things the module cannot:
 *   1. a logged-in student gets notFound() and the store is untouched;
 *   2. the admin named in the ledger comes from the SERVER SESSION, and a
 *      forged actorEmail in the form body changes nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryAdminStore,
  setAdminStore,
  ADMIN_GRANT_PROVIDER,
} from "@/modules/admin";

const requireUser = vi.fn();
vi.mock("@/modules/auth", () => ({ requireUser: () => requireUser() }));

/** notFound() and redirect() throw control-flow signals Next catches. */
class NotFound extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`NEXT_REDIRECT:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound();
  },
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

const {
  grantEntitlementAction,
  revokeEntitlementAction,
  restoreFreeExamAction,
  deleteAttemptAction,
} = await import("./actions");

const STUDENT = "u-student";
const EMAIL = "ivan@example.com";
const ADMIN = { id: "u-admin", email: "founder@knijka.ai", name: "F", isAdmin: true };
const NOT_ADMIN = { id: "u-student", email: EMAIL, name: "Иван", isAdmin: false };

let store: InMemoryAdminStore;

/** One form body that satisfies all four actions — each reads what it needs. */
function form(extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("email", EMAIL);
  fd.set("userId", STUDENT);
  fd.set("pack", "core");
  fd.set("entitlementId", "ent-1");
  fd.set("attemptId", "att-1");
  fd.set("reason", "връзката падна на 30-ата секунда");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  store = new InMemoryAdminStore();
  store.users.push({
    id: STUDENT,
    email: EMAIL,
    name: "Иван",
    role: "student",
    createdAt: new Date("2026-07-01T08:00:00Z"),
    freeExamGrants: 0,
  });
  store.entitlements.push({
    id: "ent-1",
    userId: STUDENT,
    pack: "core",
    provider: "stripe",
    providerRef: "cs_test_1",
    purchasedAt: new Date("2026-07-02T08:00:00Z"),
    expiresAt: new Date("2026-11-02T08:00:00Z"),
  });
  store.attempts.push({
    id: "att-1",
    userId: STUDENT,
    startedAt: new Date("2026-07-31T08:00:00Z"),
    finishedAt: null,
    score: null,
    maxScore: 97,
    passed: null,
  });
  setAdminStore(store);
  requireUser.mockResolvedValue(ADMIN);
});

afterEach(() => {
  setAdminStore(null);
  vi.clearAllMocks();
});

const ACTIONS = [
  ["grantEntitlementAction", grantEntitlementAction],
  ["revokeEntitlementAction", revokeEntitlementAction],
  ["restoreFreeExamAction", restoreFreeExamAction],
  ["deleteAttemptAction", deleteAttemptAction],
] as const;

describe("a logged-in student is not support", () => {
  for (const [name, action] of ACTIONS) {
    it(`${name} answers notFound() and changes nothing`, async () => {
      requireUser.mockResolvedValue(NOT_ADMIN);

      await expect(action(form())).rejects.toBeInstanceOf(NotFound);

      // Not merely refused — nothing moved. A refusal that still wrote would
      // be the worst of both: an unauthorised change AND a ledger that says
      // it did not happen.
      expect(store.actions).toEqual([]);
      expect(store.entitlements).toHaveLength(1);
      expect(store.attempts).toHaveLength(1);
      expect(store.users[0].freeExamGrants).toBe(0);
    });
  }

  it("refuses BEFORE reading the form — the id in the body never matters", async () => {
    requireUser.mockResolvedValue(NOT_ADMIN);
    // Somebody else's account id, which is what an attacker would actually
    // send. The gate has to be the session, never the payload.
    await expect(
      grantEntitlementAction(form({ userId: "u-somebody-else" })),
    ).rejects.toBeInstanceOf(NotFound);
    expect(store.actions).toEqual([]);
  });
});

describe("the ledger names the session, not the form", () => {
  it("ignores a forged actorEmail and records the signed-in admin", async () => {
    // The form is attacker-controlled and the audit row is the only account of
    // who did this. If a field in the body could set it, the ledger would be
    // exactly as trustworthy as the person being audited.
    await expect(
      grantEntitlementAction(
        form({ actorEmail: "someone.else@example.com", actorId: "u-nobody" }),
      ),
    ).rejects.toBeInstanceOf(Redirected);

    expect(store.actions).toHaveLength(1);
    expect(store.actions[0].actorEmail).toBe(ADMIN.email);
    expect(store.actions[0].actorId).toBe(ADMIN.id);
    expect(store.actions[0].action).toBe("grant_entitlement");
    expect(store.actions[0].reason).toContain("връзката падна");
    // …and the grant itself is a promo, never a fake purchase.
    expect(store.entitlements.at(-1)?.provider).toBe(ADMIN_GRANT_PROVIDER);
  });

  it("sends the admin back to the dossier they were reading", async () => {
    const err = await restoreFreeExamAction(form()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Redirected);
    const to = (err as Redirected).to;
    // The e-mail survives the mutation, or support loses its place mid-ticket.
    expect(to).toContain(`email=${encodeURIComponent(EMAIL)}`);
    expect(to).toContain("msg=free-exam-restored");
    expect(store.users[0].freeExamGrants).toBe(1);
  });
});

describe("a refused mutation becomes a message, not a stack trace", () => {
  it("reports REASON_REQUIRED and writes nothing", async () => {
    const err = await deleteAttemptAction(form({ reason: "" })).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Redirected);
    expect((err as Redirected).to).toContain("err=REASON_REQUIRED");
    expect(store.actions).toEqual([]);
    expect(store.attempts).toHaveLength(1);
  });

  it("refuses an attempt that belongs to somebody else", async () => {
    const err = await deleteAttemptAction(form({ attemptId: "att-elsewhere" })).catch(
      (e: unknown) => e,
    );
    expect((err as Redirected).to).toContain("err=NOT_FOUND");
    expect(store.attempts).toHaveLength(1);
  });
});
