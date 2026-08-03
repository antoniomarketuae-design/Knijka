/**
 * The per-pack tutor allowance (doc 81 §5.3) — the one gate in this module
 * that limits a PAYING user.
 *
 * The defect it replaces: `checkTutorQuota` returned `unlimited: true` the
 * moment `hasCore` was true, so a €12.99 pack bought 30 questions/day for ~122
 * days = 3,660 questions ≈ $41.72 (up to $111) of model spend against €12.55
 * of net revenue — and since the only hard backstop was the GLOBAL daily
 * ceiling, the one student who did that browned the tutor out for everyone
 * else who had paid. Every test below fails against that behaviour.
 *
 * The counter-property matters just as much: this rule must have nothing to
 * say about free accounts (they are the lifetime trial's business) and must
 * not block a paying student when the database coughs.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkTutorPackAllowance,
  TUTOR_PACK_QUESTION_ALLOWANCE,
} from "../quota";
import { InMemoryPaymentsStore, setPaymentsStore } from "../store";

const NOW = new Date("2026-07-07T12:00:00.000Z");
const PURCHASED = new Date("2026-06-01T00:00:00.000Z");
const EXPIRES = new Date("2026-10-01T00:00:00.000Z");
const USER = "user-1";

let store: InMemoryPaymentsStore;

function freshStore(): InMemoryPaymentsStore {
  store = new InMemoryPaymentsStore();
  setPaymentsStore(store);
  return store;
}

async function grant(
  pack: "core" | "premium_sim",
  purchasedAt: Date = PURCHASED,
  expiresAt: Date | null = EXPIRES,
): Promise<void> {
  await store.createEntitlement({
    userId: USER,
    pack,
    purchasedAt,
    expiresAt,
    provider: "stripe",
    providerRef: `cs_test_${pack}_${purchasedAt.toISOString()}`,
  });
}

/** `count` questions asked at `at`, as the thread would have recorded them. */
function asked(at: Date, count: number): number[] {
  return Array.from({ length: count }, () => at.getTime());
}

afterEach(() => setPaymentsStore(null));

describe("checkTutorPackAllowance — a free account", () => {
  it("is not this rule's business at all", async () => {
    freshStore();
    const allowance = await checkTutorPackAllowance(USER, [], NOW);
    expect(allowance).toEqual({
      applies: false,
      allowed: true,
      used: 0,
      remaining: Number.POSITIVE_INFINITY,
      limit: TUTOR_PACK_QUESTION_ALLOWANCE,
      since: null,
    });
  });

  it("says `applies: false` however many questions it has asked", async () => {
    // `allowed: true` here is „I am not the rule limiting you" — the lifetime
    // free trial (checkTutorQuota) is, and it stops this account at 5.
    freshStore();
    const allowance = await checkTutorPackAllowance(
      USER,
      asked(NOW, 9_000),
      NOW,
    );
    expect(allowance.applies).toBe(false);
    expect(allowance.allowed).toBe(true);
  });

  it("is not opened by an EXPIRED pack", async () => {
    freshStore();
    await grant("core", PURCHASED, new Date("2026-05-01T00:00:00.000Z"));
    expect((await checkTutorPackAllowance(USER, [], NOW)).applies).toBe(false);
  });
});

describe("checkTutorPackAllowance — an active pack", () => {
  it("grants exactly TUTOR_PACK_QUESTION_ALLOWANCE questions", async () => {
    freshStore();
    await grant("core");
    const allowance = await checkTutorPackAllowance(USER, [], NOW);
    expect(allowance).toEqual({
      applies: true,
      allowed: true,
      used: 0,
      remaining: TUTOR_PACK_QUESTION_ALLOWANCE,
      limit: TUTOR_PACK_QUESTION_ALLOWANCE,
      since: PURCHASED,
    });
  });

  it("decrements one per question asked", async () => {
    freshStore();
    await grant("core");
    const allowance = await checkTutorPackAllowance(USER, asked(NOW, 47), NOW);
    expect(allowance.used).toBe(47);
    expect(allowance.remaining).toBe(TUTOR_PACK_QUESTION_ALLOWANCE - 47);
    expect(allowance.allowed).toBe(true);
  });

  it("blocks at the limit and never reports negative remaining", async () => {
    freshStore();
    await grant("core");

    const last = await checkTutorPackAllowance(
      USER,
      asked(NOW, TUTOR_PACK_QUESTION_ALLOWANCE - 1),
      NOW,
    );
    expect(last).toMatchObject({ allowed: true, remaining: 1 });

    const spent = await checkTutorPackAllowance(
      USER,
      asked(NOW, TUTOR_PACK_QUESTION_ALLOWANCE),
      NOW,
    );
    expect(spent).toMatchObject({ allowed: false, remaining: 0 });

    const overspent = await checkTutorPackAllowance(
      USER,
      asked(NOW, TUTOR_PACK_QUESTION_ALLOWANCE + 40),
      NOW,
    );
    expect(overspent).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("does NOT reset the next day — it is a pack allowance, not a daily one", async () => {
    // This is the whole point. The 30/day cap already resets; if this one did
    // too, the four-month tail would be back at 3,660 questions.
    freshStore();
    await grant("core");
    const nextDay = new Date("2026-07-08T12:00:00.000Z");
    const allowance = await checkTutorPackAllowance(
      USER,
      asked(NOW, TUTOR_PACK_QUESTION_ALLOWANCE),
      nextDay,
    );
    expect(allowance.allowed).toBe(false);
  });

  it("does not charge the pack for questions asked before it was bought", async () => {
    // The free trial happened first. The student paid to stop being metered,
    // not to have their trial retro-billed against the pack.
    freshStore();
    await grant("core");
    const duringTrial = new Date("2026-05-20T09:00:00.000Z");
    const allowance = await checkTutorPackAllowance(
      USER,
      [...asked(duringTrial, 5), ...asked(NOW, 3)],
      NOW,
    );
    expect(allowance.used).toBe(3);
  });

  it("does not leak across users", async () => {
    freshStore();
    await grant("core");
    // The timestamps are per-user by construction (they come from that user's
    // own thread), so the property under test is the entitlement lookup.
    const other = await checkTutorPackAllowance("someone-else", [], NOW);
    expect(other.applies).toBe(false);
  });
});

describe("checkTutorPackAllowance — more than one active pack", () => {
  it("an upgrade while core is still running buys a SECOND allowance", async () => {
    freshStore();
    await grant("core");
    await grant("premium_sim", new Date("2026-06-20T00:00:00.000Z"));

    const allowance = await checkTutorPackAllowance(USER, [], NOW);
    expect(allowance.limit).toBe(TUTOR_PACK_QUESTION_ALLOWANCE * 2);
    // Counted from the EARLIEST active purchase, so the upgrade cannot be used
    // to wipe the questions already asked against the first pack.
    expect(allowance.since).toEqual(PURCHASED);
  });

  it("counts DISTINCT PACKS, not rows — two rows for one pack buy ONE allowance", async () => {
    // The code multiplied by `active.length`, i.e. the ROW count, while the
    // comment above it said "upgrading core → premium buys a second 300".
    // Those agree only while no session is ever fulfilled twice — and until
    // the (provider, providerRef) unique constraint landed, double fulfilment
    // was the ordinary race between the webhook and /checkout/return.
    //
    // So the duplicate row the old checkout.ts header called "cosmetic" and
    // "no security issue" silently DOUBLED the model spend a EUR 12.99 pack
    // buys. This is the assertion that turns that comment into a lie.
    freshStore();
    await grant("core");
    await grant("core", new Date("2026-06-10T00:00:00.000Z"));

    const allowance = await checkTutorPackAllowance(USER, [], NOW);
    expect(allowance.limit).toBe(TUTOR_PACK_QUESTION_ALLOWANCE);
    expect(allowance.remaining).toBe(TUTOR_PACK_QUESTION_ALLOWANCE);
  });

  it("still blocks at ONE allowance when the same pack was recorded twice", async () => {
    freshStore();
    await grant("core");
    await grant("core", new Date("2026-06-10T00:00:00.000Z"));

    const spent = await checkTutorPackAllowance(
      USER,
      asked(NOW, TUTOR_PACK_QUESTION_ALLOWANCE),
      NOW,
    );
    expect(spent.allowed).toBe(false);
    expect(spent.remaining).toBe(0);
  });

  it("a renewal after expiry starts a fresh allowance", async () => {
    freshStore();
    const lapsed = new Date("2026-01-01T00:00:00.000Z");
    await grant("core", lapsed, new Date("2026-05-01T00:00:00.000Z"));
    await grant("core", new Date("2026-06-15T00:00:00.000Z"));

    // 300 asked under the lapsed pack, none under the new one.
    const allowance = await checkTutorPackAllowance(
      USER,
      asked(new Date("2026-03-01T00:00:00.000Z"), TUTOR_PACK_QUESTION_ALLOWANCE),
      NOW,
    );
    expect(allowance.limit).toBe(TUTOR_PACK_QUESTION_ALLOWANCE);
    expect(allowance.used).toBe(0);
    expect(allowance.allowed).toBe(true);
  });
});

describe("checkTutorPackAllowance — failure behaviour", () => {
  it("fails OPEN when the entitlement store cannot be read", async () => {
    // Opposite direction from every other gate in this module, on purpose: it
    // limits people who have ALREADY paid, so a database hiccup must not take
    // the tutor away from them. The global daily ceiling still bounds the bill.
    freshStore();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(store, "listEntitlements").mockRejectedValue(
      new Error("ECONNREFUSED"),
    );

    const allowance = await checkTutorPackAllowance(
      USER,
      asked(NOW, TUTOR_PACK_QUESTION_ALLOWANCE + 100),
      NOW,
    );
    expect(allowance.applies).toBe(false);
    expect(allowance.allowed).toBe(true);
    vi.restoreAllMocks();
  });
});
