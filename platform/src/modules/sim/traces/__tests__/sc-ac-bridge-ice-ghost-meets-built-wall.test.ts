/**
 * THE GHOST, ITS CARD AND ITS WORDS AGREE WITH THE BRIDGE THE STUDENT SEES.
 *
 * Row sc-ac-ice:86eab7e9, round-1 verifier F3/F4. Once the deck and its
 * parapets were BUILT (world/builders/bridgeDeck.ts), three things the lesson
 * shows over it had to be re-measured against that built wall rather than
 * against the recorder's own obstacle rects:
 *
 *   F3  „Спирачка ВЪРХУ леда" drove the ghost's front corner 0.75 m INTO the
 *       concrete parapet (touch at t = 23.30 s, rest at x = 9.30, y = 296) and
 *       left it there for the last 1.5 s of the replay — the recorder only
 *       BOOKS a contact, it never stops the pose. A ghost that sits inside a
 *       wall is a frame no student should be shown.
 *   F4  that demo's card said the car found «банкета», and the road-speed
 *       card sent the car «към банкета», over a replay on the DECK — where the
 *       lesson's own `teach.whyBg` says there is «нито банкет …, само парапет».
 *
 * The ghost is measured WHERE AND AS BIG AS THE PRODUCT DRAWS IT, and nothing
 * about the drawing is copied (round-2 verifier X5: a copy of the fit stayed
 * green while ShadowCar drew the ghost 20 % wider; round-3 verifier Y5–Y7: a
 * render-time `scale * 1.2`, a van.glb in place of hero_car.glb, or a +0.8 m
 * pose offset in `useFrame` all stayed green, because the test stopped at the
 * fit memo). So `ShadowCar` is MOUNTED (modules/sim/hud/__tests__/hookHarness —
 * real hooks, no DOM) and its returned tree is turned into three.js objects by
 * a mini-mounter that applies every `position` / `rotation` / `scale` /
 * `visible` / `ref` on the path to the `<primitive>` and refuses any component
 * it cannot read; its OWN `useFrame` callback then poses that tree at each
 * sample's time. The drawn body is every mesh's box corners through the full
 * world matrix — pose group, fit group, the model's own node transforms.
 * `useGLTF` hands it a stand-in built from the file AT THE URL IT ASKED FOR
 * (every node with its transform and name, every mesh primitive as a buffer of
 * its POSITION accessor's min/max corners — hero_car.glb is ≈ 4.22 m long at
 * the 1.70 m collider width, longer than the 4.04 m chassis box the recorder
 * grades with). The wall is read off the BUILT world of the LESSON
 * (`buildLessonWorldCore`), never off a constant.
 */
import fs from "node:fs";
import path from "node:path";
import { isValidElement } from "react";
import * as THREE from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";

// The replaced seams: drei's loader (it gets the stand-in of the file at the
// URL ShadowCar asks for) and R3F's `useFrame` (recorded, then called by the
// test with the playback clock at each sample's time).
const probe = vi.hoisted(() => ({
  urls: [] as string[],
  frames: [] as ((state: unknown, delta: number) => void)[],
  standIn: null as null | ((url: string) => unknown),
}));
vi.mock("@react-three/drei", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-three/drei")>();
  const useGLTF = Object.assign(
    (url: string) => {
      probe.urls.push(url);
      return { scene: probe.standIn!(url) };
    },
    { preload: () => {} },
  );
  return { ...actual, useGLTF };
});
vi.mock("@react-three/fiber", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-three/fiber")>();
  return {
    ...actual,
    useFrame: (cb: (state: unknown, delta: number) => void) => {
      probe.frames.push(cb);
    },
  };
});

import { GHOST_WIDTH_M, ShadowCar } from "@/components/sim/ShadowCar";
import { mountHook } from "@/modules/sim/hud/__tests__/hookHarness";
import { CHASSIS_HALF_EXTENTS } from "../../vehicle";
import { compileScenario } from "../../lessons/scenario";
import { SC_AC_BRIDGE_ICE } from "../../lessons/scenario/templates-conditions2";
import { buildLessonWorldCore } from "../../scene/lessonWorldRecipe";
import { edgeBridgeSpans } from "../../world/builders/bridgeDeck";
import type { WorldGeometry } from "../../world";
import { parseScenarioTrace } from "../parse";
import type { ScenarioTrace } from "../types";

const ROOT = process.cwd(); // platform/
const REPO = path.resolve(ROOT, "..");
/** The hero model every ghost is (ADR-001: the fictional hero car). */
const HERO_GLB = "/sim/vehicles/hero_car.glb";

function loadTrace(rel: string): ScenarioTrace {
  const t = parseScenarioTrace(JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8")));
  if (!t) throw new Error(`unparseable ${rel}`);
  return t;
}

/**
 * A stand-in for a .glb under public/ that has the real file's bounds: the node
 * tree of its glTF JSON (names, transforms) with each mesh primitive as a
 * buffer of its POSITION accessor's 8 min/max corners. Every bound the product
 * computes on the loaded model it computes the same on this.
 */
function glbStandIn(url: string): THREE.Group {
  const buf = fs.readFileSync(path.join(ROOT, "public", url.replace(/^\/+/, "")));
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8")) as {
    scene?: number;
    scenes: { nodes: number[] }[];
    nodes: {
      name?: string;
      mesh?: number;
      children?: number[];
      matrix?: number[];
      translation?: number[];
      rotation?: number[];
      scale?: number[];
    }[];
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    accessors: { min: number[]; max: number[] }[];
  };
  const make = (ni: number): THREE.Object3D => {
    const n = gltf.nodes[ni]!;
    const o = new THREE.Group();
    o.name = n.name ?? "";
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    else {
      o.position.fromArray(n.translation ?? [0, 0, 0]);
      o.quaternion.fromArray(n.rotation ?? [0, 0, 0, 1]);
      o.scale.fromArray(n.scale ?? [1, 1, 1]);
    }
    if (n.mesh !== undefined) {
      for (const p of gltf.meshes[n.mesh]!.primitives) {
        const a = gltf.accessors[p.attributes.POSITION]!;
        const pts: number[] = [];
        for (const x of [a.min[0]!, a.max[0]!])
          for (const y of [a.min[1]!, a.max[1]!]) for (const z of [a.min[2]!, a.max[2]!]) pts.push(x, y, z);
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        o.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial()));
      }
    }
    for (const c of n.children ?? []) o.add(make(c));
    return o;
  };
  const scene = new THREE.Group();
  for (const r of gltf.scenes[gltf.scene ?? 0]!.nodes) scene.add(make(r));
  return scene;
}

/** Transform props R3F applies to an intrinsic element's Object3D. */
function applyTransform(o: THREE.Object3D, p: Record<string, unknown>): void {
  if (Array.isArray(p.position)) o.position.fromArray(p.position as number[]);
  if (Array.isArray(p.rotation)) o.rotation.fromArray(p.rotation as [number, number, number]);
  if (typeof p.scale === "number") o.scale.setScalar(p.scale);
  else if (Array.isArray(p.scale)) o.scale.fromArray(p.scale as number[]);
  if (typeof p.visible === "boolean") o.visible = p.visible;
  const ref = p.ref as { current?: unknown } | undefined;
  if (ref && typeof ref === "object" && "current" in ref) ref.current = o;
}

/**
 * The part of R3F this measurement needs: intrinsic elements become Object3Ds
 * with their transform props applied and their refs attached, `<primitive>`
 * attaches its object. Groups are descended into; the leaves (meshes, sprites)
 * get an Object3D for their ref and are not descended (their children are
 * geometries and materials, which place nothing). A function component in the
 * tree is refused: a mounter that cannot read something must say so.
 */
function miniMount(node: unknown, parent: THREE.Object3D): void {
  if (Array.isArray(node)) {
    for (const c of node) miniMount(c, parent);
    return;
  }
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (!isValidElement(node)) throw new Error(`mini-mounter cannot read ${String(node)}`);
  const p = node.props as Record<string, unknown>;
  if (typeof node.type === "symbol") return miniMount(p.children, parent); // fragment
  if (typeof node.type !== "string") {
    throw new Error(`mini-mounter cannot read component ${(node.type as { name?: string }).name ?? "?"}`);
  }
  const o = node.type === "primitive" ? (p.object as THREE.Object3D) : new THREE.Object3D();
  if (node.type === "primitive" && !(o instanceof THREE.Object3D)) throw new Error("<primitive> without an Object3D");
  applyTransform(o, p);
  parent.add(o);
  if (node.type === "group") miniMount(p.children, o);
}

/** The drawn ghost of one trace: its mounted root and its own frame callback. */
interface DrawnGhost {
  root: THREE.Object3D;
  poseAt: (tSec: number) => void;
  unmount: () => void;
}

function drawGhost(trace: ScenarioTrace): DrawnGhost {
  probe.urls.length = 0;
  probe.frames.length = 0;
  probe.standIn = (url) => glbStandIn(url);
  const clockRef = { current: { tSec: 0, playing: false, speed: 1, loop: null } };
  const canvasDoc = {
    documentElement: { dataset: {}, style: { setProperty() {} } },
    body: { dataset: {} },
    addEventListener() {},
    removeEventListener() {},
    createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => null }),
  };
  const mounted = mountHook(
    () => ShadowCar({ trace, clockRef, district: null } as unknown as Parameters<typeof ShadowCar>[0]),
    { document: canvasDoc },
  );
  const root = new THREE.Group();
  miniMount(mounted.value, root);
  const frame = probe.frames[0];
  if (!frame || probe.frames.length !== 1) throw new Error(`ShadowCar registered ${probe.frames.length} frame callbacks`);
  const camera = { position: new THREE.Vector3(1e6, 1e6, 1e6) };
  return {
    root,
    poseAt: (tSec: number) => {
      clockRef.current.tSec = tSec;
      frame({ camera, clock: { elapsedTime: 0 } }, 0);
      root.updateMatrixWorld(true);
    },
    unmount: () => mounted.unmount(),
  };
}

/** District-space (x, y) of every drawn mesh-box corner of the ghost, as posed. */
function drawnPoints(g: DrawnGhost): [number, number][] {
  const out: [number, number][] = [];
  const v = new THREE.Vector3();
  let meshes = 0;
  g.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    // Only the MODEL's meshes: the stand-in's boxes (lamps and sprites are
    // placeholders without geometry).
    const pos = mesh.geometry.getAttribute("position");
    if (!pos) return;
    meshes++;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      out.push([v.x, -v.z]);
    }
  });
  if (meshes === 0) throw new Error("no drawn mesh reached the scene — the ghost is not on screen");
  return out;
}

interface Face {
  side: 1 | -1;
  /** |x| of the face the carriageway side meets. */
  inner: number;
  from: number;
  to: number;
}

/** The inner faces of every wall the built world draws along the edge. */
function builtFaces(w: WorldGeometry, from: number, to: number): Face[] {
  const faces: Face[] = [];
  const p = w.bridgeDecks.parapets.positions;
  for (const side of [1, -1] as const) {
    let inner = Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]!;
      const y = -p[i + 2]!;
      if (Math.sign(x) === side && y >= from && y <= to) inner = Math.min(inner, Math.abs(x));
    }
    if (Number.isFinite(inner)) faces.push({ side, inner, from, to });
  }
  return faces;
}

/** Deepest penetration (m) of the drawn body into any face. */
function penetration(points: [number, number][], faces: Face[]): number {
  let worst = -Infinity;
  for (const [cx, cy] of points) {
    for (const f of faces) {
      if (Math.sign(cx) !== f.side || cy < f.from || cy > f.to) continue;
      worst = Math.max(worst, Math.abs(cx) - f.inner);
    }
  }
  return worst;
}

const NAMES = ["shadow-correct", "mistake-road-speed", "mistake-brake-on-deck"] as const;
const refOf = (name: (typeof NAMES)[number]) =>
  name === "shadow-correct"
    ? SC_AC_BRIDGE_ICE.shadow.path
    : SC_AC_BRIDGE_ICE.mistakes.find((m) => m.traceRef.path.endsWith(`${name}.trace.json`))!.traceRef.path;

describe("F3 — the ghost never stands inside the wall the world draws", () => {
  let world: WorldGeometry;
  let faces: Face[];
  let span: { fromM: number; toM: number };
  const ghosts = new Map<string, { trace: ScenarioTrace; ghost: DrawnGhost }>();

  beforeAll(() => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(ROOT, "public", "world", `${SC_AC_BRIDGE_ICE.map.districtId}.json`), "utf8"),
    ) as unknown;
    const core = buildLessonWorldCore(compileScenario(SC_AC_BRIDGE_ICE, 1), raw);
    world = core.geometry;
    const edge = core.district.roads.edges[0]!;
    span = edgeBridgeSpans(edge)[0]!;
    faces = builtFaces(world, span.fromM, span.toM);
    for (const name of NAMES) {
      const trace = loadTrace(refOf(name));
      ghosts.set(name, { trace, ghost: drawGhost(trace) });
    }
    return () => {
      for (const { ghost } of [...ghosts.values()].reverse()) ghost.unmount();
    };
  });

  it("ShadowCar loads the hero car and nothing else", () => {
    const again = drawGhost(ghosts.get("shadow-correct")!.trace);
    try {
      expect(probe.urls.length).toBeGreaterThan(0);
      expect(new Set(probe.urls)).toEqual(new Set([HERO_GLB]));
    } finally {
      again.unmount();
    }
  });

  it("the ghost is DRAWN at the collider width (GHOST_WIDTH_M), centred on the trace pose, and at least as big as the chassis box", () => {
    const { trace, ghost } = ghosts.get("shadow-correct")!;
    // A straight, heading-0 sample: the drawn body's extents are its half-sizes.
    const s = trace.samples.find((q) => q.headingDeg === 0 && q.tSec > 1)!;
    ghost.poseAt(s.tSec);
    const pts = drawnPoints(ghost);
    const xs = pts.map(([x]) => x);
    const ys = pts.map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs);
    expect(Math.abs(width - GHOST_WIDTH_M)).toBeLessThan(1e-6);
    expect(GHOST_WIDTH_M).toBe(CHASSIS_HALF_EXTENTS.x * 2);
    const halfW = Math.max(...xs.map((x) => Math.abs(x - s.x)));
    const halfL = Math.max(...ys.map((y) => Math.abs(y - s.y)));
    expect(halfW).toBeGreaterThanOrEqual(CHASSIS_HALF_EXTENTS.x - 1e-6);
    expect(halfW).toBeLessThan(CHASSIS_HALF_EXTENTS.x + 0.02);
    expect(halfL).toBeGreaterThanOrEqual(CHASSIS_HALF_EXTENTS.z);
    expect(halfL).toBeLessThan(2.4);
  });

  it("the drawn ghost turns WITH the trace heading (the pose is applied, not only the position)", () => {
    const { trace, ghost } = ghosts.get("mistake-brake-on-deck")!;
    const s = trace.samples.find((q) => q.headingDeg > 8)!;
    ghost.poseAt(s.tSec);
    const pts = drawnPoints(ghost);
    // Measured across the trace heading (0° = north, clockwise positive) the
    // drawn body is only as wide as the car; a ghost drawn at heading 0 while
    // the trace says 8.9° would be ~2.3 m across that axis.
    const h = (s.headingDeg * Math.PI) / 180;
    const across = pts.map(([x, y]) => x * Math.cos(h) - y * Math.sin(h));
    const along = pts.map(([x, y]) => x * Math.sin(h) + y * Math.cos(h));
    expect(Math.max(...across) - Math.min(...across)).toBeLessThan(GHOST_WIDTH_M + 0.02);
    expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(2 * CHASSIS_HALF_EXTENTS.z);
  });

  it("both parapets are built, as straight faces, at the span", () => {
    expect(faces).toHaveLength(2);
    for (const f of faces) expect(f.inner).toBeGreaterThan(8.125);
  });

  for (const name of NAMES) {
    it(`${name}: the drawn body never enters a parapet by more than 5 cm`, () => {
      const { trace, ghost } = ghosts.get(name)!;
      let worst = -Infinity;
      let at = -1;
      for (const s of trace.samples) {
        ghost.poseAt(s.tSec);
        const p = penetration(drawnPoints(ghost), faces);
        if (p > worst) {
          worst = p;
          at = s.tSec;
        }
      }
      expect(worst, `deepest at t=${at}`).toBeLessThanOrEqual(0.05);
    });
  }

  it("„Спирачка ВЪРХУ леда“ ENDS AT the wall: it reaches the face and does not move on", () => {
    const { trace, ghost } = ghosts.get("mistake-brake-on-deck")!;
    const pen = trace.samples.map((s) => {
      ghost.poseAt(s.tSec);
      return penetration(drawnPoints(ghost), faces);
    });
    const first = pen.findIndex((p) => p >= -0.05);
    expect(first, "the demo never reaches the wall").toBeGreaterThanOrEqual(0);
    // From the first touch to the end of the replay the car moves ≤ 15 cm:
    // the wall is what stopped it, visibly.
    const a = trace.samples[first]!;
    const z = trace.samples[trace.samples.length - 1]!;
    expect(Math.hypot(z.x - a.x, z.y - a.y)).toBeLessThanOrEqual(0.15);
    // …and it is on the deck, where the parapet is.
    expect(z.y).toBeGreaterThan(span.fromM);
    expect(z.y).toBeLessThan(span.toM);
  });
});

describe("F4 — the demo cards and the demo's own words say what the built world shows", () => {
  let world: WorldGeometry;
  let span: { fromM: number; toM: number };

  beforeAll(() => {
    const raw = JSON.parse(
      fs.readFileSync(path.join(ROOT, "public", "world", `${SC_AC_BRIDGE_ICE.map.districtId}.json`), "utf8"),
    ) as unknown;
    const core = buildLessonWorldCore(compileScenario(SC_AC_BRIDGE_ICE, 1), raw);
    world = core.geometry;
    span = edgeBridgeSpans(core.district.roads.edges[0]!)[0]!;
  });

  it("a demo that leaves its line ON THE DECK never lands on a «банкет» — there it meets the parapet", () => {
    // The deck is built with a parapet and no verge; the template's own
    // teach.whyBg says so («нито банкет да избягаш, само парапет»).
    expect(SC_AC_BRIDGE_ICE.teach.whyBg).toMatch(/нито банкет/u);
    expect(world.stats.bridgeParapets).toBe(2);
    for (const m of SC_AC_BRIDGE_ICE.mistakes) {
      const trace = loadTrace(m.traceRef.path);
      // Where the demo is furthest off its lane — the moment the card narrates.
      const peak = trace.samples.reduce((a, s) => (Math.abs(s.x - 4.06) > Math.abs(a.x - 4.06) ? s : a));
      if (peak.y < span.fromM || peak.y > span.toM) continue;
      expect(m.whatWentWrongBg, m.titleBg).not.toMatch(/банкет/iu);
      expect(m.whatWentWrongBg, m.titleBg).toMatch(/парапет/iu);
    }
  });

  it("the collision card's distance and speeds are the recording's own", () => {
    const m = SC_AC_BRIDGE_ICE.mistakes.find((q) => q.codeRefs.includes("COLLISION"))!;
    const trace = loadTrace(m.traceRef.path);
    const braking = trace.samples.filter((s) => s.brakeOn && Math.abs(s.speedKmh) > 0.5);
    expect(braking.length).toBeGreaterThan(0);
    const b0 = braking[0]!;
    const b1 = braking[braking.length - 1]!;
    let dist = 0;
    for (let i = trace.samples.indexOf(b0) + 1; i <= trace.samples.indexOf(b1); i++) {
      const p = trace.samples[i - 1]!;
      const q = trace.samples[i]!;
      dist += Math.hypot(q.x - p.x, q.y - p.y);
    }
    const said = m.whatWentWrongBg.match(/за (?:около )?(\d+) метра с натисната/u);
    expect(said, "the card states the braking distance").not.toBeNull();
    expect(Math.abs(Number(said![1]) - dist)).toBeLessThanOrEqual(1);
    const kmh = m.whatWentWrongBg.match(/падна от (\d+) на (\d+) км\/ч/u);
    expect(kmh).not.toBeNull();
    expect(Math.abs(Number(kmh![1]) - b0.speedKmh)).toBeLessThanOrEqual(1);
    expect(Math.abs(Number(kmh![2]) - b1.speedKmh)).toBeLessThanOrEqual(1);
  });

  it("no briefing line says the end of the ice is unmarked — the far abutment stands exactly there", () => {
    // The far pylons rise above the parapet top at the span's end.
    const p = world.bridgeDecks.parapets.positions;
    let tallAtEnd = 0;
    for (let i = 0; i < p.length; i += 3) {
      if (Math.abs(-p[i + 2]! - span.toM) < 1.7 && p[i + 1]! > 1.4) tallAtEnd++;
    }
    expect(tallAtEnd).toBeGreaterThan(0);
    for (const s of SC_AC_BRIDGE_ICE.instructionsBg) {
      expect(s.textBg, `instruction ${s.n}`).not.toMatch(/не е обозначен/iu);
    }
  });

  it("the demos' own annotations: the А15 is where the world posts it, and no ravine is promised", () => {
    const a15 = world.signs.filter((s) => s.kind === "slippery").map((s) => -s.position[2]);
    expect(a15).toHaveLength(1);
    const a15AtAbutment = Math.abs(a15[0]! - span.fromM) < 10;
    for (const name of NAMES) {
      const trace = loadTrace(refOf(name));
      for (const e of trace.events.filter((q) => q.kind === "annotation")) {
        const t = e.textBg ?? "";
        // The world builds no gorge (bridgeDeck.ts: the ground backdrop would
        // cover one), so „над дерето" points at nothing.
        expect(t, `${name}: ${t}`).not.toMatch(/дере/iu);
        if (!a15AtAbutment) expect(t, `${name}: ${t}`).not.toMatch(/А15[^.]*устой/iu);
      }
    }
  });

  it("every «behind us / ahead of us» annotation is true at the ghost's own position when it is shown (no escape clause)", () => {
    // Round-2 verifier X6: the check above steps aside once the А15 is within
    // 10 m of the abutment. This one does not: it reads where the ghost IS at
    // the annotation's time and holds each spatial claim against the built
    // sign and the built span.
    const a15y = world.signs.filter((s) => s.kind === "slippery").map((s) => -s.position[2])[0]!;
    let checked = 0;
    for (const name of NAMES) {
      const trace = loadTrace(refOf(name));
      for (const e of trace.events.filter((q) => q.kind === "annotation")) {
        const t = e.textBg ?? "";
        const at = trace.samples.reduce((a, s) => (Math.abs(s.tSec - e.tSec) < Math.abs(a.tSec - e.tSec) ? s : a));
        const y = at.y;
        const where = `${name} @${e.tSec.toFixed(1)}s y=${y.toFixed(1)}: ${t}`;
        if (/А15 остана зад нас/iu.test(t)) {
          expect(y, where).toBeGreaterThan(a15y);
          checked++;
        }
        if (/устоят е пред нас|напред са устоите/iu.test(t)) {
          expect(y, where).toBeLessThan(span.fromM);
          checked++;
        }
        if (/устоят е зад нас/iu.test(t)) {
          expect(y, where).toBeGreaterThan(span.toM);
          checked++;
        }
      }
    }
    // The three shadow annotations that make these claims are all present.
    expect(checked).toBeGreaterThanOrEqual(4);
  });
});
