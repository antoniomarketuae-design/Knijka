/**
 * ROUND 7 OF LANE flooredinvite (2026-11-03 · `sc-follow-tailgater:63c0c28c`;
 * the integrator's Q10f under the founder's 2026-10-19 delegation of QUESTIONS
 * 4 and 10). THE FACT is Q10b's: a cause later than the sustain after the open
 * application's last credit CHANGES NOTHING about that brake check — the drive
 * behaves exactly as its no-cause control (records and praise), and the bills
 * never move against base (Q10e).
 *
 * The round-6 verifier's zzV7Split: the late cause leaves reach while the pedal
 * is still down (the sticky cause holds to the release), the student releases
 * for less than the sustain and presses again. In the control that press joins
 * the SAME chain (the release arm closes a chain only once its release has
 * stood the sustain). Round 6 closed the chain on the fold frame, so the press
 * opened a SECOND chain: [pumped, floored] or [floored, floored] for one brake
 * check, a pumped record named beside the HARSH_BRAKING_NO_CAUSE bill of the
 * same brake check, a CLEAN_DRIVING paid a second early. Fix S keeps the chain
 * open (`chainFoldHeld`) until the folded application releases, then runs the
 * bridge as the control does; a folded floor stays live (`chainFoldFloorLive`).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG, type SimTick, type SimTickEvent } from "../types";
import { createRuleEngine, lastUnbilledHardBrake, reduceTick, unbilledHardBrakeOfChain, type UnbilledHardBrake } from "../engine";
import { splitTape, type SplitShape } from "./round3Tapes";

const SUS = DEFAULT_RULE_CONFIG.harshBrakeSustainSec;
const H = 1 / 60;
const SUS_GP = Math.round(SUS / H);

interface Run {
  clean: number[];
  violations: string[];
  records: UnbilledHardBrake[];
  credited: number[];
  pumped: number[];
  floored: number[];
}

function run(ticks: SimTick[]): Run {
  let s = createRuleEngine({});
  const out: Run = { clean: [], violations: [], records: [], credited: [], pumped: [], floored: [] };
  for (const f of ticks) {
    const seq = s.harshBrake.recordSeq;
    const r = reduceTick(s, f);
    s = r.state;
    for (const e of r.events) {
      if (e.kind === "commendation" && e.code === "CLEAN_DRIVING") out.clean.push(e.t);
      if (e.kind === "violation") out.violations.push(`${e.code}@${e.t.toFixed(3)}`);
    }
    const hb = s.harshBrake;
    if (hb.activeSince !== null && hb.lastQualAt === f.t) out.credited.push(f.t);
    if (hb.appPumpedAt === f.t) out.pumped.push(f.t);
    if (hb.flooredAt === f.t) out.floored.push(f.t);
    if (hb.recordSeq !== seq) out.records.push(lastUnbilledHardBrake(hb)!);
  }
  // the drive's end closes a chain still open (lessons/engine.ts buildLessonResult)
  if (s.harshBrake.chainOpen) {
    const rec = unbilledHardBrakeOfChain(s.harshBrake, s.config, true);
    if (rec !== null) out.records.push(rec);
  }
  return out;
}

const shown = (r: Run) =>
  r.records.map((x) => ({ form: x.form, onsetKmh: x.onsetKmh, shownKmh: x.shownKmh, sinceSec: x.sinceSec, atSec: x.atSec }));

const report = (speedMps: number): SimTickEvent => ({
  kind: "followerBraked",
  vehicleId: 7,
  decelMps2: 9,
  heldSec: 0.45,
  qualifiedSec: 0.45,
  shedMps: 4,
  speedMps,
  gapM: 4,
});
const reportAt = (ticks: SimTick[], index: number, speedMps: number): SimTick[] =>
  ticks.map((k, i) => (i === index ? { ...k, events: [...(k.events ?? []), report(speedMps)] } : k));

type Base = Omit<SplitShape, "R" | "t0" | "kind" | "cs" | "cd">;
const SHAPES: Record<"FF" | "PF" | "PB" | "PG", Base> = {
  // a single floored application from 34 км/ч; a firm second application that floors
  FF: { cruise: 34, b1: 0, g: 0, T2: 0.45, aT: -2.2, tail: 0.6, a2: -8.5, P: 0.5 },
  // a pump from 50 км/ч (over the floor); the second application floors (its onset under 35)
  PF: { cruise: 50, b1: 0.25, g: 0.1, T2: 0.3, aT: -2.5, tail: 0.6, a2: -9, P: 0.5 },
  // a pump from 60 км/ч; the second application bills (its onset at or over 35)
  PB: { cruise: 60, b1: 0.25, g: 0.1, T2: 0.3, aT: -2.5, tail: 0.6, a2: -9, P: 0.5 },
  // a pump from 60 км/ч; a gentle second application (the same record either way)
  PG: { cruise: 60, b1: 0.25, g: 0.1, T2: 0.3, aT: -2.5, tail: 0.6, a2: -3, P: 0.8 },
};
/** What the control gives each shape — ONE record (or the bill) for ONE brake check. */
const EXPECT: Record<keyof typeof SHAPES, { short: string[]; long: string[]; bills: number }> = {
  FF: { short: ["floored"], long: ["floored"], bills: 0 },
  PF: { short: ["floored"], long: ["pumped"], bills: 0 },
  PB: { short: [], long: [], bills: 1 },
  PG: { short: ["pumped"], long: ["pumped"], bills: 0 },
};

function cells(long: boolean): Array<{ name: keyof typeof SHAPES; o: SplitShape }> {
  const out: Array<{ name: keyof typeof SHAPES; o: SplitShape }> = [];
  for (const name of Object.keys(SHAPES) as Array<keyof typeof SHAPES>)
    for (const kind of ["lane", "junction"] as const)
      for (const R of [0.05, 0.1, 0.2, 0.3])
        for (const cs of [0.45, 0.5])
          for (let k = 0; k < 3; k++) {
            const sh = SHAPES[name];
            const o: SplitShape = long
              ? { ...sh, ...(name === "PB" || name === "PG" ? { cruise: 80 } : {}), tail: 2.0, R, cs: cs + 0.05, cd: 1.0, t0: 22.7 + k * 0.05, kind }
              : { ...sh, R, cs, cd: 0.08, t0: 22.7 + k * 0.05, kind };
            out.push({ name, o });
          }
  return out;
}

function lateGapGp(r: Run, o: SplitShape): number {
  const causeT = o.t0 + o.b1 + o.g + o.T2 + o.cs;
  const last = r.credited.filter((c) => c <= causeT + 1e-9).pop()!;
  return Math.round((causeT - last) / H);
}

describe("Q10f — Fix S: a late-cause fold keeps the chain open until the folded application releases; a short release and a re-press join the SAME chain, as in the no-cause control", () => {
  for (const long of [false, true]) {
    it(`${long ? "the long variant (a 2 s tail, a 1 s cause)" : "the short cells (a 0.08 s cause inside the tail)"}: 192 cells — the control's ONE record (form, onset, shown, since, at), its bills and its CLEAN_DRIVING`, () => {
      let n = 0;
      for (const { name, o } of cells(long)) {
        const label = `${name} ${o.kind} R ${o.R} cs ${o.cs} t0 ${o.t0.toFixed(2)}${long ? " long" : ""}`;
        const r = run(splitTape(o, true));
        const c = run(splitTape(o, false));
        // a LATE cause (at least the sustain after the last credit), and a release shorter than the sustain
        expect(lateGapGp(r, o), label).toBeGreaterThanOrEqual(SUS_GP);
        expect(o.R, label).toBeLessThan(SUS);
        expect(shown(r), `${label}: the control's record`).toEqual(shown(c));
        expect(r.records.map((x) => x.form), label).toEqual(long ? EXPECT[name].long : EXPECT[name].short);
        expect(r.violations, label).toEqual(c.violations);
        expect(r.violations.filter((v) => v.startsWith("HARSH_BRAKING_NO_CAUSE")).length, label).toBe(EXPECT[name].bills);
        expect(r.clean, `${label}: the praise`).toEqual(c.clean);
        n += 1;
      }
      expect(n).toBe(192);
    });
  }

  it("a close follower's report during the short release, while the folded floor is live: the record follows the control (dropped where the control's floor-lift bills it), and nothing is billed (Q10e)", () => {
    let dropped = 0;
    let n = 0;
    for (const kind of ["lane", "junction"] as const)
      for (const R of [0.15, 0.2, 0.3])
        for (let k = 0; k < 3; k++) {
          const o: SplitShape = { ...SHAPES.FF, R, cs: 0.45, cd: 0.08, t0: 22.7 + k * 0.05, kind };
          const label = `FF ${kind} R ${R} t0 ${o.t0.toFixed(2)}`;
          const ri = Math.round((o.t0 + o.b1 + o.g + o.T2 + o.tail) / H) + 3; // three grid points into the release
          const r = run(reportAt(splitTape(o, true), ri, 8.3));
          const c = run(reportAt(splitTape(o, false), ri, 8.3));
          expect(r.violations, label).toEqual([]);
          if (c.violations.length > 0) {
            expect(r.records, `${label}: the control bills the floor and names nothing`).toEqual([]);
            dropped += 1;
          } else expect(shown(r), label).toEqual(shown(c));
          n += 1;
        }
    expect(n).toBe(18);
    expect(dropped, "non-vacuous: the live folded floor's drop in the release").toBeGreaterThanOrEqual(6);
  });

  it("a close follower's report while the folded application is still held (pedal down, after the fold): dropped as the control's floor-lift bills it, nothing billed here (Q10e)", () => {
    let dropped = 0;
    for (const kind of ["lane", "junction"] as const)
      for (let k = 0; k < 3; k++) {
        const o: SplitShape = { ...SHAPES.FF, R: 0.2, cs: 0.45, cd: 0.08, t0: 22.7 + k * 0.05, kind };
        const label = `FF ${kind} t0 ${o.t0.toFixed(2)}`;
        const ri = Math.round((o.t0 + o.b1 + o.g + o.T2 + o.cs) / H) + 4; // after the fold, before the release
        const r = run(reportAt(splitTape(o, true), ri, 8.3));
        const c = run(reportAt(splitTape(o, false), ri, 8.3));
        expect(r.violations, label).toEqual([]);
        expect(c.violations.length, `${label}: the control bills`).toBe(1);
        expect(r.records, label).toEqual([]);
        dropped += 1;
      }
    expect(dropped).toBe(6);
  });
  it("a release of the sustain or longer after the folded application closes the chain as the control's release does: a later firm brake is a SECOND brake check with its own record, as in the control", () => {
    let n = 0;
    for (const kind of ["lane", "junction"] as const)
      for (const R of [0.45, 0.6])
        for (let k = 0; k < 3; k++) {
          const o: SplitShape = { ...SHAPES.FF, R, cs: 0.45, cd: 0.08, t0: 22.7 + k * 0.05, kind };
          const label = `FF ${kind} R ${R} t0 ${o.t0.toFixed(2)}`;
          const r = run(splitTape(o, true));
          const c = run(splitTape(o, false));
          expect(lateGapGp(r, o), label).toBeGreaterThanOrEqual(SUS_GP);
          expect(c.records.map((x) => x.form), `${label}: the control's two brake checks`).toEqual(["floored", "floored"]);
          expect(shown(r), label).toEqual(shown(c));
          expect(r.violations, label).toEqual(c.violations);
          expect(r.clean, label).toEqual(c.clean);
          n += 1;
        }
    expect(n).toBe(12);
  });

  it("a causeless re-press inside the bridge spends the live folded floor, as the control's new window spends its floor: a close follower's report after it does not drop the record", () => {
    let n = 0;
    for (const kind of ["lane", "junction"] as const)
      for (const R of [0.1, 0.2])
        for (let k = 0; k < 3; k++) {
          const o: SplitShape = { ...SHAPES.FF, a2: -3, P: 0.3, R, cs: 0.45, cd: 0.08, t0: 22.7 + k * 0.05, kind };
          const label = `FF gentle re-press ${kind} R ${R} t0 ${o.t0.toFixed(2)}`;
          const ri = Math.round((o.t0 + o.b1 + o.g + o.T2 + o.tail + o.R + o.P) / H) + 3; // three grid points after the re-press releases
          const r = run(reportAt(splitTape(o, true), ri, 10));
          const c = run(reportAt(splitTape(o, false), ri, 10));
          expect(lateGapGp(r, o), label).toBeGreaterThanOrEqual(SUS_GP);
          expect(c.violations, `${label}: the control's floor is spent — not billed`).toEqual([]);
          expect(r.violations, label).toEqual([]);
          expect(c.records.map((x) => x.form), label).toEqual(["floored"]);
          expect(shown(r), label).toEqual(shown(c));
          // non-vacuous: the report lies inside the floor-lift's window of that floor
          expect(ri * H, label).toBeLessThanOrEqual(c.records[0]!.atSec + 10 / 7 + 1e-9);
          n += 1;
        }
    expect(n).toBe(12);
  });
});
