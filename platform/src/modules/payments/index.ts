/**
 * payments module — public API (docs/architecture/05: modules talk only via
 * index.ts; deep imports are a review-blocking violation).
 *
 * Monetization contract (docs/02 + docs/business/41): ONE-TIME packs in EUR
 * (Bulgaria's currency since 2026-01-01), each granting 4 months of access.
 * No subscriptions, no auto-renew — ever.
 *
 * Surfaces:
 * - Catalog:        PACKS / PackId / formatPackPrice (packs.ts is the single
 *                    price source — founder edits prices THERE only).
 * - Access:         getEntitlements(userId) → { hasCore, hasPremium,
 *                    activeUntil }. Premium implies core.
 * - Purchase:       createCheckoutSession(userId, pack) → Stripe Checkout
 *                    URL; fulfillCheckout(sessionIdOrObject) → idempotent
 *                    Entitlement creation (webhook + success page both call
 *                    it; providerRef = session id is the dedup key).
 * - Consent gate:   requiredCheckoutConsents / recordCheckoutConsent — the
 *                    parental approval (ЗЛС) and withdrawal waiver (ЗЗП) a
 *                    purchase needs. Neither session-creating function will
 *                    touch Stripe without them (consent.ts explains why).
 * - Free tier:      checkPracticeQuota / requireEntitlementForExam /
 *                    requireEntitlementForSimulator / checkTutorQuota — one
 *                    gate per paid row of the /pricing table, each wired at a
 *                    single server-side choke point (listed in quota.ts).
 * - Paid tutor cap: checkTutorPackAllowance — what a pack buys in tutor
 *                    questions (300), enforced inside askTutor. The one gate
 *                    here that limits a PAYING user; doc 81 §5.3.
 * - Ops:            isStripeConfigured() — missing STRIPE_SECRET_KEY must
 *                    degrade (disabled buy buttons), never crash.
 *
 * Test seams: setPaymentsStore(InMemoryPaymentsStore) and setStripeClient()
 * keep unit tests off the DB and off the real Stripe SDK.
 */

// Catalog (single source of truth for prices)
export {
  PACKS,
  PACK_IDS,
  PACK_ACCESS_MONTHS,
  PACK_CURRENCY,
  isPackId,
  formatPackPrice,
} from "./packs";
export type { PackDefinition, PackId } from "./packs";

// Entitlements
export {
  getEntitlements,
  summarizeEntitlements,
  isEntitlementActive,
  addMonths,
} from "./entitlements";

// Checkout + fulfillment
export {
  createCheckoutSession,
  createEmbeddedCheckoutSession,
  fulfillCheckout,
} from "./checkout";
export type { CheckoutSessionLike } from "./checkout";

// Purchase consent (H-9 parental approval + ЗЗП withdrawal waiver, M-24 versioning)
export {
  CHECKOUT_CONSENT_TEXTS_BG,
  CHECKOUT_CONSENT_CONTEXT,
  CHECKOUT_CONSENT_TTL_MINUTES,
  mayBeMinor,
  requiredCheckoutConsents,
  recordCheckoutConsent,
  findValidCheckoutConsent,
  checkoutConsentPath,
} from "./consent";
export type { CheckoutConsentKind, CheckoutConsentProof } from "./consent";

// Free-tier gates (see the quota.ts header for the four choke points)
export {
  checkPracticeQuota,
  requireEntitlementForExam,
  requireEntitlementForSimulator,
  checkTutorQuota,
  checkTutorPackAllowance,
  sofiaDayRange,
  FREE_DAILY_PRACTICE_LIMIT,
  FREE_MOCK_EXAM_LIMIT,
  FREE_TUTOR_LIFETIME_MESSAGES,
  TUTOR_PACK_QUESTION_ALLOWANCE,
} from "./quota";

// Stripe wiring
export { isStripeConfigured, setStripeClient, getStripeClient } from "./stripe";
export type { StripeCheckoutClient } from "./stripe";

// Persistence seam (tests inject the in-memory fake)
export {
  setPaymentsStore,
  getPaymentsStore,
  InMemoryPaymentsStore,
} from "./store";
export type {
  PaymentsStore,
  EntitlementRecord,
  CreateEntitlementInput,
  ConsentEventRecord,
  CreateConsentEventInput,
} from "./store";

// Types + errors
export { PaymentsError } from "./types";
export type {
  PaymentsErrorCode,
  EntitlementSummary,
  FulfillResult,
  PracticeQuota,
  TutorPackAllowance,
  TutorQuota,
} from "./types";
