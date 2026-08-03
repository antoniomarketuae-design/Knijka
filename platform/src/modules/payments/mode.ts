/**
 * TEST MODE vs LIVE MODE — the one property of a payments deployment that
 * nothing in this codebase checked. Before this file, `grep -rn livemode src/`
 * returned zero lines: every Stripe object carries a `livemode` boolean and
 * the product read it nowhere, so a test-mode event and real revenue were
 * indistinguishable to every code path that touched money.
 *
 * WHY A DECLARED MODE AND NOT JUST THE KEY PREFIX.
 * The failure that actually costs money is a MIXED configuration — most often
 * a live `sk_live_…` paired with the `whsec_…` of the *test* endpoint, because
 * the two secrets are copied from two different Dashboard screens and only one
 * of them changes visibly when you flip the mode toggle. The symptom is brutal
 * and silent: every real webhook fails signature verification, the route
 * answers 400, Stripe treats 400 as a permanent rejection and does NOT retry —
 * so every live purchase is charged and never fulfilled while the Dashboard
 * quietly fills with red. No key prefix can catch that on its own; you need an
 * independent declaration of what this deployment believes it is, which is
 * what STRIPE_MODE is.
 *
 * DEFAULT IS "test", DELIBERATELY. A deployment that has not declared itself
 * live is not live. With a live key and no STRIPE_MODE, isStripeConfigured()
 * goes false — buy buttons render "скоро", the webhook answers 503 (which
 * Stripe DOES retry), and the server log says exactly which variable to set.
 * Nothing is charged and nothing is lost. The opposite default would let a
 * half-configured deployment take real money.
 */

import { PaymentsError } from "./types";

export type StripeMode = "test" | "live";

/**
 * What this deployment declares itself to be. Anything other than the literal
 * string "live" is treated as test — including typos, which is the safe
 * direction: an unrecognised value must never be read as "yes, take real
 * money". `stripeModeGaps()` reports the typo separately so it is not silent.
 */
export function declaredStripeMode(): StripeMode {
  return process.env.STRIPE_MODE?.trim().toLowerCase() === "live"
    ? "live"
    : "test";
}

/** True when `event.livemode` is what this deployment expects. */
export function livemodeMatchesDeclaredMode(livemode: boolean): boolean {
  return livemode === (declaredStripeMode() === "live");
}

/**
 * The mode a Stripe API key belongs to, read from its prefix, or `null` when
 * the key carries no mode marker (an unrecognised or truncated key).
 *
 * Covers both families Stripe issues: secret keys (`sk_test_…` / `sk_live_…`)
 * and restricted keys (`rk_test_…` / `rk_live_…`).
 */
export function stripeKeyMode(key: string): StripeMode | null {
  if (/^[a-z]{2}_live_/.test(key)) return "live";
  if (/^[a-z]{2}_test_/.test(key)) return "test";
  return null;
}

/**
 * Everything inconsistent about the money-mode configuration, as human
 * sentences — empty array means consistent.
 *
 * Separate from isStripeConfigured()'s boolean so the reason can be logged
 * once, precisely, instead of the operator staring at a disabled buy button.
 */
export function stripeModeGaps(): string[] {
  const gaps: string[] = [];

  const raw = process.env.STRIPE_MODE?.trim().toLowerCase();
  if (raw && raw !== "live" && raw !== "test") {
    gaps.push(
      `STRIPE_MODE="${process.env.STRIPE_MODE}" is not "test" or "live" (treated as "test")`,
    );
  }

  const declared = declaredStripeMode();
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (secretKey) {
    const keyMode = stripeKeyMode(secretKey);
    if (keyMode === null) {
      gaps.push(
        "STRIPE_SECRET_KEY has no sk_test_/sk_live_ prefix — its mode cannot be verified",
      );
    } else if (keyMode !== declared) {
      gaps.push(
        `STRIPE_SECRET_KEY is a ${keyMode}-mode key but STRIPE_MODE says "${declared}"`,
      );
    }
  }

  // The publishable key is what the browser mounts embedded Checkout with. A
  // live secret + test publishable produces a session the client cannot open;
  // it is the same copy-paste slip as the whsec_ one, one screen over.
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (publishable) {
    const pkMode = stripeKeyMode(publishable);
    if (pkMode !== null && pkMode !== declared) {
      gaps.push(
        `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is a ${pkMode}-mode key but STRIPE_MODE says "${declared}"`,
      );
    }
  }

  return gaps;
}

/**
 * Boot assertion for the money path: throws rather than building a Stripe
 * client whose mode disagrees with the deployment's own declaration.
 *
 * Called from getStripeClient(), which is the closest thing this app has to
 * "boot" for payments — the single place the real SDK is ever constructed.
 * isStripeConfigured() already returns false on the same condition, so in
 * normal flow nothing reaches here; this is the backstop for a caller that
 * skipped the check.
 */
export function assertStripeModeConsistent(): void {
  const gaps = stripeModeGaps();
  if (gaps.length === 0) return;
  throw new PaymentsError(
    "STRIPE_MODE_MISMATCH",
    `Stripe mode configuration is inconsistent: ${gaps.join("; ")}`,
  );
}
