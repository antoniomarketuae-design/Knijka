/**
 * The words a buyer actually reads next to each consent checkbox — and nothing
 * else.
 *
 * This file is deliberately a LEAF: zero imports, so it can be pulled into a
 * client island without dragging anything behind it. The gate that uses this
 * copy (consent.ts) reads `User.birthYear` and writes `ConsentEvent` rows, so
 * it reaches the Prisma store and through it the `pg` driver — importing the
 * copy from there put `node:net`/`node:tls` in the browser graph and failed the
 * production build outright. Splitting the strings out is what lets the SAME
 * string be rendered and stored.
 *
 * That single-copy rule is the whole point and is not stylistic: a consent
 * whose stored proof differs from what was on screen is worse than no consent
 * at all. Edit the wording HERE and both sides move together.
 */

/** The consent kinds a checkout can require. Stored verbatim in ConsentEvent.kind. */
export type CheckoutConsentKind = "parental_purchase" | "withdrawal_waiver";

/**
 * The exact Bulgarian shown next to each checkbox — and stored as the proof.
 *
 * Written to be understood by a 17-year-old, not by a lawyer: it says what
 * happens, in the second person, and names the article only in brackets at the
 * end. No "с настоящото декларирам".
 */
export const CHECKOUT_CONSENT_TEXTS_BG: Record<CheckoutConsentKind, string> = {
  parental_purchase:
    "Родител или настойник знае за тази покупка и е съгласен с нея. " +
    "Под 18 години покупката се прави с негово одобрение.",
  withdrawal_waiver:
    "Искам достъпът ми да се отключи веднага след плащането. Знам, че " +
    "с това губя правото си да се откажа от покупката в 14-дневния срок " +
    "(чл. 57, т. 13 ЗЗП).",
};
