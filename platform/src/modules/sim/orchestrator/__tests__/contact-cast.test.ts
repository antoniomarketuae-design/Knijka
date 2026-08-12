/**
 * B84 — A CAR IS SOLID WHETHER OR NOT THE SCRIPT THINKS THIS IS THE MOMENT.
 *
 * B81 moved contact out of the runners' `step()` so a RETIRED runner could not
 * hide a crash, and pinned the invariant "a retired runner still publishes".
 * That invariant held. It held over an EMPTY SET: publication was gated on a
 * monotone `watching` latch, and `BrakingLeadCarRunner` set that latch in
 * exactly one place — inside its SLAM branch.
 *
 * 28 of the catalogue's 32 `brakingLeadCar` specs park the slam tier out of
 * reach on purpose (`minSlamSpeedKmh` 250–999, `slamAt` hundreds of metres off
 * the end of the road) because their lead drives an authored pace profile
 * instead of slamming. On every one of them the latch could never arm, so the
 * runner published nothing, ever, and the car was made of air.
 *
 * MEASURED on the shipped `sc-follow-standstill`, driving the lane into the
 * staged lead at 30 km/h: first contact 13.08 s at 29.8 km/h, minimum
 * separation −1.7675 m, 93 CONSECUTIVE OVERLAP FRAMES, and ZERO contact bodies
 * published. The sheet read FOLLOWING_TOO_CLOSE, 3 наказателни точки,
 * **passed = TRUE** — for a student who came to rest nearly two metres inside
 * another car.
 *
 * THE FIX IS NOT "ALSO LATCH IN THE OTHER BRANCH". A contract a runner has to
 * keep is weaker than a shape it cannot break, so solidity stopped being
 * something a runner says each frame. `EventRunner.contactCast` is a plain
 * readonly array — no arguments, no traffic port, no frame input — declared at
 * construction and snapshotted by the director before the first frame. There
 * is nothing left for a runner to gate, and nothing left for the director to
 * ask.
 *
 * These tests drive the production stack (createWorldRuntime +
 * createTrafficSystem + the scenario director + the rule engine) and
 * re-derive the retired latch from the SAME frames, so the defect is measured
 * rather than quoted.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { actorObb, obbSeparationM, playerObb } from "../../collision";
import type { BrakingLeadCarSpec, StagedEventSpec } from "../../contracts";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario";
import { SC_FOLLOW_STANDSTILL } from "../../lessons/scenario/templates-following";
import { buildSessionSummary, type RuleEvent } from "../../rules";
import { recordScriptedDrive, type DriveScript, type RecordedDrive } from "../../traces/recorder";
import { createTrafficSystem } from "../../traffic/system";
import type { StagedActorSpec, StagedActorView, StagedCommand, TrafficDistrict } from "../../traffic/types";
import { createScenarioDirector } from "../director";
import { createRunner } from "../runners";
import type { StagedTrafficPort } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const FO_FOLLOW = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "fo-follow-v1.json"), "utf-8"),
) as unknown;

/** fo-follow-v1 northbound lane centre — the lane the column stands in. */
const LANE_X = 4.06;
const FS_LEAD_ID = "sc-fs-lead";

function violationCodes(events: readonly RuleEvent[]): string[] {
  return events.filter((e) => e.kind === "violation").map((e) => (e as { code: string }).code);
}

/** Drive the lane at a steady speed straight into the standing column. */
function ploughScript(targetKmh: number): DriveScript {
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[LANE_X, 15], [LANE_X, 150], [LANE_X, 300]],
        targetKmh,
        stopAtEnd: false,
      },
      { kind: "pause", sec: 3, brake: true },
    ],
  };
}

function driveStandstill(script: DriveScript): RecordedDrive {
  return recordScriptedDrive(FO_FOLLOW, script, {
    scenarioId: "sc-follow-standstill",
    kind: "mistake",
    seed: 7,
    stagedEvents: [...(SC_FOLLOW_STANDSTILL.staged ?? [])] as StagedEventSpec[],
  });
}

describe("B84 — driving into the staged lead is a crash, with no slam to unlock it", () => {
  const run = driveStandstill(ploughScript(30));

  it("the drive really does end up INSIDE the other car", () => {
    // Re-measured off the same recording: the deepest interpenetration of the
    // two exact bodies. Nose-to-tail touch is 0 m of separation by definition,
    // so a negative number is metres of one car inside the other.
    const lead = { x: LANE_X, y: 290, headingDeg: 0, halfLengthM: 2.1, halfWidthM: 0.92 };
    const deepest = Math.min(
      ...run.trace.samples.map((s) => obbSeparationM(playerObb(s.x, s.y, s.headingDeg), lead)),
    );
    expect(deepest).toBeLessThan(-1);
  });

  it("grades COLLISION — the verdict the founder's sheet never carried", () => {
    expect(violationCodes(run.ruleEvents)).toContain("COLLISION");
  });

  it("and the sheet FAILS: опасна, terminated, passed = false", () => {
    const summary = buildSessionSummary(
      run.ruleEvents.filter((e) => e.kind === "violation" || e.kind === "commendation") as never[],
    );
    expect(summary.score.hasDangerous).toBe(true);
    expect(summary.terminated).toBe(true);
    expect(summary.passed).toBe(false);
    // Before B84 this same drive graded FOLLOWING_TOO_CLOSE alone: 3 points,
    // no опасна, passed = TRUE.
    expect(summary.score.totalPoints).toBeGreaterThan(3);
  });

  it("THE RETIRED LATCH, re-derived from this very drive: it could never arm", () => {
    // `watching` was set only by
    //   reachedSlamPoint && (speed >= minSlamSpeedKmh || playerGap <= proximityFallbackM)
    // and `reachedSlamPoint` by dist(actor, slamAt) <= slamRadiusM. Replay the
    // staged actor over the same script and watch how near it ever gets.
    const spec = (SC_FOLLOW_STANDSTILL.staged ?? []).find(
      (s) => s.id === FS_LEAD_ID,
    ) as BrakingLeadCarSpec;
    const traffic = createTrafficSystem(FO_FOLLOW as TrafficDistrict, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    const director = createScenarioDirector([spec], traffic, { seed: 7 });
    let nearestToSlamM = Infinity;
    for (const s of run.trace.samples) {
      traffic.update(1 / 20, {
        signalPhase: () => "green",
        playerPos: { x: s.x, y: s.y },
        playerSpeedKmh: Math.abs(s.speedKmh),
        playerHeadingDeg: s.headingDeg,
      });
      director.step({
        tSec: s.tSec,
        dtSec: 1 / 20,
        x: s.x,
        y: s.y,
        speedKmh: s.speedKmh,
        headingDeg: s.headingDeg,
        brakePedal: 0,
        tickEvents: [],
      });
      const a = traffic.staged(FS_LEAD_ID);
      if (!a) continue;
      nearestToSlamM = Math.min(
        nearestToSlamM,
        Math.hypot(a.x - spec.slamAt.x, a.y - spec.slamAt.y),
      );
    }
    // The slam point is 520 m up a 360 m road. The lead never comes remotely
    // near it, so `reachedSlamPoint` stays false for the whole session and the
    // old latch never armed — which is why nothing was ever published.
    expect(spec.minSlamSpeedKmh).toBeGreaterThan(100);
    expect(nearestToSlamM).toBeGreaterThan(spec.slamRadiusM * 50);
  });
});

describe("B84 — the shape, not the symptom", () => {
  /** Every staged spec in the shipped catalogue, base levels and stagedAdd. */
  function allStagedSpecs(): StagedEventSpec[] {
    const out: StagedEventSpec[] = [];
    for (const t of SCENARIO_TEMPLATES) {
      for (const s of t.staged ?? []) out.push(s);
      for (const lv of t.levels ?? []) {
        for (const s of (lv as { stagedAdd?: StagedEventSpec[] }).stagedAdd ?? []) out.push(s);
      }
    }
    return out;
  }

  /** A port that stages nothing — `contactCast` must not need one. */
  class DeadPort implements StagedTrafficPort {
    stage(_spec: StagedActorSpec): StagedActorView | null {
      return null;
    }
    stagedCommand(_id: string, _c: StagedCommand): void {}
    staged(_id: string): StagedActorView | null {
      return null;
    }
  }

  it("a runner's cast is readable BEFORE it is staged and BEFORE any frame", () => {
    // This is the guarantee. A per-frame callback can answer "nothing" on the
    // frame that mattered; an array that exists at construction cannot.
    for (const spec of allStagedSpecs()) {
      const runner = createRunner(spec, null);
      expect(Array.isArray(runner.contactCast), spec.id).toBe(true);
      expect(runner.phase, spec.id).toBe("idle"); // not staged, not stepped
    }
  });

  it("the cast NEVER changes — not on stage, not on step, not on resolution", () => {
    const port = new DeadPort();
    for (const spec of allStagedSpecs()) {
      const runner = createRunner(spec, null);
      const before = JSON.stringify(runner.contactCast);
      try {
        runner.stage(port, () => 0.5, false);
      } catch {
        /* a dead port fails some stagings; the cast still must not move */
      }
      runner.phase = "resolved";
      expect(JSON.stringify(runner.contactCast), spec.id).toBe(before);
    }
  });

  it("every staged VEHICLE body in the catalogue is declared, or excluded on the record", () => {
    // The four empty casts are policy, each documented at its declaration:
    // rearTailgater (a rear-end by the car behind is not the student's fault),
    // trainPass (a disclosed gap — its own wave), policeStop and
    // trafficController (standing figures the drills grade by lamps).
    const EMPTY_BY_POLICY = new Set([
      "rearTailgater",
      "trainPass",
      "policeStop",
      "trafficController",
      "amberDilemma", // no actor at all — a signal phase
      "telltaleStimulus", // no actor at all — a dashboard lamp
    ]);
    for (const spec of allStagedSpecs()) {
      const cast = createRunner(spec, null).contactCast;
      if (EMPTY_BY_POLICY.has(spec.kind)) {
        expect(cast.length, `${spec.id} (${spec.kind})`).toBe(0);
      } else {
        expect(cast.length, `${spec.id} (${spec.kind}) declares no body`).toBeGreaterThan(0);
      }
    }
  });

  it("the unreachable-slam family is real and stays counted", () => {
    // The blast radius, pinned so it cannot quietly grow back: these are the
    // specs whose lead drives a pace profile and never slams, i.e. exactly the
    // ones the retired latch could never arm for.
    const leads = allStagedSpecs().filter(
      (s): s is BrakingLeadCarSpec => s.kind === "brakingLeadCar",
    );
    const unreachable = leads.filter((s) => s.minSlamSpeedKmh >= 100);
    expect(leads.length).toBeGreaterThanOrEqual(32);
    expect(unreachable.length).toBeGreaterThanOrEqual(28);
    // …and every one of them declares a body now.
    for (const s of unreachable) {
      expect(createRunner(s, null).contactCast.length, s.id).toBe(1);
    }
  });
});

describe("B84 — a REVERSING contact is a contact", () => {
  /** One car standing dead still at the origin, facing north. */
  class StillPort implements StagedTrafficPort {
    private readonly view: StagedActorView = {
      id: "e1",
      kind: "vehicle",
      x: 0,
      y: 0,
      dirX: 0,
      dirY: 1,
      speedMps: 0,
      s: 0,
      pathLengthM: 100,
      nodeS: [0, 100],
      finished: false,
    };
    stage(_spec: StagedActorSpec): StagedActorView | null {
      return this.view;
    }
    stagedCommand(_id: string, _c: StagedCommand): void {}
    staged(_id: string): StagedActorView | null {
      return this.view;
    }
  }

  const SPEC: BrakingLeadCarSpec = {
    id: "e1",
    kind: "brakingLeadCar",
    actor: { pathNodes: ["a", "b"], hold: { nodeIndex: 0, offsetM: 0 }, cruiseSpeedMps: 5 },
    followGapM: 20,
    maxMatchSpeedMps: 12,
    slamAt: { x: 0, y: 9999 },
    slamRadiusM: 2,
    slamDecelMps2: 6,
    minSlamSpeedKmh: 250,
    proximityFallbackM: 0.3,
    triggersHazard: false,
    resumeAfterSec: 3,
  };

  /** Walk the player from 6 m short of the standing car straight through it. */
  function collisionsAt(speedKmh: number): number {
    const dir = createScenarioDirector([SPEC as StagedEventSpec], new StillPort(), { seed: 3 });
    let n = 0;
    for (let i = 0; i <= 60; i++) {
      const res = dir.step({
        tSec: i * 0.05,
        dtSec: 0.05,
        x: 0,
        y: -6 + i * 0.1,
        speedKmh,
        headingDeg: 0,
        brakePedal: 0,
        tickEvents: [],
      });
      n += res.events.filter((e) => e.kind === "collision").length;
    }
    return n;
  }

  it("the two channels disagreed about the SIGN of the speed, and one went blind", () => {
    // LessonScene feeds the director VehicleSample.speedKmh, which is SIGNED
    // (negative in reverse); the trace recorder and the clip capture feed it an
    // unsigned magnitude. The nudge floor compared the raw number, so
    // `-10 <= 2` silenced every reversing contact in the BROWSER and nowhere
    // else. Measured before the repair: 41 reports unsigned, 0 signed.
    // Contact energy is a magnitude, so the floor now reads one.
    const forward = collisionsAt(30);
    expect(forward).toBeGreaterThan(0);
    expect(collisionsAt(10)).toBe(forward); // trace convention
    expect(collisionsAt(-10)).toBe(forward); // live convention, reversing
    expect(collisionsAt(-3)).toBe(forward); // …and slowly
  });

  it("a genuine bumper KISS still opens nothing (the floor did not vanish)", () => {
    // 2 km/h is the brakingLeadCar floor; at or under it a touch is a nudge.
    expect(collisionsAt(1.5)).toBe(0);
    expect(collisionsAt(-1.5)).toBe(0);
  });
});
