/**
 * Wire contract between the checkout consent action (actions.ts) and the
 * client island that drives it (consent-gate.tsx).
 *
 * Separate module for the same reason as settings/privacy-contract.ts: a
 * `"use server"` file may only export async functions, so a shared type or
 * constant cannot live there.
 */

// The client-safe surface, like the island that consumes this file — a
// type-only edge is erased anyway, but pointing both at the same place keeps
// the next edit from reaching for a value off the server barrel.
import type { CheckoutConsentKind } from "@/modules/payments/view";

export type CheckoutConsentState =
  /** Nothing submitted yet — the checkboxes are showing. */
  | { status: "idle" }
  /** Consent stored; the payment form may mount. */
  | { status: "accepted" }
  /** Bulgarian, ready to render. */
  | { status: "error"; message: string };

export const initialCheckoutConsentState: CheckoutConsentState = {
  status: "idle",
};

/** Checkbox `name` for one consent kind, in the form the action reads back. */
export function consentFieldName(kind: CheckoutConsentKind): string {
  return `consent_${kind}`;
}
