/**
 * parseDistrict — the wrong-file gate, and the one thing it used to wave
 * through.
 *
 * `parseDistrict` is the only door a district document walks through on its
 * way into the runtime (`worldRuntime.createWorldRuntime`), and its docstring
 * says what it is for: „guards against loading the wrong file". Every check in
 * it fails LOUDLY — wrong `format`, missing `roads`, a missing `crossings[]` —
 * except one. `typeof meta.boundsLocalMeters !== "object"` is true for `null`
 * (`typeof null === "object"`) and for `{}`, and those two are exactly the
 * shapes a truncated / half-written / not-actually-a-district file arrives in.
 *
 * What they walk into is `DistrictIndex`, which builds its uniform grid from
 * `minX/minY - CELL_M` and `ceil((maxX - minX) / CELL_M)`. Absent numbers make
 * every cell index NaN, the insert loop `for (cx = c0x; cx <= c1x; cx++)`
 * never iterates, and the grid ships empty — measured below in
 * „the consequence", the reason this file exists.
 *
 * The battery is deliberately symmetric: five documents that MUST be refused,
 * and — the other half of the same duty — the whole committed corpus plus an
 * inverted box that MUST still be accepted, so a later tightening cannot turn
 * this gate into one that refuses everybody.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDistrict } from "../district";
import { DistrictIndex, makeEdgeHit } from "../spatial";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const WORLD_DIR = path.join(REPO_ROOT, "content", "world");

/** The smallest document that satisfies every OTHER check in the parser, so a
 *  failure here can only be about the field under test. */
function minimalDistrict(bounds: unknown): Record<string, unknown> {
  return {
    format: "district-v1",
    meta: { boundsLocalMeters: bounds },
    roads: {
      nodes: [
        { id: "n-s", x: 0, y: -120 },
        { id: "n-c", x: 0, y: 0 },
      ],
      edges: [
        {
          id: "e-s",
          from: "n-s",
          to: "n-c",
          class: "residential",
          oneway: false,
          roundabout: false,
          lanes: 2,
          maxspeed: 40,
          length: 120,
          geometry: [
            [0, -120],
            [0, 0],
          ],
        },
      ],
    },
    intersections: [],
    crossings: [],
    roundabouts: [],
    spawnPoints: [],
  };
}

const GOOD_BOUNDS = { minX: -150, minY: -120, maxX: 150, maxY: 0 };

describe("parseDistrict — the bounds gate", () => {
  // -- REFUSED. Each of these parsed cleanly before the gate was tightened. ---

  it("refuses meta.boundsLocalMeters: null (typeof null === 'object')", () => {
    expect(() => parseDistrict(minimalDistrict(null))).toThrow(/boundsLocalMeters/);
  });

  it("refuses an empty bounds object", () => {
    expect(() => parseDistrict(minimalDistrict({}))).toThrow(/boundsLocalMeters/);
  });

  it("refuses a bounds box missing one member", () => {
    expect(() => parseDistrict(minimalDistrict({ minX: -150, minY: -120, maxX: 150 }))).toThrow(
      /maxY/,
    );
  });

  it("refuses a non-finite member", () => {
    expect(() =>
      parseDistrict(minimalDistrict({ ...GOOD_BOUNDS, maxX: Number.NaN })),
    ).toThrow(/maxX/);
    expect(() =>
      parseDistrict(minimalDistrict({ ...GOOD_BOUNDS, minY: Number.POSITIVE_INFINITY })),
    ).toThrow(/minY/);
  });

  it("refuses a numeric STRING — JSON that lost its types is still the wrong file", () => {
    expect(() => parseDistrict(minimalDistrict({ ...GOOD_BOUNDS, minX: "-150" }))).toThrow(/minX/);
  });

  // -- ACCEPTED. The other half of the duty: the gate must not refuse ---------
  //    everybody. A refusal is as expensive as a wave-through.

  it("accepts a well-formed box and passes the document through by identity", () => {
    const raw = minimalDistrict(GOOD_BOUNDS);
    expect(parseDistrict(raw)).toBe(raw);
  });

  /**
   * MEASURED, not assumed. An inverted box was probed against the real index
   * (midpoint of every edge — points on the carriageway by construction):
   * district-v1 located 323/323 with 0 on the wrong edge, tj-rhr-v1 3/3. The
   * insert and the query share `cellOf`, so a negative column count is
   * self-consistent and nothing observable breaks. It is therefore NOT
   * rejected — a check nothing can be shown to need is a false failure
   * waiting to happen, and this test is what stops one being added blind.
   */
  it("accepts an INVERTED box, because nothing was measured to break on one", () => {
    const inverted = { minX: 150, minY: 0, maxX: -150, maxY: -120 };
    expect(() => parseDistrict(minimalDistrict(inverted))).not.toThrow();
  });

  it("accepts every committed district-v1 document", () => {
    const files = readdirSync(WORLD_DIR).filter((f) => f.endsWith(".json"));
    const districts = files
      .map((f) => JSON.parse(readFileSync(path.join(WORLD_DIR, f), "utf8")) as unknown)
      .filter((d) => (d as { format?: string }).format === "district-v1");
    // The corpus is the point of the test — an empty glob would pass vacuously.
    expect(districts.length).toBeGreaterThan(90);
    for (const [i, d] of districts.entries()) {
      expect(() => parseDistrict(d), files[i]).not.toThrow();
    }
  });

  // -- The checks that already worked, pinned so the tightening did not ------
  //    displace them.

  it("still refuses a foreign format, missing roads and a non-array zones", () => {
    expect(() => parseDistrict(null)).toThrow(/expected an object/);
    expect(() => parseDistrict({ ...minimalDistrict(GOOD_BOUNDS), format: "district-v2" })).toThrow(
      /unsupported format/,
    );
    const noRoads = minimalDistrict(GOOD_BOUNDS);
    delete noRoads.roads;
    expect(() => parseDistrict(noRoads)).toThrow(/roads\.nodes/);
    const noCrossings = minimalDistrict(GOOD_BOUNDS);
    delete noCrossings.crossings;
    expect(() => parseDistrict(noCrossings)).toThrow(/crossings/);
    expect(() => parseDistrict({ ...minimalDistrict(GOOD_BOUNDS), zones: {} })).toThrow(/zones/);
    expect(() => parseDistrict({ ...minimalDistrict(GOOD_BOUNDS), zones: [] })).not.toThrow();
  });
});

describe("parseDistrict — the consequence the gate is standing in front of", () => {
  /**
   * WHY THE GATE IS NOT COSMETIC. Handed a document whose bounds object is
   * empty, `DistrictIndex` throws nothing, reports nothing, and returns an
   * index on which not one point of the map's own carriageway can be located.
   * The car is off-road on its own street for the whole lesson: no edge, no
   * lane, no `maxspeed`, every road-referent objective and detector silent.
   *
   * The assertion is on the CONTRAST (healthy locates all, bounds-less locates
   * none), so it stays honest if `DistrictIndex` is ever hardened too: the
   * day it starts throwing, this test says so instead of quietly passing.
   */
  it("a bounds-less document yields an index that locates nothing", () => {
    const raw = JSON.parse(
      readFileSync(path.join(WORLD_DIR, "tj-rhr-v1.json"), "utf8"),
    ) as Record<string, unknown>;
    const healthy = parseDistrict(raw);
    const onRoad = healthy.roads.edges.map((e) => {
      const g = e.geometry;
      const a = g[0];
      const b = g[g.length - 1];
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
    });
    expect(onRoad.length).toBeGreaterThan(0);

    const located = (d: typeof healthy): number => {
      const idx = new DistrictIndex(d);
      const hit = makeEdgeHit();
      return onRoad.filter(([x, y]) => idx.nearestEdge(x, y, 5, hit)).length;
    };
    expect(located(healthy)).toBe(onRoad.length);

    const boundsLess = {
      ...healthy,
      meta: { ...healthy.meta, boundsLocalMeters: {} as never },
    };
    expect(located(boundsLess)).toBe(0);

    // …and that document can no longer reach the index at all.
    expect(() =>
      parseDistrict({ ...raw, meta: { ...(raw.meta as object), boundsLocalMeters: {} } }),
    ).toThrow(/boundsLocalMeters/);
  });
});
