/**
 * ROUND 4 OF LANE flooredinvite (2026-11-02 · `sc-follow-tailgater:63c0c28c`;
 * the integrator's Q9 under the founder's 2026-10-19 delegation of QUESTIONS 4
 * and 10). The round-3 verifier's PUMPTAILVOID: a pump forms its pumped frame
 * (the streak resets), the student keeps braking GENTLY with the pedal down,
 * and only then does a junction come within reach. Under C3 the cause arm
 * voided the open application whole and Q7 gave the streak back on the void
 * frame — so base's payout, owed in the tail, was held up to 97 grid points
 * past the chain's last credited frame on a drive with no record.
 *
 * Q9 (the verifier's Fix V): a cause that comes into reach more than the
 * sustain after the chain's last credited frame cannot have caused the harsh
 * bursts — the pump was causeless when it happened. The open pumped
 * application is folded into the chain as pumped and the record is NAMED;
 * the praise over the pump stays withheld; NOTHING is billed (the bill is
 * untouched). A cause within the sustain of the last credit still voids the
 * application whole (PUMPVOID, unbilled-brake-cause-void.test.ts).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG, type SimTick } from "../types";
import { createRuleEngine, lastUnbilledHardBrake, reduceTick, unbilledHardBrakeOfChain, type UnbilledHardBrake } from "../engine";
import { pumpTailTape, round3Tape, round4TailTapes } from "./round3Tapes";

const CFG = DEFAULT_RULE_CONFIG;
const SUS = CFG.harshBrakeSustainSec;
const H = 1 / 60;
const TAPES = round4TailTapes();

interface Run {
  clean: number[];
  violations: string[];
  records: UnbilledHardBrake[];
  credited: number[];
  pumped: number[];
  frames: number[];
  y: number[];
  causeAt: number | null;
}

function run(ticks: SimTick[]): Run {
  let s = createRuleEngine({});
  const out: Run = { clean: [], violations: [], records: [], credited: [], pumped: [], frames: [], y: [], causeAt: null };
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
    if (out.causeAt === null && f.nextJunctionM !== null && f.nextJunctionM !== undefined) out.causeAt = f.t;
    out.frames.push(f.t);
    out.y.push(f.position.y);
  }
  if (s.harshBrake.chainOpen) {
    const rec = unbilledHardBrakeOfChain(s.harshBrake, s.config, true);
    if (rec !== null) out.records.push(rec);
  }
  return out;
}

/** No CLEAN_DRIVING from a 250 m that holds a pumped frame (or the bill). */
function noPraiseOver(label: string, r: Run, lastJudged: number): void {
  const firstCredit = r.credited[0]!;
  const yAt = (t: number) => r.y[r.frames.findIndex((f) => Math.abs(f - t) < 1e-3)]!;
  for (const c of r.clean) {
    if (c < firstCredit) continue;
    expect(c, `${label}: paid ${c}`).toBeGreaterThan(lastJudged);
    expect(yAt(c) - yAt(lastJudged), `${label}: paid ${c}`).toBeGreaterThanOrEqual(CFG.cleanDrivingDistanceM - 1);
  }
}

describe("Q9 — a cause that comes into reach after the pump's last credit has stood the sustain names the pump", () => {
  it("PUMPTAILVOID (408 cells): ONE pumped record each — the same record as the no-cause control — no bill, no praise over the pump", () => {
    const keys = Object.keys(TAPES).filter((k) => k.startsWith("PUMPTAILVOID_"));
    expect(keys.length).toBe(408);
    let compared = 0;
    for (const k of keys) {
      const r = run(TAPES[k]!);
      expect(r.pumped.length, `${k}: the tape does pump`).toBeGreaterThan(0);
      expect(r.causeAt, k).not.toBeNull();
      const lastCredit = r.credited.filter((c) => c <= r.causeAt! + 1e-9).pop()!;
      expect(Math.round((r.causeAt! - lastCredit) / H), `${k}: the cause comes after the sustain`).toBeGreaterThanOrEqual(Math.round(SUS / H));
      expect(r.records.map((x) => x.form), k).toEqual(["pumped"]);
      expect(r.violations, k).toEqual([]);
      const lastPumped = r.pumped[r.pumped.length - 1]!;
      expect(r.records[0]!.atSec, k).toBeCloseTo(lastPumped, 9);
      noPraiseOver(k, r, lastPumped);
      const control = TAPES[k.replace("PUMPTAILVOID_", "PUMPTAILNOCAUSE_")];
      if (control) {
        const c = run(control);
        expect(c.records, `${k}: the no-cause control`).toEqual(r.records);
        expect(c.violations, k).toEqual([]);
        compared += 1;
      }
    }
    expect(compared).toBe(48);
  });

  it("the boundary: the cause at every grid point after burst 2 — within the sustain of the last credit it voids (no record), from the sustain on it names (one pumped record); never a bill", () => {
    let voided = 0;
    let named = 0;
    for (let k = 0; k <= 60; k++) {
      const r = run(pumpTailTape(0.1, 3, 2.0, 14, true, k * H));
      expect(r.pumped.length, `k ${k}`).toBeGreaterThan(0);
      expect(r.violations, `k ${k}`).toEqual([]);
      const lastCredit = r.credited.filter((c) => c <= r.causeAt! + 1e-9).pop()!;
      const gap = Math.round((r.causeAt! - lastCredit) / H);
      if (gap >= Math.round(SUS / H)) {
        expect(r.records.map((x) => x.form), `k ${k} gap ${gap}`).toEqual(["pumped"]);
        named += 1;
      } else {
        expect(r.records, `k ${k} gap ${gap}`).toEqual([]);
        voided += 1;
      }
    }
    // non-vacuous: both sides of the boundary are exercised
    expect(voided).toBeGreaterThan(5);
    expect(named).toBeGreaterThan(5);
  });

  it("the billed control: a pump whose second burst is BILLED, then a gentle tail and a late cause — no record (the bill is its treatment), the bill stands, and no praise over the bill", () => {
    let cells = 0;
    for (const r0 of [0.1, 0.2]) {
      for (let k = 0; k <= 20; k++) {
        const t0 = 13 + k * 0.05;
        const ticks = round3Tape(60, 45, (t, v) => {
          const u = t - t0 + 1e-9;
          if (u >= 0 && u < 0.25) return -9;
          if (u >= 0.25 + r0 && u < 0.85 + r0) return -9;
          if (u >= 0.85 + r0 && u < 0.85 + r0 + 1.1) return v > 1 ? -3 : 0;
          if (u >= 0.85 + r0 + 1.1 && v < 50 / 3.6) return 2;
          return 0;
        }, 60, 90, (t) => (t - t0 >= 0.85 + r0 + 1.0 && t - t0 < 0.85 + r0 + 4 ? { nextJunctionM: 20 } : {}));
        const r = run(ticks);
        const label = `r ${r0} t0 ${t0.toFixed(2)}`;
        expect(r.pumped.length, `${label}: it pumped before the bill`).toBeGreaterThan(0);
        const bill = r.violations.find((v) => v.startsWith("HARSH_BRAKING_NO_CAUSE@"));
        expect(bill, label).toBeDefined();
        expect(r.violations.length, label).toBe(1);
        expect(r.records, label).toEqual([]);
        noPraiseOver(label, r, Number(bill!.split("@")[1]));
        cells += 1;
      }
    }
    expect(cells).toBe(42);
  });
});
