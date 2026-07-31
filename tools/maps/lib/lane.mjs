/**
 * lane.mjs — where a spawn pose actually belongs.
 *
 * doc 87 T2 (founder rows B23 / B26 / B28 / B33). Every generator in this
 * folder authored its spawn poses "on the road centerline of the host edge,
 * facing the junction" — a convention that reads harmlessly in a generator and
 * is a lie on screen: the student's car is HANDED to him straddling the осева,
 * 4.06 m out of the lane he is being graded in. He then drives straight ahead
 * at the taught speed and, 3.5 s later, the rule engine convicts him of
 * «Настъпване на осевата линия» for a pose he never chose. Four of four
 * straight-line drives in the founder review ended in that pause modal.
 *
 * The runtime's own lane arithmetic is in
 * platform/src/modules/sim/runtime/locator.ts (computeLane) over
 * LANE_WIDTH_M = 3.25 × PERCEPTUAL_ROAD_SCALE. This module is the generator
 * side of that same truth, so a map and the grader cannot drift:
 *
 *   two-way : lanesPerDir = max(1, floor(lanes / 2)); the CURB lane (laneId 0)
 *             sits (lanesPerDir − 0.5) × W to the right of the centreline.
 *   one-way : the carriageway is centred on the centreline, so the curb lane
 *             sits (lanes − 1) / 2 × W to the right.
 *
 * "Right" is right of the SPAWN HEADING (bearing degrees, 0 = +Y, 90 = +X) —
 * right-hand traffic, so a pose facing the other way down the same edge moves
 * to the other side of the paint.
 */

/** platform/src/modules/sim/runtime/spatial.ts PERCEPTUAL_ROAD_SCALE. */
export const PERCEPTUAL_ROAD_SCALE = 2.5;
/** platform/src/modules/sim/runtime/spatial.ts LANE_WIDTH_M. */
export const LANE_WIDTH_M = 3.25 * PERCEPTUAL_ROAD_SCALE;

/** Right-of-heading offset, m, of the curb lane's centre on such an edge. */
export function curbLaneOffsetM(lanes, oneway = false) {
  const n = Math.max(1, lanes);
  if (oneway) return (LANE_WIDTH_M * (n - 1)) / 2;
  return LANE_WIDTH_M * (Math.max(1, Math.floor(n / 2)) - 0.5);
}

/**
 * Every lane centre available to a car facing along this edge, as right-of-
 * heading offsets, curb lane first. A pose sitting on one of these is a
 * DELIBERATE lane choice (mw-v1's cruise lane, ov-keepright's left lane,
 * mw-exit's left-lane exit); a pose sitting between them is out of position.
 */
export function laneCentreOffsetsM(lanes, oneway = false) {
  const n = Math.max(1, lanes);
  const first = curbLaneOffsetM(n, oneway);
  const perDir = oneway ? n : Math.max(1, Math.floor(n / 2));
  const out = [];
  for (let k = 0; k < perDir; k += 1) out.push(first - k * LANE_WIDTH_M);
  return out;
}

/**
 * Move a centreline point onto the curb lane centre for a car facing
 * `headingDeg`. Returns `[x, y]` rounded to cm (the generators' r2 grain).
 *
 * A pose that is DELIBERATELY not in the curb lane — the motorway cruise lane,
 * ov-keepright's left lane, rb-2lane's inner lane, mw-exit's left-lane exit —
 * must not go through here; those poses ARE the lesson.
 */
export function laneCentre(x, y, headingDeg, { lanes = 2, oneway = false } = {}) {
  const h = (headingDeg * Math.PI) / 180;
  const off = curbLaneOffsetM(lanes, oneway);
  const rx = Math.cos(h);
  const ry = -Math.sin(h);
  const r2 = (n) => Math.round(n * 100) / 100;
  return [r2(x + rx * off), r2(y + ry * off)];
}

/** Nearest point on a polyline to (x, y). */
function nearestOnPolyline(geometry, x, y) {
  let best = null;
  for (let i = 0; i + 1 < geometry.length; i += 1) {
    const [ax, ay] = geometry[i];
    const [bx, by] = geometry[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    let t = ((x - ax) * dx + (y - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (best === null || d < best.d) best = { d, px, py };
  }
  return best;
}

/**
 * platform/src/modules/sim/world/builders/constants.ts MARKED_CLASSES — the
 * classes whose carriageway the marking pass actually paints. An unpainted
 * class (`service`, `track`, a parking aisle, the полигон's aprons) has no
 * lane to sit in and no осева to straddle, so a pose there is left alone.
 */
const MARKED_CLASSES = new Set([
  "motorway",
  "trunk",
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

/**
 * Does the marking pass paint lanes on this road class? A generator that
 * VALIDATES its spawn poses against `curbLaneOffsetM` has to ask this first:
 * `toCurbLane` deliberately leaves a pose on an unpainted class exactly where
 * the author put it (there is no lane to sit in), so a validator that demands
 * a curb-lane offset anyway rejects the very poses this module just approved.
 *
 * That is not hypothetical — gen_parking_lot.mjs could not regenerate its own
 * four committed districts: its aisle finish pose sits on the `service`
 * centreline (correctly), and the post-check measured it against a 4.06 m
 * two-lane curb offset and threw. Exported so the check and the fixer read the
 * same set.
 */
export function isMarkedRoadClass(roadClass) {
  return MARKED_CLASSES.has(roadClass);
}

/**
 * THE one-liner every generator ends its spawn list with. A pose that already
 * sits on SOME lane centre is left untouched — those are deliberate, and which
 * lane a drill starts in is the lesson (mw-v1 cruise lane, ov-keepright's left
 * lane, mw-exit's left-lane exit, rb-2lane's inner lane). A pose that sits
 * BETWEEN lanes — overwhelmingly on the centreline, the old convention — is
 * moved into the curb lane for its own heading.
 *
 * Idempotent, so re-running a generator over an already-fixed district is a
 * no-op, and a NEW arm authored the old way is corrected the moment it ships.
 */
export function toCurbLane(spawnPoints, edges) {
  const byId = new Map(edges.map((e) => [e.id, e]));
  return spawnPoints.map((s) => {
    const e = s.edgeId ? byId.get(s.edgeId) : null;
    if (!e || !Array.isArray(e.geometry)) return s;
    if (!MARKED_CLASSES.has(e.class)) return s;
    if (Math.max(1, e.lanes ?? 2) < 2) return s;
    const near = nearestOnPolyline(e.geometry, s.x, s.y);
    if (!near) return s;
    const h = ((s.heading ?? 0) * Math.PI) / 180;
    const off = (s.x - near.px) * Math.cos(h) + (s.y - near.py) * -Math.sin(h);
    const centres = laneCentreOffsetsM(e.lanes, e.oneway);
    if (centres.some((c) => Math.abs(off - c) <= 1)) return s;
    // Outboard of the curb lane = parked at the kerb or staged on the verge
    // (pk-double's bay pose). Only a car sitting INBOARD of its own lane —
    // between lanes, on the осева — is out of position.
    if (off > centres[0]) return s;
    const [x, y] = laneCentre(near.px, near.py, s.heading ?? 0, { lanes: e.lanes, oneway: e.oneway });
    return { ...s, x, y };
  });
}
