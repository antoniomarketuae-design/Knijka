/**
 * sim/runtime — minimap model builder + 2D canvas viewport math.
 *
 * Pure data + pure math; the HUD owns the <canvas> and draws. World space is
 * district meters (x east, y north); canvas space is pixels, y DOWN. All
 * transforms here bake in the y-flip so north renders up.
 *
 * Typical HUD usage:
 *   const map = buildMinimap(district);                  // once
 *   const vp = fitViewport(map.bounds, w, h, 8);         // static overview
 *   // or: followViewport(vehicle.position, 220, w, h);  // scrolling minimap
 *   ctx.lineWidth = road.widthM * vp.scale; …            // draw polylines
 *   const [cx, cy] = worldToCanvas(vp, v.x, v.y);
 *   ctx.translate(cx, cy); ctx.rotate(vehicleMarkerRotationRad(headingDeg));
 */

import type { District, DistrictBounds } from "./district";
import { simplifyPolyline } from "./geometry";
import { CLASS_RANK, LANE_WIDTH_M } from "./spatial";

export type MinimapRoadGroup = "arterial" | "collector" | "local" | "service";

export interface MinimapRoad {
  edgeId: string;
  group: MinimapRoadGroup;
  /** Real carriageway width — scale by viewport for stroke width. */
  widthM: number;
  /** Simplified polyline, flat [x0, y0, x1, y1, …] world meters. */
  points: Float32Array;
}

export interface MinimapPoint {
  x: number;
  y: number;
}

export interface MinimapData {
  bounds: DistrictBounds;
  roads: MinimapRoad[];
  /** Signalized intersection nodes (lamp dots). */
  signals: MinimapPoint[];
  /** Pedestrian crossings that sit on drivable edges. */
  crossings: MinimapPoint[];
  spawnPoints: MinimapPoint[];
}

export interface BuildMinimapOptions {
  /** Douglas–Peucker tolerance, meters (default 2 — invisible at map scale). */
  simplifyToleranceM?: number;
  /** Drop service-class edges (parking aisles clutter small maps). Default keep. */
  includeService?: boolean;
}

function groupOf(cls: string): MinimapRoadGroup {
  const rank = CLASS_RANK[cls] ?? 2;
  if (rank >= 4) return "arterial";
  if (rank === 3) return "collector";
  if (cls === "service") return "service";
  return "local";
}

export function buildMinimap(district: District, options: BuildMinimapOptions = {}): MinimapData {
  const tol = options.simplifyToleranceM ?? 2;
  const includeService = options.includeService ?? true;

  const roads: MinimapRoad[] = [];
  for (const edge of district.roads.edges) {
    if (!includeService && edge.class === "service") continue;
    const simplified = simplifyPolyline(edge.geometry, tol);
    const points = new Float32Array(simplified.length * 2);
    for (let i = 0; i < simplified.length; i++) {
      points[i * 2] = simplified[i][0];
      points[i * 2 + 1] = simplified[i][1];
    }
    roads.push({
      edgeId: edge.id,
      group: groupOf(edge.class),
      widthM: Math.max(1, edge.lanes) * LANE_WIDTH_M,
      points,
    });
  }

  const edgeIds = new Set(district.roads.edges.map((e) => e.id));
  return {
    bounds: { ...district.meta.boundsLocalMeters },
    roads,
    signals: district.intersections.filter((i) => i.signalized).map((i) => ({ x: i.x, y: i.y })),
    crossings: district.crossings
      .filter((c) => c.edgeId !== null && edgeIds.has(c.edgeId))
      .map((c) => ({ x: c.x, y: c.y })),
    spawnPoints: district.spawnPoints.map((s) => ({ x: s.x, y: s.y })),
  };
}

// ---------------------------------------------------------------------------
// Viewport transforms (world meters → canvas pixels, y-flip baked in)
// ---------------------------------------------------------------------------

export interface MinimapViewport {
  /** Pixels per meter. */
  scale: number;
  /** canvasX = scale * worldX + offsetX */
  offsetX: number;
  /** canvasY = offsetY - scale * worldY  (north up) */
  offsetY: number;
  widthPx: number;
  heightPx: number;
}

/** Fit `bounds` into a canvas, centered, preserving aspect ratio. */
export function fitViewport(
  bounds: DistrictBounds,
  widthPx: number,
  heightPx: number,
  paddingPx = 8,
): MinimapViewport {
  const bw = Math.max(1e-6, bounds.maxX - bounds.minX);
  const bh = Math.max(1e-6, bounds.maxY - bounds.minY);
  const scale = Math.min((widthPx - 2 * paddingPx) / bw, (heightPx - 2 * paddingPx) / bh);
  return {
    scale,
    offsetX: (widthPx - scale * (bounds.minX + bounds.maxX)) / 2,
    offsetY: (heightPx + scale * (bounds.minY + bounds.maxY)) / 2,
    widthPx,
    heightPx,
  };
}

/** Center the viewport on a world point showing `metersAcross` horizontally. */
export function followViewport(
  center: MinimapPoint,
  metersAcross: number,
  widthPx: number,
  heightPx: number,
): MinimapViewport {
  const scale = widthPx / Math.max(1e-6, metersAcross);
  return {
    scale,
    offsetX: widthPx / 2 - scale * center.x,
    offsetY: heightPx / 2 + scale * center.y,
    widthPx,
    heightPx,
  };
}

export function worldToCanvas(vp: MinimapViewport, x: number, y: number): [number, number] {
  return [vp.scale * x + vp.offsetX, vp.offsetY - vp.scale * y];
}

/** Allocation-free variant for per-frame marker updates. */
export function worldToCanvasX(vp: MinimapViewport, x: number): number {
  return vp.scale * x + vp.offsetX;
}

export function worldToCanvasY(vp: MinimapViewport, y: number): number {
  return vp.offsetY - vp.scale * y;
}

/**
 * Canvas rotation for the vehicle marker on a NORTH-UP map: heading is CW
 * from north, canvas rotation is CW from "up" (y-down flips handedness twice),
 * so the angle passes through unchanged — just in radians.
 */
export function vehicleMarkerRotationRad(headingDeg: number): number {
  return (headingDeg * Math.PI) / 180;
}

/**
 * Map rotation for a HEADING-UP minimap (vehicle marker stays fixed pointing
 * up; rotate the map context by this before drawing roads).
 */
export function headingUpMapRotationRad(headingDeg: number): number {
  return (-headingDeg * Math.PI) / 180;
}
