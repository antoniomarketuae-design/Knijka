/**
 * Stripe Checkout: session creation + fulfillment.
 *
 * Money flow (one-time packs, docs/02 — NO subscriptions):
 *   1. createCheckoutSession() — mode "payment", pack metadata on the session.
 *   2. Student pays on Stripe's hosted page.
 *   3. fulfillCheckout() — called from the webhook (authoritative) AND
 *      best-effort from the /pricing success page (instant access).
 *      Both paths are safe because fulfillment is IDEMPOTENT: an Entitlement
 *      is only inserted if no row with the same providerRef (= session id)
 *      exists yet.
 *
 * CONSENT GATE (audit 2026-07-24, H-9): no session — hosted or embedded — is
 * ever created without a recorded parental approval (possible minors) and
 * withdrawal waiver for THIS pack. See consent.ts for why both are legally
 * load-bearing. The proof rides along in `metadata`, so acceptance is later
 * readable from Stripe-verified data and not only from our own database.
 *
 * Idempotency caveat: Entitlement.providerRef has no DB unique constraint
 * (schema is frozen for this task), so the check-then-insert leaves a tiny
 * race window between truly concurrent retries. Worst case is a duplicate
 * row granting the SAME pack — no security issue, only cosmetic. When the
 * schema thaws, add @@unique([provider, providerRef]) via ADR.
 */

import {
  checkoutConsentPath,
  findValidCheckoutConsent,
  type CheckoutConsentProof,
} from "./consent";
import { addMonths } from "./entitlements";
import { isPackId, PACK_CURRENCY, PACKS, type PackId } from "./packs";
import { getStripeClient } from "./stripe";
import { getPaymentsStore } from "./store";
import { PaymentsError, type FulfillResult } from "./types";

/** Base URL for Stripe redirects. Falls back to local dev. */
function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return url.replace(/\/+$/, "");
}

/**
 * Session metadata: the userId + pack fulfillment reads back, plus the consent
 * proof. Stripe stores metadata on the session and on the PaymentIntent, so a
 * later dispute ("my son bought this without me") is answered from Stripe's
 * own record, not only from a row in our database that we control.
 *
 * Values are plain strings (Stripe's metadata is string→string, 500 chars per
 * value) — three cuids and a date fit with room to spare.
 */
function sessionMetadata(
  userId: string,
  pack: PackId,
  consent: CheckoutConsentProof,
): Record<string, string> {
  return {
    userId,
    pack,
    consentIds: consent.ids.join(","),
    consentKinds: consent.kinds.join(","),
    consentTermsVersion: consent.docVersion,
    consentAt: consent.recordedAt.toISOString(),
  };
}

/**
 * PUBLIC API: send a buyer to the next step of the purchase and return the URL
 * to redirect to.
 *
 * Normally that is Stripe's hosted payment page. When no valid consent is on
 * file yet it is our own /checkout step instead — the one screen where the
 * parental approval and the withdrawal waiver are ticked. Returning a URL
 * rather than throwing is deliberate: the caller's whole job is "where do I
 * send this student next?", and answering "to the consent step" keeps the buy
 * button working while making it impossible to reach Stripe without consent.
 *
 * The userId + pack ride on session.metadata — fulfillment reads them back
 * from Stripe-verified data, never from the browser.
 */
export async function createCheckoutSession(
  userId: string,
  pack: PackId,
  now: Date = new Date(),
): Promise<string> {
  const def = PACKS[pack];
  if (!def) throw new PaymentsError("UNKNOWN_PACK", `Unknown pack "${pack}"`);

  const consent = await findValidCheckoutConsent(userId, pack, now);
  if (!consent) return checkoutConsentPath(pack);

  const stripe = await getStripeClient();
  const appUrl = getAppUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment", // one-time — never "subscription" (docs/02 monetization)
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: PACK_CURRENCY,
          unit_amount: def.priceEurCents,
          product_data: {
            name: `Книжка.AI — ${def.nameBg}`,
            description: def.checkoutDescriptionBg,
          },
        },
      },
    ],
    metadata: sessionMetadata(userId, def.id, consent),
    client_reference_id: userId,
    success_url: `${appUrl}/pricing?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pricing?status=cancelled`,
  });

  if (!session.url) {
    throw new PaymentsError(
      "CHECKOUT_NO_URL",
      `Stripe session ${session.id} came back without a redirect URL`,
    );
  }
  return session.url;
}

/**
 * PUBLIC API: open an EMBEDDED Checkout session for one pack and return its
 * client_secret — the on-site /checkout page mounts Stripe's embedded UI with
 * it. Same money flow + metadata as the hosted session above; only the
 * surface differs: `ui_mode: "embedded"` and a `return_url` instead of
 * success/cancel redirects. Card, Apple Pay and Revolut Pay all render INSIDE
 * the embedded UI (whatever is enabled in the Stripe Dashboard + eligible for
 * the buyer). Fulfillment is unchanged — webhook (authoritative) + the return
 * page both call fulfillCheckout(), keyed by the session id.
 *
 * Unlike the hosted variant this one THROWS when consent is missing instead of
 * returning a URL: its caller is a fetch() from a page that has already shown
 * the checkboxes, so the only way to get here without consent is to skip the
 * UI. Fail closed and loudly.
 */
export async function createEmbeddedCheckoutSession(
  userId: string,
  pack: PackId,
  now: Date = new Date(),
): Promise<string> {
  const def = PACKS[pack];
  if (!def) throw new PaymentsError("UNKNOWN_PACK", `Unknown pack "${pack}"`);

  const consent = await findValidCheckoutConsent(userId, pack, now);
  if (!consent) {
    throw new PaymentsError(
      "CONSENT_REQUIRED",
      `No valid checkout consent on file for user ${userId} / pack ${pack}`,
    );
  }

  const stripe = await getStripeClient();
  const appUrl = getAppUrl();

  const session = await stripe.checkout.sessions.create({
    ui_mode: "embedded_page", // this Stripe API pins the renamed value
    mode: "payment", // one-time — never "subscription" (docs/02)
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: PACK_CURRENCY,
          unit_amount: def.priceEurCents,
          product_data: {
            name: `Книжка.AI — ${def.nameBg}`,
            description: def.checkoutDescriptionBg,
          },
        },
      },
    ],
    metadata: sessionMetadata(userId, def.id, consent),
    client_reference_id: userId,
    return_url: `${appUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
  });

  if (!session.client_secret) {
    throw new PaymentsError(
      "CHECKOUT_NO_CLIENT_SECRET",
      `Stripe embedded session ${session.id} came back without a client_secret`,
    );
  }
  return session.client_secret;
}

/**
 * The fields fulfillment needs from a Checkout Session — satisfied both by
 * the full Stripe.Checkout.Session (webhook event payload / retrieve) and by
 * plain fakes in tests.
 */
export interface CheckoutSessionLike {
  id: string;
  /** "paid" | "unpaid" | "no_payment_required" */
  payment_status: string;
  metadata: { [key: string]: string } | null;
  client_reference_id?: string | null;
}

/**
 * PUBLIC API: turn a paid Checkout Session into an Entitlement row.
 *
 * Accepts either a session id (retrieved from Stripe — used by the success
 * page) or the session object itself (used by the webhook, already
 * signature-verified). Safe to call any number of times per session.
 *
 * expiresAt = fulfillment time + the pack's access window (4 months).
 * `now` is injectable for tests.
 */
export async function fulfillCheckout(
  sessionOrId: string | CheckoutSessionLike,
  now: Date = new Date(),
): Promise<FulfillResult> {
  const session: CheckoutSessionLike =
    typeof sessionOrId === "string"
      ? await (await getStripeClient()).checkout.sessions.retrieve(sessionOrId)
      : sessionOrId;

  // Unpaid (e.g. delayed payment methods) — the async_payment_succeeded
  // webhook will land here again once the money clears.
  if (
    session.payment_status !== "paid" &&
    session.payment_status !== "no_payment_required"
  ) {
    return { status: "skipped", reason: "not-paid" };
  }

  const userId = session.metadata?.userId ?? session.client_reference_id;
  const pack = session.metadata?.pack;
  if (!userId || !isPackId(pack)) {
    // A session we did not create (or corrupted metadata) — nothing to grant.
    return { status: "skipped", reason: "missing-metadata" };
  }

  const store = getPaymentsStore();

  // IDEMPOTENCY: one Entitlement per Stripe session, keyed by providerRef.
  const existing = await store.findEntitlementByProviderRef(
    "stripe",
    session.id,
  );
  if (existing) {
    return { status: "already-fulfilled", entitlementId: existing.id };
  }

  const created = await store.createEntitlement({
    userId,
    pack,
    purchasedAt: now,
    expiresAt: addMonths(now, PACKS[pack].accessMonths),
    provider: "stripe",
    providerRef: session.id,
  });
  return { status: "created", entitlementId: created.id };
}
