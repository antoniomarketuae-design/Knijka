/**
 * THE PARKING KIT — the pieces every authored parking demo is cut from, in ONE
 * leaf module (catalogue-demo-curvature:dae908c7, family «curvpark2»).
 *
 * WHY A LEAF. curvdepth (1f1536d) wrote this kit inside traces/scParkDepth.ts,
 * module-private, and scParkDepth imports lotObstacleRects and the parked-car
 * footprint from traces/scParkPerpRev while evaluating top-level drives at load
 * (`GS = kerbPark(…)`, `VN = bayReverse(…)`, …). A family builder that imported
 * the kit back from scParkDepth would close an import cycle whose load order
 * decides which module meets a binding in its temporal dead zone. So the kit
 * lives here, and imports nothing from traces/ but the curvature kit
 * (./drivablePath) and the recorder's types — never a builder. scParkDepth and
 * scParkPerpRev import it and re-export every name they exported before, so
 * every importer of theirs is unedited and every trace they record is
 * byte-for-byte what it was (MOVED, not rewritten: the bodies below are
 * scParkDepth.ts's and scParkPerpRev.ts's own, with `export` added).
 *
 * See traces/scParkDepth.ts's header for what the car's own circle does to a
 * parking manoeuvre, and traces/__tests__/sc-park-depth-drivable.test.ts /
 * park-family-drivable.test.ts for the pins.
 */

import { obbSeparationM, type Obb2D } from "../collision";
import type { ScenarioBayMeta } from "../contracts";
import { scenarioBaysOf } from "../contracts";
import { CHASSIS_HALF_EXTENTS } from "../vehicle";
import {
  authoredDrive,
  DRIVABLE_MIN_CENTRE_RADIUS_M,
  sShift,
  straight,
  swingForShift,
  turn,
  withRunOut,
  type AuthoredPath,
  type CurvatureStretch,
  type PathPose,
} from "./drivablePath";
import type { DriveStep, ObstacleRect2D } from "./recorder";

// ---------------------------------------------------------------------------
// The lot's parked cars, as the headless gate arms them (from scParkPerpRev)
// ---------------------------------------------------------------------------

/**
 * Nominal parked-car footprint for the HEADLESS collision gate, m. The live
 * scene colliders use each GLB rig's measured bbox (ScenarioObstacles);
 * these run a hair larger than the fleet's compacts so the recorded gate is
 * at least as strict as the scene.
 */
export const PARKED_CAR_HALF_WIDTH_M = 0.9;
export const PARKED_CAR_HALF_LENGTH_M = 2.25;

/**
 * The headless obstacle set of a scenario-lot district: one parked-car rect
 * per OCCUPIED bay (meta.scenario.bays — the same single truth the scene's
 * ScenarioObstacles mounts from).
 */
export function lotObstacleRects(districtRaw: unknown): ObstacleRect2D[] {
  return scenarioBaysOf(districtRaw)
    .filter((b: ScenarioBayMeta) => b.occupied)
    .map((b) => ({
      x: b.x,
      y: b.y,
      headingDeg: b.headingDeg,
      halfWidthM: PARKED_CAR_HALF_WIDTH_M,
      halfLengthM: PARKED_CAR_HALF_LENGTH_M,
      withWhat: "vehicle" as const,
    }));
}

// ---------------------------------------------------------------------------
// Shared geometry kit (from scParkDepth)
// ---------------------------------------------------------------------------

/** Northbound drawn curb-lane centre on every lot road (2 × 3.25 m × 2.5 / 2). */
export const X_LANE = 4.0625;
/** Where the feeder leg hands over to the aisle leg (and 18 km/h to 9). */
export const FEEDER_END_Y = -24;
/** The gate: north of it the road is the unpainted `service` aisle. */
export const GATE_Y = -18;

export type Pts = Array<[number, number]>;
export const D2R = Math.PI / 180;
export const R_MIN = DRIVABLE_MIN_CENTRE_RADIUS_M;

/**
 * The aisle leg: from the feeder's end, straight to the gate, ONE ramped S
 * onto the manoeuvring line `x`, then straight north to `y`. The whole lateral
 * move is north of the gate. `radiusM` is the S's tightest radius: 6 m where
 * the row stands across the drawn lane and the car has to be off it before
 * the first parked nose (≈ 9 m past the gate), gentler where it only has to
 * give the row a little more room.
 */
/**
 * Where the S of `aisleTo(x, …, o)` is over — the y at which the car is square
 * on its line `x` (the S's start plus its own length; the start itself when
 * there is no shift). A set-up move's indicator is cancelled here (ЗДвП чл. 26:
 * «…се прекратява веднага след приключване на маневрата»).
 */
export function aisleSEndY(x: number, o: { radiusM?: number; rampM?: number; shiftFromY?: number } = {}): number {
  const shift = x - X_LANE;
  const fromY = o.shiftFromY ?? GATE_Y;
  if (Math.abs(shift) <= 1e-9) return fromY;
  const k = Math.sign(shift) / (o.radiusM ?? 6);
  const rampM = o.rampM ?? 1.5;
  return fromY + authoredDrive({ x: 0, y: 0, headingDeg: 0 }, sShift(swingForShift(shift, k, rampM), k, rampM), 1).end.y;
}

export function aisleTo(
  x: number,
  y: number,
  o: { radiusM?: number; rampM?: number; shiftFromY?: number } = {},
): AuthoredPath {
  const shift = x - X_LANE;
  const fromY = o.shiftFromY ?? GATE_Y;
  const prog: CurvatureStretch[] = [straight(fromY - FEEDER_END_Y)];
  let sLenM = 0;
  if (Math.abs(shift) > 1e-9) {
    const k = Math.sign(shift) / (o.radiusM ?? 6);
    const rampM = o.rampM ?? 1.5;
    const s = sShift(swingForShift(shift, k, rampM), k, rampM);
    sLenM = authoredDrive({ x: 0, y: 0, headingDeg: 0 }, s, 1).end.y;
    prog.push(...s);
  }
  const restM = y - (fromY + sLenM);
  if (restM < 0) throw new Error(`aisleTo(${x}, ${y}): the S needs ${sLenM.toFixed(2)} m, past the stop`);
  prog.push(straight(restM));
  const path = authoredDrive({ x: X_LANE, y: FEEDER_END_Y, headingDeg: 0 }, prog, 1);
  // The S returns the heading to north by symmetry; say so exactly, so the leg
  // that starts where this one stops starts square.
  return { ...path, end: { x, y, headingDeg: 0 } };
}

/** The first `lenM` metres of a path (a mistake demo that never finishes it). */
export function firstMetres(path: AuthoredPath, lenM: number): Pts {
  const out: Pts = [path.points[0]];
  let acc = 0;
  for (let i = 1; i < path.points.length && acc < lenM; i++) {
    acc += Math.hypot(path.points[i][0] - path.points[i - 1][0], path.points[i][1] - path.points[i - 1][1]);
    out.push(path.points[i]);
  }
  return out;
}

/** The headless footprint of the car parked in a bay at (x, y) on `headingDeg`. */
export function parkedRect(x: number, y: number, headingDeg: number): Obb2D {
  return {
    x,
    y,
    headingDeg,
    halfWidthM: PARKED_CAR_HALF_WIDTH_M,
    halfLengthM: PARKED_CAR_HALF_LENGTH_M,
  };
}

/**
 * What the LIVE scene stands in a bay, m (half across, half along): the
 * collider ScenarioObstacles mounts is a cuboid sized off the model's own GLB
 * (`vehicleColliderDims(rig.halfWidth, rig.halfLength, …)`), not the uniform
 * 0.9 × 2.25 m rect the recorder's gate arms. By value, for the models these
 * demos run into; traces/__tests__/sc-park-depth-drivable.test.ts pins every
 * entry against the GLB table (parkDepthProduct GLB_HALF) and every demo's
 * named model against the one the lesson world actually parks there.
 */
export const PARK_DEPTH_LIVE_HALF = {
  vela_h3: { across: 1.05, along: 2.16 },
  pino: { across: 0.9901, along: 1.84 },
  dret_90: { across: 1.01, along: 2.255 },
  arden_x: { across: 1.0701, along: 2.24 },
  kargo_v: { across: 1.15, along: 2.705 },
} as const;
export type ParkDepthContactModel = keyof typeof PARK_DEPTH_LIVE_HALF | "wall";

/**
 * The body a contact demo is CUT against: the per-axis SMALLER of the gate's
 * rect and the live collider (round 2, D1). Both are centred on the bay and
 * share its heading, so that box is exactly the part of the car the two agree
 * on — a footprint inside it is a contact the live scene reports AND the
 * headless gate grades. Cutting against either one alone left three demos
 * resting a centimetre to 0.31 m short of the car the explanation says they
 * hit (a pino is 0.41 m shorter than the gate's rect; a vela_h3 0.09 m).
 */
export function contactBody(rect: Obb2D, model: ParkDepthContactModel): Obb2D {
  if (model === "wall") return rect; // the held slab and the gate's rect are one size
  const live = PARK_DEPTH_LIVE_HALF[model];
  return {
    ...rect,
    halfWidthM: Math.min(rect.halfWidthM, live.across),
    halfLengthM: Math.min(rect.halfLengthM, live.along),
  };
}

/** How far into the contact body a demo comes to rest, m («a bumper's give»). */
export const CONTACT_DEPTH_M = 0.12;

/**
 * A path cut where the mistake it demonstrates has HAPPENED: at the first
 * vertex where the car's footprint (headed along the path, as the recorder
 * poses it) is `CONTACT_DEPTH_M` inside `contactBody(rect, model)` — with the
 * recorder's 5 cm run-out, so the car comes to rest ON that vertex and not
 * 5 cm short of it (`depthM`: a demo that must rest deeper — sc-park-45's
 * corner-cut, whose real car trails its ghost — says so; lane curvpark2 round
 * 2). The recorder brakes into the end of a stopping step, so
 * the ghost comes to rest against the car it touched instead of driving on
 * through it — which is what four of the old demos did, billing a second,
 * third and fourth car nobody's explanation mentioned.
 */
export function untilContact(pts: Pts, dir: 1 | -1, rect: Obb2D, model: ParkDepthContactModel, depthM = CONTACT_DEPTH_M): Pts {
  const body = contactBody(rect, model);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    let headingDeg = (Math.atan2(bx - ax, by - ay) * 180) / Math.PI;
    if (dir < 0) headingDeg += 180;
    const sep = obbSeparationM(
      { x: bx, y: by, headingDeg, halfWidthM: CHASSIS_HALF_EXTENTS.x, halfLengthM: CHASSIS_HALF_EXTENTS.z },
      body,
    );
    if (sep <= -depthM) return withRunOut(pts.slice(0, i + 1));
  }
  throw new Error("untilContact: the path never reaches the body it is meant to touch");
}

// --- The 90° reverse into a perpendicular bay ------------------------------

export interface BayReverse {
  /** Where the car stops before the manoeuvre, nose north. */
  setup: PathPose;
  /** Setup → the look half-way round the swing (the wheel still held). */
  a: AuthoredPath;
  /** The rest of the swing, the wheel coming straight, and in to the bay line. */
  b: AuthoredPath;
}

/**
 * Reverse through 90° into the bay at (`bay.x`, `bay.y`) from the line x = `x0`:
 * straight back `s0M`, the wheel wound on over `rampInM`, held, unwound over
 * `rampOutM`, then straight in along the bay's axis. The setup's y is DERIVED —
 * it is wherever the swing has to begin for the car to arrive on the axis.
 * `side` +1 = bays on the east, −1 = on the west (the mirror).
 */
export function bayReverse(
  side: 1 | -1,
  x0: number,
  bay: { x: number; y: number },
  o: { radiusM: number; s0M: number; rampInM: number; rampOutM: number },
): BayReverse {
  const k = side / o.radiusM;
  const [rampIn, hold, rampOut] = turn(Math.PI / 2, k, o.rampInM, o.rampOutM);
  const progA: CurvatureStretch[] = [straight(o.s0M), rampIn, { ...hold, lenM: hold.lenM / 2 }];
  const progB: CurvatureStretch[] = [{ ...hold, lenM: hold.lenM / 2 }, rampOut];
  const d = authoredDrive({ x: 0, y: 0, headingDeg: 0 }, [...progA, ...progB], -1).end;
  const inM = side * (bay.x - (x0 + d.x));
  if (inM < 0.02) throw new Error(`bayReverse from x=${x0}: the swing ends ${(-inM).toFixed(2)} m past the bay`);
  const setup: PathPose = { x: x0, y: bay.y - d.y, headingDeg: 0 };
  const a = authoredDrive(setup, progA, -1);
  const b = authoredDrive(a.end, [...progB, straight(inM)], -1);
  return { setup, a, b };
}

// --- The 45° reverse into an echelon bay -----------------------------------

/**
 * Reverse through 45° onto the axis of a 135° echelon bay and straight in to
 * its centre: the car ends facing back up the aisle at 315°, which is the whole
 * point of reverse-angle parking — you leave nose-first, looking where you go.
 * `a` is the swing (ending with the wheel straight, on the axis), `b` the
 * straight run in.
 */
export function echelonReverse(
  bay: { x: number; y: number },
  o: { radiusM: number; s0M: number; rampInM: number; rampOutM: number; inM: number },
): BayReverse {
  const progA: CurvatureStretch[] = [
    straight(o.s0M),
    ...turn(Math.PI / 4, 1 / o.radiusM, o.rampInM, o.rampOutM),
  ];
  const d = authoredDrive({ x: 0, y: 0, headingDeg: 0 }, [...progA, straight(o.inM)], -1).end;
  const setup: PathPose = { x: bay.x - d.x, y: bay.y - d.y, headingDeg: 0 };
  const a = authoredDrive(setup, progA, -1);
  const b = authoredDrive(a.end, [straight(o.inM)], -1);
  return { setup, a, b };
}

// --- The reverse S of a kerb-side parallel park ----------------------------

export interface KerbPark {
  setup: PathPose;
  /** Straight back, then the first swing (wheel right) — ends with the wheel
   *  straight, the car at `swingDeg` to the kerb: reference point 2. */
  a: AuthoredPath;
  /** The counter-swing (wheel left) down to the bottom of the slot. */
  b: AuthoredPath;
  /** The pull forward — the one correction — parallel to the kerb at its end. */
  fwd: AuthoredPath;
  /** The angle to the kerb at reference point 2, degrees. */
  swingDeg: number;
  /** How far the car rolls straight back before the wheel goes over, m. */
  s0M: number;
}

/**
 * The parallel park, solved backwards from where it has to END.
 *
 * The car must come to rest at (`bay.x`, `restY`), parallel, in TWO moves:
 * the reverse, and one forward pull. With `shortDeg` = 0 the reverse S itself
 * ends parallel and the forward pull is straight. In a slot too short for that
 * (see the file header) the S stops `shortDeg` short of parallel and the
 * forward pull is the one correction: the wheel to the right, then straight.
 *
 * HOW SHORT, AND WHY THE STRAIGHT. The ghost is headed along its path, but a
 * real car's body FOLLOWS its centre's path, about a rear-axle offset (1.28 m)
 * behind it: a pull that turns 12° in 1.4 m leaves the body 7° short of
 * parallel when the ghost is square. So the S stops only 6–7.5° short and the
 * pull carries 0.6–1.0 m of straight after its turn — enough for a car that
 * starts square and steers within its lock to rest within 4° of the ghost
 * (the drivability pin's «car that starts square» is that car). Round 1 got
 * there with a third move instead (a long pull past the middle, then a roll
 * straight back), which was a second correction.
 *
 * Two closures, both exact:
 *  - sideways: the first swing's angle is solved (bisection — the sideways
 *    travel of the S is strictly increasing in it) so that from the setup line
 *    x = `xs` the car arrives on the forward pull's start;
 *  - lengthways: the car STOPS at `setupY` — the reference point the briefing
 *    teaches — and the one free length takes up the rest: the straight roll
 *    back `s0M` when the forward pull is a turn, the forward pull itself when
 *    it is straight (`s0M` is then given).
 */
export function kerbPark(
  xs: number,
  setupY: number,
  bay: { x: number; y: number },
  o: {
    radiusM: number;
    restY: number;
    /** Ramp onto the first swing / through the middle and off the second, m. */
    rampInM: number;
    rampM: number;
    shortDeg: number;
    /** Forward pull when `shortDeg` > 0: ramp of its turn, the straight after it. */
    fwdRampM?: number;
    fwdStraightM?: number;
    /** Roll straight back before the swing, when `shortDeg` = 0. */
    s0M?: number;
  },
): KerbPark {
  const k = 1 / o.radiusM;
  const short = o.shortDeg * D2R;
  const fwdTurn: CurvatureStretch[] =
    short > 0
      ? [...turn(short, k, o.fwdRampM ?? 0.4, o.fwdRampM ?? 0.4), straight(o.fwdStraightM ?? 0.05)]
      : [];
  const dF = authoredDrive({ x: 0, y: 0, headingDeg: -o.shortDeg }, fwdTurn, 1).end;
  const fwdStartX = bay.x - dF.x;
  const first = (swing: number) => turn(swing, k, o.rampInM, o.rampM);
  const second = (swing: number) => turn(swing - short, -k, o.rampM, o.rampM);
  const sideways = (swing: number) =>
    authoredDrive({ x: 0, y: 0, headingDeg: 0 }, [...first(swing), ...second(swing)], -1).end.x;
  let lo = Math.max((k * (o.rampInM + o.rampM)) / 2, short + k * o.rampM) + 1e-9;
  let hi = Math.PI / 2;
  if (sideways(lo) > fwdStartX - xs) throw new Error("kerbPark: the ramps alone carry the car past the bay line");
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (sideways(mid) < fwdStartX - xs) lo = mid;
    else hi = mid;
  }
  const swing = (lo + hi) / 2;
  const dS = authoredDrive({ x: 0, y: 0, headingDeg: 0 }, [...first(swing), ...second(swing)], -1).end;
  let s0M: number;
  let fwdProg: CurvatureStretch[];
  if (short > 0) {
    // The forward pull is fixed; the roll back takes up the length.
    s0M = setupY - (o.restY - dF.y - dS.y);
    fwdProg = fwdTurn;
  } else {
    s0M = o.s0M ?? 1.5;
    fwdProg = [straight(o.restY - (setupY - s0M + dS.y))];
  }
  if (s0M < 0.2) throw new Error(`kerbPark: only ${s0M.toFixed(2)} m to roll back before the swing`);
  if (fwdProg[fwdProg.length - 1].lenM < 0.02) throw new Error("kerbPark: no forward pull left");
  const setup: PathPose = { x: xs, y: setupY, headingDeg: 0 };
  const a = authoredDrive(setup, [straight(s0M), ...first(swing)], -1);
  const b = authoredDrive(a.end, second(swing), -1);
  const fwd = authoredDrive(b.end, fwdProg, 1);
  return { setup, a, b, fwd, swingDeg: swing / D2R, s0M };
}

/** The three glances every reverse manoeuvre owes before the gear goes in. */
export const LOOK_BEFORE_REVERSE: DriveStep[] = [
  { kind: "glance", mirror: "left" },
  { kind: "glance", mirror: "right" },
  { kind: "glance", mirror: "rear" },
];

/** The settle-and-hold that completes a parkInBay contract (holdSec 1.5). */
export const SETTLE: DriveStep[] = [
  { kind: "glance", mirror: "left" },
  { kind: "glance", mirror: "right" },
  { kind: "pause", sec: 2.2, brake: true },
  { kind: "indicator", setting: "off" },
];

/** Where a lot's aisle begins (lot-*-v1: the `service` edge north of y −30). */
export const LOT_AISLE_Y = -30;
/**
 * Up the approach road to the aisle (lane curvpark2 round 2, CP2-5): every
 * lot lesson's instruction 1 says «Влез в паркинга по алеята и карай бавно —
 * не повече от 10 км/ч», and every lot demo used to enter the aisle at 17.8
 * km/h, down to 10 only 8 m in (y −22). The approach is driven at 18 km/h to
 * 3 m short of the aisle and at 9 from there — the recorder brakes 18 → 10 in
 * under 2 m (SCRIPT_DECEL) — so the car is at the aisle's pace where the aisle
 * begins. The first step runs 5 cm on along the road (the recorder ends a step
 * 5 cm short of its last point), so the second starts on the pose it ended on.
 */
export function lotApproach(end: { x: number; y: number }, stopAtEnd?: false): DriveStep[] {
  const from = LOT_AISLE_Y - 3;
  return [
    { kind: "drive", points: [[end.x, -105], [end.x, from + 0.05]], targetKmh: 18, stopAtEnd: false },
    { kind: "drive", points: [[end.x, from], [end.x, end.y]], targetKmh: 9, ...(stopAtEnd === false ? { stopAtEnd } : {}) },
  ];
}

/** The pace the car arrives at a setup stop with, km/h. */
export const SETUP_KMH = 5.5;
/** …and how far short of the stop it is already down to it, m. */
export const SETUP_SLOW_M = 12;

/**
 * The aisle leg to a setup stop, as two drive steps: the aisle's own pace, then
 * SETUP_KMH over the last twelve metres.
 *
 * WHY. Every Задача 1 here is a halt gate capped at 6 km/h on a 5 m disc (7.5 m
 * on L1), and the lesson coaches a car that ENTERS that disc above the cap:
 * «Стигна точката, но твърде бързо … стигна дотук с 9 км/ч». The old demos all
 * drove into it at 8–9 km/h and braked on the mark, so the drive shown as
 * correct drew that card at every rung. A demo of a halt arrives slowly.
 */
export function toSetup(path: AuthoredPath, aisleKmh: number, atLine?: { y: number; steps: DriveStep[] }): DriveStep[] {
  const slowFromY = path.end.y - SETUP_SLOW_M;
  const i = path.points.findIndex(([, y]) => y >= slowFromY);
  if (atLine === undefined) {
    if (i <= 0) return [{ kind: "drive", points: withRunOut(path.points), targetKmh: SETUP_KMH }];
    return [
      { kind: "drive", points: path.points.slice(0, i + 1), targetKmh: aisleKmh },
      { kind: "drive", points: withRunOut(path.points.slice(i)), targetKmh: SETUP_KMH },
    ];
  }
  // lane curvpark2 round 2 (CP2-6): `atLine.steps` — the set-up move's indicator
  // cancelled, at least — spliced in where the car is square on its line, the
  // drive never stopping there. Every slice but the last runs SPLICE_RUN_OUT_PTS
  // (5 cm at 1 mm per point) along the path itself, so the next slice starts on
  // the pose this one ends on (the recorder ends a step 5 cm short of its last
  // point); without `atLine` the two slices above are byte-for-byte as before.
  const j = path.points.findIndex(([, y]) => y >= atLine.y);
  if (j <= 0 || j >= path.points.length - 1) throw new Error(`toSetup: the line is reached at y ${atLine.y}, off the path`);
  const cuts = [...new Set([0, ...(i > 0 ? [i] : []), j])].sort((a, b) => a - b);
  const out: DriveStep[] = [];
  for (let c = 0; c < cuts.length; c++) {
    const a = cuts[c];
    if (a === j) out.push(...atLine.steps);
    const kmh = i > 0 && a < i ? aisleKmh : SETUP_KMH;
    if (c + 1 < cuts.length) {
      out.push({ kind: "drive", points: path.points.slice(a, cuts[c + 1] + 1 + SPLICE_RUN_OUT_PTS), targetKmh: kmh, stopAtEnd: false });
    } else {
      out.push({ kind: "drive", points: withRunOut(path.points.slice(a)), targetKmh: kmh });
    }
  }
  return out;
}
const SPLICE_RUN_OUT_PTS = 50;

/**
 * A SET-UP MOVE TO THE LEFT, SIGNALLED (lane curvpark2 round 2, integrator
 * ruling CP2-6). ЗДвП чл. 25, ал. 1 (content/law/acts/zdvp.json) counts «да се
 * отклони надясно или наляво по платното за движение» among manoeuvres, and
 * чл. 26 asks, before any manoeuvre with a sideways deviation, for a timely
 * signal «включен през цялото време на извършване на маневрата», cancelled
 * «веднага след приключване на маневрата». So a set-up move of more than the
 * car's half width onto its line is signalled LEFT — the left mirror, the left
 * indicator, then the S — and the indicator goes off where the car is square
 * on the line (`lineY`, `aisleSEndY`); the bay's RIGHT signal is given only
 * after that, at the setup. No demo drifts away from the side it signals.
 * `look` false: the no-observation demos, which take no look at all.
 *
 * `at` (lane curvpark2 round 4, integrator ruling CP2-1ter): the signal is
 * given where the path reaches `at.signalY` — `at.steps` (a caption) first —
 * instead of where the path begins, so a set-up move begun late along a long
 * straight is signalled shortly before it, not 10 m ahead of it; the drive
 * runs on through that point without stopping (the slice runs on
 * SPLICE_RUN_OUT_PTS, as `toSetup`'s do). Without `at` the steps are
 * byte-for-byte what they were.
 */
export function leftSetUpMove(
  path: AuthoredPath,
  aisleKmh: number,
  lineY: number,
  look = true,
  at?: { signalY: number; steps?: DriveStep[] },
): DriveStep[] {
  const signal: DriveStep[] = [
    ...(at?.steps ?? []),
    ...(look ? [{ kind: "glance", mirror: "left" } as DriveStep] : []),
    { kind: "indicator", setting: "left" },
  ];
  const cancel = { y: lineY, steps: [{ kind: "indicator", setting: "off" } as DriveStep] };
  if (at === undefined) return [...signal, ...toSetup(path, aisleKmh, cancel)];
  const k = path.points.findIndex(([, y]) => y >= at.signalY);
  if (k <= 0) throw new Error(`leftSetUpMove: the signal point y ${at.signalY} is off the path`);
  return [
    { kind: "drive", points: path.points.slice(0, k + 1 + SPLICE_RUN_OUT_PTS), targetKmh: aisleKmh, stopAtEnd: false },
    ...signal,
    ...toSetup({ ...path, points: path.points.slice(k) }, aisleKmh, cancel),
  ];
}

/**
 * A set-up move's signal lead, s: the product's own INDICATOR_LEAD_SEC
 * (orchestrator/runners.ts — not imported: this module stays a leaf; the pin
 * asserts the two are equal).
 */
export const SET_UP_SIGNAL_LEAD_SEC = 3.0;
/** One blink of the ghost's lamp, s (components/sim/ShadowCar.tsx BLINK_PERIOD_S): the least gap that shows as two signals. */
export const SIGNAL_BLINK_SEC = 0.75;
/** What the recorder's speed changes and 60 Hz sampling may eat of a lead or a gap, s. */
const SIGNAL_MARGIN_SEC = 0.2;
/**
 * The pace of S2 and its signal (round 5): S2 begins beside the row, and as the
 * car turns left its tail swings right, toward the parked noses — the product's
 * rear cue (hud/rearProximity.ts) reads that row behind the car at 0.7–2.9 m,
 * and at REAR_CUE_MOVING_KMH 5 km/h or more it would paint it RED («closing» at
 * traffic speed) on the drive taught as correct. So S2 is driven at a crawl
 * under that speed (pinned against it); the badge is the honest amber «Кола
 * отзад» of a tail swinging toward a parked car.
 */
export const S2_KMH = 4.5;
/** Where a two-stage set-up's aisle leg begins — 2 m into the lot's aisle (LOT_AISLE_Y), so its first signal lies on it. */
export const TWO_STAGE_FROM_Y = LOT_AISLE_Y + 2;
/** The first S's left signal, this far before it: 8 m at the aisle's 9 km/h = 3.2 s (sc-park-perp-forward's lead). */
const S1_SIGNAL_LEAD_M = 8;
const kitS = (shift: number): CurvatureStretch[] => {
  const k = Math.sign(shift) / 6;
  return sShift(swingForShift(shift, k, 1.5), k, 1.5);
};
/** The length along y of the kit's aisle S (radius 6, ramps 1.5) for a lateral `shift`, m. */
export function kitSLength(shift: number): number {
  return authoredDrive({ x: 0, y: 0, headingDeg: 0 }, kitS(shift), 1).end.y;
}

/** A two-stage set-up's path and the points its signals hang on. */
export interface TwoStageSetUp {
  path: AuthoredPath;
  /** the right-half line the car drives past the row on */
  xm: number;
  s1SignalY: number;
  s1FromY: number;
  s1EndY: number;
  s2SignalY: number;
  /** S2 begins here and ends AT the setup stop */
  s2FromY: number;
}

/**
 * THE TWO-STAGE SET-UP (lane curvpark2 round 5, integrator ruling CP2-1quater,
 * 2026-11-08). On a two-way aisle where ЗДвП чл. 15, ал. 1 binds, чл. 35,
 * ал. 2 lets only the TURN'S START use another part of the carriageway — so the
 * car stays in the right half as long as the geometry allows. From the drawn
 * lane centre (X_LANE): S1, the kit's aisle S (radius 6, ramps 1.5), onto the
 * right-half line `xm` well before the row (the row's noses stand across the
 * drawn lane); that line, straight, past the row; S2, the same S, from `xm` onto
 * the setup line `x`, ending AT the setup stop `y` (the latest it can begin: the
 * stop is fixed by the swing into the bay). Only S2's tail is left of the
 * centre line.
 *
 * THE SIGNALS (ЗДвП чл. 25, ал. 1 and чл. 26, content/law/acts/zdvp.json:
 * «да се отклони надясно или наляво по платното» is a manoeuvre, signalled
 * «включен през цялото време на извършване на маневрата» and cancelled
 * «веднага след приключване на маневрата»). Each S is a move of its own: the
 * left signal S1_SIGNAL_LEAD_M before S1 (at the aisle's pace), off where the
 * car is square on `xm`; from there the walking pace (SETUP_KMH); the left
 * signal again SET_UP_SIGNAL_LEAD_SEC before S2, off at rest at the stop. S1 is
 * placed (derived, never chosen) so that between S1's end and S2's signal there
 * is one blink of the lamp (SIGNAL_BLINK_SEC), each plus SIGNAL_MARGIN_SEC.
 */
export function twoStageSetUp(xm: number, x: number, y: number): TwoStageSetUp {
  const vSetup = SETUP_KMH / 3.6;
  const l1 = kitSLength(xm - X_LANE);
  const l2 = kitSLength(x - xm);
  const s2FromY = y - l2;
  const s2SignalY = s2FromY - (SET_UP_SIGNAL_LEAD_SEC + SIGNAL_MARGIN_SEC) * vSetup;
  const s1EndY = s2SignalY - (SIGNAL_BLINK_SEC + SIGNAL_MARGIN_SEC) * vSetup;
  const s1FromY = s1EndY - l1;
  const s1SignalY = s1FromY - S1_SIGNAL_LEAD_M;
  if (s1SignalY <= TWO_STAGE_FROM_Y) throw new Error(`twoStageSetUp(${xm}, ${x}, ${y}): the first signal (y ${s1SignalY.toFixed(2)}) is south of the aisle leg`);
  const prog: CurvatureStretch[] = [
    straight(s1FromY - TWO_STAGE_FROM_Y),
    ...kitS(xm - X_LANE),
    straight(s2FromY - s1EndY),
    ...kitS(x - xm),
  ];
  const path = authoredDrive({ x: X_LANE, y: TWO_STAGE_FROM_Y, headingDeg: 0 }, prog, 1);
  // Both S's return the heading to north by symmetry; say so exactly, so the
  // swing that starts where this leg stops starts square.
  return { path: { ...path, end: { x, y, headingDeg: 0 } }, xm, s1SignalY, s1FromY, s1EndY, s2SignalY, s2FromY };
}

/**
 * The drive steps of a two-stage set-up (see `twoStageSetUp`): the aisle's
 * pace to S1's end, the walking pace (SETUP_KMH) from there to S2's signal and
 * the crawl (S2_KMH) from there to the stop; at each signal
 * point its `steps` (a caption), the left mirror (unless `look` is false — the
 * no-observation demos) and the left indicator; the indicator off where S1 is
 * over and, at rest, at the stop. Every slice but the last runs
 * SPLICE_RUN_OUT_PTS along the path, as `toSetup`'s do.
 */
export function twoStageSteps(
  ts: TwoStageSetUp,
  aisleKmh: number,
  look = true,
  captions: { s1?: DriveStep[]; s2?: DriveStep[] } = {},
): DriveStep[] {
  const pts = ts.path.points;
  const at = (y: number) => {
    const i = pts.findIndex(([, py]) => py >= y);
    if (i <= 0 || i >= pts.length - 1) throw new Error(`twoStageSteps: y ${y.toFixed(2)} is off the path`);
    return i;
  };
  const signal = (steps: DriveStep[] = []): DriveStep[] => [
    ...steps,
    ...(look ? [{ kind: "glance", mirror: "left" } as DriveStep] : []),
    { kind: "indicator", setting: "left" },
  ];
  const cuts: Array<{ i: number; steps: DriveStep[]; kmh: number }> = [
    { i: 0, steps: [], kmh: aisleKmh },
    { i: at(ts.s1SignalY), steps: signal(captions.s1), kmh: aisleKmh },
    { i: at(ts.s1EndY), steps: [{ kind: "indicator", setting: "off" }], kmh: SETUP_KMH },
    { i: at(ts.s2SignalY), steps: signal(captions.s2), kmh: S2_KMH },
  ];
  for (let c = 1; c < cuts.length; c++) {
    if (!(cuts[c].i > cuts[c - 1].i)) throw new Error("twoStageSteps: the signal points are out of order");
  }
  const out: DriveStep[] = [];
  for (let c = 0; c < cuts.length; c++) {
    out.push(...cuts[c].steps);
    if (c + 1 < cuts.length) {
      out.push({ kind: "drive", points: pts.slice(cuts[c].i, cuts[c + 1].i + 1 + SPLICE_RUN_OUT_PTS), targetKmh: cuts[c].kmh, stopAtEnd: false });
    } else {
      out.push({ kind: "drive", points: withRunOut(pts.slice(cuts[c].i)), targetKmh: cuts[c].kmh });
    }
  }
  out.push({ kind: "indicator", setting: "off" });
  return out;
}

/** Reversing pace, km/h — пешеходна скорост. */
export const REVERSE_KMH = 3.5;
/** The last metre in a bay, and every forward pull inside a slot. */
export const CREEP_KMH = 2.5;
