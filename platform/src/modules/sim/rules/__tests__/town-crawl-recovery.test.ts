import { describe, expect, it } from "vitest";
import { codes, cruise, drive, tick } from "./fixtures";
import { DEFAULT_RULE_CONFIG } from "../types";

/**
 * THE SLOW SIDE OF THE SPEED ENVELOPE GETS THE FAST SIDE'S HYSTERESIS —
 * w42 · `sc-vu-emergency-junction:853790f7`.
 *
 * The detector itself (`town-crawl.test.ts`, the sibling file) has existed
 * since wave 29 and was written FOR this row. It still could not reach its own
 * threshold on the drive the row is filed on, and this file is the measurement
 * of why plus the guard on the repair.
 *
 * WHAT WAS MEASURED, THROUGH THE PRODUCTION REDUCER, BEFORE THE REPAIR. The
 * w42 `sc-vu-emergency-junction__pc-right` leg's own printed dial (its
 * `run.log` beats, interpolated to 1 Hz and run out to the 143 s its debrief
 * prints — «Ориентировъчно време — 143 с при ориентир 60 с»), on the road that
 * leg is posted at:
 *
 *   bills of DRIVING_TOO_SLOW_IN_TOWN … 0
 *   PEAK townCrawlSec over 143 s ……… 9.0   of the 20 s it needs
 *   every event the drive produced … CLEAN_DRIVING
 *
 * The cause was one line: `townReset` was `speed >= townFloorKmh`, and
 * `stepAccruedEpisode`'s reset arm ZEROES the ledger — so the detection line
 * and the recovery line were the same number, read on one frame, and a car
 * brushing 13 км/ч on a road posted 40 discarded every second banked before
 * it. The fast half of the same envelope has carried a BAND (the grace) and a
 * HOLD (`speedingRearmSec`) since M-16. The slow half now takes both,
 * unchanged — see `TOWN_CRAWL_RECOVERY_HELD_SEC` in `engine.ts`.
 */

const CODE = "DRIVING_TOO_SLOW_IN_TOWN";

/** Posted 40 — the plate `sc-vu-emergency-junction` drives under. */
const POSTED = 40;
/** min(40 × 0.3, 15) = 12 км/ч — the DETECTION floor. */
const FLOOR = Math.min(
  POSTED * DEFAULT_RULE_CONFIG.townCrawlFractionOfLimit,
  DEFAULT_RULE_CONFIG.townCrawlFloorCapKmh,
);
/** floor + the fast side's own grace = 12 + min(4, 5) = 16 км/ч. */
const RECOVERY = FLOOR +
  Math.min(
    POSTED * DEFAULT_RULE_CONFIG.speedingGraceRatio,
    DEFAULT_RULE_CONFIG.speedingGraceMaxKmh,
  );

/**
 * The w42 `pc-right` dial, beat for beat from its `run.log`, interpolated to
 * 1 Hz and repeated to the 143 s the debrief prints. Nothing here is invented:
 * every anchor below is a number the product itself printed on the glass.
 */
function w42PcRightDial(): ReturnType<typeof tick>[] {
  const beats: Array<[number, number]> = [
    [0, 10],
    [6, 18],
    [11, 4],
    [16, 12],
    [21, 7],
    [26, 13],
    [32, 14],
    [37, 14],
    [43, 15],
    [48, 9],
    [54, 4],
    [59, 0],
    [65, 0],
  ];
  const out: ReturnType<typeof tick>[] = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let s = 0; s <= 65; s++) {
      let i = 0;
      while (i < beats.length - 2 && beats[i + 1][0] <= s) i++;
      const [t0, v0] = beats[i];
      const [t1, v1] = beats[i + 1];
      const f = t1 === t0 ? 0 : (s - t0) / (t1 - t0);
      const t = cycle * 66 + s;
      if (t > 143) return out;
      out.push(tick(t, { speedKmh: v0 + (v1 - v0) * f, maxSpeedKmh: POSTED }));
    }
  }
  return out;
}

describe("town crawl — the recovery band and the hold", () => {
  it("the two thresholds are derived, not typed in, and they are NOT the same number", () => {
    // The whole defect in one assertion: before the repair these two were
    // equal, so „recovered" meant „touched the line that convicts".
    expect(FLOOR).toBe(12);
    expect(RECOVERY).toBe(16);
    expect(RECOVERY).toBeGreaterThan(FLOOR);
  });

  it("the photographed drive is convicted — 143 s of the w42 dial, twice billed", () => {
    // Before: 0 bills, peak ledger 9.0 s, the only event CLEAN_DRIVING.
    const { events } = drive(w42PcRightDial());
    const slow = events.filter((e) => e.code === CODE);
    expect(slow).toHaveLength(2);
    // The teach card first, then the re-grade the free mini-lesson consumed —
    // the TOWN_CRAWL_REGRADE_SEC contract, unchanged by this repair.
    expect(slow.map((e) => (e as { regrade?: true }).regrade === true)).toEqual([false, true]);
    // …and the drive is no longer commended for it.
    expect(codes(events)).not.toContain("CLEAN_DRIVING");
  });

  it("a saw-tooth that never leaves the crawl is one crawl, not a string of innocents", () => {
    // 10 км/ч held, brushing 13 for a second at a time: every blip is under the
    // recovery band, so nothing is wiped and the accrued seconds are the
    // seconds actually spent crawling. This is the shape the reset used to
    // acquit — and the M-16 invariant says the steadier fault may never cost
    // less than the corrected one.
    const ticks: ReturnType<typeof tick>[] = [];
    for (let t = 0; t <= 120; t++) {
      ticks.push(tick(t, { speedKmh: t % 6 === 5 ? 13 : 10, maxSpeedKmh: POSTED }));
    }
    expect(codes(drive(ticks).events)).toContain(CODE);
  });

  it("…and a GENUINE recovery still wipes it: the same saw-tooth above the band is silent", () => {
    // A12, the acquittal side of the same change. 17 км/ч is over RECOVERY, so
    // once it is held for the four seconds the ledger clears and re-arms; the
    // crawl seconds either side of it never add up to a bill.
    const ticks: ReturnType<typeof tick>[] = [];
    for (let t = 0; t <= 200; t++) {
      ticks.push(tick(t, { speedKmh: t % 20 < 12 ? 10 : 17, maxSpeedKmh: POSTED }));
    }
    expect(codes(drive(ticks).events)).not.toContain(CODE);
  });

  it("leaving the through road still resets on the frame it happens", () => {
    // The seed: off a through road `townCrawlRecoverySec` is set to its own
    // threshold, so the reset is immediate and nothing is carried across a
    // plate change — byte-identical to the behaviour before the repair.
    const ticks = [
      ...cruise(0, 18, { speedKmh: 10, maxSpeedKmh: POSTED }),
      // …into a Зона 30 aisle, where crawling is the exercise…
      ...cruise(19, 40, { speedKmh: 10, maxSpeedKmh: 20 }),
      // …and back out. The first stretch's 19 s must not be waiting here.
      ...cruise(41, 55, { speedKmh: 10, maxSpeedKmh: POSTED }),
    ];
    expect(codes(drive(ticks).events)).not.toContain(CODE);
  });

  it("every acquittal the article demands is untouched by the recovery band", () => {
    // `townCrawlCond` is the same predicate gate for gate: a drive that
    // qualifies for not one second still banks not one second, however long it
    // runs and whatever the reset does. A lead vehicle ahead is the one this
    // lesson turns on — чл. 22, ал. 1 forbids the crawl that obstructs OTHERS,
    // and with a body in front the crawler is not the head of the queue.
    const long = (over: Partial<ReturnType<typeof tick>>) =>
      codes(drive(cruise(0, 200, { speedKmh: 10, maxSpeedKmh: POSTED, ...over })).events);
    expect(long({ leadGapM: 120 })).not.toContain(CODE);
    expect(long({ nextJunctionM: 12 })).not.toContain(CODE);
    expect(long({ vruAheadM: 12 })).not.toContain(CODE);
    expect(long({ rain: true })).not.toContain(CODE);
    expect(long({ zone: "thirty" })).not.toContain(CODE);
  });
});
