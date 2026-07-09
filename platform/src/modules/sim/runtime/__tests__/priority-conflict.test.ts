import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { drive, edgeById, edgeDrivePath, eventsOf, loadDistrict } from "./helpers";

// Reuses the minor-approach stop-sign junction from stoplines.test.ts.
describe("priority conflict (give-way/stop) emission", () => {
  const district = loadDistrict();
  const minorId = "e1182196532.0"; // residential minor approach with a stop-sign line

  it("emits a violated prioritySituation when conflicting traffic is present", () => {
    const rt = createWorldRuntime(district);
    rt.setJunctionConflictQuery(() => true); // a car is coming
    const minor = edgeById(district, minorId);
    const { ticks } = drive(rt, edgeDrivePath(minor, 30, 0.5, 0.5, 1.625));
    expect(eventsOf(ticks, "prioritySituation")).toContainEqual({
      kind: "prioritySituation",
      situation: "give-way",
      violated: true,
    });
  });

  it("emits no prioritySituation when the road is clear (default query)", () => {
    const rt = createWorldRuntime(district);
    const minor = edgeById(district, minorId);
    const { ticks } = drive(rt, edgeDrivePath(minor, 30, 0.5, 0.5, 1.625));
    expect(eventsOf(ticks, "prioritySituation")).toHaveLength(0);
    // The stop-line crossing itself still fires — we only added the yield check.
    expect(eventsOf(ticks, "stopLineCrossed")).toHaveLength(1);
  });
});
