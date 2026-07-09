import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { eventsOf, loadDistrict, mkVehicle, type PathPose } from "./helpers";
import type { SimTick } from "../../rules/types";

const J = { x: 448.94, y: -250.42 }; // reference junction (see turns.test.ts)

// A -90° sweep at the junction → turnStarted: left (mirrors turns.test.ts).
function leftSweep(): PathPose[] {
  const poses: PathPose[] = [];
  for (let i = 0; i < 30; i++) {
    const heading = 178 + ((88 - 178) * i) / 29;
    const rad = (heading * Math.PI) / 180;
    poses.push({ x: J.x + 6 * Math.sin(rad), y: J.y + 6 * Math.cos(rad), headingDeg: heading });
  }
  return poses;
}

function driveTicks(
  rt: ReturnType<typeof createWorldRuntime>,
  poses: PathPose[],
  dt = 0.05,
): SimTick[] {
  const ticks: SimTick[] = [];
  let t = 0;
  for (const pose of poses) {
    t += dt;
    rt.update(dt);
    ticks.push(rt.sample(mkVehicle(pose), t, false));
  }
  return ticks;
}

describe("left-turn yield to oncoming", () => {
  it("emits a violated prioritySituation when turning left across oncoming traffic", () => {
    const rt = createWorldRuntime(loadDistrict());
    rt.setOncomingQuery(() => true); // a car is coming the other way
    expect(eventsOf(driveTicks(rt, leftSweep()), "prioritySituation")).toContainEqual({
      kind: "prioritySituation",
      situation: "left-turn",
      violated: true,
    });
  });

  it("emits no prioritySituation when the way is clear", () => {
    const rt = createWorldRuntime(loadDistrict());
    const ticks = driveTicks(rt, leftSweep());
    expect(eventsOf(ticks, "prioritySituation")).toHaveLength(0);
    // sanity: the left turn itself is still detected
    expect(eventsOf(ticks, "turnStarted")).toContainEqual({ kind: "turnStarted", direction: "left" });
  });
});
