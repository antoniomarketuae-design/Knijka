/**
 * Shapes for the support surface (/admin). Kept out of service.ts so the store
 * seam and the route can both speak them without importing the logic.
 */

/**
 * The four mutations support can perform. A closed union, not a string: the
 * value is written into an append-only ledger and read back by a human under
 * pressure, so a typo that produces a fifth silent action kind is a defect.
 */
export const ADMIN_ACTION_KINDS = [
  "grant_entitlement",
  "revoke_entitlement",
  "reset_free_exams",
  "delete_attempt",
] as const;

export type AdminActionKind = (typeof ADMIN_ACTION_KINDS)[number];

export function isAdminActionKind(v: string): v is AdminActionKind {
  return (ADMIN_ACTION_KINDS as readonly string[]).includes(v);
}

/**
 * `Entitlement.provider` for a support grant.
 *
 * "promo" and never "stripe": the provider column is what tells a future
 * revenue report which access was PAID for. A support grant that claimed to be
 * a Stripe purchase would inflate every figure derived from that table and be
 * indistinguishable from real money forever. It is also why the unique index on
 * (provider, providerRef) is PARTIAL — promo grants carry no receipt id and
 * must stay repeatable.
 */
export const ADMIN_GRANT_PROVIDER = "promo";

/** Longest reason we will store. Long enough for a sentence, bounded on purpose. */
export const ADMIN_REASON_MAX = 400;
/** Shortest reason we will accept. „" is not a reason. */
export const ADMIN_REASON_MIN = 3;

// ---------------------------------------------------------------------------
// Read model — the dossier
// ---------------------------------------------------------------------------

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
  /** Extra free mock exams granted by support (User.freeExamGrants). */
  freeExamGrants: number;
}

export interface AdminEntitlementRow {
  id: string;
  pack: string;
  provider: string | null;
  providerRef: string | null;
  purchasedAt: Date;
  expiresAt: Date | null;
  /** Computed against `now` at read time — never stored. */
  active: boolean;
}

export interface AdminPaymentRow {
  id: string;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  pack: string;
  amountCents: number;
  currency: string;
  /** false = Stripe test mode. Shown, because a test payment is not revenue. */
  livemode: boolean;
  status: string;
  createdAt: Date;
}

export interface AdminExamAttemptRow {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  score: number | null;
  maxScore: number;
  passed: boolean | null;
  /**
   * Same three states the student sees (@/modules/exam). "expired" is the one
   * support is looking for: an attempt that can never be finished and is
   * nonetheless spending the account's free exam.
   */
  status: "in-progress" | "expired" | "completed";
}

/** What the tutor has cost us for this one account. */
export interface AdminTutorSpend {
  threads: number;
  questions: number;
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
}

/** The free-exam position, spelled out rather than left as arithmetic. */
export interface AdminFreeExamStatus {
  /** Lifetime attempts — the number requireEntitlementForExam counts. */
  attempts: number;
  /** FREE_MOCK_EXAM_LIMIT + grants. */
  allowance: number;
  grants: number;
  /** True when the account could start a free mock exam right now. */
  hasFreeExamLeft: boolean;
}

export interface AdminActionRow {
  id: string;
  actorId: string;
  actorEmail: string;
  action: AdminActionKind | string;
  subjectId: string | null;
  targetRef: string | null;
  reason: string;
  detail: unknown;
  createdAt: Date;
}

/** Everything /admin shows about one account, in one read. */
export interface AdminUserDossier {
  user: AdminUserSummary;
  entitlements: AdminEntitlementRow[];
  payments: AdminPaymentRow[];
  attempts: AdminExamAttemptRow[];
  tutor: AdminTutorSpend;
  freeExam: AdminFreeExamStatus;
  /** Newest first — what support has already done to this account. */
  history: AdminActionRow[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type AdminErrorCode =
  | "USER_NOT_FOUND"
  | "REASON_REQUIRED"
  | "INVALID_INPUT"
  | "NOT_FOUND" // the entitlement / attempt named does not belong to this user
  | "NOT_IN_PROGRESS"; // refusing to delete a graded attempt

export class AdminError extends Error {
  constructor(
    readonly code: AdminErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminError";
  }
}
