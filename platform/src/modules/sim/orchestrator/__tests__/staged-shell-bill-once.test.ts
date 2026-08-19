/**
 * O31's OPPOSITE DIRECTION — a bigger body is not a bigger bill.
 *
 * The lane that gave staged actors their real bodies made some of them much
 * bigger: a truck's shell went from 0.92 × 2.10 m to 1.20 × 3.75 m, a tram's
 * to 1.15 × 7.00 m. A longer body means a LONGER SHUNT — more consecutive
 * frames in which the two bodies overlap — and the catastrophe this whole
 * area replaced billed 130–140 наказателни точки for a single contact against
 * an allowance of 9. So the sizing fix has to be proved harmless in the
 * billing direction as well as effective in the physics one.
 *
 * The contract is unchanged and it is not re-litigated here: the sentinel
 * reports contact EVERY FRAME the bodies overlap, by design (a rising-edge
 * latch there was explicitly rejected as "a SECOND latch"), and the rule
 * engine collapses that stream into one accident per body per encounter.
 * `contact-encounter.test.ts` owns that contract. What is new — and what this
 * file exists for — is that the stream is now much longer for the big
 * profiles, and length must not become count.
 *
 * Driven, never hand-built: the report stream comes out of the production
 * `ScenarioDirector` + `ContactSentinel`, and the count comes out of the
 * production `reduceTick`.
 */

import { describe, expect, it } from "vitest";
import type { BrakingLeadCarSpec } from "../../contracts";
import {
  createRuleEngine,
  reduceTick,
  type RuleEngineState,
  type RuleEvent,
  type SimTick,
} from "../../rules";
import { actorObb, obbSeparationM, playerObb } from "../../collision";
import {
  vehicleHalfLengthM,
  type StagedActorSpec,
  type StagedActorView,
  type StagedCommand,
  type VehicleProfile,
} from "../../traffic/types";
import { createScenarioDirector } from "../director";
import type { DirectorInput, StagedTrafficPort } from "../types";

const DT = 1 / 60;
/** The struck actor stands here facing north and never moves. */
const ACTOR_Y = 100;

function leadSpec(profile: VehicleProfile): BrakingLeadCarSpec {
  return {
    id: "o31-lead",
    kind: "brakingLeadCar",
    actor: {
      pathNodes: ["a", "b"],
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 0,
      profile,
    },
    followGapM: 20,
    maxMatchSpeedMps: 12,
    slamAt: { x: 0, y: 9999 },
    slamRadiusM: 3,
    slamDecelMps2: 6,
    minSlamSpeedKmh: 250,
    proximityFallbackM: 0.5,
    triggersHazard: false,
    resumeAfterSec: 999, // a WALL for this test: it never drives away
  } as BrakingLeadCarSpec;
}

class WallPort implements StagedTrafficPort {
  private readonly view = {
    id: "o31-lead",
    kind: "vehicle",
    x: 0,
    y: ACTOR_Y,
    dirX: 0,
    dirY: 1,
    speedMps: 0,
    s: 0,
    pathLengthM: 400,
    nodeS: [0, 400],
    finished: false,
  } as StagedActorView;
  stage(_spec: StagedActorSpec): StagedActorView | null {
    return this.view;
  }
  stagedCommand(_id: string, _c: StagedCommand): void {}
  staged(_id: string): StagedActorView | null {
    return this.view;
  }
}

interface Run {
  /** Session times of every frame the sentinel reported contact. */
  reports: number[];
  /** Longest gap inside that stream, s. */
  widestSilenceSec: number;
  accidents: number;
  minSeparationM: number;
}

/** Fold a pose script through the real director → the real rule engine. */
function run(
  profile: VehicleProfile,
  poses: ReadonlyArray<{ y: number; speedKmh: number }>,
): Run {
  const dir = createScenarioDirector([leadSpec(profile)], new WallPort(), { seed: 3 });
  let rules: RuleEngineState = createRuleEngine();
  const events: RuleEvent[] = [];
  const reports: number[] = [];
  let minSep = Number.POSITIVE_INFINITY;
  for (let i = 0; i < poses.length; i++) {
    const p = poses[i];
    const t = (i + 1) * DT;
    const input: DirectorInput = {
      tSec: t,
      dtSec: DT,
      x: 0,
      y: p.y,
      speedKmh: p.speedKmh,
      headingDeg: 0,
      brakePedal: p.speedKmh === 0 ? 1 : 0,
      tickEvents: [],
    };
    const step = dir.step(input);
    minSep = Math.min(
      minSep,
      obbSeparationM(
        playerObb(0, p.y, 0),
        actorObb({ x: 0, y: ACTOR_Y, dirX: 0, dirY: 1 }, profile),
      ),
    );
    if (step.events.some((e) => e.kind === "collision")) reports.push(t);
    const frame: SimTick = {
      t,
      speedKmh: p.speedKmh,
      maxSpeedKmh: 50,
      position: { x: 0, y: p.y },
      headingDeg: 0,
      laneOffsetM: 0,
      laneId: 0,
      indicator: "off",
      headlights: "low",
      seatbeltOn: true,
      handbrakeOn: false,
      gear: 1,
      isNight: false,
      events: step.events,
    };
    const r = reduceTick(rules, frame);
    rules = r.state;
    events.push(...r.events);
  }
  let widest = 0;
  for (let i = 1; i < reports.length; i++) {
    widest = Math.max(widest, reports[i] - reports[i - 1]);
  }
  return {
    reports,
    widestSilenceSec: widest,
    accidents: events.filter((e) => e.kind === "violation" && e.code === "COLLISION").length,
    minSeparationM: minSep,
  };
}

/** Approach at `kmh` to `stopY`, then stand still there for `holdSec`. */
function noseInAndHold(
  fromY: number,
  stopY: number,
  kmh: number,
  holdSec: number,
): Array<{ y: number; speedKmh: number }> {
  const out: Array<{ y: number; speedKmh: number }> = [];
  const stepM = (kmh / 3.6) * DT;
  for (let y = fromY; y < stopY; y += stepM) out.push({ y, speedKmh: kmh });
  for (let i = 0; i < Math.round(holdSec / DT); i++) out.push({ y: stopY, speedKmh: 0 });
  return out;
}

describe("a longer shunt is not a bigger bill", () => {
  it("120+ unbroken overlap frames against ONE truck bills ONE «ПТП»", () => {
    // Nose 0.4 m inside the truck's tail — where the profile-sized shell now
    // leaves the player (the solver holds him within centimetres of the face;
    // 0.4 m is a deliberately generous shunt) — and hold for 2 s.
    const stopY = ACTOR_Y - vehicleHalfLengthM("truck") - 2.02 + 0.4;
    const r = run("truck", noseInAndHold(ACTOR_Y - 12, stopY, 20, 2));
    // The premise, measured: the bodies really are inside each other and the
    // stream really is unbroken, so silence cannot be doing the work.
    expect(r.minSeparationM).toBeLessThan(0);
    expect(r.reports.length).toBeGreaterThanOrEqual(120);
    expect(r.widestSilenceSec).toBeLessThanOrEqual(2 * DT);
    // The bill: one.
    expect(r.accidents).toBe(1);
  });

  it("the same hold against a TRAM — a 14 m body, a much longer shunt — is still ONE", () => {
    const stopY = ACTOR_Y - vehicleHalfLengthM("tram") - 2.02 + 0.4;
    const r = run("tram", noseInAndHold(ACTOR_Y - 20, stopY, 20, 3));
    expect(r.minSeparationM).toBeLessThan(0);
    expect(r.reports.length).toBeGreaterThanOrEqual(180);
    expect(r.accidents).toBe(1);
  });

  it("and the count is not stuck at one: separate, then strike again, bills TWO", () => {
    // THE MUTATION FOR THE ASSERTION ABOVE. "Always 1" would satisfy both of
    // those tests and would also be a broken engine — a student who crashes
    // twice must be billed twice. Here the bodies genuinely come apart (a
    // reverse well clear of the truck) before the second hit.
    const stopY = ACTOR_Y - vehicleHalfLengthM("truck") - 2.02 + 0.4;
    const script = [
      ...noseInAndHold(ACTOR_Y - 12, stopY, 20, 0.5),
      // Reverse 4 m clear, wait past the engine's separation window, hit again.
      ...(() => {
        const out: Array<{ y: number; speedKmh: number }> = [];
        const stepM = (10 / 3.6) * DT;
        for (let y = stopY; y > stopY - 4; y -= stepM) out.push({ y, speedKmh: -10 });
        for (let i = 0; i < Math.round(2 / DT); i++) out.push({ y: stopY - 4, speedKmh: 0 });
        for (let y = stopY - 4; y < stopY; y += stepM) out.push({ y, speedKmh: 10 });
        return out;
      })(),
      ...Array.from({ length: 60 }, () => ({ y: stopY, speedKmh: 0 })),
    ];
    const r = run("truck", script);
    expect(r.widestSilenceSec).toBeGreaterThan(1.2); // the bodies were apart
    expect(r.accidents).toBe(2);
  });
});
