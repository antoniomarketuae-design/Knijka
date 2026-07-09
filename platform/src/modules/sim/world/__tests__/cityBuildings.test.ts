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
  const block: DistrictBuilding = {
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

  it("places exactly one glass tower per footprint, on the ground", () => {
    const inst = buildBuildingInstances([block]);
    expect(inst).toHaveLength(1); // towers are monolithic — one per plot
    const p = inst[0]!;
    expect(p.position[1]).toBe(0); // base on the ground
    expect(Number.isFinite(p.position[0])).toBe(true);
    expect(Number.isFinite(p.position[2])).toBe(true);
    expect(p.scale[0]).toBeGreaterThan(0);
    expect(p.scale[2]).toBeGreaterThan(0);
    expect(p.model).toBeGreaterThanOrEqual(0);
    expect(p.model).toBeLessThan(CITY_MODELS.length);
    // Tower is centred on the footprint (world z = -y).
    expect(p.position[0]).toBeCloseTo(24);
    expect(p.position[2]).toBeCloseTo(-5);
  });

  it("derives height from the footprint size, not the OSM height", () => {
    const inst = buildBuildingInstances([block]);
    const h = inst[0]!.scale[1];
    // A tall, believable tower — NOT the 12 m OSM height.
    expect(h).toBeGreaterThan(40);
    expect(h).toBeLessThanOrEqual(175);
    expect(h).not.toBeCloseTo(12);
  });

  it("keeps plausible tower proportions (no absurd footprint stretch)", () => {
    const inst = buildBuildingInstances([block]);
    const p = inst[0]!;
    const m = CITY_MODELS[p.model]!;
    const H = p.scale[1];
    // Fit width/depth stay within the capped band of the model's natural
    // footprint (mw·H × md·H) — never a squished box or a wildly fat slab.
    const worldW = p.scale[0] * m.mw;
    const worldD = p.scale[2] * m.md;
    expect(worldW).toBeGreaterThanOrEqual((m.mw * H) / 1.6 - 1e-6);
    expect(worldW).toBeLessThanOrEqual(m.mw * H * 1.6 + 1e-6);
    expect(worldD).toBeGreaterThanOrEqual((m.md * H) / 1.6 - 1e-6);
    expect(worldD).toBeLessThanOrEqual(m.md * H * 1.6 + 1e-6);
  });

  it("puts taller towers on bigger footprints", () => {
    const square = (id: string, s: number): DistrictBuilding => ({
      id,
      height: 20,
      heightSource: "height",
      footprint: [
        [0, 0],
        [s, 0],
        [s, s],
        [0, s],
      ],
    });
    const small = buildBuildingInstances([square("small", 8)])[0]!;
    const large = buildBuildingInstances([square("large", 40)])[0]!;
    // Bigger plot → taller authored model AND a taller rendered height.
    expect(CITY_MODELS[large.model]!.floors).toBeGreaterThan(
      CITY_MODELS[small.model]!.floors,
    );
    expect(large.scale[1]).toBeGreaterThan(small.scale[1]);
  });

  it("is deterministic", () => {
    const a = buildBuildingInstances([block]);
    const b = buildBuildingInstances([block]);
    expect(a).toEqual(b);
  });

  it("skips degenerate footprints", () => {
    expect(
      buildBuildingInstances([
        { id: "x", height: 9, heightSource: "default", footprint: [[0, 0]] },
      ]),
    ).toEqual([]);
  });
});
