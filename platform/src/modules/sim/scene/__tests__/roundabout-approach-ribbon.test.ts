/**
 * THE GREEN LINE MAY NOT END POINTING AT THE ISLAND.
 *
 * THE FINDING (sweep-161, `sc-roundabout-entry`, pc-right, critical
 * 4ab693eb): „The car ends up driving on the central island. The whole
 * windscreen is grass and a hedge at point-blank range while the coach calmly
 * says to leave the roundabout with the right indicator. This is what earns the
 * careful drive its −10 collision." The harness field on the row says where it
 * came from in one clause: „route ended on the island".
 *
 * MEASURED at HEAD before the repair, through the shipped path
 * (`guidanceGoalFor` → `deriveGuidanceRoute`, the same two calls
 * `components/sim/RouteGuidance.tsx` makes): the leg for `sc-rb-ring` — the
 * objective titled «Премини през кръговото и излез с десен мигач» — was 18.5 m
 * of dead-straight arm from (0, −36.5) to (0, −18) at EVERY rung. It is the
 * only thing on the asphalt for the whole maneuver, because `RouteGuidance`
 * rebuilds the ribbon on objective change and never per frame. So at the
 * give-way line the student is shown a straight teal line that stops on the
 * ring's kerb, aimed at the centre of the island, and the ring itself is not
 * drawn at all. Follow it and you are in the planting.
 *
 * THE CAUSE was in `ringRouteRaw`'s cut (b) — „the next MOUTH". That rule was
 * written for a car already circulating, where the next mouth genuinely is the
 * next decision. For a car OUTSIDE the ring the first mouth on the leg is its
 * OWN entry: not a decision point but the place the maneuver begins. Cutting
 * there deleted the maneuver from the ribbon. RING_ENTRY_MOUTH skips it, and
 * RING_APPROACH_CARRY gives it something to skip to — the shortest path stops
 * the instant it touches the ring, so the leg is carried on round by the same
 * `walkAheadRaw` the inside branch already uses.
 *
 * WHAT IS ASSERTED, and why it is a shape rather than a number:
 *
 *  1. NO LEG ENDS POINTING AT THE ISLAND, on every roundabout objective of
 *     every rung there is. Stated as arithmetic that carries its own scale:
 *     step `PROBE_M` along the leg's final heading and you must not be CLOSER
 *     to the island centre than the leg's own end. A tangent to a circle can
 *     only take you outward; only a radial aim can take you in. Before the
 *     repair `sc-roundabout-entry` failed this by the full step length.
 *  2. `sc-roundabout-entry` in particular reaches the RING and rides it. The
 *     ribbon must actually get onto the circle and turn — an approach that
 *     merely stopped short would satisfy (1) trivially.
 *  3. NOTHING IS DRAWN INSIDE THE ISLAND: every sample stands at least at the
 *     inner kerb, derived from the district's own ring radius and lane width,
 *     never a literal.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  SCENARIO_TEMPLATES,
  compileScenario,
  parseObjectiveParams,
  type LessonSpec,
} from "@/modules/sim/lessons";
import { parseDistrict } from "@/modules/sim/runtime";
import { LANE_WIDTH_M } from "@/modules/sim/world";
import {
  buildRouteGraph,
  deriveGuidanceRoute,
  guidanceGoalFor,
  stopLinesForGuidance,
  type DerivedRoute,
  type RouteTarget,
} from "../guidanceRoute";

const WORLD_DIR = path.join(process.cwd(), "..", "content", "world");

/**
 * How far ahead of the leg's end the aim is tested. A car that has just been
 * handed a ribbon is doing the ring's own 30 км/ч ≈ 8.3 m/s, so this is about
 * a second and a half — long enough that a radial aim is unmistakable, short
 * enough that it is still the same intention.
 */
const PROBE_M = 12;
/**
 * The final heading is averaged over this much of the tail rather than read
 * off the last pair: `finalizeRoute` densifies to 2.5 m and smooths, so one
 * segment is a sample of the smoothing, not of the direction.
 */
const TAIL_M = 5;
/** Smoothing wobble on the tail. Anything past this is an aim, not a jitter. */
const AIM_TOL_M = 0.25;
/**
 * Half a drawn lane, from the world builder's own constant rather than a
 * figure typed here. A roundabout's asphalt is swept at the ring edge's
 * `edgeTravelHalfWidth`, so on the one-lane rings this product ships the inner
 * kerb — where the planting and the collider wall begin — stands one half-lane
 * inside the drawn centreline.
 */
const LANE_HALF_WIDTH_M = LANE_WIDTH_M / 2;

interface Case {
  label: string;
  route: DerivedRoute;
  cx: number;
  cy: number;
  /** The ring's drawn centreline radius, from the district file. */
  ringR: number;
}

function tail(route: DerivedRoute): { x: number; y: number; dx: number; dy: number } {
  const n = route.count;
  const ex = route.pts[(n - 1) * 2]!;
  const ey = route.pts[(n - 1) * 2 + 1]!;
  let k = n - 1;
  while (k > 0 && route.arc[n - 1]! - route.arc[k]! < TAIL_M) k--;
  const dx = ex - route.pts[k * 2]!;
  const dy = ey - route.pts[k * 2 + 1]!;
  const len = Math.hypot(dx, dy);
  return len > 1e-6
    ? { x: ex, y: ey, dx: dx / len, dy: dy / len }
    : { x: ex, y: ey, dx: 0, dy: 0 };
}

const cases: Case[] = [];
const missing: string[] = [];

for (const spec of SCENARIO_TEMPLATES) {
  for (const rung of spec.levels ?? [{ level: 1 }]) {
    let lesson: LessonSpec;
    try {
      lesson = compileScenario(spec, rung.level);
    } catch {
      continue;
    }
    const districtId = lesson.world?.districtId;
    if (!districtId) continue;
    const file = path.join(WORLD_DIR, `${districtId}.json`);
    if (!fs.existsSync(file)) continue;
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      spawnPoints?: { id: string; x: number; y: number; heading?: number }[];
      roundabouts?: { x: number; y: number; radius: number }[];
    };
    const district = parseDistrict(raw);
    const graph = buildRouteGraph(district as never);
    const stopLines = stopLinesForGuidance(district);
    const spawn = (raw.spawnPoints ?? []).find((s) => s.id === lesson.spawn.pointId);
    let from = spawn
      ? { x: spawn.x, y: spawn.y, headingDeg: spawn.heading ?? 0 }
      : { x: 0, y: 0, headingDeg: 0 };
    for (let i = 0; i < lesson.objectives.length; i++) {
      let params;
      try {
        params = parseObjectiveParams(lesson.objectives[i]!);
      } catch {
        continue;
      }
      const goal = guidanceGoalFor(lesson, i, { stopLines, from });
      if (params.kind === "completeManeuver" && params.maneuver === "roundabout") {
        const label = `${spec.id}@L${rung.level} ${lesson.objectives[i]!.id}`;
        const target: RouteTarget | null =
          goal === null
            ? null
            : goal.kind === "point"
              ? {
                  kind: "point",
                  x: goal.x,
                  y: goal.y,
                  shape: goal.shape,
                  ...(goal.leaveRadiusM !== undefined
                    ? { leaveRadiusM: goal.leaveRadiusM }
                    : {}),
                }
              : { kind: "ahead", meters: goal.meters };
        const route = deriveGuidanceRoute(graph, from, target);
        if (!route) {
          missing.push(label);
        } else {
          // The ring this objective is about — the district's own record of it,
          // matched by the island the objective names.
          let ringR = params.enterRadiusM;
          for (const rb of raw.roundabouts ?? []) {
            if (Math.hypot(rb.x - params.x, rb.y - params.y) < 1) ringR = rb.radius;
          }
          cases.push({ label, route, cx: params.x, cy: params.y, ringR });
        }
      }
      if (goal && goal.kind === "point") from = { x: goal.x, y: goal.y, headingDeg: from.headingDeg };
    }
  }
}

describe("the roundabout ribbon", () => {
  it("is derived on every rung of every roundabout drill", () => {
    expect(missing).toEqual([]);
    expect(cases.length).toBeGreaterThanOrEqual(28);
    expect(cases.map((c) => c.label.split("@")[0]!)).toContain("sc-roundabout-entry");
  });

  it("never ends aimed at the central island", () => {
    const aimed: string[] = [];
    for (const c of cases) {
      const t = tail(c.route);
      const rEnd = Math.hypot(t.x - c.cx, t.y - c.cy);
      const rAhead = Math.hypot(t.x + t.dx * PROBE_M - c.cx, t.y + t.dy * PROBE_M - c.cy);
      if (rAhead < rEnd - AIM_TOL_M) {
        aimed.push(
          `${c.label}: the leg ends at r=${rEnd.toFixed(1)} m and its own heading is ` +
            `${PROBE_M} m later at r=${rAhead.toFixed(1)} m — it points INTO the island`,
        );
      }
    }
    expect(aimed).toEqual([]);
  });

  it("draws nothing inside the island", () => {
    // The circulatory carriageway is the ring centreline ± half a drawn lane;
    // inside that is kerb, planting and the wall the collider builds. No
    // guidance sample may stand there.
    const inside: string[] = [];
    for (const c of cases) {
      const innerKerbR = c.ringR - LANE_HALF_WIDTH_M;
      for (let k = 0; k < c.route.count; k++) {
        const r = Math.hypot(
          c.route.pts[k * 2]! - c.cx,
          c.route.pts[k * 2 + 1]! - c.cy,
        );
        if (r < innerKerbR - 1e-6) {
          inside.push(`${c.label}: sample ${k} at r=${r.toFixed(2)} m, kerb at ${innerKerbR}`);
          break;
        }
      }
    }
    expect(inside).toEqual([]);
  });

  it("sc-roundabout-entry rides the ring instead of stopping on its own mouth", () => {
    // The row's own geometry. The south arm meets rb-mini-v1's ring at
    // (0, −18); the leg used to be the arm and stop there, so the maneuver the
    // objective is named for was not drawn at all.
    const entry = cases.filter((c) => c.label.startsWith("sc-roundabout-entry@"));
    expect(entry.length).toBe(5); // one per authored rung
    for (const c of entry) {
      const n = c.route.count;
      const ex = c.route.pts[(n - 1) * 2]!;
      const ey = c.route.pts[(n - 1) * 2 + 1]!;
      // It leaves the south mouth behind…
      expect(Math.hypot(ex - 0, ey - -18), `${c.label} still ends on its own mouth`)
        .toBeGreaterThan(20);
      // …ends on the ring…
      expect(Math.hypot(ex - c.cx, ey - c.cy)).toBeCloseTo(c.ringR, 1);
      // …and RIDES it rather than pointing across it. Measured as the
      // arclength the leg spends standing on the circulatory centreline: a
      // straight line from the mouth touches that circle at one point, an
      // entry that circulates stays on it for most of a quadrant.
      let onRing = 0;
      for (let k = 1; k < c.route.count; k++) {
        const r0 = Math.hypot(c.route.pts[(k - 1) * 2]! - c.cx, c.route.pts[(k - 1) * 2 + 1]! - c.cy);
        const r1 = Math.hypot(c.route.pts[k * 2]! - c.cx, c.route.pts[k * 2 + 1]! - c.cy);
        if (Math.abs(r0 - c.ringR) <= 0.5 && Math.abs(r1 - c.ringR) <= 0.5) {
          onRing += c.route.arc[k]! - c.route.arc[k - 1]!;
        }
      }
      expect(onRing, `${c.label} touches the ring but never rides it`).toBeGreaterThan(20);
    }
  });
});
