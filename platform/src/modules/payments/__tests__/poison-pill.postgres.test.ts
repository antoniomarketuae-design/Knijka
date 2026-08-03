/**
 * THE POISON PILL — a real-Postgres test, because a fake store cannot hold it.
 *
 * THE SEQUENCE, exactly as it was found:
 *
 *   1. Support revokes one student's access. /admin DELETES the Entitlement
 *      row. The Payment row survives, deliberately — a receipt must outlive a
 *      grant, and Art. 17 erasure keeps it too (userId → NULL via SetNull).
 *   2. Stripe replays that Checkout Session, as at-least-once delivery says it
 *      may, for up to ~3 days.
 *   3. recordPurchase opens its transaction, inserts the Entitlement (nothing
 *      conflicts — it was deleted), then inserts the Payment and hits
 *      `Payment_stripeSessionId_key`. THE WHOLE TRANSACTION ROLLS BACK, taking
 *      the entitlement it just wrote with it.
 *   4. The catch looked for an entitlement to report as already-fulfilled,
 *      found none — the rollback removed it — and RETHREW.
 *
 * So the webhook answered 500 to every Stripe retry for about three days,
 * triggered by an ordinary support action. Revoke one student's access, take
 * down the fulfilment endpoint.
 *
 * WHY THIS FILE TALKS TO POSTGRES. The defect is an interaction between two
 * tables' constraints inside one transaction, and it only bites because the
 * failed INSERT is rolled back. An in-memory fake has no transactions, no
 * rollback and no cross-table constraint, so it cannot produce the state at
 * all: run the same sequence against InMemoryPaymentsStore and it is green
 * before the fix. That is precisely how this survived a suite that already had
 * a concurrency test. `__tests__/receipt-and-race.test.ts` owns the fake-store
 * contract; this file owns the parts only a database can answer.
 *
 * WHAT IT PROVES
 *   · a replay after a SUPPORT REVOKE is reported, not thrown  (cause 1)
 *   · a replay after ART. 17 ERASURE is reported, not thrown   (cause 2 —
 *     which fails with a DIFFERENT error code, see the test)
 *   · neither replay resurrects access, and neither writes a second receipt
 *   · both hold under FIVE SIMULTANEOUS replays on real Postgres
 *   · a purchase that is genuinely unfulfillable still throws — the fix must
 *     not have bought quiet with silence
 *
 * RUNNING IT. Uses PAYMENTS_TEST_DATABASE_URL, else DATABASE_URL — any
 * Postgres with the migrations applied (`npx prisma migrate deploy`). CI has
 * one and applies them before `vitest run`, so CI always executes this file:
 * if the database is missing there, this file FAILS rather than skipping.
 * Locally, a developer with no migrated database gets a loud skip instead of a
 * mystery red. Every row it writes is prefixed and dropped in afterAll, so it
 * is safe to point at a shared development database.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  PaymentsStore,
  RecordPurchaseInput,
  RecordPurchaseResult,
} from "../store";

// `||`, not `??`: .env.example ships PAYMENTS_TEST_DATABASE_URL="" so the
// variable is discoverable, and a developer who copies that file has it SET to
// the empty string. With `??` the empty string would win over a perfectly good
// DATABASE_URL and this file would skip — the exact silent skip it exists to
// prevent, installed by its own documentation.
const DB_URL =
  process.env.PAYMENTS_TEST_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "";

// The store imports @/lib/db lazily and that module reads DATABASE_URL once,
// at construction. Point it at the test database BEFORE anything imports it.
// Vitest isolates each test file in its own worker, so this cannot leak.
if (DB_URL) process.env.DATABASE_URL = DB_URL;

/** Unique per run: two runs against one database must not collide. */
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const USER_PREFIX = `pp-${RUN}-`;
const SESSION_PREFIX = `cs_pp_${RUN}_`;

type Db = Awaited<typeof import("@/lib/db")>["db"];

/**
 * Is there a migrated Postgres to test against? Returns a reason to skip, or
 * null when the database is ready.
 */
async function findSkipReason(): Promise<string | null> {
  if (!DB_URL) {
    return "neither PAYMENTS_TEST_DATABASE_URL nor DATABASE_URL is set";
  }
  try {
    const { db } = await import("@/lib/db");
    const rows = await db.$queryRaw<{ payment: boolean; entitlement: boolean }[]>`
      select to_regclass('public."Payment"')     is not null as payment,
             to_regclass('public."Entitlement"') is not null as entitlement
    `;
    if (!rows[0]?.payment || !rows[0]?.entitlement) {
      return "the database has no Payment/Entitlement tables — run `npx prisma migrate deploy`";
    }
    return null;
  } catch (err) {
    return `cannot reach the database: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const skipReason = await findSkipReason();

// CI MUST NEVER SKIP THIS. CI stands up postgres:17 and applies every
// migration before it runs vitest, so an unreachable or unmigrated database
// there is a broken gate, not a missing convenience — and a silently skipped
// money test is how a defect like this one reaches students.
if (skipReason && process.env.CI) {
  throw new Error(
    `poison-pill.postgres.test.ts cannot run in CI: ${skipReason}. ` +
      `This test guards the fulfilment endpoint against a 3-day outage; ` +
      `fix the database, never the skip.`,
  );
}

if (skipReason) {
  // process.stderr, not console.warn: vitest intercepts console output and a
  // SKIPPED file's intercepted output is never printed — so the warning that
  // exists to stop a silent skip would itself be silent.
  process.stderr.write(
    `\n[poison-pill.postgres.test.ts] SKIPPED — ${skipReason}.\n` +
      `  These are the only tests that reproduce the revoke/erasure replay\n` +
      `  defect; the fake store cannot. Point PAYMENTS_TEST_DATABASE_URL at a\n` +
      `  migrated Postgres to run them.\n\n`,
  );
}

const PURCHASED_AT = new Date("2026-08-01T10:00:00.000Z");
const EXPIRES_AT = new Date("2026-12-01T10:00:00.000Z");

function purchase(userId: string, sessionId: string): RecordPurchaseInput {
  return {
    entitlement: {
      userId,
      pack: "core",
      purchasedAt: PURCHASED_AT,
      expiresAt: EXPIRES_AT,
      provider: "stripe",
      providerRef: sessionId,
    },
    payment: {
      stripeSessionId: sessionId,
      stripePaymentIntentId: `pi_${sessionId}`,
      userId,
      pack: "core",
      amountCents: 1299,
      currency: "eur",
      livemode: true,
      status: "paid",
      rawEventId: `evt_${sessionId}`,
    },
  };
}

/** Narrow `created` and hand back the row — the union has no id otherwise. */
function createdEntitlementId(result: RecordPurchaseResult): string {
  expect(result.status).toBe("created");
  if (result.status !== "created") throw new Error("unreachable");
  return result.entitlement.id;
}

describe.skipIf(skipReason !== null)("the poison-pill replay (real Postgres)", () => {
  let db: Db;
  let store: PaymentsStore;
  let getEntitlements: typeof import("../entitlements")["getEntitlements"];

  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    // No store injected → getPaymentsStore() builds the real PrismaPaymentsStore.
    const storeMod = await import("../store");
    storeMod.setPaymentsStore(null);
    store = storeMod.getPaymentsStore();
    getEntitlements = (await import("../entitlements")).getEntitlements;
  });

  afterAll(async () => {
    if (!db) return;
    // Only this run's rows. Payments first: they outlive their user by design,
    // so deleting the user would leave them behind, pseudonymised.
    await db.payment.deleteMany({
      where: { stripeSessionId: { startsWith: SESSION_PREFIX } },
    });
    await db.user.deleteMany({ where: { id: { startsWith: USER_PREFIX } } });
    await db.entitlement.deleteMany({
      where: { providerRef: { startsWith: SESSION_PREFIX } },
    });
    await db.$disconnect();
  });

  async function makeUser(suffix: string): Promise<string> {
    const id = `${USER_PREFIX}${suffix}`;
    await db.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        passwordHash: "not-a-real-hash",
        name: "Poison Pill",
      },
    });
    return id;
  }

  it("CAUSE 1 — a replay after SUPPORT REVOKED the access is reported, not thrown", async () => {
    const userId = await makeUser("revoke");
    const sessionId = `${SESSION_PREFIX}revoke`;

    const first = await store.recordPurchase(purchase(userId, sessionId));
    const entitlementId = createdEntitlementId(first);

    // Exactly what /admin does (src/modules/admin/store.ts revokeEntitlement):
    // deleteMany keyed on BOTH ids, and the receipt is left alone.
    const { count } = await db.entitlement.deleteMany({
      where: { id: entitlementId, userId },
    });
    expect(count, "the revoke deleted the grant").toBe(1);
    expect(
      await db.payment.count({ where: { stripeSessionId: sessionId } }),
      "the receipt deliberately survives the revoke",
    ).toBe(1);

    // …and now Stripe replays the session. THIS is the call that used to throw
    // P2002 and 500 the webhook on every retry for ~3 days.
    const replay = await store.recordPurchase(purchase(userId, sessionId));
    expect(replay.status).toBe("receipt-without-grant");
    if (replay.status !== "receipt-without-grant") throw new Error("unreachable");
    expect(replay.stripeSessionId).toBe(sessionId);
    expect(replay.paymentId).toBeTruthy();

    // THE SAFETY PROPERTY: the revoke stands. A replay must never hand back
    // access a human deliberately took away.
    expect(
      await db.entitlement.count({ where: { provider: "stripe", providerRef: sessionId } }),
      "no grant was resurrected",
    ).toBe(0);
    const access = await getEntitlements(userId);
    expect(access.hasCore, "the student still has no access").toBe(false);

    // …and the books are unchanged: one purchase, one receipt.
    expect(
      await db.payment.count({ where: { stripeSessionId: sessionId } }),
    ).toBe(1);
  });

  it("CAUSE 2 — a replay after ART. 17 ERASURE is reported, not thrown", async () => {
    const userId = await makeUser("erased");
    const sessionId = `${SESSION_PREFIX}erased`;

    createdEntitlementId(await store.recordPurchase(purchase(userId, sessionId)));

    // Erasure: deleting the User cascades the Entitlement away and SetNulls
    // the receipt's userId. The money row survives, pseudonymised.
    await db.user.delete({ where: { id: userId } });
    const receipt = await db.payment.findUnique({ where: { stripeSessionId: sessionId } });
    expect(receipt, "the receipt outlives the person").not.toBeNull();
    expect(receipt?.userId, "and its link to them is scrubbed").toBeNull();
    expect(
      await db.entitlement.count({ where: { providerRef: sessionId } }),
      "the grant cascaded away",
    ).toBe(0);

    // THIS IS A DIFFERENT FAILURE FROM CAUSE 1 and that is the point of the
    // test. The user is gone, so the transaction dies on the FIRST statement —
    // a foreign-key violation (P2003) on Entitlement_userId_fkey — and never
    // reaches the Payment insert that produces cause 1's P2002. A fix that
    // only caught P2002 would leave this half of the outage open.
    const replay = await store.recordPurchase(purchase(userId, sessionId));
    expect(replay.status).toBe("receipt-without-grant");

    // The erasure stands: no row was recreated for a person who is gone.
    expect(await db.entitlement.count({ where: { providerRef: sessionId } })).toBe(0);
    expect(await db.user.count({ where: { id: userId } })).toBe(0);
    expect(await db.payment.count({ where: { stripeSessionId: sessionId } })).toBe(1);
  });

  it("holds under FIVE SIMULTANEOUS replays of a revoked session", async () => {
    const userId = await makeUser("storm");
    const sessionId = `${SESSION_PREFIX}storm`;

    const entitlementId = createdEntitlementId(
      await store.recordPurchase(purchase(userId, sessionId)),
    );
    await db.entitlement.deleteMany({ where: { id: entitlementId, userId } });

    // Stripe retries overlap in practice — the webhook and /checkout/return
    // race by design, and a retry storm stacks on top. Five at once, on real
    // Postgres, against real constraints.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => store.recordPurchase(purchase(userId, sessionId))),
    );

    expect(results.map((r) => r.status)).toEqual([
      "receipt-without-grant",
      "receipt-without-grant",
      "receipt-without-grant",
      "receipt-without-grant",
      "receipt-without-grant",
    ]);
    expect(
      await db.entitlement.count({ where: { providerRef: sessionId } }),
      "five concurrent replays resurrected nothing",
    ).toBe(0);
    expect(
      await db.payment.count({ where: { stripeSessionId: sessionId } }),
      "and wrote no second receipt",
    ).toBe(1);
  });

  it("still refuses a purchase it can neither grant nor account for", async () => {
    // No User row, no receipt: a session whose metadata names an account that
    // does not exist. Money arrived with nothing to grant and nothing on file
    // to prove it was ever delivered — so this must stay LOUD (rethrow → 500 →
    // Stripe keeps knocking → the event stays in the dead-letter queue), the
    // same answer the webhook already gives a paid session with no metadata.
    // The fix bought a quiet retry storm, not silence about real losses.
    const ghostUser = `${USER_PREFIX}ghost`;
    const sessionId = `${SESSION_PREFIX}ghost`;

    await expect(
      store.recordPurchase(purchase(ghostUser, sessionId)),
    ).rejects.toMatchObject({ code: "P2003" });

    expect(await db.entitlement.count({ where: { providerRef: sessionId } })).toBe(0);
    expect(await db.payment.count({ where: { stripeSessionId: sessionId } })).toBe(0);
  });

  it("still fulfils exactly once when five deliveries race a FIRST purchase", async () => {
    // The bar the money path was already held to — re-run here because this
    // change touches the same catch block. Five simultaneous first-time
    // fulfilments of one session: one grant, one receipt, no exceptions.
    const userId = await makeUser("firstrace");
    const sessionId = `${SESSION_PREFIX}firstrace`;

    const results = await Promise.all(
      Array.from({ length: 5 }, () => store.recordPurchase(purchase(userId, sessionId))),
    );

    const created = results.filter((r) => r.status === "created");
    expect(created, "exactly one delivery won").toHaveLength(1);
    expect(
      results.filter((r) => r.status === "already-fulfilled"),
      "the other four read back the winner",
    ).toHaveLength(4);
    expect(await db.entitlement.count({ where: { providerRef: sessionId } })).toBe(1);
    expect(await db.payment.count({ where: { stripeSessionId: sessionId } })).toBe(1);
  });
});
