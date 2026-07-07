import { afterEach, describe, expect, it } from "vitest";
import {
  addMonths,
  getEntitlements,
  isEntitlementActive,
  summarizeEntitlements,
} from "../entitlements";
import {
  InMemoryPaymentsStore,
  setPaymentsStore,
  type EntitlementRecord,
} from "../store";

const NOW = new Date("2026-07-07T12:00:00.000Z");

let nextId = 1;
function row(patch: Partial<EntitlementRecord>): EntitlementRecord {
  return {
    id: `ent-${nextId++}`,
    userId: "user-1",
    pack: "core",
    purchasedAt: new Date("2026-05-01T00:00:00.000Z"),
    expiresAt: new Date("2026-09-01T00:00:00.000Z"),
    provider: "stripe",
    providerRef: `cs_test_${nextId}`,
    ...patch,
  };
}

afterEach(() => setPaymentsStore(null));

describe("addMonths (expiry math)", () => {
  it("adds plain calendar months preserving the time of day", () => {
    const d = addMonths(new Date("2026-07-07T09:30:15.000Z"), 4);
    expect(d.toISOString()).toBe("2026-11-07T09:30:15.000Z");
  });

  it("rolls over the year", () => {
    const d = addMonths(new Date("2026-10-15T00:00:00.000Z"), 4);
    expect(d.toISOString()).toBe("2027-02-15T00:00:00.000Z");
  });

  it("clamps to the last day of shorter target months (Oct 31 + 4m → Feb 28)", () => {
    const d = addMonths(new Date("2026-10-31T10:00:00.000Z"), 4);
    expect(d.toISOString()).toBe("2027-02-28T10:00:00.000Z");
  });

  it("clamps to Feb 29 in leap years", () => {
    const d = addMonths(new Date("2027-10-31T10:00:00.000Z"), 4);
    expect(d.toISOString()).toBe("2028-02-29T10:00:00.000Z");
  });
});

describe("isEntitlementActive", () => {
  it("is active strictly before expiry and expired AT the expiry instant", () => {
    const expiresAt = new Date(NOW.getTime());
    expect(isEntitlementActive({ expiresAt }, new Date(NOW.getTime() - 1))).toBe(true);
    expect(isEntitlementActive({ expiresAt }, NOW)).toBe(false);
    expect(isEntitlementActive({ expiresAt }, new Date(NOW.getTime() + 1))).toBe(false);
  });

  it("null expiresAt never expires (promo grants)", () => {
    expect(isEntitlementActive({ expiresAt: null }, NOW)).toBe(true);
  });
});

describe("summarizeEntitlements", () => {
  it("no rows → no access", () => {
    expect(summarizeEntitlements([], NOW)).toEqual({
      hasCore: false,
      hasPremium: false,
      activeUntil: null,
    });
  });

  it("active core → hasCore only, activeUntil = its expiry", () => {
    const expiresAt = new Date("2026-09-01T00:00:00.000Z");
    const summary = summarizeEntitlements([row({ pack: "core", expiresAt })], NOW);
    expect(summary).toEqual({ hasCore: true, hasPremium: false, activeUntil: expiresAt });
  });

  it("active premium implies core access", () => {
    const summary = summarizeEntitlements([row({ pack: "premium_sim" })], NOW);
    expect(summary.hasCore).toBe(true);
    expect(summary.hasPremium).toBe(true);
  });

  it("expired rows grant nothing", () => {
    const summary = summarizeEntitlements(
      [
        row({ pack: "core", expiresAt: new Date("2026-07-01T00:00:00.000Z") }),
        row({ pack: "premium_sim", expiresAt: new Date("2026-06-01T00:00:00.000Z") }),
      ],
      NOW,
    );
    expect(summary).toEqual({ hasCore: false, hasPremium: false, activeUntil: null });
  });

  it("activeUntil is the LATEST expiry among active rows", () => {
    const later = new Date("2026-12-01T00:00:00.000Z");
    const summary = summarizeEntitlements(
      [
        row({ pack: "core", expiresAt: new Date("2026-08-01T00:00:00.000Z") }),
        row({ pack: "premium_sim", expiresAt: later }),
      ],
      NOW,
    );
    expect(summary.activeUntil).toEqual(later);
  });

  it("an active never-expiring row wins: activeUntil = null but access granted", () => {
    const summary = summarizeEntitlements(
      [
        row({ pack: "core", expiresAt: new Date("2026-08-01T00:00:00.000Z") }),
        row({ pack: "core", expiresAt: null, provider: "promo", providerRef: null }),
      ],
      NOW,
    );
    expect(summary.hasCore).toBe(true);
    expect(summary.activeUntil).toBeNull();
  });
});

describe("getEntitlements (store-backed)", () => {
  it("reads through the injected store and applies the same rules", async () => {
    const store = new InMemoryPaymentsStore();
    setPaymentsStore(store);
    await store.createEntitlement({
      userId: "user-1",
      pack: "premium_sim",
      purchasedAt: new Date("2026-06-01T00:00:00.000Z"),
      expiresAt: new Date("2026-10-01T00:00:00.000Z"),
      provider: "stripe",
      providerRef: "cs_test_live",
    });

    const summary = await getEntitlements("user-1", NOW);
    expect(summary.hasPremium).toBe(true);
    expect(summary.hasCore).toBe(true);

    const other = await getEntitlements("user-2", NOW);
    expect(other.hasCore).toBe(false);
  });
});
