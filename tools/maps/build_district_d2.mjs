#!/usr/bin/env node
// build_district_d2.mjs — the SECOND exam district (ADR-007): real Sofia
// topology (Лозенец) through the same OSM path that built district-v1.
//
// One script, two phases:
//
//   node tools/maps/build_district_d2.mjs            # build from the committed snapshot
//   node tools/maps/build_district_d2.mjs --fetch    # re-download the snapshot first
//
// Phase 1 (fetch, only with --fetch or when the snapshot is missing):
//   Overpass → tools/maps/data/d2-lozenets.json. UNLIKE tools/osm/cache/ (a
//   disposable local cache), this snapshot is COMMITTED — ADR-007's
//   reproducibility clause: the D2 build must reproduce offline, byte-for-byte,
//   from the repo alone. The query also captures highway=stop / give_way nodes
//   (provenance for a future authored-controls pass — doc 74 §6.5); they are
//   recorded in the snapshot but NOT emitted: district-v1 carries no controls
//   field, controls are DERIVED at runtime (signalized flags + the
//   minor-meets-arterial stop heuristic in runtime/stoplines.ts), and D2 is
//   format-identical by contract. Unmapped = uncontrolled = right-hand rule —
//   the conservative reading ЗДвП чл. 50 demands.
//   NO building footprints: D2 ships drivable-first (ADR-007 descope; the
//   doc 71 visual program refetches for its own pass). buildings: [].
//
// Phase 2 (build): snapshot → content/world/d2-v1.json + the byte-identical
//   published copy platform/public/world/d2-v1.json (the fleet law every
//   district battery asserts). The transform is the district-v1 pipeline
//   (tools/osm/build.mjs) verbatim: same projection (equirectangular local
//   tangent plane, spherical R=6371000, UNSCALED real meters — the 2.5×
//   PERCEPTUAL_ROAD_SCALE lives downstream in the world builder / runtime
//   width constants, never in the JSON), same way filter, same junction
//   split, same BG defaults (ЗДвП чл. 21), same signal radius, same
//   roundabout clustering, same stable serialization. Deterministic: same
//   snapshot → byte-identical output. Exits non-zero on any validation error.
//
// Window (candidate evaluation 2026-07-17, scores in the D2 build report):
//   Лозенец beat Дружба-2 and Слатина/Гео Милев-изток — both have ZERO
//   mapped traffic_signals in their ~1.5×1 km windows (the no-signal
//   hard-fail below), while Лозенец holds 14 signal nodes, the only mapped
//   roundabout in the wider quarter (11 ring ways, ~42.6773/23.3416), 8 road
//   classes and 51 crossing nodes. The bbox was slid over real signal-node
//   positions with the roundabout constrained inside (the district-v1
//   window-optimization discipline, tools/osm/README.md).

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ---------------------------------------------------------------------------
// D2 district selection
// ---------------------------------------------------------------------------
export const DISTRICT = {
  name: "lozenets",
  label: "Лозенец (Lozenets), Sofia, Bulgaria",
  // ~1.00 km (S–N) × ~1.50 km (W–E) ≈ 1.50 km²
  bbox: {
    south: 42.6695,
    west: 23.333,
    north: 42.6785,
    east: 23.3513,
  },
};

const OUT_ID = "d2-v1";

/** Road classes that enter the drivable graph — district-v1's filter, verbatim. */
const DRIVABLE_HIGHWAY = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "service",
  "motorway_link",
  "trunk_link",
  "primary_link",
  "secondary_link",
  "tertiary_link",
]);

/** service=* values that are noise for lessons (private accesses, aisles). */
const EXCLUDED_SERVICE = new Set(["driveway", "parking_aisle", "emergency_access"]);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, "..", "..");
const DATA_DIR = path.join(HERE, "data");
const SNAPSHOT_FILE = path.join(DATA_DIR, `d2-${DISTRICT.name}.json`);
const OUT_FILE = path.join(REPO_ROOT, "content", "world", `${OUT_ID}.json`);
const PUBLISHED_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${OUT_ID}.json`);

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // the district-v1 budget

// ---------------------------------------------------------------------------
// Phase 1 — fetch (Overpass etiquette: one request, UA, mirror fallback)
// ---------------------------------------------------------------------------
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const USER_AGENT = "ai-driving-academy-osm-pipeline/0.2 (Bulgaria driving-sim D2 build)";

function buildQuery({ south, west, north, east }) {
  // Drivable ways + regulation nodes. stop/give_way ride along for snapshot
  // provenance (see header); buildings are deliberately absent (drivable-first).
  return `
[out:json][timeout:180][bbox:${south},${west},${north},${east}];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"];
  node["highway"~"^(traffic_signals|crossing|stop|give_way)$"];
);
(._;>;);
out body;
`.trim();
}

async function fetchOverpass(query) {
  let lastErr;
  for (const endpoint of ENDPOINTS) {
    try {
      console.log(`Querying ${endpoint} ...`);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      if (!Array.isArray(json.elements)) throw new Error("Malformed Overpass response (no elements[])");
      return { endpoint, json };
    } catch (err) {
      console.warn(`  failed: ${err.message}`);
      lastErr = err;
    }
  }
  throw new Error(`All Overpass endpoints failed. Last error: ${lastErr?.message}`);
}

async function ensureSnapshot(force) {
  if (existsSync(SNAPSHOT_FILE) && !force) return;
  const query = buildQuery(DISTRICT.bbox);
  const { endpoint, json } = await fetchOverpass(query);
  mkdirSync(DATA_DIR, { recursive: true });
  const wrapper = {
    fetch: {
      district: DISTRICT.name,
      bbox: DISTRICT.bbox,
      endpoint,
      fetchedAt: new Date().toISOString(),
      query,
      attribution:
        "Data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright",
    },
    overpass: json,
  };
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(wrapper));
  console.log(`Saved snapshot ${SNAPSHOT_FILE} (${json.elements.length} elements)`);
}

// ---------------------------------------------------------------------------
// Projection: equirectangular local tangent plane around the bbox center.
// UNSCALED real meters (verified against district-v1: node n148570715 in the
// shipped JSON matches the raw OSM coordinates through this exact projection
// with NO scale factor — PERCEPTUAL_ROAD_SCALE is a width-domain constant).
// ---------------------------------------------------------------------------
const R_EARTH = 6371000;
const DEG = Math.PI / 180;
const CENTER = {
  lat: (DISTRICT.bbox.south + DISTRICT.bbox.north) / 2,
  lon: (DISTRICT.bbox.west + DISTRICT.bbox.east) / 2,
};
const M_PER_DEG_LAT = R_EARTH * DEG;
const M_PER_DEG_LON = R_EARTH * DEG * Math.cos(CENTER.lat * DEG);

const projX = (lon) => (lon - CENTER.lon) * M_PER_DEG_LON;
const projY = (lat) => (lat - CENTER.lat) * M_PER_DEG_LAT;
const round2 = (v) => Math.round(v * 100) / 100;
const round1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// Bulgarian defaults — district-v1's block, verbatim (ЗДвП чл. 21).
// ---------------------------------------------------------------------------
const BG_URBAN_MAXSPEED = 50;
const MAXSPEED_DEFAULTS = {
  living_street: 20,
  service: 30,
};
const MAXSPEED_ZONE_ALIASES = {
  "BG:urban": 50,
  "BG:rural": 90,
  "BG:motorway": 140,
  "BG:living_street": 20,
  walk: 5,
};

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
  if (tags.junction === "roundabout") return true;
  const v = tags.oneway;
  return v === "yes" || v === "1" || v === "true" || v === "-1";
}

// ---------------------------------------------------------------------------
// Geometry helpers (district-v1 pipeline, verbatim)
// ---------------------------------------------------------------------------
function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return L;
}

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
// Phase 2 — build
// ---------------------------------------------------------------------------
function build() {
  const cacheRaw = readFileSync(SNAPSHOT_FILE);
  const cache = JSON.parse(cacheRaw.toString("utf8"));
  const overpass = cache.overpass;
  const cacheSha256 = createHash("sha256").update(cacheRaw).digest("hex");

  const osmNodes = new Map();
  const osmWays = new Map();
  for (const el of overpass.elements) {
    if (el.type === "node") osmNodes.set(el.id, el);
    else if (el.type === "way") osmWays.set(el.id, el);
  }

  // 1. Road ways -> split into graph edges at junction nodes
  function isDrivableWay(way) {
    const t = way.tags ?? {};
    if (!DRIVABLE_HIGHWAY.has(t.highway)) return false;
    if (t.highway === "service" && EXCLUDED_SERVICE.has(t.service)) return false;
    if (t.area === "yes") return false;
    return true;
  }

  const roadWays = [...osmWays.values()].filter(isDrivableWay).sort((a, b) => a.id - b.id);

  const usage = new Map();
  for (const way of roadWays) {
    for (const nid of way.nodes) usage.set(nid, (usage.get(nid) ?? 0) + 1);
  }
  const isJunctionNode = (nid) => (usage.get(nid) ?? 0) >= 2;

  const graphNodeIds = new Set();
  const edges = [];
  const nodeToEdges = new Map();
  let droppedDegenerate = 0;

  for (const way of roadWays) {
    const t = way.tags ?? {};
    const cls = t.highway;
    const roundabout = t.junction === "roundabout";
    const oneway = parseOneway(t);
    const reversed = t.oneway === "-1";
    const lanes = parseLanes(t, cls, oneway);
    const maxspeed = parseMaxspeed(t);

    const nids = way.nodes.filter((nid) => osmNodes.has(nid));
    if (nids.length < 2) continue;

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
      edges.push({
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
      });
      for (const nid of sliceIds) {
        if (!nodeToEdges.has(nid)) nodeToEdges.set(nid, []);
        nodeToEdges.get(nid).push(id);
      }
    }
  }
  edges.sort(cmpId);

  const nodes = [...graphNodeIds].sort(byNum).map((nid) => {
    const n = osmNodes.get(nid);
    return { id: `n${nid}`, x: round2(projX(n.lon)), y: round2(projY(n.lat)) };
  });
  const nodeIndex = new Map(nodes.map((n) => [n.id, n]));

  const degree = new Map();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  // 2. Signals, intersections, crossings
  const signalNodes = [];
  const crossingNodes = [];
  for (const [nid, n] of [...osmNodes.entries()].sort((a, b) => a[0] - b[0])) {
    const hw = n.tags?.highway;
    if (hw === "traffic_signals") signalNodes.push({ nid, n });
    if (hw === "crossing") crossingNodes.push({ nid, n });
  }

  const SIGNAL_RADIUS_M = 25;
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
      edgeId: onEdges[0] ?? null,
    };
  });

  // 3. Roundabouts (cluster contiguous roundabout edges)
  const rbUF = new UnionFind();
  const rbEdges = edges.filter((e) => e.roundabout);
  for (const e of rbEdges) rbUF.union(e.from, e.to);
  const rbClusters = new Map();
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

  // 4. Buildings — drivable-first descope (ADR-007): the visual program
  //    (doc 71) does its own footprint pass; the battery pins buildings: [].
  const buildings = [];

  // 5. Connected components
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

  // 6. Spawn points — quiet streets in the main component, spread apart
  //    (district-v1 rule; capped at 5 per the D2 spec's 3–5 band).
  const SPAWN_CLASSES = new Set(["residential", "living_street", "unclassified"]);
  const SPAWN_MIN_EDGE_LENGTH = 60;
  const SPAWN_MIN_SEPARATION = 150;
  const SPAWN_MAX = 5;

  const spawnCandidates = edges
    .filter(
      (e) =>
        SPAWN_CLASSES.has(e.class) &&
        !e.roundabout &&
        e.length >= SPAWN_MIN_EDGE_LENGTH &&
        inLargest.has(e.from),
    )
    .sort((a, b) => b.length - a.length || cmpId(a, b));

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

  // 7. Stats + meta (district-v1 provenance pattern, key-for-key)
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
      note: "Fields with *Source: 'default' were not tagged in OSM and use these Bulgarian urban defaults (ЗДвП чл. 21: 50 km/h urban, 20 km/h living zone). buildings[] is empty by ADR-007 (drivable-first; the visual pass is a separate program).",
    },
    source: {
      osmDataTimestamp: overpass.osm3s?.timestamp_osm_base ?? null,
      overpassGenerator: overpass.generator ?? null,
      cacheSha256: cacheSha256,
      pipeline: "tools/maps/build_district_d2.mjs v1 (the tools/osm/build.mjs transform; snapshot committed at tools/maps/data/)",
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

  // 8. Validation (district-v1 checks, verbatim)
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
  for (const c of crossings) {
    if (!finite(c.x) || !finite(c.y)) errors.push(`crossing ${c.id}: non-finite coords`);
    if (c.edgeId !== null && !edges.some((e) => e.id === c.edgeId))
      errors.push(`crossing ${c.id}: unresolved edgeId ${c.edgeId}`);
  }
  for (const s of spawnPoints) {
    if (!edges.some((e) => e.id === s.edgeId)) errors.push(`spawn ${s.id}: unresolved edgeId`);
    if (!finite(s.x) || !finite(s.y) || !finite(s.heading)) errors.push(`spawn ${s.id}: non-finite`);
  }
  for (const [label, arr] of [
    ["node", nodes],
    ["edge", edges],
  ]) {
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
  if (spawnPoints.length < 3) {
    errors.push(`only ${spawnPoints.length} spawn points — want 3-5 (adjust bbox or spawn rules)`);
  }

  // 9. Serialize (stable, diffable — district-v1 layout) + size check
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

  JSON.parse(out); // self-check

  const outBytes = Buffer.byteLength(out, "utf8");
  if (outBytes > MAX_OUTPUT_BYTES) {
    errors.push(
      `output ${(outBytes / 1024 / 1024).toFixed(2)} MB exceeds ${(MAX_OUTPUT_BYTES / 1024 / 1024).toFixed(1)} MB budget — shrink bbox`,
    );
  }

  // 10. Report
  const line = (k, v) => console.log(`  ${k.padEnd(34)} ${v}`);
  console.log(`\n=== D2 district build: ${DISTRICT.label} → ${OUT_ID} ===`);
  line("road length", `${stats.roadKm} km`);
  line("graph nodes", stats.nodes);
  line("graph edges", stats.edges);
  line("intersections (degree >= 3)", stats.intersections);
  line("  of which signalized", stats.signalizedIntersections);
  line("traffic signal nodes (raw)", stats.signalNodes);
  line("pedestrian crossings", stats.crossings);
  line("roundabouts", stats.roundabouts);
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

  writeFileSync(OUT_FILE, out);
  writeFileSync(PUBLISHED_FILE, out);
  console.log(`\nValidation OK. Wrote ${OUT_FILE}`);
  console.log(`             + published copy ${PUBLISHED_FILE}`);
}

async function main() {
  await ensureSnapshot(process.argv.includes("--fetch"));
  build();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
