/**
 * Small three.js helpers shared by the world components (client side).
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MeshData, StaticTransform } from "../types";

/**
 * mergeGeometries() throws if some inputs are indexed and others are not
 * ("index attribute exists among all geometries, or in none of them"). Mixing
 * happens easily — most three.js primitives are indexed but a few operations
 * yield non-indexed geometry. This normalizes to non-indexed only when a mix
 * is detected (keeping the common all-indexed fast path) so the merge is
 * always valid.
 */
export function mergeSafe(
  geoms: THREE.BufferGeometry[],
  useGroups = false,
): THREE.BufferGeometry {
  const allIndexed = geoms.every((g) => g.index !== null);
  const noneIndexed = geoms.every((g) => g.index === null);
  if (allIndexed || noneIndexed) {
    const merged = mergeGeometries(geoms, useGroups);
    if (!merged) throw new Error("mergeSafe: mergeGeometries returned null");
    return merged;
  }
  const normalized = geoms.map((g) => (g.index !== null ? g.toNonIndexed() : g));
  const merged = mergeGeometries(normalized, useGroups);
  // Dispose the temporary conversions we created (originals disposed by caller).
  normalized.forEach((g, i) => {
    if (g !== geoms[i]) g.dispose();
  });
  if (!merged) throw new Error("mergeSafe: mergeGeometries returned null");
  return merged;
}

export function meshDataToGeometry(data: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(data.uvs, 2));
  if (data.colors) g.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
  g.setIndex(new THREE.BufferAttribute(data.indices, 1));
  g.computeBoundingSphere();
  return g;
}

const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpMat = new THREE.Matrix4();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * THE CULLING COMMENT THAT WAS HERE WAS WRONG, AND IT COST THE WHOLE PRODUCT.
 *
 * It read: „Instances span the whole district; the base geometry's bounding
 * sphere sits at the origin, so default frustum culling would drop them all",
 * and it set `frustumCulled = false` on every static prop in the game — trees,
 * signs, signals, streetlights, furniture, billboards, shelters.
 *
 * That is true of a plain Mesh. It is NOT true of an InstancedMesh in the three
 * this repo ships (r185): `InstancedMesh` declares its own `boundingSphere`
 * (`objects/InstancedMesh.js:100`), `computeBoundingSphere()` unions the base
 * sphere transformed by EVERY instance matrix (`:156-176`), and
 * `Frustum.intersectsObject` prefers `object.boundingSphere` over the
 * geometry's and computes it on demand when it is null (`math/Frustum.js:146-152`).
 * Default culling would therefore have been correct all along; disabling it
 * submitted every prop in the district to every camera on every frame.
 *
 * Measured cost of the workaround before it was removed (my own raw GL counter,
 * `/dev/drive-rig`, tier low, level 1, 1264×619): d2-v1 drew 891,372 tree
 * triangles per frame — 50.3 % of the whole frame — and the 256×96 rear-mirror
 * pass re-submitted the same unculled set for 24,576 pixels.
 *
 * `computeBoundingSphere()` is called eagerly rather than left to the first
 * cull test only so the cost lands during world build, not on frame one.
 */
export function createInstancedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transforms: readonly StaticTransform[],
  options: { castShadow?: boolean; receiveShadow?: boolean; name?: string } = {},
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  for (let i = 0; i < transforms.length; i++) {
    const t = transforms[i]!;
    tmpPos.set(t.position[0], t.position[1], t.position[2]);
    tmpQuat.setFromAxisAngle(Y_AXIS, t.yaw);
    const s = t.scale ?? 1;
    tmpScale.set(s, s, s);
    tmpMat.compose(tmpPos, tmpQuat, tmpScale);
    mesh.setMatrixAt(i, tmpMat);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = options.castShadow ?? false;
  mesh.receiveShadow = options.receiveShadow ?? false;
  if (options.name) mesh.name = options.name;
  // Static merged world: matrices never change.
  mesh.matrixAutoUpdate = false;
  enableInstancedCulling(mesh);
  return mesh;
}

/**
 * Turn on frustum culling for a built InstancedMesh, with the instance-aware
 * bounding sphere three needs to do it correctly. A zero-instance mesh keeps
 * an empty sphere, which never intersects — it is skipped before the renderer
 * ever looks at it, which is strictly better than the `count === 0` early-out
 * inside `WebGLBufferRenderer.renderInstances`.
 */
export function enableInstancedCulling(mesh: THREE.InstancedMesh): void {
  mesh.frustumCulled = true;
  mesh.computeBoundingSphere();
}

/**
 * ONE DISTRICT-WIDE INSTANCED MESH IS CULLABLE BUT NEVER CULLED.
 *
 * Enabling culling above fixes correctness; it does not by itself buy a frame,
 * because a single mesh holding 2,138 trees spread over a whole district has a
 * district-wide bounding sphere that a ground-level camera almost always
 * intersects. The set has to be broken into pieces small enough to fall
 * outside the frustum — the same treatment `CityBuildings` already gives its
 * towers on a 200 m grid.
 *
 * The trade is explicit and it is the reason this is not simply "chunk
 * everything": each visible chunk is its own draw call, so a grid that is too
 * fine buys triangles with draw calls, and draw calls are the axis this
 * product fails hardest on. Hence two guards —
 *   * sets below `CHUNK_MIN_INSTANCES` stay a single mesh (a bus-stop pair is
 *     not worth a grid), and
 *   * a set whose bounding box fits inside one cell stays a single mesh,
 * so a scenario district with 30 trees on one street is byte-for-byte the
 * frame it was before this change, and only genuinely district-spanning sets
 * pay the extra submissions.
 *
 * `chunkM` was chosen by measurement, not taste — see PROP_CHUNK_M.
 */

/**
 * 600 m, and here is the sweep that picked it. Every number below is d2-v1
 * (4,276 trees — the heaviest map in the product) on /dev/drive-rig at
 * 1264×619, counted with a raw WebGL counter, median of per-second window
 * means, 8 s per run. Baseline before any of this row's changes, measured
 * twice: 249.2–252.0 draws · 1,756,595–1,763,150 triangles at level 1.
 *
 *   chunk    L1 draws   L1 triangles      L3 draws   L3 triangles
 *   (base)      249.2      1,763,150         203.2      1,630,763
 *    220 m      281.4        915,909             —              —
 *    300 m      264.2      1,003,604             —              —
 *    400 m      245.7      1,046,833         219.0        983,148   ← +7.8 % draws at L3
 *    600 m      232.9      1,226,977         206.5      1,161,414
 *
 * THE 400 ROW IS WHY THIS IS 600. A finer grid keeps saving triangles, but each
 * visible chunk is its own submission, and at level 3 there is no ShadowCar
 * ghost whose double-draw fix pays for them — so 400 m came out 7.8 % WORSE on
 * draw calls than the code it replaced, on the heaviest map, for the rung most
 * students are actually on. 600 m is within noise of baseline there (+1.6 %)
 * and better than baseline at every other rung and tier measured, while still
 * removing 28–34 % of the triangles.
 *
 * The currency matters: doc 82 §2.1 derives the target phone's deficit as
 * draw-call submission, not shading headroom. A grid that buys triangles with
 * draw calls is spending the scarce one. 600 m is the largest cell that still
 * cuts the district into pieces a ground-level frustum can reject.
 */
export const PROP_CHUNK_M = 600;
/** Sets smaller than this are left whole; the grid cannot pay for itself. */
export const PROP_CHUNK_MIN_INSTANCES = 64;

/** Bucket transforms into a `chunkM` grid on XZ. Deterministic key order. */
export function chunkTransforms<T extends { position: readonly [number, number, number] }>(
  transforms: readonly T[],
  chunkM = PROP_CHUNK_M,
  minInstances = PROP_CHUNK_MIN_INSTANCES,
): T[][] {
  if (transforms.length < minInstances) return transforms.length > 0 ? [[...transforms]] : [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const t of transforms) {
    if (t.position[0] < minX) minX = t.position[0];
    if (t.position[0] > maxX) maxX = t.position[0];
    if (t.position[2] < minZ) minZ = t.position[2];
    if (t.position[2] > maxZ) maxZ = t.position[2];
  }
  if (maxX - minX <= chunkM && maxZ - minZ <= chunkM) return [[...transforms]];
  const cells = new Map<string, T[]>();
  for (const t of transforms) {
    const cx = Math.floor(t.position[0] / chunkM);
    const cz = Math.floor(t.position[2] / chunkM);
    const key = `${cx},${cz}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(t);
    else cells.set(key, [t]);
  }
  return [...cells.values()];
}

/**
 * `createInstancedMesh`, chunked: one cullable InstancedMesh per occupied
 * grid cell. Names are suffixed `-c<N>` so a frame counter can still attribute
 * them to the family.
 */
export function createChunkedInstancedMeshes(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transforms: readonly StaticTransform[],
  options: { castShadow?: boolean; receiveShadow?: boolean; name?: string; chunkM?: number } = {},
): THREE.InstancedMesh[] {
  const groups = chunkTransforms(transforms, options.chunkM ?? PROP_CHUNK_M);
  if (groups.length <= 1) {
    return [createInstancedMesh(geometry, material, transforms, options)];
  }
  return groups.map((g, i) =>
    createInstancedMesh(geometry, material, g, {
      ...options,
      name: options.name ? `${options.name}-c${i}` : undefined,
    }),
  );
}

/**
 * Instanced mesh where each instance is offset from a base transform —
 * used for traffic-light lamps (3 per head, colored per phase). Honors the
 * base's `scale` exactly like createInstancedMesh: both the child geometry
 * AND its local offset scale, so a scaled signal housing keeps its lenses
 * registered in the enlarged lamp windows (doc 62 S1 — the lesson-critical
 * prop prominence on scenario maps).
 */
export function createOffsetInstancedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  bases: readonly StaticTransform[],
  localOffsets: readonly [number, number, number][],
): THREE.InstancedMesh {
  const count = bases.length * localOffsets.length;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const offset = new THREE.Vector3();
  for (let i = 0; i < bases.length; i++) {
    const b = bases[i]!;
    const s = b.scale ?? 1;
    tmpQuat.setFromAxisAngle(Y_AXIS, b.yaw);
    for (let j = 0; j < localOffsets.length; j++) {
      const o = localOffsets[j]!;
      offset.set(o[0] * s, o[1] * s, o[2] * s).applyQuaternion(tmpQuat);
      tmpPos.set(b.position[0] + offset.x, b.position[1] + offset.y, b.position[2] + offset.z);
      tmpScale.set(s, s, s);
      tmpMat.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i * localOffsets.length + j, tmpMat);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.matrixAutoUpdate = false;
  enableInstancedCulling(mesh); // see createInstancedMesh
  return mesh;
}

/** Fill (or create) a solid vertex-color attribute on a geometry. */
export function paintGeometry(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const color = new THREE.Color(hex);
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function disposeAll(
  items: Iterable<{ dispose(): void } | null | undefined>,
): void {
  for (const item of items) item?.dispose();
}
