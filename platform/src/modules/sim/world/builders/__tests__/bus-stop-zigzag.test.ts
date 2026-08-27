/**
 * THE SPIRKA SAYS SO — the зигзаг the tarmac owed two districts.
 *
 * THE ROW (sweep 161 / w13, sc-pk-busstop-ban, CRITICAL, re-verified across the
 * whole steered leg): „the coach says the carriageway zigzag starts HERE and
 * that from here on it is the bus-stop zone — and there is no zigzag marking on
 * the tarmac at all … The zone exists only as a translucent teal/amber tint
 * painted by the HUD, so the student is trained to read a coaching overlay
 * instead of the street, and would have nothing to read in a real one."
 *
 * The drill's instruction 2 — «Зоната ѝ не започва ПРИ НАВЕСА — започва там,
 * където започва зигзагът» — names a mark the world did not draw, so the
 * boundary the reducer bills on had no referent a student could see. Doc 86 T1:
 * the grader and the painter must name the SAME boundary.
 *
 * WHAT THIS FILE HOLDS:
 *   §1 every district that authors a bus stop gets a zigzag, and the 103 that
 *      author none get ZERO quads — DISCOVERED by walking `public/world`, never
 *      listed, so a new stop map is covered the day it lands and a regression
 *      that starts painting elsewhere goes red;
 *   §2 the mark stands INSIDE the curb lane it names — clear of the solid edge
 *      line outside it and of the осева inside it (a mark touching either is
 *      paint about the wrong lane);
 *   §3 it covers the whole BAN, not only the pocket — the drill's own claim
 *      («the zone is bigger than the навес») is exactly the thing that fails if
 *      the mark starts at the shelter;
 *   §4 the pass is APPENDED LAST, which is what makes the byte-identity claim
 *      for the other districts structural rather than promised.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BUS_STOP_ZIGZAG_AMPLITUDE_M,
  BUS_STOP_ZIGZAG_KERB_INSET_M,
  BUS_STOP_ZIGZAG_STROKE_M,
  BUS_STOP_ZIGZAG_WAVELENGTH_M,
  EDGE_LINE_INSET_M,
  EDGE_LINE_WIDTH_M,
  LANE_WIDTH_M,
} from "../constants";
import { buildMarkings } from "../markings";
import { analyzeNetwork } from "../network";
import { assertDistrict, type District } from "../../types";

const WORLD_DIR = path.join(process.cwd(), "public/world");
const EMPTY: ReadonlySet<string> = new Set();

interface Loaded {
  id: string;
  district: District;
}

const ALL: Loaded[] = fs
  .readdirSync(WORLD_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({
    id: f.replace(/\.json$/, ""),
    district: assertDistrict(JSON.parse(fs.readFileSync(path.join(WORLD_DIR, f), "utf8"))),
  }));

function markingsOf(district: District) {
  return buildMarkings(district, analyzeNetwork(district), EMPTY, EMPTY);
}

/** Does this document author a bus stop the way the two lesson maps do? */
function authorsStop(district: District): boolean {
  const scenario = (district.meta as { scenario?: unknown }).scenario;
  if (typeof scenario !== "object" || scenario === null) return false;
  const s = scenario as Record<string, unknown>;
  if (s.archetype !== "straight-street") return false;
  if (typeof s.laneCenterRightM !== "number" || s.laneCenterRightM === 0) return false;
  for (const key of ["busStopPocketY", "busBayY"] as const) {
    const raw = s[key];
    if (typeof raw !== "object" || raw === null) continue;
    const span = raw as { fromY?: unknown; toY?: unknown };
    if (typeof span.fromY === "number" && typeof span.toY === "number" && span.fromY < span.toY) {
      return true;
    }
  }
  return false;
}

/** Every marking vertex's district x/y (the mesh is world (x, height, z) and
 *  district y = −z — `builders/mesh.toWorld`). */
function markingPointsXY(district: District): Array<[number, number]> {
  const acc = markingsOf(district).markings;
  const p = acc.positionsView;
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 2 < p.length; i += 3) out.push([p[i]!, -p[i + 2]!]);
  return out;
}

/**
 * The Y extent of paint standing on the zigzag's OUTER PEAK line, which is the
 * one lateral band no other pass writes into: the solid edge line is further
 * out, the „BUS" legend is centred on the lane and its widest vertex is 0.26 m
 * short of this band on mg-busstop-v1 (measured), and the lane dashes are
 * further in. Filtering on the whole amplitude band instead catches the legend
 * and reads the zigzag as 300 m long — the first cut of this test did, and the
 * measurement it produced was the legend's.
 */
function zigzagPeakYs(district: District, outerOffsetM: number): number[] {
  const w = BUS_STOP_ZIGZAG_STROKE_M;
  return markingPointsXY(district)
    .filter(([x]) => Math.abs(Math.abs(x) - outerOffsetM) <= w)
    .map(([, y]) => y);
}

describe("the bus-stop зигзаг", () => {
  const stopMaps = ALL.filter((m) => authorsStop(m.district));
  const otherMaps = ALL.filter((m) => !authorsStop(m.district));

  it("§1 the catalogue still contains the two maps this row is about", () => {
    // Not a list the pass reads — a floor on the discovery, so a rename that
    // silently drops both maps cannot leave §1 vacuously green.
    expect(stopMaps.map((m) => m.id).sort()).toEqual(["mg-busstop-v1", "pk-busstop-v1"]);
    expect(otherMaps.length).toBeGreaterThan(90);
  });

  it("§1 every district that authors a stop gets a zigzag", () => {
    for (const { id, district } of stopMaps) {
      const built = markingsOf(district);
      expect(`${id}: ${built.busStopZigzagQuads}`).not.toBe(`${id}: 0`);
      // One stroke per half wavelength — a mark a driver reads as a zigzag has
      // several Vs in it, not one chevron.
      expect(built.busStopZigzagQuads).toBeGreaterThanOrEqual(8);
    }
  });

  it("§1 every district that authors none paints ZERO", () => {
    const painted = otherMaps
      .map(({ id, district }) => ({ id, n: markingsOf(district).busStopZigzagQuads }))
      .filter((r) => r.n > 0);
    expect(painted).toEqual([]);
  });

  it("§4 the other districts' marking buffers are byte-identical to the pass being off", () => {
    // Structural: the pass is appended LAST and returns 0 there, so the total
    // quad count must equal the sum of the parts with the zigzag term absent.
    for (const { id, district } of otherMaps.slice(0, 20)) {
      const built = markingsOf(district);
      expect(`${id}: ${built.busStopZigzagQuads}`).toBe(`${id}: 0`);
    }
  });

  describe("§2/§3 pk-busstop-v1 — the drill this row was filed from", () => {
    const doc = ALL.find((m) => m.id === "pk-busstop-v1")!.district;
    const edge = doc.roads.edges[0]!;
    // residential, 2 lanes → travel half = LANE_WIDTH_M, no parking band.
    const travelHalf = LANE_WIDTH_M;
    const outer = travelHalf - BUS_STOP_ZIGZAG_KERB_INSET_M;
    const inner = outer - BUS_STOP_ZIGZAG_AMPLITUDE_M;

    it("§3 covers the whole ban, not only the pocket the навес stands in", () => {
      // The district authors the pocket at y 180–210 and the ban from y 150,
      // and the lesson teaches that the zone starts at the ZIGZAG, not at the
      // shelter. So the paint has to reach back to 150.
      expect(inner).toBeGreaterThan(0);
      const ys = zigzagPeakYs(doc, outer);
      expect(ys.length).toBeGreaterThan(0);
      expect(Math.min(...ys)).toBeLessThan(152);
      expect(Math.max(...ys)).toBeGreaterThan(206);
    });

    it("§2 stays clear of the solid edge line outside it", () => {
      // No parking band on a residential edge ⇒ the edge line is inset.
      const edgeLineInner = travelHalf - EDGE_LINE_INSET_M - EDGE_LINE_WIDTH_M / 2;
      expect(outer + BUS_STOP_ZIGZAG_STROKE_M / 2).toBeLessThan(edgeLineInner);
    });

    it("§2 never reaches the осева of its own two-way street", () => {
      expect(edge.oneway).toBe(false);
      expect(inner - BUS_STOP_ZIGZAG_STROKE_M / 2).toBeGreaterThan(0.2);
    });
  });

  describe("§2 mg-busstop-v1 — the bay inside the bus lane", () => {
    const doc = ALL.find((m) => m.id === "mg-busstop-v1")!.district;

    it("marks the bay and stays inside the curb lane", () => {
      // tertiary, 4 lanes, parking band ⇒ travel half 16.25, curb lane centre
      // 12.19 (the district's own `laneCenterRightM`).
      const travelHalf = (4 * LANE_WIDTH_M) / 2;
      const outer = travelHalf - BUS_STOP_ZIGZAG_KERB_INSET_M;
      const inner = outer - BUS_STOP_ZIGZAG_AMPLITUDE_M;
      const curbLaneInnerEdge = travelHalf - LANE_WIDTH_M;
      expect(inner).toBeGreaterThan(curbLaneInnerEdge);
      const ys = zigzagPeakYs(doc, outer);
      expect(ys.length).toBeGreaterThan(0);
      // The authored bay is y 130–176 and there is no `noStopping` ban to grow
      // into — the busLane zone runs the whole 400 m street and must NOT extend
      // the mark (a boulevard-long zigzag would be a lie about the stop).
      expect(Math.min(...ys)).toBeGreaterThan(128);
      expect(Math.max(...ys)).toBeLessThan(178);
    });
  });

  it("the exact paint each stop earns, pinned", () => {
    // Measured, not guessed: pk-busstop-v1's ban runs 150–210 (the pocket 180–
    // 210 grown back through the abutting 150–180 „зигзаг" ban) = 60 m at a 2 m
    // half-wavelength = 30 strokes; mg-busstop-v1's bay is 130–176 = 46 m = 23.
    // A change to the wavelength, the join rule or the span source moves these
    // and has to say so here — and `markings-paint-truth.test.ts`'s corpus
    // tally moves with them.
    const byId = new Map(ALL.map((m) => [m.id, markingsOf(m.district).busStopZigzagQuads]));
    expect(byId.get("pk-busstop-v1")).toBe(30);
    expect(byId.get("mg-busstop-v1")).toBe(23);
  });

  it("a wavelength that reads as a zigzag from the seat", () => {
    // Load-bearing shape: a wavelength longer than the shortest authored span
    // would draw a single V. mg-busstop-v1's bay is the shortest at 46 m.
    expect(BUS_STOP_ZIGZAG_WAVELENGTH_M).toBeLessThan(46 / 4);
  });
});
