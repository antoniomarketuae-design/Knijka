/**
 * „Моите покупки" — what one student can see about her own money.
 *
 * THE PROBLEM THIS SOLVES. The product had no purchase history anywhere. A
 * student whose purchase went wrong could write only "платих, но не работи":
 * no amount, no date, no reference. The founder, on the other end, had nothing
 * to type into a Stripe search. Two people, one broken sale, and no shared
 * fact between them. That is not a missing feature, it is a support channel
 * that cannot conclude.
 *
 * WHY IT MERGES TWO TABLES INSTEAD OF LISTING ONE. An Entitlement is a GRANT
 * ("this account may use the sim until March") and an Payment is a RECEIPT
 * ("EUR 12.99 moved on 14 September"). They are written by different paths and
 * they can disagree — and every way they disagree is a real support case:
 *
 *   grant + receipt   the ordinary, healthy purchase.
 *   grant, no receipt a promo grant, or a purchase fulfilled before the ledger
 *                     existed. Access works; there is nothing to refund.
 *   receipt, no grant THE ONE THAT MATTERS. Money left her account and access
 *                     never arrived. Listing only Entitlements would render
 *                     this student an EMPTY page — the single worst screen the
 *                     product could show her, because it looks exactly like
 *                     "you never paid".
 *
 * So the merge is keyed on the Stripe Checkout Session — `Entitlement
 * .providerRef` and `Payment.stripeSessionId` are the same string — and a
 * receipt with no grant is deliberately kept, flagged, and told the truth about
 * on screen.
 *
 * GDPR (ADR-004): every read here is scoped to one userId by the store. This
 * function never takes a "list all purchases" shape, because nothing in the
 * student-facing app should be able to ask that question.
 */

import { PACKS, isPackId } from "./packs";
import { getPaymentsStore } from "./store";

/** One line of the student's purchase list. */
export interface PurchaseRow {
  /**
   * The Stripe Checkout Session id where there is one — the ONLY string that
   * means the same thing to the student, to us and to the Stripe dashboard.
   * Falls back to the entitlement id for promo grants, which have no session.
   */
  reference: string;
  /** Raw pack id as stored, so an unknown/retired pack still renders. */
  pack: string;
  /** Bulgarian pack name when the id is still in the catalogue, else null. */
  packNameBg: string | null;
  /** Receipt time when there is a receipt, otherwise the grant time. */
  at: Date;
  /** Access granted? False = paid but never fulfilled. */
  granted: boolean;
  /** End of the access window; null for a grant that never expires. */
  expiresAt: Date | null;
  /** null when there is no receipt (promo grant, or pre-ledger purchase). */
  amountCents: number | null;
  /** ISO 4217, lowercase, verbatim from Stripe. null with no receipt. */
  currency: string | null;
  /** Stripe payment_status (paid | unpaid | no_payment_required), or null. */
  status: string | null;
  /** stripe | promo | null — how the access was granted. */
  provider: string | null;
  /** FALSE = Stripe test mode. null with no receipt. Never hidden: a test-mode
   *  row on a real account is a thing support must be able to SEE. */
  livemode: boolean | null;
}

/** Formats an amount the way a Bulgarian buyer reads it: „12,99 €". */
export function formatPaidAmount(
  amountCents: number,
  currency: string,
): string {
  const symbol = currency.toLowerCase() === "eur" ? "€" : currency.toUpperCase();
  return `${(amountCents / 100).toFixed(2).replace(".", ",")} ${symbol}`;
}

/**
 * PUBLIC API: every purchase this user has, newest first.
 *
 * Empty array = she has genuinely never bought anything, which is a different
 * screen from "we have no idea" and the caller renders it as such.
 */
export async function listPurchases(userId: string): Promise<PurchaseRow[]> {
  const store = getPaymentsStore();
  const [entitlements, payments] = await Promise.all([
    store.listEntitlements(userId),
    store.listPayments(userId),
  ]);

  // sessionId → receipt. Payments arrive newest-first; a session id is unique
  // in the schema, so there is at most one receipt per key.
  const bySession = new Map(payments.map((p) => [p.stripeSessionId, p]));
  const claimed = new Set<string>();

  const rows: PurchaseRow[] = entitlements.map((e) => {
    const receipt = e.providerRef ? bySession.get(e.providerRef) : undefined;
    if (receipt) claimed.add(receipt.stripeSessionId);
    return {
      reference: e.providerRef ?? e.id,
      pack: e.pack,
      packNameBg: isPackId(e.pack) ? PACKS[e.pack].nameBg : null,
      at: receipt?.createdAt ?? e.purchasedAt,
      granted: true,
      expiresAt: e.expiresAt,
      amountCents: receipt?.amountCents ?? null,
      currency: receipt?.currency ?? null,
      status: receipt?.status ?? null,
      provider: e.provider,
      livemode: receipt?.livemode ?? null,
    };
  });

  // Receipts with no grant behind them — the broken purchase. Kept on purpose.
  for (const p of payments) {
    if (claimed.has(p.stripeSessionId)) continue;
    rows.push({
      reference: p.stripeSessionId,
      pack: p.pack,
      packNameBg: isPackId(p.pack) ? PACKS[p.pack].nameBg : null,
      at: p.createdAt,
      granted: false,
      expiresAt: null,
      amountCents: p.amountCents,
      currency: p.currency,
      status: p.status,
      provider: "stripe",
      livemode: p.livemode,
    });
  }

  return rows.sort((a, b) => b.at.getTime() - a.at.getTime());
}
