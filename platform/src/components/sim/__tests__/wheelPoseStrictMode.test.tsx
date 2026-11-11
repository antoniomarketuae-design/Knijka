/**
 * THE DRAWN CAR POSES ITS OWN WHEELS — UNDER STRICT MODE TOO (lane wheelpose,
 * sc-ac-crosswind:a9db1738 clause (2), XC2 / P-A9-W).
 *
 * Rig w4c read the DRAWN ghost's `wheel_FL` rotation.y = 0 on all 2148 lap-1
 * rows of the correct crosswind demo while the committed steerRad reaches
 * −0.0252 rad. The diagnosis (diagnose-w4c-a9db1738, diagnoser + adversarial
 * checker agreeing) found a product defect on the audited `next dev` device:
 * ShadowCar and HeroCarBody cloned the GLB inside a `useMemo` and wrote the
 * clone's wheel list into a ref FROM INSIDE that memo. Under React StrictMode
 * (which R3F 9.6.1 bridges into the Canvas) the dev reconciler runs a mount
 * memo twice and KEEPS THE FIRST RESULT, so `<primitive object={model}/>`
 * drew clone #1 while the ref held clone #2's wheels — and `useFrame` steered
 * and rolled four wheels nobody draws. The production build does not
 * double-invoke, so it masked the defect; every rig and audit drive runs on
 * `next dev`.
 *
 * WHAT THIS FILE DOES. It mounts the REAL `ShadowCar` and the REAL
 * `HeroCarBody` through the real react-three-fiber reconciler — the
 * `cockpitLiveReanchor.test.tsx` / `routeGuidanceStandsDown.test.tsx` pattern:
 * `createRoot` on a stub renderer that is never asked to draw, `frameloop:
 * "never"`, frames stepped with `advance` — once INSIDE `<StrictMode>` (the
 * device's condition, where the dev reconciler double-invokes the mount memo)
 * and once without it (the control). The model is the shipped
 * `hero_car.glb`, decoded with the gltf-transform + draco stack the asset
 * tools use and laid out the way GLTFLoader lays it out (a multi-primitive
 * node is a Group carrying the node's name), so `wheel_FL … wheel_RR` are the
 * real nodes in the real hierarchy. Only the loader (`useGLTF`) is replaced,
 * and it hands out ONE cached scene exactly as drei's cache does; every
 * `scene.clone(true)` the component makes is recorded, so the test can tell
 * the clone that is DRAWN (reachable from the R3F scene) from any orphan.
 *
 * Read off the Object3D graph:
 *   · the drawn graph holds exactly one car — one each of wheel_FL/FR/RL/RR,
 *     no missing wheel and no doubled model;
 *   · every wheel node `useFrame` posed is a node inside the drawn model (an
 *     orphan clone's wheels are never moved);
 *   · after N frames the DRAWN wheel_FL's rotation.y equals the steer the
 *     component was given — on the ghost, the committed crosswind correct
 *     demo's own steerRad at its minimum (≤ −0.0245 rad, the clause's
 *     number); on the student car, `sim.steerRad` — and its rotation.x (roll)
 *     has advanced.
 *
 * WHAT THIS DOES NOT COVER, stated: no pixels and no WebGL — whether the GPU
 * draws the posed node is the browser's business, and the device probe (one
 * headless load of /dev/drive-rig on a dev server serving THIS tree) is the
 * judge of that. The StrictMode double-invoke here is the reconciler's own
 * (`mountMemo` in R3F's bundled dev reconciler, the same code path the
 * diagnosis cites), not an imitation of it.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { NodeIO, type Material as GMaterial, type Node as GNode } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { act, advance, createRoot, extend, useThree } from "@react-three/fiber";
import { StrictMode, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ShadowCar } from "../ShadowCar";
import { HeroCarBody } from "../HeroCarBody";
import {
  createTraceClock,
  createTracePoint,
  parseScenarioTrace,
  sampleAt,
  type ScenarioTrace,
  type TraceClock,
} from "@/modules/sim/traces";
import type { VehicleSim } from "@/modules/sim/vehicle";

const fixture = vi.hoisted(() => ({ scene: null as unknown }));

vi.mock("@react-three/drei", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-three/drei")>();
  const useGLTF = Object.assign(() => ({ scene: fixture.scene }), {
    preload: () => undefined,
  });
  return { ...actual, useGLTF };
});

// See cockpitLiveReanchor.test.tsx: the reconciler resolves «three» as CJS.
extend(createRequire(import.meta.url)("three") as Parameters<typeof extend>[0]);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPO_ROOT = resolve(__dirname, "../../../../..");
const PLATFORM = resolve(REPO_ROOT, "platform");
const GLB_PATH = resolve(PLATFORM, "public/sim/vehicles/hero_car.glb");
const CROSSWIND_CORRECT = resolve(REPO_ROOT, "content/traces/sc-ac-crosswind/shadow-correct.trace.json");
const WHEELS = ["wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"] as const;
/** The clause's number: the committed correct demo's steer reaches −0.0252. */
const CLAUSE_STEER_RAD = -0.0245;

const draco3d = createRequire(import.meta.url)("draco3dgltf") as {
  createDecoderModule: () => Promise<unknown>;
};

/**
 * hero_car.glb laid out the way GLTFLoader lays it out (three 0.185
 * `_loadNodeShallow` / `loadMesh`): the glTF scene is a Group named after
 * it; a node whose mesh has several primitives becomes a Group that reserves
 * the node's name first and holds one Mesh per primitive, named from the
 * glTF mesh name through the unique-name counter; child nodes hang under
 * their parent. One material per glTF material, shared across primitives
 * (`car_paint`, `drl`, `tail` … — HeroCarBody matches on these names).
 */
async function decodeHeroCar(): Promise<THREE.Group> {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "draco3d.decoder": await draco3d.createDecoderModule() });
  const doc = await io.readBinary(new Uint8Array(readFileSync(GLB_PATH)));
  const used = new Map<string, number>();
  const unique = (n: string) => {
    const k = used.get(n);
    used.set(n, k === undefined ? 0 : k + 1);
    return k === undefined ? n : `${n}_${k + 1}`;
  };
  const materials = new Map<GMaterial, THREE.MeshStandardMaterial>();
  const materialFor = (m: GMaterial | null) => {
    if (!m) return new THREE.MeshStandardMaterial();
    let out = materials.get(m);
    if (!out) {
      const [r, g, b, a] = m.getBaseColorFactor();
      const [er, eg, eb] = m.getEmissiveFactor();
      out = new THREE.MeshStandardMaterial({ color: new THREE.Color(r, g, b), opacity: a });
      out.emissive.setRGB(er, eg, eb);
      out.name = m.getName();
      if (m.getDoubleSided()) out.side = THREE.DoubleSide;
      materials.set(m, out);
    }
    return out;
  };
  const build = (node: GNode): THREE.Object3D => {
    const nodeName = unique(node.getName());
    const gmesh = node.getMesh();
    let obj: THREE.Object3D;
    if (gmesh) {
      const meshes = gmesh.listPrimitives().map((prim) => {
        const geometry = new THREE.BufferGeometry();
        const src = prim.getAttribute("POSITION")!.getArray() as Float32Array;
        geometry.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(src), 3));
        const index = prim.getIndices();
        if (index) geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(index.getArray()!), 1));
        const mesh = new THREE.Mesh(geometry, materialFor(prim.getMaterial()));
        mesh.name = unique(gmesh.getName());
        return mesh;
      });
      if (meshes.length === 1) {
        obj = meshes[0];
      } else {
        obj = new THREE.Group();
        for (const m of meshes) obj.add(m);
      }
    } else {
      obj = new THREE.Group();
    }
    obj.name = nodeName;
    obj.applyMatrix4(new THREE.Matrix4().fromArray(node.getMatrix()));
    for (const child of node.listChildren()) obj.add(build(child));
    return obj;
  };
  const gscene = doc.getRoot().listScenes()[0]!;
  const root = new THREE.Group();
  root.name = gscene.getName();
  for (const n of gscene.listChildren()) root.add(build(n));
  for (const w of WHEELS) if (!root.getObjectByName(w)) throw new Error(`${w} not in the GLB`);
  return root;
}

/** Every `clone(true)` the component makes of the ONE cached scene. */
let clones: THREE.Object3D[] = [];
let cached: THREE.Group;

type G = Record<string, unknown>;
const g = globalThis as G;
const saved: Record<string, unknown> = {};

beforeAll(async () => {
  cached = await decodeHeroCar();
  const own = cached.clone.bind(cached);
  cached.clone = ((recursive?: boolean) => {
    const c = own(recursive);
    clones.push(c);
    return c;
  }) as typeof cached.clone;
  fixture.scene = cached;
  // ShadowCar paints its 👀 / ❌ sprites on a 2-D canvas: a document whose
  // canvases accept every call (routeGuidanceStandsDown.test.tsx's stub).
  for (const k of ["document"]) saved[k] = g[k];
  const ctx = new Proxy(
    {},
    { get: (_t, p) => (p === "measureText" ? () => ({ width: 0 }) : () => undefined), set: () => true },
  );
  g.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) };
});
afterAll(() => {
  for (const k of Object.keys(saved)) g[k] = saved[k];
});

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
  /** Step `n` frames of 1/60 s through the real frame loop. */
  frames: (n: number) => Promise<void>;
  unmount: () => Promise<void>;
}

async function mount(child: ReactNode, strict: boolean): Promise<Mounted> {
  clones = [];
  const canvas = {
    style: {},
    width: 800,
    height: 450,
    parentElement: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLCanvasElement;
  const root = createRoot(canvas);
  await root.configure({
    gl: stubRenderer(canvas) as unknown as THREE.WebGLRenderer,
    size: { width: 800, height: 450, top: 0, left: 0 },
    dpr: 1,
    frameloop: "never",
  });
  let scene: THREE.Object3D | null = null;
  function Grab() {
    scene = useThree((s) => s.scene) as unknown as THREE.Object3D;
    return null;
  }
  const tree = (
    <>
      {child}
      <Grab />
    </>
  );
  await act(async () => {
    root.render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  });
  if (scene === null) throw new Error("the reconciler produced no scene");
  let tSec = 0;
  return {
    scene: scene as THREE.Object3D,
    frames: async (n: number) => {
      await act(async () => {
        for (let i = 0; i < n; i++) {
          tSec += 1 / 60;
          advance(tSec, true);
        }
      });
    },
    unmount: async () => {
      await act(async () => root.unmount());
    },
  };
}

/** True when `o` hangs (transitively) under `anc`. */
function inside(anc: THREE.Object3D, o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p !== null; p = p.parent) if (p === anc) return true;
  return false;
}

/** The drawn graph's wheel nodes, by name — refusing anything ambiguous. */
function drawnWheels(scene: THREE.Object3D): Record<(typeof WHEELS)[number], THREE.Object3D> {
  const found: Record<string, THREE.Object3D[]> = {};
  scene.traverse((o) => {
    if ((WHEELS as readonly string[]).includes(o.name)) (found[o.name] ??= []).push(o);
  });
  const out = {} as Record<(typeof WHEELS)[number], THREE.Object3D>;
  for (const w of WHEELS) {
    const list = found[w] ?? [];
    if (list.length !== 1) throw new Error(`the drawn graph holds ${list.length} × ${w} (expected exactly 1 — a missing wheel or a doubled model)`);
    out[w] = list[0];
  }
  return out;
}

/** Every recorded clone's wheel nodes that a frame moved off the rest pose,
 *  and whether each is inside the drawn model. */
function posedWheelNodes(drawnModel: THREE.Object3D): Array<{ name: string; inDrawn: boolean; rotY: number; rotX: number }> {
  const out: Array<{ name: string; inDrawn: boolean; rotY: number; rotX: number }> = [];
  for (const c of clones) {
    for (const w of WHEELS) {
      const n = c.getObjectByName(w);
      if (n && (n.rotation.x !== 0 || n.rotation.y !== 0)) {
        out.push({ name: w, inDrawn: inside(drawnModel, n), rotY: n.rotation.y, rotX: n.rotation.x });
      }
    }
  }
  return out;
}

/** Each drawn wheel's Euler order — the components set "YXZ" so the steer
 *  (Y) is applied before the roll (X); integration condition C1 pins it. */
function eulerOrders(drawn: Record<(typeof WHEELS)[number], THREE.Object3D>): string[] {
  return WHEELS.map((w) => `${w} ${drawn[w].rotation.order}`);
}
const ALL_YXZ = WHEELS.map((w) => `${w} YXZ`);

/** The recorded clone the R3F scene actually holds. */
function drawnClone(scene: THREE.Object3D): THREE.Object3D {
  const attached = clones.filter((c) => inside(scene, c));
  if (attached.length !== 1) throw new Error(`${attached.length} clones are in the drawn graph (expected exactly 1)`);
  return attached[0];
}

// ── the ghost on the committed crosswind correct demo ───────────────────────

const trace: ScenarioTrace = parseScenarioTrace(JSON.parse(readFileSync(CROSSWIND_CORRECT, "utf-8")))!;
/** The sample where the committed steer is at its minimum (into the wind). */
const minSample = trace.samples.reduce((a, b) => (b.steerRad < a.steerRad ? b : a));

async function driveGhost(strict: boolean) {
  const clock = createTraceClock();
  // Play from 0.5 s before the committed minimum and stop ON it.
  const N = 30;
  clock.tSec = minSample.tSec - N / 60;
  clock.playing = true;
  const clockRef = { current: clock } as RefObject<TraceClock>;
  const m = await mount(<ShadowCar trace={trace} clockRef={clockRef} showRibbon={false} />, strict);
  try {
    await m.frames(N);
    const drawn = drawnWheels(m.scene);
    const model = drawnClone(m.scene);
    const pt = createTracePoint();
    sampleAt(trace, clock.tSec, pt);
    return {
      cloneCount: clones.length,
      drawn,
      model,
      posed: posedWheelNodes(model),
      steerAtClock: pt.steerRad,
      orders: eulerOrders(drawn),
      drawnFL: { rotY: drawn.wheel_FL.rotation.y, rotX: drawn.wheel_FL.rotation.x },
      drawnRL: { rotY: drawn.wheel_RL.rotation.y, rotX: drawn.wheel_RL.rotation.x },
    };
  } finally {
    await m.unmount();
  }
}

describe("ShadowCar poses the wheels of the ghost it DRAWS (sc-ac-crosswind correct demo)", () => {
  it("the committed demo really steers into the wind at the instant the test stops on", () => {
    expect(minSample.steerRad).toBeLessThanOrEqual(CLAUSE_STEER_RAD);
  });

  for (const strict of [true, false]) {
    const tag = strict ? "inside <StrictMode> (the next dev device)" : "without StrictMode (control)";
    it(`${tag}: one car is drawn, every posed wheel is inside it, and the drawn wheel_FL steers to the committed steerRad and rolls`, async () => {
      const r = await driveGhost(strict);
      if (strict) expect(r.cloneCount, "StrictMode must double-invoke the mount memo, or this case tests nothing").toBeGreaterThanOrEqual(2);
      // Every wheel useFrame moved is a wheel of the drawn model …
      const orphans = r.posed.filter((p) => !p.inDrawn).map((p) => `${p.name} rotY ${p.rotY.toFixed(4)}`);
      expect(orphans, "useFrame posed wheels of a clone that is never drawn").toEqual([]);
      // … and the drawn front wheel shows the committed steer, the rear none.
      expect(r.drawnFL.rotY, "drawn wheel_FL rotation.y ≠ the committed steerRad").toBeCloseTo(r.steerAtClock, 9);
      expect(r.drawnFL.rotY).toBeLessThanOrEqual(CLAUSE_STEER_RAD);
      expect(r.drawnRL.rotY).toBe(0);
      // Roll advanced on the drawn wheels (the demo is moving here).
      expect(r.drawnFL.rotX, "drawn wheel_FL never rolled").toBeGreaterThan(0);
      expect(r.drawnRL.rotX).toBe(r.drawnFL.rotX);
      // Steer before roll: every drawn wheel rotates in YXZ order (C1).
      expect(r.orders, "a drawn ghost wheel is not in YXZ Euler order (steer before roll)").toEqual(ALL_YXZ);
    });
  }
});

// ── the student car's exterior shell ────────────────────────────────────────

async function driveHero(strict: boolean, steerRad: number, speedKmh: number) {
  const simRef = { current: { steerRad, speedKmh } as unknown as VehicleSim } as RefObject<VehicleSim | null>;
  const m = await mount(<HeroCarBody simRef={simRef} />, strict);
  try {
    const N = 20;
    await m.frames(N);
    const drawn = drawnWheels(m.scene);
    const model = drawnClone(m.scene);
    return {
      cloneCount: clones.length,
      posed: posedWheelNodes(model),
      drawnFL: { rotY: drawn.wheel_FL.rotation.y, rotX: drawn.wheel_FL.rotation.x },
      drawnFR: { rotY: drawn.wheel_FR.rotation.y },
      drawnRR: { rotY: drawn.wheel_RR.rotation.y, rotX: drawn.wheel_RR.rotation.x },
      orders: eulerOrders(drawn),
    };
  } finally {
    await m.unmount();
  }
}

describe("HeroCarBody poses the road wheels of the shell it DRAWS", () => {
  for (const strict of [true, false]) {
    const tag = strict ? "inside <StrictMode> (the next dev device)" : "without StrictMode (control)";
    it(`${tag}: one car is drawn, every posed wheel is inside it, the drawn front pair steers to sim.steerRad and every wheel rolls`, async () => {
      const steer = -0.21;
      const r = await driveHero(strict, steer, 36);
      if (strict) expect(r.cloneCount, "StrictMode must double-invoke the mount memo, or this case tests nothing").toBeGreaterThanOrEqual(2);
      const orphans = r.posed.filter((p) => !p.inDrawn).map((p) => `${p.name} rotY ${p.rotY.toFixed(4)}`);
      expect(orphans, "useFrame posed wheels of a clone that is never drawn").toEqual([]);
      expect(r.drawnFL.rotY, "drawn wheel_FL rotation.y ≠ sim.steerRad").toBeCloseTo(steer, 12);
      expect(r.drawnFR.rotY).toBeCloseTo(steer, 12);
      expect(r.drawnRR.rotY).toBe(0);
      expect(r.drawnFL.rotX, "drawn wheel_FL never rolled").toBeGreaterThan(0);
      expect(r.drawnRR.rotX).toBe(r.drawnFL.rotX);
      // Steer before roll: every drawn wheel rotates in YXZ order (C1).
      expect(r.orders, "a drawn student-car wheel is not in YXZ Euler order (steer before roll)").toEqual(ALL_YXZ);
    });
  }
});
