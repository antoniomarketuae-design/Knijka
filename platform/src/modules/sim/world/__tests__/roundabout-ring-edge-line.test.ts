/**
 * B16 — THE OUTER BOUNDARY OF THE RING, AS PAINT.
 *
 * The founder, four times now, ending „this is not proper round-about it doesnt
 * have the proper shape". Three previous passes each closed a real half of it —
 * the central island, the off-mouth outer kerb, the kerb returns that gave every
 * mouth edges — and every one of them spends the same currency: KERB. Kerb
 * cannot close a mouth, because a mouth is where cars drive in. So the outer
 * boundary of the rings he actually drives is, and must remain, mostly gap:
 *
 *     rb-mini-v1    mouth union 206.0°   outer kerb 154.0°
 *     rb-ped-v1     mouth union 206.0°   outer kerb 154.0°
 *     rb-2lane-v1   mouth union 246.0°   outer kerb 114.0°
 *     district-v1   mouth union 184.5°   outer kerb 175.5°
 *
 * WHAT THIS FILE LOCKS, AND THE MEASUREMENT THAT FORCED IT. Paint has none of
 * the kerb's problem — a driver may cross paint — so paint may close the full
 * 360°. Counted on the shipped `markings` buffer before `buildRingEdgeLine`
 * existed, the largest angular gap with NO marking anywhere within ±1 m of the
 * ring's outer edge was:
 *
 *     rb-mini-v1    360°   (not one square centimetre, on any bearing)
 *     rb-ped-v1     360°
 *     rb-2lane-v1   360°
 *     district-v1   189°
 *     rb-single-v1   53°
 *
 * — i.e. on the three tight rings the annulus the student is meant to read had
 * a boundary on its INNER side only, and the only circular thing in the world
 * was an island kerb 13.75 m away. After: 4° / 4° / 3° / 4° / 2°.
 *
 * Cost, measured on the same build: +1.0 % to +2.3 % triangles (rb-mini
 * 31 080 → 31 402) and **zero** new draw slots on every ring — the quads go
 * into the SAME `markings` accumulator every lane line already lives in.
 *
 * The two invariants are stated the way a driver meets them:
 *   1. the circle is CLOSED — no bearing on a drawn ring is far from a marking
 *      on the outer edge of the circulatory carriageway;
 *   2. it is BROKEN at the mouths and SOLID between them — a solid line across
 *      an entry would say „do not cross" about the one place you must.
 *
 * And the refusal is locked too: a registration whose island this module
 * refuses (d2-v1 — a primary boulevard is drawn through its interior) gets no
 * painted circle either. A map may be missing a circle; it may not be given a
 * false one.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { analyzeNetwork } from "../builders/network";
import {
  analyzeRoundabouts,
  ringBearingInMouth,
  ringOuterRadiusAt,
  type RoundaboutRing,
} from "../builders/roundabout";
import { assertDistrict, type District } from "../types";

/** builders/constants.ts EDGE_LINE_INSET_M — copied, not imported: this asserts
 *  the SHIPPED geometry, so it must not follow the constant silently. */
const EDGE_LINE_INSET_M = 0.5;

/** Bearings probed round the circle. 720 = one every half degree, which is
 *  finer than the 1.2 m dash pitch subtends on the smallest shipped ring. */
const PROBE_BEARINGS = 720;

/** Rings whose island IS drawn — the ones that get an edge line. */
const DRAWN_RING_DISTRICTS = [
  "rb-mini-v1",
  "rb-ped-v1",
  "rb-2lane-v1",
  "rb-single-v1",
  "district-v1",
] as const;

function readDistrict(districtId: string): District {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${districtId}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${districtId}.json`),
    path.join(process.cwd(), "public", "world", `${districtId}.json`),
  ];
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) throw new Error(`${districtId}.json not found in ${candidates.join(", ")}`);
  return assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")));
}

const WORLDS = new Map<string, ReturnType<typeof buildWorldGeometry>>();
function worldOf(districtId: string) {
  const cached = WORLDS.get(districtId);
  if (cached) return cached;
  const built = buildWorldGeometry(readDistrict(districtId), { seed: 7 });
  WORLDS.set(districtId, built);
  return built;
}

const ringsOf = (d: District) => analyzeRoundabouts(d, analyzeNetwork(d));

/**
 * Is the point at `bearing`, on the ring's edge-line radius, covered by a
 * painted triangle?
 *
 * Point-in-TRIANGLE rather than nearest-vertex, because a vertex probe answers
 * a different question: the line is walked in 0.6 m steps, so its vertices sit
 * 1.6° apart on rb-mini and a bearing between two of them reads as bare no
 * matter how solid the paint is. That artifact under-reported the closed circle
 * by a third when this pass was first measured, and a test written on it would
 * have been a test of the probe.
 */
function paintedAt(
  ring: RoundaboutRing,
  tris: ReadonlyArray<readonly [number, number, number, number, number, number]>,
  bearing: number,
): boolean {
  const r = ringOuterRadiusAt(ring, bearing) - EDGE_LINE_INSET_M;
  const px = ring.centre[0] + Math.cos(bearing) * r;
  const py = ring.centre[1] + Math.sin(bearing) * r;
  for (const t of tris) {
    const [ax, ay, bx, by, cx, cy] = t;
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) return true;
  }
  return false;
}

/** Painted marking triangles within a metre of this ring's outer edge, in
 *  district space. Prefiltered by radius so the probe stays cheap on the two
 *  OSM districts (district-v1 paints 2 640 marking quads). */
function ringEdgeTriangles(
  ring: RoundaboutRing,
  markings: { positions: Float32Array; indices: Uint32Array },
): Array<[number, number, number, number, number, number]> {
  const out: Array<[number, number, number, number, number, number]> = [];
  const { positions: p, indices: ix } = markings;
  // toWorld maps district (x, y) → three (x, ·, −y); recover y from −z.
  const dx = (i: number) => p[i * 3]! - ring.centre[0];
  const dy = (i: number) => -p[i * 3 + 2]! - ring.centre[1];
  for (let i = 0; i + 2 < ix.length; i += 3) {
    const ia = ix[i]!;
    const ib = ix[i + 1]!;
    const ic = ix[i + 2]!;
    let near = false;
    for (const v of [ia, ib, ic]) {
      const r = Math.hypot(dx(v), dy(v));
      const outer = ringOuterRadiusAt(ring, Math.atan2(dy(v), dx(v)));
      if (Math.abs(r - outer) <= 1.5) {
        near = true;
        break;
      }
    }
    if (!near) continue;
    out.push([dx(ia), dy(ia), dx(ib), dy(ib), dx(ic), dy(ic)]);
  }
  // Triangles are stored centre-relative; shift the probe the same way.
  return out.map(
    (t) =>
      [
        t[0] + ring.centre[0],
        t[1] + ring.centre[1],
        t[2] + ring.centre[0],
        t[3] + ring.centre[1],
        t[4] + ring.centre[0],
        t[5] + ring.centre[1],
      ] as [number, number, number, number, number, number],
  );
}

describe("B16 — the ring's outer edge is drawn as a circle", () => {
  it.each(DRAWN_RING_DISTRICTS)(
    "%s: no bearing on the ring is more than 8° from paint on the outer edge",
    (id) => {
      const district = readDistrict(id);
      const ring = ringsOf(district).find((r) => r.islandRadiusM !== null)!;
      expect(ring).toBeDefined();
      const tris = ringEdgeTriangles(ring, worldOf(id).markings);

      const hit: boolean[] = [];
      for (let i = 0; i < PROBE_BEARINGS; i++) {
        hit.push(paintedAt(ring, tris, (i / PROBE_BEARINGS) * Math.PI * 2));
      }
      expect(hit.some(Boolean), `${id}: no paint anywhere on the outer edge`).toBe(true);

      // Longest unpainted run, wrapped. Before this pass it was the whole
      // circle on rb-mini / rb-ped / rb-2lane and 189° on district-v1.
      let worst = 0;
      let run = 0;
      for (let i = 0; i < PROBE_BEARINGS * 2; i++) {
        run = hit[i % PROBE_BEARINGS] ? 0 : run + 1;
        worst = Math.max(worst, run);
      }
      const worstDeg = (worst / PROBE_BEARINGS) * 360;
      expect(worstDeg, `${id}: largest bare arc on the outer edge`).toBeLessThanOrEqual(8);
    },
  );

  it.each(DRAWN_RING_DISTRICTS)(
    "%s: the line is solid between the mouths and broken across them",
    (id) => {
      const district = readDistrict(id);
      const ring = ringsOf(district).find((r) => r.islandRadiusM !== null)!;
      const tris = ringEdgeTriangles(ring, worldOf(id).markings);

      let offMouth = 0;
      let offMouthPainted = 0;
      let inMouth = 0;
      let inMouthPainted = 0;
      for (let i = 0; i < PROBE_BEARINGS; i++) {
        const b = (i / PROBE_BEARINGS) * Math.PI * 2;
        const painted = paintedAt(ring, tris, b);
        if (ringBearingInMouth(ring, b)) {
          inMouth++;
          if (painted) inMouthPainted++;
        } else {
          offMouth++;
          if (painted) offMouthPainted++;
        }
      }

      // Off the mouths the boundary is kerb and the line is continuous. (Not
      // 100 %: the probe samples the ring circle, and where an OSM ring's
      // profile steps between 1° buckets the line steps with it.)
      expect(offMouthPainted / offMouth, `${id} off-mouth coverage`).toBeGreaterThan(0.9);

      // Across a mouth it must be BROKEN — "you may cross this". A solid line
      // there would be the opposite instruction at the one place it matters.
      expect(inMouth, `${id} has mouths`).toBeGreaterThan(0);
      const gapFraction = inMouthPainted / inMouth;
      expect(gapFraction, `${id} in-mouth coverage (must not be solid)`).toBeLessThan(0.75);
      expect(gapFraction, `${id} in-mouth coverage (must not be absent)`).toBeGreaterThan(0.3);
    },
  );

  it("d2-v1: an island this module REFUSES gets no painted circle either", () => {
    // Real Sofia, eight arms, бул. „Пейо К. Яворов" drawn straight through the
    // interior. The island is refused because the middle is not free; a painted
    // ring round a shape that is not a ring is the same lie in cheaper paint.
    const district = readDistrict("d2-v1");
    const rings = ringsOf(district);
    expect(rings.every((r) => r.islandRadiusM === null)).toBe(true);
    const ring = rings[0]!;
    const tris = ringEdgeTriangles(ring, worldOf("d2-v1").markings);
    let painted = 0;
    for (let i = 0; i < PROBE_BEARINGS; i++) {
      if (paintedAt(ring, tris, (i / PROBE_BEARINGS) * Math.PI * 2)) painted++;
    }
    // Whatever the boulevard's own lane lines contribute is left alone; what
    // must NOT appear is a closed circle.
    expect(painted / PROBE_BEARINGS).toBeLessThan(0.5);
  });

  it("costs no new draw slot on any ring district", () => {
    // The whole defence of doing this in paint rather than in kerb or props:
    // `markings` is one mesh that already exists on every map, so a closed
    // circle is free at the only budget that is currently breached (register
    // B65 (d): the running product is 3–5× over its own draw-call cap).
    // WAVE 8 — every one of these rose by exactly ONE, and none of the rise is
    // the ring: `Streetlights` gained a night-only ground pool
    // (sc-ov-night-gap:5085441f — „every street lamp along the road is dark …
    // the only light in the scene is the ego's own beam"), and `drawSlots.ts`
    // counts it unconditionally because a ceiling that only holds by day is not
    // a ceiling. All six of these districts have streetlights, which is why the
    // delta is uniform; a map with none is byte-identical.
    const expected: Record<string, number> = {
      "rb-mini-v1": 49,
      "rb-ped-v1": 51,
      "rb-2lane-v1": 49,
      "rb-single-v1": 49,
      "district-v1": 64,
      "d2-v1": 71,
    };
    const actual: Record<string, number> = {};
    for (const id of Object.keys(expected)) actual[id] = worldOf(id).stats.staticDrawSlots;
    expect(actual).toEqual(expected);
  });
});
