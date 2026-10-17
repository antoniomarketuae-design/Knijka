/**
 * catalogue-demo-curvature:dae908c7, family «curvdepth» — THE NINE PARKING-DEPTH
 * LESSONS' DEMOS ARE DRIVES THE PRODUCT CAR CAN PERFORM, the correct ones
 * complete the lesson they demonstrate, and each mistake demo commits its own
 * mistake and no other.
 *
 * THE ROW. The committed demos of these nine lessons turned tighter than the
 * car can: the correct drives on 2.55–3.82 m, seventeen mistake drives on
 * 0.51–3.82 m, against a car whose tightest body-centre circle is 3.955 m
 * (kinematic) and ≈ 4.17 m on the physics car. A student copying the ghost was
 * shown a path no wheel setting produces. The recipe is sc-park-bay-exit-rev's
 * (./sc-park-bay-exit-rev-drivable.test.ts, 8579f1d); this is the same pin for
 * the family authored in traces/scParkDepth.ts.
 *
 * WHAT IS PINNED (the numbered blocks below):
 *
 *  1. THE LIMIT, derived: the kinematic bicycle circle from the vehicle model,
 *     the physics car's own full-lock reverse circle measured here, and the
 *     radius the trace module authors at — ≥ 1.05 × the larger of the two.
 *  2. EVERY ONE OF THE 27 COMMITTED DEMOS — the file the product plays — never
 *     turns tighter than 1.05 × the limit over any metre of travel, never jumps
 *     its heading, and is at rest for ≥ 0.9 s wherever the gear changes.
 *  3. EACH CORRECT DEMO is steerable (the real car on this path never needs a
 *     rear-axle radius under 1.05 × its own), keeps ≥ 0.25 m from every parked
 *     car, the van and the wall as the PRODUCT's boxes see them — for the
 *     recorded pose, for the real car's pose, AND for a car that starts square
 *     at the spawn and steers within its lock through every stop — and comes to
 *     rest in its graded bay inside the tightest rung's tolerance.
 *  4. THE REFERENCE POINTS THE CAPTIONS NAME are the ones the drive passes.
 *  5. ON THE LIVE RUNG CHAIN (liveChainReplay, L1–L5) each correct demo ticks
 *     both tasks in order with 0 т., no bill, no teach card and NO COACHING
 *     CARD — the old demos all drew «Стигна точката, но твърде бързо».
 *  6. EACH MISTAKE DEMO commits exactly its template's codeRefs at every rung,
 *     by touching exactly the one body its explanation names (or by its
 *     scripted consequence), and is never passed.
 *
 * ROUND 2 (the integrator's decisions D1–D7 of 2026-10-12) added:
 *  D1. a contact a demo is SAID to make happens on the body the LIVE scene
 *      mounts as well as on the gate's rect: it is cut and pinned against the
 *      per-axis SMALLER of the two, and the live chain is run on each box set
 *      ALONE — the named body, and only it, is touched on both;
 *  D3. the short and the night slot are parked in two moves (reverse, one
 *      forward correction) — the examiner's «без повече от една корекция»;
 *  D4/D5. the hidden-pedestrian car is PARKED (parallel, in the slot, inside
 *      the five metres), and the blind crossing is met past the aisle's
 *      centre line;
 *  D6. every mistake demo keeps ≥ 0.25 m from every body it is NOT about, on
 *      the envelope;
 *  D7. what the captions teach is what the ghost does: every look a «Спри …
 *      погледни» caption names, the indicator's side, and a reversing pace
 *      under the product's own rear cue's „moving" speed.
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
import { DRIVABLE_MIN_CENTRE_RADIUS_M } from "../drivablePath";
import { parseScenarioTrace } from "../parse";
import {
  PARK_DEPTH_DRILLS,
  PARK_DEPTH_GEOMETRY,
  PARK_DEPTH_LIVE_HALF,
  recordScParkDepthDrive,
  type ParkDepthDrillId,
} from "../scParkDepth";
import type { ScenarioTrace, TraceSample } from "../types";
import { KINEMATIC_CENTRE_RADIUS_M, windowedMinRadius } from "./demoCurvature";
import {
  bicycleOnPath,
  driveFromSquare,
  GLB_HALF,
  heroBox,
  KIN_REAR_RADIUS_M,
  minClearance,
  productBoxSets,
  REAR_AXLE_M,
  wrap180,
  type ProductBox,
  type ProductBoxSets,
} from "./parkDepthProduct";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];

/** The nine drills of the row (sc-park-gap-long was never an offender). */
const DRILLS = [
  "sc-park-gap-short",
  "sc-park-van",
  "sc-park-45-rev",
  "sc-park-left",
  "sc-park-zebra",
  "sc-park-wall",
  "sc-park-night",
  "sc-park-double",
  "sc-park-judge",
] as const satisfies readonly ParkDepthDrillId[];
type Drill = (typeof DRILLS)[number];

const RADIUS_MARGIN = 1.05;
const CLEARANCE_FLOOR_M = 0.25;
/** How far a car that starts square may stray from the ghost's centre line, m. */
const TRACK_OFFSET_CEILING_M = 0.3;

const districts = new Map<Drill, unknown>(
  DRILLS.map((id) => [
    id,
    JSON.parse(
      readFileSync(path.join(REPO_ROOT, "content", "world", `${PARK_DEPTH_DRILLS[id].districtId}.json`), "utf-8"),
    ) as unknown,
  ]),
);
const boxSets = new Map<Drill, ProductBoxSets>(DRILLS.map((id) => [id, productBoxSets(districts.get(id), id)]));
/** The envelope — the standard every clearance is kept on. */
const boxes = new Map<Drill, ProductBox[]>(DRILLS.map((id) => [id, boxSets.get(id)!.envelope]));

/** The COMMITTED trace — the file the product plays, not a fresh recording. */
function committed(drill: Drill, name: string): ScenarioTrace {
  const t = parseScenarioTrace(
    JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", drill, `${name}.trace.json`), "utf-8")),
  );
  if (t === null) throw new Error(`${drill}/${name}: unparseable committed trace`);
  return t;
}
const demoNames = (drill: Drill): string[] => Object.keys(PARK_DEPTH_DRILLS[drill].traces);
const spec = (drill: Drill): ScenarioSpec => {
  const s = scenarioById(drill);
  if (!s) throw new Error(`no template ${drill}`);
  return s;
};

// ---------------------------------------------------------------------------
// 1. The car's limit — from the vehicle model, never typed in
// ---------------------------------------------------------------------------

let physCentreRadiusM = Number.NaN;

/** Full-lock REVERSE circle of the headless VehicleSim at walking pace — the
 *  sc-park-bay-exit-rev pin's measurement, by value. Body-centre radius = path
 *  bbox / 4. */
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

describe("curvdepth — the car's turning limit, and the circle the demos are authored on", () => {
  it("kinematic 3.955 m; the physics car's reverse circle is wider and is the binding limit", () => {
    expect(KINEMATIC_CENTRE_RADIUS_M).toBeCloseTo(3.955, 3);
    expect(KIN_REAR_RADIUS_M).toBeCloseTo(3.742, 3);
    expect(physCentreRadiusM).toBeGreaterThan(KINEMATIC_CENTRE_RADIUS_M);
    expect(physCentreRadiusM).toBeLessThan(4.6);
    expect(limitCentreRadius()).toBe(physCentreRadiusM);
  });

  it("every drill authors at ≥ 1.05 × that limit: 4.6 m, and 4.5 m in the one corridor that needs it", () => {
    expect(PARK_DEPTH_GEOMETRY.minCentreRadiusM).toBe(DRIVABLE_MIN_CENTRE_RADIUS_M);
    for (const drill of DRILLS) {
      const r = PARK_DEPTH_GEOMETRY.radiusM[drill];
      expect(r, drill).toBeGreaterThanOrEqual(RADIUS_MARGIN * limitCentreRadius());
      expect(r, drill).toBe(drill === "sc-park-double" ? 4.5 : 4.6);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Every committed demo is a path the car can drive
// ---------------------------------------------------------------------------

describe("curvdepth — all 27 committed demos: curvature, continuity, at rest where the gear changes", () => {
  for (const drill of DRILLS) {
    for (const name of demoNames(drill)) {
      it(`${drill}/${name}`, () => {
        const samples = committed(drill, name).samples;
        // CURVATURE — the census's own measure, with the pin's margin.
        const worst = windowedMinRadius(samples);
        expect(
          worst.radiusM,
          `tightest ${worst.radiusM.toFixed(3)} m at t=${worst.atSec.toFixed(2)} s vs limit ${limitCentreRadius().toFixed(3)} m`,
        ).toBeGreaterThanOrEqual(RADIUS_MARGIN * limitCentreRadius());
        // CONTINUITY — and a real stop at every gear change.
        let changes = 0;
        for (let i = 1; i < samples.length; i++) {
          const jump = Math.abs(wrap180(samples[i].headingDeg - samples[i - 1].headingDeg));
          expect(jump, `heading jump at t=${samples[i].tSec.toFixed(2)}`).toBeLessThanOrEqual(3);
          if (samples[i].gear !== samples[i - 1].gear) {
            changes++;
            expect(Math.abs(samples[i - 1].speedKmh), `gear change at t=${samples[i].tSec}`).toBeLessThan(0.05);
            expect(Math.abs(samples[i].speedKmh), `gear change at t=${samples[i].tSec}`).toBeLessThan(1);
            const restFrom = samples.findLastIndex((s, k) => k < i && Math.abs(s.speedKmh) >= 0.05);
            expect(samples[i - 1].tSec - samples[restFrom + 1].tSec, `rest at t=${samples[i].tSec}`).toBeGreaterThanOrEqual(0.9);
          }
        }
        // A reverse-park demo changes gear; a forward-only one never does.
        const reverses = samples.some((s) => s.gear < 0);
        expect(changes > 0).toBe(reverses);
        // THE GHOST'S WHEEL DOES NOT FLICKER. The recorder estimates the wheel
        // from the heading change between two frames; on chords longer than a
        // frame's travel it reads 0 on the frames that cross no vertex, and the
        // ghost's front wheels snap straight in the middle of a held turn
        // (./drivablePath PATH_DS_M). A sample between two turned ones is turned.
        for (let i = 1; i < samples.length - 1; i++) {
          const a = samples[i - 1].steerRad;
          const b = samples[i].steerRad;
          const c = samples[i + 1].steerRad;
          const moving = [samples[i - 1], samples[i], samples[i + 1]].every(
            (q) => Math.abs(q.speedKmh) > 1.8 && q.gear === samples[i].gear,
          );
          if (moving && Math.abs(a) > 0.15 && Math.abs(c) > 0.15 && Math.sign(a) === Math.sign(c)) {
            expect(Math.abs(b), `wheel snaps straight at t=${samples[i].tSec.toFixed(2)}`).toBeGreaterThanOrEqual(
              0.5 * Math.min(Math.abs(a), Math.abs(c)),
            );
            expect(Math.sign(b)).toBe(Math.sign(a));
          }
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 3. Each correct demo: steerable, clear of every body, and it ends in the bay
// ---------------------------------------------------------------------------

/** The gears the manoeuvre is made in, after the forward approach. */
const SHADOW_GEARS: Record<Drill, number[]> = {
  "sc-park-gap-short": [-1, 1],
  "sc-park-van": [-1],
  "sc-park-45-rev": [-1],
  "sc-park-left": [-1],
  "sc-park-zebra": [-1, 1],
  "sc-park-wall": [-1],
  "sc-park-night": [-1, 1],
  "sc-park-double": [-1],
  "sc-park-judge": [-1, 1],
};

describe("curvdepth — each correct demo is a drive the product car can perform", () => {
  for (const drill of DRILLS) {
    const samples = committed(drill, "shadow-correct").samples;
    const bike = bicycleOnPath(samples);
    const driven = driveFromSquare(samples);
    const bx = boxes.get(drill)!;

    it(`${drill}: STEERABILITY — the real car on this path never needs a rear-axle radius under 1.05 × its own`, () => {
      let worst = { r: Infinity, t: 0 };
      for (const p of bike) if (p.rearRadiusM < worst.r) worst = { r: p.rearRadiusM, t: p.tSec };
      expect(
        worst.r,
        `tightest rear radius ${worst.r.toFixed(3)} m at t=${worst.t.toFixed(2)} s vs ${limitRearRadius().toFixed(3)} m`,
      ).toBeGreaterThanOrEqual(RADIUS_MARGIN * limitRearRadius());
      // The recorder's tangent model is not a different manoeuvre.
      let slip = 0;
      for (let i = 0; i < samples.length; i++) {
        slip = Math.max(slip, Math.abs(wrap180(samples[i].headingDeg - bike[i].headingDeg)));
      }
      expect(slip).toBeLessThan(25);
    });

    it(`${drill}: CLEARANCE ≥ 0.25 m — the recorded pose, the real car's pose, and a car that starts square and steers`, () => {
      const rec = minClearance(samples, bx);
      const real = minClearance(bike, bx);
      const drv = minClearance(driven, bx);
      const say = (c: typeof rec) => `${c.m.toFixed(3)} m at t=${c.atSec.toFixed(2)} (${c.model} #${c.index})`;
      expect(rec.m, `recorded pose: ${say(rec)}`).toBeGreaterThanOrEqual(CLEARANCE_FLOOR_M);
      expect(real.m, `bicycle pose: ${say(real)}`).toBeGreaterThanOrEqual(CLEARANCE_FLOOR_M);
      expect(drv.m, `driven from square: ${say(drv)}`).toBeGreaterThanOrEqual(CLEARANCE_FLOOR_M);
    });

    it(`${drill}: a car that starts square at the spawn stays within ${TRACK_OFFSET_CEILING_M} m of the ghost, on its own lock`, () => {
      let off = { m: 0, t: 0 };
      for (const p of driven) {
        if (p.offM > off.m) off = { m: p.offM, t: p.tSec };
        expect(Math.abs(p.kappa)).toBeLessThanOrEqual(1 / KIN_REAR_RADIUS_M + 1e-12);
      }
      expect(off.m, `strays ${off.m.toFixed(3)} m at t=${off.t.toFixed(2)}`).toBeLessThanOrEqual(TRACK_OFFSET_CEILING_M);
      // …and it ARRIVES where the ghost comes to rest: within 0.2 m and 4° of
      // it — a body that has to follow its own rear axle does not land on a
      // ghost to the centimetre — and INSIDE the graded bay's tightest tolerance.
      const last = driven[driven.length - 1];
      const ghost = samples[samples.length - 1];
      expect(last.offM, "rest offset").toBeLessThanOrEqual(0.2);
      expect(Math.abs(wrap180(last.headingDeg - ghost.headingDeg)), "rest heading").toBeLessThanOrEqual(4);
      const s = spec(drill);
      const park = s.success[s.success.length - 1].params;
      if (park.kind !== "completeManeuver" || park.maneuver !== "parkInBay") throw new Error("terminal is not parkInBay");
      const tightest = Math.min(...s.levels.map((l) => l.toleranceScale ?? 1));
      expect(Math.hypot(last.x - park.bay.x, last.y - park.bay.y)).toBeLessThan(park.centerTolM * tightest);
      const diff = Math.abs(wrap180(last.headingDeg - park.bay.headingDeg));
      expect(Math.min(diff, 180 - diff)).toBeLessThan(park.headingTolDeg * tightest);
    });

    it(`${drill}: gears ${SHADOW_GEARS[drill].join(" → ")} after the approach, and rests in its graded bay inside the tightest rung's tolerance`, () => {
      const changes = samples.filter((s, i) => i > 0 && s.gear !== samples[i - 1].gear).map((s) => s.gear);
      expect(changes).toEqual(SHADOW_GEARS[drill]);
      const s = spec(drill);
      const park = s.success[s.success.length - 1].params;
      if (park.kind !== "completeManeuver" || park.maneuver !== "parkInBay") throw new Error("terminal is not parkInBay");
      const tightest = Math.min(...s.levels.map((l) => l.toleranceScale ?? 1));
      const last = samples[samples.length - 1];
      expect(Math.hypot(last.x - park.bay.x, last.y - park.bay.y)).toBeLessThan(park.centerTolM * tightest);
      const diff = Math.abs(wrap180(last.headingDeg - park.bay.headingDeg));
      expect(Math.min(diff, 180 - diff)).toBeLessThan(park.headingTolDeg * tightest);
      expect(Math.abs(last.speedKmh)).toBe(0);
      expect(last.brakeOn).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. The reference points the captions name
// ---------------------------------------------------------------------------

describe("curvdepth — the reference points the demos name are the ones they drive", () => {
  it("every setup stop is inside its template's Задача 1 zone at the tightest radius, and is where the trace stops", () => {
    for (const drill of DRILLS) {
      const s = spec(drill);
      const samples = committed(drill, "shadow-correct").samples;
      const setup = PARK_DEPTH_GEOMETRY.setup[drill];
      // The last forward stop before the first reverse sample.
      const firstRev = samples.findIndex((p) => p.gear < 0);
      const stop = samples[firstRev - 1];
      expect(Math.hypot(stop.x - setup.x, stop.y - setup.y), drill).toBeLessThan(0.01);
      expect(Math.abs(wrap180(stop.headingDeg)), drill).toBeLessThan(0.01);
      // sc-park-judge's Задача 1 is the ASSESS stop at the short slot, not the setup.
      const zone = s.success[0].params;
      if (zone.kind !== "reachZone") throw new Error(`${drill}: Задача 1 is not a reachZone`);
      if (drill === "sc-park-judge") {
        const halts = samples.filter((p) => p.speedKmh === 0 && Math.hypot(p.x - zone.x, p.y - zone.y) < 0.05);
        expect(halts.length, "judge assess halt").toBeGreaterThan(10);
      } else {
        expect(Math.hypot(setup.x - zone.x, setup.y - zone.y), drill).toBeLessThan(zone.radiusM - 2);
      }
    }
  });

  it("the kerb-side drills stop with rear bumpers level, roll straight back, and swing to the angle the caption says", () => {
    // Rear bumper of the lead car (bay centre + pitch, GLB or table length) vs the hero's.
    const lead: Record<string, number> = {
      "sc-park-gap-short": 5.9,
      "sc-park-zebra": 18.25,
      "sc-park-night": 19.5,
      "sc-park-judge": 14.4,
    };
    for (const drill of ["sc-park-gap-short", "sc-park-zebra", "sc-park-night", "sc-park-judge"] as const) {
      const setup = PARK_DEPTH_GEOMETRY.setup[drill];
      const leadBox = boxes.get(drill)!.find((b) => b.y === lead[drill])!;
      const leadRear = leadBox.y - leadBox.halfLengthM;
      const heroRear = setup.y - T.CHASSIS_HALF_EXTENTS.z;
      expect(Math.abs(heroRear - leadRear), `${drill} bumpers`).toBeLessThan(0.06);
      // 0.25 m ≤ the gap to the lead car's flank ≤ 0.75 m («на половин метър»).
      const gap = leadBox.x - leadBox.halfWidthM - (setup.x + T.CHASSIS_HALF_EXTENTS.x);
      expect(gap, `${drill} flank`).toBeGreaterThanOrEqual(0.25);
      expect(gap, `${drill} flank`).toBeLessThanOrEqual(0.75);
      expect(PARK_DEPTH_GEOMETRY.kerb[drill].rollBackM, `${drill} roll back`).toBeGreaterThanOrEqual(0.7);
    }
    // «под около 40°» (gap-short, night, judge) · «под около 35°» (zebra).
    const swing = (d: "sc-park-gap-short" | "sc-park-zebra" | "sc-park-night" | "sc-park-judge") =>
      PARK_DEPTH_GEOMETRY.kerb[d].swingDeg;
    expect(Math.abs(swing("sc-park-gap-short") - 40)).toBeLessThan(2.5);
    expect(Math.abs(swing("sc-park-zebra") - 35)).toBeLessThan(2.5);
    expect(Math.abs(swing("sc-park-night") - 40)).toBeLessThan(2.5);
    expect(Math.abs(swing("sc-park-judge") - 40)).toBeLessThan(2.5);
    // …and what the trace turns through at reference point 2 is that angle.
    for (const drill of ["sc-park-gap-short", "sc-park-zebra", "sc-park-night", "sc-park-judge"] as const) {
      const samples = committed(drill, "shadow-correct").samples;
      const rev = samples.filter((p) => p.gear < 0);
      const most = Math.max(...rev.map((p) => -wrap180(p.headingDeg)));
      expect(Math.abs(most - swing(drill)), drill).toBeLessThan(0.3);
    }
  });

  it("gap-short and night: ONE correction — the reverse stops short of parallel, one pull forward ends parallel, and «с повече от метър пред и зад теб»", () => {
    // teach.examinerBg (gap-short): «в очертанията, успоредно, без повече от
    // една корекция». After the setup: one reverse (the S), one forward pull,
    // nothing after it (SHADOW_GEARS pins the sequence; this pins its shape).
    for (const [drill, shortDeg, maxPullM] of [
      ["sc-park-gap-short", 7.5, 1.6],
      ["sc-park-night", 7, 1.9],
    ] as const) {
      const samples = committed(drill, "shadow-correct").samples;
      const firstFwd = samples.findIndex((q, i) => i > 0 && q.gear === 1 && samples[i - 1].gear === -1);
      const bottom = samples[firstFwd - 1];
      // «колата още стои леко накосо»: nose-out by the authored amount.
      expect(wrap180(bottom.headingDeg), `${drill} bottom`).toBeCloseTo(-shortDeg, 0);
      expect(PARK_DEPTH_GEOMETRY.kerb[drill].shortDeg).toBe(shortDeg);
      let pull = 0;
      for (let i = firstFwd + 1; i < samples.length; i++) {
        pull += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
      }
      expect(pull, `${drill} pull`).toBeLessThan(maxPullM);
      expect(samples.slice(firstFwd).every((q) => q.gear === 1), `${drill}: nothing after the pull`).toBe(true);
      const last = samples[samples.length - 1];
      expect(Math.abs(wrap180(last.headingDeg)), `${drill} parallel`).toBeLessThan(0.5);
    }
    // gap-short's last caption: «с повече от метър пред и зад теб» — on each
    // real box (the gate's rect and the live collider), not only on one.
    const samples = committed("sc-park-gap-short", "shadow-correct").samples;
    const last = samples[samples.length - 1];
    for (const set of ["gate", "live", "envelope"] as const) {
      const bx = boxSets.get("sc-park-gap-short")![set];
      const front = bx.find((b) => b.y === 5.9)!;
      const rear = bx.find((b) => b.y === -5.9)!;
      const ahead = front.y - front.halfLengthM - (last.y + T.CHASSIS_HALF_EXTENTS.z);
      const behind = last.y - T.CHASSIS_HALF_EXTENTS.z - (rear.y + rear.halfLengthM);
      expect(ahead, `${set} ahead`).toBeGreaterThan(1.0);
      expect(behind, `${set} behind`).toBeGreaterThan(1.0);
      // …and in the slot, not at one end of it.
      expect(Math.abs(ahead - behind), `${set} balance`).toBeLessThan(0.75);
    }
    // «Ориентир 1: … на половин метър»: the setup's flank gap to the lead car.
    const setup = PARK_DEPTH_GEOMETRY.setup["sc-park-gap-short"];
    const lead = boxSets.get("sc-park-gap-short")!.live.find((b) => b.y === 5.9)!;
    expect(lead.x - lead.halfWidthM - (setup.x + T.CHASSIS_HALF_EXTENTS.x)).toBeCloseTo(0.5, 1);
  });

  it("van: «на два метра от носа на буса», and the car rests no nearer the van than the other neighbour", () => {
    const bx = boxes.get("sc-park-van")!;
    const van = bx.find((b) => b.model === "kargo_v")!;
    const setup = PARK_DEPTH_GEOMETRY.setup["sc-park-van"];
    const toNose = van.x - van.halfLengthM - (setup.x + T.CHASSIS_HALF_EXTENTS.x);
    expect(toNose).toBeGreaterThan(1.9);
    expect(toNose).toBeLessThan(2.2);
    const samples = committed("sc-park-van", "shadow-correct").samples;
    const last = samples[samples.length - 1];
    const other = bx.find((b) => b.y === 2.7)!;
    const toVan = obbSeparationM(heroBox(last.x, last.y, last.headingDeg), van);
    const toOther = obbSeparationM(heroBox(last.x, last.y, last.headingDeg), other);
    expect(toVan).toBeGreaterThanOrEqual(toOther - 0.01);
    expect(toVan).toBeGreaterThan(0.7);
  });

  it("zebra, the slot before the crossing: the hidden-pedestrian car is PARKED — parallel, in the slot, all of it inside the five metres before the paint", () => {
    // markings.ts paints the zebra y ∈ [−3, +3]; чл. 98 ал. 1 т. 5's five
    // metres run y ∈ [−8, −3]; the slot is bay 2, x ∈ [5.03, 7.53].
    const samples = committed("sc-park-zebra", "mistake-hidden-pedestrian").samples;
    // The parked rest: the end of the reverse into the slot.
    const lastRev = samples.findLastIndex((q) => q.gear < 0);
    expect(samples[lastRev].speedKmh).toBe(0);
    // The whole rest the reverse ends in (contiguous speed 0 around lastRev).
    let i0 = lastRev;
    while (i0 > 0 && samples[i0 - 1].speedKmh === 0) i0--;
    let i1 = lastRev;
    while (i1 + 1 < samples.length && samples[i1 + 1].speedKmh === 0) i1++;
    const rest = samples[i0];
    const restSec = samples[i1].tSec - rest.tSec;
    expect(restSec, "parked, not paused").toBeGreaterThanOrEqual(2.5);
    expect(Math.abs(wrap180(rest.headingDeg)), "parallel").toBeLessThan(0.5);
    const h = (rest.headingDeg * Math.PI) / 180;
    const corners = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ].map(([f, r]) => ({
      x: rest.x + f * T.CHASSIS_HALF_EXTENTS.z * Math.sin(h) + r * T.CHASSIS_HALF_EXTENTS.x * Math.cos(h),
      y: rest.y + f * T.CHASSIS_HALF_EXTENTS.z * Math.cos(h) - r * T.CHASSIS_HALF_EXTENTS.x * Math.sin(h),
    }));
    const nose = Math.max(...corners.map((c) => c.y));
    const tail = Math.min(...corners.map((c) => c.y));
    expect(nose, "short of the paint").toBeLessThanOrEqual(-3);
    expect(nose, "«плътно преди пътеката»").toBeGreaterThan(-3.6);
    expect(tail, "all of it inside the five metres").toBeGreaterThan(-8);
    for (const c of corners) {
      expect(c.x, "inside the slot's lines").toBeGreaterThanOrEqual(5.03);
      expect(c.x, "inside the slot's lines").toBeLessThanOrEqual(7.53);
    }
    // …and it never STOPPED on the paint on its way in: the only rest that
    // may touch the paint is the one after the hit.
    for (const q of samples.slice(0, lastRev + 1)) {
      if (q.speedKmh !== 0) continue;
      const hh = (q.headingDeg * Math.PI) / 180;
      const ys = [1, -1].map((f) => q.y + f * T.CHASSIS_HALF_EXTENTS.z * Math.cos(hh));
      const onPaint = Math.max(...ys) > -3 && Math.min(...ys) < 3;
      expect(onPaint, `rest on the paint at t=${q.tSec.toFixed(2)}`).toBe(false);
    }
    // The card: «воланът тръгна два метра по-рано» (sc-park-wall, mistake-clip-neighbour)
    // is pinned beside it — the swing's own length, not a caption's.
    const early = committed("sc-park-wall", "mistake-clip-neighbour").samples;
    const stop = early[early.findIndex((p) => p.gear < 0) - 1];
    expect(PARK_DEPTH_GEOMETRY.setup["sc-park-wall"].y - stop.y).toBeCloseTo(2.0, 1);
  });

  it("double: «по средата или до педя вляво от нея», and «около метър и половина вляво от средата вече си в чуждия ред» — measured on the corridor as built", () => {
    const setup = PARK_DEPTH_GEOMETRY.setup["sc-park-double"];
    expect(setup.x).toBeLessThanOrEqual(0);
    expect(setup.x).toBeGreaterThanOrEqual(-0.25);
    // The corridor's centre line is x = 0: midway between the painted bay
    // mouths, bay centre ∓ bayDepth / 2 = ±2.53 (the rows are mirror images).
    const live = boxSets.get("sc-park-double")!.live;
    const west = live.filter((b) => b.x < 0);
    expect(west.length).toBe(5);
    expect(live.filter((b) => b.x > 0).every((b) => b.x === 5.03)).toBe(true);
    expect(west.every((b) => b.x === -5.03)).toBe(true);
    // Where the opposite row begins for the car's body, beside the setup: the
    // nearest west nose among the bodies alongside the car there.
    const beside = west.filter((b) => Math.abs(b.y - setup.y) < b.halfWidthM + T.CHASSIS_HALF_EXTENTS.z);
    expect(beside.length).toBeGreaterThan(0);
    const nose = Math.max(...beside.map((b) => b.x + b.halfLengthM));
    const centreWhereSideTouches = nose + T.CHASSIS_HALF_EXTENTS.x;
    // «около метър и половина» — 1.59 m (the kolos, 0.34 m longer than the bay).
    expect(-centreWhereSideTouches).toBeGreaterThan(1.4);
    expect(-centreWhereSideTouches).toBeLessThan(1.7);
    // …and a span left of the middle is NOT the opposite row (the old step 3):
    // the setup's left side keeps over a metre of air to it.
    expect(setup.x - T.CHASSIS_HALF_EXTENTS.x - nose).toBeGreaterThan(1.0);
  });
});

// ---------------------------------------------------------------------------
// 4b. What the captions teach is what the ghost does (D7)
// ---------------------------------------------------------------------------

/**
 * Every caption of a correct demo that tells the student to STOP AND LOOK, and
 * the looks it names. Each must be followed — with the car at rest — by those
 * glances in the committed trace before the car moves again. The table is
 * exhaustive: any correct-demo caption that asks for a look and is not in it
 * fails the pin, so a new «погледни» cannot ship unbacked.
 */
const LOOKS: Record<Drill, Array<{ caption: string; mirrors: Array<"left" | "right" | "rear"> }>> = {
  "sc-park-gap-short": [{ caption: "Ориентир 2: под около 40°. Спри и погледни назад", mirrors: ["rear"] }],
  "sc-park-van": [{ caption: "Спри на половината завой и погледни пак към буса", mirrors: ["right", "rear"] }],
  "sc-park-45-rev": [{ caption: "Колата легна по линиите. Спри, погледни назад", mirrors: ["rear"] }],
  "sc-park-left": [{ caption: "Спри на половината завой и погледни пак — назад и в лявото огледало", mirrors: ["left", "rear"] }],
  "sc-park-zebra": [{ caption: "Ориентир 2: колата е под около 35° към бордюра. Спри, погледни назад", mirrors: ["rear"] }],
  "sc-park-wall": [
    { caption: "Спри на половината завой и погледни назад — и в дясното огледало", mirrors: ["right", "rear"] },
  ],
  "sc-park-night": [{ caption: "Ориентир 2: под около 40° към бордюра. Спри и премери назад по огледалата", mirrors: ["right", "rear"] }],
  "sc-park-double": [{ caption: "Спри на половината завой и погледни и в двете огледала", mirrors: ["left", "right"] }],
  "sc-park-judge": [{ caption: "Под около 40° към бордюра: спри, погледни назад", mirrors: ["rear"] }],
};

/** The side of the bay each correct demo signals for (the row the bay is in). */
const SIGNAL_SIDE: Record<Drill, "left" | "right"> = {
  "sc-park-gap-short": "right",
  "sc-park-van": "right",
  "sc-park-45-rev": "right",
  "sc-park-left": "left",
  "sc-park-zebra": "right",
  "sc-park-wall": "right",
  "sc-park-night": "right",
  "sc-park-double": "right",
  "sc-park-judge": "right",
};

describe("curvdepth — what the captions teach is what the correct demo does (D7)", () => {
  for (const drill of DRILLS) {
    it(`${drill}: every «спри … погледни» caption is followed, at rest, by the looks it names`, () => {
      const t = committed(drill, "shadow-correct");
      const samples = t.samples;
      const asksForLook = (txt: string) => /(спри|Спри)[^.]*?(погледни|премери назад)/u.test(txt);
      const captions = t.events.filter((e) => e.kind === "annotation" && asksForLook(e.textBg ?? ""));
      // Exhaustive: every such caption is in the table, and every table row is shown.
      expect(captions.map((e) => LOOKS[drill].some((l) => (e.textBg ?? "").startsWith(l.caption)))).toEqual(
        captions.map(() => true),
      );
      expect(captions.length).toBe(LOOKS[drill].length);
      for (const want of LOOKS[drill]) {
        const cap = captions.find((e) => (e.textBg ?? "").startsWith(want.caption))!;
        // The recorder shows a caption as the car brakes to the stop it
        // names; the stop is the first sample at rest from there, and the
        // looks belong to that rest — up to the sample the car moves again
        // (a look and the next drive can share an instant, so inclusive).
        const restAt = samples.find((q) => q.tSec >= cap.tSec - 1e-6 && Math.abs(q.speedKmh) < 0.05);
        if (!restAt) throw new Error(`${drill}: never stops after «${want.caption}»`);
        expect(restAt.tSec - cap.tSec, `${drill}: the stop the caption names`).toBeLessThan(1.0);
        const moveAgain = samples.find((q) => q.tSec > restAt.tSec && Math.abs(q.speedKmh) > 0.05);
        if (!moveAgain) throw new Error(`${drill}: never moves after «${want.caption}»`);
        const inRest = t.events.filter(
          (e) => e.kind.startsWith("glance-") && e.tSec >= restAt.tSec - 1e-6 && e.tSec <= moveAgain.tSec + 1e-6,
        );
        const looks = inRest.map((e) => e.kind.slice("glance-".length));
        for (const m of want.mirrors) expect(looks, `${drill}: «${want.caption}» → ${m}`).toContain(m);
        for (const e of inRest) {
          // At rest when it is taken: the last sample before the look.
          const before = samples.filter((q) => q.tSec < e.tSec - 1e-6).at(-1)!;
          expect(Math.abs(before.speedKmh), `${drill}: a look taken at rest`).toBeLessThan(0.05);
        }
      }
    });

    it(`${drill}: the indicator goes on ONCE, to the ${SIGNAL_SIDE[drill]} — the bay's side — before the first reverse`, () => {
      const t = committed(drill, "shadow-correct");
      const on = t.events.filter((e) => e.kind === "signal-on");
      expect(on.map((e) => e.detail)).toEqual([SIGNAL_SIDE[drill]]);
      const firstRev = t.samples.find((q) => q.gear < 0)!;
      expect(on[0].tSec).toBeLessThan(firstRev.tSec);
      // …and the samples agree with the event the whole way to the reverse.
      for (const q of t.samples) {
        if (q.tSec > on[0].tSec + 0.05 && q.tSec < firstRev.tSec) expect(q.indicator, `t=${q.tSec.toFixed(2)}`).toBe(SIGNAL_SIDE[drill]);
      }
    });

    it(`${drill}: the indicator, once on to the ${SIGNAL_SIDE[drill]}, STAYS on until the car has entered the bay — and goes off only at rest in it`, () => {
      // Integration pin (curvdepth N4, the verifier's survivor): a correct
      // demo that switched its indicator off at the setup stop and reversed
      // into the bay with no signal passed every other pin. «Entered the bay»
      // is the first reversing sample whose centre is inside the graded bay
      // rect (the parkInBay objective's own x, y, headingDeg, widthM, lengthM;
      // heading 0 = +y, the trace's convention). What all nine author, and so
      // what is pinned past that: the one signal-off is the last indicator
      // event, taken with the car already at rest in the bay.
      const t = committed(drill, "shadow-correct");
      const s = spec(drill);
      const park = s.success[s.success.length - 1].params;
      if (park.kind !== "completeManeuver" || park.maneuver !== "parkInBay") throw new Error("terminal is not parkInBay");
      const b = park.bay;
      const h = (b.headingDeg * Math.PI) / 180;
      const inBay = (q: TraceSample): boolean => {
        const dx = q.x - b.x;
        const dy = q.y - b.y;
        const along = dx * Math.sin(h) + dy * Math.cos(h);
        const across = dx * Math.cos(h) - dy * Math.sin(h);
        return Math.abs(along) <= b.lengthM / 2 && Math.abs(across) <= b.widthM / 2;
      };
      const on = t.events.find((e) => e.kind === "signal-on");
      if (!on) throw new Error(`${drill}: never signals`);
      const entered = t.samples.find((q) => q.gear < 0 && inBay(q));
      if (!entered) throw new Error(`${drill}: never reverses into its bay rect`);
      for (const q of t.samples) {
        if (q.tSec > on.tSec + 0.05 && q.tSec <= entered.tSec) {
          expect(q.indicator, `${drill}: indicator at t=${q.tSec.toFixed(2)} (bay entered at t=${entered.tSec.toFixed(2)})`).toBe(
            SIGNAL_SIDE[drill],
          );
        }
      }
      const switches = t.events.filter((e) => (e.kind === "signal-on" || e.kind === "signal-off") && e.tSec > on.tSec);
      expect(switches.map((e) => e.kind), `${drill}: indicator events after the signal-on`).toEqual(["signal-off"]);
      const lastMove = t.samples.filter((q) => Math.abs(q.speedKmh) > 0.05).at(-1)!;
      expect(switches[0].tSec, `${drill}: the signal goes off only once the car is at rest`).toBeGreaterThan(lastMove.tSec);
      const atOff = t.samples.filter((q) => q.tSec <= switches[0].tSec + 1e-6).at(-1)!;
      expect(inBay(atOff), `${drill}: the car is in the bay when the signal goes off`).toBe(true);
    });

    it(`${drill}: reverses at a parking pace — under the product's rear cue's „moving" speed (${REAR_CUE_MOVING_KMH} km/h)`, () => {
      // DERIVATION: hud/rearProximity.ts REAR_CUE_MOVING_KMH is the speed at
      // and above which the product's reversing cue counts the car as MOVING
      // at traffic pace; its own record (RearProximityCue O61) states a
      // parking manoeuvre runs at 2–4 km/h by definition. A correct reverse
      // into a bay is therefore under it, every sample.
      const rev = committed(drill, "shadow-correct").samples.filter((q) => q.gear < 0);
      expect(rev.length).toBeGreaterThan(0);
      const worst = Math.max(...rev.map((q) => Math.abs(q.speedKmh)));
      expect(worst).toBeLessThan(REAR_CUE_MOVING_KMH);
    });
  }
});

// ---------------------------------------------------------------------------
// 5–6. The live rung chain
// ---------------------------------------------------------------------------

interface RungRun {
  out: LiveReplayOutcome;
  /** Rising-edge overlaps with the product's parked bodies: the box index. */
  contacts: number[];
  /** HUD cards of kind `lesson` — the coach's cards — by title. */
  coachCards: string[];
}

/**
 * One rung: the COMMITTED trace replayed pose by pose through the live chain.
 * Two stand-ins for the parts of the live stack that are rapier, not process:
 *  - parked bodies: a rising-edge overlap of the hero box with a product box
 *    queues the contact ScenarioObstacles would report (the wall as a static
 *    object, everything else as a vehicle). `set` picks the boxes: the
 *    envelope (default — clearance), or the live collider / the gate's rect
 *    ALONE (D1: a contact must happen on each);
 *  - a mistake demo's SCRIPTED consequence is queued at the time the recorder
 *    graded it (the trace carries poses, not contacts).
 */
function runRung(
  drill: Drill,
  name: string,
  level: ScenarioLevel,
  set: keyof ProductBoxSets = "envelope",
): RungRun {
  const lesson = compileScenario(spec(drill), level);
  const raw = districts.get(drill);
  const bx = boxSets.get(drill)![set];
  const script = PARK_DEPTH_DRILLS[drill].traces[name].script();
  const scripted = script.steps.find((s) => s.kind === "collision");
  let scriptedAt: number | null = null;
  if (scripted && scripted.kind === "collision") {
    const rec = recordScParkDepthDrive(raw, drill, name);
    const hit = rec.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION");
    scriptedAt = hit ? hit.t : null;
    if (scriptedAt === null) throw new Error(`${drill}/${name}: scripted consequence never graded`);
  }
  let scriptedSent = false;
  const touching = new Set<number>();
  const contacts: number[] = [];
  const coachCards: string[] = [];
  const out = liveChainReplay({
    lesson,
    districtRaw: raw,
    trace: committed(drill, name),
    holdAfterSec: 3,
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
      if (scripted && scripted.kind === "collision" && scriptedAt !== null && !scriptedSent && ctx.t >= scriptedAt - 1e-6) {
        scriptedSent = true;
        ctx.tick.events.push({ kind: "collision", withWhat: scripted.withWhat });
      }
    },
    afterApply: (ctx) => {
      for (const h of ctx.step.hudEvents) if (h.kind === "lesson") coachCards.push(h.titleBg);
    },
  });
  return { out, contacts, coachCards };
}

describe("curvdepth — each correct demo completes its lesson at EVERY rung, on the live chain", () => {
  for (const drill of DRILLS) {
    it(`${drill}: both tasks in order, 0 т., no bill, no contact, no teach card, no coaching card — L1 to L5`, () => {
      for (const level of LEVELS) {
        const label = `${drill} L${level}`;
        const { out, contacts, coachCards } = runRung(drill, "shadow-correct", level);
        expect(contacts, `${label} parked contact`).toEqual([]);
        expect(out.ambientContacts, label).toEqual([]);
        expect(out.result.objectives.map((o) => o.done), label).toEqual([true, true]);
        const [o1, o2] = out.result.objectives;
        expect(o1.completedAtSec!, label).toBeLessThan(o2.completedAtSec!);
        expect(out.violationCodes, label).toEqual([]);
        expect(out.result.lessonMistakes, label).toBeUndefined();
        expect(out.teachMomentCodes, label).toEqual([]);
        // The card every old demo drew: «Стигна точката, но твърде бързо».
        expect(coachCards, label).toEqual([]);
        expect(out.result.score, label).toBe(0);
        expect(out.result.passed, label).toBe(true);
        expect(out.debrief, label).toMatch(/е издържан: 0 наказателни точки/);
        // THE STARS THE STUDENT SEES under the correct demo (ruling 21: never
        // the verdict, but shown). Economy and observation full everywhere;
        // placement «Центрирано» everywhere but the short slot, whose one
        // correction cannot end within half the tolerance of the middle with a
        // quarter-metre kept (round 2, D3): there the line says what it is.
        const lines = new Map((out.rubric?.breakdownBg ?? []).map((l) => [l.id, l]));
        expect(lines.get("economy")?.points, label).toBe(2);
        expect(lines.get("observation")?.points, label).toBe(2);
        if (drill === "sc-park-gap-short") {
          expect(lines.get("placement")?.points, label).toBe(1);
          expect(lines.get("placement")?.detailBg, label).toMatch(/^В очертанията, с малко отместване/);
          expect(out.rubric?.stars, label).toBe(2);
        } else {
          expect(lines.get("placement")?.points, label).toBe(2);
          expect(out.rubric?.stars, label).toBe(3);
        }
      }
    });
  }
});

/**
 * What each mistake demo touches: the index of the ONE product body
 * (`productBoxes` order = the recorder's obstacle order), or its scripted
 * consequence, or — for the two that are not contacts — the rule it breaks.
 */
const MISTAKES: Record<Drill, Record<string, { body: number } | { scripted: "pedestrian" | "vehicle" } | { rule: string }>> = {
  "sc-park-gap-short": { "mistake-shallow-angle": { body: 1 }, "mistake-forward-hit": { body: 2 } },
  "sc-park-van": { "mistake-early-turn": { body: 3 }, "mistake-blind-reverse": { scripted: "pedestrian" } },
  "sc-park-45-rev": { "mistake-nose-in": { body: 1 }, "mistake-shallow-swing": { body: 1 } },
  "sc-park-left": { "mistake-mirrored-habit": { body: 1 }, "mistake-cross-blind": { scripted: "vehicle" } },
  "sc-park-zebra": {
    "mistake-park-after": { rule: "ILLEGAL_STOP_IN_BAN_ZONE" },
    "mistake-hidden-pedestrian": { scripted: "pedestrian" },
  },
  "sc-park-wall": { "mistake-into-wall": { body: 4 }, "mistake-clip-neighbour": { body: 3 } },
  "sc-park-night": { "mistake-no-lights": { rule: "HEADLIGHTS_OFF_AT_NIGHT" }, "mistake-too-deep": { body: 4 } },
  "sc-park-double": { "mistake-wide-run-up": { body: 4 }, "mistake-correct-backwards": { body: 7 } },
  "sc-park-judge": { "mistake-try-short": { body: 1 }, "mistake-short-forward": { body: 2 } },
};

describe("curvdepth — each mistake demo commits its own mistake at every rung, and no other", () => {
  it("the table names the bodies the explanations name", () => {
    const at = (drill: Drill, i: number) => {
      const b = boxes.get(drill)![i];
      return `${b.model}@${b.x},${b.y}`;
    };
    expect(at("sc-park-gap-short", 1)).toBe("vela_h3@6.28,-5.9"); // „колата отзад"
    expect(at("sc-park-gap-short", 2)).toBe("dret_90@6.28,5.9"); // „колата отпред"
    expect(at("sc-park-van", 3)).toBe("kargo_v@5.03,-2.7"); // „буса"
    expect(at("sc-park-45-rev", 1)).toBe("vela_h3@4.8,-3.82"); // „съседа"
    expect(at("sc-park-left", 1)).toBe("vela_h3@-5.03,-2.7");
    expect(at("sc-park-wall", 4)).toBe("wall@5.03,8.6");
    expect(at("sc-park-wall", 3)).toBe("arden_x@5.03,2.7");
    expect(at("sc-park-night", 4)).toBe("dret_90@6.28,6.5"); // „колата отзад"
    expect(at("sc-park-double", 4)).toBe("dret_90@-5.03,-5.4"); // „отсрещния ред"
    expect(at("sc-park-double", 7)).toBe("pino@-5.03,2.7"); // „отсрещния ред"
    expect(at("sc-park-judge", 1)).toBe("vela_h3@6.28,-8.4"); // „колата отзад"
    expect(at("sc-park-judge", 2)).toBe("dret_90@6.28,0.4"); // „колата отпред"
  });

  for (const drill of DRILLS) {
    const s = spec(drill);
    const names = demoNames(drill).filter((n) => n.startsWith("mistake-"));
    names.forEach((name, mi) => {
      const want = MISTAKES[drill][name];
      const codeRefs = [...s.mistakes[mi].codeRefs].sort();
      it(`${drill}/${name}: ${JSON.stringify(want)} → ${codeRefs.join(", ")}`, () => {
        // The recorder's own grade (the lamps and the night are visible only here).
        const rec = recordScParkDepthDrive(districts.get(drill), drill, name);
        const recCodes = [...new Set(rec.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code))].sort();
        expect(recCodes, "recorder").toEqual(codeRefs);
        if ("rule" in want) expect(codeRefs).toEqual([want.rule]);

        for (const level of LEVELS) {
          const label = `${drill}/${name} L${level}`;
          const { out, contacts } = runRung(drill, name, level);
          expect(out.ambientContacts, label).toEqual([]);
          const billed = out.violationCodes;
          const taught = (out.result.lessonMistakes ?? []).map((m) => m.code);
          const committedCodes = [...new Set([...billed, ...taught])].sort();
          if ("body" in want) {
            // ONE body, the named one — never a second car on the way — and
            // on EACH real box set alone (D1): the collider the live scene
            // mounts, and the gate's rect.
            for (const set of ["envelope", "live", "gate"] as const) {
              const run = set === "envelope" ? { out, contacts } : runRung(drill, name, level, set);
              expect(run.contacts, `${label} ${set} contacts`).toEqual([want.body]);
              const b2 = run.out.violationCodes;
              const t2 = (run.out.result.lessonMistakes ?? []).map((m) => m.code);
              expect([...new Set([...b2, ...t2])].sort(), `${label} ${set}`).toEqual(codeRefs);
              const hit = run.out.session.events.find((e) => e.kind === "violation" && e.code === "COLLISION");
              expect(hit && hit.kind === "violation" ? hit.detail : undefined, `${label} ${set}`).toBe(
                boxes.get(drill)![want.body].withWhat,
              );
              expect(run.out.result.passed, `${label} ${set}`).toBe(false);
            }
          } else if ("scripted" in want) {
            expect(contacts, `${label} parked contact`).toEqual([]);
            expect(committedCodes, label).toEqual(codeRefs);
            const hit = out.session.events.find((e) => e.kind === "violation" && e.code === "COLLISION");
            expect(hit && hit.kind === "violation" ? hit.detail : undefined, label).toBe(want.scripted);
          } else if (want.rule === "HEADLIGHTS_OFF_AT_NIGHT") {
            // The live-chain replay has no lamp and no night (liveChainReplay
            // hands every grid point `headlights: "off"` under NO_WEATHER), so
            // the lamps are graded by the recorder above; here the drive must
            // simply commit NOTHING ELSE.
            expect(contacts, `${label} parked contact`).toEqual([]);
            expect(committedCodes, label).toEqual([]);
            continue;
          } else {
            expect(contacts, `${label} parked contact`).toEqual([]);
            expect(committedCodes, label).toEqual(codeRefs);
          }
          expect(out.result.passed, label).toBe(false);
          expect(out.debrief, label).not.toMatch(/е издържан: 0 наказателни точки/);
        }
      });
    });
  }

  it("each contact demo STOPS on the body it touched, IN it on both real boxes — 0.05–0.3 m into the smaller of the two (D1)", () => {
    for (const drill of DRILLS) {
      for (const [name, want] of Object.entries(MISTAKES[drill])) {
        if (!("body" in want)) continue;
        const label = `${drill}/${name}`;
        const samples: TraceSample[] = committed(drill, name).samples;
        const last = samples[samples.length - 1];
        const hero = heroBox(last.x, last.y, last.headingDeg);
        const sets = boxSets.get(drill)!;
        expect(Math.abs(last.speedKmh), label).toBe(0);
        // The per-axis smaller box: the part of the car both colliders agree
        // on. In it by a bumper's give — no more — so the red ghost stands AT
        // the car it hit on every display, not 0.3 m short of it.
        const inner = obbSeparationM(hero, sets.inner[want.body]);
        expect(inner, `${label} inner`).toBeLessThanOrEqual(-0.05);
        expect(inner, `${label} inner`).toBeGreaterThan(-0.3);
        // …which puts it in the live collider (what the student sees) by the
        // same give, and in the gate's rect (what the recorder graded).
        const live = obbSeparationM(hero, sets.live[want.body]);
        expect(live, `${label} live`).toBeLessThanOrEqual(-0.05);
        expect(live, `${label} live`).toBeGreaterThan(-0.3);
        expect(obbSeparationM(hero, sets.gate[want.body]), `${label} gate`).toBeLessThanOrEqual(-0.05);
      }
    }
  });

  it("the live extents the script cuts against ARE the GLB table, model for model (D1)", () => {
    for (const [model, half] of Object.entries(PARK_DEPTH_LIVE_HALF)) {
      expect(GLB_HALF[model], model).toEqual(half);
    }
    // …and every body a contact demo is about is one of those models, or the wall.
    for (const drill of DRILLS) {
      for (const want of Object.values(MISTAKES[drill])) {
        if (!("body" in want)) continue;
        const m = boxSets.get(drill)!.live[want.body].model;
        expect(m === "wall" || m in PARK_DEPTH_LIVE_HALF, `${drill}: ${m}`).toBe(true);
      }
    }
  });

  it("every mistake demo keeps ≥ 0.25 m from every body it is NOT about, on the envelope (D6)", () => {
    for (const drill of DRILLS) {
      const bx = boxes.get(drill)!;
      for (const [name, want] of Object.entries(MISTAKES[drill])) {
        const others = "body" in want ? bx.filter((b) => b.index !== want.body) : bx;
        const c = minClearance(committed(drill, name).samples, others);
        expect(c.m, `${drill}/${name}: ${c.m.toFixed(3)} m at t=${c.atSec.toFixed(2)} (${c.model} #${c.index})`).toBeGreaterThanOrEqual(
          CLEARANCE_FLOOR_M,
        );
      }
    }
  });

  it("left, the blind crossing: the oncoming car meets it PAST the aisle's centre line, turning left across it (D5)", () => {
    // The lot road is two 4.0625 m halves about x = 0 (the feeder's drawn curb
    // lane is x = +4.06); the oncoming half is x < 0.
    const rec = recordScParkDepthDrive(districts.get("sc-park-left"), "sc-park-left", "mistake-cross-blind");
    const hit = rec.ruleEvents.find((e) => e.kind === "violation" && e.code === "COLLISION");
    if (!hit) throw new Error("no hit");
    const samples = committed("sc-park-left", "mistake-cross-blind").samples;
    const at = samples.reduce((a, b) => (Math.abs(b.tSec - hit.t) < Math.abs(a.tSec - hit.t) ? b : a));
    expect(at.x, "centre past the centre line").toBeLessThanOrEqual(-0.5);
    const h = wrap180(at.headingDeg);
    expect(h, "turning left across the aisle").toBeLessThan(-15);
    expect(h).toBeGreaterThan(-75);
    // Its whole front is in the oncoming half: both front corners west of x = 0.
    const r = (at.headingDeg * Math.PI) / 180;
    for (const side of [1, -1]) {
      const fx = at.x + T.CHASSIS_HALF_EXTENTS.z * Math.sin(r) + side * T.CHASSIS_HALF_EXTENTS.x * Math.cos(r);
      expect(fx, "front corner").toBeLessThan(0);
    }
    // South of both rows: an open aisle, nothing parked within reach.
    expect(at.y).toBeLessThan(-8);
  });
});
