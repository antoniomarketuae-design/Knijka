/**
 * «СПРИ НАПЪЛНО НА Б2» MEANS AT THE LINE — the near-side cut on
 * `sc-mfp-stop-line` (sc-merge-from-property:64fd365e, founder ruling
 * 2026-10-04 «Within ~1 m»).
 *
 * THE DEFECT. The gate's `stopOk` read `inAcceptance || graceArmed`, and the
 * grace capsule reaches REACH_ZONE_GRACE_M plus the disc's half-chord back down
 * the approach, so any qualifying standstill with the car centre in
 * x ∈ [27.73, ~35.7] took «✓ Спри напълно на Б2 на изхода» — up to ~6.5 m short
 * of where the taught drive rests (x 29.04). Live: w50 mobile-right halted at
 * x 32.92 (3.88 m short) and the banner moved on to «Задача 3/4».
 *
 * THE RULING. The tick needs the full stop within about one metre of the line,
 * measured in the gate's own frame — the car CENTRE against the authored mark,
 * which is where both committed recordings come to rest. The distance is the one
 * constant `FULL_STOP_AT_LINE_M` in objectives.ts.
 *
 * THE PRAISE FOLLOWS THE SAME LINE (sc-merge-from-property:a401e4a7, §5–§6). The rule engine's «★ Правилно спиране
 * на знак Б2» is commended on recency, wherever the stop was made; on this lesson it is kept only when a full stop
 * was made inside the gate's line window — whether the gate was pending, active or done — and nothing is billed.
 *
 * Everything here is driven through the production chain the student plays:
 * compileScenario(L1..L5) → createLessonSession → applyTick on every recorder
 * frame → buildLessonResult. The tapes are the recorder's own kinematic car on
 * the real mg-property-v1 world, with the template's own staged actors, so the
 * Б2 line event, the walker and the поток are the ones the lesson ships.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "../../../contracts";
import type { SimTick } from "../../../rules";
import { recordScMergeFromPropertyDrive } from "../../../traces/scMergeFromProperty";
import { recordScriptedDrive, type DriveScript, type DriveStep } from "../../../traces/recorder";
import { COMMENDATIONS } from "../../../rules";
import { buildDebrief } from "../../debrief";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { FULL_STOP_AT_LINE_M, REACH_ZONE_GRACE_M, parseObjectiveParams, reachZoneInLineWindow } from "../../objectives";
import type { LessonObjective } from "../../../contracts";
import { compileScenario } from "../compile";
import type { ScenarioLevel } from "../types";
import { SC_MERGE_FROM_PROPERTY } from "../templates-merging";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const DISTRICT: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "mg-property-v1.json"), "utf-8"),
);

const GATE = "sc-mfp-stop-line";
/** The walker task immediately before the Б2 gate in the chain: missing it stalls the chain short of the Б2 gate. */
const WALK_GATE = "sc-mfp-walk-yield";
const RUNGS = [1, 2, 3, 4, 5] as const;
/** The card the gate speaks when a standstill short of the line is refused. */
const SHORT_CARD_TITLE = "Спря, но преди линията";

// mg-property-v1 truths, as the shipped recorder states them (traces/scMergeFromProperty.ts).
const Y_EXIT = 4.06;
const X_SPAWN = 62;
const X_WALK = 34;
const X_LINE = 27.73;
const X_WALK_REST = 37.5;
const X_LANE = 4.06;
const TURN_ARC: ReadonlyArray<readonly [number, number]> = [
  [16, Y_EXIT],
  [11.4, 4.7],
  [7.7, 6.6],
  [5.3, 9.8],
  [X_LANE, 14],
  [X_LANE, 22],
];

/** The gate's authored mark (x) — read from the template, never restated. */
const MARK_X = (() => {
  const o = SC_MERGE_FROM_PROPERTY.success.find((s) => s.id === GATE)!;
  if (o.params.kind !== "reachZone") throw new Error("sc-mfp-stop-line is not a reachZone");
  return o.params.x;
})();
/**
 * Where the gate's acceptance ends — its authored paint cut (`acceptBeforeMarkM`, signed from the mark), read from
 * the template. The exit runs westbound along y = 4.06, so the cut is the x at which the car centre is past the line.
 */
const X_CUT = (() => {
  const o = SC_MERGE_FROM_PROPERTY.success.find((s) => s.id === GATE)!;
  if (o.params.kind !== "reachZone" || o.params.acceptBeforeMarkM === undefined) throw new Error("sc-mfp-stop-line has no paint cut");
  return o.params.x + o.params.acceptBeforeMarkM;
})();

/**
 * The shadow's opening, verbatim up to the end of the walker wait: the same
 * stop before the тротоар the shipped drive makes, so `sc-mfp-walk-yield` is
 * earned and the Б2 gate is the ACTIVE objective for everything that follows.
 */
const OPENING: DriveStep[] = [
  { kind: "glance", mirror: "left" },
  { kind: "glance", mirror: "right" },
  {
    kind: "drive",
    points: [
      [X_SPAWN, Y_EXIT],
      [48, Y_EXIT],
      [X_WALK_REST, Y_EXIT],
    ],
    targetKmh: 18,
    stopAtEnd: true,
  },
  { kind: "glance", mirror: "right" },
  { kind: "pause", sec: 10.5, brake: true },
  { kind: "glance", mirror: "left" },
];

/** Creep from the walker rest to `x` and stand there `sec` seconds on the brake. */
function restAt(x: number, sec: number, from = X_WALK_REST): DriveStep[] {
  const pts: Array<readonly [number, number]> = [[from, Y_EXIT]];
  if (from > X_WALK && x < X_WALK) pts.push([X_WALK, Y_EXIT]);
  pts.push([x, Y_EXIT]);
  return [
    { kind: "drive", points: pts, targetKmh: 12, stopAtEnd: true },
    { kind: "pause", sec, brake: true },
  ];
}

/** Over the line from `x` at `kmh`, round the corner, no further stop. */
function rollOut(x: number, kmh: number): DriveStep[] {
  return [
    { kind: "indicator", setting: "right" },
    { kind: "drive", points: [[x, Y_EXIT], [X_LINE, Y_EXIT], ...TURN_ARC], targetKmh: kmh, stopAtEnd: false },
    { kind: "indicator", setting: "off" },
    { kind: "drive", points: [[X_LANE, 22], [X_LANE, 70], [X_LANE, 120]], targetKmh: 45 },
    { kind: "pause", sec: 1.5, brake: true },
  ];
}

interface Drive {
  ticks: SimTick[];
  done: boolean;
  completedAtSec: number | null;
  commendations: string[];
  /** When each commendation was minted (summary order), for timing it against the gate's tick. */
  commendationTimes: Array<{ code: string; t: number }>;
  violations: string[];
  cards: Array<{ t: number; titleBg: string; explanationBg: string; peekBg?: string }>;
  /** Every commendation toast the glass was handed, in order — what the student saw as a ★. */
  toasts: Array<{ t: number; titleBg: string }>;
  /** The debrief text the student reads (`buildDebrief`, the client's and the server's renderer). */
  debrief: string;
  /** Whether this gate was ever the ACTIVE objective — i.e. ever measured anything (a stalled chain leaves it pending). */
  gateEverActive: boolean;
  /** The walker task the Б2 gate follows in the chain. */
  walkYieldDone: boolean;
  walkYieldAtSec: number | null;
  /** The gate's status coming into, and going out of, every frame on which the car centre passed the paint westbound. */
  gateOverLine: Array<{ t: number; before: string; after: string }>;
  /** The approach axis the gate's own evaluator graded on, and the one the chain-independent watch holds (round 3). */
  gateAxis: unknown;
  watchAxis: unknown;
}

/** A compiled-lesson edit, for the controls that need the gate moved or its key withdrawn. */
type LessonEdit = (lesson: ReturnType<typeof compileScenario>) => ReturnType<typeof compileScenario>;

function drive(
  level: ScenarioLevel,
  record: (onTick: (t: SimTick) => void) => void,
  opts?: Parameters<typeof createLessonSession>[1],
  edit?: LessonEdit,
): Drive {
  const compiled = compileScenario(SC_MERGE_FROM_PROPERTY, level);
  const lesson = edit === undefined ? compiled : edit(compiled);
  let session = createLessonSession(lesson, opts);
  const ticks: SimTick[] = [];
  const cards: Drive["cards"] = [];
  const toasts: Drive["toasts"] = [];
  let gateEverActive = false;
  const gateOverLine: Drive["gateOverLine"] = [];
  const gateIndex = lesson.objectives.findIndex((o) => o.id === GATE);
  record((tick) => {
    const last = ticks[ticks.length - 1];
    ticks.push(tick);
    const before = session.objectives[gateIndex].status;
    const step = applyTick(session, tick);
    session = step.state;
    if (last !== undefined && last.position.x > X_CUT && tick.position.x <= X_CUT) {
      gateOverLine.push({ t: tick.t, before, after: session.objectives[gateIndex].status });
    }
    if (session.objectives.some((o) => o.spec.id === GATE && o.status === "active")) gateEverActive = true;
    for (const e of step.hudEvents) {
      if (e.kind === "lesson") cards.push({ t: tick.t, titleBg: e.titleBg, explanationBg: e.explanationBg, peekBg: e.peekBg });
      if (e.kind === "commendation") toasts.push({ t: tick.t, titleBg: e.titleBg });
    }
  });
  const result = buildLessonResult(session);
  const gate = result.objectives.find((o) => o.id === GATE)!;
  return {
    ticks,
    done: gate.done,
    completedAtSec: gate.completedAtSec,
    commendations: result.summary.commendations.map((c) => c.code),
    commendationTimes: result.summary.commendations.map((c) => ({ code: c.code, t: c.t })),
    violations: result.summary.mistakes.map((m) => m.code),
    cards,
    toasts,
    debrief: buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes }).text,
    gateEverActive,
    walkYieldDone: result.objectives.find((o) => o.id === WALK_GATE)!.done,
    walkYieldAtSec: result.objectives.find((o) => o.id === WALK_GATE)!.completedAtSec,
    gateOverLine,
    gateAxis: (session.evalStates[gateIndex] as { approachFrom?: unknown }).approachFrom ?? null,
    watchAxis: session.stopLineWatch?.[gateIndex]?.approachFrom ?? null,
  };
}

/** The catalogue's own ★ title for the Б2 commendation — read, never restated. */
const B2_STAR_TITLE = COMMENDATIONS.FULL_STOP_AT_STOP_SIGN.titleBg;

function scripted(steps: DriveStep[]) {
  return scriptedFromSpawn([...OPENING, ...steps]);
}

/** A tape with no OPENING: the whole drive from the spawn is the caller's. */
function scriptedFromSpawn(steps: DriveStep[]) {
  const script: DriveScript = { steps };
  return (onTick: (t: SimTick) => void) =>
    recordScriptedDrive(DISTRICT, script, {
      scenarioId: "sc-merge-from-property",
      kind: "mistake",
      seed: 7,
      stagedEvents: [...(SC_MERGE_FROM_PROPERTY.staged ?? [])] as StagedEventSpec[],
      collisionMinKmh: 0,
      onTick,
    });
}

const recorded = (name: "shadow-correct" | "mistake-signal-and-go") => (onTick: (t: SimTick) => void) =>
  recordScMergeFromPropertyDrive(DISTRICT, name, { onTick });

/**
 * Every x at which the car stood dead still on the exit, west of the walker rest. (The kinematic recorder comes to
 * rest ~0.04 m SHORT of a drive step's end — the shadow's X_LINE_REST 29 rests at x 29.04 — so every bound below is
 * asserted against the MEASURED rest, never against the step's target.)
 */
function restXs(ticks: SimTick[]): number[] {
  return ticks
    .filter((t) => Math.abs(t.speedKmh) <= 0.05 && t.position.x < X_WALK_REST - 1 && t.position.x > X_LINE - 3)
    .map((t) => t.position.x);
}

/** Speed on the frame the car's centre first passes the paint. */
function speedOverLine(ticks: SimTick[]): number {
  for (let i = 1; i < ticks.length; i++) {
    if (ticks[i - 1].position.x > X_LINE && ticks[i].position.x <= X_LINE) return Math.abs(ticks[i].speedKmh);
  }
  throw new Error("the tape never crossed the line");
}

// ---------------------------------------------------------------------------
// §1 — THE ROW: a full stop 3.9 m short of the line, then a roll over it
// ---------------------------------------------------------------------------

describe("§1 a full stop ~3.9 m short of the line (w50 mobile-right) does not take «Спри напълно на Б2»", () => {
  const SHORT_X = 32.92; // w50 mobile-right's own halt (guidance.witness.poses t57)
  const runs = RUNGS.map((level) => ({ level, d: drive(level, scripted([...restAt(SHORT_X, 2), ...rollOut(SHORT_X, 13)])) }));

  it("the tape is the drive the row describes: rests at x≈32.92 for 2 s, then crosses the paint at ~13 km/h with no second stop", () => {
    for (const { level, d } of runs) {
      const xs = restXs(d.ticks);
      expect(xs.length, `L${level}`).toBeGreaterThan(0);
      for (const x of xs) expect(Math.abs(x - SHORT_X), `L${level} rest x ${x}`).toBeLessThan(0.3);
      // two seconds of standstill at 20 Hz recorder frames — far over the engine's 0.5 s
      const restSec = d.ticks.filter((t) => Math.abs(t.speedKmh) <= 1 && Math.abs(t.position.x - SHORT_X) < 0.3);
      expect(restSec[restSec.length - 1].t - restSec[0].t, `L${level}`).toBeGreaterThanOrEqual(1.9);
      expect(speedOverLine(d.ticks), `L${level}`).toBeGreaterThan(10);
      expect(speedOverLine(d.ticks), `L${level}`).toBeLessThan(15);
    }
  });

  it("sc-mfp-stop-line stays undone on every rung (L1–L5)", () => {
    for (const { level, d } of runs) expect({ level, done: d.done }).toEqual({ level, done: false });
  });

  it("the student is told why, once, on the frame the short stop qualifies — what was observed, what the task wants, what to do (THEO-4)", () => {
    for (const { level, d } of runs) {
      const short = d.cards.filter((c) => c.titleBg === SHORT_CARD_TITLE);
      expect(short.length, `L${level}`).toBe(1);
      const c = short[0];
      // emitted while the car is standing at the short halt, not later
      const at = d.ticks.find((t) => t.t === c.t)!;
      expect(Math.abs(at.position.x - SHORT_X), `L${level}`).toBeLessThan(0.3);
      expect(Math.abs(at.speedKmh), `L${level}`).toBeLessThanOrEqual(1);
      // the measured shortfall, to the mark, in the gate's own frame (car centre on the approach axis, which runs
      // along y = 4.06 here, so it is the x difference)
      const shortBy = (at.position.x - MARK_X).toFixed(1);
      expect(c.explanationBg, `L${level}`).toContain(`${shortBy} м`);
      expect(c.explanationBg, `L${level}`).toContain("ДО самата линия");
      expect(c.explanationBg, `L${level}`).toContain("не отчита задачата");
      expect(c.explanationBg, `L${level}`).toContain("спри там докрай");
      expect(c.peekBg, `L${level}`).toBeTruthy();
    }
  });

  it("…and the stop the task refused is not praised: no «★ Правилно спиране на знак Б2» on the sheet, on the glass or in the debrief — and nothing new is billed", () => {
    // sc-merge-from-property:a401e4a7. `rules/engine.ts` Б2 branch commends on recency alone (a qualifying stop whose
    // MOVING seconds since are ≤ stopRecencySec 6), and this tape spends ~2 s moving between the halt and the paint —
    // so until the repair the engine's star praised exactly the stop the task above refuses. The praise is withdrawn
    // because no full stop was made in the gate's line window (round 3: by position, whatever the chain was doing — §6);
    // the BILL is untouched (the engine accepted this stop and still does: only the praise goes, never a new −10 — the
    // wait for a gap must not bill).
    for (const { level, d } of runs) {
      expect(d.violations, `L${level}`).not.toContain("STOP_SIGN_NO_FULL_STOP");
      expect(d.commendations, `L${level}`).not.toContain("FULL_STOP_AT_STOP_SIGN");
      expect(d.toasts.map((x) => x.titleBg), `L${level}`).not.toContain(B2_STAR_TITLE);
      expect(d.debrief, `L${level}`).not.toContain(B2_STAR_TITLE);
    }
  });
});

// ---------------------------------------------------------------------------
// §2 — POSITIVE CONTROLS: the committed recordings tick on every rung
// ---------------------------------------------------------------------------

describe("§2 the committed recordings still tick the gate on every rung", () => {
  for (const name of ["shadow-correct", "mistake-signal-and-go"] as const) {
    it(`${name}: rests within ${FULL_STOP_AT_LINE_M} m of the mark and ticks at L1–L5, with no short-stop card`, () => {
      for (const level of RUNGS) {
        const d = drive(level, recorded(name));
        const xs = restXs(d.ticks);
        expect(xs.length, `${name} L${level}`).toBeGreaterThan(0);
        // the bound is derived from where these drives actually stand, not from a bumper offset
        for (const x of xs) expect(x - MARK_X, `${name} L${level}`).toBeLessThanOrEqual(FULL_STOP_AT_LINE_M);
        expect({ level, done: d.done }).toEqual({ level, done: true });
        expect(d.cards.map((c) => c.titleBg), `${name} L${level}`).not.toContain(SHORT_CARD_TITLE);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// §3 — THE BOUND: within ~1 m ticks, beyond it does not, and self-correction works
// ---------------------------------------------------------------------------

describe(`§3 the near bound is FULL_STOP_AT_LINE_M (${FULL_STOP_AT_LINE_M} m) behind the mark`, () => {
  it("a full stop 0.5 m and ~1.0 m short of the mark still ticks, at L1 and L5", () => {
    for (const shortBy of [0.5, FULL_STOP_AT_LINE_M]) {
      // aim 8 cm past the wanted rest: the recorder settles ~0.04 m short of its target
      const x = MARK_X + shortBy - 0.08;
      for (const level of [1, 5] as const) {
        const d = drive(level, scripted([...restAt(x, 2), ...rollOut(x, 13)]));
        const xs = restXs(d.ticks);
        expect(xs.length).toBeGreaterThan(0);
        for (const rx of xs) {
          expect(rx - MARK_X, `short ${shortBy} L${level}`).toBeGreaterThan(shortBy - 0.1);
          expect(rx - MARK_X, `short ${shortBy} L${level}`).toBeLessThanOrEqual(shortBy);
        }
        expect({ shortBy, level, done: d.done }).toEqual({ shortBy, level, done: true });
        expect(d.cards.map((c) => c.titleBg)).not.toContain(SHORT_CARD_TITLE);
      }
    }
  });

  it("a full stop just beyond the bound (~0.15 m) and 0.5 m beyond it does not tick, at L1 and L5", () => {
    for (const beyond of [0.15, 0.5]) for (const level of [1, 5] as const) {
      const x = MARK_X + FULL_STOP_AT_LINE_M + beyond;
      const d = drive(level, scripted([...restAt(x, 2), ...rollOut(x, 13)]));
      for (const rx of restXs(d.ticks)) expect(rx - MARK_X).toBeGreaterThan(FULL_STOP_AT_LINE_M);
      expect({ level, done: d.done }).toEqual({ level, done: false });
      expect(d.cards.filter((c) => c.titleBg === SHORT_CARD_TITLE).length).toBe(1);
    }
  });

  it("stopping short and then stopping AGAIN at the line ticks — self-correction is never punished", () => {
    for (const level of [1, 3, 5] as const) {
      const d = drive(level, scripted([...restAt(32.92, 2), ...restAt(MARK_X, 2, 32.92), ...rollOut(MARK_X, 13)]));
      expect({ level, done: d.done }).toEqual({ level, done: true });
      // the card fired for the first halt, and the tick came at the second
      const card = d.cards.find((c) => c.titleBg === SHORT_CARD_TITLE)!;
      expect(card).toBeDefined();
      expect(d.completedAtSec!).toBeGreaterThan(card.t);
      const at = d.ticks.find((t) => t.t === d.completedAtSec)!;
      expect(at.position.x - MARK_X).toBeLessThanOrEqual(FULL_STOP_AT_LINE_M);
    }
  });

  it("stopping short and then CREEPING over the line under the cap without a second stop does not tick (the standstill must be AT the line)", () => {
    for (const level of [1, 5] as const) {
      const d = drive(level, scripted([...restAt(32.92, 2), ...rollOut(32.92, 2.5)]));
      // the creep is under the 3 km/h cap the whole way, so only the position of the standstill refuses it
      const overLine = speedOverLine(d.ticks);
      expect(overLine).toBeGreaterThan(1);
      expect(overLine).toBeLessThanOrEqual(3);
      expect({ level, done: d.done }).toEqual({ level, done: false });
    }
  });
});

// ---------------------------------------------------------------------------
// §3b — WHOSE STOP: the standstill is timed at the line, and the rule engine still has to agree it was a full stop
// ---------------------------------------------------------------------------

describe("§3b the qualifying standstill is made AT the line, and the rule engine's word is still required", () => {
  it("a qualifying stop 1.6 m back, a creep and a momentary touch (< fullStopMinDurationSec) at the line does not tick", () => {
    // The engine still holds the stop made 1.6 m back (its recency counts MOVING seconds and the creep is short),
    // so «at rest in the window AND the engine holds a stop» would credit this. The window's own clock refuses it.
    const back = MARK_X + 1.6;
    const touch = MARK_X + 0.4;
    for (const level of [1, 5] as const) {
      const d = drive(
        level,
        scripted([
          ...restAt(back, 2),
          { kind: "drive", points: [[back, Y_EXIT], [touch, Y_EXIT]], targetKmh: 3, stopAtEnd: true },
          { kind: "pause", sec: 0.2, brake: true },
          ...rollOut(touch, 13),
        ]),
      );
      // the touch really is a standstill in the window, and a short one
      const still = d.ticks.filter((t) => Math.abs(t.speedKmh) <= 1 && t.position.x - MARK_X <= FULL_STOP_AT_LINE_M && t.position.x > X_LINE);
      expect(still.length, `L${level}`).toBeGreaterThan(0);
      expect(still[still.length - 1].t - still[0].t, `L${level}`).toBeLessThan(0.5);
      expect({ level, done: d.done }).toEqual({ level, done: false });
    }
  });

  // A session whose rule engine demands a 3 s dwell and counts a stop only while the car is still standing on it
  // (stopRecencySec 0). The recency has to go too: at the shipped 6 s the engine is still holding the 10.5 s stop
  // the drive made for the walker 8 m back, so its flag would answer for THAT stop and say nothing about this one.
  const SLOW_ENGINE = { ruleConfig: { fullStopMinDurationSec: 3, stopRecencySec: 0 } };

  it("with the rule engine's dwell raised to 3 s, a 2 s stop at the line does not tick and a 4 s stop does — its verdict is a conjunct", () => {
    const slow = SLOW_ENGINE;
    for (const level of [1, 5] as const) {
      const two = drive(level, scripted([...restAt(MARK_X, 2), ...rollOut(MARK_X, 13)]), slow);
      expect({ level, sec: 2, done: two.done }).toEqual({ level, sec: 2, done: false });
      const four = drive(level, scripted([...restAt(MARK_X, 4), ...rollOut(MARK_X, 13)]), slow);
      expect({ level, sec: 4, done: four.done }).toEqual({ level, sec: 4, done: true });
    }
  });

  it("…and the short-stop card only ever claims a stop the rule engine calls full: no card for a 2 s halt it does not accept", () => {
    const slow = SLOW_ENGINE;
    for (const level of [1, 5] as const) {
      const d = drive(level, scripted([...restAt(32.92, 2), ...rollOut(32.92, 13)]), slow);
      expect(d.cards.map((c) => c.titleBg), `L${level}`).not.toContain(SHORT_CARD_TITLE);
      // the same halt held past the engine's dwell is told
      const held = drive(level, scripted([...restAt(32.92, 4), ...rollOut(32.92, 13)]), slow);
      expect(held.cards.filter((c) => c.titleBg === SHORT_CARD_TITLE).length, `L${level}`).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// §5 — THE Б2 STAR FOLLOWS THE GATE'S LINE (sc-merge-from-property:a401e4a7; rounds 1–2, the position rule is §6)
// ---------------------------------------------------------------------------

/** The compiled lesson with this gate's `requireStopAtLine` withdrawn — every other gate in the catalogue's shape. */
const withoutLineKey: LessonEdit = (lesson) => ({
  ...lesson,
  objectives: lesson.objectives.map((o) => {
    if (o.id !== GATE) return o;
    const { requireStopAtLine: _drop, ...params } = o.params as Record<string, unknown>;
    return { ...o, params } as typeof o;
  }),
});

/** The compiled lesson with this gate (key and all) moved 21 m up the approach, away from the Б2 paint. */
const gateMovedOffTheLine: LessonEdit = (lesson) => ({
  ...lesson,
  objectives: lesson.objectives.map((o) =>
    o.id !== GATE ? o : ({ ...o, params: { ...(o.params as Record<string, unknown>), x: 50 } } as typeof o),
  ),
});

describe("§5 the engine's «★ Правилно спиране на знак Б2» is never shown beside a refused «Спри напълно на Б2»", () => {
  it("POSITIVE CONTROLS: shadow-correct and mistake-signal-and-go keep their star at L1–L5 — on the sheet, once on the glass, in the debrief — minted after the gate ticked", () => {
    for (const name of ["shadow-correct", "mistake-signal-and-go"] as const) {
      for (const level of RUNGS) {
        const d = drive(level, recorded(name));
        expect({ name, level, done: d.done }).toEqual({ name, level, done: true });
        const stars = d.commendationTimes.filter((c) => c.code === "FULL_STOP_AT_STOP_SIGN");
        expect(stars.length, `${name} L${level}`).toBe(1);
        expect(stars[0].t, `${name} L${level}`).toBeGreaterThanOrEqual(d.completedAtSec!);
        expect(d.toasts.filter((x) => x.titleBg === B2_STAR_TITLE).length, `${name} L${level}`).toBe(1);
        expect(d.debrief, `${name} L${level}`).toContain(B2_STAR_TITLE);
      }
    }
  });

  it("a stop made only for the walker (x≈37.5, ~10 m back) and a roll over the paint: the engine would commend it, the gate refuses it, so no star — and the bills are the ones the key-less gate gets", () => {
    for (const level of [1, 3, 5] as const) {
      const tape = scripted(rollOut(X_WALK_REST, 13));
      const keyless = drive(level, tape, undefined, withoutLineKey);
      const shipped = drive(level, tape);
      // the precondition: this IS a stop the rule engine commends (recency only) — the star is its, not invented here
      expect(keyless.commendations, `L${level}`).toContain("FULL_STOP_AT_STOP_SIGN");
      expect({ level, done: shipped.done }).toEqual({ level, done: false });
      // the walker stop earned the walker task, so the Б2 gate WAS the active objective over the whole roll: it measured
      // the approach and refused it (this is also the probe's own control — `gateEverActive` can read true)
      expect({ level, walkYieldDone: shipped.walkYieldDone, gateEverActive: shipped.gateEverActive }).toEqual({ level, walkYieldDone: true, gateEverActive: true });
      expect(shipped.commendations, `L${level}`).not.toContain("FULL_STOP_AT_STOP_SIGN");
      expect(shipped.toasts.map((x) => x.titleBg), `L${level}`).not.toContain(B2_STAR_TITLE);
      expect(shipped.debrief, `L${level}`).not.toContain(B2_STAR_TITLE);
      // only praise is withdrawn: the billed list is exactly what the same drive gets without the key
      expect(shipped.violations, `L${level}`).toEqual(keyless.violations);
      expect(shipped.violations, `L${level}`).not.toContain("STOP_SIGN_NO_FULL_STOP");
    }
  });

  it("self-correction keeps it: a short stop, then a second full stop AT the line — the gate ticks and the star stays, minted after the tick", () => {
    for (const level of [1, 3, 5] as const) {
      const d = drive(level, scripted([...restAt(32.92, 2), ...restAt(MARK_X, 2, 32.92), ...rollOut(MARK_X, 13)]));
      expect({ level, done: d.done }).toEqual({ level, done: true });
      const stars = d.commendationTimes.filter((c) => c.code === "FULL_STOP_AT_STOP_SIGN");
      expect(stars.length, `L${level}`).toBe(1);
      expect(stars[0].t, `L${level}`).toBeGreaterThanOrEqual(d.completedAtSec!);
      expect(d.toasts.filter((x) => x.titleBg === B2_STAR_TITLE).length, `L${level}`).toBe(1);
      expect(d.debrief, `L${level}`).toContain(B2_STAR_TITLE);
    }
  });

  it("it is keyed on requireStopAtLine: the §1 tape with the key withdrawn keeps the engine's star exactly as before", () => {
    for (const level of [1, 5] as const) {
      const d = drive(level, scripted([...restAt(32.92, 2), ...rollOut(32.92, 13)]), undefined, withoutLineKey);
      expect(d.commendations, `L${level}`).toContain("FULL_STOP_AT_STOP_SIGN");
      expect(d.toasts.filter((x) => x.titleBg === B2_STAR_TITLE).length, `L${level}`).toBe(1);
    }
  });

  it("…and THIS gate's line reaches as far as the capsule it measures stops in: with the mark moved 5 m up the approach (paint ~6.3 m away, past the radius, inside radius + REACH_ZONE_GRACE_M) the undone gate still withdraws the star", () => {
    const fiveUp: LessonEdit = (lesson) => ({
      ...lesson,
      objectives: lesson.objectives.map((o) =>
        o.id !== GATE ? o : ({ ...o, params: { ...(o.params as Record<string, unknown>), x: MARK_X + 5 } } as typeof o),
      ),
    });
    for (const level of [1, 5] as const) {
      const tape = scripted(rollOut(X_WALK_REST, 13));
      const d = drive(level, tape, undefined, fiveUp);
      const radius = (compileScenario(SC_MERGE_FROM_PROPERTY, level).objectives.find((o) => o.id === GATE)!.params as { radiusM: number }).radiusM;
      // the paint is past the radius and inside the capsule reach — the band this test exists for
      expect(MARK_X + 5 - X_LINE, `L${level}`).toBeGreaterThan(radius);
      expect(MARK_X + 5 - X_LINE, `L${level}`).toBeLessThan(radius + REACH_ZONE_GRACE_M);
      expect({ level, done: d.done }).toEqual({ level, done: false });
      expect(d.commendations, `L${level}`).not.toContain("FULL_STOP_AT_STOP_SIGN");
      // …and the engine did mint it (the same tape, key withdrawn, keeps it)
      expect(drive(level, tape, undefined, (l) => withoutLineKey(fiveUp(l))).commendations, `L${level}`).toContain("FULL_STOP_AT_STOP_SIGN");
    }
  });

  it("it is keyed on THIS gate's line: with the gate moved 21 m off the paint, an undone gate does not withdraw a star earned at a line it does not cover", () => {
    for (const level of [1, 5] as const) {
      const d = drive(level, scripted([...restAt(MARK_X, 2), ...rollOut(MARK_X, 13)]), undefined, gateMovedOffTheLine);
      expect({ level, done: d.done }).toEqual({ level, done: false });
      expect(d.commendations, `L${level}`).toContain("FULL_STOP_AT_STOP_SIGN");
    }
  });

  // A LAWFUL STOP AT THE LINE KEEPS ITS STAR ON A STALLED CHAIN (round 2, verifier V-B1/V-B2; pinned through round 3).
  // The star is never withdrawn because the gate's row prints undone on a chain that stalled before it: it follows
  // where the full stop was made (§6), and this one was made inside the line window.
  it("Act B (verifier, round 1): the walker task missed, so the chain stalls and the Б2 gate never runs — a lawful full stop AT the line, zero bills, keeps its ★ on the sheet, the glass and the debrief", () => {
    // The verifier's own tape: wait for the walker 10.5 m behind the walk-yield mark, glance both ways, cross the
    // cleared тротоар at 10 km/h with no second stop (over the walk-yield's 5 km/h cap, so that task is missed and the
    // chain stalls), come to a full stop AT the Б2 line, hold it, glance, signal and merge.
    const tape = scriptedFromSpawn([
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_SPAWN, Y_EXIT], [48, Y_EXIT]], targetKmh: 18, stopAtEnd: true },
      { kind: "pause", sec: 16, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[48, Y_EXIT], [29.08, Y_EXIT]], targetKmh: 10, stopAtEnd: true },
      { kind: "pause", sec: 2.5, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      ...rollOut(29.08, 13),
    ]);
    for (const level of [1, 3, 5] as const) {
      const shipped = drive(level, tape);
      const keyless = drive(level, tape, undefined, withoutLineKey);
      // the act is what it claims: the walker task missed, the Б2 gate never once the active objective…
      expect({ level, walkYieldDone: shipped.walkYieldDone }).toEqual({ level, walkYieldDone: false });
      expect({ level, gateEverActive: shipped.gateEverActive }).toEqual({ level, gateEverActive: false });
      expect({ level, done: shipped.done }).toEqual({ level, done: false });
      // …a qualifying standstill INSIDE the ~1 m window of the mark (2.5 s at 20 Hz frames)…
      const atLine = shipped.ticks.filter((t) => Math.abs(t.speedKmh) <= 0.05 && t.position.x > X_LINE && t.position.x - MARK_X <= FULL_STOP_AT_LINE_M);
      expect(atLine.length, `L${level}`).toBeGreaterThan(0);
      expect(atLine[atLine.length - 1].t - atLine[0].t, `L${level}`).toBeGreaterThanOrEqual(2);
      // …and zero bills, identical with and without the key
      expect(shipped.violations, `L${level}`).toEqual([]);
      expect(keyless.violations, `L${level}`).toEqual([]);
      // the engine commends this stop (key-less precondition), and the shipped lesson keeps exactly that ★
      expect(keyless.commendations, `L${level}`).toContain("FULL_STOP_AT_STOP_SIGN");
      expect(shipped.commendations.filter((c) => c === "FULL_STOP_AT_STOP_SIGN").length, `L${level}`).toBe(1);
      expect(shipped.toasts.filter((x) => x.titleBg === B2_STAR_TITLE).length, `L${level}`).toBe(1);
      expect(shipped.debrief, `L${level}`).toContain(B2_STAR_TITLE);
      // the gate never measured it, so it never explained a refusal either
      expect(shipped.cards.map((c) => c.titleBg), `L${level}`).not.toContain(SHORT_CARD_TITLE);
    }
  });

  it("…and the frame the gate became active on decides nothing (round 3): activated ON the crossing frame, a stop made only for the walker still loses the ★ and a full stop AT the line still keeps it", () => {
    // The walker task moved (in the test only) so its disc is entered on the very frame the engine mints the star —
    // the crossing of the paint, where the car centre is already past the Б2 gate's acceptance cut. The Б2 gate is
    // pending for the whole approach and is evaluated once, on a frame on which it cannot accept anything. Round 2
    // read that as «it refused nothing, so the ★ stays» for ANY stop; the star now follows where the standstill was
    // made, so the gate's status on that frame is not consulted at all.
    const walkerOnly = scripted(rollOut(X_WALK_REST, 13));
    const atLine = scripted([...restAt(MARK_X, 2), ...rollOut(MARK_X, 13)]);
    const R = 3;
    /** The walker task re-authored as a disc whose near edge lies between the two frames the star is minted across. */
    const walkOnTheCrossing = (probe: Drive, level: number): { edit: LessonEdit; starT: number } => {
      const star = probe.commendationTimes.find((c) => c.code === "FULL_STOP_AT_STOP_SIGN")!;
      expect(star, `L${level}`).toBeDefined();
      const k = probe.ticks.findIndex((t) => t.t === star.t);
      expect(k, `L${level}`).toBeGreaterThan(0);
      const [xBefore, xAt] = [probe.ticks[k - 1].position.x, probe.ticks[k].position.x];
      expect(xAt, `L${level}`).toBeLessThan(xBefore);
      return {
        starT: star.t,
        edit: (lesson) => ({
          ...lesson,
          objectives: lesson.objectives.map((o) =>
            o.id !== WALK_GATE
              ? o
              : ({ ...o, params: { kind: "reachZone", x: (xBefore + xAt) / 2 - R, y: Y_EXIT, radiusM: R, maxSpeedKmh: 20 } } as typeof o),
          ),
        }),
      };
    };
    /** The same edit with the Б2 gate made the first objective instead — active from the spawn. */
    const gateFirst = (edit: LessonEdit): LessonEdit => (l) => {
      const e = edit(l);
      const gate = e.objectives.find((o) => o.id === GATE)!;
      return { ...e, objectives: [gate, ...e.objectives.filter((o) => o.id !== GATE)] };
    };
    const overLine = (d: Drive) => d.gateOverLine.map((g) => `${g.before}>${g.after}`);
    for (const level of [1, 5] as const) {
      // (a) a stop made only for the walker, ~8.5 m short of the mark: no ★, whenever the gate became active
      const a = walkOnTheCrossing(drive(level, walkerOnly, undefined, withoutLineKey), level);
      const d = drive(level, walkerOnly, undefined, a.edit);
      // the act: the walker task completes on the star's own frame, so the Б2 gate is pending up to and into the
      // crossing frame and its first evaluation is that frame
      expect({ level, walkYieldAtSec: d.walkYieldAtSec }).toEqual({ level, walkYieldAtSec: a.starT });
      expect({ level, overLine: overLine(d), gateEverActive: d.gateEverActive, done: d.done }).toEqual({ level, overLine: ["pending>active"], gateEverActive: true, done: false });
      expect(d.commendations, `L${level}`).not.toContain("FULL_STOP_AT_STOP_SIGN");
      expect(d.toasts.map((x) => x.titleBg), `L${level}`).not.toContain(B2_STAR_TITLE);
      expect(d.debrief, `L${level}`).not.toContain(B2_STAR_TITLE);
      // …and the same with the Б2 gate active for the whole approach
      const measured = drive(level, walkerOnly, undefined, gateFirst(a.edit));
      expect({ level, overLine: overLine(measured), done: measured.done }).toEqual({ level, overLine: ["active>active"], done: false });
      expect(measured.commendations, `L${level}`).not.toContain("FULL_STOP_AT_STOP_SIGN");

      // (b) a full stop AT the line on the same two chains: the ★ stays in both
      const b = walkOnTheCrossing(drive(level, atLine, undefined, withoutLineKey), level);
      const late = drive(level, atLine, undefined, b.edit);
      expect({ level, walkYieldAtSec: late.walkYieldAtSec }).toEqual({ level, walkYieldAtSec: b.starT });
      // pending for the whole approach, first evaluated on a frame it cannot accept — its row stays undone, as in Act B
      expect({ level, overLine: overLine(late), done: late.done }).toEqual({ level, overLine: ["pending>active"], done: false });
      expect(late.commendations.filter((c) => c === "FULL_STOP_AT_STOP_SIGN").length, `L${level}`).toBe(1);
      expect(late.toasts.filter((x) => x.titleBg === B2_STAR_TITLE).length, `L${level}`).toBe(1);
      expect(late.debrief, `L${level}`).toContain(B2_STAR_TITLE);
      const first = drive(level, atLine, undefined, gateFirst(b.edit));
      expect({ level, overLine: overLine(first), done: first.done }).toEqual({ level, overLine: ["done>done"], done: true });
      expect(first.commendations.filter((c) => c === "FULL_STOP_AT_STOP_SIGN").length, `L${level}`).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// §6 — THE Б2 STAR FOLLOWS WHERE THE STANDSTILL WAS MADE, IN EVERY CHAIN STATE (a401e4a7 round 3, the w77 judge)
// ---------------------------------------------------------------------------

/**
 * A chain STALLED at the walker task, the w77 judge's and the round-1 verifier's opening: wait for the walker 10.5 m
 * behind the walk-yield mark, then cross the cleared тротоар at 10 km/h with no second stop — over that task's 5 km/h
 * cap, so it is missed and «Спри напълно на Б2 на изхода» stays pending for the rest of the drive. Ends at rest at `x`.
 */
function stalledTo(x: number, sec: number): DriveStep[] {
  return [
    { kind: "glance", mirror: "left" },
    { kind: "glance", mirror: "right" },
    { kind: "drive", points: [[X_SPAWN, Y_EXIT], [48, Y_EXIT]], targetKmh: 18, stopAtEnd: true },
    { kind: "pause", sec: 16, brake: true },
    { kind: "glance", mirror: "right" },
    { kind: "glance", mirror: "left" },
    { kind: "drive", points: [[48, Y_EXIT], [x, Y_EXIT]], targetKmh: 10, stopAtEnd: true },
    { kind: "pause", sec, brake: true },
    { kind: "glance", mirror: "left" },
    { kind: "glance", mirror: "right" },
  ];
}
const hold = (sec: number): DriveStep => ({ kind: "pause", sec, brake: true });
/** `rollOut` for a car already standing PAST the paint: straight on round the corner (no point back at the line). */
function rollOutPastLine(x: number, kmh: number): DriveStep[] {
  return [
    { kind: "indicator", setting: "right" },
    { kind: "drive", points: [[x, Y_EXIT], ...TURN_ARC], targetKmh: kmh, stopAtEnd: false },
    { kind: "indicator", setting: "off" },
    { kind: "drive", points: [[X_LANE, 22], [X_LANE, 70], [X_LANE, 120]], targetKmh: 45 },
    { kind: "pause", sec: 1.5, brake: true },
  ];
}
const forwardTo = (from: number, to: number): DriveStep => ({ kind: "drive", points: [[from, Y_EXIT], [to, Y_EXIT]], targetKmh: 10, stopAtEnd: true });
const reverseTo = (from: number, to: number, kmh = 5): DriveStep => ({ kind: "drive", points: [[from, Y_EXIT], [to, Y_EXIT]], targetKmh: kmh, reverse: true, stopAtEnd: true });

const stars = (d: Drive) => d.commendationTimes.filter((c) => c.code === "FULL_STOP_AT_STOP_SIGN");
const starToasts = (d: Drive) => d.toasts.filter((x) => x.titleBg === B2_STAR_TITLE);
/** Every standstill of at least the rule engine's dwell (≤ 1 km/h for ≥ 0.5 s): where it began and when. */
function standstills(ticks: SimTick[]): Array<{ x: number; from: number; to: number }> {
  const out: Array<{ x: number; from: number; to: number }> = [];
  let run: SimTick[] = [];
  const flush = () => {
    if (run.length > 0 && run[run.length - 1].t - run[0].t >= 0.5) out.push({ x: run[0].position.x, from: run[0].t, to: run[run.length - 1].t });
    run = [];
  };
  for (const t of ticks) {
    if (Math.abs(t.speedKmh) <= 1) run.push(t);
    else flush();
  }
  flush();
  return out;
}
const GATE_TITLE = SC_MERGE_FROM_PROPERTY.success.find((s) => s.id === GATE)!.titleBg;

describe("§6 the ★ follows WHERE the full stop was made — the gate's own line window — whatever the chain was doing", () => {
  it("THE w77 JUDGE'S ACT: the walker task missed (chain stalled, gate pending before and after the paint), a full stop 4.0 m short, a 13 km/h roll over the line — no ★ on the sheet, the glass or the debrief, at L1/L3/L5, and nothing billed", () => {
    const SHORT_X = 32.92;
    const tape = scriptedFromSpawn([...stalledTo(SHORT_X, 2.5), ...rollOut(SHORT_X, 13)]);
    for (const level of [1, 3, 5] as const) {
      const shipped = drive(level, tape);
      const keyless = drive(level, tape, undefined, withoutLineKey);
      // the act is what it claims: the walker task missed, the Б2 gate pending coming into and going out of the crossing…
      expect({ level, walkYieldDone: shipped.walkYieldDone, gateEverActive: shipped.gateEverActive, done: shipped.done }).toEqual({ level, walkYieldDone: false, gateEverActive: false, done: false });
      expect(shipped.gateOverLine.map((g) => `${g.before}>${g.after}`), `L${level}`).toEqual(["pending>pending"]);
      // …one full stop, ~4 m behind the mark and outside the line window, held 2.5 s, and a roll over the paint
      const xs = restXs(shipped.ticks);
      expect(xs.length, `L${level}`).toBeGreaterThan(0);
      for (const x of xs) {
        expect(Math.abs(x - SHORT_X), `L${level} rest x ${x}`).toBeLessThan(0.3);
        expect(x - MARK_X, `L${level}`).toBeGreaterThan(FULL_STOP_AT_LINE_M);
      }
      const rest = shipped.ticks.filter((t) => Math.abs(t.speedKmh) <= 1 && Math.abs(t.position.x - SHORT_X) < 0.3);
      expect(rest[rest.length - 1].t - rest[0].t, `L${level}`).toBeGreaterThanOrEqual(2.4);
      expect(speedOverLine(shipped.ticks), `L${level}`).toBeGreaterThan(10);
      expect(speedOverLine(shipped.ticks), `L${level}`).toBeLessThan(15);
      // the engine commends it on recency (the key-less precondition: the ★ is its, on the crossing frame)…
      expect(stars(keyless).map((c) => c.t), `L${level}`).toEqual([shipped.gateOverLine[0].t]);
      expect(starToasts(keyless).length, `L${level}`).toBe(1);
      // …and the lesson whose gate says the stop is made AT the line does not praise it, in any channel
      expect(stars(shipped), `L${level}`).toEqual([]);
      expect(starToasts(shipped), `L${level}`).toEqual([]);
      expect(shipped.debrief, `L${level}`).not.toContain(B2_STAR_TITLE);
      // the sheet still names the task as undone; it no longer prints the ★ beside it
      expect(shipped.debrief, `L${level}`).toContain(GATE_TITLE);
      // only praise is withdrawn — nothing is billed, with or without the key
      expect(shipped.violations, `L${level}`).toEqual([]);
      expect(keyless.violations, `L${level}`).toEqual([]);
      // every other commendation of the drive is untouched
      expect(shipped.commendations, `L${level}`).toEqual(keyless.commendations.filter((c) => c !== "FULL_STOP_AT_STOP_SIGN"));
      expect(shipped.toasts.map((x) => x.titleBg), `L${level}`).toEqual(keyless.toasts.map((x) => x.titleBg).filter((x) => x !== B2_STAR_TITLE));
    }
  });

  it(`ONE WINDOW, ONE CONSTANT, EVERY CHAIN STATE: a full stop up to FULL_STOP_AT_LINE_M (${FULL_STOP_AT_LINE_M} m) behind the mark keeps the ★ and one just beyond it loses it — the same on a stalled chain as on a running one, where it is exactly the gate's ✓`, () => {
    // aim 8 cm past the wanted rest: the recorder settles ~0.04 m short of its target
    const cases = [
      { shortBy: 0.5, inWindow: true },
      { shortBy: FULL_STOP_AT_LINE_M, inWindow: true },
      { shortBy: FULL_STOP_AT_LINE_M + 0.23, inWindow: false },
      { shortBy: FULL_STOP_AT_LINE_M + 0.58, inWindow: false },
    ];
    for (const { shortBy, inWindow } of cases) for (const level of [1, 5] as const) {
      const x = MARK_X + shortBy - 0.08;
      const label = `short ${shortBy} L${level}`;
      const running = drive(level, scripted([...restAt(x, 2), ...rollOut(x, 13)]));
      const stalled = drive(level, scriptedFromSpawn([...stalledTo(x, 2.5), ...rollOut(x, 13)]));
      const keyless = drive(level, scriptedFromSpawn([...stalledTo(x, 2.5), ...rollOut(x, 13)]), undefined, withoutLineKey);
      for (const d of [running, stalled]) for (const rx of restXs(d.ticks)) {
        if (inWindow) expect(rx - MARK_X, label).toBeLessThanOrEqual(FULL_STOP_AT_LINE_M);
        else expect(rx - MARK_X, label).toBeGreaterThan(FULL_STOP_AT_LINE_M);
      }
      // the engine mints the star for every one of these stops — it has no window
      expect(stars(keyless).length, label).toBe(1);
      // running chain: the gate was the active objective, and the ★ is its ✓
      expect({ label, walkYieldDone: running.walkYieldDone, done: running.done }).toEqual({ label, walkYieldDone: true, done: inWindow });
      expect({ label, stars: stars(running).length, toasts: starToasts(running).length, debrief: running.debrief.includes(B2_STAR_TITLE) }).toEqual({ label, stars: inWindow ? 1 : 0, toasts: inWindow ? 1 : 0, debrief: inWindow });
      // …measured on ONE axis: the chain-independent watch latched the approach the gate's evaluator graded on
      expect(running.watchAxis, label).not.toBeNull();
      expect(running.watchAxis, label).toEqual(running.gateAxis);
      // stalled chain: the gate never ran (pending over the paint) and the answer is the same
      expect({ label, walkYieldDone: stalled.walkYieldDone, gateEverActive: stalled.gateEverActive }).toEqual({ label, walkYieldDone: false, gateEverActive: false });
      expect({ label, stars: stars(stalled).length, toasts: starToasts(stalled).length, debrief: stalled.debrief.includes(B2_STAR_TITLE) }).toEqual({ label, stars: inWindow ? 1 : 0, toasts: inWindow ? 1 : 0, debrief: inWindow });
      expect(stalled.violations, label).toEqual(keyless.violations);
    }
  });

  it("the ★ is kept for a stop at the line that then CREEPS over the paint under 1 km/h (still «stopped» to the rule engine on the crossing frame, and by then past the window)", () => {
    for (const level of [1, 5] as const) {
      const tape = scriptedFromSpawn([
        ...stalledTo(MARK_X, 2.5),
        { kind: "drive", points: [[MARK_X, Y_EXIT], [27.2, Y_EXIT]], targetKmh: 0.9, stopAtEnd: false },
        ...rollOutPastLine(27.2, 13),
      ]);
      const d = drive(level, tape);
      expect(speedOverLine(d.ticks), `L${level}`).toBeLessThanOrEqual(1);
      expect(d.gateOverLine.map((g) => `${g.before}>${g.after}`), `L${level}`).toEqual(["pending>pending"]);
      expect(stars(d).length, `L${level}`).toBe(1);
      expect(starToasts(d).length, `L${level}`).toBe(1);
    }
  });

  it("V2-K2, WITH EVIDENCE — stop short, roll the paint, reverse back to the mark, stand in the window, go: the only ★ the rule engine mints on that drive is the FIRST crossing's, for the short stop, so it is withdrawn; it mints none for the second crossing, so there is none to keep (✓ where the gate ran, no ★)", () => {
    const SHORT_X = 32.92;
    const correction: DriveStep[] = [forwardTo(SHORT_X, 26.6), hold(1), reverseTo(26.6, MARK_X), hold(2), ...rollOut(MARK_X, 13)];
    const chains = [
      { chain: "running", tape: scripted([...restAt(SHORT_X, 2), ...correction]), status: ["active>active", "done>done"], done: true },
      { chain: "stalled", tape: scriptedFromSpawn([...stalledTo(SHORT_X, 2.5), ...correction]), status: ["pending>pending", "pending>pending"], done: false },
    ];
    for (const { chain, tape, status, done } of chains) for (const level of [1, 5] as const) {
      const label = `${chain} L${level}`;
      const shipped = drive(level, tape);
      const keyless = drive(level, tape, undefined, withoutLineKey);
      // the act: two crossings of the paint, and between them a ≥ 2 s standstill inside the line window
      expect(shipped.gateOverLine.map((g) => `${g.before}>${g.after}`), label).toEqual(status);
      const [first, second] = shipped.gateOverLine.map((g) => g.t);
      const atLine = standstills(shipped.ticks).filter((r) => r.from > first && r.x > X_LINE && r.x - MARK_X <= FULL_STOP_AT_LINE_M);
      expect(atLine.length, label).toBe(1);
      expect(atLine[0].to - atLine[0].from, label).toBeGreaterThanOrEqual(1.9);
      expect(atLine[0].to, label).toBeLessThan(second);
      // THE EVIDENCE: without the key the engine mints exactly ONE star on the whole drive, on the first crossing —
      // before the standstill at the line existed. The second crossing is the same act to its one-act-one-bill latch
      // (rules/engine.ts billAct: only ACT_REVERSE_REOPEN_M = 20 m of reverse re-opens it), so nothing is minted there.
      expect(stars(keyless).map((c) => c.t), label).toEqual([first]);
      expect(stars(keyless)[0].t, label).toBeLessThan(atLine[0].from);
      // that one star praises the SHORT stop, so the shipped lesson withdraws it; the gate, where it ran, ticks on the
      // standstill at the line; and no star is invented for it
      expect({ label, done: shipped.done }).toEqual({ label, done });
      expect(stars(shipped), label).toEqual([]);
      expect(starToasts(shipped), label).toEqual([]);
      expect(shipped.debrief, label).not.toContain(B2_STAR_TITLE);
      expect(shipped.violations, label).toEqual(keyless.violations);
      expect(shipped.violations, label).not.toContain("STOP_SIGN_NO_FULL_STOP");
    }
  });

  it("…and where the rule engine DOES mint one for the stop at the line it is kept: the same correction with the reverse taken past 20 m re-opens the act, the engine mints a second ★ on the second crossing, and the shipped lesson shows exactly that one", () => {
    const SHORT_X = 32.92;
    const far = 52;
    const again: DriveStep[] = [forwardTo(SHORT_X, 26.6), hold(1), reverseTo(26.6, far, 10), hold(1), ...restAt(MARK_X, 2, far), ...rollOut(MARK_X, 13)];
    const chains = [
      { chain: "running", tape: scripted([...restAt(SHORT_X, 2), ...again]) },
      { chain: "stalled", tape: scriptedFromSpawn([...stalledTo(SHORT_X, 2.5), ...again]) },
    ];
    for (const { chain, tape } of chains) for (const level of [1, 5] as const) {
      const label = `${chain} L${level}`;
      const shipped = drive(level, tape);
      const keyless = drive(level, tape, undefined, withoutLineKey);
      expect(shipped.gateOverLine.length, label).toBe(2);
      const [first, second] = shipped.gateOverLine.map((g) => g.t);
      // the engine: one star per crossing — the short stop's, then the at-line stop's
      expect(stars(keyless).length, label).toBe(2);
      expect(stars(keyless)[0].t, label).toBe(first);
      expect(stars(keyless)[1].t, label).toBeGreaterThanOrEqual(second);
      // the lesson: the short stop's is withdrawn, the at-line stop's is kept
      expect(stars(shipped).map((c) => c.t), label).toEqual([stars(keyless)[1].t]);
      expect(starToasts(shipped).length, label).toBe(1);
      expect(shipped.debrief, label).toContain(B2_STAR_TITLE);
      expect(shipped.violations, label).toEqual(keyless.violations);
    }
  });

  it("EVERY APPROACH IS JUDGED ON ITS OWN STANDSTILL: a full stop at the line and a crossing (★), then back up the drive, a stop 4 m short and a roll — the engine commends both crossings, the lesson only the first, even with «Спри напълно на Б2» already ✓", () => {
    const SHORT_X = 32.92;
    const far = 52;
    const second: DriveStep[] = [forwardTo(MARK_X, 26.6), hold(1), reverseTo(26.6, far, 10), hold(1), ...restAt(SHORT_X, 2, far), ...rollOut(SHORT_X, 13)];
    const chains = [
      { chain: "running", tape: scripted([...restAt(MARK_X, 2), ...second]), status: ["done>done", "done>done"] },
      { chain: "stalled", tape: scriptedFromSpawn([...stalledTo(MARK_X, 2.5), ...second]), status: ["pending>pending", "pending>pending"] },
    ];
    for (const { chain, tape, status } of chains) for (const level of [1, 5] as const) {
      const label = `${chain} L${level}`;
      const shipped = drive(level, tape);
      const keyless = drive(level, tape, undefined, withoutLineKey);
      expect(shipped.gateOverLine.map((g) => `${g.before}>${g.after}`), label).toEqual(status);
      const [first, secondT] = shipped.gateOverLine.map((g) => g.t);
      expect(stars(keyless).length, label).toBe(2);
      expect(stars(keyless)[1].t, label).toBe(secondT);
      // the first approach's ★ stands; the second approach made no standstill at the line, and the one made at the
      // line 20-odd seconds and 50 m of driving earlier does not answer for it
      expect(stars(shipped).map((c) => c.t), label).toEqual([stars(keyless)[0].t]);
      expect(stars(shipped)[0].t, label).toBeGreaterThanOrEqual(first);
      expect(stars(shipped)[0].t, label).toBeLessThan(secondT);
      expect(starToasts(shipped).length, label).toBe(1);
      expect(shipped.violations, label).toEqual(keyless.violations);
    }
  });

  it("…but ON one approach a full stop made at the line is not unmade by a second one further back: at the line, back off 4.5 m, stop, roll — the ★ stays, as the gate's own ✓ does", () => {
    const backOff: DriveStep[] = [reverseTo(MARK_X, 33.5), hold(2), ...rollOut(33.5, 13)];
    const chains = [
      { chain: "running", tape: scripted([...restAt(MARK_X, 2), ...backOff]), done: true },
      { chain: "stalled", tape: scriptedFromSpawn([...stalledTo(MARK_X, 2.5), ...backOff]), done: false },
    ];
    for (const { chain, tape, done } of chains) for (const level of [1, 5] as const) {
      const label = `${chain} L${level}`;
      const d = drive(level, tape);
      // the act: a standstill in the window, then one ~4.5 m behind the mark, then one crossing
      const rests = standstills(d.ticks).filter((r) => r.x < X_WALK_REST - 1 && r.x > X_LINE);
      expect(rests.length, label).toBe(2);
      expect(rests[0].x - MARK_X, label).toBeLessThanOrEqual(FULL_STOP_AT_LINE_M);
      expect(rests[1].x - MARK_X, label).toBeGreaterThan(4);
      expect(d.gateOverLine.length, label).toBe(1);
      expect({ label, done: d.done }).toEqual({ label, done });
      expect(stars(d).length, label).toBe(1);
      expect(starToasts(d).length, label).toBe(1);
    }
  });

  it("THE WINDOW ENDS AT THE PAINT, for the ✓ and the ★ alike: a stop 1.5 m short, a creep over the line and a full stop made just PAST it — the task is not ticked and nothing is praised", () => {
    const back = MARK_X + 1.5;
    const past = X_CUT - 0.4;
    for (const level of [1, 5] as const) {
      const tape = scripted([
        ...restAt(back, 2),
        { kind: "drive", points: [[back, Y_EXIT], [past, Y_EXIT]], targetKmh: 2.5, stopAtEnd: true },
        hold(2),
        ...rollOutPastLine(past, 13),
      ]);
      const shipped = drive(level, tape);
      const keyless = drive(level, tape, undefined, withoutLineKey);
      // the act: a full stop past the gate's paint cut and still inside its disc, reached under the 3 km/h cap
      const beyond = standstills(shipped.ticks).filter((r) => r.x < X_CUT && r.x > MARK_X - 3);
      expect(beyond.length, `L${level}`).toBe(1);
      expect(beyond[0].to - beyond[0].from, `L${level}`).toBeGreaterThanOrEqual(1.9);
      expect(shipped.ticks.filter((t) => t.position.x < back - 0.2 && t.position.x > past + 0.2).every((t) => Math.abs(t.speedKmh) <= 3), `L${level}`).toBe(true);
      // the rule engine commends the creep (its stop 1.5 m back is recent), on the crossing frame — before the second stop
      expect(stars(keyless).map((c) => c.t), `L${level}`).toEqual([shipped.gateOverLine[0].t]);
      expect(stars(keyless)[0].t, `L${level}`).toBeLessThan(beyond[0].from);
      expect({ level, done: shipped.done }).toEqual({ level, done: false });
      expect(stars(shipped), `L${level}`).toEqual([]);
      expect(starToasts(shipped), `L${level}`).toEqual([]);
      expect(shipped.violations, `L${level}`).toEqual(keyless.violations);
    }
  });

  it("REVERSING THROUGH THE WINDOW IS NOT STANDING IN IT (speed is read unsigned): over the paint, back through the window at 2.5 km/h without stopping, a stop 4 m short, a roll — no ✓ and no ★", () => {
    const SHORT_X = 32.92;
    for (const level of [1, 5] as const) {
      const tape = scripted([
        ...restAt(SHORT_X, 2),
        forwardTo(SHORT_X, 26.6),
        hold(1),
        reverseTo(26.6, SHORT_X, 2.5),
        hold(2),
        ...rollOut(SHORT_X, 13),
      ]);
      const d = drive(level, tape);
      // the act: more than the dwell spent inside the window while reversing, at a signed speed below the standstill
      // threshold and an unsigned one above it — and no standstill there
      const inWindow = d.ticks.filter((t) => t.speedKmh < -1 && t.position.x > X_CUT && t.position.x - MARK_X <= FULL_STOP_AT_LINE_M);
      expect(inWindow.length, `L${level}`).toBeGreaterThan(0);
      expect(inWindow[inWindow.length - 1].t - inWindow[0].t, `L${level}`).toBeGreaterThan(1);
      expect(standstills(d.ticks).filter((r) => r.x > X_CUT && r.x - MARK_X <= FULL_STOP_AT_LINE_M), `L${level}`).toEqual([]);
      expect({ level, done: d.done }).toEqual({ level, done: false });
      expect(stars(d), `L${level}`).toEqual([]);
    }
  });

  it("the window itself, point by point — the one function the ✓ and the ★ both read: inside the disc, not past the paint, within FULL_STOP_AT_LINE_M of the mark; the whole disc while the axis is unknown", () => {
    const o = SC_MERGE_FROM_PROPERTY.success.find((s) => s.id === GATE)!;
    if (o.params.kind !== "reachZone") throw new Error("sc-mfp-stop-line is not a reachZone");
    const p = o.params;
    const from = { x: p.x + p.radiusM + REACH_ZONE_GRACE_M + 0.2, y: p.y }; // a ring entry straight down the exit
    const at = (dx: number, dy = 0) => reachZoneInLineWindow(p, from, { x: p.x + dx, y: p.y + dy });
    // along the approach (the car comes from +x): the mark, the near bound, just beyond it
    expect([at(0), at(0.5), at(FULL_STOP_AT_LINE_M - 0.001), at(FULL_STOP_AT_LINE_M + 0.001), at(2)]).toEqual([true, true, true, false, false]);
    // the far side ends at the paint cut, not at the disc's rim
    expect([at(-0.5), at(X_CUT - p.x + 0.001), at(X_CUT - p.x - 0.001), at(-2)]).toEqual([true, true, false, false]);
    // across the approach it is the disc: beside the mark inside the radius counts, outside it does not
    expect([at(0.5, p.radiusM - 0.6), at(0.5, p.radiusM + 0.2), at(0.5, -(p.radiusM + 0.2))]).toEqual([true, false, false]);
    // no axis yet (unknown is never a refusal): the disc, and nothing outside it
    const blind = (dx: number) => reachZoneInLineWindow(p, null, { x: p.x + dx, y: p.y });
    expect([blind(0), blind(p.radiusM - 0.01), blind(-(p.radiusM - 0.01)), blind(p.radiusM + 0.01)]).toEqual([true, true, true, false]);
  });

  it("the watch starts with the drive, not before it: frames before the car is posed (the scene's placeholder at the district origin) make no standstill at a line", () => {
    // `sc-mfp-stop-line` re-authored (in the test only) on the district origin, where the scene parks its placeholder
    // pose until the chassis publishes. A second of those frames is not a full stop anyone made.
    const atOrigin: LessonEdit = (lesson) => ({
      ...lesson,
      objectives: lesson.objectives.map((o) =>
        o.id !== GATE ? o : ({ ...o, params: { ...(o.params as Record<string, unknown>), x: 0, y: 0 } } as typeof o),
      ),
    });
    const lesson = atOrigin(compileScenario(SC_MERGE_FROM_PROPERTY, 5));
    const gateIndex = lesson.objectives.findIndex((o) => o.id === GATE);
    const template = drive(5, recorded("shadow-correct")).ticks[0];
    let session = createLessonSession(lesson);
    for (let i = 0; i <= 20; i++) {
      session = applyTick(session, { ...template, t: i * 0.05, speedKmh: 0, position: { x: 0, y: 0 }, events: [] }).state;
    }
    expect(session.posedAtSec).toBeUndefined();
    expect(session.stopLineWatch?.[gateIndex]?.stoodAtLine ?? false).toBe(false);
    // the control: the same frames once the car IS posed there (it rolled in) do make one
    session = applyTick(session, { ...template, t: 1.1, speedKmh: 2, position: { x: 0.5, y: 0 }, events: [] }).state;
    for (let i = 0; i <= 20; i++) {
      session = applyTick(session, { ...template, t: 1.2 + i * 0.05, speedKmh: 0, position: { x: 0.4, y: 0 }, events: [] }).state;
    }
    expect(session.posedAtSec).toBeDefined();
    expect(session.stopLineWatch?.[gateIndex]?.stoodAtLine).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §4 — THE KEY: authored on this gate, carried through every rung, validated
// ---------------------------------------------------------------------------

describe("§4 requireStopAtLine — authored, laddered untouched, validated", () => {
  it("is authored on sc-mfp-stop-line and reaches the compiled lesson at every rung", () => {
    for (const level of RUNGS) {
      const lesson = compileScenario(SC_MERGE_FROM_PROPERTY, level);
      const o = lesson.objectives.find((x) => x.id === GATE)!;
      expect((o.params as Record<string, unknown>).requireStopAtLine, `L${level}`).toBe(true);
      const parsed = parseObjectiveParams(o) as unknown as Record<string, unknown>;
      expect(parsed.requireStopAtLine, `L${level}`).toBe(true);
      expect(parsed.requireFullStop, `L${level}`).toBe(true);
    }
  });

  const base = (params: Record<string, unknown>): LessonObjective =>
    ({ id: "t", titleBg: "Спри на мястото", kind: "reachZone", params }) as unknown as LessonObjective;

  it("is refused on a gate that does not demand a full stop, on one with no approach axis, and as anything but true", () => {
    expect(() => parseObjectiveParams(base({ x: 0, y: 0, radiusM: 3, maxSpeedKmh: 3, requireStopAtLine: true }))).toThrow(
      /requireStopAtLine needs a full-stop demand/,
    );
    expect(() =>
      parseObjectiveParams(base({ x: 0, y: 0, radiusM: 3, requireFullStop: true, requireStopAtLine: true })),
    ).toThrow(/requireStopAtLine needs maxSpeedKmh or acceptBeforeMarkM/);
    // a cut the parse would drop (deeper than the radius) arms no axis either
    expect(() =>
      parseObjectiveParams(
        base({ x: 0, y: 0, radiusM: 3, acceptBeforeMarkM: 4, requireFullStop: true, requireStopAtLine: true }),
      ),
    ).toThrow(/requireStopAtLine needs maxSpeedKmh or acceptBeforeMarkM/);
    expect(() =>
      parseObjectiveParams(
        base({ x: 0, y: 0, radiusM: 3, maxSpeedKmh: 3, requireFullStop: true, requireStopAtLine: "yes" }),
      ),
    ).toThrow(/requireStopAtLine must be true/);
    // a title-derived full stop («напълно») satisfies the first condition exactly as an authored one does
    const derived = parseObjectiveParams({
      id: "t",
      titleBg: "Спри напълно на линията",
      kind: "reachZone",
      params: { x: 0, y: 0, radiusM: 3, maxSpeedKmh: 3, requireStopAtLine: true },
    } as unknown as LessonObjective) as unknown as Record<string, unknown>;
    expect(derived.requireFullStop).toBe(true);
    expect(derived.requireStopAtLine).toBe(true);
    const ok = parseObjectiveParams(
      base({ x: 0, y: 0, radiusM: 3, maxSpeedKmh: 3, requireFullStop: true, requireStopAtLine: true }),
    ) as unknown as Record<string, unknown>;
    expect(ok.requireStopAtLine).toBe(true);
  });

  it("the distance is one positive constant no wider than the authored disc", () => {
    expect(FULL_STOP_AT_LINE_M).toBeGreaterThan(0);
    const o = SC_MERGE_FROM_PROPERTY.success.find((s) => s.id === GATE)!;
    expect(o.params.kind === "reachZone" && FULL_STOP_AT_LINE_M <= o.params.radiusM).toBe(true);
  });
});
