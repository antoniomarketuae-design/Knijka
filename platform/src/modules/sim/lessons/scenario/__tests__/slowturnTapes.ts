/**
 * Test support (lane slowturn) — every committed demo trace and every
 * committed rig tape, as ScenarioTraces, and the offline grid replay that feeds
 * them to the runtime's TurnDetector exactly as `worldRuntime` does on each
 * fixed grid point (pose and speed from `sampleAt` at k·FIXED_DT — the replay
 * harness's own student hook —, the junction node within 40 m, the Locator's
 * lane fix, the ring set). Poses are level-independent, so one replay per tape
 * answers for L1–L5.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDistrict } from "../../../runtime";
import { DistrictIndex } from "../../../runtime/spatial";
import { Locator } from "../../../runtime/locator";
import {
  createTurnRoadPort,
  JUNCTION_AREA_RADIUS_M,
  TurnDetector,
  type TurnRoadSample,
} from "../../../runtime/turns";
import type { SimTickEvent } from "../../../rules/types";
import { parseScenarioTrace } from "../../../traces/parse";
import { sampleAt } from "../../../traces/sample";
import type { ScenarioTrace, TracePoint, TraceSample } from "../../../traces/types";
import { FIXED_DT } from "../../../vehicle/tuning";
import { SCENARIO_TEMPLATES } from "../templates";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

export interface TapeCell {
  lessonId: string;
  name: string;
  kind: "demo" | "rig";
  trace: ScenarioTrace;
  level?: number;
}

export function committedDemoTapes(): TapeCell[] {
  const out: TapeCell[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    const dir = path.join(REPO_ROOT, "content", "traces", spec.id);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".trace.json")).sort()) {
      const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(dir, f), "utf-8")));
      if (!trace) continue;
      out.push({ lessonId: spec.id, name: f, kind: "demo", trace });
    }
  }
  return out;
}

const IND: Record<string, "left" | "off" | "right"> = {
  "-1": "left",
  "0": "off",
  "1": "right",
  left: "left",
  off: "off",
  right: "right",
};

function rowsTrace(lessonId: string, cols: string[], rows: unknown[][]): ScenarioTrace {
  const ci = (n: string) => cols.indexOf(n);
  const samples: TraceSample[] = rows.map((r) => ({
    tSec: r[ci("t")] as number,
    x: r[ci("x")] as number,
    y: r[ci("y")] as number,
    headingDeg: r[ci("headingDeg")] as number,
    steerRad: 0,
    speedKmh: r[ci("speedKmh")] as number,
    gear: (r[ci("gear")] as number) ?? 1,
    indicator: ci("indicator") >= 0 ? (IND[String(r[ci("indicator")])] ?? "off") : "off",
    brakeOn: ci("brake") >= 0 ? !!r[ci("brake")] : false,
    throttleOn: ci("throttle") >= 0 ? !!r[ci("throttle")] : false,
  }));
  const mono: TraceSample[] = [];
  for (const s of samples) if (mono.length === 0 || s.tSec > mono[mono.length - 1].tSec) mono.push(s);
  return {
    meta: { scenarioId: lessonId, kind: "attempt", version: 1, durationSec: mono[mono.length - 1].tSec },
    samples: mono,
    events: [],
  };
}

/** The committed rig tapes (fixtures beside this file). */
export function committedRigTapes(): TapeCell[] {
  const out: TapeCell[] = [];
  const read = (f: string) => JSON.parse(readFileSync(path.join(HERE, f), "utf-8"));
  const add = (file: string, lessonId: string, key: "legs" | "drives") => {
    const d = read(file);
    for (const [name, leg] of Object.entries(d[key] as Record<string, { rows: unknown[][]; level?: number }>)) {
      out.push({
        lessonId,
        name: `${file}#${name}`,
        kind: "rig",
        trace: rowsTrace(lessonId, d.cols, leg.rows),
        level: leg.level,
      });
    }
  };
  add("ltap-rig-w2-phone-tapes.fixture.json", "sc-turn-left-oncoming", "legs");
  add("ltap-rig-w2-pc-tapes.fixture.json", "sc-turn-left-oncoming", "legs");
  add("controller-dark-lamp-rig-w3a.fixture.json", "sc-sig-controller-postures", "drives");
  add("follow-tailgater-rig-w3b.fixture.json", "sc-follow-tailgater", "drives");
  add("follow-tailgater-rig-w3e.fixture.json", "sc-follow-tailgater", "drives");
  add("w72-tailgater-live-poses.fixture.json", "sc-follow-tailgater", "legs");
  const mw = parseScenarioTrace(read("sc-fo-motorway-gap-one-second-to-stop.fixture.json"));
  if (mw) {
    out.push({
      lessonId: mw.meta.scenarioId,
      name: "sc-fo-motorway-gap-one-second-to-stop.fixture.json",
      kind: "rig",
      trace: mw,
    });
  }
  return out;
}

export interface GridTurnEvent {
  k: number;
  node: string | null;
  dir: "left" | "right";
  tag: "base" | "added";
}

export interface GridVisit {
  node: string;
  ring: boolean;
  k0: number;
  k1: number;
}

export interface GridTurnReplay {
  /** A base-only detector (no road sample) — what the product did before. */
  base: GridTurnEvent[];
  /** The product detector with its road sample — base- and added-tagged. */
  tree: GridTurnEvent[];
  visits: GridVisit[];
}

interface WorldGeo {
  index: DistrictIndex;
  ring: Set<string>;
  sample: TurnRoadSample;
}
const geoCache = new Map<unknown, WorldGeo>();
function geoOf(raw: unknown): WorldGeo {
  let g = geoCache.get(raw);
  if (g) return g;
  const district = parseDistrict(raw);
  const index = new DistrictIndex(district);
  const ring = new Set<string>();
  for (const e of district.roads.edges) {
    if (!e.roundabout) continue;
    ring.add(e.from);
    ring.add(e.to);
  }
  g = {
    index,
    ring,
    sample: { nodeId: null, ring: false, edgeIdx: -1, sM: 0, port: createTurnRoadPort(index) },
  };
  geoCache.set(raw, g);
  return g;
}

/** Replay a tape's grid poses through a base detector and the product one. */
export function gridTurnReplay(
  trace: ScenarioTrace,
  raw: unknown,
  opts: { detector?: TurnDetector; endSec?: number } = {},
): GridTurnReplay {
  const g = geoOf(raw);
  const locator = new Locator(g.index);
  const baseDet = new TurnDetector();
  const treeDet = opts.detector ?? new TurnDetector();
  const p: TracePoint = {
    x: 0,
    y: 0,
    headingDeg: 0,
    steerRad: 0,
    speedKmh: 0,
    gear: 0,
    indicator: "off",
    brakeOn: false,
    throttleOn: false,
  };
  const end = opts.endSec ?? trace.meta.durationSec;
  const kEnd = Math.floor(end / FIXED_DT + 1e-6) + 1;
  const out: GridTurnReplay = { base: [], tree: [], visits: [] };
  const ev: SimTickEvent[] = [];
  let cur: GridVisit | null = null;
  for (let k = 1; k <= kEnd; k++) {
    const t = k * FIXED_DT;
    sampleAt(trace, Math.min(t, trace.meta.durationSec), p);
    const fix = locator.track(p.x, p.y, p.headingDeg);
    const ix = g.index.nearestIntersection(p.x, p.y, JUNCTION_AREA_RADIUS_M);
    const node = ix?.id ?? null;
    if (node === null) cur = null;
    else if (cur === null || cur.node !== node) {
      cur = { node, ring: g.ring.has(node), k0: k, k1: k };
      out.visits.push(cur);
    }
    if (cur) cur.k1 = k;
    ev.length = 0;
    baseDet.update(t, p.headingDeg, ix !== null, ev, p.speedKmh);
    for (const e of ev) if (e.kind === "turnStarted") out.base.push({ k, node, dir: e.direction, tag: "base" });
    ev.length = 0;
    g.sample.nodeId = node;
    g.sample.ring = node !== null && g.ring.has(node);
    g.sample.edgeIdx = fix.edgeIdx;
    g.sample.sM = fix.sM;
    treeDet.update(t, p.headingDeg, ix !== null, ev, p.speedKmh, g.sample);
    for (const e of ev) {
      if (e.kind === "turnStarted") {
        out.tree.push({ k, node, dir: e.direction, tag: e.addedPath === true ? "added" : "base" });
      }
    }
  }
  return out;
}
