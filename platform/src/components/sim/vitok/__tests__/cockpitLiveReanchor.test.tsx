/**
 * «RE-ANCHOR THE MIRROR» — THE RUNNING COCKPIT, NOT ITS PARTS (lane mirror
 * round 4, verifier condition K1).
 *
 * Round 3 pinned every pure function the re-anchor is made of — the drops
 * (`cabinLook`), the header pad span, the mount, the casing drop and the glass
 * placement (`mirrorStation`) — and the round-3 verifier then sabotaged the
 * three LIVE inputs VitokCockpit feeds them, and all three stayed green:
 *
 *   X5  the canvas-aspect selector inverted (`s.size.height / s.size.width`).
 *       A sideways phone then reads as aspect < 1, both drops return 0, and
 *       the header pad, glass, housing, casing and mount all stop moving in
 *       the running app — the whole ruling switched off, 357 tests green;
 *   X4  the click proxy's drop multiplied by 0 (the proxy stays 11.3 mm above
 *       the glass it stands for);
 *   X11 the header pad handed a drop of 0.
 *
 * The earlier pins were source-text greps of call sites. They could not see
 * X5, because the aspect is DEFINED on a line they never read, and no grep
 * list can be complete. So this file does not read the source at all: it
 * mounts the real `VitokCockpit` through the real react-three-fiber
 * reconciler (no WebGL — `frameloop: "never"`, a stub renderer that is never
 * asked to draw), on the shipped `hero_interior.glb` shell and rear glass,
 * decoded with the same gltf-transform + draco stack the asset tools use, at
 * a real canvas size. Every number below is read off the Object3D graph the
 * component built — the buffers and transforms the GPU would draw — and each
 * one is compared against the CLAIM the lane makes, never against a restated
 * formula:
 *
 *   · 16:9 (1600 × 900) and an upright phone (393 × 852) are the shipped
 *     cabin — nothing moves;
 *   · on the audited sideways phone (852 × 393) the header pad's front edge
 *     is inside the top of the frame by the visible band, the rigged glass is
 *     entirely inside the frame, and the glass, the authored casing and the
 *     click proxy all moved by ONE rigid translation — straight down, by the
 *     station drop.
 *
 * Only the loader is replaced (`useGLTF` returns the decoded graph instead of
 * fetching it) and drei's DOM `Html` (the hotspot chip; no chip is asked for
 * here) is stubbed. What the component does with the canvas size is exactly
 * what it does in the app.
 *
 * WHAT THIS DOES NOT COVER, stated: the head at rest only (CameraRig's braking
 * pitch/lean is not mounted — that residual is `mirrorAnchor.test.ts`'s «THE
 * BRAKING RESIDUAL, STATED»), and no pixels: the re-drive photographs remain
 * the final judge of the frame.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { act, createRoot, extend, useThree } from "@react-three/fiber";
import type { RefObject } from "react";
import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { VitokCockpit } from "../VitokCockpit";
import {
  COCKPIT_HEADER_EDGE,
  HEADER_VISIBLE_BAND,
  REAR_MIRROR_STATION_DROP_MAX_M,
  projectCockpitPoint,
  rearMirrorStationDropM,
} from "@/modules/sim/scene/vitok/cabinLook";
import { CockpitInteractionContext } from "@/modules/sim/scene/vitok/hotspots";
import type { VehicleSim } from "@/modules/sim/vehicle";
import type { SimInput } from "@/modules/sim/engine";
import type { CabinControls } from "@/modules/sim/scene/cabin";

const fixture = vi.hoisted(() => ({ scene: null as unknown }));

vi.mock("@react-three/drei", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-three/drei")>();
  const useGLTF = Object.assign(() => ({ scene: fixture.scene }), {
    preload: () => undefined,
  });
  return { ...actual, useGLTF, Html: () => null };
});

// The reconciler is loaded by vitest as CommonJS, so it resolves «three» to
// three.cjs, while this file and the product source get the ES module — two
// copies of the library. R3F decides how to apply a prop by `instanceof` its
// OWN copy (a `color="#…"` string becomes a Color only if the target is ITS
// Color), so the catalogue it builds from must be that same copy, or props the
// app applies correctly would land here as raw strings. In the app the bundler
// hands everyone one copy; this restores that for the test.
extend(createRequire(import.meta.url)("three") as Parameters<typeof extend>[0]);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PLATFORM = resolve(__dirname, "../../../../..");
const GLB_PATH = resolve(PLATFORM, "public/sim/vehicles/hero_interior.glb");
/** The header pad's colour (VitokCockpit `ROOF_PAD_COLOR`) — the only thing
 *  that tells the pad apart from the headliner behind it. The finder below
 *  refuses unless exactly one mesh wears it, so a colour change fails loudly
 *  instead of silently measuring something else. */
const ROOF_PAD_HEX = 0x464c55;
/** The mount's nose (`POD_NOSE_COLOR`) and its arm + root pad
 *  (`POD_ARM_COLOR`, two meshes) — same refusal rule. */
const POD_NOSE_HEX = 0x343941;
const POD_ARM_HEX = 0x3d434c;
const REAR = "hotspot_mirror_rear";

const draco3d = createRequire(import.meta.url)("draco3dgltf") as {
  createDecoderModule: () => Promise<unknown>;
};

/**
 * The shipped GLB's shell and its three mirror glasses, laid out the way
 * GLTFLoader lays them out (three 0.185 `_loadNodeShallow` / `loadMesh`): a
 * node with ONE primitive IS its Mesh and carries the node's name and
 * transform; a node with several becomes a Group that reserves the node's
 * name FIRST («reserve node's name before its dependencies»), and its meshes
 * are then named from the glTF mesh name through the same unique-name
 * counter — so the shell is a Group `interior_shell` holding meshes
 * `interior_shell_1 … _8`.
 */
const GLB_NODES = ["interior_shell", REAR, "hotspot_mirror_left", "hotspot_mirror_right"];

async function decodeCabin(): Promise<THREE.Group> {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "draco3d.decoder": await draco3d.createDecoderModule() });
  const doc = await io.readBinary(new Uint8Array(readFileSync(GLB_PATH)));
  const used = new Map<string, number>();
  // three's GLTFParser.createUniqueName: name, name_1, name_2 …
  const unique = (n: string) => {
    const k = used.get(n);
    used.set(n, k === undefined ? 0 : k + 1);
    return k === undefined ? n : `${n}_${k + 1}`;
  };
  const root = new THREE.Group();
  for (const node of doc.getRoot().listNodes()) {
    const gmesh = node.getMesh();
    const name = node.getName();
    if (!gmesh || !GLB_NODES.includes(name)) continue;
    const prims = gmesh.listPrimitives();
    const nodeName = unique(name);
    const meshes = prims.map((prim) => {
      const geometry = new THREE.BufferGeometry();
      const src = prim.getAttribute("POSITION")!.getArray() as Float32Array;
      geometry.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(src), 3));
      const index = prim.getIndices();
      if (index) geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(index.getArray()!), 1));
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
      mesh.name = unique(gmesh.getName());
      return mesh;
    });
    const matrix = new THREE.Matrix4().fromArray(node.getMatrix());
    if (meshes.length === 1) {
      meshes[0].name = nodeName;
      meshes[0].applyMatrix4(matrix);
      root.add(meshes[0]);
    } else {
      const group = new THREE.Group();
      group.name = nodeName;
      group.applyMatrix4(matrix);
      for (const m of meshes) group.add(m);
      root.add(group);
    }
  }
  for (const n of GLB_NODES) {
    if (!root.getObjectByName(n)) throw new Error(`${n} not in the GLB`);
  }
  return root;
}

/** A renderer the reconciler can configure and never draws with. */
function stubRenderer(canvas: HTMLCanvasElement) {
  const noop = () => undefined;
  return {
    render: noop,
    setSize: noop,
    setPixelRatio: noop,
    getPixelRatio: () => 1,
    setAnimationLoop: noop,
    dispose: noop,
    domElement: canvas,
    xr: { enabled: false, isPresenting: false, addEventListener: noop, removeEventListener: noop, setAnimationLoop: noop },
    shadowMap: {},
    info: {},
    capabilities: {},
    outputColorSpace: "",
    toneMapping: 0,
  };
}

interface Mounted {
  scene: THREE.Object3D;
  unmount: () => Promise<void>;
}

/** Mount the real VitokCockpit at a canvas size, in cockpit view. */
async function mountCockpit(width: number, height: number): Promise<Mounted> {
  const canvas = {
    style: {},
    width,
    height,
    parentElement: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  await root.configure({
    gl: stubRenderer(canvas) as unknown as THREE.WebGLRenderer,
    size: { width, height, top: 0, left: 0 },
    dpr: 1,
    frameloop: "never",
  });
  let scene: THREE.Object3D | null = null;
  function Grab() {
    scene = useThree((s) => s.scene) as unknown as THREE.Object3D;
    return null;
  }
  const none = <T,>() => ({ current: null }) as RefObject<T | null>;
  await act(async () => {
    root.render(
      <CockpitInteractionContext.Provider value={{ enabled: true, highlightStepId: null }}>
        <VitokCockpit
          simRef={none<VehicleSim>()}
          inputRef={none<SimInput>()}
          cabinRef={none<CabinControls>()}
        />
        <Grab />
      </CockpitInteractionContext.Provider>,
    );
  });
  if (scene === null) throw new Error("the reconciler produced no scene");
  const s = scene as THREE.Object3D;
  s.updateMatrixWorld(true);
  return {
    scene: s,
    unmount: async () => {
      await act(async () => root.unmount());
    },
  };
}

/** Everything the mounted cockpit drew that the lane's claim is about. */
interface Reading {
  /** Header pad: world-space y of its underside/top, and z of its front face. */
  pad: { yLo: number; yHi: number; zFront: number };
  /** Rigged rear glass, world space, every vertex. */
  glass: THREE.Vector3[];
  /** The glass mesh's world position. */
  glassOrigin: THREE.Vector3;
  /** The rear click proxy's world position. */
  proxy: THREE.Vector3;
  /** Every shell vertex, world space, in traversal order. */
  shell: THREE.Vector3[];
  /** The mount: nose, and the root pad (the arm-coloured box nearest the
   *  roof root, i.e. with the smallest front z), world-space boxes. */
  nose: THREE.Box3;
  rootPad: THREE.Box3;
  /** Each door-mirror glass's LOCAL matrix as the rig left it. */
  doors: Record<"hotspot_mirror_left" | "hotspot_mirror_right", THREE.Matrix4>;
}

function worldVertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const pos = mesh.geometry.getAttribute("position");
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    out.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld));
  }
  return out;
}

function read(scene: THREE.Object3D): Reading {
  const pads: THREE.Mesh[] = [];
  const noses: THREE.Mesh[] = [];
  const arms: THREE.Mesh[] = [];
  const rears: THREE.Mesh[] = [];
  const shells: THREE.Mesh[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    const hex = Array.isArray(mat) ? null : mat?.color?.getHex?.();
    if (hex === ROOF_PAD_HEX) pads.push(mesh);
    if (hex === POD_NOSE_HEX) noses.push(mesh);
    if (hex === POD_ARM_HEX) arms.push(mesh);
    if (mesh.name === REAR) rears.push(mesh);
    if (mesh.name.startsWith("interior_shell")) shells.push(mesh);
  });
  // A matcher reports what it cannot read: each lookup must be unambiguous.
  if (pads.length !== 1) throw new Error(`expected exactly 1 header pad mesh, found ${pads.length}`);
  if (noses.length !== 1) throw new Error(`expected exactly 1 mount nose mesh, found ${noses.length}`);
  if (arms.length !== 2) throw new Error(`expected exactly 2 arm-coloured mount meshes, found ${arms.length}`);
  const armBoxes = arms.map((m) => new THREE.Box3().setFromObject(m)).sort((a, b) => a.max.z - b.max.z);
  const proxies = rears.filter((m) => (m.geometry as THREE.BoxGeometry).type === "BoxGeometry");
  const glasses = rears.filter((m) => (m.geometry as THREE.BoxGeometry).type !== "BoxGeometry");
  if (proxies.length !== 1) throw new Error(`expected exactly 1 rear click proxy, found ${proxies.length}`);
  if (glasses.length !== 1) throw new Error(`expected exactly 1 rear glass, found ${glasses.length}`);
  if (shells.length === 0) throw new Error("no interior_shell mesh in the mounted cockpit");
  const door = (name: "hotspot_mirror_left" | "hotspot_mirror_right") => {
    const found: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.name === name && m.geometry.type !== "BoxGeometry") found.push(m);
    });
    if (found.length !== 1) throw new Error(`expected exactly 1 ${name} glass, found ${found.length}`);
    return found[0].matrix.clone();
  };

  const box = new THREE.Box3().setFromObject(pads[0]);
  return {
    pad: { yLo: box.min.y, yHi: box.max.y, zFront: box.max.z },
    glass: worldVertices(glasses[0]),
    glassOrigin: glasses[0].getWorldPosition(new THREE.Vector3()),
    proxy: proxies[0].getWorldPosition(new THREE.Vector3()),
    shell: shells.flatMap(worldVertices),
    nose: new THREE.Box3().setFromObject(noses[0]),
    rootPad: armBoxes[0],
    doors: { hotspot_mirror_left: door("hotspot_mirror_left"), hotspot_mirror_right: door("hotspot_mirror_right") },
  };
}

const fy = (p: THREE.Vector3, aspect: number) =>
  projectCockpitPoint([p.x, p.y, p.z], "forward", aspect).y;
const maxFy = (pts: THREE.Vector3[], aspect: number) => Math.max(...pts.map((p) => fy(p, aspect)));

/** Per-vertex displacement between two readings of the same shell. */
function shellMoves(a: THREE.Vector3[], b: THREE.Vector3[]): THREE.Vector3[] {
  expect(b.length).toBe(a.length);
  const moved: THREE.Vector3[] = [];
  for (let i = 0; i < a.length; i++) {
    const d = b[i].clone().sub(a[i]);
    if (d.length() > 1e-7) moved.push(d);
  }
  return moved;
}

const REF = { width: 1600, height: 900 };
const PHONE = { width: 852, height: 393 };
const UPRIGHT = { width: 393, height: 852 };

let ref: Reading;
let phone: Reading;
let upright: Reading;
const mounted: Mounted[] = [];

beforeAll(async () => {
  // The hotspot layer releases a held control on window pointerup/blur; the
  // node test environment has no window, so give it an inert event target.
  vi.stubGlobal("window", new EventTarget());
  fixture.scene = await decodeCabin();
  for (const [size, set] of [
    [REF, (r: Reading) => (ref = r)],
    [PHONE, (r: Reading) => (phone = r)],
    [UPRIGHT, (r: Reading) => (upright = r)],
  ] as const) {
    const m = await mountCockpit(size.width, size.height);
    mounted.push(m);
    set(read(m.scene));
  }
}, 120_000);

afterAll(async () => {
  for (const m of mounted) await m.unmount();
  vi.unstubAllGlobals();
});

describe("the running cockpit at 16:9 — the shipped cabin, nothing moved", () => {
  it("the header pad is the shipped slab, its front edge at the header edge the drops are solved for", () => {
    // COCKPIT_HEADER_EDGE is what cabinLook solves the header drop against;
    // the pad this component draws must BE that edge, or the drop is solved
    // for a pad that is not on screen.
    expect(ref.pad.yLo).toBeCloseTo(COCKPIT_HEADER_EDGE.y, 7);
    expect(ref.pad.zFront).toBeCloseTo(COCKPIT_HEADER_EDGE.z, 7);
    expect(ref.pad.yHi - ref.pad.yLo).toBeCloseTo(0.05, 7);
  });

  it("the upright phone is the 16:9 cabin exactly — glass, proxy, pad and casing", () => {
    expect(upright.pad).toEqual(ref.pad);
    expect(upright.glassOrigin.distanceTo(ref.glassOrigin)).toBeLessThan(1e-12);
    expect(upright.proxy.distanceTo(ref.proxy)).toBeLessThan(1e-12);
    expect(shellMoves(ref.shell, upright.shell)).toHaveLength(0);
  });
});

describe("the door mirrors are not part of the re-anchor", () => {
  // REF 7/8: only the interior mirror is lifted and dropped; the door glasses
  // keep their authored GLB transform (`glassLiftM: 0`, no station drop) on
  // every canvas — «left honestly as they are» (MirrorRig's AIM TABLE).
  it.each(["hotspot_mirror_left", "hotspot_mirror_right"] as const)(
    "%s: the rig leaves the glass exactly where the GLB put it, on every canvas",
    (name) => {
      const authored = (fixture.scene as THREE.Object3D).getObjectByName(name)!.matrix;
      for (const r of [ref, phone, upright]) {
        const m = r.doors[name];
        // 1e-7: the rig recomposes the matrix from position/quaternion/scale
        // (float noise ~3e-10); a real lift is millimetres.
        for (let i = 0; i < 16; i++) expect(Math.abs(m.elements[i] - authored.elements[i])).toBeLessThan(1e-7);
      }
    },
  );
});

describe("the running cockpit on the audited sideways phone (852 × 393)", () => {
  const aspect = PHONE.width / PHONE.height;

  it("the header pad keeps its top and brings its front edge inside the frame by the visible band", () => {
    expect(phone.pad.yHi).toBeCloseTo(ref.pad.yHi, 7);
    expect(phone.pad.zFront).toBeCloseTo(ref.pad.zFront, 7);
    // Unlowered, this edge is ABOVE the frame on this canvas (the defect)…
    expect(fy(new THREE.Vector3(0, ref.pad.yLo, ref.pad.zFront), aspect)).toBeGreaterThan(1);
    // …as mounted, it is a visible rail: inside the top by the band (the
    // solver rounds UP to 0.1 mm, so it may only be further inside).
    const edge = fy(new THREE.Vector3(0, phone.pad.yLo, phone.pad.zFront), aspect);
    expect(edge).toBeLessThanOrEqual(1 - HEADER_VISIBLE_BAND + 1e-9);
    expect(edge).toBeGreaterThan(1 - HEADER_VISIBLE_BAND - 0.002);
  });

  it("the rigged glass is entirely inside the frame (it was cut at 16:9 placement) — by the ~1.8 px round 3 stated", () => {
    expect(maxFy(ref.glass, aspect)).toBeGreaterThan(1);
    expect(maxFy(phone.glass, aspect)).toBeLessThan(1);
    // cabinLook's cap block and the round-3 verifier's independent probe:
    // ~1.84 CSS px of air over the glass on this canvas, head at rest. The
    // air is small on purpose (B58 allows no more drop), which is why the
    // braking residual exists — so the number is held, not just its sign.
    const airPx = (1 - maxFy(phone.glass, aspect)) * PHONE.height;
    expect(airPx).toBeGreaterThan(1.5);
    expect(airPx).toBeLessThan(2.2);
  });

  it("the glass came straight down by the station drop — the capped 11.3 mm", () => {
    const d = phone.glassOrigin.clone().sub(ref.glassOrigin);
    expect(rearMirrorStationDropM(aspect)).toBe(REAR_MIRROR_STATION_DROP_MAX_M);
    expect(d.y).toBeCloseTo(-REAR_MIRROR_STATION_DROP_MAX_M, 9);
    expect(Math.abs(d.x)).toBeLessThan(1e-9);
    expect(Math.abs(d.z)).toBeLessThan(1e-9);
    for (let i = 0; i < phone.glass.length; i++) {
      expect(phone.glass[i].clone().sub(ref.glass[i]).distanceTo(d)).toBeLessThan(1e-9);
    }
  });

  it("the click proxy moved with the glass — the SAME translation, so a click lands on the mirror it names", () => {
    const glass = phone.glassOrigin.clone().sub(ref.glassOrigin);
    const proxy = phone.proxy.clone().sub(ref.proxy);
    expect(proxy.distanceTo(glass)).toBeLessThan(1e-9);
  });

  it("the mount followed: its nose came down with the glass, its root stayed in the roof", () => {
    const drop = REAR_MIRROR_STATION_DROP_MAX_M;
    // The nose ends on the mirror body; its underside at the front face drops
    // ~91 % of the station drop (the stalk pivots about its roof root —
    // VitokCockpit `podRuns`), so the mount stays attached to the glass.
    const noseDrop = ref.nose.min.y - phone.nose.min.y;
    expect(noseDrop).toBeGreaterThan(0.8 * drop);
    expect(noseDrop).toBeLessThanOrEqual(drop + 1e-9);
    // The root pad sits at the roof end of the pivot: it tilts with the axis
    // (measured: its top edge rises 2.7 mm) but is not carried down with
    // the glass — a mount lowered whole would move it the full 11.3.
    expect(Math.abs(ref.rootPad.max.y - phone.rootPad.max.y)).toBeLessThan(0.4 * drop);
    // 16:9 and upright: the authored mount exactly.
    expect(upright.nose.equals(ref.nose)).toBe(true);
  });

  it("the authored casing moved with the glass — every captured vertex, the same translation, nothing else", () => {
    const glass = phone.glassOrigin.clone().sub(ref.glassOrigin);
    const moved = shellMoves(ref.shell, phone.shell);
    // The 156 mirror-end vertices B58 raised (mirrorCasing.test.ts measures the
    // same set on the same asset through the pure functions).
    expect(moved).toHaveLength(156);
    for (const d of moved) expect(d.distanceTo(glass)).toBeLessThan(1e-6);
  });
});
