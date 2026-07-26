/**
 * streetwall.mjs — BUILDINGS AS DATA (doc 82 V7).
 *
 * The finding this exists for: `d2-v1` is 1.93 × 1.63 km with 21.7 km of road
 * and ZERO buildings, and the other ~87 scenario maps carry 1–5 each. The
 * simulator therefore renders roads floating on an infinite lawn, which is the
 * single largest cause of the „basic Minecraft server with a car" verdict —
 * and it is a CONTENT gap, not a renderer gap (doc 82 §1.1).
 *
 * WHAT THIS IS NOT. It is not a modelling job and it places no meshes. The
 * world builder already extrudes and textures any footprint ring it is handed
 * (`world/builders/buildings.ts`) into ONE merged mesh per facade palette
 * variant — four draw calls for four buildings or four hundred — and hands the
 * tall compact ones to the 16-model instanced kit. So the whole of V7 is:
 * write better `buildings[]` arrays into the district JSONs.
 *
 * THE AUTHORING LAW (why every generated footprint is auditable):
 *
 *   1. NEVER TOUCH AUTHORED DATA. Generated buildings carry the `sw-` id
 *      prefix and nothing else in the file is rewritten — not a node, not an
 *      edge, not a zone, and above all not `meta.boundsLocalMeters` (see 2).
 *      Re-running strips the previous `sw-` set first, so the pass is
 *      idempotent and a map can be de-populated by dropping its config row.
 *   2. BOUNDS ARE FROZEN. `meta.boundsLocalMeters` seeds the Locator's spatial
 *      grid origin and column count (`runtime/spatial.ts`), which is rule-engine
 *      machinery: every graded lateral offset, stop-line hit and lane
 *      assignment is resolved through it. Moving the grid origin to fit new
 *      buildings would be a grading change disguised as set dressing. Instead,
 *      footprints must fit inside the bounds expanded by TERRAIN_MARGIN_M —
 *      the slab of ground + terrain the builder already draws past the bounds —
 *      so nothing is ever placed off the world.
 *   3. NOTHING MAY OBSTRUCT A LEGAL DRIVE. Every footprint vertex, edge and
 *      interior clears the FULL drawn cross-section (travel lanes + curbside
 *      parking band + sidewalk + skirt) of EVERY edge in the district by
 *      `frontClearM`. Building walls are colliders; a footprint that clipped a
 *      ribbon would put a wall on the asphalt.
 *   4. NOTHING MAY CLOSE A SIGHT LINE THE RULE ENGINE ASSUMES IS OPEN. Inside
 *      `sightLegM` of any junction of degree >= 3, every approach's corridor is
 *      widened by `sightSplayM` and kept empty — a real corner splay. At a
 *      right-angle X this reduces to the contract `jx-equal-districts.test.ts`
 *      already pins by hand (`min(|x|,|y|) >= sightClearM`), generalised to
 *      arbitrary approach angles. Spawn points and crossings get their own
 *      keep-out for the same reason.
 *   5. DETERMINISTIC. Same district + same config → byte-identical output. All
 *      jitter is FNV-1a over the candidate's own id (the `hashString` lane the
 *      world builders use), never a stateful RNG, so adding a map cannot move
 *      another map's buildings.
 *
 * Pure: no fs, no district loading, no serialization decisions. The driver
 * (`tools/maps/gen_streetwall.mjs`) owns the per-map table and the I/O.
 */

// ---------------------------------------------------------------------------
// Cross-section constants — MIRRORED from the world builder
// (platform/src/modules/sim/world/builders/constants.ts + network.ts).
// A generator that guessed these could place a wall inside a ribbon, so they
// are transcribed with their source names and checked by the world-side
// battery (world/__tests__/streetwall.test.ts imports the REAL constants and
// re-proves every clearance against the shipped JSONs).
// ---------------------------------------------------------------------------

/** contracts.PERCEPTUAL_ROAD_SCALE — the founder-ratified 2.5× (doc 82 §3.3). */
const PERCEPTUAL_ROAD_SCALE = 2.5;
/** constants.LANE_WIDTH_M */
const LANE_WIDTH_M = 3.25 * PERCEPTUAL_ROAD_SCALE;
/** constants.PARKING_LANE_WIDTH_M + PARKING_LANE_CLASSES */
const PARKING_LANE_WIDTH_M = 4.0;
const PARKING_LANE_CLASSES = new Set(["primary", "secondary", "tertiary"]);
/** constants.SIDEWALK_WIDTH_M + SIDEWALK_SKIRT_M + SIDEWALK_CLASSES */
const SIDEWALK_WIDTH_M = 3.5;
const SIDEWALK_SKIRT_M = 0.35;
const SIDEWALK_CLASSES = new Set([
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  "residential",
  "living_street",
]);
/** constants.TERRAIN_MARGIN_M — how far ground + terrain reach past bounds. */
export const TERRAIN_MARGIN_M = 60;
/** cityBuildings.METERS_PER_FLOOR — data height ↔ authored storey count. */
const METERS_PER_FLOOR = 3.4;
/** cityBuildings.TOWER_MIN_HEIGHT_M — at/above this a plot becomes a kit tower. */
const TOWER_MIN_HEIGHT_M = 40;
/** cityBuildings.PAVILION_MAX_HEIGHT_M — below this a small plot becomes a kit pavilion. */
const PAVILION_MAX_HEIGHT_M = 8;

/** Every generated building id starts here (rule 1 — the strip key). */
export const STREETWALL_ID_PREFIX = "sw-";

/** network.edgeParkingWidthM — curbside band, arterial classes only. */
export function edgeParkingWidthM(edge) {
  if (edge.roundabout) return 0;
  return PARKING_LANE_CLASSES.has(edge.class) ? PARKING_LANE_WIDTH_M : 0;
}

/** network.edgeTravelHalfWidth — the GRADED carriageway half width. */
export function edgeTravelHalfWidth(edge) {
  const lanes = Math.max(1, edge.lanes);
  let half = (lanes * LANE_WIDTH_M) / 2;
  if (edge.roundabout) half = Math.max(half, 2.4);
  return half;
}

/** network.edgeHalfWidth — curb to curb (travel lanes + parking band). */
export function edgeHalfWidth(edge) {
  return edgeTravelHalfWidth(edge) + edgeParkingWidthM(edge);
}

/**
 * The outermost DRAWN metre of an edge's cross-section: curb-to-curb, plus the
 * raised sidewalk and its skirt back down to terrain on the classes that carry
 * one (`roads.ts` buildSidewalkStrip). Rule 3 measures clearance from here, not
 * from the centreline — a building 20 m from the centreline of a 5-lane
 * secondary is standing on the pavement.
 */
export function edgeCorridorHalfM(edge) {
  const walk = SIDEWALK_CLASSES.has(edge.class) && !edge.roundabout
    ? SIDEWALK_WIDTH_M + SIDEWALK_SKIRT_M
    : 0;
  return edgeHalfWidth(edge) + walk;
}

// ---------------------------------------------------------------------------
// Small deterministic geometry kit (mirrors builders/math2d.ts where it
// overlaps — `hashString` is the SAME FNV-1a lane, so jitter reads the same
// way it does everywhere else in the world builder).
// ---------------------------------------------------------------------------

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic 0..1 from an id and a named lane (never a stateful RNG). */
function unit(id, lane) {
  return (hashString(`${lane}:${id}`) % 100000) / 100000;
}

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return len;
}

/** Point + unit tangent at arclength `s` along a polyline. */
function sampleAt(pts, s) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    const seg = Math.hypot(dx, dy);
    if (seg < 1e-9) continue;
    if (acc + seg >= s || i === pts.length - 1) {
      const t = Math.max(0, Math.min(1, (s - acc) / seg));
      return {
        p: [pts[i - 1][0] + dx * t, pts[i - 1][1] + dy * t],
        t: [dx / seg, dy / seg],
      };
    }
    acc += seg;
  }
  return { p: [pts[0][0], pts[0][1]], t: [1, 0] };
}

/** Sub-polyline from arclength 0 out to `limit` (the sight-leg cut, rule 4). */
function polylineHead(pts, limit) {
  const out = [[pts[0][0], pts[0][1]]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    const seg = Math.hypot(dx, dy);
    if (seg < 1e-9) continue;
    if (acc + seg >= limit) {
      const t = (limit - acc) / seg;
      out.push([pts[i - 1][0] + dx * t, pts[i - 1][1] + dy * t]);
      return out;
    }
    acc += seg;
    out.push([pts[i][0], pts[i][1]]);
  }
  return out;
}

function pointSegDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function segSegDist(a, b, c, d) {
  // Proper intersection ⇒ 0; otherwise the min of the four endpoint-to-segment
  // distances (the standard result for non-crossing segments).
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const denom = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denom) > 1e-12) {
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / denom;
    const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    pointSegDist(a, c, d),
    pointSegDist(b, c, d),
    pointSegDist(c, a, b),
    pointSegDist(d, a, b),
  );
}

function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Exact minimum distance from a closed ring to a polyline. Zero when they
 * cross OR when either shape swallows the other — the containment checks are
 * what stop a footprint from being accepted because it straddles a road
 * cleanly enough that no corner is near it.
 */
export function ringPolylineDist(ring, line) {
  for (const p of line) if (pointInRing(p, ring)) return 0;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    for (let j = 0; j < ring.length; j++) {
      const d = segSegDist(ring[j], ring[(j + 1) % ring.length], line[i - 1], line[i]);
      if (d < best) best = d;
      if (best === 0) return 0;
    }
  }
  return best;
}

/** Ring-to-ring distance (0 when they overlap) — the neighbour-spacing test. */
function ringRingDist(a, b) {
  for (const p of b) if (pointInRing(p, a)) return 0;
  for (const p of a) if (pointInRing(p, b)) return 0;
  let best = Infinity;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      const d = segSegDist(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]);
      if (d < best) best = d;
      if (best === 0) return 0;
    }
  }
  return best;
}

function ringAabb(ring) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function aabbGap(a, b) {
  return Math.max(a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3]);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Defaults tuned on Лозенец (d2-v1). They describe a Bulgarian residential
 * block: 4–10 storey панелки standing ~6 m back from the pavement in a
 * near-continuous wall with courtyard gaps.
 *
 * Heights deliberately stay inside (PAVILION_MAX_HEIGHT_M, TOWER_MIN_HEIGHT_M)
 * so every generated plot renders as a merged FACADE PRISM — which costs zero
 * additional draw calls (four palette meshes exist already) — instead of
 * consuming the 16-model instanced kit, whose draw calls the estimate charges
 * unconditionally. Kit towers stay a hand-authored decision.
 */
export const STREETWALL_DEFAULTS = {
  /** Road classes that host a street wall. `service` is excluded: those are
   *  alleys and parking accesses, and a wall along them would seal courtyards. */
  hostClasses: ["primary", "secondary", "tertiary", "unclassified", "residential"],
  /** Gap from the outermost drawn metre (pavement skirt) to the facade. */
  setbackM: 6,
  /** Deterministic extra setback, 0..setbackJitterM — kills the ruler look. */
  setbackJitterM: 4,
  /** Frontage along the street, before jitter. */
  frontageM: 26,
  frontageJitterM: 12,
  /** Depth away from the street (the block's other side gets its own wall). */
  depthM: 14,
  depthJitterM: 6,
  /** Gap between neighbouring plots along the street. */
  gapM: 9,
  /** Rule 3: clearance from EVERY edge's full drawn cross-section. */
  frontClearM: 1.5,
  /** Rule 4: how far the junction sight zone reaches along each approach. */
  sightLegM: 26,
  /** Rule 4: extra lateral clearance inside that zone (the corner splay). */
  sightSplayM: 10,
  /** Keep-out around spawn points and crossings (a student must see the
   *  crossing they are graded on stopping for). */
  spawnClearM: 18,
  crossingClearM: 14,
  /** Minimum gap between two footprints (generated OR authored). */
  neighbourGapM: 4,
  /** Storey mix, `[floors, weight]` — Sofia's mid-rise reality, capped so no
   *  plot reaches TOWER_MIN_HEIGHT_M. */
  floorMix: [
    [4, 20],
    [5, 28],
    [6, 22],
    [8, 18],
    [10, 12],
  ],
  /** Belt-and-braces cap so a config typo cannot flood a map. */
  maxBuildings: 900,
  /** Which sides of the host edges are walled: 1 = right of travel, -1 = left. */
  sides: [1, -1],
};

function pickFloors(id, mix) {
  const total = mix.reduce((s, [, w]) => s + w, 0);
  let roll = unit(id, "floors") * total;
  for (const [floors, w] of mix) {
    roll -= w;
    if (roll <= 0) return floors;
  }
  return mix[mix.length - 1][0];
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

/** Strip a previous run's output — rule 1's idempotence key. */
export function stripStreetwall(buildings) {
  return buildings.filter((b) => !String(b.id).startsWith(STREETWALL_ID_PREFIX));
}

/**
 * Stamp a street wall into `district`. Returns the NEW buildings only; the
 * caller concatenates them onto the authored set (which is never modified).
 *
 * Rejections are counted rather than thrown: on a 283-edge OSM cut most
 * candidates legitimately lose to a neighbour or a junction splay, and the
 * report is what makes a config row auditable.
 */
export function generateStreetwall(district, config = {}) {
  const cfg = { ...STREETWALL_DEFAULTS, ...config };
  const hosts = new Set(cfg.hostClasses);
  const bounds = district.meta.boundsLocalMeters;
  const limit = {
    minX: bounds.minX - TERRAIN_MARGIN_M,
    minY: bounds.minY - TERRAIN_MARGIN_M,
    maxX: bounds.maxX + TERRAIN_MARGIN_M,
    maxY: bounds.maxY + TERRAIN_MARGIN_M,
  };

  // -- Rule 3 corridors: every edge, at its own full drawn half width.
  const corridors = district.roads.edges.map((e) => ({
    line: e.geometry,
    clear: edgeCorridorHalfM(e) + cfg.frontClearM,
  }));

  // -- Rule 4 sight zones: the first sightLegM of every approach into a real
  //    junction (degree >= 3), widened by the splay. Degree-2 nodes are bends
  //    and way splits — nothing turns across them, so they get no splay.
  const nodeById = new Map(district.roads.nodes.map((n) => [n.id, n]));
  const degree = new Map();
  for (const e of district.roads.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const sightZones = [];
  for (const e of district.roads.edges) {
    const half = edgeCorridorHalfM(e) + cfg.sightSplayM;
    for (const endpoint of ["from", "to"]) {
      if ((degree.get(e[endpoint]) ?? 0) < 3) continue;
      const pts = endpoint === "from" ? e.geometry : [...e.geometry].reverse();
      sightZones.push({ line: polylineHead(pts, cfg.sightLegM), clear: half });
    }
  }
  // A junction node that no edge polyline reaches (defensive — the district
  // builders guarantee endpoints coincide, but a hand-edited map might not).
  const isolatedNodes = [];
  for (const i of district.intersections) {
    if ((degree.get(i.id) ?? 0) >= 3 && !nodeById.has(i.id)) isolatedNodes.push([i.x, i.y]);
  }

  const pointKeepOuts = [
    ...district.spawnPoints.map((s) => ({ p: [s.x, s.y], clear: cfg.spawnClearM })),
    ...district.crossings.map((c) => ({ p: [c.x, c.y], clear: cfg.crossingClearM })),
    ...isolatedNodes.map((p) => ({ p, clear: cfg.sightLegM })),
  ];

  /** Authored footprints are obstacles too — rule 1 never moves them. */
  const placed = stripStreetwall(district.buildings).map((b) => ({
    ring: b.footprint,
    aabb: ringAabb(b.footprint),
  }));

  const out = [];
  const rejected = { corridor: 0, sight: 0, keepOut: 0, neighbour: 0, bounds: 0, cap: 0 };

  for (const edge of district.roads.edges) {
    if (!hosts.has(edge.class) || edge.roundabout) continue;
    const len = polylineLength(edge.geometry);
    const pitch = cfg.frontageM + cfg.frontageJitterM / 2 + cfg.gapM;
    // Centre the row on the edge so both ends get the same courtyard gap
    // instead of the wall always crowding the `from` node.
    const count = Math.floor(len / pitch);
    if (count < 1) continue;
    const lead = (len - count * pitch) / 2 + pitch / 2;
    const base = edgeCorridorHalfM(edge);

    for (const side of cfg.sides) {
      for (let k = 0; k < count; k++) {
        if (out.length >= cfg.maxBuildings) {
          rejected.cap++;
          continue;
        }
        const id = `${STREETWALL_ID_PREFIX}${edge.id}-${side > 0 ? "r" : "l"}${k}`;
        const { p, t } = sampleAt(edge.geometry, lead + k * pitch);
        // Right of travel is (ty, -tx) — the world builder's `perpRight`.
        const n = [t[1] * side, -t[0] * side];
        const front = base + cfg.setbackM + unit(id, "set") * cfg.setbackJitterM;
        const w = cfg.frontageM + unit(id, "front") * cfg.frontageJitterM;
        const d = cfg.depthM + unit(id, "depth") * cfg.depthJitterM;

        // Rectangle: front edge parallel to the street tangent, extruded out.
        const c = [p[0] + n[0] * front, p[1] + n[1] * front];
        const ring = [
          [c[0] - t[0] * (w / 2), c[1] - t[1] * (w / 2)],
          [c[0] + t[0] * (w / 2), c[1] + t[1] * (w / 2)],
          [c[0] + t[0] * (w / 2) + n[0] * d, c[1] + t[1] * (w / 2) + n[1] * d],
          [c[0] - t[0] * (w / 2) + n[0] * d, c[1] - t[1] * (w / 2) + n[1] * d],
        ].map(([x, y]) => [r2(x), r2(y)]);
        const aabb = ringAabb(ring);

        // Rule 2 — inside the ground slab the builder actually draws.
        if (
          aabb[0] < limit.minX ||
          aabb[1] < limit.minY ||
          aabb[2] > limit.maxX ||
          aabb[3] > limit.maxY
        ) {
          rejected.bounds++;
          continue;
        }
        // Rule 3 — clear of every carriageway in the district, not just its own.
        let bad = false;
        for (const co of corridors) {
          if (ringPolylineDist(ring, co.line) < co.clear) {
            bad = true;
            break;
          }
        }
        if (bad) {
          rejected.corridor++;
          continue;
        }
        // Rule 4 — clear of every junction sight zone.
        for (const z of sightZones) {
          if (ringPolylineDist(ring, z.line) < z.clear) {
            bad = true;
            break;
          }
        }
        if (bad) {
          rejected.sight++;
          continue;
        }
        for (const ko of pointKeepOuts) {
          if (ringPolylineDist(ring, [ko.p, ko.p]) < ko.clear) {
            bad = true;
            break;
          }
        }
        if (bad) {
          rejected.keepOut++;
          continue;
        }
        // Neighbours (authored first, then everything accepted so far).
        for (const other of placed) {
          if (aabbGap(aabb, other.aabb) > cfg.neighbourGapM) continue;
          if (ringRingDist(ring, other.ring) < cfg.neighbourGapM) {
            bad = true;
            break;
          }
        }
        if (bad) {
          rejected.neighbour++;
          continue;
        }

        const floors = pickFloors(id, cfg.floorMix);
        const height = r2(floors * METERS_PER_FLOOR);
        if (height >= TOWER_MIN_HEIGHT_M || height <= PAVILION_MAX_HEIGHT_M) {
          throw new Error(
            `${id}: height ${height} m leaves the facade-prism band ` +
              `(${PAVILION_MAX_HEIGHT_M}, ${TOWER_MIN_HEIGHT_M}) — fix floorMix`,
          );
        }
        out.push({ id, height, heightSource: "levels", footprint: ring });
        placed.push({ ring, aabb });
      }
    }
  }

  return {
    buildings: out,
    report: {
      placed: out.length,
      rejected,
      floors: out.reduce((m, b) => {
        const f = Math.round(b.height / METERS_PER_FLOOR);
        m[f] = (m[f] ?? 0) + 1;
        return m;
      }, {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Serialization — each family of maps keeps ITS OWN shipped byte layout, so a
// populate pass produces a buildings-only diff instead of reformatting 89 files.
// ---------------------------------------------------------------------------

/** The scenario generators' layout: `JSON.stringify(d, null, 1)` + newline. */
function serializeCompact(district) {
  return `${JSON.stringify(district, null, 1)}\n`;
}

/** The OSM pipeline's layout (tools/osm/build.mjs + build_district_d2.mjs):
 *  2-space document, one record per line inside every array. */
function serializeRecords(district) {
  const block = (arr) =>
    arr.length === 0 ? "[]" : `[\n    ${arr.map((r) => JSON.stringify(r)).join(",\n    ")}\n  ]`;
  const indent = (s) => s.split("\n").join("\n  ");
  return (
    "{\n" +
    `  "format": "district-v1",\n` +
    `  "meta": ${indent(JSON.stringify(district.meta, null, 2))},\n` +
    `  "roads": {\n` +
    `    "nodes": ${indent(block(district.roads.nodes))},\n` +
    `    "edges": ${indent(block(district.roads.edges))}\n` +
    `  },\n` +
    `  "intersections": ${block(district.intersections)},\n` +
    `  "crossings": ${block(district.crossings)},\n` +
    `  "roundabouts": ${block(district.roundabouts)},\n` +
    `  "buildings": ${block(district.buildings)},\n` +
    `  "spawnPoints": ${block(district.spawnPoints)}` +
    (district.zones ? `,\n  "zones": ${block(district.zones)}` : "") +
    "\n}\n"
  );
}

/**
 * Re-serialize a district in the layout its own generator ships. `style` is
 * declared per target rather than sniffed: a silent mis-detection would rewrite
 * a 2 MB file's formatting and bury the buildings diff.
 */
export function serializeDistrict(district, style) {
  if (style === "records") return serializeRecords(district);
  if (style === "compact") return serializeCompact(district);
  throw new Error(`serializeDistrict: unknown style ${style}`);
}
