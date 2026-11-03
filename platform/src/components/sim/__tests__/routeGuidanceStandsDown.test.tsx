/**
 * AFTER A PERSON STRIKE THE WORLD STOPS POINTING THE ROUTE — lane endings2,
 * round 3, integrator ruling N14 (verifier round-2 finding R2-1).
 *
 * On the round-2 tree the in-world route guidance kept drawing the ribbon, the
 * turn chevron and the goal marker under the person hold, and the marker's
 * plate read «Карай дотук» — 32 of the 47 person-strike census cells — above a
 * banner that says «След удара в човек — не продължавай…». The rule
 * (`routeGuidanceStandsDown`, RouteGuidance.tsx): under "personStruck", and
 * under no other hold, the layer is HIDDEN through its root group, never
 * unmounted, so the route is still derived and still published to the drive
 * rig exactly as before.
 *
 * Read in three places: the pure predicate; the REAL RouteGuidance mounted
 * through the real react-three-fiber reconciler on a real compiled lesson and
 * its own district (a stub renderer that is never asked to draw — the
 * `cockpitLiveReanchor.test.tsx` pattern), walking the Object3D graph for what
 * would be drawn and reading `window.__roadProbe.route`; and the scene's mount.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { act, advance, createRoot, extend } from "@react-three/fiber";
import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "@/modules/sim/contracts";
import { SCENARIO_TEMPLATES, compileScenario, type LessonSpec, type RouteHold } from "@/modules/sim/lessons";
import { assertDistrict } from "@/modules/sim/world";
import { loadDistrict } from "@/modules/sim/lessons/scenario/__tests__/witnessLiveRung";
import { RouteGuidance, routeGuidanceStandsDown } from "../RouteGuidance";

// See cockpitLiveReanchor.test.tsx: the reconciler resolves «three» as CJS.
extend(createRequire(import.meta.url)("three") as Parameters<typeof extend>[0]);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("routeGuidanceStandsDown — the pure predicate (N14: personStruck only)", () => {
  it("is true for the person hold and false for every other hold value", () => {
    expect(routeGuidanceStandsDown("personStruck")).toBe(true);
    for (const h of [null, undefined, "crashPinned", "offRoad"] as const) {
      expect(routeGuidanceStandsDown(h), String(h)).toBe(false);
    }
  });
});

// ── the real layer, headless ────────────────────────────────────────────────

type G = Record<string, unknown>;
const g = globalThis as G;
const saved: Record<string, unknown> = {};

beforeAll(() => {
  // A document whose canvases accept every 2-D call, so the marker's painted
  // plate is BUILT (makeLabelTexture returns null without a document, and a
  // test of "the sign is hidden" must have a sign to hide); a window for the
  // dev-build probe the layer publishes its derived route onto.
  for (const k of ["document", "window", "getComputedStyle"]) saved[k] = g[k];
  const ctx = new Proxy(
    {},
    { get: (_t, p) => (p === "measureText" ? () => ({ width: 0 }) : () => undefined), set: () => true },
  );
  g.document = {
    createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }),
    documentElement: {},
  };
  g.getComputedStyle = () => ({ getPropertyValue: () => "" });
  g.window = {};
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

function lessonAndDistrict(id: string, L: 1 | 2): { lesson: LessonSpec; district: ReturnType<typeof assertDistrict> } {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === id)!;
  const lesson = compileScenario(spec, L);
  return { lesson, district: assertDistrict(loadDistrict(spec.map.districtId)) };
}

/** True when this object and every ancestor would be drawn. */
function drawn(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p !== null; p = p.parent) if (!p.visible) return false;
  return true;
}

interface Reading {
  /** Every mesh / sprite the layer would draw, by renderOrder, after one frame. */
  drawnOrders: number[];
  /** The same set ignoring the root group's flag — what the layer itself shows. */
  ownOrders: number[];
  rootVisible: boolean;
  /** `window.__roadProbe.route` minus its wall clock, and how many derivations. */
  route: string;
  derivations: number;
}

async function mountGuidance(holds: Array<RouteHold | null>, id = "sc-pe-jaywalker", L: 1 | 2 = 2): Promise<Reading[]> {
  const { lesson, district } = lessonAndDistrict(id, L);
  (g.window as G).__roadProbe = undefined;
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
  // LessonScene `spawnPose`, in district space (the scene's `guidanceSpawnStart`).
  const point = lesson.spawn.pointId ? district.spawnPoints.find((p) => p.id === lesson.spawn.pointId) : undefined;
  const spawn = {
    x: point?.x ?? lesson.spawn.position?.x ?? 0,
    y: point?.y ?? lesson.spawn.position?.y ?? 0,
    headingDeg: point?.heading ?? lesson.spawn.headingDeg ?? 0,
  };
  const sample: VehicleSample = {
    position: { x: spawn.x, y: spawn.y },
    headingDeg: spawn.headingDeg,
    speedKmh: 0,
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
  } as VehicleSample;
  const sampleRef = { current: sample };
  let scene: THREE.Group | null = null;
  const out: Reading[] = [];
  const el = (hold: RouteHold | null) => (
    <group ref={(o) => void (scene = o)}>
      <RouteGuidance
        district={district}
        lesson={lesson}
        activeObjectiveIndex={0}
        sampleRef={sampleRef}
        spawnStart={spawn}
        routeHold={hold}
      />
    </group>
  );
  try {
    for (const hold of holds) {
      await act(async () => root.render(el(hold)));
      await act(async () => {
        advance(1000, true);
        advance(1016, true);
      });
      const layer = scene!.children[0]!;
      const orders = (pick: (o: THREE.Object3D) => boolean) => {
        const r: number[] = [];
        layer.traverse((o) => {
          if ((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite) if (pick(o)) r.push(o.renderOrder);
        });
        return r.sort((a, b) => a - b);
      };
      const probe = (g.window as G).__roadProbe as { route: unknown; routeDerivations: number } | undefined;
      const route = probe?.route as Record<string, unknown> | null | undefined;
      out.push({
        drawnOrders: orders(drawn),
        ownOrders: orders((o) => {
          for (let p: THREE.Object3D | null = o; p !== null && p !== layer; p = p.parent) if (!p.visible) return false;
          return true;
        }),
        rootVisible: layer.visible,
        route: JSON.stringify(route ? { ...route, wallMs: 0 } : route),
        derivations: probe?.routeDerivations ?? 0,
      });
    }
  } finally {
    await act(async () => root.unmount());
  }
  return out;
}

describe("the real RouteGuidance on sc-pe-jaywalker@L2 — hidden under personStruck, the probe route untouched", () => {
  it("with no hold the ribbon, the marker and its plate are drawn; under personStruck nothing is drawn, though the layer's own flags are unchanged", async () => {
    // Two separate mounts, one after the other (they share the window's probe).
    const none = (await mountGuidance([null]))[0]!;
    const person = (await mountGuidance(["personStruck"]))[0]!;
    // no hold: the ribbon (20), the marker shaft (19) and the plate (22) are on screen
    expect(none.rootVisible).toBe(true);
    for (const order of [20, 19, 22]) expect(none.drawnOrders, `renderOrder ${order} drawn with no hold`).toContain(order);
    // personStruck: the root is hidden and NOTHING under it is drawn …
    expect(person.rootVisible).toBe(false);
    expect(person.drawnOrders).toEqual([]);
    // … while every child keeps the flag the layer gave it (hidden, not unmounted)
    expect(person.ownOrders).toEqual(none.ownOrders);
    // and the route the drive rig reads is the same derivation, byte for byte
    expect(person.route).not.toBe("null");
    expect(person.route).toBe(none.route);
    expect(person.derivations).toBe(none.derivations);
  });

  it("the hold rising on a mounted layer hides it on that render without a new derivation; crashPinned and offRoad keep it drawn", async () => {
    const seq = await mountGuidance([null, "crashPinned", "offRoad", "personStruck"]);
    const [none, pinned, off, person] = seq;
    expect(pinned!.drawnOrders).toEqual(none!.drawnOrders);
    expect(off!.drawnOrders).toEqual(none!.drawnOrders);
    expect(person!.drawnOrders).toEqual([]);
    expect(new Set(seq.map((r) => r.route)).size).toBe(1);
    expect(new Set(seq.map((r) => r.derivations)).size).toBe(1);
  });

  it("sc-vu-bikelane-turn@L1, a turn ahead: the chevron and its pool are drawn with no hold and not under personStruck", async () => {
    const none = (await mountGuidance([null], "sc-vu-bikelane-turn", 1))[0]!;
    const person = (await mountGuidance(["personStruck"], "sc-vu-bikelane-turn", 1))[0]!;
    // 17 = the chevron pool, which is drawn only with the chevron (renderOrder 21)
    expect(none.drawnOrders).toContain(17);
    expect(none.drawnOrders).toContain(21);
    expect(person.drawnOrders).toEqual([]);
    expect(person.ownOrders).toEqual(none.ownOrders);
    expect(person.route).toBe(none.route);
  });
});

describe("the scene's mount passes the hold to the layer and to the shadow ribbon", () => {
  const src = readFileSync(path.resolve(__dirname, "../LessonScene.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("RouteGuidance receives the shell's routeHold", () => {
    const mount = src.slice(src.indexOf("<RouteGuidance"), src.indexOf("/>", src.indexOf("<RouteGuidance")));
    expect(mount).toMatch(/\brouteHold=\{routeHold\}/);
    // HIDDEN, NOT UNMOUNTED: the mount's own condition is still the free-drive
    // one alone, so the layer (and the route it publishes) lives through the hold
    const head = src.slice(src.lastIndexOf("{", src.indexOf("<RouteGuidance")) - 40, src.indexOf("<RouteGuidance"));
    expect(head).toMatch(/\{lesson\.objectives\.length > 0 \? \(\s*$/);
  });
  it("the S1 shadow aid's ribbon leaves by the same predicate", () => {
    const at = src.indexOf("trace={shadowTrace}\n              clockRef={aidClockRef}");
    expect(at).toBeGreaterThan(0);
    const mount = src.slice(at, src.indexOf("/>", at));
    expect(mount).toMatch(/showRibbon=\{!routeGuidanceStandsDown\(routeHold\)\}/);
  });
});
