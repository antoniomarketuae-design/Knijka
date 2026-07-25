/**
 * Stripe client wiring, isolated so the rest of the module depends on a
 * MINIMAL structural interface (StripeCheckoutClient) instead of the full
 * SDK — tests inject a fake via setStripeClient(); production lazily builds
 * the real client from STRIPE_SECRET_KEY.
 *
 * Missing STRIPE_SECRET_KEY is a supported state, not a crash: callers check
 * isStripeConfigured() and degrade (pricing page renders "скоро" buttons,
 * webhook answers 503).
 */

import type Stripe from "stripe";
import { legalIdentityGaps } from "@/lib/legal/identity";
import { PaymentsError } from "./types";

/** The slice of the Stripe SDK this module actually uses. */
export interface StripeCheckoutClient {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
      ): Promise<Stripe.Checkout.Session>;
      retrieve(id: string): Promise<Stripe.Checkout.Session>;
    };
  };
  webhooks: {
    constructEventAsync(
      payload: string,
      header: string,
      secret: string,
    ): Promise<Stripe.Event>;
  };
}

let client: StripeCheckoutClient | null = null;

/**
 * True when the product may actually take money.
 *
 * TWO conditions, not one (audit 2026-07-24, finding C-1):
 *  1. Stripe credentials exist, and
 *  2. the seller/data-controller is a REAL registered entity — no remaining
 *     "[ИМЕ НА ЮРИДИЧЕСКО ЛИЦЕ]"-style placeholders in the legal identity.
 *
 * Condition 2 is the guard. Without it, setting a single environment variable
 * would start charging customers — many of them minors — under a privacy
 * policy and refund/GDPR contact that do not exist, silently and with no test
 * failing. Callers already degrade gracefully on `false` (pricing renders
 * "скоро", the checkout route and the webhook answer 503), so an unregistered
 * entity now fails CLOSED: the money path simply stays shut until the five
 * constants in lib/legal/identity.ts are filled in.
 */
export function isStripeConfigured(): boolean {
  if (!process.env.STRIPE_SECRET_KEY) return false;
  const gaps = legalIdentityGaps();
  if (gaps.length > 0) {
    // Loud on the server, invisible to the user: this is a launch-checklist
    // omission, not a runtime fault the customer can do anything about.
    console.error(
      "[payments] Checkout is DISABLED: Stripe is configured but the legal " +
        `identity is still placeholder text (${gaps.join(", ")}). ` +
        "Fill in platform/src/lib/legal/identity.ts — see docs/80_FULL_AUDIT_2026-07-24.md C-1.",
    );
    return false;
  }
  return true;
}

/** Tests inject a fake here (or null to reset back to the real SDK). */
export function setStripeClient(c: StripeCheckoutClient | null): void {
  client = c;
}

/**
 * The Stripe client, or throws PaymentsError("STRIPE_NOT_CONFIGURED").
 * Import of the SDK is lazy so cold paths (tests, pages without payments)
 * never pay for it.
 */
export async function getStripeClient(): Promise<StripeCheckoutClient> {
  if (client) return client;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new PaymentsError(
      "STRIPE_NOT_CONFIGURED",
      "STRIPE_SECRET_KEY is not set (see .env.example) — payments are disabled",
    );
  }
  const { default: StripeSdk } = await import("stripe");
  client = new StripeSdk(secretKey);
  return client;
}
