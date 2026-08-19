/**
 * Standing-water decals (SURFACE-PATCH visibility slice) — the `waterPatch`
 * zone spans finally SHOW the puddle the physics rig floats on (doc 72 §13
 * AC-07-full „Аквапланинг"). Until now the spans only dropped grip
 * (runtime/surface.ts): the founder-visible symptom was "the water works but
 * nothing is visible".
 *
 * `icePatch` spans stay INVISIBLE by design — black ice you cannot see IS the
 * AC-08 lesson. This builder renders water ONLY.
 *
 * Pure data pass, additive by construction: a district without valid
 * waterPatch spans yields ZERO quads, so every shipped patch-less map builds
 * byte-identical geometry (the zoneSigns/decals contract).
 *
 * Geometry: per span, a flat quad strip swept along the host edge's polyline
 * across [fromM, toM] — one quad per overlapped segment, merged into ONE mesh
 * per district (one draw call, zero per-frame cost). The sheet spans the FULL
 * travel carriageway (halfWidth − parking band = lanes × LANE_WIDTH_M / 2),
 * matching the physics rect EXACTLY (runtime/surface.ts: "standing water
 * covers the whole exposed roadway") — the visible water must sit where grip
 * actually drops, minus a small edge inset so miter scaling on curves never
 * pushes water past the asphalt.
 *
 * Validity gate MIRRORS resolveSurfaceGripPatches (runtime/surface.ts): a
 * span the physics drops (bad range, missing/malformed patchGripFactor or
 * aquaplaneAboveKmh, unknown edge) must not paint a puddle that doesn't bite.
 *
 * ---------------------------------------------------------------------------
 * IF YOU ARRIVED HERE BECAUSE THE WATER IS INVISIBLE IN A FRAME: IT IS NOT
 * THIS FILE. Read this before opening the builder (sweep161, 2026-08-20).
 *
 * `sc-ac-aquaplane` was filed as „the lesson's own hazard is invisible …
 * the waterPatch exists only as physics; NOTHING IS DRAWN", suspect-file this
 * module. The second half of that sentence is false, and it was measured, not
 * argued: running this builder over the SHIPPED `ac-aqua-v1` document emits
 *
 *   1 quad · x ∈ [−7.875, +7.875] m · district y ∈ [240, 280]
 *
 * against a physics rect of x 0 ± 8.125, y 260 ± 20 (`resolveSurfaceGripPatches`
 * on the same document) — i.e. the sheet is 40 m long, 15.75 m wide, sits
 * squarely under the driving line (both `ac-aqua` spawns are x = 4.06) and
 * covers the grip patch to within the authored 0.25 m edge inset. The
 * „shipped surface maps" battery in `__tests__/water-decals.test.ts` pins that
 * footprint against BOTH the physics resolver and the driving line, so the
 * claim above is checkable rather than a comment.
 *
 * WHAT IS ACTUALLY WRONG IS THE MATERIAL, and it is in
 * `world/components/StaticWorld.tsx` — the `geometries.waterDecals` mesh:
 * `color 0x0d141b`, `opacity 0.4`, `roughness 0.12`, `metalness 0.55`,
 * `envMapIntensity={ROAD_ENV_INTENSITY}`. Every one of those numbers is a DRY
 * -asphalt tuning, and standing water is only ever shown on a soaked road: a
 * few lines above it in the same component the rain response darkens the
 * asphalt albedo to 0.6× and drops its roughness 1.0 → 0.5. A dark translucent
 * gloss laid over an already dark, already glossy surface has almost no
 * contrast left to spend, which is what the frames show — over 40 sampled
 * `pc-right` frames the largest luminance step anywhere on the carriageway is
 * a fixed-screen-row fog gradient, and no band tracks the world.
 *
 * The geometry cannot fix that; only the shading can. Routed there.
 * ---------------------------------------------------------------------------
 */

import type { District } from "../types";
import { ROAD_Y } from "./constants";
import { add, mul, polylineFrames, polylineLength, trimPolyline, type Vec2 } from "./math2d";
import { MeshAccumulator, toWorld, UP } from "./mesh";
import type { RoadNetwork } from "./network";

/** Water sits above the paint (MARKING_Y = ROAD_Y + 0.012) so the sheet
 *  covers lane lines; StaticWorld's polygonOffset kills the residual
 *  z-fighting at grazing cockpit angles. */
export const WATER_DECAL_Y = ROAD_Y + 0.02;
/** Keep the sheet inside the asphalt: polylineFrames' miter scaling can push
 *  the offset strip slightly past the ribbon edge on curved spans. */
export const WATER_DECAL_EDGE_INSET_M = 0.25;
/** Spans shorter than this paint nothing (degenerate data). */
const MIN_SPAN_M = 0.5;

export interface WaterDecalBuildResult {
  water: MeshAccumulator;
  /** Emitted quads (one per polyline segment a span overlaps). */
  count: number;
}

/** The physics-side validity gate, mirrored (see module header). */
function isPhysicsLiveWaterSpan(zone: {
  fromM: number;
  toM: number;
  patchGripFactor?: number;
  aquaplaneAboveKmh?: number;
}): boolean {
  if (!(Number.isFinite(zone.fromM) && Number.isFinite(zone.toM))) return false;
  if (!(zone.fromM >= 0 && zone.fromM < zone.toM)) return false;
  const grip = zone.patchGripFactor;
  if (!(typeof grip === "number" && Number.isFinite(grip) && grip > 0 && grip < 1)) return false;
  const gate = zone.aquaplaneAboveKmh;
  if (!(typeof gate === "number" && Number.isFinite(gate) && gate > 0)) return false;
  return true;
}

/**
 * One merged puddle mesh per district. Output order follows the authored
 * zones order — deterministic, data-driven, seed-free.
 */
export function buildWaterDecals(district: District, network: RoadNetwork): WaterDecalBuildResult {
  const acc = new MeshAccumulator();
  let count = 0;
  const zones = district.zones;
  if (!zones || zones.length === 0) return { water: acc, count };

  for (const zone of zones) {
    if (zone.kind !== "waterPatch") continue; // ice stays invisible BY DESIGN
    if (!isPhysicsLiveWaterSpan(zone)) continue;
    const eb = network.edgeById.get(zone.edgeId);
    if (!eb) continue; // unknown edge — ignore (forward compat contract)
    const g = eb.edge.geometry as Vec2[];
    if (g.length < 2) continue;
    const total = polylineLength(g);
    const from = Math.max(0, Math.min(zone.fromM, total));
    const to = Math.max(0, Math.min(zone.toM, total));
    if (to - from < MIN_SPAN_M) continue;

    // Sub-polyline across the span (keeps interior vertices, exact endpoints).
    const line = trimPolyline(g, from, total - to, MIN_SPAN_M / 2);
    if (!line) continue;

    // Travel carriageway only — the parking band stays dry (physics width).
    const half = eb.halfWidth - eb.parkingM - WATER_DECAL_EDGE_INSET_M;
    if (half <= 0) continue;

    const frames = polylineFrames(line);
    const spanLen = to - from;
    const left: number[] = [];
    const right: number[] = [];
    let s = 0;
    for (let i = 0; i < line.length; i++) {
      const p = line[i] as Vec2;
      const f = frames[i]!;
      if (i > 0) s += Math.hypot(p[0] - line[i - 1]![0], p[1] - line[i - 1]![1]);
      const v = spanLen > 0 ? s / spanLen : 0;
      const l = add(p, mul(f.right, -half * f.miter));
      const r = add(p, mul(f.right, half * f.miter));
      left.push(acc.vertex(toWorld(l[0], l[1], WATER_DECAL_Y), UP, [0, v]));
      right.push(acc.vertex(toWorld(r[0], r[1], WATER_DECAL_Y), UP, [1, v]));
    }
    // District-CCW (left→right→right'→left') faces UP after world mapping.
    for (let i = 0; i + 1 < line.length; i++) {
      acc.quad(left[i]!, right[i]!, right[i + 1]!, left[i + 1]!);
      count++;
    }
  }

  return { water: acc, count };
}
