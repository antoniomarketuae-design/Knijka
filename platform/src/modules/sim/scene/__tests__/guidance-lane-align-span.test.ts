/**
 * guidance-lane-align-span — `DerivedRoute.laneAlign`: WHERE the product's
 * lane-align shift bent the route, published for the dev road probe (W59
 * steering spec §3.2, founder RULING-2) so the audit harness stops GUESSING it
 * from the turn markers.
 *
 * WHY IT EXISTS. `alignRawToGoalLane` slides the route into the goal's lane
 * over the final leg; its ease-in and its decay manufacture heading change
 * that is not the road's. The harness's AC-2 curved bucket must leave exactly
 * that out. Before this field the harness could only bound it from below by
 * the last >=30 deg TURN marker — a straight-through junction leaves no marker —
 * and so over-excluded whole final legs, bends included (the verifier's
 * route B below). Now the product says where it applied the shift.
 *
 * WHAT THIS FILE PROVES
 *   §1  the field changes NO painted value: every derivation of a fixed corpus
 *       over all shipped districts hashes byte-identically to commit 2c6d3cb,
 *       which had no such field;
 *   §2  the span is the one APPLIED: on synthetic roads every heading change
 *       the shift manufactures lies inside [legStartS, rampEndS] U
 *       [holdToS, decayEndS] widened by two route pitches (densify straddle +
 *       the 3-tap smoothing), and a real bend outside it keeps its full 90 deg;
 *   §3  the same on a shipped district, through the hold and the decay;
 *   §4  no shift => `null` (centreline goal, bay, gate, "ahead");
 *   §5  the probe copies it (dev only; production publishes nothing);
 *   §6  nothing paints or grades from it — no other product file names it;
 *   §7  the route fixtures the harness's tests measure are these derivations.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  ROAD_PROBE_VERSION,
  createRoadProbe,
  publishRoadProbeRoute,
  recordRoadProbeRoute,
  type RoadProbeHost,
} from "../../devrig/roadProbe";
import {
  LANE_ALIGN_RAMP_M,
  buildRouteGraph,
  deriveGuidanceRoute,
  type DerivedRoute,
  type RouteDistrictLike,
  type RouteTarget,
} from "../guidanceRoute";
import { WORLD_DIR, corpusHashes, districtCorpus } from "./paintedRouteCorpus";

const PITCH = 2.5; // guidanceRoute.ts DENSIFY_STEP_M
/** Densify straddles a kink over one pitch; the 3-tap pass spreads it one more. */
const KINK_REACH_M = 2 * PITCH;

/* ── fixtures ─────────────────────────────────────────────────────────────── */

/** A: straight north through a STRAIGHT-THROUGH junction at y = 100 (a side
 *  street leaves west, so it is a real joint that turns 0 deg and is never a
 *  turn marker), goal at y = 280, 8.125 m right of the centreline. */
function districtA(): RouteDistrictLike {
  return {
    roads: {
      nodes: [
        { id: "n0", x: 0, y: 0 },
        { id: "n1", x: 0, y: 100 },
        { id: "n2", x: 0, y: 400 },
        { id: "n3", x: -100, y: 100 },
      ],
      edges: [
        { id: "e1", from: "n0", to: "n1", oneway: false, geometry: [[0, 0], [0, 100]] },
        { id: "e2", from: "n1", to: "n2", oneway: false, geometry: [[0, 100], [0, 400]] },
        { id: "e3", from: "n1", to: "n3", oneway: false, geometry: [[0, 100], [-100, 100]] },
      ],
    },
  };
}

/** B: 95 m north, a 90 deg right-hand BEND of radius 15 m (s ~ 95-119) inside
 *  the edge, then east. B1 has no junction at all; B2 has one at s ~ 130,
 *  after the bend (a side street leaves south). Goal 150 m east of the bend's
 *  end, 8.125 m right (south) of the centreline. */
function bendGeometry(): [number, number][] {
  const g: [number, number][] = [[0, 0], [0, 95]];
  for (let k = 1; k <= 12; k++) {
    const a = ((k / 12) * Math.PI) / 2;
    g.push([15 - 15 * Math.cos(a), 95 + 15 * Math.sin(a)]);
  }
  g.push([215, 110]);
  return g;
}
function districtB(junctionAfterBend: boolean): RouteDistrictLike {
  const g = bendGeometry();
  if (!junctionAfterBend) {
    return {
      roads: {
        nodes: [{ id: "n0", x: 0, y: 0 }, { id: "n2", x: 215, y: 110 }],
        edges: [{ id: "e1", from: "n0", to: "n2", oneway: false, geometry: g }],
      },
    };
  }
  const jx = 15 + (130 - 95 - Math.PI * 7.5);
  return {
    roads: {
      nodes: [
        { id: "n0", x: 0, y: 0 },
        { id: "n1", x: jx, y: 110 },
        { id: "n2", x: 215, y: 110 },
        { id: "n3", x: jx, y: 0 },
      ],
      edges: [
        { id: "e1", from: "n0", to: "n1", oneway: false, geometry: [...g.slice(0, g.length - 1), [jx, 110]] },
        { id: "e2", from: "n1", to: "n2", oneway: false, geometry: [[jx, 110], [215, 110]] },
        { id: "e3", from: "n1", to: "n3", oneway: false, geometry: [[jx, 110], [jx, 0]] },
      ],
    },
  };
}

const START = { x: 0, y: 0, headingDeg: 0 };
function routeA(): DerivedRoute {
  return deriveGuidanceRoute(buildRouteGraph(districtA()), START, { kind: "point", x: 8.125, y: 280 })!;
}
function routeB(junctionAfterBend: boolean): DerivedRoute {
  return deriveGuidanceRoute(buildRouteGraph(districtB(junctionAfterBend)), START, { kind: "point", x: 165, y: 110 - 8.125 })!;
}

/** Signed heading change at every interior vertex: [arc, degrees]. */
function vertexTurns(r: DerivedRoute): [number, number][] {
  const out: [number, number][] = [];
  let prev: number | null = null;
  for (let i = 0; i + 1 < r.count; i++) {
    const h = (Math.atan2(r.pts[2 * i + 2] - r.pts[2 * i], r.pts[2 * i + 3] - r.pts[2 * i + 1]) * 180) / Math.PI;
    if (prev !== null) out.push([r.arc[i], ((h - prev + 540) % 360) - 180]);
    prev = h;
  }
  return out;
}

/** The manufactured stretches, widened by the kink reach. */
function spanWindows(r: DerivedRoute): [number, number][] {
  const a = r.laneAlign!;
  return [
    [a.legStartS - KINK_REACH_M, a.rampEndS + KINK_REACH_M],
    [a.holdToS - KINK_REACH_M, a.decayEndS + KINK_REACH_M],
  ];
}
const inside = (s: number, w: [number, number][]) => w.some(([a, b]) => s >= a - 1e-3 && s <= b + 1e-3);

/* ── §1 ───────────────────────────────────────────────────────────────────── */

describe("§1 the field changes NO painted value — byte-identical to 2c6d3cb over every shipped district", () => {
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "guidance-painted-2c6d3cb.json"), "utf8"));

  it("every district's corpus hashes exactly as it did before `laneAlign` existed", () => {
    const now = corpusHashes();
    expect(Object.keys(now).length).toBeGreaterThanOrEqual(100);
    expect(now).toEqual(golden);
  });

  it("…and the corpus exercises the field: shifts applied, every route carries the key", () => {
    let withSpan = 0;
    let derived = 0;
    for (const f of fs.readdirSync(WORLD_DIR).filter((x) => x.endsWith(".json")).sort()) {
      const d = JSON.parse(fs.readFileSync(path.join(WORLD_DIR, f), "utf8")) as RouteDistrictLike;
      if (!d?.roads?.edges) continue;
      for (const e of districtCorpus(d)) {
        if (!e.route) continue;
        derived += 1;
        expect("laneAlign" in e.route, `${f} ${e.label}: laneAlign not set`).toBe(true);
        if (e.route.laneAlign) withSpan += 1;
      }
    }
    expect(derived).toBeGreaterThan(5000);
    expect(withSpan).toBeGreaterThan(1000);
  });
});

/* ── §2 ───────────────────────────────────────────────────────────────────── */

describe("§2 the span is the one APPLIED — every manufactured heading change is inside it", () => {
  it("A: a straight-through junction at 100 opens the ease-in THERE (no turn marker exists for it)", () => {
    const r = routeA();
    expect(r.turns).toEqual([]);
    const a = r.laneAlign!;
    expect(a.legStartS).toBeCloseTo(100, 0);
    expect(a.rampInM).toBe(LANE_ALIGN_RAMP_M);
    expect(a.rampEndS).toBeCloseTo(140, 0);
    expect(a.goalS).toBeGreaterThan(278);
    expect(a.offsetM).toBeCloseTo(8.125, 3);
    expect(a.w0).toBe(0);
    // No look-ahead: the route ends at the goal, so hold and decay collapse onto it.
    expect(a.holdToS).toBeCloseTo(a.goalS, 6);
    expect(a.decayEndS).toBeGreaterThanOrEqual(a.holdToS);
    const turns = vertexTurns(r).filter(([, d]) => Math.abs(d) > 0.05);
    expect(turns.length).toBeGreaterThan(4); // the ramp IS there…
    for (const [s, d] of turns) {
      expect(inside(s, spanWindows(r)), `a ${d.toFixed(2)} deg turn at s=${s.toFixed(1)} lies outside the span`).toBe(true);
    }
    // …and it opens no earlier than the kink reach before the joint.
    expect(Math.min(...turns.map(([s]) => s))).toBeGreaterThanOrEqual(a.legStartS - KINK_REACH_M - 1e-3);
  });

  it("B1: no junction => the ease-in is the route's first 40 m, and the BEND past it keeps its whole 90 deg", () => {
    const r = routeB(false);
    const a = r.laneAlign!;
    expect(a.legStartS).toBe(0);
    expect(a.rampEndS).toBeCloseTo(40, 0);
    const bend = vertexTurns(r).filter(([s]) => !inside(s, spanWindows(r)));
    const bendDeg = bend.reduce((acc, [, d]) => acc + d, 0);
    expect(bendDeg).toBeCloseTo(90, 0); // the parallel offset keeps the road's heading change
    const bendS = bend.filter(([, d]) => Math.abs(d) > 0.05).map(([s]) => s);
    expect(Math.min(...bendS)).toBeGreaterThan(85);
    expect(Math.max(...bendS)).toBeLessThan(125);
  });

  it("B2: a junction AFTER the bend opens the ease-in there — the bend before it is outside the span", () => {
    const r = routeB(true);
    const a = r.laneAlign!;
    expect(a.legStartS).toBeCloseTo(130, 0);
    expect(a.rampEndS).toBeCloseTo(170, 0);
    let bendDeg = 0;
    for (const [s, d] of vertexTurns(r)) {
      if (Math.abs(d) <= 0.05) continue;
      if (s < 124) {
        expect(inside(s, spanWindows(r)), `bend vertex at ${s} excluded`).toBe(false);
        bendDeg += d;
      } else expect(inside(s, spanWindows(r)), `ramp vertex at ${s} not excluded`).toBe(true);
    }
    expect(bendDeg).toBeCloseTo(90, 0);
  });
});

/* ── §3 ───────────────────────────────────────────────────────────────────── */

function lnGraph() {
  const d = JSON.parse(fs.readFileSync(path.join(WORLD_DIR, "ln-v1.json"), "utf8")) as RouteDistrictLike;
  return buildRouteGraph(d);
}

describe("§3 on a shipped district (ln-v1, one straight edge): the hold and the decay", () => {
  // Every heading change on a straight edge is the shift's.
  const check = (r: DerivedRoute) => {
    const turns = vertexTurns(r).filter(([, d]) => Math.abs(d) > 0.05);
    expect(turns.length).toBeGreaterThan(0);
    for (const [s, d] of turns) expect(inside(s, spanWindows(r)), `a ${d.toFixed(2)} deg turn at s=${s.toFixed(1)}`).toBe(true);
  };

  it("a same-lane look-ahead HOLDS the lane to it — holdToS moves to the look-ahead waypoint", () => {
    const r = deriveGuidanceRoute(lnGraph(), { x: 4.06, y: 15, headingDeg: 0 }, { kind: "point", x: 12.19, y: 200 }, {
      lookahead: [{ kind: "point", x: 12.19, y: 340 }],
    })!;
    const a = r.laneAlign!;
    expect(a.holdToS).toBeGreaterThan(a.goalS + 100);
    expect(a.w0).toBeGreaterThan(0); // seeded by the driver's own offset (legStartS = 0)
    check(r);
  });

  it("a look-ahead in ANOTHER lane decays past the goal — the decay is inside the span", () => {
    const r = deriveGuidanceRoute(lnGraph(), { x: 4.06, y: 15, headingDeg: 0 }, { kind: "point", x: 12.19, y: 200 }, {
      lookahead: [{ kind: "point", x: -4.06, y: 340 }],
    })!;
    const a = r.laneAlign!;
    expect(a.holdToS).toBeCloseTo(a.goalS, 6);
    expect(Math.abs(a.decayEndS - (a.holdToS + LANE_ALIGN_RAMP_M))).toBeLessThan(PITCH * 1.5);
    check(r);
  });
});

/* ── §4 ───────────────────────────────────────────────────────────────────── */

describe("§4 no shift applied => laneAlign is null, never a zero-width span", () => {
  const g = () => buildRouteGraph(districtA());
  it("a goal on the centreline", () => {
    expect(deriveGuidanceRoute(g(), START, { kind: "point", x: 0, y: 280 })!.laneAlign).toBeNull();
  });
  it("an off-road bay, a gate, and an 'ahead' corridor", () => {
    expect(deriveGuidanceRoute(g(), START, { kind: "point", x: 8.125, y: 280, offRoad: true })!.laneAlign).toBeNull();
    const gate = { kind: "point", x: 8.125, y: 280, shape: { kind: "gate" } } as unknown as RouteTarget;
    expect(deriveGuidanceRoute(g(), START, gate)!.laneAlign).toBeNull();
    expect(deriveGuidanceRoute(g(), START, { kind: "ahead", meters: 120 })!.laneAlign).toBeNull();
  });
});

/* ── §5 ───────────────────────────────────────────────────────────────────── */

describe("§5 the dev probe copies the span; production publishes nothing", () => {
  it("the probe version moved to 2 with the new field", () => {
    expect(ROAD_PROBE_VERSION).toBe(2);
  });

  it("the published route carries a COPY of laneAlign (a later edit of the source changes nothing)", () => {
    const probe = createRoadProbe();
    const r = routeA();
    recordRoadProbeRoute(probe, r, 0);
    expect(probe.route!.laneAlign).toEqual(r.laneAlign);
    expect(probe.route!.laneAlign).not.toBe(r.laneAlign);
    const before = { ...probe.route!.laneAlign! };
    (r.laneAlign as { legStartS: number }).legStartS = -1;
    expect(probe.route!.laneAlign).toEqual(before);
  });

  it("null stays null; a source without the field publishes it ABSENT (unknown), never null", () => {
    const probe = createRoadProbe();
    recordRoadProbeRoute(probe, deriveGuidanceRoute(buildRouteGraph(districtA()), START, { kind: "point", x: 0, y: 280 }), 0);
    expect(probe.route!.laneAlign).toBeNull();
    const { laneAlign: _drop, ...bare } = routeA();
    void _drop;
    recordRoadProbeRoute(probe, bare, 1);
    expect("laneAlign" in probe.route!).toBe(false);
  });

  it("NODE_ENV=production: a route WITH a span publishes nothing at all", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const host: RoadProbeHost = {};
      publishRoadProbeRoute(host, routeA());
      expect(host.__roadProbe).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

/* ── §6 ───────────────────────────────────────────────────────────────────── */

describe("§6 nothing paints or grades from it", () => {
  it("no product file but guidanceRoute.ts and devrig/roadProbe.ts names `laneAlign`", () => {
    const src = path.resolve(__dirname, "../../../..");
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name === "__tests__" || e.name === "node_modules") continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          if (/\blaneAlign\b/.test(fs.readFileSync(p, "utf8"))) hits.push(path.relative(src, p).replace(/\\/g, "/"));
        }
      }
    };
    walk(src);
    expect(hits.sort()).toEqual(["modules/sim/devrig/roadProbe.ts", "modules/sim/scene/guidanceRoute.ts"]);
  });
});

/* ── §7 ───────────────────────────────────────────────────────────────────── */

describe("§7 the harness's route fixtures ARE these derivations, as the probe publishes them", () => {
  const FIX = path.resolve(__dirname, "../../../../../../tools/mobile/__tests__/fixtures/road-routes-w59.json");

  function published(r: DerivedRoute) {
    const probe = createRoadProbe();
    recordRoadProbeRoute(probe, r, 0);
    return JSON.parse(JSON.stringify(probe.route));
  }

  it("A, B1 and B2 in tools/mobile/__tests__/fixtures/road-routes-w59.json match a live derivation", () => {
    const live: Record<string, ReturnType<typeof published>> = {
      A: published(routeA()),
      B1: published(routeB(false)),
      B2: published(routeB(true)),
    };
    const fix = JSON.parse(fs.readFileSync(FIX, "utf8"));
    for (const k of ["A", "B1", "B2"]) {
      const f = fix[k];
      const l = live[k];
      expect(f.count, k).toBe(l.count);
      expect(f.goalS, k).toBeCloseTo(l.goalS, 4);
      for (const key of Object.keys(l.laneAlign)) expect(f.laneAlign[key], `${k}.laneAlign.${key}`).toBeCloseTo(l.laneAlign[key], 4);
      for (let i = 0; i < l.pts.length; i++) expect(Math.abs(f.pts[i] - l.pts[i]), `${k} pts[${i}]`).toBeLessThan(1e-4);
    }
  });
});
