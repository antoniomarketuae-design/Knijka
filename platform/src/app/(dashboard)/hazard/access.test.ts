/**
 * The gate, tested from the outside.
 *
 * Mirrors simulator/access.test.ts, because the audit finding behind that file
 * (C-3: a sold feature with no server-side gate) is exactly what this section
 * could repeat — and would repeat more quietly, since the two FREE doors make
 * „hazard training works without paying" look correct at a glance.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/modules/auth";
import { InMemoryPaymentsStore, setPaymentsStore } from "@/modules/payments";
import { canOpenHazardDoor } from "./access";

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

async function grant(
  userId: string,
  pack: "core" | "premium_sim",
  expiresAt: Date,
): Promise<void> {
  await store.createEntitlement({
    userId,
    pack,
    purchasedAt: new Date("2026-06-01T00:00:00.000Z"),
    expiresAt,
    provider: "stripe",
    providerRef: `cs_test_${userId}_${pack}`,
  });
}

/** Far enough out that no test depends on the wall clock. */
const ACTIVE = new Date("2099-01-01T00:00:00.000Z");
const LAPSED = new Date("2026-01-01T00:00:00.000Z");

afterEach(() => setPaymentsStore(null));

describe("the free doors", () => {
  it("let a student with no pack in — coverage is the whole point of them", async () => {
    freshStore();
    expect(await canOpenHazardDoor(user(), "simulator")).toBe(true);
    expect(await canOpenHazardDoor(user(), "theory")).toBe(true);
  });
});

describe("the paid door", () => {
  it("refuses a free account", async () => {
    freshStore();
    expect(await canOpenHazardDoor(user(), "section")).toBe(false);
  });

  it("admits ANY active pack — the packaging decision is not encoded here", async () => {
    freshStore();
    await grant("user-1", "core", ACTIVE);
    expect(await canOpenHazardDoor(user(), "section")).toBe(true);
  });

  it("admits premium too (premium implies core)", async () => {
    freshStore();
    await grant("user-1", "premium_sim", ACTIVE);
    expect(await canOpenHazardDoor(user(), "section")).toBe(true);
  });

  it("refuses a LAPSED pack — access ends when the access window does", async () => {
    freshStore();
    await grant("user-1", "core", LAPSED);
    expect(await canOpenHazardDoor(user(), "section")).toBe(false);
  });

  it("keys the decision to THIS user, not to whoever bought a pack", async () => {
    freshStore();
    await grant("someone-else", "premium_sim", ACTIVE);
    expect(await canOpenHazardDoor(user(), "section")).toBe(false);
  });

  it("admits an admin without a purchase — the founder rehearses on staging", async () => {
    freshStore();
    expect(await canOpenHazardDoor(user({ isAdmin: true }), "section")).toBe(true);
  });
});
