/**
 * The security-headers block (audit 2026-07-24, M-22 — `next.config.ts` was
 * the untouched 5-line scaffold, so the app shipped none of these).
 *
 * A config file has no behaviour to unit-test, which is exactly why it rots
 * quietly. These assertions are the contract: the specific protections the
 * audit asked for are present, and the three that would break a working page
 * if they were tightened by accident (Stripe's frames, Stripe's wallet
 * buttons, Rapier's wasm) stay allowed. Anyone promoting the Report-Only
 * policy to enforced has to come through here.
 */

import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

async function headerMap(): Promise<Map<string, string>> {
  const rules = await nextConfig.headers!();
  // The security block must apply to EVERY path. Other rules in this config
  // scope themselves to asset directories (caching, M-27); a security rule
  // that ever narrows its source leaves pages unprotected, which is exactly
  // the state M-22 described.
  const security = rules.filter((rule) => rule.source === "/:path*");
  expect(security).toHaveLength(1);
  return new Map(
    security[0].headers.map((h) => [h.key.toLowerCase(), h.value] as const),
  );
}

describe("security headers", () => {
  it("refuses to be framed — the clickjacking hole on the card-entry page", async () => {
    const headers = await headerMap();
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
  });

  it("ships the rest of the audit's list", async () => {
    const headers = await headerMap();
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    // Exam and review URLs carry attempt ids; they must not reach Stripe.
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("content-security-policy")).toContain("base-uri 'self'");
    expect(headers.get("content-security-policy")).toContain("object-src 'none'");
  });

  it("denies camera and microphone outright (ADR-004: minors, no biometrics)", async () => {
    const permissions = (await headerMap()).get("permissions-policy")!;
    expect(permissions).toContain("camera=()");
    expect(permissions).toContain("microphone=()");
    expect(permissions).toContain("geolocation=()");
  });

  it("still delegates `payment` to Stripe, or the wallet buttons die silently", async () => {
    const permissions = (await headerMap()).get("permissions-policy")!;
    expect(permissions).toContain("https://checkout.stripe.com");
    expect(permissions).toContain("https://js.stripe.com");
  });

  it("keeps the enforced policy free of anything that could break a page", async () => {
    const enforced = (await headerMap()).get("content-security-policy")!;
    // Deliberately NO script-src/style-src/connect-src until the Report-Only
    // run has been looked at on a real session (doc 66 R0). If one appears
    // here without that, this test is the place the reasoning is recorded.
    for (const directive of ["script-src", "style-src", "connect-src", "img-src"]) {
      expect(enforced).not.toContain(directive);
    }
  });

  it("has a Report-Only policy that already allows what the product needs", async () => {
    const report = (await headerMap()).get("content-security-policy-report-only")!;
    // Rapier compiles its physics wasm at runtime (ADR-005).
    expect(report).toContain("'wasm-unsafe-eval'");
    // three.js instantiates KTX2/Draco decoders from blob: workers.
    expect(report).toContain("worker-src 'self' blob:");
    // Embedded Checkout + the 3DS challenge frame.
    expect(report).toContain("https://checkout.stripe.com");
    expect(report).toContain("https://js.stripe.com");
    expect(report).toContain("https://api.stripe.com");
  });
});
