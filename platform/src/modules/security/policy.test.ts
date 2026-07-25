/**
 * Which requests are guarded, and — just as important — which are not
 * (audit 2026-07-24, H-8).
 *
 * The second half is what these tests exist for. A limiter that also throttles
 * `/api/auth/session` breaks the app for everyone who is behaving, and the
 * next.js session provider polls it; a limiter that throttles the Stripe
 * webhook silently loses purchases. Both are the kind of regression that looks
 * like "the site is flaky" months later, so they are pinned here.
 */

import { describe, expect, it } from "vitest";
import { clientIp, rateLimitMessageBg } from "./request";
import { RATE_LIMITS, rateLimitForRequest } from "./policy";

describe("rateLimitForRequest", () => {
  it("guards the three unauthenticated/paid write surfaces", () => {
    expect(rateLimitForRequest("POST", "/api/register")).toBe(
      RATE_LIMITS.register,
    );
    expect(rateLimitForRequest("POST", "/api/auth/callback/credentials")).toBe(
      RATE_LIMITS.login,
    );
    expect(rateLimitForRequest("POST", "/api/checkout/embedded")).toBe(
      RATE_LIMITS.checkout,
    );
  });

  it("guards /checkout/return, which makes a Stripe call per render (M-23)", () => {
    expect(rateLimitForRequest("GET", "/checkout/return")).toBe(
      RATE_LIMITS.checkoutReturn,
    );
  });

  it("leaves next-auth's read endpoints alone — the client polls them", () => {
    expect(rateLimitForRequest("GET", "/api/auth/session")).toBeNull();
    expect(rateLimitForRequest("GET", "/api/auth/csrf")).toBeNull();
    expect(rateLimitForRequest("GET", "/api/auth/providers")).toBeNull();
    expect(rateLimitForRequest("POST", "/api/auth/signout")).toBeNull();
  });

  it("never touches the Stripe webhook — a throttled webhook loses a purchase", () => {
    expect(rateLimitForRequest("POST", "/api/stripe/webhook")).toBeNull();
  });

  it("only counts writes on the API surfaces (a GET is not a bcrypt call)", () => {
    expect(rateLimitForRequest("GET", "/api/register")).toBeNull();
    expect(rateLimitForRequest("HEAD", "/api/checkout/embedded")).toBeNull();
  });

  it("returns null for everything else", () => {
    expect(rateLimitForRequest("GET", "/dashboard")).toBeNull();
    expect(rateLimitForRequest("POST", "/theory/practice")).toBeNull();
  });
});

describe("clientIp", () => {
  it("prefers the headers a proxy OVERWRITES over the one a client can forge", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.7",
      "x-real-ip": "198.51.100.9",
      "x-forwarded-for": "1.1.1.1, 203.0.113.7",
    });
    expect(clientIp(headers)).toBe("203.0.113.7");

    headers.delete("cf-connecting-ip");
    expect(clientIp(headers)).toBe("198.51.100.9");
  });

  it("falls back to the leftmost x-forwarded-for entry, then to a shared bucket", () => {
    expect(
      clientIp(new Headers({ "x-forwarded-for": " 1.1.1.1 , 2.2.2.2 " })),
    ).toBe("1.1.1.1");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("rateLimitMessageBg", () => {
  it("tells the student in Bulgarian when to come back, not just that it failed", () => {
    expect(rateLimitMessageBg(45)).toContain("минута");
    expect(rateLimitMessageBg(9 * 60)).toContain("9 минути");
  });
});
