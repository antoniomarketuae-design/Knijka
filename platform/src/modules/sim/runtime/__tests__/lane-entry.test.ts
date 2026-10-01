/**
 * THE LANE-ENTRY TRACKER — the world's half of founder ruling 2026-09-30,
 * «bill the forced braking» (sc-merge-lane-end:0487bcec round 3).
 *
 * The runtime publishes a `laneEntered` event on the frame the player's BODY
 * first goes over a lane of his carriageway it was not over before — ЗДвП
 * чл. 25, ал. 2 speaks of „навлизане изцяло или ЧАСТИЧНО в съседна пътна
 * лента", so the trigger is the first part of the car over the line, not its
 * centre — and, when a vehicle already travels in that lane behind him, what
 * the entry demands of it (`LaneEntryFollower.forcedDecelMps2`).
 *
 * Every expectation below is recomputed HERE from the fixture's own numbers:
 * the line is x = 0 on ln-merge-v1 (one one-way edge up x = 0, two 8.125 m
 * lanes: laneId 0 centred on x = +4.06, laneId 1 on x = −4.06), his half-width
 * is the chassis's, and the required deceleration is the kinematics written
 * out in the event's own doc. The test never asks the tracker what it thinks.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createWorldRuntime,
  LANE_ENTRY_PROBE_RADIUS_M,
  LANE_ENTRY_REACTION_SEC,
  LANE_ENTRY_UNAVOIDABLE_MPS2,
  laneEntryForcedDecelMps2,
  type SameDirVehicleConflict,
} from "..";
import { PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../collision";
import type { SimTickEvent } from "../../rules/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const world = (id: string): unknown =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));

const DT = 1 / 30;
const X0 = 4.0625; // laneId 0 centre
const X1 = -4.0625; // laneId 1 centre
type LaneEntered = Extract<SimTickEvent, { kind: "laneEntered" }>;

interface Car {
  id: number;
  x: number;
  y: number;
  speedMps: number;
  halfLengthM: number;
  headingDeg?: number;
}

interface Step {
  x: number;
  y: number;
  speedKmh: number;
  gear?: number;
  /** explicit heading; default = the direction of travel from the previous step */
  headingDeg?: number;
}

/** The heading a step is driven with — the direction of travel from the
 *  previous step (north = 0°, clockwise), unless the step names one. */
function headingOf(steps: Step[], n: number): number {
  const s = steps[n];
  if (s.headingDeg !== undefined) return s.headingDeg;
  if (s.gear === -1 || n === 0) return 0;
  const p = steps[n - 1];
  const dx = s.x - p.x;
  const dy = s.y - p.y;
  return Math.hypot(dx, dy) < 1e-9 ? 0 : (Math.atan2(dx, dy) * 180) / Math.PI;
}

/** HIS BODY, from its four corners (round 4, F6: the test states the body
 *  geometry itself, it never asks the tracker). The chassis is a rectangle of
 *  half-width PLAYER_HALF_WIDTH_M and half-length PLAYER_HALF_LENGTH_M about
 *  his position, turned to his heading. Returns the body's extent across the
 *  road (x) and along it (y). */
function bodyBox(x: number, y: number, headingDeg: number): { minX: number; maxX: number; minY: number; maxY: number } {
  const r = (headingDeg * Math.PI) / 180;
  const fx = Math.sin(r);
  const fy = Math.cos(r);
  const rx = Math.cos(r);
  const ry = -Math.sin(r);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      xs.push(x + a * PLAYER_HALF_LENGTH_M * fx + b * PLAYER_HALF_WIDTH_M * rx);
      ys.push(y + a * PLAYER_HALF_LENGTH_M * fy + b * PLAYER_HALF_WIDTH_M * ry);
    }
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Drive a pose list through a fresh runtime on `districtId`; `cars(t)` is the
 *  fake traffic (null = no query installed). Returns every laneEntered event
 *  with the index of the frame it rode on. */
function drive(
  steps: Step[],
  cars: ((i: number) => Car[]) | null,
  districtId = "ln-merge-v1",
  edgeIds?: string[],
): { i: number; e: LaneEntered }[] {
  const rt = createWorldRuntime(world(districtId));
  let frame = 0;
  if (cars !== null) {
    rt.setSameDirVehiclesQuery((px, py, h, r): SameDirVehicleConflict[] =>
      cars(frame)
        .filter((c) => Math.hypot(c.x - px, c.y - py) <= r)
        .map((c) => {
          const rad = ((c.headingDeg ?? 0) * Math.PI) / 180;
          return { id: c.id, x: c.x, y: c.y, dirX: Math.sin(rad), dirY: Math.cos(rad), speedMps: c.speedMps, halfLengthM: c.halfLengthM };
        }),
    );
  }
  const out: { i: number; e: LaneEntered }[] = [];
  for (frame = 0; frame < steps.length; frame++) {
    const s = steps[frame];
    rt.update(DT);
    const tick = rt.sample(
      {
        position: { x: s.x, y: s.y },
        headingDeg: headingOf(steps, frame),
        speedKmh: s.speedKmh,
        indicator: "off",
        headlights: "off",
        seatbeltOn: true,
        handbrakeOn: false,
        gear: s.gear ?? 3,
        mirrorGlance: null,
      },
      frame * DT,
      false,
    );
    edgeIds?.push(tick.edgeId ?? "");
    for (const e of tick.events) if (e.kind === "laneEntered") out.push({ i: frame, e });
  }
  return out;
}

/** Straight up the road at `kmh`, gliding from x `from` to x `to` at `glide`
 *  m/s starting at y `startY`. */
function glidePath(kmh: number, from: number, to: number, glide: number, startY: number, y0 = 20, y1 = 200): Step[] {
  const steps: Step[] = [];
  let x = from;
  for (let y = y0; y <= y1; y += (kmh / 3.6) * DT) {
    if (y >= startY) x = Math.abs(to - x) <= glide * DT ? to : x + Math.sign(to - x) * glide * DT;
    steps.push({ x, y, speedKmh: kmh });
  }
  return steps;
}

/** The first frame on which ANY CORNER of his body is over laneId 1 — west of
 *  the x = 0 line (round 4: a yawing car's front corner crosses before its
 *  flank does, and the law's „частично" is the corner). */
const firstOverLane1 = (steps: Step[]) => steps.findIndex((s, n) => bodyBox(s.x, s.y, headingOf(steps, n)).minX < 0);
/** …and over laneId 0 (east of the line). */
const firstOverLane0After = (steps: Step[], from: number) =>
  steps.findIndex((s, n) => n >= from && bodyBox(s.x, s.y, headingOf(steps, n)).maxX > 0);
/** Nose-to-tail along the road from a car at `carY` (half-length `carHalf`) to
 *  his body's rearmost point on frame n. */
const gapTo = (steps: Step[], n: number, carY: number, carHalf: number) =>
  bodyBox(steps[n].x, steps[n].y, headingOf(steps, n)).minY - (carY + carHalf);

/** The required deceleration, written out from the event's doc. ROUND 4 (F6a):
 *  a vehicle that is not closing on him is not forced to brake, however close —
 *  so closing ≤ 0 is 0 FIRST, and only a closing vehicle with no room is
 *  „unavoidable". */
function expectedForced(gapM: number, closingMps: number): number {
  if (closingMps <= 0) return 0;
  if (gapM <= 0) return LANE_ENTRY_UNAVOIDABLE_MPS2;
  const rem = gapM - closingMps * LANE_ENTRY_REACTION_SEC;
  if (rem <= 0) return LANE_ENTRY_UNAVOIDABLE_MPS2;
  return Math.min(LANE_ENTRY_UNAVOIDABLE_MPS2, (closingMps * closingMps) / (2 * rem));
}

describe("the constants are what their docs derive", () => {
  it("the reaction time is the product's one driver reaction time (the amber adjudicator's)", () => {
    expect(LANE_ENTRY_REACTION_SEC).toBe(1.0);
  });
  it("the unavoidable sentinel is above any brake a vehicle has", () => {
    expect(LANE_ENTRY_UNAVOIDABLE_MPS2).toBeGreaterThanOrEqual(50);
  });
  it("the probe reaches every follower that could be forced past the 7 m/s² line at up to 140 км/ч", () => {
    const v = 140 / 3.6;
    const reach = v * LANE_ENTRY_REACTION_SEC + (v * v) / (2 * 7) + PLAYER_HALF_LENGTH_M + 6; // a bus's half-length
    expect(LANE_ENTRY_PROBE_RADIUS_M).toBeGreaterThanOrEqual(reach);
  });
  it("the pure formula: not catching him → 0, no room → unavoidable, else v²/2(gap − v·t)", () => {
    expect(laneEntryForcedDecelMps2(10, 0)).toBe(0);
    expect(laneEntryForcedDecelMps2(10, -3)).toBe(0);
    expect(laneEntryForcedDecelMps2(0, 5)).toBe(LANE_ENTRY_UNAVOIDABLE_MPS2);
    expect(laneEntryForcedDecelMps2(-2, 0.1)).toBe(LANE_ENTRY_UNAVOIDABLE_MPS2);
    expect(laneEntryForcedDecelMps2(4, 5)).toBe(LANE_ENTRY_UNAVOIDABLE_MPS2);
    expect(laneEntryForcedDecelMps2(12, 4)).toBeCloseTo(16 / 16, 12);
  });

  it("ROUND 4 (F6a): a vehicle ALONGSIDE that is stopped, as fast as him or slower is not forced to brake — gap ≤ 0 is unavoidable only when it is closing", () => {
    expect(laneEntryForcedDecelMps2(-2, 0)).toBe(0);
    expect(laneEntryForcedDecelMps2(-2, -3)).toBe(0);
    expect(laneEntryForcedDecelMps2(0, 0)).toBe(0);
    expect(laneEntryForcedDecelMps2(0, -13.9)).toBe(0); // a parked car level with him
    expect(laneEntryForcedDecelMps2(-0.5, 0.2)).toBe(LANE_ENTRY_UNAVOIDABLE_MPS2);
  });
});

describe("the lane-entry event", () => {
  const through: Car = { id: 7, x: X1, y: 0, speedMps: 50 / 3.6, halfLengthM: 2.05 };

  it("fires ONCE, on the first frame any of his body is over the entered lane, and measures the car behind in it", () => {
    const steps = glidePath(35, X0, X1, 2, 100);
    const carAt = (i: number): Car[] => [{ ...through, y: steps[Math.min(i, steps.length - 1)].y - 12 }];
    const got = drive(steps, carAt);
    expect(got.length).toBe(1);
    const k = firstOverLane1(steps);
    expect(got[0].i).toBe(k);
    // the corner is over the line before the flank is (the glide yaws him ~11°)
    expect(k).toBeLessThan(steps.findIndex((s) => s.x < PLAYER_HALF_WIDTH_M));
    expect(got[0].e.laneId).toBe(1);
    const f = got[0].e.follower!;
    expect(f).not.toBeNull();
    expect(f.vehicleId).toBe(7);
    // nose to his body's rearmost point along the road, on the entry frame
    const gap = gapTo(steps, k, steps[k].y - 12, 2.05);
    expect(gap).toBeLessThan(12 - PLAYER_HALF_LENGTH_M - 2.05); // the yawed tail reaches further back
    const closing = 50 / 3.6 - 35 / 3.6;
    expect(f.gapM).toBeCloseTo(gap, 2);
    expect(f.closingMps).toBeCloseTo(closing, 6);
    expect(f.speedMps).toBeCloseTo(50 / 3.6, 6);
    expect(f.reactionSec).toBe(LANE_ENTRY_REACTION_SEC);
    expect(f.forcedDecelMps2).toBeCloseTo(expectedForced(gap, closing), 2);
  });

  it("a whole-lane drive with no lane change publishes nothing", () => {
    expect(drive(glidePath(40, X0, X0, 2, 100), () => [])).toEqual([]);
    expect(drive(glidePath(40, X1 + 0.5, X1 + 0.5, 2, 100), () => [])).toEqual([]);
  });

  it("riding up to the line WITHOUT a body part over it publishes nothing", () => {
    // glide most of the way, then creep the last 0.6 m so the nose is straight
    // when he stops 3 cm short of the line (a corner never crosses)
    const fast = glidePath(30, X0, PLAYER_HALF_WIDTH_M + 0.6, 2, 60, 20, 120);
    const creep = glidePath(30, PLAYER_HALF_WIDTH_M + 0.6, PLAYER_HALF_WIDTH_M + 0.03, 0.05, 0, 120 + (30 / 3.6) * DT, 260);
    const steps = [...fast, ...creep];
    expect(Math.min(...steps.map((s, n) => bodyBox(s.x, s.y, headingOf(steps, n)).minX))).toBeGreaterThan(0);
    expect(drive(steps, () => [])).toEqual([]);
  });

  it("the way back is an entry too — into laneId 0, where nobody travels behind him", () => {
    const out = glidePath(30, X0, X1, 2, 60, 20, 140);
    const back = glidePath(30, X1, X0, 2, 0, 140 + (30 / 3.6) * DT, 260);
    const steps = [...out, ...back];
    const got = drive(steps, (i) => [{ ...through, y: steps[Math.min(i, steps.length - 1)].y - 40 }]);
    expect(got.map((g) => g.e.laneId)).toEqual([1, 0]);
    expect(got[1].e.follower).toBeNull();
    // his body is back over laneId 0 on the first frame any corner is east of the line
    expect(got[1].i).toBe(firstOverLane0After(steps, out.length));
  });

  it("ROUND 4 (F3): a body wholly back in the lane he came from has LEFT the other one — a re-entry after any clearance is a new entry; only a body that never comes clear is one entry", () => {
    const H = PLAYER_HALF_WIDTH_M;
    // lateral steps with the nose held straight (headingDeg 0), so the corners
    // are exactly ± his half-width
    const mk = (xs: number[]) => xs.map((x, n) => ({ x, y: 40 + n * 0.3, speedKmh: 30, headingDeg: 0 }));
    // over the line by 5 cm, back to 0.2 m clear of it (wholly in laneId 0), over again: TWO
    // entries into laneId 1 (laneId 0 was never left — his body straddled the line)
    const hover = mk([X0, 2, H + 0.1, H - 0.05, H - 0.05, H + 0.2, H + 0.2, H - 0.05, H - 0.05]);
    expect(drive(hover, () => []).map((g) => [g.i, g.e.laneId])).toEqual([[3, 1], [7, 1]]);
    // …and so is a clearance of 1 cm: the deadband no longer holds a lane he has left
    const hair = mk([X0, 2, H + 0.1, H - 0.05, H - 0.05, H + 0.01, H + 0.01, H - 0.05, H - 0.05]);
    expect(drive(hair, () => []).filter((g) => g.e.laneId === 1).length).toBe(2);
    // a body that wobbles but stays over the line the whole time is ONE entry
    const wobble = mk([X0, 2, H + 0.1, H - 0.05, H - 0.01, H - 0.2, H - 0.01, H - 0.05, H - 0.3]);
    expect(drive(wobble, () => []).map((g) => g.e.laneId)).toEqual([1]);
  });

  it("ROUND 4 (F3, the verifier's hover-and-dart): entered lawfully, came back to hug the line wholly in his old lane, then darted in front of the car — the dart is an entry, measured against the car", () => {
    const H = PLAYER_HALF_WIDTH_M;
    const v = 25;
    const step = (v / 3.6) * DT;
    const steps: Step[] = [];
    let x = X0;
    let target = X0;
    let glide = 1.5;
    let dartAt = -1;
    for (let y = 20; y <= 160; y += step) {
      if (y >= 35 && y < 60) { target = X1; glide = 1.5; }
      else if (y >= 60 && y < 110) { target = H + 0.23; glide = 1.0; } // body 23 cm clear, wholly in laneId 0
      else if (y >= 110) { target = X1; glide = 3.0; if (dartAt < 0) dartAt = steps.length; }
      x = Math.abs(target - x) <= glide * DT ? target : x + Math.sign(target - x) * glide * DT;
      steps.push({ x, y, speedKmh: v, headingDeg: 0 });
    }
    // the car: 30 m back for the lawful entry, 6 m of centres behind him when he darts
    const car = (i: number): Car[] => [{ id: 7, x: X1, y: steps[Math.min(i, steps.length - 1)].y - (i < dartAt ? 30 : 6), speedMps: 13.9, halfLengthM: 2.05 }];
    const got = drive(steps, car);
    expect(got.map((g) => g.e.laneId)).toEqual([1, 0, 1]);
    const lawful = got[0].e.follower!;
    expect(lawful.forcedDecelMps2).toBeLessThan(7);
    const dart = got[2].e.follower!;
    expect(dart, "the dart must be measured against the car").not.toBeNull();
    expect(dart.vehicleId).toBe(7);
    expect(dart.closingMps).toBeCloseTo(13.9 - v / 3.6, 6);
    expect(dart.forcedDecelMps2).toBe(LANE_ENTRY_UNAVOIDABLE_MPS2);
    // …and the frame is the first one a corner of his body crosses back over the line
    expect(got[2].i).toBe(steps.findIndex((s, n) => n > dartAt - 1 && bodyBox(s.x, s.y, headingOf(steps, n)).minX < 0));
  });

  it("ROUND 4 (F6a): a stopped car alongside him in the lane he enters is not forced to brake (forcedDecel 0, not «unavoidable»)", () => {
    const steps = glidePath(30, X0, X1, 2, 100);
    for (const speedMps of [0, 4, 30 / 3.6]) {
      const f = drive(steps, (i) => [{ ...through, speedMps, y: steps[Math.min(i, steps.length - 1)].y - 2 }])[0].e.follower!;
      expect(f.gapM, `speed ${speedMps}`).toBeLessThanOrEqual(0);
      expect(f.forcedDecelMps2, `speed ${speedMps}`).toBe(0);
    }
  });

  it("reversing across the line is a parking manoeuvre, not a lane entry (A12)", () => {
    const steps: Step[] = [];
    for (let n = 0; n < 120; n++) steps.push({ x: X0 - n * 0.08, y: 60, speedKmh: -5, gear: -1 });
    expect(drive(steps, () => [])).toEqual([]);
  });

  it("the follower is the NEAREST vehicle BEHIND him whose centre is IN the entered lane", () => {
    const steps = glidePath(30, X0, X1, 2, 100);
    const got = drive(steps, (i) => {
      const y = steps[Math.min(i, steps.length - 1)].y;
      return [
        { id: 1, x: X1, y: y + 15, speedMps: 5, halfLengthM: 2.05 }, // ahead in the entered lane
        { id: 2, x: X0, y: y - 6, speedMps: 14, halfLengthM: 2.05 }, // behind, in HIS lane
        { id: 3, x: X1, y: y - 40, speedMps: 14, halfLengthM: 2.05 }, // behind in the lane, further
        { id: 4, x: X1 + 3.5, y: y - 20, speedMps: 14, halfLengthM: 6 }, // behind in the lane (centre 0.56 m in), nearer — a bus
      ];
    });
    expect(got.length).toBe(1);
    expect(got[0].e.follower!.vehicleId).toBe(4);
    const k = got[0].i;
    expect(got[0].e.follower!.gapM).toBeCloseTo(gapTo(steps, k, steps[k].y - 20, 6), 2);
  });

  it("nobody behind in the entered lane → follower null; a car that has already drawn level (gap ≤ 0) → unavoidable", () => {
    const steps = glidePath(30, X0, X1, 2, 100);
    expect(drive(steps, (i) => [{ ...through, y: steps[Math.min(i, steps.length - 1)].y + 30 }])[0].e.follower).toBeNull();
    const level = drive(steps, (i) => [{ ...through, y: steps[Math.min(i, steps.length - 1)].y - 3 }])[0].e.follower!;
    expect(level.gapM).toBeLessThanOrEqual(0);
    expect(level.forcedDecelMps2).toBe(LANE_ENTRY_UNAVOIDABLE_MPS2);
  });

  it("a slower car behind is not being forced at all (forcedDecel 0), however close", () => {
    const steps = glidePath(40, X0, X1, 2, 100);
    const f = drive(steps, (i) => [{ ...through, speedMps: 30 / 3.6, y: steps[Math.min(i, steps.length - 1)].y - 7 }])[0].e.follower!;
    expect(f.closingMps).toBeLessThan(0);
    expect(f.forcedDecelMps2).toBe(0);
  });

  it("an oncoming car is not a follower (the query's same-direction filter is the traffic system's; here: heading 180 never qualifies)", () => {
    const steps = glidePath(30, X0, X1, 2, 100);
    const got = drive(steps, (i) => [{ ...through, headingDeg: 180, y: steps[Math.min(i, steps.length - 1)].y - 12 }]);
    expect(got[0].e.follower).toBeNull();
  });

  it("the traffic query is asked along the LANE, not along his nose: creeping across with the nose 70° off the road still finds the car", () => {
    // a query with the traffic system's own same-direction cone (60°)
    const rt = createWorldRuntime(world("ln-merge-v1"));
    const asked: number[] = [];
    rt.setSameDirVehiclesQuery((px, py, h) => {
      asked.push(h);
      const delta = Math.abs((((0 - h) % 360) + 540) % 360 - 180);
      return delta > 60 ? [] : [{ id: 9, x: X1, y: py - 10, dirX: 0, dirY: 1, speedMps: 12, halfLengthM: 2.05 }];
    });
    let got: LaneEntered | null = null;
    // at 70° of yaw his body reaches 0.85·cos70° + 2.02·sin70° ≈ 2.19 m across
    // the road, so he starts well clear and creeps until a corner is over
    const xs = [4.0, 3.5, 3.0, 2.6, 2.3, 2.1, 1.9];
    xs.forEach((x, n) => {
      rt.update(DT);
      const tick = rt.sample(
        { position: { x, y: 60 + n * 0.2 }, headingDeg: -70, speedKmh: 2, indicator: "off", headlights: "off", seatbeltOn: true, handbrakeOn: false, gear: 1, mirrorGlance: null },
        n * DT,
        false,
      );
      for (const e of tick.events) if (e.kind === "laneEntered") got = e;
    });
    expect(got).not.toBeNull();
    expect(got!.follower?.vehicleId).toBe(9);
    expect(asked.length).toBeGreaterThan(0);
    for (const h of asked) expect(Math.min(((h % 360) + 360) % 360, 360 - (((h % 360) + 360) % 360))).toBeLessThan(1); // asked due north, the lane's bearing
  });

  it("with no traffic query installed the event still fires, with follower null (a hand-built stack cannot bill)", () => {
    const got = drive(glidePath(30, X0, X1, 2, 100), null);
    expect(got.length).toBe(1);
    expect(got[0].e.follower).toBeNull();
  });

  it("a straight segment joint does not blind it: an entry on the very frame the car crosses onto the next edge is still an entry", () => {
    // hz-roadworks-v1 is three straight one-way 2-lane edges joined at y = 240
    // and y = 276. First find the frame on which the runtime's own lane fix
    // moves onto the works edge (the locator's lock hysteresis decides it, not
    // the paint), then put his body over the lane line on exactly that frame.
    const H = PLAYER_HALF_WIDTH_M;
    const ys = Array.from({ length: 40 }, (_, n) => 226 + n * 0.5);
    const probe = createWorldRuntime(world("hz-roadworks-v1"));
    let k = -1;
    ys.forEach((y, n) => {
      probe.update(DT);
      const tick = probe.sample(
        { position: { x: H + 0.2, y }, headingDeg: 0, speedKmh: 30, indicator: "off", headlights: "off", seatbeltOn: true, handbrakeOn: false, gear: 3, mirrorGlance: null },
        n * DT,
        false,
      );
      if (k < 0 && tick.edgeId === "hzr-e-works") k = n;
    });
    expect(k, "the lane fix never moved onto the works edge").toBeGreaterThan(2);
    const steps: Step[] = ys.map((y, n) => ({ x: n < k ? H + 0.2 : H - 0.2, y, speedKmh: 30 }));
    const got = drive(steps, () => [], "hz-roadworks-v1");
    expect(got.map((g) => [g.i, g.e.laneId])).toEqual([[k, 1]]);
  });

  it("a vehicle on the OTHER bank of a two-way road is never the follower, even where its offset mirrors the entered lane", () => {
    // ln-v1: one two-way 4-lane edge on x = 0; his bank is x > 0 (laneId 0 at
    // x = 12.19, laneId 1 at x = 4.06). He moves from laneId 0 to laneId 1; a
    // car travelling his way on the opposing bank sits at x = −4.06 — the same
    // distance from the centreline as the lane he enters — 10 m behind him.
    const steps = glidePath(30, 12.1875, 4.0625, 2, 100);
    const ghost = drive(steps, (i) => [{ id: 5, x: -4.0625, y: steps[Math.min(i, steps.length - 1)].y - 10, speedMps: 14, halfLengthM: 2.05 }], "ln-v1");
    expect(ghost.length).toBe(1);
    expect(ghost[0].e.laneId).toBe(1);
    expect(ghost[0].e.follower).toBeNull();
    // …and the same car in his own bank's lane IS the follower (the control)
    const real = drive(steps, (i) => [{ id: 6, x: 4.0625, y: steps[Math.min(i, steps.length - 1)].y - 10, speedMps: 14, halfLengthM: 2.05 }], "ln-v1");
    expect(real[0].e.follower?.vehicleId).toBe(6);
  });

  it("crossing the centre line onto the ONCOMING bank of a two-way road is not a lane entry — that excursion is the overtake trackers' act (one act, one code)", () => {
    // ov-oncoming-v1: a two-way road, own bank centred x = +4.06, oncoming bank x < 0.
    const steps = glidePath(40, 4.06, -2.5, 2, 60, 20, 160);
    expect(drive(steps, () => [], "ov-oncoming-v1")).toEqual([]);
  });
});

describe("ROUND 4 (F4): the follower is looked for ALONG THE LANE, across segment joints", () => {
  // hz-roadworks-v1 is three straight one-way 2-lane edges joined at y = 240
  // and y = 276 — the same lane on both sides of each joint; which edge a car
  // is on is bookkeeping. A forced cut-in just past a joint, with the car still
  // on the previous edge, must be judged against that car.
  const through = (y: number, speedMps = 13.9): Car => ({ id: 11, x: X1, y, speedMps, halfLengthM: 2.05 });

  for (const { joint, startY } of [
    { joint: 240, startY: 243 },
    { joint: 276, startY: 278 },
  ]) {
    it(`a cut-in just past the joint at y ${joint} is measured against the car still on the edge before it`, () => {
      const steps = glidePath(20, X0, X1, 2, startY, startY - 30, startY + 25);
      const edges: string[] = [];
      const got = drive(steps, (i) => [through(steps[Math.min(i, steps.length - 1)].y - 14)], "hz-roadworks-v1", edges);
      expect(got.length).toBe(1);
      const k = got[0].i;
      expect(k).toBe(firstOverLane1(steps));
      expect(steps[k].y).toBeGreaterThan(joint);
      // he is on the next edge, the car is on the one before the joint
      expect(edges[k]).toBe(joint === 240 ? "hzr-e-works" : "hzr-e-exit");
      expect(steps[k].y - 14).toBeLessThan(joint);
      const f = got[0].e.follower;
      expect(f, "the car behind him in his lane was not found across the joint").not.toBeNull();
      expect(f!.vehicleId).toBe(11);
      const gap = gapTo(steps, k, steps[k].y - 14, 2.05);
      expect(f!.gapM).toBeCloseTo(gap, 1);
      expect(f!.closingMps).toBeCloseTo(13.9 - 20 / 3.6, 6);
      expect(f!.forcedDecelMps2).toBeCloseTo(expectedForced(gap, 13.9 - 20 / 3.6), 0);
      expect(f!.forcedDecelMps2).toBeGreaterThan(7);
    });
  }

  it("he is still LOCKED to the edge before the joint while already past its end node (the locator's hysteresis): the gap is measured to where he really is, and a car just past the joint behind him is found", () => {
    // a fresh-seed census drive (round 4, seeds 73M/89M) found the follower
    // measured 0.53 m too close: the lock holds him on hzr-e-approach to
    // ~y 244, and his arclength there clamps to the node at y 240
    const H = PLAYER_HALF_WIDTH_M;
    const v = 40;
    const steps: Step[] = [];
    for (let y = 200; y <= 250; y += (v / 3.6) * DT) steps.push({ x: y < 240.3 ? H + 0.35 : H - 0.2, y, speedKmh: v, headingDeg: 0 });
    for (const back of [6, 0.3]) {
      const edges: string[] = [];
      const got = drive(steps, (i) => [through(steps[Math.min(i, steps.length - 1)].y - back, 12.5)], "hz-roadworks-v1", edges);
      expect(got.length, `car ${back} m back`).toBe(1);
      const k = got[0].i;
      expect(steps[k].y, "the entry is past the node").toBeGreaterThan(240);
      expect(edges[k], "…while the lock still holds him on the approach edge").toBe("hzr-e-approach");
      const f = got[0].e.follower;
      expect(f, `car ${back} m back: not found`).not.toBeNull();
      expect(f!.gapM, `car ${back} m back`).toBeCloseTo(gapTo(steps, k, steps[k].y - back, 2.05), 2);
    }
  });

  /** hz-roadworks-v1's carriageway re-drawn with other nodes/edges: every edge
   *  a one-way 2-lane copy of its approach edge (the same class, limit and
   *  lane count), so only the geometry differs. */
  function redrawn(nodes: { id: string; x: number; y: number }[], edges: { id: string; from: string; to: string }[]): unknown {
    const base = world("hz-roadworks-v1") as Record<string, unknown> & {
      roads: { edges: Record<string, unknown>[] };
      meta: Record<string, unknown>;
    };
    const at = new Map(nodes.map((n) => [n.id, n]));
    return {
      ...base,
      meta: { ...base.meta, boundsLocalMeters: { minX: -80, minY: -60, maxX: 320, maxY: 460 } },
      roads: {
        nodes,
        edges: edges.map((e) => {
          const a = at.get(e.from)!;
          const b = at.get(e.to)!;
          return { ...base.roads.edges[0], ...e, length: Math.hypot(b.x - a.x, b.y - a.y), geometry: [[a.x, a.y], [b.x, b.y]] };
        }),
      },
    };
  }
  /** Drive `steps` on `district` with one fake car; the first laneEntered event and its edge. */
  function firstEntry(district: unknown, steps: Step[], car: SameDirVehicleConflict): { e: LaneEntered; edge: string; i: number } | null {
    const rt = createWorldRuntime(district);
    rt.setSameDirVehiclesQuery(() => [car]);
    let got: { e: LaneEntered; edge: string; i: number } | null = null;
    steps.forEach((s, n) => {
      rt.update(DT);
      const tick = rt.sample(
        { position: { x: s.x, y: s.y }, headingDeg: headingOf(steps, n), speedKmh: s.speedKmh, indicator: "off", headlights: "off", seatbeltOn: true, handbrakeOn: false, gear: 3, mirrorGlance: null },
        n * DT,
        false,
      );
      for (const e of tick.events) if (e.kind === "laneEntered" && got === null) got = { e, edge: tick.edgeId ?? "", i: n };
    });
    return got;
  }

  it("a car around a CORNER is on another road: the walk back stops at a joint that turns (laneContinuesAcross — straight joints only)", () => {
    // An L: one-way 2-lane up x = 0 to (0, 240), then one-way 2-lane EAST.
    // Same lane count, same oneway-ness, drawn on through the node — only the
    // 90° turn says it is not a joint on a straight. He changes lanes 40 m past
    // the corner heading east (laneId 0 south of y = 240, laneId 1 north of
    // it); a car sits on the approach, in its left lane, 10 m short of the node.
    const d = redrawn(
      [
        { id: "c-s", x: 0, y: 0 },
        { id: "c-j", x: 0, y: 240 },
        { id: "c-e", x: 240, y: 240 },
      ],
      [
        { id: "c-up", from: "c-s", to: "c-j" },
        { id: "c-east", from: "c-j", to: "c-e" },
      ],
    );
    const steps: Step[] = [];
    let y = 240 - X0;
    for (let x = 20; x <= 120; x += (30 / 3.6) * DT) {
      if (x >= 40) y = Math.min(240 - X1, y + 2 * DT);
      steps.push({ x, y, speedKmh: 30, headingDeg: 90 });
    }
    const got = firstEntry(d, steps, { id: 51, x: X1, y: 230, dirX: 0, dirY: 1, speedMps: 13.9, halfLengthM: 2.05 });
    expect(got, "no lane entry on the eastbound edge").not.toBeNull();
    expect(got!.edge).toBe("c-east");
    expect(got!.e.laneId).toBe(1);
    expect(got!.e.follower).toBeNull();
  });

  it("at a FORK the piece behind him is the one that ENDS at the node, not a sibling that leaves it in nearly his direction", () => {
    // s → j up x = 0, then two one-way 2-lane edges leave j: one straight on
    // (j → n1) and one bearing 10° left (j → n2), listed FIRST. He changes
    // into laneId 1 just past j on the straight; the car is on the approach,
    // 14 m behind him. A walk back that accepted any piece at j whose
    // direction lines up would step onto the sibling ahead of him.
    const d = redrawn(
      [
        { id: "f-s", x: 0, y: 0 },
        { id: "f-j", x: 0, y: 240 },
        { id: "f-n1", x: 0, y: 440 },
        { id: "f-n2", x: -35, y: 440 },
      ],
      [
        { id: "f-left", from: "f-j", to: "f-n2" },
        { id: "f-up", from: "f-s", to: "f-j" },
        { id: "f-on", from: "f-j", to: "f-n1" },
      ],
    );
    const steps = glidePath(20, X0, X1, 2, 246, 216, 268);
    const k0 = firstOverLane1(steps);
    const carY = steps[k0].y - 14;
    expect(carY).toBeLessThan(240);
    const got = firstEntry(d, steps, { id: 61, x: X1, y: carY, dirX: 0, dirY: 1, speedMps: 13.9, halfLengthM: 2.05 });
    expect(got).not.toBeNull();
    expect(got!.edge).toBe("f-on");
    expect(got!.i).toBe(k0);
    expect(got!.e.follower?.vehicleId).toBe(61);
    expect(got!.e.follower!.gapM).toBeCloseTo(gapTo(steps, k0, carY, 2.05), 2);
  });

  it("…the same geometry mid-edge gives the same measurement (the joint changes nothing)", () => {
    const steps = glidePath(20, X0, X1, 2, 200, 170, 230);
    const got = drive(steps, (i) => [through(steps[Math.min(i, steps.length - 1)].y - 14)], "hz-roadworks-v1");
    const k = got[0].i;
    expect(got[0].e.follower!.gapM).toBeCloseTo(gapTo(steps, k, steps[k].y - 14, 2.05), 1);
  });

  it("across a joint the follower still has to be IN the entered lane, travelling its way, and behind him", () => {
    const steps = glidePath(20, X0, X1, 2, 243, 213, 268);
    const got = drive(
      steps,
      (i) => {
        const y = steps[Math.min(i, steps.length - 1)].y;
        return [
          { id: 21, x: X0, y: y - 10, speedMps: 13.9, halfLengthM: 2.05 }, // his old lane, previous edge
          { id: 22, x: X1, y: y - 12, speedMps: 13.9, halfLengthM: 2.05, headingDeg: 180 }, // wrong way, previous edge
        ];
      },
      "hz-roadworks-v1",
    );
    expect(got[0].e.follower).toBeNull();
  });

  it("a car that far back on the previous edge that it is past the probe is not judged (the probe radius still bounds the walk)", () => {
    const steps = glidePath(20, X0, X1, 2, 243, 213, 268);
    const got = drive(steps, (i) => [through(steps[Math.min(i, steps.length - 1)].y - (LANE_ENTRY_PROBE_RADIUS_M + 5))], "hz-roadworks-v1");
    expect(got[0].e.follower).toBeNull();
  });
});

describe("ROUND 4 (F7): the two branches the round-3 verifier found unpinned", () => {
  it("W26 — against the edge's drawn direction (southbound on ln-v1's west bank) the follower is the car BEHIND him in HIS direction of travel", () => {
    // ln-v1: one two-way 4-lane edge drawn south → north on x = 0. Southbound
    // traffic keeps to the west bank: laneId 0 at x = −12.19, laneId 1 at
    // x = −4.06. He moves from laneId 0 to laneId 1 heading south; the car is
    // north of him (behind him), heading south, in laneId 1.
    const v = 35;
    const steps: Step[] = [];
    let x = -12.1875;
    for (let y = 300; y >= 120; y -= (v / 3.6) * DT) {
      if (y <= 260) x = Math.abs(-4.0625 - x) <= 2 * DT ? -4.0625 : x + 2 * DT;
      steps.push({ x, y, speedKmh: v });
    }
    // a wrong-way decoy SOUTH of him (ahead in his travel), heading north
    const got = drive(
      steps,
      (i) => {
        const y = steps[Math.min(i, steps.length - 1)].y;
        return [
          { id: 31, x: -4.0625, y: y + 12, speedMps: 13.9, halfLengthM: 2.05, headingDeg: 180 },
          { id: 32, x: -4.0625, y: y - 9, speedMps: 13.9, halfLengthM: 2.05, headingDeg: 0 },
        ];
      },
      "ln-v1",
    );
    expect(got.length).toBe(1);
    expect(got[0].e.laneId).toBe(1);
    const f = got[0].e.follower;
    expect(f, "the southbound car behind him was not found").not.toBeNull();
    expect(f!.vehicleId).toBe(31);
    const k = got[0].i;
    // nose (south end of the car) to his rearmost (northmost) point
    const box = bodyBox(steps[k].x, steps[k].y, headingOf(steps, k));
    expect(f!.gapM).toBeCloseTo(steps[k].y + 12 - 2.05 - box.maxY, 1);
  });

  it("W36 — a car behind him in the lane he is LEAVING, its centre 1.2 m from the line, is not the follower in the lane he enters", () => {
    const steps = glidePath(30, X0, X1, 2, 100);
    const got = drive(steps, (i) => [{ id: 41, x: 1.2, y: steps[Math.min(i, steps.length - 1)].y - 10, speedMps: 14, halfLengthM: 2.05 }]);
    expect(got.length).toBe(1);
    expect(got[0].e.follower).toBeNull();
    // …and 1.2 m the other side of the line it is (the control)
    const ctl = drive(steps, (i) => [{ id: 42, x: -1.2, y: steps[Math.min(i, steps.length - 1)].y - 10, speedMps: 14, halfLengthM: 2.05 }]);
    expect(ctl[0].e.follower?.vehicleId).toBe(42);
  });
});
