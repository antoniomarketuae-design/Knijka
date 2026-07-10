/**
 * Lesson-spec data invariants for the A5 visual-floor additions (doc 68):
 * L5 carries a renderable sudden-obstacle stimulus, L7 carries a painted
 * parking-bay rect, and no other lesson accidentally grows either.
 */
import { describe, expect, it } from "vitest";
import { PERCEPTUAL_ROAD_SCALE } from "../../contracts";
import { LESSON_PARKING_BAYS, LESSONS, lessonById } from "../specs";

const SCALED_LANE_M = 3.25 * PERCEPTUAL_ROAD_SCALE;

describe("L5 hazard stimulus (ball dart-out)", () => {
  const l5 = lessonById("l5-emergency-braking")!;

  it("exists and is a ball dart-out", () => {
    expect(l5.hazard).toBeDefined();
    expect(l5.hazard!.kind).toBe("ballDartOut");
  });

  it("darts along a unit direction at a plausible speed", () => {
    const h = l5.hazard!;
    expect(Math.hypot(h.dirX, h.dirY)).toBeCloseTo(1, 3);
    expect(h.speedMps).toBeGreaterThan(1);
    expect(h.speedMps).toBeLessThan(8);
  });

  it("travels far enough to cross the scaled 1-lane carriageway", () => {
    // spawn-2's straight (ул. Васил Калчев) is a 1-lane oneway: full width =
    // one scaled lane. The dart must clear it (plus curb margins) so the ball
    // visibly crosses the student's path rather than dying mid-lane.
    expect(l5.hazard!.travelM).toBeGreaterThan(SCALED_LANE_M);
  });
});

describe("L7 parking bay", () => {
  const l7 = lessonById("l7-parking")!;

  it("exists and fits a real-size car with margin", () => {
    const bay = l7.parkingBay!;
    expect(bay).toBeDefined();
    // Car is ~1.9 m wide / ~4.4 m long (real-size per the perceptual-scale
    // rule: only the ROAD scales). The bay must fit it with maneuver margin.
    expect(bay.widthM).toBeGreaterThanOrEqual(2.6);
    expect(bay.lengthM).toBeGreaterThanOrEqual(5.5);
    expect(bay.headingDeg).toBeGreaterThanOrEqual(0);
    expect(bay.headingDeg).toBeLessThan(360);
  });

  it("stays inside the scaled 2-lane carriageway of ул. Трайко Станоев", () => {
    // spawn-1's street is residential, 2 lanes: half-width = one scaled lane.
    // The bay center sits 6.4 m right of the centerline; its far edge
    // (center + width/2) must not poke past the curb or the paint vanishes
    // under the raised sidewalk mesh.
    const bay = l7.parkingBay!;
    const lateralCenterM = 6.4; // authored alongside the rect (specs.ts)
    expect(lateralCenterM + bay.widthM / 2).toBeLessThanOrEqual(SCALED_LANE_M);
  });

  it("is collected into LESSON_PARKING_BAYS for the world builder", () => {
    expect(LESSON_PARKING_BAYS).toContain(l7.parkingBay!);
  });
});

describe("no accidental spread", () => {
  it("only L5 stages a hazard and only L7 paints a bay", () => {
    for (const lesson of LESSONS) {
      if (lesson.id !== "l5-emergency-braking") expect(lesson.hazard).toBeUndefined();
      if (lesson.id !== "l7-parking") expect(lesson.parkingBay).toBeUndefined();
    }
  });
});
