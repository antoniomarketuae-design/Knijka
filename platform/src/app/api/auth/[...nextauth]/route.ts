import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import {
  checkLockout,
  clearFailures,
  LOGIN_LOCKOUT,
  recordFailure,
  tooManyRequestsResponse,
} from "@/modules/security";

/**
 * next-auth's catch-all handler, plus the per-e-mail failed-login lockout
 * (audit 2026-07-24, H-8).
 *
 * WHY HERE and not inside `authorize()`: the lockout has to see the RESULT of
 * an attempt, and it has to be able to refuse one *before* any password work
 * happens — bcrypt cost 12 is ~250–320 ms of CPU, so answering a locked-out
 * attempt without ever touching the hash is half the point. This route is the
 * outermost thing that sees both the request and the response, which is
 * exactly the two ends the lockout needs.
 *
 * The per-IP budget on the same path lives in src/proxy.ts. They are
 * complementary, not redundant: the IP budget stops one host hammering the
 * endpoint, this stops a thousand hosts grinding ONE account.
 */

export const GET = handlers.GET;

/** next-auth's credentials sign-in endpoint — the only guessing surface here. */
const CREDENTIALS_CALLBACK = "/api/auth/callback/credentials";

/**
 * The e-mail from a sign-in POST, normalised the way the auth module stores
 * it, or null when this is not a credentials attempt we can key on.
 *
 * Read from a CLONE: consuming the body here would hand next-auth an
 * already-read stream. Never logged, never persisted — it lives only in the
 * in-process lockout map (ADR-004, minimal PII).
 */
async function attemptedEmail(request: NextRequest): Promise<string | null> {
  try {
    const form = await request.clone().formData();
    const email = form.get("email");
    if (typeof email !== "string") return null;
    const normalized = email.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  } catch {
    // Not a form body (or already consumed) — fall through unguarded rather
    // than break sign-in. The per-IP budget still applies.
    return null;
  }
}

/**
 * Did next-auth reject these credentials?
 *
 * Two shapes, because the client picks one: `signIn(..., { redirect: false })`
 * sends `X-Auth-Return-Redirect: 1` and gets 200 + `{url}`, while a plain form
 * post gets a 302 + `Location`. In both cases a rejected attempt carries
 * `?error=` (e.g. `CredentialsSignin`) on that URL and an accepted one does
 * not. Anything we cannot classify counts as NOT a failure — a lockout that
 * fires on our own bugs would lock real students out of their evening.
 */
async function wasRejected(response: Response): Promise<boolean> {
  const location = response.headers.get("location");
  if (location) return location.includes("error=");

  if (!response.headers.get("content-type")?.includes("application/json")) {
    return false;
  }
  try {
    const body = (await response.clone().json()) as { url?: unknown };
    return typeof body.url === "string" && body.url.includes("error=");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname !== CREDENTIALS_CALLBACK) {
    return handlers.POST(request);
  }

  const email = await attemptedEmail(request);
  if (!email) return handlers.POST(request);

  const waitSec = checkLockout(email, LOGIN_LOCKOUT);
  if (waitSec > 0) {
    // Deliberately the SAME 429 an IP-budget block returns: it must not become
    // an account-enumeration oracle ("this address exists and is locked out").
    return tooManyRequestsResponse(LOGIN_LOCKOUT.name, waitSec, request.url);
  }

  const response = await handlers.POST(request);
  if (await wasRejected(response)) {
    recordFailure(email, LOGIN_LOCKOUT);
  } else {
    // A correct password proves the account is not under attack right now.
    clearFailures(email, LOGIN_LOCKOUT);
  }
  return response;
}
