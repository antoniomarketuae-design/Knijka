/**
 * THE CHASSIS CONTACT PATH, DRIVEN ON RAPIER AT A DISPLAY'S CADENCE — the
 * harness of sc-hz-brake-dont-swerve:a7d0dd29 (lane hzcontact).
 *
 * WHY THIS HARNESS EXISTS. Every other in-process harness of the live chain
 * (liveChainReplay, the scene's call executed in live-grade-call.execution)
 * replays a TAPE: there is no rapier in it, so a contact between the car and a
 * wall reaches it only when a witness injects one. The defect this lane repairs
 * lives exactly in the part they leave out — how a contact rapier found inside
 * a frame of several physics steps reaches the grade. So this harness runs that
 * part for real, and nothing else is stood in for:
 *
 *  · RAPIER — the copy the browser runs (@react-three/rapier's own nested
 *    @dimforge/rapier3d-compat, imported by path below), a world with the
 *    LESSON's colliders: `WorldColliders`' element tree interpreted prop by prop
 *    (the district surface keeps its userData tag — the threshold reads it),
 *    and the lesson's hittable scenario walls and props built with the numbers
 *    `ScenarioObstacles` mounts them with (cuboid half-extents, centre height,
 *    friction, restitution, yaw). Parked VEHICLE obstacles are NOT mounted:
 *    their colliders are measured off a GLB at load time and no table states
 *    them (ScenarioObstacles `ObstacleColliderFootprint`).
 *  · THE CAR — the product's chassis (`createHeadlessChassis`, VehicleRig's
 *    twin) and `VehicleSim`, stepped by a model of @react-three/rapier 2.2.0's
 *    stepper line for line: `accumulator += clamp(dt, 0, 0.5)`, one
 *    `world.step(eventQueue)` per whole 1/60 s with the before-step and
 *    after-step callbacks around it, the queue built `new EventQueue(false)`
 *    (r3r's own — NOT auto-drained, so a frame's events pile up), and then ONE
 *    `drainCollisionEvents` per frame that, for a STARTED pair, calls the
 *    body's `onCollisionEnter` only from inside `world.contactPair(…)`, once
 *    per manifold rapier still holds AT THE DRAIN — r3r's dist, read.
 *  · THE RIG — VehicleRig's after-step callback is the product's
 *    `recordPhysicsStep`. Its `onCollisionEnter`, IF VehicleRig.tsx still puts
 *    one on the chassis `<RigidBody>`, is CUT OUT OF THE SOURCE and executed
 *    (that is base). If the rig judges contacts from the step record instead
 *    (the repair), its exported `hearChassisContact` is what the grid's hook
 *    reaches. Either way the product decides; the harness only wires.
 *  · THE GRADE — LessonScene's own graded statements, cut out of the scene and
 *    executed (sceneGradeCut.ts): the frame's `const steps = …` and graded
 *    call after the stepper, and — since lane npcstep — the function the
 *    scene puts in `stepLoopGradeRef`, run before every `world.step` FIRST in
 *    the rig's before-step, before the step's input is read (round 2). On the lesson's live world (`buildLiveWorld`), every tick it
 *    hands `onTick` folded by the real `applyTick` into the real session,
 *    closed by `buildLessonResult`: the SHEET.
 *  · THE NPC SHELLS (`npcShells`) — NpcColliders' pool mounted on this rapier
 *    world with the component's numbers, and moved by the PRODUCT's own pool
 *    (`NpcShellPool`, reached the way the scene reaches it: the grid's
 *    `shells` hook → `npcShellsRef`) or by a model of the frame callback
 *    that moved it through 8cb0707 (`frameShellModel`).
 *  · THE SCENE'S END OF THE EAR — LessonScene's own `handleCollision`, cut out
 *    of the scene and executed (`sceneHandleCollision`): what the rig's graded
 *    branch calls is the scene's callback, on this drive's runtime, director
 *    and traffic. Through the lane's round 1 the harness re-implemented it, so
 *    a scene that stopped pushing a static-object collision passed every
 *    cadence test (the verifier's mutant V8); since the landing the cadence
 *    proof runs to the runtime's queue through the scene's own statement.
 *
 * THE DRIVE is closed loop and decided PER PHYSICS STEP from the car the step
 * record holds after the previous step (ADR-017's rule for the rig), so the
 * car's trajectory is one trajectory on every cadence; only how contacts are
 * REPORTED may differ, and that is what is measured.
 *
 * WHAT IS NOT MODELLED: React (the call order is live-grid-wiring's model),
 * the cabin (every discrete channel is a belted car in D; no cabin is mounted,
 * so the scene's before-step callback refreshes no channel here), the camera,
 * audio and haptics (counted, not played). Without `npcShells` no shell is
 * mounted (the static census: the staged escort rides the other lane and the
 * sentinel grades it).
 */
import RAPIER from "../../../../../../node_modules/@react-three/rapier/node_modules/@dimforge/rapier3d-compat";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidElement, type ReactElement } from "react";
import { CuboidCollider, RigidBody, TrimeshCollider } from "@react-three/rapier";
import ts from "typescript";
import * as Rig from "@/components/sim/VehicleRig";
import * as Npc from "@/components/sim/NpcColliders";
import { readNpcColliderUserData, type NpcColliderUserData } from "@/components/sim/NpcColliders";
import { hittableObstacleBodies, liveContactBodies, nameLiveContact } from "@/components/sim/LessonScene";
import { obstacleYawRad, PROP_COLLIDERS } from "@/components/sim/ScenarioObstacles";
import { actorObb, PEDESTRIAN_BODY_RADIUS_M, playerObb } from "../../../collision";
import type { LessonSpec, NearMissEvent, NearMissStats, VehicleSample } from "../../../contracts";
import { directorContactCast } from "../../../orchestrator/director";
import { vruAheadMeters } from "../../../orchestrator/contact";
import type { SimTick } from "../../../rules/types";
import { sampleAt } from "../../../traces/sample";
import type { ScenarioTrace, TracePoint } from "../../../traces/types";
import { createAttemptFeedState, feedAttemptPoint } from "../../../scene/attemptFeed";
import { createGradeGridSample, GradeGrid } from "../../../scene/gradeGrid";
import * as SampleBuilder from "../../../scene/vehicleSample";
import { buildLessonWorldCore } from "../../../scene/lessonWorldRecipe";
import {
  assignPool,
  NO_PHYSICS_STEPS,
  PhysicsSessionClock,
  PlayerStepTrackRecorder,
  recordPhysicsStep,
  selectNearest,
  type PhysicsStepState,
  type TrafficSystem,
} from "../../../traffic";
import { createHeadlessChassis, IDLE_INPUT, VehicleSim, type VehicleInput } from "../../../vehicle";
import { READY_DRIVELINE } from "../../../vehicle/driveline";
import * as T from "../../../vehicle/tuning";
import { WorldColliders, type WorldColliderSet } from "../../../world";
import { applyTick, buildLessonResult, createLessonSession, type LessonStepResult } from "../../engine";
import type { LessonResult, LessonSessionState } from "../../types";
import { buildLiveWorld } from "./liveChainReplay";
import { sceneFrameScope, sceneGradeCut, type SceneGradeName } from "./sceneGradeCut";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../../../../..");
const H = T.FIXED_DT;
const NO_WEATHER = { isNight: false, rain: false, fog: false, snow: false };

let rapierReady: Promise<void> | null = null;
/** rapier's wasm, once per worker. */
export function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

// ───────────────────────────────────────────────────────────────────────────
// The world: WorldColliders interpreted, the lesson's walls and props built
// ───────────────────────────────────────────────────────────────────────────

function flatten(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const c of node) flatten(c, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  if (typeof node.type === "symbol") return flatten((node.props as { children?: unknown }).children, out);
  out.push(node);
  return out;
}

type Vec3 = [number, number, number];
const BODY_PROPS = new Set(["type", "colliders", "name", "userData", "children"]);
const CUBOID_PROPS = new Set(["args", "position", "friction", "restitution"]);
const TRIMESH_PROPS = new Set(["args", "friction", "restitution"]);

function refuseUnknown(el: ReactElement, allowed: Set<string>, what: string): void {
  const bad = Object.keys(el.props as object).filter((k) => !allowed.has(k));
  if (bad.length > 0) throw new Error(`${what} prop(s) this harness cannot apply: ${bad.join(", ")}`);
}

/** `WorldColliders`' tree into rapier bodies — every prop applied, an
 *  unknown one refused (a matcher that cannot read something says so). */
function mountWorldColliders(world: RAPIER.World, colliders: WorldColliderSet): void {
  for (const body of flatten(WorldColliders({ colliders }))) {
    if (body.type !== RigidBody) throw new Error(`unreadable top-level element ${String(body.type)}`);
    refuseUnknown(body, BODY_PROPS, "RigidBody");
    const bp = body.props as { type?: string; userData?: unknown; children?: unknown };
    if (bp.type !== "fixed") throw new Error(`a world body of type ${bp.type}`);
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    // r3r writes the prop onto the rapier body (`rb.userData = value`).
    if (bp.userData !== undefined) rb.userData = bp.userData;
    for (const c of flatten(bp.children)) {
      if (c.type === CuboidCollider) {
        refuseUnknown(c, CUBOID_PROPS, "CuboidCollider");
        const p = c.props as { args: Vec3; position?: Vec3; friction?: number; restitution?: number };
        const d = RAPIER.ColliderDesc.cuboid(...p.args);
        if (p.position) d.setTranslation(...p.position);
        if (p.friction !== undefined) d.setFriction(p.friction);
        if (p.restitution !== undefined) d.setRestitution(p.restitution);
        world.createCollider(d, rb);
      } else if (c.type === TrimeshCollider) {
        refuseUnknown(c, TRIMESH_PROPS, "TrimeshCollider");
        const p = c.props as { args: [Float32Array, Uint32Array]; friction?: number; restitution?: number };
        const d = RAPIER.ColliderDesc.trimesh(p.args[0], p.args[1]);
        if (p.friction !== undefined) d.setFriction(p.friction);
        if (p.restitution !== undefined) d.setRestitution(p.restitution);
        world.createCollider(d, rb);
      } else {
        throw new Error(`unreadable collider element ${String(c.type)}`);
      }
    }
  }
}

const yawQ = (yawRad: number) => ({ x: 0, y: Math.sin(yawRad / 2), z: 0, w: Math.cos(yawRad / 2) });

/** A fixed cuboid body the way ScenarioObstacles mounts a wall or a prop. */
function mountCuboid(
  world: RAPIER.World,
  x: number,
  y: number,
  headingDeg: number,
  half: { x: number; y: number; z: number },
  centerY: number,
  friction: number,
  restitution: number,
): void {
  const rb = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0, -y).setRotation(yawQ(obstacleYawRad(headingDeg))),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(0, centerY, 0)
      .setFriction(friction)
      .setRestitution(restitution),
    rb,
  );
}

/** What of the lesson's scenario obstacles this harness mounts. */
export interface MountedObstacles {
  walls: number;
  props: number;
  /** Hittable obstacles NOT mounted (GLB-measured vehicles, forecourts, …). */
  skipped: string[];
}

/**
 * The lesson's hittable walls and props, with ScenarioObstacles' numbers:
 * `ObstacleWall` — args [thickness/2, height/2, length/2] at y = height/2,
 * friction 0.6, restitution 0.05, defaults 1.2 m high / 0.3 m thick;
 * `PropInstances` — `PROP_COLLIDERS[kind]`, friction 0.6, restitution 0.1.
 */
function mountScenarioObstacles(world: RAPIER.World, lesson: LessonSpec, raw: unknown): MountedObstacles {
  const out: MountedObstacles = { walls: 0, props: 0, skipped: [] };
  for (const o of buildLessonWorldCore(lesson, raw).scenarioObstacles) {
    if (o.kind === "wall") {
      const height = o.heightM ?? 1.2;
      const thickness = o.thicknessM ?? 0.3;
      mountCuboid(world, o.x, o.y, o.headingDeg, { x: thickness / 2, y: height / 2, z: o.lengthM / 2 }, height / 2, 0.6, 0.05);
      out.walls++;
    } else if (o.kind === "prop") {
      const dims = PROP_COLLIDERS[o.prop];
      mountCuboid(world, o.x, o.y, o.headingDeg, dims.half, dims.centerY, 0.6, 0.1);
      out.props++;
    } else if (!("visual" in o && o.visual === true)) {
      out.skipped.push(o.kind);
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// The product's code, cut out of its source
// ───────────────────────────────────────────────────────────────────────────

const SOURCE_CACHE = new Map<string, string>();
function source(rel: string): string {
  let s = SOURCE_CACHE.get(rel);
  if (s === undefined) {
    s = readFileSync(path.join(SRC, rel), "utf-8").replace(/\r\n/g, "\n");
    SOURCE_CACHE.set(rel, s);
  }
  return s;
}

/** The names base's chassis `onCollisionEnter` reads from the rig's scope. */
const RIG_HANDLER_NAMES = [
  "readNpcColliderUserData",
  "audioRef",
  "hapticsRef",
  "onCollision",
  "gradedContactMinKmh",
  "collisionMinKmh",
  "simRef",
] as const;
type RigHandlerFactory = (...args: unknown[]) => (payload: unknown) => void;
let rigHandlerCache: RigHandlerFactory | null | undefined;

/**
 * VehicleRig's `onCollisionEnter={…}` on the chassis `<RigidBody>`, cut out of
 * the source as a tree and compiled — or null when the rig puts none there.
 */
export function chassisCollisionEnterHandler(): RigHandlerFactory | null {
  if (rigHandlerCache !== undefined) return rigHandlerCache;
  const text = source("components/sim/VehicleRig.tsx");
  const sf = ts.createSourceFile("VehicleRig.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: ts.Expression[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isJsxAttribute(n) &&
      n.name.getText(sf) === "onCollisionEnter" &&
      n.initializer !== undefined &&
      ts.isJsxExpression(n.initializer) &&
      n.initializer.expression !== undefined
    ) {
      found.push(n.initializer.expression);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (found.length > 1) throw new Error(`expected at most one onCollisionEnter in VehicleRig, found ${found.length}`);
  if (found.length === 0) {
    rigHandlerCache = null;
    return null;
  }
  const js = ts.transpileModule(`return (${found[0].getText(sf)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  rigHandlerCache = new Function(...RIG_HANDLER_NAMES, `"use strict";\n${js}`) as RigHandlerFactory;
  return rigHandlerCache;
}

/** Every name LessonScene's `handleCollision` reads from the scene's scope —
 *  supplied in this order. A scene whose callback reaches for another name
 *  throws a ReferenceError naming it (unreadable = red, never a quiet pass). */
export const SCENE_COLLISION_NAMES = [
  "impactCutRef",
  "runtime",
  "nameLiveContact",
  "playerObb",
  "liveContactBodies",
  "directorContactCast",
  "director",
  "traffic",
  "hittableObstacleBodies",
  "built",
  "obstacleFootprintsRef",
] as const;
export type SceneCollisionName = (typeof SCENE_COLLISION_NAMES)[number];
/** The scene's callback, as VehicleRig's ear calls it. */
export type SceneCollisionHandler = (impactKmh: number, withWhat: string, student: Readonly<VehicleSample>) => void;
export interface SceneCollisionCut {
  /** The callback's source text, as the scene spells it. */
  text: string;
  /** How many parameters it declares (3 since the repair: …, student). */
  params: number;
  /** Bind it to a scene's scope. */
  bind(scope: Record<SceneCollisionName, unknown>): SceneCollisionHandler;
}
let sceneCollisionCache: SceneCollisionCut | null = null;

/**
 * LessonScene's `handleCollision` — the function handed to `useCallback` in
 * `const handleCollision = useCallback(…, [deps])` — cut out of the source as a
 * tree and compiled. The callback itself, not its memoisation: `useCallback`
 * returns its first argument, and which render's callback the rig holds is
 * the ear's question (components/sim/__tests__/chassis-contact-ear.test.ts).
 */
export function sceneHandleCollision(): SceneCollisionCut {
  if (sceneCollisionCache) return sceneCollisionCache;
  const text = source("components/sim/LessonScene.tsx");
  const sf = ts.createSourceFile("LessonScene.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const decls: ts.VariableDeclaration[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === "handleCollision") decls.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (decls.length !== 1) throw new Error(`expected one handleCollision in LessonScene, found ${decls.length}`);
  const init = decls[0].initializer;
  if (!init || !ts.isCallExpression(init) || init.expression.getText(sf) !== "useCallback") {
    throw new Error("LessonScene's handleCollision is not a useCallback(…) — this cut cannot read it");
  }
  const fn = init.arguments[0];
  if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
    throw new Error("LessonScene's handleCollision: useCallback's first argument is not a function literal");
  }
  const js = ts.transpileModule(`return (${fn.getText(sf)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const make = new Function(...SCENE_COLLISION_NAMES, `"use strict";\n${js}`) as (...scope: unknown[]) => SceneCollisionHandler;
  sceneCollisionCache = {
    text: fn.getText(sf),
    params: fn.parameters.length,
    bind: (scope) => make(...SCENE_COLLISION_NAMES.map((n) => scope[n])),
  };
  return sceneCollisionCache;
}

// ───────────────────────────────────────────────────────────────────────────
// NpcColliders' shell pool, mounted on this rapier world
// ───────────────────────────────────────────────────────────────────────────

/** NpcColliders' mount numbers (its JSX and constants, read 2026-10-13):
 *  `<RigidBody type="kinematicPosition" colliders={false} position={[k·12,
 *  −120, 0]} userData={tag}>` + `<CuboidCollider args={[car halfW, 0.7, car
 *  halfL]} friction={0.5} restitution={0.05}>`; pedestrians at `[200 + k·12,
 *  −120, 0]` with `<CapsuleCollider args={[0.55, 0.3]} friction={0.6}
 *  restitution={0}>`. */
const SHELL_PARK_Y = -120;
const SHELL_VEH_HALF_H = 0.7;
const SHELL_PED_HALF_HEIGHT = 0.55;
const SHELL_SIZING_POSE = { x: 0, y: 0, dirX: 0, dirY: 1 } as const;

export interface MountedShellPool {
  veh: RAPIER.RigidBody[];
  ped: RAPIER.RigidBody[];
  vehTags: NpcColliderUserData[];
  pedTags: NpcColliderUserData[];
}

function mountShellPool(world: RAPIER.World): MountedShellPool {
  const car = Npc.npcShellHalfExtents(undefined);
  const pool: MountedShellPool = { veh: [], ped: [], vehTags: [], pedTags: [] };
  for (let k = 0; k < Npc.VEHICLE_SHELL_COUNT; k++) {
    const tag: NpcColliderUserData = { npcCollider: true, kind: "vehicle", npcId: -1 };
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(k * 12, SHELL_PARK_Y, 0));
    rb.userData = tag;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(car.halfWidthM, SHELL_VEH_HALF_H, car.halfLengthM).setFriction(0.5).setRestitution(0.05),
      rb,
    );
    pool.veh.push(rb);
    pool.vehTags.push(tag);
  }
  for (let k = 0; k < Npc.PED_SHELL_COUNT; k++) {
    const tag: NpcColliderUserData = { npcCollider: true, kind: "pedestrian", npcId: -1 };
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(200 + k * 12, SHELL_PARK_Y, 0),
    );
    rb.userData = tag;
    world.createCollider(
      RAPIER.ColliderDesc.capsule(SHELL_PED_HALF_HEIGHT, PEDESTRIAN_BODY_RADIUS_M).setFriction(0.6).setRestitution(0),
      rb,
    );
    pool.ped.push(rb);
    pool.pedTags.push(tag);
  }
  return pool;
}

/**
 * NpcColliders' `useFrame` AS IT STOOD THROUGH 8cb0707 — a transcription, line
 * for line, of the callback that moved the pool once per render frame: the
 * rebind on its own clock (`reassignAt −= min(delta, 0.1)`; at ≤ 0 → 0.5 s and
 * a nearest-N selection from the FRAME's chassis pose), then one pose write
 * per bound shell from `traffic.vehicles` / `.pedestrians` as the frame's last
 * grid point left them — a teleport on a rebind, `setNextKinematic…` otherwise
 * (so rapier derives the shell's velocity from that one move, whatever number
 * of physics steps the next frame takes). The instrument's sabotage of
 * «the shell lives on the grid»; never the product.
 */
function frameShellModel(traffic: TrafficSystem, pool: MountedShellPool): (delta: number, px: number, py: number) => void {
  const VN = pool.veh.length;
  const PN = pool.ped.length;
  const vehAssign = new Int32Array(VN).fill(-1);
  const vehBound = new Int32Array(VN).fill(-1);
  const vehSelIdx = new Int32Array(VN);
  const vehSelD2 = new Float64Array(VN);
  const pedAssign = new Int32Array(PN).fill(-1);
  const pedBound = new Int32Array(PN).fill(-1);
  const pedSelIdx = new Int32Array(PN);
  const pedSelD2 = new Float64Array(PN);
  const pos = { x: 0, y: SHELL_PARK_Y, z: 0 };
  const rot = { x: 0, y: 0, z: 0, w: 1 };
  const half = { x: 0, y: SHELL_VEH_HALF_H, z: 0 };
  const vehFitHalfL = new Float64Array(VN).fill(-1);
  let reassignAt = 0;
  return (delta, px, py) => {
    const dt = Math.min(delta, 0.1);
    reassignAt -= dt;
    if (reassignAt <= 0) {
      reassignAt = 0.5;
      assignPool(vehAssign, vehSelIdx, selectNearest(traffic.vehicles, px, py, 130, vehSelIdx, vehSelD2));
      assignPool(pedAssign, pedSelIdx, selectNearest(traffic.pedestrians, px, py, 70, pedSelIdx, pedSelD2));
    }
    for (let k = 0; k < VN; k++) {
      const body = pool.veh[k];
      const idx = vehAssign[k];
      const rebound = idx !== vehBound[k];
      if (idx < 0) {
        if (rebound) {
          vehBound[k] = -1;
          pool.vehTags[k].npcId = -1;
          pos.x = k * 12;
          pos.y = SHELL_PARK_Y;
          pos.z = 0;
          body.setTranslation(pos, false);
        }
        continue;
      }
      const v = traffic.vehicles[idx];
      const wantHalfL = actorObb(SHELL_SIZING_POSE, v.profile).halfLengthM;
      if (rebound || vehFitHalfL[k] !== wantHalfL) vehFitHalfL[k] = Npc.fitVehicleShell(body, v.profile, half);
      const yaw = Math.atan2(v.dirX, -v.dirY);
      pos.x = v.x;
      pos.y = SHELL_VEH_HALF_H;
      pos.z = -v.y;
      rot.y = Math.sin(yaw / 2);
      rot.w = Math.cos(yaw / 2);
      if (rebound) {
        vehBound[k] = idx;
        pool.vehTags[k].kind = traffic.vehicleCollisionKind(v.id);
        pool.vehTags[k].npcId = v.id;
        body.setTranslation(pos, true);
        body.setRotation(rot, true);
      } else {
        body.setNextKinematicTranslation(pos);
        body.setNextKinematicRotation(rot);
      }
    }
    for (let k = 0; k < PN; k++) {
      const body = pool.ped[k];
      const idx = pedAssign[k];
      const rebound = idx !== pedBound[k];
      if (idx < 0) {
        if (rebound) {
          pedBound[k] = -1;
          pool.pedTags[k].npcId = -1;
          pos.x = 200 + k * 12;
          pos.y = SHELL_PARK_Y;
          pos.z = 0;
          body.setTranslation(pos, false);
        }
        continue;
      }
      const p = traffic.pedestrians[idx];
      pos.x = p.x;
      pos.y = SHELL_PED_HALF_HEIGHT + PEDESTRIAN_BODY_RADIUS_M;
      pos.z = -p.y;
      if (rebound) {
        pedBound[k] = idx;
        pool.pedTags[k].npcId = p.id;
        body.setTranslation(pos, true);
      } else {
        body.setNextKinematicTranslation(pos);
      }
    }
  };
}

// ───────────────────────────────────────────────────────────────────────────
// The drive
// ───────────────────────────────────────────────────────────────────────────

/** What the product's pool looks like from here (scene/npcShells.ts). */
interface ProductShellPool {
  step(k: number, student: Readonly<VehicleSample>, veh: unknown[], ped: unknown[], respawned?: boolean): void;
  rebinds: number;
}
/** The tree's own shell pool, when it has one (the repair) — reached through
 *  the component's module, as VehicleRig reaches the tag reader; undefined on
 *  a tree whose NpcColliders still moves the pool in a `useFrame` (the base). */
const PRODUCT_SHELLS = (
  Npc as unknown as {
    NpcShellPool?: new (
      traffic: unknown,
      vehTags: NpcColliderUserData[],
      pedTags: NpcColliderUserData[],
      cast?: unknown,
    ) => ProductShellPool;
  }
).NpcShellPool;

/** The car after the previous physics step, as the drive's controller sees it. */
export interface DriveState {
  step: number;
  x: number;
  y: number;
  headingDeg: number;
  speedKmh: number;
}

export interface ContactDriveOptions {
  lesson: LessonSpec;
  raw: unknown;
  /** District pose the car starts at. */
  start: { x: number; y: number; headingDeg: number };
  /** Decided once per physics step from the car after the previous one. */
  control: (st: DriveState) => Partial<VehicleInput>;
  /** Render-frame deltas, s, cycled (the first frame's included). */
  deltas: readonly number[];
  /** Hard stop, in physics steps. */
  maxSteps: number;
  /** Keep stepping this many steps after the session ended (default 0). */
  tailSteps?: number;
  /**
   * AUDIT the step record against rapier itself: give the chassis collider
   * COLLISION_EVENTS (as r3r did while the rig had an onCollisionEnter) and,
   * at every drain, list what r3r would have handed the old handler — one
   * entry per manifold of each STARTED pair, with `linvel` read then. At one
   * step per frame that is exactly what base judged; the outcome compares it
   * with every contact the step record began, in order.
   */
  auditStartedEvents?: boolean;
  /**
   * sc-roundabout-entry:08a0b701 (lane npcstep) — MOUNT NpcColliders' SHELL
   * POOL (8 vehicle cuboids + 4 pedestrian capsules, kinematic, tagged, with
   * the component's own friction / restitution / mount poses) and move it:
   *
   *  · "frame" — the way NpcColliders moved it through 8cb0707: ONCE PER
   *    RENDER FRAME, after the scene's graded call, from the traffic state the
   *    frame's last grid point left and the frame's own chassis pose, the
   *    rebind on the component's own clock (`min(delta, 0.1)` summed to 0.5 s).
   *    A model, transcribed from that file's `useFrame` (`frameShellModel`
   *    below) — kept as the instrument's own sabotage: every cadence census of
   *    NPC contacts must go red on it.
   *  · "product" — the tree's own shell driver, reached the way the scene
   *    reaches it. On a tree that has none (the base) this falls back to
   *    "frame", so the census runs red there instead of not at all.
   *
   * Omitted: no shell is mounted (the static census — a staged escort rides
   * the other lane and the sentinel grades it).
   */
  npcShells?: "frame" | "product";
  /** Keep the car's pose after every physics step (`poseAfterStep`). */
  tracePoses?: boolean;
  /**
   * SABOTAGE SWITCH of the instrument, never the product: "skip" does not run
   * the scene's before-step callback, i.e. the world is graded at the frame's
   * end only — the shells are then posed from the grid, but a frame of n steps
   * poses them once. The census must go red on it.
   */
  sceneBeforeStep?: "run" | "skip";
  /**
   * A RESPAWN AT A NAMED GRID POINT (round 2): when that point's tick has been
   * delivered, the three calls of LessonScene's `resetCar` are made — the car
   * back on the drive's start (`VehicleSim.reset`), the director re-stages
   * (`director.reset`), the grid forgets what was pending (`GradeGrid.reset`
   * — which now also tells the shells' hook at the next point). Made from
   * inside the point's `onTick`, as the dev rig's R key is: the same point on
   * every display. (The scene's own `resetCar`, cut out of its source, is
   * executed by live-grade-call.execution.test.ts §5; the harness mounts no
   * cabin, so its fourth call has nothing to forget here.)
   */
  respawnAtPoint?: number;
  /**
   * SABOTAGE SWITCH of the instrument: do NOT pass the grid's `respawned`
   * flag on to the pool (the wiring through round 1 — a respawn was no event
   * for the shells). The respawn census must see it.
   */
  shellsIgnoreRespawn?: boolean;
  /**
   * Round 3 (N5/N6): the near-miss stat's handler — what the scene hands the
   * shell (`onNearMiss`), here the census's. Default: none.
   */
  onNearMiss?: (event: NearMissEvent, stats: NearMissStats) => void;
  /**
   * Round 3 (N6): called at every graded point the session hears, after the
   * tick was applied, with the tick and the traffic system as that point left
   * it — for a census that reads a per-point HUD channel (the rear badge).
   */
  tapPoint?: (tick: SimTick, traffic: TrafficSystem) => void;
  /**
   * A tap on the lesson engine, once per grid point the session heard: the
   * tick it was handed and what `applyTick` returned for it (the session after
   * it, the HUD events it raised). Read-only — lane hztick's witnesses read the
   * coach's cards and the car's speed at the grid point a card was raised on.
   */
  onStep?: (tick: SimTick, step: LessonStepResult) => void;
}

/** One contact the rig JUDGED (thumped): how it reached the judge, when, how
 *  fast, and whether it was graded. */
export interface JudgedContact {
  /** "drain": r3r's onCollisionEnter at the frame's drain (base); "step": the
   *  step record, heard at its grid point (the repair). */
  path: "drain" | "step";
  /** The grid point the collision is booked at (drain: the frame's first). */
  bookedStep: number;
  impactKmh: number;
  withWhat: string;
  graded: boolean;
  /** "step" path, a tagged NPC shell: the agent the shell was bound to when
   *  the contact was heard, and that agent's own speed there (km/h) — what
   *  tells a crossing or moving road user from a standing one. */
  npcId?: number;
  npcSpeedKmh?: number;
}

export interface ContactDriveOutcome {
  mounted: MountedObstacles;
  result: LessonResult;
  session: LessonSessionState;
  judged: JudgedContact[];
  /** COLLISION violations in the session ledger: their time and points. */
  collisions: Array<{ t: number; points: number; withWhat: string }>;
  /** Per physics step: the car's signed speed after it (index = step). */
  speedAfterStep: number[];
  /** First step whose speed fell by > 20 km/h (the impact), or -1. */
  impactStep: number;
  steps: number;
  frames: number;
  /** Steps per frame, max. */
  maxStepsPerFrame: number;
  /** The grid point whose tick ended the session (-1: it did not end).
   *  Contacts after it are still heard (a long frame grades past the end —
   *  the shell, not the grid, stops listening), but nothing grades them, and
   *  a 60 Hz drive stops sooner: compare only the contacts up to it. */
  endedAtPoint: number;
  /** The last grid point the comparison covers: the end, or `maxSteps`. */
  closedAtPoint: number;
  /** With `auditStartedEvents`: what r3r would have handed the old handler
   *  (`step userData km/h`, one per manifold), and what the step record began. */
  rapierStarted: string[];
  stepRecordStarted: string[];
  /** With `auditStartedEvents`: how many STARTED pairs held, at the drain, a
   *  manifold with NO solver contact beside the one(s) that made the pair
   *  active. r3r called the handler for every manifold of the pair, so these
   *  are the drives on which «one contact per manifold» and «one per manifold
   *  in solver contact» are different counts (the verifier's mutant V2). */
  startedWithIdleManifold: number;
  /**
   * Every `collision` event on a tick the live session was handed, in order:
   * `[grid point, withWhat, actorId]`. BOTH reporters end here — the rig's ear
   * (a contact rapier found, named by the scene's `handleCollision`) and the
   * director's contact sentinel (the boxes overlap on the grid) — so a point
   * that carries more reports than the ear graded there heard the sentinel.
   */
  collisionReports: Array<[number, string, string | null]>;
  /** How the shell pool was moved ("none": not mounted). */
  shellClock: "none" | "frame" | "product";
  /** The shape of the scene's graded statements this drive executed. */
  sceneShape: "function" | "inline";
  /** Nearest-N selections the product's pool made (0: frame model / none). */
  shellRebinds: number;
  /** With `tracePoses`: `[x, y, headingDeg, speedKmh]` after step i (index =
   *  step; 0 = the start pose). */
  poseAfterStep: Array<[number, number, number, number]>;
  /** With shells: every step at which a vehicle / pedestrian shell changed
   *  the agent it is bound to — `step shell# kind npcId`. */
  shellBinds: string[];
  /** With `respawnAtPoint`: how many times the respawn was made (0 or 1), and
   *  the fastest any vehicle shell moved in one physics step, m/s. */
  respawns: number;
  maxShellSpeedMps: number;
}

/** A frame list that starts with one frame of `lead` whole steps plus half a
 *  step, so every later frame boundary falls `lead` steps further on. */
export function phased(deltas: readonly number[], lead: number): number[] {
  return lead === 0 ? [...deltas] : [lead * H + H / 2, ...deltas];
}

export function driveIntoContact(opts: ContactDriveOptions): ContactDriveOutcome {
  const { lesson, raw } = opts;
  const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
  world.timestep = H;
  const core = buildLessonWorldCore(lesson, raw);
  mountWorldColliders(world, core.geometry.colliders);
  const mounted = mountScenarioObstacles(world, lesson, raw);

  const body = createHeadlessChassis(RAPIER as never, world as never) as unknown as RAPIER.RigidBody;
  const yaw = Math.PI - (opts.start.headingDeg * Math.PI) / 180;
  body.setTranslation({ x: opts.start.x, y: T.SPAWN.y, z: -opts.start.y }, true);
  body.setRotation(yawQ(yaw), true);
  const chassis = body.collider(0);
  // The sim's spawn is the drive's start only where a respawn is asked for:
  // every other drive constructs the sim exactly as it always did.
  const sim =
    opts.respawnAtPoint !== undefined
      ? new VehicleSim(world as never, body as never, { x: opts.start.x, y: T.SPAWN.y, z: -opts.start.y, yawRad: yaw })
      : new VehicleSim(world as never, body as never);

  const { runtime, traffic, director } = buildLiveWorld(lesson, raw);
  // NpcColliders' pool — and who moves it (see `ContactDriveOptions.npcShells`).
  const shellPool = opts.npcShells ? mountShellPool(world) : null;
  const shellClock: ContactDriveOutcome["shellClock"] = !shellPool ? "none" : opts.npcShells === "product" && PRODUCT_SHELLS ? "product" : "frame";
  const frameShells = shellPool && shellClock === "frame" ? frameShellModel(traffic as TrafficSystem, shellPool) : null;
  // The product's pool, on the bodies mounted above — what NpcColliders builds
  // and points the scene's `npcShellsRef` at.
  // …with the director's own contact cast, as the scene hands it
  // (`<NpcColliders cast={directorContactCast(director)} />`, round 2).
  const productPool =
    shellPool && shellClock === "product"
      ? new PRODUCT_SHELLS!(traffic, shellPool.vehTags, shellPool.pedTags, directorContactCast(director))
      : null;
  const npcShellsRef: {
    current: ((k: number, student: Readonly<VehicleSample>, respawned: boolean) => void) | null;
  } = {
    current:
      productPool && shellPool
        ? (k, student, respawned) =>
            productPool.step(k, student, shellPool.veh, shellPool.ped, opts.shellsIgnoreRespawn ? false : respawned)
        : null,
  };
  const shellBinds: string[] = [];
  const boundIds: number[] = shellPool ? [...shellPool.vehTags, ...shellPool.pedTags].map(() => -1) : [];
  const noteBinds = (step: number) => {
    if (!shellPool) return;
    const tags = [...shellPool.vehTags, ...shellPool.pedTags];
    for (let i = 0; i < tags.length; i++) {
      if (tags[i].npcId !== boundIds[i]) {
        boundIds[i] = tags[i].npcId;
        shellBinds.push(`${step} #${i} ${tags[i].kind} ${tags[i].npcId}`);
      }
    }
  };
  const poseAfterStep: ContactDriveOutcome["poseAfterStep"] = [[opts.start.x, opts.start.y, opts.start.headingDeg, 0]];
  let session = createLessonSession(lesson);
  const live = () => session.phase !== "completed" && session.phase !== "aborted";
  const collisionMinKmh = lesson.collisionMinKmh ?? Rig.COLLISION_MIN_KMH;
  const judged: JudgedContact[] = [];
  const steps = new PlayerStepTrackRecorder();
  const sessionClock = new PhysicsSessionClock();
  const gradeGrid = new GradeGrid();
  const tRef = { current: 0 };
  const sample: VehicleSample = createGradeGridSample();
  sample.seatbeltOn = true;
  sample.gear = 1;
  sample.engineOn = true;

  /** BASE ONLY — a model of the scene's handleCollision for r3r's drain path
   *  (base's own callback read the frame's `sampleRef`; the drain hands this
   *  the frame-end pose). The repair's path below runs the scene's OWN. */
  const handleCollision = (_impactKmh: number, withWhat: string, pose: { x: number; y: number; headingDeg: number }) => {
    runtime.pushCollision(
      withWhat as never,
      nameLiveContact(
        withWhat as never,
        playerObb(pose.x, pose.y, pose.headingDeg),
        liveContactBodies(directorContactCast(director), (id) => traffic.staged(id), []),
      ),
    );
  };

  // ── base: the rig's own onCollisionEnter, at r3r's drain ────────────────
  const factory = chassisCollisionEnterHandler();
  let frameFirstStep = 0;
  let drainPose = { x: 0, y: 0, headingDeg: 0 };
  let lastThumpGraded = false;
  const enterHandler = factory
    ? factory(
        readNpcColliderUserData,
        { current: { thump: () => {} } },
        {
          current: {
            collision: () => {
              lastThumpGraded = true;
            },
            curb: () => {
              lastThumpGraded = false;
            },
          },
        },
        (impactKmh: number, withWhat: string) => {
          judged.push({ path: "drain", bookedStep: frameFirstStep, impactKmh, withWhat, graded: true });
          handleCollision(impactKmh, withWhat, drainPose);
        },
        Rig.gradedContactMinKmh,
        collisionMinKmh,
        { current: sim },
      )
    : null;
  // r3r gives a collider COLLISION_EVENTS when its body carries a collision
  // handler — and only then.
  if (enterHandler || opts.auditStartedEvents) chassis.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  const rapierStarted: string[] = [];
  const stepRecordStarted: string[] = [];
  let startedWithIdleManifold = 0;
  const contactLine = (step: number, userData: unknown, kmh: number) => `${step} ${JSON.stringify(userData ?? null)} ${kmh}`;
  const eventQueue = new RAPIER.EventQueue(false);

  // ── the repair: the rig's judge, reached from the grid's hook ───────────
  const hear = (Rig as unknown as { hearChassisContact?: (...a: unknown[]) => boolean }).hearChassisContact;
  // …and what its graded branch calls: LessonScene's OWN handleCollision, on
  // this drive's runtime, director and traffic. `built` is the lesson's world
  // recipe (the scene's `built.scenarioObstacles`); no GLB rig is mounted here,
  // so no obstacle footprint was ever published (`obstacleFootprintsRef` is
  // the scene's initial `[]`); the impact cut is presentation, not mounted.
  const sceneCollision: SceneCollisionHandler | null = hear
    ? sceneHandleCollision().bind({
        impactCutRef: { current: null },
        runtime,
        nameLiveContact,
        playerObb,
        liveContactBodies,
        directorContactCast,
        director,
        traffic,
        hittableObstacleBodies,
        built: core,
        obstacleFootprintsRef: { current: [] },
      })
    : null;
  const contactListenerRef: { current: ((c: unknown, s: Readonly<VehicleSample>) => void) | null } = {
    current: hear
      ? (contact, student) => {
          let graded = false;
          let impact = NaN;
          let what = "";
          hear(contact, collisionMinKmh, {
            thump: () => {},
            graded: (impactKmh: number, withWhat: string) => {
              graded = true;
              impact = impactKmh;
              what = withWhat;
              // VehicleRig's ear: `onCollision?.(impactKmh, withWhat, student)`.
              sceneCollision!(impactKmh, withWhat, student);
            },
            nudge: () => {},
          });
          const c = contact as { step: number; impactKmh: number; otherUserData: unknown };
          const tag = readNpcColliderUserData(c.otherUserData);
          const agent =
            tag === null
              ? undefined
              : tag.kind === "pedestrian"
                ? traffic.pedestrians.find((a) => a.id === tag.npcId)
                : traffic.vehicles.find((a) => a.id === tag.npcId);
          judged.push({
            path: "step",
            bookedStep: c.step,
            impactKmh: graded ? impact : c.impactKmh,
            withWhat: what,
            graded,
            ...(tag === null ? {} : { npcId: tag.npcId, npcSpeedKmh: agent ? agent.speedMps * 3.6 : NaN }),
          });
        }
      : null,
  };

  const collisionReports: ContactDriveOutcome["collisionReports"] = [];
  let respawns = 0;
  /** The fastest any shell moved in one physics step, m/s (0: no pool). */
  let maxShellSpeedMps = 0;
  /** The grid point whose tick ended the session (-1: it did not end). */
  let endedAtPoint = -1;
  const onTick = (tick: SimTick) => {
    if (!live()) return;
    // The comparison closes at ONE grid point on every cadence: a frame may
    // carry the drive past `maxSteps`, and the session must not hear those.
    if (Math.round(tick.t / H) > opts.maxSteps) return;
    for (const e of tick.events) {
      if (e.kind === "collision") collisionReports.push([Math.round(tick.t / H), e.withWhat, e.actorId ?? null]);
    }
    const step = applyTick(session, tick);
    session = step.state;
    opts.onStep?.(tick, step);
    opts.tapPoint?.(tick, traffic as unknown as TrafficSystem);
    if (!live()) endedAtPoint = Math.round(tick.t / H);
    // LessonScene.resetCar, at this point (see `respawnAtPoint`).
    if (opts.respawnAtPoint !== undefined && Math.round(tick.t / H) === opts.respawnAtPoint) {
      sim.reset();
      director?.reset();
      gradeGrid.reset();
      respawns++;
    }
  };
  const noop = () => {};
  const args: Record<SceneGradeName, unknown> = {
    gradeGrid,
    stepTrackRef: { current: steps },
    tRef,
    sample,
    sampleRef: { current: sample },
    attemptRecorderRef: { current: null },
    npcShellsRef,
    paused: false,
    updateCabinChannels: (SampleBuilder as unknown as { updateCabinChannels?: unknown }).updateCabinChannels,
    runtime,
    traffic,
    director,
    conditions: NO_WEATHER,
    inputRef: { current: { rawBrake: 0, rawThrottle: 0, consumeBlockedDriveAttempt: () => false } },
    hazardActiveRef: { current: false },
    telltaleLitRef: { current: false },
    onTelltale: noop,
    recorder: null,
    telltaleCautionLitRef: { current: false },
    onTelltaleCaution: noop,
    onStagedOutcome: noop,
    onTick,
    onNearMiss: opts.onNearMiss ?? noop,
    cabinRef: { current: null },
    attemptFeedRef: { current: createAttemptFeedState() },
    feedAttemptPoint,
    simRef: { current: sim },
    contactListenerRef,
    NO_PHYSICS_STEPS,
    vruAheadMeters,
    directorContactCast,
    // Round 3: what the frame's grading region reads between `const steps`
    // and the call — the scene's kinds of each, and this drive's clock.
    ...sceneFrameScope(),
    sessionClock,
  };
  const scene = sceneGradeCut().bind(args);

  const st: PhysicsStepState = { x: 0, y: 0, speedKmh: 0, headingDeg: 0 };
  const drive: DriveState = { step: 0, x: opts.start.x, y: opts.start.y, headingDeg: opts.start.headingDeg, speedKmh: 0 };
  const speedAfterStep: number[] = [0];
  let accumulator = 0;
  let frames = 0;
  let maxStepsPerFrame = 0;
  let endedAt = -1;
  const tail = opts.tailSteps ?? 0;
  while (steps.stepCount < opts.maxSteps && (endedAt < 0 || steps.stepCount < endedAt + tail)) {
    const delta = opts.deltas[frames % opts.deltas.length];
    frames++;
    frameFirstStep = steps.stepCount + 1;
    accumulator += Math.min(Math.max(delta, 0), 0.5);
    let n = 0;
    while (accumulator >= H) {
      // before-step (VehicleRig's callback), FIRST the scene's turn: on the
      // repair the step just taken is graded before the next one, and the
      // grid's `shells` hook poses the pool from that point (round 2: called
      // through `stepLoopGradeRef` before the step's input is read — round 1
      // registered its own callback, which ran after the input read).
      if (opts.sceneBeforeStep !== "skip") {
        scene.beforeStep?.();
        noteBinds(steps.stepCount);
      }
      // …then the drive's decision from the car after the previous step.
      const input = { ...IDLE_INPUT, ...opts.control(drive) };
      sim.update(input, H, READY_DRIVELINE);
      world.step(eventQueue);
      if (shellPool && opts.respawnAtPoint !== undefined) {
        for (const rb of shellPool.veh) {
          const v = rb.linvel();
          maxShellSpeedMps = Math.max(maxShellSpeedMps, Math.hypot(v.x, v.y, v.z));
        }
      }
      // after-step: VehicleRig's callback
      recordPhysicsStep(steps, body, sim);
      steps.stateAtStep(steps.stepCount, st);
      drive.step = steps.stepCount;
      drive.x = st.x;
      drive.y = st.y;
      drive.headingDeg = st.headingDeg;
      drive.speedKmh = st.speedKmh;
      speedAfterStep.push(st.speedKmh);
      if (opts.tracePoses) poseAfterStep.push([st.x, st.y, st.headingDeg, st.speedKmh]);
      for (const c of steps.contactsAtStep?.(steps.stepCount) ?? []) {
        stepRecordStarted.push(contactLine(c.step, c.otherUserData, c.impactKmh));
      }
      accumulator -= H;
      n++;
    }
    maxStepsPerFrame = Math.max(maxStepsPerFrame, n);
    // r3r's drain: once per frame, a started pair → onCollisionEnter per
    // manifold rapier still holds NOW.
    drainPose = { x: drive.x, y: drive.y, headingDeg: drive.headingDeg };
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (started && opts.auditStartedEvents) {
        const oh = h1 === chassis.handle ? h2 : h2 === chassis.handle ? h1 : -1;
        if (oh >= 0) {
          const oc = world.getCollider(oh);
          let held = 0;
          let inSolverContact = 0;
          world.contactPair(chassis, oc, (m) => {
            held++;
            if (m.numSolverContacts() > 0) inSolverContact++;
            const lv = body.linvel();
            const ob = oc.parent();
            const ov = ob?.linvel();
            const kmh = ov ? Math.hypot(lv.x - ov.x, lv.y - ov.y, lv.z - ov.z) * 3.6 : Math.abs(sim.speedKmh);
            rapierStarted.push(contactLine(steps.stepCount, ob?.userData, kmh));
          });
          if (held > inSolverContact) startedWithIdleManifold++;
        }
      }
      if (!started || !enterHandler) return;
      const otherHandle = h1 === chassis.handle ? h2 : h2 === chassis.handle ? h1 : -1;
      if (otherHandle < 0) return;
      const other = world.getCollider(otherHandle);
      world.contactPair(chassis, other, () => {
        lastThumpGraded = false;
        enterHandler({
          target: { rigidBody: body, collider: chassis },
          other: { rigidBody: other.parent() ?? undefined, collider: other },
        });
        if (!lastThumpGraded) {
          const lv = body.linvel();
          const ov = other.parent()?.linvel();
          const kmh = ov ? Math.hypot(lv.x - ov.x, lv.y - ov.y, lv.z - ov.z) * 3.6 : Math.abs(sim.speedKmh);
          judged.push({ path: "drain", bookedStep: frameFirstStep, impactKmh: kmh, withWhat: "", graded: false });
        }
      });
    });
    // RuntimeDriver: its frame's whole grading region — the clock line, the
    // assist and the two watches, then the scene's call (sceneGradeCut.ts).
    scene.frame(delta);
    // NpcColliders is mounted AFTER RuntimeDriver: through 8cb0707 its frame
    // callback moved the pool here, once, from this frame's fresh traffic.
    frameShells?.(delta, drive.x, drive.y);
    noteBinds(steps.stepCount);
    if (!live() && endedAt < 0) endedAt = steps.stepCount;
  }

  let impactStep = -1;
  for (let i = 1; i < speedAfterStep.length; i++) {
    if (speedAfterStep[i - 1] - speedAfterStep[i] > 20) {
      impactStep = i;
      break;
    }
  }
  const result = buildLessonResult(session);
  const collisions: ContactDriveOutcome["collisions"] = [];
  for (const e of session.events) {
    const ev = e as { kind?: string; code?: string; t?: number; points?: number; detail?: string };
    if (ev.kind === "violation" && ev.code === "COLLISION") {
      collisions.push({ t: ev.t ?? NaN, points: ev.points ?? NaN, withWhat: ev.detail ?? "" });
    }
  }
  sim.dispose();
  world.free();
  eventQueue.free();
  return {
    mounted,
    result,
    session,
    judged,
    collisions,
    speedAfterStep,
    impactStep,
    steps: steps.stepCount,
    frames,
    maxStepsPerFrame,
    endedAtPoint,
    closedAtPoint: endedAtPoint >= 0 ? endedAtPoint : opts.maxSteps,
    rapierStarted,
    stepRecordStarted,
    startedWithIdleManifold,
    collisionReports,
    shellClock,
    sceneShape: sceneGradeCut().shape,
    shellRebinds: productPool?.rebinds ?? 0,
    poseAfterStep,
    shellBinds,
    respawns,
    maxShellSpeedMps,
  };
}

/** The sheet, as one comparable string. */
/** The contacts the rig judged up to the end of the session — the part that
 *  can reach a sheet. */
export function judgedUntilEnd(o: ContactDriveOutcome): JudgedContact[] {
  return o.judged.filter((j) => j.bookedStep <= o.closedAtPoint);
}

export function sheetDigest(r: LessonResult): string {
  return JSON.stringify({
    passed: r.passed,
    score: r.score,
    effectiveScore: r.effectiveScore,
    completedAll: r.completedAll,
    aborted: r.aborted,
    objectives: r.objectives,
    summary: r.summary,
    durationSec: r.durationSec,
    eventPositions: r.eventPositions,
    examTermination: r.examTermination,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// A committed demo, DRIVEN (sc-roundabout-entry:08a0b701, lane npcstep)
// ───────────────────────────────────────────────────────────────────────────

/**
 * A closed-loop driver that FOLLOWS A COMMITTED DEMO'S TAPE on rapier: the
 * tape is a recorded kinematic series (no physics), this drives the product's
 * chassis along it so the car PHYSICALLY meets the staged actor the demo
 * collides with. Pure pursuit on the tape's pose `lookSec` ahead, the tape's
 * own speed with a small along-track correction; from the step after a crash
 * (a speed drop of more than `crashDropKmh` in one step) the brake. Decided
 * from the car after the previous step only — ADR-017's rule, so the car's
 * trajectory up to its first contact is one trajectory on every cadence.
 *
 * It does NOT reproduce the tape: the car lags and cuts corners by a few
 * decimetres, and the staged world — synced to the student, not to a clock —
 * follows the car that is actually there. What it reproduces is the demo's
 * MISTAKE; a cell where the physical car misses the actor says so (no judged
 * contact) and is reported as such, never counted as agreement.
 */
export function followTape(
  trace: ScenarioTrace,
  o: { lookSec?: number; crashDropKmh?: number; afterCrash?: "brake" | "release" | "carry-on" } = {},
): () => (st: DriveState) => Partial<VehicleInput> {
  const lookSec = o.lookSec ?? 0.7;
  const crashDrop = o.crashDropKmh ?? 6;
  const after = o.afterCrash ?? "brake";
  const endSec = trace.samples[trace.samples.length - 1].tSec;
  return () => {
    const now = {} as TracePoint;
    const ahead = {} as TracePoint;
    let prevKmh = 0;
    let crashed = false;
    return (st) => {
      if (prevKmh - st.speedKmh > crashDrop && after !== "carry-on") crashed = true;
      prevKmh = st.speedKmh;
      if (crashed) return after === "release" ? { throttle: 0, brake: 0, steer: 0 } : { throttle: 0, brake: 1, steer: 0 };
      const t = st.step * H;
      if (t >= endSec) return { throttle: 0, brake: 1, steer: 0 };
      sampleAt(trace, t, now);
      sampleAt(trace, t + lookSec, ahead);
      const hx = Math.sin((st.headingDeg * Math.PI) / 180);
      const hy = Math.cos((st.headingDeg * Math.PI) / 180);
      const dx = ahead.x - st.x;
      const dy = ahead.y - st.y;
      const reach = Math.hypot(dx, dy);
      // The bearing to the look-ahead point; closer than 2.5 m the tape's own
      // heading (a standing or crawling tape gives no usable bearing).
      const wantDeg = reach > 2.5 ? (Math.atan2(dx, dy) * 180) / Math.PI : ahead.headingDeg;
      let err = (wantDeg - st.headingDeg) % 360;
      if (err > 180) err -= 360;
      else if (err < -180) err += 360;
      // + = the target lies clockwise = to the RIGHT; steer + = LEFT.
      const steer = Math.max(-1, Math.min(1, -err / 22));
      // Along-track error: how far the tape's «now» is ahead of the car.
      const along = (now.x - st.x) * hx + (now.y - st.y) * hy;
      const wantKmh = Math.max(0, now.speedKmh + Math.max(-8, Math.min(8, along * 2.2)));
      const dv = wantKmh - st.speedKmh;
      if (wantKmh < 0.8 && st.speedKmh < 2) return { throttle: 0, brake: 0.7, steer };
      if (dv >= 0) return { throttle: Math.min(1, dv / 6 + 0.12), brake: 0, steer };
      return { throttle: 0, brake: Math.min(1, -dv / 6), steer };
    };
  };
}

/**
 * A closed-loop driver that follows a tape's PATH — not its clock: pure
 * pursuit on the polyline the tape drew, at speeds this driver chooses. The
 * rig drives of sc-roundabout-entry:08a0b701 were of this shape (rig-w3d
 * «L4 V18 H1776 …»): approach, a ramped stop at `holdAtY` well short of the
 * give-way line, HOLD until physics step `goStep`, then enter at `cruiseKmh`
 * whatever is in the ring — the wrong-timing cells. Decided from the car after
 * the previous step only; it never looks at the traffic, so one `goStep` is
 * one trajectory on every cadence up to the first contact. After a contact it
 * carries on along the path at the same speed, as the rig's script did.
 */
export function followPath(
  trace: ScenarioTrace,
  o: { holdAtY: number; goStep: number; cruiseKmh: number; approachKmh?: number },
): () => (st: DriveState) => Partial<VehicleInput> {
  // The tape's path, thinned to points at least 0.4 m apart.
  const path: Array<{ x: number; y: number }> = [];
  for (const s of trace.samples) {
    const last = path[path.length - 1];
    if (!last || Math.hypot(s.x - last.x, s.y - last.y) >= 0.4) path.push({ x: s.x, y: s.y });
  }
  const approachKmh = o.approachKmh ?? 25;
  return () => {
    let at = 0;
    let going = false;
    return (st) => {
      // Progress along the path: the nearest point at or after the last one.
      let best = at;
      let bestD = Infinity;
      for (let i = at; i < Math.min(path.length, at + 60); i++) {
        const d = Math.hypot(path[i].x - st.x, path[i].y - st.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      at = best;
      const speedMps = Math.abs(st.speedKmh) / 3.6;
      const reach = 3.5 + 0.35 * speedMps;
      let look = at;
      let run = 0;
      while (look + 1 < path.length && run < reach) {
        run += Math.hypot(path[look + 1].x - path[look].x, path[look + 1].y - path[look].y);
        look++;
      }
      const dx = path[look].x - st.x;
      const dy = path[look].y - st.y;
      let err = ((Math.atan2(dx, dy) * 180) / Math.PI - st.headingDeg) % 360;
      if (err > 180) err -= 360;
      else if (err < -180) err += 360;
      const steer = Math.hypot(dx, dy) > 1 ? Math.max(-1, Math.min(1, -err / 22)) : 0;
      if (!going && st.step >= o.goStep) going = true;
      let wantKmh: number;
      if (going) wantKmh = look + 1 >= path.length ? 0 : o.cruiseKmh;
      else wantKmh = Math.max(0, Math.min(approachKmh, (o.holdAtY - st.y) * 2.2));
      const dv = wantKmh - st.speedKmh;
      if (wantKmh < 0.8 && st.speedKmh < 2) return { throttle: 0, brake: 0.7, steer };
      if (dv >= 0) return { throttle: Math.min(1, dv / 6 + 0.12), brake: 0, steer };
      return { throttle: 0, brake: Math.min(1, -dv / 6), steer };
    };
  };
}
