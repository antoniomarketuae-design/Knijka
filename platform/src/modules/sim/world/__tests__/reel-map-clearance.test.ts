/**
 * REEL-MAP CLEARANCE battery — the founder's 2026-07-27 verdict-board review of
 * the two broken reels, turned into geometry the build can never regress past.
 *
 * Verbatim, sc-lane-control-signal (lc-gantry-v1): „the car is moving on top of
 * the street lights and also the traffic cars are moving on top of the side bars
 * where the people walk on the road — complete re design".
 * Verbatim, sc-merge-accel-lane (mw-entry-v1): „the shadow car is moving on top
 * of other cars — the road is going on top of some other road … complete
 * redesign of the map is needed".
 *
 * Both were the SAME class of defect: the district JSON authored lane centres,
 * but the world builder dresses a cross-section off the ROAD CLASS, and the two
 * disagreed. lc-gantry-v1's `secondary` carriageways drew 16.1 m ribbons at a
 * 12 m pitch (parking band included), so their pavements landed on each other's
 * travel lane and their lamp columns landed 4 cm off the far lane centre;
 * mw-entry-v1's `primary` carriageways drew a city motorway with a parking band,
 * a parked-car row, pavements, trees, billboards and lamp columns standing in
 * the overtaking and acceleration lanes.
 *
 * So the assertions here are deliberately GEOMETRIC and builder-driven, not
 * value-pinning: run the REAL `buildWorldGeometry` and prove that
 *   1. no two edges' drivable ribbons overlap;
 *   2. no placed prop (lamp column, sign, tree, billboard, bus shelter) stands
 *      on a drivable ribbon;
 *   3. no PAVEMENT vertex lies on a drivable ribbon (that is the „traffic cars
 *      driving on the side bars" defect, measured on the actual mesh);
 *   4. no carriageway carries a class that TrafficLayer parks cars along, so no
 *      parked row can ever be laid across the ramp the ego drives up;
 *   5. lc-gantry-v1's gantry POSTS stand clear of both signalled lanes.
 *
 * GRADING: nothing here touches it, and a companion block pins the numbers the
 * rule engine and the recorded traces read (lane centres, `lanes`, one-way
 * directions, limits, zone spans) so a future "redesign" cannot move a verdict
 * while satisfying the clearance laws above.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { edgeHalfWidth } from "../builders/network";
import { assertDistrict, type District, type DistrictEdge } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

function loadDistrict(id: string): District {
  return assertDistrict(
    JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")),
  );
}

/**
 * Classes TrafficLayer lays a curbside parked-car row along (its PARK_CLASSES —
 * mirrored here because the component is a client module the pure builders
 * cannot import). A carriageway in this set gets a row of static cars at
 * travelHalf + 2.0 m; on mw-entry-v1 that row crossed the on-ramp at y ≈ 233,
 * which is the „shadow car moving on top of other cars" the founder saw.
 */
const PARKED_ROW_CLASSES = new Set([
  "residential",
  "living_street",
  "unclassified",
  "tertiary",
  "secondary",
  "primary",
]);

type Vec2 = [number, number];

/** Perpendicular distance from `p` to segment `a`→`b`, district metres. */
function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

interface Ribbon {
  edge: DistrictEdge;
  halfWidth: number;
}

const ribbonsOf = (d: District): Ribbon[] =>
  d.roads.edges.map((edge) => ({ edge, halfWidth: edgeHalfWidth(edge) }));

/** The ribbon a point sits on (with `pad` metres of clearance), or null. */
function ribbonAt(ribbons: Ribbon[], p: Vec2, pad: number): Ribbon | null {
  for (const rb of ribbons) {
    const g = rb.edge.geometry;
    for (let i = 1; i < g.length; i++) {
      if (distToSegment(p, g[i - 1] as Vec2, g[i] as Vec2) < rb.halfWidth + pad) return rb;
    }
  }
  return null;
}

/** World placement (x, h, −y) back to district (x, y). */
const toDistrict = (pos: readonly number[]): Vec2 => [pos[0]!, -pos[2]!];

/** Every prop the props pass places, as labelled district points. */
function propPoints(world: ReturnType<typeof buildWorldGeometry>): { label: string; p: Vec2 }[] {
  const out: { label: string; p: Vec2 }[] = [];
  for (const s of world.streetlights) out.push({ label: "streetlight", p: toDistrict(s.position) });
  for (const s of world.signs) out.push({ label: `sign:${s.kind}`, p: toDistrict(s.position) });
  for (const t of world.trees) out.push({ label: "tree", p: toDistrict(t.position) });
  for (const b of world.billboards) out.push({ label: "billboard", p: toDistrict(b.position) });
  for (const b of world.busStops) out.push({ label: "busStop", p: toDistrict(b.position) });
  for (const k of world.parkingKits) out.push({ label: "parkingKit", p: toDistrict(k.position) });
  return out;
}

/**
 * REEL MAPS under review. `propPad` is the clearance a prop's own footprint
 * needs past the kerb: a lamp column / sign post is ~0.3 m wide and must not
 * merely miss the asphalt but stand back from it.
 */
const REEL_MAPS = [
  { id: "lc-gantry-v1", reel: "sc-lane-control-signal", propPad: 0.4 },
  { id: "mw-entry-v1", reel: "sc-merge-accel-lane", propPad: 0.4 },
] as const;

describe.each(REEL_MAPS)("$id — drivable-surface clearance ($reel)", ({ id, propPad }) => {
  const district = loadDistrict(id);
  const ribbons = ribbonsOf(district);
  const world = buildWorldGeometry(district);

  it("no two edges' drivable ribbons overlap", () => {
    // Sample each centreline densely and measure it against every OTHER edge's
    // ribbon. Two carriageways whose asphalt sheets intersect is „the road is
    // going on top of some other road"; the ONLY tolerated exception is a merge
    // nose, where the ramp is SUPPOSED to run into the carriageway it joins.
    const NOSE_PAIRS = new Set(["mwe-e-ramp"]);
    const offenders: string[] = [];
    for (const rb of ribbons) {
      if (NOSE_PAIRS.has(rb.edge.id)) continue;
      const g = rb.edge.geometry;
      for (let i = 1; i < g.length; i++) {
        const a = g[i - 1] as Vec2;
        const b = g[i] as Vec2;
        const steps = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
        for (let k = 0; k <= steps; k++) {
          const p: Vec2 = [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps];
          for (const other of ribbons) {
            if (other.edge.id === rb.edge.id || NOSE_PAIRS.has(other.edge.id)) continue;
            const og = other.edge.geometry;
            for (let j = 1; j < og.length; j++) {
              const d = distToSegment(p, og[j - 1] as Vec2, og[j] as Vec2);
              // Centreline of one bank inside the other bank's asphalt, minus
              // its own half-width: the two ribbons genuinely share surface.
              if (d < other.halfWidth - rb.halfWidth) {
                offenders.push(`${rb.edge.id} @ (${p[0].toFixed(1)}, ${p[1].toFixed(1)}) inside ${other.edge.id}`);
              }
            }
          }
        }
      }
    }
    expect(offenders.slice(0, 5)).toEqual([]);
  });

  it("no street furniture stands on a drivable ribbon", () => {
    const offenders = propPoints(world)
      .map(({ label, p }) => ({ label, p, rb: ribbonAt(ribbons, p, propPad) }))
      .filter((o) => o.rb !== null)
      .map((o) => `${o.label} @ (${o.p[0].toFixed(2)}, ${o.p[1].toFixed(2)}) on ${o.rb!.edge.id}`);
    expect(offenders.slice(0, 8)).toEqual([]);
  });

  it("no pavement vertex lies on a drivable ribbon", () => {
    // Measured on the REAL sidewalk mesh: a kerb strip drawn over another
    // carriageway's asphalt is what put the ambient stream „on the side bars
    // where the people walk". Zero pad — a kerb may touch its own edge line.
    const pos = world.sidewalks.positions;
    const offenders: string[] = [];
    for (let i = 0; i < pos.length && offenders.length < 8; i += 3) {
      const p: Vec2 = [pos[i]!, -pos[i + 2]!];
      const rb = ribbonAt(ribbons, p, 0);
      if (rb) offenders.push(`pavement vertex (${p[0].toFixed(2)}, ${p[1].toFixed(2)}) on ${rb.edge.id}`);
    }
    expect(offenders).toEqual([]);
  });

  it("no edge carries a class TrafficLayer parks a car row along", () => {
    const parked = district.roads.edges
      .filter((e) => PARKED_ROW_CLASSES.has(e.class))
      .map((e) => `${e.id} (${e.class})`);
    expect(parked).toEqual([]);
  });
});

describe("lc-gantry-v1 — the gantry structure itself", () => {
  const district = loadDistrict("lc-gantry-v1");
  const ribbons = ribbonsOf(district);
  const gantry = (
    district.meta as unknown as { scenario: { laneGantry: { halfSpanM: number; y: number } } }
  ).scenario.laneGantry;

  it("plants its posts on the pavement, not in a signalled lane", () => {
    // LaneSignalGantry builds BoxGeometry(0.32, …) uprights at x = ±halfSpanM.
    const POST_HALF_M = 0.16;
    for (const x of [gantry.halfSpanM, -gantry.halfSpanM]) {
      const rb = ribbonAt(ribbons, [x, gantry.y], POST_HALF_M);
      expect(rb?.edge.id ?? null, `gantry post at x=${x}`).toBeNull();
    }
  });

  it("spans both signalled lanes", () => {
    const g = district.meta as unknown as {
      scenario: { laneGantry: { openLaneX: number; closedLaneX: number } };
    };
    expect(gantry.halfSpanM).toBeGreaterThan(Math.abs(g.scenario.laneGantry.openLaneX));
    expect(gantry.halfSpanM).toBeGreaterThan(Math.abs(g.scenario.laneGantry.closedLaneX));
  });
});

describe("the redesign moved DRESSING only — the graded numbers are frozen", () => {
  it("lc-gantry-v1 keeps the WRONG_WAY carriageway pair the traces drive", () => {
    const d = loadDistrict("lc-gantry-v1");
    const open = d.roads.edges.find((e) => e.id === "lcg-e-open")!;
    const closed = d.roads.edges.find((e) => e.id === "lcg-e-closed")!;
    // Lane centres: the recorded traces and the success zone (x = 6, y = 345)
    // pin these; moving them would silently invalidate every graded frame.
    expect(open.geometry).toEqual([
      [6, 0],
      [6, 360],
    ]);
    expect(closed.geometry).toEqual([
      [-6, 360],
      [-6, 0],
    ]);
    for (const e of [open, closed]) {
      expect(e.oneway).toBe(true); // the WRONG_WAY conviction
      expect(e.lanes).toBe(1);
      expect(e.maxspeed).toBe(50);
      expect(e.length).toBe(360);
    }
    expect(d.spawnPoints.map((s) => [s.id, s.x, s.y])).toEqual([
      ["lcg-spawn-start", 6, 15],
      ["lcg-spawn-finish", 6, 345],
    ]);
  });

  it("mw-entry-v1 keeps the lane centres, the motorway tag and the emergency spans", () => {
    const d = loadDistrict("mw-entry-v1");
    const sc = (d.meta as unknown as { scenario: Record<string, number> }).scenario;
    expect([sc.laneCurbX, sc.laneCruiseX, sc.laneLeftX]).toEqual([8.13, 0, -8.12]);
    expect([sc.noseY, sc.taperY, sc.endY]).toEqual([260, 460, 960]);
    for (const e of d.roads.edges) {
      if (e.id === "mwe-e-ramp") {
        // NOT motorway-tagged: building speed from rest on a връзка must never
        // grade DRIVING_TOO_SLOW_FOR_MOTORWAY.
        expect(e.motorway).toBeUndefined();
        expect(e.lanes).toBe(1);
      } else {
        expect(e.motorway, e.id).toBe(true); // arms the SP-10 detectors
        expect(e.lanes, e.id).toBe(3); // curb + 2 travel — the Locator's lane ids
        expect(e.maxspeed, e.id).toBe(140);
      }
    }
    // The archetype's whole point: exactly the acceleration segment lacks the
    // аварийна-лента span, so its curb lane is a LEGAL travel lane.
    const spanEdges = (d.zones ?? []).map((z) => z.edgeId).sort();
    expect(spanEdges).toEqual(["mwe-e-nb-approach", "mwe-e-nb-main", "mwe-e-sb"]);
  });
});
