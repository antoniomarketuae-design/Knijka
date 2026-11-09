/**
 * AN ENTRY INTO A 90° BAY BEGUN WHOLLY FROM THE AISLE'S RIGHT HALF, DRIVEN ON
 * THE PRODUCT CHASSIS AT ITS PHYSICS LIMIT — test support (nothing in the
 * product imports it). catalogue-demo-curvature:dae908c7, family «curvpark2»,
 * round 3 (integrator ruling CP2-1bis, condition (1): «THE PRECONDITION IS
 * MEASURED, NOT ASSUMED: on the PRODUCT CHASSIS at the PHYSICS limit (full
 * lock …), no forward entry into the lesson's bay begun with the car wholly in
 * the RIGHT half of the aisle reaches the parked position without contact»).
 *
 * WHY. ЗДвП чл. 35, ал. 2 (content/law/acts/zdvp.json) lets a turn BEGIN from
 * another part of the carriageway only «Когато радиусът на завиване на пътното
 * превозно средство е по-голям от радиуса на завоя». Whether that is so for a
 * bay entry is a fact about the car and the lot, so it is measured: the
 * product's own chassis (`createHeadlessChassis` + `VehicleSim` on rapier, the
 * lesson's world colliders and its parked cars mounted with their LIVE GLB
 * extents — parkChassisDrive's harness) is put on the aisle wholly right of
 * the centre line, square, at rest, and driven the TIGHTEST way the car can:
 *   · the wheel wound to full lock AT REST (no rolling while it winds — the
 *     tightest entry a driver can make; the steering rate costs nothing);
 *   · rolled at walking pace on full lock until the heading is within
 *     `leadDeg` of the bay's axis;
 *   · then a closed-loop driver aligns the car on the bay's centre line and
 *     rolls it in until its centre is at the bay's centre (forward: nose
 *     first; reverse: tail first, the gear moved on the real selector).
 * After the first contact the car is braked to rest (the entry is over).
 * Reported: the minimum signed gap of the chassis' pose to every parked body
 * (≤ 0: in it), the bodies the lesson's ledger booked, and the rest pose.
 * Decided per physics step from the car after the previous step (ADR-017's
 * rule), at 60 Hz.
 */
import { SCENARIO_OBSTACLE_NPC_ID_BASE } from "@/components/sim/ScenarioObstacles";
import { obbSeparationM } from "../../collision";
import type { LessonSpec } from "../../contracts";
import { CabinControls } from "../../scene/cabin";
import * as T from "../../vehicle/tuning";
import { driveIntoContact, sheetDigest, type DriveState } from "../../lessons/scenario/__tests__/rapierContactDrive";
import { heroBox, wrap180, type ProductBox } from "./parkDepthProduct";

const H = T.FIXED_DT;
const PARKED_TOP_Y_M = 1.45;
/** The car's half width, m — «wholly in the right half»: centre x ≥ this. */
export const HERO_HALF_WIDTH_M = T.CHASSIS_HALF_EXTENTS.x;
const ARC_KMH = 3;
const ALIGN_KMH = 2.5;
const PREP_S = 1.2;

export interface LimitEntryOutcome {
  x0: number;
  y0: number;
  leadDeg: number;
  /** Min signed OBB gap of the chassis pose to any parked body, m, and which. */
  minGap: { m: number; model: string; index: number; atSec: number };
  /** COLLISION violations the lesson's ledger booked. */
  collisions: string[];
  /** Rest pose. */
  rest: { x: number; y: number; headingDeg: number };
  /** The lesson sheet the drive closed with (rapierContactDrive sheetDigest). */
  sheet: string;
  /** No contact, at rest with its centre at the bay's centre line ± `inBayM`, square within 6°. */
  parked: boolean;
}

export function driveLimitEntry(o: {
  lesson: LessonSpec;
  raw: unknown;
  parked: readonly ProductBox[];
  bay: { x: number; y: number };
  kind: "forward" | "reverse";
  x0: number;
  y0: number;
  leadDeg: number;
  /** Start heading, degrees (default 0, square on the aisle; negative: angled left, away from the bay). */
  h0?: number;
  /** Lateral tolerance of «parked», m (the bay's slack: (bay width − car width) / 2). */
  inBayM: number;
  /**
   * Mount the parked cars (default true). false: the chassis drives the whole
   * entry through where they stand, and `minGap` is how far its body would
   * have to overlap one (negative) — the measure of HOW MUCH a right-half
   * start misses by, which a contact-stopped drive cannot give.
   */
  mount?: boolean;
}): LimitEntryOutcome {
  const g = globalThis as unknown as { window?: unknown };
  const hadWindow = g.window !== undefined;
  if (!hadWindow) g.window = { addEventListener() {}, removeEventListener() {} };
  const cabin = new CabinControls({}, "ready");
  if (!hadWindow) delete g.window;
  if (!cabin.seatbeltOn) cabin.toggleSeatbelt();
  const rev = o.kind === "reverse";
  const want = rev ? "R" : "D";
  // Forward: heading 0 → +90 (a right turn). Reverse: heading 0 → −90 (the tail swings right).
  const target = rev ? -90 : 90;
  let phase: "prep" | "arc" | "align" | "stop" | "done" = "prep";
  let since = 0;
  let prevKmh = 0;
  let hitStep = -1;
  const speed = (st: DriveState, w: number, steer: number) => {
    const v = Math.abs(st.speedKmh);
    const dv = w - v;
    if (dv >= 0) return { throttle: Math.min(1, dv / 4 + 0.1), brake: 0, steer };
    return { throttle: 0, brake: Math.min(1, -dv / 4), steer };
  };
  const control = (st: DriveState) => {
    const t = st.step * H;
    const dropped = Math.abs(prevKmh) - Math.abs(st.speedKmh) > 0.8 && Math.abs(prevKmh) > 0.5;
    prevKmh = st.speedKmh;
    if (hitStep < 0 && dropped && (phase === "arc" || phase === "align")) {
      hitStep = st.step;
      phase = "done";
    }
    const h = wrap180(st.headingDeg);
    if (phase === "done" || phase === "stop") return { throttle: 0, brake: 1, steer: 0 };
    if (phase === "prep") {
      // full lock right, wound at rest, brake held; the gear on the selector
      if (t - since >= PREP_S && cabin.driveline.selector === want) phase = "arc";
      return { throttle: 0, brake: 1, steer: -1 };
    }
    if (phase === "arc") {
      if (rev ? h <= target + o.leadDeg : h >= target - o.leadDeg) phase = "align";
      else return speed(st, ARC_KMH, -1);
    }
    // align on the bay's centre line, rolling in until the centre is at the bay's centre
    if (st.x >= o.bay.x) {
      phase = "stop";
      return { throttle: 0, brake: 1, steer: 0 };
    }
    const e = st.y - o.bay.y;
    const corr = Math.max(-30, Math.min(30, (Math.atan(0.8 * e) * 180) / Math.PI));
    const hT = target + corr;
    const steer = rev ? Math.max(-1, Math.min(1, (hT - h) / 15)) : Math.max(-1, Math.min(1, (h - hT) / 15));
    return speed(st, ALIGN_KMH, steer);
  };
  const out = driveIntoContact({
    lesson: o.lesson,
    raw: o.raw,
    start: { x: o.x0, y: o.y0, headingDeg: o.h0 ?? 0 },
    control,
    deltas: [1 / 60],
    maxSteps: Math.round(40 / H),
    tracePoses: true,
    cabin,
    extraBodies: (o.mount === false ? [] : o.parked)
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
      if (phase !== "prep") return;
      const sel = cabin.driveline.selector as string;
      if (sel === want) return;
      if (want === "R") cabin.driveline.gearDown();
      else cabin.driveline.gearUp();
    },
  });
  const poses = out.poseAfterStep;
  let minGap = { m: Infinity, model: "", index: -1, atSec: 0 };
  poses.forEach(([x, y, hd], i) => {
    const hero = heroBox(x, y, hd);
    for (const b of o.parked) {
      const s = obbSeparationM(hero, b);
      if (s < minGap.m) minGap = { m: s, model: b.model, index: b.index, atSec: i * H };
    }
  });
  const [rx, ry, rh] = poses[poses.length - 1];
  const collisions = out.collisions.map((c) => c.withWhat);
  return {
    x0: o.x0,
    y0: o.y0,
    leadDeg: o.leadDeg,
    minGap,
    collisions,
    rest: { x: rx, y: ry, headingDeg: rh },
    sheet: sheetDigest(out.result),
    parked:
      minGap.m > 0 &&
      collisions.length === 0 &&
      hitStep < 0 &&
      rx >= o.bay.x - 0.3 &&
      Math.abs(ry - o.bay.y) <= o.inBayM &&
      Math.abs(wrap180(rh - target)) <= 6,
  };
}
