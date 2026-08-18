/**
 * THE APRON MUST REACH THE END OF THE AISLE — the half of the `scenario-lot`
 * ground defect that the first apron pass could not see, because it sampled
 * one map.
 *
 * `lotApronFootprint` padded the BAY BAND, and on eleven of the fourteen
 * committed lot maps the bay band is shorter than the aisle it is served from.
 * Every lot map is a 60–90 m `residential` approach plus a ~70 m `service`
 * aisle running y ∈ [-30, +40]; padding the bays alone left the far end of that
 * aisle on grass — measured, with the aisle union disabled, as a paved mesh
 * whose maxY was:
 *
 *     lot-narrow                                    25.0   (15.0 m short)
 *     lot-perp / lot-van / lot-wall / lot-double
 *       / lot-left                                  27.5   (12.5 m)
 *     lot-45 / lot-45rev                            30.0   (10.0 m)
 *     lot-gap-short / lot-par                       35.0   ( 5.0 m)
 *     lot-gap-judge                                 37.5   ( 2.5 m)
 *
 * — so the last 2.5 to 15 m of the roadway the drill drives to ended in a
 * field. That is sweep161's „the world runs out mid-lesson" (sc-park-gap-short)
 * and „an unbroken grass plane" (sc-park-bay-exit-rev, whose task 2 finishes at
 * y = 20 and whose student then drives the rest of the aisle).
 *
 * BOTH DIRECTIONS ARE ASSERTED. The catalogue case fails on the old builder
 * (11 of the 14); the synthetic pair fails on the two ways of over-fixing it —
 * unioning service edges on a map that is not a lot, and unioning every road
 * class instead of the lot's own aisle. Mutation-checked: disabling the union
 * in `lotApronFootprint` turns the first `it` red and leaves the rest green.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { TERRAIN_MARGIN_M } from "../builders/constants";
import { assertDistrict, type District, type MeshData } from "../types";

const WORLD_DIR = (() => {
  const local = path.join(process.cwd(), "content", "world");
  return fs.existsSync(local) ? local : path.resolve(process.cwd(), "..", "content", "world");
})();

function loadDistrict(id: string): District {
  return assertDistrict(
    JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf8")) as unknown,
  );
}

/** Every committed map whose `mapKind` puts it through the apron pass. */
function scenarioLotIds(): string[] {
  return fs
    .readdirSync(WORLD_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .filter((id) => loadDistrict(id).meta.mapKind === "scenario-lot");
}

/** Terrain grid step, m — the pass lays 112×112 cells over bounds + margin. */
function terrainCellDiagonalM(district: District): number {
  const b = district.meta.boundsLocalMeters;
  return Math.hypot(
    (b.maxX - b.minX + 2 * TERRAIN_MARGIN_M) / 112,
    (b.maxY - b.minY + 2 * TERRAIN_MARGIN_M) / 112,
  );
}

/** True when `mesh` owns a vertex within `r` of the district-space point.
 *  World z = -districtY. */
function meshCovers(mesh: MeshData, x: number, y: number, r: number): boolean {
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    if (Math.hypot(p[i]! - x, -p[i + 2]! - y) <= r) return true;
  }
  return false;
}

/** Northmost district-y the mesh owns a vertex at (-Infinity when empty). */
function maxDistrictY(mesh: MeshData): number {
  const p = mesh.positions;
  let max = -Infinity;
  for (let i = 2; i < p.length; i += 3) max = Math.max(max, -p[i]!);
  return max;
}

/** Far end of the lot's own roadway — the `service` aisle's northmost point. */
function aisleEndY(district: District): number {
  const ys = district.roads.edges
    .filter((e) => e.class === "service")
    .flatMap((e) => e.geometry.map((g) => g[1]!));
  expect(ys.length).toBeGreaterThan(0);
  return Math.max(...ys);
}

describe("a scenario-lot's apron covers the aisle, not just the bays", () => {
  it("paves past the far end of every committed lot map's aisle", () => {
    const ids = scenarioLotIds();
    // Guard the guard: if the catalogue ever loses its lot maps this test must
    // fail loudly rather than pass over an empty list.
    expect(ids.length).toBe(14);
    for (const id of ids) {
      const district = loadDistrict(id);
      const world = buildWorldGeometry(district);
      const end = aisleEndY(district);
      // Pre-fix this was 27.5 against an aisle ending at 40 on lot-perp-v1.
      expect(`${id}: paved to ${maxDistrictY(world.terrainPaved).toFixed(1)}`).toBe(
        `${id}: paved to ${Math.max(maxDistrictY(world.terrainPaved), end).toFixed(1)}`,
      );
      // …and the verge just outside the kerb at that end is concrete, not lawn:
      // the half-width there is 8.125 m, so x = 11 is off the carriageway.
      expect(meshCovers(world.terrainPaved, 11, end - 1, terrainCellDiagonalM(district))).toBe(
        true,
      );
    }
  }, 60000);

  it("still refuses the approach street 100 m out", () => {
    // The over-credit direction on the real catalogue: an apron that unioned
    // the whole road network would pave the residential approach's verges as a
    // courtyard. lot-night-v1 is excluded BY MEASUREMENT, not by taste — its
    // approach is 60 m rather than 90 m, so a terminus closure's own building
    // apron already reaches this square metre, identically with the aisle union
    // disabled.
    for (const id of scenarioLotIds().filter((i) => i !== "lot-night-v1")) {
      const district = loadDistrict(id);
      const world = buildWorldGeometry(district);
      const r = terrainCellDiagonalM(district);
      expect(`${id}: ${meshCovers(world.terrainPaved, 10, -100, r)}`).toBe(`${id}: false`);
      expect(`${id}: ${meshCovers(world.terrain, 10, -100, r)}`).toBe(`${id}: true`);
    }
  }, 60000);
});

/**
 * A lot and a street that differ ONLY in `mapKind`, each with a service aisle
 * and a residential approach — so the two ways of over-fixing this are the two
 * things the pair refuses.
 */
function syntheticLot(mapKind: string): District {
  const edge = (
    id: string,
    cls: string,
    from: [number, number],
    to: [number, number],
  ) => ({
    id,
    from: `${id}-a`,
    to: `${id}-b`,
    class: cls,
    name: null,
    oneway: false,
    roundabout: false,
    lanes: 2,
    lanesSource: "tag" as const,
    maxspeed: 30,
    maxspeedSource: "default" as const,
    length: Math.hypot(to[0] - from[0], to[1] - from[1]),
    geometry: [from, to] as [number, number][],
  });
  return {
    format: "district-v1",
    meta: {
      district: "aisle-test",
      label: "Aisle test",
      mapKind,
      boundsLocalMeters: { minX: -300, minY: -300, maxX: 300, maxY: 300 },
      attribution: {
        text: "Map data © OpenStreetMap contributors",
        license: "ODbL 1.0",
        licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
        copyrightUrl: "https://www.openstreetmap.org/copyright",
      },
      scenario: {
        bays: [{ id: "b-1", x: 8, y: 0, headingDeg: 0, widthM: 2.5, lengthM: 5, occupied: false }],
      },
    },
    roads: {
      nodes: [
        { id: "aisle-a", x: 0, y: -30 },
        { id: "aisle-b", x: 0, y: 120 },
        { id: "appr-a", x: 0, y: -250 },
        { id: "appr-b", x: 0, y: -30 },
      ],
      edges: [
        edge("aisle", "service", [0, -30], [0, 120]),
        edge("appr", "residential", [0, -250], [0, -30]),
      ],
    },
    intersections: [],
    crossings: [],
    roundabouts: [],
    buildings: [],
    spawnPoints: [],
  } as unknown as District;
}

describe("the aisle union is gated, and it is the AISLE", () => {
  const r = terrainCellDiagonalM(syntheticLot("scenario-lot"));

  it("carries the lot's paving to the aisle's far end", () => {
    // 120 m up the aisle and 40 m past the single bay at y = 0: unreachable by
    // padding the bay band, which stops at y = 22.5.
    const world = buildWorldGeometry(syntheticLot("scenario-lot"));
    expect(meshCovers(world.terrainPaved, 11, 118, r)).toBe(true);
  });

  it("gives a street with the same service lane no apron at all", () => {
    // The mapKind gate: a delivery lane behind a shop is asphalt, not a
    // courtyard, and this district has no buildings, so ANY paving here would
    // be the apron leaking past its gate.
    const world = buildWorldGeometry(syntheticLot("scenario-street"));
    expect(world.terrainPaved.positions.length).toBe(0);
    expect(meshCovers(world.terrain, 11, 118, r)).toBe(true);
  });

  it("does not follow the residential approach out of the lot", () => {
    // Unioning every edge instead of the aisle would pave y = -200 here; the
    // approach is a street, and a street's verge is not a car park.
    const world = buildWorldGeometry(syntheticLot("scenario-lot"));
    expect(meshCovers(world.terrainPaved, 11, -200, r)).toBe(false);
    expect(meshCovers(world.terrain, 11, -200, r)).toBe(true);
  });
});
