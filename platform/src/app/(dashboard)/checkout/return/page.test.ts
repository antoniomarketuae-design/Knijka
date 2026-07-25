/**
 * /checkout/return must be signed in (audit 2026-07-24, M-23).
 *
 * The page hands an attacker-supplied `session_id` straight to
 * `checkout.sessions.retrieve`. Anonymously that is an unmetered proxy onto
 * the founder's Stripe account and a paid/pending oracle for any session id
 * someone has. The single property worth pinning: the auth check happens
 * BEFORE Stripe is ever contacted — a guard that runs after the call it is
 * supposed to prevent protects nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn<() => Promise<{ id: string }>>();
vi.mock("@/modules/auth", () => ({ requireUser: () => requireUser() }));

const fulfillCheckout = vi.fn();
vi.mock("@/modules/payments", () => ({
  isStripeConfigured: () => true,
  fulfillCheckout: (id: string) => fulfillCheckout(id),
}));

// The page renders <Link>; nothing here inspects the markup.
vi.mock("next/link", () => ({ default: () => null }));

const CheckoutReturnPage = (await import("./page")).default;

/** next/navigation's redirect() throws — requireUser() does this when logged out. */
class RedirectSignal extends Error {}

function render(sessionId?: string) {
  return CheckoutReturnPage({
    searchParams: Promise.resolve({ session_id: sessionId }),
  });
}

beforeEach(() => {
  requireUser.mockResolvedValue({ id: "user-1" });
  fulfillCheckout.mockResolvedValue({ status: "created", entitlementId: "e1" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CheckoutReturnPage", () => {
  it("never calls Stripe for an anonymous visitor", async () => {
    requireUser.mockRejectedValue(new RedirectSignal("NEXT_REDIRECT"));

    await expect(render("cs_test_someone_elses_session")).rejects.toBeInstanceOf(
      RedirectSignal,
    );
    expect(fulfillCheckout).not.toHaveBeenCalled();
  });

  it("still fulfills for the signed-in buyer (instant access is the point)", async () => {
    await render("cs_test_mine");
    expect(requireUser).toHaveBeenCalled();
    expect(fulfillCheckout).toHaveBeenCalledWith("cs_test_mine");
  });
});
