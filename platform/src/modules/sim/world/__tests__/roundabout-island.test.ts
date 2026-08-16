/**
 * ROUNDABOUT SHAPE contracts (doc 87 FR-22).
 *
 * The founder, twice: „this is not proper round-about it doesnt have the proper
 * shape", then „a Round a bout is a Cyrcle, it has sphere shape not a triangle
 * or square shape in any kind."
 *
 * Six districts register a ring. Until this battery existed the world builder
 * drew NONE of the four things that make a roundabout a roundabout: no central
 * island, no circular kerb, no annular carriageway, no ring markings. What it
 * drew was four ordinary junction pads of ~17 m radius around an 18 m ring,
 * which union into an open plaza — a square with rounded corners.
 *
 * So the invariants worth locking are, in the order a driver meets them:
 *   1. the island lands EXACTLY on the inner edge of the circulatory
 *      carriageway (one metre out and it either paves the ring or leaves a
 *      grass gutter in the traffic lane);
 *   2. it is big enough to swallow the star-shaped inner corner aprons the pads
 *      used to leave in the middle — the thing actually photographed;
 *   3. NO junction asphalt survives inside it (the pads are suppressed, not
 *      merely covered);
 *   4. the kerb is a circle and it is a KERB — curb height, all the way round;
 *   5. an interior that is not free gets NO island at all, with a reason.
 *
 * The first two assertions are carried over verbatim from the dev-still route's
 * roundaboutIsland.test.ts, which is where this derivation used to live.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { analyzeNetwork } from "../builders/network";
import {
  analyzeRoundabouts,
  hasOuterKerb,
  hasRingBoundary,
  ringBoundaryRadiusAt,
  ringBearingInMouth,
  ringOuterRadiusAt,
  type RoundaboutRing,
} from "../builders/roundabout";
import { assertDistrict, type District } from "../types";

/** builders/constants.ts LANE_WIDTH_M — copied, not imported: this asserts the
 *  SHIPPED geometry, so it must not move silently when the constant does. */
const LANE_WIDTH_M = 3.25 * 2.5;
/** builders/constants.ts JUNCTION_CORNER_RADIUS_MINOR_M (arms rank <= 2). */
const JUNCTION_CORNER_RADIUS_M = 9;
/** builders/constants.ts ROAD_Y / CURB_HEIGHT_M / SIDEWALK_TOP_Y. */
const ROAD_Y = 0.02;
const SIDEWALK_TOP_Y = ROAD_Y + 0.12;

/** Every district that registers a roundabout. */
const RING_DISTRICTS = [
  "rb-mini-v1",
  "rb-2lane-v1",
  "rb-ped-v1",
  "rb-single-v1",
  "district-v1",
  "d2-v1",
] as const;

const DISTRICTS = new Map<string, District>();

function readDistrict(districtId: string): District {
  const cached = DISTRICTS.get(districtId);
  if (cached) return cached;
  const candidates = [
    path.join(process.cwd(), "content", "world", `${districtId}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${districtId}.json`),
    path.join(process.cwd(), "public", "world", `${districtId}.json`),
  ];
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) throw new Error(`${districtId}.json not found in ${candidates.join(", ")}`);
  const d = assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")));
  DISTRICTS.set(districtId, d);
  return d;
}

/** Built worlds are cached: the two OSM districts take seconds each and this
 *  battery reads six of them from a dozen angles. */
const WORLDS = new Map<string, ReturnType<typeof buildWorldGeometry>>();
function worldOf(districtId: string) {
  const cached = WORLDS.get(districtId);
  if (cached) return cached;
  const built = buildWorldGeometry(readDistrict(districtId), { seed: 7 });
  WORLDS.set(districtId, built);
  return built;
}

const ringsOf = (d: District) => analyzeRoundabouts(d, analyzeNetwork(d));

describe("analyzeRoundabouts — the island derivation", () => {
  it("rb-single-v1: the island stops exactly at the inner edge of the ring lane", () => {
    const district = readDistrict("rb-single-v1");
    const rings = ringsOf(district);
    expect(rings).toHaveLength(1);
    const rb = district.roundabouts[0]!;
    // Single-lane ring ⇒ drawn half width 4.0625 m (edgeTravelHalfWidth), so
    // the IDEAL island radius is r − 4.0625.
    const ideal = rb.radius - LANE_WIDTH_M / 2;

    // The island lands a little INSIDE the ideal, never outside, and the amount
    // it is inside is the CHORD SAG of the stored ring — measured here from the
    // same file rather than asserted as a magic number.
    //
    // This is the whole reason the derivation reads the polyline instead of the
    // declared radius. A ring is stored as chords between vertices on the
    // circle; the chords bow inward, the ribbon sweep then miters its
    // cross-section at every vertex, and the DRAWN inner edge of the asphalt
    // therefore sits inside the ideal circle. A disc at the ideal radius would
    // have its kerb standing in the traffic lane by that much — and on an OSM
    // ring, where the radius wanders metres (d2-v1: 26.7–29.3 against a
    // declared 28), by far more.
    let sag = 0;
    for (const edgeId of rings[0]!.ringEdgeIds) {
      const g = district.roads.edges.find((e) => e.id === edgeId)!.geometry;
      for (let i = 0; i + 1 < g.length; i++) {
        const mx = (g[i]![0] + g[i + 1]![0]) / 2;
        const my = (g[i]![1] + g[i + 1]![1]) / 2;
        sag = Math.max(sag, rb.radius - Math.hypot(mx - rb.x, my - rb.y));
      }
    }
    expect(sag).toBeGreaterThan(0); // the ring really is a polygon
    expect(rings[0]!.islandRadiusM!).toBeLessThanOrEqual(ideal);
    expect(rings[0]!.islandRadiusM!).toBeGreaterThan(ideal - sag - 0.1);
    expect(rings[0]!.centre).toEqual([rb.x, rb.y]);
  });

  it("rb-single-v1: the island covers the junction pads' inner corner aprons", () => {
    // THE REGRESSION. The builder opens a pad of `openRadius` at every arm↔ring
    // joint and wraps a raised curb apron around its INNER corner — the arc
    // that bulges toward the centre and, on a small ring, meets its three
    // neighbours as a star. An island that does not reach that bulge leaves the
    // star sticking out and the picture still reads as four mouths.
    const district = readDistrict("rb-single-v1");
    const isle = ringsOf(district)[0]!.islandRadiusM!;
    const R = district.roundabouts[0]!.radius;
    const ringHalf = LANE_WIDTH_M / 2;
    const openRadius = LANE_WIDTH_M + JUNCTION_CORNER_RADIUS_M; // 2-lane arm half + fillet
    const theta = openRadius / R;
    const bulgeM = Math.hypot(
      (R - ringHalf) * Math.sin(theta),
      R - (R - ringHalf) * Math.cos(theta),
    );
    const deepestBiteRadiusM = R - bulgeM;
    expect(deepestBiteRadiusM).toBeGreaterThan(0); // sanity: the bite is inboard
    expect(isle).toBeGreaterThan(deepestBiteRadiusM);
  });

  it("draws nothing for a district that registers no roundabout", () => {
    const district = readDistrict("tj-stop-v1");
    expect(district.roundabouts).toHaveLength(0);
    expect(ringsOf(district)).toEqual([]);
  });

  it("never lets an island reach the circulating lane, on any shipped ring", () => {
    // Stated as the driver's fact rather than as arithmetic: wherever the ring
    // centreline runs, the island must be at least the ring's own half width
    // away — i.e. a car on the centreline never has kerb under a wheel.
    for (const id of RING_DISTRICTS) {
      const district = readDistrict(id);
      for (const ring of ringsOf(district)) {
        if (ring.islandRadiusM === null) continue;
        for (const edgeId of ring.ringEdgeIds) {
          const edge = district.roads.edges.find((e) => e.id === edgeId);
          if (!edge) continue;
          for (const [x, y] of edge.geometry) {
            const r = Math.hypot(x - ring.centre[0], y - ring.centre[1]);
            expect(r - ring.islandRadiusM, `${id} ${edgeId}`).toBeGreaterThanOrEqual(
              ring.ringHalfWidthM - 1e-6,
            );
          }
        }
      }
    }
  });

  it("d2-v1: REFUSES the island — a primary boulevard is drawn through the middle", () => {
    // The one registration whose interior is not free. бул. „Пейо К. Яворов"
    // (primary, 2 lanes + parking band ⇒ 24.25 m curb-to-curb) crosses the ring
    // interior; its drawn carriageway covers the centre point itself. A disc
    // there would be grass painted over a road the student is graded on, so the
    // builder draws nothing and says why. This test is the record of that.
    const district = readDistrict("d2-v1");
    const rings = ringsOf(district);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.islandRadiusM).toBeNull();
    expect(rings[0]!.refusedBecause).toContain("drawn through the interior");
    const world = worldOf("d2-v1");
    expect(world.stats.roundabouts).toBe(1);
    expect(world.stats.roundaboutIslands).toBe(0);
  });

  it("the other five rings all get their island", () => {
    for (const id of RING_DISTRICTS.filter((d) => d !== "d2-v1")) {
      const world = worldOf(id);
      expect(world.stats.roundabouts, id).toBe(1);
      expect(world.stats.roundaboutIslands, id).toBe(1);
    }
  });
});

describe("the built world — the middle of a ring is no longer asphalt", () => {
  it("rb-mini-v1: NO junction-surface vertex survives inside the island", () => {
    // Suppression, not concealment. Before this pass the four pads reached to
    // within ~0.9 m of the centre; if any junction vertex is still in there the
    // plaza is still built and merely hidden under the disc.
    const district = readDistrict("rb-mini-v1");
    const ring = ringsOf(district)[0]!;
    const world = worldOf("rb-mini-v1");
    const p = world.junctionSurface.positions;
    let worst = Infinity;
    for (let i = 0; i < p.length; i += 3) {
      // world [x, h, −y] → district (x, −z)
      const d = Math.hypot(p[i]! - ring.centre[0], -p[i + 2]! - ring.centre[1]);
      worst = Math.min(worst, d);
    }
    expect(ring.islandRadiusM).toBeGreaterThan(13);
    expect(worst).toBeGreaterThanOrEqual(ring.islandRadiusM! - 1e-3);
  });

  it("rb-mini-v1: the island's kerb is a CIRCLE at curb height, all the way round", () => {
    // Sampled by angle, not by vertex count: what matters to the driver is that
    // there is kerb-height concrete at every bearing at exactly one radius —
    // that is what „сфера" means from the seat.
    const district = readDistrict("rb-mini-v1");
    const ring = ringsOf(district)[0]!;
    const r = ring.islandRadiusM!;
    const p = world_sidewalks("rb-mini-v1");
    const BUCKETS = 72;
    const seen = new Array<boolean>(BUCKETS).fill(false);
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]! - ring.centre[0];
      const h = p[i + 1]!;
      const y = -p[i + 2]! - ring.centre[1];
      const d = Math.hypot(x, y);
      if (Math.abs(d - r) > 0.05) continue;
      if (h < ROAD_Y - 1e-6 || h > SIDEWALK_TOP_Y + 1e-6) continue;
      const b = Math.floor((((Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * BUCKETS);
      seen[b % BUCKETS] = true;
    }
    expect(seen.every(Boolean)).toBe(true);
  });

  it("every ring district gains sidewalk geometry, and d2-v1 (refused) does not", () => {
    // The outer kerb of the ring: ring edges used to be skipped by the sidewalk
    // pass wholesale, so the circulatory carriageway had no kerb on EITHER side.
    for (const id of RING_DISTRICTS) {
      const district = readDistrict(id);
      const world = worldOf(id);
      expect(world.stats.sidewalkStrips, id).toBeGreaterThan(0);
    }
  });

  it("the island has BULK — the measurement the first, flat version failed", () => {
    // THE FRAME THAT FAILED. Drawn flat at kerb height (0.14 m) the island was
    // invisible from the driver's seat 46 m back: near edge 32 m ahead, eye
    // 1.2 m ⇒ 0.25° above the road, about three pixels. The top-down showed a
    // perfect circle and the cockpit showed an empty grey plain. So the height
    // is pinned as a driver-visible angle, not as a taste.
    for (const id of RING_DISTRICTS.filter((d) => d !== "d2-v1")) {
      const district = readDistrict(id);
      const ring = ringsOf(district)[0]!;
      const world = worldOf(id);
      const p = world.roundaboutIslands.positions;
      expect(p.length, id).toBeGreaterThan(0);
      let top = -Infinity;
      for (let i = 1; i < p.length; i += 3) top = Math.max(top, p[i]!);
      // At least 2 m of standing bulk (mound + shrubs) above the road.
      expect(top, id).toBeGreaterThan(2);
      // …and it never becomes a hill: below the eye-line of an oncoming lorry.
      expect(top, id).toBeLessThan(4);
      // Every planting vertex is inside the kerb, so nothing overhangs the lane.
      for (let i = 0; i < p.length; i += 3) {
        const d = Math.hypot(p[i]! - ring.centre[0], -p[i + 2]! - ring.centre[1]);
        expect(d, id).toBeLessThanOrEqual(ring.islandRadiusM! + 1e-3);
      }
    }
  });

  it("the island boundary is a COLLIDER — a student cannot drive across it", () => {
    // ⚠ THIS TEST USED TO CERTIFY THE DEFECT. It counted collider vertices at
    // the island radius and asserted `> 100`, which a 14 cm lip satisfies
    // perfectly — and 14 cm was all there was. `WorldColliderSet.sidewalks` is
    // documented „12 cm, drivable-over per vehicle harness", so a boundary
    // built to pavement height is one a car is ENTITLED to cross. Register
    // B16: „I drove sc-roundabout-entry due north with no steering at all …
    // the car body sits on grass between two of the island's own bushes",
    // reproduced on the real shell at 42 км/ч. The count passed; the island did
    // not exist. So the HEIGHT is asserted now, on every shipped ring.
    const district = readDistrict("rb-mini-v1");
    const ring = ringsOf(district)[0]!;
    const world = worldOf("rb-mini-v1");
    const p = world.colliders.sidewalks.positions;
    let onKerb = 0;
    for (let i = 0; i < p.length; i += 3) {
      const d = Math.hypot(p[i]! - ring.centre[0], -p[i + 2]! - ring.centre[1]);
      if (Math.abs(d - ring.islandRadiusM!) < 0.05) onKerb++;
    }
    expect(onKerb).toBeGreaterThan(100);
  });

  it("…and it is a WALL, not a kerb — taller than a wheel can climb", () => {
    // The number that decides whether B16 is fixed. A wheel of ~0.32 m radius
    // rides over a 0.14 m kerb and stops dead at a 0.57 m vertical face, so the
    // island's collider must stand clearly above the wheel radius. Measured on
    // every ring district, not just the one the founder happened to drive.
    const WHEEL_RADIUS_M = 0.32;
    const failures: string[] = [];
    for (const id of RING_DISTRICTS) {
      const district = readDistrict(id);
      const ring = ringsOf(district)[0];
      if (!ring || ring.islandRadiusM === null) continue;
      const world = worldOf(id);
      const p = world.colliders.sidewalks.positions;
      let top = -Infinity;
      for (let i = 0; i < p.length; i += 3) {
        const d = Math.hypot(p[i]! - ring.centre[0], -p[i + 2]! - ring.centre[1]);
        if (d <= ring.islandRadiusM + 0.5 && p[i + 1]! > top) top = p[i + 1]!;
      }
      if (!(top > WHEEL_RADIUS_M + 0.15)) {
        failures.push(`${id}: island collider tops out at ${top.toFixed(3)} m — a wheel climbs that`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("no ROAD RIBBON vertex survives inside any island either", () => {
    // The pads were the loud half; this is the quiet one. A ring arc's ribbon
    // is swept ±halfWidth about the centreline, and its inner edge lands
    // exactly on the island kerb — never inside it.
    for (const id of RING_DISTRICTS.filter((d) => d !== "d2-v1")) {
      const district = readDistrict(id);
      const ring = ringsOf(district)[0]!;
      const p = worldOf(id).roadSurface.positions;
      let worst = Infinity;
      for (let i = 0; i < p.length; i += 3) {
        worst = Math.min(
          worst,
          Math.hypot(p[i]! - ring.centre[0], -p[i + 2]! - ring.centre[1]),
        );
      }
      expect(worst, id).toBeGreaterThanOrEqual(ring.islandRadiusM! - 0.01);
    }
  });
});

describe("the ring's own markings", () => {
  it("rb-2lane-v1: a full circle of dashes divides the two circulating lanes", () => {
    const district = readDistrict("rb-2lane-v1");
    const world = worldOf("rb-2lane-v1");
    const ring = ringsOf(district)[0]!;
    expect(ring.ringLanes).toBe(2);
    // markings.ts could only ever paint the ~6 m of ring arc that survived the
    // junction trim on each quarter. A circle is drawn as a circle.
    expect(world.stats.ringDividerQuads).toBeGreaterThan(8);
    const radius = ring.ringRadiusM - ring.ringHalfWidthM + LANE_WIDTH_M;
    expect(radius).toBeGreaterThan(ring.islandRadiusM!);
    expect(radius).toBeLessThan(ring.ringRadiusM + ring.ringHalfWidthM);
  });

  it("single-lane rings paint NO divider — there is no boundary there to draw", () => {
    for (const id of ["rb-mini-v1", "rb-ped-v1", "rb-single-v1", "district-v1"] as const) {
      const world = worldOf(id);
      expect(world.stats.ringDividerQuads, id).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// FR-22, THE OUTER HALF — the residual the island pass left standing
// ---------------------------------------------------------------------------
//
// „a Round a bout is a Cyrcle" is a statement about BOTH boundaries, and until
// this battery only the inner one was one. The outer kerb was built the way any
// street's pavement is — `buildSidewalkStrip` along the ring edge's
// JUNCTION-TRIMMED centreline — and `analyzeNetwork` opens 17.125 m of junction
// at each arm↔ring node, so on rb-mini's 90° / 28 m quarters the trim clamped at
// JUNCTION_TRIM_MAX_FRACTION and left 2.8 m of kerb per quarter. Measured on the
// shipped geometry, kerb sampled at 2° at the ring's own outer radius and
// counted only on bearings no arm points at:
//
//     district        kerb missing off-mouth      pad spill past the outer edge
//     rb-mini-v1      30 of 45   →   0 of 76      +5.47 m  →  0
//     rb-ped-v1       30 of 45   →   0 of 76      +5.47 m  →  0
//     rb-2lane-v1     60 of 75   →   1 of 52      +10.73 m →  0
//     rb-single-v1    66 of 87   →   0 of 124     +6.00 m  →  0
//     district-v1     49 of 55   →   6 of 126
//     d2-v1           31 of 41   →   1 of 94
//
// (The AFTER denominators are LARGER because the mouth model is now the
// builder's real one — narrower than the probe's first guess — so the after
// number is measured over more bearings, not fewer.)
//
// What the assertions below lock is the driver's fact, not the arithmetic:
// standing anywhere outside a roundabout that is not a mouth, there is kerb.
describe("FR-22 — the OUTER boundary is a circle too", () => {
  /** Bearings sampled per ring: 2° — finer than any mouth is narrow. */
  const B = 180;

  /** Every ring that resolved an outer BOUNDARY (profile + closed mouths). */
  function boundedRings(): Array<{ id: string; ring: RoundaboutRing }> {
    const out: Array<{ id: string; ring: RoundaboutRing }> = [];
    for (const id of RING_DISTRICTS) {
      for (const ring of ringsOf(readDistrict(id))) {
        if (hasRingBoundary(ring)) out.push({ id, ring });
      }
    }
    return out;
  }

  /** …and the subset that has enough ARC left to sweep as circular kerb. */
  function circularRings(): Array<{ id: string; ring: RoundaboutRing }> {
    return boundedRings().filter(({ ring }) => hasOuterKerb(ring));
  }

  it("every shipped ring resolves a BOUNDARY — the derivation is not opt-in", () => {
    // Six registrations, six closed boundaries. d2-v1 is included on purpose:
    // its ISLAND is refused (a primary runs through the interior) and it has no
    // circular ARC left either, but its outside is still bounded — three
    // independent facts about three independent things.
    expect(boundedRings().map((r) => r.id).sort()).toEqual([...RING_DISTRICTS].sort());
  });

  it("five of the six have circular ARC; d2-v1 has none, and says so", () => {
    // B16. The arc floor is not cosmetic: d2-v1's eight arms — four of them
    // 24.25 m curb-to-curb against a 34.8 m outer radius, meeting the ring
    // obliquely — cover the whole circumference by union. There is no circle
    // there to draw, so the per-edge strips stand and the honest number is
    // recorded rather than a swept lie.
    expect(circularRings().map((r) => r.id).sort()).toEqual(
      RING_DISTRICTS.filter((d) => d !== "d2-v1").sort(),
    );
    const d2 = ringsOf(readDistrict("d2-v1"))[0]!;
    expect(hasRingBoundary(d2)).toBe(true);
    expect(d2.circleFractionOfRing).toBeLessThan(0.08);
  });

  it("EVERY mouth is closed by kerb returns — a mouth is a gap in the CIRCLE, not in the KERB", () => {
    // THE B16 DEFECT, as one assertion. Before it, the arm's own pavement
    // stopped at the junction cut, the ring's kerb stopped at the mouth edge,
    // and between them sat an unkerbed octagonal lobe of junction asphalt twice
    // the arm's width bleeding into the terrain — four of them, which is the
    // Maltese cross the founder photographed and called „not a proper
    // round-about".
    for (const { id, ring } of boundedRings()) {
      for (const mouth of ring.mouths) {
        expect(
          mouth.returns.length,
          `${id} ${mouth.armEdgeId}: mouth has ${mouth.returns.length} kerb return(s)`,
        ).toBeGreaterThan(0);
        for (const r of mouth.returns) {
          // The fillet touches the ring's outer edge…
          const rr = Math.hypot(r.tRing[0] - ring.centre[0], r.tRing[1] - ring.centre[1]);
          const bearing = Math.atan2(r.tRing[1] - ring.centre[1], r.tRing[0] - ring.centre[0]);
          expect(Math.abs(rr - ringOuterRadiusAt(ring, bearing)), `${id} ${mouth.armEdgeId}`)
            .toBeLessThan(0.05);
          // …and the arm's kerb line, at the arm's FULL drawn half width. Half
          // a metre out on this one number and the return is built over the
          // carriageway or a lane's width off it.
          const lat =
            (r.tArm[0] - mouth.node[0]) * mouth.normal[0] +
            (r.tArm[1] - mouth.node[1]) * mouth.normal[1];
          expect(Math.abs(lat - r.side * mouth.armHalfWidthM), `${id} ${mouth.armEdgeId}`)
            .toBeLessThan(0.05);
        }
      }
    }
  });

  it("no junction asphalt survives outside the ring's boundary — INCLUDING inside a mouth", () => {
    // The other half of the same sentence, and the half that was missing: the
    // pad clip used to return every in-mouth point untouched, so the lobes were
    // never clipped at all. Probed on the shipped triangles at +55.73 m past
    // the ring's outer edge on rb-mini before this line; the arm CORRIDOR is
    // excluded because a road going somewhere is not a hole in a kerb.
    for (const id of ["rb-mini-v1", "rb-ped-v1", "rb-2lane-v1", "rb-single-v1"] as const) {
      const ring = ringsOf(readDistrict(id))[0]!;
      const p = worldOf(id).junctionSurface.positions;
      let worst = 0;
      let at = "";
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i]! - ring.centre[0];
        const y = -p[i + 2]! - ring.centre[1];
        const bearing = Math.atan2(y, x);
        const lim = ringBoundaryRadiusAt(ring, bearing);
        if (!Number.isFinite(lim)) continue; // straight up an arm — a road
        const over = Math.hypot(x, y) - lim;
        if (over > worst) {
          worst = over;
          at = `${((bearing * 180) / Math.PI).toFixed(0)}°`;
        }
      }
      expect(worst, `${id}: junction asphalt ${worst.toFixed(2)} m past the boundary at ${at}`)
        .toBeLessThanOrEqual(0.25);
    }
  });

  it("there is KERB at every bearing that is not a mouth", () => {
    // THE REGRESSION, stated as the thing a driver sees. Sampled against the
    // ring's OWN outer radius (an OSM ring wanders — d2-v1 runs 26.8…29.3
    // against a declared 28), because the kerb has to follow the asphalt that
    // is actually drawn, not an ideal circle laid over it.
    for (const { id, ring } of circularRings()) {
      const seen = new Array<boolean>(B).fill(false);
      const p = world_sidewalks(id);
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i]! - ring.centre[0];
        const y = -p[i + 2]! - ring.centre[1];
        const bearing = Math.atan2(y, x);
        if (Math.abs(Math.hypot(x, y) - ringOuterRadiusAt(ring, bearing)) > 0.6) continue;
        seen[Math.floor((((bearing + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * B) % B] = true;
      }
      let missing = 0;
      let offMouth = 0;
      for (let b = 0; b < B; b++) {
        const a = ((b + 0.5) / B) * Math.PI * 2;
        if (ringBearingInMouth(ring, a)) continue;
        offMouth++;
        if (!seen[b]) missing++;
      }
      expect(offMouth, `${id}: the mouths ate the whole circle`).toBeGreaterThan(B * 0.2);
      // Budgeted per district, in the register's discipline: a named number
      // that may only fall, and a row that reaches zero gets deleted.
      //
      //   rb-mini-v1     30 of 45  →  0        rb-single-v1  66 of 87  →  0
      //   rb-ped-v1      30 of 45  →  0        rb-2lane-v1   60 of 75  →  1
      //   district-v1    49 of 55  →  6        d2-v1         31 of 41  →  1
      //
      // What is left is quantisation, not plaza: this test walks 2° buckets and
      // the builder cuts its mouths on 1°, so a mouth edge landing inside a
      // test bucket reads as a hole 2° (1.2 m of a 213 m circumference) wide.
      // The two OSM rings keep a few more because their radius wanders —
      // district-v1 19.4…20.3 m, d2-v1 26.8…29.3 m — so the mouth cut (taken at
      // the ARM's bearing) and the kerb-run cut (taken on the ring's own
      // profile) disagree by up to a metre at each seam.
      const budget: Record<string, number> = {
        "rb-2lane-v1": 1, "district-v1": 6, "d2-v1": 1,
      };
      expect(missing, `${id}: ${missing}/${offMouth} bearings have no outer kerb`)
        .toBeLessThanOrEqual(budget[id] ?? 0);
    }
  });

  it("no junction pad flares past the outer edge on an off-mouth bearing", () => {
    // The pads opened at the ARM's radius, so their boundaries and corner
    // fillets reached metres outside the circulatory carriageway on bearings no
    // arm points at — probed at +10.73 m on rb-2lane. That flare IS the square.
    // Measured on the four SYNTHETIC rings: an OSM district has other junctions
    // within a ring radius of the ring, and their asphalt is theirs, not this
    // registration's.
    for (const id of ["rb-mini-v1", "rb-ped-v1", "rb-2lane-v1", "rb-single-v1"] as const) {
      const ring = ringsOf(readDistrict(id))[0]!;
      const p = worldOf(id).junctionSurface.positions;
      let worst = 0;
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i]! - ring.centre[0];
        const y = -p[i + 2]! - ring.centre[1];
        const bearing = Math.atan2(y, x);
        if (ringBearingInMouth(ring, bearing)) continue;
        worst = Math.max(worst, Math.hypot(x, y) - ringOuterRadiusAt(ring, bearing));
      }
      expect(worst, `${id}: junction asphalt ${worst.toFixed(2)} m outside the ring`)
        .toBeLessThanOrEqual(0.25);
    }
  });

  it("the mouths are where the ARMS are, and only there", () => {
    // Derived, never authored: a map cannot post a gap it has no road for. Each
    // mouth's bearing must land on a node that actually carries its arm edge.
    for (const { id, ring } of circularRings()) {
      const district = readDistrict(id);
      expect(ring.mouths.length, `${id} has no mouths`).toBeGreaterThan(0);
      for (const mouth of ring.mouths) {
        const arm = district.roads.edges.find((e) => e.id === mouth.armEdgeId);
        expect(arm, `${id}: mouth names a missing edge ${mouth.armEdgeId}`).toBeTruthy();
        expect(ring.ringEdgeIds.has(mouth.armEdgeId), `${id}: a RING edge is not an arm`).toBe(false);
        // The gap is a gap, not a hole. B16 split the mouth in two, because an
        // OSM arm does not meet its ring square and a symmetric span would put
        // the kerb run's end and its return's start in different places.
        //
        // The bound is 75° a side, not the 45° a synthetic map needs: measured,
        // district-v1's `e25653914.0` subtends 46.2° clockwise and 9.6°
        // counter-clockwise off the same axis, because it leaves the ring at an
        // angle. That asymmetry is the map, not a bug — what makes the mouth a
        // mouth rather than a hole is the two returns asserted above, not its
        // width.
        const bound = (75 * Math.PI) / 180;
        expect(mouth.halfAngleCw, `${id} ${mouth.armEdgeId} cw`).toBeLessThan(bound);
        expect(mouth.halfAngleCcw, `${id} ${mouth.armEdgeId} ccw`).toBeLessThan(bound);
      }
    }
  });

  it("the outer kerb is a COLLIDER — you cannot drive off the outside either", () => {
    // The circle is swept into the SIDEWALK accumulator, which IS
    // `colliders.sidewalks`. The island's kerb already stopped a car from
    // cutting the middle; this is the other side of the same carriageway.
    const ring = ringsOf(readDistrict("rb-mini-v1"))[0]!;
    const p = worldOf("rb-mini-v1").colliders.sidewalks.positions;
    let onOuterKerb = 0;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]! - ring.centre[0];
      const y = -p[i + 2]! - ring.centre[1];
      if (Math.abs(Math.hypot(x, y) - ringOuterRadiusAt(ring, Math.atan2(y, x))) < 0.05) {
        onOuterKerb++;
      }
    }
    expect(onOuterKerb).toBeGreaterThan(100);
  });

  it("a district with no ring grows no circular kerb at all", () => {
    // The additive contract: everything above is zero on the 94 districts that
    // register no roundabout, so none of their geometry moved by a vertex.
    for (const id of ["tj-stop-v1", "pe-clear-v1"] as const) {
      const district = readDistrict(id);
      expect(district.roundabouts).toHaveLength(0);
      expect(ringsOf(district)).toEqual([]);
      expect(worldOf(id).stats.ringKerbRuns).toBe(0);
    }
  });
});

describe("nothing else moved", () => {
  it("a roundabout-free district builds byte-identical geometry", () => {
    const world = worldOf("tj-stop-v1");
    expect(world.stats.roundabouts).toBe(0);
    expect(world.stats.roundaboutIslands).toBe(0);
    expect(world.stats.ringDividerQuads).toBe(0);
  });

  // TWELVE full district builds, deliberately uncached (the point is that two
  // builds of the same document agree, so `worldOf` must not be used). Timed on
  // this box: 0.18–0.46 s per synthetic ring and 0.9–1.2 s per OSM district,
  // i.e. 5–12 s for the loop — which is either side of vitest's 5 s default
  // depending only on what else the machine is doing. It has been sitting on
  // that edge and tipping over as a phantom failure; the budget is stated here
  // instead of being rediscovered by whoever's change happens to add the last
  // 3 %.
  it(
    "is deterministic for a fixed seed on every ring district",
    () => {
      for (const id of RING_DISTRICTS) {
        const district = readDistrict(id);
        const a = buildWorldGeometry(district, { seed: 7 });
        const b = buildWorldGeometry(district, { seed: 7 });
        expect(a.stats, id).toEqual(b.stats);
      }
    },
    30_000,
  );
});

/** Sidewalk positions of a district's built world (the kerb mesh). */
function world_sidewalks(districtId: string): Float32Array {
  return worldOf(districtId).sidewalks.positions;
}
