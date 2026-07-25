import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  clientIp,
  consumeRateLimit,
  rateLimitedResponse,
  rateLimitForRequest,
} from "@/modules/security";

/**
 * Next.js 16 proxy (the file convention formerly called middleware).
 *
 * Two jobs, in this order:
 *
 * 1. RATE LIMITING (audit 2026-07-24, H-8). This is the only place in the app
 *    that provably runs before every matched handler, and Next 16 runs proxy
 *    on the Node.js runtime — one long-lived process, so the in-process
 *    counters in @/modules/security actually accumulate. A guard bolted onto
 *    individual route files instead would be one forgotten route from useless.
 *    The budgets live in the module's policy table; nothing is decided here.
 *
 * 2. OPTIMISTIC AUTH. Decode the session JWT from the cookie — no DB access
 *    (it runs on every matched request, incl. prefetches). The secure,
 *    per-request check is requireUser()/getSessionUser() in modules/auth,
 *    which protected pages must call themselves.
 *
 * The order matters: an unauthenticated flood must be rejected BEFORE we spend
 * a JWT verification on it.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const rule = rateLimitForRequest(request.method, pathname);
  if (rule) {
    const verdict = consumeRateLimit(clientIp(request.headers), rule);
    if (!verdict.allowed) {
      return rateLimitedResponse(rule, verdict, request.url);
    }
  }

  // API routes are matched for the limiter ONLY — never redirect them to
  // /login: a fetch() answered with an HTML login page is the bug where the
  // caller parses a document as JSON and reports something unrelated. Each
  // route handler returns its own 401 (see /api/checkout/embedded).
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

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
  // Every authed area, so a logged-out deep link (e.g. /theory/practice)
  // round-trips through /login WITH callbackUrl and lands where it was headed.
  // requireUser() remains the secure per-request check on each page.
  //
  // The /api entries are here for the rate limiter, not for auth (see above).
  // Deliberately NOT `/api/:path*`: the Stripe webhook is signature-verified
  // and must never be delayed or refused by us, so our code stays out of its
  // path entirely.
  matcher: [
    "/dashboard/:path*",
    "/theory/:path*",
    "/exams/:path*",
    "/simulator/:path*",
    "/tutor/:path*",
    "/pricing/:path*",
    "/settings/:path*",
    // M-23: /checkout was absent from this list, so its pages were never even
    // optimistically guarded — /checkout/return called Stripe for anonymous
    // callers. The page now calls requireUser() too; this is the outer layer.
    "/checkout/:path*",
    "/api/register",
    "/api/auth/:path*",
    "/api/checkout/:path*",
  ],
};
