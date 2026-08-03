/**
 * The browser's half of "open the payment form", as a plain async function.
 *
 * It is SEPARATE from the island on purpose. The defect this exists to kill —
 * a failed request producing an empty 560px card and nothing else — lived
 * entirely in the request/classify step, and inside a React effect that no test
 * in this repo can drive (there is no DOM environment configured). Pulled out
 * here it is a pure function of `fetch`, so "a broken response NEVER throws and
 * always produces a code the UI has copy for" is an assertion, not a hope.
 *
 * THE CONTRACT, and it is the whole point: this function does not throw. Ever.
 * Not on a 500, not on an HTML error page where JSON was expected, not on a
 * dead network. Throwing is precisely what the old `fetchClientSecret` callback
 * did, deep inside Stripe's provider where nothing of ours could catch it.
 */

import { toCheckoutErrorCode, type CheckoutErrorCode } from "./CheckoutFailure";

export type CheckoutSessionResult =
  | { ok: true; clientSecret: string }
  | { ok: false; code: CheckoutErrorCode };

export async function requestCheckoutClientSecret(
  pack: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckoutSessionResult> {
  let res: Response;
  try {
    res = await fetchImpl("/api/checkout/embedded", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pack }),
    });
  } catch {
    // Offline, DNS, aborted — the request never reached us.
    return { ok: false, code: "NETWORK" };
  }

  // A proxy or an unhandled server error answers HTML, not JSON. `.catch` here
  // is load-bearing: without it the parse rejects and we are back to a silent
  // throw with an empty card behind it.
  const payload = (await res.json().catch(() => null)) as {
    clientSecret?: string;
    code?: string;
  } | null;

  if (res.ok && typeof payload?.clientSecret === "string" && payload.clientSecret) {
    return { ok: true, clientSecret: payload.clientSecret };
  }

  // A 200 with no client_secret is still a failure — and one that would
  // otherwise mount Stripe with an empty string, i.e. the blank card again.
  return { ok: false, code: toCheckoutErrorCode(payload?.code, res.status) };
}
