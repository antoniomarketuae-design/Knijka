/**
 * EVERY authored `railCrossing` band builds a deck — DISCOVERED, not listed.
 *
 * THE FINDING THIS EXISTS FOR (sweep-161, sc-pk-rail-ban, pc-right, critical):
 * „There is no level crossing in the world … no rails, no barrier, no А34 sign
 * and no crossing surface. content/world/pk-rail-v1.json does carry a
 * railCrossing zone — the data is there and nothing draws it."
 *
 * The last clause is FALSE, and this lane settled it on pixels rather than on
 * the builder's own word: `public/gallery-stills/sc__sc-pk-rail-ban.webp` is a
 * shipped render of THIS district through the same DistrictWorld → StaticWorld
 * the lesson mounts, and a scan across the band at its mid-row reads
 *
 *     asphalt 104,98,93 · ballast 116,106,98 · sleeper 94,85,72 · rail 123,113,116
 *
 * alternating on a ~14 px period whose 8 px : 6 px split is SLEEPER_SPACING_M
 * 1.5 : SLEEPER_WIDTH_M 0.6 to within a pixel. The deck, the ten ties, the two
 * rails, the barrier arm and the kerbside post are all on screen. What the
 * sweep frames actually show is a car that averaged 5.2 км/ч for 198 s over 40
 * stills (its own RUN.log), i.e. a camera question, not a drawing one.
 *
 * SO WHY A NEW BATTERY. Because the thing that was genuinely unguarded is the
 * SHAPE of that scare: a district can author a crossing and silently draw
 * nothing, and `buildRailTracks` has FOUR paths that do exactly that without a
 * word — unknown `edgeId`, `geometry.length < 2`, a span clamped under
 * MIN_SPAN_M by an edge shorter than `toM`, and `halfWidth <= inset`. The two
 * existing batteries pin FOUR MAP IDS BY HAND (`rail-track.test.ts`'s
 * ["rx-unguarded-v1","rx-guarded-v1","rx-drop-v1"] loop and
 * `pk-rail-crossing-drawn.test.ts`'s single id), so map number five inherits no
 * coverage at all — and „owned is not opened" is the failure this whole audit
 * keeps paying for.
 *
 * This battery therefore takes NO list. It walks `public/world/*.json`, and for
 * every railCrossing zone it finds anywhere, asserts a deck that reaches the
 * renderer and lands on the authored band.
 *
 * THE BAND CHECK IS ORIENTATION-SENSITIVE ON PURPOSE. Every rail map shipped
 * today runs due north, so district y happens to equal arclength and a bound
 * written as `y ∈ [fromM, toM]` would pass — and would then FAIL an east-west
 * rail street that is perfectly correct. A false refusal is as expensive here
 * as a false pass. So each vertex is resolved in the span's OWN (along, across)
 * frame. A radius from the band centre would have been the other trap: radius
 * is rotation-invariant, so a deck laid at 90° to its own road would sail
 * through it.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildWorldGeometry } from "../buildWorldGeometry";
import { perpRight, pointAlong, polylineLength, type Vec2 } from "../math2d";
import { analyzeNetwork } from "../network";
import {
  buildRailTracks,
  RAIL_DECK_EDGE_INSET_M,
  RAIL_HEAD_Y,
  SLEEPER_SPACING_M,
} from "../railTrack";
import { assertDistrict, type District, type DistrictZone } from "../../types";

const WORLD_DIR = path.join(process.cwd(), "public/world");

/** Every shipped district that authors at least one railCrossing band. */
function railDistricts(): { id: string; district: District; zones: DistrictZone[] }[] {
  const out: { id: string; district: District; zones: DistrictZone[] }[] = [];
  for (const file of fs.readdirSync(WORLD_DIR)) {
    if (!file.endsWith(".json")) continue;
    const district = assertDistrict(
      JSON.parse(fs.readFileSync(path.join(WORLD_DIR, file), "utf8")),
    );
    const zones = (district.zones ?? []).filter((z) => z.kind === "railCrossing");
    if (zones.length > 0) out.push({ id: file.replace(/\.json$/, ""), district, zones });
  }
  return out;
}

const RAIL_DISTRICTS = railDistricts();

describe("every authored railCrossing band is actually built", () => {
  // The discovery itself is an assertion: a refactor that stops finding the
  // zones would otherwise turn this whole file into a green no-op — the exact
  // vacuum (`expect(Object.keys(stats)).not.toContain("track")`) that let the
  // original claim stand unmeasured for a month.
  it("finds the rail maps at all", () => {
    expect(RAIL_DISTRICTS.length).toBeGreaterThanOrEqual(4);
    expect(RAIL_DISTRICTS.map((d) => d.id)).toContain("pk-rail-v1");
  });

  for (const { id, district, zones } of RAIL_DISTRICTS) {
    it(`${id}: each of its ${zones.length} band(s) draws deck + rails, on the band`, () => {
      const network = analyzeNetwork(district);
      const rail = buildRailTracks(district, network);

      // Quads are counted per span from the span's OWN geometry, so a silently
      // skipped span is a shortfall here rather than a pass.
      let expectedDeck = 0;
      for (const zone of zones) {
        const eb = network.edgeById.get(zone.edgeId);
        // The silent `!eb` path: an authored band on an edge that does not
        // exist draws nothing and says nothing.
        expect(eb, `${id}/${zone.id} names edge ${zone.edgeId}`).toBeDefined();
        const geometry = eb!.edge.geometry as Vec2[];
        expect(geometry.length).toBeGreaterThanOrEqual(2);
        // The silent clamp path: `fromM`/`toM` are clamped to the edge length,
        // so a band authored past the end collapses to zero and is skipped.
        expect(polylineLength(geometry)).toBeGreaterThanOrEqual(zone.toM);
        // And the silent `halfW <= 0` path: an edge narrower than the kerb
        // inset yields a non-positive half-width and the whole span is dropped.
        const halfW = eb!.halfWidth - RAIL_DECK_EDGE_INSET_M;
        expect(halfW).toBeGreaterThan(0);
        expectedDeck += 1 + Math.max(1, Math.floor((2 * halfW) / SLEEPER_SPACING_M));
      }
      expect(rail.deckQuads).toBe(expectedDeck); // 1 ballast band + N ties per span
      expect(rail.railQuads).toBe(zones.length * 6); // 2 rails × (top + 2 sides)

      // It must survive to the renderer, not just to the builder: StaticWorld
      // gates both meshes on `positions.count > 0`.
      const world = buildWorldGeometry(district, { seed: 7 });
      expect(world.stats.railTrackQuads).toBe(rail.deckQuads + rail.railQuads);
      expect(world.railTracks.deck.positions.length).toBe(rail.deckQuads * 4 * 3);
      expect(world.railTracks.rails.positions.length).toBe(rail.railQuads * 4 * 3);

      // Every emitted vertex must fall inside SOME authored span, resolved in
      // that span's own travel frame. A deck drawn 200 m from the crossing it
      // grades — or square across it — is as useless as no deck, and passes
      // every count-based check ever written.
      const frames = zones.map((zone) => {
        const geometry = network.edgeById.get(zone.edgeId)!.edge.geometry as Vec2[];
        const halfW = network.edgeById.get(zone.edgeId)!.halfWidth - RAIL_DECK_EDGE_INSET_M;
        const { point, tangent } = pointAlong(geometry, (zone.fromM + zone.toM) / 2);
        return {
          centre: point,
          along: tangent,
          across: perpRight(tangent),
          alongHalf: (zone.toM - zone.fromM) / 2,
          acrossHalf: halfW,
        };
      });
      const inSomeBand = (x: number, y: number): boolean =>
        frames.some((f) => {
          const dx = x - f.centre[0];
          const dy = y - f.centre[1];
          const along = dx * f.along[0] + dy * f.along[1];
          const across = dx * f.across[0] + dy * f.across[1];
          return Math.abs(along) <= f.alongHalf + 1e-3 && Math.abs(across) <= f.acrossHalf + 1e-3;
        });
      for (const positions of [world.railTracks.deck.positions, world.railTracks.rails.positions]) {
        expect(positions.length).toBeGreaterThan(0);
        for (let i = 0; i + 2 < positions.length; i += 3) {
          // world = (x, height, −y)
          const x = positions[i]!;
          const y = -positions[i + 2]!;
          expect(
            inSomeBand(x, y),
            `${id}: rail vertex at district (${x.toFixed(3)}, ${y.toFixed(3)}) lies outside every authored band`,
          ).toBe(true);
          // Stacked above the paint and never above the rail crown: a deck
          // buried under the asphalt renders exactly like no deck at all.
          const h = positions[i + 1]!;
          expect(h).toBeGreaterThan(0);
          expect(h).toBeLessThanOrEqual(RAIL_HEAD_Y + 1e-9);
        }
      }
    });
  }
});
