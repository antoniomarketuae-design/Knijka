/**
 * sc-sig-controller-postures:784b2ca7 — THE HEAD THE LESSON CALLS ЗАГАСНАЛ, AS IT IS PAINTED: the world's own head
 * components, mounted and run.
 *
 * WHY THIS FILE EXISTS (the landing; verifier condition F5, mutants V5 and V9). The repair's render half was held by
 * two things: the lens TABLE (`signalHeadLenses.ts`, read by controller-dark-lamp-head-and-voice §1) and a source
 * regex that the paint functions mention it (`signal-lens-look.test.ts`: /VEHICLE_LENSES_LIT\[state\]/). Neither RUNS
 * the paint. With `state === "darkControlled" ? [true, false, false] : VEHICLE_LENSES_LIT[state] ?? …` in
 * `lampColorsFor` — the table untouched, the text the regex wants still there — the officer's dead head is painted
 * lit RED and all 59 tests stayed green (V5); the same edit in `pedLampColors` lights the walker's red (V9).
 *
 * WHAT RUNS HERE. `WorldPropsGroup` — the exported group `DistrictWorld` mounts — is rendered on the project's hook
 * harness (`hud/__tests__/hookHarness`: React's hooks through its dispatcher slot, effects run); its tree is walked
 * for the head pass it mounts and that component (`TrafficLights`, module-private, taken off the tree with the very
 * props the group hands it) is mounted the same way; so is the `PedestrianSignals` its tree mounts. Their `useFrame`
 * callbacks — the per-frame loops that ask every head for its state and write the lens colours — are captured and
 * CALLED, and what is asserted is what they wrote: the instance colours of the emissive `InstancedMesh` each head is
 * drawn from (additive pass: black = that lens draws nothing), and the caption painted into the label canvas.
 *
 * WHAT IS REAL: the components, their `useMemo`/`useEffect`/`useRef` bodies, their frame callbacks, three.js's
 * `InstancedMesh`, the lesson's built world (`buildLessonWorldCore` — the head placements), and in §3/§4 the lesson's
 * live runtime (`buildLiveWorld`, the director staging the officer) asked through the same arrow LessonScene hands
 * down (`(id, bearing) => runtime.signalLampState(id, bearing)`).
 *
 * WHAT IS NOT, stated: no WebGL and no React reconciler. `useFrame` is replaced by a collector (the component's
 * callback is called by this file, with a real camera and a stage size — R3F's scheduler is not what is under test);
 * the two refs the reconciler would fill are filled from the component's own tree (`<primitive object ref>` gets its
 * object, `<mesh ref>` a fresh `THREE.Mesh`); the prop models are stand-in geometry (the GLBs need a network and a
 * decoder; the housings are not what the lamp pass paints). So this holds WHICH LENS IS WRITTEN LIT and WHICH CAPTION
 * IS PAINTED, by execution; it does not hold a pixel — how bright the unlit glass looks is `signal-lens-look`'s
 * arithmetic, and a photographed frame of the dark head on a device is still owed (the builder's owed list).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { isValidElement, type ReactElement } from "react";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

/** The frame callbacks the mounted components registered, in mount order. */
const frames = vi.hoisted(() => ({ callbacks: [] as Array<(state: unknown, delta: number) => void> }));
vi.mock("@react-three/fiber", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useFrame: (callback: (state: unknown, delta: number) => void) => {
      frames.callbacks.push(callback);
      return null;
    },
  };
});

import type { SignalLampState, TrafficControllerSpec } from "../../../contracts";
import { fakeDocument, mountHook } from "../../../hud/__tests__/hookHarness";
import { buildLessonWorldCore } from "../../../scene/lessonWorldRecipe";
import { WorldPropsGroup } from "../../../world/components/WorldProps";
import { QUALITY_PRESETS } from "../../../world/components/quality";
import { SIGNAL_HEAD_LABELS, signalLabelKindFor } from "../../../world/components/signalHeadLabels";
import { PED_LENSES_LIT, VEHICLE_LENSES_LIT } from "../../../world/components/signalHeadLenses";
import { LAMP_ON_HEX } from "../../../world/components/signalLensLook";
import type { TrafficLightPlacement, WorldGeometry } from "../../../world/types";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { buildLiveWorld } from "./liveChainReplay";

const REPO_ROOT = path.join(process.cwd(), "..");
const districtOf = (spec: ScenarioSpec): unknown =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${spec.map.districtId}.json`), "utf-8")) as unknown;

type GetSignalPhase = (signalNodeId: string, approachBearingDeg: number) => SignalLampState;
type Component = (props: Record<string, unknown>) => unknown;

/** Every lamp state — the lens table is a `Record` over the union, so its keys ARE the union (tsc). */
const ALL_STATES = Object.keys(VEHICLE_LENSES_LIT) as SignalLampState[];

// ---------------------------------------------------------------------------
// The mount
// ---------------------------------------------------------------------------

function elements(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const c of node) elements(c, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  out.push(node);
  elements((node.props as { children?: unknown }).children, out);
  return out;
}
const named = (tree: unknown, name: string) =>
  elements(tree).filter((e) => typeof e.type === "function" && (e.type as { name?: string }).name === name);

/** A 2D context that records the text painted into it (`drawWorldLabel`'s only observable without a GPU). */
function recordingCanvas() {
  const texts: string[] = [];
  const ctx = {
    font: "",
    textAlign: "center",
    textBaseline: "alphabetic",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    measureText: (t: string) => ({ width: t.length * 10 }),
    fillText: (text: string) => void texts.push(text),
    clearRect: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    quadraticCurveTo: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
  };
  return { canvas: { width: 0, height: 0, getContext: () => ctx }, texts };
}

/** Stand-in prop models: the two housings and their material are all the head passes read off the baked assets. */
function standInAssets() {
  return {
    signalHousing: new THREE.BufferGeometry(),
    pedSignalHousing: new THREE.BufferGeometry(),
    materials: { signalHousing: new THREE.MeshBasicMaterial() },
  };
}

/** Mount one function component on the hook harness; fill the refs the reconciler would; hand back its frame loop. */
function mount(type: Component, props: Record<string, unknown>) {
  frames.callbacks.length = 0;
  const canvases: Array<ReturnType<typeof recordingCanvas>> = [];
  const doc = {
    ...fakeDocument(),
    createElement: () => {
      const c = recordingCanvas();
      canvases.push(c);
      return c.canvas;
    },
  };
  const mounted = mountHook(() => type(props), { document: doc });
  const frameCallbacks = [...frames.callbacks];
  const refs: Record<string, THREE.Object3D> = {};
  for (const el of elements(mounted.value)) {
    const p = el.props as { ref?: { current: unknown }; object?: THREE.Object3D; name?: string };
    if (!p.ref || typeof p.ref !== "object") continue;
    if (el.type === "primitive" && p.object) {
      p.ref.current = p.object;
      refs[p.object.name] = p.object;
    } else if (el.type === "mesh") {
      const mesh = new THREE.Mesh();
      mesh.visible = false; // the element's own `visible={false}`
      p.ref.current = mesh;
      refs[p.name ?? "mesh"] = mesh;
    } else {
      throw new Error(`a ref on <${String(el.type)}> this mount cannot fill`);
    }
  }
  return { tree: mounted.value, frameCallbacks, canvases, refs, unmount: () => mounted.unmount() };
}

/** The frame a head 30 m ahead is read from: a driver's eye south of it, looking north along −Z. */
function frameLookingAt(light: TrafficLightPlacement) {
  const camera = new THREE.PerspectiveCamera(50, 1280 / 720, 0.1, 900);
  camera.position.set(light.position[0], 1.2, light.position[2] + 30);
  camera.updateMatrixWorld(true);
  return { camera, size: { width: 1280, height: 720 } };
}

/**
 * The head pass of a world, mounted the way the product reaches it: `WorldPropsGroup` rendered, its prop models
 * arrived (the one `useState` it owns — `usePropModels` — set, as its loader's `setAssets` does), and the
 * `TrafficLights` element of ITS tree mounted with the props IT was handed.
 */
function mountHeads(world: WorldGeometry, getSignalPhase: GetSignalPhase | undefined) {
  const preset = QUALITY_PRESETS.low;
  // No `window`: `usePropModels`' effect then returns before it would fetch a GLB (its own server-render branch).
  const group = mountHook(() => (WorldPropsGroup as unknown as Component)({ world, preset, night: false, getSignalPhase }), {
    globals: { window: undefined },
  });
  expect(group.slots.length, "WorldPropsGroup owns exactly one state slot — its prop models").toBe(1);
  expect(named(group.value, "TrafficLights"), "no prop models yet ⇒ no head pass").toEqual([]);
  group.slots[0]!.v = standInAssets();
  const heads = named(group.rerender(), "TrafficLights");
  expect(heads.length, "WorldPropsGroup mounts one head pass").toBe(1);
  const headProps = heads[0]!.props as Record<string, unknown>;
  const vehicle = mount(heads[0]!.type as Component, headProps);
  expect(vehicle.frameCallbacks.length, "the head pass registers one frame loop").toBe(1);
  const lamps = vehicle.refs["traffic-light-lamps"] as THREE.InstancedMesh;
  const label = vehicle.refs["signal-head-label"] as THREE.Mesh;
  expect(lamps?.isInstancedMesh, "the emissive lamp mesh").toBe(true);
  expect(label, "the caption mesh").toBeDefined();
  const lights = world.trafficLights.filter((l) => l.head !== "pedestrian");
  const pedLights = world.trafficLights.filter((l) => l.head === "pedestrian");
  expect(lamps.count).toBe(lights.length * 3);

  const walkerEls = named(vehicle.tree, "PedestrianSignals");
  expect(walkerEls.length, "the walker's pass is mounted iff the world has a pedestrian head").toBe(pedLights.length > 0 ? 1 : 0);
  const walker = walkerEls.length === 1 ? mount(walkerEls[0]!.type as Component, walkerEls[0]!.props as Record<string, unknown>) : null;
  const walkerLamps = walker ? (walker.refs["pedestrian-signal-lamps"] as THREE.InstancedMesh) : null;
  if (walker) {
    expect(walker.frameCallbacks.length).toBe(1);
    expect(walkerLamps!.count).toBe(pedLights.length * 2);
  }

  const scratch = new THREE.Color();
  const lit = (mesh: THREE.InstancedMesh, i: number): boolean => {
    mesh.getColorAt(i, scratch);
    return scratch.r + scratch.g + scratch.b > 0;
  };
  const hex = (mesh: THREE.InstancedMesh, i: number): number => {
    mesh.getColorAt(i, scratch);
    return scratch.getHex();
  };
  return {
    headProps,
    walkerProps: walkerEls[0]?.props as Record<string, unknown> | undefined,
    lights,
    pedLights,
    label,
    captionTexts: () => vehicle.canvases.flatMap((c) => c.texts),
    /** One frame of both passes, as R3F runs them. */
    frame(at: TrafficLightPlacement = lights[0]!) {
      const f = frameLookingAt(at);
      vehicle.frameCallbacks[0]!(f, 1 / 60);
      walker?.frameCallbacks[0]!(f, 1 / 60);
    },
    /** [red, amber, green] of vehicle head i, as painted. */
    vehicleLit: (i: number): [boolean, boolean, boolean] => [lit(lamps, i * 3), lit(lamps, i * 3 + 1), lit(lamps, i * 3 + 2)],
    vehicleHex: (i: number): [number, number, number] => [hex(lamps, i * 3), hex(lamps, i * 3 + 1), hex(lamps, i * 3 + 2)],
    /** [red, green] of walker head i, as painted. */
    walkerLit: (i: number): [boolean, boolean] => [lit(walkerLamps!, i * 2), lit(walkerLamps!, i * 2 + 1)],
    unmount() {
      walker?.unmount();
      vehicle.unmount();
      group.unmount();
    },
  };
}

// ---------------------------------------------------------------------------
// The worlds
// ---------------------------------------------------------------------------

interface OfficerRung {
  spec: ScenarioSpec;
  level: ScenarioLevel;
  officer: TrafficControllerSpec;
}
/** Every compiled rung of every template that posts a регулировчик — derived, never listed. */
function officerRungs(): OfficerRung[] {
  const out: OfficerRung[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    for (const rung of spec.levels) {
      const officer = (compileScenario(spec, rung.level).stagedEvents ?? []).find(
        (e): e is TrafficControllerSpec => e.kind === "trafficController",
      );
      if (officer) out.push({ spec, level: rung.level, officer });
    }
  }
  return out;
}
const RUNGS = officerRungs();
const worldOf = (spec: ScenarioSpec, level: ScenarioLevel): WorldGeometry =>
  buildLessonWorldCore(compileScenario(spec, level), districtOf(spec)).geometry as WorldGeometry;

/** The first shipped district that carries a pedestrian head (a signalized crossing) — found, never named. */
function worldWithWalkerHeads(): { id: string; world: WorldGeometry } {
  const seen = new Set<string>();
  for (const spec of SCENARIO_TEMPLATES) {
    if (seen.has(spec.map.districtId)) continue;
    seen.add(spec.map.districtId);
    const world = worldOf(spec, spec.levels[0]!.level);
    if (world.trafficLights.some((l) => l.head === "pedestrian") && world.trafficLights.some((l) => l.head !== "pedestrian")) {
      return { id: spec.map.districtId, world };
    }
  }
  throw new Error("no shipped scenario district carries both a vehicle head and a pedestrian head");
}

// ---------------------------------------------------------------------------
// §1 the wiring the tree shows
// ---------------------------------------------------------------------------

describe("§1 WorldPropsGroup hands the head pass the lamp getter it was given — read off its own tree", () => {
  it("the TrafficLights element carries the group's `getSignalPhase` and `world`, and its PedestrianSignals carries the same getter", () => {
    const { world } = worldWithWalkerHeads();
    const getter: GetSignalPhase = () => "red";
    const h = mountHeads(world, getter);
    expect(h.headProps.getSignalPhase).toBe(getter);
    expect(h.headProps.world).toBe(world);
    expect(h.walkerProps?.getSignalPhase).toBe(getter);
    h.unmount();
  });
});

// ---------------------------------------------------------------------------
// §2 every state, painted
// ---------------------------------------------------------------------------

describe("§2 every lamp state, PAINTED by the components' own frame loops — the lens table is what reaches the mesh", () => {
  it("the vehicle head: for each state every head's three lenses are written lit exactly as VEHICLE_LENSES_LIT says, and a dead head writes nothing", () => {
    const { id, world } = worldWithWalkerHeads();
    let state: SignalLampState = "red";
    const h = mountHeads(world, () => state);
    expect(h.lights.length, `${id}: vehicle heads`).toBeGreaterThan(0);
    const wrong: string[] = [];
    // Twice round, so every state is also painted OVER another one (the per-head change cache repaints on a change).
    for (const s of [...ALL_STATES, ...[...ALL_STATES].reverse()]) {
      state = s;
      h.frame();
      for (let i = 0; i < h.lights.length; i++) {
        const painted = h.vehicleLit(i);
        if (JSON.stringify(painted) !== JSON.stringify(VEHICLE_LENSES_LIT[s])) {
          wrong.push(`${s}: head ${i} painted [red, amber, green] lit = ${JSON.stringify(painted)}, the table says ${JSON.stringify(VEHICLE_LENSES_LIT[s])}`);
        }
      }
    }
    expect(wrong.slice(0, 6), `${wrong.length} head paint(s) disagree with the lens table`).toEqual([]);
    // …and a lit lens is lit in ITS colour: red on the red lens, green on the green one.
    state = "red";
    h.frame();
    expect(h.vehicleHex(0)).toEqual([LAMP_ON_HEX.red, 0x000000, 0x000000]);
    state = "green";
    h.frame();
    expect(h.vehicleHex(0)).toEqual([0x000000, 0x000000, LAMP_ON_HEX.green]);
    // The officer's dead head, said on its own: nothing — on every head.
    state = "darkControlled";
    h.frame();
    for (let i = 0; i < h.lights.length; i++) {
      expect(h.vehicleHex(i), `darkControlled: head ${i} emissive colours`).toEqual([0x000000, 0x000000, 0x000000]);
    }
    h.unmount();
  });

  it("the walker's head: for each state both lenses are written lit exactly as PED_LENSES_LIT says — and the officer's dead head is dead for the walker too", () => {
    const { id, world } = worldWithWalkerHeads();
    let state: SignalLampState = "red";
    const h = mountHeads(world, () => state);
    expect(h.pedLights.length, `${id}: pedestrian heads`).toBeGreaterThan(0);
    const wrong: string[] = [];
    for (const s of [...ALL_STATES, ...[...ALL_STATES].reverse()]) {
      state = s;
      h.frame();
      for (let i = 0; i < h.pedLights.length; i++) {
        const painted = h.walkerLit(i);
        if (JSON.stringify(painted) !== JSON.stringify(PED_LENSES_LIT[s])) {
          wrong.push(`${s}: walker head ${i} painted [red, green] lit = ${JSON.stringify(painted)}, the table says ${JSON.stringify(PED_LENSES_LIT[s])}`);
        }
      }
    }
    expect(wrong.slice(0, 6), `${wrong.length} walker-head paint(s) disagree with the lens table`).toEqual([]);
    state = "darkControlled";
    h.frame();
    for (let i = 0; i < h.pedLights.length; i++) {
      expect(h.walkerLit(i), `darkControlled: walker head ${i}`).toEqual([false, false]);
    }
    h.unmount();
  });

  it("the caption the frame loop paints is the state's own card: the officer's over a darkControlled head, the right-hand rule's over a plain dark one, none over a lit one", () => {
    const { world } = worldWithWalkerHeads();
    let state: SignalLampState = "green";
    const h = mountHeads(world, () => state);
    h.frame();
    expect(h.label.visible, "a lit head is captioned").toBe(false);
    expect(h.captionTexts()).toEqual([]);
    state = "darkControlled";
    h.frame();
    expect(h.label.visible, "the officer's dead head has no caption").toBe(true);
    const officer = SIGNAL_HEAD_LABELS.officer;
    expect(h.captionTexts()).toEqual([officer.headlineBg, officer.line1Bg, officer.line2Bg, officer.lawRef]);
    state = "dark";
    h.frame();
    const dark = SIGNAL_HEAD_LABELS.dark;
    expect(h.captionTexts().slice(4)).toEqual([dark.headlineBg, dark.line1Bg, dark.line2Bg, dark.lawRef]);
    h.unmount();
  });
});

// ---------------------------------------------------------------------------
// §3 the dark-lamp officer junction, through the lesson's own runtime
// ---------------------------------------------------------------------------

/** One full 50 s lamp cycle and a margin, at 0.5 s — controller-dark-lamp-head-and-voice §1's span. */
const SPAN_SEC = 60;
const DT = 0.5;

describe("§3 sc-sig-controller-postures, every rung, a full lamp cycle: the head the student sees is PAINTED dead and captioned as the officer's", () => {
  const dark = RUNGS.filter((r) => r.officer.lamps === "dark");

  it("the census: the dark-lamp officer rungs are sc-sig-controller-postures', all of them", () => {
    expect([...new Set(dark.map((r) => r.spec.id))]).toEqual(["sc-sig-controller-postures"]);
    expect(dark.length).toBe(SCENARIO_TEMPLATES.find((s) => s.id === "sc-sig-controller-postures")!.levels.length);
  });

  it("every head at the officer's junction: no lens is ever written lit, on any approach, at any second — and the card over it is «РЕГУЛИРОВЧИК · Светофарът е ЗАГАСНАЛ»", () => {
    const wrong: string[] = [];
    let paintsChecked = 0;
    for (const r of dark) {
      const lesson = compileScenario(r.spec, r.level);
      const raw = districtOf(r.spec);
      const { runtime } = buildLiveWorld(lesson, raw);
      const world = buildLessonWorldCore(lesson, raw).geometry as WorldGeometry;
      // LessonScene's own arrow (LessonScene.tsx `getSignalPhase`): the runtime's mode-aware lamp state.
      const h = mountHeads(world, (id, bearing) => runtime.signalLampState(id, bearing));
      const his = h.lights.map((l, i) => [l, i] as const).filter(([l]) => l.nodeId === r.officer.signalNodeId);
      expect(his.length, `${r.spec.id} L${r.level}: heads at the officer's node ${r.officer.signalNodeId}`).toBeGreaterThanOrEqual(2);
      for (let t = 0; t <= SPAN_SEC + 1e-9; t += DT) {
        h.frame(his[0]![0]);
        for (const [l, i] of his) {
          paintsChecked++;
          const painted = h.vehicleLit(i);
          if (painted.some(Boolean)) {
            wrong.push(`${r.spec.id} L${r.level} t=${t.toFixed(1)} head ${i} (bearing ${l.approachBearingDeg}): painted lit ${JSON.stringify(painted)} — the runtime says ${runtime.signalLampState(l.nodeId, l.approachBearingDeg)}`);
          }
        }
        if (!h.label.visible) wrong.push(`${r.spec.id} L${r.level} t=${t.toFixed(1)}: the dead head ahead carries no caption`);
        runtime.update(DT);
      }
      const officer = SIGNAL_HEAD_LABELS.officer;
      // Painted once (the copy never changed), and it is his card — never the uncontrolled junction's.
      expect(h.captionTexts(), `${r.spec.id} L${r.level}: the caption painted`).toEqual([
        officer.headlineBg,
        officer.line1Bg,
        officer.line2Bg,
        officer.lawRef,
      ]);
      expect(h.captionTexts().join(" ")).not.toMatch(/равнозначно|ОТДЯСНО|чл\.\s*48/);
      h.unmount();
    }
    expect(paintsChecked).toBeGreaterThan(400);
    expect(wrong.slice(0, 6), `${wrong.length} frame(s) on which the head the lesson calls ЗАГАСНАЛ was painted lit or uncaptioned`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §4 the live-lamp drills are painted as the cycle they are
// ---------------------------------------------------------------------------

describe("§4 the two live-lamp officer drills: the head is PAINTED as the live cycle — the lit lens is the phase's, and no card hangs over it", () => {
  it("every rung, a full cycle: what is painted is the lens table's row for the runtime's lamp state, every lit phase is seen, and the caption stays hidden", () => {
    const live = RUNGS.filter((r) => r.officer.lamps !== "dark");
    expect([...new Set(live.map((r) => r.spec.id))].sort()).toEqual(["sc-sig-controller-live", "sc-signal-controller"]);
    const wrong: string[] = [];
    const seen = new Set<string>();
    for (const r of live) {
      const lesson = compileScenario(r.spec, r.level);
      const raw = districtOf(r.spec);
      const { runtime } = buildLiveWorld(lesson, raw);
      const world = buildLessonWorldCore(lesson, raw).geometry as WorldGeometry;
      const h = mountHeads(world, (id, bearing) => runtime.signalLampState(id, bearing));
      const his = h.lights.map((l, i) => [l, i] as const).filter(([l]) => l.nodeId === r.officer.signalNodeId);
      expect(his.length, `${r.spec.id} L${r.level}: heads at the officer's node`).toBeGreaterThanOrEqual(2);
      for (let t = 0; t <= SPAN_SEC + 1e-9; t += DT) {
        h.frame(his[0]![0]);
        for (const [l, i] of his) {
          const lamp = runtime.signalLampState(l.nodeId, l.approachBearingDeg);
          seen.add(lamp);
          const painted = h.vehicleLit(i);
          if (JSON.stringify(painted) !== JSON.stringify(VEHICLE_LENSES_LIT[lamp]) || !painted.some(Boolean)) {
            wrong.push(`${r.spec.id} L${r.level} t=${t.toFixed(1)} head ${i}: painted ${JSON.stringify(painted)} for lamp ${lamp}`);
          }
          if (signalLabelKindFor(lamp) !== null) wrong.push(`${r.spec.id} L${r.level} t=${t.toFixed(1)}: ${lamp} would be captioned`);
        }
        if (h.label.visible) wrong.push(`${r.spec.id} L${r.level} t=${t.toFixed(1)}: a caption hangs over a lit head`);
        runtime.update(DT);
      }
      expect(h.captionTexts(), `${r.spec.id} L${r.level}: nothing was ever painted into the caption`).toEqual([]);
      h.unmount();
    }
    expect(wrong.slice(0, 6)).toEqual([]);
    expect([...seen].sort()).toEqual(["green", "red", "redYellow", "yellow"]);
  });
});
