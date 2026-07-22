"use client";

import { useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import type { PackId } from "@/modules/payments";

/**
 * Client island: mounts Stripe Embedded Checkout for one pack. Stripe renders
 * the payment UI (card + Apple Pay + Revolut Pay — whatever the account has
 * enabled and the buyer is eligible for) inside our page; no card data ever
 * touches our origin. loadStripe runs once at module scope (a hard Stripe
 * requirement) using the public publishable key.
 */
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);

export function EmbeddedCheckoutForm({ pack }: { pack: PackId }) {
  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const res = await fetch("/api/checkout/embedded", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pack }),
    });
    if (!res.ok) {
      throw new Error(`checkout session request failed (${res.status})`);
    }
    const data = (await res.json()) as { clientSecret: string };
    return data.clientSecret;
  }, [pack]);

  return (
    <EmbeddedCheckoutProvider
      stripe={stripePromise}
      options={{ fetchClientSecret }}
    >
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  );
}
