/**
 * The launch guard (audit 2026-07-24, finding C-1).
 *
 * The failure this prevents: with STRIPE_SECRET_KEY set, the product would
 * charge customers — many of them minors — under a privacy policy naming
 * "[ИМЕ НА ЮРИДИЧЕСКО ЛИЦЕ]", with "[ИМЕЙЛ ЗА КОНТАКТ]" as the only channel for
 * refunds, support and GDPR requests. Nothing failed on that transition; it was
 * one environment variable away at all times.
 *
 * These tests make the transition impossible to trip by accident, in both
 * directions:
 *  - while the seller is a placeholder, the money path must stay CLOSED;
 *  - once it is filled in, the placeholders must be gone everywhere.
 *
 * They also pin the seller-form model: the required facts follow SELLER_KIND,
 * so a natural person is never asked for an ЕИК they do not have — and no
 * national ID (ЕГН) is ever part of the identity.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONTACT_EMAIL,
  ENTITY_ADDRESS,
  ENTITY_EIK,
  ENTITY_ID_LABEL,
  ENTITY_NAME,
  LAST_UPDATED,
  isPlaceholder,
  legalIdentityComplete,
  legalIdentityGaps,
  requiredLegalFacts,
} from "../identity";
import { isStripeConfigured } from "@/modules/payments";

/** Only the facts the CHOSEN seller form actually publishes. */
const REQUIRED = requiredLegalFacts();

describe("legal identity", () => {
  it("recognises an unfilled founder placeholder", () => {
    expect(isPlaceholder("[ЕИК]")).toBe(true);
    expect(isPlaceholder("  [ДАТА] ")).toBe(true);
    expect(isPlaceholder("Книжка ЕООД")).toBe(false);
    expect(isPlaceholder("205123456")).toBe(false);
    // A real address may contain brackets mid-string — only a fully bracketed
    // value is a placeholder.
    expect(isPlaceholder("ул. Витоша 1 (вх. Б), София")).toBe(false);
  });

  it("reports every unfilled fact by name", () => {
    const gaps = legalIdentityGaps();
    for (const name of gaps) expect(Object.keys(REQUIRED)).toContain(name);
    expect(legalIdentityComplete()).toBe(gaps.length === 0);
  });

  it("always requires the facts every seller form has", () => {
    expect(Object.keys(REQUIRED)).toEqual(
      expect.arrayContaining([
        "ENTITY_NAME",
        "ENTITY_ADDRESS",
        "CONTACT_EMAIL",
        "LAST_UPDATED",
      ]),
    );
    // Name, address, contact and date are never optional, whoever sells.
    expect(REQUIRED.ENTITY_NAME).toBe(ENTITY_NAME);
    expect(REQUIRED.ENTITY_ADDRESS).toBe(ENTITY_ADDRESS);
    expect(REQUIRED.CONTACT_EMAIL).toBe(CONTACT_EMAIL);
    expect(REQUIRED.LAST_UPDATED).toBe(LAST_UPDATED);
  });

  it("demands a trade-register number only from a form that has one", () => {
    if (ENTITY_EIK === null) {
      // A private individual is in no trade register: the fact is ABSENT, not
      // unfilled, so it is neither demanded nor rendered as an empty „ЕИК:“.
      expect(REQUIRED.ENTITY_EIK).toBeUndefined();
      expect(legalIdentityGaps()).not.toContain("ENTITY_EIK");
    } else {
      // ЕТ/company: the number is a fact like any other and must be filled in.
      expect(REQUIRED.ENTITY_EIK).toBe(ENTITY_EIK);
      expect(legalIdentityGaps().includes("ENTITY_EIK")).toBe(
        isPlaceholder(ENTITY_EIK),
      );
    }
    // Whatever the form, the identifier is a trade-register one, never an ЕГН.
    expect(ENTITY_ID_LABEL).toMatch(/^ЕИК(\/БУЛСТАТ)?$/);
  });

  /**
   * PRIVACY. The identity renders into four public pages, so an ЕГН (or any
   * other national ID) must never enter this module — not as a field, not as a
   * placeholder inviting one. A registered ЕТ/freelancer's ЕИК/БУЛСТАТ is the
   * identifier to use if one is ever needed.
   */
  it("never carries a national identification number", () => {
    expect(Object.keys(REQUIRED)).not.toContain("ENTITY_EGN");
    for (const value of Object.values(REQUIRED)) {
      if (value === undefined) continue;
      expect(value).not.toMatch(/ЕГН|EGN/i);
      // No bare 10-digit number, the shape of a Bulgarian ЕГН.
      expect(value.replace(/\s/g, "")).not.toMatch(/^\d{10}$/);
    }
  });
});

describe("the money path fails CLOSED until the seller is real", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses checkout when Stripe is configured but the seller is a placeholder", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_launch_guard");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    if (legalIdentityComplete()) {
      // The seller has been registered — the guard's job is done and checkout
      // is allowed to arm. (The sibling test below then enforces the invariant.)
      expect(isStripeConfigured()).toBe(true);
    } else {
      expect(isStripeConfigured()).toBe(false);
      expect(consoleError).toHaveBeenCalled();
    }
    consoleError.mockRestore();
  });

  it("stays closed when Stripe itself is unconfigured", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(isStripeConfigured()).toBe(false);
  });

  /**
   * THE INVARIANT. This is the assertion that must never be deleted: the day
   * the seller is filled in, no placeholder may survive anywhere in the legal
   * identity. It is written as an implication so it does not turn CI red today
   * (the seller is legitimately unregistered pre-launch) yet becomes a hard
   * gate the moment anyone fills in even one field. It runs over the facts the
   * CHOSEN form must publish — an absent ЕИК cannot hold the gate open.
   */
  it("once ANY legal fact is real, ALL of them must be", () => {
    const filled = Object.entries(REQUIRED).filter(([, v]) => !isPlaceholder(v));
    if (filled.length === 0) return; // pre-launch: nothing registered yet
    expect(
      legalIdentityGaps(),
      "Partially-filled legal identity: registering the seller means filling in " +
        "every fact its legal form publishes before the product may contract " +
        "with a customer.",
    ).toEqual([]);
  });
});
