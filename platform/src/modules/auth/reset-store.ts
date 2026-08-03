/**
 * Persistence boundary of the password-reset flow (audit 2026-07-24, H-14).
 *
 * WHY THIS IS A SECOND SEAM AND NOT SIX MORE METHODS ON AuthStore: AuthStore is
 * the narrow thing login runs on ("the only User columns auth ever reads"), and
 * it is faked in several suites across the repo. Widening it would force every
 * one of those fakes to implement token operations they never call, for no
 * benefit — and a fake that has to grow to keep compiling is how test doubles
 * quietly stop resembling production. Reset is a distinct capability with its
 * own table; it gets its own interface, its own fake and its own injection
 * point, exactly like @/modules/privacy did.
 *
 * As with the other stores, Prisma is imported LAZILY inside the methods, so a
 * unit test that touches this file never needs DATABASE_URL.
 */

import type { AuthUserRecord } from "./store";

/**
 * One password-reset link, as the store sees it.
 *
 * There is no `token` field anywhere in this file, and that is the point: the
 * raw token exists in the e-mail and in the student's URL bar, never in our
 * database. The store is handed `sha256(token)` and can only compare hashes,
 * so a leaked backup grants nobody an account.
 */
export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  /** null while the link is still spendable; set once, never cleared. */
  usedAt: Date | null;
}

export interface CreatePasswordResetTokenInput {
  userId: string;
  /** sha256(token), hex — see PasswordResetTokenRecord. */
  tokenHash: string;
  expiresAt: Date;
}

export interface PasswordResetStore {
  createToken(input: CreatePasswordResetTokenInput): Promise<void>;
  /** Lookup by hash. Returns the row even when expired or already spent — the
   *  SERVICE decides what that means, so the failures stay distinguishable. */
  findTokenByHash(tokenHash: string): Promise<PasswordResetTokenRecord | null>;
  /**
   * Marks the token spent, ATOMICALLY. Returns false when it was already
   * spent — this is the single-use guarantee, and it has to be one conditional
   * write rather than read-then-write: two tabs submitting the same link would
   * both pass a read-then-write check.
   */
  consumeToken(id: string, usedAt: Date): Promise<boolean>;
  /** Burns every still-unused token of this user (after a successful reset). */
  invalidateTokensForUser(userId: string, usedAt: Date): Promise<void>;
  /** The reset path holds a token, not an address. Null = the account was
   *  erased (GDPR Art. 17) between the e-mail and the click. */
  findUserById(userId: string): Promise<AuthUserRecord | null>;
  /** The write the whole flow exists for. */
  setPasswordHash(userId: string, passwordHash: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Prisma-backed store (production default)
// ---------------------------------------------------------------------------

class PrismaPasswordResetStore implements PasswordResetStore {
  private async db() {
    const { db } = await import("@/lib/db");
    return db;
  }

  async createToken(input: CreatePasswordResetTokenInput): Promise<void> {
    const db = await this.db();
    await db.passwordResetToken.create({ data: input });
  }

  async findTokenByHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenRecord | null> {
    const db = await this.db();
    return db.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });
  }

  async consumeToken(id: string, usedAt: Date): Promise<boolean> {
    const db = await this.db();
    // updateMany + `usedAt: null` in the WHERE is the atomic compare-and-set:
    // Postgres picks the winner, so a double submit consumes the link once and
    // the loser gets `count === 0`.
    const { count } = await db.passwordResetToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt },
    });
    return count === 1;
  }

  async invalidateTokensForUser(userId: string, usedAt: Date): Promise<void> {
    const db = await this.db();
    await db.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt },
    });
  }

  async findUserById(userId: string): Promise<AuthUserRecord | null> {
    const db = await this.db();
    return db.user.findUnique({
      where: { id: userId },
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

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    const db = await this.db();
    await db.user.update({ where: { id: userId }, data: { passwordHash } });
  }
}

// ---------------------------------------------------------------------------
// In-memory store (tests / local tooling)
// ---------------------------------------------------------------------------

/** The fake's row type — the hash is on it, because the fake IS the table. */
export type InMemoryResetToken = PasswordResetTokenRecord & {
  tokenHash: string;
};

export class InMemoryPasswordResetStore implements PasswordResetStore {
  private nextId = 1;

  /**
   * Both arrays are accepted by reference so a test can hand the SAME `users`
   * array to InMemoryAuthStore — which is what makes "the reset actually
   * changed the password" provable through verifyCredentials rather than by
   * inspecting a hash (the same trick privacy's fake uses for erasure).
   */
  constructor(
    readonly users: AuthUserRecord[] = [],
    readonly tokens: InMemoryResetToken[] = [],
  ) {}

  async createToken(input: CreatePasswordResetTokenInput): Promise<void> {
    this.tokens.push({
      id: `prt-${this.nextId++}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
    });
  }

  async findTokenByHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenRecord | null> {
    return this.tokens.find((t) => t.tokenHash === tokenHash) ?? null;
  }

  async consumeToken(id: string, usedAt: Date): Promise<boolean> {
    const token = this.tokens.find((t) => t.id === id);
    // Mirrors the conditional update above: only an unused row is consumable,
    // and consuming it twice returns false the second time.
    if (!token || token.usedAt) return false;
    token.usedAt = usedAt;
    return true;
  }

  async invalidateTokensForUser(userId: string, usedAt: Date): Promise<void> {
    for (const token of this.tokens) {
      if (token.userId === userId && !token.usedAt) token.usedAt = usedAt;
    }
  }

  async findUserById(userId: string): Promise<AuthUserRecord | null> {
    return this.users.find((u) => u.id === userId) ?? null;
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    const user = this.users.find((u) => u.id === userId);
    if (user) user.passwordHash = passwordHash;
  }
}

// ---------------------------------------------------------------------------
// Injection point
// ---------------------------------------------------------------------------

let store: PasswordResetStore | null = null;

/** Tests inject a fake (or null to reset); production falls back to Prisma. */
export function setPasswordResetStore(s: PasswordResetStore | null): void {
  store = s;
}

export function getPasswordResetStore(): PasswordResetStore {
  if (!store) store = new PrismaPasswordResetStore();
  return store;
}
