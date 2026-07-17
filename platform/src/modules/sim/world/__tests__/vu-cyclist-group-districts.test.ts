/**
 * VU-CYCLIST-GROUP contract battery (doc 72 §7 VU-02, the column variant; the
 * vu-blindspot-districts.test.ts pattern).
 *
 * sc-vu-cyclist-group REUSES the committed vu-pass-v1 micro-map, so this
 * battery adds no map coverage — vu-streets-districts.test.ts already proves
 * the street satisfies the engine contract and is junction-free. What it proves
 * instead is the set of invariants THIS TEMPLATE's demos rest on, and every one
 * of them is asserted against the RUNTIME'S OWN CONSTANTS rather than against a
 * hand-copied number, so a future re-tune of the tracker fails here — loudly,
 * next to the explanation — instead of silently rotting three traces:
 *
 *  1. THE DENORMALIZED CONSTANTS ARE THE MAP: the lane center pinned by value
 *     into templates-vru2.ts (the L7 pattern) matches vu-pass-v1.json's
 *     meta.scenario, and the column really rides the curb line.
 *  2. THE SPACING IS A TRACKER CONSTRAINT, NOT A STYLE CHOICE: 20 m clears
 *     2 × VULNERABLE_PASS_DONE_BEHIND_M, which is what makes the single-target,
 *     identity-blind tracker bill each of the five riders separately.
 *  3. THE WIDE LINE IS TRIPLY CONSTRAINED: past the SAFE clearance bar, outside
 *     the lead corridor (so a rider alongside an innocent driver can never read
 *     as a zero-gap lead), and inside laneKeepMaxOffsetM of the oncoming lane's
 *     center (so holding it for ~20 s is not sustained wandering).
 *  4. THE DEMO LINES SIT IN THE BANDS THEY CLAIM: the squeeze convicts and does
 *     NOT touch; the cut line touches. Both are one geometric step apart, and
 *     the §9 `toEqual` asserts depend on which side of 2.2 m they land.
 *  5. NOTHING ELSE ON THIS MAP CAN GRADE: no signal, stop line, crossing,
 *     junction or ban span — which is why the §9 exact-code asserts have teeth.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { CyclistRightHookSpec, OncomingStreamSpec } from "../../contracts";
import { PERCEPTUAL_ROAD_SCALE } from "../../contracts";
import { SC_VU_CYCLIST_GROUP } from "../../lessons/scenario/templates-vru2";
import { DEFAULT_RULE_CONFIG } from "../../rules/types";
import {
  createWorldRuntime,
  VULNERABLE_PASS_BODY_ALLOWANCE_M,
  VULNERABLE_PASS_CONTACT_M,
  VULNERABLE_PASS_CONVICT_LATERAL_M,
  VULNERABLE_PASS_DONE_BEHIND_M,
  VULNERABLE_PASS_SAFE_LATERAL_M,
} from "../../runtime";
import { createTrafficSystem, leadGapFor } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";

/**
 * Pinned geometry. TWO lane numbers exist and the difference is deliberate:
 * the map's meta.scenario publishes a ROUNDED 4.06 (what templates-vru2.ts and
 * the trace scripts denormalize — the L7 copy truth, and what the drives steer
 * to), while the generator's TRUE half-lane is 4.0625 (what the traffic system
 * actually offsets staged actors from). The 2.5 mm never matters to a drive; it
 * matters here, because these asserts compare against real staged poses.
 */
const META_LANE_X = 4.06;
const LANE_X = 4.0625;
const LANE_OPPOSING_X = -4.0625;
/** The riders' curb line: TRUE lane center + extraRightOffsetM 2.6. */
const RIDER_X = 6.6625;
/** The template's authored lines (templates-vru2 VUG_PASS_X / scVuCyclistGroup). */
const PASS_X = -2.0;
const SQUEEZE_X = 4.3;
const CUT_X = 5.2;
/** traffic/system.ts LEAD_CORRIDOR_M — the lead query's half-width, m. */
const LEAD_CORRIDOR_M = 4.0;

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "vu-pass-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "vu-pass-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`vu-pass-v1.json not found (run: node tools/maps/gen_vu_streets.mjs)`);
}

/** The template's OWN staged actors — single truth, never re-typed here. */
const COLUMN = SC_VU_CYCLIST_GROUP.staged!.filter(
  (s): s is CyclistRightHookSpec => s.kind === "cyclistRightHook",
);
const ONCOMING = SC_VU_CYCLIST_GROUP.staged!.find(
  (s): s is OncomingStreamSpec => s.kind === "oncomingStream",
)!;

describe("sc-vu-cyclist-group — the template's pinned vu-pass-v1 constants ARE the map", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("the L7 denormalized lane center matches vu-pass-v1.json meta.scenario", () => {
    const meta = (raw as unknown as { meta: { scenario: Record<string, unknown> } }).meta.scenario;
    expect(meta.laneCenterRightM).toBe(META_LANE_X);
    // …and the rounded copy truth is within a rounding step of the real lane.
    expect(Math.abs(META_LANE_X - LANE_X)).toBeLessThan(0.005);
    expect(meta.lanesPerDirection).toBe(1);
    expect(SC_VU_CYCLIST_GROUP.map.districtId).toBe("vu-pass-v1");
    expect(SC_VU_CYCLIST_GROUP.map.params).toEqual(
      (meta as { params: Record<string, number | string> }).params,
    );
  });

  it("every staged actor's path nodes exist on the graph, and the spawn is vu-pass-v1's", () => {
    const nodeIds = new Set(raw.roads.nodes.map((n) => n.id));
    for (const rider of COLUMN) {
      for (const id of rider.actor.pathNodes) expect(nodeIds.has(id)).toBe(true);
      expect(nodeIds.has(rider.junction.nodeId)).toBe(true);
    }
    for (const id of ONCOMING.actor.pathNodes) expect(nodeIds.has(id)).toBe(true);
    expect(SC_VU_CYCLIST_GROUP.start.spawnPointId).toBe("vup-spawn-start");
  });

  it("stages FIVE riders with unique ids, plus exactly one oncoming car", () => {
    expect(COLUMN).toHaveLength(5);
    expect(new Set(COLUMN.map((r) => r.id)).size).toBe(5);
    expect(ONCOMING.count).toBe(1);
    // OncomingStreamSpec contract: gapsM has length count − 1.
    expect(ONCOMING.gapsM).toHaveLength(ONCOMING.count - 1);
  });
});

describe("sc-vu-cyclist-group — the column through the REAL traffic system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  const stageColumn = () => {
    const traffic = createTrafficSystem(raw, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: LANE_X, y: 15 },
      anchorRadiusM: 400,
    });
    for (const rider of COLUMN) {
      const view = traffic.stage({
        kind: "vehicle",
        id: rider.id,
        pathNodes: rider.actor.pathNodes,
        hold: rider.actor.hold,
        cruiseSpeedMps: rider.actor.cruiseSpeedMps,
        extraRightOffsetM: rider.actor.extraRightOffsetM,
        colorIndex: rider.actor.colorIndex,
      });
      expect(view, `rider ${rider.id} failed to stage`).not.toBeNull();
    }
    return traffic;
  };

  it("the template's own extraRightOffsetM puts every rider on the SAME curb line", () => {
    const traffic = stageColumn();
    for (const rider of COLUMN) {
      const view = traffic.staged(rider.id)!;
      expect(Math.abs(view.x - RIDER_X), `${rider.id} x=${view.x}`).toBeLessThan(0.05);
    }
  });

  it("the riders sit at a uniform 20 m pitch, tail to lead", () => {
    const traffic = stageColumn();
    // COLUMN[0] is the LEAD (highest y) … COLUMN[4] the tail.
    const ys = COLUMN.map((r) => traffic.staged(r.id)!.y);
    for (let i = 0; i < ys.length - 1; i++) {
      expect(ys[i] - ys[i + 1]).toBeCloseTo(20, 1);
    }
    // …spanning ~80 m: the „one long commitment" the objective is built on.
    expect(ys[0] - ys[4]).toBeCloseTo(80, 1);
  });

  it("THE LOAD-BEARING SPACING: the pitch clears 2 × the tracker's done-behind bar", () => {
    const traffic = stageColumn();
    const ys = COLUMN.map((r) => traffic.staged(r.id)!.y);
    const pitch = ys[0] - ys[1];
    // The vulnerable-pass tracker is single-target and identity-blind: it reads
    // whatever cyclistNear calls NEAREST, and bills that rider when it falls
    // DONE_BEHIND (8 m) back. The nearest flips forward at the midpoint of the
    // pitch, so per-rider adjudication needs pitch/2 > DONE_BEHIND. At 20 m the
    // rider being graded is still nearest by 8 vs 12 m when its bill lands.
    expect(pitch / 2).toBeGreaterThan(VULNERABLE_PASS_DONE_BEHIND_M);
    // Real margin, not a rounding win — 16.0 m would technically tie.
    expect(pitch).toBeGreaterThan(2 * VULNERABLE_PASS_DONE_BEHIND_M + 2);
  });
});

describe("sc-vu-cyclist-group — the authored lines sit in the bands they claim", () => {
  it("THE WIDE LINE: past the SAFE clearance bar, with real daylight", () => {
    const centers = RIDER_X - PASS_X;
    expect(centers).toBeGreaterThan(VULNERABLE_PASS_SAFE_LATERAL_M);
    // ~7.4 m of air after the documented body allowance — the shadow's five
    // YIELDED verdicts rest on this being comfortably clear, not marginal.
    expect(centers - VULNERABLE_PASS_BODY_ALLOWANCE_M).toBeGreaterThan(1.5);
  });

  it("THE WIDE LINE: outside the lead corridor, so an innocent driver never tailgates a rider", () => {
    const lateralM = RIDER_X - PASS_X;
    expect(lateralM).toBeGreaterThan(LEAD_CORRIDOR_M + 0.5);
    // Functional proof against the shipped query: a rider on the curb line 8 m
    // AHEAD of a player on the wide line, heading north, is invisible to it.
    expect(leadGapFor([{ x: RIDER_X, y: 158 }], PASS_X, 150, 0)).toBe(Infinity);
    // Counter-proof the query is live at all: in-lane, the rider is seen at once.
    expect(leadGapFor([{ x: RIDER_X, y: 158 }], LANE_X, 150, 0)).toBeLessThan(Infinity);
  });

  it("THE WIDE LINE: inside laneKeepMaxOffsetM of the ONCOMING lane center", () => {
    // Holding the pass line for ~20 s must not read as sustained wandering.
    // −2.0 is 2.06 m off the southbound center; the bar is 3.25 m.
    const maxOffset = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM;
    expect(maxOffset).toBeCloseTo(1.3 * PERCEPTUAL_ROAD_SCALE, 6);
    expect(Math.abs(PASS_X - LANE_OPPOSING_X)).toBeLessThan(maxOffset);
    // …and the crown itself is NOT a place to loiter: a line halfway between
    // the two lane centers would be off-center for both. This is why the pass
    // line is −2.0 and not −0.5, and why the drives cross that band quickly.
    expect(Math.abs(0 - LANE_OPPOSING_X)).toBeGreaterThan(maxOffset);
    expect(Math.abs(0 - LANE_X)).toBeGreaterThan(maxOffset);
  });

  it("THE SQUEEZE LINE convicts and does NOT touch (the mistake-demo band)", () => {
    const centers = RIDER_X - SQUEEZE_X;
    expect(centers).toBeLessThan(VULNERABLE_PASS_CONVICT_LATERAL_M);
    // Above the contact bar: below it, the act belongs to the collision
    // machinery ("one act, one code") and the clearance bill would VANISH —
    // which is exactly how the cut-in demo's first tuning lost rider 3's verdict.
    expect(centers).toBeGreaterThan(VULNERABLE_PASS_CONTACT_M);
  });

  it("THE CUT LINE is inside the contact bar (the cut-in demo's COLLISION)", () => {
    expect(RIDER_X - CUT_X).toBeLessThan(VULNERABLE_PASS_CONTACT_M);
  });
});

describe("sc-vu-cyclist-group — vu-pass-v1 is bare, so ONLY the pass can grade", () => {
  it("derives ZERO signals, stop lines and junction trackers", () => {
    // The §9 asserts are `toEqual` on an exact code set. That is only
    // meaningful because there is nothing else on this map to convict on.
    const runtime = createWorldRuntime(loadRaw());
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("carries no crossings, roundabouts, intersections or ban spans", () => {
    const raw = loadRaw() as TrafficDistrict & {
      crossings: unknown[];
      roundabouts: unknown[];
      intersections: unknown[];
      zones?: unknown[];
    };
    expect(raw.crossings.length).toBe(0);
    expect(raw.roundabouts.length).toBe(0);
    expect(raw.intersections.length).toBe(0);
    // No zones ⇒ no М1 span ⇒ CROSSED_SOLID_LINE cannot arm. The wide line
    // crosses the crown on every drive; this is what makes that free.
    expect(raw.zones ?? []).toHaveLength(0);
    // A junction-free street: the vulnerable-pass tracker DISCARDS its episode
    // inside a junction area, so an intersection would carve dead zones out of
    // this template's 80 m pass corridor.
    expect(raw.roads.edges).toHaveLength(1);
    expect(raw.roads.edges[0].oneway).toBe(false);
    expect(raw.roads.edges[0].lanes).toBe(2);
    // The posted limit the 45 km/h drives are authored against.
    expect(raw.roads.edges[0].maxspeed).toBe(50);
  });
});
