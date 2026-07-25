#!/usr/bin/env node
/**
 * gen_exam_district_zones.mjs — the ZONE LAYER of the two OSM-derived districts
 * (audit M-15). ADR-006 stage 2a/2b + the curve-envelope slice, applied to REAL
 * Sofia topology instead of a hand-authored micro-map.
 *
 * THE FINDING. `district-v1` (free drive, Студентски град) and `d2-v1` (the
 * second exam district, Лозенец) shipped with no `zones` array at all, so a
 * family of codes was undetectable on the closest thing this product has to a
 * mock practical exam — and пресичане на плътна осева is a real examiner fail.
 * The finding was filed as needing „someone with Sofia street knowledge". It
 * does not: 87 of the 89 shipped maps are original parametric designs (their
 * own attribution says „оригинален параметричен дизайн, без данни от
 * OpenStreetMap"), and the two that are not — these — carry the answer in their
 * OWN provenance. This generator reads that provenance and writes the spans it
 * justifies.
 *
 * THE AUTHORING LAW (why every span below is auditable rather than arbitrary):
 *
 *   1. EVIDENCE FIRST. A span exists only where the cut carries positive
 *      evidence for it — an OSM tag on the host way, or a quantity measured
 *      from the committed geometry. Every row names its evidence. Where a kind
 *      has NO evidence in a cut, that cut gets no span of that kind: a district
 *      is allowed to be honest about what it does not contain.
 *   2. THE SIGN FOLLOWS THE EVIDENCE. The posting chosen for an evidence class
 *      is the one Bulgarian practice actually posts for that class, and the
 *      `signRef` records it (В24/В27/М1/BUS/А1).
 *   3. NO SPAN MAY TRAP A CORRECT DRIVE. Mid-block spans keep a junction margin
 *      at both ends so a legal turn is never inside one; a continuous facility
 *      (a bus lane) runs its true extent instead. The FP side is proved by
 *      battery, not by assertion: see
 *      platform/src/modules/sim/runtime/__tests__/exam-district-zones.test.ts.
 *   4. THE MAP RE-VALIDATES THE TABLE. Every row is checked against the LIVE
 *      district (edge exists, oneway/lane shape matches the kind's law, span
 *      inside the polyline) and — for d2, whose Overpass snapshot is committed
 *      (ADR-007's reproducibility clause) — against the ACTUAL OSM tags. A
 *      re-cut that moves an edge fails this generator loudly instead of leaving
 *      a stale span grading the wrong asphalt.
 *
 * WHAT IS DELIBERATELY *NOT* AUTHORED HERE, and why (the honest half of M-15):
 *
 *   - RAIL_CROSSING_VIOLATION. Neither cut contains a железопътен прелез.
 *     Лозенец does carry 8 `railway=tram_level_crossing` nodes (бул. Джеймс
 *     Баучер), and it would be easy to call those a `railCrossing` span — but
 *     an UNGUARDED railCrossing span imposes the ЗДвП чл. 51–53 mandatory full
 *     stop, a duty a tram crossing does NOT carry. That span would convict a
 *     lawful drive, which rule 3 forbids. The tram bed is authored for what it
 *     genuinely is instead: a В24 no-overtaking span (see the d2 table).
 *   - DRIVING_TOO_SLOW_FOR_MOTORWAY / EMERGENCY_LANE_DRIVING. Both need an
 *     АВТОМАГИСТРАЛА. Студентски град tops out at 50; Лозенец's fastest road is
 *     бул. Пейо К. Яворов, a 70 km/h grade-separated primary — a скоростен
 *     градски булевард, not a motorway, and OSM says so (`highway=primary`).
 *     Tagging it `motorway: true` to unlock a detector would invent a road.
 *   These three codes are DESIGN decisions on the original (fictional) maps
 *   instead, where they are already authored and shipped: mw-v1 / mw-entry-v1 /
 *   mw-exit-v1 carry `motorway` edges + `emergencyLane` spans, and
 *   rx-unguarded-v1 / rx-guarded-v1 / rx-drop-v1 / pk-rail-v1 carry
 *   `railCrossing` bands. The M-15 battery proves all three fire there through
 *   the real runtime, and that an innocent drive through the same spans does
 *   not convict.
 *
 * RUN ORDER (this is a POST-PASS — the base builders emit no `zones` key):
 *
 *     node tools/osm/build.mjs                 # rebuilds district-v1 (zones lost)
 *     node tools/maps/build_district_d2.mjs    # rebuilds d2-v1      (zones lost)
 *     node tools/maps/gen_exam_district_zones.mjs   # <- re-attaches the layer
 *
 * Deterministic and idempotent: the output is a pure function of the committed
 * district JSON (+ the committed d2 snapshot), so re-running it on a file that
 * already carries the layer reproduces it byte-for-byte. Writes both the
 * content/world master and the byte-identical platform/public/world copy.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Placement constants (rule 3 — no span may trap a correct drive)
// ---------------------------------------------------------------------------

/**
 * Junction margin kept at BOTH ends of a mid-block span, meters. The district
 * builder splits ways at junctions, so an edge's endpoints ARE junction mouths:
 * 25 m of clearance keeps the turn-in/turn-out sweep, the derived stop-line
 * setback and the В27 чл. 98 junction ban outside every authored span.
 */
const MIDBLOCK_MARGIN_M = 25;

/**
 * Curve-envelope thresholds (the curveAdvisory pass below).
 *  - DEMANDING: lateral acceleration through the arc AT THE POSTED LIMIT, above
 *    which the bend is worth an А1 + Т-table at all. 1.8 m/s² is where a
 *    learner feels the car load up and starts braking mid-arc — the SP-05
 *    lesson's whole subject.
 *  - COMFORT: the lateral acceleration an advisory plate is set for. Well under
 *    the dry adhesion limit BY DESIGN — the plate must survive a wet road.
 */
const CURVE_DEMANDING_LAT_MPS2 = 1.8;
const CURVE_COMFORT_LAT_MPS2 = 1.5;
/** А1 stands before the bend, and the envelope holds a little past its exit. */
const CURVE_LEAD_IN_M = 15;
const CURVE_RUN_OUT_M = 5;
/** Arc shorter than this is a junction kink in the OSM polyline, not a bend. */
const CURVE_MIN_ARC_M = 50;

/** signRef ↔ kind pairing law (gen_ban_zones.mjs's table, verbatim). */
const KIND_TO_SIGN = {
  noOvertaking: "В24",
  noStopping: "В27",
  noParking: "В28",
  solidCenterLine: "М1",
  busLane: "BUS",
  curveAdvisory: "А1",
};

const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// The authored table — one row per span, each carrying its evidence
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   id: string,
 *   kind: keyof typeof KIND_TO_SIGN,
 *   edgeId: string,
 *   span: "full" | "midblock",
 *   evidence: string,
 *   osmTag?: [string, string],
 * }} ZoneRow
 *
 * `span`:
 *   - "full"     — the facility runs the whole edge (a bus lane does not stop
 *                  at a junction mouth; neither does a tram bed).
 *   - "midblock" — MIDBLOCK_MARGIN_M clear of both junction mouths.
 * `osmTag` (d2 only): [key, value] re-checked against the COMMITTED snapshot
 *   tools/maps/data/d2-lozenets.json. Студентски град's snapshot lives in the
 *   disposable tools/osm/cache/, so its rows quote the tag in `evidence` and are
 *   verified against the built edge's own fields instead.
 */

/** @type {ZoneRow[]} */
const DISTRICT_V1_ZONES = [
  // -- BUS lanes (SN-05 → DRIVING_IN_BUS_LANE) -------------------------------
  // OSM way 672166607 / 672169336 / 672169337 (бул. „Свети Климент Охридски",
  // secondary, `oneway=yes`, `lanes=3`) all carry `bus:lanes = ||designated`:
  // three forward lanes, the LAST — i.e. the curb lane, laneId 0 — designated
  // for public transport. That is the district's own recorded truth, not an
  // inference, and it is the exact shape the busLane kind models.
  //
  // WHY THE FOURTH BUS WAY IS ABSENT. Way 672186635 (e672186635.0, 258 m) is
  // tagged `bus:lanes:backward = ||designated` — the designation exists on ONE
  // bank of a TWO-WAY road. A busLane span flags the curb lane of BOTH banks
  // (runtime/worldRuntime.ts: the flag names the lane's legality, the reducer's
  // laneId gate decides the fault), so authoring it would convict a car driving
  // lawfully in the curb lane of the OTHER direction. Rule 3 forbids it; the
  // half-truth is dropped rather than half-authored.
  {
    id: "dv1-bus-ohridski-1",
    kind: "busLane",
    edgeId: "e672169337.0",
    span: "full",
    evidence: "OSM way 672169337 `bus:lanes=||designated`, oneway, lanes=3 — curb lane is BUS",
  },
  {
    id: "dv1-bus-ohridski-2",
    kind: "busLane",
    edgeId: "e672169337.1",
    span: "full",
    evidence: "OSM way 672169337 (second junction split) `bus:lanes=||designated`",
  },
  {
    id: "dv1-bus-ohridski-3",
    kind: "busLane",
    edgeId: "e672169336.0",
    span: "full",
    evidence: "OSM way 672169336 `bus:lanes=||designated`, oneway, lanes=3",
  },
  {
    id: "dv1-bus-ohridski-4",
    kind: "busLane",
    edgeId: "e672166607.0",
    span: "full",
    evidence: "OSM way 672166607 `bus:lanes=||designated`, oneway, lanes=3",
  },
  // -- Solid осева (OV-04/SN-03 → CROSSED_SOLID_LINE) ------------------------
  // OSM way 718268829 (бул. „Свети Климент Охридски", secondary, `lanes=4`,
  // two-way): 2+2 opposing flows. Наредба № 2 separates opposing MULTI-LANE
  // carriageways with a continuous осева mid-block — an overtake here would use
  // an oncoming THROUGH lane, which is exactly what the М1 exists to forbid.
  // The edge runs junction-to-junction with no intersection along it (the
  // builder splits ways at junctions), so no left turn can occur inside the
  // span — the structural guarantee behind rule 3 on this row.
  {
    id: "dv1-m1-ohridski",
    kind: "solidCenterLine",
    edgeId: "e718268829.0",
    span: "midblock",
    evidence: "OSM way 718268829 lanes=4 two-way — 2+2 opposing flows, continuous осева mid-block",
  },
];

/** @type {ZoneRow[]} */
const D2_V1_ZONES = [
  // -- В27 (PK-06 → ILLEGAL_STOP_IN_BAN_ZONE) --------------------------------
  // Both rows are the same evidence class: a 70 km/h carriageway that OSM
  // records as having NO shoulder (`shoulder=no`), one of them on a viaduct
  // (`bridge=viaduct`). There is physically nowhere to stand, which is why a
  // Bulgarian traffic engineer posts В27 („забранени са престоят и
  // паркирането") over such a structure rather than В28 — the stricter sign is
  // the one the geometry earns.
  {
    id: "d2-v27-yavorov-viaduct",
    kind: "noStopping",
    edgeId: "e286852750.0",
    span: "midblock",
    evidence: "бул. Пейо К. Яворов viaduct — 70 km/h, no shoulder, no refuge",
    osmTag: ["bridge", "viaduct"],
  },
  {
    id: "d2-v27-vaptsarov",
    kind: "noStopping",
    edgeId: "e248750628.0",
    span: "midblock",
    evidence: "бул. Никола Й. Вапцаров — 70 km/h, `shoulder=no`, `parking:both=no`",
    osmTag: ["shoulder", "no"],
  },
  // -- В24 (OV-06 → OVERTAKING_IN_BAN_ZONE) ----------------------------------
  // The three бул. „Джеймс Баучер" ways carry `embedded_rails = tram` with
  // `embedded_rails:lanes` placing the tram in the INNER lanes („|tram|tram|"):
  // one general lane per direction with the tram body between them. Overtaking
  // there means driving onto the tram bed, which is precisely the situation В24
  // is posted for. The three edges chain end-to-end (n1116876739 → n1116876826
  // → n1116876709 → n4556232302), so the ban is one continuous corridor and
  // each row takes its full edge.
  {
    id: "d2-v24-baucher-1",
    kind: "noOvertaking",
    edgeId: "e1459492610.0",
    span: "full",
    evidence: "бул. Джеймс Баучер — tram bed in the inner lanes; a pass would use the tram body",
    osmTag: ["embedded_rails", "tram"],
  },
  {
    id: "d2-v24-baucher-2",
    kind: "noOvertaking",
    edgeId: "e1115502712.0",
    span: "full",
    evidence: "бул. Джеймс Баучер — tram bed in the inner lanes (middle leg of the corridor)",
    osmTag: ["embedded_rails", "tram"],
  },
  {
    id: "d2-v24-baucher-3",
    kind: "noOvertaking",
    edgeId: "e1056871742.0",
    span: "full",
    evidence: "бул. Джеймс Баучер — tram bed in the inner lanes (south leg of the corridor)",
    osmTag: ["embedded_rails", "tram"],
  },
  // -- Solid осева (OV-04/SN-03 → CROSSED_SOLID_LINE) ------------------------
  // OSM way 193362542 (бул. „Драган Цанков", `lanes=4` with `lanes:forward=2` /
  // `lanes:backward=2`): the district's longest 2+2 two-way edge at 636 m, with
  // no junction along it. Same Наредба № 2 reasoning as the district-v1 row,
  // and the same structural guarantee that no left turn falls inside the span.
  {
    id: "d2-m1-tsankov",
    kind: "solidCenterLine",
    edgeId: "e193362542.0",
    span: "midblock",
    evidence: "OSM way 193362542 lanes:forward=2 / lanes:backward=2 — 2+2 opposing flows",
    osmTag: ["lanes", "4"],
  },
];

// ---------------------------------------------------------------------------
// Derived pass: curveAdvisory (SP-05 → SPEED_TOO_FAST_FOR_CURVE)
// ---------------------------------------------------------------------------

/**
 * MEASURED, not authored. The Overpass cuts carry the real Sofia polylines, so
 * the bends are in the data — the generator finds them instead of a human
 * guessing which street „feels curvy":
 *
 *   1. resample the edge polyline every 2 m and take the heading over a 12 m
 *      baseline (short enough to see a real bend, long enough to ignore the
 *      1-decimetre rounding in the committed coordinates);
 *   2. group consecutive samples that turn the SAME way into one arc, and keep
 *      arcs at least CURVE_MIN_ARC_M long — a shorter run is a junction kink;
 *   3. the arc's radius is its length over its total heading change;
 *   4. author it only if the bend is genuinely demanding at the posted limit
 *      (lateral >= CURVE_DEMANDING_LAT_MPS2) AND the comfortable speed, floored
 *      to the 10 km/h step a Т-table is printed in, lands at least 10 km/h
 *      under the posted limit. A plate that repeats the limit teaches nothing.
 *
 * The advisory binds BELOW the posted limit by design (catalog.ts
 * SPEED_TOO_FAST_FOR_CURVE) — that is the whole point of SP-05: every urban 50
 * zone has bends that cannot be taken at 50, and until now nothing graded them.
 */
function resamplePolyline(geometry, stepM) {
  const out = [{ s: 0, x: geometry[0][0], y: geometry[0][1] }];
  let s = 0;
  for (let i = 1; i < geometry.length; i++) {
    const [x0, y0] = geometry[i - 1];
    const [x1, y1] = geometry[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (seg < 1e-9) continue;
    for (let u = stepM; u < seg; u += stepM) {
      out.push({ s: s + u, x: x0 + ((x1 - x0) * u) / seg, y: y0 + ((y1 - y0) * u) / seg });
    }
    s += seg;
    out.push({ s, x: x1, y: y1 });
  }
  return out;
}

const normDeg = (d) => {
  let v = d;
  while (v > 180) v -= 360;
  while (v < -180) v += 360;
  return v;
};

/** Sustained same-direction arcs of an edge polyline (step 2 above). */
function sustainedArcs(edge) {
  const pts = resamplePolyline(edge.geometry, 2);
  const BASELINE = 6; // samples = 12 m heading baseline
  if (pts.length < BASELINE + 3) return [];
  const headings = [];
  for (let i = 0; i + BASELINE < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + BASELINE];
    headings.push({ s: (a.s + b.s) / 2, h: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI });
  }
  const arcs = [];
  let i = 0;
  while (i < headings.length - 1) {
    const dir = Math.sign(normDeg(headings[i + 1].h - headings[i].h));
    if (dir === 0) {
      i++;
      continue;
    }
    let j = i;
    let turnDeg = 0;
    while (j < headings.length - 1) {
      const d = normDeg(headings[j + 1].h - headings[j].h);
      // A sub-degree wobble the other way is coordinate rounding, not a
      // reversal — only a real counter-turn closes the arc.
      if (Math.sign(d) !== dir && Math.abs(d) > 0.3) break;
      turnDeg += d;
      j++;
    }
    const lenM = headings[j].s - headings[i].s;
    const turnRad = (Math.abs(turnDeg) * Math.PI) / 180;
    if (turnRad > 0.15 && lenM >= CURVE_MIN_ARC_M) {
      arcs.push({ fromM: headings[i].s, toM: headings[j].s, lenM, radiusM: lenM / turnRad });
    }
    i = j;
  }
  return arcs;
}

/** Every curveAdvisory span the rule produces on one district, in edge order. */
function deriveCurveZones(district, idPrefix) {
  const rows = [];
  for (const edge of district.roads.edges) {
    // Roundabouts carry their own priority lesson and service aisles are
    // parking geometry, not roads a Т-table is posted on.
    if (edge.roundabout || edge.class === "service") continue;
    for (const arc of sustainedArcs(edge)) {
      const posted = edge.maxspeed;
      const latAtPosted = posted ** 2 / (3.6 ** 2 * arc.radiusM);
      if (latAtPosted < CURVE_DEMANDING_LAT_MPS2) continue;
      const comfortKmh = 3.6 * Math.sqrt(CURVE_COMFORT_LAT_MPS2 * arc.radiusM);
      const advisoryKmh = Math.floor(comfortKmh / 10) * 10;
      if (advisoryKmh < 20 || advisoryKmh > posted - 10) continue;
      rows.push({
        id: `${idPrefix}-a1-${edge.id.replace(/[^0-9]/g, "")}`,
        kind: "curveAdvisory",
        edgeId: edge.id,
        fromM: r2(Math.max(0, arc.fromM - CURVE_LEAD_IN_M)),
        toM: r2(Math.min(edge.length, arc.toM + CURVE_RUN_OUT_M)),
        signRef: KIND_TO_SIGN.curveAdvisory,
        advisoryKmh,
        // Kept out of the emitted JSON — used by the report + the self-checks.
        _why: `measured arc ${arc.lenM.toFixed(0)} m, R≈${arc.radiusM.toFixed(0)} m; ${latAtPosted.toFixed(2)} m/s² at the posted ${posted}`,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Table → zones (span resolution + the shape laws of each kind)
// ---------------------------------------------------------------------------

/**
 * Shape laws — the geometry a kind NEEDS in order to teach instead of trap:
 *  - solidCenterLine: a two-way host (an осева exists only between opposing
 *    banks) with >= 4 marked lanes, so an excursion is into an oncoming
 *    THROUGH lane rather than a wobble on a village centre line;
 *  - busLane: >= 2 lanes in the vehicle's bank, so refusing the bus lane still
 *    leaves the car a legal lane (the reducer's own laneCount guard, mirrored
 *    into the data so a degenerate span never ships);
 *  - noOvertaking: >= 2 lanes in the bank, because OV-06 rides the lane-change
 *    signal — with one lane per direction there is no same-direction change to
 *    grade and the span would be inert;
 *  - noStopping / curveAdvisory: no shape requirement.
 */
function checkShape(kind, edge) {
  const lanesPerDir = edge.oneway ? Math.max(1, edge.lanes) : Math.max(1, Math.floor(edge.lanes / 2));
  if (kind === "solidCenterLine") {
    if (edge.oneway) return "solidCenterLine needs a TWO-WAY host (no осева on a one-way carriageway)";
    if (edge.lanes < 4) return `solidCenterLine wants >= 4 marked lanes, got ${edge.lanes}`;
    return null;
  }
  if (kind === "busLane" || kind === "noOvertaking") {
    if (lanesPerDir < 2) return `${kind} needs >= 2 lanes per direction, got ${lanesPerDir}`;
    return null;
  }
  return null;
}

function resolveRow(row, edge) {
  const fromM = row.span === "full" ? 0 : MIDBLOCK_MARGIN_M;
  const toM = row.span === "full" ? edge.length : edge.length - MIDBLOCK_MARGIN_M;
  return {
    id: row.id,
    kind: row.kind,
    edgeId: row.edgeId,
    fromM: r2(fromM),
    toM: r2(toM),
    signRef: KIND_TO_SIGN[row.kind],
    _why: row.evidence,
  };
}

/**
 * Build the zone layer of one district: the authored table + the derived curve
 * pass, fully self-validated. Throws on the first structural problem — a
 * generator that can emit a bad span is worse than no generator.
 */
function buildZoneLayer({ districtId, idPrefix, table, snapshotTags }) {
  const file = path.join(REPO_ROOT, "content", "world", `${districtId}.json`);
  const district = JSON.parse(readFileSync(file, "utf8"));
  const edgeById = new Map(district.roads.edges.map((e) => [e.id, e]));
  const errors = [];

  const zones = [];
  for (const row of table) {
    const edge = edgeById.get(row.edgeId);
    if (!edge) {
      errors.push(`${row.id}: edge ${row.edgeId} is not in ${districtId} — the cut was regenerated`);
      continue;
    }
    // Rule 4, tag half: for the district whose Overpass snapshot is committed,
    // the evidence is re-read from the source rather than trusted.
    if (row.osmTag && snapshotTags) {
      const wayId = row.edgeId.slice(1).split(".")[0];
      const tags = snapshotTags.get(wayId);
      const [key, value] = row.osmTag;
      if (!tags) errors.push(`${row.id}: OSM way ${wayId} is not in the committed snapshot`);
      else if (tags[key] !== value) {
        errors.push(`${row.id}: OSM way ${wayId} has ${key}=${tags[key] ?? "(absent)"}, table claims ${value}`);
      }
    }
    const shapeError = checkShape(row.kind, edge);
    if (shapeError) errors.push(`${row.id} (${row.edgeId}): ${shapeError}`);
    if (row.span === "midblock" && edge.length <= 2 * MIDBLOCK_MARGIN_M + 20) {
      errors.push(
        `${row.id}: edge ${row.edgeId} is ${edge.length} m — too short for a mid-block span with ${MIDBLOCK_MARGIN_M} m margins`,
      );
      continue;
    }
    zones.push(resolveRow(row, edge));
  }

  for (const row of deriveCurveZones(district, idPrefix)) zones.push(row);

  // -- Self-validation (gen_ban_zones.mjs's zone invariants, verbatim).
  const seen = new Set();
  for (const z of zones) {
    const edge = edgeById.get(z.edgeId);
    if (seen.has(z.id)) errors.push(`${z.id}: duplicate zone id`);
    seen.add(z.id);
    if (!edge) errors.push(`${z.id}: unknown edgeId ${z.edgeId}`);
    else if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= edge.length + 0.01)) {
      errors.push(`${z.id}: span [${z.fromM}, ${z.toM}] outside 0..${edge.length}`);
    }
    if (KIND_TO_SIGN[z.kind] !== z.signRef) errors.push(`${z.id}: signRef ${z.signRef} does not post ${z.kind}`);
    if (z.kind === "curveAdvisory" && !(z.advisoryKmh > 0 && z.advisoryKmh <= (edge?.maxspeed ?? 0) - 10)) {
      errors.push(`${z.id}: advisory ${z.advisoryKmh} must be >= 10 km/h under the posted limit`);
    }
  }
  // Two spans of the SAME kind on the same edge would double-post one sign and
  // make the debrief ambiguous; overlapping spans of DIFFERENT kinds are legal
  // (a В24 inside an М1 stretch is real) and compose in the runtime.
  const byEdgeKind = new Map();
  for (const z of zones) {
    const key = `${z.edgeId}|${z.kind}`;
    if (byEdgeKind.has(key)) errors.push(`${z.id}: a second ${z.kind} span on ${z.edgeId}`);
    byEdgeKind.set(key, z);
  }
  if (errors.length > 0) {
    throw new Error(`gen_exam_district_zones (${districtId}) FAILED:\n  - ${errors.join("\n  - ")}`);
  }

  // Stable order: by edge id, then span start — diffable, and independent of
  // the order the table happens to be written in.
  zones.sort((a, b) => (a.edgeId === b.edgeId ? a.fromM - b.fromM : a.edgeId < b.edgeId ? -1 : 1));
  return { file, district, zones };
}

// ---------------------------------------------------------------------------
// Serialization — the district-v1 layout (tools/osm/build.mjs §9), preserved
// ---------------------------------------------------------------------------

function recordsBlock(arr) {
  if (arr.length === 0) return "[]";
  return "[\n    " + arr.map((r) => JSON.stringify(r)).join(",\n    ") + "\n  ]";
}

function serialize(district, zones) {
  // meta gains exactly one key — the ADR-006 version marker — appended so the
  // rest of meta stays byte-identical to what the base builder emitted.
  const meta = { ...district.meta, zonesVersion: 1 };
  const emitted = zones.map(({ _why, ...z }) => z);
  return (
    "{\n" +
    `  "format": "district-v1",\n` +
    `  "meta": ${JSON.stringify(meta, null, 2).split("\n").join("\n  ")},\n` +
    `  "roads": {\n` +
    `    "nodes": ${recordsBlock(district.roads.nodes).split("\n").join("\n  ")},\n` +
    `    "edges": ${recordsBlock(district.roads.edges).split("\n").join("\n  ")}\n` +
    `  },\n` +
    `  "intersections": ${recordsBlock(district.intersections)},\n` +
    `  "crossings": ${recordsBlock(district.crossings)},\n` +
    `  "roundabouts": ${recordsBlock(district.roundabouts)},\n` +
    `  "buildings": ${recordsBlock(district.buildings)},\n` +
    `  "spawnPoints": ${recordsBlock(district.spawnPoints)},\n` +
    `  "zones": ${recordsBlock(emitted)}\n` +
    "}\n"
  );
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/** Way-id → tags of the COMMITTED d2 Overpass snapshot (ADR-007). */
function loadD2SnapshotTags() {
  const snapshot = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "tools", "maps", "data", "d2-lozenets.json"), "utf8"),
  );
  const tags = new Map();
  for (const el of snapshot.overpass.elements) {
    if (el.type === "way" && el.tags) tags.set(String(el.id), el.tags);
  }
  return tags;
}

const TARGETS = [
  { districtId: "district-v1", idPrefix: "dv1", table: DISTRICT_V1_ZONES, snapshotTags: null },
  { districtId: "d2-v1", idPrefix: "d2", table: D2_V1_ZONES, snapshotTags: loadD2SnapshotTags() },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(30)} ${v}`);

for (const target of TARGETS) {
  const { file, district, zones } = buildZoneLayer(target);
  const out = serialize(district, zones);
  JSON.parse(out); // JSON validity self-check

  const publicFile = path.join(REPO_ROOT, "platform", "public", "world", `${target.districtId}.json`);
  writeFileSync(file, out);
  writeFileSync(publicFile, out); // byte-identical publish (the fleet law)

  console.log(`\n=== zone layer: ${target.districtId} (${district.meta.label}) ===`);
  for (const z of zones) {
    const span = `[${z.fromM}, ${z.toM}] m`;
    const advisory = z.advisoryKmh ? ` @ ${z.advisoryKmh} km/h` : "";
    line(`${z.signRef} ${z.kind}`, `${z.edgeId} ${span}${advisory}`);
    line("", `↳ ${z._why}`);
  }
  line("zones / zonesVersion", `${zones.length} / 1`);
  line("output", `${file} (+ public copy)`);
}
console.log("\nValidation OK.");
