#!/usr/bin/env node
/**
 * BODY SCREEN — does a committed authored path pass THROUGH a parked car?
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The path planner in this directory has no body model at all. `planner.mjs`
 * contains the string "obstacle" ZERO times, and the generator's own screen
 * (`build-pathrefs.mjs` → `screenCorners`) screens the DEVIATION CORRIDOR: it
 * asks whether a witness stays within a few centimetres of the authored line
 * and whether it can stop in the acceptance box. It never asks whether the
 * swept vehicle body touches anything. A path can therefore be committed as
 * FEASIBLE-TRACK with a 0.10 m worst deviation while driving straight through
 * the neighbour in the next bay — and one did: the root-cause investigation of
 * the `sc-park-left` pc-path canary at HEAD 4209dad found the committed
 * witness for segment 1 (startAlongM −0.5, the one actually driven) crossing
 * `lotlf-bay-4`, with a real drive following it to 0.014–0.088 m and colliding.
 *
 * Only `sc-park-left` had been measured. Every other parking/reverse lesson
 * routes through the same body-blind planner, so this screen exists to measure
 * the whole family — and to be importable by the planner later, so the body
 * test can move from "measured after the fact" to "a constraint while
 * planning". Nothing here drives, builds, or starts a server: it is pure
 * geometry over committed artefacts.
 *
 * WHAT IT COMPUTES
 * ----------------
 * For every row of every committed witness it builds the player's chassis OBB
 * and, for every parked/occupant/held body in that lesson, the body's OBB, and
 * takes the signed SAT separation (max over the four candidate axes of
 * centre-distance minus the summed projected half extents). Positive = the gap;
 * negative = the minimum translation distance needed to pull them apart, i.e.
 * penetration. The reported clearance for a witness is the minimum over all
 * rows and all bodies.
 *
 * WHERE EVERY NUMBER COMES FROM (no constant here is invented)
 * -----------------------------------------------------------
 *  · Player body — `CHASSIS_HALF_EXTENTS` (platform/src/modules/sim/vehicle/
 *    tuning.ts:70): x 0.85, z 2.02, i.e. 1.70 × 4.04 m. The collider is centred
 *    on the rigid body origin and `WHEEL_POSITIONS` (same file) puts both axles
 *    at z = ±1.28, so the box centre IS the axle midpoint — which is exactly
 *    what a pathref row stores in (cx, cz): `build-pathrefs.mjs:106-108` writes
 *    `cx = rx + CAR.a·sin ψ`, `cz = −(ry + CAR.a·cos ψ)` with CAR.a = 1.28 the
 *    half wheelbase, so the row's c-point can be used as the OBB centre with no
 *    offset. (rx, rz) in the same row is the rear axle.
 *  · Occupant bodies — mounted at their MEASURED GLB size with NO shrink.
 *    `ScenarioObstacles.tsx` lives at platform/src/COMPONENTS/sim/, not
 *    platform/src/modules/sim/scene/ — every cite to it below is that file:
 *    `ScenarioObstacles.tsx:396` `vehicleColliderDims(rig.halfWidth,
 *    rig.halfLength, rigTopY(rig))`, where the rig extents are
 *    `halfWidth = full.max.x` and `halfLength = max(full.max.z, −full.min.z)`
 *    over the merged body ∪ paint bounding box (vehicleFleet.ts:2146-2147),
 *    i.e. every non-wheel prim except the `headlight`/`taillight` materials.
 *    `FLEET_BODY_HALF` below is that measurement, re-derived from the shipped
 *    GLBs by `--verify-extents` (on by default) so the table cannot drift.
 *  · Pose — `ScenarioObstacles.tsx:531-533`: position (spec.x, 0, −spec.y),
 *    rotation `obstacleYawRad(headingDeg) = π − headingDeg·π/180`, which in the
 *    pathref frame ("x, z = −y; ψ 0 = north = −z, clockwise positive") is
 *    simply heading ψ = headingDeg. Bodies come from the district's
 *    `meta.scenario.bays` where `occupied === true`
 *    (lessonWorldRecipe.ts:261-273) plus the template's held scenery
 *    (scenarioSceneryProps.ts `HELD_SCENERY`), with `visual: true` entries
 *    excluded because they mount no collider (ScenarioObstacles.tsx:527).
 *  · Which model stands in a bay — DETERMINISTIC, not random:
 *    `resolveVehicleModel(undefined, seed) → assignCivilianModel(seed) =
 *    pickFromTable(PARKED_TABLE, mix32(seed))` (vehicleFleet.ts:2203), with
 *    `seed = i`, the index among OCCUPIED bays. `mix32` and the PARKED_WEIGHTS
 *    table are mirrored below and the pick is reproduced exactly. The
 *    pool-weighted fraction is still reported, because "this lesson passed its
 *    canary" and "this lesson would pass for any model the pool can draw" are
 *    very different statements.
 *  · Walls — `ObstacleWall` (ScenarioObstacles.tsx:630-654): a cuboid of
 *    [thicknessM/2, heightM/2, lengthM/2] at the same pose; props — the
 *    `PROP_COLLIDERS` table (ScenarioObstacles.tsx:197-200).
 *
 * CALIBRATION IS NOT OPTIONAL. `--calibrate` (on by default) reproduces seven
 * independently measured clearances for sc-park-left segment 1 witness −0.5
 * against `lotlf-bay-4`. If they do not reproduce to 1 cm the run REFUSES to
 * print a table, because a screen that cannot reproduce a known answer must
 * say so rather than return numbers.
 *
 * USAGE
 *   node tools/mobile/lib/path-plan/body-screen.mjs              # everything
 *   node tools/mobile/lib/path-plan/body-screen.mjs --json       # machine form
 *   node tools/mobile/lib/path-plan/body-screen.mjs --no-glb     # skip re-measure
 *   node tools/mobile/lib/path-plan/body-screen.mjs --lesson sc-park-left
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import process from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..");
const PATHREF_DIR = join(REPO, "tools", "mobile", "path-refs");
const WORLD_DIR = join(REPO, "content", "world");
const SCENERY_TS = join(REPO, "platform", "src", "modules", "sim", "scene", "scenarioSceneryProps.ts");
const TEMPLATE_DIR = join(REPO, "platform", "src", "modules", "sim", "lessons", "scenario");
const ROUTING_JSON = join(REPO, "tools", "audit", "path-routing.json");
const ANCHOR_WITNESS = join(HERE, "anchor-witness.json");
const GLB_DIRS = [
  join(REPO, "platform", "public", "sim", "vehicles-v2"),
  join(REPO, "platform", "public", "sim", "vehicles"),
];

// ---------------------------------------------------------------------------
// Mirrored product constants (each cited above)
// ---------------------------------------------------------------------------

/** platform/src/modules/sim/vehicle/tuning.ts:70 — 1.70 × 4.04 m. */
export const CHASSIS_HALF = { across: 0.85, along: 2.02 };

/** vehicleFleet.ts:87-102 — the fleet in index order. */
export const FLEET = [
  "vela_h3", "pino", "corva_s", "dret_90", "corva_sw", "arden_x", "kolos",
  "corva_l", "tarpan", "kargo_v", "kargo_m", "taxi", "suv_boxy_lux", "police",
];

/** vehicleFleet.ts:1710-1722 — the PARKED pool and its weights. */
export const PARKED_WEIGHTS = {
  vela_h3: 18, corva_s: 16, dret_90: 12, pino: 10, corva_sw: 12,
  arden_x: 12, kolos: 5, corva_l: 2, tarpan: 4, kargo_v: 5, taxi: 4,
};

/**
 * MEASURED off the shipped GLBs with the runtime's own rule (non-wheel prims,
 * minus headlight/taillight materials; halfWidth = max.x, halfLength =
 * max(max.z, −min.z)). `--verify-extents` re-derives these and refuses on a
 * disagreement over 1 mm, so this table is a pin and not a second opinion.
 */
export const FLEET_BODY_HALF = {
  vela_h3: { across: 1.0500, along: 2.1600 },
  pino: { across: 0.9901, along: 1.8400 },
  corva_s: { across: 1.0751, along: 2.4150 },
  dret_90: { across: 1.0100, along: 2.2550 },
  corva_sw: { across: 1.0751, along: 2.4150 },
  arden_x: { across: 1.0701, along: 2.2400 },
  kolos: { across: 1.1099, along: 2.5900 },
  corva_l: { across: 1.1099, along: 2.5550 },
  tarpan: { across: 1.0902, along: 2.5800 },
  kargo_v: { across: 1.1500, along: 2.7050 },
  kargo_m: { across: 1.1700, along: 2.7800 },
  taxi: { across: 1.0751, along: 2.4150 },
  suv_boxy_lux: { across: 1.1140, along: 2.6600 },
  police: { across: 0.8850, along: 2.0700 },
};

/**
 * THE WRONG BOX, kept deliberately so the report can quote it. The fleet
 * profile shell every other harness tool grades with is 1.84 × 4.10 m, and the
 * retired `policy.mjs BAY_FLANKS` table's `faceM: 1.78` was derived from that
 * 1.84 m width. It under-reads every single model in the parked pool — which is
 * how a drive reached contact while the fleet box still read 0.21 m of air, and
 * one of the reasons that table is gone.
 */
export const FLEET_PROFILE_BOX = { across: 0.92, along: 2.05 };

/** ScenarioObstacles.tsx:197-200. */
export const PROP_COLLIDERS = {
  cone: { across: 0.08, along: 0.08 },
  pole: { across: 0.04, along: 0.04 },
};

// ---------------------------------------------------------------------------
// Deterministic parked-model pick (vehicleFleet.ts:2178-2205), reproduced
// ---------------------------------------------------------------------------

function mix32(n) {
  let h = (n + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function buildWeightTable(weights) {
  const models = [];
  const cum = [];
  let total = 0;
  for (const name of FLEET) {
    const w = weights[name];
    if (!w) continue;
    total += w;
    models.push(name);
    cum.push(total);
  }
  return { models, cum, total };
}

const PARKED_TABLE = buildWeightTable(PARKED_WEIGHTS);

/** vehicleFleet.ts:2203 — the model that actually stands in a bay. */
export function assignCivilianModel(seed) {
  const x = mix32(seed) % PARKED_TABLE.total;
  for (let i = 0; i < PARKED_TABLE.cum.length; i++) {
    if (x < PARKED_TABLE.cum[i]) return PARKED_TABLE.models[i];
  }
  return PARKED_TABLE.models[PARKED_TABLE.models.length - 1];
}

// ---------------------------------------------------------------------------
// OBB geometry — pathref frame (x east, z south; ψ 0 = north = −z, clockwise +)
// ---------------------------------------------------------------------------

/**
 * An oriented box centred at (x, z) whose LENGTH axis points along heading ψ
 * (degrees) and whose WIDTH axis is perpendicular to it. ψ maps to the runtime
 * three.js yaw `π − ψ` exactly (`obstacleYawRad`), which sends the model's
 * local +Z to (sin ψ, −cos ψ) — the same heading vector the pathref
 * integrator uses, so the player and the obstacles share one convention.
 */
export function obb(x, z, psiDeg, halfAcross, halfAlong) {
  const p = (psiDeg * Math.PI) / 180;
  const s = Math.sin(p);
  const c = Math.cos(p);
  return {
    x, z,
    u: { x: c, z: s },       // across (width) axis
    v: { x: s, z: -c },      // along (heading/length) axis
    hu: halfAcross,
    hv: halfAlong,
  };
}

/**
 * Signed SAT separation between two 2-D OBBs. ≥ 0 is the true gap along the
 * separating axis; < 0 is the minimum translation distance (penetration depth)
 * negated. Four candidate axes is exact for boxes in 2-D.
 */
export function obbSeparation(A, B) {
  const dx = B.x - A.x;
  const dz = B.z - A.z;
  let best = -Infinity;
  for (const ax of [A.u, A.v, B.u, B.v]) {
    const d = Math.abs(dx * ax.x + dz * ax.z);
    const ra = A.hu * Math.abs(A.u.x * ax.x + A.u.z * ax.z) + A.hv * Math.abs(A.v.x * ax.x + A.v.z * ax.z);
    const rb = B.hu * Math.abs(B.u.x * ax.x + B.u.z * ax.z) + B.hv * Math.abs(B.v.x * ax.x + B.v.z * ax.z);
    const gap = d - ra - rb;
    if (gap > best) best = gap;
  }
  return best;
}

/** Player OBB for one pathref row [s, cx, cz, rx, rz, psiDeg, ...]. */
export function playerObbForRow(row) {
  return obb(row[1], row[2], row[5], CHASSIS_HALF.across, CHASSIS_HALF.along);
}

// ---------------------------------------------------------------------------
// THE SWEPT SCREEN (2026-09-16) - the sampling term, MEASURED
//
// WHY THIS REPLACED THE POINT SCREEN. Everything above tests the chassis box at
// the poses it is HANDED. A pathref row list is 0.1 m of arc apart and a band
// corner's rows are the same, so the old screen asked "is the car clear at these
// 0.1 m stations?" and answered a question no collision cares about: the car is
// a continuous body sweeping a continuous ribbon, and the tightest point of that
// ribbon is almost never a station. `BODY_FLOOR_M` carried a 0.010 m term for
// exactly this, ASSUMED from "the car rotates up to 1.48 deg between rows".
//
// It was measured on 2026-09-16 against the committed witnesses, by refining
// each interval until the value stopped moving. The assumption was 2.3x too
// small: the point screen over-reads sc-park-gap-short's committed seg-1
// witnesses by 0.0195, 0.0227 and 0.0195 m, and sc-park-wall's approach by
// 0.0120 m. Where the closest approach is FACE-TO-FACE (two boxes nearly
// parallel - sc-park-left, sc-park-van, sc-park-zebra) the separation changes
// slowly along the path and the error really is about 0.0004 m; where it is
// CORNER-TO-CORNER, as it is in the short gap, it changes at nearly the rate the
// car moves and the error is two centimetres. One number could never cover both,
// which is why it is measured per witness now instead of assumed once.
//
// HOW IT IS MEASURED, NOT BOUNDED. `sweptSeparation` scans the interpolated pose
// at `SWEEP_SPACING_M` and then TERNARY-REFINES every interval that could still
// hold the minimum. "Could still hold it" is a Lipschitz test, not a guess:
// translating a box by d moves its separation by at most d, and rotating it by
// dpsi moves a corner by at most CHASSIS_RADIUS_M * dpsi, so an interval whose
// scanned points all sit more than spacing/2 + CHASSIS_RADIUS_M * dpsi/2 above
// the running minimum cannot contain a lower value and is skipped. Refinement of
// the survivors is what makes the answer exact rather than merely finer: measured
// on the committed witnesses, the refined value is IDENTICAL to six decimals from
// scan spacings 0.01, 0.0025 and 0.0005 m, while the unrefined scan at those same
// spacings still wanders by up to 0.0008 m. The residual the screen reports
// (`residualM`) is therefore a measurement of its own remaining error, taken by
// re-measuring at a fifth of the spacing, and it is under 1e-5 m on every
// committed witness and every band corner of every parking lesson.
//
// The interpolation between two poses is linear in position and on the SHORT ARC
// in heading - the same convention `densifyPoses` publishes - which is a chord
// across the real arc. On a 0.1 m row step at the tightest radius this witness
// family turns (about 3 m) the chord sags 0.0004 m INSIDE the arc, i.e. toward
// the body, so the interpolation cannot flatter the plan.
// ---------------------------------------------------------------------------

/** The half-diagonal of the player chassis: the lever a heading error swings a corner on. */
export const CHASSIS_RADIUS_M = Math.hypot(CHASSIS_HALF.across, CHASSIS_HALF.along);

/**
 * The scan spacing of the swept screen. 0.01 m: measured on every committed
 * witness, refinement from this spacing lands on the same value as refinement
 * from 0.0005 m, at a twentieth of the cost.
 */
export const SWEEP_SPACING_M = 0.01;

const wrap180 = (d) => ((((d % 360) + 540) % 360) - 180);

/** A pathref row [s, cx, cz, rx, rz, psiDeg, ...] as the pose the screen sweeps. */
export function poseOfRow(row) {
  if (!Array.isArray(row) || ![row[1], row[2], row[5]].every(Number.isFinite)) {
    throw new Unreadable(`poseOfRow: row ${JSON.stringify(row)?.slice(0, 80)} has no finite (cx, cz, psi) - refusing to sweep a pose that could not be read`);
  }
  return { x: row[1], z: row[2], psiDeg: row[5], s: Number.isFinite(row[0]) ? row[0] : null };
}

/**
 * Poses interpolated to at most `spacingM` apart, position linear and heading on
 * the short arc. Exported for the tests and for any caller that wants the ribbon
 * itself rather than its minimum; the screen below does not build this list (it
 * would be millions of objects on a long approach) and interpolates in place.
 */
export function densifyPoses(poses, spacingM = SWEEP_SPACING_M) {
  if (!Array.isArray(poses) || poses.length === 0) throw new Unreadable("densifyPoses: no poses");
  if (!(spacingM > 0)) throw new Unreadable(`densifyPoses: spacing ${spacingM} is not positive`);
  const out = [poses[0]];
  for (let i = 1; i < poses.length; i++) {
    const a = poses[i - 1];
    const b = poses[i];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const dp = wrap180(b.psiDeg - a.psiDeg);
    const n = Math.max(1, Math.ceil(d / spacingM));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, psiDeg: a.psiDeg + dp * t, s: Number.isFinite(a.s) && Number.isFinite(b.s) ? a.s + (b.s - a.s) * t : null });
    }
  }
  return out;
}

/**
 * The largest disagreement the swept screen tolerates between its own two
 * estimates of the same minimum (the refinement at `SWEEP_SPACING_M` and the
 * refinement at a fifth of it). Measured on every committed witness and every
 * band corner of every parking lesson it is under 1e-5 m; a millimetre is 150
 * times smaller than `BODY_FLOOR_M` and 88 times smaller than the following
 * error the floor is mostly made of. Past it the screen REFUSES: a screen that
 * cannot agree with itself about the number it gates on must not return one.
 */
export const SWEEP_RESIDUAL_TOL_M = 0.001;

/** How much finer the verification pass scans than the screen itself. */
export const SWEEP_VERIFY_FACTOR = 5;

/**
 * THE SWEPT MINIMUM of a pose ribbon against a set of OBBs.
 *
 * Returns `{ worst, atS, atIndex, atT, boxIndex, scanWorst, refinedByM, residualM,
 * pointWorst, pointSamplingM, pointIndex, intervalsRefined, poses, spacingM }`:
 *   - `worst`          the measured minimum of the CONTINUOUS ribbon.
 *   - `scanWorst`      the lowest value the `spacingM` scan itself saw.
 *   - `refinedByM`     scanWorst - worst: what refinement found between stations.
 *   - `residualM`      the screen's own MEASURED error - how much lower the
 *                      verification pass at spacingM/SWEEP_VERIFY_FACTOR came out.
 *                      Over `SWEEP_RESIDUAL_TOL_M` it throws instead of returning.
 *   - `pointWorst`     what the OLD point screen would have said, at the poses as handed.
 *   - `pointSamplingM` pointWorst - worst: how much the point screen over-read.
 *
 * A pose that cannot be read is REFUSED by name; an empty box list is refused too,
 * because "clear against nothing" must never be indistinguishable from "clear".
 */
export function sweptSeparation(poses, boxes, { spacingM = SWEEP_SPACING_M, verifyFactor = SWEEP_VERIFY_FACTOR, residualTolM = SWEEP_RESIDUAL_TOL_M } = {}) {
  if (!Array.isArray(poses) || poses.length === 0) throw new Unreadable("sweptSeparation: no poses to sweep");
  if (!Array.isArray(boxes) || boxes.length === 0) throw new Unreadable("sweptSeparation: no bodies to sweep against - refusing to report clearance against nothing");
  if (!(spacingM > 0)) throw new Unreadable(`sweptSeparation: spacing ${spacingM} is not positive`);
  if (!(verifyFactor >= 2)) throw new Unreadable(`sweptSeparation: verifyFactor ${verifyFactor} would not verify anything`);
  for (const [i, p] of poses.entries()) {
    if (!p || ![p.x, p.z, p.psiDeg].every(Number.isFinite)) throw new Unreadable(`sweptSeparation: pose ${i} is not finite (${JSON.stringify(p)?.slice(0, 80)}) - refusing to sweep a pose that could not be read`);
  }
  const sep = (x, z, psi) => {
    const P = obb(x, z, psi, CHASSIS_HALF.across, CHASSIS_HALF.along);
    let m = Infinity;
    let bi = -1;
    for (let j = 0; j < boxes.length; j++) {
      const g = obbSeparation(P, boxes[j]);
      if (g < m) { m = g; bi = j; }
    }
    return { m, bi };
  };
  const lerp = (i, t) => {
    const a = poses[i - 1];
    const b = poses[i];
    const dp = wrap180(b.psiDeg - a.psiDeg);
    return [a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, a.psiDeg + dp * t];
  };
  const sAt = (i, t) => {
    const a = poses[i - 1];
    const b = poses[i];
    return Number.isFinite(a?.s) && Number.isFinite(b?.s) ? a.s + (b.s - a.s) * t : Number.isFinite(a?.s) ? a.s : null;
  };

  // pass 0 - the poses exactly as handed: what the point screen said
  let pointWorst = Infinity;
  let pointIndex = 0;
  for (let i = 0; i < poses.length; i++) {
    const r = sep(poses[i].x, poses[i].z, poses[i].psiDeg);
    if (r.m < pointWorst) { pointWorst = r.m; pointIndex = i; }
  }
  if (poses.length === 1) {
    const r = sep(poses[0].x, poses[0].z, poses[0].psiDeg);
    return { worst: r.m, atS: poses[0].s ?? null, atIndex: 0, atT: 0, boxIndex: r.bi, scanWorst: r.m, refinedByM: 0, residualM: 0, pointWorst: r.m, pointSamplingM: 0, pointIndex, intervalsRefined: 0, poses: 1, spacingM };
  }

  // pass 1 - the scan, and per interval the lowest value seen inside it
  const nOf = new Array(poses.length).fill(0);
  const perInterval = new Array(poses.length).fill(Infinity);
  let scanWorst = Infinity;
  let at = { i: 1, t: 0, bi: -1 };
  for (let i = 1; i < poses.length; i++) {
    const a = poses[i - 1];
    const b = poses[i];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / spacingM));
    nOf[i] = n;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const r = sep(...lerp(i, t));
      if (r.m < perInterval[i]) perInterval[i] = r.m;
      if (r.m < scanWorst) { scanWorst = r.m; at = { i, t, bi: r.bi }; }
    }
  }

  // THE LIPSCHITZ FILTER. Translating a box by d moves its separation by at most d;
  // rotating it by dpsi moves a corner by at most CHASSIS_RADIUS_M * dpsi. Half a
  // sub-step of each is the most an interval's true minimum can sit below the lowest
  // value scanned inside it, so an interval that fails this test cannot hold the
  // answer and is skipped. This is a bound, and it is used ONLY to skip - every
  // interval it cannot rule out is then MEASURED.
  const slackOf = (i) => {
    const a = poses[i - 1];
    const b = poses[i];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = nOf[i];
    const dPsiRad = (Math.abs(wrap180(b.psiDeg - a.psiDeg)) * (Math.PI / 180)) / n;
    return d / n / 2 + (CHASSIS_RADIUS_M * dPsiRad) / 2;
  };

  /** The minimum over one interval, sub-scanned at `subN` and then ternary-refined. */
  const minOnInterval = (i, subN) => {
    let bm = Infinity;
    let bt = 0;
    let bbi = -1;
    for (let k = 0; k <= subN; k++) {
      const t = k / subN;
      const r = sep(...lerp(i, t));
      if (r.m < bm) { bm = r.m; bt = t; bbi = r.bi; }
    }
    let lo = Math.max(0, bt - 1 / subN);
    let hi = Math.min(1, bt + 1 / subN);
    for (let it = 0; it < 60; it++) {
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      if (sep(...lerp(i, m1)).m < sep(...lerp(i, m2)).m) hi = m2;
      else lo = m1;
    }
    const t = (lo + hi) / 2;
    const r = sep(...lerp(i, t));
    if (r.m < bm) { bm = r.m; bt = t; bbi = r.bi; }
    return { m: bm, t: bt, bi: bbi };
  };

  // pass 2 - MEASURE every interval the filter could not rule out, twice: once at the
  // screen's own spacing and once at a fifth of it. The two answers are the screen's
  // estimate and its check on itself.
  let coarse = { m: scanWorst, ...at };
  let fine = { m: scanWorst, ...at };
  let intervalsRefined = 0;
  for (let i = 1; i < poses.length; i++) {
    if (perInterval[i] > Math.min(coarse.m, fine.m) + slackOf(i) + 1e-12) continue;
    intervalsRefined += 1;
    const c = minOnInterval(i, nOf[i]);
    if (c.m < coarse.m) coarse = { m: c.m, i, t: c.t, bi: c.bi };
    const f = minOnInterval(i, nOf[i] * verifyFactor);
    if (f.m < fine.m) fine = { m: f.m, i, t: f.t, bi: f.bi };
  }
  const residualM = Math.max(0, coarse.m - fine.m);
  if (residualM > residualTolM) {
    throw new Unreadable(`sweptSeparation: the screen disagrees with itself by ${residualM.toFixed(6)} m (spacing ${spacingM} gave ${coarse.m.toFixed(6)}, spacing ${spacingM / verifyFactor} gave ${fine.m.toFixed(6)}) - over the ${residualTolM} m tolerance, so the clearance it would return is not measured`);
  }
  const best = fine.m <= coarse.m ? fine : coarse;
  return {
    worst: best.m,
    atS: sAt(best.i, best.t),
    atIndex: best.i,
    atT: best.t,
    boxIndex: best.bi,
    scanWorst,
    refinedByM: scanWorst - best.m,
    residualM,
    pointWorst,
    pointSamplingM: pointWorst - best.m,
    pointIndex,
    intervalsRefined,
    poses: poses.length,
    spacingM,
  };
}

/**
 * Minimum clearance of one witness against one body, plus the arc length where
 * it happens. `body` carries `across`/`along` half extents and a pose.
 *
 * SWEPT since 2026-09-16 (see the block above): the number this returns is the
 * minimum of the CONTINUOUS ribbon between the rows, not of the rows. It carries
 * `pointWorst` beside it - what the rows alone said - so every report can print
 * the term that used to be assumed.
 */
export function screenWitnessAgainstBody(rows, body, { spacingM = SWEEP_SPACING_M } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Unreadable("screenWitnessAgainstBody: no rows to screen");
  const B = obb(body.x, body.z, body.psiDeg, body.across, body.along);
  const s = sweptSeparation(rows.map(poseOfRow), [B], { spacingM });
  return { worst: s.worst, atS: s.atS, pointWorst: s.pointWorst, pointSamplingM: s.pointSamplingM, refinedByM: s.refinedByM, residualM: s.residualM };
}

// ---------------------------------------------------------------------------
// Reading the committed world — every reader REFUSES rather than guessing
// ---------------------------------------------------------------------------

/**
 * A body, a district, a bay or a GLB that COULD NOT BE READ. Never caught into
 * a default size: a screen that silently substitutes a fleet-profile box for a
 * model it could not measure returns "clear" for a car it never looked at, and
 * silence must not be indistinguishable from clearance.
 */
export class Unreadable extends Error {
  constructor(message) {
    super(message);
    this.name = "Unreadable";
  }
}

/** lesson id → districtId, read out of the scenario template that defines it. */
function lessonDistrictId(lesson) {
  for (const f of readdirSync(TEMPLATE_DIR)) {
    if (!f.startsWith("templates-") || !f.endsWith(".ts")) continue;
    const src = readFileSync(join(TEMPLATE_DIR, f), "utf8");
    const at = src.indexOf(`\n  id: "${lesson}"`);
    if (at < 0) continue;
    const m = /districtId: "([a-z0-9-]+)"/.exec(src.slice(at, at + 40000));
    if (!m) throw new Unreadable(`${lesson}: found in ${f} but no districtId within the template body`);
    return m[1];
  }
  throw new Unreadable(`${lesson}: no scenario template declares this id`);
}

/**
 * THE DISTRICT'S BAY BLOCK, AS READ — never as guessed.
 *
 * `block` says whether the district declares a `meta.scenario.bays` block AT
 * ALL, because "this district declares no bays" (pk-drive-v1 — a driveway, whose
 * only bodies are held walls) and "I could not find the bays" must never reach a
 * caller as the same empty list. That is exactly how they DID reach one before
 * 2026-09-16 (H2): `readOccupiedBays` returned `[]` for both, `bodiesForLesson`
 * turned that into no bodies, and `driveClearance` reported `no-bodies` — which
 * `driveClearanceGate` PASSES. A lesson whose district file had lost its bays
 * block would have been waved through as "nothing to hit".
 *
 * A district that cannot be read, and an OCCUPIED bay without a finite pose, are
 * still REFUSED by name: skipping either would drop a body the browser mounts
 * and report the empty space where it stands as clearance.
 */
export function readBays(districtId, { worldDir = WORLD_DIR } = {}) {
  const path = join(worldDir, `${districtId}.json`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Unreadable(`district ${districtId}: content/world/${districtId}.json could not be read (${err.code ?? err.message})`);
  }
  const bays = raw?.meta?.scenario?.bays;
  if (bays === undefined) return { districtId, block: "absent", declared: 0, occupied: [] };
  if (!Array.isArray(bays)) throw new Unreadable(`district ${districtId}: meta.scenario.bays is ${typeof bays}, not an array — refusing to read it as "no bays"`);
  const out = [];
  for (const b of bays) {
    if (b?.occupied !== true) continue;
    if (![b.x, b.y, b.headingDeg].every(Number.isFinite)) {
      throw new Unreadable(`district ${districtId}: occupied bay ${b?.id ?? "(no id)"} has no finite pose (x ${b?.x}, y ${b?.y}, headingDeg ${b?.headingDeg}) — refusing to skip a body the recipe mounts`);
    }
    out.push({ id: b.id, x: b.x, y: b.y, headingDeg: b.headingDeg, seed: out.length });
  }
  return { districtId, block: "present", declared: bays.length, occupied: out };
}

/** Occupied bays, in district order, with the seed the recipe hands them. `readBays().occupied`. */
export function readOccupiedBays(districtId, opts = {}) {
  return readBays(districtId, opts).occupied;
}

/**
 * Held scenery for one lesson, parsed out of the TS source. Entries in
 * HELD_SCENERY are one-line object literals; anything else (a shared constant
 * such as PARKED_ROW, or a multi-line literal) is REFUSED by name rather than
 * silently skipped — a matcher must report what it cannot read.
 *
 * `entry` is "present" or "absent" for the same reason `readBays` reports
 * `block` (H2): a lesson that HAS no held-scenery entry and a lesson whose entry
 * could not be found are different answers, and only one of them is a fact.
 */
function heldSceneryFor(lesson) {
  const src = readFileSync(SCENERY_TS, "utf8");
  const key = `\n  "${lesson}": `;
  const at = src.indexOf(key);
  if (at < 0) return { entry: "absent", items: [] };
  const after = src.slice(at + key.length);
  if (!after.startsWith("[")) {
    throw new Unreadable(`${lesson}: held scenery is the shared constant ${after.split(/[,\n]/)[0]} — not parsed`);
  }
  const end = after.indexOf("\n  ],");
  if (end < 0) throw new Unreadable(`${lesson}: held-scenery array not terminated as expected`);
  const block = after.slice(1, end);
  const out = [];
  for (const line of block.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{ kind:")) {
      if (t.startsWith("{")) throw new Unreadable(`${lesson}: multi-line held entry not parsed: ${t.slice(0, 60)}`);
      continue;
    }
    const body = t.replace(/,$/, "");
    const json = body
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"');
    let obj;
    try {
      obj = JSON.parse(json);
    } catch {
      throw new Unreadable(`${lesson}: could not parse held entry: ${t.slice(0, 80)}`);
    }
    out.push(obj);
  }
  return { entry: "present", items: out };
}

/**
 * "I FOUND NOTHING" AND "I COULD NOT LOOK" ARE NOT THE SAME ANSWER (H2, 2026-09-16).
 *
 * Every screen in this file and in `drive-clearance.mjs` treats an empty body
 * list as "nothing to hit", and `driveClearanceGate` PASSES that verdict. So the
 * empty list has to be earned. Two mechanical rules, each enough on its own:
 *
 *  1. a `lot-*` district IS a parking lot. Every one of them declares a bays
 *     block and mounts occupants; a lot lesson that produced no body means the
 *     district file, the template or the scenery source changed shape under the
 *     reader, not that the lot is empty.
 *  2. a district with no bays block AND a lesson with no held-scenery entry
 *     means there was nowhere to look at all. That is UNMEASURED, not clear.
 *
 * Both throw `Unreadable`, so the refusal travels into `refusedDriveClearance`
 * and fails the gate by name instead of passing as `no-bodies`.
 */
export function assertBodiesWereLookedFor(lesson, districtId, bodies, sources) {
  if (Array.isArray(bodies) && bodies.length > 0) return;
  const seen = `bays block ${sources?.bays?.block ?? "?"} (${sources?.bays?.declared ?? "?"} declared, ${sources?.bays?.occupied ?? "?"} occupied); held-scenery entry ${sources?.held?.entry ?? "?"} (${sources?.held?.parsed ?? "?"} parsed)`;
  if (/^lot-/.test(String(districtId))) {
    throw new Unreadable(`${lesson}: district ${districtId} is a parking lot and produced NO hittable body — ${seen}. A lot with no body means its sources could not be read, so this lesson is UNMEASURED, never "nothing to hit"`);
  }
  if (sources?.bays?.block === "absent" && sources?.held?.entry === "absent") {
    throw new Unreadable(`${lesson}: district ${districtId} declares no meta.scenario.bays block and ${lesson} has no held-scenery entry — ${seen}. There was nowhere to look, so "no bodies" is UNMEASURED, not clear`);
  }
}

/**
 * Every hittable body in a lesson, in the pathref frame. Vehicle bodies whose
 * model is drawn from the pool carry `pooled: true` and are screened against
 * every model in PARKED_WEIGHTS; the rest carry fixed extents.
 */
const BODIES_CACHE = new Map();

export function bodiesForLesson(lesson) {
  const hit = BODIES_CACHE.get(lesson);
  if (hit) return hit;
  const out = readBodiesForLesson(lesson);
  BODIES_CACHE.set(lesson, out);
  return out;
}

function readBodiesForLesson(lesson) {
  const districtId = lessonDistrictId(lesson);
  const bayRead = readBays(districtId);
  const held = heldSceneryFor(lesson);
  const bodies = [];
  for (const bay of bayRead.occupied) {
    const model = assignCivilianModel(bay.seed);
    bodies.push({
      id: bay.id,
      kind: "bay",
      x: bay.x,
      z: -bay.y,
      psiDeg: bay.headingDeg,
      pooled: true,
      seed: bay.seed,
      mountedModel: model,
    });
  }
  let vehIndex = bodies.length;
  for (const h of held.items) {
    if (h.kind === "vehicle") {
      const seed = h.seed ?? vehIndex;
      vehIndex++;
      if (h.visual === true) continue; // renders, mounts no collider
      const model = h.model ?? assignCivilianModel(seed);
      if (!FLEET_BODY_HALF[model]) throw new Unreadable(`${lesson}: held vehicle model ${model} has no measured extents`);
      bodies.push({
        id: `held:${model}@${h.x},${h.y}`,
        kind: "held-vehicle",
        x: h.x,
        z: -h.y,
        psiDeg: h.headingDeg,
        pooled: false,
        mountedModel: model,
        across: FLEET_BODY_HALF[model].across,
        along: FLEET_BODY_HALF[model].along,
      });
    } else if (h.kind === "wall") {
      bodies.push({
        id: `held:wall@${h.x},${h.y}`,
        kind: "wall",
        x: h.x,
        z: -h.y,
        psiDeg: h.headingDeg,
        pooled: false,
        across: (h.thicknessM ?? 0.3) / 2,
        along: h.lengthM / 2,
      });
    } else if (h.kind === "prop") {
      const p = PROP_COLLIDERS[h.prop];
      if (!p) throw new Unreadable(`${lesson}: unknown prop kind ${h.prop}`);
      bodies.push({
        id: `held:${h.prop}@${h.x},${h.y}`,
        kind: "prop",
        x: h.x,
        z: -h.y,
        psiDeg: h.headingDeg ?? 0,
        pooled: false,
        across: p.across,
        along: p.along,
      });
    } else {
      throw new Unreadable(`${lesson}: unhandled held-scenery kind ${h.kind}`);
    }
  }
  const sources = {
    bays: { block: bayRead.block, declared: bayRead.declared, occupied: bayRead.occupied.length },
    held: { entry: held.entry, parsed: held.items.length },
  };
  assertBodiesWereLookedFor(lesson, districtId, bodies, sources);
  return { districtId, bodies, sources };
}

// ---------------------------------------------------------------------------
// Screening a whole lesson
// ---------------------------------------------------------------------------

const POOL_TOTAL = Object.values(PARKED_WEIGHTS).reduce((a, b) => a + b, 0);

/**
 * THE ONE SCREEN. Every caller — the CLI table, the calibration anchor and the
 * builder's emit gate — goes through this function, so the number the pipeline
 * refuses on is the number the anchor reproduces.
 *
 * For a pooled body it is run once per model in PARKED_WEIGHTS; `mounted` is the
 * deterministic draw (`assignCivilianModel`), and `poolFraction` is the
 * PARKED_WEIGHTS-weighted chance that at least one pooled body is contacted under
 * an independent draw. `half` is the fleet half-extent table to size the pooled
 * models with — the pipeline passes the table it re-measured off the GLBs, so a
 * model it could not measure never reaches here at all.
 */
export function screenRowsAgainstBodies(rows, bodies, { half = FLEET_BODY_HALF, fleetBox = true } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Unreadable("screenRowsAgainstBodies: no rows to screen");
  const perBody = [];
  for (const b of bodies) {
    if (b.pooled) {
      for (const model of PARKED_TABLE.models) {
        const h = half[model];
        if (!h) throw new Unreadable(`pooled model ${model} has no measured half extents — refusing to screen ${b.id} against a default size`);
        const res = screenWitnessAgainstBody(rows, { ...b, across: h.across, along: h.along });
        perBody.push({ body: b.id, kind: b.kind, model, mounted: model === b.mountedModel, worst: res.worst, atS: res.atS, pointWorst: res.pointWorst, pointSamplingM: res.pointSamplingM });
      }
      if (fleetBox) {
        const res = screenWitnessAgainstBody(rows, { ...b, across: FLEET_PROFILE_BOX.across, along: FLEET_PROFILE_BOX.along });
        perBody.push({ body: b.id, kind: b.kind, model: "(fleet-profile box)", mounted: false, fleetBox: true, worst: res.worst, atS: res.atS });
      }
    } else {
      if (!Number.isFinite(b.across) || !Number.isFinite(b.along)) throw new Unreadable(`${b.id}: half extents are not finite (${b.across} x ${b.along}) — refusing to screen against a guess`);
      const res = screenWitnessAgainstBody(rows, b);
      perBody.push({ body: b.id, kind: b.kind, model: b.mountedModel ?? b.kind, mounted: true, worst: res.worst, atS: res.atS, pointWorst: res.pointWorst, pointSamplingM: res.pointSamplingM });
    }
  }
  const real = perBody.filter((p) => !p.fleetBox);
  const worst = real.reduce((m, p) => (p.worst < m.worst ? p : m), { worst: Infinity });
  const mounted = real.filter((p) => p.mounted);
  const worstMounted = mounted.length ? mounted.reduce((m, p) => (p.worst < m.worst ? p : m)) : null;
  const fleetBoxRows = perBody.filter((p) => p.fleetBox);
  const worstFleetBox = fleetBoxRows.length ? fleetBoxRows.reduce((m, p) => (p.worst < m.worst ? p : m)) : null;
  // Pool fraction: P(at least one pooled body contacted), independent draws.
  let survive = 1;
  for (const b of bodies.filter((x) => x.pooled)) {
    let clearW = 0;
    for (const model of PARKED_TABLE.models) {
      const hit = perBody.find((p) => p.body === b.id && p.model === model);
      if (hit && hit.worst >= 0) clearW += PARKED_WEIGHTS[model];
    }
    survive *= clearW / POOL_TOTAL;
  }
  const poolFraction = bodies.some((x) => x.pooled) ? 1 - survive : 0;
  return { perBody, worst, worstMounted, worstFleetBox, poolFraction };
}

/**
 * Screen every committed witness of a pathref already on disk.
 */
export function screenLesson(lesson, { half = FLEET_BODY_HALF } = {}) {
  const ref = JSON.parse(readFileSync(join(PATHREF_DIR, `${lesson}.pathref.json`), "utf8"));
  const { districtId, bodies } = bodiesForLesson(lesson);
  const witnesses = [];
  for (const [si, seg] of ref.segments.entries()) {
    for (const w of seg.witnesses) {
      if (!w.rows || w.rows.length === 0) continue;
      const s = bodies.length ? screenRowsAgainstBodies(w.rows, bodies, { half }) : { perBody: [], worst: { worst: Infinity }, worstMounted: null, worstFleetBox: null, poolFraction: 0 };
      witnesses.push({
        segment: si,
        gear: ref.segments[si].gear,
        segClass: ref.segments[si].class,
        startAlongM: w.startAlongM,
        arcLengthM: w.rows[w.rows.length - 1][0],
        rows: w.rows.length,
        worstDevM: w.worstDevM,
        worst: s.worst,
        worstMounted: s.worstMounted,
        worstFleetBox: s.worstFleetBox,
        poolFraction: s.poolFraction,
        perBody: s.perBody,
      });
    }
  }
  return { lesson, districtId, bodies, witnesses, ref };
}

// ---------------------------------------------------------------------------
// THE SAME MEASUREMENT, HANDED TO THE PLANNER AS A CONSTRAINT (2026-09-16)
//
// Everything above measures a path that already exists. The three functions
// below hand the SAME geometry to `planner.mjs` and `build-pathrefs.mjs` so a
// witness can be SCORED on clearance while it is chosen, rather than refused
// after the fact — the file header's «importable by the planner later, so the
// body test can move from "measured after the fact" to "a constraint while
// planning"». Nothing is re-derived here: the OBB, the chassis half extents,
// the deterministic mounted draw and the refusals are the ones
// `screenRowsAgainstBodies` uses, so the number the planner maximises is the
// number the emit gate reads back off the committed rows.
// ---------------------------------------------------------------------------

/**
 * The lesson's bodies AT THE SIZE THEY WILL MOUNT, as ready-made OBBs.
 *
 * A pooled bay takes `assignCivilianModel`'s deterministic draw — NOT the
 * friendliest model in the pool, which is why the planner's objective and the
 * emit gate agree by construction. A model with no measured half extents, or a
 * body with no finite size, is REFUSED BY NAME: a planner that quietly sized an
 * unknown car with a default would optimise clearance against a car nobody
 * measured, and report the empty space as safety.
 */
export function mountedBodies(lesson, { half = FLEET_BODY_HALF } = {}) {
  const { districtId, bodies, sources } = bodiesForLesson(lesson);
  const out = [];
  for (const b of bodies) {
    let across = b.across;
    let along = b.along;
    if (b.pooled) {
      const h = half[b.mountedModel];
      if (!h) throw new Unreadable(`${lesson}: ${b.id} mounts ${b.mountedModel}, which has no measured half extents — refusing to PLAN against a default size`);
      across = h.across;
      along = h.along;
    }
    if (!Number.isFinite(across) || !Number.isFinite(along)) {
      throw new Unreadable(`${lesson}: ${b.id} has no finite half extents (${across} x ${along}) — refusing to PLAN against a guess`);
    }
    out.push({ id: b.id, kind: b.kind, model: b.mountedModel ?? b.kind, pooled: b.pooled === true, box: obb(b.x, b.z, b.psiDeg, across, along) });
  }
  return { districtId, bodies: out, count: out.length, sources: sources ?? null };
}

/**
 * THE CHASSIS AT ONE POSE against a mounted body list — the single-pose form of
 * `worstMountedClearance`, for a caller that has a pose rather than a row list
 * (the follower's own guard, `drive-clearance.mjs bodyClearanceGuard`). Same
 * chassis box, same `obbSeparation`, same frame, so the follower's number and
 * the drive gate's number are the same measurement taken at different times.
 */
export function clearanceAtPose(bodies, x, z, psiDeg) {
  if (!Array.isArray(bodies)) throw new Unreadable("clearanceAtPose: no body list");
  if (![x, z, psiDeg].every(Number.isFinite)) throw new Unreadable(`clearanceAtPose: pose (${x}, ${z}, ${psiDeg}) is not finite — refusing to measure clearance at a pose that could not be read`);
  const P = obb(x, z, psiDeg, CHASSIS_HALF.across, CHASSIS_HALF.along);
  let m = Infinity;
  let index = -1;
  for (let j = 0; j < bodies.length; j++) {
    const g = obbSeparation(P, bodies[j].box ?? bodies[j]);
    if (g < m) { m = g; index = j; }
  }
  return { m, index };
}

/**
 * The planner's clearance function. It takes a chassis centre and heading IN THE
 * PLANNER'S OWN (trace) FRAME — x, y with z = −y, ψ clockwise from +y — because
 * that is what `simulateTargets` integrates, and converts to the pathref frame
 * here so no caller has to remember the sign.
 *
 * Returns +Infinity for a lesson with no body: a lesson whose district mounts
 * nothing has nothing to clear, and that is a measured fact, not a default. A
 * lesson whose bodies could not be READ never reaches this function —
 * `mountedBodies` throws first.
 */
export function clearanceFn(mounted) {
  const list = Array.isArray(mounted) ? mounted : mounted?.bodies;
  if (!Array.isArray(list)) throw new Unreadable("clearanceFn: no body list — refusing to return a clearance function that screens nothing");
  const boxes = list.map((b) => {
    if (!b?.box) throw new Unreadable(`clearanceFn: ${b?.id ?? "(no id)"} carries no OBB`);
    return b.box;
  });
  return (cx, cy, psiDeg) => {
    const P = obb(cx, -cy, psiDeg, CHASSIS_HALF.across, CHASSIS_HALF.along);
    let worst = Infinity;
    for (const B of boxes) {
      const g = obbSeparation(P, B);
      if (g < worst) worst = g;
    }
    return worst;
  };
}

/**
 * Worst mounted clearance of a committed row list, and which body it is against.
 * The band-corner screen (`build-pathrefs.mjs` -> `screenCorners`) reads this: a
 * corner is a START the follower may ARM from, so its witness must clear the
 * floor exactly as a committed witness must.
 *
 * SWEPT since 2026-09-16. The band corners were the one place the point screen
 * was never even densified, and they are also where the tightest surviving
 * numbers live (zebra 0.1526, gap-short 0.1552, van 0.1727, left 0.1754 against
 * a 0.15 m floor). `pointWorst` and `pointSamplingM` come back beside `worst` so
 * a caller can print what the rows alone said and what the sweep took off it.
 */
export function worstMountedClearance(rows, mounted, { spacingM = SWEEP_SPACING_M } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Unreadable("worstMountedClearance: no rows to screen");
  const list = Array.isArray(mounted) ? mounted : mounted?.bodies;
  if (!Array.isArray(list)) throw new Unreadable("worstMountedClearance: no body list");
  if (list.length === 0) return { worst: Infinity, atS: null, body: null, model: null, bodies: 0, pointWorst: Infinity, pointSamplingM: 0, refinedByM: 0, residualM: 0 };
  const s = sweptSeparation(rows.map(poseOfRow), list.map((b) => b.box), { spacingM });
  const who = list[s.boxIndex] ?? null;
  return {
    worst: s.worst,
    atS: s.atS,
    body: who?.id ?? null,
    model: who?.model ?? null,
    bodies: list.length,
    pointWorst: s.pointWorst,
    pointSamplingM: s.pointSamplingM,
    refinedByM: s.refinedByM,
    residualM: s.residualM,
  };
}

// ---------------------------------------------------------------------------
// THE EMIT GATE — the threshold, and where every number in it comes from
// ---------------------------------------------------------------------------

/**
 * THE FLOOR: a witness whose MOUNTED-model clearance falls below this is not
 * committed. 0.15 m. IT HAS NOT MOVED AND MUST NOT: re-deriving it below makes it
 * MORE conservative than its three terms now require, and the slack that frees
 * belongs to the residual, never to a lesson that would otherwise not fit.
 *
 *  - 0.088 m - the worst FOLLOWING ERROR any real browser drive has shown
 *    against a committed witness (canary-path-s2 sc-park-left, 2026-09-15:
 *    tracked the seg-1 witness to 0.014-0.088 m and hit the car it was aimed
 *    at). The plan's clearance is spent by the follower before anything else.
 *  - 0.010 m -> MEASURED, AND IT WAS 0.0227 (2026-09-16). This term was assumed:
 *    "the screen samples poses 0.1 m of arc apart instead of sweeping the body;
 *    the car rotates up to 1.48 deg between rows, so the sampled minimum
 *    understates the swept minimum by about a centimetre." The re-measurement
 *    (`sweptSeparation`, refined until the value stopped moving) says the point
 *    screen over-read sc-park-gap-short's three committed seg-1 witnesses by
 *    0.0196 / 0.0227 / 0.0203 m, sc-park-judge's +0.5 by 0.0147 and
 *    sc-park-wall's approach by 0.0121 - 2.3x the assumption, and it lands
 *    hardest exactly where the corner-to-corner geometry is, which no single
 *    constant could have covered. The fix is not a bigger constant: the screen
 *    SWEEPS now, so the term is the screen's own measured residual, which is
 *    under 1e-13 m on every committed witness of every pathref. Call it 0.000.
 *  - 0.050 m - the residual this screen cannot see at all: it is 2-D (no kerb
 *    height, no mirrors), and buildings are hittable and are NOT among the
 *    bodies it reads.
 *
 * 0.088 + 0.000 + 0.050 = 0.138, and the floor STAYS AT 0.15. The 0.012 m
 * difference is kept, not spent: it was never load-bearing for any lesson, and
 * a floor that drops the moment its instrument improves teaches the wrong
 * lesson about instruments. What DID change is that the numbers measured against
 * the floor are now honest - the four tightest band corners (zebra 0.1526,
 * gap-short 0.1552, van 0.1727, left 0.1754) were point-screened and, at the
 * true sampling error, some of them sit AT or BELOW it. They are re-screened by
 * the sweep and any that fall through PULL THE BAND (`build-pathrefs.mjs`
 * screenCorners), which is the existing machinery and reports itself.
 *
 * Below the floor, a drive that follows the plan AS WELL AS THE BEST ONE EVER
 * MEASURED can still touch, and a touch is booked against the product as
 * «Удар в друго превозно средство».
 *
 * THIS IS A FLOOR ON A PLAN. A DRIVE is judged by
 * `lib/drive-clearance.mjs DRIVE_CLEARANCE_FLOOR_M`, which keeps only the third
 * term, because a drive has already spent the first and measures the second.
 */
export const BODY_FLOOR_M = 0.15;

/**
 * THE WARN BAND: twice the floor. Between 0.15 and 0.30 m the witness commits,
 * but the pathref carries a caveat, because at that clearance there is very
 * little left between the plan and the neighbour but the follower's own live
 * guard (`drive-clearance.mjs bodyClearanceGuard`, floor 0.05 m) — and by then
 * the drive has already spent the 0.088 m of following error the plan floor
 * budgeted for it.
 */
export const BODY_WARN_M = 0.3;

const rnd = (v, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

/**
 * ONE WITNESS'S CLEARANCE RECORD — the object stored on the witness as
 * `bodyClearance`, and the object the gate below reads. `worstBodyClearanceM`
 * is the MOUNTED answer: the model `assignCivilianModel` will actually put in
 * that bay. The pool answer is carried beside it and never gates, because the
 * draw is deterministic — refusing a plan for a `kargo_v` the lesson will never
 * mount would refuse almost every bay lesson forever.
 */
export function clearanceRecord(rows, bodies, { half = FLEET_BODY_HALF } = {}) {
  if (bodies.length === 0) {
    return { screen: "body-screen/1", floorM: BODY_FLOOR_M, warnM: BODY_WARN_M, bodies: 0, verdict: "no-bodies", worstBodyClearanceM: null, mounted: null, worstPoolClearanceM: null, pool: null, worstFleetBoxM: null, poolContactPct: null };
  }
  const s = screenRowsAgainstBodies(rows, bodies, { half });
  const worstM = s.worstMounted ? s.worstMounted.worst : null;
  // WHAT THE OLD POINT SCREEN WOULD HAVE SAID, kept beside the swept answer. This is
  // the measurement that retired BODY_FLOOR_M's assumed 0.010 m sampling term: on the
  // committed corpus it reaches 0.0227 m, and it is a property of the GEOMETRY (0.0004 m
  // face-to-face, two centimetres corner-to-corner), which is why no constant covered it.
  const sweepPointSamplingM = s.worstMounted && Number.isFinite(s.worstMounted.pointSamplingM) ? s.worstMounted.pointSamplingM : null;
  const verdict = worstM === null ? "unmeasured" : worstM < BODY_FLOOR_M ? "unsafe" : worstM < BODY_WARN_M ? "tight" : "clear";
  return {
    screen: "body-screen/1",
    floorM: BODY_FLOOR_M,
    warnM: BODY_WARN_M,
    bodies: bodies.length,
    verdict,
    worstBodyClearanceM: rnd(worstM),
    mounted: s.worstMounted ? { body: s.worstMounted.body, model: s.worstMounted.model, atS: rnd(s.worstMounted.atS, 2) } : null,
    worstPoolClearanceM: rnd(s.worst?.worst ?? null),
    pool: s.worst && s.worst.body ? { body: s.worst.body, model: s.worst.model, atS: rnd(s.worst.atS, 2) } : null,
    worstFleetBoxM: rnd(s.worstFleetBox?.worst ?? null),
    poolContactPct: Math.round(s.poolFraction * 100),
    sweep: { spacingM: SWEEP_SPACING_M, pointWorstM: rnd(s.worstMounted?.pointWorst ?? null, 6), pointSamplingM: rnd(sweepPointSamplingM, 6) },
  };
}

/**
 * THE GATE THE BUILDER CALLS. Mutates each witness in place with its
 * `bodyClearance` (so it lands in the committed JSON) and returns the problems
 * that must BLOCK the emit and the caveats that must be printed beside a credit.
 *
 * REVERSE FAMILIES. `path-follow.mjs:selectWitness` picks, at runtime, the
 * largest `startAlongM` ≤ the car's measured start — so every member of a
 * reverse segment's witness list is drivable and every member is screened. One
 * unsafe member fails the segment; a caller cannot "use the good one".
 */
export function screenPathrefSegments(lesson, segments, { half = FLEET_BODY_HALF, floorM = BODY_FLOOR_M, warnM = BODY_WARN_M } = {}) {
  const { districtId, bodies } = bodiesForLesson(lesson);
  const problems = [];
  const caveats = [];
  const records = [];
  for (const seg of segments) {
    const family = (seg.witnesses ?? []).filter((w) => Array.isArray(w.rows) && w.rows.length >= 2);
    const gear = seg.gear === -1 ? "R" : "D";
    for (const w of family) {
      const rec = clearanceRecord(w.rows, bodies, { half });
      rec.familySize = family.length;
      w.bodyClearance = rec;
      records.push({ k: seg.k, gear: seg.gear, startAlongM: w.startAlongM, ...rec });
      const pooled = bodies.find((b) => b.id === rec.mounted?.body)?.pooled === true;
      const at = rec.mounted
        ? `${rec.mounted.body} (${pooled ? `mounted ${rec.mounted.model}` : rec.mounted.model}) at s = ${rec.mounted.atS} m of ${rnd(w.rows[w.rows.length - 1][0], 2)} m`
        : "(no body measured)";
      const who = `${lesson} seg ${seg.k} ${gear} witness ${w.startAlongM}${seg.gear === -1 && family.length > 1 ? ` (1 of ${family.length} the follower may pick)` : ""}`;
      if (rec.verdict === "unsafe") {
        problems.push(`body screen: ${who}: worst clearance ${rec.worstBodyClearanceM} m against ${at} — below the ${floorM} m floor`);
      } else if (rec.verdict === "tight") {
        caveats.push(`body screen: ${who} clears ${at} by only ${rec.worstBodyClearanceM} m (floor ${floorM} m, warn ${warnM} m)`);
      } else if (rec.verdict === "unmeasured") {
        problems.push(`body screen: ${who}: ${rec.bodies} bodies in ${districtId} but no mounted-model clearance came back — UNMEASURED, never a pass`);
      }
      if (rec.worstPoolClearanceM !== null && rec.worstPoolClearanceM < floorM && rec.verdict !== "unsafe") {
        caveats.push(`body screen: ${who} clears its mounted neighbours by ${rec.worstBodyClearanceM} m, but penetrates ${rec.worstPoolClearanceM} m against ${rec.pool.body}/${rec.pool.model} — a model the parked pool can draw (${rec.poolContactPct}% of independent draws contact a body). The draw is deterministic, so this does not block the emit`);
      }
    }
  }
  return { lesson, districtId, bodies, records, problems, caveats };
}

/**
 * WHAT A COMMITTED WITNESS SAYS ABOUT ITSELF, for a reader that has the pathref
 * but not the district — `path-follow.mjs:selectWitness`. A witness with no
 * `bodyClearance` is UNSCREENED, which is not a pass: it is reported as such.
 */
export function witnessBodyVerdict(witness, { floorM = BODY_FLOOR_M } = {}) {
  const bc = witness?.bodyClearance;
  if (!bc || bc.screen !== "body-screen/1") return { state: "unscreened", why: "the witness carries no body-screen result — this pathref predates the screen; re-run build-pathrefs.mjs" };
  if (bc.verdict === "no-bodies") return { state: "clear", why: "no parked, occupant or held body in this lesson's district" };
  if (bc.verdict === "unmeasured" || !Number.isFinite(bc.worstBodyClearanceM)) return { state: "unscreened", why: "the witness carries a body-screen result with no clearance in it" };
  if (bc.worstBodyClearanceM < floorM) {
    return {
      state: "unsafe",
      why: `the witness passes within ${bc.worstBodyClearanceM} m of ${bc.mounted?.body ?? "?"} (mounted ${bc.mounted?.model ?? "?"}) at s = ${bc.mounted?.atS ?? "?"} m — under the ${floorM} m floor`,
    };
  }
  return { state: bc.worstBodyClearanceM < (bc.warnM ?? BODY_WARN_M) ? "tight" : "clear", why: `worst body clearance ${bc.worstBodyClearanceM} m` };
}

// ---------------------------------------------------------------------------
// Calibration anchor — sc-park-left seg 1, witness −0.5, vs lotlf-bay-4
// ---------------------------------------------------------------------------

/**
 * THE ANCHOR READS A FROZEN WITNESS, NOT THE LIVE PATHREF (2026-09-16).
 *
 * The seven numbers below were measured independently against ONE path: the
 * sc-park-left segment-1 witness at startAlongM −0.5 as committed at HEAD
 * 4209dad — the one the pc-path canary followed to 0.014–0.088 m before it hit
 * `lotlf-bay-4`. `runCalibration` used to fetch that path out of
 * `sc-park-left.pathref.json`, which the builder re-plans. The first re-plan
 * would then have pointed the anchor at a DIFFERENT path and gone on printing
 * CALIBRATED against numbers nobody ever measured on it — the screen would have
 * lost its only independent check at exactly the moment it started being used
 * to change things. The rows now live in `anchor-witness.json` and never move.
 */
export const ANCHOR = {
  lesson: "sc-park-left",
  segment: 1,
  startAlongM: -0.5,
  body: "lotlf-bay-4",
  expect: {
    dret_90: -0.1595,
    arden_x: -0.1959,
    corva_s: -0.3140,
    kargo_v: -0.5656,
    vela_h3: -0.1295,
    pino: 0.1125,
    "(fleet-profile box)": 0.0407,
  },
};

/** The frozen anchor path, read and checked — never defaulted, never regenerated. */
export function anchorWitnessRows() {
  let doc;
  try {
    doc = JSON.parse(readFileSync(ANCHOR_WITNESS, "utf8"));
  } catch (err) {
    throw new Unreadable(`the calibration anchor's frozen witness could not be read (${err.code ?? err.message}) — refusing to calibrate against the live pathref, which the builder re-plans`);
  }
  if (doc.lesson !== ANCHOR.lesson || doc.segment !== ANCHOR.segment || doc.startAlongM !== ANCHOR.startAlongM) {
    throw new Unreadable(`anchor-witness.json holds ${doc.lesson} seg ${doc.segment} witness ${doc.startAlongM}, not ${ANCHOR.lesson} seg ${ANCHOR.segment} witness ${ANCHOR.startAlongM}`);
  }
  if (!Array.isArray(doc.rows) || doc.rows.length < 2) throw new Unreadable("anchor-witness.json holds no rows");
  return doc.rows;
}

export function runCalibration() {
  const { bodies } = bodiesForLesson(ANCHOR.lesson);
  const w = screenRowsAgainstBodies(anchorWitnessRows(), bodies);
  const rows = [];
  let ok = true;
  for (const [model, want] of Object.entries(ANCHOR.expect)) {
    const got = w.perBody.find((p) => p.body === ANCHOR.body && p.model === model);
    if (!got) {
      rows.push({ model, want, got: null, diff: null, ok: false });
      ok = false;
      continue;
    }
    const diff = got.worst - want;
    const pass = Math.abs(diff) <= 0.01;
    if (!pass) ok = false;
    rows.push({ model, want, got: got.worst, atS: got.atS, diff, ok: pass });
  }
  return { ok, rows };
}

// ---------------------------------------------------------------------------
// GLB re-measurement (verification of FLEET_BODY_HALF)
// ---------------------------------------------------------------------------

const WHEEL_NODE_RE = /^wheel_(FL|FR|RL|RR)$/;
const SKIP_BODY_MATERIALS = new Set(["headlight", "taillight"]);

/**
 * Re-derive the fleet half extents straight from the shipped GLBs with the
 * runtime's own rule. Returns null (never a guess) if the glTF toolchain in
 * platform/node_modules cannot be loaded.
 */
export async function measureFleetFromGlb({ glbDirs = GLB_DIRS } = {}) {
  let io;
  try {
    const { createRequire } = await import("node:module");
    const { pathToFileURL } = await import("node:url");
    const req = createRequire(pathToFileURL(join(REPO, "platform", "package.json")));
    const imp = (spec) => import(pathToFileURL(req.resolve(spec)).href);
    const { NodeIO } = await imp("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await imp("@gltf-transform/extensions");
    const draco3d = req("draco3dgltf");
    io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });
  } catch (err) {
    return { measured: null, why: `glTF toolchain unavailable: ${err.message}` };
  }
  const underWheel = (node) => {
    for (let n = node; n; n = n.getParentNode?.() ?? null) if (WHEEL_NODE_RE.test(n.getName())) return true;
    return false;
  };
  const measured = {};
  const dirsRead = [];
  const dirsUnread = [];
  for (const dir of glbDirs) {
    let files;
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".glb"));
      dirsRead.push(dir);
    } catch (err) {
      dirsUnread.push(`${dir} (${err.code ?? err.message})`);
      continue;
    }
    for (const f of files) {
      const name = f.replace(/\.glb$/, "");
      if (!FLEET.includes(name)) continue;
      if (measured[name]) continue;
      const doc = await io.read(join(dir, f));
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const node of doc.getRoot().listNodes()) {
        const mesh = node.getMesh();
        if (!mesh || underWheel(node)) continue;
        for (const prim of mesh.listPrimitives()) {
          const matName = (prim.getMaterial()?.getName() ?? "").toLowerCase();
          if (SKIP_BODY_MATERIALS.has(matName)) continue;
          const pos = prim.getAttribute("POSITION");
          if (!pos) continue;
          const mn = pos.getMin([]);
          const mx = pos.getMax([]);
          for (let k = 0; k < 3; k++) {
            if (mn[k] < min[k]) min[k] = mn[k];
            if (mx[k] > max[k]) max[k] = mx[k];
          }
        }
      }
      measured[name] = { across: max[0], along: Math.max(max[2], -min[2]) };
    }
  }
  return { measured, why: null, dirsRead, dirsUnread };
}

/**
 * THE PIPELINE'S FLEET TABLE, RE-MEASURED AND REFUSED RATHER THAN DEFAULTED.
 *
 * `measureFleetFromGlb` reports; this REFUSES. It throws `Unreadable` when the
 * glTF toolchain cannot be loaded, when a model the parked pool can draw has no
 * GLB under any of `glbDirs`, or when a measurement has moved more than `tolM`
 * off the pinned table — three failures that a screen must NOT survive, because
 * the only thing it could do instead is size that model with somebody else's
 * box and report the resulting air as clearance.
 *
 * `__tests__/path-body-screen.test.mjs` points it at an empty directory and
 * asserts the throw rather than a fallback.
 */
export async function verifiedFleetHalf({ glbDirs = GLB_DIRS, tolM = 0.001, pinned = FLEET_BODY_HALF } = {}) {
  const { measured, why, dirsUnread = [] } = await measureFleetFromGlb({ glbDirs });
  const where = `under ${glbDirs.join(", ")}${dirsUnread.length ? ` (unreadable: ${dirsUnread.join("; ")})` : ""}`;
  if (!measured) throw new Unreadable(`fleet body extents UNREADABLE: ${why} — refusing to fall back to the pinned table`);
  const missing = Object.keys(pinned).filter((m) => !measured[m]);
  if (missing.length) throw new Unreadable(`fleet body extents UNREADABLE: no GLB for ${missing.join(", ")} ${where} — refusing to fall back to the pinned size`);
  const drift = [];
  for (const [name, half] of Object.entries(pinned)) {
    const m = measured[name];
    const da = Math.abs(m.across - half.across);
    const dl = Math.abs(m.along - half.along);
    if (da > tolM || dl > tolM) drift.push(`${name} pinned ${half.across.toFixed(4)} x ${half.along.toFixed(4)} but the GLB measures ${m.across.toFixed(4)} x ${m.along.toFixed(4)}`);
  }
  if (drift.length) throw new Unreadable(`fleet body extents MOVED: ${drift.join("; ")} — the pinned table is stale, re-pin it before screening`);
  return measured;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function canaryStatus() {
  const routing = JSON.parse(readFileSync(ROUTING_JSON, "utf8"));
  const byLesson = new Map();
  for (const r of routing.rows) {
    const prev = byLesson.get(r.lesson) ?? [];
    prev.push(r.canaryPassed);
    byLesson.set(r.lesson, prev);
  }
  return byLesson;
}

function fmt(n, d = 4) {
  return n === null || n === undefined || !Number.isFinite(n) ? "  n/a  " : n.toFixed(d).padStart(8);
}

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const doGlb = !argv.includes("--no-glb");
  const only = argv.includes("--lesson") ? argv[argv.indexOf("--lesson") + 1] : null;
  const out = { calibration: null, extents: null, lessons: [], refused: [] };

  // 1 — GLB verification
  if (doGlb) {
    const { measured, why } = await measureFleetFromGlb();
    if (!measured) {
      out.extents = { ok: false, why };
    } else {
      const rows = [];
      let ok = true;
      for (const [name, half] of Object.entries(FLEET_BODY_HALF)) {
        const m = measured[name];
        if (!m) {
          rows.push({ model: name, ok: false, why: "no GLB found" });
          ok = false;
          continue;
        }
        const da = Math.abs(m.across - half.across);
        const dl = Math.abs(m.along - half.along);
        const pass = da <= 0.001 && dl <= 0.001;
        if (!pass) ok = false;
        rows.push({ model: name, table: half, glb: m, ok: pass });
      }
      out.extents = { ok, rows };
    }
    if (!asJson) {
      console.log("=== FLEET BODY EXTENTS — pinned table vs the shipped GLBs ===");
      if (!out.extents.rows) console.log(`  REFUSED: ${out.extents.why}`);
      else {
        for (const r of out.extents.rows) {
          console.log(
            `  ${r.model.padEnd(13)} table ${r.table ? `${r.table.across.toFixed(4)} x ${r.table.along.toFixed(4)}` : "—"}` +
              `   glb ${r.glb ? `${r.glb.across.toFixed(4)} x ${r.glb.along.toFixed(4)}` : "—"}   ${r.ok ? "ok" : "MISMATCH"}`,
          );
        }
      }
      console.log(`  -> ${out.extents.ok ? "ALL MATCH" : "DISAGREEMENT — table is stale"}\n`);
    }
  }

  // 2 — calibration
  const cal = runCalibration();
  out.calibration = cal;
  if (!asJson) {
    console.log("=== CALIBRATION — sc-park-left seg 1, witness -0.5, vs lotlf-bay-4 ===");
    console.log("  model                half (across x along)   expected     computed        diff");
    for (const r of cal.rows) {
      const h = r.model.startsWith("(") ? FLEET_PROFILE_BOX : FLEET_BODY_HALF[r.model];
      console.log(
        `  ${r.model.padEnd(20)} ${h.across.toFixed(3)} x ${h.along.toFixed(3)}        ` +
          `${fmt(r.want)}   ${fmt(r.got)}   ${fmt(r.diff)}  ${r.ok ? "" : "  <-- OFF"}`,
      );
    }
    console.log(`  -> ${cal.ok ? "CALIBRATED (all within 1 cm)" : "NOT CALIBRATED"}\n`);
  }
  if (!cal.ok) {
    if (asJson) console.log(JSON.stringify(out, null, 2));
    else console.log("REFUSING to print a clearance table: the screen did not reproduce the anchor.");
    process.exitCode = 2;
    return;
  }

  // 3 — every pathref
  const canary = canaryStatus();
  const lessons = readdirSync(PATHREF_DIR)
    .filter((f) => f.endsWith(".pathref.json"))
    .map((f) => f.replace(".pathref.json", ""))
    .filter((l) => !only || l === only)
    .sort();

  for (const lesson of lessons) {
    let s;
    try {
      s = screenLesson(lesson);
    } catch (err) {
      out.refused.push({ lesson, why: err.message });
      if (!asJson) console.log(`=== ${lesson}: COULD NOT MEASURE — ${err.message}\n`);
      continue;
    }
    const flags = canary.get(lesson) ?? [];
    const passed = flags.some((f) => f === true);
    const lessonWorst = s.witnesses.reduce(
      (m, w) => (w.worst.worst < m.worst.worst ? w : m),
      { worst: { worst: Infinity } },
    );
    out.lessons.push({
      lesson: s.lesson,
      districtId: s.districtId,
      canaryPassed: flags,
      bodies: s.bodies.map((b) => ({ id: b.id, kind: b.kind, x: b.x, z: b.z, psiDeg: b.psiDeg, mountedModel: b.mountedModel ?? null, seed: b.seed ?? null })),
      witnesses: s.witnesses.map((w) => ({
        segment: w.segment, gear: w.gear, segClass: w.segClass, startAlongM: w.startAlongM,
        arcLengthM: w.arcLengthM, worstDevM: w.worstDevM,
        worst: w.worst, worstMounted: w.worstMounted, worstFleetBox: w.worstFleetBox,
        poolFraction: w.poolFraction,
      })),
    });
    if (asJson) continue;
    console.log(`=== ${lesson}   [${s.districtId}]   canaryPassed: ${JSON.stringify(flags)}${passed ? "  <-- PASSED A CANARY" : ""}`);
    console.log(`    bodies: ${s.bodies.length}` + (s.bodies.length ? ` — ${s.bodies.map((b) => `${b.id}${b.mountedModel ? `=${b.mountedModel}` : ""}`).join(", ")}` : " (none in this district)"));
    if (s.bodies.length === 0) {
      console.log("    -> no parked/occupant/held body: nothing for a body screen to hit\n");
      continue;
    }
    console.log("    seg gear  wit    arcM   devM |   worst    body/model                      atS |  mounted  poolFrac | fleetBox");
    for (const w of s.witnesses) {
      const wo = w.worst;
      console.log(
        `    ${String(w.segment).padStart(3)} ${String(w.gear).padStart(4)}  ${String(w.startAlongM).padStart(4)} ` +
          `${w.arcLengthM.toFixed(1).padStart(7)} ${String(w.worstDevM).padStart(6)} |${fmt(wo.worst)}  ` +
          `${`${wo.body}/${wo.model}`.padEnd(32)} ${String(wo.atS).padStart(5)} |${fmt(w.worstMounted?.worst, 3)}  ` +
          `${(w.poolFraction * 100).toFixed(0).padStart(4)}%  |${fmt(w.worstFleetBox?.worst, 3)}`,
      );
    }
    console.log(`    LESSON WORST ${lessonWorst.worst.worst.toFixed(4)} m against ${lessonWorst.worst.body}/${lessonWorst.worst.model} at s=${lessonWorst.worst.atS} (witness ${lessonWorst.startAlongM}, segment ${lessonWorst.segment})\n`);
  }

  if (asJson) console.log(JSON.stringify(out, null, 2));
}

if (import.meta.url === pathToFileURLSafe(process.argv[1])) {
  await main();
}

function pathToFileURLSafe(p) {
  try {
    return new URL(`file://${p.startsWith("/") ? "" : "/"}${p.replace(/\\/g, "/")}`).href;
  } catch {
    return "";
  }
}
