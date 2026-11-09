/**
 * catalogue-demo-curvature:dae908c7, family «curvpark2» — THE SIX REMAINING
 * PARKING LESSONS' DEMOS ARE DRIVES THE PRODUCT CAR CAN PERFORM, the correct
 * ones complete the lesson they demonstrate at every rung and every cadence,
 * the shown setup is the one the marker shows, and each mistake demo commits
 * its own mistake and no other.
 *
 * THE ROW. sc-park-perp-rev, sc-park-narrow, sc-park-parallel, sc-park-45,
 * sc-pk-driveway and sc-park-perp-forward were authored as un-filleted
 * polylines on 3–4 m arcs: 6 correct and 11 mistake demos turned on
 * 1.295–3.249 m over their tightest metre against a car whose own body-centre
 * circle is 3.955 m (kinematic) and ≈ 4.17 m on the physics car — and three of
 * the correct demos (perp-rev, narrow, perp-forward) stood in a parked car as
 * the live scene's per-model colliders see it. A student copying the ghost was
 * shown a path no wheel setting produces. This is curvdepth's pin
 * (./sc-park-depth-drivable.test.ts) for the family re-authored from the
 * parking kit (../parkKit.ts).
 *
 * THE L2 RIBBON is the same committed polyline as the L1 ghost
 * (lessons/scenario/compile.ts DEFAULT_LEVEL_AIDS; LessonScene mounts ShadowCar
 * for shadowCar || pathRibbon), so every pin on the trace below covers it.
 *
 * TWO RADIUS NUMBERS, NEVER CONFUSED (brief F3): every swing is AUTHORED at
 * DRIVABLE_MIN_CENTRE_RADIUS_M (4.6 m, pinned as a constant in block 1); the
 * MEASURED 1 m window of a 4.6 m programme reads ≈ 4.596–4.600, and the pin on
 * it is ≥ 1.05 × the physics car's own reverse circle (measured here on
 * VehicleSim), never «≥ 4.6».
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { obbSeparationM } from "../../collision";
import { compileScenario } from "../../lessons/scenario/compile";
import { scenarioById } from "../../lessons/scenario/templates";
import type { ScenarioLevel, ScenarioSpec } from "../../lessons/scenario/types";
import { liveChainReplay, type LiveReplayOutcome } from "../../lessons/scenario/__tests__/liveChainReplay";
import * as T from "../../vehicle/tuning";
import { READY_DRIVELINE } from "../../vehicle/driveline";
import { createHeadlessChassis, IDLE_INPUT, VehicleSim } from "../../vehicle/VehicleSim";
import { REAR_CUE_MOVING_KMH } from "../../hud/rearProximity";
import { INDICATOR_LEAD_SEC } from "../../orchestrator/runners";
import { authoredDrive, DRIVABLE_MIN_CENTRE_RADIUS_M, sShift, straight, swingForShift, turn } from "../drivablePath";
import { parseScenarioTrace } from "../parse";
import { bayReverse, kitSLength, LOT_AISLE_Y, PARK_DEPTH_LIVE_HALF, S2_KMH, SET_UP_SIGNAL_LEAD_SEC, SETUP_KMH, SIGNAL_BLINK_SEC, X_LANE } from "../parkKit";
import type { ObstacleRect2D, RecordedDrive } from "../recorder";
import { recordScPark45Drive, SC_PARK_45_GEOMETRY } from "../scPark45";
import { recordScParkNarrowDrive, SC_PARK_NARROW_GEOMETRY } from "../scParkNarrow";
import { recordScParkParallelDrive, SC_PARK_PARALLEL_GEOMETRY } from "../scParkParallel";
import { recordScParkPerpForwardDrive, SC_PARK_PERP_FORWARD_GEOMETRY, SIGNAL_GAP_SEC, TURN_SIGNAL_LEAD_SEC } from "../scParkPerpForward";
import { lotObstacleRects, recordScParkPerpRevDrive, SC_PARK_PERP_REV_GEOMETRY } from "../scParkPerpRev";
import { drivewayObstacles, recordScPkDrivewayDrive, SC_PK_DRIVEWAY_GEOMETRY } from "../scPkDriveway";
import type { ScenarioTrace, TraceSample } from "../types";
import { KINEMATIC_CENTRE_RADIUS_M, windowedMinRadius } from "./demoCurvature";
import {
  bicycleOnPath,
  driveFromSquare,
  GLB_HALF,
  heroBox,
  KIN_REAR_RADIUS_M,
  lessonBoxSets,
  minClearance,
  REAR_AXLE_M,
  wrap180,
  type ProductBox,
  type ProductBoxSets,
} from "./parkDepthProduct";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];
const RADIUS_MARGIN = 1.05;
const CLEARANCE_FLOOR_M = 0.25;
const TRACK_OFFSET_CEILING_M = 0.3;

type Lesson = "sc-park-perp-rev" | "sc-park-narrow" | "sc-park-parallel" | "sc-park-45" | "sc-pk-driveway" | "sc-park-perp-forward";
interface Def {
  district: string;
  names: [string, string, string];
  reverse: boolean;
  rects: (raw: unknown) => ObstacleRect2D[];
  record: (raw: unknown, name: string) => RecordedDrive;
  radiusM: number;
}
const DEFS: Record<Lesson, Def> = {
  "sc-park-perp-rev": {
    district: "lot-perp-v1",
    names: ["shadow-correct", "mistake-wide-approach", "mistake-no-observation"],
    reverse: true,
    rects: lotObstacleRects,
    record: (r, n) => recordScParkPerpRevDrive(r, n as never),
    radiusM: SC_PARK_PERP_REV_GEOMETRY.radiusM,
  },
  "sc-park-narrow": {
    district: "lot-narrow-v1",
    names: ["shadow-correct", "mistake-wide-swing", "mistake-no-observation"],
    reverse: true,
    rects: lotObstacleRects,
    record: (r, n) => recordScParkNarrowDrive(r, n as never),
    radiusM: SC_PARK_NARROW_GEOMETRY.radiusM,
  },
  "sc-park-parallel": {
    district: "lot-par-v1",
    names: ["shadow-correct", "mistake-far-from-lead", "mistake-no-observation"],
    reverse: true,
    rects: lotObstacleRects,
    record: (r, n) => recordScParkParallelDrive(r, n as never),
    radiusM: SC_PARK_PARALLEL_GEOMETRY.radiusM,
  },
  "sc-park-45": {
    district: "lot-45-v1",
    names: ["shadow-correct", "mistake-overshoot", "mistake-corner-cut"],
    reverse: false,
    rects: lotObstacleRects,
    record: (r, n) => recordScPark45Drive(r, n as never),
    radiusM: SC_PARK_45_GEOMETRY.radiusM,
  },
  "sc-pk-driveway": {
    district: "pk-drive-v1",
    names: ["shadow-correct", "mistake-wide", "mistake-deep"],
    reverse: true,
    rects: () => drivewayObstacles(),
    record: (r, n) => recordScPkDrivewayDrive(r, n as never),
    radiusM: SC_PK_DRIVEWAY_GEOMETRY.radiusM,
  },
  "sc-park-perp-forward": {
    district: "lot-perp-v1",
    names: ["shadow-correct", "mistake-early-turn", "mistake-blind-exit"],
    reverse: false,
    rects: lotObstacleRects,
    record: (r, n) => recordScParkPerpForwardDrive(r, n as never),
    radiusM: SC_PARK_PERP_FORWARD_GEOMETRY.radiusM,
  },
};
const LESSONS = Object.keys(DEFS) as Lesson[];
/** The 17 re-authored demos: sc-park-parallel/mistake-no-observation was never
 *  an offender and is byte-for-byte what it was (its polyline approach is not
 *  pinned here; the census measures it). */
const REAUTHORED = (l: Lesson) =>
  DEFS[l].names.filter((n) => !(l === "sc-park-parallel" && n === "mistake-no-observation"));

const districts = new Map<Lesson, unknown>(
  LESSONS.map((l) => [l, JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${DEFS[l].district}.json`), "utf-8"))]),
);
const boxSets = new Map<Lesson, ProductBoxSets>(LESSONS.map((l) => [l, lessonBoxSets(districts.get(l), l, DEFS[l].rects(districts.get(l)))]));
const boxes = (l: Lesson): ProductBox[] => boxSets.get(l)!.envelope;

function committed(l: Lesson, name: string): ScenarioTrace {
  const t = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", l, `${name}.trace.json`), "utf-8")));
  if (t === null) throw new Error(`${l}/${name}: unparseable committed trace`);
  return t;
}
const spec = (l: Lesson): ScenarioSpec => {
  const s = scenarioById(l);
  if (!s) throw new Error(`no template ${l}`);
  return s;
};
const zoneOf = (l: Lesson) => {
  const z = spec(l).success[0].params;
  if (z.kind !== "reachZone") throw new Error(`${l}: Задача 1 is not a reachZone`);
  return z;
};
const parkOf = (l: Lesson) => {
  const p = spec(l).success[spec(l).success.length - 1].params;
  if (p.kind !== "completeManeuver" || p.maneuver !== "parkInBay") throw new Error(`${l}: terminal is not parkInBay`);
  return p;
};
const tightestScale = (l: Lesson) => Math.min(...spec(l).levels.map((x) => x.toleranceScale ?? 1));

// ---------------------------------------------------------------------------
// 1. The limit, and the radius the family is authored at
// ---------------------------------------------------------------------------

let physCentreRadiusM = Number.NaN;
/** sc-park-depth-drivable.test.ts's measurement, by value: the headless
 *  VehicleSim at full lock in reverse at walking pace; body-centre radius =
 *  path bbox / 4. */
function measurePhysicsReverseRadius(): number {
  const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
  world.timestep = T.FIXED_DT;
  world.createCollider(RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1));
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
const limitCentreRadius = () => Math.max(KINEMATIC_CENTRE_RADIUS_M, physCentreRadiusM);
const limitRearRadius = () => Math.sqrt(limitCentreRadius() ** 2 - REAR_AXLE_M ** 2);

describe("curvpark2 — the car's limit, and the circle the six lessons are authored on", () => {
  it("the physics car's reverse circle is wider than the kinematic one and is the binding limit", () => {
    expect(KINEMATIC_CENTRE_RADIUS_M).toBeCloseTo(3.955, 3);
    expect(physCentreRadiusM).toBeGreaterThan(KINEMATIC_CENTRE_RADIUS_M);
    expect(physCentreRadiusM).toBeLessThan(DRIVABLE_MIN_CENTRE_RADIUS_M);
    expect(limitCentreRadius()).toBe(physCentreRadiusM);
  });

  it("AUTHORING: every swing programme of the family is DRIVABLE_MIN_CENTRE_RADIUS_M — no exception", () => {
    for (const l of LESSONS) {
      expect(DEFS[l].radiusM, l).toBe(DRIVABLE_MIN_CENTRE_RADIUS_M);
      expect(DEFS[l].radiusM, l).toBeGreaterThanOrEqual(RADIUS_MARGIN * limitCentreRadius());
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Every re-authored committed demo is a path the car can drive
// ---------------------------------------------------------------------------

/** curvring C2's measure, by value: κ from the recorded heading over 0.2 m,
 *  its change over the next 0.2 m, against the road wheel's own rate. */
function steepestWinding(S: readonly TraceSample[]): { radPerSec: number; atM: number } {
  const s: number[] = [0];
  const turn: number[] = [0];
  for (let i = 1; i < S.length; i++) {
    s.push(s[i - 1] + Math.hypot(S[i].x - S[i - 1].x, S[i].y - S[i - 1].y));
    turn.push(turn[i - 1] + wrap180(S[i].headingDeg - S[i - 1].headingDeg));
  }
  const locate = (q: number): [number, number, number] => {
    let lo = 0;
    let hi = s.length - 1;
    if (q <= 0) return [0, 0, 0];
    if (q >= s[hi]) return [hi, hi, 0];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (s[m] <= q) lo = m;
      else hi = m;
    }
    return [lo, hi, (q - s[lo]) / (s[hi] - s[lo] || 1)];
  };
  const turnAt = (q: number) => {
    const [a, b, f] = locate(q);
    return turn[a] + f * (turn[b] - turn[a]);
  };
  const speedAt = (q: number) => {
    const [a, b, f] = locate(q);
    return Math.abs(S[a].speedKmh + f * (S[b].speedKmh - S[a].speedKmh)) / 3.6;
  };
  const W = 0.2;
  const kAt = (c: number) => (((turnAt(c + W / 2) - turnAt(c - W / 2)) * Math.PI) / 180) / W;
  let best = { radPerSec: 0, atM: 0 };
  const L = s[s.length - 1];
  for (let c = W; c < L - 1.5 * W; c += 0.02) {
    const dkds = Math.abs(kAt(c + W) - kAt(c)) / W;
    const v = Math.max(speedAt(c), speedAt(c + W));
    const rate = dkds * v * T.WHEELBASE_M;
    if (rate > best.radPerSec) best = { radPerSec: rate, atM: c };
  }
  return best;
}

describe("curvpark2 — the 17 re-authored demos: the measured radius, continuity, rest at gear changes, the wheel's rate", () => {
  for (const l of LESSONS) {
    for (const name of REAUTHORED(l)) {
      it(`${l}/${name}`, () => {
        const samples = committed(l, name).samples;
        // MEASURED — the census's own windowed measure, with the pin's margin.
        const worst = windowedMinRadius(samples);
        expect(
          worst.radiusM,
          `tightest ${worst.radiusM.toFixed(3)} m at t=${worst.atSec.toFixed(2)} s vs 1.05 × ${limitCentreRadius().toFixed(3)} m`,
        ).toBeGreaterThanOrEqual(RADIUS_MARGIN * limitCentreRadius());
        let changes = 0;
        for (let i = 1; i < samples.length; i++) {
          const jump = Math.abs(wrap180(samples[i].headingDeg - samples[i - 1].headingDeg));
          expect(jump, `heading jump at t=${samples[i].tSec.toFixed(2)}`).toBeLessThanOrEqual(3);
          if (samples[i].gear !== samples[i - 1].gear) {
            changes++;
            expect(Math.abs(samples[i - 1].speedKmh), `gear change at t=${samples[i].tSec}`).toBeLessThan(0.05);
            const restFrom = samples.findLastIndex((q, k) => k < i && Math.abs(q.speedKmh) >= 0.05);
            expect(samples[i - 1].tSec - samples[restFrom + 1].tSec, `rest at t=${samples[i].tSec}`).toBeGreaterThanOrEqual(0.9);
          }
        }
        expect(changes > 0).toBe(samples.some((q) => q.gear < 0));
        // THE GHOST'S WHEEL DOES NOT FLICKER (a sample between two turned ones is turned)…
        for (let i = 1; i < samples.length - 1; i++) {
          const a = samples[i - 1].steerRad;
          const b = samples[i].steerRad;
          const c = samples[i + 1].steerRad;
          const moving = [samples[i - 1], samples[i], samples[i + 1]].every((q) => Math.abs(q.speedKmh) > 1.8 && q.gear === samples[i].gear);
          if (moving && Math.abs(a) > 0.15 && Math.abs(c) > 0.15 && Math.sign(a) === Math.sign(c)) {
            expect(Math.abs(b), `wheel snaps straight at t=${samples[i].tSec.toFixed(2)}`).toBeGreaterThanOrEqual(0.5 * Math.min(Math.abs(a), Math.abs(c)));
          }
        }
        // …and is WOUND on and off: dκ/ds ≤ STEER_SPEED / (WHEELBASE_M · v) (curvring C2).
        const w = steepestWinding(samples);
        expect(w.radPerSec, `the wheel would turn at ${w.radPerSec.toFixed(2)} rad/s, ${w.atM.toFixed(1)} m along`).toBeLessThanOrEqual(T.STEER_SPEED);
        // …and at a parking creep, where C2's 0.2 m windows are wider than a
        // whole ramp (a 5 cm ramp at 3.5 km/h reads 2.7 rad/s there — lane
        // curvpark2's mutant M2 survived it), on the ghost's own wheel: between
        // two moving samples of one gear the recorded wheel turns no faster than
        // the product's STEER_SPEED.
        let fastest = { rate: 0, t: 0 };
        for (let i = 1; i < samples.length; i++) {
          const a = samples[i - 1];
          const b = samples[i];
          // Above 1.8 km/h, as the flicker pin above: the recorder reads the wheel
          // from the heading change and shows it straight while the car stands or
          // creeps off a stop with the wheel held (a display artefact of the
          // recorder's estimate, not a turn of the path — reported, not repaired).
          // Nor across the frame a drive is braked to rest in: its partial last
          // step reads a fraction of the turn it is held in (the same artefact).
          const c = samples[i + 1];
          if (a.gear !== b.gear || Math.abs(a.speedKmh) < 1.8 || Math.abs(b.speedKmh) < 1.8) continue;
          if (!c || c.gear !== b.gear || Math.abs(c.speedKmh) < 1.8) continue;
          const rate = Math.abs(b.steerRad - a.steerRad) / (b.tSec - a.tSec);
          if (rate > fastest.rate) fastest = { rate, t: b.tSec };
        }
        expect(fastest.rate, `the ghost's wheel turns at ${fastest.rate.toFixed(2)} rad/s at t=${fastest.t.toFixed(2)}`).toBeLessThanOrEqual(T.STEER_SPEED);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Each correct demo: steerable, clear of every body, at rest in its bay
// ---------------------------------------------------------------------------

describe("curvpark2 — each correct demo is a drive the product car can perform", () => {
  for (const l of LESSONS) {
    const samples = committed(l, "shadow-correct").samples;
    const bike = bicycleOnPath(samples);
    const driven = driveFromSquare(samples);
    const bx = boxes(l);

    it(`${l}: steerable — never a rear-axle radius under 1.05 × the car's own; the chord-heading crab under 25°`, () => {
      let worst = { r: Infinity, t: 0 };
      for (const p of bike) if (p.rearRadiusM < worst.r) worst = { r: p.rearRadiusM, t: p.tSec };
      expect(worst.r, `rear radius ${worst.r.toFixed(3)} at t=${worst.t.toFixed(2)}`).toBeGreaterThanOrEqual(RADIUS_MARGIN * limitRearRadius());
      // THE GHOST CRAB (brief F10, a curvdepth precedent, reported in the lane's census):
      // the recorder heads the ghost along the centre path's chord, a real body along
      // its rear axle; it is bounded here exactly as curvdepth bounds it.
      let slip = 0;
      for (let i = 0; i < samples.length; i++) slip = Math.max(slip, Math.abs(wrap180(samples[i].headingDeg - bike[i].headingDeg)));
      expect(slip).toBeLessThan(25);
    });

    it(`${l}: CLEARANCE ≥ 0.25 m — the recorded pose, the real car's pose, and a car that starts square and steers`, () => {
      const say = (c: ReturnType<typeof minClearance>) => `${c.m.toFixed(3)} m at t=${c.atSec.toFixed(2)} (${c.model} #${c.index})`;
      for (const [label, poses] of [
        ["recorded", samples],
        ["bicycle", bike],
        ["driven from square", driven],
      ] as const) {
        const c = minClearance(poses, bx);
        expect(c.m, `${label}: ${say(c)}`).toBeGreaterThanOrEqual(CLEARANCE_FLOOR_M);
      }
    });

    it(`${l}: a car that starts square stays within ${TRACK_OFFSET_CEILING_M} m of the ghost on its own lock, and rests in the bay at the tightest rung's tolerance`, () => {
      let off = 0;
      for (const p of driven) {
        off = Math.max(off, p.offM);
        expect(Math.abs(p.kappa)).toBeLessThanOrEqual(1 / KIN_REAR_RADIUS_M + 1e-12);
      }
      expect(off).toBeLessThanOrEqual(TRACK_OFFSET_CEILING_M);
      const park = parkOf(l);
      const k = tightestScale(l);
      for (const last of [driven[driven.length - 1], samples[samples.length - 1]]) {
        expect(Math.hypot(last.x - park.bay.x, last.y - park.bay.y)).toBeLessThan(park.centerTolM * k);
        const diff = Math.abs(wrap180(last.headingDeg - park.bay.headingDeg));
        expect(Math.min(diff, 180 - diff)).toBeLessThan(park.headingTolDeg * k);
      }
      const last = samples[samples.length - 1];
      expect(Math.abs(last.speedKmh)).toBe(0);
      expect(last.brakeOn).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. The marker and the reference points the captions name
// ---------------------------------------------------------------------------

/** The last forward stop before the first reverse sample. */
const setupStop = (S: readonly TraceSample[]) => S[S.findIndex((p) => p.gear < 0) - 1];
/** The noses of the perpendicular row (the gate's rect: bay x − half-length). */
const nosesX = (l: Lesson) => Math.min(...boxSets.get(l)!.gate.map((b) => b.x - b.halfLengthM));

describe("curvpark2 — THE MARKER: the setup the demo shows is the one the «Спри тук» / «Карай дотук» ring shows", () => {
  for (const l of LESSONS) {
    it(`${l}`, () => {
      const z = zoneOf(l);
      const S = committed(l, "shadow-correct").samples;
      if (DEFS[l].reverse) {
        // A halt gate: the demonstrated setup stop is within radius − 2 of the
        // ring's centre (curvdepth's margin), at rest, square to the aisle.
        const st = setupStop(S);
        expect(st.speedKmh).toBe(0);
        expect(Math.abs(wrap180(st.headingDeg))).toBeLessThan(0.01);
        expect(Math.hypot(st.x - z.x, st.y - z.y)).toBeLessThan(z.radiusM - 2);
        // reached slowly: under the halt cap over the whole disc
        for (const q of S) if (Math.hypot(q.x - z.x, q.y - z.y) <= z.radiusM && q.gear > 0) expect(Math.abs(q.speedKmh)).toBeLessThanOrEqual(z.maxSpeedKmh!);
      } else {
        // A pass-through gate: through the disc, under its cap, never stopping in it.
        const inDisc = S.filter((q) => Math.hypot(q.x - z.x, q.y - z.y) <= z.radiusM);
        expect(inDisc.length).toBeGreaterThan(10);
        const closest = Math.min(...S.map((q) => Math.hypot(q.x - z.x, q.y - z.y)));
        expect(closest).toBeLessThan(z.radiusM - 2);
        for (const q of inDisc) {
          expect(q.speedKmh).toBeLessThanOrEqual(z.maxSpeedKmh!);
          expect(q.speedKmh).toBeGreaterThan(1);
        }
      }
    });
  }
});

describe("curvpark2 — the reference points the demos and briefings name are the ones the demos drive", () => {
  it("perp-rev: «на около два и половина метра» off the noses; the too-close mistake «на около метър» and still well off the bay's axis when it touches", () => {
    const st = setupStop(committed("sc-park-perp-rev", "shadow-correct").samples);
    const gap = nosesX("sc-park-perp-rev") - (st.x + T.CHASSIS_HALF_EXTENTS.x);
    expect(gap).toBeGreaterThanOrEqual(2.25);
    expect(gap).toBeLessThan(2.75);
    expect(st.y - T.CHASSIS_HALF_EXTENTS.z, "the rear bumper has passed the north neighbour").toBeGreaterThan(2.7 + 1.05);
    const m = committed("sc-park-perp-rev", "mistake-wide-approach").samples;
    const ms = setupStop(m);
    const mg = nosesX("sc-park-perp-rev") - (ms.x + T.CHASSIS_HALF_EXTENTS.x);
    expect(mg).toBeGreaterThan(0.75);
    expect(mg).toBeLessThan(1.25);
    const hit = m[m.length - 1];
    expect(Math.abs(wrap180(hit.headingDeg - 270)), "«не успя да се изправи»").toBeGreaterThan(30);
  });

  it("narrow: «на около три и половина метра»; the tail goes in between the cars straighter than in the wide bay; the habit «на около метър» is «още силно накосо»", () => {
    const S = committed("sc-park-narrow", "shadow-correct").samples;
    const st = setupStop(S);
    const gap = nosesX("sc-park-narrow") - (st.x + T.CHASSIS_HALF_EXTENTS.x);
    expect(gap).toBeGreaterThanOrEqual(3.25);
    expect(gap).toBeLessThan(3.75);
    // The heading off the bay's axis at the sample the tail centre reaches the noses.
    const offAxisAtNoses = (l: Lesson, s: readonly TraceSample[]) => {
      const nx = nosesX(l);
      for (const q of s) {
        if (q.gear >= 0) continue;
        const h = (q.headingDeg * Math.PI) / 180;
        if (q.x - T.CHASSIS_HALF_EXTENTS.z * Math.sin(h) >= nx) return Math.abs(wrap180(q.headingDeg - 270));
      }
      throw new Error(`${l}: the tail never reaches the noses`);
    };
    const narrow = offAxisAtNoses("sc-park-narrow", S);
    const wide = offAxisAtNoses("sc-park-perp-rev", committed("sc-park-perp-rev", "shadow-correct").samples);
    expect(narrow, `narrow ${narrow.toFixed(1)}° vs wide ${wide.toFixed(1)}°`).toBeLessThan(wide - 5);
    const m = committed("sc-park-narrow", "mistake-wide-swing").samples;
    const mg = nosesX("sc-park-narrow") - (setupStop(m).x + T.CHASSIS_HALF_EXTENTS.x);
    expect(mg).toBeGreaterThan(0.75);
    expect(mg).toBeLessThan(1.25);
    expect(Math.abs(wrap180(m[m.length - 1].headingDeg - 270))).toBeGreaterThan(narrow + 15);
  });

  it("parallel: ориентир 1 (half to one metre, bumpers level), the roll back, ориентир 2 «около 40°», ориентир 3 true at the counter-steer", () => {
    const g = SC_PARK_PARALLEL_GEOMETRY;
    const live = boxSets.get("sc-park-parallel")!.live;
    const gate = boxSets.get("sc-park-parallel")!.gate;
    for (const set of [live, gate]) {
      const lead = set.find((b) => b.y === 6.5)!;
      const gap = lead.x - lead.halfWidthM - (g.setup.x + T.CHASSIS_HALF_EXTENTS.x);
      expect(gap).toBeGreaterThanOrEqual(0.5);
      expect(gap).toBeLessThanOrEqual(1.0);
      expect(Math.abs(g.setup.y - T.CHASSIS_HALF_EXTENTS.z - (lead.y - lead.halfLengthM))).toBeLessThan(0.06);
    }
    expect(g.rollBackM).toBeGreaterThanOrEqual(0.5);
    // R6: the taught number is the committed swing rounded to the nearest 5° —
    // read off the shown text itself (instruction 4 and the ориентир 2 caption).
    const taught = [
      ...spec("sc-park-parallel").instructionsBg.map((i) => i.textBg),
      ...committed("sc-park-parallel", "shadow-correct").events.filter((e) => e.kind === "annotation").map((e) => e.textBg ?? ""),
    ].filter((x) => /ориентир 2/iu.test(x));
    expect(taught.length).toBe(2);
    for (const x of taught) {
      const m = /под (?:около )?~?(\d+)°/u.exec(x);
      expect(m, x).not.toBeNull();
      expect(Math.abs(g.swingDeg - Number(m![1])), x).toBeLessThan(2.5);
    }
    expect(Math.abs(g.swingDeg - 40)).toBeLessThan(2.5);
    const S = committed("sc-park-parallel", "shadow-correct").samples;
    let most = 0;
    let at: TraceSample | null = null;
    for (const q of S) if (q.gear < 0 && -wrap180(q.headingDeg) > most) [most, at] = [-wrap180(q.headingDeg), q];
    expect(Math.abs(most - g.swingDeg)).toBeLessThan(0.3);
    // ориентир 3: where the wheel goes the other way, the front bumper's corners
    // are past the lead car's rear bumper on both boxes.
    const h = (at!.headingDeg * Math.PI) / 180;
    const cornersY = [1, -1].map((r) => at!.y + T.CHASSIS_HALF_EXTENTS.z * Math.cos(h) - r * T.CHASSIS_HALF_EXTENTS.x * Math.sin(h));
    for (const set of [live, gate]) {
      const lead = set.find((b) => b.y === 6.5)!;
      for (const cy of cornersY) expect(cy).toBeLessThan(lead.y - lead.halfLengthM);
    }
    // «Правилно: на половин до един метър» — the far mistake starts over two metres off.
    const far = setupStop(committed("sc-park-parallel", "mistake-far-from-lead").samples);
    const lead = live.find((b) => b.y === 6.5)!;
    expect(lead.x - lead.halfWidthM - (far.x + T.CHASSIS_HALF_EXTENTS.x)).toBeGreaterThan(2.0);
  });

  it("45: the turn begins with the front bumper level with the aisle corner of the car before the bay; the line keeps «около метър» to the row", () => {
    const g = SC_PARK_45_GEOMETRY;
    const bumperY = g.turnIn.y + T.CHASSIS_HALF_EXTENTS.z;
    for (const set of ["live", "gate"] as const) {
      const n = boxSets.get("sc-park-45")![set].find((b) => b.y === -3.82)!;
      const h = (n.headingDeg * Math.PI) / 180;
      // the aisle-side end's western corner of the parked car
      const cx = n.x - n.halfLengthM * Math.sin(h) - n.halfWidthM * Math.cos(h);
      const cy = n.y - n.halfLengthM * Math.cos(h) + n.halfWidthM * Math.sin(h);
      expect(Math.abs(bumperY - cy), `${set}: corner (${cx.toFixed(2)}, ${cy.toFixed(2)})`).toBeLessThan(0.3);
    }
    // «дръж метър до реда»: the run-up line's right side to the row's westmost corners.
    const westmost = Math.min(
      ...boxSets.get("sc-park-45")!.envelope.map((b) => {
        const h = (b.headingDeg * Math.PI) / 180;
        return b.x - b.halfLengthM * Math.sin(h) - b.halfWidthM * Math.cos(h);
      }),
    );
    const gap = westmost - (g.turnIn.x + T.CHASSIS_HALF_EXTENTS.x);
    expect(gap).toBeGreaterThan(0.75);
    expect(gap).toBeLessThan(1.25);
    expect(g.straightInM).toBeGreaterThanOrEqual(3);
  });

  it("perp-forward: the setup line is in the aisle's left half; the turn begins with the bumper level with the car before the free bay", () => {
    const g = SC_PARK_PERP_FORWARD_GEOMETRY;
    expect(g.turnIn.x).toBeLessThan(0);
    const bumperY = g.turnIn.y + T.CHASSIS_HALF_EXTENTS.z;
    for (const set of ["live", "gate"] as const) {
      const n = boxSets.get("sc-park-perp-forward")![set].find((b) => b.y === -2.7)!;
      expect(Math.abs(bumperY - (n.y - n.halfWidthM)), set).toBeLessThan(0.3);
    }
  });

  it("driveway: the rear bumper has passed the driveway's mouth at the setup; the late swing starts 1.5 m further on", () => {
    const S = committed("sc-pk-driveway", "shadow-correct").samples;
    const st = setupStop(S);
    const fence = drivewayObstacles()[0];
    expect(st.y - T.CHASSIS_HALF_EXTENTS.z).toBeGreaterThan(fence.y + fence.halfWidthM);
    const late = setupStop(committed("sc-pk-driveway", "mistake-wide").samples);
    expect(late.y - st.y).toBeCloseTo(SC_PK_DRIVEWAY_GEOMETRY.lateM, 1);
  });
});

// ---------------------------------------------------------------------------
// 4a′. THE TEXT TIED TO THE TRACE (round 2, integrator ruling CP2-5; R6). Every
// taught number in a shown sentence of the six lessons is READ FROM THE
// SENTENCE — the template's strings and the committed demos' captions, the
// strings the reviewed-text manifest records — through the number-word table
// below, and compared with the value measured on the committed traces and the
// product's boxes. A distance «около X» holds within a quarter metre (its own
// half-metre grain; curvdepth's :392-410 bands); a range («половин до един
// метър») or a bound («повече от два метра») holds as stated; an angle within
// 2.5° (curvdepth :415-418); a stated cap or ceiling against the template's
// param or the demo's own speed. And the census is EXACT: a number phrase no
// claim reads is a red, so a number cannot be shown without being measured.
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = { половин: 0.5, един: 1, една: 1, едно: 1, метър: 1, два: 2, две: 2, три: 3, четири: 4, пет: 5 };
interface Stated {
  lo: number;
  hi: number;
  /** «около X» / a bare X: holds within the claim's tolerance of X */
  about: boolean;
}
/** «около два и половина метра» → 2.5 (about); «половин до един метър» → [0.5, 1]; «повече от два метра» → (2, ∞). */
function stated(phrase: string): Stated {
  const p = phrase.trim().replace(/^около\s+/u, "");
  const one = (w: string): number => {
    const m = /^(\d+(?:,\d+)?|[а-я]+)(\s+и\s+половина)?/u.exec(w.trim());
    if (!m) throw new Error(`unreadable number «${w}»`);
    const base = /\d/u.test(m[1]) ? Number(m[1].replace(",", ".")) : NUMBER_WORDS[m[1]];
    if (base === undefined) throw new Error(`no number word «${m[1]}»`);
    return base + (m[2] ? 0.5 : 0);
  };
  if (/^повече от\s+/u.test(p)) return { lo: one(p.replace(/^повече от\s+/u, "")), hi: Infinity, about: false };
  const range = /^(\S+)\s+до\s+(\S+)/u.exec(p);
  if (range) return { lo: one(range[1]), hi: one(range[2]), about: false };
  if (/^метър и половина/u.test(p)) return { lo: 1.5, hi: 1.5, about: true };
  if (p === "метър") return { lo: 1, hi: 1, about: true };
  const v = one(p.replace(/\s*(метра|метър|°)$/u, ""));
  return { lo: v, hi: v, about: true };
}
const holds = (st: Stated, measured: number, tol: number): boolean =>
  st.about ? Math.abs(measured - st.lo) < tol : st.hi === Infinity ? measured > st.lo : measured >= st.lo && measured <= st.hi;

/** Every shown string of a lesson: the template's, and its committed demos' captions. */
function shownStrings(l: Lesson): Array<[string, string]> {
  const s = spec(l);
  const out: Array<[string, string]> = [
    ["objective", s.objectiveBg],
    ...s.instructionsBg.map((i) => [`instruction ${i.n}`, i.textBg] as [string, string]),
    ...s.success.map((o) => [`task ${o.id}`, o.titleBg] as [string, string]),
    ...s.mistakes.flatMap(
      (m, i) =>
        [
          [`mistake ${i} title`, m.titleBg],
          [`mistake ${i} whatWentWrong`, m.whatWentWrongBg],
        ] as Array<[string, string]>,
    ),
    ["teach when", s.teach.whenBg],
    ["teach why", s.teach.whyBg],
    ["teach examiner", s.teach.examinerBg],
  ];
  for (const n of DEFS[l].names) {
    for (const e of committed(l, n).events) if (e.kind === "annotation") out.push([`${n} caption @${e.tSec.toFixed(1)}`, e.textBg ?? ""]);
  }
  return out;
}
/** A number phrase: «около два и половина метра», «на метър», «три и половина,», «40°», «10 км/ч», «2,5-метрово», «цяла кола». */
const NUMBER_PHRASE =
  /(?:около\s+)?(?:повече от\s+)?(?:половин\s+до\s+един|метър\s+и\s+половина|(?:\d+(?:,\d+)?|един|една|едно|два|две|три|четири|пет)(?:\s+и\s+половина)?)(?:\s*(?:метра|метър|°|км\/ч|-метров\p{L}*))?|(?<!\p{L})метър(?!\p{L})|цяла кола/gu;
/** Number words that count things, not quantities («две задачи», «три неща»). */
const NOT_A_QUANTITY = /^(?:две|два|един|една|едно|три|четири|пет)$/u;
/** Ordinals and citations: «Задача 1», «ориентир 2», «Чл. 40». */
const A_LABEL = /(?:[Зз]адача|[Оо]риентир|[Чч]л\.|Наредба)\s*$/u;

interface Claim {
  /** the shown string's label must match */
  where: RegExp;
  /** the sentence context; group 1 is the number phrase */
  re: RegExp;
  measured: () => number;
  /** «около»: the band; Infinity: a stated ceiling the demo keeps under */
  tol?: number;
  what: string;
}

describe("curvpark2 — every taught number is read from the sentence and is what the committed demo measures (CP2-5, R6)", () => {
  const gapOff = (l: Lesson, name: string) => nosesX(l) - (setupStop(committed(l, name).samples).x + T.CHASSIS_HALF_EXTENTS.x);
  const parGap = (name: string) => {
    const lead = boxSets.get("sc-park-parallel")!.live.find((b) => b.y === 6.5)!;
    return lead.x - lead.halfWidthM - (setupStop(committed("sc-park-parallel", name).samples).x + T.CHASSIS_HALF_EXTENTS.x);
  };
  const rowGap45 = () => {
    const westmost = Math.min(
      ...boxSets.get("sc-park-45")!.envelope.map((b) => {
        const h = (b.headingDeg * Math.PI) / 180;
        return b.x - b.halfLengthM * Math.sin(h) - b.halfWidthM * Math.cos(h);
      }),
    );
    return westmost - (SC_PARK_45_GEOMETRY.turnIn.x + T.CHASSIS_HALF_EXTENTS.x);
  };
  const finalHeading = (l: Lesson) => committed(l, "shadow-correct").samples.at(-1)!.headingDeg;
  /** The fastest the shadow drives north of `fromY` (the lot's aisle, or the whole street). */
  const maxKmhFrom = (l: Lesson, fromY: number) =>
    Math.max(...committed(l, "shadow-correct").samples.filter((q) => q.y >= fromY).map((q) => Math.abs(q.speedKmh)));
  const turnStartY = (l: Lesson, name: string) => {
    const S = committed(l, name).samples;
    const r = S.findIndex((q) => q.indicator === "right");
    return S.find((q, i) => i > r && Math.abs(wrap180(q.headingDeg)) > 0.05)!.y;
  };
  const cap = (l: Lesson) => zoneOf(l).maxSpeedKmh ?? Number.NaN;
  const AISLE_Y = -30;
  const aisle = (l: Lesson): Claim => ({
    where: /instruction 1/,
    re: /не повече от (\d+ км\/ч)/u,
    measured: () => maxKmhFrom(l, l === "sc-pk-driveway" ? -Infinity : AISLE_Y),
    tol: Infinity,
    what: "the shadow's fastest in the lot (on the street)",
  });
  const CLAIMS: Record<Lesson, Claim[]> = {
    "sc-park-perp-rev": [
      { where: /^objective$/, re: /на (около [^,;]+?) странично/u, measured: () => gapOff("sc-park-perp-rev", "shadow-correct"), what: "the shadow's setup off the noses" },
      { where: /^instruction 2$/, re: /дръж (около [^,;]+?) странично/u, measured: () => gapOff("sc-park-perp-rev", "shadow-correct"), what: "the shadow's setup off the noses" },
      { where: /^instruction 2$/, re: /под (\d+ км\/ч)/u, measured: () => cap("sc-park-perp-rev"), tol: 0.5, what: "the Задача 1 cap" },
      { where: /^shadow-correct caption/, re: /на (около [^,;]+?) от предниците/u, measured: () => gapOff("sc-park-perp-rev", "shadow-correct"), what: "the shadow's setup off the noses" },
      { where: /^mistake 0 whatWentWrong$/, re: /започна на (около [^,;—]+?) от реда/u, measured: () => gapOff("sc-park-perp-rev", "mistake-wide-approach"), what: "the too-close setup off the noses" },
      { where: /^mistake 0 whatWentWrong$/, re: /изходна позиция на (около [^,;.]+?метра)/u, measured: () => gapOff("sc-park-perp-rev", "shadow-correct"), what: "the shadow's setup off the noses" },
      { where: /^mistake-wide-approach caption/, re: /на (около метър) от колите/u, measured: () => gapOff("sc-park-perp-rev", "mistake-wide-approach"), what: "the too-close setup off the noses" },
      { where: /^mistake-wide-approach caption/, re: /започни на (около [^,;.]+?) от реда/u, measured: () => gapOff("sc-park-perp-rev", "shadow-correct"), what: "the shadow's setup off the noses" },
      aisle("sc-park-perp-rev"),
    ],
    "sc-park-narrow": [
      { where: /^objective$/, re: /на (около [^,;]+?) странично/u, measured: () => gapOff("sc-park-narrow", "shadow-correct"), what: "the shadow's setup off the noses" },
      { where: /^objective$/, re: /тясното (\d+(?:,\d+)?)-метрово/u, measured: () => parkOf("sc-park-narrow").bay.widthM, tol: 0.05, what: "the bay's width" },
      { where: /^instruction 2$/, re: /дръж (около [^,;]+?) странично/u, measured: () => gapOff("sc-park-narrow", "shadow-correct"), what: "the shadow's setup off the noses" },
      { where: /^shadow-correct caption/, re: /на (около [^,;]+?) от предниците/u, measured: () => gapOff("sc-park-narrow", "shadow-correct"), what: "the shadow's setup off the noses" },
      { where: /^mistake 0 title$/, re: /Подход на (метър) от реда/u, measured: () => gapOff("sc-park-narrow", "mistake-wide-swing"), what: "the too-close setup off the noses" },
      { where: /^mistake 0 whatWentWrong$/, re: /започна на (около метър) от колите/u, measured: () => gapOff("sc-park-narrow", "mistake-wide-swing"), what: "the too-close setup off the noses" },
      // the cross-lesson claim: the WIDE bay's setup is sc-park-perp-rev's committed shadow
      { where: /^mistake 0 whatWentWrong$/, re: /На широкото място се започва на (около [^,;]+?) от колите/u, measured: () => gapOff("sc-park-perp-rev", "shadow-correct"), what: "sc-park-perp-rev's shadow setup off the noses" },
      { where: /^mistake 0 whatWentWrong$/, re: /още по-отдалеч, на (около [^,;]+?),/u, measured: () => gapOff("sc-park-narrow", "shadow-correct"), what: "the shadow's setup off the noses" },
      { where: /^teach why$/, re: /подход на (метър) от реда/u, measured: () => gapOff("sc-park-narrow", "mistake-wide-swing"), what: "the too-close setup off the noses" },
      { where: /^mistake-wide-swing caption/, re: /подход на (метър) от колите/u, measured: () => gapOff("sc-park-narrow", "mistake-wide-swing"), what: "the too-close setup off the noses" },
      { where: /^mistake-wide-swing caption/, re: /започнат на (метър) от колите/u, measured: () => gapOff("sc-park-narrow", "mistake-wide-swing"), what: "the too-close setup off the noses" },
      { where: /^mistake-wide-swing caption/, re: /от (метър) колата/u, measured: () => gapOff("sc-park-narrow", "mistake-wide-swing"), what: "the too-close setup off the noses" },
      aisle("sc-park-narrow"),
    ],
    "sc-park-parallel": [
      { where: /^objective$/, re: /на (половин до един метър) от нея/u, measured: () => parGap("shadow-correct"), what: "ориентир 1's gap to the lead car" },
      { where: /^instruction 2$/, re: /на (половин до един метър) странично/u, measured: () => parGap("shadow-correct"), what: "ориентир 1's gap to the lead car" },
      { where: /^instruction 4$/, re: /под (около \d+°)/u, measured: () => SC_PARK_PARALLEL_GEOMETRY.swingDeg, tol: 2.5, what: "ориентир 2's swing" },
      { where: /^teach examiner$/, re: /на (половин до един метър)\)/u, measured: () => parGap("shadow-correct"), what: "ориентир 1's gap to the lead car" },
      {
        where: /^teach examiner$/,
        re: /без (повече от една) корекция/u,
        // the corrections the shadow makes after its first reverse: one change of direction (the forward pull)
        measured: () => {
          const S = committed("sc-park-parallel", "shadow-correct").samples;
          const i0 = S.findIndex((q) => q.gear < 0);
          let changes = 0;
          for (let i = i0 + 1; i < S.length; i++) if (Math.sign(S[i].gear) !== Math.sign(S[i - 1].gear) && S[i].gear !== 0) changes++;
          return changes;
        },
        what: "the corrections after the first reverse",
      },
      { where: /^shadow-correct caption/, re: /на (половин до един метър) —/u, measured: () => parGap("shadow-correct"), what: "ориентир 1's gap to the lead car" },
      { where: /^shadow-correct caption/, re: /под (около \d+°) си/u, measured: () => SC_PARK_PARALLEL_GEOMETRY.swingDeg, tol: 2.5, what: "ориентир 2's swing" },
      { where: /^mistake 0 whatWentWrong$/, re: /на (повече от два метра) от предната/u, measured: () => parGap("mistake-far-from-lead"), what: "the far setup's gap to the lead car" },
      { where: /^mistake 0 whatWentWrong$/, re: /Правилно: на (половин до един метър)/u, measured: () => parGap("shadow-correct"), what: "ориентир 1's gap to the lead car" },
      { where: /^mistake-far-from-lead caption/, re: /на (повече от два метра) от предната/u, measured: () => parGap("mistake-far-from-lead"), what: "the far setup's gap to the lead car" },
      { where: /^mistake-far-from-lead caption/, re: /започни на (половин до един метър) от съседа/u, measured: () => parGap("shadow-correct"), what: "ориентир 1's gap to the lead car" },
      aisle("sc-park-parallel"),
    ],
    "sc-park-45": [
      { where: /^objective$/, re: /под (\d+°) с един/u, measured: () => finalHeading("sc-park-45"), tol: 2.5, what: "the shadow's heading at rest in the bay" },
      { where: /^instruction 4$/, re: /под (\d+°) —/u, measured: () => finalHeading("sc-park-45"), tol: 2.5, what: "the shadow's heading at rest in the bay" },
      { where: /^shadow-correct caption/, re: /под (\d+°) —/u, measured: () => finalHeading("sc-park-45"), tol: 2.5, what: "the shadow's heading at rest in the bay" },
      { where: /^mistake 1 whatWentWrong$/, re: /дръж (метър) до реда/u, measured: rowGap45, what: "the shadow's line off the row's corners" },
      { where: /^mistake-corner-cut caption/, re: /дръж (около метър) от реда/u, measured: rowGap45, what: "the shadow's line off the row's corners" },
      aisle("sc-park-45"),
    ],
    "sc-pk-driveway": [
      {
        where: /^mistake 0 whatWentWrong$/,
        re: /— (метър и половина) след изходната позиция/u,
        measured: () => setupStop(committed("sc-pk-driveway", "mistake-wide").samples).y - setupStop(committed("sc-pk-driveway", "shadow-correct").samples).y,
        tol: 0.05,
        what: "how much later the late swing begins",
      },
      aisle("sc-pk-driveway"),
    ],
    "sc-park-perp-forward": [
      { where: /^instruction 2$/, re: /под (\d+ км\/ч)/u, measured: () => cap("sc-park-perp-forward"), tol: 0.5, what: "the Задача 1 cap" },
      {
        where: /^mistake 0 whatWentWrong$/,
        re: /и (цяла кола) по-рано/u,
        measured: () => SC_PARK_PERP_FORWARD_GEOMETRY.turnIn.y - turnStartY("sc-park-perp-forward", "mistake-early-turn"),
        what: "how much earlier the early turn begins (≥ the car's length)",
      },
      aisle("sc-park-perp-forward"),
    ],
  };
  /** Rhetoric, not a measure — by exact phrase, with the reason. */
  const NOT_TAUGHT: Record<string, string> = {
    "sc-park-45|2 км/ч": "the corner-cut's «в паркинга и 2 км/ч са удар»: a contact at walking pace is a strike; it states no speed of the demo",
  };

  for (const l of LESSONS) {
    it(`${l}: each taught number, read from its sentence, is the measured one`, () => {
      const texts = shownStrings(l);
      for (const c of CLAIMS[l]) {
        const hits = texts.filter(([w, x]) => c.where.test(w) && c.re.test(x));
        expect(hits.length, `${l}: no shown sentence for «${c.re.source}» (${c.what})`).toBeGreaterThan(0);
        for (const [w, x] of hits) {
          const phrase = c.re.exec(x)![1];
          const m = c.measured();
          const label = `${l} ${w}: «${phrase}» — ${c.what} measures ${m.toFixed(3)}`;
          if (/км\/ч$/u.test(phrase)) {
            const v = Number(phrase.replace(/\s*км\/ч$/u, ""));
            if (c.tol === Infinity) expect(m, label).toBeLessThanOrEqual(v);
            else expect(Math.abs(v - m), label).toBeLessThan(c.tol ?? 0.5);
          } else if (phrase === "повече от една") {
            expect(m, label).toBeLessThanOrEqual(1);
          } else if (phrase === "цяла кола") {
            expect(m, label).toBeGreaterThanOrEqual(2 * T.CHASSIS_HALF_EXTENTS.z);
          } else {
            expect(holds(stated(phrase), m, c.tol ?? 0.25), label).toBe(true);
          }
        }
      }
    });

    it(`${l}: the census is exact — no number phrase is shown that no claim reads`, () => {
      const unread: string[] = [];
      for (const [w, x] of shownStrings(l)) {
        const covered: Array<[number, number]> = [];
        for (const c of CLAIMS[l]) {
          if (!c.where.test(w)) continue;
          for (const m of x.matchAll(new RegExp(c.re.source, `${c.re.flags}g`))) {
            const at = m.index! + m[0].indexOf(m[1]);
            covered.push([at, at + m[1].length]);
          }
        }
        for (const m of x.matchAll(NUMBER_PHRASE)) {
          const p = m[0].trim();
          const a = m.index! + m[0].indexOf(p);
          if (NOT_A_QUANTITY.test(p) || NOT_TAUGHT[`${l}|${p}`] || A_LABEL.test(x.slice(0, a))) continue;
          const b = a + p.length;
          if (!covered.some(([s0, s1]) => a < s1 && b > s0)) unread.push(`${w}: «${p}» in «${x.slice(Math.max(0, a - 40), a + 40)}»`);
        }
      }
      expect(unread, `${l}: shown numbers no claim measures`).toEqual([]);
    });
  }

  it("narrow: the setup taken a metre off fails in BOTH bays — sooner and more askew in the narrow one (CP2-2)", () => {
    const at = (l: Lesson, name: string) => {
      const S = committed(l, name).samples;
      const i0 = S.findIndex((q) => q.gear < 0);
      let d = 0;
      for (let i = i0 + 1; i < S.length; i++) d += Math.hypot(S[i].x - S[i - 1].x, S[i].y - S[i - 1].y);
      return { reversedM: d, offAxisDeg: Math.abs(wrap180(S.at(-1)!.headingDeg - 270)) };
    };
    // both set up a metre off the noses (the claims above) and both end in a
    // contact with the neighbour they passed (the mistake pins below)
    // …so no shown sentence of the narrow lesson may present the close setup as
    // the wide bay's way, or say it works there (the round-1 verifier's V2)
    const wideWay = /навик\p{L}* от широкото|минава на просторното|като на широкото място — на около метър|широкото място: подход на метър/iu;
    expect(shownStrings("sc-park-narrow").filter(([, x]) => wideWay.test(x)).map(([w]) => w)).toEqual([]);
    const wide = at("sc-park-perp-rev", "mistake-wide-approach");
    const narrow = at("sc-park-narrow", "mistake-wide-swing");
    expect(narrow.reversedM, `narrow ${narrow.reversedM.toFixed(2)} m vs wide ${wide.reversedM.toFixed(2)} m: «още по-рано»`).toBeLessThan(wide.reversedM - 0.5);
    expect(narrow.offAxisDeg, `narrow ${narrow.offAxisDeg.toFixed(1)}° vs wide ${wide.offAxisDeg.toFixed(1)}°: «още по-накосо»`).toBeGreaterThan(wide.offAxisDeg + 5);
  });
});

// ---------------------------------------------------------------------------
// 4b. What the captions teach is what the correct demo does (D7)
// ---------------------------------------------------------------------------

const LOOKS: Record<Lesson, Array<{ caption: string; mirrors: Array<"left" | "right" | "rear"> }>> = {
  "sc-park-perp-rev": [{ caption: "Спри на половината завой и погледни назад", mirrors: ["right", "rear"] }],
  "sc-park-narrow": [{ caption: "Спри на половината завой и погледни в двете огледала", mirrors: ["left", "right"] }],
  "sc-park-parallel": [{ caption: "Ориентир 2: под около 40° си. Спри и погледни назад", mirrors: ["rear"] }],
  "sc-park-45": [],
  "sc-pk-driveway": [{ caption: "Спри на половината завой и погледни назад", mirrors: ["right", "rear"] }],
  "sc-park-perp-forward": [],
};

describe("curvpark2 — what the captions teach is what the correct demo does (D7)", () => {
  for (const l of LESSONS) {
    it(`${l}: every «спри … погледни» caption is followed, at rest, by the looks it names; forward lessons ask for no stop`, () => {
      const t = committed(l, "shadow-correct");
      const S = t.samples;
      const asks = (txt: string) => /(спри|Спри)[^.]*?(погледни|премери назад)/u.test(txt);
      const captions = t.events.filter((e) => e.kind === "annotation" && asks(e.textBg ?? ""));
      expect(captions.length).toBe(LOOKS[l].length);
      for (const want of LOOKS[l]) {
        const cap = captions.find((e) => (e.textBg ?? "").startsWith(want.caption))!;
        expect(cap, want.caption).toBeDefined();
        const restAt = S.find((q) => q.tSec >= cap.tSec - 1e-6 && Math.abs(q.speedKmh) < 0.05)!;
        expect(restAt.tSec - cap.tSec).toBeLessThan(1.0);
        const moveAgain = S.find((q) => q.tSec > restAt.tSec && Math.abs(q.speedKmh) > 0.05)!;
        const looks = t.events
          .filter((e) => e.kind.startsWith("glance-") && e.tSec >= restAt.tSec - 1e-6 && e.tSec <= moveAgain.tSec + 1e-6)
          .map((e) => e.kind.slice("glance-".length));
        for (const m of want.mirrors) expect(looks, `${l}: ${m}`).toContain(m);
        // the mid-reverse look (obs-during-reverse) is taken in reverse gear, at rest
        expect(restAt.gear).toBeLessThan(0);
      }
      if (!DEFS[l].reverse) {
        // A pass-through lesson: after the approach the car stops only in the bay.
        const z = zoneOf(l);
        const stops = S.filter((q, i) => i > 0 && q.speedKmh === 0 && S[i - 1].speedKmh > 0);
        expect(stops.length, "one stop: in the bay").toBe(1);
        expect(Math.hypot(stops[0].x - z.x, stops[0].y - z.y)).toBeGreaterThan(z.radiusM);
      } else {
        // the three looks at rest before R
        const firstRev = S.findIndex((q) => q.gear < 0);
        const before = t.events.filter((e) => e.kind.startsWith("glance-") && e.tSec <= S[firstRev].tSec && e.tSec >= setupStop(S).tSec - 1.5);
        expect(new Set(before.map((e) => e.kind))).toEqual(new Set(["glance-left", "glance-right", "glance-rear"]));
      }
    });

    it(`${l}: the RIGHT indicator goes on ONCE — the bay's side — after the set-up move, before the manoeuvre, stays on until the car is in the bay, goes off at rest in it`, () => {
      const t = committed(l, "shadow-correct");
      const S = t.samples;
      const on = t.events.filter((e) => e.kind === "signal-on" && e.detail === "right");
      expect(on.length).toBe(1);
      // a reverse lesson signals the bay at REST at its setup (round 2, CP2-6)
      if (DEFS[l].reverse) {
        const st = setupStop(S);
        const at = S.find((q) => q.tSec >= on[0].tSec - 1e-6)!;
        expect(Math.abs(at.speedKmh), "the right signal is given at rest").toBe(0);
        expect(Math.hypot(at.x - st.x, at.y - st.y), "…at the setup").toBeLessThan(0.01);
      }
      const park = parkOf(l);
      const b = park.bay;
      const h = (b.headingDeg * Math.PI) / 180;
      const inBay = (q: TraceSample) => {
        const dx = q.x - b.x;
        const dy = q.y - b.y;
        return Math.abs(dx * Math.sin(h) + dy * Math.cos(h)) <= b.lengthM / 2 && Math.abs(dx * Math.cos(h) - dy * Math.sin(h)) <= b.widthM / 2;
      };
      // the manoeuvre's start: the first reverse sample, or (forward) the first
      // sample of the turn — the last on the run-up line with heading 0.
      const startIdx = DEFS[l].reverse ? S.findIndex((q) => q.gear < 0) : S.findLastIndex((q) => Math.abs(wrap180(q.headingDeg)) < 0.05 && q.speedKmh > 0);
      expect(on[0].tSec).toBeLessThan(S[startIdx].tSec);
      const entered = S.find((q, i) => i >= startIdx && inBay(q))!;
      for (const q of S) if (q.tSec > on[0].tSec + 0.05 && q.tSec <= entered.tSec) expect(q.indicator, `t=${q.tSec.toFixed(2)}`).toBe("right");
      const after = t.events.filter((e) => (e.kind === "signal-on" || e.kind === "signal-off") && e.tSec > on[0].tSec + 1e-9);
      expect(after.map((e) => e.kind)).toEqual(["signal-off"]);
      const lastMove = S.filter((q) => Math.abs(q.speedKmh) > 0.05).at(-1)!;
      expect(after[0].tSec).toBeGreaterThan(lastMove.tSec);
    });

    it(`${l}: any reverse is at a parking pace — under the rear cue's „moving" speed (${REAR_CUE_MOVING_KMH} km/h)`, () => {
      const rev = committed(l, "shadow-correct").samples.filter((q) => q.gear < 0);
      if (!DEFS[l].reverse) {
        expect(rev).toEqual([]);
        return;
      }
      expect(Math.max(...rev.map((q) => Math.abs(q.speedKmh)))).toBeLessThan(REAR_CUE_MOVING_KMH);
    });
  }
});

// ---------------------------------------------------------------------------
// 4c. Signalling (round 2, integrator ruling CP2-6) — ЗДвП чл. 25, ал. 1 and
// чл. 26, read from content/law/acts/zdvp.json: a manoeuvre with a sideways
// deviation («да се отклони надясно или наляво по платното») is signalled
// BEFORE it, «включен през цялото време на извършване на маневрата», and
// cancelled «веднага след приключване на маневрата».
// ---------------------------------------------------------------------------

/** Lateral set-up moves (x changing while the car runs square, before the manoeuvre). */
function setUpMoves(S: readonly TraceSample[], before: number) {
  const moves: Array<{ i0: number; i1: number; dx: number }> = [];
  let cur: { i0: number; i1: number; dx: number } | null = null;
  for (let i = 1; i <= before; i++) {
    const moving = Math.abs(S[i].x - S[i - 1].x) > 1e-4;
    if (moving && !cur) cur = { i0: i - 1, i1: i, dx: 0 };
    if (moving && cur) cur.i1 = i;
    if (!moving && cur && S[i].tSec - S[cur.i1].tSec > 0.3) {
      cur.dx = S[cur.i1].x - S[cur.i0].x;
      moves.push(cur);
      cur = null;
    }
  }
  if (cur) moves.push({ ...cur, dx: S[cur.i1].x - S[cur.i0].x });
  return moves;
}
/** Where a demo's manoeuvre begins: its first reverse sample, or its first turn into the bay. */
function manoeuvreStart(l: Lesson, S: readonly TraceSample[]): number {
  if (DEFS[l].reverse) return S.findIndex((q) => q.gear < 0);
  const rightOn = S.findIndex((q) => q.indicator === "right");
  return S.findIndex((q, i) => i > rightOn && Math.abs(wrap180(q.headingDeg)) > 0.05);
}

describe("curvpark2 — every demo signals what it does, when it does it (ЗДвП чл. 26; CP2-6)", () => {
  for (const l of LESSONS) {
    for (const name of REAUTHORED(l)) {
      it(`${l}/${name}: a set-up move of more than half the car's width is made under the LEFT indicator, given ≥ 1 s before it and cancelled once the car is square on its line; no demo moves AWAY from the side it signals`, () => {
        const S = committed(l, name).samples;
        const m = manoeuvreStart(l, S);
        expect(m, "the manoeuvre starts").toBeGreaterThan(0);
        for (const mv of setUpMoves(S, m)) {
          // a lane-keeping correction (sc-park-parallel's 0.38 m onto ориентир 1)
          // is no set-up move; it is still never made against a signal (below)
          if (Math.abs(mv.dx) <= T.CHASSIS_HALF_EXTENTS.x) continue;
          expect(mv.dx, "every set-up move here is to the left").toBeLessThan(0);
          for (let i = mv.i0 + 1; i <= mv.i1; i++) expect(S[i].indicator, `${name} t=${S[i].tSec.toFixed(2)} x=${S[i].x.toFixed(2)}`).toBe("left");
          const on = S.findIndex((q) => q.indicator === "left");
          expect(S[mv.i0].tSec - S[on].tSec, "given in good time").toBeGreaterThanOrEqual(1.0);
          const off = S.findIndex((q, i) => i > mv.i1 && q.indicator !== "left");
          expect(S[off].tSec - S[mv.i1].tSec, "cancelled once the move is over").toBeLessThan(0.5);
          expect(S[off].indicator ?? "off", "…and not straight into the other side").toBe("off");
        }
        // never a move away from the signalled side before the manoeuvre
        for (let i = 1; i <= m; i++) {
          const ind = S[i].indicator ?? "off";
          if (ind === "right") expect(S[i - 1].x - S[i].x, `${name} t=${S[i].tSec.toFixed(2)}: left under the right signal`).toBeLessThan(0.005);
          if (ind === "left") expect(S[i].x - S[i - 1].x, `${name} t=${S[i].tSec.toFixed(2)}: right under the left signal`).toBeLessThan(0.005);
        }
        // the bay's right signal is on when the manoeuvre starts
        expect(S[m].indicator, "right at the manoeuvre").toBe("right");
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 5–6. The live rung chain, at three cadences
// ---------------------------------------------------------------------------

/** The phone the grade-grid row was filed from (w69, ms) — the jittered cadence. */
const W69 = [
  234, 668, 255, 629, 259, 722, 522, 277, 227, 300, 1104, 295, 256, 739, 524, 778, 518, 817, 350, 411, 927, 1365, 498,
  287, 800, 524, 845, 366, 310, 1217, 1185, 262, 234, 241, 243, 338, 404, 1114, 527, 1249, 332, 1272, 355, 654, 770,
  419, 344, 990, 1557, 429, 491, 1476, 482, 617, 1213, 890, 1888, 871, 1051, 1082, 1623, 7505, 655, 1887, 453, 329,
  362, 343, 314, 306, 291, 502, 2139, 1939, 2099, 2341, 506, 499, 494, 471, 407, 384, 439, 453, 370, 339,
].map((m) => m / 1000);
const CADENCES: ReadonlyArray<readonly [string, readonly number[]]> = [
  ["60 Hz", [1 / 60]],
  ["30 Hz", [1 / 30]],
  ["phone", W69],
];

interface RungRun {
  out: LiveReplayOutcome;
  contacts: number[];
  coachCards: string[];
}
/** curvdepth's runRung, by value: parked bodies as rising-edge overlaps of
 *  the hero with a product box set; a scripted consequence at the time the
 *  recorder graded it. */
function runRung(l: Lesson, name: string, level: ScenarioLevel, set: keyof ProductBoxSets = "envelope", deltas: readonly number[] = [1 / 60]): RungRun {
  const lesson = compileScenario(spec(l), level);
  const raw = districts.get(l);
  const bx = boxSets.get(l)![set];
  const rec = DEFS[l].record(raw, name);
  const scriptedSpec = SCRIPTED[`${l}/${name}`];
  const hit = rec.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION");
  const scriptedAt = scriptedSpec && hit ? hit.t : null;
  let sent = false;
  const touching = new Set<number>();
  const contacts: number[] = [];
  const coachCards: string[] = [];
  const out = liveChainReplay({
    lesson,
    districtRaw: raw,
    trace: committed(l, name),
    holdAfterSec: 3,
    frameDeltas: deltas,
    beforeApply: (ctx) => {
      const v = ctx.tick;
      for (const b of bx) {
        const over = obbSeparationM(heroBox(v.position.x, v.position.y, v.headingDeg), b) <= 0;
        if (over && !touching.has(b.index)) {
          contacts.push(b.index);
          ctx.tick.events.push({ kind: "collision", withWhat: b.withWhat, actorId: `obstacle-${b.index}` });
        }
        if (over) touching.add(b.index);
        else touching.delete(b.index);
      }
      if (scriptedSpec && scriptedAt !== null && !sent && ctx.t >= scriptedAt - 1e-6) {
        sent = true;
        ctx.tick.events.push({ kind: "collision", withWhat: scriptedSpec });
      }
    },
    afterApply: (ctx) => {
      for (const h of ctx.step.hudEvents) if (h.kind === "lesson") coachCards.push(h.titleBg);
    },
  });
  return { out, contacts, coachCards };
}

/** The mistake demos whose consequence is an AUTHORED step, not a body. */
const SCRIPTED: Record<string, "pedestrian" | "staticObject"> = {
  "sc-park-perp-rev/mistake-no-observation": "pedestrian",
  "sc-park-narrow/mistake-no-observation": "pedestrian",
  "sc-park-parallel/mistake-no-observation": "pedestrian",
  "sc-park-45/mistake-overshoot": "staticObject",
  "sc-park-perp-forward/mistake-blind-exit": "pedestrian",
};

describe("curvpark2 — each correct demo completes its lesson at EVERY rung and every cadence, on the live chain (ADR-014)", () => {
  for (const l of LESSONS) {
    it(`${l}: both tasks in order, 0 т., no bill, no contact, no teach card, no coaching card, ★3 — L1–L5 × 60 Hz / 30 Hz / phone`, () => {
      for (const [cad, deltas] of CADENCES) {
        for (const level of LEVELS) {
          const label = `${l} L${level} ${cad}`;
          const { out, contacts, coachCards } = runRung(l, "shadow-correct", level, "envelope", deltas);
          expect(contacts, label).toEqual([]);
          expect(out.ambientContacts, label).toEqual([]);
          expect(out.result.objectives.map((o) => o.done), label).toEqual([true, true]);
          const [o1, o2] = out.result.objectives;
          expect(o1.completedAtSec!, label).toBeLessThan(o2.completedAtSec!);
          expect(out.violationCodes, label).toEqual([]);
          expect(out.result.lessonMistakes, label).toBeUndefined();
          expect(out.teachMomentCodes, label).toEqual([]);
          // the card the old demos drew: «Стигна точката, но твърде бързо»
          expect(coachCards, label).toEqual([]);
          expect(out.result.score, label).toBe(0);
          expect(out.result.passed, label).toBe(true);
          expect(out.debrief, label).toMatch(/е издържан: 0 наказателни точки/);
          const lines = new Map((out.rubric?.breakdownBg ?? []).map((x) => [x.id, x]));
          expect(lines.get("placement")?.points, label).toBe(2);
          expect(lines.get("economy")?.points, label).toBe(2);
          if (DEFS[l].reverse) expect(lines.get("observation")?.points, label).toBe(2);
          expect(out.rubric?.stars, label).toBe(3);
        }
      }
    });
  }
});

/** What each mistake demo touches: the index of the ONE product body, or its scripted consequence. */
const MISTAKES: Record<string, { body: number } | { scripted: "pedestrian" | "staticObject" }> = {
  "sc-park-perp-rev/mistake-wide-approach": { body: 2 },
  "sc-park-perp-rev/mistake-no-observation": { scripted: "pedestrian" },
  "sc-park-narrow/mistake-wide-swing": { body: 2 },
  "sc-park-narrow/mistake-no-observation": { scripted: "pedestrian" },
  "sc-park-parallel/mistake-far-from-lead": { body: 1 },
  "sc-park-45/mistake-overshoot": { scripted: "staticObject" },
  "sc-park-45/mistake-corner-cut": { body: 1 },
  "sc-pk-driveway/mistake-wide": { body: 0 },
  "sc-pk-driveway/mistake-deep": { body: 1 },
  "sc-park-perp-forward/mistake-early-turn": { body: 0 },
};

describe("curvpark2 — each mistake demo commits its own mistake at every rung, and no other", () => {
  it("the table names the bodies the explanations name", () => {
    const at = (l: Lesson, i: number) => `${boxes(l)[i].model}@${boxes(l)[i].x},${boxes(l)[i].y}`;
    expect(at("sc-park-perp-rev", 2)).toBe("dret_90@5.03,2.7"); // „съседната кола, покрай която току-що беше минала"
    expect(at("sc-park-narrow", 2)).toBe("dret_90@5.03,2.5"); // „съседната кола"
    expect(at("sc-park-parallel", 1)).toBe("vela_h3@6.28,-6.5"); // „задната кола"
    expect(at("sc-park-45", 1)).toBe("vela_h3@4.8,-3.82"); // „ъгъла на паркирания съсед"
    expect(at("sc-pk-driveway", 0)).toBe("wall@9,47.3"); // „оградата"
    expect(at("sc-pk-driveway", 1)).toBe("wall@11,45"); // „дъното на алеята"
    expect(at("sc-park-perp-forward", 0)).toBe("dret_90@5.03,-5.4"); // „съседа" south of the bay
  });

  for (const l of LESSONS) {
    DEFS[l].names.slice(1).forEach((name, mi) => {
      const key = `${l}/${name}`;
      const want = MISTAKES[key];
      if (!want) return; // parallel no-observation: never an offender, byte-identical
      const codeRefs = [...spec(l).mistakes[mi].codeRefs].sort();
      it(`${key}: ${JSON.stringify(want)} → ${codeRefs.join(", ")} at every rung`, () => {
        const rec = DEFS[l].record(districts.get(l), name);
        expect([...new Set(rec.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code))].sort(), "recorder").toEqual(codeRefs);
        for (const level of LEVELS) {
          const label = `${key} L${level}`;
          const { out, contacts } = runRung(l, name, level);
          expect(out.ambientContacts, label).toEqual([]);
          if ("body" in want) {
            for (const set of ["envelope", "live", "gate"] as const) {
              const run = set === "envelope" ? { out, contacts } : runRung(l, name, level, set);
              expect(run.contacts, `${label} ${set}`).toEqual([want.body]);
              const codes = [...new Set([...run.out.violationCodes, ...(run.out.result.lessonMistakes ?? []).map((m) => m.code)])].sort();
              expect(codes, `${label} ${set}`).toEqual(codeRefs);
              const hit = run.out.session.events.find((e) => e.kind === "violation" && e.code === "COLLISION");
              expect(hit && hit.kind === "violation" ? hit.detail : undefined, `${label} ${set}`).toBe(boxes(l)[want.body].withWhat);
              expect(run.out.result.passed, `${label} ${set}`).toBe(false);
            }
          } else if (key === "sc-park-perp-forward/mistake-blind-exit") {
            // F12 (a doc 92 §9 row, out of scope): the exit collision falls after
            // Задача 2 completes, so the live lesson PASSES — as at the base, at every
            // rung. Its sheet is pinned EQUAL to the base's: 0 т., passed, both tasks, ★3.
            expect(contacts, label).toEqual([]);
            expect(out.result.score, label).toBe(0);
            expect(out.result.passed, label).toBe(true);
            expect(out.result.objectives.map((o) => o.done), label).toEqual([true, true]);
            expect(out.rubric?.stars, label).toBe(3);
          } else {
            expect(contacts, label).toEqual([]);
            const codes = [...new Set([...out.violationCodes, ...(out.result.lessonMistakes ?? []).map((m) => m.code)])].sort();
            expect(codes, label).toEqual(codeRefs);
            const hit = out.session.events.find((e) => e.kind === "violation" && e.code === "COLLISION");
            expect(hit && hit.kind === "violation" ? hit.detail : undefined, label).toBe(want.scripted);
            expect(out.result.passed, label).toBe(false);
          }
        }
      });
    });
  }

  it("each contact demo STOPS on the body it touched, IN it on both real boxes — 0.05–0.3 m into the smaller of the two (D1)", () => {
    for (const [key, want] of Object.entries(MISTAKES)) {
      if (!("body" in want)) continue;
      const [l, name] = key.split("/") as [Lesson, string];
      const S = committed(l, name).samples;
      const last = S[S.length - 1];
      const hero = heroBox(last.x, last.y, last.headingDeg);
      const sets = boxSets.get(l)!;
      expect(Math.abs(last.speedKmh), key).toBe(0);
      const inner = obbSeparationM(hero, sets.inner[want.body]);
      expect(inner, `${key} inner`).toBeLessThanOrEqual(-0.05);
      expect(inner, `${key} inner`).toBeGreaterThan(-0.3);
      const live = obbSeparationM(hero, sets.live[want.body]);
      expect(live, `${key} live`).toBeLessThanOrEqual(-0.05);
      expect(live, `${key} live`).toBeGreaterThan(-0.3);
      expect(obbSeparationM(hero, sets.gate[want.body]), `${key} gate`).toBeLessThanOrEqual(-0.05);
    }
  });

  it("the live extents the scripts cut against ARE the GLB table, and every struck parked car is one of them (D1)", () => {
    for (const [model, half] of Object.entries(PARK_DEPTH_LIVE_HALF)) expect(GLB_HALF[model], model).toEqual(half);
    for (const [key, want] of Object.entries(MISTAKES)) {
      if (!("body" in want)) continue;
      const [l] = key.split("/") as [Lesson];
      const m = boxSets.get(l)!.live[want.body].model;
      expect(m === "wall" || m in PARK_DEPTH_LIVE_HALF, `${key}: ${m}`).toBe(true);
    }
  });

  it("every mistake demo keeps ≥ 0.25 m from every body it is NOT about, on the envelope (D6)", () => {
    for (const [key, want] of Object.entries(MISTAKES)) {
      const [l, name] = key.split("/") as [Lesson, string];
      const others = "body" in want ? boxes(l).filter((b) => b.index !== want.body) : boxes(l);
      const c = minClearance(committed(l, name).samples, others);
      expect(c.m, `${key}: ${c.m.toFixed(3)} m at t=${c.atSec.toFixed(2)} (${c.model} #${c.index})`).toBeGreaterThanOrEqual(CLEARANCE_FLOOR_M);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. sc-park-perp-forward's left-half start is ЗДвП чл. 35, ал. 2's, and only
//    the turn's start (lane curvpark2 round 3, integrator ruling CP2-1bis,
//    2026-11-06: (2) the left-half distance, (3) the duty taught, (4) the
//    citation; (1), the precondition, is ./park-family-limit.test.ts).
// ---------------------------------------------------------------------------

/** The distance the car's centre travels LEFT of the aisle centre line (x 0) before the turn-in, m. */
function leftHalfBeforeTurnIn(S: readonly TraceSample[], turnInY: number): number {
  let d = 0;
  for (let i = 1; i < S.length && S[i].y < turnInY - 1e-6; i++) {
    if (S[i].x < 0) d += Math.hypot(S[i].x - S[i - 1].x, S[i].y - S[i - 1].y);
  }
  return d;
}
/**
 * The shortest it can be, built from first principles — never from where the
 * builder starts its S: the second half of the S at the kit's aisle radius
 * (the part of an S from the drawn lane centre X_LANE to the turn-in line
 * that lies left of x 0), then the straight the two signals need — one blink
 * of the ghost's lamp between them and the right signal's lead.
 */
function leftHalfMinimum(): number {
  const g = SC_PARK_PERP_FORWARD_GEOMETRY;
  const shift = g.turnIn.x - X_LANE;
  const k = Math.sign(shift) / 6;
  const sPath = authoredDrive({ x: X_LANE, y: 0, headingDeg: 0 }, sShift(swingForShift(shift, k, 1.5), k, 1.5), 1).points;
  let d = 0;
  for (let i = 1; i < sPath.length; i++) if (sPath[i][0] < 0) d += Math.hypot(sPath[i][0] - sPath[i - 1][0], sPath[i][1] - sPath[i - 1][1]);
  return d + ((SIGNAL_GAP_SEC + TURN_SIGNAL_LEAD_SEC) * SETUP_KMH) / 3.6;
}
/** The ghost's own lamp period, read from the component (a matcher that cannot read it throws). */
function ghostBlinkPeriodS(): number {
  const src = readFileSync(path.join(REPO_ROOT, "platform", "src", "components", "sim", "ShadowCar.tsx"), "utf-8");
  const m = /const BLINK_PERIOD_S = ([0-9.]+);/.exec(src);
  if (!m) throw new Error("ShadowCar.tsx: BLINK_PERIOD_S not found");
  return Number(m[1]);
}
const CENSUS_FIXTURE = path.join(REPO_ROOT, "platform", "src", "modules", "sim", "lessons", "scenario", "__tests__", "keep-right-claim-census.json");

describe("curvpark2 round 3 — sc-park-perp-forward takes the aisle's left half only as the turn's start (ЗДвП чл. 35, ал. 2; CP2-1bis)", () => {
  const g = SC_PARK_PERP_FORWARD_GEOMETRY;

  it("the run-up is built from the product's own numbers: the kit's aisle S (radius 6, ramps 1.5), the 3.0 s signal lead, one blink of the ghost's lamp", () => {
    expect(g.sRadiusM).toBe(6);
    expect(g.sRampM).toBe(1.5);
    expect(TURN_SIGNAL_LEAD_SEC).toBe(INDICATOR_LEAD_SEC);
    expect(SIGNAL_GAP_SEC).toBe(ghostBlinkPeriodS());
    expect(g.sEndY).toBeCloseTo(g.turnIn.y - g.turnSignalLeadM - g.signalGapM, 9);
  });

  for (const name of ["shadow-correct", "mistake-blind-exit"]) {
    it(`${name}: the car's centre is left of the centre line only for the S's second half and the two signals' straight — the shortest the turn-in allows`, () => {
      const S = committed("sc-park-perp-forward", name).samples;
      const measured = leftHalfBeforeTurnIn(S, g.turnIn.y);
      const minimum = leftHalfMinimum();
      expect(Math.abs(measured - minimum), `measured ${measured.toFixed(3)} m vs the shortest ${minimum.toFixed(3)} m`).toBeLessThan(0.15);
      // the round-2 run-up (S from y −28) ran 17.94 m there
      expect(measured).toBeLessThan(15);
      // nowhere left of the line before the S
      const firstLeft = S.findIndex((q) => q.x < 0);
      expect(S[firstLeft].y, "the S crosses the line late").toBeGreaterThan(g.sFromY);
    });
  }

  it("shadow-correct: the left signal ends where the S ends, the right one a blink later and ≥ 3.0 s before the turn-in; the look right is taken rolling, before the turn-in", () => {
    const t = committed("sc-park-perp-forward", "shadow-correct");
    const S = t.samples;
    const turnIn = S.find((q) => q.y >= g.turnIn.y - 1e-6 && q.x < -3)!;
    const leftOff = t.events.find((e) => e.kind === "signal-off")!;
    const rightOn = t.events.find((e) => e.kind === "signal-on" && e.detail === "right")!;
    expect(rightOn.tSec - leftOff.tSec, "one blink between the two signals").toBeGreaterThanOrEqual(SIGNAL_GAP_SEC - 0.05);
    expect(turnIn.tSec - rightOn.tSec, "the right signal's lead").toBeGreaterThanOrEqual(TURN_SIGNAL_LEAD_SEC - 0.05);
    const at = (tt: number) => S.filter((q) => q.tSec <= tt + 1e-6).at(-1)!;
    expect(Math.abs(at(leftOff.tSec).x - g.turnIn.x), "square on the line when the left signal ends").toBeLessThan(0.01);
    const looks = t.events.filter((e) => e.kind === "glance-right" && e.tSec >= rightOn.tSec - 1e-6 && e.tSec < turnIn.tSec);
    expect(looks.length, "a look right between the right signal and the turn-in").toBeGreaterThanOrEqual(1);
    for (const e of looks) expect(Math.abs(at(e.tSec).speedKmh), "taken rolling — a pass-through lesson stops only in the bay").toBeGreaterThan(1);
    // the yield caption is shown before the turn-in, with that look
    const cap = t.events.find((e) => e.kind === "annotation" && /пропусни всеки, който минава отдясно/u.test(e.textBg ?? ""))!;
    expect(cap, "the yield caption").toBeDefined();
    expect(cap.tSec).toBeLessThan(turnIn.tSec);
    // and «щом лявата половина е свободна напред» before the car leaves the right half
    const clear = t.events.find((e) => e.kind === "annotation" && /лявата половина е свободна напред/u.test(e.textBg ?? ""))!;
    expect(clear, "the clear-ahead caption").toBeDefined();
    expect(clear.tSec).toBeLessThan(S.find((q) => q.x < 0)!.tSec);
  });

  it("the instructions teach ал. 2's start and its duty before the move, and the lesson cites чл. 35, ал. 2 by retrieval", () => {
    const sp = spec("sc-park-perp-forward");
    const ins = (n: number) => sp.instructionsBg.find((i) => i.n === n)!.textBg;
    expect(ins(2)).toMatch(/завоят напред започва от лявата половина на алеята/u);
    expect(ins(2)).toMatch(/щом е свободна напред/u);
    expect(ins(3)).toMatch(/погледни вдясно и пропусни всеки, който минава отдясно/u);
    expect(sp.teach.lawRef).toMatch(/чл\. 35, ал\. 2/u);
    const zdvp = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "law", "acts", "zdvp.json"), "utf-8")) as { units: Array<{ textBg?: string }> };
    const art = zdvp.units.find((u) => (u.textBg ?? "").startsWith("Чл. 35."));
    if (!art) throw new Error("zdvp.json: чл. 35 not found");
    expect(art.textBg).toContain(
      "(2) Когато радиусът на завиване на пътното превозно средство е по-голям от радиуса на завоя, завиването може да започне и от друга част на платното за движение, но водачът на завиващото превозно средство е длъжен да пропусне пътните превозни средства, преминаващи от дясната му страна.",
    );
  });

  it("the keep-right census files both left-half sentences under ал. 2 with the measured figures", () => {
    const census = JSON.parse(readFileSync(CENSUS_FIXTURE, "utf-8")) as { sentences: Record<string, { class: string; why?: string }> };
    const t = committed("sc-park-perp-forward", "shadow-correct");
    const metres = leftHalfBeforeTurnIn(t.samples, g.turnIn.y).toFixed(2);
    const shown = [...spec("sc-park-perp-forward").instructionsBg.map((i) => i.textBg), ...t.events.filter((e) => e.kind === "annotation").map((e) => e.textBg ?? "")].join(" ");
    const leftHalf = Object.keys(census.sentences).filter((k) => shown.includes(k) && /лявата половина|отляво/u.test(k));
    expect(leftHalf.length, leftHalf.join(" | ")).toBe(2);
    for (const k of leftHalf) {
      const e = census.sentences[k];
      expect(e.class, k).toBe("other");
      expect(e.why ?? "", k).toMatch(/^ЗДвП чл\. 35 ал\. 2 \(retrieved\): радиусът на завиване > радиуса на завоя \(measured: /u);
      expect(e.why ?? "", `${k}: the left-half distance the trace measures`).toContain(`the move left is the turn's start (${metres} m`);
      expect(e.why ?? "", k).toContain("the yield duty stated");
    }
  });
});

// ---------------------------------------------------------------------------
// 8. sc-park-perp-rev and sc-park-narrow take the aisle's left half only as
//    the reverse's start (lane curvpark2 round 4, integrator rulings CP2-1bis /
//    CP2-1ter, 2026-11-08: (1) the precondition on the drivable programme with
//    the demo floor, (2) the left-half distance at the geometry's minimum, (3)
//    the duty taught, (4) the citation; the full-lock limit stays a recorded
//    fact in ./park-family-limit.test.ts). Round 5, integrator ruling
//    CP2-1quater: «the geometry's minimum» is the minimum over every set-up
//    that starts from the drawn lane centre — the TWO-STAGE set-up (S1 onto a
//    right-half line before the row, that line past the row, S2 onto the setup
//    line ending at the stop), not round 4's single S.
// ---------------------------------------------------------------------------

type ReverseLeft = "sc-park-perp-rev" | "sc-park-narrow";
const REVERSE_LEFT: Record<ReverseLeft, { g: typeof SC_PARK_PERP_REV_GEOMETRY | typeof SC_PARK_NARROW_GEOMETRY; fullLockM: string }> = {
  // the full-lock right-half entries park-family-limit.test.ts records (round 3)
  "sc-park-perp-rev": { g: SC_PARK_PERP_REV_GEOMETRY, fullLockM: "0.116 m" },
  "sc-park-narrow": { g: SC_PARK_NARROW_GEOMETRY, fullLockM: "0.003 m" },
};
/** The distance the car's centre travels LEFT of the aisle centre line (x 0) before the first reverse sample, m — the segment that crosses the line counted only from the crossing. */
function leftHalfBeforeReverse(S: ReadonlyArray<{ x: number; y: number; gear?: number }>): number {
  const r = S.findIndex((q) => (q.gear ?? 1) < 0);
  const end = r < 0 ? S.length : r;
  let d = 0;
  for (let i = 1; i < end; i++) {
    const a = S[i - 1];
    const b = S[i];
    if (a.x >= 0 && b.x >= 0) continue;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    d += a.x < 0 && b.x < 0 ? seg : (seg * Math.abs(a.x < 0 ? a.x : b.x)) / Math.abs(b.x - a.x);
  }
  return d;
}
/**
 * THE SHORTEST A SINGLE S CAN BE (round 4's reading, kept so the pin shows the
 * two-stage set-up of round 5 is shorter — CP2-1quater), built from first
 * principles. The set-up move is the kit's aisle S (radius 6, ramps
 * 1.5 m — CP2-1bis (2): «at the kit's aisle radius, every curvature bar
 * kept») from the drawn lane centre X_LANE onto the demo's setup line, then
 * straight to the setup stop (fixed by the 4.6 m swing into the bay). The later
 * the S begins, the shorter the stretch left of the line — until the real car
 * on it comes within the demo floor of the row it is passing: the S start is
 * the latest at which the recorded, the bicycle and the driven-from-square
 * poses all keep CLEARANCE_FLOOR_M from every body of the product's envelope
 * (bisection to 1 mm), and the minimum is that path's left-of-line distance.
 */
function latestSetUpS(l: ReverseLeft): { fromY: number; leftM: number; clear: (fromY: number) => { m: number; model: string; index: number } } {
  const g = REVERSE_LEFT[l].g;
  const shift = g.setup.x - X_LANE;
  const k = Math.sign(shift) / 6;
  const sProg = sShift(swingForShift(shift, k, 1.5), k, 1.5);
  const sLen = authoredDrive({ x: 0, y: 0, headingDeg: 0 }, sProg, 1).end.y;
  const pathFrom = (fromY: number) => {
    const pts = authoredDrive({ x: X_LANE, y: fromY, headingDeg: 0 }, [...sProg, straight(g.setup.y - fromY - sLen)], 1).points;
    const out: TraceSample[] = [];
    for (let i = 0; i < pts.length; i += 10) {
      const j = Math.min(pts.length - 1, Math.max(10, i));
      const h = (Math.atan2(pts[j][0] - pts[j - 10][0], pts[j][1] - pts[j - 10][1]) * 180) / Math.PI;
      out.push({ tSec: i / 1000, x: pts[i][0], y: pts[i][1], headingDeg: h, speedKmh: SETUP_KMH, gear: 1, brakeOn: false } as unknown as TraceSample);
    }
    return out;
  };
  const bx = boxes(l);
  const clear = (fromY: number) => {
    const S = pathFrom(fromY);
    return [minClearance(S, bx), minClearance(bicycleOnPath(S), bx), minClearance(driveFromSquare(S), bx)].reduce((a, b) => (b.m < a.m ? b : a));
  };
  let lo = -24;
  let hi = g.setup.y - sLen;
  if (clear(lo).m < CLEARANCE_FLOOR_M) throw new Error(`${l}: even an S from y ${lo} comes within the floor`);
  while (hi - lo > 1e-3) {
    const mid = (lo + hi) / 2;
    if (clear(mid).m >= CLEARANCE_FLOOR_M) lo = mid;
    else hi = mid;
  }
  return { fromY: lo, leftM: leftHalfBeforeReverse(pathFrom(lo)), clear };
}
/**
 * Every 4.6 m reverse swing into the bay from a right-half stop ending on the
 * bay axis with NO straight-in (round 4's sweep): from the half-width line to
 * 0.8 m further right, ramps 0.1–1.5 m, on the product's envelope. `best` is
 * the larger of the recorded and bicycle poses' clearance (the precondition);
 * `rec` / `bike` the best of each pose alone — the overlaps the keep-right
 * census reason states (round 5, CP2-1quater's C2).
 */
const swingMemo = new Map<ReverseLeft, { best: { m: number; at: string }; rec: number; bike: number }>();
function rightHalfSwings(l: ReverseLeft): { best: { m: number; at: string }; rec: number; bike: number } {
  const hit = swingMemo.get(l);
  if (hit) return hit;
  const g = REVERSE_LEFT[l].g;
  const xRight = T.CHASSIS_HALF_EXTENTS.x;
  let best = { m: -Infinity, at: "" };
  let rec = -Infinity;
  let bike = -Infinity;
  for (let x0 = xRight; x0 <= xRight + 0.8 + 1e-9; x0 += 0.1) {
    for (const ramp of [0.1, 0.25, 0.5, 1, 1.5]) {
      const prog = turn(Math.PI / 2, 1 / DRIVABLE_MIN_CENTRE_RADIUS_M, ramp, ramp);
      const d = authoredDrive({ x: 0, y: 0, headingDeg: 0 }, prog, -1).end;
      const pts = authoredDrive({ x: x0, y: g.bay.y - d.y, headingDeg: 0 }, prog, -1).points;
      const S: TraceSample[] = [];
      for (let i = 0; i < pts.length; i += 10) {
        const j = Math.min(pts.length - 1, Math.max(10, i));
        const h = (Math.atan2(pts[j][0] - pts[j - 10][0], pts[j][1] - pts[j - 10][1]) * 180) / Math.PI + 180;
        S.push({ tSec: i / 1000, x: pts[i][0], y: pts[i][1], headingDeg: h, speedKmh: -3, gear: -1, brakeOn: false } as unknown as TraceSample);
      }
      const r = minClearance(S, boxes(l)).m;
      const b = minClearance(bicycleOnPath(S), boxes(l)).m;
      rec = Math.max(rec, r);
      bike = Math.max(bike, b);
      const c = Math.max(r, b);
      if (c > best.m) best = { m: c, at: `x0 ${x0.toFixed(2)}, ramps ${ramp} m` };
    }
  }
  const out = { best, rec, bike };
  swingMemo.set(l, out);
  return out;
}
/** Round 3's left-of-line distances (the S from the gate at y −18), r3/reverse-lefthalf.txt. */
const ROUND3_LEFT_M: Record<ReverseLeft, number> = { "sc-park-perp-rev": 16.547, "sc-park-narrow": 17.456 };
/** Round 4's (one late S from the lane centre), r4/vprobe/summary.txt. */
const ROUND4_LEFT_M: Record<ReverseLeft, number> = { "sc-park-perp-rev": 11.897, "sc-park-narrow": 12.36 };

/** The kit's aisle S (radius 6, ramps 1.5 — CP2-1bis (2)) for a lateral shift. */
const kitSProg = (shift: number) => {
  const k = Math.sign(shift) / 6;
  return sShift(swingForShift(shift, k, 1.5), k, 1.5);
};
/** An authored path sampled every centimetre, as the minimum's pins read it. */
function sampledPath(pts: ReadonlyArray<readonly [number, number]>): TraceSample[] {
  const out: TraceSample[] = [];
  for (let i = 0; i < pts.length; i += 10) {
    const j = Math.min(pts.length - 1, Math.max(10, i));
    const h = (Math.atan2(pts[j][0] - pts[j - 10][0], pts[j][1] - pts[j - 10][1]) * 180) / Math.PI;
    out.push({ tSec: i / 1000, x: pts[i][0], y: pts[i][1], headingDeg: h, speedKmh: SETUP_KMH, gear: 1, brakeOn: false } as unknown as TraceSample);
  }
  return out;
}
/**
 * THE TWO-STAGE MINIMUM, from first principles (round 5, CP2-1quater) — never
 * from where the builder puts its line or its S's. A set-up from the drawn lane
 * centre X_LANE: S1 (the kit's S) onto a right-half line xm — begun where the
 * aisle begins (LOT_AISLE_Y), the start that leaves the row the most room —
 * that line straight past the row, and S2 (the kit's S) from xm onto the setup
 * line, ending AT the setup stop: the latest S2 can begin, since the stop is
 * fixed by the 4.6 m swing into the bay. Only S2's tail is left of the centre
 * line, so the left distance depends on xm alone. The floor (CLEARANCE_FLOOR_M
 * on the recorded, bicycle and driven-from-square poses, the product's
 * envelope) bounds xm on the right — the line as close to the row as the floor
 * allows, `xmMax`, by bisection to 1 mm — and the half width bounds it on the
 * left (the car wholly right of the centre line). The minimum is the least left
 * distance over every line in [half width, xmMax] (a 5 cm grid and xmMax
 * itself), each line checked against the floor.
 */
function twoStageMinimum(l: ReverseLeft): {
  xmMax: number;
  leftM: number;
  atXm: number;
  clear: (xm: number) => { m: number; model: string; index: number };
} {
  const g = REVERSE_LEFT[l].g;
  const pathOf = (xm: number) => {
    const l1 = kitSLength(xm - X_LANE);
    const s2From = g.setup.y - kitSLength(g.setup.x - xm);
    return sampledPath(
      authoredDrive(
        { x: X_LANE, y: LOT_AISLE_Y, headingDeg: 0 },
        [...kitSProg(xm - X_LANE), straight(s2From - LOT_AISLE_Y - l1), ...kitSProg(g.setup.x - xm)],
        1,
      ).points,
    );
  };
  const bx = boxes(l);
  const clear = (xm: number) => {
    const S = pathOf(xm);
    return [minClearance(S, bx), minClearance(bicycleOnPath(S), bx), minClearance(driveFromSquare(S), bx)].reduce((a, b) => (b.m < a.m ? b : a));
  };
  const leftOf = (xm: number) => leftHalfBeforeReverse(pathOf(xm));
  const xmMin: number = T.CHASSIS_HALF_EXTENTS.x;
  let lo = xmMin;
  let hi = nosesX(l);
  if (clear(lo).m < CLEARANCE_FLOOR_M) throw new Error(`${l}: even the line at the centre line's edge comes within the floor`);
  while (hi - lo > 1e-3) {
    const mid = (lo + hi) / 2;
    if (clear(mid).m >= CLEARANCE_FLOOR_M) lo = mid;
    else hi = mid;
  }
  let best = { leftM: leftOf(lo), atXm: lo };
  for (let xm = xmMin; xm < lo; xm += 0.05) {
    const c = clear(xm);
    if (c.m < CLEARANCE_FLOOR_M) throw new Error(`${l}: the line x ${xm.toFixed(2)} comes within the floor (${c.m.toFixed(3)} m) — the floor's lines are not one interval`);
    const d = leftOf(xm);
    if (d < best.leftM) best = { leftM: d, atXm: xm };
  }
  return { xmMax: lo, ...best, clear };
}

describe("curvpark2 round 4 — sc-park-perp-rev and sc-park-narrow take the aisle's left half only as the reverse's start (ЗДвП чл. 35, ал. 2; CP2-1ter)", () => {
  for (const l of Object.keys(REVERSE_LEFT) as ReverseLeft[]) {
    const { g, fullLockM } = REVERSE_LEFT[l];
    let min: ReturnType<typeof latestSetUpS> | null = null;
    const minimum = () => (min ??= latestSetUpS(l));

    it(`${l}: (1) the precondition on the ruled programme — no single 4.6 m reverse swing begun wholly in the right half keeps the demo floor: the kit refuses it, and with no straight-in at all it runs into the neighbour`, () => {
      // wholly right of the centre line: the centre at least a half width off it
      const xRight = T.CHASSIS_HALF_EXTENTS.x;
      expect(() => bayReverse(1, xRight, g.bay, { ...g.swing, radiusM: DRIVABLE_MIN_CENTRE_RADIUS_M })).toThrow(/past the bay/u);
      // A quarter turn on circles no tighter than R carries the centre ≥ R sideways (∫ sin h ds ≥ R ∫ sin h dh = R),
      // more than the 4.18 m from a right-half stop to the bay centre — so the kit's swing (on the bay axis SHORT of
      // the centre, then straight in) cannot exist. Nor can the overshooting one: every swing on the 4.6 m circle
      // ending on the bay axis with no straight-in, from any right-half line to 0.8 m further right, on any ramp the
      // wheel allows, measured on the product's envelope.
      expect(xRight + DRIVABLE_MIN_CENTRE_RADIUS_M).toBeGreaterThan(g.bay.x);
      const { best } = rightHalfSwings(l);
      expect(best.m, `the best right-half 4.6 m swing: ${best.m.toFixed(3)} m (${best.at})`).toBeLessThan(0);
      expect(g.setup.x, "so the demo's setup is left of the line").toBeLessThan(0);
    });

    let two: ReturnType<typeof twoStageMinimum> | null = null;
    const twoMin = () => (two ??= twoStageMinimum(l));

    it(`${l}: (2) the two-stage set-up is cut from the product's own numbers — the kit's S on both stages, S2 ending at the setup stop, the line inside the floor's`, () => {
      expect(g.sRadiusM).toBe(6);
      expect(g.sRampM).toBe(1.5);
      expect(Math.abs(g.s2FromY + kitSLength(g.setup.x - g.xm) - g.setup.y), "S2 ends AT the setup stop").toBeLessThan(1e-6);
      expect(Math.abs(g.s1FromY + kitSLength(g.xm - X_LANE) - g.s1EndY), "S1 ends where its signal is cancelled").toBeLessThan(1e-6);
      const m = twoMin();
      expect(g.xm, "the car wholly right of the centre line past the row").toBeGreaterThanOrEqual(T.CHASSIS_HALF_EXTENTS.x);
      expect(g.xm, `the line keeps the floor (the floor's own line is x ${m.xmMax.toFixed(3)})`).toBeLessThanOrEqual(m.xmMax);
      // the line cannot sit further right: 2 cm past the floor's line the real car comes within the floor of a parked car
      const past = m.clear(m.xmMax + 0.02);
      expect(past.m, `line x ${(m.xmMax + 0.02).toFixed(3)}: ${past.m.toFixed(3)} m to ${past.model} #${past.index}`).toBeLessThan(CLEARANCE_FLOOR_M);
    });

    for (const name of ["shadow-correct", "mistake-no-observation"]) {
      it(`${l}/${name}: (2) the car's centre is left of the centre line only for S2's tail — the two-stage minimum; a single S is longer`, () => {
        const S = committed(l, name).samples;
        const m = twoMin();
        const measured = leftHalfBeforeReverse(S);
        expect(
          Math.abs(measured - m.leftM),
          `measured ${measured.toFixed(3)} m vs the two-stage minimum ${m.leftM.toFixed(3)} m (line x ${m.atXm.toFixed(3)}; the floor's line x ${m.xmMax.toFixed(3)})`,
        ).toBeLessThan(0.15);
        // round 4's reading (one S from the lane centre, begun as late as the row allows) is longer — measured, not assumed
        const single = minimum();
        expect(single.leftM, `a single S from y ${single.fromY.toFixed(3)} runs ${single.leftM.toFixed(3)} m left of the line`).toBeGreaterThan(measured + 1);
        expect(measured, `round 4 ran ${ROUND4_LEFT_M[l]} m there, round 3 ${ROUND3_LEFT_M[l]} m`).toBeLessThan(ROUND4_LEFT_M[l] - 5);
        // nowhere left of the line before S2 begins; past the row on the right-half line, wholly right of the centre line
        expect(S.find((q) => q.x < 0)!.y, "only S2 crosses the line").toBeGreaterThan(g.s2FromY);
        const onLine = S.filter((q) => q.y > g.s1EndY + 0.1 && q.y < g.s2FromY - 0.1);
        expect(onLine.length).toBeGreaterThan(20);
        for (const q of onLine) expect(Math.abs(q.x - g.xm), `y ${q.y.toFixed(2)}: on the line`).toBeLessThan(0.01);
        const beforeS2 = S.filter((q) => q.y < g.s2FromY && q.gear >= 0).map((q) => q.x);
        expect(Math.min(...beforeS2), "wholly right of the centre line before S2").toBeGreaterThanOrEqual(T.CHASSIS_HALF_EXTENTS.x - 1e-6);
      });

      it(`${l}/${name}: each lateral move is signalled on its own — the left signal ≥ ${INDICATOR_LEAD_SEC} s before each S, off when it is over, a blink of the lamp between, no right signal while the car moves left`, () => {
        expect(SET_UP_SIGNAL_LEAD_SEC, "the kit's lead is the product's").toBe(INDICATOR_LEAD_SEC);
        const t = committed(l, name);
        const S = t.samples;
        const st = setupStop(S);
        const rev = S.find((q) => q.gear < 0)!;
        const sig = t.events.filter((e) => (e.kind === "signal-on" || e.kind === "signal-off") && e.tSec <= rev.tSec + 1e-6);
        expect(sig.map((e) => `${e.kind}:${e.kind === "signal-on" ? e.detail : ""}`)).toEqual([
          "signal-on:left",
          "signal-off:",
          "signal-on:left",
          "signal-off:",
          "signal-on:right",
        ]);
        const [on1, off1, on2, off2, onR] = sig;
        const at = (y: number) => S.find((q) => q.y >= y)!;
        expect(at(g.s1FromY).tSec - on1.tSec, "S1's lead").toBeGreaterThanOrEqual(INDICATOR_LEAD_SEC);
        expect(Math.abs(off1.tSec - at(g.s1EndY).tSec), "S1's signal off where S1 is over").toBeLessThan(0.1);
        expect(on2.tSec - off1.tSec, "a blink of the lamp between the two signals").toBeGreaterThanOrEqual(SIGNAL_BLINK_SEC);
        expect(at(g.s2FromY).tSec - on2.tSec, "S2's lead").toBeGreaterThanOrEqual(INDICATOR_LEAD_SEC);
        const atOff2 = S.filter((q) => q.tSec <= off2.tSec + 1e-6).at(-1)!;
        expect(Math.hypot(atOff2.x - st.x, atOff2.y - st.y), "S2's signal off at the stop, where S2 is over").toBeLessThan(0.06);
        expect(onR.tSec, "the right signal only after, at rest at the setup").toBeGreaterThan(off2.tSec);
        // S2 swings the tail toward the row's noses beside it: a crawl under the rear cue's «moving» speed, so the
        // badge that reads the row behind is amber there, never the red of «closing» (round 5)
        expect(S2_KMH).toBeLessThan(REAR_CUE_MOVING_KMH);
        const s2Pace = S.filter((q) => q.tSec >= on2.tSec + 1 && q.tSec <= off2.tSec).map((q) => Math.abs(q.speedKmh));
        expect(Math.max(...s2Pace), "S2's pace").toBeLessThan(REAR_CUE_MOVING_KMH);
        for (const q of S) {
          if (q.tSec >= rev.tSec) break;
          const inS1 = q.y > g.s1FromY + 0.05 && q.y < g.s1EndY - 0.05;
          const inS2 = q.y > g.s2FromY + 0.05 && q.y < st.y - 0.05;
          if (inS1 || inS2) expect(q.indicator, `y ${q.y.toFixed(2)}: in an S`).toBe("left");
        }
        if (name === "shadow-correct") {
          const capAt = (re: RegExp) => t.events.find((e) => e.kind === "annotation" && re.test(e.textBg ?? ""));
          const c1 = capAt(/остани в дясната половина на алеята/u);
          expect(c1, "the S1 caption").toBeDefined();
          expect(Math.abs(c1!.tSec - on1.tSec), "…shown with S1's signal").toBeLessThan(1e-6);
          const clear = capAt(/лявата половина е свободна напред/u);
          expect(clear, "the clear-ahead caption").toBeDefined();
          expect(Math.abs(clear!.tSec - on2.tSec), "…shown with S2's signal").toBeLessThan(1e-6);
          expect(clear!.tSec, "…before the car leaves the right half").toBeLessThan(S.find((q) => q.x < 0)!.tSec);
        }
      });
    }

    it(`${l}: the yield duty is shown at rest at the setup, with the look right, before the reverse`, () => {
      const t = committed(l, "shadow-correct");
      const S = t.samples;
      const st = setupStop(S);
      const rev = S.find((q) => q.gear < 0)!;
      const at = (tt: number) => S.filter((q) => q.tSec <= tt + 1e-6).at(-1)!;
      const cap = t.events.find((e) => e.kind === "annotation" && /пропусни всеки, който минава отдясно/u.test(e.textBg ?? ""));
      expect(cap, "the yield caption").toBeDefined();
      expect(cap!.tSec).toBeLessThan(rev.tSec);
      expect(Math.abs(at(cap!.tSec).speedKmh), "shown at rest").toBe(0);
      expect(Math.hypot(at(cap!.tSec).x - st.x, at(cap!.tSec).y - st.y), "at the setup").toBeLessThan(0.01);
      const look = t.events.find((e) => e.kind === "glance-right" && e.tSec >= cap!.tSec - 1e-6 && e.tSec < rev.tSec);
      expect(look, "the look right before the reverse").toBeDefined();
    });

    it(`${l}: (3)(4) the instructions teach the start and its duty before the move, and the lesson cites чл. 35, ал. 2 and чл. 40 by retrieval`, () => {
      const sp = spec(l);
      const ins = (n: number) => sp.instructionsBg.find((i) => i.n === n)!.textBg;
      // the right half past the row first (CP2-1quater), the left half only for the swing's start, and only once it is clear ahead
      expect(ins(2)).toMatch(/покрай реда остани в дясната половина на алеята\./u);
      expect(ins(2)).toMatch(/Замахът започва от лявата половина — чак накрая, щом е свободна напред/u);
      expect(ins(3)).toMatch(/пропусни всеки, който минава отдясно/u);
      expect(sp.teach.lawRef).toMatch(/чл\. 35, ал\. 2/u);
      expect(sp.teach.lawRef).toMatch(/чл\. 40/u);
      const zdvp = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "law", "acts", "zdvp.json"), "utf-8")) as { units: Array<{ textBg?: string }> };
      const art = (p: string) => {
        const u = zdvp.units.find((x) => (x.textBg ?? "").startsWith(p));
        if (!u) throw new Error(`zdvp.json: ${p} not found`);
        return u.textBg ?? "";
      };
      expect(art("Чл. 35.")).toContain(
        "завиването може да започне и от друга част на платното за движение, но водачът на завиващото превозно средство е длъжен да пропусне пътните превозни средства, преминаващи от дясната му страна.",
      );
      expect(art("Чл. 40.")).toContain("(1) Преди да започне движение назад, водачът е длъжен да се убеди, че пътят зад превозното средство е свободен");
    });

    it(`${l}: the keep-right census files both left-half sentences under ал. 2 with the measured figures`, () => {
      const census = JSON.parse(readFileSync(CENSUS_FIXTURE, "utf-8")) as { sentences: Record<string, { class: string; why?: string }> };
      const t = committed(l, "shadow-correct");
      const metres = leftHalfBeforeReverse(t.samples).toFixed(2);
      const shown = [...spec(l).instructionsBg.map((i) => i.textBg), ...t.events.filter((e) => e.kind === "annotation").map((e) => e.textBg ?? "")].join(" ");
      const leftHalf = Object.keys(census.sentences).filter((k) => shown.includes(k) && /лявата половина|отляво/u.test(k));
      expect(leftHalf.length, leftHalf.join(" | ")).toBe(2);
      for (const k of leftHalf) {
        const e = census.sentences[k];
        expect(e.class, k).toBe("other");
        expect(e.why ?? "", k).toMatch(/^ЗДвП чл\. 35 ал\. 2 \(retrieved\): радиусът на завиване > радиуса на завоя \(measured: /u);
        expect(e.why ?? "", `${k}: the ruled programme and floor`).toContain("4.6 m programme with the 0.25 m demo floor");
        expect(e.why ?? "", `${k}: the full-lock limit, as a recorded fact`).toContain(fullLockM);
        expect(e.why ?? "", `${k}: the left-half distance the trace measures`).toContain(`the move left is the turn's start (${metres} m`);
        expect(e.why ?? "", `${k}: the two-stage minimum`).toContain(`two-stage minimum ${twoMin().leftM.toFixed(2)} m`);
        expect(e.why ?? "", k).toContain("the yield duty stated");
        expect(e.why ?? "", k).toContain(l);
        // C2 (round 5): the reason states the measured overlap of the right-half swings, read from it and re-measured —
        // never a claim about where an unramped circle lands
        const ov = /overlaps dret_90#2 by at least (\d\.\d{3}) m on the recorded pose and (\d\.\d{3}) m on the bicycle pose/u.exec(e.why ?? "");
        expect(ov, `${k}: the measured overlap`).not.toBeNull();
        const sw = rightHalfSwings(l);
        expect(Math.abs(Number(ov![1]) + sw.rec), `${k}: recorded ${(-sw.rec).toFixed(3)}`).toBeLessThan(6e-4);
        expect(Math.abs(Number(ov![2]) + sw.bike), `${k}: bicycle ${(-sw.bike).toFixed(3)}`).toBeLessThan(6e-4);
        expect(e.why ?? "", k).not.toMatch(/lands past the tightest rung's tolerance/u);
      }
      // the right half past the row — instruction 2's first sentence and the S1 caption — is the keep-right duty where it binds
      const rightHalf = Object.keys(census.sentences).filter((k) => shown.includes(k) && /остани в дясната половина на алеята/u.test(k));
      expect(rightHalf.length, rightHalf.join(" | ")).toBe(2);
      for (const k of rightHalf) expect(census.sentences[k].class, k).toBe("duty");
    });

    // r5 C2, ruled at integration (CP2-1quinquies, 2026-11-09): the census reasons' clearance and floor-line figures
    // were read by no pin (the r5 verifier's surviving mutants MW2 / MW3). Each is read from its reason here and
    // compared with the pin's own re-measure within 0.01 m — as the overlap figures above are.
    it(`${l}: the keep-right census reasons' clearance and floor-line figures are read from them and re-measured (r5 C2)`, () => {
      const census = JSON.parse(readFileSync(CENSUS_FIXTURE, "utf-8")) as { sentences: Record<string, { class: string; why?: string }> };
      const t = committed(l, "shadow-correct");
      const S = t.samples;
      const shown = [...spec(l).instructionsBg.map((i) => i.textBg), ...t.events.filter((e) => e.kind === "annotation").map((e) => e.textBg ?? "")].join(" ");
      const m = twoMin();
      const bx = boxes(l);
      const rev = S.findIndex((q) => q.gear < 0);
      const setUp = S.slice(0, rev).filter((q) => q.y > g.s1EndY + 0.1);
      const line = setUp.filter((q) => q.y < g.s2FromY - 0.1);
      const swing = setUp.filter((q) => q.y >= g.s2FromY);
      expect(line.length).toBeGreaterThan(20);
      expect(swing.length).toBeGreaterThan(20);
      const lineC = minClearance(line, bx);
      const swingC = minClearance(swing, bx);
      const setUpC = minClearance(setUp, bx);
      // the set-up drive past S1 binds in S2's tail swing, not on the straight line past the row
      expect(setUpC.m, `the set-up drive binds in S2's swing: ${setUpC.m.toFixed(3)} m at ${setUpC.atSec.toFixed(2)} s`).toBeCloseTo(swingC.m, 9);
      expect(lineC.m, `the line past the row ${lineC.m.toFixed(3)} m vs S2's swing ${swingC.m.toFixed(3)} m`).toBeGreaterThan(swingC.m);
      // the built path's own clearance on the line (the three poses, the pin's two-stage path) agrees
      const built = m.clear(g.xm);
      expect(Math.abs(built.m - swingC.m), `built line x ${g.xm}: ${built.m.toFixed(3)} m to ${built.model} #${built.index}`).toBeLessThan(0.01);
      const col = l === "sc-park-perp-rev" ? 1 : 2;
      const near = (stated: string, measured: number, what: string) =>
        expect(Math.abs(Number(stated) - measured), `${what}: stated ${stated}, measured ${measured.toFixed(3)}`).toBeLessThan(0.01);
      // the duty reason (instruction 2's first sentence and the S1 caption share it)
      const rightHalf = Object.keys(census.sentences).filter((k) => shown.includes(k) && /остани в дясната половина на алеята/u.test(k));
      expect(rightHalf.length, rightHalf.join(" | ")).toBe(2);
      for (const k of rightHalf) {
        const why = census.sentences[k].why ?? "";
        const ln = /the straight line past the row keeps (\d\.\d{3}) m \(sc-park-perp-rev\) \/ (\d\.\d{3}) m \(sc-park-narrow\)/u.exec(why);
        const sw = /the set-up drive keeps ≥ (\d\.\d{3}) m \(sc-park-perp-rev\) \/ ≥ (\d\.\d{3}) m \(sc-park-narrow\) in S2's tail swing/u.exec(why);
        const fl = /inside the floor's own line \(x (\d\.\d{3}) \(sc-park-perp-rev\) \/ (\d\.\d{3}) \(sc-park-narrow\)\)/u.exec(why);
        expect(ln, `${k}: the straight line's clearance`).not.toBeNull();
        expect(sw, `${k}: S2's tail-swing clearance`).not.toBeNull();
        expect(fl, `${k}: the floor's own line`).not.toBeNull();
        near(ln![col], lineC.m, `${k}: the line past the row (${lineC.model} #${lineC.index})`);
        near(sw![col], swingC.m, `${k}: S2's tail swing (${swingC.model} #${swingC.index})`);
        expect(swingC.m, `${k}: «keeps ≥»`).toBeGreaterThanOrEqual(Number(sw![col]) - 5e-4);
        near(fl![col], m.xmMax, `${k}: the floor's own line`);
        expect(why, `${k}: no clearance figure placed «on the line x 1.2»`).not.toMatch(/on the line x 1\.2, \d/u);
      }
      // the ал. 2 reasons: «… over every right-half line the 0.25 m floor allows (to x N)»
      const leftHalf = Object.keys(census.sentences).filter((k) => shown.includes(k) && /лявата половина|отляво/u.test(k));
      expect(leftHalf.length, leftHalf.join(" | ")).toBe(2);
      for (const k of leftHalf) {
        const to = /every right-half line the 0\.25 m floor allows \(to x (\d\.\d{3})\)/u.exec(census.sentences[k].why ?? "");
        expect(to, `${k}: the floor's own line`).not.toBeNull();
        near(to![1], m.xmMax, `${k}: the floor's own line`);
      }
    });
  }
});
