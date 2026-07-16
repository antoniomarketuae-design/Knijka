/**
 * FO-03/FO-07 grading facts (doc 72 §9) — the rule-engine truths the
 * FOLLOWING actor pair is built on, pinned as unit probes:
 *
 *  1. THE STOLEN GAP IS INNOCENT: a cut-in collapses leadGapM through no
 *     fault of the driver's; while the driver re-opens it (gap opening ≥
 *     followRecoveryRateMps) the following episode never sustains — the
 *     recovery-rate guard is the whole FO-03 point (A12).
 *  2. HOLDING the stolen gap fires exactly FOLLOWING_TOO_CLOSE.
 *  3. A REAR CAR IS NOT A FORWARD CAUSE: the harsh-brake cause ledger reads
 *     only the forward leadGap channel (leadGapMeters skips everything with
 *     fwd <= 0 — see traffic lead-gap tests), so a brake-check performed with
 *     only a tailgater behind grades HARSH_BRAKING_NO_CAUSE honestly.
 *  4. THE CUT-IN IS A FORWARD CAUSE: the same slam with the cutter in the
 *     forward channel never bills — which is why sc-follow-cutin's demo pair
 *     is two same-code holds, not a panic-slam flavor.
 */

import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";
import type { SimTick } from "../types";

describe("FO-03 — the stolen-gap innocence (followRecoveryRateMps)", () => {
  it("a cut-in collapses the gap; re-opening it never bills", () => {
    const ticks: SimTick[] = [
      // Cruising at 40 behind a safe 30 m lead.
      tick(0, { speedKmh: 40, leadGapM: 30 }),
      tick(1, { speedKmh: 40, leadGapM: 30 }),
      tick(2, { speedKmh: 40, leadGapM: 30 }),
      // The cut: 30 → 6 m in one frame (nobody's fault)…
      tick(3, { speedKmh: 40, leadGapM: 6 }),
      // …and the driver LIFTS: the gap opens ≥ 0.5 m/s every frame after.
      tick(4, { speedKmh: 36, leadGapM: 8 }),
      tick(5, { speedKmh: 31, leadGapM: 11 }),
      tick(6, { speedKmh: 28, leadGapM: 14 }),
      tick(7, { speedKmh: 28, leadGapM: 17 }),
      tick(8, { speedKmh: 28, leadGapM: 19 }),
    ];
    expect(codes(drive(ticks).events)).not.toContain("FOLLOWING_TOO_CLOSE");
  });

  it("HOLDING the stolen gap at speed fires exactly FOLLOWING_TOO_CLOSE", () => {
    const ticks: SimTick[] = [
      tick(0, { speedKmh: 40, leadGapM: 30 }),
      tick(1, { speedKmh: 40, leadGapM: 30 }),
      tick(2, { speedKmh: 40, leadGapM: 6 }),
      tick(3, { speedKmh: 40, leadGapM: 6 }),
      tick(4, { speedKmh: 40, leadGapM: 6 }),
      tick(5, { speedKmh: 40, leadGapM: 6 }),
      tick(6, { speedKmh: 40, leadGapM: 6 }),
    ];
    const all = codes(drive(ticks).events);
    expect(all).toContain("FOLLOWING_TOO_CLOSE");
    expect(all.filter((c) => c === "FOLLOWING_TOO_CLOSE")).toHaveLength(1);
  });
});

/** A 12 m/s²-class slam from 46 km/h sampled at 5 Hz (the accel derivative
 *  the engine reads is ≈ −12 m/s² between frames). */
function slam(t0: number, over: Partial<SimTick> = {}): SimTick[] {
  const speeds = [46, 37.4, 28.8, 20.2, 11.6, 3, 0, 0];
  return speeds.map((s, i) => tick(t0 + i * 0.2, { speedKmh: s, ...over }));
}

describe("FO-07 — the brake-check facts (harsh-brake cause ledger)", () => {
  it("a rear tailgater is NOT a forward cause: the causeless slam bills", () => {
    // The tailgater exists only BEHIND the player — the forward leadGap
    // channel never reports it (fwd <= 0 is skipped), so leadGapM is absent
    // and the ledger finds no cause: the brake-check grades honestly.
    const ticks: SimTick[] = [
      tick(0, { speedKmh: 46 }),
      tick(1, { speedKmh: 46 }),
      ...slam(2),
    ];
    expect(codes(drive(ticks).events)).toContain("HARSH_BRAKING_NO_CAUSE");
  });

  it("the same slam WITH a cut-in ahead never bills — the cut-in IS a cause", () => {
    const ticks: SimTick[] = [
      tick(0, { speedKmh: 46, leadGapM: 30 }),
      tick(1, { speedKmh: 46, leadGapM: 30 }),
      // The cutter lands 6 m ahead — inside the 45 m cause window.
      ...slam(2, { leadGapM: 6 }),
    ];
    expect(codes(drive(ticks).events)).not.toContain("HARSH_BRAKING_NO_CAUSE");
  });
});
