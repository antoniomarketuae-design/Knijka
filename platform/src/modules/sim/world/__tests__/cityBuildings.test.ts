import { describe, expect, it } from "vitest";
import {
  buildBuildingInstances,
  CITY_MODELS,
  DEFAULT_HEIGHT_MAX_M,
  DEFAULT_HEIGHT_MIN_M,
  MAX_PAVILIONS,
  orientedBox,
  PAVILION_MAX_HEIGHT_M,
  resolveBuildingHeightM,
  TOWER_MIN_HEIGHT_M,
  TWIN_MAX_GAP_M,
  type FacadeSystem,
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
  at: [number, number] = [0, 0],
): DistrictBuilding => ({
  id,
  height,
  heightSource,
  footprint: [
    [at[0], at[1]],
    [at[0] + s, at[1]],
    [at[0] + s, at[1] + s],
    [at[0], at[1] + s],
  ],
});

describe("CITY_MODELS (district kit v3 contract)", () => {
  it("ships the 16 v3 models with floors parsed from the filename", () => {
    expect(CITY_MODELS).toHaveLength(16);
    for (const m of CITY_MODELS) {
      // t_*_NN or pav_*_NNf — the numeric suffix is the authored storey count.
      const match = m.file.match(/_(\d+)f?$/);
      expect(match, m.file).not.toBeNull();
      expect(m.floors).toBe(Number(match![1]));
      expect(m.mw).toBeGreaterThan(0);
      expect(m.md).toBeGreaterThan(0);
    }
  });

  it("covers every facade system of doc 70 REF 1", () => {
    const systems = new Set<FacadeSystem>(CITY_MODELS.map((m) => m.system));
    expect(systems).toEqual(
      new Set(["grid", "strip", "curtain", "band", "slab", "pavilion"]),
    );
  });

  it("carries exactly one twin pair and two pavilions", () => {
    expect(CITY_MODELS.filter((m) => m.twin === "a")).toHaveLength(1);
    expect(CITY_MODELS.filter((m) => m.twin === "b")).toHaveLength(1);
    expect(CITY_MODELS.filter((m) => m.system === "pavilion")).toHaveLength(2);
    // Twins are curtain-system towers, not pavilions.
    for (const m of CITY_MODELS) {
      if (m.twin) expect(m.system).toBe("curtain");
    }
  });
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
    const m = CITY_MODELS[p.model]!;
    expect(m.system).not.toBe("pavilion");
    expect(m.twin).toBeUndefined(); // a lone tall plot never gets a twin
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

describe("buildBuildingInstances (v3 — twin pair placement)", () => {
  it("hosts the curtain twins on two adjacent tower plots of equal height", () => {
    // The real pair: w50009548 / w50010502 — both 51 m, centres ~69 m apart.
    const a = square("twin-west", 25, 51, "levels", [0, 0]);
    const b = square("twin-east", 25, 51, "levels", [69, 0]);
    const inst = buildBuildingInstances([a, b]);
    expect(inst).toHaveLength(2);
    const models = inst.map((p) => CITY_MODELS[p.model]!);
    expect(new Set(models.map((m) => m.twin))).toEqual(new Set(["a", "b"]));
    // Both render at their (equal) data height — the identical pair.
    expect(inst[0]!.scale[1]).toBe(51);
    expect(inst[1]!.scale[1]).toBe(51);
  });

  it("does not pair plots further apart than the twin gap", () => {
    const a = square("far-1", 25, 51, "levels", [0, 0]);
    const b = square("far-2", 25, 51, "levels", [TWIN_MAX_GAP_M + 60, 0]);
    const inst = buildBuildingInstances([a, b]);
    expect(inst).toHaveLength(2);
    for (const p of inst) expect(CITY_MODELS[p.model]!.twin).toBeUndefined();
  });

  it("does not pair plots with very different heights", () => {
    const a = square("short-neighbour", 25, 42, "levels", [0, 0]);
    const b = square("tall-neighbour", 25, 70, "levels", [60, 0]);
    const inst = buildBuildingInstances([a, b]);
    expect(inst).toHaveLength(2);
    for (const p of inst) expect(CITY_MODELS[p.model]!.twin).toBeUndefined();
  });
});

describe("buildBuildingInstances (v3 — facade-system spread)", () => {
  it("spreads distinct facade systems across separated tower plots", () => {
    // Five tall compact plots, pairwise > TWIN_MAX_GAP_M apart and with
    // height gaps that forbid twin pairing → round-robin over all 5 systems.
    const plots = [42, 52, 62, 72, 44].map((h, i) =>
      square(`spread-${i}`, 25, h, "levels", [i * 400, (i % 2) * 400]),
    );
    const inst = buildBuildingInstances(plots);
    expect(inst).toHaveLength(5);
    const systems = new Set(inst.map((p) => CITY_MODELS[p.model]!.system));
    expect(systems).toEqual(new Set(["grid", "strip", "curtain", "band", "slab"]));
    for (const p of inst) expect(CITY_MODELS[p.model]!.twin).toBeUndefined();
  });

  it("keeps the spread deterministic", () => {
    const plots = [42, 52, 62, 72, 44].map((h, i) =>
      square(`spread-${i}`, 25, h, "levels", [i * 400, (i % 2) * 400]),
    );
    expect(buildBuildingInstances(plots)).toEqual(buildBuildingInstances(plots));
  });
});

describe("buildBuildingInstances (v3 — retail pavilions)", () => {
  // A qualifying plot: 16 x 12 m (192 m²) at 3 m — a low retail box.
  const pavPlot = (id: string, at: [number, number] = [0, 0]): DistrictBuilding => ({
    id,
    height: 3,
    heightSource: "levels",
    footprint: [
      [at[0], at[1]],
      [at[0] + 16, at[1]],
      [at[0] + 16, at[1] + 12],
      [at[0], at[1] + 12],
    ],
  });

  it("places a bronze pavilion on a small, low, data-known plot — exact plot fit", () => {
    const inst = buildBuildingInstances([pavPlot("kiosk-row")]);
    expect(inst).toHaveLength(1);
    const p = inst[0]!;
    const m = CITY_MODELS[p.model]!;
    expect(m.system).toBe("pavilion");
    expect(p.scale[1]).toBe(3); // data height
    // Exact OBB fit — a pavilion must not overhang its collider footprint.
    expect(p.scale[0] * m.mw).toBeCloseTo(16);
    expect(p.scale[2] * m.md).toBeCloseTo(12);
    expect(p.position[0]).toBeCloseTo(8);
    expect(p.position[2]).toBeCloseTo(-6);
  });

  it(`uses the 2-floor pavilion for taller plots (< ${PAVILION_MAX_HEIGHT_M} m)`, () => {
    const tall = { ...pavPlot("mezzanine"), height: 6 };
    const p = buildBuildingInstances([tall])[0]!;
    const m = CITY_MODELS[p.model]!;
    expect(m.system).toBe("pavilion");
    expect(m.floors).toBe(2);
    expect(p.scale[1]).toBe(6);
  });

  it("skips kiosk-scale and default-height plots", () => {
    // Too small for the pavilion silhouette.
    expect(buildBuildingInstances([square("tiny", 4, 3, "levels")])).toEqual([]);
    // No OSM data → 15–25 m jitter → not low → prism.
    expect(buildBuildingInstances([square("guess", 14, 3, "default")])).toEqual([]);
  });

  it(`caps pavilions at ${MAX_PAVILIONS} and keeps the pick deterministic`, () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      pavPlot(`pav-${i}`, [i * 40, 0]),
    );
    const inst = buildBuildingInstances(many);
    expect(inst).toHaveLength(MAX_PAVILIONS);
    for (const p of inst) expect(CITY_MODELS[p.model]!.system).toBe("pavilion");
    expect(buildBuildingInstances(many)).toEqual(inst);
  });
});
