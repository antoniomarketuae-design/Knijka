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
import { legalIdentityGaps } from "@/lib/legal/identity";
import { mailDeliveryGaps } from "@/modules/mail";
import { assertStripeModeConsistent, stripeModeGaps } from "./mode";
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

/**
 * True when the product may actually take money.
 *
 * FOUR conditions, not one:
 *  0. the money path is WHOLE — secret key, webhook signing secret, and keys
 *     whose test/live mode matches what this deployment declares. A buy button
 *     must never go live while the authoritative fulfilment path is absent or
 *     pointed at the wrong mode, and
 *  1. Stripe credentials exist, and
 *  2. the seller/data-controller is a REAL registered entity — no remaining
 *     "[ИМЕ НА ЮРИДИЧЕСКО ЛИЦЕ]"-style placeholders in the legal identity
 *     (audit 2026-07-24, finding C-1), and
 *  3. this deployment can actually SEND E-MAIL, i.e. `MAIL_TRANSPORT` names a
 *     provider with credentials and a verified sender.
 *
 * Conditions 2 and 3 are the same guard applied to the two halves of one
 * promise, and they are deliberately written the same way — two functions that
 * each answer "which facts are still missing?" with a list of names.
 *
 * Condition 2: without it, setting a single environment variable would start
 * charging customers — many of them minors — under a privacy policy and
 * refund/GDPR contact that do not exist, silently and with no test failing.
 *
 * Condition 3: the product would otherwise happily take EUR 12.99 from a
 * 17-year-old and then have NO WAY TO GIVE THE ACCOUNT BACK. The mail module
 * fails soft to a console transport on five separate paths and warns once per
 * process; the live environment has no MAIL_* variables at all. A student who
 * forgets her password in October gets a reassuring Bulgarian success screen
 * while the reset link goes to a server log. Refusing to take money without a
 * recovery channel is the structural fix — it cannot be forgotten, and it
 * cannot regress silently.
 *
 * Callers already degrade gracefully on `false` (pricing renders "скоро", the
 * checkout route and the webhook answer 503), so every one of these fails
 * CLOSED rather than taking money it cannot honour.
 */
export function isStripeConfigured(): boolean {
  if (!process.env.STRIPE_SECRET_KEY) return false;

  // Condition 1b: the WEBHOOK secret, without which the only AUTHORITATIVE
  // fulfilment path does not exist. This check was missing, and its absence is
  // the most expensive kind of half-configuration there is: buy buttons go
  // live, Stripe takes the money, /api/stripe/webhook answers 503 to every
  // delivery, and access arrives only for the buyers who happen to come back
  // through /checkout/return. Anyone who closes the tab on the Stripe page —
  // or pays by a delayed method, where there is no return trip at all — is
  // charged and gets nothing. A secret key alone must not be enough to sell.
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error(
      "[payments] Checkout is DISABLED: STRIPE_SECRET_KEY is set but " +
        "STRIPE_WEBHOOK_SECRET is not. Selling without the webhook means " +
        "charging buyers whose access then depends on them not closing the tab. " +
        "Add the signing secret of /api/stripe/webhook (see .env.example).",
    );
    return false;
  }

  // Condition 1c: test/live coherence. A live key with the test endpoint's
  // whsec_ fails EVERY signature check, and Stripe does not retry a 400 — so
  // every real purchase goes unfulfilled while the Dashboard fills with red.
  // mode.ts explains why a declared STRIPE_MODE is what catches it.
  const modeGaps = stripeModeGaps();
  if (modeGaps.length > 0) {
    console.error(
      "[payments] Checkout is DISABLED: the Stripe mode configuration is " +
        `inconsistent (${modeGaps.join("; ")}). Fix STRIPE_MODE and the keys ` +
        "so they agree — see src/modules/payments/mode.ts.",
    );
    return false;
  }

  const gaps = legalIdentityGaps();
  if (gaps.length > 0) {
    // Loud on the server, invisible to the user: this is a launch-checklist
    // omission, not a runtime fault the customer can do anything about.
    console.error(
      "[payments] Checkout is DISABLED: Stripe is configured but the legal " +
        `identity is still placeholder text (${gaps.join(", ")}). ` +
        "Fill in platform/src/lib/legal/identity.ts — see docs/80_FULL_AUDIT_2026-07-24.md C-1.",
    );
    return false;
  }

  const mailGaps = mailDeliveryGaps();
  if (mailGaps.length > 0) {
    console.error(
      "[payments] Checkout is DISABLED: Stripe and the legal identity are ready " +
        `but this deployment cannot send e-mail (${mailGaps.join(", ")}). ` +
        "A paid account with no password-reset delivery is an account we cannot " +
        "give back. Set the MAIL_* variables (see .env.example) — /api/health " +
        "reports the same state under checks.mail.",
    );
    return false;
  }

  return true;
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
  // The closest thing payments has to "boot": the ONE place the real SDK is
  // ever constructed. Refuse to build a client whose mode disagrees with what
  // this deployment declares itself to be — a mixed configuration must fail
  // loudly here rather than quietly at the first live webhook.
  assertStripeModeConsistent();
  const { default: StripeSdk } = await import("stripe");
  client = new StripeSdk(secretKey);
  return client;
}
