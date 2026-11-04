/**
 * ROUND 5 OF LANE flooredinvite (2026-11-02 · `sc-follow-tailgater:63c0c28c`;
 * the integrator's Q10b and C1 under the founder's 2026-10-19 delegation of
 * QUESTIONS 4 and 10). THE FACT, Q9's own made whole: a cause that comes into
 * reach more than the sustain after the open application's last credited
 * frame cannot have caused that brake check, so it CHANGES NOTHING about it —
 * the brake check keeps exactly the record its no-cause control gives, the
 * praise is withheld or paid exactly as there, and the bills are untouched.
 *
 * The round-4 verifier's FLOORTAILVOID: from 38 км/ч a 0.2 s burst at −9, a
 * short release, −9 for 0.5–0.6 s — the bursts' credit holds the sustain first
 * (pumped frames), then burst 2 alone does from under the floor (floored) —
 * then a gentle tail, and a junction only at the tail's end. Round 4 folded it
 * as PUMPED and printed «Нито един тласък поотделно не задържа рязкото спиране
 * 0,4 s…» over a burst that held 0.5 s; its control is a FLOORED record. Q10b
 * folds it as floored (the verifier's Fix W — void it whole — is declined) and
 * the record waits on the floor-lift as the control's does: a close follower's
 * report the floor-lift would have attributed to that floor drops it (the
 * control is billed then and names nothing), a new pedal window or the drive's
 * end finalizes it.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG, type SimTick, type SimTickEvent } from "../types";
import { BRAKING_LINE_MPS2 } from "../harshBrakeEpisode";
import { createRuleEngine, lastUnbilledHardBrake, reduceTick, unbilledHardBrakeOfChain, type UnbilledHardBrake } from "../engine";
import { floorTailTape, pumpTailTape, repressTape, round3Tape } from "./round3Tapes";

const CFG = DEFAULT_RULE_CONFIG;
const SUS = CFG.harshBrakeSustainSec;
const H = 1 / 60;
const SUS_GP = Math.round(SUS / H);

interface Run {
  clean: number[];
  violations: string[];
  records: UnbilledHardBrake[];
  credited: number[];
  pumped: number[];
  floored: number[];
  frames: number[];
  y: number[];
  causeAt: number | null;
}

function run(ticks: SimTick[]): Run {
  let s = createRuleEngine({});
  const out: Run = { clean: [], violations: [], records: [], credited: [], pumped: [], floored: [], frames: [], y: [], causeAt: null };
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
    if (out.causeAt === null && f.nextJunctionM !== null && f.nextJunctionM !== undefined) out.causeAt = f.t;
    out.frames.push(f.t);
    out.y.push(f.position.y);
  }
  // the drive's end closes a chain still open (lessons/engine.ts buildLessonResult)
  if (s.harshBrake.chainOpen) {
    const rec = unbilledHardBrakeOfChain(s.harshBrake, s.config, true);
    if (rec !== null) out.records.push(rec);
  }
  return out;
}

/** The record's facts — what the debrief prints from it. */
const shown = (r: Run) =>
  r.records.map((x) => ({ form: x.form, onsetKmh: x.onsetKmh, shownKmh: x.shownKmh, sinceSec: x.sinceSec, atSec: x.atSec }));
const gapGp = (r: Run) => Math.round((r.causeAt! - r.credited.filter((c) => c <= r.causeAt! + 1e-9).pop()!) / H);

/** No CLEAN_DRIVING from a 250 m that holds a floored frame. */
function noPraiseOver(label: string, r: Run, lastJudged: number): void {
  const firstCredit = r.credited[0]!;
  const yAt = (t: number) => r.y[r.frames.findIndex((f) => Math.abs(f - t) < 1e-3)]!;
  for (const c of r.clean) {
    if (c < firstCredit) continue;
    expect(c, `${label}: paid ${c}`).toBeGreaterThan(lastJudged);
    expect(yAt(c) - yAt(lastJudged), `${label}: paid ${c}`).toBeGreaterThanOrEqual(CFG.cleanDrivingDistanceM - 1);
  }
}

/** The tape with a junction 20 m ahead from grid index `from` for 3 s (the kinematics are the control's). */
const causeFrom = (ticks: SimTick[], from: number): SimTick[] =>
  ticks.map((k, i) => (i >= from && i < from + 180 ? { ...k, nextJunctionM: 20 } : k));

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

describe("Q10b — a late cause changes nothing about the brake check: the fold gives its no-cause record", () => {
  const grid: Array<[number, number, number, number]> = [];
  for (const g of [0.1, 0.15])
    for (const T2 of [0.5, 0.6])
      for (const tail of [0.6, 1.0]) for (let k = 0; k <= 4; k++) grid.push([g, T2, tail, 22.7 + k * 0.05]);

  it("FLOORTAILVOID (40 cells): pumped, then floored, then a late cause — ONE floored record equal to its FLOORTAILNOCAUSE control, the same praise, nothing billed", () => {
    expect(grid.length).toBe(40);
    for (const [g, T2, tail, t0] of grid) {
      const label = `g ${g} T2 ${T2} tail ${tail} t0 ${t0.toFixed(2)}`;
      const r = run(floorTailTape(g, T2, tail, t0, true));
      const c = run(floorTailTape(g, T2, tail, t0, false));
      expect(r.pumped.length, `${label}: it pumped`).toBeGreaterThan(0);
      expect(r.floored.length, `${label}: then floored`).toBeGreaterThan(0);
      expect(r.floored[0]!, label).toBeGreaterThan(r.pumped[0]!);
      expect(gapGp(r), `${label}: the cause came after the sustain`).toBeGreaterThanOrEqual(SUS_GP);
      expect(r.violations, label).toEqual([]);
      expect(c.violations, label).toEqual([]);
      expect(r.records.map((x) => x.form), label).toEqual(["floored"]);
      expect(shown(r), `${label}: the control's record`).toEqual(shown(c));
      expect(r.records[0]!.onsetKmh, label).toBeLessThan(CFG.harshBrakeMinSpeedKmh);
      expect(r.clean, `${label}: the control's praise`).toEqual(c.clean);
      noPraiseOver(label, r, r.floored[r.floored.length - 1]!);
    }
  });

  it("a SINGLE floored application (no pump), then a gentle tail and a late cause: its floored record, as its control — and a cause within the sustain still voids it whole", () => {
    let named = 0;
    for (const [g, T2, tail, t0] of grid) {
      const o = { b1: 0, cruiseKmh: 33 - 30 * g };
      const label = `cruise ${o.cruiseKmh} T ${T2 + 0.1} tail ${tail} t0 ${t0.toFixed(2)}`;
      const r = run(floorTailTape(0, T2 + 0.1, tail, t0, true, o));
      const c = run(floorTailTape(0, T2 + 0.1, tail, t0, false, o));
      expect(r.pumped, label).toEqual([]);
      expect(r.floored.length, label).toBeGreaterThan(0);
      expect(gapGp(r), label).toBeGreaterThanOrEqual(SUS_GP);
      expect(r.violations, label).toEqual([]);
      expect(r.records.map((x) => x.form), label).toEqual(["floored"]);
      expect(shown(r), label).toEqual(shown(c));
      expect(r.clean, label).toEqual(c.clean);
      named += 1;
      // the cause 0.2 s after the full pedal ends: within the sustain of its last credit
      const w = run(floorTailTape(0, T2 + 0.1, tail, t0, true, { ...o, causeAfterSec: T2 + 0.1 + 0.2 }));
      expect(gapGp(w), label).toBeLessThan(SUS_GP);
      expect(w.records, `${label}: within the sustain`).toEqual([]);
      const wp = run(floorTailTape(g, T2, tail, t0, true, { causeAfterSec: 0.2 + g + T2 + 0.2 }));
      expect(gapGp(wp), label).toBeLessThan(SUS_GP);
      expect(wp.records, `${label}: pumped-then-floored, within the sustain`).toEqual([]);
    }
    expect(named).toBe(40);
  });

  it("a close follower's report after the late cause: the floored record waits on the floor-lift as its control's does — a report the floor-lift would attribute drops it (the control is billed and names nothing), a later one leaves it; the late-cause drive itself is never billed", () => {
    const t0 = 22.7;
    const ctl = floorTailTape(0.1, 0.5, 0.6, t0, false);
    const tape = floorTailTape(0.1, 0.5, 0.6, t0, true);
    const cause = run(tape).causeAt!;
    const ci = Math.round(cause / H);
    let dropped = 0;
    let kept = 0;
    for (const d of [0, 1, 6, 18, 30, 48, 72, 120]) {
      for (const speedMps of [8.3, 4]) {
        const label = `report ${d} gp after the cause, ${speedMps} m/s`;
        const r = run(reportAt(tape, ci + d, speedMps));
        const c = run(reportAt(ctl, ci + d, speedMps));
        expect(r.violations, label).toEqual([]);
        expect(shown(r), `${label}: the control's record`).toEqual(shown(c));
        if (c.violations.length > 0) {
          expect(c.violations.length, label).toBe(1);
          expect(r.records, label).toEqual([]);
          dropped += 1;
        } else {
          expect(r.records.map((x) => x.form), label).toEqual(["floored"]);
          kept += 1;
        }
      }
    }
    expect(dropped).toBeGreaterThan(3);
    expect(kept).toBeGreaterThan(3);
  });

  it("a later causeless pedal window finalizes the waiting floored record before its own — two records, in time order", () => {
    const t0 = 22.7;
    const second = 32;
    const ticks = round3Tape(
      38,
      70,
      (t, v) => {
        const u = t - t0 + 1e-9;
        if (u >= 0 && u < 0.2) return -9;
        if (u >= 0.3 && u < 0.8) return -9;
        if (u >= 0.8 && u < 1.5) return v > 0.6 ? -2.6 : 0;
        if (t >= second && t < second + 1.2) return v > 0.6 ? -9 : 0;
        if (v < 30 / 3.6) return 2;
        return 0;
      },
      60,
      50,
      (t) => (t - t0 >= 1.4 && t - t0 < 4.4 ? { nextJunctionM: 20 } : {}),
    );
    const r = run(ticks);
    expect(r.violations).toEqual([]);
    expect(r.records.map((x) => x.form)).toEqual(["floored", "floored"]);
    expect(r.records[0]!.atSec).toBeLessThan(t0 + 1.4);
    expect(r.records[1]!.sinceSec).toBeGreaterThanOrEqual(second);
  });
});

describe("Q10c — Fix R: the waiting floored record is spent on the FIRST braking frame after a release, whatever lies ahead — as its no-cause control's is", () => {
  // The control's re-press opens a new pedal window and nulls flooredSince, so
  // a later report is not the floor-lift's and its floored record stands. Here
  // the junction is still in reach, so the re-press runs through the cause arm
  // and opens no window: round 5 kept the record pending and a report then
  // dropped it — no record, no named line, and the fallback free to print over
  // a causeless brake only the floor acquits (the round-5 verifier's v6-repress).
  const tailEnd = (o: { single: boolean; tail: number; t0: number }) => Math.round((o.t0 + (o.single ? 0.6 : 0.8) + o.tail) / H);
  /**
   * The grid index of the control's RE-PRESS: the first frame at or after `from` on
   * which the no-cause control opens a new pedal window (the ledger's own reading,
   * not an estimate of it) — the frame its floored record is spent on.
   */
  const controlRepress = (ctl: SimTick[], from: number): number => {
    let s = createRuleEngine({});
    let wasOpen = true;
    for (let i = 0; i < ctl.length; i++) {
      s = reduceTick(s, ctl[i]!).state;
      const open = s.harshBrake.activeSince === ctl[i]!.t;
      if (i >= from && open && !wasOpen) return i;
      wasOpen = s.harshBrake.activeSince !== null;
    }
    return -1;
  };
  it("a re-press with the cause still in reach, then a close follower's report inside the floor-lift window: the floored record STANDS, equal to the control's; nothing billed; the praise as the control's", () => {
    let cells = 0;
    let insideWindow = 0;
    for (const single of [false, true])
      for (const tail of [0.45, 0.6])
        for (const R of [0.05, 0.1, 0.2])
          for (const aP of [-3, -2.5])
            for (const rep of [0.05, 0.3, 0.7])
              for (let k = 0; k < 2; k++) {
                const o = { single, tail, R, aP, t0: 22.7 + k * 0.05 };
                const label = `single ${single} tail ${tail} R ${R} aP ${aP} rep ${rep} t0 ${o.t0}`;
                const ri = Math.round((o.t0 + (single ? 0.6 : 0.8) + tail + R + rep) / H);
                const cause = repressTape(o, true);
                const r = run(reportAt(cause, ri, 8.3));
                const c = run(reportAt(repressTape(o, false), ri, 8.3));
                const nr = run(cause);
                // a LATE cause (more than the sustain after the last credit), and the report after the re-press
                expect(gapGp(r), label).toBeGreaterThanOrEqual(SUS_GP);
                expect(ri, label).toBeGreaterThanOrEqual(controlRepress(repressTape(o, false), tailEnd(o)));
                expect(r.violations, label).toEqual([]);
                expect(c.violations, label).toEqual([]);
                expect(r.records.map((x) => x.form), label).toEqual(["floored"]);
                expect(shown(r), `${label}: the control's record`).toEqual(shown(c));
                expect(shown(r), `${label}: the report changes nothing`).toEqual(shown(nr));
                expect(r.clean, label).toEqual(c.clean);
                cells += 1;
                // inside the floor-lift's own window: the report round 5 let drop the record
                if (ri * H <= r.records[0]!.atSec + 8.3 / CFG.harshBrakeDecelMps2 + 1e-9) insideWindow += 1;
              }
    expect(cells).toBe(144);
    expect(insideWindow, "non-vacuous: reports the floor-lift would have read without the re-press").toBeGreaterThanOrEqual(24);
  });
  it("…and a report DURING the release, before the re-press, is still the floor-lift's: the record follows the control (dropped where the control is billed), and nothing is billed", () => {
    let dropped = 0;
    for (const single of [false, true])
      for (const R of [0.1, 0.2])
        for (const d of [3, 5])
          for (let k = 0; k < 3; k++) {
            const o = { single, tail: 0.45, R, aP: -3, t0: 22.7 + k * 0.05 };
            const label = `single ${single} R ${R} d ${d} t0 ${o.t0}`;
            const cause = repressTape(o, true);
            const ri = tailEnd(o) + d;
            expect(ri, label).toBeLessThan(controlRepress(repressTape(o, false), tailEnd(o)));
            const r = run(reportAt(cause, ri, 8.3));
            const c = run(reportAt(repressTape(o, false), ri, 8.3));
            expect(r.violations, label).toEqual([]);
            if (c.violations.length > 0) {
              expect(r.records, label).toEqual([]);
              dropped += 1;
            } else expect(shown(r), label).toEqual(shown(c));
          }
    expect(dropped, "non-vacuous: the drop path in the release").toBeGreaterThanOrEqual(6);
  });
  it("…and a report on the re-press frame itself: the record follows the control, whose new window has spent its floor on that frame — Fix R is read before the drop", () => {
    let cells = 0;
    for (const single of [false, true])
      for (const R of [0.05, 0.1, 0.2])
        for (const aP of [-3, -2.5])
          for (let k = 0; k < 3; k++) {
            const o = { single, tail: 0.45, R, aP, t0: 22.7 + k * 0.05 };
            const label = `single ${single} R ${R} aP ${aP} t0 ${o.t0}`;
            const cause = repressTape(o, true);
            const ri = controlRepress(repressTape(o, false), tailEnd(o));
            expect(ri, label).toBeGreaterThan(tailEnd(o));
            const r = run(reportAt(cause, ri, 8.3));
            const c = run(reportAt(repressTape(o, false), ri, 8.3));
            expect(r.violations, label).toEqual([]);
            expect(c.violations, label).toEqual([]);
            expect(r.records.map((x) => x.form), label).toEqual(["floored"]);
            expect(shown(r), label).toEqual(shown(c));
            // one frame earlier the control has not re-pressed: its floor-lift bills the report, and this drive drops the record (Q10e)
            const r1 = run(reportAt(cause, ri - 1, 8.3));
            const c1 = run(reportAt(repressTape(o, false), ri - 1, 8.3));
            expect(c1.violations.length, `${label}: one frame earlier`).toBe(1);
            expect(r1.violations, label).toEqual([]);
            expect(r1.records, `${label}: one frame earlier`).toEqual([]);
            cells += 1;
          }
    expect(cells).toBe(36);
  });
  it("C1 (round 7) — Fix R's boundary: a re-press frame whose reading is EXACTLY −BRAKING_LINE_MPS2 is a braking frame (the ledger's own release arm reads exactly −2 as braking) and spends the waiting floored record — a report on that frame does not drop it", () => {
    // The step that would make the reading exactly the line: the re-press frame
    // k's speed set so that (v_k − v_{k−3}) / 3.6 / (t_k − t_{k−3}) is −2.0 in
    // floating point (its window's anchor is k − 3 at 60 Hz), on the cause tape
    // and the control alike.
    const reading = (ticks: SimTick[], k: number) =>
      (ticks[k]!.speedKmh - ticks[k - 3]!.speedKmh) / 3.6 / (ticks[k]!.t - ticks[k - 3]!.t);
    const step = (x: number, up: boolean) => {
      const b = new Float64Array([x]);
      const u = new BigInt64Array(b.buffer);
      u[0] = u[0]! + BigInt(up === x >= 0 ? 1 : -1);
      return b[0]!;
    };
    // (one ulp of v_k moves the reading by ~40 of its own ulps, so the anchor's
    // speed v_{k−3} — read by no other frame's window — is stepped too)
    // Whether the reading can be made exactly the line at all is a lattice
    // question: (v_k − v_{k−3}) moves in steps of v's ulp, so the reading moves
    // in steps of ~2e-14 and lands exactly on −2 only for some frame spans
    // t_k − t_{k−3}. The cells are the start offsets where it does.
    const exactAt = (ticks: SimTick[], k: number): SimTick[] | null => {
      const out = ticks.map((t) => ({ ...t }));
      const dt = out[k]!.t - out[k - 3]!.t;
      let vk = out[k - 3]!.speedKmh - BRAKING_LINE_MPS2 * 3.6 * dt;
      for (let n = 0; n < 50; n++) vk = step(vk, false);
      for (let n = 0; n < 100; n++, vk = step(vk, true)) {
        out[k]!.speedKmh = vk;
        if (reading(out, k) === -BRAKING_LINE_MPS2) return out;
      }
      return null;
    };
    /** The control's first re-press frame read off the tape itself: the first reading at or under the line after the release. */
    const firstRepressFrame = (ticks: SimTick[], from: number): number => {
      for (let i = from; i < ticks.length; i++) if (reading(ticks, i) <= -BRAKING_LINE_MPS2 && reading(ticks, i - 1) > -BRAKING_LINE_MPS2) return i;
      return -1;
    };
    let cells = 0;
    for (const single of [false, true])
      for (const R of [0.45, 0.6]) {
        let found = 0;
        // (on the 60 Hz grid only a span t_k − t_{k−3} of 0.049999999999998934 —
        // grid points 484–961, t in 8–16 s — lets the reading land exactly on
        // the line, so the brake check is placed there)
        for (let j = 0; j < 240 && found < 2; j++) {
          const o = { single, tail: 0.6, R, aP: -3, t0: 10.5 + j * H };
          const label = `single ${single} R ${R} t0 ${o.t0}`;
          const k = firstRepressFrame(repressTape(o, false), tailEnd(o) + Math.round(R / H) - 2);
          const ctlX = exactAt(repressTape(o, false), k);
          // the late cause: a junction 20 m ahead from six grid points before the tail's end (the pedal still down) for 3 s
          const causeX = exactAt(causeFrom(repressTape(o, false), tailEnd(o) - 6), k);
          if (ctlX === null || causeX === null) continue;
          found += 1;
          const ctl = ctlX;
          const cause = causeX;
          expect(reading(ctl, k), label).toBe(-BRAKING_LINE_MPS2);
          expect(reading(cause, k), label).toBe(-BRAKING_LINE_MPS2);
          expect(reading(ctl, k - 1), label).toBeGreaterThan(-BRAKING_LINE_MPS2);
          // the control's re-press is that very frame; the late cause is still in reach there
          expect(controlRepress(ctl, tailEnd(o)), label).toBe(k);
          expect(cause[k]!.nextJunctionM, label).toBe(20);
          expect(gapGp(run(cause)), `${label}: a late cause`).toBeGreaterThanOrEqual(SUS_GP);
          // …and the late-cause drive's record is WAITING there (the release stood the sustain: Fix R's path)
          let s = createRuleEngine({});
          for (let i = 0; i < k; i++) s = reduceTick(s, cause[i]!).state;
          expect(s.harshBrake.chainFoldPending, `${label}: pending before the re-press`).toBe(true);
          const r = run(reportAt(cause, k, 10));
          const c = run(reportAt(ctl, k, 10));
          expect(c.violations, label).toEqual([]);
          expect(r.violations, label).toEqual([]);
          expect(r.records.map((x) => x.form), label).toEqual(["floored"]);
          expect(shown(r), label).toEqual(shown(c));
          // one frame earlier the control's floor-lift bills the report and this drive drops the record (Q10e)
          const r1 = run(reportAt(cause, k - 1, 10));
          const c1 = run(reportAt(ctl, k - 1, 10));
          expect(c1.violations.length, `${label}: one frame earlier`).toBe(1);
          expect(r1.records, `${label}: one frame earlier`).toEqual([]);
          cells += 1;
        }
        expect(found, `single ${single} R ${R}: start offsets with an exact −2 reading`).toBe(2);
      }
    expect(cells).toBe(8);
  });
});

describe("C1 — Q9's exact tie: the cause EXACTLY the sustain (24 grid points) after the last credit, where that difference falls UNDER 0.4 in floating point, is held — the brake check is named", () => {
  /** Grid points L whose 24-point difference on the tape's clock (k × 1/60) is under 0.4 in floating point. */
  const under = (L: number) => (L + SUS_GP) * H - L * H < SUS;

  for (const fam of ["pumped", "floored"] as const) {
    it(`${fam}: every exact-tie cell whose float difference is under the sustain is named ${fam}; one grid point earlier it is voided`, () => {
      let tied = 0;
      for (let j = 0; j < 60; j++) {
        const t0 = 10 + j * H;
        const ctl = fam === "pumped" ? pumpTailTape(0.1, 3, 2.0, t0, false) : floorTailTape(0.1, 0.5, 0.6, t0, false);
        const c = run(ctl);
        const lc = c.credited[c.credited.length - 1]!;
        const L = Math.round(lc / H);
        if (!under(L)) continue;
        const r = run(causeFrom(ctl, L + SUS_GP));
        // the exact tie, measured on the run's own clock
        expect(r.causeAt! - lc, `j ${j}`).toBeLessThan(SUS);
        expect(Math.round((r.causeAt! - lc) / H), `j ${j}`).toBe(SUS_GP);
        expect(r.violations, `j ${j}`).toEqual([]);
        expect(r.records.map((x) => x.form), `j ${j}: tie at L ${L}`).toEqual([fam]);
        expect(shown(r), `j ${j}`).toEqual(shown(c));
        const e = run(causeFrom(ctl, L + SUS_GP - 1));
        expect(e.records, `j ${j}: 23 grid points`).toEqual([]);
        tied += 1;
      }
      expect(tied, "non-vacuous: tie cells under 0.4 were found").toBeGreaterThanOrEqual(3);
    });
  }
});
