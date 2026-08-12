/**
 * PER-INSTANCE CULLING FOR THE MIRROR RTT PASSES.
 *
 * WHAT THIS FIXES, MEASURED. The rear mirror renders into a 256×96 target —
 * 24,576 pixels, 3.1 % of the main framebuffer — and on d2-v1 at tier low it
 * was submitting 83.0 draw calls and 492,716 triangles PER ENTRY, against a
 * main pass of 212.4 draws / 1,105,058 triangles at 1264×619. A third of the
 * frame's submissions for a postage stamp.
 *
 * THE OBVIOUS EXPLANATION IS WRONG, AND IT WAS CHECKED BEFORE THIS WAS
 * WRITTEN. The mirror does NOT use the main camera's frustum: it has its own
 * 14° vFOV / 36.3° hFOV cone and its own 200 m far plane (the main camera is
 * at 900). Shortening that far plane buys nothing — measured on the running
 * product, /dev/drive-rig, d2-v1 tier low, 8 s windows, per mirror entry:
 *
 *     far 200 (shipped)   83.0 draws   492,716 tris
 *     far 150             83.0         492,716      0.0 % / 0.0 %
 *     far 120             81.0         485,380     −2.4 % / −1.5 %
 *     far  80             80.0         480,900     −3.6 % / −2.4 %
 *     far  60             80.9         483,393     −2.6 % / −1.9 %
 *
 * The reason is granularity, not distance. The world is built from
 * district-spanning InstancedMeshes, and three culls a whole InstancedMesh
 * against ONE bounding sphere that unions every instance. Measured radii on
 * d2-v1: `traffic-parked-wheels` 1059 m (600 instances), `streetlight-housings`
 * 1089 m (280), `traffic-light-lens-glass` 810 m (117), the parked-car bodies
 * ~1000 m each. A sphere a kilometre across intersects every frustum that
 * contains the camera, so the cull can never reject one — and the entire
 * district's worth of instances goes to a camera that can see a 36°-wide cone.
 *
 * HOW MUCH OF IT IS WASTE. Extracting the mirror camera's own frustum planes
 * and testing EVERY instance against them on the live scene (12 samples at
 * 20 km/h): of 417,783 static triangles submitted, 11,423 were inside the
 * frustum. **97.3 % of what the mirror pass submits cannot appear in it.**
 * `traffic-parked-wheels` alone sent 112,800 triangles for 0 visible wheels.
 *
 * SO THE PASS DOES THE CULL THREE CANNOT. For every InstancedMesh, walk the
 * instances and keep the mesh only if at least one instance's bounding sphere
 * touches the mirror frustum. It is the same conservative sphere test three
 * uses, applied one level deeper, so NOTHING THAT COULD BE SEEN IS REMOVED —
 * this is not a layer mask that guesses which subsystems a driver will miss.
 * It is all-or-nothing per mesh (three cannot draw an instance sub-range), yet
 * that is nearly the whole win, because for these meshes the usual answer is
 * "no instance is inside at all".
 *
 * COST. One early-exiting scan per mirror pass: a mesh with a visible instance
 * usually costs one test, and only a fully-invisible mesh pays for its whole
 * instance list. The pass runs at most once per frame and at tier low once in
 * four, so the scan is a few tens of thousands of float operations per second
 * against the tens of draw calls it removes.
 *
 * THREE-FREE ON PURPOSE, exactly like `mirrorPass.ts`: the types below are
 * structural, so a real Scene/InstancedMesh/PerspectiveCamera satisfies them
 * and so does a plain-Node test double. Matrices are read in three's
 * column-major `elements` order.
 *
 * GRADING IS UNTOUCHED: mirror glances are camera/key/click events through
 * CabinControls.glance(). RTT is visual truth, never the graded signal.
 */

/** A 4×4 matrix in three's column-major `elements` order. */
export interface CullMatrix {
  readonly elements: ArrayLike<number>;
}

export interface CullSphere {
  readonly center: { readonly x: number; readonly y: number; readonly z: number };
  readonly radius: number;
}

export interface CullGeometry {
  readonly boundingSphere: CullSphere | null;
  computeBoundingSphere(): void;
}

/** The slice of Object3D/InstancedMesh this cull reads and writes. */
export interface CullObject {
  readonly isInstancedMesh?: boolean;
  visible: boolean;
  readonly count?: number;
  readonly instanceMatrix?: { readonly array: ArrayLike<number> } | null;
  readonly matrixWorld: CullMatrix;
  readonly geometry?: CullGeometry | null;
  readonly layers?: { readonly mask: number };
}

export interface CullScene {
  traverse(callback: (object: CullObject) => void): void;
}

export interface CullCamera {
  readonly projectionMatrix: CullMatrix;
  readonly matrixWorldInverse: CullMatrix;
  readonly layers?: { readonly mask: number };
}

/**
 * Slack added to every instance's radius, metres.
 *
 * MirrorRig runs its pass from `useFrame` and three re-runs
 * `scene.updateMatrixWorld()` inside `render()`, so the pose the cull tests
 * against can be up to one frame older than the pose that is drawn. At 20 km/h
 * that is 0.09 m and at 130 km/h it is 0.6 m; 2 m covers both with room to
 * spare, and costs nothing measurable because the meshes this rejects have no
 * instance within hundreds of metres of the cone.
 */
export const MIRROR_CULL_MARGIN_M = 2;

/** Six frustum planes as 24 numbers: [a,b,c,d] × (right,left,bottom,top,far,near). */
export type FrustumPlanes = Float64Array;

/**
 * clip = projection × viewInverse, then the six planes, normalized —
 * the same extraction three's `Frustum.setFromProjectionMatrix` performs, done
 * here so this module needs no three import.
 */
export function mirrorFrustumPlanes(camera: CullCamera, out?: FrustumPlanes): FrustumPlanes {
  const p = camera.projectionMatrix.elements;
  const v = camera.matrixWorldInverse.elements;
  // Column-major multiply: m[row + col*4].
  const m = new Float64Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += p[row + k * 4]! * v[k + col * 4]!;
      m[row + col * 4] = sum;
    }
  }
  const planes = out ?? new Float64Array(24);
  const set = (i: number, a: number, b: number, c: number, d: number): void => {
    const len = Math.hypot(a, b, c) || 1;
    planes[i * 4] = a / len;
    planes[i * 4 + 1] = b / len;
    planes[i * 4 + 2] = c / len;
    planes[i * 4 + 3] = d / len;
  };
  const m0 = m[0]!, m1 = m[1]!, m2 = m[2]!, m3 = m[3]!;
  const m4 = m[4]!, m5 = m[5]!, m6 = m[6]!, m7 = m[7]!;
  const m8 = m[8]!, m9 = m[9]!, m10 = m[10]!, m11 = m[11]!;
  const m12 = m[12]!, m13 = m[13]!, m14 = m[14]!, m15 = m[15]!;
  set(0, m3 - m0, m7 - m4, m11 - m8, m15 - m12); // right
  set(1, m3 + m0, m7 + m4, m11 + m8, m15 + m12); // left
  set(2, m3 + m1, m7 + m5, m11 + m9, m15 + m13); // bottom
  set(3, m3 - m1, m7 - m5, m11 - m9, m15 - m13); // top
  set(4, m3 - m2, m7 - m6, m11 - m10, m15 - m14); // far
  set(5, m3 + m2, m7 + m6, m11 + m10, m15 + m14); // near
  return planes;
}

/** Largest of the three basis-column lengths of a column-major 4×4. */
function maxScaleOf(e: ArrayLike<number>): number {
  return Math.max(
    Math.hypot(e[0]!, e[1]!, e[2]!),
    Math.hypot(e[4]!, e[5]!, e[6]!),
    Math.hypot(e[8]!, e[9]!, e[10]!),
  );
}

/** How many instances were examined by the last `anyInstanceInside` call. */
let lastTested = 0;

/**
 * Does ANY live instance of this mesh touch the frustum?
 *
 * Conservative on both sides that matter: the geometry's own bounding sphere is
 * transformed by the instance matrix AND the mesh's world matrix (so an
 * off-origin sphere centre — every tree has one — is handled), the radius is
 * scaled by the largest basis length of both, and `MIRROR_CULL_MARGIN_M` is
 * added. Instances whose matrix has zero scale are skipped: `hideAll()` parks
 * every unused fleet slot on a ZERO matrix, which would otherwise read as a
 * point at the world origin and keep a whole fleet mesh alive whenever the car
 * drove near it.
 */
export function anyInstanceInside(
  planes: FrustumPlanes,
  worldElements: ArrayLike<number>,
  instanceMatrix: ArrayLike<number>,
  count: number,
  sphere: CullSphere,
): boolean {
  lastTested = 0;
  const bx = sphere.center.x;
  const by = sphere.center.y;
  const bz = sphere.center.z;
  const worldScale = maxScaleOf(worldElements);
  const w = worldElements;
  for (let i = 0; i < count; i += 1) {
    const b = i * 16;
    const e0 = instanceMatrix[b]!, e1 = instanceMatrix[b + 1]!, e2 = instanceMatrix[b + 2]!;
    const e4 = instanceMatrix[b + 4]!, e5 = instanceMatrix[b + 5]!, e6 = instanceMatrix[b + 6]!;
    const e8 = instanceMatrix[b + 8]!, e9 = instanceMatrix[b + 9]!, e10 = instanceMatrix[b + 10]!;
    const scale = Math.max(
      Math.hypot(e0, e1, e2),
      Math.hypot(e4, e5, e6),
      Math.hypot(e8, e9, e10),
    );
    if (scale === 0) continue; // hideAll(): a parked-but-unused instance slot
    lastTested += 1;
    // sphere centre → instance space → world space
    const ix = e0 * bx + e4 * by + e8 * bz + instanceMatrix[b + 12]!;
    const iy = e1 * bx + e5 * by + e9 * bz + instanceMatrix[b + 13]!;
    const iz = e2 * bx + e6 * by + e10 * bz + instanceMatrix[b + 14]!;
    const x = w[0]! * ix + w[4]! * iy + w[8]! * iz + w[12]!;
    const y = w[1]! * ix + w[5]! * iy + w[9]! * iz + w[13]!;
    const z = w[2]! * ix + w[6]! * iy + w[10]! * iz + w[14]!;
    const radius = sphere.radius * scale * worldScale + MIRROR_CULL_MARGIN_M;
    let outside = false;
    for (let p = 0; p < 6; p += 1) {
      const o = p * 4;
      if (planes[o]! * x + planes[o + 1]! * y + planes[o + 2]! * z + planes[o + 3]! < -radius) {
        outside = true;
        break;
      }
    }
    if (!outside) return true;
  }
  return false;
}

/** What one cull did — returned so the caller can restore and so a test can score it. */
export interface MirrorCull {
  /** InstancedMeshes examined. */
  readonly meshesScanned: number;
  /** InstancedMeshes hidden for the pass (no instance inside the frustum). */
  readonly meshesHidden: number;
  /** Instance sphere tests performed — the CPU price of the scan. */
  readonly instancesTested: number;
  /** Make every hidden mesh visible again. Idempotent. */
  restore(): void;
}

/**
 * Hide every InstancedMesh with nothing inside the mirror camera's frustum,
 * for the duration of one pass. The caller MUST call `restore()` — MirrorRig
 * does it in a `finally`, so a throw inside the render cannot leave the world
 * missing from the driver's own view.
 *
 * The camera's `matrixWorldInverse` must already be current for the frame;
 * MirrorRig calls `camera.updateWorldMatrix(true, false)` first, which is what
 * refreshes it (three's `Camera.updateWorldMatrix` recomputes the inverse).
 */
export function cullInstancedForMirror(scene: CullScene, camera: CullCamera): MirrorCull {
  const planes = mirrorFrustumPlanes(camera);
  const hidden: CullObject[] = [];
  let meshesScanned = 0;
  let instancesTested = 0;
  const cameraMask = camera.layers?.mask;
  scene.traverse((object) => {
    if (object.isInstancedMesh !== true || object.visible !== true) return;
    const count = object.count ?? 0;
    if (count === 0) return;
    const instanceMatrix = object.instanceMatrix;
    if (!instanceMatrix) return;
    // Objects the camera's layer mask already excludes are three's problem,
    // not ours — scanning them would be pure cost.
    if (cameraMask !== undefined && object.layers !== undefined) {
      if ((cameraMask & object.layers.mask) === 0) return;
    }
    const geometry = object.geometry;
    if (!geometry) return;
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    if (!sphere) return;
    meshesScanned += 1;
    const inside = anyInstanceInside(
      planes,
      object.matrixWorld.elements,
      instanceMatrix.array,
      count,
      sphere,
    );
    instancesTested += lastTested;
    if (!inside) {
      object.visible = false;
      hidden.push(object);
    }
  });
  let restored = false;
  return {
    meshesScanned,
    meshesHidden: hidden.length,
    instancesTested,
    restore(): void {
      if (restored) return;
      restored = true;
      for (const object of hidden) object.visible = true;
    },
  };
}
