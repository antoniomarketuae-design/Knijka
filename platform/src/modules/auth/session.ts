import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { SessionUser } from "./types";

/**
 * Server-side helper: the current user from the (JWT) session, or null.
 * Use in Server Components, Server Actions and Route Handlers.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return { id: user.id, email: user.email, name: user.name ?? null };
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
