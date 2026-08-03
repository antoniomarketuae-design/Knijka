/**
 * Persistence boundary of the auth module (same pattern as
 * @/modules/payments and @/modules/learning):
 *
 * - Production: PrismaAuthStore over the User table. Prisma is imported
 *   LAZILY inside the methods, so importing this file (from a unit test, or
 *   from a module that only needs the types) never requires DATABASE_URL.
 * - Tests: InMemoryAuthStore injected via setAuthStore().
 *
 * Why this exists at all: before it, `verifyCredentials` reached straight into
 * `db`, which made the single most security-sensitive function in the product
 * untestable without a live Postgres. It also makes the GDPR erasure test
 * possible — @/modules/privacy deletes the row, and the SAME in-memory user
 * table is what login then fails to find (see privacy/__tests__/erase.test.ts).
 */

/** The only User columns auth ever reads. Deliberately narrow (GDPR minors). */
export interface AuthUserRecord {
  id: string;
  email: string;
  name: string | null;
  /** bcrypt hash, or null for accounts created without a password (OAuth). */
  passwordHash: string | null;
  /** "student" | "admin" — internal access flag, not PII. */
  role: string;
  /**
   * User.sessionEpoch — the revocation counter, stamped into the JWT at
   * sign-in. Read here (not only in findAccountById) because the sign-in path
   * is where the token gets its epoch, and a second query for one integer on a
   * path that already pays 300 ms of bcrypt would be pure waste.
   */
  sessionEpoch: number;
}

/**
 * What the per-request session guard needs from the DB, and nothing else.
 *
 * Both fields answer "is this token still allowed to be this person?", which is
 * why they are read together: `role` because a forged token must not be able to
 * claim admin, `sessionEpoch` because a stateless JWT is otherwise impossible
 * to take back. getSessionUser() already made this round trip for the role, so
 * revocation costs zero additional queries — the reason the epoch is a counter
 * on User and not a sessions table.
 */
export interface AccountFlags {
  role: string;
  sessionEpoch: number;
}

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string;
  birthYear: number;
  consentAt: Date;
  locale: string;
}

/**
 * Thrown by createUser when the e-mail is already registered. The store — not
 * its callers — owns the Prisma-specific detection (P2002), so registerUser
 * stays free of driver details and the in-memory fake can raise the exact
 * same failure.
 */
export class EmailTakenError extends Error {
  constructor() {
    super("email already registered");
    this.name = "EmailTakenError";
  }
}

export interface AuthStore {
  /** Login lookup. `email` is expected already normalized (trimmed+lowercased). */
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  /** Registration. Throws EmailTakenError when the e-mail is taken. */
  createUser(input: CreateUserInput): Promise<{
    id: string;
    email: string;
    name: string | null;
  }>;
  /**
   * Role + session epoch for the per-request session guard (never trusts the
   * JWT). Null when the row is gone — the account was erased under a live
   * session.
   */
  findAccountById(userId: string): Promise<AccountFlags | null>;
  /**
   * „Изход от всички устройства" — increment User.sessionEpoch and return the
   * new value, so every JWT issued before this moment stops being accepted.
   *
   * ONE STATEMENT, not read-then-write: two devices signing out everywhere at
   * the same instant must not both read 3 and both write 4, which would leave
   * one of them still valid. Returns the fresh epoch so a caller that wants to
   * KEEP the current device signed in can re-stamp its token.
   */
  bumpSessionEpoch(userId: string): Promise<number | null>;
}
// Password reset needs a wider set of operations (and a second table); it has
// its own seam in reset-store.ts, deliberately NOT bolted onto this interface —
// every fake of AuthStore in the repo would have to grow six methods it never
// calls, and this one is what login runs on.

// ---------------------------------------------------------------------------
// Prisma-backed store (production default)
// ---------------------------------------------------------------------------

class PrismaAuthStore implements AuthStore {
  /** Lazy so importing the auth module never boots Prisma. */
  private async db() {
    const { db } = await import("@/lib/db");
    return db;
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const db = await this.db();
    return db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        role: true,
        sessionEpoch: true,
      },
    });
  }

  async createUser(input: CreateUserInput) {
    const db = await this.db();
    const { Prisma } = await import("@/generated/prisma/client");
    try {
      return await db.user.create({
        data: input,
        select: { id: true, email: true, name: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" // unique constraint violation (email)
      ) {
        // Detected via the DB constraint, not a pre-check — race-safe.
        throw new EmailTakenError();
      }
      throw err; // real failures (DB down etc.) surface as 500 in the route
    }
  }

  async findAccountById(userId: string): Promise<AccountFlags | null> {
    const db = await this.db();
    const row = await db.user.findUnique({
      where: { id: userId },
      select: { role: true, sessionEpoch: true },
    });
    return row ?? null;
  }

  async bumpSessionEpoch(userId: string): Promise<number | null> {
    const db = await this.db();
    try {
      const row = await db.user.update({
        where: { id: userId },
        data: { sessionEpoch: { increment: 1 } },
        select: { sessionEpoch: true },
      });
      return row.sessionEpoch;
    } catch {
      // P2025 — the account is already gone, so there is nothing to revoke and
      // every session pointing at it is dead on its next request anyway.
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory store (tests / local tooling)
// ---------------------------------------------------------------------------

export class InMemoryAuthStore implements AuthStore {
  private nextId = 1;

  /**
   * The backing user table. Accepted by reference so a test can hand the SAME
   * array to another module's fake (privacy) and have a deletion there be
   * visible here — which is exactly what "a deleted user cannot log in" means.
   */
  constructor(readonly users: AuthUserRecord[] = []) {}

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.users.find((u) => u.email === email) ?? null;
  }

  async createUser(input: CreateUserInput) {
    if (this.users.some((u) => u.email === input.email)) {
      throw new EmailTakenError();
    }
    const record: AuthUserRecord = {
      id: `user-${this.nextId++}`,
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      role: "student",
      sessionEpoch: 0,
    };
    this.users.push(record);
    return { id: record.id, email: record.email, name: record.name };
  }

  async findAccountById(userId: string): Promise<AccountFlags | null> {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return null;
    return { role: user.role, sessionEpoch: user.sessionEpoch ?? 0 };
  }

  async bumpSessionEpoch(userId: string): Promise<number | null> {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return null;
    user.sessionEpoch = (user.sessionEpoch ?? 0) + 1;
    return user.sessionEpoch;
  }
}

// ---------------------------------------------------------------------------
// Injection point
// ---------------------------------------------------------------------------

let store: AuthStore | null = null;

/** Tests inject a fake (or null to reset); production falls back to Prisma. */
export function setAuthStore(s: AuthStore | null): void {
  store = s;
}

export function getAuthStore(): AuthStore {
  if (!store) store = new PrismaAuthStore();
  return store;
}
