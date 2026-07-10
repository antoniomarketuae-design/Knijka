/**
 * A13 — EXAM_LESSON data invariants against the REAL district
 * (content/world/district-v1.json, same file the runtime drives).
 *
 * The exam spec is pinned data like every lesson: spawn point, objective
 * anchors, staged-event junctions/paths and the dart-out crossing must all
 * exist in the district and sit where the spec claims, and every scripted
 * actor path must be drivable edge-by-edge (oneways honored) — a failure
 * here is a data bug that would brick the exam at session start.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  BrakingLeadCarSpec,
  CyclistRightHookSpec,
  PedestrianDartOutSpec,
  PriorityFromRightSpec,
  RoundaboutEntrySpec,
} from "../../contracts";
import { STOP_LINE_OVERRIDES } from "../../runtime/stoplines";
import { createLessonSession } from "../engine";
import { isExamUnlocked } from "../progression";
import { EXAM_LESSON, LESSON_PARKING_BAYS, LESSONS, lessonById } from "../specs";

// ---------------------------------------------------------------------------
// Raw district (minimal local view of the JSON — no runtime deps)
// ---------------------------------------------------------------------------

interface RawNode {
  id: string;
  x: number;
  y: number;
}
interface RawEdge {
  id: string;
  from: string;
  to: string;
  oneway: boolean;
  geometry: Array<[number, number]>;
}
interface RawDistrict {
  roads: { nodes: RawNode[]; edges: RawEdge[] };
  intersections: Array<{ id: string; signalized: boolean }>;
  crossings: Array<{ id: string; x: number; y: number; kind: string }>;
  roundabouts: Array<{ id: string; x: number; y: number; radius: number }>;
  spawnPoints: Array<{ id: string; x: number; y: number }>;
}

const district = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../../../content/world/district-v1.json", import.meta.url)),
    "utf8",
  ),
) as RawDistrict;

const nodeById = new Map(district.roads.nodes.map((n) => [n.id, n]));
const signalizedIds = new Set(
  district.intersections.filter((i) => i.signalized).map((i) => i.id),
);

/** Directed connectivity: from|to for every edge, both ways unless oneway. */
const connected = new Set<string>();
const edgeByPair = new Map<string, RawEdge>();
for (const e of district.roads.edges) {
  connected.add(`${e.from}|${e.to}`);
  edgeByPair.set(`${e.from}|${e.to}`, e);
  if (!e.oneway) {
    connected.add(`${e.to}|${e.from}`);
    edgeByPair.set(`${e.to}|${e.from}`, e);
  }
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance of a point to the nearest drivable polyline in the district. */
function distToNearestEdge(x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const e of district.roads.edges) {
    const g = e.geometry;
    for (let i = 0; i < g.length - 1; i++) {
      const d = distToSegment(x, y, g[i][0], g[i][1], g[i + 1][0], g[i + 1][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Distance of a point to a specific actor path (edges between node pairs). */
function distToActorPath(pathNodes: readonly string[], x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pathNodes.length - 1; i++) {
    const e = edgeByPair.get(`${pathNodes[i]}|${pathNodes[i + 1]}`);
    if (!e) continue;
    const g = e.geometry;
    for (let j = 0; j < g.length - 1; j++) {
      const d = distToSegment(x, y, g[j][0], g[j][1], g[j + 1][0], g[j + 1][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

function staged<T>(id: string): T {
  const spec = EXAM_LESSON.stagedEvents?.find((e) => e.id === id);
  if (!spec) throw new Error(`missing staged event ${id} on the exam spec`);
  return spec as T;
}

// ---------------------------------------------------------------------------
// Spec shape + engine parse
// ---------------------------------------------------------------------------

describe("EXAM_LESSON shape", () => {
  it("is the exam: examMode, cold start, ASSESS pre-drive, gated behind L2", () => {
    expect(EXAM_LESSON.examMode).toBe(true);
    expect(EXAM_LESSON.preDrive).toBe(true);
    expect(EXAM_LESSON.preDriveMode).toBe("assess");
    expect(EXAM_LESSON.vehicleStart).toBeUndefined(); // default = cold (A1)
    // The documented prerequisite must be a real curriculum lesson.
    expect(LESSONS.some((l) => l.id === EXAM_LESSON.unlockAfterLessonId)).toBe(true);
  });

  it("resolves through lessonById (the wire path) but stays out of LESSONS", () => {
    expect(lessonById(EXAM_LESSON.id)).toBe(EXAM_LESSON);
    expect(LESSONS.some((l) => l.id === EXAM_LESSON.id)).toBe(false);
  });

  it("parses into a session: every objective param validates", () => {
    const session = createLessonSession(EXAM_LESSON);
    expect(session.phase).toBe("preDrive");
    expect(session.objectives).toHaveLength(EXAM_LESSON.objectives.length);
    expect(EXAM_LESSON.objectives.length).toBeGreaterThanOrEqual(10);
  });

  it("objective and staged-event ids are unique (wire reconcile requires it)", () => {
    const oIds = EXAM_LESSON.objectives.map((o) => o.id);
    expect(new Set(oIds).size).toBe(oIds.length);
    const sIds = (EXAM_LESSON.stagedEvents ?? []).map((e) => e.id);
    expect(new Set(sIds).size).toBe(sIds.length);
  });

  it("finishes in the SAME painted bay L7 grades (single-sourced rect)", () => {
    expect(EXAM_LESSON.parkingBay).toBe(lessonById("l7-parking")!.parkingBay);
    expect(LESSON_PARKING_BAYS).toContain(EXAM_LESSON.parkingBay!);
    const park = EXAM_LESSON.objectives.at(-1)!;
    expect(park.params.bay).toBe(EXAM_LESSON.parkingBay);
  });
});

// ---------------------------------------------------------------------------
// Route anchors vs the district
// ---------------------------------------------------------------------------

describe("exam route anchors exist in the district", () => {
  it("spawns at a real spawn point", () => {
    expect(district.spawnPoints.some((s) => s.id === EXAM_LESSON.spawn.pointId)).toBe(true);
  });

  it("every passSignal objective pins a real node at its real coordinates", () => {
    for (const o of EXAM_LESSON.objectives) {
      if (o.kind !== "passSignal") continue;
      const p = o.params as { nodeId: string; x: number; y: number; control: string };
      const node = nodeById.get(p.nodeId);
      expect(node, `${o.id}: node ${p.nodeId} missing`).toBeDefined();
      expect(Math.hypot(node!.x - p.x, node!.y - p.y), `${o.id}: coords drifted`).toBeLessThan(1);
      if (p.control === "trafficLight") {
        expect(signalizedIds.has(p.nodeId), `${o.id}: junction not signalized`).toBe(true);
      } else {
        // The Б2 node must actually carry a stop line (hand-placed override —
        // the same guarantee L2 relies on; audit 04 D10).
        expect(
          STOP_LINE_OVERRIDES.some((s) => s.nodeId === p.nodeId),
          `${o.id}: no stop-line override at ${p.nodeId}`,
        ).toBe(true);
      }
    }
  });

  it("every reachZone touches a drivable road within its radius", () => {
    for (const o of EXAM_LESSON.objectives) {
      if (o.kind !== "reachZone") continue;
      const p = o.params as { x: number; y: number; radiusM: number };
      const d = distToNearestEdge(p.x, p.y);
      // The nearest carriageway must pass well inside the zone, or the
      // objective could never complete from the road.
      expect(d, `${o.id}: nearest road ${d.toFixed(1)} m away`).toBeLessThan(p.radiusM - 4);
    }
  });

  it("the roundabout maneuver matches the district's rb-1", () => {
    const o = EXAM_LESSON.objectives.find((x) => x.id === "ex-roundabout")!;
    const p = o.params as { x: number; y: number; enterRadiusM: number; exitRadiusM: number };
    const rb = district.roundabouts[0];
    expect(Math.hypot(rb.x - p.x, rb.y - p.y)).toBeLessThan(1);
    expect(p.enterRadiusM).toBeGreaterThan(rb.radius);
    expect(p.exitRadiusM).toBeGreaterThan(p.enterRadiusM);
  });
});

// ---------------------------------------------------------------------------
// Staged events vs the district
// ---------------------------------------------------------------------------

describe("exam staged events validate against the district", () => {
  it("runs all five A8 kinds, exam-armed", () => {
    const kinds = (EXAM_LESSON.stagedEvents ?? []).map((e) => e.kind);
    expect(new Set(kinds)).toEqual(
      new Set([
        "brakingLeadCar",
        "priorityFromRight",
        "pedestrianDartOut",
        "cyclistRightHook",
        "roundaboutEntry",
      ]),
    );
  });

  it("every actor path is drivable: nodes exist, consecutive pairs edge-connected (oneways honored)", () => {
    for (const ev of EXAM_LESSON.stagedEvents ?? []) {
      if (!("actor" in ev)) continue;
      const nodes = ev.actor.pathNodes;
      for (const id of nodes) {
        expect(nodeById.has(id), `${ev.id}: node ${id} missing`).toBe(true);
      }
      for (let i = 0; i < nodes.length - 1; i++) {
        expect(
          connected.has(`${nodes[i]}|${nodes[i + 1]}`),
          `${ev.id}: ${nodes[i]} → ${nodes[i + 1]} not drivable`,
        ).toBe(true);
      }
    }
  });

  it("junction-anchored events pin real junction coordinates", () => {
    for (const ev of [
      staged<PriorityFromRightSpec>("ex-priority-from-right"),
      staged<CyclistRightHookSpec>("ex-cyclist-right-hook"),
    ]) {
      const node = nodeById.get(ev.junction.nodeId);
      expect(node, `${ev.id}: junction missing`).toBeDefined();
      expect(Math.hypot(node!.x - ev.junction.x, node!.y - ev.junction.y)).toBeLessThan(1.5);
      // The junction node is ON the actor's path at junctionNodeIndex.
      expect(ev.actor.pathNodes[ev.junctionNodeIndex]).toBe(ev.junction.nodeId);
    }
  });

  it("the reused junction hazards are the lesson geometry verbatim", () => {
    const l2 = lessonById("l2-intersections")!.stagedEvents![0] as PriorityFromRightSpec;
    const ex = staged<PriorityFromRightSpec>("ex-priority-from-right");
    expect({ ...ex, id: l2.id }).toEqual(l2);
    const l3 = lessonById("l3-roundabout")!.stagedEvents!;
    const exCyc = staged<CyclistRightHookSpec>("ex-cyclist-right-hook");
    expect({ ...exCyc, id: "l3-cyclist-right-hook" }).toEqual(l3[0]);
    const exRb = staged<RoundaboutEntrySpec>("ex-roundabout-conflict");
    expect({ ...exRb, id: "l3-roundabout-conflict" }).toEqual(l3[1]);
  });

  it("the braking lead car holds ahead of spawn-4 and slams ON its own path", () => {
    const ev = staged<BrakingLeadCarSpec>("ex-braking-lead");
    // Slam point sits on the authored path polyline (the runner triggers by
    // actor-to-point distance — an off-path point would never fire).
    expect(distToActorPath(ev.actor.pathNodes, ev.slamAt.x, ev.slamAt.y)).toBeLessThan(2);
    // The stimulus is the car itself — the exam authors no ball visual.
    expect(ev.triggersHazard).toBe(false);
    expect(EXAM_LESSON.hazard).toBeUndefined();
    // Slam happens BEFORE the Б2 stop line the route continues to (room to
    // recover): the stop node is ~64 m north of the slam point.
    const stop = nodeById.get("n331942490")!;
    expect(stop.y - ev.slamAt.y).toBeGreaterThan(60);
  });

  it("the dart-out fires at a real MARKED crossing, from the right curb, across the road", () => {
    const ev = staged<PedestrianDartOutSpec>("ex-ped-dart-out");
    const crossing = district.crossings.find((c) => c.id === ev.crossingId);
    expect(crossing).toBeDefined();
    expect(crossing!.kind).toBe("marked");
    expect(Math.hypot(crossing!.x - ev.crossing.x, crossing!.y - ev.crossing.y)).toBeLessThan(1);
    // Unit dart direction; the walk from the curb start passes through the
    // crossing point (start + |start−crossing|·dir ≈ crossing).
    expect(Math.hypot(ev.dir.x, ev.dir.y)).toBeCloseTo(1, 3);
    const toCrossing = Math.hypot(ev.start.x - ev.crossing.x, ev.start.y - ev.crossing.y);
    const walkX = ev.start.x + toCrossing * ev.dir.x;
    const walkY = ev.start.y + toCrossing * ev.dir.y;
    expect(Math.hypot(walkX - ev.crossing.x, walkY - ev.crossing.y)).toBeLessThan(0.2);
    // The roadway window sits inside the walk (L4 derivation).
    expect(ev.roadFromM).toBeGreaterThan(0);
    expect(ev.roadFromM).toBeLessThan(ev.roadToM);
    expect(ev.roadToM).toBeLessThan(ev.travelM);
  });
});

// ---------------------------------------------------------------------------
// Unlock gate
// ---------------------------------------------------------------------------

describe("exam unlock gate (isExamUnlocked)", () => {
  const pass = (lessonId: string) => ({ lessonId, passed: true, score: 0 });
  const fail = (lessonId: string) => ({ lessonId, passed: false, score: 12 });

  it("stays locked until the prerequisite lesson is PASSED", () => {
    expect(isExamUnlocked(EXAM_LESSON, [])).toBe(false);
    expect(isExamUnlocked(EXAM_LESSON, [fail("l2-intersections")])).toBe(false);
    expect(isExamUnlocked(EXAM_LESSON, [pass("l1-preparation")])).toBe(false);
    expect(isExamUnlocked(EXAM_LESSON, [pass("l2-intersections")])).toBe(true);
    expect(
      isExamUnlocked(EXAM_LESSON, [fail("l2-intersections"), pass("l2-intersections")]),
    ).toBe(true);
  });

  it("a spec without a prerequisite is always open", () => {
    expect(isExamUnlocked({}, [])).toBe(true);
  });
});
