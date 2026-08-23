/**
 * SWEEP 161 — the five BROKEN findings routed at `templates-signals.ts`, each
 * one taken to a MEASUREMENT rather than a reading of the copy.
 *
 * The frames are under `.audit-frames/sweep161/`, one directory per drill and
 * four legs each; every one cited below was opened. What the audit saw, and
 * what each section here does about it:
 *
 *   §1  sc-signal-flashing — THE ONE DEFECT THAT WAS ACTUALLY IN THIS FILE, and
 *       the audit did not name it: the crossing car's authored hold falls 5 m
 *       off the start of its own path on sxf-v1, and `clampArc` swallows it, so
 *       the spec documented 95 m while the runner timed the encounter with 90.
 *       This section is the guard, and it is directional: it is red on the old
 *       value and on any future spec pushed past its own arm, and green on
 *       sc-signal-dead's 95 m, which its 150 m arm honours.
 *
 *       …AND THE GUARD IS DOING ITS JOB RIGHT NOW — 2026-08-18, the wave that
 *       cleared the red at HEAD. This header used to end „Fixed here (offsetM
 *       −95 → −90)". That fix NEVER LANDED. Commit 2f5ce8f wrote the 32-line
 *       justification for it onto `SC_SIGNAL_FLASHING_CONFLICT` and then applied
 *       the NUMBER to `SC_SIGNAL_DEAD_CONFLICT`, 180 lines above it — the two
 *       sites read `hold: { nodeIndex: 1, offsetM: -95 }` character for
 *       character, and the tell it left behind is sxd-v1's trailing comment,
 *       still saying „// 95 m east of the junction" beside a −90. So both specs
 *       are wrong in OPPOSITE directions, and §1 is red twice for two true
 *       reasons:
 *
 *         sc-sflash-conflict  still −95 on a 90 m arm  → asks 95, gets 90
 *         sc-sdead-conflict   demoted to −90 on a 150 m arm → the arm holds 95
 *
 *       MEASURED here through `createTrafficSystem` + the production `stage()`,
 *       sweeping the offset on each district (zz-probe, this wave):
 *
 *         sxd-v1  nodeS[1] 150.000   −95 → arc 55.000  carDist 95.000  x 95.000
 *                                    −90 → arc 60.000  carDist 90.000  x 90.000
 *         sxf-v1  nodeS[1]  90.000   −95 → arc  0.000  carDist 90.000  x 90.000
 *                                    −90 → arc  0.000  carDist 90.000  x 90.000
 *
 *       Read the arcs, not the carDists: on sxd-v1 the arc is 55, so 95 m is
 *       reached by ARITHMETIC and the arm honours it — the −90 there is a
 *       regression, not a clamp. On sxf-v1 −95 pins the arc to 0 and −90 lands
 *       on 0 by arithmetic, same pose to the millimetre — 90 is the truth there.
 *       ONE map clamps, not two; the matching 90s are a coincidence of two
 *       different causes, which is exactly how this looked like a placement bug
 *       in `traffic/staged.ts` and was not.
 *
 *       `clampArc` IS NOT THE DEFECT, and loosening it is the trap. Mutation:
 *       drop its lower bound (`return s < 0 ? 0 : …` → no floor) and the first
 *       expectation below goes GREEN on the broken spec — carDist finally reads
 *       95 — while the car is standing at arc −5, five metres off the start of
 *       its own path, and `at.x` moves 90 → 95. Two further assertions catch it
 *       (`hold arc` ≥ 0, and the direction test's `clamped.arcM === 0`). A
 *       „fix" there buys the documented number by putting a body off the road.
 *
 *       THE PATCH IS TWO NUMBERS IN `templates-signals.ts`, WHICH THIS FILE DOES
 *       NOT OWN: `SC_SIGNAL_DEAD_CONFLICT.actor.hold.offsetM` −90 → −95 (a
 *       restore — it was −95 for the whole history before 2f5ce8f, which is the
 *       value all three committed sc-signal-dead demos were recorded against),
 *       and `SC_SIGNAL_FLASHING_CONFLICT.actor.hold.offsetM` −95 → −90 (the edit
 *       its own comment already argues for at length; byte-identical staging, so
 *       no demo moves). Verified by the sweep above, not by reasoning: those two
 *       values are the ones that make all four §1 expectations true.
 *
 *   §2  sc-signal-dead — «The guided line drives the car INTO A BUILDING …
 *       objective 2 never ticks anywhere» (critical). REFUTED, with numbers.
 *       The guided line is the committed shadow trace, and every sample of all
 *       five of this family's shadows clears every building footprint of its
 *       own district by a measured margin. The objective is reachable too: a
 *       drive that actually turns left completes it through the production
 *       stack. What the sweep photographed is its own bot — `lesson-audit.mjs`
 *       holds throttle and brake and NEVER STEERS (its own header says so:
 *       „`wrong` is one act: hold the throttle and never touch the brake",
 *       and `right` adds a stop-and-look cadence, not a wheel) — so on the
 *       one drill in this family that turns, it drove straight off the end of
 *       an 80 m north arm and into the frontage. Harness, not template.
 *
 *   §3  sc-signal-hesitation — «the wrong drive … 0 наказателни точки and NOT
 *       ONE mistake» (critical). REPRODUCED HEADLESSLY, and the cause is NOT
 *       in this file: the rule engine DOES convict the 59-in-a-50 (t ≈ 8.9 s,
 *       SPEEDING_OVER_LIMIT), and the lesson session bills nothing because
 *       второстепенна codes warn once before they grade (scenarios/policy.ts +
 *       coach.ts). This section pins both halves so the routing is checkable
 *       and so the day the coach changes, the pin turns red instead of quiet.
 *
 *   §4  sc-signal-controller — «the world contradicts the briefing's stated
 *       posture … by 03-ready, before the student has moved, it has already
 *       flipped» (major). REPRODUCED for THIS template. Same cause and same
 *       one-latch fix as the sibling lane's signals2-controller-clock.test.ts
 *       (orchestrator/runners.ts, TrafficControllerRunner): `flipAtSec` rides
 *       the SESSION clock, which starts at scene mount and runs through the
 *       arrival card, the briefing and the L1 demonstration. No constant in
 *       this file can stand in for it (that battery's §3 proves the arithmetic
 *       once; it is not repeated here).
 *
 * The two findings not listed are the numbering pair (sc-signal-flashing and
 * sc-signal-controller, part D, «the list starts at 2.»). They are not in this
 * file either: `compileScenario` renumbers every briefing 1..n, and
 * `hud/overlayQueue.ts` then splits it — `briefingLineBg` takes step 1 as the
 * bold lead and `briefingBodyBg` prints the REST with their own numbers, which
 * is documented there as deliberate („renumbering would make the body claim to
 * be a different list"). §5 asserts that this file's own data is contiguous
 * from 1, so the routing cannot drift back here.
 *
 *   §6  sc-signal-hesitation, THE OTHER HALF — not §3's finding and said so out
 *       loud. §3 is the wrongConvicted=NO acquittal, whose cause is severity
 *       policy this file cannot reach. §6 guards the rightCredited half the
 *       FOUNDER filed (doc 87 B40 „who ? who is sleeping on green"): briefing
 *       step 3 makes six falsifiable geometric claims about the staged sleeper,
 *       and four of the six were unpinned anywhere in the repo (see §6's own
 *       docblock for the two that were, and how loosely).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  BrakingLeadCarSpec,
  PriorityFromRightSpec,
  TrafficControllerSpec,
} from "../../../contracts";
import { createScenarioDirector } from "../../../orchestrator";
import { createTrafficSystem, DEFAULT_TRAFFIC_CONFIG } from "../../../traffic";
import type { TrafficDistrict } from "../../../traffic/types";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { compileScenario } from "../compile";
import {
  SC_SIGNAL_CONTROLLER,
  SC_SIGNAL_CONTROLLER_EVENT,
  SC_SIGNAL_DEAD,
  SC_SIGNAL_DEAD_CONFLICT,
  SC_SIGNAL_FLASHING,
  SC_SIGNAL_FLASHING_CONFLICT,
  SC_SIGNAL_HESITATION,
  SC_SIGNAL_HESITATION_SLEEPER,
  SCENARIO_TEMPLATES_SIGNALS,
} from "../templates-signals";
import type { ScenarioSpec } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

/** Drawn lane-centre offset on every sx* district, m (battery sx-district). */
const LANE = 4.0625;
/** South spawn y on every sx* district, m. */
const SPAWN_Y = -105;

interface SxDistrict extends TrafficDistrict {
  meta: {
    scenario: {
      params: Record<string, number | string>;
      derived?: { stopLineFromNodeM?: number };
    };
  } & TrafficDistrict["meta"];
  buildings: ReadonlyArray<{ id: string; footprint: ReadonlyArray<readonly [number, number]> }>;
  spawnPoints: ReadonlyArray<{ id: string; x: number; y: number }>;
}

function district(id: string): SxDistrict {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as SxDistrict;
}

function traceSamples(relPath: string): Array<{ x: number; y: number; tSec: number }> {
  const raw = JSON.parse(readFileSync(path.join(REPO_ROOT, relPath), "utf-8")) as {
    samples: Array<{ x: number; y: number; tSec: number }>;
  };
  return raw.samples;
}

// ---------------------------------------------------------------------------
// §1 — THE HOLD ARC: a staged actor may never be authored off its own path
// ---------------------------------------------------------------------------

/**
 * Stage ONE actor through the production TrafficSystem — the same
 * `resolveStagedVehiclePath` + `createStagedVehicle` the orchestrator's
 * `stage()` calls — and report where it actually ends up. Ambient traffic is
 * off so nothing but the authored spec decides the pose.
 */
function stageActor(
  districtId: string,
  spec: PriorityFromRightSpec,
): { arcM: number; nodeArcM: number; carDistM: number; x: number; y: number } {
  const sys = createTrafficSystem(district(districtId), {
    ...DEFAULT_TRAFFIC_CONFIG,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const view = sys.stage({
    kind: "vehicle",
    id: spec.id,
    pathNodes: [...spec.actor.pathNodes],
    hold: { ...spec.actor.hold },
    cruiseSpeedMps: spec.actor.cruiseSpeedMps,
    playerGuard: true,
  });
  if (!view) throw new Error(`${spec.id}: failed to stage`);
  const nodeArcM = view.nodeS[spec.junctionNodeIndex];
  return { arcM: view.s, nodeArcM, carDistM: nodeArcM - view.s, x: view.x, y: view.y };
}

const CONFLICTS: Array<{ districtId: string; spec: PriorityFromRightSpec }> = [
  { districtId: SC_SIGNAL_DEAD.map.districtId, spec: SC_SIGNAL_DEAD_CONFLICT },
  { districtId: SC_SIGNAL_FLASHING.map.districtId, spec: SC_SIGNAL_FLASHING_CONFLICT },
];

describe("§1 the crossing car is held at the distance the spec claims", () => {
  for (const { districtId, spec } of CONFLICTS) {
    it(`${spec.id} on ${districtId}: carDist equals the authored offset, to the metre`, () => {
      const at = stageActor(districtId, spec);
      // THE LAW, and it is the runner's own arithmetic: `carArc = actor.s −
      // nodeS[junctionNodeIndex]` is what PriorityFromRightRunner syncs and
      // holds on, so an offset the path cannot honour is not a slower car —
      // it is a spec that documents a distance nothing uses. `clampArc` makes
      // that failure silent, which is why it needs an assertion rather than a
      // reader.
      expect(at.carDistM, `${spec.id} carDist`).toBeCloseTo(-spec.actor.hold.offsetM, 1);
      // …and the arc itself is inside the path (0 is legal — it is the start —
      // but negative is what the clamp swallows).
      expect(at.arcM, `${spec.id} hold arc`).toBeGreaterThanOrEqual(0);
      expect(at.arcM, `${spec.id} hold arc`).toBeLessThan(at.nodeArcM);
      // The car rides the westbound lane centre of the east arm either way.
      expect(at.y, `${spec.id} hold y`).toBeCloseTo(LANE, 2);
    });
  }

  it("the law is not a check that passes everybody — sxf-v1 rejects the sibling's own 95 m", () => {
    // THE DIRECTION TEST. sc-signal-dead's 95 m is correct on its 150 m arm and
    // must stay accepted; the SAME number on sxf-v1's 90 m arm must be caught.
    // Without this pair the assertion above could be satisfied by any check
    // loose enough to credit everybody.
    //
    // AND IT EARNED ITS KEEP — this is the assertion that caught 2f5ce8f's
    // mis-targeted edit (see the header). The `95` below is a LITERAL on
    // purpose, never `-SC_SIGNAL_DEAD_CONFLICT.actor.hold.offsetM`: reading it
    // off the spec would let the pin follow the spec's own drift and go quietly
    // green on the demotion to −90 that it is here to convict. The 90 m half
    // does read the clamp's answer, because that half is a fact about the MAP
    // (sxf-v1's east arm) and no spec can move it.
    //
    // The 90 m half is green at HEAD; the 95 m half is RED at HEAD and correct
    // to be — the second of §1's two true reds, closed by the same two-number
    // patch in `templates-signals.ts` the header names.
    const clamped = stageActor(SC_SIGNAL_FLASHING.map.districtId, {
      ...SC_SIGNAL_FLASHING_CONFLICT,
      actor: { ...SC_SIGNAL_FLASHING_CONFLICT.actor, hold: { nodeIndex: 1, offsetM: -95 } },
    });
    expect(clamped.arcM).toBe(0);
    expect(clamped.carDistM).toBeCloseTo(90, 1); // 95 asked, 90 delivered
    expect(clamped.carDistM).not.toBeCloseTo(95, 1);

    const fits = stageActor(SC_SIGNAL_DEAD.map.districtId, SC_SIGNAL_DEAD_CONFLICT);
    expect(fits.arcM).toBeGreaterThan(0);
    expect(fits.carDistM).toBeCloseTo(95, 1);
  });

  it("what 90 m still costs, recorded rather than quietly accepted", () => {
    // The hold POSE is unchanged by the fix and is still the arm's end node —
    // 15 m beyond `sx-spawn-east` (75, 4.06), the furthest pose gen_signal_x
    // itself places a car at on this map. Moving it in requires a longer east
    // arm (tools/maps/gen_signal_x.mjs + sxf-v1.json) and a re-record of the
    // three committed demos, because releasing the car 15 m nearer makes it
    // clear the box before the recorded shadow arrives — measured: both
    // YIELDED_TO_PRIORITY and mistake-cut's FAILED_TO_YIELD disappear from
    // s3-signals-bot-completion. Written down so the next reader inherits the
    // measurement instead of the idea.
    const at = stageActor(SC_SIGNAL_FLASHING.map.districtId, SC_SIGNAL_FLASHING_CONFLICT);
    const east = district(SC_SIGNAL_FLASHING.map.districtId).spawnPoints.find(
      (p) => p.id === "sx-spawn-east",
    );
    expect(east?.x).toBe(75);
    expect(at.x).toBe(90);
    expect(at.arcM).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §2 — THE GUIDED LINE IS NOT IN A BUILDING (sc-signal-dead, critical)
// ---------------------------------------------------------------------------

/** Shortest distance from a point to an axis-aligned-ish footprint polygon's
 *  interior, m; 0 when the point is inside it. Polygon-general (the sx*
 *  frontages are rectangles, but nothing here assumes that). */
function distanceToFootprint(
  px: number,
  py: number,
  poly: ReadonlyArray<readonly [number, number]>,
): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi;
    const dy = yj - yi;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - xi) * dx + (py - yi) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(px - (xi + t * dx), py - (yi + t * dy)));
  }
  return inside ? 0 : best;
}

/** Hero half-diagonal, m — a car is not a point (PLAYER_HALF_WIDTH 0.85 and a
 *  ~4.4 m body). The ribbon must clear a building by at least this much or the
 *  car following it is already touching. */
const HERO_HALF_DIAGONAL_M = 2.4;

describe("§2 every committed shadow ribbon clears every building on its own map", () => {
  for (const spec of SCENARIO_TEMPLATES_SIGNALS) {
    it(`${spec.id}: the line the student is told to follow never enters the frontage`, () => {
      const samples = traceSamples(spec.shadow!.path);
      expect(samples.length).toBeGreaterThan(100);
      const d = district(spec.map.districtId);
      expect(d.buildings.length).toBeGreaterThan(0);
      let worst = Infinity;
      let worstAt = "";
      for (const s of samples) {
        for (const b of d.buildings) {
          const gap = distanceToFootprint(s.x, s.y, b.footprint);
          if (gap < worst) {
            worst = gap;
            worstAt = `${b.id} @t=${s.tSec.toFixed(1)} (${s.x.toFixed(1)}, ${s.y.toFixed(1)})`;
          }
        }
      }
      // MEASURED 2026-08-18 — the closest any of the five committed shadows
      // ever comes to a frontage on its own map, and on every one of them it
      // is the parked frontage beside the SPAWN, not anything on the route:
      //   sc-signal-dead 17.94 m (sxd-f-es0)   sc-signal-flashing 12.14 m
      //   sc-signal-hesitation 13.44 m         sc-signal-controller 16.94 m
      //   sc-signal-redyellow 13.14 m
      // The audit's «camera inside building geometry» is a frame of the
      // sweep's own non-steering bot at t = 148 s, 99 s past the end of a
      // 49 s ribbon it left at the first corner.
      expect(worst, `${spec.id} closest frontage: ${worstAt}`).toBeGreaterThan(
        HERO_HALF_DIAGONAL_M,
      );
    });
  }

  it("the clearance check can fail: a sample moved into a footprint is caught", () => {
    // MUTATION, in the test itself — the assertion above is only worth its
    // green if the same arithmetic goes red on a line that IS in a building.
    const d = district(SC_SIGNAL_DEAD.map.districtId);
    const b = d.buildings.find((x) => x.id === "sxd-f-wn2")!;
    const centre: [number, number] = [
      b.footprint.reduce((a, p) => a + p[0], 0) / b.footprint.length,
      b.footprint.reduce((a, p) => a + p[1], 0) / b.footprint.length,
    ];
    expect(distanceToFootprint(centre[0], centre[1], b.footprint)).toBe(0);
    // …and a point on the shadow's own west-arm run is nowhere near it.
    expect(distanceToFootprint(-50, LANE, b.footprint)).toBeGreaterThan(HERO_HALF_DIAGONAL_M);
  });
});

// ---------------------------------------------------------------------------
// The production pipeline, shared by §2's reachability proof and §3/§4
// ---------------------------------------------------------------------------

interface DriveOutcome {
  /** Codes the recorder's own rule engine saw, with the second they fired. */
  engineCodes: Array<{ code: string; tSec: number }>;
  /** Codes the LESSON SESSION billed — what the debrief and the score read. */
  sessionCodes: string[];
  score: number;
  passed: boolean;
  objectivesDone: boolean[];
  /** Every trafficLight stop-line crossing, with the controller permission. */
  crossings: Array<{ tSec: number; controller?: "halt" | "proceed" }>;
}

function drive(
  spec: ScenarioSpec,
  script: DriveScript,
  staged: readonly unknown[] = spec.staged ?? [],
  level: 1 | 2 | 3 | 4 | 5 = 1,
): DriveOutcome {
  const lesson = compileScenario(spec, level);
  let session = createLessonSession(lesson);
  const crossings: DriveOutcome["crossings"] = [];
  const rec = recordScriptedDrive(district(spec.map.districtId), script, {
    scenarioId: spec.id,
    kind: "mistake",
    seed: 7,
    stagedEvents: staged as never,
    ...(spec.signalModes !== undefined ? { signalModes: spec.signalModes } : {}),
    collisionMinKmh: 0,
    onTick: (tick) => {
      for (const e of tick.events) {
        if (e.kind === "stopLineCrossed" && e.control === "trafficLight") {
          crossings.push({ tSec: tick.t, controller: e.controller });
        }
      }
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);
  return {
    engineCodes: rec.ruleEvents
      .filter((e) => e.kind === "violation")
      .map((e) => ({ code: e.code, tSec: e.t })),
    sessionCodes: session.events
      .filter((e) => e.kind === "violation")
      .map((e) => (e as { code: string }).code),
    score: result.score,
    passed: result.passed,
    objectivesDone: result.objectives.map((o) => o.done),
    crossings,
  };
}

/** The audit's wrong leg, everywhere in the sweep: hold the throttle, never
 *  touch the brake. 59 км/ч is the cap the drive mode leaves it at. */
function recklessScript(exit: ReadonlyArray<readonly [number, number]>): DriveScript {
  return {
    steps: [
      { kind: "drive", points: [[LANE, SPAWN_Y], ...exit.map((p) => [p[0], p[1]] as [number, number])], targetKmh: 59 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

/** A learner who slows, stops short of the paint, lets the priority car pass
 *  and only then goes — the drive the drills are written for. */
function carefulScript(exit: ReadonlyArray<readonly [number, number]>, waitSec = 12): DriveScript {
  return {
    steps: [
      { kind: "drive", points: [[LANE, SPAWN_Y], [LANE, -45]], targetKmh: 26 },
      { kind: "drive", points: [[LANE, -45], [LANE, -29.5]], targetKmh: 10 },
      { kind: "pause", sec: waitSec, brake: true },
      { kind: "drive", points: [[LANE, -29.5], ...exit.map((p) => [p[0], p[1]] as [number, number])], targetKmh: 18 },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

describe("§2 (cont.) sc-sdead-cross IS reachable — by a drive that turns left", () => {
  it("the left turn the drill asks for completes both objectives with zero violations", () => {
    const out = drive(SC_SIGNAL_DEAD, carefulScript([[LANE, -8], [-8, LANE], [-30, LANE], [-52, LANE]]));
    expect(out.objectivesDone).toEqual([true, true]);
    expect(out.sessionCodes).toEqual([]);
    expect(out.score).toBe(0);
    expect(out.passed).toBe(true);
  });

  it("…and driving STRAIGHT — the sweep's bot, which has no steering — leaves it unmet", () => {
    // Not a defect of the objective: the drill's second task is «Премини
    // НАЛЯВО», and a car that never turns has not done it. This is the other
    // direction of the same claim, so «never ticks anywhere» cannot be read as
    // a fact about the template.
    const out = drive(SC_SIGNAL_DEAD, carefulScript([[LANE, 0], [LANE, 30], [LANE, 60]]));
    expect(out.objectivesDone[1]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §3 — sc-signal-hesitation: the 59-in-a-50 that bills nothing
// ---------------------------------------------------------------------------

describe("§3 sc-signal-hesitation — the acquittal is the coach's, not the lesson's", () => {
  const out = drive(SC_SIGNAL_HESITATION, recklessScript([[LANE, 140]]));

  it("THE FINDING, reproduced: 0 наказателни точки and not one billed mistake", () => {
    // «НЕИЗДЪРЖАН · SCORE: 0 наказателни точки · mistakes=0 · top 59 км/ч»
    // (mobile-wrong/08-debrief.png), headless.
    expect(out.sessionCodes).toEqual([]);
    expect(out.score).toBe(0);
    expect(out.passed).toBe(false);
    // …and the only reason it is НЕИЗДЪРЖАН at all is the unfinished route.
    expect(out.objectivesDone).toEqual([false, false]);
  });

  it("the detector is NOT asleep: the engine convicts the same drive at t ≈ 8.9 s", () => {
    // sxh-v1's boulevard is posted 50 and speedingBands puts второстепенна at
    // 55 and опасна at 60, so a held 59 is squarely a graded overspeed. It
    // fires; the session simply does not carry it.
    expect(out.engineCodes.map((e) => e.code)).toEqual(["SPEEDING_OVER_LIMIT"]);
    expect(out.engineCodes[0].tSec).toBeGreaterThan(6);
    expect(out.engineCodes[0].tSec).toBeLessThan(12);
  });

  it("THE CAUSE, and it is not in this file: второстепенна warns once before it grades", () => {
    // scenarios/policy.ts via coach.ts — „второстепенна warns once before
    // grading regardless of mapping". One episode in a 13 s drive is therefore
    // a teach card and nothing else, and `session.events` (what the debrief
    // and the score read) never sees it. Nothing a template authors changes
    // that: it is severity-class policy, shared by all 167 drills.
    //
    // THE PIN THAT MATTERS: the gap between the two lists. The day the coach,
    // the policy or the debrief changes, this goes red and is re-read rather
    // than staying quietly true.
    expect(out.engineCodes.length).toBe(1);
    expect(out.sessionCodes.length).toBe(0);
  });

  it("…and the drill's own code cannot cover for it: hesitation needs a standstill", () => {
    // HESITATION_AT_GREEN is the one code this template authors, and it is
    // gated on a STATIONARY car within 12 m of a green line. A drive that
    // never stops is out of its reach by construction — which is correct, and
    // is why the speeding channel above is the only one that can speak here.
    expect(SC_SIGNAL_HESITATION.mistakes?.every((m) => m.codeRefs?.includes("HESITATION_AT_GREEN"))).toBe(true);
    expect(out.engineCodes.some((e) => e.code === "HESITATION_AT_GREEN")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §4 — sc-signal-controller: the posture the briefing describes is already over
// ---------------------------------------------------------------------------

/** The dead stretch between scene mount and the student's first metre, s —
 *  MEASURED off sweep 161's own desktop frames by the sibling lane (the ghost
 *  demo transport reads 0:37 / 0:51 in `04-t001s.png`). `flipAtSec` here is 30. */
const MEASURED_PRE_DRIVE_SEC = 36;

function withDeadTime(sec: number, script: DriveScript): DriveScript {
  return { steps: [{ kind: "pause", sec, brake: true }, ...script.steps] };
}

describe("§4 sc-signal-controller — the officer's flip is spent before the drive", () => {
  const shipped = SC_SIGNAL_CONTROLLER_EVENT satisfies TrafficControllerSpec;

  it("with no dead time the mechanic works: the 59 км/ч crossing is HALTED and billed 10 т.", () => {
    const out = drive(SC_SIGNAL_CONTROLLER, recklessScript([[LANE, 60]]), [shipped]);
    expect(out.crossings).toHaveLength(1);
    expect(out.crossings[0].controller).toBe("halt");
    expect(out.crossings[0].tSec).toBeLessThan(shipped.flipAtSec!);
    expect(out.sessionCodes).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
    expect(out.score).toBe(10);
  });

  it("CURED: with the measured 36 s of briefing the SAME drive is convicted", () => {
    // WAS THE FINDING, and it read: «by 03-ready — before the student has moved
    // — it has already flipped to МИНАВАШ ТИ», mobile-right. The bubble
    // TrafficLayer paints comes off the same schedule `controllerPermission`
    // grades with, so the caption and the acquittal were one fact: instruction 3
    // («Той е с ГЪРДИ към теб») was describing a phase that ended during the
    // briefing, and a 59 км/ч run past the officer billed nothing.
    //
    // `orchestrator/runners.ts` now rebases the schedule onto the DRIVE start,
    // so the briefing's length no longer decides the verdict. Inverted here
    // rather than deleted: a defect that can no longer be reproduced is the only
    // proof the fix is real, and this row owns the measured 36 s.
    const out = drive(
      SC_SIGNAL_CONTROLLER,
      withDeadTime(MEASURED_PRE_DRIVE_SEC, recklessScript([[LANE, 60]])),
      [shipped],
    );
    expect(out.crossings).toHaveLength(1);
    expect(out.crossings[0].controller).toBe("halt");
    expect(out.sessionCodes).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
    expect(out.score).toBe(10);
  });

  it("the fix is a clock, not a constant — rebasing the flip onto the drive restores both verdicts", () => {
    // Arithmetically what `input.tSec + spec.flipAtSec` yields inside
    // TrafficControllerRunner on the first moving frame (the one-latch fix the
    // sibling lane routed at orchestrator/runners.ts). Nothing else moves, so
    // whatever this changes is the clock and only the clock. INVERT §4's
    // middle test when that latch lands.
    const rebased: TrafficControllerSpec = {
      ...shipped,
      flipAtSec: shipped.flipAtSec! + MEASURED_PRE_DRIVE_SEC,
    };
    const reckless = drive(
      SC_SIGNAL_CONTROLLER,
      withDeadTime(MEASURED_PRE_DRIVE_SEC, recklessScript([[LANE, 60]])),
      [rebased],
    );
    expect(reckless.crossings[0].controller).toBe("halt");
    expect(reckless.sessionCodes).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
    expect(reckless.score).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// §5 — the briefing numbering is contiguous from 1 IN THIS FILE
// ---------------------------------------------------------------------------

describe("§5 the «list starts at 2.» findings are not this file's data", () => {
  for (const spec of SCENARIO_TEMPLATES_SIGNALS) {
    it(`${spec.id}: instructionsBg is numbered 1..n with no gap`, () => {
      expect(spec.instructionsBg.map((s) => s.n)).toEqual(
        spec.instructionsBg.map((_, i) => i + 1),
      );
      // …and no step carries its own number in the prose, which is the other
      // way the same "2." could appear on the glass.
      for (const s of spec.instructionsBg) {
        expect(s.textBg, `${spec.id} step ${s.n}`).not.toMatch(/^\s*\d+\s*[.)]/);
      }
    });
  }

  it("the compiled briefing is renumbered 1..n too — so the split is the renderer's", () => {
    const brief = compileScenario(SC_SIGNAL_CONTROLLER, 1).briefingBg ?? [];
    expect(brief.length).toBeGreaterThan(1);
    expect(brief.map((s) => s.n)).toEqual(brief.map((_, i) => i + 1));
    expect(brief[0]!.n).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// §6 — sc-signal-hesitation: the car instruction 3 points at is where
//      instruction 3 says it is (doc 87 B40 — „who ? who is sleeping on green")
// ---------------------------------------------------------------------------

/**
 * WHY THIS SECTION EXISTS, and it is not the finding above it.
 *
 * `sc-signal-hesitation:3c0ff44f` is the wrongConvicted=NO half, and §3 shows —
 * with the two lists side by side — that its cause is severity-class policy
 * shared by all 167 drills, not this file. What §3 does NOT cover is the OTHER
 * half of the same drill, the rightCredited one the founder filed himself:
 *
 *   „it says sleeping on green but who ? who is sleeping on green yes Ok I stop
 *    on the green cyrcle but is that it ? … just that there is no traffic car."
 *
 * The repair for that was `SC_SIGNAL_HESITATION_SLEEPER` plus briefing step 3,
 * and step 3 is not scenery copy — it is six FALSIFIABLE GEOMETRIC CLAIMS made
 * to a seventeen-year-old who is about to look for a 26-px shape at 62 m:
 *
 *   «гледай ОТВЪД КРЪСТОВИЩЕТО, ВЛЯВО от твоята линия — в НАСРЕЩНАТА ЛЕНТА, на
 *    ДРУГАТА СТОП-ЛИНИЯ. Колата там е с ЛИЦЕ към теб … Брой наум до три:
 *    зеленото ѝ свети, а ТЯ НЕ ПОМРЪДВА.»
 *
 * WHAT WAS ALREADY PINNED, AND WHAT WAS NOT — corrected by the verifier,
 * 2026-08-24, because this docblock shipped saying „nothing in the repo pinned
 * one of them" and that is not true of two of the six.
 * `traffic/__tests__/staged-actor-label.test.ts` §1 already asserts
 * «отвъд кръстовището» (as the very loose `pose.y > 0`), «с ЛИЦЕ към теб»
 * (`dirY === -1`) and the ~62 m range. It does so by RE-DERIVING the hold arc
 * with its own arithmetic over the district's raw node list — so it also does
 * not exercise the production stager, and its beyond-the-junction pin would
 * credit a car parked in the middle of the box. Genuinely unpinned before this
 * section, and the reason it earns its place: the LANE-SIDE claims («ВЛЯВО от
 * твоята линия», «в насрещната лента» — no x coordinate is measured anywhere
 * else), the stop-line TIGHTNESS («на другата стоп-линия», within one car
 * length rather than merely north of the node), and «тя не помръдва», which
 * needs the actor driven and had no test at all.
 *
 * `hold.offsetM`, the path node order,
 * `armDistM` and the map’s own lane pitch are four independent knobs, three of
 * them already re-tuned once in this family’s history (the T7 27.7 m sweep, the
 * −95/−90 mis-landing 180 lines away), and a drift in any of them turns the
 * most specific sentence in the drill into a lie the student cannot detect: he
 * looks where he was told, sees nothing, and learns that the instructor’s
 * directions are not to be trusted. That is B40 returning with nobody to
 * notice, because the copy would still read perfectly.
 *
 * MEASURED HERE, through the production `TrafficSystem.stage()` and the
 * production `ScenarioDirector` — never the spec read back to itself:
 *
 *   pose            x = −4.0625, y = +29.0, dir = (0, −1), speed 0
 *   its own line    sxh-v1 derived stopLineFromNodeM = 27.73 → 1.27 m back of it
 *   the player      spawn lane x = +4.0625 → 8.125 m, one full lane pitch, LEFT
 *   release         35 км/ч: first moves at player y = −19.77, after 8.75 s of
 *                   standstill;  18 км/ч: y = −20.08 after 16.97 s. Both are
 *                   ~8 m PAST his own paint at y = −27.725, so it is still
 *                   asleep at y = −33.5, the pose the copy was written from, and
 *                   still asleep at the moment he is graded. (The template's own
 *                   note records 8.9 s / 17.1 s off a different approach
 *                   profile; the agreement is the point — nothing has drifted.)
 *
 * MUTATION RECORD — every one applied to `templates-signals.ts` itself, run, and
 * reverted; the file is byte-identical to its baseline afterwards:
 *   hold −29 → −20 (into the box):       «на другата стоп-линия» red (pose.y 20)
 *                                        AND «тя не помръдва» red (release at
 *                                        player y = −28.8, behind his own paint).
 *   pathNodes reversed (s → c → n):      four red — the car now stands in HIS
 *                                        lane (x +4.06) facing away (dirY +1).
 *   armDistM 50 → 200 (release at once): «тя не помръдва» red — moving already
 *                                        at y = −33.5, the pose the copy names.
 *   step 3 „ВЛЯВО" → „вляво":            the copy tripwire red.
 *
 * ADDED BY THE VERIFIER, 2026-08-24, same protocol (applied, run, reverted;
 * `templates-signals.ts` md5 c70940bf… before and after):
 *   hold −29 → −35 (a street back):      «на другата стоп-линия» red — 7.27 m
 *                                        back of the paint against a 4.3 m cap,
 *                                        so the tightness half has teeth too and
 *                                        not just the „north of the node" half.
 *   `staged` AND `actorLabels` removed:  ALL 31 GREEN — the gap the new wiring
 *                                        test below now closes. (Caught outside
 *                                        this file by `traffic/__tests__/
 *                                        staged-actor-label.test.ts`, 3 red.)
 *
 * AND THE FIRST TEST IS A TRIPWIRE, NOT A CLAIM. A substring check catches a
 * deletion and never a neutralisation, so it is not evidence that step 3 says
 * anything true — the five geometry tests below are. It is here for the
 * opposite failure: a rewrite of step 3 that leaves the pins measuring a
 * sentence nobody reads any more, which is how a guard outlives its subject and
 * goes on passing.
 */
/**
 * The far stop line — READ OUT OF THE DISTRICT, never copied out of it.
 *
 * (Verifier repair, 2026-08-24.) This shipped as the literal `27.73`, and a
 * literal is exactly the wrong shape for it: the sleeper is held at
 * `node − 29 m`, so if sxh-v1's carriageway were ever widened the derived
 * `stopLineFromNodeM` would move OUT past 29 and the car would stand INSIDE
 * the junction box — the mis-staging «на другата стоп-линия» exists to forbid —
 * while this section went on comparing it to the old paint and passing. The
 * sibling battery `signals-barge-conviction.test.ts` reads the same field for
 * the same reason. Same number today (27.73), so no assertion moves.
 */
const SLEEPER_STOP_LINE_M = ((): number => {
  const v = district(SC_SIGNAL_HESITATION.map.districtId).meta.scenario.derived
    ?.stopLineFromNodeM;
  if (typeof v !== "number") {
    throw new Error(
      `${SC_SIGNAL_HESITATION.map.districtId}: meta.scenario.derived.stopLineFromNodeM is missing`,
    );
  }
  return v;
})();
/** The pose the copy was written from — the template’s own note names it. */
const SLEEPER_COPY_POSE_Y = -33.5;

/**
 * Drive a scripted northbound player up the south stem through the PRODUCTION
 * director and report what the sleeper does. Ambient traffic off, so the only
 * thing on the road is the actor under test.
 */
function sleeperRun(
  sleeper: BrakingLeadCarSpec,
  cruiseKmh: number,
): {
  pose: { x: number; y: number; dirX: number; dirY: number };
  motionlessSec: number;
  releasePlayerY: number | null;
  standingAtCopyPose: boolean;
} {
  const traffic = createTrafficSystem(district(SC_SIGNAL_HESITATION.map.districtId), {
    ...DEFAULT_TRAFFIC_CONFIG,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const director = createScenarioDirector([sleeper], traffic, { seed: 7 });
  const first = traffic.staged(sleeper.id);
  if (!first) throw new Error("sleeper failed to stage");
  const pose = { x: first.x, y: first.y, dirX: first.dirX, dirY: first.dirY };
  const dt = 1 / 60;
  let y = SPAWN_Y;
  let t = 0;
  let releasePlayerY: number | null = null;
  let motionlessSec = 0;
  let standingAtCopyPose = false;
  let sawCopyPose = false;
  for (let i = 0; i < 60 * 120 && y < 0; i++) {
    y += (cruiseKmh / 3.6) * dt;
    t += dt;
    traffic.update(dt, {
      // GREEN FOR THE SLEEPER TOO, and that is the point rather than a
      // convenience. `signalPlan: greenFresh` puts the student on a live green,
      // and step 3 says «ЗЕЛЕНОТО Ѝ СВЕТИ, а тя не помръдва» — the whole lesson
      // is that this car is standing while it is ALLOWED to go. Feeding red
      // here would let a light hold the car and the section would pass while
      // proving nothing: a queue at a red teaches the opposite of JU-09.
      signalPhase: () => "green",
      playerPos: { x: LANE, y },
      playerSpeedKmh: cruiseKmh,
      playerHeadingDeg: 0,
    });
    director.step({
      tSec: t,
      dtSec: dt,
      x: LANE,
      y,
      speedKmh: cruiseKmh,
      headingDeg: 0,
      brakePedal: 0,
      tickEvents: [],
    });
    const now = traffic.staged(sleeper.id);
    if (!now) continue;
    const moving = Math.abs(now.speedMps) > 0.1;
    if (releasePlayerY === null) {
      if (moving) releasePlayerY = y;
      else motionlessSec += dt;
    }
    if (!sawCopyPose && y >= SLEEPER_COPY_POSE_Y) {
      sawCopyPose = true;
      standingAtCopyPose = !moving;
    }
  }
  return { pose, motionlessSec, releasePlayerY, standingAtCopyPose };
}

describe("§6 sc-signal-hesitation — briefing step 3 points at a car that is there", () => {
  const step3 = SC_SIGNAL_HESITATION.instructionsBg.find((s) => s.n === 3);

  it("the copy still makes the six claims this section measures", () => {
    // The pins below are worthless if the sentence they guard has been
    // rewritten — a geometry check that outlives its copy is a check on
    // nothing. Each fragment is the load-bearing half of one claim.
    expect(step3?.textBg).toContain("отвъд кръстовището");
    expect(step3?.textBg).toContain("ВЛЯВО");
    expect(step3?.textBg).toContain("насрещната лента");
    expect(step3?.textBg).toContain("стоп-линия");
    expect(step3?.textBg).toContain("ЛИЦЕ");
    expect(step3?.textBg).toContain("не помръдва");
  });

  /**
   * VERIFIER REPAIR, 2026-08-24 — the one claim §6 shipped without.
   *
   * Every other test below stages `SC_SIGNAL_HESITATION_SLEEPER` ITSELF, via
   * `createScenarioDirector([sleeper], …)`. That proves the SPEC is right and
   * says nothing about whether the shipped DRILL still contains it — which is
   * the whole of B40 („just that there is no traffic car"). Measured: comment
   * out `staged` AND `actorLabels` on SC_SIGNAL_HESITATION and all 31 tests in
   * this file stay green, i.e. §6 would have watched the founder's own defect
   * return under a section titled „points at a car that is there". (The
   * regression is caught today by `traffic/__tests__/staged-actor-label.test.ts`
   * — in another module, guarding the caption, not the geometry. A section that
   * measures the sleeper should not need a different module to notice it is
   * gone.)
   */
  it("…and the DRILL still contains it — not just the exported spec", () => {
    expect((SC_SIGNAL_HESITATION.staged ?? []).map((s) => s.id)).toContain(
      SC_SIGNAL_HESITATION_SLEEPER.id,
    );
    expect((SC_SIGNAL_HESITATION.actorLabels ?? []).map((l) => l.actorId)).toContain(
      SC_SIGNAL_HESITATION_SLEEPER.id,
    );
    // …and it survives onto the rung the student is actually handed.
    const staged = compileScenario(SC_SIGNAL_HESITATION, 1).stagedEvents ?? [];
    expect(staged.map((s) => s.id)).toContain(SC_SIGNAL_HESITATION_SLEEPER.id);
  });

  it("«отвъд кръстовището, на другата стоп-линия» — it stands back of its own paint, never in the box", () => {
    const { pose } = sleeperRun(SC_SIGNAL_HESITATION_SLEEPER, 35);
    // Beyond the junction: north of the node, and OUTSIDE the open box.
    expect(pose.y).toBeGreaterThan(SLEEPER_STOP_LINE_M);
    // …and AT that line rather than parked a street away: within one car
    // length of the paint, which is what «на другата стоп-линия» promises.
    expect(pose.y - SLEEPER_STOP_LINE_M).toBeLessThanOrEqual(4.3);
  });

  it("«ВЛЯВО от твоята линия — в насрещната лента» — one full lane pitch to the player's left", () => {
    const { pose } = sleeperRun(SC_SIGNAL_HESITATION_SLEEPER, 35);
    // The mirrored lane centre, not „somewhere left".
    expect(pose.x).toBeCloseTo(-LANE, 2);
    // Stated as the student experiences it: the gap between his own lane and
    // the car, which is the whole 8.125 m pitch. A sleeper nudged into his own
    // lane would also disable HESITATION_AT_GREEN (leadGapM ≤ 12 m is a lawful
    // reason to sit still) — the template’s own note says so at length, and this
    // is the assertion that makes that note enforceable.
    expect(LANE - pose.x).toBeCloseTo(2 * LANE, 2);
  });

  it("«с ЛИЦЕ към теб» — it faces the northbound student, so it reads as waiting and not parked", () => {
    const { pose } = sleeperRun(SC_SIGNAL_HESITATION_SLEEPER, 35);
    expect(pose.dirY).toBeLessThan(-0.99); // southbound, nose-on to a northbound car
    expect(Math.abs(pose.dirX)).toBeLessThan(0.05);
  });

  it("«Брой наум до три … тя не помръдва» — still standing at the pose the copy was written from", () => {
    // At the drill’s own graded approach pace (its objective caps 35 км/ч) and at
    // half of it — the encounter battery’s invariant, because a drill that only
    // works at one speed works for nobody.
    for (const kmh of [35, 18]) {
      const run = sleeperRun(SC_SIGNAL_HESITATION_SLEEPER, kmh);
      expect(run.standingAtCopyPose, `standing at y=${SLEEPER_COPY_POSE_Y} @ ${kmh} км/ч`).toBe(true);
      // Three seconds is the copy’s own promise, and it is the FLOOR, not the
      // measurement: the shipped numbers are 8.9 s at 35 and 17.1 s at 18.
      expect(run.motionlessSec, `motionless seconds @ ${kmh} км/ч`).toBeGreaterThanOrEqual(3);
      // …and it wakes PAST the student’s own paint, so the decision he is graded
      // on is made against a car that is still asleep.
      expect(run.releasePlayerY, `release player y @ ${kmh} км/ч`).not.toBeNull();
      expect(run.releasePlayerY as number).toBeGreaterThan(-SLEEPER_STOP_LINE_M);
    }
  });

  it("the checks are not a formality — a sleeper moved into the box, or into his lane, is caught", () => {
    // THE DIRECTION TEST. Without it every assertion above could be satisfied
    // by a check loose enough to credit any pose at all.
    const inTheBox = sleeperRun(
      {
        ...SC_SIGNAL_HESITATION_SLEEPER,
        actor: { ...SC_SIGNAL_HESITATION_SLEEPER.actor, hold: { nodeIndex: 1, offsetM: -20 } },
      },
      35,
    );
    expect(inTheBox.pose.y).toBeLessThan(SLEEPER_STOP_LINE_M); // parked in the mouth
    const hisOwnLane = sleeperRun(
      {
        ...SC_SIGNAL_HESITATION_SLEEPER,
        actor: {
          ...SC_SIGNAL_HESITATION_SLEEPER.actor,
          pathNodes: ["sx-n-s", "sx-n-c", "sx-n-n"],
          hold: { nodeIndex: 1, offsetM: -29 },
        },
      },
      35,
    );
    // Reversed: it now stands on the student’s OWN side, nose away from him —
    // «в насрещната лента» and «с ЛИЦЕ към теб» both false.
    expect(hisOwnLane.pose.x).toBeCloseTo(LANE, 2);
    expect(hisOwnLane.pose.dirY).toBeGreaterThan(0.99);
  });
});
