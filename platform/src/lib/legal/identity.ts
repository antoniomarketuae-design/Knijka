/**
 * Legal identity of the data controller / seller — the single source of truth.
 *
 * These facts appear in the Terms, Privacy Policy, Cookie Policy and Contact
 * pages, and they are what a paying customer (and, for a minor, their parent)
 * contracts with. Until the seller is registered they are ALL-CAPS-BRACKET
 * placeholders.
 *
 * THE SELLER MAY BE A PERSON, NOT A COMPANY. The founder is registering for
 * Stripe under their own name, so the model carries a `SELLER_KIND`
 * discriminator and each form publishes only the facts it actually has: a
 * natural person has a name, an address and a contact and NO ЕИК; a Bulgarian
 * ЕТ/freelancer and a company do have one. Printing an empty "ЕИК:" line for a
 * private individual would be a false statement about who the customer is
 * contracting with, so the identifier is `null` — absent, not unfilled.
 *
 * NEVER ADD AN ЕГН (or any national ID) HERE. It is sensitive personal data,
 * it is not something a public policy page needs, and this module renders
 * straight into four public pages. If an identifier turns out to be required,
 * the answer is the ЕИК/БУЛСТАТ of a registered ЕТ/freelancer — switch
 * SELLER_KIND to "soleTrader" and fill in ENTITY_EIK.
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

/**
 * Which legal form sells the product and controls the data.
 *  - "naturalPerson" — a private individual selling in their own name
 *    (no trade register entry, therefore no ЕИК);
 *  - "soleTrader"    — a Bulgarian ЕТ or registered freelancer (has a
 *    ЕИК/БУЛСТАТ, still the same physical person);
 *  - "company"       — ЕООД/ООД/АД etc. (has an ЕИК).
 */
export type SellerKind = "naturalPerson" | "soleTrader" | "company";

/** The form the founder has actually registered under. Change this ONE line. */
export const SELLER_KIND: SellerKind = "naturalPerson";

/** Placeholder wording per form — a person has a name, a company has a firm. */
const NAME_PLACEHOLDER: Record<SellerKind, string> = {
  naturalPerson: "[ИМЕ И ФАМИЛИЯ НА ПРОДАВАЧА]",
  soleTrader: "[ИМЕ НА ЕДНОЛИЧНИЯ ТЪРГОВЕЦ]",
  company: "[ИМЕ НА ЮРИДИЧЕСКО ЛИЦЕ]",
};

/** How the identifier is labelled on the public pages ("ЕИК:" / "ЕИК/БУЛСТАТ:"). */
const ID_LABEL: Record<SellerKind, string> = {
  naturalPerson: "ЕИК/БУЛСТАТ",
  soleTrader: "ЕИК/БУЛСТАТ",
  company: "ЕИК",
};

/**
 * Trade-register placeholder per form — `null` where the form HAS no such
 * number, so the pages can omit the line instead of printing an empty one.
 * These are ЕИК/БУЛСТАТ values and NEVER an ЕГН (see the module header).
 */
const ID_PLACEHOLDER: Record<SellerKind, string | null> = {
  naturalPerson: null,
  soleTrader: `[${ID_LABEL.soleTrader}]`,
  company: `[${ID_LABEL.company}]`,
};

/** Label for the identifier line, e.g. "ЕИК" — used only when one exists. */
export const ENTITY_ID_LABEL: string = ID_LABEL[SELLER_KIND];

/** Name (person or firm) of the seller and data controller. */
export const ENTITY_NAME: string = NAME_PLACEHOLDER[SELLER_KIND];

/** Trade-register identifier, or `null` for a natural person, who has none. */
export const ENTITY_EIK: string | null = ID_PLACEHOLDER[SELLER_KIND];

/** Correspondence address customers, KZLD and KZP can actually reach. */
export const ENTITY_ADDRESS = "[АДРЕС ЗА КОРЕСПОНДЕНЦИЯ]";

/** The only channel for support, refunds and GDPR requests. */
export const CONTACT_EMAIL = "[ИМЕЙЛ ЗА КОНТАКТ]";

/** „Последна промяна“ shown at the top of every legal page. */
export const LAST_UPDATED = "[ДАТА]";

/** Names of the legal facts, as reported by legalIdentityGaps(). */
export type LegalFactName =
  | "ENTITY_NAME"
  | "ENTITY_EIK"
  | "ENTITY_ADDRESS"
  | "CONTACT_EMAIL"
  | "LAST_UPDATED";

/** An unfilled founder placeholder, e.g. "[ЕИК]" — ALL-CAPS inside brackets. */
const PLACEHOLDER = /^\s*\[.*\]\s*$/;

export function isPlaceholder(value: string): boolean {
  return PLACEHOLDER.test(value);
}

/**
 * The `href` a support/refund/GDPR link should point at, or `null` while the
 * address is still a placeholder.
 *
 * `null` is the load-bearing half. `mailto:[ИМЕЙЛ ЗА КОНТАКТ]` is not a link,
 * it is a dead one — a student who clicks it gets a compose window addressed to
 * a bracket, believes she has written to a human, and waits. So while the
 * founder has not filled the constant in, callers render the address as inert
 * text (which is what every page did before), and the MOMENT he sets it, every
 * one of them becomes a real mailto with no further edit. That is the whole
 * point of routing every call site through one function instead of five
 * hand-written anchors nobody will remember to update.
 */
export function contactEmailHref(address: string = CONTACT_EMAIL): string | null {
  // The parameter exists so BOTH branches are testable without mocking a module
  // constant. Production never passes it: the default is the single source.
  return isPlaceholder(address) ? null : `mailto:${address}`;
}

/**
 * The facts THIS seller form must publish, in render order. A fact the chosen
 * form does not have (a natural person's ЕИК) is absent from the map, so it is
 * never demanded and never rendered — while every fact that IS listed must be
 * real before the product may contract with a customer.
 */
export function requiredLegalFacts(): Partial<Record<LegalFactName, string>> {
  return {
    ENTITY_NAME,
    ...(ENTITY_EIK === null ? {} : { ENTITY_EIK }),
    ENTITY_ADDRESS,
    CONTACT_EMAIL,
    LAST_UPDATED,
  };
}

/**
 * The legal facts still unfilled, by name. Empty array = the seller is real and
 * the product may contract with a customer.
 */
export function legalIdentityGaps(): string[] {
  return Object.entries(requiredLegalFacts())
    .filter(([, v]) => isPlaceholder(v))
    .map(([k]) => k);
}

/** True once every legal fact required by the chosen seller form is real. */
export function legalIdentityComplete(): boolean {
  return legalIdentityGaps().length === 0;
}
