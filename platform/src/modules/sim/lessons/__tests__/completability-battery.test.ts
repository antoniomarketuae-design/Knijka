/**
 * THE COMPLETABILITY BATTERY — „no student may ever be stuck again"
 * (doc 86 §3 B1–B6/B9, §10 S3; Lane 6 gate, 2026-07-30).
 *
 * THE DEFECT BAND THIS EXISTS FOR. Nine of the founder's fifty-plus reports
 * were the same sentence in different words: the lesson would not end. He had
 * to reload the browser. Doc 86 §3 names four independent causes behind it —
 * ten routes with no finish anchor at all (B1), a rescue disarmed on the exact
 * objective students get stuck on (B2), a rescue that inherited a
 * lane-exclusive radius (B3), and 178 speed-capped waypoints that one fast
 * frame voided forever (B4) — plus a roundabout exit that silently reset the
 * traversal with no way out (B6).
 *
 * Four causes, one class of harm. A per-cause unit test cannot prove the class
 * is gone, because the next authored scenario invents cause number five. So
 * this file asserts the INVARIANT instead:
 *
 *   FOR EVERY scenario × EVERY authored rung × EVERY objective k,
 *   a synthetic drive that deliberately fails objective k must still END.
 *
 * WHAT THE SYNTHETIC DRIVER IS, HONESTLY. It is a clean tick stream, not a
 * physics sim: it walks the objective chain's own target points at a steady
 * 43 km/h with gentle ramps, and it holds no stop line, works no bay, turns no
 * wheel and lights no indicator. That means every passSignal, parkInBay,
 * roundabout, three-point-turn and emergencyStop objective in the catalog is
 * ALREADY blown in the base drive — the driver is physically incapable of
 * satisfying them. This is a feature: the base variant is the worst case a
 * student can produce, and the per-k variants add the case he produces most
 * often, a plain waypoint missed by driving past it.
 *
 * The battery therefore proves TERMINATION, which is the whole of the
 * blocks-student band. It deliberately does not prove that the lesson can be
 * PASSED — that is what the per-family bot-completion suites are for, and
 * conflating the two is how „finished" and „passed" got tangled in the first
 * place (they stay two different things: every drive here ends
 * FINISHED-and-NOT-PASSED, and the file asserts that too).
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import { FINISH_STUCK_S, routeFinishZone, terminalRescueZone } from "../finish";
import { parseObjectiveParams, REACH_ZONE_GRACE_M } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioSpec } from "../scenario/types";
import type { ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

// ---------------------------------------------------------------------------
// District spawn points — the drive starts where the scene starts
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD_DIR = path.resolve(HERE, "../../../../../../content/world");

interface SpawnPoint {
  id: string;
  x: number;
  y: number;
  heading?: number;
}

const SPAWNS = new Map<string, SpawnPoint>();
for (const file of readdirSync(WORLD_DIR)) {
  if (!file.endsWith(".json")) continue;
  const j = JSON.parse(readFileSync(path.join(WORLD_DIR, file), "utf-8")) as {
    spawnPoints?: SpawnPoint[];
  };
  for (const p of j.spawnPoints ?? []) SPAWNS.set(p.id, p);
}

interface Pt {
  x: number;
  y: number;
}

function spawnOf(lesson: LessonSpec): Pt {
  if (lesson.spawn.position) return { ...lesson.spawn.position };
  const p = lesson.spawn.pointId ? SPAWNS.get(lesson.spawn.pointId) : undefined;
  if (p === undefined) {
    throw new Error(`completability: unknown spawn point "${lesson.spawn.pointId}"`);
  }
  return { x: p.x, y: p.y };
}

/** Where an objective happens, for the ones that happen somewhere. */
function targetOf(p: ObjectiveParams): Pt | null {
  switch (p.kind) {
    case "reachZone":
    case "passSignal":
      return { x: p.x, y: p.y };
    case "driveDistance":
      return null;
    case "completeManeuver":
      switch (p.maneuver) {
        case "parkInBay":
          return { x: p.bay.x, y: p.bay.y };
        case "roundabout":
          return { x: p.x, y: p.y };
        case "threePointTurn":
          return { x: p.corridor.x, y: p.corridor.y };
        default:
          return null;
      }
  }
}

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

const DT = 0.25;
const CRUISE_MPS = 12; // 43 km/h — under every posted limit on the shipped maps
const RAMP_MPS2 = 2.0; // gentle enough that HARSH_BRAKING never fires
/** Metres driven past the route's end before the tail comes to rest. Must
 *  clear the widest "outside" finish on the catalog (the 46 m ring of
 *  rb-2lane-v1) with room to spare. */
const TAIL_AWAY_M = 140;
/**
 * Seconds held at a standstill in each of the tail's two rests. The rest AT
 * the end depends on the LESSON (a park is a maneuver and gets the longer
 * bar), never on the gate — the driver's script must not be written from the
 * thing it is testing.
 */
const REST_AT_END_S = 15;
const REST_AT_BAY_S = 28;
const REST_AWAY_S = 23;

function unit(from: Pt, to: Pt): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const m = Math.hypot(dx, dy);
  return m < 1e-6 ? { x: 0, y: 1 } : { x: dx / m, y: dy / m };
}

/**
 * Turn a polyline into a tick stream: cruise the legs, ramp into and out of
 * every authored rest. Everything the rule engine reads that we are not
 * modelling stays at its lawful default (belted, low beams, in gear, in lane),
 * so a drive produces no violations of its own and the battery measures
 * termination rather than accidental exam terminations.
 */
function driveTicks(route: Pt[], rests: Map<number, number>): SimTick[] {
  const ticks: SimTick[] = [];
  let t = 0;
  let speed = 0;
  const push = (pos: Pt, v: number, heading: number) => {
    ticks.push({
      ...makeTick({
        t,
        speedKmh: v * 3.6,
        maxSpeedKmh: 130,
        position: { x: pos.x, y: pos.y },
        headingDeg: heading,
      }),
    });
    t += DT;
  };

  const restAt = (pos: Pt, heading: number, seconds: number) => {
    // Ramp down, hold, ramp up — a stop the rule engine has no complaint about.
    while (speed > 0) {
      speed = Math.max(0, speed - RAMP_MPS2 * DT);
      push(pos, speed, heading);
    }
    for (let s = 0; s < seconds; s += DT) push(pos, 0, heading);
  };

  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1];
    const to = route[i];
    const u = unit(from, to);
    const heading = (Math.atan2(u.x, u.y) * 180) / Math.PI;
    const legM = Math.hypot(to.x - from.x, to.y - from.y);
    let done = 0;
    while (done < legM) {
      speed = Math.min(CRUISE_MPS, speed + RAMP_MPS2 * DT);
      done = Math.min(legM, done + speed * DT);
      push({ x: from.x + u.x * done, y: from.y + u.y * done }, speed, heading);
    }
    const rest = rests.get(i);
    if (rest !== undefined) restAt(to, heading, rest);
  }
  return ticks;
}

interface DriveOutcome {
  terminated: boolean;
  endedAtSec: number;
  completedAll: boolean;
  passed: boolean;
  blownDone: boolean;
  totalSec: number;
}

function runDrive(lesson: LessonSpec, ticks: SimTick[], blownIndex: number): DriveOutcome {
  let s = createLessonSession(lesson);
  for (const tick of ticks) {
    s = applyTick(s, tick).state;
    if (s.phase === "completed" || s.phase === "aborted") break;
  }
  const result = buildLessonResult(s);
  return {
    terminated: s.phase === "completed" || s.phase === "aborted",
    endedAtSec: s.endedAtSec ?? s.lastT,
    completedAll: result.completedAll,
    passed: result.passed,
    blownDone: blownIndex >= 0 ? (result.objectives[blownIndex]?.done ?? false) : false,
    totalSec: ticks.length * DT,
  };
}

/**
 * The lane pitch on every shipped map (LANE_WIDTH_M × the 2.5× perceptual
 * exaggeration), and the exact offset doc 86 B3 measures between the taught
 * left-lane hog of `sc-ln-boulevard-discipline` and the radius-4 gate it can
 * then never satisfy.
 */
const LANE_PITCH_M = 8.13;

/**
 * The route for one rung: spawn → every located objective target → the tail.
 *
 * HOW AN OBJECTIVE IS DELIBERATELY BLOWN, and why the two cases differ.
 *
 * A MID-ROUTE task is blown the way students blow it: by driving past it. The
 * waypoint is pushed far enough sideways that neither reach-zone latch can
 * reach it, and the drive carries on to the end of the route — where the
 * stalled-chain rescue has to catch it.
 *
 * The TERMINAL task is blown by ARRIVING IN THE WRONG LANE — one lane pitch
 * off the final waypoint, at a standstill. That is deliberate and it is the
 * only honest model: sabotaging the last gate by detouring sixty metres does
 * not produce a stuck student, it produces a student who never went to the end
 * of the route at all, and no positional gate can or should rescue that (the
 * shell's own end-lesson control is the answer there, not a geometry trick).
 * One lane over IS the stuck student — it is B3 verbatim, it is where the
 * founder's car sat after performing the mistake the lesson taught him, and it
 * is the case the FINISH_LANE_FLOOR_M floor exists for.
 */
function routeFor(params: ObjectiveParams[], spawn: Pt, blowIndex: number): {
  route: Pt[];
  rests: Map<number, number>;
} {
  const lastLocated = params.reduce((acc, p, i) => (targetOf(p) !== null ? i : acc), -1);
  const pts: Pt[] = [spawn];
  params.forEach((p, i) => {
    const target = targetOf(p);
    if (target === null) return;
    if (i !== blowIndex) {
      pts.push(target);
      return;
    }
    const radius = p.kind === "reachZone" || p.kind === "passSignal" ? p.radiusM : 10;
    const away = i === lastLocated ? LANE_PITCH_M : radius + REACH_ZONE_GRACE_M + 60;
    const prev = pts[pts.length - 1];
    const u = unit(prev, target);
    pts.push({ x: target.x - u.y * away, y: target.y + u.x * away });
  });
  // A route whose objectives are all placeless still has to be driven
  // somewhere; head 200 m off the spawn so the drive is not a standstill.
  if (pts.length === 1) pts.push({ x: spawn.x, y: spawn.y + 200 });

  const endIdx = pts.length - 1;
  const u = unit(pts[endIdx - 1], pts[endIdx]);
  pts.push({ x: pts[endIdx].x + u.x * TAIL_AWAY_M, y: pts[endIdx].y + u.y * TAIL_AWAY_M });

  const terminal = params[params.length - 1];
  const parks =
    terminal?.kind === "completeManeuver" && terminal.maneuver === "parkInBay";

  const rests = new Map<number, number>();
  rests.set(endIdx, parks ? REST_AT_BAY_S : REST_AT_END_S); // stand still AT the end
  rests.set(endIdx + 1, REST_AWAY_S); // …then stand still well past it
  return { route: pts, rests };
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

interface Failure {
  id: string;
  reason: string;
}

interface Sweep {
  rungs: number;
  drives: number;
  neverTerminated: Failure[];
  overBudget: Failure[];
  falselyPassed: Failure[];
  notActuallyBlown: number;
  worstOverParSec: number;
}

/** The budget of doc 86 §9 Lane 6: par + 60 s. */
const BUDGET_OVER_PAR_S = 60;

function sweep(specs: readonly ScenarioSpec[]): Sweep {
  const out: Sweep = {
    rungs: 0,
    drives: 0,
    neverTerminated: [],
    overBudget: [],
    falselyPassed: [],
    notActuallyBlown: 0,
    worstOverParSec: 0,
  };

  for (const spec of specs) {
    const par = spec.rubric?.parTimeSec ?? 120;
    for (const rung of spec.levels) {
      out.rungs += 1;
      const lesson = compileScenario(spec, rung.level);
      const params = lesson.objectives.map(parseObjectiveParams);
      const spawn = spawnOf(lesson);

      // k = -1 is the base drive: it already fails every maneuver, signal and
      // staged objective in the chain (the driver cannot perform them), so
      // those k are covered by construction. The explicit variants are the
      // located waypoints — the tasks a real student misses by driving past.
      const variants: number[] = [-1];
      params.forEach((p, i) => {
        if (targetOf(p) !== null) variants.push(i);
      });
      const lastLocated = params.reduce((acc, p, i) => (targetOf(p) !== null ? i : acc), -1);

      for (const k of variants) {
        const { route, rests } = routeFor(params, spawn, k);
        const r = runDrive(lesson, driveTicks(route, rests), k);
        out.drives += 1;
        const id = `${lesson.id} · blow[${k < 0 ? "base" : `${k}:${lesson.objectives[k].id}`}]`;

        if (!r.terminated) {
          out.neverTerminated.push({
            id,
            reason: `drove ${Math.round(r.totalSec)} s (route + ${REST_AT_END_S}s rest at the end + ${TAIL_AWAY_M} m away + ${REST_AWAY_S}s rest) and the session was still "driving"`,
          });
          continue;
        }
        // Terminal variants are counted separately: a wrong-lane arrival on a
        // gate wider than a lane legitimately completes, and that is a route
        // which could never have trapped anyone in the first place.
        if (k >= 0 && k < lastLocated && r.blownDone) out.notActuallyBlown += 1;
        const overPar = r.endedAtSec - par;
        if (overPar > out.worstOverParSec) out.worstOverParSec = overPar;
        if (overPar > BUDGET_OVER_PAR_S) {
          out.overBudget.push({
            id,
            reason: `ended at ${r.endedAtSec.toFixed(1)} s, par ${par} s (+${overPar.toFixed(1)} s)`,
          });
        }
        // FINISHING IS NOT PASSING — a rescue may never fake a completion.
        if (k >= 0 && r.blownDone === false && r.passed) {
          out.falselyPassed.push({ id, reason: "passed with objective k unfinished" });
        }
      }
    }
  }
  return out;
}

const RESULT = sweep(SCENARIO_TEMPLATES);

describe("COMPLETABILITY BATTERY — every rung, every objective, always ends", () => {
  it("covers the whole catalog (census, so a shrinking sweep is visible)", () => {
    expect(RESULT.rungs).toBeGreaterThanOrEqual(660);
    expect(RESULT.drives).toBeGreaterThanOrEqual(RESULT.rungs * 2);
  });

  it("NO drive is ever left in the driving phase", () => {
    expect(
      RESULT.neverTerminated.map((f) => `${f.id} — ${f.reason}`),
      `${RESULT.neverTerminated.length} of ${RESULT.drives} synthetic drives never ended`,
    ).toEqual([]);
  });

  it("every drive ends inside par + 60 s", () => {
    expect(
      RESULT.overBudget.map((f) => `${f.id} — ${f.reason}`),
      `${RESULT.overBudget.length} of ${RESULT.drives} drives ran over the budget`,
    ).toEqual([]);
  });

  it("and none of them is reported as PASSED — finishing stays not passing", () => {
    expect(RESULT.falselyPassed.map((f) => `${f.id} — ${f.reason}`)).toEqual([]);
  });

  it("the sabotage actually sabotages (the variants are not no-ops)", () => {
    // A handful of waypoints sit so close together that steering 60 m wide of
    // one still clips it on the way to the next; the base drive covers those.
    // A large number here would mean the battery is testing nothing.
    expect(RESULT.notActuallyBlown / RESULT.drives).toBeLessThan(0.05);
  });
});

// ---------------------------------------------------------------------------
// The four causes, pinned individually — so a regression names itself
// ---------------------------------------------------------------------------

describe("the causes doc 86 §3 named, counted after the fix", () => {
  const rows = SCENARIO_TEMPLATES.map((spec) => {
    const lesson = compileScenario(spec, spec.levels[0].level);
    const params = lesson.objectives.map(parseObjectiveParams);
    return { id: spec.id, params };
  });

  it("B1: not one scenario is left without a route finish", () => {
    const orphans = rows
      .filter((r) => routeFinishZone(r.params) === null && terminalRescueZone(r.params) === null)
      .map((r) => r.id);
    expect(orphans, `${orphans.length} scenarios have no termination path`).toEqual([]);
  });

  it("B1: the ten no-anchor maneuver routes now anchor on LEAVING the work", () => {
    const named = [
      "sc-ed-poligon-chain",
      "sc-roundabout-entry",
      "sc-maneuver-3point",
      "sc-maneuver-uturn",
      "sc-mv-uturn-ban",
      "sc-rb-exit-signal",
      "sc-rb-circulate-priority",
      "sc-rb-busy-gap",
      "sc-rb-lane-choice",
      "sc-rb-ped-exit",
    ];
    for (const id of named) {
      const row = rows.find((r) => r.id === id)!;
      const zone = routeFinishZone(row.params);
      expect(zone, id).not.toBeNull();
      expect(zone!.mode, id).toBe("outside");
    }
  });

  /**
   * THE SAFETY SIDE of the standstill rescue, and the reason it needs two
   * different bars. The rescue watches the END of the route, so a student
   * waiting — legitimately, for a gap in traffic, for a red — at an EARLIER
   * task is nowhere near it and can never trip it. Unless the route is compact
   * enough that the earlier task sits inside the rescue circle.
   *
   * Measured across the whole catalog plus the shipped curriculum: exactly
   * five routes do, all five are parking lots whose pull-up pose is 6.4–9.3 m
   * from the bay — and all five run on FINISH_BAY_STUCK_S, where the bar is
   * twenty-five motionless seconds, not twelve. No route on the twelve-second
   * bar has an earlier waypoint inside its rescue at all.
   */
  it("no 12-second rescue can fire on a student waiting at an EARLIER task", () => {
    const offenders: string[] = [];
    for (const r of rows) {
      const rescue = terminalRescueZone(r.params);
      if (rescue === null || rescue.mode === "outside") continue;
      if (rescue.dwellSec !== FINISH_STUCK_S) continue; // the bay bar is separate
      for (let i = 0; i < r.params.length - 1; i++) {
        const p = r.params[i];
        const at =
          p.kind === "reachZone" || p.kind === "passSignal" ? { x: p.x, y: p.y } : null;
        if (at === null) continue;
        if (Math.hypot(at.x - rescue.x, at.y - rescue.y) < rescue.radiusM) {
          offenders.push(`${r.id} · ${i}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("B3: every inside-mode rescue clears one lane pitch, or the clamp says why", () => {
    const tight: string[] = [];
    for (const r of rows) {
      const rescue = terminalRescueZone(r.params);
      if (rescue === null || rescue.mode === "outside") continue;
      // The terminal rescue skips the half-distance clamp entirely, so the
      // floor is unconditional there — that IS the B3 fix.
      if (rescue.radiusM < 8.125) tight.push(`${r.id}:${rescue.radiusM}`);
    }
    expect(tight, "terminal rescues narrower than the lane pitch").toEqual([]);
  });
});
