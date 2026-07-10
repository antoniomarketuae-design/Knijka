import { describe, expect, it } from "vitest";
import {
  buildBuildingInstances,
  CITY_MODELS,
  DEFAULT_HEIGHT_MAX_M,
  DEFAULT_HEIGHT_MIN_M,
  orientedBox,
  resolveBuildingHeightM,
  TOWER_MIN_HEIGHT_M,
} from "../builders/cityBuildings";
import type { DistrictBuilding } from "../types";

describe("orientedBox", () => {
  it("fits an axis-aligned rectangle (long axis = width)", () => {
    // 20 x 6 rectangle, CCW.
    const box = orientedBox([
      [0, 0],
      [20, 0],
      [20, 6],
      [0, 6],
    ]);
    expect(box.cx).toBeCloseTo(10);
    expect(box.cy).toBeCloseTo(3);
    expect(box.w).toBeCloseTo(20); // long axis
    expect(box.d).toBeCloseTo(6); // short axis
    // Width axis runs along x -> angle 0 (or ±π).
    expect(Math.abs(Math.sin(box.angle))).toBeCloseTo(0);
  });

  it("recovers the orientation of a rotated rectangle", () => {
    const a = 0.6; // radians
    const c = Math.cos(a);
    const s = Math.sin(a);
    // A 10 x 4 rectangle rotated by `a` about the origin.
    const rot = (x: number, y: number): [number, number] => [
      x * c - y * s,
      x * s + y * c,
    ];
    const box = orientedBox([rot(-5, -2), rot(5, -2), rot(5, 2), rot(-5, 2)]);
    expect(box.w).toBeCloseTo(10);
    expect(box.d).toBeCloseTo(4);
    // Long axis aligned with the rotation (mod π).
    const diff = Math.abs((((box.angle - a) % Math.PI) + Math.PI) % Math.PI);
    expect(Math.min(diff, Math.PI - diff)).toBeCloseTo(0);
  });
});

const square = (
  id: string,
  s: number,
  height: number,
  heightSource: DistrictBuilding["heightSource"],
): DistrictBuilding => ({
  id,
  height,
  heightSource,
  footprint: [
    [0, 0],
    [s, 0],
    [s, s],
    [0, s],
  ],
});

describe("resolveBuildingHeightM (QW3 — heights from the district data)", () => {
  it("trusts OSM-sourced heights", () => {
    expect(resolveBuildingHeightM(square("a", 20, 15, "levels"))).toBe(15);
    expect(resolveBuildingHeightM(square("b", 20, 48, "height"))).toBe(48);
  });

  it("clamps data glitches", () => {
    expect(resolveBuildingHeightM(square("c", 20, 0.5, "levels"))).toBe(3);
    expect(resolveBuildingHeightM(square("d", 20, 400, "levels"))).toBe(75);
  });

  it("jitters no-data buildings into the 15–25 m mid-rise band, deterministically", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const b = square(`w${i * 7919}`, 20, 6, "default");
      const h = resolveBuildingHeightM(b);
      expect(h).toBeGreaterThanOrEqual(DEFAULT_HEIGHT_MIN_M);
      expect(h).toBeLessThanOrEqual(DEFAULT_HEIGHT_MAX_M);
      expect(resolveBuildingHeightM(b)).toBe(h); // deterministic per id
      seen.add(Math.round(h * 10));
    }
    expect(seen.size).toBeGreaterThan(10); // actually varied, not one constant
  });
});

describe("buildBuildingInstances (QW3 — towers only where the data says tall)", () => {
  // The modal Студентски град building: a 48 x 10 m panelka at 15 m.
  const panelka: DistrictBuilding = {
    id: "panelka-1",
    height: 15,
    heightSource: "levels",
    footprint: [
      [0, 0],
      [48, 0],
      [48, 10],
      [0, 10],
    ],
  };
  // A genuine high-rise on a compact plot (the four real ones are 24–35 m).
  const highRise = square("dorm-tower", 26, 48, "levels");

  it("leaves mid-rise buildings to the facade-prism pass (no tower)", () => {
    expect(buildBuildingInstances([panelka])).toEqual([]);
  });

  it("leaves no-data buildings (15–25 m jitter) to the prism pass", () => {
    expect(buildBuildingInstances([square("nodata", 30, 6, "default")])).toEqual([]);
  });

  it("places one tower on a tall, compact footprint — at the DATA height", () => {
    const inst = buildBuildingInstances([highRise]);
    expect(inst).toHaveLength(1);
    const p = inst[0]!;
    expect(p.buildingId).toBe("dorm-tower");
    expect(p.position[1]).toBe(0); // base on the ground
    expect(p.scale[1]).toBe(48); // rendered height == OSM height, not plot-derived
    expect(p.model).toBeGreaterThanOrEqual(0);
    expect(p.model).toBeLessThan(CITY_MODELS.length);
    // Centred on the footprint (world z = -y).
    expect(p.position[0]).toBeCloseTo(13);
    expect(p.position[2]).toBeCloseTo(-13);
  });

  it("keeps window proportions bounded under compression (stretch cap)", () => {
    const p = buildBuildingInstances([highRise])[0]!;
    const m = CITY_MODELS[p.model]!;
    const H = p.scale[1];
    const worldW = p.scale[0] * m.mw;
    const worldD = p.scale[2] * m.md;
    // Fit stays within STRETCH of the model's natural footprint at the
    // RENDERED height — bounds window-aspect distortion even when the tower
    // is vertically compressed to the data height.
    expect(worldW).toBeGreaterThanOrEqual((m.mw * H) / 1.6 - 1e-6);
    expect(worldW).toBeLessThanOrEqual(m.mw * H * 1.6 + 1e-6);
    expect(worldD).toBeGreaterThanOrEqual((m.md * H) / 1.6 - 1e-6);
    expect(worldD).toBeLessThanOrEqual(m.md * H * 1.6 + 1e-6);
  });

  it("keeps campus-scale plots as prisms even when tall (no invisible-wall shards)", () => {
    // Real case: w681738480 is 48 m tall on a ~94 x 75 m multi-wing plot.
    expect(buildBuildingInstances([square("campus", 90, 48, "levels")])).toEqual([]);
  });

  it(`the tower threshold is ${TOWER_MIN_HEIGHT_M} m`, () => {
    expect(buildBuildingInstances([square("under", 26, TOWER_MIN_HEIGHT_M - 1, "levels")])).toHaveLength(0);
    expect(buildBuildingInstances([square("over", 26, TOWER_MIN_HEIGHT_M, "levels")])).toHaveLength(1);
  });

  it("is deterministic", () => {
    const a = buildBuildingInstances([highRise, panelka]);
    const b = buildBuildingInstances([highRise, panelka]);
    expect(a).toEqual(b);
  });

  it("skips degenerate footprints", () => {
    expect(
      buildBuildingInstances([
        { id: "x", height: 50, heightSource: "levels", footprint: [[0, 0]] },
      ]),
    ).toEqual([]);
  });
});
