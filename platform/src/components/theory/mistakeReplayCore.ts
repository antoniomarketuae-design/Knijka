/**
 * MistakeReplay playback core — the pure math behind the theory page's mini
 * mistake-movie (THEO Stage 1, doc 64 THEO-2 side panel).
 *
 * No React, no DOM: fit math, playhead stepping, event-marker timing and
 * defensive district/trace derivation live here so the canvas component
 * stays thin and the logic is node-testable. Interpolation is NOT reimplemented
 * — sampleAt/activeAnnotationIndex come from the sim traces barrel (the same
 * code the 3D ghost player runs), so the 2D replay can never drift from it.
 */

import { buildMinimapPolylines } from "@/components/sim/lessonMinimap";
import type { MinimapPolyline } from "@/modules/sim/hud";
import {
  activeAnnotationIndex,
  createTracePoint,
  sampleAt,
  traceAnnotations,
  type ScenarioTrace,
  type TraceEvent,
} from "@/modules/sim/traces";

// ---------------------------------------------------------------------------
// Fit math (world meters, x east / y north → canvas px, y DOWN — north up)
// ---------------------------------------------------------------------------

export interface ReplayBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ReplayView {
  /** Pixels per meter. */
  scale: number;
  /** canvasX = scale * worldX + offsetX */
  offsetX: number;
  /** canvasY = offsetY - scale * worldY (north renders up) */
  offsetY: number;
  widthPx: number;
  heightPx: number;
}

/** Zoom clamps, px per meter — same readability rationale as MistakeMap's
 *  fitMapTransform: a 4-meter stall drill must not fill the whole canvas,
 *  a cross-district drive must stay visible. */
export const REPLAY_MAX_SCALE = 4;
export const REPLAY_MIN_SCALE = 0.05;

/** Bounding box of the trace's ground path. */
export function traceBounds(trace: ScenarioTrace): ReplayBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of trace.samples) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Fit `bounds` into a canvas, centered, aspect preserved, margin kept clear. */
export function fitReplayView(
  bounds: ReplayBounds,
  widthPx: number,
  heightPx: number,
  marginPx = 14,
): ReplayView {
  if (widthPx <= 0 || heightPx <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0, widthPx, heightPx };
  }
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const usableW = Math.max(widthPx - 2 * marginPx, 1);
  const usableH = Math.max(heightPx - 2 * marginPx, 1);
  const raw = Math.min(usableW / spanX, usableH / spanY);
  const scale = Math.min(REPLAY_MAX_SCALE, Math.max(REPLAY_MIN_SCALE, raw));
  return {
    scale,
    offsetX: (widthPx - scale * (bounds.minX + bounds.maxX)) / 2,
    offsetY: (heightPx + scale * (bounds.minY + bounds.maxY)) / 2,
    widthPx,
    heightPx,
  };
}

export function replayToCanvas(view: ReplayView, x: number, y: number): [number, number] {
  return [view.scale * x + view.offsetX, view.offsetY - view.scale * y];
}

// ---------------------------------------------------------------------------
// Playhead (auto-play, loop, ~1x)
// ---------------------------------------------------------------------------

/** Largest single rAF step, sec — a background-tab return must not teleport. */
export const REPLAY_MAX_STEP_SEC = 0.25;

/** Hold on the final frame before looping (the closing annotation gets read). */
export const REPLAY_END_HOLD_SEC = 1.4;

/**
 * Advance the playhead by `dtSec` (clamped to [0, REPLAY_MAX_STEP_SEC]);
 * wraps to 0 once `durationSec + endHoldSec` is crossed.
 */
export function advancePlayhead(
  tSec: number,
  dtSec: number,
  durationSec: number,
  endHoldSec = REPLAY_END_HOLD_SEC,
): number {
  const base = Number.isFinite(tSec) && tSec > 0 ? tSec : 0;
  const dt = Math.min(Math.max(dtSec, 0), REPLAY_MAX_STEP_SEC);
  const t = base + dt;
  return t >= durationSec + endHoldSec ? 0 : t;
}

// ---------------------------------------------------------------------------
// Event markers (violation moments = the trace's authored annotations)
// ---------------------------------------------------------------------------

/** An annotation event located on the ground path (extends TraceEvent so the
 *  traces barrel's activeAnnotationIndex consumes it unchanged). */
export interface ReplayMarker extends TraceEvent {
  x: number;
  y: number;
  /** Stored Bulgarian teach copy — NEVER generated ("" when absent). */
  labelBg: string;
}

/** Locate every annotation on the path via the shared sampleAt interpolation. */
export function annotationMarkers(trace: ScenarioTrace): ReplayMarker[] {
  const p = createTracePoint();
  return traceAnnotations(trace).map((e) => {
    sampleAt(trace, e.tSec, p);
    return { ...e, x: p.x, y: p.y, labelBg: e.textBg ?? "" };
  });
}

/** Index of the marker whose label should show at tSec (lingers a few
 *  seconds — the ghost player's annotation-card semantics). -1 = none. */
export function activeMarkerIndex(
  markers: readonly ReplayMarker[],
  tSec: number,
  windowSec = 4,
): number {
  return activeAnnotationIndex(markers, tSec, windowSec);
}

/** Red-flash pulse length at the violation moment, sec. */
export const REPLAY_FLASH_SEC = 1.4;

/** Index of the marker currently flashing (fired within flashSec). -1 = none.
 *  Markers are tSec-ascending, so the last hit wins. */
export function flashIndex(
  markers: readonly ReplayMarker[],
  tSec: number,
  flashSec = REPLAY_FLASH_SEC,
): number {
  let hit = -1;
  for (let i = 0; i < markers.length; i++) {
    if (markers[i].tSec > tSec) break;
    if (tSec - markers[i].tSec <= flashSec) hit = i;
  }
  return hit;
}

/** Flash intensity 0..1: 1 at the event, linear decay to 0 at flashSec. */
export function flashAlpha(markerTSec: number, tSec: number, flashSec = REPLAY_FLASH_SEC): number {
  const dt = tSec - markerTSec;
  if (dt < 0 || dt > flashSec) return 0;
  return 1 - dt / flashSec;
}

// ---------------------------------------------------------------------------
// Reduced-motion step-through (static frames instead of animation)
// ---------------------------------------------------------------------------

/** Two stops closer than this merge into one (a marker at t=0 or t=end must
 *  not produce a duplicate step). */
const STEP_MERGE_EPS_SEC = 0.3;

/** The step-through stops: start, every marker moment, the final frame. */
export function stepTimes(trace: ScenarioTrace, markers: readonly ReplayMarker[]): number[] {
  const raw = [0, ...markers.map((m) => m.tSec), trace.meta.durationSec].sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of raw) {
    if (out.length === 0 || t - out[out.length - 1] > STEP_MERGE_EPS_SEC) out.push(t);
  }
  return out;
}

/** Marker sitting exactly at a step stop (label for that static frame). */
export function markerAtStep(
  markers: readonly ReplayMarker[],
  stepTSec: number,
): ReplayMarker | null {
  for (const m of markers) {
    if (Math.abs(m.tSec - stepTSec) <= STEP_MERGE_EPS_SEC) return m;
  }
  return null;
}

// ---------------------------------------------------------------------------
// District derivation (defensive — never trust fetched JSON, the store.ts law)
// ---------------------------------------------------------------------------

interface DrawableEdge {
  geometry: Array<[number, number]>;
  class?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function finitePair(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    typeof v[0] === "number" &&
    Number.isFinite(v[0]) &&
    typeof v[1] === "number" &&
    Number.isFinite(v[1])
  );
}

/**
 * Road polylines of a fetched district JSON — the LessonScene minimap
 * derivation (buildMinimapPolylines) behind a defensive parse: malformed
 * edges are dropped, a district with nothing drawable degrades to null
 * (caller hides the replay section, never draws NaN).
 */
export function districtRoadPolylines(raw: unknown): MinimapPolyline[] | null {
  if (!isRecord(raw) || !isRecord(raw.roads) || !Array.isArray(raw.roads.edges)) return null;
  const edges: DrawableEdge[] = [];
  for (const e of raw.roads.edges) {
    if (!isRecord(e) || !Array.isArray(e.geometry)) continue;
    const geometry: Array<[number, number]> = [];
    for (const p of e.geometry) {
      if (finitePair(p)) geometry.push([p[0], p[1]]);
    }
    if (geometry.length >= 2) {
      edges.push(typeof e.class === "string" ? { geometry, class: e.class } : { geometry });
    }
  }
  if (edges.length === 0) return null;
  return buildMinimapPolylines({ roads: { edges } });
}

export interface ReplayPoint {
  x: number;
  y: number;
}

/** Pedestrian-crossing marks of a fetched district JSON (cheap context dots);
 *  junk entries are skipped, absence degrades to []. */
export function crossingPointsOf(raw: unknown): ReplayPoint[] {
  if (!isRecord(raw) || !Array.isArray(raw.crossings)) return [];
  const out: ReplayPoint[] = [];
  for (const c of raw.crossings) {
    if (
      isRecord(c) &&
      typeof c.x === "number" &&
      Number.isFinite(c.x) &&
      typeof c.y === "number" &&
      Number.isFinite(c.y)
    ) {
      out.push({ x: c.x, y: c.y });
    }
  }
  return out;
}
