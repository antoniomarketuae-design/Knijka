/**
 * THE BUS-STOP DRILL'S OWN FAIL PATH — „Спирка не е паркинг" (sc-pk-busstop-ban
 * on pk-busstop-v1, doc 72 PK-06), audit row `sc-pk-busstop-ban:105f805c`,
 * major.
 *
 * THE ROW, in its own words: «Nothing proves a student who stops inside the
 * bus-stop zone is penalised — the lesson's own fail path is unverified.» The
 * judge who sustained it added the clause that made it worth writing: what the
 * w37 leg photographed is not a blind engine but a FIRST offence deliberately
 * left unpriced with an escalation promised — «Първата среща не се наказва …
 * При повторение вече влиза в изпитния лист» — and the promise had never been
 * tested. That is the shape of `STANDING_DUTY_REGRADE_SEC`'s own motivating
 * defect one file over («There is never a повторение, because the reducer never
 * asks a second time»), so a promise of escalation is exactly the sentence this
 * product may not leave unmeasured.
 *
 * WHAT WAS ALREADY GATED, AND WHY IT DID NOT REACH THE STUDENT. Three suites
 * touch this drill and not one of them asks what a LEARNER ends up with:
 *  · `traces/__tests__/sc-pk-busstop-ban-traces.test.ts` reads
 *    `RecordedDrive.ruleEvents` — the RULE ENGINE's output, upstream of the
 *    teach-first coach. It proves the detector fires; it cannot see whether the
 *    fault was charged, coached or swallowed.
 *  · `rest-clean-gate.test.ts` §6 proves this lesson's banner CARRIES
 *    `requireRestClean: "banZone"` — membership in a census, not a bite. Its
 *    end-to-end sections §1–§4 drive `sc-pk-rail-ban`, a different map with a
 *    different basis and a different detector arm.
 *  · `world/__tests__/pk-busstop-districts.test.ts` locks the detector's
 *    INNOCENT side (the queue lead, the brief stop, the legal bay).
 * Between them the fault is detected, the key is authored and the acquittals
 * hold — and nobody had driven the drill's own ❌ demos through the session the
 * student plays. This file is that drive.
 *
 * WHAT IT MEASURES (production stack, `compileScenario → createLessonSession →
 * applyTick → buildLessonResult`, the entry point `LessonPlayShell.tsx` calls
 * at :4060/:5006 — not a fixture, not a rig):
 *
 *   L1 training  mistake-stop-on-pocket   scored []  coached [BAN_ZONE]
 *                                         sc-pkbs-past-zone REFUSED
 *                                         ADR-009: НЕ Е ВЗЕТ, uncharged hit
 *   L4 exam      mistake-stop-on-pocket   scored [BAN_ZONE] osnovni 3
 *                                         sc-pkbs-past-zone REFUSED
 *   L1 training  8 s held rest            coached only — the free lesson
 *   L1 training  11 s held rest           coached only; the re-bill is DROPPED
 *                                         …targets stripped: scored, `regrade`
 *
 * So the fail path DOES bite, on both channels, and the escalation the debrief
 * promises is real: `BAN_ZONE_REST_REGRADE_SEC` (6 s on top of the 4 s
 * `banZoneStopRestSec`) turns a held rest into the charge the free mini-lesson
 * consumed. None of it was pinned anywhere. Now it is.
 *
 * WHAT ADR-009 CHANGED HERE, 2026-09-18 (founder Ruling A, doc 92 §3.4b b/g and
 * §8.1 T4). Stopping on the spirka is the mistake THIS lesson exists to teach,
 * so two things move and both are argued in §3's own block: the re-bill of that
 * one continuing rest is dropped, because the ruling forbids the points it was
 * reaching for; and the drive is NOT PASSED, which is a stronger answer to
 * `sc-pk-busstop-ban:105f805c` than three наказателни точки were. The re-grade
 * machinery itself stays measured through a strip control that removes only
 * `lessonMistakeTargets` and watches the −3 come back.
 *
 * THE HALF THIS FILE DELIBERATELY DOES NOT ASSERT, and it is REPORTED, NOT
 * PATCHED. The card the student reads on this map is the POOLED
 * `ILLEGAL_STOP_IN_BAN_ZONE` row: «Спря в участък, в който престоят е забранен
 * — ПОД ЗНАК В27 …», lawRef «ЗДвП чл. 6, т. 1 …», on a district that carries no
 * plate at all and whose entire subject is a зигзаг. `rules/types.ts
 * NoStopBasis` records why («"law-busstop" IS DELIBERATELY ABSENT … a
 * content-truth ruling for the founder»). Freezing that sentence in an
 * assertion here would make the miscitation harder to remove, so this suite
 * stays silent about the copy and says so out loud instead.
 *
 * THE MUTATIONS THAT REDDEN IT — every section has one:
 *  §1 drop the coached arm of `banZoneRestCoached` (lessons/engine.ts:1755) and
 *     the training refusal disappears while the exam one survives;
 *  §2 delete `requireRestClean` from `serializeObjectiveParams`'s whitelist
 *     (scenario/params.ts:267) — the dead-predicate shape, and §5's guard;
 *  §3 set `BAN_ZONE_REST_REGRADE_SEC` unreachable (rules/engine.ts) and the
 *     promise becomes a lie again;
 *  §4 is the false-refusal side: any widening that convicts the shadow.
 *
 * …AND §6 DOES NOT DESCRIBE ITS MUTATION, IT RUNS IT. This suite was green on
 * its first execution, which on this corpus is worth nothing on its own: 51 of
 * 82 audited repairs shipped a predicate nothing live reads, and every one of
 * them had a green test. So §6 strips `requireRestClean` off a COPY of the
 * compiled lesson — no other lane's file is touched — re-drives the same two
 * recordings, and asserts the certificate is then WRONGLY ISSUED. §1 and §6
 * are the same drive through the same harness with opposite answers, so
 * neither can be a constant. Two further controls sit inside the suite for the
 * same reason: §4's 2 s brush of the brakes (clean, certificate granted) and
 * §3's 8 s-vs-11 s pair (coached, then charged).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonObjective, LessonSpec } from "../../contracts";
import { recordScriptedDrive, type DriveScript } from "../../traces/recorder";
import {
  recordScPkBusstopBanDrive,
  type ScPkBusstopBanTraceName,
} from "../../traces/scPkBusstopBan";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import { parseObjectiveParams, type WitnessedReachZoneParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SC_PK_BUSSTOP_BAN } from "../scenario/templates-parking2";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

/** The single northbound lane center of pk-busstop-v1 (1+1, perceptual scale). */
const X_LANE = 4.06;
/** Inside `pkbs-z-stop-pocket` (y ∈ [180, 210]) — the bay itself. */
const Y_IN_POCKET = 195;
/** The one legal mark, 40 m past every чл. 98 span. */
const Y_LEGAL_BAY = 250;
/** The gate that carries the demand — «…без да спираш в нея». */
const PAST_ZONE = "sc-pkbs-past-zone";

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}
const district = loadDistrict("pk-busstop-v1");

interface DriveOutcome {
  session: LessonSessionState;
  /** `code` of every SCORED violation — what reaches the изпитен лист. */
  scored: string[];
  /** `code` of every violation the student was SHOWN but not charged for. */
  coached: string[];
  /** objective id → whether the certificate was issued. */
  done: Record<string, boolean>;
  /** The official sheet, so a claim about −3 is read where the student reads it. */
  score: { totalPoints: number; osnovniPoints: number; osnovniCount: number };
  /** Was the charge the RE-GRADE (the second bill) rather than the first? */
  regrades: boolean[];
  /** ADR-009: the lesson's own mistakes, as `foldLessonMistakes` read them. */
  lessonMistakes: { code: string; charged: boolean }[];
  /** ADR-009: the whole verdict — «взет» is what this drill is really about. */
  passed: boolean;
}

/**
 * Play one drive of this drill exactly as the shell plays it.
 *
 * `examMode` IS NOT A PARAMETER, on purpose. L4 of this template compiles to
 * `examMode: true` (`scenario/compile.ts rungExamMode` — «the default is `level
 * === 4`»), so the exam evidence below is the SHIPPED rung a student actually
 * reaches, not a flag this test set behind the product's back. A gate that has
 * to construct the mode it is testing proves a code path; this one proves a
 * lesson.
 */
function playRecorded(name: ScPkBusstopBanTraceName, level: ScenarioLevel): DriveOutcome {
  let session: LessonSessionState = createLessonSession(compileScenario(SC_PK_BUSSTOP_BAN, level));
  recordScPkBusstopBanDrive(district, name, {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  return finish(session);
}

/**
 * The same session, driven by a script this file owns — the ONLY way to ask the
 * escalation question, because both committed demos rest ~5 s and stop short of
 * the re-grade by design (they are teaching demonstrations, not stress tests).
 * Nothing is written: `recordScriptedDrive` returns a recording, and the
 * committed traces are untouched by anything here.
 */
type LessonTweak = (lesson: LessonSpec) => LessonSpec;

/**
 * ADR-009's own control. `lessonMistakeTargets` is the ONE field the ruling
 * reads (`lessonMistake.ts lessonMistakeTargetCodes`), so removing it from a
 * COPY of the compiled lesson reproduces the pre-ADR-009 product exactly — the
 * rollback the spec's dead-predicate ledger describes, run here rather than
 * asserted. Nothing else about the drill moves, which is what makes the pair of
 * answers attributable to the ruling and to nothing else.
 */
const stripLessonMistakeTargets: LessonTweak = (lesson) => {
  const copy = { ...lesson };
  delete (copy as { lessonMistakeTargets?: unknown }).lessonMistakeTargets;
  return copy;
};

function playHeldRest(restSec: number, tweak?: LessonTweak): DriveOutcome {
  const script: DriveScript = {
    steps: [
      {
        kind: "drive",
        points: [
          [X_LANE, 15],
          [X_LANE, 100],
          [X_LANE, 160],
          [X_LANE, Y_IN_POCKET],
        ],
        targetKmh: 30,
      },
      { kind: "pause", sec: restSec, brake: true },
      {
        kind: "drive",
        points: [
          [X_LANE, Y_IN_POCKET],
          [X_LANE, 225],
          [X_LANE, Y_LEGAL_BAY],
        ],
        targetKmh: 20,
      },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
  const compiled = compileScenario(SC_PK_BUSSTOP_BAN, 1);
  let session: LessonSessionState = createLessonSession(
    tweak === undefined ? compiled : tweak(compiled),
  );
  recordScriptedDrive(district, script, {
    scenarioId: "sc-pk-busstop-ban",
    kind: "mistake",
    seed: 7,
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  return finish(session);
}

function finish(session: LessonSessionState): DriveOutcome {
  const result = buildLessonResult(session);
  const done: Record<string, boolean> = {};
  for (const o of result.objectives) done[o.id] = o.done;
  return {
    session,
    done,
    scored: session.events
      .filter((e) => e.kind === "violation")
      .map((e) => (e as { code: string }).code),
    coached: (session.coachedMistakes ?? []).map((m) => m.code),
    score: {
      totalPoints: result.summary.score.totalPoints,
      osnovniPoints: result.summary.score.osnovniPoints,
      osnovniCount: result.summary.score.osnovniCount,
    },
    regrades: result.summary.mistakes
      .filter((m) => (m as { code?: string }).code === "ILLEGAL_STOP_IN_BAN_ZONE")
      .map((m) => (m as { regrade?: boolean }).regrade === true),
    lessonMistakes: (result.lessonMistakes ?? []).map((h) => ({
      code: h.code,
      charged: h.charged,
    })),
    passed: result.passed,
  };
}

const DEMOS = ["mistake-stop-on-pocket", "mistake-stop-on-marking"] as const;

// ---------------------------------------------------------------------------
// §1 — TRAINING: the offence is SHOWN and not charged, and the drill still
//      refuses to certify. This is the mode a learner is in for three of the
//      four rungs, so it is the one the row was really about.
// ---------------------------------------------------------------------------

describe("§1 L1–L3 — the free mini-lesson does not buy the certificate", () => {
  for (const level of [1, 2, 3] as const) {
    for (const name of DEMOS) {
      it(`L${level} ${name}: coached, not billed — and «без да спираш в нея» is withheld`, () => {
        const out = playRecorded(name, level);
        // Teach-first-then-grade (`scenarios/policy.ts`): ILLEGAL_STOP_IN_BAN_ZONE
        // is основна, so the FIRST one in a training drive is deliberately free.
        // That is the founder-approved discipline, not a miss — the row's whole
        // qualification — so this suite asserts the silence rather than fighting it.
        expect(out.scored).toEqual([]);
        expect(out.score.totalPoints).toBe(0);
        // …but the student WAS shown the card, and the debrief prints the row
        // under «Учебни моменти (не влизат в точките)».
        expect(out.coached).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
        // …and the banner that claims he passed the zone without stopping in it
        // is withdrawn. This is the half nothing measured: a free offence is not
        // a forgotten one.
        expect(out.done[PAST_ZONE]).toBe(false);
        // ADR-009 (founder Ruling A, doc 92 §8.1 T4) — AND THE LESSON IS NOT
        // TAKEN. Stopping on the spirka is the mistake THIS lesson exists to
        // teach (`lessonMistakeTargets` derives it from the ❌ demo's own
        // `codeRefs`), so the free first encounter buys a card and no longer
        // buys a pass. The sheet is untouched: 0 т. above, and this row is
        // `charged: false` — the ruling's «no exam points the first time».
        expect(out.lessonMistakes).toEqual([
          { code: "ILLEGAL_STOP_IN_BAN_ZONE", charged: false },
        ]);
        expect(out.passed).toBe(false);
      });
    }
  }

  it("A REFUSAL MAY NOT DOUBLE AS A TRAP — the drive still reaches its debrief", () => {
    // The gate is 1 of 2, so `lessons/engine.ts`'s `!onTerminal` arm keeps the
    // stalled-chain finish gate armed: the student gets the debrief that teaches
    // him the zone instead of having to quit and forfeit the attempt. The second
    // objective stays open behind it because the chain advances only on
    // completion (`applyTick`'s `currentIndex`) — the refusal costs the drill's
    // stars, which is the point, not the session.
    const out = playRecorded("mistake-stop-on-pocket", 1);
    expect(out.session.phase).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// §2 — EXAM (L4, the shipped rung): the same recording, now on the sheet.
// ---------------------------------------------------------------------------

describe("§2 L4 examMode — «Спиране в забранена зона» −3 основна, and still no ✓", () => {
  it("the compiled L4 rung IS the exam (this suite did not make it one)", () => {
    const l4 = compileScenario(SC_PK_BUSSTOP_BAN, 4) as { examMode?: boolean };
    expect(l4.examMode).toBe(true);
  });

  for (const name of DEMOS) {
    it(`${name}: one основна, 3 наказателни точки, banner still refused`, () => {
      const out = playRecorded(name, 4);
      // A13: exam mode bypasses the teach-first coach entirely, so the free
      // mini-lesson is not spent and the first bill IS the charge.
      expect(out.scored).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
      expect(out.coached).toEqual([]);
      // Наредба № 38 prices this основна at 3, once.
      expect(out.score).toEqual({ totalPoints: 3, osnovniPoints: 3, osnovniCount: 1 });
      expect(out.done[PAST_ZONE]).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// §3 — THE PROMISE THE DEBRIEF MAKES, which is the clause that kept this row
//      open: «Първата среща не се наказва … При повторение вече влиза в
//      изпитния лист.»
// ---------------------------------------------------------------------------

describe("§3 the escalation is real — and ADR-009 withholds it on this lesson's OWN act", () => {
  it("8 s of standing on the spirka: taught, and only taught", () => {
    // Past `banZoneStopRestSec` (4 s) so the first bill exists, short of the
    // 4 + `BAN_ZONE_REST_REGRADE_SEC` (10 s) that re-grades it. This is the
    // state the w37 debrief photographed, and it is CORRECT.
    const out = playHeldRest(8);
    expect(out.coached).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(out.scored).toEqual([]);
    expect(out.score.totalPoints).toBe(0);
    expect(out.done[PAST_ZONE]).toBe(false);
    // ADR-009: free of points, and not free of consequence.
    expect(out.passed).toBe(false);
  });

  /**
   * THE PREMISE OF THE NEXT CASE CHANGED ON 2026-09-18, AND IT CHANGED FOR THE
   * REASON THIS FILE'S OWN HEADER ARGUES FOR.
   *
   * It was written to prove the debrief's promise — «Първата среща не се
   * наказва … При повторение вече влиза в изпитния лист» — was not a lie, by
   * showing that an 11 s rest reached the изпитен лист through
   * `BAN_ZONE_REST_REGRADE_SEC`. But that re-bill is not a second offence: it
   * is the FIRST one billed late, marked `regrade: true`, and it exists only to
   * reach the charge the free mini-lesson consumed.
   *
   * ADR-009 (founder Ruling A) forbids exactly that charge on the mistake the
   * lesson exists to teach — «NO exam points are taken for that first
   * occurrence» — and stopping on the spirka IS this drill's own act. So the
   * re-bill is dropped by `lessons/engine.ts`'s regrade guard, and what the
   * re-bill protected — a drive reaching its debrief looking clean — is now
   * carried by «Не е взет» and the reason block, which is a stronger answer to
   * `sc-pk-busstop-ban:105f805c` than three наказателни точки were.
   *
   * WHAT IS STILL PROMISED, AND STILL TRUE. The promise was never about the
   * re-bill: a genuine repeat EPISODE — a second rest after the card — grades
   * on the ×1.5/×2 ladder exactly as before (founder answer F1, 2026-09-17).
   * The teach card says so in its own words: `lessonMistake.ts`'s `lesson-first`
   * stake sentence reads «В наказателните точки не влиза; при повторение: …».
   *
   * SO THE MECHANISM IS NOT LEFT UNMEASURED. The case after it re-drives the
   * SAME script against a copy of the lesson with `lessonMistakeTargets`
   * removed, and the −3 reappears with `regrade: true`. That control is what
   * keeps `BAN_ZONE_REST_REGRADE_SEC` gated: if the re-grade ever stopped firing
   * at all, the control would red while the ADR-009 case stayed green — and a
   * pair that can only ever agree is not a measurement.
   */
  it("11 s: the re-bill is DROPPED, because this is the lesson's own mistake", () => {
    const out = playHeldRest(11);
    expect(out.coached).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(out.scored).toEqual([]);
    expect(out.score.totalPoints).toBe(0);
    expect(out.regrades).toEqual([]);
    // The two halves of Ruling A in one place: no points, and no pass.
    expect(out.lessonMistakes).toEqual([
      { code: "ILLEGAL_STOP_IN_BAN_ZONE", charged: false },
    ]);
    expect(out.passed).toBe(false);
  });

  it("…and it is ADR-009 that drops it: strip the targets and the −3 comes back", () => {
    const out = playHeldRest(11, stripLessonMistakeTargets);
    expect(out.coached).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(out.scored).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(out.score).toEqual({ totalPoints: 3, osnovniPoints: 3, osnovniCount: 1 });
    // …and the sheet says WHICH bill it is, so «При повторение» is a fact about
    // the event and not a hope about the copy.
    expect(out.regrades).toEqual([true]);
    // With no targets there is no hit, so this drive's verdict is the
    // pre-ADR-009 one. It still fails — on the withdrawn banner — and the two
    // refusals are independent, which is what §6 exists to say.
    expect(out.lessonMistakes).toEqual([]);
  });

  it("standing three times as long still costs ONE act (no fifteen-row runaway)", () => {
    // `STANDING_DUTY_MAX_BILLS`'s discipline, on this code: the re-grade cannot
    // produce a third bill. Under ADR-009 the lesson's own act reaches the sheet
    // at ZERO bills; the strip control shows the ceiling underneath is still the
    // same 3 точки Наредба № 38 prices the offence at, once.
    expect(playHeldRest(30).scored).toEqual([]);
    const control = playHeldRest(30, stripLessonMistakeTargets);
    expect(control.scored).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(control.score.osnovniPoints).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// §4 — IT CANNOT REFUSE A CORRECT DRIVE (the half checked before the half that
//      refuses — a gate that only ever says „no" is not evidence of anything).
// ---------------------------------------------------------------------------

describe("§4 the shadow is untouched at every rung", () => {
  for (const level of [1, 2, 3, 4] as const) {
    it(`L${level}: zero faults, both certificates`, () => {
      const out = playRecorded("shadow-correct", level);
      expect(out.scored).toEqual([]);
      expect(out.coached).toEqual([]);
      expect(out.done).toEqual({ [PAST_ZONE]: true, "sc-pkbs-legal-stop": true });
      expect(out.score.totalPoints).toBe(0);
      expect(out.session.phase).toBe("completed");
    });
  }

  it("a rest 2 s short of the sustain is not a fault (the detector's own floor)", () => {
    // `banZoneStopRestSec` is 4 s, and a driver who touches the brake in the
    // zone and moves on has not left his car standing on the spirka. If this
    // ever reddens, the drill has started convicting hesitation.
    const out = playHeldRest(2);
    expect(out.scored).toEqual([]);
    expect(out.coached).toEqual([]);
    expect(out.done[PAST_ZONE]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §5 — THE KEY SURVIVES THE LADDER (the dead-predicate guard, and the reason
//      §1's refusal is not an accident of one rung).
// ---------------------------------------------------------------------------

describe("§5 the compiled rung carries the demand into the SESSION", () => {
  it("`serializeObjectiveParams` is a whitelist — the key must cross it, at every level", () => {
    // `requireRailClear` was authored, parsed, read by the evaluator and gated
    // at template level, and the barred creep still collected its certificate:
    // the key never crossed `scenario/params.ts`. Same boundary, same guard —
    // and this drill's rungs vary only `radiusM`, so a whitelist that dropped
    // the demand would leave §1 green at L1 and silent everywhere else.
    for (const level of [1, 2, 3, 4] as const) {
      const lesson = compileScenario(SC_PK_BUSSTOP_BAN, level);
      const gate = lesson.objectives.find((o) => o.id === PAST_ZONE);
      expect(gate, `L${level}: ${PAST_ZONE} missing`).toBeDefined();
      expect(gate!.params.requireRestClean, `L${level} authored`).toBe("banZone");
      // …and it survives the PARSE the session runs on it.
      const parsed = parseObjectiveParams(gate as LessonObjective) as WitnessedReachZoneParams;
      expect(parsed.requireRestClean, `L${level} parsed`).toBe("banZone");
    }
  });
});

// ---------------------------------------------------------------------------
// §6 — THE MUTATION, EXECUTED. A suite that is green on its first run has told
//      you nothing yet: 51 of 82 audited repairs in this programme shipped a
//      predicate nothing live reads, and every one of them had a green test.
//      So the demand is REMOVED here — in this file, on a copy, touching no
//      other lane's source — and the drill is re-driven to watch it fail.
// ---------------------------------------------------------------------------

/** The same compiled lesson with `requireRestClean` stripped off the gate. */
function compileWithoutTheDemand(level: ScenarioLevel) {
  const lesson = compileScenario(SC_PK_BUSSTOP_BAN, level);
  return {
    ...lesson,
    objectives: lesson.objectives.map((o) => {
      if (o.id !== PAST_ZONE) return o;
      const params = { ...(o.params as Record<string, unknown>) };
      delete params.requireRestClean;
      return { ...o, params } as typeof o;
    }),
  };
}

describe("§6 the demand is load-bearing — strip it and the drill certifies its own ❌ demo", () => {
  for (const name of DEMOS) {
    it(`${name} L1: without the key the SAME drive collects «без да спираш в нея»`, () => {
      let session: LessonSessionState = createLessonSession(compileWithoutTheDemand(1));
      recordScPkBusstopBanDrive(district, name, {
        onTick: (tick) => {
          session = applyTick(session, tick).state;
        },
      });
      const out = finish(session);
      // Unchanged: the coach still shows the card, so the student is still told.
      expect(out.coached).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
      // CHANGED, and this is the defect the row was filed against: the banner
      // that says he did not stop in the zone is issued to a drive whose whole
      // subject is stopping in the zone. §1 asserts `false` here; if this ever
      // reads `false` too, §1 has stopped measuring anything and both must be
      // re-derived before either is believed.
      expect(out.done[PAST_ZONE]).toBe(true);
      // ADR-009 — AND THE DRIVE IS STILL NOT PASSED, through a completely
      // different mechanism. That is worth pinning here rather than assuming:
      // the two refusals are independent, so this section can go on being the
      // mutation it was written to be. `requireRestClean` is the BANNER's half
      // and `lessonMistakeTargets` is the LESSON's; strip the first and the
      // student collects a certificate he did not earn, but the lesson he came
      // for still reads «Не е взет» with the act named. Nothing about this
      // weakens the row: the defect §6 demonstrates is still a defect.
      expect(out.lessonMistakes).toEqual([
        { code: "ILLEGAL_STOP_IN_BAN_ZONE", charged: false },
      ]);
      expect(out.passed).toBe(false);
    });
  }

  it("L4 exam: the −3 is billed either way — the demand is the BANNER's half, not the sheet's", () => {
    // Worth stating, because it bounds the claim §1 makes. The charge comes
    // from `rules/engine.ts`; the certificate comes from `requireRestClean`.
    // Two independent halves, and the row needed both measured.
    let session: LessonSessionState = createLessonSession(compileWithoutTheDemand(4));
    recordScPkBusstopBanDrive(district, "mistake-stop-on-pocket", {
      onTick: (tick) => {
        session = applyTick(session, tick).state;
      },
    });
    const out = finish(session);
    expect(out.scored).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(out.score.osnovniPoints).toBe(3);
    expect(out.done[PAST_ZONE]).toBe(true);
  });
});
