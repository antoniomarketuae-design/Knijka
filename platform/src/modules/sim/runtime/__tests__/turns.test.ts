import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { eventsOf, loadDistrict, mkVehicle, type PathPose } from "./helpers";
import type { SimTick } from "../../rules/types";

/**
 * Turn detection: >55° accumulated heading change inside a 3 s window while
 * within 30 m of an intersection node. Reference junction n179974491
 * (448.94, -250.42); reference far-from-junction point (-200, -200) is
 * ≥ 70 m from every intersection in this build.
 */
const J = { x: 448.94, y: -250.42 };
const FAR = { x: -200, y: -200 };

function sweepPoses(
  center: { x: number; y: number },
  fromDeg: number,
  toDeg: number,
  frames: number,
): PathPose[] {
  const poses: PathPose[] = [];
  for (let i = 0; i < frames; i++) {
    const heading = fromDeg + ((toDeg - fromDeg) * i) / (frames - 1);
    // Small arc near the center — stays well inside the junction area.
    const rad = (heading * Math.PI) / 180;
    poses.push({ x: center.x + 6 * Math.sin(rad), y: center.y + 6 * Math.cos(rad), headingDeg: heading });
  }
  return poses;
}

function run(rtPoses: PathPose[], dtSec: number): SimTick[] {
  const rt = createWorldRuntime(loadDistrict());
  const ticks: SimTick[] = [];
  let t = 0;
  for (const pose of rtPoses) {
    t += dtSec;
    rt.update(dtSec);
    ticks.push(rt.sample(mkVehicle(pose), t, false));
  }
  return ticks;
}

describe("turn detection", () => {
  it("emits exactly one turnStarted: right for a +90° sweep at a junction", () => {
    // Southbound → westbound right turn at the reference junction, 1.5 s.
    const ticks = run(sweepPoses(J, 178, 268, 30), 0.05);
    const turns = eventsOf(ticks, "turnStarted");
    expect(turns).toEqual([{ kind: "turnStarted", direction: "right" }]);
  });

  it("emits turnStarted: left for a -90° sweep", () => {
    const ticks = run(sweepPoses(J, 178, 88, 30), 0.05);
    expect(eventsOf(ticks, "turnStarted")).toEqual([{ kind: "turnStarted", direction: "left" }]);
  });

  it("handles the 0/360 wrap (350° → 80° is a right turn)", () => {
    const ticks = run(sweepPoses(J, 350, 440, 30), 0.05); // normalizes past north
    expect(eventsOf(ticks, "turnStarted")).toEqual([{ kind: "turnStarted", direction: "right" }]);
  });

  it("ignores heading changes away from junctions", () => {
    const ticks = run(sweepPoses(FAR, 178, 268, 30), 0.05);
    expect(eventsOf(ticks, "turnStarted")).toHaveLength(0);
  });

  it("ignores gentle curves (< 55° in the window)", () => {
    const ticks = run(sweepPoses(J, 178, 218, 30), 0.05); // 40° over 1.5 s
    expect(eventsOf(ticks, "turnStarted")).toHaveLength(0);
  });

  it("ignores slow drift: 90° spread over 9 s never accumulates 55° in 3 s", () => {
    const ticks = run(sweepPoses(J, 178, 268, 180), 0.05); // 0.5°/frame
    expect(eventsOf(ticks, "turnStarted")).toHaveLength(0);
  });

  it("re-arms after straightening out — two turns emit two events", () => {
    const poses = [
      ...sweepPoses(J, 178, 268, 30), // right turn
      ...Array.from({ length: 80 }, () => ({ x: J.x, y: J.y - 5, headingDeg: 268 })), // 4 s straight
      ...sweepPoses(J, 268, 358, 30), // second right turn
    ];
    const ticks = run(poses, 0.05);
    expect(eventsOf(ticks, "turnStarted")).toEqual([
      { kind: "turnStarted", direction: "right" },
      { kind: "turnStarted", direction: "right" },
    ]);
  });
});
