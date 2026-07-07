import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { drive, edgeById, edgeDrivePath, loadDistrict, pointAlong } from "./helpers";

/**
 * locate() accuracy against the real district. Ground truth: spawn points
 * (generated mid-edge ON the centerline of their edge) and hand-computed
 * lateral offsets on known straight edges.
 */
describe("locate() on district-v1", () => {
  const district = loadDistrict();

  it("resolves every spawn point to its own edge", () => {
    const rt = createWorldRuntime(district);
    for (const sp of district.spawnPoints) {
      const fix = rt.locate({ x: sp.x, y: sp.y });
      expect(fix.edgeId, sp.id).toBe(sp.edgeId);
    }
  });

  it("computes lane 0 and near-zero offset in the middle of the right lane (2-lane residential)", () => {
    // spawn-1 sits at s≈176 of e519275131.0 (ул. Трайко Станоев, 2 lanes
    // two-way ⇒ 1 lane per direction, lane center 1.625 m right of centerline).
    const rt = createWorldRuntime(district);
    const sp = district.spawnPoints.find((s) => s.id === "spawn-1");
    expect(sp).toBeDefined();
    if (!sp) return;
    const h = (sp.heading * Math.PI) / 180;
    // Right of heading = (cos h, -sin h) in (east, north).
    const pos = { x: sp.x + 1.625 * Math.cos(h), y: sp.y - 1.625 * Math.sin(h) };
    const fix = rt.locate(pos);
    expect(fix.edgeId).toBe(sp.edgeId);
    expect(fix.laneId).toBe(0);
    expect(Math.abs(fix.laneOffsetM)).toBeLessThan(0.4);
  });

  it("numbers lanes 0 = rightmost across a 6-lane arterial (3 per direction)", () => {
    // e672186634.0 — бул. Свети Климент Охридски, 6 lanes two-way, straight.
    const edge = edgeById(district, "e672186634.0");
    const p = pointAlong(edge.geometry, 30);
    // Geometry runs ~south; right of geometry = (ty, -tx).
    const right = (m: number) => ({ x: p.x + p.ty * m, y: p.y - p.tx * m });
    const rt = createWorldRuntime(district);

    const outer = rt.locate(right(8.125)); // outermost southbound lane center
    expect(outer.edgeId).toBe(edge.id);
    expect(outer.laneId).toBe(0);
    expect(Math.abs(outer.laneOffsetM)).toBeLessThan(0.05);

    const inner = rt.locate(right(1.625)); // innermost southbound lane center
    expect(inner.laneId).toBe(2);

    const oncoming = rt.locate(right(-1.625)); // innermost NORTHBOUND lane
    expect(oncoming.edgeId).toBe(edge.id);
    expect(oncoming.laneId).toBe(2); // rightmost = 0 counted for ITS carriageway
  });

  it("returns a null edge when more than 15 m off-road", () => {
    const rt = createWorldRuntime(district);
    // Both points verified ≥ 25 m from every edge centerline in this build.
    for (const pos of [
      { x: 0, y: 0 },
      { x: -200, y: -200 },
    ]) {
      const fix = rt.locate(pos);
      expect(fix.edgeId).toBeNull();
      expect(fix.laneId).toBe(0);
      expect(fix.laneOffsetM).toBe(0);
    }
  });

  it("holds one edge through a junction and hands over exactly once (hysteresis)", () => {
    // Southbound across signalized junction n179974491:
    // e672186634.0 (60.3 m) → e724866098.0. Near the node both edges (plus the
    // crossing residential street) are a couple of meters apart — without
    // hysteresis the fix flip-flops here.
    const rt = createWorldRuntime(district);
    const eIn = edgeById(district, "e672186634.0");
    const eOut = edgeById(district, "e724866098.0");
    const poses = [
      ...edgeDrivePath(eIn, 20, eIn.length, 1, 1.625),
      ...edgeDrivePath(eOut, 0.5, 40, 1, 1.625),
    ];
    const seen: (string | null)[] = [];
    for (const pose of poses) {
      rt.update(0.016);
      rt.sample(
        {
          position: { x: pose.x, y: pose.y },
          headingDeg: pose.headingDeg,
          speedKmh: 30,
          indicator: "off",
          headlights: "off",
          seatbeltOn: true,
          handbrakeOn: false,
          gear: 1,
          mirrorGlance: null,
        },
        seen.length * 0.016,
        false,
      );
      seen.push(rt.locate({ x: pose.x, y: pose.y }).edgeId);
    }
    // Collapse runs: expect exactly [eIn, eOut] — one handover, no flapping.
    const runs = seen.filter((id, i) => i === 0 || id !== seen[i - 1]);
    expect(runs).toEqual([eIn.id, eOut.id]);
  });

  it("keeps the lane id stable under sub-deadband lateral jitter", () => {
    const rt = createWorldRuntime(district);
    const edge = edgeById(district, "e672186634.0");
    const p = pointAlong(edge.geometry, 25);
    // Middle southbound lane center is 4.875 m right; boundary at 3.25 m.
    // Jitter across the boundary by < deadband (0.35 m) must not change lanes.
    const offsets = [4.875, 3.4, 3.05, 3.3, 2.95, 4.0];
    const lanes: number[] = [];
    for (let i = 0; i < offsets.length; i++) {
      const m = offsets[i];
      const pose = { x: p.x + p.ty * m, y: p.y - p.tx * m, headingDeg: 178 };
      rt.update(0.016);
      const tick = rt.sample(
        {
          position: { x: pose.x, y: pose.y },
          headingDeg: pose.headingDeg,
          speedKmh: 30,
          indicator: "off",
          headlights: "off",
          seatbeltOn: true,
          handbrakeOn: false,
          gear: 1,
          mirrorGlance: null,
        },
        (i + 1) * 0.016,
        false,
      );
      lanes.push(tick.laneId);
    }
    expect(lanes).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("drive() reports lane data on every tick of a real route", () => {
    const rt = createWorldRuntime(district);
    const edge = edgeById(district, "e519275131.0");
    const { ticks } = drive(rt, edgeDrivePath(edge, 60, 300, 2, 1.625));
    for (const tick of ticks) {
      expect(tick.laneId).toBe(0);
      expect(Math.abs(tick.laneOffsetM)).toBeLessThan(1.2); // polyline corners
      expect(tick.maxSpeedKmh).toBe(50);
    }
  });
});
