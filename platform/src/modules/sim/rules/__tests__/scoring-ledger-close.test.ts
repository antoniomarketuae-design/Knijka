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
import { accumulateScore, isPassing, ledgerBilling, ledgerCloseTime } from "../scoring";
import type { ViolationEvent } from "../types";

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

  it("sc-ov-crossing-overtake mobile-wrong: «161» is 10 — the speeding row came AFTER", () => {
    // TRANSCRIPTION CORRECTED 2026-08-18. This case was written with the
    // speeding bill FIRST and pinned at 11. The leg's own list
    // (`sc-ov-crossing-overtake/mobile-wrong/log.txt`, `MISTAKES (17)`, which is
    // chronological) is sixteen ПТП rows and THEN «Превишена скорост −1» — so
    // the second-order fault is on the far side of the closure and the leg
    // scores 10, not 11. The old number was right about a stream nobody drove.
    const s = accumulateScore([
      ...Array.from({ length: 16 }, (_, i) => collision(44 + i * 2.5)),
      speeding(91),
    ]);
    expect(s.totalPoints).toBe(10);
    expect(s.opasniPoints).toBe(10);
    expect(s.vtorostepenniPoints).toBe(0); // taught, not billed — the exam ended at 44
    expect(s.unscoredAfterClose).toBe(16);
  });

  it("…and the same seventeen rows the other way round DO cost 11", () => {
    // The mirror, and the reason the correction above is not a loosening: move
    // the same second-order fault BEFORE the first contact and it is billed.
    // The fold reads `t`, not „is there a crash in this array".
    const s = accumulateScore([
      speeding(19),
      ...Array.from({ length: 16 }, (_, i) => collision(44 + i * 2.5)),
    ]);
    expect(s.totalPoints).toBe(11);
    expect(s.vtorostepenniPoints).toBe(1);
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

/**
 * THE SECOND WAVE OF BROKEN FINDINGS ROUTED HERE (2026-08-18).
 *
 * Same construction as the block above — each stream is one leg's own
 * `MISTAKES (n)` list in the order it printed — and every leg below was named
 * by a finding that the block above did not reach. Nine of them are the junction
 * family, which the earlier `run.log`-only corpus could not see at all: those
 * legs write `drive.log` or `log.txt` (see the scoring.ts header).
 */
const YIELD: Code = "FAILED_TO_YIELD"; // опасна, 10 т., NOT terminating
const GAP: Code = "STANDSTILL_GAP_TOO_CLOSE"; // второстепенна, 1 т.

describe("the junction family, and the legs the first wave did not reach", () => {
  it("sc-ov-ban-overtake/mobile-wrong: «640» — sixty-four contact reports are one exam, 10", () => {
    // The largest headline the sweep photographed, in the biggest type on the
    // page, directly above the card's own «Това е ЕДНА опасна грешка… а не сбор
    // от много дребни». The finding's word for it was „unbounded": 64 rows, all
    // ПТП, nothing else on the sheet. The mobile-RIGHT leg of the same lesson
    // (three separated contacts, «30») is pinned further up; this is the leg the
    // finding actually quoted.
    const s = accumulateScore(streamOf(Array.from({ length: 64 }, () => PTP)));
    expect(s.totalPoints).toBe(10);
    expect(s.opasniCount).toBe(1);
    expect(s.unscoredAfterClose).toBe(63);
    expect(isPassing(s)).toBe(false);
  });

  // sc-junction-stop/pc-wrong, all 50 rows in order. Verified against the frame
  // `.audit-frames/sweep161/sc-junction-stop/pc-wrong/08-debrief.png`, whose
  // table reads «Опасни 38 · 380 | Основни 1 · 3 | Второстепенни 11 · 11 | Общо
  // (допустими 9) 50 · 394» — this array reproduces all four rows exactly.
  const junctionStopPcWrong: ReadonlyArray<Code> = [
    FAST, B2, YIELD, SLOW, FAST, B2, YIELD, FAST, B2, SLOW, FAST, B2, YIELD, SLOW, FAST,
    PTP, // ← row 16: the exam ends here
    B2, PTP, FAST, B2, SLOW, FAST, B2, YIELD, SLOW, FAST, B2, DIST, PTP, FAST, B2, SLOW,
    FAST, B2, YIELD, SLOW, FAST, B2, YIELD, SLOW, FAST, B2, SLOW, FAST, B2, YIELD, SLOW,
    FAST, PTP, GAP,
  ];

  it("sc-junction-stop/pc-wrong: «394» becomes 133, and the 123 that remain are NOT this ledger's", () => {
    // The critical finding: «Това е ЕДНА опасна грешка… а не сбор от много
    // дребни» printed directly above «Опасни грешки 38 · 380». Four of those 38
    // were ПТП and three fall away with the closure. The other 34 that survive
    // are FAST ×5, Б2 ×4 and YIELD ×3 before the crash — THREE conditions
    // re-reported per sample, plus SLOW ×3 — and collapsing them here is the
    // move the header forbids, because the same collapse applied to второстепенни
    // turns a 10-point fail into a 7-point pass. Pinned at 133 so the residue
    // stays legible to the engine's episode gate instead of being capped away.
    const s = accumulateScore(streamOf(junctionStopPcWrong));
    expect(junctionStopPcWrong).toHaveLength(50); // the frame's «Общо … 50»
    expect(s.totalPoints).toBe(133);
    expect(s.opasniCount).toBe(13); // was 38 — one ПТП now, not four
    expect(s.vtorostepenniCount).toBe(3);
    expect(s.osnovniCount).toBe(0); // the «Несъобразена дистанция» is row 28, after the crash
    expect(s.ledgerClosedAtSec).toBe(10 + 15); // streamOf: t = 10 + index
    expect(s.unscoredAfterClose).toBe(34);
  });

  it("…and its three sibling legs do NOT move, because none of them re-billed a crash", () => {
    // The opposite direction on the same lesson, and the reason 394 → 133 is not
    // an amnesty. pc-right is a give-way failure and THEN a crash: two faults,
    // 20 points, and the ledger must not touch it. mobile-wrong is four
    // DIFFERENT опасни with the crash last — the most a single leg can honestly
    // carry — and stays 40.
    const right = accumulateScore(streamOf([YIELD, PTP]));
    expect(right.totalPoints).toBe(20); // «20 наказателни точки», unchanged
    expect(right.opasniCount).toBe(2);
    expect(right.unscoredAfterClose).toBe(0);

    const wrong = accumulateScore(streamOf([FAST, B2, YIELD, PTP]));
    expect(wrong.totalPoints).toBe(40); // «40», unchanged
    expect(wrong.opasniCount).toBe(4);
    expect(wrong.unscoredAfterClose).toBe(0);

    const one = accumulateScore(streamOf([PTP]));
    expect(one.totalPoints).toBe(10); // «10», unchanged
    expect(one.unscoredAfterClose).toBe(0);
  });

  const oneCrashLegs: ReadonlyArray<[string, number, ReadonlyArray<Code>]> = [
    // chunk-1 · the careful drive graded three times as badly as the reckless
    // one on the same lesson: mobile-RIGHT «30» against pc-wrong «20».
    ["sc-ac-highbeam-lead/mobile-right", 30, [PTP, PTP, PTP]],
    // chunk-1 · the second сняг leg; the finding named both.
    ["sc-ac-snow/mobile-wrong", 20, [PTP, PTP]],
    // chunk-11 · the finding was „all four legs identical"; the first wave pinned
    // the two pc legs, these are the two mobile ones.
    ["sc-merge-roadworks-shift/mobile-right", 20, [PTP, PTP]],
    ["sc-merge-roadworks-shift/mobile-wrong", 20, [PTP, PTP]],
    // chunk-4 · the same inversion again, wider: the RIGHT drive «71», the WRONG
    // drive «20». Both are one truck met once.
    ["sc-follow-truck/mobile-right", 71, [PTP, PTP, PTP, PTP, GAP, PTP, PTP, PTP]],
    ["sc-follow-truck/mobile-wrong", 20, [PTP, PTP]],
  ];

  it.each(oneCrashLegs)("%s: «%i наказателни точки» is one crash, 10", (_leg, was, codes) => {
    const s = accumulateScore(streamOf(codes));
    expect(was).toBeGreaterThan(10);
    expect(s.totalPoints).toBe(10);
    expect(s.opasniCount).toBe(1);
    expect(s.ledgerClosedAtSec).toBe(10); // all six opened on the crash
    expect(s.unscoredAfterClose).toBe(codes.length - 1);
    expect(isPassing(s)).toBe(false);
  });

  it("the careful drive can no longer score worse than the reckless one", () => {
    // What both inversions above cost a student, stated as the invariant they
    // broke. sc-follow-truck: «71» for the scripted RIGHT drive against «20» for
    // the WRONG one. A learner reading that sheet is taught that care is
    // expensive, which is the exact opposite of the lesson.
    const careful = accumulateScore(streamOf([PTP, PTP, PTP, PTP, GAP, PTP, PTP, PTP]));
    const reckless = accumulateScore(streamOf([PTP, PTP]));
    expect(careful.totalPoints).toBeLessThanOrEqual(reckless.totalPoints);
    expect(careful.totalPoints).toBe(10);
  });

  it("sc-ln-obstacle-meeting/pc-right: «11» becomes 10 — and the dropped точка is real", () => {
    // The smallest leg in the set, and the clearest statement of what the
    // closure costs: a genuine «Твърде малка дистанция при спиране в колона»
    // committed AFTER the crash stops being billed. It keeps its card in the
    // list — nothing here touches the mistake list — and `unscoredAfterClose`
    // is the field a debrief needs to say so out loud.
    const s = accumulateScore(streamOf([PTP, GAP]));
    expect(s.totalPoints).toBe(10);
    expect(s.vtorostepenniCount).toBe(0);
    expect(s.unscoredAfterClose).toBe(1);
    // …and the same fault BEFORE the crash still costs its точка.
    expect(accumulateScore(streamOf([GAP, PTP])).totalPoints).toBe(11);
  });
});

/**
 * THE GUARD THAT KEEPS THE CLOSURE FROM MANUFACTURING A PASS (2026-08-23).
 *
 * `scoring.ts` closes the ledger only on a violation that is BOTH
 * `terminateSession` and `opasna`, and its header spends a paragraph on why the
 * second half is there: dropping points is the one shape of change that can
 * turn a failure into a false pass, and a terminating fault of a lighter class
 * would close the sheet at a total still inside приложение № 5, т. 11's caps.
 *
 * MEASURED: that clause was unguarded. Deleting `severityClass === "opasna"`
 * from the closing predicate — in either of the two places that used to hold a
 * copy of it — left all 810 tests of `src/modules/sim/rules` GREEN, on the very
 * fold that turns «280 наказателни точки» into 81 and «640» into 10. The three
 * cases below fail on that deletion.
 *
 * The event is hand-built rather than taken from the catalogue because no
 * catalogue row is like this today, and that is the point: `ViolationEvent`
 * lets any producer set `terminateSession` on any code, `makeViolation` copies
 * whatever the spec carries, and the day a second termination ground is added
 * (чл. 48, ал. 3 names two — ПТП and повторна намеса на комисията) this is the
 * shape it can arrive in.
 */
const terminatingOsnovna = (t: number): ViolationEvent => ({
  ...makeViolation("SEATBELT_OFF_WHILE_MOVING", t), // основна, 3 т.
  terminateSession: true,
});

describe("the guard that keeps the closure from manufacturing a pass", () => {
  it("a terminating fault that is NOT опасна does not close the ledger", () => {
    const events = [terminatingOsnovna(10), belt(40)];
    expect(ledgerCloseTime(events)).toBeNull();
    const s = accumulateScore(events);
    expect(s.totalPoints).toBe(6); // both rows billed — nothing was closed
    expect(s.ledgerClosedAtSec).toBeNull();
    expect(s.unscoredAfterClose).toBe(0);
    expect(ledgerBilling(events)).toEqual([true, true]);
  });

  it("…and a second copy of that fault is billed too, not swallowed as a duplicate closer", () => {
    // The one-termination-one-bill rule may only fire for a fault that actually
    // terminated. Applied to a lighter class it becomes a silent amnesty for
    // every repeat of it.
    const s = accumulateScore([terminatingOsnovna(10), terminatingOsnovna(40), belt(60)]);
    expect(s.totalPoints).toBe(9);
    expect(s.osnovniCount).toBe(3);
    expect(s.unscoredAfterClose).toBe(0);
  });

  it("…and this is the ИЗДЪРЖАН it stops: 10 наказателни точки, not 3", () => {
    // Without the `opasna` half, this stream closes at 5 s, drops three of its
    // four rows and lands at 3 наказателни точки / 3 от основни — inside both
    // caps of приложение № 5, т. 11, i.e. a PASS handed to a drive that failed
    // on the total and on the основни cap at once. There is no `hasDangerous`
    // here to catch it, because nothing опасно happened.
    const events = [terminatingOsnovna(5), belt(20), belt(40), speeding(60)];
    const s = accumulateScore(events);
    expect(s.ledgerClosedAtSec).toBeNull();
    expect(s.totalPoints).toBe(10); // > 9
    expect(s.osnovniPoints).toBe(9); // > 6
    expect(s.hasDangerous).toBe(false);
    expect(isPassing(s)).toBe(false);
  });
});

/**
 * THE THREE OPEN FINDINGS ON THIS FILE THAT HAD NO PIN, PINNED FROM THE FRAMES
 * THAT RE-DRIVE THEM (2026-08-23).
 *
 * The blocks above re-score sweep-161 streams — the drives that FILED the
 * findings. The first two here are the other side: the streams the product
 * produced after the closure shipped, read off the steered re-drive under
 * `.audit-frames/rebase` and the Wave-C re-drive under `.audit-frames/wave-c`.
 * THE THIRD IS NOT A RE-DRIVE and this header used to say it was (corrected by
 * the verifier, 2026-08-23): its stream is sweep-161's, the filing drive, and
 * the re-drives of those two legs do not reproduce the split at all — see its
 * own comment. It is kept because the arithmetic it pins is what the finding
 * asked about, not because a re-drive confirmed the numbers.
 * They exist so a future change cannot quietly walk any of the three back.
 */
describe("the re-drives, pinned", () => {
  it("sc-merge-lane-end/pc-right: the grader DOES look at the drive — 13, and the sheet adds up", () => {
    // `sc-merge-lane-end:0a1eff42` said the grader „never looked at the drive at
    // all": all four sweep legs printed 0/0/0 because the drive emitted no
    // violations (its own `run.log` reads «MISTAKES (0)»), so nothing ever
    // reached this fold. Driven with steering
    // (`.audit-frames/rebase/frames/sc-merge-lane-end__pc-right`, «MISTAKES (3)»)
    // the same lesson produces three rows and this fold prices them exactly as
    // `08-debrief-p2.png` prints them: «Опасни грешки 1 · 10 | Основни грешки
    // 1 · 3 | Второстепенни грешки 0 · 0 | Общо (допустими 9) 2 · 13».
    //
    // `streamOf` as everywhere above: the CODES and their ORDER are the leg's,
    // spaced one second apart from t = 10. The leg's own log prints no per-row
    // timestamps, so no second here is a measurement and none is asserted as
    // one — only the order matters, because only the order decides the closure.
    const events = streamOf([
      "LANE_CHANGE_WITHOUT_MIRROR_CHECK", // основна, 3 т.
      PTP, // опасна — closes it («Удар в друго превозно средство»)
      "POOR_LANE_KEEPING", // второстепенна, after the crash
    ]);
    const s = accumulateScore(events);
    expect(s.totalPoints).toBe(13);
    expect(s.opasniCount).toBe(1);
    expect(s.osnovniCount).toBe(1);
    expect(s.vtorostepenniCount).toBe(0); // «Второстепенни грешки 0 · 0» on the frame
    expect(s.ledgerClosedAtSec).toBe(11); // streamOf: t = 10 + index
    expect(s.unscoredAfterClose).toBe(1);
    // …and the row-level flags agree with the total, so the list can print
    // «без допълнителни изпитни точки» beside exactly the row that got none.
    expect(ledgerBilling(events)).toEqual([true, true, false]);
  });

  it("sc-merge-roadworks-shift: right and wrong are no longer the same card", () => {
    // `sc-merge-roadworks-shift:d43e7238`, critical — „pc-right, pc-wrong,
    // mobile-right and mobile-wrong all produce 20 points, 2 dangerous errors,
    // НЕИЗДЪРЖАН. Nothing the student does changes the verdict." The 20 was two
    // reports of one crash and is pinned at 10 above. What separates the legs is
    // asserted here: the steered correct drive
    // (`.audit-frames/rebase/frames/…__pc-right/run.log`, «VERDICT: ИЗДЪРЖАН ·
    // SCORE: 3 наказателни точки») carries one основна and passes; the wrong
    // drive (`.audit-frames/wave-c/frames/…__pc-wrong/08-debrief.png`, «10
    // наказателни точки … Опасни грешки 1 · 10») carries the crash and fails.
    const right = accumulateScore(streamOf(["LANE_CHANGE_WITHOUT_MIRROR_CHECK"]));
    const wrong = accumulateScore(streamOf([PTP]));
    expect(right.totalPoints).toBe(3);
    expect(isPassing(right)).toBe(true);
    expect(wrong.totalPoints).toBe(10);
    expect(isPassing(wrong)).toBe(false);
    expect(right.totalPoints).toBeLessThan(wrong.totalPoints);
  });

  it("sc-merge-from-property: «10 on PC, 30 on mobile» is three faults, not a re-billed crash", () => {
    // `sc-merge-from-property:5030a28b` read the split as the scorer grading by
    // device. It is not: this fold is a pure function of the event stream, and
    // the two legs handed it different streams. Both streams are SWEEP-161's —
    // `.audit-frames/sweep161/sc-merge-from-property/{pc,mobile}-right/run.log`,
    // the drives that filed the finding, NOT a re-drive (the corpus was left
    // unnamed here until the verifier pinned it, 2026-08-23). pc-right is
    // «MISTAKES (1)» / «SCORE: 10» — one ПТП. mobile-right is «MISTAKES (3)» /
    // «SCORE: 30» — «Непропускане на пешеходец», «Неспиране на знак Б2 „Спри!“»
    // and THEN «Пътнотранспортно произшествие»: three different faults, 10 + 10
    // + 10, none of them a repeat of another. So the 30 must STAY 30;
    // collapsing it is the amnesty the header forbids, and it would drop a
    // pedestrian the student really did drive through.
    //
    // WHAT THE RE-DRIVES SAY, WHICH IS NOT THIS, AND WHY IT DOES NOT MOVE THE
    // ASSERTION. Both legs were driven again and neither reproduces the split:
    // steered (`.audit-frames/rebase/frames/sc-merge-from-property__*`) pc-right
    // is «MISTAKES (2)» / 20 and mobile-right is «MISTAKES (1)» / 10 — the
    // device with the higher score has swapped — and Wave-C
    // (`wave-c-results.jsonl`) has pc-right 10 against mobile-right 20. On both
    // re-drives the pedestrian and the Б2 come back as COMMENDATIONS («★ ✓
    // Правилно пропускане на пешеходец», «★ ✓ Правилно спиране на знак Б2»),
    // i.e. the same two acts scored the other way on a different drive. That is
    // a statement about which faults the ENGINE detected on which run, not
    // about this fold, which was handed three опасни and priced three опасни.
    // The 30 stands as the correct price of the stream sweep-161 recorded.
    const pc = accumulateScore(streamOf([PTP]));
    expect(pc.totalPoints).toBe(10);

    const mobile = accumulateScore(streamOf(["PEDESTRIAN_NOT_YIELDED", B2, PTP]));
    expect(mobile.totalPoints).toBe(30);
    expect(mobile.opasniCount).toBe(3);
    expect(mobile.ledgerClosedAtSec).toBe(12); // the crash is last: nothing to drop
    expect(mobile.unscoredAfterClose).toBe(0);
  });
});
