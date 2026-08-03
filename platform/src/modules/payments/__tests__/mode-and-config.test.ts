/**
 * TEST MODE vs LIVE MODE, and the config that must be WHOLE before selling.
 *
 * `grep -rn livemode src/` used to return zero lines. Every Stripe object
 * carries the flag and the product read it nowhere, so a test-mode event and
 * real revenue were indistinguishable to every path that touched money.
 *
 * THE FAILURE THIS ACTUALLY PREVENTS is a MIXED configuration — a live
 * `sk_live_…` paired with the `whsec_…` of the TEST endpoint, because the two
 * secrets are copied from two different Dashboard screens and only one changes
 * visibly when the mode toggle flips. Every real webhook then fails signature
 * verification, the route answers 400, Stripe treats 400 as permanent and does
 * NOT retry — so every live purchase is charged and never fulfilled while the
 * Dashboard fills with red. No key prefix catches that alone.
 *
 * And the plainest hole of all: isStripeConfigured() checked the secret key and
 * the legal identity but NOT STRIPE_WEBHOOK_SECRET, so buy buttons could go
 * live with the only authoritative fulfilment path absent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const legalGaps = vi.fn<() => string[]>(() => []);
vi.mock("@/lib/legal/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/legal/identity")>()),
  legalIdentityGaps: () => legalGaps(),
}));

const mailGaps = vi.fn<() => string[]>(() => []);
vi.mock("@/modules/mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/mail")>()),
  mailDeliveryGaps: () => mailGaps(),
}));

const {
  declaredStripeMode,
  livemodeMatchesDeclaredMode,
  stripeKeyMode,
  stripeModeGaps,
  assertStripeModeConsistent,
} = await import("../mode");
const { isStripeConfigured, getStripeClient, setStripeClient } = await import("../stripe");
const { PaymentsError } = await import("../types");

/** A deployment with everything right, so each test can break ONE thing. */
function healthyEnv(): void {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_abc");
  vi.stubEnv("STRIPE_MODE", "test");
  legalGaps.mockReturnValue([]);
  mailGaps.mockReturnValue([]);
}

beforeEach(() => {
  healthyEnv();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  setStripeClient(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("declaredStripeMode — a deployment that has not declared itself live is not live", () => {
  it("defaults to test when STRIPE_MODE is unset", () => {
    vi.stubEnv("STRIPE_MODE", "");
    expect(declaredStripeMode()).toBe("test");
  });

  it("reads live only from the literal string, case/space-insensitively", () => {
    vi.stubEnv("STRIPE_MODE", "  LIVE  ");
    expect(declaredStripeMode()).toBe("live");
  });

  it("treats a TYPO as test — the safe direction — and says so separately", () => {
    vi.stubEnv("STRIPE_MODE", "liev");
    expect(declaredStripeMode()).toBe("test");
    expect(stripeModeGaps().join(" ")).toContain("not \"test\" or \"live\"");
  });
});

describe("stripeKeyMode", () => {
  it("reads both key families Stripe issues", () => {
    expect(stripeKeyMode("sk_live_51abc")).toBe("live");
    expect(stripeKeyMode("sk_test_51abc")).toBe("test");
    expect(stripeKeyMode("rk_live_51abc")).toBe("live");
    expect(stripeKeyMode("rk_test_51abc")).toBe("test");
    expect(stripeKeyMode("pk_test_51abc")).toBe("test");
  });

  it("returns null for a key carrying no mode marker", () => {
    expect(stripeKeyMode("sk_51abc")).toBeNull();
    expect(stripeKeyMode("")).toBeNull();
  });
});

describe("livemodeMatchesDeclaredMode", () => {
  it("agrees only when the event's livemode is what the deployment declares", () => {
    vi.stubEnv("STRIPE_MODE", "live");
    expect(livemodeMatchesDeclaredMode(true)).toBe(true);
    expect(livemodeMatchesDeclaredMode(false)).toBe(false);

    vi.stubEnv("STRIPE_MODE", "test");
    expect(livemodeMatchesDeclaredMode(false)).toBe(true);
    expect(livemodeMatchesDeclaredMode(true)).toBe(false);
  });
});

describe("stripeModeGaps — the mixed configuration, named", () => {
  it("is silent when the key and the declaration agree", () => {
    expect(stripeModeGaps()).toEqual([]);
  });

  it("catches THE expensive one: a live key on a deployment declared test", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_realmoney");
    vi.stubEnv("STRIPE_MODE", "test");
    expect(stripeModeGaps()).toContain(
      'STRIPE_SECRET_KEY is a live-mode key but STRIPE_MODE says "test"',
    );
  });

  it("catches a test key on a deployment declared live", () => {
    vi.stubEnv("STRIPE_MODE", "live");
    expect(stripeModeGaps().join(" ")).toContain("test-mode key");
  });

  it("catches a publishable key from the other mode — the same slip, one screen over", () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_abc");
    expect(stripeModeGaps().join(" ")).toContain(
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is a live-mode key",
    );
  });

  it("flags a key whose mode cannot be verified at all", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_truncated");
    expect(stripeModeGaps().join(" ")).toContain("no sk_test_/sk_live_ prefix");
  });
});

describe("isStripeConfigured — FAIL CLOSED on an incomplete money config", () => {
  it("is true when everything is present and coherent", () => {
    expect(isStripeConfigured()).toBe(true);
  });

  it("REFUSES TO SELL without STRIPE_WEBHOOK_SECRET", () => {
    // The hole this closes: buy buttons live, Stripe taking money, and the
    // only authoritative fulfilment path answering 503 to every delivery.
    // Anyone who closes the tab on Stripe's page — or pays by a delayed
    // method, where there is no return trip at all — is charged and gets
    // nothing.
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect(isStripeConfigured()).toBe(false);
  });

  it("refuses to sell on a mode mismatch", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_realmoney");
    vi.stubEnv("STRIPE_MODE", "test");
    expect(isStripeConfigured()).toBe(false);
  });

  it("still refuses without the secret key, the legal identity or e-mail", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(isStripeConfigured()).toBe(false);

    healthyEnv();
    legalGaps.mockReturnValue(["ENTITY_EIK"]);
    expect(isStripeConfigured()).toBe(false);

    healthyEnv();
    mailGaps.mockReturnValue(["MAIL_TRANSPORT"]);
    expect(isStripeConfigured()).toBe(false);
  });

  it("names the missing variable on the server, so the founder can act on it", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    isStripeConfigured();
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("STRIPE_WEBHOOK_SECRET");
  });
});

describe("assertStripeModeConsistent — the boot assertion", () => {
  it("passes silently on a coherent configuration", () => {
    expect(() => assertStripeModeConsistent()).not.toThrow();
  });

  it("throws STRIPE_MODE_MISMATCH rather than building a client in the wrong mode", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_realmoney");
    vi.stubEnv("STRIPE_MODE", "test");
    try {
      assertStripeModeConsistent();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentsError);
      expect((err as InstanceType<typeof PaymentsError>).code).toBe("STRIPE_MODE_MISMATCH");
    }
  });

  it("getStripeClient refuses to construct the real SDK on a mismatch", async () => {
    // The backstop for a caller that skipped isStripeConfigured(). Without it
    // the first thing a mixed deployment does with real money is build a
    // client that cannot verify a single webhook.
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_realmoney");
    vi.stubEnv("STRIPE_MODE", "test");
    await expect(getStripeClient()).rejects.toMatchObject({
      code: "STRIPE_MODE_MISMATCH",
    });
  });

  it("an injected test client is still returned — the assertion guards SDK construction", async () => {
    const fake = { checkout: { sessions: {} }, webhooks: {} } as never;
    setStripeClient(fake);
    await expect(getStripeClient()).resolves.toBe(fake);
  });
});
