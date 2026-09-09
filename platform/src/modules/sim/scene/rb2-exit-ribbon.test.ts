/**
 * sc-rb-lane-choice / sc-rb2-exit — the ribbon for «Премини през кръга и го
 * напусни с включен десен мигач» REACHES THE THIRD EXIT. Audit row
 * sc-rb-lane-choice:ffdffd55 („… and neither ever reaches the third exit").
 *
 * WHAT WAS MEASURED at a2c7aec, through the same pair the scene calls
 * (`guidanceGoalFor` → `deriveGuidanceRoute` — `components/sim/RouteGuidance`
 * :1045/:1289), handing the maneuver row over anywhere on the INNER lane
 * (r = 21.94) from the north mouth onward, which is where `sc-rb2-past-north`
 * hands it over:
 *
 *   φ 175–245   the leg ended at (−26.00, 0.00) — the WEST MOUTH, on the ring.
 *               The objective is not graded complete until r > 46, so the third
 *               exit itself — the 26 m of arm the drill is TITLED for — had no
 *               ribbon at all. On L1 «Пълна помощ» the HUD line is «Следвай
 *               синята линия»; the line stopped at the decision.
 *   φ 260       past his own exit, the ring walk carried on to the SOUTH mouth
 *               (−0.07, −25.99): a further lap, drawn as guidance.
 *
 * The repair is the one sc-rbg-exit already made on rb-mini-v1: let the
 * objective NAME its exit (`RoundaboutParams.exit`, guidance-only —
 * `stepRoundabout` still credits any signalled departure, so authoring it can
 * refuse no drive), and carry the ring walk out through that arm. The trace
 * battery `sc-rb-lane-choice-traces.test.ts` is what proves grading did not
 * move: the shadow still replays with ZERO violations and both demos still
 * grade their exact codes.
 *
 * This file sweeps poses rather than replaying one — a single pose is a point,
 * and on the sister drill the defect lived in the difference between two poses
 * 5° apart.
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

/** rb-2lane-v1: the INNER ring lane the drill is about, and the row's own
 *  „left it" radius (`sc-rb2-exit.params.exitRadiusM`). */
const LANE_INNER_R = 21.94;
const EXIT_RADIUS_M = 46;

const SPEC = SCENARIO_TEMPLATES.find((s) => s.id === "sc-rb-lane-choice")!;
const DISTRICT = parseDistrict(
  JSON.parse(fs.readFileSync(path.join(WORLD_DIR, "rb-2lane-v1.json"), "utf8")) as unknown,
);
const GRAPH = buildRouteGraph(DISTRICT);

/** Inner-lane point at circulation angle φ (0 = south node, CCW through east;
 *  the third exit — west — is φ = 270). */
function ring(phiDeg: number): { x: number; y: number } {
  const a = (phiDeg * Math.PI) / 180;
  return { x: LANE_INNER_R * Math.sin(a), y: -LANE_INNER_R * Math.cos(a) };
}

/** The maneuver row's leg, derived exactly as `RouteGuidance` derives it. */
function legFrom(lesson: LessonSpec, phiDeg: number) {
  const p = ring(phiDeg);
  const from = { x: p.x, y: p.y, headingDeg: phiDeg + 90 };
  const goal = guidanceGoalFor(lesson, lesson.objectives.length - 1, { from: { x: p.x, y: p.y } });
  return deriveGuidanceRoute(GRAPH, from, goal, { lookahead: [] });
}

const LEVELS = SPEC.levels.map((l) => l.level);
/** From the mouth `sc-rb2-past-north` hands over at, round to just short of
 *  the west node — every pose the row can open in, and then some. */
const PHIS = [175, 180, 190, 200, 215, 230, 245, 260];

describe("sc-rb2-exit — the ribbon runs OUT of the third (west) exit", () => {
  for (const level of LEVELS) {
    for (const phi of PHIS) {
      it(`L${level} · handed over at φ=${phi}°`, () => {
        const route = legFrom(compileScenario(SPEC, level), phi);
        expect(route).not.toBeNull();
        const last = route!.count - 1;
        const ex = route!.pts[2 * last]!;
        const ey = route!.pts[2 * last + 1]!;

        // It ends OUT of the ring — past the radius the objective grades on —
        // so the ribbon covers the whole act the title asks for.
        expect(Math.hypot(ex, ey)).toBeGreaterThan(EXIT_RADIUS_M);
        // …and on the WEST arm (x ≪ 0, y ≈ 0), which is the third exit. The
        // north arm is x ≈ 0 and the south mouth is y ≈ −26: either would show
        // up here as a sign flip, which is the failure this file exists for.
        expect(ex).toBeLessThan(-EXIT_RADIUS_M);
        expect(Math.abs(ey)).toBeLessThan(2);
      });
    }
  }

  it("no pose on the ring draws the student past his exit to the SOUTH mouth", () => {
    for (const level of LEVELS) {
      const lesson = compileScenario(SPEC, level);
      for (const phi of PHIS) {
        const route = legFrom(lesson, phi)!;
        for (let s = 0; s < route.count; s += 1) {
          // −y past the ring is the far half of the lap: reaching it means the
          // leg carried on round instead of turning out at west.
          expect(route.pts[2 * s + 1]!).toBeGreaterThan(-4);
        }
      }
    }
  });

  it("GRADING IS UNTOUCHED — the exit is guidance-only", () => {
    // `stepRoundabout` reads enterRadiusM / exitRadiusM and the indicator, and
    // nothing else; `exit` never reaches it. Stated as the two radii the
    // objective still carries, so a future edit that moved grading onto the
    // named arm fails here rather than silently narrowing what completes.
    for (const level of LEVELS) {
      const lesson = compileScenario(SPEC, level);
      const params = lesson.objectives[lesson.objectives.length - 1]!.params;
      expect(params).toMatchObject({
        maneuver: "roundabout",
        enterRadiusM: 33,
        exitRadiusM: 46,
      });
    }
  });
});
