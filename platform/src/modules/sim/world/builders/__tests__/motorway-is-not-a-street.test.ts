/**
 * A МАГИСТРАЛА IS NOT DRESSED AS A SOFIA SIDE STREET — the B65 furniture rule
 * asked of the road rather than of its `class` string.
 *
 * THE FINDING (sc-merge-motorway-exit:cd7e227a, critical). Frame:
 * `.audit-frames/w10-2/frames/sc-merge-motorway-exit__mobile-right/01-arrival.png`.
 * The ИНСТРУКЦИИ panel reads «Тръгваш в ЛЯВАТА лента на магистралата», the HUD
 * chip reads 140 with «РЕЖИМ Нормален ≤150», and out of the windscreen there is
 * an iron pedestrian parapet running along the left kerb, a row of cypresses,
 * street-lamp columns and four overhead catenary spans across the sky. Filed
 * words: „what is rendered is an urban street … No hard shoulder, no crash
 * barrier, no deceleration lane, no gantry, no countdown boards".
 *
 * THE MECHANISM, MEASURED — and it is one word of district data.
 * `constants.ts` has said since gen_motorway.mjs landed that „a motorway
 * carries no arterial parking band, street trees, streetlights or sidewalks
 * (founder R-media #7/#8)", and it enforced that ENTIRELY through the class
 * string. Across the committed catalogue only three districts carry motorway
 * carriageways:
 *
 *     mw-v1        class "motorway"  motorway=true   → dressed correctly
 *     mw-entry-v1  class "motorway"  motorway=true   → dressed correctly
 *     mw-exit-v1   class "primary"   motorway=true   → dressed as a side street
 *
 * `primary` is in ARTERIAL_CLASSES and in SCENARIO_LIT_CLASSES, so the one map
 * in the product whose entire subject is LEAVING a магистрала got the whole
 * kit. Counted through `buildWorldGeometry(mw-exit-v1)`, before → after:
 *
 *     streetlights   96 →  9      utilityPoles   77 →  8
 *     trees         462 → 303     utilityWireSpans 72 → 7
 *     railings      248 → 25      staticDrawSlots  52 → 51
 *
 * `staticDrawSlots 52 → 51` is one family fewer mounted, and every gate on that
 * number is a `≤ 150` upper bound (buildWorldGeometry.test.ts, ban-districts,
 * ac-*, jx-*, ln-* — the whole battery), so the move is downward into slack.
 * `world/__tests__/drawSlots.test.ts` recomputes the published count from the
 * finished world for all 105 districts and is run with this file for that
 * reason; its corpus-spread floor (max − min ≥ 25) is nowhere near this edge.
 *
 * IN THE CORRIDOR THE FRAME ACTUALLY PHOTOGRAPHS — props within 40 m of the
 * carriageway axis, 60 m behind to 260 m ahead of spawn — the counts are
 * railings 47 → 0 (the iron parapet the row names by hand), streetlights 14 → 0,
 * utilityPoles 16 → 0, trees 45 → 15, and 11 of those 15 sit at y −7…−18, i.e.
 * behind or at spawn in the terminus grove that closes the end of the world and
 * is not class-gated at all.
 *
 * The residue is the RAMP (`mwx-e-ramp`, class `secondary_link`, no motorway
 * flag — a slip road with a real verge keeps its lamps) plus the terminus grove
 * that closes the end of the world. `vertices` and `triangles` do not move at
 * all (16977 / 27820 both sides): every one of these is an instanced prop, so
 * no perf budget shifts. Every OTHER district in `content/world` is
 * byte-identical, which is the same discipline SCENARIO_LIT_CLASSES records for
 * itself.
 *
 * WHAT THIS DELIBERATELY DOES NOT TOUCH — and the row STAYS OPEN because of it.
 * Counted against the eleven clauses the finding actually files, this predicate
 * closes four:
 *
 *   CLOSED   iron pedestrian railing · street lamps · overhead power cables ·
 *            cypress rows (materially — 45 → 15 in the corridor)
 *   STANDS   kerbs · the unbroken row of parked cars
 *   STANDS   no hard shoulder · no crash barrier · no deceleration lane ·
 *            no gantry · no countdown boards · no slip road in any frame
 *
 * The first pair still go by `class`: SIDEWALK_CLASSES and PARKING_LANE_CLASSES
 * move `edgeHalfWidth`, i.e. the drivable geometry every lane-keeping rule is
 * graded against, and re-tagging a graded carriageway is a re-drive, not a
 * patch.
 *
 * The second six are ADDITIVE, and that is the structural point: the whole
 * safety argument for this predicate is that it can only ever REMOVE scenery
 * (so no drive credited today can be refused tomorrow), which makes it
 * incapable, by construction, of ever satisfying them. The frame's headline
 * sentence is «what is rendered is an urban street»; taking the street
 * furniture away is necessary and is not sufficient. Do not read a green run of
 * this file as the finding closed.
 *
 * The next round is `content/world/gen_mw_exit.mjs` → `class: "motorway"` plus a
 * regenerate, with a fresh steered drive of sc-merge-motorway-exit before and
 * after; then the six additive clauses as a lane of their own.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildWorldGeometry } from "../buildWorldGeometry";
import { isMotorwayCarriageway } from "../constants";
import { assertDistrict, type District } from "../../types";

const WORLD_DIR = path.join(process.cwd(), "..", "content", "world");

function load(id: string): District {
  return assertDistrict(JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf8")));
}

/** The B65 dressing counts — the props this predicate is allowed to suppress. */
function dressing(district: District) {
  const s = buildWorldGeometry(district).stats as unknown as Record<string, number>;
  return {
    streetlights: s.streetlights,
    trees: s.trees,
    utilityPoles: s.utilityPoles,
    utilityWireSpans: s.utilityWireSpans,
    railings: s.railings,
    vertices: s.vertices,
    triangles: s.triangles,
  };
}

/**
 * Re-tag every motorway carriageway `class: "primary"` — mw-exit-v1's own
 * spelling — keeping or dropping the flag. The A/B differs by THE FLAG AND
 * NOTHING ELSE, which is the whole claim: `class` still says arterial in both,
 * so the geometry (and therefore vertices/triangles) is identical and only the
 * dressing passes may move.
 *
 * Re-tagging is what makes the control non-vacuous on mw-v1 and mw-entry-v1,
 * whose carriageways are already `class: "motorway"`: stripping the flag there
 * changes nothing at all, because the class rule alone was already correct on
 * those two maps. The defect only ever showed on the map that spelled it the
 * other way.
 */
function asArterialTagged(district: District, keepFlag: boolean): District {
  const clone = JSON.parse(JSON.stringify(district)) as District;
  for (const e of clone.roads.edges) {
    if (!isMotorwayCarriageway(e)) continue;
    (e as { class: string }).class = "primary";
    if (keepFlag) (e as { motorway?: boolean }).motorway = true;
    else delete (e as { motorway?: boolean }).motorway;
  }
  return clone;
}

describe("§1 the predicate itself — a class string is not the only place a road says what it is", () => {
  it("recognises a motorway however it is tagged", () => {
    // The two spellings the catalogue actually ships.
    expect(isMotorwayCarriageway({ class: "motorway", motorway: true })).toBe(true);
    expect(isMotorwayCarriageway({ class: "primary", motorway: true })).toBe(true);
    // …and the OSM class alone, for an extract that never carried the flag.
    expect(isMotorwayCarriageway({ class: "motorway" })).toBe(true);
    expect(isMotorwayCarriageway({ class: "motorway_link" })).toBe(true);
  });
  it("leaves an ordinary street alone — the half that keeps this from being a mute", () => {
    expect(isMotorwayCarriageway({ class: "primary" })).toBe(false);
    expect(isMotorwayCarriageway({ class: "secondary_link" })).toBe(false);
    expect(isMotorwayCarriageway({ class: "residential" })).toBe(false);
    // A slip road is NOT a carriageway: mw-exit-v1's own ramp is this row, and
    // suppressing its lamps would be a second defect in the other direction.
    expect(isMotorwayCarriageway({ class: "secondary_link", motorway: false })).toBe(false);
  });
});

describe("§2 the catalogue — every motorway carriageway, whatever its class", () => {
  // Discovery, not a hand-written list: a map that starts tagging its motorway
  // some third way must join this loop rather than inherit no coverage.
  const MOTORWAY_DISTRICTS = fs
    .readdirSync(WORLD_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ id: f.replace(/\.json$/, ""), district: load(f.replace(/\.json$/, "")) }))
    .filter(({ district }) => district.roads.edges.some((e) => isMotorwayCarriageway(e)));

  it("finds the motorway maps at all", () => {
    const ids = MOTORWAY_DISTRICTS.map((d) => d.id).sort();
    expect(ids).toEqual(["mw-entry-v1", "mw-exit-v1", "mw-v1"]);
  });

  for (const { id, district } of MOTORWAY_DISTRICTS) {
    it(`${id}: the flag alone suppresses the side-street kit on its carriageways`, () => {
      const flagged = dressing(asArterialTagged(district, true));
      const unflagged = dressing(asArterialTagged(district, false));
      // THE CONTROL IS THE ASSERTION. Without it this file passes on a map that
      // has no props for some unrelated reason — the „green by vacuum" trap the
      // paint-truth battery records about its own three unfalsifiable claims.
      // With the flag off, an arterial-tagged carriageway must be DRESSED.
      expect(unflagged.streetlights, `${id}: the control map has no lamps to remove`).toBeGreaterThan(
        0,
      );
      expect(unflagged.railings, `${id}: the control map has no parapet to remove`).toBeGreaterThan(0);
      expect(
        unflagged.utilityPoles,
        `${id}: the control map has no overhead line to remove`,
      ).toBeGreaterThan(0);
      // And with it on, strictly less of each — the flag is read.
      expect(flagged.streetlights).toBeLessThan(unflagged.streetlights);
      expect(flagged.utilityPoles).toBeLessThan(unflagged.utilityPoles);
      expect(flagged.utilityWireSpans).toBeLessThan(unflagged.utilityWireSpans);
      expect(flagged.railings).toBeLessThan(unflagged.railings);
      expect(flagged.trees).toBeLessThan(unflagged.trees);
      // THE MESH CLAIM MOVED IN WAVE 8, and it moved because the flag now
      // reaches one more thing on purpose.
      //
      // This used to read `expect(flagged.vertices).toBe(unflagged.vertices)` —
      // „instanced props only, the mesh is the same object either way". It was
      // true while the flag only silenced the four dressing passes above, all
      // of which are instanced placements. sc-mw-emergency-lane («no median
      // barrier … it does not read as a магистрала») and sc-ac-truck-spray
      // («an urban street lined with apartment blocks on both sides», on a map
      // that authors ONE building over 2,606 m) put the WORLD RIM behind the
      // same flag: a district with no street-class carriageway now closes with
      // a WORLD_RIM_BANK_HEIGHT_M embankment instead of a 9–22 m frontage, and
      // a shorter mass is fewer facade bands, so it is genuinely less geometry.
      //
      // So the claim becomes the honest one, in the honest direction: the
      // motorway build is never MORE mesh than the street build, and where the
      // map still carries a street the two are still identical. mw-exit-v1 is
      // that second case — its ramp runs into an ordinary street, so its rim
      // stays urban — which is what keeps this from being a one-sided rule.
      const hasStreetCarriageway = district.roads.edges.some((e) => !isMotorwayCarriageway(e));
      if (hasStreetCarriageway) {
        expect(flagged.vertices, `${id}: still a street map, mesh must not move`).toBe(
          unflagged.vertices,
        );
        expect(flagged.triangles, id).toBe(unflagged.triangles);
      } else {
        expect(flagged.vertices, `${id}: the motorway build is never more mesh`).toBeLessThan(
          unflagged.vertices,
        );
        expect(flagged.triangles, id).toBeLessThan(unflagged.triangles);
      }
    });
  }

  it("mw-exit-v1: the frame's own objects, counted (the numbers in the header)", () => {
    // SHIPPED, not re-tagged: this map already spells its carriageway
    // `class: "primary"`, so `asArterialTagged(_, true)` is a no-op on it and
    // the unflagged twin is exactly the world the 01-arrival frame photographed.
    const shipped = dressing(load("mw-exit-v1"));
    const asStreet = dressing(asArterialTagged(load("mw-exit-v1"), false));
    // The mis-tagged map is the whole reason this file exists, so its numbers
    // are pinned rather than merely ordered. If the ramp's own furniture moves
    // these change — and they should, loudly, not silently.
    expect(asStreet).toMatchObject({
      streetlights: 96,
      utilityPoles: 77,
      utilityWireSpans: 72,
      railings: 248,
      trees: 462,
    });
    expect(shipped).toMatchObject({
      streetlights: 9,
      utilityPoles: 8,
      utilityWireSpans: 7,
      railings: 25,
      trees: 303,
    });
  });
}, 120_000);
