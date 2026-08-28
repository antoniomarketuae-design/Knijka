import { describe, expect, it } from "vitest";
import { createRuleEngine, reduceTick } from "../engine";
import type { SimTick } from "../types";
import { codes, drive, tick } from "./fixtures";

describe("wrong-way detector", () => {
  // 2026-08-28 — THE DRIVE IN THIS CASE GOT LONGER BY ONE SECOND, and it is the
  // only assertion in this wave's wrong-way work whose INPUT moved, so it is
  // spelled out. It read
  //
  //     const ticks = [0, 1, 2].map((t) => tick(t, { speedKmh: 25, wrongWay: true }));
  //     expect(codes(drive(ticks).events)).toContain("WRONG_WAY");
  //
  // and now reads `[0, 1, 2, 3]` with the same assertion, unweakened. Two
  // seconds at 25 км/ч is 13,9 m — LESS than `WRONG_WAY_ENTRY_TRAVEL_M`, so
  // the old fixture describes a car still in the mouth of the street, which is
  // exactly the drive the entry floor exists to acquit. The case's subject is
  // „a sustained run fires"; to be about that, the run has to be sustained in
  // PATH as well as in time, and 3 s at 25 км/ч (20,8 m) is. The behaviour the
  // old input pinned has not been dropped — it is asserted below, from the
  // other side, as „a run that stops short of the entry floor never fires".
  it("fires after sustained wrong-way driving", () => {
    const ticks = [0, 1, 2, 3].map((t) => tick(t, { speedKmh: 25, wrongWay: true }));
    expect(codes(drive(ticks).events)).toContain("WRONG_WAY");
  });

  it("a run that stops short of the entry floor never fires", () => {
    // 2 s at 25 км/ч = 13,9 m, under WRONG_WAY_ENTRY_TRAVEL_M. This is the
    // half of the boundary the case above used to hold; it is held here now.
    const ticks = [0, 1, 2].map((t) => tick(t, { speedKmh: 25, wrongWay: true }));
    expect(codes(drive(ticks).events)).not.toContain("WRONG_WAY");
  });

  it("does not fire when going the right way", () => {
    const ticks = [0, 1, 2].map((t) => tick(t, { speedKmh: 25 })); // wrongWay absent
    expect(codes(drive(ticks).events)).not.toContain("WRONG_WAY");
  });

  it("does not fire while stopped", () => {
    const ticks = [0, 1, 2, 3].map((t) => tick(t, { speedKmh: 0, wrongWay: true }));
    expect(codes(drive(ticks).events)).not.toContain("WRONG_WAY");
  });
});

// ---------------------------------------------------------------------------
// THE ENTRY FLOOR MUST NOT BE A REVERSE SPEED FLOOR (wave 7, 2026-08-28)
// ---------------------------------------------------------------------------
//
// `WRONG_WAY_ENTRY_TRAVEL_M` shipped keyed on `tick.edgeId`, so the 15 m and
// the 1,5 s both had to complete on ONE OSM way, in series. Driving the real
// reducer with `wrongWay` true on every frame and advancing only `edgeId`, the
// bills came out
//
//      edge m   20 км/ч   30   40   50   80
//        ≤ 20      0       0    0    0    0
//          25      1       0    0    0    0
//        28.2      1       1    0    0    0
//          40      1       1    1    1    0
//        ≥ 60      1       1    1    1    1
//
// — an acquittal probability that RISES with speed. `rb-mini-v1` and
// `rb-ped-v1` have four one-way arms of exactly 28,2 m, so the wrong way round
// a mini-roundabout was billed at 30 км/ч and never at 40 or 50; `district-v1`
// has 27 one-way edges under 15 m, `d2-v1` 12. These cases hold the fix: the
// ledger is the RUN (it crosses way boundaries and survives the flag blinking
// out), and the two gates are read from it in PARALLEL.
//
// Every cell of the grid below is 0 on the shipped code and 1 on this one.

/** A one-way street `streetM` long driven end to end at `kmh`, `edgeLen` ways. */
function wrongWayRun(kmh: number, streetM: number, edgeLen: number, dt = 0.05): SimTick[] {
  const out: SimTick[] = [];
  const v = kmh / 3.6;
  for (let i = 0; i * dt <= streetM / v + 10; i += 1) {
    const t = +(i * dt).toFixed(4);
    const odo = v * t;
    out.push({
      ...tick(t, { speedKmh: kmh, wrongWay: odo <= streetM ? true : undefined }),
      // Above every posted limit in the fixture so the speed codes stay out of
      // the way; only WRONG_WAY is counted.
      maxSpeedKmh: 130,
      position: { x: odo, y: 0 },
      edgeId: `e${Math.floor(odo / edgeLen)}`,
    });
  }
  return out;
}

const billsOn = (ticks: SimTick[]): number =>
  codes(drive(ticks).events).filter((c) => c === "WRONG_WAY").length;

/** The t of the first WRONG_WAY, or null. */
function firstBillAt(ticks: SimTick[]): number | null {
  let state = createRuleEngine();
  for (const frame of ticks) {
    const r = reduceTick(state, frame);
    state = r.state;
    if (r.events.some((e) => e.code === "WRONG_WAY")) return frame.t;
  }
  return null;
}

const SPEEDS = [20, 30, 40, 50, 80];

describe("wrong-way — the entry floor is a path floor, not a speed floor", () => {
  it("bills a continuous wrong-way run at EVERY speed, however short the OSM ways are", () => {
    // 60 s of continuous wrong-way, the map cut into ways of each length. The
    // 10 m row is shorter than the floor itself: a floor that could only be
    // reached inside one way could never be reached there at all.
    const unbilled: string[] = [];
    for (const edgeLen of [10, 15, 20, 25, 28.2, 40, 60, 140]) {
      for (const kmh of SPEEDS) {
        const n = billsOn(wrongWayRun(kmh, (kmh / 3.6) * 60, edgeLen));
        if (n !== 1) unbilled.push(`${edgeLen} m ways @ ${kmh} км/ч → ${n} bills`);
      }
    }
    expect(unbilled).toEqual([]);
  });

  it("never bills a fast run LATER than a slow one — the property the first cut inverted", () => {
    const times = SPEEDS.map((kmh) => firstBillAt(wrongWayRun(kmh, (kmh / 3.6) * 60, 20)));
    expect(times.filter((t) => t === null)).toEqual([]);
    const inversions: string[] = [];
    for (let i = 1; i < times.length; i += 1) {
      const fast = times[i] as number;
      const slow = times[i - 1] as number;
      if (fast > slow) {
        inversions.push(
          `${SPEEDS[i]} км/ч billed at ${fast} s — later than ${SPEEDS[i - 1]} км/ч at ${slow} s`,
        );
      }
    }
    expect(inversions).toEqual([]);
    // …and the SHAPE of it, so a future edit that re-serialises the two gates
    // is caught by the number and not only by the ordering: the bill lands at
    // max(sustain, floor / speed), within the frame it is credited on.
    const offBy = SPEEDS.map((kmh, i) => {
      const want = Math.max(1.5, 15 / (kmh / 3.6));
      const got = times[i] as number;
      return got + 1e-9 >= want && got <= want + 0.1
        ? null
        : `${kmh} км/ч: billed at ${got} s, expected ~${want.toFixed(2)} s`;
    }).filter((x) => x !== null);
    expect(offBy).toEqual([]);
  });

  it("bills the wrong way round a 28,2 m mini-roundabout arm at road speed", () => {
    // rb-mini-v1 / rb-ped-v1. The car keeps going round, so the ways are 28,2 m
    // but the run is not: this is the exact cell that read 0 at 40 and 50 км/ч.
    for (const kmh of [20, 30, 40, 50]) {
      expect(billsOn(wrongWayRun(kmh, 120, 28.2))).toBe(1);
    }
  });

  it("the floor's ONLY subtraction is the sub-floor run — a bounded street is graded as before", () => {
    // Measured against the same reducer with the floor set to 0 (i.e. the rule
    // as it stood before the floor existed): driving a one-way street of length
    // L end to end gives an IDENTICAL verdict at every speed for L >= 20 m, and
    // differs only on the 15 m street at 20 and 30 км/ч — the mouth-length run
    // the floor is for. Anything still unbilled here is `wrongWaySustainSec`
    // (1,5 s), which this wave did not touch: a 20 m street at 50 км/ч is over
    // in 1,44 s and was unbilled before the floor too.
    expect(billsOn(wrongWayRun(20, 15, 28.2))).toBe(0); // 15 m of street: the mouth
    expect(billsOn(wrongWayRun(30, 15, 28.2))).toBe(0);
    for (const kmh of SPEEDS) {
      expect(billsOn(wrongWayRun(kmh, 60, 28.2))).toBe(1); // 60 m of street: an entry
    }
  });
});
