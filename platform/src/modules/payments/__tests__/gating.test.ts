/**
 * The two gates added by audit C-3: the simulator (premium-only) and the AI
 * tutor free trial. Both must refuse a free account, serve an entitled one,
 * and derive that entitlement from a real fulfilled purchase — never from
 * anything a browser could send.
 */

import { afterEach, describe, expect, it } from "vitest";
import { fulfillCheckout, type CheckoutSessionLike } from "../checkout";
import {
  checkTutorQuota,
  FREE_TUTOR_LIFETIME_MESSAGES,
  requireEntitlementForSimulator,
} from "../quota";
import { InMemoryPaymentsStore, setPaymentsStore } from "../store";

const NOW = new Date("2026-07-07T12:00:00.000Z");
const USER = "user-1";

let store: InMemoryPaymentsStore;

function freshStore(): InMemoryPaymentsStore {
  store = new InMemoryPaymentsStore();
  setPaymentsStore(store);
  return store;
}

/** A pack granted directly (promo / test seed), bypassing Stripe. */
async function grant(
  pack: "core" | "premium_sim",
  expiresAt: Date | null = new Date("2026-10-01T00:00:00.000Z"),
): Promise<void> {
  await store.createEntitlement({
    userId: USER,
    pack,
    purchasedAt: new Date("2026-06-01T00:00:00.000Z"),
    expiresAt,
    provider: "stripe",
    providerRef: `cs_test_${pack}`,
  });
}

function paidSession(pack: string): CheckoutSessionLike {
  return {
    id: `cs_test_${pack}_abc`,
    payment_status: "paid",
    metadata: { userId: USER, pack },
    client_reference_id: USER,
  };
}

afterEach(() => setPaymentsStore(null));

describe("requireEntitlementForSimulator (premium-only)", () => {
  it("refuses a free account", async () => {
    freshStore();
    expect(await requireEntitlementForSimulator(USER, NOW)).toBe(false);
  });

  it("refuses the CORE pack — the simulator is the premium delta, not a bonus", async () => {
    freshStore();
    await grant("core");
    expect(await requireEntitlementForSimulator(USER, NOW)).toBe(false);
  });

  it("serves an active premium account", async () => {
    freshStore();
    await grant("premium_sim");
    expect(await requireEntitlementForSimulator(USER, NOW)).toBe(true);
  });

  it("refuses an EXPIRED premium pack", async () => {
    freshStore();
    await grant("premium_sim", new Date("2026-05-01T00:00:00.000Z"));
    expect(await requireEntitlementForSimulator(USER, NOW)).toBe(false);
  });

  it("does not leak across users", async () => {
    freshStore();
    await grant("premium_sim");
    expect(await requireEntitlementForSimulator("someone-else", NOW)).toBe(false);
  });
});

describe("simulator access is derived from a real purchase", () => {
  it("a fulfilled premium Checkout Session — and nothing else — opens the gate", async () => {
    freshStore();
    expect(await requireEntitlementForSimulator(USER, NOW)).toBe(false);

    // The webhook path: a Stripe-verified session object, fulfilled server-side.
    const result = await fulfillCheckout(paidSession("premium_sim"), NOW);
    expect(result.status).toBe("created");

    expect(await requireEntitlementForSimulator(USER, NOW)).toBe(true);
  });

  it("an UNPAID session grants nothing", async () => {
    freshStore();
    const result = await fulfillCheckout(
      { ...paidSession("premium_sim"), payment_status: "unpaid" },
      NOW,
    );
    expect(result).toEqual({ status: "skipped", reason: "not-paid" });
    expect(await requireEntitlementForSimulator(USER, NOW)).toBe(false);
  });

  it("a fulfilled CORE purchase does not open the simulator", async () => {
    freshStore();
    await fulfillCheckout(paidSession("core"), NOW);
    expect(await requireEntitlementForSimulator(USER, NOW)).toBe(false);
  });

  it("access ends when the purchased window does", async () => {
    freshStore();
    // Bought now → 4 months of access (PACK_ACCESS_MONTHS).
    await fulfillCheckout(paidSession("premium_sim"), NOW);
    const dayBefore = new Date("2026-11-06T12:00:00.000Z");
    const dayAfter = new Date("2026-11-08T12:00:00.000Z");
    expect(await requireEntitlementForSimulator(USER, dayBefore)).toBe(true);
    expect(await requireEntitlementForSimulator(USER, dayAfter)).toBe(false);
  });
});

describe("checkTutorQuota (lifetime free trial)", () => {
  it("fresh free user: the full trial", async () => {
    freshStore();
    expect(await checkTutorQuota(USER, 0, NOW)).toEqual({
      allowed: true,
      remaining: FREE_TUTOR_LIFETIME_MESSAGES,
      limit: FREE_TUTOR_LIFETIME_MESSAGES,
      unlimited: false,
    });
  });

  it("counts down and blocks at the limit, never reporting negative remaining", async () => {
    freshStore();
    const last = await checkTutorQuota(USER, FREE_TUTOR_LIFETIME_MESSAGES - 1, NOW);
    expect(last).toMatchObject({ allowed: true, remaining: 1 });

    const spent = await checkTutorQuota(USER, FREE_TUTOR_LIFETIME_MESSAGES, NOW);
    expect(spent).toMatchObject({ allowed: false, remaining: 0 });

    const overspent = await checkTutorQuota(USER, FREE_TUTOR_LIFETIME_MESSAGES + 7, NOW);
    expect(overspent).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("the trial does NOT reset the next day (it is lifetime, not daily)", async () => {
    freshStore();
    const nextDay = new Date("2026-07-08T12:00:00.000Z");
    const spent = await checkTutorQuota(USER, FREE_TUTOR_LIFETIME_MESSAGES, nextDay);
    expect(spent.allowed).toBe(false);
  });

  it("the CORE pack lifts the trial — the tutor is core, not premium", async () => {
    freshStore();
    await grant("core");
    const quota = await checkTutorQuota(USER, 500, NOW);
    expect(quota.allowed).toBe(true);
    expect(quota.unlimited).toBe(true);
    expect(quota.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it("premium implies core, so it lifts the trial too", async () => {
    freshStore();
    await grant("premium_sim");
    expect(await checkTutorQuota(USER, 500, NOW)).toMatchObject({
      allowed: true,
      unlimited: true,
    });
  });

  it("an EXPIRED pack does not lift the trial", async () => {
    freshStore();
    await grant("core", new Date("2026-05-01T00:00:00.000Z"));
    const quota = await checkTutorQuota(USER, FREE_TUTOR_LIFETIME_MESSAGES, NOW);
    expect(quota.unlimited).toBe(false);
    expect(quota.allowed).toBe(false);
  });

  it("a fulfilled core purchase lifts the trial (derived from the purchase)", async () => {
    freshStore();
    expect(
      (await checkTutorQuota(USER, FREE_TUTOR_LIFETIME_MESSAGES, NOW)).allowed,
    ).toBe(false);

    await fulfillCheckout(paidSession("core"), NOW);

    expect(
      (await checkTutorQuota(USER, FREE_TUTOR_LIFETIME_MESSAGES, NOW)).allowed,
    ).toBe(true);
  });
});
