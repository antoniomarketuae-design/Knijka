/**
 * THE CAR DID NOT REST WHERE THE BANNER SAYS IT DID NOT — `requireRestClean`,
 * the twelfth ReachZoneWitnessDemand (sc-pk-rail-ban:84bce2a3, critical).
 *
 * WHAT WAS ACTUALLY WRONG, off `w16/frames/sc-pk-rail-ban__mobile-wrong`. One
 * debrief, eight seconds apart:
 *
 *   Грешки              ✗ Спиране в забранена зона −3 изпитни т.
 *                         ОСНОВНА ГРЕШКА                        в 1:11
 *   Задачи от маршрута  ✓ Подмини цялата забранена зона, БЕЗ
 *                         ПРЕСТОЙ В НЕЯ                            1:19
 *
 * A conviction and a credit for the mutually exclusive act, on one screen, to a
 * seventeen-year-old — and the one he will believe is the one that flatters him.
 *
 * RE-DERIVED THROUGH THE PRODUCTION PIPELINE AT HEAD rather than inherited from
 * the report, because a report is as stale as the day it was written. Both
 * halves reproduce on the drill's OWN committed ❌ demos, driven through
 * `compileScenario → createLessonSession → applyTick` (the same entry point
 * `LessonPlayShell.tsx` calls), measured 2026-08-30 before the demand existed:
 *
 *   mistake-stop-on-rails       L1  events [RAIL_CROSSING_VIOLATION @0:30]
 *                                   objectives sc-pkr-cross DONE  ← the same
 *                                   sheet says «без да спираш върху релсите»
 *   mistake-stop-before-crossing L1  events []  coached
 *                                   [ILLEGAL_STOP_IN_BAN_ZONE @0:26]
 *                                   objectives sc-pkr-past-zone DONE
 *   mistake-stop-before-crossing L1 examMode  events
 *                                   [ILLEGAL_STOP_IN_BAN_ZONE @0:26]
 *                                   objectives sc-pkr-past-zone DONE
 *
 * The middle row is why this demand reads the SHOWN-BUT-NOT-CHARGED channel as
 * well as the ledger: `ILLEGAL_STOP_IN_BAN_ZONE` is основна, so the teach-first
 * coach gives the first one away as a free mini-lesson and records it on
 * `coachedMistakes`. Both channels reach the debrief the student reads, so both
 * falsify a «без престой» banner — and a ledger-only read would have left this
 * drill's own demo certifying itself.
 *
 * THE MUTATION THAT REDDENS §1–§3: drop `restOk` from `arrivalHonoured` in
 * `stepReachZone`, or delete the `requireRestClean` line from
 * `serializeObjectiveParams`'s whitelist — the second is the dead-predicate
 * shape `rail-clear-gate.test.ts` was written after, and §5 is the guard that
 * catches it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonObjective } from "../../contracts";
import type { SimTick } from "../../rules";
import { recordScPkRailBanDrive, type ScPkRailBanTraceName } from "../../traces/scPkRailBan";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import {
  createEvalState,
  parseObjectiveParams,
  stepObjective,
  type ObjectiveContext,
  type WitnessedReachZoneParams,
} from "../objectives";
import { compileScenario } from "../scenario/compile";
import type { ScenarioLevel } from "../scenario/types";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import { SC_PK_RAIL_BAN } from "../scenario/templates-parking2";
import type { LessonSessionState } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

interface DriveOutcome {
  session: LessonSessionState;
  /** `code` (+ `detail`) of every SCORED violation, in order. */
  scored: string[];
  /** `code` of every violation the student was SHOWN but not charged for. */
  coached: string[];
  /** objective id → whether the certificate was issued. */
  done: Record<string, boolean>;
}

/** The production path a student's drive takes, from template to end screen. */
function drive(name: ScPkRailBanTraceName, level: ScenarioLevel, examMode = false): DriveOutcome {
  const compiled = compileScenario(SC_PK_RAIL_BAN, level);
  const lesson = examMode ? { ...compiled, examMode: true } : compiled;
  let session: LessonSessionState = createLessonSession(lesson);
  recordScPkRailBanDrive(loadDistrict("pk-rail-v1"), name, {
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
      .map((e) => {
        const v = e as { code: string; detail?: string };
        return v.detail ? `${v.code}/${v.detail}` : v.code;
      }),
    coached: (session.coachedMistakes ?? []).map((m) => m.code),
    done,
  };
}

// ---------------------------------------------------------------------------
// §1 — the rails half: the опасна and the certificate, on the same sheet
// ---------------------------------------------------------------------------

describe("§1 requireRestClean 'railBand' — a rest ON the band withdraws «без да спираш върху релсите»", () => {
  for (const level of [1, 3] as const) {
    it(`L${level}: the drill's own ❌ demo is convicted AND refused, not convicted AND credited`, () => {
      const out = drive("mistake-stop-on-rails", level);
      // The conviction the objective must read: it is billed, it is опасна, and
      // it is the "stopped-on-track" arm rather than the barred entry.
      expect(out.scored).toEqual(["RAIL_CROSSING_VIOLATION/stopped-on-track"]);
      // …and the credit is now withheld. Before the demand this read `true`.
      expect(out.done["sc-pkr-cross"]).toBe(false);
    });
  }

  it("A REFUSAL MAY NOT DOUBLE AS A TRAP — the drive still ends by itself", () => {
    // The gate is 1 of 3, so `lessons/engine.ts`'s `!onTerminal` arm keeps the
    // stalled-chain finish gate armed: the student reaches the debrief that
    // teaches him чл. 53, ал. 2 instead of having to quit and forfeit the
    // attempt's XP and calibration.
    const out = drive("mistake-stop-on-rails", 1);
    expect(out.session.phase).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// §2 — the ban half, on the channel that carries it in TRAINING
// ---------------------------------------------------------------------------

describe("§2 requireRestClean 'banZone' — the shown-but-not-charged rest withdraws «без престой в нея»", () => {
  it("L1: the first основна is coached, not billed — and it still falsifies the banner", () => {
    const out = drive("mistake-stop-before-crossing", 1);
    // Teach-first-then-grade: the score deliberately charges nothing…
    expect(out.scored).toEqual([]);
    // …but the student was shown the card, and the debrief prints the row.
    expect(out.coached).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    // Before the demand this read `true` on the same drive.
    expect(out.done["sc-pkr-past-zone"]).toBe(false);
    expect(out.session.phase).toBe("completed");
  });

  it("THE SPLIT HOLDS: a rest 25 m short of the rails does NOT touch the rails gate", () => {
    // The two demos are 28 m apart and grade different codes — that separation
    // IS the template, and pooling the demand would have destroyed it. This
    // drive rests inside pkr-z-ban-before and never on the band, so the
    // «без да спираш върху релсите» certificate is honestly earned.
    const out = drive("mistake-stop-before-crossing", 1);
    expect(out.done["sc-pkr-cross"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §3 — the ban half on the SCORED channel (the filed frame's own shape)
// ---------------------------------------------------------------------------

describe("§3 requireRestClean 'banZone' — the billed rest, which is what w16 photographed", () => {
  it("examMode: −3 «Спиране в забранена зона» on the sheet, and no ✓ beside it", () => {
    // `examMode` bypasses the teach-first coach (A13), so the same recording
    // bills the основна instead of coaching it — the state the w16 frame was
    // in, where the repeat had already spent the free mini-lesson.
    const out = drive("mistake-stop-before-crossing", 1, true);
    expect(out.scored).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(out.done["sc-pkr-past-zone"]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §4 — IT CANNOT REFUSE A CLEAN DRIVE (the half checked before the half that
//      refuses)
// ---------------------------------------------------------------------------

describe("§4 the correct drive is bit-identical to shipped", () => {
  for (const level of [1, 2, 3, 4] as const) {
    it(`L${level}: shadow-correct still books zero faults and all three certificates`, () => {
      const out = drive("shadow-correct", level);
      expect(out.scored).toEqual([]);
      expect(out.coached).toEqual([]);
      expect(out.done).toEqual({
        "sc-pkr-cross": true,
        "sc-pkr-past-zone": true,
        "sc-pkr-legal-stop": true,
      });
      expect(out.session.phase).toBe("completed");
    });
  }
});

// ---------------------------------------------------------------------------
// §5 — THE KEY SURVIVES THE LADDER (the dead-predicate guard)
// ---------------------------------------------------------------------------

describe("§5 the compiled rung carries the demand", () => {
  it("`serializeObjectiveParams` is a whitelist — the key must reach the SESSION", () => {
    // `requireRailClear` was authored, parsed, read by the evaluator and gated
    // at template level, and the barred creep still collected its certificate:
    // the key never crossed `scenario/params.ts`. Same boundary, same guard.
    for (const level of [1, 2, 3, 4] as const) {
      const lesson = compileScenario(SC_PK_RAIL_BAN, level);
      const byId = new Map(lesson.objectives.map((o) => [o.id, o]));
      expect(byId.get("sc-pkr-cross")!.params.requireRestClean, `L${level} rails`).toBe("railBand");
      expect(byId.get("sc-pkr-past-zone")!.params.requireRestClean, `L${level} ban`).toBe("banZone");
      // …and it survives the PARSE the session runs on it.
      const parsed = parseObjectiveParams(byId.get("sc-pkr-past-zone")!) as WitnessedReachZoneParams;
      expect(parsed.requireRestClean).toBe("banZone");
    }
  });
});

// ---------------------------------------------------------------------------
// §6 — THE OTHER DIRECTION: a banner that claims the discipline must carry the
//      key. This is the teeth that stop the class coming back one template at
//      a time.
// ---------------------------------------------------------------------------

/** The three ways a Bulgarian banner claims „and you did not stand still". */
const CLAIMS_NO_REST = /без престой|без да спираш|без спиране/;

describe("§6 the census — every banner that claims it, measures it", () => {
  it("no reachZone title claims a rest-free stretch without a requireRestClean key", () => {
    const naked: string[] = [];
    const carrying: string[] = [];
    for (const t of SCENARIO_TEMPLATES) {
      for (const rung of t.levels) {
        const lesson = compileScenario(t, rung.level);
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone" || !CLAIMS_NO_REST.test(o.titleBg)) continue;
          const parsed = parseObjectiveParams(o as LessonObjective) as WitnessedReachZoneParams;
          const row = `${t.id}/${o.id}`;
          if (parsed.requireRestClean === undefined) naked.push(row);
          else if (!carrying.includes(row)) carrying.push(row);
        }
      }
    }
    expect(naked).toEqual([]);
    // The census as it stood when the demand landed — eight gates, six drills.
    // A new member is welcome; it just may not arrive silently, because a gate
    // that claims the discipline and does not read it is the whole defect.
    expect(carrying.sort()).toEqual(
      [
        "sc-pk-ban-stop/sc-pkb-through",
        "sc-pk-busstop-ban/sc-pkbs-past-zone",
        "sc-pk-crossing-ban/sc-pkx-past-junction",
        "sc-pk-crossing-ban/sc-pkx-past-zebra",
        "sc-pk-double-park/sc-pkd-past-row",
        "sc-pk-rail-ban/sc-pkr-cross",
        "sc-pk-rail-ban/sc-pkr-past-zone",
        "sc-pk-stop-vs-park/sc-pkb2-past-ban",
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// §7 — the evaluator's own polarity, at the unit level
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
  let state = stepObjective(params, createEvalState(params), tickAt(200, 0), ctx).evalState;
  for (let i = 1; i <= 40; i++) {
    const step = stepObjective(params, state, tickAt(200 + i * 2, i), ctx);
    if (step.done) return true;
    state = step.evalState;
  }
  return false;
}

describe("§7 unknown is never a refusal, and the two facts never answer for each other", () => {
  const BAN: WitnessedReachZoneParams = {
    kind: "reachZone",
    x: 4.06,
    y: 275,
    radiusM: 6,
    requireRestClean: "banZone",
  };
  const RAIL: WitnessedReachZoneParams = { ...BAN, requireRestClean: "railBand" };
  const EMPTY: ObjectiveContext = { stagedOutcomes: [], redsMetInRun: 0 };

  it("a context that cannot answer leaves both demands MET (every fixture, rig and replay)", () => {
    expect(reaches(BAN, EMPTY)).toBe(true);
    expect(reaches(RAIL, EMPTY)).toBe(true);
  });

  it("each demand refuses on its OWN fact and on no other", () => {
    expect(reaches(BAN, { ...EMPTY, restedInBanZoneInRun: true })).toBe(false);
    expect(reaches(BAN, { ...EMPTY, restedOnRailBandInRun: true })).toBe(true);
    expect(reaches(RAIL, { ...EMPTY, restedOnRailBandInRun: true })).toBe(false);
    expect(reaches(RAIL, { ...EMPTY, restedInBanZoneInRun: true })).toBe(true);
  });

  it("a gate without the key never consults either fact", () => {
    const bare: WitnessedReachZoneParams = { kind: "reachZone", x: 4.06, y: 275, radiusM: 6 };
    expect(
      reaches(bare, { ...EMPTY, restedInBanZoneInRun: true, restedOnRailBandInRun: true }),
    ).toBe(true);
  });
});
