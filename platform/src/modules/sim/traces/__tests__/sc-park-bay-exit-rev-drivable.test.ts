/**
 * sc-park-bay-exit-rev:49af2940 — THE DEMO MUST BE A DRIVE THE PRODUCT CAR CAN
 * PERFORM, end to end, and it must complete the lesson it demonstrates.
 *
 * THE ROW: «This lesson has never once been observed WORKING». The root the
 * triage found: the authored blue-shadow reverse swung out of the bay on a
 * 3.03 m car-centre quarter arc (the kinematic recorder pivots the car about its
 * centre), tighter than the product car can turn — so the demo showed the
 * student a manoeuvre no real car, and no steering instrument, can follow.
 *
 * WHAT IS PINNED HERE (each one red on the 3.03 m arc):
 *
 *  1. THE CAR'S LIMIT, derived, never typed in: the kinematic bicycle limit from
 *     the vehicle model itself (wheelbase = WHEEL_POSITIONS front z − rear z =
 *     2.56 m, rear axle 1.28 m behind the body centre, STEER_MAX_ANGLE 0.6 rad ⇒
 *     rear-axle radius L / tan 0.6 = 3.74 m, body-centre radius √(3.74² + 1.28²)
 *     = 3.95 m) AND the physics car's own full-lock reverse circle, measured
 *     here on the headless VehicleSim at walking pace (≈ 4.17 m centre). The
 *     binding limit is the larger of the two.
 *  2. CURVATURE: the recorded shadow's body-centre path, measured over every
 *     1 m of travel, never turns tighter than 1.05 × that limit.
 *  3. STEERABILITY: the same path driven by a real car (the non-holonomic
 *     bicycle: the rear axle can only roll along the body, so the body heading
 *     is RECOVERED from the centre path, not assumed equal to its tangent)
 *     never needs more wheel than the limit allows.
 *  4. CLEARANCE ≥ 0.25 m from every parked car, as the PRODUCT's collision
 *     boxes see them: the headless gate's table (0.9 × 2.25 half extents) AND
 *     the live scene's per-model GLB boxes (ScenarioObstacles: each occupied
 *     bay i is model FLEET[assignCivilianModel(i)], sized by its measured rig
 *     extents), taken as the per-axis envelope — for BOTH the recorded pose
 *     (what the trace gate replays) and the bicycle pose (what a real car on
 *     this path occupies).
 *  5. CONTINUITY: the heading never jumps, and the car is at rest wherever the
 *     gear changes.
 *  6. COMPLETION ON THE LIVE RUNG CHAIN (./liveChainReplay — compileScenario at
 *     L1–L5, the rung's own cast, LessonScene's traffic, applyTick, the debrief):
 *     both tasks, in order, 0 т., no COLLISION, ИЗДЪРЖАН — with the live parked
 *     boxes standing in for rapier's ScenarioObstacles contact.
 *  7. EVERY MISTAKE DEMO STILL COMMITS ITS MISTAKE at every rung, over the
 *     shadow's own path, and never by clipping a parked car.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { obbSeparationM, type Obb2D } from "../../collision";
import type { StagedEventSpec } from "../../contracts";
import { compileScenario } from "../../lessons/scenario/compile";
import { SC_PARK_BAY_EXIT_REV } from "../../lessons/scenario/templates-parking2";
import type { ScenarioLevel } from "../../lessons/scenario/types";
import { liveChainReplay, type LiveReplayOutcome } from "../../lessons/scenario/__tests__/liveChainReplay";
import { assignCivilianModel, FLEET } from "../../traffic/vehicleFleet";
import * as T from "../../vehicle/tuning";
import { READY_DRIVELINE } from "../../vehicle/driveline";
import { createHeadlessChassis, IDLE_INPUT, VehicleSim } from "../../vehicle/VehicleSim";
import { recordScriptedDrive, type RecordedDrive } from "../recorder";
import {
  lotObstacleRects,
  PBE_DRIVE_X,
  PBE_KINEMATIC_CENTRE_RADIUS_M,
  PBE_MIN_CENTRE_RADIUS_M,
  PBE_REVERSE_END,
  recordScParkBayExitRevDrive,
  scParkBayExitRevMistakeBlindScript,
  scParkBayExitRevMistakeSwingScript,
  scParkBayExitRevShadowScript,
  SC_PARK_BAY_EXIT_REV_ID,
  type ScParkBayExitRevTraceName,
} from "../scParkBayExitRev";
import type { TraceSample } from "../types";
import { KINEMATIC_CENTRE_RADIUS_M, windowedMinRadius } from "./demoCurvature";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RAW: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "lot-perp-v1.json"), "utf-8"),
);
const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];
const NAMES: readonly ScParkBayExitRevTraceName[] = [
  "shadow-correct",
  "mistake-blind-reverse",
  "mistake-swing-out",
];
const DRIVES = new Map<ScParkBayExitRevTraceName, RecordedDrive>(
  NAMES.map((n) => [n, recordScParkBayExitRevDrive(RAW, n)]),
);
const SHADOW = DRIVES.get("shadow-correct")!;

// ---------------------------------------------------------------------------
// 1. The car's limit — from the vehicle model, never typed in
// ---------------------------------------------------------------------------

/** Wheelbase of the product car, m (tuning.ts WHEEL_POSITIONS: FL z − RL z). */
const WHEELBASE_M = T.WHEEL_POSITIONS[0].z - T.WHEEL_POSITIONS[2].z;
/** Rear axle behind the body centre, m — the bicycle model's no-slip point. */
const REAR_AXLE_M = -T.WHEEL_POSITIONS[2].z;
const KIN_REAR_RADIUS_M = WHEELBASE_M / Math.tan(T.STEER_MAX_ANGLE);
const KIN_CENTRE_RADIUS_M = Math.hypot(KIN_REAR_RADIUS_M, REAR_AXLE_M);
/** The margin the authored demo keeps over the binding limit. */
const RADIUS_MARGIN = 1.05;
/** Clearance the demo keeps to every parked car, m. */
const CLEARANCE_FLOOR_M = 0.25;

let physCentreRadiusM = Number.NaN;

/** Full-lock REVERSE circle of the headless VehicleSim at walking pace —
 *  the parking-envelope harness's measurement, held at ≤ 4 km/h (the demo's
 *  reverse speed) instead of 6.5. Body-centre radius = path bbox / 4. */
function measurePhysicsReverseRadius(): number {
  const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
  world.timestep = T.FIXED_DT;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1),
  );
  const sim = new VehicleSim(world, createHeadlessChassis(RAPIER, world));
  const dl = { ...READY_DRIVELINE, selector: "R" as const };
  const step = (steer: number) => {
    const throttle = Math.abs(sim.speedKmh) < 4 ? 0.35 : 0;
    sim.update({ ...IDLE_INPUT, steer, throttle }, T.FIXED_DT, dl);
    world.step();
  };
  for (let i = 0; i < 60; i++) step(0);
  for (let i = 0; i < 180; i++) step(1);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let turned = 0;
  let prev: number | null = null;
  for (let i = 0; i < 60 * 90 && turned < Math.PI * 2.05; i++) {
    step(1);
    const d = sim.debugState();
    minX = Math.min(minX, d.position.x);
    maxX = Math.max(maxX, d.position.x);
    minZ = Math.min(minZ, d.position.z);
    maxZ = Math.max(maxZ, d.position.z);
    const q = d.rotation;
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
    if (prev !== null) {
      let dy = yaw - prev;
      if (dy > Math.PI) dy -= 2 * Math.PI;
      if (dy < -Math.PI) dy += 2 * Math.PI;
      turned += Math.abs(dy);
    }
    prev = yaw;
  }
  sim.dispose();
  world.free();
  if (turned < Math.PI * 2) throw new Error("physics full-lock circle never closed");
  return (maxX - minX + (maxZ - minZ)) / 4;
}

beforeAll(async () => {
  await RAPIER.init();
  physCentreRadiusM = measurePhysicsReverseRadius();
});

/** The binding body-centre limit: the larger of the kinematic and physics radii. */
const limitCentreRadius = () => Math.max(KIN_CENTRE_RADIUS_M, physCentreRadiusM);
/** The same limit for the rear axle (the bicycle's steering reference). */
const limitRearRadius = () => Math.sqrt(limitCentreRadius() ** 2 - REAR_AXLE_M ** 2);

// ---------------------------------------------------------------------------
// Measurement helpers (the windowed curvature is shared with the census: ./demoCurvature)
// ---------------------------------------------------------------------------

const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

interface BicyclePose {
  tSec: number;
  x: number;
  y: number;
  headingDeg: number;
  /** Rear-axle radius the wheel must hold here, m (Infinity = straight). */
  rearRadiusM: number;
}

/**
 * The REAL car with its body centre on the recorded path. The rear axle can
 * only roll along the body, so as the centre C moves by dC the heading turns by
 * dh = (dC · n) / a  (n = d(forward)/dh, a = rear axle behind the centre) — the
 * tractrix of a body dragged by its centre.
 *
 * STABILITY, and why the reverse is integrated backwards. Driven forward the
 * relation forgets its seed (the rear axle trails, a trailer follows its hitch);
 * driven in REVERSE it is the jackknife — any error grows like e^(s/a), so a
 * forward-in-time integration of a reverse leg measures the integrator, not the
 * path. A reverse leg is therefore integrated from its END back to its start
 * (in that direction the axle trails again), seeded with the recorded heading
 * where the car stops straight; a forward leg runs forward from the heading the
 * previous leg left. The heading this recovers at the very start of the drive
 * is then a CHECK, not an input: it must agree with the car standing square in
 * the bay, or no real car starting there could put its centre on this path.
 *
 * The rear-axle radius is measured over ≥ 0.5 m of rear-axle travel, so the
 * 0.1 m authoring chords cannot fake a spike.
 */
function bicycleOnPath(samples: readonly TraceSample[]): BicyclePose[] {
  const n = samples.length;
  const hs: number[] = new Array<number>(n);
  const step = (from: number, to: number, h: number): number => {
    const dx = samples[to].x - samples[from].x;
    const dy = samples[to].y - samples[from].y;
    return h + (dx * Math.cos(h) - dy * Math.sin(h)) / REAR_AXLE_M;
  };
  let carry: number | null = null;
  for (let i0 = 0; i0 < n; ) {
    let i1 = i0;
    while (i1 + 1 < n && samples[i1 + 1].gear === samples[i0].gear) i1++;
    if (samples[i0].gear < 0) {
      hs[i1] = (samples[i1].headingDeg * Math.PI) / 180;
      for (let i = i1; i > i0; i--) hs[i - 1] = step(i, i - 1, hs[i]);
    } else {
      hs[i0] = carry ?? (samples[i0].headingDeg * Math.PI) / 180;
      for (let i = i0 + 1; i <= i1; i++) hs[i] = step(i - 1, i, hs[i - 1]);
    }
    carry = hs[i1];
    i0 = i1 + 1;
  }
  // Rear-axle travel, for the radius the wheel must hold.
  const rs: number[] = [0];
  for (let i = 1; i < n; i++) {
    const dx = samples[i].x - samples[i - 1].x;
    const dy = samples[i].y - samples[i - 1].y;
    rs.push(rs[i - 1] + Math.abs(dx * Math.sin(hs[i - 1]) + dy * Math.cos(hs[i - 1])));
  }
  const out: BicyclePose[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    while (j < n - 1 && rs[j] - rs[i] < 0.5) j++;
    const ds = rs[j] - rs[i];
    const dTurn = Math.abs(hs[j] - hs[i]);
    out.push({
      tSec: samples[i].tSec,
      x: samples[i].x,
      y: samples[i].y,
      headingDeg: (hs[i] * 180) / Math.PI,
      rearRadiusM: ds >= 0.5 && dTurn > 1e-9 ? ds / dTurn : Infinity,
    });
  }
  return out;
}

// GLB-measured half extents of the parked pool, m (across, along) — the
// runtime rule (ScenarioObstacles vehicleColliderDims ← rig.halfWidth /
// rig.halfLength), as pinned and re-verified against the shipped GLBs by
// tools/mobile/lib/path-plan/body-screen.mjs FLEET_BODY_HALF (`--verify-extents`
// refuses on a 1 mm disagreement). Only the models the lot can stand are listed.
const GLB_HALF: Record<string, { across: number; along: number }> = {
  vela_h3: { across: 1.05, along: 2.16 },
  pino: { across: 0.9901, along: 1.84 },
  corva_s: { across: 1.0751, along: 2.415 },
  dret_90: { across: 1.01, along: 2.255 },
  corva_sw: { across: 1.0751, along: 2.415 },
  arden_x: { across: 1.0701, along: 2.24 },
  kolos: { across: 1.1099, along: 2.59 },
  corva_l: { across: 1.1099, along: 2.555 },
  tarpan: { across: 1.0902, along: 2.58 },
  kargo_v: { across: 1.15, along: 2.705 },
  taxi: { across: 1.0751, along: 2.415 },
};

/** The product's parked-car boxes: per occupied bay, the envelope of the
 *  headless gate's table rect and the live scene's GLB box for the model that
 *  actually stands there (lessonWorldRecipe: seed = occupied-bay index). */
function productParkedBoxes(): Array<Obb2D & { model: string }> {
  return lotObstacleRects(RAW).map((r, i) => {
    const model = FLEET[assignCivilianModel(i)];
    const glb = GLB_HALF[model];
    if (!glb) throw new Error(`no measured extents for parked model ${model}`);
    return {
      model,
      x: r.x,
      y: r.y,
      headingDeg: r.headingDeg,
      halfWidthM: Math.max(r.halfWidthM, glb.across),
      halfLengthM: Math.max(r.halfLengthM, glb.along),
    };
  });
}
const BOXES = productParkedBoxes();

const heroBox = (x: number, y: number, headingDeg: number): Obb2D => ({
  x,
  y,
  headingDeg,
  halfWidthM: T.CHASSIS_HALF_EXTENTS.x,
  halfLengthM: T.CHASSIS_HALF_EXTENTS.z,
});
function minClearance(poses: ReadonlyArray<{ x: number; y: number; headingDeg: number; tSec: number }>) {
  let best = { m: Infinity, atSec: 0, model: "" };
  for (const p of poses) {
    for (const b of BOXES) {
      const sep = obbSeparationM(heroBox(p.x, p.y, p.headingDeg), b);
      if (sep < best.m) best = { m: sep, atSec: p.tSec, model: b.model };
    }
  }
  return best;
}

/** Poses up to the scripted consequence (a mistake demo's path ends there). */
function posesBeforeContact(drive: RecordedDrive): TraceSample[] {
  const hit = drive.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION");
  return drive.trace.samples.filter((s) => hit === undefined || s.tSec <= hit.t);
}

// ---------------------------------------------------------------------------
// 1–5. The drive is one the product car can perform
// ---------------------------------------------------------------------------

describe("sc-park-bay-exit-rev:49af2940 — the car's turning limit, derived from the vehicle model", () => {
  it("kinematic: wheelbase 2.56 m, rear axle 1.28 m, 0.6 rad ⇒ rear 3.74 m, centre 3.95 m", () => {
    expect(WHEELBASE_M).toBeCloseTo(2.56, 6);
    expect(REAR_AXLE_M).toBeCloseTo(1.28, 6);
    expect(T.STEER_MAX_ANGLE).toBe(0.6);
    expect(KIN_REAR_RADIUS_M).toBeCloseTo(3.742, 3);
    expect(KIN_CENTRE_RADIUS_M).toBeCloseTo(3.955, 3);
    // The census measures every demo against the same number.
    expect(KINEMATIC_CENTRE_RADIUS_M).toBe(KIN_CENTRE_RADIUS_M);
  });

  it("physics: the headless VehicleSim's full-lock reverse circle at walking pace is wider than the kinematic one", () => {
    // The parking-envelope harness bounds the same circle to [3.4, 4.6]; at
    // 4 km/h it measures ≈ 4.17 m (tyre slip widens the bicycle's 3.95).
    expect(physCentreRadiusM).toBeGreaterThan(KIN_CENTRE_RADIUS_M);
    expect(physCentreRadiusM).toBeLessThan(4.6);
    expect(limitCentreRadius()).toBe(physCentreRadiusM);
  });

  it("the trace module states the same limit, and authors inside it with the margin", () => {
    expect(PBE_KINEMATIC_CENTRE_RADIUS_M).toBeCloseTo(KIN_CENTRE_RADIUS_M, 12);
    expect(PBE_MIN_CENTRE_RADIUS_M).toBeGreaterThanOrEqual(RADIUS_MARGIN * limitCentreRadius());
  });
});

describe("sc-park-bay-exit-rev:49af2940 — the shadow is a drive the product car can perform", () => {
  const samples = SHADOW.trace.samples;
  const bike = bicycleOnPath(samples);

  it("CURVATURE: the body-centre path never turns tighter than 1.05 × the car's limit (any 1 m of travel)", () => {
    const worst = windowedMinRadius(samples);
    expect(
      worst.radiusM,
      `tightest ${worst.radiusM.toFixed(3)} m at t=${worst.atSec.toFixed(2)} s vs limit ${limitCentreRadius().toFixed(3)} m`,
    ).toBeGreaterThanOrEqual(RADIUS_MARGIN * limitCentreRadius());
  });

  it("STEERABILITY: a real car on this path never needs a rear-axle radius tighter than 1.05 × its own", () => {
    let worst = { r: Infinity, t: 0 };
    for (const p of bike) if (p.rearRadiusM < worst.r) worst = { r: p.rearRadiusM, t: p.tSec };
    expect(
      worst.r,
      `tightest rear radius ${worst.r.toFixed(3)} m at t=${worst.t.toFixed(2)} s vs ${limitRearRadius().toFixed(3)} m`,
    ).toBeGreaterThanOrEqual(RADIUS_MARGIN * limitRearRadius());
    // The heading the path demands at the very start (recovered, not seeded)
    // is the car standing square in the bay — within 2.5°, which the first
    // metre straight back absorbs.
    expect(Math.abs(wrap180(bike[0].headingDeg - samples[0].headingDeg))).toBeLessThan(2.5);
  });

  it("CLEARANCE ≥ 0.25 m to every parked car — the recorded pose AND the real car's pose, product boxes", () => {
    // The live boxes are the models that actually stand in the four bays.
    expect(BOXES.map((b) => b.model)).toEqual(["dret_90", "vela_h3", "dret_90", "arden_x"]);
    const traced = minClearance(samples);
    const real = minClearance(bike);
    expect(traced.m, `recorded pose: ${traced.m.toFixed(3)} m at t=${traced.atSec.toFixed(2)} (${traced.model})`).toBeGreaterThanOrEqual(CLEARANCE_FLOOR_M);
    expect(real.m, `bicycle pose: ${real.m.toFixed(3)} m at t=${real.atSec.toFixed(2)} (${real.model})`).toBeGreaterThanOrEqual(CLEARANCE_FLOOR_M);
  });

  it("CONTINUITY: the heading never jumps (≤ 3° between samples — one authoring chord), and every gear change happens at rest", () => {
    for (let i = 1; i < samples.length; i++) {
      const jump = Math.abs(wrap180(samples[i].headingDeg - samples[i - 1].headingDeg));
      expect(jump, `heading jump at t=${samples[i].tSec.toFixed(2)}`).toBeLessThanOrEqual(3);
      if (samples[i].gear !== samples[i - 1].gear) {
        // At rest in the old gear, and the new gear's first sample is the
        // first frames of moving off from rest (the recorder engages the gear
        // on the frame the car starts to roll: ≤ 3 frames × 2.2 m/s² ≈ 0.4 km/h).
        expect(Math.abs(samples[i - 1].speedKmh), `gear change at t=${samples[i].tSec}`).toBeLessThan(0.05);
        expect(Math.abs(samples[i].speedKmh), `gear change at t=${samples[i].tSec}`).toBeLessThan(1);
        // …and it was a real stop, not a touch: at rest for the authored 1 s
        // pause (≥ 0.9 s between the 20 Hz samples that bound it).
        const restFrom = samples.findLastIndex((s, k) => k < i && Math.abs(s.speedKmh) >= 0.05);
        expect(samples[i - 1].tSec - samples[restFrom + 1].tSec).toBeGreaterThanOrEqual(0.9);
      }
    }
    // The drill really is reverse THEN forward: exactly one R→D change.
    const changes = samples.filter((s, i) => i > 0 && s.gear !== samples[i - 1].gear);
    expect(changes.map((s) => s.gear)).toEqual([1]);
  });

  it("the real car and the recorded ghost agree to within 25° of heading (the recorder's tangent model is not a different manoeuvre)", () => {
    let worst = 0;
    for (let i = 0; i < samples.length; i++) {
      worst = Math.max(worst, Math.abs(wrap180(samples[i].headingDeg - bike[i].headingDeg)));
    }
    expect(worst).toBeLessThan(25);
  });

  it("the reverse ends aligned with the aisle INSIDE the Задача 1 zone, the drive-away rides the lane band", () => {
    const rev = samples.filter((s) => s.gear === -1);
    const last = rev[rev.length - 1];
    const out = SC_PARK_BAY_EXIT_REV.success[0].params;
    if (out.kind !== "reachZone") throw new Error("sc-pbe-out must be a reachZone");
    // The authored end IS the graded point (the GAP-4 «target» question): the
    // zone is centred where the shadow's reverse comes to rest.
    expect(Math.hypot(last.x - out.x, last.y - out.y)).toBeLessThan(0.05);
    expect(Math.hypot(PBE_REVERSE_END.x - out.x, PBE_REVERSE_END.y - out.y)).toBeLessThan(0.01);
    expect(Math.abs(wrap180(last.headingDeg))).toBeLessThan(3);
    // Forward legs above 5 km/h stay inside the 3.25 m lane-keep band of the
    // drawn lane centre (x = 4.0625) — the envelope the template header states.
    expect(Math.abs(PBE_DRIVE_X - 4.0625)).toBeLessThan(3.25);
    for (const s of samples) {
      if (s.gear === 1 && s.y >= 5) expect(Math.abs(s.x - PBE_DRIVE_X), `t=${s.tSec}`).toBeLessThan(0.01);
    }
  });
});

describe("sc-park-bay-exit-rev:49af2940 — the mistake demos drive the shadow's own path", () => {
  for (const name of ["mistake-blind-reverse", "mistake-swing-out"] as const) {
    it(`${name}: the path up to the consequence is the shadow's reverse, curvature-legal and ≥ 0.25 m clear`, () => {
      const drive = DRIVES.get(name)!;
      const before = posesBeforeContact(drive);
      expect(before.length).toBeGreaterThan(20);
      expect(windowedMinRadius(before).radiusM).toBeGreaterThanOrEqual(RADIUS_MARGIN * limitCentreRadius());
      expect(minClearance(before).m).toBeGreaterThanOrEqual(CLEARANCE_FLOOR_M);
      // Same path: every pose lies on the shadow's reverse polyline (≤ 2 cm).
      const shadowRev = SHADOW.trace.samples.filter((s) => s.gear === -1);
      for (const p of before) {
        let d = Infinity;
        for (let k = 1; k < shadowRev.length; k++) {
          const a = shadowRev[k - 1];
          const b = shadowRev[k];
          const vx = b.x - a.x;
          const vy = b.y - a.y;
          const L2 = vx * vx + vy * vy;
          const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2)) : 0;
          d = Math.min(d, Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy)));
        }
        expect(d, `${name} @ ${p.tSec.toFixed(2)}`).toBeLessThan(0.02);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 6–7. The live rung chain
// ---------------------------------------------------------------------------

type ScriptName = "shadow" | "blind" | "swing";
const SCRIPTS = {
  shadow: { kind: "shadow" as const, script: scParkBayExitRevShadowScript },
  blind: { kind: "mistake" as const, script: scParkBayExitRevMistakeBlindScript },
  swing: { kind: "mistake" as const, script: scParkBayExitRevMistakeSwingScript },
};

interface RungRun {
  out: LiveReplayOutcome;
  parkedContacts: number[];
  scriptedAt: number | null;
}

/**
 * One rung: record the authored script with the RUNG's cast (L5's late walker
 * included), then replay it pose by pose through the live chain. Two stand-ins
 * for the parts of the live stack that are rapier, not process:
 *  - parked cars: a rising-edge overlap of the recorded hero box with a live
 *    parked box queues the unnamed vehicle contact ScenarioObstacles would;
 *  - the mistake demo's scripted consequence is queued on the frame the
 *    recorder queued it (the trace carries poses, not contacts).
 */
function runRung(level: ScenarioLevel, which: ScriptName): RungRun {
  const lesson = compileScenario(SC_PARK_BAY_EXIT_REV, level);
  const { kind, script } = SCRIPTS[which];
  const authored = script();
  const rec = recordScriptedDrive(RAW, authored, {
    scenarioId: SC_PARK_BAY_EXIT_REV_ID,
    kind,
    seed: 7,
    stagedEvents: (lesson.stagedEvents ?? []) as StagedEventSpec[],
    obstacles: lotObstacleRects(RAW),
    collisionMinKmh: 0,
  });
  const scripted = authored.steps.find((s) => s.kind === "collision");
  const hit = rec.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION");
  const scriptedAt = scripted && hit ? hit.t : null;
  let scriptedSent = false;
  const touching = new Set<number>();
  const parkedContacts: number[] = [];
  const out = liveChainReplay({
    lesson,
    districtRaw: RAW,
    trace: rec.trace,
    holdAfterSec: 3,
    beforeApply: (ctx) => {
      const v = ctx.tick;
      BOXES.forEach((b, i) => {
        const over = obbSeparationM(heroBox(v.position.x, v.position.y, v.headingDeg), b) <= 0;
        if (over && !touching.has(i)) {
          parkedContacts.push(ctx.t);
          ctx.tick.events.push({ kind: "collision", withWhat: "vehicle" });
        }
        if (over) touching.add(i);
        else touching.delete(i);
      });
      if (scripted && scripted.kind === "collision" && scriptedAt !== null && !scriptedSent && ctx.t >= scriptedAt - 1e-6) {
        scriptedSent = true;
        ctx.tick.events.push({ kind: "collision", withWhat: scripted.withWhat });
      }
    },
  });
  return { out, parkedContacts, scriptedAt };
}

describe("sc-park-bay-exit-rev:49af2940 — the shadow completes the lesson at EVERY rung, on the live chain", () => {
  const runs = LEVELS.map((level) => ({ level, run: runRung(level, "shadow") }));

  it("both tasks, in order (out of the bay in reverse, then away up the aisle), 0 т., no COLLISION, ИЗДЪРЖАН — L1 to L5", () => {
    for (const { level, run } of runs) {
      const label = `L${level}`;
      const { out } = run;
      expect(run.parkedContacts, `${label} parked-car contact`).toEqual([]);
      expect(out.ambientContacts, label).toEqual([]);
      expect(out.result.objectives.map((o) => [o.id, o.done]), label).toEqual([
        ["sc-pbe-out", true],
        ["sc-pbe-away", true],
      ]);
      const [o1, o2] = out.result.objectives;
      expect(o1.completedAtSec!, label).toBeLessThan(o2.completedAtSec!);
      expect(out.violationCodes, label).toEqual([]);
      expect(out.violationCodes, label).not.toContain("COLLISION");
      expect(out.result.score, label).toBe(0);
      expect(out.result.passed, label).toBe(true);
      expect(out.debrief, label).toMatch(/е издържан: 0 наказателни точки/);
    }
  });

  it("every staged walker of the rung is yielded to (L5's late walker included)", () => {
    for (const { level, run } of runs) {
      const ids = (run.out.lesson.stagedEvents ?? []).map((s: StagedEventSpec) => s.id);
      for (const id of ids) {
        const o = run.out.outcomes.find((x) => x.eventId === id);
        if (o) expect(o.detail, `L${level} ${id}`).toBe("yielded");
      }
      expect(run.out.outcomes.find((x) => x.eventId === "pbe-aisle-walker")?.detail, `L${level}`).toBe("yielded");
    }
  });

  it("L5's late walker is let across whatever her seeded release distance (twelve director seeds)", () => {
    // The live chain runs ONE seed (lessonSeed of the rung id); a retry redraws
    // her trigger distance (8 ± 3 m). The crawl past her line must hold for
    // every draw, not for the one the live seed happens to make.
    const lesson = compileScenario(SC_PARK_BAY_EXIT_REV, 5);
    for (let seed = 1; seed <= 12; seed++) {
      const rec = recordScriptedDrive(RAW, scParkBayExitRevShadowScript(), {
        scenarioId: SC_PARK_BAY_EXIT_REV_ID,
        kind: "shadow",
        seed,
        stagedEvents: (lesson.stagedEvents ?? []) as StagedEventSpec[],
        obstacles: lotObstacleRects(RAW),
        collisionMinKmh: 0,
      });
      expect(rec.outcomes.map((o) => [o.eventId, o.detail]), `seed ${seed}`).toEqual([
        ["pbe-aisle-walker", "yielded"],
        ["pbe-aisle-walker-late", "yielded"],
      ]);
      expect(rec.ruleEvents.filter((e) => e.kind === "violation"), `seed ${seed}`).toEqual([]);
    }
  });
});

describe("sc-park-bay-exit-rev:49af2940 — every mistake demo still commits its mistake at every rung", () => {
  for (const [which, code, withWhat] of [
    ["blind", "COLLISION", "pedestrian"],
    ["swing", "COLLISION", "vehicle"],
  ] as const) {
    it(`${which}: the scripted ${withWhat} contact is billed — never passed, never a parked-car clip`, () => {
      for (const level of LEVELS) {
        const label = `L${level} ${which}`;
        const { out, parkedContacts, scriptedAt } = runRung(level, which);
        expect(scriptedAt, label).not.toBeNull();
        expect(parkedContacts, label).toEqual([]);
        expect(out.result.passed, label).toBe(false);
        // COLLISION is опасна: billed on first sight at every rung (policy
        // always-grade), so ADR-009's own-mistake filter leaves it out of the
        // lesson-mistake targets — the contact is CHARGED on L1 as on L4.
        expect(out.violationCodes, label).toContain(code);
        const hit = out.session.events.find((e) => e.kind === "violation" && e.code === code);
        expect(hit && hit.kind === "violation" ? hit.detail : undefined, label).toBe(withWhat);
        expect(out.result.lessonMistakes, label).toBeUndefined();
        expect(out.debrief, label).not.toMatch(/е издържан: 0 наказателни точки/);
      }
    });
  }
});
