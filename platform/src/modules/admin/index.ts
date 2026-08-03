/**
 * admin module — public API (docs/architecture/05: modules talk only via
 * index.ts; deep imports are a review-blocking violation).
 *
 * The support surface behind /admin. One read (getUserDossier) and four
 * mutations, each of which writes an append-only AdminAction row naming the
 * admin who did it, in the same transaction as the change.
 *
 * The ROUTE owns authentication and authorisation — `user.isAdmin`, resolved
 * server-side from the session, exactly as review/calibration/page.tsx does it.
 * This module owns the rules: what a grant is allowed to be, what may never be
 * deleted, and that nothing happens without a written reason.
 */

export {
  getUserDossier,
  grantEntitlement,
  revokeEntitlement,
  restoreFreeExam,
  deleteStuckAttempt,
  type AdminActor,
} from "./service";

export {
  ADMIN_ACTION_KINDS,
  ADMIN_GRANT_PROVIDER,
  ADMIN_REASON_MAX,
  ADMIN_REASON_MIN,
  AdminError,
  isAdminActionKind,
} from "./types";

export type {
  AdminActionKind,
  AdminActionRow,
  AdminEntitlementRow,
  AdminErrorCode,
  AdminExamAttemptRow,
  AdminFreeExamStatus,
  AdminPaymentRow,
  AdminTutorSpend,
  AdminUserDossier,
  AdminUserSummary,
} from "./types";

// Persistence seam (tests inject the in-memory fake)
export {
  setAdminStore,
  getAdminStore,
  InMemoryAdminStore,
} from "./store";
export type {
  AdminStore,
  AdminAttemptRecord,
  AdminEntitlementRecord,
  AdminPaymentRecord,
  AdminTutorRecord,
  AdminUserRecord,
  CreateAdminActionInput,
  CreateGrantInput,
} from "./store";
