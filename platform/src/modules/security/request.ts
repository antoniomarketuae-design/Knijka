/**
 * Turning an HTTP request into a rate-limit KEY, and a block into a response.
 *
 * Kept away from `next/server` on purpose: route handlers, the proxy and the
 * unit tests all take plain `Request`/`Headers`, so this file has no framework
 * dependency and every one of its branches is testable with a bare `Request`.
 */

import type { RateLimitRule, RateLimitVerdict } from "./rateLimit";

/**
 * Best-effort client IP.
 *
 * WHICH HEADER TO TRUST is the whole question. `x-forwarded-for` is APPENDED
 * to, so its leftmost entry is whatever the client sent — free to forge, and
 * forging it defeats an IP limiter completely. The headers a proxy OVERWRITES
 * are the trustworthy ones, so they come first:
 *
 *   1. `cf-connecting-ip` — Cloudflare replaces it on every request (staging
 *      runs behind a Cloudflare tunnel, docs/development/61).
 *   2. `x-real-ip` — set by our nginx `proxy_set_header`, not forwarded from
 *      the client.
 *   3. `x-forwarded-for` leftmost — last resort. Spoofable, so it only makes
 *      the limiter best-effort, never worse than having none.
 *
 * If this ever runs somewhere those first two are absent AND the platform does
 * not sanitise XFF, the limiter degrades to "an attacker can pick their own
 * bucket" — which is exactly why the login lockout keys on the e-mail instead.
 */
export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  // One shared bucket. Collateral damage between anonymous clients is the
  // price of not silently disabling the limiter when headers are missing.
  return "unknown";
}

/**
 * Body of a 429. Bulgarian, because every string a student can see is
 * (docs: bg-BG is the user-facing language) — and it says what actually
 * happened plus when to come back, instead of a bare status code.
 */
export function rateLimitMessageBg(retryAfterSec: number): string {
  const minutes = Math.ceil(retryAfterSec / 60);
  return minutes <= 1
    ? "Твърде много опити подред. Изчакай около минута и опитай пак."
    : `Твърде много опити подред. Опитай пак след около ${minutes} минути.`;
}

/**
 * The 429 every blocked chokepoint returns.
 *
 * `url` is in the body for one specific consumer: next-auth's client-side
 * `signIn()` does `await res.json()` and then `new URL(data.url)`, so a body
 * without it throws inside the library and the login form shows its generic
 * catch-all instead of anything useful. Including it keeps `signIn()` returning
 * a clean `{ status: 429, error: "RateLimited" }` the form can act on.
 */
export function tooManyRequestsResponse(
  reason: string,
  retryAfterSec: number,
  requestUrl: string,
): Response {
  const loginUrl = new URL("/login", requestUrl);
  loginUrl.searchParams.set("error", "RateLimited");

  return Response.json(
    {
      error: "rate_limited",
      rule: reason,
      retryAfterSec,
      messageBg: rateLimitMessageBg(retryAfterSec),
      url: loginUrl.toString(),
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        // Nothing about a rate-limit decision may be cached or shared —
        // a CDN hit would extend one client's block to everyone behind it.
        "Cache-Control": "no-store",
      },
    },
  );
}

/** The 429 for a per-source budget (proxy chokepoint). */
export function rateLimitedResponse(
  rule: RateLimitRule,
  verdict: RateLimitVerdict,
  requestUrl: string,
): Response {
  return tooManyRequestsResponse(rule.name, verdict.retryAfterSec, requestUrl);
}
