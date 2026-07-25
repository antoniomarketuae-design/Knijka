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
 *  - while the entity is a placeholder, the money path must stay CLOSED;
 *  - once it is filled in, the placeholders must be gone everywhere.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONTACT_EMAIL,
  ENTITY_ADDRESS,
  ENTITY_EIK,
  ENTITY_NAME,
  LAST_UPDATED,
  isPlaceholder,
  legalIdentityComplete,
  legalIdentityGaps,
} from "../identity";
import { isStripeConfigured } from "@/modules/payments";

const ALL = { ENTITY_NAME, ENTITY_EIK, ENTITY_ADDRESS, CONTACT_EMAIL, LAST_UPDATED };

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
    for (const name of gaps) expect(Object.keys(ALL)).toContain(name);
    expect(legalIdentityComplete()).toBe(gaps.length === 0);
  });
});

describe("the money path fails CLOSED until the entity is real", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses checkout when Stripe is configured but the entity is a placeholder", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_launch_guard");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    if (legalIdentityComplete()) {
      // The entity has been registered — the guard's job is done and checkout
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
   * the legal entity is filled in, no placeholder may survive anywhere in the
   * legal identity. It is written as an implication so it does not turn CI red
   * today (the entity is legitimately unregistered pre-launch) yet becomes a
   * hard gate the moment anyone fills in even one field.
   */
  it("once ANY legal fact is real, ALL of them must be", () => {
    const filled = Object.entries(ALL).filter(([, v]) => !isPlaceholder(v));
    if (filled.length === 0) return; // pre-launch: nothing registered yet
    expect(
      legalIdentityGaps(),
      "Partially-filled legal identity: registering the entity means filling in " +
        "every field before the product may contract with a customer.",
    ).toEqual([]);
  });
});
