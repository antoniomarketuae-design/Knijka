/**
 * THE EXAM ENDS; THE LEDGER MUST END WITH IT (Наредба № 38, чл. 48, ал. 3).
 *
 * Every number in the first block is one the 2026-08-16 catalogue sweep
 * photographed on a real debrief, printed above the catalogue's own sentence
 * saying a collision is ONE опасна грешка worth ten. The second block is the
 * other direction: the closure must not become a general amnesty for repeated
 * опасни, and it must never be able to hand anybody a pass.
 */

import { describe, expect, it } from "vitest";
import { makeCommendation, makeViolation } from "../catalog";
import { accumulateScore, isPassing, ledgerCloseTime } from "../scoring";

const collision = (t: number) => makeViolation("COLLISION", t); // опасна + terminateSession
const redLight = (t: number) => makeViolation("RED_LIGHT_CROSSED", t); // опасна, NOT terminating
const speeding = (t: number) => makeViolation("SPEEDING_OVER_LIMIT", t); // второстепенна, 1 т.
const belt = (t: number) => makeViolation("SEATBELT_OFF_WHILE_MOVING", t); // основна, 3 т.

describe("the sweep's own drives, re-scored", () => {
  it("sc-follow-distance mobile-wrong: one wedged car re-reported 42× is 10, not 420", () => {
    // Embedded at t=57 s, still embedded at t=131 s. Whatever the reporter
    // does, the exam ended at the first contact.
    const events = Array.from({ length: 42 }, (_, i) => collision(57 + i * 1.8));
    const s = accumulateScore(events);
    expect(s.totalPoints).toBe(10); // was 420, on a scale whose allowance is 9
    expect(s.opasniCount).toBe(1); // the protocol table now matches its own row
    expect(s.ledgerClosedAtSec).toBe(57);
    expect(s.unscoredAfterClose).toBe(41); // shown for learning, billed to nobody
  });

  it("…and the SAME lesson re-driven on staging today, which still bills 17", () => {
    // The sweep's 42 was measured before engine.ts's COLLISION_REOPEN_TRAVEL_M
    // shipped; re-driving sc-follow-distance/mobile/wrong through
    // tools/mobile/lesson-audit.mjs on 2026-08-17 gave «Опасни грешки 17 · 170 ·
    // Общо (допустими 9) 17 170» — the travel gate collapsed 42 encounters into
    // 17 and could not collapse them further, because between bumps the car
    // really did move. The remaining 17 are one ENCOUNTER with one lead car and
    // one exam that ended at the first of them, which is the half only this
    // ledger can decide. Same debrief, two paragraphs apart: «само тази грешка
    // спира и самия изпит (Наредба № 38, чл. 48, ал. 3)… оценката отразява
    // прекратяване» — beside 170.
    const s = accumulateScore(Array.from({ length: 17 }, (_, i) => collision(41 + i * 3)));
    expect(s.totalPoints).toBe(10);
    expect(s.unscoredAfterClose).toBe(16);
  });

  it("sc-ov-ban-overtake mobile-RIGHT: three genuinely separated contacts are 10, not 30", () => {
    // This is the case engine.ts's COLLISION_REOPEN_TRAVEL_M cannot reach: the
    // car crawls clear between contacts, so all three episodes are honest — and
    // the exam was still over after the first.
    const s = accumulateScore([collision(24), collision(61), collision(98)]);
    expect(s.totalPoints).toBe(10);
    expect(s.unscoredAfterClose).toBe(2);
  });

  it("sc-ov-narrow: the careful drive stops scoring worse than the reckless one", () => {
    const careful = accumulateScore([collision(31), collision(74)]); // was 20
    const reckless = accumulateScore([collision(12)]); // was 10
    expect(careful.totalPoints).toBe(10);
    expect(reckless.totalPoints).toBe(10);
    expect(careful.totalPoints).toBeLessThanOrEqual(reckless.totalPoints);
  });

  it("sc-ov-crossing-overtake mobile-wrong: 16 ПТП + a pre-crash speeding bill is 11, not 161", () => {
    const events = [
      speeding(19), // earned BEFORE the crash — it must survive
      ...Array.from({ length: 16 }, (_, i) => collision(44 + i * 2.5)),
    ];
    const s = accumulateScore(events);
    expect(s.totalPoints).toBe(11);
    expect(s.vtorostepenniPoints).toBe(1);
    expect(s.opasniPoints).toBe(10);
  });
});

describe("what the closure must NOT do", () => {
  it("does not collapse repeated NON-terminating опасни — two red lights are still 20", () => {
    // чл. 48, ал. 3 ends the exam on ПТП and on повторна намеса, and on nothing
    // else. A candidate who runs two red lights keeps driving and keeps being
    // ticked (n38.ts records the day the product claimed otherwise).
    const s = accumulateScore([redLight(10), redLight(80)]);
    expect(s.totalPoints).toBe(20);
    expect(s.opasniCount).toBe(2);
    expect(s.ledgerClosedAtSec).toBeNull();
    expect(s.unscoredAfterClose).toBe(0);
  });

  it("closing the ledger can never turn a fail into a pass", () => {
    // The closer requires the terminating fault to be опасна, and that fault is
    // APPLIED before the ledger shuts — so hasDangerous is already true at
    // every closed ledger. Asserted over a mistake stream heavy enough that
    // dropping its tail would otherwise land under both caps.
    const s = accumulateScore([collision(5), belt(20), belt(40), belt(60), speeding(80)]);
    expect(s.ledgerClosedAtSec).toBe(5);
    expect(s.hasDangerous).toBe(true);
    expect(isPassing(s)).toBe(false);
    expect(s.totalPoints).toBeGreaterThan(9);
  });

  it("keeps every point earned before the crash, whatever order the array is in", () => {
    // Nothing in the ScorableEvent contract promises chronological order — the
    // live shell folds the session list unsorted. A position-based closure would
    // swallow the belt fault below; a time-based one cannot.
    const s = accumulateScore([collision(50), belt(12), speeding(9)]);
    expect(s.osnovniPoints).toBe(3);
    expect(s.vtorostepenniPoints).toBe(1);
    expect(s.totalPoints).toBe(14);
    expect(s.unscoredAfterClose).toBe(0);
  });

  it("a fault on the collision's own frame still scores — that frame is the exam's last", () => {
    const s = accumulateScore([collision(33), speeding(33)]);
    expect(s.totalPoints).toBe(11);
    expect(s.unscoredAfterClose).toBe(0);
  });

  it("leaves a clean session and a commendation-only session untouched", () => {
    expect(accumulateScore([]).ledgerClosedAtSec).toBeNull();
    const s = accumulateScore([makeCommendation("CLEAN_DRIVING", 30), belt(10)]);
    expect(s.totalPoints).toBe(3);
    expect(s.ledgerClosedAtSec).toBeNull();
    expect(isPassing(s)).toBe(true); // 3 т. основни: a fault, and still inside both caps
    expect(accumulateScore([speeding(4)]).totalPoints).toBe(1);
  });
});

describe("ledgerCloseTime", () => {
  it("is the EARLIEST terminating опасна, not the last seen", () => {
    expect(ledgerCloseTime([collision(90), collision(12), collision(45)])).toBe(12);
  });

  it("is null when no terminating fault is present", () => {
    expect(ledgerCloseTime([redLight(3), belt(9), makeCommendation("SAFE_LANE_CHANGE", 4)])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The tie `t` cannot break, and the legs routed to scoring.ts
// ---------------------------------------------------------------------------

describe("one termination, one bill — the case a time comparison cannot decide", () => {
  it("two contact reports sharing the closing FRAME are 10, not 20", () => {
    // Events emitted on one frame carry one `t` — that is what a frame is — so
    // `t > closeAt` is false for BOTH and the old fold billed the second copy
    // of the very fault that ended the exam: «Опасни грешки 2 · 20», printed
    // under «Това е ЕДНА опасна грешка… а не сбор от много дребни».
    const s = accumulateScore([collision(33), collision(33)]);
    expect(s.totalPoints).toBe(10);
    expect(s.opasniCount).toBe(1); // the table now agrees with its own sentence
    expect(s.unscoredAfterClose).toBe(1); // shown in the list, billed to nobody
  });

  it("…and the tie survives an unsorted array, without swallowing earlier points", () => {
    const s = accumulateScore([collision(50), collision(50), belt(12)]);
    expect(s.totalPoints).toBe(13); // 10 for the one crash + the 3 earned before it
    expect(s.osnovniPoints).toBe(3);
    expect(s.unscoredAfterClose).toBe(1);
  });

  it("does NOT swallow the other faults on that same frame — only the duplicate", () => {
    // The opposite direction, and the reason the fix is not „drop everything at
    // closeAt": a speeding bill and a belt fault on the crash frame happened on
    // the exam's last frame, not after it, and both must still cost.
    const s = accumulateScore([collision(33), speeding(33), belt(33)]);
    expect(s.totalPoints).toBe(14);
    expect(s.vtorostepenniPoints).toBe(1);
    expect(s.osnovniPoints).toBe(3);
    expect(s.unscoredAfterClose).toBe(0);
  });

  it("dropping the duplicate still cannot hand anybody a pass", () => {
    // The copy that is dropped is a copy of a fault ALREADY applied, so the
    // 10 points and `hasDangerous` are on the sheet before the drop happens.
    const s = accumulateScore([collision(20), collision(20)]);
    expect(s.hasDangerous).toBe(true);
    expect(isPassing(s)).toBe(false);
    expect(s.totalPoints).toBeGreaterThan(9);
  });
});

/**
 * THE BROKEN FINDINGS ROUTED TO scoring.ts, RE-SCORED.
 *
 * Each stream below is the mistake list one sweep leg actually printed, in the
 * order it printed it (`.audit-frames/sweep161/<lesson>/<leg>/run.log`, the
 * `MISTAKES (n)` block, which is chronological), spaced one second apart. The
 * `was` figure is the leg's own «N наказателни точки» headline.
 */
type Code = Parameters<typeof makeViolation>[0];

const streamOf = (codes: ReadonlyArray<Code>) => codes.map((c, i) => makeViolation(c, 10 + i));

const PTP: Code = "COLLISION";
const DIST: Code = "FOLLOWING_TOO_CLOSE"; // основна, 3 т.
const FAST: Code = "SPEEDING_DANGEROUS"; // опасна, 10 т., NOT terminating
const SLOW: Code = "SPEEDING_OVER_LIMIT"; // второстепенна, 1 т.
const B2: Code = "STOP_SIGN_NO_FULL_STOP"; // опасна, 10 т., NOT terminating

describe("the sweep legs routed to this file, re-scored", () => {
  const closedByOneCrash: ReadonlyArray<[string, number, ReadonlyArray<Code>]> = [
    // chunk-1 · «180 наказателни точки», 18 identical ПТП rows on one lead car.
    ["sc-ac-highbeam-lead/mobile-wrong", 180, Array.from({ length: 18 }, () => PTP)],
    ["sc-ac-highbeam-lead/pc-wrong", 20, [PTP, PTP]],
    // chunk-1 · «Опасни грешки 2 · 20» printed under «Това е ЕДНА опасна грешка».
    ["sc-ac-snow/pc-wrong", 20, [PTP, PTP]],
    // chunk-10 · «Настъпи сблъсък… ЕДНА опасна грешка» beside two −10 rows.
    ["sc-ln-obstacle-meeting/mobile-right", 20, [PTP, PTP]],
    // chunk-11 · right and wrong both photographed at «20 наказателни точки».
    ["sc-merge-roadworks-shift/pc-right", 20, [PTP, PTP]],
    ["sc-merge-roadworks-shift/pc-wrong", 20, [PTP, FAST]],
    // chunk-4 · the FOLLOWING family — «4 опасни грешки 40» for one narrated crash.
    ["sc-follow-distance/pc-wrong", 55, [PTP, DIST, DIST, PTP, DIST, DIST, PTP, DIST, PTP]],
    ["sc-follow-brake/pc-wrong", 41, [PTP, PTP, PTP, SLOW, PTP]],
    ["sc-follow-rain-gap/pc-wrong", 43, [PTP, DIST, PTP, PTP, PTP]],
    ["sc-follow-truck/pc-wrong", 75, [PTP, PTP, PTP, DIST, DIST, DIST, PTP, DIST, PTP, DIST, PTP]],
    // «8 опасни грешки 80» — six impacts, a tailgating основна, two more impacts.
    ["sc-follow-standstill/pc-wrong", 83, [PTP, PTP, PTP, PTP, PTP, PTP, DIST, PTP, PTP]],
  ];

  it.each(closedByOneCrash)("%s: «%i наказателни точки» is one crash, 10", (_leg, was, codes) => {
    const s = accumulateScore(streamOf(codes));
    expect(was).toBeGreaterThan(10); // the headline the sweep photographed
    expect(s.totalPoints).toBe(10);
    expect(s.opasniCount).toBe(1);
    expect(s.ledgerClosedAtSec).toBe(10); // every one of these opened on the crash
    expect(s.unscoredAfterClose).toBe(codes.length - 1);
    expect(isPassing(s)).toBe(false); // and none of them becomes a pass
  });

  it("sc-follow-standstill: the основна AFTER the crash is taught, not billed", () => {
    // 83 → 10 drops a genuine «Несъобразена дистанция». That is the intended
    // reading of чл. 48, ал. 3 and not a leak: the exam was over six impacts
    // earlier, and the card stays in the list for the student to read.
    const s = accumulateScore(streamOf([PTP, PTP, PTP, PTP, PTP, PTP, DIST, PTP, PTP]));
    expect(s.osnovniPoints).toBe(0);
    expect(s.unscoredAfterClose).toBe(8);
  });

  it("sc-ed-d2-priority-run/pc-wrong: «87» becomes 47 — five ПТП collapse, six earlier faults stand", () => {
    // chunk-3 · „One collision should be one row." It is now. The remaining 37
    // are six DIFFERENT faults committed before the crash, and charging them is
    // the whole point of the sheet.
    const s = accumulateScore(
      streamOf([
        B2,
        "JUNCTION_SCAN_INCOMPLETE",
        "WRONG_WAY",
        FAST,
        "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
        SLOW,
        PTP,
        PTP,
        PTP,
        PTP,
        PTP,
      ]),
    );
    expect(s.totalPoints).toBe(47);
    expect(s.opasniCount).toBe(4); // Б2, обратна посока, +10 км/ч, и ЕДНО ПТП
    expect(s.unscoredAfterClose).toBe(4);
  });

  it("sc-merge-from-property/pc-wrong: «280» becomes 71, and the rest is NOT this ledger's to take", () => {
    // chunk-11 · the crash is row 7 of 37, so twenty-nine rows fall away with
    // it — but the 61 points before it are re-billings of one Б2 sign and one
    // overspeed, which only the engine's episode gate can collapse. Pinned at
    // 71 so that residual stays visible instead of being quietly capped here.
    const codes: Code[] = [
      FAST,
      "PEDESTRIAN_CROSSING_TOO_FAST",
      "PEDESTRIAN_NOT_YIELDED",
      SLOW,
      "PEDESTRIAN_CROSSING_TOO_FAST",
      B2,
      "FAILED_TO_YIELD",
      PTP,
    ];
    for (let i = 0; i < 29; i += 1) codes.push([FAST, SLOW, B2][i % 3]);
    const s = accumulateScore(streamOf(codes));
    expect(s.totalPoints).toBe(71);
    expect(s.unscoredAfterClose).toBe(29);
  });

  it("sc-ed-reverse-line/pc-wrong: «100» stays 100 — no crash, nothing for this ledger to close", () => {
    // chunk-3 · ten identical «Превишаване с повече от 10 км/ч» rows. The fault
    // is real and non-terminating, so чл. 48, ал. 3 never fires; collapsing it
    // HERE would also collapse two genuine red lights and, applied to the light
    // classes, would turn a 10-point fail into a 7-point pass. It belongs to the
    // engine's speeding episode gate, and this pin is what keeps it from being
    // hidden by a cap on the total.
    const s = accumulateScore(streamOf(Array.from({ length: 10 }, () => FAST)));
    expect(s.totalPoints).toBe(100);
    expect(s.ledgerClosedAtSec).toBeNull();
    expect(s.unscoredAfterClose).toBe(0);
  });
});
