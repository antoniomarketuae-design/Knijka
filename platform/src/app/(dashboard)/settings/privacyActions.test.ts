import { hashSync } from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryPrivacyStore,
  setPrivacyStore,
  type PrivacyUserRecord,
} from "@/modules/privacy";
import { InMemoryAuthStore, setAuthStore, type AuthUserRecord } from "@/modules/auth";
import { resetRateLimitState } from "@/modules/security";
import { DELETE_CONFIRM_PHRASE, initialDeleteAccountState } from "./privacy-contract";

const PASSWORD = "parola1234";
const PASSWORD_HASH = hashSync(PASSWORD, 4); // cost 4: see auth/service.test.ts

const signOut = vi.fn<(options: { redirectTo: string }) => Promise<void>>();
const requireUser = vi.fn();

// next-auth's signOut redirects, which would abort the test process. The
// action's job here is to CALL it — that it clears the cookie is next-auth's.
vi.mock("@/auth", () => ({ signOut }));

// requireUser is the action's only identity input. Mocked so the test can run
// without a request context, while everything below it stays real.
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  requireUser: () => requireUser(),
}));

const { deleteMyAccount, exportMyData } = await import("./actions");

const SESSION_USER = {
  id: "mine",
  email: "mine@mail.bg",
  name: "Иван",
  isAdmin: false,
};

function seed(): InMemoryPrivacyStore {
  const users: PrivacyUserRecord[] = [
    {
      id: "mine",
      email: "mine@mail.bg",
      name: "Иван",
      birthYear: 2009,
      locale: "bg",
      consentAt: new Date("2026-06-01T08:00:00.000Z"),
      createdAt: new Date("2026-06-01T08:00:00.000Z"),
      hasPassword: true,
    },
  ];
  const authUsers = users as unknown as AuthUserRecord[];
  authUsers[0].passwordHash = PASSWORD_HASH;
  authUsers[0].role = "student";

  const privacy = new InMemoryPrivacyStore(users);
  privacy.questionAttempts.push({
    userId: "mine",
    questionId: "q1",
    context: "practice",
    correct: true,
    points: 1,
    answeredAt: new Date("2026-07-20T09:00:00.000Z"),
  });

  setPrivacyStore(privacy);
  setAuthStore(new InMemoryAuthStore(authUsers));
  return privacy;
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  requireUser.mockResolvedValue(SESSION_USER);
  signOut.mockClear();
  // The delete action now shares the credential-check budget with the password
  // change (both pay a cost-12 bcrypt). Reset so suite ORDER never decides
  // whether a test's fifth wrong password is refused for the wrong reason.
  resetRateLimitState();
});

afterEach(() => {
  setPrivacyStore(null);
  setAuthStore(null);
});

describe("exportMyData action", () => {
  it("returns downloadable JSON for the SESSION user, parsed-back intact", async () => {
    seed();

    const result = await exportMyData();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fileName).toMatch(/^knijka-ai-moite-danni-\d{4}-\d{2}-\d{2}\.json$/);

    const parsed = JSON.parse(result.json);
    expect(parsed.account.id).toBe("mine");
    expect(parsed.questionAttempts).toHaveLength(1);
  });

  it("reports not_found instead of throwing when the session outlived the account", async () => {
    setPrivacyStore(new InMemoryPrivacyStore([]));

    expect(await exportMyData()).toEqual({ ok: false, error: "not_found" });
  });
});

describe("deleteMyAccount action", () => {
  it("deletes nothing and does not sign out when the confirmation word is wrong", async () => {
    const privacy = seed();

    const state = await deleteMyAccount(
      initialDeleteAccountState,
      form({ password: PASSWORD, confirm: "изтрий" }), // lowercase ≠ ИЗТРИЙ
    );

    expect(state.status).toBe("error");
    expect(privacy.users).toHaveLength(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("deletes nothing when the password is wrong, even with the word typed right", async () => {
    const privacy = seed();

    const state = await deleteMyAccount(
      initialDeleteAccountState,
      form({ password: "gresna-parola", confirm: DELETE_CONFIRM_PHRASE }),
    );

    expect(state).toMatchObject({ status: "error" });
    expect(state.message).toContain("непокътнат");
    expect(privacy.users).toHaveLength(1);
    expect(privacy.questionAttempts).toHaveLength(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("erases the account and signs the browser out when both checks pass", async () => {
    const privacy = seed();

    await deleteMyAccount(
      initialDeleteAccountState,
      form({ password: PASSWORD, confirm: DELETE_CONFIRM_PHRASE }),
    );

    expect(privacy.users).toEqual([]);
    expect(privacy.questionAttempts).toEqual([]);
    // A surviving JWT cookie would keep every requireUser() page half-working
    // against a user id that no longer exists.
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/?deleted=1" });
  });

  it("ignores a userId posted in the form — identity comes from the session only", async () => {
    const privacy = seed();
    // A second account the attacker would like to destroy.
    privacy.users.push({
      id: "victim",
      email: "victim@mail.bg",
      name: "Мария",
      birthYear: 2008,
      locale: "bg",
      consentAt: null,
      createdAt: new Date("2026-06-02T08:00:00.000Z"),
      hasPassword: true,
    });

    await deleteMyAccount(
      initialDeleteAccountState,
      form({
        password: PASSWORD,
        confirm: DELETE_CONFIRM_PHRASE,
        userId: "victim",
        email: "victim@mail.bg",
      }),
    );

    // Only the session's own account went.
    expect(privacy.users.map((u) => u.id)).toEqual(["victim"]);
  });
});
