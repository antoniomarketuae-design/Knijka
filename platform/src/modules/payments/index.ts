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
 * - Free tier:      checkPracticeQuota / requireEntitlementForExam —
 *                    exported but NOT wired; integration points are
 *                    documented in quota.ts.
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
export { createCheckoutSession, fulfillCheckout } from "./checkout";
export type { CheckoutSessionLike } from "./checkout";

// Free-tier quota helpers (not wired — see quota.ts header for the
// exact integration points in theory practice and startExamAction)
export {
  checkPracticeQuota,
  requireEntitlementForExam,
  sofiaDayRange,
  FREE_DAILY_PRACTICE_LIMIT,
  FREE_MOCK_EXAM_LIMIT,
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
} from "./store";

// Types + errors
export { PaymentsError } from "./types";
export type {
  PaymentsErrorCode,
  EntitlementSummary,
  FulfillResult,
  PracticeQuota,
} from "./types";
