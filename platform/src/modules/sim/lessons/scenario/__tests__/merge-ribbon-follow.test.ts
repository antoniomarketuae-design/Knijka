/**
 * sc-merge-lane-end:112be4ef [major] — THE GREEN ROUTE LINE TAUGHT THE OPPOSITE
 * MERGE TO THE ONE THE LESSON TEACHES.
 *
 * The lesson's text, demo and blue shadow line hold the right lane to y ≈ 186,
 * let the through car pass and merge into the gap BEHIND it (instruction 4,
 * «…отпусни газта и я пусни да мине; пролуката зад нея е твоята»; the demo
 * caption «Пролуката ЗАД нея е нашата — не тази пред нея»). The green route
 * line («зелена — маршрутът до целта») swung into the through lane within
 * ~40 m of the spawn, in front of that car. At L1 both lines show and the pill
 * «Следвай синята линия» stays on while the student follows the green one; at
 * L3–L5 the green line is the ONLY guidance. Driven in-process, a student who
 * followed it was convicted NOT_KEEPING_RIGHT («Движение в лявата лента без
 * причина») on every rung and pace (160 of 160): the route kept him in the
 * through lane for ~236 m.
 *
 * Cause: `scene/guidanceRoute.ts alignRawToGoalLane` opens its 40 m lane-align
 * ramp at the last junction before the goal, and ln-merge-v1 is ONE edge, so
 * the ramp opened at the ribbon's first sample. The repair lets the objective
 * DECLARE its taught lane change (`ReachZoneParams.laneChange`, authored by the
 * template as the shadow script's own merge step) and the ribbon keeps the
 * lane the student is in up to its start and changes lanes over exactly it.
 *
 * ROUND 2. Round 1 declared only the START and kept the fixed 40 m ramp. The
 * demo changes lanes over 34 m, so the ribbon crossed the lane line ~4 m
 * behind the demo, and an independent pure-pursuit follower on this stack was
 * billed LANE_ENTRY_FORCED_BRAKING in 22 of 160 drives (seed 7) where the same
 * student following the blue line was billed in none: the green line graded a
 * faithful follower WORSE than the lesson's own line. §1 now pins the change
 * to the shadow script's merge step and the ribbon to the committed recording
 * to a stated tolerance, §3 pins every bound of the term, and §4 drives that
 * verifier's student model on its seeds against the blue line.
 *
 * sc-merge-roadworks-shift is the same lesson shape on hz-roadworks-v1 (the
 * same instruction 4, the same staged through car, a shadow that merges at
 * y 180–214) and had the same ribbon, so it is held to the same bar.
 *
 * WHAT IS REAL HERE. §1 reads the ribbon off the product's own derivation —
 * `compileScenario` → `guidanceGoalFor` (with the district's graded stop lines
 * and the spawn as `from`, exactly as RouteGuidance resolves it) + the
 * LOOKAHEAD_MAX_LEGS chain → `deriveGuidanceRoute` on `buildRouteGraph` — and
 * compares it with the lesson's OWN committed shadow-correct recording. §2 and
 * §4 drive a kinematic student who steers ALONG THAT RIBBON (re-derived from
 * his own pose when an objective completes, as RouteGuidance does) through
 * `createWorldRuntime` + `createTrafficSystem` + the lesson's compiled staged
 * events under `createScenarioDirector` (wired with the product's
 * `wireTrafficQueries`), graded by the production rule engine under the
 * lesson's compiled `ruleConfig` (LANE_ENTRY_FORCED_BRAKING armed). A physics
 * contact is reported as LessonScene reports one for a staged body: the rising
 * edge of `isContact(playerObb, actorObb)` → `runtime.pushCollision("vehicle")`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../../runtime";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict } from "../../../traffic/types";
import { createRuleEngine, reduceTick } from "../../../rules";
import type { ViolationEvent } from "../../../rules/types";
import { createScenarioDirector } from "../../../orchestrator/director";
import { wireTrafficQueries } from "../../../scene/lessonWorldRecipe";
import {
  buildRouteGraph,
  deriveGuidanceRoute,
  guidanceGoalFor,
  stopLinesForGuidance,
  LOOKAHEAD_MAX_LEGS,
  type DerivedRoute,
  type GuidanceGoal,
  type RouteDistrictLike,
} from "../../../scene/guidanceRoute";
import { actorObb, isContact, obbSeparationM, playerObb } from "../../../collision";
import type { LessonObjective, LessonSpec, RearTailgaterSpec, StagedEventSpec } from "../../../contracts";
import type { DriveScript } from "../../../traces/recorder";
import { tracePathForRibbon } from "../../../traces/sample";
import type { ScenarioTrace } from "../../../traces/types";
import { scMergeLaneEndShadowScript } from "../../../traces/scMergeLaneEnd";
import { scMergeRoadworksShiftShadowScript } from "../../../traces/scMergeRoadworksShift";
import { parseObjectiveParams } from "../../objectives";
import { compileScenario } from "../compile";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { SC_MERGE_LANE_END, SC_MERGE_ROADWORKS_SHIFT } from "../templates-merging";

const REPO_ROOT = join(process.cwd(), "..");
const DT = 1 / 30;
/** Both maps: one one-way two-lane edge on x = 0, the lane that goes away on
 *  the right (laneId 0), the one that continues on the left (laneId 1). */
const X_START = 4.06;
const X_GOAL = -4.06;
/** „On a lane centre" for a ribbon sample — the ribbon is a centreline, so
 *  this is float slack, not a tolerance on driving. */
const ON_LANE_M = 0.5;
/** tan 25° — the most yaw the student's lane change may use (a harsh one). */
const MAX_YAW_TAN = Math.tan((25 * Math.PI) / 180);
/** His lateral rate cap — a brisk lane change, the census's upper glide. */
const MAX_GLIDE_MPS = 3;

/**
 * HOW CLOSELY THE GREEN CHANGE MUST LIE ON THE DEMO'S (round 2, F2).
 *
 * CROSS_TOL_M — where the ribbon crosses the lane line vs where the committed
 * recording does. Both are straight through the line (the recording is the
 * script's straight merge step, driven), so the only thing between them is
 * the ribbon's corner rounding at the two ends of the change, 15+ m away:
 * measured 0.00 m on both lessons at every rung. 0.25 m is what the follower
 * can afford: the round-1 verifier's drives put the forced-braking bill
 * between a through car 6.9 m behind at the student's lane entry (billed) and
 * 7.7 m (not), a 0.8 m margin, and a crossing 0.25 m late costs a follower
 * about that much entry, a third of it. Any shift of the change by ≥ 0.5 m
 * (one end) or of its length by ≥ 0.5 m moves the crossing past it.
 *
 * SHAPE_TOL_M — the most the ribbon may stand off the recording, laterally,
 * from 10 m before the change to 10 m after it. Measured 0.21 m (lane-end)
 * and 0.20 m (roadworks), both AT the change's two corners where the ribbon
 * is rounded and the recording is not. A change shifted along the road by
 * δ stands off by ≈ 0.24·δ (8.12 m over 34 m), so 0.3 m catches δ ≥ 1.3 m
 * even where the crossing pin would not.
 *
 * ENTRY_TOL_M — §4: where a faithful follower's BODY first reaches over the
 * lane line, ribbon follower vs blue-line follower with the identical
 * student. Measured ≤ 0.4 m on 1,280 paired drives (seeds 3/7/11/23, gains
 * 1/1.5/2/3); round 1's ribbon put it 2.9–3.8 m late. 0.5 m is the
 * instrument's resolution: entry is sampled once a frame, ≤ 0.46 m of road at
 * 50 км/ч.
 */
const CROSS_TOL_M = 0.25;
const SHAPE_TOL_M = 0.3;
const ENTRY_TOL_M = 0.5;

interface Subject {
  spec: ScenarioSpec;
  mergeId: string;
  /** The lesson's correct demonstration — the script the recording replays. */
  script: () => DriveScript;
  /** Where the lane he starts in is gone (district y): ln-merge-v1's taper
   *  end, hz-roadworks-v1's works start (both meta.scenario). */
  laneGoneY: number;
  /** roadworks only: the temporary 30 the student obeys (instruction 6). */
  works?: { fromY: number; toY: number; kmh: number };
}
const SUBJECTS: readonly Subject[] = [
  // ln-merge-v1 meta.scenario: the 60 m taper runs y 180–240.
  { spec: SC_MERGE_LANE_END, mergeId: "sc-mle-merge", script: scMergeLaneEndShadowScript, laneGoneY: 240 },
  // hz-roadworks-v1 meta.scenario: the ВРЕМЕННО 30 runs y 240–276; the shadow
  // takes the works at 28 (traces/scMergeRoadworksShift.ts WORKS_KMH).
  {
    spec: SC_MERGE_ROADWORKS_SHIFT,
    mergeId: "sc-mrs-merged",
    script: scMergeRoadworksShiftShadowScript,
    laneGoneY: 240,
    works: { fromY: 240, toY: 276, kmh: 28 },
  },
];
const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];
const PACES_KMH = [15, 20, 25, 30, 35, 40, 45, 50] as const;

const rawCache = new Map<string, TrafficDistrict & RouteDistrictLike>();
function districtOf(spec: ScenarioSpec): TrafficDistrict & RouteDistrictLike & { spawnPoints: { id: string; x: number; y: number; heading: number }[] } {
  const id = spec.map.districtId!;
  if (!rawCache.has(id)) {
    rawCache.set(id, JSON.parse(readFileSync(join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")));
  }
  return rawCache.get(id)! as never;
}

function spawnOf(spec: ScenarioSpec, lesson: LessonSpec): { x: number; y: number; headingDeg: number } {
  const p = districtOf(spec).spawnPoints.find((s) => s.id === lesson.spawn.pointId)!;
  return { x: p.x, y: p.y, headingDeg: p.heading };
}

/** The ribbon RouteGuidance paints for objective `i`, derived from `start`. */
function ribbon(spec: ScenarioSpec, lesson: LessonSpec, i: number, start: { x: number; y: number; headingDeg: number }): DerivedRoute {
  const district = districtOf(spec);
  const stopLines = stopLinesForGuidance(district);
  const goal = guidanceGoalFor(lesson, i, { stopLines, from: { x: start.x, y: start.y } });
  const lookahead: GuidanceGoal[] = [];
  let from = goal && goal.kind === "point" ? { x: goal.x, y: goal.y } : { x: start.x, y: start.y };
  for (let k = 1; k <= LOOKAHEAD_MAX_LEGS; k++) {
    const n = guidanceGoalFor(lesson, i + k, { stopLines, from });
    if (!n || n.kind !== "point") break;
    lookahead.push(n);
    from = { x: n.x, y: n.y };
  }
  const route = deriveGuidanceRoute(buildRouteGraph(district), start, goal, { lookahead });
  if (!route) throw new Error(`${spec.id}: no ribbon for objective ${i}`);
  return route;
}

/** A polyline's x where it is at district y (both maps run due north). */
function xAtY(samples: readonly { x: number; y: number }[], y: number): number {
  if (y <= samples[0]!.y) return samples[0]!.x;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (y <= b.y && b.y > a.y) return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
  }
  return samples[samples.length - 1]!.x;
}
/** The ribbon's x where it is at district y — read straight off the packed
 *  samples (the drives call it twice a frame). */
function ribbonXAt(route: DerivedRoute, y: number): number {
  const { pts, count } = route;
  if (y <= pts[1]) return pts[0];
  for (let i = 1; i < count; i++) {
    const y0 = pts[(i - 1) * 2 + 1];
    const y1 = pts[i * 2 + 1];
    if (y <= y1 && y1 > y0) {
      const u = (y - y0) / (y1 - y0);
      return pts[(i - 1) * 2] + (pts[i * 2] - pts[(i - 1) * 2]) * u;
    }
  }
  return pts[(count - 1) * 2];
}

/** First y at which a polyline satisfies `pred(x)` (a sample, not interpolated). */
function firstY(samples: readonly { x: number; y: number }[], pred: (x: number) => boolean): number {
  for (const s of samples) if (pred(s.x)) return s.y;
  return Infinity;
}
/** The y at which a polyline first passes x = `xv` going leftwards, interpolated. */
function yWhereX(samples: readonly { x: number; y: number }[], xv: number): number {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (a.x > xv && b.x <= xv) return a.y + ((b.y - a.y) * (a.x - xv)) / (a.x - b.x);
  }
  return Infinity;
}
function routeSamples(route: DerivedRoute): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < route.count; i++) out.push({ x: route.pts[i * 2], y: route.pts[i * 2 + 1] });
  return out;
}

/** The lesson's own correct drive, as committed. */
function traceOf(spec: ScenarioSpec): ScenarioTrace {
  return JSON.parse(readFileSync(join(REPO_ROOT, spec.shadow!.path), "utf-8")) as ScenarioTrace;
}
function shadowOf(spec: ScenarioSpec): { x: number; y: number }[] {
  return traceOf(spec).samples.map((s) => ({ x: s.x, y: s.y }));
}

/** The shadow script's ONE drive step that changes lanes: from the start lane
 *  to the goal lane. Its two ends are the lesson's taught lane change. */
function scriptMergeStep(sub: Subject): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const steps = sub.script().steps.filter(
    (s): s is Extract<DriveScript["steps"][number], { kind: "drive" }> =>
      s.kind === "drive" &&
      Math.abs(s.points[0]![0] - X_START) < 1e-9 &&
      Math.abs(s.points[s.points.length - 1]![0] - X_GOAL) < 1e-9,
  );
  if (steps.length !== 1) throw new Error(`${sub.spec.id}: ${steps.length} lane-changing drive steps in the shadow script`);
  const p = steps[0]!.points;
  return { from: { x: p[0]![0], y: p[0]![1] }, to: { x: p[p.length - 1]![0], y: p[p.length - 1]![1] } };
}

// ---------------------------------------------------------------------------
// §1 — the ribbon teaches the lesson's merge, on every rung
// ---------------------------------------------------------------------------

for (const sub of SUBJECTS) {
  const shadow = shadowOf(sub.spec);
  /** Where the demo leaves the start lane's centre
   *  and where it arrives on the goal lane's centre. */
  const shDepart = firstY(shadow, (x) => x < X_START - ON_LANE_M);
  const shIn = firstY(shadow, (x) => x < X_GOAL + ON_LANE_M);
  /** Where the demo's path crosses the lane line, interpolated. */
  const shCross = yWhereX(shadow, 0);

  describe(`${sub.spec.id} (112be4ef) §1 — the green ribbon merges where the lesson's own demo merges`, () => {
    it("the demo itself holds the start lane and then merges (census guard on the recording)", () => {
      expect(shDepart).toBeGreaterThan(150);
      expect(shIn).toBeGreaterThan(shDepart);
      expect(shIn).toBeLessThan(Infinity);
      expect(shCross).toBeGreaterThan(shDepart);
      expect(shCross).toBeLessThan(shIn);
    });

    it("the authored change IS the shadow script's merge step, and reaches the ribbon's goal unchanged on every rung", () => {
      const step = scriptMergeStep(sub);
      // The recording is that step driven: it crosses the lane line at the
      // step's own midpoint (a straight change across a symmetric line).
      expect(Math.abs(shCross - (step.from.y + step.to.y) / 2), `recording crosses at y ${shCross.toFixed(2)}`).toBeLessThanOrEqual(CROSS_TOL_M);
      for (const level of LEVELS) {
        const lesson = compileScenario(sub.spec, level);
        const district = districtOf(sub.spec);
        const mergeIx = lesson.objectives.findIndex((o) => o.id === sub.mergeId);
        const goal = guidanceGoalFor(lesson, mergeIx, { stopLines: stopLinesForGuidance(district), from: spawnOf(sub.spec, lesson) });
        if (!goal || goal.kind !== "point") throw new Error("no point goal");
        expect(goal.laneChange, `L${level}: the goal the ribbon is derived from`).toEqual(step);
      }
    });

    for (const level of LEVELS) {
      it(`L${level}: starts under the student, keeps his lane until the demo begins its merge, crosses the lane line where the demo does, lies on the demo through the change, and is in the goal lane at the merge gate`, () => {
        const lesson = compileScenario(sub.spec, level);
        const spawn = spawnOf(sub.spec, lesson);
        expect(spawn.x, "the drill starts in the lane that goes away").toBeCloseTo(X_START, 1);
        const route = ribbon(sub.spec, lesson, 0, spawn);
        const pts = routeSamples(route);
        const mergeIx = lesson.objectives.findIndex((o) => o.id === sub.mergeId);
        expect(mergeIx).toBe(0);
        const gate = parseObjectiveParams(lesson.objectives[mergeIx]!);
        if (gate.kind !== "reachZone") throw new Error("merge gate is not a reachZone");
        const step = scriptMergeStep(sub);

        expect(
          Math.abs(ribbonXAt(route, spawn.y) - X_START),
          `the ribbon starts at x ${ribbonXAt(route, spawn.y).toFixed(2)}, not under the student (x ${X_START})`,
        ).toBeLessThanOrEqual(ON_LANE_M);
        const leftEarly = pts.filter((p) => p.y < shDepart && p.x <= 0);
        expect(
          leftEarly.map((p) => `(${p.x.toFixed(2)}, ${p.y.toFixed(1)})`).slice(0, 4),
          `the ribbon is out of the start lane before the demo begins its merge (y ${shDepart.toFixed(1)})`,
        ).toEqual([]);
        const cross = yWhereX(pts, 0);
        expect(
          Math.abs(cross - shCross),
          `the ribbon crosses the lane line at y ${cross.toFixed(2)}, the demo at y ${shCross.toFixed(2)}`,
        ).toBeLessThanOrEqual(CROSS_TOL_M);
        let worst = { dev: 0, y: 0 };
        for (let y = step.from.y - 10; y <= step.to.y + 10; y += 0.25) {
          const dev = Math.abs(xAtY(pts, y) - xAtY(shadow, y));
          if (dev > worst.dev) worst = { dev, y };
        }
        expect(
          worst.dev,
          `the ribbon stands ${worst.dev.toFixed(3)} m off the demo at y ${worst.y.toFixed(2)}`,
        ).toBeLessThanOrEqual(SHAPE_TOL_M);
        // The change is exactly as long as the demo's (both maps run due north,
        // so the step's arclength is its Δy) — not the generic 40 m ramp.
        expect(route.laneAlign?.rampInM, "the ribbon's change length").toBeCloseTo(step.to.y - step.from.y, 6);
        expect(
          Math.abs(ribbonXAt(route, gate.y) - X_GOAL),
          `at the merge gate (y ${gate.y}) the ribbon is at x ${ribbonXAt(route, gate.y).toFixed(2)}`,
        ).toBeLessThanOrEqual(ON_LANE_M);
      });
    }
  });
}

// ---------------------------------------------------------------------------
// §2 — a student who follows the ribbon is graded clean
// ---------------------------------------------------------------------------

interface Drive {
  codes: ViolationEvent[];
  /** where he was (district y) when each of `codes` was billed */
  codeY: number[];
  /** how many objectives he had reached when each of `codes` was billed */
  codeObjective: number[];
  contacts: { t: number; id: string }[];
  reached: string[];
  objectiveCount: number;
  /** each through car: did it ever move (released) */
  released: Record<string, boolean>;
  /** on the frame his body first reached over the goal lane: y, and each car's centre relative to his (+ = ahead) */
  entry: { y: number; carsAheadM: Record<string, number> } | null;
  finalY: number;
}

const overGoalLane = (x: number, headingDeg: number): boolean => {
  // his body's leftmost extent (half-width 0.9 m is the chassis; a heading
  // only ever widens it) reaching over the lane line at x = 0
  const r = (Math.abs(headingDeg) * Math.PI) / 180;
  const halfAcross = 0.9 * Math.cos(r) + 2.3 * Math.sin(r);
  return x - halfAcross < 0;
};

function drive(sub: Subject, level: ScenarioLevel, paceKmh: number, line: "ribbon" | "shadow" = "ribbon"): Drive {
  const lesson = compileScenario(sub.spec, level);
  const staged = (lesson.stagedEvents ?? []) as StagedEventSpec[];
  const cars = staged.filter((s): s is RearTailgaterSpec => s.kind === "rearTailgater");
  const raw = districtOf(sub.spec);
  const runtime = createWorldRuntime(raw);
  const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  wireTrafficQueries(runtime, traffic);
  const director = createScenarioDirector(staged, traffic, { seed: 7, signals: runtime });
  let rules = createRuleEngine(lesson.ruleConfig);
  const objectives = lesson.objectives.map((o) => parseObjectiveParams(o));
  const spawn = spawnOf(sub.spec, lesson);
  const res: Drive = {
    codes: [],
    codeY: [],
    codeObjective: [],
    contacts: [],
    reached: [],
    objectiveCount: objectives.length,
    released: Object.fromEntries(cars.map((c) => [c.id, false])),
    entry: null,
    finalY: spawn.y,
  };
  let active = 0;
  let route = ribbon(sub.spec, lesson, 0, spawn);
  let x = spawn.x;
  let y = spawn.y;
  let v = 0;
  let headingDeg = spawn.headingDeg;
  const touching: Record<string, boolean> = {};
  for (let frame = 1; frame <= 200 * 30 && active < objectives.length; frame++) {
    const t = frame * DT;
    let target = paceKmh / 3.6;
    if (sub.works && y >= sub.works.fromY - 30 && y < sub.works.toY) target = Math.min(target, sub.works.kmh / 3.6);
    if (v < target) v = Math.min(target, v + 1.95 * DT);
    else if (v > target) v = Math.max(target, v - 3 * DT);
    // Steer along the ribbon: aim at where it is a look-ahead up the road.
    const look = Math.max(4, v * 1.0);
    const aimX = steerX(line, sub, route, y + look);
    const gl = Math.min(MAX_GLIDE_MPS, v * MAX_YAW_TAN) * DT;
    const nx = Math.abs(aimX - x) <= gl ? aimX : x + Math.sign(aimX - x) * gl;
    const dy = v * DT;
    headingDeg = dy > 1e-6 ? (Math.atan2(nx - x, dy) * 180) / Math.PI : headingDeg;
    x = nx;
    y += dy;
    // He signals and checks the mirror while the ribbon ahead of him (3 s or
    // 15 m) leaves his lane, and cancels once he is on the goal lane's centre.
    const signalAhead = steerX(line, sub, route, y + Math.max(15, v * 3));
    const changing = x > X_GOAL + ON_LANE_M && signalAhead < x - 0.3;

    runtime.update(DT);
    traffic.update(DT, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x, y },
      playerSpeedKmh: v * 3.6,
      playerHeadingDeg: headingDeg,
    });
    for (const c of cars) {
      const a = traffic.staged(c.id);
      if (!a) continue;
      if (a.speedMps > 0.1) res.released[c.id] = true;
      const now = isContact(obbSeparationM(playerObb(x, y, headingDeg), actorObb(a, c.actor.profile)));
      if (now && !touching[c.id]) {
        res.contacts.push({ t: Math.round(t * 100) / 100, id: c.id });
        runtime.pushCollision("vehicle");
      }
      touching[c.id] = now;
    }
    if (res.entry === null && overGoalLane(x, headingDeg)) {
      const carsAheadM: Record<string, number> = {};
      for (const c of cars) {
        const a = traffic.staged(c.id);
        if (a) carsAheadM[c.id] = Math.round((a.y - y) * 10) / 10;
      }
      res.entry = { y: Math.round(y * 10) / 10, carsAheadM };
    }

    const tick = runtime.sample(
      {
        position: { x, y },
        headingDeg,
        speedKmh: v * 3.6,
        indicator: changing ? "left" : "off",
        headlights: "low",
        seatbeltOn: true,
        handbrakeOn: false,
        gear: 3,
        mirrorGlance: changing && frame % 15 === 0 ? "left" : null,
      },
      t,
      false,
      false,
      Infinity,
    );
    const st = director.step({ tSec: t, dtSec: DT, x, y, speedKmh: v * 3.6, headingDeg, brakePedal: 0, tickEvents: tick.events });
    if (st.events.length > 0) tick.events.push(...st.events);
    const r = reduceTick(rules, tick);
    rules = r.state;
    for (const e of r.events) {
      if (e.kind !== "violation") continue;
      res.codes.push(e);
      res.codeY.push(y);
      res.codeObjective.push(active);
    }

    // The active objective (reachZone discs, in order) — on completion the
    // product re-derives the ribbon from the car's own pose.
    const o = objectives[active]!;
    if (o.kind === "reachZone" && Math.hypot(x - o.x, y - o.y) <= o.radiusM) {
      res.reached.push(lesson.objectives[active]!.id);
      active += 1;
      if (active < objectives.length) route = ribbon(sub.spec, lesson, active, { x, y, headingDeg });
    }
    res.finalY = y;
  }
  return res;
}

/** The lateral line a student steers by: the product's ribbon, or — the
 *  CONTROL — the lesson's own committed shadow-correct path (the blue line). */
const shadowCache = new Map<string, { x: number; y: number }[]>();
function steerX(line: "ribbon" | "shadow", sub: Subject, route: DerivedRoute, y: number): number {
  if (line === "ribbon") return ribbonXAt(route, y);
  let sh = shadowCache.get(sub.spec.id);
  if (!sh) shadowCache.set(sub.spec.id, (sh = shadowOf(sub.spec)));
  if (y <= sh[0]!.y) return sh[0]!.x;
  for (let i = 1; i < sh.length; i++) {
    const a = sh[i - 1]!;
    const b = sh[i]!;
    if (y <= b.y && b.y > a.y) return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
  }
  return sh[sh.length - 1]!.x;
}

const GRADED = ["NOT_KEEPING_RIGHT", "LANE_ENTRY_FORCED_BRAKING", "COLLISION", "LANE_CHANGE_WITHOUT_INDICATOR", "LANE_CHANGE_WITHOUT_MIRROR_CHECK"];
const graded = (d: Drive) => d.codes.filter((e) => GRADED.includes(e.code)).map((e) => e.code);
/**
 * Every code the ribbon follower is billed, for the „never worse" comparison —
 * minus ONE pre-existing, documented exception that is not this ribbon: on
 * sc-merge-roadworks-shift, a POOR_LANE_KEEPING billed after the merge gate
 * was reached. That stretch is steered by the NEXT objective's ribbon, which
 * hz-roadworks-v1's collinear segment joints (y 240, 276) make the lane
 * alignment read as junctions, so it falls back to the centreline beside the
 * cones; identical on base and on round 1 (owed: a separate row).
 */
const comparable = (sub: Subject, d: Drive): string[] =>
  d.codes
    .filter((e, i) => !(sub.spec.id === SC_MERGE_ROADWORKS_SHIFT.id && e.code === "POOR_LANE_KEEPING" && d.codeObjective[i]! > 0))
    .map((e) => e.code);

/**
 * THE BAR, per rung and pace (a constant-pace student who steers by the line
 * and signals + checks the mirror while it bends):
 *   (a) he completes every objective and the through car(s) were released
 *       (not vacuous), and he reaches over the goal lane where the lesson
 *       merges, never at the spawn;
 *   (b) the row's conviction never returns: NOT_KEEPING_RIGHT is never billed
 *       while the lane he is told to leave still exists (y < laneGoneY) —
 *       that is where the old ribbon held him in the through lane in front of
 *       the car — and any later one is earned identically (same code, within
 *       1 s) by the shadow-line follower. Measured: at 15 км/ч on L2–L5 of
 *       sc-merge-lane-end BOTH lines are billed at ≈ 61.5 s, y ≈ 265, past the
 *       taper's end — a crawl spends > 12 s in the surviving lane after the
 *       demo's own merge on a street the world still codes as two lanes (the
 *       lane-drop zone does not exist; keep-right scope is a founder question).
 *       Round 1's ribbon dodged it only by merging ~3.5 m later than the demo;
 *   (c) his body reaches over the lane line within ENTRY_TOL_M of where a
 *       shadow-line follower's does, and the green line is never graded WORSE
 *       than the lesson's own blue line: every code the ribbon follower earns
 *       (`comparable` — one documented exception), the shadow-line follower
 *       at the same rung and pace earns too. That is the honest ceiling for a
 *       LATERAL guide: on sc-merge-roadworks-shift at a constant 35 км/ч the
 *       through car (45 км/ч) is level with him exactly where the demo merges,
 *       so a student who skips instruction 4 (ease off, let it pass) and turns
 *       in anyway commits the push-out mistake on EITHER line — the demo
 *       itself eases to 24 км/ч there;
 *   (d) on sc-merge-lane-end — the row's lesson — no forced-braking bill, no
 *       collision, no lane-change bill and no contact on any rung at any pace.
 */
for (const sub of SUBJECTS) {
  describe(`${sub.spec.id} (112be4ef) §2 — a student who follows the green ribbon is not convicted for it`, () => {
    for (const level of LEVELS) {
      for (const pace of PACES_KMH) {
        it(`L${level} @ ${pace} км/ч: every objective; no keep-right bill; graded no worse than the lesson's own line`, () => {
          const d = drive(sub, level, pace);
          const control = drive(sub, level, pace, "shadow");
          expect(d.reached, `objectives reached (drive ended at y ${d.finalY.toFixed(1)})`).toHaveLength(d.objectiveCount);
          for (const [id, rel] of Object.entries(d.released)) {
            expect(rel, `${id} never released — the drive would pass vacuously`).toBe(true);
          }
          expect(d.entry, "he never reached over the goal lane").not.toBeNull();
          expect(d.entry!.y, `entry ${JSON.stringify(d.entry)}`).toBeGreaterThan(150);
          expect(
            d.codes
              .map((e, i) => ({ e, y: d.codeY[i]! }))
              .filter(({ e, y }) => e.code === "NOT_KEEPING_RIGHT" && y < sub.laneGoneY)
              .map(({ e, y }) => `${e.code}@${e.t.toFixed(1)}s y ${y.toFixed(1)}`),
            `entry ${JSON.stringify(d.entry)}`,
          ).toEqual([]);
          for (const e of d.codes.filter((k) => k.code === "NOT_KEEPING_RIGHT")) {
            expect(
              control.codes.some((k) => k.code === e.code && Math.abs(k.t - e.t) <= 1),
              `ribbon ${e.code}@${e.t.toFixed(1)}s has no twin on the lesson's own line ${JSON.stringify(control.codes.map((k) => `${k.code}@${k.t.toFixed(1)}`))}`,
            ).toBe(true);
          }
          // Round 2: his body reaches over the lane line where the blue-line
          // follower's does (round 1's ribbon put it 2.9–3.8 m late).
          expect(control.entry, "the shadow-line control never reached over the goal lane").not.toBeNull();
          expect(
            Math.abs(d.entry!.y - control.entry!.y),
            `entry ${JSON.stringify(d.entry)} vs the lesson's own line ${JSON.stringify(control.entry)}`,
          ).toBeLessThanOrEqual(ENTRY_TOL_M);
          const worse = comparable(sub, d).filter((c) => !control.codes.some((k) => k.code === c));
          expect(worse, `ribbon ${JSON.stringify(comparable(sub, d))} vs the lesson's own line ${JSON.stringify(control.codes.map((k) => k.code))}`).toEqual([]);
          if (sub.spec.id === SC_MERGE_LANE_END.id) {
            expect(d.contacts, "body contact with a through car").toEqual([]);
            expect(graded(d).filter((c) => c !== "NOT_KEEPING_RIGHT"), `entry ${JSON.stringify(d.entry)}`).toEqual([]);
          } else {
            expect(d.contacts.length, "more contacts than on the lesson's own line").toBeLessThanOrEqual(control.contacts.length);
          }
        });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// §3 — the term's bounds, on the real ln-merge-v1 graph
// ---------------------------------------------------------------------------

describe("112be4ef §3 — `laneChange` is honoured only where it means what it says", () => {
  const lesson = compileScenario(SC_MERGE_LANE_END, 3);
  const district = districtOf(SC_MERGE_LANE_END);
  const graph = buildRouteGraph(district);
  const stopLines = stopLinesForGuidance(district);
  const spawn = spawnOf(SC_MERGE_LANE_END, lesson);
  const authored = guidanceGoalFor(lesson, 0, { stopLines, from: spawn });
  if (!authored || authored.kind !== "point") throw new Error("no point goal");
  const stripped: GuidanceGoal = { ...authored };
  delete (stripped as { laneChange?: unknown }).laneChange;
  const derive = (goal: GuidanceGoal, start = spawn) => deriveGuidanceRoute(graph, start, goal)!;
  const xs = (r: DerivedRoute) => Array.from(r.pts.subarray(0, r.count * 2));
  const withChange = (from: { x: number; y: number }, to: { x: number; y: number }): GuidanceGoal => ({
    ...stripped,
    laneChange: { from, to },
  });
  /** The authored change's ends (the shadow script's merge step). */
  const FROM = { x: X_START, y: 186 };
  const TO = { x: X_GOAL, y: 220 };

  it("the compiled goal carries the template's pair (it reaches the ribbon through compile → parse → guidanceGoalFor)", () => {
    expect(authored.laneChange).toEqual({ from: FROM, to: TO });
  });

  it("absent, the ribbon is exactly the shipped one: it eases over from the spawn", () => {
    const r = derive(stripped);
    expect(ribbonXAt(r, 60)).toBeCloseTo(X_GOAL, 1);
    expect(r.laneAlign?.legStartS).toBe(0);
  });

  it("a change that starts in the GOAL's own lane places nothing and is ignored", () => {
    expect(xs(derive(withChange({ x: X_GOAL, y: 186 }, TO)))).toEqual(xs(derive(stripped)));
  });

  it("…also for a driver who is in the goal's lane but off its centre (he keeps the shipped ease from under his wheels)", () => {
    // Mutation-found (round 1, M7): with the driver in another lane the driver
    // bound masked the not-the-goal-lane bound, so this case pins it alone.
    const offCentre = { x: X_GOAL + 1.06, y: 12, headingDeg: 0 };
    expect(xs(derive(withChange({ x: X_GOAL, y: 186 }, TO), offCentre))).toEqual(xs(derive(stripped, offCentre)));
  });

  it("a change that starts off the carriageway is ignored even beside a driver who is off it too", () => {
    // Mutation-found (round 1, M6): the off-road bound, isolated from the
    // driver bound — a ribbon is never laid along a line two lane pitches off
    // the road.
    const offRoad = { x: 16, y: 12, headingDeg: 0 };
    const r = derive(stripped, offRoad);
    expect(r).not.toBeNull();
    expect(xs(derive(withChange({ x: 17.5, y: 186 }, TO), offRoad))).toEqual(xs(r));
  });

  it("a change that starts off the road (beyond two lane pitches) is ignored", () => {
    expect(xs(derive(withChange({ x: 30, y: 186 }, TO)))).toEqual(xs(derive(stripped)));
  });

  it("a change that is not over by the goal is ignored (the ribbon must arrive in the goal's lane)", () => {
    expect(xs(derive(withChange(FROM, { x: X_GOAL, y: 250 })))).toEqual(xs(derive(stripped)));
  });

  it("a change that starts past the goal is ignored", () => {
    expect(xs(derive(withChange({ x: X_START, y: 250 }, { x: X_GOAL, y: 270 })))).toEqual(xs(derive(stripped)));
  });

  it("a change authored BACKWARDS (ends before it starts) is ignored", () => {
    expect(xs(derive(withChange({ x: X_START, y: 220 }, { x: X_GOAL, y: 186 })))).toEqual(xs(derive(stripped)));
  });

  it("a change that does not END in the goal's lane is ignored (it would draw a lane change to nowhere)", () => {
    expect(xs(derive(withChange(FROM, { x: X_START, y: 220 })))).toEqual(xs(derive(stripped)));
    // Half a lane (4.06 m) is the same-lane bound, so the lane line itself
    // still counts as „the goal's lane" by it; just past the line does not.
    expect(xs(derive(withChange(FROM, { x: 0.5, y: 220 })))).toEqual(xs(derive(stripped)));
  });

  it("a driver already in the goal's lane is not dragged back into the lane that ends", () => {
    const inGoalLane = { x: X_GOAL, y: 100, headingDeg: 0 };
    const r = derive(authored, inGoalLane);
    expect(xs(r)).toEqual(xs(derive(stripped, inGoalLane)));
    for (let y = 100; y <= 236; y += 5) expect(ribbonXAt(r, y)).toBeLessThan(X_GOAL + ON_LANE_M);
  });

  it("the change runs over EXACTLY the authored stretch: it crosses the lane line at its midpoint and is as long as authored", () => {
    // Sub-sample starts (the route is sampled every 2.5 m): each end is
    // projected onto the route, never snapped to the nearest sample.
    for (const fromY of [185.3, 186, 186.9, 188.2]) {
      for (const len of [28, 34, 39]) {
        const r = derive(withChange({ x: X_START, y: fromY }, { x: X_GOAL, y: fromY + len }));
        const cross = yWhereX(routeSamples(r), 0);
        expect(Math.abs(cross - (fromY + len / 2)), `from ${fromY}, ${len} m: crosses at ${cross.toFixed(3)}`).toBeLessThanOrEqual(0.05);
        expect(r.laneAlign?.rampInM).toBeCloseTo(len, 6);
        // …and holds a lane on either side of it (the ribbon rounds its
        // corners over ~3 m, so these are read clear of them).
        expect(ribbonXAt(r, fromY - 5)).toBeCloseTo(X_START, 1);
        expect(ribbonXAt(r, fromY + len + 5)).toBeCloseTo(X_GOAL, 1);
      }
    }
  });

  it("the held lane is wherever the change starts, not a mirror of the goal's (w0 = its offset over the goal's)", () => {
    const off = { x: 2.0, y: 12, headingDeg: 0 };
    const r = derive(withChange({ x: 2.0, y: 186 }, TO), off);
    expect(ribbonXAt(r, 150)).toBeCloseTo(2.0, 2);
    expect(r.laneAlign?.w0).toBeCloseTo(2.0 / X_GOAL, 3);
    expect(Math.abs(yWhereX(routeSamples(r), (2.0 + X_GOAL) / 2) - 203)).toBeLessThanOrEqual(0.05);
  });

  it("a driver still in his lane PAST the start is led over from under his wheels, over the authored length", () => {
    const late = { x: X_START, y: 196, headingDeg: 0 };
    const r = derive(authored, late);
    expect(ribbonXAt(r, 196)).toBeCloseTo(X_START, 1);
    expect(r.laneAlign?.rampInM).toBeCloseTo(34, 6);
    expect(Math.abs(yWhereX(routeSamples(r), 0) - (196 + 17))).toBeLessThanOrEqual(0.05);
    expect(ribbonXAt(r, 236)).toBeCloseTo(X_GOAL, 1);
  });

  it("with less road left before the goal than the authored length, the change is shortened and still arrives in the goal's lane", () => {
    const later = { x: X_START, y: 216, headingDeg: 0 };
    const r = derive(authored, later);
    expect(ribbonXAt(r, 216)).toBeCloseTo(X_START, 1);
    expect(r.laneAlign?.rampInM).toBeLessThan(34);
    expect(Math.abs(ribbonXAt(r, 236) - X_GOAL)).toBeLessThanOrEqual(ON_LANE_M);
  });

  it("on the same street turned 30° off north, the ribbon is the same ribbon turned 30° (both ends projected across the road, not along a compass axis)", () => {
    // Both declaring maps run due north, where a projection that read only one
    // axis would pass every other test here; this one is rotation-invariant
    // by construction and fails on any such shortcut.
    const phi = (30 * Math.PI) / 180;
    const rot = (p: { x: number; y: number }) => ({
      x: p.x * Math.cos(phi) - p.y * Math.sin(phi),
      y: p.x * Math.sin(phi) + p.y * Math.cos(phi),
    });
    const turned: RouteDistrictLike = {
      roads: {
        nodes: district.roads.nodes.map((n) => ({ ...n, ...rot(n) })),
        edges: district.roads.edges.map((e) => ({
          ...e,
          geometry: e.geometry.map(([x, y]) => {
            const q = rot({ x, y });
            return [q.x, q.y] as [number, number];
          }),
        })),
      },
    };
    const a = authored as Extract<GuidanceGoal, { kind: "point" }>;
    const turnedGoal: GuidanceGoal = {
      ...a,
      ...rot(a),
      laneChange: { from: rot(a.laneChange!.from), to: rot(a.laneChange!.to) },
    };
    const turnedStart = { ...rot(spawn), headingDeg: spawn.headingDeg - 30 };
    const r0 = derive(authored);
    const r1 = deriveGuidanceRoute(buildRouteGraph(turned), turnedStart, turnedGoal)!;
    expect(r1.laneAlign?.rampInM, "the turned change is honoured, as long as authored").toBeCloseTo(34, 3);
    expect(r1.count).toBe(r0.count);
    let worst = 0;
    for (let i = 0; i < r0.count; i++) {
      const q = rot({ x: r0.pts[i * 2], y: r0.pts[i * 2 + 1] });
      worst = Math.max(worst, Math.hypot(q.x - r1.pts[i * 2], q.y - r1.pts[i * 2 + 1]));
    }
    expect(worst, "largest gap between the turned ribbon and the ribbon turned").toBeLessThanOrEqual(0.01);
  });

  it("on a street that BENDS before the change, each end is measured across the road where it lies, not across the road at the start", () => {
    // One one-way edge: 120 m due north, then 160 m at 35° east of north. The
    // change is authored wholly on the second leg, so its held lane, its ends
    // and its crossing must all be read off THAT leg's direction.
    const b = (35 * Math.PI) / 180;
    const knee = { x: 0, y: 120 };
    const along = (d: number, lateral: number) => ({
      // d metres up the second leg from the knee, `lateral` to its right
      x: knee.x + Math.sin(b) * d + Math.cos(b) * lateral,
      y: knee.y + Math.cos(b) * d - Math.sin(b) * lateral,
    });
    const end = along(160, 0);
    const bent: RouteDistrictLike = {
      roads: {
        nodes: [
          { id: "a", x: 0, y: 0 },
          { id: "b", x: end.x, y: end.y },
        ],
        edges: [{ id: "e", from: "a", to: "b", oneway: true, geometry: [[0, 0], [knee.x, knee.y], [end.x, end.y]] }],
      },
    };
    const goalPt = along(130, -X_START);
    const goal: GuidanceGoal = {
      ...stripped,
      ...goalPt,
      laneChange: { from: along(60, X_START), to: along(94, -X_START) },
    };
    const r = deriveGuidanceRoute(buildRouteGraph(bent), { x: X_START, y: 12, headingDeg: 0 }, goal)!;
    expect(r.laneAlign?.rampInM, "honoured, and as long as authored along the bent road").toBeCloseTo(34, 3);
    // Signed lateral of each ribbon sample on the second leg (+ = right).
    const lat = (x: number, y: number) => (x - knee.x) * Math.cos(b) - (y - knee.y) * Math.sin(b);
    const up = (x: number, y: number) => (x - knee.x) * Math.sin(b) + (y - knee.y) * Math.cos(b);
    const leg2: { d: number; l: number }[] = [];
    for (let i = 0; i < r.count; i++) {
      const d = up(r.pts[i * 2], r.pts[i * 2 + 1]);
      if (d > 20 && d < 125) leg2.push({ d, l: lat(r.pts[i * 2], r.pts[i * 2 + 1]) });
    }
    const at = (d: number) => {
      for (let i = 1; i < leg2.length; i++) {
        if (leg2[i]!.d >= d) {
          const u = (d - leg2[i - 1]!.d) / (leg2[i]!.d - leg2[i - 1]!.d);
          return leg2[i - 1]!.l + (leg2[i]!.l - leg2[i - 1]!.l) * u;
        }
      }
      return NaN;
    };
    expect(at(50), "held lane before the change").toBeCloseTo(X_START, 1);
    expect(at(77), "on the lane line at the change's midpoint").toBeCloseTo(0, 1);
    expect(at(104), "in the goal's lane after it").toBeCloseTo(X_GOAL, 1);
  });

  it("the published span describes the held lane exactly (w0 = held offset / goal offset)", () => {
    const r = derive(authored);
    const la = r.laneAlign!;
    expect(la.w0).toBeCloseTo(X_START / X_GOAL, 3);
    expect(la.offsetM).toBeCloseTo(X_GOAL - 0, 2);
    expect(la.rampInM).toBeCloseTo(34, 6);
    // |offsetM|·(1 − w0)/rampInM — the ease-in slope road-record.mjs debits —
    // is the lateral the ribbon actually covers per metre.
    expect((Math.abs(la.offsetM) * (1 - la.w0)) / la.rampInM).toBeCloseTo((X_START - X_GOAL) / 34, 6);
  });

  describe("a malformed pair is refused loudly at parse time", () => {
    const objective = (laneChange: unknown): LessonObjective => ({
      id: "t-merge",
      titleBg: "t",
      kind: "reachZone",
      params: { x: X_GOAL, y: 236, radiusM: 3.5, laneChange },
    });
    it("a well-formed pair is carried through as a copy", () => {
      const lc = { from: { x: 4.06, y: 186 }, to: { x: -4.06, y: 220 } };
      const p = parseObjectiveParams(objective(lc));
      if (p.kind !== "reachZone") throw new Error("not a reachZone");
      expect(p.laneChange).toEqual(lc);
      expect(p.laneChange).not.toBe(lc);
      expect(p.laneChange!.from).not.toBe(lc.from);
    });
    for (const [label, bad] of [
      ["only a start (the round-1 shape)", { from: { x: 4.06, y: 186 } }],
      ["only an end", { to: { x: -4.06, y: 220 } }],
      ["null", null],
      ["a number", 186],
      ["a null start", { from: null, to: { x: -4.06, y: 220 } }],
      ["a string coordinate", { from: { x: "4.06", y: 186 }, to: { x: -4.06, y: 220 } }],
      ["a NaN coordinate", { from: { x: 4.06, y: 186 }, to: { x: -4.06, y: Number.NaN } }],
      ["the same point twice", { from: { x: 4.06, y: 186 }, to: { x: 4.06, y: 186 } }],
    ] as const) {
      it(`refuses ${label}`, () => {
        expect(() => parseObjectiveParams(objective(bad))).toThrow(/laneChange/);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// §4 — the round-1 verifier's student: the green line is never graded worse
//      than the blue one
// ---------------------------------------------------------------------------

/**
 * F1 of round 1's verification, made a standing test. A DIFFERENT student from
 * §2's: a pure-pursuit bicycle model (look-ahead max(5 m, gain·v), curvature
 * limited to 1/6 m⁻¹, a 0.3 s steering lag) that drives at a constant pace or,
 * in „ease" mode, lifts to 26 км/ч while a released through car is within 8 m
 * of him and he has not crossed the line. He signals once the line 3 s or
 * 20 m ahead of him is a metre left of him, cancels once he is settled in the
 * goal lane, and glances left every second while signalling. The CONTROL is
 * the same student steering by the blue line exactly as the product draws it
 * (`tracePathForRibbon(trace, 1.0, 2048)`, the path FollowHintProbe measures
 * against). Seeds 7 and 11 are the verifier's.
 *
 * Bars, at every rung × pace × gain × mode:
 *   - every objective reached on both lines (the drive is not vacuous);
 *   - the ribbon follower's graded codes ⊆ the blue follower's, and no more
 *     contacts;
 *   - his BODY reaches over the lane line within ENTRY_TOL_M of where the blue
 *     follower's does — the measured reason round 1 was billed;
 *   - on sc-merge-lane-end at L1 the «Следвай синята линия» pill (replicated
 *     from LessonScene's FollowHintProbe — 1.2 m for 2 s, polled every
 *     0.25 s) never comes on for the ribbon follower.
 */
const PURSUIT_SEEDS = [7, 11] as const;
const PURSUIT_GAINS = [1, 2] as const;
const PURSUIT_MODES = ["const", "ease"] as const;
/** LessonScene.tsx FOLLOW_HINT_* — pinned against the source below. */
const FOLLOW_HINT = { deviationM: 1.2, sustainS: 2, pollS: 0.25 };

interface PursuitDrive {
  codes: string[];
  contacts: number;
  reached: number;
  objectiveCount: number;
  entryY: number | null;
  pillOn: boolean;
}

function pursuitDrive(
  sub: Subject,
  level: ScenarioLevel,
  paceKmh: number,
  gain: number,
  mode: "const" | "ease",
  seed: number,
  line: "ribbon" | "blue",
): PursuitDrive {
  const lesson = compileScenario(sub.spec, level);
  const staged = (lesson.stagedEvents ?? []) as StagedEventSpec[];
  const cars = staged.filter((s): s is RearTailgaterSpec => s.kind === "rearTailgater");
  const raw = districtOf(sub.spec);
  const runtime = createWorldRuntime(raw);
  const traffic = createTrafficSystem(raw, { seed, vehicleCount: 0, pedestrianCount: 0 });
  wireTrafficQueries(runtime, traffic);
  const director = createScenarioDirector(staged, traffic, { seed, signals: runtime });
  let rules = createRuleEngine(lesson.ruleConfig);
  const objectives = lesson.objectives.map((o) => parseObjectiveParams(o));
  const spawn = spawnOf(sub.spec, lesson);
  const blue = tracePathForRibbon(traceOf(sub.spec), 1.0, 2048);
  type Path = { pts: ArrayLike<number>; arc: ArrayLike<number>; count: number };
  let path: Path = line === "blue" ? blue : ribbon(sub.spec, lesson, 0, spawn);
  const nearest = (p: Path, x: number, y: number) => {
    let b = 0;
    let bd = Infinity;
    for (let i = 0; i < p.count; i++) {
      const d = (p.pts[2 * i] - x) ** 2 + (p.pts[2 * i + 1] - y) ** 2;
      if (d < bd) {
        bd = d;
        b = i;
      }
    }
    return { i: b, d: Math.sqrt(bd) };
  };
  const ahead = (p: Path, i0: number, L: number): [number, number] => {
    for (let i = i0; i < p.count; i++) if (p.arc[i] - p.arc[i0] >= L) return [p.pts[2 * i], p.pts[2 * i + 1]];
    return [p.pts[2 * (p.count - 1)], p.pts[2 * (p.count - 1) + 1]];
  };
  let x = spawn.x;
  let y = spawn.y;
  let h = (spawn.headingDeg * Math.PI) / 180;
  let v = 0;
  let kappa = 0;
  let indicator: "off" | "left" = "off";
  let indSince = 0;
  let active = 0;
  const touching: Record<string, boolean> = {};
  const res: PursuitDrive = { codes: [], contacts: 0, reached: 0, objectiveCount: objectives.length, entryY: null, pillOn: false };
  let clock = 0;
  let nextPoll = 0;
  let offSince: number | null = null;
  for (let f = 1; f <= 240 * 30 && active < objectives.length; f++) {
    const t = f * DT;
    let target = paceKmh / 3.6;
    if (sub.works && y >= sub.works.fromY - 30 && y < sub.works.toY) target = Math.min(target, sub.works.kmh / 3.6);
    if (mode === "ease") {
      for (const c of cars) {
        const a = traffic.staged(c.id);
        if (a && a.speedMps > 0.1 && Math.abs(a.y - y) < 8 && x > 0) target = Math.min(target, 26 / 3.6);
      }
    }
    v = v < target ? Math.min(target, v + 2 * DT) : Math.max(target, v - 3 * DT);
    const i0 = nearest(path, x, y).i;
    const [tx, ty] = ahead(path, i0, Math.max(5, gain * v));
    const alpha = Math.atan2(tx - x, ty - y) - h;
    const want = Math.max(-1 / 6, Math.min(1 / 6, (2 * Math.sin(alpha)) / Math.max(1, Math.hypot(tx - x, ty - y))));
    kappa += (want - kappa) * Math.min(1, DT / 0.3);
    h += v * kappa * DT;
    x += Math.sin(h) * v * DT;
    y += Math.cos(h) * v * DT;
    const hd = (h * 180) / Math.PI;
    const [ax] = ahead(path, i0, Math.max(20, 3 * v));
    if (indicator === "off" && ax < x - 1.0 && x > -3.0) {
      indicator = "left";
      indSince = t;
    }
    if (indicator === "left" && x < -3.5 && Math.abs(hd) < 3) indicator = "off";
    runtime.update(DT);
    traffic.update(DT, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x, y },
      playerSpeedKmh: v * 3.6,
      playerHeadingDeg: hd,
    });
    for (const c of cars) {
      const a = traffic.staged(c.id);
      if (!a) continue;
      const now = isContact(obbSeparationM(playerObb(x, y, hd), actorObb(a, c.actor.profile)));
      if (now && !touching[c.id]) {
        res.contacts += 1;
        runtime.pushCollision("vehicle");
      }
      touching[c.id] = now;
    }
    if (res.entryY === null && x - 0.9 < 0) res.entryY = y;
    const glance = indicator === "left" && Math.round((t - indSince) / DT) % 30 === 0 ? "left" : null;
    const tick = runtime.sample(
      {
        position: { x, y },
        headingDeg: hd,
        speedKmh: v * 3.6,
        indicator,
        headlights: "low",
        seatbeltOn: true,
        handbrakeOn: false,
        gear: 3,
        mirrorGlance: glance,
      },
      t,
      false,
      false,
      Infinity,
    );
    const st = director.step({ tSec: t, dtSec: DT, x, y, speedKmh: v * 3.6, headingDeg: hd, brakePedal: 0, tickEvents: tick.events });
    if (st.events.length > 0) tick.events.push(...st.events);
    const r = reduceTick(rules, tick);
    rules = r.state;
    for (const e of r.events) if (e.kind === "violation") res.codes.push(e.code);
    // FollowHintProbe, replicated: distance to the nearest blue-line sample.
    clock += DT;
    if (clock >= nextPoll) {
      nextPoll = clock + FOLLOW_HINT.pollS;
      if (nearest(blue, x, y).d <= FOLLOW_HINT.deviationM) offSince = null;
      else {
        if (offSince === null) offSince = clock;
        if (clock - offSince >= FOLLOW_HINT.sustainS) res.pillOn = true;
      }
    }
    const o = objectives[active]!;
    if (o.kind === "reachZone" && Math.hypot(x - o.x, y - o.y) <= o.radiusM) {
      res.reached += 1;
      active += 1;
      if (active < objectives.length && line === "ribbon") path = ribbon(sub.spec, lesson, active, { x, y, headingDeg: hd });
    }
  }
  return res;
}

describe("112be4ef §4 — the follow-hint replica reads the product's constants", () => {
  it("FOLLOW_HINT matches LessonScene.tsx (a source pin that fails if it cannot read them)", () => {
    const src = readFileSync(join(process.cwd(), "src", "components", "sim", "LessonScene.tsx"), "utf-8");
    const read = (name: string): number => {
      const m = new RegExp(`const ${name} = ([0-9.]+);`).exec(src);
      if (!m) throw new Error(`LessonScene.tsx: cannot read ${name}`);
      return Number(m[1]);
    };
    expect({
      deviationM: read("FOLLOW_HINT_DEVIATION_M"),
      sustainS: read("FOLLOW_HINT_SUSTAIN_S"),
      pollS: read("FOLLOW_HINT_POLL_S"),
    }).toEqual(FOLLOW_HINT);
  });
});

for (const sub of SUBJECTS) {
  for (const seed of PURSUIT_SEEDS) {
    describe(`${sub.spec.id} (112be4ef) §4 — seed ${seed}: a pure-pursuit follower of the green line is graded no worse than one of the blue line`, () => {
      for (const level of LEVELS) {
        it(`L${level}: every pace × gain × mode`, () => {
          const fails: string[] = [];
          for (const pace of PACES_KMH) {
            for (const gain of PURSUIT_GAINS) {
              for (const mode of PURSUIT_MODES) {
                const tag = `${pace} км/ч g${gain} ${mode}`;
                const d = pursuitDrive(sub, level, pace, gain, mode, seed, "ribbon");
                const c = pursuitDrive(sub, level, pace, gain, mode, seed, "blue");
                if (d.reached !== d.objectiveCount) fails.push(`${tag}: ribbon follower reached ${d.reached}/${d.objectiveCount}`);
                if (c.reached !== c.objectiveCount) fails.push(`${tag}: blue follower reached ${c.reached}/${c.objectiveCount}`);
                const worse = [...new Set(d.codes)].filter((k) => !c.codes.includes(k));
                if (worse.length > 0) fails.push(`${tag}: ribbon ${JSON.stringify(d.codes)} vs blue ${JSON.stringify(c.codes)}`);
                if (d.contacts > c.contacts) fails.push(`${tag}: ${d.contacts} contacts vs ${c.contacts}`);
                if (d.entryY === null || c.entryY === null) fails.push(`${tag}: never reached over the lane line`);
                else if (Math.abs(d.entryY - c.entryY) > ENTRY_TOL_M) {
                  fails.push(`${tag}: body over the line at y ${d.entryY.toFixed(2)} vs blue ${c.entryY.toFixed(2)}`);
                }
                if (sub.spec.id === SC_MERGE_LANE_END.id && level === 1 && d.pillOn) fails.push(`${tag}: «Следвай синята линия» came on`);
              }
            }
          }
          expect(fails).toEqual([]);
        });
      }
    });
  }
}
