/**
 * THE WORLD HAS AN EDGE — measured the way the void frames were shot: by
 * standing where the lesson puts the car and asking what is in front of it.
 *
 * THE DEFECT, in the words of the w11 frames these were written against:
 *
 *   sc-vu-emergency-junction:b80598f7 (critical) — „the asphalt, kerbs,
 *     markings, buildings, trees and parked cars all stop at a hard edge and the
 *     car spends the remaining ~160 s crossing a bare green/grey plane under an
 *     empty horizon … THE REAR-VIEW MIRROR INSET SIMULTANEOUSLY STILL RENDERS
 *     THE CITY, proving the ego has simply left the built tile."
 *   sc-junction-blind:70b1f234 (critical) — „the entire windscreen is a flat
 *     green plane meeting a hazy grey band at the horizon — no road, no kerb,
 *     no lane marking, no building, no street furniture of any kind".
 *   sc-junction-gap:75918e40 (critical) — „the district still has no edge …
 *     the world simply runs out and the car keeps going".
 *   sc-junction-rhr:9f65bf49 (critical) — „the void begins at t070s".
 *   sc-junction-left:52a5b98c (major) — „beyond the priority road the world
 *     stops: flat green field and a mountain haze band, no far-side street, no
 *     buildings, no pavement".
 *
 * HOW IT IS MEASURED HERE. Not by counting masses — a counter can be
 * incremented by scenery nobody can see, and this programme has paid for that
 * mistake often enough that the lot-enclosure battery beside this one opens with
 * the same sentence. Every claim in §2 fires a RAY from a pose the district
 * itself authors, against the BUILT WALL TRIANGLES, and asks how many metres of
 * nothing are in front of the windscreen. On the pre-fix builder those rays
 * return Infinity in most of the 72 directions on every scenario map; that is
 * the red these were written against.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED, so nobody reads this as more than it is:
 *   · Nothing here says the world beyond the last road is now DRESSED. It is
 *     still bare ground with a frontage at the end of it — no kerb, no marking,
 *     no pavement, no parked cars. Those are `roads.ts`' and `props.ts`' passes
 *     and they are gated on the road network, which has nothing out there.
 *   · Nothing here says a briefing now matches its world. „There is no petrol
 *     station" (sc-merge-from-property) is a template/map question and no belt
 *     of blocks answers it.
 *   · Nothing here grades. The belt contributes the same wall collider every
 *     блок on the map already contributes, and no rule in the product knows it
 *     exists.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { districtWorldEdge, parseDistrict, type DistrictBounds } from "../../runtime/district";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import {
  TERMINUS_CLOSE_MAX_HEIGHT_M,
  TERMINUS_CLOSE_MIN_HEIGHT_M,
  TERMINUS_CLOSE_ROAD_CLEAR_M,
  TERRAIN_MARGIN_M,
  TERRAIN_PAVE_NEAR_BUILDING_M,
} from "../builders/constants";
import { analyzeNetwork } from "../builders/network";
import { buildWorldRim, WORLD_RIM_INNER_M, WORLD_RIM_OUTER_M } from "../builders/worldRim";
import { assertDistrict, type District, type MeshData } from "../types";

const WORLD_DIR = (() => {
  const local = path.join(process.cwd(), "content", "world");
  return fs.existsSync(local) ? local : path.resolve(process.cwd(), "..", "content", "world");
})();

const allIds = (): string[] =>
  fs
    .readdirSync(WORLD_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort();

const loadRaw = (id: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf8")) as unknown;

function loadDistrict(id: string): District {
  return assertDistrict(loadRaw(id));
}

/**
 * The rectangle past which nothing is drawn, read from the PRODUCT's own
 * function rather than re-derived here — `runtime/district.ts` is the one place
 * that answers "how much authored world is left", and a test that padded the
 * bounds itself would keep passing the day that answer changed.
 *
 * Two parsers on one document because the world layer and the runtime layer
 * each validate their own view of it (world's `class` is a string, the
 * runtime's is a RoadClass); neither is the other's.
 */
const edgeOf = (id: string): DistrictBounds => districtWorldEdge(parseDistrict(loadRaw(id)));

type P2 = [number, number];

/** The rim as this build would produce it, without building the whole world. */
function rimOf(d: District) {
  return buildWorldRim(d, analyzeNetwork(d), d.buildings);
}

/** Point-to-polyline-segment distance, district metres. */
function segDist(p: P2, a: P2, b: P2): number {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const l2 = ex * ex + ey * ey;
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2));
  return Math.hypot(p[0] - (a[0] + t * ex), p[1] - (a[1] + t * ey));
}

/**
 * Every built facade as a 2D wall line, district space (world z = -districtY) —
 * the helper `lot-enclosure.test.ts` uses, for its reason: a building is a
 * vertical prism, so each wall triangle collapses to a SEGMENT on the ground,
 * and reading the DRAWN mesh rather than a placement list is what makes this a
 * measurement of what the student is given.
 */
function wallSegments(meshes: readonly MeshData[]): Array<[P2, P2]> {
  const out: Array<[P2, P2]> = [];
  for (const m of meshes) {
    const p = m.positions;
    const idx = m.indices;
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const pts: P2[] = [0, 1, 2].map((k) => {
        const v = idx[t + k]! * 3;
        return [p[v]!, -p[v + 2]!] as P2;
      });
      let best: [P2, P2] = [pts[0]!, pts[1]!];
      let bestD = -1;
      for (const [a, b] of [
        [pts[0]!, pts[1]!],
        [pts[1]!, pts[2]!],
        [pts[0]!, pts[2]!],
      ] as Array<[P2, P2]>) {
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d > bestD) {
          bestD = d;
          best = [a, b];
        }
      }
      if (bestD > 1e-6) out.push(best);
    }
  }
  return out;
}

/** Metres of clear air from `from` along `dir`, or Infinity when the world has
 *  nothing in that direction at all. */
function clearAlongM(segs: Array<[P2, P2]>, from: P2, dir: P2): number {
  let best = Infinity;
  for (const [a, b] of segs) {
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const den = dir[0] * ey - dir[1] * ex;
    if (Math.abs(den) < 1e-9) continue;
    const qx = a[0] - from[0];
    const qy = a[1] - from[1];
    const t = (qx * ey - qy * ex) / den;
    const s = (qx * dir[1] - qy * dir[0]) / den;
    if (t >= 0 && s >= 0 && s <= 1) best = Math.min(best, t);
  }
  return best;
}

/** Distance from `from` along `dir` to the rectangle past which nothing is
 *  drawn — the far side of the void the student is currently able to reach. */
function edgeAlongM(e: DistrictBounds, from: P2, dir: P2): number {
  let best = Infinity;
  const hit = (num: number, den: number, axis: 0 | 1) => {
    if (Math.abs(den) < 1e-9) return;
    const t = num / den;
    if (t < 0) return;
    const other = axis === 0 ? from[1] + t * dir[1] : from[0] + t * dir[0];
    const lo = axis === 0 ? e.minY : e.minX;
    const hi = axis === 0 ? e.maxY : e.maxX;
    if (other >= lo - 1e-6 && other <= hi + 1e-6) best = Math.min(best, t);
  };
  hit(e.minX - from[0], dir[0], 0);
  hit(e.maxX - from[0], dir[0], 0);
  hit(e.minY - from[1], dir[1], 1);
  hit(e.maxY - from[1], dir[1], 1);
  return best;
}

/**
 * The districts the void rows in this lane were shot on, plus one of each
 * remaining map kind so a kind cannot regress unwatched.
 *
 * `tj-rhr-v1` carries TWO of them: sc-junction-rhr runs on it, and so does
 * sc-vu-emergency-junction („Линейка на кръстовището", VU-10 — templates-vru.ts
 * line 45), whose own routing note already reads „tj-rhr-v1 has no north arm,
 * so a student who does not turn left drives off the built tile … A
 * world-boundary question."
 */
const RAY_IDS = [
  "tj-rhr-v1", // sc-junction-rhr AND sc-vu-emergency-junction
  "tj-emerge-v1", // sc-junction-left
  "tj-occluded-v1", // sc-junction-blind
  "jx-equal-v1", // sc-jx-equal-left
  "lot-perp-v1", // scenario-lot
  "rb-single-v1", // scenario-roundabout
  "vu-pass-v1", // scenario-vru
  "poligon-v1", // training-ground
  "ac-aqua-v1", // scenario-street
];

/**
 * Per-test budget, ms. Vitest's default is 5 000 and the heaviest block here —
 * ten full `buildWorldGeometry` runs on real maps — measured 5.2 s on an idle
 * box, i.e. it would go red on the default the first time the suite ran under
 * load. A false red teaches the next reader to ignore a true one, so the budget
 * is set with room for a loaded two-worker run rather than to the measurement.
 */
const BUDGET_MS = 60_000;

describe("§1 the rim's guards hold on every committed district", () => {
  const ids = allIds();

  it("every rim mass stands on drawn ground, inside districtWorldEdge", () => {
    const offenders: string[] = [];
    for (const id of ids) {
      const d = loadDistrict(id);
      const e = edgeOf(id);
      for (const m of rimOf(d)) {
        for (const [x, y] of m.footprint) {
          if (x < e.minX - 1e-6 || x > e.maxX + 1e-6 || y < e.minY - 1e-6 || y > e.maxY + 1e-6) {
            offenders.push(`${id}/${m.id} (${x}, ${y})`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  }, BUDGET_MS);

  it("no rim mass comes within TERMINUS_CLOSE_ROAD_CLEAR_M of a centreline", () => {
    // The census that sized this: no road polyline leaves its own declared
    // bounds on any of the 105 committed documents, so the nearest centreline
    // to the belt is 42 m — TERMINUS_CLOSE_ROAD_CLEAR_M is 12. The guard is
    // here for the map that has not been written yet.
    let worst = Infinity;
    let worstAt = "";
    for (const id of ids) {
      const d = loadDistrict(id);
      for (const m of rimOf(d)) {
        for (const p of m.footprint) {
          for (const e of d.roads.edges) {
            const g = e.geometry as P2[];
            for (let i = 0; i + 1 < g.length; i++) {
              const dist = segDist(p as P2, g[i]!, g[i + 1]!);
              if (dist < worst) {
                worst = dist;
                worstAt = `${id}/${m.id}`;
              }
            }
          }
        }
      }
    }
    expect(worst, worstAt).toBeGreaterThan(TERMINUS_CLOSE_ROAD_CLEAR_M);
  }, BUDGET_MS);

  it("no rim mass stands where the map already authored frontage", () => {
    const offenders: string[] = [];
    for (const id of ids) {
      const d = loadDistrict(id);
      const rim = rimOf(d);
      for (const m of rim) {
        const xs = m.footprint.map((p) => p[0]);
        const ys = m.footprint.map((p) => p[1]);
        const a = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        for (const b of d.buildings) {
          if (!Array.isArray(b.footprint) || b.footprint.length < 3) continue;
          const bx = b.footprint.map((p) => p[0]);
          const by = b.footprint.map((p) => p[1]);
          const t = [Math.min(...bx), Math.min(...by), Math.max(...bx), Math.max(...by)];
          if (a[0]! < t[2]! && a[2]! > t[0]! && a[1]! < t[3]! && a[3]! > t[1]!) {
            offenders.push(`${id}: ${m.id} ∩ ${b.id}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  }, BUDGET_MS);

  it("every rim mass takes a height inside the closing band, and none is a tower", () => {
    for (const id of ids) {
      for (const m of rimOf(loadDistrict(id))) {
        expect(m.heightSource, `${id}/${m.id}`).toBe("height");
        expect(m.height, `${id}/${m.id}`).toBeGreaterThanOrEqual(TERMINUS_CLOSE_MIN_HEIGHT_M);
        expect(m.height, `${id}/${m.id}`).toBeLessThanOrEqual(TERMINUS_CLOSE_MAX_HEIGHT_M);
      }
    }
  });

  // A FULL build of all 105 documents is ~10 s of CPU on its own; on a loaded
  // two-worker run that is a false red waiting to happen, and a false red is
  // how the next reader learns to ignore a true one. The invariant is
  // structural (`buildBuildings` never counts an extra volume), so one map of
  // each kind proves it and the cheap batteries above carry the census.
  it("the belt authors nothing: stats.buildings still counts the document's own footprints", () => {
    for (const id of RAY_IDS.concat("district-v1")) {
      if (!fs.existsSync(path.join(WORLD_DIR, `${id}.json`))) continue;
      const d = loadDistrict(id);
      expect(buildWorldGeometry(d).stats.buildings, id).toBe(d.buildings.length);
    }
  }, BUDGET_MS);

  it("every authored micro-map gets a belt — and neither OSM extract does", () => {
    const without: string[] = [];
    for (const id of ids) {
      const d = loadDistrict(id);
      const n = rimOf(d).length;
      if (typeof d.meta.mapKind === "string") {
        expect(n, id).toBeGreaterThan(8);
      } else {
        // `district-v1` and `d2-v1` are Sofia under an ODbL notice and their box
        // is a cut through a city that continues. See the gate's own header:
        // they keep the defect on purpose, and a city edge is a second question.
        expect(n, id).toBe(0);
        without.push(id);
      }
    }
    expect(without.sort()).toEqual(["d2-v1", "district-v1"]);
  }, BUDGET_MS);
});

describe("§2 the horizon is closed — no direction out of a spawn reaches the void", () => {
  const ids = RAY_IDS.filter((id) => fs.existsSync(path.join(WORLD_DIR, `${id}.json`)));

  it("the ray battery covers the districts the void rows were shot on", () => {
    // A silent typo in RAY_IDS would quietly reduce this file to §1. The three
    // T-junction maps are the ones sc-junction-rhr / -left / -blind ran on.
    expect(ids).toEqual(expect.arrayContaining(["tj-rhr-v1", "tj-emerge-v1", "tj-occluded-v1"]));
    expect(ids.length).toBeGreaterThanOrEqual(7);
  });

  for (const id of ids) {
    it(`${id}: something stands between every authored pose and the rim of the ground`, () => {
      const d = loadDistrict(id);
      const world = buildWorldGeometry(d);
      const edge = edgeOf(id);
      const segs = wallSegments(world.buildingWalls);
      const poses: P2[] =
        d.spawnPoints.length > 0
          ? d.spawnPoints.map((s) => [s.x, s.y] as P2)
          : [[0, 0] as P2];
      const open: string[] = [];
      for (const from of poses) {
        for (let k = 0; k < 72; k++) {
          const th = (k * Math.PI) / 36;
          const dir: P2 = [Math.sin(th), Math.cos(th)];
          const wall = clearAlongM(segs, from, dir);
          const void_ = edgeAlongM(edge, from, dir);
          if (!(wall < void_)) {
            open.push(
              `${from.join(",")} @${k * 5}° wall=${wall.toFixed(1)} edge=${void_.toFixed(1)}`,
            );
          }
        }
      }
      expect(open).toEqual([]);
    }, BUDGET_MS);
  }

  /**
   * THE SAME QUESTION OVER THE WHOLE CATALOGUE, cheaply.
   *
   * The nine batteries above read the DRAWN mesh, which costs a full
   * `buildWorldGeometry` each — 103 of those is not a unit test. This one fires
   * the same 72 rays against the rim rings and the authored footprints ONLY:
   * no terminus closure, no lot enclosure, no roundabout island, none of the
   * other masses a real build stands in the way. Every one of those can only
   * ADD an occluder, so a district that passes here would pass a fortiori on
   * its built mesh — the reading is a floor, not an estimate.
   *
   * It is what lets „the world has an edge" be said about the product rather
   * than about nine maps.
   */
  it("103 authored micro-maps: no ray from an authored pose reaches the void", () => {
    const open: string[] = [];
    let checked = 0;
    for (const id of allIds()) {
      const d = loadDistrict(id);
      if (typeof d.meta.mapKind !== "string") continue;
      checked++;
      const edge = edgeOf(id);
      const segs: Array<[P2, P2]> = [];
      const addRing = (ring: readonly P2[]) => {
        for (let i = 0; i < ring.length; i++) {
          segs.push([ring[i]!, ring[(i + 1) % ring.length]!]);
        }
      };
      for (const m of rimOf(d)) addRing(m.footprint as P2[]);
      for (const b of d.buildings) {
        if (Array.isArray(b.footprint) && b.footprint.length >= 3) addRing(b.footprint as P2[]);
      }
      const b = d.meta.boundsLocalMeters;
      const poses: P2[] =
        d.spawnPoints.length > 0
          ? d.spawnPoints.map((s) => [s.x, s.y] as P2)
          : [[(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] as P2];
      for (const from of poses) {
        for (let k = 0; k < 72; k++) {
          const th = (k * Math.PI) / 36;
          const dir: P2 = [Math.sin(th), Math.cos(th)];
          if (!(clearAlongM(segs, from, dir) < edgeAlongM(edge, from, dir))) {
            open.push(`${id} ${from.join(",")} @${k * 5}°`);
          }
        }
      }
    }
    expect(checked).toBe(103);
    expect(open).toEqual([]);
  }, BUDGET_MS);
});

describe("§3 the belt did not drag the ground-use zoning out with it", () => {
  /**
   * `terrain.ts` paves every cell within TERRAIN_PAVE_NEAR_BUILDING_M of a
   * building AABB, and the belt runs the whole perimeter — so had it been fed
   * to the terrain pass, every district would have gained a 20 m concrete ring.
   * `buildWorldGeometry` hands terrain the aabb list MINUS the rim for exactly
   * that reason; this is the assertion that notices if that ever stops.
   */
  /**
   * THE EXACT ASSERTION, on a document with nothing else in it. A map with no
   * buildings and no `mapKind` gets no authored footprint, no terminus closure
   * and no lot apron — so the ONLY thing that could zone a cell as paved is the
   * belt. `terrainPaved` must be empty. Feed the rim aabbs to `buildTerrain`
   * and this is the assertion that goes red.
   */
  it("a district with nothing on it paves nothing, belt or no belt", () => {
    const bare: District = {
      format: "district-v1",
      meta: {
        district: "rim-test",
        label: "Bare fixture",
        mapKind: "scenario-street",
        // Wide enough that neither end of the road is within
        // TERMINUS_BOUNDARY_MARGIN_M of the box: a terminus closure would be a
        // second extra volume and terrain IS entitled to zone around that one,
        // which would make the assertion below say nothing.
        boundsLocalMeters: { minX: -100, minY: -100, maxX: 100, maxY: 400 },
        attribution: {
          text: "оригинален параметричен дизайн (тестова карта)",
          license: "All rights reserved",
          licenseUrl: "/",
          copyrightUrl: "/",
        },
      },
      roads: {
        nodes: [
          { id: "n-start", x: 0, y: 0 },
          { id: "n-end", x: 0, y: 300 },
        ],
        edges: [
          {
            id: "e-street",
            from: "n-start",
            to: "n-end",
            class: "unclassified",
            name: null,
            oneway: false,
            roundabout: false,
            lanes: 2,
            lanesSource: "tag",
            maxspeed: 50,
            maxspeedSource: "tag",
            length: 300,
            geometry: [
              [0, 0],
              [0, 300],
            ],
          },
        ],
      },
      intersections: [],
      crossings: [],
      roundabouts: [],
      buildings: [],
      spawnPoints: [],
    };
    const world = buildWorldGeometry(bare);
    // The belt is there …
    expect(buildWorldRim(bare, analyzeNetwork(bare), []).length).toBeGreaterThan(8);
    // … and the ground under it was never re-zoned.
    expect(world.terrainPaved.positions.length).toBe(0);
  }, BUDGET_MS);

  for (const id of ["tj-rhr-v1"]) {
    it(`${id}: the ground under a rim mass is still open ground`, () => {
      const d = loadDistrict(id);
      const world = buildWorldGeometry(d);
      const rim = rimOf(d);
      // Every mass whose centre is far enough from anything the terrain pass
      // IS allowed to see that a paved cell there could only have come from the
      // rim itself. `> 2 × TERRAIN_PAVE_NEAR_BUILDING_M` leaves no doubt.
      // Everything the terrain pass IS entitled to zone around: the authored
      // footprints AND the terminus closures, which are extra volumes exactly
      // like the rim but are deliberately still in its list.
      const authored: P2[][] = [
        ...d.buildings
          .filter((b) => Array.isArray(b.footprint) && b.footprint.length >= 3)
          .map((b) => b.footprint as P2[]),
        ...world.terminusClosures.map((c) => c.footprint as P2[]),
      ];
      const probes: P2[] = [];
      for (const m of rim) {
        const c: P2 = [
          m.footprint.reduce((s, p) => s + p[0], 0) / m.footprint.length,
          m.footprint.reduce((s, p) => s + p[1], 0) / m.footprint.length,
        ];
        const near = authored.some((ring) =>
          ring.some((q) => Math.hypot(c[0] - q[0], c[1] - q[1]) < 2 * TERRAIN_PAVE_NEAR_BUILDING_M),
        );
        if (!near) probes.push(c);
      }
      expect(probes.length, `${id}: no clean probe`).toBeGreaterThan(3);

      const p = world.terrainPaved.positions;
      let nearest = Infinity;
      for (const c of probes) {
        for (let i = 0; i < p.length; i += 3) {
          nearest = Math.min(nearest, Math.hypot(p[i]! - c[0], -p[i + 2]! - c[1]));
        }
      }
      // The terrain grid is 112 cells over the padded span, so a cell is at
      // most ~18 m wide on the biggest map here; had the rim been zoned, its
      // own corners would be paved vertices AT the probe. 20 m is the honest
      // floor for "no paved vertex belongs to this mass".
      expect(nearest, id).toBeGreaterThan(20);
    }, BUDGET_MS);
  }

  it("the belt stands where the ground is, and inside the rim of it", () => {
    expect(WORLD_RIM_OUTER_M).toBeLessThan(TERRAIN_MARGIN_M);
    expect(WORLD_RIM_INNER_M).toBeLessThan(WORLD_RIM_OUTER_M);
    // The clearance a student still has when the wall is in front of him — the
    // number `runtime/district.ts` states the rim warning's lead against.
    expect(TERRAIN_MARGIN_M - WORLD_RIM_INNER_M).toBeGreaterThan(TERRAIN_PAVE_NEAR_BUILDING_M / 2);
  });
});
