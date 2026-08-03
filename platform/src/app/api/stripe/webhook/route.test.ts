/**
 * POST /api/stripe/webhook — the money path, executed (audit 2026-07-24,
 * H-13: no test imported ANY route handler, so every status code Stripe's
 * retry machine reacts to was unexecuted code, and so was the only
 * authoritative fulfillment path in the product).
 *
 * This is an integration test on purpose: the real route, the real payments
 * module, the real fulfillment logic — only the designed seams are faked
 * (`setStripeClient` for signature verification, `setPaymentsStore` for the
 * DB). So "fulfilled" here means an Entitlement row actually came into
 * existence, not that a spy was called.
 *
 * The status codes are a contract with Stripe, not cosmetics:
 *   503 → we are misconfigured; Stripe retries later
 *   400 → bad/absent signature; retrying cannot help
 *   500 → OUR failure; Stripe MUST retry (fulfillment is idempotent)
 *   200 → delivered, including events we deliberately ignore
 *
 * WHAT THIS FILE GOT WRONG BEFORE, AND WHY IT MATTERED: it asserted 200 for
 * `{status:"skipped"}` without distinguishing the two reasons. `not-paid` is
 * genuinely fine. `missing-metadata` means a card was charged and no
 * entitlement was written — and a 200 tells Stripe never to send that event
 * again. The test encoded a permanent silent loss as correct behaviour.
 *
 * It also covered only the SEQUENTIAL retry, which is why the concurrent
 * double-fulfilment shipped; that race now has its own suite in
 * modules/payments/__tests__/receipt-and-race.test.ts.
 */

import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The C-1 guard reads the (still placeholder) legal identity; a test that
// wants a *configured* deployment says so explicitly through this seam.
const legalGaps = vi.fn<() => string[]>(() => []);
vi.mock("@/lib/legal/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/legal/identity")>()),
  legalIdentityGaps: () => legalGaps(),
}));

// Same for the "can this deployment send e-mail" guard: these tests are about
// the webhook, not about mail wiring.
const mailGaps = vi.fn<() => string[]>(() => []);
vi.mock("@/modules/mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/mail")>()),
  mailDeliveryGaps: () => mailGaps(),
}));

const { POST } = await import("./route");
const {
  InMemoryPaymentsStore,
  setPaymentsStore,
  setStripeClient,
  isEntitlementActive,
} = await import("@/modules/payments");

const WEBHOOK_SECRET = "whsec_test";
let store: InstanceType<typeof InMemoryPaymentsStore>;

/** A signed `checkout.session.completed` for a paid core pack. */
function paidEvent(
  over: Partial<Stripe.Checkout.Session> = {},
  eventOver: Record<string, unknown> = {},
) {
  return {
    id: "evt_test_1",
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: "cs_test_1",
        payment_status: "paid",
        metadata: { userId: "user-1", pack: "core" },
        amount_total: 1299,
        currency: "eur",
        payment_intent: "pi_test_1",
        livemode: false,
        ...over,
      },
    },
    ...eventOver,
  } as unknown as Stripe.Event;
}

/** A `charge.refunded` (or dispute) for the PaymentIntent above. */
function refundEvent(
  over: Record<string, unknown> = {},
  type = "charge.refunded",
) {
  return {
    id: "evt_refund_1",
    type,
    livemode: false,
    data: {
      object: {
        id: "ch_test_1",
        payment_intent: "pi_test_1",
        amount: 1299,
        amount_refunded: 1299,
        ...over,
      },
    },
  } as unknown as Stripe.Event;
}

/**
 * A fake Stripe client whose `constructEventAsync` behaves like the real one:
 * it returns the event only when the signature header is the literal string
 * "good". That is the whole security property this route rests on.
 */
function stubStripe(event: Stripe.Event | (() => Stripe.Event)) {
  setStripeClient({
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    webhooks: {
      constructEventAsync: async (
        _payload: string,
        header: string,
        secret: string,
      ) => {
        if (header !== "good" || secret !== WEBHOOK_SECRET) {
          throw new Error("No signatures found matching the expected signature");
        }
        return typeof event === "function" ? event() : event;
      },
    },
  } as never);
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

/**
 * The in-memory store with one method broken.
 *
 * Deliberately NOT an object literal spelling out every method: this file used
 * to carry one, and every time the PaymentsStore interface grew, an unrelated
 * lane had to come and patch this test to keep `tsc` green. Overriding the
 * real fake keeps the failure injection to the one line that is the point.
 */
function failingStore(over: Partial<InstanceType<typeof InMemoryPaymentsStore>>) {
  return Object.assign(new InMemoryPaymentsStore(), over);
}

beforeEach(() => {
  store = new InMemoryPaymentsStore();
  setPaymentsStore(store);
  legalGaps.mockReturnValue([]);
  mailGaps.mockReturnValue([]);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  vi.stubEnv("STRIPE_MODE", "test");
  stubStripe(paidEvent());
});

afterEach(() => {
  setPaymentsStore(null);
  setStripeClient(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("configuration gate", () => {
  it("503s when STRIPE_SECRET_KEY is absent", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect((await post({}, { "stripe-signature": "good" })).status).toBe(503);
  });

  it("503s when STRIPE_WEBHOOK_SECRET is absent", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await post({}, { "stripe-signature": "good" })).status).toBe(503);
  });

  it("C-1: 503s while the legal entity is still placeholder text", async () => {
    // Credentials present, seller not registered — the product must not be
    // able to take money from a minor under a policy naming nobody.
    legalGaps.mockReturnValue(["ENTITY_NAME", "ENTITY_EIK"]);
    const res = await post(paidEvent(), { "stripe-signature": "good" });
    expect(res.status).toBe(503);
    expect(store.entitlements).toHaveLength(0);
  });
});

describe("signature verification", () => {
  it("400s when the stripe-signature header is missing", async () => {
    const res = await post(paidEvent());
    expect(res.status).toBe(400);
    expect(store.entitlements).toHaveLength(0);
  });

  it("400s on a signature that does not verify — and grants nothing", async () => {
    const res = await post(paidEvent(), { "stripe-signature": "forged" });
    expect(res.status).toBe(400);
    expect(store.entitlements).toHaveLength(0);
  });

  it("records NOTHING for an unverified event — the queue holds signed events only", async () => {
    await post(paidEvent(), { "stripe-signature": "forged" });
    expect(store.stripeEvents).toHaveLength(0);
  });

  it("verifies against the RAW body bytes, not a re-serialization", async () => {
    // Stripe HMACs exactly what it sent. Whitespace the route must not touch.
    const raw = '{\n  "spacing": "preserved"\n}';
    let seen: string | null = null;
    setStripeClient({
      checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
      webhooks: {
        constructEventAsync: async (payload: string) => {
          seen = payload;
          return paidEvent();
        },
      },
    } as never);
    await post(raw, { "stripe-signature": "good" });
    expect(seen).toBe(raw);
  });
});

describe("every verified event is PERSISTED before it is acted on", () => {
  it("writes a StripeEvent row and closes it when fulfilment succeeds", async () => {
    await post(paidEvent(), { "stripe-signature": "good" });

    expect(store.stripeEvents).toHaveLength(1);
    const row = store.stripeEvents[0];
    expect(row.stripeEventId).toBe("evt_test_1");
    expect(row.type).toBe("checkout.session.completed");
    expect(row.payload).toBeTruthy();
    expect(row.processedAt).toBeInstanceOf(Date);
    expect(row.lastError).toBeNull();
  });

  it("leaves processedAt NULL with a reason when fulfilment fails — this IS the dead-letter queue", async () => {
    const broken = failingStore({
      recordPurchase: async () => {
        throw new Error("db is down");
      },
    });
    setPaymentsStore(broken);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post(paidEvent(), { "stripe-signature": "good" });

    expect(res.status).toBe(500);
    expect(broken.stripeEvents).toHaveLength(1);
    expect(broken.stripeEvents[0].processedAt).toBeNull();
    expect(broken.stripeEvents[0].lastError).toContain("db is down");
  });

  it("records the event even for a type it does not handle", async () => {
    // Otherwise "what did Stripe actually send us?" is unanswerable for
    // everything outside the two types we act on.
    stubStripe(paidEvent({}, { type: "payment_intent.created", id: "evt_other" }));
    await post({}, { "stripe-signature": "good" });
    expect(store.stripeEvents.map((e) => e.stripeEventId)).toEqual(["evt_other"]);
  });

  it("keeps ONE row across Stripe's redelivery of the same event id", async () => {
    await post(paidEvent(), { "stripe-signature": "good" });
    await post(paidEvent(), { "stripe-signature": "good" });
    expect(store.stripeEvents).toHaveLength(1);
  });

  it("500s when the event cannot be recorded — never grant what we cannot audit", async () => {
    setPaymentsStore(
      failingStore({
        recordStripeEvent: async () => {
          throw new Error("db is down");
        },
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(paidEvent(), { "stripe-signature": "good" });
    expect(res.status).toBe(500);
  });
});

describe("livemode enforcement", () => {
  it("400s a TEST event at a LIVE deployment — fake money, and a retry cannot change that", async () => {
    vi.stubEnv("STRIPE_MODE", "live");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_x");
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubStripe(paidEvent({}, { livemode: false }));

    const res = await post({}, { "stripe-signature": "good" });
    expect(res.status).toBe(400);
    expect(store.entitlements).toHaveLength(0);
  });

  it("503s a LIVE event at a deployment declared TEST — real money, so KEEP RETRYING", async () => {
    // The asymmetry is the point. A 400 here would throw a real purchase away
    // permanently; a 503 buys ~3 days for whoever set STRIPE_MODE to fix it
    // and have the sale land on a retry.
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubStripe(paidEvent({}, { livemode: true }));

    const res = await post({}, { "stripe-signature": "good" });
    expect(res.status).toBe(503);
    expect(store.entitlements).toHaveLength(0);
  });

  it("records the mismatch as a queued failure rather than losing it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubStripe(paidEvent({}, { livemode: true }));
    await post({}, { "stripe-signature": "good" });

    expect(store.stripeEvents).toHaveLength(1);
    expect(store.stripeEvents[0].processedAt).toBeNull();
    expect(store.stripeEvents[0].lastError).toContain("livemode");
  });
});

describe("fulfillment", () => {
  it("grants access on checkout.session.completed", async () => {
    const res = await post(paidEvent(), { "stripe-signature": "good" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    expect(store.entitlements).toHaveLength(1);
    const granted = store.entitlements[0];
    expect(granted.userId).toBe("user-1");
    expect(granted.providerRef).toBe("cs_test_1"); // the idempotency key
    expect(isEntitlementActive(granted, new Date())).toBe(true);
  });

  it("writes the receipt too, stamped with the event that produced it", async () => {
    await post(paidEvent(), { "stripe-signature": "good" });
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]).toMatchObject({
      stripeSessionId: "cs_test_1",
      stripePaymentIntentId: "pi_test_1",
      amountCents: 1299,
      currency: "eur",
      rawEventId: "evt_test_1",
    });
  });

  it("grants access on async_payment_succeeded (delayed methods)", async () => {
    stubStripe(paidEvent({}, { type: "checkout.session.async_payment_succeeded" }));
    expect((await post({}, { "stripe-signature": "good" })).status).toBe(200);
    expect(store.entitlements).toHaveLength(1);
  });

  it("is idempotent: Stripe's retry does not grant a second entitlement", async () => {
    await post(paidEvent(), { "stripe-signature": "good" });
    await post(paidEvent(), { "stripe-signature": "good" });
    expect(store.entitlements).toHaveLength(1);
    expect(store.payments).toHaveLength(1);
  });

  it("200s but grants nothing for an unpaid session", async () => {
    stubStripe(
      paidEvent({ payment_status: "unpaid" } as Partial<Stripe.Checkout.Session>),
    );
    expect((await post({}, { "stripe-signature": "good" })).status).toBe(200);
    expect(store.entitlements).toHaveLength(0);
  });

  it("500s a PAID session with no usable metadata — a charge with nothing to grant", async () => {
    // THE ONE THIS FILE USED TO BLESS WITH A 200. The card was charged, no
    // entitlement can be written, and a 2xx tells Stripe never to redeliver —
    // so the sale was lost permanently and silently. 500 keeps it knocking.
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubStripe(paidEvent({ metadata: null }));

    const res = await post({}, { "stripe-signature": "good" });
    expect(res.status).toBe(500);
    expect(store.entitlements).toHaveLength(0);
  });

  it("keeps the unfulfillable session in the queue with a reason a human can read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubStripe(paidEvent({ metadata: null }));
    await post({}, { "stripe-signature": "good" });

    const row = store.stripeEvents[0];
    expect(row.processedAt).toBeNull();
    expect(row.lastError).toContain("metadata");
  });

  it("200s a replay whose access was REVOKED — and resurrects nothing", async () => {
    // THE POISON PILL, seen from the endpoint Stripe talks to.
    //
    // Support revokes one student's access: the Entitlement row is deleted and
    // the receipt is deliberately left behind. Stripe then replays the
    // session, as at-least-once delivery says it may. On real Postgres that
    // replay used to throw (the grant it re-inserted was rolled back by the
    // receipt's unique key), so this endpoint answered 500 to every retry for
    // ~3 DAYS after an ordinary support action.
    //
    // The two properties that must hold together, and neither alone is enough:
    // 200 (Stripe stops retrying, the event leaves the dead-letter queue) AND
    // no entitlement (the revoke stands — a replay must never hand back access
    // a human deliberately took away).
    //
    // The DEFECT itself lives in a two-table transaction and only a database
    // can produce it; modules/payments/__tests__/poison-pill.postgres.test.ts
    // reproduces it on real Postgres. This test pins the CONSEQUENCE.
    vi.spyOn(console, "info").mockImplementation(() => {});
    store.payments.push({
      id: "pay-existing",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      stripeSessionId: "cs_test_1",
      stripePaymentIntentId: "pi_test_1",
      userId: "user-1",
      pack: "core",
      amountCents: 1299,
      currency: "eur",
      livemode: false,
      status: "paid",
      rawEventId: "evt_test_0",
    });
    stubStripe(paidEvent());

    const res = await post({}, { "stripe-signature": "good" });

    expect(res.status).toBe(200);
    expect(store.entitlements, "the revoke stands").toHaveLength(0);
    expect(store.payments, "and no second receipt was written").toHaveLength(1);

    // It left the queue: a fulfilment that is genuinely finished must not sit
    // in the dead-letter scan forever waiting for a human who has nothing to do.
    const row = store.stripeEvents[0];
    expect(row.processedAt).toBeInstanceOf(Date);
    expect(row.lastError).toBeNull();
  });

  it("200s and ignores event types that are not ours", async () => {
    stubStripe(paidEvent({}, { type: "payment_intent.created" }));
    expect((await post({}, { "stripe-signature": "good" })).status).toBe(200);
    expect(store.entitlements).toHaveLength(0);
  });

  it("500s when fulfillment throws, so Stripe retries instead of losing the sale", async () => {
    setPaymentsStore(
      failingStore({
        recordPurchase: async () => {
          throw new Error("db is down");
        },
      }),
    );
    // The route logs the failure; keep the run output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(paidEvent(), { "stripe-signature": "good" });
    expect(res.status).toBe(500);
  });
});

describe("refunds and disputes take the access back", () => {
  /** Fulfil first, so there is something to revoke. */
  async function buy(): Promise<void> {
    stubStripe(paidEvent());
    await post({}, { "stripe-signature": "good" });
  }

  it("charge.refunded ends the access it paid for", async () => {
    await buy();
    expect(isEntitlementActive(store.entitlements[0], new Date())).toBe(true);

    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubStripe(refundEvent());
    const res = await post({}, { "stripe-signature": "good" });

    expect(res.status).toBe(200);
    expect(isEntitlementActive(store.entitlements[0], new Date())).toBe(false);
  });

  it("charge.dispute.created does the same — the bank has taken the money back", async () => {
    await buy();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubStripe(
      refundEvent(
        { amount: undefined, amount_refunded: undefined },
        "charge.dispute.created",
      ),
    );

    const res = await post({}, { "stripe-signature": "good" });
    expect(res.status).toBe(200);
    expect(isEntitlementActive(store.entitlements[0], new Date())).toBe(false);
  });

  it("a PARTIAL refund is goodwill, not an undo — access stays on", async () => {
    await buy();
    stubStripe(refundEvent({ amount_refunded: 500 }));

    const res = await post({}, { "stripe-signature": "good" });
    expect(res.status).toBe(200);
    expect(isEntitlementActive(store.entitlements[0], new Date())).toBe(true);
  });

  it("200s on a refund for a PaymentIntent we have no receipt for", async () => {
    // No receipt ⇒ no grant (they are one transaction), so there is genuinely
    // nothing to take back and nothing is being hidden by the 200.
    stubStripe(refundEvent({ payment_intent: "pi_never_seen" }));
    const res = await post({}, { "stripe-signature": "good" });
    expect(res.status).toBe(200);
  });

  it("500s a refund event carrying no payment_intent at all", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubStripe(refundEvent({ payment_intent: null }));
    const res = await post({}, { "stripe-signature": "good" });
    expect(res.status).toBe(500);
  });

  it("500s when revocation itself fails, so Stripe brings it back", async () => {
    await buy();
    setPaymentsStore(
      failingStore({
        findPaymentByIntent: async () => {
          throw new Error("db is down");
        },
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubStripe(refundEvent());

    const res = await post({}, { "stripe-signature": "good" });
    expect(res.status).toBe(500);
  });
});
