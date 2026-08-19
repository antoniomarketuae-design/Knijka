/**
 * The DIMENSIONS gate. Every number the contact test runs on has to be
 * traceable to something the product already ships — the rapier colliders and
 * the fleet rigs — or the grader is measuring a car nobody drives. This file is
 * where that traceability is enforced, so a rig resize or a collider change
 * fails HERE rather than surfacing as a wrong verdict in a student's debrief.
 */

import { describe, expect, it } from "vitest";
import {
  ANIMAL_DIMENSIONS,
  BICYCLE_DIMENSIONS,
  CHILD_CYCLIST_SCALE,
  EMERGENCY_DIMENSIONS,
  TRAIN_DIMENSIONS,
  TRAIN_LENGTH_M,
  TRAM_DIMENSIONS,
  TRUCK_DIMENSIONS,
} from "../../traffic/vehicleFleet";
import {
  VEHICLE_PROFILE_LENGTH_M,
  VEHICLE_PROFILE_WIDTH_M,
  vehicleHalfLengthM,
  vehicleHalfWidthM,
  type VehicleProfile,
} from "../../traffic/types";
import { CHASSIS_HALF_EXTENTS } from "../../vehicle/tuning";
import {
  actorObb,
  PEDESTRIAN_BODY_RADIUS_M,
  playerObb,
  PLAYER_HALF_LENGTH_M,
  PLAYER_HALF_WIDTH_M,
} from "../bodies";
import * as bodiesBarrel from "../bodies";

describe("the player box IS the rapier chassis collider", () => {
  it("takes both half-extents from vehicle/tuning, not a second opinion", () => {
    expect(PLAYER_HALF_WIDTH_M).toBe(CHASSIS_HALF_EXTENTS.x); // 0.85 → 1.70 m
    expect(PLAYER_HALF_LENGTH_M).toBe(CHASSIS_HALF_EXTENTS.z); // 2.02 → 4.04 m
    const p = playerObb(12, -3, 47);
    expect(p).toEqual({
      x: 12,
      y: -3,
      headingDeg: 47,
      halfLengthM: CHASSIS_HALF_EXTENTS.z,
      halfWidthM: CHASSIS_HALF_EXTENTS.x,
    });
  });
});

describe("the NPC car box agrees with the body that actually collides", () => {
  it("the pedestrian disc IS the capsule radius NpcColliders mounts", () => {
    expect(PEDESTRIAN_BODY_RADIUS_M).toBe(0.3);
  });

  /**
   * THE STRUCTURAL HALF OF „ONE FACT, NOT TWO", and the only assertion in this
   * file that guards a defect rather than a number.
   *
   * This module used to export a SECOND body builder, `npcShellObb`, plus
   * NPC_VEHICLE_SHELL_HALF_WIDTH_M / _LENGTH_M (0.92 × 2.10), for the question
   * „how big is the collider that just fired?". Twice it drifted out of step
   * with the collider — round 3 in the direction that made a cyclist
   * unnameable, round 8 in the direction that made a truck, a tram and a train
   * unnameable — and each time the rule „the physics body and the grading body
   * must be one fact" was re-asserted in a comment and then broken again by a
   * resize somewhere else.
   *
   * A comment cannot hold that. This can: there must be exactly ONE function in
   * this module that answers „how big is a traffic body", and it must take the
   * profile. Adding a second one fails here, by name, before it can go stale.
   */
  it("exports ONE body builder for traffic bodies — a second one is the defect", () => {
    const bodyBuilders = Object.keys(bodiesBarrel).filter(
      (k) => k.endsWith("Obb") && k !== "playerObb",
    );
    expect(bodyBuilders).toEqual(["actorObb"]);
    // …and no retired shell constant may come back alongside it.
    expect(Object.keys(bodiesBarrel).filter((k) => k.includes("SHELL"))).toEqual([]);
  });

  it("the measured GLB fleet brackets the car profile (1.78–1.83 m across the kit)", () => {
    // Measured off the shipped kit's own POSITION accessors, body node, wheels
    // excluded: vela_h3 1.78, arden_x 1.82, corva_s 1.83, kargo_v 1.98.
    expect(VEHICLE_PROFILE_WIDTH_M.car).toBeGreaterThanOrEqual(1.78);
    expect(VEHICLE_PROFILE_WIDTH_M.car).toBeLessThanOrEqual(1.9);
  });
});

describe("every profile's width comes off its own rig", () => {
  it("matches vehicleFleet's authored dimensions", () => {
    expect(VEHICLE_PROFILE_WIDTH_M.truck).toBe(TRUCK_DIMENSIONS.widthM);
    expect(VEHICLE_PROFILE_WIDTH_M.emergency).toBe(EMERGENCY_DIMENSIONS.widthM);
    expect(VEHICLE_PROFILE_WIDTH_M.tram).toBe(TRAM_DIMENSIONS.widthM);
    expect(VEHICLE_PROFILE_WIDTH_M.train).toBe(TRAIN_DIMENSIONS.widthM);
    expect(VEHICLE_PROFILE_WIDTH_M.cyclist).toBeCloseTo(BICYCLE_DIMENSIONS.halfWidthM * 2, 6);
    expect(VEHICLE_PROFILE_WIDTH_M.childCyclist).toBeCloseTo(
      BICYCLE_DIMENSIONS.halfWidthM * 2 * CHILD_CYCLIST_SCALE,
      3,
    );
    expect(VEHICLE_PROFILE_WIDTH_M.animal).toBeCloseTo(ANIMAL_DIMENSIONS.halfWidthM * 2, 6);
  });

  it("and the length table still matches the rigs it claims to mirror", () => {
    expect(VEHICLE_PROFILE_LENGTH_M.truck).toBe(TRUCK_DIMENSIONS.lengthM);
    expect(VEHICLE_PROFILE_LENGTH_M.emergency).toBe(EMERGENCY_DIMENSIONS.lengthM);
    expect(VEHICLE_PROFILE_LENGTH_M.tram).toBe(TRAM_DIMENSIONS.lengthM);
    expect(VEHICLE_PROFILE_LENGTH_M.train).toBeCloseTo(TRAIN_LENGTH_M, 6);
  });

  it("covers every profile — a new one cannot ship without a width", () => {
    for (const p of Object.keys(VEHICLE_PROFILE_LENGTH_M) as VehicleProfile[]) {
      expect(VEHICLE_PROFILE_WIDTH_M[p], p).toBeGreaterThan(0);
      // Every body in the fleet is longer than it is wide — the single fact the
      // 3.0 m circle could not represent.
      expect(VEHICLE_PROFILE_LENGTH_M[p], p).toBeGreaterThan(VEHICLE_PROFILE_WIDTH_M[p]);
    }
  });
});

describe("actorObb — per-actor dimensions, not one global constant", () => {
  const pose = { x: 5, y: 7, dirX: 1, dirY: 0 }; // heading east

  it("a bus-sized body is graded as a bus, not as a car", () => {
    const truck = actorObb(pose, "truck");
    const car = actorObb(pose, "car");
    expect(truck.halfLengthM).toBe(TRUCK_DIMENSIONS.lengthM / 2);
    expect(truck.halfWidthM).toBe(TRUCK_DIMENSIONS.widthM / 2);
    expect(truck.halfLengthM).toBeGreaterThan(car.halfLengthM);
    expect(truck.halfWidthM).toBeGreaterThan(car.halfWidthM);
  });

  it("an absent profile is a car (every pre-profile spec, unchanged)", () => {
    expect(actorObb(pose)).toEqual(actorObb(pose, "car"));
    expect(vehicleHalfLengthM(undefined)).toBe(VEHICLE_PROFILE_LENGTH_M.car / 2);
    expect(vehicleHalfWidthM(undefined)).toBe(VEHICLE_PROFILE_WIDTH_M.car / 2);
  });

  it("takes its heading from the published travel direction", () => {
    expect(actorObb({ x: 0, y: 0, dirX: 1, dirY: 0 }).headingDeg).toBeCloseTo(90, 12);
    expect(actorObb({ x: 0, y: 0, dirX: 0, dirY: 1 }).headingDeg).toBeCloseTo(0, 12);
  });

  it("a 14 m tram is 14 m of obstacle, not 4.1", () => {
    expect(actorObb(pose, "tram").halfLengthM).toBe(7);
    expect(actorObb(pose, "train").halfLengthM).toBeCloseTo(TRAIN_LENGTH_M / 2, 6);
  });
});
