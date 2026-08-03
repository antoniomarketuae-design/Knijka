/**
 * „Моите покупки" — what a student can see about her own money.
 *
 * Until this existed the product had no purchase history anywhere: a student
 * whose purchase went wrong could write only "платих, но не работи", with no
 * amount, no date and no reference, and the founder had nothing to type into a
 * Stripe search. Two people, one broken sale, and not one shared fact.
 *
 * The case these tests exist for is the third one below: a RECEIPT WITH NO
 * GRANT. Money left her account and access never arrived. Listing only
 * Entitlements would render that student an EMPTY page — the single worst
 * screen available, because it looks exactly like "you never paid".
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatPaidAmount, listPurchases } from "../purchases";
import {
  InMemoryPaymentsStore,
  setPaymentsStore,
  type PaymentRecord,
} from "../store";

let store: InMemoryPaymentsStore;

const SESSION = "cs_test_9aBc";
const SEPT = new Date("2026-09-14T10:00:00.000Z");
const OCT = new Date("2026-10-02T08:30:00.000Z");

function receipt(over: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: "pay-1",
    stripeSessionId: SESSION,
    stripePaymentIntentId: "pi_1",
    userId: "user-1",
    pack: "core",
    amountCents: 1299,
    currency: "eur",
    livemode: true,
    status: "paid",
    rawEventId: null,
    createdAt: SEPT,
    ...over,
  };
}

beforeEach(() => {
  store = new InMemoryPaymentsStore();
  setPaymentsStore(store);
});

afterEach(() => setPaymentsStore(null));

describe("listPurchases — the grant and the receipt, merged", () => {
  it("gives an ordinary purchase everything she needs to quote: pack, date, amount, reference", async () => {
    await store.createEntitlement({
      userId: "user-1",
      pack: "core",
      purchasedAt: SEPT,
      expiresAt: new Date("2027-01-14T10:00:00.000Z"),
      provider: "stripe",
      providerRef: SESSION,
    });
    store.payments.push(receipt());

    const [row, ...rest] = await listPurchases("user-1");

    expect(rest).toHaveLength(0); // one purchase, not two rows
    expect(row.reference).toBe(SESSION); // the string Stripe search takes
    expect(row.packNameBg).toBeTruthy();
    expect(row.amountCents).toBe(1299);
    expect(row.currency).toBe("eur");
    expect(row.granted).toBe(true);
    expect(row.livemode).toBe(true);
    expect(row.expiresAt).toEqual(new Date("2027-01-14T10:00:00.000Z"));
  });

  it("KEEPS a receipt that has no grant behind it — the broken purchase", async () => {
    store.payments.push(receipt({ stripeSessionId: "cs_orphan", id: "pay-orphan" }));

    const rows = await listPurchases("user-1");

    // Listing only Entitlements would have shown her an empty page.
    expect(rows).toHaveLength(1);
    expect(rows[0].granted).toBe(false);
    expect(rows[0].reference).toBe("cs_orphan");
    expect(rows[0].amountCents).toBe(1299);
  });

  it("shows a promo grant with no money behind it, honestly", async () => {
    await store.createEntitlement({
      userId: "user-1",
      pack: "core",
      purchasedAt: SEPT,
      expiresAt: null,
      provider: "promo",
      providerRef: "launch-2026",
    });

    const [row] = await listPurchases("user-1");
    expect(row.granted).toBe(true);
    expect(row.amountCents).toBeNull();
    expect(row.currency).toBeNull();
    expect(row.provider).toBe("promo");
  });

  it("surfaces a TEST-MODE payment instead of hiding it", async () => {
    // A test-mode row on a real account is a thing support must be able to SEE:
    // it is the difference between "your card was charged" and "it was not".
    store.payments.push(receipt({ livemode: false }));
    const [row] = await listPurchases("user-1");
    expect(row.livemode).toBe(false);
  });

  it("orders newest first, so the purchase she is writing about is at the top", async () => {
    store.payments.push(receipt({ id: "pay-old", stripeSessionId: "cs_old", createdAt: SEPT }));
    store.payments.push(receipt({ id: "pay-new", stripeSessionId: "cs_new", createdAt: OCT }));

    const rows = await listPurchases("user-1");
    expect(rows.map((r) => r.reference)).toEqual(["cs_new", "cs_old"]);
  });

  it("GDPR: only ever this user's own rows", async () => {
    store.payments.push(receipt({ id: "pay-mine" }));
    store.payments.push(
      receipt({ id: "pay-theirs", userId: "user-2", stripeSessionId: "cs_theirs" }),
    );
    await store.createEntitlement({
      userId: "user-2",
      pack: "core",
      purchasedAt: SEPT,
      expiresAt: null,
      provider: "stripe",
      providerRef: "cs_theirs",
    });

    const rows = await listPurchases("user-1");
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("cs_theirs");
  });

  it("says 'nothing bought' as an empty list, not as an error", async () => {
    expect(await listPurchases("user-1")).toEqual([]);
  });

  it("still renders a pack id that is no longer in the catalogue", async () => {
    store.payments.push(receipt({ pack: "retired_bundle_2025" }));
    const [row] = await listPurchases("user-1");
    expect(row.pack).toBe("retired_bundle_2025");
    expect(row.packNameBg).toBeNull(); // named honestly rather than invented
  });
});

describe("formatPaidAmount", () => {
  it("writes what a Bulgarian buyer reads on her statement", () => {
    expect(formatPaidAmount(1299, "eur")).toBe("12,99 €");
    expect(formatPaidAmount(0, "eur")).toBe("0,00 €");
    // Never recomputed from PACKS: the price in code changes, the price someone
    // paid does not — so an unexpected currency must still render.
    expect(formatPaidAmount(2500, "bgn")).toBe("25,00 BGN");
  });
});
