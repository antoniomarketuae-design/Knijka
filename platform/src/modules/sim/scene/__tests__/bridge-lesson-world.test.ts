/**
 * THE FROZEN-BRIDGE LESSON, BUILT THE WAY THE RUNNING APP BUILDS IT.
 *
 * Row sc-ac-ice:86eab7e9 — „sc-ac-aquaplane, sc-ac-ice and sc-ac-bridge-ice
 * still render the same stretch of street — the same mid-rise block facades,
 * the same tree line and the same unbroken kerbside parked-car row". It is
 * judged on the 03-ready frame: the camera at the spawn, (4.06, 15), looking
 * north. Round 1 built a deck 235 m ahead of that camera and left the first
 * 220 m of the two worlds identical piece for piece (the round-1 verifier's
 * F1: the same 28 parked bodies, the same near-road trunks, facades untouched),
 * and every bridge test called `buildWorldGeometry` directly, so a recipe that
 * dropped the bridge from the LESSON world went green (F2, mutant V9), as did a
 * `WorldColliders` that never mounted the wall trimesh (F5, mutant V5).
 *
 * So every world in this file comes out of `buildLessonWorldCore` — the
 * function LessonScene and the clip-capture rig both call — fed the PUBLIC
 * district document the scene fetches, and every parked body comes out of
 * `computeParkedCars` with exactly the arguments TrafficLayer's `useMemo`
 * passes it (the recipe's district, the layer's default lane width, the
 * recipe's clear zones). That those ARE the layer's arguments, and that its
 * row is the one it renders, is not asserted here but RUN through the
 * component in traffic/__tests__/bridge-parked-row-live-layer.test.ts (round-2
 * verifier X1: a copied call cannot see a transform inside the layer).
 *
 * §1  the live recipe carries the bridge (deck, parapets, the wall collider,
 *     the embankment railing) at EVERY authored rung;
 * §2  what the 03-ready camera and the first drive frames see, [15, 250]: the
 *     bridgehead embankment against the street-with-ice — no kerbside row, no
 *     street tree line, no overhead line, no street facade near the road, a
 *     continuous railing along both footways, lamps paired on the railing line
 *     — and nothing placed at the same spot in both worlds;
 * §3  the wall the student sees is a wall the physics world mounts.
 *
 * Counts that follow road length (lamps, trees) are NOT the proof here; the
 * proof is where things stand, in the stretch the frame shows.
 */
import fs from "node:fs";
import path from "node:path";
import { isValidElement, type ReactElement } from "react";
import { RigidBody, TrimeshCollider } from "@react-three/rapier";
import { beforeAll, describe, expect, it } from "vitest";
import { PERCEPTUAL_ROAD_SCALE } from "../../contracts";
import { compileScenario, SCENARIO_TEMPLATES, type ScenarioLevel } from "../../lessons/scenario";
import type { ScenarioSpec } from "../../lessons/scenario/types";
import { computeParkedCars } from "../../traffic/TrafficLayer";
import type { TrafficDistrict } from "../../traffic/types";
import { SIDEWALK_WIDTH_M } from "../../world/builders/constants";
import { WorldColliders } from "../../world/components/WorldColliders";
import type { WorldGeometry } from "../../world";
import { buildLessonWorldCore, type LessonWorldCore } from "../lessonWorldRecipe";

/** The camera of the 03-ready frame: the spawn both lessons start at. */
const EYE_Y = 15;
/** The near abutment of ac-bridge-v1 (its deck / icePatch is [250, 340]). */
const DECK_FROM = 250;
const DECK_TO = 340;
/** The stretch the 03-ready frame and the first drive frames look down. */
const SIGHT: readonly [number, number] = [EYE_Y, DECK_FROM];
/** ac-bridge-v1 / ac-ice-v1 carriageway half-width (two 8.125 m drawn lanes). */
const HALF_ROAD = 8.125;
/** The pavement's outer edge. */
const FOOTWAY_EDGE = HALF_ROAD + SIDEWALK_WIDTH_M;
/** TrafficLayer's default `laneWidthM` — LessonScene passes none. */
const LAYER_LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;
/** Worst-case parked-body half-length (TrafficLayer PARKED_HALF_LEN_M). */
const PARKED_HALF_LEN = 2.25;
/** Where the far embankment ends and the city resumes (far blocks at 390). */
const EMBANKMENT_TO = 380;

const spec = (id: string): ScenarioSpec => {
  const s = SCENARIO_TEMPLATES.find((t) => t.id === id);
  if (!s) throw new Error(`no template ${id}`);
  return s;
};
const publicRaw = (districtId: string): unknown =>
  JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "world", `${districtId}.json`), "utf8"),
  ) as unknown;

function liveCore(templateId: string, level: ScenarioLevel): LessonWorldCore {
  const s = spec(templateId);
  const lesson = compileScenario(s, level);
  return buildLessonWorldCore(lesson, publicRaw(s.map.districtId));
}
function liveParked(core: LessonWorldCore) {
  return computeParkedCars(
    core.district as unknown as TrafficDistrict,
    LAYER_LANE_W,
    core.parkedClearZones,
  );
}

/** District-space (x, y, h) of every vertex of a mesh-like buffer. */
function points(mesh: { positions: ArrayLike<number> }): [number, number, number][] {
  const out: [number, number, number][] = [];
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) out.push([p[i]!, -p[i + 2]!, p[i + 1]!]);
  return out;
}
const xy = (t: { position: readonly number[] }): [number, number] => [t.position[0]!, -t.position[2]!];
const within = (y: number, [a, b]: readonly [number, number]) => y >= a && y <= b;

// ---------------------------------------------------------------------------
// §1 — the running app's recipe builds the bridge
// ---------------------------------------------------------------------------

describe("§1 the LESSON world (buildLessonWorldCore) carries the bridge at every rung", () => {
  const levels = spec("sc-ac-bridge-ice").levels.map((l) => l.level as ScenarioLevel);

  it("the template has rungs to check", () => {
    expect(levels.length).toBeGreaterThanOrEqual(1);
  });

  for (const level of levels) {
    it(`L${level}: deck, both parapets and the wall collider come out of the recipe`, () => {
      const core = liveCore("sc-ac-bridge-ice", level);
      const g = core.geometry;
      expect(g.stats.bridgeDecks).toBe(1);
      expect(g.stats.bridgeParapets).toBe(2);
      expect(g.bridgeDecks.deck.positions.length).toBeGreaterThan(0);
      expect(g.bridgeDecks.parapets.positions.length).toBeGreaterThan(0);
      // The parapet's inner face (9.7) is in the wall collider on the span.
      const onFace = points(g.colliders.buildings).filter(
        ([x, y]) => Math.abs(Math.abs(x) - 9.7) < 1e-3 && y > DECK_FROM && y < DECK_TO,
      );
      expect(onFace.length).toBeGreaterThan(0);
    });

    it(`L${level}: TrafficLayer's curb pass, fed as LessonScene feeds it, parks nobody from the spawn to the far embankment`, () => {
      const core = liveCore("sc-ac-bridge-ice", level);
      const cars = liveParked(core);
      const onBridgehead = cars.filter(
        (c) => c.y + PARKED_HALF_LEN > 0 && c.y - PARKED_HALF_LEN < EMBANKMENT_TO,
      );
      expect(onBridgehead).toEqual([]);
      // …and the city past the far embankment still parks (a control: a pass
      // that parked nobody anywhere would satisfy the line above).
      expect(cars.filter((c) => c.y > EMBANKMENT_TO).length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// §2 — what the 03-ready camera sees
// ---------------------------------------------------------------------------

describe("§2 from the spawn, sc-ac-bridge-ice is a bridgehead and sc-ac-ice is a street", () => {
  let bridge: LessonWorldCore;
  let ice: LessonWorldCore;
  let bw: WorldGeometry;
  let iw: WorldGeometry;

  beforeAll(() => {
    bridge = liveCore("sc-ac-bridge-ice", 1);
    ice = liveCore("sc-ac-ice", 1);
    bw = bridge.geometry;
    iw = ice.geometry;
  });

  it("both lessons really do start at the same camera (the comparison is like for like)", () => {
    const at = (core: LessonWorldCore, s: ScenarioSpec) =>
      core.spawnPoints.find((p) => p.id === s.start.spawnPointId)!;
    const b = at(bridge, spec("sc-ac-bridge-ice"));
    const i = at(ice, spec("sc-ac-ice"));
    expect([b.x, b.y]).toEqual([4.06, EYE_Y]);
    expect([i.x, i.y]).toEqual([4.06, EYE_Y]);
  });

  it("NO kerbside parked row in the sight stretch — the street-with-ice keeps its unbroken one", () => {
    const b = liveParked(bridge).filter((c) => within(c.y, SIGHT));
    const i = liveParked(ice).filter((c) => within(c.y, SIGHT));
    expect(b).toEqual([]);
    expect(i.length).toBeGreaterThanOrEqual(20);
  });

  it("NO street tree line along the embankment — the street keeps its trees at the kerb", () => {
    const near = (w: WorldGeometry) =>
      w.trees.map(xy).filter(([x, y]) => within(y, SIGHT) && Math.abs(x) < 20);
    expect(near(bw)).toEqual([]);
    expect(near(iw).length).toBeGreaterThanOrEqual(5);
  });

  it("NO overhead line strung along the bridgehead or the deck", () => {
    const poles = (w: WorldGeometry, to: number) =>
      w.utilityPoles.map(xy).filter(([x, y]) => y >= 0 && y <= to && Math.abs(x) < 20);
    expect(poles(bw, EMBANKMENT_TO)).toEqual([]);
    expect(poles(iw, DECK_FROM).length).toBeGreaterThan(0);
    // No surviving pole hangs a wire into the removed stretch.
    for (const p of bw.utilityPoles) {
      const [, y] = xy(p);
      if (p.spanM > 0) expect(y + p.spanM <= 0 || y >= EMBANKMENT_TO, `wire from y=${y}`).toBe(true);
    }
  });

  it("NO street facade near the road: the blocks stand back at the foot of the embankment", () => {
    // Every building wall the frame can see beside the road (the belt at the
    // world's rim is ~70 m out and is excluded by the 60 m window).
    const nearest = (w: WorldGeometry) => {
      let best = Infinity;
      for (const m of w.buildingWalls) {
        for (const [x, y] of points(m)) {
          if (within(y, SIGHT) && Math.abs(x) < 60) best = Math.min(best, Math.abs(x));
        }
      }
      return best;
    };
    // At least 12 m of embankment slope between the footway edge and a facade…
    expect(nearest(bw) - FOOTWAY_EDGE).toBeGreaterThanOrEqual(12);
    // …where the street has a block front 4.5 m past its pavement.
    expect(nearest(iw) - FOOTWAY_EDGE).toBeLessThan(6);
  });

  it("a CONTINUOUS railing runs along both footways from the spawn to the abutment", () => {
    for (const side of [1, -1] as const) {
      const run = bw.railings
        .map(xy)
        .filter(
          ([x, y]) =>
            Math.sign(x) === side &&
            Math.abs(x) > FOOTWAY_EDGE - 0.6 &&
            Math.abs(x) <= FOOTWAY_EDGE &&
            y >= 0 &&
            y <= DECK_FROM,
        )
        .map(([, y]) => y)
        .sort((a, b) => a - b);
      expect(run.length, `side ${side}`).toBeGreaterThan(0);
      // 6.055 m panels, centre to centre, no gap: a guard rail, not the
      // street's 5-on / 4-off parapet stretches.
      expect(run[0]!).toBeLessThanOrEqual(EYE_Y);
      expect(run[run.length - 1]!).toBeGreaterThanOrEqual(DECK_FROM - 6.1);
      for (let k = 1; k < run.length; k++) {
        expect(run[k]! - run[k - 1]!, `gap on side ${side} at y=${run[k - 1]}`).toBeLessThanOrEqual(6.06);
      }
    }
    // …and the street's 5-on / 4-off kerb parapet is withdrawn along the whole
    // bridgehead: the railing at the footway edge is the barrier there.
    expect(
      bw.railings
        .map(xy)
        .filter(([x, y]) => y >= 0 && y <= EMBANKMENT_TO && Math.abs(x) <= FOOTWAY_EDGE - 0.6),
    ).toEqual([]);
    // The street has no railing on that line at all.
    expect(
      iw.railings.map(xy).filter(([x, y]) => within(y, SIGHT) && Math.abs(x) > FOOTWAY_EDGE - 0.6),
    ).toEqual([]);
  });

  it("the embankment railing is a wall the car meets, not scenery it drives through", () => {
    const col = points(bw.colliders.buildings);
    for (const side of [1, -1] as const) {
      const face = col.filter(
        ([x, y, h]) =>
          Math.sign(x) === side &&
          Math.abs(x) > FOOTWAY_EDGE - 0.6 &&
          Math.abs(x) <= FOOTWAY_EDGE &&
          y >= 0 &&
          y <= DECK_FROM &&
          h > 1,
      );
      expect(face.length, `side ${side}`).toBeGreaterThan(0);
      const ys = face.map(([, y]) => y);
      expect(Math.min(...ys)).toBeLessThanOrEqual(EYE_Y);
      expect(Math.max(...ys)).toBeGreaterThanOrEqual(DECK_FROM - 6.1);
    }
  });

  it("lamps stand in PAIRS on the railing / parapet line, never beyond the deck's edge", () => {
    const lamps = bw.streetlights.map(xy).filter(([, y]) => y >= 0 && y <= EMBANKMENT_TO);
    expect(lamps.length).toBeGreaterThan(0);
    for (const [x, y] of lamps) {
      // On the footway / cornice, inside its outer edge — never on air.
      expect(Math.abs(x), `lamp at (${x}, ${y})`).toBeLessThanOrEqual(FOOTWAY_EDGE);
      expect(Math.abs(x), `lamp at (${x}, ${y})`).toBeGreaterThan(HALF_ROAD + 1);
      // Each has its twin across the road at the same station.
      expect(
        lamps.some(([x2, y2]) => Math.abs(y2 - y) < 1e-6 && Math.abs(x2 + x) < 1e-6),
        `lamp at (${x}, ${y}) has no twin`,
      ).toBe(true);
    }
  });

  it("PIECE FOR PIECE: nothing in the sight stretch stands at the same spot in both worlds", () => {
    // The round-1 finding in its own terms: parked bodies, trunks, poles,
    // parapet panels, lamp columns and facade corners placed identically.
    type P = [number, number];
    const placed = (core: LessonWorldCore): P[] => {
      const w = core.geometry;
      const out: P[] = [
        ...liveParked(core).map((c) => [c.x, c.y] as P),
        ...w.trees.map(xy),
        ...w.utilityPoles.map(xy),
        ...w.railings.map(xy),
        ...w.streetlights.map(xy),
        ...core.district.buildings.flatMap((b) => b.footprint.map(([x, y]) => [x, y] as P)),
      ];
      return out.filter(([x, y]) => within(y, SIGHT) && Math.abs(x) < 60);
    };
    const b = placed(bridge);
    const i = placed(ice);
    expect(b.length).toBeGreaterThan(0);
    expect(i.length).toBeGreaterThan(0);
    const shared = b.filter(([x, y]) => i.some(([x2, y2]) => Math.hypot(x - x2, y - y2) < 0.25));
    expect(shared).toEqual([]);
  });

  it("the sight line from the driver's eye to the near abutment's pylons is open", () => {
    // Round 1: the line to the right-hand pylon ran through the last parked
    // body at y = 235.4. Bodies and trunks between the eye and the abutment,
    // as discs of their half-length / 0.4 m, must not cut either line.
    const eye: [number, number] = [4.06, EYE_Y];
    const blockers: { x: number; y: number; r: number }[] = [
      ...liveParked(bridge).map((c) => ({ x: c.x, y: c.y, r: PARKED_HALF_LEN })),
      ...bw.trees.map(xy).map(([x, y]) => ({ x, y, r: 0.4 })),
    ].filter((o) => o.y > EYE_Y && o.y < DECK_FROM);
    for (const pylonX of [9.7 + 0.8, -(9.7 + 0.8)]) {
      const to: [number, number] = [pylonX, DECK_FROM + 0.8];
      for (const o of blockers) {
        const dx = to[0] - eye[0];
        const dy = to[1] - eye[1];
        const t = Math.max(0, Math.min(1, ((o.x - eye[0]) * dx + (o.y - eye[1]) * dy) / (dx * dx + dy * dy)));
        const d = Math.hypot(eye[0] + t * dx - o.x, eye[1] + t * dy - o.y);
        expect(d, `line to pylon ${pylonX} cut at (${o.x}, ${o.y})`).toBeGreaterThan(o.r);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §3 — the physics world mounts the wall
// ---------------------------------------------------------------------------

/** Every `<RigidBody>` in a returned tree, in document order. */
function rigidBodies(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) rigidBodies(child, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  if (node.type === RigidBody) out.push(node);
  const kids = (node.props as { children?: unknown }).children;
  if (kids !== undefined) rigidBodies(kids, out);
  return out;
}
function trimeshesOf(body: ReactElement): ReactElement[] {
  const out: ReactElement[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    if (n.type === TrimeshCollider) out.push(n);
    const kids = (n.props as { children?: unknown }).children;
    if (kids !== undefined) walk(kids);
  };
  walk((body.props as { children?: unknown }).children);
  return out;
}

describe("§3 the parapet and the railing are mounted as a fixed body", () => {
  it("WorldColliders, given the LESSON world's colliders, mounts the wall trimesh that holds them", () => {
    const core = liveCore("sc-ac-bridge-ice", 1);
    const col = core.geometry.colliders;
    const bodies = rigidBodies(WorldColliders({ colliders: col }));
    const walls = bodies.filter((b) => (b.props as { name?: string }).name === "district-buildings");
    expect(walls).toHaveLength(1);
    // A FIXED body the car meets, not a sensor (round-2 verifier X3: a
    // `sensor` collider reports the touch and lets the car through it).
    const wallProps = walls[0]!.props as { type?: string; sensor?: boolean };
    expect(wallProps.type).toBe("fixed");
    expect(wallProps.sensor ?? false).toBe(false);
    const meshes = trimeshesOf(walls[0]!);
    expect(meshes).toHaveLength(1);
    const meshProps = meshes[0]!.props as { sensor?: boolean; friction?: number };
    expect(meshProps.sensor ?? false).toBe(false);
    expect(meshProps.friction).toBeGreaterThan(0);
    const args = (meshes[0]!.props as { args: [Float32Array, Uint32Array] }).args;
    // THE SAME buffers — not a copy that could have dropped the wall.
    expect(args[0]).toBe(col.buildings.positions);
    expect(args[1]).toBe(col.buildings.indices);
    // …and those buffers index triangles on the parapet face.
    const faceVerts = new Set<number>();
    for (let v = 0; v < args[0].length / 3; v++) {
      const x = args[0][v * 3]!;
      const y = -args[0][v * 3 + 2]!;
      if (Math.abs(Math.abs(x) - 9.7) < 1e-3 && y > DECK_FROM && y < DECK_TO) faceVerts.add(v);
    }
    expect(faceVerts.size).toBeGreaterThan(0);
    let tris = 0;
    for (let t = 0; t + 2 < args[1].length; t += 3) {
      if (faceVerts.has(args[1][t]!) && faceVerts.has(args[1][t + 1]!) && faceVerts.has(args[1][t + 2]!)) tris++;
    }
    expect(tris).toBeGreaterThan(0);
  });

  it("the scene hands THAT geometry to the world and the physics mount (source seams, stated as such)", () => {
    // The R3F halves cannot be called as plain functions (hooks); these pin
    // the two lines that carry the recipe's geometry into them. The mount
    // ELEMENTS are pinned whole (no `physics=` on <DistrictWorld>, no
    // `laneWidthM=` on <TrafficLayer>) and TrafficLayer's parked-row memo is
    // RUN in traffic/__tests__/bridge-parked-row-live-layer.test.ts (round-2
    // verifier X1/X2); these line pins stay as the cheap first tripwire.
    const root = path.join(process.cwd(), "src");
    const scene = fs.readFileSync(path.join(root, "components", "sim", "LessonScene.tsx"), "utf8");
    expect(scene).toMatch(/const core = buildLessonWorldCore\(props\.lesson, raw\);/);
    expect(scene).toMatch(/<DistrictWorld\s+district=\{district\}\s+prebuilt=\{geometry\}/);
    expect(scene).toMatch(/district=\{district as TrafficDistrict\}/);
    expect(scene).toMatch(/parkedClearZones=\{built\.parkedClearZones\}/);
    const dw = fs.readFileSync(
      path.join(root, "modules", "sim", "world", "components", "DistrictWorld.tsx"),
      "utf8",
    );
    expect(dw).toMatch(/prebuilt \?\? buildWorldGeometry\(district, buildOptions\)/);
    expect(dw).toMatch(/physics \? <WorldColliders colliders=\{world\.colliders\} \/> : null/);
    expect(dw).toMatch(/physics = true,/);
  });
});
