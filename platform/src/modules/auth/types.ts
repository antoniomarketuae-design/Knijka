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
};
