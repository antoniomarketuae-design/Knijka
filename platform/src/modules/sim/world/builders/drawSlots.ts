/**
 * WHAT THE STATIC WORLD MOUNTS — counted from the placement data, never from a
 * number typed into a comment.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * `buildWorldGeometry` used to publish `drawCallEstimate`, and the number
 * inside it was `13 + 27 + CITY_MODELS.length + a few conditionals`. The `27`
 * was a hand-written tally of the fixed WorldProps instanced draws. It had
 * already drifted: `WorldProps.tsx` documented **28** (the B35 lens-glass pass
 * was added and only one of the two places was updated), and NEITHER number
 * counted the pedestrian-signal trio at all. Two prose tallies of the same
 * thing will always disagree eventually; the fix is to stop writing the tally
 * down and count the data that decides it.
 *
 * Every term below is gated on the list that makes WorldProps mount that mesh
 * (`world.busStops.length > 0`, one entry per present sign kind, one per
 * present tree kind, …), so a district that plants no billboards is no longer
 * charged four draws for them, and a district that gains a new prop family
 * gains its slots automatically.
 *
 * ── WHAT THIS NUMBER IS NOT ────────────────────────────────────────────────
 * It is NOT the draw calls in a frame, and it must never be scored against
 * `PERF_BUDGETS[tier].drawCalls`. It has no term for the hero car, the
 * cockpit, the level-1 aids, NPC traffic, pedestrians, the sky dome, weather,
 * the mirror pass or the composer — because none of those are static world
 * geometry, which is all this file can see. Measured on the running product
 * (my own raw WebGL counter, `/dev/drive-rig`, tier low, level 1) the static
 * world is 26–41 % of the real frame, and the correlation between this number
 * and the measured frame across 37 districts is r = 0.37 — nearly none.
 *
 * The frame question is answered in `sim/environment/frameCost.ts`, which
 * enumerates every subsystem and is checked against measurements.
 */

import type {
  SignKind,
  StaticTransform,
  TrafficLightPlacement,
  TreeKind,
  TreePlacement,
  WorldGeometry,
} from "../types";
import { CITY_MODELS } from "./cityBuildings";

/** One family of static draws, and how many mesh slots it mounts. */
export interface DrawSlotTerm {
  id: string;
  slots: number;
}

/**
 * Sign kinds whose plate carries no texture: the crossbuck and the barrier
 * body are geometry only, so they mount a body and no face.
 */
const GEOMETRY_ONLY_SIGN_KINDS: readonly SignKind[] = ["railCross", "barrier"];

export interface StaticDrawSlotInput {
  trafficLights: readonly TrafficLightPlacement[];
  signCounts: Readonly<Record<SignKind, number>>;
  streetlights: readonly StaticTransform[];
  trees: readonly TreePlacement[];
  billboards: readonly { size: "large" | "small" }[];
  busStops: readonly StaticTransform[];
  parkingKits: readonly StaticTransform[];
  utilityPoles: readonly { spanM: number }[];
  railings: readonly StaticTransform[];
  /** Merged static surfaces the world builder itself emits (roads, terrain…). */
  staticMeshes: number;
  /** Authored city-kit models, one instanced group per model. */
  cityModels: number;
  /** Conditional single-mesh surfaces: water sheet, rail deck+rails, island. */
  waterSheet: boolean;
  railDeck: boolean;
  roundaboutIsland: boolean;
}

/**
 * The furniture pass derives four lists from the streetlight run with modulo
 * gates (`i % 9`, `i % 7`, `i % 5`), so a street with three lamps mounts fewer
 * than four families. Mirrors `WorldProps.furniturePlacements` exactly — if
 * that changes, this over-counts, which is the safe direction for a ceiling.
 */
function furnitureFamilies(streetlightCount: number): number {
  let n = 0;
  for (const [step, phase] of [
    [9, 0],
    [9, 4],
    [7, 3],
    [5, 2],
  ] as const) {
    for (let i = 0; i < streetlightCount; i++) {
      if (i % step === phase) {
        n += 1;
        break;
      }
    }
  }
  return n;
}

/** Count the static world's mesh slots, term by term. */
export function staticDrawSlotTerms(input: StaticDrawSlotInput): DrawSlotTerm[] {
  const terms: DrawSlotTerm[] = [];
  const add = (id: string, slots: number) => {
    if (slots > 0) terms.push({ id, slots });
  };

  add("static-surfaces", input.staticMeshes);
  add("city-models", input.cityModels);
  add("water-sheet", input.waterSheet ? 1 : 0);
  add("rail-deck", input.railDeck ? 2 : 0);
  add("roundabout-island", input.roundaboutIsland ? 1 : 0);

  // Signals: housing + lens glass + lit lamps, per head family that exists.
  const vehicleHeads = input.trafficLights.filter((l) => l.head !== "pedestrian").length;
  const pedHeads = input.trafficLights.length - vehicleHeads;
  add("signals-vehicle", vehicleHeads > 0 ? 3 : 0);
  add("signals-pedestrian", pedHeads > 0 ? 3 : 0);

  // Signs: body + face per present kind; crossbuck/barrier are body only.
  let signSlots = 0;
  for (const [kind, count] of Object.entries(input.signCounts) as [SignKind, number][]) {
    if (count === 0) continue;
    signSlots += GEOMETRY_ONLY_SIGN_KINDS.includes(kind) ? 1 : 2;
  }
  add("signs", signSlots);

  add("streetlights", input.streetlights.length > 0 ? 2 : 0);
  add("furniture", furnitureFamilies(input.streetlights.length));

  const treeKinds = new Set<TreeKind>();
  for (const t of input.trees) treeKinds.add(t.kind);
  add("trees", treeKinds.size);

  const billboardSizes = new Set<string>();
  for (const b of input.billboards) billboardSizes.add(b.size);
  add("billboards", billboardSizes.size * 2);

  add("bus-stops", input.busStops.length > 0 ? 2 : 0);
  add("parking-kits", input.parkingKits.length > 0 ? 1 : 0);
  add("utility-poles", input.utilityPoles.length > 0 ? 2 : 0);
  add("pavement-parapet", input.railings.length > 0 ? 1 : 0);

  return terms;
}

/** Sum of `staticDrawSlotTerms`. */
export function countStaticDrawSlots(input: StaticDrawSlotInput): number {
  return staticDrawSlotTerms(input).reduce((sum, t) => sum + t.slots, 0);
}

/**
 * Recover the slot input from a finished world, so a test can ask „what would
 * this district cost WITHOUT its parapet" without rebuilding it, and so the
 * builder's own published number can be independently recomputed. A test
 * asserts the two agree on every shipped district — which is the check that
 * keeps this derivation and `buildWorldGeometry`'s call site from drifting
 * apart the way the old 27 and 28 did.
 */
export function staticDrawSlotInputFromWorld(world: WorldGeometry): StaticDrawSlotInput {
  return {
    trafficLights: world.trafficLights,
    signCounts: world.stats.signs,
    streetlights: world.streetlights,
    trees: world.trees,
    billboards: world.billboards,
    busStops: world.busStops,
    parkingKits: world.parkingKits,
    utilityPoles: world.utilityPoles,
    railings: world.railings,
    staticMeshes: 13,
    cityModels: CITY_MODELS.length,
    waterSheet: world.waterDecals.positions.length > 0,
    railDeck: world.railTracks.deck.positions.length > 0,
    roundaboutIsland: world.roundaboutIslands.positions.length > 0,
  };
}
