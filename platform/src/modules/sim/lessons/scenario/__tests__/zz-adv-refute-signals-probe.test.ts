/**
 * ADVERSARIAL PROBE (throwaway — delete after reading). Measures the ROUTE
 * GUIDANCE ribbon (RouteGuidance.tsx → guidanceRoute.ts), which is a different
 * object from the ShadowCar trace ribbon that signals-sweep161 §2 measured.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildRouteGraph,
  deriveGuidanceRoute,
  guidanceGoalFor,
  stopLinesForGuidance,
  LOOKAHEAD_MAX_LEGS,
  type GuidanceGoal,
  type RouteDistrictLike,
} from "../../../scene/guidanceRoute";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES_SIGNALS } from "../templates-signals";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function district(id: string): RouteDistrictLike & {
  buildings: ReadonlyArray<{ id: string; footprint: ReadonlyArray<readonly [number, number]> }>;
  spawnPoints: ReadonlyArray<{ id: string; x: number; y: number; heading: number }>;
} {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  );
}

function distToPoly(px: number, py: number, poly: ReadonlyArray<readonly [number, number]>): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi;
    const dy = yj - yi;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - xi) * dx + (py - yi) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(px - (xi + t * dx), py - (yi + t * dy)));
  }
  return inside ? 0 : best;
}

describe("ADV: the RouteGuidance ribbon vs the buildings", () => {
  for (const spec of SCENARIO_TEMPLATES_SIGNALS) {
    it(`${spec.id}: derived route clearance`, () => {
      const d = district(spec.map.districtId);
      const graph = buildRouteGraph(d);
      const stopLines = stopLinesForGuidance(d);
      const lesson = compileScenario(spec, 1);
      const spawn = d.spawnPoints.find((p) => p.id === spec.start.spawnPointId)!;
      const nObj = lesson.objectives.length;
      const lines: string[] = [];
      for (let i = 0; i < nObj; i++) {
        const from = { x: spawn.x, y: spawn.y };
        const goal = guidanceGoalFor(lesson, i, { stopLines, from });
        if (!goal) {
          lines.push(`  obj${i}: no goal`);
          continue;
        }
        const lookahead: GuidanceGoal[] = [];
        let f = goal.kind === "point" ? { x: goal.x, y: goal.y } : from;
        for (let k = 1; k <= LOOKAHEAD_MAX_LEGS; k++) {
          const next = guidanceGoalFor(lesson, i + k, { stopLines, from: f });
          if (!next || next.kind !== "point") break;
          lookahead.push(next);
          f = { x: next.x, y: next.y };
        }
        const route = deriveGuidanceRoute(
          graph,
          { x: spawn.x, y: spawn.y, headingDeg: spawn.heading },
          goal as never,
          { lookahead: lookahead as never },
        );
        if (!route) {
          lines.push(`  obj${i}: NO ROUTE (goal ${JSON.stringify(goal)})`);
          continue;
        }
        let worst = Infinity;
        let at = "";
        for (let s = 0; s < route.count; s++) {
          const x = route.pts[s * 2];
          const y = route.pts[s * 2 + 1];
          for (const b of d.buildings) {
            const g = distToPoly(x, y, b.footprint);
            if (g < worst) {
              worst = g;
              at = `${b.id} @(${x.toFixed(1)},${y.toFixed(1)}) s=${route.arc[s].toFixed(0)}`;
            }
          }
        }
        const last = route.count - 1;
        lines.push(
          `  obj${i} len=${route.totalLen.toFixed(0)}m goalS=${route.goalS.toFixed(0)} ` +
            `end=(${route.pts[last * 2].toFixed(1)},${route.pts[last * 2 + 1].toFixed(1)}) ` +
            `minBuilding=${worst.toFixed(2)}m | ${at}`,
        );
      }
      console.log(`${spec.id} [${spec.map.districtId}] spawn=(${spawn.x},${spawn.y})\n${lines.join("\n")}`);
      expect(true).toBe(true);
    });
  }
});
