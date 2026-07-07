import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { createRuleEngine, reduceTick } from "../../rules/engine";
import type { RuleEvent } from "../../rules/types";
import { drive, edgeById, edgeDrivePath, eventsOf, loadDistrict, mkVehicle, pointAlong } from "./helpers";

describe("worldRuntime integration", () => {
  const district = loadDistrict();

  it("rejects non-district JSON", () => {
    expect(() => createWorldRuntime({ format: "nope" })).toThrow(/district/);
  });

  it("resolves speed limits: tagged 30 edge, default-50 edge, off-road default", () => {
    const rt = createWorldRuntime(district);
    // e170139947.0 (ул. Проф. Борис Боровски) carries maxspeed 30.
    const e30 = edgeById(district, "e170139947.0");
    const p30 = pointAlong(e30.geometry, 60);
    expect(rt.speedLimitAt({ x: p30.x, y: p30.y })).toBe(30);
    // e519275131.0 (ул. Трайко Станоев) resolves to the urban default 50.
    const e50 = edgeById(district, "e519275131.0");
    const p50 = pointAlong(e50.geometry, 176);
    expect(rt.speedLimitAt({ x: p50.x, y: p50.y })).toBe(50);
    // Off-road (≥ 25 m from every edge): BG urban default.
    expect(rt.speedLimitAt({ x: 0, y: 0 })).toBe(50);
    // sample() agrees with speedLimitAt on the same position.
    rt.update(0.016);
    const tick = rt.sample(mkVehicle({ x: p30.x, y: p30.y, headingDeg: 0 }), 0.016, false);
    expect(tick.maxSpeedKmh).toBe(30);
  });

  it("passes collisions and mirror glances through, draining the queue", () => {
    const rt = createWorldRuntime(district);
    rt.pushCollision("vehicle");
    rt.pushCollision("staticObject");
    rt.update(0.016);
    const pose = { x: 620.96, y: -215.89, headingDeg: 71.2 };
    const t1 = rt.sample(mkVehicle(pose, { mirrorGlance: "left" }), 0.016, false);
    expect(t1.events.slice(0, 3)).toEqual([
      { kind: "collision", withWhat: "vehicle" },
      { kind: "collision", withWhat: "staticObject" },
      { kind: "mirrorGlance", mirror: "left" },
    ]);
    rt.update(0.016);
    const t2 = rt.sample(mkVehicle(pose), 0.032, false);
    expect(t2.events).toHaveLength(0); // queue drained, no glance this frame
  });

  it("copies vehicle state onto the tick verbatim", () => {
    const rt = createWorldRuntime(district);
    rt.update(0.016);
    const tick = rt.sample(
      mkVehicle(
        { x: 620.96, y: -215.89, headingDeg: 71.2 },
        { speedKmh: 42.5, indicator: "left", headlights: "high", seatbeltOn: false, handbrakeOn: true, gear: 2 },
      ),
      1.5,
      true,
    );
    expect(tick.t).toBe(1.5);
    expect(tick.speedKmh).toBe(42.5);
    expect(tick.indicator).toBe("left");
    expect(tick.headlights).toBe("high");
    expect(tick.seatbeltOn).toBe(false);
    expect(tick.handbrakeOn).toBe(true);
    expect(tick.gear).toBe(2);
    expect(tick.isNight).toBe(true);
    expect(tick.position).toEqual({ x: 620.96, y: -215.89 });
    expect(tick.headingDeg).toBe(71.2);
  });

  it("feeds the rule engine end-to-end: running the red light at n179974491 scores RED_LIGHT_CROSSED", () => {
    const rt = createWorldRuntime(district);
    // Park the reference junction's N-S axis at the START of a red window.
    let prev = rt.signalPhaseForApproach("n179974491", 178);
    for (let t = 0; t < 120; t += 0.1) {
      rt.update(0.1);
      const cur = rt.signalPhaseForApproach("n179974491", 178);
      if (cur === "red" && prev !== "red") break;
      prev = cur;
    }
    const edge = edgeById(district, "e672186634.0");
    const { ticks } = drive(rt, edgeDrivePath(edge, 20, 58, 1, 4.875), { speedKmh: 30 });

    let state = createRuleEngine();
    const ruleEvents: RuleEvent[] = [];
    for (const tick of ticks) {
      const res = reduceTick(state, tick);
      state = res.state;
      ruleEvents.push(...res.events);
    }
    const codes = ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("RED_LIGHT_CROSSED");
  });

  it("emits a stopLineCrossed exactly once when the handover to the junction edge happens mid-approach", () => {
    // Regression guard for the edge-transition sweep: approach + continue
    // across the junction; the single southbound line fires exactly once.
    const rt = createWorldRuntime(district);
    const eIn = edgeById(district, "e672186634.0");
    const eOut = edgeById(district, "e724866098.0");
    const { ticks } = drive(rt, [
      ...edgeDrivePath(eIn, 40, eIn.length, 1, 1.625),
      ...edgeDrivePath(eOut, 0.5, 30, 1, 1.625),
    ]);
    expect(eventsOf(ticks, "stopLineCrossed")).toHaveLength(1);
  });

  it("sample() stays cheap: full-drive average under 50 µs/frame", () => {
    const rt = createWorldRuntime(district);
    const edge = edgeById(district, "e519275131.0");
    const poses = edgeDrivePath(edge, 20, 340, 0.4, 1.625); // 800 frames
    // Warmup (JIT) then measure.
    drive(rt, poses.slice(0, 100));
    const t0 = performance.now();
    let frames = 0;
    for (let rep = 0; rep < 5; rep++) {
      for (const pose of poses) {
        rt.update(0.016);
        rt.sample(mkVehicle(pose), frames * 0.016, false);
        frames++;
      }
    }
    const usPerFrame = ((performance.now() - t0) * 1000) / frames;
    console.info(`[perf] worldRuntime.sample(): ${usPerFrame.toFixed(1)} µs/frame over ${frames} frames`);
    expect(usPerFrame).toBeLessThan(50);
  });
});
