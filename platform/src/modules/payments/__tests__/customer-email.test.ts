/**
 * `customer_email` on the Checkout Session — one line, and it decides who gets
 * the only proof of purchase this product ever issues.
 *
 * WHY IT IS NOT A NICETY HERE. Without it Stripe asks whoever is holding the
 * phone to type an address, and sends the receipt THERE. This product is sold
 * to 17-year-olds who hand the phone to a parent to enter the card, so the
 * address on the charge is frequently NOT the account's: the receipt lands in
 * a mailbox that cannot log in, and the student who owns the account — and who
 * will be the one writing "I paid but it doesn't work" — has nothing.
 *
 * Pinning it to the account also pre-fills the field (one less thing to
 * mistype on a phone) and gives support a single address to search by.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCheckoutSession,
  createEmbeddedCheckoutSession,
} from "../checkout";
import { recordCheckoutConsent } from "../consent";
import { setStripeClient, type StripeCheckoutClient } from "../stripe";
import { InMemoryPaymentsStore, setPaymentsStore } from "../store";

const NOW = new Date("2026-07-25T10:00:00.000Z");

let store: InMemoryPaymentsStore;
let created: Array<Record<string, unknown>>;

function fakeStripe(): StripeCheckoutClient {
  return {
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          created.push(params);
          return {
            id: "cs_test_1",
            url: "https://checkout.stripe.com/c/pay/cs_test_1",
            client_secret: "cs_secret_1",
          } as never;
        },
        retrieve: async () => {
          throw new Error("not used in these tests");
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

async function consent() {
  await recordCheckoutConsent(
    "user-1",
    "core",
    { parental_purchase: true, withdrawal_waiver: true },
    NOW,
  );
}

beforeEach(async () => {
  created = [];
  store = new InMemoryPaymentsStore();
  store.birthYears.set("user-1", 2009); // a 16-year-old, the designed-for buyer
  store.emails.set("user-1", "ivan@mail.bg");
  setPaymentsStore(store);
  setStripeClient(fakeStripe());
  await consent();
});

afterEach(() => {
  setPaymentsStore(null);
  setStripeClient(null);
  vi.restoreAllMocks();
});

describe("customer_email is pinned to the ACCOUNT, not to whoever holds the card", () => {
  it("hosted checkout sends the account's e-mail", async () => {
    await createCheckoutSession("user-1", "core", NOW);
    expect(created[0].customer_email).toBe("ivan@mail.bg");
  });

  it("embedded checkout sends it too — both surfaces or neither", async () => {
    await createEmbeddedCheckoutSession("user-1", "core", NOW);
    expect(created[0].customer_email).toBe("ivan@mail.bg");
  });

  it("omits the field entirely when the account has no e-mail on file", async () => {
    // Stripe rejects an empty string; absent is the correct representation of
    // "we do not know", and it must not become the literal "".
    store.emails.delete("user-1");
    await createCheckoutSession("user-1", "core", NOW);
    expect(created[0]).not.toHaveProperty("customer_email");
  });

  it("still sells when the e-mail lookup FAILS — a store hiccup must not block a sale", async () => {
    vi.spyOn(store, "findUserEmail").mockRejectedValue(new Error("db is down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const url = await createCheckoutSession("user-1", "core", NOW);

    expect(url).toContain("checkout.stripe.com");
    expect(created).toHaveLength(1);
    expect(created[0]).not.toHaveProperty("customer_email");
  });

  it("never lets the e-mail displace the authoritative buyer id", async () => {
    // metadata.userId and client_reference_id are what fulfilment reads back.
    // customer_email is a delivery address, never an identity.
    await createCheckoutSession("user-1", "core", NOW);
    expect(created[0].client_reference_id).toBe("user-1");
    expect((created[0].metadata as Record<string, string>).userId).toBe("user-1");
  });
});
