"use server";

/**
 * Server action for the /pricing buy buttons.
 *
 * Flow: requireUser → createCheckoutSession (payments module) → redirect to
 * Stripe's hosted payment page. Every failure path lands back on /pricing
 * with a ?status=... banner — the student is never shown a crash.
 *
 * Business logic (packs, prices, Stripe) lives in @/modules/payments;
 * this file only adapts it to the form post.
 */

import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth";
import {
  createCheckoutSession,
  isPackId,
  isStripeConfigured,
} from "@/modules/payments";

/** „Купи" — form action on /pricing (hidden input: pack). */
export async function buyPackAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  // Server actions are public endpoints: never trust the wire shape.
  const packRaw = formData.get("pack");
  if (typeof packRaw !== "string" || !isPackId(packRaw)) {
    redirect("/pricing?status=error");
  }

  if (!isStripeConfigured()) {
    // Buttons render disabled without a key, but the endpoint stays honest
    // for hand-crafted posts.
    redirect("/pricing?status=unavailable");
  }

  let checkoutUrl: string | null = null;
  try {
    checkoutUrl = await createCheckoutSession(user.id, packRaw);
  } catch (err) {
    console.error("pricing: failed to create Stripe checkout session", err);
  }
  if (!checkoutUrl) redirect("/pricing?status=error");

  redirect(checkoutUrl); // off to Stripe's hosted page
}
