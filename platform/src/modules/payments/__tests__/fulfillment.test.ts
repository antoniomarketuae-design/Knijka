import { afterEach, describe, expect, it } from "vitest";
import { fulfillCheckout, type CheckoutSessionLike } from "../checkout";
import { setStripeClient, type StripeCheckoutClient } from "../stripe";
import { InMemoryPaymentsStore, setPaymentsStore } from "../store";

const NOW = new Date("2026-07-07T12:00:00.000Z");

function paidSession(patch: Partial<CheckoutSessionLike> = {}): CheckoutSessionLike {
  return {
    id: "cs_test_abc123",
    payment_status: "paid",
    metadata: { userId: "user-1", pack: "core" },
    client_reference_id: "user-1",
    ...patch,
  };
}

/** Minimal fake of the Stripe SDK slice the module uses. */
function fakeStripe(session: CheckoutSessionLike): StripeCheckoutClient {
  return {
    checkout: {
      sessions: {
        create: async () => {
          throw new Error("not used in these tests");
        },
        // Structural typing: fulfillCheckout only touches the
        // CheckoutSessionLike fields of Stripe.Checkout.Session.
        retrieve: async (id: string) => {
          expect(id).toBe(session.id);
          return session as never;
        },
      },
    },
    webhooks: {
      constructEventAsync: async () => {
        throw new Error("not used in these tests");
      },
    },
  };
}

let store: InMemoryPaymentsStore;

function freshStore(): InMemoryPaymentsStore {
  store = new InMemoryPaymentsStore();
  setPaymentsStore(store);
  return store;
}

afterEach(() => {
  setPaymentsStore(null);
  setStripeClient(null);
});

describe("fulfillCheckout — idempotent entitlement creation", () => {
  it("creates one Entitlement from a paid session (webhook object path)", async () => {
    freshStore();

    const result = await fulfillCheckout(paidSession(), NOW);

    expect(result.status).toBe("created");
    expect(store.entitlements).toHaveLength(1);
    const ent = store.entitlements[0];
    expect(ent.userId).toBe("user-1");
    expect(ent.pack).toBe("core");
    expect(ent.provider).toBe("stripe");
    expect(ent.providerRef).toBe("cs_test_abc123");
    expect(ent.purchasedAt).toEqual(NOW);
    // 4 calendar months of access
    expect(ent.expiresAt?.toISOString()).toBe("2026-11-07T12:00:00.000Z");
  });

  it("is IDEMPOTENT: the same session never grants twice", async () => {
    freshStore();

    const first = await fulfillCheckout(paidSession(), NOW);
    const second = await fulfillCheckout(paidSession(), NOW);
    const third = await fulfillCheckout(
      paidSession(),
      new Date("2026-07-08T00:00:00.000Z"), // webhook retry next day
    );

    expect(first.status).toBe("created");
    expect(second.status).toBe("already-fulfilled");
    expect(third.status).toBe("already-fulfilled");
    if (first.status === "created" && second.status === "already-fulfilled") {
      expect(second.entitlementId).toBe(first.entitlementId);
    }
    expect(store.entitlements).toHaveLength(1);
  });

  it("different sessions DO create separate entitlements (repurchase)", async () => {
    freshStore();

    await fulfillCheckout(paidSession({ id: "cs_test_first" }), NOW);
    await fulfillCheckout(paidSession({ id: "cs_test_second" }), NOW);

    expect(store.entitlements).toHaveLength(2);
  });

  it("skips unpaid sessions (delayed payment methods)", async () => {
    freshStore();

    const result = await fulfillCheckout(
      paidSession({ payment_status: "unpaid" }),
      NOW,
    );

    expect(result).toEqual({ status: "skipped", reason: "not-paid" });
    expect(store.entitlements).toHaveLength(0);
  });

  it("fulfills no_payment_required sessions (100% promo codes)", async () => {
    freshStore();

    const result = await fulfillCheckout(
      paidSession({ payment_status: "no_payment_required" }),
      NOW,
    );

    expect(result.status).toBe("created");
  });

  it("skips sessions without usable metadata", async () => {
    freshStore();

    const noUser = await fulfillCheckout(
      paidSession({ metadata: { pack: "core" }, client_reference_id: null }),
      NOW,
    );
    const badPack = await fulfillCheckout(
      paidSession({ metadata: { userId: "user-1", pack: "yacht" } }),
      NOW,
    );

    expect(noUser).toEqual({ status: "skipped", reason: "missing-metadata" });
    expect(badPack).toEqual({ status: "skipped", reason: "missing-metadata" });
    expect(store.entitlements).toHaveLength(0);
  });

  it("falls back to client_reference_id when metadata.userId is missing", async () => {
    freshStore();

    const result = await fulfillCheckout(
      paidSession({ metadata: { pack: "premium_sim" }, client_reference_id: "user-9" }),
      NOW,
    );

    expect(result.status).toBe("created");
    expect(store.entitlements[0].userId).toBe("user-9");
    expect(store.entitlements[0].pack).toBe("premium_sim");
  });

  it("session-ID path retrieves from the (mocked) Stripe SDK and fulfills", async () => {
    freshStore();
    setStripeClient(fakeStripe(paidSession({ id: "cs_test_by_id" })));

    const result = await fulfillCheckout("cs_test_by_id", NOW);

    expect(result.status).toBe("created");
    expect(store.entitlements[0].providerRef).toBe("cs_test_by_id");
  });
});
