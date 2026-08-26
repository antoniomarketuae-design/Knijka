/**
 * =============================================================================
 * THE EMPTY PAVEMENT — four w11 rows, one cause, and a cause that is NOT the
 * constant everybody reaches for first.
 *
 * WHAT WAS FILED, four times, in four different families:
 *   · sc-sp-limit-end „a city street lined with parked cars on the right kerb
 *     and railings on the left, and not one pedestrian on either pavement in
 *     207 s of frames on either platform";
 *   · sc-vu-emergency „a four-lane city boulevard with tower blocks both sides,
 *     two rows of parked cars and street trees — and not a single pedestrian on
 *     either pavement in any frame of either drive on either platform";
 *   · sc-sp-eco-coast the same sentence about a signalled boulevard;
 *   · sc-vu-cyclist-hook the same about a junction in a lesson built ENTIRELY
 *     around vulnerable road users — „the only human the world contains is the
 *     single scripted cyclist".
 *
 * THE TRAP THIS FILE EXISTS TO PIN. The obvious repair is to raise
 * `SCENARIO_DEFAULT_TRAFFIC.pedestrianCount` off 0, and it would have changed
 * NOTHING: every pedestrian this project has ever built is anchored on a
 * `DistrictCrossing` (`buildPedRoute` takes one and returns null without one),
 * and `NO_CROSSING_MAPS` below are the four maps those four rows were
 * photographed on — zero crossings between them. Block 1 asserts that
 * emptiness directly, so the next reader cannot re-derive the wrong fix from a
 * constant without meeting the data first.
 *
 * WHAT THE FIX MAY NOT DO IS THE OTHER HALF, and it is why block 3 is longer
 * than block 2. `compile.ts` keeps ambient pedestrians at zero for a stated
 * reason — „ambient pedestrians on a junction drill would arm crossing duties
 * the copy never mentions" — and that reason is correct. A pavement walker
 * therefore has NO `cross` segment at all, which is a structural guarantee
 * rather than a tuning one: `crossingCounts` is written only by `setOnRoad`,
 * `setOnRoad` is called only for a segment of kind "cross", and
 * `pedestrianOnCrossing` — the one channel `runtime.setPedestrianQuery` hands
 * the rule engine — reads only `crossingCounts`. Block 3 drives a minute of
 * world on a map that HAS crossings and asserts the query never once goes true.
 * =============================================================================
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ambientSidewalkBudget,
  buildPedSidewalkRoute,
  pedCarriagewayHalfM,
  SIDEWALK_BUDGET_MAX,
} from "../pedestrians";
import { mulberry32 } from "../rng";
import { createTrafficSystem } from "../system";
import { DEFAULT_TRAFFIC_CONFIG, type DistrictEdge, type TrafficDistrict } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const LANE_W = DEFAULT_TRAFFIC_CONFIG.laneWidthM;
const FOOTWAYLESS = DEFAULT_TRAFFIC_CONFIG.footwaylessRoadClasses;

const cache = new Map<string, TrafficDistrict>();
function district(id: string): TrafficDistrict {
  const hit = cache.get(id);
  if (hit) return hit;
  const raw = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as TrafficDistrict;
  cache.set(id, raw);
  return raw;
}

/** The four maps the four rows were photographed on. */
const NO_CROSSING_MAPS = ["sp-signs-v1", "sx-v1", "ln-v1", "vu-cyclist-v1"] as const;

/** No player, no signals — this file is about people on a footway. */
const CTX = { signalPhase: () => "green" as const, playerPos: null };

describe("the empty pavement — why raising pedestrianCount could not have worked", () => {
  it("all four filed maps declare ZERO crossings, so no crossing walker can spawn", () => {
    for (const id of NO_CROSSING_MAPS) {
      expect(district(id).crossings.length, id).toBe(0);
    }
  });

  it("…and they are not exotic: the large majority of committed maps have none", () => {
    // COUNTED, not claimed. `pedestrians.ts` says „84 of the 105 committed
    // districts declare zero crossings", and a number typed into a comment is
    // exactly how the wrong fix gets re-derived two waves later. The floor is
    // set well under the measurement so this reports a real change of shape
    // (someone authoring crossings across the bank) rather than one new map.
    const dir = path.join(REPO_ROOT, "content", "world");
    const ids = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));
    expect(ids.length).toBeGreaterThan(90);
    const withNone = ids.filter((id) => district(id).crossings.length === 0);
    expect(withNone.length / ids.length).toBeGreaterThan(0.7);
  });
});

describe("ambientSidewalkBudget", () => {
  it("gives every one of the four filed maps somebody to put on the pavement", () => {
    for (const id of NO_CROSSING_MAPS) {
      const n = ambientSidewalkBudget(district(id), FOOTWAYLESS);
      expect(n, id).toBeGreaterThan(0);
      expect(n, id).toBeLessThanOrEqual(SIDEWALK_BUDGET_MAX);
    }
  });

  it("puts NOBODY on a motorway — mw-v1 is `motorway` end to end", () => {
    const mw = district("mw-v1");
    expect(mw.roads.edges.every((e) => e.class === "motorway")).toBe(true);
    expect(ambientSidewalkBudget(mw, FOOTWAYLESS)).toBe(0);
  });
});

describe("the walker itself", () => {
  /** Perpendicular distance from a point to a polyline, m. */
  function distToPolyline(px: number, py: number, geom: number[][]): number {
    let best = Infinity;
    for (let i = 0; i < geom.length - 1; i++) {
      const [ax, ay] = geom[i];
      const [bx, by] = geom[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
      if (d < best) best = d;
    }
    return best;
  }

  function longestWalkableEdge(id: string): DistrictEdge {
    const d = district(id);
    const walkable = d.roads.edges.filter((e) => !FOOTWAYLESS.includes(e.class));
    walkable.sort((a, b) => b.length - a.length);
    return walkable[0];
  }

  it("never puts a foot on the carriageway, on either side, on any of the four maps", () => {
    for (const id of NO_CROSSING_MAPS) {
      const edge = longestWalkableEdge(id);
      const kerbM = pedCarriagewayHalfM(edge, LANE_W);
      for (const side of [1, -1] as const) {
        const route = buildPedSidewalkRoute(edge, LANE_W, side, edge.length / 2, mulberry32(11));
        expect(route, `${id} side ${side}`).not.toBeNull();
        for (const seg of route!.segments) {
          // Every sample of every segment, not just the endpoints: an offset
          // polyline can pinch on a bend and that is where it would happen.
          for (let i = 0; i < seg.px.length; i++) {
            const d = distToPolyline(seg.px[i], seg.py[i], edge.geometry);
            expect(d, `${id} side ${side} sample ${i}`).toBeGreaterThanOrEqual(kerbM);
          }
        }
      }
    }
  });

  it("carries no `cross` segment — the structural reason it arms no duty", () => {
    const edge = longestWalkableEdge("ln-v1");
    const route = buildPedSidewalkRoute(edge, LANE_W, 1, edge.length / 2, mulberry32(3));
    expect(route).not.toBeNull();
    expect(route!.segments.every((s) => s.kind === "walk")).toBe(true);
    expect(route!.segments.every((s) => s.crossingId === null)).toBe(true);
  });
});

describe("the system, driven", () => {
  const opts = (d: TrafficDistrict) => ({
    seed: 7,
    vehicleCount: 0,
    pedestrianCount: 0,
    sidewalkPedestrianCount: ambientSidewalkBudget(d, FOOTWAYLESS),
  });

  it("populates the four filed maps that were empty in every frame", () => {
    for (const id of NO_CROSSING_MAPS) {
      const d = district(id);
      const before = createTrafficSystem(d, {
        seed: 7,
        vehicleCount: 0,
        pedestrianCount: 0,
      });
      // The world as the audit photographed it: nobody, whatever the count.
      expect(before.pedestrians.length, `${id} before`).toBe(0);
      const after = createTrafficSystem(d, opts(d));
      expect(after.pedestrians.length, `${id} after`).toBe(opts(d).sidewalkPedestrianCount);
    }
  });

  it("and they WALK — a stationary crowd is scenery, not a street", () => {
    const d = district("ln-v1");
    const tr = createTrafficSystem(d, opts(d));
    const start = tr.pedestrians.map((p) => ({ x: p.x, y: p.y }));
    for (let i = 0; i < 300; i++) tr.update(1 / 30, CTX);
    let moved = 0;
    tr.pedestrians.forEach((p, i) => {
      if (Math.hypot(p.x - start[i].x, p.y - start[i].y) > 1) moved += 1;
    });
    expect(moved).toBe(tr.pedestrians.length);
  });

  it("NEVER arms a crossing duty, on a map that has 52 of them", () => {
    // d2-v1 is the exam-drill city map — `pedestrianOnCrossing` is the ONE
    // channel the rule engine sees pedestrians through, and a pavement walker
    // must be invisible to it for the whole minute.
    const d = district("d2-v1");
    expect(d.crossings.length).toBeGreaterThan(10);
    const tr = createTrafficSystem(d, opts(d));
    expect(tr.pedestrians.length).toBeGreaterThan(0);
    for (let i = 0; i < 1800; i++) {
      tr.update(1 / 30, CTX);
      for (const c of d.crossings) {
        if (tr.pedestrianOnCrossing(c.id)) {
          throw new Error(`pavement walker armed crossing ${c.id} at step ${i}`);
        }
      }
    }
  });

  it("stays OFF for every caller that does not ask — the trace byte-identity guard", () => {
    // Recorded traces, clip feeds and ~50 unit fixtures all build their traffic
    // system through this config. A non-zero default would rewrite all of them.
    expect(DEFAULT_TRAFFIC_CONFIG.sidewalkPedestrianCount).toBe(0);
    const d = district("vu-cyclist-v1");
    const tr = createTrafficSystem(d, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(tr.pedestrians.length).toBe(0);
  });
});
