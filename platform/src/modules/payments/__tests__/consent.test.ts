/**
 * The purchase consent gate (audit 2026-07-24, H-9 + M-24).
 *
 * Two legal facts are being defended here, and both are invisible in the UI:
 *
 * 1. A 14–17-year-old's contract is avoidable under ЗЛС without a parent's
 *    approval. The product accepts accounts from 14 and stores the birth year
 *    — it just never read it. Every test below that seeds `birthYears` is
 *    asserting that the read now happens and changes the outcome.
 * 2. The 14-day distance-selling withdrawal right survives unless the buyer
 *    expressly waives it (ЗЗП чл. 57, т. 13). That waiver is per contract,
 *    which is why a stale or foreign-pack consent must not authorise a sale.
 *
 * Before the fix `createEmbeddedCheckoutSession` minted a client_secret for
 * anyone who asked, so every "refuses" case here failed by succeeding.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  CHECKOUT_CONSENT_CONTEXT,
  CHECKOUT_CONSENT_TEXTS_BG,
  CHECKOUT_CONSENT_TTL_MINUTES,
  checkoutConsentPath,
  findValidCheckoutConsent,
  mayBeMinor,
  recordCheckoutConsent,
  requiredCheckoutConsents,
} from "../consent";
import { InMemoryPaymentsStore, setPaymentsStore } from "../store";
import { PaymentsError } from "../types";
import { TERMS_VERSION } from "@/lib/legal/versions";

const NOW = new Date("2026-07-25T10:00:00.000Z");

let store: InMemoryPaymentsStore;

/** A store with one user of a known age (birthYear omitted = never collected). */
function freshStore(birthYear?: number): InMemoryPaymentsStore {
  store = new InMemoryPaymentsStore();
  if (birthYear !== undefined) store.birthYears.set("user-1", birthYear);
  setPaymentsStore(store);
  return store;
}

afterEach(() => setPaymentsStore(null));

describe("mayBeMinor — resolving a birth YEAR against the sale", () => {
  it("flags anyone who could still be 17 on the day of purchase", () => {
    // Born 2009 → 16 or 17 in 2026. Unambiguously a minor.
    expect(mayBeMinor(2009, NOW)).toBe(true);
    // Born 2008 → 17 until their birthday, 18 after. The year cannot tell us
    // which, so it must count as a minor: a false positive is one checkbox,
    // a false negative is a contract the family can unwind.
    expect(mayBeMinor(2008, NOW)).toBe(true);
    // Born 2007 → 18 or 19. Adult under every reading of the year.
    expect(mayBeMinor(2007, NOW)).toBe(false);
    expect(mayBeMinor(1990, NOW)).toBe(false);
  });

  it("treats a missing birth year as possibly a minor", () => {
    expect(mayBeMinor(null, NOW)).toBe(true);
  });

  it("moves with the calendar — the boundary is not frozen at 2026", () => {
    const later = new Date("2030-01-02T00:00:00.000Z");
    expect(mayBeMinor(2012, later)).toBe(true); // 17 or 18
    expect(mayBeMinor(2011, later)).toBe(false); // 18 or 19
  });
});

describe("requiredCheckoutConsents — reads birthYear, finally", () => {
  it("asks a possible minor for the parental approval as well", async () => {
    freshStore(2009);
    expect(await requiredCheckoutConsents("user-1", NOW)).toEqual([
      "parental_purchase",
      "withdrawal_waiver",
    ]);
  });

  it("asks an adult only for the withdrawal waiver", async () => {
    freshStore(2000);
    expect(await requiredCheckoutConsents("user-1", NOW)).toEqual([
      "withdrawal_waiver",
    ]);
  });

  it("defaults to the parental gate when no birth year was ever stored", async () => {
    freshStore();
    expect(await requiredCheckoutConsents("user-1", NOW)).toContain(
      "parental_purchase",
    );
  });
});

describe("recordCheckoutConsent — the proof that GDPR Art. 7(1) asks for", () => {
  it("stores the version, the verbatim wording and the moment", async () => {
    freshStore(2009);

    const rows = await recordCheckoutConsent(
      "user-1",
      "core",
      { parental_purchase: true, withdrawal_waiver: true },
      NOW,
    );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.userId).toBe("user-1");
      expect(row.context).toBe(CHECKOUT_CONSENT_CONTEXT);
      expect(row.subject).toBe("core");
      expect(row.docVersion).toBe(TERMS_VERSION);
      expect(row.recordedAt).toEqual(NOW);
      // The stored text IS the wording the checkout rendered — one source.
      expect(row.textBg).toBe(
        CHECKOUT_CONSENT_TEXTS_BG[row.kind as "parental_purchase"],
      );
    }
  });

  it("refuses — and writes nothing — when a minor's parental box is unticked", async () => {
    freshStore(2009);

    await expect(
      recordCheckoutConsent(
        "user-1",
        "core",
        { withdrawal_waiver: true },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(store.consentEvents).toHaveLength(0);
  });

  it("refuses when the withdrawal waiver is unticked, adult or not", async () => {
    freshStore(2000);

    await expect(
      recordCheckoutConsent("user-1", "core", {}, NOW),
    ).rejects.toBeInstanceOf(PaymentsError);
    expect(store.consentEvents).toHaveLength(0);
  });

  it("records an adult's voluntary parental tick rather than dropping it", async () => {
    freshStore(2000);

    const rows = await recordCheckoutConsent(
      "user-1",
      "core",
      { parental_purchase: true, withdrawal_waiver: true },
      NOW,
    );
    expect(rows.map((r) => r.kind).sort()).toEqual([
      "parental_purchase",
      "withdrawal_waiver",
    ]);
  });
});

describe("findValidCheckoutConsent — a tick authorises ONE purchase", () => {
  async function consentFor(pack: "core" | "premium_sim", at: Date) {
    await recordCheckoutConsent(
      "user-1",
      pack,
      { parental_purchase: true, withdrawal_waiver: true },
      at,
    );
  }

  it("returns the proof for the pack that was consented to", async () => {
    freshStore(2009);
    await consentFor("core", NOW);

    const proof = await findValidCheckoutConsent("user-1", "core", NOW);
    expect(proof).not.toBeNull();
    expect(proof!.ids).toHaveLength(2);
    expect(proof!.docVersion).toBe(TERMS_VERSION);
    expect(proof!.recordedAt).toEqual(NOW);
  });

  it("does not carry a consent over to a different pack", async () => {
    freshStore(2009);
    await consentFor("core", NOW);

    expect(
      await findValidCheckoutConsent("user-1", "premium_sim", NOW),
    ).toBeNull();
  });

  it("expires: yesterday's waiver may not authorise today's contract", async () => {
    freshStore(2009);
    await consentFor("core", NOW);

    const tooLate = new Date(
      NOW.getTime() + (CHECKOUT_CONSENT_TTL_MINUTES + 1) * 60_000,
    );
    expect(await findValidCheckoutConsent("user-1", "core", tooLate)).toBeNull();

    const stillFine = new Date(
      NOW.getTime() + (CHECKOUT_CONSENT_TTL_MINUTES - 1) * 60_000,
    );
    expect(
      await findValidCheckoutConsent("user-1", "core", stillFine),
    ).not.toBeNull();
  });

  it("ignores a consent given against an older version of the Terms", async () => {
    freshStore(2009);
    // Written straight to the store so the row can carry a stale version —
    // exactly the M-24 case: the wording changed after the student ticked.
    await store.createConsentEvent({
      userId: "user-1",
      kind: "withdrawal_waiver",
      context: CHECKOUT_CONSENT_CONTEXT,
      docVersion: "2020-01-01",
      textBg: "стар текст",
      subject: "core",
      recordedAt: NOW,
    });

    expect(await findValidCheckoutConsent("user-1", "core", NOW)).toBeNull();
  });

  it("is null for a minor holding only the waiver", async () => {
    freshStore(2009);
    await recordCheckoutConsent(
      "user-1",
      "core",
      { parental_purchase: true, withdrawal_waiver: true },
      NOW,
    );
    // The same rows, read as a user whose age now demands the parental box:
    // drop it from the store and the proof must stop being valid.
    store.consentEvents.splice(
      store.consentEvents.findIndex((c) => c.kind === "parental_purchase"),
      1,
    );
    expect(await findValidCheckoutConsent("user-1", "core", NOW)).toBeNull();
  });
});

describe("checkoutConsentPath", () => {
  it("points at the one screen that collects the boxes", () => {
    expect(checkoutConsentPath("premium_sim")).toBe(
      "/checkout?pack=premium_sim",
    );
  });
});
