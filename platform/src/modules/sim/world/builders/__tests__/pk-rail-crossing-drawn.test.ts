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
  RAIL_GAUGE_M,
  RAIL_HEAD_WIDTH_M,
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
/** The distance ЗДвП gives for a standing vehicle near rails — чл. 51, ал. 4
 *  «не по-малко от 2 метра преди първата релса», чл. 53, ал. 2, чл. 54, ал. 1. */
const LAW_RAIL_CLEAR_M = 2;

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

  it("THE LEGAL BOUNDARY IS THE DRAWN RAIL: the чл. 98 spans start 2 m from the steel", () => {
    // F1, pinned against the MESH rather than against a mirrored constant. The
    // ban spans in content/world/pk-rail-v1.json are generated from
    // RAIL_GAUGE_M, which tools/maps/gen_pk_rail.mjs can only mirror (a .mjs
    // generator cannot import this TS module) — so this case measures the rails
    // the builder actually emits and fails if the map ever stops agreeing with
    // them. Anchoring the ban to the BAND EDGE instead put the convicted ground
    // 3.21 m from the first rail while the student's card quoted чл. 51, ал. 4
    // «не по-малко от 2 метра преди първата релса»: a card and a world
    // disagreeing about a number, which is the defect class the whole re-cut
    // exists to remove.
    const rail = buildRailTracks(district, network);
    const ys = verts(rail.rails.positionsView).map((p) => -p[2]);
    // The two rail heads, by their CENTRE LINES — the head is 0.3 m wide along
    // travel, and that width is a legibility fudge (a real head is ~7 cm; see
    // RAIL_HEAD_WIDTH_M's docblock), so it must not move a legal boundary.
    const firstRailM = Math.min(...ys) + RAIL_HEAD_WIDTH_M / 2;
    const lastRailM = Math.max(...ys) - RAIL_HEAD_WIDTH_M / 2;
    expect(lastRailM - firstRailM).toBeCloseTo(RAIL_GAUGE_M, 6);
    expect(firstRailM).toBeCloseTo((BAND_FROM_M + BAND_TO_M) / 2 - RAIL_GAUGE_M / 2, 6);

    const bans = (district.zones ?? []).filter((z) => z.kind === "noStopping");
    expect(bans).toHaveLength(2);
    const [before, after] = bans;
    // Stored to the centimetre and rounded INWARD, so the convicted strip is
    // never longer than the article: 1.99625 m of the 2, never 2.01.
    expect(firstRailM - before.fromM).toBeLessThanOrEqual(LAW_RAIL_CLEAR_M);
    expect(firstRailM - before.fromM).toBeGreaterThan(LAW_RAIL_CLEAR_M - 0.02);
    expect(after.toM - lastRailM).toBeLessThanOrEqual(LAW_RAIL_CLEAR_M);
    expect(after.toM - lastRailM).toBeGreaterThan(LAW_RAIL_CLEAR_M - 0.02);
    // …and each span still stops AT the band, whose metres the rail zone owns.
    expect(before.toM).toBe(BAND_FROM_M);
    expect(after.fromM).toBe(BAND_TO_M);
    // The map publishes the rail coordinates it derived from, so nothing
    // downstream has to recompute them.
    const rc = (district.meta.scenario as { railCrossing: Record<string, number> }).railCrossing;
    expect(rc.firstRailM).toBeCloseTo(firstRailM, 2);
    expect(rc.lastRailM).toBeCloseTo(lastRailM, 2);
  });

  it("the guarded furniture stands at its documented stations, and the В27 steps aside", () => {
    // zoneSigns.ts: warning triangle 50 m ahead of the band, crossbuck at the
    // graded stop line 5 m ahead, barrier arm 3 m ahead. Those three stations
    // are RAIL_FURNITURE and never move.
    const posts = buildZoneSigns(district, network).map((p) => [p.kind, -p.position[2]] as const);
    const at = (kind: string) => posts.filter(([k]) => k === kind).map(([, y]) => y);
    expect(at("railGuarded")).toEqual([BAND_FROM_M - 50]);
    expect(at("railCross")).toEqual([BAND_FROM_M - 5]);
    expect(at("barrier")).toEqual([BAND_FROM_M - 3]);
    expect(at("railUnguarded")).toEqual([]); // guarded band never posts А35
    const bans = at("noStopping");
    expect(bans).toHaveLength(2);
    // THE В27 NO LONGER HAS TO STEP ASIDE, AND THAT IS A CONSEQUENCE WORTH
    // STATING RATHER THAN HIDING. This case asserted `bans[0] < BAND_FROM_M - 50`
    // while the чл. 98 span started at 150 — the А34's own station, which is the
    // collision it was written for (the Г12-on-the-Б1 failure). On 2026-09-10
    // the span was re-cut to the 2 m ЗДвП actually names, measured from the
    // FIRST RAIL (чл. 51, ал. 4), so it starts at 199.21 — 2.21 m past the
    // barrier arm at 197, which is more than ZONE_POST_MIN_APART_M = 1.2, so the
    // nudge never fires and the post stands exactly at the ban's start.
    //
    // HONEST NOTE, unchanged in kind by this move: these two В27 faces are a
    // RENDER-ONLY FICTION — zoneSigns.ts posts a plate at the start of every
    // `noStopping` span, and this map's spans are law-implied, so no such plate
    // exists in reality (the generator header carries the `posted?: boolean`
    // fix, not taken here — shared file). The plate now stands between the
    // barrier arm and the deck, which is a stranger place for a post than 192
    // was, and a truer one for THIS ban: it marks the metre the law's two
    // metres begin. Grading reads the spans and never the posts.
    expect(bans[0]).toBeCloseTo(199.21, 6);
    for (const station of [BAND_FROM_M - 50, BAND_FROM_M - 5, BAND_FROM_M - 3]) {
      expect(Math.abs(bans[0] - station)).toBeGreaterThan(1.2); // ZONE_POST_MIN_APART_M
    }
    expect(bans[1]).toBe(BAND_TO_M); // the run-out ban starts where the band ends
  });
});
