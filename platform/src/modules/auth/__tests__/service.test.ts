/**
 * modules/auth — registration and credential verification (audit 2026-07-24,
 * H-13: "the sharpest instance" — this module had ZERO tests, and nothing in
 * the suite imported it at all. Every /api/register response, every password
 * that was ever hashed, and the `isAdmin` flag the exam gate trusts were all
 * unexecuted code).
 *
 * These are boundary tests, not happy-path decoration: each one names a way a
 * minor's account could be created wrongly or a login could leak something.
 * They run entirely on InMemoryAuthStore — no Postgres, no DATABASE_URL.
 */

import { compare } from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerUser, verifyCredentials } from "../service";
import { InMemoryAuthStore, setAuthStore, type AuthUserRecord } from "../store";

/** A registration payload that passes every rule; tests override one field. */
function validInput(over: Record<string, unknown> = {}) {
  return {
    email: "ivan@mail.bg",
    password: "parola1234",
    name: "Иван",
    birthYear: 2008,
    consent: true,
    ...over,
  };
}

let users: AuthUserRecord[];

beforeEach(() => {
  users = [];
  setAuthStore(new InMemoryAuthStore(users));
});

afterEach(() => {
  setAuthStore(null); // back to the Prisma default for anything else
});

describe("registerUser — the account-creation boundary", () => {
  it("creates a student and never returns or stores the plaintext password", async () => {
    const result = await registerUser(validInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Serialize the whole result: the password must not survive ANYWHERE in
    // the payload the route hands back to the browser.
    expect(JSON.stringify(result.user)).not.toContain("parola1234");
    expect(users).toHaveLength(1);
    expect(users[0].passwordHash).not.toBe("parola1234");
    // A real bcrypt hash of exactly that password — not a truncation, not a
    // re-encoding: the hash must actually verify.
    expect(await compare("parola1234", users[0].passwordHash!)).toBe(true);
  });

  it("PRIVILEGE BOUNDARY: self-registration can never mint an admin", async () => {
    // `role`/`isAdmin` in the body must be ignored — this flag is what
    // requireEntitlementForExam and every /api/review route trust.
    const result = await registerUser(validInput({ role: "admin", isAdmin: true }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.isAdmin).toBe(false);
    expect(users[0].role).toBe("student");
  });

  it("GDPR: consent is a hard gate — false or missing creates nothing", async () => {
    for (const consent of [false, undefined, "true", 1]) {
      const result = await registerUser(validInput({ consent }));
      expect(result.ok, `consent=${String(consent)}`).toBe(false);
      if (result.ok || result.error !== "invalid_input") continue;
      expect(result.fieldErrors.consent).toBeDefined();
    }
    expect(users).toHaveLength(0);
  });

  it("normalizes the e-mail so casing and stray spaces are the same account", async () => {
    await registerUser(validInput({ email: "  Ivan@Mail.BG " }));
    expect(users[0].email).toBe("ivan@mail.bg");

    const dupe = await registerUser(validInput({ email: "IVAN@mail.bg" }));
    expect(dupe.ok).toBe(false);
    if (dupe.ok) return;
    expect(dupe.error).toBe("email_taken");
    expect(users).toHaveLength(1);
  });

  it("rejects a password shorter than 8 characters, with a field error", async () => {
    const result = await registerUser(validInput({ password: "kratka1" }));
    expect(result.ok).toBe(false);
    if (result.ok || result.error !== "invalid_input") throw new Error("expected invalid_input");
    expect(result.fieldErrors.password).toBeDefined();
  });

  it("rejects a birth year that would make the user younger than the minimum", async () => {
    // Computed from the current year, never hardcoded — a fixed year would
    // silently raise the minimum age every January.
    const tooYoung = new Date().getFullYear() - 13;
    const result = await registerUser(validInput({ birthYear: tooYoung }));
    expect(result.ok).toBe(false);
    if (result.ok || result.error !== "invalid_input") throw new Error("expected invalid_input");
    expect(result.fieldErrors.birthYear).toBeDefined();
  });

  it("rejects a non-object body without throwing (the route passes raw JSON)", async () => {
    for (const body of [null, "ivan@mail.bg", 42, []]) {
      const result = await registerUser(body);
      expect(result.ok, JSON.stringify(body)).toBe(false);
    }
  });

  it("lets a real store failure escape, so the route can answer 500", async () => {
    setAuthStore({
      findUserByEmail: async () => null,
      createUser: async () => {
        throw new Error("db is down");
      },
      findRoleById: async () => null,
    });
    await expect(registerUser(validInput())).rejects.toThrow("db is down");
  });
});

describe("verifyCredentials — the login boundary", () => {
  beforeEach(async () => {
    await registerUser(validInput());
  });

  it("returns the user for the right password", async () => {
    const user = await verifyCredentials("ivan@mail.bg", "parola1234");
    expect(user?.email).toBe("ivan@mail.bg");
    expect(user?.isAdmin).toBe(false);
  });

  it("derives isAdmin from the STORED role, not from anything the caller sends", async () => {
    users[0].role = "admin";
    const user = await verifyCredentials("ivan@mail.bg", "parola1234");
    expect(user?.isAdmin).toBe(true);
  });

  it("returns null — identically — for wrong password, unknown e-mail and OAuth-only accounts", async () => {
    expect(await verifyCredentials("ivan@mail.bg", "greshna1234")).toBeNull();
    expect(await verifyCredentials("nikoi@mail.bg", "parola1234")).toBeNull();
    users[0].passwordHash = null; // OAuth-created account, no password set
    expect(await verifyCredentials("ivan@mail.bg", "parola1234")).toBeNull();
  });

  it("accepts the same casing/whitespace variants registration normalized", async () => {
    expect(await verifyCredentials("  IVAN@Mail.BG ", "parola1234")).not.toBeNull();
  });

  it("GDPR Art. 17: once the row is gone, the erased e-mail is not an oracle", async () => {
    // The same array modules/privacy erases from — deleting here is exactly
    // what account deletion does, and login must fail like any typo.
    users.length = 0;
    expect(await verifyCredentials("ivan@mail.bg", "parola1234")).toBeNull();
  });
});
