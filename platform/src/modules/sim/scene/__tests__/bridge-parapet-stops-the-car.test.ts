/**
 * THE PARAPET STOPS THE CAR — driven on real rapier, not inferred from props.
 *
 * Row sc-ac-ice:86eab7e9, round-3 verifier Y3/Y4: a `solverGroups` or a
 * `collisionGroups` on the wall trimesh makes it pass-through, and «whether the
 * wall stops a car still needs a drive». This is that drive, headless:
 *
 *   - the WORLD is what `WorldColliders` mounts for the LESSON (the recipe's
 *     collider set, which components/sim/__tests__/bridge-live-seam proves is
 *     the object ReadyScene hands `<DistrictWorld>` and DistrictWorld hands
 *     `<WorldColliders>`). Its returned element tree is interpreted into rapier
 *     bodies prop by prop: every prop the interpreter knows is applied, and any
 *     prop it does NOT know throws — a matcher that cannot read something says
 *     so instead of skipping it;
 *   - the CAR is the product's own chassis (`createHeadlessChassis` +
 *     `VehicleSim`, the node twin of VehicleRig's body, same tuning), put on
 *     the deck at district (-6, 300) facing east and driven at full throttle
 *     straight at the east parapet's inner face (x = 9.7).
 *
 * It must be stopped AT the face. And the control — the same drive with the
 * district-buildings body left out — must go through it, so the stop is the
 * wall's and not the kerb's, the ground's or the throttle's.
 */
import RAPIER from "@dimforge/rapier3d-compat";
import fs from "node:fs";
import path from "node:path";
import { isValidElement, type ReactElement } from "react";
import { CuboidCollider, RigidBody, TrimeshCollider } from "@react-three/rapier";
import { beforeAll, describe, expect, it } from "vitest";
import { compileScenario } from "../../lessons/scenario";
import { SC_AC_BRIDGE_ICE } from "../../lessons/scenario/templates-conditions2";
import { createHeadlessChassis, IDLE_INPUT, VehicleSim } from "../../vehicle";
import { READY_DRIVELINE } from "../../vehicle/driveline";
import * as T from "../../vehicle/tuning";
import { WorldColliders } from "../../world";
import type { WorldColliderSet } from "../../world";
import { buildLessonWorldCore } from "../lessonWorldRecipe";

const FACE_X = 9.7;
const START = { x: -6, y: 300 }; // district metres, on the deck [250, 340]

beforeAll(async () => {
  await RAPIER.init();
});

type Vec3 = [number, number, number];
const BODY_PROPS = new Set(["type", "colliders", "name", "userData", "children"]);
const CUBOID_PROPS = new Set(["args", "position", "friction", "restitution"]);
const TRIMESH_PROPS = new Set(["args", "friction", "restitution"]);

function flatten(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const c of node) flatten(c, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  // Fragments (and `cond && <el>` falsy values, already dropped) are walked.
  if (typeof node.type === "symbol") return flatten((node.props as { children?: unknown }).children, out);
  out.push(node);
  return out;
}

function unknownProps(el: ReactElement, allowed: Set<string>): string[] {
  return Object.keys(el.props as object).filter((k) => !allowed.has(k));
}

/**
 * Interpret WorldColliders' returned tree into rapier fixed bodies. `skip`
 * names bodies to leave out (the control). Throws on anything it cannot read.
 */
function mountColliders(world: RAPIER.World, colliders: WorldColliderSet, skip: ReadonlySet<string>): string[] {
  const mounted: string[] = [];
  for (const body of flatten(WorldColliders({ colliders }))) {
    if (body.type !== RigidBody) throw new Error(`unreadable top-level element ${String(body.type)}`);
    const bad = unknownProps(body, BODY_PROPS);
    if (bad.length > 0) throw new Error(`RigidBody prop(s) this drive cannot apply: ${bad.join(", ")}`);
    const bp = body.props as { type?: string; name?: string; children?: unknown };
    if (bp.type !== "fixed") throw new Error(`body ${bp.name} is ${bp.type}, not fixed`);
    if (skip.has(bp.name ?? "")) continue;
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const c of flatten(bp.children)) {
      if (c.type === CuboidCollider) {
        const bad2 = unknownProps(c, CUBOID_PROPS);
        if (bad2.length > 0) throw new Error(`CuboidCollider prop(s) unreadable: ${bad2.join(", ")}`);
        const p = c.props as { args: Vec3; position?: Vec3; friction?: number; restitution?: number };
        const d = RAPIER.ColliderDesc.cuboid(...p.args);
        if (p.position) d.setTranslation(...p.position);
        if (p.friction !== undefined) d.setFriction(p.friction);
        if (p.restitution !== undefined) d.setRestitution(p.restitution);
        world.createCollider(d, rb);
      } else if (c.type === TrimeshCollider) {
        const bad2 = unknownProps(c, TRIMESH_PROPS);
        if (bad2.length > 0) throw new Error(`TrimeshCollider prop(s) unreadable: ${bad2.join(", ")}`);
        const p = c.props as { args: [Float32Array, Uint32Array]; friction?: number; restitution?: number };
        const d = RAPIER.ColliderDesc.trimesh(p.args[0], p.args[1]);
        if (p.friction !== undefined) d.setFriction(p.friction);
        if (p.restitution !== undefined) d.setRestitution(p.restitution);
        world.createCollider(d, rb);
      } else {
        throw new Error(`unreadable collider element ${String(c.type)}`);
      }
    }
    mounted.push(bp.name ?? "?");
  }
  return mounted;
}

interface Drive {
  mounted: string[];
  maxNoseX: number;
  peakKmh: number;
  finalKmh: number;
}

function driveEast(colliders: WorldColliderSet, skip: ReadonlySet<string> = new Set()): Drive {
  const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
  world.timestep = T.FIXED_DT;
  const mounted = mountColliders(world, colliders, skip);
  const body = createHeadlessChassis(RAPIER, world);
  // The chassis spawns facing world +X (T.SPAWN.yawRad) — district east.
  body.setTranslation({ x: START.x, y: T.SPAWN.y, z: -START.y }, true);
  const sim = new VehicleSim(world, body);
  const drive = { ...READY_DRIVELINE };
  for (let i = 0; i < 30; i++) {
    sim.update(IDLE_INPUT, T.FIXED_DT, drive);
    world.step();
  }
  let maxNoseX = -Infinity;
  let peakKmh = 0;
  for (let i = 0; i < 6 * 60; i++) {
    sim.update({ ...IDLE_INPUT, throttle: 1 }, T.FIXED_DT, drive);
    world.step();
    const st = sim.debugState();
    maxNoseX = Math.max(maxNoseX, st.position.x + T.CHASSIS_HALF_EXTENTS.z);
    peakKmh = Math.max(peakKmh, sim.speedKmh);
  }
  const finalKmh = sim.speedKmh;
  sim.dispose();
  world.free();
  return { mounted, maxNoseX, peakKmh, finalKmh };
}

describe("the built parapet stops the product's chassis", () => {
  let colliders: WorldColliderSet;

  beforeAll(() => {
    const raw = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "public", "world", `${SC_AC_BRIDGE_ICE.map.districtId}.json`),
        "utf8",
      ),
    ) as unknown;
    colliders = buildLessonWorldCore(compileScenario(SC_AC_BRIDGE_ICE, 1), raw).geometry.colliders;
  });

  it("full throttle from the far lane: the car reaches the east face at speed and goes no further than solver overlap", () => {
    const d = driveEast(colliders);
    expect(d.mounted).toContain("district-buildings");
    expect(d.peakKmh, "the car never got going — the drive proves nothing").toBeGreaterThan(15);
    expect(d.maxNoseX, "the car never reached the parapet").toBeGreaterThan(FACE_X - 0.3);
    expect(d.maxNoseX, "the car went INTO the parapet").toBeLessThan(FACE_X + 0.25);
    expect(Math.abs(d.finalKmh)).toBeLessThan(3);
  });

  it("control: without the district-buildings body the same drive goes straight through the face", () => {
    const d = driveEast(colliders, new Set(["district-buildings"]));
    expect(d.mounted).not.toContain("district-buildings");
    expect(d.maxNoseX).toBeGreaterThan(FACE_X + 1);
  });

  it("interpreter self-test: a prop it cannot apply is refused, not skipped", () => {
    const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
    try {
      const el = WorldColliders({ colliders }) as ReactElement;
      const bodies = flatten(el);
      const wall = bodies.find((b) => (b.props as { name?: string }).name === "district-buildings")!;
      const mesh = flatten((wall.props as { children?: unknown }).children)[0]!;
      const doctored = { ...(mesh.props as object), solverGroups: 0x00020000 };
      expect(Object.keys(doctored).filter((k) => !TRIMESH_PROPS.has(k))).toEqual(["solverGroups"]);
    } finally {
      world.free();
    }
  });
});
