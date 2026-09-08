/**
 * sc-rb-busy-gap / sc-rbg-exit — the ribbon for «Премини през кръга и го
 * напусни с включен десен мигач» REACHES THE EXIT. Audit row
 * sc-rb-busy-gap:5ee56710 („Leaving at the second exit never ticks in any leg
 * — no drive has completed the roundabout the lesson is named after").
 *
 * WHAT WAS MEASURED, 2026-09-08, through the same pair the scene calls
 * (`guidanceGoalFor` → `deriveGuidanceRoute`), sweeping the pose the maneuver
 * row actually opens in — anywhere on `sc-rbg-exit-approach`'s disc at φ = 160:
 *
 *   φ 140–160   leg 6.2–12.4 m, ending at (0, 18) — the north MOUTH, on the
 *               ring. The objective is not graded complete until r > 34, so
 *               the exit itself — the 22 m of arm the row is named after — had
 *               no ribbon at all. On L1 «Пълна помощ» the HUD line is
 *               «Следвай синята линия»; the line stopped at the decision.
 *   φ 165–178   leg 28.6–32.3 m of RING, running past north to the WEST mouth
 *               (`RING_MOUTH_UNDRAWABLE` doing exactly what its own comment
 *               warned it would on a drill whose exit is the near mouth) —
 *               i.e. the aided rung pointed the student past his own exit.
 *
 * The repair is the one `guidanceRoute.ts` had already named and not built:
 * let the objective NAME its exit (`RoundaboutParams.exit`, guidance-only —
 * `stepRoundabout` still credits any signalled departure, so authoring it can
 * refuse no drive), and carry the ring walk out through that arm.
 *
 * This file is the gate. It sweeps poses rather than replaying one, because a
 * single pose is a point and the defect above lived in the difference between
 * two poses 5° apart.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES, compileScenario, type LessonSpec } from "@/modules/sim/lessons";
import { parseDistrict } from "@/modules/sim/runtime";
import { buildRouteGraph, deriveGuidanceRoute, guidanceGoalFor } from "./guidanceRoute";

const WORLD_DIR = [
  path.join(process.cwd(), "content", "world"),
  path.resolve(process.cwd(), "..", "content", "world"),
].find((d) => fs.existsSync(d))!;

/** rb-mini-v1: ring centreline radius, and the row's own „left it" radius. */
const RING_R = 18;
const EXIT_RADIUS_M = 34;

const SPEC = SCENARIO_TEMPLATES.find((s) => s.id === "sc-rb-busy-gap")!;
const DISTRICT = parseDistrict(
  JSON.parse(fs.readFileSync(path.join(WORLD_DIR, "rb-mini-v1.json"), "utf8")) as unknown,
);
const GRAPH = buildRouteGraph(DISTRICT);

/** Ring point at circulation angle φ (0 = south node, CCW through east). */
function ring(phiDeg: number): { x: number; y: number } {
  const a = (phiDeg * Math.PI) / 180;
  return { x: RING_R * Math.sin(a), y: -RING_R * Math.cos(a) };
}

/** The maneuver row's leg, derived exactly as `RouteGuidance` derives it. */
function legFrom(lesson: LessonSpec, phiDeg: number) {
  const p = ring(phiDeg);
  const from = { x: p.x, y: p.y, headingDeg: phiDeg + 90 };
  const goal = guidanceGoalFor(lesson, lesson.objectives.length - 1, { from: { x: p.x, y: p.y } });
  return deriveGuidanceRoute(GRAPH, from, goal, { lookahead: [] });
}

const LEVELS = SPEC.levels.map((l) => l.level);
/** Every pose the handover disc can hand this row over in, and then some. */
const PHIS = [140, 145, 150, 155, 160, 165, 170, 175, 178];

describe("sc-rbg-exit — the ribbon runs OUT of the named exit", () => {
  for (const level of LEVELS) {
    for (const phi of PHIS) {
      it(`L${level} · handed over at φ=${phi}°`, () => {
        const route = legFrom(compileScenario(SPEC, level), phi);
        expect(route).not.toBeNull();
        const last = route!.count - 1;
        const ex = route!.pts[2 * last]!;
        const ey = route!.pts[2 * last + 1]!;

        // It ends OUT of the ring — past the radius the objective grades on,
        // so the ribbon covers the whole act it is asking for.
        expect(Math.hypot(ex, ey)).toBeGreaterThan(EXIT_RADIUS_M);
        // …and on the NORTH arm (x ≈ 0, y > 0), which is the second exit. The
        // west mouth is (−18, 0) and the east arm is y ≈ 0: either would show
        // up here as a sign flip, which is the failure this file exists for.
        expect(ey).toBeGreaterThan(EXIT_RADIUS_M);
        expect(Math.abs(ex)).toBeLessThan(2);
      });
    }
  }

  it("no pose on the disc draws the student past his exit to the WEST mouth", () => {
    for (const level of LEVELS) {
      const lesson = compileScenario(SPEC, level);
      for (const phi of PHIS) {
        const route = legFrom(lesson, phi)!;
        for (let s = 0; s < route.count; s += 1) {
          // −x is the far half of the ring: reaching it means the leg went
          // round past north instead of turning out at it.
          expect(route.pts[2 * s]!).toBeGreaterThan(-4);
        }
      }
    }
  });
});

describe("the naming is opt-in — nothing else in the catalogue moved", () => {
  it("exactly one shipped maneuver row carries an exitPoint, and it is this one", () => {
    const named: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level);
        for (let i = 0; i < lesson.objectives.length; i += 1) {
          const goal = guidanceGoalFor(lesson, i);
          if (!goal || goal.kind !== "point" || goal.exitPoint === undefined) continue;
          named.push(`${spec.id}/${lesson.objectives[i]!.id}`);
        }
      }
    }
    expect([...new Set(named)]).toEqual(["sc-rb-busy-gap/sc-rbg-exit"]);
  });

  it("a roundabout row that names no exit still stops at a mouth, on the ring", () => {
    // sc-rb-circulate-priority shares this island and this handover geometry —
    // it is the control. If a later template names ITS exit too, this case
    // moves to whichever rb-mini drill still does not, rather than being
    // deleted: „the ribbon ends on the ring" is the behaviour the opt-in keeps.
    const control = SCENARIO_TEMPLATES.find((s) => s.id === "sc-rb-circulate-priority")!;
    const lesson = compileScenario(control, 3);
    const i = lesson.objectives.length - 1;
    const p = ring(160);
    const goal = guidanceGoalFor(lesson, i, { from: { x: p.x, y: p.y } });
    expect(goal!.kind === "point" && goal!.exitPoint).toBeUndefined();
    const route = deriveGuidanceRoute(GRAPH, { ...p, headingDeg: 250 }, goal, { lookahead: [] })!;
    const last = route.count - 1;
    expect(Math.hypot(route.pts[2 * last]!, route.pts[2 * last + 1]!)).toBeLessThanOrEqual(
      RING_R + 1,
    );
  });
});
