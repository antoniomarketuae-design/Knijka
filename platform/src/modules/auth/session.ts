import { cache } from "react";
import { redirect } from "next/navigation";
import { getAuthStore } from "./store";
import type { SessionUser } from "./types";

/**
 * User.role, read fresh from the DB (never from the JWT or any client input):
 * a role change takes effect on the next request without re-login, and a
 * forged token cannot claim admin. React cache() dedupes the lookup within
 * one request (dashboard pages call getSessionUser several times).
 * Fail-closed: no DB / unknown row → "student".
 */
const roleForUser = cache(async (userId: string): Promise<string> => {
  try {
    return (await getAuthStore().findRoleById(userId)) ?? "student";
  } catch {
    return "student";
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
  const role = await roleForUser(user.id);
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    isAdmin: role === "admin",
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
