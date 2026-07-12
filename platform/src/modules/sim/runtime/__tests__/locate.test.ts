import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { LANE_WIDTH_M } from "../spatial";
import { drive, edgeById, edgeDrivePath, loadDistrict, pointAlong } from "./helpers";

/**
 * locate() accuracy against the real district. Ground truth: spawn points
 * (generated mid-edge ON the centerline of their edge) and lateral offsets
 * derived from LANE_WIDTH_M on known straight edges (lane center of lane k
 * from the outside = (lanesPerDir - k - 0.5) × W from the centerline).
 */
const W = LANE_WIDTH_M;
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
    // two-way ⇒ 1 lane per direction, lane center W/2 right of centerline).
    const rt = createWorldRuntime(district);
    const sp = district.spawnPoints.find((s) => s.id === "spawn-1");
    expect(sp).toBeDefined();
    if (!sp) return;
    const h = (sp.heading * Math.PI) / 180;
    // Right of heading = (cos h, -sin h) in (east, north).
    const pos = { x: sp.x + (W / 2) * Math.cos(h), y: sp.y - (W / 2) * Math.sin(h) };
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

    const outer = rt.locate(right(2.5 * W)); // outermost southbound lane center
    expect(outer.edgeId).toBe(edge.id);
    expect(outer.laneId).toBe(0);
    expect(Math.abs(outer.laneOffsetM)).toBeLessThan(0.05);

    const inner = rt.locate(right(0.5 * W)); // innermost southbound lane center
    expect(inner.laneId).toBe(2);

    const oncoming = rt.locate(right(-0.5 * W)); // innermost NORTHBOUND lane
    expect(oncoming.edgeId).toBe(edge.id);
    expect(oncoming.laneId).toBe(2); // rightmost = 0 counted for ITS carriageway
  });

  it("returns a null edge when more than 30 m off-road", () => {
    const rt = createWorldRuntime(district);
    // Both points verified ≥ 38 m from every edge centerline in this build.
    for (const pos of [
      { x: 100, y: -450 },
      { x: -120, y: -380 },
    ]) {
      const fix = rt.locate(pos);
      expect(fix.edgeId).toBeNull();
      expect(fix.laneId).toBe(0);
      expect(fix.laneOffsetM).toBe(0);
    }
  });

  it("holds one edge through a junction and never flip-flops (hysteresis)", () => {
    // Southbound across signalized junction n179974491:
    // e672186634.0 (60.3 m) → e724866098.0. Near the node several edges run
    // a couple of meters apart — without hysteresis the fix flip-flops here.
    // With the perceptual road scale the junction box is ~43 m wide and the
    // lane-center path passes almost ON the SW street's (e661825048.3)
    // centerline at the mouth, so a single clean pass-through fix on it is
    // legitimate; what hysteresis must guarantee is NO A→B→A flapping.
    const rt = createWorldRuntime(district);
    const eIn = edgeById(district, "e672186634.0");
    const eOut = edgeById(district, "e724866098.0");
    const poses = [
      ...edgeDrivePath(eIn, 20, eIn.length, 1, W / 2),
      ...edgeDrivePath(eOut, 0.5, 40, 1, W / 2),
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
    // Collapse runs: starts on eIn, ends on eOut, and NO edge ever repeats
    // (a repeat = the fix flapped back — exactly what hysteresis prevents).
    const runs = seen.filter((id, i) => i === 0 || id !== seen[i - 1]);
    expect(runs[0]).toBe(eIn.id);
    expect(runs[runs.length - 1]).toBe(eOut.id);
    expect(new Set(runs).size).toBe(runs.length);
    expect(runs.length).toBeLessThanOrEqual(3); // at most one mid-junction pass-through
  });

  it("keeps the lane id stable under sub-deadband lateral jitter", () => {
    const rt = createWorldRuntime(district);
    const edge = edgeById(district, "e672186634.0");
    const p = pointAlong(edge.geometry, 25);
    // Middle southbound lane center is 1.5·W right; boundary at W.
    // Jitter across the boundary by < deadband (0.35 m) must not change lanes.
    const offsets = [1.5 * W, W + 0.15, W - 0.2, W + 0.05, W - 0.3, W + 0.75];
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
    const { ticks } = drive(rt, edgeDrivePath(edge, 60, 300, 2, W / 2));
    for (const tick of ticks) {
      expect(tick.laneId).toBe(0);
      // Polyline-corner deviation grows with the lateral offset (≈ W/2 now).
      expect(Math.abs(tick.laneOffsetM)).toBeLessThan(3.0);
      expect(tick.maxSpeedKmh).toBe(50);
    }
  });
});

// ---------------------------------------------------------------------------
// C1 revision — heading gate on edge-lock stealing
// ---------------------------------------------------------------------------

describe("edge-lock stealing is heading-gated in sample() tracking (C1)", () => {
  const district = loadDistrict();

  it("crossing a service-road mouth on the boulevard never bills the stub's limit", () => {
    // e672169337.0/e672169337.1 run north (3-lane oneway, 50 km/h); the
    // 30 km/h service stub e1043264868.0 tees in from the east exactly at
    // their joint (n9601848047). A driver riding the right lane crosses the
    // stub's centerline extension within centimeters — distance alone stole
    // the committed lock for ~1 s and SPEEDING_DANGEROUS was billed against
    // the stub's 30 km/h limit at a lawful 45 (found by the C1 exam-bank
    // bot; the predecessor's 1.5 m lane inset only shrank the window).
    // The stub is near-perpendicular to the travel heading, so the heading
    // gate must keep the lock on the aligned boulevard edges.
    const rt = createWorldRuntime(district);
    const a = edgeById(district, "e672169337.0");
    const b = edgeById(district, "e672169337.1");
    // Rightmost-lane center of a 3-lane oneway = (lanes-1)/2 × W = one lane
    // width right of the centerline; 1.5 m inset like the C1 bot rides.
    const laneCenter = LANE_WIDTH_M - 1.5;
    const poses = [
      ...edgeDrivePath(a, 20, a.length, 0.5, laneCenter),
      ...edgeDrivePath(b, 0, b.length - 2, 0.5, laneCenter),
    ];
    const { ticks } = drive(rt, poses, { speedKmh: 45 });
    for (const t of ticks) {
      expect(t.maxSpeedKmh, `locked to ${t.edgeId} at (${t.position.x.toFixed(1)}, ${t.position.y.toFixed(1)})`).toBe(50);
      expect(t.wrongWay ?? false).toBe(false);
    }
  });
});
