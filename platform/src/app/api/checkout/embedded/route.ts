import { getSessionUser } from "@/modules/auth";
import {
  createEmbeddedCheckoutSession,
  isPackId,
  isStripeConfigured,
  PaymentsError,
} from "@/modules/payments";

/**
 * POST /api/checkout/embedded — mint an embedded Checkout Session for the
 * signed-in user + requested pack and return its client_secret. The client
 * (EmbeddedCheckoutForm) hands this to Stripe's EmbeddedCheckoutProvider.
 *
 * The pack rides in the body; the userId comes from the SERVER session, never
 * the browser — so nobody can buy on someone else's behalf. Card, Apple Pay
 * and Revolut Pay all render inside Stripe's embedded UI.
 *
 * WHY EVERY FAILURE HERE IS TYPED (audit: "the last screen before the money
 * fails mute"). `createEmbeddedCheckoutSession` used to be awaited bare. The
 * ordinary, designed-for path through this product throws:
 *
 *   a 17-year-old ticks the two consent boxes, walks off to fetch a parent
 *   with a card, comes back 65 minutes later — and CHECKOUT_CONSENT_TTL_MINUTES
 *   is 60.
 *
 * Fetching a parent is the exact behaviour the parental-consent gate exists to
 * CREATE, so this is not an edge case; it is the feature working. The route
 * threw CONSENT_REQUIRED, Next answered 500, the throw resurfaced inside
 * Stripe's provider, and the student was left looking at a 560px empty card
 * with no message and no way back to the checkboxes.
 *
 * So the codes are chosen to be actionable by the CLIENT, not merely accurate:
 *   409 CONSENT_REQUIRED — the student can fix this herself in one click; the
 *       island resets the consent gate and she re-ticks. Not 403 (she is not
 *       forbidden) and not 400 (her request was fine — time passed).
 *   502 CHECKOUT_UNAVAILABLE — Stripe or our own wiring failed. Nothing she can
 *       do but retry, so say exactly that.
 * Both carry a machine-readable `code`, because "render Bulgarian copy the
 * student can act on" needs to branch on something other than a status number.
 */

// Prisma + the Stripe SDK need Node, not edge.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!isStripeConfigured()) {
    return Response.json(
      { code: "STRIPE_NOT_CONFIGURED", error: "stripe is not configured on this deployment" },
      { status: 503 },
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return Response.json({ code: "UNAUTHORIZED", error: "unauthorized" }, { status: 401 });
  }

  let pack: unknown;
  try {
    pack = ((await request.json()) as { pack?: unknown })?.pack;
  } catch {
    return Response.json({ code: "INVALID_BODY", error: "invalid body" }, { status: 400 });
  }
  if (!isPackId(pack)) {
    return Response.json({ code: "UNKNOWN_PACK", error: "unknown pack" }, { status: 400 });
  }

  try {
    const clientSecret = await createEmbeddedCheckoutSession(user.id, pack);
    return Response.json({ clientSecret });
  } catch (err) {
    if (err instanceof PaymentsError && err.code === "CONSENT_REQUIRED") {
      // Expected and recoverable — the TTL simply ran out while a parent was
      // being fetched. Logged at info level precisely so it does not train
      // anyone to ignore this route's error lines.
      console.info(
        `[checkout] consent expired for user ${user.id} / pack ${pack} — sending the buyer back to the boxes`,
      );
      return Response.json(
        { code: "CONSENT_REQUIRED", error: "checkout consent expired or missing" },
        { status: 409 },
      );
    }
    // Everything else is ours: a Stripe outage, a bad key, a session without a
    // client_secret. Never leak the message — it can quote credentials.
    console.error("[checkout] failed to mint an embedded session", err);
    return Response.json(
      { code: "CHECKOUT_UNAVAILABLE", error: "could not open the payment form" },
      { status: 502 },
    );
  }
}
