/**
 * A VEHICLE'S PLANNED ROUTE THROUGH A NODE (traffic/plannedRoute.ts; lane
 * slowturn, integrator ruling R13''' 2026-11-06). Read-only: the movement and
 * the centre-line come from the route the model already drives the vehicle on
 * — an ambient agent's lane loop, a staged actor's resolved lane path — on the
 * sx-v1 junction sc-turn-left-oncoming is driven at.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildLaneGraph, laneConnector, sampleLane, type DirectedLane, type LaneGraph } from "../graph";
import { ambientRouteThrough, emptyPlannedRoute, plannedMovement, stagedRouteThrough } from "../plannedRoute";
import type { TrafficRoute } from "../routes";
import { resolveStagedVehiclePath, type StagedVehicleAgent } from "../staged";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../types";
import { createVehicleAgent, type VehicleAgent } from "../vehicles";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD = path.resolve(HERE, "../../../../../../content/world");
const sx = (): TrafficDistrict => JSON.parse(readFileSync(path.join(WORLD, "sx-v1.json"), "utf-8"));

function graphOf(d: TrafficDistrict): LaneGraph {
  return buildLaneGraph(d, {
    laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
    excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
    crossingSignalRadiusM: 45,
  });
}
function laneOf(g: LaneGraph, from: string, to: string): DirectedLane {
  const l = g.lanes.find((x) => x.fromNode === from && x.toNode === to);
  if (!l) throw new Error(`no lane ${from}>${to}`);
  return l;
}
function routeOf(lanes: DirectedLane[]): TrafficRoute {
  const laneStartS = new Float64Array(lanes.length);
  let total = 0;
  lanes.forEach((l, i) => {
    laneStartS[i] = total;
    total += l.length;
  });
  return { laneIndices: lanes.map((l) => l.index), laneStartS, totalLength: total };
}
/** An ambient agent on `lanes`, `toNodeM` metres short of the end of the first lane. */
function ambient(g: LaneGraph, lanes: DirectedLane[], toNodeM: number): VehicleAgent {
  const a = createVehicleAgent(5, routeOf(lanes), lanes[0].length - toNodeM, 1, 0);
  return a;
}
/** A staged vehicle on `pathNodes` at arc `s` (only the fields the reader touches). */
function staged(g: LaneGraph, pathNodes: string[], s: number): StagedVehicleAgent {
  const p = resolveStagedVehiclePath(g, pathNodes, 0);
  if (!p) throw new Error("path");
  let i = 0;
  while (i < p.cum.length - 2 && p.cum[i + 1] < s) i++;
  const u = (s - p.cum[i]) / (p.cum[i + 1] - p.cum[i]);
  const x = p.px[i] + (p.px[i + 1] - p.px[i]) * u;
  const y = p.py[i] + (p.py[i + 1] - p.py[i]) * u;
  return { spec: { kind: "vehicle", id: "t", pathNodes, hold: { nodeIndex: 0, offsetM: 0 }, cruiseSpeedMps: 10 }, path: p, s, finished: false, state: { id: 1000, x, y } } as unknown as StagedVehicleAgent;
}

describe("plannedMovement reads turnSpeedCap's bands on the two lanes", () => {
  const g = graphOf(sx());
  const eb = laneOf(g, "sx-n-w", "sx-n-c");
  it("eastbound into sx-n-c: on east straight, south right, north left, back west a U-turn", () => {
    expect(plannedMovement(eb, laneOf(g, "sx-n-c", "sx-n-e"))).toBe("straight");
    expect(plannedMovement(eb, laneOf(g, "sx-n-c", "sx-n-s"))).toBe("right");
    expect(plannedMovement(eb, laneOf(g, "sx-n-c", "sx-n-n"))).toBe("left");
    expect(plannedMovement(eb, laneOf(g, "sx-n-c", "sx-n-w"))).toBe("uturn");
  });
});

describe("ambientRouteThrough — the agent's own lane loop", () => {
  const g = graphOf(sx());
  const eb = laneOf(g, "sx-n-w", "sx-n-c");
  const sb = laneOf(g, "sx-n-c", "sx-n-s");
  const nb = laneOf(g, "sx-n-c", "sx-n-n");
  const R = g.junctionRadiusM.get("sx-n-c") as number;

  it("an eastbound RIGHT-turner 30 m short of the node: movement right, arriving eastbound, its centre-line from its centre round the connector into the south arm", () => {
    const row = emptyPlannedRoute();
    const a = ambient(g, [eb, sb], 30);
    expect(ambientRouteThrough(g, a, "sx-n-c", 36, row)).toBe(true);
    expect(row.movement).toBe("right");
    expect([row.approachDirX, row.approachDirY]).toEqual([eb.endDirX, eb.endDirY]);
    expect(row.junctionRadiusM).toBe(R);
    expect([row.px[0], row.py[0]]).toEqual([a.state.x, a.state.y]);
    // It ends on the south arm's lane, heading south.
    expect(row.py[row.n - 1]).toBeLessThan(row.py[0] - 20);
    expect(Math.abs(row.px[row.n - 1] - sb.px[0])).toBeLessThan(0.5);
  });

  it("an eastbound LEFT-turner: movement left (its route turns away into the north arm)", () => {
    const row = emptyPlannedRoute();
    expect(ambientRouteThrough(g, ambient(g, [eb, nb], 30), "sx-n-c", 36, row)).toBe(true);
    expect(row.movement).toBe("left");
    expect(row.py[row.n - 1]).toBeGreaterThan(20);
  });

  it("null once it is on the lane it leaves by (it has passed the node), for a node not on its loop, and beyond the reach", () => {
    const row = emptyPlannedRoute();
    const passed = ambient(g, [sb, eb], sb.length - 1); // on the south arm's lane, 1 m out of the node
    expect(ambientRouteThrough(g, passed, "sx-n-c", 36, row)).toBe(false);
    expect(ambientRouteThrough(g, ambient(g, [eb, sb], 30), "no-such-node", 36, row)).toBe(false);
    expect(ambientRouteThrough(g, ambient(g, [eb, sb], 90), "sx-n-c", 36, row)).toBe(false);
  });
});

describe("stagedRouteThrough — the staged actor's resolved lane path", () => {
  const g = graphOf(sx());
  const nodes = ["sx-n-w", "sx-n-c", "sx-n-e"];
  const p = resolveStagedVehiclePath(g, nodes, 0)!;
  const sNode = p.nodeS[1];

  it("eastbound straight through sx-n-c, 8 m short of the node: movement straight, its line on through the node", () => {
    const row = emptyPlannedRoute();
    const a = staged(g, nodes, sNode - 8);
    expect(stagedRouteThrough(g, a, "sx-n-c", 36, row)).toBe(true);
    expect(row.movement).toBe("straight");
    expect(row.px[row.n - 1]).toBeGreaterThan(20);
  });

  it("PASSED THE NODE at the shared joint of two straight lanes: null 1 m past it (the resolver dedupes that joint — the measured r6w1 defect: a car at x 10.1 read as still approaching)", () => {
    const row = emptyPlannedRoute();
    expect(stagedRouteThrough(g, staged(g, nodes, sNode + 1), "sx-n-c", 36, row)).toBe(false);
    expect(stagedRouteThrough(g, staged(g, nodes, sNode + 10.1), "sx-n-c", 36, row)).toBe(false);
  });

  it("null beyond the reach, and for an authored rail line", () => {
    const row = emptyPlannedRoute();
    expect(stagedRouteThrough(g, staged(g, nodes, sNode - 40), "sx-n-c", 36, row)).toBe(false);
    const rail = staged(g, nodes, sNode - 8);
    (rail.spec as { railPath?: unknown }).railPath = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    expect(stagedRouteThrough(g, rail, "sx-n-c", 36, row)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LANE slowturn2 — ST-CLASS (integrator rulings ST-CLASS, ST-UTURN-X (a),
// ST-APPROACHDIR, 2026-11-09; sc-turn-left-oncoming:1613ef2c). The movement is
// read on what the vehicle DRIVES (an ambient connector's end tangents d0/d3,
// else the lanes' end segments; a staged pair always on its end segments), and
// the order is: the reverse lane «uturn», then «straight», then the side —
// «right» however sharp, otherwise «left» (no sharp-left U-turn band).
// ─────────────────────────────────────────────────────────────────────────────
const graphFile = (f: string): LaneGraph => graphOf(JSON.parse(readFileSync(path.join(WORLD, f), "utf-8")) as TrafficDistrict);
function laneByEdge(g: LaneGraph, edgeId: string, toNode: string): DirectedLane {
  const l = g.lanes.find((x) => x.edgeId === edgeId && x.toNode === toNode);
  if (!l) throw new Error(`no lane ${edgeId} into ${toNode}`);
  return l;
}
function laneOutByEdge(g: LaneGraph, edgeId: string, fromNode: string): DirectedLane {
  const l = g.lanes.find((x) => x.edgeId === edgeId && x.fromNode === fromNode);
  if (!l) throw new Error(`no lane ${edgeId} out of ${fromNode}`);
  return l;
}
const movementOf = (g: LaneGraph, node: string, from: string, to: string) => {
  const a = laneByEdge(g, from, node);
  const b = laneOutByEdge(g, to, node);
  return plannedMovement(a, b, laneConnector(g, a, b));
};
/** A synthetic lane pair: `cur` arrives heading 0° (north); `next` leaves on `deg` (0 = north, clockwise; negative = to the left). */
function synthPair(deg: number): [DirectedLane, DirectedLane] {
  const r = (deg * Math.PI) / 180;
  const cur = { index: 0, reverse: -1, endDirX: 0, endDirY: 1, startDirX: 0, startDirY: 1 } as unknown as DirectedLane;
  const next = { index: 1, reverse: -1, endDirX: Math.sin(r), endDirY: Math.cos(r), startDirX: Math.sin(r), startDirY: Math.cos(r) } as unknown as DirectedLane;
  return [cur, next];
}

describe("T-CLASS-1 — the exam drill's graded node: the oncoming sharp right-turner is «right» (it was «uturn»)", () => {
  const g = graphFile("d2-v1.json");
  it("ambient e856821051.0 → e23040421.0 at n4547529959 is «right» on its driven connector (86.5°), and its approach direction is unchanged (the arrival lane's end segment)", () => {
    const a = laneByEdge(g, "e856821051.0", "n4547529959");
    const b = laneOutByEdge(g, "e23040421.0", "n4547529959");
    const conn = laneConnector(g, a, b);
    expect(conn.length).toBeGreaterThan(0);
    expect(b.index).not.toBe(a.reverse);
    expect(plannedMovement(a, b, conn)).toBe("right");
    const agent = createVehicleAgent(5, routeOf([a, b]), a.length - 20, 1, 0);
    const row = emptyPlannedRoute();
    expect(ambientRouteThrough(g, agent, "n4547529959", 36, row)).toBe(true);
    expect(row.movement).toBe("right");
    expect([row.approachDirX, row.approachDirY]).toEqual([a.endDirX, a.endDirY]);
  });
});

describe("T-CLASS-2 — the order: reverse lane, straight, the side, and no sharp-left U-turn band", () => {
  it("a real reverse pair whose connector tangents give cross < 0 by float noise (d2-v1 n1116876709, the reverse of e1056871742.0) is «uturn»", () => {
    const g = graphFile("d2-v1.json");
    const a = laneByEdge(g, "e1056871742.0", "n1116876709");
    const b = g.lanes[a.reverse];
    expect(b.fromNode).toBe("n1116876709");
    const conn = laneConnector(g, a, b);
    expect(conn.length).toBeGreaterThan(0);
    // the precondition the order exists for: read after the side, this pair would be «right»
    const o = { x: 0, y: 0, dirX: 0, dirY: 0, segHint: 0 };
    sampleLane(a, conn.exitS, a.px.length - 2, o);
    const ax = o.dirX;
    const ay = o.dirY;
    sampleLane(b, conn.entryS, 0, o);
    expect(ax * o.dirY - ay * o.dirX).toBeLessThan(0);
    expect(plannedMovement(a, b, conn)).toBe("uturn");
  });
  it("a 120° and a 170° RIGHT turn are «right»; a 120° and a 170° LEFT turn are «left» (ST-UTURN-X (a): only the reverse lane is a U-turn)", () => {
    expect(plannedMovement(...synthPair(120))).toBe("right");
    expect(plannedMovement(...synthPair(170))).toBe("right");
    expect(plannedMovement(...synthPair(-120))).toBe("left");
    expect(plannedMovement(...synthPair(-170))).toBe("left");
    expect(plannedMovement(...synthPair(-54))).toBe("straight");
    expect(plannedMovement(...synthPair(56))).toBe("right");
  });
});

describe("T-CLASS-3 — the connector's end TANGENTS decide an ambient pair; a staged pair reads the lanes' end segments", () => {
  it("the 7 pairs whose connector polyline's first/last segments fall on the other side of 55° are classed by their tangents", () => {
    const d2 = graphFile("d2-v1.json");
    const dv = graphFile("district-v1.json");
    const pe = graphFile("pe-bus-v1.json");
    expect(movementOf(d2, "n1699875303", "e157729617.1", "e881639359.0")).toBe("right");
    expect(movementOf(d2, "n427565823", "e59417936.6", "e113503604.0")).toBe("right");
    expect(movementOf(d2, "n1699875303", "e881639359.0", "e157729617.1")).toBe("left");
    expect(movementOf(dv, "n316456679", "e1134526594.0", "e1134526580.0")).toBe("straight");
    expect(movementOf(dv, "n289548674", "e680294110.0", "e1156337176.0")).toBe("straight");
    expect(movementOf(dv, "n4403415563", "e988318458.0", "e1157644946.0")).toBe("straight");
    expect(movementOf(pe, "pe-n-end", "pe-e-street", "pe-e-yard")).toBe("straight");
  });
  it("d2-v1 n4547529959 e23040421.0 → e1107483891.0 is «straight» (62.2° on its end segments, 45.5° driven); district-v1 n330851787 e169383018.0 → e672184257.0 is «right» (18.4° / 67.1°)", () => {
    expect(movementOf(graphFile("d2-v1.json"), "n4547529959", "e23040421.0", "e1107483891.0")).toBe("straight");
    expect(movementOf(graphFile("district-v1.json"), "n330851787", "e169383018.0", "e672184257.0")).toBe("right");
  });
  it("…and an AMBIENT agent driving d2-v1 e23040421.0 → e1107483891.0 is planned «straight» by ambientRouteThrough (its connector, not its end segments)", () => {
    const g = graphFile("d2-v1.json");
    const a = laneByEdge(g, "e23040421.0", "n4547529959");
    const b = laneOutByEdge(g, "e1107483891.0", "n4547529959");
    const agent = createVehicleAgent(5, routeOf([a, b]), a.length - 15, 1, 0);
    const row = emptyPlannedRoute();
    expect(ambientRouteThrough(g, agent, "n4547529959", 36, row)).toBe(true);
    expect(row.movement).toBe("straight");
  });
  it("a STAGED vehicle through d2-v1 n6387824913 → n4547529959 → n10133466926 is classed on its lanes' end segments («left», 62.2°), not on a connector it never drives", () => {
    const g = graphFile("d2-v1.json");
    const nodes = ["n6387824913", "n4547529959", "n10133466926"];
    const p = resolveStagedVehiclePath(g, nodes, 0)!;
    const s = p.nodeS[1] - 10;
    let i = 0;
    while (i < p.cum.length - 2 && p.cum[i + 1] < s) i++;
    const u = (s - p.cum[i]) / (p.cum[i + 1] - p.cum[i]);
    const agent = {
      spec: { kind: "vehicle", id: "t", pathNodes: nodes, hold: { nodeIndex: 0, offsetM: 0 }, cruiseSpeedMps: 10 },
      path: p,
      s,
      finished: false,
      state: { id: 1000, x: p.px[i] + (p.px[i + 1] - p.px[i]) * u, y: p.py[i] + (p.py[i + 1] - p.py[i]) * u },
    } as unknown as StagedVehicleAgent;
    const row = emptyPlannedRoute();
    expect(stagedRouteThrough(g, agent, "n4547529959", 36, row)).toBe(true);
    expect(row.movement).toBe("left");
  });
});

describe("T-CLASS-CENSUS — every directed lane pair in content/world against the DRAFTER's committed census (option revOnly) and the BASE classes", () => {
  it("the 84 listed pairs move to the census class; every other non-reverse pair keeps its base class; all 856 reverse pairs are «uturn»", () => {
    const FIX = JSON.parse(readFileSync(path.join(HERE, "planned-movement-census.fixture.json"), "utf-8")) as {
      pairCount: number;
      expectedChanges: Array<{ file: string; node: string; from: string; to: string; before: string; after: string }>;
      baseClasses: Record<string, string[]>;
    };
    const changes = new Map(FIX.expectedChanges.map((c) => [`${c.file}|${c.node}|${c.from}>${c.to}`, c]));
    expect(changes.size).toBe(84);
    let pairs = 0;
    let moved = 0;
    let reverse = 0;
    const wrong: string[] = [];
    for (const [file, rows] of Object.entries(FIX.baseClasses)) {
      const g = graphFile(file);
      const seen = new Set<string>();
      for (const r of rows) {
        const [ix, node, edges, base] = r.split(" ");
        const [ai, bi] = ix.split(">").map(Number);
        const a = g.lanes[ai];
        const b = g.lanes[bi];
        expect(`${a.edgeId}>${b.edgeId}`).toBe(edges);
        const got = plannedMovement(a, b, laneConnector(g, a, b));
        const c = changes.get(`${file}|${node}|${edges}`);
        pairs++;
        seen.add(ix);
        if (c) {
          moved++;
          expect(base).toBe(c.before);
          if (got !== c.after) wrong.push(`${file} ${node} ${edges}: ${got} (census ${c.after})`);
        } else if (got !== base) wrong.push(`${file} ${node} ${edges}: ${got} (base ${base})`);
      }
      for (const a of g.lanes)
        for (const bi of g.nodeOut.get(a.toNode) ?? []) {
          const b = g.lanes[bi];
          if (b.index === a.reverse) {
            reverse++;
            if (plannedMovement(a, b, laneConnector(g, a, b)) !== "uturn") wrong.push(`${file} reverse ${a.edgeId}: not uturn`);
          } else if (!seen.has(`${a.index}>${b.index}`)) wrong.push(`${file} ${a.index}>${b.index}: not in the fixture`);
        }
    }
    expect(wrong).toEqual([]);
    expect(pairs).toBe(FIX.pairCount);
    expect(moved).toBe(84);
    expect(reverse).toBe(856);
  });
});
