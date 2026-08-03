/**
 * THE RECEIPT, AND THE RACE THAT SHIPPED BECAUSE NOBODY TESTED IT CONCURRENTLY.
 *
 * Two defects live here, and they are the same defect seen from two sides.
 *
 * 1. Fulfilment wrote an Entitlement and nothing else. `amount_total`,
 *    `currency`, `payment_intent` and `livemode` sit on every Checkout Session
 *    and NOTHING in the product read them, so the four questions any business
 *    must answer from its own database — did this person pay, when, how much,
 *    was it real money — were answerable only from someone else's dashboard.
 *
 * 2. Idempotency was a read followed by a write, with an `await` in between.
 *    The existing suite covered the SEQUENTIAL retry (fulfil, then fulfil
 *    again) and passed — which is exactly why this shipped. The real case is
 *    two SIMULTANEOUS deliveries of one session id, and they are simultaneous
 *    BY DESIGN: Stripe fires the webhook at the same moment it redirects the
 *    buyer to /checkout/return, and both call fulfillCheckout().
 *
 * The comment that used to sit on top of checkout.ts called that duplicate
 * "no security issue, only cosmetic". `checkTutorPackAllowance` multiplied the
 * paid AI-tutor allowance by the entitlement ROW COUNT, so the "cosmetic" row
 * doubled what a EUR 12.99 pack costs in model spend.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fulfillCheckout, type CheckoutSessionLike } from "../checkout";
import { setStripeClient } from "../stripe";
import {
  InMemoryPaymentsStore,
  isUniqueViolation,
  isMissingReferenceViolation,
  setPaymentsStore,
  getPaymentsStore,
  type RecordPurchaseInput,
} from "../store";

const NOW = new Date("2026-07-07T12:00:00.000Z");

function paidSession(patch: Partial<CheckoutSessionLike> = {}): CheckoutSessionLike {
  return {
    id: "cs_test_abc123",
    payment_status: "paid",
    metadata: { userId: "user-1", pack: "core" },
    client_reference_id: "user-1",
    amount_total: 1299,
    currency: "eur",
    payment_intent: "pi_test_abc123",
    livemode: true,
    ...patch,
  };
}

let store: InMemoryPaymentsStore;

beforeEach(() => {
  store = new InMemoryPaymentsStore();
  setPaymentsStore(store);
});

afterEach(() => {
  setPaymentsStore(null);
  setStripeClient(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("fulfillCheckout writes the RECEIPT, not only the grant", () => {
  it("records the money exactly as Stripe reported it", async () => {
    await fulfillCheckout(paidSession(), NOW, "evt_test_1");

    expect(store.payments).toHaveLength(1);
    const receipt = store.payments[0];
    expect(receipt.stripeSessionId).toBe("cs_test_abc123");
    expect(receipt.stripePaymentIntentId).toBe("pi_test_abc123");
    expect(receipt.userId).toBe("user-1");
    expect(receipt.pack).toBe("core");
    expect(receipt.amountCents).toBe(1299);
    expect(receipt.currency).toBe("eur");
    expect(receipt.livemode).toBe(true);
    expect(receipt.status).toBe("paid");
    expect(receipt.rawEventId).toBe("evt_test_1");
  });

  it("NEVER lets a grant exist without its receipt", async () => {
    // The property, stated as the invariant rather than as two assertions:
    // every entitlement fulfilled from Stripe has a Payment row keyed on the
    // same session. They are one transaction precisely so this cannot drift.
    await fulfillCheckout(paidSession({ id: "cs_1" }), NOW);
    await fulfillCheckout(paidSession({ id: "cs_2" }), NOW);

    for (const ent of store.entitlements) {
      expect(
        store.payments.some((p) => p.stripeSessionId === ent.providerRef),
      ).toBe(true);
    }
    expect(store.payments).toHaveLength(2);
  });

  it("writes rawEventId null when /checkout/return fulfilled it — there is no event", async () => {
    // Payment.rawEventId is deliberately NOT a foreign key for this exact
    // case: the return page must be able to write a receipt before any
    // webhook has arrived.
    await fulfillCheckout(paidSession(), NOW);
    expect(store.payments[0].rawEventId).toBeNull();
  });

  it("keeps a 100%-promo session honest: amount 0, not the catalogue price", async () => {
    await fulfillCheckout(
      paidSession({ payment_status: "no_payment_required", amount_total: 0, payment_intent: null }),
      NOW,
    );
    const receipt = store.payments[0];
    expect(receipt.amountCents).toBe(0); // NOT 1299 from PACKS
    expect(receipt.status).toBe("no_payment_required");
    expect(receipt.stripePaymentIntentId).toBeNull();
  });

  it("accepts an EXPANDED payment_intent object, not only the id string", async () => {
    await fulfillCheckout(paidSession({ payment_intent: { id: "pi_expanded" } }), NOW);
    expect(store.payments[0].stripePaymentIntentId).toBe("pi_expanded");
  });

  it("books an unstated livemode against the DECLARED mode, never silently as test", async () => {
    // A real payment recorded livemode=false makes every revenue figure
    // derived from this table wrong, and wrong in the flattering direction.
    vi.stubEnv("STRIPE_MODE", "live");
    await fulfillCheckout(paidSession({ livemode: undefined }), NOW);
    expect(store.payments[0].livemode).toBe(true);
  });

  it("writes no receipt at all for an unpaid session", async () => {
    await fulfillCheckout(paidSession({ payment_status: "unpaid" }), NOW);
    expect(store.payments).toHaveLength(0);
    expect(store.entitlements).toHaveLength(0);
  });
});

describe("CONCURRENT fulfilment of one session — the case route.test.ts never had", () => {
  it("two simultaneous deliveries grant exactly ONE entitlement", async () => {
    // The webhook and /checkout/return, started together, as Stripe starts
    // them. Sequentially this always passed; this is the shape that did not.
    const [a, b] = await Promise.all([
      fulfillCheckout(paidSession(), NOW),
      fulfillCheckout(paidSession(), NOW),
    ]);

    expect(store.entitlements).toHaveLength(1);
    expect(store.payments).toHaveLength(1);

    // One created, one told the truth about losing — never two "created".
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["already-fulfilled", "created"]);
    // Narrowed positively, not by excluding "skipped": FulfillResult also
    // carries "receipt-without-grant", which has no entitlementId precisely
    // because there is no entitlement (see poison-pill.postgres.test.ts).
    if (
      (a.status === "created" || a.status === "already-fulfilled") &&
      (b.status === "created" || b.status === "already-fulfilled")
    ) {
      expect(a.entitlementId).toBe(b.entitlementId);
    }
  });

  it("survives a five-way pile-up (Stripe retries while the buyer reloads)", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => fulfillCheckout(paidSession(), NOW)),
    );
    expect(store.entitlements).toHaveLength(1);
    expect(results.filter((r) => r.status === "created")).toHaveLength(1);
    expect(results.filter((r) => r.status === "already-fulfilled")).toHaveLength(4);
  });

  it("still lets DIFFERENT sessions through concurrently (a repurchase is not a duplicate)", async () => {
    await Promise.all([
      fulfillCheckout(paidSession({ id: "cs_one" }), NOW),
      fulfillCheckout(paidSession({ id: "cs_two" }), NOW),
    ]);
    expect(store.entitlements).toHaveLength(2);
  });

  it("the fake store is itself atomic — otherwise the tests above prove nothing", async () => {
    // Guarding the guard. If InMemoryPaymentsStore ever grows an `await`
    // between its check and its insert, it stops modelling the unique
    // constraint and every concurrency test in this file silently softens.
    const input = (): RecordPurchaseInput => ({
      entitlement: {
        userId: "u",
        pack: "core",
        purchasedAt: NOW,
        expiresAt: null,
        provider: "stripe",
        providerRef: "cs_atomic",
      },
      payment: {
        stripeSessionId: "cs_atomic",
        stripePaymentIntentId: null,
        userId: "u",
        pack: "core",
        amountCents: 1299,
        currency: "eur",
        livemode: false,
        status: "paid",
        rawEventId: null,
      },
    });

    const results = await Promise.all([
      store.recordPurchase(input()),
      store.recordPurchase(input()),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([
      "already-fulfilled",
      "created",
    ]);
    expect(store.entitlements).toHaveLength(1);
  });

  it("agrees with the database about a receipt whose grant is gone", async () => {
    // THE POISON-PILL CONTRACT. Support revoked this student's access: the
    // Entitlement row was deleted and the receipt was deliberately kept. A
    // replay must be REPORTED, and it must grant nothing.
    //
    // The fake cannot REPRODUCE the defect — that needs two tables, one
    // transaction and a rollback, and it is reproduced on real Postgres in
    // poison-pill.postgres.test.ts. What it must not do is DISAGREE about the
    // verdict: every route test in the product runs against this object, so a
    // fake that quietly re-granted here would bless behaviour production
    // cannot perform.
    store.payments.push({
      id: "pay-kept",
      createdAt: NOW,
      stripeSessionId: "cs_revoked",
      stripePaymentIntentId: "pi_revoked",
      userId: "u",
      pack: "core",
      amountCents: 1299,
      currency: "eur",
      livemode: false,
      status: "paid",
      rawEventId: null,
    });

    const result = await store.recordPurchase({
      entitlement: {
        userId: "u",
        pack: "core",
        purchasedAt: NOW,
        expiresAt: null,
        provider: "stripe",
        providerRef: "cs_revoked",
      },
      payment: {
        stripeSessionId: "cs_revoked",
        stripePaymentIntentId: "pi_revoked",
        userId: "u",
        pack: "core",
        amountCents: 1299,
        currency: "eur",
        livemode: false,
        status: "paid",
        rawEventId: "evt_replay",
      },
    });

    expect(result).toEqual({
      status: "receipt-without-grant",
      stripeSessionId: "cs_revoked",
      paymentId: "pay-kept",
    });
    expect(store.entitlements, "the revoke stands").toHaveLength(0);
    expect(store.payments, "and the books are unchanged").toHaveLength(1);
  });

  it("fulfillCheckout passes the state up instead of claiming an entitlement", async () => {
    // "already-fulfilled" carries an entitlementId and every caller reads it
    // as "they have access". This session's student does not, so flattening
    // the two into one status would be a lie told in a type.
    store.payments.push({
      id: "pay-kept",
      createdAt: NOW,
      stripeSessionId: "cs_test_abc123",
      stripePaymentIntentId: "pi_test_abc123",
      userId: "user-1",
      pack: "core",
      amountCents: 1299,
      currency: "eur",
      livemode: true,
      status: "paid",
      rawEventId: null,
    });

    const result = await fulfillCheckout(paidSession(), NOW);

    expect(result).toEqual({
      status: "receipt-without-grant",
      sessionId: "cs_test_abc123",
    });
    expect(store.entitlements).toHaveLength(0);
  });
});

describe("the PRISMA store lets the DATABASE decide, and reads back the winner", () => {
  /** A P2002 exactly as Prisma raises it for a unique-constraint violation. */
  function uniqueViolation(): Error & { code: string } {
    return Object.assign(
      new Error(
        'Unique constraint failed on the fields: ("provider","providerRef")',
      ),
      { code: "P2002" },
    );
  }

  it("recognises P2002 and nothing else", () => {
    expect(isUniqueViolation(uniqueViolation())).toBe(true);
    expect(isUniqueViolation(new Error("db is down"))).toBe(false);
    expect(isUniqueViolation({ code: "P2025" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });

  it("recognises P2003 — 'the account this purchase names is gone' — and nothing else", () => {
    // The erasure half of the poison pill. When the User row is deleted, the
    // Entitlement INSERT dies on Entitlement_userId_fkey BEFORE the Payment
    // INSERT is ever attempted, so this failure never carries a P2002 at all.
    // A fix that matched only unique violations would have left that half of
    // the outage wide open.
    expect(isMissingReferenceViolation({ code: "P2003" })).toBe(true);
    expect(isMissingReferenceViolation(uniqueViolation())).toBe(false);
    expect(isMissingReferenceViolation(new Error("db is down"))).toBe(false);
    expect(isMissingReferenceViolation(null)).toBe(false);
    expect(isMissingReferenceViolation(undefined)).toBe(false);
  });

  it("reports a replay whose grant was ERASED, rather than throwing at the FK", async () => {
    // Cause 2, isolated at the store: the transaction fails with P2003 (no
    // such user), and the receipt is still on file. Nothing may be re-granted
    // — the FK is the erasure being enforced, not an obstacle to work around.
    const findFirst = vi.fn().mockResolvedValue(null);
    const paymentFindUnique = vi
      .fn()
      .mockResolvedValue({ id: "pay-kept", stripeSessionId: "cs_test_abc123" });
    vi.doMock("@/lib/db", () => ({
      db: {
        $transaction: async () => {
          throw Object.assign(
            new Error(
              "Foreign key constraint violated: `Entitlement_userId_fkey`",
            ),
            { code: "P2003" },
          );
        },
        entitlement: { findFirst },
        payment: { findUnique: paymentFindUnique },
      },
    }));

    setPaymentsStore(null);
    const result = await fulfillCheckout(paidSession(), NOW);

    expect(result).toEqual({
      status: "receipt-without-grant",
      sessionId: "cs_test_abc123",
    });
    // The grant's key is not asked again — it is the thing that went missing.
    expect(findFirst).not.toHaveBeenCalled();
    expect(paymentFindUnique).toHaveBeenCalledWith({
      where: { stripeSessionId: "cs_test_abc123" },
      select: { id: true, stripeSessionId: true },
    });
    vi.doUnmock("@/lib/db");
  });

  it("still throws when there is no receipt either — a real loss stays loud", async () => {
    // A purchase we can neither grant nor account for: no entitlement to read
    // back and no receipt on file. Rethrow → 500 → Stripe keeps knocking →
    // the event stays in the dead-letter queue. The fix bought a quiet retry
    // storm, not silence about lost money.
    vi.doMock("@/lib/db", () => ({
      db: {
        $transaction: async () => {
          throw Object.assign(new Error("no such user"), { code: "P2003" });
        },
        entitlement: { findFirst: vi.fn().mockResolvedValue(null) },
        payment: { findUnique: vi.fn().mockResolvedValue(null) },
      },
    }));
    setPaymentsStore(null);
    await expect(fulfillCheckout(paidSession(), NOW)).rejects.toThrow("no such user");
    vi.doUnmock("@/lib/db");
  });

  it("reports the loser of the race as already-fulfilled instead of throwing", async () => {
    const winner = {
      id: "ent-winner",
      userId: "user-1",
      pack: "core",
      purchasedAt: NOW,
      expiresAt: null,
      provider: "stripe",
      providerRef: "cs_test_abc123",
    };
    const findFirst = vi.fn().mockResolvedValue(winner);
    vi.doMock("@/lib/db", () => ({
      db: {
        $transaction: async () => {
          throw uniqueViolation();
        },
        entitlement: { findFirst },
      },
    }));

    setPaymentsStore(null); // fall back to the real PrismaPaymentsStore
    const result = await fulfillCheckout(paidSession(), NOW);

    expect(result).toEqual({ status: "already-fulfilled", entitlementId: "ent-winner" });
    expect(findFirst).toHaveBeenCalledWith({
      where: { provider: "stripe", providerRef: "cs_test_abc123" },
    });
    vi.doUnmock("@/lib/db");
  });

  it("writes the grant and the receipt inside ONE transaction", async () => {
    const create = vi.fn().mockResolvedValue({ id: "ent-1" });
    const paymentCreate = vi.fn().mockResolvedValue({ id: "pay-1" });
    let sawTransaction = false;
    vi.doMock("@/lib/db", () => ({
      db: {
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
          sawTransaction = true;
          return fn({
            entitlement: { create },
            payment: { create: paymentCreate },
          });
        },
      },
    }));

    setPaymentsStore(null);
    await fulfillCheckout(paidSession(), NOW, "evt_1");

    expect(sawTransaction).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(paymentCreate).toHaveBeenCalledTimes(1);
    expect(paymentCreate.mock.calls[0][0].data).toMatchObject({
      stripeSessionId: "cs_test_abc123",
      amountCents: 1299,
      currency: "eur",
      livemode: true,
      rawEventId: "evt_1",
    });
    vi.doUnmock("@/lib/db");
  });

  it("rethrows a non-unique failure — a dead database must not read as delivered", async () => {
    vi.doMock("@/lib/db", () => ({
      db: {
        $transaction: async () => {
          throw new Error("ECONNREFUSED");
        },
      },
    }));
    setPaymentsStore(null);
    await expect(fulfillCheckout(paidSession(), NOW)).rejects.toThrow("ECONNREFUSED");
    vi.doUnmock("@/lib/db");
  });
});

describe("getPaymentsStore falls back to Prisma", () => {
  it("returns a store implementing the money-path surface", () => {
    setPaymentsStore(null);
    const s = getPaymentsStore();
    expect(typeof s.recordPurchase).toBe("function");
    expect(typeof s.findPaymentByIntent).toBe("function");
    expect(typeof s.expireEntitlementsByProviderRef).toBe("function");
    expect(typeof s.recordStripeEvent).toBe("function");
  });
});
