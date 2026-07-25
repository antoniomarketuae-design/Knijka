/**
 * privacy module — public API (docs/architecture/05: modules talk only via
 * index.ts; deep imports are a review-blocking violation).
 *
 * Owns the two data-subject rights that a product for MINORS cannot ship
 * without (ADR-004, audit finding C-2):
 *
 * - Art. 15 / 20 access + portability: exportUserData(userId) → a single JSON
 *   document with everything personal we hold about that user, and nothing
 *   about anyone else. Credentials are excluded by construction.
 * - Art. 17 erasure: eraseUserAccount({userId, email, password}) → password
 *   re-auth, then a transactional delete of the User row and every dependent
 *   row, returning a receipt of what went.
 *
 * Both are consumed by the server actions in
 * src/app/(dashboard)/settings/actions.ts. Retention of payment documents is
 * a legal obligation handled at the payment provider, not here — see
 * /privacy#retention.
 *
 * Test seam: setPrivacyStore(InMemoryPrivacyStore) keeps unit tests off the
 * DB. Sharing the fake's `users` array with InMemoryAuthStore is what lets a
 * test prove an erased account can no longer log in.
 */

// Art. 15 / 20 — access and portability
export { exportUserData, exportFileName } from "./export";

// Art. 17 — erasure
export { eraseUserAccount, totalErasedRows } from "./erase";
export type { EraseAccountInput } from "./erase";

// Persistence seam (tests inject the in-memory fake)
export {
  setPrivacyStore,
  getPrivacyStore,
  InMemoryPrivacyStore,
} from "./store";
export type {
  PrivacyStore,
  PrivacyUserRecord,
  UserDataBundle,
} from "./store";

// Wire/format types
export { EXPORT_FORMAT, EXPORT_FORMAT_VERSION } from "./types";
export type {
  PersonalDataExport,
  ExportedAccount,
  ErasureReceipt,
  EraseAccountResult,
} from "./types";
