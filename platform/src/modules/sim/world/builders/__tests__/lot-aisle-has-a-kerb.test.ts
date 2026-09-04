/**
 * THE CAR PARK HAS A KERB — the referent «спри успоредно на бордюра» names.
 *
 * WHAT WAS WRONG, measured on the shipped builder on 2026-08-26 before a line
 * changed. `buildWorldGeometry(lot-gap-long-v1, {})` returned
 * `stats.sidewalkStrips = 2` and a sidewalk mesh spanning district
 * y ∈ [-118.80, -33.23], against a `roadSurface` running y ∈ [-120, +40]. Every
 * committed `scenario-lot` map is one `residential` approach (y ∈ [-120, -30])
 * plus one `service` AISLE (y ∈ [-30, +40]); all fourteen parking drills happen
 * on the aisle; and the kerb stopped 3.2 m short of the gate and never entered
 * the lot. `SIDEWALK_CLASSES` has no `service` in it — correctly, because the
 * two OSM city maps author 58 and 68 service edges apiece — so the class gate
 * was never once satisfied on the roadway the drills actually park on.
 *
 * WHY IT IS A TEACHING DEFECT AND NOT A DRESSING ONE. sc-park-gap-long task 2
 * is «влез НАПРЕД в мястото и спри УСПОРЕДНО НА БОРДЮРА» (ЗДвП чл. 94) and
 * sc-park-gap-short's briefing says the same. The frame the row was filed on —
 * `.audit-frames/w11/frames/sc-park-gap-long__pc-right/04-t076s.png` — is that
 * task chip on the glass with no kerb anywhere in the world. The student is
 * asked to judge his car against a thing the product does not draw.
 *
 * WHAT THIS FILE HOLDS, in the order a reader needs it:
 *   §1 the kerb reaches the lot, on all 14 maps, on BOTH sides of the aisle;
 *   §2 it lands OUTSIDE every painted bay corner — the guard that a kerb can
 *      never fence off part of a graded cell (measured: 0.595 m of clearance on
 *      every one of the 14 maps, and the assertion is „outside", not the
 *      number, so a wider aisle or a re-authored bay stays legal);
 *   §3 nothing else in the catalogue moves — the predicate is empty for all 91
 *      non-lot districts, INCLUDING the four that author a `service` edge of
 *      their own (d2-v1, district-v1, pe-dart-v1's alley, mg-property-v1's
 *      drive), and `buildRoads` with no district is byte-identical to the build
 *      before this pass;
 *   §4 the two callers agree — `buildWorldGeometry` and the headless
 *      `resolveDistrictDrivableSurface` must kerb the same edges, or the grader
 *      the traces are recorded against drifts from the one the student meets.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildWorldGeometry } from "../buildWorldGeometry";
import { buildRoads, drivewayMouthsOf, lotAisleKerbEdgeIds } from "../roads";
import { analyzeNetwork } from "../network";
import { analyzeRoundabouts } from "../roundabout";
import { LANE_WIDTH_M, SIDEWALK_TOP_Y } from "../constants";
import { assertDistrict, type District } from "../../types";

const WORLD_DIR = path.join(process.cwd(), "public/world");

interface Loaded {
  id: string;
  district: District;
}

function allDistricts(): Loaded[] {
  return fs
    .readdirSync(WORLD_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      id: f.replace(/\.json$/, ""),
      district: assertDistrict(JSON.parse(fs.readFileSync(path.join(WORLD_DIR, f), "utf8"))),
    }));
}

const ALL = allDistricts();
const LOTS = ALL.filter((d) => d.district.meta.mapKind === "scenario-lot");
const NOT_LOTS = ALL.filter((d) => d.district.meta.mapKind !== "scenario-lot");

/** The aisle every lot map is built around: its single `service` edge. */
function aisleOf(district: District) {
  const edges = district.roads.edges.filter((e) => e.class === "service");
  expect(edges).toHaveLength(1);
  return edges[0]!;
}

/** Half the drawn carriageway of a 2-lane aisle — the offset `buildSidewalkStrip`
 *  is swept at, restated from the painter's own arithmetic rather than read off
 *  the mesh, so a mesh that moved would fail rather than redefine the target. */
function aisleHalfWidthM(district: District): number {
  const lanes = Math.max(1, aisleOf(district).lanes);
  return (lanes * LANE_WIDTH_M) / 2;
}

/** Every kerb-top vertex of a build, in district space. */
function kerbTops(district: District): { x: number; y: number }[] {
  const p = buildWorldGeometry(district, {}).sidewalks.positions;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < p.length; i += 3) {
    // The walkway top and the kerb lip both sit at SIDEWALK_TOP_Y; the face's
    // foot sits at ROAD_Y and the skirt at 0. Only the top band locates a kerb.
    if (Math.abs(p[i + 1]! - SIDEWALK_TOP_Y) > 1e-4) continue;
    out.push({ x: p[i]!, y: -p[i + 2]! });
  }
  return out;
}

/** Bay corners in the aisle's own (along, across) frame — `markings`' axes
 *  exactly (dir = [sin h, cos h]), so a 45° bay contributes its diagonal. */
function bayCornersAcross(district: District): number[] {
  const aisle = aisleOf(district);
  const g = aisle.geometry;
  const o = g[0]!;
  const t = g[g.length - 1]!;
  const len = Math.hypot(t[0]! - o[0]!, t[1]! - o[1]!);
  const ax = [(t[0]! - o[0]!) / len, (t[1]! - o[1]!) / len] as const;
  const lat = [ax[1], -ax[0]] as const;
  const bays =
    ((district.meta.scenario as { bays?: unknown } | undefined)?.bays as
      | Array<{ x: number; y: number; headingDeg: number; widthM: number; lengthM: number }>
      | undefined) ?? [];
  const out: number[] = [];
  for (const b of bays) {
    const h = (b.headingDeg * Math.PI) / 180;
    const dx = Math.sin(h);
    const dy = Math.cos(h);
    for (const sl of [-1, 1]) {
      for (const sw of [-1, 1]) {
        const x = b.x + (sl * b.lengthM * dx) / 2 + (sw * b.widthM * dy) / 2;
        const y = b.y + (sl * b.lengthM * dy) / 2 - (sw * b.widthM * dx) / 2;
        out.push((x - o[0]!) * lat[0] + (y - o[1]!) * lat[1]);
      }
    }
  }
  return out;
}

describe("§1 the kerb reaches the lot", () => {
  it("every scenario-lot map names its aisle, and only its aisle", () => {
    expect(LOTS.length).toBe(14);
    for (const { id, district } of LOTS) {
      const ids = lotAisleKerbEdgeIds(district);
      expect([...ids], id).toEqual([aisleOf(district).id]);
    }
  });

  it("kerb runs the length of the aisle, on both sides", () => {
    for (const { id, district } of LOTS) {
      const aisle = aisleOf(district);
      const g = aisle.geometry;
      // The aisle's own y-span (all 14 are axis-aligned two-point segments).
      const yFrom = Math.min(g[0]![1]!, g[g.length - 1]![1]!);
      const yTo = Math.max(g[0]![1]!, g[g.length - 1]![1]!);
      const half = aisleHalfWidthM(district);
      const tops = kerbTops(district);
      // A kerb-top vertex is „in the lot" when it is past the gate node and
      // within the aisle's own run.
      const inLot = tops.filter((p) => p.y > yFrom + 1 && p.y < yTo + 1);
      expect(inLot.length, `${id}: kerb vertices inside the lot`).toBeGreaterThan(0);
      // …and it must exist on BOTH flanks: a student parks against one kerb and
      // reads his lane position off the other.
      const right = inLot.filter((p) => p.x >= half - 1e-6);
      const left = inLot.filter((p) => p.x <= -(half - 1e-6));
      expect(right.length, `${id}: right-hand kerb in the lot`).toBeGreaterThan(0);
      expect(left.length, `${id}: left-hand kerb in the lot`).toBeGreaterThan(0);
      // …and it must reach the far end of the aisle, not stop at the last bay.
      // `sidewalkEndInsetM` pulls a strip 1.2 m back from each end of the
      // junction-trimmed line, so 2 m of headroom is the whole allowance.
      const reach = Math.max(...inLot.map((p) => p.y));
      expect(reach, `${id}: kerb reach vs aisle end ${yTo}`).toBeGreaterThan(yTo - 2);
    }
  });

  it("the strip count rises by exactly two flanks per lot map", () => {
    for (const { id, district } of LOTS) {
      const network = analyzeNetwork(district);
      const rings = analyzeRoundabouts(district, network);
      const before = buildRoads(network, rings).sidewalkStripCount;
      const after = buildRoads(network, rings, district).sidewalkStripCount;
      expect(after - before, id).toBe(2);
    }
  });
});

describe("§2 the kerb never crosses a painted bay", () => {
  it("stands outside the outermost bay corner on every lot map", () => {
    for (const { id, district } of LOTS) {
      const half = aisleHalfWidthM(district);
      const across = bayCornersAcross(district);
      expect(across.length, `${id}: bays`).toBeGreaterThan(0);
      const worst = Math.max(...across.map(Math.abs));
      // The kerb FACE is at `half`; a bay corner at or past it would mean the
      // pass had fenced off part of a graded cell.
      expect(worst, `${id}: outermost bay corner vs kerb face ${half}`).toBeLessThan(half);
    }
  });
});

describe("§3 nothing outside the car parks moves", () => {
  it("the predicate is empty for every non-lot district", () => {
    expect(NOT_LOTS.length).toBe(ALL.length - 14);
    for (const { id, district } of NOT_LOTS) {
      expect(lotAisleKerbEdgeIds(district).size, id).toBe(0);
    }
  });

  it("…including the four maps that author a service edge of their own", () => {
    const withService = NOT_LOTS.filter((d) =>
      d.district.roads.edges.some((e) => e.class === "service"),
    ).map((d) => d.id);
    // A driveway, an alley and two OSM city districts full of them. If a new
    // map joins this list the assertion below still holds; the list is printed
    // so a reader can see WHICH maps the additivity claim is about.
    expect(withService.sort()).toEqual(
      ["d2-v1", "district-v1", "mg-property-v1", "pe-dart-v1", "poligon-v1"].sort(),
    );
    for (const id of withService) {
      const district = ALL.find((d) => d.id === id)!.district;
      expect(lotAisleKerbEdgeIds(district).size, id).toBe(0);
    }
  });

  it("buildRoads with no district is the pre-pass build, everywhere", () => {
    // TWO decisions ride on the `district` argument now, not one: the lot
    // aisle's kerb (§1–§2 above) and a DRIVEWAY MOUTH — the dropped kerb
    // `roads.ts DrivewayMouth` ramps across a declared span so a driveway is an
    // apron and not a 12 cm step (`scene/__tests__/lesson-world-bay-clearance
    // .test.ts` §2 is the measurement that asked for it). The additivity claim
    // this test defends is unchanged in kind: whatever the argument buys must
    // be confined to the districts that ASK for it, by name.
    const moved: string[] = [];
    for (const { id, district } of ALL) {
      const network = analyzeNetwork(district);
      const rings = analyzeRoundabouts(district, network);
      const bare = buildRoads(network, rings);
      const given = buildRoads(network, rings, district);
      if (district.meta.mapKind === "scenario-lot") continue;
      // A ramped mouth adds STATIONS to a strip and never a strip: the
      // pavement is lowered across the mouth, not cut, so the shell stays
      // watertight and this count cannot move on any district.
      expect(given.sidewalkStripCount, id).toBe(bare.sidewalkStripCount);
      if (given.sidewalks.positionsView.length !== bare.sidewalks.positionsView.length) {
        moved.push(id);
        expect(drivewayMouthsOf(district).length, `${id} moved without asking`).toBeGreaterThan(0);
      } else {
        expect(drivewayMouthsOf(district).length, `${id} asked and did not move`).toBe(0);
      }
    }
    // Named, not counted: a new mouth is a deliberate act and shows up here.
    expect(moved.sort()).toEqual(["pk-drive-v1"]);
  });

  it("the predicate declines a district it was not given", () => {
    expect(lotAisleKerbEdgeIds(undefined).size).toBe(0);
  });
});

describe("§4 both callers kerb the same edges", () => {
  it("the world build and the headless surface build see one aisle each", () => {
    // The census agreement over all 105 districts lives in
    // `runtime/__tests__/drivable-surface.test.ts`; this is the narrow claim it
    // rests on — that the set handed to `buildRoads` is derived from the
    // DISTRICT and not from a call site, so the two cannot diverge silently.
    for (const { id, district } of LOTS) {
      const network = analyzeNetwork(district);
      const rings = analyzeRoundabouts(district, network);
      const viaRoads = buildRoads(network, rings, district);
      const viaWorld = buildWorldGeometry(district, {});
      expect(viaWorld.stats.sidewalkStrips, id).toBe(viaRoads.sidewalkStripCount);
    }
  });
});
