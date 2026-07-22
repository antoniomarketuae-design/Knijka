/** Error surface of the payments module (mirrors ExamError in @/modules/exam). */

export type PaymentsErrorCode =
  | "STRIPE_NOT_CONFIGURED"
  | "CHECKOUT_NO_URL"
  | "CHECKOUT_NO_CLIENT_SECRET"
  | "UNKNOWN_PACK";

export class PaymentsError extends Error {
  constructor(
    readonly code: PaymentsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PaymentsError";
  }
}

/** What the rest of the app asks about a user's paid access. */
export interface EntitlementSummary {
  /** Any active pack (premium includes core access). */
  hasCore: boolean;
  /** Active "premium_sim" pack (simulator access when it ships). */
  hasPremium: boolean;
  /**
   * Latest expiry among ACTIVE entitlements. `null` when the user has no
   * active entitlement — or when an active one never expires (promo grants
   * with expiresAt = null). Always check hasCore/hasPremium for access;
   * use activeUntil only for display.
   */
  activeUntil: Date | null;
}

/** Result of fulfilling a checkout — safe to call repeatedly (idempotent). */
export type FulfillResult =
  | { status: "created"; entitlementId: string }
  | { status: "already-fulfilled"; entitlementId: string }
  | { status: "skipped"; reason: "not-paid" | "missing-metadata" };

/** Daily free-tier practice allowance (see quota.ts for the rules). */
export interface PracticeQuota {
  /** May the user answer another practice question right now? */
  allowed: boolean;
  /**
   * Questions left today (Europe/Sofia calendar day).
   * `Number.POSITIVE_INFINITY` when `unlimited` is true.
   */
  remainingToday: number;
  /** The free-tier daily cap (constant, for UI copy: "X от 20"). */
  limit: number;
  /** True for users with an active pack — no daily cap applies. */
  unlimited: boolean;
}
