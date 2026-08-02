/**
 * Ledger L9 second-order — register rows B14 / B46 / B47 / B49.
 *
 * He said it four times, on four different lessons: *„the Pedestrian at the end
 * when he leaves the Zebra, he goes trough a car which is standing on the
 * sidewalk"*, *„he passes like a ghost trough some car"*. Doc 86 closed the
 * parked-car half with crossing clear zones and wrote the rest down as
 * „second-order": *„the walk ends at x = 13.72, which is 1.69 m past the back
 * of the 3.5 m sidewalk, so the walker comes to permanent rest off the
 * pavement."* Nobody actioned it, and the verification pass saw it again.
 *
 * Census of the 27 staged `pedestrianDartOut` specs: 22 share one generated
 * geometry — travelM 23.45 against roadToM 17.85, i.e. 5.6 m past the edge of
 * the carriageway. The pavement is 3.5 m deep and the kerbside parked bodies
 * sit 2.0 m out, so that walk crosses the parking band, crosses the whole
 * pavement and stops in the verge behind it.
 *
 * `PED_REST_PAST_ROAD_M` ends the walk one pace onto the pavement instead. The
 * two properties that make it safe are pinned here: it can only ever SHORTEN a
 * walk, and it cannot move any boundary the drill grades.
 */
import { describe, expect, it } from "vitest";
import type { PedestrianDartOutSpec } from "../../contracts";
import { SCENARIO_TEMPLATES } from "@/modules/sim/lessons";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";
import { PedestrianDartOutRunner, PED_REST_PAST_ROAD_M } from "../runners";

/** SIDEWALK_WIDTH_M (world/builders/constants) — the pavement she steps onto. */
const SIDEWALK_WIDTH_M = 3.5;
/** PARK_BAND_CENTER_M (traffic/TrafficLayer) — where a kerbside body sits. */
const PARK_BAND_CENTER_M = 2.0;

function straightDistrict(): TrafficDistrict {
  return {
    roads: {
      nodes: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 0, y: 200 },
      ],
      edges: [
        {
          id: "e",
          from: "a",
          to: "b",
          class: "residential",
          oneway: false,
          roundabout: false,
          lanes: 2,
          maxspeed: 50,
          length: 200,
          geometry: [
            [0, 0],
            [0, 200],
          ],
        },
      ],
    },
    intersections: [],
    crossings: [],
  };
}

function pedSpecs(): PedestrianDartOutSpec[] {
  const out: PedestrianDartOutSpec[] = [];
  for (const t of SCENARIO_TEMPLATES) {
    for (const e of t.staged ?? []) {
      if (e.kind === "pedestrianDartOut") out.push(e as PedestrianDartOutSpec);
    }
  }
  return out;
}

describe("staged pedestrian walk end (L9 second-order)", () => {
  it("rests on the pavement, clear of both the carriageway and the parked row", () => {
    // One pace past the kerb: past the carriageway, inside a 3.5 m pavement,
    // and short of the 2.0 m parking-band centre so she can never finish
    // inside a parked body even where no clear zone was authored.
    expect(PED_REST_PAST_ROAD_M).toBeGreaterThan(0.5);
    expect(PED_REST_PAST_ROAD_M).toBeLessThan(PARK_BAND_CENTER_M);
    expect(PED_REST_PAST_ROAD_M).toBeLessThan(SIDEWALK_WIDTH_M);
  });

  it("the census this was measured against is still the census", () => {
    const specs = pedSpecs();
    expect(specs.length).toBeGreaterThanOrEqual(25);
    const overshooting = specs.filter(
      (s) => s.travelM - s.roadToM > PED_REST_PAST_ROAD_M,
    );
    // 22 of the 27 shared the generated 23.45/17.85 walk. If a data lane
    // re-authors them the number moves; a ZERO here would mean this guard has
    // quietly stopped doing anything.
    expect(overshooting.length).toBeGreaterThanOrEqual(15);
  });

  it("shortens the generated crossing walk and leaves a short one alone", () => {
    const traffic = createTrafficSystem(straightDistrict(), {
      anchor: { x: 0, y: 100 },
      anchorRadiusM: 300,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    const base = {
      kind: "pedestrianDartOut" as const,
      crossingId: "x",
      crossing: { x: 0, y: 100 },
      start: { x: -9.73, y: 100 },
      dir: { x: 1, y: 0 },
      speedMps: 1.4,
      roadFromM: 1.6,
      triggerDistM: 40,
      minTriggerSpeedKmh: 8,
    };
    // The generated PE walk: 5.6 m past the kerb → clamped.
    const longSpec = {
      ...base,
      id: "long",
      travelM: 23.45,
      roadToM: 17.85,
    } as unknown as PedestrianDartOutSpec;
    new PedestrianDartOutRunner(longSpec).stage(traffic, () => 0.5, true);
    const long = traffic.staged("long")!;
    expect(long.pathLengthM).toBeCloseTo(17.85 + PED_REST_PAST_ROAD_M, 5);

    // Already short (the reversing-bay aisle walker's +1.2 m): untouched.
    const shortSpec = {
      ...base,
      id: "short",
      travelM: 8.4,
      roadFromM: 1.2,
      roadToM: 7.2,
    } as unknown as PedestrianDartOutSpec;
    new PedestrianDartOutRunner(shortSpec).stage(traffic, () => 0.5, true);
    expect(traffic.staged("short")!.pathLengthM).toBeCloseTo(8.4, 5);
  });

  it("still reaches every arc the encounter grades against", () => {
    // `onRoad` is roadFromM..roadToM and the runner resolves on
    // `s > roadToM + 0.5 || finished`. So the clamp is safe exactly when it
    // never shortens a walk below what the author already wrote: whatever far
    // edge she used to reach, she still reaches, and the `finished` half of the
    // resolution still fires for the two specs that deliberately stop AT the
    // kerb (sc-hz-accident-scene's bystander walks exactly roadToM).
    // AMBIENT figures are excluded, and the reason is the same one that makes
    // them ambient: their road window is authored BEYOND the walk on purpose
    // (roadFromM = travelM + 100), so "she still reaches the arc she is graded
    // against" is not a property they can have — there is no arc, because they
    // are never graded. The school-yard children are the case. The encounter
    // battery holds them to the opposite and stricter assertion: that they can
    // never reach the carriageway at any speed.
    for (const s of pedSpecs().filter((p) => !p.ambient)) {
      const travel = Math.min(s.travelM, s.roadToM + PED_REST_PAST_ROAD_M);
      expect(travel, s.id).toBeLessThanOrEqual(s.travelM);
      expect(travel, s.id).toBeGreaterThanOrEqual(Math.min(s.travelM, s.roadToM));
      expect(travel, s.id).toBeGreaterThan(s.roadFromM);
    }
  });
});
