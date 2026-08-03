/**
 * Where a failed-login streak LIVES — the persistence seam behind
 * `checkLockout` / `recordFailure` / `clearFailures`.
 *
 * WHY THIS FILE EXISTS AT ALL: the counters used to be a per-process `Map`,
 * and `tools/deploy/knijka.cron` redeploys the box EVERY FIVE MINUTES. So the
 * exponential backoff that makes online password guessing pointless — 30 s,
 * 1 m, 2 m … 15 min — was wiped clean by us, on a schedule, handing an attacker
 * an unlimited supply of fresh budgets. rateLimit.ts's header called
 * per-process counters a known cost of the design; nobody had multiplied it by
 * the deploy interval. The LoginLockout table (prisma/schema.prisma) is the
 * fix; this is the seam in front of it.
 *
 * WHY ONLY THE LOCKOUT MOVES and the per-source budgets stay in the Map: a
 * failed login already pays ~300 ms of bcrypt by design, so a ~1 ms query
 * alongside it is not measurable. The per-IP budgets guard hot paths where the
 * round trip WOULD show, and losing those on deploy costs far less.
 *
 * As with every other store in the repo, Prisma is imported LAZILY inside the
 * methods, so importing this file (from a unit test, from the proxy) never
 * requires DATABASE_URL.
 */

/** One identifier's streak, exactly the shape the pure policy in rateLimit.ts
 *  reasons about. Mirrors the LoginLockout columns one-for-one. */
export interface LockoutRecord {
  failures: number;
  /** null = counting, not yet locked. */
  lockedUntil: Date | null;
  /** After this the streak is forgotten — yesterday's typos are not today's. */
  forgetAt: Date;
}

export interface LockoutStore {
  /** `identifierHash` is sha256(identifier) hex — the raw address never lands
   *  in a row (see the schema note: this table must be creatable for addresses
   *  that were never registered, so it must not become a second list of every
   *  address anyone typed at the login form). */
  find(rule: string, identifierHash: string): Promise<LockoutRecord | null>;
  save(rule: string, identifierHash: string, record: LockoutRecord): Promise<void>;
  clear(rule: string, identifierHash: string): Promise<void>;
  /** Housekeeping sweep: drop streaks nobody is counting any more. Returns the
   *  number of rows removed. Without it the table only ever grows, and the one
   *  filling it is an attacker rotating addresses. */
  purgeExpired(now: Date): Promise<number>;
}

// ---------------------------------------------------------------------------
// Prisma-backed store (production default)
// ---------------------------------------------------------------------------

class PrismaLockoutStore implements LockoutStore {
  private async db() {
    const { db } = await import("@/lib/db");
    return db;
  }

  async find(rule: string, identifierHash: string): Promise<LockoutRecord | null> {
    const db = await this.db();
    const row = await db.loginLockout.findUnique({
      where: { rule_identifierHash: { rule, identifierHash } },
      select: { failures: true, lockedUntil: true, forgetAt: true },
    });
    return row ?? null;
  }

  async save(
    rule: string,
    identifierHash: string,
    record: LockoutRecord,
  ): Promise<void> {
    const db = await this.db();
    await db.loginLockout.upsert({
      where: { rule_identifierHash: { rule, identifierHash } },
      create: { rule, identifierHash, ...record },
      update: record,
    });
  }

  async clear(rule: string, identifierHash: string): Promise<void> {
    const db = await this.db();
    // deleteMany, not delete: a clear for an identifier with no streak is the
    // normal case (every successful login), and it must not throw P2025.
    await db.loginLockout.deleteMany({ where: { rule, identifierHash } });
  }

  async purgeExpired(now: Date): Promise<number> {
    const db = await this.db();
    const { count } = await db.loginLockout.deleteMany({
      where: { forgetAt: { lte: now } },
    });
    return count;
  }
}

// ---------------------------------------------------------------------------
// In-memory store (tests / local tooling)
// ---------------------------------------------------------------------------

export class InMemoryLockoutStore implements LockoutStore {
  /** Exposed so a test can assert on what was actually persisted. */
  readonly rows = new Map<string, LockoutRecord>();

  private key(rule: string, identifierHash: string): string {
    return `${rule}:${identifierHash}`;
  }

  async find(rule: string, identifierHash: string): Promise<LockoutRecord | null> {
    return this.rows.get(this.key(rule, identifierHash)) ?? null;
  }

  async save(
    rule: string,
    identifierHash: string,
    record: LockoutRecord,
  ): Promise<void> {
    this.rows.set(this.key(rule, identifierHash), { ...record });
  }

  async clear(rule: string, identifierHash: string): Promise<void> {
    this.rows.delete(this.key(rule, identifierHash));
  }

  async purgeExpired(now: Date): Promise<number> {
    let removed = 0;
    for (const [key, record] of this.rows) {
      if (record.forgetAt.getTime() <= now.getTime()) {
        this.rows.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}

// ---------------------------------------------------------------------------
// Injection point
// ---------------------------------------------------------------------------

let store: LockoutStore | null = null;

/** Tests inject a fake (or null to reset); production falls back to Prisma. */
export function setLockoutStore(s: LockoutStore | null): void {
  store = s;
}

export function getLockoutStore(): LockoutStore {
  if (!store) store = new PrismaLockoutStore();
  return store;
}
