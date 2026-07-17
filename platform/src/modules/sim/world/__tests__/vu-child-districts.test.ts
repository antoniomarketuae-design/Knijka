/**
 * VU-CHILD contract battery (doc 72 §7 VU-03 „Колелото завива около дупка"; the
 * vu-cyclist-group-districts.test.ts pattern).
 *
 * sc-vu-child-cyclist ships a map of its own (tools/maps/gen_vu_child.mjs →
 * vu-child-v1), so this battery carries BOTH jobs: the generated street really
 * does satisfy the engine contract, AND the invariants this template's three
 * demos rest on hold. Every one of the latter is asserted against the RUNTIME'S
 * OWN CONSTANTS rather than a hand-copied number, so a future re-tune of the
 * tracker fails here — loudly, next to the explanation — instead of silently
 * rotting three traces:
 *
 *  1. THE MAP IS BARE BY DESIGN: no junction (the vulnerable-pass tracker
 *     DISCARDS its episode inside a junction area), no zone (so the taught wide
 *     line may cross the crown), no crossing/signal/stop line — which is what
 *     gives the §9 `toEqual` code asserts their teeth.
 *  2. THE STREET IS STRAIGHT, AND THAT IS A TRACKER REQUIREMENT: the tracker
 *     measures the cyclist's drift against the line it froze at arm, and
 *     curved-road drift stands the episode down. A bend would un-grade the
 *     whole template silently.
 *  3. THE DENORMALIZED CONSTANTS ARE THE MAP: the numbers pinned by value into
 *     templates-vru2.ts (the L7 pattern) match vu-child-v1.json meta.scenario,
 *     and the staged child really rides the curb line the map publishes.
 *  4. THE WOBBLE THE TEMPLATE STAGES IS THE WOBBLE THE MAP AUTHORS: the actor's
 *     laneShift pulse reproduces meta.scenario.childPath to the centimetre —
 *     amplitude, trigger point and arc length alike.
 *  5. THE SWERVE IS BIG ENOUGH TO MATTER: 2.0 m is far past
 *     VULNERABLE_PASS_SWERVE_M, which is WHY every drive has to let it finish
 *     before committing. If the amplitude ever fell under that bar this assert
 *     would fail and the drives' whole shape would need re-justifying.
 *  6. THE DEMO LINES SIT IN THE BANDS THEY CLAIM, and the pair's asymmetry is
 *     structural: both squeeze lines convict; only the post-wobble one is inside
 *     the cut-in runner's contact bar. The §9 `toEqual` asserts depend on it.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { CutInLeadCarSpec, OncomingStreamSpec } from "../../contracts";
import { PERCEPTUAL_ROAD_SCALE } from "../../contracts";
import { compileScenario } from "../../lessons/scenario/compile";
import { SC_VU_CHILD_CYCLIST } from "../../lessons/scenario/templates-vru2";
import { DEFAULT_RULE_CONFIG } from "../../rules/types";
import {
  createWorldRuntime,
  VULNERABLE_PASS_ARM_AHEAD_M,
  VULNERABLE_PASS_BODY_ALLOWANCE_M,
  VULNERABLE_PASS_CONTACT_M,
  VULNERABLE_PASS_CONVICT_LATERAL_M,
  VULNERABLE_PASS_MIN_KMH,
  VULNERABLE_PASS_SAFE_LATERAL_M,
  VULNERABLE_PASS_SWERVE_M,
} from "../../runtime";
import { createTrafficSystem, leadGapFor } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";

/**
 * Pinned geometry. TWO lane numbers exist and the difference is deliberate (the
 * vu-cyclist-group precedent): the map's meta.scenario publishes ROUNDED values
 * (what templates-vru2.ts and the trace scripts denormalize — the L7 copy truth,
 * and what the drives steer to), while the generator's TRUE half-lane is 4.0625
 * (what the traffic system actually offsets the staged child from). The 2.5 mm
 * never matters to a drive; it matters here, because these asserts compare
 * against real staged poses.
 */
const META_LANE_X = 4.06;
const LANE_X = 4.0625;
const LANE_OPPOSING_X = -4.0625;
/** The child's TRUE lines: lane center + extraRightOffsetM 2.6, and that minus
 *  the 2.0 m swerve. */
const CURB_X = 6.6625;
const APEX_X = 4.6625;
/** The template/trace-script authored lines (scVuChildCyclist.ts). */
const WIDE_X = -2.0;
const NUDGE_X = 2.31;
const SQUEEZE_X = 4.3;
/** traffic/system.ts LEAD_CORRIDOR_M — the lead query's half-width, m. */
const LEAD_CORRIDOR_M = 4.0;
/** orchestrator/runners.ts VEHICLE_CONTACT_M — the cut-in runner's contact bar.
 *  Deliberately NOT imported: it is a module-private authored constant, and the
 *  point of re-typing it here is that this battery is where a change to it must
 *  be noticed (see the „one act, two verdicts" assert below and the agent note
 *  in scVuChildCyclist.ts — this bar is car-sized, and the actor is a bike). */
const CUTIN_CONTACT_M = 3.0;

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "vu-child-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "vu-child-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`vu-child-v1.json not found (run: node tools/maps/gen_vu_child.mjs)`);
}

type Meta = { meta: { scenario: Record<string, unknown> } };
type Wobble = {
  curbXM: number;
  apexXM: number;
  amplitudeM: number;
  triggerYM: number;
  triggerRadiusM: number;
  arcM: number;
};

/** The template's OWN staged child — single truth, never re-typed here. */
const CHILD = SC_VU_CHILD_CYCLIST.staged!.find(
  (s): s is CutInLeadCarSpec => s.kind === "cutInLeadCar",
)!;

describe("vu-child-v1 — the generated street satisfies the engine contract", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("is ONE straight 1+1 residential edge, posted 30", () => {
    expect(raw.roads.edges).toHaveLength(1);
    const e = raw.roads.edges[0];
    expect(e.oneway).toBe(false);
    expect(e.lanes).toBe(2);
    expect(e.class).toBe("residential");
    expect(e.maxspeed).toBe(30);
    // STRAIGHT, and that is a tracker requirement, not an aesthetic: the
    // vulnerable-pass episode measures the cyclist's drift against the line
    // frozen at arm, and a bend's own drift stands the episode down (the
    // runtime says so in as many words). A curve here would silently un-grade
    // every clearance this template teaches.
    expect(e.geometry).toEqual([
      [0, 0],
      [0, 300],
    ]);
  });

  it("derives ZERO signals, stop lines and junction trackers", () => {
    // The §9 asserts are `toEqual` on an exact code set. That is only
    // meaningful because there is nothing else on this map to convict on.
    const runtime = createWorldRuntime(loadRaw());
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("carries no crossings, roundabouts, intersections or ban spans", () => {
    const r = loadRaw() as TrafficDistrict & {
      crossings: unknown[];
      roundabouts: unknown[];
      intersections: unknown[];
      zones?: unknown[];
    };
    expect(r.crossings.length).toBe(0);
    expect(r.roundabouts.length).toBe(0);
    // A junction-free street: the vulnerable-pass tracker DISCARDS its episode
    // inside a junction area, so an intersection would carve dead zones out of
    // this template's pass corridor.
    expect(r.intersections.length).toBe(0);
    // No zones ⇒ no М1 span ⇒ CROSSED_SOLID_LINE cannot arm. The shadow's wide
    // line crosses the crown; this is what makes that free.
    expect(r.zones ?? []).toHaveLength(0);
  });

  it("spawns the driver in the northbound lane, 30 m behind where the child waits", () => {
    const withSpawns = raw as TrafficDistrict & {
      spawnPoints: { id: string; x: number; y: number; heading: number }[];
    };
    const spawn = withSpawns.spawnPoints.find((s) => s.id === "vuc-spawn-start")!;
    expect(spawn).toBeDefined();
    expect(spawn.x).toBe(META_LANE_X);
    expect(spawn.y).toBe(15);
    expect(spawn.heading).toBe(0);
    expect(SC_VU_CHILD_CYCLIST.start.spawnPointId).toBe("vuc-spawn-start");
    // The child holds 45 m up the road — 30 m of reading distance, which is what
    // makes „забележи го рано" an instruction rather than a slogan.
    expect(CHILD.actor.hold.offsetM - spawn.y).toBe(30);
  });
});

describe("sc-vu-child-cyclist — the template's pinned vu-child-v1 constants ARE the map", () => {
  let meta: Record<string, unknown>;
  let wobble: Wobble;

  beforeAll(() => {
    meta = (loadRaw() as unknown as Meta).meta.scenario;
    wobble = meta.wobble as Wobble;
  });

  it("the L7 denormalized lane center + map recipe match vu-child-v1.json meta.scenario", () => {
    expect(meta.laneCenterRightM).toBe(META_LANE_X);
    expect(Math.abs(META_LANE_X - LANE_X)).toBeLessThan(0.005);
    expect(meta.lanesPerDirection).toBe(1);
    expect(SC_VU_CHILD_CYCLIST.map.districtId).toBe("vu-child-v1");
    expect(SC_VU_CHILD_CYCLIST.map.params).toEqual(
      (meta as { params: Record<string, number | string> }).params,
    );
  });

  it("every staged path node exists on the graph", () => {
    const nodeIds = new Set((loadRaw() as TrafficDistrict).roads.nodes.map((n) => n.id));
    for (const id of CHILD.actor.pathNodes) expect(nodeIds.has(id)).toBe(true);
    const oncoming = (SC_VU_CHILD_CYCLIST.levels.find((l) => l.level === 5)!.stagedAdd ??
      []) as OncomingStreamSpec[];
    expect(oncoming).toHaveLength(1);
    for (const id of oncoming[0].actor.pathNodes) expect(nodeIds.has(id)).toBe(true);
    expect(oncoming[0].gapsM).toHaveLength(oncoming[0].count - 1);
  });

  it("stages exactly ONE child, and its curb offset is what TAGS it a cyclist", () => {
    expect(SC_VU_CHILD_CYCLIST.staged).toHaveLength(1);
    // A11 (traffic/system.ts): `extraRightOffsetM > 0` at stage time is the
    // vehicleCollisionKind marker — it is what puts this actor into
    // cyclistStateIds and therefore into `cyclistNear`, which is the ONLY feed
    // the vulnerable-pass tracker has. Drop the sign and the entire template
    // grades nothing while still looking correct on screen.
    expect(CHILD.actor.extraRightOffsetM).toBeGreaterThan(0);
    expect(CHILD.actor.extraRightOffsetM).toBeCloseTo(2.6, 6);
  });

  it("THE WOBBLE THE TEMPLATE STAGES IS THE WOBBLE THE MAP AUTHORS", () => {
    // The map owns the design (where the drain is, how far the child swings);
    // the template owns the actor dials. These asserts are the seam.
    expect(wobble.curbXM).toBe(6.66);
    expect(wobble.apexXM).toBe(4.66);
    expect(CHILD.cutAt).toEqual({ x: wobble.curbXM, y: wobble.triggerYM });
    expect(CHILD.cutRadiusM).toBe(wobble.triggerRadiusM);
    expect(-CHILD.cutShiftM).toBeCloseTo(wobble.amplitudeM, 6);
    // The glide's duration is not a feel: it is the map's arc length flown at
    // the child's own pace, so the swerve occupies exactly the metres of street
    // the map says it does.
    expect(CHILD.cutRampSec * CHILD.actor.cruiseSpeedMps).toBeCloseTo(wobble.arcM, 6);
    // …and childPath is that same design, written out.
    expect(meta.childPath).toEqual([
      [wobble.curbXM, 0],
      [wobble.curbXM, wobble.triggerYM],
      [wobble.apexXM, wobble.triggerYM + wobble.arcM],
      [wobble.apexXM, 300],
    ]);
  });

  it("THE SWERVE IS BIG ENOUGH TO STAND THE TRACKER DOWN — which is why the drives wait", () => {
    // The load-bearing fact of this template's whole authoring. The tracker
    // freezes the cyclist's line at ARM and discards the episode if he drifts
    // ≥ 0.6 m toward the player. This wobble is 2.0 m — more than 3× the bar —
    // so a pass armed while it runs grades NOTHING. That is why the shadow and
    // the first demo crawl at 11 km/h until it settles (under the arm floor),
    // and why the second demo is 60 m past the drain before it arrives.
    expect(wobble.amplitudeM).toBeGreaterThan(VULNERABLE_PASS_SWERVE_M);
    expect(wobble.amplitudeM).toBeGreaterThan(3 * VULNERABLE_PASS_SWERVE_M);
    // The drives' escape hatch is the SPEED floor, not the distance one: at
    // 11 km/h no episode can arm however close the car gets.
    expect(11).toBeLessThan(VULNERABLE_PASS_MIN_KMH);
    // …and the distance bar is what the copy calls „изцяло в огледалото".
    expect(VULNERABLE_PASS_ARM_AHEAD_M).toBe(25);
  });

  it("THE APEX IS IN THE DRIVER'S LANE — the whole лекция, as a number", () => {
    // „Дръж двойно по-широк просвет" is not a slogan about politeness: the
    // child ENDS UP 0.6 m off the lane center the driver is sitting on. A
    // margin budgeted from the curb line (6.66) is 2 m of fiction.
    expect(APEX_X - LANE_X).toBeCloseTo(0.6, 2);
    expect(CURB_X - APEX_X).toBeCloseTo(2.0, 6);
  });
});

describe("sc-vu-child-cyclist — the child through the REAL traffic system", () => {
  const stageChild = () => {
    const traffic = createTrafficSystem(loadRaw() as TrafficDistrict, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: LANE_X, y: 15 },
      anchorRadiusM: 400,
    });
    const view = traffic.stage({
      kind: "vehicle",
      id: CHILD.id,
      pathNodes: CHILD.actor.pathNodes,
      hold: CHILD.actor.hold,
      cruiseSpeedMps: CHILD.actor.cruiseSpeedMps,
      extraRightOffsetM: CHILD.actor.extraRightOffsetM,
      colorIndex: CHILD.actor.colorIndex,
    });
    expect(view, `${CHILD.id} failed to stage`).not.toBeNull();
    return traffic;
  };

  it("the template's own extraRightOffsetM really puts the child on the map's curb line", () => {
    const traffic = stageChild();
    const view = traffic.staged(CHILD.id)!;
    expect(Math.abs(view.x - CURB_X), `child x=${view.x}`).toBeLessThan(0.05);
    expect(view.y).toBeCloseTo(45, 1);
  });

  it("THE PACE DIAL: paceAheadM is unreachable, so matchPlayer saturates the cap", () => {
    // The child must pedal a dead-constant 2.6 m/s no matter what the driver
    // does — he is a child, not a pace car. The staged matchPlayer law is
    // `target = playerMps + 0.55 × (paceAheadM − gap)`, capped at
    // maxMatchSpeedMps. With paceAheadM longer than the whole street, the term
    // can never go negative, so the target is always far over the cap and the
    // cap IS the speed. A small paceAheadM would make the child brake to a stop
    // whenever the driver hung back — inverting the drill.
    expect(CHILD.paceAheadM).toBeGreaterThan(300); // the street is 300 m
    expect(CHILD.maxMatchSpeedMps).toBe(CHILD.actor.cruiseSpeedMps);
    expect(CHILD.cutSpeedMps).toBe(CHILD.actor.cruiseSpeedMps);
    // …and the swerve is a fact of the street, not a reaction to the driver:
    // the floor is authored under every drive's speed so all three recordings
    // see the identical wobble at the identical place.
    expect(CHILD.minCutSpeedKmh).toBeLessThan(9); // the shadow's 9 km/h ease
    // The encounter never „clears": the child is still on the street when the
    // lesson ends, which is exactly the feeling the drill wants to leave.
    expect(CHILD.clearAheadM).toBeGreaterThan(300);
  });

  it("the child sits INSIDE the lead corridor on both squeeze lines — hence the 19 km/h demos", () => {
    // Why both mistake demos are authored at 19 km/h and not 30: at/над
    // followMinSpeedKmh (20) the child reads as a zero-gap LEAD and
    // FOLLOWING_TOO_CLOSE joins every clearance verdict. Functional proof
    // against the shipped query, on both lines the demos actually drive.
    expect(leadGapFor([{ x: CURB_X, y: 60 }], SQUEEZE_X, 50, 0)).toBeLessThan(Infinity);
    expect(leadGapFor([{ x: APEX_X, y: 160 }], NUDGE_X, 150, 0)).toBeLessThan(Infinity);
    expect(DEFAULT_RULE_CONFIG.followMinSpeedKmh).toBe(20);
    // …and 19 still clears the tracker's own pass floor, so the squeeze grades.
    expect(19).toBeGreaterThan(VULNERABLE_PASS_MIN_KMH);
    expect(19).toBeLessThan(DEFAULT_RULE_CONFIG.followMinSpeedKmh);
  });
});

describe("sc-vu-child-cyclist — the authored lines sit in the bands they claim", () => {
  it("THE WIDE LINE: past the SAFE bar against the child's NEW line, with real daylight", () => {
    const centers = APEX_X - WIDE_X; // 6.66
    expect(centers).toBeGreaterThan(VULNERABLE_PASS_SAFE_LATERAL_M);
    // ~5.4 m of air after the documented body allowance — the shadow's YIELDED
    // verdict rests on this being comfortably clear, not marginal. And it is
    // measured from the APEX: the same line against the CURB would be 8.66 and
    // would flatter a driver who had budgeted nothing for the swerve.
    expect(centers - VULNERABLE_PASS_BODY_ALLOWANCE_M).toBeGreaterThan(1.5);
  });

  it("THE WIDE LINE: outside the lead corridor, and inside laneKeepMaxOffsetM of the oncoming lane", () => {
    expect(APEX_X - WIDE_X).toBeGreaterThan(LEAD_CORRIDOR_M + 0.5);
    // Functional proof: the child on his new line 8 m AHEAD of a player on the
    // wide line, heading north, is invisible to the lead query — so an innocent
    // driver can never tailgate the child he is correctly going around.
    expect(leadGapFor([{ x: APEX_X, y: 158 }], WIDE_X, 150, 0)).toBe(Infinity);
    // Holding the pass line must not read as sustained wandering: −2.0 is
    // 2.06 m off the southbound center and the bar is 3.25 m.
    const maxOffset = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM;
    expect(maxOffset).toBeCloseTo(1.3 * PERCEPTUAL_ROAD_SCALE, 6);
    expect(Math.abs(WIDE_X - LANE_OPPOSING_X)).toBeLessThan(maxOffset);
  });

  it("THE NUDGE LINE convicts, does NOT touch the collision machinery's own bar — and is LEGAL as a line", () => {
    const centers = APEX_X - NUDGE_X; // 2.3525
    expect(centers).toBeLessThan(VULNERABLE_PASS_CONVICT_LATERAL_M);
    // Above VULNERABLE_PASS_CONTACT_M: below it, the tracker hands the act to
    // the collision machinery („one act, one code") and the clearance bill would
    // VANISH — the demo would lose the very code it is named for.
    expect(centers).toBeGreaterThan(VULNERABLE_PASS_CONTACT_M);
    // …and the car's LINE is entirely lawful — 1.75 m off its own lane center,
    // well inside the bar. Only the GAP is the offence, which is the whole
    // reason the demo teaches what it teaches.
    expect(Math.abs(NUDGE_X - LANE_X)).toBeLessThan(DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM);
  });

  it("THE SQUEEZE LINE convicts against the child's PRE-wobble curb line", () => {
    const centers = CURB_X - SQUEEZE_X; // 2.3625
    expect(centers).toBeLessThan(VULNERABLE_PASS_CONVICT_LATERAL_M);
    expect(centers).toBeGreaterThan(VULNERABLE_PASS_CONTACT_M);
  });

  it("ONE ACT, TWO VERDICTS: the pair's asymmetry is the cut-in runner's contact bar", () => {
    // The template's sharpest structural fact, and the reason the two demos
    // bill differently for the SAME metre of air. The cut-in runner emits
    // collision inside VEHICLE_CONTACT_M (3.0 — a CAR body's bar), and ONLY
    // after the cut has fired. So:
    const nudge = APEX_X - NUDGE_X;
    const squeeze = CURB_X - SQUEEZE_X;
    expect(nudge).toBeCloseTo(squeeze, 1); // identical margins…
    expect(nudge).toBeLessThan(CUTIN_CONTACT_M); // …both inside the contact bar…
    expect(squeeze).toBeLessThan(CUTIN_CONTACT_M);
    // …and only ONE of them is driven after the wobble, which is what makes the
    // difference. The narrow demo's pass completes ~60 m before the child ever
    // reaches the drain, so the runner's contact channel is not yet running.
    // If this ordering ever broke, the two demos would collapse into one code.
    const wobbleY = (loadRaw() as unknown as Meta).meta.scenario.wobble as Wobble;
    expect(wobbleY.triggerYM).toBeGreaterThan(95); // the narrow demo is clear by y ≈ 95
    // Reported in the agent notes: 3.0 m is the car body's bar and this actor is
    // a bike (the cyclistRightHook runner uses 2.2). Under 2.2 the first demo
    // would keep its clearance bill and lose the contact — i.e. VU-03's „опасна
    // on contact" would have no home in the shipped stack at all.
    expect(CUTIN_CONTACT_M).toBeGreaterThan(VULNERABLE_PASS_CONTACT_M);
  });
});

describe("sc-vu-child-cyclist — the rungs carry the drill", () => {
  it("the child rides EVERY rung, and no dial is opted in anywhere", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const lesson = compileScenario(SC_VU_CHILD_CYCLIST, level);
      expect(lesson.id).toBe(`sc-vu-child-cyclist@L${level}`);
      // Drop the child and the student meets an empty residential street: there
      // is nothing to read, nothing to wait for, and the drill inverts into
      // „drive 300 m". He IS the lesson's premise, not an L5 garnish.
      expect(
        (lesson.stagedEvents ?? []).some((s) => s.id === "sc-vucc-child"),
        `L${level}`,
      ).toBe(true);
      // Graded on SHIPPED rules alone: чл. 42's clearance lives in the runtime's
      // vulnerable-pass tracker, default-on for everyone, and the ghosts are
      // dry-tuned (ADR-006 stage 4a).
      expect(lesson.ruleConfig, `L${level}`).toBeUndefined();
      expect(lesson.physics, `L${level}`).toBeUndefined();
    }
    expect(compileScenario(SC_VU_CHILD_CYCLIST, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_VU_CHILD_CYCLIST, 4).examMode).toBe(true);
    expect(SC_VU_CHILD_CYCLIST.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
  });

  it("L5 adds ONE oncoming car and NOT weather — the rung changes the ANSWER, not the grip", () => {
    const l5 = compileScenario(SC_VU_CHILD_CYCLIST, 5);
    expect(l5.stagedEvents).toHaveLength(2);
    const oncoming = (l5.stagedEvents ?? []).find((s) => s.id === "sc-vucc-oncoming")!;
    expect(oncoming).toBeDefined();
    expect(oncoming.kind).toBe("oncomingStream");
    // „Nowhere to go but BEHIND the child": the wide line this drill teaches is
    // the ONCOMING BANK, and at L5 the bank is occupied for exactly the seconds
    // the child spends swinging into your lane. The only lawful move left is the
    // objective's second half — stay back and brake (чл. 20, ал. 2).
    expect(l5.environment?.rain).not.toBe(true);
    expect(l5.physics).toBeUndefined();
    // …and the lower rungs really are car-free, or the wide line they teach
    // would already be unavailable.
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_VU_CHILD_CYCLIST, level).stagedEvents, `L${level}`).toHaveLength(1);
    }
  });
});
