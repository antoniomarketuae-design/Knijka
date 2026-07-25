/**
 * No Stripe session — hosted or embedded — without a recorded consent
 * (audit 2026-07-24, H-9).
 *
 * The finding was not "a checkbox is missing from a page". It was that
 * `checkout.ts` created the session, and `fulfillCheckout` granted the
 * entitlement, with nothing anywhere in between having asked a 15-year-old's
 * parent or obtained the ЗЗП waiver. So the assertions that matter are about
 * what reaches Stripe: before the fix every one of them failed, because a
 * session was created regardless.
 *
 * The two entry points fail differently on purpose — see the module header.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCheckoutSession,
  createEmbeddedCheckoutSession,
} from "../checkout";
import { recordCheckoutConsent } from "../consent";
import { setStripeClient, type StripeCheckoutClient } from "../stripe";
import { InMemoryPaymentsStore, setPaymentsStore } from "../store";
import { TERMS_VERSION } from "@/lib/legal/versions";

const NOW = new Date("2026-07-25T10:00:00.000Z");

let store: InMemoryPaymentsStore;
/** Everything the code asked Stripe to create. */
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

/** Store seeded with a 16-year-old — the case the whole finding is about. */
function freshStore(birthYear = 2009): InMemoryPaymentsStore {
  store = new InMemoryPaymentsStore();
  store.birthYears.set("user-1", birthYear);
  setPaymentsStore(store);
  return store;
}

async function consent(pack: "core" | "premium_sim" = "core") {
  await recordCheckoutConsent(
    "user-1",
    pack,
    { parental_purchase: true, withdrawal_waiver: true },
    NOW,
  );
}

beforeEach(() => {
  created = [];
  freshStore();
  setStripeClient(fakeStripe());
});

afterEach(() => {
  setPaymentsStore(null);
  setStripeClient(null);
});

describe("createEmbeddedCheckoutSession — refuses to mint a client_secret", () => {
  it("throws CONSENT_REQUIRED and never calls Stripe", async () => {
    await expect(
      createEmbeddedCheckoutSession("user-1", "core", NOW),
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(created).toHaveLength(0);
  });

  it("mints the client_secret once the consent is on file", async () => {
    await consent();
    expect(await createEmbeddedCheckoutSession("user-1", "core", NOW)).toBe(
      "cs_secret_1",
    );
    expect(created).toHaveLength(1);
  });

  it("does not accept a consent given for a different pack", async () => {
    await consent("core");
    await expect(
      createEmbeddedCheckoutSession("user-1", "premium_sim", NOW),
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(created).toHaveLength(0);
  });
});

describe("createCheckoutSession — sends an unconsented buyer to the consent step", () => {
  it("returns the /checkout URL instead of a Stripe one, and creates nothing", async () => {
    expect(await createCheckoutSession("user-1", "core", NOW)).toBe(
      "/checkout?pack=core",
    );
    expect(created).toHaveLength(0);
  });

  it("returns the real Stripe URL once consent exists", async () => {
    await consent();
    expect(await createCheckoutSession("user-1", "core", NOW)).toBe(
      "https://checkout.stripe.com/c/pay/cs_test_1",
    );
    expect(created).toHaveLength(1);
  });
});

describe("the consent proof travels with the money", () => {
  it("mirrors ids, kinds, version and timestamp into the session metadata", async () => {
    await consent();
    await createEmbeddedCheckoutSession("user-1", "core", NOW);

    const metadata = created[0].metadata as Record<string, string>;
    // Provable from Stripe-verified data, not only from a row we control.
    expect(metadata.userId).toBe("user-1");
    expect(metadata.pack).toBe("core");
    expect(metadata.consentIds.split(",")).toHaveLength(2);
    expect(metadata.consentKinds).toContain("parental_purchase");
    expect(metadata.consentKinds).toContain("withdrawal_waiver");
    expect(metadata.consentTermsVersion).toBe(TERMS_VERSION);
    expect(metadata.consentAt).toBe(NOW.toISOString());
    // Stripe caps a metadata value at 500 chars — ids must never approach it.
    for (const value of Object.values(metadata)) {
      expect(value.length).toBeLessThan(500);
    }
  });

  it("records only the waiver for an adult, and says so in the metadata", async () => {
    freshStore(1995);
    await recordCheckoutConsent(
      "user-1",
      "core",
      { withdrawal_waiver: true },
      NOW,
    );

    await createEmbeddedCheckoutSession("user-1", "core", NOW);
    const metadata = created[0].metadata as Record<string, string>;
    expect(metadata.consentKinds).toBe("withdrawal_waiver");
  });
});
