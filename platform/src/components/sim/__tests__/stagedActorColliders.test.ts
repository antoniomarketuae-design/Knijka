/**
 * O31 — THE SHELL AND THE BODY THE STUDENT SEES.
 *
 * The audit routed this lane as "staged actors carry no collider in the
 * browser — the player drives through the oncoming car, the braking lead, the
 * cut-in truck and the officer", with the stated mechanism that
 * `NpcColliders` pools its shells over `traffic.vehicles`, "the AMBIENT
 * fleet", while staged actors are "a different collection entirely".
 *
 * ── THAT MECHANISM IS FALSE, AND THIS FILE PINS IT SO IT IS NOT RE-ROUTED ──
 *
 * `TrafficSystem.stage()` pushes every staged actor's state into the SAME
 * `vehicles` / `pedestrians` arrays the shell pool scans, `traffic/types.ts`
 * says so out loud in the staged-actor header ("Staged actors publish into the
 * same `vehicles` / `pedestrians` state arrays"), and `LessonScene` hands ONE
 * traffic system to both the director and `NpcColliders`. A staged actor is
 * shell-eligible from the frame it is staged on. Driven below rather than read.
 *
 * ── WHAT IS ACTUALLY BROKEN, MEASURED ON THIS HARNESS ──
 *
 * The shell was ONE SIZE — 0.92 × 2.10 m — for a fleet that is not. Driving
 * the real `VehicleSim` into a kinematic shell, the player's nose ended up
 * this far inside the body he can SEE:
 *
 *   body            one-size shell     profile-sized shell
 *   braking lead      0.15 m             0.15 m   (a car was always right)
 *   oncoming car      0.09 m             0.09 m
 *   cut-in truck      1.80 m INSIDE      0.15 m
 *   tram              4.99 m INSIDE      0.15 m
 *
 * …and the same constant pointing the other way, which is the founder's own
 * false-failure complaint at cyclist scale: the 0.23 × 0.90 m bicycle wore
 * that same 0.92 × 2.10 m box, so passing one needed 1.77 m between centres
 * where the bicycle itself needs 1.08 m. A player passing a staged cyclist at
 * 1.20 m of real clearance was STOPPED DEAD by air — and being stopped like
 * that fires `VehicleRig.onCollisionEnter`, so he is billed «сблъсък» with a
 * cyclist he never touched. One constant, both crimes.
 *
 * Every number above is PRODUCED by the `driveInto` harness here, not quoted:
 * the retired size is handed to the same harness as the mutation, so each
 * assertion below fails the moment the shell goes back to one size.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT CLAIM. The officer's shell is a
 * pedestrian capsule of exactly `PEDESTRIAN_BODY_RADIUS_M`, which always
 * matched the grading disc, so he IS a body and the car halts at him (driven
 * below). That he is not GRADED is a stated policy in `runners.ts`
 * (`TrafficControllerRunner.contactCast` is empty "by policy, not by
 * oversight" — billing it "means deciding what running down a traffic officer
 * grades as"), and a physics lane does not overturn a content ruling.
 */

import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fitVehicleShell, npcShellHalfExtents } from "../NpcColliders";
import * as T from "@/modules/sim/vehicle/tuning";
import { READY_DRIVELINE } from "@/modules/sim/vehicle/driveline";
import { createHeadlessChassis, IDLE_INPUT, VehicleSim } from "@/modules/sim/vehicle";
import {
  actorObb,
  PEDESTRIAN_BODY_RADIUS_M,
} from "@/modules/sim/collision";
import {
  createTrafficSystem,
  VEHICLE_PROFILE_LENGTH_M,
  vehicleHalfLengthM,
  type TrafficDistrict,
  type VehicleProfile,
} from "@/modules/sim/traffic";

const DRIVE = { ...READY_DRIVELINE };
/** The shell's half-height — presentation-only, mirrored from the component. */
const SHELL_HALF_H = 0.7;
/**
 * THE RETIRED ONE-SIZE SHELL: the mutation every drive below is run against.
 *
 * A LOCAL LITERAL, not an import, and that is the point. These two numbers
 * shipped as `NPC_VEHICLE_SHELL_HALF_*_M` in `collision/bodies.ts` and were
 * deleted with the naming lane, because a constant describing a body the
 * product no longer builds is precisely what the next resize leaves behind —
 * twice now. A retired size belongs in the test that disproves it and nowhere
 * else.
 */
const ONE_SIZE = { halfWidthM: 0.92, halfLengthM: 2.1 } as const;

beforeAll(async () => {
  await RAPIER.init();
});

// ---------------------------------------------------------------------------
// A. THE SIZE COMES FROM THE GRADING BOX, NOT FROM A SECOND TABLE
// ---------------------------------------------------------------------------

const ALL_PROFILES = Object.keys(VEHICLE_PROFILE_LENGTH_M) as VehicleProfile[];
const SIZING_POSE = { x: 0, y: 0, dirX: 0, dirY: 1 };

describe("the shell is sized from the same source as the grading box", () => {
  it("matches actorObb for every profile in the LIVE table, ambient included", () => {
    // The loop walks the TABLE rather than a list written here, so a profile
    // added to the fleet without a shell size cannot slip past, and a rig
    // resize has to move both sides in one commit.
    for (const p of [...ALL_PROFILES, undefined]) {
      const want = actorObb(SIZING_POSE, p);
      const got = npcShellHalfExtents(p);
      expect(got.halfWidthM, `${p ?? "ambient"} half-width`).toBe(want.halfWidthM);
      expect(got.halfLengthM, `${p ?? "ambient"} half-length`).toBe(want.halfLengthM);
    }
    // An absent profile is an AMBIENT agent and must read exactly "car" — the
    // default every other reader of that table already applies.
    expect(npcShellHalfExtents(undefined)).toEqual(npcShellHalfExtents("car"));
  });

  it("is not one size — the retired constants are wrong for the bodies O31 names", () => {
    // THE MUTATION. Put `npcShellHalfExtents` back on the retired constants
    // and all four of these fail. They are the exact gaps the drives measure.
    const truck = npcShellHalfExtents("truck");
    const tram = npcShellHalfExtents("tram");
    const bike = npcShellHalfExtents("cyclist");
    expect(truck.halfLengthM - ONE_SIZE.halfLengthM).toBeCloseTo(1.65, 6);
    expect(tram.halfLengthM - ONE_SIZE.halfLengthM).toBeCloseTo(4.9, 6);
    expect(ONE_SIZE.halfLengthM - bike.halfLengthM).toBeCloseTo(1.2, 6);
    expect(ONE_SIZE.halfWidthM - bike.halfWidthM).toBeCloseTo(0.69, 6);
  });
});

// ---------------------------------------------------------------------------
// B. THE ROUTED PREMISE — CHECKED RATHER THAN INHERITED
// ---------------------------------------------------------------------------

function district(id: string): TrafficDistrict {
  const p = fileURLToPath(new URL(`../../../../../content/world/${id}.json`, import.meta.url));
  return JSON.parse(readFileSync(p, "utf8")) as TrafficDistrict;
}

describe("staged actors ARE in the arrays the shell pool scans", () => {
  it("stage() publishes into traffic.vehicles / traffic.pedestrians, with the profile", () => {
    const tr = createTrafficSystem(district("district-v1"), {
      seed: 7,
      vehicleCount: 3,
      pedestrianCount: 2,
      anchor: { x: 0, y: 0 },
      anchorRadiusM: 300,
    });
    const vehBefore = tr.vehicles.length;
    const pedBefore = tr.pedestrians.length;
    const truck = tr.stage({
      kind: "vehicle",
      id: "truck",
      pathNodes: [],
      railPath: [
        { x: 0, y: 60 },
        { x: 0, y: -60 },
      ],
      hold: { nodeIndex: 0, offsetM: 10 },
      cruiseSpeedMps: 0,
      profile: "truck",
    });
    const officer = tr.stage({
      kind: "pedestrian",
      id: "officer",
      path: [
        { x: 4, y: 20 },
        { x: 5.5, y: 20 },
      ],
      speedMps: 0,
      pose: "directTraffic",
    });
    expect(truck).not.toBeNull();
    expect(officer).not.toBeNull();
    // These are the very arrays `selectNearest` sweeps in the frame loop, and
    // the truck publishes the profile the shell is now fitted from.
    expect(tr.vehicles.length).toBe(vehBefore + 1);
    expect(tr.pedestrians.length).toBe(pedBefore + 1);
    expect(tr.vehicles[tr.vehicles.length - 1].profile).toBe("truck");
  });
});

// ---------------------------------------------------------------------------
// C. THE DRIVE — the real VehicleSim into a kinematic shell moved the way the
//    component moves one (setNextKinematicTranslation; the teleport branch is
//    a rebind, which never happens mid-approach here).
// ---------------------------------------------------------------------------

interface Drive {
  /** Deepest the player's NOSE got past the VISIBLE body's near face, m.
   *  Positive = inside the vehicle the student can see. */
  intoVisibleM: number;
  finalKmh: number;
  travelledM: number;
}

function driveInto(opts: {
  /** The body the student sees (sizes the "did he go inside it" ruler). */
  profile: VehicleProfile;
  /** The half-extents the shell is MOUNTED with — the mutation lever. */
  shell: { halfWidthM: number; halfLengthM: number };
  aheadM: number;
  lateralM: number;
  /** The shell's closing speed toward the player, m/s (0 = standing). */
  closingMps: number;
  driveKmh: number;
  seconds?: number;
  /**
   * Re-fit the mounted collider to this profile through the COMPONENT'S OWN
   * `fitVehicleShell` before the approach — the browser's actual sequence (a
   * shell mounts at the car size and is re-fitted on the frame it binds an
   * agent). This is what proves the live shape swap is not inert.
   */
  refit?: VehicleProfile;
}): Drive {
  const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
  world.timestep = T.FIXED_DT;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1),
  );
  const body = createHeadlessChassis(RAPIER, world);
  const sim = new VehicleSim(world, body);

  let shellX = T.SPAWN.x + opts.aheadM;
  const shellZ = T.SPAWN.z + opts.lateralM;
  // YAWED 90°, on purpose. The component mounts [halfWidth, h, halfLength] on
  // a body it then yaws to the agent's heading, and `fitVehicleShell` writes
  // half-extents in THAT layout. A harness that mounted the box on its own
  // axes could not call the real function without re-doing its work — which is
  // precisely how a mutation to the real function goes unnoticed. So the body
  // here is yawed π/2 (local +Z → world +X, the player's travel direction) and
  // every extent below is the component's own.
  const shellBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(shellX, SHELL_HALF_H, shellZ)
      .setRotation({ x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(opts.shell.halfWidthM, SHELL_HALF_H, opts.shell.halfLengthM)
      .setFriction(0.5)
      .setRestitution(0.05),
    shellBody,
  );
  if (opts.refit !== undefined) {
    // The REAL function, on the real body, with nothing added afterwards: if
    // it stops reaching rapier, this drive changes.
    fitVehicleShell(shellBody, opts.refit, { x: 0, y: 0, z: 0 });
  }

  for (let i = 0; i < 60; i++) {
    sim.update(IDLE_INPUT, T.FIXED_DT, DRIVE);
    world.step();
  }

  const visibleHalfL = vehicleHalfLengthM(opts.profile);
  const visibleHalfW = actorObb(SIZING_POSE, opts.profile).halfWidthM;
  let intoVisibleM = Number.NEGATIVE_INFINITY;
  const steps = Math.round((opts.seconds ?? 10) * 60);
  for (let i = 0; i < steps; i++) {
    const throttle = sim.speedKmh < opts.driveKmh ? 1 : 0;
    sim.update({ ...IDLE_INPUT, throttle }, T.FIXED_DT, DRIVE);
    if (opts.closingMps !== 0) {
      shellX -= opts.closingMps * T.FIXED_DT;
      shellBody.setNextKinematicTranslation({ x: shellX, y: SHELL_HALF_H, z: shellZ });
    }
    world.step();
    const st = sim.debugState();
    const nose = st.position.x + T.CHASSIS_HALF_EXTENTS.z;
    // "Inside" only counts while the two bodies are abreast AND the nose has
    // not come out the far end — a ruler that scored a clean pass as a
    // penetration would be the reassuring lie this project keeps finding.
    const abreast = Math.abs(st.position.z - shellZ) < visibleHalfW + T.CHASSIS_HALF_EXTENTS.x;
    if (abreast && nose < shellX + visibleHalfL) {
      intoVisibleM = Math.max(intoVisibleM, nose - (shellX - visibleHalfL));
    }
  }
  const finalKmh = sim.speedKmh;
  const travelledM = sim.debugState().position.x - T.SPAWN.x;
  sim.dispose();
  world.free();
  return { intoVisibleM, finalKmh, travelledM };
}

describe("the player is STOPPED by the body he can see", () => {
  it("braking lead: a standing car halts him, and always did", () => {
    const r = driveInto({
      profile: "car",
      shell: npcShellHalfExtents("car"),
      aheadM: 40,
      lateralM: 0,
      closingMps: 0,
      driveKmh: 30,
    });
    expect(r.finalKmh).toBeLessThan(1); // stopped
    expect(r.intoVisibleM).toBeGreaterThan(0); // …and it really did reach him
    expect(r.intoVisibleM).toBeLessThan(0.25); // centimetres of solver overlap
  });

  it("oncoming car: a shell closing at 11 m/s halts him too", () => {
    const r = driveInto({
      profile: "car",
      shell: npcShellHalfExtents("car"),
      aheadM: 40,
      lateralM: 0,
      closingMps: 11,
      driveKmh: 50,
      seconds: 6,
    });
    expect(r.intoVisibleM).toBeGreaterThan(0);
    expect(r.intoVisibleM).toBeLessThan(0.25);
    // ~25 m/s of closing throws him BACKWARDS — the one thing a ghost cannot do.
    expect(r.finalKmh).toBeLessThan(0);
  });

  it("cut-in truck: 1.80 m of drive-through, closed", () => {
    const shipped = driveInto({
      profile: "truck",
      shell: ONE_SIZE,
      aheadM: 40,
      lateralM: 0,
      closingMps: 0,
      driveKmh: 50,
    });
    const fixed = driveInto({
      profile: "truck",
      shell: npcShellHalfExtents("truck"),
      aheadM: 40,
      lateralM: 0,
      closingMps: 0,
      driveKmh: 50,
    });
    // THE MUTATION, run rather than quoted: the one-size shell parks the
    // student's nose the better part of two metres inside a truck.
    expect(shipped.intoVisibleM).toBeGreaterThan(1.6);
    expect(fixed.intoVisibleM).toBeLessThan(0.25);
    expect(fixed.finalKmh).toBeLessThan(1);
  });

  it("…and the live re-fit is what does it — a CAR-mounted shell, refitted", () => {
    // THE MECHANISM, not the arithmetic. Every other drive here hands rapier a
    // correctly sized collider at creation, which would stay green even if
    // `collider.setHalfExtents` were inert and every browser kept the car box.
    // This one mounts the car size, re-fits it through the component's own
    // `fitVehicleShell`, and must then behave like the truck.
    const refitted = driveInto({
      profile: "truck",
      shell: npcShellHalfExtents("car"),
      refit: "truck",
      aheadM: 40,
      lateralM: 0,
      closingMps: 0,
      driveKmh: 50,
    });
    expect(refitted.intoVisibleM).toBeLessThan(0.25);
    expect(refitted.finalKmh).toBeLessThan(1);
  });

  it("tram: 4.99 m of drive-through, closed", () => {
    const shipped = driveInto({
      profile: "tram",
      shell: ONE_SIZE,
      aheadM: 44,
      lateralM: 0,
      closingMps: 0,
      driveKmh: 50,
    });
    const fixed = driveInto({
      profile: "tram",
      shell: npcShellHalfExtents("tram"),
      aheadM: 44,
      lateralM: 0,
      closingMps: 0,
      driveKmh: 50,
    });
    expect(shipped.intoVisibleM).toBeGreaterThan(4.5);
    expect(fixed.intoVisibleM).toBeLessThan(0.25);
    expect(fixed.finalKmh).toBeLessThan(1);
  });

  it("the officer: a pedestrian capsule of the grading radius halts him", () => {
    // The ped shell is a capsule, not a cuboid, so it gets its own drive.
    const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
    world.timestep = T.FIXED_DT;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1),
    );
    const body = createHeadlessChassis(RAPIER, world);
    const sim = new VehicleSim(world, body);
    const officerX = T.SPAWN.x + 30;
    const ped = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        officerX,
        0.55 + PEDESTRIAN_BODY_RADIUS_M,
        T.SPAWN.z,
      ),
    );
    world.createCollider(
      RAPIER.ColliderDesc.capsule(0.55, PEDESTRIAN_BODY_RADIUS_M).setFriction(0.6),
      ped,
    );
    for (let i = 0; i < 60; i++) {
      sim.update(IDLE_INPUT, T.FIXED_DT, DRIVE);
      world.step();
    }
    for (let i = 0; i < 60 * 10; i++) {
      const throttle = sim.speedKmh < 30 ? 1 : 0;
      sim.update({ ...IDLE_INPUT, throttle }, T.FIXED_DT, DRIVE);
      world.step();
    }
    const nose = sim.debugState().position.x + T.CHASSIS_HALF_EXTENTS.z;
    const finalKmh = sim.speedKmh;
    sim.dispose();
    world.free();
    // He is a body: the car halts at his surface instead of passing through.
    expect(finalKmh).toBeLessThan(1);
    expect(nose).toBeLessThan(officerX);
    expect(nose).toBeGreaterThan(officerX - 1);
  });
});

// ---------------------------------------------------------------------------
// D. THE OTHER DIRECTION — a false failure is as bad as a false certificate
// ---------------------------------------------------------------------------

describe("…and he is NOT stopped by air", () => {
  it("passes a staged cyclist at 1.20 m of real clearance", () => {
    // 1.20 m between centres. The bicycle needs 1.08 m (0.23 + the player's
    // 0.85); the one-size shell demanded 1.77 m.
    const bike = npcShellHalfExtents("cyclist");
    expect(bike.halfWidthM + T.CHASSIS_HALF_EXTENTS.x).toBeLessThan(1.2);
    expect(ONE_SIZE.halfWidthM + T.CHASSIS_HALF_EXTENTS.x).toBeGreaterThan(1.2);

    const shipped = driveInto({
      profile: "cyclist",
      shell: ONE_SIZE,
      aheadM: 40,
      lateralM: 1.2,
      closingMps: 0,
      driveKmh: 30,
    });
    const fixed = driveInto({
      profile: "cyclist",
      shell: bike,
      aheadM: 40,
      lateralM: 1.2,
      closingMps: 0,
      driveKmh: 30,
    });
    // THE MUTATION: the shipped box stopped him dead in clear air — and a stop
    // like that IS an onCollisionEnter, i.e. a graded «сблъсък» with a cyclist
    // he never touched. That is the founder's own complaint, at bicycle scale.
    expect(shipped.finalKmh).toBeLessThan(1);
    expect(shipped.travelledM).toBeLessThan(45);
    // …and against the bicycle's own body he rides past it, still at speed.
    expect(fixed.finalKmh).toBeGreaterThan(25);
    expect(fixed.travelledM).toBeGreaterThan(70);
  });
});
