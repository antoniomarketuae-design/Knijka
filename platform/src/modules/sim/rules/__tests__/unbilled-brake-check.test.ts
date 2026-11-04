/**
 * THE BRAKE CHECK THE LEDGER SAW AND DID NOT BILL — the reducer half
 * (2026-11-01 · `sc-follow-tailgater:63c0c28c`, founder QUESTIONS 4 and 10 as
 * ruled 2026-10-19 and delegated; the integrator's P1–P12). The lesson half,
 * through the live rung chain and the debrief, is
 * `lessons/scenario/__tests__/unbilled-brake-check-named.test.ts`.
 *
 * WHAT IS PINNED (rules/engine.ts „ONE BRAKE CHECK, ONE RECORD"):
 *  · the ONE FACT — a FLOORED-UNBILLED application, or a PUMPED chain: two or
 *    more causeless applications, each under the sustain, whose peak windows'
 *    credit and spans TOGETHER hold `harshBrakeSustainSec` and whose speed shed
 *    over those spans is emergency-grade on the mean (gaps excluded), every
 *    release between them shorter than the sustain;
 *  · ONE CHAIN = ONE RECORD (a bill anywhere → none; floored beats pumped);
 *  · the praise: every pumped frame resets the streak; the payout waits while
 *    the brake check is still being judged (F1, or the chain's bridge across a
 *    release short of the sustain) — and never longer than the sustain after the
 *    chain's last credited frame (round 2, the integrator's Q1).
 * Every number comes from the config; nothing here bills, scores or stars.
 *
 * THE TAPES: a car on a clear road (no lead, no line, no junction — no cause in
 * sight unless the row says so) cruising, then a brake made of SEGMENTS
 * (seconds × m/s²; 0 = pedal off, the car coasting at 0.33 m/s²), then back up
 * to the cruise at 2 m/s². Sampled at `hz` with an alternating `wobble` км/ч —
 * the A12 battery's noise floor — so each row is asked at 20 / 30 / 60 / 120 Hz.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG, type RuleEngineConfig, type SimTick, type SimTickEvent } from "../types";
import {
  brakeCheckBridgeHolds,
  createRuleEngine,
  lastUnbilledHardBrake,
  reduceTick,
  unbilledHardBrakeOfChain,
  type UnbilledHardBrake,
} from "../engine";
import { HARSH_BRAKE_TIE_TOLERANCE } from "../harshBrakeEpisode";
import { tick } from "./fixtures";

const CFG = DEFAULT_RULE_CONFIG;
const RATES = [20, 30, 60, 120] as const;
const WOBBLES = [0, 0.06, 0.12] as const;

type Seg = readonly [sec: number, decelMps2: number];

interface Synth {
  hz?: number;
  wobble?: number;
  cruiseKmh: number;
  /** Seconds of cruise before the brake. */
  leadSec?: number;
  segs: readonly Seg[];
  /** After the segments: hold at rest this long when stopped, then drive back up; or `null` = stand to the end. */
  restSec?: number | null;
  endSec: number;
  /** Extra tick fields on frames inside [from, to). */
  overlay?: { from: number; to: number; over: Partial<SimTick> };
  /** Tick events at a time (first frame at or after it). */
  eventsAt?: Array<{ t: number; e: SimTickEvent }>;
}

function synth(o: Synth): SimTick[] {
  const hz = o.hz ?? 60;
  const dt = 1 / hz;
  const SUB = 20;
  const h = dt / SUB;
  const w = o.wobble ?? 0;
  const cruise = o.cruiseKmh / 3.6;
  let v = cruise;
  let y = 0;
  let t = 0;
  let segI = -1;
  let segEnd = o.leadSec ?? 12;
  let phase: "lead" | "seg" | "rest" | "up" | "cruise" = "lead";
  let restUntil = Infinity;
  const pending = [...(o.eventsAt ?? [])].sort((a, b) => a.t - b.t);
  const out: SimTick[] = [];
  const n = Math.round(o.endSec * hz);
  for (let k = 0; k <= n; k++) {
    t = k * dt;
    const events: SimTickEvent[] = [];
    while (pending.length > 0 && pending[0]!.t <= t + 1e-9) events.push(pending.shift()!.e);
    const shown = v * 3.6 + (v * 3.6 > 0.5 ? (k % 2 ? w : -w) : 0);
    out.push(
      tick(t, {
        speedKmh: Math.max(0, shown),
        maxSpeedKmh: 90,
        gear: v * 3.6 > 30 ? 3 : 2,
        position: { x: 0, y },
        events,
        ...(o.overlay && t >= o.overlay.from - 1e-9 && t < o.overlay.to - 1e-9 ? o.overlay.over : {}),
      }),
    );
    for (let j = 0; j < SUB; j++) {
      const tt = t + j * h;
      if (phase === "lead" && tt >= segEnd - 1e-12) {
        phase = "seg";
        segI = 0;
        segEnd = tt + o.segs[0]![0];
      }
      while (phase === "seg" && tt >= segEnd - 1e-12) {
        segI += 1;
        if (segI >= o.segs.length) {
          phase = v <= 0 ? "rest" : "up";
          restUntil = o.restSec === null ? Infinity : tt + (o.restSec ?? 1.5);
          break;
        }
        segEnd += o.segs[segI]![0];
      }
      let a = 0;
      if (phase === "seg") a = o.segs[segI]![1] > 0 ? -o.segs[segI]![1] : -0.33;
      else if (phase === "rest") {
        if (tt >= restUntil) phase = "up";
      } else if (phase === "up") {
        a = 2;
        if (v >= cruise) phase = "cruise";
      }
      const v0 = v;
      v = Math.max(0, Math.min(cruise, v + a * h));
      if (phase === "seg" && v === 0) {
        phase = "rest";
        restUntil = o.restSec === null ? Infinity : tt + (o.restSec ?? 1.5);
      }
      y += ((v0 + v) / 2) * h;
    }
  }
  return out;
}

interface Run {
  violations: string[];
  flooredFrames: number[];
  pumpedFrames: number[];
  records: UnbilledHardBrake[];
  clean: number[];
  /** Frames on which a payout would wait: F1 (a causeless window accruing) or the chain's bridge. */
  held: number[];
  /** The causeless ledger's credited frames (`lastQualAt === t`). */
  credited: number[];
  /** Frames on which F1 alone (base's hold) stood. */
  accruing: number[];
}

function run(ticks: SimTick[], cfg?: Partial<RuleEngineConfig>): Run {
  let s = createRuleEngine(cfg);
  const out: Run = { violations: [], flooredFrames: [], pumpedFrames: [], records: [], clean: [], held: [], credited: [], accruing: [] };
  for (const f of ticks) {
    const seq = s.harshBrake.recordSeq;
    const r = reduceTick(s, f);
    s = r.state;
    for (const e of r.events) {
      if (e.kind === "violation") out.violations.push(`${e.code}@${e.t.toFixed(3)}`);
      if (e.kind === "commendation" && e.code === "CLEAN_DRIVING") out.clean.push(e.t);
    }
    if (s.harshBrake.flooredAt === f.t) out.flooredFrames.push(f.t);
    if (s.harshBrake.appPumpedAt === f.t) out.pumpedFrames.push(f.t);
    const f1 = s.harshBrake.activeSince !== null && s.harshBrake.qualifiedSec > 0;
    if (f1) out.accruing.push(f.t);
    if (f1 || brakeCheckBridgeHolds(s.harshBrake, f.t, s.config)) out.held.push(f.t);
    if (s.harshBrake.activeSince !== null && s.harshBrake.lastQualAt === f.t) out.credited.push(f.t);
    if (s.harshBrake.recordSeq !== seq) out.records.push(lastUnbilledHardBrake(s.harshBrake)!);
  }
  if (s.harshBrake.chainOpen) {
    const rec = unbilledHardBrakeOfChain(s.harshBrake, s.config, true);
    if (rec !== null) out.records.push(rec);
  }
  return out;
}

/** The praise a tape with nothing to withhold is owed — the reducer's own accrual. */
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

const forms = (r: Run) => r.records.map((x) => x.form);

// THE PUMPS ------------------------------------------------------------------
const PUMP_9_025_03 = (onset: number): Synth => ({
  cruiseKmh: onset,
  segs: [
    [0.25, 9],
    [0.3, 0],
    [0.25, 9],
  ],
  endSec: 40,
});

describe("PUMPED — two or more causeless bursts, each under the sustain, together emergency-grade", () => {
  for (const onset of [30, 60]) {
    it(`two 9 m/s² bursts of 0.25 s, 0.3 s apart, from ${onset} км/ч: ONE pumped record at every rate and wobble, nothing billed or floored`, () => {
      for (const hz of RATES)
        for (const wobble of WOBBLES) {
          const r = run(synth({ ...PUMP_9_025_03(onset), hz, wobble }));
          expect(r.violations, `${hz} Hz w${wobble}`).toEqual([]);
          expect(r.flooredFrames, `${hz} Hz w${wobble}`).toEqual([]);
          expect(r.pumpedFrames.length, `${hz} Hz w${wobble}`).toBeGreaterThan(0);
          expect(forms(r), `${hz} Hz w${wobble}`).toEqual(["pumped"]);
          const rec = r.records[0]!;
          expect(rec.sustainSec).toBe(CFG.harshBrakeSustainSec);
          expect(rec.floorKmh).toBe(CFG.harshBrakeMinSpeedKmh);
          // what the speedometer showed on the frame before the window's anchor: the cruise, give or take the wobble
          // and — when the wobble hides the pedal's first frame from the braking line — one frame of the burst
          expect(Math.abs(rec.shownKmh - onset), `${hz} Hz w${wobble}`).toBeLessThanOrEqual(wobble + (9 * 3.6) / hz + 1e-9);
          expect(rec.atSec).toBe(r.pumpedFrames[r.pumpedFrames.length - 1]);
        }
    });
  }

  it("two causeless 7.10 m/s² applications of 0.35 s split by a 0.1 s release from 30 км/ч: pumped at 20 / 30 / 60 / 120 Hz", () => {
    for (const hz of RATES) {
      const r = run(synth({ hz, cruiseKmh: 30, segs: [[0.35, 7.1], [0.1, 0], [0.35, 7.1]], endSec: 40 }));
      expect(r.violations, `${hz} Hz`).toEqual([]);
      expect(r.flooredFrames, `${hz} Hz`).toEqual([]);
      expect(forms(r), `${hz} Hz`).toEqual(["pumped"]);
    }
  });

  it("a pump from 60 км/ч to rest in 0.25 s bursts (over the floor): never billed — every burst stays under the sustain — and pumped, onset over the floor", () => {
    const segs: Seg[] = [];
    for (let i = 0; i < 9; i++) segs.push([0.25, 9], [0.1, 0]);
    for (const hz of RATES) {
      const r = run(synth({ hz, cruiseKmh: 60, segs, endSec: 40 }));
      expect(r.violations, `${hz} Hz`).toEqual([]);
      expect(forms(r), `${hz} Hz`).toEqual(["pumped"]);
      expect(r.records[0]!.onsetKmh).toBeGreaterThanOrEqual(CFG.harshBrakeMinSpeedKmh);
    }
  });
});

describe("NOT PUMPED — the controls keep base's ledger and praise", () => {
  it("two causeless 6.99 m/s² applications of 0.35 s split by a 0.1 s release (under the line): never pumped, never floored, every rate × wobble", () => {
    for (const hz of RATES)
      for (const wobble of WOBBLES) {
        const r = run(synth({ hz, wobble, cruiseKmh: 30, segs: [[0.35, 6.99], [0.1, 0], [0.35, 6.99]], endSec: 40 }));
        expect(r.pumpedFrames, `${hz} Hz w${wobble}`).toEqual([]);
        expect(r.records, `${hz} Hz w${wobble}`).toEqual([]);
      }
  });

  it("a lone 0.2 s 9 m/s² blip: one application — never pumped, floored or named", () => {
    for (const hz of RATES)
      for (const wobble of WOBBLES) {
        const r = run(synth({ hz, wobble, cruiseKmh: 30, segs: [[0.2, 9]], endSec: 40 }));
        expect(r.records, `${hz} Hz w${wobble}`).toEqual([]);
        expect(r.pumpedFrames).toEqual([]);
      }
  });

  it("two lone 0.2 s bursts with no tail: Σ credit under the sustain — not pumped", () => {
    for (const hz of RATES) {
      const r = run(synth({ hz, cruiseKmh: 30, segs: [[0.15, 9], [0.1, 0], [0.15, 9]], endSec: 40 }));
      expect(r.records, `${hz} Hz`).toEqual([]);
    }
  });

  it("constant 4 / 5 / 6.99 / 7.00 m/s² stops to rest, the 0.25 s-ramped 5 and a 5 m/s² stop with one 7.5 spike: none pumped, none named, every rate × wobble", () => {
    const shapes: Record<string, Seg[]> = {
      "4": [[3, 4]],
      "5": [[3, 5]],
      "6.99": [[3, 6.99]],
      "7.00": [[3, 7]],
      "ramp5": [[0.0625, 1.25], [0.0625, 2.5], [0.0625, 3.75], [0.0625, 5], [3, 5]],
      "5+spike7.5": [[0.5, 5], [1 / 60, 7.5], [3, 5]],
    };
    for (const [name, segs] of Object.entries(shapes))
      for (const hz of RATES)
        for (const wobble of WOBBLES) {
          const r = run(synth({ hz, wobble, cruiseKmh: 30, segs, endSec: 40 }));
          expect(r.pumpedFrames, `${name} ${hz} Hz w${wobble}`).toEqual([]);
          expect(r.records, `${name} ${hz} Hz w${wobble}`).toEqual([]);
        }
  });

  it("ONE causeless application of 9.0 (0.25 s) / 4.0 (0.3 s) × 3 from 30 км/ч — it re-anchors inside the application — is NOT pumped (only its peak window counts), at every rate × wobble", () => {
    const segs: Seg[] = [[0.25, 9], [0.3, 4], [0.25, 9], [0.3, 4], [0.25, 9], [0.3, 4]];
    for (const hz of RATES)
      for (const wobble of WOBBLES) {
        const r = run(synth({ hz, wobble, cruiseKmh: 30, segs, endSec: 40 }));
        expect(r.pumpedFrames, `${hz} Hz w${wobble}`).toEqual([]);
        expect(r.records.filter((x) => x.form === "pumped"), `${hz} Hz w${wobble}`).toEqual([]);
      }
  });

  it("two causeless applications, each 0.6 s of 9 / 4 / 9 / 4 / 9 (interior mean 6.5), split by a 0.1 s release: the chain mean fails — never pumped", () => {
    const one: Seg[] = [[0.1, 9], [0.15, 4], [0.1, 9], [0.15, 4], [0.1, 9]];
    for (const hz of RATES)
      for (const wobble of WOBBLES) {
        const r = run(synth({ hz, wobble, cruiseKmh: 30, segs: [...one, [0.1, 0], ...one], endSec: 40 }));
        expect(r.pumpedFrames, `${hz} Hz w${wobble}`).toEqual([]);
        expect(r.records.filter((x) => x.form === "pumped"), `${hz} Hz w${wobble}`).toEqual([]);
      }
  });

  it("bursts separated by a release of the sustain or longer are two separate brakes that are over (P2's narrowing): not pumped, nothing named", () => {
    for (const hz of RATES) {
      const r = run(synth({ hz, cruiseKmh: 30, segs: [[0.25, 9], [0.6, 0], [0.25, 9]], endSec: 40 }));
      expect(r.records, `${hz} Hz`).toEqual([]);
    }
  });

  it("a 9 m/s² pump WITH its cause seen (a stop line 10 m ahead for the whole brake) is never in the fact", () => {
    for (const hz of RATES) {
      const tp = PUMP_9_025_03(30);
      const r = run(synth({ ...tp, hz, overlay: { from: 11.9, to: 14, over: { nextStopLineM: 10 } } }));
      expect(r.records, `${hz} Hz`).toEqual([]);
      expect(r.pumpedFrames).toEqual([]);
    }
  });
});

describe("FLOORED-UNBILLED — the floored records, and the floor-lift's window", () => {
  const STAB30: Synth = { cruiseKmh: 30, segs: [[3, 9]], endSec: 50 };

  it("a 9 m/s² causeless stop to rest from 30 км/ч: ONE floored record, nothing billed, every rate", () => {
    for (const hz of RATES) {
      const r = run(synth({ ...STAB30, hz }));
      expect(r.violations, `${hz} Hz`).toEqual([]);
      expect(r.flooredFrames.length, `${hz} Hz`).toBeGreaterThan(0);
      expect(forms(r), `${hz} Hz`).toEqual(["floored"]);
      expect(r.records[0]!.atSec).toBe(r.flooredFrames[r.flooredFrames.length - 1]);
      expect(r.records[0]!.onsetKmh).toBeLessThan(CFG.harshBrakeMinSpeedKmh);
    }
  });

  const report = (t: number, speedMps: number): { t: number; e: SimTickEvent } => ({
    t,
    e: { kind: "followerBraked", vehicleId: 7, decelMps2: 9, heldSec: 0.45, qualifiedSec: 0.45, shedMps: 4, speedMps, gapM: 4 },
  });

  it("a follower's report AFTER the release but inside the floor-lift window bills the brake — and it leaves NO record (the bill is its treatment)", () => {
    const base = run(synth(STAB30));
    const last = base.flooredFrames[base.flooredFrames.length - 1]!;
    const answer = 8.3 / CFG.harshBrakeDecelMps2;
    const r = run(synth({ ...STAB30, eventsAt: [report(last + answer - 0.1, 8.3)] }));
    expect(r.violations.filter((v) => v.startsWith("HARSH_BRAKING_NO_CAUSE")).length).toBe(1);
    // the report really landed after the car was at rest (the application released)
    expect(last + answer - 0.1).toBeGreaterThan(last);
    expect(r.records).toEqual([]);
  });

  it("a report AFTER the floor-lift window bills nothing, and the floored record stands", () => {
    const base = run(synth(STAB30));
    const last = base.flooredFrames[base.flooredFrames.length - 1]!;
    const r = run(synth({ ...STAB30, eventsAt: [report(last + 8.3 / CFG.harshBrakeDecelMps2 + 0.2, 8.3)] }));
    expect(r.violations).toEqual([]);
    expect(forms(r)).toEqual(["floored"]);
  });

  it("a floored record the CAUSE ARM voids inside its own application (a stop line appears while he is still braking) is never named", () => {
    const base = run(synth(STAB30));
    const first = base.flooredFrames[0]!;
    const r = run(synth({ ...STAB30, overlay: { from: first + 0.1, to: first + 3, over: { nextStopLineM: 10 } } }));
    expect(r.violations).toEqual([]);
    expect(r.flooredFrames.length).toBeGreaterThan(0);
    expect(r.records).toEqual([]);
  });

  it("a chain whose SECOND burst floors yields ONE record, form floored — never a pumped one beside it", () => {
    for (const hz of RATES) {
      const r = run(synth({ hz, cruiseKmh: 30, segs: [[0.25, 9], [0.1, 0], [3, 9]], endSec: 40 }));
      expect(r.flooredFrames.length, `${hz} Hz`).toBeGreaterThan(0);
      expect(forms(r), `${hz} Hz`).toEqual(["floored"]);
    }
  });

  it("a chain that PUMPS first and then FLOORS on its third application is still ONE record, form floored", () => {
    for (const hz of RATES) {
      const r = run(synth({ hz, cruiseKmh: 45, segs: [[0.25, 9], [0.1, 0], [0.25, 9], [0.1, 0], [3, 9]], endSec: 40 }));
      expect(r.pumpedFrames.length, `${hz} Hz`).toBeGreaterThan(0);
      expect(r.flooredFrames.length, `${hz} Hz`).toBeGreaterThan(0);
      expect(forms(r), `${hz} Hz`).toEqual(["floored"]);
      // judged under the floor — the bullet never prints the 45 the pedal went down at beside «Под 35»
      expect(r.records[0]!.onsetKmh).toBeLessThan(CFG.harshBrakeMinSpeedKmh);
    }
  });

  it("THIS lesson's harsh line, not 7: with harshBrakeDecelMps2 6.5, two 6.8 m/s² bursts of 0.35 s are a pump", () => {
    const r = run(synth({ cruiseKmh: 30, segs: [[0.35, 6.8], [0.1, 0], [0.35, 6.8]], endSec: 40 }), { harshBrakeDecelMps2: 6.5 });
    expect(forms(r)).toEqual(["pumped"]);
  });

  it("over the floor the ledger BILLS a 9 m/s² stop from 50 км/ч, and the chain then has no record", () => {
    const r = run(synth({ cruiseKmh: 50, segs: [[3, 9]], endSec: 40 }));
    expect(r.violations.filter((v) => v.startsWith("HARSH_BRAKING_NO_CAUSE")).length).toBe(1);
    expect(r.records).toEqual([]);
  });

  it("a config-override lesson (floor 30 км/ч, sustain 0.5 s) carries ITS numbers on the record", () => {
    const cfg = { harshBrakeMinSpeedKmh: 30, harshBrakeSustainSec: 0.5 };
    const fl = run(synth({ cruiseKmh: 28, segs: [[3, 9]], endSec: 40 }), cfg);
    expect(forms(fl)).toEqual(["floored"]);
    expect(fl.records[0]!.floorKmh).toBe(30);
    expect(fl.records[0]!.sustainSec).toBe(0.5);
    // the bursts of 0.3 s each are under THIS sustain and together hold it
    const pu = run(synth({ cruiseKmh: 28, segs: [[0.32, 9], [0.1, 0], [0.32, 9]], endSec: 40 }), cfg);
    expect(forms(pu)).toEqual(["pumped"]);
    expect(pu.records[0]!.sustainSec).toBe(0.5);
    // THIS sustain, not 0.4: two 0.25 s bursts hold ~0.45 s of credit together — under 0.5, not pumped…
    const short = run(synth({ cruiseKmh: 28, segs: [[0.25, 9], [0.1, 0], [0.25, 9]], endSec: 40 }), cfg);
    expect(short.records).toEqual([]);
    // …and a 0.45 s release is shorter than 0.5: the chain goes on and the two 0.32 s bursts are one pump
    const bridged = run(synth({ cruiseKmh: 28, segs: [[0.32, 9], [0.45, 0], [0.32, 9]], endSec: 40 }), cfg);
    expect(forms(bridged)).toEqual(["pumped"]);
  });

  it("the hazard drills' config (harshBrakeDecelMps2 25): a full-pedal two-burst pump and a full stop are never in the fact", () => {
    const cfg = { harshBrakeDecelMps2: 25 };
    for (const segs of [[[0.25, 9], [0.1, 0], [0.25, 9]] as Seg[], [[3, 9]] as Seg[]]) {
      const r = run(synth({ cruiseKmh: 30, segs, endSec: 40 }), cfg);
      expect(r.records).toEqual([]);
      expect(r.pumpedFrames).toEqual([]);
    }
  });
});

describe("THE PRAISE (P3) — a pumped frame resets the streak; the payout waits across the chain", () => {
  it("no CLEAN_DRIVING is minted from a window that holds a pumped frame", () => {
    for (const hz of RATES) {
      const ticks = synth({ ...PUMP_9_025_03(30), hz, endSec: 70 });
      const r = run(ticks);
      const last = r.pumpedFrames[r.pumpedFrames.length - 1]!;
      const first = r.held[0]!;
      for (const c of r.clean) expect(c < first || c > last, `${hz} Hz praise at ${c}`).toBe(true);
    }
  });

  it("a 250 m that completes in the RELEASE between the bursts is held, then reset by the pumped frame — never paid", () => {
    const lawful = synth({ cruiseKmh: 30, segs: [], leadSec: 1000, endSec: 70 });
    const due = owed(lawful)[0]!;
    // the first burst ends 0.25 s after the pedal; put the window's completion inside the 0.3 s release
    const pedal = due - 0.25 - 0.1;
    const ticks = synth({ ...PUMP_9_025_03(30), leadSec: pedal, endSec: 70 });
    const r = run(ticks);
    expect(r.pumpedFrames.length).toBeGreaterThan(0);
    const firstPumped = r.pumpedFrames[0]!;
    // the window did complete before the first pumped frame, inside the hold…
    expect(owed(ticks)[0]!).toBeLessThan(firstPumped);
    expect(r.held.some((h) => Math.abs(h - owed(ticks)[0]!) < 1e-9 || h > owed(ticks)[0]!)).toBe(true);
    // …and was never paid before or across the pump
    expect(r.clean.filter((c) => c <= r.pumpedFrames[r.pumpedFrames.length - 1]!)).toEqual([]);
  });

  it("a pump followed by 300 m of clean driving: the later CLEAN_DRIVING stands, 250 m after the last pumped frame", () => {
    const ticks = synth({ ...PUMP_9_025_03(30), endSec: 80 });
    const r = run(ticks);
    const last = r.pumpedFrames[r.pumpedFrames.length - 1]!;
    expect(r.clean.length).toBeGreaterThan(0);
    let acc = 0;
    let prevT: number | null = null;
    let firstAfter: number | null = null;
    for (const f of ticks) {
      if (prevT !== null && f.t > last + 1e-9 && f.speedKmh > CFG.movingSpeedKmh) {
        acc += (f.speedKmh / 3.6) * Math.min(f.t - prevT, 2);
        if (acc >= CFG.cleanDrivingDistanceM && firstAfter === null) firstAfter = f.t;
      }
      prevT = f.t;
    }
    // paid on its own frame, or — if it fell inside the hold — on the frame the chain closed
    const closed = r.held[r.held.length - 1]! + 1 / 60;
    expect(r.clean[0]).toBeCloseTo(Math.max(firstAfter!, closed), 9);
  });
});

/**
 * THE ROUND-1 VERIFIER'S TAPES (D:/knijka-lanes/scratch/flooredinvite-verify, probes/p1.json — its `tape()` ported
 * verbatim: 60 Hz, the profile is the acceleration in m/s² by time and speed). Round 1's hold lasted to the release's
 * sustain, so one credited frame at the start of a gentle causeless stop held the payout until the car had stopped and
 * driven off (B: 18.383 → 24.700) or lost it outright (D: 18.983 → none). The base (230c7b8) reducer's payouts,
 * measured on these very tapes, are the expected values: none of them carries a record, so none may move.
 */
function verifierTape(cruiseKmh: number, endSec: number, prof: (t: number, v: number) => number): SimTick[] {
  const hz = 60;
  const dt = 1 / hz;
  const out: SimTick[] = [];
  let v = cruiseKmh / 3.6;
  let y = 0;
  const n = Math.round(endSec * hz);
  for (let k = 0; k <= n; k++) {
    const t = k * dt;
    out.push(tick(t, { speedKmh: v * 3.6, maxSpeedKmh: 50, gear: v * 3.6 > 25 ? 3 : v > 0 ? 2 : 1, position: { x: 0, y } }));
    const a = prof(t, v);
    const v0 = v;
    v = Math.max(0, v + a * dt);
    y += ((v0 + v) / 2) * dt;
  }
  return out;
}

const H60 = 1 / 60;
const VERIFIER_TAPES: Array<{ name: string; ticks: SimTick[]; base: number }> = [
  { name: "A — a 0.1 s 9 m/s² blip then 3 m/s² down to 15 км/ч", base: 19.3667, ticks: verifierTape(50, 40, (t, v) => (t >= 16 && t < 16.1 ? -9 : t >= 16.1 && v > 15 / 3.6 ? -3 : 0)) },
  {
    name: "B — a 5 m/s² stop to rest with one spike frame at its start, 3 s at rest, then off",
    base: 18.3833,
    ticks: verifierTape(50, 40, (t, v) => {
      if (t >= 17.0 && t < 17.0 + H60 - 1e-9) return -7.5 * 3;
      if (t >= 17.0 && t < 21) return v > 0 ? -5 : 0;
      if (t >= 24 && v < 30 / 3.6) return 2;
      return 0;
    }),
  },
  { name: "C — a 6.99 m/s² stop with an alternating ±1.2 wobble", base: 24.9167, ticks: verifierTape(50, 40, (t, v) => (t >= 17 && v > 0 && t < 21 ? -6.99 + (Math.round(t * 60) % 2 ? 1.2 : -1.2) : t >= 24 && v < 30 / 3.6 ? 2 : 0)) },
  { name: "D — a 0.15 s 8 m/s² bite then 2.5 m/s² down to 5 км/ч", base: 18.9833, ticks: verifierTape(50, 40, (t, v) => (t >= 16 && t < 16.15 ? -8 : t >= 16.15 && v > 5 / 3.6 ? -2.5 : 0)) },
];

describe("THE BOUNDED HOLD (round 2, Q1) — a payout waits only for a brake check still being judged", () => {
  for (const vt of VERIFIER_TAPES) {
    it(`the round-1 verifier's tape ${vt.name}: no record, paid on base's frame (${vt.base}), never lost`, () => {
      const r = run(vt.ticks);
      expect(r.records).toEqual([]);
      expect(r.pumpedFrames).toEqual([]);
      expect(r.clean.length).toBeGreaterThan(0);
      expect(r.clean[0]).toBeCloseTo(vt.base, 3);
    });
  }

  it("the hold never outlasts the sustain after the chain's last credited frame: one 9 m/s² frame-pair, then 2.5 m/s² to rest — every held frame lies within the sustain of a credited one", () => {
    for (const hz of RATES) {
      const ticks = synth({ hz, cruiseKmh: 45, segs: [[0.05, 9], [8, 2.5]], restSec: 3, endSec: 60 });
      const r = run(ticks);
      expect(r.records).toEqual([]);
      expect(r.credited.length).toBeGreaterThan(0);
      for (const h of r.held) {
        if (r.accruing.some((a) => Math.abs(a - h) < 1e-9)) continue; // F1 — base's own hold
        const before = r.credited.filter((c) => c <= h + 1e-9);
        expect(before.length, `${hz} Hz held at ${h}`).toBeGreaterThan(0);
        expect(h - before[before.length - 1]!, `${hz} Hz held at ${h}`).toBeLessThan(CFG.harshBrakeSustainSec);
      }
      const due = owed(ticks);
      expect(r.clean.length).toBe(due.length);
    }
  });

  it("THIS lesson's sustain bounds the hold, not 0.4: with harshBrakeSustainSec 0.5 a 0.2 s 9 m/s² blip's payout lands on the first moving frame 0.5 s after its last credit", () => {
    const lawful = synth({ cruiseKmh: 30, segs: [], leadSec: 1000, endSec: 70 });
    const due = owed(lawful)[0]!;
    for (const sustain of [0.4, 0.5]) {
      const ticks = synth({ cruiseKmh: 30, segs: [[0.2, 9]], leadSec: due - 0.1, endSec: 70 });
      const r = run(ticks, { harshBrakeSustainSec: sustain });
      expect(r.records).toEqual([]);
      const last = r.credited[r.credited.length - 1]!;
      expect(r.clean[0], `sustain ${sustain}`).toBeCloseTo(last + sustain, 9);
    }
  });

  it("every payout on a record-free tape of this battery that lands after its owed frame has F1 or a credited frame within the sustain before it", () => {
    const tapes: SimTick[][] = [];
    // each brake starts just before, on, or just after the frame its 250 m completes (250 m / cruise)
    for (const hz of RATES) {
      for (const w of WOBBLES) {
        for (const off of [-0.15, -0.05, 0, 0.05]) {
          tapes.push(synth({ hz, wobble: w, cruiseKmh: 30, segs: [[0.2, 9]], endSec: 70, leadSec: 30 + off }));
          tapes.push(synth({ hz, wobble: w, cruiseKmh: 45, segs: [[0.05, 9], [8, 2.5]], restSec: 3, endSec: 60, leadSec: 20 + off }));
          tapes.push(synth({ hz, wobble: w, cruiseKmh: 30, segs: [[0.35, 6.99], [0.1, 0], [0.35, 6.99]], endSec: 70, leadSec: 30 + off }));
          tapes.push(synth({ hz, wobble: w, cruiseKmh: 50, segs: [[0.15, 8], [6, 2.5]], endSec: 60, leadSec: 18 + off }));
        }
      }
    }
    let deferred = 0;
    for (const ticks of tapes) {
      const r = run(ticks);
      if (r.records.length > 0) continue;
      const due = owed(ticks);
      expect(r.clean.length).toBe(due.length);
      r.clean.forEach((c, i) => {
        if (c <= due[i]! + 1e-9) return;
        deferred += 1;
        const prevFrame = ticks.filter((f) => f.t < c - 1e-9).pop()!.t;
        const byF1 = r.accruing.some((a) => Math.abs(a - prevFrame) < 1e-9);
        const credit = r.credited.filter((k) => k < c - 1e-9).pop();
        expect(byF1 || (credit !== undefined && c - credit <= CFG.harshBrakeSustainSec * (1 + HARSH_BRAKE_TIE_TOLERANCE) + 1e-9), `paid ${c} owed ${due[i]}`).toBe(true);
      });
    }
    // the battery does exercise deferrals (F1 or the bridge), not only payouts away from a brake
    expect(deferred).toBeGreaterThan(0);
  });
});

describe("what is NOT changed", () => {
  it("the protected numbers: 0.4 s, 35 км/ч, 7 m/s², the braking line's tolerance, 250 m", () => {
    expect(CFG.harshBrakeSustainSec).toBe(0.4);
    expect(CFG.harshBrakeMinSpeedKmh).toBe(35);
    expect(CFG.harshBrakeDecelMps2).toBe(7);
    expect(HARSH_BRAKE_TIE_TOLERANCE).toBe(1e-9);
    expect(CFG.cleanDrivingDistanceM).toBe(250);
  });

  it("no new event kind: a pumped drive's events are its commendations only (no violation, no new code)", () => {
    let s = createRuleEngine();
    const kinds = new Set<string>();
    for (const f of synth(PUMP_9_025_03(30))) {
      const r = reduceTick(s, f);
      s = r.state;
      for (const e of r.events) kinds.add(`${e.kind}:${e.code}`);
    }
    expect([...kinds].every((k) => k === "commendation:CLEAN_DRIVING")).toBe(true);
  });
});
