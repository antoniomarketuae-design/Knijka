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
 * is a test here: each asserts, from the vertices the builder actually emits,
 * the exact marking whose absence was reported.
 *
 * Every claim is paired with its opposite so no assertion can be satisfied by
 * painting more: the две равнозначни junctions must carry NO transverse line
 * (ЗДвП чл. 50 — priority to the right, no М7 anywhere), and the dash counts
 * must equal the fixed-pitch walk's, so re-spacing the rhythm cannot smuggle
 * in extra paint.
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
} from "../constants";
import { polylineLength, trimPolyline, type Vec2 } from "../math2d";
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

function load(id: string): District {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")));
  }
  throw new Error(`${id}.json not found in: ${candidates.join(", ")}`);
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

/** One painted vertex resolved into the edge's own frame. */
interface PaintPoint {
  /** Arclength along the edge geometry, m from geometry[0]. */
  s: number;
  /** Signed lateral offset from the centreline, + = right of geometry-forward. */
  t: number;
}

/**
 * Every marking vertex that belongs to `edgeId`, in that edge's (s, t) frame.
 * Vertices further than `maxLateral` from the centreline belong to another
 * edge (or to no edge at all) and are dropped — the districts here are single
 * junctions, so a generous 30 m still separates the arms cleanly.
 */
function paintOnEdge(built: Built, edgeId: string, maxLateral = 30): PaintPoint[] {
  const eb = built.net.edgeById.get(edgeId);
  if (!eb) throw new Error(`no edge ${edgeId}`);
  const geom = eb.edge.geometry as Vec2[];
  const cum = [0];
  for (let i = 1; i < geom.length; i++) {
    cum.push(cum[i - 1]! + Math.hypot(geom[i]![0] - geom[i - 1]![0], geom[i]![1] - geom[i - 1]![1]));
  }
  const pos = built.markings.markings.positionsView;
  const out: PaintPoint[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    // builders/mesh.toWorld is (x, h, -y): district y is the negated z.
    const x = pos[i]!;
    const y = -pos[i + 2]!;
    let best = Infinity;
    let bestS = 0;
    let bestT = 0;
    for (let k = 0; k < geom.length - 1; k++) {
      const a = geom[k]!;
      const b = geom[k + 1]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      let u = ((x - a[0]) * dx + (y - a[1]) * dy) / (len * len);
      u = Math.max(0, Math.min(1, u));
      const px = a[0] + dx * u;
      const py = a[1] + dy * u;
      const d = Math.hypot(x - px, y - py);
      if (d < best) {
        best = d;
        bestS = cum[k]! + u * len;
        // perpRight of the unit tangent (dy, -dx)/len — math2d's convention.
        bestT = ((x - px) * dy - (y - py) * dx) / len;
      }
    }
    if (best <= maxLateral) out.push({ s: bestS, t: bestT });
  }
  return out;
}

/** Contiguous runs of `points` along s (a gap > `gapM` starts a new run). */
function clusterAlongS(points: PaintPoint[], gapM: number): Array<{ from: number; to: number }> {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.s - b.s);
  const runs: Array<{ from: number; to: number }> = [];
  let from = sorted[0]!.s;
  let prev = from;
  for (const p of sorted.slice(1)) {
    if (p.s - prev > gapM) {
      runs.push({ from, to: prev });
      from = p.s;
    }
    prev = p.s;
  }
  runs.push({ from, to: prev });
  return runs;
}

/** The junction-trimmed line markings.ts actually walks on this edge. */
function drawnLine(built: Built, edgeId: string): { line: Vec2[]; s0: number; length: number } {
  const eb = built.net.edgeById.get(edgeId)!;
  const line = trimPolyline(eb.line as Vec2[], 0.8, 0.8, 2.5);
  if (!line) throw new Error(`edge ${edgeId} draws no line`);
  return { line, s0: eb.trimFrom + 0.8, length: polylineLength(line) };
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
    // 297 m of a 306 m street.
    const built = build(OV_LANE);
    const paint = paintOnEdge(built, "ov-ln-street");
    const centre = paint.filter((p) => Math.abs(p.t) < 1);
    const dashes = clusterAlongS(centre, DASH_LENGTH_M / 2);
    expect(dashes.length).toBeGreaterThanOrEqual(20);

    // On the axis, not merely near it: CENTER_LINE_WIDTH_M is 0.375, so every
    // vertex sits within half of that of t = 0.
    for (const p of centre) expect(Math.abs(p.t)).toBeLessThan(0.25);

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
    const paint = paintOnEdge(built, "ov-kr-road");
    for (const off of [-LANE_WIDTH_M, 0, LANE_WIDTH_M]) {
      const onBoundary = paint.filter((p) => Math.abs(p.t - off) < 0.25);
      const dashes = clusterAlongS(onBoundary, DASH_LENGTH_M / 2);
      expect(dashes.length, `boundary at ${off} m`).toBeGreaterThanOrEqual(20);
    }
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
    const paint = paintOnEdge(built, "tj-e-s");
    // The stop line is the only paint that crosses the carriageway: a band of
    // vertices sharing one arclength and spanning metres of lateral offset.
    const transverse = paint.filter((p) => Math.abs(p.t) > 1 && Math.abs(p.t) < 8.1);
    expect(transverse.length).toBe(2); // the two outer corners of the one quad

    const geomLen = polylineLength(eb.edge.geometry as Vec2[]);
    // trimTo is the cut at the node end; the arm's node end is s = geomLen.
    const expectedS = geomLen - eb.trimTo - STOP_LINE_BEYOND_CUT_M;
    for (const p of transverse) {
      expect(Math.abs(p.s - expectedS)).toBeLessThan(STOP_LINE_WIDTH_M);
    }
    // …and it spans the INCOMING half only, never the oncoming lane: every
    // vertex of the bar is on one side of the осева.
    const sides = new Set(paint.filter((p) => Math.abs(p.s - expectedS) < STOP_LINE_WIDTH_M).map((p) => Math.sign(p.t)));
    expect(sides.has(1) && sides.has(-1)).toBe(false);
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
      const centre = paintOnEdge(built, edgeId).filter((p) => Math.abs(p.t) < 0.25);
      const dashes = clusterAlongS(centre, DASH_LENGTH_M / 2);
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
      const centre = paintOnEdge(built, edgeId).filter((p) => Math.abs(p.t) < 0.25);
      expect(clusterAlongS(centre, DASH_LENGTH_M / 2).length).toBe(fixedPitchDashCount(length));
    });
  }

  it("a run too short for one whole dash stays unpainted", () => {
    // The other no-free-paint direction: fitting a rhythm to a stub must not
    // invent the stub's first dash. gapLen/2 + dashLen = 9 m is the threshold
    // the fixed-pitch walk had, and it is unchanged.
    expect(fixedPitchDashCount(DASH_GAP_M / 2 + DASH_LENGTH_M)).toBe(0);
    expect(fixedPitchDashCount(DASH_GAP_M / 2 + DASH_LENGTH_M + 0.01)).toBe(1);

    const built = build(STUB);
    const centre = paintOnEdge(built, "stub-e").filter((p) => Math.abs(p.t) < 0.25);
    expect(centre.length).toBe(0);
    // …and the edge is genuinely marked otherwise, so the zero above is the
    // dash rule and not a district the painter skipped wholesale.
    expect(built.markings.markingQuads).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. markingQuads counts the paint it emitted — including the Б1 М7 line
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
// 4. An angled crossing cannot hang the build
// ---------------------------------------------------------------------------

/** Minimal district-v1 with one marked street and one crossing on it. */
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
    crossings: [{ id: "skew-c", x: 0, y: 60, kind: "uncontrolled", signalized: false, edgeId: "skew-e", skewDeg }],
    buildings: [],
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
  crossings: [],
  buildings: [],
});

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
      expect(barAxisDeg(district, net), `${skew}°`).toBeCloseTo(skew, 0);
    }
  });

  it("skew 90° neither hangs the build nor deletes the crossing", { timeout: 20_000 }, () => {
    // Unclamped, the 1/cos widening asks for a 2.6e17 m span on this 16.25 m
    // street — about 1.9e17 bars — and the bar loop never returns: a world
    // build that hangs forever, with no error, from one bad number in a map
    // generator. assertDistrict validates nothing about skewDeg, so the domain
    // has to live here.
    const district = skewedCrossingDistrict(90);
    const net = analyzeNetwork(district);
    const m = buildMarkings(district, net, new Set(), new Set(), []);
    // Still PAINTED: runtime/zones grades this crossing off `paintsZebra`,
    // which knows nothing about skew, so refusing the paint would grade a
    // пешеходна пътека the world never drew.
    expect(m.zebraCrossings).toBe(1);
    expect(m.markingQuads).toBeLessThan(200);
    expect(barAxisDeg(district, net)).toBeCloseTo(60, 0);
  });
});

/** Angle of the zebra bars off the road axis, read back out of the mesh. */
function barAxisDeg(district: District, net: RoadNetwork): number {
  const m = buildMarkings(district, net, new Set(), new Set(), []);
  const pos = m.markings.positionsView;
  // The zebra is the only paint near y = 60; take one bar's four corners and
  // measure its long axis (the bar runs ZEBRA_LENGTH_M along the road).
  const bar: Vec2[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i]!;
    const y = -pos[i + 2]!;
    if (Math.abs(y - 60) < 6) bar.push([x, y]);
    if (bar.length === 4) break;
  }
  expect(bar.length).toBe(4);
  // paintQuad emits back-left, back-right, front-right, front-left; corner 0
  // to corner 3 is the along-bar edge.
  const a = bar[0]!;
  const d = bar[3]!;
  const deg = (Math.atan2(d[0] - a[0], d[1] - a[1]) * 180) / Math.PI;
  return Math.abs(deg) > 90 ? deg - Math.sign(deg) * 180 : deg;
}
