/**
 * THE WORLD'S RIM — the frontage that finally marks where the authored world
 * stops, on every side, on every map.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS ANSWERS, in the words of the frames it was filed from.
 *
 * "the entire windscreen is a flat green plane meeting a hazy grey band at the
 * horizon — no road, no kerb, no lane marking, no building, no street furniture
 * of any kind" (sc-junction-blind). "the asphalt, kerbs, markings, buildings,
 * trees and parked cars all stop at a hard edge and the car spends the
 * remaining ~160 s crossing a bare green/grey plane under an empty horizon …
 * THE REAR-VIEW MIRROR INSET SIMULTANEOUSLY STILL RENDERS THE CITY"
 * (sc-vu-emergency-junction). "the world simply runs out and the car keeps
 * going" (sc-junction-gap). "beyond the priority road the world stops: flat
 * green field and a mountain haze band, no far-side street, no buildings, no
 * pavement" (sc-junction-left).
 *
 * The mirror sentence is the tell, and it is why every one of those rows is ONE
 * defect rather than four: the city does not vanish, the car LEAVES it. The
 * drawn world is exactly `bounds ± TERRAIN_MARGIN_M` (the census in
 * `runtime/district.ts` — 60 m past the last road on 64 of the 105 committed
 * districts, 60–78 m on the rest), and past that rim the only thing under the
 * wheels is `environment/groundBackdropShader.ts`'s 480 m camera-following
 * disc. That disc is the horizon; it is not a world, it holds nothing, and
 * nothing marked the line where one became the other.
 *
 * WHAT THIS BUILDS. A contiguous belt of building masses just inside that rim,
 * on all four sides, so the line is a THING the student can see from anywhere
 * on the map and cannot drive through. Not a fence and not a painted backdrop:
 * a city edge, which is what actually bounds a Sofia driving lesson.
 *
 * WHY BUILDING VOLUMES — the same three reasons `terminus.ts` and
 * `buildWorldGeometry.lotEnclosure` give, unchanged:
 *   · the four facade meshes and the roof mesh are drawn on EVERY district
 *     already, so a volume routed through `buildBuildings`' `extraVolumes` seam
 *     costs +0 draw calls and ~26 triangles;
 *   · the same loop merges its walls into `colliders.buildings`, so this is an
 *     edge a car is stopped by rather than scenery it drives through;
 *   · it authors nothing. `district.buildings` and `stats.buildings` are
 *     untouched; the runtime, the lessons and the traces never see a new
 *     building.
 *
 * WHAT IT IS NOT, so nobody reads it as done:
 *   · It is not a grading rule. Nothing here books a fault, and the collider it
 *     contributes is the SAME collider every блок on the map already has.
 *   · It does not move `districtWorldEdge`. That rectangle is still where the
 *     GROUND ends; this belt stands ~17 m inside it, which is the number the
 *     rim warning's lead time is now measured against (`runtime/district.ts`).
 *   · It draws no kerb, no pavement and no marking out there. Those are
 *     `roads.ts`' passes and they are gated on the road network, which by
 *     definition has nothing this far out.
 *
 * MEASURED over all 105 committed district-v1 documents before it was written
 * (so the guards below are sized from data, not taste): no road polyline leaves
 * its own declared bounds on ANY of them, so the nearest centreline to the
 * belt's nominal inner face is 42.0 m — three and a half times
 * TERMINUS_CLOSE_ROAD_CLEAR_M — and the nearest spawn point is 37.9 m. The
 * guard that DOES bite is the building one: the T-junction maps author a
 * streetwall reaching 43.8 m past `maxY`, which is inside the belt, and there
 * the belt stands down and the authored block is the edge instead.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { District, DistrictBuilding } from "../types";
import {
  TERMINUS_CLOSE_BUILDING_CLEAR_M,
  TERMINUS_CLOSE_DEPTH_M,
  TERMINUS_CLOSE_MAX_HEIGHT_M,
  TERMINUS_CLOSE_MIN_HEIGHT_M,
  TERMINUS_CLOSE_ROAD_CLEAR_M,
  TERRAIN_MARGIN_M,
  isMotorwayCarriageway,
  WORLD_RIM_BANK_HEIGHT_M,
  WORLD_RIM_HEIGHT_STEPS,
  WORLD_RIM_MIN_DEPTH_M,
  WORLD_RIM_SPAN_M,
  WORLD_RIM_STEP_M,
  WORLD_RIM_TERRAIN_INSET_M,
} from "./constants";
import { hashString, SegmentGrid, type Vec2 } from "./math2d";
import type { RoadNetwork } from "./network";
import { frontageHeightM } from "./terminus";

type Aabb = [number, number, number, number];

/** Which side of the district a mass belongs to. Part of its id, so the
 *  facade variant / tint hash differs around the belt. */
export type WorldRimSide = "n" | "s" | "e" | "w";

/**
 * Outward offset, m, of the belt's OUTER face from the declared bounds — i.e.
 * the drawn ground's half-extent less the keep-in. Exported because
 * `runtime/district.ts` documents the student's warned approach against it and
 * the rim test measures it; deriving it twice is how the two drift.
 */
export const WORLD_RIM_OUTER_M = TERRAIN_MARGIN_M - WORLD_RIM_TERRAIN_INSET_M;
/** Outward offset, m, of the belt's NOMINAL inner face. Masses may step
 *  further in by up to WORLD_RIM_STEP_M; none ever steps out. */
export const WORLD_RIM_INNER_M = WORLD_RIM_OUTER_M - TERMINUS_CLOSE_DEPTH_M;

const aabbOf = (ring: readonly Vec2[]): Aabb => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }
  return [minX, minY, maxX, maxY];
};

/** hash → [0, 1). One stream, keyed by the mass id, so the belt is stable
 *  across rebuilds and identical in the capture rig and the drill. */
const hash01 = (key: string): number => (hashString(key) % 1024) / 1024;

/**
 * One run of the belt, split into a whole number of masses of ~WORLD_RIM_SPAN_M.
 *
 * `along` is the axis the run travels; `out` is the perpendicular the depth is
 * measured on. Each mass is emitted as a rect in (along, out) and mapped back
 * by the caller, so all four runs share one splitter and one guard.
 */
interface RunSpec {
  side: WorldRimSide;
  /** Run extent along its own axis, district metres. */
  a0: number;
  a1: number;
  /** Signed outward offsets of the inner / outer faces on the perpendicular. */
  inner: number;
  outer: number;
  /** (along, out) → district (x, y). */
  toXY: (a: number, o: number) => Vec2;
  /** An AABB's extent on the run's own axis — [along0, along1]. */
  along: (t: Aabb) => [number, number];
  /** How far OUT of the district that AABB reaches on the perpendicular, m.
   *  Negative for anything inside the declared box. */
  reach: (t: Aabb) => number;
}

/**
 * The belt for one district, as synthetic footprints for `buildBuildings`'
 * `extraVolumes` pass — in a stable order (n, s, e, w; each run low → high).
 *
 * `standing` is every mass already on the map: the authored footprints PLUS the
 * terminus closures and lot enclosure accepted earlier in the same build. Where
 * one of them already occupies part of the band, the rim mass there is pushed
 * OUT behind it rather than stood down — see the note at the clip loop for the
 * measurement that says why refusing is wrong.
 *
 * Returns `[]` on a degenerate box (zero or negative span on either axis), the
 * one shape this pass declines rather than guesses at.
 */
export function buildWorldRim(
  district: District,
  network: RoadNetwork,
  standing: readonly { footprint?: readonly (readonly [number, number])[] }[],
): DistrictBuilding[] {
  // AUTHORED MICRO-MAPS ONLY — every district that declares a `mapKind`
  // (102 `scenario-*` + `poligon-v1`), and neither of the two OSM extracts.
  //
  // This is terminus.ts's line, drawn for terminus.ts's reason: „a city / exam
  // / полигон district's boundary ends are the edge of an OSM extract, not a
  // street that stops". `district-v1` and `d2-v1` ARE Sofia, carry its ODbL
  // attribution on the glass, and their box is a CUT through a city whose
  // streets and blocks genuinely continue past it. A belt of invented frontage
  // there would not mark the end of the world; it would assert something false
  // about a real place, and it would put 220 masses and ~8.7 k triangles into
  // the very street-wall budget `d2-district.test.ts` exists to hold.
  //
  // SO THE TWO CITY MAPS KEEP THE DEFECT, and that is said plainly rather than
  // quietly: `runtime/district.ts`'s census covers all 105, a student who
  // drives far enough off-road on `district-v1` still finds the rim of the
  // ground, and no frame in the w11 sweep is on either map. A city edge is a
  // second question (a river, a ring road, a treeline — not a wall) and it is
  // not answered here.
  if (typeof district.meta.mapKind !== "string") return [];

  const b = district.meta.boundsLocalMeters;
  // Normalised for the reason `districtWorldEdge` normalises: `parseDistrict`
  // accepts an inverted box, and padding one literally yields a belt with
  // negative span that wraps the wrong way round the world.
  const minX = Math.min(b.minX, b.maxX);
  const maxX = Math.max(b.minX, b.maxX);
  const minY = Math.min(b.minY, b.maxY);
  const maxY = Math.max(b.minY, b.maxY);
  if (!(maxX - minX > 1) || !(maxY - minY > 1)) return [];

  const IN = WORLD_RIM_INNER_M;
  const OUT = WORLD_RIM_OUTER_M;

  // North and south runs carry the CORNERS (they span the full padded X
  // extent); east and west run only between them, butting at the nominal inner
  // face. That is what makes the belt closed: there is no diagonal through a
  // corner that misses both runs.
  const runs: RunSpec[] = [
    {
      side: "n",
      a0: minX - OUT,
      a1: maxX + OUT,
      inner: IN,
      outer: OUT,
      toXY: (a, o) => [a, maxY + o],
      along: (t) => [t[0], t[2]],
      reach: (t) => t[3] - maxY,
    },
    {
      side: "s",
      a0: minX - OUT,
      a1: maxX + OUT,
      inner: IN,
      outer: OUT,
      toXY: (a, o) => [a, minY - o],
      along: (t) => [t[0], t[2]],
      reach: (t) => minY - t[1],
    },
    {
      side: "e",
      a0: minY - IN,
      a1: maxY + IN,
      inner: IN,
      outer: OUT,
      toXY: (a, o) => [maxX + o, a],
      along: (t) => [t[1], t[3]],
      reach: (t) => t[2] - maxX,
    },
    {
      side: "w",
      a0: minY - IN,
      a1: maxY + IN,
      inner: IN,
      outer: OUT,
      toXY: (a, o) => [minX - o, a],
      along: (t) => [t[1], t[3]],
      reach: (t) => minX - t[0],
    },
  ];

  const roadGrid = new SegmentGrid(24);
  for (const eb of network.edges) roadGrid.addPolyline(eb.edge.geometry as Vec2[]);

  const baseHeight = frontageHeightM(district);

  // ── WAVE 8, EDIT 1 — THE MASS ID CARRIES ITS DISTRICT ────────────────────
  //
  // sc-ac-ice:86eab7e9 (major): «sc-ac-aquaplane, sc-ac-ice and sc-ac-bridge-ice
  // still render the same stretch of street — the same mid-rise block facades,
  // the same tree line and the same unbroken kerbside parked-car row.»
  //
  // The id used to be `world-rim-${side}-${i}` with NO district in it, and
  // THREE separate hashes are keyed off it: `hash01('rim-depth:' + id)` below,
  // `hashString('rim-height:' + id)` below that, and — through
  // `buildings.ts` — `facadeVariant(b.id, …)`. ac-ice-v1, ac-night-v1 and
  // ac-rain-v1 declare the IDENTICAL bounds box (−28.12, 0, 14.125, 360), so
  // they split their runs identically, drew the same masses at the same depths
  // and the same heights, and skinned them with the same facade variants. The
  // three lessons were photographed as one street because, outside the 1–19
  // buildings each map authors, they WERE one street.
  //
  // The district id is the one term that distinguishes them, and every other
  // derived id in this module family already carries one. Nothing else in the
  // tree matches on this string — measured: the only references to
  // „world-rim" outside this file are three comments.
  const districtKey = district.meta.district;

  // ── WAVE 8, EDIT 2 — A МАГИСТРАЛА IS NOT WALLED BY SIX-STOREY BLOCKS ─────
  //
  // sc-mw-emergency-lane: «it does not read as a магистрала»; its sister row
  // sc-ac-truck-spray:c042440d was photographed as «an urban street lined with
  // apartment blocks on both sides» — on a map that authors ONE building over
  // 2,606 m of motorway. Every other block face in those frames is this belt,
  // which reads the bounds and the road polylines and never asked what kind of
  // road it was closing in.
  //
  // A rim belongs on every map (that is the defect this builder answers, and it
  // is not being undone) — but what stands at the edge of a motorway is an
  // embankment or a noise bank, not a city block. So the KIND follows the road:
  // a district with no street-class carriageway at all gets a low continuous
  // bank instead of a 9–22 m frontage. It still closes the world and still
  // stops a car, which are the two things the belt is for.
  //
  // THE PREDICATE IS THE MODULE'S OWN. `isMotorwayCarriageway` is what every
  // B65 dressing pass already asks before it puts a lamp or a parapet on a
  // магистрала (props.ts `dressesAsStreet`), so this uses the same question
  // rather than a second definition of „motorway". A map with ANY non-motorway
  // carriageway keeps the city belt — mw-exit-v1 is exactly that case (its ramp
  // runs into a street, and its 9 lamps / 25 parapet panels in the furniture
  // budget say the street is dressed), so only the pure motorway segments move.
  //
  // NOT DONE, and named rather than guessed at: the RURAL half. ov-crest-v1's
  // «Учебен извънградски път» is `unclassified`, which dresses as a street
  // everywhere else in this module, so widening the test to it would re-dress
  // every residential micro-map in the catalogue on the same line. That needs a
  // per-district „rural" term the documents do not carry yet.
  const urbanRim = network.edges.some((eb) => eb.line && !isMotorwayCarriageway(eb.edge));
  // Everything already standing on the map. The belt's OWN masses are
  // deliberately never added to this list, and that is the difference between a
  // belt and a picket fence: adjacent masses SHARE AN EDGE by construction, so
  // a clearance test that saw them would refuse every second one — measured, on
  // the first run of this builder, as `n-0, n-2, n-4, n-6` with 34 m of open
  // horizon between each. Two runs meeting at a corner may intersect by up to
  // WORLD_RIM_STEP_M for the same reason, which is an L-shaped corner block and
  // not a defect.
  const blocked: Aabb[] = [];
  for (const s of standing) {
    if (!Array.isArray(s.footprint) || s.footprint.length < 3) continue;
    blocked.push(aabbOf(s.footprint as unknown as Vec2[]));
  }
  const out: DistrictBuilding[] = [];

  for (const run of runs) {
    const runLen = run.a1 - run.a0;
    if (!(runLen > 1)) continue;
    const n = Math.max(1, Math.round(runLen / WORLD_RIM_SPAN_M));
    for (let i = 0; i < n; i++) {
      const id = `world-rim-${districtKey}-${run.side}-${i}`;
      const a0 = run.a0 + (runLen * i) / n;
      const a1 = run.a0 + (runLen * (i + 1)) / n;
      // Only the INNER face steps; the outer stays flush so nothing can see
      // past the belt and the corner joins stay exact.
      let inner = run.inner - WORLD_RIM_STEP_M * hash01(`rim-depth:${id}`);
      // WHERE THE MAP ALREADY BUILT INTO THE BAND, THE BELT STANDS BEHIND IT —
      // it is not stood DOWN. Refusing was the first cut of this pass and it is
      // wrong for one measured reason: the T-junction maps author a streetwall
      // reaching 43.8 m past `maxY` whose blocks are 22–26 m long against a
      // 33 m rim span, so every refusal left a hole WIDER than the block that
      // caused it — on tj-rhr-v1 a ray due north from the east spawn walked
      // straight out through the 2.6 m of daylight past `sw-tj-e-e-l3`. Pushing
      // the inner face out instead keeps the belt continuous and still never
      // grows a rim mass out of the street's own last block.
      for (const t of blocked) {
        const [t0, t1] = run.along(t);
        if (!(t0 - TERMINUS_CLOSE_BUILDING_CLEAR_M < a1 && t1 + TERMINUS_CLOSE_BUILDING_CLEAR_M > a0))
          continue;
        const reach = run.reach(t);
        if (reach + TERMINUS_CLOSE_BUILDING_CLEAR_M <= inner) continue;
        inner = reach + TERMINUS_CLOSE_BUILDING_CLEAR_M;
      }
      // No room left for a block: the authored mass that took the band IS the
      // edge here, and a wafer of wall behind it is not a second one.
      if (run.outer - inner < WORLD_RIM_MIN_DEPTH_M) continue;
      const ring: Vec2[] = [
        run.toXY(a0, inner),
        run.toXY(a1, inner),
        run.toXY(a1, run.outer),
        run.toXY(a0, run.outer),
      ];
      const box = aabbOf(ring);

      // THE COLLIDER GUARD, over the whole rectangle on a 4 m lattice — the
      // terminus closure's rule verbatim, because this thing stops a car for
      // the same reason. On the committed catalogue it never fires: no road
      // polyline leaves its own declared bounds on any of the 105 documents, so
      // the deepest a mass can step (inner face at WORLD_RIM_INNER_M −
      // WORLD_RIM_STEP_M = 37 m past the box) is still three times
      // TERMINUS_CLOSE_ROAD_CLEAR_M clear of the nearest centreline. It exists
      // so a future map that authors a box tighter than its own network cannot
      // brick up a street — and `world-rim.test.ts` §1 re-measures it over the
      // whole catalogue rather than trusting this paragraph.
      let clear = true;
      const nu = Math.max(1, Math.ceil((box[2] - box[0]) / 4));
      const nv = Math.max(1, Math.ceil((box[3] - box[1]) / 4));
      for (let u = 0; u <= nu && clear; u++) {
        for (let v = 0; v <= nv && clear; v++) {
          const p: Vec2 = [
            box[0] + ((box[2] - box[0]) * u) / nu,
            box[1] + ((box[3] - box[1]) * v) / nv,
          ];
          if (
            roadGrid.distanceTo(p, TERMINUS_CLOSE_ROAD_CLEAR_M + 1) < TERMINUS_CLOSE_ROAD_CLEAR_M
          ) {
            clear = false;
          }
        }
      }
      if (!clear) continue;

      const step = WORLD_RIM_HEIGHT_STEPS[
        hashString(`rim-height:${id}`) % WORLD_RIM_HEIGHT_STEPS.length
      ]!;
      // The bank is FLAT and unhashed on purpose: a stepped silhouette is what
      // makes a city edge read as buildings, and an embankment that steps like
      // a street of blocks would be the same lie in a lower key.
      const heightM = urbanRim
        ? Math.min(
            TERMINUS_CLOSE_MAX_HEIGHT_M,
            Math.max(TERMINUS_CLOSE_MIN_HEIGHT_M, baseHeight * step),
          )
        : WORLD_RIM_BANK_HEIGHT_M;
      out.push({
        id,
        // `heightSource: "height"` so `resolveBuildingHeightM` takes this
        // number instead of hashing a 15–25 m default out of the id — the
        // exact contract mismatch `lessonWorldRecipe`'s header measured on
        // `pkd-b-garage` (authored 4 m, built 18.27 m).
        height: heightM,
        heightSource: "height",
        footprint: ring.map((p) => [p[0], p[1]] as [number, number]),
      });
    }
  }
  return out;
}
