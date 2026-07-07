#!/usr/bin/env node
// build.mjs — transform the cached Overpass extract into
// content/world/district-v1.json (road graph, intersections, crossings,
// roundabouts, buildings, spawn points, meta/attribution).
//
// Deterministic: output is a pure function of the cache file. No wall-clock
// values are written; arrays are sorted by stable OSM-derived ids; floats are
// rounded to fixed precision. Running twice on the same cache produces
// byte-identical output.
//
// Usage: node build.mjs

import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  DISTRICT,
  districtCenter,
  DRIVABLE_HIGHWAY,
  EXCLUDED_SERVICE,
} from "./district.config.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(HERE, "cache", `${DISTRICT.name}.json`);
const REPO_ROOT = path.join(HERE, "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "content", "world");
const OUT_FILE = path.join(OUT_DIR, "district-v1.json");

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // ~2 MB budget (hard fail above)

// ---------------------------------------------------------------------------
// Projection: equirectangular local tangent plane around district center.
// x = east meters, y = north meters. Error over a ~1 km half-extent is <0.1%,
// far below visual/game relevance. The engine maps (x, y) -> (x, -z) in
// three.js (y-up, -z forward-north).
// ---------------------------------------------------------------------------
const R_EARTH = 6371000; // spherical earth radius, meters
const DEG = Math.PI / 180;
const CENTER = districtCenter();
const M_PER_DEG_LAT = R_EARTH * DEG; // ~111194.9
const M_PER_DEG_LON = R_EARTH * DEG * Math.cos(CENTER.lat * DEG);

const projX = (lon) => (lon - CENTER.lon) * M_PER_DEG_LON;
const projY = (lat) => (lat - CENTER.lat) * M_PER_DEG_LAT;
const round2 = (v) => Math.round(v * 100) / 100; // 1 cm — roads
const round1 = (v) => Math.round(v * 10) / 10; // 10 cm — buildings

// ---------------------------------------------------------------------------
// Bulgarian defaults (documented in docs/simulation/17).
// maxspeed: ЗДвП чл. 21 — urban 50 km/h; жилищна зона (living street) 20 km/h.
// ---------------------------------------------------------------------------
const BG_URBAN_MAXSPEED = 50;
const MAXSPEED_DEFAULTS = {
  living_street: 20,
  service: 30, // yards/access roads: practical guess, below urban default
};
const MAXSPEED_ZONE_ALIASES = {
  "BG:urban": 50,
  "BG:rural": 90,
  "BG:motorway": 140,
  "BG:living_street": 20,
  walk: 5,
};

// Default total marked lanes when OSM `lanes` tag is missing.
// Two-way roads: one lane per direction unless a big class; oneway: 1 unless
// a big class. `lanesSource: "default"` flags these for hand-polish.
function defaultLanes(cls, oneway) {
  const big = new Set(["motorway", "trunk", "primary", "motorway_link", "trunk_link"]);
  const medium = new Set(["secondary", "primary_link", "secondary_link"]);
  if (oneway) {
    if (big.has(cls)) return 2;
    if (medium.has(cls)) return 2;
    return 1;
  }
  if (big.has(cls)) return 4;
  return 2;
}

function parseMaxspeed(tags) {
  const raw = tags.maxspeed;
  if (raw != null) {
    if (raw in MAXSPEED_ZONE_ALIASES) return { v: MAXSPEED_ZONE_ALIASES[raw], src: "tag" };
    const m = String(raw).match(/^(\d+)(\s*km\/h)?$/);
    if (m) return { v: parseInt(m[1], 10), src: "tag" };
    const mph = String(raw).match(/^(\d+)\s*mph$/);
    if (mph) return { v: Math.round(parseInt(mph[1], 10) * 1.609), src: "tag" };
  }
  const cls = tags.highway;
  if (cls in MAXSPEED_DEFAULTS) return { v: MAXSPEED_DEFAULTS[cls], src: "default" };
  return { v: BG_URBAN_MAXSPEED, src: "default" };
}

function parseLanes(tags, cls, oneway) {
  const raw = tags.lanes;
  if (raw != null) {
    const n = parseInt(String(raw), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 12) return { v: n, src: "tag" };
  }
  return { v: defaultLanes(cls, oneway), src: "default" };
}

function parseOneway(tags) {
  if (tags.junction === "roundabout") return true; // implied by OSM convention
  const v = tags.oneway;
  return v === "yes" || v === "1" || v === "true" || v === "-1";
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return L;
}

/** Point + bearing (deg, 0=north/+y, clockwise) at fraction t of polyline length. */
function pointAlong(pts, t) {
  const total = polylineLength(pts);
  let target = total * t;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    const seg = Math.hypot(dx, dy);
    if (target <= seg || i === pts.length - 1) {
      const f = seg > 0 ? target / seg : 0;
      const heading = ((Math.atan2(dx, dy) / DEG) + 360) % 360;
      return {
        x: pts[i - 1][0] + dx * f,
        y: pts[i - 1][1] + dy * f,
        heading,
      };
    }
    target -= seg;
  }
  return { x: pts[0][0], y: pts[0][1], heading: 0 };
}

/** Douglas–Peucker simplification (open polyline; endpoints kept). */
function simplifyDP(pts, epsilon) {
  if (pts.length <= 2) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = -1;
    let maxI = -1;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      let d;
      if (len2 === 0) {
        d = Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
      } else {
        d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / Math.sqrt(len2);
      }
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > epsilon) {
      keep[maxI] = true;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

class UnionFind {
  constructor() {
    this.parent = new Map();
  }
  find(x) {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r);
    while (this.parent.get(x) !== r) {
      const nxt = this.parent.get(x);
      this.parent.set(x, r);
      x = nxt;
    }
    return r;
  }
  union(a, b) {
    this.parent.set(this.find(a), this.find(b));
  }
}

const byNum = (a, b) => a - b;
const cmpId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// ---------------------------------------------------------------------------
// Load cache
// ---------------------------------------------------------------------------
let cacheRaw;
try {
  cacheRaw = readFileSync(CACHE_FILE);
} catch {
  console.error(`Cache not found: ${CACHE_FILE}`);
  console.error("Run `node fetch.mjs` first.");
  process.exit(1);
}
const cache = JSON.parse(cacheRaw.toString("utf8"));
const overpass = cache.overpass;
const cacheSha256 = createHash("sha256").update(cacheRaw).digest("hex");

const osmNodes = new Map(); // id -> {lat, lon, tags?}
const osmWays = new Map(); // id -> {nodes: [ids], tags}
const osmRelations = [];
for (const el of overpass.elements) {
  if (el.type === "node") osmNodes.set(el.id, el);
  else if (el.type === "way") osmWays.set(el.id, el);
  else if (el.type === "relation") osmRelations.push(el);
}
osmRelations.sort((a, b) => a.id - b.id);

// ---------------------------------------------------------------------------
// 1. Road ways -> split into graph edges at junction nodes
// ---------------------------------------------------------------------------
function isDrivableWay(way) {
  const t = way.tags ?? {};
  if (!DRIVABLE_HIGHWAY.has(t.highway)) return false;
  if (t.highway === "service" && EXCLUDED_SERVICE.has(t.service)) return false;
  if (t.area === "yes") return false; // area highways are not linear roads
  return true;
}

const roadWays = [...osmWays.values()].filter(isDrivableWay).sort((a, b) => a.id - b.id);

// Node usage count across road ways (occurrences, so closed loops count twice)
const usage = new Map();
for (const way of roadWays) {
  for (const nid of way.nodes) usage.set(nid, (usage.get(nid) ?? 0) + 1);
}

const isJunctionNode = (nid) => (usage.get(nid) ?? 0) >= 2;

const graphNodeIds = new Set(); // OSM node ids that become graph nodes
const edges = [];
const nodeToEdges = new Map(); // OSM node id -> [edge ids] (for crossings)
let droppedDegenerate = 0;

for (const way of roadWays) {
  const t = way.tags ?? {};
  const cls = t.highway;
  const roundabout = t.junction === "roundabout";
  const oneway = parseOneway(t);
  const reversed = t.oneway === "-1"; // rare: oneway against way direction
  const lanes = parseLanes(t, cls, oneway);
  const maxspeed = parseMaxspeed(t);

  const nids = way.nodes.filter((nid) => osmNodes.has(nid));
  if (nids.length < 2) continue;

  // Cut points: endpoints + junction nodes
  const cuts = [0];
  for (let i = 1; i < nids.length - 1; i++) {
    if (isJunctionNode(nids[i])) cuts.push(i);
  }
  cuts.push(nids.length - 1);

  let seg = 0;
  for (let c = 0; c + 1 < cuts.length; c++) {
    let sliceIds = nids.slice(cuts[c], cuts[c + 1] + 1);
    if (reversed) sliceIds = [...sliceIds].reverse();
    const pts = sliceIds.map((nid) => {
      const n = osmNodes.get(nid);
      return [round2(projX(n.lon)), round2(projY(n.lat))];
    });
    const length = polylineLength(pts);
    if (pts.length < 2 || length < 0.5) {
      droppedDegenerate++;
      continue;
    }
    const fromOsm = sliceIds[0];
    const toOsm = sliceIds[sliceIds.length - 1];
    graphNodeIds.add(fromOsm).add(toOsm);
    const id = `e${way.id}.${seg++}`;
    const edge = {
      id,
      from: `n${fromOsm}`,
      to: `n${toOsm}`,
      class: cls,
      name: t.name ?? null,
      oneway,
      roundabout,
      lanes: lanes.v,
      lanesSource: lanes.src,
      maxspeed: maxspeed.v,
      maxspeedSource: maxspeed.src,
      length: round2(length),
      geometry: pts,
    };
    edges.push(edge);
    for (const nid of sliceIds) {
      if (!nodeToEdges.has(nid)) nodeToEdges.set(nid, []);
      nodeToEdges.get(nid).push(id);
    }
  }
}
edges.sort(cmpId);

// Graph nodes
const nodes = [...graphNodeIds]
  .sort(byNum)
  .map((nid) => {
    const n = osmNodes.get(nid);
    return { id: `n${nid}`, x: round2(projX(n.lon)), y: round2(projY(n.lat)) };
  });
const nodeIndex = new Map(nodes.map((n) => [n.id, n]));

// Degree (self-loops count twice, matching graph convention)
const degree = new Map();
for (const e of edges) {
  degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
  degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
}

// ---------------------------------------------------------------------------
// 2. Signals, intersections, crossings
// ---------------------------------------------------------------------------
const signalNodes = [];
const crossingNodes = [];
for (const [nid, n] of [...osmNodes.entries()].sort((a, b) => a[0] - b[0])) {
  const hw = n.tags?.highway;
  if (hw === "traffic_signals") signalNodes.push({ nid, n });
  if (hw === "crossing") crossingNodes.push({ nid, n });
}

const SIGNAL_RADIUS_M = 25; // OSM often tags signals on approach nodes, not the junction node
const signalPts = signalNodes.map(({ n }) => [projX(n.lon), projY(n.lat)]);

function nearSignal(x, y) {
  for (const [sx, sy] of signalPts) {
    if (Math.hypot(sx - x, sy - y) <= SIGNAL_RADIUS_M) return true;
  }
  return false;
}

const intersections = nodes
  .filter((n) => (degree.get(n.id) ?? 0) >= 3)
  .map((n) => {
    const osmId = Number(n.id.slice(1));
    const selfSignal = osmNodes.get(osmId)?.tags?.highway === "traffic_signals";
    return {
      id: n.id,
      x: n.x,
      y: n.y,
      degree: degree.get(n.id),
      signalized: selfSignal || nearSignal(n.x, n.y),
    };
  });

const CROSSING_KIND = (tags) => {
  const c = tags?.crossing;
  if (c === "traffic_signals") return "signals";
  if (c === "zebra" || c === "marked" || c === "uncontrolled") return "marked";
  if (c === "unmarked") return "unmarked";
  return "unknown";
};

const crossings = crossingNodes.map(({ nid, n }) => {
  const kind = CROSSING_KIND(n.tags);
  const onEdges = (nodeToEdges.get(nid) ?? []).sort();
  return {
    id: `n${nid}`,
    x: round2(projX(n.lon)),
    y: round2(projY(n.lat)),
    kind,
    signalized: kind === "signals",
    edgeId: onEdges[0] ?? null, // road edge the crossing sits on (null if on a non-drivable way)
  };
});

// ---------------------------------------------------------------------------
// 3. Roundabouts (cluster contiguous roundabout edges)
// ---------------------------------------------------------------------------
const rbUF = new UnionFind();
const rbEdges = edges.filter((e) => e.roundabout);
for (const e of rbEdges) rbUF.union(e.from, e.to);
const rbClusters = new Map(); // root -> {edgeIds, pts}
for (const e of rbEdges) {
  const root = rbUF.find(e.from);
  if (!rbClusters.has(root)) rbClusters.set(root, { edgeIds: [], pts: [] });
  const c = rbClusters.get(root);
  c.edgeIds.push(e.id);
  c.pts.push(...e.geometry);
}
const roundabouts = [...rbClusters.values()]
  .map((c) => {
    const cx = c.pts.reduce((s, p) => s + p[0], 0) / c.pts.length;
    const cy = c.pts.reduce((s, p) => s + p[1], 0) / c.pts.length;
    const radius = c.pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / c.pts.length;
    return {
      x: round2(cx),
      y: round2(cy),
      radius: round2(radius),
      edgeIds: c.edgeIds.sort(),
    };
  })
  .sort((a, b) => (a.edgeIds[0] < b.edgeIds[0] ? -1 : 1))
  .map((rb, i) => ({ id: `rb-${i + 1}`, ...rb }));

// ---------------------------------------------------------------------------
// 4. Buildings (footprints + height guess)
// ---------------------------------------------------------------------------
const BUILDING_SIMPLIFY_EPS = 0.4; // meters; drops façade micro-detail only

function parseHeight(tags) {
  const h = tags?.height;
  if (h != null) {
    const m = String(h).match(/^([\d.]+)\s*m?$/);
    if (m) return { height: round1(parseFloat(m[1])), levels: null, src: "height" };
  }
  const lv = tags?.["building:levels"];
  if (lv != null) {
    const n = parseFloat(String(lv));
    if (Number.isFinite(n) && n > 0 && n < 60) {
      return { height: round1(n * 3), levels: n, src: "levels" };
    }
  }
  return { height: 6, levels: 2, src: "default" }; // 2 floors × 3 m
}

function footprintFromNodeIds(nids) {
  if (nids.length < 4) return null; // closed ring needs >= 3 distinct + closure
  if (nids[0] !== nids[nids.length - 1]) return null; // not closed
  let pts = nids.slice(0, -1).map((nid) => {
    const n = osmNodes.get(nid);
    if (!n) return null;
    return [projX(n.lon), projY(n.lat)];
  });
  if (pts.some((p) => p === null)) return null;
  // Simplify as closed ring: run DP on ring opened at index 0 with closure point
  const closed = [...pts, pts[0]];
  let simplified = simplifyDP(closed, BUILDING_SIMPLIFY_EPS).slice(0, -1);
  simplified = simplified.map(([x, y]) => [round1(x), round1(y)]);
  // Deduplicate consecutive identical points after rounding
  simplified = simplified.filter((p, i) => {
    const prev = simplified[(i + simplified.length - 1) % simplified.length];
    return !(p[0] === prev[0] && p[1] === prev[1]);
  });
  return simplified.length >= 3 ? simplified : null;
}

const consumedBuildingWays = new Set();
const buildings = [];

// Multipolygon building relations: emit each closed outer member ring
for (const rel of osmRelations) {
  const t = rel.tags ?? {};
  if (!t.building || t.building === "no") continue;
  const hh = parseHeight(t);
  for (const m of rel.members ?? []) {
    if (m.type !== "way" || m.role !== "outer") continue;
    const way = osmWays.get(m.ref);
    if (!way) continue;
    consumedBuildingWays.add(way.id);
    const fp = footprintFromNodeIds(way.nodes);
    if (!fp) continue;
    buildings.push({ id: `r${rel.id}.w${way.id}`, height: hh.height, heightSource: hh.src, footprint: fp });
  }
}

// Simple building ways
for (const way of [...osmWays.values()].sort((a, b) => a.id - b.id)) {
  const t = way.tags ?? {};
  if (!t.building || t.building === "no") continue;
  if (consumedBuildingWays.has(way.id)) continue;
  const fp = footprintFromNodeIds(way.nodes);
  if (!fp) continue;
  const hh = parseHeight(t);
  buildings.push({ id: `w${way.id}`, height: hh.height, heightSource: hh.src, footprint: fp });
}
buildings.sort(cmpId);

// ---------------------------------------------------------------------------
// 5. Connected components (union-find over graph nodes via edges)
// ---------------------------------------------------------------------------
const uf = new UnionFind();
for (const n of nodes) uf.find(n.id);
for (const e of edges) uf.union(e.from, e.to);
const comps = new Map();
for (const n of nodes) {
  const root = uf.find(n.id);
  if (!comps.has(root)) comps.set(root, []);
  comps.get(root).push(n.id);
}
const compSizes = [...comps.values()].map((c) => c.length).sort((a, b) => b - a);
const largestRoot = [...comps.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0];
const inLargest = new Set(comps.get(largestRoot) ?? []);

// ---------------------------------------------------------------------------
// 6. Spawn points — quiet streets in the main component, spread apart
// ---------------------------------------------------------------------------
const SPAWN_CLASSES = new Set(["residential", "living_street", "unclassified"]);
const SPAWN_MIN_EDGE_LENGTH = 60;
const SPAWN_MIN_SEPARATION = 150;
const SPAWN_MAX = 6;

const spawnCandidates = edges
  .filter(
    (e) =>
      SPAWN_CLASSES.has(e.class) &&
      !e.roundabout &&
      e.length >= SPAWN_MIN_EDGE_LENGTH &&
      inLargest.has(e.from),
  )
  .sort((a, b) => b.length - a.length || cmpId(a, b)); // longest first, stable

const spawnPoints = [];
for (const e of spawnCandidates) {
  if (spawnPoints.length >= SPAWN_MAX) break;
  const p = pointAlong(e.geometry, 0.5);
  if (spawnPoints.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < SPAWN_MIN_SEPARATION)) continue;
  spawnPoints.push({
    id: `spawn-${spawnPoints.length + 1}`,
    x: round2(p.x),
    y: round2(p.y),
    heading: round1(p.heading),
    edgeId: e.id,
    name: e.name,
  });
}

// ---------------------------------------------------------------------------
// 7. Stats + meta
// ---------------------------------------------------------------------------
const totalRoadM = edges.reduce((s, e) => s + e.length, 0);
const lanesTagged = edges.filter((e) => e.lanesSource === "tag");
const maxspeedTagged = edges.filter((e) => e.maxspeedSource === "tag");
const lanesTaggedM = lanesTagged.reduce((s, e) => s + e.length, 0);
const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10);

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const e of edges) {
  for (const [x, y] of e.geometry) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

const stats = {
  roadKm: Math.round((totalRoadM / 1000) * 100) / 100,
  nodes: nodes.length,
  edges: edges.length,
  intersections: intersections.length,
  signalizedIntersections: intersections.filter((i) => i.signalized).length,
  signalNodes: signalNodes.length,
  crossings: crossings.length,
  roundabouts: roundabouts.length,
  buildings: buildings.length,
  spawnPoints: spawnPoints.length,
  laneTagCoveragePctEdges: pct(lanesTagged.length, edges.length),
  laneTagCoveragePctKm: pct(lanesTaggedM, totalRoadM),
  maxspeedTagCoveragePctEdges: pct(maxspeedTagged.length, edges.length),
  connectedComponents: compSizes.length,
  largestComponentNodesPct: pct(compSizes[0] ?? 0, nodes.length),
};

const meta = {
  district: DISTRICT.name,
  label: DISTRICT.label,
  center: { lat: Math.round(CENTER.lat * 1e7) / 1e7, lon: Math.round(CENTER.lon * 1e7) / 1e7 },
  bboxRequested: DISTRICT.bbox,
  boundsLocalMeters: { minX: round2(minX), minY: round2(minY), maxX: round2(maxX), maxY: round2(maxY) },
  projection: {
    type: "equirectangular",
    note: "x = (lon - center.lon) * mPerDegLon (east, meters); y = (lat - center.lat) * mPerDegLat (north, meters). Spherical earth R=6371000. Engine mapping: (x, y) -> three.js (x, -z), y-up.",
    mPerDegLat: Math.round(M_PER_DEG_LAT * 1000) / 1000,
    mPerDegLon: Math.round(M_PER_DEG_LON * 1000) / 1000,
  },
  defaults: {
    maxspeedUrbanKmh: BG_URBAN_MAXSPEED,
    maxspeedLivingStreetKmh: MAXSPEED_DEFAULTS.living_street,
    maxspeedServiceKmh: MAXSPEED_DEFAULTS.service,
    buildingLevels: 2,
    metersPerLevel: 3,
    note: "Fields with *Source: 'default' were not tagged in OSM and use these Bulgarian urban defaults (ЗДвП чл. 21: 50 km/h urban, 20 km/h living zone).",
  },
  source: {
    osmDataTimestamp: overpass.osm3s?.timestamp_osm_base ?? null,
    overpassGenerator: overpass.generator ?? null,
    cacheSha256: cacheSha256,
    pipeline: "tools/osm/fetch.mjs + build.mjs v1",
  },
  attribution: {
    text: "Map data © OpenStreetMap contributors",
    license: "Open Database License (ODbL) v1.0",
    licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
    copyrightUrl: "https://www.openstreetmap.org/copyright",
    obligation:
      "REQUIRED: this file is a Derivative Database of OpenStreetMap data under ODbL 1.0. Any product surface that renders this world must visibly credit '© OpenStreetMap contributors' (e.g. sim HUD/about screen). If this database or a derivative is redistributed, it must remain under ODbL and note that data was derived from OpenStreetMap. Do not remove this block.",
  },
  stats,
};

// ---------------------------------------------------------------------------
// 8. Validation
// ---------------------------------------------------------------------------
const errors = [];
const finite = (v) => typeof v === "number" && Number.isFinite(v);

for (const e of edges) {
  if (!nodeIndex.has(e.from)) errors.push(`edge ${e.id}: unresolved from ${e.from}`);
  if (!nodeIndex.has(e.to)) errors.push(`edge ${e.id}: unresolved to ${e.to}`);
  if (!e.geometry.every((p) => finite(p[0]) && finite(p[1])))
    errors.push(`edge ${e.id}: non-finite geometry`);
  if (!finite(e.length) || e.length <= 0) errors.push(`edge ${e.id}: bad length`);
  if (!Number.isInteger(e.lanes) || e.lanes < 1) errors.push(`edge ${e.id}: bad lanes ${e.lanes}`);
  if (!finite(e.maxspeed) || e.maxspeed < 5) errors.push(`edge ${e.id}: bad maxspeed`);
}
for (const n of nodes) {
  if (!finite(n.x) || !finite(n.y)) errors.push(`node ${n.id}: non-finite coords`);
}
for (const b of buildings) {
  if (!finite(b.height) || b.height <= 0) errors.push(`building ${b.id}: bad height`);
  if (!b.footprint.every((p) => finite(p[0]) && finite(p[1])))
    errors.push(`building ${b.id}: non-finite footprint`);
  if (b.footprint.length < 3) errors.push(`building ${b.id}: degenerate footprint`);
}
for (const c of crossings) {
  if (!finite(c.x) || !finite(c.y)) errors.push(`crossing ${c.id}: non-finite coords`);
  if (c.edgeId !== null && !edges.some((e) => e.id === c.edgeId))
    errors.push(`crossing ${c.id}: unresolved edgeId ${c.edgeId}`);
}
for (const s of spawnPoints) {
  if (!edges.some((e) => e.id === s.edgeId)) errors.push(`spawn ${s.id}: unresolved edgeId`);
  if (!finite(s.x) || !finite(s.y) || !finite(s.heading)) errors.push(`spawn ${s.id}: non-finite`);
}
const idSets = [
  ["node", nodes],
  ["edge", edges],
  ["building", buildings],
];
for (const [label, arr] of idSets) {
  const seen = new Set();
  for (const item of arr) {
    if (seen.has(item.id)) errors.push(`duplicate ${label} id: ${item.id}`);
    seen.add(item.id);
  }
}
if (roundabouts.length === 0) {
  errors.push("no roundabout found — district must contain one for lesson coverage (adjust bbox)");
}
if (intersections.filter((i) => i.signalized).length === 0) {
  errors.push("no signalized intersections found — adjust bbox");
}

// ---------------------------------------------------------------------------
// 9. Serialize (stable, diffable: one record per line) + size check
// ---------------------------------------------------------------------------
function recordsBlock(arr) {
  if (arr.length === 0) return "[]";
  return "[\n    " + arr.map((r) => JSON.stringify(r)).join(",\n    ") + "\n  ]";
}

const out =
  "{\n" +
  `  "format": "district-v1",\n` +
  `  "meta": ${JSON.stringify(meta, null, 2).split("\n").join("\n  ")},\n` +
  `  "roads": {\n` +
  `    "nodes": ${recordsBlock(nodes).split("\n").join("\n  ")},\n` +
  `    "edges": ${recordsBlock(edges).split("\n").join("\n  ")}\n` +
  `  },\n` +
  `  "intersections": ${recordsBlock(intersections)},\n` +
  `  "crossings": ${recordsBlock(crossings)},\n` +
  `  "roundabouts": ${recordsBlock(roundabouts)},\n` +
  `  "buildings": ${recordsBlock(buildings)},\n` +
  `  "spawnPoints": ${recordsBlock(spawnPoints)}\n` +
  "}\n";

// JSON validity self-check before writing
JSON.parse(out);

const outBytes = Buffer.byteLength(out, "utf8");
if (outBytes > MAX_OUTPUT_BYTES) {
  errors.push(
    `output ${(outBytes / 1024 / 1024).toFixed(2)} MB exceeds ${(MAX_OUTPUT_BYTES / 1024 / 1024).toFixed(1)} MB budget — increase BUILDING_SIMPLIFY_EPS or shrink bbox`,
  );
}

// ---------------------------------------------------------------------------
// 10. Report
// ---------------------------------------------------------------------------
const line = (k, v) => console.log(`  ${k.padEnd(34)} ${v}`);
console.log(`\n=== district build: ${DISTRICT.label} ===`);
line("road length", `${stats.roadKm} km`);
line("graph nodes", stats.nodes);
line("graph edges", stats.edges);
line("intersections (degree >= 3)", stats.intersections);
line("  of which signalized", stats.signalizedIntersections);
line("traffic signal nodes (raw)", stats.signalNodes);
line("pedestrian crossings", stats.crossings);
line("roundabouts", stats.roundabouts);
line("buildings", stats.buildings);
line("spawn points", stats.spawnPoints);
line("lane tag coverage", `${stats.laneTagCoveragePctEdges}% of edges / ${stats.laneTagCoveragePctKm}% of km`);
line("maxspeed tag coverage", `${stats.maxspeedTagCoveragePctEdges}% of edges`);
line("connected components", `${stats.connectedComponents} (largest holds ${stats.largestComponentNodesPct}% of nodes)`);
if (compSizes.length > 1) {
  line("  component sizes (top 5)", compSizes.slice(0, 5).join(", "));
}
line("dropped degenerate segments", droppedDegenerate);
line("output size", `${(outBytes / 1024).toFixed(0)} KB (budget ${(MAX_OUTPUT_BYTES / 1024).toFixed(0)} KB)`);

if (errors.length > 0) {
  console.error(`\nVALIDATION FAILED — ${errors.length} error(s):`);
  for (const e of errors.slice(0, 30)) console.error(`  - ${e}`);
  if (errors.length > 30) console.error(`  ... and ${errors.length - 30} more`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, out);
console.log(`\nValidation OK. Wrote ${OUT_FILE}`);
