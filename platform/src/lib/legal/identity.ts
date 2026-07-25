/**
 * Legal identity of the data controller / seller — the single source of truth.
 *
 * These five facts appear in the Terms, Privacy Policy, Cookie Policy and
 * Contact pages, and they are what a paying customer (and, for a minor, their
 * parent) contracts with. Until the legal entity is registered they are
 * ALL-CAPS-BRACKET placeholders.
 *
 * WHY THIS IS A SEPARATE, REACT-FREE MODULE (audit 2026-07-24, finding C-1):
 * the placeholders are not merely cosmetic. With `STRIPE_SECRET_KEY` set, the
 * product would begin charging users — many of them minors — under a privacy
 * policy naming "[ИМЕ НА ЮРИДИЧЕСКО ЛИЦЕ]", with "[ИМЕЙЛ ЗА КОНТАКТ]" as the
 * only channel for GDPR requests, support and refunds. No test failed and no
 * error was logged on that transition; it was one environment variable away at
 * all times.
 *
 * So the constants live here, free of React, and the payments layer imports
 * `legalIdentityGaps()` to REFUSE to take money while any of them is unfilled
 * (see modules/payments/stripe.ts). Filling them in is what arms checkout —
 * you cannot forget, and you cannot trip it by accident.
 */

export const ENTITY_NAME = "[ИМЕ НА ЮРИДИЧЕСКО ЛИЦЕ]";
export const ENTITY_EIK = "[ЕИК]";
export const ENTITY_ADDRESS = "[АДРЕС]";
export const CONTACT_EMAIL = "[ИМЕЙЛ ЗА КОНТАКТ]";
export const LAST_UPDATED = "[ДАТА]";

/** An unfilled founder placeholder, e.g. "[ЕИК]" — ALL-CAPS inside brackets. */
const PLACEHOLDER = /^\s*\[.*\]\s*$/;

export function isPlaceholder(value: string): boolean {
  return PLACEHOLDER.test(value);
}

/**
 * The legal facts still unfilled, by name. Empty array = the entity is real and
 * the product may contract with a customer.
 */
export function legalIdentityGaps(): string[] {
  return Object.entries({
    ENTITY_NAME,
    ENTITY_EIK,
    ENTITY_ADDRESS,
    CONTACT_EMAIL,
    LAST_UPDATED,
  })
    .filter(([, v]) => isPlaceholder(v))
    .map(([k]) => k);
}

/** True once every legal fact is real. */
export function legalIdentityComplete(): boolean {
  return legalIdentityGaps().length === 0;
}
