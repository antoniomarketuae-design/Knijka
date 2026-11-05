/**
 * THE CARRIAGEWAY FACT ON THE COLLIDER — lane staticcardcopy (integrator ruling
 * C1, STEP 2 (iii)): `ScenarioObstacles` puts `STATIC_ON_CARRIAGEWAY_USER_DATA`
 * on the RigidBody of exactly the props and walls the recipe stamped
 * `onCarriageway`, and nowhere else — never on an unstamped wall or prop, never
 * on the fuel station's columns or pumps, never on a vehicle.
 *
 * WHY A RENDER AND NOT A HARNESS DRIVE. The rapier harness
 * (`lessons/scenario/__tests__/rapierContactDrive.ts`) mounts held walls and
 * props from the SPEC numbers, not from this component's element tree, so a
 * harness-green drive cannot see this file drop the tag. Here the component's
 * own tree is rendered — the real `ScenarioObstacles`, `PropInstances`,
 * `ObstacleWall` and `ObstacleFuelStation` — with `@react-three/rapier`'s two
 * body components replaced by recorders (they need a physics world) and drei's
 * GLB loader by an empty scene (it needs the network). Every RigidBody the
 * component mounts is recorded with the props it was handed.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Group } from "three";
import { describe, expect, it, vi } from "vitest";

const bodies: Array<Record<string, unknown>> = [];

vi.mock("@react-three/rapier", () => ({
  RigidBody: (props: Record<string, unknown>) => {
    bodies.push(props);
    return (props.children as never) ?? null;
  },
  CuboidCollider: () => null,
}));

vi.mock("@react-three/drei", () => {
  const useGLTF = Object.assign(() => ({ scene: new Group() }), { preload: () => {} });
  return { useGLTF };
});

import { ScenarioObstacles, STATIC_ON_CARRIAGEWAY_USER_DATA } from "../ScenarioObstacles";
import { STATIC_ON_CARRIAGEWAY_USER_DATA as SPEC_TAG } from "@/modules/sim/scene/obstacleSpec";
import type { ScenarioObstacleSpec } from "@/modules/sim/scene/obstacleSpec";

function mountedBodies(obstacles: ScenarioObstacleSpec[]): Array<Record<string, unknown>> {
  bodies.length = 0;
  // React DOM's server renderer warns about the three.js intrinsic tags
  // (<mesh>, <primitive>…); they are irrelevant here and only noise.
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    renderToStaticMarkup(createElement(ScenarioObstacles, { obstacles }));
  } finally {
    err.mockRestore();
  }
  return [...bodies];
}

const STAMPED_WALL: ScenarioObstacleSpec = { kind: "wall", x: 4.06, y: 190, headingDeg: 0, lengthM: 2.4, thicknessM: 1.6, onCarriageway: true };
const PLAIN_WALL: ScenarioObstacleSpec = { kind: "wall", x: 11, y: 45, headingDeg: 0, lengthM: 5 };
const STAMPED_CONE: ScenarioObstacleSpec = { kind: "prop", prop: "cone", x: 7.6, y: 216, headingDeg: 0, onCarriageway: true };
const PLAIN_CONE: ScenarioObstacleSpec = { kind: "prop", prop: "cone", x: 30, y: 30, headingDeg: 0 };
const FUEL: ScenarioObstacleSpec = {
  kind: "fuelStation",
  x: 58,
  y: 0,
  headingDeg: 0,
  lengthM: 28,
  widthM: 26,
  clearanceM: 4.6,
  islandOffsetsM: [-4, 4],
  islandHalfLengthM: 5,
};

describe("ScenarioObstacles mounts the carriageway tag on exactly the stamped props and walls", () => {
  it("the component re-exports the very object the sim module owns (one tag, never re-typed)", () => {
    expect(STATIC_ON_CARRIAGEWAY_USER_DATA).toBe(SPEC_TAG);
    expect(Object.isFrozen(STATIC_ON_CARRIAGEWAY_USER_DATA)).toBe(true);
    // It is neither an NPC tag nor the drive-over surface.
    expect(STATIC_ON_CARRIAGEWAY_USER_DATA).not.toHaveProperty("npcCollider");
    expect(STATIC_ON_CARRIAGEWAY_USER_DATA).not.toHaveProperty("districtSurface");
  });

  it("a stamped wall, a stamped cone, a plain wall, a plain cone and a fuel station: two tagged bodies", () => {
    const all = mountedBodies([STAMPED_WALL, PLAIN_WALL, STAMPED_CONE, PLAIN_CONE, FUEL]);
    // Positive control: every body the component mounts is recorded — two
    // walls, two cones, four columns and four pumps.
    expect(all.length, "RigidBodies mounted").toBe(12);
    const tagged = all.filter((b) => "userData" in b).map((b) => ({ position: b.position, userData: b.userData }));
    expect(tagged, "the RigidBodies carrying a userData — exactly the stamped wall and the stamped cone").toEqual([
      { position: [7.6, 0, -216], userData: STATIC_ON_CARRIAGEWAY_USER_DATA },
      { position: [4.06, 0, -190], userData: STATIC_ON_CARRIAGEWAY_USER_DATA },
    ]);
    for (const t of tagged) expect(t.userData).toBe(STATIC_ON_CARRIAGEWAY_USER_DATA);
  });

  it("with nothing stamped, no RigidBody carries a userData key at all — the base tree, byte for byte", () => {
    const all = mountedBodies([PLAIN_WALL, PLAIN_CONE, FUEL]);
    expect(all.length).toBe(10);
    expect(all.filter((b) => "userData" in b)).toEqual([]);
  });
});
