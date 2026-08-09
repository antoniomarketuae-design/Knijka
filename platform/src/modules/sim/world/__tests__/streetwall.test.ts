/**
 * STREET WALL — the sight-line battery for the buildings-as-data pass
 * (doc 82 V7 / phase P5, `tools/maps/gen_streetwall.mjs`).
 *
 * Doc 82 budgets ~8 of V7's 34 hours for this and says it is not optional:
 * „a building that blocks a sight line the rule engine assumed was clear will
 * produce false verdicts". 658 footprints were generated across 22 maps by a
 * script; the only thing that makes that safe is a battery that re-proves the
 * clearance law from the WORLD BUILDER'S OWN constants rather than from the
 * generator's copy of them.
 *
 * That is the point of re-deriving instead of importing: `lib/streetwall.mjs`
 * MIRRORS `builders/constants.ts` (a Node authoring script cannot import the
 * TS module). If those two ever drift — someone widens a lane, changes the
 * sidewalk, adds a class to PARKING_LANE_CLASSES — the generated footprints
 * stop clearing the corridor computed here and this file fails, which is the
 * only automatic warning that a shipped map now has a wall on its pavement.
 *
 * The four invariants, in the generator's own numbering:
 *   rule 2 — every footprint sits on ground the builder actually draws;
 *   rule 3 — every footprint clears the FULL drawn cross-section of EVERY edge
 *            (walls are colliders: an intrusion is an obstruction);
 *   rule 4 — every footprint keeps a corner splay clear at every junction of
 *            degree >= 3, generalising `jx-equal-districts.test.ts`'s hand-
 *            written „OPEN CORNERS are the contract" to arbitrary approach
 *            angles;
 *   rule 5 — deterministic, and cheap: the wall must not promote plots into
 *            the instanced tower kit, whose draw calls are charged flat.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { resolveBuildingHeightM, PAVILION_MAX_HEIGHT_M, TOWER_MIN_HEIGHT_M } from "../builders/cityBuildings";
import {
  SIDEWALK_CLASSES,
  SIDEWALK_SKIRT_M,
  SIDEWALK_WIDTH_M,
  TERRAIN_MARGIN_M,
} from "../builders/constants";
import { edgeHalfWidth } from "../builders/network";
import { assertDistrict, type District, type DistrictBuilding, type DistrictEdge } from "../types";

/** The generator's id prefix — the ONLY thing it is allowed to add. */
const SW = "sw-";

/**
 * The populate table, pinned. `tools/maps/gen_streetwall.mjs` owns the config;
 * this is the shipped result, so deleting a map from the table (or forgetting
 * to re-run the pass after a base rebuild) fails loudly instead of silently
 * un-populating the world a student drives through.
 */
const POPULATED: ReadonlyArray<readonly [string, number]> = [
  // 380 → 378 and (below) tj-emerge 14 → 13, 2026-08-09. NOT a config change:
  // these two districts' `spawnPoints` had been edited by a later pass and the
  // wall was never re-stamped, so five shipped plots were standing inside a
  // spawn keep-out (14.51–15.80 m where CITY wants 18; 11.98 m where JUNCTION
  // wants 12). `tools/maps/streetwall.test.mjs` now holds the repo to being
  // the pass's fixed point, so this table can only go stale deliberately.
  ["d2-v1", 378],
  ["sx-v1", 16],
  ["ln-v1", 20],
  ["fo-follow-v1", 18],
  ["rb-mini-v1", 8],
  ["vp-ready-v1", 17],
  ["hz-obstacle-v1", 10],
  ["ac-rain-v1", 18],
  ["tj-stop-v1", 16],
  ["ov-narrow-v1", 9],
  ["tj-rhr-v1", 16],
  ["tj-emerge-v1", 13],
  ["wb-boulevard-v1", 7],
  ["vu-pass-v1", 19],
  ["sp-rain-v1", 18],
  ["pe-jay-v1", 12],
  // doc 86 D1 — these two now carry an AUTHORED streetscape
  // (tools/maps/gen_pe_crossings.mjs STREETSCAPES: "blind-corner-kiosk" and
  // "courtyard-blocks"), placed to teach — a corner pushed onto the kerb line
  // 1.5 m before the zebra, a courtyard mouth aimed at it. The procedural pass
  // still runs and still has to clear every corridor and splay; it simply finds
  // almost nowhere left to stand (5 and 6 plots rejected as neighbours). Total
  // buildings per map is unchanged at 5 — what changed is that they mean
  // something. If these numbers ever RISE, an authored volume was deleted.
  ["pe-dart-v1", 1],
  ["pe-child-v1", 0],
  ["fo-brake-v1", 19],
  ["pe-zone-v1", 5],
  ["zb-v1", 10],
  // 18 -> 16: the зона-30 street now AUTHORS a school (`sp-b-school`,
  // `kind: "school"` — founder item 61), and the pass's own neighbour clearance
  // parts the generated wall around it. Two generated blocks fewer, one
  // authored building more, and the same law holds: nothing generated may sit
  // inside an authored footprint's keep-out.
  ["sp-zone30-v1", 16],
];

/**
 * Maps whose buildings ARE their lesson, or whose fabric is deliberately
 * absent. gen_streetwall.mjs lists the same set with its reasons; pinning it
 * here stops a future „populate everything" run from quietly deleting the
 * JU-17 occluder's meaning or walling in a полигон.
 */
const MUST_STAY_UNPOPULATED = [
  "tj-occluded-v1",
  "jx-equal-v1",
  "ac-bridge-v1",
  "ov-crest-v1",
  "ov-oncoming-v1",
  "mw-v1",
  "poligon-v1",
  "lot-perp-v1",
  "district-v1",
];

/**
 * The FLOOR the battery holds every preset to. gen_streetwall ships three
 * presets (CITY 24/9, STREET 20/8, JUNCTION 30/10, ROUNDABOUT 24/10); this is
 * the weakest of them, so the assertion is true of every populated map without
 * this file having to duplicate the config table.
 */
const SIGHT_LEG_M = 20;
const SIGHT_SPLAY_M = 8;
/** streetwall.mjs `frontClearM` — clearance from the outermost drawn metre. */
const FRONT_CLEAR_M = 1.5;

// ---------------------------------------------------------------------------

function loadDistrict(id: string): District {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")));
  }
  throw new Error(`${id}.json not found in: ${candidates.join(", ")}`);
}

type Pt = readonly [number, number];

/**
 * The world builder's outermost DRAWN metre for an edge: curb-to-curb (travel
 * lanes + the arterial parking band, via the REAL `edgeHalfWidth`) plus the
 * raised sidewalk and the skirt that takes it back down to terrain.
 */
function corridorHalfM(edge: DistrictEdge): number {
  const walk =
    SIDEWALK_CLASSES.has(edge.class) && !edge.roundabout ? SIDEWALK_WIDTH_M + SIDEWALK_SKIRT_M : 0;
  return edgeHalfWidth(edge) + walk;
}

function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function segSegDist(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) > 1e-12) {
    const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denom;
    const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(pointSegDist(a, c, d), pointSegDist(b, c, d), pointSegDist(c, a, b), pointSegDist(d, a, b));
}

function pointInRing(p: Pt, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Exact ring→polyline distance; 0 when they cross or one swallows the other. */
function ringPolylineDist(ring: readonly Pt[], line: readonly Pt[]): number {
  for (const p of line) if (pointInRing(p, ring)) return 0;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    for (let j = 0; j < ring.length; j++) {
      const d = segSegDist(ring[j]!, ring[(j + 1) % ring.length]!, line[i - 1]!, line[i]!);
      if (d < best) best = d;
      if (best === 0) return 0;
    }
  }
  return best;
}

/** Sub-polyline from the head of `pts` out to `limit` metres of arclength. */
function polylineHead(pts: readonly Pt[], limit: number): Pt[] {
  const out: Pt[] = [pts[0]!];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i]![0] - pts[i - 1]![0];
    const dy = pts[i]![1] - pts[i - 1]![1];
    const seg = Math.hypot(dx, dy);
    if (seg < 1e-9) continue;
    if (acc + seg >= limit) {
      const t = (limit - acc) / seg;
      out.push([pts[i - 1]![0] + dx * t, pts[i - 1]![1] + dy * t]);
      return out;
    }
    acc += seg;
    out.push(pts[i]!);
  }
  return out;
}

const generated = (d: District): DistrictBuilding[] => d.buildings.filter((b) => b.id.startsWith(SW));

// ---------------------------------------------------------------------------

describe("street wall — the populate pass is pinned", () => {
  it("populates exactly the ~20 maps the scenario templates run in most", () => {
    for (const [id, count] of POPULATED) {
      expect(generated(loadDistrict(id)).length, `${id}`).toBe(count);
    }
    const total = POPULATED.reduce((n, [, c]) => n + c, 0);
    // 658 → 651: doc 86 D1 replaced 8 procedural prisms on pe-dart-v1 /
    // pe-child-v1 with 9 authored, lesson-bearing volumes (see the table).
    // 651 → 649: the same trade once more, on sp-zone30-v1 — two generated
    // blocks give way to the AUTHORED school (founder item 61).
    // 649 → 646: d2-v1 -2 and tj-emerge-v1 -1, the five plots that had come to
    // sit inside a moved spawn keep-out (see the table's head note). Those are
    // NOT a trade for authored volumes — they are stale plots removed.
    expect(total).toBe(646);
  });

  it("leaves the maps whose buildings ARE the lesson completely alone", () => {
    for (const id of MUST_STAY_UNPOPULATED) {
      expect(generated(loadDistrict(id)).length, `${id}`).toBe(0);
    }
    // The JU-17 occluder specifically: doc-66 authored ONE corner block so the
    // student has to creep and peek. A street wall there would either duplicate
    // it or, worse, open the corner it deliberately closes.
    const occluded = loadDistrict("tj-occluded-v1");
    expect(occluded.buildings.map((b) => b.id)).toEqual(["tj-b-occluder"]);
  });
});

describe.each(POPULATED)("street wall clearance law — %s", (id) => {
  const district = loadDistrict(id);
  const walls = generated(district);
  const rings = walls.map((b) => ({ id: b.id, ring: b.footprint as Pt[] }));

  it("rule 3: no footprint intrudes on ANY edge's drawn cross-section", () => {
    // Walls are colliders. This is the assertion that stands between a data
    // pass and a building parked on the carriageway — and it is checked
    // against every edge in the district, not just the host edge, because a
    // plot on a corner is set back from one street and broadside to another.
    const offenders: string[] = [];
    for (const edge of district.roads.edges) {
      const need = corridorHalfM(edge) + FRONT_CLEAR_M;
      for (const { id: bid, ring } of rings) {
        const d = ringPolylineDist(ring, edge.geometry as Pt[]);
        if (d < need - 1e-6) offenders.push(`${bid} is ${d.toFixed(2)} m from ${edge.id} (needs ${need.toFixed(2)})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("rule 4: every junction keeps its corner splay — the sight-line contract", () => {
    // The generalisation of jx-equal-districts.test.ts's `min(|x|,|y|) >= 30`:
    // for the first SIGHT_LEG_M of every approach into a junction of degree
    // >= 3, that approach's corridor is widened by SIGHT_SPLAY_M and must be
    // empty. At a right-angle X the two legs' bands intersect in exactly the
    // L-shaped keep-clear that leaves the corner sight triangle open; at an
    // oblique junction they follow the real approach angles, which the
    // hand-written axis-aligned form could not express.
    const degree = new Map<string, number>();
    for (const e of district.roads.edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    const offenders: string[] = [];
    for (const edge of district.roads.edges) {
      const need = corridorHalfM(edge) + SIGHT_SPLAY_M;
      for (const end of ["from", "to"] as const) {
        if ((degree.get(edge[end]) ?? 0) < 3) continue;
        const pts = (end === "from" ? edge.geometry : [...edge.geometry].reverse()) as Pt[];
        const leg = polylineHead(pts, SIGHT_LEG_M);
        for (const { id: bid, ring } of rings) {
          const d = ringPolylineDist(ring, leg);
          if (d < need - 1e-6) {
            offenders.push(`${bid} closes the ${edge.id}/${edge[end]} splay at ${d.toFixed(2)} m (needs ${need.toFixed(2)})`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("rule 2: nothing is placed off the ground the builder draws", () => {
    // meta.boundsLocalMeters seeds the Locator's spatial grid origin
    // (runtime/spatial.ts) and is therefore rule-engine machinery — the
    // populate pass is forbidden from moving it. The consequence it must live
    // with is this one: footprints fit inside bounds + TERRAIN_MARGIN_M, the
    // slab of ground + terrain that already extends past them.
    const b = district.meta.boundsLocalMeters;
    const world = buildWorldGeometry(district);
    const g = world.colliders.ground;
    for (const { id: bid, ring } of rings) {
      for (const [x, y] of ring) {
        expect(x, `${bid} x`).toBeGreaterThanOrEqual(b.minX - TERRAIN_MARGIN_M);
        expect(x, `${bid} x`).toBeLessThanOrEqual(b.maxX + TERRAIN_MARGIN_M);
        expect(y, `${bid} y`).toBeGreaterThanOrEqual(b.minY - TERRAIN_MARGIN_M);
        expect(y, `${bid} y`).toBeLessThanOrEqual(b.maxY + TERRAIN_MARGIN_M);
        // …and the physics ground actually reaches under it (world space:
        // district (x, y) -> (x, -y)).
        expect(Math.abs(x - g.position[0]), `${bid} on the ground slab`).toBeLessThanOrEqual(g.halfExtents[0]);
        expect(Math.abs(-y - g.position[2]), `${bid} on the ground slab`).toBeLessThanOrEqual(g.halfExtents[2]);
      }
    }
  });

  it("rule 5: every plot stays a merged facade prism — zero new draw calls", () => {
    // buildings.ts merges prisms into 4 palette meshes; buildBuildingInstances
    // hands tall-and-compact or small-and-low plots to the 16-model kit, whose
    // draw calls drawCallEstimate charges FLAT. Keeping every generated height
    // strictly inside (PAVILION_MAX_HEIGHT_M, TOWER_MIN_HEIGHT_M) is what makes
    // "658 buildings for free" true rather than aspirational.
    for (const b of walls) {
      expect(b.heightSource, b.id).toBe("levels");
      const h = resolveBuildingHeightM(b);
      expect(h, b.id).toBeGreaterThan(PAVILION_MAX_HEIGHT_M);
      expect(h, b.id).toBeLessThan(TOWER_MIN_HEIGHT_M);
    }
    const world = buildWorldGeometry(district);
    expect(world.buildingWalls.length).toBe(4);
    // Authored kit instances (if the map has any) are untouched; the pass adds
    // none of its own.
    const generatedIds = new Set(walls.map((b) => b.id));
    expect(world.buildingInstances.filter((p) => generatedIds.has(p.buildingId))).toEqual([]);
  });

  it("no two footprints overlap (colliders would fight)", () => {
    const all = district.buildings.map((b) => ({ id: b.id, ring: b.footprint as Pt[] }));
    const offenders: string[] = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!;
        const c = all[j]!;
        if (!a.id.startsWith(SW) && !c.id.startsWith(SW)) continue; // authored pairs are not ours
        if (ringPolylineDist(a.ring, [...c.ring, c.ring[0]!]) < 1e-6) offenders.push(`${a.id} × ${c.id}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
