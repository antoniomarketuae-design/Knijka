import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Next.js 16 proxy (the file convention formerly called middleware).
 *
 * Optimistic auth check only: decode the session JWT from the cookie —
 * no DB access here (it runs on every matched request, incl. prefetches).
 * The secure, per-request check is requireUser()/getSessionUser() in
 * modules/auth, which protected pages must call themselves.
 */
export async function proxy(request: NextRequest) {
  const secret = process.env.AUTH_SECRET;

  // Cookie is `__Secure-authjs.session-token` on https, `authjs.session-token`
  // on http (dev) — try both so this works in every environment.
  // If AUTH_SECRET is missing we fail closed (treat as unauthenticated).
  const token = secret
    ? ((await getToken({ req: request, secret, secureCookie: true })) ??
      (await getToken({ req: request, secret, secureCookie: false })))
    : null;

  if (!token) {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set(
      "callbackUrl",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
