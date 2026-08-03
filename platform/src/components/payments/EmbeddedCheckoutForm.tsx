"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import type { PackId } from "@/modules/payments";
import {
  CheckoutFailureNotice,
  CheckoutPendingNotice,
  type CheckoutErrorCode,
} from "./CheckoutFailure";
import { requestCheckoutClientSecret } from "./checkoutSession";

/**
 * Client island: mounts Stripe Embedded Checkout for one pack. Stripe renders
 * the payment UI (card + Apple Pay + Revolut Pay — whatever the account has
 * enabled and the buyer is eligible for) inside our page; no card data ever
 * touches our origin. loadStripe runs once at module scope (a hard Stripe
 * requirement) using the public publishable key.
 *
 * WHY THIS FETCHES THE SECRET ITSELF INSTEAD OF HANDING STRIPE A CALLBACK.
 *
 * The obvious wiring — `options={{ fetchClientSecret }}` where the callback
 * throws on a bad response — is what shipped, and it is why the last screen
 * before the money failed MUTE. A throw inside `fetchClientSecret` happens deep
 * inside Stripe's provider: there is no error boundary of ours in that stack,
 * nothing of ours re-renders, and the 560px card on /checkout simply stays
 * empty. No message, no retry, no way back to the consent checkboxes. That is
 * the state a student reached by doing the one thing the parental-consent gate
 * is DESIGNED to make her do: leave, fetch a parent with a card, come back —
 * 65 minutes later, against a 60-minute consent TTL.
 *
 * So the request happens HERE, in a component that can render its own failure.
 * Stripe is only mounted once a secret exists, and by then its callback cannot
 * fail: it resolves an already-held string.
 *
 * The outcomes a student can actually be in are separate screens:
 *   409 CONSENT_REQUIRED — her consent aged out. Not a fault of hers and not
 *       retryable in place: the fix is to tick the boxes again, so we tell the
 *       consent gate to reopen (`onConsentExpired`) and let the ONE CLICK the
 *       flow assumes actually exist on screen.
 *   any other failure   — CheckoutFailureNotice: Bulgarian copy that leads with
 *       "nothing was charged", plus a retry.
 *   in flight           — CheckoutPendingNotice, so the tall card is never
 *       blank-with-no-explanation even for the two seconds before Stripe
 *       answers.
 */
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);

type State =
  | { phase: "loading" }
  | { phase: "ready"; clientSecret: string }
  | { phase: "error"; code: CheckoutErrorCode };

export function EmbeddedCheckoutForm({
  pack,
  onConsentExpired,
}: {
  pack: PackId;
  /**
   * Called when the server says the recorded consent no longer authorises this
   * payment (409). The consent gate uses it to show its checkboxes again — the
   * island itself renders nothing in that case, because the fix lives upstairs.
   */
  onConsentExpired?: () => void;
}) {
  const [state, setState] = useState<State>({ phase: "loading" });
  // Bumped by the retry button; the effect keys off it.
  const [attempt, setAttempt] = useState(0);
  // `onConsentExpired` is typically an inline arrow, so it changes identity on
  // every render of the parent. Reading it through a ref keeps it out of the
  // effect's dependency list — otherwise every parent render would re-run the
  // effect and mint a fresh Stripe session.
  const onConsentExpiredRef = useRef(onConsentExpired);
  onConsentExpiredRef.current = onConsentExpired;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setState({ phase: "loading" });

      // Cannot throw — see checkoutSession.ts. That is the entire fix.
      const result = await requestCheckoutClientSecret(pack);
      if (cancelled) return;

      if (result.ok) {
        setState({ phase: "ready", clientSecret: result.clientSecret });
        return;
      }

      if (result.code === "CONSENT_REQUIRED") {
        // Hand control back to the gate rather than drawing a dead end here.
        onConsentExpiredRef.current?.();
      }
      setState({ phase: "error", code: result.code });
    })();

    return () => {
      cancelled = true;
    };
  }, [pack, attempt]);

  // Stripe insists on a callback; by now it only has to hand back a string we
  // already hold, so it has no failure mode left.
  const clientSecret = state.phase === "ready" ? state.clientSecret : null;
  const fetchClientSecret = useCallback(
    async () => clientSecret ?? "",
    [clientSecret],
  );

  if (state.phase === "loading") return <CheckoutPendingNotice />;

  if (state.phase === "error") {
    if (state.code === "CONSENT_REQUIRED") {
      // The gate is re-rendering the checkboxes above us this very render; a
      // second message here would only be noise on the same screen.
      return null;
    }
    return (
      <CheckoutFailureNotice
        code={state.code}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }

  return (
    <EmbeddedCheckoutProvider
      // Remounting on a new secret is required: the provider reads it once.
      key={state.clientSecret}
      stripe={stripePromise}
      options={{ fetchClientSecret }}
    >
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  );
}
