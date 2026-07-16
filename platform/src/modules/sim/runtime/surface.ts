/**
 * sim/runtime — SURFACE GRIP PATCHES (the AQUAPLANE + ICE slice; doc 72 §13
 * AC-07-full standing-water float / AC-08 ice band).
 *
 * The `waterPatch` / `icePatch` district zone spans (district.ts) are the
 * ONLY zone kinds consumed by the PHYSICS RIG instead of the rule-engine
 * tick: worldRuntime ignores them (unknown-kind tolerance — no tick channel
 * exists), while this file turns them into district-space RECTS the rig can
 * test the chassis against per physics substep:
 *
 *   LessonScene:  resolveSurfaceGripPatches(district)  → SurfaceGripPatch[]
 *   VehicleRig:   surfacePatchGripAt(patches, x, y, v) → factor per substep
 *                 → VehicleSim.setSurfaceGripFactor(min(lessonBase, factor))
 *
 * Composition law: the patch factor composes with the lesson's base grip by
 * MIN — most restrictive wins (the LessonScene condition-factor discipline).
 * A wet lesson (base 0.7) over a 0.15 water patch runs 0.15 inside the span
 * and 0.7 outside; a dry lesson over an ice patch runs 1 outside, 0.15 on
 * the ice — the map data alone carries the hazard (sc-ac-ice authors NO
 * physics flag at all).
 *
 * Tolerance (the curveAdvisory discipline, A12): unknown edge ids, degenerate
 * spans, and absent/malformed patchGripFactor (or aquaplaneAboveKmh on a
 * waterPatch) drop the WHOLE span — a data slip must never fling the live
 * car. A district without the kinds resolves to [] and the rig's patch
 * branch never runs (the additive/bit-identity law — VehicleSim's setter is
 * then never called).
 *
 * Geometry: a span [fromM, toM] of arclength along the host edge's polyline
 * (the same s-measure every other zone kind uses) becomes one oriented rect
 * per overlapped polyline segment (the shipped straight micro-maps yield
 * exactly one). The rect spans the FULL carriageway width of the host edge
 * (lanes × LANE_WIDTH_M) — standing water / ice covers the whole exposed
 * roadway, both direction banks (doc 72: the flooded dip, the icy bridge).
 */

import { LANE_WIDTH_M } from "./spatial";

/** One resolved patch rect, district space (x = east, y = north). */
export interface SurfaceGripPatch {
  /** Rect centre. */
  x: number;
  y: number;
  /** District heading of the rect's LENGTH axis (0 = north, cw-positive). */
  headingDeg: number;
  halfLengthM: number;
  /** Full carriageway half-width of the host edge. */
  halfWidthM: number;
  /** Surface grip inside the rect, fraction of dry (0.05..1). */
  gripFactor: number;
  /**
   * waterPatch only: the patch bites at/above this speed (km/h) and is inert
   * below it (the tyre evacuates the water again). Absent = bites at ANY
   * speed (ice).
   */
  aquaplaneAboveKmh?: number;
}

/**
 * Structural input — deliberately narrower than either District type so both
 * the runtime's (runtime/district.ts) and the world renderer's
 * (world/types.ts) parsed documents satisfy it without cross-module casts.
 */
export interface SurfacePatchSource {
  roads: {
    edges: ReadonlyArray<{
      id: string;
      lanes: number;
      geometry: [number, number][];
    }>;
  };
  zones?: ReadonlyArray<{
    kind: string;
    edgeId: string;
    fromM: number;
    toM: number;
    patchGripFactor?: number;
    aquaplaneAboveKmh?: number;
  }>;
}

/** The setter-side clamp band (VehicleSim.setSurfaceGripFactor mirrors it). */
const PATCH_GRIP_MIN = 0.05;

/**
 * Resolve every VALID waterPatch/icePatch span of a district into rects.
 * Pure + deterministic; [] for every map without the kinds (all shipped
 * pre-slice maps — the FP battery proves it).
 */
export function resolveSurfaceGripPatches(district: SurfacePatchSource): SurfaceGripPatch[] {
  const out: SurfaceGripPatch[] = [];
  const zones = district.zones ?? [];
  if (zones.length === 0) return out;
  const edgeById = new Map(district.roads.edges.map((e) => [e.id, e]));
  for (const z of zones) {
    if (z.kind !== "waterPatch" && z.kind !== "icePatch") continue;
    // Span sanity (the worldRuntime ban-zone gate, mirrored).
    if (!(Number.isFinite(z.fromM) && Number.isFinite(z.toM) && z.fromM >= 0 && z.fromM < z.toM)) {
      continue;
    }
    // patchGripFactor REQUIRED and sane — else the whole span is inert (A12).
    const grip = z.patchGripFactor;
    if (!(typeof grip === "number" && Number.isFinite(grip) && grip > 0 && grip < 1)) continue;
    // waterPatch additionally REQUIRES its float-speed gate.
    let aquaplaneAboveKmh: number | undefined;
    if (z.kind === "waterPatch") {
      const gate = z.aquaplaneAboveKmh;
      if (!(typeof gate === "number" && Number.isFinite(gate) && gate > 0)) continue;
      aquaplaneAboveKmh = gate;
    }
    const edge = edgeById.get(z.edgeId);
    if (!edge || !Array.isArray(edge.geometry) || edge.geometry.length < 2) continue;
    const halfWidthM = (Math.max(1, edge.lanes) * LANE_WIDTH_M) / 2;
    const gripFactor = Math.min(1, Math.max(PATCH_GRIP_MIN, grip));

    // Walk the polyline, clipping [fromM, toM] against each segment's
    // arclength window — one oriented rect per overlapped segment.
    let acc = 0;
    for (let i = 1; i < edge.geometry.length; i++) {
      const [x0, y0] = edge.geometry[i - 1];
      const [x1, y1] = edge.geometry[i];
      const segLen = Math.hypot(x1 - x0, y1 - y0);
      if (segLen < 1e-6) continue;
      const s0 = acc;
      const s1 = acc + segLen;
      acc = s1;
      const from = Math.max(z.fromM, s0);
      const to = Math.min(z.toM, s1);
      if (to <= from) continue;
      const tMid = ((from + to) / 2 - s0) / segLen;
      out.push({
        x: x0 + (x1 - x0) * tMid,
        y: y0 + (y1 - y0) * tMid,
        headingDeg: ((Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI + 360) % 360,
        halfLengthM: (to - from) / 2,
        halfWidthM,
        gripFactor,
        ...(aquaplaneAboveKmh !== undefined ? { aquaplaneAboveKmh } : {}),
      });
    }
  }
  return out;
}

/**
 * The per-substep query VehicleRig runs (zero allocation): the grip factor
 * the patches impose at district position (x, y) at |speedKmh| — 1 when no
 * patch bites (outside every rect, or inside a waterPatch below its float
 * speed), else the MIN of every biting patch's factor. The caller composes
 * the result with the lesson base grip by MIN and feeds
 * VehicleSim.setSurfaceGripFactor.
 *
 * The water speed-gate is INTENTIONALLY live in both directions: a car that
 * slows below aquaplaneAboveKmh WHILE inside the span regains grip — below
 * the float speed the tread evacuates the water again (the doc-72 physics;
 * this is also why the taught duty — slow BEFORE the water — genuinely
 * works: the ~55 km/h transit never floats at all).
 */
export function surfacePatchGripAt(
  patches: readonly SurfaceGripPatch[],
  x: number,
  y: number,
  speedKmh: number,
): number {
  let grip = 1;
  const speed = Math.abs(speedKmh);
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i];
    if (p.aquaplaneAboveKmh !== undefined && speed < p.aquaplaneAboveKmh) continue;
    const h = (p.headingDeg * Math.PI) / 180;
    const ax = Math.sin(h); // length axis (district heading convention)
    const ay = Math.cos(h);
    const dx = x - p.x;
    const dy = y - p.y;
    const along = dx * ax + dy * ay;
    if (along > p.halfLengthM || along < -p.halfLengthM) continue;
    const lateral = dx * ay - dy * ax;
    if (lateral > p.halfWidthM || lateral < -p.halfWidthM) continue;
    if (p.gripFactor < grip) grip = p.gripFactor;
  }
  return grip;
}
