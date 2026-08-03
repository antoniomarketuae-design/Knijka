/**
 * THE LAST SCREEN BEFORE THE MONEY MUST NEVER FAIL MUTE.
 *
 * The shipped flow could put a seventeen-year-old in front of a 560px empty
 * card: no message, no retry, no way back to the consent checkboxes. She got
 * there by doing the one thing the parental-consent gate is designed to make
 * her do — leave, fetch a parent with a card, come back — 65 minutes later,
 * against a 60-minute consent TTL. The route threw, Next answered 500, and the
 * throw resurfaced inside Stripe's provider where nothing of ours could catch
 * it or re-render.
 *
 * So these tests assert the property, not the plumbing: for EVERY way the
 * request can fail, there is a code, and for every code there is Bulgarian copy
 * with a way forward. Nothing here may throw.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CHECKOUT_ERROR_COPY_BG,
  CheckoutFailureNotice,
  CheckoutPendingNotice,
  toCheckoutErrorCode,
  type CheckoutErrorCode,
} from "../CheckoutFailure";
import { requestCheckoutClientSecret } from "../checkoutSession";
import {
  checkoutStep,
  initialCheckoutConsentState,
} from "@/app/(dashboard)/checkout/consent-contract";

/** A `fetch` that answers exactly `response` and records the call. */
function respondWith(response: Response | (() => never)) {
  return (async () => {
    if (typeof response === "function") response();
    return response;
  }) as unknown as typeof fetch;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("requestCheckoutClientSecret — the request that used to throw", () => {
  it("returns the secret on the happy path", async () => {
    const res = await requestCheckoutClientSecret(
      "core",
      respondWith(json({ clientSecret: "cs_secret_1" }, 200)),
    );
    expect(res).toEqual({ ok: true, clientSecret: "cs_secret_1" });
  });

  it("turns the 409 into CONSENT_REQUIRED — the 'went to fetch a parent' case", async () => {
    const res = await requestCheckoutClientSecret(
      "core",
      respondWith(json({ code: "CONSENT_REQUIRED" }, 409)),
    );
    expect(res).toEqual({ ok: false, code: "CONSENT_REQUIRED" });
  });

  it("NEVER THROWS, whatever comes back — that throw is the whole defect", async () => {
    const nasty: Array<[string, typeof fetch]> = [
      ["502 with a code", respondWith(json({ code: "CHECKOUT_UNAVAILABLE" }, 502))],
      // An unhandled server error or a proxy answers HTML. `res.json()` rejects
      // on this, and the rejection is what reached Stripe's provider before.
      ["500 with an HTML body", respondWith(new Response("<h1>500</h1>", { status: 500 }))],
      ["503 with an empty body", respondWith(new Response(null, { status: 503 }))],
      ["401", respondWith(json({ code: "UNAUTHORIZED" }, 401))],
      ["401 with no code at all", respondWith(new Response("", { status: 401 }))],
      // A 200 with no client_secret would otherwise mount Stripe on "" — the
      // blank card again, by a different road.
      ["200 with no clientSecret", respondWith(json({}, 200))],
      [
        "a dead network",
        respondWith(() => {
          throw new TypeError("Failed to fetch");
        }),
      ],
    ];

    for (const [label, impl] of nasty) {
      const res = await requestCheckoutClientSecret("core", impl);
      expect(res.ok, label).toBe(false);
      if (!res.ok) {
        // Whatever happened, it landed on a code the UI can render.
        expect(
          res.code === "CONSENT_REQUIRED" || res.code in CHECKOUT_ERROR_COPY_BG,
          `${label} → ${res.code} has no copy`,
        ).toBe(true);
      }
    }
  });

  it("maps an unlabelled failure to something actionable, never to silence", () => {
    expect(toCheckoutErrorCode(undefined, 401)).toBe("UNAUTHORIZED");
    expect(toCheckoutErrorCode(undefined, 500)).toBe("CHECKOUT_UNAVAILABLE");
    expect(toCheckoutErrorCode("SOMETHING_NEW", 418)).toBe("CHECKOUT_UNAVAILABLE");
    expect(toCheckoutErrorCode("CONSENT_REQUIRED", 409)).toBe("CONSENT_REQUIRED");
  });
});

describe("every code the ROUTE can emit ends up on a screen with words", () => {
  it("covers each `code:` literal in the route source", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("../../../app/api/checkout/embedded/route.ts", import.meta.url),
      "utf8",
    );
    const codes = [...source.matchAll(/code:\s*"([A-Z_]+)"/g)].map((m) => m[1]);

    // If this ever drops to zero the regex has rotted and the test is a no-op.
    expect(codes.length).toBeGreaterThanOrEqual(5);

    for (const code of codes) {
      // Whatever the server says, the client resolves it to a code it can draw.
      const resolved = toCheckoutErrorCode(code, 500);
      expect(
        resolved === "CONSENT_REQUIRED" || resolved in CHECKOUT_ERROR_COPY_BG,
        `route emits ${code}, which renders nothing`,
      ).toBe(true);
    }
  });
});

describe("the screens themselves", () => {
  const codes = Object.keys(CHECKOUT_ERROR_COPY_BG) as Array<
    Exclude<CheckoutErrorCode, "CONSENT_REQUIRED">
  >;

  it("renders a title, an explanation and a retry for every failure", () => {
    for (const code of codes) {
      const html = renderToStaticMarkup(
        <CheckoutFailureNotice code={code} onRetry={() => {}} />,
      );
      expect(html, code).toContain(CHECKOUT_ERROR_COPY_BG[code].title);
      expect(html, code).toContain(CHECKOUT_ERROR_COPY_BG[code].body);
      expect(html, code).toContain("Опитай пак");
      expect(html, code).toContain('role="alert"');
      // Never a bare container: an empty card is the bug.
      expect(html.replace(/<[^>]*>/g, "").trim().length, code).toBeGreaterThan(30);
    }
  });

  it("leads with 'nothing was charged' — the first thing anyone here needs to know", () => {
    for (const code of codes) {
      const copy = CHECKOUT_ERROR_COPY_BG[code];
      expect(
        /не е платено|не ти е удържано/.test(copy.body),
        `${code}: "${copy.body}"`,
      ).toBe(true);
    }
  });

  it("says something while the request is still in flight, rather than nothing", () => {
    const html = renderToStaticMarkup(<CheckoutPendingNotice />);
    expect(html).toContain("Подготвяме сигурното плащане");
    expect(html).toContain('role="status"');
  });
});

describe("a 409 puts the checkboxes back on screen", () => {
  it("shows the payment form only while the consent is BOTH recorded and unexpired", () => {
    const accepted = { status: "accepted" } as const;

    expect(checkoutStep(initialCheckoutConsentState, false)).toBe("boxes");
    expect(checkoutStep(accepted, false)).toBe("payment");
    // The fix: recorded-but-stale sends her back to the one click that fixes it.
    expect(checkoutStep(accepted, true)).toBe("boxes");
    expect(checkoutStep({ status: "error", message: "…" }, false)).toBe("boxes");
  });
});
