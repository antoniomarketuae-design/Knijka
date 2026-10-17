/**
 * sc-sig-controller-postures:5ee4301e [critical] — the drill-level witnesses: ambient cross traffic at the
 * регулировчик's junction obeys HIM, so a careful student who goes on «proceed» is never hit.
 *
 * WHAT WAS FILED (triage 2026-10-10, measured at 59be0de, re-measured on this lane's base 2e9268f): every east-west
 * ambient car at sx-v1 read the N-S lamp (`runtime.signalPhase("sx-n-c")`, the node's own group) and nothing read the
 * officer. After he turns side-on to the student (east-west HALTED) a westbound car left its line at ~16.5 km/h into
 * the box exactly when the student is told to go; in the rig-tape matrix below 10 of 100 ambient-on cells ended
 * COLLISION · 10 т. · НЕИЗДЪРЖАН with the officer saying «proceed» at the crossing.
 *
 * THE WITNESSES, all through the live chain (`liveChainReplay`: the live world, the grade grid, the compiled rung's
 * ambient fleet), each red at base:
 *   1. A CAREFUL STUDENT: drive up, stop at y = −31, hold, go on «proceed» — at every departure from 0.1 s after the
 *      flip to 30 s after it, L1 and L3: no COLLISION, no contact with an ambient car, and no east-west ambient car
 *      enters the box once the officer's arm is up («Спират ВСИЧКИ») or after his flip (east-west halted). Base: the
 *      departures at 49.2 and 50 s (and 52 s at L3) end COLLISION; east-west cars enter the box after the flip.
 *   2. THE RIG TAPES (the careful closed-loop drives of the dark-lamp lane's fixture, shifted 0–45 s, pc and phone
 *      cadence, L1 and L3): no ambient contact in any of the 100 cells. Base: 10.
 *   3. THE DRILLS' OWN DEMOS (shadow + every mistake of the three controller templates, every rung, ambient on as
 *      shipped): no ambient contact. This is the witness for the ambient LEFT-TURNER's yield (traffic/vehicles.ts
 *      `studentHoldsBox`): released with the student by the officer, a southbound turner used to stop across his
 *      lane on the postures and controller shadows (L1–L4 / L3–L5) once the cross traffic obeyed him.
 *
 * The officer's flip is latched by the controller runner on the first director input at ≥ 5 km/h
 * (runners.ts CONTROLLER_DRIVE_START_KMH, copied by value as controller-dark-lamp-approach-phase.test.ts does), plus the
 * template's `flipAtSec`; his raised-arm window is the CONTROLLER_ATTENTION_LEAD_SEC before it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTROLLER_ATTENTION_LEAD_SEC } from "../../../contracts";
import { parseScenarioTrace } from "../../../traces/parse";
import type { ScenarioTrace, TraceIndicator, TraceSample } from "../../../traces/types";
import { compileScenario } from "../compile";
import { SC_SIGNAL_CONTROLLER } from "../templates-signals";
import { SC_SIG_CONTROLLER_LIVE, SC_SIG_CONTROLLER_POSTURES, SC_SIG_CONTROLLER_POSTURES_EVENT } from "../templates-signals2";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";

const REPO_ROOT = path.join(process.cwd(), "..");
const SX = loadDistrict("sx-v1");
/** runners.ts CONTROLLER_DRIVE_START_KMH (module-private; copied by value). */
const DRIVE_START_KMH = 5;
const FLIP_AFTER_START_SEC = SC_SIG_CONTROLLER_POSTURES_EVENT.flipAtSec as number;
const LANE_X = 4.0625;
const TIMEOUT = 1_200_000;

/** A careful student: up to 30 km/h, stop with the car at y = stopY, hold, at tGo pull away at 2 m/s² to 30 km/h. */
function carefulTape(stopY: number, tGo: number): ScenarioTrace {
  const samples: TraceSample[] = [];
  const dt = 0.05;
  const vmax = 30 / 3.6;
  let y = -105;
  let v = 0;
  let t = 0;
  let phase: "approach" | "hold" | "go" = "approach";
  while (y < 70 && t < 200) {
    if (phase === "approach") {
      const dStop = stopY - y;
      if (dStop <= (v * v) / (2 * 1.5) + 0.05) v = Math.max(0, v - 1.5 * dt);
      else v = Math.min(vmax, v + 1.5 * dt);
      if (v === 0 && dStop < 1) phase = "hold";
    } else if (phase === "hold") {
      v = 0;
      if (t >= tGo) phase = "go";
    } else {
      v = Math.min(vmax, v + 2 * dt);
    }
    samples.push({
      tSec: +t.toFixed(4),
      x: LANE_X,
      y,
      headingDeg: 0,
      steerRad: 0,
      speedKmh: v * 3.6,
      gear: 1,
      indicator: "off",
      brakeOn: phase !== "go" && v === 0,
      throttleOn: v > 0,
    });
    y += v * dt;
    t += dt;
  }
  return {
    meta: { scenarioId: SC_SIG_CONTROLLER_POSTURES.id, kind: "attempt", version: 1, durationSec: samples[samples.length - 1].tSec },
    samples,
    events: [],
  } as ScenarioTrace;
}

describe("the регулировчик's cross traffic obeys him (5ee4301e)", () => {
  it("a careful student going on «proceed» is never hit, and no east-west car enters the box under his raised arm or halt", () => {
    const offsets = [0.1, 0.5, 1, 1.5, 2, 3, 4, 6, 9, 14, 17, 18.3, 19.1, 21, 24, 29];
    for (const L of [1, 3] as ScenarioLevel[]) {
      for (const off of offsets) {
        // The student starts moving at once, so the flip lands at (first ≥ 5 km/h tick) + flipAtSec; the tape is
        // re-cut after the run to that measured instant.
        let startedAt: number | null = null;
        const entries: Array<{ t: number; id: number; kmh: number }> = [];
        const prevAbsX = new Map<number, number>();
        const tGo = 0.9 + FLIP_AFTER_START_SEC + off; // the 0.9 s start latch measured on this tape
        const out = liveChainReplay({
          lesson: compileScenario(SC_SIG_CONTROLLER_POSTURES, L),
          districtRaw: SX,
          trace: carefulTape(-31, tGo),
          holdAfterSec: 2,
          afterApply: ({ t, tick, traffic }) => {
            if (startedAt === null && Math.abs(tick.speedKmh) >= DRIVE_START_KMH) startedAt = t;
            for (const v of traffic.vehicles) {
              if (v.id >= 1000) continue;
              if (Math.abs(v.y) > 12) {
                prevAbsX.delete(v.id);
                continue;
              }
              const was = prevAbsX.get(v.id);
              if (was !== undefined && was > 26 && Math.abs(v.x) <= 26) entries.push({ t, id: v.id, kmh: v.speedMps * 3.6 });
              prevAbsX.set(v.id, Math.abs(v.x));
            }
          },
        });
        const cell = `L${L} go at flip + ${off} s`;
        expect(startedAt, cell).not.toBeNull();
        const flipAt = (startedAt as unknown as number) + FLIP_AFTER_START_SEC;
        expect(Math.abs(tGo - flipAt - off), `${cell}: the tape's departure is where it was meant to be`).toBeLessThan(0.2);
        expect(out.violationCodes, cell).not.toContain("COLLISION");
        expect(out.ambientContacts, cell).toEqual([]);
        const underArmOrHalt = entries.filter((e) => e.t >= flipAt - CONTROLLER_ATTENTION_LEAD_SEC);
        expect(underArmOrHalt, cell).toEqual([]);
      }
    }
  }, TIMEOUT);

  it("the dark-lamp lane's careful rig tapes, shifted 0–45 s, pc and phone, L1/L3: no contact with an ambient car", () => {
    const RIG = JSON.parse(
      readFileSync(path.join(__dirname, "controller-dark-lamp-rig-w3a.fixture.json"), "utf-8"),
    ) as {
      drives: Record<string, { level: number; rows: Array<[number, number, number, number, number, number, TraceIndicator]> }>;
      phoneFrameDeltasSec: number[];
    };
    const tape = (cell: string, deadSec: number): ScenarioTrace => {
      const rows = RIG.drives[cell].rows;
      const samples: TraceSample[] = [];
      const at = (t: number, r: (typeof rows)[number], v: number): TraceSample => ({
        tSec: t,
        x: r[1],
        y: r[2],
        headingDeg: r[3],
        steerRad: 0,
        speedKmh: v,
        gear: r[5],
        indicator: r[6],
        brakeOn: v < 0.5,
        throttleOn: v >= 0.5,
      });
      samples.push(at(0, rows[0], 0));
      for (const r of rows) {
        const t = r[0] + deadSec;
        if (t <= samples[samples.length - 1].tSec + 1e-9) continue;
        samples.push(at(t, r, r[4]));
      }
      return {
        meta: { scenarioId: SC_SIG_CONTROLLER_POSTURES.id, kind: "attempt", version: 1, durationSec: samples[samples.length - 1].tSec },
        samples,
        events: [],
      } as ScenarioTrace;
    };
    const hits: string[] = [];
    let cells = 0;
    for (const cell of Object.keys(RIG.drives)) {
      const phone = cell.startsWith("phone");
      for (let dead = 0; dead <= 45; dead += 5) {
        for (const L of [1, 3] as ScenarioLevel[]) {
          cells++;
          const out = liveChainReplay({
            lesson: compileScenario(SC_SIG_CONTROLLER_POSTURES, L),
            districtRaw: SX,
            trace: tape(cell, dead),
            holdAfterSec: 2,
            ...(phone ? { frameDeltas: RIG.phoneFrameDeltasSec } : {}),
          });
          if (out.ambientContacts.length > 0 || out.violationCodes.includes("COLLISION")) {
            hits.push(`${cell}/D${dead}/L${L}: ${out.violationCodes.join("+")}`);
          }
        }
      }
    }
    expect(cells).toBe(100);
    expect(hits).toEqual([]);
  }, TIMEOUT);

  it("the three controller drills' own demos, every rung, ambient on: no contact with an ambient car", () => {
    const hits: string[] = [];
    let cells = 0;
    for (const spec of [SC_SIGNAL_CONTROLLER, SC_SIG_CONTROLLER_LIVE, SC_SIG_CONTROLLER_POSTURES] as ScenarioSpec[]) {
      const demos = [spec.shadow!.path, ...(spec.mistakes ?? []).map((m) => m.traceRef.path)];
      const raw = loadDistrict(spec.map.districtId);
      for (const lv of spec.levels ?? []) {
        for (const p of demos) {
          const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, p), "utf-8")))!;
          cells++;
          const out = liveChainReplay({ lesson: compileScenario(spec, lv.level as ScenarioLevel), districtRaw: raw, trace });
          if (out.ambientContacts.length > 0) hits.push(`${spec.id} L${lv.level} ${path.basename(p)}: ${out.violationCodes.join("+")}`);
        }
      }
    }
    expect(cells).toBeGreaterThan(30);
    expect(hits).toEqual([]);
  }, TIMEOUT);
});
