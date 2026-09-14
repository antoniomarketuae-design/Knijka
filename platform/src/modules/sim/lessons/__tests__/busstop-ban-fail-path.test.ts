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
 *   L4 exam      mistake-stop-on-pocket   scored [BAN_ZONE] osnovni 3
 *                                         sc-pkbs-past-zone REFUSED
 *   L1 training  8 s held rest            coached only — the free lesson
 *   L1 training  11 s held rest           coached AND scored, `regrade: true`
 *
 * So the fail path DOES bite, on both channels, and the escalation the debrief
 * promises is real: `BAN_ZONE_REST_REGRADE_SEC` (6 s on top of the 4 s
 * `banZoneStopRestSec`) turns a held rest into the charge the free mini-lesson
 * consumed. None of it was pinned anywhere. Now it is.
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
import type { LessonObjective } from "../../contracts";
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
function playHeldRest(restSec: number): DriveOutcome {
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
  let session: LessonSessionState = createLessonSession(compileScenario(SC_PK_BUSSTOP_BAN, 1));
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

describe("§3 the escalation is real — a held rest reaches the изпитен лист", () => {
  it("8 s of standing on the spirka: taught, and only taught", () => {
    // Past `banZoneStopRestSec` (4 s) so the first bill exists, short of the
    // 4 + `BAN_ZONE_REST_REGRADE_SEC` (10 s) that re-grades it. This is the
    // state the w37 debrief photographed, and it is CORRECT.
    const out = playHeldRest(8);
    expect(out.coached).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(out.scored).toEqual([]);
    expect(out.score.totalPoints).toBe(0);
    expect(out.done[PAST_ZONE]).toBe(false);
  });

  it("11 s: the student was shown the rule and went on standing — now it is billed", () => {
    // The re-grade is a SECOND episode with a strictly larger threshold, marked
    // `regrade: true`, which `applyTick`'s `alreadyCharged` guard drops wherever
    // the code was already charged. Here it was not (the free lesson took the
    // first bill), so it lands — and lands ONCE.
    const out = playHeldRest(11);
    expect(out.coached).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(out.scored).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(out.score).toEqual({ totalPoints: 3, osnovniPoints: 3, osnovniCount: 1 });
    // …and the sheet says WHICH bill it is, so «При повторение» is a fact about
    // the event and not a hope about the copy.
    expect(out.regrades).toEqual([true]);
  });

  it("standing three times as long still costs ONE act (no fifteen-row runaway)", () => {
    // `STANDING_DUTY_MAX_BILLS`'s discipline, on this code: the re-grade cannot
    // produce a third bill, so the sheet a student who freezes for half a minute
    // reads is the same 3 точки Наредба № 38 prices the offence at.
    const out = playHeldRest(30);
    expect(out.scored).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(out.score.osnovniPoints).toBe(3);
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
