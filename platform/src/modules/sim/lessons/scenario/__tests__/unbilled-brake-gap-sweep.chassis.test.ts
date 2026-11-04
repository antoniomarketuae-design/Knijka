/**
 * THE GAP SWEEP ON THE PRODUCT CAR (2026-11-01 · `sc-follow-tailgater:63c0c28c`;
 * the integrator's P1/P2 and the brief's stop rule). The drafter's sweep ran on
 * a SYNTHETIC car (9.17 m/s² full pedal above 12 км/ч), and that car floors the
 * PUMP245 pedal where the product does not — so the cells are re-measured
 * here on the product's own chassis (`createHeadlessChassis` + `VehicleSim` on
 * rapier, stepped as @react-three/rapier steps it — `rapierContactDrive.ts`),
 * graded by the real session at every grid point.
 *
 * THE PEDAL: on sc-sp-harsh-brake (a straight, empty street: no lead, no line,
 * no junction near — the lesson's own phantom-slam ground), the car is brought
 * to `onset` км/ч, and from y 150 the pad's brake goes to 1.00 for 12 physics
 * steps (0.2 s), to 0 for `g` steps, and back to 1.00 to rest — PUMP245's
 * pedal, at onsets 20 / 24.43 / 30 / 50 / 60 км/ч and releases of 1 … 30 grid points.
 *
 * THE RULE PINNED, per cell: while the release is shorter than the sustain the
 * brake check is BILLED, FLOORED or PUMPED — never «none», and never a
 * CLEAN_DRIVING whose 250 m holds it; once the release has reached the sustain
 * the two presses are two brakes that are over (P2's stated narrowing), each
 * graded on its own. Every cell's answer is printed by the test name's table.
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";
import { compileScenario } from "../compile";
import { SC_SP_HARSH_BRAKE } from "../templates-sp";
import { driveIntoContact, initRapier, type DriveState } from "./rapierContactDrive";
import { loadDistrict } from "./witnessLiveRung";
import { DEFAULT_RULE_CONFIG } from "../../../rules";
import type { SimTick } from "../../../rules/types";
import type { ScenarioLevel } from "../types";

const CFG = DEFAULT_RULE_CONFIG;
const BRAKE_AT_Y = 150;
const SUSTAIN_POINTS = Math.round(CFG.harshBrakeSustainSec * 60);

beforeAll(async () => {
  await initRapier();
});

interface Cell {
  onset: number;
  gap: number;
  verdict: "billed" | "floored" | "pumped" | "none";
  onsetSeen: number;
  clean: number[];
  pedalAt: number;
  restAt: number | null;
}

function driveCell(onset: number, gap: number): Cell {
  const lesson = compileScenario(SC_SP_HARSH_BRAKE, 3);
  let pedalStep: number | null = null;
  let onsetSeen = 0;
  let restAt: number | null = null;
  const clean: number[] = [];
  let pedalAt = 0;
  const o = driveIntoContact({
    lesson,
    raw: loadDistrict(SC_SP_HARSH_BRAKE.map.districtId),
    start: { x: 4.06, y: 15, headingDeg: 0 },
    control: (st: DriveState) => {
      if (pedalStep === null && st.y >= BRAKE_AT_Y) {
        pedalStep = st.step;
        onsetSeen = st.speedKmh;
      }
      if (pedalStep === null) {
        const dv = onset - st.speedKmh;
        return dv >= 0 ? { throttle: Math.min(1, dv / 4 + 0.15), brake: 0, steer: 0 } : { throttle: 0, brake: Math.min(0.3, -dv / 8), steer: 0 };
      }
      const k = st.step - pedalStep;
      if (restAt === null && k > 12 + gap && st.speedKmh < 0.5) restAt = st.step;
      if (restAt !== null && st.step - restAt > 90) return { throttle: 0, brake: 1, steer: 0 };
      if (k < 12) return { throttle: 0, brake: 1, steer: 0 };
      if (k < 12 + gap) return { throttle: 0, brake: 0, steer: 0 };
      return { throttle: 0, brake: 1, steer: 0 };
    },
    deltas: [1 / 60],
    maxSteps: 60 * 40,
    onStep: (tick: SimTick, step: { state: { rules: { harshBrake: { flooredAt: number | null; appPumpedAt: number | null } } }; hudEvents: unknown[] }) => {
      if (pedalStep !== null && pedalAt === 0) pedalAt = tick.t;
      void step;
    },
  } as never);
  for (const e of o.session.events) if (e.kind === "commendation" && (e as { code: string }).code === "CLEAN_DRIVING") clean.push(e.t);
  const harsh =
    o.session.events.some((e) => e.kind === "violation" && (e as { code: string }).code === "HARSH_BRAKING_NO_CAUSE") ||
    (o.result.coachedMistakes ?? []).some((c) => c.code === "HARSH_BRAKING_NO_CAUSE");
  const recs = o.result.unbilledHardBrakes ?? [];
  const verdict: Cell["verdict"] = harsh ? "billed" : recs.some((r) => r.form === "floored") ? "floored" : recs.some((r) => r.form === "pumped") ? "pumped" : "none";
  return { onset, gap, verdict, onsetSeen, clean, pedalAt, restAt };
}

describe("THE GAP SWEEP ON THE PRODUCT CAR — PUMP245's pedal (0.2 s full, g grid points off, full to rest)", () => {
  for (const onset of [20, 24.43, 30, 50, 60]) {
    it(`from ${onset} км/ч, g = 1 … 30: every cell under the sustain billed, floored or pumped; never a praise over it`, () => {
      const row: string[] = [];
      const bad: string[] = [];
      for (let g = 1; g <= 30; g++) {
        const c = driveCell(onset, g);
        row.push(c.verdict === "billed" ? "B" : c.verdict === "floored" ? "F" : c.verdict === "pumped" ? "P" : ".");
        if (g < SUSTAIN_POINTS && c.verdict === "none") bad.push(`g${g}: none (onset seen ${c.onsetSeen.toFixed(2)})`);
        // the brake starts after 135 m: no 250 m window can hold it and complete before the drive ends unscoped
        if (c.verdict !== "billed" && c.verdict !== "none" && c.clean.some((t) => t > c.pedalAt)) {
          bad.push(`g${g}: CLEAN_DRIVING after the pedal at ${c.clean.filter((t) => t > c.pedalAt).map((t) => t.toFixed(2))}`);
        }
      }
      // the table, for the report
      const line = `[gap-sweep] ${String(onset).padStart(2)} км/ч  ${row.join("")}  (g 1..30; B billed, F floored, P pumped, . none)`;
      console.log(line);
      if (process.env.FI_SWEEP_OUT) appendFileSync(process.env.FI_SWEEP_OUT, line + "\n");
      expect(bad).toEqual([]);
    }, 1_800_000);
  }
});

/**
 * THE ROUND-1 VERIFIER'S CHASSIS DRIVE (2026-11-02, round 2 — the integrator's Q1; the verifier's
 * attempts/zzVerifyChassis.test.ts ported): sc-sp-harsh-brake at 45 км/ч, from y 250 the pad's brake 1.00 for
 * `bite` physics steps, then `soft` to rest, `rest` s at rest, then off at 30 км/ч. One or two credited frames at
 * the start of a gentle causeless stop: no record, no bill. Round 1's hold lasted the whole application plus the
 * sustain, and CLEAN_DRIVING moved 22.050 → 29.333 s (21.967 → 26.483 with no rest). The expected payouts are the
 * base (230c7b8) session's, measured on these very drives: none carries a record, so none may move.
 */
function verifierDrive(level: ScenarioLevel, brakeY: number, bite: number, soft: number, restSec: number, cruise: number) {
  const lesson = compileScenario(SC_SP_HARSH_BRAKE, level);
  let pedalStep: number | null = null;
  let restAt: number | null = null;
  const o = driveIntoContact({
    lesson,
    raw: loadDistrict(SC_SP_HARSH_BRAKE.map.districtId),
    start: { x: 4.06, y: 15, headingDeg: 0 },
    control: (st: DriveState) => {
      if (pedalStep === null && st.y >= brakeY) pedalStep = st.step;
      if (pedalStep === null) {
        const dv = cruise - st.speedKmh;
        return dv >= 0 ? { throttle: Math.min(1, dv / 4 + 0.15), brake: 0, steer: 0 } : { throttle: 0, brake: Math.min(0.3, -dv / 8), steer: 0 };
      }
      const k = st.step - pedalStep;
      if (restAt === null && k > bite && st.speedKmh < 0.3) restAt = st.step;
      if (restAt !== null) {
        if (st.step - restAt < restSec * 60) return { throttle: 0, brake: 1, steer: 0 };
        const dv = 30 - st.speedKmh;
        return { throttle: dv > 0 ? 0.5 : 0, brake: 0, steer: 0 };
      }
      if (k < bite) return { throttle: 0, brake: 1, steer: 0 };
      return { throttle: 0, brake: soft, steer: 0 };
    },
    deltas: [1 / 60],
    maxSteps: 60 * 70,
  } as never);
  const clean = o.session.events.filter((e) => e.kind === "commendation" && (e as { code: string }).code === "CLEAN_DRIVING").map((e) => e.t);
  const harsh = o.session.events.some((e) => e.kind === "violation" && (e as { code: string }).code === "HARSH_BRAKING_NO_CAUSE");
  return { clean, harsh, recs: o.result.unbilledHardBrakes, completedAll: o.result.completedAll };
}

describe("THE BOUNDED HOLD ON THE PRODUCT CAR — the round-1 verifier's drive pays CLEAN_DRIVING on base's frame", () => {
  const rows = [
    { level: 3, brakeY: 250, bite: 3, soft: 0.25, rest: 3, base: 22.05 },
    { level: 3, brakeY: 250, bite: 4, soft: 0.3, rest: 3, base: 22.133 },
    { level: 3, brakeY: 252, bite: 3, soft: 0.25, rest: 0, base: 21.967 },
    { level: 1, brakeY: 250, bite: 3, soft: 0.25, rest: 3, base: 22.05 },
    { level: 3, brakeY: 250, bite: 0, soft: 0.25, rest: 3, base: 22.0 },
  ] as const;
  for (const r of rows) {
    it(`L${r.level}, 45 км/ч, ${r.bite} steps full then ${r.soft} to rest, ${r.rest} s at rest: no record, no bill, CLEAN_DRIVING at ${r.base} s`, () => {
      const d = verifierDrive(r.level, r.brakeY, r.bite, r.soft, r.rest, 45);
      expect(d.recs).toBeUndefined();
      expect(d.harsh).toBe(false);
      expect(d.completedAll).toBe(true);
      expect(d.clean.length).toBeGreaterThan(0);
      expect(d.clean[0]).toBeCloseTo(r.base, 3);
    }, 600_000);
  }
});
