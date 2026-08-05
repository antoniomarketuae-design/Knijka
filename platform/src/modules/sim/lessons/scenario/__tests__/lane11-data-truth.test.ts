/**
 * LANE 11 — the data-truth gate for the CONDITIONS / FOLLOWING / LANES families
 * (doc 86 §2 T13 T15 T17 T18, §3 B8, §4 L10, §5 D3 D4).
 *
 * Every assertion here exists because the founder hit the defect in the cockpit
 * and could not tell the simulator was wrong. They are grouped by ledger id and
 * each one states the number it is defending, so a future author who moves a
 * gap or a cap sees WHICH lesson they just re-broke and by how much.
 *
 * The T18 block is not a static read of the templates: it replays the committed
 * shadow and mistake tapes through the production recorder — the same stack the
 * trace gates use — and measures the TIME gap the rule engine actually sees.
 * That is the only honest way to check a following drill, because the metric gap
 * is the product of the staged rig, the player's own acceleration and the
 * runner's release logic, none of which a template literal shows.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "@/modules/sim/rules";
import { compileScenario } from "../compile";
import { recordScFoBrakelightChainDrive } from "@/modules/sim/traces/scFoBrakelightChain";
import { recordScFoMotorwayGapDrive } from "@/modules/sim/traces/scFoMotorwayGap";
import { recordScFollowDistanceDrive } from "@/modules/sim/traces/scFollowDistance";
import { recordScFollowRainGapDrive } from "@/modules/sim/traces/scFollowRainGap";
import { recordScFollowTruckDrive } from "@/modules/sim/traces/scFollowTruck";
import { recordScOvCrossingOvertakeDrive } from "@/modules/sim/traces/scOvCrossingOvertake";
import type { RecordedDrive } from "@/modules/sim/traces/recorder";
import type { SimTick } from "@/modules/sim/rules";
import { SCENARIO_TEMPLATES_CONDITIONS } from "../templates-conditions";
import { SCENARIO_TEMPLATES_CONDITIONS2 } from "../templates-conditions2";
import { SCENARIO_TEMPLATES_FLOW } from "../templates-flow";
import { SCENARIO_TEMPLATES_FOLLOWING } from "../templates-following";
import { SCENARIO_TEMPLATES_FOLLOWING2 } from "../templates-following2";
import { SC_MW_EMERGENCY_LANE, SCENARIO_TEMPLATES_LANES } from "../templates-lanes";
import { SC_OV_CREST_CURVE, SC_OV_SOLID_RETURN, SCENARIO_TEMPLATES_LANES2 } from "../templates-lanes2";
import { SCENARIO_TEMPLATES_LANES3 } from "../templates-lanes3";
import { SCENARIO_TEMPLATES_MERGING } from "../templates-merging";
import { SCENARIO_TEMPLATES_MERGING2 } from "../templates-merging2";
import type { ScenarioSpec } from "../types";

const REPO_ROOT = path.resolve(__dirname, "../../../../../../..");
function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

/** The nine template files lane 11 owns, as one list. */
const LANE_11: readonly ScenarioSpec[] = [
  ...SCENARIO_TEMPLATES_LANES,
  ...SCENARIO_TEMPLATES_LANES2,
  ...SCENARIO_TEMPLATES_LANES3,
  ...SCENARIO_TEMPLATES_FOLLOWING,
  ...SCENARIO_TEMPLATES_FOLLOWING2,
  ...SCENARIO_TEMPLATES_CONDITIONS,
  ...SCENARIO_TEMPLATES_CONDITIONS2,
  ...SCENARIO_TEMPLATES_MERGING,
  ...SCENARIO_TEMPLATES_MERGING2,
  ...SCENARIO_TEMPLATES_FLOW,
];

// ---------------------------------------------------------------------------
// T18 — a lawful follow may not be convicted, and the fault must stay reachable
// ---------------------------------------------------------------------------

/**
 * The engine's own fire line, in SECONDS, read off the shipped config rather
 * than copied: `FOLLOWING_TOO_CLOSE` fires when
 * `leadGapM < (v/3.6) × followSafeSeconds × followFireRatio`, i.e. when the
 * time gap drops under `followSafeSeconds × followFireRatio`. 1.8 × 0.7 = 1.26 s.
 */
const FIRE_LINE_SEC = DEFAULT_RULE_CONFIG.followSafeSeconds * DEFAULT_RULE_CONFIG.followFireRatio;

/** Minimum time gap the drive ever shows while the detector is ARMED (the
 *  detector is disarmed below followMinSpeedKmh, so ticks under it cannot
 *  convict and must not be counted against the drill). */
function minArmedTimeGapSec(drive: RecordedDrive, ticks: SimTick[]): number {
  void drive;
  let min = Infinity;
  for (const tick of ticks) {
    if (tick.leadGapM === undefined || !Number.isFinite(tick.leadGapM)) continue;
    if (tick.speedKmh < DEFAULT_RULE_CONFIG.followMinSpeedKmh) continue;
    const gapSec = tick.leadGapM / (tick.speedKmh / 3.6);
    if (gapSec < min) min = gapSec;
  }
  return min;
}

type Recorder = (
  district: unknown,
  name: string,
  extra?: { onTick?: (t: SimTick) => void },
) => RecordedDrive;

function replay(rec: Recorder, districtId: string, name: string) {
  const ticks: SimTick[] = [];
  const drive = rec(loadDistrict(districtId), name, { onTick: (t) => ticks.push(t) });
  return {
    minTimeGapSec: minArmedTimeGapSec(drive, ticks),
    codes: [...new Set(drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code))],
  };
}

/**
 * One row per gap drill: the shadow that must NOT be convicted, and the demo
 * that must be. `shadowFloorSec` is the margin this drill is contracted to
 * hold over the 1.26 s fire line — deliberately per-drill, because the wet
 * drill's own detector fires at 2.02 s (× followRainSecondsFactor 1.6) and the
 * motorway drill teaches a literal two seconds.
 */
const GAP_DRILLS = [
  {
    id: "sc-follow-distance",
    districtId: "fo-follow-v1",
    rec: recordScFollowDistanceDrive as unknown as Recorder,
    shadow: "shadow-correct",
    // BEFORE (matchPlayer, followGapM 13): the drill pinned 8.9 m of bumpers, so
    // the fire threshold was 25.4 km/h and the shadow drove 25.9 — INSIDE the
    // band, saved only by followSustainSec. Measured now: 2.60 s.
    shadowFloorSec: 2.3,
    guiltyDemo: "mistake-tailgate",
    guiltyCode: "FOLLOWING_TOO_CLOSE",
  },
  {
    id: "sc-follow-truck",
    districtId: "fo-follow-v1",
    rec: recordScFollowTruckDrive as unknown as Recorder,
    shadow: "shadow-correct",
    // The truck shadow never exceeds followMinSpeedKmh, so the detector is
    // disarmed for its whole drive and minArmedTimeGapSec is Infinity. That is
    // a pass, and the meaningful assertion for this drill lives in the static
    // handover-gap block below.
    shadowFloorSec: 2.5,
    guiltyDemo: "mistake-tailgate",
    guiltyCode: "FOLLOWING_TOO_CLOSE",
  },
  {
    id: "sc-follow-rain-gap",
    districtId: "fo-follow-v1",
    rec: recordScFollowRainGapDrive as unknown as Recorder,
    shadow: "shadow-correct",
    // BEFORE: 1.30 s — 0.04 s over the base fire line, and well UNDER this
    // template's own wet line of 2.02 s, on the drill that teaches «поне 3
    // секунди при мокър път». Measured now: 3.35 s.
    shadowFloorSec: 3.0,
    guiltyDemo: "mistake-dry-habit",
    guiltyCode: "FOLLOWING_TOO_CLOSE_FOR_RAIN",
  },
  {
    id: "sc-fo-brakelight-chain",
    districtId: "fo-brake-v1",
    rec: recordScFoBrakelightChainDrive as unknown as Recorder,
    shadow: "shadow-correct",
    // BEFORE: 1.81 s, and the convicted demo rode the SAME 13.0 m of bumpers —
    // shadow and mistake separated by the speedometer alone. Now: 2.78 s.
    shadowFloorSec: 2.5,
    guiltyDemo: "mistake-bumper-stare",
    guiltyCode: "FOLLOWING_TOO_CLOSE",
  },
  {
    id: "sc-fo-motorway-gap",
    districtId: "mw-v1",
    rec: recordScFoMotorwayGapDrive as unknown as Recorder,
    shadow: "shadow-correct",
    // Unchanged by this lane, and asserted so the ledger's claim stays checked:
    // T18 called this drill's fault UNREACHABLE (fires above 205 km/h). It is
    // not — the band saturates at maxMatchSpeedMps 34, the real gap collapses to
    // ~46 m, and the demo grades. Measured: shadow 2.10 s, demo 1.15 s.
    shadowFloorSec: 2.0,
    guiltyDemo: "mistake-one-second",
    guiltyCode: "FOLLOWING_TOO_CLOSE",
  },
  {
    id: "sc-ov-crossing-overtake",
    districtId: "ov-crossing-v1",
    rec: recordScOvCrossingOvertakeDrive as unknown as Recorder,
    shadow: "shadow-correct",
    // BEFORE: 1.86 s on a чл. 119 drill that must grade OVERTAKING_AT_CROSSING
    // and nothing else, with its own approach gate authorising 55 km/h against
    // a following threshold of 34.0. Now: 2.37 s, gate capped at 30.
    shadowFloorSec: 2.2,
    guiltyDemo: "mistake-overtake-in-zone",
    guiltyCode: "OVERTAKING_AT_CROSSING",
  },
] as const;

describe("T18 — a lawful follow is never convicted (founder item 48)", () => {
  for (const drill of GAP_DRILLS) {
    it(`${drill.id}: the shadow holds ≥ ${drill.shadowFloorSec}s and is billed nothing`, () => {
      const r = replay(drill.rec, drill.districtId, drill.shadow);
      expect(r.minTimeGapSec, `${drill.id} shadow time gap`).toBeGreaterThanOrEqual(
        drill.shadowFloorSec,
      );
      expect(r.minTimeGapSec).toBeGreaterThan(FIRE_LINE_SEC);
      expect(r.codes).toEqual([]);
    });

    it(`${drill.id}: …and the fault is still REACHABLE — ${drill.guiltyDemo} grades ${drill.guiltyCode}`, () => {
      // The other half of T18. Raising a gap until nothing can ever fire is not
      // a fix, it is a deleted lesson: „unreachable on a fifth" is listed in the
      // ledger as a defect in its own right.
      const r = replay(drill.rec, drill.districtId, drill.guiltyDemo);
      expect(r.codes).toContain(drill.guiltyCode);
    });
  }
});

// ---------------------------------------------------------------------------
// T17 — the gap drills grade a gap the student can change
// ---------------------------------------------------------------------------

/** Leads that deliberately KEEP the rubber band, with the reason. Lane 7's own
 *  contract: scheduledCruise is for drills that grade a GAP; a cutter that must
 *  stay abeam, a blind-spot pace car or a scripted queue wants the band. */
const BAND_BY_DESIGN: Readonly<Record<string, string>> = {
  "sc-fbc-mid": "the queue must hold its shape — the stimulus is a slam two cars ahead",
  "sc-fbc-head": "same chain",
  "sc-ovc-lead": "the car being illegally passed — the demos' cut-back needs it pinned",
};

/**
 * The static half of T18, and the only meaningful check for sc-follow-truck:
 * its shadow never exceeds followMinSpeedKmh, so the detector is disarmed for
 * the whole tape and a replay proves nothing. What CAN be proved is the
 * handover gap — the metres between the spawn and the lead's hold pose, before
 * anyone has touched a pedal. On fo-follow-v1 the spawn is (4.06, 15) and the
 * fo-n-start → fo-n-end arc IS y, so the gap is `hold.offsetM − 15`.
 *
 * `bumperSubtrahendM` (traffic/system.ts) is what the detector subtracts:
 * 4.1 m for a car, and for a truck `max(4.1, PLAYER_HALF 2.05 + TRUCK_HALF
 * 3.75) = 5.8`. The jitter is `±2` m for brakingLeadCar (runners.ts stage()).
 */
const HANDOVER = [
  { id: "sc-follow-distance", leadId: "sc-fd-lead", sub: 4.1, postedKmh: 50 },
  { id: "sc-follow-truck", leadId: "sc-ft-lead", sub: 5.8, postedKmh: 50 },
  { id: "sc-follow-rain-gap", leadId: "sc-fr-lead", sub: 4.1, postedKmh: 50 },
] as const;

describe("T18 (static) — the handover gap alone cannot convict at the posted limit", () => {
  for (const h of HANDOVER) {
    it(`${h.id}: the fire threshold at the spawn gap clears ${h.postedKmh} km/h`, () => {
      const spec = LANE_11.find((s) => s.id === h.id)!;
      const lead = (spec.staged ?? []).find((e) => e.id === h.leadId)!;
      if (lead.kind !== "brakingLeadCar") throw new Error("expected a brakingLeadCar");
      const centreGapM = lead.actor.hold.offsetM - 15; // fo-follow-v1 spawn arc
      const worstLeadGapM = centreGapM - 2 /* seeded jitter */ - h.sub;
      const fireAboveKmh = (worstLeadGapM / FIRE_LINE_SEC) * 3.6;
      expect(fireAboveKmh, `${h.id} fires above`).toBeGreaterThan(h.postedKmh);
      // …and the lead's own cruise must itself be lawful, or "match the car in
      // front" would be an instruction to speed.
      const paceKmh = (lead.paceSpeedMps ?? lead.actor.cruiseSpeedMps) * 3.6;
      expect(paceKmh).toBeLessThanOrEqual(h.postedKmh);
      // …and the scheduledCruise release distance must cover the handover gap,
      // or the lead never pulls away and the drill is a queue behind a statue.
      expect(lead.followGapM + 12).toBeGreaterThanOrEqual(centreGapM);
    });
  }
});

describe("T17 — the FOLLOWING drills' leads drive their own arc", () => {
  it("sc-follow-distance / sc-follow-truck / sc-follow-rain-gap all declare scheduledCruise", () => {
    for (const id of ["sc-follow-distance", "sc-follow-truck", "sc-follow-rain-gap"]) {
      const spec = LANE_11.find((s) => s.id === id)!;
      const lead = (spec.staged ?? []).find((e) => e.kind === "brakingLeadCar");
      expect(lead, id).toBeDefined();
      expect(lead && "paceMode" in lead ? lead.paceMode : undefined, id).toBe("scheduledCruise");
    }
  });

  it("every lead that keeps matchPlayer in these families is a listed, reasoned exception", () => {
    const banded: string[] = [];
    for (const spec of LANE_11) {
      for (const ev of spec.staged ?? []) {
        if (ev.kind !== "brakingLeadCar" && ev.kind !== "cutInLeadCar") continue;
        const gap = ev.kind === "brakingLeadCar" ? ev.followGapM : ev.paceAheadM;
        if (gap <= 0) continue; // a NEGATIVE gap paces BEHIND — a tailgater, not a lead
        if (ev.paceMode === "scheduledCruise") continue;
        banded.push(ev.id);
      }
    }
    // Everything still on the band that this lane has audited is either listed
    // above or is an overtake-corridor / conditions actor outside T18's scope —
    // this assertion pins the COUNT so a new matchPlayer gap drill cannot be
    // added silently.
    for (const id of Object.keys(BAND_BY_DESIGN)) expect(banded, id).toContain(id);
    // 20 → 19 (B70 / FR-51): `sc-fs-lead`, sc-follow-standstill's queue tail,
    // left the band. It used to be a PROP — `armDistM: 3`, i.e. a car that
    // could only ever arm on bumper contact — parked at y = 290 while the
    // student drove 266 m of empty street to reach it. It is now the car that
    // ARRIVES at the back of the column under `scheduledCruise` + a
    // `paceProfile`, so the approach is a following exercise and the count of
    // banded leads falls by exactly one. This number may only go DOWN for a
    // reason written next to it.
    expect(banded.length).toBe(19);
  });
});

// ---------------------------------------------------------------------------
// T15 — sc-mw-emergency-lane's broken-down car exists in the live world
// ---------------------------------------------------------------------------

describe("T15 — the emergency lane has a car in it", () => {
  it("stages a body on the emergency lane at the coordinate the copy narrates", () => {
    const staged = SC_MW_EMERGENCY_LANE.staged ?? [];
    const breakdown = staged.find((e) => e.id === "sc-mwe-breakdown");
    expect(breakdown, "sc-mw-emergency-lane must stage the stalled car").toBeDefined();
    if (!breakdown || breakdown.kind !== "brakingLeadCar") throw new Error("wrong kind");
    // The mw-e-nb edge runs (0,0) → (0,1000), so the path arc IS y; the default
    // lane resolution of a 3-lane oneway is the curb lane = meta.laneEmergencyX.
    expect(breakdown.actor.hold.offsetM).toBe(780);
    expect(breakdown.actor.extraRightOffsetM ?? 0).toBe(0);
    // …and it must be incapable of moving or of emitting a grading event.
    expect(breakdown.armDistM).toBe(0); // a distance is never ≤ 0 ⇒ never armed
    expect(breakdown.paceSpeedMps).toBe(0);
    expect(breakdown.actor.cruiseSpeedMps).toBe(0);
    const d = loadDistrict("mw-v1") as { meta: { scenario: { laneEmergencyX: number } } };
    expect(d.meta.scenario.laneEmergencyX).toBeCloseTo(8.13, 2);
  });

  it("the copy that narrates it is still there (a body with no lesson is dressing)", () => {
    const steps = SC_MW_EMERGENCY_LANE.instructionsBg.map((s) => s.textBg).join(" ");
    expect(steps).toMatch(/аварирал/);
  });
});

// ---------------------------------------------------------------------------
// B8 — the safest legal choice completes the lesson
// ---------------------------------------------------------------------------

describe("B8 — no lesson is completable only by overtaking", () => {
  const cases = [
    {
      spec: SC_OV_CREST_CURVE,
      objectiveId: "sc-ovcc-pass",
      districtId: "ov-crest-v1",
      axis: "y" as const,
    },
    {
      spec: SC_OV_SOLID_RETURN,
      objectiveId: "sc-ovsr-pass",
      districtId: "ov-solid2-v1",
      axis: "x" as const,
    },
  ];
  for (const c of cases) {
    it(`${c.spec.id}: ${c.objectiveId} is satisfiable from the OWN lane as well as the oncoming bank`, () => {
      const obj = c.spec.success.find((o) => o.id === c.objectiveId)!;
      const p = obj.params as { x: number; y: number; radiusM: number };
      const d = loadDistrict(c.districtId) as {
        meta: { scenario: Record<string, number | undefined> };
      };
      const sc = d.meta.scenario;
      // Own-lane centre and the committed-pass line on the oncoming bank, read
      // from the district — never from the template (the L7 copy law).
      const own = c.axis === "y" ? sc.exitLaneY! : 4.06;
      const out = c.axis === "y" ? sc.exitOncomingLaneY! : -2.5;
      const centre = c.axis === "y" ? p.y : p.x;
      expect(Math.abs(centre - own), "own lane must be inside the gate").toBeLessThan(p.radiusM);
      expect(Math.abs(centre - out), "the pass line must be inside the gate").toBeLessThan(
        p.radiusM,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// L10 — a lesson may not bill an основна lights fault for a duty it never states
// ---------------------------------------------------------------------------

describe("L10 — every night / rain / fog rung states the lights duty", () => {
  /**
   * Reads the COMPILED briefing per rung (2026-08-02), not the template's
   * `instructionsBg`. The old predicate consulted a field `compileScenario`
   * dropped and nothing rendered — writing into it satisfied the check while
   * the student was told nothing, which is how eighteen scenarios „closed" a
   * lights fault that still fires. `lesson.briefingBg` is what LessonPlayShell
   * puts on the glass, and `world/referents.ts` L10 reads the same array.
   */
  it("no rung in these nine files compiles a lights condition without a lights instruction", () => {
    const misses: string[] = [];
    for (const spec of LANE_11) {
      for (const level of spec.levels) {
        const lesson = compileScenario(spec, level.level);
        const env = lesson.environment;
        const needsLights = env?.timeOfDay === "night" || env?.rain === true || env?.fog === true;
        if (!needsLights) continue;
        const saysLights = (lesson.briefingBg ?? []).some((s) => /светлин|фаров/i.test(s.textBg));
        if (!saysLights) misses.push(`${spec.id}@L${level.level} ${JSON.stringify(env)}`);
      }
    }
    // HEADLIGHTS_OFF_AT_NIGHT (основна) and HEADLIGHTS_OFF_IN_RAIN are armed by
    // the compiled environment with no config gate, and the L4 rungs hand the
    // student a COLD car — so on those rungs the lamps are off at t = 0 and the
    // fault is real. 18 rungs across 15 scenarios used to be here.
    expect(misses).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D3 / D4 / T13 — the small ones, each defending one number or one word
// ---------------------------------------------------------------------------

describe("D3 / D4 / T13 — the gates say what they mean", () => {
  it("D3 sc-ov-narrow: «изчакай» is graded as a STOP, not as 30 km/h", () => {
    const spec = LANE_11.find((s) => s.id === "sc-ov-narrow")!;
    const wait = spec.success.find((o) => o.id === "sc-ovn-wait")!;
    const p = wait.params as { maxSpeedKmh?: number };
    expect(p.maxSpeedKmh).toBeLessThanOrEqual(6);
  });

  it("D4 sc-ov-being-overtaken: the hidden 75 km/h ceiling is on screen", () => {
    const spec = LANE_11.find((s) => s.id === "sc-ov-being-overtaken")!;
    const hold = spec.success.find((o) => o.id === "sc-ovbo-hold")!;
    const cap = (hold.params as { maxSpeedKmh?: number }).maxSpeedKmh!;
    const copy = [hold.titleBg, ...spec.instructionsBg.map((s) => s.textBg)].join(" ");
    expect(copy).toContain(String(cap));
  });

  it("T13 sc-ov-oneway: the one-way mouth sign is cited as В1, never В2", () => {
    const spec = LANE_11.find((s) => s.id === "sc-ov-oneway")!;
    const studentFacing = [
      spec.objectiveBg,
      ...spec.instructionsBg.map((s) => s.textBg),
      spec.teach.whenBg,
      spec.teach.whyBg,
      spec.teach.examinerBg,
    ].join(" ");
    expect(studentFacing).toContain("В1");
    // В2 may only appear where it is explicitly distinguished from В1 — the
    // signs bank is authoritative: В1 = „Забранено е влизането на пътни превозни
    // средства" (the exit of a one-way), В2 = „…в двете посоки".
    const b2 = studentFacing.match(/В2[^.]*/g) ?? [];
    for (const mention of b2) expect(mention).toMatch(/двете посоки|ДВЕТЕ посоки/);
  });
});
