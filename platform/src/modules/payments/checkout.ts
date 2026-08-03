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
 * IDEMPOTENCY IS THE DATABASE'S JOB, NOT THIS FILE'S.
 *
 * What stood here until now was wrong, and the wrongness is why nobody fixed
 * it for a month: it called the race window "tiny", the duplicate "cosmetic",
 * and declared "no security issue". Two of those three claims are false.
 *
 *   - The window is not tiny. The two fulfilment paths do not merely happen to
 *     overlap, they are STARTED TOGETHER BY DESIGN: Stripe fires the webhook
 *     at the same moment it redirects the buyer to /checkout/return, and both
 *     call this function for the same session. Simultaneous delivery is the
 *     ordinary case, not the unlucky one.
 *   - The duplicate is not cosmetic. `checkTutorPackAllowance` multiplies the
 *     AI-tutor allowance by the number of active entitlement rows, so one
 *     duplicated row silently doubled what a EUR 12.99 pack costs us in model
 *     spend. A comment asserting harmlessness is what stopped anyone from
 *     checking whether anything read the row count. Something did.
 *
 * So the check-then-insert is gone. `store.recordPurchase()` writes the grant
 * and its receipt in ONE transaction and lets `@@unique([provider,
 * providerRef])` reject the second writer; the loser is reported as
 * already-fulfilled. Application code cannot make read-then-write atomic —
 * only the constraint can, and it now exists.
 */

import {
  checkoutConsentPath,
  findValidCheckoutConsent,
  type CheckoutConsentProof,
} from "./consent";
import { addMonths } from "./entitlements";
import { declaredStripeMode } from "./mode";
import { isPackId, PACK_CURRENCY, PACKS, type PackId } from "./packs";
import { getStripeClient } from "./stripe";
import { getPaymentsStore } from "./store";
import {
  PaymentsError,
  type FulfillResult,
  type RevokeResult,
} from "./types";

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
 * `customer_email` for a Checkout Session, or `{}` when we do not know it.
 *
 * WHY THIS MATTERS MORE HERE THAN IN MOST PRODUCTS. Without it Stripe asks the
 * payer to type an address and sends the receipt THERE — and this product is
 * sold to 17-year-olds who hand the phone to a parent to enter the card. The
 * address on the charge is therefore frequently not the account's, so the one
 * document proving the purchase lands in a mailbox that cannot log in, while
 * the student who owns the account has nothing. Pinning it to the account
 * e-mail also pre-fills the field, which is one less thing to mistype on a
 * phone, and it gives support a single address to search by.
 *
 * Never throws: a session that cannot read the e-mail must still be sellable.
 */
async function customerEmailParam(
  userId: string,
): Promise<{ customer_email?: string }> {
  try {
    const email = await getPaymentsStore().findUserEmail(userId);
    return email ? { customer_email: email } : {};
  } catch (err) {
    console.error("[payments] could not read the buyer's e-mail:", err);
    return {};
  }
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
    ...(await customerEmailParam(userId)),
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
    ...(await customerEmailParam(userId)),
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

  // --- the money, which nothing in this product read until now ---------------
  /** Total in the smallest currency unit. Stripe's number, never ours. */
  amount_total?: number | null;
  /** ISO 4217, lowercase ("eur"). */
  currency?: string | null;
  /** `pi_…`, or the expanded object. Null until the money actually moves. */
  payment_intent?: string | { id: string } | null;
  /** FALSE = Stripe test mode. */
  livemode?: boolean;
}

/** `payment_intent` arrives as an id or an expanded object — normalise it. */
function paymentIntentId(
  pi: string | { id: string } | null | undefined,
): string | null {
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id;
}

/**
 * PUBLIC API: turn a paid Checkout Session into an Entitlement AND its Payment
 * receipt — one transaction, one purchase.
 *
 * Accepts either a session id (retrieved from Stripe — used by the return
 * page) or the session object itself (used by the webhook, already
 * signature-verified). Safe to call any number of times per session, and safe
 * to call SIMULTANEOUSLY: the (provider, providerRef) unique constraint, not
 * this function, decides who wins.
 *
 * `rawEventId` is the `evt_…` that carried this session when a webhook did the
 * work, and null from /checkout/return, where there is no event — which is
 * exactly why Payment.rawEventId is a soft reference and not a foreign key.
 *
 * expiresAt = fulfillment time + the pack's access window (4 months).
 * `now` is injectable for tests.
 */
export async function fulfillCheckout(
  sessionOrId: string | CheckoutSessionLike,
  now: Date = new Date(),
  rawEventId: string | null = null,
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

  const result = await getPaymentsStore().recordPurchase({
    entitlement: {
      userId,
      pack,
      purchasedAt: now,
      expiresAt: addMonths(now, PACKS[pack].accessMonths),
      provider: "stripe",
      providerRef: session.id,
    },
    payment: {
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId(session.payment_intent),
      userId,
      pack,
      // Stripe's numbers, verbatim. `amount_total` is 0 for a 100%-off
      // promo code, and 0 is the truth there — it is NOT a missing value to
      // paper over with the catalogue price. The price in code changes; the
      // price someone paid does not.
      amountCents: session.amount_total ?? 0,
      currency: (session.currency ?? PACK_CURRENCY).toLowerCase(),
      // When Stripe did not say, believe the deployment's own declaration
      // rather than silently booking real money as test mode.
      livemode: session.livemode ?? declaredStripeMode() === "live",
      status: session.payment_status,
      rawEventId,
    },
  });

  // The money is recorded, the grant is deliberately absent, and re-granting
  // is exactly what must not happen — pass the state up rather than flattening
  // it into "already-fulfilled", which every caller reads as "they have it".
  if (result.status === "receipt-without-grant") {
    return { status: "receipt-without-grant", sessionId: result.stripeSessionId };
  }

  return result.status === "created"
    ? { status: "created", entitlementId: result.entitlement.id }
    : { status: "already-fulfilled", entitlementId: result.entitlement.id };
}

/**
 * PUBLIC API: take access back when the money goes back.
 *
 * Refund and dispute webhooks are keyed by PaymentIntent; entitlements are
 * keyed by Checkout Session. The Payment row is the only thing that joins the
 * two, which is the second reason the receipt had to exist: before it, a
 * refunded student kept four months of access and we kept paying Anthropic to
 * serve them.
 *
 * "No receipt" is reported, not guessed at. Because the grant and the receipt
 * are written in ONE transaction, a PaymentIntent we have no receipt for is a
 * PaymentIntent we granted nothing for — so there is genuinely nothing to
 * revoke, and the caller can answer 200 without hiding a loss.
 *
 * Access is ENDED, never deleted: `expiresAt = now` leaves the history intact.
 */
export async function revokeAccessForPaymentIntent(
  stripePaymentIntentId: string,
  now: Date = new Date(),
): Promise<RevokeResult> {
  const store = getPaymentsStore();
  const payment = await store.findPaymentByIntent(stripePaymentIntentId);
  if (!payment) return { status: "unknown-payment" };

  const revoked = await store.expireEntitlementsByProviderRef(
    "stripe",
    payment.stripeSessionId,
    now,
  );
  return revoked > 0
    ? { status: "revoked", sessionId: payment.stripeSessionId, revoked }
    : { status: "nothing-to-revoke", sessionId: payment.stripeSessionId };
}
