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
 *  · THE GRADE — LessonScene's own `gradeGrid.stepPhysics(…)` call, cut out of
 *    the scene and executed (the house pattern of live-grade-call.execution),
 *    on the lesson's live world (`buildLiveWorld`), and every tick it hands
 *    `onTick` folded by the real `applyTick` into the real session, closed by
 *    `buildLessonResult`: the SHEET.
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
 * the cabin (every discrete channel is a belted car in D), NpcColliders' shells
 * (the staged escort rides the other lane and the sentinel grades it), the
 * camera, audio and haptics (counted, not played).
 */
import RAPIER from "../../../../../../node_modules/@react-three/rapier/node_modules/@dimforge/rapier3d-compat";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidElement, type ReactElement } from "react";
import { CuboidCollider, RigidBody, TrimeshCollider } from "@react-three/rapier";
import ts from "typescript";
import * as Rig from "@/components/sim/VehicleRig";
import { readNpcColliderUserData } from "@/components/sim/NpcColliders";
import { hittableObstacleBodies, liveContactBodies, nameLiveContact } from "@/components/sim/LessonScene";
import { obstacleYawRad, PROP_COLLIDERS } from "@/components/sim/ScenarioObstacles";
import { sessionClockAdvance } from "@/components/sim/lesson-ui/sessionClock";
import { playerObb } from "../../../collision";
import type { LessonSpec, VehicleSample } from "../../../contracts";
import { directorContactCast } from "../../../orchestrator/director";
import { vruAheadMeters } from "../../../orchestrator/contact";
import type { SimTick } from "../../../rules/types";
import { createAttemptFeedState, feedAttemptPoint } from "../../../scene/attemptFeed";
import { createGradeGridSample, GradeGrid } from "../../../scene/gradeGrid";
import { buildLessonWorldCore } from "../../../scene/lessonWorldRecipe";
import {
  NO_PHYSICS_STEPS,
  PhysicsSessionClock,
  PlayerStepTrackRecorder,
  recordPhysicsStep,
  type PhysicsStepState,
} from "../../../traffic";
import { createHeadlessChassis, IDLE_INPUT, VehicleSim, type VehicleInput } from "../../../vehicle";
import { READY_DRIVELINE } from "../../../vehicle/driveline";
import * as T from "../../../vehicle/tuning";
import { WorldColliders, type WorldColliderSet } from "../../../world";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import type { LessonResult, LessonSessionState } from "../../types";
import { buildLiveWorld } from "./liveChainReplay";

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

/** Names the scene's call may read — a SUPERSET of what any version of it
 *  reads (an unused parameter is harmless; a missing one throws). */
const SCENE_NAMES = [
  "gradeGrid",
  "stepTrackRef",
  "tRef",
  "sample",
  "runtime",
  "traffic",
  "director",
  "conditions",
  "inputRef",
  "hazardActiveRef",
  "telltaleLitRef",
  "onTelltale",
  "recorder",
  "telltaleCautionLitRef",
  "onTelltaleCaution",
  "onStagedOutcome",
  "onTick",
  "onNearMiss",
  "cabinRef",
  "attemptFeedRef",
  "feedAttemptPoint",
  "simRef",
  "contactListenerRef",
  "NO_PHYSICS_STEPS",
  "vruAheadMeters",
  "directorContactCast",
] as const;
type SceneName = (typeof SCENE_NAMES)[number];
type SceneCall = (...args: unknown[]) => number;

let sceneCallCache: SceneCall | null = null;
/** LessonScene's `const steps = …` and `gradeGrid.stepPhysics(…)`, compiled. */
function sceneGradeCall(): SceneCall {
  if (sceneCallCache) return sceneCallCache;
  const text = source("components/sim/LessonScene.tsx");
  const sf = ts.createSourceFile("LessonScene.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls: ts.CallExpression[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === "gradeGrid.stepPhysics") calls.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (calls.length !== 1) throw new Error(`expected one gradeGrid.stepPhysics call, found ${calls.length}`);
  let body: ts.Block | null = null;
  for (let p: ts.Node | undefined = calls[0].parent; p; p = p.parent) {
    if (ts.isBlock(p) && (ts.isArrowFunction(p.parent) || ts.isFunctionExpression(p.parent))) {
      body = p;
      break;
    }
  }
  if (!body) throw new Error("the stepPhysics call is not inside a function body");
  const decl = body.statements.find(
    (st): st is ts.VariableStatement =>
      ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => d.name.getText(sf) === "steps"),
  );
  if (!decl) throw new Error("no `steps` declaration beside the call");
  const js = ts.transpileModule(`${decl.getText(sf)}\nreturn (${calls[0].getText(sf)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  sceneCallCache = new Function(...SCENE_NAMES, `"use strict";\n${js}`) as SceneCall;
  return sceneCallCache;
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
// The drive
// ───────────────────────────────────────────────────────────────────────────

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
  const sim = new VehicleSim(world as never, body as never);

  const { runtime, traffic, director } = buildLiveWorld(lesson, raw);
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
          const c = contact as { step: number; impactKmh: number };
          judged.push({
            path: "step",
            bookedStep: c.step,
            impactKmh: graded ? impact : c.impactKmh,
            withWhat: what,
            graded,
          });
        }
      : null,
  };

  /** The grid point whose tick ended the session (-1: it did not end). */
  let endedAtPoint = -1;
  const onTick = (tick: SimTick) => {
    if (!live()) return;
    // The comparison closes at ONE grid point on every cadence: a frame may
    // carry the drive past `maxSteps`, and the session must not hear those.
    if (Math.round(tick.t / H) > opts.maxSteps) return;
    session = applyTick(session, tick).state;
    if (!live()) endedAtPoint = Math.round(tick.t / H);
  };
  const noop = () => {};
  const args: Record<SceneName, unknown> = {
    gradeGrid,
    stepTrackRef: { current: steps },
    tRef,
    sample,
    runtime,
    traffic,
    director,
    conditions: NO_WEATHER,
    inputRef: { current: { rawBrake: 0, rawThrottle: 0 } },
    hazardActiveRef: { current: false },
    telltaleLitRef: { current: false },
    onTelltale: noop,
    recorder: null,
    telltaleCautionLitRef: { current: false },
    onTelltaleCaution: noop,
    onStagedOutcome: noop,
    onTick,
    onNearMiss: noop,
    cabinRef: { current: null },
    attemptFeedRef: { current: createAttemptFeedState() },
    feedAttemptPoint,
    simRef: { current: sim },
    contactListenerRef,
    NO_PHYSICS_STEPS,
    vruAheadMeters,
    directorContactCast,
  };
  const run = sceneGradeCall();
  const ordered = SCENE_NAMES.map((n) => args[n]);

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
      // before-step: the drive's decision from the car after the previous step
      const input = { ...IDLE_INPUT, ...opts.control(drive) };
      sim.update(input, H, READY_DRIVELINE);
      world.step(eventQueue);
      // after-step: VehicleRig's callback
      recordPhysicsStep(steps, body, sim);
      steps.stateAtStep(steps.stepCount, st);
      drive.step = steps.stepCount;
      drive.x = st.x;
      drive.y = st.y;
      drive.headingDeg = st.headingDeg;
      drive.speedKmh = st.speedKmh;
      speedAfterStep.push(st.speedKmh);
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
    // RuntimeDriver: the clock line, then the scene's call.
    tRef.current = sessionClock.frame(sessionClockAdvance(delta), steps.stepCount);
    run(...ordered);
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
