/** Error surface of the payments module (mirrors ExamError in @/modules/exam). */

export type PaymentsErrorCode =
  | "STRIPE_NOT_CONFIGURED"
  | "CHECKOUT_NO_URL"
  | "CHECKOUT_NO_CLIENT_SECRET"
  | "UNKNOWN_PACK"
  /** No parental approval / withdrawal waiver on file for this purchase (H-9). */
  | "CONSENT_REQUIRED";

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

/** Lifetime free-tier AI-tutor trial (see quota.ts for the rules). */
export interface TutorQuota {
  /** May the user send another question to the tutor right now? */
  allowed: boolean;
  /**
   * Questions left in the lifetime free trial.
   * `Number.POSITIVE_INFINITY` when `unlimited` is true.
   */
  remaining: number;
  /** The free-tier lifetime trial size (constant, for UI copy: "X от 5"). */
  limit: number;
  /**
   * True for users with an active pack — no TRIAL cap applies to them.
   *
   * Not the same as "no cap at all": what a pack buys is bounded by
   * TutorPackAllowance below, which is a different question asked at a
   * different choke point (askTutor, not the page's trial gate).
   */
  unlimited: boolean;
}

/**
 * What a PURCHASED pack buys in tutor questions (quota.ts
 * checkTutorPackAllowance; doc 81 §5.3 for the economics behind the number).
 *
 * Deliberately not a credit balance: it is counted from questions already
 * asked, never spent from a stored total, and it is only ever rendered as
 * questions — never as money (doc 81 §5.4).
 */
export interface TutorPackAllowance {
  /**
   * False when the account has NO active pack. Read this before `allowed`:
   * free accounts are governed by the lifetime trial (TutorQuota) instead, so
   * this rule has no opinion about them and says so rather than voting.
   */
  applies: boolean;
  /** May the user spend another question against the pack's allowance? */
  allowed: boolean;
  /** Questions asked inside the counted window. 0 when `applies` is false. */
  used: number;
  /**
   * Questions left in the pack. `Number.POSITIVE_INFINITY` when `applies` is
   * false — again, "this rule is not the one limiting you", not "unlimited".
   */
  remaining: number;
  /** The allowance this account has (TUTOR_PACK_QUESTION_ALLOWANCE per pack). */
  limit: number;
  /** Start of the counted window: the earliest ACTIVE purchase, else null. */
  since: Date | null;
}

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
