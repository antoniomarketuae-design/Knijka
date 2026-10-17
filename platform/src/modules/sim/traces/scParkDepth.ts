/**
 * PARKING-DEPTH authored drives — the ten new „how to park" drills
 * (templates-parking3.ts), one shadow + two mistake demos each, on the ten
 * committed lot-* districts this wave generated.
 *
 * WHY ONE FILE. Every drill here is a low-speed manoeuvre on a
 * gen_parking_lot.mjs district, so they share the same few pieces of geometry:
 * the approach up the 2-lane residential feeder, the 90° reverse swing into a
 * perpendicular bay, the reverse S of a kerb-side parallel park, the 45°
 * reverse into an echelon bay. Ten copies of those is how the four earlier
 * parking scripts drifted apart; here they are ONE parametric kit and each
 * drill is its own short story on top of it.
 *
 * WHAT MAKES THE TEN DIFFERENT — and it is never the district's colour:
 *   sc-park-gap-short   7.3 m of kerb (1.8 car lengths) — the S only just fits
 *   sc-park-gap-long   12.7 m of kerb — the reverse is unnecessary, nose in
 *   sc-park-van         a VAN on one flank: less room, and no sight-line
 *   sc-park-45-rev      a 135° echelon mouth — nose-in is impossible
 *   sc-park-left        the row on the WEST kerb — every reference mirrored
 *   sc-park-zebra       a чл. 98 span with a real В27 post and painted zebra
 *   sc-park-wall        the END bay, closed by a garage wall
 *   sc-park-night       an unlit row; the lamps are the whole first duty
 *   sc-park-double      two rows, a 5.56 m corridor — no room to swing wide
 *   sc-park-judge       two free slots, 4.3 m and 9.5 m — one is not a slot
 *
 * EVERY PATH IS ONE THE PRODUCT CAR CAN DRIVE (catalogue-demo-curvature:
 * dae908c7, 2026-10-11). Until then nine of the ten drills were authored as
 * polylines: a 4 m car-CENTRE quarter circle into a bay, two 4 m arcs for the
 * S, and corners with no fillet at all between the legs — and the recorder is
 * kinematic, so the ghost stood on those points headed along their tangent. The
 * census (traces/__tests__/demo-curvature-census) measured the result against
 * the car's own tightest body-centre circle, 3.955 m (vehicle/tuning.ts:
 * wheelbase 2.56 m, rear axle 1.28 m behind the centre, STEER_MAX_ANGLE 0.6
 * rad): the nine correct demos turned on 2.55–3.82 m and seventeen mistake
 * demos on 0.51–3.82 m. Three of the correct demos (van, left, double) also
 * stood inside a parked car as the live scene's per-model colliders see it.
 *
 * So nine drills are now INTEGRATED from curvature programmes (./drivablePath —
 * the sc-park-bay-exit-rev recipe, 8579f1d): the body-centre path's curvature
 * is held at ≤ 1 / 4.6 m (1 / 4.5 m in the one corridor that needs it — see
 * sc-park-double) and only ever changes in ramps, so the wheel is turned, never
 * snapped; the car is at rest wherever the gear changes; and every correct
 * demo keeps ≥ 0.25 m from every parked car, the van and the wall as the
 * product's boxes see them. All of it is pinned in
 * traces/__tests__/sc-park-depth-drivable.test.ts. (sc-park-gap-long was never
 * an offender and is byte-for-byte what it was; its three helpers — `approach`,
 * `easeTo`, `forwardS` — stay for it alone.)
 *
 * WHAT THE CAR'S OWN CIRCLE DOES TO A PARKING MANOEUVRE, since it moved three
 * reference points a student is told:
 *  - a 90° reverse into a bay needs the car ≈ 2 m off the row's noses, not a
 *    metre and a half: at 4.6 m the swing carries the centre 5.5 m sideways,
 *    and from any closer the tail arrives before the car is straight;
 *  - a parallel park cannot start its swing the moment the rear bumpers are
 *    level — the S is ≈ 6 m long — so the car rolls straight back first;
 *  - in the 7.3 m slot one sweep does not fit at all with a quarter-metre kept
 *    at both ends: the reverse ends 7.5° short of parallel and the forward
 *    pull the briefing already asks for is the one correction that
 *    straightens the car — two moves, the examiner's «без повече от една
 *    корекция» — and its swing at reference point 2 is ≈ 40°, not 45°.
 *
 * SAFETY ENVELOPE the paths respect (why the numbers are what they are):
 *  - the APPROACH edge is `residential` and painted, so forward driving there
 *    stays in the curb lane at x = +4.06; the AISLE is `service`, which
 *    paintsCentreLine/paintsLaneLines refuse, so the lane detectors cannot arm
 *    on it at all — every lateral move happens north of the gate (y = −18);
 *  - reverse gear is exempt from every lane/wrong-way detector by A12 law;
 *  - SCRIPT_DECEL (4.6 m/s²) is under the harsh-braking threshold, so no stop
 *    in this file bills HARSH_BRAKING_NO_CAUSE;
 *  - collisionMinKmh is 0 for every drive: in a parking lot a 2 km/h bumper
 *    touch IS the graded mistake (doc 76 §0).
 *
 * The committed traces under content/traces/<drill-id> ARE the recordings of
 * these scripts; the gate is
 * traces/__tests__/sc-park-depth-traces.test.ts (RECORD_TRACES=1 re-records).
 */

import { obbSeparationM, type Obb2D } from "../collision";
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
import type {
  DriveScript,
  DriveStep,
  ObstacleRect2D,
  RecordedDrive,
  RecordScriptedDriveOptions,
} from "./recorder";
import { recordScriptedDrive } from "./recorder";
import {
  lotObstacleRects,
  PARKED_CAR_HALF_LENGTH_M,
  PARKED_CAR_HALF_WIDTH_M,
} from "./scParkPerpRev";

// ---------------------------------------------------------------------------
// Shared geometry kit
// ---------------------------------------------------------------------------

/** Northbound drawn curb-lane centre on every lot road (2 × 3.25 m × 2.5 / 2). */
const X_LANE = 4.0625;
/** Where the feeder leg hands over to the aisle leg (and 18 km/h to 9). */
const FEEDER_END_Y = -24;
/** The gate: north of it the road is the unpainted `service` aisle. */
const GATE_Y = -18;

type Pts = Array<[number, number]>;
const D2R = Math.PI / 180;
const R_MIN = DRIVABLE_MIN_CENTRE_RADIUS_M;

/** Approach polyline: the spawn pose up the feeder to the aisle mouth. */
function approach(spawnY: number): Pts {
  return [
    [X_LANE, spawnY],
    [X_LANE, FEEDER_END_Y],
  ];
}

/**
 * Ease off the curb lane onto the manoeuvring line `x` — sc-park-gap-long's
 * shape, kept for it alone (see the file header): a polyline, so its corners
 * are corners. Every other drill uses `aisleTo`.
 */
function easeTo(x: number, endY: number): Pts {
  const gateY = GATE_Y;
  const shift = Math.min(6, Math.max(1.5, (endY - gateY) / 2));
  return [
    [X_LANE, FEEDER_END_Y],
    [X_LANE, gateY],
    [(X_LANE + x) / 2, gateY + shift],
    [x, gateY + shift * 2],
    [x, endY],
  ];
}

/**
 * The aisle leg: from the feeder's end, straight to the gate, ONE ramped S
 * onto the manoeuvring line `x`, then straight north to `y`. The whole lateral
 * move is north of the gate. `radiusM` is the S's tightest radius: 6 m where
 * the row stands across the drawn lane and the car has to be off it before
 * the first parked nose (≈ 9 m past the gate), gentler where it only has to
 * give the row a little more room.
 */
function aisleTo(
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
function firstMetres(path: AuthoredPath, lenM: number): Pts {
  const out: Pts = [path.points[0]];
  let acc = 0;
  for (let i = 1; i < path.points.length && acc < lenM; i++) {
    acc += Math.hypot(path.points[i][0] - path.points[i - 1][0], path.points[i][1] - path.points[i - 1][1]);
    out.push(path.points[i]);
  }
  return out;
}

/** The headless footprint of the car parked in a bay at (x, y) on `headingDeg`. */
function parkedRect(x: number, y: number, headingDeg: number): Obb2D {
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
function contactBody(rect: Obb2D, model: ParkDepthContactModel): Obb2D {
  if (model === "wall") return rect; // the held slab and the gate's rect are one size
  const live = PARK_DEPTH_LIVE_HALF[model];
  return {
    ...rect,
    halfWidthM: Math.min(rect.halfWidthM, live.across),
    halfLengthM: Math.min(rect.halfLengthM, live.along),
  };
}

/** How far into the contact body a demo comes to rest, m («a bumper's give»). */
const CONTACT_DEPTH_M = 0.12;

/**
 * A path cut where the mistake it demonstrates has HAPPENED: at the first
 * vertex where the car's footprint (headed along the path, as the recorder
 * poses it) is `CONTACT_DEPTH_M` inside `contactBody(rect, model)` — with the
 * recorder's 5 cm run-out, so the car comes to rest ON that vertex and not
 * 5 cm short of it. The recorder brakes into the end of a stopping step, so
 * the ghost comes to rest against the car it touched instead of driving on
 * through it — which is what four of the old demos did, billing a second,
 * third and fourth car nobody's explanation mentioned.
 */
function untilContact(pts: Pts, dir: 1 | -1, rect: Obb2D, model: ParkDepthContactModel): Pts {
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
    if (sep <= -CONTACT_DEPTH_M) return withRunOut(pts.slice(0, i + 1));
  }
  throw new Error("untilContact: the path never reaches the body it is meant to touch");
}

// --- The 90° reverse into a perpendicular bay ------------------------------

interface BayReverse {
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
function bayReverse(
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
function echelonReverse(
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

interface KerbPark {
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
function kerbPark(
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
const LOOK_BEFORE_REVERSE: DriveStep[] = [
  { kind: "glance", mirror: "left" },
  { kind: "glance", mirror: "right" },
  { kind: "glance", mirror: "rear" },
];

/** The settle-and-hold that completes a parkInBay contract (holdSec 1.5). */
const SETTLE: DriveStep[] = [
  { kind: "glance", mirror: "left" },
  { kind: "glance", mirror: "right" },
  { kind: "pause", sec: 2.2, brake: true },
  { kind: "indicator", setting: "off" },
];

/** The pace the car arrives at a setup stop with, km/h. */
const SETUP_KMH = 5.5;
/** …and how far short of the stop it is already down to it, m. */
const SETUP_SLOW_M = 12;

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
function toSetup(path: AuthoredPath, aisleKmh: number): DriveStep[] {
  const slowFromY = path.end.y - SETUP_SLOW_M;
  const i = path.points.findIndex(([, y]) => y >= slowFromY);
  if (i <= 0) return [{ kind: "drive", points: withRunOut(path.points), targetKmh: SETUP_KMH }];
  return [
    { kind: "drive", points: path.points.slice(0, i + 1), targetKmh: aisleKmh },
    { kind: "drive", points: withRunOut(path.points.slice(i)), targetKmh: SETUP_KMH },
  ];
}

/** Reversing pace, km/h — пешеходна скорост. */
const REVERSE_KMH = 3.5;
/** The last metre in a bay, and every forward pull inside a slot. */
const CREEP_KMH = 2.5;

// ---------------------------------------------------------------------------
// Extra obstacle bodies (the two drills whose neighbour is not a parked car)
// ---------------------------------------------------------------------------

/**
 * The kargo_v van standing in lot-van-v1's bay 2. The bay is left FREE in the
 * district on purpose so the scene does not also draw a deterministic civilian
 * car there; this rect is the headless twin of the held-scenery body
 * (scene/scenarioSceneryProps.ts pins itself against these numbers).
 *
 * A van is wider AND ~0.45 m longer than the fleet compacts, so it protrudes
 * further into the aisle than the parked cars beside it — which is exactly the
 * sight-line the drill teaches around.
 */
export const PARK_DEPTH_VAN: ObstacleRect2D = {
  x: 5.03,
  y: -2.7,
  headingDeg: 90,
  halfWidthM: 1.0,
  halfLengthM: 2.65,
  withWhat: "vehicle",
};

/**
 * lot-wall-v1's garage end wall: 6 m of masonry across the north end of the
 * row, 1.65 m past the last bay's line. `staticObject` — the untagged
 * classification a live wall collider also grades as.
 */
export const PARK_DEPTH_WALL: ObstacleRect2D = {
  x: 5.03,
  y: 8.6,
  headingDeg: 90,
  halfWidthM: 0.2,
  halfLengthM: 3.0,
  withWhat: "staticObject",
};

// ---------------------------------------------------------------------------
// 1 — sc-park-gap-short (lot-gap-short-v1): 7.3 m of kerb
// ---------------------------------------------------------------------------
// Cars at y = ∓5.9 leave clear space y ∈ (−3.65, 3.65). The car stops where the
// briefing says: parallel to the car in front, about half a metre off its
// flank (x 3.9: 0.52 m to the dret_90's side), rear bumpers level (y 5.67).
//
// THE EXAMINER'S STANDARD IS THE DEMO'S (round 2, D3): «в очертанията,
// успоредно, без повече от една корекция» (teach.examinerBg). So the park is
// TWO moves — the reverse, and one forward correction — and nothing else:
//  - From that setup the product car's S does NOT fit in one sweep with a
//    quarter-metre kept at both ends (round 1's scan: the best one-sweep S on
//    a 4.6 m circle passes 0.03 m from one car or the other), so the reverse
//    stops 7.5° short of parallel, at the bottom of the slot, 0.34 m off the
//    car behind;
//  - the one correction is a 1.5 m pull forward, the wheel right and then
//    straight, which turns those 7.5° and stops the car parallel 0.3 m ahead
//    of the slot's middle and 0.24 m in from its kerb line — inside the
//    tightest rung's tolerance (0.5 m × 0.85) with 0.1 m to spare.
// What it costs: the swing at reference point 2 is 39°, not the 43° of a
// three-move park from 0.72 m out — the briefing's «около 45°» became «около
// 40°» — and the car finishes a quarter-metre off-centre instead of on it.
// Round 1's third move (pull 2.4 m forward, past the middle, then roll back a
// metre) was a second correction the examiner's standard does not allow.
// Every number is from a scan of the product car — the recorded ghost, the
// real car whose centre follows it, and a car that starts square and steers
// within its lock — each ≥ 0.25 m from both cars on the larger of the
// gate's rect and the live collider. The ramps are 0.3–0.4 m: the product's
// wheel goes from straight to full lock in 0.31 s (STEER_SPEED 3.2 /s), 0.3 m
// of travel at the reversing pace and 0.2 m at the creep the swing and the
// pull are driven at.

/** Where the one correction leaves the car: parallel, 0.3 m ahead of the
 *  slot's middle (y 0) and 0.24 m in from the bay line (x 6.28). */
const GS_REST = { x: 6.04, y: 0.3 };
const GS_SETUP_X = 3.9;
const GS_SETUP_Y = 5.67;
const GS_SHORT_DEG = 7.5;
const GS = kerbPark(GS_SETUP_X, GS_SETUP_Y, GS_REST, {
  radiusM: R_MIN,
  restY: GS_REST.y,
  rampInM: 0.4,
  rampM: 0.3,
  shortDeg: GS_SHORT_DEG,
  fwdRampM: 0.3,
  fwdStraightM: 0.6,
});
/** The gap-short slot's middle — where the mistake demos' bodies are named from. */
const GS_BAY = { x: 6.28, y: 0 };
/** Onto the setup line: 0.36 m, eased over the whole run past the row. */
const gsAisle = () => aisleTo(GS_SETUP_X, GS_SETUP_Y, { radiusM: 30 });

function gsShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Мястото между двете коли е късо — малко над седем метра." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      ...toSetup(gsAisle(), 9),
      {
        kind: "annotation",
        textBg: "Ориентир 1: успоредно на предната кола, на половин метър — задна броня срещу задна броня.",
      },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      {
        kind: "annotation",
        textBg: "В късо място ъгълът трябва да е точен от първия път — докрай надясно.",
      },
      { kind: "drive", points: withRunOut(GS.a.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "annotation", textBg: "Ориентир 2: под около 40°. Спри и погледни назад — сега докрай наляво и назад до дъното." },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: withRunOut(GS.b.points), targetKmh: CREEP_KMH, reverse: true },
      {
        kind: "annotation",
        textBg: "Дъното — а колата още стои леко накосо. Една корекция: напред с волан надясно, докато застанеш успоредно.",
      },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "drive", points: withRunOut(GS.fwd.points), targetKmh: CREEP_KMH },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: в очертанията, успоредно, с повече от метър пред и зад теб." },
    ],
  };
}

function gsMistakeShallow(): DriveScript {
  // Half the wheel: the swing is on a 9.2 m circle instead of 4.6, the car
  // comes round only 22° and is carried 1.2 m sideways instead of 2.6 — and
  // the driver keeps backing at that angle until the tail meets the car behind.
  const k = 1 / (2 * R_MIN);
  const s = sShift(swingForShift(1.2, k, 0.8), k, 0.8);
  const sweep = authoredDrive(GS.setup, [straight(GS.s0M), ...s, straight(3)], -1);
  const cut = untilContact(sweep.points, -1, parkedRect(GS_BAY.x, -5.9, 0), "vela_h3");
  const half = Math.floor(cut.length / 2);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: воланът не отива докрай и ъгълът остава плитък." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      ...toSetup(gsAisle(), 9),
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: cut.slice(0, half + 1), targetKmh: 3, reverse: true },
      { kind: "annotation", textBg: "Колата стои далеч от бордюра — и вместо да излезе, шофьорът продължава назад…" },
      { kind: "drive", points: cut.slice(half), targetKmh: 2.5, reverse: true },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Задницата удари задната кола. В късо място плиткият ъгъл няма поправка — излез напред и започни отначало с пълен волан.",
      },
    ],
  };
}

function gsMistakeForwardHit(): DriveScript {
  // The other end of the same short slot: the correct first swing, but the
  // counter-swing is given up 28° short of parallel — the car is crooked and a
  // metre off the kerb — and the driver then straightens FORWARD, watching the
  // wheel, until the nose is in the car in front.
  const k = 1 / R_MIN;
  const crooked = authoredDrive(GS.a.end, turn((GS.swingDeg - 28) * D2R, -k, 0.4, 0.4), -1);
  const pull = authoredDrive(crooked.end, [...turn(28 * D2R, k, 0.6, 0.6), straight(4)], 1);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: изправянето напред в късо място, без да се брои разстоянието отпред." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      ...toSetup(gsAisle(), 9),
      { kind: "pause", sec: 1.0, brake: true },
      ...LOOK_BEFORE_REVERSE,
      { kind: "drive", points: withRunOut(GS.a.points), targetKmh: 3, reverse: true },
      { kind: "pause", sec: 0.6, brake: true },
      { kind: "drive", points: withRunOut(crooked.points), targetKmh: 3, reverse: true },
      { kind: "annotation", textBg: "Влезе накриво и далеч от бордюра — и подкарва напред, за да се изправи…" },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "drive",
        points: untilContact(pull.points, 1, parkedRect(GS_BAY.x, 5.9, 0), "dret_90"),
        targetKmh: 2.5,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предницата удари предната кола. В късо място изправянето става на сантиметри: гледай предната броня, не волана.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 2 — sc-park-gap-long (lot-gap-long-v1): 12.7 m of kerb, nose-in
// ---------------------------------------------------------------------------

// The one drill this file still authors as a polyline: it was never tighter
// than the car (5.6 m at its tightest) and is byte-for-byte what it was.

/**
 * The shallow FORWARD S of a nose-in kerb entry, travelling north. Long radius on purpose — a nose-in entry is only legal
 * where the slot is long enough for a gentle arc.
 */
function forwardS(
  startX: number,
  startY: number,
  targetX: number,
  r: number,
): { points: Array<[number, number]>; endY: number } {
  const L = targetX - startX;
  const entry = Math.acos(Math.max(-1, Math.min(1, 1 - L / (2 * r))));
  const steps = 8;
  const arcA: Array<[number, number]> = [];
  for (let k = 1; k <= steps; k++) {
    const th = (k / steps) * entry;
    arcA.push([startX + r * (1 - Math.cos(th)), startY + r * Math.sin(th)]);
  }
  const [mx, my] = arcA[arcA.length - 1];
  const first: Array<[number, number]> = [[startX, startY], ...arcA.slice(0, steps - 1)];
  const arcB: Array<[number, number]> = [];
  for (let k = steps - 1; k >= 0; k--) {
    const [px, py] = first[k];
    arcB.push([2 * mx - px, 2 * my - py]);
  }
  return { points: [...arcA, ...arcB], endY: startY + 2 * r * Math.sin(entry) };
}

// The assess halt IS the turn-in pose: a separate "reposition" leg of a few
// decimetres is not a manoeuvre, it is a pivot — the recorder faithfully turns
// the car 90° to drive 0.3 m sideways, and the flank meets the parked car.
const GL_BAY_X = 6.28;
const GL_ASSESS_X = 3.5;
const GL_ASSESS_Y = -8.37;

function glShadow(): DriveScript {
  const s = forwardS(GL_ASSESS_X, GL_ASSESS_Y, GL_BAY_X, 7.0);
  return {
    steps: [
      { kind: "annotation", textBg: "Това място е дълго — над дванайсет метра, три пъти колата." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(GL_ASSESS_X, GL_ASSESS_Y), targetKmh: 9 },
      {
        kind: "annotation",
        textBg: "Задача 1: спри срещу мястото и го премери — над две дължини на колата, значи се влиза напред.",
      },
      { kind: "pause", sec: 1.4, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Плавна дъга надясно и вътре — без заден ход." },
      { kind: "drive", points: s.points, targetKmh: 6 },
      { kind: "annotation", textBg: "Изправи волана и се прибери плътно до бордюра." },
      { kind: "drive", points: [[GL_BAY_X, s.endY], [GL_BAY_X, 0]], targetKmh: 4 },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: успоредно на бордюра, по посоката на движението." },
    ],
  };
}

function glMistakeOverrun(): DriveScript {
  // The long-slot failure: the driver turns in late and keeps going, so the
  // nose ends inside the car in front instead of in the middle of the space.
  const s = forwardS(3.5, -2.0, GL_BAY_X, 7.0);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: завоят тръгва късно и колата продължава напред в мястото." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(3.5, -2.0), targetKmh: 9 },
      { kind: "drive", points: s.points, targetKmh: 6, stopAtEnd: false },
      { kind: "drive", points: [[GL_BAY_X, s.endY], [GL_BAY_X, 8.0]], targetKmh: 4 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предницата влезе в колата отпред. Дългото място не е безкрайно: влизаш срещу СРЕДАТА му, не срещу предния му край.",
      },
    ],
  };
}

function glMistakeBlindReverse(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: излишен заден ход в място, в което се влиза напред." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(4.0, 6.0), targetKmh: 9 },
      { kind: "pause", sec: 0.8, brake: true },
      { kind: "annotation", textBg: "Задна предавка веднага — без огледала, без рамо." },
      {
        kind: "drive",
        points: [[4.0, 6.0], [4.0, 3.6]],
        targetKmh: 4,
        reverse: true,
        stopAtEnd: false,
      },
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Пешеходецът зад колата остана невидим. В дълго място заден ход изобщо не е нужен — а щом го правиш, чл. 40 иска да си сигурен, че отзад е чисто.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 3 — sc-park-van (lot-van-v1): the wide neighbour
// ---------------------------------------------------------------------------
// The setup line is x = −0.6: the car's flank 2.1 m off the van's nose (which
// stands at x = 2.33, 0.45 m further out than the cars' 2.78). From a metre and
// a half — the line this drill used to name — the product car's swing does not
// fit: at 4.6 m it carries the centre 5.5 m sideways, the bay centre is 5.03 m
// away, and the tail arrives at the neighbours before the car is straight. The
// car comes to rest 0.05 m north of the bay's centre line: the van is 0.1 m
// wider than the car on the other side, so the middle between the two BODIES
// (0.75 m of air on each flank) is not the middle between the LINES. That is
// instruction 7 — «центрирай се ПО-ДАЛЕЧ от буса — той стои по-навън от
// линиите си» — and the old demo's dead-centre stop did not do it.

const VN_BAY = { x: 5.03, y: 0.05 };
const VN_SETUP_X = -0.6;
const VN_SWING = { radiusM: R_MIN, s0M: 1.0, rampInM: 2.0, rampOutM: 1.6 };
const VN = bayReverse(1, VN_SETUP_X, VN_BAY, VN_SWING);
const vnAisle = () => aisleTo(VN.setup.x, VN.setup.y);

function vnShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Свободното гнездо е точно до бус — той краде и място, и видимост." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      ...toSetup(vnAisle(), 9),
      {
        kind: "annotation",
        textBg: "Подмини гнездото и спри: задната броня подминава съседната кола, на два метра от носа на буса.",
      },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      {
        kind: "annotation",
        textBg: "Влизай към страната на буса по-предпазливо — той е по-широк от очертанията си.",
      },
      { kind: "drive", points: withRunOut(VN.a.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "annotation", textBg: "Спри на половината завой и погледни пак към буса: зад него огледалото ти не вижда." },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Изправи волана и се центрирай ПО-ДАЛЕЧ от буса." },
      { kind: "drive", points: withRunOut(VN.b.points), targetKmh: CREEP_KMH, reverse: true },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: в очертанията, с работещо разстояние до буса." },
    ],
  };
}

function vnMistakeEarly(): DriveScript {
  // The same swing, begun 2.6 m too early — before the car has passed the free
  // bay — so it is aimed at the van's bay instead.
  const early = bayReverse(1, VN_SETUP_X, { x: 5.03, y: -2.5 }, VN_SWING);
  const swing: Pts = [...early.a.points, ...early.b.points.slice(1)];
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: завоят тръгва, преди колата да е подминала гнездото." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      ...toSetup(aisleTo(early.setup.x, early.setup.y), 9),
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: untilContact(swing, -1, PARK_DEPTH_VAN, "kargo_v"), targetKmh: 3, reverse: true },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Задницата влезе в буса, а не в гнездото. Ориентирът е задната броня на съседа: докато не си я подминал, воланът стои прав.",
      },
    ],
  };
}

function vnMistakeBlind(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: заден ход покрай бус, без нито един поглед назад." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      ...toSetup(vnAisle(), 9),
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "drive",
        points: firstMetres(VN.a, 2.1),
        targetKmh: 4,
        reverse: true,
        stopAtEnd: false,
      },
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Пешеходец, минаващ иззад буса, остана скрит до удара. Точно това прави бусът опасен: огледалата ти свършват там, където започва той.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 4 — sc-park-45-rev (lot-45rev-v1): reverse angle parking
// ---------------------------------------------------------------------------
// «Само до 45°, не докрай» is about how far the car comes ROUND, not the wheel:
// the swing is on the same 4.6 m circle as every other, and it stops at 45°.
// The straight run down the bay's axis is 3.5 m — the length that puts the
// setup stop at x = 0.55, a metre off the echelon cars' aisle corners and
// 1.4 m from the template's own mark (0.9, 6.0).

const RV_BAY = { x: 4.8, y: 0 };
const RV = echelonReverse(RV_BAY, { radiusM: R_MIN, s0M: 0.6, rampInM: 1.2, rampOutM: 1.2, inM: 3.5 });
const rvAisle = () => aisleTo(RV.setup.x, RV.setup.y);

function rvShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Устата на това косо място гледа назад — напред просто няма как да се влезе." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      ...toSetup(rvAisle(), 9),
      { kind: "annotation", textBg: "Подмини мястото и спри успоредно на алеята — оттук започва завъртането." },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      { kind: "annotation", textBg: "На заден ход, волан надясно — само 45°, не докрай." },
      { kind: "drive", points: withRunOut(RV.a.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "annotation", textBg: "Колата легна по линиите. Спри, погледни назад, изправи волана и влез право до дъното." },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: withRunOut(RV.b.points), targetKmh: 3, reverse: true },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово — и предницата гледа към алеята: излизането ще е с лице напред." },
    ],
  };
}

function rvMistakeNoseIn(): DriveScript {
  // The driver takes it like a forward 45° bay: up the aisle past the cars'
  // corners, wheel right — and the mouth is on the other side.
  const runUp = aisleTo(1.0, -8.3, { radiusM: 5.5 });
  const turnIn = authoredDrive(runUp.end, [{ lenM: 1.5, k0: 0, k1: 1 / R_MIN }, { lenM: 6, k0: 1 / R_MIN, k1: 1 / R_MIN }], 1);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: шофьорът опитва да влезе напред, както в място на 45° по посоката." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      // The echelon cars reach x ≈ 2.57 at their aisle corner, so the run-up
      // line stays at x = 1.0 or the demo grades a graze it never meant.
      { kind: "drive", points: runUp.points, targetKmh: 8 },
      { kind: "annotation", textBg: "Завива надясно към устата… която е от другата страна." },
      {
        kind: "drive",
        points: untilContact(turnIn.points, 1, parkedRect(4.8, -3.82, 135), "vela_h3"),
        targetKmh: 4,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предницата опря в съседната кола. Косо място с обратна уста се взима САМО на заден ход — иначе колата застава напречно на реда.",
      },
    ],
  };
}

function rvMistakeShallow(): DriveScript {
  // The correct setup, but the swing is given up at 20° — and the car backs
  // down that line, across its own bay's mouth, into the next car.
  const shallow = authoredDrive(
    RV.setup,
    [straight(0.6), ...turn(20 * D2R, 1 / R_MIN, 1.0, 1.0), straight(9)],
    -1,
  );
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: завъртането спира по средата и колата влиза под грешен ъгъл." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      ...toSetup(rvAisle(), 9),
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: untilContact(shallow.points, -1, parkedRect(4.8, -3.82, 135), "vela_h3"),
        targetKmh: 3,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Под този ъгъл колата не влиза в мястото, а в съседа. 45° са 45°: довърти завъртането, преди да тръгнеш назад по линиите.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 5 — sc-park-left (lot-left-v1): the row on the west kerb
// ---------------------------------------------------------------------------
// The mirror of the 90° reverse: the setup line is x = +0.5 (2.4 m off the
// west row's noses), so the car still crosses the oncoming half of the aisle
// to reach it — the crossing the drill's first three instructions are about.

const LF_BAY = { x: -5.03, y: 0 };
const LF_SETUP_X = 0.5;
const LF_SWING = { radiusM: R_MIN, s0M: 1.0, rampInM: 2.0, rampOutM: 1.6 };
const LF = bayReverse(-1, LF_SETUP_X, LF_BAY, LF_SWING);
const lfAisle = () => aisleTo(LF.setup.x, LF.setup.y);

function lfShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Свободното гнездо е ОТЛЯВО — цялата маневра е огледална." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      {
        kind: "annotation",
        textBg: "Преди да пресечеш алеята: ляво огледало, после поглед в двете посоки — минаваш през чужд път.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      ...toSetup(lfAisle(), 9),
      { kind: "annotation", textBg: "Подмини гнездото и спри — ориентирите са същите, но в лявото огледало." },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      { kind: "annotation", textBg: "На заден ход, волан ДОКРАЙ НАЛЯВО — обратното на познатото." },
      { kind: "drive", points: withRunOut(LF.a.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "annotation", textBg: "Спри на половината завой и погледни пак — назад и в лявото огледало." },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Изправи волана и се центрирай в очертанията." },
      { kind: "drive", points: withRunOut(LF.b.points), targetKmh: CREEP_KMH, reverse: true },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: същата маневра, огледално — и водещото огледало е лявото." },
    ],
  };
}

function lfMistakeMirrored(): DriveScript {
  // The same swing, begun 2.6 m too early: aimed at the neighbour's bay.
  const early = bayReverse(-1, LF_SETUP_X, { x: -5.03, y: -2.6 }, LF_SWING);
  const swing: Pts = [...early.a.points, ...early.b.points.slice(1)];
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: ръцете правят заучената дясна маневра, а мястото е отляво." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "left" },
      ...toSetup(aisleTo(early.setup.x, early.setup.y), 9),
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: untilContact(swing, -1, parkedRect(-5.03, -2.7, 270), "vela_h3"),
        targetKmh: 3,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Завъртането тръгна твърде рано и задницата влезе в съседната кола. Огледалната маневра иска СЪЩИЯ ориентир — но прочетен в другото огледало.",
      },
    ],
  };
}

/**
 * Where the blind crossing is aimed, and where it is met (round 2, D5).
 *
 * The card says the car «зави наляво през алеята … и се озова пред кола,
 * идваща насреща» — so it is met where the oncoming half IS: past the aisle's
 * centre line (x = 0; the lot road is two 4.06 m halves about it). The correct
 * demo's own crossing only reaches its setup line x = +0.5, right of that
 * line, so the blind turn is aimed further, at x = −1.6 (the turn a driver
 * makes who is heading straight for the free bay on the left), on the same
 * 6 m S north of the gate, and the oncoming car meets it the moment its
 * centre is 0.6 m into the oncoming half.
 */
const LF_CROSS_AIM_X = -1.6;
const LF_CROSS_HIT_X = -0.6;

/** The points of `pts` up to the first one at or west of `x`. */
function untilWestOf(pts: Pts, x: number): Pts {
  const i = pts.findIndex(([px]) => px <= x);
  if (i < 0) throw new Error(`untilWestOf: the path never reaches x = ${x}`);
  return pts.slice(0, i + 1);
}

function lfMistakeCross(): DriveScript {
  // A crossing of the aisle driven a third faster than the correct demo's and
  // with nothing before it: no mirror, no signal, no look.
  const crossing = aisleTo(LF_CROSS_AIM_X, -2, { radiusM: 6 });
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: пресичане на алеята без поглед — отляво идва кола." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      {
        kind: "drive",
        // Into the oncoming half: the hit is staged with the car's centre
        // 0.6 m past the centre line, still turning left across the aisle.
        points: untilWestOf(crossing.points, LF_CROSS_HIT_X),
        targetKmh: 12,
        stopAtEnd: false,
      },
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Пресичането на алеята е маневра като всяка друга: огледало, мигач, поглед — и чак тогава волана. Мястото отляво струва един допълнителен поглед.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 6 — sc-park-zebra (lot-zebra-v1): чл. 98 at a marked crossing
// ---------------------------------------------------------------------------
// The slot is the first one clear of the paint; nothing stands behind it (the
// two bays by the crossing are the ones the law empties), so the S ends
// parallel in one sweep and the pull forward is straight.

const ZB_BAY = { x: 6.28, y: 11.75 };
const ZB_SETUP_X = 4.0;
const ZB_SETUP_Y = 18.0;
const ZB = kerbPark(ZB_SETUP_X, ZB_SETUP_Y, ZB_BAY, {
  radiusM: R_MIN,
  restY: ZB_BAY.y,
  rampInM: 1.2,
  rampM: 0.8,
  shortDeg: 0,
  s0M: 1.6,
});
/** Onto the passing line x = 4.0 — 6 cm — and up to the first stretch's end. */
const zbAisle = (endY: number) => aisleTo(ZB_SETUP_X, endY, { radiusM: 150, shiftFromY: FEEDER_END_Y });

function zbShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "До пътеката има свободни места — но законът ги затваря: самата пътека и 5 метра ПРЕДИ нея." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: zbAisle(-10).points, targetKmh: 10 },
      { kind: "annotation", textBg: "Знакът В27 стои в началото на забраната. Минаваме — не спираме в зоната." },
      { kind: "drive", points: [[ZB_SETUP_X, -10], [ZB_SETUP_X, ZB_SETUP_Y - SETUP_SLOW_M]], targetKmh: 9, stopAtEnd: false },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: withRunOut([[ZB_SETUP_X, ZB_SETUP_Y - SETUP_SLOW_M], [ZB_SETUP_X, ZB_SETUP_Y]]),
        targetKmh: SETUP_KMH,
      },
      {
        kind: "annotation",
        textBg: "Първото разрешено място е чак тук. Ориентир 1: успоредно на предната кола.",
      },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      { kind: "drive", points: withRunOut(ZB.a.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "annotation", textBg: "Ориентир 2: колата е под около 35° към бордюра. Спри, погледни назад — и волана наляво." },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: withRunOut(ZB.b.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "drive", points: withRunOut(ZB.fwd.points), targetKmh: CREEP_KMH },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: паркирано законно — цялата кола е извън маркировката на пътеката и извън петте метра преди нея." },
    ],
  };
}

/**
 * The ban is graded on the demo that stops ON THE PAINT, and both halves of
 * that sentence are load-bearing.
 *
 * WHY NOT THE SLOT BEFORE: rules/engine.ts exempts a rest inside a ban span
 * while the crossing episode is live (`s.crossing === null` is a precondition
 * of `illegalBanRest`) — a car stopped SHORT of a zebra can always be yielding
 * to someone on it, and convicting that would be a false positive. The slot
 * before the crossing is therefore demonstrated through its CONSEQUENCE
 * instead (the second demo below).
 *
 * WHY NOT „five metres past the crossing", which is what this demo used to be:
 * THERE IS NO SUCH RULE. чл. 98, ал. 1, т. 5 reads «на пешеходни или
 * велосипедни пътеки и на разстояние, по-малко от 5 метра ПРЕДИ тях»
 * (retrieved: content/law/acts/zdvp.json, unit ref "чл. 98"); the five metres
 * run one way only, and nothing in чл. 98, ал. 1 bans stopping past a пътека.
 * The old demo rested at y = 3.71 — clear of the paint's far edge (+3.0) — and
 * was billed by a span that had been authored 5 m too long. The span is now
 * y ∈ [−8, +3] and the demo stops where the offence is REAL.
 *
 * WHAT IT NOW SHOWS: the car pulls into the free slot beside the crossing and
 * comes to rest at y = 2.4, i.e. body y ∈ [0.38, 4.42] (CHASSIS_HALF_EXTENTS.z
 * = 2.02) — its NOSE is 1.42 m past the paint, its REAR is still 2.62 m ON it.
 * That is т. 5's first limb, «на пешеходни пътеки», word for word, and it is a
 * better lesson than the invented one: „I passed the crossing" is false while
 * any part of the car is still on it. `crossingPassed` has already fired at
 * this pose (the node is behind the car, lateral 6.28 m ≪ PASS_LATERAL_MAX_M),
 * so `s.crossing` is null and the rest is gradable.
 *
 * THE WAY IN is one ramped S to the kerb line, begun as the nose reaches the
 * crossing — 7.5 m of travel for 2.28 m sideways on the car's own circle.
 */
const ZB_AFTER_REST_Y = 2.4;

/** A forward S from the passing line to the kerb line, ending at (kerbX, endY). */
function kerbSwingIn(kerbX: number, endY: number, tailM: number): { runUp: AuthoredPath; swing: AuthoredPath } {
  const k = 1 / R_MIN;
  const s = sShift(swingForShift(kerbX - ZB_SETUP_X, k, 1.0), k, 1.0);
  const sLenM = authoredDrive({ x: 0, y: 0, headingDeg: 0 }, s, 1).end.y;
  const runUp = zbAisle(endY - tailM - sLenM);
  const swing = authoredDrive(runUp.end, [...s, straight(tailM)], 1);
  return { runUp, swing: { ...swing, end: { x: kerbX, y: endY, headingDeg: 0 } } };
}

function zbMistakeAfterZebra(): DriveScript {
  const { runUp, swing } = kerbSwingIn(ZB_BAY.x, ZB_AFTER_REST_Y, 0.4);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „минах пътеката, значи може“ — а е минала само предницата." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: runUp.points, targetKmh: 9 },
      { kind: "drive", points: withRunOut(swing.points), targetKmh: 5 },
      { kind: "pause", sec: 8.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Задницата стои ВЪРХУ зебрата. Чл. 98, ал. 1, т. 5 забранява престоя и паркирането „на пешеходни или велосипедни пътеки“ — забранена е самата пътека, а петте метра се броят само ПРЕДИ нея. Пътеката е премината едва когато цялата кола е извън маркировката.",
      },
    ],
  };
}

/**
 * The hidden-pedestrian demo parks in the slot before the crossing the only
 * way the product car CAN park there: past the crossing and back in.
 *
 * The slot is bay 2 (y = −5.25): 6.5 m of kerb between the parked car behind
 * (its front at y = −9.5) and the paint (y = −3). A forward entry does not fit
 * it with a quarter-metre kept from that car — a one-sweep S into it swings
 * the tail into the car behind, and nose-in-then-back runs out of slot either
 * way (round 2 scans; the numbers are in the lane's report). With the open
 * paint AHEAD of the slot, the ordinary reverse park does fit: drive over the
 * crossing, stop with the whole car clear of the paint (tail 0.38 m past its
 * far edge), look, and reverse straight back over the crossing and through
 * one S into the slot. Nothing in the retrieved act forbids reversing over a
 * pedestrian crossing (content/law/acts/zdvp.json: the reversing bans are
 * чл. 38 ал. 4, чл. 51 and чл. 64); чл. 40 asks that the road behind be clear,
 * which is what the three looks before the gear goes in are.
 *
 * The car comes to rest PARALLEL on the bay line (x = 6.28), its whole body in
 * y ∈ [−7.42, −3.38] — nose 0.38 m short of the paint, all of it inside the
 * five metres before it. That stop is the mistake. (It used to stop
 * nose-in at 25° with its tail across the lane centre: not a parked car.)
 */
const ZB_HIDDEN_SETUP_Y = 5.4;
const ZB_HIDDEN_REST_Y = -5.4;

function zbMistakeHiddenPed(): DriveScript {
  // Why the five metres BEFORE the crossing exist, shown instead of asserted:
  // the car parks in the slot right in front of the zebra, and the pedestrian
  // that its own body hid walks out as it pulls away.
  const k = 1 / R_MIN;
  const s = sShift(swingForShift(ZB_BAY.x - ZB_SETUP_X, k, 1.0), k, 1.0);
  const sLenM = authoredDrive({ x: 0, y: 0, headingDeg: 0 }, s, -1).end.y;
  const back = authoredDrive(
    { x: ZB_SETUP_X, y: ZB_HIDDEN_SETUP_Y, headingDeg: 0 },
    [straight(ZB_HIDDEN_SETUP_Y - ZB_HIDDEN_REST_Y + sLenM), ...s],
    -1,
  );
  const pullOut = authoredDrive(
    { x: ZB_BAY.x, y: ZB_HIDDEN_REST_Y, headingDeg: 0 },
    [{ lenM: 1.2, k0: 0, k1: -k }, { lenM: 2.6, k0: -k, k1: -k }],
    1,
  );
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: паркиране непосредствено ПРЕД пътеката — „само пет метра, кой ги брои“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      ...toSetup(zbAisle(ZB_HIDDEN_SETUP_Y), 10),
      { kind: "pause", sec: 1.0, brake: true },
      ...LOOK_BEFORE_REVERSE,
      // Still standing for 0.6 s after the three looks: every display hears
      // all three before the lever reads R (the session clock hands a frame at
      // most 0.5 s), so no display credits one of them to the reverse and the
      // rubric line is the same on all of them (ADR-014).
      { kind: "pause", sec: 0.6, brake: true },
      { kind: "drive", points: withRunOut(back.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "pause", sec: 3.0, brake: true },
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "И когато тръгва отново, пешеходецът излиза точно иззад собствената му кола…" },
      { kind: "drive", points: pullOut.points, targetKmh: 6, stopAtEnd: false },
      { kind: "collision", withWhat: "pedestrian" },
      // The demo ENDS as the car comes to rest from the hit. This car has
      // passed the crossing once already (it parked from beyond it), so the
      // crossing tracker holds it passed and a forward-gear rest in the span
      // bills ILLEGAL_STOP_IN_BAN_ZONE after 4 s (rules/engine.ts
      // illegalBanRest) — a second offence the card does not name. 0.6 s brings
      // it to rest from 6 km/h (SCRIPT_DECEL 4.6 m/s²) and no longer.
      { kind: "pause", sec: 0.6, brake: true },
      {
        kind: "annotation",
        textBg:
          "Ето за какво са петте метра: кола, спряла плътно преди пътеката, я закрива — и за теб, и за всички зад теб. Забраната не пази мястото, пази човека на него.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 7 — sc-park-wall (lot-wall-v1): the end bay against a garage wall
// ---------------------------------------------------------------------------
// The setup line is x = −0.2 — «близо до средата на алеята», as the demo says —
// and the swing is the 90° reverse; the wall (its south face 1.65 m past the
// bay's line) is never nearer than 0.69 m to the car's body.

const WL_BAY = { x: 5.03, y: 5.4 };
const WL_SETUP_X = -0.2;
const WL_SWING = { radiusM: R_MIN, s0M: 1.0, rampInM: 2.0, rampOutM: 0.8 };
const WL = bayReverse(1, WL_SETUP_X, WL_BAY, WL_SWING);
const wlAisle = () => aisleTo(WL.setup.x, WL.setup.y);

function wlShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Свободно е само последното гнездо — а редът свършва в стена." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      ...toSetup(wlAisle(), 9),
      {
        kind: "annotation",
        textBg: "Спри РАНО и близо до средата на алеята: стената не оставя място за широк замах.",
      },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      { kind: "drive", points: withRunOut(WL.a.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "annotation", textBg: "Спри на половината завой и погледни назад — и в дясното огледало, към стената." },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Изправи волана — и следи разстоянието до стената в дясното огледало." },
      { kind: "drive", points: withRunOut(WL.b.points), targetKmh: CREEP_KMH, reverse: true },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: в очертанията, без нито един сантиметър, взет от стената." },
    ],
  };
}

function wlMistakeIntoWall(): DriveScript {
  // Looking right for the bay, the driver keeps going and turns in late: the
  // nose crosses the bay's mouth and meets the wall that closes the row.
  const runUp = aisleTo(WL_SETUP_X, 3.2);
  const k = 1 / R_MIN;
  const turnIn = authoredDrive(runUp.end, [{ lenM: 1.5, k0: 0, k1: k }, { lenM: 8, k0: k, k1: k }], 1);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: шофьорът търси мястото с поглед вдясно и продължава напред." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: runUp.points, targetKmh: 9 },
      { kind: "annotation", textBg: "Гнездото е вече отдясно, а редът свършва — но стената не се гледа." },
      {
        kind: "drive",
        points: untilContact(turnIn.points, 1, PARK_DEPTH_WALL, "wall"),
        targetKmh: 6,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предницата опря в стената в края на реда. Крайното гнездо иска решението да е взето РАНО: спираш успоредно на него, не покрай него.",
      },
    ],
  };
}

function wlMistakeClipNeighbour(): DriveScript {
  // The same swing, begun 2 m too early («два метра по-рано», the card says):
  // aimed at the line between the free bay and the neighbour's.
  const early = bayReverse(1, WL_SETUP_X, { x: 5.03, y: WL_BAY.y - 2.0 }, WL_SWING);
  const swing: Pts = [...early.a.points, ...early.b.points.slice(1)];
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: завъртане твърде рано — стената кара шофьора да бърза." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      ...toSetup(aisleTo(early.setup.x, early.setup.y), 9),
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: untilContact(swing, -1, parkedRect(5.03, 2.7, 90), "arden_x"),
        targetKmh: 3,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Задницата влезе в съседната кола, не в гнездото. Стената не мести ориентира: той пак е задната броня на съседа.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 8 — sc-park-night (lot-night-v1): the unlit row
// ---------------------------------------------------------------------------
// An 8.5 m slot. Like the short slot, it is parked in TWO moves — the reverse
// and one forward correction (round 2: round 1 took three, pulling 2.7 m
// forward past the middle and rolling a metre back, which its caption called
// «леко напред»). The car stands 0.56 m off the lead car's flank (x 3.8 —
// from the template's own line, x 4.0, 0.36 m, the swing passes that car's
// corner too close), the reverse stops 7° short of parallel with room still
// behind it, and the forward pull the briefing asks for («влез, изправи се
// успоредно на бордюра») turns those 7° and stops the car parallel ON the
// slot's middle (0.04 m in from the bay line — «Центрирано» on the rubric at
// every rung). Kept on the larger of the gate's rect and the live collider:
// 0.43 m for the real car whose centre follows the ghost.

/** Where the one correction leaves the car: parallel, on the middle (0.04 m in from the bay line). */
const NT_REST = { x: 6.24, y: 13.0 };
const NT_SETUP_X = 3.8;
const NT_SETUP_Y = 19.3;
const NT_SHORT_DEG = 7;
const NT = kerbPark(NT_SETUP_X, NT_SETUP_Y, NT_REST, {
  radiusM: R_MIN,
  restY: NT_REST.y,
  rampInM: 0.4,
  rampM: 0.4,
  shortDeg: NT_SHORT_DEG,
  fwdRampM: 0.3,
  fwdStraightM: 0.8,
});
const ntAisle = () => aisleTo(NT_SETUP_X, NT_SETUP_Y, { radiusM: 150, shiftFromY: FEEDER_END_Y });

function ntShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Тъмно е и редът не е осветен — късите светлини са първото действие." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-75), targetKmh: 16 },
      { kind: "annotation", textBg: "На фаровете четеш линиите — карай бавно покрай целия ред." },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      ...toSetup(ntAisle(), 8),
      { kind: "annotation", textBg: "Ориентир 1: успоредно на предната кола, задна броня срещу задна броня." },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      { kind: "drive", points: withRunOut(NT.a.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "annotation", textBg: "Ориентир 2: под около 40° към бордюра. Спри и премери назад по огледалата — после волана наляво." },
      { kind: "pause", sec: 1.0, brake: true },
      // «по огледалата»: the right one (the kerb and the car behind) and the rear one.
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: withRunOut(NT.b.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "annotation", textBg: "Достатъчно назад — колата още стои леко накосо. Напред с волан надясно, докато застанеш успоредно." },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "drive", points: withRunOut(NT.fwd.points), targetKmh: CREEP_KMH },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: в очертанията и видим — светлините остават до спирането на двигателя." },
    ],
  };
}

function ntMistakeNoLights(): DriveScript {
  // The correct drive, metre for metre — with the lamps off.
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „паркингът е близо, няма да паля светлините“." },
      { kind: "headlights", setting: "off" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-75), targetKmh: 16 },
      { kind: "indicator", setting: "right" },
      ...toSetup(ntAisle(), 8),
      { kind: "pause", sec: 1.0, brake: true },
      ...LOOK_BEFORE_REVERSE,
      { kind: "drive", points: withRunOut(NT.a.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "pause", sec: 0.6, brake: true },
      { kind: "drive", points: withRunOut(NT.b.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "drive", points: withRunOut(NT.fwd.points), targetKmh: CREEP_KMH },
      { kind: "pause", sec: 2.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "Без светлини колата е невидима за всички останали, а линиите — невидими за теб. Нощем фаровете не са за да виждаш: те са за да те виждат.",
      },
    ],
  };
}

function ntMistakeTooDeep(): DriveScript {
  // The correct S — and then on down the bay line „по усет", into the car behind.
  const on = authoredDrive(NT.b.end, [straight(3)], -1);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: назад „по усет“, защото в тъмното задната кола не се вижда." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-75), targetKmh: 16 },
      { kind: "indicator", setting: "right" },
      ...toSetup(ntAisle(), 8),
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: withRunOut(NT.a.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "pause", sec: 0.6, brake: true },
      {
        kind: "drive",
        points: untilContact([...NT.b.points, ...on.points.slice(1)], -1, parkedRect(6.28, 6.5, 0), "dret_90"),
        targetKmh: 2.5,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Задницата опря в колата отзад. Нощем разстоянието се брои по огледала и по светлините на съседа — не по усет.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 9 — sc-park-double (lot-double-v1): two rows, a 5.56 m corridor
// ---------------------------------------------------------------------------
// The one drill that asks for a tighter circle than the rest: 4.5 m.
//
// The corridor is 5.55 m between the rows' noses as the gate's rects stand
// them and 5.2 m where the west row's SUV does (a kolos, 0.34 m longer than
// the bay). From the corridor's exact middle the car's swing passes 0.15 m
// from the neighbour at 4.6 m and 0.22 m at 4.4 — under the quarter-metre
// this file keeps. So the car stands 0.25 m LEFT of the middle (a span; 1.3 m
// of air on its left, 2.2 m on its right) and swings on 4.5 m — still 14 %
// over the car's own 3.955 m and 8 % over the physics car's 4.17 — which
// leaves 0.43 m to the neighbour for the recorded pose and 0.32 m for the real
// car's.

const DB_BAY = { x: 5.03, y: 0 };
const DB_SETUP_X = -0.25;
const DB_RADIUS_M = 4.5;
const DB_SWING = { radiusM: DB_RADIUS_M, s0M: 1.4, rampInM: 1.0, rampOutM: 0.4 };
const DB = bayReverse(1, DB_SETUP_X, DB_BAY, DB_SWING);
const dbAisle = () => aisleTo(DB.setup.x, DB.setup.y);

function dbShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Гнезда има от двете страни — свободният коридор между тях е под шест метра." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      ...toSetup(dbAisle(), 8),
      {
        kind: "annotation",
        textBg: "Дръж се по средата — най-много педя вляво от оста: замахът надясно иска място, а отляво е чуждият ред.",
      },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      { kind: "annotation", textBg: "Замахът се прави само назад — предницата няма къде да излезе." },
      { kind: "drive", points: withRunOut(DB.a.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "annotation", textBg: "Спри на половината завой и погледни и в двете огледала: и отсреща, и отдясно има коли." },
      { kind: "pause", sec: 1.0, brake: true },
      // «и в двете огледала»: left (the row opposite) AND right (the row the
      // tail is going into) — round 1 looked left and back only — then back.
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: withRunOut(DB.b.points), targetKmh: CREEP_KMH, reverse: true },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: в очертанията, без да си влизал в отсрещния ред." },
    ],
  };
}

function dbMistakeWideRunUp(): DriveScript {
  // The empty-lot habit: swing out wide to the far side to „take the angle".
  // The S that would lay the car on x = −2.2 puts its flank in the west row.
  const wide = aisleTo(-2.2, 2, { shiftFromY: -15 });
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: широкият замах от отсрещната страна — навикът от празен паркинг." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: untilContact(wide.points, 1, parkedRect(-5.03, -5.4, 270), "dret_90"),
        targetKmh: 8,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Колата закачи паркиран автомобил от отсрещния ред. В коридор между два реда широкият подход не съществува: маневрата тръгва от средата.",
      },
    ],
  };
}

function dbMistakeCorrectBack(): DriveScript {
  // The swing begun 2 m too early gives an angle that cannot work; the driver
  // stops, pulls forward on the same lock until the car stands diagonally
  // across the corridor — and then backs SIDEWAYS to „fix" it, into the
  // opposite row.
  //
  // The angles put the tail square on the pino's nose (round 2): that car is
  // 0.41 m SHORTER than the gate's rect, so its nose sits back in the row
  // between two longer ones, and the old 32° / 66° line, leaving the car at
  // 34°, slid its tail past the pino's corner before it had touched the body
  // the live scene mounts there (it rested 0.31 m short of it). 24° wrong and
  // 60° across leave it at 36°, and the straight back meets the pino with
  // every other car ≥ 0.5 m away.
  const k = 1 / DB_RADIUS_M;
  const setup: PathPose = { x: DB_SETUP_X, y: DB.setup.y - 2.0, headingDeg: 0 };
  const wrong = authoredDrive(setup, [straight(0.6), ...turn(24 * D2R, k, 1.0, 0.8)], -1);
  const across = authoredDrive(wrong.end, turn(60 * D2R, k, 1.0, 1.0), 1);
  const sideways = authoredDrive(across.end, [straight(6)], -1);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „ще се пооправя назад“ — в коридор, в който няма назад." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      ...toSetup(aisleTo(setup.x, setup.y), 8),
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: withRunOut(wrong.points), targetKmh: 3, reverse: true },
      { kind: "annotation", textBg: "Ъгълът не става. Изнася се напред — и колата застава накосо в коридора…" },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "drive", points: withRunOut(across.points), targetKmh: 3 },
      { kind: "annotation", textBg: "…и тръгва назад настрани, за да го поправи." },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "drive",
        points: untilContact(sideways.points, -1, parkedRect(-5.03, 2.7, 270), "pino"),
        targetKmh: 2.5,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Задницата влезе в отсрещния ред. Корекцията в тесен коридор се прави НАПРЕД, по дължината на алеята — не настрани.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 10 — sc-park-judge (lot-gap-judge-v1): 4.3 m is not a parking space
// ---------------------------------------------------------------------------

const GJ_BAY = { x: 6.28, y: 7.4 };
const GJ_SHORT_Y = -4.0;
const GJ_ASSESS_X = 4.0;
/** The parallel-park setup line: 0.72 m off the lead car's flank. */
const GJ_SETUP_X = 3.7;
const GJ_SETUP_Y = 14.2;
const GJ_PARK = { radiusM: R_MIN, rampInM: 1.2, rampM: 0.8, shortDeg: 0 };
const GJ = kerbPark(GJ_SETUP_X, GJ_SETUP_Y, GJ_BAY, { ...GJ_PARK, restY: GJ_BAY.y, s0M: 1.3 });
const gjAssess = () => aisleTo(GJ_ASSESS_X, GJ_SHORT_Y, { radiusM: 150, shiftFromY: FEEDER_END_Y });
/** From the assess stop on to the setup: 0.3 m further off the row, eased. */
function gjOn(): AuthoredPath {
  const k = -1 / 40;
  const s = sShift(swingForShift(GJ_SETUP_X - GJ_ASSESS_X, k, 1.5), k, 1.5);
  const sLenM = authoredDrive({ x: 0, y: 0, headingDeg: 0 }, s, 1).end.y;
  const p = authoredDrive(
    { x: GJ_ASSESS_X, y: GJ_SHORT_Y, headingDeg: 0 },
    [straight(1), ...s, straight(GJ_SETUP_Y - GJ_SHORT_Y - 1 - sLenM)],
    1,
  );
  return { ...p, end: { x: GJ_SETUP_X, y: GJ_SETUP_Y, headingDeg: 0 } };
}

function gjShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Две свободни места. Първото изглежда добре — и не е." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      ...toSetup(gjAssess(), 9),
      {
        kind: "annotation",
        textBg: "Задача 1: спри срещу мястото и го премери — между бронята на едната и бронята на другата кола.",
      },
      { kind: "pause", sec: 1.6, brake: true },
      {
        kind: "annotation",
        textBg: "Около четири метра и малко. Колата е над четири — това не е място, а капан. Продължаваме.",
      },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: withRunOut(gjOn().points), targetKmh: 8 },
      { kind: "annotation", textBg: "Второто място е близо десет метра — тук се влиза спокойно." },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      { kind: "drive", points: withRunOut(GJ.a.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "annotation", textBg: "Под около 40° към бордюра: спри, погледни назад — и волана наляво." },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: withRunOut(GJ.b.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "drive", points: withRunOut(GJ.fwd.points), targetKmh: CREEP_KMH },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово. Най-важната част от паркирането стана, преди воланът да е мръднал." },
    ],
  };
}

/**
 * The two ways a driver tries a 4.3 m slot, and the two cars he meets.
 *
 * The reverse demo is authored from the CORRECT setup — alongside the car in
 * front, 0.72 m off its flank, rear bumpers level, exactly where the shadow of
 * every other parallel drill stops — and it is the SAME S the correct demo
 * drives into the good slot, metre for metre. That is the honest form of this
 * mistake: nothing about the approach or the wheel is wrong, the slot is. The
 * car's S is 7 m long and the slot has 4.3 m: the tail is in the car BEHIND
 * while the car is still at 35° to the kerb, its nose 2.9 m out in the
 * carriageway.
 *
 * It used to bill the car IN FRONT as well («завоят закачи колата отпред»).
 * That contact belonged to the 4 m arc, not to the manoeuvre: reversing in, the
 * nose swings AWAY from the car in front, and it only comes back toward that
 * car's corner once the car has travelled its own length — by which point, in
 * a 4.3 m slot, the tail has already met the car behind. On the car's own
 * circle there is one contact, and the copy now names that one.
 */
/** Rear bumpers level with the car in front of the 4.3 m slot (its rear at y = −1.855). */
const GJ_TRY_SETUP_Y = 0.17;

function gjMistakeTryShort(): DriveScript {
  const same = kerbPark(GJ_SETUP_X, GJ_TRY_SETUP_Y, { x: GJ_BAY.x, y: GJ_SHORT_Y }, { ...GJ_PARK, restY: GJ_SHORT_Y, s0M: 1.3 });
  const sweep: Pts = [...same.a.points, ...same.b.points.slice(1)];
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „ще се сместя“ — маневра в място, по-късо от колата плюс метър." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      ...toSetup(aisleTo(GJ_SETUP_X, GJ_TRY_SETUP_Y, { radiusM: 30 }), 9),
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: untilContact(sweep, -1, parkedRect(6.28, -8.4, 0), "vela_h3"),
        targetKmh: 3,
        reverse: true,
      },
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "Изходната позиция беше вярна — мястото не беше. Задницата стигна до колата отзад, докато предницата още стърчеше в платното. Между двете брони има четири метра и трийсет, а колата е четири и четири.",
      },
    ],
  };
}

/** Where the short-forward demo's wheel goes over (the rear car's centre is −8.4). */
const GJ_SHORT_TURN_Y = -7.6;

function gjMistakeShortForward(): DriveScript {
  // The other attempt: nose in at an angle. The nose meets the car in front
  // with the tail still out in the carriageway.
  //
  // The wheel goes over 0.8 m past the rear car's centre (y = −7.6), not
  // alongside it: turned in at −8.4 the right flank swung past that car's
  // front corner at 0.21 m of the product's box — a second near-contact the
  // explanation never mentions. From −7.6 the car behind keeps 0.53 m.
  const runUp = aisleTo(GJ_SETUP_X, GJ_SHORT_TURN_Y, { radiusM: 30 });
  const k = 1 / R_MIN;
  const noseIn = authoredDrive(runUp.end, [...turn(32 * D2R, k, 1.0, 1.0), straight(4)], 1);
  return {
    steps: [
      { kind: "annotation", textBg: "Същото късо място, другият опит: влизане напред, „колкото да се вреже“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: runUp.points, targetKmh: 8 },
      { kind: "annotation", textBg: "Носът влиза под ъгъл в четириметровия процеп…" },
      {
        kind: "drive",
        points: untilContact(noseIn.points, 1, parkedRect(6.28, 0.4, 0), "dret_90"),
        targetKmh: 4,
      },
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предницата опря в колата отпред, а задницата стърчи в платното. В твърде късо място всяка поправка на единия край е удар в другия — затова решението се взима ПРЕДИ маневрата.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// What the drivability pin reads (traces/__tests__/sc-park-depth-drivable.test.ts)
// ---------------------------------------------------------------------------

/**
 * The authored reference points of the nine drivable drills, by value: where
 * each correct demo stops before its manoeuvre, the tightest circle its
 * programme asks for, and — for the kerb-side drills — the angle at reference
 * point 2, how far the car rolls straight back before the wheel goes over, and
 * how far short of parallel the reverse stops.
 */
export const PARK_DEPTH_GEOMETRY = {
  minCentreRadiusM: R_MIN,
  radiusM: {
    "sc-park-gap-short": R_MIN,
    "sc-park-van": VN_SWING.radiusM,
    "sc-park-45-rev": R_MIN,
    "sc-park-left": LF_SWING.radiusM,
    "sc-park-zebra": R_MIN,
    "sc-park-wall": WL_SWING.radiusM,
    "sc-park-night": R_MIN,
    "sc-park-double": DB_SWING.radiusM,
    "sc-park-judge": R_MIN,
  },
  setup: {
    "sc-park-gap-short": GS.setup,
    "sc-park-van": VN.setup,
    "sc-park-45-rev": RV.setup,
    "sc-park-left": LF.setup,
    "sc-park-zebra": ZB.setup,
    "sc-park-wall": WL.setup,
    "sc-park-night": NT.setup,
    "sc-park-double": DB.setup,
    "sc-park-judge": GJ.setup,
  },
  kerb: {
    "sc-park-gap-short": { swingDeg: GS.swingDeg, rollBackM: GS.s0M, shortDeg: GS_SHORT_DEG },
    "sc-park-zebra": { swingDeg: ZB.swingDeg, rollBackM: ZB.s0M, shortDeg: 0 },
    "sc-park-night": { swingDeg: NT.swingDeg, rollBackM: NT.s0M, shortDeg: NT_SHORT_DEG },
    "sc-park-judge": { swingDeg: GJ.swingDeg, rollBackM: GJ.s0M, shortDeg: 0 },
  },
} as const;

// ---------------------------------------------------------------------------
// Recording assembly
// ---------------------------------------------------------------------------

export type ParkDepthDrillId =
  | "sc-park-gap-short"
  | "sc-park-gap-long"
  | "sc-park-van"
  | "sc-park-45-rev"
  | "sc-park-left"
  | "sc-park-zebra"
  | "sc-park-wall"
  | "sc-park-night"
  | "sc-park-double"
  | "sc-park-judge";

interface DrillDef {
  districtId: string;
  isNight?: boolean;
  /** Bodies the district's own occupancy does not carry (van, wall). */
  extraObstacles?: readonly ObstacleRect2D[];
  traces: Record<string, { kind: "shadow" | "mistake"; script: () => DriveScript }>;
}

/** Every parking-depth drill, its map and its three authored drives. */
export const PARK_DEPTH_DRILLS: Record<ParkDepthDrillId, DrillDef> = {
  "sc-park-gap-short": {
    districtId: "lot-gap-short-v1",
    traces: {
      "shadow-correct": { kind: "shadow", script: gsShadow },
      "mistake-shallow-angle": { kind: "mistake", script: gsMistakeShallow },
      "mistake-forward-hit": { kind: "mistake", script: gsMistakeForwardHit },
    },
  },
  "sc-park-gap-long": {
    districtId: "lot-gap-long-v1",
    traces: {
      "shadow-correct": { kind: "shadow", script: glShadow },
      "mistake-overrun": { kind: "mistake", script: glMistakeOverrun },
      "mistake-blind-reverse": { kind: "mistake", script: glMistakeBlindReverse },
    },
  },
  "sc-park-van": {
    districtId: "lot-van-v1",
    extraObstacles: [PARK_DEPTH_VAN],
    traces: {
      "shadow-correct": { kind: "shadow", script: vnShadow },
      "mistake-early-turn": { kind: "mistake", script: vnMistakeEarly },
      "mistake-blind-reverse": { kind: "mistake", script: vnMistakeBlind },
    },
  },
  "sc-park-45-rev": {
    districtId: "lot-45rev-v1",
    traces: {
      "shadow-correct": { kind: "shadow", script: rvShadow },
      "mistake-nose-in": { kind: "mistake", script: rvMistakeNoseIn },
      "mistake-shallow-swing": { kind: "mistake", script: rvMistakeShallow },
    },
  },
  "sc-park-left": {
    districtId: "lot-left-v1",
    traces: {
      "shadow-correct": { kind: "shadow", script: lfShadow },
      "mistake-mirrored-habit": { kind: "mistake", script: lfMistakeMirrored },
      "mistake-cross-blind": { kind: "mistake", script: lfMistakeCross },
    },
  },
  "sc-park-zebra": {
    districtId: "lot-zebra-v1",
    traces: {
      "shadow-correct": { kind: "shadow", script: zbShadow },
      "mistake-park-after": { kind: "mistake", script: zbMistakeAfterZebra },
      "mistake-hidden-pedestrian": { kind: "mistake", script: zbMistakeHiddenPed },
    },
  },
  "sc-park-wall": {
    districtId: "lot-wall-v1",
    extraObstacles: [PARK_DEPTH_WALL],
    traces: {
      "shadow-correct": { kind: "shadow", script: wlShadow },
      "mistake-into-wall": { kind: "mistake", script: wlMistakeIntoWall },
      "mistake-clip-neighbour": { kind: "mistake", script: wlMistakeClipNeighbour },
    },
  },
  "sc-park-night": {
    districtId: "lot-night-v1",
    isNight: true,
    traces: {
      "shadow-correct": { kind: "shadow", script: ntShadow },
      "mistake-no-lights": { kind: "mistake", script: ntMistakeNoLights },
      "mistake-too-deep": { kind: "mistake", script: ntMistakeTooDeep },
    },
  },
  "sc-park-double": {
    districtId: "lot-double-v1",
    traces: {
      "shadow-correct": { kind: "shadow", script: dbShadow },
      "mistake-wide-run-up": { kind: "mistake", script: dbMistakeWideRunUp },
      "mistake-correct-backwards": { kind: "mistake", script: dbMistakeCorrectBack },
    },
  },
  "sc-park-judge": {
    districtId: "lot-gap-judge-v1",
    traces: {
      "shadow-correct": { kind: "shadow", script: gjShadow },
      "mistake-try-short": { kind: "mistake", script: gjMistakeTryShort },
      "mistake-short-forward": { kind: "mistake", script: gjMistakeShortForward },
    },
  },
};

/**
 * The full obstacle set of a parking-depth drill: the district's OWN occupied
 * bays (the single geometric truth) plus the drill's extra bodies. Exported so
 * the trace gate and the scene's held-scenery test can pin against the same
 * rects the recording was made with.
 */
export function parkDepthObstacles(
  districtRaw: unknown,
  drillId: ParkDepthDrillId,
): ObstacleRect2D[] {
  return [...lotObstacleRects(districtRaw), ...(PARK_DEPTH_DRILLS[drillId].extraObstacles ?? [])];
}

/**
 * Record one authored drive of one parking-depth drill against its loaded
 * district. Contacts grade from 0 km/h, which is what makes a 2 km/h bumper
 * touch a mistake. Deterministic.
 */
export function recordScParkDepthDrive(
  districtRaw: unknown,
  drillId: ParkDepthDrillId,
  traceName: string,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const drill = PARK_DEPTH_DRILLS[drillId];
  const entry = drill.traces[traceName];
  if (!entry) throw new Error(`${drillId}: unknown trace "${traceName}"`);
  return recordScriptedDrive(districtRaw, entry.script(), {
    scenarioId: drillId,
    kind: entry.kind,
    seed: 7,
    obstacles: parkDepthObstacles(districtRaw, drillId),
    collisionMinKmh: 0,
    ...(drill.isNight ? { isNight: true } : {}),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
