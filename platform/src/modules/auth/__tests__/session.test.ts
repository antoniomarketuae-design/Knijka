/**
 * modules/auth/session — the authorization boundary every protected surface
 * stands on (audit 2026-07-24, H-13). `isAdmin` decides who can reach the
 * content-review routes and who bypasses the free-tier exam limit, so the one
 * property that matters is: it comes from the DATABASE, never from the token.
 *
 * `auth()` (next-auth) is the session source, mocked here — these tests are
 * about what session.ts does with whatever the token claims, which is exactly
 * where a forged or stale token would do its damage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
// Must be mocked before session.ts is imported: it pulls `auth` from the
// NextAuth wiring, which would otherwise try to boot the real provider stack.
vi.mock("@/auth", () => ({ auth: authMock }));

const { getSessionUser } = await import("../session");
const { getAuthStore, InMemoryAuthStore, setAuthStore } = await import("../store");
type AuthUserRecord = import("../store").AuthUserRecord;

let users: AuthUserRecord[];

function student(over: Partial<AuthUserRecord> = {}): AuthUserRecord {
  return {
    id: "user-1",
    email: "ivan@mail.bg",
    name: "Иван",
    passwordHash: "$2b$12$irrelevant",
    role: "student",
    sessionEpoch: 0,
    ...over,
  };
}

/** What next-auth hands back for a signed-in user. */
function sessionFor(user: { id?: string; email?: string; name?: string | null }) {
  return { user };
}

beforeEach(() => {
  users = [student()];
  setAuthStore(new InMemoryAuthStore(users));
  authMock.mockReset();
});

afterEach(() => {
  setAuthStore(null);
});

describe("getSessionUser", () => {
  it("returns null when there is no session at all", async () => {
    authMock.mockResolvedValue(null);
    expect(await getSessionUser()).toBeNull();
  });

  it("returns null for a session missing the id or the e-mail", async () => {
    authMock.mockResolvedValue(sessionFor({ email: "ivan@mail.bg" }));
    expect(await getSessionUser()).toBeNull();
    authMock.mockResolvedValue(sessionFor({ id: "user-1" }));
    expect(await getSessionUser()).toBeNull();
  });

  it("reads the role from the STORE — a token cannot claim admin", async () => {
    // The token carries only id/email/name; even if an attacker forged extra
    // claims, session.ts never looks at them.
    authMock.mockResolvedValue({
      user: { id: "user-1", email: "ivan@mail.bg", name: "Иван", role: "admin", isAdmin: true },
    });
    const user = await getSessionUser();
    expect(user?.isAdmin).toBe(false);
  });

  it("reflects a role granted in the database, with no re-login", async () => {
    authMock.mockResolvedValue(sessionFor({ id: "user-1", email: "ivan@mail.bg" }));
    users[0].role = "admin";
    expect((await getSessionUser())?.isAdmin).toBe(true);
  });

  it("FAILS CLOSED: a store error degrades to student, never to admin", async () => {
    authMock.mockResolvedValue(sessionFor({ id: "user-1", email: "ivan@mail.bg" }));
    setAuthStore({
      findUserByEmail: async () => null,
      createUser: async () => {
        throw new Error("unused");
      },
      findAccountById: async () => {
        throw new Error("db is down");
      },
      bumpSessionEpoch: async () => null,
    });
    const user = await getSessionUser();
    expect(user).not.toBeNull();
    expect(user?.isAdmin).toBe(false);
  });

  it("FAILS CLOSED: a session id with no matching row is a student", async () => {
    // The row was erased (GDPR Art. 17) while the JWT is still valid.
    authMock.mockResolvedValue(sessionFor({ id: "ghost-99", email: "ivan@mail.bg" }));
    expect((await getSessionUser())?.isAdmin).toBe(false);
  });
});

/**
 * SESSION REVOCATION (User.sessionEpoch).
 *
 * The hole this closes: sessions are stateless JWTs with a 30-day idle life and
 * no Session table, so „смених си паролата, защото някой ми знае акаунта" left
 * that someone signed in for another month. A password reset invalidated the
 * outstanding LINKS and nothing else.
 *
 * The check is a comparison between the epoch stamped into the token at
 * sign-in and the live column, inside the DB read the role already needed.
 */
describe("getSessionUser — session epoch", () => {
  /** A session as next-auth builds it once src/auth.ts has stamped the epoch. */
  function sessionWithEpoch(sessionEpoch: number | undefined) {
    return {
      user: { id: "user-1", email: "ivan@mail.bg", name: "Иван", sessionEpoch },
    };
  }

  it("accepts a token whose epoch matches the account", async () => {
    authMock.mockResolvedValue(sessionWithEpoch(0));
    expect((await getSessionUser())?.id).toBe("user-1");
  });

  it("REVOKES a token minted before the epoch was bumped", async () => {
    authMock.mockResolvedValue(sessionWithEpoch(0));
    expect(await getSessionUser()).not.toBeNull();

    // „Изход от всички устройства" / a password reset.
    await getAuthStore().bumpSessionEpoch("user-1");

    // Same cookie, same everything — and it is no longer a session.
    expect(await getSessionUser()).toBeNull();
  });

  it("keeps a token minted AFTER the bump", async () => {
    await getAuthStore().bumpSessionEpoch("user-1");
    authMock.mockResolvedValue(sessionWithEpoch(1));
    expect((await getSessionUser())?.id).toBe("user-1");
  });

  it("does not sign anyone out on the deploy that lands the column", async () => {
    // Tokens issued before src/auth.ts stamped an epoch carry none at all.
    // They must read as 0 — every account's default — or shipping this logs the
    // entire userbase out at once.
    authMock.mockResolvedValue(sessionWithEpoch(undefined));
    expect((await getSessionUser())?.id).toBe("user-1");
  });

  it("cannot be beaten by a token claiming a higher epoch", async () => {
    // The comparison is equality against the row, not "at least as new as".
    authMock.mockResolvedValue(sessionWithEpoch(999));
    expect(await getSessionUser()).toBeNull();
  });

  it("does not log the world out when the database is unreachable", async () => {
    // Login cannot work without the DB anyway; converting a Postgres blip into
    // a site-wide forced logout would be a self-inflicted outage.
    authMock.mockResolvedValue(sessionWithEpoch(0));
    setAuthStore({
      findUserByEmail: async () => null,
      createUser: async () => {
        throw new Error("unused");
      },
      findAccountById: async () => {
        throw new Error("db is down");
      },
      bumpSessionEpoch: async () => null,
    });
    expect((await getSessionUser())?.id).toBe("user-1");
  });
});
