/**
 * A МАГИСТРАЛА IS NOT A STREET — w10-2, 2026-08-25
 * (sc-merge-motorway-exit:22f793e2).
 *
 * `builders/constants.ts` has carried the rule since gen_motorway.mjs shipped,
 * verbatim: „a motorway carries no arterial parking band, street trees,
 * streetlights or sidewalks (founder R-media #7/#8)". It enforced it by keeping
 * the string `"motorway"` out of ARTERIAL_CLASSES / SCENARIO_LIT_CLASSES /
 * PARK_CLASSES — which holds exactly as long as every motorway says so in its
 * class, and one of the three does not:
 *
 *     mw-v1        mw-e-nb, mw-e-sb                   class "motorway"  140
 *     mw-entry-v1  mwe-e-nb-approach/-accel/-main/-sb class "motorway"  140
 *     mw-exit-v1   mwx-e-nb-approach/-decel/-main/-sb class "PRIMARY"   140
 *
 * All twelve carry `motorway: true`, and `primary` is in every one of those
 * sets — so the exit district, and only the exit district, was dressed as a
 * city boulevard.
 *
 * THE FRAME: `.audit-frames/w10-2/frames/sc-merge-motorway-exit__mobile-right/
 * 05-stopped.png`. A timber utility pole with overhead catenary fills the
 * centre of the windscreen; a lamp-column row and a pedestrian parapet run down
 * the near verge; cypresses line both sides; and a continuous rank of PARKED
 * CARS stands at the kerb — beside the same frame's chip reading «140 · РЕЖИМ
 * Нормален ≤150». The filed row („a lamp post / tree trunk filling the centre
 * of the windscreen, off the carriageway on the pavement side") is that pole.
 * The parked rank is ЗДвП чл. 58, т. 2–3: the world was drawing the offence
 * `catalog.ts` prices at three months and 1000 лв. one row further down.
 *
 * MEASURED THROUGH `buildWorldGeometry(seed 7)` + `computeParkedCars`, before
 * the guard and after it — the whole of the change, on the district it moves:
 *
 *                     mw-v1        mw-entry-v1      mw-exit-v1
 *     streetlights    0 →   0        0 →   0         96 →   9
 *     utility poles   0 →   0        0 →   0         77 →   8
 *     railings        0 →   0        0 →   0        248 →  25
 *     trees         128 → 128       48 →  48        438 → 292
 *     billboards      0 →   0        0 →   0          8 →   0
 *     PARKED CARS     0 →   0        0 →   0        150 →   0   ← PARK_CAP
 *
 * The two districts that typed themselves honestly do not move by a single
 * instance; the parked rank was at the pass's own 150-body ceiling.
 *
 * WHAT THE RESIDUE IS, and it is not this guard's to take. `mwx-e-ramp` is a
 * `secondary_link` 256 m long — a real slip road, correctly dressed — and the
 * terminus closure plants its own tree row at each end of the authored world
 * (that row is a deliberate feature: it is what stops a student driving into
 * the void). mw-entry-v1's ramp is 143 m and falls under the lamp pitch, which
 * is why its column count was zero to begin with. Both are recorded as a
 * budget below rather than assumed away.
 *
 * WHAT IS DELIBERATELY NOT IN THIS CHANGE, and it is the other half of the same
 * frame: the SIDEWALK and the 4 m curbside parking BAND are carriageway
 * GEOMETRY — `edgeParkingWidthM` feeds `edgeHalfWidth`, which moves the kerb,
 * the frontage and every prop anchored off them, with four committed recordings
 * riding on this district. Furniture and parked bodies are pure instancing and
 * move nothing, so they go now; the geometry half is REPORTED, not smuggled in
 * beside them.
 */

import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PERCEPTUAL_ROAD_SCALE } from "@/modules/sim/contracts";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { edgeTravelHalfWidth, isMotorwayEdge } from "../builders/network";
import { computeParkedCars } from "../../traffic/TrafficLayer";
import type { TrafficDistrict } from "../../traffic/types";
import { assertDistrict, type District, type DistrictEdge, type WorldGeometry } from "../types";

const WORLD_DIRS = [
  path.join(process.cwd(), "content", "world"),
  path.resolve(process.cwd(), "..", "content", "world"),
];
const WORLD_DIR = WORLD_DIRS.find((d) => fs.existsSync(d))!;

function load(id: string): District {
  return assertDistrict(JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf8")));
}

/** The lane width LessonScene mounts TrafficLayer with (its own default). */
const LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;

/**
 * A MOTORWAY EDGE AS THE COMMITTED DATA DESCRIBES ONE — flag, class name, or a
 * carriageway posted at 130+ км/ч (Наредба № 38's own магистрала band). Any ONE
 * of the three is enough, on purpose.
 *
 * THIS IS NOT `isMotorwayEdge`, AND THAT IS THE WHOLE POINT — verifier pass on
 * this repair, 2026-08-25. The first cut derived the subject list below by
 * calling the predicate under test, so mutating `isMotorwayEdge` to `false`
 * did not make this file fail: it made it SHRINK, from 10 tests to 4. The six
 * per-district assertions that actually describe the defect („parks nobody at
 * the kerb", „street furniture stays inside its budget") were never created,
 * so they could not go red. A gate whose subjects are chosen by the thing it is
 * grading can be switched off by the same edit it exists to catch.
 *
 * The three descriptions agree exactly on the committed corpus — 10 edges,
 * three districts, every one of them flagged — and where they would ever
 * DISagree is itself the finding, so `isMotorwayEdge` is held to this list
 * edge-for-edge in the first assertion below rather than trusted to build it.
 */
const looksLikeMotorwayInData = (e: {
  motorway?: unknown;
  class?: unknown;
  maxspeed?: unknown;
}): boolean =>
  e.motorway === true ||
  e.class === "motorway" ||
  (typeof e.maxspeed === "number" && e.maxspeed >= 130);

/** Every committed district whose data describes at least one motorway edge. */
const MOTORWAY_DISTRICTS = fs
  .readdirSync(WORLD_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .filter((id) => {
    try {
      return (load(id).roads?.edges ?? []).some((e) => looksLikeMotorwayInData(e));
    } catch {
      return false;
    }
  })
  .sort();

/** Perpendicular miss from a district-space point to a polyline, m. */
function missTo(geo: readonly (readonly number[])[], px: number, py: number): number {
  let best = Infinity;
  for (let i = 0; i < geo.length - 1; i++) {
    const ax = geo[i][0];
    const ay = geo[i][1];
    const dx = geo[i + 1][0] - ax;
    const dy = geo[i + 1][1] - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    if (d < best) best = d;
  }
  return best;
}

/**
 * THE FURNITURE BUDGET, per motorway district, and the discipline is doc 86
 * §10's — the one `parked-on-footway.TRACE_EXEMPT` and `FOOTWAY_BUDGET` follow:
 * **an entry may only shrink, and one that reaches zero must be DELETED.** A
 * stale row fails the gate, so the list cannot quietly stop being true.
 *
 * These counts are NOT „acceptable". They are what the ramp and the terminus
 * closure place, and they go to zero when someone widens the guard to the
 * verge-overlap case (a slip road's left-hand verge lands inside the motorway
 * it is peeling away from) or gives the terminus row a motorway variant.
 */
const FURNITURE_BUDGET: Record<string, { lamps: number; poles: number; railings: number; trees: number }> = {
  "mw-v1": { lamps: 0, poles: 0, railings: 0, trees: 128 },
  "mw-entry-v1": { lamps: 0, poles: 0, railings: 0, trees: 48 },
  "mw-exit-v1": { lamps: 9, poles: 8, railings: 25, trees: 292 },
};

describe("the dressing passes never furnish a motorway", () => {
  const built = new Map<string, { district: District; world: WorldGeometry }>();

  beforeAll(() => {
    for (const id of MOTORWAY_DISTRICTS) {
      const district = load(id);
      built.set(id, { district, world: buildWorldGeometry(district, { seed: 7 }) });
    }
  });

  it("the predicate agrees with the committed data, edge for edge, in both directions", () => {
    // THE INSTRUMENT BEFORE WHAT IT MEASURES. Every prohibition below is scoped
    // by `isMotorwayEdge`, so it is graded here FIRST against a description of
    // a motorway that does not call it (`looksLikeMotorwayInData` — flag, class
    // or a 130+ км/ч posting). Mutate the predicate in any direction and this
    // row names the edges it started or stopped selecting, instead of the file
    // quietly sweeping a smaller world.
    const disagreements: string[] = [];
    let motorwayEdges = 0;
    let streetEdges = 0;
    for (const id of fs
      .readdirSync(WORLD_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))) {
      let edges: readonly DistrictEdge[];
      try {
        edges = load(id).roads?.edges ?? [];
      } catch {
        continue;
      }
      for (const e of edges) {
        const data = looksLikeMotorwayInData(e);
        if (data) motorwayEdges += 1;
        else streetEdges += 1;
        if (isMotorwayEdge(e) !== data) {
          disagreements.push(`${id} ${e.id}: predicate=${isMotorwayEdge(e)} data=${data}`);
        }
      }
    }
    expect(disagreements).toEqual([]);
    // …and it saw a real corpus in both classes, so „agrees" is not „agrees
    // about nothing".
    expect(motorwayEdges).toBe(10);
    expect(streetEdges).toBeGreaterThan(500);
  });

  it("finds the motorway districts, and the class disagreement that made this a class", () => {
    // Named, not counted: the disagreement between the three IS the finding. A
    // generator that re-types mw-exit-v1 as `motorway` closes the frame too —
    // and this row then says so out loud instead of going quietly vacuous.
    expect(MOTORWAY_DISTRICTS).toEqual(["mw-entry-v1", "mw-exit-v1", "mw-v1"]);
    const classesOf = (id: string) =>
      new Set(
        load(id)
          .roads.edges.filter((e) => looksLikeMotorwayInData(e))
          .map((e) => e.class),
      );
    expect([...classesOf("mw-v1")]).toEqual(["motorway"]);
    expect([...classesOf("mw-entry-v1")]).toEqual(["motorway"]);
    // The one that walks past every class set:
    expect([...classesOf("mw-exit-v1")]).toEqual(["primary"]);
  });

  for (const id of MOTORWAY_DISTRICTS) {
    it(`${id}: parks nobody at the kerb (ЗДвП чл. 58, т. 2–3)`, () => {
      // The unambiguous half, and the one the founder would see first: the row
      // of 150 cars was standing along a live 140 км/ч carriageway. This is a
      // ZERO, not a budget — the parked pass now asks the flag directly, so
      // there is no ramp or terminus case to leak through it.
      const { district } = built.get(id)!;
      // Selected by the DATA, not by the predicate the guard uses — same reason
      // as the subject list: a mutated `isMotorwayEdge` must make this row find
      // parked cars on a carriageway, not find no carriageway to look at.
      const motorways = district.roads.edges.filter(
        (e) => looksLikeMotorwayInData(e) && e.geometry && e.geometry.length >= 2,
      );
      expect(motorways.length).toBeGreaterThan(0);
      const bodies = computeParkedCars(district as unknown as TrafficDistrict, LANE_W);
      const onMotorway = bodies.filter((b) =>
        motorways.some(
          (e) => missTo(e.geometry, b.x, b.y) <= edgeTravelHalfWidth(e as DistrictEdge) + 8,
        ),
      );
      expect(
        onMotorway.map((b) => `parked body at (${b.x.toFixed(1)}, ${b.y.toFixed(1)})`),
      ).toEqual([]);
    });

    it(`${id}: street furniture stays inside its budget`, () => {
      const { world } = built.get(id)!;
      const budget = FURNITURE_BUDGET[id];
      expect(budget, `${id} has no budget row — add one, or delete the district`).toBeDefined();
      const got = {
        lamps: world.streetlights.length,
        poles: world.utilityPoles.length,
        railings: world.railings.length,
        trees: world.trees.length,
      };
      for (const k of ["lamps", "poles", "railings", "trees"] as const) {
        expect(got[k], `${id}.${k}`).toBeLessThanOrEqual(budget[k]);
      }
      // …and NO billboard, ever: the billboard pass is `class === "primary"`
      // alone, so mw-exit-v1's eight were the whole population and the guard
      // took all of them. A budget here would only hide a regression.
      expect(world.billboards.length).toBe(0);
      expect(world.busStops.length).toBe(0);
    });
  }

  it("mw-exit-v1 stops being the outlier of its own family", () => {
    // THE FINDING IN ONE ASSERTION. Three districts, one road, one generator
    // family — and before the guard the exit carried 96 lamp columns, 77
    // utility poles, 248 parapet panels, 8 billboards and 150 parked cars that
    // its entry twin did not. What is left is the RAMP (256 m of
    // `secondary_link` against the entry's 143 m, which falls under the lamp
    // pitch) and the terminus tree row, so the residue is bounded by a small
    // multiple rather than by zero.
    const lamps = (id: string) => built.get(id)!.world.streetlights.length;
    const railings = (id: string) => built.get(id)!.world.railings.length;
    expect(lamps("mw-exit-v1")).toBeLessThan(20);
    expect(railings("mw-exit-v1")).toBeLessThan(40);
  });

  it("still dresses the streets that are NOT motorways — the guard is not a switch-off", () => {
    // NON-VACUITY, and it is the half that makes every prohibition above mean
    // something: a guard that emptied the passes would satisfy all of them.
    // `sp-creep-v1` is the street b65-street-furniture.test.ts was written on.
    const world = buildWorldGeometry(load("sp-creep-v1"), { seed: 7 });
    expect(world.streetlights.length).toBeGreaterThanOrEqual(8);
    expect(world.utilityPoles.length).toBeGreaterThanOrEqual(6);
    expect(world.railings.length).toBeGreaterThanOrEqual(10);
    expect(computeParkedCars(load("d2-v1") as unknown as TrafficDistrict, LANE_W).length).toBeGreaterThan(0);
  });

  it("the guard is EDGE-scoped, not district-scoped — the slip road is still a street", () => {
    // Stated as a positive fact rather than inferred from the residue: a
    // motorway district's ramp is not a motorway edge, so it keeps every pass.
    const entry = load("mw-entry-v1");
    const ramp = entry.roads.edges.find((e) => e.id === "mwe-e-ramp")!;
    expect(isMotorwayEdge(ramp)).toBe(false);
    expect(ramp.class).toBe("secondary_link");
  });
});
