/**
 * TWO PINS OWED AT THE brakeledger LANDING (2026-10-19; `sc-follow-tailgater:
 * e47a45c1`, the integrator's F1 and F3). The verifier's round-1 mutants V4
 * and V5 survived the lane's own suite; each test below is the narrow
 * executed case that kills one of them on assertion text.
 *
 *  · M1 (V4) — F3 ACROSS A RE-ANCHOR. Inside ONE pedal application (the pedal
 *    never eased past the 2 m/s² braking line) a slam, an easing long enough
 *    that the mean re-anchors the window, and a second slam: the floored record
 *    then carries two window anchors. EVERY floored frame resets the streak,
 *    the second anchor's included, so the first praise after it is paid only
 *    250 m after the LAST floored frame. V4 reset only while
 *    `flooredSince === activeSince`, i.e. never after the re-anchor, and paid
 *    0.13–0.15 s early from a window holding the second slam.
 *
 *  · M2 (V5) — F1 FOR AN OVER-FLOOR EPISODE. A causeless 9 m/s² stab from
 *    50 км/ч (over the 35 км/ч floor, so it BILLS) whose 250 m completes in the
 *    0.4 s accrual before the bill: the payout waits, the bill resets the
 *    streak, and that praise is never paid. V5 held the payout only for
 *    sub-floor episodes and paid it in the frames before the bill.
 *
 * Tapes on the ADR-014 grid (1/60 s), clear road, no cause in sight. Nothing
 * here moves a protected number: the 35 км/ч floor, 0.4 s, 7 m/s² and 250 m
 * are read from DEFAULT_RULE_CONFIG.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../types";
import type { SimTick } from "../types";
import { createRuleEngine, reduceTick } from "../engine";
import { tick } from "./fixtures";

const H = 1 / 60;
const CFG = DEFAULT_RULE_CONFIG;

/**
 * Cruise at `kmh`; from grid point `k0` the profile `prof(j)` (m/s², j = 1…n)
 * brakes; afterwards back up to the cruise at 1.5 m/s². Speed is read exactly.
 */
function tape(kmh: number, k0: number, prof: (j: number) => number, n: number, endK: number): SimTick[] {
  const ticks: SimTick[] = [];
  let v = kmh;
  let y = 0;
  for (let k = 0; k <= endK; k++) {
    const j = k - k0;
    if (j >= 1 && j <= n) v = Math.max(0, v - prof(j) * 3.6 * H);
    else if (j > n && v < kmh) v = Math.min(kmh, v + 1.5 * 3.6 * H);
    y += (v / 3.6) * H;
    ticks.push(tick(k * H, { speedKmh: v, maxSpeedKmh: 70, gear: 4, position: { x: 0, y } }));
  }
  return ticks;
}

interface Run {
  clean: number[];
  harsh: number[];
  violations: string[];
  flooredFrames: number[];
  /** The window anchor (`activeSince`) on each floored frame. */
  flooredAnchors: number[];
  /** Frames on which the causeless episode was accruing (activeSince open, qualifiedSec > 0). */
  accruing: number[];
  /** True if `activeSince` went null between the first and the last floored frame. */
  windowClosedBetween: boolean;
}

function run(ticks: SimTick[]): Run {
  let s = createRuleEngine();
  const out: Run = { clean: [], harsh: [], violations: [], flooredFrames: [], flooredAnchors: [], accruing: [], windowClosedBetween: false };
  let closedSinceFirstFloored = false;
  for (const f of ticks) {
    const r = reduceTick(s, f);
    s = r.state;
    for (const e of r.events) {
      if (e.kind === "commendation" && e.code === "CLEAN_DRIVING") out.clean.push(e.t);
      if (e.kind === "violation") {
        out.violations.push(`${e.code}@${e.t.toFixed(4)}`);
        if (e.code === "HARSH_BRAKING_NO_CAUSE") out.harsh.push(e.t);
      }
    }
    if (out.flooredFrames.length > 0 && s.harshBrake.activeSince === null) closedSinceFirstFloored = true;
    if (s.harshBrake.flooredAt === f.t) {
      if (closedSinceFirstFloored) out.windowClosedBetween = true;
      out.flooredFrames.push(f.t);
      out.flooredAnchors.push(s.harshBrake.activeSince!);
    }
    if (s.harshBrake.activeSince !== null && s.harshBrake.qualifiedSec > 0) out.accruing.push(f.t);
  }
  return out;
}

/** The reducer's own streak accrual, from `from` (exclusive): the frame 250 m completes. */
function owedAfter(ticks: SimTick[], from: number): number | null {
  let acc = 0;
  let prevT: number | null = null;
  for (const f of ticks) {
    if (prevT !== null && f.t > from + 1e-9 && f.speedKmh > CFG.movingSpeedKmh) {
      acc += (f.speedKmh / 3.6) * Math.min(f.t - prevT, 2);
      if (acc >= CFG.cleanDrivingDistanceM) return f.t;
    }
    prevT = f.t;
  }
  return null;
}

/** Every praise owed with nothing withheld, from the start of the tape. */
function owed(ticks: SimTick[]): number[] {
  const out: number[] = [];
  let acc = 0;
  let prevT: number | null = null;
  for (const f of ticks) {
    if (prevT !== null && f.speedKmh > CFG.movingSpeedKmh) {
      acc += (f.speedKmh / 3.6) * Math.min(f.t - prevT, 2);
      if (acc >= CFG.cleanDrivingDistanceM) {
        acc -= CFG.cleanDrivingDistanceM;
        out.push(f.t);
      }
    }
    prevT = f.t;
  }
  return out;
}

const fmt = (x: number | null | undefined) => (x === null || x === undefined ? String(x) : x.toFixed(4));

describe("M1 — every floored frame resets the streak, across a re-anchor inside ONE pedal application (F3)", () => {
  // 34 км/ч (under the floor): slam 9 m/s² for 25 frames, ease 2.5 m/s² (still
  // over the 2 m/s² braking line, so the pedal is never released) for 12, slam
  // 9 again for 45 frames (to rest).
  const prof = (j: number) => (j <= 25 ? 9 : j <= 37 ? 2.5 : 9);
  const N = 25 + 12 + 45;

  for (const k0 of [1500, 1600, 1700, 1760]) {
    it(`double slam from 34 км/ч at grid point ${k0}: the floored record holds two anchors, nothing is billed, and the first praise after it is paid 250 m after the LAST floored frame`, () => {
      const ticks = tape(34, k0, prof, N, k0 + N + 3600);
      const r = run(ticks);
      expect(CFG.harshBrakeMinSpeedKmh).toBe(35);
      expect(r.violations).toEqual([]);
      // the shape this pin is about: one pedal application, re-anchored, floored on both anchors
      expect(r.windowClosedBetween).toBe(false);
      const anchors = [...new Set(r.flooredAnchors)];
      expect(anchors.length).toBe(2);
      const last = r.flooredFrames[r.flooredFrames.length - 1]!;
      const lastOfFirstAnchor = r.flooredFrames.filter((_, i) => r.flooredAnchors[i] === anchors[0]).pop()!;
      expect(last).toBeGreaterThan(lastOfFirstAnchor);
      // no praise minted from a window holding ANY floored frame
      const early = r.clean.filter((c) => c > r.flooredFrames[0]! - 1e-9 && c < (owedAfter(ticks, last) ?? Infinity) - 1e-9);
      expect(
        early.map((c) => `CLEAN_DRIVING paid at ${fmt(c)}, before 250 m from the last floored frame ${fmt(last)} (second anchor ${fmt(anchors[1])})`),
      ).toEqual([]);
      const firstAfter = r.clean.find((c) => c > last);
      expect(`first praise after the floored stop at ${fmt(firstAfter)}`).toBe(`first praise after the floored stop at ${fmt(owedAfter(ticks, last))}`);
    });
  }
});

describe("M2 — the payout waits while an OVER-floor causeless episode accrues, and its bill then resets the streak (F1)", () => {
  // 50 км/ч (over the floor): a causeless 9 m/s² stab for 40 frames, the pedal
  // landing on each grid point k0 = 1055…1090 so the first 250 m (due at 18.0 s)
  // completes before, inside, and after the 0.4 s accrual that leads to the bill.
  const ks: number[] = [];
  for (let k0 = 1055; k0 <= 1090; k0++) ks.push(k0);

  it("on every pedal point the stab is billed once, and no CLEAN_DRIVING is paid from the brake's onset up to its bill; the cases where the 250 m completed inside that accrual are present", () => {
    const paidInsideAccrual: string[] = [];
    let dueInsideAccrual = 0;
    for (const k0 of ks) {
      const ticks = tape(50, k0, () => 9, 40, k0 + 40 + 2400);
      const r = run(ticks);
      expect(r.harsh.length, `k0 ${k0}: ${r.violations.join(", ")}`).toBe(1);
      expect(r.flooredFrames, `k0 ${k0}`).toEqual([]);
      const onset = k0 * H;
      const bill = r.harsh[0]!;
      const due = owed(ticks)[0]!;
      if (due > onset - 1e-9 && due < bill - 1e-9 && r.accruing.some((a) => Math.abs(a - due) < 1e-9)) dueInsideAccrual++;
      for (const c of r.clean) {
        // „accruing" is the ruled hold (F1): activeSince open AND qualifiedSec > 0. A
        // payout on the onset frames before the first qualifying reading (the
        // 0.04 s reading window) stands, as ruled — only the accrual holds.
        const accruingThen = r.accruing.some((a) => Math.abs(a - c) < 1e-9);
        if (accruingThen && c > onset - 1e-9 && c < bill + 1e-9) paidInsideAccrual.push(`k0 ${k0}: CLEAN_DRIVING paid at ${fmt(c)} inside the accrual before the bill at ${fmt(bill)}`);
      }
      // and no praise after the bill is minted from fewer than 250 m driven since it
      const owedFromBill = owedAfter(ticks, bill)!;
      for (const c of r.clean) {
        if (c > bill && c < owedFromBill - 1e-9) paidInsideAccrual.push(`k0 ${k0}: CLEAN_DRIVING paid at ${fmt(c)}, before 250 m from the bill at ${fmt(bill)}`);
      }
    }
    expect(paidInsideAccrual).toEqual([]);
    // the sweep really covers the case: the owed 250 m fell inside the accrual on several pedal points
    expect(dueInsideAccrual).toBeGreaterThanOrEqual(3);
  });

  it("CONTROL — with the pedal well after the 250 m, the payout due before the brake is paid to the frame", () => {
    const ticks = tape(50, 1200, () => 9, 40, 1200 + 40 + 2400);
    const r = run(ticks);
    expect(r.harsh.length).toBe(1);
    expect(r.clean[0]).toBe(owed(ticks)[0]);
  });
});
