/**
 * /settings — the password panel.
 *
 * WHAT WAS THERE BEFORE: a paragraph saying automatic password change "is not
 * ready yet", pointing at a contact address, weeks after the /forgot flow
 * shipped. And behind it, the real gap: sessions are 30-day idle JWTs with no
 * Session table, so a student who suspected someone had their password had NO
 * way to end that someone's session. Changing the password did not do it;
 * there was nothing that did.
 *
 * Each test below is one property of the fix that a refactor could quietly
 * drop: the re-authentication, the revocation, and — easy to forget because it
 * looks like a courtesy — signing THIS browser out, since its own cookie is
 * among the ones the change just killed.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashSync } from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryAuthStore,
  InMemoryPasswordResetStore,
  setAuthStore,
  setPasswordResetStore,
  verifyCredentials,
  type AuthUserRecord,
} from "@/modules/auth";
import { RATE_LIMITS, resetRateLimitState } from "@/modules/security";
import {
  initialChangePasswordState,
  PASSWORD_CHANGED_REDIRECT,
  SIGNED_OUT_EVERYWHERE_REDIRECT,
} from "./password-contract";

const PASSWORD = "staraParola1";
const NEW_PASSWORD = "novataParola2";
const PASSWORD_HASH = hashSync(PASSWORD, 4); // cost 4: see auth/service.test.ts

const signOut = vi.fn<(options: { redirectTo: string }) => Promise<void>>();
const requireUser = vi.fn();

// next-auth's signOut redirects, which would abort the test process. The
// action's job here is to CALL it — clearing the cookie is next-auth's.
vi.mock("@/auth", () => ({ signOut }));
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  requireUser: () => requireUser(),
}));

const { changeMyPassword, signOutEverywhereAction } = await import("./actions");

const SESSION_USER = {
  id: "mine",
  email: "mine@mail.bg",
  name: "Иван",
  isAdmin: false,
};

let users: AuthUserRecord[];

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function goodForm(over: Record<string, string> = {}): FormData {
  return form({
    currentPassword: PASSWORD,
    password: NEW_PASSWORD,
    confirm: NEW_PASSWORD,
    ...over,
  });
}

beforeEach(() => {
  users = [
    {
      id: "mine",
      email: "mine@mail.bg",
      name: "Иван",
      passwordHash: PASSWORD_HASH,
      role: "student",
      sessionEpoch: 0,
    },
  ];
  setAuthStore(new InMemoryAuthStore(users));
  setPasswordResetStore(new InMemoryPasswordResetStore(users, []));
  requireUser.mockResolvedValue(SESSION_USER);
  signOut.mockClear();
  resetRateLimitState();
});

afterEach(() => {
  setAuthStore(null);
  setPasswordResetStore(null);
  resetRateLimitState();
});

describe("changeMyPassword action", () => {
  it("changes the password, revokes every session, and signs this browser out", async () => {
    await changeMyPassword(initialChangePasswordState, goodForm());

    expect(await verifyCredentials("mine@mail.bg", NEW_PASSWORD)).not.toBeNull();
    expect(users[0].sessionEpoch).toBe(1);
    // THIS browser's cookie is one of the ones just revoked. Leaving it in
    // place would bounce the student to /login on their next click with no
    // explanation — the redirect is what turns that into a sentence.
    expect(signOut).toHaveBeenCalledWith({ redirectTo: PASSWORD_CHANGED_REDIRECT });
  });

  it("changes nothing when the current password is wrong", async () => {
    const state = await changeMyPassword(
      initialChangePasswordState,
      goodForm({ currentPassword: "gresna-parola" }),
    );

    expect(state.status).toBe("error");
    expect(state.field).toBe("currentPassword");
    expect(await verifyCredentials("mine@mail.bg", PASSWORD)).not.toBeNull();
    expect(users[0].sessionEpoch).toBe(0);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("re-checks the confirmation server-side, not only in the island", async () => {
    // The client island is not the only thing that can post to a server action.
    const state = await changeMyPassword(
      initialChangePasswordState,
      goodForm({ confirm: "nesto-drugo" }),
    );

    expect(state).toMatchObject({ status: "error", field: "confirm" });
    expect(await verifyCredentials("mine@mail.bg", PASSWORD)).not.toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("holds a new password to the register form's rules", async () => {
    const state = await changeMyPassword(
      initialChangePasswordState,
      goodForm({ password: "kratka", confirm: "kratka" }),
    );

    expect(state).toMatchObject({ status: "error", field: "password" });
    expect(await verifyCredentials("mine@mail.bg", PASSWORD)).not.toBeNull();
  });

  it("ignores an e-mail posted in the form — identity is the session", async () => {
    users.push({
      id: "victim",
      email: "victim@mail.bg",
      name: "Мария",
      passwordHash: hashSync("drugaParola9", 4),
      role: "student",
      sessionEpoch: 0,
    });

    await changeMyPassword(
      initialChangePasswordState,
      goodForm({ email: "victim@mail.bg", userId: "victim" }),
    );

    // Only the session's own account moved.
    expect(await verifyCredentials("victim@mail.bg", "drugaParola9")).not.toBeNull();
    expect(users[1].sessionEpoch).toBe(0);
  });

  it("meters the bcrypt behind it, so a signed-in caller cannot loop on it", async () => {
    for (let i = 0; i < RATE_LIMITS.credentialCheck.limit; i++) {
      await changeMyPassword(
        initialChangePasswordState,
        goodForm({ currentPassword: "gresna-parola" }),
      );
    }

    const blocked = await changeMyPassword(
      initialChangePasswordState,
      goodForm({ currentPassword: "gresna-parola" }),
    );
    expect(blocked.status).toBe("error");
    expect(blocked.message).toContain("Твърде много");
  });
});

describe("signOutEverywhereAction", () => {
  it("revokes every session without touching the password", async () => {
    await signOutEverywhereAction();

    expect(users[0].sessionEpoch).toBe(1);
    // The student is not locked out of their own account — they sign back in
    // with the password they already have.
    expect(await verifyCredentials("mine@mail.bg", PASSWORD)).not.toBeNull();
    expect(signOut).toHaveBeenCalledWith({
      redirectTo: SIGNED_OUT_EVERYWHERE_REDIRECT,
    });
  });
});

/**
 * The copy itself was the defect in one of the audit's findings: /settings
 * advertised a gap the product had already closed.
 */
describe("the /settings password panel", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pageSource = readFileSync(path.join(here, "page.tsx"), "utf8");

  it("no longer says password change is unavailable", () => {
    expect(pageSource).not.toContain("още не е готова");
    expect(pageSource).not.toContain("възстановяваме достъпа ръчно");
  });

  it("mounts the controls and points a forgetful student at the shipped flow", () => {
    expect(pageSource).toContain("<PasswordControls />");
    expect(pageSource).toContain('href="/forgot"');
  });
});
