/**
 * THE BRIDGE THE RUNNING APP MOUNTS — LOADER → setBuilt → ReadyScene → MOUNTS.
 *
 * Row sc-ac-ice:86eab7e9, round-3 verifier Y1 and Y2 (and the Y3/Y4 class).
 *
 * Round 3 proved the parked row by running `<TrafficLayer>` with props it
 * built from the recipe core ITSELF, and pinned the scene's lines with source
 * regexes. The verifier then edited the one object those pins did not cover —
 * LessonScene's `setBuilt({ district, … })` — to hand the scene a copy of the
 * district with every edge's `bridges` stripped. The whole kerbside parked row
 * came back in the lesson the student plays, with 194 of 194 tests green.
 * (Y2, the same shape one component down: `DistrictWorld` told to mount no
 * colliders whenever `prebuilt` is passed — which is every lesson — passed 223
 * of 223, because a source pin matched a substring.)
 *
 * So this file RUNS THE PATH THE APP RUNS, and reads nothing it could copy:
 *
 *   1. `LessonScene` itself is mounted (modules/sim/hud/__tests__/hookHarness —
 *      real hooks, no DOM), and its OWN loader effect runs: `fetch` serves the
 *      public district document and trace exactly as the server does, and the
 *      loader builds the recipe core, the traffic system and the `Built`
 *      payload and stores it through its own `setBuilt`.
 *   2. The scene re-renders and returns `<ReadyScene built={…}>`; that element
 *      — picked out of the tree by component identity — is the props object
 *      the app hands the ready scene.
 *   3. `ReadyScene` is mounted with those props, and the `<TrafficLayer>` and
 *      `<DistrictWorld>` elements are picked out of ITS tree by identity.
 *   4. `TrafficLayer` runs with the props that element carries, up to its
 *      parked-row memo (the array the instancing loop draws); `DistrictWorld`
 *      runs with the props its element carries, and `WorldColliders` with the
 *      props of the element DistrictWorld returns.
 *
 * A transform anywhere on that path — in the loader, in the setBuilt payload,
 * in ReadyScene's destructuring, on either mount element, inside DistrictWorld
 * — changes what steps 3–4 see, whatever it is spelled like.
 *
 * WHAT THIS FILE CANNOT SEE, said plainly: React's reconciler and rapier's
 * prop plumbing are not run. The wall collider's props are held to a CLOSED
 * list (§3) so that anything rapier would read beyond `args`, `friction` and
 * `restitution` — `sensor`, `solverGroups`, `collisionGroups`, `enabled`, … —
 * fails by being there; `scene/__tests__/bridge-parapet-stops-the-car` then
 * drives the product's own chassis into the built trimesh on real rapier.
 */
import fs from "node:fs";
import path from "node:path";
import { isValidElement, type ReactElement } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// The replaced seams. `useMemo` is the product's own factory, run — except for
// ONE memo, TrafficLayer's parked row, which is recorded and the render cut
// there (everything after it needs a GL context and the GLB fleet, and nothing
// after it can add a body). R3F's `useFrame` needs a <Canvas>; DistrictWorld's
// frame hook only sets the snow cover, so it is a no-op here.
// ---------------------------------------------------------------------------
const probe = vi.hoisted(() => ({
  district: null as unknown,
  parked: null as unknown,
  STOP: Symbol("stop-after-parked-memo"),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useMemo: <T,>(factory: () => T, deps?: readonly unknown[]): T => {
      const value = factory();
      if (probe.district !== null && deps && deps[0] === probe.district && Array.isArray(value)) {
        probe.parked = value;
        throw probe.STOP;
      }
      return value;
    },
  };
});
vi.mock("@react-three/fiber", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-three/fiber")>();
  return { ...actual, useFrame: () => {} };
});

import { RigidBody, TrimeshCollider } from "@react-three/rapier";
import LessonScene, { ReadyScene } from "../LessonScene";
import { collectProps, mountHook, type Mounted } from "@/modules/sim/hud/__tests__/hookHarness";
import { compileScenario, SCENARIO_TEMPLATES, type ScenarioLevel } from "@/modules/sim/lessons/scenario";
import type { LessonSpec } from "@/modules/sim/lessons";
import { buildLessonWorldCore } from "@/modules/sim/scene/lessonWorldRecipe";
import { TrafficLayer } from "@/modules/sim/traffic";
import { DistrictWorld, WorldColliders } from "@/modules/sim/world";

const ROOT = process.cwd(); // platform/
/** The near abutment and the far embankment of ac-bridge-v1 (deck [250, 340]). */
const DECK_FROM = 250;
const DECK_TO = 340;
const EMBANKMENT_TO = 380;
/** Worst-case parked-body half-length (TrafficLayer PARKED_HALF_LEN_M). */
const PARKED_HALF_LEN = 2.25;

/** What the server serves: `/world/*.json` and `/traces/**` from public/. */
async function publicFetch(input: unknown): Promise<unknown> {
  const url = String(input);
  const rel = url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/+/, "").split("?")[0]!;
  const file = path.join(ROOT, "public", rel);
  if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => null };
  const body = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  return { ok: true, status: 200, json: async () => body };
}

function lessonOf(templateId: string, level: ScenarioLevel): LessonSpec {
  const s = SCENARIO_TEMPLATES.find((t) => t.id === templateId);
  if (!s) throw new Error(`no template ${templateId}`);
  return compileScenario(s, level);
}

type SceneProps = Parameters<typeof LessonScene>[0];
function sceneProps(lesson: LessonSpec): SceneProps {
  return {
    lesson,
    quality: "low",
    paused: false,
    driveLocked: false,
    preDriveHighlightStepId: null,
    activeObjectiveIndex: 0,
    onTick: () => {},
    onPreDriveStep: () => {},
    onBlockedDriveAttempt: () => {},
    onMinimapFrame: () => {},
  } as SceneProps;
}

interface LiveMounts {
  lesson: LessonSpec;
  /** The `Built` the loader stored through its own setBuilt. */
  built: Record<string, unknown>;
  ready: Record<string, unknown>;
  traffic: Record<string, unknown>;
  districtWorld: Record<string, unknown>;
  unmount: () => void;
}

/**
 * Mount LessonScene, let its loader run, and walk the mounts the app would
 * render. Nothing below is built by the test: every object is the one the
 * product produced and handed on.
 */
async function liveMounts(templateId: string, level: ScenarioLevel): Promise<LiveMounts> {
  const lesson = lessonOf(templateId, level);
  const props = sceneProps(lesson);
  const outer: Mounted<unknown> = mountHook(() => LessonScene(props), {
    globals: { fetch: publicFetch },
  });
  // Slot 0 is `useState<Built | null>(null)` — the first state LessonScene
  // declares; the loader fills it through setBuilt. Slot 1 is loadError.
  for (let i = 0; i < 400 && outer.slots[0]!.v === null && outer.slots[1]!.v !== true; i++) {
    await new Promise((r) => setImmediate(r));
  }
  if (outer.slots[1]!.v === true) throw new Error("LessonScene's loader set loadError");
  const built = outer.slots[0]!.v as Record<string, unknown> | null;
  if (!built) throw new Error("LessonScene's loader never called setBuilt");

  const tree = outer.rerender();
  const readyEls = collectProps(tree, (_p, type) => type === ReadyScene);
  expect(readyEls, "LessonScene renders exactly one <ReadyScene>").toHaveLength(1);
  const ready = readyEls[0]!;

  const inner = mountHook(() => ReadyScene(ready as unknown as Parameters<typeof ReadyScene>[0]));
  const trafficEls = collectProps(inner.value, (_p, type) => type === TrafficLayer);
  const worldEls = collectProps(inner.value, (_p, type) => type === DistrictWorld);
  expect(trafficEls, "ReadyScene mounts exactly one <TrafficLayer>").toHaveLength(1);
  expect(worldEls, "ReadyScene mounts exactly one <DistrictWorld>").toHaveLength(1);
  return {
    lesson,
    built,
    ready,
    traffic: trafficEls[0]!,
    districtWorld: worldEls[0]!,
    unmount: () => {
      inner.unmount();
      outer.unmount();
    },
  };
}

type Parked = { x: number; y: number }[];

/** TrafficLayer, run with the props its mount element carries, to the parked memo. */
function parkedRowOf(trafficProps: Record<string, unknown>): Parked {
  probe.district = trafficProps.district;
  probe.parked = null;
  let stopped = false;
  // The harness restores the globals it installs on unmount; a render cut by
  // the probe never returns a handle, so they are put back here.
  const g = globalThis as Record<string, unknown>;
  const saved = ["window", "document", "ResizeObserver"].map((k) => [k, k in g, g[k]] as const);
  try {
    mountHook(() => TrafficLayer(trafficProps as unknown as Parameters<typeof TrafficLayer>[0])).unmount();
  } catch (e) {
    if (e !== probe.STOP) throw e;
    stopped = true;
  } finally {
    probe.district = null;
    for (const [k, had, v] of saved) {
      if (had) g[k] = v;
      else delete g[k];
    }
  }
  if (!stopped || !Array.isArray(probe.parked)) {
    throw new Error("TrafficLayer ran no memo keyed on the district it was mounted with — the seam moved");
  }
  return probe.parked as Parked;
}

const onBridgehead = (cars: Parked) =>
  cars.filter((c) => c.y + PARKED_HALF_LEN > 0 && c.y - PARKED_HALF_LEN < EMBANKMENT_TO);

// ---------------------------------------------------------------------------

describe("§1 the district LessonScene's loader hands <TrafficLayer> keeps its bridge", () => {
  const levels = SCENARIO_TEMPLATES.find((t) => t.id === "sc-ac-bridge-ice")!.levels.map(
    (l) => l.level as ScenarioLevel,
  );
  const mounts = new Map<ScenarioLevel, LiveMounts>();

  beforeAll(async () => {
    for (const level of levels) mounts.set(level, await liveMounts("sc-ac-bridge-ice", level));
  }, 240_000);
  afterAll(() => {
    // Last mounted, first unmounted: each mount restores the globals it found.
    for (const m of [...mounts.values()].reverse()) m.unmount();
  });

  it("the template has rungs, and every one of them loaded", () => {
    expect(levels.length).toBeGreaterThanOrEqual(1);
    expect(mounts.size).toBe(levels.length);
  });

  for (const level of levels) {
    it(`L${level}: the loader's Built, ReadyScene's props and the <TrafficLayer> element all carry the SAME bridge-tagged district`, () => {
      const m = mounts.get(level)!;
      // What the recipe builds for this lesson from the same public document.
      const raw = JSON.parse(
        fs.readFileSync(path.join(ROOT, "public", "world", "ac-bridge-v1.json"), "utf8"),
      ) as unknown;
      const expected = buildLessonWorldCore(m.lesson, raw).district.roads.edges.map((e) => e.bridges);
      expect(expected.some((b) => Array.isArray(b) && b.length > 0), "the map tags a bridge").toBe(true);

      const tagsOf = (d: unknown) =>
        (d as { roads: { edges: { bridges?: unknown }[] } }).roads.edges.map((e) => e.bridges);
      expect(tagsOf(m.built.district)).toEqual(expected);
      expect((m.ready.built as Record<string, unknown>).district).toBe(m.built.district);
      expect(tagsOf(m.traffic.district)).toEqual(expected);
      // The mount element carries the loader's own object, not a rebuilt one.
      expect(m.traffic.district).toBe(m.built.district);
      expect(m.traffic.parkedClearZones).toBe(m.built.parkedClearZones);
    });

    it(`L${level}: <TrafficLayer>, run with its mount element's props, parks NOBODY from the spawn to the far embankment — and still parks the city past it`, () => {
      const cars = parkedRowOf(mounts.get(level)!.traffic);
      expect(onBridgehead(cars)).toEqual([]);
      expect(cars.filter((c) => c.y > EMBANKMENT_TO).length).toBeGreaterThan(0);
    });
  }

  it("the clear zones ride the same live path: on a lesson whose map names a bus stop, <TrafficLayer> is mounted with the recipe's (non-empty) zones", async () => {
    // ac-bridge-v1 authors no clear zone, so `[]` there cannot tell a loader
    // that forwards the recipe's zones from one that drops them.
    const withStop = SCENARIO_TEMPLATES.find((t) => {
      const raw = JSON.parse(
        fs.readFileSync(path.join(ROOT, "public", "world", `${t.map.districtId}.json`), "utf8"),
      ) as { buildings?: { kind?: string }[] };
      return (raw.buildings ?? []).some((b) => b.kind === "busStop");
    });
    expect(withStop, "no template maps a district with a bus stop").toBeDefined();
    const level = withStop!.levels[0]!.level as ScenarioLevel;
    const m = await liveMounts(withStop!.id, level);
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(ROOT, "public", "world", `${withStop!.map.districtId}.json`), "utf8"),
      ) as unknown;
      const zones = buildLessonWorldCore(m.lesson, raw).parkedClearZones;
      expect(zones.length).toBeGreaterThan(0);
      expect(m.traffic.parkedClearZones).toEqual(zones);
    } finally {
      m.unmount();
    }
  }, 120_000);

  it("control: the street-with-ice, through the same live path, keeps its kerbside row where the bridge lesson has none", async () => {
    const m = await liveMounts("sc-ac-ice", 1);
    try {
      const cars = parkedRowOf(m.traffic);
      expect(cars.filter((c) => c.y >= 15 && c.y <= DECK_FROM).length).toBeGreaterThanOrEqual(20);
    } finally {
      m.unmount();
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------

/** Every element of `type` in a returned tree (children walked, components not called). */
function elementsOf(node: unknown, type: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const c of node) elementsOf(c, type, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  if (node.type === type) out.push(node);
  const kids = (node.props as { children?: unknown }).children;
  if (kids !== undefined) elementsOf(kids, type, out);
  return out;
}

describe("§2 <DistrictWorld>, run with the props ReadyScene mounts it with, mounts the lesson's wall colliders", () => {
  let m: LiveMounts;
  beforeAll(async () => {
    m = await liveMounts("sc-ac-bridge-ice", 1);
  }, 120_000);
  afterAll(() => m?.unmount());

  it("the element carries the loader's own geometry as `prebuilt`", () => {
    expect(m.districtWorld.prebuilt).toBe(m.built.geometry);
  });

  it("DistrictWorld returns exactly one <WorldColliders>, holding THAT geometry's collider set", () => {
    const tree = mountHook(() => DistrictWorld(m.districtWorld as unknown as Parameters<typeof DistrictWorld>[0]));
    try {
      const cols = elementsOf(tree.value, WorldColliders);
      expect(cols, "no <WorldColliders> in the lesson world — no wall stops the car").toHaveLength(1);
      const geometry = m.built.geometry as { colliders: unknown };
      expect((cols[0]!.props as { colliders: unknown }).colliders).toBe(geometry.colliders);
    } finally {
      tree.unmount();
    }
  });
});

// ---------------------------------------------------------------------------

/**
 * The CLOSED list of props the wall body and its trimesh may carry. Everything
 * rapier reads that is not here — `sensor` (reports the touch, lets the car
 * through), `solverGroups` (detects, applies no force), `collisionGroups`
 * (collides with nothing), `enabled`, `activeCollisionTypes`, `mass`, … —
 * fails by being present, whatever value it is given (round-3 verifier Y3/Y4:
 * closing one spelling left the others).
 */
const WALL_BODY_PROPS = ["children", "colliders", "name", "type"];
const WALL_MESH_PROPS = ["args", "friction", "restitution"];

describe("§3 the wall collider the lesson mounts is a plain fixed trimesh (closed prop list)", () => {
  let m: LiveMounts;
  beforeAll(async () => {
    m = await liveMounts("sc-ac-bridge-ice", 1);
  }, 120_000);
  afterAll(() => m?.unmount());

  it("the district-buildings body and its one trimesh carry only the listed props, and hold the parapet face", () => {
    const tree = mountHook(() => DistrictWorld(m.districtWorld as unknown as Parameters<typeof DistrictWorld>[0]));
    let colliderProps: { colliders: { buildings: { positions: Float32Array; indices: Uint32Array } } };
    try {
      colliderProps = elementsOf(tree.value, WorldColliders)[0]!.props as typeof colliderProps;
    } finally {
      tree.unmount();
    }
    const bodies = elementsOf(WorldColliders(colliderProps as Parameters<typeof WorldColliders>[0]), RigidBody);
    const walls = bodies.filter((b) => (b.props as { name?: string }).name === "district-buildings");
    expect(walls).toHaveLength(1);
    const bodyProps = walls[0]!.props as Record<string, unknown>;
    expect(Object.keys(bodyProps).sort()).toEqual(WALL_BODY_PROPS);
    expect(bodyProps.type).toBe("fixed");
    const meshes = elementsOf(bodyProps.children, TrimeshCollider);
    expect(meshes).toHaveLength(1);
    const meshProps = meshes[0]!.props as Record<string, unknown>;
    expect(Object.keys(meshProps).sort()).toEqual(WALL_MESH_PROPS);
    expect(meshProps.friction as number).toBeGreaterThan(0);
    const [pos, idx] = meshProps.args as [Float32Array, Uint32Array];
    expect(pos).toBe(colliderProps.colliders.buildings.positions);
    expect(idx).toBe(colliderProps.colliders.buildings.indices);
    // …and it indexes triangles on the east parapet's inner face on the span.
    const onFace = new Set<number>();
    for (let v = 0; v < pos.length / 3; v++) {
      const x = pos[v * 3]!;
      const y = -pos[v * 3 + 2]!;
      if (Math.abs(x - 9.7) < 1e-3 && y > DECK_FROM && y < DECK_TO) onFace.add(v);
    }
    let tris = 0;
    for (let t = 0; t + 2 < idx.length; t += 3) {
      if (onFace.has(idx[t]!) && onFace.has(idx[t + 1]!) && onFace.has(idx[t + 2]!)) tris++;
    }
    expect(tris).toBeGreaterThan(0);
  });

  it("closed-list self-test: an extra prop on either element is caught by the comparison above", () => {
    const extra = { ...Object.fromEntries(WALL_MESH_PROPS.map((k) => [k, 1])), solverGroups: 0x00020000 };
    expect(Object.keys(extra).sort()).not.toEqual(WALL_MESH_PROPS);
    const sensor = { ...Object.fromEntries(WALL_BODY_PROPS.map((k) => [k, 1])), sensor: true };
    expect(Object.keys(sensor).sort()).not.toEqual(WALL_BODY_PROPS);
  });
});

