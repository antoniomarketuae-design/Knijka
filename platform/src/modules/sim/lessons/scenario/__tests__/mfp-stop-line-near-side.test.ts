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
import { FULL_STOP_AT_LINE_M, REACH_ZONE_GRACE_M, parseObjectiveParams } from "../../objectives";
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
  record((tick) => {
    ticks.push(tick);
    const step = applyTick(session, tick);
    session = step.state;
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
    // where the task's verdict is known; the BILL is untouched (the engine accepted this stop and still does: only the
    // praise goes, never a new −10 — the wait for a gap must not bill).
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
// §5 — THE Б2 STAR FOLLOWS THE GATE (sc-merge-from-property:a401e4a7)
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

  // A GATE THAT NEVER RAN NEVER COSTS A STAR (round 2, verifier V-B1/V-B2). The star is withdrawn only where the
  // stop-line gate actually measured the approach and refused the stop — never because its row prints undone on a
  // chain that stalled before it.
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

  it("…and a gate that only becomes active ON the crossing frame measured nothing either: the ★ minted on that frame stays", () => {
    // The walker task moved (in the test only) so its disc is entered on the very frame the engine mints the star —
    // the crossing of the paint, where the car centre is already past the Б2 gate's acceptance cut. The Б2 gate is
    // activated and evaluated once, on a frame on which it cannot accept anything, so it has refused nothing.
    const tape = scripted(rollOut(X_WALK_REST, 13));
    for (const level of [1, 5] as const) {
      const probe = drive(level, tape, undefined, withoutLineKey);
      const star = probe.commendationTimes.find((c) => c.code === "FULL_STOP_AT_STOP_SIGN")!;
      expect(star, `L${level}`).toBeDefined();
      const k = probe.ticks.findIndex((t) => t.t === star.t);
      expect(k, `L${level}`).toBeGreaterThan(0);
      const [xBefore, xAt] = [probe.ticks[k - 1].position.x, probe.ticks[k].position.x];
      expect(xAt, `L${level}`).toBeLessThan(xBefore);
      const R = 3;
      const walkOnTheCrossing: LessonEdit = (lesson) => ({
        ...lesson,
        objectives: lesson.objectives.map((o) =>
          o.id !== WALK_GATE
            ? o
            : ({ ...o, params: { kind: "reachZone", x: (xBefore + xAt) / 2 - R, y: Y_EXIT, radiusM: R, maxSpeedKmh: 20 } } as typeof o),
        ),
      });
      const d = drive(level, tape, undefined, walkOnTheCrossing);
      // the act: the walker task completes on the star's own frame, so the Б2 gate's first frame is the crossing
      expect({ level, walkYieldAtSec: d.walkYieldAtSec }).toEqual({ level, walkYieldAtSec: star.t });
      expect({ level, gateEverActive: d.gateEverActive, done: d.done }).toEqual({ level, gateEverActive: true, done: false });
      // the ★ the engine minted on that frame is kept
      expect(d.commendations.filter((c) => c === "FULL_STOP_AT_STOP_SIGN").length, `L${level}`).toBe(1);
      expect(d.toasts.filter((x) => x.titleBg === B2_STAR_TITLE).length, `L${level}`).toBe(1);
      // the same edit with the Б2 gate made the first objective instead (active from the start, so it measured the
      // whole approach) withdraws it — the frame of activation is the only difference
      const measured = drive(level, tape, undefined, (l) => {
        const e = walkOnTheCrossing(l);
        const gate = e.objectives.find((o) => o.id === GATE)!;
        return { ...e, objectives: [gate, ...e.objectives.filter((o) => o.id !== GATE)] };
      });
      expect({ level, gateEverActive: measured.gateEverActive, done: measured.done }).toEqual({ level, gateEverActive: true, done: false });
      expect(measured.commendations, `L${level}`).not.toContain("FULL_STOP_AT_STOP_SIGN");
    }
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
