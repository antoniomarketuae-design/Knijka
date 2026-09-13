/**
 * =============================================================================
 * A HOME ZONE'S CARRIAGEWAY IS NOT DIVIDED INTO LANES
 * sc-pe-zone-living:37bbb618 (major), re-judged STILL on the w41 re-drive.
 *
 * THE ROW: „The world is not a home zone … the drive happens on a wide
 * multi-lane boulevard … Nothing about the geometry signals the zone the rule
 * depends on." Its judge accepted that a width step is built (kerb-to-kerb
 * 24.25 → 16.25 m at the boundary) and held the row on what the carriageway
 * SHOWS, quoting its own crop: „the carriageway fills the frame between two
 * continuous white lines".
 *
 * THE LAW, RETRIEVED (`content/law/acts/zdvp.json`, чл. 62, т. 1): „пешеходците
 * могат да използват за движение, а децата за игра пътя по цялата му широчина".
 * A centre line is the world asserting two directional lanes on the one street
 * whose whole width the lesson grades as a shared surface. The «20» numerals
 * are untouched — they carry т. 2, which т. 1 does not dissolve.
 *
 * ── W42: THE EDGE LINES WENT TOO, AND THIS FILE'S OWN SENTENCE ABOUT THEM WAS
 *    WRONG ABOUT WHERE THEY ARE. It used to read „the kerb-side edge lines are
 *    untouched — they carry … the pavement boundary". Measured off the shipped
 *    builder, `pz-e-zone` has halfWidth 8.125 m and parkingM 0, so the kerb
 *    face is at ±8.125 and the М1 line at travelHalf − EDGE_LINE_INSET_M =
 *    ±7.625: half a metre INSIDE the kerb, on the carriageway. It is not the
 *    pavement boundary, it is a 15.25 m vehicle corridor drawn down a 16.25 m
 *    shared surface — the same claim the centre line was making, at the other
 *    edge, and the one the judge's crop names („two continuous white lines").
 *    `EDGE_LINE_CLASSES` already refuses it for a `living_street`; pe-zone
 *    spells its home zone as the чл. 62 TAG on a `residential` class, so the
 *    ruling could not reach the one district it was written for. Both halves
 *    are now pinned separately below rather than as one delta.
 *
 * WHY THE SWEEP AND NOT ONE DISTRICT: the repair is worth exactly as much as
 * its blast radius is small, and „one edge in the catalogue" is a fact about
 * today's data, not a guarantee. This file measures it every run, so a district
 * that acquires the tag later shows up here instead of silently losing its
 * lane lines — and pe-zone losing the tag shows up here instead of silently
 * getting the boulevard back.
 * =============================================================================
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { District } from "../../types";
import { analyzeNetwork } from "../network";
import { buildMarkings, calmedZoneKeepsWholeWidth } from "../markings";

const WORLD_DIR = resolve(__dirname, "../../../../../../public/world");

function load(id: string): District {
  return JSON.parse(readFileSync(resolve(WORLD_DIR, `${id}.json`), "utf8")) as District;
}

const ALL_IDS = readdirSync(WORLD_DIR)
  .filter((n) => n.endsWith(".json"))
  .map((n) => n.replace(/\.json$/, ""));

describe("calmedZoneKeepsWholeWidth · only чл. 62's zone, and only it", () => {
  it("is the residential zone and nothing else", () => {
    expect(calmedZoneKeepsWholeWidth({ zone: "residential" })).toBe(true);
    // Speed regimes on an ordinary carriageway: their lanes still mean what
    // they say, and чл. 62 is not about them.
    expect(calmedZoneKeepsWholeWidth({ zone: "school" })).toBe(false);
    expect(calmedZoneKeepsWholeWidth({ zone: "thirty" })).toBe(false);
    // 105 of the 106 districts, and the answer that keeps them byte-identical.
    expect(calmedZoneKeepsWholeWidth({})).toBe(false);
    expect(calmedZoneKeepsWholeWidth({ zone: null })).toBe(false);
  });

  it("the catalogue's blast radius is the one street the row is filed on", () => {
    const tagged: string[] = [];
    for (const id of ALL_IDS) {
      for (const e of load(id).roads.edges) {
        if (calmedZoneKeepsWholeWidth(e)) tagged.push(`${id}:${e.id}`);
      }
    }
    expect(ALL_IDS.length).toBeGreaterThan(100);
    expect(tagged).toEqual(["pe-zone-v1:pz-e-zone"]);
  });
});

describe("…and it is WIRED — the paint actually changes", () => {
  /** The builder's own census for one district. */
  function census(id: string) {
    const d = load(id);
    return buildMarkings(d, analyzeNetwork(d), new Set(), new Set(), []);
  }

  it("the home-zone street loses its lane division and keeps everything else", () => {
    const m = census("pe-zone-v1");
    // The «20» road numerals survive — they are чл. 62 т. 2 on the carriageway
    // and they are the loudest thing the road itself says about this zone.
    expect(m.speedGlyphQuads).toBeGreaterThan(0);
    // The two things the row's `what` names that this file never painted here,
    // pinned so the refutation cannot be re-filed against markings.ts.
    expect(m.laneArrowQuads).toBe(0);
    expect(m.parkingBays).toBe(0);
    // And the division is GONE. The control re-labels the same edge `"thirty"`
    // — a speed regime, not чл. 62's zone — and changes nothing else: the
    // glyph painter's own gate is `edge.zone !== undefined`, so the «20»
    // numerals are byte-identical across the pair and the ONLY delta is the
    // centre line. (Deleting the tag instead would have taken the glyphs with
    // it and compared two different districts — which is how the first draft
    // of this assertion read backwards.)
    const d = load("pe-zone-v1");
    const asBoulevard = {
      ...d,
      roads: {
        ...d.roads,
        edges: d.roads.edges.map((e) =>
          e.id === "pz-e-zone" ? { ...e, zone: "thirty" as const } : e,
        ),
      },
    } as District;
    const boulevard = buildMarkings(
      asBoulevard,
      analyzeNetwork(asBoulevard),
      new Set(),
      new Set(),
      [],
    );
    expect(boulevard.speedGlyphQuads).toBe(m.speedGlyphQuads);
    expect(boulevard.markingQuads).toBeGreaterThan(m.markingQuads);
    // The delta is TWO named things and nothing else, so a third one appearing
    // in it cannot hide inside a single magic number:
    //   · the two-way centre line over the zone edge's drawn length  10 quads
    //   · the two М1 carriageway edge lines, one quad per side        2 quads
    // `zoneEdgeOnly` re-measures each half by rebuilding the district with
    // that half's cause removed, so the split is the builder's answer rather
    // than this file's arithmetic.
    expect(m.markingQuads).toBe(boulevard.markingQuads - 12);
    // …and the edge-line half on its own: give the SAME tagged district a
    // class the edge-line set does not carry, and the boulevard control loses
    // exactly the two quads this repair removes from the home zone.
    const asLivingStreet = {
      ...asBoulevard,
      roads: {
        ...asBoulevard.roads,
        edges: asBoulevard.roads.edges.map((e) =>
          e.id === "pz-e-zone" ? { ...e, class: "living_street" } : e,
        ),
      },
    } as District;
    const noEdgeLines = buildMarkings(
      asLivingStreet,
      analyzeNetwork(asLivingStreet),
      new Set(),
      new Set(),
      [],
    );
    expect(noEdgeLines.markingQuads).toBe(boulevard.markingQuads - 2);
  });

  it("every other district paints exactly what it painted before", () => {
    // The byte-identity half. A predicate that answers `false` everywhere it
    // is asked cannot have moved a quad, so this asserts the ASK rather than
    // re-deriving the geometry: no untagged edge reaches the new branch.
    for (const id of ALL_IDS) {
      if (id === "pe-zone-v1") continue;
      for (const e of load(id).roads.edges) {
        expect(calmedZoneKeepsWholeWidth(e), `${id}:${e.id}`).toBe(false);
      }
    }
  });
});
