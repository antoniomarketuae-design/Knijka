/**
 * THE LOT HAS EDGES — measured the way the founder measured it: by looking
 * where the driver is looking and asking what is there.
 *
 * THE DEFECT. Five criticals and two majors across three parking drills say one
 * thing in three ways:
 *
 *   sc-park-bay-exit-rev:20034440 — „Out the windscreen there is literally
 *     nothing: one flat olive plane meeting a hazy sky, from 03-ready to
 *     07-end. No road surface, no kerb, no line, no prop, no shadow, no horizon
 *     detail. This is not an unpolished street, it is the absence of a street."
 *   sc-park-gap-short:a30318c6 / :3b981a51 — „by t178s the buildings, pavement
 *     and kerb are gone … there is no road surface at all, just grey ground".
 *   sc-park-gap-long:e7345a2c / :cdef522b — „at 05-stopped there is a boulevard
 *     with a railing, lamp posts, a tree and a parked row; at t189s all of it is
 *     gone … There is nothing to be parallel to."
 *
 * THE CAUSE, and why one test file covers three lessons: a lot map is a dressed
 * `residential` APPROACH plus a bare `service` AISLE, and every dressing pass is
 * gated on `SCENARIO_LIT_CLASSES`, which has no `service` in it. Measured on the
 * pre-fix builder, lot-perp-v1: sidewalks (the kerb) span y ∈ [-118.8, -33.2],
 * the last tree stands at y = -43, the last lamp at y = -40, and BOTH terminus
 * closures sit at y ≈ -138…-158 — the approach's far end, 140 m behind the
 * start. The aisle runs y ∈ [-30, +40]. Everything the student does happens
 * north of the last object in the world.
 *
 * HOW IT IS MEASURED HERE. Not by counting placements — a counter can be
 * incremented by scenery nobody can see. Every claim below fires a RAY from a
 * pose the lesson actually puts the car in, along the heading it actually
 * faces, against the built wall triangles, and asks how many metres of nothing
 * are in front of the windscreen. On the pre-fix builder every one of those
 * rays returns Infinity; that is the red these were written against.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED. The kerb. „Спри успоредно на бордюра" names
 * a raised бордюр, and that is `roads.ts`'s sidewalk pass stopping at the same
 * class gate — a different file's lane. These tests assert edges, distances and
 * clearances, never that the kerb is back.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scenarioBaysOf } from "../../contracts";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type MeshData } from "../types";

const WORLD_DIR = (() => {
  const local = path.join(process.cwd(), "content", "world");
  return fs.existsSync(local) ? local : path.resolve(process.cwd(), "..", "content", "world");
})();

function loadDistrict(id: string): District {
  return assertDistrict(
    JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf8")) as unknown,
  );
}

function scenarioLotIds(): string[] {
  return fs
    .readdirSync(WORLD_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .filter((id) => loadDistrict(id).meta.mapKind === "scenario-lot");
}

type P2 = [number, number];

/**
 * Every built facade as a 2D wall line, district space (world z = -districtY).
 *
 * A building is a vertical prism, so each wall triangle collapses to a SEGMENT
 * when projected onto the ground: take the two most distant of its three
 * projected vertices. Reading the drawn mesh rather than any placement list is
 * the point — this is what a student's eye is given.
 */
function wallSegments(meshes: readonly MeshData[]): Array<[P2, P2]> {
  const out: Array<[P2, P2]> = [];
  for (const m of meshes) {
    const p = m.positions;
    const idx = m.indices;
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const pts: P2[] = [0, 1, 2].map((k) => {
        const v = idx[t + k]! * 3;
        return [p[v]!, -p[v + 2]!] as P2;
      });
      let best: [P2, P2] = [pts[0]!, pts[1]!];
      let bestD = -1;
      for (const [a, b] of [
        [pts[0]!, pts[1]!],
        [pts[1]!, pts[2]!],
        [pts[0]!, pts[2]!],
      ] as Array<[P2, P2]>) {
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d > bestD) {
          bestD = d;
          best = [a, b];
        }
      }
      if (bestD > 1e-6) out.push(best);
    }
  }
  return out;
}

/**
 * Metres of clear air in front of a driver at `from` facing `headingDeg`, or
 * Infinity when the world has nothing in that direction at all.
 *
 * Heading is the district's own convention — the one `meta.scenario.bays`
 * and every ScenarioStart use: 0 = +y, 90 = +x, i.e. dir = [sin h, cos h].
 */
function clearAheadM(segs: Array<[P2, P2]>, from: P2, headingDeg: number): number {
  const h = (headingDeg * Math.PI) / 180;
  const dx = Math.sin(h);
  const dy = Math.cos(h);
  let best = Infinity;
  for (const [a, b] of segs) {
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const qx = a[0] - from[0];
    const qy = a[1] - from[1];
    const t = (qx * ey - qy * ex) / den;
    const s = (qx * dy - qy * dx) / den;
    if (t >= 0 && s >= 0 && s <= 1) best = Math.min(best, t);
  }
  return best;
}

/** Shortest distance from a point to the nearest built wall, m. */
function nearestWallM(segs: Array<[P2, P2]>, from: P2): number {
  let best = Infinity;
  for (const [a, b] of segs) {
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len2 = ex * ex + ey * ey;
    const t =
      len2 < 1e-12
        ? 0
        : Math.max(0, Math.min(1, ((from[0] - a[0]) * ex + (from[1] - a[1]) * ey) / len2));
    best = Math.min(best, Math.hypot(from[0] - (a[0] + t * ex), from[1] - (a[1] + t * ey)));
  }
  return best;
}

/**
 * The outward normals of every wall vertex standing on the plane x = `atX`,
 * as their district-space x component.
 *
 * The two flanks are mirror images in the aisle's lateral axis, so one of the
 * two rings always arrives clockwise; `buildings.buildOne` re-winds with
 * `toCCW` so that „interior on the left -> outward normal = right of travel"
 * holds for both. If that ever stops happening, a flank's facades point INTO
 * the block, get back-face culled, and the wall the driver is parked against is
 * invisible from the aisle and visible only from outside the lot — with every
 * vertex still in exactly the right place, so no distance in this file moves.
 * This is the only assertion that can see it.
 */
function faceNormalsXAt(
  meshes: readonly MeshData[],
  atX: number,
  yRange: [number, number],
): number[] {
  const out: number[] = [];
  for (const m of meshes) {
    const p = m.positions;
    const n = m.normals;
    for (let i = 0; i < p.length; i += 3) {
      const y = -p[i + 2]!;
      if (Math.abs(p[i]! - atX) > 1e-3 || y < yRange[0] || y > yRange[1]) continue;
      if (Math.abs(n[i]!) < 0.5) continue; // an end cap, not the long face
      out.push(n[i]!);
    }
  }
  return out;
}

/** The tallest built facade anywhere inside a district-space rect, m. */
function wallTopM(meshes: readonly MeshData[], rect: [number, number, number, number]): number {
  let top = -Infinity;
  for (const m of meshes) {
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]!;
      const y = -p[i + 2]!;
      if (x < rect[0] || x > rect[2] || y < rect[1] || y > rect[3]) continue;
      top = Math.max(top, p[i + 1]!);
    }
  }
  return top;
}

/** The lot's own roadway: the `service` edge, as authored. */
function aisleOf(d: District) {
  const e = d.roads.edges.filter((r) => r.class === "service");
  expect(e.length).toBe(1);
  const g = e[0]!.geometry as P2[];
  return { from: g[0]!, to: g[g.length - 1]! };
}

// ---------------------------------------------------------------------------
// The three lessons, at the poses their own templates put the car in
// ---------------------------------------------------------------------------

describe("the three drills whose frames showed an empty world", () => {
  it("sc-park-bay-exit-rev: something IS out the windscreen from 03-ready", () => {
    // templates-parking2.ts pins the start: „the centre of lot-bay-3 (5.03, 0)
    // facing 90° — nose east, deep in the bay". The finding is that this exact
    // view, „from 03-ready to 07-end", is one olive plane and a hazy sky.
    const world = buildWorldGeometry(loadDistrict("lot-perp-v1"));
    const segs = wallSegments(world.buildingWalls);
    const ahead = clearAheadM(segs, [5.03, 0], 90);
    // Was Infinity: lot-perp-v1's only facades were the kiosk 55 m behind and
    // to the left, and two terminus closures 140 m behind the start.
    expect(Number.isFinite(ahead)).toBe(true);
    // The bay's head is at x = 7.53 and the car's nose rests near x = 7.28, so
    // this is the far side of the walkway — an edge the driver is parked
    // against, not scenery on a horizon.
    expect(ahead).toBeGreaterThan(3);
    expect(ahead).toBeCloseTo(6.095, 2);
  });

  it("sc-park-gap-short: the aisle it reverses in has two sides and an end", () => {
    // lotgs-bay-3 (6.28, 0) is the target slot; the car works the aisle line
    // beside it. „Мястото между двете коли е късо — малко над седем метра"
    // asks for a judgement, and a judgement needs something that does not move.
    const world = buildWorldGeometry(loadDistrict("lot-gap-short-v1"));
    const segs = wallSegments(world.buildingWalls);
    expect(clearAheadM(segs, [0, 0], 90)).toBeCloseTo(11.125, 2); // bay side
    expect(clearAheadM(segs, [0, 0], 270)).toBeCloseTo(11.125, 2); // far side
    expect(clearAheadM(segs, [0, 0], 0)).toBeCloseTo(58, 2); // down the aisle
  });

  it("sc-park-gap-long: the vista down the aisle ends in a frontage", () => {
    // „Задача 2: влез НАПРЕД в мястото и спри успоредно на бордюра" is driven
    // northward up the aisle to lot-spawn-finish (0, 30.45). Pre-fix, every
    // one of these three rays ran to Infinity.
    const world = buildWorldGeometry(loadDistrict("lot-gap-long-v1"));
    const segs = wallSegments(world.buildingWalls);
    expect(clearAheadM(segs, [0, 30.45], 0)).toBeCloseTo(27.55, 2);
    expect(clearAheadM(segs, [0, 30.45], 90)).toBeCloseTo(11.125, 2);
    expect(clearAheadM(segs, [0, 30.45], 270)).toBeCloseTo(11.125, 2);
  });
});

// ---------------------------------------------------------------------------
// The whole catalogue — this is one defect, not three lessons
// ---------------------------------------------------------------------------

describe("every committed scenario-lot map is a place", () => {
  it("closes both flanks and the far end of all fourteen", () => {
    const ids = scenarioLotIds();
    // Guard the guard: an empty catalogue must fail loudly, not pass silently.
    expect(ids.length).toBe(14);
    for (const id of ids) {
      const d = loadDistrict(id);
      const segs = wallSegments(buildWorldGeometry(d).buildingWalls);
      const { from, to } = aisleOf(d);
      const axisDeg = (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI;
      const mid: P2 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
      // A flank each side, within the walkway + a block's depth…
      expect(`${id} right`).toBe(
        `${id} ${clearAheadM(segs, mid, axisDeg + 90) < 15 ? "right" : "OPEN"}`,
      );
      expect(`${id} left`).toBe(
        `${id} ${clearAheadM(segs, mid, axisDeg - 90) < 15 ? "left" : "OPEN"}`,
      );
      // …and the end frontage, past the last asphalt, seen from the aisle mouth.
      const end = clearAheadM(segs, from, axisDeg);
      expect(`${id} end at ${end.toFixed(1)}`).toBe(`${id} end at ${(len + 18).toFixed(1)}`);
    }
  }, 120000);

  it("puts nothing on the carriageway, in a bay, or on a spawn", () => {
    // The direction that matters more than the fix: an edge a correctly driven
    // car can hit is not an edge, it is a trap. Every authored lot trace path
    // stays inside the carriageway (measured: |x| <= 6.28 across all eight),
    // so the carriageway sweep below covers the shadow drives too.
    for (const id of scenarioLotIds()) {
      const d = loadDistrict(id);
      const segs = wallSegments(buildWorldGeometry(d).buildingWalls);
      for (const edge of d.roads.edges) {
        const g = edge.geometry as P2[];
        for (let i = 0; i + 1 < g.length; i++) {
          const a = g[i]!;
          const b = g[i + 1]!;
          const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
          for (let k = 0; k <= steps; k++) {
            const p: P2 = [
              a[0] + ((b[0] - a[0]) * k) / steps,
              a[1] + ((b[1] - a[1]) * k) / steps,
            ];
            // The built half-width on these maps is 8.125 m; 10 m is that plus
            // room, and far short of the 11.125 m the flanks actually stand at.
            expect(`${id} road ${p[0]},${p[1]}: ${nearestWallM(segs, p) >= 10}`).toBe(
              `${id} road ${p[0]},${p[1]}: true`,
            );
          }
        }
      }
      for (const bay of scenarioBaysOf(d)) {
        // The walkway is 3 m from the bay band; the binding side is the
        // carriageway, so the real clearance is larger. 3 m is the promise.
        expect(`${id} ${bay.id}: ${nearestWallM(segs, [bay.x, bay.y]) >= 3}`).toBe(
          `${id} ${bay.id}: true`,
        );
      }
      for (const sp of d.spawnPoints ?? []) {
        expect(`${id} ${sp.id}: ${nearestWallM(segs, [sp.x, sp.y]) >= 10}`).toBe(
          `${id} ${sp.id}: true`,
        );
      }
    }
  }, 120000);
});

// ---------------------------------------------------------------------------
// The numbers, one mutation each
// ---------------------------------------------------------------------------

describe("the enclosure's dimensions are the ones that were reasoned about", () => {
  const world = buildWorldGeometry(loadDistrict("lot-perp-v1"));
  const segs = wallSegments(world.buildingWalls);

  it("stands LOT_EDGE_CLEAR_M outside the last asphalt, not on it", () => {
    // 8.125 (built half-width) + 3 (the walkway). Set the clearance to 0 and
    // the flank lands on the carriageway edge; set it to 12 (the terminus
    // rule) and the lot's edge is 20 m from its own bays.
    expect(clearAheadM(segs, [0, 0], 90)).toBeCloseTo(11.125, 3);
  });

  it("is a block, not a billboard — TERMINUS_CLOSE_DEPTH_M deep", () => {
    // Fired from inside the flank, outward: 11.125 + 14 = 25.125.
    expect(clearAheadM(segs, [11.5, 0], 90) + 11.5).toBeCloseTo(25.125, 3);
  });

  it("stands TERMINUS_CLOSE_NEAR_M past the aisle's dead end", () => {
    // The aisle ends at y = 40; the frontage's near face is at 58, so the
    // student sees concrete then a building, not a wall in his face.
    expect(clearAheadM(segs, [0, 0], 0)).toBeCloseTo(58, 3);
  });

  it("takes TERMINUS_CLOSE_MIN_HEIGHT_M — an edge, not a canyon", () => {
    // Measured in the right flank's own band, which holds nothing else on this
    // map (the kiosk is at x <= -20, both terminus closures at y <= -138):
    // 9 m at 11.125 m lateral subtends 39° from the driver's eye.
    expect(wallTopM(world.buildingWalls, [11.12, -29, 25.2, 80])).toBeCloseTo(9, 3);
  });

  it("starts where the junction's open area ends and closes its corners", () => {
    // South end: the aisle's node is at y = -30 and its junction radius is
    // 2.03 m, so a flank that started at s = 0 would stand on the patch the
    // approach opens into the lot.
    expect(clearAheadM(segs, [11.5, -60], 0)).toBeCloseTo(32.03, 2);
    // North end: the flanks run PAST the dead end far enough to butt into the
    // end frontage, so the two corners of the U are joins, not 18 m slits.
    expect(clearAheadM(segs, [11.5, 100], 180) - 100).toBeCloseTo(-72, 2);
  });

  it("faces its facades at the driver, not away from him", () => {
    // The right flank's inner plane (x = 11.125) must look back down −x at the
    // aisle; its outer plane (x = 25.125) must look away. Reverse the ring and
    // both flip, the mesh stays exactly where it is, and the lot is bare again
    // — from inside it.
    const inner = faceNormalsXAt(world.buildingWalls, 11.125, [-29, 50]);
    expect(inner.length).toBeGreaterThan(0);
    expect(inner.every((nx) => nx < 0)).toBe(true);
    const outer = faceNormalsXAt(world.buildingWalls, 25.125, [-29, 50]);
    expect(outer.length).toBeGreaterThan(0);
    expect(outer.every((nx) => nx > 0)).toBe(true);
    // …and the same on the far side, which is the ring wound the other way
    // round in (s, u) and is exactly where a hand-ordered footprint goes wrong.
    const farInner = faceNormalsXAt(world.buildingWalls, -11.125, [-29, 50]);
    expect(farInner.length).toBeGreaterThan(0);
    expect(farInner.every((nx) => nx > 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Additive: four gates, and the branch the committed catalogue never binds
// ---------------------------------------------------------------------------

function synthetic(opts: {
  mapKind: string;
  aisleClass?: string;
  aisleGeometry?: P2[];
  bay?: { x: number; y: number; headingDeg: number; widthM: number; lengthM: number };
  /** The aisle runs ON into a further street — neither end is a dead end. */
  throughAisle?: boolean;
  /** `meta.scenario.bays` is absent: the document does not claim to be a lot. */
  noBays?: boolean;
  /** The approach ends on its OWN node at the aisle mouth (same metres,
   *  different id), so BOTH of the aisle's ends read as dead ends. */
  orphanMouth?: boolean;
}): District {
  const aisleGeometry: P2[] = opts.aisleGeometry ?? [
    [0, -30],
    [0, 120],
  ];
  const edge = (id: string, cls: string, from: string, to: string, geometry: P2[]) => ({
    id,
    from,
    to,
    class: cls,
    name: null,
    oneway: false,
    roundabout: false,
    lanes: 2,
    lanesSource: "tag" as const,
    maxspeed: 30,
    maxspeedSource: "default" as const,
    length: geometry
      .slice(1)
      .reduce(
        (sum, p, i) => sum + Math.hypot(p[0] - geometry[i]![0], p[1] - geometry[i]![1]),
        0,
      ),
    geometry,
  });
  const bay = opts.bay ?? { x: 8, y: 0, headingDeg: 0, widthM: 2.5, lengthM: 5 };
  return {
    format: "district-v1",
    meta: {
      district: "enclosure-test",
      label: "Enclosure test",
      mapKind: opts.mapKind,
      boundsLocalMeters: { minX: -300, minY: -300, maxX: 300, maxY: 300 },
      attribution: {
        text: "Map data © OpenStreetMap contributors",
        license: "ODbL 1.0",
        licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
        copyrightUrl: "https://www.openstreetmap.org/copyright",
      },
      scenario: opts.noBays ? {} : { bays: [{ id: "b-1", occupied: false, ...bay }] },
    },
    roads: {
      // ONE shared node at the aisle mouth, so the aisle has exactly one dead
      // end — the shape a lot map authors.
      nodes: [
        { id: "n-s", x: 0, y: -250 },
        { id: "n-mouth", x: aisleGeometry[0]![0], y: aisleGeometry[0]![1] },
        { id: "n-end", x: aisleGeometry.at(-1)![0], y: aisleGeometry.at(-1)![1] },
        ...(opts.orphanMouth
          ? [{ id: "n-mouth2", x: aisleGeometry[0]![0], y: aisleGeometry[0]![1] }]
          : []),
        ...(opts.throughAisle ? [{ id: "n-n", x: aisleGeometry.at(-1)![0], y: 300 }] : []),
      ],
      edges: [
        edge("appr", "residential", "n-s", opts.orphanMouth ? "n-mouth2" : "n-mouth", [
          [0, -250],
          aisleGeometry[0]!,
        ]),
        edge("aisle", opts.aisleClass ?? "service", "n-mouth", "n-end", aisleGeometry),
        ...(opts.throughAisle
          ? [
              edge("cont", "residential", "n-end", "n-n", [
                aisleGeometry.at(-1)!,
                [aisleGeometry.at(-1)![0], 300],
              ]),
            ]
          : []),
      ],
    },
    intersections: [],
    crossings: [],
    roundabouts: [],
    buildings: [],
    spawnPoints: [],
  } as unknown as District;
}

const wallCount = (d: District) =>
  buildWorldGeometry(d).buildingWalls.reduce((n, m) => n + m.positions.length, 0);

describe("the enclosure's four gates, and the branch the catalogue never binds", () => {
  it("needs the map to author bays — an empty aisle is not a car park", () => {
    expect(wallCount(synthetic({ mapKind: "scenario-lot", noBays: true }))).toBe(0);
  });

  it("builds on a scenario-lot and on nothing else", () => {
    // Same document twice; `mapKind` is the only difference. These synthetics
    // author no buildings at all, so any facade vertex here is the enclosure.
    expect(wallCount(synthetic({ mapKind: "scenario-lot" }))).toBeGreaterThan(0);
    expect(wallCount(synthetic({ mapKind: "scenario-street" }))).toBe(0);
    expect(wallCount(synthetic({ mapKind: "training-ground" }))).toBe(0);
  });

  it("needs a service aisle — a lot's roadway, not just any road", () => {
    expect(wallCount(synthetic({ mapKind: "scenario-lot", aisleClass: "residential" }))).toBe(0);
  });

  it("declines a bent aisle rather than laying a wall across it", () => {
    // The frame is the chord, so a curved aisle would put its flanks over its
    // own carriageway. Nothing is safer than something wrong here.
    expect(
      wallCount(
        synthetic({
          mapKind: "scenario-lot",
          aisleGeometry: [
            [0, -30],
            [40, 45],
            [0, 120],
          ],
        }),
      ),
    ).toBe(0);
  });

  it("needs exactly one dead end, so the frontage never lands on a live road", () => {
    // The end frontage is built where the aisle RUNS OUT. If the aisle runs on
    // instead, „where it runs out" is 18 m up somebody else's carriageway; if
    // both ends are loose, the axis can be read backwards and the frontage
    // goes across the approach. Both shapes get nothing rather than a guess.
    //
    // Measured against the SAME shape as a street rather than against zero:
    // a through aisle gives its continuation a boundary dead end of its own,
    // and terminus.ts closes that on any `scenario*` map. The difference
    // between the two builds is this pass and nothing else.
    for (const shape of [{ throughAisle: true }, { orphanMouth: true }] as const) {
      expect(wallCount(synthetic({ mapKind: "scenario-lot", ...shape }))).toBe(
        wallCount(synthetic({ mapKind: "scenario-street", ...shape })),
      );
    }
    // …and the guard would be vacuous if the well-formed shape did not differ.
    expect(wallCount(synthetic({ mapKind: "scenario-lot" }))).toBeGreaterThan(
      wallCount(synthetic({ mapKind: "scenario-street" })),
    );
  });

  it("moves the flank out when the BAYS are the outermost thing, not the road", () => {
    // The committed catalogue never binds this branch (its bays reach 7.53 m
    // against a 8.125 m half-width), so it is bound here on purpose: a 20 m
    // bay centred at x = 12 reaches x = 22, and the flank must clear the BAY.
    const deep = synthetic({
      mapKind: "scenario-lot",
      bay: { x: 12, y: 0, headingDeg: 90, widthM: 2.5, lengthM: 20 },
    });
    const segs = wallSegments(buildWorldGeometry(deep).buildingWalls);
    expect(clearAheadM(segs, [0, 0], 90)).toBeCloseTo(25, 2); // 22 + 3
    // …and the side with no bays still measures from the carriageway.
    expect(clearAheadM(segs, [0, 0], 270)).toBeCloseTo(11.125, 2);
  });
});
