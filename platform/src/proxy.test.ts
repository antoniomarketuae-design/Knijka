/**
 * The proxy is the one chokepoint (audit 2026-07-24, H-8).
 *
 * Everything below is about the seam between the two jobs it now does, which
 * is where the bugs live: the limiter must fire before the JWT work, an API
 * route must NEVER be answered with a login redirect (a fetch() that parses an
 * HTML page as JSON reports something unrelated and costs an afternoon), and
 * the page redirect that already worked must keep working.
 *
 * `getToken` is mocked because the alternative is minting a real next-auth JWT
 * per test — the property under test here is the branch, not the crypto.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getToken = vi.fn<() => Promise<{ sub: string } | null>>();
vi.mock("next-auth/jwt", () => ({ getToken: () => getToken() }));

const { proxy, config } = await import("./proxy");
const { RATE_LIMITS, resetRateLimitState } = await import("@/modules/security");

/** A request from one fixed client — nginx sets x-real-ip in production. */
function request(
  pathname: string,
  { method = "GET", ip = "203.0.113.7" } = {},
): NextRequest {
  return new NextRequest(new URL(pathname, "https://knijka.ai"), {
    method,
    headers: { "x-real-ip": ip },
  });
}

beforeEach(() => {
  resetRateLimitState();
  vi.stubEnv("AUTH_SECRET", "test-secret-not-real");
  getToken.mockResolvedValue({ sub: "user-1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("rate limiting", () => {
  it("429s /api/register once the budget is spent, and says when to retry", async () => {
    for (let i = 0; i < RATE_LIMITS.register.limit; i++) {
      const ok = await proxy(request("/api/register", { method: "POST" }));
      expect(ok.status).toBe(200);
    }

    const blocked = await proxy(request("/api/register", { method: "POST" }));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // Never cached: a shared 429 would extend one client's block to a whole
    // school behind the same NAT.
    expect(blocked.headers.get("cache-control")).toBe("no-store");

    const body = await blocked.json();
    expect(body.error).toBe("rate_limited");
    expect(body.messageBg).toMatch(/[А-Яа-я]/); // the student sees Bulgarian
  });

  it("blocks the sign-in endpoint without ever verifying a session token", async () => {
    for (let i = 0; i < RATE_LIMITS.login.limit; i++) {
      await proxy(request("/api/auth/callback/credentials", { method: "POST" }));
    }
    getToken.mockClear();

    const blocked = await proxy(
      request("/api/auth/callback/credentials", { method: "POST" }),
    );
    expect(blocked.status).toBe(429);
    // The whole point of limiting before authenticating: a flood costs us
    // nothing but a Map lookup.
    expect(getToken).not.toHaveBeenCalled();
  });

  it("budgets per client, so one attacker cannot lock everyone out", async () => {
    for (let i = 0; i < RATE_LIMITS.register.limit + 3; i++) {
      await proxy(request("/api/register", { method: "POST", ip: "10.0.0.1" }));
    }

    const other = await proxy(
      request("/api/register", { method: "POST", ip: "10.0.0.2" }),
    );
    expect(other.status).toBe(200);
  });

  it("does not throttle the session endpoint the client polls", async () => {
    for (let i = 0; i < 50; i++) {
      const res = await proxy(request("/api/auth/session"));
      expect(res.status).toBe(200);
    }
  });
});

describe("auth handling", () => {
  it("never answers an API route with a login redirect", async () => {
    getToken.mockResolvedValue(null);

    const res = await proxy(request("/api/checkout/embedded", { method: "POST" }));
    expect(res.status).toBe(200); // passed through; the route returns its own 401
    expect(res.headers.get("location")).toBeNull();
  });

  it("still redirects a logged-out page request, keeping the callbackUrl", async () => {
    getToken.mockResolvedValue(null);

    const res = await proxy(request("/theory/practice"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/theory/practice");
  });

  it("lets a signed-in page request through", async () => {
    const res = await proxy(request("/dashboard"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("matcher", () => {
  it("covers /checkout, which M-23 found missing", () => {
    expect(config.matcher).toContain("/checkout/:path*");
  });

  it("stays off the Stripe webhook path", () => {
    expect(config.matcher).not.toContain("/api/:path*");
    expect(config.matcher.some((m) => m.startsWith("/api/stripe"))).toBe(false);
  });
});
