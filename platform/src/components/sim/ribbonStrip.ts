/**
 * ribbonStrip — the shared ground-ribbon MESH BUILDER, extracted from A7's
 * RouteGuidance so the Scenario Studio trace ribbons (ShadowCar paths,
 * doc 76 §4) draw with the exact same machinery: a preallocated indexed
 * triangle strip (2 verts per centerline sample) whose vertices carry
 * arclength (`aS`) and side (`aSide`) attributes for the band shaders.
 *
 * The MATH here is byte-identical to the pre-extraction RouteGuidance
 * fillRibbon — its behavior (and tests) must not change. Shaders stay with
 * their owners: A7 keeps its head-fade chevron shader, ShadowCar has a
 * whole-path variant.
 */

import * as THREE from "three";

export interface RibbonBuffers {
  positions: Float32Array;
  aS: Float32Array;
  aSide: Float32Array;
  index: Uint16Array;
}

/** Flat-array polyline view the writer consumes: [x0, y0, x1, y1, …] district
 *  coords + cumulative arclengths, `count` valid samples (the DerivedRoute
 *  and tracePathForRibbon layouts). */
export interface RibbonPath {
  pts: Float32Array;
  arc: Float32Array;
  count: number;
}

/** Preallocate the vertex/index buffers for a ribbon of up to `maxSamples`
 *  centerline samples. */
export function createRibbonBuffers(maxSamples: number): RibbonBuffers {
  const positions = new Float32Array(maxSamples * 2 * 3);
  const aS = new Float32Array(maxSamples * 2);
  const aSide = new Float32Array(maxSamples * 2);
  for (let i = 0; i < maxSamples; i++) {
    aSide[i * 2] = -1;
    aSide[i * 2 + 1] = 1;
  }
  const index = new Uint16Array((maxSamples - 1) * 6);
  for (let i = 0; i < maxSamples - 1; i++) {
    const v = i * 2;
    const o = i * 6;
    index[o] = v;
    index[o + 1] = v + 1;
    index[o + 2] = v + 2;
    index[o + 3] = v + 1;
    index[o + 4] = v + 3;
    index[o + 5] = v + 2;
  }
  return { positions, aS, aSide, index };
}

/**
 * Write a district-space path into the ribbon's preallocated attribute
 * buffers: per-sample tangent from neighbors (clamped at the ends), left
 * normal offset by `halfWidthM`, district (x, y) → three (x, `y`, −y),
 * draw range set to the live sample count. Never frustum-culled (a huge
 * static bound stops three recomputing one).
 */
export function writeRibbonStrip(
  geo: THREE.BufferGeometry,
  path: RibbonPath,
  y: number,
  halfWidthM: number,
): void {
  const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
  const sAttr = geo.getAttribute("aS") as THREE.BufferAttribute;
  const positions = posAttr.array as Float32Array;
  const arcAttr = sAttr.array as Float32Array;
  const { pts, arc, count } = path;
  for (let i = 0; i < count; i++) {
    const x = pts[i * 2];
    const yD = pts[i * 2 + 1];
    // Tangent from neighbors (clamped at the ends), left normal = (-ty, tx).
    const i0 = i > 0 ? i - 1 : i;
    const i1 = i < count - 1 ? i + 1 : i;
    let tx = pts[i1 * 2] - pts[i0 * 2];
    let ty = pts[i1 * 2 + 1] - pts[i0 * 2 + 1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty * halfWidthM;
    const ny = tx * halfWidthM;
    // district (x, y) → three (x, y-up, −y)
    const v = i * 2;
    positions[v * 3] = x + nx;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = -(yD + ny);
    positions[v * 3 + 3] = x - nx;
    positions[v * 3 + 4] = y;
    positions[v * 3 + 5] = -(yD - ny);
    arcAttr[v] = arc[i];
    arcAttr[v + 1] = arc[i];
  }
  geo.setDrawRange(0, (count - 1) * 6);
  posAttr.needsUpdate = true;
  sAttr.needsUpdate = true;
  if (!geo.boundingSphere) geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
}
