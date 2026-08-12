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
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { buildBuildings } from "../builders/buildings";
import { buildBuildingInstances } from "../builders/cityBuildings";
import {
  countStaticDrawSlots,
  staticDrawSlotInputFromWorld as staticSlotInputFor,
} from "../builders/drawSlots";
import {
  LANE_WIDTH_M,
  RAILING_CROSSING_CLEAR_M,
  RAILING_RUN_M,
  SKID_ALIGN_JITTER_RAD,
  SKID_MAX_LENGTH_M,
  SKID_TRACK_M,
  TERMINUS_CLOSE_ROAD_CLEAR_M,
  TERMINUS_TREE_NEAR_M,
  TERMINUS_TREE_ROW_PITCH_M,
} from "../builders/constants";
import { buildTerminusClosure, terminusEnds } from "../builders/terminus";
import { analyzeNetwork } from "../builders/network";
import { projectOntoPolyline, type Vec2 } from "../builders/math2d";
import { assertDistrict, TREE_KINDS, type District, type WorldGeometry } from "../types";

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

  it("adds exactly three static mesh slots to a dressed street — and does NOT claim that fits the frame budget", () => {
    // THIS TEST USED TO BE CALLED „keeps every dressed street inside the
    // tier-low draw budget" AND IT WAS A LIE, in the precise way this codebase
    // keeps producing: the title stated a frame property, the body compared
    // `stats.drawCallEstimate` (a STATIC count of world mesh slots) to
    // `PERF_BUDGETS.low.drawCalls` (a PER-FRAME budget), and it passed. It
    // passed on every district in the product while the running product drew
    // 146–252 calls per frame at tier low — 2.1× to 3.6× that budget. The
    // static number is 26–41 % of the frame; nothing about it can bound the
    // frame.
    //
    // What B65 can honestly be held to is what B65 adds: three mesh slots
    // (pole row, wire run, parapet), each mounted only where its list is
    // non-empty. That is checked here. The frame question is checked in
    // environment/frameCost.test.ts, against frames that were counted.
    for (const id of SP_MAPS) {
      const { world } = built.get(id)!;
      const dressing =
        (world.utilityPoles.length > 0 ? 2 : 0) + (world.railings.length > 0 ? 1 : 0);
      const undressed = countStaticDrawSlots({
        ...staticSlotInputFor(world),
        utilityPoles: [],
        railings: [],
      });
      expect(countStaticDrawSlots(staticSlotInputFor(world)) - undressed, id).toBe(dressing);
      expect(dressing, id).toBe(3);
    }
  });
});

/**
 * THE STREET END — the half of B65 the furniture pass above did not answer.
 *
 * THIS BLOCK ONCE CARRIED THIS NAME AND DID NOT EARN IT, which is the more
 * useful half of the row. It passed 33/33 while its two assertions were that a
 * tree band „SPANS the view" and „leaves the road's own continuation clear" —
 * and the second one is precisely what held the hole open. A test that counts
 * trees in world space cannot answer „does this look like a road that goes
 * somewhere", and it must not be named as though it did. The tree assertions
 * below are now named for what they measure (the FLANKS), and the question the
 * title asks is answered by its own block, geometrically, further down.
 *
 * WHAT WAS PHOTOGRAPHED, and from where. `sc-sp-harsh-brake` on `sp-creep-v1`,
 * seat at `x = 4.06` (the right lane centre, LANE_WIDTH_M / 2), 60 m short of
 * the road end at y = 360 — inside the last seconds of the graded drive. Tier
 * low, canvas 1264 × 620, dpr 1.
 *
 *   BEFORE the treeline: the tarmac stops at a hard edge and an empty olive
 *   plain runs to a haze band and distant hills.
 *   AFTER the treeline, MEASURED rather than admired: the band is 21 trees
 *   spanning x −27.8..28.3 at y 367..398 and the nearest trunk either side of
 *   the centreline is x −0.91 / +5.92 — a 6.8 m hole on the road's own axis,
 *   ≈5.3° from the seat, ≈90 px of open plain in the middle of the frame. The
 *   flanks were planted; the axis was not, and could not be: TERMINUS_TREE's
 *   row-0 corridor exists so a thing standing at the end node stays visible.
 *   AFTER the closure (builders/terminus.ts): a stepped pair of building
 *   volumes stands across the axis 18 m past the last asphalt. Re-shot at the
 *   same station on the same canvas: the plain, the haze band and the hills are
 *   gone from the middle of the windscreen and the street runs into built form.
 *
 * WHAT IT COST, on the running product, both instruments, same station, same
 * approach window, with the parallel instancing work pinned by file hash across
 * the pair (tier low, `/dev/drive-rig`, 22 one-second windows each):
 *
 *                       PerfProbe draws   raw GL draws   PerfProbe triangles
 *   before                    161             139              195,225
 *   after                     162             139              191,829
 *
 * Draw calls: unchanged. The raw counter — which sees every submission,
 * including the ones gl.info never attributes — reads 139 on both sides, and
 * that is the number to trust; the +1 on the probe median is one frustum's
 * worth of noise between two stations 8 cm apart. It is unchanged BY
 * CONSTRUCTION, not by luck: the closure is built into the four facade-wall
 * meshes and the roof mesh that every district already mounts, so there is no
 * new mesh, no new material and no new instanced kind to submit.
 * Triangles: DOWN 3,396. The closure adds 104 static triangles on this map and
 * its footprints cull 17 terminus trees at a measured 378 triangles each.
 */
describe("B65: the street does not end at a cut edge", () => {
  const built = new Map<string, { district: District; world: WorldGeometry }>();
  const SEED = 7;

  beforeAll(() => {
    for (const id of [...SP_MAPS, "d2-v1", "district-v1", "poligon-v1"]) {
      const district = load(id);
      built.set(id, { district, world: buildWorldGeometry(district, { seed: SEED }) });
    }
  });

  /** Trees beyond the far end of the street — the vista the drive finishes in. */
  function terminusTrees(id: string, endY: number) {
    const { world } = built.get(id)!;
    // Placements are world space: district (x, y) -> three (x, -y).
    return world.trees.filter((t) => -t.position[2] > endY);
  }

  for (const id of SP_MAPS) {
    const endY = id === "sp-danger-v1" ? 400 : 360;

    it(`${id}: the FLANKS of the street end are planted, and the band is wide and deep`, () => {
      // WHAT THIS MEASURES, exactly: the extent of a set of trunk positions in
      // world metres. It does NOT measure what the windscreen shows — the band
      // it describes here passed every one of these numbers while leaving a
      // 6.8 m hole on the centreline. The axis has its own block below.
      const band = terminusTrees(id, endY);
      // A band, not a token. Below ~12 the first cut read as isolated lollipops
      // standing on a plain — measured by eye on the frame, then by count here.
      expect(band.length).toBeGreaterThanOrEqual(12);
      // Planted on BOTH flanks, and wider than the drawn carriageway.
      const xs = band.map((t) => t.position[0]);
      expect(xs.some((x) => x < 0)).toBe(true);
      expect(xs.some((x) => x > 0)).toBe(true);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(30);
      // Depth, so it reads as a mass and not as a hedge with a plain behind it.
      const ys = band.map((t) => -t.position[2]);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(12);
    });

    it(`${id}: plants nothing on the carriageway, and the nearest row keeps its corridor OPEN`, () => {
      const { district, world } = built.get(id)!;
      const edge = district.roads.edges[0]!;
      const half = (edge.lanes / 2) * LANE_WIDTH_M;
      for (const t of world.trees) {
        const x = t.position[0];
        const y = -t.position[2];
        // On the street itself (0 <= y <= endY) nothing may stand within the
        // carriageway + its pavement.
        if (y >= 0 && y <= endY) {
          expect(Math.abs(x)).toBeGreaterThan(half);
        }
      }
      // …AND THE COST OF THAT RULE, named. Row 0 is deliberately absent from
      // the corridor so a thing standing at the end node stays visible from the
      // seat — which is exactly why the axis stayed open, and why closing it
      // could never be another row of trees. This assertion is the corridor,
      // not the vista. The cut is half a row pitch past row 0's own station,
      // which separates row 0 (8 m ± 3.6 m of jitter, so ≤ 371.6 on a 360 m
      // street) from row 1 (17 m ± 3.6, so ≥ 373.4) with no overlap.
      const nearBand = world.trees.filter((t) => {
        const y = -t.position[2];
        return y > endY && y < endY + TERMINUS_TREE_NEAR_M + TERMINUS_TREE_ROW_PITCH_M / 2;
      });
      for (const t of nearBand) expect(Math.abs(t.position[0])).toBeGreaterThan(half);
    });
  }

  // -- THE AXIS ---------------------------------------------------------------
  //
  // The question the block's title asks, asked in the geometry the driver is
  // actually looking at rather than in tree counts: stand at the seat, look
  // down the road's own continuation, and see whether anything is there.

  /** Eye height at the wheel, m — the cockpit camera, not a man standing. */
  const EYE_H_M = 1.2;
  /** The station the frame was shot from: 60 m short of the end node. */
  const EYE_BACK_M = 60;
  /**
   * Half the fan swept, degrees. The hole the treeline left measured 5.3° at
   * this station, so ±6° covers it with room; it is also about the middle
   * sixth of a ~76° windscreen, i.e. the part of the view the driver is looking
   * THROUGH rather than glancing at.
   */
  const AXIS_FAN_DEG = 6;
  /** The first thing on that line must be this close — a mass at the end of
   *  the street, not a hill in the next valley. */
  const AXIS_MAX_M = 140;
  /** …and rise this far above the horizon from the seat, so it closes the
   *  skyline and not just the ground. A kerb would pass without this. */
  const AXIS_MIN_TOP_DEG = 3;

  /** Distance from `p` along unit `d` to the nearest crossing of `ring`. */
  function rayToRing(p: Vec2, d: Vec2, ring: readonly (readonly [number, number])[]): number {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const e: Vec2 = [b[0] - a[0], b[1] - a[1]];
      const den = d[0] * e[1] - d[1] * e[0];
      if (Math.abs(den) < 1e-9) continue;
      const q: Vec2 = [a[0] - p[0], a[1] - p[1]];
      const t = (q[0] * e[1] - q[1] * e[0]) / den;
      const u = (q[0] * d[1] - q[1] * d[0]) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best;
  }

  for (const id of SP_MAPS) {
    it(`${id}: the road's own AXIS is closed — a ray down it hits a mass, not the horizon`, () => {
      const { district, world } = built.get(id)!;
      const ends = terminusEnds(district, analyzeNetwork(district));
      expect(ends.length, `${id}: eligible ends`).toBeGreaterThan(0);
      expect(world.terminusClosures.length).toBe(world.stats.terminusClosures);

      for (const end of ends) {
        // The seat: back along the approach, in the right lane, exactly where
        // the frame was taken (x = 4.06 on a two-lane street).
        const eye: Vec2 = [
          end.pos[0] - end.out[0] * EYE_BACK_M + end.lateral[0] * (LANE_WIDTH_M / 2),
          end.pos[1] - end.out[1] * EYE_BACK_M + end.lateral[1] * (LANE_WIDTH_M / 2),
        ];
        const mine = world.terminusClosures.filter((c) => c.nodeId === end.nodeId);
        expect(mine.length, `${end.nodeId}: closing volumes`).toBeGreaterThan(0);
        // Sweep the fan a quarter of a degree at a time. EVERY line of sight in
        // it has to end on one of this end's volumes — a single uncovered
        // azimuth is a slit, and a slit on the axis is the whole defect.
        for (let deg = -AXIS_FAN_DEG; deg <= AXIS_FAN_DEG + 1e-9; deg += 0.25) {
          const a = (deg * Math.PI) / 180;
          const dir: Vec2 = [
            end.out[0] * Math.cos(a) + end.lateral[0] * Math.sin(a),
            end.out[1] * Math.cos(a) + end.lateral[1] * Math.sin(a),
          ];
          let hit = Infinity;
          let topDeg = 0;
          for (const c of mine) {
            const t = rayToRing(eye, dir, c.footprint);
            if (t < hit) {
              hit = t;
              topDeg = (Math.atan2(c.heightM - EYE_H_M, t) * 180) / Math.PI;
            }
          }
          expect(hit, `${end.nodeId} @ ${deg.toFixed(2)}°`).toBeLessThanOrEqual(AXIS_MAX_M);
          expect(topDeg, `${end.nodeId} @ ${deg.toFixed(2)}°`).toBeGreaterThanOrEqual(
            AXIS_MIN_TOP_DEG,
          );
        }
      }
    });

    it(`${id}: nothing the student can reach — every closing volume clears the road`, () => {
      // The closure carries a COLLIDER (that is why it is a building volume and
      // not a parapet: builders/constants.ts TERMINUS_CLOSE_*). So the guard
      // that makes it safe is the one that has to be a test. Sampled over the
      // whole footprint on a 4 m lattice, not at its corners — a road crossing
      // the middle of a rectangle clears all four of them.
      const { district, world } = built.get(id)!;
      const net = analyzeNetwork(district);
      for (const c of world.terminusClosures) {
        const xs = c.footprint.map((p) => p[0]);
        const ys = c.footprint.map((p) => p[1]);
        for (let x = Math.min(...xs); x <= Math.max(...xs); x += 4) {
          for (let y = Math.min(...ys); y <= Math.max(...ys); y += 4) {
            for (const eb of net.edges) {
              const pr = projectOntoPolyline(eb.edge.geometry as Vec2[], [x, y]);
              expect(pr.distance, `${c.nodeId} at ${x},${y}`).toBeGreaterThanOrEqual(
                TERMINUS_CLOSE_ROAD_CLEAR_M,
              );
            }
          }
        }
      }
    });
  }

  it("the closure adds no mesh of its own, and its triangles are counted", () => {
    // THE COST, checked rather than asserted in prose. The closure goes through
    // `buildBuildings`, whose four wall meshes and one roof mesh every district
    // mounts already — so the only thing it can possibly cost is triangles in
    // those meshes, and this measures exactly that by building the pass twice.
    //
    // On the running product at tier low the pair came back 139 raw draws
    // before and after with triangles DOWN 3,396 (the header carries the run).
    // This is the part of that a unit test can own.
    for (const id of SP_MAPS) {
      const district = built.get(id)!.district;
      const net = analyzeNetwork(district);
      const towers = new Set(buildBuildingInstances(district.buildings).map((p) => p.buildingId));
      const closure = buildTerminusClosure(district, net);
      const tris = (r: ReturnType<typeof buildBuildings>) =>
        r.walls.reduce((s, m) => s + m.triangleCount, 0) + r.roofs.triangleCount;
      const bare = buildBuildings(district.buildings, towers);
      const closed = buildBuildings(
        district.buildings,
        towers,
        closure.map((c) => c.volume),
      );
      // Same number of meshes on both sides: nothing new to submit.
      expect(closed.walls.length, id).toBe(bare.walls.length);
      // …and `stats.buildings` still counts only what the district authors.
      expect(closed.count, id).toBe(bare.count);
      // 26 triangles per volume today (3 wall rows × 4 edges × 2 + 2 roof).
      // The band leaves room for a cornice appearing on a taller closure
      // without leaving room for this becoming a model.
      const delta = tris(closed) - tris(bare);
      expect(delta, `${id} closure triangles`).toBeGreaterThan(0);
      expect(delta, `${id} closure triangles`).toBeLessThanOrEqual(closure.length * 40);
    }
  });

  it("plants nothing on a city, exam or полигон district", () => {
    // scenarioSignScale gates the whole B65 family on `mapKind` starting with
    // "scenario". d2-v1 and district-v1 carry no mapKind and poligon-v1 is a
    // training-ground, so all three must be byte-identical: their dead ends are
    // the edge of an OSM extract, not a street that stops.
    expect(built.get("d2-v1")!.world.trees.length).toBe(4273);
    expect(built.get("district-v1")!.world.trees.length).toBe(1763);
    expect(built.get("poligon-v1")!.world.trees.length).toBe(109);
    // …and nothing is BUILT in them either. 249 planted OSM dead ends would be
    // a forest around Sofia; 249 closing blocks would be a wall around it.
    for (const id of ["d2-v1", "district-v1", "poligon-v1"]) {
      expect(built.get(id)!.world.terminusClosures, id).toEqual([]);
      expect(built.get(id)!.world.stats.terminusClosures, id).toBe(0);
    }
  });

  it("adds no new tree FAMILY, and bounds the grove in triangles", () => {
    // The previous title („costs the frame no draw calls") was the same
    // mistake as above and its supporting claim — „Measured on the running
    // product: 221 draws before and after, unchanged" — was measured on a
    // number that is not the frame. A grove IS nearly free in draw calls, but
    // for a reason this test can actually check: it plants from tree kinds the
    // district already mounts, so it adds no mesh family.
    //
    // It is NOT free in triangles, and after this row it is not free in draw
    // calls either: `three-helpers.chunkTransforms` splits a district-spanning
    // instance set across a 400 m grid so it can be frustum-culled, which is
    // what took d2-v1 from 1,756,595 to 1,050,944 triangles per frame. A grove
    // large enough to cross a chunk boundary buys its own submissions. Hence
    // the band below.
    for (const id of SP_MAPS) {
      const { world } = built.get(id)!;
      const kinds = new Set(world.trees.map((t) => t.kind));
      expect(kinds.size, id).toBeLessThanOrEqual(TREE_KINDS.length);
    }
    // Triangles are what it does cost, at a MEASURED 378 per instance. This
    // bounds the band so a future widening cannot quietly become a forest.
    for (const id of SP_MAPS) {
      const endY = id === "sp-danger-v1" ? 400 : 360;
      expect(terminusTrees(id, endY).length).toBeLessThanOrEqual(40);
    }
  });

  it("is deterministic, and does not move one existing placement", () => {
    // The pass draws from its OWN mulberry32 stream (props.ts
    // `terminusRng`), not the shared per-district one, precisely so that
    // adding it cannot re-phase the billboards, bus stops and parking kits of
    // 90 scenario maps. Same seed twice ⇒ the same world.
    const a = buildWorldGeometry(load("sp-creep-v1"), { seed: SEED });
    const b = buildWorldGeometry(load("sp-creep-v1"), { seed: SEED });
    expect(a.trees).toEqual(b.trees);
    const shipped = built.get("sp-creep-v1")!.world;
    expect(shipped.billboards).toEqual(a.billboards);
    expect(shipped.busStops).toEqual(a.busStops);
    expect(shipped.parkingKits).toEqual(a.parkingKits);
    expect(shipped.streetlights).toEqual(a.streetlights);
    expect(shipped.utilityPoles).toEqual(a.utilityPoles);
    expect(shipped.railings).toEqual(a.railings);
  });
});
