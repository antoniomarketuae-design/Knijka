/**
 * POST /api/stripe/webhook — the money path, executed (audit 2026-07-24,
 * H-13: no test imported ANY route handler, so every status code Stripe's
 * retry machine reacts to was unexecuted code, and so was the only
 * authoritative fulfillment path in the product).
 *
 * This is an integration test on purpose: the real route, the real payments
 * module, the real fulfillment logic — only the two designed seams are faked
 * (`setStripeClient` for signature verification, `setPaymentsStore` for the
 * DB). So "fulfilled" here means an Entitlement row actually came into
 * existence, not that a spy was called.
 *
 * The status codes are a contract with Stripe, not cosmetics:
 *   503 → we are misconfigured; Stripe retries later
 *   400 → bad/absent signature; retrying cannot help
 *   500 → OUR failure; Stripe MUST retry (fulfillment is idempotent)
 *   200 → delivered, including events we deliberately ignore
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
function paidEvent(over: Partial<Stripe.Checkout.Session> = {}) {
  return {
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        payment_status: "paid",
        metadata: { userId: "user-1", pack: "core" },
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
      constructEventAsync: async (_payload: string, header: string, secret: string) => {
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

beforeEach(() => {
  store = new InMemoryPaymentsStore();
  setPaymentsStore(store);
  legalGaps.mockReturnValue([]);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
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

  it("grants access on async_payment_succeeded (delayed methods)", async () => {
    stubStripe({ ...paidEvent(), type: "checkout.session.async_payment_succeeded" } as Stripe.Event);
    expect((await post({}, { "stripe-signature": "good" })).status).toBe(200);
    expect(store.entitlements).toHaveLength(1);
  });

  it("is idempotent: Stripe's retry does not grant a second entitlement", async () => {
    await post(paidEvent(), { "stripe-signature": "good" });
    await post(paidEvent(), { "stripe-signature": "good" });
    expect(store.entitlements).toHaveLength(1);
  });

  it("200s but grants nothing for an unpaid session", async () => {
    stubStripe(paidEvent({ payment_status: "unpaid" } as Partial<Stripe.Checkout.Session>));
    expect((await post({}, { "stripe-signature": "good" })).status).toBe(200);
    expect(store.entitlements).toHaveLength(0);
  });

  it("200s but grants nothing for a session we did not create (no metadata)", async () => {
    stubStripe(paidEvent({ metadata: null }));
    expect((await post({}, { "stripe-signature": "good" })).status).toBe(200);
    expect(store.entitlements).toHaveLength(0);
  });

  it("200s and ignores event types that are not ours", async () => {
    stubStripe({ ...paidEvent(), type: "payment_intent.created" } as Stripe.Event);
    expect((await post({}, { "stripe-signature": "good" })).status).toBe(200);
    expect(store.entitlements).toHaveLength(0);
  });

  it("500s when fulfillment throws, so Stripe retries instead of losing the sale", async () => {
    setPaymentsStore({
      listEntitlements: async () => [],
      findEntitlementByProviderRef: async () => {
        throw new Error("db is down");
      },
      createEntitlement: async () => {
        throw new Error("unused");
      },
      countQuestionAttempts: async () => 0,
      countExamAttempts: async () => 0,
      // Consent surface (H-9) — unused on the fulfillment path, which reads
      // the proof back from Stripe's metadata, not from our store.
      findUserBirthYear: async () => null,
      createConsentEvent: async () => {
        throw new Error("unused");
      },
      listConsentEvents: async () => [],
    });
    // The route logs the failure; keep the run output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(paidEvent(), { "stripe-signature": "good" });
    expect(res.status).toBe(500);
  });
});
