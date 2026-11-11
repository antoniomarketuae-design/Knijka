/**
 * T-EXAM harness (lane slowturn2, sc-turn-left-oncoming:1613ef2c) — a slow left turn at the exam drill's graded node
 * d2-v1 n4547529959, from e856821052.0 onto e23040421.0, against the REAL TrafficSystem with an ambient agent seeded
 * by the live scene's own anchor seeding (`buildLiveWorld`: anchor = the lesson's spawn pose, `anchorRadiusM`,
 * `vehicleCount`; no staged actor), run through `liveChainReplay`.
 *
 * The student's open-loop pose is the traffic model's own lane geometry for that turn: the upstream lane
 * e855867078.0 into n6309210293, e856821052.0 to its connector's `exitS`, the connector (graph.ts laneConnector)
 * and e23040421.0 on from `entryS` — the line an ambient car making the same turn drives. He stands at
 * `standM` short of n6309210293 until `goSec`, then drives it at `approachKmh`, and the turn at `turnKmh`.
 */
import { compileScenario } from "../compile";
import { SC_ED_D2_PRIORITY_RUN } from "../templates-exam";
import { loadDistrict } from "./witnessLiveRung";
import { buildLaneGraph, laneConnector, type DirectedLane, type LaneGraph } from "../../../traffic/graph";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../../traffic/types";
import type { ScenarioTrace, TraceSample } from "../../../traces/types";
import type { LessonSpec } from "../../../contracts";

export const EXAM_NODE = "n4547529959";

export interface ExamDriveSpec {
  /** Ambient fleet size and seeding radius around the lesson's spawn (the live scene's anchor seeding). */
  vehicleCount: number;
  anchorRadiusM: number;
  /** Seconds he stands before moving off. */
  goSec: number;
  approachKmh: number;
  turnKmh: number;
  /** Metres short of n6309210293 he stands (default 50). */
  standM?: number;
  /** Seconds after the path ends (he stands on the exit lane). */
  tailSec?: number;
}

let graph: LaneGraph | null = null;
function g(): LaneGraph {
  graph ??= buildLaneGraph(loadDistrict("d2-v1") as TrafficDistrict, {
    laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
    excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
    crossingSignalRadiusM: 45,
  });
  return graph;
}
function lane(edgeId: string, toNode?: string, fromNode?: string): DirectedLane {
  const l = g().lanes.find((x) => x.edgeId === edgeId && (toNode === undefined || x.toNode === toNode) && (fromNode === undefined || x.fromNode === fromNode));
  if (!l) throw new Error(`lane ${edgeId}`);
  return l;
}
/** Points of polyline (px, py, cum) between arcs a < b. */
function slice(p: { px: ArrayLike<number>; py: ArrayLike<number>; cum: ArrayLike<number> }, a: number, b: number, out: Array<[number, number]>): void {
  const n = p.cum.length;
  const at = (s: number): [number, number] => {
    let i = 0;
    while (i < n - 2 && p.cum[i + 1] < s) i++;
    const seg = p.cum[i + 1] - p.cum[i];
    const u = seg > 0 ? Math.min(1, Math.max(0, (s - p.cum[i]) / seg)) : 0;
    return [p.px[i] + (p.px[i + 1] - p.px[i]) * u, p.py[i] + (p.py[i + 1] - p.py[i]) * u];
  };
  out.push(at(a));
  for (let i = 0; i < n; i++) if (p.cum[i] > a && p.cum[i] < b) out.push([p.px[i], p.py[i]]);
  out.push(at(b));
}

/** The turn's centre-line, the arc at which the connector begins, and the spawn pose. */
export function examTurnPath(standM = 50): { pts: Array<[number, number]>; cum: number[]; turnFromS: number } {
  const up = lane("e855867078.0", "n6309210293");
  const mine = lane("e856821052.0", EXAM_NODE);
  const exit = lane("e23040421.0", undefined, EXAM_NODE);
  const c0 = laneConnector(g(), up, mine);
  const c1 = laneConnector(g(), mine, exit);
  const pts: Array<[number, number]> = [];
  slice(up, Math.max(0, up.length - standM), c0.length > 0 ? c0.exitS : up.length, pts);
  if (c0.length > 0) slice(c0, 0, c0.length, pts);
  slice(mine, c0.length > 0 ? c0.entryS : 0, c1.exitS, pts);
  const beforeTurn = pts.length;
  slice(c1, 0, c1.length, pts);
  slice(exit, c1.entryS, c1.entryS + 45, pts);
  const clean: Array<[number, number]> = [];
  for (const q of pts) if (clean.length === 0 || Math.hypot(q[0] - clean[clean.length - 1][0], q[1] - clean[clean.length - 1][1]) > 1e-6) clean.push(q);
  const cum = [0];
  for (let i = 1; i < clean.length; i++) cum.push(cum[i - 1] + Math.hypot(clean[i][0] - clean[i - 1][0], clean[i][1] - clean[i - 1][1]));
  const tq = pts[beforeTurn - 1];
  let turnFromS = 0;
  for (let i = 0; i < clean.length; i++) if (Math.hypot(clean[i][0] - tq[0], clean[i][1] - tq[1]) < 1e-6) turnFromS = cum[i];
  return { pts: clean, cum, turnFromS };
}

export function examDrive(spec: ExamDriveSpec): { lesson: LessonSpec; districtRaw: unknown; trace: ScenarioTrace } {
  const { pts, cum, turnFromS } = examTurnPath(spec.standM ?? 50);
  const total = cum[cum.length - 1];
  const at = (s: number): { x: number; y: number; h: number } => {
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const seg = cum[i + 1] - cum[i];
    const u = seg > 0 ? Math.min(1, Math.max(0, (s - cum[i]) / seg)) : 0;
    // heading from a short chord around s (the polyline's own direction)
    const j = Math.min(cum.length - 2, i);
    const h = (Math.atan2(pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]) * 180) / Math.PI;
    return { x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u, h: (h + 360) % 360 };
  };
  const dt = 0.05;
  const samples: TraceSample[] = [];
  let s = 0;
  let t = 0;
  const p0 = at(0);
  while (t <= spec.goSec) {
    samples.push({ tSec: t, x: p0.x, y: p0.y, headingDeg: p0.h, steerRad: 0, speedKmh: 0, gear: 1, indicator: "left", brakeOn: true, throttleOn: false });
    t += dt;
  }
  while (s < total) {
    const v = (s < turnFromS - 3 ? spec.approachKmh : spec.turnKmh) / 3.6;
    s = Math.min(total, s + v * dt);
    const p = at(s);
    samples.push({ tSec: t, x: p.x, y: p.y, headingDeg: p.h, steerRad: 0, speedKmh: v * 3.6, gear: 1, indicator: "left", brakeOn: false, throttleOn: true });
    t += dt;
  }
  const end = samples[samples.length - 1];
  for (let k = 1; k * dt <= (spec.tailSec ?? 4); k++) samples.push({ ...end, tSec: end.tSec + k * dt, speedKmh: 0, brakeOn: true, throttleOn: false });
  const base = compileScenario(SC_ED_D2_PRIORITY_RUN, 1);
  const lesson = {
    ...base,
    spawn: { position: { x: p0.x, y: p0.y }, headingDeg: p0.h },
    traffic: { ...(base.traffic ?? {}), vehicleCount: spec.vehicleCount, anchorRadiusM: spec.anchorRadiusM, anchorPath: undefined },
    stagedEvents: [],
  } as LessonSpec;
  const trace: ScenarioTrace = { meta: { scenarioId: base.id, kind: "attempt", version: 1, durationSec: samples[samples.length - 1].tSec }, samples, events: [] };
  return { lesson, districtRaw: loadDistrict("d2-v1"), trace };
}
