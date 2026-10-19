/**
 * A FLOORED BRAKE IS NOT CLEAN DRIVING (`sc-follow-tailgater:e47a45c1`,
 * 2026-10-18; the integrator's F1–F3 under the founder's 2026-10-08
 * delegation). The reducer half — the lesson half, through the live rung
 * chain, is `lessons/scenario/__tests__/brake-ledger-live-chain.test.ts`.
 *
 * A causeless brake that is emergency-grade by every gate of the ledger and
 * that the 35 км/ч floor ALONE acquits is recorded as floored (`flooredAt = t`)
 * and bills nothing — rightly, and unchanged here. At e58f388 the praise streak
 * never heard of it: a 30 км/ч full-pedal stab to rest was followed by
 * «Чисто и спокойно каране» minted from the very 250 m that held it.
 *
 * THE RULE: every frame on which the ledger records the floored episode resets
 * the streak as a bill does (nothing billed), and the PAYOUT — never the
 * accrual — waits while a causeless episode is accruing toward the sustain, so
 * no praise is minted in the 0.4 s before the first floored frame either.
 *
 * Every tape here is on the ADR-014 grid (1/60 s), on a clear road with no
 * cause in sight unless the row says so.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../types";
import type { SimTick } from "../types";
import { createRuleEngine, reduceTick } from "../engine";
import { tick } from "./fixtures";

const H = 1 / 60;
const CFG = DEFAULT_RULE_CONFIG;

interface Tape {
  ticks: SimTick[];
}

/**
 * A drive at `cruiseKmh` from t = 0 for `endSec`, with an optional brake: from
 * `brakeAt` s at `decel` m/s² (constant, read exactly — no noise) down to
 * `toKmh` (0 = rest, held 1.5 s), or for `forSec` s only; then back up to the
 * cruise at 2 m/s². `cause` marks a stop line 10 m ahead for the whole brake.
 */
function tape(o: {
  cruiseKmh: number;
  endSec: number;
  brakeAt?: number;
  decel?: number;
  toKmh?: number;
  forSec?: number;
  cause?: boolean;
}): Tape {
  const ticks: SimTick[] = [];
  let v = o.cruiseKmh / 3.6;
  let y = 0;
  let phase: "cruise" | "brake" | "rest" | "up" = "cruise";
  let restUntil = 0;
  let brakeEnd = Infinity;
  const n = Math.round(o.endSec * 60);
  for (let k = 0; k <= n; k++) {
    const t = k * H;
    if (phase === "cruise" && o.brakeAt !== undefined && k === Math.round(o.brakeAt * 60)) {
      phase = "brake";
      brakeEnd = o.forSec !== undefined ? t + o.forSec - 1e-9 : Infinity;
    }
    const braking = phase === "brake";
    ticks.push(
      tick(t, {
        speedKmh: v * 3.6,
        maxSpeedKmh: 50,
        gear: v * 3.6 > 25 ? 3 : 2,
        position: { x: 0, y },
        ...(braking && o.cause ? { nextStopLineM: 10 } : {}),
      }),
    );
    // advance to the next grid point
    let a = 0;
    if (phase === "brake") {
      a = -(o.decel ?? 9);
      const floor = (o.toKmh ?? 0) / 3.6;
      if (v + a * H <= floor || t + H > brakeEnd) {
        if (v + a * H <= floor) v = floor;
        else v += a * H;
        a = 0;
        if (floor === 0 && v === 0) {
          phase = "rest";
          restUntil = t + 1.5;
        } else phase = "up";
        y += v * H;
        continue;
      }
    } else if (phase === "rest") {
      if (t >= restUntil) phase = "up";
    } else if (phase === "up") {
      a = v < o.cruiseKmh / 3.6 ? 2 : 0;
      if (v >= o.cruiseKmh / 3.6) phase = "cruise";
    }
    const v0 = v;
    v = Math.min(o.cruiseKmh / 3.6, Math.max(0, v + a * H));
    y += ((v0 + v) / 2) * H;
  }
  return { ticks };
}

interface Run {
  clean: number[];
  violations: string[];
  flooredFrames: number[];
  /** The causeless ledger's accrual on each frame (> 0 = an episode accruing). */
  accruing: number[];
}

function run(tp: Tape): Run {
  let s = createRuleEngine();
  const out: Run = { clean: [], violations: [], flooredFrames: [], accruing: [] };
  for (const f of tp.ticks) {
    const r = reduceTick(s, f);
    s = r.state;
    for (const e of r.events) {
      if (e.kind === "commendation" && e.code === "CLEAN_DRIVING") out.clean.push(e.t);
      if (e.kind === "violation") out.violations.push(`${e.code}@${e.t.toFixed(3)}`);
    }
    if (s.harshBrake.flooredAt === f.t) out.flooredFrames.push(f.t);
    if (s.harshBrake.activeSince !== null && s.harshBrake.qualifiedSec > 0) out.accruing.push(f.t);
  }
  return out;
}

/**
 * The praise the streak owes a tape with NOTHING to withhold: the reducer's own
 * accrual (`speed / 3.6 × min(dt, 2)` on every moving frame after the first),
 * paid on the frame it reaches `cleanDrivingDistanceM`.
 */
function owed(tp: Tape): number[] {
  const out: number[] = [];
  let acc = 0;
  let prevT: number | null = null;
  for (const f of tp.ticks) {
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

/** Metres driven (moving frames) in (from, to]. */
function metres(tp: Tape, from: number, to: number): number {
  let acc = 0;
  let prevT: number | null = null;
  for (const f of tp.ticks) {
    if (prevT !== null && f.t > from + 1e-9 && f.t <= to + 1e-9 && f.speedKmh > CFG.movingSpeedKmh) {
      acc += (f.speedKmh / 3.6) * Math.min(f.t - prevT, 2);
    }
    prevT = f.t;
  }
  return acc;
}

/** Every CLEAN_DRIVING whose 250 m holds a floored frame (none may). */
function praiseOverAFlooredFrame(tp: Tape, r: Run): string[] {
  const bad: string[] = [];
  for (const c of r.clean) {
    const before = r.flooredFrames.filter((f) => f <= c);
    if (before.length === 0) {
      // A window that ends BEFORE the brake stands — but not one paid in the
      // accrual that led to it.
      const firstFloored = r.flooredFrames[0];
      if (firstFloored !== undefined && r.accruing.some((a) => a <= c + 1e-9) && c > (r.accruing[0] ?? Infinity) - 1e-9 && c < firstFloored)
        bad.push(`paid at ${c.toFixed(3)} inside the accrual before the first floored frame ${firstFloored.toFixed(3)}`);
      continue;
    }
    const last = before[before.length - 1]!;
    if (metres(tp, last, c) < CFG.cleanDrivingDistanceM - 1e-6) bad.push(`paid at ${c.toFixed(3)}, ${metres(tp, last, c).toFixed(1)} m after the floored frame ${last.toFixed(3)}`);
  }
  return bad;
}

/** The first praise owed after the last floored frame: 250 m driven from it. */
function owedAfter(tp: Tape, from: number): number | null {
  let acc = 0;
  let prevT: number | null = null;
  for (const f of tp.ticks) {
    if (prevT !== null && f.t > from + 1e-9 && f.speedKmh > CFG.movingSpeedKmh) {
      acc += (f.speedKmh / 3.6) * Math.min(f.t - prevT, 2);
      if (acc >= CFG.cleanDrivingDistanceM) return f.t;
    }
    prevT = f.t;
  }
  return null;
}

// 30 км/ч is 8.33 m/s: the first 250 m completes near 30 s.
const LAWFUL = tape({ cruiseKmh: 30, endSec: 70 });
const FIRST_OWED = owed(LAWFUL)[0]!;

describe("a floored stop withholds the praise of every window that holds it", () => {
  it("the control: a lawful 30 км/ч drive with no brake is paid on the frame its 250 m completes, every time", () => {
    const r = run(LAWFUL);
    expect(r.violations).toEqual([]);
    expect(r.clean).toEqual(owed(LAWFUL));
    expect(r.clean.length).toBeGreaterThanOrEqual(2);
  });

  it("a 9 m/s² causeless stop to rest from 30 км/ч is FLOORED, bills nothing, and no CLEAN_DRIVING is minted from a window holding it", () => {
    const tp = tape({ cruiseKmh: 30, endSec: 70, brakeAt: 12, decel: 9 });
    const r = run(tp);
    expect(r.violations).toEqual([]);
    expect(r.flooredFrames.length).toBeGreaterThan(0);
    expect(praiseOverAFlooredFrame(tp, r)).toEqual([]);
    // base minted one at ~30 s; the first window now starts at the last floored frame
    expect(r.clean.every((c) => c > r.flooredFrames[r.flooredFrames.length - 1]!)).toBe(true);
  });

  it("…and windows AFTER its last floored frame stand: the first is paid on the frame 250 m from it", () => {
    const tp = tape({ cruiseKmh: 30, endSec: 70, brakeAt: 12, decel: 9 });
    const r = run(tp);
    const last = r.flooredFrames[r.flooredFrames.length - 1]!;
    expect(r.clean[0]).toBe(owedAfter(tp, last));
  });

  it("…and a window paid BEFORE the brake stands", () => {
    const tp = tape({ cruiseKmh: 30, endSec: 70, brakeAt: FIRST_OWED + 3, decel: 9 });
    const r = run(tp);
    expect(r.flooredFrames.length).toBeGreaterThan(0);
    expect(r.clean[0]).toBe(FIRST_OWED);
    expect(praiseOverAFlooredFrame(tp, r)).toEqual([]);
  });

  it("EVERY floored frame resets (F3): a stop whose floored record runs over many frames is paid only 250 m after the last of them", () => {
    const tp = tape({ cruiseKmh: 30, endSec: 70, brakeAt: 12, decel: 9 });
    const r = run(tp);
    expect(r.flooredFrames.length).toBeGreaterThan(5);
    const first = r.flooredFrames[0]!;
    const last = r.flooredFrames[r.flooredFrames.length - 1]!;
    expect(last - first).toBeGreaterThan(0.1);
    expect(r.clean[0]).toBe(owedAfter(tp, last));
  });
});

describe("the payout waits while a causeless episode is accruing (F1)", () => {
  it("a 250 m that completes INSIDE the 0.4 s accrual before the first floored frame is not paid", () => {
    const tp = tape({ cruiseKmh: 30, endSec: 70, brakeAt: FIRST_OWED - 0.25, decel: 9 });
    const r = run(tp);
    const firstFloored = r.flooredFrames[0]!;
    // the window really did complete before the first floored frame
    const due = owed(tp)[0]!;
    expect(due).toBeLessThan(firstFloored);
    expect(r.accruing.some((a) => Math.abs(a - due) < 1e-9)).toBe(true);
    expect(r.clean.filter((c) => c < firstFloored)).toEqual([]);
    expect(praiseOverAFlooredFrame(tp, r)).toEqual([]);
  });

  it("CONTROL — a gentle causeless 4 m/s² brake never accrues and holds nothing: paid on the frame its 250 m completes, mid-brake", () => {
    const tp = tape({ cruiseKmh: 30, endSec: 70, brakeAt: FIRST_OWED - 0.25, decel: 4, toKmh: 10 });
    const r = run(tp);
    const due = owed(tp);
    expect(r.flooredFrames).toEqual([]);
    expect(r.accruing).toEqual([]);
    expect(r.clean).toEqual(due);
    // and the payout lands while the pedal is down
    const brakeEnd = FIRST_OWED - 0.25 + (30 - 10) / 3.6 / 4;
    expect(due[0]!).toBeGreaterThan(FIRST_OWED - 0.25);
    expect(due[0]!).toBeLessThan(brakeEnd);
  });

  it("CONTROL — a causeless stop at 6.99 m/s² (under the line) is not floored and keeps every payout to the frame", () => {
    const tp = tape({ cruiseKmh: 30, endSec: 70, brakeAt: FIRST_OWED - 0.25, decel: 6.99 });
    const r = run(tp);
    expect(r.flooredFrames).toEqual([]);
    expect(r.clean).toEqual(owed(tp));
  });

  it("CONTROL — a 9 m/s² stop WITH its cause seen (a stop line 10 m ahead) is not floored and keeps every payout to the frame", () => {
    const early = tape({ cruiseKmh: 30, endSec: 70, brakeAt: 12, decel: 9, cause: true });
    const late = tape({ cruiseKmh: 30, endSec: 70, brakeAt: FIRST_OWED - 0.25, decel: 9, cause: true });
    for (const tp of [early, late]) {
      const r = run(tp);
      expect(r.violations).toEqual([]);
      expect(r.flooredFrames).toEqual([]);
      expect(r.clean).toEqual(owed(tp));
    }
  });

  it("CONTROL — a 0.2 s 9 m/s² blip is never floored; a payout falling inside it waits only until the pedal is off (stated in frames), and one away from it is paid to the frame", () => {
    const away = tape({ cruiseKmh: 30, endSec: 70, brakeAt: 12, decel: 9, forSec: 0.2 });
    const ra = run(away);
    expect(ra.flooredFrames).toEqual([]);
    expect(ra.clean).toEqual(owed(away));

    const inside = tape({ cruiseKmh: 30, endSec: 70, brakeAt: FIRST_OWED - 0.1, decel: 9, forSec: 0.2 });
    const ri = run(inside);
    const due = owed(inside);
    expect(ri.flooredFrames).toEqual([]);
    expect(ri.clean.length).toBe(due.length);
    const lastAccruing = ri.accruing[ri.accruing.length - 1]!;
    // deferred to the first frame after the episode stops accruing: never more
    // than the blip (12 frames) plus the reading window (3 frames)
    expect(ri.clean[0]).toBeCloseTo(lastAccruing + H, 9);
    const deferFrames = Math.round((ri.clean[0]! - due[0]!) * 60);
    expect(deferFrames).toBeGreaterThan(0);
    expect(deferFrames).toBeLessThanOrEqual(15);
    expect(ri.clean.slice(1)).toEqual(due.slice(1));
  });
});

describe("what is NOT changed", () => {
  it("a 9 m/s² causeless stop from 50 км/ч (over the floor) is still billed once, and the bill resets the streak as before", () => {
    const tp = tape({ cruiseKmh: 50, endSec: 50, brakeAt: 8, decel: 9 });
    const r = run(tp);
    expect(r.violations.filter((v) => v.startsWith("HARSH_BRAKING_NO_CAUSE")).length).toBe(1);
    expect(r.flooredFrames).toEqual([]);
    expect(praiseOverAFlooredFrame(tp, r)).toEqual([]);
  });

  it("the floored stop bills nothing and scores nothing — no violation of any code", () => {
    const r = run(tape({ cruiseKmh: 30, endSec: 70, brakeAt: 12, decel: 9 }));
    expect(r.violations).toEqual([]);
  });

  it("the protected numbers: the 35 км/ч floor, 0.4 s, 7 m/s², 250 m", () => {
    expect(CFG.harshBrakeMinSpeedKmh).toBe(35);
    expect(CFG.harshBrakeSustainSec).toBe(0.4);
    expect(CFG.harshBrakeDecelMps2).toBe(7);
    expect(CFG.cleanDrivingDistanceM).toBe(250);
  });
});
