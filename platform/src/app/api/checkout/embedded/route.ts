import { getSessionUser } from "@/modules/auth";
import {
  createEmbeddedCheckoutSession,
  isPackId,
  isStripeConfigured,
} from "@/modules/payments";

/**
 * POST /api/checkout/embedded — mint an embedded Checkout Session for the
 * signed-in user + requested pack and return its client_secret. The client
 * (EmbeddedCheckoutForm) hands this to Stripe's EmbeddedCheckoutProvider.
 *
 * The pack rides in the body; the userId comes from the SERVER session, never
 * the browser — so nobody can buy on someone else's behalf. Card, Apple Pay
 * and Revolut Pay all render inside Stripe's embedded UI.
 */

// Prisma + the Stripe SDK need Node, not edge.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!isStripeConfigured()) {
    return Response.json(
      { error: "stripe is not configured on this deployment" },
      { status: 503 },
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let pack: unknown;
  try {
    pack = ((await request.json()) as { pack?: unknown })?.pack;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  if (!isPackId(pack)) {
    return Response.json({ error: "unknown pack" }, { status: 400 });
  }

  const clientSecret = await createEmbeddedCheckoutSession(user.id, pack);
  return Response.json({ clientSecret });
}
