/**
 * Water-decal battery (SURFACE-PATCH visibility slice) — builders/waterDecals.
 *
 * The aquaplane physics (runtime/surface.ts) worked with NO visual: the
 * founder-visible symptom was "the water option says it's working but nothing
 * is visible". This battery proves the world now SHOWS the puddle:
 *  - a waterPatch span emits a flat quad strip landing EXACTLY on the span
 *    (one quad per overlapped polyline segment, merged into one mesh);
 *  - the sheet spans the travel carriageway (minus the edge inset) at
 *    WATER_DECAL_Y, faces up, and stays inside the physics rect;
 *  - icePatch spans emit NOTHING — invisible black ice IS the AC-08 lesson;
 *  - districts without live spans emit ZERO geometry (the additive contract:
 *    every pre-existing map builds bit-identically);
 *  - the validity gate mirrors resolveSurfaceGripPatches — a span the physics
 *    drops never paints a puddle that doesn't bite.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSurfaceGripPatches } from "../../runtime";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { LANE_WIDTH_M } from "../builders/constants";
import { analyzeNetwork } from "../builders/network";
import {
  buildWaterDecals,
  WATER_DECAL_EDGE_INSET_M,
  WATER_DECAL_Y,
} from "../builders/waterDecals";
import { assertDistrict, type District, type DistrictZone } from "../types";

// ---------------------------------------------------------------------------
// Fixture: one straight non-arterial street north along x = 0 (the ac-aqua
// topology), zones injectable per test.
// ---------------------------------------------------------------------------

function fixtureDistrict(
  zones: DistrictZone[] | undefined,
  geometry: [number, number][] = [
    [0, 0],
    [0, 520],
  ],
): District {
  return {
    format: "district-v1",
    meta: {
      district: "wd-test",
      label: "Water-decal fixture",
      boundsLocalMeters: { minX: -30, minY: 0, maxX: 30, maxY: 520 },
      attribution: {
        text: "оригинален параметричен дизайн (тестова карта)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
      },
    },
    roads: {
      nodes: [
        { id: "n-start", x: 0, y: 0 },
        { id: "n-end", x: 0, y: 520 },
      ],
      edges: [
        {
          id: "e-street",
          from: "n-start",
          to: "n-end",
          class: "unclassified",
          name: null,
          oneway: false,
          roundabout: false,
          lanes: 2,
          lanesSource: "tag",
          maxspeed: 90,
          maxspeedSource: "tag",
          length: 520,
          geometry,
        },
      ],
    },
    intersections: [],
    crossings: [],
    roundabouts: [],
    buildings: [],
    spawnPoints: [],
    ...(zones ? { zones } : {}),
  };
}

const waterZone = (overrides: Partial<DistrictZone> = {}): DistrictZone => ({
  id: "z-water",
  kind: "waterPatch",
  edgeId: "e-street",
  fromM: 240,
  toM: 280,
  signRef: "А15",
  patchGripFactor: 0.15,
  aquaplaneAboveKmh: 65,
  ...overrides,
});

function build(district: District) {
  return buildWaterDecals(district, analyzeNetwork(district));
}

/** Travel half-width of the fixture street minus the edge inset. */
const FIXTURE_HALF = (2 * LANE_WIDTH_M) / 2 - WATER_DECAL_EDGE_INSET_M;

describe("buildWaterDecals on the fixture street", () => {
  it("one straight span → ONE quad landing exactly on [fromM, toM]", () => {
    const { water, count } = build(fixtureDistrict([waterZone()]));
    expect(count).toBe(1);
    expect(water.vertexCount).toBe(4);
    expect(water.triangleCount).toBe(2);
    const { positions, indices, uvs } = water.toMeshData();
    // Every vertex floats at WATER_DECAL_Y…
    for (let i = 1; i < positions.length; i += 3) {
      expect(positions[i]!).toBeCloseTo(WATER_DECAL_Y, 6);
    }
    // …inside the span along the street (district y ∈ [240, 280] → world
    // z ∈ [-280, -240]) and inside the travel carriageway across it.
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.abs(positions[i]!)).toBeCloseTo(FIXTURE_HALF, 4);
      minZ = Math.min(minZ, positions[i + 2]!);
      maxZ = Math.max(maxZ, positions[i + 2]!);
    }
    expect(minZ).toBeCloseTo(-280, 4);
    expect(maxZ).toBeCloseTo(-240, 4);
    // The sheet stays INSIDE the physics rect (runtime/surface.ts spans the
    // full carriageway = lanes × LANE_WIDTH_M / 2 with no inset).
    const patch = resolveSurfaceGripPatches(fixtureDistrict([waterZone()]))[0]!;
    expect(FIXTURE_HALF).toBeLessThan(patch.halfWidthM);
    // Triangles face UP (district-CCW after world mapping).
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t]! * 3, indices[t + 1]! * 3, indices[t + 2]! * 3];
      const abx = positions[b]! - positions[a]!;
      const abz = positions[b + 2]! - positions[a + 2]!;
      const acx = positions[c]! - positions[a]!;
      const acz = positions[c + 2]! - positions[a + 2]!;
      expect(abz * acx - abx * acz).toBeGreaterThan(0);
    }
    for (let i = 0; i < uvs.length; i++) {
      expect(uvs[i]!).toBeGreaterThanOrEqual(0);
      expect(uvs[i]!).toBeLessThanOrEqual(1);
    }
  });

  it("interior polyline vertices split the sheet — one quad per overlapped segment", () => {
    const twoSeg = fixtureDistrict([waterZone()], [
      [0, 0],
      [0, 260],
      [0, 520],
    ]);
    const { water, count } = build(twoSeg);
    expect(count).toBe(2);
    expect(water.vertexCount).toBe(6); // 3 stations x 2 sides
    const { positions } = water.toMeshData();
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      minZ = Math.min(minZ, positions[i + 2]!);
      maxZ = Math.max(maxZ, positions[i + 2]!);
    }
    expect(minZ).toBeCloseTo(-280, 4);
    expect(maxZ).toBeCloseTo(-240, 4);
  });

  it("icePatch emits NOTHING — invisible black ice is the AC-08 lesson", () => {
    const ice = fixtureDistrict([
      waterZone({ id: "z-ice", kind: "icePatch", aquaplaneAboveKmh: undefined }),
    ]);
    // The physics DOES bite on this span…
    expect(resolveSurfaceGripPatches(ice)).toHaveLength(1);
    // …but the world renders no sheet, by design.
    const { water, count } = build(ice);
    expect(count).toBe(0);
    expect(water.vertexCount).toBe(0);
  });

  it("districts without zones emit ZERO geometry (the additive contract)", () => {
    const { water, count } = build(fixtureDistrict(undefined));
    expect(count).toBe(0);
    expect(water.vertexCount).toBe(0);
  });

  it("physics-dead spans paint no puddle (the resolveSurfaceGripPatches gate, mirrored)", () => {
    const dead: DistrictZone[][] = [
      [waterZone({ aquaplaneAboveKmh: undefined })], // missing float gate
      [waterZone({ patchGripFactor: 0 })], // grip out of (0, 1)
      [waterZone({ patchGripFactor: 1 })],
      [waterZone({ fromM: 300, toM: 280 })], // inverted span
      [waterZone({ fromM: -5 })], // negative start
      [waterZone({ edgeId: "e-unknown" })], // unknown edge
    ];
    for (const zones of dead) {
      const district = fixtureDistrict(zones);
      expect(resolveSurfaceGripPatches(district), JSON.stringify(zones)).toHaveLength(0);
      const { water, count } = build(district);
      expect(count, JSON.stringify(zones)).toBe(0);
      expect(water.vertexCount, JSON.stringify(zones)).toBe(0);
    }
  });

  it("flows through buildWorldGeometry: stats + the merged mesh + one extra draw", () => {
    const withWater = buildWorldGeometry(fixtureDistrict([waterZone()]), { seed: 7 });
    const without = buildWorldGeometry(fixtureDistrict(undefined), { seed: 7 });
    expect(withWater.stats.waterDecals).toBe(1);
    expect(withWater.waterDecals.positions.length).toBe(4 * 3);
    expect(without.stats.waterDecals).toBe(0);
    expect(without.waterDecals.positions.length).toBe(0);
    // The zones difference costs exactly the А15 post (+2 draws, zoneSigns)
    // and the ONE water-sheet mesh (+1) — nothing else moves.
    expect(withWater.stats.staticDrawSlots).toBe(without.stats.staticDrawSlots + 3);
    // Deterministic (no seed dependence in the water pass).
    const again = buildWorldGeometry(fixtureDistrict([waterZone()]), { seed: 7 });
    expect(again.stats).toEqual(withWater.stats);
    expect(Array.from(again.waterDecals.positions)).toEqual(
      Array.from(withWater.waterDecals.positions),
    );
  });
});

// ---------------------------------------------------------------------------
// The shipped surface maps (content/world — read-only contracts)
// ---------------------------------------------------------------------------

function loadDistrict(id: string): District {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) throw new Error(`${id}.json not found in: ${candidates.join(", ")}`);
  return assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")));
}

describe("water decals on the shipped surface maps", () => {
  it("ac-aqua-v1: one visible sheet over the authored [240, 280] span", () => {
    const world = buildWorldGeometry(loadDistrict("ac-aqua-v1"), { seed: 7 });
    expect(world.stats.waterDecals).toBe(1);
    const pos = world.waterDecals.positions;
    expect(pos.length).toBe(4 * 3);
    for (let i = 0; i < pos.length; i += 3) {
      expect(Math.abs(pos[i]!)).toBeLessThanOrEqual(LANE_WIDTH_M); // 2-lane travel half
      expect(pos[i + 1]!).toBeCloseTo(WATER_DECAL_Y, 6);
      expect(pos[i + 2]!).toBeGreaterThanOrEqual(-280 - 1e-4);
      expect(pos[i + 2]!).toBeLessThanOrEqual(-240 + 1e-4);
    }
  });

  it("ac-ice-v1: zero sheets — the ice map builds with NO water geometry", () => {
    const world = buildWorldGeometry(loadDistrict("ac-ice-v1"), { seed: 7 });
    expect(world.stats.waterDecals).toBe(0);
    expect(world.waterDecals.positions.length).toBe(0);
    expect(world.waterDecals.indices.length).toBe(0);
  });
});
