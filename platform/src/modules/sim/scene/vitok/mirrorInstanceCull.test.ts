/**
 * THE CULL THE MIRROR PASS NEEDED AND THREE CANNOT DO.
 *
 * three culls an InstancedMesh against ONE bounding sphere that unions every
 * instance. This world is built from district-spanning sets — measured on
 * d2-v1: `traffic-parked-wheels` 600 instances / 1059 m sphere,
 * `streetlight-housings` 280 / 1089 m — so the sphere swallows the camera and
 * the whole district is submitted to a 36°-wide, 256×96 rear-view cone. The
 * live measurement was 97.3 % of submitted triangles outside the frustum.
 *
 * The tests below are the two halves of "does not lie":
 *   1. it removes the district-spanning mesh whose instances are all behind
 *      the camera (the win), and
 *   2. it keeps a mesh the moment ONE instance is inside (the safety), which
 *      is what makes this different from a layer mask that guesses.
 *
 * No three import: the module is structural, so a real Scene/InstancedMesh
 * satisfies it and so do the plain objects here.
 */
import { describe, expect, it } from "vitest";
import {
  MIRROR_CULL_MARGIN_M,
  anyInstanceInside,
  cullInstancedForMirror,
  mirrorFrustumPlanes,
  type CullObject,
} from "./mirrorInstanceCull";

/** Column-major identity. */
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major translation matrix, three's `elements` order. */
function translation(x: number, y: number, z: number, scale = 1): number[] {
  return [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, x, y, z, 1];
}

/**
 * A perspective projection matching the shipped rear mirror: 14° vFOV,
 * 256/96 aspect, near 0.3, far 200 — built here rather than imported so the
 * test does not depend on three's matrix code.
 */
function mirrorProjection(far = 200): number[] {
  const near = 0.3;
  const top = near * Math.tan((Math.PI / 360) * 14);
  const height = 2 * top;
  const width = (256 / 96) * height;
  const x = (2 * near) / width;
  const y = (2 * near) / height;
  const c = -(far + near) / (far - near);
  const d = (-2 * far * near) / (far - near);
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, c, -1, 0, 0, d, 0];
}

/**
 * The mirror camera looks along chassis −Z from the driver's eye line, so an
 * unrotated camera at the origin sees NEGATIVE z. `matrixWorldInverse` for a
 * camera sitting at the origin, unrotated, is the identity.
 */
function mirrorCamera(far = 200) {
  return {
    projectionMatrix: { elements: mirrorProjection(far) },
    matrixWorldInverse: { elements: IDENTITY },
  };
}

function instancedMesh(
  positions: readonly (readonly [number, number, number])[],
  options: { radius?: number; sphereY?: number; name?: string } = {},
): CullObject & { name: string } {
  const array = new Float32Array(positions.length * 16);
  positions.forEach((p, i) => array.set(translation(p[0], p[1], p[2]), i * 16));
  return {
    name: options.name ?? "mesh",
    isInstancedMesh: true,
    visible: true,
    count: positions.length,
    instanceMatrix: { array },
    matrixWorld: { elements: IDENTITY },
    geometry: {
      boundingSphere: { center: { x: 0, y: options.sphereY ?? 0, z: 0 }, radius: options.radius ?? 1 },
      computeBoundingSphere() {},
    },
  };
}

function sceneOf(objects: CullObject[]) {
  return { traverse: (cb: (o: CullObject) => void) => objects.forEach(cb) };
}

describe("the frustum the mirror actually has", () => {
  it("extracts six normalized planes from projection × view", () => {
    const planes = mirrorFrustumPlanes(mirrorCamera());
    expect(planes).toHaveLength(24);
    for (let i = 0; i < 6; i += 1) {
      const n = Math.hypot(planes[i * 4], planes[i * 4 + 1], planes[i * 4 + 2]);
      expect(n).toBeCloseTo(1, 6);
    }
  });

  it("accepts a point straight behind the car and rejects one beside it", () => {
    const planes = mirrorFrustumPlanes(mirrorCamera());
    const sphere = { center: { x: 0, y: 0, z: 0 }, radius: 0.5 };
    const behind = anyInstanceInside(planes, IDENTITY, new Float32Array(translation(0, 0, -40)), 1, sphere);
    // 40 m back, 40 m to the side: far outside a 36°-wide cone.
    const beside = anyInstanceInside(planes, IDENTITY, new Float32Array(translation(40, 0, -40)), 1, sphere);
    // In front of the mirror camera — the mirror looks the other way.
    const ahead = anyInstanceInside(planes, IDENTITY, new Float32Array(translation(0, 0, 40)), 1, sphere);
    expect(behind).toBe(true);
    expect(beside).toBe(false);
    expect(ahead).toBe(false);
  });

  it("is conservative: an instance just outside is kept by the safety margin", () => {
    const planes = mirrorFrustumPlanes(mirrorCamera());
    const sphere = { center: { x: 0, y: 0, z: 0 }, radius: 0 };
    // Beyond the 200 m far plane by less than the margin.
    const justPast = MIRROR_CULL_MARGIN_M / 2;
    expect(
      anyInstanceInside(planes, IDENTITY, new Float32Array(translation(0, 0, -(200 + justPast))), 1, sphere),
    ).toBe(true);
    expect(
      anyInstanceInside(planes, IDENTITY, new Float32Array(translation(0, 0, -(200 + MIRROR_CULL_MARGIN_M * 4))), 1, sphere),
    ).toBe(false);
  });
});

describe("what the cull removes, and what it must never remove", () => {
  it("drops a district-spanning set whose 1 km sphere three could never reject", () => {
    // The shape of `traffic-parked-wheels` on d2-v1: hundreds of instances
    // spread over the district, every one of them off the mirror's cone.
    const positions: [number, number, number][] = [];
    for (let i = 0; i < 300; i += 1) {
      positions.push([-500 + (i % 25) * 40, 0, 500 - Math.floor(i / 25) * 40]);
    }
    const wheels = instancedMesh(positions, { radius: 0.35, name: "traffic-parked-wheels" });
    const cull = cullInstancedForMirror(sceneOf([wheels]), mirrorCamera());
    expect(wheels.visible).toBe(false);
    expect(cull.meshesHidden).toBe(1);
    expect(cull.instancesTested).toBe(300);
    cull.restore();
    expect(wheels.visible).toBe(true);
  });

  it("keeps the whole mesh when ONE instance is inside — nothing visible is removed", () => {
    const positions: [number, number, number][] = [[0, 0, -25]];
    for (let i = 0; i < 299; i += 1) positions.push([600, 0, 600]);
    const trees = instancedMesh(positions, { radius: 3, sphereY: 4, name: "trees-leafyB-c9" });
    const cull = cullInstancedForMirror(sceneOf([trees]), mirrorCamera());
    expect(trees.visible).toBe(true);
    expect(cull.meshesHidden).toBe(0);
    // Early exit: the first instance answered it, so 299 were never touched.
    expect(cull.instancesTested).toBe(1);
  });

  it("ignores instance slots parked on a zero matrix by hideAll()", () => {
    // buildTrafficFleet allocates every slot up front and hides the unused
    // ones with a ZERO matrix. Read naively that is a point at the world
    // origin, which would keep a whole fleet mesh alive whenever the car
    // happened to drive past the origin — exactly where lesson worlds start.
    const mesh = instancedMesh([[0, 0, 0], [0, 0, 0]], { radius: 1, name: "traffic-parked-body-pino" });
    (mesh.instanceMatrix!.array as Float32Array).fill(0);
    const cull = cullInstancedForMirror(sceneOf([mesh]), mirrorCamera());
    expect(mesh.visible).toBe(false);
    expect(cull.instancesTested).toBe(0);
    cull.restore();
    expect(mesh.visible).toBe(true);
  });

  it("leaves non-instanced meshes alone — three already culls those exactly", () => {
    const merged: CullObject = {
      visible: true,
      matrixWorld: { elements: IDENTITY },
      geometry: { boundingSphere: { center: { x: 0, y: 0, z: 0 }, radius: 1348 }, computeBoundingSphere() {} },
    };
    const cull = cullInstancedForMirror(sceneOf([merged]), mirrorCamera());
    expect(merged.visible).toBe(true);
    expect(cull.meshesScanned).toBe(0);
  });

  it("skips meshes the camera's layer mask already excludes", () => {
    // The cabin lives on INTERIOR_LAYER and the mirror camera keeps layer 0;
    // scanning those instances would be pure cost.
    const cabin = instancedMesh([[600, 0, 600]], { name: "int_trim" });
    (cabin as { layers?: { mask: number } }).layers = { mask: 1 << 2 };
    const camera = { ...mirrorCamera(), layers: { mask: 1 } };
    const cull = cullInstancedForMirror(sceneOf([cabin]), camera);
    expect(cull.meshesScanned).toBe(0);
    expect(cabin.visible).toBe(true);
  });

  it("restore() is idempotent and cannot resurrect a mesh it did not hide", () => {
    const far = instancedMesh([[600, 0, 600]], { name: "signs-giveWay-body" });
    const alreadyHidden: CullObject = { ...instancedMesh([[0, 0, -10]]), visible: false };
    const cull = cullInstancedForMirror(sceneOf([far, alreadyHidden]), mirrorCamera());
    expect(far.visible).toBe(false);
    cull.restore();
    cull.restore();
    expect(far.visible).toBe(true);
    // It was invisible before the cull for someone else's reason; it stays so.
    expect(alreadyHidden.visible).toBe(false);
  });
});
