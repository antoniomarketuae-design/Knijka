/**
 * conflictNearFor — the give-way predicate behind every Б1/Б2 line
 * (`worldRuntime.fireLine` → `prioritySituation{give-way, violated:true}`).
 *
 * doc 87 B5. This gate exists in TWO directions on purpose. The founder's
 * complaint is a wrongful conviction — „I let everybody pass and there where no
 * cars" — but a detector that stops firing is the same defect mirrored, so
 * every acquittal below is paired with the conviction it must not swallow.
 *
 * Frame for every case: the junction node is the origin, the player approaches
 * northbound (approach bearing 0), the carriageway is the two-lane 8.125 m
 * half-width every give-way district is built from.
 */
import { describe, expect, it } from "vitest";
import { conflictNearFor } from "./system";

const veh = (x: number, y: number, dirX: number, dirY: number, speedMps = 8) => ({
  x,
  y,
  dirX,
  dirY,
  speedMps,
});

// Player approaches the junction at origin heading north (approach bearing 0).
describe("conflictNearFor", () => {
  it("flags a crossing vehicle near the junction", () => {
    expect(conflictNearFor([veh(5, 5, 1, 0)], 0, 0, 16, 0)).toBe(true); // car crossing east
  });

  it("ignores same-direction traffic", () => {
    expect(conflictNearFor([veh(0, 6, 0, 1)], 0, 0, 16, 0)).toBe(false); // car also heading north
  });

  it("ignores vehicles outside the radius", () => {
    expect(conflictNearFor([veh(50, 50, 1, 0)], 0, 0, 16, 0)).toBe(false);
  });

  it("ignores stopped / parked vehicles", () => {
    expect(conflictNearFor([veh(5, 5, 1, 0, 0)], 0, 0, 16, 0)).toBe(false);
  });

  // --- B5: which ROAD is it on? -------------------------------------------
  describe("oncoming traffic on the player's OWN road is not a give-way conflict", () => {
    it("acquits a car heading south down the opposite lane of my own road", () => {
      // THE FOUNDER'S CASE. This assertion read `true` until 2026-08-10 and
      // that is precisely the bug: a Б1/Б2 line orders you to yield to the
      // PRIORITY road, and this car is on YOURS. Turning left across it is
      // graded by oncomingApproachFor, on its own channel, in seconds of gap.
      expect(conflictNearFor([veh(0, 6, 0, -1)], 0, 0, 16, 0)).toBe(false);
      expect(conflictNearFor([veh(-4.06, 12, 0, -1)], 0, 0, 26, 0)).toBe(false);
    });

    it("STILL convicts an anti-parallel car OUTSIDE my carriageway (a skewed priority arm)", () => {
      // Same 180° bearing, but 12 m off the axis — that is not my road, so the
      // own-road exclusion must not reach it. This is the acquittal-creep guard.
      expect(conflictNearFor([veh(12, 6, 0, -1)], 0, 0, 26, 0)).toBe(true);
    });

    it("does not let the corridor swallow a car merely CROSSING the axis", () => {
      // Lateral offset 0 — dead on the approach axis — but travelling east at
      // 90°, outside the oncoming band. The exclusion is bearing-gated, so this
      // is the car you must wait for and it convicts.
      expect(conflictNearFor([veh(0, 5, 1, 0)], 0, 0, 16, 0)).toBe(true);
    });
  });

  // --- B5: has it already CLEARED? ----------------------------------------
  describe("a vehicle that has already cleared the conflict point", () => {
    it("acquits the van that just finished crossing in front of me", () => {
      // „I let everybody pass": eastbound van, tail off the carriageway
      // (centre 12 m out > CONFLICT_CLEARED_M 10.175), still well inside the
      // 26 m runtime radius. Convicted before this change for another ~14 m.
      expect(conflictNearFor([veh(12, -4.06, 1, 0)], 0, 0, 26, 0)).toBe(false);
    });

    it("STILL convicts the same van while it is in the mouth", () => {
      // Departing by the dot product already (centre 4.06 m out) but dead in
      // front of the player — the distance floor is what keeps this a conflict.
      expect(conflictNearFor([veh(4.06, 4.06, 1, 0)], 0, 0, 26, 0)).toBe(true);
      // …and one metre short of the clearance line, tail still on the asphalt.
      expect(conflictNearFor([veh(9.2, -4.06, 1, 0)], 0, 0, 26, 0)).toBe(true);
    });

    it("STILL convicts a priority car APPROACHING from the right at the same distance", () => {
      // Mirror of the acquittal above: same 12 m, opposite heading. If this
      // ever flips, the detector has stopped firing.
      expect(conflictNearFor([veh(12, -4.06, -1, 0)], 0, 0, 26, 0)).toBe(true);
    });

    it("STILL convicts a priority car approaching from the left", () => {
      expect(conflictNearFor([veh(-14, 4.06, 1, 0)], 0, 0, 26, 0)).toBe(true);
    });
  });

  it("is bearing-frame correct: the same geometry rotated 90° grades the same", () => {
    // Player approaching eastbound (bearing 90) at a node: a car crossing
    // north-to-south in front of him convicts; his own oncoming (westbound)
    // traffic does not. Guards the rx/ry rotation, not the numbers.
    expect(conflictNearFor([veh(5, 0, 0, -1)], 0, 0, 16, 90)).toBe(true);
    expect(conflictNearFor([veh(6, 0, -1, 0)], 0, 0, 16, 90)).toBe(false);
  });
});
