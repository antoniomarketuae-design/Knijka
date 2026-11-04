/**
 * ROUND 3 OF LANE flooredinvite (2026-11-02 · `sc-follow-tailgater:63c0c28c`;
 * the integrator's Q7 and Q8 under the founder's 2026-10-19 delegation of
 * QUESTIONS 4 and 10). The round-2 re-judge verifier found two paths on which a
 * drive WITHOUT a record lost or over-held its CLEAN_DRIVING:
 *
 *  · R1 — a pumped frame reset the streak, and a cause arm then voided the
 *    chain whole (a junction came into reach during burst 2): no record, no
 *    bill, no named line — and the zeroed streak was never given back, so
 *    every later payout moved by up to 250 m and one was lost.
 *    Q7: a brake check that turns out to have a CAUSE was never a causeless
 *    one — it leaves the praise exactly as if it had not happened.
 *  · R2 — base's F1 hold (a causeless window still carrying credit) held a
 *    payout the bridge had ALREADY deferred, 0.40–0.87 s past the chain's last
 *    credited frame. Q8: once base would already have paid, F1 holds it only
 *    while a credited frame lies within the sustain behind it.
 *
 * The tapes are the verifier's own (round3Tapes.ts). The expected payouts are
 * the BASE (230c7b8) reducer's, measured on these very tapes and recorded in
 * unbilled-brake-round3.base.json. On a record-free tape every payout must be
 * paid — none lost, none gained, none earlier than base's — and every frame by
 * which one is later than base's must lie within `harshBrakeSustainSec` of a
 * credited frame (Q4's per-held-frame bound).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG, type SimTick } from "../types";
import { createRuleEngine, lastUnbilledHardBrake, reduceTick, unbilledHardBrakeOfChain, type UnbilledHardBrake } from "../engine";
import { round3Tape, round3Tapes } from "./round3Tapes";
import BASE from "./unbilled-brake-round3.base.json";

const CFG = DEFAULT_RULE_CONFIG;
const SUS = CFG.harshBrakeSustainSec;
const TAPES = round3Tapes();
const BASE_CLEAN = BASE as Record<string, number[]>;

interface Run {
  clean: number[];
  violations: string[];
  records: UnbilledHardBrake[];
  credited: number[];
  pumped: number[];
  frames: number[];
  y: number[];
}

function run(ticks: SimTick[]): Run {
  let s = createRuleEngine({});
  const out: Run = { clean: [], violations: [], records: [], credited: [], pumped: [], frames: [], y: [] };
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
    if (hb.recordSeq !== seq) out.records.push(lastUnbilledHardBrake(hb)!);
    out.frames.push(f.t);
    out.y.push(f.position.y);
  }
  if (s.harshBrake.chainOpen) {
    const rec = unbilledHardBrakeOfChain(s.harshBrake, s.config, true);
    if (rec !== null) out.records.push(rec);
  }
  return out;
}

/** Every payout paid (none lost, none gained, none early), and every frame of a delay within the sustain of a credit. */
function judge(name: string, r: Run): { delayed: number; maxDelay: number } {
  const base = BASE_CLEAN[name]!;
  expect(base, name).toBeDefined();
  expect(r.clean.length, `${name}: tree ${r.clean} base ${base}`).toBe(base.length);
  let delayed = 0;
  let maxDelay = 0;
  r.clean.forEach((c, i) => {
    const b = base[i]!;
    expect(c, `${name}: payout ${i} earlier than base's`).toBeGreaterThanOrEqual(b - 1e-4);
    if (c <= b + 1e-4) return;
    delayed += 1;
    maxDelay = Math.max(maxDelay, c - b);
    for (const f of r.frames) {
      if (f < b - 1e-4 || f >= c - 1e-4) continue;
      const credit = r.credited.filter((k) => k <= f + 1e-9).pop();
      expect(credit !== undefined && f - credit < SUS - 1e-9, `${name}: frame ${f} of the delay ${b} → ${c} has no credit within the sustain`).toBe(true);
    }
  });
  return { delayed, maxDelay };
}

const named = (prefix: string) => Object.keys(TAPES).filter((k) => k.startsWith(prefix));

describe("Q7 — a brake check a cause voids leaves the praise as if it had not happened", () => {
  it("PUMPVOID (16 cells: a 60 км/ч pump that pumps on burst 2, then a junction comes into reach): no record, no bill — and every payout on base's frame", () => {
    const keys = named("PUMPVOID_");
    expect(keys.length).toBe(16);
    for (const k of keys) {
      const r = run(TAPES[k]!);
      expect(r.pumped.length, `${k}: the tape does pump`).toBeGreaterThan(0);
      expect(r.records, k).toEqual([]);
      expect(r.violations, k).toEqual([]);
      const j = judge(k, r);
      expect(j.delayed, `${k}: max delay ${j.maxDelay}`).toBe(0);
    }
  });

  it("CAUSEVOID (201 cells: a 38 км/ч pump whose second burst pumps, then floors, then a stop line voids it): no record — no payout lost, gained or early, every delay within the sustain of a credit", () => {
    const keys = named("CAUSEVOID_");
    expect(keys.length).toBe(201);
    let delayed = 0;
    let pumpedCells = 0;
    for (const k of keys) {
      const r = run(TAPES[k]!);
      if (r.pumped.length > 0) pumpedCells += 1;
      expect(r.records, k).toEqual([]);
      expect(r.violations, k).toEqual([]);
      delayed += judge(k, r).delayed;
    }
    // non-vacuous: the pumped reset and a base payout the chain deferred are both exercised
    expect(pumpedCells).toBeGreaterThan(100);
    expect(delayed).toBeGreaterThan(0);
  });

  it("the control — PUMPNOCAUSE (16 cells, the same pump with no cause): ONE pumped record, and no CLEAN_DRIVING from a 250 m that holds a pumped frame", () => {
    const keys = named("PUMPNOCAUSE_");
    expect(keys.length).toBe(16);
    for (const k of keys) {
      const r = run(TAPES[k]!);
      expect(r.records.map((x) => x.form), k).toEqual(["pumped"]);
      expect(r.violations, k).toEqual([]);
      expect(r.clean.length, `${k}: the pump's window is withheld`).toBeLessThan(BASE_CLEAN[k]!.length);
      const firstCredit = r.credited[0]!;
      const lastPumped = r.pumped[r.pumped.length - 1]!;
      const yAt = (t: number) => r.y[r.frames.findIndex((f) => Math.abs(f - t) < 1e-4)]!;
      for (const c of r.clean) {
        if (c < firstCredit) continue;
        expect(c, k).toBeGreaterThan(lastPumped);
        expect(yAt(c) - yAt(lastPumped), `${k}: paid ${c}`).toBeGreaterThanOrEqual(CFG.cleanDrivingDistanceM - 1);
      }
    }
  });
});

describe("Q8 — a payout the bridge deferred waits further only within the sustain of a credit", () => {
  it("F1TAIL (291 cells: two 0.15 s 9.5 m/s² bursts, then a 6.5 m/s² tail that keeps burst 2's window credited): no record — no payout lost, gained or early, every delay within the sustain of a credit", () => {
    const keys = named("F1TAIL_");
    expect(keys.length).toBe(291);
    let delayed = 0;
    for (const k of keys) {
      const r = run(TAPES[k]!);
      expect(r.records, k).toEqual([]);
      expect(r.violations, k).toEqual([]);
      delayed += judge(k, r).delayed;
    }
    expect(delayed).toBeGreaterThan(0);
  });
});

describe("Q5 — the control: a brake check that is BILLED keeps nothing of the praise its release deferred", () => {
  it("S1 (the round-2 verifier's billed2: 60 км/ч, 0.2 s at −9, a release of 0.1 / 0.15 / 0.25 s, 0.6 s at −9 — billed): no record, and no CLEAN_DRIVING from a 250 m that holds the brake check", () => {
    let cells = 0;
    for (const g of [0.1, 0.15, 0.25]) {
      for (let k = 0; k <= 36; k++) {
        const t0 = 14.6 + k / 60;
        const ticks = round3Tape(60, 40, (t) => {
          const u = t - t0 + 1e-9;
          if (u >= 0 && u < 0.2) return -9;
          if (u >= 0.2 + g && u < 0.8 + g) return -9;
          return 0;
        }, 60, 90);
        const r = run(ticks);
        expect(r.records, `g ${g} t0 ${t0}`).toEqual([]);
        expect(r.violations.some((v) => v.startsWith("HARSH_BRAKING_NO_CAUSE@")), `g ${g} t0 ${t0}`).toBe(true);
        const billAt = Number(r.violations.find((v) => v.startsWith("HARSH_BRAKING_NO_CAUSE@"))!.split("@")[1]);
        const yAt = (t: number) => r.y[r.frames.findIndex((f) => Math.abs(f - t) < 1e-3)]!;
        const firstCredit = r.credited[0]!;
        for (const c of r.clean) {
          if (c < firstCredit) continue;
          expect(yAt(c) - yAt(billAt), `g ${g} t0 ${t0}: paid ${c}, billed ${billAt}`).toBeGreaterThanOrEqual(CFG.cleanDrivingDistanceM - 1);
        }
        cells += 1;
      }
    }
    expect(cells).toBe(111);
  });
});
