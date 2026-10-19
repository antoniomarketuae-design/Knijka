/**
 * „HELD FOR THE SUSTAIN" — ONE TIE RULE FOR BOTH HARSH-BRAKE LEDGERS
 * (`sc-follow-tailgater:a31d9216`, 2026-10-18; doc 88 TP-1, the integrator's
 * S1/S2 under the founder's 2026-10-08 delegation).
 *
 * THE DEFECT, MEASURED AT e58f388. The student's causeless ledger in
 * `engine.ts` asked «held for the sustain?» with a bare `>=` in three places —
 * the mean's window, the re-anchor and the bill (with its floored record). On
 * the ADR-014 grid every tick is a whole 1/60 s point, and 24 points SUM to
 * 0.39999999999999858 or 0.4000000000000004 depending only on the absolute
 * time they start at. A causeless 9 m/s² stab from 60 км/ч held exactly 24
 * grid points billed on 883 of 2,400 start points (410 of 2,400 at 7.5 m/s²);
 * 23 points never, 25 always. The vehicle step (`harshBrakeEpisode.ts`) asks
 * the same question through `heldFor`, which holds the exact tie — so the
 * лепка's report of a brake could say harsh while the student's own sum of the
 * same 24 points said not. Both now call `heldFor`.
 *
 * WHAT IS NOT MOVED, pinned at the bottom: 0.4 s, 7 m/s², 35 км/ч, the
 * mean's EXCLUSIVE line (the other exact tie, still spent on the acquittal).
 */

import { describe, expect, it } from "vitest";
import { heldFor, HARSH_BRAKE_TIE_TOLERANCE, newHarshBrakeTrack, stepHarshBrakeTrack } from "../harshBrakeEpisode";
import { DEFAULT_RULE_CONFIG } from "../types";
import { drive, tick } from "./fixtures";

const H = 1 / 60;
const LINE = {
  harshBrakeDecelMps2: DEFAULT_RULE_CONFIG.harshBrakeDecelMps2,
  harshBrakeSustainSec: DEFAULT_RULE_CONFIG.harshBrakeSustainSec,
  accelWindowSec: DEFAULT_RULE_CONFIG.accelWindowSec,
};

/**
 * One causeless brake on the 1/60 grid starting at grid point `k0`: 60 км/ч,
 * then `lead` points at `leadDecel` m/s² (a lead-in under the line, so the
 * window is older than the accrual), then `n` points at `decel`, then held.
 */
function stab(k0: number, n: number, decel: number, lead = 0, leadDecel = 5): Array<{ t: number; kmh: number }> {
  const out: Array<{ t: number; kmh: number }> = [];
  let v = 60;
  for (let k = k0 - 120; k <= k0 + lead + n + 90; k++) {
    if (k > k0 && k <= k0 + lead) v -= leadDecel * 3.6 * H;
    else if (k > k0 + lead && k <= k0 + lead + n) v -= decel * 3.6 * H;
    out.push({ t: k * H, kmh: v });
  }
  return out;
}

function engineBill(tr: Array<{ t: number; kmh: number }>): number | null {
  const { events } = drive(
    tr.map((s, i) => tick(s.t, { speedKmh: s.kmh, maxSpeedKmh: 70, gear: 4, position: { x: 0, y: i * 0.2 } })),
  );
  const e = events.find((x) => x.code === "HARSH_BRAKING_NO_CAUSE");
  return e ? e.t : null;
}

function stepFire(tr: Array<{ t: number; kmh: number }>): number | null {
  const track = newHarshBrakeTrack();
  const v0 = tr[0]!.kmh / 3.6;
  for (const s of tr) if (stepHarshBrakeTrack(track, s.t, v0 - s.kmh / 3.6, LINE) !== null) return s.t;
  return null;
}

/** 600 start grid points — the triage swept 2,400; 600 already holds 200+ of each rounding. */
const STARTS = Array.from({ length: 600 }, (_, i) => 600 + i);

describe("a causeless stab held EXACTLY the sustain (24 grid points) is held — on every start point", () => {
  for (const decel of [9, 8, 7.5]) {
    it(`${decel} m/s² × 24 points bills on all ${STARTS.length} start points (base: 883/2,400 at 9 and 8, 410/2,400 at 7.5)`, () => {
      const acquitted = STARTS.filter((k0) => engineBill(stab(k0, 24, decel)) === null);
      expect(acquitted.slice(0, 8), `${acquitted.length} start points acquitted`).toEqual([]);
    });
    it(`${decel} m/s² × 23 points bills on none, × 25 on all (unchanged)`, () => {
      const billed23 = STARTS.filter((k0) => engineBill(stab(k0, 23, decel)) !== null);
      const acquitted25 = STARTS.filter((k0) => engineBill(stab(k0, 25, decel)) === null);
      expect(billed23.length).toBe(0);
      expect(acquitted25.length).toBe(0);
    });
  }
});

describe("the engine's verdict IS the vehicle step's on the tie, frame for frame", () => {
  // Constant stabs straddling the sustain, and the same stab after a 5 m/s² lead
  // of 4 points — the window older than the accrual, so the bill's own sum
  // (`qualifiedSec`) is the one on the tie and not the window's.
  for (const [n, lead] of [[22, 0], [23, 0], [24, 0], [25, 0], [26, 0], [23, 4], [24, 4], [25, 4]] as const) {
    it(`9 m/s² × ${n} points after ${lead} lead points: same verdict on the same grid point, ${STARTS.length} starts`, () => {
      const apart: string[] = [];
      for (const k0 of STARTS) {
        const tr = stab(k0, n, 9, lead);
        const eng = engineBill(tr);
        const st = stepFire(tr);
        const same = eng === null ? st === null : st !== null && Math.abs(eng - st) <= H + 1e-9;
        if (!same) apart.push(`k0 ${k0}: engine ${eng} step ${st}`);
      }
      expect(apart.slice(0, 5), `${apart.length} start points apart`).toEqual([]);
    });
  }
});

describe("the tie rule is ONE predicate, in the direction `>=` already says, and nothing else moved", () => {
  it("heldFor holds the exact tie and the float either side of it, and not a grid point short", () => {
    expect(heldFor(0.39999999999999858, 0.4)).toBe(true);
    expect(heldFor(0.4000000000000004, 0.4)).toBe(true);
    expect(heldFor(0.4, 0.4)).toBe(true);
    expect(heldFor(23 / 60, 0.4)).toBe(false);
    expect(heldFor(0.4 - 1e-6, 0.4)).toBe(false);
    expect(HARSH_BRAKE_TIE_TOLERANCE).toBe(1e-9);
  });

  it("the protected numbers: 0.4 s, 7 m/s², 35 км/ч", () => {
    expect(DEFAULT_RULE_CONFIG.harshBrakeSustainSec).toBe(0.4);
    expect(DEFAULT_RULE_CONFIG.harshBrakeDecelMps2).toBe(7);
    expect(DEFAULT_RULE_CONFIG.harshBrakeMinSpeedKmh).toBe(35);
  });

  it("the mean's line stays EXCLUSIVE: a stop of exactly 7.00 m/s² held 1.5 s acquits, 7.01 convicts", () => {
    const at = (d: number) => {
      const out: Array<{ t: number; kmh: number }> = [];
      let v = 60;
      for (let k = 0; k <= 30 + 90 + 60; k++) {
        if (k > 30 && k <= 120) v -= d * 3.6 * H;
        out.push({ t: k * H, kmh: v });
      }
      return out;
    };
    expect(engineBill(at(7))).toBeNull();
    expect(engineBill(at(7.01))).not.toBeNull();
  });

  it("the floor still acquits: an exact-24-point 9 m/s² stab from 30 км/ч bills nothing (it is FLOORED, not billed)", () => {
    for (const k0 of STARTS.slice(0, 120)) {
      const tr = stab(k0, 24, 9).map((s) => ({ t: s.t, kmh: s.kmh - 30 }));
      expect(engineBill(tr)).toBeNull();
    }
  });
});
