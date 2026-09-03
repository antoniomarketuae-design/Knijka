/**
 * THE CENTRAL ISLAND IS NOT A KERB — sc-roundabout-entry:4ab693eb, the half of
 * the row that was live again at HEAD.
 *
 * THE ROW: „The car ends up driving on the central island … while the coach
 * calmly says to leave the roundabout with the right indicator."
 * (`.audit-frames/sweep161/sc-roundabout-entry/pc-right/04-t141s.png`.)
 * The first clause is false and has been measured false repeatedly — the wall
 * STOPS the car (`builders/__tests__/island-wall-is-a-collider.test.ts`). The
 * second clause was repaired at d0ca244 by `advisor.ts`'s route hold, which is
 * armed by `lessons/engine.ts`'s crash pin, which is armed by a GRADED
 * terminating violation.
 *
 * AND THAT ARMING WAS BROKEN ON 2026-09-02. sc-merge-from-property:ab353b86
 * (rightly) stopped billing a 3 km/h kerb mount as a ПТП, by tagging the
 * district's drive-over body and reading the tag in `gradedContactMinKmh`. But
 * the roundabout island's 0.45 m planter wall shares the sidewalk accumulator
 * with the 12 cm pavement lip — for the concrete MATERIAL — so it inherited the
 * leniency of a surface that `ISLAND_WALL_RISE_M`'s own header exists to say it
 * is not. Below 10 km/h the island then billed nothing: no violation, no crash
 * pin, no route hold, no ending — the student sits against the wall being told
 * to indicate right, which is the frame.
 *
 * So the sidewalk trimesh is split by height (`DRIVE_OVER_MAX_Y`) and the wall
 * half is mounted as its own untagged body. A kerb mount stays a kerb mount.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { RigidBody } from "@react-three/rapier";

import {
  analyzeNetwork,
  analyzeRoundabouts,
  assertDistrict,
  buildWorldGeometry,
  DRIVE_OVER_MAX_Y,
  ISLAND_KERB_BAND_M,
  ISLAND_WALL_TOP_Y,
  isDistrictSurfaceUserData,
  SIDEWALK_TOP_Y,
  splitDriveOverSurface,
  WorldColliders,
  type ColliderMesh,
  type District,
  type WorldColliderSet,
} from "@/modules/sim/world";
import { COLLISION_MIN_KMH, gradedContactMinKmh } from "../VehicleRig";

const WORLD_DIR = path.join(process.cwd(), "public/world");

function districtOf(id: string): District {
  return assertDistrict(JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf8")));
}

function collidersOf(id: string): WorldColliderSet {
  return buildWorldGeometry(districtOf(id), { seed: 7 }).colliders;
}

/** Discovered, not listed — a new ring district is covered by this too. */
function ringDistrictIds(): string[] {
  const out: string[] = [];
  for (const file of fs.readdirSync(WORLD_DIR)) {
    if (!file.endsWith(".json")) continue;
    const id = file.replace(/\.json$/, "");
    if ((districtOf(id).roundabouts ?? []).length > 0) out.push(id);
  }
  return out;
}

const RING_IDS = ringDistrictIds();
/** A district with no ring at all — sc-merge-from-property's own map, i.e. the
 *  drive ab353b86 was filed from. Nothing about it may change. */
const NO_RING_ID = "mg-property-v1";

/** Highest vertex of triangle `t` of `mesh`. */
function triangleTopY(mesh: ColliderMesh, t: number): number {
  return Math.max(
    mesh.positions[mesh.indices[t]! * 3 + 1]!,
    mesh.positions[mesh.indices[t + 1]! * 3 + 1]!,
    mesh.positions[mesh.indices[t + 2]! * 3 + 1]!,
  );
}

describe("the sidewalk collider is split where the concrete stops being mountable", () => {
  it("cuts above every pavement in the world and far below the island wall", () => {
    // Both bounds are derived heights, so retuning either re-asks the question.
    expect(DRIVE_OVER_MAX_Y).toBeGreaterThan(SIDEWALK_TOP_Y);
    expect(DRIVE_OVER_MAX_Y).toBeLessThan(ISLAND_WALL_TOP_Y);
  });

  it("finds the ring maps at all", () => {
    expect(RING_IDS.length).toBeGreaterThanOrEqual(5);
    expect(RING_IDS).toContain("rb-mini-v1");
  });

  it(`${NO_RING_ID}: a district with no island keeps ONE surface, unchanged`, () => {
    const sidewalks = collidersOf(NO_RING_ID).sidewalks;
    const { driveOver, walls } = splitDriveOverSurface(sidewalks);
    expect(walls.indices.length).toBe(0);
    // Byte-identical triangle list: no kerb anywhere becomes a graded wall.
    expect(Array.from(driveOver.indices)).toEqual(Array.from(sidewalks.indices));
  });

  for (const id of RING_IDS) {
    it(`${id}: the island wall goes to the wall half and the pavement stays`, () => {
      const district = districtOf(id);
      const sidewalks = buildWorldGeometry(district, { seed: 7 }).colliders.sidewalks;
      const { driveOver, walls } = splitDriveOverSurface(sidewalks);

      // Nothing is duplicated into physics and nothing is dropped out of it.
      expect(driveOver.indices.length + walls.indices.length).toBe(sidewalks.indices.length);

      // (1) the drive-over half is pavement and nothing else.
      let tallLeftBehind = 0;
      for (let t = 0; t + 2 < driveOver.indices.length; t += 3) {
        if (triangleTopY(driveOver, t) > DRIVE_OVER_MAX_Y) tallLeftBehind++;
      }
      expect(tallLeftBehind, `${id}: raised concrete left in the drive-over body`).toBe(0);

      const rings = analyzeRoundabouts(district, analyzeNetwork(district)).filter(
        (r) => r.islandRadiusM !== null,
      );
      if (rings.length === 0) {
        // A REFUSED registration draws no island (d2-v1: бул. „Пейо К. Яворов"
        // runs through the interior), so there is no wall to split out and this
        // district must keep exactly the surface it had.
        expect(walls.indices.length, `${id}: a wall with no island`).toBe(0);
        return;
      }
      expect(walls.indices.length).toBeGreaterThan(0);

      // (2) every wall vertex stands on an island's own kerb band, and the wall
      //     reaches its documented top. A stray tall triangle anywhere else in
      //     the world would be a kerb this split made convicting.
      const onSomeIslandBand = (v: number): boolean =>
        rings.some((ring) => {
          const rIsland = ring.islandRadiusM!;
          const r = Math.hypot(
            walls.positions[v * 3]! - ring.centre[0],
            -walls.positions[v * 3 + 2]! - ring.centre[1],
          );
          return r <= rIsland + 1e-3 && r >= rIsland - ISLAND_KERB_BAND_M - 1e-3;
        });
      let strayVerts = 0;
      let reachesWallTop = 0;
      for (let t = 0; t + 2 < walls.indices.length; t += 3) {
        for (let k = 0; k < 3; k++) {
          if (!onSomeIslandBand(walls.indices[t + k]!)) strayVerts++;
        }
        if (triangleTopY(walls, t) >= ISLAND_WALL_TOP_Y - 1e-3) reachesWallTop++;
      }
      expect(strayVerts, `${id}: wall triangles off every island kerb band`).toBe(0);
      expect(reachesWallTop, `${id}: no wall triangle reaches the planter top`).toBeGreaterThan(0);
    });
  }
});

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

describe("a car that strikes the central island is graded like the wall it is", () => {
  it("rb-mini-v1 mounts a THIRD body for the island wall, and it is untagged", () => {
    const bodies = rigidBodies(WorldColliders({ colliders: collidersOf("rb-mini-v1") }));
    expect(bodies.map((b) => (b.props as { name?: string }).name)).toEqual([
      "district-surface",
      "district-buildings",
      "district-kerb-walls",
    ]);
    const wallBody = bodies[2]!.props as { userData?: unknown };
    expect(isDistrictSurfaceUserData(wallBody.userData)).toBe(false);

    // THE WIRE: an untagged body keeps the LESSON's own threshold, and
    // `compileScenario` writes 0 for all 150 templates — so the 5 km/h roll
    // into the island is a graded ПТП again, and that is what arms the crash
    // pin that arms `advisor.ts`'s route hold and ends the exercise.
    expect(gradedContactMinKmh(wallBody.userData, 0)).toBe(0);
    expect(5 >= gradedContactMinKmh(wallBody.userData, 0)).toBe(true);
  });

  it("…while the pavement in the SAME district is still a kerb mount, not a ПТП", () => {
    const bodies = rigidBodies(WorldColliders({ colliders: collidersOf("rb-mini-v1") }));
    const surface = bodies[0]!.props as { userData?: unknown };
    expect(isDistrictSurfaceUserData(surface.userData)).toBe(true);
    expect(gradedContactMinKmh(surface.userData, 0)).toBe(COLLISION_MIN_KMH);
    expect(3 >= gradedContactMinKmh(surface.userData, 0)).toBe(false);
  });

  it(`${NO_RING_ID}: no ring, no third body — ab353b86's own drive is untouched`, () => {
    const bodies = rigidBodies(WorldColliders({ colliders: collidersOf(NO_RING_ID) }));
    expect(bodies.map((b) => (b.props as { name?: string }).name)).not.toContain(
      "district-kerb-walls",
    );
  });
});
