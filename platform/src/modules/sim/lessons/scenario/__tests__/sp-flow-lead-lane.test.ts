/**
 * THE LAP — sc-speed-dangerous's pace car may never be the striker.
 *
 * Finding sc-speed-dangerous:e8414c56 (critical). Photographed on both
 * platforms: a drive that held a cautious pace under the posted 50 while the
 * flow went by returns НЕИЗДЪРЖАН, 10 наказателни точки, ★☆☆ and exactly one
 * опасна грешка — «Удар в друго превозно средство» — with both route objectives
 * ticked. Frames:
 *   .audit-frames/wave-c/frames/sc-speed-dangerous__pc-right/08-debrief.png
 *   .audit-frames/proof/frames/sc-speed-dangerous__{pc,mobile}-right/
 *
 * The full mechanism is written at `SPD_FLOW_LEAD` in templates-sp.ts. The
 * short form: the pace car clears a 360 m road in ~21 s, FR-B5-RETURN
 * re-enters it at its own hold pose — behind a student who has driven on —
 * „under the command it left with", and that command is a `matchPlayer` band
 * with a 400 m station, which is SIGN-BLIND and therefore orders maximum
 * closing speed from behind him as readily as in front. The staged-traffic
 * player guard opens 16 m out, aims to stop 6 m short and brakes at 8 m/s², so
 * it can arrest ≈12.6 m/s; the car arrives at 17. `BrakingLeadCarRunner`
 * publishes a `contactCast` billed to the player, so the rear-end is booked
 * against the victim — while the лепка sitting on the same bumper is innocent
 * by its own runner's explicit policy («billing it here would convict the
 * victim»).
 *
 * WHAT THIS FILE PINS. Not „no collisions" — that is satisfiable by deleting
 * the actor, and this drill's whole redesign (doc 62 #31) is the presence of a
 * flow. Three things together:
 *
 *   §1 the pace car rides ONE FULL LANE off the student's line, at the map's
 *      own lane pitch, on EVERY frame of a long drive — scripted run and
 *      return runs alike;
 *   §2 the exposure is REAL and still happens: on the sweep's own stop-go
 *      control law the car does come back BEHIND him and does close on him;
 *   §3 and it still never touches him, on that law and at every steady lawful
 *      pace — zero `collision` events, zero violations, for a student doing
 *      exactly what the briefing asks.
 *
 * §2 is what keeps §3 from going green vacuously. Remove the actor, or make it
 * unable to lap, and §2 fails and names its own replacement.
 *
 * WATCHED RED: with `extraRightOffsetM: 0` restored on SPD_FLOW_LEAD (the
 * shipped value before this repair) §1 fails at 0.00 m of lateral separation
 * and §3 fails with 44 booked contact frames, first at t = 84.3 s, player at
 * y = 155.4 doing 2.1 км/ч, actorId `sc-dng-flow-lead`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../../runtime";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict } from "../../../traffic/types";
import { createRuleEngine } from "../../../rules";
import { createScenarioDirector } from "../../../orchestrator/director";
import { DT, stepFrame, type Stack } from "../../../orchestrator/__tests__/helpers";
import type { BrakingLeadCarSpec, StagedEventSpec } from "../../../contracts";
import { SC_SPEED_DANGEROUS } from "../templates-sp";

const REPO_ROOT = join(process.cwd(), "..");

interface DistrictJson {
  meta?: { scenario?: { laneCenterRightM?: number; laneCenterLeftM?: number } };
}

const RAW = JSON.parse(
  readFileSync(
    join(REPO_ROOT, "content", "world", `${SC_SPEED_DANGEROUS.map.districtId}.json`),
    "utf-8",
  ),
) as TrafficDistrict & DistrictJson;

/** The map's own lane centres — the copies in templates-sp.ts are pinned here. */
const LANE_RIGHT = RAW.meta!.scenario!.laneCenterRightM!;
const LANE_LEFT = RAW.meta!.scenario!.laneCenterLeftM!;
const LANE_PITCH = LANE_RIGHT - LANE_LEFT;

const LEAD_ID = "sc-dng-flow-lead";
const PASSER_ID = "sc-dng-flow-passer";

/** The route's last objective — where the session is over. */
const FINISH_Y = Math.max(
  ...SC_SPEED_DANGEROUS.success.map((o) =>
    o.params.kind === "reachZone" ? o.params.y : Number.NEGATIVE_INFINITY,
  ),
);

/** ov-keepright-v1 wired exactly as the orchestrator battery wires district-v1:
 *  same query hookups, ambient traffic zeroed so the staged flow is the only
 *  other road user (the determinism law — seed 7, ambient 0). */
function makeStack(events: StagedEventSpec[]): Stack {
  const runtime = createWorldRuntime(RAW);
  const traffic = createTrafficSystem(RAW, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r) =>
    traffic.conflictFromRight(jx, jy, px, py, h, r),
  );
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
    traffic.circulatingConflict(cx, cy, px, py, h, r),
  );
  runtime.setCyclistQuery((px, py, h, r) => traffic.cyclistNear(px, py, h, r));
  runtime.setOvertakenQuery((px, py, h, r) => traffic.overtakenNear(px, py, h, r));
  return {
    runtime,
    traffic,
    director: createScenarioDirector(events, traffic, { seed: 7, signals: runtime }),
    rules: createRuleEngine(),
    ruleEvents: [],
    ticks: [],
    outcomes: [],
    t: 0,
  };
}

interface Leg {
  /** Every contact the sentinel booked, with the body it was booked against. */
  contacts: { actorId: string; tSec: number; playerY: number; playerKmh: number }[];
  violationCodes: string[];
  /** Smallest |Δx| between the player's line and the lead, m. */
  leadMinLateralM: number;
  /** Smallest centre-to-centre separation from the lead, m. */
  leadMinSepM: number;
  /** Was the lead ever BEHIND the player and getting closer? (the exposure) */
  leadClosedFromBehind: boolean;
  /** How close the lead ever got while behind him, m of arc. */
  leadNearestFromBehindM: number;
  finalY: number;
}

/**
 * Drive north up the RIGHT lane — the lane this drill's own objective pins
 * (radius 6 < the lane pitch) — under a control law of the caller's choosing,
 * and watch what the flow does to a student who obeys the briefing.
 */
function drive(
  law: (tSec: number) => number,
  seconds: number,
  events: StagedEventSpec[] = SC_SPEED_DANGEROUS.staged as StagedEventSpec[],
): Leg {
  const stack = makeStack(events);
  let y = 15; // ov-kr-spawn-start
  let v = 0;
  const leg: Leg = {
    contacts: [],
    violationCodes: [],
    leadMinLateralM: Infinity,
    leadMinSepM: Infinity,
    leadClosedFromBehind: false,
    leadNearestFromBehindM: Infinity,
    finalY: y,
  };
  let prevBehindM = Infinity;
  for (let i = 0; i < Math.round(seconds / DT) && y < FINISH_Y; i++) {
    const target = law(stack.t);
    // The live hero's ramp (1.95 m/s²) and a normal brake — not the recorder's.
    if (v < target) v = Math.min(target, v + 1.95 * DT);
    else v = Math.max(target, v - 4.6 * DT);
    y += v * DT;
    const tick = stepFrame(stack, {
      x: LANE_RIGHT,
      y,
      headingDeg: 0,
      speedKmh: v * 3.6,
      brakePedal: v < target ? 0 : 1,
    });
    for (const e of tick.events) {
      if (e.kind === "collision") {
        leg.contacts.push({
          actorId: (e as { actorId?: string }).actorId ?? "?",
          tSec: Math.round(stack.t * 10) / 10,
          playerY: Math.round(y * 10) / 10,
          playerKmh: Math.round(v * 36) / 10,
        });
      }
    }
    const lead = stack.traffic.staged(LEAD_ID);
    if (lead) {
      leg.leadMinLateralM = Math.min(leg.leadMinLateralM, Math.abs(lead.x - LANE_RIGHT));
      leg.leadMinSepM = Math.min(leg.leadMinSepM, Math.hypot(lead.x - LANE_RIGHT, lead.y - y));
      const behindM = y - lead.y; // > 0 = the lead is astern of the student
      if (behindM > 0) {
        leg.leadNearestFromBehindM = Math.min(leg.leadNearestFromBehindM, behindM);
        if (behindM < prevBehindM - 0.05) leg.leadClosedFromBehind = true;
        prevBehindM = behindM;
      } else {
        prevBehindM = Infinity;
      }
    }
    leg.finalY = y;
  }
  leg.violationCodes = [
    ...new Set(stack.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code)),
  ];
  return leg;
}

/** The sweep's cautious bot: CRUISE 12 км/ч, roll ~4 s, then a full 3 s stop
 *  (tools/mobile/lesson-audit.mjs `right` mode — deliberately scenario
 *  independent, and the law the finding's frames were taken under). */
const STOP_GO = (t: number): number => (t % 7 < 4 ? 12 / 3.6 : 0);
/** What instruction 5 asks for: «Задръж 46–48 км/ч до края на отсечката». */
const TAUGHT = (): number => 47 / 3.6;

const LEAD_SPEC = (SC_SPEED_DANGEROUS.staged ?? []).find(
  (s): s is BrakingLeadCarSpec => s.kind === "brakingLeadCar",
)!;

describe("§1 the pace car rides one full lane off the student's line", () => {
  it("its authored offset is exactly one lane pitch of the map it is staged on", () => {
    // Pinned against the DISTRICT, not against a repeated literal: move the
    // boulevard's lanes and this fails rather than drifting silently.
    expect(LANE_PITCH).toBeCloseTo(8.13, 2);
    expect(LEAD_SPEC.actor.extraRightOffsetM).toBeCloseTo(-LANE_PITCH, 2);
    // …and it is the LEFT lane of this carriageway, not somewhere off it.
    expect(LANE_RIGHT + LEAD_SPEC.actor.extraRightOffsetM!).toBeCloseTo(LANE_LEFT, 2);
  });

  it("and holds that lane on every frame of a long stop-go drive, returns included", () => {
    const leg = drive(STOP_GO, 210);
    // A car body is ~1.8 m wide; one lane of clear air is 8.13 m of centres.
    // 6 m is the floor that says „not in his lane" without pinning the pose.
    expect(leg.leadMinLateralM).toBeGreaterThan(6);
  });
});

describe("§2 the exposure this repair is about is REAL and still happens", () => {
  const leg = drive(STOP_GO, 210);

  it("the pace car laps a slow student and comes back BEHIND him", () => {
    expect(leg.leadNearestFromBehindM).toBeLessThan(60);
    expect(leg.leadClosedFromBehind).toBe(true);
  });

  it("closing on him from astern — i.e. §3 is not green because nothing is there", () => {
    // It really does arrive at his bumper: inside a car length of arc.
    expect(leg.leadNearestFromBehindM).toBeLessThan(6);
    expect(leg.leadMinSepM).toBeLessThan(12);
  });
});

describe("§3 …and the student is never billed for it", () => {
  it("the sweep's stop-go law books no contact, and only the crawl it really is", () => {
    /**
     * EXPECTATION CORRECTED 2026-09-01 (audit sc-vu-emergency-junction:853790f7),
     * AND THIS CASE IS WHERE THAT FINDING LIVES. §3 is about the PACE CAR: it
     * laps a slow student, comes back at his bumper, and none of that may be
     * billed to him — that claim is unchanged and is the `contacts` line plus
     * the absence of every contact/following code below.
     *
     * What was never true is the second half of the old assertion. `STOP_GO` is
     * the audit sweep's own cautious bot — 12 км/ч, roll 4 s, stop 3 s — held
     * for 210 s down a boulevard with nothing in the student's lane, and „books
     * no violation" was the DEFECT, not a property worth protecting: the engine
     * graded only the fast half of the speed envelope, so „пълзи и минаваш" was
     * an unbeaten strategy on every town lesson. `DRIVING_TOO_SLOW_IN_TOWN`
     * grades it now (ЗДвП чл. 22, ал. 1), and pinning it here by name means the
     * day anything ELSE starts billing this drive, this line says which code.
     */
    const leg = drive(STOP_GO, 210);
    expect(leg.contacts).toEqual([]);
    expect(leg.violationCodes).toEqual(["DRIVING_TOO_SLOW_IN_TOWN"]);
  });

  it("the taught 46–48 км/ч drive books no contact and no violation", () => {
    const leg = drive(TAUGHT, 210);
    expect(leg.contacts).toEqual([]);
    expect(leg.violationCodes).toEqual([]);
    expect(leg.finalY).toBeGreaterThanOrEqual(FINISH_Y);
  });

  for (const kmh of [20, 25, 30, 35, 40, 45]) {
    it(`a lawful steady ${kmh} км/ч drive books no contact`, () => {
      const leg = drive(() => kmh / 3.6, 210);
      expect(leg.contacts).toEqual([]);
    });
  }
});

describe("§4 the drill is intact — the carrot is still a carrot", () => {
  it("the pace car starts ahead of the student and only gains on a lawful one", () => {
    const stack = makeStack(SC_SPEED_DANGEROUS.staged as StagedEventSpec[]);
    let y = 15;
    let v = 0;
    let gapAtStart = 0;
    let gapAt15s = 0;
    for (let i = 0; i < Math.round(15 / DT); i++) {
      if (v < 47 / 3.6) v = Math.min(47 / 3.6, v + 1.95 * DT);
      y += v * DT;
      stepFrame(stack, { x: LANE_RIGHT, y, headingDeg: 0, speedKmh: v * 3.6, brakePedal: 0 });
      const lead = stack.traffic.staged(LEAD_ID)!;
      if (i === 0) gapAtStart = lead.y - y;
      gapAt15s = lead.y - y;
    }
    expect(gapAtStart).toBeGreaterThan(45); // ~55 m ahead at the off
    expect(gapAtStart).toBeLessThan(70);
    expect(gapAt15s).toBeGreaterThan(gapAtStart + 25); // pulling away at ~61
  });

  it("the лепка still presses from directly behind, in the student's own lane", () => {
    const stack = makeStack(SC_SPEED_DANGEROUS.staged as StagedEventSpec[]);
    let y = 15;
    let v = 0;
    let closestGlueM = Infinity;
    let glueLateralM = Infinity;
    let passedOnTheLeft = false;
    for (let i = 0; i < Math.round(25 / DT); i++) {
      if (v < 47 / 3.6) v = Math.min(47 / 3.6, v + 1.95 * DT);
      y += v * DT;
      stepFrame(stack, { x: LANE_RIGHT, y, headingDeg: 0, speedKmh: v * 3.6, brakePedal: 0 });
      const p = stack.traffic.staged(PASSER_ID);
      if (!p) continue;
      const behindM = y - p.y;
      const lateralM = Math.abs(p.x - LANE_RIGHT);
      // The PRESSURE phase only: still astern AND still in his lane. Once the
      // лепка starts its lane-shift the gap along the road closes to zero
      // because it is going PAST him, which is the resolution, not the glue.
      if (behindM > 0 && lateralM < 1 && behindM < closestGlueM) {
        closestGlueM = behindM;
        glueLateralM = lateralM;
      }
      if (p.y > y && p.x < LANE_RIGHT - 6) passedOnTheLeft = true;
    }
    // Pressure, not лепка: the authored followBehindM is 10 m of centres.
    expect(closestGlueM).toBeGreaterThan(6);
    expect(closestGlueM).toBeLessThan(14);
    expect(glueLateralM).toBeLessThan(1); // in HIS lane while it presses
    expect(passedOnTheLeft).toBe(true); // …and it goes by on the LEFT
  });
});
