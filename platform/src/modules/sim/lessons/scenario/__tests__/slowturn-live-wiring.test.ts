/**
 * THE ADDED TURN PATH'S LIVE WIRING (lane slowturn, ruling R14).
 *
 * runtime/turns.ts decides an added turn from the grid state the runtime hands
 * it at one call site (worldRuntime.ts, step 4): the nearest junction node
 * within 40 m, whether that node is on a ring, and the step-3 lane fix (edge
 * index and arclength). The detector's own tests feed it hand-built samples;
 * a mutant that broke a field AT THE CALL SITE survived every one of them (the
 * round-2 verifier's V2: `turnRoadSample.ring = false` added 9 turn events on
 * committed ring demos, 43 cells, with every lane test green). So every field
 * the call site writes is pinned here THROUGH THE LIVE CHAIN (`liveChainReplay`:
 * the real runtime, its Locator and its call site):
 *
 *  - RING — the committed demos of the roundabout lessons: no added event on
 *    any of them (rings are excluded from the added path, ruling R3), and the
 *    four base events the base already fires on a ring node keep their steps;
 *  - NODE — the 14 committed demos whose slow junction turn only the added path
 *    sees: each one's added event, at its grid step;
 *  - LANE FIX (edge index and arclength) — a car that FOLLOWS a road bending
 *    51°–95° through a built d2-v1 junction (the district's own geometry, the
 *    pose generated along its lane centre at 8 and 12 km/h, folded through the
 *    live chain): never an added turn. Without the lane fix's edge the measure
 *    has no road to subtract and the bend reads as a turn; with the arclength
 *    pinned the reference stops following the curve — both are measured to add
 *    an event on these legs (lane PROGRESS.md, round 3).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../../rules/types";
import { parseDistrict } from "../../../runtime";
import { bearingDeg } from "../../../runtime/geometry";
import { DistrictIndex, LANE_WIDTH_M } from "../../../runtime/spatial";
import { parseScenarioTrace } from "../../../traces/parse";
import type { ScenarioTrace, TraceSample } from "../../../traces/types";
import { FIXED_DT } from "../../../vehicle/tuning";
import { compileScenario } from "../compile";
import { SC_ED_D2_CITY_RUN } from "../templates-exam";
import { scenarioById } from "../templates";
import { liveChainReplay } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function turnsOf(lessonId: string, trace: ScenarioTrace, raw?: unknown): string[] {
  const spec = scenarioById(lessonId);
  if (!spec) throw new Error(`no template ${lessonId}`);
  const turns: string[] = [];
  liveChainReplay({
    lesson: compileScenario(spec, 1),
    districtRaw: raw ?? loadDistrict(spec.map.districtId),
    trace,
    applyOutcomes: true,
    holdAfterSec: 0,
    afterApply: ({ t, tick }) => {
      for (const e of tick.events as SimTickEvent[]) {
        if (e.kind === "turnStarted") {
          turns.push(`k${Math.round(t / FIXED_DT)} ${e.direction}${e.addedPath === true ? " ADDED" : ""}`);
        }
      }
    },
  });
  return turns;
}

function committed(lessonId: string, file: string): ScenarioTrace {
  const p = path.join(REPO_ROOT, "content", "traces", lessonId, file);
  if (!existsSync(p)) throw new Error(`missing ${p}`);
  const t = parseScenarioTrace(JSON.parse(readFileSync(p, "utf-8")));
  if (!t) throw new Error(`unparseable ${p}`);
  return t;
}

describe("R14 — RING: the call site's ring flag keeps the added path off every committed roundabout demo", () => {
  // [lesson, demo, the turn events at L1 — the base's own, unchanged (R3)]
  const CELLS: Array<[string, string, string[]]> = [
    ["sc-rb-busy-gap", "shadow-correct.trace.json", []],
    ["sc-rb-circulate-priority", "shadow-correct.trace.json", []],
    ["sc-rb-circulate-priority", "mistake-panic-brake.trace.json", []],
    ["sc-rb-circulate-priority", "mistake-wandering-line.trace.json", ["k2416 right"]],
    ["sc-rb-exit-signal", "shadow-correct.trace.json", []],
    ["sc-rb-exit-signal", "mistake-exit-no-signal.trace.json", ["k3027 right"]],
    ["sc-rb-lane-choice", "shadow-correct.trace.json", []],
    ["sc-rb-lane-choice", "mistake-outer-lane-far-exit.trace.json", []],
    ["sc-rb-lane-choice", "mistake-exit-across-outer.trace.json", ["k3214 right"]],
    ["sc-rb-ped-exit", "shadow-correct.trace.json", []],
    ["sc-rb-ped-exit", "mistake-exit-through-ped.trace.json", []],
    ["sc-roundabout-entry", "shadow-correct.trace.json", []],
    ["sc-roundabout-entry", "mistake-exit-no-signal.trace.json", ["k2405 right"]],
  ];
  it.each(CELLS)("%s/%s L1: no ADDED turn on the ring; the base events as before", (lessonId, file, want) => {
    expect(turnsOf(lessonId, committed(lessonId, file))).toEqual(want);
  });
});

describe("R14 — NODE: the call site's nearest node gives the 14 committed slow junction turns their added event", () => {
  const CELLS: Array<[string, string, string[]]> = [
    ["sc-junction-rhr", "shadow-correct.trace.json", ["k1942 left ADDED"]],
    ["sc-junction-stop", "mistake-rolling-stop.trace.json", ["k1420 right ADDED"]],
    ["sc-junction-stop", "shadow-correct.trace.json", ["k1462 right ADDED"]],
    ["sc-junction-scan", "mistake-no-scan.trace.json", ["k1372 right ADDED"]],
    ["sc-junction-scan", "mistake-single-glance.trace.json", ["k1372 right ADDED"]],
    ["sc-junction-scan", "shadow-correct.trace.json", ["k1855 right ADDED"]],
    ["sc-junction-gap", "mistake-creep-out.trace.json", ["k1184 right ADDED"]],
    ["sc-junction-gap", "mistake-cut-gap.trace.json", ["k1073 right ADDED"]],
    ["sc-junction-gap", "shadow-correct.trace.json", ["k1525 right ADDED"]],
    ["sc-junction-blind", "shadow-correct.trace.json", ["k2797 left ADDED"]],
    ["sc-junction-left", "mistake-creep-out.trace.json", ["k1483 left ADDED"]],
    ["sc-junction-left", "shadow-correct.trace.json", ["k1645 left ADDED"]],
    ["sc-signal-dead", "shadow-correct.trace.json", ["k2140 left ADDED"]],
    ["sc-vu-emergency-junction", "shadow-correct.trace.json", ["k1942 left ADDED"]],
  ];
  it.each(CELLS)("%s/%s L1: %j", (lessonId, file, want) => {
    expect(turnsOf(lessonId, committed(lessonId, file))).toEqual(want);
  });
});

describe("R14 — LANE FIX: a car following a road that bends through a built d2-v1 junction is never an added turn", () => {
  const RAW = loadDistrict(SC_ED_D2_CITY_RUN.map.districtId);
  const district = parseDistrict(RAW);
  const index = new DistrictIndex(district);
  const edgeIdx = (id: string) => {
    const i = index.edges.findIndex((rt) => rt.edge.id === id);
    if (i < 0) throw new Error(`no edge ${id}`);
    return i;
  };

  /** Lane-centre poses: 40 m up to the node along `inId`, 40 m on along `outId`. */
  function followTrace(inId: string, inSign: 1 | -1, outId: string, outSign: 1 | -1, kmh: number): ScenarioTrace {
    const ds = (kmh / 3.6) * FIXED_DT;
    const pts: Array<{ x: number; y: number; h: number }> = [];
    const leg = (e: number, sign: 1 | -1, fromS: number) => {
      const rt = index.edges[e];
      const off = rt.edge.oneway ? 0 : LANE_WIDTH_M / 2;
      for (let d = 0; d <= 40; d += ds) {
        const s = fromS + sign * d;
        if (s < 0 || s > rt.totalLen) break;
        const [px, py] = index.pointAt(e, s);
        const [tx, ty] = index.tangentAt(e, s);
        const dx = tx * sign;
        const dy = ty * sign;
        pts.push({ x: px + dy * off, y: py - dx * off, h: bearingDeg(dx, dy) });
      }
    };
    const e0 = edgeIdx(inId);
    const e1 = edgeIdx(outId);
    const L0 = index.edges[e0].totalLen;
    leg(e0, inSign, inSign > 0 ? Math.max(0, L0 - 40) : Math.min(L0, 40));
    leg(e1, outSign, outSign > 0 ? 0 : index.edges[e1].totalLen);
    const samples: TraceSample[] = pts.map((p, i) => ({
      tSec: (i + 1) * FIXED_DT,
      x: p.x,
      y: p.y,
      headingDeg: p.h,
      steerRad: 0,
      speedKmh: kmh,
      gear: 1,
      indicator: "off",
      brakeOn: false,
      throttleOn: true,
    }));
    return {
      meta: { scenarioId: SC_ED_D2_CITY_RUN.id, kind: "attempt", version: 1, durationSec: samples[samples.length - 1].tSec },
      samples,
      events: [],
    };
  }

  // [node, approach edge (sense), through edge (sense), bend, km/h] — the legs
  // on which the lane fix was measured to matter (r3/legs-edge-sm.txt).
  const LEGS: Array<[string, string, 1 | -1, string, 1 | -1, number, number]> = [
    ["n12520587501", "e1353146267.0", 1, "e1353146267.1", 1, 95, 8],
    ["n12520587501", "e1353146267.0", 1, "e1353146267.1", 1, 95, 12],
    ["n12520587501", "e1353146267.1", -1, "e1353146267.0", -1, 95, 8],
    ["n12520587501", "e1353146267.1", -1, "e1353146267.0", -1, 95, 12],
    ["n7711213955", "e641318853.0", 1, "e641318853.1", 1, 73, 8],
    ["n312251859", "e157729604.0", 1, "e112078636.1", 1, 51, 8],
  ];
  it.each(LEGS)("at %s: %s → %s (%i°) followed at %i km/h — no ADDED turnStarted", (node, inId, inSign, outId, outSign, _bend, kmh) => {
    void node;
    const turns = turnsOf(SC_ED_D2_CITY_RUN.id, followTrace(inId, inSign, outId, outSign, kmh), RAW);
    expect(turns.filter((t) => t.endsWith("ADDED"))).toEqual([]);
  });
});
