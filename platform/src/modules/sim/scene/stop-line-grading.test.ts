/**
 * FR-24, the GRADED half — „I have to stop BEFORE the line, not after it."
 *
 * `guidance-geometry.test.ts` next door polices what the student SEES: no green
 * marker may stand past a stop line its own route drives across. That half is
 * done and measured — every marker is drawn a documented setback on the
 * approach side of the paint (2.00 m for a halt bar, 0.80 m for a through gate).
 *
 * THE GRADE NEVER FOLLOWED. `stepReachZone` credits a car anywhere inside the
 * authored radius, and the authored radius is a CIRCLE: a 9 m acceptance
 * centred at the mouth of a junction credits a car standing nine metres inside
 * the box. So the picture said „stop here, before the paint" and the scoring
 * said „anywhere within nine metres of here is fine, including past it". A
 * student who rolls over the line is told he did it right.
 *
 * `ReachZoneParams.acceptBeforeMarkM` is the cut that fixes it — but it shipped
 * as an OPT-IN authored on exactly ONE objective in the catalog
 * (`sc-rb-approach`). Everywhere else the drawing stayed honest and the grading
 * stayed wrong. That asymmetry is what this file exists to make unauthorable.
 *
 * THE RULE. For every `reachZone` in every template at every rung: if the
 * objective's own acceptance reaches past a stop line its own route drives
 * across, the objective must declare `acceptBeforeMarkM`, and the value must be
 * the MEASURED mark→paint distance — not a hand-picked tolerance. The number is
 * derived here from the district's own paint, so a map edit that moves a line
 * fails this test instead of quietly leaving a stale constant behind.
 *
 * WHAT THIS DOES NOT CLAIM. It does not grade legal correctness and it does not
 * touch markers whose acceptance never reaches the paint — a plain waypoint is
 * a place you get to, from any direction, and cutting those would break the
 * drills the capsule grace exists for.
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
  buildRouteGraph,
  deriveGuidanceRoute,
  guidanceGoalFor,
  stopLinesForGuidance,
  type DerivedRoute,
  type GuidanceStopLine,
  type RouteGraph,
} from "./guidanceRoute";

/** Same meaning, same number, as guidance-geometry.test.ts: paint has width. */
const PAST_TOLERANCE_M = 0.5;
/** A line only governs a marker NEAR it (junction mouth + a car). */
const MIN_GOVERNING_NEAR_M = 12;
const ROUTE_TOUCHES_LINE_M = 12;
const ROUTE_ALONG_DOT = 0.5;

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
      stopLines: stopLinesForGuidance(raw),
      spawns,
    };
  } catch {
    fixture = null;
  }
  worldCache.set(districtId, fixture);
  return fixture;
}

function routeDirAt(route: DerivedRoute, idx: number): [number, number] {
  const a = Math.max(0, idx - 1);
  const b = Math.min(route.count - 1, idx + 1);
  const dx = route.pts[b * 2]! - route.pts[a * 2]!;
  const dy = route.pts[b * 2 + 1]! - route.pts[a * 2 + 1]!;
  const len = Math.hypot(dx, dy);
  return len > 1e-6 ? [dx / len, dy / len] : [0, 1];
}

function routeCrosses(route: DerivedRoute, line: GuidanceStopLine): boolean {
  let bestIdx = -1;
  let bestD2 = ROUTE_TOUCHES_LINE_M * ROUTE_TOUCHES_LINE_M;
  for (let i = 0; i < route.count; i += 1) {
    const dx = route.pts[i * 2]! - line.x;
    const dy = route.pts[i * 2 + 1]! - line.y;
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

/** One objective whose acceptance reaches across paint its own route crosses. */
interface Overhang {
  key: string;
  scenarioId: string;
  objectiveId: string;
  level: number;
  lineId: string;
  graded: boolean;
  /** Signed: + = the authored mark itself sits PAST the paint. */
  pastM: number;
  radiusM: number;
  /** How far past the paint a credited car may stand today. */
  creditReachM: number;
  declared: number | undefined;
}

const overhangs: Overhang[] = [];
const compileFailures: string[] = [];
const missingWorlds = new Set<string>();
let rungCount = 0;
let reachZoneCount = 0;

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
        const goal = guidanceGoalFor(lesson, i, {
          stopLines: world.stopLines,
          from: { x: from.x, y: from.y },
        });
        if (!goal || goal.kind !== "point") continue;
        const params = parseObjectiveParams(lesson.objectives[i]!);
        if (params.kind === "reachZone") {
          reachZoneCount += 1;
          const route = deriveGuidanceRoute(world.graph, from, {
            kind: "point" as const,
            x: goal.x,
            y: goal.y,
          });
          if (route) {
            const near = Math.max(params.radiusM, MIN_GOVERNING_NEAR_M);
            for (const line of world.stopLines) {
              if (Math.hypot(params.x - line.x, params.y - line.y) > near) continue;
              if (!routeCrosses(route, line)) continue;
              // Signed distance of the AUTHORED mark along the line's own
              // travel direction. + = the mark is already inside the junction.
              const pastM = (params.x - line.x) * line.dirX + (params.y - line.y) * line.dirY;
              // `inZone` is a circle, so credit reaches radiusM further along.
              const creditReachM = pastM + params.radiusM;
              if (creditReachM <= PAST_TOLERANCE_M) continue;
              overhangs.push({
                key: `${spec.id}#${lesson.objectives[i]!.id}`,
                scenarioId: spec.id,
                objectiveId: lesson.objectives[i]!.id,
                level: rung.level,
                lineId: line.id,
                graded: line.graded,
                pastM,
                radiusM: params.radiusM,
                creditReachM,
                declared: params.acceptBeforeMarkM,
              });
            }
          }
        }
        from = { x: goal.x, y: goal.y, headingDeg: from.headingDeg };
      }
    }
  }
}, 900_000);

describe("FR-24 — the sweep is real", () => {
  it("walks every scenario × every authored rung", () => {
    expect(WORLD_DIR).toBeTruthy();
    expect(compileFailures).toEqual([]);
    expect([...missingWorlds]).toEqual([]);
    expect(rungCount).toBeGreaterThanOrEqual(660);
    expect(reachZoneCount).toBeGreaterThan(500);
  });
});

/**
 * Two objectives are authored so deep inside a junction that cutting their
 * acceptance at the paint would leave the disc with NO acceptable region — the
 * required cut is larger than the objective's own radius. Those cannot be fixed
 * from here without turning „graded wrongly" into „impossible to grade", which
 * is doc 86 §7 R6's worse failure. They are the same two objectives
 * `guidance-geometry.test.ts` already pins as authored-inside-the-junction, and
 * they need the same fix: their `y` moved back onto the approach, in
 * templates-roundabout.ts. Listed here so the two files cannot drift apart.
 */
const UNFIXABLE_FROM_HERE = ["sc-rb-busy-gap#sc-rbg-yield-line", "sc-rb-lane-choice#sc-rb2-inner-lane"];

function worstByKey(): Map<string, Overhang> {
  const byKey = new Map<string, Overhang>();
  for (const o of overhangs) {
    const cur = byKey.get(o.key);
    if (!cur || o.creditReachM > cur.creditReachM) byKey.set(o.key, o);
  }
  return byKey;
}

describe("FR-24 — the grade stops where the paint does", () => {
  it("every objective whose acceptance reaches past paint declares the cut", () => {
    const undeclared = [...worstByKey().values()]
      .filter((o) => o.declared === undefined && !UNFIXABLE_FROM_HERE.includes(o.key))
      .sort((a, b) => b.creditReachM - a.creditReachM)
      .map(
        (o) =>
          `${o.key} — acceptance reaches ${o.creditReachM.toFixed(2)} m PAST ` +
          `${o.graded ? "graded" : "painted"} line ${o.lineId}; ` +
          `set acceptBeforeMarkM: ${o.pastM.toFixed(3)}`,
      );
    expect(undeclared).toEqual([]);
  });

  it("every declared cut is the MEASURED mark→paint offset, not a guess", () => {
    const wrong: string[] = [];
    for (const o of overhangs) {
      if (o.declared === undefined) continue;
      if (Math.abs(o.declared - o.pastM) > 0.01) {
        wrong.push(
          `${o.key}@L${o.level} declares ${o.declared} but the district's own ` +
            `line ${o.lineId} measures ${o.pastM.toFixed(3)}`,
        );
      }
    }
    // This is the half that makes a MAP edit fail loudly instead of leaving a
    // stale constant behind: the expected value is re-derived from
    // content/world/*.json on every run, never copied from the template.
    expect([...new Set(wrong)]).toEqual([]);
  });

  it("no cut is deeper than its own radius — an objective must stay completable", () => {
    const bricked = overhangs
      .filter((o) => o.declared !== undefined && o.declared > o.radiusM)
      .map((o) => `${o.key}@L${o.level}: cut ${o.declared} > radius ${o.radiusM}`);
    expect([...new Set(bricked)]).toEqual([]);
  });

  it("the two it cannot fix are named, measured, and owned elsewhere", () => {
    const byKey = worstByKey();
    const stillOpen = UNFIXABLE_FROM_HERE.filter((k) => byKey.get(k)?.declared === undefined);
    // If someone moves those zones back onto the approach, this flips and the
    // list above should shrink — that is the intended way for this to fail.
    expect(stillOpen).toEqual(UNFIXABLE_FROM_HERE);
    expect(byKey.get("sc-rb-busy-gap#sc-rbg-yield-line")!.pastM).toBeCloseTo(9.725, 2);
    expect(byKey.get("sc-rb-lane-choice#sc-rb2-inner-lane")!.pastM).toBeCloseTo(5.85, 2);
    // …and the reason they are excluded is arithmetic, not preference: the cut
    // they need is deeper than the radius they have.
    for (const key of UNFIXABLE_FROM_HERE) {
      const o = byKey.get(key)!;
      expect(o.pastM, `${key}`).toBeGreaterThan(o.radiusM);
    }
  });

  it("the fix reached the whole catalog, not one template", () => {
    // FR-24's actual complaint: the drawn half was catalog-wide and the graded
    // half was authored on exactly ONE objective. If this ever drops back to 1
    // the asymmetry has returned.
    const declared = [...worstByKey().values()].filter((o) => o.declared !== undefined);
    expect(declared.length).toBeGreaterThanOrEqual(11);
  });
});
