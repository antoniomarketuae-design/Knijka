/**
 * PARKING-DEPTH DEMOS AS THE PRODUCT SEES THEM — test support (nothing in the
 * product imports it). catalogue-demo-curvature:dae908c7, family «curvdepth».
 *
 * The drivability pin (./sc-park-depth-drivable.test.ts) judges every authored
 * drive of the nine parking-depth lessons against two things the recorder's own
 * gate does not carry:
 *
 *  1. THE BODIES THE LIVE SCENE STANDS IN THE LOT. The headless gate arms one
 *     0.9 × 2.25 m rect per occupied bay (traces/scParkPerpRev
 *     PARKED_CAR_HALF_*); the live scene mounts a per-model cuboid sized off
 *     the GLB that actually stands there (ScenarioObstacles
 *     `vehicleColliderDims(rig.halfWidth, rig.halfLength, …)`, model =
 *     FLEET[assignCivilianModel(i)], i = the occupied-bay index —
 *     scene/lessonWorldRecipe.ts). A demo is clear of «the product's boxes»
 *     only if it is clear of BOTH, so each body here is the per-axis envelope
 *     of the two. The lesson's held scenery (the van, the garage wall —
 *     scene/scenarioSceneryProps.ts `heldSceneryFor`) is enveloped with its
 *     headless twin the same way.
 *
 *  2. THE CAR A STUDENT ACTUALLY DRIVES. The recorder is kinematic: the ghost
 *     stands on the authored centre point, headed along the path's tangent. A
 *     real car cannot do that — its rear axle only rolls along the body — so
 *     `bicycleOnPath` recovers the pose of a real car whose CENTRE follows the
 *     recorded path (the sc-park-bay-exit-rev recipe's measure, 8579f1d), and
 *     the pin checks that pose too.
 *
 * GLB_HALF is the recipe's table by value (sc-park-bay-exit-rev-drivable.test.ts
 * — there pinned and re-verified against the shipped GLBs by
 * tools/mobile/lib/path-plan/body-screen.mjs FLEET_BODY_HALF).
 */

import { obbSeparationM, type Obb2D } from "../../collision";
import { scenarioBaysOf } from "../../contracts";
import type { ScenarioObstacleSpec } from "../../scene/obstacleSpec";
import { heldSceneryFor } from "../../scene/scenarioSceneryProps";
import { assignCivilianModel, FLEET } from "../../traffic/vehicleFleet";
import * as T from "../../vehicle/tuning";
import type { ObstacleRect2D, TraceCollisionWith } from "../recorder";
import { PARK_DEPTH_DRILLS, parkDepthObstacles, type ParkDepthDrillId } from "../scParkDepth";
import type { TraceSample } from "../types";

/** GLB-measured half extents of the parked pool, m (across, along). */
export const GLB_HALF: Record<string, { across: number; along: number }> = {
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

export const REAR_AXLE_M = -T.WHEEL_POSITIONS[2].z;
export const WHEELBASE_M = T.WHEEL_POSITIONS[0].z - T.WHEEL_POSITIONS[2].z;

export interface ProductBox extends Obb2D {
  /** What stands there: a fleet model name, or "wall". */
  model: string;
  withWhat: TraceCollisionWith;
  /** Index in the recorder's obstacle list for this drill (its `obstacle-<i>`). */
  index: number;
}

/**
 * Every static body of one drill, as the envelope of the headless gate's rect
 * and the live scene's collider. Order = `parkDepthObstacles` (occupied bays in
 * district order, then the drill's extra bodies), so `index` names the same
 * body the recorder's per-body contact id does.
 */
export function productBoxes(districtRaw: unknown, drillId: ParkDepthDrillId): ProductBox[] {
  return productBoxSets(districtRaw, drillId).envelope;
}

/**
 * The same bodies four ways (round 2, decision D1 of the integrator):
 *  - `gate`: the recorder's / headless gate's rect alone;
 *  - `live`: the collider the live scene mounts alone (the GLB cuboid; for the
 *    wall, its held-scenery slab);
 *  - `envelope`: the per-axis LARGER of the two — the standard a clearance is
 *    kept on (clear of the envelope ⇒ clear of both);
 *  - `inner`: the per-axis SMALLER of the two — the standard a contact that
 *    must HAPPEN is cut and pinned on (inside the inner box ⇒ inside both:
 *    the live scene reports it AND the headless gate grades it).
 * All four are concentric and share the heading, so per-axis min / max is the
 * exact intersection / bounding box.
 */
export interface ProductBoxSets {
  gate: ProductBox[];
  live: ProductBox[];
  envelope: ProductBox[];
  inner: ProductBox[];
}

export function productBoxSets(districtRaw: unknown, drillId: ParkDepthDrillId): ProductBoxSets {
  const pairs = bodyPairs(districtRaw, drillId);
  const make = (pick: (g: number, l: number) => number | null): ProductBox[] =>
    pairs.map(({ base, gate, live }) => ({
      ...base,
      halfWidthM: pick(gate.halfWidthM, live.halfWidthM) as number,
      halfLengthM: pick(gate.halfLengthM, live.halfLengthM) as number,
    }));
  return {
    gate: make((g) => g),
    live: make((_g, l) => l),
    envelope: make((g, l) => Math.max(g, l)),
    inner: make((g, l) => Math.min(g, l)),
  };
}

interface BodyPair {
  base: Omit<ProductBox, "halfWidthM" | "halfLengthM">;
  gate: { halfWidthM: number; halfLengthM: number };
  live: { halfWidthM: number; halfLengthM: number };
}

function bodyPairs(districtRaw: unknown, drillId: ParkDepthDrillId): BodyPair[] {
  const env = productEnvelopeRaw(districtRaw, drillId);
  const rects: ObstacleRect2D[] = parkDepthObstacles(districtRaw, drillId);
  return env.map((b) => {
    const r = rects[b.index];
    const { halfWidthM: _w, halfLengthM: _l, liveHalfWidthM, liveHalfLengthM, ...base } = b;
    return {
      base,
      gate: { halfWidthM: r.halfWidthM, halfLengthM: r.halfLengthM },
      live: { halfWidthM: liveHalfWidthM, halfLengthM: liveHalfLengthM },
    };
  });
}

type RawBox = ProductBox & { liveHalfWidthM: number; liveHalfLengthM: number };

function productEnvelopeRaw(districtRaw: unknown, drillId: ParkDepthDrillId): RawBox[] {
  const rects: ObstacleRect2D[] = parkDepthObstacles(districtRaw, drillId);
  const occupied = scenarioBaysOf(districtRaw).filter((b) => b.occupied);
  const held: ScenarioObstacleSpec[] = heldSceneryFor(`${drillId}@L1`, districtRaw);
  const extras = PARK_DEPTH_DRILLS[drillId].extraObstacles ?? [];
  if (rects.length !== occupied.length + extras.length) {
    throw new Error(`${drillId}: obstacle list is not bays + extras`);
  }
  const out: RawBox[] = rects.map((r, i) => {
    if (i < occupied.length) {
      const model = FLEET[assignCivilianModel(i)];
      const glb = GLB_HALF[model];
      if (!glb) throw new Error(`${drillId}: no measured extents for parked model ${model}`);
      return {
        model,
        withWhat: r.withWhat,
        index: i,
        x: r.x,
        y: r.y,
        headingDeg: r.headingDeg,
        halfWidthM: Math.max(r.halfWidthM, glb.across),
        halfLengthM: Math.max(r.halfLengthM, glb.along),
        liveHalfWidthM: glb.across,
        liveHalfLengthM: glb.along,
      };
    }
    // An extra body: find its live twin in the held scenery, by position.
    const twin = held.find((h) => Math.hypot(h.x - r.x, h.y - r.y) < 0.01);
    if (!twin) throw new Error(`${drillId}: extra body at (${r.x}, ${r.y}) has no held-scenery twin`);
    if (twin.kind === "wall") {
      return {
        model: "wall",
        withWhat: r.withWhat,
        index: i,
        x: r.x,
        y: r.y,
        headingDeg: r.headingDeg,
        halfWidthM: Math.max(r.halfWidthM, (twin.thicknessM ?? 0.3) / 2),
        halfLengthM: Math.max(r.halfLengthM, twin.lengthM / 2),
        liveHalfWidthM: (twin.thicknessM ?? 0.3) / 2,
        liveHalfLengthM: twin.lengthM / 2,
      };
    }
    if (twin.kind !== "vehicle" || twin.model === undefined) {
      throw new Error(`${drillId}: extra body twin is a ${twin.kind} with no model`);
    }
    const glb = GLB_HALF[twin.model];
    if (!glb) throw new Error(`${drillId}: no measured extents for held model ${twin.model}`);
    return {
      model: twin.model,
      withWhat: r.withWhat,
      index: i,
      x: r.x,
      y: r.y,
      headingDeg: r.headingDeg,
      halfWidthM: Math.max(r.halfWidthM, glb.across),
      halfLengthM: Math.max(r.halfLengthM, glb.along),
      liveHalfWidthM: glb.across,
      liveHalfLengthM: glb.along,
    };
  });
  // A matcher must report what it cannot read: a hittable held body that is NOT
  // one of the drill's headless rects would be a body no demo was screened against.
  for (const h of held) {
    if ("visual" in h && h.visual === true) continue;
    if (!out.some((b) => Math.hypot(b.x - h.x, b.y - h.y) < 0.01)) {
      throw new Error(`${drillId}: held ${h.kind} at (${h.x}, ${h.y}) is not screened`);
    }
  }
  return out;
}

export const heroBox = (x: number, y: number, headingDeg: number): Obb2D => ({
  x,
  y,
  headingDeg,
  halfWidthM: T.CHASSIS_HALF_EXTENTS.x,
  halfLengthM: T.CHASSIS_HALF_EXTENTS.z,
});

export interface Clearance {
  m: number;
  atSec: number;
  model: string;
  index: number;
}

export function minClearance(
  poses: ReadonlyArray<{ x: number; y: number; headingDeg: number; tSec: number }>,
  boxes: readonly ProductBox[],
): Clearance {
  let best: Clearance = { m: Infinity, atSec: 0, model: "", index: -1 };
  for (const p of poses) {
    const hero = heroBox(p.x, p.y, p.headingDeg);
    for (const b of boxes) {
      const sep = obbSeparationM(hero, b);
      if (sep < best.m) best = { m: sep, atSec: p.tSec, model: b.model, index: b.index };
    }
  }
  return best;
}

export const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export interface BicyclePose {
  tSec: number;
  x: number;
  y: number;
  headingDeg: number;
  /** Rear-axle radius the wheel must hold here, m (Infinity = straight). */
  rearRadiusM: number;
}

/**
 * The REAL car with its body centre on the recorded path (the recipe's
 * `bicycleOnPath`, by value). The rear axle can only roll along the body, so as
 * the centre C moves by dC the heading turns by dh = (dC · n) / a. A reverse
 * leg is integrated from its END back to its start (driven in reverse the
 * relation is the jackknife and a forward-in-time integration measures the
 * integrator), seeded with the recorded heading where the car stops; a forward
 * leg runs forward from the heading the previous leg left.
 */
export function bicycleOnPath(samples: readonly TraceSample[]): BicyclePose[] {
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
  const rs: number[] = [0];
  for (let i = 1; i < n; i++) {
    const dx = samples[i].x - samples[i - 1].x;
    const dy = samples[i].y - samples[i - 1].y;
    rs.push(rs[i - 1] + Math.abs(dx * Math.sin(hs[i - 1]) + dy * Math.cos(hs[i - 1])));
  }
  // A window never spans a gear change: across a stop the recovered body may
  // be re-seeded (see the header), and that is not a turn the wheel makes.
  const legEnd: number[] = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    legEnd[i] = i < n - 1 && samples[i + 1].gear === samples[i].gear ? legEnd[i + 1] : i;
  }
  const out: BicyclePose[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (j < i) j = i;
    while (j < legEnd[i] && rs[j] - rs[i] < 0.5) j++;
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

// ---------------------------------------------------------------------------
// A car that STARTS SQUARE and steers within its lock
// ---------------------------------------------------------------------------

/** The product car's tightest REAR-AXLE radius, kinematically (L / tan δmax), m. */
export const KIN_REAR_RADIUS_M = WHEELBASE_M / Math.tan(T.STEER_MAX_ANGLE);

export interface TrackedPose {
  tSec: number;
  x: number;
  y: number;
  headingDeg: number;
  /** Distance of the tracked body centre from the recorded centre, m. */
  offM: number;
  /** The rear-axle curvature the wheel was asked for at this pose, rad/m. */
  kappa: number;
}

/**
 * THE WHOLE DRIVE, DRIVEN: a kinematic car with the product's wheelbase and
 * lock that starts where the trace starts, standing square, and STEERS — one
 * continuous body from the first sample to the last, through every stop and
 * gear change.
 *
 * WHY, when `bicycleOnPath` already recovers «the real car on this path». That
 * recovery integrates each reverse leg from its END and is seeded there, so
 * the body it returns at the START of a reverse leg is whatever the path
 * demands — it is never asked whether that is the body the previous leg left
 * standing there. Where a turn has to begin soon after a stop (a 7.3 m kerb
 * slot leaves 0.8 m of straight before the wheel must be over), the demanded
 * body is yawed a few degrees off the one that stopped. This drives it instead:
 * the car's state is carried, never re-seeded, and its wheel is steered by
 * feedback on the recovered reference (lateral error and heading error of the
 * rear axle, in the frame of travel), clamped to the car's own lock
 * (|κ| ≤ 1 / KIN_REAR_RADIUS_M = 1 / 3.742 m). The rear axle is the bicycle's
 * no-slip point in both gears, so in the frame of travel this is the same
 * unicycle forward and in reverse, and the same feedback is stable in both.
 *
 * What comes back is where THAT car's body is at each recorded sample: how far
 * its centre is from the ghost's, and what stands near it.
 */
export function driveFromSquare(samples: readonly TraceSample[]): TrackedPose[] {
  const n = samples.length;
  const ref = bicycleOnPath(samples);
  const D2R = Math.PI / 180;
  // Reference rear axle, per sample.
  const rx: number[] = [];
  const ry: number[] = [];
  const rh: number[] = [];
  for (let i = 0; i < n; i++) {
    const h = ref[i].headingDeg * D2R;
    rh.push(h);
    rx.push(samples[i].x - REAR_AXLE_M * Math.sin(h));
    ry.push(samples[i].y - REAR_AXLE_M * Math.cos(h));
  }
  const K_LAT = 2.25; // ω² (ω = 1.5 rad/m — settles in ≈ 2 m)
  const K_HEAD = 3.0; // 2ζω, ζ = 1
  const K_MAX = 1 / KIN_REAR_RADIUS_M;
  const SUB = 8;
  // State: rear axle + body heading. Square on the first sample.
  let h = samples[0].headingDeg * D2R;
  let px = samples[0].x - REAR_AXLE_M * Math.sin(h);
  let py = samples[0].y - REAR_AXLE_M * Math.cos(h);
  const out: TrackedPose[] = [];
  const push = (i: number, kappa: number) => {
    const cx = px + REAR_AXLE_M * Math.sin(h);
    const cy = py + REAR_AXLE_M * Math.cos(h);
    out.push({
      tSec: samples[i].tSec,
      x: cx,
      y: cy,
      headingDeg: h / D2R,
      offM: Math.hypot(cx - samples[i].x, cy - samples[i].y),
      kappa,
    });
  };
  push(0, 0);
  const wrapPi = (a: number) => {
    let r = a % (2 * Math.PI);
    if (r > Math.PI) r -= 2 * Math.PI;
    if (r < -Math.PI) r += 2 * Math.PI;
    return r;
  };
  for (let i = 1; i < n; i++) {
    const dsRef = Math.hypot(rx[i] - rx[i - 1], ry[i] - ry[i - 1]);
    let kappa = 0;
    if (dsRef > 1e-9) {
      // Direction of travel: the reference rear axle's own displacement decides
      // the gear (the recorded gear changes one sample late across a stop).
      const fwdDot = (rx[i] - rx[i - 1]) * Math.sin(rh[i]) + (ry[i] - ry[i - 1]) * Math.cos(rh[i]);
      const d = fwdDot >= 0 ? 1 : -1;
      const off = d > 0 ? 0 : Math.PI;
      const thRef0 = rh[i - 1] + off;
      const thRef1 = rh[i] + off;
      const kRef = wrapPi(thRef1 - thRef0) / dsRef;
      const ds = dsRef / SUB;
      for (let s = 0; s < SUB; s++) {
        const u = (s + 0.5) / SUB;
        const thRef = thRef0 + wrapPi(thRef1 - thRef0) * u;
        const qx = rx[i - 1] + (rx[i] - rx[i - 1]) * u;
        const qy = ry[i - 1] + (ry[i] - ry[i - 1]) * u;
        const th = h + off;
        // Right-of-path positive (travel (sin θ, cos θ) ⇒ right normal (cos θ, −sin θ)).
        const eLat = (px - qx) * Math.cos(thRef) - (py - qy) * Math.sin(thRef);
        const eHead = wrapPi(th - thRef);
        kappa = Math.max(-K_MAX, Math.min(K_MAX, kRef - K_LAT * eLat - K_HEAD * eHead));
        const thNew = th + kappa * ds;
        const thMid = th + (kappa * ds) / 2;
        px += ds * Math.sin(thMid);
        py += ds * Math.cos(thMid);
        h = thNew - off;
      }
    }
    push(i, kappa);
  }
  return out;
}
