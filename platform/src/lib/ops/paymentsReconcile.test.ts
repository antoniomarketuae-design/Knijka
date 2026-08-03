/**
 * `npm run payments:reconcile` — the only tool that can find a sale ALREADY
 * lost.
 *
 * Every other fix in the money path prevents a future loss. None of them can
 * surface a purchase that already fell through: those students are invisible
 * in our database by definition, because the missing write IS the bug. The
 * only way to find them is to ask Stripe what it charged and subtract what we
 * granted.
 *
 * Which makes the direction of that subtraction the whole tool. Backwards, it
 * reports a healthy system as broken — and a reconciliation tool that cries
 * wolf once is a tool nobody runs on the day it would have mattered. Hence
 * these tests, and hence the pure core they exercise.
 */

import { describe, expect, it } from "vitest";
import {
  buildReport,
  classifySessions,
  DEFAULT_DAYS,
  formatAmount,
  formatOrphanLine,
  isPaid,
  MAX_DAYS,
  parseDays,
} from "../../../scripts/payments-reconcile-core.mjs";

/** A Stripe Checkout Session, trimmed to the fields the tool reads. */
function session(over: Record<string, unknown> = {}) {
  return {
    id: "cs_test_1",
    payment_status: "paid",
    amount_total: 1299,
    currency: "eur",
    created: 1_782_000_000,
    livemode: true,
    metadata: { userId: "user-1", pack: "core" },
    customer_details: { email: "ivan@mail.bg" },
    ...over,
  };
}

describe("parseDays", () => {
  it("defaults to a month", () => {
    expect(parseDays([])).toEqual({ ok: true, days: DEFAULT_DAYS });
  });

  it("reads --days", () => {
    expect(parseDays(["--days", "7"])).toEqual({ ok: true, days: 7 });
  });

  it("clamps a fat-fingered window instead of walking all of Stripe", () => {
    expect(parseDays(["--days", "100000"])).toEqual({ ok: true, days: MAX_DAYS });
  });

  it("refuses nonsense rather than silently reconciling the wrong window", () => {
    // Silently defaulting here is the dangerous option: the operator would
    // read "no orphans" for a window they never asked about.
    expect(parseDays(["--days", "abc"]).ok).toBe(false);
    expect(parseDays(["--days", "-3"]).ok).toBe(false);
    expect(parseDays(["--days", "0"]).ok).toBe(false);
    expect(parseDays(["--days"]).ok).toBe(false);
  });
});

describe("isPaid", () => {
  it("counts only sessions Stripe says were paid", () => {
    expect(isPaid(session())).toBe(true);
    expect(isPaid(session({ payment_status: "unpaid" }))).toBe(false);
    // A 100%-promo session owes nobody anything and must not be chased.
    expect(isPaid(session({ payment_status: "no_payment_required" }))).toBe(false);
    expect(isPaid(undefined)).toBe(false);
  });
});

describe("classifySessions — the set difference the tool exists for", () => {
  it("finds the charged-but-never-granted session", () => {
    const paid = [session({ id: "cs_ok" }), session({ id: "cs_lost" })];
    const { orphans } = classifySessions(paid, ["cs_ok"], ["cs_ok"]);

    expect(orphans.map((o) => o.id)).toEqual(["cs_lost"]);
  });

  it("reports NOTHING when every paid session was granted", () => {
    const paid = [session({ id: "cs_a" }), session({ id: "cs_b" })];
    const result = classifySessions(paid, ["cs_a", "cs_b"], ["cs_a", "cs_b"]);

    expect(result.orphans).toEqual([]);
    expect(result.missingReceipts).toEqual([]);
    expect(buildReport(result, 30)).toBe("");
  });

  it("does NOT call a granted session an orphan just because the receipt is missing", () => {
    // Fulfilled before the Payment ledger existed. The student has access and
    // nothing is owed to her — folding this into the orphan count would pad
    // the one number that is supposed to mean "someone was charged and got
    // nothing".
    const paid = [session({ id: "cs_old" })];
    const result = classifySessions(paid, ["cs_old"], []);

    expect(result.orphans).toEqual([]);
    expect(result.missingReceipts.map((s) => s.id)).toEqual(["cs_old"]);
  });

  it("accepts Sets as well as arrays (the script passes Sets)", () => {
    const paid = [session({ id: "cs_lost" })];
    const result = classifySessions(paid, new Set<string>(), new Set<string>());
    expect(result.orphans).toHaveLength(1);
  });

  it("treats an empty database as ALL orphans, never as all clean", () => {
    // The direction that matters. Reversed, a wiped Entitlement table would
    // report a perfect reconciliation.
    const paid = [session({ id: "cs_1" }), session({ id: "cs_2" })];
    expect(classifySessions(paid, [], []).orphans).toHaveLength(2);
  });
});

describe("the report a human reads", () => {
  it("is empty when clean — silence is the pass", () => {
    expect(buildReport({ orphans: [], missingReceipts: [] }, 30)).toBe("");
  });

  it("names the amount, the buyer and the MODE of each orphan", () => {
    const line = formatOrphanLine(session({ id: "cs_lost" }));
    expect(line).toContain("cs_lost");
    expect(line).toContain("12,99 €");
    expect(line).toContain("user=user-1");
    expect(line).toContain("ivan@mail.bg");
    expect(line).toContain("LIVE"); // a test-mode orphan means something else
    expect(line).toContain("pack=core");
  });

  it("survives a session with no metadata — which is exactly how sales get lost", () => {
    const line = formatOrphanLine(
      session({ id: "cs_bare", metadata: undefined, customer_details: undefined }),
    );
    expect(line).toContain("cs_bare");
    expect(line).toContain("(no userId in metadata)");
    expect(line).toContain("(no e-mail)");
  });

  it("marks a test-mode orphan as test, so nobody chases play money", () => {
    expect(formatOrphanLine(session({ livemode: false }))).toContain("test");
  });

  it("leads with the count and the window", () => {
    const report = buildReport(
      { orphans: [session({ id: "cs_lost" })], missingReceipts: [] },
      14,
    );
    expect(report).toContain("1 PAID SESSION(S) WITH NO ACCESS GRANTED — last 14 days");
    expect(report).toContain("charged and got nothing");
  });

  it("refuses to decide for the operator", () => {
    // Auto-granting would hand out access on a session we could not parse;
    // auto-refunding would cancel a sale that merely raced. Both are wrong
    // often enough that the tool must not pick.
    const report = buildReport(
      { orphans: [session({ id: "cs_lost" })], missingReceipts: [] },
      30,
    );
    expect(report).toContain("This tool does neither on its own");
  });
});

describe("formatAmount", () => {
  it("renders euros the way a Bulgarian buyer reads them", () => {
    expect(formatAmount(1299, "eur")).toBe("12,99 €");
    expect(formatAmount(2199, "EUR")).toBe("21,99 €");
  });

  it("falls back to the code for anything else, and never crashes on absent data", () => {
    expect(formatAmount(1000, "usd")).toBe("10,00 USD");
    expect(formatAmount(undefined, undefined)).toBe("0,00 €");
  });
});
