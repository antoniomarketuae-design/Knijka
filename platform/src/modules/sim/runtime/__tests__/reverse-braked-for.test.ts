/**
 * THE REVERSE-WARNING MEASUREMENT — `SimTick.reverseBrakedFor` (lane rbreverse,
 * sc-roundabout-entry:9e85f27e; founder ruling Q2 2026-10-19 «WARN ONLY»;
 * integrator rulings R1, R5 as revised, R5'' 2026-11-04 — which replaced R5').
 *
 * The tracker (`runtime/reverseBrakedFor.ts`) on hand-built account rows — a
 * traffic double, which the brief allows for the cases a live drive cannot stage
 * on demand — and the runtime's wiring of it (`createWorldRuntime().sample`).
 * The live drives are in `lessons/scenario/__tests__/rbreverse-ring-reverse.test.ts`.
 *
 *  §1 the bounds are the product's own numbers, mirrored and pinned;
 *  §2 the test, rule by rule (T4 signed speed, T5 the half-plane, T3 the
 *     growth (A), T6 the R interval and its baseline, R5'' (B) the vehicle
 *     that stopped for him and still stands — Risk 2, the nudge, the stale
 *     vehicle, the stopped bar's boundary);
 *  §3 the runtime publishes it once per sample: absent unwired, null or the
 *     vehicle when wired, and it moves nothing it reads.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWorldRuntime, parseDistrict, type District } from "..";
import {
  REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS,
  REVERSE_BRAKED_FOR_REVERSING_KMH,
  REVERSE_BRAKED_FOR_SHED_MPS,
  ReverseBrakedForTracker,
  type ShedAccountRow,
} from "../reverseBrakedFor";
import { ROUNDABOUT_FORCED_SHED_MPS } from "../worldRuntime";
import { HOLD_LIT_SPEED_MPS, STAGED_BRAKE_LAMP_MARGIN_MPS } from "../../traffic/staged";
import { OVERTAKE_BRAKED_SHED_MPS } from "../../orchestrator/runners";
import { REAR_CUE_REVERSING_KMH } from "../../hud/rearProximity";
import type { VehicleSample } from "../../contracts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A car facing north (0°) at the origin; «behind» is −y. */
type Car = { gear: number; speedKmh: number; x?: number; y?: number; headingDeg?: number };
/** `mps`: the vehicle's own speed; absent = 5 m/s, a vehicle on the move (not at rest — (B) is off). */
type Row = { id: number; kind?: "vehicle" | "cyclist"; x: number; y: number; shed: number; mps?: number };
const MOVING_MPS = 5;

/** Run the tracker over a scripted list of (car, rows) points; the value per point. */
function run(points: Array<{ car: Car; rows: Row[] }>) {
  const tr = new ReverseBrakedForTracker();
  return points.map(({ car, rows }) => {
    const accounts: ShedAccountRow[] = rows.map((r) => ({ id: r.id, kind: r.kind ?? "vehicle", x: r.x, y: r.y, playerShedMps: r.shed, speedMps: r.mps ?? MOVING_MPS }));
    return tr.step({ gear: car.gear, speedKmh: car.speedKmh, x: car.x ?? 0, y: car.y ?? 0, headingDeg: car.headingDeg ?? 0 }, () => accounts);
  });
}
const raised = (out: ReturnType<typeof run>) => out.map((v) => v !== null);
/** n identical points. */
const rep = (n: number, car: Car, rows: (i: number) => Row[]) => Array.from({ length: n }, (_, i) => ({ car, rows: rows(i) }));

describe("§1 · the bounds are existing product numbers (no new number), mirrored and pinned", () => {
  it("the braking line is the traffic model's 0.3 m/s — the brake lamp's margin, the roundabout's and the overtake's forced-braking line", () => {
    expect(REVERSE_BRAKED_FOR_SHED_MPS).toBe(STAGED_BRAKE_LAMP_MARGIN_MPS);
    expect(REVERSE_BRAKED_FOR_SHED_MPS).toBe(ROUNDABOUT_FORCED_SHED_MPS);
    expect(REVERSE_BRAKED_FOR_SHED_MPS).toBe(OVERTAKE_BRAKED_SHED_MPS);
    expect(REVERSE_BRAKED_FOR_SHED_MPS).toBe(0.3);
  });
  it("«reversing» is the rear badge's own −0.8 km/h", () => {
    expect(REVERSE_BRAKED_FOR_REVERSING_KMH).toBe(REAR_CUE_REVERSING_KMH);
    expect(REVERSE_BRAKED_FOR_REVERSING_KMH).toBe(-0.8);
  });
  it("a vehicle «at rest» is the traffic model's own stopped bar, at/below 0.5 m/s — staged.ts HOLD_LIT_SPEED_MPS, the bar both fleets light a standing car's brake lamps by (R5'' (B))", () => {
    expect(REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS).toBe(HOLD_LIT_SPEED_MPS);
    expect(REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS).toBe(0.5);
  });
});

describe("§2 · the test, rule by rule", () => {
  // A follower 6 m behind; its account grows 0.05 m/s per point from point `from`.
  const behind = (from: number) => (i: number): Row[] => [{ id: 7, x: 0, y: -6, shed: Math.max(0, i - from) * 0.05 }];

  it("the row's shape: in R, going back, a vehicle behind whose account grows ≥ 0.3 since the R interval began → raised from the point the growth reaches 0.3, with its id, kind and car-frame pose", () => {
    const out = run(rep(20, { gear: -1, speedKmh: -4.3 }, behind(0)));
    // growth 0.05·i: i = 6 is the first point at ≥ 0.3
    expect(raised(out).indexOf(true)).toBe(6);
    expect(out.slice(6).every((v) => v !== null)).toBe(true);
    expect(out[6]).toEqual({ vehicleId: 7, kind: "vehicle", fwdM: -6, leftM: -0 });
  });

  it("the kind is the row's (a cast rider is a cyclist) and the nearest qualifying vehicle is the one named", () => {
    const out = run(rep(10, { gear: -1, speedKmh: -3 }, (i) => [
      { id: 1, x: 3, y: -9, shed: i * 0.1 },
      { id: 2, kind: "cyclist", x: -2, y: -4, shed: i * 0.1 },
    ]));
    expect(out[9]).toMatchObject({ vehicleId: 2, kind: "cyclist", fwdM: -4, leftM: 2 });
  });

  it("T3 · a vehicle in the rear half-plane that is NOT braking for him (no growth) is never raised", () => {
    const out = run(rep(60, { gear: -1, speedKmh: -4.3 }, () => [{ id: 7, x: 1, y: -5, shed: 1.7 }]));
    expect(out.every((v) => v === null)).toBe(true);
  });

  it("T3 · growth just under the braking line (0.29) is not braking for him; the line itself is", () => {
    const at = (g: number) => run([{ car: { gear: -1, speedKmh: -3 }, rows: [{ id: 1, x: 0, y: -5, shed: 1 }] }, { car: { gear: -1, speedKmh: -3 }, rows: [{ id: 1, x: 0, y: -5, shed: 1 + g }] }])[1];
    expect(at(0.29)).toBeNull();
    expect(at(0.3125)).not.toBeNull();
  });

  it("T4 · signed speed: a car in R rolling FORWARD (+3 km/h) with a follower braking behind is not reversing — never raised", () => {
    const out = run(rep(30, { gear: -1, speedKmh: 3 }, behind(0)));
    expect(out.every((v) => v === null)).toBe(true);
    // …and the same car going back at the same speed IS (the positive control in this instance)
    expect(run(rep(30, { gear: -1, speedKmh: -3 }, behind(0))).some((v) => v !== null)).toBe(true);
  });

  it("T4 · not in R (D, N): no value however the car moves", () => {
    for (const gear of [1, 0]) {
      expect(run(rep(30, { gear, speedKmh: -3 }, behind(0))).every((v) => v === null)).toBe(true);
      expect(run(rep(30, { gear, speedKmh: 12 }, behind(0))).every((v) => v === null)).toBe(true);
    }
  });

  it("T5 · a vehicle AHEAD braking for a reversing car is never raised; the same vehicle behind is", () => {
    const ahead = run(rep(30, { gear: -1, speedKmh: -4 }, (i) => [{ id: 3, x: 0.5, y: 7, shed: i * 0.1 }]));
    expect(ahead.every((v) => v === null)).toBe(true);
    const beside = run(rep(30, { gear: -1, speedKmh: -4 }, (i) => [{ id: 3, x: 6, y: 0, shed: i * 0.1 }]));
    expect(beside.every((v) => v === null)).toBe(true); // fwd = 0 is not the rear half-plane
    const rear = run(rep(30, { gear: -1, speedKmh: -4 }, (i) => [{ id: 3, x: 0.5, y: -7, shed: i * 0.1 }]));
    expect(rear.some((v) => v !== null)).toBe(true);
    // the half-plane follows the car's heading, not the map: facing east, a car at −x is behind
    const east = run(rep(30, { gear: -1, speedKmh: -4, headingDeg: 90 }, (i) => [{ id: 3, x: -7, y: 0.5, shed: i * 0.1 }]));
    expect(east[29]).toMatchObject({ vehicleId: 3, fwdM: -7 });
  });

  it("no corridor width: the row's own geometry — 50°–75° off the rear axis, beside him on the ring — is behind", () => {
    const out = run(rep(10, { gear: -1, speedKmh: -4.3, headingDeg: 337.93, x: 15.289, y: -1.78 }, (i) => {
      const h = (337.93 * Math.PI) / 180;
      const [fx, fy] = [Math.sin(h), Math.cos(h)];
      // the first-growth pose measured on the row: fwd −5.34, left +6.36
      return [{ id: 1000, x: 15.289 - 5.34 * fx - 6.36 * fy, y: -1.78 - 5.34 * fy + 6.36 * fx, shed: i * 0.1 }];
    }));
    expect(out[9]?.fwdM).toBeCloseTo(-5.34, 6);
    expect(out[9]?.leftM).toBeCloseTo(6.36, 6);
  });

  it("T6 · dropped the point the car stops going back (v ≥ −0.8) and RE-RAISED inside the same R interval on a renewed reverse, the growth since the interval start still ≥ 0.3", () => {
    const pts = [
      ...rep(10, { gear: -1, speedKmh: -3 }, (i) => [{ id: 7, x: 0, y: -6, shed: i * 0.05 }]), // grows to 0.45
      ...rep(5, { gear: -1, speedKmh: -0.5 }, () => [{ id: 7, x: 0, y: -6, shed: 0.45 }]), // stopped in R
      ...rep(5, { gear: -1, speedKmh: -0.8 }, () => [{ id: 7, x: 0, y: -6, shed: 0.45 }]), // exactly −0.8: not reversing
      ...rep(5, { gear: -1, speedKmh: -2 }, () => [{ id: 7, x: 0, y: -6, shed: 0.45 }]), // renewed reverse, no new growth
    ];
    const r = raised(run(pts));
    expect(r.slice(6, 10).every(Boolean)).toBe(true);
    expect(r.slice(10, 20).some(Boolean)).toBe(false);
    expect(r.slice(20, 25).every(Boolean)).toBe(true);
  });

  it("T6 · NO MEMORY ACROSS R INTERVALS: after leaving R and moving, a new R interval with no new growth does not raise; new growth since it does", () => {
    const v = { id: 7, x: 0, y: -6 };
    const pts = [
      ...rep(10, { gear: -1, speedKmh: -3 }, (i) => [{ ...v, shed: i * 0.05 }]), // raised (0.45)
      ...rep(5, { gear: 1, speedKmh: 4 }, () => [{ ...v, shed: 0.45 }]), // D, driving forward (the standstill is broken)
      ...rep(3, { gear: 1, speedKmh: 0 }, () => [{ ...v, shed: 0.45 }]), // a new standstill
      ...rep(10, { gear: -1, speedKmh: -3 }, () => [{ ...v, shed: 0.45 }]), // a new R interval, no new growth
      ...rep(10, { gear: -1, speedKmh: -3 }, (i) => [{ ...v, shed: 0.45 + (i + 1) * 0.05 }]), // new growth: 0.3 at i = 5
    ];
    const r = raised(run(pts));
    expect(r.slice(6, 10).every(Boolean)).toBe(true);
    expect(r.slice(10, 28).some(Boolean)).toBe(false);
    expect(r.slice(28, 33).some(Boolean)).toBe(false);
    expect(r.slice(33, 38).every(Boolean)).toBe(true);
  });

  // ── R5'' (B): it stopped for him (account ≥ 0.3 over the drive) and is AT REST NOW ──────────────────────────────
  // The vehicle decelerates to 0 while it sheds its account for the standing car (speed 2.9 − shed).
  const stopsFor = (i: number) => ({ shed: Math.min(2.9, i * 0.1), mps: Math.max(0, 2.9 - i * 0.1) });

  it("R5'' (B) · THE STANDING CAR (Risk 2): a vehicle that stopped for him WHILE HE STOOD (in D) and still stands raises once he reverses toward it — no growth inside the R interval is needed", () => {
    const pts = [
      ...rep(3, { gear: 1, speedKmh: 8 }, () => [{ id: 1000, x: 3, y: -12, shed: 0 }]), // arriving
      ...rep(40, { gear: 1, speedKmh: 0 }, (i) => [{ id: 1000, x: 1, y: -3.2, ...stopsFor(i) }]), // standing in D; it sheds 2.9 for him and stops
      ...rep(3, { gear: -1, speedKmh: 0 }, () => [{ id: 1000, x: 1, y: -3.2, shed: 2.9, mps: 0 }]), // R at rest
      ...rep(10, { gear: -1, speedKmh: -3 }, () => [{ id: 1000, x: 1, y: -3.2, shed: 2.9, mps: 0 }]), // reversing toward it
    ];
    const r = raised(run(pts));
    expect(r.slice(0, 46).some(Boolean)).toBe(false);
    expect(r.slice(46).every(Boolean)).toBe(true);
  });

  it("R5'' (B) · THE NUDGE (the round-2 verifier's V4): the vehicle stops for the halted car, the car creeps FORWARD and stops again, then reverses — still raised (R5''s standstill baseline restarted after the nudge and went silent)", () => {
    const v = { id: 1000, x: 0.8, y: -6.3 };
    const pts = [
      ...rep(40, { gear: 1, speedKmh: 0 }, (i) => [{ ...v, ...stopsFor(i) }]), // halted; it sheds 2.9 for him and stops 6.3 m behind
      ...rep(60, { gear: 1, speedKmh: 1.2 }, () => [{ ...v, shed: 2.9, mps: 0 }]), // a forward nudge ≈ 0.3 m
      ...rep(30, { gear: 1, speedKmh: 0 }, (i) => [{ ...v, shed: 2.9 + Math.min(0.1, i * 0.01), mps: 0 }]), // stopped again (0.1 more: under the line)
      ...rep(10, { gear: -1, speedKmh: 0 }, () => [{ ...v, shed: 3.0, mps: 0 }]), // R at rest
      ...rep(30, { gear: -1, speedKmh: -4.3 }, () => [{ ...v, shed: 3.0, mps: 0 }]), // and back toward it
    ];
    const r = raised(run(pts));
    expect(r.slice(0, 140).some(Boolean)).toBe(false);
    expect(r.slice(140).every(Boolean)).toBe(true);
  });

  it("R5'' · THE STALE VEHICLE (the round-2 verifier's E1): it shed 4 m/s for the standing car, then drove off and is 85 m behind, leaving — NOT raised; the same vehicle still standing there is (positive control)", () => {
    const H = 1 / 60;
    const once = (drivesOff: boolean) => {
      const tr = new ReverseBrakedForTracker();
      const veh = { id: 7, kind: "vehicle" as const, x: 10, y: 3, playerShedMps: 0, speedMps: 4 };
      const q = () => [veh];
      const car = { gear: 1, speedKmh: 0, x: 0, y: 0, headingDeg: 0 };
      // t 0..20 s: he stands in D; the vehicle crosses ahead braking for him (account 0 → 4 m/s) and stops
      for (let i = 0; i < 1200; i++) {
        veh.playerShedMps = Math.min(4, i * 0.01);
        veh.speedMps = Math.max(0, 4 - i * 0.01);
        veh.x = 10 - Math.min(400, i) * 0.01;
        tr.step(car, q);
      }
      // t 20..50 s: it drives away round behind him to y ≈ −87 at 3 m/s, its account flat — or stays
      for (let i = 0; i < 1800; i++) {
        if (drivesOff) {
          veh.speedMps = 3;
          veh.y = 3 - i * 0.05;
        }
        tr.step(car, q);
      }
      car.gear = -1;
      let raisedN = 0;
      let reversing = 0;
      for (let i = 0; i < 120; i++) {
        car.speedKmh = i < 10 ? 0 : -3;
        car.y += (car.speedKmh / 3.6) * H;
        if (car.speedKmh < -0.8) reversing++;
        if (tr.step(car, q)) raisedN++;
      }
      return { raisedN, reversing, fwd: veh.y - car.y };
    };
    const stale = once(true);
    expect(stale.fwd).toBeLessThan(-80);
    expect(stale.reversing).toBe(110);
    expect(stale.raisedN).toBe(0);
    // positive control: a vehicle that stopped for him and still stands, behind him (fwd −4)
    const standing = (() => {
      const tr = new ReverseBrakedForTracker();
      const veh = { id: 7, kind: "vehicle" as const, x: 6, y: -4, playerShedMps: 4, speedMps: 0 };
      let n = 0;
      for (let i = 0; i < 120; i++) if (tr.step({ gear: -1, speedKmh: i < 10 ? 0 : -3, x: 0, y: -i * 0.01, headingDeg: 0 }, () => [veh])) n++;
      return n;
    })();
    expect(standing).toBe(110);
  });

  it("R5'' (B) · the stopped bar's boundary: a vehicle at 0.5 m/s IS at rest (HOLD_LIT_SPEED_MPS, «at/below»); at 0.515625 m/s it is moving and, with no growth in this R interval, not raised", () => {
    const at = (mps: number) => run(rep(5, { gear: -1, speedKmh: -3 }, () => [{ id: 3, x: 0.4, y: -5, shed: 2.0, mps }]));
    expect(raised(at(0.5))).toEqual([true, true, true, true, true]);
    expect(raised(at(0.25))).toEqual([true, true, true, true, true]);
    expect(raised(at(0.515625)).some(Boolean)).toBe(false);
    expect(raised(at(0.8)).some(Boolean)).toBe(false);
  });

  it("R5'' (B) · the account must have reached the braking line over the drive: at rest with 0.29 m/s shed for him is not raised, with 0.3125 it is; a parked body at rest with no account never is", () => {
    const at = (shed: number) => run(rep(5, { gear: -1, speedKmh: -3 }, () => [{ id: 3, x: 0.4, y: -5, shed, mps: 0 }]));
    expect(raised(at(0.29)).some(Boolean)).toBe(false);
    expect(raised(at(0.3125)).every(Boolean)).toBe(true);
    expect(raised(at(0)).some(Boolean)).toBe(false);
  });

  it("R5'' · (B) is the vehicle's state NOW, (A) the R interval's growth: at rest through R → N → R a standing vehicle that stopped for him still raises; a MOVING one with no new growth in the new interval does not", () => {
    const v = { id: 7, x: 0, y: -6 };
    const seq = (mps: number) => [
      ...rep(10, { gear: -1, speedKmh: 0 }, (i) => [{ ...v, shed: i * 0.05, mps }]), // R at rest; it sheds 0.45 for the standing car
      ...rep(5, { gear: 0, speedKmh: 0 }, () => [{ ...v, shed: 0.45, mps }]), // N
      ...rep(2, { gear: -1, speedKmh: 0 }, () => [{ ...v, shed: 0.45, mps }]), // R again, at rest
      ...rep(5, { gear: -1, speedKmh: -2 }, () => [{ ...v, shed: 0.45, mps }]), // and back
    ];
    const standing = raised(run(seq(0)));
    expect(standing.slice(0, 17).some(Boolean)).toBe(false);
    expect(standing.slice(17).every(Boolean)).toBe(true);
    expect(raised(run(seq(MOVING_MPS))).some(Boolean)).toBe(false);
  });

  it("a vehicle that appears after the baseline counts its whole account (agents start at 0); a static or parked body (account 0) never raises", () => {
    const late = run([
      ...rep(3, { gear: -1, speedKmh: -2 }, () => []),
      ...rep(3, { gear: -1, speedKmh: -2 }, () => [{ id: 44, x: 0, y: -8, shed: 0.5 }]),
    ]);
    expect(raised(late)).toEqual([false, false, false, true, true, true]);
    const parked = run(rep(40, { gear: -1, speedKmh: -3 }, () => [{ id: 5, x: 0.3, y: -2, shed: 0 }]));
    expect(parked.every((v) => v === null)).toBe(true);
  });
});

// ─── §2b the landing's pins (gate rb, 2026-11-04) ──────────────────────────────
// R5''' (integrator ruling at the landing, the r3 verifier's V3-risk2-tail) and the r3 verifier's surviving mutants
// V3M3 (its probe E5) and V3M9, each pinned on the pure tracker.

describe("§2b · R5''' and the r3 verifier's survivors, pinned at the landing", () => {
  // as §2's: the vehicle decelerates to 0 while it sheds its account for the standing car
  const stopsFor = (i: number) => ({ shed: Math.min(2.9, i * 0.1), mps: Math.max(0, 2.9 - i * 0.1) });

  it("R5''' · RISK 2's TAIL: a vehicle that stopped for him and stood at rest in THIS R interval keeps the warning while it moves off beside-behind him (0.56 m/s, no growth in R) — up to the last point", () => {
    // He stands in D; it sheds 2.9 m/s for him and stops 3.2 m behind. R at rest, then back toward it; on the last
    // 12 points it starts moving off at 0.56 m/s (over the stopped bar), still in his rear half-plane.
    const v = { id: 1000, x: 1.17, y: -3.2 };
    const pts = [
      ...rep(40, { gear: 1, speedKmh: 0 }, (i) => [{ ...v, ...stopsFor(i) }]),
      ...rep(5, { gear: -1, speedKmh: 0 }, () => [{ ...v, shed: 2.9, mps: 0 }]),
      ...rep(30, { gear: -1, speedKmh: -3 }, () => [{ ...v, shed: 2.9, mps: 0 }]),
      ...rep(12, { gear: -1, speedKmh: -3 }, () => [{ ...v, y: -0.33, shed: 2.9, mps: 0.56 }]),
    ];
    const r = raised(run(pts));
    expect(r.slice(0, 45).some(Boolean)).toBe(false);
    expect(r.slice(45, 75).every(Boolean)).toBe(true);
    // the tail: moving (0.56 > 0.5), no (A) growth in R — still raised because it stood at rest in this interval
    expect(r.slice(75)).toEqual(Array(12).fill(true));
  });

  it("R5''' · the «seen at rest» set lives as long as the R interval: a vehicle that stood for him in an EARLIER R interval and is moving now does not raise in a new one; one that never stood in this interval, with no (A) growth, never does", () => {
    const v = { id: 7, x: 0.5, y: -6 };
    const pts = [
      ...rep(10, { gear: -1, speedKmh: 0 }, () => [{ ...v, shed: 1.2, mps: 0 }]), // R at rest; it stands (account 1.2 for him)
      ...rep(5, { gear: 1, speedKmh: 0 }, () => [{ ...v, shed: 1.2, mps: 0 }]), // D: the interval ends
      ...rep(5, { gear: 1, speedKmh: 0 }, () => [{ ...v, shed: 1.2, mps: 2 }]), // it moves off
      ...rep(20, { gear: -1, speedKmh: -3 }, () => [{ ...v, shed: 1.2, mps: 2 }]), // a new R interval, reversing; it is moving
    ];
    const r = raised(run(pts));
    expect(r.slice(20).some(Boolean)).toBe(false);
    // the same last interval with the vehicle never at rest anywhere: silent too
    const never = raised(run(rep(30, { gear: -1, speedKmh: -3 }, () => [{ ...v, shed: 1.2, mps: 0.56 }])));
    expect(never.some(Boolean)).toBe(false);
  });

  it("R5''' · the STALE vehicle (E1) stays silent: it stood for him only BEFORE R and drove off; it is never at rest inside the R interval", () => {
    const tr = new ReverseBrakedForTracker();
    const veh = { id: 7, kind: "vehicle" as const, x: 2, y: -4, playerShedMps: 0, speedMps: 4 };
    const q = () => [veh];
    const car = { gear: 1, speedKmh: 0, x: 0, y: 0, headingDeg: 0 };
    for (let i = 0; i < 400; i++) {
      veh.playerShedMps = Math.min(4, i * 0.01);
      veh.speedMps = Math.max(0, 4 - i * 0.01);
      tr.step(car, q); // stops for him and stands
    }
    for (let i = 0; i < 300; i++) {
      veh.speedMps = 3;
      veh.y -= 0.05;
      tr.step(car, q); // drives off behind him
    }
    car.gear = -1;
    let n = 0;
    for (let i = 0; i < 120; i++) {
      car.speedKmh = i < 10 ? 0 : -3;
      if (tr.step(car, q)) n++;
    }
    expect(veh.y).toBeLessThan(-15);
    expect(n).toBe(0);
  });

  it("V3M3 (the r3 verifier's probe E5) · (A)'s baseline is the R interval's START, not its first reversing point: in R at rest a vehicle behind slows 3 → 2.5 m/s for him (still moving); then he reverses — raised on every point", () => {
    const tr = new ReverseBrakedForTracker();
    const veh = { id: 9, kind: "vehicle" as const, x: 3, y: -9, playerShedMps: 0, speedMps: 3 };
    const q = () => [veh];
    const car = { gear: -1, speedKmh: 0, x: 0, y: 0, headingDeg: 0 };
    for (let i = 0; i < 120; i++) {
      if (i >= 30 && i < 80) {
        veh.playerShedMps += 0.01;
        veh.speedMps -= 0.01;
      }
      tr.step(car, q);
    }
    expect(veh.speedMps).toBeGreaterThan(REVERSE_BRAKED_FOR_VEHICLE_STOPPED_MPS); // never at rest: (B) cannot carry it
    car.speedKmh = -3;
    let n = 0;
    for (let i = 0; i < 60; i++) if (tr.step(car, q)) n++;
    expect(n).toBe(60);
  });

  it("V3M9 · two qualifying vehicles: the NEAREST BY DISTANCE is named, not the one nearest along the car's axis", () => {
    // A: 3 m back, 8 m to the side (distance 8.54); B: 6 m straight back (distance 6). Both braking for him.
    const out = run(rep(10, { gear: -1, speedKmh: -3 }, (i) => [
      { id: 1, x: -8, y: -3, shed: i * 0.1 },
      { id: 2, x: 0, y: -6, shed: i * 0.1 },
    ]));
    expect(out[9]).toMatchObject({ vehicleId: 2, fwdM: -6 });
  });
});

// ─── §3 the runtime ────────────────────────────────────────────────────────────

function district(): District {
  return parseDistrict(JSON.parse(readFileSync(path.resolve(HERE, "../../../../../../content/world/rb-mini-v1.json"), "utf-8")));
}
function sample(speedKmh: number, gear: number, y: number): VehicleSample {
  return { position: { x: 4.06, y }, headingDeg: 0, speedKmh, indicator: "off", headlights: "off", seatbeltOn: true, handbrakeOn: false, gear, mirrorGlance: null };
}

describe("§3 · the runtime publishes it once per sample, display-only", () => {
  it("ABSENT on every tick when no account query is wired («cannot answer», never «nobody»)", () => {
    const rt = createWorldRuntime(district());
    for (let i = 0; i < 20; i++) {
      const tick = rt.sample(sample(-3, -1, -40 - i * 0.05), i / 60, false);
      expect("reverseBrakedFor" in tick).toBe(false);
    }
  });

  it("wired: null while nobody qualifies, the vehicle while one does — and the query's rows are only read", () => {
    const rt = createWorldRuntime(district());
    let shed = 0;
    const rows: ShedAccountRow[] = [{ id: 12, kind: "vehicle", x: 4.06, y: -48, playerShedMps: 0, speedMps: 5 }];
    let calls = 0;
    rt.setPlayerShedAccountsQuery(() => {
      calls++;
      (rows[0] as { playerShedMps: number }).playerShedMps = shed;
      return rows;
    });
    const seen: Array<unknown> = [];
    for (let i = 0; i < 30; i++) {
      if (i >= 10) shed += 1 / 32; // exact in binary: 9 points = 0.28125, 10 = 0.3125
      const tick = rt.sample(sample(i < 5 ? 0 : -3, i < 3 ? 1 : -1, -40 - i * 0.05), i / 60, false);
      expect("reverseBrakedFor" in tick).toBe(true);
      seen.push(tick.reverseBrakedFor);
    }
    expect(calls).toBeGreaterThan(0);
    const firstRaised = seen.findIndex((v) => v !== null);
    // growth 1/32 per point from i = 10: ≥ 0.3 first at i = 19
    expect(firstRaised).toBe(19);
    expect(seen.slice(0, 19).every((v) => v === null)).toBe(true);
    expect(seen[29]).toMatchObject({ vehicleId: 12, kind: "vehicle" });
    expect(rows[0].playerShedMps).toBeCloseTo(shed, 12);
  });
});
