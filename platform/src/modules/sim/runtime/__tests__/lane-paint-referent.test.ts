/**
 * DOC 86 T1 / T16 REGRESSION NET — a lane code may only convict against paint
 * the world actually draws.
 *
 * The defect this file locks out (doc 86 §2 T1, the widest in the ledger):
 * `CROSSED_SOLID_LINE` has always been gated on an authored М1 span and
 * `WRONG_LANE_FOR_DIRECTION` on `meta.scenario.laneArrows`, but the three codes
 * that grade the SAME piece of road — CENTER_LINE_TOUCHED, POOR_LANE_KEEPING,
 * NOT_KEEPING_RIGHT — asked nothing at all. On a two-way `lanes: 2` edge
 * `laneId 0 === laneCount - 1` is ALWAYS true, so the reducer's "leftmost lane"
 * guard is vacuous and a 3.3 m drift billed «Настъпване на осевата линия» after
 * 3.5 s — on 90 of 155 scenarios whose district drew no lane line whatsoever.
 * The founder hit it on his first lesson: «it say we step on some line that
 * doesnt exist at all», and later «there are no lanes on the roads I only know
 * them in my head» while the HUD congratulated him on keeping one.
 *
 * Three invariants, each provable rather than asserted:
 *
 *  1. THE PAINTER AND THE GRADER NAME THE SAME LINES. Over all 90 shipped
 *     districts, the set of edges the runtime reports an осева on equals the set
 *     the BUILT marking mesh actually carries one on. Ground truth is the mesh,
 *     not a second copy of the predicate — and T16 makes it decidable, because
 *     the осева is now the only stroke of CENTER_LINE_WIDTH_M in the buffer.
 *  2. THE JUNCTION INTERIOR IS PAINT-FREE, AND THE RUNTIME SAYS SO. Ribbons are
 *     trimmed at every mouth, so a student swinging wide through a junction is
 *     off every painted line; the referent is derived from the same trim the
 *     builder uses, never from a dialled-in radius.
 *  3. NO PAINT, NO CONVICTION. The reducer refuses all three codes on an
 *     explicit `false`, and is byte-identical when the field is absent (a
 *     hand-built tick, a recorded trace) or true.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createWorldRuntime } from "..";
import { DistrictIndex } from "../spatial";
import { Locator } from "../locator";
import {
  CENTER_LINE_WIDTH_M,
  DASH_LENGTH_M,
  LANE_WIDTH_M,
  MARKED_CLASSES,
} from "../../world/builders/constants";
import { analyzeNetwork } from "../../world/builders/network";
import { buildMarkings } from "../../world/builders/markings";
import { assertDistrict, type District } from "../../world/types";
import { createRuleEngine, reduceTick } from "../../rules/engine";
import type { RuleEvent, SimTick } from "../../rules/types";

const WORLD_DIR = ((): string => {
  const candidates = [
    path.join(process.cwd(), "content", "world"),
    path.resolve(process.cwd(), "..", "content", "world"),
  ];
  for (const dir of candidates) if (fs.existsSync(dir)) return dir;
  throw new Error(`content/world not found in: ${candidates.join(", ")}`);
})();

const DISTRICT_IDS: readonly string[] = fs
  .readdirSync(WORLD_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -".json".length))
  .sort();

const cache = new Map<string, District>();
function loadDistrict(id: string): District {
  const hit = cache.get(id);
  if (hit) return hit;
  const d = assertDistrict(JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf8")));
  cache.set(id, d);
  return d;
}

const EMPTY: ReadonlySet<string> = new Set();

// ---------------------------------------------------------------------------
// 1 · the painter and the grader name the same lines (all 90 districts)
// ---------------------------------------------------------------------------

interface PaintQuad {
  /** Centre in district space. */
  x: number;
  y: number;
  /** The rectangle's two side lengths; the smaller one is the stroke. */
  stroke: number;
  along: number;
}

/**
 * Every marking rectangle in the built mesh, in district coordinates. Each
 * marking is emitted through MeshAccumulator.quad → indices [a,b,c,a,c,d], so
 * one 6-index group is one rectangle with corners idx[0,1,2,5]. Side lengths
 * come from the CORNERS, not an axis-aligned bounding box, so a diagonal or
 * curved-road quad reports its true stroke.
 */
function paintQuads(district: District): PaintQuad[] {
  const mesh = buildMarkings(district, analyzeNetwork(district), EMPTY, EMPTY).markings.toMeshData();
  const p = mesh.positions;
  const idx = mesh.indices;
  const out: PaintQuad[] = [];
  for (let i = 0; i + 6 <= idx.length; i += 6) {
    const c = [idx[i], idx[i + 1], idx[i + 2], idx[i + 5]].map((vi) => ({
      x: p[3 * vi],
      y: -p[3 * vi + 2], // world (x, h, -y) → district (x, y)
    }));
    const s01 = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y);
    const s12 = Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y);
    out.push({
      x: (c[0].x + c[2].x) / 2,
      y: (c[0].y + c[2].y) / 2,
      stroke: Math.min(s01, s12),
      along: Math.max(s01, s12),
    });
  }
  return out;
}

/** Perpendicular distance from a point to an edge polyline (segment-clamped). */
function distToPolyline(geometry: readonly [number, number][], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < geometry.length - 1; i++) {
    const [ax, ay] = geometry[i];
    const [bx, by] = geometry[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

describe("the painter and the grader name the same осева (all shipped districts)", () => {
  for (const id of DISTRICT_IDS) {
    it(`${id}: every edge the runtime says carries an осева is one the mesh paints`, () => {
      const district = loadDistrict(id);
      const index = new DistrictIndex(district as never);

      // What the MESH says. The осева is the only CENTER_LINE_WIDTH_M stroke in
      // the buffer (T16) — zebra bars are 0.8 across, stop lines 0.8, lane
      // dividers 0.25, bus/emergency seams 0.3/0.5 — so a quad of that stroke
      // IS a centre line, and it belongs to whichever edge axis it lies on.
      const fromMesh = new Set<string>();
      for (const q of paintQuads(district)) {
        if (Math.abs(q.stroke - CENTER_LINE_WIDTH_M) > 1e-3) continue;
        let bestId: string | null = null;
        let bestD = 0.6; // a centre line sits ON the axis
        for (const rt of index.edges) {
          const d = distToPolyline(rt.edge.geometry, q.x, q.y);
          if (d < bestD) {
            bestD = d;
            bestId = rt.edge.id;
          }
        }
        if (bestId) fromMesh.add(bestId);
      }

      // What the RUNTIME says, sampled the way the locator resolves a fix.
      const fromRuntime = new Set<string>();
      for (const rt of index.edges) {
        if (rt.paintToM <= rt.paintFromM) continue;
        const step = Math.max(1, (rt.paintToM - rt.paintFromM) / 40);
        for (let s = rt.paintFromM; s <= rt.paintToM; s += step) {
          if (index.laneMarkingAt(rt.idx, s).centreLine) {
            fromRuntime.add(rt.edge.id);
            break;
          }
        }
      }

      expect([...fromRuntime].sort()).toEqual([...fromMesh].sort());
    });
  }

  it("no quad in any district carries the centre stroke on an edge with no осева", () => {
    // The mirror of the sweep above, stated as the property that matters: the
    // wide stroke is RESERVED for the line separating opposing streams.
    for (const id of DISTRICT_IDS) {
      const district = loadDistrict(id);
      const index = new DistrictIndex(district as never);
      for (const q of paintQuads(district)) {
        if (Math.abs(q.stroke - CENTER_LINE_WIDTH_M) > 1e-3) continue;
        const host = index.edges.find((rt) => distToPolyline(rt.edge.geometry, q.x, q.y) < 0.6);
        expect(host, `${id}: orphan centre-stroke quad at (${q.x}, ${q.y})`).toBeDefined();
        expect(host!.edge.oneway, `${id}/${host!.edge.id}: осева on a one-way edge`).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2 · what changed, in numbers (the T1 census, pinned)
// ---------------------------------------------------------------------------

describe("T1 census — every district now runs the lane-line pass it grades against", () => {
  it("no shipped district is entirely unmarked (doc 86 T1: was 90 of them)", () => {
    const bare: string[] = [];
    for (const id of DISTRICT_IDS) {
      const d = loadDistrict(id);
      if (!d.roads.edges.some((e) => MARKED_CLASSES.has(e.class))) bare.push(id);
    }
    expect(bare).toEqual([]);
  });

  it("`service` stays unmarked on purpose — a car-park aisle carries no lane line", () => {
    // The other half of the same discipline: painting an осева down a parking
    // aisle would be T1 pointed the other way. lot-perp-v1's approach IS marked
    // (residential) and its aisle is not.
    const index = new DistrictIndex(loadDistrict("lot-perp-v1") as never);
    const approach = index.edgeRtById("lot-e-approach")!;
    const aisle = index.edgeRtById("lot-e-aisle")!;
    expect(approach.edge.class).toBe("residential");
    expect(aisle.edge.class).toBe("service");
    expect(index.laneMarkingAt(approach.idx, approach.totalLen / 2).centreLine).toBe(true);
    expect(index.laneMarkingAt(aisle.idx, aisle.totalLen / 2).centreLine).toBe(false);
    expect(index.laneMarkingAt(aisle.idx, aisle.totalLen / 2).laneLines).toBe(false);
  });

  it("a one-lane carriageway has no internal boundary to grade against", () => {
    // `lanes: 1` means the lane-line loop never runs, whatever the class — the
    // d2/mw slip roads and the ov-oneway dead-end arm. (Roundabout RING edges
    // are the one reviewed exemption; see DistrictIndex.laneMarkingAt.)
    let checked = 0;
    for (const id of ["d2-v1", "mw-entry-v1", "ov-oneway-v1"]) {
      const index = new DistrictIndex(loadDistrict(id) as never);
      for (const rt of index.edges) {
        if (rt.edge.lanes !== 1 || rt.edge.roundabout) continue;
        expect(index.laneMarkingAt(rt.idx, rt.totalLen / 2).laneLines).toBe(false);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("a roundabout ring is the one reviewed exemption, and it is narrow", () => {
    // The ring's lane is delimited by the central island and the outer kerb —
    // objects the world builds — so the referent is geometric, not painted.
    // Locked to `roundabout` edges only: 6 rings in 90 districts.
    let ringEdges = 0;
    for (const id of DISTRICT_IDS) {
      const index = new DistrictIndex(loadDistrict(id) as never);
      for (const rt of index.edges) {
        if (!rt.edge.roundabout) continue;
        ringEdges += 1;
        const at = index.laneMarkingAt(rt.idx, rt.totalLen / 2);
        expect(at.laneLines).toBe(true);
        expect(at.centreLine).toBe(false); // one-way: no opposing stream to divide
      }
    }
    expect(ringEdges).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3 · the junction interior is paint-free, and the runtime says so
// ---------------------------------------------------------------------------

describe("junction-interior stand-down (doc 86 T1(d)) — derived from the builder's own trim", () => {
  it("sx-v1: the осева exists mid-arm and stops at the junction mouth", () => {
    const index = new DistrictIndex(loadDistrict("sx-v1") as never);
    const arm = index.edgeRtById("sx-e-s")!; // 120 m south arm into the crossroads
    // The ribbon is trimmed at the mouth; the mouth cut is 27.125 m out on this
    // map (half-width 12.125 + arterial corner 15), so the last painted metre is
    // comfortably short of it and the interior carries nothing.
    expect(index.laneMarkingAt(arm.idx, arm.totalLen / 2).centreLine).toBe(true);
    expect(arm.paintToM).toBeLessThan(arm.totalLen - 25);
    expect(index.laneMarkingAt(arm.idx, arm.totalLen - 5).centreLine).toBe(false);
    expect(index.laneMarkingAt(arm.idx, arm.totalLen - 5).laneLines).toBe(false);
  });

  it("the drawn extent equals the painted extent on every district", () => {
    // Nothing may be painted outside [paintFromM, paintToM] — that window IS the
    // stand-down, so if paint escaped it the stand-down would be a lie.
    for (const id of DISTRICT_IDS) {
      const district = loadDistrict(id);
      const index = new DistrictIndex(district as never);
      for (const q of paintQuads(district)) {
        if (Math.abs(q.stroke - CENTER_LINE_WIDTH_M) > 1e-3) continue;
        const host = index.edges.find((rt) => distToPolyline(rt.edge.geometry, q.x, q.y) < 0.6);
        if (!host) continue;
        const hit = { edgeIdx: -1, distM: 0, sM: 0, latSignedM: 0, tanX: 0, tanY: 0, outsideM: 0 };
        index.projectOnEdge(host.idx, q.x, q.y, hit);
        // Half a dash of slack: paintFromM is the START of the drawn line and
        // the first dash's CENTRE sits gap/2 + dash/2 past it.
        expect(
          hit.sM,
          `${id}/${host.edge.id}: centre paint at s=${hit.sM.toFixed(1)} outside [${host.paintFromM.toFixed(1)}, ${host.paintToM.toFixed(1)}]`,
        ).toBeGreaterThanOrEqual(host.paintFromM - DASH_LENGTH_M);
        expect(hit.sM).toBeLessThanOrEqual(host.paintToM + DASH_LENGTH_M);
      }
    }
  });

  it("the live runtime publishes the stand-down on the tick", () => {
    // The end-to-end wire: locator fix → SimTick. Driving the south arm of the
    // crossroads, the approach ticks say nothing (painted road = byte-identical
    // tick) and the ticks inside the junction carry the explicit false.
    const district = loadDistrict("sx-v1");
    const rt = createWorldRuntime(district);
    const armEnd = 120; // sx-e-s runs from (0, -120) to the node at (0, 0)
    const onApproach: SimTick[] = [];
    const inJunction: SimTick[] = [];
    let t = 0;
    for (let s = 40; s <= armEnd - 1; s += 2) {
      t += 0.1;
      rt.update(0.1);
      const tick = rt.sample(
        {
          position: { x: 4.0625, y: -armEnd + s },
          headingDeg: 0,
          speedKmh: 30,
          indicator: "off",
          headlights: "off",
          seatbeltOn: true,
          handbrakeOn: false,
          gear: 1,
          mirrorGlance: null,
        },
        t,
        false,
      );
      (s < armEnd - 40 ? onApproach : inJunction).push(tick);
    }
    expect(onApproach.length).toBeGreaterThan(5);
    expect(inJunction.length).toBeGreaterThan(5);
    for (const k of onApproach) expect(k.centreLinePainted).toBeUndefined();
    expect(inJunction.at(-1)!.centreLinePainted).toBe(false);
    expect(inJunction.at(-1)!.laneLinesPainted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4 · no paint, no conviction (the reducer half)
// ---------------------------------------------------------------------------

/**
 * 20 s of forward driving straddling the road axis on a two-way edge.
 *
 * `fromLane` (default true) opens with 1 s inside the driver's own lane — the
 * DEPARTURE these codes grade, and what every real drive does. Pass false to
 * reproduce doc 86 T2's compiled spawn pose verbatim: handed the car already
 * astride the осева, having done nothing (doc 87 B23/B26/B33).
 */
function straddleDrive(over: Partial<SimTick>, fromLane = true): RuleEvent[] {
  let state = createRuleEngine();
  const events: RuleEvent[] = [];
  for (let t = 0; t <= 20; t += 0.5) {
    const r = reduceTick(state, {
      t,
      speedKmh: 30,
      maxSpeedKmh: 50,
      position: { x: 0, y: t },
      headingDeg: 0,
      // 4.0625 = exactly on the осева (doc 86 T2's spawn pose); 0 = the lane.
      laneOffsetM: fromLane && t < 1 ? 0 : 4.0625,
      laneId: 0,
      laneCount: 1,
      oneway: false,
      indicator: "off",
      headlights: "low",
      seatbeltOn: true,
      handbrakeOn: false,
      gear: 1,
      isNight: false,
      events: [],
      ...over,
    });
    state = r.state;
    events.push(...r.events);
  }
  return events;
}

describe("no paint, no conviction", () => {
  const LANE_CODES = ["CENTER_LINE_TOUCHED", "POOR_LANE_KEEPING", "NOT_KEEPING_RIGHT"];

  it("an unpainted road grades none of the three lane codes", () => {
    const codes = straddleDrive({ centreLinePainted: false, laneLinesPainted: false })
      .filter((e) => e.kind === "violation")
      .map((e) => e.code);
    expect(codes.filter((c) => LANE_CODES.includes(c))).toEqual([]);
  });

  it("…and a PAINTED road still grades exactly as it shipped", () => {
    const painted = straddleDrive({ centreLinePainted: true, laneLinesPainted: true })
      .filter((e) => e.kind === "violation")
      .map((e) => e.code);
    expect(painted).toContain("CENTER_LINE_TOUCHED");
  });

  // -- doc 87 B23/B26/B33: paint is necessary, not sufficient ----------------
  it("…but PAINT ALONE never convicts a car that was SPAWNED on the line", () => {
    // The four-of-four founder case, at the reducer. tj-rhr-v1 / tj-stop-v1 /
    // tj-occluded-v1 / sx-v1 all compile a spawn at x = 0 — the centreline —
    // and these maps ARE painted, so the T1 paint referent does not save them.
    // What is missing is not the line: it is the act. He drove dead straight at
    // the speed the objective taught, for 32 s, and DEFAULT_LEVEL_AIDS[1]
    // .pauseOnError froze the lesson on a второстепенна he could not have
    // avoided without disobeying the instruction.
    const codes = straddleDrive({ centreLinePainted: true, laneLinesPainted: true }, false)
      .filter((e) => e.kind === "violation")
      .map((e) => e.code);
    expect(codes.filter((c) => LANE_CODES.includes(c))).toEqual([]);
  });

  it("…and an ABSENT field is byte-identical to the pre-slice behaviour", () => {
    // Every hand-built tick, recorded trace and clip plan in the tree omits the
    // field. Absent must mean "the caller cannot answer", never "stand down" —
    // otherwise a wiring slip would silently disable the detector everywhere.
    const legacy = straddleDrive({}).filter((e) => e.kind === "violation").map((e) => e.code);
    const painted = straddleDrive({ centreLinePainted: true, laneLinesPainted: true })
      .filter((e) => e.kind === "violation")
      .map((e) => e.code);
    expect(legacy).toEqual(painted);
  });

  it("NOT_KEEPING_RIGHT stands down without a divider to be right of", () => {
    const hogging = (over: Partial<SimTick>): string[] => {
      let state = createRuleEngine();
      const out: string[] = [];
      for (let t = 0; t <= 30; t += 0.5) {
        const r = reduceTick(state, {
          t,
          speedKmh: 50,
          maxSpeedKmh: 50,
          position: { x: 0, y: t },
          headingDeg: 0,
          laneOffsetM: 0,
          laneId: 1,
          laneCount: 2,
          oneway: false,
          indicator: "off",
          headlights: "low",
          seatbeltOn: true,
          handbrakeOn: false,
          gear: 1,
          isNight: false,
          events: [],
          ...over,
        });
        state = r.state;
        for (const e of r.events) if (e.kind === "violation") out.push(e.code);
      }
      return out;
    };
    expect(hogging({ laneLinesPainted: false })).not.toContain("NOT_KEEPING_RIGHT");
    expect(hogging({})).toContain("NOT_KEEPING_RIGHT");
  });
});

// ---------------------------------------------------------------------------
// 5 · doc 86 T2 — what the spawn poses look like through the locator
// ---------------------------------------------------------------------------

describe("T2 spawn legality — measured, not assumed", () => {
  /**
   * THE DAY LANDED. This block used to read „41 spawns still straddle a PAINTED
   * осева — the half of T2 Lane 1 cannot reach", and it named its own successor:
   * „the remaining fix is to place the car in its lane, and it is not in this
   * lane's files: `content/world/*.json` spawnPoints … the ratchet below fails
   * the day that lands, which is the point — it must be lowered deliberately,
   * never drift." Doc 87's founder wave landed it: 42 poses across 18 districts
   * moved from the road axis to the curb lane, and every generator in
   * tools/maps now ends its spawn list with `lib/lane.mjs toCurbLane()`, so the
   * convention cannot come back by regeneration.
   *
   * ON PAINT IS NOW ZERO — not "convicts truthfully", but "there is nothing to
   * convict": no student is handed a car straddling an осева he never steered
   * onto. Six poses remain more than `laneKeepMaxOffsetM` off a two-way lane
   * centre, and all six are on BARE ASPHALT by construction: the four lot
   * FINISH aisles and the two полигон aprons are `service` class, where the
   * world draws no line, there is no lane to be in, and the pose is the lot's
   * own geometry rather than a street convention. `poligon-v1/pg-spawn-1` left
   * that list too — its host `pg-e-s3` is `unclassified`, a MARKED class, so it
   * was moved with the streets.
   *
   * Keep the ratchet: it must only ever fall, and only deliberately.
   */
  const LANE_KEEP_MAX_OFFSET_M = 3.25; // RuleEngineConfig default

  it("ZERO spawns straddle a PAINTED осева — the data half of T2 is closed (doc 87)", () => {
    const onPaint: string[] = [];
    const onBareAsphalt: string[] = [];
    for (const id of DISTRICT_IDS) {
      const district = loadDistrict(id);
      const index = new DistrictIndex(district as never);
      for (const sp of district.spawnPoints) {
        const locator = new Locator(index);
        const fix = locator.track(sp.x, sp.y, sp.heading);
        if (fix.edgeIdx < 0) continue;
        const straddling =
          fix.laneOffsetM > LANE_KEEP_MAX_OFFSET_M &&
          index.edgeRt(fix.edgeIdx).edge.oneway === false;
        if (!straddling) continue;
        (fix.centreLinePainted ? onPaint : onBareAsphalt).push(`${id}/${sp.id}`);
      }
    }
    expect(onPaint.length, onPaint.join(", ")).toBe(0);
    // The assertion that matters is the one above: ZERO spawns straddle a
    // PAINTED осева, which is the data half of T2 (31 scenarios spawned the car
    // already in violation and the fault fired 3.5 s in). This second list is
    // the inventory of spawns that straddle BARE asphalt, which is legal and
    // harmless — a parking aisle has no centre line to cross. It is spelled out
    // rather than counted so a new map cannot quietly join it while actually
    // sitting on paint.
    expect(onBareAsphalt.sort()).toEqual([
      "lot-45-v1/lot-spawn-finish",
      // The ten parking situations built for the founder's „10 at least".
      "lot-45rev-v1/lot45r-spawn-finish",
      "lot-double-v1/lotdb-spawn-finish",
      "lot-gap-judge-v1/lotgj-spawn-finish",
      "lot-gap-long-v1/lotgl-spawn-finish",
      "lot-gap-short-v1/lotgs-spawn-finish",
      "lot-left-v1/lotlf-spawn-finish",
      "lot-narrow-v1/lot-spawn-finish",
      "lot-night-v1/lotnt-spawn-finish",
      "lot-par-v1/lot-spawn-finish",
      "lot-perp-v1/lot-spawn-finish",
      "lot-van-v1/lotvn-spawn-finish",
      "lot-wall-v1/lotwl-spawn-finish",
      "lot-zebra-v1/lotzb-spawn-finish",
      "poligon-v1/pg-spawn-2",
      "poligon-v1/pg-spawn-3",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 6 · T16 — the осева is legible against the dividers it is not
// ---------------------------------------------------------------------------

describe("T16 — the осева is distinguishable from a same-direction divider", () => {
  // The five districts behind doc 86 T16's five lane-discipline drills — every
  // one a `tertiary`, 4-lane two-way carriageway that used to paint three
  // visually identical dashed lines at −8.13 / 0.00 / +8.13.
  const T16_DISTRICTS: ReadonlyArray<[string, string]> = [
    ["ov-keepright-v1", "sc-ov-keep-right"],
    ["ov-crossing-v1", "sc-ov-crossing-overtake"],
    ["ov-ban-v1", "sc-ov-ban-overtake"],
    ["ov-bus-v1", "sc-ov-bus-lane"],
    ["ln-v1", "sc-ln-decisive-change"],
  ];

  for (const [id, scenario] of T16_DISTRICTS) {
    it(`${id} (${scenario}): the middle line is wider than the two it sits between`, () => {
      const axis: number[] = [];
      const divider: number[] = [];
      for (const q of paintQuads(loadDistrict(id))) {
        if (q.along < DASH_LENGTH_M - 0.1 || q.along > DASH_LENGTH_M + 0.1) continue; // dashes only
        if (Math.abs(q.x) < 0.5) axis.push(q.stroke);
        else if (Math.abs(Math.abs(q.x) - LANE_WIDTH_M) < 0.5) divider.push(q.stroke);
      }
      expect(axis.length, "no dashed осева on the road axis").toBeGreaterThan(0);
      expect(divider.length, "no same-direction divider to contrast with").toBeGreaterThan(0);
      for (const s of axis) expect(s).toBeCloseTo(CENTER_LINE_WIDTH_M, 3);
      for (const s of divider) expect(s).toBeLessThan(CENTER_LINE_WIDTH_M);
    });
  }

  it("the wide stroke never asserts a ban the data does not carry", () => {
    // Deliberately NOT the ledger's "paint the centre as solid/double М1":
    // «непрекъсната» means пресичането и застъпването са забранени, and
    // mv-uturn-v1's `mvu-e-beyond` is exactly where sc-mv-uturn-ban sends the
    // student to make a LEGAL U-turn. It carries no zone, so it must stay
    // BROKEN — only the authored `mvu-e-ban` span turns solid.
    const solidsByEdge = new Map<string, number>();
    const dashesByEdge = new Map<string, number>();
    const index = new DistrictIndex(loadDistrict("mv-uturn-v1") as never);
    for (const q of paintQuads(loadDistrict("mv-uturn-v1"))) {
      if (Math.abs(q.stroke - CENTER_LINE_WIDTH_M) > 1e-3) continue;
      const host = index.edges.find((rt) => distToPolyline(rt.edge.geometry, q.x, q.y) < 0.6);
      if (!host) continue;
      const bucket = q.along > DASH_LENGTH_M + 1 ? solidsByEdge : dashesByEdge;
      bucket.set(host.edge.id, (bucket.get(host.edge.id) ?? 0) + 1);
    }
    expect(solidsByEdge.get("mvu-e-ban") ?? 0).toBeGreaterThan(0);
    expect(solidsByEdge.get("mvu-e-beyond") ?? 0).toBe(0);
    expect(dashesByEdge.get("mvu-e-beyond") ?? 0).toBeGreaterThan(0);
  });
});
