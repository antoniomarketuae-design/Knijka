/**
 * affordability.test.mjs — whether the steering loop may run, and whether that
 * verdict is allowed to stand for the rest of the drive.
 *
 * WHY THIS FILE EXISTS. After sweep w29: 50 of 127 open audit rows came back
 * UNJUDGED, and among the 49 remaining CRITICAL rows it was 27 UNJUDGED against
 * 21 STILL. More than half the critical work left had no evidence — not because
 * the repair was hard, but because the car drove straight past the thing the
 * finding was about. The judges kept quoting the same log line: «0 trace
 * commands — THIS DRIVE DID NOT STEER».
 *
 * The refusal that produced those drives is CORRECT and is not being removed. A
 * screenshot costs ~360-790 ms on the mobile leg and was measured at 11,999 ms on
 * the pc leg; a loop correcting once every twelve seconds is a straight line with
 * flinches, and driving straight WHILE SAYING SO beats steering badly and looking
 * steered. What was wrong was how the verdict was reached and how long it stood.
 *
 * The decision used to live inline in a 7,800-line driver, where no test could
 * reach it — which is why it was wrong for months with nothing to catch it. It is
 * now `costVerdict` / `refusalExpired` in lib/guidance.mjs, and this file is the
 * seam being paid for.
 *
 * EVERY ASSERTION HERE HAS BEEN WATCHED TO FAIL, and the mutation that breaks it
 * is named beside it — the local rule from guidance.test.mjs, which has caught
 * three instrument bugs already. An assertion nobody has seen go red is a
 * decoration.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COST, costVerdict, refusalExpired } from "../lib/guidance.mjs";

/** `n` scans that each cost `ms`. */
const flat = (n, ms) => Array.from({ length: n }, () => ms);

describe("costVerdict — the warm-up is recorded and then thrown away", () => {
  it("returns null until warm-up AND sample scans exist", () => {
    // MUTATION WATCHED: `slice(warmupScans)` -> `slice(0)`. Then 5 startup scans
    // are enough to decide the whole drive, which is the original bug.
    assert.equal(costVerdict(flat(COST.warmupScans + COST.sample - 1, 100)), null);
    assert.notEqual(costVerdict(flat(COST.warmupScans + COST.sample, 100)), null);
  });

  it("THE BUG: the startup herd cannot reach a verdict at all", () => {
    // The thundering herd at t=0 — every shard launching, each WebKit compiling
    // its first route, one 7200 rpm disk serving all of them. Under the shipped
    // code these five scans WERE the decision, and the drive went straight for
    // the next several minutes.
    //
    // This is the honest way to pin the warm-up, and the first draft of this test
    // was NOT it. That draft fed 3 startup scans plus 5 fast ones and asserted
    // `affordable`, which passes even with the warm-up slice deleted, because
    // `slice(-sample)` picks the five fast ones anyway. It was a decoration with
    // an alarming name. What the warm-up actually buys is that NO verdict is
    // reached while the herd is still the only evidence.
    const herd = flat(COST.sample, 12_000);
    assert.equal(costVerdict(herd), null, "five startup scans must not decide a drive");

    // …and once the box settles, the verdict that does arrive is the settled one.
    const settled = [...herd, ...flat(COST.sample, 400)];
    const v = costVerdict(settled);
    assert.equal(v.medianMs, 400);
    assert.equal(v.affordable, true);
    // MUTATION WATCHED: `slice(warmupScans)` -> `slice(0)` makes the first
    // assertion read `{ medianMs: 12000, affordable: false }` — exactly the
    // drives that produced the 27 unjudged criticals.
  });

  it("a genuinely unaffordable leg is still refused", () => {
    // The 11,999 ms pc-leg screenshot, sustained past the warm-up. The refusal
    // exists for this and must survive the fix.
    const v = costVerdict([...flat(COST.warmupScans, 11_999), ...flat(COST.sample, 11_999)]);
    assert.equal(v.affordable, false);
    // MUTATION WATCHED: `medianMs <= budgetMs` -> `< Infinity`. Then the loop
    // steers at one correction per twelve seconds and reports itself as steering,
    // which is the failure the refusal was built to prevent.
  });

  it("judges the MOST RECENT window, not the whole drive", () => {
    // A drive that was unaffordable for a long stretch and has since recovered
    // must be able to say so, or a re-measurement is dragged back forever by the
    // samples that produced the refusal.
    const scans = [...flat(COST.warmupScans, 100), ...flat(40, 9_000), ...flat(COST.sample, 300)];
    assert.equal(costVerdict(scans).affordable, true);
    // MUTATION WATCHED: `window.slice(-sample)` -> `window`. The median of 45
    // samples is then 9000 and the loop can never come back.
  });

  it("the median tolerates one spike inside the window", () => {
    // A median and not a mean, on purpose: one 12 s hitch among four fast scans
    // is contention passing through, not a lane the loop cannot afford.
    const scans = [...flat(COST.warmupScans, 100), 300, 300, 12_000, 300, 300];
    const v = costVerdict(scans);
    assert.equal(v.medianMs, 300);
    assert.equal(v.affordable, true);
    // MUTATION WATCHED: median -> mean gives 2640 ms and refuses. The old code
    // took a median too; this pins it so nobody "simplifies" it later.
  });

  it("the boundary is inclusive — exactly the budget is affordable", () => {
    const v = costVerdict([...flat(COST.warmupScans, 0), ...flat(COST.sample, COST.budgetMs)]);
    assert.equal(v.affordable, true);
    // MUTATION WATCHED: `<=` -> `<`. A lane sitting exactly on the budget would
    // flap between refusing and recovering every recheck window.
  });
});

describe("refusalExpired — a measurement of the box, not of the lane", () => {
  it("holds the refusal inside the recheck window", () => {
    const t = 1_000_000;
    assert.equal(refusalExpired(t, t + COST.recheckEverySec * 1000 - 1), false);
    // MUTATION WATCHED: `>=` -> `>= 0`. The loop then re-measures every tick and
    // spends the very budget the refusal exists to protect.
  });

  it("THE OTHER BUG: the refusal expires instead of standing forever", () => {
    const t = 1_000_000;
    assert.equal(refusalExpired(t, t + COST.recheckEverySec * 1000), true);
    assert.equal(refusalExpired(t, t + 60_000), true);
    // MUTATION WATCHED: `return false`. That is the shipped behaviour this file
    // was written to end — nothing anywhere cleared `unaffordable`, so a box that
    // freed up ten seconds in still drove straight for the remaining minutes.
  });

  it("a refusal with no timestamp re-measures rather than persisting", () => {
    // Only asked while already refusing. A refusal carrying no decision time is
    // a bug in the caller, and the safe direction for a bug is to spend one scan
    // finding out — not to silently disable steering for the whole drive.
    assert.equal(refusalExpired(null, 5), true);
    assert.equal(refusalExpired(undefined, 5), true);
    // MUTATION WATCHED: `return false` for null. A single missed assignment then
    // reproduces the original permanent refusal with no log line to find it by.
  });
});

describe("the constants still mean what the caller thinks they mean", () => {
  it("sample is odd, so the median is a real sample", () => {
    assert.equal(COST.sample % 2, 1);
  });
  it("the budget is the one the refusal was reasoned about", () => {
    // 1500 ms is the number the driver's own header argues for. If someone moves
    // it, they should have to come here and say why.
    assert.equal(COST.budgetMs, 1500);
  });
  it("a recheck is rare enough to be affordable itself", () => {
    // At the pc leg's 11,999 ms worst case, a 20 s window spends at most ~60% of
    // one window on a probe — and only while refusing, when nothing else is
    // being spent. Any tighter and the probe becomes the cost.
    assert.ok(COST.recheckEverySec >= 10);
  });
});
