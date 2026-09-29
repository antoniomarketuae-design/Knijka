import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  BufferAttribute,
  BufferGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type Object3D,
} from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { REAR_MIRROR_STATION_DROP_MAX_M, rearMirrorStationDropM } from "./cabinLook";
import {
  B58_CLEARANCE_NODE_RAISE_M,
  B58_STATION_RAISE_M,
  INTERIOR_MOUNT_Y_OFFSET_M,
  REAR_MIRROR_CASING_BOX,
  REAR_GLASS_ASSEMBLY_DROP_M,
  REAR_GLASS_LIFT_M,
  REAR_GLASS_NODE,
  applyRearMirrorCasingDrop,
  captureRearMirrorCasing,
  placeRigGlassNode,
  rearMirrorB58ClearanceM,
  rigMirrorGlass,
  type RearMirrorCasing,
} from "./mirrorStation";

/**
 * «RE-ANCHOR THE MIRROR» — THE AUTHORED CASING, EXECUTED (lane mirror round 3,
 * verifier condition C2).
 *
 * Round 2 raised `REAR_MIRROR_STATION_DROP_MAX_M` from 0 to 11.3 mm, which
 * made VitokCockpit's casing capture/drop code run for the first time, and no
 * test executed it: sabotages that halved it, doubled it (breaking B58 on the
 * casing by ~10 mm), flipped it upward or shrank its box all stayed green.
 * The casing half of the B58 re-check was `105 − d − 92.8`, a sum.
 *
 * These tests run the SAME two functions VitokCockpit calls
 * (`captureRearMirrorCasing(root, SHELL_NODE_NAME)` at clone time, then
 * `applyRearMirrorCasingDrop(casing, stationDropM)` in an effect keyed on the
 * canvas aspect) on:
 *   · hero_interior.glb as it ships, decoded with the gltf-transform + draco
 *     stack `tools/glb/raise_interior_mirror.mjs` edits it with, laid out the
 *     way GLTFLoader lays it out (8 primitives → meshes interior_shell_1 …
 *     _8 under the node group `interior_shell`), and then measure the buffers
 *     the GPU would draw — B58 is asked of THOSE vertices;
 *   · a synthetic shell under a scaled, rotated, offset node, where a
 *     direction that is wrong in the mesh's own frame cannot hide.
 */

const PLATFORM = resolve(__dirname, "../../../../..");
const GLB_PATH = resolve(PLATFORM, "public/sim/vehicles/hero_interior.glb");
/** VitokCockpit's shell prefix — pinned against its source below. */
const SHELL = "interior_shell";

/** The audited sideways phone (the row's own frames) and the 16:9 reference. */
const PHONE_ASPECT = 852 / 393;
const REFERENCE_ASPECT = 16 / 9;

/** GLB point → chassis point (the cabin mount: yaw π, y − 0.55). */
const toChassis = (v: Vector3) => new Vector3(-v.x, v.y - INTERIOR_MOUNT_Y_OFFSET_M, -v.z);

/** Every vertex of a mesh, as the renderer places it (geometry × matrixWorld). */
function worldVertices(mesh: Mesh): Vector3[] {
  mesh.updateWorldMatrix(true, false);
  const pos = mesh.geometry.getAttribute("position") as BufferAttribute;
  const out: Vector3[] = [];
  for (let i = 0; i < pos.count; i++) out.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  return out;
}

/** A chassis-space box written as literals, independent of REAR_MIRROR_CASING_BOX. */
const inLiteralBox = (c: Vector3, x: readonly [number, number], y: readonly [number, number], z: readonly [number, number]) =>
  c.x > x[0] && c.x < x[1] && c.y > y[0] && c.y < y[1] && c.z > z[0] && c.z < z[1];

interface DecodedCabin {
  root: Group;
  shellMeshes: Mesh[];
  /** The cached geometries GLTFLoader would hand every mount — never written. */
  cachedPositions: Float32Array[];
  cachedGeometries: BufferGeometry[];
  glassMesh: Mesh;
}

let io: NodeIO;
/** The draco decoder gltf-transform uses (untyped CJS package — required, not imported). */
const draco3d = createRequire(import.meta.url)("draco3dgltf") as { createDecoderModule: () => Promise<unknown> };

/** Decode the shipped GLB into a fresh Object3D graph, GLTFLoader-shaped. */
async function loadCabin(): Promise<DecodedCabin> {
  const doc = await io.readBinary(new Uint8Array(readFileSync(GLB_PATH)));
  const root = new Group();
  const used: Record<string, number> = {};
  // three's GLTFParser.createUniqueName: name, name_1, name_2 …
  const unique = (n: string) => (n in used ? `${n}_${++used[n]}` : ((used[n] = 0), n));
  const shellMeshes: Mesh[] = [];
  const cachedPositions: Float32Array[] = [];
  const cachedGeometries: BufferGeometry[] = [];
  let glassMesh: Mesh | null = null;
  for (const node of doc.getRoot().listNodes()) {
    const gmesh = node.getMesh();
    if (!gmesh) continue;
    if (node.getName() !== SHELL && node.getName() !== "hotspot_mirror_rear") continue;
    const holder = new Group();
    holder.applyMatrix4(new Matrix4().fromArray(node.getMatrix()));
    // GLTFLoader reserves the NODE name before its meshes load
    // (`_loadNodeShallow`: «reserve node's name before its dependencies»), so
    // the node group is `interior_shell` and its meshes `interior_shell_1 … _8`
    // (round-3 verifier note; round 3 had the order the other way round).
    holder.name = unique(node.getName());
    for (const prim of gmesh.listPrimitives()) {
      const src = prim.getAttribute("POSITION")!.getArray() as Float32Array;
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(Float32Array.from(src), 3));
      const mesh = new Mesh(geometry);
      mesh.name = unique(gmesh.getName());
      holder.add(mesh);
      if (node.getName() === SHELL) {
        shellMeshes.push(mesh);
        cachedGeometries.push(geometry);
        cachedPositions.push(Float32Array.from(src));
      } else {
        glassMesh = mesh;
      }
    }
    root.add(holder);
  }
  if (!glassMesh) throw new Error("hotspot_mirror_rear not found in the GLB");
  return { root, shellMeshes, cachedPositions, cachedGeometries, glassMesh };
}

beforeAll(async () => {
  io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "draco3d.decoder": await draco3d.createDecoderModule() });
}, 60_000);

describe("the casing VitokCockpit captures is the mirror end of the shipped station — 156 vertices, and only those", () => {
  let cabin: DecodedCabin;
  let casing: RearMirrorCasing;
  let before: Vector3[][];
  beforeAll(async () => {
    cabin = await loadCabin();
    before = cabin.shellMeshes.map(worldVertices);
    casing = captureRearMirrorCasing(cabin.root, SHELL);
  }, 60_000);

  it("GLTFLoader's layout: 8 shell primitives, every one named from interior_shell", () => {
    expect(cabin.shellMeshes).toHaveLength(8);
    for (const m of cabin.shellMeshes) expect(m.name.startsWith(SHELL)).toBe(true);
    expect(cabin.shellMeshes.map((m) => m.name)).toEqual(
      Array.from({ length: 8 }, (_, i) => `interior_shell_${i + 1}`),
    );
    // …and the Group holding them carries the bare node name, which the
    // capture must skip (it is not a mesh) without losing a single vertex.
    expect(cabin.root.getObjectByName(SHELL)?.type).toBe("Group");
  });

  it("captures exactly the 156 mirror-end vertices B58 raised (of the 168 in its station box)", () => {
    const total = casing.parts.reduce((n, p) => n + p.indices.length, 0);
    expect(total).toBe(156);
  });

  it("…and a box half as wide again and 0.6 m tall around it holds the SAME set, so nothing is torn off", () => {
    // Written as literals, NOT through REAR_MIRROR_CASING_BOX: a box that
    // shrank (and so left part of the casing behind, torn from the rest) must
    // disagree with this.
    const captured = new Set<string>();
    casing.parts.forEach((p) => {
      const meshIdx = cabin.shellMeshes.findIndex((m) => m.geometry.getAttribute("position") === p.position);
      expect(meshIdx).toBeGreaterThanOrEqual(0);
      p.indices.forEach((i) => captured.add(`${meshIdx}:${i}`));
    });
    const wide = new Set<string>();
    before.forEach((verts, m) =>
      verts.forEach((w, i) => {
        if (inLiteralBox(toChassis(w), [-0.3, 0.3], [0.6, 1.2], [0.4, 0.68])) wide.add(`${m}:${i}`);
      }),
    );
    expect(wide.size).toBe(156);
    expect([...captured].sort()).toEqual([...wide].sort());
  });

  it("the box's margins around the DRAWN casing are the measured ones (a box edit or an asset re-export must re-measure, not drift)", () => {
    // The casing's chassis extents, measured on the decoded GLB: x ±0.0958,
    // y 0.8638–0.9550, z 0.4674–0.5600 (the docstring's «x ±0.096, y 0.864–
    // 0.955, z 0.467–0.560»). A box face moved INSIDE the casing changes the
    // capture count above; a face moved but still outside it changes nothing
    // drawn today, and only this pin sees it — so it is written as the margin
    // each face keeps, to the millimetre, and any change to the box or the
    // asset has to come back through here with a new measurement.
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    casing.parts.forEach((p) => {
      const mesh = cabin.shellMeshes.find((m) => m.geometry.getAttribute("position") === p.position)!;
      p.indices.forEach((i) => {
        const c = toChassis(new Vector3().fromBufferAttribute(p.position, i).applyMatrix4(mesh.matrixWorld));
        [c.x, c.y, c.z].forEach((v, k) => {
          lo[k] = Math.min(lo[k], v);
          hi[k] = Math.max(hi[k], v);
        });
      });
    });
    // Measured while the casing is at its authored height (drop 0).
    expect(casing.applied).toBe(0);
    const mm = (v: number) => Math.round(v * 1000);
    expect(mm(lo[0] - REAR_MIRROR_CASING_BOX.x[0])).toBe(104);
    expect(mm(REAR_MIRROR_CASING_BOX.x[1] - hi[0])).toBe(104);
    expect(mm(lo[1] - REAR_MIRROR_CASING_BOX.y[0])).toBe(69);
    expect(mm(REAR_MIRROR_CASING_BOX.y[1] - hi[1])).toBe(60);
    expect(mm(lo[2] - REAR_MIRROR_CASING_BOX.z[0])).toBe(67);
    expect(mm(REAR_MIRROR_CASING_BOX.z[1] - hi[2])).toBe(120);
  });

  it("the glass quad lies in the same space but is NOT interior_shell, so it is not captured (MirrorRig owns it)", () => {
    const glassInBox = worldVertices(cabin.glassMesh).filter((w) =>
      inLiteralBox(toChassis(w), [-0.3, 0.3], [0.6, 1.2], [0.4, 0.68]),
    );
    expect(glassInBox.length).toBeGreaterThan(0);
    expect(casing.parts.some((p) => p.position === cabin.glassMesh.geometry.getAttribute("position"))).toBe(false);
  });

  it("the capture takes PRIVATE geometry copies — the cached GLTF buffers are never written", () => {
    applyRearMirrorCasingDrop(casing, REAR_MIRROR_STATION_DROP_MAX_M);
    cabin.cachedGeometries.forEach((g, k) => {
      const arr = (g.getAttribute("position") as BufferAttribute).array as Float32Array;
      expect(Buffer.from(arr.buffer).equals(Buffer.from(cabin.cachedPositions[k].buffer)), `primitive ${k}`).toBe(true);
    });
    const touched = cabin.shellMeshes.filter((m, k) => m.geometry !== cabin.cachedGeometries[k]);
    expect(touched.length).toBe(casing.parts.length);
    expect(touched.length).toBeGreaterThan(0);
    applyRearMirrorCasingDrop(casing, 0);
  });
});

describe("the casing moves as the running app drives it: straight down by the station drop, and back", () => {
  let cabin: DecodedCabin;
  let casing: RearMirrorCasing;
  let authored: Vector3[][];
  const capturedSet = new Set<string>();
  beforeAll(async () => {
    cabin = await loadCabin();
    authored = cabin.shellMeshes.map(worldVertices);
    casing = captureRearMirrorCasing(cabin.root, SHELL);
    casing.parts.forEach((p) => {
      const m = cabin.shellMeshes.findIndex((s) => s.geometry.getAttribute("position") === p.position);
      p.indices.forEach((i) => capturedSet.add(`${m}:${i}`));
    });
  }, 60_000);

  /** Chassis-space displacement of every shell vertex from its authored place. */
  const displacements = () =>
    cabin.shellMeshes.map((m, mi) =>
      worldVertices(m).map((w, i) => ({ key: `${mi}:${i}`, d: toChassis(w).sub(toChassis(authored[mi][i])) })),
    ).flat();

  it("on the audited phone (852 × 393) every captured vertex is drawn EXACTLY the drop lower — no less, no more, never up or sideways", () => {
    const drop = rearMirrorStationDropM(PHONE_ASPECT);
    expect(drop).toBe(REAR_MIRROR_STATION_DROP_MAX_M);
    applyRearMirrorCasingDrop(casing, drop);
    let moved = 0;
    for (const { key, d } of displacements()) {
      if (!capturedSet.has(key)) continue;
      moved++;
      expect(d.y, key).toBeCloseTo(-drop, 6);
      expect(Math.abs(d.x), key).toBeLessThan(1e-6);
      expect(Math.abs(d.z), key).toBeLessThan(1e-6);
    }
    expect(moved).toBe(156);
  });

  it("…and every other shell vertex is bit-identical to the asset", () => {
    for (const { key, d } of displacements()) {
      if (capturedSet.has(key)) continue;
      expect(d.lengthSq(), key).toBe(0);
    }
  });

  it("B58 asked of the DRAWN casing: the lowest captured vertex keeps ≥ 92.8 mm of its 105 mm raise, and agrees with rearMirrorB58ClearanceM", () => {
    const drop = rearMirrorStationDropM(PHONE_ASPECT);
    applyRearMirrorCasingDrop(casing, drop);
    let worstDy = Infinity;
    for (const { key, d } of displacements()) if (capturedSet.has(key)) worstDy = Math.min(worstDy, d.y);
    // Net raise of the worst vertex = B58's raise + what the drop took off it.
    const measured = B58_STATION_RAISE_M + worstDy - B58_CLEARANCE_NODE_RAISE_M;
    expect(measured).toBeGreaterThanOrEqual(0);
    // The module's figure is now a measurement of the buffers, to the micrometre.
    expect(measured).toBeCloseTo(rearMirrorB58ClearanceM(drop).casing, 6);
    expect(measured * 1000).toBeCloseTo(0.9, 3);
  });

  it("a rotation back to 16:9 restores the authored vertices exactly; a rotation out again lands in the same place", () => {
    applyRearMirrorCasingDrop(casing, rearMirrorStationDropM(PHONE_ASPECT));
    const first = displacements().map((x) => x.d.y);
    applyRearMirrorCasingDrop(casing, rearMirrorStationDropM(REFERENCE_ASPECT));
    expect(rearMirrorStationDropM(REFERENCE_ASPECT)).toBe(0);
    for (const { key, d } of displacements()) expect(d.lengthSq(), key).toBe(0);
    applyRearMirrorCasingDrop(casing, rearMirrorStationDropM(PHONE_ASPECT));
    applyRearMirrorCasingDrop(casing, rearMirrorStationDropM(PHONE_ASPECT));
    expect(displacements().map((x) => x.d.y)).toEqual(first);
    applyRearMirrorCasingDrop(casing, 0);
  });

  it("nonsense drops (NaN, negative, ∞) are 0 — it runs inside a React effect on a live canvas size", () => {
    for (const bad of [Number.NaN, -0.01, Number.POSITIVE_INFINITY]) {
      applyRearMirrorCasingDrop(casing, bad);
      for (const { key, d } of displacements()) expect(d.lengthSq(), `${bad} ${key}`).toBe(0);
    }
  });
});

describe("the drop is chassis-down in the mesh's OWN frame — a scaled, rotated, offset shell node cannot bend it", () => {
  /**
   * The shipped shell has an identity node, where every wrong direction and
   * every wrong length of "down" look the same only if they are (0, −1, 0).
   * Here the shell sits under a node scaled (2, 0.5, 1.5), rotated and offset,
   * so a down vector that is normalised, un-inverted or sign-flipped moves the
   * drawn vertices somewhere other than straight down by the drop.
   */
  function syntheticCabin() {
    const root = new Group();
    const holder = new Group();
    holder.position.set(0.03, -0.02, 0.05);
    holder.quaternion.setFromEuler(new Euler(0.4, -0.7, 0.25, "XYZ"));
    holder.scale.set(2, 0.5, 1.5);
    root.add(holder);
    root.updateMatrixWorld(true);
    const inv = new Matrix4().copy(holder.matrixWorld).invert();
    // Chassis points: 3 inside REAR_MIRROR_CASING_BOX, 3 outside it.
    const chassis = [
      [0, 0.9, 0.5],
      [0.09, 0.95, 0.55],
      [-0.1, 0.85, 0.62],
      [0, 0.97, 0.15], // the stalk root ring — stays in the roof
      [0.7, 0.9, 0.5], // grab handle
      [0, 0.85, 0.06], // overhead console
    ];
    const arr = new Float32Array(chassis.length * 3);
    chassis.forEach(([x, y, z], i) => {
      const local = new Vector3(-x, y + INTERIOR_MOUNT_Y_OFFSET_M, -z).applyMatrix4(inv);
      arr.set([local.x, local.y, local.z], i * 3);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(arr, 3));
    const shell = new Mesh(geometry);
    shell.name = "interior_shell_3";
    holder.add(shell);
    // A non-shell mesh with a vertex in the box: never captured.
    const other = new Mesh(new BufferGeometry());
    other.name = "hotspot_mirror_rear";
    other.geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([0, 0.9 + INTERIOR_MOUNT_Y_OFFSET_M, -0.5]), 3),
    );
    root.add(other);
    return { root, shell, other };
  }

  it("captures the three in-box points and moves each of them exactly `drop` straight down in chassis space", () => {
    const { root, shell, other } = syntheticCabin();
    const authored = worldVertices(shell).map(toChassis);
    const casing = captureRearMirrorCasing(root, SHELL);
    expect(casing.parts).toHaveLength(1);
    expect([...casing.parts[0].indices]).toEqual([0, 1, 2]);
    const drop = 0.0113;
    applyRearMirrorCasingDrop(casing, drop);
    const now = worldVertices(shell).map(toChassis);
    for (let i = 0; i < 3; i++) {
      const d = now[i].clone().sub(authored[i]);
      expect(d.y, `vertex ${i}`).toBeCloseTo(-drop, 6);
      expect(Math.abs(d.x), `vertex ${i}`).toBeLessThan(2e-6);
      expect(Math.abs(d.z), `vertex ${i}`).toBeLessThan(2e-6);
    }
    for (let i = 3; i < 6; i++) expect(now[i].distanceTo(authored[i]), `vertex ${i}`).toBe(0);
    expect(worldVertices(other)[0].y).toBe(Math.fround(0.9 + INTERIOR_MOUNT_Y_OFFSET_M));
    applyRearMirrorCasingDrop(casing, 0);
    const back = worldVertices(shell).map(toChassis);
    for (let i = 0; i < 6; i++) expect(back[i].distanceTo(authored[i]), `vertex ${i}`).toBeLessThan(1e-7);
  });
});

describe("MirrorRig's glass placement survives turning the phone — the undo it runs is position AND scale (verifier note N1)", () => {
  /** The shipped node, B58-raised: what MirrorRig's effect starts from. */
  function glassNode(): Object3D {
    const g = new Group();
    g.position.set(REAR_GLASS_NODE.x, REAR_GLASS_NODE.preRaiseY + B58_STATION_RAISE_M, REAR_GLASS_NODE.z);
    g.quaternion.copy(new Quaternion(...REAR_GLASS_NODE.quaternion));
    g.scale.setScalar(REAR_GLASS_NODE.scale);
    return g;
  }
  /** React's effect lifecycle for MirrorRig's placement effect, keyed on the drop. */
  function mountAt(node: Object3D, drop: number) {
    return placeRigGlassNode(node, REAR_GLASS_LIFT_M, REAR_GLASS_ASSEMBLY_DROP_M, drop);
  }

  it("places the node exactly where rigMirrorGlass says, and the cleanup restores the authored transform", () => {
    const node = glassNode();
    const authoredPos = node.position.clone();
    const authoredScale = node.scale.clone();
    const drop = rearMirrorStationDropM(PHONE_ASPECT);
    const restore = mountAt(node, drop);
    const expected = rigMirrorGlass(
      [authoredPos.x, authoredPos.y, authoredPos.z],
      REAR_GLASS_LIFT_M,
      REAR_GLASS_ASSEMBLY_DROP_M,
      drop,
    );
    expect(node.position.toArray()).toEqual(expected.position);
    expect(node.scale.x).toBeCloseTo(REAR_GLASS_NODE.scale * expected.scaleRatio, 12);
    restore();
    expect(node.position.equals(authoredPos)).toBe(true);
    expect(node.scale.equals(authoredScale)).toBe(true);
  });

  it("sideways → upright → sideways (drop 11.3 → 0 → 11.3 mm): each placement is from the AUTHORED node, nothing accumulates", () => {
    const node = glassNode();
    const authored = node.position.clone();
    const wide = rearMirrorStationDropM(PHONE_ASPECT);
    const narrow = rearMirrorStationDropM(393 / 852);
    expect(narrow).toBe(0);
    const once = (() => {
      const n = glassNode();
      mountAt(n, wide);
      return { p: n.position.clone(), s: n.scale.clone() };
    })();
    let cleanup = mountAt(node, wide);
    for (const drop of [narrow, wide, narrow, wide]) {
      cleanup();
      cleanup = mountAt(node, drop);
    }
    expect(node.position.toArray()).toEqual(once.p.toArray());
    expect(node.scale.toArray()).toEqual(once.s.toArray());
    cleanup();
    expect(node.position.equals(authored)).toBe(true);
  });
});

describe("the running app calls these, not a copy (read off the source)", () => {
  const read = (p: string) => readFileSync(resolve(PLATFORM, "src", p), "utf8");

  it("VitokCockpit captures at clone time with its shell prefix and applies the canvas drop in an effect", () => {
    const src = read("components/sim/vitok/VitokCockpit.tsx");
    expect(src).toContain(`const SHELL_NODE_NAME = "${SHELL}";`);
    expect(src).toContain("const casing = captureRearMirrorCasing(root, SHELL_NODE_NAME);");
    expect(src).toContain("applyRearMirrorCasingDrop(casing, stationDropM);");
    expect(src).toContain("}, [casing, stationDropM]);");
    // No private re-implementation left behind to drift from the tested one.
    expect(src).not.toMatch(/function (captureRearMirrorCasing|applyRearMirrorCasingDrop)\b/);
  });

  it("the cabin mount the capture assumes is VitokCockpit's: y − 0.55 (and the yaw π this file's toChassis undoes)", () => {
    const src = read("components/sim/vitok/VitokCockpit.tsx");
    expect(src).toContain(`const INTERIOR_Y_OFFSET = -${INTERIOR_MOUNT_Y_OFFSET_M};`);
  });
});
