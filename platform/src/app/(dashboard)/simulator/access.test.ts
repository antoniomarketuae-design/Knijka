/**
 * The /simulator route guard (audit C-3). These assertions fail on the
 * pre-fix code, where the page and both server actions called requireUser()
 * and nothing else — i.e. every signed-in account could drive.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/modules/auth";
import { InMemoryPaymentsStore, setPaymentsStore } from "@/modules/payments";
import { canDriveSimulator } from "./access";

let store: InMemoryPaymentsStore;

function freshStore(): InMemoryPaymentsStore {
  store = new InMemoryPaymentsStore();
  setPaymentsStore(store);
  return store;
}

function user(patch: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "user-1",
    email: "student@example.com",
    name: "Стоян",
    isAdmin: false,
    ...patch,
  };
}

async function grantPremium(userId: string): Promise<void> {
  await store.createEntitlement({
    userId,
    pack: "premium_sim",
    purchasedAt: new Date("2026-06-01T00:00:00.000Z"),
    // Far enough out that the test never depends on the wall clock.
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    provider: "stripe",
    providerRef: `cs_test_${userId}`,
  });
}

afterEach(() => setPaymentsStore(null));

describe("canDriveSimulator", () => {
  it("refuses a free account", async () => {
    freshStore();
    expect(await canDriveSimulator(user())).toBe(false);
  });

  it("refuses a CORE-only account — the €12.99 pack does not include the sim", async () => {
    freshStore();
    await store.createEntitlement({
      userId: "user-1",
      pack: "core",
      purchasedAt: new Date("2026-06-01T00:00:00.000Z"),
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      provider: "stripe",
      providerRef: "cs_test_core",
    });
    expect(await canDriveSimulator(user())).toBe(false);
  });

  it("serves an account with an active premium pack", async () => {
    freshStore();
    await grantPremium("user-1");
    expect(await canDriveSimulator(user())).toBe(true);
  });

  it("serves an admin without any purchase (server-resolved role)", async () => {
    freshStore();
    expect(await canDriveSimulator(user({ isAdmin: true }))).toBe(true);
  });

  it("keys the decision to THIS user, not to whoever bought a pack", async () => {
    freshStore();
    await grantPremium("someone-else");
    expect(await canDriveSimulator(user())).toBe(false);
  });
});
