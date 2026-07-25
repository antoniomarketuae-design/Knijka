/**
 * Wire contract between the „Забравена парола?" server action (actions.ts) and
 * the client form that calls it.
 *
 * Separate file because a `"use server"` module may only export async
 * functions — the same reason settings/privacy-contract.ts exists.
 */

export type ForgotPasswordResult =
  /**
   * The neutral answer. Returned for a known address, an unknown one, a
   * silently rate-limited one AND a failed mail send — the screen must not
   * become an oracle for "does this student have an account" (modules/auth
   * reset.ts, decision 3).
   */
  | { status: "sent" }
  | { status: "error"; message: string };
