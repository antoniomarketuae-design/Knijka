/**
 * THE FLOW — sc-mw-discipline grades him against traffic he can see.
 *
 * Finding sc-mw-discipline:3bec2af1 (major), frame
 * .audit-frames/sweep161/sc-mw-discipline/pc-right/04-t103s.png and every frame
 * of all four legs: „The lesson's central concept is «скоростта на потока» but
 * the motorway contains not one other vehicle in any frame of either drive, on
 * either platform. There is no flow to match, so the student cannot see, judge
 * or learn the thing being graded."
 *
 * The repair and its reasoning are at `MWD_FLOW_LEAD` in templates-sp.ts. This
 * file measures the three things that make it a repair rather than a decoration,
 * through the production stack (runtime → traffic → sample → director → rules):
 *
 *   §1 the flow is THERE — a car in the windscreen for the whole graded route,
 *      at a speed that is recognisably the flow this lesson names;
 *   §2 it rides the OVERTAKING lane and never the student's, on every leg the
 *      lesson ships — including the mistake demo that puts him in the left lane
 *      himself — so the one solid body here can never be reached from behind;
 *   §3 it changes NO grade. The crawl demo is the sharp end: the motorway crawl
 *      detector exempts a car merely stuck behind someone, so a flow car in the
 *      wrong lane would have bought a FALSE PASS for a 40 км/ч drive.
 *
 * WATCHED RED, all three, on the way in:
 *   · with `extraRightOffsetM` measured from the cruise lane (−8.12) instead of
 *     from the lane an unoffset actor actually lands in, the car sat at
 *     x = +0.01 — the student's own line — the shadow's leadGap fell to 17.7 m
 *     at 125 км/ч and the trace gate booked FOLLOWING_TOO_CLOSE on a clean
 *     drive. §2 and §3 both fail there;
 *   · with the actor removed entirely, §1 fails at „no flow staged".
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../../runtime";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict } from "../../../traffic/types";
import { createRuleEngine, DEFAULT_RULE_CONFIG } from "../../../rules";
import { createScenarioDirector } from "../../../orchestrator/director";
import { DT, stepFrame, type Stack } from "../../../orchestrator/__tests__/helpers";
import type { StagedEventSpec } from "../../../contracts";
import { SC_MW_DISCIPLINE } from "../templates-sp";
// §4's second subject — the OTHER drill on the same motorway. A test may cross
// a file boundary the shipped code may not; the point of the section is that
// these two specs are read side by side.
import { SC_MW_MIN_SPEED } from "../templates-speed2";

const REPO_ROOT = join(process.cwd(), "..");
const RAW = JSON.parse(
  readFileSync(
    join(REPO_ROOT, "content", "world", `${SC_MW_DISCIPLINE.map.districtId}.json`),
    "utf-8",
  ),
) as TrafficDistrict & {
  meta?: { scenario?: { laneCruiseX?: number; laneLeftX?: number; laneEmergencyX?: number } };
};

/** The map's own lane centres — the copies in templates-sp.ts are pinned here. */
const X_CRUISE = RAW.meta!.scenario!.laneCruiseX!;
const X_LEFT = RAW.meta!.scenario!.laneLeftX!;
const FLOW_ID = "sc-mwd-flow-lead";

/** The route's last graded gate. */
const FINISH_Y = Math.max(
  ...SC_MW_DISCIPLINE.success.map((o) => (o.params.kind === "reachZone" ? o.params.y : 0)),
);

function makeStack(): Stack {
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
  return {
    runtime,
    traffic,
    director: createScenarioDirector(
      [...(SC_MW_DISCIPLINE.staged ?? [])] as StagedEventSpec[],
      traffic,
      { seed: 7, signals: runtime },
    ),
    rules: createRuleEngine(),
    ruleEvents: [],
    ticks: [],
    outcomes: [],
    t: 0,
  };
}

interface Leg {
  /** Frames on which the flow car was ahead and inside the camera's draw. */
  framesInView: number;
  frames: number;
  /** Nearest and furthest the flow car ever was, m of arc, while ahead. */
  nearestAheadM: number;
  furthestAheadM: number;
  /** Smallest |Δx| between the student's line and the flow car, m. */
  minLateralM: number;
  /** Smallest centre-to-centre separation, m. */
  minSepM: number;
  /** Did the flow car ever end up BEHIND the student? */
  everAstern: boolean;
  topFlowKmh: number;
  violationCodes: string[];
  /** Anything the contact sentinel booked. */
  contacts: string[];
}

/** LessonScene draws traffic to 420 m (`maxDrawDistanceM`). */
const DRAW_DISTANCE_M = 420;

/** Drive one of the lesson's own legs up its own lane and watch the flow. */
function drive(laneX: number, kmh: number, seconds = 60): Leg {
  const stack = makeStack();
  let y = 15;
  let v = 0;
  const leg: Leg = {
    framesInView: 0,
    frames: 0,
    nearestAheadM: Infinity,
    furthestAheadM: 0,
    minLateralM: Infinity,
    minSepM: Infinity,
    everAstern: false,
    topFlowKmh: 0,
    violationCodes: [],
    contacts: [],
  };
  for (let i = 0; i < Math.round(seconds / DT) && y < FINISH_Y; i++) {
    const target = kmh / 3.6;
    if (v < target) v = Math.min(target, v + 2.2 * DT);
    else v = Math.max(target, v - 4.6 * DT);
    y += v * DT;
    const tick = stepFrame(stack, {
      x: laneX,
      y,
      headingDeg: 0,
      speedKmh: v * 3.6,
      brakePedal: 0,
      // The production wiring the recorder uses, so the crawl detector sees
      // exactly what a live drive would.
    }, { leadGapM: stack.traffic.leadGapMeters(laneX, y, 0) });
    for (const e of tick.events) {
      if (e.kind === "collision") leg.contacts.push((e as { actorId?: string }).actorId ?? "?");
    }
    const a = stack.traffic.staged(FLOW_ID);
    leg.frames++;
    if (a) {
      const aheadM = a.y - y;
      leg.minLateralM = Math.min(leg.minLateralM, Math.abs(a.x - laneX));
      leg.minSepM = Math.min(leg.minSepM, Math.hypot(a.x - laneX, a.y - y));
      leg.topFlowKmh = Math.max(leg.topFlowKmh, a.speedMps * 3.6);
      if (aheadM > 0) {
        leg.nearestAheadM = Math.min(leg.nearestAheadM, aheadM);
        leg.furthestAheadM = Math.max(leg.furthestAheadM, aheadM);
        if (aheadM <= DRAW_DISTANCE_M) leg.framesInView++;
      } else {
        leg.everAstern = true;
      }
    }
  }
  leg.violationCodes = [
    ...new Set(stack.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code)),
  ];
  return leg;
}

/** The three drives this lesson ships: the taught one and its two mistakes. */
const SHADOW = () => drive(X_CRUISE, 125);
const HOG = () => drive(X_LEFT, 130);
const CRAWL = () => drive(X_CRUISE, 40, 120);

describe("§1 there is a flow, and it is out the windscreen", () => {
  it("a car is staged, ahead, and in view for the whole graded route", () => {
    expect((SC_MW_DISCIPLINE.staged ?? []).length, "no flow staged").toBeGreaterThan(0);
    const leg = SHADOW();
    expect(leg.frames).toBeGreaterThan(100);
    // Ahead on every single frame, and never further than the camera draws.
    expect(leg.framesInView).toBe(leg.frames);
    expect(leg.everAstern).toBe(false);
    expect(leg.furthestAheadM).toBeLessThan(DRAW_DISTANCE_M);
  });

  it("…moving at the speed the briefing calls потокът — at the top of the band, under the limit", () => {
    const leg = SHADOW();
    // Instruction 2 asks him to settle at «120–130 км/ч — със скоростта на
    // потока», so the flow sits at the top of that band: faster than the 125
    // the shadow drives, and comfortably under the posted 140.
    expect(leg.topFlowKmh).toBeGreaterThan(128);
    expect(leg.topFlowKmh).toBeLessThan(140);
  });

  it("…and it pulls away, so the differential is something he can SEE", () => {
    const leg = SHADOW();
    expect(leg.furthestAheadM - leg.nearestAheadM).toBeGreaterThan(50);
  });

  it("…but never faster than the CONTACT SWEEP BUDGET allows", () => {
    // The authored speed of any actor in this catalogue is a term in the
    // collision sweep's worst-frame budget — `sim/collision/__tests__/
    // index.test.ts` walks every `cruiseSpeedMps` and measures
    // (PLAYER_TERMINAL_MPS + fastest) against `SWEEP_FRAME_TRAVEL_M` = 60 m,
    // past which ContactProbe stops treating an interval as motion and the
    // geometry blanks. The catalogue's fastest car is 36.0 m/s; the first cut
    // of this actor was authored at 38 and spent 2 % of that headroom on 7 км/ч
    // of scenery. Watched red there, with the budget test naming the number.
    const flow = (SC_MW_DISCIPLINE.staged ?? []).find((e) => e.kind === "brakingLeadCar") as {
      actor: { cruiseSpeedMps: number };
      paceSpeedMps?: number;
    };
    expect(flow.actor.cruiseSpeedMps).toBeLessThanOrEqual(36);
    expect(flow.paceSpeedMps).toBeLessThanOrEqual(36);
  });
});

describe("§2 it rides the overtaking lane on every leg this lesson ships", () => {
  it("the shadow's own lane is never shared", () => {
    const leg = SHADOW();
    expect(leg.minLateralM).toBeGreaterThan(6);
    expect(leg.contacts).toEqual([]);
  });

  it("the LEFT-LANE HOG shares its lane and still cannot reach it — it is faster", () => {
    // The demo that puts the student in the flow car's own lane for a
    // kilometre. Nothing here may touch him, and the reason is not a guard: the
    // gap grows because this actor is quicker than every leg of this lesson.
    const leg = HOG();
    expect(leg.contacts).toEqual([]);
    expect(leg.everAstern).toBe(false);
    expect(leg.nearestAheadM).toBeGreaterThan(60);
  });

  it("the 40 км/ч CRAWL never meets it either", () => {
    const leg = CRAWL();
    expect(leg.contacts).toEqual([]);
    expect(leg.minLateralM).toBeGreaterThan(6);
  });
});

describe("§3 it changes no grade — the flow is scenery to the rule engine", () => {
  it("the taught 125 км/ч right-lane drive stays clean", () => {
    expect(SHADOW().violationCodes).toEqual([]);
  });

  it("the 40 км/ч crawl is STILL convicted — no queue exemption is bought", () => {
    // THE TRAP THE PREVIOUS LANE NAMED: the crawl detector exempts a car merely
    // stuck behind someone, so a flow car that registered as this student's
    // LEAD would turn a real crawl into a clean sheet. In the overtaking lane
    // it is outside the lead corridor and the conviction stands.
    expect(CRAWL().violationCodes).toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
  });

  it("and the left-lane hog is still convicted of hogging, not of anything new", () => {
    expect(HOG().violationCodes).toEqual(["NOT_KEEPING_RIGHT"]);
  });
});

// ---------------------------------------------------------------------------
// §4 — ONE MOTORWAY, ONE FLOOR, ONE RHYTHM (sc-mw-min-speed:f3c26187)
// ---------------------------------------------------------------------------
//
// mw-v1 is the ONLY motorway in the catalogue and TWO drills run on it back to
// back. At the judged commit they briefed different worlds:
//
//   sc-mw-discipline   «установи около 120–130 км/ч» · «под 50 км/ч без причина»
//   sc-mw-min-speed    «установи около 110 км/ч»     · «тук около 40 км/ч»
//
// (Both lines of sc-mw-min-speed moved on 2026-08-25; they are quoted here as
// they were judged, because a gate that quotes the repaired text has nothing
// left to compare against.)
//
// Same rendered road, same posted 140 on both HUDs, two crawl floors ten km/h
// apart — on the pair whose subject IS the floor. And the floor is not a matter
// of taste: `DEFAULT_RULE_CONFIG.motorwayMinFlowKmh` is the number
// DRIVING_TOO_SLOW_FOR_MOTORWAY bills below, so the lesson that said 40 told a
// student 45 was fine and then billed him for it — a gate graded on a number
// nobody said, pointing the other way.
//
// This gate reads the FLOOR off the rule config rather than repeating it, so the
// day somebody retunes the detector the briefings are what goes red.
/**
 * §4 RUNS AGAIN — 2026-08-25, and the block below is unchanged from the day it
 * was written. It was skipped with an instruction rather than deleted:
 *
 *   „UN-SKIP IT TOGETHER WITH THE WHOLE MOVE: the briefing, BOTH task chips,
 *    and the objective caps, in one round, with those three gates green.
 *    Skipping it rather than deleting it keeps the requirement on the record —
 *    this block is the specification f3c26187 has to satisfy."
 *
 * That is what landed. `templates-speed2.ts` moves briefing step 2 to «около
 * 120–130 км/ч», step 4 to the graded floor, and BOTH task chips with them;
 * the objective caps stay at the posted 140 because the ceiling never was the
 * disputed number. The three named gates were run scoped and are green, and
 * `tier-feasibility`'s band-top census now names two templates — which is the
 * repair, since the two drills finally declare the same band on the same road.
 *
 * ONE SURFACE OF THIS ROW IS STILL OPEN, recorded here rather than in a report
 * because this is where the next reader will be standing. The shadow recording
 * (`traces/scMwMinSpeed.ts`, `FLOW_KMH = 110`) still drives 110 and its caption
 * still says «Установени 110 км/ч — далеч под тавана и точно в ритъма», so the
 * DEMONSTRATION contradicts the briefing it demonstrates. Moving it is not a
 * copy edit: the drive is a committed byte-gated recording, re-recording it at
 * ~125 changes what the staged flow car does relative to the ego, and this
 * file's §3 asserts `tick.leadGapM` stays non-finite for the whole shadow —
 * i.e. the ego never closes on the flow. That has to be re-measured, not
 * assumed, which is a different round's work.
 */
describe("§4 both motorway drills teach the floor the engine actually grades", () => {
  const FLOOR = DEFAULT_RULE_CONFIG.motorwayMinFlowKmh;
  const MOTORWAY_SPECS = [SC_MW_DISCIPLINE, SC_MW_MIN_SPEED];

  it("the instrument: both drills are on the same district, and it is the motorway", () => {
    // An empty or mismatched pair would make everything below vacuous.
    expect(new Set(MOTORWAY_SPECS.map((s) => s.map.districtId)).size).toBe(1);
    expect(MOTORWAY_SPECS[0].map.districtId).toBe("mw-v1");
    expect(FLOOR).toBeGreaterThan(0);
  });

  it("every crawl floor a briefing names is the floor the detector uses", () => {
    // Only sentences about CRAWLING are read, and only the «под N км/ч» shape:
    // the posted ceiling and the flow band are other numbers in the same steps
    // and must not be mistaken for a floor.
    const offenders: string[] = [];
    for (const spec of MOTORWAY_SPECS) {
      for (const step of spec.instructionsBg) {
        if (!/пълзен|пълзи|бавно движение/iu.test(step.textBg)) continue;
        for (const m of step.textBg.matchAll(/под\s+(\d+)\s*км\/ч/giu)) {
          if (Number(m[1]) !== FLOOR) {
            offenders.push(`${spec.id} step ${step.n} names ${m[1]}, the engine grades ${FLOOR}`);
          }
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("THE MUTATION — the line that shipped is gone, and the replacement states the floor", () => {
    // Verbatim `templates-speed2.ts` step 4 at 151bd19. Note what its 40 was
    // wearing: «далеч под потока (тук около 40 км/ч)» — a floor written so that
    // the reader above cannot see it, which is exactly why the assertion that
    // carries this section is the POSITIVE one below rather than the negative
    // one. A rule that only forbids the wrong spelling is a rule the next
    // author walks around.
    const SHIPPED =
      "Не сваляй скоростта без причина. Продължително пълзене далеч под потока (тук около 40 км/ч) превръща колата ти в подвижно препятствие, което всички трябва да заобикалят.";
    expect(SHIPPED).toMatch(/40\s*км\/ч/u);
    expect(
      MOTORWAY_SPECS.flatMap((s) => s.instructionsBg.map((i) => i.textBg)),
    ).not.toContain(SHIPPED);
    const crawlStep = SC_MW_MIN_SPEED.instructionsBg.find((i) => /пълзен/iu.test(i.textBg));
    expect(crawlStep, "sc-mw-min-speed no longer has a crawl step").toBeDefined();
    expect(
      [...crawlStep!.textBg.matchAll(/под\s+(\d+)\s*км\/ч/giu)].map((m) => Number(m[1])),
      "the crawl step must state the graded floor, in the shape the rule can read",
    ).toEqual([FLOOR]);
    // …and no other number is smuggled into the same sentence.
    expect(crawlStep!.textBg).not.toMatch(/40\s*км\/ч/u);
  });

  it("…and both drills name the same flow rhythm for the same road", () => {
    // The other half of the row. Neither number is graded, so this is not about
    // a gate — it is about a student driving the two lessons back to back on one
    // rendered motorway and being told two different speeds for the same
    // traffic. The band is the staged flow's own (cruiseSpeedMps 33 → 36, i.e.
    // 119 → 130 км/ч), which §1 above already measures out the windscreen.
    // The SETTLE clause only — «се установи около N км/ч». The steps also quote
    // the staged car's own 130 and, on the sibling, a worked example at 120;
    // those are illustrations, not the instruction, and reading them as one is
    // how a comparison like this turns into noise.
    const settleBand = (spec: typeof SC_MW_DISCIPLINE): string | null => {
      for (const i of spec.instructionsBg) {
        const m = /установи[^.]*?(\d+(?:\s*–\s*\d+)?)\s*км\/ч/u.exec(i.textBg);
        if (m) return m[1].replace(/\s+/gu, "");
      }
      return null;
    };
    expect(settleBand(SC_MW_MIN_SPEED), "sc-mw-min-speed names no settle band").not.toBeNull();
    expect(settleBand(SC_MW_DISCIPLINE), "sc-mw-discipline names no settle band").not.toBeNull();
    expect(settleBand(SC_MW_MIN_SPEED)).toBe(settleBand(SC_MW_DISCIPLINE));
  });
});
