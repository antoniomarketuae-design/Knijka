import { describe, expect, it } from "vitest";
import {
  buildBuildingInstances,
  CITY_MODELS,
  orientedBox,
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
    const diff = Math.abs(((box.angle - a) % Math.PI + Math.PI) % Math.PI);
    expect(Math.min(diff, Math.PI - diff)).toBeCloseTo(0);
  });
});

describe("buildBuildingInstances", () => {
  const longBlock: DistrictBuilding = {
    id: "panelka-1",
    height: 12,
    heightSource: "levels",
    footprint: [
      [0, 0],
      [48, 0],
      [48, 10],
      [0, 10],
    ],
  };

  it("tiles a long footprint into multiple modules on the ground", () => {
    const inst = buildBuildingInstances([longBlock]);
    expect(inst.length).toBeGreaterThan(1); // a 48 m block is several modules
    for (const p of inst) {
      expect(p.position[1]).toBe(0); // base on the ground
      expect(Number.isFinite(p.position[0])).toBe(true);
      expect(Number.isFinite(p.position[2])).toBe(true);
      expect(p.scale[0]).toBeGreaterThan(0);
      expect(p.scale[1]).toBeCloseTo(12); // height = building height
      expect(p.scale[2]).toBeGreaterThan(0);
      expect(p.model).toBeGreaterThanOrEqual(0);
      expect(p.model).toBeLessThan(CITY_MODELS.length);
      // Modules sit within the footprint span (world z = -y).
      expect(p.position[0]).toBeGreaterThanOrEqual(-2);
      expect(p.position[0]).toBeLessThanOrEqual(50);
    }
  });

  it("is deterministic", () => {
    const a = buildBuildingInstances([longBlock]);
    const b = buildBuildingInstances([longBlock]);
    expect(a).toEqual(b);
  });

  it("picks a tower model for tall buildings", () => {
    const tower: DistrictBuilding = {
      id: "tower-1",
      height: 40,
      heightSource: "height",
      footprint: [
        [0, 0],
        [16, 0],
        [16, 16],
        [0, 16],
      ],
    };
    const inst = buildBuildingInstances([tower]);
    expect(inst.length).toBeGreaterThan(0);
    expect(CITY_MODELS[inst[0]!.model]!.tall).toBe(true);
  });

  it("skips degenerate footprints", () => {
    expect(
      buildBuildingInstances([
        { id: "x", height: 9, heightSource: "default", footprint: [[0, 0]] },
      ]),
    ).toEqual([]);
  });
});
