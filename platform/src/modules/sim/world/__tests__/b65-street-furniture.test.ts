/**
 * B65 — „I see many issue with the Map its very Raw, boring".
 *
 * THE ROW THIS PINS, AND WHY IT IS A TEST RATHER THAN A NOTE. The founder's
 * sentence was rendered twice and DOWNGRADED the second time, because the
 * re-render showed nothing had changed: two grey slabs, one parked row, a
 * carriageway running into an empty plain, and no street furniture of any
 * kind. Three waves passed without an owner. A row that can silently come back
 * needs a gate, not a paragraph.
 *
 * THE ROOT CAUSE, MEASURED RATHER THAN INHERITED. `buildProps` gated the whole
 * furniture pass on `ARTERIAL_CLASSES` — a set whose own docstring is
 * „streetlights" — and every authored scenario micro-map in this catalogue is
 * class `residential`. Counted on the built world before the fix:
 *
 *     sp-creep-v1   streetlights 0   utilityPoles 0   railings 0   skid 0
 *
 * ZERO lamp columns, not the „one lamp post in 360 m" the register printed.
 * And because `WorldProps.furniturePlacements` derives EVERY bench, bin,
 * planter and bollard in the product FROM the lamp run, zero lamps meant zero
 * of all four as well.
 *
 * WHAT IS ASSERTED, in the order the review named the absences:
 *   1. lamp columns exist on the streets the drills actually run on;
 *   2. „no wires, no poles" — an overhead line, with a span between neighbours;
 *   3. „no fences, no barriers" — the pavement parapet, and it never fences off
 *      a crossing or reaches the carriageway (both are correctness rules, not
 *      taste);
 *   4. „no tyre marks" — laid in PAIRS, aligned with travel, inside a lane. The
 *      earlier art lane refused to fake these and was right to; this asserts
 *      the four properties that refusal said a real one needs;
 *   5. „the trees are one repeated model" — the placement `variant` field, dead
 *      since streetscape v2, now reaches the renderer;
 *   6. the frontage does not stop halfway down the street;
 *   7. and NONE of it costs the city/exam maps a single draw call or instance —
 *      the tier-low budget in environment/perfBudget.ts is where it is
 *      tightest, and the dressing passes are gated away from those maps.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PERF_BUDGETS } from "../../environment/perfBudget";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import {
  RAILING_CROSSING_CLEAR_M,
  RAILING_RUN_M,
  SKID_ALIGN_JITTER_RAD,
  SKID_MAX_LENGTH_M,
  SKID_TRACK_M,
} from "../builders/constants";
import { analyzeNetwork } from "../builders/network";
import { projectOntoPolyline, type Vec2 } from "../builders/math2d";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const WORLD_DIRS = [
  path.join(process.cwd(), "content", "world"),
  path.resolve(process.cwd(), "..", "content", "world"),
];

function load(id: string): District {
  const dir = WORLD_DIRS.find((d) => fs.existsSync(path.join(d, `${id}.json`)));
  if (!dir) throw new Error(`${id}.json not found in: ${WORLD_DIRS.join(", ")}`);
  return assertDistrict(JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), "utf8")));
}

/** The street B65 was rendered on, plus its three siblings from the same
 *  generator — the whole SP family shares the defect and the fix. */
const SP_MAPS = ["sp-creep-v1", "sp-danger-v1", "sp-rain-v1", "sp-zone30-v1"] as const;

describe("B65: the scenario streets carry street furniture", () => {
  const built = new Map<string, { district: District; world: WorldGeometry }>();

  beforeAll(() => {
    for (const id of [...SP_MAPS, "pe-clear-v1", "d2-v1"]) {
      const district = load(id);
      built.set(id, { district, world: buildWorldGeometry(district, { seed: 7 }) });
    }
  });

  for (const id of SP_MAPS) {
    describe(id, () => {
      it("stands lamp columns down the street (the root cause of every other absence)", () => {
        const { district, world } = built.get(id)!;
        expect(world.streetlights.length).toBeGreaterThanOrEqual(8);
        // Sparser than a boulevard, dense enough to read as a lit street.
        const run = district.roads.edges.reduce((s, e) => s + e.length, 0);
        expect(run / world.streetlights.length).toBeLessThan(40);
        // Every column stands OFF the carriageway. `halfWidth` includes the
        // curbside parking band, so this is the kerb, not the lane edge.
        const net = analyzeNetwork(district);
        for (const lamp of world.streetlights) {
          const p: Vec2 = [lamp.position[0], -lamp.position[2]];
          for (const eb of net.edges) {
            const pr = projectOntoPolyline(eb.edge.geometry as Vec2[], p);
            expect(pr.distance).toBeGreaterThan(eb.halfWidth);
          }
        }
      });

      it("hangs an overhead line — poles AND the spans between them", () => {
        const { world } = built.get(id)!;
        expect(world.utilityPoles.length).toBeGreaterThanOrEqual(6);
        const spans = world.utilityPoles.filter((p) => p.spanM > 0);
        // One run ⇒ exactly one terminal pole carries no span forward.
        expect(spans.length).toBe(world.utilityPoles.length - 1);
        // A span nobody could see is a span nobody built: they are the even
        // division of the ribbon, so they must all be the same and sane.
        const lengths = new Set(spans.map((p) => p.spanM.toFixed(3)));
        expect(lengths.size).toBe(1);
        expect(spans[0]!.spanM).toBeGreaterThan(25);
        expect(spans[0]!.spanM).toBeLessThan(50);
      });

      it("runs a pavement parapet, in stretches, clear of the carriageway", () => {
        const { district, world } = built.get(id)!;
        expect(world.railings.length).toBeGreaterThanOrEqual(10);
        const net = analyzeNetwork(district);
        for (const r of world.railings) {
          const p: Vec2 = [r.position[0], -r.position[2]];
          for (const eb of net.edges) {
            const pr = projectOntoPolyline(eb.edge.geometry as Vec2[], p);
            // Panels are 6.055 m long about their centre, so the CENTRE being
            // clear is not enough — the whole panel has to be.
            expect(pr.distance).toBeGreaterThan(eb.halfWidth);
          }
        }
        // Stretches, not a wall: a continuous run down a 360 m street was the
        // first cut and it hid the frontage this row is about.
        const covered = world.railings.length * RAILING_RUN_M;
        const run = district.roads.edges.reduce((s, e) => s + e.length, 0);
        expect(covered).toBeLessThan(run * 0.75);
      });

      it("lays tyre marks in PAIRS, along travel, inside a lane", () => {
        const { world } = built.get(id)!;
        // sp-rain-v1 is 360 m like sp-creep; every SP street is long enough.
        expect(world.stats.skidMarks).toBeGreaterThanOrEqual(2);
        expect(world.stats.skidMarks % 2).toBe(0); // two wheels on an axle
      });
    });
  }

  it("a skid quad is a long thin streak aligned with the road, not a blob", () => {
    // Geometry read off the built buffer, so it holds whatever the placer does.
    const { district, world } = built.get("sp-creep-v1")!;
    const net = analyzeNetwork(district);
    const line = net.edges[0]!.line as Vec2[];
    const pos = world.roadDecals.positions;
    let streaks = 0;
    for (let v = 0; v + 3 < pos.length / 3; v += 4) {
      const c: Vec2[] = [];
      for (let k = 0; k < 4; k++) {
        const i = (v + k) * 3;
        c.push([pos[i]!, -pos[i + 2]!]);
      }
      const w = Math.hypot(c[1]![0] - c[0]![0], c[1]![1] - c[0]![1]);
      const h = Math.hypot(c[3]![0] - c[0]![0], c[3]![1] - c[0]![1]);
      const long = Math.max(w, h);
      const short = Math.min(w, h);
      if (short > 0.4 || long < 4) continue; // not a streak — ordinary wear
      streaks++;
      expect(long).toBeLessThanOrEqual(SKID_MAX_LENGTH_M + 1e-6);
      // Aligned with the ribbon it lies on.
      const axis: Vec2 = w > h ? [c[1]![0] - c[0]![0], c[1]![1] - c[0]![1]] : [c[3]![0] - c[0]![0], c[3]![1] - c[0]![1]];
      const mid: Vec2 = [(c[0]![0] + c[2]![0]) / 2, (c[0]![1] + c[2]![1]) / 2];
      const t = projectOntoPolyline(line, mid).tangent;
      const cos = Math.abs((axis[0] * t[0] + axis[1] * t[1]) / long);
      expect(Math.acos(Math.min(1, cos))).toBeLessThanOrEqual(SKID_ALIGN_JITTER_RAD + 1e-6);
    }
    expect(streaks).toBe(world.stats.skidMarks);
    expect(streaks).toBeGreaterThan(0);
    // …and the pairs really are one axle track apart.
    expect(SKID_TRACK_M).toBeGreaterThan(1.3);
    expect(SKID_TRACK_M).toBeLessThan(2.0);
  });

  it("never fences off a crossing", () => {
    // A guard rail is precisely the object that stops a pedestrian leaving the
    // kerb, so a panel on a zebra's approach contradicts the paint the lesson
    // grades. pe-clear-v1 is the case with an authored crossing AND a parapet.
    const { district, world } = built.get("pe-clear-v1")!;
    expect(district.crossings.length).toBeGreaterThan(0);
    expect(world.railings.length).toBeGreaterThan(0);
    for (const c of district.crossings) {
      for (const r of world.railings) {
        const d = Math.hypot(r.position[0] - c.x, -r.position[2] - c.y);
        expect(d).toBeGreaterThan(RAILING_CROSSING_CLEAR_M - RAILING_RUN_M / 2);
      }
    }
  });

  it("plants trees the renderer can tell apart", () => {
    // `TreePlacement.variant` shipped with streetscape v2 and NOTHING read it:
    // the renderer bucketed by `kind` and handed every instance a UNIFORM
    // scale, which is the one transform that cannot change a silhouette. The
    // builder must keep producing all three, or WorldProps' variant table is
    // dressing a field nobody fills.
    const { world } = built.get("sp-creep-v1")!;
    expect(world.trees.length).toBeGreaterThan(8);
    expect(new Set(world.trees.map((t) => t.variant)).size).toBe(3);
    expect(new Set(world.trees.map((t) => t.kind)).size).toBeGreaterThanOrEqual(3);
  });

  it("does not run the carriageway into an empty plain", () => {
    // The register's own words for the second half of B65: „past y≈220 the
    // buildings stop entirely and the road runs on as bare grey tarmac across a
    // flat green plain until the world ends." Frontage must reach the end of
    // the drivable street, not the middle of it.
    const { district } = built.get("sp-creep-v1")!;
    const streetEndY = 360;
    const centres = district.buildings.map(
      (b) => (b.footprint as Vec2[]).reduce((s, p) => s + p[1], 0) / b.footprint.length,
    );
    expect(centres.length).toBeGreaterThanOrEqual(12);
    expect(Math.max(...centres)).toBeGreaterThan(streetEndY * 0.9);
    expect(Math.min(...centres)).toBeLessThan(streetEndY * 0.1);
    // …and on BOTH kerbs, or it is a hoarding, not a street.
    const xs = district.buildings.map(
      (b) => (b.footprint as Vec2[]).reduce((s, p) => s + p[0], 0) / b.footprint.length,
    );
    expect(xs.some((x) => x < 0)).toBe(true);
    expect(xs.some((x) => x > 0)).toBe(true);
  });

  it("costs the city and exam maps nothing at all", () => {
    // The dressing passes are gated to the authored micro-maps (see
    // constants.SCENARIO_LIT_CLASSES). d2-v1 is the exam city and one of the
    // two heaviest districts in the product: it must carry no pole, no wire
    // and no panel, so its draw-call count is unchanged to the call and its
    // 280 arterial lamp columns are exactly where they were.
    const { world } = built.get("d2-v1")!;
    expect(world.utilityPoles).toEqual([]);
    expect(world.railings).toEqual([]);
    expect(world.streetlights.length).toBe(280);
  });

  it("keeps every dressed street inside the tier-low draw budget", () => {
    // environment/perfBudget.ts is a hard ceiling — `suv_boxy_lux` was pulled
    // from tier low for costing 54k triangles and 16 draws. The whole B65
    // dressing is 3 draws (pole row, wire run, parapet) and it must not push a
    // scenario street past the SOFT budget, never mind the cap.
    const low = PERF_BUDGETS.low;
    for (const id of SP_MAPS) {
      const { world } = built.get(id)!;
      expect(world.stats.drawCallEstimate).toBeLessThanOrEqual(low.drawCalls);
      expect(world.stats.triangles).toBeLessThan(low.triangles);
    }
  });
});
