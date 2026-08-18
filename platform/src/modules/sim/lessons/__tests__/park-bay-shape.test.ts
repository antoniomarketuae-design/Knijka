/**
 * PARK ACCEPTANCE IS THE BAY'S SHAPE — sweep 161, 2026-08-18.
 *
 * `stepParkInBay` used to accept on ONE number, the Euclidean distance from the
 * car centre to the bay centre against `centerTolM`. The shipped bays are
 * rectangles 4.5–6.5 m long and 2.5–2.7 m wide and the car is 4.04 × 1.70, so
 * that disc was too tight along the bay and too loose across it AT THE SAME
 * TIME. Both errors are in this file, each with a case that is red on the old
 * evaluator and green on the shipped one, and each with its opposite direction
 * pinned so the fix cannot be widened into a check that credits everybody:
 *
 *   §1 THE FALSE FAILURE — a car reversed fully home in sc-park-zebra's
 *      5.5 × 2.5 bay: square, entirely between the lines, 0.70 m back of
 *      centre. Refused by the disc, credited now.
 *   §2 THE FALSE PASS — the same bay, 0.50 m ACROSS at L3 and 0.75 m at L1:
 *      the flank 0.10 m / 0.35 m over the painted line and into the next bay.
 *      Credited by the disc, refused now.
 *   §3 THE BOUNDS STILL BITE — a car outside the paint in either axis is still
 *      refused, so §1 is a reshaping and not a relaxation.
 *   §4 THE AUTHORED FLOOR SURVIVES — on a bay whose own depth slack is TIGHTER
 *      than `centerTolM` (5.0 × 2.7, slack 0.48 vs tol 0.50) nothing moves, so
 *      the aid ladder keeps its meaning on the eleven drills that use it.
 *   §5 THE COPY LAW — the footprint constants are pinned against the rapier
 *      collider they were read off, because a silent drift there would move
 *      every acceptance in this file.
 *   §6 «СПРИ НАПЪЛНО» — the hold clock read `speedKmh <= 1` unsigned, so every
 *      reversing frame counted as rest and a car that drove THROUGH the bay
 *      without stopping was credited. Found by §1's own fixture: widening the
 *      depth band widens the window that bug needs, so it is closed here.
 */

import { describe, expect, it } from "vitest";

import { CHASSIS_HALF_EXTENTS } from "../../vehicle/tuning";
import {
  PARK_CAR_HALF_LENGTH_M,
  PARK_CAR_HALF_WIDTH_M,
  createEvalState,
  parseObjectiveParams,
  stepObjective,
} from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ObjectiveParams, ParkInBayParams } from "../types";
import { makeTick } from "./fixtures";

/** sc-park-zebra / -night / -parallel: the long, narrow bay. Axis due north. */
const LONG_BAY = { x: 0, y: 0, headingDeg: 0, widthM: 2.5, lengthM: 5.5 } as const;
/** The eleven-drill bay (sc-park-left, -wall, -45-rev, -perp-rev, …). */
const SQUARE_BAY = { x: 0, y: 0, headingDeg: 0, widthM: 2.7, lengthM: 5.0 } as const;

function parkParams(
  bay: ParkInBayParams["bay"],
  centerTolM: number,
  headingTolDeg = 10,
): ObjectiveParams {
  return {
    kind: "completeManeuver",
    maneuver: "parkInBay",
    holdSec: 1.5,
    bay,
    centerTolM,
    headingTolDeg,
  };
}

/**
 * Drive the one manoeuvre this evaluator grades, on ANY authored bay: approach
 * along the bay axis in the gear the spec demands (so the entry gate is earned
 * inside PARK_MANEUVER_ZONE_M), come to rest at the offered bay-local pose, and
 * hold there past `holdSec`. Returns whether the objective completed — the same
 * question the task chip asks.
 *
 * `lonM` is depth along the bay axis (− = deeper in, toward the far end) and
 * `latM` is across it, so a case reads the same on a 45°, 135° or 270° bay as
 * it does on the due-north fixtures.
 */
function parkedAt(
  params: ObjectiveParams,
  rest: { lonM: number; latM: number; headingOffDeg?: number },
): boolean {
  const p = params as ParkInBayParams;
  const bay = p.bay;
  const h = (bay.headingDeg * Math.PI) / 180;
  const axX = Math.sin(h);
  const axY = Math.cos(h);
  const latX = Math.cos(h);
  const latY = -Math.sin(h);
  const at = (lon: number) => ({
    x: bay.x + lon * axX + rest.latM * latX,
    y: bay.y + lon * axY + rest.latM * latY,
  });
  // Reverse entry: the car faces +axis and backs in. Forward entry: it faces
  // −axis and drives in. The alignment fold is on the axis, so both read 0°.
  const forward = p.entry === "forward";
  const heading = bay.headingDeg + (forward ? 180 : 0) + (rest.headingOffDeg ?? 0);
  const gear = forward ? 1 : -1;
  const speedKmh = forward ? 6 : -6;

  let state = createEvalState(params);
  let done = false;
  // 8 m of approach along the axis from outside the bay, then 4 s at rest.
  for (let i = 0; i <= 16; i += 1) {
    const lon = rest.lonM + 8 * (1 - i / 16);
    const pos = at(lon);
    const r = stepObjective(
      params,
      state,
      makeTick({ t: i * 0.25, speedKmh, position: pos, headingDeg: heading, gear }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  const restPos = at(rest.lonM);
  for (let i = 1; i <= 16; i += 1) {
    const r = stepObjective(
      params,
      state,
      makeTick({ t: 4 + i * 0.25, speedKmh: 0, position: restPos, headingDeg: heading, gear }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  return done;
}

/** The due-north reverse fixtures below read better with the old name. */
function reverseParkTo(
  params: ObjectiveParams,
  rest: { lonM: number; latM: number; headingDeg?: number },
): boolean {
  const bay = (params as ParkInBayParams).bay;
  return parkedAt(params, {
    lonM: rest.lonM,
    latM: rest.latM,
    headingOffDeg: rest.headingDeg === undefined ? 0 : rest.headingDeg - bay.headingDeg,
  });
}

/** The pre-fix rule, kept here so every case below states both verdicts. */
function discWouldAccept(centerTolM: number, lonM: number, latM: number): boolean {
  return Math.hypot(lonM, latM) <= centerTolM;
}

describe("parkInBay acceptance follows the painted bay", () => {
  // -------------------------------------------------------------------------
  // §1 THE FALSE FAILURE — fully home in a long bay
  // -------------------------------------------------------------------------
  it("§1 credits a car reversed fully home in a 5.5 m bay, which the disc refused", () => {
    // 5.5/2 − 2.02 = 0.73 m of legitimate depth. 0.70 sits inside the paint
    // with 3 cm of bumper to spare — and 40 % outside a 0.5 m disc.
    const params = parkParams(LONG_BAY, 0.5);
    expect(discWouldAccept(0.5, -0.7, 0)).toBe(false); // the old verdict: refused
    expect(reverseParkTo(params, { lonM: -0.7, latM: 0 })).toBe(true);
  });

  it("§1 credits the same pose nose-first-deep as well as tail-deep", () => {
    const params = parkParams(LONG_BAY, 0.5);
    expect(discWouldAccept(0.5, 0.7, 0)).toBe(false);
    expect(reverseParkTo(params, { lonM: 0.7, latM: 0 })).toBe(true);
  });

  it("§1 opens the whole 2.46 m of a 6.5 m parallel gap, not its middle metre", () => {
    // sc-park-gap-long: depth slack 6.5/2 − 2.02 = 1.23 m each way.
    const gap = { x: 0, y: 0, headingDeg: 0, widthM: 2.5, lengthM: 6.5 } as const;
    const params = parkParams(gap, 0.5);
    expect(discWouldAccept(0.5, -1.2, 0)).toBe(false);
    expect(reverseParkTo(params, { lonM: -1.2, latM: 0 })).toBe(true);
  });

  // -------------------------------------------------------------------------
  // §2 THE FALSE PASS — the flank over the line
  // -------------------------------------------------------------------------
  it("§2 refuses a flank 0.10 m over the line of a 2.5 m bay, which the disc credited", () => {
    // 2.5/2 − 0.85 = 0.40 m across. At 0.50 the car is 0.10 m into the
    // neighbour, and hypot(0, 0.50) = 0.50 ≤ centerTolM — the old green tick.
    const params = parkParams(LONG_BAY, 0.5);
    expect(discWouldAccept(0.5, 0, 0.5)).toBe(true); // the old verdict: credited
    expect(reverseParkTo(params, { lonM: 0, latM: 0.5 })).toBe(false);
  });

  it("§2 refuses it on the L1 aid rung too — the ladder may not widen past paint", () => {
    // L1 „Пълна помощ" compiles centerTolM 0.75 on this bay: a third of a metre
    // of car inside the next bay, and the rung every sweep-161 leg was driven at.
    const params = parkParams(LONG_BAY, 0.75, 15);
    expect(discWouldAccept(0.75, 0, 0.75)).toBe(true);
    expect(reverseParkTo(params, { lonM: 0, latM: 0.75 })).toBe(false);
  });

  it("§2 still credits a car parked across the bay's own 0.40 m of room", () => {
    // The refusal above must be the PAINT talking, not a blanket tightening.
    const params = parkParams(LONG_BAY, 0.5);
    expect(reverseParkTo(params, { lonM: 0, latM: 0.38 })).toBe(true);
    expect(reverseParkTo(params, { lonM: 0, latM: -0.38 })).toBe(true);
  });

  // -------------------------------------------------------------------------
  // §3 THE BOUNDS STILL BITE
  // -------------------------------------------------------------------------
  it("§3 refuses a car hanging out of the long bay's end", () => {
    const params = parkParams(LONG_BAY, 0.5);
    expect(reverseParkTo(params, { lonM: -0.9, latM: 0 })).toBe(false);
  });

  it("§3 refuses a crooked park inside both bounds", () => {
    const params = parkParams(LONG_BAY, 0.5, 10);
    expect(reverseParkTo(params, { lonM: 0, latM: 0, headingDeg: 25 })).toBe(false);
  });

  it("§3 still refuses a park the car drove into forwards", () => {
    // The entry gate is untouched by the reshaping: no reverse, no credit.
    const params = parkParams(LONG_BAY, 0.5);
    let state = createEvalState(params);
    let done = false;
    for (let i = 0; i <= 32; i += 1) {
      const r = stepObjective(
        params,
        state,
        makeTick({
          t: i * 0.25,
          speedKmh: i <= 16 ? 6 : 0,
          position: { x: 0, y: i <= 16 ? -8 + 8 * (i / 16) : 0 },
          headingDeg: 0,
          gear: 1,
        }),
      );
      state = r.evalState;
      done = done || r.done;
    }
    expect(done).toBe(false);
  });

  // -------------------------------------------------------------------------
  // §4 THE AUTHORED FLOOR SURVIVES
  // -------------------------------------------------------------------------
  it("§4 leaves the 5.0 × 2.7 bay's acceptance where the ladder authored it", () => {
    // depth slack 0.48 < centerTolM 0.50, width slack 0.50 = centerTolM: the
    // eleven drills on this bay keep the authored tolerance on both axes.
    const params = parkParams(SQUARE_BAY, 0.5);
    expect(reverseParkTo(params, { lonM: -0.49, latM: 0 })).toBe(true);
    expect(reverseParkTo(params, { lonM: -0.55, latM: 0 })).toBe(false);
    expect(reverseParkTo(params, { lonM: 0, latM: 0.49 })).toBe(true);
    expect(reverseParkTo(params, { lonM: 0, latM: 0.55 })).toBe(false);
  });

  it("§4 the corner the disc cut off is now inside — same bay, same tolerance", () => {
    // hypot(0.45, 0.30) = 0.54 > 0.50, yet both axes are inside the paint and
    // inside the authored tolerance. This is the pose the disc turned into
    // „sloppy" on eleven drills at once.
    const params = parkParams(SQUARE_BAY, 0.5);
    expect(discWouldAccept(0.5, -0.45, 0.3)).toBe(false);
    expect(reverseParkTo(params, { lonM: -0.45, latM: 0.3 })).toBe(true);
  });

  // -------------------------------------------------------------------------
  // §6 «СПРИ НАПЪЛНО» — the hold clock must see a stop
  // -------------------------------------------------------------------------
  it("§6 refuses a car that reverses straight through the bay without stopping", () => {
    // 3 км/ч of continuous reverse — the shipped shadows' own creep speed —
    // crossing the whole 5.5 m bay. The car is inside the acceptance band for
    // well over holdSec, and never stops. Before the sign fold this completed.
    const params = parkParams(LONG_BAY, 0.5);
    let state = createEvalState(params);
    let done = false;
    let sawSpeed = 0;
    for (let i = 0; i <= 60; i += 1) {
      const t = i * 0.25;
      const r = stepObjective(
        params,
        state,
        makeTick({
          t,
          speedKmh: -3, // reverse reads negative — the whole point
          position: { x: 0, y: 4 - 0.208 * i }, // 0.83 m/s ≈ 3 км/ч
          headingDeg: 0,
          gear: -1,
        }),
      );
      state = r.evalState;
      done = done || r.done;
      sawSpeed += 1;
    }
    expect(sawSpeed).toBeGreaterThan(0);
    expect(done).toBe(false);
  });

  it("§6 still credits the same line once it actually comes to rest", () => {
    // The refusal above must be about MOTION, not about reverse — the drill is
    // performed in reverse and a fix that refused reverse would refuse the
    // lesson.
    const params = parkParams(LONG_BAY, 0.5);
    let state = createEvalState(params);
    let done = false;
    for (let i = 0; i <= 60; i += 1) {
      const t = i * 0.25;
      const moving = i <= 20;
      const r = stepObjective(
        params,
        state,
        makeTick({
          t,
          speedKmh: moving ? -3 : 0,
          position: { x: 0, y: moving ? 4 - 0.208 * i : 4 - 0.208 * 20 },
          headingDeg: 0,
          gear: -1,
        }),
      );
      state = r.evalState;
      done = done || r.done;
    }
    expect(done).toBe(true);
  });

  // -------------------------------------------------------------------------
  // §5 THE COPY LAW
  // -------------------------------------------------------------------------
  it("§5 pins the footprint to the collider it was measured off", () => {
    expect(PARK_CAR_HALF_LENGTH_M).toBe(CHASSIS_HALF_EXTENTS.z);
    expect(PARK_CAR_HALF_WIDTH_M).toBe(CHASSIS_HALF_EXTENTS.x);
  });
});

// ---------------------------------------------------------------------------
// §7 THE CENSUS — every compiled parking rung in the catalogue, every rung of
// the aid ladder. The cases above prove the rule on two fixtures; this proves
// the CATALOGUE obeys it, which is what stops a twenty-sixth bad row from
// appearing the way the reachZone families' did.
// ---------------------------------------------------------------------------

interface Rung {
  scenario: string;
  level: number;
  objectiveId: string;
  params: ParkInBayParams;
}

function compiledParkRungs(): Rung[] {
  const rows: Rung[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    for (const lvl of spec.levels ?? []) {
      const lesson = compileScenario(spec, lvl.level);
      for (const o of lesson.objectives) {
        const p = parseObjectiveParams(o);
        if (p.kind !== "completeManeuver" || p.maneuver !== "parkInBay") continue;
        rows.push({ scenario: spec.id, level: lvl.level, objectiveId: o.id, params: p });
      }
    }
  }
  return rows;
}

describe("§7 the compiled parking catalogue obeys the paint", () => {
  const rungs = compiledParkRungs();

  it("has rungs to talk about", () => {
    // 85 at the time of writing (17 drills × 5 levels). Asserted as a floor so
    // a compile regression that silently empties the census fails loudly
    // instead of passing vacuously.
    expect(rungs.length).toBeGreaterThanOrEqual(80);
  });

  // The two guards below DRIVE the shipped evaluator on every compiled rung
  // rather than restating the formula — a census that recomputed `min`/`max`
  // and compared it to itself would pass on the old code too and guard nothing.

  it("never credits a car whose flank is 5 cm over the painted line", () => {
    const offenders: string[] = [];
    for (const r of rungs) {
      const over = r.params.bay.widthM / 2 - PARK_CAR_HALF_WIDTH_M + 0.05;
      if (parkedAt(r.params, { lonM: 0, latM: over })) {
        offenders.push(`${r.scenario} L${r.level} credited lat=${over.toFixed(2)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never refuses a car resting squarely against the bay's own end", () => {
    const offenders: string[] = [];
    for (const r of rungs) {
      // 2 cm inside the paint at the deep end: bumper home, nothing over a line.
      const home = -(r.params.bay.lengthM / 2 - PARK_CAR_HALF_LENGTH_M - 0.02);
      if (!parkedAt(r.params, { lonM: home, latM: 0 })) {
        offenders.push(`${r.scenario} L${r.level} refused lon=${home.toFixed(2)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the aid ladder monotone — L1 is never stricter than L5", () => {
    // The ladder loosens `centerTolM` downward through the levels. Clamping to
    // the paint must not invert that: a beginner rung may lose the slack the
    // paint denies it, but it may never end up TIGHTER than the expert rung of
    // the same drill.
    const byDrill = new Map<string, Rung[]>();
    for (const r of rungs) {
      const key = `${r.scenario}/${r.objectiveId}`;
      byDrill.set(key, [...(byDrill.get(key) ?? []), r]);
    }
    const inversions: string[] = [];
    for (const [key, rows] of byDrill) {
      const sorted = [...rows].sort((a, b) => a.level - b.level);
      const tolOf = (r: Rung) => ({
        lon: Math.max(r.params.centerTolM, r.params.bay.lengthM / 2 - PARK_CAR_HALF_LENGTH_M),
        lat: Math.min(r.params.centerTolM, r.params.bay.widthM / 2 - PARK_CAR_HALF_WIDTH_M),
      });
      for (let i = 1; i < sorted.length; i += 1) {
        const lo = tolOf(sorted[i - 1]);
        const hi = tolOf(sorted[i]);
        if (lo.lon < hi.lon - 1e-9 || lo.lat < hi.lat - 1e-9) {
          inversions.push(`${key} L${sorted[i - 1].level}→L${sorted[i].level}`);
        }
      }
    }
    expect(inversions).toEqual([]);
  });

  it("leaves no bay too small for the car it asks to be parked in it", () => {
    // A bay narrower than the car has a NEGATIVE lateral slack, which clamps
    // the acceptance shut and makes the rung uncompletable — the exact failure
    // mode this whole lane exists to find, so it is asserted rather than left
    // to be discovered by a student.
    const impossible = rungs
      .filter(
        (r) =>
          r.params.bay.widthM / 2 - PARK_CAR_HALF_WIDTH_M <= 0 ||
          r.params.bay.lengthM / 2 - PARK_CAR_HALF_LENGTH_M <= 0,
      )
      .map((r) => `${r.scenario} L${r.level} ${r.params.bay.lengthM}x${r.params.bay.widthM}`);
    expect(impossible).toEqual([]);
  });
});
