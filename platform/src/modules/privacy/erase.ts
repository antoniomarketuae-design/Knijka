/**
 * GDPR Art. 17 (erasure): the user deletes their own account, for real.
 *
 * "For real" means the User row and every dependent row are gone from our
 * database — no soft-delete flag, no anonymised tombstone. The only thing that
 * survives is what lives at the payment provider, which /privacy#retention
 * already tells the user about (accounting law, up to 10 years). We never held
 * card data ourselves, so there is nothing to anonymise here.
 *
 * Re-authentication is mandatory before the delete. The threat is not an
 * attacker with the password — they could already do anything — it is an
 * unlocked phone in a classroom. One password prompt turns a prank into a
 * non-event, and it costs a 17-year-old five seconds.
 */

import { verifyCredentials } from "@/modules/auth";
import { getPrivacyStore } from "./store";
import type { EraseAccountResult } from "./types";

export interface EraseAccountInput {
  /** From the SERVER session (requireUser()), never from the wire. */
  userId: string;
  /** From the SERVER session too — the wire supplies only the password. */
  email: string;
  /** Re-typed by the user in the confirmation panel. */
  password: string;
}

/**
 * Verifies the password, then erases the account and everything attached to
 * it. Returns a receipt of what was removed; on failure nothing is touched.
 */
export async function eraseUserAccount(
  input: EraseAccountInput,
  now: Date = new Date(),
): Promise<EraseAccountResult> {
  const store = getPrivacyStore();

  const bundle = await store.loadUserBundle(input.userId);
  // A session pointing at a missing row means the account is already gone
  // (double-submit, or a JWT that outlived its user). Nothing to do.
  if (!bundle) return { ok: false, error: "not_found" };

  // An account with no password cannot be re-authenticated at all. Say so
  // explicitly instead of rendering "грешна парола" at someone who never had
  // one — the UI routes them to the human channel. (No OAuth provider is
  // wired today; this is the guard for the day one is.)
  if (!bundle.user.hasPassword) return { ok: false, error: "no_password" };

  // Single credential check in the codebase — see auth/service.ts. The e-mail
  // comes from the session, so this cannot be pointed at another account.
  const verified = await verifyCredentials(input.email, input.password);
  if (!verified || verified.id !== input.userId) {
    return { ok: false, error: "wrong_password" };
  }

  const deleted = await store.eraseUser(input.userId);
  if (!deleted) return { ok: false, error: "not_found" }; // lost a race

  return {
    ok: true,
    receipt: {
      userId: input.userId,
      erasedAt: now.toISOString(),
      deleted,
    },
  };
}

/** Total dependent rows removed — for the "изтрихме N записа" confirmation. */
export function totalErasedRows(deleted: Record<string, number>): number {
  return Object.values(deleted).reduce((sum, n) => sum + n, 0);
}
