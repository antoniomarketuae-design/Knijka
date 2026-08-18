/**
 * PAINT-TRUTH battery for builders/markings.ts — sweep-161 audit follow-up.
 *
 * Six BROKEN findings were routed here, and all six say the same thing in
 * different words: „the lesson names a marking the world does not have".
 * Read off the frames they cite:
 *   sc-ov-lane-keeping  (critical) „no centre line and no lane lines"
 *   sc-ov-keep-right              „its sibling carries none at all"
 *   sc-junction-left              „no stop line is painted anywhere"
 *   sc-junction-blind             „a bare grey asphalt blob"
 *   sc-jx-blocked-exit            „the only junction with a painted stop line"
 *
 * Five of the six are refuted by the built mesh — the paint IS there, measured
 * below to the centimetre — and the sixth (the junction mouths) had a real
 * cause in this file. A refutation that lives only in a report is worth
 * nothing the next time somebody squints at a screenshot, so every one of them
 * is a test here: each asserts, from the quads the builder actually emits, the
 * exact marking whose absence was reported.
 *
 * Every claim is paired with its opposite so no assertion can be satisfied by
 * painting more: the две равнозначни junctions must carry NO transverse line
 * (ЗДвП чл. 50 — priority to the right, no М7 anywhere), and the dash counts
 * must equal the fixed-pitch walk's, so re-spacing the rhythm cannot smuggle
 * in extra paint.
 *
 * That sentence was FALSE AS WRITTEN for one wave and is worth reading twice
 * before trusting the rest. When the instrument above was rebuilt, three
 * assertions were re-expressed in terms the rewritten reader could serve, and
 * each of the three quietly stopped being able to fail — the file went green,
 * the paint was fine, and nothing guarded it. An adversarial re-read found all
 * three by construction, not by argument; §3 now carries the constructions
 * themselves, so „this check is real" is a check. What went wrong, in one line
 * each, because it is the same mistake three times:
 *
 *   the reader identified a dash BY ITS OWN LENGTH ALONE (`dashesOn`: quads
 *   5.000 m ± 1 mm) and asserted position from the quad CENTROID alone. A
 *   centroid is invariant under rotation, so every lateral claim became
 *   unfalsifiable; a length filter is blind to paint of any other length, so
 *   every „and nothing else" claim became unfalsifiable too.
 *
 * Both readings are still taken — they are exact and they are what pins the
 * paint to the millimetre — but no claim rests on them alone any more: lateral
 * claims are made on the CORNERS (`tLo`/`tHi`, `cornerSpread`) and „nothing
 * else" claims on a CENSUS OF EVERY QUAD (`censusOnEdge`), never on the dash
 * filter that found the paint in the first place.
 *
 * ── THE INSTRUMENT, and why it is written the way it is ────────────────────
 * This file shipped RED: fifteen of its twenty-eight tests failed the first
 * time anybody ran it, and FOURTEEN of the fifteen were the MEASUREMENT and
 * not the paint. Every one lied in the direction of „there is a defect here",
 * which is the mirror of the reassuring instrument bugs this project keeps
 * finding — and just as expensive, because a false alarm sends someone to
 * change working paint. The three faults, each fixed at its site below:
 *
 *  1. the point collector claimed every vertex within 30 m of an edge, so a
 *     COLLINEAR OPPOSITE ARM's dashes and a CROSS STREET's edge lines arrived
 *     as this edge's paint, clamped onto its endpoint. That alone produced the
 *     „trailing margin −17.93 m" reading on jx-equal-v1. Ownership is now
 *     „nearest edge, projecting onto its interior" — see `resolveOwned`;
 *  2. the dash counter clustered VERTICES with a gap threshold of
 *     DASH_LENGTH_M / 2 = 2.5 m, while a dash quad's OWN two ends are
 *     DASH_LENGTH_M = 5.0 m apart. Every dash was therefore counted twice: 46
 *     for the 23 ov-lane-v1 carries, 16 for 8, 22 for 11. The whole battery now
 *     reads QUADS out of the index buffer — see `readQuads` / `dashesOn`;
 *  3. the zebra reader took „the first four vertices near the crossing", and
 *     buildMarkings paints lane lines BEFORE zebras, so it measured the axis
 *     of a dashed осева and would have reported 0° for every skew. It now
 *     measures the paint the crossing ADDS — see `crossingPaint`.
 *
 * The fifteenth failure was real and belonged to none of the three: two
 * fixtures here omitted `intersections` / `roundabouts` / `spawnPoints`,
 * `assertDistrict` never checked those fields although `District` declares them
 * required, and the build died 300 lines away inside `analyzeNetwork`. The
 * guard is fixed in world/types.ts and pinned by its own describe block at the
 * foot of this file. The same never-run fixtures also authored a crossing
 * `kind` that does not exist, so the zebra tests were grading paint the builder
 * had correctly declined to lay.
 *
 * ── WHAT EACH ASSERTION HERE ACTUALLY DEFENDS ──────────────────────────────
 * A green battery proves nothing on its own — this one was green on its own
 * doubled dash counts for as long as nobody ran it. Every claim below was
 * therefore driven backwards: the thing it protects was broken in the SOURCE,
 * one change at a time, and the named tests went red. Reproduce any line by
 * making that edit and running this file.
 *
 *   markings.dashStations → old fixed-pitch walk .... 6 „leading === trailing"
 *   markings.dashStations → one dash FEWER .......... 14, incl. every count
 *   markings.dashStations → one dash MORE ........... 9, incl. every count
 *   markings.paintStopLine `from` → −outer .......... the М7 incoming-half test
 *   markings.paintStopLine `base` → ap.cut .......... the М7 arclength test
 *   markings lane loop → осева at DASH_WIDTH_M ...... both осева-stroke tests
 *   markings ZEBRA_MAX_SKEW_DEG 60 → 89 ............. the skew-90 quad ceiling
 *   markings ZEBRA_MAX_SKEW_DEG 60 → 0 .............. both skew tests
 *   markings paintZebra → barDir = roadDir .......... both skew tests
 *   types.assertDistrict → drop the `intersections` row ... the refusal test
 *   types.assertDistrict → refuse any map over 3 edges .... the corpus test
 *
 * The last two are the pair that matters most: one proves the guard convicts a
 * broken document, the other proves it still acquits all 105 real ones.
 *
 * And the three the weakened wave could NOT convict. Each was run against this
 * file as it stood — 31/31 GREEN on every one — and against it as it stands:
 *
 *   paintDashedLine → turn every dash 10° off the axis
 *       was: 31/31 green, corners 0.619 m out, „ON THE AXIS" passing
 *       now: RED — осева corner 0.619 m vs the 0.302 m the bend allows,
 *            ov-keepright divider corner 0.557 m vs 0.125 m
 *   paintDashedLine → turn every dash 15° off the axis
 *       was: 31/31 green, corners 0.828 m out — 4.4× the осева's half-stroke
 *       now: RED, same two assertions
 *   paintDashedLine → one 3.0 m dash centred on a run that fits none
 *       was: 31/31 green, a 3 m осева painted s = 2.50…5.50 m of an 8 m stub,
 *            under a test titled „must not invent the stub's first dash"
 *       now: RED — the stub carries paint at |t| < 1 m
 *   lane loop → one extra dashed line at t = +4.06 m in 4.00 m dashes
 *       was: 31/31 green, 25 phantom dashes on ov-lane-v1 beside the 23 real
 *            ones, markingQuads 103 → 128, a lane boundary down the middle of
 *            the lane the student is being taught to hold
 *       now: RED — 25 unclassified quads on ov-lane-v1, 30 on ov-keepright-v1
 *
 * Reproduce them the same way as the rows above: make the edit in markings.ts
 * and run this file. §3 also carries each one as a MESH-level mutation that
 * needs no edit at all.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertDistrict, type District } from "../../types";
import {
  DASH_GAP_M,
  DASH_LENGTH_M,
  LANE_WIDTH_M,
  STOP_LINE_WIDTH_M,
  ZEBRA_LENGTH_M,
  CENTER_LINE_WIDTH_M,
  DASH_WIDTH_M,
  EDGE_LINE_WIDTH_M,
  EDGE_LINE_INSET_M,
} from "../constants";
import {
  add,
  mul,
  norm,
  perpRight,
  pointAlong,
  polylineLength,
  projectOntoPolyline,
  sub,
  trimPolyline,
  type Vec2,
} from "../math2d";
import { buildMarkings, type MarkingBuildResult } from "../markings";
import {
  analyzeNetwork,
  junctionPriorityControls,
  STOP_LINE_BEYOND_CUT_M,
  type RoadNetwork,
} from "../network";

// ---------------------------------------------------------------------------
// harness
// ---------------------------------------------------------------------------

/** content/world — the committed district corpus, from either cwd vitest uses. */
const WORLD_DIR = [
  path.join(process.cwd(), "content", "world"),
  path.resolve(process.cwd(), "..", "content", "world"),
].find((dir) => fs.existsSync(dir));

function load(id: string): District {
  if (!WORLD_DIR) throw new Error("content/world not found from " + process.cwd());
  const file = path.join(WORLD_DIR, `${id}.json`);
  if (!fs.existsSync(file)) throw new Error(`${file} not found`);
  return assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")));
}

/**
 * The Б1/Б2 approach keys buildMarkings is fed in production. Derived from
 * `junctionPriorityControls` — the SAME call builders/props.ts makes, skipping
 * signalized nodes exactly as it does — so this battery grades the painter on
 * the sets it really receives rather than on invented ones.
 */
function priorityKeys(net: RoadNetwork): { stop: Set<string>; give: Set<string> } {
  const stop = new Set<string>();
  const give = new Set<string>();
  for (const node of net.nodes.values()) {
    if (node.signalized) continue;
    const controls = junctionPriorityControls(
      node.approaches.map((ap) => ({
        edgeId: ap.edgeId,
        class: ap.edge.class,
        incoming: ap.incoming,
        roundabout: ap.edge.roundabout,
      })),
    );
    for (const [edgeId, control] of controls) {
      (control === "stopSign" ? stop : give).add(`${node.id}:${edgeId}`);
    }
  }
  return { stop, give };
}

interface Built {
  district: District;
  net: RoadNetwork;
  markings: MarkingBuildResult;
}

function build(source: string | District): Built {
  const district = typeof source === "string" ? load(source) : source;
  const net = analyzeNetwork(district);
  const { stop, give } = priorityKeys(net);
  return { district, net, markings: buildMarkings(district, net, stop, give, []) };
}

/** An edge polyline with its cumulative arclength — one candidate owner. */
interface EdgeFrame {
  id: string;
  geom: Vec2[];
  cum: number[];
}

function edgeFrames(built: Built): EdgeFrame[] {
  const out: EdgeFrame[] = [];
  for (const eb of built.net.edgeById.values()) {
    const geom = eb.edge.geometry as Vec2[];
    const cum = [0];
    for (let i = 1; i < geom.length; i++) {
      cum.push(
        cum[i - 1]! + Math.hypot(geom[i]![0] - geom[i - 1]![0], geom[i]![1] - geom[i - 1]![1]),
      );
    }
    out.push({ id: eb.edge.id, geom, cum });
  }
  return out;
}

/**
 * (s, t) of `(x, y)` in one edge's frame, or null when the point lies BEYOND
 * that edge's polyline — i.e. when the nearest point of the polyline is one of
 * its two extreme ends and the foot of the perpendicular is off the strip.
 *
 * A clamp at an INTERNAL vertex is kept: that is the outside of a kink, where
 * a straight dash quad legitimately overhangs the bend, and dropping it would
 * delete half of a real dash on ov-lane-v1's S-curve.
 */
function frameOn(f: EdgeFrame, x: number, y: number): { s: number; t: number; d: number } | null {
  let best = Infinity;
  let bestS = 0;
  let bestT = 0;
  let bestK = -1;
  let bestU = 0;
  for (let k = 0; k < f.geom.length - 1; k++) {
    const a = f.geom[k]!;
    const b = f.geom[k + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const segLen = Math.hypot(dx, dy);
    if (segLen === 0) continue;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (segLen * segLen)));
    const px = a[0] + dx * u;
    const py = a[1] + dy * u;
    const d = Math.hypot(x - px, y - py);
    if (d < best) {
      best = d;
      bestS = f.cum[k]! + u * segLen;
      // perpRight of the unit tangent (dy, -dx)/len — math2d's convention.
      bestT = ((x - px) * dy - (y - py) * dx) / segLen;
      bestK = k;
      bestU = u;
    }
  }
  if (bestK < 0) return null;
  if (bestK === 0 && bestU === 0) return null; // past geometry[0]
  if (bestK === f.geom.length - 2 && bestU === 1) return null; // past the last vertex
  return { s: bestS, t: bestT, d: best };
}

/** One painted QUAD, with where in the index buffer it was found. */
interface MeshQuad {
  /** Its four corners, district space, in paintQuad's emission order:
   *  back-left, back-right, front-right, front-left. */
  corners: [Vec2, Vec2, Vec2, Vec2];
  /** Offset of its first index — what a mutation has to splice out. */
  idx0: number;
}

/**
 * Every QUAD in a markings index buffer, read back as four district-space
 * corners.
 *
 * The mesh is the only honest unit here. `MeshAccumulator.quad(a,b,c,d)` pushes
 * `a,b,c, a,c,d`, so two consecutive triangles that share their first and third
 * vertices ARE one painted quad; anything else is a lone triangle (the М18
 * give-way symbol is the only one this file meets) and is skipped rather than
 * mistaken for half a rectangle.
 *
 * Why not cluster loose vertices, which is what this file shipped with? Because
 * a vertex cloud cannot tell a dash from anything else that happens to have a
 * vertex nearby, and two of the fifteen arrival failures were exactly that:
 * `paintStopLine` starts its bar at `inner = 0.15 m` from the осева, i.e. INSIDE
 * the осева's own half-stroke of 0.1875 m, so the М7 line's two inner corners
 * land in any lateral band drawn around the centre line. A quad has a length and
 * a width, and a dash is 5.00 × 0.375 m while that bar is 0.80 × 7.78 m.
 */
function readQuads(idx: readonly number[], pos: readonly number[]): MeshQuad[] {
  const at = (i: number): Vec2 => [pos[i * 3]!, -pos[i * 3 + 2]!];
  const out: MeshQuad[] = [];
  let t = 0;
  while (t + 6 <= idx.length) {
    const a = idx[t]!;
    const b = idx[t + 1]!;
    const c = idx[t + 2]!;
    if (idx[t + 3] === a && idx[t + 4] === c) {
      out.push({ corners: [at(a), at(b), at(c), at(idx[t + 5]!)], idx0: t });
      t += 6;
    } else {
      t += 3; // a lone triangle — not a quad
    }
  }
  return out;
}

/** Vertex index of corner `n` (0..3) of the quad whose indices start at `idx0`. */
function idxOfCorner(idx: readonly number[], idx0: number, n: 0 | 1 | 2 | 3): number {
  return idx[idx0 + (n === 3 ? 5 : n)]!; // a,b,c,a,c,d
}

/** One painted quad resolved into one edge's own frame. */
interface EdgeQuad {
  /** Arclength of the quad's CENTRE along the edge geometry, m. */
  s: number;
  /** Lateral offset of that centre, + = right of geometry-forward. */
  t: number;
  /**
   * Lateral offset of its LEFTMOST and RIGHTMOST CORNER — the reading `t`
   * cannot make.
   *
   * A rectangle's centroid is INVARIANT under rotation about its own centre, so
   * a centroid-only lateral assertion cannot fail at ANY angle: turn every dash
   * on ov-lane-v1 ten degrees across the road and `t` still reads 6e-15 m while
   * the corners stand 0.685 m off the axis — 3.7× the осева's own half-stroke.
   * That is measured, not argued (§3, „the осева check convicts a dash TURNED
   * across the road"), and it is why every lateral claim here is made on the
   * corners and only pinned on the centroid.
   */
  tLo: number;
  tHi: number;
  /** Arclengths of its nearest and furthest corner. */
  from: number;
  to: number;
  /** Its own long edge (corner 0 → corner 3), m — exact, not projected. */
  along: number;
  /** Its own short edge (corner 0 → corner 1), m — exact, not projected. */
  across: number;
  idx0: number;
}

/**
 * The quads this EDGE owns, in its (s, t) frame.
 *
 * `along` and `across` are the quad's OWN edge lengths, measured between
 * corners in district space, so they are exact whatever the road does
 * underneath: `paintQuad` builds every rectangle as centre ± alongHalf·dir ±
 * acrossHalf·perp, which makes |c0→c3| ≡ 2·alongHalf and |c0→c1| ≡ 2·acrossHalf
 * on a bend exactly as on a straight. Only the CENTRE is projected, and for a
 * dash the centre is `pointAlong(line, s)` offset by the boundary — a point that
 * lies on the drawn line itself.
 */
function quadsOnEdge(built: Built, edgeId: string, quads?: MeshQuad[]): EdgeQuad[] {
  const frames = edgeFrames(built);
  const mine = frames.find((f) => f.id === edgeId);
  if (!mine) throw new Error(`no edge ${edgeId}`);
  const src =
    quads ?? readQuads(built.markings.markings.indicesView, built.markings.markings.positionsView);
  const out: EdgeQuad[] = [];
  for (const q of src) {
    const inFrame = q.corners.map((c) => resolveOwned(frames, mine, c));
    if (inFrame.some((r) => r === null)) continue; // not this edge's paint
    const ss = inFrame.map((r) => r!.s);
    const ts = inFrame.map((r) => r!.t);
    const centre: Vec2 = [
      (q.corners[0][0] + q.corners[1][0] + q.corners[2][0] + q.corners[3][0]) / 4,
      (q.corners[0][1] + q.corners[1][1] + q.corners[2][1] + q.corners[3][1]) / 4,
    ];
    const mid = frameOn(mine, centre[0], centre[1]);
    if (!mid) continue;
    out.push({
      s: mid.s,
      t: mid.t,
      tLo: Math.min(...ts),
      tHi: Math.max(...ts),
      from: Math.min(...ss),
      to: Math.max(...ss),
      along: Math.hypot(q.corners[3][0] - q.corners[0][0], q.corners[3][1] - q.corners[0][1]),
      across: Math.hypot(q.corners[1][0] - q.corners[0][0], q.corners[1][1] - q.corners[0][1]),
      idx0: q.idx0,
    });
  }
  return out.sort((a, b) => a.s - b.s);
}

/**
 * `p` in `mine`'s frame, but only if no other edge's polyline is closer.
 *
 * Ownership is „this edge is the NEAREST one", not „within N metres of this
 * edge", and the difference is why this file misread the paint on arrival. With
 * the flat 30 m window it shipped with:
 *  · jx-equal-v1's north arm is COLLINEAR with its south arm, so the north
 *    arm's dashes fell inside the south arm's window, projected onto the south
 *    arm's far endpoint (u clamped to 1) and arrived as four phantom vertices
 *    at s = 130.00 m with t ≈ 0 — read out as a dash 17.93 m PAST the end of the
 *    drawn line, i.e. a trailing margin of −17.93 m against the 4.00 m the
 *    painter really lays. Three „the rhythm is not fitted" failures were that
 *    and nothing else;
 *  · tj-emerge-v1's primary cross street contributed eight more at |t| = 27.93.
 * Ties (a point exactly equidistant from two edges) go to the first edge in
 * network order; nothing in this corpus is equidistant, and a tie would be a
 * degenerate map rather than a marking.
 */
function resolveOwned(
  frames: EdgeFrame[],
  mine: EdgeFrame,
  p: Vec2,
): { s: number; t: number } | null {
  let best = Infinity;
  let owner: string | null = null;
  let here: { s: number; t: number } | null = null;
  for (const f of frames) {
    const r = frameOn(f, p[0], p[1]);
    if (!r) continue;
    if (r.d < best) {
      best = r.d;
      owner = f.id;
    }
    if (f.id === mine.id) here = { s: r.s, t: r.t };
  }
  return owner === mine.id ? here : null;
}

/**
 * THE DASHES on one edge — every quad whose own long edge is DASH_LENGTH_M.
 *
 * Selected by SHAPE ALONG THE ROAD and by nothing else, deliberately: where the
 * dash sits and how wide its stroke is are what the tests below assert, and a
 * counter that filtered on those first could only ever agree with itself. The
 * competing paint on these edges is 0.80 m (the М7 bar), 6.00 m (a zebra bar)
 * or the whole drawn line (a solid edge-line strip), so 5.00 m ± a millimetre
 * picks out dashes and nothing else.
 *
 * It counts QUADS, so it cannot double-count the way the shipped counter did:
 * that one clustered vertices with a gap threshold of DASH_LENGTH_M / 2 = 2.5 m
 * while a dash's own two ends are 5.0 m apart, and reported 46 dashes for
 * ov-lane-v1's 23, 16 for jx-equal-v1's 8, 22 for sx-v1's 11. (No gap threshold
 * could have worked: `dashStations` pays a run's slack into its gaps and only
 * guarantees them above DASH_GAP_M / 2 = 4.0 m, which is less than a dash.)
 */
function dashesOn(built: Built, edgeId: string, quads?: MeshQuad[]): EdgeQuad[] {
  return quadsOnEdge(built, edgeId, quads).filter(
    (q) => Math.abs(q.along - DASH_LENGTH_M) < 1e-3,
  );
}

/** The осева dashes — the ones on the axis rather than on a lane divider. */
function centreDashesOn(built: Built, edgeId: string): EdgeQuad[] {
  return dashesOn(built, edgeId).filter((q) => Math.abs(q.t) < 1);
}

/**
 * How far the quad's furthest CORNER stands from the boundary at `off`, m.
 *
 * This is the quantity „on the line" means to a driver: a dash whose centre is
 * on the осева but whose ends swing 0.7 m into the oncoming lane is not on the
 * осева. Asserted against `dashChordOffsetM(line) + stroke/2`, which is the
 * whole budget a straight dash is entitled to on a bending line — the chord's
 * sagitta plus its own half-width — and not a metre more.
 */
function cornerSpread(q: EdgeQuad, off: number): number {
  return Math.max(Math.abs(q.tHi - off), Math.abs(q.tLo - off));
}

/** The junction-trimmed line markings.ts actually walks on this edge. */
function drawnLine(built: Built, edgeId: string): { line: Vec2[]; s0: number; length: number } {
  const eb = built.net.edgeById.get(edgeId)!;
  const line = trimPolyline(eb.line as Vec2[], 0.8, 0.8, 2.5);
  if (!line) throw new Error(`edge ${edgeId} draws no line`);
  return { line, s0: eb.trimFrom + 0.8, length: polylineLength(line) };
}

/**
 * The most a STRAIGHT dash can stand off a BENDING line: walk the line and take
 * the worst distance from the far corner of a dash centred at each station back
 * to the line itself. Only stations where a whole dash FITS are sampled — past
 * them the corner is off the end of the line, and the distance measured there
 * is the overhang, not the sagitta.
 *
 * Measured, never assumed: ov-lane-v1 is an S-curve, and this file shipped
 * asserting every centre-line vertex within a flat 0.25 m of the axis when half
 * the stroke is 0.1875 m and the worst corner sits at 0.2568 m. That 0.069 m is
 * this quantity — the chord's sagitta over a 5 m dash on a ~45 m radius bend.
 * Nothing was wrong with the paint; real crews lay straight dashes on bends too.
 */
function dashChordOffsetM(line: Vec2[], dashLen = DASH_LENGTH_M): number {
  const total = polylineLength(line);
  let worst = 0;
  for (let s = dashLen / 2; s <= total - dashLen / 2; s += 0.25) {
    const at = pointAlong(line, s);
    for (const sign of [-1, 1] as const) {
      const corner: Vec2 = [
        at.point[0] + at.tangent[0] * sign * (dashLen / 2),
        at.point[1] + at.tangent[1] * sign * (dashLen / 2),
      ];
      worst = Math.max(worst, projectOntoPolyline(line, corner).distance);
    }
  }
  return worst;
}

/** Every quad on one edge, sorted into what the painter may lay there and what it may not. */
interface PaintCensus {
  /** Dash quads per authored lane boundary, keyed by that boundary's offset. */
  onBoundary: Map<number, EdgeQuad[]>;
  /** The solid М1 carriageway edge-line strips, both sides. */
  edgeLines: EdgeQuad[];
  /** Paint that is neither — the bucket every „no other paint" claim empties. */
  other: EdgeQuad[];
  /** Where the edge lines run, ±, from the painter's own arithmetic. */
  edgeOff: number;
  /** The most a straight 5 m dash may chord off this edge's drawn line. */
  sagitta: number;
}

/**
 * EVERY quad on one edge, sorted — the instrument the „no other paint" claims
 * are made with.
 *
 * They used to be made with `dashesOn`, which selects quads whose own long edge
 * is 5.000 m, so they could only ever see paint that ALREADY LOOKED LIKE A
 * DASH. Its refuter added one dashed line to every edge of every district at
 * t = +4.06 m — `laneCenterRightM`, i.e. straight down the middle of the lane
 * the student drives in — with 4.00 m dashes instead of 5.00 m: 25 phantom
 * dashes appeared on ov-lane-v1 beside the 23 real ones, `markingQuads` went
 * 103 → 128, and all 31 tests here stayed GREEN. It slipped past „the whole
 * carriageway carries no OTHER dash", past „three internal boundaries and no
 * fourth", and past `triangles === 2·markingQuads − giveWayTriangles` (which
 * holds because the extra quads were booked honestly). A phantom lane boundary
 * down the middle of a 1+1 residential road is the exact defect class this file
 * exists to catch, inverted — so the census reads ALL quads and classifies by
 * SHAPE AND PLACE, and the tests assert the leftover bucket is empty.
 *
 * On a marked, zoneless, crossing-free, junction-free edge — which is what both
 * overtaking districts are — the painter lays exactly two kinds of quad:
 *  · a DASH on an authored boundary: 5.000 m long, at that boundary's own
 *    stroke (T16 — CENTER_LINE_WIDTH_M on the осева, DASH_WIDTH_M on a
 *    same-direction divider), within half a lane of the boundary. The BAND is
 *    deliberately loose and the stroke deliberately exact: a dash nudged off
 *    its boundary must land in a boundary's bucket and be convicted there by
 *    `cornerSpread`, not vanish into `other` where the diagnosis is vaguer;
 *  · a SOLID EDGE-LINE strip: EDGE_LINE_WIDTH_M across, centred within its own
 *    half-stroke of ±edgeOff, one quad per geometry segment (so its `along` is
 *    whatever that segment is — 6.99…7.90 m on ov-lane-v1's 41-vertex S-curve,
 *    358.40 m on ov-keepright-v1's single straight).
 * Edge lines are matched FIRST: they are pinned to a place no lane boundary
 * occupies, so the order cannot cost a dash its bucket.
 */
function censusOnEdge(
  built: Built,
  edgeId: string,
  boundaries: readonly number[],
  quads?: MeshQuad[],
): PaintCensus {
  const eb = built.net.edgeById.get(edgeId)!;
  // markings.ts's own two lines, restated here rather than imported so a change
  // in the painter shows up as a failure instead of tracking itself silently.
  const travelHalf = eb.halfWidth - eb.parkingM;
  const edgeOff = eb.parkingM > 0 ? travelHalf : travelHalf - EDGE_LINE_INSET_M;
  const sagitta = dashChordOffsetM(drawnLine(built, edgeId).line);
  const strokeAt = (off: number): number =>
    !eb.edge.oneway && Math.abs(off) < 1e-6 ? CENTER_LINE_WIDTH_M : DASH_WIDTH_M;

  const onBoundary = new Map<number, EdgeQuad[]>(boundaries.map((b) => [b, []]));
  const edgeLines: EdgeQuad[] = [];
  const other: EdgeQuad[] = [];
  for (const q of quadsOnEdge(built, edgeId, quads)) {
    if (
      Math.abs(q.across - EDGE_LINE_WIDTH_M) < 1e-3 &&
      Math.abs(Math.abs(q.t) - edgeOff) < EDGE_LINE_WIDTH_M / 2
    ) {
      edgeLines.push(q);
      continue;
    }
    const home = boundaries.find(
      (b) =>
        Math.abs(q.along - DASH_LENGTH_M) < 1e-3 &&
        Math.abs(q.across - strokeAt(b)) < 1e-9 &&
        Math.abs(q.t - b) < LANE_WIDTH_M / 2,
    );
    if (home === undefined) other.push(q);
    else onBoundary.get(home)!.push(q);
  }
  return { onBoundary, edgeLines, other, edgeOff, sagitta };
}

/**
 * How many dashes the OLD fixed-pitch walk fitted on a run this long — the
 * count the re-spaced rhythm must reproduce exactly. Written out longhand
 * rather than imported so the test cannot be satisfied by the same arithmetic
 * bug on both sides.
 */
function fixedPitchDashCount(total: number): number {
  let n = 0;
  for (let s = DASH_GAP_M / 2; s + DASH_LENGTH_M < total; s += DASH_LENGTH_M + DASH_GAP_M) n++;
  return n;
}

// Districts behind the six findings, by the lesson that named them.
const OV_LANE = "ov-lane-v1"; // sc-ov-lane-keeping (S-curve, residential 1+1)
const OV_KEEPRIGHT = "ov-keepright-v1"; // sc-ov-keep-right  (tertiary 2+2)
const TJ_EMERGE = "tj-emerge-v1"; // sc-junction-left  (Б2 stem into a primary)
const TJ_OCCLUDED = "tj-occluded-v1"; // sc-junction-blind (равнозначно T)
const JX_EQUAL = "jx-equal-v1"; // sc-jx-equal-left  (равнозначно ×)
const SX = "sx-v1"; // sc-jx-blocked-exit (signalized ×)
const JXG = "jxg-giveway-v1"; // the Б1 map — the only give-way paint shipped

// ---------------------------------------------------------------------------
// 1. The markings the audit reported missing
// ---------------------------------------------------------------------------

describe("the marking each lesson names is on the road", () => {
  it(`${OV_LANE}: the осева IS painted — sc-ov-lane-keeping's critical finding, refuted`, () => {
    // «The road through the S-bend has no centre line and no lane lines — only
    // white kerb edge lines … The student is graded against paint that is not
    // on the road.» Measured here: 23 М3 dashes centred on the road axis, over
    // 297 m of a 305 m drawn line.
    const built = build(OV_LANE);
    const dashes = dashesOn(built, "ov-ln-street");
    expect(dashes.length).toBeGreaterThanOrEqual(20);

    // ON THE AXIS, not merely near it, and at the осева's own stroke. All three
    // are asserted AFTER the fact — `dashesOn` selects on length alone — so
    // none can be satisfied by the filter that found them.
    //
    // The CENTROID claim is exact: a dash quad's centre is `pointAlong(line, s)`
    // itself, a point on the drawn line, so it holds through the S-bend at
    // 6e-15 m. It is also, on its own, UNFALSIFIABLE — a rectangle's centroid
    // does not move when the rectangle turns about it — and this file spent a
    // wave asserting only that: rotate every dash 10° across the road and the
    // test titled „ON THE AXIS, not merely near it" still passed, with corners
    // 0.685 m out. So the load-bearing claim is the CORNER one below.
    //
    // Its budget is measured, not chosen: `dashChordOffsetM` walks this edge's
    // own drawn line and returns 0.11488 m — the most a straight 5 m dash can
    // chord off a bend of this radius — and half the осева's stroke is
    // 0.1875 m. Worst corner actually painted: 0.25679 m against the 0.30238 m
    // allowed. That is 0.046 m of headroom, and about one degree of turn spends
    // it (10° reads 0.685 m). The 0.25 m FLAT number this file shipped with
    // left 0.0625 m over the half-stroke for a sagitta that measures 0.0693 m,
    // which is why it fired on good paint — real crews lay straight dashes on
    // bends too. „No wider than the geometry forces" is the check; deleting it
    // was not the way to stop it firing.
    const bound = dashChordOffsetM(drawnLine(built, "ov-ln-street").line) + CENTER_LINE_WIDTH_M / 2 + 1e-6;
    for (const d of dashes) {
      expect(Math.abs(d.t)).toBeLessThan(1e-6);
      expect(cornerSpread(d, 0)).toBeLessThan(bound);
      expect(d.across).toBeCloseTo(CENTER_LINE_WIDTH_M, 9);
    }
    // …and the whole carriageway carries no OTHER PAINT — a 1+1 residential has
    // exactly one internal boundary, so nothing is painted at ±LANE_WIDTH_M.
    // Read off the CENSUS, not off `dashesOn`: the version that asked only
    // „is there another 5.000 m quad?" was green with 25 extra 4.00 m dashes
    // laid down the middle of the driver's own lane. Every one of this edge's
    // 103 quads must be the осева's 23 dashes or the 80 М1 edge-line strips.
    const census = censusOnEdge(built, "ov-ln-street", [0]);
    expect(census.other).toEqual([]);
    expect(census.onBoundary.get(0)!.length).toBe(dashes.length);
    expect(census.edgeLines.length).toBeGreaterThan(0);
    // …and no quad escaped the census by being painted somewhere else in the
    // district either: ov-lane-v1 is ONE edge, it paints no М18 triangle, so
    // every quad the builder booked has to have been read back on it.
    expect(census.other.length + census.edgeLines.length + census.onBoundary.get(0)!.length).toBe(
      built.markings.markingQuads,
    );

    // And it runs the WHOLE street, not just the straight bit — the S-bend is
    // the lesson. Both ends inside a dash pitch of the drawn line's own ends.
    const { s0, length } = drawnLine(built, "ov-ln-street");
    const pitch = DASH_LENGTH_M + DASH_GAP_M;
    expect(dashes[0]!.from - s0).toBeLessThan(pitch);
    expect(s0 + length - dashes[dashes.length - 1]!.to).toBeLessThan(pitch);
  });

  it(`${OV_KEEPRIGHT}: three internal lane boundaries, one per divider — the sibling comparison`, () => {
    // «This lesson's carriageway carries dashed lane lines; sc-ov-lane-keeping
    // … carries none at all.» Both carry exactly what their lane count asks
    // for: a 2+2 tertiary has three internal boundaries (±W and the осева), a
    // 1+1 residential has one. That is the SAME rule, not two.
    const built = build(OV_KEEPRIGHT);
    const dashes = dashesOn(built, "ov-kr-road");
    const BOUNDARIES = [-LANE_WIDTH_M, 0, LANE_WIDTH_M];
    // The chord allowance is the offset lines' own: a divider LANE_WIDTH_M out
    // from a bending axis chords across the bend, so its quad centres read a
    // few centimetres in. Derived from this edge's drawn line, not chosen —
    // and on this one it is 5.7e-14 m, because ov-kr-road is a single straight
    // segment. Which is why the CORNER bound below bites so hard here.
    const slack = dashChordOffsetM(drawnLine(built, "ov-kr-road").line) + 1e-6;
    for (const off of BOUNDARIES) {
      const stroke = off === 0 ? CENTER_LINE_WIDTH_M : DASH_WIDTH_M;
      const on = dashes.filter((d) => Math.abs(d.t - off) < LANE_WIDTH_M / 2);
      expect(on.length, `boundary at ${off} m`).toBeGreaterThanOrEqual(20);
      for (const d of on) {
        expect(Math.abs(d.t - off), `boundary at ${off} m`).toBeLessThan(slack);
        // …with its ENDS on the boundary too, not just its middle. Same reason
        // as on the осева: the centroid claim above cannot fail at any angle,
        // and on a straight road the whole budget a dash has is its own
        // half-stroke — 0.125 m on a divider, 0.1875 m on the осева, which is
        // exactly what the paint measures.
        expect(cornerSpread(d, off), `boundary at ${off} m`).toBeLessThan(slack + stroke / 2);
        // …painted at the стъпка that boundary is entitled to: the осева is
        // 1.5× a same-direction divider (T16), and that width is the one cue
        // telling the student which line has oncoming traffic behind it.
        expect(d.across, `boundary at ${off} m`).toBeCloseTo(stroke, 9);
      }
    }
    // Three internal boundaries and no fourth — and no other PAINT of any
    // shape, which is the half that was missing. Filtering `dashesOn` asked
    // only whether a fourth boundary was drawn in 5.000 m dashes; a fourth
    // drawn in 4.00 m dashes at t = +4.06 m (the centre of the driver's own
    // lane) sailed through it. All 83 quads: 81 dashes on the three
    // boundaries, 2 М1 edge-line strips, nothing else.
    const census = censusOnEdge(built, "ov-kr-road", BOUNDARIES);
    expect(census.other).toEqual([]);
    expect(census.edgeLines.length).toBe(2);
    // …and the corner bound above really was as tight as it looks: this edge is
    // one straight segment, so a dash on it has no sagitta to spend and the
    // whole budget is its own half-stroke.
    expect(census.sagitta).toBeLessThan(1e-9);
    // The М1 edge lines sit on the travel/parking boundary here (parkingM = 4 m,
    // so `edgeOff` is travelHalf itself and not travelHalf − EDGE_LINE_INSET_M).
    expect(census.edgeOff).toBeCloseTo(16.25, 9);
    for (const strip of census.edgeLines) expect(Math.abs(strip.t)).toBeCloseTo(census.edgeOff, 9);
    for (const off of BOUNDARIES) {
      expect(census.onBoundary.get(off)!.length, `boundary at ${off} m`).toBeGreaterThanOrEqual(20);
    }
    expect(
      census.edgeLines.length + BOUNDARIES.reduce((n, o) => n + census.onBoundary.get(o)!.length, 0),
    ).toBe(built.markings.markingQuads);
  });

  it(`${TJ_EMERGE}: the Б2 arm carries a solid М7 stop line at its mouth — sc-junction-left, refuted`, () => {
    // «The objective and the coach caption both name a stop line the world
    // does not have … No stop line is painted anywhere in front of the sign.»
    // One IS painted, and this pins WHERE: at the junction cut plus
    // STOP_LINE_BEYOND_CUT_M, which is the arclength runtime/stoplines.ts
    // grades at. Paint and grading coincide or a driver who stops on the paint
    // is failed for not stopping.
    const built = build(TJ_EMERGE);
    expect(built.markings.stopLines).toBe(1);

    const eb = built.net.edgeById.get("tj-e-s")!;
    const geomLen = polylineLength(eb.edge.geometry as Vec2[]);
    // trimTo is the cut at the node end; the arm's node end is s = geomLen.
    const expectedS = geomLen - eb.trimTo - STOP_LINE_BEYOND_CUT_M;

    // The bar is the one TRANSVERSE quad on this arm: STOP_LINE_WIDTH_M along
    // the road and metres across it. Picked by that shape, NOT by a lateral
    // band — a band is what this file shipped with (|t| ∈ (1, 8.1) m) and it
    // also caught the eight end vertices of the two longitudinal EDGE LINES,
    // which sit at |t| = 7.475…7.775 m because residential is in
    // EDGE_LINE_CLASSES. Ten „transverse" vertices where one quad has four.
    // (`paintStopLine` builds the bar with its `dir` pointing ACROSS the road,
    // so the quad's long edge — `along` here — is the span over the lanes and
    // its short edge is STOP_LINE_WIDTH_M along the carriageway.)
    const bars = quadsOnEdge(built, "tj-e-s").filter(
      (q) => Math.abs(q.across - STOP_LINE_WIDTH_M) < 1e-6 && q.along > 1,
    );
    expect(bars.length).toBe(1);
    const bar = bars[0]!;

    // WHERE: on the arclength runtime/stoplines.ts grades at, to the millimetre.
    expect(bar.s).toBeCloseTo(expectedS, 3);
    // …and it spans the INCOMING half only, never the oncoming lane: from the
    // осева (paintStopLine's `inner` = 0.15 m) out to the kerb-side edge of the
    // travel lanes (`outer` = travelHalf − 0.2 m), entirely on one side of the
    // axis. Measured: 7.775 m of bar centred 4.0375 m right of the осева.
    expect(bar.along).toBeCloseTo(LANE_WIDTH_M - 0.2 - 0.15, 6);
    expect(Math.abs(bar.t)).toBeCloseTo((LANE_WIDTH_M - 0.2 + 0.15) / 2, 6);
    expect(Math.abs(bar.t) - bar.along / 2).toBeGreaterThan(0); // never crosses t = 0
    // Right of geometry-forward, which on this south-to-north arm is the half a
    // driver approaching the junction travels on.
    expect(Math.sign(bar.t)).toBe(1);
  });

  it(`${SX}: the signalized × carries one stop line per arm — sc-jx-blocked-exit`, () => {
    // «the only one whose junction has a painted stop line» — true, and it is
    // the only SIGNALIZED one. Four arms, four lines.
    const built = build(SX);
    expect(built.markings.stopLines).toBe(4);
  });

  it(`${TJ_OCCLUDED} / ${JX_EQUAL}: равнозначни junctions carry NO transverse line`, () => {
    // The no-false-credit direction of every assertion above. sc-junction-blind
    // and sc-jx-equal-left were reported as „bare" — and a равнозначно
    // кръстовище IS bare of М7: priority is the right-hand rule, and painting a
    // stop line there would teach a duty the law does not impose. If a later
    // change „fixes" the bare junctions by painting lines everywhere, this
    // fails.
    for (const id of [TJ_OCCLUDED, JX_EQUAL]) {
      const built = build(id);
      expect(built.markings.stopLines, id).toBe(0);
      expect(built.markings.giveWayTriangles, id).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The one finding whose cause WAS in this file: the junction-mouth tail
// ---------------------------------------------------------------------------

describe("the dashed rhythm is fitted to its run, both ends alike", () => {
  // The old walk anchored at gapLen/2 from the near end and paid ALL its slack
  // out at the far end — which on a junction-trimmed arm is the junction mouth.
  // Measured before the fix: jx-equal-v1's four arms and tj-occluded-v1's stem
  // stopped 11.27 m short of their own mouth, tj-emerge-v1's Б2 stem 10.28 m,
  // while sx-v1's north arm stopped 0.28 m short — same class, same junction,
  // pure phase luck. That is the audit's „the same road class renders three
  // different ways across the set", and on the равнозначни maps it is 11 m of
  // unpainted осева on top of the 17 m junction patch.
  const CASES: Array<[string, string]> = [
    [JX_EQUAL, "jx-e-s"],
    [JX_EQUAL, "jx-e-n"],
    [TJ_OCCLUDED, "tj-e-s"],
    [TJ_EMERGE, "tj-e-s"],
    [SX, "sx-e-w"],
    [OV_LANE, "ov-ln-street"],
  ];

  for (const [id, edgeId] of CASES) {
    it(`${id}/${edgeId}: leading margin === trailing margin === DASH_GAP_M/2`, () => {
      const built = build(id);
      const { s0, length } = drawnLine(built, edgeId);
      const dashes = centreDashesOn(built, edgeId);
      expect(dashes.length).toBeGreaterThan(1);

      const leading = dashes[0]!.from - s0;
      const trailing = s0 + length - dashes[dashes.length - 1]!.to;
      expect(leading).toBeCloseTo(DASH_GAP_M / 2, 1);
      expect(trailing).toBeCloseTo(DASH_GAP_M / 2, 1);
    });

    it(`${id}/${edgeId}: re-spacing adds no dash the fixed-pitch walk did not fit`, () => {
      // The no-free-paint direction. Fitting the rhythm may MOVE paint; it may
      // never mint any. The count must still be the fixed-pitch walk's.
      const built = build(id);
      const { length } = drawnLine(built, edgeId);
      expect(centreDashesOn(built, edgeId).length).toBe(fixedPitchDashCount(length));
    });
  }

  it("the dash counter convicts paint that is NOT there", () => {
    // A counter that cannot notice missing paint is worthless — it would credit
    // a бяла осева that was never laid, which is this file's whole subject
    // pointed the other way. So: count jx-equal-v1's south arm, then DELETE one
    // dash from the mesh — splice its six indices out of the index buffer, the
    // same surgery a builder regression would perform — and count again. It
    // must say 7, and the seven survivors must be the seven that survived.
    const built = build(JX_EQUAL);
    const mesh = built.markings.markings;
    const whole = centreDashesOn(built, "jx-e-s");
    expect(whole.length).toBe(8);

    const gone = whole[3]!;
    const idx = [...mesh.indicesView];
    idx.splice(gone.idx0, 6);
    const holed = quadsOnEdge(built, "jx-e-s", readQuads(idx, mesh.positionsView)).filter(
      (q) => Math.abs(q.along - DASH_LENGTH_M) < 1e-3 && Math.abs(q.t) < 1,
    );
    expect(holed.length).toBe(7);
    expect(holed.map((d) => d.s.toFixed(2))).toEqual(
      whole.filter((d) => d !== gone).map((d) => d.s.toFixed(2)),
    );

    // …and it is not fooled the other way either: a quad that is NOT a dash is
    // not counted as one. Shorten the same dash to half its length in the
    // vertex buffer and it drops out rather than being rounded up — 5.00 m is
    // what a dash is, and 2.50 m of paint is a defect, not a dash.
    const pos = [...mesh.positionsView];
    const c0 = idxOfCorner(mesh.indicesView, gone.idx0, 0);
    const c3 = idxOfCorner(mesh.indicesView, gone.idx0, 3);
    const c1 = idxOfCorner(mesh.indicesView, gone.idx0, 1);
    const c2 = idxOfCorner(mesh.indicesView, gone.idx0, 2);
    for (const [near, far] of [
      [c0, c3],
      [c1, c2],
    ] as const) {
      for (const axis of [0, 2]) {
        pos[far * 3 + axis] = (pos[near * 3 + axis]! + pos[far * 3 + axis]!) / 2;
      }
    }
    const shrunk = quadsOnEdge(built, "jx-e-s", readQuads(mesh.indicesView, pos)).filter(
      (q) => Math.abs(q.along - DASH_LENGTH_M) < 1e-3 && Math.abs(q.t) < 1,
    );
    expect(shrunk.length).toBe(7);
  });

  it("a run too short for one whole dash stays unpainted", () => {
    // The other no-free-paint direction: fitting a rhythm to a stub must not
    // invent the stub's first dash. gapLen/2 + dashLen = 9 m is the threshold
    // the fixed-pitch walk had, and it is unchanged.
    expect(fixedPitchDashCount(DASH_GAP_M / 2 + DASH_LENGTH_M)).toBe(0);
    expect(fixedPitchDashCount(DASH_GAP_M / 2 + DASH_LENGTH_M + 0.01)).toBe(1);

    const built = build(STUB);
    // The absence of PAINT, not the absence of 5.000 m quads. Asked the second
    // way — `dashesOn(built, "stub-e")` — this test cannot fail: emit ONE 3.00 m
    // dash on the too-short run and the stub carries a 3 m осева from y = 2.50
    // to y = 5.50 with all 31 tests green, which is precisely the „must not
    // invent the stub's first dash" the comment above claims to forbid. A
    // painter that invents a dash is not going to invent it at the one length
    // the reader looks for.
    const census = censusOnEdge(built, "stub-e", [0]);
    expect(quadsOnEdge(built, "stub-e").filter((q) => Math.abs(q.t) < 1)).toEqual([]);
    expect(census.onBoundary.get(0)).toEqual([]);
    expect(census.other).toEqual([]);
    // …and the edge is genuinely marked otherwise, so the zeroes above are the
    // dash rule and not a district the painter skipped wholesale: 6.40 m of
    // drawn line still carries its two М1 edge-line strips at t = ±7.625 m.
    expect(built.markings.markingQuads).toBeGreaterThan(0);
    expect(census.edgeLines.length).toBe(built.markings.markingQuads);
    expect(census.edgeLines.length).toBe(2);
    expect(census.edgeOff).toBeCloseTo(7.625, 9);
    for (const strip of census.edgeLines) {
      expect(Math.abs(strip.t)).toBeCloseTo(census.edgeOff, 9);
      expect(strip.along).toBeCloseTo(drawnLine(built, "stub-e").length, 9);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The three checks this battery once deleted, each pinned by the mutation
//    that walked through the hole
// ---------------------------------------------------------------------------

/**
 * Every DASH quad in `quads`, turned `deg` about its OWN centroid.
 *
 * The mesh-level twin of turning `paintDashedLine`'s `mid.tangent` by the same
 * angle, and exactly equivalent to it: `paintQuad` builds a rectangle as
 * centre ± alongHalf·dir ± acrossHalf·perpRight(dir), so rotating `dir` rotates
 * all four corners about that centre and moves nothing else. Done here rather
 * than in markings.ts because a mutation that has to be applied by hand, to a
 * file this test does not own, gets applied once and then remembered wrongly.
 */
function turnDashes(quads: readonly MeshQuad[], deg: number): MeshQuad[] {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return quads.map((q) => {
    const along = Math.hypot(q.corners[3][0] - q.corners[0][0], q.corners[3][1] - q.corners[0][1]);
    if (Math.abs(along - DASH_LENGTH_M) >= 1e-3) return q;
    const c: Vec2 = [
      (q.corners[0][0] + q.corners[1][0] + q.corners[2][0] + q.corners[3][0]) / 4,
      (q.corners[0][1] + q.corners[1][1] + q.corners[2][1] + q.corners[3][1]) / 4,
    ];
    const turn = (p: Vec2): Vec2 => [
      c[0] + (p[0] - c[0]) * cos - (p[1] - c[1]) * sin,
      c[1] + (p[0] - c[0]) * sin + (p[1] - c[1]) * cos,
    ];
    return { corners: q.corners.map(turn) as [Vec2, Vec2, Vec2, Vec2], idx0: q.idx0 };
  });
}

/**
 * One extra rectangle on an edge's drawn line, `alongM` × `acrossM`, centred
 * `s` along that line and `t` beside it — the mesh-level twin of one extra
 * `paintQuad` call. `idx0` is −1: nothing here splices it back into a buffer.
 */
function phantomQuad(
  built: Built,
  edgeId: string,
  at: { s: number; t: number; alongM: number; acrossM: number },
): MeshQuad {
  const { line } = drawnLine(built, edgeId);
  const f = pointAlong(line, at.s);
  const r = perpRight(f.tangent);
  const c = add(f.point, mul(r, at.t));
  const corner = (a: number, b: number): Vec2 =>
    add(add(c, mul(f.tangent, (a * at.alongM) / 2)), mul(r, (b * at.acrossM) / 2));
  // paintQuad's own order: back-left, back-right, front-right, front-left.
  return { corners: [corner(-1, -1), corner(-1, 1), corner(1, 1), corner(1, -1)], idx0: -1 };
}

/** A whole extra dashed line at offset `t`, walked at the fixed pitch. */
function phantomLine(built: Built, edgeId: string, t: number, alongM: number, acrossM: number): MeshQuad[] {
  const total = polylineLength(drawnLine(built, edgeId).line);
  const out: MeshQuad[] = [];
  for (let s = DASH_GAP_M / 2; s + alongM < total; s += alongM + DASH_GAP_M) {
    out.push(phantomQuad(built, edgeId, { s, t, alongM, acrossM }));
  }
  return out;
}

describe("the three checks a green wave deleted, and the paint each one lets through", () => {
  // These are not hypotheticals. Each mutation below was constructed by the
  // refuter that reopened this file, applied to markings.ts, and run: all 31
  // tests stayed GREEN on every one of them. They are reproduced here on the
  // mesh — which is where every assertion in this file reads anyway — so that
  // „this check is real" is itself a check, and so the next person to answer a
  // failing assertion by widening it has to delete a test that says why.

  it("the осева check convicts a dash TURNED across the road — 10° and 15°", () => {
    // A · the centroid hole. `|t| < 1e-6` on the quad CENTRE replaced `|t| <
    // 0.25` on every VERTEX, and a rectangle's centroid does not move when the
    // rectangle turns about it, so the assertion titled „ON THE AXIS, not
    // merely near it" could not fail at ANY angle — 10°, 15°, or 90°.
    const built = build(OV_LANE);
    const real = readQuads(built.markings.markings.indicesView, built.markings.markings.positionsView);
    const bound = dashChordOffsetM(drawnLine(built, "ov-ln-street").line) + CENTER_LINE_WIDTH_M / 2 + 1e-6;
    expect(bound).toBeCloseTo(0.3024, 4);

    for (const [deg, corner] of [
      [10, 0.685],
      [15, 0.892],
    ] as const) {
      const turned = dashesOn(built, "ov-ln-street", turnDashes(real, deg));
      // …invisible to everything the weakened test asserted: same 23 dashes,
      // same 5.000 m length, same 0.375 m stroke, centroids still on the axis
      // to 6e-15 m. Every one of these lines passes on the mutated mesh.
      expect(turned.length).toBe(23);
      for (const d of turned) {
        expect(Math.abs(d.t), `${deg}°`).toBeLessThan(1e-6);
        expect(d.across, `${deg}°`).toBeCloseTo(CENTER_LINE_WIDTH_M, 9);
      }
      // …and convicted the moment the corners are read. 0.685 m at 10° is
      // 3.7× the осева's own half-stroke: paint standing that far out of the
      // lane it divides is the defect a student would drive into.
      const worst = Math.max(...turned.map((d) => cornerSpread(d, 0)));
      expect(worst, `${deg}°`).toBeGreaterThan(bound);
      expect(worst, `${deg}°`).toBeCloseTo(corner, 2);
    }
  });

  it("the stub check convicts ONE invented 3 m dash", () => {
    // B · the shape hole. „A run too short for one whole dash stays unpainted"
    // was asserted as „there is no 5.000 m quad here", which is not what it
    // says: the natural way to break it is a painter that CENTRES A SHORTER
    // dash when the fixed walk fits none — 3.00 m because that is what fits,
    // from y = 2.50 to y = 5.50 down the middle of an 8 m stub. All 31 tests
    // were green with that осева painted.
    const built = build(STUB);
    const real = readQuads(built.markings.markings.indicesView, built.markings.markings.positionsView);
    const { line } = drawnLine(built, "stub-e");
    const invented = phantomQuad(built, "stub-e", {
      s: polylineLength(line) / 2,
      t: 0,
      alongM: 3,
      acrossM: CENTER_LINE_WIDTH_M,
    });
    const mutated = [...real, invented];

    // The assertion that was here says nothing at all about this paint…
    expect(dashesOn(built, "stub-e", mutated)).toEqual([]);
    // …while the paint is unmistakably there, 3.00 m of осева from s = 2.50 m
    // to s = 5.50 m of an edge whose whole drawn line is 6.40 m.
    const painted = quadsOnEdge(built, "stub-e", mutated).filter((q) => Math.abs(q.t) < 1);
    expect(painted.length).toBe(1);
    expect(painted[0]!.along).toBeCloseTo(3, 9);
    expect(painted[0]!.from).toBeCloseTo(2.5, 9);
    expect(painted[0]!.to).toBeCloseTo(5.5, 9);
    // …and the census convicts it as paint the painter had no licence to lay.
    expect(censusOnEdge(built, "stub-e", [0], mutated).other.length).toBe(1);
  });

  it("the census convicts a phantom boundary down the middle of the driver's own lane", () => {
    // C · the length hole. Every „no other paint" claim read `dashesOn`, so it
    // could only see 5.000 m quads. One extra dashed line at t = +4.06 m — the
    // `laneCenterRightM` both districts author, i.e. the centre of the lane the
    // student is being taught to hold — drawn in 4.00 m dashes was invisible to
    // all of them: 25 phantom dashes on ov-lane-v1 beside the 23 real ones,
    // markingQuads 103 → 128, 31/31 green.
    for (const [id, edgeId, boundaries] of [
      [OV_LANE, "ov-ln-street", [0]],
      [OV_KEEPRIGHT, "ov-kr-road", [-LANE_WIDTH_M, 0, LANE_WIDTH_M]],
    ] as const) {
      const built = build(id);
      const real = readQuads(built.markings.markings.indicesView, built.markings.markings.positionsView);
      const phantom = phantomLine(built, edgeId, 4.06, 4, DASH_WIDTH_M);
      expect(phantom.length, id).toBeGreaterThan(20);
      const mutated = [...real, ...phantom];

      // Not one of the 4 m dashes is a „dash" to the reader that was here…
      expect(dashesOn(built, edgeId, mutated).length, id).toBe(dashesOn(built, edgeId).length);
      // …and t = +4.06 m is inside boundary 0's half-lane band, so even a band
      // widened to catch it would have filed it under the осева rather than
      // reporting it. The census convicts on SHAPE AND PLACE together.
      expect(Math.abs(4.06 - 0)).toBeLessThan(LANE_WIDTH_M / 2);
      expect(censusOnEdge(built, edgeId, boundaries, mutated).other.length, id).toBe(phantom.length);
    }
    // The count the refuter reported on ov-lane-v1, pinned: 25 phantom dashes.
    const built = build(OV_LANE);
    expect(phantomLine(built, "ov-ln-street", 4.06, 4, DASH_WIDTH_M).length).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// 4. markingQuads counts the paint it emitted — including the Б1 М7 line
// ---------------------------------------------------------------------------

describe("WorldStats.markingQuads is a count, not an estimate", () => {
  // Every paintQuad is 2 triangles and every М18 give-way symbol is 1, so the
  // markings mesh satisfies  triangles === 2·markingQuads − giveWayTriangles
  // exactly — unless a pass emits geometry it does not book. It used to:
  // paintStopLine drew `n` dashes for a Б1 линия за изчакване and the caller
  // booked 1, so jxg-giveway-v1 reported 70 quads for the 82 it painted.
  const IDS = [JXG, TJ_EMERGE, SX, JX_EQUAL, TJ_OCCLUDED, OV_LANE, OV_KEEPRIGHT];

  for (const id of IDS) {
    it(`${id}: triangles === 2·markingQuads − giveWayTriangles`, () => {
      const built = build(id);
      const m = built.markings;
      expect(m.markings.triangleCount).toBe(2 * m.markingQuads - m.giveWayTriangles);
    });
  }

  it(`${JXG}: each Б1 approach books its whole dashed line, not one quad`, () => {
    // The give-way branch is the one that was mis-booked, so it gets its own
    // assertion rather than relying on the identity alone: four Б1 mouths add
    // 20 quads (4 × 4 М7 dashes + 4 М18 triangles), never 4 + 4.
    const district = load(JXG);
    const net = analyzeNetwork(district);
    const { stop, give } = priorityKeys(net);
    expect(give.size).toBeGreaterThan(0);
    const withSigns = buildMarkings(district, net, stop, give, []);
    const bare = buildMarkings(district, net, new Set(), new Set(), []);
    const added = withSigns.markingQuads - bare.markingQuads;
    expect(withSigns.stopLines).toBe(4);
    expect(withSigns.giveWayTriangles).toBe(4);
    // > one quad per line is the whole point; the exact figure pins the М7
    // dash count so a silently thinner line is caught too.
    expect(added).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// 5. An angled crossing cannot hang the build
// ---------------------------------------------------------------------------

/**
 * Minimal district-v1 with one marked street and one crossing on it.
 *
 * It carries `intersections`, `roundabouts` and `spawnPoints` — empty, but
 * PRESENT — because `District` declares all three required and `analyzeNetwork`
 * dereferences the first two unguarded. When this file shipped they were
 * missing, `assertDistrict` did not check them, and all three tests below died
 * inside network.ts with „Cannot read properties of undefined (reading
 * 'filter')" — an error naming neither the fixture nor the field. The guard
 * now checks every required field (world/types.ts), so this fixture could not
 * be written wrong again without saying so.
 */
function skewedCrossingDistrict(skewDeg: number): District {
  return assertDistrict({
    format: "district-v1",
    meta: { district: "skew", label: "skew", attribution: { text: "test fixture" } },
    roads: {
      nodes: [
        { id: "skew-a", x: 0, y: 0 },
        { id: "skew-b", x: 0, y: 120 },
      ],
      edges: [
        {
          id: "skew-e",
          from: "skew-a",
          to: "skew-b",
          class: "residential",
          oneway: false,
          roundabout: false,
          lanes: 2,
          lanesSource: "tag",
          maxspeed: 50,
          maxspeedSource: "tag",
          length: 120,
          geometry: [
            [0, 0],
            [0, 120],
          ],
        },
      ],
    },
    intersections: [],
    // `kind: "marked"` — a пешеходна пътека that is actually painted. It said
    // `"uncontrolled"` on arrival, which is not a `CrossingKind` at all
    // (`"signals" | "marked" | "unmarked" | "unknown"`), so `paintsZebra`
    // refused it and every assertion below was measuring a crossing the painter
    // had skipped. `assertDistrict` cannot catch that — it is the cheap seam
    // guard, not a schema validator — which is precisely why a fixture must be
    // RUN before it is believed.
    crossings: [{ id: "skew-c", x: 0, y: 60, kind: "marked", signalized: false, edgeId: "skew-e", skewDeg }],
    roundabouts: [],
    buildings: [],
    spawnPoints: [],
  });
}

const STUB_ID = "stub";
/** A marked street too short to fit one dash — the stub case above. */
const STUB: District = assertDistrict({
  format: "district-v1",
  meta: { district: STUB_ID, label: "stub", attribution: { text: "test fixture" } },
  roads: {
    nodes: [
      { id: "stub-a", x: 0, y: 0 },
      { id: "stub-b", x: 0, y: 8 },
    ],
    edges: [
      {
        id: "stub-e",
        from: "stub-a",
        to: "stub-b",
        class: "residential",
        oneway: false,
        roundabout: false,
        lanes: 2,
        lanesSource: "tag",
        maxspeed: 50,
        maxspeedSource: "tag",
        length: 8,
        geometry: [
          [0, 0],
          [0, 8],
        ],
      },
    ],
  },
  intersections: [],
  crossings: [],
  roundabouts: [],
  buildings: [],
  spawnPoints: [],
});

/**
 * The vertices the CROSSING adds, and nothing else — the same district built
 * twice, once with `crossings: []`.
 *
 * NOT „the first four vertices near the crossing point", which is what this
 * file shipped with: buildMarkings paints every lane line BEFORE any zebra, so
 * that reader handed back a corner of the dashed осева, whose axis is the
 * ROAD's — it would have measured 0° for every skew and passed only by luck.
 * A differential measurement cannot be fooled by paint order, and the prefix
 * assertion below is itself a claim worth making: a crossing must not move one
 * vertex of the carriageway's own paint.
 */
function crossingPaint(district: District, net: RoadNetwork): Vec2[] {
  const bare = buildMarkings({ ...district, crossings: [] }, net, new Set(), new Set(), []);
  const full = buildMarkings(district, net, new Set(), new Set(), []);
  const a = bare.markings.positionsView;
  const b = full.markings.positionsView;
  expect(b.length).toBeGreaterThan(a.length);
  expect(Array.from(b.slice(0, a.length))).toEqual(Array.from(a));
  const out: Vec2[] = [];
  for (let i = a.length; i < b.length; i += 3) out.push([b[i]!, -b[i + 2]!]);
  return out;
}

/**
 * Angle of the zebra bars off the road axis, read back out of the mesh —
 * signed CCW in district space, the same handedness `markings.rotate` uses, so
 * a skew of +18° reads +18°. (The reader this file shipped with returned a
 * COMPASS bearing, `atan2(dx, dy)`, which is clockwise: it negated every angle
 * it measured and would have failed at −18 against +18 even had it found a bar.)
 */
function barSkewDeg(district: District, net: RoadNetwork): number {
  const v = crossingPaint(district, net);
  expect(v.length % 4).toBe(0);
  // paintQuad emits back-left, back-right, front-right, front-left; corner 0
  // to corner 3 is the along-bar edge, i.e. `barDir`.
  const bar = sub(v[3]!, v[0]!);
  // Its length is the bar's own — proof that what was measured IS a bar.
  expect(Math.hypot(bar[0], bar[1])).toBeCloseTo(ZEBRA_LENGTH_M, 6);
  const g = district.roads.edges[0]!.geometry as Vec2[];
  const road = norm(sub(g[g.length - 1]!, g[0]!));
  return (Math.atan2(road[0] * bar[1] - road[1] * bar[0], road[0] * bar[0] + road[1] * bar[1]) * 180) / Math.PI;
}

describe("paintZebra survives an out-of-domain skew", () => {
  it("a shipped skew (18°) turns the bars by exactly that much", () => {
    // The clamp must be INERT inside its domain — gen_pe_crossings.mjs ships
    // 18° and −12°, and a guard that quietly straightened them would be the
    // false-failure half of the same crime.
    for (const skew of [18, -12, 45]) {
      const district = skewedCrossingDistrict(skew);
      const net = analyzeNetwork(district);
      const m = buildMarkings(district, net, new Set(), new Set(), []);
      expect(m.zebraCrossings, `${skew}°`).toBe(1);
      expect(barSkewDeg(district, net), `${skew}°`).toBeCloseTo(skew, 6);
    }
  });

  it("skew 90° neither hangs the build nor deletes the crossing", { timeout: 20_000 }, () => {
    // Unclamped, the 1/cos widening asks for a 2.6e17 m span on this 16.25 m
    // street — about 1.9e17 bars — and the bar loop never returns: a world
    // build that hangs forever, with no error, from one bad number in a map
    // generator. assertDistrict validates nothing about skewDeg (it is a
    // number in range 0…360 as far as the schema is concerned), so the domain
    // has to live in the painter.
    const district = skewedCrossingDistrict(90);
    const net = analyzeNetwork(district);
    const m = buildMarkings(district, net, new Set(), new Set(), []);
    // Still PAINTED: runtime/zones grades this crossing off `paintsZebra`,
    // which knows nothing about skew, so refusing the paint would grade a
    // пешеходна пътека the world never drew.
    //
    // `zebraCrossings` alone cannot carry that claim — buildMarkings increments
    // it per crossing it VISITS, whatever paintZebra then returns — so the paint
    // itself is proved by `crossingPaint` below, which fails unless the crossing
    // added vertices. Both are asserted; only the second one is load-bearing.
    expect(m.zebraCrossings).toBe(1);
    // Clamped at 60°, the widening is 2× and the street takes 22 bars. Without
    // the clamp this number is ~1.9e17 and the build never returns.
    expect(m.markingQuads).toBeLessThan(200);
    expect(barSkewDeg(district, net)).toBeCloseTo(60, 6);
  });
});

// ---------------------------------------------------------------------------
// 6. assertDistrict guards every field District declares required
// ---------------------------------------------------------------------------

describe("assertDistrict checks what District declares", () => {
  // It used to check `format`, `roads.nodes`, `roads.edges`, `buildings` and
  // `meta.attribution.text` — and nothing else — while the interface declares
  // `intersections`, `crossings`, `roundabouts` and `spawnPoints` required and
  // `analyzeNetwork` dereferences the first two unguarded. A document without
  // them PASSED the guard and crashed 300 lines later with a message naming
  // neither the field nor the file at fault. Three of this battery's fifteen
  // arrival failures were exactly that.
  //
  // Both directions are pinned, because a guard is a place where over-refusal
  // costs exactly what under-refusal does: the founder has been failed by an
  // engine for a manoeuvre he performed correctly, and credited by one for a
  // skill it never measured, and this file exists because of both.

  it("every committed district still passes — the false-refusal direction", () => {
    // Making a guard stricter is only safe if the real corpus is proved
    // against it. It is: all of content/world/*.json already carry all four
    // arrays, so nothing on disk changes hands.
    expect(WORLD_DIR).toBeTruthy();
    const files = fs.readdirSync(WORLD_DIR!).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(90);
    for (const f of files) {
      const raw: unknown = JSON.parse(fs.readFileSync(path.join(WORLD_DIR!, f), "utf8"));
      expect(() => assertDistrict(raw), f).not.toThrow();
    }
  });

  it("…and a document missing any required field is refused at the seam", () => {
    const ok = skewedCrossingDistrict(0) as unknown as Record<string, unknown>;
    for (const field of [
      "roads",
      "intersections",
      "crossings",
      "roundabouts",
      "buildings",
      "spawnPoints",
    ]) {
      const broken: Record<string, unknown> = { ...ok };
      delete broken[field];
      expect(() => assertDistrict(broken), field).toThrow(/district-v1/);
    }
    // …and the named field is in the message, so the next person reading a CI
    // log does not have to bisect a builder to find out which one it was.
    const noRoundabouts: Record<string, unknown> = { ...ok };
    delete noRoundabouts.roundabouts;
    expect(() => assertDistrict(noRoundabouts)).toThrow(/roundabouts/);
    // The checks that were already there stay there.
    expect(() => assertDistrict({ ...ok, format: "district-v2" })).toThrow();
    expect(() => assertDistrict({ ...ok, meta: { attribution: {} } })).toThrow();
    expect(() => assertDistrict(null)).toThrow();
  });
});
