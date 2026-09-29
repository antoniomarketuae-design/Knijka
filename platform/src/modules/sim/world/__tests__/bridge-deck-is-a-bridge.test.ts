/**
 * THE FROZEN-BRIDGE LESSON HAS A BRIDGE — measured on the BUILT world.
 *
 * Row sc-ac-ice:86eab7e9 (verifier-corrected to PRODUCT_REPAIR): sc-ac-ice and
 * sc-ac-bridge-ice read as one street — same facades, same tree line, the same
 * unbroken kerbside parked row — and „a frozen-bridge lesson still has no
 * bridge deck and no parapet" (w22). The district-v1 schema had no bridge
 * primitive, so ac-bridge-v1's only „bridge" channel was the ABSENCE of
 * buildings around [250, 340] (ac-bridge-districts.test.ts, THE VOID).
 *
 * The repair adds one: an edge may declare `bridges: [{ fromM, toM }]`, and
 *   - `builders/bridgeDeck.ts` builds a DECK (expansion joints across the
 *     carriageway at both abutments, the deck footway slab, the cornice)
 *     and two PARAPETS with abutment pylons along the span, and puts the
 *     parapets into the wall collider the car can actually meet;
 *   - `traffic/TrafficLayer.computeParkedCars` parks NOBODY on the span —
 *     ЗДвП чл. 98, ал. 1, т. 3, retrieved from content/law/acts/zdvp.json:
 *     «Престоят и паркирането са забранени: … на мостове, надлези»;
 *   - the tree pass keeps its trunks off the deck's flanks.
 * ac-ice-v1 declares no bridge and stays a street with ice.
 *
 * Lamp and tree COUNTS are not the proof (they follow road length). The proof
 * is geometry the other map does not have, at the place the lesson grades.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { computeParkedCars } from "../../traffic/TrafficLayer";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { bridgeParapetObstacles } from "../../traces/scAcBridgeIce";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import {
  BRIDGE_PARAPET_HEIGHT_M,
  BRIDGE_PARAPET_THICKNESS_M,
  BRIDGE_STATION_STEP_M,
  BRIDGE_TREE_CLEAR_LATERAL_M,
  edgeBridgeSpans,
} from "../builders/bridgeDeck";
import { SIDEWALK_TOP_Y } from "../builders/constants";
import { countStaticDrawSlots, staticDrawSlotInputFromWorld, staticDrawSlotTerms } from "../builders/drawSlots";
import { assertDistrict, type District, type MeshData, type WorldGeometry } from "../types";

const DECK_FROM = 250;
const DECK_TO = 340;
/** ac-bridge-v1's carriageway half-width (2 drawn lanes of 8.125 / 2). */
const HALF_ROAD = 8.125;
/** Worst-case parked-body half-length (TrafficLayer PARKED_HALF_LEN_M). */
const PARKED_HALF_LEN = 2.25;

function worldDir(): string {
  const here = path.join(process.cwd(), "content", "world");
  return fs.existsSync(here) ? here : path.resolve(process.cwd(), "..", "content", "world");
}
function loadRaw(id: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(worldDir(), `${id}.json`), "utf8")) as unknown;
}

/** District-space (x, y, h) triples of a mesh (world z = -y). */
function points(mesh: MeshData | { positions: ArrayLike<number> }): [number, number, number][] {
  const out: [number, number, number][] = [];
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) out.push([p[i]!, -p[i + 2]!, p[i + 1]!]);
  return out;
}

describe("ac-bridge-v1 is a bridge; ac-ice-v1 is a street", () => {
  let bridge: District;
  let ice: District;
  let bw: WorldGeometry;
  let iw: WorldGeometry;

  beforeAll(() => {
    bridge = assertDistrict(loadRaw("ac-bridge-v1"));
    ice = assertDistrict(loadRaw("ac-ice-v1"));
    bw = buildWorldGeometry(bridge, { seed: 7 });
    iw = buildWorldGeometry(ice, { seed: 7 });
  });

  it("the deck is authored on the edge and is the SAME span as the ice (one fact, not two)", () => {
    const edge = bridge.roads.edges[0]!;
    // The deck, and the bridgehead embankment either side of it: from the
    // map's start (the spawn frame looks down it) to 10 m short of the far
    // blocks, where the street resumes.
    expect(edgeBridgeSpans(edge)).toEqual([
      { fromM: DECK_FROM, toM: DECK_TO, approachFromM: 0, approachToM: 380 },
    ]);
    const ice0 = (bridge.zones ?? []).find((z) => z.kind === "icePatch")!;
    expect([ice0.fromM, ice0.toM]).toEqual([DECK_FROM, DECK_TO]);
    // …and the street-with-ice declares none.
    for (const e of ice.roads.edges) expect(edgeBridgeSpans(e)).toEqual([]);
  });

  it("PARAPETS stand on both sides along the whole span, where the recorded ghost meets them", () => {
    const pts = points(bw.bridgeDecks.parapets);
    expect(pts.length).toBeGreaterThan(0);
    // The recorder's parapet rects (traces/scAcBridgeIce) — the wall the
    // brake-on-deck ghost collides with. The built wall must be THAT wall.
    const rects = bridgeParapetObstacles();
    expect(rects).toHaveLength(2);
    for (const rect of rects) {
      const side = Math.sign(rect.x);
      const inner = Math.abs(rect.x) - rect.halfWidthM;
      const outer = Math.abs(rect.x) + rect.halfWidthM;
      // Wall vertices on this side, between its inner and outer face.
      const wall = pts.filter(
        ([x, y]) =>
          Math.sign(x) === side &&
          Math.abs(x) >= inner - 1e-3 &&
          Math.abs(x) <= outer + 1e-3 &&
          y >= DECK_FROM - 1e-3 &&
          y <= DECK_TO + 1e-3,
      );
      expect(wall.length, `side ${side}`).toBeGreaterThan(0);
      // The inner face is at the recorded inner face, not somewhere near it.
      const innerMost = Math.min(...wall.map(([x]) => Math.abs(x)));
      expect(innerMost).toBeCloseTo(inner, 3);
      expect(Math.max(...wall.map(([x]) => Math.abs(x)))).toBeCloseTo(outer, 3);
      // It runs abutment to abutment…
      const ys = wall.map(([, y]) => y);
      expect(Math.min(...ys)).toBeCloseTo(DECK_FROM, 3);
      expect(Math.max(...ys)).toBeCloseTo(DECK_TO, 3);
      // …WITHOUT A GAP: the inner face is one run, never two stubs at the ends.
      const face = [...new Set(wall.filter(([x]) => Math.abs(Math.abs(x) - inner) < 1e-3).map(([, y]) => y))].sort((a, b) => a - b);
      for (let i = 1; i < face.length; i++) {
        expect(face[i]! - face[i - 1]!, `gap in the ${side} wall at y=${face[i - 1]}`).toBeLessThanOrEqual(BRIDGE_STATION_STEP_M + 1e-6);
      }
      // …and stands a parapet's height over the footway.
      expect(Math.max(...wall.map(([, , h]) => h))).toBeGreaterThanOrEqual(
        SIDEWALK_TOP_Y + BRIDGE_PARAPET_HEIGHT_M - 1e-6,
      );
    }
    expect(BRIDGE_PARAPET_THICKNESS_M).toBeCloseTo(2 * rects[0]!.halfWidthM, 6);
  });

  it("the ABUTMENT pylons stand taller than the parapet at both ends of both walls", () => {
    const pts = points(bw.bridgeDecks.parapets);
    const top = SIDEWALK_TOP_Y + BRIDGE_PARAPET_HEIGHT_M;
    for (const end of [DECK_FROM, DECK_TO]) {
      for (const side of [1, -1]) {
        const pylon = pts.filter(
          ([x, y, h]) => Math.sign(x) === side && Math.abs(y - end) < 1.5 && h > top + 0.2,
        );
        expect(pylon.length, `pylon at ${end} side ${side}`).toBeGreaterThan(0);
      }
    }
  });

  it("the DECK carries an expansion joint across the whole carriageway at each abutment", () => {
    const pts = points(bw.bridgeDecks.deck);
    expect(pts.length).toBeGreaterThan(0);
    for (const end of [DECK_FROM, DECK_TO]) {
      const joint = pts.filter(([, y, h]) => Math.abs(y - end) < 0.5 && h < SIDEWALK_TOP_Y);
      expect(joint.length, `joint at ${end}`).toBeGreaterThan(0);
      const xs = joint.map(([x]) => x);
      expect(Math.min(...xs)).toBeLessThanOrEqual(-HALF_ROAD + 0.5);
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(HALF_ROAD - 0.5);
    }
    // No deck geometry anywhere off the span.
    for (const [, y] of pts) {
      expect(y).toBeGreaterThanOrEqual(DECK_FROM - 1);
      expect(y).toBeLessThanOrEqual(DECK_TO + 1);
    }
  });

  it("the parapet is a WALL the car can meet — it is in the building collider on the span", () => {
    const col = points(bw.colliders.buildings);
    const [east] = bridgeParapetObstacles();
    const inner = east!.x - east!.halfWidthM;
    const onFace = col.filter(
      ([x, y]) => Math.abs(Math.abs(x) - inner) < 1e-3 && y > DECK_FROM && y < DECK_TO,
    );
    expect(onFace.length).toBeGreaterThan(0);
    // EVERY drawn wall vertex is a collider vertex: the wall you see is the
    // wall you hit, along its whole length (not only at the pylons).
    const key = ([x, y, h]: [number, number, number]) =>
      `${x.toFixed(3)},${y.toFixed(3)},${h.toFixed(3)}`;
    const colKeys = new Set(col.map(key));
    const drawn = points(bw.bridgeDecks.parapets);
    expect(drawn.length).toBeGreaterThan(0);
    const missing = drawn.filter((p) => !colKeys.has(key(p)));
    expect(missing.slice(0, 3)).toEqual([]);
    // The street-with-ice has no wall there (its only building is 16 m off).
    const iceCol = points(iw.colliders.buildings);
    expect(iceCol.filter(([x]) => Math.abs(Math.abs(x) - inner) < 1e-3)).toHaveLength(0);
  });

  it("the two worlds differ in deck and parapet — the street has neither", () => {
    expect(bw.stats.bridgeDecks).toBe(1);
    expect(bw.stats.bridgeParapets).toBe(2);
    expect(iw.stats.bridgeDecks).toBe(0);
    expect(iw.stats.bridgeParapets).toBe(0);
    expect(iw.bridgeDecks.deck.positions.length).toBe(0);
    expect(iw.bridgeDecks.parapets.positions.length).toBe(0);
  });

  it("NOBODY is parked on the deck or its bridgehead — the street past it keeps its row", () => {
    // Round 1 kept the approach's kerbside row, which is exactly what the
    // 03-ready frame showed (round-2 F1). The whole bridgehead is unparked
    // now; the city beyond the far embankment (380) parks as a street does.
    const cars = computeParkedCars(bridge as unknown as TrafficDistrict, DEFAULT_TRAFFIC_CONFIG.laneWidthM);
    const onDeck = cars.filter(
      (c) => c.y + PARKED_HALF_LEN > DECK_FROM && c.y - PARKED_HALF_LEN < DECK_TO,
    );
    expect(onDeck).toEqual([]);
    expect(cars.filter((c) => c.y - PARKED_HALF_LEN < 380)).toEqual([]);
    expect(cars.filter((c) => c.y > 380).length).toBeGreaterThan(0);
  });

  it("the street with ice keeps its unbroken kerbside row over ITS ice span", () => {
    const cars = computeParkedCars(ice as unknown as TrafficDistrict, DEFAULT_TRAFFIC_CONFIG.laneWidthM);
    const z = (ice.zones ?? []).find((q) => q.kind === "icePatch")!;
    expect(cars.filter((c) => c.y > z.fromM && c.y < z.toM).length).toBeGreaterThan(5);
  });

  it("no tree grows on the deck's flanks; nothing stands inside a parapet", () => {
    for (const t of bw.trees) {
      const x = t.position[0];
      const y = -t.position[2];
      const inSpan = y > DECK_FROM && y < DECK_TO;
      expect(inSpan && Math.abs(x) < BRIDGE_TREE_CLEAR_LATERAL_M, `tree at (${x}, ${y})`).toBe(false);
    }
    const [east] = bridgeParapetObstacles();
    const inner = east!.x - east!.halfWidthM;
    const outer = east!.x + east!.halfWidthM;
    for (const list of [bw.streetlights, bw.utilityPoles, bw.railings, bw.signs, bw.trees]) {
      for (const p of list) {
        const x = Math.abs(p.position[0]);
        const y = -p.position[2];
        expect(
          y > DECK_FROM && y < DECK_TO && x > inner && x < outer,
          `prop inside the parapet at (${p.position[0]}, ${y})`,
        ).toBe(false);
      }
    }
  });
});

describe("the deck reaches the screen", () => {
  it("the draw-slot budget charges the bridge's two meshes, and the recompute agrees", () => {
    const d = assertDistrict(loadRaw("ac-bridge-v1"));
    const w = buildWorldGeometry(d, { seed: 7 });
    const input = staticDrawSlotInputFromWorld(w);
    expect(staticDrawSlotTerms(input)).toContainEqual({ id: "bridge-deck", slots: 2 });
    expect(countStaticDrawSlots(input)).toBe(w.stats.staticDrawSlots);
  });

  it("StaticWorld mounts BOTH bridge meshes from the built world (the render seam)", () => {
    // A source seam, stated as such: the pure layer cannot mount R3F. It pins
    // that each buffer is turned into a geometry AND handed to a <mesh>, so a
    // deck that is built but never drawn fails here rather than on a frame.
    const src = fs.readFileSync(path.resolve(__dirname, "..", "components", "StaticWorld.tsx"), "utf8");
    expect(src).toContain("meshDataToGeometry(world.bridgeDecks.deck)");
    expect(src).toContain("meshDataToGeometry(world.bridgeDecks.parapets)");
    expect(src.split("<mesh geometry={geometries.bridgeDeck}")).toHaveLength(2);
    expect(src.split("<mesh geometry={geometries.bridgeParapets}")).toHaveLength(2);
  });
});

describe("a district that declares no bridge builds no deck", () => {
  it("every shipped district but ac-bridge-v1 has an empty deck, empty parapets and 0 in stats", () => {
    const dir = worldDir();
    let bridged = 0;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const d = assertDistrict(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
      const declares = d.roads.edges.some((e) => edgeBridgeSpans(e).length > 0);
      if (declares) {
        bridged++;
        expect(file).toBe("ac-bridge-v1.json");
        continue;
      }
      const w = buildWorldGeometry(d);
      expect(w.bridgeDecks.deck.positions.length, file).toBe(0);
      expect(w.bridgeDecks.parapets.positions.length, file).toBe(0);
      expect(w.stats.bridgeDecks, file).toBe(0);
    }
    expect(bridged).toBe(1);
  }, 180_000);
});

describe("a bridgehead that starts mid-run cuts the overhead line cleanly", () => {
  it("the last pole before the embankment ends its run — no wire is strung to a removed pole", () => {
    // ac-bridge-v1's own bridgehead starts at the map's origin, so no kept
    // pole ever precedes a dropped one there. Move the embankment's start to
    // 100 m (in memory) and the run 0 → 100 must end at its last pole.
    const raw = loadRaw("ac-bridge-v1") as {
      roads: { edges: { bridges: { approachFromM: number }[] }[] };
    };
    raw.roads.edges[0]!.bridges[0]!.approachFromM = 100;
    const d = assertDistrict(raw);
    const w = buildWorldGeometry(d, { seed: 7 });
    const ys = w.utilityPoles.map((p) => -p.position[2]);
    const before = w.utilityPoles.filter((p) => -p.position[2] < 100);
    expect(before.length).toBeGreaterThan(1);
    // None stands on the embankment or the deck…
    expect(ys.filter((y) => y >= 100 && y <= 380)).toEqual([]);
    // …every wire hangs between two standing poles…
    for (const p of w.utilityPoles) {
      if (p.spanM <= 0) continue;
      const y = -p.position[2];
      expect(
        ys.some((y2) => Math.abs(y2 - (y + p.spanM)) < 1e-6),
        `wire from y=${y} to y=${y + p.spanM} has no pole at its end`,
      ).toBe(true);
    }
    // …and the last one before the embankment carries none.
    const last = before.reduce((a, p) => (-p.position[2] > -a.position[2] ? p : a));
    expect(last.spanM).toBe(0);
    expect(w.stats.utilityWireSpans).toBe(w.utilityPoles.filter((p) => p.spanM > 0).length);
  });
});

describe("edgeBridgeSpans reads only well-formed spans", () => {
  const base = { id: "e", from: "a", to: "b", class: "residential", geometry: [[0, 0], [0, 100]] };
  it("absent, empty or garbage ⇒ no span", () => {
    expect(edgeBridgeSpans(base)).toEqual([]);
    expect(edgeBridgeSpans({ ...base, bridges: [] })).toEqual([]);
    expect(edgeBridgeSpans({ ...base, bridges: "yes" })).toEqual([]);
    expect(edgeBridgeSpans({ ...base, bridges: [{ fromM: 50, toM: 40 }] })).toEqual([]);
    expect(edgeBridgeSpans({ ...base, bridges: [{ fromM: Number.NaN, toM: 40 }] })).toEqual([]);
    expect(edgeBridgeSpans({ ...base, bridges: [{ fromM: 10 }] })).toEqual([]);
  });
  it("a valid span passes through unchanged, in authored order (no bridgehead ⇒ the abutments)", () => {
    expect(
      edgeBridgeSpans({ ...base, bridges: [{ fromM: 60, toM: 80 }, { fromM: 10, toM: 30 }] }),
    ).toEqual([
      { fromM: 60, toM: 80, approachFromM: 60, approachToM: 80 },
      { fromM: 10, toM: 30, approachFromM: 10, approachToM: 30 },
    ]);
  });
  it("a bridgehead is read when it WIDENS the deck, and falls back to the abutment otherwise", () => {
    const one = (b: Record<string, unknown>) => edgeBridgeSpans({ ...base, bridges: [b] })[0];
    expect(one({ fromM: 40, toM: 60, approachFromM: 5, approachToM: 90 })).toEqual({
      fromM: 40,
      toM: 60,
      approachFromM: 5,
      approachToM: 90,
    });
    // On the wrong side of its abutment, not finite, or not a number: none.
    expect(one({ fromM: 40, toM: 60, approachFromM: 50, approachToM: 55 })).toEqual({
      fromM: 40,
      toM: 60,
      approachFromM: 40,
      approachToM: 60,
    });
    expect(one({ fromM: 40, toM: 60, approachFromM: Number.NaN, approachToM: "far" })).toEqual({
      fromM: 40,
      toM: 60,
      approachFromM: 40,
      approachToM: 60,
    });
  });
});
