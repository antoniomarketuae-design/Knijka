/**
 * LANE 10 — the PEDESTRIAN + VRU truth battery (doc 86 §9 lane 10, §10 S5).
 *
 * The founder's review turned up one shape of defect over and over in this
 * family: a drill whose GRADED contract and whose WORLD disagree. Doc 86 T11
 * is the sharpest instance — `sc-pe-parked-row-scan` collided with the child at
 * the speed its own objective demanded (18–32 km/h) and cleared, ungraded, at
 * 40–50. This file turns the four properties that were violated into
 * assertions over EVERY `pedestrianDartOut` the two families author, at the
 * template rung and at every `stagedAdd` rung, and across the director's full
 * ± 3 m trigger jitter — so the class of defect cannot be re-authored.
 *
 *   G1 STOPPABILITY          the taught corrective action must be possible
 *   G2 NEAR-SIDE SURVIVAL    obeying the cap may never be a collision (§10 S5)
 *   G3 GRADED SPEEDING       breaking the cap may never be the SAFER choice
 *   G4 OCCUPANCY HONESTY     roadFromM/roadToM are the carriageway, not a dial
 *   G5 LIGHTS DUTY           doc 86 L10 — no night/rain rung without the step
 *   G6 PLURAL COPY           doc 86 D2 — plural copy needs a plural world
 *   G7 MAP VARIETY           doc 86 D1 — the 7 PE crossings are 7 streets
 *
 * The kinematic model mirrors the shipped runtime exactly:
 * `PedestrianDartOutRunner.stage()` jitters the trigger by ± 3 m
 * (orchestrator/runners.ts), `step()` releases on the first tick the player is
 * within it and adjudicates contact at `PEDESTRIAN_CONTACT_M` = 1.5 m against
 * the walker's own position, and `traffic/staged.ts` integrates the walker as
 * pure constant-speed arc along the authored 2-point path.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PedestrianDartOutSpec, StagedEventSpec, VehicleSample } from "../../../contracts";
import { createWorldRuntime } from "../../../runtime";
import { buildWorldGeometry } from "../../../world/builders/buildWorldGeometry";
import { assertDistrict } from "../../../world/types";
import { SC_PE_JAYWALKER, SCENARIO_TEMPLATES_PE } from "../templates-pe";
import { SCENARIO_TEMPLATES_PE2 } from "../templates-pe2";
import { SCENARIO_TEMPLATES_VRU } from "../templates-vru";
import { SCENARIO_TEMPLATES_VRU2 } from "../templates-vru2";
import type { ScenarioSpec } from "../types";

const ALL: readonly ScenarioSpec[] = [
  ...SCENARIO_TEMPLATES_PE,
  ...SCENARIO_TEMPLATES_PE2,
  ...SCENARIO_TEMPLATES_VRU,
  ...SCENARIO_TEMPLATES_VRU2,
];

/** orchestrator/runners.ts PEDESTRIAN_CONTACT_M. */
const CONTACT_M = 1.5;
/** Right-lane centre of every 1+1 PE/VRU street (PERCEPTUAL lane 8.125 / 2). */
const LANE_X = 4.06;
/** Half the drawn carriageway of a 1+1 street — the true kerb line. */
const HALF_ROAD_M = 8.125;
/** Driving-school reaction + service braking used for the stoppability floor.
 *  1.0 s and 7 m/s² reproduce doc 86 T11's own "14.5 m from 32 km/h". */
const REACTION_SEC = 1.0;
const DECEL_MPS2 = 7.0;
/** The director's seeded trigger jitter (runners.ts stage()). */
const JITTERS = [-3, 0, 3] as const;

interface DartCase {
  scenario: ScenarioSpec;
  dart: PedestrianDartOutSpec;
  /** Highest reachZone speed cap on the objective chain, km/h. */
  capKmh: number;
  /** True when the walker starts on the DRIVER's side of the centreline. */
  nearSide: boolean;
}

function dartsOf(s: ScenarioSpec): PedestrianDartOutSpec[] {
  const out: PedestrianDartOutSpec[] = [];
  const push = (e: StagedEventSpec) => {
    if (e.kind === "pedestrianDartOut") out.push(e);
  };
  for (const e of s.staged ?? []) push(e);
  for (const l of s.levels) for (const e of l.stagedAdd ?? []) push(e);
  return out;
}

function approachCapKmh(s: ScenarioSpec): number {
  const caps = s.success
    .map((o) => o.params as { kind: string; maxSpeedKmh?: number })
    .filter((p) => p.kind === "reachZone" && typeof p.maxSpeedKmh === "number")
    .map((p) => p.maxSpeedKmh!);
  return caps.length > 0 ? Math.max(...caps) : 50;
}

const CASES: DartCase[] = ALL.flatMap((scenario) =>
  dartsOf(scenario).map((dart) => ({
    scenario,
    dart,
    capKmh: approachCapKmh(scenario),
    nearSide: dart.start.x > LANE_X - HALF_ROAD_M,
  })),
);

/** Longitudinal distance from the release point to the crossing, m. */
function releaseBackM(dart: PedestrianDartOutSpec, triggerM: number): number {
  const lateral = LANE_X - dart.crossing.x;
  return Math.sqrt(Math.max(triggerM * triggerM - lateral * lateral, 0));
}

/**
 * Constant-speed pass: closest approach to the walker, and whether the walker
 * is inside its authored road span the moment the car reaches the crossing.
 */
function pass(dart: PedestrianDartOutSpec, triggerM: number, vKmh: number) {
  const v = vKmh / 3.6;
  const back = releaseBackM(dart, triggerM);
  const y0 = dart.crossing.y - back;
  let minD = Infinity;
  let onRoadAtPass = false;
  let seenPass = false;
  for (let t = 0; t <= 60; t += 1 / 120) {
    const s = Math.min(dart.speedMps * t, dart.travelM);
    const wx = dart.start.x + dart.dir.x * s;
    const wy = dart.start.y + dart.dir.y * s;
    const py = y0 + v * t;
    const d = Math.hypot(LANE_X - wx, py - wy);
    if (d < minD) minD = d;
    if (!seenPass && py >= dart.crossing.y) {
      seenPass = true;
      onRoadAtPass = s >= dart.roadFromM && s <= dart.roadToM;
    }
    if (s >= dart.travelM && py > dart.crossing.y + 30) break;
  }
  return { minD, contact: minD < CONTACT_M, onRoadAtPass, back };
}

function stopDistM(kmh: number): number {
  const v = kmh / 3.6;
  return REACTION_SEC * v + (v * v) / (2 * DECEL_MPS2);
}

// ---------------------------------------------------------------------------

/**
 * G1 — EVERY COLLISION A COMPLIANT DRIVER CAN SUFFER MUST HAVE BEEN AVOIDABLE.
 *
 * This is doc 86 §10 S5 in the only form that survives contact with a dart
 * drill. A literal "constant speed at the cap must never touch the walker"
 * would outlaw the archetype: the taught answer to a dart IS the brake. What
 * may never happen is the T11 shape — the drill puts a figure in the compliant
 * driver's path CLOSER than that driver's own reaction-plus-braking distance,
 * so the instruction «реагирай веднага: спирачка» describes something the world
 * makes impossible. `sc-pe-parked-row-scan` shipped exactly that: a 14 m
 * release against 14.5 m of stopping distance at its own 32 km/h cap.
 *
 * Speeds ABOVE the cap are deliberately unbound — not being able to stop is
 * what speeding means, and G3 proves the speeder is still graded.
 */
describe("G0 — the battery has teeth: it reds on the three shipped defects", () => {
  // The exact pre-fix specs, kept as fixtures. A gate that cannot fail is not a
  // gate; these prove G1/G2/G3/G4 would have caught what the founder found.
  const OLD_PRS: PedestrianDartOutSpec = {
    id: "old-prs-child",
    kind: "pedestrianDartOut",
    crossingId: "pe-x-1",
    crossing: { x: 0, y: 78 },
    start: { x: 9.73, y: 78 },
    dir: { x: -1, y: 0 },
    speedMps: 2.6,
    travelM: 23.45,
    roadFromM: 4.0,
    roadToM: 18.0,
    triggerDistM: 14,
    minTriggerSpeedKmh: 10,
  };
  const OLD_BSH: PedestrianDartOutSpec = {
    id: "old-bsh-ped",
    kind: "pedestrianDartOut",
    crossingId: "pe-x-1",
    crossing: { x: 0, y: 88 },
    start: { x: 9.73, y: 88 },
    dir: { x: -1, y: 0 },
    speedMps: 1.4,
    travelM: 23.45,
    roadFromM: 1.6,
    roadToM: 17.85,
    triggerDistM: 44,
    minTriggerSpeedKmh: 10,
  };
  const OLD_PZL_E: PedestrianDartOutSpec = {
    ...OLD_BSH,
    id: "old-pzl-walker-e",
    crossing: { x: 0, y: 215 },
    start: { x: 9.73, y: 215 },
    speedMps: 1.0,
    triggerDistM: 26,
  };

  const unbrakeable = (d: PedestrianDartOutSpec, cap: number) => {
    for (const j of JITTERS) {
      const back = releaseBackM(d, d.triggerDistM + j);
      for (let v = 10; v <= cap; v += 1) {
        if (pass(d, d.triggerDistM + j, v).contact && back <= stopDistM(v) + 2) return true;
      }
    }
    return false;
  };
  const hitsAtCap = (d: PedestrianDartOutSpec, cap: number) =>
    JITTERS.some((j) => pass(d, d.triggerDistM + j, cap).contact);

  it("T11: the shipped sc-prs-child collided under its own cap with no room to brake", () => {
    expect(unbrakeable(OLD_PRS, 32)).toBe(true);
    // …and the speeding driver walked: at 48 km/h the walker is off the (late)
    // road span when the car reaches the crossing, so nothing could be billed.
    const fast = pass(OLD_PRS, OLD_PRS.triggerDistM, 48);
    expect(fast.contact).toBe(false);
    expect(fast.onRoadAtPass).toBe(false);
    // G4 would have refused the window outright.
    expect(Math.abs(OLD_PRS.roadFromM - (9.73 - HALF_ROAD_M))).toBeGreaterThan(2);
  });

  it("sc-bsh-ped: the shipped near-side crosser collided at exactly the graded 40 km/h cap", () => {
    expect(hitsAtCap(OLD_BSH, 40)).toBe(true);
    // …while 60 km/h cleared it. Obedience punished, speeding rewarded.
    expect(JITTERS.every((j) => !pass(OLD_BSH, OLD_BSH.triggerDistM + j, 60).contact)).toBe(true);
  });

  it("sc-pzl-walker-e: the shipped L5 walker collided at exactly the zone's 20 km/h cap", () => {
    expect(hitsAtCap(OLD_PZL_E, 20)).toBe(true);
    expect(JITTERS.every((j) => !pass(OLD_PZL_E, OLD_PZL_E.triggerDistM + j, 30).contact)).toBe(true);
  });
});

describe("G1 AVOIDABILITY — a collision at or under the cap must be brakeable (doc 86 T11)", () => {
  for (const c of CASES) {
    it(`${c.scenario.id}/${c.dart.id}: every contact at ≤ ${c.capKmh} km/h fits inside the release`, () => {
      let bound = 0;
      for (const j of JITTERS) {
        const back = releaseBackM(c.dart, c.dart.triggerDistM + j);
        for (let v = 10; v <= c.capKmh; v += 1) {
          if (!pass(c.dart, c.dart.triggerDistM + j, v).contact) continue;
          bound++;
          const need = stopDistM(v);
          expect(
            back,
            `jitter ${j}: a constant ${v} km/h — at or under the objective's own ${c.capKmh} km/h cap — ` +
              `collides, and the walker is released only ${back.toFixed(1)} m out while stopping from ` +
              `${v} km/h needs ${need.toFixed(1)} m. The lesson tells the student to brake and the ` +
              `world does not let them.`,
          ).toBeGreaterThan(need + 2);
        }
      }
      expect(bound, "diagnostic: bound speeds").toBeGreaterThanOrEqual(0);
    });
  }
});

describe("G2 NEAR-SIDE SURVIVAL — obeying the cap may never collide (doc 86 §10 S5)", () => {
  // A dart from the driver's OWN kerb crosses the driving line in ~2 s, so
  // "the student can brake" is not an available defence: the drill has to be
  // survivable at the cap on constant speed. Far-side walkers cross the whole
  // oncoming lane first (≥ 5 s of visible warning) and are graded by G3.
  for (const c of CASES.filter((x) => x.nearSide)) {
    it(`${c.scenario.id}/${c.dart.id}: clears ≥ ${CONTACT_M} m at every speed up to ${c.capKmh} km/h`, () => {
      for (const j of JITTERS) {
        for (let v = 10; v <= c.capKmh; v += 1) {
          const r = pass(c.dart, c.dart.triggerDistM + j, v);
          expect(
            r.minD,
            `jitter ${j}, ${v} km/h (cap ${c.capKmh}): closest approach ${r.minD.toFixed(2)} m — ` +
              `driving at or under the graded cap produced a COLLISION`,
          ).toBeGreaterThanOrEqual(CONTACT_M);
        }
      }
    });
  }
});

describe("G3 GRADED SPEEDING — breaking the cap is never the safer choice", () => {
  for (const c of CASES) {
    it(`${c.scenario.id}/${c.dart.id}: 1.5× the ${c.capKmh} km/h cap is still adjudicated`, () => {
      const fast = Math.round(c.capKmh * 1.5);
      for (const j of JITTERS) {
        const r = pass(c.dart, c.dart.triggerDistM + j, fast);
        expect(
          r.contact || r.onRoadAtPass,
          `jitter ${j}: at ${fast} km/h the closest approach is ${r.minD.toFixed(2)} m AND the walker ` +
            `is off the graded road span when the car reaches the crossing — the speeding driver is ` +
            `billed nothing at all (doc 86 T11's second half)`,
        ).toBe(true);
      }
    });
  }
});

describe("G4 OCCUPANCY HONESTY — roadFromM/roadToM are geometry, not a dial", () => {
  for (const c of CASES) {
    it(`${c.scenario.id}/${c.dart.id}: the road span is the real carriageway crossing`, () => {
      const kerbOffset = Math.abs(c.dart.start.x - c.dart.crossing.x);
      expect(c.dart.roadFromM, "carriageway entry arc").toBeCloseTo(kerbOffset - HALF_ROAD_M, 1);
      expect(c.dart.roadToM, "carriageway exit arc").toBeCloseTo(kerbOffset + HALF_ROAD_M, 1);
    });
  }
});

describe("G5 LIGHTS DUTY — no night/rain/fog rung without a lights step (doc 86 L10)", () => {
  const lit = (s: ScenarioSpec) =>
    s.instructionsBg.some((i) => /светлин|фаров/.test(i.textBg) && /включ|провери/.test(i.textBg));
  const dark = (s: ScenarioSpec) =>
    [s.conditions, ...s.levels.map((l) => l.conditions)].some(
      (c) => c?.night === true || (c?.weather !== undefined && c.weather !== "dry"),
    );

  for (const s of ALL.filter(dark)) {
    it(`${s.id}: instructs the headlights`, () => {
      expect(
        lit(s),
        `compiles a night/rain/fog rung, and HEADLIGHTS_OFF_AT_NIGHT / _IN_RAIN are ` +
          `unconditionally armed основна faults — a scenario may not bill a duty its own copy never states`,
      ).toBe(true);
    });
  }

  it("covers the scenarios doc 86 L10 names for this lane", () => {
    const exposed = ALL.filter(dark).map((s) => s.id).sort();
    expect(exposed).toEqual([
      "sc-crossing-rain-sprint",
      "sc-pe-night-unlit",
      "sc-pe-parked-row-scan",
      "sc-pe-school-patrol",
      "sc-vu-bikelane-turn",
      "sc-vu-blindspot-moto",
      "sc-vu-cyclist-group",
    ]);
  });
});

describe("G6 PLURAL COPY — a lesson that promises people stages people (doc 86 D2)", () => {
  const PLURAL = /Пешеходц|пешеходци|ЦЯЛАТА група|групата|хората|децата|ДВАМА/;
  for (const s of ALL) {
    const copy = [s.titleBg, s.objectiveBg, ...s.instructionsBg.map((i) => i.textBg), ...s.success.map((o) => o.titleBg)].join(" ");
    if (!PLURAL.test(copy)) continue;
    const peds = dartsOf(s);
    if (peds.length === 0) continue; // not a staged-pedestrian drill
    it(`${s.id}: plural copy, ${peds.length} staged figures`, () => {
      expect(
        peds.length,
        `the copy promises a group; the world stages ${peds.length}`,
      ).toBeGreaterThanOrEqual(2);
    });
  }
});

describe("G8 SIGNAL TRUTH — sc-pe-jaywalker's promised green is delivered (doc 86 T10)", () => {
  const REPO = path.resolve(process.cwd(), "..");
  const raw = JSON.parse(
    readFileSync(path.join(REPO, "content", "world", "pe-jay-v1.json"), "utf-8"),
  ) as unknown;
  /** The derived stop line of the southern approach (world/builders stoplines). */
  const STOP_LINE_Y = -27.725;
  const SPAWN_Y = -105;

  const sample = (y: number): VehicleSample => ({
    position: { x: 4.06, y },
    headingDeg: 0,
    speedKmh: 0,
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
  });

  it("the defect is real: on the wall clock the NS axis is RED for the whole arrival window", () => {
    const rt = createWorldRuntime(raw);
    // The junction node and the crossing are one cluster (34 m < CLUSTER_LINK_M).
    const clusters = rt.debugSignalClusters();
    expect(clusters.length).toBe(1);
    expect([...clusters[0].memberNodeIds].sort()).toEqual(["pej-x-1", "sx-n-c"]);
    // 20 km/h is the slowest plausible approach, 45 the objective's own cap:
    // 77.3 m of approach is 6.2 s to 13.9 s. Not one of them is drivable.
    let firstGreenSec: number | null = null;
    for (let t = 0; t <= 30; t += 0.5) {
      rt.update(0.5);
      rt.sample(sample(SPAWN_Y), t, false);
      const phase = rt.signalPhase("sx-n-c");
      if (phase === "green" && firstGreenSec === null) firstGreenSec = t;
      if (t <= 14) expect(phase, `t=${t}s — inside the arrival window`).toBe("red");
    }
    // Green only arrives after the last plausible arrival has already been
    // stopped at a lamp its own instruction 2 called зелен.
    expect(firstGreenSec).not.toBeNull();
    expect(firstGreenSec!).toBeGreaterThan(20);
  });

  it("the template authors the fix, and the pin arms before the stop line at every plausible speed", () => {
    const plan = SC_PE_JAYWALKER.signalPlan;
    expect(plan).toBeDefined();
    expect(plan!.arm).toBe("greenFresh");
    for (const kmh of [20, 25, 30, 35, 40, 45]) {
      const rt = createWorldRuntime(raw);
      rt.armSignalPlan(plan!, { x: 4.06, y: SPAWN_Y });
      const v = kmh / 3.6;
      let armedAtY: number | null = null;
      let phaseAtLine: string | null = null;
      for (let t = 0; t <= 40; t += 0.1) {
        const y = SPAWN_Y + v * t;
        rt.update(0.1);
        rt.sample({ ...sample(y), speedKmh: kmh }, t, false);
        if (armedAtY === null && rt.signalPhase("sx-n-c") === "green") armedAtY = y;
        if (phaseAtLine === null && y >= STOP_LINE_Y) phaseAtLine = rt.signalPhase("sx-n-c");
        if (y > 40) break;
      }
      expect(armedAtY, `${kmh} km/h: the plan never armed`).not.toBeNull();
      expect(armedAtY!, `${kmh} km/h: armed at y=${armedAtY} — must be BEFORE the stop line`).toBeLessThan(
        STOP_LINE_Y,
      );
      expect(
        phaseAtLine,
        `${kmh} km/h: the lamp at the stop line, where instruction 2 promises «Светофарът за теб е зелен»`,
      ).toBe("green");
    }
  });
});

describe("G7 MAP VARIETY — the PE crossings are seven streets, not seven copies (doc 86 D1)", () => {
  const REPO = path.resolve(process.cwd(), "..");
  const IDS = [
    "pe-clear-v1",
    "pe-slow-v1",
    "pe-rain-v1",
    "pe-dart-v1",
    "pe-bus-v1",
    "pe-child-v1",
    "pe-cane-v1",
  ];
  const load = (id: string) =>
    JSON.parse(readFileSync(path.join(REPO, "content", "world", `${id}.json`), "utf-8")) as {
      buildings: Array<{ id: string; height: number; footprint: number[][] }>;
      meta: { scenario: { streetscape?: string; params: Record<string, unknown> } };
    };

  const maps = IDS.map((id) => ({ id, d: load(id) }));

  it("every district names its own streetscape recipe", () => {
    const kinds = maps.map((m) => m.d.meta.scenario.streetscape);
    for (const k of kinds) expect(k, `streetscape missing`).toBeTruthy();
    expect(new Set(kinds).size, `streetscapes: ${kinds.join(", ")}`).toBe(IDS.length);
  });

  it("no two districts share a building layout (the founder's same-map finding)", () => {
    const sigs = maps.map((m) => ({
      id: m.id,
      sig: JSON.stringify(
        m.d.buildings.map((b) => [b.footprint.map(([x, y]) => [x, y - 0]), b.height]),
      ),
    }));
    // Normalise out the crossing-y offset so the comparison is about SHAPE.
    const shapeOnly = maps.map((m, i) => {
      const yRef = Number(m.d.meta.scenario.params.approachM);
      return {
        id: m.id,
        n: m.d.buildings.length,
        sig: JSON.stringify(
          m.d.buildings.map((b) => [b.height, b.footprint.map(([x, y]) => [x, Math.round((y - yRef) * 100) / 100])]),
        ),
        raw: sigs[i].sig,
      };
    });
    const seen = new Map<string, string>();
    for (const s of shapeOnly) {
      const clash = seen.get(s.sig);
      expect(clash, `${s.id} has the SAME building layout as ${clash}`).toBeUndefined();
      seen.set(s.sig, s.id);
    }
  });

  it("each district carries a real frontage, and it actually builds", () => {
    for (const m of maps) {
      expect(m.d.buildings.length, `${m.id} buildings`).toBeGreaterThanOrEqual(3);
      // A streetscape that does not survive the builder is decoration in the
      // JSON and nothing on screen — which is the defect this closes, not a
      // second version of it.
      const world = buildWorldGeometry(
        assertDistrict(JSON.parse(readFileSync(path.join(REPO, "content", "world", `${m.id}.json`), "utf-8"))),
        { seed: 7 },
      );
      expect(world.buildingWalls.length, `${m.id} built walls`).toBeGreaterThanOrEqual(3);
      expect(world.buildingRoofs.positions.length, `${m.id} built roofs`).toBeGreaterThan(0);
    }
  });
});
