/**
 * PARKING-DEPTH — SWEEP 161's TEN „BROKEN" ROWS, RE-READ AGAINST THE FRAMES.
 *
 * `parking3-claim-gates.test.ts` closed the half of those rows that was a
 * SENTENCE (a title certifying a duty its gate cannot read) and the half that
 * was a MISSING ACT (the blocked districts whose briefing never said to leave
 * the curb lane). What it did not do — because nobody had opened the PNGs —
 * is decide what the remaining verdicts actually measured. Four of them read
 *
 *     „Not one of the four legs passes … a lesson with a 0/4 pass rate on its
 *      own scripted correct drive is not teachable"
 *
 * and that sentence, taken at face value, invites exactly one fix: loosen the
 * terminal `parkInBay` until the sweep's own drive completes it. This file
 * exists to make that fix impossible to land quietly, and to record what the
 * frames show instead.
 *
 * WHAT THE FRAMES SHOW. `tools/mobile/lesson-audit.mjs` `right` mode is a
 * CONTROL LAW, not a script: closed-loop speed at CRUISE_KMH with a
 * roll/stop cadence. It never steers and it never selects R (it explicitly
 * REFUSES standstill brake presses — „refused 5 standstill brake presses
 * (would have selected R)", every parking run.log). So no leg of it can ever
 * complete a reverse-park, on any drill, in any catalogue. And the collisions
 * it was convicted for are not the drills':
 *
 *   .audit-frames/sweep161/sc-park-gap-short/mobile-right/04-t156s.png — the
 *     car is on open GRASS, no road and no parked car in frame, 16 s BEFORE
 *     the ПТП card appears in 04-t172s.png. Задача 1 had ticked at 1:41.
 *   .audit-frames/sweep161/sc-park-left/mobile-right/04-t131s.png — the same
 *     empty field, 7 s before that run's ПТП. Задача 1 had ticked at 1:37.
 *
 * i.e. the drive finished the only objective a forward-only driver can
 * finish, kept rolling north out of a lot whose aisle ends at y = 40, and was
 * billed for leaving the world. That is a world-bounds finding and it is not
 * this file's; what IS this file's is that the two „0/4, not teachable"
 * verdicts are FALSE for gap-short, gap-long, left and zebra — all four
 * ticked Задача 1 on BOTH platforms — and TRUE, for a reason already fixed in
 * the copy, for van, wall and 45-rev.
 *
 * So the two rules below are the two directions of the same claim:
 *
 *   §1/§2  the drills whose halt gate a lane-holding drive can reach are
 *          exactly the ones the sweep ticked — computed from the committed
 *          district and this file's own params, never from the debriefs.
 *   §3     and no forward-only drive completes a terminal park on ANY of the
 *          ten, at ANY rung — with the counter-proof that the same evaluator
 *          DOES complete for a reverse (or authored-forward) entry, so §3 is
 *          not a rule that refuses everybody.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTick } from "../../../rules/types";
import { PARKED_CAR_HALF_LENGTH_M, PARKED_CAR_HALF_WIDTH_M } from "../../../traces";
import { createEvalState, parseObjectiveParams } from "../../objectives";
import { stepObjective } from "../../objectives";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES_PARKING3 } from "../templates-parking3";
import type { ScenarioLevel, ScenarioSpec } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

interface BayMeta {
  id: string;
  x: number;
  y: number;
  headingDeg: number;
  widthM: number;
  lengthM: number;
  occupied: boolean;
}

function district(id: string): {
  meta: { scenario: { bays: BayMeta[] } };
  spawnPoints: Array<{ id: string; x: number; y: number; heading: number }>;
} {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as never;
}

const byId = (id: string): ScenarioSpec => {
  const s = SCENARIO_TEMPLATES_PARKING3.find((p) => p.id === id);
  if (!s) throw new Error(`no parking3 template ${id}`);
  return s;
};

/** Half-extents in world x/y of a rect of `lengthM` along `headingDeg`. */
function extents(headingDeg: number, widthM: number, lengthM: number): { ex: number; ey: number } {
  const h = (headingDeg * Math.PI) / 180;
  const s = Math.abs(Math.sin(h));
  const c = Math.abs(Math.cos(h));
  return { ex: (lengthM * s + widthM * c) / 2, ey: (lengthM * c + widthM * s) / 2 };
}

/** Half-width of the student's car, m — the ego twin of PARKED_CAR_HALF_WIDTH_M. */
const EGO_HALF_WIDTH_M = 0.9;

/**
 * The free width left beside a drill's own occupied row for a car that HOLDS
 * the drawn curb lane it spawns in — measured, per `metric`, against either
 *
 *   "car"   the rect the scene actually mounts (`lotObstacleRects` →
 *           PARKED_CAR_HALF_*), i.e. the thing that can be collided with, or
 *   "paint" the bay's own widthM/lengthM, i.e. the U-stroke on the tarmac.
 *
 * They are NOT the same number and §1 pins the gap: on every parallel row in
 * this family the paint reaches 0.35 m further into the lane than the car
 * standing in it does. `parking3-claim-gates.test.ts` §3 classifies on the
 * paint, which is the conservative direction HERE only because every bay in
 * this family is drawn wider/longer than the car parked in it. That is a
 * property of `gen_parking_lot.mjs`'s current numbers, not a law, so the two
 * metrics are measured side by side rather than assumed to agree.
 */
function curbLaneClearance(spec: ScenarioSpec, metric: "car" | "paint"): number {
  const raw = district(spec.map.districtId);
  const spawn = raw.spawnPoints.find((p) => p.id === spec.start.spawnPointId)!;
  const egoRight = spawn.x + EGO_HALF_WIDTH_M;
  let nearest = Infinity;
  for (const b of raw.meta.scenario.bays) {
    if (!b.occupied) continue;
    // Only the row on the driver's own side of the aisle can block him.
    if (Math.sign(b.x) !== Math.sign(spawn.x)) continue;
    const e =
      metric === "car"
        ? extents(b.headingDeg, PARKED_CAR_HALF_WIDTH_M * 2, PARKED_CAR_HALF_LENGTH_M * 2)
        : extents(b.headingDeg, b.widthM, b.lengthM);
    nearest = Math.min(nearest, b.x - e.ex);
  }
  return nearest - egoRight;
}

/**
 * The y of the FIRST mounted car that stands in the spawn lane — i.e. the
 * southern edge of the southernmost occupied bay whose rect overlaps the lane.
 * `null` when the lane runs clear the whole length of the row.
 */
function firstLaneBlockerY(spec: ScenarioSpec): number | null {
  const raw = district(spec.map.districtId);
  const spawn = raw.spawnPoints.find((p) => p.id === spec.start.spawnPointId)!;
  const egoRight = spawn.x + EGO_HALF_WIDTH_M;
  let southmost: number | null = null;
  for (const b of raw.meta.scenario.bays) {
    if (!b.occupied) continue;
    if (Math.sign(b.x) !== Math.sign(spawn.x)) continue;
    const e = extents(b.headingDeg, PARKED_CAR_HALF_WIDTH_M * 2, PARKED_CAR_HALF_LENGTH_M * 2);
    if (b.x - e.ex >= egoRight) continue; // clears the lane
    const southEdge = b.y - e.ey;
    if (southmost === null || southEdge < southmost) southmost = southEdge;
  }
  return southmost;
}

/** The drill's Задача-1 halt mark (all ten author a reachZone there). */
function setupMark(spec: ScenarioSpec): { x: number; y: number } {
  const p = spec.success[0]!.params as { kind: string; x: number; y: number };
  if (p.kind !== "reachZone") throw new Error(`${spec.id} first objective is ${p.kind}`);
  return { x: p.x, y: p.y };
}

// ---------------------------------------------------------------------------
// §1 — the corridor, measured against the rect that can actually be hit
// ---------------------------------------------------------------------------

describe("§1 — the curb-lane corridor is measured on the mounted car, not the paint", () => {
  /**
   * Measured 2026-08-18 off the committed districts. The four negatives are
   * the perpendicular/echelon rows whose 5 m of bay depth crosses the only
   * drawn lane; the +0.420 m is every parallel row in the family — 42 cm
   * between the ego's flank and a parked car's, held for the whole length of
   * the row. Neither number is authored anywhere: both fall out of
   * `gen_parking_lot.mjs`'s `bayCenterX` and the spawn lane's 4.0625 m.
   */
  const CORRIDOR_M: ReadonlyArray<readonly [id: string, car: number, paint: number]> = [
    ["sc-park-gap-short", 0.42, 0.07],
    ["sc-park-gap-long", 0.42, 0.07],
    ["sc-park-van", -2.18, -2.43],
    ["sc-park-45-rev", -2.387, -2.882],
    ["sc-park-zebra", 0.42, 0.07],
    ["sc-park-wall", -2.18, -2.43],
    ["sc-park-night", 0.42, 0.07],
    ["sc-park-double", -2.18, -2.43],
    ["sc-park-judge", 0.42, 0.07],
  ];

  it("every drill's corridor is the committed number, on both metrics", () => {
    for (const [id, car, paint] of CORRIDOR_M) {
      expect(curbLaneClearance(byId(id), "car"), `${id} car-rect corridor`).toBeCloseTo(car, 3);
      expect(curbLaneClearance(byId(id), "paint"), `${id} paint-rect corridor`).toBeCloseTo(
        paint,
        3,
      );
    }
    // sc-park-left is the one drill whose row is on the OTHER side of the
    // aisle, so nothing of its own can stand in its lane. Both metrics say so.
    for (const m of ["car", "paint"] as const) {
      expect(curbLaneClearance(byId("sc-park-left"), m)).toBe(Infinity);
    }
  });

  it("COUNTER-PROOF: the two metrics disagree by 0.35 m on every parallel row", () => {
    // If they agreed, measuring on the mounted car would be cosmetic and this
    // rule would be guarding nothing. They do not: the bay U-paint is drawn
    // 2.5 m wide around a 1.8 m car, so the paint reaches a third of a metre
    // further into the lane than anything that can be collided with.
    const parallel = CORRIDOR_M.filter(([, car]) => car > 0).map(([id]) => id);
    expect(parallel).toHaveLength(5);
    for (const id of parallel) {
      const spec = byId(id);
      expect(
        curbLaneClearance(spec, "car") - curbLaneClearance(spec, "paint"),
        `${id}: the paint and the car agree — the metric would be a free choice`,
      ).toBeCloseTo(0.35, 3);
    }
  });

  it("…and the blocked set is the same under both metrics, today", () => {
    // Which is WHY parking3-claim-gates §3 is sound as written — every bay in
    // this family is drawn wider than the car parked in it, so the paint is
    // the conservative side. This assertion is what goes red if a regenerated
    // district ever inverts that, and it is the reason the two are kept apart.
    const blocked = (m: "car" | "paint") =>
      SCENARIO_TEMPLATES_PARKING3.filter((s) => curbLaneClearance(s, m) < 0)
        .map((s) => s.id)
        .sort();
    expect(blocked("car")).toEqual(["sc-park-45-rev", "sc-park-double", "sc-park-van", "sc-park-wall"]);
    expect(blocked("car")).toEqual(blocked("paint"));
  });
});

// ---------------------------------------------------------------------------
// §2 — the reachability split reproduces the sweep's own ✓/– column
// ---------------------------------------------------------------------------

/**
 * WHAT SWEEP 161 ACTUALLY RECORDED for Задача 1 on the `right` legs, read out
 * of the run logs beside the frames (`.audit-frames/sweep161/<id>/<leg>/
 * run.log`, the „Задачи от маршрута" block of the debrief). Both platforms
 * agreed on every drill, so one column is enough. sc-park-night, sc-park-
 * double and sc-park-judge were not driven in that sweep — no log exists —
 * and they are deliberately NOT listed: an observation nobody made is not
 * evidence, and §2 predicts them instead.
 */
const SWEEP161_SETUP_TICKED: ReadonlyArray<readonly [id: string, ticked: boolean]> = [
  ["sc-park-gap-short", true], // ✓ 1:41 mobile · 1:21 pc
  ["sc-park-gap-long", true], // ✓ 1:17 mobile · 1:13 pc
  ["sc-park-van", false], // – both legs
  ["sc-park-45-rev", false], // – both legs
  ["sc-park-left", true], // ✓ 1:37 mobile · 1:26 pc
  ["sc-park-zebra", true], // ✓ 1:43 mobile · 1:33 pc
  ["sc-park-wall", false], // – both legs
];

describe("§2 — a lane-holding drive reaches exactly the halt gates the sweep ticked", () => {
  /**
   * Can a car that never leaves the drawn curb lane get as far north as the
   * drill's own Задача-1 mark? It can iff no mounted car of its own row stands
   * in that lane south of the mark. Nothing here reads a debrief: the blocker
   * comes from the district, the mark from this file.
   */
  function setupMarkReachableInLane(spec: ScenarioSpec): boolean {
    const blockerY = firstLaneBlockerY(spec);
    return blockerY === null || setupMark(spec).y < blockerY;
  }

  it("predicts all seven driven drills, and gets seven of seven", () => {
    for (const [id, ticked] of SWEEP161_SETUP_TICKED) {
      expect(
        setupMarkReachableInLane(byId(id)),
        `${id}: geometry says ${!ticked ? "reachable" : "blocked"}, sweep 161 says ${ticked ? "✓" : "–"}`,
      ).toBe(ticked);
    }
  });

  it("REFUTATION: the four „0/4, not teachable“ drills all have a reachable halt gate", () => {
    // The literal sweep-161 wording on sc-park-gap-long was «Not one of the
    // four legs passes … a lesson with a 0/4 pass rate on its own scripted
    // correct drive is not teachable», and sc-park-left's was «Passing is
    // impossible». Both were written from a debrief, not from a frame. The
    // first objective of each ticked on both platforms; only the reverse-park
    // did not, and §3 below is why no forward-only driver could ever have
    // taken it.
    for (const id of ["sc-park-gap-short", "sc-park-gap-long", "sc-park-left", "sc-park-zebra"]) {
      expect(setupMarkReachableInLane(byId(id)), id).toBe(true);
      expect(firstLaneBlockerY(byId(id)), `${id} has no lane blocker at all`).toBe(null);
    }
  });

  it("…and the three that failed it are the blocked districts, whose copy now says so", () => {
    // Not a new finding — parking3-claim-gates §3 already made every blocked
    // drill name the aisle position. This asserts the two facts are the SAME
    // fact, so a future edit cannot drop the briefing step while leaving the
    // geometry that makes it necessary.
    for (const id of ["sc-park-van", "sc-park-45-rev", "sc-park-wall"]) {
      const spec = byId(id);
      expect(setupMarkReachableInLane(spec), id).toBe(false);
      expect(curbLaneClearance(spec, "car")).toBeLessThan(0);
      const copy = spec.instructionsBg.map((s) => s.textBg).join(" ");
      expect(/средата на алеята/iu.test(copy), `${id} lost its aisle step`).toBe(true);
    }
  });

  it("predicts the three drills sweep 161 never drove", () => {
    // sc-park-double is blocked (a 90° row, same as van/wall) and must
    // therefore carry the aisle step; night and judge are parallel rows with
    // the 0.42 m corridor and a reachable mark. Stated as a prediction so the
    // next sweep either confirms it or lands here as a real finding.
    expect(setupMarkReachableInLane(byId("sc-park-double"))).toBe(false);
    expect(/средата на алеята/iu.test(byId("sc-park-double").instructionsBg.map((s) => s.textBg).join(" "))).toBe(true);
    for (const id of ["sc-park-night", "sc-park-judge"]) {
      expect(setupMarkReachableInLane(byId(id)), id).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// §3 — the false-pass guard: what the „0/4" verdict invites, refused
// ---------------------------------------------------------------------------

/** A SimTick with everything the parking evaluators read, and nothing else. */
function tick(over: Partial<SimTick>): SimTick {
  return {
    t: 0,
    speedKmh: 0,
    maxSpeedKmh: 20,
    position: { x: 0, y: 0 },
    headingDeg: 0,
    laneOffsetM: 0,
    laneId: 0,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    isNight: false,
    events: [],
    ...over,
  };
}

/** The drill's terminal objective, compiled at `level`. */
function terminalPark(spec: ScenarioSpec, level: ScenarioLevel) {
  const lesson = compileScenario(spec, level);
  const objective = lesson.objectives[lesson.objectives.length - 1]!;
  const params = parseObjectiveParams(objective);
  if (params.kind !== "completeManeuver" || params.maneuver !== "parkInBay") {
    throw new Error(`${spec.id}@L${level}: terminal objective is not a parkInBay`);
  }
  return params;
}

describe("§3 — no forward-only drive up the spawn lane completes a terminal park", () => {
  /**
   * THE DRIVE THE SWEEP ACTUALLY MADE, reproduced against the production
   * evaluator: hold the lane the car spawns in, face north, stay in D, creep
   * and stop, and run the whole length of the lot. This is the drive whose
   * debrief said „0/4 … not teachable"; if a later edit ever makes it
   * complete a park, that is a green tick for a manoeuvre nobody performed.
   */
  function driveTheLaneForwards(spec: ScenarioSpec, level: ScenarioLevel): boolean {
    const raw = district(spec.map.districtId);
    const spawn = raw.spawnPoints.find((p) => p.id === spec.start.spawnPointId)!;
    const params = terminalPark(spec, level);
    let state = createEvalState(params);
    let t = 0;
    // 1 m steps from the spawn to the north end of every lot in the family
    // (bounds maxY = 40), stopping dead for 3 s every 10 m — the roll/stop
    // cadence of `lesson-audit.mjs` `right`, which is what makes the halt
    // gates tick and is therefore the honest thing to replay here.
    for (let y = spawn.y; y <= 41; y += 1) {
      const holds = Math.abs(y % 10) < 1e-9 ? 4 : 1;
      for (let k = 0; k < holds; k++) {
        t += 1;
        const r = stepObjective(
          params,
          state,
          tick({
            t,
            speedKmh: holds > 1 ? 0 : 15,
            position: { x: spawn.x, y },
            headingDeg: 0,
            gear: 1,
          }),
        );
        state = r.evalState;
        if (r.done) return true;
      }
    }
    return false;
  }

  it("is refused on all ten drills, at every rung", () => {
    const passed: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_PARKING3) {
      for (const rung of spec.levels) {
        if (driveTheLaneForwards(spec, rung.level)) passed.push(`${spec.id}@L${rung.level}`);
      }
    }
    expect(passed, `a forward-only lane run was credited a park: ${passed.join(", ")}`).toEqual([]);
  });

  /**
   * …AND THE MARGIN IS NOT THE SAME EVERYWHERE, which is the part worth
   * writing down.
   *
   * On the six parallel drills the lane never enters the bay rect at all — the
   * kerb slot sits 2.22 m across from it — so `inBay` alone refuses them and
   * every other clause is spare. On the four blocked drills the lane runs
   * THROUGH the bay (the same 5 m of depth that blocks the lane in §1 is the
   * depth that reaches out to meet it), so those four are refused by the
   * ENTRY GEAR and the HEADING and by nothing else.
   *
   * Of those four, three keep a real centring margin: the lane passes 0.97 m
   * from a 90° bay's centre against an L1 `centerTolM` of 0.5 × 1.5 = 0.75.
   * sc-park-45-rev does not — its echelon bay's centre is 0.74 m from the
   * lane, ONE CENTIMETRE inside the same tolerance. It is not a defect today
   * (a park needs `usedReverse` AND the heading, and a north-facing car is 45°
   * out of a 135° bay), but the centring half of that gate is one authored
   * digit from crediting a car that drove past, and the digit is in THIS file.
   * Widening `centerTolM` there — the obvious way to answer „the correct drive
   * never completes it" — turns the margin negative, and this test says so.
   */
  it("records WHY each drill refuses it, and the 1 cm margin on sc-park-45-rev", () => {
    const insideTheBay: string[] = [];
    /** Closest approach of the spawn lane to the bay centre, minus the L1 tolerance. */
    const centringMargin = new Map<string, number>();
    for (const spec of SCENARIO_TEMPLATES_PARKING3) {
      const raw = district(spec.map.districtId);
      const spawn = raw.spawnPoints.find((p) => p.id === spec.start.spawnPointId)!;
      const { bay } = terminalPark(spec, 3);
      const h = (bay.headingDeg * Math.PI) / 180;
      // Bay-local frame, the evaluator's own convention.
      let anyInside = false;
      for (let y = -30; y <= 41; y += 0.25) {
        const relX = spawn.x - bay.x;
        const relY = y - bay.y;
        const lon = relX * Math.sin(h) + relY * Math.cos(h);
        const lat = relX * Math.cos(h) - relY * Math.sin(h);
        if (Math.abs(lon) <= bay.lengthM / 2 && Math.abs(lat) <= bay.widthM / 2) anyInside = true;
      }
      if (anyInside) insideTheBay.push(spec.id);
      const l1 = terminalPark(spec, 1);
      centringMargin.set(spec.id, Math.abs(spawn.x - l1.bay.x) - l1.centerTolM);
    }
    // The lane crosses exactly the bays whose row blocks it — the same set §1
    // measures negative, arrived at from the opposite end.
    expect(insideTheBay.sort()).toEqual(
      ["sc-park-45-rev", "sc-park-double", "sc-park-van", "sc-park-wall"].sort(),
    );

    // Only one drill's lane is inside its own L1 centring tolerance.
    const inside = [...centringMargin.entries()].filter(([, m]) => m < 0).map(([id]) => id);
    expect(inside).toEqual(["sc-park-45-rev"]);
    expect(centringMargin.get("sc-park-45-rev")!).toBeCloseTo(-0.01, 3);
    // …and the three other blocked drills keep a real one, measured.
    for (const id of ["sc-park-van", "sc-park-wall", "sc-park-double"]) {
      expect(centringMargin.get(id)!, id).toBeCloseTo(0.22, 3);
    }
  });

  /**
   * THE OPPOSITE DIRECTION. A rule that refuses every drive is not a gate, it
   * is a wall — and a wall is exactly what the sweep's verdict accused these
   * ten of being. So the same evaluator, the same compiled params, and a
   * drive that DOES perform the authored manoeuvre must complete on all ten,
   * at every rung.
   */
  function parkProperly(spec: ScenarioSpec, level: ScenarioLevel): boolean {
    const params = terminalPark(spec, level);
    const { bay } = params;
    const h = (bay.headingDeg * Math.PI) / 180;
    const ax = { x: Math.sin(h), y: Math.cos(h) };
    // The authored entry gear: `entry: "forward"` on sc-park-gap-long (its
    // whole subject is that a 12.7 m gap needs no reverse), reverse elsewhere.
    const gear = params.entry === "forward" ? 1 : -1;
    let state = createEvalState(params);
    let t = 0;
    const at = (alongM: number, speedKmh: number) =>
      tick({
        t: (t += 0.5),
        speedKmh,
        position: { x: bay.x + ax.x * alongM, y: bay.y + ax.y * alongM },
        headingDeg: bay.headingDeg,
        gear,
      });
    // Approach on the bay axis from 8 m out (inside PARK_MANEUVER_ZONE_M, so
    // the entry-gear credit latches), enter, stop, and hold past holdSec.
    for (const alongM of [-8, -6, -4, -2, -1]) {
      state = stepObjective(params, state, at(alongM, 4)).evalState;
    }
    for (let k = 0; k < 20; k++) {
      const r = stepObjective(params, state, at(0, 0));
      state = r.evalState;
      if (r.done) return true;
    }
    return false;
  }

  it("COUNTER-PROOF: the authored manoeuvre completes on all ten, at every rung", () => {
    const refused: string[] = [];
    for (const spec of SCENARIO_TEMPLATES_PARKING3) {
      for (const rung of spec.levels) {
        if (!parkProperly(spec, rung.level)) refused.push(`${spec.id}@L${rung.level}`);
      }
    }
    expect(
      refused,
      `the terminal gate refuses its own manoeuvre — §3 would be a wall, not a gate: ${refused.join(", ")}`,
    ).toEqual([]);
  });
});
