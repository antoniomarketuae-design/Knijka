/**
 * POST /api/checkout/embedded — the authorization boundary in front of the
 * money path (audit 2026-07-24, H-13).
 *
 * The property that matters is one line of the handler: the userId comes from
 * the SERVER session, never from the request body. Get that wrong and anyone
 * can mint a Checkout Session that grants access to someone else's account —
 * or, worse, buy in their own name and have it fulfil onto another user id.
 * Nothing exercised that line before this file.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  getSessionUser: () => getSessionUser(),
}));

const legalGaps = vi.fn<() => string[]>(() => []);
vi.mock("@/lib/legal/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/legal/identity")>()),
  legalIdentityGaps: () => legalGaps(),
}));

const { POST } = await import("./route");
const {
  setStripeClient,
  setPaymentsStore,
  InMemoryPaymentsStore,
  recordCheckoutConsent,
} = await import("@/modules/payments");

/** Captures what the route asked Stripe to create. */
let created: Array<Record<string, unknown>>;

function post(payload: unknown) {
  return POST(
    new Request("http://localhost/api/checkout/embedded", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  );
}

beforeEach(async () => {
  created = [];
  legalGaps.mockReturnValue([]);
  getSessionUser.mockResolvedValue({ id: "user-1", email: "ivan@mail.bg" });
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  // H-9: the payments module now refuses to mint a client_secret without a
  // recorded purchase consent. These tests are about the AUTHORIZATION
  // boundary, not the consent gate (that one has its own suite), so give the
  // buyer an adult birth year and a fresh consent and let them through.
  const store = new InMemoryPaymentsStore();
  store.birthYears.set("user-1", 1995);
  setPaymentsStore(store);
  await recordCheckoutConsent("user-1", "core", { withdrawal_waiver: true });
  setStripeClient({
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          created.push(params);
          return { id: "cs_test_1", client_secret: "cs_secret_1" };
        },
        retrieve: vi.fn(),
      },
    },
    webhooks: { constructEventAsync: vi.fn() },
  } as never);
});

afterEach(() => {
  setStripeClient(null);
  setPaymentsStore(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/checkout/embedded", () => {
  it("503s when Stripe is not configured — before touching the session", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect((await post({ pack: "core" })).status).toBe(503);
    expect(getSessionUser).not.toHaveBeenCalled();
  });

  it("C-1: 503s while the legal entity is still placeholder text", async () => {
    legalGaps.mockReturnValue(["ENTITY_EIK"]);
    expect((await post({ pack: "core" })).status).toBe(503);
    expect(created).toHaveLength(0);
  });

  it("401s for an anonymous caller and creates no session", async () => {
    getSessionUser.mockResolvedValue(null);
    const res = await post({ pack: "core" });
    expect(res.status).toBe(401);
    expect(created).toHaveLength(0);
  });

  it("400s on a body that is not JSON", async () => {
    expect((await post("not json {")).status).toBe(400);
    expect(created).toHaveLength(0);
  });

  it("400s on an unknown pack id — no arbitrary product may be minted", async () => {
    for (const pack of ["gratis", "", null, 0, { id: "core" }]) {
      const res = await post({ pack });
      expect(res.status, JSON.stringify(pack)).toBe(400);
    }
    expect(created).toHaveLength(0);
  });

  it("returns the client_secret for a valid pack", async () => {
    const res = await post({ pack: "core" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clientSecret: "cs_secret_1" });
    expect(created).toHaveLength(1);
  });

  it("AUTHORIZATION: the buyer is the session user, never the body's userId", async () => {
    // The forged fields below are exactly what fulfillment reads back from
    // Stripe-verified metadata — if the route trusted them, a signed-in
    // student could buy access onto any account id they can guess.
    await post({ pack: "core", userId: "victim-9", client_reference_id: "victim-9" });
    const params = created[0];
    expect(params.client_reference_id).toBe("user-1");
    expect((params.metadata as Record<string, string>).userId).toBe("user-1");
    expect(JSON.stringify(params)).not.toContain("victim-9");
  });

  it("NEVER creates a subscription — one-time packs only (docs/02)", async () => {
    await post({ pack: "core" });
    expect(created[0].mode).toBe("payment");
  });
});
