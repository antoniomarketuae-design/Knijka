/**
 * The two halves of founder item B81 („there are no marking on the roads. This
 * marking is major issue which has to be GLOBALLY FIXED as well"), pinned.
 *
 * 1. THE CARRIAGEWAY EDGE LINE IS PAINT, NOT FURNITURE. It used to be gated on
 *    `ARTERIAL_CLASSES`, whose own docstring is „streetlights" and which
 *    props.ts uses for street trees and lamp posts. Borrowing it made the edge
 *    line wrong at both ends: a MOTORWAY got none (a motorway carries no street
 *    furniture), and so did every `residential`/`unclassified` street — 444 of
 *    the world's 698 marked edges, 63.6%, across 83 of 100 built districts. On
 *    the street his row 49 was driven on (`ov-narrow-v1`) the entire painted
 *    vocabulary of a 16.25 m carriageway was one dashed осева.
 *
 * 2. THE М18 „ТРИЪГЪЛНИК" EXISTS NOW. Наредба № 2/2001 чл. 23, ал. 1 puts the
 *    М7 линия за изчакване at a Б1-controlled junction (the world has painted
 *    that since v1); ал. 3 lets the carriageway carry the М18 triangle before
 *    it, „с връх, насочен срещу водачите, които трябва да пропуснат". The
 *    theory bank TEACHES the symbol — `q-krastovishta-062` is a live, law-cited
 *    exam question about exactly this pair — and the simulator could not draw
 *    it, so a student met it in the exam and never once on the road.
 *
 * The apex direction is the whole legal content of ал. 3, so it is asserted by
 * measurement (does the apex sit FURTHER from the node than the base?), not by
 * a quad count that would stay green with the symbol drawn upside down.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeNetwork } from "../builders/network";
import { buildMarkings } from "../builders/markings";
import {
  EDGE_LINE_CLASSES,
  GIVE_WAY_TRIANGLE_LENGTH_M,
  GIVE_WAY_TRIANGLE_SETBACK_M,
  MARKED_CLASSES,
  paintsEdgeLine,
} from "../builders/constants";
import { assertDistrict, type District } from "../types";

const EMPTY: ReadonlySet<string> = new Set();

function loadDistrict(id: string): District {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
    path.join(process.cwd(), "public", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")));
  }
  throw new Error(`${id}.json not found in ${candidates.join(", ")}`);
}

// ---------------------------------------------------------------------------
// 1 — the edge line is decided by a set about PAINT
// ---------------------------------------------------------------------------

describe("EDGE_LINE_CLASSES — the carriageway edge line stopped riding on the furniture set", () => {
  it("covers every marked class except the one where an edge line would be a lie", () => {
    // `living_street` (жилищна зона) is a shared surface: the carriageway edge
    // is the thing that is deliberately NOT defined there.
    const missing = [...MARKED_CLASSES].filter((c) => !EDGE_LINE_CLASSES.has(c));
    expect(missing).toEqual(["living_street"]);
    // …and nothing is in the paint set that the painter would never reach.
    for (const c of EDGE_LINE_CLASSES) expect(MARKED_CLASSES.has(c)).toBe(true);
  });

  it("a motorway and a residential street both paint one now (they both painted none)", () => {
    expect(paintsEdgeLine({ class: "motorway" })).toBe(true);
    expect(paintsEdgeLine({ class: "residential" })).toBe(true);
    expect(paintsEdgeLine({ class: "unclassified" })).toBe(true);
    expect(paintsEdgeLine({ class: "living_street" })).toBe(false);
    // A car-park aisle carries bay paint, not carriageway lines.
    expect(paintsEdgeLine({ class: "service" })).toBe(false);
  });

  it("ov-narrow-v1 — his row-49 street — now carries a solid line down BOTH kerbs", () => {
    const district = loadDistrict("ov-narrow-v1");
    const net = analyzeNetwork(district);
    const eb = net.edges[0]!;
    expect(eb.edge.class).toBe("residential");
    const m = buildMarkings(district, net, EMPTY, EMPTY);
    const p = m.markings.toMeshData().positions;
    // travelHalf − EDGE_LINE_INSET_M on a street with no parking band.
    const edgeOff = eb.halfWidth - eb.parkingM - 0.5;
    let left = 0;
    let right = 0;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]!;
      if (Math.abs(x - edgeOff) < 0.4) right++;
      if (Math.abs(x + edgeOff) < 0.4) left++;
    }
    expect(right).toBeGreaterThan(0);
    expect(left).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2 — М18 „триъгълник" (Наредба № 2/2001 чл. 23, ал. 3)
// ---------------------------------------------------------------------------

describe("М18 «триъгълник» — the give-way symbol the theory bank teaches", () => {
  const ID = "jxg-giveway-v1";

  it("is painted at every approach that already carries an М7 линия за изчакване", () => {
    const district = loadDistrict(ID);
    const net = analyzeNetwork(district);
    const giveWay = new Set<string>();
    for (const node of net.nodes.values()) {
      if (node.degree < 3) continue;
      for (const ap of node.approaches) {
        if (ap.incoming) giveWay.add(`${node.id}:${ap.edgeId}`);
      }
    }
    expect(giveWay.size).toBeGreaterThan(0);
    const m = buildMarkings(district, net, EMPTY, giveWay);
    expect(m.giveWayTriangles).toBe(giveWay.size);
    // …and not one symbol appears where no М7 line does.
    const none = buildMarkings(district, net, EMPTY, EMPTY);
    expect(none.giveWayTriangles).toBe(0);
  });

  it("points its APEX at the driver who must give way — the legal content of ал. 3", () => {
    const district = loadDistrict(ID);
    const net = analyzeNetwork(district);
    // ONE approach only, so the measurement names a single symbol.
    let target: { node: string; edgeId: string } | null = null;
    for (const node of net.nodes.values()) {
      if (node.degree < 3 || target) continue;
      for (const ap of node.approaches) {
        if (ap.incoming && !target) target = { node: node.id, edgeId: ap.edgeId };
      }
    }
    expect(target).not.toBeNull();
    const key = `${target!.node}:${target!.edgeId}`;
    const one = buildMarkings(district, net, EMPTY, new Set([key]));
    expect(one.giveWayTriangles).toBe(1);
    const withSym = one.markings.toMeshData();

    // The М7 line and then the symbol are the last two things painted at this
    // approach, and the symbol is the ONLY triangle in the buffer — every other
    // marking primitive is a quad (6 indices), so the tail 3 indices are it.
    const idx = withSym.indices;
    const p = withSym.positions;
    const tri = [idx[idx.length - 3]!, idx[idx.length - 2]!, idx[idx.length - 1]!];
    expect(new Set(tri).size).toBe(3);
    const pts = tri.map((vi) => ({ x: p[3 * vi]!, y: -p[3 * vi + 2]! }));

    const node = net.nodes.get(target!.node)!;
    const ap = node.approaches.find((a) => a.edgeId === target!.edgeId)!;
    const away = ap.cutTangentAway;
    // Distance of each corner ALONG the away axis, measured from the node.
    const along = pts.map((q) => (q.x - node.pos[0]) * away[0] + (q.y - node.pos[1]) * away[1]);
    const sorted = [...along].sort((a, b) => a - b);
    // Two base corners share a distance; the apex is the odd one FURTHER out —
    // i.e. on the side the giving-way driver approaches from.
    expect(Math.abs(sorted[0]! - sorted[1]!)).toBeLessThan(1e-6);
    expect(sorted[2]! - sorted[1]!).toBeCloseTo(GIVE_WAY_TRIANGLE_LENGTH_M, 5);

    // …and the whole symbol sits BEFORE the М7 line, never across it.
    const lineAt = ap.setback + 0.6; // cut + STOP_LINE_BEYOND_CUT_M
    expect(sorted[0]! - lineAt).toBeCloseTo(GIVE_WAY_TRIANGLE_SETBACK_M, 5);
  });

  it("never paints on the oncoming half, and never over the kerb", () => {
    const district = loadDistrict(ID);
    const net = analyzeNetwork(district);
    for (const node of net.nodes.values()) {
      if (node.degree < 3) continue;
      for (const ap of node.approaches) {
        if (!ap.incoming) continue;
        const key = `${node.id}:${ap.edgeId}`;
        const base = buildMarkings(district, net, EMPTY, EMPTY).markings.toMeshData();
        const m = buildMarkings(district, net, EMPTY, new Set([key]));
        if (m.giveWayTriangles === 0) continue;
        const mesh = m.markings.toMeshData();
        const p = mesh.positions;
        const away = ap.cutTangentAway;
        const right: [number, number] = [away[1], -away[0]]; // perpRight(away)
        const travelHalf = ap.halfWidth - ap.parkingM;
        for (let vi = base.positions.length / 3; vi < p.length / 3; vi++) {
          const q: [number, number] = [p[3 * vi]!, -p[3 * vi + 2]!];
          const d = (q[0] - ap.cut[0]) * right[0] + (q[1] - ap.cut[1]) * right[1];
          // Incoming half is the −right side of `away`; allow the М7 dash that
          // starts at 0.15 m off the axis.
          expect(d).toBeLessThanOrEqual(0.001);
          expect(-d).toBeLessThanOrEqual(travelHalf + 0.001);
        }
      }
    }
  });
});
