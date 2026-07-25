/**
 * The two consents a purchase legally needs, and the gate that refuses to open
 * a payment without them (audit 2026-07-24, H-9 + M-24).
 *
 * The Terms have promised both of these since day one — /terms §6 requires a
 * parent's approval for an under-18 purchase, /terms §7 conditions instant
 * access on an explicit waiver of the 14-day withdrawal right — and neither
 * was ever asked for or recorded. Two different things went wrong:
 *
 * 1. ЗЛС (Закон за лицата и семейството): a 14–17-year-old contracts WITH
 *    their parents' approval. Without it the contract is avoidable — the
 *    family can finish the course and then unwind the sale. We already store
 *    the age (`User.birthYear`, collected at registration) and simply never
 *    read it; this module is where it is finally read.
 * 2. ЗЗП чл. 57, т. 13: the 14-day distance-selling withdrawal right survives
 *    unless the buyer expressly agrees that delivery starts immediately AND
 *    acknowledges losing the right. Un-waived, every buyer keeps a full refund
 *    claim while holding delivered digital goods.
 *
 * Design decisions worth knowing before editing:
 * - The wording lives in ./consentCopy, once, and the checkout UI renders
 *   those exact strings. A consent whose stored text differs from what was on
 *   screen is worse than no consent at all, so there is deliberately no second
 *   copy — and the copy sits in a leaf module precisely so the client island
 *   can share it without dragging this file's database reach into the browser.
 * - Consent is PER PURCHASE, not per account. The waiver concerns one
 *   contract, so a tick from last week may not authorise today's payment —
 *   hence the short TTL below rather than a "has ever consented" flag.
 * - Nothing here writes PII. A row is (userId, kind, version, text, time).
 */

import { PACKS, type PackId } from "./packs";
import { getPaymentsStore, type ConsentEventRecord } from "./store";
import { TERMS_VERSION } from "@/lib/legal/versions";
import { PaymentsError } from "./types";
import {
  CHECKOUT_CONSENT_TEXTS_BG,
  type CheckoutConsentKind,
} from "./consentCopy";

// Re-exported so the server surface stays a single import for callers — the
// split below is a bundling boundary, not a second API.
export { CHECKOUT_CONSENT_TEXTS_BG };
export type { CheckoutConsentKind };

/** ConsentEvent.context for everything this module writes. */
export const CHECKOUT_CONSENT_CONTEXT = "checkout";

/**
 * How long a recorded checkout consent may still authorise minting a payment.
 *
 * Long enough that a student can read the boxes, fetch a parent and type card
 * details without being timed out; short enough that the tick belongs
 * unmistakably to THIS purchase. Re-ticking is one click, so erring short is
 * cheap.
 */
export const CHECKOUT_CONSENT_TTL_MINUTES = 60;

/**
 * True when the buyer might still be under 18 on the day of the purchase.
 *
 * We store only a birth YEAR (ADR-004 keeps PII minimal — no birth date), so
 * the year alone cannot separate a 17-year-old from someone who turned 18 in
 * March. That ambiguity is resolved AGAINST the sale: everyone who could still
 * be 17 gets the parental gate. A false positive costs one extra checkbox; a
 * false negative costs a contract the family may later walk away from.
 *
 * A missing birthYear (no account has one today, but a future OAuth sign-up
 * would) is treated the same way, for the same reason.
 */
export function mayBeMinor(birthYear: number | null, now: Date): boolean {
  if (birthYear === null) return true;
  return now.getFullYear() - birthYear <= 18;
}

/**
 * PUBLIC API: which checkboxes /checkout must show this user — and which the
 * server will then insist on. The withdrawal waiver applies to everyone
 * (instant digital delivery); the parental one only to possible minors.
 */
export async function requiredCheckoutConsents(
  userId: string,
  now: Date = new Date(),
): Promise<CheckoutConsentKind[]> {
  const birthYear = await getPaymentsStore().findUserBirthYear(userId);
  return mayBeMinor(birthYear, now)
    ? ["parental_purchase", "withdrawal_waiver"]
    : ["withdrawal_waiver"];
}

/**
 * PUBLIC API: persist the ticked boxes as append-only proof, and return the
 * row ids so the caller can mirror them into the payment provider's metadata.
 *
 * Throws CONSENT_REQUIRED if a required box is missing — this is the server
 * copy of the check, and the only one that counts. Extra ticks that were not
 * required (an adult who ticks the parental box anyway) are recorded too:
 * refusing them would be pointless, and the row is honest either way.
 */
export async function recordCheckoutConsent(
  userId: string,
  pack: PackId,
  accepted: Partial<Record<CheckoutConsentKind, boolean>>,
  now: Date = new Date(),
): Promise<ConsentEventRecord[]> {
  if (!PACKS[pack]) {
    throw new PaymentsError("UNKNOWN_PACK", `Unknown pack "${pack}"`);
  }

  const required = await requiredCheckoutConsents(userId, now);
  const missing = required.filter((kind) => accepted[kind] !== true);
  if (missing.length > 0) {
    throw new PaymentsError(
      "CONSENT_REQUIRED",
      `Checkout consent missing: ${missing.join(", ")}`,
    );
  }

  const store = getPaymentsStore();
  const kinds = (Object.keys(CHECKOUT_CONSENT_TEXTS_BG) as CheckoutConsentKind[])
    .filter((kind) => accepted[kind] === true);

  const rows: ConsentEventRecord[] = [];
  for (const kind of kinds) {
    rows.push(
      await store.createConsentEvent({
        userId,
        kind,
        context: CHECKOUT_CONSENT_CONTEXT,
        docVersion: TERMS_VERSION,
        textBg: CHECKOUT_CONSENT_TEXTS_BG[kind],
        subject: pack,
        recordedAt: now,
      }),
    );
  }
  return rows;
}

/** What the payment path needs to know about a buyer's consent state. */
export interface CheckoutConsentProof {
  /** ConsentEvent ids, oldest first — mirrored into the Stripe metadata. */
  ids: string[];
  /** Document version every row agreed to. */
  docVersion: string;
  /** When the buyer last ticked (the newest row). */
  recordedAt: Date;
  /** Kinds actually on file for this purchase. */
  kinds: CheckoutConsentKind[];
}

/**
 * PUBLIC API: the consent that still authorises paying for `pack` right now,
 * or null. "Still" = recorded for THIS pack, against the CURRENT Terms
 * version, within the TTL.
 *
 * Rejecting a stale version is not pedantry: if the Terms were reworded after
 * the tick, the buyer agreed to different text than the one they would be
 * bound by, which is precisely the failure M-24 exists to prevent.
 */
export async function findValidCheckoutConsent(
  userId: string,
  pack: PackId,
  now: Date = new Date(),
): Promise<CheckoutConsentProof | null> {
  const since = new Date(now.getTime() - CHECKOUT_CONSENT_TTL_MINUTES * 60_000);
  const rows = await getPaymentsStore().listConsentEvents(
    userId,
    CHECKOUT_CONSENT_CONTEXT,
    since,
  );

  const usable = rows
    .filter((r) => r.subject === pack && r.docVersion === TERMS_VERSION)
    // listConsentEvents returns newest-first; ids read better oldest-first.
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  const kinds = usable.map((r) => r.kind) as CheckoutConsentKind[];
  const required = await requiredCheckoutConsents(userId, now);
  if (required.some((kind) => !kinds.includes(kind))) return null;

  return {
    ids: usable.map((r) => r.id),
    docVersion: TERMS_VERSION,
    // Sorted oldest-first above, so the last row is the newest tick.
    recordedAt: usable[usable.length - 1].recordedAt,
    kinds,
  };
}

/**
 * PUBLIC API: the on-site step that collects the consent for one pack. Both
 * purchase entry points route here when nothing is on file yet, so there is
 * exactly one screen in the product where these boxes are ticked.
 */
export function checkoutConsentPath(pack: PackId): string {
  return `/checkout?pack=${encodeURIComponent(pack)}`;
}
