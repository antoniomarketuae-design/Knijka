/**
 * Pack catalog — the SINGLE source of truth for what we sell.
 *
 * ============================================================
 * FOUNDER-ADJUSTABLE PRICING
 * Change `priceEurCents` here and the /pricing page, the Stripe
 * Checkout line item and the tests all follow. Prices are in
 * euro CENTS (1299 = 12,99 €). Keep them inside the corridor
 * from docs/business/41 (core €9.99–14.99, premium €19.99–24.99)
 * or update that doc + docs/02 first.
 * ============================================================
 *
 * CURRENCY DECISION (2026-07-07): EUR, not BGN.
 * Bulgaria adopted the euro on 2026-01-01 (ECB; fixed rate
 * 1 EUR = 1.95583 BGN). The lev's dual-circulation window closed
 * end of January 2026, so as of today EUR is the country's only
 * legal tender and the natural display + settlement currency.
 * Stripe charges in `eur`; no FX surprises for BG cards.
 *
 * Pack ids are a schema contract: Entitlement.pack stores exactly
 * "core" | "premium_sim" (see prisma/schema.prisma comment).
 *
 * COPY RULE (audit C-3): every bullet below must name something a FREE
 * account does not get, and something a gate in modules/payments/quota.ts
 * actually enforces. A bullet with no gate behind it is a false claim, and a
 * gate with no bullet is money left on the table — when you edit one, edit
 * the other in the same change.
 */

/** How long a purchased pack stays active (calendar months). */
export const PACK_ACCESS_MONTHS = 4;

/** ISO currency code for Stripe (lowercase, per Stripe API). */
export const PACK_CURRENCY = "eur";

export interface PackDefinition {
  /** Stored verbatim in Entitlement.pack — never rename casually. */
  id: "core" | "premium_sim";
  /** Product name shown on /pricing and in Stripe Checkout. */
  nameBg: string;
  /** One-line pitch under the name. */
  taglineBg: string;
  /** Line-item description shown in Stripe Checkout. */
  checkoutDescriptionBg: string;
  /** Founder-adjustable price in euro cents (see header). */
  priceEurCents: number;
  /** Access window in calendar months from purchase. */
  accessMonths: number;
  /** Feature bullets for the pricing card. */
  featuresBg: string[];
}

export const PACKS: Record<"core" | "premium_sim", PackDefinition> = {
  core: {
    id: "core",
    nameBg: "Пълна подготовка",
    taglineBg: "Всичко за теоретичния изпит — без ограничения.",
    checkoutDescriptionBg:
      "Еднократно плащане · 4 месеца пълен достъп до Книжка.AI: неограничена практика, пробни изпити и AI Учител.",
    priceEurCents: 1299, // 12,99 €
    accessMonths: PACK_ACCESS_MONTHS,
    featuresBg: [
      "Неограничена практика с обяснения",
      "Неограничени пробни изпити в официалния формат",
      "AI Учител — пълен достъп",
      // NOT „Оценка на готовността за изпит" — тя е безплатна за всеки акаунт
      // и няма гейт зад нея (C-3: не продаваме нещо, което вече е безплатно).
      "4 месеца достъп — еднократно плащане, без абонамент",
    ],
  },
  premium_sim: {
    id: "premium_sim",
    nameBg: "Изпит + Симулатор",
    taglineBg: "Пълната подготовка плюс шофьорския симулатор.",
    checkoutDescriptionBg:
      "Еднократно плащане · 4 месеца пълен достъп до Книжка.AI: всичко от „Пълна подготовка“ + шофьорски симулатор.",
    priceEurCents: 2199, // 21,99 €
    accessMonths: PACK_ACCESS_MONTHS,
    featuresBg: [
      "Всичко от „Пълна подготовка“",
      "Шофьорски симулатор — пълен достъп",
      "Симулаторни уроци, свързани с грешките ти от теорията",
    ],
  },
};

export type PackId = PackDefinition["id"];

export const PACK_IDS = Object.keys(PACKS) as PackId[];

export function isPackId(value: unknown): value is PackId {
  return typeof value === "string" && value in PACKS;
}

/** "12,99 €" — Bulgarian formatting for euro prices. */
export function formatPackPrice(priceEurCents: number): string {
  return new Intl.NumberFormat("bg-BG", {
    style: "currency",
    currency: "EUR",
  }).format(priceEurCents / 100);
}
