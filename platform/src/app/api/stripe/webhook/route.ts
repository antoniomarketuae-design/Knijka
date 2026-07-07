import type Stripe from "stripe";
import {
  fulfillCheckout,
  getStripeClient,
  isStripeConfigured,
} from "@/modules/payments";

/**
 * Stripe webhook receiver (POST /api/stripe/webhook).
 *
 * Fulfillment authority: Stripe → here → fulfillCheckout(). The /pricing
 * success page also fulfills best-effort for instant access, but THIS route
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
 */

// Signature verification + Prisma need Node, not edge.
export const runtime = "nodejs";

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

  // checkout.session.completed fires on checkout finish (payment_status may
  // still be "unpaid" for delayed methods — fulfillCheckout skips those);
  // async_payment_succeeded closes that gap when the money actually clears.
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      const result = await fulfillCheckout(session);
      if (result.status === "skipped") {
        console.warn(
          `stripe webhook: session ${session.id} not fulfilled (${result.reason})`,
        );
      }
    } catch (err) {
      console.error(`stripe webhook: fulfillment failed for ${session.id}`, err);
      // 500 → Stripe retries; fulfillment is idempotent so retries are safe.
      return Response.json({ error: "fulfillment failed" }, { status: 500 });
    }
  }

  return Response.json({ received: true });
}
