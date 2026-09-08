/**
 * AN ИЗВЪНГРАДСКИ ПЪТ IS NOT A SOFIA STREET — the gate for the predicate that
 * finally separates the two, and for the three passes that ask it.
 *
 * THE ROW: `sc-sp-curve:6079dfb1` (major). «The world contradicts the briefing
 * at the start. Instruction 1 says you are setting off on the OUT-OF-TOWN road
 * at 90 км/ч, but 01-arrival, 03-ready, 05-stopped and every frame up to about
 * t=060s show a dense urban street: five-storey apartment blocks on both sides,
 * street lighting, kerbs and pavements, and a continuous rank of parked cars.»
 * It reproduces at HEAD: `.audit-frames/w27/frames/sc-sp-curve__mobile-wrong/
 * 04-t086s.png` (commit 85495fd) is a contiguous wall of five-storey blocks
 * around a green field, with a parapet rail and lamp columns down a road whose
 * own В26 disc reads 90.
 *
 * WHY NO CLASS TEST COULD EVER HAVE CAUGHT IT, which is the part worth gating.
 * The five rural micro-maps are tagged `unclassified` (sp-curve-v1, ov-crest-v1,
 * ac-aqua-v1) or `tertiary` (ov-oncoming-v1, ov-solid2-v1) — the same classes
 * 83 of the 100 city and scenario districts use for their side streets. The one
 * term that distinguishes them is the POSTED LIMIT, and ЗДвП чл. 21, ал. 1 is
 * what makes it a proof rather than a heuristic: категория В is capped at 50 in
 * a built-up area and 90 outside one.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED. The kerb and the pavement do NOT move: they
 * are `edgeHalfWidth` geometry that every lane-keeping rule is graded against,
 * and re-tagging a graded carriageway is a re-drive, not a patch. This
 * predicate may only ever REMOVE scenery, and §3 below holds it to that.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeParkedCars, type TrafficDistrict } from "../../../traffic";
import { buildWorldGeometry } from "../buildWorldGeometry";
import {
  BG_EXTRA_URBAN_CATEGORY_B_KMH,
  isExtraUrbanCarriageway,
  isMotorwayCarriageway,
} from "../constants";
// builders/constants.ts IMPORTS this from contracts and does not re-export it,
// so it has to come from its owner.
import { PERCEPTUAL_ROAD_SCALE } from "../../../contracts";
import { analyzeNetwork } from "../network";
import { buildWorldRim } from "../worldRim";
import { assertDistrict, type District } from "../../types";

const WORLD_DIR = (() => {
  const local = path.join(process.cwd(), "content", "world");
  return fs.existsSync(local) ? local : path.resolve(process.cwd(), "..", "content", "world");
})();

const ids = fs
  .readdirSync(WORLD_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

const loadRaw = (id: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf8")) as unknown;
const load = (id: string): District => assertDistrict(loadRaw(id));

/** The five, named rather than derived — see §1 for why the list is pinned. */
const RURAL = ["ac-aqua-v1", "ov-crest-v1", "ov-oncoming-v1", "ov-solid2-v1", "sp-curve-v1"];

/**
 * The SAME map with its authored posting demoted to a class default — i.e.
 * exactly the world the builders made before this predicate existed. §3's
 * control: `maxspeedSource` feeds no geometry, so anything that moves between
 * the two builds moved because of the predicate and nothing else.
 */
function asDefaultPosted(d: District): District {
  const clone = JSON.parse(JSON.stringify(d)) as District;
  for (const e of clone.roads.edges) e.maxspeedSource = "default";
  return clone;
}

/** The lane width LessonScene mounts TrafficLayer with (its own default). */
const LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;

describe("§1 the predicate selects the rural catalogue and nothing else", () => {
  it("the ЗДвП чл. 21, ал. 1 figure is the категория В extra-urban ceiling", () => {
    expect(BG_EXTRA_URBAN_CATEGORY_B_KMH).toBe(90);
  });

  it("exactly five committed districts carry an authored extra-urban STREET", () => {
    // PINNED, not computed from the predicate: a gate whose subjects are chosen
    // by the thing it grades can be switched off by the same edit it exists to
    // catch (`motorway-is-not-a-street.test.ts`'s own rule). Every one of these
    // five opens its `meta.label` with «Учебен извънградски път» / «Учебен
    // извънграден път», which is the independent description.
    //
    // A МАГИСТРАЛА is извън населено място too and the predicate says so (140,
    // tagged) — which is why both consumers compose the two questions exactly
    // as this line does. The motorway maps are already handled by their own
    // rule and are not what this row is about.
    const hit = ids.filter((id) =>
      load(id).roads.edges.some((e) => !isMotorwayCarriageway(e) && isExtraUrbanCarriageway(e)),
    );
    expect(hit).toEqual(RURAL);
    // …and the independent description, which is structural rather than a
    // second reading of the same field: every one of the five is an OPEN ROAD —
    // no junction, no zebra — posted at the extra-urban ceiling. Four of them
    // also say «Учебен извънградски/извънграден път» in `meta.label`;
    // ov-solid2-v1 says only «Учебен път» and is named here rather than
    // hand-waved, because it is the OV-04 map whose whole subject is an
    // overtake against oncoming traffic on a 1+1 at 90.
    for (const id of RURAL) {
      const d = load(id);
      expect(d.intersections.length, `${id} junctions`).toBe(0);
      expect(d.crossings.length, `${id} zebras`).toBe(0);
      expect(String(d.meta.label), id).toMatch(/^Учебен (извънград\p{L}+ )?път/u);
    }
  });

  it("a motorway RAMP is not rural — its 90 is a class default, not a posting", () => {
    // mw-entry-v1 / mw-exit-v1 keep their city rim and their street dressing:
    // an entry ramp comes FROM somewhere and an exit ramp goes TO somewhere.
    // This is the control that keeps the rule from being „every map posted 90".
    for (const id of ["mw-entry-v1", "mw-exit-v1"]) {
      const ramp = load(id).roads.edges.find((e) => !isMotorwayCarriageway(e))!;
      expect(ramp.maxspeed, id).toBe(90);
      expect(ramp.maxspeedSource, id).toBe("default");
      expect(isExtraUrbanCarriageway(ramp), id).toBe(false);
    }
  });

  it("a signed 60/70 city boulevard stays a street (ал. 2 is not ал. 1)", () => {
    // A built-up-area road may be SIGNED above 50; none is ever signed 90.
    expect(isExtraUrbanCarriageway({ class: "primary", maxspeed: 70, maxspeedSource: "tag" }))
      .toBe(false);
    expect(isExtraUrbanCarriageway({ class: "residential", maxspeed: 50, maxspeedSource: "tag" }))
      .toBe(false);
    expect(isExtraUrbanCarriageway({ class: "unclassified", maxspeed: 90, maxspeedSource: "tag" }))
      .toBe(true);
  });
});

describe("§2 the three passes that ask it", () => {
  it("the world rim closes a rural road with a bank, not a wall of blocks", () => {
    // The frame's own complaint — „five-storey apartment blocks on both sides".
    // The belt is not deleted (that would undo „the world simply runs out"); it
    // stops being a city edge. `world-rim.test.ts` owns the height bands and the
    // catalogue-wide census; this asserts the ROW's map took the bank.
    const d = load("sp-curve-v1");
    const masses = buildWorldRim(d, analyzeNetwork(d), d.buildings);
    expect(masses.length).toBeGreaterThan(8);
    const tall = masses.filter((m) => (m.height ?? 0) > 5);
    expect(tall).toEqual([]);
  });

  it("no lamp, no overhead line and no parapet is dressed onto a rural road", () => {
    // „street lighting" in the row; the parapet and the poles ride the same
    // `props.dressesAsStreet` gate and were in the same frames.
    for (const id of RURAL) {
      const w = buildWorldGeometry(load(id), { seed: 7 });
      expect(w.streetlights.length, `${id} streetlights`).toBe(0);
      expect(w.utilityPoles.length, `${id} utility poles`).toBe(0);
      expect(w.railings.length, `${id} parapet panels`).toBe(0);
    }
  });

  it("nobody parks on the carriageway извън населено място (ЗДвП чл. 94, ал. 2)", () => {
    // „a continuous rank of parked cars" — and on three of these five the rank
    // was ALSO standing on the footway (the 247 bodies whose FOOTWAY_BUDGET
    // rows the ratchet deleted in the same change).
    for (const id of RURAL) {
      expect(computeParkedCars(loadRaw(id) as TrafficDistrict, LANE_W).length, id).toBe(0);
    }
  });
});

describe("§3 it may only ever REMOVE scenery", () => {
  it("the kerb, the pavement and the drivable carriageway do not move", () => {
    // The direction that would cost a drive: a graded surface that changes
    // width refuses a line every committed recording was measured against.
    //
    // MEASURED, not asserted in prose — against the SAME map with its posting
    // demoted to a class default, which is exactly the world this builder made
    // before the predicate existed. Every graded buffer must be identical
    // element for element; only the dressing may differ, and it must differ
    // DOWNWARD.
    for (const id of RURAL) {
      const before = buildWorldGeometry(asDefaultPosted(load(id)), { seed: 7 });
      const after = buildWorldGeometry(load(id), { seed: 7 });
      for (const key of ["roadSurface", "junctionSurface", "sidewalks", "markings", "parkingLanes"] as const) {
        expect(Array.from(after[key].positions), `${id}/${key}`).toEqual(
          Array.from(before[key].positions),
        );
      }
      expect(after.stats.buildings, `${id} authored buildings`).toBe(load(id).buildings.length);
      // …and the control: something DID change, or this test is a mute.
      expect(before.streetlights.length, `${id}: nothing to remove`).toBeGreaterThan(0);
      expect(after.streetlights.length).toBeLessThan(before.streetlights.length);
    }
  });

  it("a city map is untouched — the predicate never fires on one", () => {
    for (const id of ["zb-v1", "pe-school-v1", "district-v1"]) {
      const d = load(id);
      expect(d.roads.edges.some((e) => isExtraUrbanCarriageway(e)), id).toBe(false);
    }
    const zb = buildWorldGeometry(load("zb-v1"), { seed: 7 });
    expect(zb.streetlights.length).toBeGreaterThan(0);
  });
});
