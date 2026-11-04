/**
 * sc-vu-bikelane-turn:9141072b (lane vbltiming, integrator ruling T1(b),
 * confirmed 2026-11-02) — THE FOOTPRINT LINE GUARD, and only where it is
 * authored.
 *
 * THE BLOCKING FACT (measured on the base, STEP 0 (b) of the lane): every
 * staged rider carries the player guard, a FOLLOWING guard that brakes for a
 * student whose CENTRE is within GUARD_LATERAL_M 3.0 of the rider's heading
 * line. A curb rider rides 2.6 m right of the car's lane centre, inside that
 * corridor, so a student who stands in his own lane to let him pass holds him
 * ≈ 6 m behind his centre for as long as he stands — with the with-flow rider
 * of sc-vu-bikelane-turn held at −73.5 and cruising 5.0 m/s on the committed
 * shadow, he came to rest at x −26.04 against the car at −20.04, below 0.1 m/s
 * until the car moved off (recorder seed 7 and L1–L3). No staging could make
 * him pass the waiting car.
 *
 * WHAT IS PINNED HERE, against the real traffic system and the real runner:
 *   M2  the footprint rider never strikes a car standing ACROSS his line;
 *   M2b …nor a car that drove into a pose yawed 45° across the track with its
 *       centre 1.86 m off his line and its front-right corner on it (a
 *       centre-only corridor narrow enough to let him pass a waiting car would
 *       strike it);
 *   M2c while the student's heading is unknown (never seen moving) the centre
 *       corridor stands: he rests ≈ 6 m short of a car standing in its lane;
 *   M3  NO OTHER RIDER reads it: the sc-vu-cyclist-hook rider and the exam V1
 *       rider keep today's centre corridor — a student standing 10 m ahead in
 *       his lane holds them ≈ 6 m short, below 0.1 m/s;
 *   and the pure geometry of `footprintGuardAlongM`, and the 0.4 m half-width
 *   pinned to the product's own body allowance.
 */
import { describe, expect, it } from "vitest";
import { obbSeparationM } from "../../../collision";
import { PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../../collision";
import type { CyclistRightHookSpec, StagedEventSpec } from "../../../contracts";
import { CyclistRightHookRunner } from "../../../orchestrator/runners";
import type { StagedTrafficPort } from "../../../orchestrator/types";
import { VULNERABLE_PASS_BODY_ALLOWANCE_M } from "../../../runtime/worldRuntime";
import { FOOTPRINT_LINE_HALF_WIDTH_M, footprintGuardAlongM } from "../../../traffic/staged";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict } from "../../../traffic/types";
import { VEHICLE_PROFILE_LENGTH_M, VEHICLE_PROFILE_WIDTH_M } from "../../../traffic/types";
import { EXAM_SHELLS } from "../../examBankData";
import { SCENARIO_TEMPLATES } from "../templates";
import { SC_VU_BIKELANE_TURN } from "../templates-vru2";
import { loadDistrict } from "./witnessLiveRung";

const DT = 1 / 60;
const r2 = (n: number) => +n.toFixed(2);

function stagedSpecs(t: { staged?: readonly unknown[] }): CyclistRightHookSpec[] {
  return ((t.staged ?? []) as StagedEventSpec[]).filter((s): s is CyclistRightHookSpec => s.kind === "cyclistRightHook");
}

const VBL_WF = stagedSpecs(SC_VU_BIKELANE_TURN).find((s) => s.id === "sc-vbl-rider-wf")!;
const VU_HOOK = stagedSpecs(SCENARIO_TEMPLATES.find((t) => t.id === "sc-vu-cyclist-hook")!)[0];
/** The exam V1 rider (examBankData.ts V1_SITE via cyclistSlot), as slot xA builds it. */
function examV1Rider(): CyclistRightHookSpec {
  for (const shell of EXAM_SHELLS) {
    for (const slot of shell.slots) {
      if (slot.siteId !== "V1-borovski-t") continue;
      for (const o of slot.options) {
        if (o.build) return o.build("exam-v1-probe") as CyclistRightHookSpec;
      }
    }
  }
  throw new Error("exam V1 site not found");
}

interface Pose {
  x: number;
  y: number;
  /** degrees, (sin h, cos h) forward */
  h: number;
}

/**
 * Stage `spec` through its own runner, hold him, drive the student into `to`
 * along heading `to.h` over `inM` metres (0: placed there and never moved),
 * release him, and let the world run `sec` seconds with the student standing.
 */
function encounter(
  districtId: string,
  spec: CyclistRightHookSpec,
  place: (rider: { x: number; y: number; dirX: number; dirY: number }) => Pose,
  inM: number,
  sec = 12,
  /** The rider's body the separation is measured with (default: the 0.4 × 0.4 proxy). */
  riderBody: { halfLengthM: number; halfWidthM: number } = { halfLengthM: 0.4, halfWidthM: 0.4 },
) {
  const traffic = createTrafficSystem(loadDistrict(districtId) as TrafficDistrict, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  const runner = new CyclistRightHookRunner(spec);
  runner.stage(traffic as unknown as StagedTrafficPort, () => 0.5, true);
  const v0 = traffic.staged(spec.id)!;
  const rider0 = { x: v0.x, y: v0.y, dirX: v0.dirX, dirY: v0.dirY };
  const to = place(rider0);
  const fx = Math.sin((to.h * Math.PI) / 180);
  const fy = Math.cos((to.h * Math.PI) / 180);
  const ctx = (x: number, y: number, kmh: number) => ({
    signalPhase: () => "green" as const,
    playerPos: { x, y },
    playerSpeedKmh: kmh,
    playerHeadingDeg: to.h,
  });
  // Drive in at 5 m/s (the rider holds — the runner has not released him).
  const steps = Math.round(inM / (5 * DT));
  for (let i = 0; i <= steps; i++) {
    const back = inM - i * 5 * DT;
    traffic.update(DT, ctx(to.x - fx * back, to.y - fy * back, i < steps ? 18 : 0));
  }
  traffic.stagedCommand(spec.id, { type: "cruise" });
  let minSep = Infinity;
  const car = { x: to.x, y: to.y, headingDeg: to.h, halfLengthM: 2.02, halfWidthM: 0.85 };
  let last = traffic.staged(spec.id)!;
  for (let i = 0; i < Math.round(sec / DT); i++) {
    traffic.update(DT, ctx(to.x, to.y, 0));
    last = traffic.staged(spec.id)!;
    const rh = (Math.atan2(last.dirX, last.dirY) * 180) / Math.PI;
    const sep = obbSeparationM(car, { x: last.x, y: last.y, headingDeg: rh, ...riderBody });
    if (sep < minSep) minSep = sep;
  }
  // Where he rests, along his own line, against the student's centre.
  const along = (to.x - last.x) * rider0.dirX + (to.y - last.y) * rider0.dirY;
  return { minSep, along, speed: last.speedMps, rider: { x: last.x, y: last.y }, rider0, to };
}

/** The car's lane centre is 2.6 m LEFT of a curb rider (offset +2.6 right of travel). */
const inLaneAhead = (aheadM: number, extraRightM: number) => (r: { x: number; y: number; dirX: number; dirY: number }): Pose => {
  const rx = r.dirY;
  const ry = -r.dirX;
  return {
    x: r.x + r.dirX * aheadM - rx * extraRightM,
    y: r.y + r.dirY * aheadM - ry * extraRightM,
    h: (Math.atan2(r.dirX, r.dirY) * 180) / Math.PI,
  };
};

describe("the footprint line guard — geometry (traffic/staged.ts footprintGuardAlongM)", () => {
  it("its half-width is the cyclist proxy's: VULNERABLE_PASS_BODY_ALLOWANCE_M − PLAYER_HALF_WIDTH_M = 0.4", () => {
    expect(FOOTPRINT_LINE_HALF_WIDTH_M).toBeCloseTo(VULNERABLE_PASS_BODY_ALLOWANCE_M - PLAYER_HALF_WIDTH_M, 12);
  });

  it("a car in its lane 1.75 m clear of the line is not on it; one across it is, at its near edge; one behind him is not", () => {
    // Rider heading east (1, 0); the car heading east too.
    expect(footprintGuardAlongM(10, 2.6, 1, 0, 1, 0)).toBe(Infinity);
    // Across the line (heading south), centre on it 10 m ahead: the near
    // edge of the box is 10 − 0.85.
    expect(footprintGuardAlongM(10, 0, 1, 0, 0, -1)).toBeCloseTo(9.15, 9);
    // The same car 10 m BEHIND him.
    expect(footprintGuardAlongM(-10, 0, 1, 0, 0, -1)).toBe(Infinity);
    // A box over his own position: 0, the guard's full stop.
    expect(footprintGuardAlongM(0.5, 0, 1, 0, 1, 0)).toBe(0);
  });

  it("the yawed car (heading 135°, centre 1.86 m off his line): its front-right corner is on the line", () => {
    const h = (135 * Math.PI) / 180;
    // Car centre 10 m ahead and 1.86 m to his LEFT (north): cross = −1.86.
    const a = footprintGuardAlongM(10, 1.86, 1, 0, Math.sin(h), Math.cos(h));
    console.log(`yawed 135°: nearest box point on the line at along ${r2(a)} m`);
    expect(a).toBeLessThan(16);
    expect(a).toBeGreaterThan(10);
    // …and the centre-only reading would not see it at the proxy's 1.25 m.
    expect(1.86).toBeGreaterThan(VULNERABLE_PASS_BODY_ALLOWANCE_M);
  });
});

describe("M2 / M2b / M2c — the authored rider (sc-vu-bikelane-turn with-flow) against a standing car", () => {
  it("the field is authored on him", () => {
    expect(VBL_WF.actor.playerGuardFootprint).toBe(true);
  });

  it("M2: a car that drove in and stands ACROSS his line 10 m ahead is never struck; he rests ≈ 6 m short of its near edge", () => {
    const r = encounter("vu-bikelane-v1", VBL_WF, (q) => ({ x: q.x + 10, y: q.y, h: 180 }), 6);
    console.log(`M2: min sep ${r2(r.minSep)} m, rest along to the car centre ${r2(r.along)} m, v ${r2(r.speed)}`);
    expect(r.minSep, "rider struck a standing car").toBeGreaterThan(0);
    expect(r.along - 0.85).toBeGreaterThan(5.5);
    expect(r.speed).toBeLessThan(0.1);
  });

  it("M2b: a car yawed 45° across the track (heading 135°, centre 1.86 m off his line, front-right corner on it) is never struck", () => {
    const r = encounter("vu-bikelane-v1", VBL_WF, (q) => ({ x: q.x + 10, y: q.y + 1.86, h: 135 }), 5);
    console.log(`M2b: min sep ${r2(r.minSep)} m, rest along ${r2(r.along)} m, v ${r2(r.speed)}, rider ${JSON.stringify([r2(r.rider.x), r2(r.rider.y)])}`);
    expect(r.minSep, "rider struck the yawed standing car").toBeGreaterThan(0);
    expect(r.speed).toBeLessThan(0.1);
  });

  it("…and a car standing in its OWN lane 10 m ahead (1.75 m clear of his line) is passed — the waiting student lets him by", () => {
    const r = encounter("vu-bikelane-v1", VBL_WF, inLaneAhead(10, 2.6), 5);
    console.log(`in-lane: rest along ${r2(r.along)} m (negative = past the car), v ${r2(r.speed)}, min sep ${r2(r.minSep)}`);
    expect(r.along, "the footprint rider did not pass a car standing in its own lane").toBeLessThan(-10);
    expect(r.minSep).toBeGreaterThan(1.3);
  });

  it("M2c: the student never seen moving (heading unknown) → the centre corridor stands: he rests ≈ 6 m short of the car in its lane", () => {
    const r = encounter("vu-bikelane-v1", VBL_WF, inLaneAhead(10, 2.6), 0);
    console.log(`M2c: rest along ${r2(r.along)} m, v ${r2(r.speed)}`);
    expect(r.along, "heading unknown, yet the footprint guard let him pass").toBeGreaterThan(5.5);
    expect(r.along).toBeLessThan(6.5);
    expect(r.speed).toBeLessThan(0.1);
  });
});

/**
 * C1 (integrator condition, landing of lane vbltiming, 2026-11-04) — THE
 * 0.4 m BAND IS WHAT KEEPS A STANDING CAR UNTOUCHED, pinned by behaviour (the
 * verifier's mutant V9 — FOOTPRINT_LINE_HALF_WIDTH_M / 2 inside
 * footprintGuardAlongM — survived every test above: only the constant's
 * equality to 1.25 − 0.85 was pinned). The rider's REAL body is
 * VEHICLE_PROFILE_WIDTH_M.cyclist 0.46 wide (half 0.23) ×
 * VEHICLE_PROFILE_LENGTH_M.cyclist 1.8 long; a standing car whose NEAREST
 * corner sits 0.30 m off his line (inside the 0.4 band, outside a 0.2 one) must
 * hold him short of it — he rests ≈ GUARD_STOP_SHORT_M 6 m short of the
 * nearest point of the car on his line, below 0.1 m/s, and his real body never
 * touches the car. With the band halved he is not held at all: he rides past
 * the corner with 0.07 m of air (0.30 − 0.23).
 */
describe("C1 — the 0.4 m band holds the rider short of a car whose nearest corner is 0.30 m off his line", () => {
  const RIDER_BODY = { halfLengthM: VEHICLE_PROFILE_LENGTH_M.cyclist / 2, halfWidthM: VEHICLE_PROFILE_WIDTH_M.cyclist / 2 };
  /** The car's four corners in the rider's start frame: [along, cross], cross + = right of his travel. */
  function cornersInRiderFrame(r: { x: number; y: number; dirX: number; dirY: number }, to: Pose): Array<[number, number]> {
    const px = Math.sin((to.h * Math.PI) / 180);
    const py = Math.cos((to.h * Math.PI) / 180);
    const out: Array<[number, number]> = [];
    for (const sl of [-PLAYER_HALF_LENGTH_M, PLAYER_HALF_LENGTH_M]) {
      for (const sw of [-PLAYER_HALF_WIDTH_M, PLAYER_HALF_WIDTH_M]) {
        const cx = to.x + sl * px + sw * py - r.x;
        const cy = to.y + sl * py - sw * px - r.y;
        out.push([cx * r.dirX + cy * r.dirY, cx * r.dirY - cy * r.dirX]);
      }
    }
    return out;
  }
  /** A car standing 10 m ahead, LEFT of his line (the car's side), at heading
   *  `relDeg` from his, placed so that its nearest corner is `gapM` off his line. */
  const cornerOff = (relDeg: number, gapM: number) => (r: { x: number; y: number; dirX: number; dirY: number }): Pose => {
    const h = (Math.atan2(r.dirX, r.dirY) * 180) / Math.PI + relDeg;
    const probe = cornersInRiderFrame({ ...r, x: 0, y: 0 }, { x: 0, y: 0, h });
    const reach = Math.max(...probe.map(([, c]) => c)); // how far right of the centre the box reaches
    const left = reach + gapM; // centre this far LEFT of his line
    return { x: r.x + r.dirX * 10 - r.dirY * left, y: r.y + r.dirY * 10 + r.dirX * left, h };
  };
  for (const [name, relDeg] of [
    ["parallel to him (a car that drifted to the track's edge)", 0],
    ["yawed 45° across the track (heading 135°)", 45],
  ] as Array<[string, number]>) {
    it(`${name}: he rests ≈ 6 m short of its nearest corner, < 0.1 m/s, and his 0.46 m body never touches it`, () => {
      const r = encounter("vu-bikelane-v1", VBL_WF, cornerOff(relDeg, 0.3), 5, 12, RIDER_BODY);
      const corners = cornersInRiderFrame(r.rider0, r.to);
      const nearest = Math.min(...corners.map(([, c]) => Math.abs(c)));
      // The geometry this cell is about: the nearest corner 0.25–0.35 m off his line, on the car's side.
      expect(nearest).toBeGreaterThanOrEqual(0.25);
      expect(nearest).toBeLessThanOrEqual(0.35);
      expect(Math.max(...corners.map(([, c]) => c))).toBeLessThan(0);
      const cornerAlong = Math.min(...corners.filter(([, c]) => Math.abs(c) <= nearest + 1e-9).map(([a]) => a));
      const riderAlong = (r.rider.x - r.rider0.x) * r.rider0.dirX + (r.rider.y - r.rider0.y) * r.rider0.dirY;
      console.log(`C1 ${name}: corner ${r2(nearest)} m off his line at along ${r2(cornerAlong)}; rider rests at along ${r2(riderAlong)} (gap ${r2(cornerAlong - riderAlong)} m), v ${r2(r.speed)}, min sep (real body) ${r2(r.minSep)} m`);
      expect(cornerAlong - riderAlong, "the rider was not held short of the car whose corner is 0.30 m off his line").toBeGreaterThan(5.5);
      expect(r.speed, "the rider is still moving beside a standing car").toBeLessThan(0.1);
      expect(r.minSep, "the rider's body touched the standing car").toBeGreaterThan(0);
    }, 60_000);
  }
});

describe("M3 — no other rider reads it: the centre corridor, today's behaviour", () => {
  const cases: Array<[string, string, CyclistRightHookSpec]> = [
    ["sc-vu-cyclist-hook", "vu-cyclist-v1", VU_HOOK],
    ["exam V1 (V1_SITE)", "district-v1", examV1Rider()],
  ];
  for (const [name, district, spec] of cases) {
    it(`${name}: a student who drove in and stands in his lane 10 m ahead (2.6 m lateral) holds the rider ≈ 6 m short, < 0.1 m/s`, () => {
      expect(spec.actor.playerGuardFootprint).toBeUndefined();
      const r = encounter(district, spec, inLaneAhead(10, spec.actor.extraRightOffsetM ?? 0), 5);
      console.log(`M3 ${name}: rest along ${r2(r.along)} m, v ${r2(r.speed)}`);
      expect(r.along, `${name}: the rider passed the standing car — the footprint guard reached a rider it is not authored on`).toBeGreaterThan(5.5);
      expect(r.along).toBeLessThan(6.5);
      expect(r.speed).toBeLessThan(0.1);
    }, 60_000);
  }
});
