import { describe, expect, it } from "vitest";
import {
  offsetPolyline,
  pointAlong,
  pointInRing,
  polylineLength,
  projectOntoPolyline,
  signedArea,
  toCCW,
  triangulate,
  trimPolyline,
  mulberry32,
  valueNoise2D,
  SegmentGrid,
  AabbGrid,
  type Vec2,
} from "../builders/math2d";

describe("polyline utilities", () => {
  const line: Vec2[] = [
    [0, 0],
    [10, 0],
    [10, 10],
  ];

  it("measures arc length", () => {
    expect(polylineLength(line)).toBeCloseTo(20);
  });

  it("interpolates point + tangent along the line", () => {
    const a = pointAlong(line, 5);
    expect(a.point[0]).toBeCloseTo(5);
    expect(a.point[1]).toBeCloseTo(0);
    expect(a.tangent).toEqual([1, 0]);
    const b = pointAlong(line, 15);
    expect(b.point[0]).toBeCloseTo(10);
    expect(b.point[1]).toBeCloseTo(5);
    expect(b.tangent[1]).toBeCloseTo(1);
  });

  it("trims both ends by arc length", () => {
    const t = trimPolyline(line, 2, 3);
    expect(t).not.toBeNull();
    expect(polylineLength(t!)).toBeCloseTo(15);
    expect(t![0]![0]).toBeCloseTo(2);
    expect(t![t!.length - 1]![1]).toBeCloseTo(7);
  });

  it("returns null when the trim swallows the line", () => {
    expect(trimPolyline(line, 12, 12)).toBeNull();
  });

  it("offsets a straight line at constant distance", () => {
    const off = offsetPolyline(
      [
        [0, 0],
        [0, 10],
      ],
      2,
    );
    // Right of northbound travel is east (+x).
    expect(off[0]![0]).toBeCloseTo(2);
    expect(off[1]![0]).toBeCloseTo(2);
    expect(off[0]![1]).toBeCloseTo(0);
  });

  it("keeps ribbon width at a 90-degree joint (miter)", () => {
    const off = offsetPolyline(line, 1);
    // At the corner the miter point is at (11, -1) for a right offset of
    // travel east-then-north... right of east is south, right of north is
    // east; the miter bisects to (11, -1)? Distance from corner must be
    // sqrt(2) * offset.
    const corner: Vec2 = [10, 0];
    const d = Math.hypot(off[1]![0] - corner[0], off[1]![1] - corner[1]);
    expect(d).toBeCloseTo(Math.SQRT2, 5);
  });

  it("projects a point onto the nearest segment", () => {
    const p = projectOntoPolyline(line, [4, 3]);
    expect(p.point[0]).toBeCloseTo(4);
    expect(p.point[1]).toBeCloseTo(0);
    expect(p.s).toBeCloseTo(4);
    expect(p.distance).toBeCloseTo(3);
  });
});

describe("polygon utilities", () => {
  const square: Vec2[] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ];

  it("signed area is positive for CCW", () => {
    expect(signedArea(square)).toBeCloseTo(16);
    expect(signedArea([...square].reverse())).toBeCloseTo(-16);
  });

  it("toCCW normalizes winding", () => {
    const fixed = toCCW([...square].reverse());
    expect(signedArea(fixed)).toBeGreaterThan(0);
  });

  it("triangulates a square into 2 tris with full area", () => {
    const tris = triangulate(square);
    expect(tris.length).toBe(6);
    let area = 0;
    for (let i = 0; i < tris.length; i += 3) {
      const a = square[tris[i]!]!;
      const b = square[tris[i + 1]!]!;
      const c = square[tris[i + 2]!]!;
      area += ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    }
    expect(area).toBeCloseTo(16);
  });

  it("triangulates a concave L-shape with positive-area tris", () => {
    const lShape: Vec2[] = [
      [0, 0],
      [6, 0],
      [6, 2],
      [2, 2],
      [2, 6],
      [0, 6],
    ];
    const tris = triangulate(lShape);
    expect(tris.length).toBe((lShape.length - 2) * 3);
    let area = 0;
    for (let i = 0; i < tris.length; i += 3) {
      const a = lShape[tris[i]!]!;
      const b = lShape[tris[i + 1]!]!;
      const c = lShape[tris[i + 2]!]!;
      const triArea = ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
      expect(triArea).toBeGreaterThan(0); // CCW output, no flipped ears
      area += triArea;
    }
    expect(area).toBeCloseTo(6 * 2 + 2 * 4);
  });

  it("point-in-ring", () => {
    expect(pointInRing([2, 2], square)).toBe(true);
    expect(pointInRing([5, 2], square)).toBe(false);
  });
});

describe("determinism", () => {
  it("mulberry32 streams are reproducible and in [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const va = a();
      expect(va).toBe(b());
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThan(1);
    }
  });

  it("value noise is deterministic and smooth-bounded", () => {
    expect(valueNoise2D(1.5, 2.5, 7)).toBe(valueNoise2D(1.5, 2.5, 7));
    for (let i = 0; i < 50; i++) {
      const v = valueNoise2D(i * 0.317, i * 0.211, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("SegmentGrid", () => {
  it("returns distance to the nearest segment, capped", () => {
    const grid = new SegmentGrid(10);
    grid.addPolyline([
      [0, 0],
      [100, 0],
    ]);
    expect(grid.distanceTo([50, 7], 30)).toBeCloseTo(7);
    expect(grid.distanceTo([50, 500], 30)).toBe(30);
  });
});

describe("AabbGrid", () => {
  /**
   * The grid replaced a linear `buildingAabbs.some(...)` in terrain.ts and
   * props.ts when doc 82 V7 put 380 footprints on one map. Its only job is to
   * answer the SAME predicate faster, so the test that matters is agreement
   * with the brute-force scan — including the cases a cell-radius bug would
   * miss: a box straddling several cells, and a query whose pad reaches across
   * a cell boundary into a box that touches none of the query's own cells.
   */
  const brute = (boxes: [number, number, number, number][], p: Vec2, pad: number) =>
    boxes.some(
      ([x0, y0, x1, y1]) => p[0] > x0 - pad && p[0] < x1 + pad && p[1] > y0 - pad && p[1] < y1 + pad,
    );

  it("agrees with the linear scan everywhere, at every pad", () => {
    const boxes: [number, number, number, number][] = [
      [-5, -5, 12, 3], // straddles the origin and several 10 m cells
      [40, 40, 44, 44], // smaller than one cell
      [-120, 60, 90, 66], // long and thin, spans many cells
    ];
    const grid = new AabbGrid(10);
    for (const b of boxes) grid.add(b);
    for (let x = -140; x <= 110; x += 3.5) {
      for (let y = -20; y <= 80; y += 3.5) {
        for (const pad of [0.5, 6, 20]) {
          expect(grid.hits([x, y], pad), `(${x}, ${y}) pad ${pad}`).toBe(brute(boxes, [x, y], pad));
        }
      }
    }
  });

  it("an empty grid never hits (the district-with-no-buildings path)", () => {
    const grid = new AabbGrid(24);
    expect(grid.hits([0, 0], 100)).toBe(false);
  });
});
