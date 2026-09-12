/**
 * THE CAR WENT WHEN THE GREEN CAME — `requireGreenStartClean`, and the drill
 * whose own ❌ demonstration used to collect the certificate for the act it
 * demonstrates failing (sc-signal-hesitation:440b1f7c, critical).
 *
 * WHAT WAS ACTUALLY WRONG. MEASURED AT HEAD 095054b through
 * `compileScenario → createLessonSession → applyTick → buildLessonResult`, on
 * `mistake-freeze`, the recording whose entire content is the freeze:
 *
 *   Учебни моменти      • Колебание на зелен сигнал            в 0:19
 *   Задачи от маршрута  ✓ Премини правó напред на зелено,
 *                         БЕЗ ДА ЗАМРЪЗВАШ                       0:33
 *                        → 2 / 2, «Урокът е издържан», 3★
 *
 * A conviction and a credit for the mutually exclusive act, on one screen, to a
 * seventeen-year-old — the `rest-clean-gate.test.ts` shape, on the signals
 * family. A `reachZone` samples an ARRIVAL and the freeze is a fact about the
 * JOURNEY, so no radius, cap or dwell on that side could ever have seen it.
 *
 * WHY THE COACHED CHANNEL IS READ AND NOT ONLY THE LEDGER: `HESITATION_AT_GREEN`
 * is второстепенна and the demonstration freezes exactly ONCE, so the
 * teach-first coach (A12) hands that one over as a free mini-lesson and the
 * sheet reads «Общо 0» at every aided rung — a ledger-only read would have left
 * this drill's own demo certifying itself at L1, which is the rung a beginner
 * drives.
 *
 * THE MUTATION THAT REDDENS §1–§2: drop `greenStartCleanOk` from
 * `arrivalHonoured` in `stepReachZone`, or delete the `requireGreenStartClean`
 * line from `serializeObjectiveParams`'s whitelist. The second is not
 * hypothetical — it is what this repair shipped with for one revision, and
 * `inprocess-drive` returned a BYTE-IDENTICAL projection (sha256 50feeb52…)
 * with the field, the parse, the honoured read, the void arm and the template
 * key all in place. §4 is the guard that catches it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTick } from "../../rules";
import {
  recordScSignalHesitationDrive,
  type ScSignalHesitationTraceName,
} from "../../traces/scSignalHesitation";
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
import { SC_SIGNAL_HESITATION } from "../scenario/templates-signals";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

const district = JSON.parse(
  readFileSync(
    path.join(REPO_ROOT, "content", "world", `${SC_SIGNAL_HESITATION.map.districtId}.json`),
    "utf-8",
  ),
) as unknown;

interface DriveOutcome {
  session: LessonSessionState;
  /** `code` of every SCORED violation, in order. */
  scored: string[];
  /** `code` of every violation the student was SHOWN but not charged for. */
  coached: string[];
  /** objective id → whether the certificate was issued. */
  done: Record<string, boolean>;
}

/** The production path a student's drive takes, from template to end screen. */
function drive(name: ScSignalHesitationTraceName, level: ScenarioLevel): DriveOutcome {
  const lesson = compileScenario(SC_SIGNAL_HESITATION, level);
  let session: LessonSessionState = createLessonSession(lesson);
  recordScSignalHesitationDrive(district, name, {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);
  const done: Record<string, boolean> = {};
  for (const o of result.objectives) done[o.id] = o.done;
  return {
    session,
    scored: session.events
      .filter((e) => e.kind === "violation")
      .map((e) => (e as { code: string }).code),
    coached: (session.coachedMistakes ?? []).map((m) => m.code),
    done,
  };
}

// ---------------------------------------------------------------------------
// §1 — the drill's own ❌ demos are refused, not credited
// ---------------------------------------------------------------------------

describe("§1 requireGreenStartClean — the freeze withdraws «без да замръзваш»", () => {
  for (const name of ["mistake-freeze", "mistake-filter"] as const) {
    it(`L1 ${name}: the fault is SHOWN (A12 coaches the first) and the credit is withheld`, () => {
      const out = drive(name, 1);
      // Teach-first-then-grade: the sheet deliberately charges nothing at L1…
      expect(out.scored).toEqual([]);
      // …but the student was shown the card, and the debrief prints the row.
      expect(out.coached).toEqual(["HESITATION_AT_GREEN"]);
      // Before the demand this read `true` on the same recording.
      expect(out.done["sc-shes-cross"]).toBe(false);
      // The approach gate is untouched — the freeze happens after it.
      expect(out.done["sc-shes-approach"]).toBe(true);
    });
  }

  it("L4 mistake-freeze: the CHARGED channel refuses it too", () => {
    const out = drive("mistake-freeze", 4);
    expect(out.scored).toEqual(["HESITATION_AT_GREEN"]);
    expect(out.done["sc-shes-cross"]).toBe(false);
  });

  it("A REFUSAL MAY NOT DOUBLE AS A TRAP — and here that is not inherited", () => {
    // `sc-shes-cross` is the LAST objective of this drill (2 of 2), so unlike
    // every rest/brake census member the `!onTerminal` arm does NOT cover this
    // refusal. `greenStartFaultVoidsObjective` is wired into
    // `lessons/engine.ts`'s `terminalUnearnable` so the finish gate arms
    // anyway: the student reaches the debrief that teaches him the fault
    // instead of having to quit and forfeit the attempt's XP and calibration.
    for (const level of [1, 4] as const) {
      expect(drive("mistake-freeze", level).session.phase, `L${level}`).toBe("completed");
    }
  });
});

// ---------------------------------------------------------------------------
// §2 — IT CANNOT REFUSE A CLEAN DRIVE (checked before the half that refuses)
// ---------------------------------------------------------------------------

describe("§2 the correct drive is bit-identical to shipped", () => {
  for (const level of [1, 2, 3, 4, 5] as const) {
    it(`L${level}: shadow-correct books zero faults and keeps both certificates`, () => {
      const out = drive("shadow-correct", level);
      expect(out.scored).toEqual([]);
      expect(out.coached).toEqual([]);
      expect(out.done).toEqual({ "sc-shes-approach": true, "sc-shes-cross": true });
      expect(out.session.phase).toBe("completed");
    });
  }
});

// ---------------------------------------------------------------------------
// §3 — the evaluator's own polarity, at the unit level
// ---------------------------------------------------------------------------

function tickAt(y: number, t: number): SimTick {
  return {
    t,
    dt: 1 / 60,
    position: { x: 4.06, y },
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
  let state = stepObjective(params, createEvalState(params), tickAt(0, 0), ctx).evalState;
  for (let i = 1; i <= 40; i++) {
    const step = stepObjective(params, state, tickAt(i * 2, i), ctx);
    if (step.done) return true;
    state = step.evalState;
  }
  return false;
}

describe("§3 unknown is never a refusal, and the demand reads its OWN fact only", () => {
  const GATE: WitnessedReachZoneParams = {
    kind: "reachZone",
    x: 4.06,
    y: 45,
    radiusM: 9,
    requireGreenStartClean: true,
  };
  const EMPTY: ObjectiveContext = { stagedOutcomes: [], redsMetInRun: 0 };

  it("a context that cannot answer leaves the demand MET (every fixture, rig and replay)", () => {
    expect(reaches(GATE, EMPTY)).toBe(true);
  });

  it("the freeze refuses it", () => {
    expect(reaches(GATE, { ...EMPTY, hesitatedAtGreenInRun: true })).toBe(false);
  });

  it("the neighbouring standstill codes do NOT answer for it", () => {
    // `STOPPED_WITHOUT_CAUSE` is a rest on an OPEN road with no signal at all
    // (чл. 24, ал. 2) and `HARSH_BRAKING_NO_CAUSE` is a different act again. A
    // banner about the green start may not be withdrawn for either.
    expect(reaches(GATE, { ...EMPTY, stoppedWithoutCauseInRun: true })).toBe(true);
    expect(reaches(GATE, { ...EMPTY, harshBrakeNoCauseInRun: true })).toBe(true);
  });

  it("a gate without the key never consults the fact", () => {
    const bare: WitnessedReachZoneParams = { kind: "reachZone", x: 4.06, y: 45, radiusM: 9 };
    expect(reaches(bare, { ...EMPTY, hesitatedAtGreenInRun: true })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §4 — THE KEY SURVIVES THE LADDER (the dead-predicate guard that caught this
//      repair shipping inert)
// ---------------------------------------------------------------------------

describe("§4 the compiled rung carries the demand", () => {
  it("`serializeObjectiveParams` is a whitelist — the key must reach the SESSION", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const lesson = compileScenario(SC_SIGNAL_HESITATION, level);
      const gate = lesson.objectives.find((o) => o.id === "sc-shes-cross");
      expect(gate, `L${level}`).toBeDefined();
      expect(gate!.params.requireGreenStartClean, `L${level} compiled`).toBe(true);
      // …and it survives the PARSE the session runs on it.
      const parsed = parseObjectiveParams(gate!) as WitnessedReachZoneParams;
      expect(parsed.requireGreenStartClean, `L${level} parsed`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// §5 — THE OTHER DIRECTION: a banner that claims the promptness must measure
//      it. The teeth that stop the class coming back one template at a time.
// ---------------------------------------------------------------------------

/** The ways a Bulgarian banner claims „and you did not sit there". */
const CLAIMS_NO_FREEZE = /без да замръзваш|без да се колебаеш|без бавене|без забавяне/;

describe("§5 the census — every banner that claims it, measures it", () => {
  it("no reachZone title claims a prompt start without a requireGreenStartClean key", () => {
    const naked: string[] = [];
    const carrying: string[] = [];
    for (const t of SCENARIO_TEMPLATES) {
      for (const rung of t.levels) {
        const lesson = compileScenario(t, rung.level);
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone" || !CLAIMS_NO_FREEZE.test(o.titleBg)) continue;
          const parsed = parseObjectiveParams(o) as WitnessedReachZoneParams;
          const row = `${t.id}/${o.id}`;
          if (parsed.requireGreenStartClean === undefined) naked.push(row);
          else if (!carrying.includes(row)) carrying.push(row);
        }
      }
    }
    expect(naked).toEqual([]);
    // The census as it stood when the demand landed — ONE gate, one drill, and
    // it is named rather than generalised. A new member is welcome; it just may
    // not arrive silently, because a gate that claims the promptness and does
    // not read it is the whole defect.
    expect(carrying).toEqual(["sc-signal-hesitation/sc-shes-cross"]);
  });
});
