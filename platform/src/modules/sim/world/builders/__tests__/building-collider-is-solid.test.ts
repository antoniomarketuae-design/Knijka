/**
 * A BUILDING'S PHYSICS MASS IS A SOLID, NOT A SHEET.
 *
 * THE FINDINGS (wave 6, lane „remainder"), all the same shape and all filed
 * against `platform/src/modules/sim/collision/*`, which is four pure-TypeScript
 * files that cannot create or move a rapier body:
 *
 *   sc-ac-night-overdrive:5b45e8ea  pc-wrong t039s — 95 км/ч, the whole
 *                                   windscreen a facade with a lit window
 *   sc-ln-turn-lane-arrows:292bf719 mobile-wrong t022s — 0 км/ч with the glass
 *                                   full of wall and the MIRROR full of street
 *   sc-ov-being-overtaken:32ef2c18  mobile-right t197s — facade rolled ~45°
 *   sc-maneuver-3point:8cfcd0a6     pc-wrong t016s — still doing 49 км/ч with
 *                                   the camera inside the mesh
 *   sc-maneuver-uturn:525eb789      mobile-wrong t021s — same, at rest
 *
 * THE MECHANISM, read rather than guessed (and written down in full at
 * `WALL_COLLIDER_THICKNESS_M`): `buildOne` wrote ONE zero-thickness quad per
 * footprint edge into the collider accumulator, and `WorldColliders` merges
 * that into a single `TrimeshCollider`. A rapier trimesh is a SURFACE. Contact
 * with one triangle is resolved along that triangle's plane, toward whichever
 * side the body's centre is already on — so a chassis whose centre finishes a
 * substep past the sheet is pushed FURTHER IN on the next one. The wall stops
 * being an obstacle and becomes a door.
 *
 * WHAT THIS FILE PINS, and deliberately not more:
 *   §1 the mass has DEPTH, and the depth is derived from the physics step and
 *      the fastest limit the catalogue posts — not chosen;
 *   §2 the OUTER face has not moved, so no drive credited yesterday is refused
 *      today: the surface a car is stopped at is the same surface;
 *   §3 the slab ENCLOSES a point inside it (an exact parity test on the built
 *      trimesh) and does NOT enclose the building's hollow centre — the claim
 *      is „solid wall", never „solid prism", and a test that proved the
 *      stronger thing would be proving something the geometry does not do;
 *   §4 the shipped corpus carries it, at the thinnest footprint in the product.
 *
 * WHAT IT CANNOT PIN. Whether a car still crosses a facade is a rapier
 * question, and rapier is not in this module's import closure. The drive that
 * settles it is `sc-maneuver-3point` pc-wrong: at t011s the car is on the
 * street at 49 км/ч and at t016s it is inside the block STILL AT 49. If that
 * beat becomes a stop at the facade, the row closes; if it does not, this file
 * is still true and the cause is elsewhere.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildBuildings,
  slabThicknessM,
  WALL_COLLIDER_THICKNESS_M,
} from "../buildings";
import { buildWorldGeometry } from "../buildWorldGeometry";
import { resolveBuildingHeightM } from "../cityBuildings";
import { FIXED_DT } from "@/modules/sim/vehicle";
import { assertDistrict, type District, type DistrictBuilding } from "../../types";

const WORLD_DIR = path.join(process.cwd(), "..", "content", "world");

function load(id: string): District {
  return assertDistrict(JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf8")));
}

/** A 20 × 12 m block, 12 m tall, ring given CW so `toCCW` has work to do. */
const BLOCK: DistrictBuilding = {
  id: "test-block",
  height: 12,
  heightSource: "height",
  footprint: [
    [0, 0],
    [0, 12],
    [20, 12],
    [20, 0],
  ],
};

/**
 * Vertical (+Y) ray parity at world (x, z) from height `y0`.
 *
 * EXACT for this geometry rather than approximate, which is why it is worth a
 * test at all: every face of a slab is either strictly vertical (outer, inner,
 * both end caps — zero area in the XZ projection, so a vertical ray cannot
 * cross one except in a measure-zero grazing case) or strictly horizontal (the
 * cap and the floor). Skipping the degenerate projections therefore skips
 * exactly the faces a vertical ray does not cross.
 *
 * CONTAINMENT IS CLOSED (`>= 0`), so a sample sitting exactly on the diagonal
 * that splits a cap quad is counted by BOTH of its triangles and reads as EVEN.
 * The first draft of this file sampled (10, -0.5), which is precisely the
 * diagonal of the 20 x 1 m south cap, and the fix looked broken. Callers pick
 * interior points — cheaper and more honest than an epsilon that would make a
 * real grazing hit vanish instead.
 */
function verticalCrossings(
  positions: Float32Array,
  indices: Uint32Array,
  x: number,
  z: number,
  y0: number,
): number {
  let hits = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t]! * 3;
    const ib = indices[t + 1]! * 3;
    const ic = indices[t + 2]! * 3;
    const ax = positions[ia]!;
    const ay = positions[ia + 1]!;
    const az = positions[ia + 2]!;
    const bx = positions[ib]!;
    const by = positions[ib + 1]!;
    const bz = positions[ib + 2]!;
    const cx = positions[ic]!;
    const cy = positions[ic + 1]!;
    const cz = positions[ic + 2]!;
    // Signed area of the XZ projection — a vertical face projects to ~0.
    const area2 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (Math.abs(area2) < 1e-9) continue;
    // Barycentric containment in the XZ projection.
    const w0 = ((bx - x) * (cz - z) - (bz - z) * (cx - x)) / area2;
    const w1 = ((cx - x) * (az - z) - (cz - z) * (ax - x)) / area2;
    const w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    const y = w0 * ay + w1 * by + w2 * cy;
    if (y > y0) hits++;
  }
  return hits;
}

describe("§1 the mass has depth, and the depth is derived", () => {
  it("is at least one physics step of travel at the fastest limit the catalogue posts", () => {
    // Read off the shipped corpus rather than typed in beside the constant: a
    // map that posts a higher number must make this fail rather than inherit
    // silence. (The world documents carry the posted limit in two places.)
    let fastestKmh = 0;
    for (const f of fs.readdirSync(WORLD_DIR)) {
      if (!f.endsWith(".json")) continue;
      const raw = JSON.parse(fs.readFileSync(path.join(WORLD_DIR, f), "utf8")) as {
        meta?: {
          defaults?: { maxspeedUrbanKmh?: number };
          scenario?: { params?: { maxspeedKmh?: number } };
        };
      };
      fastestKmh = Math.max(
        fastestKmh,
        raw.meta?.defaults?.maxspeedUrbanKmh ?? 0,
        raw.meta?.scenario?.params?.maxspeedKmh ?? 0,
      );
    }
    expect(fastestKmh).toBeGreaterThan(0);
    const travelPerStepM = (fastestKmh / 3.6) * FIXED_DT;
    expect(WALL_COLLIDER_THICKNESS_M).toBeGreaterThanOrEqual(travelPerStepM);
  });

  it("holds the slab to a share of the footprint so two opposite walls cannot cross", () => {
    // A block: the full depth.
    expect(slabThicknessM(BLOCK.footprint as [number, number][])).toBe(
      WALL_COLLIDER_THICKNESS_M,
    );
    // The product's thinnest shipped footprint class — a 1.2 m yard wall.
    const yardWall: [number, number][] = [
      [0, 0],
      [0, 1.2],
      [8, 1.2],
      [8, 0],
    ];
    expect(slabThicknessM(yardWall)).toBeCloseTo(0.48, 6);
    expect(slabThicknessM(yardWall) * 2).toBeLessThanOrEqual(1.2);
  });
});

describe("§2 the outer face has not moved", () => {
  const built = buildBuildings([BLOCK]);
  const pos = built.collider.toMeshData().positions;
  const idx = built.collider.toMeshData().indices;

  it("emits one closed six-face slab per footprint edge", () => {
    // 4 edges × 6 quads × 2 triangles.
    expect(idx.length / 3).toBe(4 * 12);
  });

  it("still puts a vertex on every footprint corner at ground and at roof height", () => {
    const has = (x: number, y: number, z: number) => {
      for (let i = 0; i < pos.length; i += 3) {
        if (
          Math.abs(pos[i]! - x) < 1e-6 &&
          Math.abs(pos[i + 1]! - y) < 1e-6 &&
          Math.abs(pos[i + 2]! - z) < 1e-6
        ) {
          return true;
        }
      }
      return false;
    };
    // District (x, y) -> world [x, h, -y].
    for (const [dx, dy] of BLOCK.footprint as [number, number][]) {
      expect(has(dx, 0, -dy), `ground corner ${dx},${dy}`).toBe(true);
      expect(has(dx, 12, -dy), `roof corner ${dx},${dy}`).toBe(true);
    }
  });

  it("never reaches outside the footprint — the depth is taken inward", () => {
    for (let i = 0; i < pos.length; i += 3) {
      const dx = pos[i]!;
      const dy = -pos[i + 2]!;
      expect(dx).toBeGreaterThanOrEqual(-1e-6);
      expect(dx).toBeLessThanOrEqual(20 + 1e-6);
      expect(dy).toBeGreaterThanOrEqual(-1e-6);
      expect(dy).toBeLessThanOrEqual(12 + 1e-6);
    }
  });
});

describe("§3 the trimesh encloses the wall and only the wall", () => {
  const md = buildBuildings([BLOCK]).collider.toMeshData();

  it("encloses a point at mid-thickness of a wall (this is the whole fix)", () => {
    // Inside the south wall (district y = 0 edge): district (7.3, 0.37), off
    // the cap quad's split diagonal. With the single quad that stood here
    // until 2026-08-27 this count was 0 at every point in the mass.
    expect(verticalCrossings(md.positions, md.indices, 7.3, -0.37, 6) % 2).toBe(1);
    // …and the west wall, whose slab runs the other way.
    expect(verticalCrossings(md.positions, md.indices, 0.37, -7.3, 6) % 2).toBe(1);
  });

  it("does NOT enclose the hollow centre — a slab, not a solid prism", () => {
    expect(verticalCrossings(md.positions, md.indices, 9.7, -5.3, 6) % 2).toBe(0);
  });

  it("does not enclose a point above the roof or outside the footprint", () => {
    expect(verticalCrossings(md.positions, md.indices, 7.3, -0.37, 20) % 2).toBe(0);
    expect(verticalCrossings(md.positions, md.indices, -3.1, -0.37, 6) % 2).toBe(0);
  });
});

describe("§4 the shipped corpus carries it", () => {
  /**
   * PARITY IS NOT USED HERE, AND THE REASON IS THE POINT. A finished district's
   * building collider is a UNION of masses — the authored footprints plus the
   * terminus closures, the lot enclosures and the world rim
   * (`buildWorldGeometry` hands all three in as `extraVolumes`) — and two solids
   * that overlap flip a ray's parity without either of them being hollow. So
   * the corpus check asks the question that survives a union: does every
   * authored footprint edge have its INWARD-offset corner in the mesh, at the
   * ground and at the roofline? That is depth, per edge, and nothing else can
   * fake it.
   */
  it("ln-arrows-v1: every authored footprint edge carries its inward face", () => {
    // The district of sc-ln-turn-lane-arrows, the critical row of the cluster.
    const district = load("ln-arrows-v1");
    const c = buildWorldGeometry(district, { seed: 7 }).colliders.buildings;
    expect(c.indices.length).toBeGreaterThan(0);
    expect(c.indices.length % 36).toBe(0); // whole slabs (12 tris = 36 indices)

    const key = (x: number, y: number, z: number) =>
      `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    const verts = new Set<string>();
    for (let i = 0; i < c.positions.length; i += 3) {
      verts.add(key(c.positions[i]!, c.positions[i + 1]!, c.positions[i + 2]!));
    }

    let checked = 0;
    for (const b of district.buildings) {
      const ring = (b.footprint ?? []) as [number, number][];
      if (ring.length < 3) continue;
      const t = slabThicknessM(ring);
      const h = resolveBuildingHeightM(b);
      for (let i = 0; i < ring.length; i++) {
        const p0 = ring[i]!;
        const p1 = ring[(i + 1) % ring.length]!;
        const dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        // The ring's authored winding is not assumed: one of the two normals is
        // the inward one, and the mesh must carry the offset corner on it.
        const nx = dy / len;
        const ny = -dx / len;
        const at = (sx: number, sy: number, yy: number) =>
          verts.has(key(p0[0] + sx, yy, -(p0[1] + sy)));
        const inA = at(-nx * t, -ny * t, 0) && at(-nx * t, -ny * t, h);
        const inB = at(nx * t, ny * t, 0) && at(nx * t, ny * t, h);
        expect(inA || inB, `edge ${i} of ${b.id} has no inward face`).toBe(true);
        // …and never both, which would mean the slab reached out of the
        // building on one side.
        expect(inA && inB, `edge ${i} of ${b.id} is doubled`).toBe(false);
        checked++;
      }
    }
    expect(checked).toBe(8); // two authored blocks, four edges each
  });
}, 60_000);
