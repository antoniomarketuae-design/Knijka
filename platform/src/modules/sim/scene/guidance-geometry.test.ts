/**
 * guidance-geometry — Lane 2's gate (doc 86 §9 Lane 2, §10 S1).
 *
 * The founder's single most damaging finding was that the green marker teaches
 * illegal driving: for a `passSignal` objective it rendered at the junction's
 * geometric CENTRE, up to 27.7 m PAST the stop line the same lesson grades. A
 * 17-year-old cannot tell the simulator is wrong — he stops where the green
 * circle is, and the green circle is inside the intersection.
 *
 * This file is the invariant that makes that unauthorable. It sweeps every
 * scenario × every authored rung and asserts three things about what the
 * student actually SEES:
 *
 *   G1  No marker stands past a stop line its own route drives across within
 *       the marker's acceptance radius — GRADED or merely PAINTED. („спри
 *       ТУК", never mid-box.) The painted half arrived with register B18: the
 *       runtime grades nothing at a roundabout mouth, but the world paints an
 *       М8 give-way line at every one of them and the student cannot tell the
 *       difference from the driving seat.
 *   G2  The rendered ring radius IS the objective's acceptance radius — the
 *       fixed 1.85 m decoration is gone, so „стоях точно на кръга и нищо не
 *       стана" can only ever mean the speed cap, never the geometry.
 *   G3  Every hidden contract is published: a capped objective's marker
 *       carries `maxSpeedKmh`, and a `passSignal` marker is a stop-line GATE
 *       with a halt/through affordance, not a nameless circle.
 *
 * Plus L5: guidance looks ahead — the turn at the junction is on the ribbon
 * while the student is still on the approach.
 *
 * The sweep uses the SAME sources the scene does: `compileScenario` for the
 * rung, `content/world/*.json` through `createWorldRuntime` for the graded
 * stop lines (never a second derivation), and `guidanceGoalFor` /
 * `deriveGuidanceRoute` for the marker and the ribbon.
 */

import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  SCENARIO_TEMPLATES,
  compileScenario,
  parseObjectiveParams,
  type LessonSpec,
} from "@/modules/sim/lessons";
import { parseDistrict, type District } from "@/modules/sim/runtime";
import {
  AHEAD_OVERRUN_M,
  GATE_HALF_WIDTH_M,
  MARKER_INSIDE_FRACTION,
  STOP_BAR_BEFORE_LINE_M,
  THROUGH_GATE_BEFORE_LINE_M,
  buildRouteGraph,
  deriveGuidanceRoute,
  guidanceGoalFor,
  markerRingRadii,
  stopLinesForGuidance,
  type DerivedRoute,
  type GuidancePointGoal,
  type GuidanceStopLine,
  type RouteGraph,
} from "./guidanceRoute";

// ---------------------------------------------------------------------------
// Tolerances — every one of them is a claim, so every one of them is named
// ---------------------------------------------------------------------------

/** Paint has width and the ribbon is densified at 2.5 m: half a metre past the
 *  line is inside the painted band, not inside the junction. */
const PAST_TOLERANCE_M = 0.5;
/**
 * A stop line only governs a marker that is NEAR it. Beyond this the marker is
 * a different beat of the lesson — the exit waypoint on the far arm of
 * `sc-junction-stop` is 57 m past the Б2 line and is supposed to be.
 * `max(acceptRadiusM, 12)`: 12 m is a junction mouth plus a car length, so a
 * marker parked just inside the box is still caught even when the objective's
 * own radius is 3.5.
 */
const MIN_GOVERNING_NEAR_M = 12;
/** How near the route has to pass a line for the line to be ON that route. */
const ROUTE_TOUCHES_LINE_M = 12;
/** Travelling ACROSS a line means heading with it, not perpendicular to it. */
const ROUTE_ALONG_DOT = 0.5;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORLD_DIRS = [
  path.join(process.cwd(), "content", "world"),
  path.resolve(process.cwd(), "..", "content", "world"),
];
const WORLD_DIR = WORLD_DIRS.find((d) => fs.existsSync(d));
const DEFAULT_DISTRICT_ID = "district-v1";

interface WorldFixture {
  district: District;
  graph: RouteGraph;
  stopLines: readonly GuidanceStopLine[];
  spawns: Map<string, { x: number; y: number; headingDeg: number }>;
}

const worldCache = new Map<string, WorldFixture | null>();

function worldFor(districtId: string): WorldFixture | null {
  const hit = worldCache.get(districtId);
  if (hit !== undefined) return hit;
  let fixture: WorldFixture | null = null;
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(WORLD_DIR!, `${districtId}.json`), "utf8"),
    ) as unknown;
    const district = parseDistrict(raw);
    const spawns = new Map<string, { x: number; y: number; headingDeg: number }>();
    for (const s of district.spawnPoints) {
      spawns.set(s.id, { x: s.x, y: s.y, headingDeg: s.heading });
    }
    fixture = {
      district,
      graph: buildRouteGraph(district as never),
      // The runtime's OWN lines — the ones rules/engine.ts convicts on.
      stopLines: stopLinesForGuidance(raw),
      spawns,
    };
  } catch {
    fixture = null;
  }
  worldCache.set(districtId, fixture);
  return fixture;
}

interface MarkerCase {
  scenarioId: string;
  level: number;
  objectiveIndex: number;
  objectiveId: string;
  paramKind: string;
  districtId: string;
  goal: GuidancePointGoal;
  /** The pose the runtime would derive this route from. */
  from: { x: number; y: number; headingDeg: number };
  route: DerivedRoute | null;
  radiusM: number | null;
  maxSpeedKmh?: number;
}

interface Finding {
  where: string;
  detail: string;
}

const cases: MarkerCase[] = [];
const findings: Finding[] = [];
/**
 * Markers still standing past a line because the OBJECTIVE is authored inside
 * the junction: the lawful aim point does not fit in its acceptance circle, so
 * pulling the marker back would trade „it points past the line" for „I stopped
 * on it and nothing happened" (doc 86 §7 R6). Guidance cannot fix these; the
 * template that authored the zone has to move it. Pinned below with the exact
 * overshoot so the list can only shrink.
 */
const authoredInsideJunction: { key: string; pastM: number; radiusM: number }[] = [];
const compileFailures: string[] = [];
const missingWorlds = new Set<string>();
let rungCount = 0;
let objectiveCount = 0;

/** Where the route's own travel direction sits, at a given arclength. */
function routeDirAt(route: DerivedRoute, idx: number): [number, number] {
  const a = Math.max(0, idx - 1);
  const b = Math.min(route.count - 1, idx + 1);
  const dx = route.pts[b * 2] - route.pts[a * 2];
  const dy = route.pts[b * 2 + 1] - route.pts[a * 2 + 1];
  const len = Math.hypot(dx, dy);
  return len > 1e-6 ? [dx / len, dy / len] : [0, 1];
}

/**
 * Does this route DRIVE ACROSS this stop line? Only lines the student's own
 * path actually meets, in the line's own travel direction, can govern the
 * marker — the cross-street's Б2 at a median gap is not the boulevard
 * driver's obligation (that false positive is `sc-mv-uturn-ban`).
 */
function routeCrosses(route: DerivedRoute, line: GuidanceStopLine): boolean {
  let bestIdx = -1;
  let bestD2 = ROUTE_TOUCHES_LINE_M * ROUTE_TOUCHES_LINE_M;
  for (let i = 0; i < route.count; i += 1) {
    const dx = route.pts[i * 2] - line.x;
    const dy = route.pts[i * 2 + 1] - line.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return false;
  const [rx, ry] = routeDirAt(route, bestIdx);
  return rx * line.dirX + ry * line.dirY >= ROUTE_ALONG_DOT;
}

beforeAll(() => {
  for (const spec of SCENARIO_TEMPLATES) {
    for (const rung of spec.levels) {
      rungCount += 1;
      let lesson: LessonSpec;
      try {
        lesson = compileScenario(spec, rung.level);
      } catch (e) {
        compileFailures.push(`${spec.id}@L${rung.level}: ${(e as Error).message}`);
        continue;
      }
      const districtId = lesson.world?.districtId ?? DEFAULT_DISTRICT_ID;
      const world = worldFor(districtId);
      if (!world) {
        missingWorlds.add(districtId);
        continue;
      }

      // The runtime re-derives on objective change, starting from the car —
      // which, at that instant, is at the previous waypoint. Objective 0
      // starts at the spawn.
      let from = lesson.spawn.pointId
        ? world.spawns.get(lesson.spawn.pointId)
        : lesson.spawn.position
          ? {
              x: lesson.spawn.position.x,
              y: lesson.spawn.position.y,
              headingDeg: lesson.spawn.headingDeg ?? 0,
            }
          : undefined;
      if (!from) continue;

      for (let i = 0; i < lesson.objectives.length; i += 1) {
        objectiveCount += 1;
        const goal = guidanceGoalFor(lesson, i, {
          stopLines: world.stopLines,
          from: { x: from.x, y: from.y },
        });
        if (!goal || goal.kind !== "point") continue;
        const params = parseObjectiveParams(lesson.objectives[i]!);
        // The route the marker sits at the END of — no look-ahead leg: a leg
        // that continues into objective n+1 legitimately crosses lines beyond
        // the marker, and those are not this marker's obligation.
        const route = deriveGuidanceRoute(world.graph, from, { kind: "point" as const, x: goal.x, y: goal.y });
        if (goal.marker) {
          cases.push({
            scenarioId: spec.id,
            level: rung.level,
            objectiveIndex: i,
            objectiveId: lesson.objectives[i]!.id,
            paramKind: params.kind === "completeManeuver" ? params.maneuver : params.kind,
            districtId,
            goal,
            from,
            route,
            radiusM: goal.shape.kind === "zone" ? goal.shape.radiusM : null,
            ...(goal.maxSpeedKmh !== undefined ? { maxSpeedKmh: goal.maxSpeedKmh } : {}),
          });

          // --- G1: never past a governing stop line -------------------------
          if (route) {
            const near = Math.max(goal.acceptRadiusM, MIN_GOVERNING_NEAR_M);
            for (const line of world.stopLines) {
              const gap = Math.hypot(goal.x - line.x, goal.y - line.y);
              if (gap > near) continue;
              if (!routeCrosses(route, line)) continue;
              const past = (goal.x - line.x) * line.dirX + (goal.y - line.y) * line.dirY;
              if (past <= PAST_TOLERANCE_M) continue;
              const where = `${spec.id}@L${rung.level} obj${i} ${lesson.objectives[i]!.id}`;
              // Could the guidance layer have pulled this marker back onto the
              // lawful side and still have landed inside the gate the engine
              // tests? If yes, it should have (that is the B18 clamp) and this
              // is a guidance defect. If no, the zone itself is inside the
              // junction and only its template can move it.
              const back =
                goal.affordance === "halt" ? STOP_BAR_BEFORE_LINE_M : THROUGH_GATE_BEFORE_LINE_M;
              let reachable = false;
              if (params.kind === "reachZone") {
                // The clamp's own arithmetic: slide into the marker's lane,
                // then step back off the paint.
                const lat =
                  (params.x - line.x) * -line.dirY + (params.y - line.y) * line.dirX;
                const px = line.x - line.dirX * back - line.dirY * lat;
                const py = line.y - line.dirY * back + line.dirX * lat;
                reachable =
                  Math.hypot(px - params.x, py - params.y) <=
                  params.radiusM * MARKER_INSIDE_FRACTION;
              }
              if (!reachable && params.kind === "reachZone") {
                authoredInsideJunction.push({
                  key: `${spec.id}#${lesson.objectives[i]!.id}`,
                  pastM: past,
                  radiusM: params.radiusM,
                });
                continue;
              }
              findings.push({
                where,
                detail:
                  `marker (${goal.x.toFixed(2)}, ${goal.y.toFixed(2)}) is ${past.toFixed(2)} m ` +
                  `PAST ${line.graded ? "graded" : "painted"} line ${line.id} at ` +
                  `(${line.x.toFixed(2)}, ${line.y.toFixed(2)}) — on the far side of a cut ` +
                  `this lesson's own route drives across`,
              });
            }
          }
        }
        // Chain forward: the next objective is guided from this one's target.
        from = { x: goal.x, y: goal.y, headingDeg: from.headingDeg };
      }
    }
  }
}, 600_000);

// ---------------------------------------------------------------------------

describe("guidance geometry — the sweep is real", () => {
  it("walks every scenario × every authored rung", () => {
    expect(WORLD_DIR, "content/world must be reachable from the test runner").toBeTruthy();
    expect(compileFailures).toEqual([]);
    expect([...missingWorlds]).toEqual([]);
    expect(SCENARIO_TEMPLATES.length).toBeGreaterThanOrEqual(154);
    expect(rungCount).toBeGreaterThanOrEqual(660);
    expect(objectiveCount).toBeGreaterThan(1500);
    expect(cases.length).toBeGreaterThan(1500);
  });
});

describe("G1 — no marker teaches the student to stop inside a junction", () => {
  it("every marker is on the APPROACH side of every line its route crosses", () => {
    expect(findings.map((f) => `${f.where} — ${f.detail}`)).toEqual([]);
  });

  it("sc-roundabout-entry's waypoint moved from 1.72 m PAST the М8 give-way line to 0.80 m before it", () => {
    // Register B18, the founder's own лesson («Кръгово движение», catalog 6):
    // „the green circle is actually put AFTER the stop marked line — I know I
    // have to stop BEFORE the line". The line is real paint (markings.ts
    // paints an М8 give-way bar at every roundabout mouth) but it is NOT a
    // graded line — runtime/stoplines.ts:248 skips roundabout nodes — so the
    // T3 fix, which only ever looked at graded lines, could not see it.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-roundabout-entry")!;
    const lesson = compileScenario(spec, 3);
    const world = worldFor(lesson.world!.districtId)!;
    const spawn = world.spawns.get(lesson.spawn.pointId!)!;
    const line = world.stopLines.find((l) => l.edgeId === "rbm-e-arm-s")!;
    expect(line.control).toBe("giveWay");
    expect(line.graded).toBe(false); // painted, never convicted on
    expect({ x: +line.x.toFixed(2), y: +line.y.toFixed(2) }).toEqual({ x: 0, y: -35.72 });

    const params = parseObjectiveParams(lesson.objectives[0]!);
    if (params.kind !== "reachZone") throw new Error("unreachable");
    // BEFORE: the authored anchor, 1.72 m inside the mouth.
    const authoredPast =
      (params.x - line.x) * line.dirX + (params.y - line.y) * line.dirY;
    expect(authoredPast).toBeCloseTo(1.72, 2);

    // AFTER: a gate bar across the lane, 0.80 m on the approach side.
    const goal = guidanceGoalFor(lesson, 0, {
      stopLines: world.stopLines,
      from: spawn,
    })!;
    if (goal.kind !== "point") throw new Error("unreachable");
    const past = (goal.x - line.x) * line.dirX + (goal.y - line.y) * line.dirY;
    expect(past).toBeCloseTo(-THROUGH_GATE_BEFORE_LINE_M, 6);
    expect(goal.shape.kind).toBe("gate");
    expect(goal.labelBg).toBe("Карай до линията за пропускане");
    expect(goal.stopLineId).toBe(line.id);
    // …and the cap the objective hides is still published on it (T8).
    expect(goal.maxSpeedKmh).toBe(params.maxSpeedKmh);
    // The move can never cost the student the objective: the bar he stops on
    // is 2.52 m from the zone centre, well inside the radius the engine tests.
    expect(Math.hypot(goal.x - params.x, goal.y - params.y)).toBeCloseTo(2.52, 2);
    expect(Math.hypot(goal.x - params.x, goal.y - params.y)).toBeLessThan(
      params.radiusM * MARKER_INSIDE_FRACTION,
    );
  });

  it("the marker is never pulled onto a line the student has no way to satisfy", () => {
    // The other face of the clamp. Where the lawful aim point does NOT fit
    // inside the objective's acceptance circle the marker stays put, because
    // moving it would produce doc 86 §7 R6's worse failure — „стоях точно на
    // маркера и нищо не стана". Those objectives are authored inside the
    // junction and belong to the template that wrote them.
    //
    // OPEN, REPORTED, NOT FIXED HERE — owner:
    //   platform/src/modules/sim/lessons/scenario/templates-roundabout.ts
    //   · sc-rbg-yield-line  says «Спри на линията за пропускане» and puts its
    //     3 m zone at y −26, i.e. 9.72 m INSIDE the ring (the М8 bar is at
    //     y −35.72). It grades a stop 9.7 m past the line it names.
    //   · sc-rb2-inner-lane puts its 3.5 m zone 5.85 m past the rb-2lane mouth.
    // Both need their `y` moved back onto the approach; then this pin fails
    // and whoever fixed them deletes it.
    const keys = [...new Set(authoredInsideJunction.map((f) => f.key))].sort();
    expect(keys).toEqual([
      "sc-rb-busy-gap#sc-rbg-yield-line",
      "sc-rb-lane-choice#sc-rb2-inner-lane",
    ]);
    const worst = new Map<string, number>();
    for (const f of authoredInsideJunction) {
      worst.set(f.key, Math.max(worst.get(f.key) ?? 0, f.pastM));
    }
    expect(worst.get("sc-rb-busy-gap#sc-rbg-yield-line")).toBeCloseTo(9.72, 2);
    expect(worst.get("sc-rb-lane-choice#sc-rb2-inner-lane")).toBeCloseTo(5.85, 2);
  });

  it("sc-junction-stop's Б2 marker moved from 27.72 m PAST the line to 2 m BEFORE it", () => {
    // The exact defect doc 86 T3 opens with, pinned as a number in both
    // directions so a regression cannot hide behind a green sweep.
    const lesson = compileScenario(
      SCENARIO_TEMPLATES.find((s) => s.id === "sc-junction-stop")!,
      1,
    );
    const world = worldFor(lesson.world!.districtId)!;
    const objIdx = lesson.objectives.findIndex((o) => o.kind === "passSignal");
    expect(objIdx).toBeGreaterThanOrEqual(0);

    const line = world.stopLines.find((l) => l.control === "stopSign")!;
    expect(line).toBeTruthy();

    // BEFORE: the authored anchor (what the two-argument form still returns).
    const authored = guidanceGoalFor(lesson, objIdx)!;
    expect(authored.kind).toBe("point");
    if (authored.kind !== "point") throw new Error("unreachable");
    const authoredPast =
      (authored.x - line.x) * line.dirX + (authored.y - line.y) * line.dirY;
    expect(authored.x).toBe(0);
    expect(authored.y).toBe(0);
    expect(authoredPast).toBeCloseTo(27.72, 1);

    // AFTER: resolved against the graded line, from the lesson's own spawn.
    const spawn = world.spawns.get(lesson.spawn.pointId!)!;
    const resolved = guidanceGoalFor(lesson, objIdx, {
      stopLines: world.stopLines,
      from: spawn,
    })!;
    if (resolved.kind !== "point") throw new Error("unreachable");
    const resolvedPast =
      (resolved.x - line.x) * line.dirX + (resolved.y - line.y) * line.dirY;
    expect(resolvedPast).toBeCloseTo(-STOP_BAR_BEFORE_LINE_M, 6);
    expect(resolved.shape.kind).toBe("gate");
    expect(resolved.affordance).toBe("halt");
    expect(resolved.labelBg).toBe("Спри на стоп-линията");
  });
});

describe("G2 — the drawn ring IS the acceptance radius", () => {
  it("every zone marker renders its objective's own radiusM, never a decoration", () => {
    const wrong: string[] = [];
    for (const c of cases) {
      const radii = markerRingRadii(c.goal);
      if (c.goal.shape.kind !== "zone") {
        if (radii !== null) wrong.push(`${c.scenarioId}@L${c.level} obj${c.objectiveIndex}: gate drew a ring`);
        continue;
      }
      if (radii === null) {
        wrong.push(`${c.scenarioId}@L${c.level} obj${c.objectiveIndex}: zone drew no ring`);
        continue;
      }
      if (radii.outerM !== c.goal.acceptRadiusM) {
        wrong.push(
          `${c.scenarioId}@L${c.level} obj${c.objectiveIndex}: ring ${radii.outerM} ≠ radius ${c.goal.acceptRadiusM}`,
        );
      }
      if (!(radii.innerM > 0 && radii.innerM < radii.outerM)) {
        wrong.push(`${c.scenarioId}@L${c.level} obj${c.objectiveIndex}: degenerate ring band`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("a radius-3.5 waypoint no longer draws the old fixed 1.85 m circle", () => {
    // The T8 arithmetic: the ring the founder aimed at was 1.85 m while the
    // gate was 3.5 — so „half a lane to one side" silently failed a target
    // whose drawn footprint said he was nowhere near it.
    const small = cases.filter((c) => c.radiusM !== null && c.radiusM <= 4);
    expect(small.length).toBeGreaterThan(0);
    for (const c of small) {
      expect(markerRingRadii(c.goal)!.outerM).toBe(c.radiusM);
    }
    const anyOldRing = cases.filter(
      (c) => c.goal.shape.kind === "zone" && Math.abs(c.goal.shape.radiusM - 1.85) < 1e-9,
    );
    expect(anyOldRing).toHaveLength(0);
  });
});

describe("G3 — the marker publishes its contract", () => {
  it("every passSignal marker is a GATE resolved onto a graded stop line", () => {
    const ps = cases.filter((c) => c.paramKind === "passSignal");
    expect(ps.length).toBeGreaterThan(0);
    const unresolved = ps.filter((c) => c.goal.shape.kind !== "gate" || !c.goal.stopLineId);
    expect(
      unresolved.map((c) => `${c.scenarioId}@L${c.level} obj${c.objectiveIndex}`),
    ).toEqual([]);
    // 11 distinct passSignal objectives in the catalog (doc 86 T3 lists 9 —
    // it misses sc-ln-turn-lane-arrows and counts sc-junction-gap's already
    // correct anchor separately; the measured figure is 11 objectives, 10 of
    // which were authored at the junction node).
    const distinct = new Set(ps.map((c) => `${c.scenarioId}#${c.objectiveId}`));
    expect(distinct.size).toBe(11);
    for (const c of ps) {
      expect(c.goal.marker).toBe(true);
      if (c.goal.shape.kind !== "gate") throw new Error("unreachable");
      expect(c.goal.shape.halfWidthM).toBeCloseTo(GATE_HALF_WIDTH_M, 6);
      expect(Math.hypot(c.goal.shape.dirX, c.goal.shape.dirY)).toBeCloseTo(1, 6);
      expect(["Спри на стоп-линията", "Премини на зелено"]).toContain(c.goal.labelBg);
    }
  });

  it("a stop-sign gate sits 2 m before the paint; a light gate sits on it", () => {
    const halts = cases.filter((c) => c.paramKind === "passSignal" && c.goal.affordance === "halt");
    const through = cases.filter(
      (c) => c.paramKind === "passSignal" && c.goal.affordance === "through",
    );
    expect(halts.length).toBeGreaterThan(0);
    expect(through.length).toBeGreaterThan(0);
    for (const c of [...halts, ...through]) {
      const world = worldFor(c.districtId)!;
      const line = world.stopLines.find((l) => l.id === c.goal.stopLineId)!;
      const past = (c.goal.x - line.x) * line.dirX + (c.goal.y - line.y) * line.dirY;
      expect(past).toBeCloseTo(
        c.goal.affordance === "halt" ? -STOP_BAR_BEFORE_LINE_M : -THROUGH_GATE_BEFORE_LINE_M,
        6,
      );
    }
  });

  it("every speed-capped objective's cap reaches the marker", () => {
    const missing: string[] = [];
    let capped = 0;
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        let lesson: LessonSpec;
        try {
          lesson = compileScenario(spec, rung.level);
        } catch {
          continue;
        }
        const world = worldFor(lesson.world?.districtId ?? DEFAULT_DISTRICT_ID);
        if (!world) continue;
        for (let i = 0; i < lesson.objectives.length; i += 1) {
          const params = parseObjectiveParams(lesson.objectives[i]!);
          if (params.kind !== "reachZone" || params.maxSpeedKmh === undefined) continue;
          capped += 1;
          const goal = guidanceGoalFor(lesson, i, { stopLines: world.stopLines });
          if (!goal || goal.kind !== "point" || goal.maxSpeedKmh !== params.maxSpeedKmh) {
            missing.push(`${spec.id}@L${rung.level} obj${i}`);
          }
        }
      }
    }
    expect(capped).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it("a halt cap reads as «Спри тук», a cruise cap as «Карай дотук»", () => {
    // …unless the waypoint was resolved onto a line (B18), in which case the
    // marker names the line it now stands on instead — an instructor says
    // «спри на линията за пропускане», never «спри тук» while pointing at a
    // give-way bar.
    const onALine = (c: MarkerCase) => c.goal.shape.kind === "gate";
    const halts = cases.filter(
      (c) => c.paramKind === "reachZone" && c.goal.affordance === "halt" && !onALine(c),
    );
    expect(halts.length).toBeGreaterThan(0);
    for (const c of halts) {
      expect(c.maxSpeedKmh).toBeDefined();
      expect(c.maxSpeedKmh!).toBeLessThanOrEqual(6);
      expect(c.goal.labelBg).toBe("Спри тук");
    }
    const cruise = cases.filter(
      (c) => c.paramKind === "reachZone" && c.goal.affordance === "through" && !onALine(c),
    );
    for (const c of cruise) expect(c.goal.labelBg).toBe("Карай дотук");

    // Every clamped one names its own line, carries its cap, and is a bar.
    const clamped = cases.filter((c) => c.paramKind === "reachZone" && onALine(c));
    expect(clamped.length).toBeGreaterThan(0);
    for (const c of clamped) {
      expect(c.goal.stopLineId).toBeTruthy();
      expect([
        "Спри на линията за пропускане",
        "Карай до линията за пропускане",
        "Спри на стоп-линията",
        "Карай до стоп-линията",
      ]).toContain(c.goal.labelBg);
      if (c.goal.shape.kind !== "gate") throw new Error("unreachable");
      expect(c.goal.shape.halfWidthM).toBeCloseTo(GATE_HALF_WIDTH_M, 6);
    }
  });

  it("a clamped waypoint still satisfies the gate it was clamped away from", () => {
    // The invariant that makes B18's fix safe: wherever the marker moved, a
    // student who stops ON it is inside the acceptance circle the engine
    // tests. Without this the fix would swap one lie for a worse one.
    const clamped = cases.filter(
      (c) => c.paramKind === "reachZone" && c.goal.shape.kind === "gate",
    );
    expect(clamped.length).toBeGreaterThan(0);
    for (const c of clamped) {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === c.scenarioId)!;
      const rung = spec.levels.find((l) => l.level === c.level)!;
      const lesson = compileScenario(spec, rung.level);
      const params = parseObjectiveParams(lesson.objectives[c.objectiveIndex]!);
      if (params.kind !== "reachZone") throw new Error("unreachable");
      const off = Math.hypot(c.goal.x - params.x, c.goal.y - params.y);
      expect(
        off,
        `${c.scenarioId}@L${c.level} obj${c.objectiveIndex} clamped ${off.toFixed(2)} m off a radius-${params.radiusM} gate`,
      ).toBeLessThanOrEqual(params.radiusM * MARKER_INSIDE_FRACTION);
    }
  });
});

describe("L5 — guidance looks ahead", () => {
  it("the right turn out of sc-junction-stop is on the ribbon BEFORE the junction", () => {
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-junction-stop")!;
    const lesson = compileScenario(spec, 1);
    const world = worldFor(lesson.world!.districtId)!;
    const spawn = world.spawns.get(lesson.spawn.pointId!)!;
    const ctx = { stopLines: world.stopLines, from: { x: spawn.x, y: spawn.y } };

    const psIdx = lesson.objectives.findIndex((o) => o.kind === "passSignal");
    const goal = guidanceGoalFor(lesson, psIdx, ctx)!;
    const next = guidanceGoalFor(lesson, psIdx + 1, ctx);
    expect(next).not.toBeNull();
    if (goal.kind !== "point" || !next || next.kind !== "point") throw new Error("unreachable");

    // Old behaviour: the ribbon stops at the marker and knows no turn.
    const withoutLookahead = deriveGuidanceRoute(world.graph, spawn, { kind: "point" as const, x: goal.x, y: goal.y })!;
    expect(withoutLookahead.turns).toHaveLength(0);

    // New behaviour: the route runs into objective n+1, so the right turn at
    // the junction exists — and it exists BEFORE the marker (goalS), which is
    // what „надясно на следващото кръстовище" means.
    const withLookahead = deriveGuidanceRoute(
      world.graph,
      spawn,
      { kind: "point" as const, x: goal.x, y: goal.y },
      { lookahead: { kind: "point", x: next.x, y: next.y } },
    )!;
    expect(withLookahead.turns.length).toBeGreaterThanOrEqual(1);
    const turn = withLookahead.turns[0]!;
    expect(turn.side).toBe("right");
    expect(withLookahead.totalLen).toBeGreaterThan(withoutLookahead.totalLen + 30);
    // The turn is announced while the student is still on the approach: its
    // arclength is within a junction's width of the marker, and the chevron
    // horizon is 140 m, so it is drawn long before the nose commits.
    expect(turn.s).toBeGreaterThan(withLookahead.goalS - 1);
    expect(turn.s - withLookahead.goalS).toBeLessThan(40);
    expect(withLookahead.goalS).toBeGreaterThan(0);
    expect(withLookahead.goalS).toBeLessThan(withLookahead.totalLen);
  });

  it("the right turn is on the ribbon from the SPAWN, on the approach objective", () => {
    // Register B24/B6, and the half doc 86 L5 did not close. The catalog chain
    // is approach → stop line → exit-east. While the APPROACH is active,
    // objective n+1 is the stop line, which is dead ahead — so a one-deep
    // look-ahead announced nothing at all, and the turn appeared only when the
    // nose crossed the Б2 paint and objective 2 went active. That is the
    // founder's sentence: „the green line changes to right only after I cross
    // the marking". The chain now carries the ribbon through the stop line
    // into the exit, so the arrow exists while the car is still 105 m out.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-junction-stop")!;
    const lesson = compileScenario(spec, 1);
    const world = worldFor(lesson.world!.districtId)!;
    const spawn = world.spawns.get(lesson.spawn.pointId!)!;
    const ctx = { stopLines: world.stopLines, from: { x: spawn.x, y: spawn.y } };

    const g0 = guidanceGoalFor(lesson, 0, ctx)!;
    const g1 = guidanceGoalFor(lesson, 1, ctx)!;
    const g2 = guidanceGoalFor(lesson, 2, ctx)!;
    if (g0.kind !== "point" || g1.kind !== "point" || g2.kind !== "point") {
      throw new Error("unreachable");
    }
    const target = { kind: "point" as const, x: g0.x, y: g0.y };

    // ONE objective of look-ahead: still nothing to signal for.
    const oneDeep = deriveGuidanceRoute(world.graph, spawn, target, {
      lookahead: { kind: "point", x: g1.x, y: g1.y },
    })!;
    expect(oneDeep.turns).toHaveLength(0);

    // The chain: the right turn is there, past the active waypoint, and the
    // student is still on the stem (goalS is the marker, 60 m out).
    const chained = deriveGuidanceRoute(world.graph, spawn, target, {
      lookahead: [
        { kind: "point", x: g1.x, y: g1.y },
        { kind: "point", x: g2.x, y: g2.y },
      ],
    })!;
    expect(chained.turns.length).toBeGreaterThanOrEqual(1);
    expect(chained.turns[0]!.side).toBe("right");
    expect(chained.turns[0]!.s).toBeGreaterThan(chained.goalS);
    // Inside the chevron horizon (RouteGuidance ARROW_VISIBLE_AHEAD_M = 140)
    // measured from the CAR at the spawn, which is where the ribbon starts.
    expect(chained.turns[0]!.s).toBeLessThan(140);
    expect(chained.goalS).toBeCloseTo(oneDeep.goalS, 0);
  });

  it("the chain stops as soon as a turn is found — it does not run the whole lesson", () => {
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-junction-stop")!;
    const lesson = compileScenario(spec, 1);
    const world = worldFor(lesson.world!.districtId)!;
    const spawn = world.spawns.get(lesson.spawn.pointId!)!;
    const ctx = { stopLines: world.stopLines, from: { x: spawn.x, y: spawn.y } };
    const g0 = guidanceGoalFor(lesson, 0, ctx)!;
    const g1 = guidanceGoalFor(lesson, 1, ctx)!;
    const g2 = guidanceGoalFor(lesson, 2, ctx)!;
    if (g0.kind !== "point" || g1.kind !== "point" || g2.kind !== "point") {
      throw new Error("unreachable");
    }
    const chain = [
      { kind: "point" as const, x: g1.x, y: g1.y },
      { kind: "point" as const, x: g2.x, y: g2.y },
    ];
    const two = deriveGuidanceRoute(world.graph, spawn, { kind: "point", x: g0.x, y: g0.y }, {
      lookahead: chain,
    })!;
    // Repeating the last target a third time adds nothing: the loop broke on
    // the turn, so the ribbon is the same length either way.
    const three = deriveGuidanceRoute(world.graph, spawn, { kind: "point", x: g0.x, y: g0.y }, {
      lookahead: [...chain, { kind: "point" as const, x: 55, y: -4.06 }],
    })!;
    expect(three.totalLen).toBeCloseTo(two.totalLen, 1);
  });

  it("an „ahead\" corridor is worth the distance it asked for, not the length of its edge", () => {
    // Register B1: Урок 7's 80 m request came back as 176 m of green ribbon
    // running past the parking bay to the end of the street. The walk appends
    // whole edges; it is now trimmed to what was asked plus two densify steps.
    const world = worldFor(DEFAULT_DISTRICT_ID)!;
    const spawn = world.spawns.get("spawn-1")!;
    for (const meters of [40, 60, 80, 120]) {
      const route = deriveGuidanceRoute(world.graph, spawn, { kind: "ahead", meters })!;
      expect(route.totalLen).toBeGreaterThanOrEqual(meters);
      expect(
        route.totalLen,
        `ahead ${meters} m overran to ${route.totalLen.toFixed(1)} m`,
      ).toBeLessThanOrEqual(meters + AHEAD_OVERRUN_M + 0.01);
    }
    // The untrimmed walk is what it used to draw, and it is 176 m.
    const walked = deriveGuidanceRoute(world.graph, spawn, { kind: "ahead", meters: 1e6 })!;
    expect(walked.totalLen).toBeGreaterThan(170);
  });

  it("the look-ahead leg is capped and never replaces the active waypoint", () => {
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-junction-stop")!;
    const lesson = compileScenario(spec, 1);
    const world = worldFor(lesson.world!.districtId)!;
    const spawn = world.spawns.get(lesson.spawn.pointId!)!;
    const goal = guidanceGoalFor(lesson, 1, { stopLines: world.stopLines, from: spawn })!;
    if (goal.kind !== "point") throw new Error("unreachable");
    const capped = deriveGuidanceRoute(
      world.graph,
      spawn,
      { kind: "point" as const, x: goal.x, y: goal.y },
      { lookahead: { kind: "point", x: 55, y: -4.06 }, lookaheadMaxM: 10 },
    )!;
    const uncapped = deriveGuidanceRoute(
      world.graph,
      spawn,
      { kind: "point" as const, x: goal.x, y: goal.y },
      { lookahead: { kind: "point", x: 55, y: -4.06 } },
    )!;
    expect(uncapped.totalLen - capped.totalLen).toBeGreaterThan(20);
    // goalS is the marker, not the end of the ribbon, in both.
    expect(capped.goalS).toBeCloseTo(uncapped.goalS, 0);
  });
});

describe("the two-argument form is a separate, deliberate reading", () => {
  it("guidanceGoalFor(lesson, i) still returns the AUTHORED anchor", () => {
    // world/referents.ts's T3 census counts what an author wrote, not what the
    // renderer corrects. Changing this silently would move Lane 0's baseline
    // without anyone deciding to.
    const lesson = compileScenario(
      SCENARIO_TEMPLATES.find((s) => s.id === "sc-signal-response")!,
      1,
    );
    const idx = lesson.objectives.findIndex((o) => o.kind === "passSignal");
    const goal = guidanceGoalFor(lesson, idx)!;
    if (goal.kind !== "point") throw new Error("unreachable");
    expect({ x: goal.x, y: goal.y }).toEqual({ x: 0, y: 0 });
    expect(goal.shape.kind).toBe("zone");
    expect(goal.acceptRadiusM).toBe(45);
  });
});
