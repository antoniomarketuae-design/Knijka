/**
 * C1 — driver-bot verification of THE EXAM BANK through the FULL production
 * stack (runtime + traffic + director + rules — the same wiring LessonScene
 * uses, via orchestrator/__tests__/helpers.makeStack).
 *
 * THE INNOCENT CONTRACT: a bot that drives a variant's whole route at legal
 * speeds, stops at reds and stop lines, yields to pedestrians / priority /
 * circulating traffic, signals its turns and keeps its lane must finish with
 * ZERO violations. Every violation logged by an innocent drive is a false
 * positive somewhere (site data / staging / arming / detector) and gets
 * root-caused, not tolerated.
 *
 * THE GUILTY CONTRACT: one bot per official termination class must produce
 * the expected violation codes AND the expected examTerminationFor fold —
 * re-derived identically by the wire regrade from the variant id alone.
 *
 * Default: one curated innocent variant per shell (all 15 encounter sites +
 * all six staged kinds + all six conditions covered), the guilty folds,
 * and a sim-replay determinism law. EXAM_BANK_REVISION_FULL=1 widens the
 * innocent sweep to ≥100 variants across every shell × condition cell.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CyclistRightHookSpec, LessonSpec } from "../../contracts";
import type { SimTickEvent } from "../../rules";
import { lessonSeed } from "../../orchestrator";
import {
  DT,
  loadRawDistrict,
  makeStack,
  offsetRight,
  PolyDriver,
  stepFrame,
  violationCodes,
  type Stack,
} from "../../orchestrator/__tests__/helpers";
import {
  comfortableStopPossible,
  createWorldRuntime,
  JUNCTION_AREA_RADIUS_M,
  TurnDetector,
} from "../../runtime";
import { examTerminationFor } from "../exam";
import {
  examShellAssignmentCount,
  examVariantDistinctnessKey,
  generateExamVariant,
} from "../examBank";
import { EXAM_CONDITIONS, EXAM_SHELLS, type ExamRouteShell } from "../examBankData";
import { gradeFinishWire } from "../wire";

const FULL = process.env.EXAM_BANK_REVISION_FULL === "1";

// ---------------------------------------------------------------------------
// District + route-plan construction (independent lane math)
// ---------------------------------------------------------------------------

interface REdge {
  id: string;
  from: string;
  to: string;
  oneway: boolean;
  lanes: number;
  maxspeed: number;
  geometry: Array<[number, number]>;
}

const district = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../../../content/world/district-v1.json", import.meta.url)),
    "utf8",
  ),
) as {
  roads: { nodes: Array<{ id: string; x: number; y: number }>; edges: REdge[] };
  crossings: Array<{ id: string; x: number; y: number }>;
  roundabouts: Array<{ id: string; x: number; y: number; radius: number }>;
};

const nodeXY = new Map(district.roads.nodes.map((n) => [n.id, n] as const));

const edgeByPair = new Map<string, { edge: REdge; fwd: boolean }>();
for (const e of district.roads.edges) {
  edgeByPair.set(`${e.from}|${e.to}`, { edge: e, fwd: true });
  if (!e.oneway) edgeByPair.set(`${e.to}|${e.from}`, { edge: e, fwd: false });
}

const LANE_W = 3.25 * 2.5;

/** Right-lane-center offset from the OSM centerline for the travel direction. */
function rightLaneOffset(edge: REdge): number {
  if (edge.oneway) {
    const L = Math.max(1, edge.lanes);
    return ((L - 1) / 2) * LANE_W;
  }
  const L = Math.max(1, Math.floor(edge.lanes / 2));
  return (L - 0.5) * LANE_W;
}

function polyLen(g: ReadonlyArray<readonly [number, number]>): number {
  let s = 0;
  for (let i = 1; i < g.length; i++) s += Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
  return s;
}

function wrap180(d: number): number {
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/** World point at arclength `s` of a polyline. */
function pointAtS(g: ReadonlyArray<readonly [number, number]>, s: number): [number, number] {
  let acc = 0;
  for (let i = 0; i < g.length - 1; i++) {
    const seg = Math.hypot(g[i + 1][0] - g[i][0], g[i + 1][1] - g[i][1]);
    if (acc + seg >= s || i === g.length - 2) {
      const t = seg > 0 ? Math.min(1, Math.max(0, (s - acc) / seg)) : 0;
      return [g[i][0] + t * (g[i + 1][0] - g[i][0]), g[i][1] + t * (g[i + 1][1] - g[i][1])];
    }
    acc += seg;
  }
  const last = g[g.length - 1];
  return [last[0], last[1]];
}

/** Arc position of the closest point of `poly` to (x, y) — landmark lookup. */
function polyArcOf(poly: ReadonlyArray<readonly [number, number]>, x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  let acc = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const ax = poly[i][0];
    const ay = poly[i][1];
    const abx = poly[i + 1][0] - ax;
    const aby = poly[i + 1][1] - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((x - ax) * abx + (y - ay) * aby) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (ax + abx * t), y - (ay + aby * t));
    const segLen = Math.sqrt(len2);
    if (d < bestD) {
      bestD = d;
      best = acc + segLen * t;
    }
    acc += segLen;
  }
  return best;
}

interface StopSignMark {
  arc: number;
  jx: number;
  jy: number;
  /** Б2 „Стоп" demands a standing halt; Б1 „Пропусни движението" only a yield. */
  fullStop: boolean;
}
interface LightMark {
  arc: number;
  nodeId: string;
  approachBearingDeg: number;
}
interface CrossingMark {
  arc: number;
  id: string;
}
interface PointMark {
  arc: number;
  x: number;
  y: number;
}

interface RoutePlan {
  points: Array<[number, number]>;
  lengthM: number;
  /** Leg lookup: ascending start arcs + the leg's legal limit. */
  legStartArc: number[];
  legLimitKmh: number[];
  stopSigns: StopSignMark[];
  lights: LightMark[];
  crossings: CrossingMark[];
  rhrJunctions: PointMark[];
  ringEntries: Array<PointMark & { radius: number }>;
  leftTurnArcs: number[];
  /** 2 m-sampled headings for the indicator + curve-speed planners. */
  sampleArc: number[];
  sampleHeading: number[];
}

const RING_NODES = new Set([
  "n707684255",
  "n707684256",
  "n279646956",
  "n279646958",
  "n1038574156",
  "n1038574251",
]);

/** One shared runtime for static introspection (stop lines, RHR set). */
const introspection = createWorldRuntime(loadRawDistrict());
const allStopLines = introspection.debugStopLines();
const uncontrolledById = new Map(
  introspection.debugUncontrolledJunctions().map((j) => [j.id, j] as const),
);
/** Intersection positions — the bot mirrors the runtime's in-junction-area
 * flag for its TurnDetector clone (see runBot). */
const intersectionsXY: ReadonlyArray<{ x: number; y: number }> =
  introspection.district.intersections.map((it) => ({ x: it.x, y: it.y }));

const planCache = new Map<string, RoutePlan>();

function buildRoutePlan(shell: ExamRouteShell): RoutePlan {
  const cached = planCache.get(shell.code);
  if (cached) return cached;

  interface Leg {
    edge: REdge;
    fwd: boolean;
    off: Array<[number, number]>;
    offLen: number;
    startArc: number;
    toNode: string;
  }
  // Effective lane position: 1.5 m LEFT of the exact lane-0 center on wide
  // banks (drivers bias away from the curb; keeps laneOffset ≈ 1.5 m, far
  // under the 3.25 m lane-keeping band), and CAPPED by the leg's centerline
  // length: junction-cluster stubs (4–25 m links inside the „Семов" and NW
  // complexes) cannot host an 8 m lane offset — a driver transits a junction
  // complex near its lane path, and the uncapped offsets zigzagged the bot
  // across neighbouring stubs (locator flips → phantom WRONG_WAY / lane
  // noise in the C1 traces).
  const effOffset = (edge: REdge): number => {
    const raw = rightLaneOffset(edge);
    const inset = raw >= 4 ? raw - 1.5 : raw;
    const centerLen = polyLen(edge.geometry);
    return Math.min(inset, Math.max(0, 0.35 * (centerLen - 5)));
  };
  // Blend offsets across leg joints (a driver merges over ~14 m, never
  // teleports 8 m sideways where a 3-lane boulevard meets a 1-lane link).
  const resampled = (geom: Array<[number, number]>, oPrev: number, oOwn: number, oNext: number) => {
    const total = polyLen(geom);
    const blend = Math.min(14, total / 2);
    const out: Array<[number, number]> = [];
    let acc = 0;
    for (let i = 0; i < geom.length - 1; i++) {
      const ax = geom[i][0];
      const ay = geom[i][1];
      const bx = geom[i + 1][0];
      const by = geom[i + 1][1];
      const seg = Math.hypot(bx - ax, by - ay);
      if (seg < 1e-6) continue;
      const nx = (by - ay) / seg; // right normal of travel
      const ny = -(bx - ax) / seg;
      const steps = Math.max(1, Math.ceil(seg / 2.5));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const s = acc + t * seg;
        let o = oOwn;
        if (s < blend) o = oPrev + (oOwn - oPrev) * (s / blend);
        else if (total - s < blend) o = oNext + (oOwn - oNext) * ((total - s) / blend);
        out.push([ax + t * (bx - ax) + nx * o, ay + t * (by - ay) + ny * o]);
      }
      acc += seg;
    }
    const lg = geom[geom.length - 1];
    const lp = geom[geom.length - 2];
    const seg = Math.hypot(lg[0] - lp[0], lg[1] - lp[1]) || 1;
    const nx = (lg[1] - lp[1]) / seg;
    const ny = -(lg[0] - lp[0]) / seg;
    out.push([lg[0] + nx * oNext, lg[1] + ny * oNext]);
    return out;
  };

  const recs = shell.routeNodes.slice(0, -1).map((n, i) => {
    const rec = edgeByPair.get(`${n}|${shell.routeNodes[i + 1]}`);
    if (!rec) throw new Error(`undrivable hop ${n} → ${shell.routeNodes[i + 1]}`);
    return rec;
  });
  const legs: Leg[] = [];
  let arc = 0;
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i];
    const geom = (rec.fwd ? rec.edge.geometry : [...rec.edge.geometry].reverse()).map(
      (p) => [p[0], p[1]] as [number, number],
    );
    const oOwn = effOffset(rec.edge);
    const oPrev = i > 0 ? (effOffset(recs[i - 1].edge) + oOwn) / 2 : oOwn;
    const oNext = i < recs.length - 1 ? (effOffset(recs[i + 1].edge) + oOwn) / 2 : oOwn;
    const off = resampled(geom, oPrev, oOwn, oNext);
    const offLen = polyLen(off);
    legs.push({ edge: rec.edge, fwd: rec.fwd, off, offLen, startArc: arc, toNode: shell.routeNodes[i + 1] });
    arc += offLen;
  }

  const points: Array<[number, number]> = [];
  const legStartIdx: number[] = [];
  for (const leg of legs) {
    let firstIdx = -1;
    for (const p of leg.off) {
      const last = points[points.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.05) points.push(p);
      if (firstIdx < 0) firstIdx = points.length - 1;
    }
    legStartIdx.push(firstIdx);
  }
  // C1: smooth the aggregate path (1-2-1 kernel, 3 passes). The joint
  // connector between legs with different lane offsets is a near-lateral
  // segment — an unphysical ~58° heading spike over 2.5 m that the runtime's
  // 3 s turn window summed past its 55° threshold (phantom turnStarted →
  // TURN_WITHOUT_INDICATOR on a dead-straight boulevard) and that rattled
  // the locator. A car cannot yaw like that; the smoothing rounds the jog
  // into a gentle S over ~8 m and barely moves the rest of the path (≤ 1 m
  // on the tightest corner).
  for (let pass = 0; pass < 3; pass++) {
    const prev = points.map((p) => [p[0], p[1]] as [number, number]);
    for (let i = 1; i < points.length - 1; i++) {
      points[i][0] = (prev[i - 1][0] + 2 * prev[i][0] + prev[i + 1][0]) / 4;
      points[i][1] = (prev[i - 1][1] + 2 * prev[i][1] + prev[i + 1][1]) / 4;
    }
  }
  // C1: re-anchor every leg's startArc in the AGGREGATE path's arc frame.
  // Adjacent legs' offset endpoints use different normals at turns, so the
  // concatenated path contains joint connector segments the per-leg offLen
  // sums never counted — by leg 48 of shell D the frames had drifted ~70 m
  // apart, so the bot held its stop 43 m short of the Б2 line (recency
  // expired → phantom STOP_SIGN_NO_FULL_STOP) and applied the 30-zone limit
  // 70 m late (phantom SPEEDING_DANGEROUS).
  {
    const cum: number[] = [0];
    for (let i = 1; i < points.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    }
    for (let i = 0; i < legs.length; i++) legs[i].startArc = cum[legStartIdx[i]];
  }

  // Stop lines on the route (both controls), in travel direction. Traffic
  // lights are handled from the PLAN, not from the tick context (short
  // approach edges never show them in the on-edge watch window early enough
  // to brake). C1: each mark's arc comes from projecting the line's WORLD
  // POSITION onto the leg's own offset polyline — the previous edge-fraction
  // mapping drifted through junction-mouth curvature, so the bot planned a
  // stop meters past a line it had physically crossed (billed as a phantom
  // red entry / missed full stop in the C1 traces).
  const stopSigns: StopSignMark[] = [];
  const lights: LightMark[] = [];
  for (const leg of legs) {
    for (const line of allStopLines) {
      if (!line.id.startsWith(`${leg.edge.id}@`)) continue;
      const travelSign = leg.fwd ? 1 : -1;
      if (line.dirSign !== travelSign) continue;
      const w = pointAtS(leg.edge.geometry, line.sM);
      const arcAt = leg.startArc + polyArcOf(leg.off, w[0], w[1]);
      // Sign lines (Б2 AND Б1, audit C-4) go to the priority planner; only a
      // signalized line belongs to the lamp planner. Routing a Б1 into `lights`
      // asked signalPhaseInfo about an unsignalized node, whose default phase
      // parked the bot short of the mouth until the watchdog gave up.
      if (line.control === "trafficLight") {
        lights.push({ arc: arcAt, nodeId: line.junctionNodeId, approachBearingDeg: line.approachBearingDeg });
      } else {
        const j = nodeXY.get(line.junctionNodeId);
        if (!j) continue;
        stopSigns.push({ arc: arcAt, jx: j.x, jy: j.y, fullStop: line.control === "stopSign" });
      }
    }
  }
  stopSigns.sort((a, b) => a.arc - b.arc);
  lights.sort((a, b) => a.arc - b.arc);

  // Crossings within a lane-bank width of a leg → per-pass marks.
  const crossings: CrossingMark[] = [];
  for (const leg of legs) {
    for (const c of district.crossings) {
      let best = Infinity;
      let bestArc = 0;
      let acc = 0;
      for (let i = 0; i < leg.off.length - 1; i++) {
        const ax = leg.off[i][0];
        const ay = leg.off[i][1];
        const bx = leg.off[i + 1][0];
        const by = leg.off[i + 1][1];
        const dx = bx - ax;
        const dy = by - ay;
        const l2 = dx * dx + dy * dy;
        const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.y - ay) * dy) / l2));
        const d = Math.hypot(c.x - (ax + t * dx), c.y - (ay + t * dy));
        if (d < best) {
          best = d;
          bestArc = leg.startArc + acc + t * Math.sqrt(l2);
        }
        acc += Math.sqrt(l2);
      }
      if (best < 13) crossings.push({ arc: bestArc, id: c.id });
    }
  }
  crossings.sort((a, b) => a.arc - b.arc);
  // de-duplicate same crossing hit twice at nearly the same arc (leg joints)
  const dedup: CrossingMark[] = [];
  for (const c of crossings) {
    const prev = dedup[dedup.length - 1];
    if (prev && prev.id === c.id && Math.abs(prev.arc - c.arc) < 6) continue;
    dedup.push(c);
  }

  // Uncontrolled (right-hand-rule) junction passes.
  const rhrJunctions: PointMark[] = [];
  for (const leg of legs) {
    const j = uncontrolledById.get(leg.toNode);
    if (j) rhrJunctions.push({ arc: leg.startArc + leg.offLen, x: j.x, y: j.y });
  }

  // Ring entries: leg whose end node enters the ring from outside.
  const ringEntries: Array<PointMark & { radius: number }> = [];
  const rb = district.roundabouts[0];
  for (let i = 0; i < legs.length; i++) {
    const fromRing = RING_NODES.has(i === 0 ? shell.routeNodes[0] : legs[i - 1].toNode);
    if (RING_NODES.has(legs[i].toNode) && !fromRing) {
      ringEntries.push({ arc: legs[i].startArc + legs[i].offLen, x: rb.x, y: rb.y, radius: rb.radius });
    }
  }

  // Node-level left turns (oncoming-yield holds).
  const leftTurnArcs: number[] = [];
  for (let i = 0; i < legs.length - 1; i++) {
    const gIn = legs[i].off;
    const gOut = legs[i + 1].off;
    const inB =
      (Math.atan2(
        gIn[gIn.length - 1][0] - gIn[Math.max(0, gIn.length - 2)][0],
        gIn[gIn.length - 1][1] - gIn[Math.max(0, gIn.length - 2)][1],
      ) *
        180) /
      Math.PI;
    const outB = (Math.atan2(gOut[1][0] - gOut[0][0], gOut[1][1] - gOut[0][1]) * 180) / Math.PI;
    const delta = wrap180(outB - inB);
    if (delta <= -35 && delta >= -150) leftTurnArcs.push(legs[i].startArc + legs[i].offLen);
  }

  // 2 m heading samples for the indicator planner.
  const sampleArc: number[] = [];
  const sampleHeading: number[] = [];
  {
    let acc = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1][0] - points[i][0];
      const dy = points[i + 1][1] - points[i][1];
      const segLen = Math.hypot(dx, dy);
      const h = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      for (let q = 0; q < segLen; q += 2) {
        sampleArc.push(acc + q);
        sampleHeading.push(h);
      }
      acc += segLen;
    }
  }

  const plan: RoutePlan = {
    points,
    lengthM: polyLen(points),
    legStartArc: legs.map((l) => l.startArc),
    legLimitKmh: legs.map((l) => l.edge.maxspeed),
    stopSigns,
    lights,
    crossings: dedup,
    rhrJunctions,
    ringEntries,
    leftTurnArcs,
    sampleArc,
    sampleHeading,
  };
  planCache.set(shell.code, plan);
  return plan;
}

/** Signed heading change over (s, s+aheadM] from the 2 m samples. */
function curvatureAhead(plan: RoutePlan, s: number, aheadM: number): number {
  const { sampleArc, sampleHeading } = plan;
  let lo = 0;
  let hi = sampleArc.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sampleArc[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  let sum = 0;
  for (let i = lo; i + 1 < sampleArc.length && sampleArc[i + 1] <= s + aheadM; i++) {
    sum += wrap180(sampleHeading[i + 1] - sampleHeading[i]);
  }
  return sum;
}

// ---------------------------------------------------------------------------
// The driver bot
// ---------------------------------------------------------------------------

export interface BotVices {
  /** Ignore traffic-light state entirely (red-runner). */
  ignoreSignals?: boolean;
  /** Ignore stop signs + junction conflicts (barger). */
  ignoreStopSigns?: boolean;
  /** Never brake for the lead vehicle (rear-ender). */
  ignoreLeadCar?: boolean;
  /** Ignore pedestrians on crossings (plower). */
  ignorePedestrians?: boolean;
  /** Suppress the indicator for the first N turns (основна accumulator). */
  suppressIndicatorTurns?: number;
  /** After the indicator vice is spent, run N minor speeding bursts. */
  speedBursts?: number;
}

interface BotResult {
  events: Stack["ruleEvents"];
  outcomes: Stack["outcomes"];
  frames: number;
  finished: boolean;
  triggered: number;
  stuckAtArc: number | null;
}

/** Optional per-violation trace hook for the FP-hunting loop. */
type TraceFn = (info: {
  t: number;
  code: string;
  detail: string | undefined;
  arc: number;
  x: number;
  y: number;
  speedKmh: number;
  headingDeg: number;
  edgeId: string | null;
  laneId: number;
  laneOffsetM: number;
  maxSpeedKmh: number;
  wrongWay: boolean | undefined;
  indicator: string;
  stops: number[];
  actors: string;
}) => void;

const ACCEL = 2.2;
/** Normal service braking — deliberately under the 7 m/s² harsh-brake
 * detector threshold (C1: the old cap EQUALLED it, so every firm planned
 * stop with no visible cause graded HARSH_BRAKING_NO_CAUSE). */
const DECEL = 4.6;
/** Emergency braking (pedestrian darts, lead-car slams) — those stops have a
 * cause in the hazard ledger, so the harsh detector stands down. */
const EMERGENCY_DECEL = 8.5;
const PLAN_DECEL = 3.2;
/** Mirror-scan cadence: alternating left/right/rear keeps every mirror kind
 * inside the engine's 5 s lookback for the whole drive — the routine scan of
 * an attentive driver (C1: the bot never glanced, so every real lane change
 * billed LANE_CHANGE_WITHOUT_MIRROR_CHECK). */
const MIRROR_SCAN_SEC = 1.5;
const MIRROR_KINDS = ["left", "right", "rear"] as const;

function runBot(
  spec: LessonSpec,
  vices: BotVices = {},
  seedOverride?: number,
  trace?: TraceFn,
): BotResult {
  const shell = EXAM_SHELLS.find((s) => spec.id.split("-")[1] === s.code)!;
  const plan = buildRoutePlan(shell);
  const stack = makeStack([...(spec.stagedEvents ?? [])], seedOverride ?? lessonSeed(spec.id));
  const isNight = spec.environment?.timeOfDay === "night";
  const rain = spec.environment?.rain ?? false;

  // Cyclist slots in THIS variant (junction hold geometry).
  const cyclists = (spec.stagedEvents ?? [])
    .filter((e): e is CyclistRightHookSpec => e.kind === "cyclistRightHook")
    .map((e) => {
      const driver = new PolyDriver(plan.points);
      return { spec: e, holdArc: driver.arcOf(e.junction.x, e.junction.y) };
    });
  // Dart slots: a human sees the pedestrian STEP OFF THE CURB and brakes
  // before they are physically on the carriageway — the bot must too. The
  // slow tier walks 1.33 s from trigger to the road edge; reacting only to
  // pedestrianOnCrossing left ~13 m to stop from 45 km/h (C1: unyieldable →
  // PEDESTRIAN_NOT_YIELDED on an innocent drive). Watch the staged actor:
  // once it MOVES, its crossing is treated as occupied.
  const dartCrossingIds = new Map<string, string>(); // staged id → crossing id
  for (const e of spec.stagedEvents ?? []) {
    if (e.kind === "pedestrianDartOut") dartCrossingIds.set(e.id, e.crossingId);
  }

  const driver = new PolyDriver(plan.points, 0, 0);
  const stopSigns = plan.stopSigns.map((m) => ({ ...m, satisfied: false, stoppedSec: 0 }));
  const committedAmber = new Set<number>();
  const amberDecided = new Set<number>(); // per-light stop/commit latch (C1)
  let legPtr = 0;
  let turnsSeen = 0;
  let burstsFired = 0;
  let burstState: "idle" | "boost" | "cooldown" = "idle";
  let burstTimer = 0;
  /** Indicator latch: hold the signal ~1.5 s past the geometric end of the
   * bend — the runtime's 3 s turn window can fire slightly after the bot's
   * lookahead says the turn is over (C1: TURN_WITHOUT_INDICATOR fired 3.2 s
   * after the bot cancelled, just outside the engine's 3 s lookback). */
  let indHold: { dir: "left" | "right"; until: number } | null = null;
  const mirrorEvery = Math.max(1, Math.round(MIRROR_SCAN_SEC / DT));
  /** Trailing heading history (t, headingDeg) — the bot-side mirror of the
   * runtime turn detector's 3 s window. */
  const histT: number[] = [];
  const histH: number[] = [];
  let histTail = 0;
  /** EXACT clone of the runtime's turn detector, fed the identical
   * (t, heading, inJunctionArea) series one step ahead of stepFrame: when
   * the clone fires, the REAL detector will fire on the very same tick, so
   * the bot switches the indicator to the fired direction THAT frame — the
   * engine's indicator tracker runs before turn grading within a tick, so
   * the lookback always holds. This closes the window-edge races that no
   * lookahead heuristic could (C1: at sub-15 km/h through a sharp S, one
   * polyline-segment heading jump on the window boundary decorrelated any
   * bot-side estimate from the detector's sum by ±70°). */
  const turnMirror = new TurnDetector();
  const mirrorEvents: SimTickEvent[] = [];
  let lastProgressArc = 0;
  let lastProgressT = 0;
  let stuckAtArc: number | null = null;
  let tick: ReturnType<typeof stepFrame> | null = null;
  let triggered = 0;
  const resolvedTriggers = new Set<string>();

  const maxFrames = Math.ceil((15 * 60) / DT);
  let frame = 0;
  for (; frame < maxFrames; frame++) {
    const s = driver.s;
    const pose = driver.poseAt(s);
    const v = driver.speedMps;

    // -- legal limit at s and just ahead (pre-braking for zone drops)
    while (legPtr + 1 < plan.legStartArc.length && plan.legStartArc[legPtr + 1] <= s) legPtr++;
    let limitKmh = plan.legLimitKmh[legPtr];
    for (let k = legPtr + 1; k < plan.legStartArc.length && plan.legStartArc[k] < s + 45; k++) {
      // brake toward an upcoming LOWER limit before its edge starts
      const distTo = plan.legStartArc[k] - s;
      const vAtDrop = Math.sqrt(
        (plan.legLimitKmh[k] / 3.6) ** 2 + 2 * PLAN_DECEL * Math.max(0, distTo),
      );
      limitKmh = Math.min(limitKmh, vAtDrop * 3.6);
    }
    const condFactor = rain ? 0.85 : 1;
    let target = ((limitKmh * condFactor) / 3.6) * 0.9;

    // -- curve speed: cap lateral acceleration through upcoming geometry
    for (const aheadM of [10, 18, 30]) {
      const dh = Math.abs(curvatureAhead(plan, s, aheadM));
      if (dh > 8) {
        const radius = aheadM / ((dh * Math.PI) / 180);
        const vCurve = Math.max(2.4, Math.sqrt(2.4 * radius));
        target = Math.min(target, vCurve);
      }
    }

    const stops: number[] = [];
    /** Emergency-grade braking is reserved for stops WITH a visible cause
     * (pedestrian on the zebra, lead vehicle) — causeless planned braking
     * stays under the 7 m/s² harsh threshold. */
    let emergencyBrake = false;

    // -- traffic lights from the PLAN (per-line lamp via the production
    // signal controller — the same lamps the sweep grades with)
    if (!vices.ignoreSignals) {
      for (let li = 0; li < plan.lights.length; li++) {
        const L = plan.lights[li];
        if (L.arc < s - 3) {
          committedAmber.delete(li);
          continue;
        }
        if (L.arc > s + 130) break;
        const phase = stack.runtime.signalPhaseInfo(L.nodeId, L.approachBearingDeg).phase;
        if (phase === "red" || phase === "redYellow") {
          committedAmber.delete(li);
          amberDecided.delete(li); // next cycle decides afresh
          stops.push(L.arc - 8);
          const dStop = L.arc - 8 - s;
          if (dStop > 0 && v * v > 2 * (DECEL - 0.4) * dStop) emergencyBrake = true; // the signal is the cause
        } else if (phase === "yellow") {
          // Stop/commit decision MIRRORS the runtime's amber adjudicator
          // (comfortableStopPossible), padded +6 m because the physical line
          // (locator projection through the mouth curvature) can sit metres
          // off the plan arc, and LATCHED on the first yellow frame:
          // re-evaluating each frame flipped a chosen stop into a late
          // commit as the comfortable threshold receded during braking
          // (C1: red entry at 28 km/h on the A1 approach). Whenever the
          // adjudicator could rule "a comfortable stop existed", the bot
          // stops; it commits only when even the padded distance is not
          // comfortably stoppable — the sweep's frozen snapshot then rules
          // the yellow entry innocent.
          if (!amberDecided.has(li)) {
            amberDecided.add(li);
            if (!comfortableStopPossible(L.arc + 6 - s, v * 3.6)) committedAmber.add(li);
          }
          if (!committedAmber.has(li)) stops.push(L.arc - 8);
        } else {
          amberDecided.delete(li);
          committedAmber.delete(li);
        }
      }
    }

    // -- stop signs: full stop, then cross only with the junction clear
    if (!vices.ignoreStopSigns) {
      for (const m of stopSigns) {
        if (m.satisfied || m.arc < s - 4) continue;
        if (m.arc > s + 90) break;
        if (!m.fullStop) {
          // Б1: the duty is to yield, not to halt (ЗДвП чл. 50 — „пълно спиране
          // се налага само когато иначе би ги засякъл"). Hold short of the line
          // only while the mouth carries conflicting traffic; a clear mouth is
          // crossed rolling, which is what the engine now grades as innocent.
          if (stack.traffic.conflictNear(m.jx, m.jy, 26, pose.headingDeg)) {
            stops.push(m.arc - 3.0);
          } else if (m.arc - s < 4) {
            m.satisfied = true;
          }
          continue;
        }
        stops.push(m.arc - 3.0); // margin covers the projection lead through the mouth bend
        const atLine = m.arc - s < 4;
        if (atLine && v <= 0.05) {
          m.stoppedSec += DT;
          if (
            m.stoppedSec >= 0.75 &&
            !stack.traffic.conflictNear(m.jx, m.jy, 26, pose.headingDeg)
          ) {
            m.satisfied = true;
          }
        }
      }
      // After release, re-hold AT THE LINE if a conflict re-appears before
      // the bot has committed past it. C1: the old `s + 0.5` carrot made the
      // bot CREEP at ~6 km/h for the whole conflict — never "stopped" per the
      // engine (≤ 1 km/h), so the eventual crossing had no recent qualifying
      // stop and graded STOP_SIGN_NO_FULL_STOP. Re-arming the mark forces a
      // fresh full stop at the line with fresh recency.
      for (const m of stopSigns) {
        if (!m.satisfied) continue;
        if (
          s < m.arc - 0.8 &&
          m.arc - s < 14 &&
          stack.traffic.conflictNear(m.jx, m.jy, 26, pose.headingDeg)
        ) {
          m.satisfied = false;
          m.stoppedSec = 0;
          stops.push(m.arc - 3.0);
        }
      }
    }

    // -- pedestrian crossings
    if (!vices.ignorePedestrians) {
      // Staged dart actors count as "on the crossing" from their first step
      // toward the curb (see the dartCrossingIds note above).
      const dartActive = new Set<string>();
      for (const [stagedId, crossingId] of dartCrossingIds) {
        const a = stack.traffic.staged(stagedId);
        if (a && !a.finished && a.speedMps > 0.05) dartActive.add(crossingId);
      }
      for (const c of plan.crossings) {
        if (c.arc < s - 6) continue;
        if (c.arc > s + 55) break;
        if (dartActive.has(c.id) || stack.traffic.pedestrianOnCrossing(c.id)) {
          stops.push(c.arc - 7);
          if (c.arc - s < 36) target = Math.min(target, 26 / 3.6);
          const dStop = c.arc - 7 - s;
          if (dStop > 0 && v * v > 2 * (DECEL - 0.4) * dStop) emergencyBrake = true;
        }
      }
    }

    // -- right-hand-rule junctions. Anticipation radius 40 (vs the grader's
    // 26): "late"-tier arrivals otherwise become conflicts only when the bot
    // is already inside its braking distance of the core (C1, shell G). The
    // hold sits 22 m out — just outside the 18 m adjudication core.
    for (const j of plan.rhrJunctions) {
      if (j.arc < s - 2 || j.arc > s + 60) continue;
      if (stack.traffic.conflictFromRight(j.x, j.y, pose.x, pose.y, pose.headingDeg, 40)) {
        stops.push(j.arc - 22);
      }
    }

    // -- roundabout entries: creep while circulating traffic approaches
    for (const r of plan.ringEntries) {
      if (r.arc < s - 5 || r.arc > s + 70) continue;
      const dCenter = Math.hypot(pose.x - r.x, pose.y - r.y);
      if (dCenter < r.radius + 16) target = Math.min(target, 21 / 3.6);
      if (stack.traffic.circulatingConflict(r.x, r.y, pose.x, pose.y, pose.headingDeg, r.radius + 9)) {
        if (dCenter < r.radius + 15) target = Math.min(target, 0.55);
        stops.push(r.arc - 8);
      }
    }

    // -- cyclist right-hook: never start the right turn until the rider clears
    for (const c of cyclists) {
      if (c.holdArc < s - 5 || c.holdArc > s + 50) continue;
      const actor = stack.traffic.staged(c.spec.id);
      if (!actor || actor.finished) continue;
      const cyclistArc = actor.s - actor.nodeS[c.spec.junctionNodeIndex];
      const near = Math.hypot(actor.x - c.spec.junction.x, actor.y - c.spec.junction.y) < 60;
      if (cyclistArc < 10 && near) {
        stops.push(c.holdArc - 14);
        const dStop = c.holdArc - 14 - s;
        if (dStop > 0 && v * v > 2 * (DECEL - 0.4) * dStop) emergencyBrake = true;
      }
    }

    // -- left turns across oncoming traffic
    for (const arcL of plan.leftTurnArcs) {
      if (arcL < s || arcL > s + 32) continue;
      if (stack.traffic.oncomingNear(pose.x, pose.y, pose.headingDeg, 36)) {
        stops.push(arcL - 16);
      }
    }

    // -- lead-vehicle following
    const leadGap = stack.traffic.leadGapMeters(pose.x, pose.y, pose.headingDeg);
    if (!vices.ignoreLeadCar && Number.isFinite(leadGap)) {
      // 1.9 s — legal-safe (the detector fires under 0.7 × 1.8 s), and close
      // enough that the marginal followGapM=22 slam tier behind an 11 m/s
      // lead (B6) actually triggers (C1: at 2.1 s it never armed).
      const desired = Math.max(8, v * 1.9);
      if (leadGap < desired) {
        target = Math.min(target, Math.max(0, v * ((leadGap - 6) / desired)));
        if (leadGap < 9) target = 0;
        if (leadGap < 12) emergencyBrake = true; // the lead IS the cause
      }
    }

    // -- speeding bursts (guilty accumulator only)
    if (
      vices.speedBursts !== undefined &&
      burstsFired < vices.speedBursts &&
      turnsSeen >= (vices.suppressIndicatorTurns ?? 0)
    ) {
      const speedingEvents = stack.ruleEvents.filter(
        (e) => e.kind === "violation" && e.code === "SPEEDING_OVER_LIMIT",
      ).length;
      burstsFired = speedingEvents;
      const clearAhead =
        stops.length === 0 &&
        (!tick || tick.nextStopLineM === undefined || tick.nextStopLineM > 100) &&
        plan.ringEntries.every((r) => Math.abs(r.arc - s) > 60) &&
        plan.crossings.every((c) => c.arc < s - 10 || c.arc > s + 100) &&
        plan.rhrJunctions.every((j) => Math.abs(j.arc - s) > 60);
      if (burstState === "idle" && clearAhead && burstsFired < vices.speedBursts) {
        burstState = "boost";
        burstTimer = 0;
      }
      if (burstState === "boost") {
        burstTimer += DT;
        if (clearAhead) target = Math.max(target, (limitKmh * 1.13) / 3.6);
        // C1: 2.8 s was too short — reaching 1.13× from 0.9× takes ~1.5 s at
        // ACCEL, and SPEEDING_OVER_LIMIT needs 2 s SUSTAINED above the 10%
        // grace, so no burst ever graded. 5 s leaves ~2.5 s over the grace.
        if (burstTimer > 5.0 || !clearAhead) {
          burstState = "cooldown";
          burstTimer = 0;
        }
      } else if (burstState === "cooldown") {
        burstTimer += DT;
        target = Math.min(target, (limitKmh * 0.85) / 3.6);
        // M-16: the episode re-arms only after the limit has been HELD for
        // speedingRearmSec (4 s) — a 2.6 s dip is one continuing offence being
        // corrected, and the bot needs FOUR separate ones to accumulate.
        if (burstTimer > 5.0) burstState = "idle";
      }
    }

    // -- merge stop constraints into the speed target
    for (const stopArc of stops) {
      const d = stopArc - s;
      if (d <= 0.35) target = 0;
      else target = Math.min(target, Math.sqrt(2 * PLAN_DECEL * d));
    }

    // -- indicator from path curvature (suppressible per the turn vice).
    // C1: the planner now MIRRORS the runtime turn detector — that fires on
    // 55° of heading change over a sliding 3 s window, i.e. over ~v·3 m of
    // path, which a fixed 20/40 m lookahead missed at boulevard speeds
    // (TURN_WITHOUT_INDICATOR on gentle-but-long junction curves at 45 km/h).
    let indicator: "off" | "left" | "right" = "off";
    const c20 = curvatureAhead(plan, s, 20);
    const c40 = curvatureAhead(plan, s, 40);
    const winM = Math.max(14, v * 3.2);
    const cWin = curvatureAhead(plan, s, winM);
    if (Math.abs(c20) >= 25) indicator = c20 > 0 ? "right" : "left";
    else if (Math.abs(c40) >= 45) indicator = c40 > 0 ? "right" : "left";
    else if (Math.abs(cWin) >= 40) indicator = cWin > 0 ? "right" : "left";
    // While the CURRENT maneuver's trailing 3 s window still accumulates,
    // the indicator must keep pointing at IT — not at the next bend (C1:
    // signalling right for the upcoming turn while the left turn's window
    // was still over the threshold graded TURN_WITHOUT_INDICATOR left).
    histT.push(stack.t);
    histH.push(pose.headingDeg);
    while (histTail < histT.length - 1 && histT[histTail] < stack.t - 3.05) histTail++;
    const trail = wrap180(pose.headingDeg - histH[histTail]);
    // Threshold 22° (once 35): at sub-15 km/h through a sharp S the window
    // edges decorrelate the bot's trail from the detector's sum by a whole
    // polyline-segment jump — the first bend peaked at +32 bot-side while
    // the detector read +55 (C1: phantom unsignalled turn on the
    // „Брадистилов" center S). The lookback only needs the side signalled
    // ONCE within 3 s, so signalling early on gentle curves is harmless.
    if (Math.abs(trail) >= 22) indicator = trail > 0 ? "right" : "left";
    if (indicator !== "off") {
      indHold = { dir: indicator, until: stack.t + 1.5 };
    } else if (indHold !== null && stack.t < indHold.until) {
      indicator = indHold.dir; // hold through the detector's trailing window
    }
    if (vices.suppressIndicatorTurns !== undefined && turnsSeen < vices.suppressIndicatorTurns) {
      indicator = "off";
    }

    // -- advance and feed the production stack
    const braking = target < v - 0.02;
    const next = driver.advance(DT, target, ACCEL, emergencyBrake ? EMERGENCY_DECEL : DECEL);
    // Run the TurnDetector clone on exactly the frame the runtime is about
    // to see; if it fires, signal that direction THIS tick (see turnMirror).
    {
      let nearIx = false;
      const r2 = JUNCTION_AREA_RADIUS_M * JUNCTION_AREA_RADIUS_M;
      for (const ix of intersectionsXY) {
        const ddx = ix.x - next.x;
        const ddy = ix.y - next.y;
        if (ddx * ddx + ddy * ddy <= r2) {
          nearIx = true;
          break;
        }
      }
      mirrorEvents.length = 0;
      turnMirror.update(stack.t + DT, next.headingDeg, nearIx, mirrorEvents);
      for (const me of mirrorEvents) {
        if (
          me.kind === "turnStarted" &&
          !(vices.suppressIndicatorTurns !== undefined && turnsSeen < vices.suppressIndicatorTurns)
        ) {
          indicator = me.direction;
          indHold = { dir: me.direction, until: stack.t + 1.0 };
        }
      }
    }
    const eventsBefore = stack.ruleEvents.length;
    tick = stepFrame(
      stack,
      { x: next.x, y: next.y, headingDeg: next.headingDeg, speedKmh: next.speedKmh, brakePedal: braking ? 0.9 : 0 },
      {
        indicator,
        headlights: "low",
        isNight,
        rain,
        mirrorGlance: frame % mirrorEvery === 0 ? MIRROR_KINDS[Math.floor(frame / mirrorEvery) % 3] : null,
        leadGapM: stack.traffic.leadGapMeters(next.x, next.y, next.headingDeg),
      },
    );
    if (trace) {
      for (let k = eventsBefore; k < stack.ruleEvents.length; k++) {
        const e = stack.ruleEvents[k];
        if (e.kind !== "violation") continue;
        const loc = stack.runtime.locate({ x: next.x, y: next.y });
        const actors = (spec.stagedEvents ?? [])
          .map((ev) => {
            const a = stack.traffic.staged(ev.id);
            return a
              ? `${ev.id}@(${a.x.toFixed(0)},${a.y.toFixed(0)})v=${a.speedMps.toFixed(1)}${a.finished ? "F" : ""}`
              : `${ev.id}:none`;
          })
          .join(" ");
        trace({
          t: e.t,
          code: e.code,
          detail: e.detail,
          arc: driver.s,
          x: next.x,
          y: next.y,
          speedKmh: next.speedKmh,
          headingDeg: next.headingDeg,
          edgeId: loc.edgeId,
          laneId: loc.laneId,
          laneOffsetM: loc.laneOffsetM,
          maxSpeedKmh: tick.maxSpeedKmh,
          wrongWay: tick.wrongWay,
          indicator,
          stops: [...stops],
          actors,
        });
      }
    }
    for (const e of tick.events) {
      if (e.kind !== "turnStarted") continue;
      turnsSeen++;
      if (trace && process.env.C1_WATCH === "1") {
        console.log(
          `  [turn ${stack.t.toFixed(1)}] dir=${e.direction} ind=${indicator} trail=${wrap180(pose.headingDeg - histH[histTail]).toFixed(0)} ` +
            `s=${driver.s.toFixed(0)} pos=(${next.x.toFixed(1)},${next.y.toFixed(1)}) v=${next.speedKmh.toFixed(1)} h=${next.headingDeg.toFixed(0)}`,
        );
      }
    }
    for (const o of stack.outcomes) {
      if (!resolvedTriggers.has(o.eventId)) {
        resolvedTriggers.add(o.eventId);
        triggered++;
      }
    }

    // -- C1 diagnostics: periodic actor/player sampler (trace mode only)
    if (trace && process.env.C1_WATCH === "1" && frame % 60 === 0) {
      const actors = (spec.stagedEvents ?? [])
        .map((ev) => {
          const a = stack.traffic.staged(ev.id);
          return a
            ? `${ev.id}@(${a.x.toFixed(0)},${a.y.toFixed(0)})s=${a.s.toFixed(0)}v=${a.speedMps.toFixed(1)}${a.finished ? "F" : ""}`
            : `${ev.id}:none`;
        })
        .join(" ");
      console.log(
        `  [w ${stack.t.toFixed(0)}] s=${driver.s.toFixed(0)} pos=(${next.x.toFixed(0)},${next.y.toFixed(0)}) v=${next.speedKmh.toFixed(0)} ${actors}`,
      );
    }

    // -- watchdog + finish
    if (driver.s - lastProgressArc > 1) {
      lastProgressArc = driver.s;
      lastProgressT = stack.t;
    } else if (stack.t - lastProgressT > 75) {
      stuckAtArc = driver.s;
      break;
    }
    if (driver.s >= plan.lengthM - 1.5) break;
  }

  return {
    events: stack.ruleEvents,
    outcomes: stack.outcomes,
    frames: frame,
    finished: driver.s >= buildRoutePlan(shell).lengthM - 1.5,
    triggered,
    stuckAtArc,
  };
}

/** First variant of (shell, condition) whose distinctness key matches. */
function findVariant(shellCode: string, condCode: string, includes: string[]): string {
  const count = examShellAssignmentCount(shellCode);
  for (let i = 0; i < count; i++) {
    const id = `EX-${shellCode}-${condCode}-${String(i).padStart(4, "0")}`;
    const key = examVariantDistinctnessKey(id);
    if (includes.every((n) => key.includes(n))) return id;
  }
  throw new Error(`no ${shellCode}/${condCode} variant with ${includes.join(" + ")}`);
}

function describeViolations(r: BotResult): string {
  return r.events
    .filter((e) => e.kind === "violation")
    .map((e) => `${e.code}@${e.t.toFixed(1)}`)
    .join(", ");
}

// ---------------------------------------------------------------------------
// The innocent contract — curated coverage of all 15 sites, 6 kinds
// ---------------------------------------------------------------------------

/** shell → [condition, distinctness-key requirements]. Together the nine
 * drives hit every encounter SITE the bank stages and every staged kind, in
 * ALL SIX conditions (H adds the dusk-dry cell), both bays. */
const INNOCENT_MATRIX: Array<{ shell: string; cond: string; includes: string[] }> = [
  {
    shell: "A",
    cond: "D1",
    includes: ["B1-spawn4-straight=slam", "P1-b2-junction=tight", "A1-blvd-north=committed", "V1-borovski-t=slow"],
  },
  {
    shell: "B",
    cond: "N2",
    includes: ["B3-spawn3-straight=firm", "P2-bradistilov-4way=mid", "A1-blvd-north=stoppable"],
  },
  {
    shell: "C",
    cond: "D2",
    includes: ["A3-stanoev-west=dilemma", "C4-borovski=sprint", "C1-baku-west=calm"],
  },
  {
    shell: "D",
    cond: "D1",
    includes: ["C2-kyulyavkov=slow", "P3e-kamenov-4way=late", "R1-rb-se=tight"],
  },
  {
    shell: "E",
    cond: "V2",
    includes: ["B5-bagryanov-straight=slam", "P3w-kamenov-4way=early", "A3e-bradistilov-east=stoppable"],
  },
  {
    shell: "F",
    cond: "N1",
    includes: ["B6-dimitrov-straight=slam", "A6-nw-cluster=committed", "C10e-baku-crossing=sprint", "R2-rb-nw=tight"],
  },
  {
    shell: "G",
    cond: "D1",
    includes: ["P2-bradistilov-4way=late", "A1-blvd-north=committed", "C9w-baku-mid=sprint", "R1-rb-se=tight"],
  },
  // Route-shell slice (H/I): tiers not yet exercised by the rows above —
  // P1=late, A1=dilemma, R1=comfort, B6=firm, P3e=early, C9w=calm.
  {
    shell: "H",
    cond: "V1",
    includes: ["P1-b2-junction=late", "A1-blvd-north=dilemma", "R1-rb-se=comfort"],
  },
  {
    shell: "I",
    cond: "D2",
    includes: ["B6-dimitrov-straight=firm", "P3e-kamenov-4way=early", "C9w-baku-mid=calm"],
  },
];

describe("exam bank — the innocent contract (full production stack)", () => {
  for (const { shell, cond, includes } of INNOCENT_MATRIX) {
    it(`shell ${shell} ${cond} [${includes.join(", ")}]: zero violations`, () => {
      const id = findVariant(shell, cond, includes);
      const spec = generateExamVariant(id);
      const r = runBot(spec);
      expect(r.stuckAtArc, `bot stuck at arc ${r.stuckAtArc}`).toBeNull();
      expect(r.finished, `route not completed (${r.frames} frames)`).toBe(true);
      expect(violationCodes(r.events), `${id}: ${describeViolations(r)}`).toEqual([]);
      for (const o of r.outcomes) {
        expect(o.success, `${id}: staged ${o.eventId} failed (${o.detail})`).toBe(true);
      }
      expect(examTerminationFor(r.events)).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// The guilty folds — one bot per official termination class
// ---------------------------------------------------------------------------

describe("exam bank — guilty bots per termination class", () => {
  it("red-runner (shell E, short-arm A3e stoppable): red entry + dangerous-mistake fold", () => {
    const id = findVariant("E", "D1", ["A3e-bradistilov-east=stoppable"]);
    const spec = generateExamVariant(id);
    const r = runBot(spec, { ignoreSignals: true });
    const codes = violationCodes(r.events);
    expect(
      codes.some((c) => ["RED_LIGHT_CROSSED", "RED_YELLOW_CROSSED", "YELLOW_LIGHT_NOT_STOPPED"].includes(c)),
      codes.join(","),
    ).toBe(true);
    const termination = examTerminationFor(r.events);
    expect(termination).not.toBeNull();
    // the wire regrade — from the id alone — must rederive the same fold
    const graded = gradeFinishWire({
      lessonId: id,
      startedAtMs: 0,
      finishedAtMs: 600_000,
      aborted: false,
      ruleEvents: r.events.map((e) => ({ kind: e.kind, code: e.code, t: e.t })),
      objectives: spec.objectives.map((o) => ({ id: o.id, done: false, completedAtSec: null })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status === "ok") {
      expect(graded.result.examTermination).toEqual(termination);
      expect(graded.result.passed).toBe(false);
    }
  });

  it("rear-ender (shell B corridor slam): COLLISION + the collision fold", () => {
    const id = findVariant("B", "D1", ["B3-spawn3-straight=slam"]);
    const spec = generateExamVariant(id);
    const r = runBot(spec, { ignoreLeadCar: true });
    expect(violationCodes(r.events)).toContain("COLLISION");
    const termination = examTerminationFor(r.events);
    expect(termination?.reason).toBe("collision");
    const lead = r.outcomes.find((o) => o.kind === "brakingLeadCar");
    expect(lead?.success).toBe(false);
  });

  it("stop-sign barger (shell A): STOP_SIGN_NO_FULL_STOP + dangerous-mistake", () => {
    const id = findVariant("A", "D1", ["P1-b2-junction=tight"]);
    const spec = generateExamVariant(id);
    const r = runBot(spec, { ignoreStopSigns: true });
    expect(violationCodes(r.events)).toContain("STOP_SIGN_NO_FULL_STOP");
    const termination = examTerminationFor(r.events);
    expect(termination?.reason).toBe("dangerous-mistake");
  });

  it("pedestrian plower (shell F, the cut-slot-neighbor dart): pedestrian codes + termination", () => {
    const id = findVariant("F", "D1", ["C10e-baku-crossing=sprint"]);
    const spec = generateExamVariant(id);
    const r = runBot(spec, { ignorePedestrians: true });
    const codes = violationCodes(r.events);
    expect(
      codes.some((c) => ["PEDESTRIAN_NOT_YIELDED", "PEDESTRIAN_CROSSING_TOO_FAST", "COLLISION"].includes(c)),
      codes.join(","),
    ).toBe(true);
    expect(examTerminationFor(r.events)).not.toBeNull();
  });

  it("основни accumulator: three unsignalled turns → osnovni-points-exceeded", () => {
    const id = findVariant("D", "D1", ["C2-kyulyavkov=none", "B4-kamenov-straight=none"]);
    const spec = generateExamVariant(id);
    const r = runBot(spec, { suppressIndicatorTurns: 99 });
    const turnViolations = r.events.filter(
      (e) => e.kind === "violation" && e.code === "TURN_WITHOUT_INDICATOR",
    );
    expect(turnViolations.length).toBeGreaterThanOrEqual(3);
    const termination = examTerminationFor(r.events);
    expect(termination?.reason).toBe("osnovni-points-exceeded");
    expect(termination?.tSec).toBe(turnViolations[2].t);
  });

  it("mixed accumulator: 2 unsignalled turns + 4 speeding bursts → total-points-exceeded", () => {
    const id = findVariant("A", "D1", ["C1-baku-west=none", "V1-borovski-t=none"]);
    const spec = generateExamVariant(id);
    const r = runBot(spec, { suppressIndicatorTurns: 2, speedBursts: 4 });
    const osnovni = r.events.filter(
      (e) => e.kind === "violation" && e.code === "TURN_WITHOUT_INDICATOR",
    );
    const minor = r.events.filter(
      (e) => e.kind === "violation" && e.code === "SPEEDING_OVER_LIMIT",
    );
    expect(osnovni.length, describeViolations(r)).toBe(2);
    expect(minor.length, describeViolations(r)).toBeGreaterThanOrEqual(4);
    const termination = examTerminationFor(r.events);
    expect(termination?.reason, describeViolations(r)).toBe("total-points-exceeded");
  });
});

// ---------------------------------------------------------------------------
// Sim-replay determinism
// ---------------------------------------------------------------------------

describe("exam bank — sim-replay determinism", () => {
  it("the same variant simulated twice produces bit-identical events + outcomes", () => {
    const id = findVariant("G", "N2", ["P2-bradistilov-4way=late", "C9w-baku-mid=sprint"]);
    const spec1 = generateExamVariant(id);
    const spec2 = generateExamVariant(id);
    const a = runBot(spec1);
    const b = runBot(spec2);
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    expect(JSON.stringify(b.outcomes)).toBe(JSON.stringify(a.outcomes));
    expect(a.finished && b.finished).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C1 trace harness (C1_TRACE=<shell:cond> — diagnosis only, no assertions)
// ---------------------------------------------------------------------------

describe.runIf(process.env.C1_TRACE !== undefined)("C1 trace", () => {
  it("traced innocent run", () => {
    const [shellCode, condCode] = (process.env.C1_TRACE ?? "A:D1").split(":");
    const row = INNOCENT_MATRIX.find((r) => r.shell === shellCode);
    // C1_TRACE_ID=EX-…: trace one exact variant id instead of the matrix row.
    const id = process.env.C1_TRACE_ID ?? findVariant(shellCode, condCode ?? "D1", row?.includes ?? []);
    console.log(`tracing ${id} (key ${examVariantDistinctnessKey(id)})`);
    if (process.env.C1_TRACE_PLAN === "1") {
      const shell = EXAM_SHELLS.find((sh) => sh.code === shellCode)!;
      const plan = buildRoutePlan(shell);
      for (let i = 0; i < plan.legStartArc.length; i++) {
        console.log(
          `leg[${i}] start=${plan.legStartArc[i].toFixed(0)} limit=${plan.legLimitKmh[i]} ` +
            `${shell.routeNodes[i]}->${shell.routeNodes[i + 1]}`,
        );
      }
      console.log(`stopSigns=${JSON.stringify(plan.stopSigns.map((m) => m.arc.toFixed(1)))}`);
      console.log(
        `lights=${JSON.stringify(plan.lights.map((m) => `${m.arc.toFixed(0)}:${m.nodeId}`))}`,
      );
    }
    const spec = generateExamVariant(id);
    const r = runBot(spec, {}, undefined, (info) => {
      console.log(
        `[${info.t.toFixed(1)}] ${info.code}${info.detail ? `(${info.detail})` : ""} arc=${info.arc.toFixed(0)} ` +
          `pos=(${info.x.toFixed(1)},${info.y.toFixed(1)}) v=${info.speedKmh.toFixed(1)} h=${info.headingDeg.toFixed(0)} ` +
          `edge=${info.edgeId} lane=${info.laneId} off=${info.laneOffsetM.toFixed(2)} limit=${info.maxSpeedKmh} ` +
          `ww=${info.wrongWay} ind=${info.indicator} stops=[${info.stops.map((s) => s.toFixed(0)).join(",")}]\n    actors: ${info.actors}`,
      );
    });
    console.log(
      `finished=${r.finished} stuck=${r.stuckAtArc?.toFixed(1) ?? "no"} frames=${r.frames} ` +
        `outcomes=${r.outcomes.map((o) => `${o.eventId}:${o.success ? "ok" : "FAIL"}:${o.detail}`).join(" ")}`,
    );
    if (r.stuckAtArc !== null) {
      const plan = buildRoutePlan(EXAM_SHELLS.find((s) => s.code === shellCode)!);
      const d = new PolyDriver(plan.points, 0, 0);
      const pose = d.poseAt(r.stuckAtArc);
      console.log(
        `stuck pose (${pose.x.toFixed(1)},${pose.y.toFixed(1)}) h=${pose.headingDeg.toFixed(0)}; ` +
          `stopSigns=${JSON.stringify(plan.stopSigns.map((m) => m.arc.toFixed(0)))} ` +
          `rings=${JSON.stringify(plan.ringEntries.map((m) => m.arc.toFixed(0)))} ` +
          `rhr=${JSON.stringify(plan.rhrJunctions.map((m) => m.arc.toFixed(0)))} ` +
          `crossings=${JSON.stringify(plan.crossings.map((m) => `${m.id}@${m.arc.toFixed(0)}`))}`,
      );
    }
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Large-sample innocent sweep (EXAM_BANK_REVISION_FULL=1)
// ---------------------------------------------------------------------------

describe.runIf(FULL)("exam bank — FULL innocent sweep (≥100 variants)", () => {
  const cells: Array<{ id: string }> = [];
  for (const shell of EXAM_SHELLS) {
    const count = examShellAssignmentCount(shell.code);
    for (const cond of EXAM_CONDITIONS) {
      for (const idx of [0, Math.floor(count / 2), count - 1]) {
        cells.push({ id: `EX-${shell.code}-${cond.code}-${String(idx).padStart(4, "0")}` });
      }
    }
  }

  it(`sweep size ${cells.length} ≥ 100`, () => {
    expect(cells.length).toBeGreaterThanOrEqual(100);
  });

  for (const { id } of cells) {
    it(`${id}: innocent drive → zero violations`, () => {
      const spec = generateExamVariant(id);
      const r = runBot(spec);
      expect(r.stuckAtArc, `stuck at ${r.stuckAtArc}`).toBeNull();
      expect(r.finished).toBe(true);
      expect(violationCodes(r.events), describeViolations(r)).toEqual([]);
      for (const o of r.outcomes) {
        expect(o.success, `${o.eventId}: ${o.detail}`).toBe(true);
      }
    });
  }
});
