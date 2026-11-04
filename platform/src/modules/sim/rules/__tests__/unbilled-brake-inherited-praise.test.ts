/**
 * INTEGRATION OF LANE flooredinvite (2026-11-03 · `sc-follow-tailgater:63c0c28c`;
 * the integrator's ruling Q10h on the round-7 verifier's condition C1).
 *
 * THE CLASS. INHERITED_BASE_PRAISE_NO_RECORD — 879 of the builder's 10,000
 * fuzz seeds, 521 of the verifier's 10,878 runs: a drive whose brake check is
 * BILLED HARSH (`HARSH_BRAKING_NO_CAUSE`) on its no-cause control, with a late
 * cause pulse (lane excursion / junction / stop line / wrong way) more than the
 * sustain after the open application's last credit. Neither drive carries an
 * unbilled-brake record and the bills are equal, but a later CLEAN_DRIVING
 * differs by 0.02–0.48 s between the late drive and its control.
 *
 * THE RULING (Q10h). That difference is BASE's own: base's
 * `billedAndUncorrected` accrual depends on the cause, and the lane's tree pays
 * on the late drive exactly what base pays on it, and on the control exactly
 * what base pays on the control. Making the late drive match the control would
 * move a no-record payout against base, which the standing rule (bills and
 * praise never move against base without a record) forbids. ACCEPTED as
 * inherited — so this file pins it: on these drives the tree's records are
 * empty, its bills are base's, and its CLEAN_DRIVING times are BASE's (the
 * numbers below are the base engine's, measured by the round-7 verifier's
 * differential fuzz `zzV8Fuzz`, probes/r7/v8fuzz-a.json and v8fuzz-b.json,
 * first three payouts as the fuzz recorded them). A change that moves either
 * drive's praise off base's turns this red; it would need its own lane and a
 * founder ruling.
 *
 * The tape is the fuzz's own (`baseTape`, wobble 0): from `cruise`, at `t0` a
 * run of pedal segments, then back up to the cruise at +2 m/s², posted 100.
 */
import { describe, expect, it } from "vitest";
import type { SimTick, SimTickEvent } from "../types";
import { createRuleEngine, lastUnbilledHardBrake, reduceTick, unbilledHardBrakeOfChain } from "../engine";
import { tick } from "./fixtures";

const H = 1 / 60;

interface Cell {
  seed: number;
  cruise: number;
  t0: number;
  segs: Array<{ d: number; a: number }>;
  endSec: number;
  kind: "lane" | "junction" | "stopline" | "wrongway";
  pulses: Array<[number, number]>;
  reps: Array<[number, number]>;
  /** Base's bills — on the late drive AND its control (equal by the class). */
  viol: string[];
  /** Base's first three CLEAN_DRIVING times on the late-cause drive. */
  baseLate: number[];
  /** Base's first three CLEAN_DRIVING times on the no-cause control. */
  baseCtl: number[];
  treeRecs: string[];
  ctlRecs: string[];
}

const CELLS: Cell[] = [
  {"seed":100040,"cruise":48.76,"t0":12.3,"segs":[{"d":0.15,"a":-7.578774896787945},{"d":0.08333333333333333,"a":-4.729874256439507},{"d":0.31666666666666665,"a":-7.821262851194478},{"d":0.1,"a":-6.207908801175654},{"d":0.9833333333333333,"a":-5.434541250579059},{"d":0.3333333333333333,"a":0}],"endSec":35.03253813746075,"kind":"junction","pulses":[[837,2],[867,40],[803,10]],"reps":[],"viol":["HARSH_BRAKING_NO_CAUSE@12.8167"],"baseLate":[34.233333],"baseCtl":[34.45],"treeRecs":[],"ctlRecs":[]},
  {"seed":100200,"cruise":48.64,"t0":12.45,"segs":[{"d":0.25,"a":-7.199205986678135},{"d":0.1,"a":0},{"d":0.7166666666666667,"a":-8.138678891421296},{"d":1.5333333333333332,"a":-3.2030006170738488},{"d":0.65,"a":0}],"endSec":37.408613357041034,"kind":"stopline","pulses":[[855,8]],"reps":[],"viol":["HARSH_BRAKING_NO_CAUSE@13.2167"],"baseLate":[36.983333],"baseCtl":[37.1],"treeRecs":[],"ctlRecs":[]},
  {"seed":103026,"cruise":78.47,"t0":13.983333333333333,"segs":[{"d":0.11666666666666667,"a":-7.29767968567321},{"d":0.23333333333333334,"a":0},{"d":0.6833333333333333,"a":-10.197727558098268},{"d":1.25,"a":-6.043986611627043},{"d":0.5166666666666666,"a":0}],"endSec":41.729354205199826,"kind":"wrongway","pulses":[[956,83]],"reps":[[1126,7.013032989576459],[1020,4.546307038515806],[1080,10.07764128409326]],"viol":["HARSH_BRAKING_NO_CAUSE@14.7500"],"baseLate":[11.483333,30.683333],"baseCtl":[11.483333,30.816667],"treeRecs":[],"ctlRecs":[]},
  {"seed":103124,"cruise":88.23,"t0":13.6,"segs":[{"d":0.23333333333333334,"a":-7.865513194177765},{"d":0.3833333333333333,"a":0},{"d":0.26666666666666666,"a":-8.854974762559868},{"d":0.25,"a":-9.994702887826133},{"d":1.4333333333333333,"a":-3.4988459116313604},{"d":0.11666666666666667,"a":0},{"d":1.2666666666666666,"a":-5.919258529692888}],"endSec":38.88013544371351,"kind":"lane","pulses":[[913,27]],"reps":[],"viol":["HARSH_BRAKING_NO_CAUSE@14.6333"],"baseLate":[10.216667,30.416667],"baseCtl":[10.216667,31],"treeRecs":[],"ctlRecs":[]},
  {"seed":103228,"cruise":86.45,"t0":15.4,"segs":[{"d":0.43333333333333335,"a":-9.077806554164273},{"d":0.31666666666666665,"a":0},{"d":0.36666666666666664,"a":-9.875131714297458},{"d":0.21666666666666667,"a":0},{"d":0.3833333333333333,"a":-10.256871261249762},{"d":1.5833333333333333,"a":-5.70252304431051},{"d":0.13333333333333333,"a":0},{"d":0.16666666666666666,"a":-7.0925368253840135}],"endSec":46.29394555557519,"kind":"lane","pulses":[[1084,42]],"reps":[[1240,7.187344197183847],[1251,9.685534249991179]],"viol":["HARSH_BRAKING_NO_CAUSE@15.8167","HARSH_BRAKING_NO_CAUSE@17.1500"],"baseLate":[10.416667,34.133333,44.533333],"baseCtl":[10.416667,34.283333,44.683333],"treeRecs":[],"ctlRecs":[]},
];

function baseTape(c: Cell): SimTick[] {
  const bounds: number[] = [];
  let acc = c.t0;
  for (const s of c.segs) {
    acc += s.d;
    bounds.push(acc);
  }
  const end = acc;
  const out: SimTick[] = [];
  let v = c.cruise / 3.6;
  let y = 0;
  const n = Math.round(c.endSec / H);
  for (let k = 0; k <= n; k++) {
    const t = k * H;
    out.push(tick(t, { speedKmh: Math.max(0, v * 3.6), maxSpeedKmh: 100, gear: v * 3.6 > 25 ? 3 : v > 0 ? 2 : 1, position: { x: 0, y } }));
    const u = t + 1e-9;
    let a = 0;
    if (u >= c.t0 && u < end) {
      const s = c.segs[bounds.findIndex((b) => u < b)]!.a;
      a = s < 0 ? (v > 0.6 ? s : 0) : s;
    } else if (u >= end && v < c.cruise / 3.6) a = 2;
    const v0 = v;
    v = Math.max(0, v + a * H);
    y += ((v0 + v) / 2) * H;
  }
  return out;
}

const causeField = (kind: Cell["kind"]): Partial<SimTick> =>
  kind === "lane" ? { laneOffsetM: 3.6 } : kind === "junction" ? { nextJunctionM: 20 } : kind === "stopline" ? { nextStopLineM: 3 } : { wrongWay: true };
const report = (speedMps: number): SimTickEvent => ({ kind: "followerBraked", vehicleId: 7, decelMps2: 9, heldSec: 0.45, qualifiedSec: 0.45, shedMps: 4, speedMps, gapM: 4 });

function tapes(c: Cell): { ctl: SimTick[]; late: SimTick[] } {
  let ticks = baseTape(c);
  for (const [ri, sp] of c.reps) ticks = ticks.map((t, i) => (i === ri ? { ...t, events: [...(t.events ?? []), report(sp)] } : t));
  const late = ticks.map((t, i) => (c.pulses.some(([c0, d]) => i >= c0 && i < c0 + d) ? { ...t, ...causeField(c.kind) } : t));
  return { ctl: ticks, late };
}

function run(ticks: SimTick[]) {
  let s = createRuleEngine({});
  const out = { clean: [] as number[], violations: [] as string[], records: [] as string[] };
  for (const f of ticks) {
    const seq = s.harshBrake.recordSeq;
    const r = reduceTick(s, f);
    s = r.state;
    for (const e of r.events) {
      if (e.kind === "commendation" && e.code === "CLEAN_DRIVING") out.clean.push(+e.t.toFixed(6));
      if (e.kind === "violation") out.violations.push(`${e.code}@${e.t.toFixed(4)}`);
    }
    if (s.harshBrake.recordSeq !== seq) out.records.push(lastUnbilledHardBrake(s.harshBrake)!.form);
  }
  if (s.harshBrake.chainOpen) {
    const x = unbilledHardBrakeOfChain(s.harshBrake, s.config, true);
    if (x) out.records.push(`${x.form}|END`);
  }
  return out;
}

describe("Q10h — INHERITED_BASE_PRAISE_NO_RECORD: on a late-cause drive whose control is billed HARSH, the praise is BASE's (accepted, inherited)", () => {
  for (const c of CELLS) {
    it(`seed ${c.seed} (${c.kind}, ${c.pulses.length} late pulse${c.pulses.length > 1 ? "s" : ""}): no record, base's bills, base's praise on both drives`, () => {
      const t = tapes(c);
      const ctl = run(t.ctl);
      const late = run(t.late);
      expect(ctl.records, "the control names nothing").toEqual(c.ctlRecs);
      expect(late.records, "the late drive names nothing").toEqual(c.treeRecs);
      expect(ctl.violations, "the control's bills are base's").toEqual(c.viol);
      expect(late.violations, "the late drive's bills are base's").toEqual(c.viol);
      expect(ctl.clean.slice(0, 3), "the control's praise is base's control praise").toEqual(c.baseCtl);
      expect(late.clean.slice(0, 3), "the late drive's praise is base's own late-cause praise").toEqual(c.baseLate);
      // the class itself: the late drive's praise is NOT the control's (base's own difference)
      expect(late.clean.slice(0, 3)).not.toEqual(ctl.clean.slice(0, 3));
    });
  }
});
