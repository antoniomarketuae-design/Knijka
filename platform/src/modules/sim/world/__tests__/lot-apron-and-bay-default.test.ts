/**
 * buildWorldGeometry's two DISTRICT-SCOPING defects, from the sweep161 frames.
 *
 * Both are the same mistake in opposite directions — the builder was answering
 * "what does this district contain?" with something that was not this district.
 *
 * 1. THE BAY DEFAULT WAS THE CITY'S. `LESSON_PARKING_BAYS` is collected from
 *    the lessons whose district is DEFAULT_DISTRICT_ID, and it was the default
 *    for every map. A bare build of lot-perp-v1 (bounds x ≤ 11.03) painted the
 *    city's L7 rect at x = 681.26: the markings mesh reached x = 685.0, 674 m
 *    past the far edge of that world, and `stats.parkingBays` read 1 on all 90
 *    scenario districts — while the five bays lot-perp-v1 authors itself were
 *    drawn only when a caller handed them back in.
 *
 * 2. THE LOT HAD NO GROUND. Ground-use zoning paves terrain near BUILDINGS, and
 *    a parking lot has none. On lot-gap-short-v1 the paved mesh spanned district
 *    y ∈ [-177.5, -25.0] and stopped 25 m short of the bays at y ∈ [-14.05,
 *    +14.05] — the frames the founder saw („the manoeuvre is performed in a
 *    void", „the car is alone on green grass", „nothing to be parallel to").
 *
 * Every assertion below is written so it FAILS on the pre-fix builder, and each
 * is paired with the opposite direction: the city must keep the bay it really
 * owns, an explicit `parkingBays: []` must still mean bare, and the apron must
 * pave the LOT and not the map.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LESSON_PARKING_BAYS } from "../../lessons/specs";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { TERRAIN_MARGIN_M } from "../builders/constants";
import { assertDistrict, type District, type MeshData } from "../types";

function loadDistrict(id: string): District {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")) as unknown);
    }
  }
  throw new Error(`${id}.json not found in: ${candidates.join(", ")}`);
}

/** Terrain grid step, m — the pass lays 112×112 cells over bounds + margin. */
function terrainCellDiagonalM(district: District): number {
  const b = district.meta.boundsLocalMeters;
  const dx = (b.maxX - b.minX + 2 * TERRAIN_MARGIN_M) / 112;
  const dy = (b.maxY - b.minY + 2 * TERRAIN_MARGIN_M) / 112;
  return Math.hypot(dx, dy);
}

/** True when `mesh` owns a vertex within `r` of the district-space point — the
 *  ground-use question ("is this square metre paved or grassed?") asked of a
 *  merged mesh. World z = -districtY. */
function meshCovers(mesh: MeshData, x: number, y: number, r: number): boolean {
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    if (Math.hypot(p[i]! - x, -p[i + 2]! - y) <= r) return true;
  }
  return false;
}

/** A one-street district with no buildings and no boundary-adjacent ends, so
 *  the ONLY thing that can pave its terrain is the lot apron. `mapKind` is the
 *  single field the two variants differ in. */
function synthetic(mapKind: string): District {
  return {
    format: "district-v1",
    meta: {
      district: "apron-test",
      label: "Apron test",
      mapKind,
      boundsLocalMeters: { minX: -300, minY: -300, maxX: 300, maxY: 300 },
      attribution: {
        text: "Map data © OpenStreetMap contributors",
        license: "ODbL 1.0",
        licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
        copyrightUrl: "https://www.openstreetmap.org/copyright",
      },
      scenario: {
        bays: [
          { id: "b-1", x: 8, y: 0, headingDeg: 0, widthM: 2.5, lengthM: 5, occupied: false },
        ],
      },
    },
    roads: {
      nodes: [
        { id: "nS", x: 0, y: -200 },
        { id: "nN", x: 0, y: 200 },
      ],
      edges: [
        {
          id: "e",
          from: "nS",
          to: "nN",
          class: "residential",
          name: null,
          oneway: false,
          roundabout: false,
          lanes: 2,
          lanesSource: "tag",
          maxspeed: 50,
          maxspeedSource: "default",
          length: 400,
          geometry: [
            [0, -200],
            [0, 200],
          ],
        },
      ],
    },
    intersections: [],
    crossings: [],
    roundabouts: [],
    buildings: [],
    spawnPoints: [],
  };
}

describe("the bay set a bare build paints is the district's own", () => {
  it("draws lot-perp-v1's five authored bays and nothing outside its bounds", () => {
    const lot = loadDistrict("lot-perp-v1");
    const world = buildWorldGeometry(lot);
    // Was 1 — the city's L7 rect, on a map that authors five bays of its own.
    expect(world.stats.parkingBays).toBe(5);

    const b = lot.meta.boundsLocalMeters;
    const p = world.markings.positions;
    let farthestX = -Infinity;
    for (let i = 0; i < p.length; i += 3) farthestX = Math.max(farthestX, p[i]!);
    // Pre-fix this was 685.0 against a drawn ground that ends at 71.03.
    expect(farthestX).toBeLessThanOrEqual(b.maxX + TERRAIN_MARGIN_M);
  });

  it("still paints the city's own L7 bay on the city district", () => {
    // The opposite direction: scoping the default must not take from the one
    // district the lesson bays actually belong to.
    const city = loadDistrict("district-v1");
    const world = buildWorldGeometry(city);
    expect(LESSON_PARKING_BAYS.length).toBeGreaterThanOrEqual(1);
    expect(world.stats.parkingBays).toBe(LESSON_PARKING_BAYS.length);

    const bay = LESSON_PARKING_BAYS[0]!;
    const p = world.markings.positions;
    let near = 0;
    for (let i = 0; i < p.length; i += 3) {
      if (Math.hypot(p[i]! - bay.x, -p[i + 2]! - bay.y) < bay.lengthM) near++;
    }
    expect(near).toBeGreaterThanOrEqual(12); // 3 quads × 4 vertices
  });

  it("keeps `parkingBays: []` meaning a bare build", () => {
    const lot = loadDistrict("lot-perp-v1");
    expect(buildWorldGeometry(lot, { parkingBays: [] }).stats.parkingBays).toBe(0);
  });
});

describe("a scenario-lot district's bays stand on a paved apron", () => {
  it("paves the ground under lot-gap-short-v1's bay band", () => {
    const lot = loadDistrict("lot-gap-short-v1");
    const world = buildWorldGeometry(lot);
    const r = terrainCellDiagonalM(lot);
    // lotgs-bay-3, the target slot. Pre-fix the paved mesh stopped at y = -25,
    // so this square metre was grass and the manoeuvre happened on a lawn.
    expect(meshCovers(world.terrainPaved, 6.28, 0, r)).toBe(true);
  });

  it("paves the lot and NOT the map", () => {
    // 100 m down the approach: 18 m clear of the nearest paved thing before the
    // fix and after it. An apron that reached here would be the "credit
    // everybody" answer to the missing one.
    const lot = loadDistrict("lot-gap-short-v1");
    const world = buildWorldGeometry(lot);
    const r = terrainCellDiagonalM(lot);
    expect(meshCovers(world.terrainPaved, 10, -100, r)).toBe(false);
    expect(meshCovers(world.terrain, 10, -100, r)).toBe(true);
  });

  it("gives the apron to a scenario-lot map and withholds it from a street", () => {
    // Same document twice; `mapKind` is the only difference. A kerbside bay on
    // a street is asphalt, not a courtyard, so pk-double-v1 / vu-door-v1 keep
    // the ground their buildings give them.
    const lotWorld = buildWorldGeometry(synthetic("scenario-lot"));
    const streetWorld = buildWorldGeometry(synthetic("scenario-street"));
    const r = terrainCellDiagonalM(synthetic("scenario-lot"));

    expect(meshCovers(lotWorld.terrainPaved, 8, 0, r)).toBe(true);
    expect(streetWorld.terrainPaved.positions.length).toBe(0);
    expect(meshCovers(streetWorld.terrain, 8, 0, r)).toBe(true);
  });
});
