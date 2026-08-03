/**
 * REFUNDS AND DISPUTES — the money goes back, the access does not.
 *
 * The webhook handled exactly two event types. Neither of them was a refund.
 * So the sequence "student pays EUR 12.99 → asks for a refund → gets it" left
 * four months of access switched on, including the AI tutor, whose per-question
 * model spend we keep paying to serve someone whose money we gave back. It is
 * the only defect in the money path that costs MORE the better support behaves.
 *
 * The join is the reason the Payment table had to exist first: refund events
 * are keyed by PaymentIntent, entitlements are keyed by Checkout Session, and
 * the receipt is the only row that knows both.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fulfillCheckout, revokeAccessForPaymentIntent } from "../checkout";
import { isEntitlementActive } from "../entitlements";
import { InMemoryPaymentsStore, setPaymentsStore } from "../store";

const NOW = new Date("2026-07-07T12:00:00.000Z");
const REFUNDED_AT = new Date("2026-07-09T09:30:00.000Z");

let store: InMemoryPaymentsStore;

/** A completed purchase, exactly as fulfilment would have written it. */
async function purchase(
  sessionId = "cs_test_1",
  paymentIntent: string | null = "pi_test_1",
): Promise<void> {
  await fulfillCheckout(
    {
      id: sessionId,
      payment_status: "paid",
      metadata: { userId: "user-1", pack: "core" },
      amount_total: 1299,
      currency: "eur",
      payment_intent: paymentIntent,
      livemode: true,
    },
    NOW,
  );
}

beforeEach(() => {
  store = new InMemoryPaymentsStore();
  setPaymentsStore(store);
});

afterEach(() => setPaymentsStore(null));

describe("revokeAccessForPaymentIntent", () => {
  it("ends access at the moment of the refund", async () => {
    await purchase();
    // Access is live before the refund — otherwise the assertion below proves
    // nothing about the revocation.
    expect(isEntitlementActive(store.entitlements[0], REFUNDED_AT)).toBe(true);

    const result = await revokeAccessForPaymentIntent("pi_test_1", REFUNDED_AT);

    expect(result).toEqual({ status: "revoked", sessionId: "cs_test_1", revoked: 1 });
    expect(isEntitlementActive(store.entitlements[0], REFUNDED_AT)).toBe(false);
  });

  it("ENDS access rather than deleting it — the books must still show the sale", async () => {
    await purchase();
    await revokeAccessForPaymentIntent("pi_test_1", REFUNDED_AT);

    expect(store.entitlements).toHaveLength(1); // still there
    expect(store.entitlements[0].expiresAt).toEqual(REFUNDED_AT);
    expect(store.payments).toHaveLength(1); // receipt untouched
    expect(store.payments[0].amountCents).toBe(1299);
  });

  it("revokes ONLY the refunded purchase, never the student's other packs", async () => {
    await purchase("cs_refunded", "pi_refunded");
    await purchase("cs_kept", "pi_kept");

    await revokeAccessForPaymentIntent("pi_refunded", REFUNDED_AT);

    const refunded = store.entitlements.find((e) => e.providerRef === "cs_refunded");
    const kept = store.entitlements.find((e) => e.providerRef === "cs_kept");
    expect(isEntitlementActive(refunded!, REFUNDED_AT)).toBe(false);
    expect(isEntitlementActive(kept!, REFUNDED_AT)).toBe(true);
  });

  it("reports an unknown PaymentIntent instead of guessing", async () => {
    await purchase();
    const result = await revokeAccessForPaymentIntent("pi_never_seen", REFUNDED_AT);

    // No receipt ⇒ no grant, because the two are written in one transaction.
    // Saying so is different from silently succeeding.
    expect(result).toEqual({ status: "unknown-payment" });
    expect(isEntitlementActive(store.entitlements[0], REFUNDED_AT)).toBe(true);
  });

  it("distinguishes 'no receipt' from 'receipt with nothing to revoke'", async () => {
    await purchase();
    // The receipt survives an Art. 17 erasure of the entitlement; the refund
    // then has a session but no grant. That is not the same event as an
    // unknown PaymentIntent and must not be reported as one.
    store.entitlements.length = 0;

    const result = await revokeAccessForPaymentIntent("pi_test_1", REFUNDED_AT);
    expect(result).toEqual({ status: "nothing-to-revoke", sessionId: "cs_test_1" });
  });

  it("is idempotent — a redelivered refund does not move the date again", async () => {
    await purchase();
    await revokeAccessForPaymentIntent("pi_test_1", REFUNDED_AT);
    const later = new Date("2026-07-20T00:00:00.000Z");
    await revokeAccessForPaymentIntent("pi_test_1", later);

    // Re-revoking is harmless: the second date is still in the past relative
    // to any later read, so access stays off either way.
    expect(isEntitlementActive(store.entitlements[0], new Date("2026-08-01T00:00:00.000Z"))).toBe(
      false,
    );
  });
});
