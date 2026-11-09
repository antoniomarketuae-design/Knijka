/**
 * A PARKING DEMO, DRIVEN ON THE PRODUCT CHASSIS — test support (nothing in the
 * product imports it). catalogue-demo-curvature:dae908c7, family «curvpark2»,
 * round 2 (integrator ruling CP2-3: «drive each contact mistake on the PRODUCT
 * CHASSIS at L1 … and print the signed gap to the named body»).
 *
 * THE HARNESS is the endings / npc-contact-cadence lanes' own
 * (`lessons/scenario/__tests__/rapierContactDrive.ts driveIntoContact`): the
 * product's chassis (`createHeadlessChassis`) and `VehicleSim` on the browser's
 * rapier, the lesson's world colliders and walls, the rig's step record, the
 * scene's graded call and `handleCollision`, the real lesson session — with a
 * REAL cabin (`CabinControls`), so the gear the grade reads is the product's
 * contract gear off the selector, moved at a frame's start with the brake held
 * (the [ / ] keys, as rbReverseDrive.ts moves it). The lesson's PARKED CARS are
 * mounted through the harness's `extraBodies` (it mounts none of its own):
 * one fixed cuboid per occupied bay with the LIVE GLB half extents
 * (`lessonBoxSets(…).live`, the table ScenarioObstacles' measured rigs give),
 * ScenarioObstacles' tag and friction / restitution.
 *
 * THE DRIVER follows the committed demo's PATH, gear leg by gear leg — never
 * its clock: pure pursuit on the leg's polyline from the car's body centre
 * (the point the trace records), a look-ahead `LOOK_M`, the steering the
 * pursuit arc asks of a bicycle whose centre runs on it (δ = atan(L / √(R² −
 * a²)), a = the rear axle's offset), at the tape's own speed (never under
 * `MIN_KMH` until the leg's last decimetres, braked to rest at its end). At a
 * leg's end it stops, holds the brake `SHIFT_REST_S`, walks the selector to the
 * next leg's gear and goes on. After the first contact rapier reports it
 * brakes to rest and holds (the demo is over). Decided per physics step from
 * the car after the previous step (ADR-017's rule), so the trajectory is one
 * trajectory on every cadence.
 *
 * It does NOT reproduce the tape: the chassis lags and cuts by centimetres.
 * What it measures is the question the ruling asks — does a real car driven
 * along this demo's path strike the body the explanation names — reported as
 * the signed gap of the chassis' own pose to that body (≤ 0: it is in it) and
 * the contacts the lesson's ledger booked.
 */
import { SCENARIO_OBSTACLE_NPC_ID_BASE } from "@/components/sim/ScenarioObstacles";
import { obbSeparationM } from "../../collision";
import type { LessonSpec } from "../../contracts";
import { CabinControls } from "../../scene/cabin";
import * as T from "../../vehicle/tuning";
import { driveIntoContact, sheetDigest, type DriveState } from "../../lessons/scenario/__tests__/rapierContactDrive";
import type { ScenarioTrace } from "../types";
import { bicycleOnPath, heroBox, REAR_AXLE_M, WHEELBASE_M, type ProductBox } from "./parkDepthProduct";

const H = T.FIXED_DT;
const LOOK_M = 1.2;
const MIN_KMH = 1.5;
const SHIFT_REST_S = 1.0;
/** The roof line the parked cuboids are mounted to (a car's height, m). */
const PARKED_TOP_Y_M = 1.45;

interface Leg {
  dir: 1 | -1;
  /** The REAR AXLE's path (x, y) — the real car's, off bicycleOnPath — and the body centre's (cx, cy). */
  pts: Array<{ x: number; y: number; cx: number; cy: number; s: number; kmh: number }>;
  len: number;
}

function legsOf(trace: ScenarioTrace): Leg[] {
  const legs: Leg[] = [];
  let cur: Leg | null = null;
  const bike = bicycleOnPath(trace.samples);
  for (let i = 0; i < trace.samples.length; i++) {
    const q = trace.samples[i];
    const h = (bike[i].headingDeg * Math.PI) / 180;
    const rx = q.x - REAR_AXLE_M * Math.sin(h);
    const ry = q.y - REAR_AXLE_M * Math.cos(h);
    const dir: 1 | -1 = q.gear < 0 ? -1 : 1;
    if (!cur || cur.dir !== dir) {
      // a gear change happens at rest: the new leg starts where the old one ended
      cur = { dir, pts: [], len: 0 };
      legs.push(cur);
    }
    const last = cur.pts[cur.pts.length - 1];
    const d = last ? Math.hypot(rx - last.x, ry - last.y) : 0;
    if (!last || d >= 0.02) cur.pts.push({ x: rx, y: ry, cx: q.x, cy: q.y, s: (last?.s ?? 0) + d, kmh: Math.abs(q.speedKmh) });
    else last.kmh = Math.max(last.kmh, Math.abs(q.speedKmh));
  }
  for (const l of legs) l.len = l.pts.length ? l.pts[l.pts.length - 1].s : 0;
  return legs.filter((l) => l.len > 0.05);
}

export interface ChassisDriveOutcome {
  /** The car's pose after every physics step: [x, y, headingDeg, speedKmh]. */
  poses: Array<[number, number, number, number]>;
  /** COLLISION violations the lesson's ledger booked: time and what with. */
  collisions: Array<{ t: number; withWhat: string }>;
  /** The step the follower first saw a contact (rapier's speed drop), or -1. */
  contactStep: number;
  /** Min signed OBB gap of the chassis pose to each body, m (≤ 0: in it). */
  gapTo: (b: ProductBox) => { m: number; atSec: number };
  /** The first time the chassis pose comes within `m` of the body (s), or null. */
  firstWithin: (b: ProductBox, m: number) => number | null;
  /** How far the chassis ran from the tape's path, m: median and max. */
  offPath: { median: number; max: number };
  legsDriven: number;
  legs: number;
  /** The lesson sheet the chassis drive closed with (rapierContactDrive sheetDigest). */
  sheet: string;
  endedAtPoint: number;
  steps: number;
  frames: number;
}

export function driveDemoOnChassis(o: {
  lesson: LessonSpec;
  raw: unknown;
  trace: ScenarioTrace;
  /** The lesson's live parked cars (vehicles only), as lessonBoxSets(…).live gives them. */
  parked: readonly ProductBox[];
  deltas?: readonly number[];
}): ChassisDriveOutcome {
  const legs = legsOf(o.trace);
  const g = globalThis as unknown as { window?: unknown };
  const hadWindow = g.window !== undefined;
  if (!hadWindow) g.window = { addEventListener() {}, removeEventListener() {} };
  const cabin = new CabinControls({}, "ready");
  if (!hadWindow) delete g.window;
  if (!cabin.seatbeltOn) cabin.toggleSeatbelt();

  let leg = 0;
  let at = 0;
  let phase: "drive" | "stop" | "shift" | "done" = "drive";
  let phaseSince = 0;
  let prevKmh = 0;
  let contactStep = -1;
  const off: number[] = [];
  const wantSelector = (l: number) => (legs[l].dir < 0 ? "R" : "D");

  const control = (st: DriveState) => {
    const t = st.step * H;
    const dropped = Math.abs(prevKmh) - Math.abs(st.speedKmh) > 0.8 && Math.abs(prevKmh) > 0.5;
    prevKmh = st.speedKmh;
    if (contactStep < 0 && dropped && phase === "drive") {
      // a speed drop the driver did not ask for — rapier's contact
      const L = legs[leg];
      if (L.len - L.pts[at].s > 0.03) {
        contactStep = st.step;
        phase = "done";
      }
    }
    if (phase === "done") return { throttle: 0, brake: 1, steer: 0 };
    if (phase === "stop") {
      if (Math.abs(st.speedKmh) < 0.05) {
        if (leg + 1 >= legs.length) phase = "done";
        else {
          leg++;
          at = 0;
          phase = "shift";
          phaseSince = t;
        }
      }
      return { throttle: 0, brake: 1, steer: 0 };
    }
    if (phase === "shift") {
      if (t - phaseSince >= SHIFT_REST_S && cabin.driveline.selector === wantSelector(leg)) phase = "drive";
      return { throttle: 0, brake: 1, steer: 0 };
    }
    // drive: progress = the rear-path point nearest the car's own rear axle,
    // at or after the last one (rear-axle pure pursuit: its velocity is along
    // the heading, so the pursuit arc is the one the wheel makes, exactly)
    const L = legs[leg];
    const hr = (st.headingDeg * Math.PI) / 180;
    const px = st.x - REAR_AXLE_M * Math.sin(hr);
    const py = st.y - REAR_AXLE_M * Math.cos(hr);
    let best = at;
    let bestD = Infinity;
    for (let i = at; i < Math.min(L.pts.length, at + 400); i++) {
      const d = Math.hypot(L.pts[i].x - px, L.pts[i].y - py);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    at = best;
    off.push(Math.hypot(L.pts[at].cx - st.x, L.pts[at].cy - st.y));
    const remaining = L.len - L.pts[at].s;
    if (remaining < 0.02) {
      phase = "stop";
      return { throttle: 0, brake: 1, steer: 0 };
    }
    let look = at;
    while (look + 1 < L.pts.length && L.pts[look].s - L.pts[at].s < LOOK_M) look++;
    let tx = L.pts[look].x;
    let ty = L.pts[look].y;
    // Near the leg's end the look-ahead runs out of path: aim along the leg's
    // last 0.3 m instead (a driver keeps the wheel where the arc put it; a
    // target collapsing onto the end point would straighten the car).
    const short = LOOK_M - (L.pts[look].s - L.pts[at].s);
    if (short > 0.05) {
      let k = L.pts.length - 1;
      while (k > 0 && L.len - L.pts[k].s < 0.3) k--;
      const e = L.pts[L.pts.length - 1];
      const ux = e.x - L.pts[k].x;
      const uy = e.y - L.pts[k].y;
      const n = Math.hypot(ux, uy);
      if (n > 1e-6) {
        tx = e.x + (ux / n) * short;
        ty = e.y + (uy / n) * short;
      }
    }
    const reach = Math.hypot(tx - px, ty - py);
    // the motion direction: the heading, or its reverse on a reverse leg
    const motion = st.headingDeg + (L.dir < 0 ? 180 : 0);
    let a = ((Math.atan2(tx - px, ty - py) * 180) / Math.PI - motion) % 360;
    if (a > 180) a -= 360;
    else if (a < -180) a += 360;
    let steer = 0;
    if (reach > 0.05) {
      const kappa = (2 * Math.sin((a * Math.PI) / 180)) / reach; // + = clockwise
      // the rear axle on an arc of curvature κ: tan δ = L · κ
      const delta = Math.atan(WHEELBASE_M * Math.abs(kappa));
      // steer + = LEFT: forward, a clockwise turn is steer right; in reverse
      // the yaw reverses, so a clockwise turn of the MOTION is steer left.
      steer = Math.max(-1, Math.min(1, (-L.dir * Math.sign(kappa) * delta) / T.STEER_MAX_ANGLE));
    }
    const tapeKmh = L.pts[at].kmh;
    const brakeKmh = 3.6 * Math.sqrt(2 * 0.8 * Math.max(0, remaining - 0.02));
    const want = Math.min(Math.max(tapeKmh, MIN_KMH), brakeKmh, 20);
    const v = Math.abs(st.speedKmh);
    const dv = want - v;
    if (dv >= 0) return { throttle: Math.min(1, dv / 4 + 0.1), brake: 0, steer };
    return { throttle: 0, brake: Math.min(1, -dv / 4), steer };
  };

  const start = o.trace.samples[0];
  const out = driveIntoContact({
    lesson: o.lesson,
    raw: o.raw,
    start: { x: start.x, y: start.y, headingDeg: start.headingDeg },
    control,
    deltas: o.deltas ?? [1 / 60],
    maxSteps: Math.round((o.trace.samples[o.trace.samples.length - 1].tSec + 40) / H),
    tracePoses: true,
    cabin,
    extraBodies: o.parked
      .filter((b) => b.withWhat === "vehicle")
      .map((b) => ({
        x: b.x,
        y: b.y,
        headingDeg: b.headingDeg,
        half: { x: b.halfWidthM, y: PARKED_TOP_Y_M / 2, z: b.halfLengthM },
        centerY: PARKED_TOP_Y_M / 2,
        friction: 0.5,
        restitution: 0.05,
        userData: { npcCollider: true, kind: "vehicle", npcId: SCENARIO_OBSTACLE_NPC_ID_BASE + b.index },
      })),
    frameStart: () => {
      if (phase !== "shift") return;
      const want = wantSelector(leg);
      const sel = cabin.driveline.selector as string;
      if (sel === want) return;
      if (want === "R") cabin.driveline.gearDown();
      else cabin.driveline.gearUp();
    },
  });
  const poses = out.poseAfterStep;
  const sorted = [...off].sort((p, q) => p - q);
  return {
    poses,
    collisions: out.collisions.map((c) => ({ t: c.t, withWhat: c.withWhat })),
    contactStep,
    gapTo: (b) => {
      let m = Infinity;
      let atSec = 0;
      poses.forEach(([x, y, h], i) => {
        const s = obbSeparationM(heroBox(x, y, h), b);
        if (s < m) [m, atSec] = [s, i * H];
      });
      return { m, atSec };
    },
    firstWithin: (b, m) => {
      const i = poses.findIndex(([x, y, h]) => obbSeparationM(heroBox(x, y, h), b) <= m);
      return i < 0 ? null : i * H;
    },
    offPath: { median: sorted[Math.floor(sorted.length / 2)] ?? 0, max: sorted[sorted.length - 1] ?? 0 },
    legsDriven: leg + 1,
    legs: legs.length,
    sheet: sheetDigest(out.result),
    endedAtPoint: out.endedAtPoint,
    steps: out.steps,
    frames: out.frames,
  };
}
