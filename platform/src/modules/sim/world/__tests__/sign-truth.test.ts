/**
 * SIGN TRUTH — the lane-3 gate for doc 86 T4 / T5 / T14 / L2 / D5 / D6.
 *
 * One sentence, over all 90 districts:
 *
 *   **No sign placement may state a limit different from the `maxSpeedKmh`
 *   the reducer grades on the road that sign governs.**
 *
 * That is the whole point of the lane. Before this wave the 3D kit shipped a
 * single speed face (В26-50) and `props.ts` hard-coded `kind: "limit50"`, so 83
 * of 154 scenarios sat on a 30 / 40 / 90 / 140 km/h street wearing a „50" plate
 * — at SCENARIO_SIGN_SCALE, i.e. the most legible object on the map, stating the
 * opposite of the number `SPEEDING_OVER_LIMIT` fires on. A 17-year-old cannot
 * tell the simulator is wrong: he reads the plate, holds 50, and is convicted at
 * 44 on a 40 street. **A sign that lies is worse than no sign**, so the second
 * half of the rule matters as much as the first: a limit the face set cannot
 * state truthfully places NOTHING.
 *
 * The check is deliberately INDEPENDENT of the builder. It does not read
 * `SignPlacement.speedKmh` back and compare it to itself; it re-derives, from
 * the plate's own world pose, which edge it stands on and which way it faces,
 * and then asks the district data what that road's limit is.
 *
 * The one documented carve-out is the curve station: `rules/engine.ts:997`
 * grades `SPEED_TOO_FAST_FOR_CURVE` against `tick.curveAdvisoryKmh`, which is
 * the zone's own `advisoryKmh` — so the В26 under an А1 states the number the
 * reducer really grades inside that span, and is a referent rather than a
 * second limit.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { SCENARIO_SIGN_SCALE } from "../builders/constants";
import {
  assertDistrict,
  signKindSpeedKmh,
  SIGN_KINDS,
  type District,
  type DistrictEdge,
  type SignPlacement,
  type WorldGeometry,
} from "../types";

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

const WORLD_DIR = (() => {
  for (const dir of [
    path.join(process.cwd(), "content", "world"),
    path.resolve(process.cwd(), "..", "content", "world"),
  ]) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error("content/world not found");
})();

const DISTRICT_IDS = fs
  .readdirSync(WORLD_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

interface Built {
  id: string;
  district: District;
  world: WorldGeometry;
  scenario: boolean;
}

const BUILT: Built[] = DISTRICT_IDS.map((id) => {
  const district = assertDistrict(
    JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf8")),
  );
  return {
    id,
    district,
    world: buildWorldGeometry(district, { seed: 7 }),
    scenario: typeof district.meta.mapKind === "string" && district.meta.mapKind.startsWith("scenario"),
  };
});

// ---------------------------------------------------------------------------
// Geometry helpers — deliberately re-implemented here, not imported from the
// builder, so the gate cannot agree with a bug by sharing its code.
// ---------------------------------------------------------------------------

type P = [number, number];

/** Sign world space is [x, h, -y]; district space is (x, y). */
function districtPos(s: SignPlacement): P {
  return [s.position[0], -s.position[2]];
}

/**
 * The direction the driver this sign addresses is TRAVELLING.
 * `yawFromFacing(f) = atan2(f.x, -f.y)` (builders/mesh.ts:23), so the facing
 * vector is `[sin yaw, -cos yaw]` and the driver comes the other way.
 */
function addressedTravel(s: SignPlacement): P {
  return [-Math.sin(s.yaw), Math.cos(s.yaw)];
}

interface Projection {
  edge: DistrictEdge;
  s: number;
  total: number;
  tangent: P;
  distance: number;
}

function projectOnEdge(edge: DistrictEdge, p: P): Projection | null {
  const g = edge.geometry as readonly P[];
  let best: Projection | null = null;
  let acc = 0;
  for (let i = 1; i < g.length; i++) {
    const a = g[i - 1]!;
    const b = g[i]!;
    const ax = b[0] - a[0];
    const ay = b[1] - a[1];
    const segLen = Math.hypot(ax, ay);
    if (segLen <= 1e-9) continue;
    const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / (segLen * segLen)));
    const qx = a[0] + ax * t;
    const qy = a[1] + ay * t;
    const d = Math.hypot(p[0] - qx, p[1] - qy);
    if (!best || d < best.distance) {
      best = {
        edge,
        s: acc + t * segLen,
        total: 0,
        tangent: [ax / segLen, ay / segLen],
        distance: d,
      };
    }
    acc += segLen;
  }
  if (best) best.total = acc;
  return best;
}

/**
 * The edge a post stands beside. Endpoint projections are rejected: a plate
 * 6 m past a transition node projects onto the edge BEHIND it at exactly its
 * far end, and that edge is not the one the plate governs.
 */
function edgeUnder(district: District, p: P): Projection | null {
  let best: Projection | null = null;
  for (const edge of district.roads.edges) {
    const proj = projectOnEdge(edge, p);
    if (!proj) continue;
    if (proj.s < 0.5 || proj.s > proj.total - 0.5) continue; // clamped = endpoint
    if (!best || proj.distance < best.distance) best = proj;
  }
  return best;
}

/** Which way the addressed driver runs relative to the edge geometry. */
function travelSign(proj: Projection, travel: P): 1 | -1 {
  return travel[0] * proj.tangent[0] + travel[1] * proj.tangent[1] >= 0 ? 1 : -1;
}

/** How far ahead of `proj.s`, along the addressed travel, a curve advisory
 *  may start and still be the thing the plate under an А1 is stating. */
const CURVE_STATION_LOOKAHEAD_M = 140;

function advisoriesAhead(district: District, proj: Projection, dir: 1 | -1): number[] {
  const out: number[] = [];
  for (const zone of district.zones ?? []) {
    if (zone.kind !== "curveAdvisory" || zone.edgeId !== proj.edge.id) continue;
    if (typeof zone.advisoryKmh !== "number") continue;
    const ahead = dir === 1 ? zone.fromM - proj.s : proj.s - zone.toM;
    if (ahead >= -5 && ahead <= CURVE_STATION_LOOKAHEAD_M) out.push(zone.advisoryKmh);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. THE GATE — every speed plate states the limit its road is graded on
// ---------------------------------------------------------------------------

describe("sign truth: no plate states a limit the reducer does not grade", () => {
  it("all 90 districts: every В26 numeral equals the maxspeed of the road it governs", () => {
    const lies: string[] = [];
    let plates = 0;
    for (const { id, district, world } of BUILT) {
      for (const sign of world.signs) {
        const numeral = signKindSpeedKmh(sign.kind);
        if (numeral === null) continue;
        plates++;
        const p = districtPos(sign);
        const proj = edgeUnder(district, p);
        if (!proj) {
          lies.push(`${id}: ${sign.kind} @ (${p[0].toFixed(1)}, ${p[1].toFixed(1)}) stands on no edge`);
          continue;
        }
        const dir = travelSign(proj, addressedTravel(sign));
        const graded = proj.edge.maxspeed;
        const truthful = new Set<number>();
        if (typeof graded === "number") truthful.add(graded);
        for (const a of advisoriesAhead(district, proj, dir)) truthful.add(a);
        if (truthful.has(numeral)) continue;
        lies.push(
          `${id}: ${sign.kind} states ${numeral} at (${p[0].toFixed(1)}, ${p[1].toFixed(1)}) ` +
            `while ${proj.edge.id} is graded ${String(graded)} km/h` +
            (truthful.size > 1 ? ` (advisories ahead: ${[...truthful].join("/")})` : ""),
        );
      }
    }
    expect(plates, "the corpus must actually carry speed plates").toBeGreaterThan(100);
    expect(lies, `${lies.length} lying plate(s):\n${lies.join("\n")}`).toEqual([]);
  });

  it("all 90 districts: every В33 states the limit that ENDS at it, and that limit really ends", () => {
    const wrong: string[] = [];
    for (const { id, district, world } of BUILT) {
      for (const sign of world.signs) {
        if (sign.kind !== "limitEnd") continue;
        const numeral = sign.speedKmh;
        const p = districtPos(sign);
        const travel = addressedTravel(sign);
        const ahead = edgeUnder(district, p);
        // The lifted restriction belongs to the road BEHIND the post.
        const behind = edgeUnder(district, [p[0] - travel[0] * 14, p[1] - travel[1] * 14]);
        if (typeof numeral !== "number" || !ahead || !behind) {
          wrong.push(`${id}: В33 @ (${p[0].toFixed(1)}, ${p[1].toFixed(1)}) has no numeral or no road`);
          continue;
        }
        if (behind.edge.maxspeed !== numeral) {
          wrong.push(
            `${id}: В33 states ${numeral} but the road it ends (${behind.edge.id}) is ` +
              `${String(behind.edge.maxspeed)} km/h`,
          );
        }
        if (ahead.edge.maxspeed === numeral) {
          wrong.push(`${id}: В33 states ${numeral} but the road ahead is still ${numeral} km/h`);
        }
      }
    }
    expect(wrong, wrong.join("\n")).toEqual([]);
  });

  it("no district posts a limit the В26 face set cannot state (the kit never rounds)", () => {
    // The other half of the rule: silence beats a wrong number. Every placed
    // kind must be a real SignKind the renderer can bucket.
    const unknown = new Set<string>();
    for (const { world } of BUILT) {
      for (const s of world.signs) if (!SIGN_KINDS.includes(s.kind)) unknown.add(s.kind);
    }
    expect([...unknown]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. T5 — a plate the driver starts level with or past is not a plate
// ---------------------------------------------------------------------------

/** A plate must be at least this far ahead of a spawn to count as readable. */
const PLATE_READABLE_AHEAD_M = 3;
/**
 * …and there must be road left to stand it on. Mirrors props.ts's own budget:
 * SPAWN_CONTEXT_AHEAD_M (30, far enough ahead to be read) +
 * ENTRY_POST_END_CLEAR_M (25, never inside the junction mouth). Below that the
 * only honest outcome is silence — which is why these two numbers are quoted
 * here rather than a looser round one: the exemption must be exactly as wide
 * as the builder's, or the gate stops meaning anything.
 */
const PLATE_ROOM_M = 30 + 25;

interface SpawnFacts {
  id: string;
  edgeId: string;
  sAlongTravel: number;
  dir: 1 | -1;
  total: number;
  limit: number | undefined;
}

function spawnFacts(district: District): SpawnFacts[] {
  const out: SpawnFacts[] = [];
  for (const spawn of district.spawnPoints) {
    const edge = district.roads.edges.find((e) => e.id === spawn.edgeId);
    if (!edge) continue;
    const proj = projectOnEdge(edge, [spawn.x, spawn.y]);
    if (!proj) continue;
    const rad = (spawn.heading * Math.PI) / 180;
    const dir = travelSign(proj, [Math.sin(rad), Math.cos(rad)]);
    out.push({
      id: spawn.id,
      edgeId: edge.id,
      sAlongTravel: dir === 1 ? proj.s : proj.total - proj.s,
      dir,
      total: proj.total,
      limit: edge.maxspeed,
    });
  }
  return out;
}

describe("sign truth: the driver can read the limit he is graded on", () => {
  it("every scenario spawn has its own limit posted AHEAD of it (or the road has no room)", () => {
    // Doc 86 T5 as a positive invariant. The shipped world put every junction
    // micro-map's only speed post 1 m BEHIND the spawn facing away, which is
    // why the founder reported „no speed sign anywhere" on items 31/33/34/36.
    // Stating it this way also covers the rungs that spawn INSIDE a reduced
    // zone, which the narrow „not 1 m behind" form would have missed.
    const blind: string[] = [];
    let covered = 0;
    let noRoom = 0;
    for (const { id, district, world, scenario } of BUILT) {
      if (!scenario) continue;
      for (const sp of spawnFacts(district)) {
        if (typeof sp.limit !== "number") continue;
        const ahead = world.signs.filter((s) => {
          if (signKindSpeedKmh(s.kind) !== sp.limit) return false;
          const proj = edgeUnder(district, districtPos(s));
          if (proj?.edge.id !== sp.edgeId) return false;
          if (travelSign(proj, addressedTravel(s)) !== sp.dir) return false;
          const sPlate = sp.dir === 1 ? proj.s : proj.total - proj.s;
          return sPlate > sp.sAlongTravel + PLATE_READABLE_AHEAD_M;
        });
        if (ahead.length > 0) {
          covered++;
          continue;
        }
        if (sp.sAlongTravel + PLATE_ROOM_M > sp.total) {
          noRoom++; // the spawn is already at the far mouth — honest silence
          continue;
        }
        blind.push(
          `${id}: spawn ${sp.id} drives a ${sp.limit} km/h road (${sp.edgeId}) with no В26-${sp.limit} ` +
            `ahead of it (arc ${sp.sAlongTravel.toFixed(1)} of ${sp.total.toFixed(1)} m)`,
        );
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `sign-truth: scenario spawns with their limit posted ahead = ${covered}; ` +
        `no road left to post on = ${noRoom}; blind = ${blind.length}`,
    );
    expect(blind, `${blind.length} blind spawn(s):\n${blind.join("\n")}`).toEqual([]);
  });

  it("T5 regression pins: the junction entry posts moved AHEAD of their spawns", () => {
    // The two doc 86 T5 measured verbatim. Before: tj-rhr sign (0,-106) /
    // spawn (0,-105); sx-v1 east sign (106,0) / spawn (105,0).
    const cases = [
      { id: "tj-rhr-v1", spawn: "tj-spawn-south", was: -106, minAhead: 20 },
      { id: "sx-v1", spawn: "sx-spawn-east", was: 106, minAhead: 20 },
    ];
    for (const c of cases) {
      const b = BUILT.find((x) => x.id === c.id)!;
      const spawn = b.district.spawnPoints.find((s) => s.id === c.spawn)!;
      const facts = spawnFacts(b.district).find((s) => s.id === c.spawn)!;
      const plates = b.world.signs
        .filter((s) => signKindSpeedKmh(s.kind) !== null)
        .map((s) => ({ s, proj: edgeUnder(b.district, districtPos(s)) }))
        .filter((x) => x.proj?.edge.id === facts.edgeId)
        .map((x) => (facts.dir === 1 ? x.proj!.s : x.proj!.total - x.proj!.s) - facts.sAlongTravel);
      expect(plates.length, `${c.id} must still post a speed plate on ${facts.edgeId}`).toBeGreaterThan(0);
      const nearest = Math.min(...plates.filter((d) => d > 0));
      expect(
        nearest,
        `${c.id}: the plate must be ahead of ${spawn.id} (was ${c.was} = 1 m behind)`,
      ).toBeGreaterThan(c.minAhead);
    }
  });

  it("every junction micro-map still has a speed plate its spawn can read", () => {
    // The fix must not have deleted the sign instead of moving it. These are
    // the seven junction districts doc 86 T5 names.
    const junctions = [
      "tj-rhr-v1",
      "tj-stop-v1",
      "tj-emerge-v1",
      "tj-occluded-v1",
      "jx-equal-v1",
      "jxg-giveway-v1",
      "sx-v1",
    ];
    for (const id of junctions) {
      const b = BUILT.find((x) => x.id === id);
      expect(b, `${id} must exist`).toBeDefined();
      const plates = b!.world.signs.filter((s) => signKindSpeedKmh(s.kind) !== null);
      expect(plates.length, `${id} must still post its speed context`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. T14 — a warning arrives BEFORE the hazard or it teaches nothing
// ---------------------------------------------------------------------------

/** The world-referent gate (doc 86 §10) asks for >= 40 m of advance on a curve
 *  warning; the same number is the floor for slippery. */
const WARNING_ADVANCE_MIN_M = 40;

describe("sign truth: hazard warnings stand in advance of the hazard", () => {
  it("every А1 / А15 post is at least 40 m before its zone (or at the edge head)", () => {
    const late: string[] = [];
    for (const { id, district, world } of BUILT) {
      for (const zone of district.zones ?? []) {
        const wanted =
          zone.kind === "curveAdvisory" ? "curve" : zone.kind === "waterPatch" || zone.kind === "icePatch" ? "slippery" : null;
        if (!wanted) continue;
        const edge = district.roads.edges.find((e) => e.id === zone.edgeId);
        if (!edge) continue;
        const posts = world.signs
          .filter((s) => s.kind === wanted)
          .map((s) => ({ s, proj: edgeUnder(district, districtPos(s)) }))
          .filter((x) => x.proj?.edge.id === zone.edgeId);
        if (posts.length === 0) continue; // absence is a different lane's gate
        const best = posts.reduce((a, b) => (a.proj!.s < b.proj!.s ? a : b));
        const advance = zone.fromM - best.proj!.s;
        // A zone that starts inside the advance distance of the edge head has
        // nowhere earlier to put the post; placeAt clamps to metre 1.
        const room = zone.fromM - 1;
        if (advance >= Math.min(WARNING_ADVANCE_MIN_M, room) - 1e-6) continue;
        late.push(
          `${id}: ${wanted} for the ${zone.kind} at ${zone.fromM} m stands ${advance.toFixed(1)} m ` +
            `before it (room for ${room.toFixed(1)} m)`,
        );
      }
    }
    expect(late, late.join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. L2 — the signal head is scaled like every sign beside it
// ---------------------------------------------------------------------------

describe("sign truth: traffic-light heads are lesson-sized on lesson maps", () => {
  it("every head on every map carries SCENARIO_SIGN_SCALE", () => {
    // Doc 86 L2's one-word cause: both trafficLights.push calls in props.ts
    // omitted the scale spread that every signs.push carries. The head is the
    // one prop scaled on CITY maps too — a SphereGeometry(0.13) lens subtends
    // ~0.1° from the 76 m sx-spawn-south approach, and the 2.5× road
    // exaggeration is global, so the exam routes on district-v1 / d2-v1 had the
    // worst instance of it (90 heads between them).
    const unscaled: string[] = [];
    let heads = 0;
    let scenarioHeads = 0;
    for (const { id, world, scenario } of BUILT) {
      for (const light of world.trafficLights) {
        heads++;
        if (scenario) scenarioHeads++;
        if ((light.scale ?? 1) >= SCENARIO_SIGN_SCALE) continue;
        unscaled.push(
          `${id}: head at ${light.position.map((v) => v.toFixed(1)).join(", ")} scale=${light.scale ?? 1}`,
        );
      }
    }
    expect(scenarioHeads, "the scenario corpus must actually synthesise heads").toBeGreaterThan(0);
    expect(heads, "the whole corpus must synthesise heads").toBeGreaterThan(100);
    expect(unscaled, `${unscaled.length} 1× head(s):\n${unscaled.slice(0, 8).join("\n")}`).toEqual(
      [],
    );
  });

  it("city SIGN plates stay unscaled — only the head was lifted", () => {
    // The doc 62 rule that city sign PLACEMENTS stay byte-identical is intact:
    // a Б1 at 1× on a city street still reads, so nothing about the plates
    // changed outside the lesson maps.
    for (const { world, scenario } of BUILT) {
      if (scenario) continue;
      for (const sign of world.signs) expect(sign.scale).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. D6 — a limit that changes mid-route is announced
// ---------------------------------------------------------------------------

describe("sign truth: mid-route limit changes are signed", () => {
  it("every degree-2 limit transition on a scenario map carries a В26 for each legal direction", () => {
    const unsigned: string[] = [];
    for (const { id, district, world, scenario } of BUILT) {
      if (!scenario) continue;
      const touching = new Map<string, DistrictEdge[]>();
      for (const e of district.roads.edges) {
        for (const n of [e.from, e.to]) touching.set(n, [...(touching.get(n) ?? []), e]);
      }
      for (const [nodeId, edges] of touching) {
        if (edges.length !== 2) continue;
        const [a, b] = edges as [DistrictEdge, DistrictEdge];
        if (a.maxspeed === b.maxspeed) continue;
        for (const [from, into] of [
          [a, b],
          [b, a],
        ] as const) {
          if (into.oneway && into.from !== nodeId) continue;
          if (from.oneway && from.from === nodeId) continue;
          const want = into.maxspeed;
          const near = world.signs.filter((s) => {
            if (signKindSpeedKmh(s.kind) !== want) return false;
            const proj = edgeUnder(district, districtPos(s));
            if (proj?.edge.id !== into.id) return false;
            const fromNode = into.from === nodeId ? proj.s : proj.total - proj.s;
            return fromNode < 20;
          });
          if (near.length === 0) {
            unsigned.push(`${id}: ${from.id}(${from.maxspeed}) -> ${into.id}(${want}) at ${nodeId} has no plate`);
          }
        }
      }
    }
    expect(unsigned, unsigned.join("\n")).toEqual([]);
  });

  it("sc-sp-limit-end's map now ships the В26-40 posts and the end plate it lacked", () => {
    const b = BUILT.find((x) => x.id === "sp-signs-v1")!;
    const kinds = b.world.signs.map((s) => s.kind);
    expect(kinds.filter((k) => k === "limit40").length).toBeGreaterThanOrEqual(2);
    expect(kinds.filter((k) => k === "limitEnd").length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Placement hygiene, over the whole corpus
// ---------------------------------------------------------------------------

/** sign-post-distinct.test.ts states the same number over 4 maps; the new
 *  passes make it worth stating over all 90. */
const MIN_POST_SEPARATION_M = 0.75;

describe("sign truth: placement hygiene", () => {
  it("all 90 districts: no two sign models stand in the same cubic metre", () => {
    const collisions: string[] = [];
    for (const { id, world } of BUILT) {
      const s = world.signs;
      for (let i = 0; i < s.length; i++) {
        for (let j = i + 1; j < s.length; j++) {
          const d = Math.hypot(s[i]!.position[0] - s[j]!.position[0], s[i]!.position[2] - s[j]!.position[2]);
          if (d < MIN_POST_SEPARATION_M) {
            collisions.push(`${id}: ${s[i]!.kind} and ${s[j]!.kind} are ${d.toFixed(2)} m apart`);
          }
        }
      }
    }
    expect(collisions, collisions.join("\n")).toEqual([]);
  });

  it("the equal-priority junctions stay bare of priority signs (doc 86 R1)", () => {
    for (const id of ["tj-rhr-v1", "tj-occluded-v1", "jx-equal-v1"]) {
      const b = BUILT.find((x) => x.id === id)!;
      const priority = b.world.signs.filter(
        (s) => s.kind === "stop" || s.kind === "giveWay" || s.kind === "priorityRoad",
      );
      expect(priority.map((s) => s.kind), `${id} must stay an EQUAL junction`).toEqual([]);
    }
  });

  it("Д4 is never posted on a motorway carriageway or a slip road", () => {
    const bad: string[] = [];
    for (const { id, district, world } of BUILT) {
      for (const s of world.signs) {
        if (s.kind !== "oneWay") continue;
        const proj = edgeUnder(district, districtPos(s));
        if (!proj) continue;
        const cls = proj.edge.class;
        if (!proj.edge.oneway || cls.startsWith("motorway") || cls.startsWith("trunk") || cls.endsWith("_link")) {
          bad.push(`${id}: Д4 on ${proj.edge.id} (${cls}, oneway=${proj.edge.oneway})`);
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});
