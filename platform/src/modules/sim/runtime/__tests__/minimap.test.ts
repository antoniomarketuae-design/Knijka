import { describe, expect, it } from "vitest";
import {
  buildMinimap,
  fitViewport,
  followViewport,
  headingUpMapRotationRad,
  vehicleMarkerRotationRad,
  worldToCanvas,
} from "..";
import { loadDistrict } from "./helpers";

describe("minimap builder", () => {
  const district = loadDistrict();

  it("keeps every road, point of interest and bound inside the district bounds", () => {
    const map = buildMinimap(district);
    expect(map.roads.length).toBe(district.roads.edges.length);
    expect(map.bounds).toEqual(district.meta.boundsLocalMeters);
    const { minX, minY, maxX, maxY } = map.bounds;
    for (const road of map.roads) {
      expect(road.points.length).toBeGreaterThanOrEqual(4); // ≥ 2 vertices
      expect(road.widthM).toBeGreaterThan(0);
      for (let i = 0; i < road.points.length; i += 2) {
        expect(road.points[i]).toBeGreaterThanOrEqual(minX - 0.01);
        expect(road.points[i]).toBeLessThanOrEqual(maxX + 0.01);
        expect(road.points[i + 1]).toBeGreaterThanOrEqual(minY - 0.01);
        expect(road.points[i + 1]).toBeLessThanOrEqual(maxY + 0.01);
      }
    }
    expect(map.signals.length).toBe(district.intersections.filter((i) => i.signalized).length);
    expect(map.crossings.length).toBeGreaterThan(0);
    expect(map.spawnPoints.length).toBe(district.spawnPoints.length);
  });

  it("simplification reduces vertices but keeps endpoints exact", () => {
    const map = buildMinimap(district, { simplifyToleranceM: 5 });
    const raw = district.roads.edges.reduce((n, e) => n + e.geometry.length, 0);
    const simplified = map.roads.reduce((n, r) => n + r.points.length / 2, 0);
    expect(simplified).toBeLessThan(raw);
    for (const road of map.roads) {
      const edge = district.roads.edges.find((e) => e.id === road.edgeId);
      expect(edge).toBeDefined();
      if (!edge) continue;
      const n = road.points.length;
      // Float32Array storage: compare with tolerance, not exact equality.
      expect(road.points[0]).toBeCloseTo(edge.geometry[0][0], 3);
      expect(road.points[1]).toBeCloseTo(edge.geometry[0][1], 3);
      const [lx, ly] = edge.geometry[edge.geometry.length - 1];
      expect(road.points[n - 2]).toBeCloseTo(lx, 3);
      expect(road.points[n - 1]).toBeCloseTo(ly, 3);
    }
  });

  it("can drop service roads for small maps", () => {
    const withService = buildMinimap(district).roads.length;
    const without = buildMinimap(district, { includeService: false }).roads.length;
    const serviceCount = district.roads.edges.filter((e) => e.class === "service").length;
    expect(without).toBe(withService - serviceCount);
    expect(serviceCount).toBeGreaterThan(0);
  });

  it("classifies road groups by class rank", () => {
    const map = buildMinimap(district);
    const byId = new Map(district.roads.edges.map((e) => [e.id, e.class]));
    for (const road of map.roads) {
      const cls = byId.get(road.edgeId);
      if (cls === "primary" || cls === "secondary" || cls === "secondary_link") {
        expect(road.group).toBe("arterial");
      } else if (cls === "service") {
        expect(road.group).toBe("service");
      }
    }
  });
});

describe("minimap viewport math", () => {
  const bounds = { minX: -100, minY: -50, maxX: 300, maxY: 150 };

  it("fitViewport centers the bounds with padding, north up", () => {
    const vp = fitViewport(bounds, 400, 300, 10);
    // Aspect: world 400×200, canvas inner 380×280 ⇒ scale limited by width.
    expect(vp.scale).toBeCloseTo(380 / 400, 6);
    const [left, top] = worldToCanvas(vp, bounds.minX, bounds.maxY); // NW corner
    const [right, bottom] = worldToCanvas(vp, bounds.maxX, bounds.minY); // SE corner
    expect(left).toBeCloseTo(10, 6); // padded left
    expect(right).toBeCloseTo(390, 6); // padded right
    // Vertically centered: 300 - 200*0.95 = 110 leftover, 55 each side.
    expect(top).toBeCloseTo(55, 6);
    expect(bottom).toBeCloseTo(245, 6);
    // NORTH UP: larger world y ⇒ smaller canvas y.
    expect(top).toBeLessThan(bottom);
  });

  it("followViewport pins the vehicle to the canvas center", () => {
    const vp = followViewport({ x: 620.96, y: -215.89 }, 200, 240, 240);
    const [cx, cy] = worldToCanvas(vp, 620.96, -215.89);
    expect(cx).toBeCloseTo(120, 6);
    expect(cy).toBeCloseTo(120, 6);
    expect(vp.scale).toBeCloseTo(240 / 200, 6);
    // A point 50 m north renders 60 px ABOVE center.
    const [, ny] = worldToCanvas(vp, 620.96, -165.89);
    expect(ny).toBeCloseTo(60, 6);
  });

  it("vehicle marker rotation: heading passes through for a north-up canvas", () => {
    expect(vehicleMarkerRotationRad(0)).toBe(0);
    expect(vehicleMarkerRotationRad(90)).toBeCloseTo(Math.PI / 2, 9); // east = CW right
    expect(vehicleMarkerRotationRad(180)).toBeCloseTo(Math.PI, 9);
    expect(headingUpMapRotationRad(90)).toBeCloseTo(-Math.PI / 2, 9); // map counter-rotates
  });
});
