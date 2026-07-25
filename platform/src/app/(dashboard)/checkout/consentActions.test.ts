/**
 * The consent server action on /checkout (audit 2026-07-24, H-9).
 *
 * A server action is a public POST endpoint. The property under test is that
 * the only identity input is the session: the form says WHICH boxes were
 * ticked, never WHO ticked them — otherwise a student could record a parent's
 * approval onto somebody else's account, or (worse) onto their own from a page
 * that never showed the boxes.
 *
 * The second property is that the required set is re-derived server-side from
 * birthYear. A minor who simply omits the parental field from the POST must be
 * refused; before the fix there was no field, no check and no refusal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn<() => Promise<{ id: string; email: string }>>();
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  requireUser: () => requireUser(),
}));

const { acceptCheckoutConsent } = await import("./actions");
const { InMemoryPaymentsStore, setPaymentsStore } = await import(
  "@/modules/payments"
);
const { initialCheckoutConsentState, consentFieldName } = await import(
  "./consent-contract"
);

let store: InstanceType<typeof InMemoryPaymentsStore>;

/** POST body as the island's <form> would send it (unticked boxes are absent). */
function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

function submit(fields: Record<string, string>) {
  return acceptCheckoutConsent(initialCheckoutConsentState, form(fields));
}

beforeEach(() => {
  store = new InMemoryPaymentsStore();
  setPaymentsStore(store);
  requireUser.mockResolvedValue({ id: "user-1", email: "ivan@mail.bg" });
});

afterEach(() => {
  setPaymentsStore(null);
  vi.restoreAllMocks();
});

describe("acceptCheckoutConsent", () => {
  it("stores both consents for a minor and unlocks the payment form", async () => {
    store.birthYears.set("user-1", 2009);

    const state = await submit({
      pack: "core",
      [consentFieldName("parental_purchase")]: "on",
      [consentFieldName("withdrawal_waiver")]: "on",
    });

    expect(state).toEqual({ status: "accepted" });
    expect(store.consentEvents.map((c) => c.kind).sort()).toEqual([
      "parental_purchase",
      "withdrawal_waiver",
    ]);
  });

  it("refuses a minor who posts only the waiver — no partial row is written", async () => {
    store.birthYears.set("user-1", 2009);

    const state = await submit({
      pack: "core",
      [consentFieldName("withdrawal_waiver")]: "on",
    });

    expect(state.status).toBe("error");
    expect(store.consentEvents).toHaveLength(0);
  });

  it("accepts an adult with the waiver alone", async () => {
    store.birthYears.set("user-1", 1995);

    const state = await submit({
      pack: "core",
      [consentFieldName("withdrawal_waiver")]: "on",
    });

    expect(state).toEqual({ status: "accepted" });
    expect(store.consentEvents).toHaveLength(1);
  });

  it("IDENTITY: the consent is written for the session user, never a posted id", async () => {
    store.birthYears.set("user-1", 1995);

    await submit({
      pack: "core",
      userId: "victim-9",
      [consentFieldName("withdrawal_waiver")]: "on",
    });

    expect(store.consentEvents[0].userId).toBe("user-1");
  });

  it("rejects an unknown pack before touching the store", async () => {
    store.birthYears.set("user-1", 1995);

    const state = await submit({
      pack: "gratis",
      [consentFieldName("withdrawal_waiver")]: "on",
    });

    expect(state.status).toBe("error");
    expect(store.consentEvents).toHaveLength(0);
  });
});
