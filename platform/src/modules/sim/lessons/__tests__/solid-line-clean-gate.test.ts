/**
 * THE CAR STAYED ON ITS OWN SIDE OF THE М1 THE BANNER NAMES —
 * `requireSolidLineClean`, the thirteenth ReachZoneWitnessDemand
 * (sc-ov-solid-return:b542b84e, critical).
 *
 * WHAT WAS ACTUALLY WRONG, re-derived through the production pipeline at HEAD
 * on 2026-09-03 rather than inherited from the report — a report is as stale as
 * the day it was written, and this one was filed against sweep161 (2026-08-18).
 *
 * The row read: *„pc-wrong — a 70 км/ч drive that collides and is convicted
 * five times — is the ONLY leg of the four that gets ✓ on «Премини участъка с
 * непрекъсната линия в своята лента», the skill the lesson is named for … The
 * lesson credits its core competence to the drive that failed it."* Two of its
 * three sentences are harness artefacts (both „correct" legs were `forcedBy:
 * Прекрати урока` after crawling the road at 15–20 км/ч, and w23's own log
 * caveats them as WANDERED). The last sentence is not, and it is worse than
 * filed: the gate can be earned by a drive that crossed the very line.
 *
 * THE DRIVE, on the path this template itself advertises. Instruction 7 tells
 * the student that DECLINING the overtake is a full performance («маневра без
 * изход не се прави, а решението „не сега“ е самото умение»), so a driver who
 * trails the crawler through the whole М2 window ticks `sc-ovsr-pass`
 * (lane-agnostic since ledger B8) and `sc-ovsr-home` (he never left his lane)
 * honestly. Then he loses patience INSIDE the М1 span and overtakes there.
 * Measured through `compileScenario → createLessonSession → applyTick` — the
 * same entry point `LessonPlayShell.tsx` calls — before the demand existed:
 *
 *   L1  scored []  coached [CROSSED_SOLID_LINE]  sc-ovsr-finish ✓ @0:45
 *   L3  scored []  coached [CROSSED_SOLID_LINE]  sc-ovsr-finish ✓ @0:45
 *
 *   → completedAll TRUE, passed TRUE, score 0.
 *
 * The lesson is called „Прибери се преди плътната линия" and it was PASSED by
 * the drive that crossed the плътна линия. `sc-ovsr-finish` was
 * `{kind:"reachZone", x:4.06, y:560, radiusM:5}` — a disc sixty metres PAST the
 * end of the span, so it could say the car came out and nothing about which
 * half of the carriageway it spent the span on. Arrival was the whole
 * certificate.
 *
 * Both measurement rows are the COACHED channel, which is why the demand reads
 * it: `CROSSED_SOLID_LINE` is основна since the 2026-08-09 Наредба № 38
 * grounding pass, so the teach-first coach hands the first offence over as a
 * free mini-lesson and the sheet stays empty. A ledger-only read would have
 * refused nothing outside exam mode.
 *
 * THE SCRIPT LIVES HERE, not in `traces/scOvSolidReturn.ts`: it is a
 * counter-example for a gate, not a demo the student is ever shown, and adding
 * it to `SCRIPTS` would put a fourth committed recording under the drill's
 * determinism law for no pedagogical gain.
 *
 * THE MUTATION THAT REDDENS §1: drop `solidLineOk` from `arrivalHonoured` in
 * `stepReachZone`, or delete the `requireSolidLineClean` line from
 * `serializeObjectiveParams`'s whitelist — the second is the dead-predicate
 * shape `rail-clear-gate.test.ts` was written after, and §4 is the guard that
 * catches it. Removing the `terminalUnearnable` arm in `engine.ts` reddens the
 * no-trap case in §1 instead of §5, which is the ordering that matters: the
 * trap check runs before the refusal is trusted.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonObjective, StagedEventSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import { recordScOvSolidReturnDrive, type ScOvSolidReturnTraceName } from "../../traces/scOvSolidReturn";
import { recordScriptedDrive, type DriveScript } from "../../traces/recorder";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import {
  createEvalState,
  parseObjectiveParams,
  stepObjective,
  type ObjectiveContext,
  type WitnessedReachZoneParams,
} from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import { SC_OV_SOLID_RETURN } from "../scenario/templates-lanes2";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

/** ov-solid2-v1 pins (the template's own denormalized copies). */
const X_OWN = 4.06;
const X_OUT = -2.5;

/**
 * „НЕ СЕГА" — И ПОСЛЕ ВСЕ ПАК. The drive the demand was written for: the
 * lawful refusal instruction 7 asks for, followed by the overtake taken where
 * the marking forbids it. Trails the crawler past the warning dashes, is fully
 * home in its own lane at the map's returnByY, then pulls out at y ≈ 320 —
 * inside the М1 span at y ∈ [300, 500] — passes on the wrong bank and comes
 * back at y ≈ 450, still inside it.
 */
function declineThenCrossScript(): DriveScript {
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 120]], targetKmh: 36, stopAtEnd: false },
      // The whole М2 window spent behind the crawler — lawful, and what the
      // briefing calls a full performance of the drill.
      { kind: "drive", points: [[X_OWN, 120], [X_OWN, 290]], targetKmh: 38, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      // …and then out anyway, across the непрекъсната осева.
      { kind: "drive", points: [[X_OWN, 290], [X_OWN, 320], [0.8, 335], [X_OUT, 350]], targetKmh: 55, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OUT, 350], [X_OUT, 420]], targetKmh: 70, stopAtEnd: false },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 420], [0.8, 435], [X_OWN, 450]], targetKmh: 70, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OWN, 450], [X_OWN, 570]], targetKmh: 60 },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

interface DriveOutcome {
  session: LessonSessionState;
  /** `code` of every SCORED violation, in order. */
  scored: string[];
  /** `code` of every violation the student was SHOWN but not charged for. */
  coached: string[];
  /** objective id → whether the certificate was issued. */
  done: Record<string, boolean>;
  completedAll: boolean;
  passed: boolean;
}

function outcomeOf(session: LessonSessionState): DriveOutcome {
  const result = buildLessonResult(session);
  const done: Record<string, boolean> = {};
  for (const o of result.objectives) done[o.id] = o.done;
  return {
    session,
    scored: session.events.filter((e) => e.kind === "violation").map((e) => e.code),
    coached: (session.coachedMistakes ?? []).map((m) => m.code),
    done,
    completedAll: result.completedAll,
    passed: result.passed,
  };
}

/** The production path a student's drive takes, from template to end screen. */
function driveScripted(level: ScenarioLevel, examMode = false): DriveOutcome {
  const compiled = compileScenario(SC_OV_SOLID_RETURN, level);
  const lesson = examMode ? { ...compiled, examMode: true } : compiled;
  let session: LessonSessionState = createLessonSession(lesson);
  recordScriptedDrive(loadDistrict("ov-solid2-v1"), declineThenCrossScript(), {
    scenarioId: "sc-ov-solid-return",
    kind: "mistake",
    seed: 7,
    stagedEvents: [...(SC_OV_SOLID_RETURN.staged ?? [])] as StagedEventSpec[],
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  return outcomeOf(session);
}

/** …and the same path for the drill's three COMMITTED authored drives. */
function driveAuthored(name: ScOvSolidReturnTraceName, level: ScenarioLevel): DriveOutcome {
  let session: LessonSessionState = createLessonSession(compileScenario(SC_OV_SOLID_RETURN, level));
  recordScOvSolidReturnDrive(loadDistrict("ov-solid2-v1"), name, {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  return outcomeOf(session);
}

// ---------------------------------------------------------------------------
// §1 — the drive that made the demand: convicted AND credited, on one sheet
// ---------------------------------------------------------------------------

describe("§1 requireSolidLineClean — a crossing withdraws «премини … в своята лента»", () => {
  for (const level of [1, 3] as const) {
    it(`L${level}: the coached основна is the whole ledger — and it still falsifies the banner`, () => {
      const out = driveScripted(level);
      // Teach-first-then-grade: the sheet deliberately charges nothing…
      expect(out.scored).toEqual([]);
      // …but the student was shown the card, and the debrief prints the row.
      expect(out.coached).toEqual(["CROSSED_SOLID_LINE"]);
      // The two honest ticks stay honest: he really did reach the commitment
      // mark, and he really was home in his own lane before the М1 span.
      expect(out.done["sc-ovsr-pass"]).toBe(true);
      expect(out.done["sc-ovsr-home"]).toBe(true);
      // Before the demand this read `true`, with completedAll and passed TRUE.
      expect(out.done["sc-ovsr-finish"]).toBe(false);
      expect(out.completedAll).toBe(false);
      expect(out.passed).toBe(false);
    });
  }

  it("A REFUSAL MAY NOT DOUBLE AS A TRAP — the drive still ends by itself", () => {
    // `sc-ovsr-finish` IS the terminal gate (3 of 3), so this is the one census
    // in the file where the `terminalUnearnable` arm is load-bearing rather
    // than precautionary: without it nothing advances `currentIndex`, the
    // run-out never arms, and the student reaches the card that teaches him М1
    // only by quitting — forfeiting the attempt's XP and its calibration.
    for (const level of [1, 3] as const) {
      expect(driveScripted(level).session.phase, `L${level}`).toBe("completed");
    }
  });

  it("examMode: the same act on the SCORED channel refuses identically", () => {
    // `examMode` bypasses the teach-first coach (A13), which is also the state a
    // training drive is in once the free mini-lesson has been spent.
    const out = driveScripted(1, true);
    expect(out.scored).toEqual(["CROSSED_SOLID_LINE"]);
    expect(out.done["sc-ovsr-finish"]).toBe(false);
    expect(out.session.phase).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// §2 — IT CANNOT REFUSE A CORRECT DRIVE (the half checked before the half that
//      refuses)
// ---------------------------------------------------------------------------

describe("§2 the drill's own authored drives are bit-identical to shipped", () => {
  for (const level of [1, 3] as const) {
    it(`L${level}: shadow-correct still books zero faults and all three certificates`, () => {
      // 75 m of the oncoming bank at 80 км/ч across М2 dashes, home fifty
      // metres before the wall: the demand's channel is the CONVICTION, not a
      // bank flip, so a lawful excursion is untouched.
      const out = driveAuthored("shadow-correct", level);
      expect(out.scored).toEqual([]);
      expect(out.coached).toEqual([]);
      expect(out.done).toEqual({
        "sc-ovsr-pass": true,
        "sc-ovsr-home": true,
        "sc-ovsr-finish": true,
      });
      expect(out.completedAll).toBe(true);
      expect(out.passed).toBe(true);
    });
  }

  it("THE SPLIT HOLDS: the чл. 42 demo is refused by its own gate, not by this one", () => {
    // `mistake-late-cut` returns onto the dashed road at y ≈ 284 and provably
    // never touches the М1 span, so this demand has nothing to say about it —
    // it fails `sc-ovsr-home` exactly as it did before, and the chain being
    // sequential the finish gate is never even stepped. A demand that started
    // answering for its neighbour's fault would destroy the pair's whole point.
    const out = driveAuthored("mistake-late-cut", 3);
    expect(out.coached).toEqual(["OVERTAKE_RETURN_TOO_EARLY"]);
    expect(out.done["sc-ovsr-home"]).toBe(false);
    expect(out.done["sc-ovsr-finish"]).toBe(false);
  });

  it("the solid-return demo is refused twice over, and still reaches its debrief", () => {
    const out = driveAuthored("mistake-return-on-solid", 3);
    expect(out.coached).toEqual(["CROSSED_SOLID_LINE"]);
    expect(out.done["sc-ovsr-finish"]).toBe(false);
    expect(out.session.phase).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// §3 — the evaluator's own polarity, at the unit level
// ---------------------------------------------------------------------------

function tickAt(y: number, t: number): SimTick {
  return {
    t,
    dt: 1 / 60,
    position: { x: X_OWN, y },
    headingDeg: 0,
    speedKmh: 30,
    gear: "D",
    headlights: "off",
    indicator: "off",
    seatbeltOn: true,
    handbrakeOn: false,
  } as unknown as SimTick;
}

function reaches(params: WitnessedReachZoneParams, ctx: ObjectiveContext): boolean {
  let state = stepObjective(params, createEvalState(params), tickAt(520, 0), ctx).evalState;
  for (let i = 1; i <= 40; i++) {
    const step = stepObjective(params, state, tickAt(520 + i * 2, i), ctx);
    if (step.done) return true;
    state = step.evalState;
  }
  return false;
}

describe("§3 unknown is never a refusal, and the fact answers for nothing else", () => {
  const GATED: WitnessedReachZoneParams = {
    kind: "reachZone",
    x: X_OWN,
    y: 560,
    radiusM: 5,
    requireSolidLineClean: true,
  };
  const BARE: WitnessedReachZoneParams = { kind: "reachZone", x: X_OWN, y: 560, radiusM: 5 };
  const EMPTY: ObjectiveContext = { stagedOutcomes: [], redsMetInRun: 0 };

  it("a context that cannot answer leaves the demand MET (every fixture, rig and replay)", () => {
    expect(reaches(GATED, EMPTY)).toBe(true);
    expect(reaches(GATED, { ...EMPTY, crossedSolidLineInRun: false })).toBe(true);
  });

  it("the crossing, and only the crossing, refuses", () => {
    expect(reaches(GATED, { ...EMPTY, crossedSolidLineInRun: true })).toBe(false);
    // A neighbour's fact must not be answered for by this demand.
    expect(reaches(GATED, { ...EMPTY, restedInBanZoneInRun: true })).toBe(true);
  });

  it("a gate without the key never consults the fact", () => {
    expect(reaches(BARE, { ...EMPTY, crossedSolidLineInRun: true })).toBe(true);
  });

  it("an authored value other than `true` is refused at parse time, not honoured", () => {
    expect(() =>
      parseObjectiveParams({
        id: "x",
        titleBg: "x",
        kind: "reachZone",
        params: { kind: "reachZone", x: 0, y: 0, radiusM: 4, requireSolidLineClean: false },
      } as unknown as LessonObjective),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// §4 — THE KEY SURVIVES THE LADDER (the dead-predicate guard)
// ---------------------------------------------------------------------------

describe("§4 the compiled rung carries the demand", () => {
  it("`serializeObjectiveParams` is a whitelist — the key must reach the SESSION", () => {
    // `requireRailClear` was authored, parsed, read by the evaluator and gated
    // at template level, and the barred creep still collected its certificate:
    // the key never crossed `scenario/params.ts`. Same boundary, same guard.
    for (const level of [1, 2, 3, 4] as const) {
      const lesson = compileScenario(SC_OV_SOLID_RETURN, level);
      const finish = lesson.objectives.find((o) => o.id === "sc-ovsr-finish")!;
      expect(finish.params.requireSolidLineClean, `L${level}`).toBe(true);
      const parsed = parseObjectiveParams(finish) as WitnessedReachZoneParams;
      expect(parsed.requireSolidLineClean, `L${level} parsed`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// §5 — THE OTHER DIRECTION: a banner that names the непрекъсната must measure
//      it. The teeth that stop the class coming back one template at a time.
// ---------------------------------------------------------------------------

describe("§5 the census — every banner that names the line, reads the conviction", () => {
  it("no reachZone title claims a непрекъсната without a requireSolidLineClean key", () => {
    const naked: string[] = [];
    const carrying: string[] = [];
    for (const t of SCENARIO_TEMPLATES) {
      for (const rung of t.levels) {
        const lesson = compileScenario(t, rung.level);
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone" || !/непрекъснат/i.test(o.titleBg)) continue;
          const parsed = parseObjectiveParams(o as LessonObjective) as WitnessedReachZoneParams;
          const row = `${t.id}/${o.id}`;
          if (parsed.requireSolidLineClean !== true) naked.push(row);
          else if (!carrying.includes(row)) carrying.push(row);
        }
      }
    }
    expect(naked).toEqual([]);
    // The census as it stood when the demand landed — ONE gate in the whole
    // catalogue. A new member is welcome; it just may not arrive silently.
    //
    // AND THE POPULATION IS DELIBERATELY NARROW. Fourteen reachZone banners say
    // «в своята лента» (sc-ov-solid-line/sc-ovsl-finish, sc-ov-oncoming-gap/
    // sc-ovg-finish, sc-ln-obstacle-meeting/sc-lnom-home …), and matching on
    // those words would hand the demand to eleven drills on districts with no
    // М1 span authored at all — „a guess wearing a census's clothes", in the
    // words of the `requireNoContact` block. Only the sentence that names the
    // marking is the sentence this conviction can falsify.
    expect(carrying).toEqual(["sc-ov-solid-return/sc-ovsr-finish"]);
  });
});
