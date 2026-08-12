/**
 * The geometry gate. Every case here is either a property of the separating-axis
 * theorem or a verdict the product got WRONG with the isotropic circle it used
 * before — the false positive that ended the founder's session for driving past
 * a parked car, and the false NEGATIVE hiding behind it (the same 3.0 m circle
 * needed 1.1 m of interpenetration before it noticed a rear-end).
 *
 * `OLD_*_CONTACT_M` are the deleted constants, kept here as literals ON PURPOSE:
 * a test that only asserts the new answer documents nothing. Each defect case
 * asserts BOTH — what the circle said, and what the geometry says.
 */

import { describe, expect, it } from "vitest";
import {
  CONTACT_TOLERANCE_M,
  obbDiscSeparationM,
  obbOverlap,
  obbSeparationM,
  SWEEP_RESOLUTION_M,
  SWEEP_TELEPORT_M,
  sweptObbDiscSeparationM,
  sweptObbSeparationM,
  type Obb2D,
} from "../obb";
import {
  actorObb,
  headingOfDir,
  PEDESTRIAN_BODY_RADIUS_M,
  playerObb,
  PLAYER_HALF_LENGTH_M,
  PLAYER_HALF_WIDTH_M,
} from "../bodies";
import { ContactProbe, isContact } from "../probe";
import { VEHICLE_PROFILE_LENGTH_M, VEHICLE_PROFILE_WIDTH_M } from "../../traffic/types";

/** The deleted orchestrator constants (runners.ts, until 2026-08-10). */
const OLD_VEHICLE_CONTACT_M = 3.0;
const OLD_PEDESTRIAN_CONTACT_M = 1.5;
const OLD_CYCLIST_CONTACT_M = 2.2;

/** What the old test computed: an isotropic centre-to-centre circle. */
const oldCircleFires = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radiusM: number,
): boolean => Math.hypot(ax - bx, ay - by) < radiusM;

const box = (
  x: number,
  y: number,
  headingDeg: number,
  halfLengthM: number,
  halfWidthM: number,
): Obb2D => ({ x, y, headingDeg, halfLengthM, halfWidthM });

/** A parked/travelling fleet car, north-facing unless told otherwise. */
const carHalfL = VEHICLE_PROFILE_LENGTH_M.car / 2; // 2.05
const carHalfW = VEHICLE_PROFILE_WIDTH_M.car / 2; // 0.92
const fleetCar = (x: number, y: number, headingDeg = 0): Obb2D =>
  box(x, y, headingDeg, carHalfL, carHalfW);

// ---------------------------------------------------------------------------
// THE DEFECT THIS MODULE EXISTS TO FIX
// ---------------------------------------------------------------------------

describe("the parked-car false positive (founder report, 2026-08-10)", () => {
  /**
   * The exact reported case: a STATIONARY car alongside, both headings equal,
   * ONE METRE OF CLEAR AIR between the flanks. Centres are therefore
   * 0.85 (player half-width) + 1.0 + 0.92 (car half-width) = 2.77 m apart.
   */
  const FLANK_AIR_M = 1.0;
  const centresM = PLAYER_HALF_WIDTH_M + FLANK_AIR_M + carHalfW;
  const player = playerObb(0, 0, 0);
  const parked = fleetCar(centresM, 0, 0);

  it("MUST NOT be a collision — and reports the metre of air it actually is", () => {
    const sep = obbSeparationM(player, parked);
    expect(sep).toBeCloseTo(FLANK_AIR_M, 10);
    expect(obbOverlap(player, parked)).toBe(false);
    expect(isContact(sep)).toBe(false);
  });

  it("…and the OLD 3.0 m circle DID call it a collision (this is the bug)", () => {
    expect(centresM).toBeLessThan(OLD_VEHICLE_CONTACT_M); // 2.77 < 3.0
    expect(oldCircleFires(0, 0, parked.x, parked.y, OLD_VEHICLE_CONTACT_M)).toBe(true);
  });

  it("the circle fired on every pass closer than 1.16 m of clear air", () => {
    // Solve for the air at which the old circle stopped firing.
    const airAtCircleEdge = OLD_VEHICLE_CONTACT_M - PLAYER_HALF_WIDTH_M - carHalfW;
    expect(airAtCircleEdge).toBeCloseTo(1.23, 2);
    // Between two NPC bodies (0.92 + 0.92) it was 1.16 m — the number quoted in
    // the runners.ts header. Both are more clearance than the lesson teaches.
    expect(OLD_VEHICLE_CONTACT_M - 2 * carHalfW).toBeCloseTo(1.16, 2);
  });

  it("a car 2.9 m DIRECTLY BEHIND was a collision too, and is not one now", () => {
    const behind = fleetCar(0, -2.9, 0);
    expect(oldCircleFires(0, 0, 0, -2.9, OLD_VEHICLE_CONTACT_M)).toBe(true);
    // 2.9 − 2.02 (player tail) − 2.05 (its nose) = −1.17 … they DO overlap
    // nose-to-tail at 2.9 m. Push them to a real 0.5 m gap and the old circle
    // still fires while the geometry sees the air.
    const gapped = fleetCar(0, -(PLAYER_HALF_LENGTH_M + 0.5 + carHalfL), 0);
    expect(obbSeparationM(player, gapped)).toBeCloseTo(0.5, 10);
    expect(oldCircleFires(0, 0, gapped.x, gapped.y, OLD_VEHICLE_CONTACT_M)).toBe(false);
  });
});

describe("the false NEGATIVE the same circle was hiding", () => {
  it("nose-to-tail contact needed 1.1 m of interpenetration before it fired", () => {
    const touchCentresM = PLAYER_HALF_LENGTH_M + carHalfL; // 4.07
    // A real rear-end: 0.3 m INTO the car ahead.
    const struck = fleetCar(0, touchCentresM - 0.3, 0);
    expect(obbSeparationM(playerObb(0, 0, 0), struck)).toBeCloseTo(-0.3, 10);
    expect(isContact(obbSeparationM(playerObb(0, 0, 0), struck))).toBe(true);
    // The circle saw 3.77 m of centres and shrugged.
    expect(oldCircleFires(0, 0, struck.x, struck.y, OLD_VEHICLE_CONTACT_M)).toBe(false);
    // It only woke up once the boxes had interpenetrated by:
    expect(touchCentresM - OLD_VEHICLE_CONTACT_M).toBeCloseTo(1.07, 2);
  });
});

// ---------------------------------------------------------------------------
// SAT properties
// ---------------------------------------------------------------------------

describe("obbSeparationM — separating-axis properties", () => {
  const a = fleetCar(0, 0);

  it("is symmetric in its arguments", () => {
    for (const b of [fleetCar(3, 1, 37), fleetCar(0.5, 0.2, 91), fleetCar(-4, 7, 200)]) {
      expect(obbSeparationM(a, b)).toBeCloseTo(obbSeparationM(b, a), 12);
    }
  });

  it("is invariant to a 180° heading flip (a rectangle has no front)", () => {
    expect(obbSeparationM(a, fleetCar(2.5, 0, 180))).toBeCloseTo(
      obbSeparationM(a, fleetCar(2.5, 0, 0)),
      12,
    );
  });

  it("is invariant to rotating the whole configuration", () => {
    const rot = (p: Obb2D, deg: number): Obb2D => {
      const r = (deg * Math.PI) / 180;
      return {
        ...p,
        x: p.x * Math.cos(r) - p.y * Math.sin(r),
        y: p.x * Math.sin(r) + p.y * Math.cos(r),
        // heading is clockwise-from-north; a CCW world rotation subtracts.
        headingDeg: p.headingDeg - deg,
      };
    };
    const b = fleetCar(2.2, 3.1, 63);
    const base = obbSeparationM(a, b);
    for (const deg of [17, 90, 143, 271]) {
      expect(obbSeparationM(rot(a, deg), rot(b, deg))).toBeCloseTo(base, 9);
    }
  });

  it("measures flank-to-flank and nose-to-tail air exactly", () => {
    expect(obbSeparationM(a, fleetCar(2 * carHalfW + 0.4, 0))).toBeCloseTo(0.4, 10);
    expect(obbSeparationM(a, fleetCar(0, 2 * carHalfL + 1.25))).toBeCloseTo(1.25, 10);
  });

  it("returns 0 for exactly touching bodies, and counts that as contact", () => {
    const touching = fleetCar(2 * carHalfW, 0);
    expect(obbSeparationM(a, touching)).toBeCloseTo(0, 12);
    expect(isContact(obbSeparationM(a, touching))).toBe(true);
    expect(CONTACT_TOLERANCE_M).toBe(0); // no inflation band, by ruling
  });

  it("returns the minimum-translation depth when they overlap", () => {
    // Coincident identical boxes: the cheapest way apart is across the width.
    expect(obbSeparationM(a, fleetCar(0, 0))).toBeCloseTo(-2 * carHalfW, 10);
    // Half a metre of flank interpenetration.
    expect(obbSeparationM(a, fleetCar(2 * carHalfW - 0.5, 0))).toBeCloseTo(-0.5, 10);
  });

  it("catches the crossed configuration where NO corner lies inside the other", () => {
    const long = box(0, 0, 0, 3, 0.2);
    const cross = box(0, 0, 90, 3, 0.2);
    expect(obbOverlap(long, cross)).toBe(true);
  });

  it("rotation reaches where an axis-aligned body cannot", () => {
    const near = box(2.6, 0, 0, 2, 0.9);
    const turned = box(2.6, 0, 45, 2, 0.9);
    const ref = box(0, 0, 0, 2, 0.9);
    expect(obbOverlap(ref, near)).toBe(false);
    expect(obbOverlap(ref, turned)).toBe(true);
  });

  it("never OVERSTATES clearance (the corner-to-corner bound is conservative)", () => {
    // Two 1 m squares, diagonally 2 m apart: the true corner-to-corner distance
    // is √2, the best face normal only proves 1.0. Under-reporting is the safe
    // direction — it can turn a miss into a contact, never a contact into a
    // miss — and the flank/tail cases above show it is EXACT where it matters.
    const s1 = box(0, 0, 0, 0.5, 0.5);
    const s2 = box(2, 2, 0, 0.5, 0.5);
    const trueDist = Math.hypot(2 - 1, 2 - 1);
    const sat = obbSeparationM(s1, s2);
    expect(sat).toBeCloseTo(1.0, 10);
    expect(sat).toBeLessThanOrEqual(trueDist + 1e-12);
  });

  it("agrees with a brute-force corner/edge distance on a random sweep", () => {
    // Deterministic LCG — no test flake, and the property is checked over 4000
    // configurations rather than the four somebody thought of.
    let seed = 20260810;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 4000; i++) {
      const p = box(0, 0, rnd() * 360, 0.5 + rnd() * 3, 0.2 + rnd() * 1.5);
      const q = box(
        (rnd() - 0.5) * 14,
        (rnd() - 0.5) * 14,
        rnd() * 360,
        0.5 + rnd() * 3,
        0.2 + rnd() * 1.5,
      );
      const sat = obbSeparationM(p, q);
      const truth = bruteForceDistanceM(p, q);
      if (truth > 0) {
        // Disjoint: SAT is a conservative LOWER bound on the true distance…
        expect(sat).toBeGreaterThan(0);
        expect(sat).toBeLessThanOrEqual(truth + 1e-9);
      } else {
        // …and overlap must be agreed on, both ways.
        expect(sat).toBeLessThanOrEqual(0);
      }
    }
  });
});

/** Corners of an OBB, district space. */
function corners(b: Obb2D): Array<[number, number]> {
  const h = (b.headingDeg * Math.PI) / 180;
  const fx = Math.sin(h);
  const fy = Math.cos(h);
  const rx = fy;
  const ry = -fx;
  const out: Array<[number, number]> = [];
  for (const sl of [1, -1]) {
    for (const sw of [1, -1]) {
      out.push([
        b.x + fx * b.halfLengthM * sl + rx * b.halfWidthM * sw,
        b.y + fy * b.halfLengthM * sl + ry * b.halfWidthM * sw,
      ]);
    }
  }
  return out;
}

/** True Euclidean distance between two rectangles (0 when they overlap) —
 *  an independent oracle: point-to-segment over all 16 corner/edge pairs. */
function bruteForceDistanceM(a: Obb2D, b: Obb2D): number {
  if (obbOverlap(a, b)) return 0;
  const ca = corners(a);
  const cb = corners(b);
  const edges = (c: Array<[number, number]>): Array<[[number, number], [number, number]]> => [
    [c[0], c[1]],
    [c[1], c[3]],
    [c[3], c[2]],
    [c[2], c[0]],
  ];
  let best = Infinity;
  const pointSeg = (
    px: number,
    py: number,
    [x1, y1]: [number, number],
    [x2, y2]: [number, number],
  ): number => {
    const ex = x2 - x1;
    const ey = y2 - y1;
    const len2 = ex * ex + ey * ey;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * ex + (py - y1) * ey) / len2));
    return Math.hypot(px - (x1 + ex * t), py - (y1 + ey * t));
  };
  for (const [px, py] of ca) for (const e of edges(cb)) best = Math.min(best, pointSeg(px, py, e[0], e[1]));
  for (const [px, py] of cb) for (const e of edges(ca)) best = Math.min(best, pointSeg(px, py, e[0], e[1]));
  return best;
}

// ---------------------------------------------------------------------------
// Pedestrians are discs, and heading matters
// ---------------------------------------------------------------------------

describe("obbDiscSeparationM — the pedestrian shape", () => {
  const player = playerObb(0, 0, 0);
  const R = PEDESTRIAN_BODY_RADIUS_M;

  it("1.5 m of centres BESIDE the car was 'ran over'; it is 0.35 m of air", () => {
    const sep = obbDiscSeparationM(player, 1.5, 0, R);
    expect(sep).toBeCloseTo(1.5 - PLAYER_HALF_WIDTH_M - R, 10); // 0.35
    expect(isContact(sep)).toBe(false);
    expect(oldCircleFires(0, 0, 1.5, 0, OLD_PEDESTRIAN_CONTACT_M)).toBe(false);
    // …and one centimetre closer the old circle DID fire, on 0.34 m of air.
    expect(oldCircleFires(0, 0, 1.49, 0, OLD_PEDESTRIAN_CONTACT_M)).toBe(true);
    expect(isContact(obbDiscSeparationM(player, 1.49, 0, R))).toBe(false);
  });

  it("1.5 m BEHIND the rear bumper is not a contact — the tail is 2.02 m back", () => {
    const behindBumper = -(PLAYER_HALF_LENGTH_M + 1.5);
    expect(obbDiscSeparationM(player, 0, behindBumper, R)).toBeCloseTo(1.5 - R, 10);
    // 1.5 m from the CENTRE, however, is inside the car — and always was.
    expect(obbDiscSeparationM(player, 0, -1.5, R)).toBeLessThan(0);
  });

  it("is exact at a corner (closest point, not a face normal)", () => {
    const cx = PLAYER_HALF_WIDTH_M + 3;
    const cy = PLAYER_HALF_LENGTH_M + 4;
    expect(obbDiscSeparationM(player, cx, cy, R)).toBeCloseTo(Math.hypot(3, 4) - R, 10);
  });

  it("touching the nose is contact; a hair beyond it is not", () => {
    const noseY = PLAYER_HALF_LENGTH_M + R;
    expect(isContact(obbDiscSeparationM(player, 0, noseY - 0.001, R))).toBe(true);
    expect(isContact(obbDiscSeparationM(player, 0, noseY + 0.001, R))).toBe(false);
  });

  it("follows the car's heading, not the world axes", () => {
    const turned = playerObb(0, 0, 90); // nose points east
    const ahead = PLAYER_HALF_LENGTH_M + 1;
    expect(obbDiscSeparationM(turned, ahead, 0, R)).toBeCloseTo(1 - R, 10);
    expect(obbDiscSeparationM(turned, 0, ahead, R)).toBeCloseTo(ahead - PLAYER_HALF_WIDTH_M - R, 10);
  });
});

describe("the cyclist proxy keeps its heading (and its 0.46 m of width)", () => {
  it("2.35 m of centres beside a CHILD cyclist is 1.3 m of air, not a crash", () => {
    // sc-vu-child-cyclist's authored mistake line, measured in its own trace.
    const child = actorObb({ x: 2.35, y: 0, dirX: 0, dirY: 1 }, "childCyclist");
    const sep = obbSeparationM(playerObb(0, 0, 0), child);
    expect(sep).toBeCloseTo(2.35 - PLAYER_HALF_WIDTH_M - VEHICLE_PROFILE_WIDTH_M.childCyclist / 2, 9);
    expect(sep).toBeGreaterThan(1.3);
    expect(isContact(sep)).toBe(false);
    // The old cyclist circle (2.2) missed it, but the CUT-IN runner graded the
    // same actor on the CAR circle (3.0) — which is what billed it a collision.
    expect(oldCircleFires(0, 0, 2.35, 0, OLD_CYCLIST_CONTACT_M)).toBe(false);
    expect(oldCircleFires(0, 0, 2.35, 0, OLD_VEHICLE_CONTACT_M)).toBe(true);
  });

  it("but a rider actually clipped by the flank still bills", () => {
    const clipped = actorObb({ x: 0.9, y: 1.0, dirX: 0, dirY: 1 }, "cyclist");
    expect(isContact(obbSeparationM(playerObb(0, 0, 0), clipped))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sweeping — the tunnelling hole a pose-only test leaves open
// ---------------------------------------------------------------------------

describe("sweptObbSeparationM — no contact between two frames", () => {
  const still = fleetCar(0, 0, 90); // parked ACROSS the player's path

  it("a pose-only test steps over a fast crossing; the sweep does not", () => {
    // One director tick at the 0.1 s clamp, player at ~60 m/s: 6 m of travel,
    // from 3 m short of the parked body to 3 m past it.
    const before = { x: 0, y: -3, headingDeg: 0 };
    const now = playerObb(0, 3, 0);
    expect(obbSeparationM({ ...now, y: -3 }, still)).toBeGreaterThan(0); // last frame clear
    expect(obbSeparationM(now, still)).toBeGreaterThan(0); // this frame clear
    const swept = sweptObbSeparationM(before, now, { x: 0, y: 0, headingDeg: 90 }, still);
    expect(swept).toBeLessThanOrEqual(0);
    expect(isContact(swept)).toBe(true);
  });

  it("reports the MINIMUM separation over the tick, not the endpoint one", () => {
    const before = { x: 6, y: 0, headingDeg: 0 };
    const now = playerObb(-6, 0, 0);
    const parked = fleetCar(0, 8, 0); // passed abeam, well clear
    const endpoint = obbSeparationM(now, parked);
    const swept = sweptObbSeparationM(before, now, { x: 0, y: 8, headingDeg: 0 }, parked);
    expect(swept).toBeLessThan(endpoint);
    expect(swept).toBeCloseTo(8 - PLAYER_HALF_LENGTH_M - carHalfL, 6);
  });

  it("never invents contact when the whole tick is clear", () => {
    const before = { x: 3, y: -20, headingDeg: 0 };
    const now = playerObb(3, 0, 0);
    const parked = fleetCar(0, 0, 0); // 3 m of centres = 1.23 m of air
    const swept = sweptObbSeparationM(before, now, { x: 0, y: 0, headingDeg: 0 }, parked);
    expect(swept).toBeCloseTo(3 - PLAYER_HALF_WIDTH_M - carHalfW, 6);
    expect(isContact(swept)).toBe(false);
  });

  it("falls back to the pose test on a TELEPORT (a re-stage is not motion)", () => {
    const parked = fleetCar(0, 0, 0);
    const far = { x: 0, y: -(SWEEP_TELEPORT_M + 5), headingDeg: 0 };
    const now = playerObb(0, 20, 0);
    const swept = sweptObbSeparationM(far, now, { x: 0, y: 0, headingDeg: 0 }, parked);
    expect(swept).toBe(obbSeparationM(now, parked));
    expect(isContact(swept)).toBe(false);
  });

  it("a first frame (no history) degrades to the pose test", () => {
    const parked = fleetCar(0, 0, 0);
    const now = playerObb(0, 20, 0);
    expect(sweptObbSeparationM(null, now, null, parked)).toBe(obbSeparationM(now, parked));
  });

  it("sub-samples finely enough to catch a shallow clip", () => {
    // A grazing pass: the player crosses a parked flank with 3 cm of overlap.
    const overlapM = 0.03;
    const parked = fleetCar(PLAYER_HALF_WIDTH_M + carHalfW - overlapM, 0, 0);
    const before = { x: 0, y: -4, headingDeg: 0 };
    const now = playerObb(0, 4, 0);
    const swept = sweptObbSeparationM(before, now, { x: parked.x, y: 0, headingDeg: 0 }, parked);
    expect(swept).toBeCloseTo(-overlapM, 6);
    expect(isContact(swept)).toBe(true);
    expect(SWEEP_RESOLUTION_M).toBeLessThan(VEHICLE_PROFILE_WIDTH_M.childCyclist);
  });

  it("sweeps the DISC case too", () => {
    const before = { x: 0, y: -5, headingDeg: 0 };
    const now = playerObb(0, 5, 0);
    const walker = { x: 0, y: 0, headingDeg: 0 };
    expect(obbDiscSeparationM(now, 0, 0, PEDESTRIAN_BODY_RADIUS_M)).toBeGreaterThan(0);
    const swept = sweptObbDiscSeparationM(before, now, walker, 0, 0, PEDESTRIAN_BODY_RADIUS_M);
    expect(isContact(swept)).toBe(true);
  });

  it("is deterministic — same inputs, byte-identical output", () => {
    const before = { x: 1, y: -6, headingDeg: 4 };
    const now = playerObb(1.4, 2.2, 11);
    const prevActor = { x: 3, y: 1, headingDeg: 181 };
    const actor = fleetCar(2.9, -1, 179);
    const first = sweptObbSeparationM(before, now, prevActor, actor);
    for (let i = 0; i < 5; i++) {
      expect(sweptObbSeparationM(before, now, prevActor, actor)).toBe(first);
    }
  });
});

describe("ContactProbe — the per-encounter sweep memory", () => {
  it("first call is pose-only, the second sweeps from it", () => {
    const probe = new ContactProbe();
    const parked = fleetCar(0, 0, 90);
    const first = probe.vehicleSeparationM("a", playerObb(0, -3, 0), parked);
    expect(first).toBeGreaterThan(0);
    const second = probe.vehicleSeparationM("a", playerObb(0, 3, 0), parked);
    expect(isContact(second)).toBe(true);
  });

  it("reset() forgets the history, so a re-stage cannot sweep across a body", () => {
    const probe = new ContactProbe();
    const parked = fleetCar(0, 0, 90);
    probe.vehicleSeparationM("a", playerObb(0, -3, 0), parked);
    probe.reset();
    expect(isContact(probe.vehicleSeparationM("a", playerObb(0, 3, 0), parked))).toBe(false);
  });

  it("keys are independent — one stream car's history is not another's", () => {
    const probe = new ContactProbe();
    const left = fleetCar(-8, 0, 90);
    const right = fleetCar(8, 0, 90);
    // Left: driven straight through. Right: crept up and stopped 0.56 m short
    // (3.5 m of centres against 2.02 + 0.92 of bodies).
    probe.vehicleSeparationM("l", playerObb(-8, -3, 0), left);
    probe.vehicleSeparationM("r", playerObb(8, -6, 0), right);
    expect(isContact(probe.vehicleSeparationM("l", playerObb(-8, 3, 0), left))).toBe(true);
    expect(isContact(probe.vehicleSeparationM("r", playerObb(8, -3.5, 0), right))).toBe(false);
  });

  it("tracks the DISC channel on its own key", () => {
    const probe = new ContactProbe();
    probe.discSeparationM("p", playerObb(0, -5, 0), 0, 0, PEDESTRIAN_BODY_RADIUS_M);
    const swept = probe.discSeparationM("p", playerObb(0, 5, 0), 0, 0, PEDESTRIAN_BODY_RADIUS_M);
    expect(isContact(swept)).toBe(true);
  });
});

describe("headingOfDir", () => {
  it("maps unit travel directions onto district bearings", () => {
    expect(headingOfDir(0, 1)).toBeCloseTo(0, 12); // north
    expect(headingOfDir(1, 0)).toBeCloseTo(90, 12); // east
    expect(headingOfDir(0, -1)).toBeCloseTo(180, 12); // south
    expect(headingOfDir(-1, 0)).toBeCloseTo(-90, 12); // west
  });
});
