/**
 * scenery-sightline — the Lane 4 gate for doc 86 T6 / L9 / D10.
 *
 * The defect class this file exists to make unauthorable: **a lesson grades a
 * look that its own scenery makes impossible.** The parked-car curb pass
 * (`traffic/TrafficLayer.computeParkedCars`) walked the RAW edge polyline
 * while the road ribbon is trimmed at the junction mouth, so 45 decoration
 * bodies stood inside junction mouths across the seven junction districts
 * (194 across all 90), directly on the give-way sightline the student is
 * graded on — and the staged pedestrians, who have no pathfinding of any
 * kind, walked through them.
 *
 * Measured on this tree before the fix / after it:
 *
 * | invariant                                            | before | after |
 * |------------------------------------------------------|--------|-------|
 * | bodies inside a junction mouth, 90 districts          |  194   |   0   |
 * | …of those, on the 7 junction districts                |   45   |   0   |
 * | worst dart-out walk clearance to a body footprint, m  |  0.00  | 1.35  |
 * | worst graded-yield sightline clearance, m             |  0.00  | 2.25  |
 * | committed traces driving through a body               |    5   |   2*  |
 *
 * (*) the two residuals are named in TRACE_EXEMPT below with their numbers.
 *
 * Everything here reads the SHIPPED artefacts — the committed district JSON,
 * `SCENARIO_TEMPLATES`, `parkedClearZonesFor` and the committed traces — and
 * the SHIPPED placement function. No fixtures.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PERCEPTUAL_ROAD_SCALE } from "@/modules/sim/contracts";
import { SCENARIO_TEMPLATES } from "@/modules/sim/lessons";
import { parkedClearZonesFor } from "@/modules/sim/scene/scenarioSceneryProps";
import { edgeTravelHalfWidth, nodeOpenRadiusM } from "../../world/builders/network";
import { buildLaneGraph } from "../graph";
import {
  computeParkedCars,
  PARK_CROSSING_CLEAR_M,
  PARK_JUNCTION_CLEAR_M,
  type ParkedCar,
  type ParkedClearZoneLike,
} from "../TrafficLayer";
import type { DistrictEdge, TrafficDistrict } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const WORLD_DIR = path.join(REPO_ROOT, "content", "world");
const TRACE_DIR = path.join(REPO_ROOT, "content", "traces");

/** The lane width LessonScene mounts TrafficLayer with (its own default). */
const LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;

/** Parked-body footprint half-extents (the kit's worst case), m. */
const BODY_HALF_LEN = 2.25;
const BODY_HALF_W = 0.95;
/** Hero half-width, m — the margin a driven line needs past a body flank. */
const HERO_HALF_W = 0.85;
/** Half a walker's shoulders, m. */
const WALKER_HALF_W = 0.35;

/**
 * The bar doc 86 §9 Lane 4 sets: from the graded yield pose, the ray to the
 * conflict actor must clear every parked body by this much. Two metres is
 * about a car's width — enough that the body is scenery beside the sightline,
 * not an object standing in it.
 */
const SIGHT_CLEARANCE_M = 2.0;
/**
 * How much of the conflict actor's approach the sightline must cover: the
 * accepted-gap window a driver actually reads before committing, six seconds
 * of the actor's OWN cruise speed, capped so a fast actor does not demand a
 * sightline no street has.
 */
const SIGHT_WINDOW_SEC = 6;
const SIGHT_WINDOW_MAX_M = 45;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Body-local frame: forward = (sin yaw, −cos yaw) — see ParkedCar.yaw. */
function toLocal(b: ParkedCar, px: number, py: number): [number, number] {
  const fx = Math.sin(b.yaw);
  const fy = -Math.cos(b.yaw);
  const ex = px - b.x;
  const ey = py - b.y;
  return [ex * fx + ey * fy, ex * fy - ey * fx];
}

/** Distance from a point to the body's oriented footprint (0 = inside). */
function pointToBody(b: ParkedCar, px: number, py: number): number {
  const [u, v] = toLocal(b, px, py);
  const a = Math.max(Math.abs(u) - BODY_HALF_LEN, 0);
  const c = Math.max(Math.abs(v) - BODY_HALF_W, 0);
  return Math.hypot(a, c);
}

function pointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/**
 * EXACT distance from segment AB to the body's oriented footprint (0 when it
 * cuts through). A segment and a rectangle are both convex, so the minimum
 * sits either at a segment endpoint or at a rectangle corner.
 */
function segmentToBody(
  b: ParkedCar,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const [u0, v0] = toLocal(b, ax, ay);
  const [u1, v1] = toLocal(b, bx, by);
  // Separating-axis reject: if the segment's own slab and the box's two axes
  // all overlap, the shapes intersect.
  const overlapU = !(Math.max(u0, u1) < -BODY_HALF_LEN || Math.min(u0, u1) > BODY_HALF_LEN);
  const overlapV = !(Math.max(v0, v1) < -BODY_HALF_W || Math.min(v0, v1) > BODY_HALF_W);
  if (overlapU && overlapV) {
    // Third axis: the segment's own normal.
    const du = u1 - u0;
    const dv = v1 - v0;
    const nLen = Math.hypot(du, dv);
    if (nLen < 1e-9) return pointToBody(b, ax, ay);
    const nu = dv / nLen;
    const nv = -du / nLen;
    const segProj = u0 * nu + v0 * nv;
    const boxRadius = Math.abs(nu) * BODY_HALF_LEN + Math.abs(nv) * BODY_HALF_W;
    if (Math.abs(segProj) <= boxRadius) return 0;
  }
  let best = Math.min(
    Math.hypot(Math.max(Math.abs(u0) - BODY_HALF_LEN, 0), Math.max(Math.abs(v0) - BODY_HALF_W, 0)),
    Math.hypot(Math.max(Math.abs(u1) - BODY_HALF_LEN, 0), Math.max(Math.abs(v1) - BODY_HALF_W, 0)),
  );
  for (const cu of [-BODY_HALF_LEN, BODY_HALF_LEN]) {
    for (const cv of [-BODY_HALF_W, BODY_HALF_W]) {
      const d = pointToSegment(cu, cv, u0, v0, u1, v1);
      if (d < best) best = d;
    }
  }
  return best;
}

function polylineLen(geo: readonly number[][]): number {
  let total = 0;
  for (let i = 0; i < geo.length - 1; i++) {
    total += Math.hypot(geo[i + 1][0] - geo[i][0], geo[i + 1][1] - geo[i][1]);
  }
  return total;
}

/** Perpendicular miss from a point to a polyline. */
function missToPolyline(geo: readonly number[][], px: number, py: number): number {
  let best = Infinity;
  for (let i = 0; i < geo.length - 1; i++) {
    const d = pointToSegment(px, py, geo[i][0], geo[i][1], geo[i + 1][0], geo[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

/** Arclength of a point's projection onto a polyline. */
function arcOf(geo: readonly number[][], px: number, py: number): number {
  let bestS = 0;
  let bestD2 = Infinity;
  let arc = 0;
  for (let i = 0; i < geo.length - 1; i++) {
    const ax = geo[i][0];
    const ay = geo[i][1];
    const dx = geo[i + 1][0] - ax;
    const dy = geo[i + 1][1] - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t;
    const qy = ay + dy * t;
    const d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestS = arc + Math.sqrt(len2) * t;
    }
    arc += Math.sqrt(len2);
  }
  return bestS;
}

/** Unit tangent of a polyline at arclength `s`. */
function tangentAt(geo: readonly number[][], s: number): [number, number] {
  let arc = 0;
  for (let i = 0; i < geo.length - 1; i++) {
    const dx = geo[i + 1][0] - geo[i][0];
    const dy = geo[i + 1][1] - geo[i][1];
    const len = Math.hypot(dx, dy) || 1;
    if (s <= arc + len || i === geo.length - 2) return [dx / len, dy / len];
    arc += len;
  }
  return [1, 0];
}

// ---------------------------------------------------------------------------
// Fixtures — the committed artefacts
// ---------------------------------------------------------------------------

const DISTRICT_IDS = readdirSync(WORLD_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

const districtCache = new Map<string, TrafficDistrict | null>();
function loadDistrict(id: string): TrafficDistrict | null {
  if (!districtCache.has(id)) {
    const raw = JSON.parse(
      readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf-8"),
    ) as TrafficDistrict;
    districtCache.set(id, raw.roads?.edges ? raw : null);
  }
  return districtCache.get(id) ?? null;
}

const parkedCache = new Map<string, ParkedCar[]>();
function parkedOf(
  districtId: string,
  cacheKey = "",
  zones: readonly ParkedClearZoneLike[] = [],
): ParkedCar[] {
  const key = `${districtId}|${cacheKey}`;
  let cars = parkedCache.get(key);
  if (!cars) {
    const d = loadDistrict(districtId);
    cars = d ? computeParkedCars(d, LANE_W, zones) : [];
    parkedCache.set(key, cars);
  }
  return cars;
}

/** The bodies the SCENE actually mounts for one template (its derived zones). */
function parkedForTemplate(templateId: string, districtId: string): ParkedCar[] {
  return parkedOf(districtId, templateId, parkedClearZonesFor(`${templateId}@L1`));
}

function stagedOf(spec: (typeof SCENARIO_TEMPLATES)[number]) {
  return [...(spec.staged ?? []), ...spec.levels.flatMap((l) => l.stagedAdd ?? [])];
}

function junctionNodes(d: TrafficDistrict) {
  const touching = new Map<string, DistrictEdge[]>();
  for (const e of d.roads.edges) {
    for (const id of [e.from, e.to]) {
      let bucket = touching.get(id);
      if (!bucket) touching.set(id, (bucket = []));
      bucket.push(e);
    }
  }
  const pos = new Map(d.roads.nodes.map((n) => [n.id, n]));
  const out: Array<{ id: string; x: number; y: number; radiusM: number; degree: number }> = [];
  for (const [id, touched] of touching) {
    const p = pos.get(id);
    if (!p) continue;
    out.push({
      id,
      x: p.x,
      y: p.y,
      radiusM: nodeOpenRadiusM(touched, touched.length),
      degree: touched.length,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// T6 — nothing parks in a junction
// ---------------------------------------------------------------------------

/** The seven junction districts doc 86 T6 censused. */
const JUNCTION_DISTRICTS = [
  "tj-rhr-v1",
  "tj-stop-v1",
  "sx-v1",
  "jxg-giveway-v1",
  "tj-emerge-v1",
  "tj-occluded-v1",
  "jx-equal-v1",
] as const;

describe("T6 — no parked body stands inside a junction (ЗДвП чл. 98)", () => {
  // TIME BUDGET, NOT A WIDENED GATE — 2026-08-27.
  //
  // This loads and scans all 90 committed districts. In isolation that is 1.28 s
  // of test time. It went red at the default 5 s inside a full-suite run that
  // took 592 s wall-clock on --maxWorkers=2 — starved, not slow: the same test
  // on the same tree measured 1.28 s alone, byte-identical to the pre-change
  // baseline, so nothing here got more expensive.
  //
  // The ASSERTION is untouched: every district is still scanned and a single
  // parked body inside a junction still fails this. Only the clock moved, and it
  // moved because a false red under load teaches the next reader to ignore it.
  it("is clean on all 90 committed districts", { timeout: 60_000 }, () => {
    const offenders: string[] = [];
    let bodies = 0;
    for (const id of DISTRICT_IDS) {
      const d = loadDistrict(id);
      if (!d) continue;
      const cars = parkedOf(id);
      bodies += cars.length;
      for (const j of junctionNodes(d)) {
        if (j.degree < 3) continue;
        for (const c of cars) {
          const gap = pointToBody(c, j.x, j.y) - j.radiusM;
          if (gap < 0) {
            offenders.push(
              `${id} node ${j.id} (mouth r=${j.radiusM.toFixed(2)}) has a body at ` +
                `(${c.x.toFixed(2)}, ${c.y.toFixed(2)}) — ${(-gap).toFixed(2)} m inside`,
            );
          }
        }
      }
    }
    // 3723 bodies survive the legality filter (4011 before it).
    expect(bodies).toBeGreaterThan(3000);
    expect(offenders).toEqual([]);
  });

  it("keeps чл. 98's five metres of daylight past every junction mouth", () => {
    // Stricter than the mouth test above: the law is 5 m from the corner, and
    // the body's own half-length has to fit outside that.
    const tight: string[] = [];
    for (const id of DISTRICT_IDS) {
      const d = loadDistrict(id);
      if (!d) continue;
      for (const j of junctionNodes(d)) {
        if (j.degree < 3) continue;
        for (const c of parkedOf(id)) {
          const centre = Math.hypot(c.x - j.x, c.y - j.y);
          if (centre < j.radiusM + PARK_JUNCTION_CLEAR_M - 1e-6) {
            tight.push(
              `${id} ${j.id}: body centre ${centre.toFixed(2)} m < ` +
                `${(j.radiusM + PARK_JUNCTION_CLEAR_M).toFixed(2)} m`,
            );
          }
        }
      }
    }
    expect(tight).toEqual([]);
  });

  it("removed exactly the 45 in-mouth bodies of the seven junction districts", () => {
    // doc 86 T6 reports 58; it applied the arterial mouth (12.125 + 15 =
    // 27.125 m) to all seven. Three of them — tj-rhr-v1, tj-occluded-v1,
    // jx-equal-v1 — are residential-cornered and open at 8.125 + 9 = 17.125 m,
    // so the true census on this tree is 45. See the result note.
    const perDistrict: Record<string, number> = {};
    for (const id of JUNCTION_DISTRICTS) {
      const d = loadDistrict(id);
      expect(d, id).not.toBeNull();
      const inMouth = parkedOf(id).filter((c) =>
        junctionNodes(d!).some(
          (j) => j.degree >= 3 && Math.hypot(c.x - j.x, c.y - j.y) < j.radiusM,
        ),
      );
      perDistrict[id] = inMouth.length;
    }
    expect(perDistrict).toEqual({
      "tj-rhr-v1": 0,
      "tj-stop-v1": 0,
      "sx-v1": 0,
      "jxg-giveway-v1": 0,
      "tj-emerge-v1": 0,
      "tj-occluded-v1": 0,
      "jx-equal-v1": 0,
    });
  });
});

// ---------------------------------------------------------------------------
// L9 — nothing parks on a crossing, and no walker walks through a body
// ---------------------------------------------------------------------------

describe("L9 — the pedestrian's ground is clear", () => {
  it("no body footprint touches a district crossing rect, or чл. 98's 5 m before it", () => {
    const offenders: string[] = [];
    for (const id of DISTRICT_IDS) {
      const d = loadDistrict(id);
      if (!d) continue;
      const edgeById = new Map(d.roads.edges.map((e) => [e.id, e]));
      const cars = parkedOf(id);
      for (const crossing of d.crossings ?? []) {
        const edge = edgeById.get(crossing.edgeId);
        if (!edge) continue;
        const geo = edge.geometry;
        // The crossing's OWN frame — tangent of its edge where it sits. The
        // measure is deliberately NOT the placement's arclength walk: it is a
        // plain 2-D rect test around the zebra, so a body parked on a
        // NEIGHBOURING arm is judged the same as one on the crossing's edge.
        const [tx, ty] = tangentAt(geo, arcOf(geo, crossing.x, crossing.y));
        // Across: carriageway + curbside parking band + pavement, i.e. every
        // surface a body could stand on beside the zebra.
        const halfAcross = edgeTravelHalfWidth(edge) + 8;
        for (const c of cars) {
          const ex = c.x - crossing.x;
          const ey = c.y - crossing.y;
          const along = Math.abs(ex * tx + ey * ty);
          const across = Math.abs(ex * ty - ey * tx);
          if (along >= PARK_CROSSING_CLEAR_M || across >= halfAcross) continue;
          offenders.push(
            `${id} ${crossing.id}: body (${c.x.toFixed(2)}, ${c.y.toFixed(2)}) is ` +
              `${along.toFixed(2)} m along the road from the zebra, ${across.toFixed(2)} m across`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every staged pedestrian's authored walk line clears every parked body", () => {
    // The walk is a 2-point polyline with no obstacle query at all
    // (orchestrator/runners.ts stages `[start, start + dir·travelM]`), so a
    // body on the line IS a walk-through. Before: sc-hz-emergency-stop's
    // child STARTED inside the body at (10.13, 149.60) — 0.00 m.
    const measured: Array<{ id: string; clearance: number }> = [];
    for (const spec of SCENARIO_TEMPLATES) {
      const cars = parkedForTemplate(spec.id, spec.map.districtId);
      if (cars.length === 0) continue;
      for (const event of stagedOf(spec)) {
        if (event.kind !== "pedestrianDartOut") continue;
        const ex = event.start.x + event.dir.x * event.travelM;
        const ey = event.start.y + event.dir.y * event.travelM;
        let worst = Infinity;
        for (const c of cars) {
          const d = segmentToBody(c, event.start.x, event.start.y, ex, ey);
          if (d < worst) worst = d;
        }
        measured.push({ id: `${spec.id}/${event.id}`, clearance: worst });
      }
    }
    expect(measured.length).toBeGreaterThan(20);
    const tight = measured.filter((m) => m.clearance < WALKER_HALF_W);
    expect(tight.map((m) => `${m.id} @ ${m.clearance.toFixed(2)} m`)).toEqual([]);
    // Measured floor on this tree: 1.35 m (sc-driver-distraction).
    expect(Math.min(...measured.map((m) => m.clearance))).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// The carriageway rule — decoration never stands in a driven lane
// ---------------------------------------------------------------------------

describe("no parked body sits on a travel carriageway", () => {
  it("holds for every edge of every district, not just the body's own", () => {
    const offenders: string[] = [];
    for (const id of DISTRICT_IDS) {
      const d = loadDistrict(id);
      if (!d) continue;
      for (const c of parkedOf(id)) {
        for (const edge of d.roads.edges) {
          const limit = edgeTravelHalfWidth(edge) + BODY_HALF_W;
          const miss = missToPolyline(edge.geometry, c.x, c.y);
          if (miss < limit) {
            offenders.push(
              `${id}: body (${c.x.toFixed(2)}, ${c.y.toFixed(2)}) is ${miss.toFixed(2)} m ` +
                `from ${edge.id}'s centreline (carriageway half ${edgeTravelHalfWidth(edge).toFixed(2)})`,
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The sightline — the invariant the lane exists for
// ---------------------------------------------------------------------------

interface Pose {
  id: string;
  x: number;
  y: number;
}

describe("T6 — the graded yield pose can SEE the staged conflict actor", () => {
  it("clears every parked body by at least 2 m, on every junction conflict", () => {
    const rows: Array<{ id: string; clearance: number; detail: string }> = [];
    for (const spec of SCENARIO_TEMPLATES) {
      const conflicts = stagedOf(spec).filter(
        (s) => s.kind === "priorityFromRight" || s.kind === "oncomingLeftTurn",
      );
      if (conflicts.length === 0) continue;
      const district = loadDistrict(spec.map.districtId);
      if (!district) continue;
      const cars = parkedForTemplate(spec.id, spec.map.districtId);
      const lanes = buildLaneGraph(district, {
        laneWidthM: LANE_W,
        excludedRoadClasses: [],
        crossingSignalRadiusM: 40,
      });

      for (const conflict of conflicts) {
        const jx = conflict.junction.x;
        const jy = conflict.junction.y;

        // --- the graded yield poses -------------------------------------
        // (a) the stop line the give-way is adjudicated at: `lineDistM` back
        //     from the node along the player's own approach (an
        //     oncomingLeftTurn has no lineDistM — use the derived world line);
        // (b) any success objective that FORCES a halt (a cap at walking pace)
        //     near the junction — doc 86 B5's "the engine forces the one pose
        //     that cannot see".
        const objectives: Array<Pose & { cap?: number }> = [];
        for (const o of spec.success) {
          const p = o.params as { x?: number; y?: number; maxSpeedKmh?: number };
          if (typeof p.x !== "number" || typeof p.y !== "number") continue;
          objectives.push({ id: o.id, x: p.x, y: p.y, cap: p.maxSpeedKmh });
        }
        const approach = objectives.find((o) => Math.hypot(o.x - jx, o.y - jy) <= 80);
        const poses: Pose[] = [];
        if (approach) {
          const lineDistM =
            "lineDistM" in conflict ? (conflict as { lineDistM: number }).lineDistM : 27.725;
          const dx = approach.x - jx;
          const dy = approach.y - jy;
          const len = Math.hypot(dx, dy) || 1;
          poses.push({
            id: "graded stop line",
            x: jx + (dx / len) * lineDistM,
            y: jy + (dy / len) * lineDistM,
          });
        }
        for (const o of objectives) {
          if (o.cap !== undefined && o.cap <= 8 && Math.hypot(o.x - jx, o.y - jy) <= 45) {
            poses.push({ id: o.id, x: o.x, y: o.y });
          }
        }
        if (poses.length === 0) continue;

        // --- the actor's approach, resolved through the same lane graph --
        const nodes = conflict.actor.pathNodes;
        const jIdx =
          "junctionNodeIndex" in conflict
            ? (conflict as { junctionNodeIndex: number }).junctionNodeIndex
            : 1;
        const windowM = Math.min(
          SIGHT_WINDOW_MAX_M,
          conflict.actor.cruiseSpeedMps * SIGHT_WINDOW_SEC,
        );
        const samples: Array<[number, number]> = [];
        for (let i = 0; i < Math.min(jIdx, nodes.length - 1); i++) {
          const outs = lanes.nodeOut.get(nodes[i]) ?? [];
          const li = outs.find((k) => lanes.lanes[k].toNode === nodes[i + 1]);
          if (li === undefined) continue;
          const lane = lanes.lanes[li];
          for (let k = 0; k < lane.px.length - 1; k++) {
            const segLen = Math.hypot(lane.px[k + 1] - lane.px[k], lane.py[k + 1] - lane.py[k]);
            const steps = Math.max(1, Math.ceil(segLen));
            for (let q = 0; q <= steps; q++) {
              const t = q / steps;
              const sx = lane.px[k] + (lane.px[k + 1] - lane.px[k]) * t;
              const sy = lane.py[k] + (lane.py[k + 1] - lane.py[k]) * t;
              if (Math.hypot(sx - jx, sy - jy) <= windowM) samples.push([sx, sy]);
            }
          }
        }
        if (samples.length === 0) continue;

        // Only bodies that could possibly stand between them.
        const near = cars.filter(
          (c) => Math.hypot(c.x - jx, c.y - jy) <= windowM + 40,
        );
        let worst = Infinity;
        let detail = "";
        for (const pose of poses) {
          for (const [ax, ay] of samples) {
            for (const c of near) {
              const d = segmentToBody(c, pose.x, pose.y, ax, ay);
              if (d < worst) {
                worst = d;
                detail =
                  `${pose.id} (${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}) → ` +
                  `actor (${ax.toFixed(1)}, ${ay.toFixed(1)}) blocked by ` +
                  `(${c.x.toFixed(1)}, ${c.y.toFixed(1)})`;
              }
            }
          }
        }
        rows.push({ id: `${spec.id}/${conflict.id}`, clearance: worst, detail });
      }
    }

    // Every junction conflict in the catalog is covered.
    expect(rows.length).toBeGreaterThanOrEqual(19);
    const blocked = rows.filter((r) => r.clearance < SIGHT_CLEARANCE_M);
    expect(
      blocked.map((r) => `${r.id}: ${r.clearance.toFixed(2)} m — ${r.detail}`),
    ).toEqual([]);
    // Measured floor on this tree: 2.25 m (sc-junction-gap). Was 0.00.
    expect(Math.min(...rows.map((r) => r.clearance))).toBeGreaterThan(SIGHT_CLEARANCE_M);
  });
});

// ---------------------------------------------------------------------------
// D10 — no committed ghost line drives through a decoration body
// ---------------------------------------------------------------------------

/**
 * The residual, named with its measurement so it can only shrink (doc 86 §10's
 * escape-hatch discipline — an entry that starts passing FAILS the gate).
 *
 * Both are loss-of-control MISTAKE demos whose whole subject is leaving the
 * carriageway: they slide onto the verge, where the curb pass legitimately
 * seats bodies. Removing the scenery would delete the street; the real fix is
 * the consequence (a collider on the body, or a re-record that stops on the
 * asphalt), and that is a trace re-record — Lane 9/11's file ownership, not
 * Lane 4's. Recorded here so it is a reviewed decision, not an oversight.
 */
const TRACE_EXEMPT: Record<string, { worstM: number; why: string }> = {
  "sc-ac-bridge-ice/mistake-brake-on-deck.trace.json": {
    worstM: 0.0,
    why: "the demo brakes on an icy deck and slides to x=9.21, 0.04 m past the flank of the verge body at (10.13, 294.80)",
  },
  "sc-sign-warning/mistake-hold-speed.trace.json": {
    worstM: 0.44,
    why: "the demo holds speed into the ice and runs wide to x=8.73, grazing the verge body at (10.13, 235.40)",
  },
};

describe("D10 — committed ghost lines do not drive through parked decoration", () => {
  it("holds for every trace of every template, save the two named residuals", () => {
    const districtByTemplate = new Map(
      SCENARIO_TEMPLATES.map((s) => [s.id, s.map.districtId] as const),
    );
    const offenders: string[] = [];
    const seenExempt = new Set<string>();
    let checked = 0;

    for (const dir of readdirSync(TRACE_DIR)) {
      const dirPath = path.join(TRACE_DIR, dir);
      if (!statSync(dirPath).isDirectory()) continue;
      const districtId = districtByTemplate.get(dir);
      if (!districtId) continue;
      const cars = parkedForTemplate(dir, districtId);
      if (cars.length === 0) continue;
      for (const file of readdirSync(dirPath)) {
        if (!file.endsWith(".trace.json")) continue;
        const key = `${dir}/${file}`;
        const trace = JSON.parse(readFileSync(path.join(dirPath, file), "utf-8")) as {
          samples: Array<{ x: number; y: number }>;
        };
        checked++;
        let worst = Infinity;
        let where = "";
        for (const s of trace.samples) {
          for (const c of cars) {
            if (Math.abs(s.x - c.x) > 8 || Math.abs(s.y - c.y) > 8) continue;
            const d = pointToBody(c, s.x, s.y);
            if (d < worst) {
              worst = d;
              where = `@(${s.x.toFixed(2)}, ${s.y.toFixed(2)}) vs (${c.x.toFixed(2)}, ${c.y.toFixed(2)})`;
            }
          }
        }
        if (worst >= HERO_HALF_W) {
          // An allowlisted entry that has started passing must be deleted.
          expect(
            TRACE_EXEMPT[key],
            `${key} now clears by ${worst.toFixed(2)} m — delete its TRACE_EXEMPT entry`,
          ).toBeUndefined();
          continue;
        }
        const exempt = TRACE_EXEMPT[key];
        if (exempt) {
          seenExempt.add(key);
          // It may not get WORSE than the number it was admitted with.
          expect(worst, `${key} regressed: ${where}`).toBeGreaterThanOrEqual(
            exempt.worstM - 1e-6,
          );
          continue;
        }
        offenders.push(`${key}: ${worst.toFixed(2)} m ${where}`);
      }
    }

    expect(checked).toBeGreaterThan(400);
    expect(offenders).toEqual([]);
    // Every exemption is real — a stale entry is itself a failure.
    expect([...seenExempt].sort()).toEqual(Object.keys(TRACE_EXEMPT).sort());
  }, 180_000);
});
