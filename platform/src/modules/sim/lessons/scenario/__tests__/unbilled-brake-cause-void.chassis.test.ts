/**
 * ROUND 3 OF LANE flooredinvite ON THE PRODUCT CAR (2026-11-02 ·
 * `sc-follow-tailgater:63c0c28c`; the integrator's Q7 and Q8). The round-2
 * re-judge verifier's chassis drives, rebuilt from its probe: sc-sp-harsh-brake
 * L3, the product chassis (`rapierContactDrive.ts`), the pad's brake by
 * physics step from the frame the car passes `y`. The expected payouts are the
 * BASE (230c7b8) reducer's on the same ticks, measured by the verifier and on
 * this lane (D:/knijka-lanes/scratch/flooredinvite-impl/probes/r3/).
 *
 *  · F1TAIL (Q8) — through the real lesson session, nothing injected: 49.4 км/ч,
 *    full 9 steps / off 6 or 18 / full 9, then 0.72 for 54 steps; no record, no
 *    bill. Round 2 held the payout up to 79 grid points, 29 of them 0.40–0.87 s
 *    after the last credited frame (base's F1 carrying a payout the bridge had
 *    deferred). Now every frame of a delay lies within the sustain of a credit.
 *  · PUMPVOID (Q7) — 54.4 км/ч, full 15 / off 6 or 12 / full 18; the session's
 *    ticks replayed with a junction 20 m ahead from burst 2's 13th step: the
 *    cause arm voids the chain after its pumped frames. Round 2 never paid;
 *    now base's frame. Without the junction the same drive is a pumped record.
 *  · CAUSEVOID (Q7) — 37.4 км/ч, full 12 / off 9 or 15 / full 40; a junction
 *    from burst 2's 34th step voids it after it pumped and floored. Round 2
 *    lost the payout; now it is paid, every frame of the delay within the
 *    sustain of a credit.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { compileScenario } from "../compile";
import { SC_SP_HARSH_BRAKE } from "../templates-sp";
import { driveIntoContact, initRapier, type DriveState } from "./rapierContactDrive";
import { loadDistrict } from "./witnessLiveRung";
import { createRuleEngine, DEFAULT_RULE_CONFIG, lastUnbilledHardBrake, reduceTick, unbilledHardBrakeOfChain } from "../../../rules";
import type { SimTick } from "../../../rules/types";

const SUS = DEFAULT_RULE_CONFIG.harshBrakeSustainSec;

beforeAll(async () => {
  await initRapier();
});

interface Replay {
  clean: number[];
  violations: string[];
  records: string[];
  credited: number[];
  pumped: number;
  floored: number;
  frames: number[];
  /** Q10b: the record of a chain still open when the ticks end (the drive's end closes it). */
  openAtEnd: string | null;
}

function replay(cfg: object, ticks: SimTick[]): Replay {
  let s = createRuleEngine(cfg);
  const out: Replay = { clean: [], violations: [], records: [], credited: [], pumped: 0, floored: 0, frames: [], openAtEnd: null };
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
    if (hb.appPumpedAt === f.t) out.pumped += 1;
    if (hb.flooredAt === f.t) out.floored += 1;
    if (hb.recordSeq !== seq) out.records.push(lastUnbilledHardBrake(hb)!.form);
    out.frames.push(f.t);
  }
  if (s.harshBrake.chainOpen) out.openAtEnd = unbilledHardBrakeOfChain(s.harshBrake, s.config, true)?.form ?? null;
  return out;
}

function drive(cruise: number, Y: number, b1: number, gap: number, b2: number, tailPedal: number, tailSteps: number, causeAtStep: number | null) {
  const lesson = compileScenario(SC_SP_HARSH_BRAKE, 3);
  let p: number | null = null;
  const ticks: SimTick[] = [];
  const o = driveIntoContact({
    lesson,
    raw: loadDistrict(SC_SP_HARSH_BRAKE.map.districtId),
    start: { x: 4.06, y: 15, headingDeg: 0 },
    control: (st: DriveState) => {
      if (p === null && st.y >= Y) p = st.step;
      const end = b1 + gap + b2 + tailSteps;
      if (p === null || st.step - p >= end) {
        const tgt = p === null ? cruise : 30;
        const dv = tgt - st.speedKmh;
        return dv >= 0 ? { throttle: Math.min(1, dv / 4 + 0.15), brake: 0, steer: 0 } : { throttle: 0, brake: p === null ? Math.min(0.3, -dv / 8) : 0, steer: 0 };
      }
      const k = st.step - p;
      if (k < b1) return { throttle: 0, brake: 1, steer: 0 };
      if (k < b1 + gap) return { throttle: 0, brake: 0, steer: 0 };
      if (k < b1 + gap + b2) return { throttle: 0, brake: 1, steer: 0 };
      return { throttle: 0, brake: tailPedal, steer: 0 };
    },
    deltas: [1 / 60],
    maxSteps: 60 * 32,
    onStep: (tick: SimTick) => {
      ticks.push(tick);
    },
  } as never);
  let rt = ticks;
  if (causeAtStep !== null && p !== null) {
    const c0 = p + b1 + gap + causeAtStep + 1;
    rt = ticks.map((k, i) => (i >= c0 && i < c0 + 180 ? { ...k, nextJunctionM: 20 } : k));
  }
  const sessClean = o.session.events
    .filter((e: { kind: string; code?: string }) => e.kind === "commendation" && e.code === "CLEAN_DRIVING")
    .map((e: { t: number }) => e.t);
  return { o, sessClean, rep: replay(lesson.ruleConfig ?? {}, rt), sessRecs: o.result.unbilledHardBrakes?.map((r) => r.form) };
}

/** Paid, never earlier than base, and every frame of the delay within the sustain of a credited frame. */
function withinBound(label: string, paid: number[], base: number[], rep: Replay): number {
  expect(paid.length, `${label}: paid ${paid} base ${base}`).toBe(base.length);
  let delay = 0;
  paid.forEach((c, i) => {
    const b = base[i]!;
    expect(c, label).toBeGreaterThanOrEqual(b - 1e-3);
    delay = Math.max(delay, c - b);
    for (const f of rep.frames) {
      if (f < b - 1e-3 || f >= c - 1e-3) continue;
      const credit = rep.credited.filter((k) => k <= f + 1e-9).pop();
      expect(credit !== undefined && f - credit < SUS - 1e-9, `${label}: frame ${f} of ${b} → ${c}`).toBe(true);
    }
  });
  return delay;
}

describe("Q8 on the product car — the verifier's F1TAIL session drives", () => {
  const rows = [
    { gap: 6, Y: 262, base: [20.0] },
    { gap: 6, Y: 264, base: [20.083] },
    { gap: 18, Y: 260, base: [20.017] },
    { gap: 18, Y: 264, base: [20.083] },
  ] as const;
  for (const r of rows) {
    it(`49.4 км/ч, full 9 / off ${r.gap} / full 9 / 0.72 × 54 from y ${r.Y}: no record, no bill, CLEAN_DRIVING within the sustain of a credit (base ${r.base[0]})`, () => {
      const d = drive(50, r.Y, 9, r.gap, 9, 0.72, 54, null);
      expect(d.sessRecs).toBeUndefined();
      expect(d.rep.violations).toEqual([]);
      expect(d.o.result.completedAll).toBe(true);
      expect(d.sessClean.map((x) => +x.toFixed(4))).toEqual(d.rep.clean.map((x) => +x.toFixed(4)));
      const delay = withinBound(`gap ${r.gap} Y ${r.Y}`, d.sessClean.slice(0, 1), [...r.base], d.rep);
      expect(delay, "the cell is a deferral the bridge made").toBeGreaterThan(0);
    }, 600_000);
  }
});

describe("Q7 on the product car — a pump a cause voids keeps the praise", () => {
  const pumpvoid = [
    { gap: 6, Y: 60, base: 29.0 },
    { gap: 6, Y: 100, base: 26.817 },
    { gap: 12, Y: 60, base: 28.983 },
    { gap: 12, Y: 100, base: 26.783 },
  ] as const;
  for (const r of pumpvoid) {
    it(`PUMPVOID 54.4 км/ч, full 15 / off ${r.gap} / full 18 from y ${r.Y}, a junction from burst 2's 13th step: no record, paid on base's frame (${r.base}); without it, a pumped record`, () => {
      const d = drive(55, r.Y, 15, r.gap, 18, 0, 0, 12);
      expect(d.rep.pumped).toBeGreaterThan(0);
      expect(d.rep.records).toEqual([]);
      expect(d.rep.violations).toEqual([]);
      expect(d.rep.clean.length).toBeGreaterThan(0);
      expect(Math.abs(d.rep.clean[0]! - r.base)).toBeLessThan(1 / 60 / 2);
      // the same session without the junction: the pump is a pumped record, and its praise is withheld
      expect(d.sessRecs).toEqual(["pumped"]);
      expect(d.sessClean.filter((c) => Math.abs(c - r.base) < 1)).toEqual([]);
    }, 600_000);
  }

  const causevoid = [
    { gap: 9, Y: 262, base: [25.25] },
    { gap: 9, Y: 264, base: [25.317] },
    { gap: 15, Y: 262, base: [25.25] },
    { gap: 15, Y: 264, base: [25.317] },
  ] as const;
  for (const r of causevoid) {
    it(`CAUSEVOID 37.4 км/ч, full 12 / off ${r.gap} / full 40 from y ${r.Y}, a junction from burst 2's 34th step: no record — the payout base made (${r.base[0]}) is paid, within the sustain of a credit`, () => {
      const d = drive(38, r.Y, 12, r.gap, 40, 0, 0, 33);
      expect(d.rep.pumped).toBeGreaterThan(0);
      expect(d.rep.floored).toBeGreaterThan(0);
      expect(d.rep.records).toEqual([]);
      expect(d.rep.violations).toEqual([]);
      withinBound(`gap ${r.gap} Y ${r.Y}`, d.rep.clean.slice(0, 1), [...r.base], d.rep);
    }, 600_000);
  }
});

describe("Q9 on the product car — a cause that comes after the pump's last credit has stood the sustain names the pump", () => {
  // The round-3 verifier's PUMPTAILVOID chassis cells (its zzV4Chassis.test.ts,
  // mode pumptailvoid): 54.4 км/ч, full 15 / off 6 / full 18, then the pad at
  // 0.3 for 90 steps; the session's ticks replayed with a junction 20 m ahead
  // from the tail's 86th step. Round 3 voided the chain and paid base's payout
  // only on the void frame (Y 250: 18.983 → 19.650, last credit 18.200; Y 256:
  // 18.750 → 20.050, last credit 18.600). Now: one pumped record, no bill, and
  // no payout over the pump — as the uninjected session already names it.
  const rows = [
    { Y: 250, base: 18.983 },
    { Y: 256, base: 18.75 },
  ] as const;
  for (const r of rows) {
    it(`PUMPTAILVOID 54.4 км/ч, full 15 / off 6 / full 18 / 0.3 × 90 from y ${r.Y}, a junction at the tail's end: one pumped record, no bill, base's payout (${r.base}) withheld`, () => {
      const d = drive(55, r.Y, 15, 6, 18, 0.3, 90, 18 + 90 - 4);
      expect(d.rep.pumped).toBeGreaterThan(0);
      expect(d.rep.records).toEqual(["pumped"]);
      expect(d.rep.violations).toEqual([]);
      const firstCredit = d.rep.credited[0]!;
      expect(firstCredit).toBeLessThan(r.base);
      expect(d.rep.clean.filter((c) => c > firstCredit && c < r.base + 2)).toEqual([]);
      // the uninjected session: the same pump is a pumped record, no praise
      expect(d.sessRecs).toEqual(["pumped"]);
      expect(d.sessClean.filter((c) => c > firstCredit && c < r.base + 2)).toEqual([]);
    }, 600_000);
  }
});

describe("Q10b on the product car — a late cause after a pump that FLOORED keeps the floored record its no-cause drive has", () => {
  // The round-4 verifier's FLOORTAILVOID chassis cells (its zzV5Chassis.test.ts,
  // mode floortailvoid): 37.4 км/ч, full 12 / off 6 / full 30, then the pad at
  // 0.3 for 60 steps; the session's ticks replayed with a junction 20 m ahead
  // from the tail's 56th step. Burst 2 pumps (11 pumped frames) and then floors
  // (20 floored frames). Round 4 folded it as PUMPED — its bullet «Нито един
  // тласък поотделно не задържа…» false of a burst that held the sustain — while
  // the uninjected session is a FLOORED record. Now the replay's record is
  // floored too, nothing is billed and no payout lands over it.
  for (const Y of [230, 240, 250]) {
    it(`FLOORTAILVOID 37.4 км/ч, full 12 / off 6 / full 30 / 0.3 × 60 from y ${Y}, a junction at the tail's end: one floored record (the session's), no bill, no payout`, () => {
      const d = drive(38, Y, 12, 6, 30, 0.3, 60, 30 + 60 - 4);
      expect(d.rep.pumped).toBeGreaterThan(0);
      expect(d.rep.floored).toBeGreaterThan(0);
      expect([...d.rep.records, ...(d.rep.openAtEnd !== null ? [d.rep.openAtEnd] : [])]).toEqual(["floored"]);
      expect(d.rep.violations).toEqual([]);
      expect(d.rep.clean).toEqual([]);
      // the uninjected session: the same brake check is a floored record, no praise
      expect(d.sessRecs).toEqual(["floored"]);
      expect(d.sessClean).toEqual([]);
    }, 600_000);
  }
});

describe("Q10c on the product car — a re-press with the late cause still in reach spends the waiting floored record, as the no-cause drive's re-press does", () => {
  // The round-5 verifier's re-press chassis cells (its zzV6Chassis.test.ts,
  // V6_REL 8): sc-sp-harsh-brake L3; 37.4 км/ч full 12 / off 6 / full 30, or
  // 31 км/ч full 40; then the pad at 0.3 for 30 steps, a junction 20 m ahead
  // from 4 steps before the tail's end for 3 s, off 8 steps, then 0.3 for 60
  // steps (the re-press); a close follower's report (8.3 m/s) 2–30 steps after
  // the re-press began. Round 5 kept the folded floor pending through the
  // re-press (it ran through the cause arm) and the report dropped it: no
  // record in 30 of 30, where the control replay and the uninjected session
  // are floored. Now the record is the control's.
  const rep = { kind: "followerBraked", vehicleId: 7, decelMps2: 9, heldSec: 0.45, qualifiedSec: 0.45, shedMps: 4, speedMps: 8.3, gapM: 4 };
  function repressDrive(cruise: number, Y: number, b1: number, gap: number, b2: number) {
    const lesson = compileScenario(SC_SP_HARSH_BRAKE, 3);
    const tailN = 30;
    const relN = 8;
    const end = b1 + gap + b2 + tailN + relN + 60;
    let p: number | null = null;
    const ticks: SimTick[] = [];
    const o = driveIntoContact({
      lesson,
      raw: loadDistrict(SC_SP_HARSH_BRAKE.map.districtId),
      start: { x: 4.06, y: 15, headingDeg: 0 },
      control: (st: DriveState) => {
        if (p === null && st.y >= Y) p = st.step;
        if (p === null || st.step - p >= end) {
          const tgt = p === null ? cruise : 30;
          const dv = tgt - st.speedKmh;
          return dv >= 0 ? { throttle: Math.min(1, dv / 4 + 0.15), brake: 0, steer: 0 } : { throttle: 0, brake: p === null ? Math.min(0.3, -dv / 8) : 0, steer: 0 };
        }
        const k = st.step - p;
        if (k < b1) return { throttle: 0, brake: 1, steer: 0 };
        if (k < b1 + gap) return { throttle: 0, brake: 0, steer: 0 };
        if (k < b1 + gap + b2) return { throttle: 0, brake: 1, steer: 0 };
        if (k < b1 + gap + b2 + tailN) return { throttle: 0, brake: 0.3, steer: 0 };
        if (k < b1 + gap + b2 + tailN + relN) return { throttle: 0, brake: 0, steer: 0 };
        return { throttle: 0, brake: 0.3, steer: 0 };
      },
      deltas: [1 / 60],
      maxSteps: 60 * 32,
      onStep: (tick: SimTick) => {
        ticks.push(tick);
      },
    } as never);
    const cfg = lesson.ruleConfig ?? {};
    const c0 = p! + b1 + gap + b2 + tailN - 4 + 1;
    const cells = [2, 6, 12, 20, 30].map((d) => {
      const ri = p! + b1 + gap + b2 + tailN + relN + d + 1;
      const withRep = ticks.map((k, i) => (i === ri ? { ...k, events: [...(k.events ?? []), rep as never] } : k));
      const withCause = withRep.map((k, i) => (i >= c0 && i < c0 + 180 ? { ...k, nextJunctionM: 20 } : k));
      return { d, tree: replay(cfg, withCause), ctl: replay(cfg, withRep) };
    });
    return { cells, sessRecs: o.result.unbilledHardBrakes?.map((r) => r.form) };
  }
  const forms = (r: Replay) => [...r.records, ...(r.openAtEnd !== null ? [r.openAtEnd] : [])];
  for (const Y of [230, 240, 250]) {
    for (const shape of ["pump-floor 37.4 км/ч full 12 / off 6 / full 30", "single 31 км/ч full 40"] as const) {
      it(`${shape} from y ${Y}, a late junction, a release of 8 steps, a re-press under it and a report 2–30 steps later: the floored record stands (the control's and the session's), nothing billed`, () => {
        const single = shape.startsWith("single");
        const d = single ? repressDrive(31, Y, 0, 0, 40) : repressDrive(38, Y, 12, 6, 30);
        expect(d.sessRecs).toEqual(["floored"]);
        for (const c of d.cells) {
          const label = `report ${c.d} steps after the re-press`;
          expect(c.tree.floored, label).toBeGreaterThan(0);
          expect(c.tree.violations, label).toEqual([]);
          expect(c.ctl.violations, label).toEqual([]);
          expect(forms(c.tree), label).toEqual(["floored"]);
          expect(forms(c.tree), label).toEqual(forms(c.ctl));
          expect(c.tree.clean, label).toEqual(c.ctl.clean);
        }
      }, 600_000);
    }
  }
});

describe("Q10f on the product car — a late cause that leaves reach while the pedal is down, a short release and a firm re-press: ONE chain, the no-cause drive's record", () => {
  // The round-6 verifier's split chassis cells (its zzV7Chassis.test.ts):
  // sc-sp-harsh-brake L3; full 15 / off 6 / full 18 steps (a pump), then the
  // pad at 0.3 for 40 steps, a 4-step junction pulse injected into the replayed
  // ticks 6 steps before that tail ends, off for `rel` steps, full pad for 30.
  // Round 6 closed the chain on the fold frame, so the re-press began a second
  // chain: at 54.4 км/ч [pumped, floored] where the control replay and the
  // uninjected session give one floored record; at 70 км/ч a pumped record
  // named beside the bill of the same brake check, where they give none.
  const full = (r: ReturnType<typeof createRuleEngine>["harshBrake"]) => {
    const x = lastUnbilledHardBrake(r)!;
    return `${x.form}|${x.onsetKmh}|${x.shownKmh}|${x.sinceSec}|${x.atSec}`;
  };
  function replayFull(cfg: object, ticks: SimTick[]) {
    let s = createRuleEngine(cfg);
    const out = { records: [] as string[], violations: [] as string[], clean: [] as number[] };
    for (const f of ticks) {
      const seq = s.harshBrake.recordSeq;
      const r = reduceTick(s, f);
      s = r.state;
      for (const e of r.events) {
        if (e.kind === "commendation" && e.code === "CLEAN_DRIVING") out.clean.push(e.t);
        if (e.kind === "violation") out.violations.push(`${e.code}@${e.t.toFixed(3)}`);
      }
      if (s.harshBrake.recordSeq !== seq) out.records.push(full(s.harshBrake));
    }
    if (s.harshBrake.chainOpen) {
      const x = unbilledHardBrakeOfChain(s.harshBrake, s.config, true);
      if (x) out.records.push(`${x.form}|${x.onsetKmh}|${x.shownKmh}|${x.sinceSec}|${x.atSec}`);
    }
    return out;
  }
  function splitDrive(cruise: number, Y: number, rel: number) {
    const lesson = compileScenario(SC_SP_HARSH_BRAKE, 3);
    const [b1, gap, b2, tailN, reN] = [15, 6, 18, 40, 30];
    const end = b1 + gap + b2 + tailN + rel + reN;
    let p: number | null = null;
    const ticks: SimTick[] = [];
    const o = driveIntoContact({
      lesson,
      raw: loadDistrict(SC_SP_HARSH_BRAKE.map.districtId),
      start: { x: 4.06, y: 15, headingDeg: 0 },
      control: (st: DriveState) => {
        if (p === null && st.y >= Y) p = st.step;
        if (p === null || st.step - p >= end) {
          const tgt = p === null ? cruise : 30;
          const dv = tgt - st.speedKmh;
          return dv >= 0 ? { throttle: Math.min(1, dv / 4 + 0.15), brake: 0, steer: 0 } : { throttle: 0, brake: p === null ? Math.min(0.3, -dv / 8) : 0, steer: 0 };
        }
        const k = st.step - p;
        if (k < b1) return { throttle: 0, brake: 1, steer: 0 };
        if (k < b1 + gap) return { throttle: 0, brake: 0, steer: 0 };
        if (k < b1 + gap + b2) return { throttle: 0, brake: 1, steer: 0 };
        if (k < b1 + gap + b2 + tailN) return { throttle: 0, brake: 0.3, steer: 0 };
        if (k < b1 + gap + b2 + tailN + rel) return { throttle: 0, brake: 0, steer: 0 };
        return { throttle: 0, brake: 1, steer: 0 };
      },
      deltas: [1 / 60],
      maxSteps: 60 * 32,
      onStep: (tick: SimTick) => {
        ticks.push(tick);
      },
    } as never);
    const cfg = lesson.ruleConfig ?? {};
    const c0 = p! + b1 + gap + b2 + tailN - 6 + 1;
    const withCause = ticks.map((k, i) => (i >= c0 && i < c0 + 4 ? { ...k, nextJunctionM: 20 } : k));
    return {
      tree: replayFull(cfg, withCause),
      ctl: replayFull(cfg, ticks),
      sess: (o.result.unbilledHardBrakes ?? []).map((r) => `${r.form}|${r.onsetKmh}|${r.shownKmh}|${r.sinceSec}|${r.atSec}`),
    };
  }
  for (const [cruise, expectForms, bills] of [
    [54.4, ["floored"], 0],
    [70, [], 1],
  ] as const) {
    for (const rel of [6, 12]) {
      it(`${cruise} км/ч from y 240, a release of ${rel} steps: ${expectForms.length ? expectForms.join(", ") : "no record beside the bill"} — the control's and the session's`, () => {
        const d = splitDrive(cruise, 240, rel);
        expect(d.ctl.records.map((x) => x.split("|")[0])).toEqual(expectForms);
        expect(d.tree.records, "the control replay's record").toEqual(d.ctl.records);
        expect(d.tree.records, "the uninjected session's record").toEqual(d.sess);
        expect(d.tree.violations.filter((v) => v.startsWith("HARSH")).length).toBe(bills);
        expect(d.tree.violations).toEqual(d.ctl.violations);
        expect(d.tree.clean).toEqual(d.ctl.clean);
      }, 600_000);
    }
  }
});
