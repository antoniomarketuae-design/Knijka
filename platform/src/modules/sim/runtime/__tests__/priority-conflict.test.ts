import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { LANE_WIDTH_M } from "../spatial";
import { drive, edgeById, edgeDrivePath, eventsOf, loadDistrict } from "./helpers";

// Reuses the minor-approach stop-sign junction from stoplines.test.ts. The
// line sits at the junction mouth (~36 m up the edge), so approach from
// beyond it — read the position off the runtime rather than hardcoding.
describe("priority conflict (give-way/stop) emission", () => {
  const district = loadDistrict();
  const minorId = "e1182196532.0"; // residential minor approach with a stop-sign line

  function approach(rt: ReturnType<typeof createWorldRuntime>) {
    const minor = edgeById(district, minorId);
    const line = rt
      .debugStopLines()
      .find((l) => district.roads.edges[l.edgeIdx].id === minorId);
    expect(line).toBeDefined();
    return drive(rt, edgeDrivePath(minor, line!.sM + 10, 0.5, 0.5, LANE_WIDTH_M / 2));
  }

  it("emits a violated prioritySituation when conflicting traffic is present", () => {
    const rt = createWorldRuntime(district);
    rt.setJunctionConflictQuery(() => true); // a car is coming
    const { ticks } = approach(rt);
    expect(eventsOf(ticks, "prioritySituation")).toContainEqual({
      kind: "prioritySituation",
      situation: "give-way",
      violated: true,
    });
  });

  it("emits no prioritySituation when the road is clear (default query)", () => {
    const rt = createWorldRuntime(district);
    const { ticks } = approach(rt);
    expect(eventsOf(ticks, "prioritySituation")).toHaveLength(0);
    // The stop-line crossing itself still fires — we only added the yield check.
    expect(eventsOf(ticks, "stopLineCrossed")).toHaveLength(1);
  });
});
