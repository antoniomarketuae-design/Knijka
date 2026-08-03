/**
 * THE SYMMETRY.
 *
 * `legalIdentityGaps()` already stops the product from taking money without a
 * real seller identity (audit C-1). This suite pins the other half of the same
 * promise: it must equally refuse to take money without a way to GIVE THE
 * ACCOUNT BACK.
 *
 * The failure being prevented, end to end: a student pays EUR 12.99 in
 * September. In October she forgets her password, asks for a reset, and gets a
 * reassuring Bulgarian success screen — while the link goes to a server log,
 * because MAIL_TRANSPORT was never set and the mail module fails soft to the
 * console transport with a single once-per-process warning. She is locked out
 * of something she paid for, with no channel to a human.
 *
 * One function, checked in one place, makes that class of failure unrepeatable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const legalGaps = vi.fn<() => string[]>(() => []);
vi.mock("@/lib/legal/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/legal/identity")>()),
  legalIdentityGaps: () => legalGaps(),
}));

const { isStripeConfigured } = await import("../stripe");

/** Everything else the money path demands, so only mail is under test. */
function armEverythingExceptMail() {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_x");
  legalGaps.mockReturnValue([]);
}

function armMail() {
  vi.stubEnv("MAIL_TRANSPORT", "resend");
  vi.stubEnv("MAIL_API_KEY", "re_key_123");
  vi.stubEnv("MAIL_FROM", "Книжка.AI <no-reply@knijka.ai>");
}

function disarmMail() {
  vi.stubEnv("MAIL_TRANSPORT", "");
  vi.stubEnv("MAIL_API_KEY", "");
  vi.stubEnv("MAIL_FROM", "");
}

/** Everything the gate logged during one test, joined. */
let logged: string[];

beforeEach(() => {
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
  armEverythingExceptMail();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isStripeConfigured — money requires a way back", () => {
  it("REFUSES to take money when this deployment cannot send e-mail", () => {
    disarmMail();
    expect(isStripeConfigured()).toBe(false);
  });

  it("allows it once a real transport exists — nothing else changed", () => {
    armMail();
    expect(isStripeConfigured()).toBe(true);
  });

  it("half-configured mail is still no mail: a key without a sender does not sell", () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("MAIL_API_KEY", "re_key_123");
    vi.stubEnv("MAIL_FROM", ""); // every provider 4xx's an absent sender
    expect(isStripeConfigured()).toBe(false);
  });

  it("MAIL_TRANSPORT=console is a decision to not deliver, and is treated as one", () => {
    vi.stubEnv("MAIL_TRANSPORT", "console");
    vi.stubEnv("MAIL_API_KEY", "re_key_123");
    vi.stubEnv("MAIL_FROM", "a@b.bg");
    expect(isStripeConfigured()).toBe(false);
  });

  it("names the missing variables in the log, so the fix is not a guessing game", () => {
    disarmMail();
    isStripeConfigured();
    expect(logged.join("\n")).toContain("MAIL_TRANSPORT");
    expect(logged.join("\n")).toContain("checks.mail");
  });

  it("does not leak the mail API key into the log", () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("MAIL_API_KEY", "re_super_secret_key");
    vi.stubEnv("MAIL_FROM", "");
    isStripeConfigured();
    expect(logged.join("\n")).not.toContain("re_super_secret_key");
  });

  it("is the SAME shape as the legal-identity gate it sits next to", () => {
    // Both are "which named facts are still missing?", both fail closed, both
    // are checked in isStripeConfigured. Neither can be satisfied by the other.
    armMail();
    legalGaps.mockReturnValue(["CONTACT_EMAIL"]);
    expect(isStripeConfigured()).toBe(false);

    legalGaps.mockReturnValue([]);
    disarmMail();
    expect(isStripeConfigured()).toBe(false);

    armMail();
    expect(isStripeConfigured()).toBe(true);
  });
});
