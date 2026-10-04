/**
 * sc-jx-priority-confidence — STOP-AND-GO ON THE PRIORITY ROAD IS THE LESSON'S
 * OWN MISTAKE (audit `sc-jx-priority-confidence:9c987e7b`; founder ruling
 * 2026-10-04 «Add stops together»).
 *
 * WHAT WAS MEASURED BEFORE THIS CHANGE. The w46 verifier's replay: fourteen
 * 3-second stops at 18 км/ч, 97 s against this template's 40 s par —
 * ИЗДЪРЖАН, nothing billed. Two engine gaps did it (rules/engine.ts): the
 * junction RADIUS acquitted every stop within 25 m of tj-n-c, and the per-stop
 * 6 s clock restarted on every move and every excused frame.
 *
 * WHAT THIS FILE DRIVES, through the chain the shell and the server run:
 * compileScenario(L1 / L5) → createLessonSession → recordScriptedDrive's onTick
 * feeds applyTick every production frame (runtime + traffic + scenario director,
 * the waiter and the лепка staged, the creeper too on L5) → buildLessonResult →
 * buildDebrief.
 *
 * THE OUTCOME IS RULING A, NOT A POINTS DEDUCTION. STOPPED_WITHOUT_CAUSE is
 * this lesson's own mistake (ADR-009 — armed by its `ruleConfig`), so the
 * first commission costs no exam points and the lesson is НЕ Е ВЗЕТ, named in
 * «Грешката на този урок».
 *
 * A12 — the controls are driven too: the three authored demos grade exactly as
 * they did under today's config, the L5 student who stops FOR the creeper is
 * not billed, and `sc-follow-tailgater` (the other lesson that arms the
 * detector) authors neither new key.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import {
  recordScJxPriorityConfidenceDrive,
  scJxPriorityConfidenceTraceNames,
} from "../../../traces/scJxPriorityConfidence";
import type { SimTick } from "../../../rules/types";
import { DEFAULT_RULE_CONFIG } from "../../../rules/types";
import { buildDebrief } from "../../debrief";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import type { LessonSpec } from "../../../contracts";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import { SC_FOLLOW_TAILGATER } from "../templates-following";
import { SC_JX_PRIORITY_CONFIDENCE, SC_JX_PRIO_CREEPER } from "../templates-junctions3";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const DISTRICT = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "tj-stop-v1.json"), "utf-8"),
) as unknown;

/** The player's eastbound lane on the priority arm (scJxPriorityConfidence.ts). */
const Y = -4.0625;
const CODE = "STOPPED_WITHOUT_CAUSE";
const PRIORITY_TITLE = "Спиране без причина по пътя с предимство";

interface Outcome {
  session: LessonSessionState;
  result: LessonResult;
  ticks: SimTick[];
  /** What the reducer raised for this code, in the session's own engine. */
  billed: string[];
  text: string;
}

/** Today's config: the detector armed, both new keys at their defaults. */
function asToday(lesson: LessonSpec): LessonSpec {
  return { ...lesson, ruleConfig: { needlessStopEnabled: true } };
}

function staged(level: 1 | 5) {
  const base = [...(SC_JX_PRIORITY_CONFIDENCE.staged ?? [])];
  return (level === 5 ? [...base, SC_JX_PRIO_CREEPER] : base) as never;
}

function driveSession(lesson: LessonSpec, level: 1 | 5, script: DriveScript): Outcome {
  let session = createLessonSession(lesson);
  const ticks: SimTick[] = [];
  recordScriptedDrive(DISTRICT, script, {
    scenarioId: SC_JX_PRIORITY_CONFIDENCE.id,
    kind: "mistake",
    seed: 7,
    stagedEvents: staged(level),
    collisionMinKmh: 0,
    onTick: (tick) => {
      ticks.push(tick);
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);
  return {
    session,
    result,
    ticks,
    billed: session.events.filter((e) => e.kind === "violation").map((e) => (e as { code: string }).code),
    text: buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes }).text,
  };
}

/** Halt at each x for `pauseSec`, rolling between halts at `kmh`, then drive out to x = 75. */
function stopAndGo(xs: number[], kmh: number, pauseSec: number): DriveScript {
  const steps: DriveScript["steps"] = [{ kind: "drive", points: [[-135, Y]], targetKmh: kmh }];
  let prev = -135;
  for (const x of xs) {
    steps.push({ kind: "drive", points: [[prev, Y], [x, Y]], targetKmh: kmh, stopAtEnd: true });
    steps.push({ kind: "pause", sec: pauseSec, brake: true });
    prev = x;
  }
  steps.push({ kind: "drive", points: [[prev, Y], [75, Y]], targetKmh: kmh });
  return { steps };
}

/**
 * THE STOP-AND-GO TAPE: twelve 3 s halts at 18 км/ч along the priority arm.
 * Three of them are within 25 m of tj-n-c (x = −24, 14, 24 → 24.3 / 14.6 /
 * 24.3 m), the band the junction radius used to acquit. None is inside the
 * box itself, where the waiter's pull-out meets a car dawdling at 18 км/ч
 * (measured: a halt at x = −9 / 3 ends in a COLLISION, a different lesson).
 */
const STOP_AND_GO_XS = [-120, -105, -90, -75, -60, -45, -35, -24, 14, 24, 34, 44];

/** Count the halts the drive really made, and the top speed reached between each pair. */
function halts(ticks: SimTick[]): Array<{ x: number; junctionM: number | undefined; peakBeforeKmh: number }> {
  const out: Array<{ x: number; junctionM: number | undefined; peakBeforeKmh: number }> = [];
  let resting = true;
  let peak = 0;
  for (const tk of ticks) {
    if (tk.speedKmh < 0.5) {
      if (!resting) out.push({ x: tk.position.x, junctionM: tk.nextJunctionM, peakBeforeKmh: peak });
      resting = true;
      peak = 0;
    } else {
      resting = false;
      peak = Math.max(peak, tk.speedKmh);
    }
  }
  return out;
}

describe("the stop-and-go tape is what the row describes", () => {
  const out = driveSession(compileScenario(SC_JX_PRIORITY_CONFIDENCE, 1), 1, stopAndGo(STOP_AND_GO_XS, 18, 3));
  const h = halts(out.ticks);

  it("≥ 10 halts, each reached from 15–19 км/ч, some within 25 m of tj-n-c", () => {
    // The last halt is the session's end-of-route; the twelve authored ones come first.
    expect(h.length).toBeGreaterThanOrEqual(12);
    const authored = h.slice(0, 12);
    for (const s of authored) {
      expect(s.peakBeforeKmh).toBeGreaterThanOrEqual(15);
      expect(s.peakBeforeKmh).toBeLessThanOrEqual(19);
    }
    const near = authored.filter((s) => s.junctionM !== undefined && s.junctionM <= 25);
    expect(near.length).toBeGreaterThanOrEqual(3);
  });

  it("…and runs far over the 40 s par", () => {
    expect(out.result.durationSec).toBeGreaterThan(80);
  });
});

for (const level of [1, 5] as const) {
  describe(`L${level} · stop-and-go on the priority road is the lesson's own mistake`, () => {
    const lesson = compileScenario(SC_JX_PRIORITY_CONFIDENCE, level);
    const out = driveSession(lesson, level, stopAndGo(STOP_AND_GO_XS, 18, 3));
    const today = driveSession(asToday(lesson), level, stopAndGo(STOP_AND_GO_XS, 18, 3));

    it("RED BEFORE THE RULING: today's config bills nothing and passes the lesson", () => {
      expect(today.result.lessonMistakes ?? []).toEqual([]);
      expect(today.result.coachedMistakes ?? []).toEqual([]);
      expect(today.result.passed).toBe(true);
    });

    it("the rests add up: STOPPED_WITHOUT_CAUSE is booked as the lesson's mistake", () => {
      expect((out.result.lessonMistakes ?? []).map((m) => m.code)).toEqual([CODE]);
      // Ruling A: the first commission is taught, never charged…
      expect(out.result.lessonMistakes![0]!.charged).toBe(false);
      expect(out.billed).toEqual([]);
      expect(out.result.summary.score.totalPoints).toBe(0);
      // …and the lesson is not taken.
      expect(out.result.passed).toBe(false);
      // Taught on the second halt (3 s + 3 s), long before the junction.
      const coached = (out.result.coachedMistakes ?? []).filter((c) => c.code === CODE);
      expect(coached).toHaveLength(1);
      expect(coached[0]!.t).toBeLessThan(20);
    });

    it("the hit is titled as the priority-road act", () => {
      expect(out.result.lessonMistakes![0]!.titleBg).toBe(PRIORITY_TITLE);
    });

    it("the debrief refuses the lesson BY NAME, under «Грешката на този урок», and explains it (THEO-4)", () => {
      expect(out.text).toContain(`не е взет: допусна „${PRIORITY_TITLE}“`);
      expect(out.text).toContain("Грешката на този урок (при първа поява");
      expect(out.text).toContain("→ Правило: ЗДвП чл. 24, ал. 2; чл. 50, ал. 1");
      expect(out.text).toContain("престоите се събират");
      expect(out.text).not.toContain("чисто каране");
    });
  });
}

describe("each arm is witnessed on its own", () => {
  it("arm (a): ONE 8 s halt 24.8 m from tj-n-c — the junction radius no longer acquits it", () => {
    const lesson = compileScenario(SC_JX_PRIORITY_CONFIDENCE, 1);
    const script = stopAndGo([-24.5], 30, 8);
    const out = driveSession(lesson, 1, script);
    expect((out.result.lessonMistakes ?? []).map((m) => m.code)).toEqual([CODE]);
    expect(driveSession(asToday(lesson), 1, script).result.lessonMistakes ?? []).toEqual([]);
  });

  it("arm (b): three 3 s halts far from any junction — added up, they bill", () => {
    const lesson = compileScenario(SC_JX_PRIORITY_CONFIDENCE, 1);
    const script = stopAndGo([-120, -100, -80], 18, 3);
    const out = driveSession(lesson, 1, script);
    expect((out.result.lessonMistakes ?? []).map((m) => m.code)).toEqual([CODE]);
    expect(driveSession(asToday(lesson), 1, script).result.lessonMistakes ?? []).toEqual([]);
  });

  it("a held recovery between two short halts wipes the sum — the clean driver is not billed", () => {
    // 4 s, then ~70 m at 40 км/ч (far over 4 s at ≥ 20), then 4 s: two halts, no fault.
    const lesson = compileScenario(SC_JX_PRIORITY_CONFIDENCE, 1);
    const out = driveSession(lesson, 1, stopAndGo([-120, -50], 40, 4));
    expect(out.result.lessonMistakes ?? []).toEqual([]);
    expect(out.result.passed).toBe(true);
  });
});

describe("A12 · the authored demos grade exactly as they did", () => {
  for (const name of scJxPriorityConfidenceTraceNames()) {
    for (const level of [1, 3, 5] as const) {
      it(`${name} @ L${level}: identical session under the ruled and today's config`, () => {
        const lesson = compileScenario(SC_JX_PRIORITY_CONFIDENCE, level);
        const run = (l: LessonSpec) => {
          let s = createLessonSession(l);
          recordScJxPriorityConfidenceDrive(DISTRICT, name, {
            onTick: (tick) => {
              s = applyTick(s, tick).state;
            },
          });
          const r = buildLessonResult(s);
          return { events: s.events, coached: r.coachedMistakes, hits: r.lessonMistakes, passed: r.passed, objectives: r.objectives, score: r.summary.score };
        };
        const ruled = run(lesson);
        expect(ruled).toEqual(run(asToday(lesson)));
        expect((ruled.hits ?? []).map((m) => m.code)).not.toContain(CODE);
        expect((ruled.coached ?? []).map((c) => c.code)).not.toContain(CODE);
      });
    }
  }

  it("the shadow still passes clean at L1", () => {
    let s = createLessonSession(compileScenario(SC_JX_PRIORITY_CONFIDENCE, 1));
    recordScJxPriorityConfidenceDrive(DISTRICT, "shadow-correct", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(r.passed).toBe(true);
    expect(r.score).toBe(0);
    expect(r.lessonMistakes ?? []).toEqual([]);
  });
});

describe("A12 · the L5 student who stops FOR the creeper is not billed", () => {
  const lesson = compileScenario(SC_JX_PRIORITY_CONFIDENCE, 5);
  /** Cruise, see the creeper commit, brake to rest at x, wait `sec`, drive on. */
  const defensive = (x: number, sec: number): DriveScript => ({
    steps: [
      { kind: "drive", points: [[-135, Y]], targetKmh: 46 },
      { kind: "drive", points: [[-135, Y], [-70, Y]], targetKmh: 46 },
      { kind: "drive", points: [[-70, Y], [x, Y]], targetKmh: 31, stopAtEnd: true },
      { kind: "pause", sec, brake: true },
      { kind: "drive", points: [[x, Y], [75, Y]], targetKmh: 40 },
    ],
  });

  it("a 10 s wait 12.7 m from the node while the creeper and then the waiter cross — not billed, as today", () => {
    const out = driveSession(lesson, 5, defensive(-12, 10));
    // The junction radius used to acquit this; it is gone, and the conflict
    // reading that replaces it must acquit it too.
    expect(out.result.lessonMistakes ?? []).toEqual([]);
    expect((out.result.coachedMistakes ?? []).map((c) => c.code)).not.toContain(CODE);
    expect(out.result.passed).toBe(true);
    expect(driveSession(asToday(lesson), 5, defensive(-12, 10)).result.passed).toBe(true);
  });

  it("an 8 s wait 30 m back while the creeper crosses — no longer billed (today's config convicted it)", () => {
    // The template's own note recorded this as a pre-existing conviction of a
    // student waiting on a car the reducer could not see: the creeper is 30 m
    // ahead in his corridor, outside the 25 m queue band. Seen within 45 m it
    // now excuses the wait, and the 6 s settle covers the seconds after it.
    const out = driveSession(lesson, 5, defensive(-30, 8));
    expect(out.result.lessonMistakes ?? []).toEqual([]);
    const today = driveSession(asToday(lesson), 5, defensive(-30, 8));
    expect((today.result.lessonMistakes ?? []).map((m) => m.code)).toEqual([CODE]);
  });

  it("…but sitting on long after the creeper has gone is still the fault", () => {
    const out = driveSession(lesson, 5, defensive(-30, 16));
    expect((out.result.lessonMistakes ?? []).map((m) => m.code)).toEqual([CODE]);
  });
});

describe("the other lesson that arms the detector is untouched", () => {
  it("sc-follow-tailgater authors neither key, so it compiles to today's reading", () => {
    expect(SC_FOLLOW_TAILGATER.ruleConfig?.needlessStopEnabled).toBe(true);
    const cfg = compileScenario(SC_FOLLOW_TAILGATER, 1).ruleConfig ?? {};
    expect("needlessStopJunctionExcuse" in cfg).toBe(false);
    expect("needlessStopPerStop" in cfg).toBe(false);
    expect(DEFAULT_RULE_CONFIG.needlessStopJunctionExcuse).toBe(true);
    expect(DEFAULT_RULE_CONFIG.needlessStopPerStop).toBe(true);
  });

  it("no template but sc-jx-priority-confidence authors either key, on any rung", () => {
    const authors = SCENARIO_TEMPLATES.filter((t) => {
      const keys = [t.ruleConfig, ...(t.levels ?? []).map((l) => (l as { ruleConfig?: object }).ruleConfig)]
        .filter((c): c is object => c !== undefined)
        .flatMap((c) => Object.keys(c));
      return keys.includes("needlessStopJunctionExcuse") || keys.includes("needlessStopPerStop");
    }).map((t) => t.id);
    expect(authors).toEqual(["sc-jx-priority-confidence"]);
  });

  it("the ruled keys are on the TEMPLATE, identical on every rung (no «Оценява се по-строго»)", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const cfg = compileScenario(SC_JX_PRIORITY_CONFIDENCE, level).ruleConfig;
      expect(cfg, `L${level}`).toMatchObject({
        needlessStopEnabled: true,
        needlessStopJunctionExcuse: false,
        needlessStopPerStop: false,
      });
    }
    for (const rung of SC_JX_PRIORITY_CONFIDENCE.levels ?? []) {
      expect((rung as { ruleConfig?: object }).ruleConfig).toBeUndefined();
    }
  });
});
