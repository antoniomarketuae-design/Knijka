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

/** Build a static InstancedMesh from placement transforms. */
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
  // Instances span the whole district; the base geometry's bounding sphere
  // sits at the origin, so default frustum culling would drop them all.
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Instanced mesh where each instance is offset from a base transform —
 * used for traffic-light lamps (3 per head, colored per phase).
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
    tmpQuat.setFromAxisAngle(Y_AXIS, b.yaw);
    for (let j = 0; j < localOffsets.length; j++) {
      const o = localOffsets[j]!;
      offset.set(o[0], o[1], o[2]).applyQuaternion(tmpQuat);
      tmpPos.set(b.position[0] + offset.x, b.position[1] + offset.y, b.position[2] + offset.z);
      tmpScale.set(1, 1, 1);
      tmpMat.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i * localOffsets.length + j, tmpMat);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false; // see createInstancedMesh
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
