/**
 * THE BUS LANE SAYS SO — the „BUS" legend the world owed three districts.
 *
 * THE ROW (sweep 161 / w12, sc-merge-bus-pullout, major, re-verified across the
 * whole 206 s steered drive): „right lane is an unbroken row of privately
 * parked saloons and a pickup behind a solid white edge line with a plain
 * dashed lane divider — no bus-lane paint, no BUS legend, no blue lane sign."
 * The drill's instruction 1 is «Дясната лента е бус лента — в нея е спирката, и
 * там не се кара», so the student is graded on reading a lane the world states
 * nothing about.
 *
 * WHY THE LEGEND AND NOT A SIGN, stated once here so the next lane does not
 * re-open it: `SignKind` (world/types.ts) has no Д24 member and the sign kit no
 * Д24 face, and `signFaces.ts`'s honesty rule is that a kind with no truthful
 * face is DROPPED, never guessed at — the blank-plate defect this very sweep
 * filed twice. `zoneSigns.ts` says the same thing in its own header („marking-
 * only kinds … place nothing"). The lawful, asset-free answer is the surface
 * legend a Bulgarian bus lane actually carries, and the districts already name
 * the act: `mg-busstop-v1.meta.scenario.busLaneY.lawRef` is „Наредба № 2/2001
 * — BUS" and every one of the three zones carries `signRef: "BUS"`.
 *
 * WHAT THIS FILE HOLDS:
 *   §1 every authored `busLane` span in the catalogue gets a legend, and the
 *      101 districts that author none get ZERO quads — discovered by walking
 *      `public/world`, never listed, so a new bus-lane map is covered the day
 *      it lands and a regression that starts painting elsewhere goes red;
 *   §2 the legend stands INSIDE the lane it names, on the same curb lane the
 *      seam bounds — a legend touching or crossing its own seam would be paint
 *      about the wrong lane;
 *   §3 it stands inside the ZONE, in arclength — a legend past the span names
 *      metres the restriction does not cover;
 *   §4 the pass is APPENDED LAST, which is what makes the byte-identity claim
 *      for the other districts structural rather than promised.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildMarkings } from "../markings";
import { analyzeNetwork } from "../network";
import {
  BUS_LEGEND_INSET_M,
  BUS_LEGEND_LETTER_H_M,
  BUS_LEGEND_TOTAL_W_M,
  LANE_WIDTH_M,
} from "../constants";
import { polylineLength } from "../math2d";
import { assertDistrict, type District } from "../../types";

const WORLD_DIR = path.join(process.cwd(), "public/world");

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

const EMPTY: ReadonlySet<string> = new Set();

function markingsOf(district: District) {
  return buildMarkings(district, analyzeNetwork(district), EMPTY, EMPTY);
}

/** Every `busLane` span a district authors. */
function busZonesOf(district: District) {
  return (district.zones ?? []).filter((z) => z.kind === "busLane");
}

const WITH_BUS = ALL.filter((d) => busZonesOf(d.district).length > 0);
const WITHOUT_BUS = ALL.filter((d) => busZonesOf(d.district).length === 0);

/**
 * The legend's own vertices, in district space — the TAIL of the markings
 * buffer, because the pass is appended last and emits exactly four vertices per
 * quad. Reading them this way is deliberate: it pins the ordering contract §4
 * asserts, so a pass that stopped being last would fail here rather than
 * silently measure somebody else's paint.
 */
function legendPoints(district: District): Array<[number, number]> {
  const m = markingsOf(district);
  const pos = m.markings.positionsView;
  const n = m.busLegendQuads * 4;
  const out: Array<[number, number]> = [];
  const first = pos.length / 3 - n;
  for (let v = first; v < pos.length / 3; v++) {
    // world (x, height, z) -> district (x, y = -z) — builders/mesh.toWorld.
    out.push([pos[v * 3]!, -pos[v * 3 + 2]!]);
  }
  return out;
}

describe("§1 the catalogue — a legend exactly where a bus lane is authored", () => {
  it("the three authored bus-lane districts are the ones that get paint", () => {
    expect(WITH_BUS.map((d) => d.id).sort()).toEqual([
      "district-v1",
      "mg-busstop-v1",
      "ov-bus-v1",
    ]);
  });

  it.each(WITH_BUS.map((d) => [d.id, d.district] as const))(
    "%s paints at least one legend per authored span",
    (_id, district) => {
      const m = markingsOf(district);
      // 13 strokes per „BUS" (5 + 3 + 5), so the count is always a multiple of
      // 13 and never zero: a district whose every span was too short would
      // leave the lesson with nothing to read and this fails.
      expect(m.busLegendQuads).toBeGreaterThan(0);
      expect(m.busLegendQuads % 13).toBe(0);
      // …and one legend per span is the CEILING this pass promises, not the
      // floor, because a span is only as paintable as the asphalt drawn under
      // it. Measured on the committed catalogue (span / trimFrom / DRAWN
      // length after the junction cuts, m):
      //
      //   mg-busstop-v1  mgb-z-buslane        400.0 / 0.00 / 400.0  → 5 legends
      //   ov-bus-v1      ovbus-z-buslane      240.0 / 0.00 / 500.0  → 3
      //   district-v1    dv1-bus-ohridski-3    75.7 / 4.05 /  40.5  → 1
      //                  dv1-bus-ohridski-2    29.4 / 13.22 / 12.1  → 0
      //                  dv1-bus-ohridski-1    63.5 / 28.58 /  6.4  → 0
      //                  dv1-bus-ohridski-4    41.0 / 18.44 /  4.1  → 0
      //
      // The three Охридски zeroes are the honest answer, not a miss: those
      // blocks draw 4–12 m of ribbon between their junction cuts and a road
      // legend is 6 m long before its 8 m entry inset. Painting one there
      // would put the word across a junction mouth. If a future map widens
      // those cuts the count rises on its own and this comment is what tells
      // the next reader the rise is expected.
      const net = analyzeNetwork(district);
      const paintable = busZonesOf(district).filter((z) => {
        const eb = net.edges.find((e) => e.edge.id === z.edgeId);
        if (!eb || !eb.line) return false;
        const drawn = polylineLength(eb.line);
        const s0 = eb.trimFrom + 0.8;
        const a = Math.max(0, Math.min(drawn, z.fromM - s0));
        const b = Math.max(0, Math.min(drawn, z.toM - s0));
        return b - a >= BUS_LEGEND_INSET_M + BUS_LEGEND_LETTER_H_M;
      });
      expect(paintable.length).toBeGreaterThan(0);
      expect(m.busLegendQuads).toBeGreaterThanOrEqual(13 * paintable.length);
    },
  );

  it("nothing else in the catalogue paints a single legend quad", () => {
    const offenders = WITHOUT_BUS.filter((d) => markingsOf(d.district).busLegendQuads !== 0).map(
      (d) => d.id,
    );
    expect(offenders).toEqual([]);
    // …and the sweep is worth something only if it actually walked the corpus.
    expect(WITHOUT_BUS.length).toBeGreaterThan(90);
  });
});

describe("§2 the legend stands inside the lane it names", () => {
  // The two straight scenario streets: geometry is the district y axis, so a
  // painted vertex's district x IS its lateral offset and no projection is
  // needed. district-v1's Охридски spans are curved and are covered by §1/§3.
  const STRAIGHT = ["mg-busstop-v1", "ov-bus-v1"] as const;

  it.each(STRAIGHT)("%s keeps every stroke between the seam and the kerb", (id) => {
    const loaded = ALL.find((d) => d.id === id)!;
    const network = analyzeNetwork(loaded.district);
    const eb = network.edges.find((e) => busZonesOf(loaded.district)[0]!.edgeId === e.edge.id)!;
    const travelHalf = eb.halfWidth - eb.parkingM;
    // The curb lane runs from the seam at `travelHalf - LANE_WIDTH_M` out to
    // the carriageway edge at `travelHalf`; the legend is centred in it.
    const seam = travelHalf - LANE_WIDTH_M;
    const pts = legendPoints(loaded.district);
    expect(pts.length).toBeGreaterThan(0);
    for (const [x] of pts) {
      const lateral = Math.abs(x);
      expect(lateral).toBeGreaterThan(seam);
      expect(lateral).toBeLessThan(travelHalf);
    }
    // Both banks of a two-way street carry it, exactly as both banks carry the
    // seam (markings.authoredSolidBoundaries) — so the reading is the same
    // whichever way the lesson spawns you.
    expect(pts.some(([x]) => x > 0)).toBe(true);
    expect(pts.some(([x]) => x < 0)).toBe(true);
    // It cannot be wider than the lane it is painted in — the guard that keeps
    // a future narrow lane paint-free instead of overhung.
    expect(BUS_LEGEND_TOTAL_W_M).toBeLessThan(LANE_WIDTH_M - 0.4);
  });
});

describe("§3 the legend stands inside the zone", () => {
  it.each(["mg-busstop-v1", "ov-bus-v1"] as const)("%s never paints past its own span", (id) => {
    const loaded = ALL.find((d) => d.id === id)!;
    const zone = busZonesOf(loaded.district)[0]!;
    const edge = loaded.district.roads.edges.find((e) => e.id === zone.edgeId)!;
    // Both maps author a single two-point north-south segment, so geometry
    // arclength is district y measured from the edge's first vertex.
    const y0 = edge.geometry[0]![1];
    const pts = legendPoints(loaded.district);
    expect(pts.length).toBeGreaterThan(0);
    for (const [, y] of pts) {
      const s = Math.abs(y - y0);
      expect(s).toBeGreaterThanOrEqual(zone.fromM);
      expect(s).toBeLessThanOrEqual(zone.toM);
    }
  });

  it("a span too short for one legend gets none rather than a clipped one", () => {
    const loaded = ALL.find((d) => d.id === "mg-busstop-v1")!;
    const zone = busZonesOf(loaded.district)[0]!;
    const shrunk = structuredClone(loaded.district) as District;
    const z = (shrunk.zones ?? []).find((q) => q.id === zone.id)!;
    // The span is measured in GEOMETRY arclength and the bound is applied in
    // LINE arclength, so the 0.8 m head trim has to be carried here too — the
    // same mapping `paintBusLaneLegend` does, restated rather than assumed.
    const HEAD_TRIM_M = 0.8;
    const need = BUS_LEGEND_INSET_M + BUS_LEGEND_LETTER_H_M + HEAD_TRIM_M;
    z.fromM = 0;
    z.toM = need - 1;
    expect(markingsOf(shrunk).busLegendQuads).toBe(0);
    z.toM = need + 1;
    // Exactly ONE legend PER BANK — 26 strokes on this two-way street, and not
    // a clipped half of a second one.
    expect(markingsOf(shrunk).busLegendQuads).toBe(26);
  });
});

describe("§4 the pass is appended last", () => {
  it("the legend's quads are the tail of the markings buffer", () => {
    const loaded = ALL.find((d) => d.id === "mg-busstop-v1")!;
    const m = markingsOf(loaded.district);
    // The accumulator emits four vertices per quad in order, so „appended
    // last" means the final 4·n vertices are all inside the curb lane. If any
    // other pass ran after this one, some of that tail would be a lane line,
    // an edge line or a stop bar — none of which live in that band.
    const network = analyzeNetwork(loaded.district);
    const eb = network.edges[0]!;
    const travelHalf = eb.halfWidth - eb.parkingM;
    const seam = travelHalf - LANE_WIDTH_M;
    const pts = legendPoints(loaded.district);
    expect(pts).toHaveLength(m.busLegendQuads * 4);
    expect(pts.every(([x]) => Math.abs(x) > seam && Math.abs(x) < travelHalf)).toBe(true);
  });
});
