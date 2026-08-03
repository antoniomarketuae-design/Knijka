/**
 * Minimal user shape exposed to the rest of the app.
 * GDPR (minors): never widen this with more PII than screens actually need.
 * (`isAdmin` is an internal access flag derived from User.role — not PII.)
 */
export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  /**
   * True when User.role === "admin". Resolved SERVER-SIDE (DB row via the
   * session user id) — never from client input. Admins bypass progression
   * gates (level star-locks, lesson order, freemium caps).
   */
  isAdmin: boolean;
  /**
   * User.sessionEpoch, present ONLY on the sign-in path (verifyCredentials →
   * next-auth's `authorize` → the jwt callback, which stamps it into the
   * token). Optional because no screen needs it: getSessionUser() compares the
   * token's epoch against the DB itself and returns null on a mismatch, so by
   * the time a page holds a SessionUser the question is already settled.
   */
  sessionEpoch?: number;
};
