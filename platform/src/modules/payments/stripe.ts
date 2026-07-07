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

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
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
