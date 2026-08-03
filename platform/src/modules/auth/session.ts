import { cache } from "react";
import { redirect } from "next/navigation";
import { getAuthStore, type AccountFlags } from "./store";
import type { SessionUser } from "./types";

/**
 * User.role AND User.sessionEpoch, read fresh from the DB (never from the JWT
 * or any client input) in ONE cached query per request:
 *
 * - `role`: a role change takes effect on the next request without re-login,
 *   and a forged token cannot claim admin.
 * - `sessionEpoch`: the revocation counter. Sessions here are stateless JWTs
 *   with a 30-day idle life and no Session table, so before this column a
 *   shared password could not be taken back — resetting it left the friend who
 *   already knew it signed in for another month. Comparing the epoch stamped
 *   into the token against the one on the row is what makes "sign out
 *   everywhere" mean something, and it rides along in a query getSessionUser
 *   was making anyway.
 *
 * React cache() dedupes the lookup within one request (dashboard pages call
 * getSessionUser several times).
 *
 * Fail-closed on ROLE, fail-open on IDENTITY: no DB / unknown row → "student"
 * with epoch 0. A database blip must not sign the entire userbase out (nothing
 * else works without the DB either), and an unknown row is the GDPR-erased
 * account, which the delete action already signs out explicitly.
 */
const FALLBACK: AccountFlags = { role: "student", sessionEpoch: 0 };

const accountForUser = cache(async (userId: string): Promise<AccountFlags> => {
  try {
    return (await getAuthStore().findAccountById(userId)) ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
});

/**
 * Server-side helper: the current user from the (JWT) session, or null.
 * Use in Server Components, Server Actions and Route Handlers.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  // Lazy, for the same reason the stores import Prisma lazily: a static
  // `import { auth } from "@/auth"` makes the whole next-auth runtime a load
  // -time dependency of this module's public index, which any unit test of a
  // module that merely *imports* @/modules/auth (e.g. @/modules/privacy) then
  // has to boot. Deferring it costs one resolved-module lookup per request.
  const { auth } = await import("@/auth");

  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;

  const account = await accountForUser(user.id);

  // REVOCATION. Tokens issued before this column existed carry no epoch at all;
  // they read as 0, which is every account's default, so nobody is signed out
  // by the deploy that lands this — only by an actual bump.
  const tokenEpoch =
    typeof user.sessionEpoch === "number" ? user.sessionEpoch : 0;
  if (tokenEpoch !== account.sessionEpoch) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    isAdmin: account.role === "admin",
  };
}

/**
 * Server-side guard: returns the user or redirects to /login.
 * This is the *secure* check (per-request), the proxy redirect is only the
 * optimistic one — protected pages/actions must call this themselves.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
