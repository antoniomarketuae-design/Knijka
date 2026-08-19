/**
 * pk-rail-v1's LEVEL CROSSING, drawn — builders/railTrack.ts + builders/zoneSigns.ts.
 *
 * THE FINDING THIS EXISTS FOR (sweep-161, sc-pk-rail-ban, pc-right, critical):
 * „There is no level crossing in the world. Briefing step 3 states «Прелезът е
 * охраняем (А34) и бариерата е вдигната»… frames at t101s, t117s, t128s, t138s
 * and t176s show an ordinary two-lane street with parked cars and no rails, no
 * barrier, no А34 sign and no crossing surface. content/world/pk-rail-v1.json
 * does carry a railCrossing zone — the data is there and nothing draws it."
 *
 * Measured against the shipped file, the last clause is FALSE: the deck builds
 * (11 deck quads + 6 rail quads), and zoneSigns places the whole guarded set.
 * What was true is that NOTHING PINNED IT. `rail-track.test.ts`'s shipped-map
 * loop covers rx-unguarded / rx-guarded / rx-drop and skips pk-rail-v1, the one
 * map a lesson actually drives — and pk-rail-v1's own battery contains
 *
 *     it("renders NO track bed — the rails themselves are still copy-only", …)
 *       expect(Object.keys(world.stats)).not.toContain("track");
 *
 * which is VACUOUS: the key is `railTrackQuads`, so the assertion passes whether
 * the deck is drawn or not, while its title and comment claim the opposite of
 * what the world does. That is the same shape as the bug the file's own previous
 * test fixed („`signs.railCrossing ?? 0` … was `undefined ?? 0` and passed
 * vacuously"). A coverage count could not see either one.
 *
 * So this battery states, for the map the finding names, what a student must be
 * able to see, in numbers that break when it stops being true. It does NOT
 * claim the crossing READS well from the seat — that is a render question the
 * frames still answer badly, and it is recorded in the lane report, not here.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildWorldGeometry } from "../buildWorldGeometry";
import { polylineLength, type Vec2 } from "../math2d";
import { analyzeNetwork } from "../network";
import {
  buildRailTracks,
  RAIL_BALLAST_Y,
  RAIL_DECK_EDGE_INSET_M,
  RAIL_HEAD_Y,
  RAIL_SLEEPER_Y,
  SLEEPER_SPACING_M,
} from "../railTrack";
import { buildZoneSigns } from "../zoneSigns";
import { assertDistrict, type District } from "../../types";

const ID = "pk-rail-v1";
/** The authored band, mirrored from the district file (asserted below). */
const BAND_FROM_M = 200;
const BAND_TO_M = 206;

const district: District = assertDistrict(
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/world", `${ID}.json`), "utf8")),
);
const network = analyzeNetwork(district);
const edge = network.edgeById.get("pkr-e-street")!;
/** Deck reaches the full carriageway, less the kerb inset. */
const DECK_HALF = edge.halfWidth - RAIL_DECK_EDGE_INSET_M;
const N_TIES = Math.floor((2 * DECK_HALF) / SLEEPER_SPACING_M);

/** Every vertex of a mesh accumulator's positions, as world-space triples. */
function verts(positions: ArrayLike<number>): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    out.push([positions[i]!, positions[i + 1]!, positions[i + 2]!]);
  }
  return out;
}

describe(`${ID}: the crossing the briefing promises is actually drawn`, () => {
  it("the district still authors the guarded А34 band this battery is about", () => {
    const zone = (district.zones ?? []).find((z) => z.kind === "railCrossing")!;
    expect(zone.id).toBe("pkr-z-railcrossing");
    expect(zone.edgeId).toBe("pkr-e-street");
    expect(zone.fromM).toBe(BAND_FROM_M);
    expect(zone.toM).toBe(BAND_TO_M);
    expect(zone.guarded).toBe(true);
    expect(zone.signRef).toBe("А34");
    // The street runs north along x = 0, so district y IS arclength here — which
    // is what lets the band assertions below read as plain metres.
    const g = edge.edge.geometry as Vec2[];
    expect(g[0]).toEqual([0, 0]);
    expect(polylineLength(g)).toBeCloseTo(400, 6);
  });

  it("builds a ballast/sleeper deck and two steel rails — not zero", () => {
    const rail = buildRailTracks(district, network);
    expect(rail.deckQuads).toBe(1 + N_TIES); // 1 ballast band + N ties
    expect(rail.railQuads).toBe(6); // 2 rails × (top + 2 sides)
    expect(rail.deck.positionsView.length).toBeGreaterThan(0);
    expect(rail.rails.positionsView.length).toBeGreaterThan(0);
  });

  it("the deck lands ON the graded band — [200, 206] m, full carriageway across", () => {
    const rail = buildRailTracks(district, network);
    const v = verts(rail.deck.positionsView);
    // world = (x, height, -y): district y is -z.
    const ys = v.map((p) => -p[2]);
    const xs = v.map((p) => p[0]);
    expect(Math.min(...ys)).toBeCloseTo(BAND_FROM_M, 6);
    expect(Math.max(...ys)).toBeCloseTo(BAND_TO_M, 6);
    expect(Math.min(...xs)).toBeCloseTo(-DECK_HALF, 6);
    expect(Math.max(...xs)).toBeCloseTo(DECK_HALF, 6);
    // Every deck vertex sits above the paint plane and below the rail crown.
    for (const p of v) {
      expect(p[1]).toBeGreaterThanOrEqual(RAIL_BALLAST_Y - 1e-9);
      expect(p[1]).toBeLessThanOrEqual(RAIL_SLEEPER_Y + 1e-9);
    }
  });

  it("the rails run ACROSS the road, raised, inside the band", () => {
    const rail = buildRailTracks(district, network);
    const v = verts(rail.rails.positionsView);
    const xs = v.map((p) => p[0]);
    const ys = v.map((p) => -p[2]);
    // Across: the rails span the same carriageway width as the deck.
    expect(Math.min(...xs)).toBeCloseTo(-DECK_HALF, 6);
    expect(Math.max(...xs)).toBeCloseTo(DECK_HALF, 6);
    // Along: both rails live strictly inside the 6 m band.
    expect(Math.min(...ys)).toBeGreaterThan(BAND_FROM_M);
    expect(Math.max(...ys)).toBeLessThan(BAND_TO_M);
    // Raised: the crown stands above the sleepers.
    expect(Math.max(...v.map((p) => p[1]))).toBeCloseTo(RAIL_HEAD_Y, 6);
    expect(RAIL_HEAD_Y).toBeGreaterThan(RAIL_SLEEPER_Y);
  });

  it("it survives buildWorldGeometry and reaches the renderer's mesh, not just the builder", () => {
    // drawSlots gates the render on `railTracks.deck.positions.length > 0`, so
    // a deck that builds but never reaches WorldGeometry would draw nothing —
    // and that is exactly what the finding claimed had happened.
    const world = buildWorldGeometry(district, { seed: 7 });
    expect(world.stats.railTrackQuads).toBe(1 + N_TIES + 6);
    expect(world.railTracks.deck.positions.length).toBe((1 + N_TIES) * 4 * 3);
    expect(world.railTracks.rails.positions.length).toBe(6 * 4 * 3);
  });

  it("the guarded furniture stands at its documented stations, and the В27 steps aside", () => {
    // zoneSigns.ts: warning triangle 50 m ahead of the band, crossbuck at the
    // graded stop line 5 m ahead, barrier arm 3 m ahead. The чл. 98 ban starts
    // at exactly 150 too, so the free В27 post nudges upstream rather than
    // becoming one silhouette with the А34 — the Г12-on-the-Б1 failure.
    const posts = buildZoneSigns(district, network).map((p) => [p.kind, -p.position[2]] as const);
    const at = (kind: string) => posts.filter(([k]) => k === kind).map(([, y]) => y);
    expect(at("railGuarded")).toEqual([BAND_FROM_M - 50]);
    expect(at("railCross")).toEqual([BAND_FROM_M - 5]);
    expect(at("barrier")).toEqual([BAND_FROM_M - 3]);
    expect(at("railUnguarded")).toEqual([]); // guarded band never posts А35
    const bans = at("noStopping");
    expect(bans).toHaveLength(2);
    expect(bans[0]).toBeLessThan(BAND_FROM_M - 50); // stepped clear of the А34
    expect(bans[1]).toBe(BAND_TO_M); // the run-out ban starts where the band ends
  });
});
