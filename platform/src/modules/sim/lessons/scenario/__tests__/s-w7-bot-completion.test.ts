/**
 * Wave-7 bot-completion proofs (doc 76 §10; the s-batch2 / s-w1..s-w6 mold) —
 * each NEW template of the wave driven through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization →
 *   gradeFinishWire RECOMPILES from the id and regrades → scoreRubric.
 *
 * One describe block per template; the wave's agents APPEND to this file (add
 * an import + a block, never edit a neighbour's).
 *
 * NOTE for the integration pass: the gradeFinishWire round-trip resolves the
 * lesson id through the templates.ts registry, so each block's wire test goes
 * green only once that template's family file is spread into SCENARIO_TEMPLATES
 * (the main session owns that edit).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recordScAcBridgeIceDrive } from "../../../traces/scAcBridgeIce";
import { recordScLnObstacleMeetingDrive } from "../../../traces/scLnObstacleMeeting";
import { recordScPeZoneLivingDrive } from "../../../traces/scPeZoneLiving";
import { recordScPkRailBanDrive } from "../../../traces/scPkRailBan";
import { recordScSpEcoCoastDrive } from "../../../traces/scSpEcoCoast";
import { recordScVuChildCyclistDrive } from "../../../traces/scVuChildCyclist";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_AC_BRIDGE_ICE } from "../templates-conditions2";
import { SC_LN_OBSTACLE_MEETING } from "../templates-lanes2";
import { SC_PK_RAIL_BAN } from "../templates-parking2";
import { SC_PE_ZONE_LIVING } from "../templates-pe2";
import { SC_SP_ECO_COAST } from "../templates-speed";
import { SC_VU_CHILD_CYCLIST } from "../templates-vru2";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

// ---------------------------------------------------------------------------
// sc-pk-rail-ban — the drill is won by NOT STOPPING ANYWHERE for 106 metres:
//                  чл. 98 owns the fifty metres either side of the rails, and
//                  the rails own themselves. Six metres apart, the same excuse
//                  is основна and then опасна — that gap IS the template.
// ---------------------------------------------------------------------------

describe("wave-7 bot completion — sc-pk-rail-ban at L3", () => {
  const lesson = compileScenario(SC_PK_RAIL_BAN, 3);
  let session = createLessonSession(lesson);
  recordScPkRailBanDrive(loadDistrict("pk-rail-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: all three objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_PK_RAIL_BAN.rubric!).stars).toBe(3);
  });

  it("THE POINT, on the STUDENT path: the sheet is passed BECAUSE the stop happened LATE", () => {
    // The trace gate proves the recorder's engine sees a clean drive; this proves
    // the student-facing session agrees — and that the legal bay is a GATE rather
    // than narration. sc-pkr-legal-stop is a reachZone at (4.06, 330) with
    // radiusM 4 and maxSpeedKmh 6: it is unsatisfiable in motion AND unreachable
    // from anywhere inside the 106 m zone, so the only way this sheet reads
    // „passed, 3★" is a car that really did carry its stop past every forbidden
    // metre. The drill never asked the student not to stop — only not to stop
    // THERE, and the gates say exactly that.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    for (const id of ["sc-pkr-cross", "sc-pkr-past-zone", "sc-pkr-legal-stop"]) {
      expect(at(id).done, id).toBe(true);
    }
    // The order IS the teaching, and objectives advance sequentially: the rails
    // are crossed, then the far ban is left behind, and only then may the car
    // rest. A driver who parked „veднага след прелеза" reaches neither of the
    // last two.
    expect(at("sc-pkr-cross").completedAtSec!).toBeLessThan(at("sc-pkr-past-zone").completedAtSec!);
    expect(at("sc-pkr-past-zone").completedAtSec!).toBeLessThan(
      at("sc-pkr-legal-stop").completedAtSec!,
    );
  });

  it("stages NOTHING and opts into NOTHING — the zone is the whole encounter", () => {
    // Every dial this drill could have reached for is deliberately empty, and
    // each absence is load-bearing:
    //  - no staged actor: a queue lead within banZoneStopQueueGapM would acquit
    //    every ban rest as queue-shaped and dissolve the лекция (that drill
    //    exists already — sc-rx-queue-clear, and it teaches the other half);
    //  - no ruleConfig: чл. 98 and the rail arms are default-on for everyone;
    //  - no physics: the ghosts are dry-tuned (ADR-006 stage 4a).
    expect(lesson.stagedEvents ?? []).toEqual([]);
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the LIVE session bills no phantom for the lawful transit itself", () => {
    // Where a sloppy tune would surface: the car crosses a railway at 38 km/h
    // WITHOUT stopping, spends ~11 s inside two authored no-stopping spans, and
    // then parks at the curb. Every detector this map can anger is watching — and
    // чл. 52's legal asymmetry (a guarded, open crossing asks no stop at all) is
    // the reason all of it must cost nothing.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    for (const c of [
      "RAIL_CROSSING_VIOLATION",
      "ILLEGAL_STOP_IN_BAN_ZONE",
      "HARSH_BRAKING_NO_CAUSE",
      "POOR_LANE_KEEPING",
      "SPEEDING_OVER_LIMIT",
      "STANDSTILL_GAP_TOO_CLOSE",
    ]) {
      expect(codes).not.toContain(c);
    }
  });

  /** Replay a demo through a LIVE session at one rung, splitting the coach's
   *  two channels: what it TAUGHT (first-encounter pause card) vs what it
   *  SCORED (session.events → the sheet). */
  const replay = (name: Parameters<typeof recordScPkRailBanDrive>[1], level: 3 | 4) => {
    let s = createLessonSession(compileScenario(SC_PK_RAIL_BAN, level));
    const taught: string[] = [];
    recordScPkRailBanDrive(loadDistrict("pk-rail-v1"), name, {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    return {
      taught,
      scored: s.events.filter((e) => e.kind === "violation").map((e) => e.code),
      r: buildLessonResult(s),
    };
  };

  it("counter-proof: the rest BEFORE the rails TEACHES at L3 and is SCORED at L4 — on a sheet that COMPLETES", () => {
    // The template's first claim. This student drove the whole route correctly —
    // crossed the rails cleanly, left the zone, parked in the legal bay, all
    // three gates green — and he is still wrong, because for six seconds his car
    // was a wall in front of a railway. A drill that failed him on the ROUTE
    // would let a student believe чл. 98 is about where you end up.
    const l3 = replay("mistake-stop-before-crossing", 3);
    // ILLEGAL_STOP_IN_BAN_ZONE is основна: the FIRST encounter pauses with a card
    // and costs no points (teach-first, doc 76 §0).
    expect(l3.taught).toContain("ILLEGAL_STOP_IN_BAN_ZONE");
    expect(l3.scored).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
    expect(l3.r.score).toBe(0);
    expect(l3.r.completedAll).toBe(true); // the route was never the problem
    // …and at the EXAM rung the coach stops teaching and starts billing the
    // identical drive. Both halves of teach-first-then-grade on one recording.
    const l4 = replay("mistake-stop-before-crossing", 4);
    expect(l4.taught).toEqual([]);
    expect(l4.scored).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    // The OFFICIAL truth, not a wish: one основна is 3 of the 9-point budget
    // (Наредба-38, rules/scoring.ts) — this sheet is still PASSED, and the cost
    // lands on the rubric instead. A drill that claimed one short stop fails the
    // exam would be teaching a law that does not exist.
    expect(l4.r.score).toBe(3);
    expect(l4.r.passed).toBe(true);
    expect(l4.r.completedAll).toBe(true);
    expect(scoreRubric(l4.r, SC_PK_RAIL_BAN.rubric!).stars).toBeLessThanOrEqual(2);
  });

  it("counter-proof: the SAME rest 28 m later is опасна — never taught, instantly failed", () => {
    // The template's sharpest claim, and the reason both demos exist. This driver
    // did nothing new: he stopped his car for six seconds in a place he thought
    // was empty, exactly like the demo above. But the place was the rails, and
    // the engine agrees that this is a different KIND of wrong:
    //  - опасна ⇒ SCORED with a non-blocking toast, never a teach-pause modal
    //    (a dangerous code must never pop a card mid-crossing) — so the A9 teach
    //    channel is EMPTY even at L3, where its neighbour got a free lesson;
    //  - 10 points ⇒ the sheet fails on the spot, while completedAll stays TRUE:
    //    he drove the whole route, cleared every gate, parked legally.
    // Six metres of geography, three faults' worth of difference. If these two
    // demos ever graded the same code, this template would have no subject.
    const l3 = replay("mistake-stop-on-rails", 3);
    expect(l3.taught).toEqual([]);
    expect(l3.scored).toEqual(["RAIL_CROSSING_VIOLATION"]);
    expect(l3.scored).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE"); // no ban span reaches the band
    expect(l3.r.score).toBe(10);
    expect(l3.r.passed).toBe(false);
    expect(l3.r.completedAll).toBe(true); // the route was perfect; the six metres were not
    expect(scoreRubric(l3.r, SC_PK_RAIL_BAN.rubric!).stars).toBe(1);
  });

  it("compiles at every authored rung; L4 is the exam cold start", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_PK_RAIL_BAN, level).id).toBe(`sc-pk-rail-ban@L${level}`);
    }
    expect(compileScenario(SC_PK_RAIL_BAN, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_PK_RAIL_BAN, 4).examMode).toBe(true);
    // No L5 by design (the backlog's own rung list): the difficulty axis here is
    // KNOWING an unmarked zone, not grip or light. Rain would want the ADR-006
    // stage-4a physics opt-in the dry-tuned ghost cannot honour, and night would
    // only hide a crossing whose А34 post does not render yet anyway (the
    // generator's own gap note).
    expect(SC_PK_RAIL_BAN.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
    // Nothing is staged at ANY rung — see the „stages NOTHING" proof above.
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_PK_RAIL_BAN, level).stagedEvents ?? [], `L${level}`).toEqual([]);
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-pk-rail-ban@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-pk-rail-ban@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sc-pe-zone-living — the one place in the law where the carriageway is NOT
//                     the car's. чл. 62–63 hands the whole road to the people
//                     on it and caps the guest at 20; чл. 25 takes every scrap
//                     of priority back at the exit. Both halves grade off
//                     SHIPPED surfaces — the zone edge's own maxspeed, and an
//                     UNMARKED crossing that paints nothing and still fires.
// ---------------------------------------------------------------------------

describe("wave-7 bot completion — sc-pe-zone-living at L3", () => {
  const lesson = compileScenario(SC_PE_ZONE_LIVING, 3);
  let session = createLessonSession(lesson);
  recordScPeZoneLivingDrive(loadDistrict("pe-zone-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: all five objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_PE_ZONE_LIVING.rubric!).stars).toBe(3);
  });

  it("THE POINT, on the STUDENT path: the зона is won at its ENTRY and given back at its EXIT", () => {
    // The trace gate proves the recorder's engine sees a clean drive; this proves
    // the student-facing session agrees, and that both ends are GATES rather than
    // narration. sc-pzl-zone is a reachZone 30 m past the Д15 sign with
    // maxSpeedKmh 20 — unsatisfiable by anyone who „will slow down once he sees
    // someone"; sc-pzl-exit is a reachZone 8 m short of the mouth with
    // maxSpeedKmh 10 — unsatisfiable by anyone who treats leaving the зона as
    // merely driving straight on. The order IS the teaching, and objectives
    // advance sequentially: enter slow, stop for the people, only then leave,
    // and only then rejoin.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    const order = ["sc-pzl-zone", "sc-pzl-halt", "sc-pzl-clear", "sc-pzl-exit", "sc-pzl-out"];
    for (const id of order) expect(at(id).done, id).toBe(true);
    for (let i = 1; i < order.length; i++) {
      expect(at(order[i - 1]).completedAtSec!, order[i]).toBeLessThan(at(order[i]).completedAtSec!);
    }
  });

  it("opts into NOTHING — the zone segment's own maxspeed IS the whole capability", () => {
    // Every dial this drill could have reached for is deliberately empty, and
    // each absence is load-bearing:
    //  - no ruleConfig: чл. 62–63 needs no config-gated detector — the shipped
    //    speeding chain grades the зона the moment the EDGE posts 20 (doc 72
    //    PE-15's own „once the zone caps maxSpeedKmh" note, closed by
    //    tools/maps/gen_pe_zone.mjs);
    //  - no physics: the ghosts are dry-tuned (ADR-006 stage 4a);
    //  - no signalPlan: there is not a lamp on the map.
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
    expect(lesson.signalPlan).toBeUndefined();
    // ONE staged walker below L5 — the encounter is a person, not a set piece.
    expect((lesson.stagedEvents ?? []).map((e) => e.id)).toEqual(["sc-pzl-walker-w"]);
  });

  it("the LIVE session bills no phantom for the lawful transit itself", () => {
    // Where a sloppy tune would surface: the car spends ~35 s crawling a street
    // at 18 km/h, comes to a dead stop for 14 s with nothing but a walking figure
    // ahead of it, then crosses an uncontrolled junction at 8 km/h. That drive is
    // EXACTLY what the law asks for, and every detector that could mistake
    // patience for a fault is watching.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    for (const c of [
      "SPEEDING_OVER_LIMIT",
      "SPEEDING_DANGEROUS",
      "PEDESTRIAN_NOT_YIELDED",
      "PEDESTRIAN_CROSSING_TOO_FAST",
      "HARSH_BRAKING_NO_CAUSE",
      "FAILED_TO_YIELD",
      "POOR_LANE_KEEPING",
    ]) {
      expect(codes).not.toContain(c);
    }
    // …and the patience is CREDITED, not merely tolerated.
    expect(session.events.filter((e) => e.kind === "commendation").map((e) => e.code)).toContain(
      "PEDESTRIAN_YIELDED",
    );
  });

  /** Replay a demo through a LIVE session at one rung, splitting the coach's
   *  two channels: what it TAUGHT (first-encounter pause card) vs what it
   *  SCORED (session.events → the sheet). */
  const replay = (name: Parameters<typeof recordScPeZoneLivingDrive>[1], level: 3 | 4) => {
    let s = createLessonSession(compileScenario(SC_PE_ZONE_LIVING, level));
    const taught: string[] = [];
    recordScPeZoneLivingDrive(loadDistrict("pe-zone-v1"), name, {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    return {
      taught,
      scored: s.events.filter((e) => e.kind === "violation").map((e) => e.code),
      r: buildLessonResult(s),
    };
  };

  it("counter-proof: „с 50“ fails the sheet on a drive that did everything ELSE right", () => {
    // The template's first claim, and the reason this demo yields correctly at
    // the end. The student met the walker perfectly — he braked, he waited, he
    // was CREDITED PEDESTRIAN_YIELDED — and he still fails, because for two
    // seconds at the зона's mouth his car was a 50 km/h object on a road with
    // children on it. A drill that graded only the pedestrian encounter would
    // teach that the зона begins when you see someone.
    const l3 = replay("mistake-city-speed", 3);
    // опасна ⇒ SCORED with a non-blocking toast, never a teach-pause modal — so
    // the A9 teach channel is EMPTY even at L3, where an основна would earn a
    // free first lesson (teach-first-then-grade, doc 76 §0).
    expect(l3.taught).toEqual([]);
    expect(l3.scored).toEqual(["SPEEDING_DANGEROUS"]);
    expect(l3.r.score).toBe(10); // one опасна > the 9-point budget (Наредба-38)
    expect(l3.r.passed).toBe(false);
    // He really did yield — the two channels are independent, and that is the
    // whole rhetorical force of this demo: the good half is REAL.
    expect(l3.r.summary.commendations.map((c) => c.code)).toContain("PEDESTRIAN_YIELDED");
    // And yet the sheet never gets going. sc-pzl-zone demands <= 20 km/h at
    // y = 150; holding 50 through it misses the gate, and because lesson
    // objectives advance SEQUENTIALLY (lessons/engine.ts: a completing objective
    // activates the next), the drill stalls at step one. Nothing downstream is
    // even evaluated — the later stop for the walker cannot retroactively buy
    // back an entry that never happened. In a жилищна зона you do not get to
    // start the lesson late.
    for (const id of ["sc-pzl-zone", "sc-pzl-halt", "sc-pzl-clear", "sc-pzl-exit", "sc-pzl-out"]) {
      expect(l3.r.objectives.find((o) => o.id === id)!.done, id).toBe(false);
    }
    expect(l3.r.completedAll).toBe(false);
    expect(scoreRubric(l3.r, SC_PE_ZONE_LIVING.rubric!).stars).toBe(1);
    // The exam rung grades the identical drive identically — there is no rung at
    // which 50 in a 20 was ever going to be a lesson instead of a failure.
    const l4 = replay("mistake-city-speed", 4);
    expect(l4.taught).toEqual([]);
    expect(l4.scored).toEqual(["SPEEDING_DANGEROUS"]);
    expect(l4.r.passed).toBe(false);
  });

  it("counter-proof: the LAWFUL 18 km/h push-through fails too — and cannot even finish", () => {
    // The template's sharpest claim. This driver broke no speed limit anywhere:
    // 18 in a 20, the whole way. He is still failed, and that is the entire
    // subject of the lesson — in a жилищна зона the person on the carriageway is
    // not in your way, you are in HIS (чл. 62–63). The horn he leans on exists
    // only in the copy: the sim has no horn channel, and inventing a detector for
    // it would be billing an unmodelled duty (A12). The graded fault is the one
    // the law actually names.
    const l3 = replay("mistake-push-through", 3);
    expect(l3.taught).toEqual([]); // опасна — scored, never a free first lesson
    expect(l3.scored).toEqual(["PEDESTRIAN_NOT_YIELDED"]);
    expect(l3.scored).not.toContain("SPEEDING_OVER_LIMIT"); // lawful the whole way
    expect(l3.scored).not.toContain("SPEEDING_DANGEROUS");
    expect(l3.r.score).toBe(10);
    expect(l3.r.passed).toBe(false);
    // …and UNLIKE „с 50", this sheet does not even complete: the halt is a GATE,
    // so a driver who never stops for the people literally cannot finish the
    // drill. „Ще се промуша" is not a slower way to pass — it is not a way.
    expect(l3.r.completedAll).toBe(false);
    expect(l3.r.objectives.find((o) => o.id === "sc-pzl-halt")!.done).toBe(false);
    expect(l3.r.objectives.find((o) => o.id === "sc-pzl-zone")!.done).toBe(true); // he WAS slow
  });

  it("compiles at every authored rung; L4 is the exam cold start, L5 adds the second walker", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_PE_ZONE_LIVING, level).id).toBe(`sc-pe-zone-living@L${level}`);
    }
    expect(compileScenario(SC_PE_ZONE_LIVING, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_PE_ZONE_LIVING, 4).examMode).toBe(true);
    // L5's difficulty axis is PEOPLE, not grip or light: a second figure steps
    // off the OPPOSITE curb into the same shared carriageway, so the road is
    // occupied from both sides at once and „ще се промуша между тях" stops being
    // geometrically available. No physics/conditions delta — the ghost envelopes
    // are dry-tuned (doc 76 §7).
    expect(SC_PE_ZONE_LIVING.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    expect((compileScenario(SC_PE_ZONE_LIVING, 5).stagedEvents ?? []).map((e) => e.id)).toEqual([
      "sc-pzl-walker-w",
      "sc-pzl-walker-e",
    ]);
    expect(compileScenario(SC_PE_ZONE_LIVING, 5).physics).toBeUndefined();
    // Both walkers work the SAME crossing id — pedestrianOnCrossing is a COUNT
    // (traffic/system.ts), so they compose instead of replacing one another.
    // That is what makes L5 a rung delta and not a second map.
    for (const e of compileScenario(SC_PE_ZONE_LIVING, 5).stagedEvents ?? []) {
      expect(e.kind).toBe("pedestrianDartOut");
      expect((e as { crossingId: string }).crossingId).toBe("pz-x-1");
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-pe-zone-living@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-pe-zone-living@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sc-ac-bridge-ice — the drill is won BEFORE the hazard is reached: on 0.15
//                    grip every command that could save you needs the traction
//                    the ice already took, so the only move left is the one you
//                    made on dry asphalt. The gates grade anticipation, and
//                    nothing else can pass them.
// ---------------------------------------------------------------------------

describe("wave-7 bot completion — sc-ac-bridge-ice at L3", () => {
  const lesson = compileScenario(SC_AC_BRIDGE_ICE, 3);
  let session = createLessonSession(lesson);
  recordScAcBridgeIceDrive(loadDistrict("ac-bridge-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: all three objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_AC_BRIDGE_ICE.rubric!).stars).toBe(3);
  });

  it("THE POINT, on the STUDENT path: the sheet is passed BECAUSE the throttle came up EARLY", () => {
    // The trace gate proves the recorder's engine sees a clean drive; this proves
    // the student-facing session agrees — and that the anticipation is a GATE
    // rather than narration. sc-acbi-before is a reachZone at (4.06, 235) capped
    // at 30 km/h: it sits WHOLLY on dry asphalt, 15 m short of the icy deck, so
    // it is satisfiable only by a driver who had already decided. Its twin
    // sc-acbi-deck caps 30 again at the far abutment, on the ice, which is the
    // anti-cheat: you cannot dip under 30 for one tick and floor it — the 90 m
    // between the two gates must be driven at the crawl. The drill never asked
    // for a stop; it asked for a decision, taken while a decision still works.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    for (const id of ["sc-acbi-before", "sc-acbi-deck", "sc-acbi-past"]) {
      expect(at(id).done, id).toBe(true);
    }
    // The order IS the teaching, and objectives advance sequentially: slow on
    // the dry, still slow at the far abutment, and only then the far side. A
    // driver who planned to brake „on the bridge" reaches neither of the first
    // two — and this map gives him a parapet instead of a second chance.
    expect(at("sc-acbi-before").completedAtSec!).toBeLessThan(at("sc-acbi-deck").completedAtSec!);
    expect(at("sc-acbi-deck").completedAtSec!).toBeLessThan(at("sc-acbi-past").completedAtSec!);
  });

  it("stages NOTHING and opts into NOTHING — the map's own deck is the whole encounter", () => {
    // Every dial this drill could have reached for is deliberately empty, and
    // each absence is load-bearing (see the template header):
    //  - no staged actor: a car ahead would MARK the bridge and quietly delete
    //    the lesson — reading the empty road is the skill;
    //  - no ruleConfig: every code this drill grades is default-on for everyone,
    //    and the conditions envelope is deliberately NOT armed (a clear dry
    //    morning arms none — the invisible ice under a blue sky is the point);
    //  - no physics: base grip stays 1 and ONLY the deck's icePatch span bites,
    //    which is what keeps the approach and the far side dry-tuned. That
    //    contrast IS the template.
    expect(lesson.stagedEvents ?? []).toEqual([]);
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the LIVE session bills no phantom for the lawful approach or the crawl", () => {
    // Where a sloppy tune would surface: the car cruises 45 in a 50-zone, sheds
    // 21 km/h for no reason the ENGINE can see (it has no ice vocabulary — the
    // span is tick-inert by contract), crawls 90 m at 24 km/h, then accelerates
    // back to 48. Every detector this map can anger is watching, and all of it
    // must cost nothing: prudence that grades as a fault would teach the exact
    // opposite of the lesson.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    for (const c of [
      "SPEEDING_OVER_LIMIT",
      "SPEED_TOO_FAST_FOR_CONDITIONS",
      "HARSH_BRAKING_NO_CAUSE",
      "POOR_LANE_KEEPING",
      "CENTER_LINE_TOUCHED",
      "COLLISION",
    ]) {
      expect(codes, c).not.toContain(c);
    }
  });

  it("L5 adds the dark and re-tunes NOTHING — the night factor ships at 1", () => {
    // A clear dry morning compiles to NO environment at all: dry + day is the
    // engine's zero, which is precisely why nothing arms a conditions envelope
    // on the base rungs (see the template header).
    expect(lesson.environment).toBeUndefined();
    // The rung is a RENDER axis only: compileScenario spreads it over the
    // template's conditions, so weather stays "dry" (contributing no key) and
    // night is added. The result carries timeOfDay and NOTHING else — no rain,
    // fog or snow flag, which are the only three that could reduce the prudent
    // speed. Combined with conditionSpeedNightFactor shipping at 1 (the
    // lit-urban-Sofia A12 FP case), the envelope is unchanged and no drive moves
    // by a tick. What the rung actually costs the student is the geometry cue
    // this whole template is built on: in the dark, the buildings ending and the
    // void opening are far harder to read — so the anticipation has to come from
    // the thermometer and the А15 post instead of the skyline.
    const l5 = compileScenario(SC_AC_BRIDGE_ICE, 5);
    expect(l5.environment).toEqual({ timeOfDay: "night" });
    expect(l5.ruleConfig).toBeUndefined();
    expect(l5.physics).toBeUndefined();
    // The graded contract does not change with the light — only the difficulty
    // of noticing that you are about to need it.
    expect(l5.objectives.map((o) => o.id)).toEqual(SC_AC_BRIDGE_ICE.success.map((o) => o.id));
  });

  it("round-trips through the finish wire: gradeFinishWire recompiles and agrees", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ac-bridge-ice@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ac-bridge-ice@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sc-ln-obstacle-meeting — the drill is won by WAITING FOR THE SECOND CAR: when
//                          the obstacle is in YOUR half, the oncoming lane is
//                          not a gap to be taken but a lane already in use, and
//                          „чисто е" is a claim about the whole queue, not about
//                          the car you just watched go by (ЗДвП чл. 44)
// ---------------------------------------------------------------------------

describe("wave-7 bot completion — sc-ln-obstacle-meeting at L3", () => {
  const lesson = compileScenario(SC_LN_OBSTACLE_MEETING, 3);
  let session = createLessonSession(lesson);
  recordScLnObstacleMeetingDrive(loadDistrict("ov-narrow-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: all three objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_LN_OBSTACLE_MEETING.rubric!).stars).toBe(3);
  });

  it("THE POINT, on the STUDENT path: the gates are lane-exclusive, so the wait cannot be narrated", () => {
    // The trace gate proves the recorder's engine sees a clean drive; this
    // proves the student-facing session agrees, and that each sentence of чл. 44
    // is a GATE. sc-lnom-wait is a reachZone on the own-lane centre with
    // radiusM 4 (< half the 8.125 m lane pitch) and maxSpeedKmh 6: unsatisfiable
    // from the other lane AND unsatisfiable in motion — the only way to tick it
    // is to actually stop in your own half short of the obstacle. sc-lnom-round
    // sits on the OPPOSING lane centre beside the parked row, so it cannot be
    // reached by a driver who never committed. Stop → round → home, in order.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    for (const id of ["sc-lnom-wait", "sc-lnom-round", "sc-lnom-home"]) {
      expect(at(id).done, id).toBe(true);
    }
    expect(at("sc-lnom-wait").completedAtSec!).toBeLessThan(at("sc-lnom-round").completedAtSec!);
    expect(at("sc-lnom-round").completedAtSec!).toBeLessThan(at("sc-lnom-home").completedAtSec!);
  });

  it("carries BOTH oncoming cars into the live lesson — the queue is staged, not narrated", () => {
    // Drop the stream and the student meets ONE oncoming car: „чакай втората"
    // becomes a sentence on a card with nothing behind it, and the drill decays
    // into sc-ov-narrow with different copy. Drop the narrowMeeting and the
    // parked row itself disappears (its props ARE the obstacle) along with the
    // чл. 44 adjudication the shadow's commendation comes from. Both are premise.
    const staged = lesson.stagedEvents ?? [];
    expect(staged.map((s) => s.kind).sort()).toEqual(["narrowMeeting", "oncomingStream"]);
    const meeting = staged.find((s) => s.id === "sc-lnom-meeting")!;
    if (meeting.kind !== "narrowMeeting") return;
    // The single dial that makes this scene чл. 44 rather than its mirror image
    // (q-manevri-050, where the obstruction is on HIS side and you go first):
    expect(meeting.obstructionSide).toBe("player");
    expect(meeting.props).toHaveLength(2);
    const stream = staged.find((s) => s.id === "sc-lnom-stream")!;
    if (stream.kind !== "oncomingStream") return;
    expect(stream.count).toBe(1); // ONE second car — the drill, not „traffic"
    // Graded on SHIPPED rules alone: no dial is opted in anywhere. чл. 44 has no
    // detector of its own (deliberately — doc 76's deferred list), so the
    // grading rides the gates + the contact channel, and the ghosts are
    // dry-tuned (ADR-006 stage 4a).
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the LIVE session bills no phantom for the taught wait and the arc itself", () => {
    // Where a sloppy tune would surface: this car stops dead in a live lane for
    // 15 s with nothing painted anywhere on the map, then crosses the осева,
    // drives ~30 m on the wrong side of a two-way street past two parked cars,
    // and crosses back. Half the catalog is watching, and the drill ORDERS every
    // bit of it.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    for (const c of [
      "HARSH_BRAKING_NO_CAUSE",
      "CENTER_LINE_TOUCHED",
      "POOR_LANE_KEEPING",
      "OVERTAKE_INSUFFICIENT_GAP",
      "OVERTAKE_RETURN_TOO_EARLY",
      "FAILED_TO_YIELD",
      "LANE_CHANGE_WITHOUT_INDICATOR",
      "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
      "COLLISION",
      "SPEEDING_OVER_LIMIT",
    ]) {
      expect(codes).not.toContain(c);
    }
  });

  it("counter-proof: the pull-out is SCORED 10 and reaches no gate at all", () => {
    // The template's sharpest claim on the student path. This driver did not
    // misjudge a gap by a second — he took a lane that was in use, and the other
    // man's full emergency stop did not save either of them. COLLISION is
    // опасна, so it is SCORED with a toast rather than paused into a card (a
    // dangerous code must never pop a modal mid-manoeuvre), and the sheet fails
    // on the score AND on every gate: he never stopped, so sc-lnom-wait is
    // unticked, and the drive ends against a bumper 10 m short of the obstacle
    // he was in such a hurry to get around.
    let s = createLessonSession(compileScenario(SC_LN_OBSTACLE_MEETING, 3));
    const taught: string[] = [];
    recordScLnObstacleMeetingDrive(loadDistrict("ov-narrow-v1"), "mistake-pull-out", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toEqual([]);
    expect(s.events.filter((e) => e.kind === "violation").map((e) => e.code)).toEqual(["COLLISION"]);
    expect(r.objectives.find((o) => o.id === "sc-lnom-wait")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_LN_OBSTACLE_MEETING.rubric!).stars).toBe(1);
  });

  it("counter-proof: the squeeze TEACHES the осева first — and still ends in the same crash", () => {
    // The mirror image, and the reason both demos exist. This driver never
    // „took" the oncoming lane — he kept telling himself he was still in his own
    // — and he ends up in exactly the same place, because half a lane each is
    // not a solution the physics accepts. CENTER_LINE_TOUCHED is второстепенна,
    // so the first encounter PAUSES with a teach card and costs nothing
    // (teach-first, doc 76 §0) while the опасна COLLISION is scored: both halves
    // of teach-first-then-grade on one recording.
    let s = createLessonSession(compileScenario(SC_LN_OBSTACLE_MEETING, 3));
    const taught: string[] = [];
    recordScLnObstacleMeetingDrive(loadDistrict("ov-narrow-v1"), "mistake-squeeze", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toContain("CENTER_LINE_TOUCHED");
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("COLLISION");
    expect(codes).not.toContain("FAILED_TO_YIELD"); // sc-ov-narrow's code, not this drill's
    expect(r.objectives.find((o) => o.id === "sc-lnom-wait")!.done).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("compiles at every authored rung; L4 is the exam cold start, L5 is night (and stays DRY underfoot)", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_LN_OBSTACLE_MEETING, level).id).toBe(
        `sc-ln-obstacle-meeting@L${level}`,
      );
    }
    expect(compileScenario(SC_LN_OBSTACLE_MEETING, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_LN_OBSTACLE_MEETING, 4).examMode).toBe(true);
    expect(SC_LN_OBSTACLE_MEETING.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    // L5 — night: the difficulty axis is READING THE QUEUE, and after dark a
    // pair of headlights is the only evidence that a second car exists at all.
    const l5 = compileScenario(SC_LN_OBSTACLE_MEETING, 5);
    expect(l5.environment?.timeOfDay).toBe("night");
    // …and only L5 is dark: the queue is a DAYLIGHT lesson first (you can see
    // both cars and still misread them), which is what makes the night rung a
    // rung rather than a different template.
    expect(compileScenario(SC_LN_OBSTACLE_MEETING, 4).environment?.timeOfDay).not.toBe("night");
    // Physics stays DRY at every rung (ADR-006 stage 4a — the authored ghost
    // envelope is dry-tuned; a wet L5 would slide the shadow's 12 km/h arc into
    // the parked row it is threading).
    expect(l5.physics).toBeUndefined();
    // The queue rides every rung — it is the drill, not an L5 complication.
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(
        compileScenario(SC_LN_OBSTACLE_MEETING, level)
          .stagedEvents?.map((e) => e.kind)
          .sort(),
        `L${level}`,
      ).toEqual(["narrowMeeting", "oncomingStream"]);
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ln-obstacle-meeting@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ln-obstacle-meeting@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sc-vu-child-cyclist — the drill is won by NOT PASSING: a child on a bike does
//                       not hold a line, so the only margin that was ever real
//                       is the one you budgeted for where he might GO. He starts
//                       2.6 m off your lane centre and ends 0.6 m off it, and
//                       nothing announced the move (ЗДвП чл. 42 + чл. 20, ал. 2).
// ---------------------------------------------------------------------------

describe("wave-7 bot completion — sc-vu-child-cyclist at L3", () => {
  const lesson = compileScenario(SC_VU_CHILD_CYCLIST, 3);
  let session = createLessonSession(lesson);
  recordScVuChildCyclistDrive(loadDistrict("vu-child-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: all three objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_VU_CHILD_CYCLIST.rubric!).stars).toBe(3);
  });

  it("THE POINT, on the STUDENT path: the sheet is passed BECAUSE the car waited", () => {
    // The trace gate proves the recorder's engine sees a clean drive; this
    // proves the student-facing session agrees — and that „остани отзад" is a
    // GATE rather than narration. sc-vucc-hold-back carries maxSpeedKmh 14,
    // which is UNDER the runtime's own 15 km/h vulnerable-pass floor: reaching
    // (4.06, 80) inside it means the car was genuinely crawling behind the child
    // at the moment of the swerve. A driver already committed to a pass there
    // is, by construction, going too fast to satisfy it — so the only way this
    // sheet reads „passed, 3★" is a car that let the child show his line first.
    const hold = result.objectives.find((o) => o.id === "sc-vucc-hold-back")!;
    expect(hold.done).toBe(true);
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("VULNERABLE_PASS_TOO_CLOSE");
    expect(codes).not.toContain("COLLISION");
  });

  it("the drill runs in the taught order: hang back, THEN go wide, THEN come home", () => {
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    for (const id of ["sc-vucc-hold-back", "sc-vucc-wide", "sc-vucc-finish"]) {
      expect(at(id).done, id).toBe(true);
    }
    // The order IS the teaching, and the gates are position-exclusive: the wide
    // gate (radius 3.5 around x = −2.0) is unreachable from inside the driver's
    // own lane, so „изчакай и после излез широко" cannot be satisfied backwards.
    expect(at("sc-vucc-hold-back").completedAtSec!).toBeLessThan(at("sc-vucc-wide").completedAtSec!);
    expect(at("sc-vucc-wide").completedAtSec!).toBeLessThan(at("sc-vucc-finish").completedAtSec!);
  });

  it("carries the child into the live lesson — the wobble is staged, not narrated", () => {
    // Drop him and the student meets an empty 300 m residential street: there is
    // nothing to read, nothing to wait for, and the drill degenerates into
    // „drive to the end". The swerve IS the lesson's premise.
    const child = (lesson.stagedEvents ?? []).find((s) => s.id === "sc-vucc-child");
    expect(child).toBeDefined();
    expect(child!.kind).toBe("cutInLeadCar");
    if (child!.kind !== "cutInLeadCar") return;
    // The dials that make a cut-in actor a CHILD ON A BIKE rather than a cutter
    // — if any drifts, this becomes a different (already shipped) lesson:
    //  - a POSITIVE curb offset: it is what tags him a cyclist proxy (A11) and
    //    therefore what feeds the vulnerable-pass tracker at all;
    //  - a child's pace, capped, and an unreachable paceAheadM so matchPlayer
    //    saturates the cap instead of slaving him to the driver's speed;
    //  - the swerve fires off the ACTOR's own position (the drain at y = 100),
    //    so it happens because of the road, not because of you — VU-03's premise.
    expect(child!.actor.extraRightOffsetM).toBeCloseTo(2.6, 3);
    expect(child!.maxMatchSpeedMps).toBeCloseTo(2.6, 3);
    expect(child!.paceAheadM).toBeGreaterThan(300);
    expect(child!.cutAt).toEqual({ x: 6.66, y: 100 });
    expect(child!.cutShiftM).toBeCloseTo(-2.0, 3);
    // Graded on SHIPPED rules alone: no dial is opted in anywhere. чл. 42's
    // clearance lives in the runtime's vulnerable-pass tracker, default-on for
    // everyone, and the ghosts are dry-tuned (ADR-006 stage 4a).
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the LIVE session bills no phantom for the taught crawl and the wide excursion", () => {
    // Where a sloppy tune would surface: the car spends ~30 s at 9–11 km/h on a
    // street posted 30, then crosses the crown, holds the oncoming bank for
    // ~75 m, and comes home. Every detector this drill can anger is watching the
    // same minute, and the drill ORDERS all of it.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    for (const c of [
      "VULNERABLE_PASS_TOO_CLOSE",
      "COLLISION",
      "FOLLOWING_TOO_CLOSE",
      "POOR_LANE_KEEPING",
      "CROSSED_SOLID_LINE",
      "NOT_KEEPING_RIGHT",
      "SPEEDING_OVER_LIMIT",
      "HARSH_BRAKING_NO_CAUSE",
      "LANE_CHANGE_WITHOUT_INDICATOR",
    ]) {
      expect(codes).not.toContain(c);
    }
  });

  it("counter-proof: the nudge past the wobbling child is SCORED — on a sheet whose first half was PERFECT", () => {
    // The template's sharpest claim, made checkable on the student path. This
    // driver's first half is the shadow's, verbatim: he hangs back, he watches
    // the whole swerve, he is the only person on the street who KNOWS the child
    // does not hold a line — and he still clears the hold-back gate for it. Then
    // he passes at a metre of air anyway, because he measured the gap from the
    // CURB instead of from the child. The route was never the problem; the
    // arithmetic was. COLLISION is опасна, so it is SCORED with a toast rather
    // than a modal; VULNERABLE_PASS_TOO_CLOSE is основна, so its first encounter
    // pauses with a teach card (teach-first, doc 76 §0).
    let s = createLessonSession(compileScenario(SC_VU_CHILD_CYCLIST, 3));
    const taught: string[] = [];
    recordScVuChildCyclistDrive(loadDistrict("vu-child-v1"), "mistake-pass-in-wobble", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toContain("VULNERABLE_PASS_TOO_CLOSE");
    // He earned the first gate honestly — that is the demo's whole honesty.
    expect(r.objectives.find((o) => o.id === "sc-vucc-hold-back")!.done).toBe(true);
    // …and missed the one that mattered: he never went wide, he went AROUND.
    expect(r.objectives.find((o) => o.id === "sc-vucc-wide")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
    expect(s.events.filter((e) => e.kind === "violation").map((e) => e.code)).toContain("COLLISION");
  });

  it("counter-proof: the SAME metre of air, two seconds earlier, is billed anyway — and he got away with it", () => {
    // The mirror image, and the reason both demos exist. This driver worms past
    // the child at the identical margin 60 m BEFORE the drain, and nothing
    // happens to him: the swerve arrives seconds later, harmlessly, behind his
    // boot. The engine bills him regardless, because чл. 42 grades the gap you
    // left and not the outcome you were handed — and that is the only way a
    // drill can teach a habit whose bill does not arrive every time. He also
    // fails the very first gate: at 19 km/h he was never „behind" the child at
    // all, he was already passing him.
    let s = createLessonSession(compileScenario(SC_VU_CHILD_CYCLIST, 3));
    const taught: string[] = [];
    recordScVuChildCyclistDrive(loadDistrict("vu-child-v1"), "mistake-narrow", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toContain("VULNERABLE_PASS_TOO_CLOSE");
    expect(s.events.filter((e) => e.kind === "violation").map((e) => e.code)).not.toContain(
      "COLLISION",
    );
    expect(r.objectives.find((o) => o.id === "sc-vucc-hold-back")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("compiles at every authored rung; L4 is the exam cold start, L5 takes the wide line AWAY", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_VU_CHILD_CYCLIST, level).id).toBe(`sc-vu-child-cyclist@L${level}`);
    }
    expect(compileScenario(SC_VU_CHILD_CYCLIST, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_VU_CHILD_CYCLIST, 4).examMode).toBe(true);
    expect(SC_VU_CHILD_CYCLIST.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    // L5 adds ONE oncoming car timed to the swerve. Deliberately NOT rain: this
    // rung changes the ANSWER rather than the difficulty of the same answer —
    // the wide line every lower rung teaches is unavailable for exactly the
    // seconds the child needs it, and the only lawful move left is the second
    // half of the objective (stay back, brake — чл. 20, ал. 2). Physics stays
    // DRY (ADR-006 stage 4a): the authored ghost envelope is dry-tuned.
    const l5 = compileScenario(SC_VU_CHILD_CYCLIST, 5);
    expect(l5.stagedEvents).toHaveLength(2);
    expect((l5.stagedEvents ?? []).find((s) => s.id === "sc-vucc-oncoming")!.kind).toBe(
      "oncomingStream",
    );
    expect(l5.environment?.rain).not.toBe(true);
    expect(l5.physics).toBeUndefined();
    // The child rides them all — he is the drill, not a complication.
    for (const level of [1, 2, 3, 4] as const) {
      expect(
        compileScenario(SC_VU_CHILD_CYCLIST, level).stagedEvents?.map((e) => e.kind),
        `L${level}`,
      ).toEqual(["cutInLeadCar"]);
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-vu-child-cyclist@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-vu-child-cyclist@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sc-sp-eco-coast — the drill is won BEFORE the line: read the red early, lift
//                   off, and let the engine brake the car down to a smooth halt.
//                   The graded fault of NOT doing so is the overrun the late
//                   brake buys (STOP_LINE_OVERSHOOT), and its mirror is the
//                   wasted stop's second cost (HESITATION_AT_GREEN). The first
//                   attempt was BLOCKED because HARSH_BRAKING_NO_CAUSE is
//                   unreachable here — a visible red is a lawful cause to brake
//                   for the whole 120 m the runtime can see it; these two codes
//                   are the honest, reachable ones.
// ---------------------------------------------------------------------------

describe("wave-7 bot completion — sc-sp-eco-coast at L3", () => {
  const lesson = compileScenario(SC_SP_ECO_COAST, 3);
  let session = createLessonSession(lesson);
  recordScSpEcoCoastDrive(loadDistrict("sx-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: all three objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_SP_ECO_COAST.rubric!).stars).toBe(3);
  });

  it("THE POINT, on the STUDENT path: the coast is a GATE, not narration", () => {
    // The trace gate proves the recorder's engine sees a clean drive; this proves
    // the student-facing session agrees — and that the lift-off is a GATE rather
    // than a slogan. sc-ecoc-coast is a reachZone 17 m short of the line, on the
    // lane centre, capped at 36 km/h: a driver who lifted off at ~80 m is already
    // under it (the shadow reads ~23 km/h), while a driver who keeps the gas on
    // arrives at ~50 and misses it entirely. Because objectives advance
    // sequentially, a racer who blows the coast gate never activates the rest.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    for (const id of ["sc-ecoc-coast", "sc-ecoc-pass", "sc-ecoc-exit"]) {
      expect(at(id).done, id).toBe(true);
    }
    expect(at("sc-ecoc-coast").completedAtSec!).toBeLessThan(at("sc-ecoc-pass").completedAtSec!);
    expect(at("sc-ecoc-pass").completedAtSec!).toBeLessThan(at("sc-ecoc-exit").completedAtSec!);
  });

  it("stages NOTHING and opts into NOTHING but the arrival pin", () => {
    // Every dial this drill could have reached for is deliberately empty, and
    // each absence is load-bearing:
    //  - no staged actor: the empty corridor is the point — a lead car would give
    //    the late brake a confounding cause and dissolve the overshoot demo;
    //  - no ruleConfig: STOP_LINE_OVERSHOOT and HESITATION_AT_GREEN are default-on
    //    for everyone (no config gate), so the student's own attempt grades too;
    //  - no physics: the ghosts are dry-tuned (ADR-006 stage 4a).
    // The ONE dial it does set is the signal pin — without it a wall-clock
    // arrival could land on green and delete the „see the red early" premise.
    expect(lesson.stagedEvents ?? []).toEqual([]);
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
    expect(lesson.signalPlan).toEqual({ arm: "redFresh", triggerM: 45 });
  });

  it("the LIVE session bills no phantom for the lawful coast itself", () => {
    // Where a sloppy tune would surface: the car sheds 27 km/h by lifting off,
    // eases to a dead stop in front of a red line, waits, and pulls away on the
    // green. A brake for a red is a lawful response, and a stop in front of the
    // paint is exactly right — none of it may cost a thing.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    for (const c of [
      "HARSH_BRAKING_NO_CAUSE",
      "STOP_LINE_OVERSHOOT",
      "RED_LIGHT_CROSSED",
      "HESITATION_AT_GREEN",
      "SPEEDING_OVER_LIMIT",
      "POOR_LANE_KEEPING",
    ]) {
      expect(codes).not.toContain(c);
    }
  });

  /** Replay a demo through a LIVE session at one rung, splitting the coach's two
   *  channels: what it TAUGHT (first-encounter pause card) vs what it SCORED. */
  const replay = (name: Parameters<typeof recordScSpEcoCoastDrive>[1], level: 3 | 4) => {
    let s = createLessonSession(compileScenario(SC_SP_ECO_COAST, level));
    const taught: string[] = [];
    recordScSpEcoCoastDrive(loadDistrict("sx-v1"), name, {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    return {
      taught,
      scored: s.events.filter((e) => e.kind === "violation").map((e) => e.code),
      r: buildLessonResult(s),
    };
  };

  it("counter-proof: „газ до последно“ overshoots the line — TAUGHT at L3, SCORED at L4, never finishes", () => {
    // The template's first claim. This driver kept the gas on to the line and the
    // late brake could not stop him in front of it — the nose ran onto the mouth
    // of the junction. STOP_LINE_OVERSHOOT is второстепенна, so the FIRST
    // encounter pauses with a card and costs no points (teach-first, doc 76 §0),
    // and at the exam rung the same drive is billed one point instead.
    const l3 = replay("mistake-late-brake", 3);
    expect(l3.taught).toContain("STOP_LINE_OVERSHOOT");
    expect(l3.scored).not.toContain("STOP_LINE_OVERSHOOT");
    // The harsh stab itself is a LAWFUL red response and is never billed, and he
    // never runs the red — the overrun clears only once the light opens.
    expect(l3.scored).not.toContain("HARSH_BRAKING_NO_CAUSE");
    expect(l3.scored).not.toContain("RED_LIGHT_CROSSED");
    // …and the drill does not complete: keeping the gas on misses the coast gate,
    // and objectives advance sequentially, so the sheet stalls at step one.
    expect(l3.r.objectives.find((o) => o.id === "sc-ecoc-coast")!.done).toBe(false);
    expect(l3.r.completedAll).toBe(false);
    const l4 = replay("mistake-late-brake", 4);
    expect(l4.taught).toEqual([]);
    expect(l4.scored).toEqual(["STOP_LINE_OVERSHOOT"]);
    expect(l4.r.score).toBe(1); // one второстепенна (Наредба-38, rules/scoring.ts)
    expect(l4.r.completedAll).toBe(false);
  });

  it("counter-proof: the clean stop that dawdles on green — TAUGHT at L3, SCORED at L4, still finishes", () => {
    // The mirror image, and the reason both demos exist. This driver coasted
    // perfectly — he cleared the coast gate — but then sat through the opening
    // green. HESITATION_AT_GREEN is второстепенна: taught first at L3 (no points,
    // and the sheet still passes), billed one point at L4. Unlike the overshoot,
    // this drive DOES complete — the fault is the delay, not the route.
    const l3 = replay("mistake-sleep-at-green", 3);
    expect(l3.taught).toContain("HESITATION_AT_GREEN");
    expect(l3.scored).not.toContain("HESITATION_AT_GREEN");
    expect(l3.scored).not.toContain("STOP_LINE_OVERSHOOT"); // the stop was in front of the line
    expect(l3.r.objectives.find((o) => o.id === "sc-ecoc-coast")!.done).toBe(true);
    expect(l3.r.completedAll).toBe(true);
    expect(l3.r.passed).toBe(true);
    const l4 = replay("mistake-sleep-at-green", 4);
    expect(l4.taught).toEqual([]);
    expect(l4.scored).toEqual(["HESITATION_AT_GREEN"]);
    expect(l4.r.score).toBe(1);
    expect(l4.r.passed).toBe(true); // one второстепенна < the 9-point budget
    expect(l4.r.completedAll).toBe(true);
    expect(scoreRubric(l4.r, SC_SP_ECO_COAST.rubric!).stars).toBeLessThanOrEqual(2);
  });

  it("compiles at every authored rung; L4 is the exam cold start, and there is no L5", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_SP_ECO_COAST, level).id).toBe(`sc-sp-eco-coast@L${level}`);
    }
    expect(compileScenario(SC_SP_ECO_COAST, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_SP_ECO_COAST, 4).examMode).toBe(true);
    // No L5 by design (the backlog's own rung list): the difficulty axis here is
    // anticipation timing, not grip or light — a wet/night rung would want the
    // ADR-006 stage-4a physics opt-in the dry-tuned ghost cannot honour.
    expect(SC_SP_ECO_COAST.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
    // The arrival pin rides every rung; nothing else is staged at any rung.
    for (const level of [1, 2, 3, 4] as const) {
      const l = compileScenario(SC_SP_ECO_COAST, level);
      expect(l.signalPlan, `L${level}`).toEqual({ arm: "redFresh", triggerM: 45 });
      expect(l.stagedEvents ?? [], `L${level}`).toEqual([]);
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-sp-eco-coast@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-sp-eco-coast@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });
});
