import type Stripe from "stripe";
import {
  fulfillCheckout,
  getStripeClient,
  getPaymentsStore,
  isStripeConfigured,
  livemodeMatchesDeclaredMode,
  declaredStripeMode,
  revokeAccessForPaymentIntent,
} from "@/modules/payments";

/**
 * Stripe webhook receiver (POST /api/stripe/webhook).
 *
 * Fulfillment authority: Stripe → here → fulfillCheckout(). The /checkout/return
 * page also fulfills best-effort for instant access, but THIS route
 * is the path that must never be skipped (user closes the tab before the
 * redirect, delayed payment methods, etc.). fulfillCheckout is idempotent,
 * so double delivery / both paths racing is safe.
 *
 * Raw-body rule (App Router): the signature is HMAC'd over the EXACT bytes
 * Stripe sent, so we read `await request.text()` and hand that string to
 * constructEventAsync. Never `request.json()` first — re-serialization
 * breaks verification. Route handlers get the raw body as-is (no bodyParser
 * config needed, unlike the old pages/api).
 *
 * Responses drive Stripe's retry machine:
 * - 2xx  → delivered (including events we deliberately ignore)
 * - 400  → bad signature / malformed — retrying won't help
 * - 500  → OUR failure (db down…) — Stripe retries with backoff, good
 * - 503  → Stripe env vars not configured — deploy-time misconfig, retry
 *
 * ============================================================================
 * WHAT A 200 MEANS, AND WHY IT USED TO LIE
 *
 * A 2xx tells Stripe "this event is delivered, never send it again". This
 * route used to answer 200 to EVERY `{status:"skipped"}` result. For
 * `not-paid` that is correct — the money has not moved and
 * `async_payment_succeeded` will arrive later. For `missing-metadata` it was a
 * permanent, silent loss: the card was charged, no entitlement was written,
 * and by answering 200 we told Stripe never to try again. The only trace was
 * one console.warn in a log with no rotation. That case now answers 500, so
 * Stripe retries for ~3 days and the StripeEvent row keeps the evidence
 * afterwards.
 *
 * EVERY VERIFIED EVENT IS PERSISTED FIRST, before any fulfilment work. A row
 * with processedAt NULL is a job someone can find and retry; an event that was
 * never written is a sale nobody knows was lost.
 * ============================================================================
 */

// Signature verification + Prisma need Node, not edge.
export const runtime = "nodejs";

/** Refund and dispute objects both carry the PaymentIntent — normalise it. */
function paymentIntentOf(object: unknown): string | null {
  const pi = (object as { payment_intent?: unknown })?.payment_intent;
  if (typeof pi === "string") return pi;
  if (pi && typeof pi === "object") {
    const id = (pi as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

/**
 * A refund that gave back LESS than the charge is a deliberate goodwill
 * gesture ("here is EUR 5 back, keep using it"), not an undo. Revoking access
 * there would be wrong. A dispute is never partial in this sense — the bank
 * takes the whole charge back — so only `charge.refunded` is asked.
 */
function isFullRefund(charge: unknown): boolean {
  const c = charge as { amount?: unknown; amount_refunded?: unknown };
  return typeof c?.amount === "number" && typeof c?.amount_refunded === "number"
    ? c.amount_refunded >= c.amount
    : true; // fields absent → treat as full, the safer direction for our margin
}

export async function POST(request: Request): Promise<Response> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!isStripeConfigured() || !webhookSecret) {
    return Response.json(
      { error: "stripe is not configured on this deployment" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "missing stripe-signature" }, { status: 400 });
  }

  const payload = await request.text(); // RAW body — see header comment

  let event: Stripe.Event;
  try {
    const stripe = await getStripeClient();
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
    );
  } catch (err) {
    console.warn("stripe webhook: signature verification failed", err);
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  // ---------------------------------------------------------------------
  // Persist FIRST. Everything below this line can fail; none of it may fail
  // without leaving a row behind.
  // ---------------------------------------------------------------------
  const store = getPaymentsStore();
  const receivedAt = new Date();
  try {
    const { isNew } = await store.recordStripeEvent({
      stripeEventId: event.id,
      type: event.type,
      payload: event,
      receivedAt,
    });
    if (!isNew) {
      console.info(`stripe webhook: redelivery of ${event.id} (${event.type})`);
    }
  } catch (err) {
    // We cannot even record that this happened — do NOT proceed to grant
    // access we would have no audit trail for. 500 → Stripe retries.
    console.error(`stripe webhook: could not record event ${event.id}`, err);
    return Response.json({ error: "could not record event" }, { status: 500 });
  }

  /** Close the event out; never let bookkeeping mask the real outcome. */
  const finish = async (error?: string): Promise<void> => {
    try {
      await store.markStripeEventProcessed(event.id, new Date(), error ?? null);
    } catch (err) {
      console.error(`stripe webhook: could not close event ${event.id}`, err);
    }
  };

  // ---------------------------------------------------------------------
  // MODE. `event.livemode` is the only trustworthy statement about whether
  // this is real money, and until now nothing in this codebase read it.
  //
  // The two directions are NOT symmetrical, so they do not get the same code:
  //  - a TEST event at a LIVE deployment is fake money. Never fulfil it, and
  //    400 because a retry would deliver the same test event forever.
  //  - a LIVE event at a deployment declared TEST is REAL money we are not
  //    ready to honour. 503, because Stripe retries a 503 for ~3 days — which
  //    is time for whoever set STRIPE_MODE to fix it and have the sale land.
  //    Answering 400 here would throw the purchase away permanently.
  // ---------------------------------------------------------------------
  if (!livemodeMatchesDeclaredMode(event.livemode)) {
    const message =
      `event ${event.id} is livemode=${event.livemode} but STRIPE_MODE ` +
      `declares "${declaredStripeMode()}"`;
    console.error(`stripe webhook: ${message} — refusing to process it`);
    await finish(message);
    return event.livemode
      ? Response.json({ error: "mode mismatch" }, { status: 503 })
      : Response.json({ error: "mode mismatch" }, { status: 400 });
  }

  // checkout.session.completed fires on checkout finish (payment_status may
  // still be "unpaid" for delayed methods — fulfillCheckout skips those);
  // async_payment_succeeded closes that gap when the money actually clears.
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      const result = await fulfillCheckout(session, new Date(), event.id);

      if (result.status === "skipped" && result.reason === "missing-metadata") {
        // A charged card with no grant behind it. See the header: a 200 here
        // is a permanent silent loss, so this is the one "skip" that must be
        // loud enough for Stripe to keep knocking.
        const message =
          `session ${session.id} was paid but carries no usable metadata ` +
          `(userId/pack) — charged with nothing to grant`;
        console.error(`stripe webhook: ${message}`);
        await finish(message);
        return Response.json({ error: "unfulfillable session" }, { status: 500 });
      }

      if (result.status === "receipt-without-grant") {
        // Delivered once, and the grant is gone BY DECISION — support revoked
        // this student's access, or the account was erased under Art. 17.
        // Nothing to do and nothing wrong: 200 so Stripe stops retrying.
        //
        // This line is the whole reason the case is named rather than
        // swallowed. Until it existed the same state threw, and the endpoint
        // answered 500 to every retry for ~3 days after an ORDINARY REVOKE —
        // a support action that silently turned into an outage.
        console.info(
          `stripe webhook: session ${session.id} was already fulfilled and its ` +
            `entitlement has since been revoked or erased — granting nothing`,
        );
      }

      if (result.status === "skipped") {
        // not-paid: correct and expected. The money has not moved; the
        // async_payment_succeeded event will bring us back here.
        console.info(
          `stripe webhook: session ${session.id} not yet paid — awaiting async_payment_succeeded`,
        );
      }
    } catch (err) {
      console.error(`stripe webhook: fulfillment failed for ${session.id}`, err);
      await finish(err instanceof Error ? err.message : String(err));
      // 500 → Stripe retries; fulfillment is idempotent so retries are safe.
      return Response.json({ error: "fulfillment failed" }, { status: 500 });
    }
  }

  // ---------------------------------------------------------------------
  // MONEY GOING BACK. Neither of these was handled: a refunded or disputed
  // student kept four months of access, and we kept paying Anthropic to serve
  // an AI tutor to someone who had been given their money back.
  // ---------------------------------------------------------------------
  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const object = event.data.object;
    const intent = paymentIntentOf(object);

    if (event.type === "charge.refunded" && !isFullRefund(object)) {
      console.info(
        `stripe webhook: partial refund on ${intent ?? "unknown intent"} — access left in place`,
      );
      await finish();
      return Response.json({ received: true });
    }

    if (!intent) {
      const message = `${event.type} ${event.id} carries no payment_intent — cannot find the purchase`;
      console.error(`stripe webhook: ${message}`);
      await finish(message);
      return Response.json({ error: "unresolvable refund" }, { status: 500 });
    }

    try {
      const result = await revokeAccessForPaymentIntent(intent);
      if (result.status === "revoked") {
        console.warn(
          `stripe webhook: ${event.type} — revoked ${result.revoked} entitlement(s) for session ${result.sessionId}`,
        );
      } else if (result.status === "unknown-payment") {
        // No receipt ⇒ no grant: the two are written in one transaction, so
        // there is genuinely nothing of ours to take back.
        console.info(
          `stripe webhook: ${event.type} for ${intent} — no receipt on file, nothing granted`,
        );
      } else {
        console.info(
          `stripe webhook: ${event.type} — session ${result.sessionId} had no entitlement to revoke`,
        );
      }
    } catch (err) {
      console.error(`stripe webhook: revocation failed for ${intent}`, err);
      await finish(err instanceof Error ? err.message : String(err));
      return Response.json({ error: "revocation failed" }, { status: 500 });
    }
  }

  await finish();
  return Response.json({ received: true });
}
