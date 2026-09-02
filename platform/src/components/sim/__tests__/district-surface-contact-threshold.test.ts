/**
 * A KERB IS NOT A ПТП — sc-merge-from-property:ab353b86, 2026-09-02.
 *
 * THE ROW: „the correct drive collides and fails — 10 наказателни точки, one
 * опасна грешка, НЕИЗДЪРЖАН". Four waves narrowed it to a mechanism nobody
 * could reach from the template: `compileScenario` writes `collisionMinKmh: 0`
 * for all 150 scenario lessons, `VehicleRig.onCollisionEnter` gated on
 * `impactKmh >= collisionMinKmh`, and `>= 0` is ALWAYS true — so every rapier
 * contact on the chassis became a terminating ОПАСНА ГРЕШКА and the
 * sub-threshold branch beside it („a kerb scuff or a bumper nudge … NOT
 * graded") was unreachable for the whole catalogue.
 *
 * PHOTOGRAPHED ON A *RIGHT* DRIVE, i.e. on the drive the lesson tells the
 * student to copy: `.audit-frames/w22/frames/sc-merge-from-property__mobile-
 * right/04-t101s.png` bills «Удар в неподвижно препятствие −10 изпитни т.» with
 * the car reading **0 км/ч** and standing still since 04-t084s.
 *
 * WHY IT IS DECIDED BY THE BODY AND NOT BY THE NUMBER. The acceptance test is
 * „a 2 km/h bay touch must still convict, a kerb mount must not", which is a
 * distinction between bodies; one scalar per lesson cannot carry it, and
 * raising it would stop grading the 5 km/h roll into the тротоар walker this
 * very lesson is about. So `WorldColliders` now mounts the district's
 * DRIVE-OVER surface as its own tagged body and the BUILDING trimesh as a
 * separate untagged one, and `gradedContactMinKmh` reads the tag.
 */

import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { RigidBody } from "@react-three/rapier";
import {
  DISTRICT_SURFACE_USER_DATA,
  isDistrictSurfaceUserData,
  WorldColliders,
} from "@/modules/sim/world";
import { COLLISION_MIN_KMH, gradedContactMinKmh } from "../VehicleRig";
import { compileScenario, scenarioById, type ScenarioLevel } from "@/modules/sim/lessons/scenario";

const NPC_VEHICLE_TAG = { npcCollider: true, kind: "vehicle", npcId: 3000 } as const;

function colliderSet() {
  return {
    ground: { halfExtents: [500, 1, 500] as [number, number, number], position: [0, -1, 0] as [number, number, number] },
    sidewalks: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), indices: new Uint32Array([0, 1, 2]) },
    buildings: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 5, 0]), indices: new Uint32Array([0, 1, 2]) },
  };
}

/** Every `<RigidBody>` in the returned tree, in document order. */
function rigidBodies(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) rigidBodies(child, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  if (node.type === RigidBody) out.push(node);
  const kids = (node.props as { children?: unknown }).children;
  if (kids !== undefined) rigidBodies(kids, out);
  return out;
}

describe("the district's drive-over surface is a body of its own", () => {
  it("mounts the ground+kerb as a TAGGED body and the facade as an untagged one", () => {
    const bodies = rigidBodies(WorldColliders({ colliders: colliderSet() }));
    expect(bodies).toHaveLength(2);

    const [surface, buildings] = bodies as [ReactElement, ReactElement];
    const surfaceProps = surface.props as { name?: string; userData?: unknown };
    const buildingProps = buildings.props as { name?: string; userData?: unknown };

    expect(surfaceProps.name).toBe("district-surface");
    expect(isDistrictSurfaceUserData(surfaceProps.userData)).toBe(true);

    // THE HALF THAT MUST NOT MOVE: a facade is never a scuff. If this body ever
    // acquires the tag, driving into a building at 4 km/h stops being graded.
    expect(buildingProps.name).toBe("district-buildings");
    expect(isDistrictSurfaceUserData(buildingProps.userData)).toBe(false);
  });

  it("omits the building body entirely when the district has no walls", () => {
    const set = colliderSet();
    set.buildings = { positions: new Float32Array(), indices: new Uint32Array() };
    const bodies = rigidBodies(WorldColliders({ colliders: set }));
    expect(bodies).toHaveLength(1);
    expect((bodies[0]!.props as { name?: string }).name).toBe("district-surface");
  });

  it("the tag reader refuses everything that is not the surface tag", () => {
    expect(isDistrictSurfaceUserData(DISTRICT_SURFACE_USER_DATA)).toBe(true);
    for (const other of [undefined, null, 0, "districtSurface", {}, NPC_VEHICLE_TAG, { districtSurface: false }]) {
      expect(isDistrictSurfaceUserData(other)).toBe(false);
    }
  });
});

describe("gradedContactMinKmh — which threshold a contact is judged at", () => {
  it("a kerb mount in a scenario lesson is judged at the street nudge tolerance", () => {
    expect(gradedContactMinKmh(DISTRICT_SURFACE_USER_DATA, 0)).toBe(COLLISION_MIN_KMH);
  });

  it("…so the w22 frame's standing-still contact is no longer a ПТП", () => {
    // 0 км/ч, gear R, still since 04-t084s: the impact speed rapier reports for
    // a body that has not moved is ~0, and 0 >= 0 used to convict.
    const min = gradedContactMinKmh(DISTRICT_SURFACE_USER_DATA, 0);
    expect(0 >= min).toBe(false);
    expect(3 >= min).toBe(false);
    // …and a car that leaves the road at speed is still billed.
    expect(35 >= min).toBe(true);
  });

  it("a 2 km/h bay touch on a parked car STILL convicts", () => {
    const min = gradedContactMinKmh(NPC_VEHICLE_TAG, 0);
    expect(min).toBe(0);
    expect(2 >= min).toBe(true);
  });

  it("an untagged authored obstacle — cone, pole, wall, pump — still convicts", () => {
    // ScenarioObstacles mounts these with no userData at all.
    expect(gradedContactMinKmh(undefined, 0)).toBe(0);
  });

  it("never LOWERS a lesson that already asked for more than the street default", () => {
    expect(gradedContactMinKmh(DISTRICT_SURFACE_USER_DATA, 15)).toBe(15);
    expect(gradedContactMinKmh(NPC_VEHICLE_TAG, 15)).toBe(15);
  });
});

describe("the compiled lesson is untouched", () => {
  it("sc-merge-from-property still compiles at collisionMinKmh 0", () => {
    const spec = scenarioById("sc-merge-from-property");
    expect(spec).toBeDefined();
    // The parking contract (S0, doc 76 §0) is not what changed; the BODY
    // classification is. If this ever becomes non-zero, a bay touch stopped
    // being the mistake the parking drills teach.
    for (const level of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
      expect(compileScenario(spec!, level).collisionMinKmh).toBe(0);
    }
  });
});
