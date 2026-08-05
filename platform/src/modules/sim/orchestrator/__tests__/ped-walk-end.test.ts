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
import { PED_SHOULDER_HALF_M } from "../../traffic/pedestrians";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";
import { PedestrianDartOutRunner, PED_REST_PAST_ROAD_M } from "../runners";

/** SIDEWALK_WIDTH_M (world/builders/constants) — the pavement she steps onto. */
const SIDEWALK_WIDTH_M = 3.5;
/** PARK_BAND_CENTER_M (traffic/TrafficLayer) — where a kerbside body sits. */
const PARK_BAND_CENTER_M = 2.0;
/** PARKED_HALF_W_M (traffic/TrafficLayer) — and a body is 1.9 m WIDE. */
const PARKED_HALF_W_M = 0.95;
/** SIDEWALK_SKIRT_M (world/builders/constants) — the kerb face she steps up. */
const SIDEWALK_SKIRT_M = 0.35;

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
    // 2026-08-04 — this test used to say `< PARK_BAND_CENTER_M`, and that is
    // how a clamp of 1.8 m was certified as "can never finish inside a parked
    // body". It compared her against the body's CENTRE. A parked body is 1.9 m
    // wide, so it spans 1.05 … 2.95 m past the kerb and 1.8 m is 0.75 m INSIDE
    // its near flank. Register B46 photographed exactly that: rest x 9.94
    // against a body spanning 9.21 … 11.09.
    //
    // The assertion is now against her SHOULDER and the body's FLANK, which is
    // the thing his sentence is about, and it is bounded on both sides — the
    // constant has 0.20 m of legal room in total.
    const nearFlank = PARK_BAND_CENTER_M - PARKED_HALF_W_M; // 1.05 m past the kerb
    expect(PED_REST_PAST_ROAD_M + PED_SHOULDER_HALF_M).toBeLessThanOrEqual(nearFlank);
    // …and far enough out to be standing ON the pavement, not on the kerb face.
    expect(PED_REST_PAST_ROAD_M - PED_SHOULDER_HALF_M).toBeGreaterThanOrEqual(SIDEWALK_SKIRT_M);
    expect(PED_REST_PAST_ROAD_M).toBeLessThan(SIDEWALK_WIDTH_M);
  });

  it("zb-v1 — the district of the lesson he was looking at — puts her nowhere near a body", () => {
    // The concrete instance, in world coordinates, so a future reader does not
    // have to re-derive it. `zb-e-street` is 2-lane residential with no parking
    // band: kerb at 8.125, procedural row on the FOOTWAY at 9.175 … 11.075.
    const KERB_X = 8.125;
    const restX = KERB_X + PED_REST_PAST_ROAD_M;
    const bodyNear = KERB_X + PARK_BAND_CENTER_M - PARKED_HALF_W_M;
    expect(restX + PED_SHOULDER_HALF_M).toBeLessThanOrEqual(bodyNear);
    // The old 1.8 m clamp rested her at 9.925 — inside 9.175 … 11.075.
    expect(KERB_X + 1.8).toBeGreaterThan(bodyNear);
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

    // Already short (sc-hzac-bystander stops AT the kerb, +0.0 m): untouched.
    const shortSpec = {
      ...base,
      id: "short",
      travelM: 7.2,
      roadFromM: 1.2,
      roadToM: 7.2,
    } as unknown as PedestrianDartOutSpec;
    new PedestrianDartOutRunner(shortSpec).stage(traffic, () => 0.5, true);
    expect(traffic.staged("short")!.pathLengthM).toBeCloseTo(7.2, 5);
  });

  it("the three specs the tighter clamp newly shortens all end clear of the row", () => {
    // Tightening 1.8 → 0.8 moves three authored walks that the old clamp left
    // alone: pbe-aisle-walker (+1.20), sc-hzes-child (+1.38) and
    // sc-rts-passenger (+1.67). Every one of those rest points was inside the
    // parked row's 1.05 … 2.95 m band, so all three are moved OUT of a car,
    // and none of them is moved back onto the carriageway.
    const nearFlank = PARK_BAND_CENTER_M - PARKED_HALF_W_M;
    const newlyClamped = pedSpecs().filter(
      (s) => !s.ambient && s.travelM - s.roadToM > PED_REST_PAST_ROAD_M && s.travelM - s.roadToM <= 1.8,
    );
    expect(newlyClamped.map((s) => s.id).sort()).toEqual([
      "pbe-aisle-walker",
      "sc-hzes-child",
      "sc-rts-passenger",
    ]);
    for (const s of newlyClamped) {
      expect(s.travelM - s.roadToM + PED_SHOULDER_HALF_M, s.id).toBeGreaterThan(nearFlank);
      expect(
        Math.min(s.travelM, s.roadToM + PED_REST_PAST_ROAD_M) - s.roadToM,
        s.id,
      ).toBeCloseTo(PED_REST_PAST_ROAD_M, 6);
    }
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
