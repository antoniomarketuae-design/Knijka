/**
 * THE TASK CEILING, ROUND 14 — «CAP ADDS, NEVER REMOVES» (founder ruling 2026-10-03), on hand-built witnesses through a
 * real lesson session: what the student is shown, coached and charged.
 *
 * The ruling, verbatim: «Cap adds, never removes. The task cap is an extra rule on top. Its bill stands on its own; the
 * bend/weather bills are charged exactly as they would be in a lesson with no cap. Blowing the cap can only add, never
 * lower the score, and order never matters.» It supersedes every earlier reading in which a task-cap bill absorbs, or is
 * absorbed by, a weather, bend or SPEEDING_* bill (round 13's «one continuous act, one bill» included). Built as TWO
 * LEDGERS: the weather, bend and speeding bills exactly as the same drive with the cap fields removed produces them, and
 * the cap's own bills from cap events alone, with their own first-fault grace. Total = sum.
 *
 * Every witness here is run TWICE — with the cap, and with the cap fields (`taskSpeedCap`, `taskCapArrival`) removed
 * from every frame — and `capAddsOnly` asserts the ruling as a property: every bill that is not the cap's is the same
 * bill in both runs (code, time, points, coached row, card text); the score with the cap is the score without it plus
 * the cap's own points, never less; the verdict is never better.
 *
 * A · THE LONG ACT (the round-13 verifier's C2): a sign-bound ≤50 mark blown at 56.2 on a posted 50, then 53 in the
 *     sign's grace band through three bends in the rain — 7 with no cap, 1 on round 13 with the mark blown.
 * B · ORDER, ON A SPENT TOPIC (the round-13 verifier's C1): a bend's first bill moved across the stamp of a stamp-billed
 *     arrival, the чл. 20, ал. 2 topic spent before the act — round 13 priced the act 3 or 1 by which card landed first.
 * C · THE PRINTED NUMBERS ARE TRUE (R1-THEO4-ROUNDED-ENVELOPE): the card tested v > env and printed round(env), so a
 *     committed lesson read «… с 42,8 км/ч … — и над 43 км/ч, които дъждът оставя от знака 50».
 * D · THE WEATHER CARD IS THE NO-CAP WEATHER CARD: its «и над тавана на задачата N км/ч» clause made the bill's text
 *     depend on the cap.
 * G · R1 AS A CLASS — THE OBJECTIVE'S OWN SPEED TOASTS: «Стигна точката, но твърде бързо» fires on `speed > cap` and
 *     «Мина точката твърде бавно» on `speed < floor`, and both printed `Math.round(speed)` — 9 committed recorder legs
 *     (base behaviour) read «… не повече от 10 км/ч, а стигна дотук с 10 км/ч».
 * E · THE CAP'S OWN GRACE: a task teach no longer spends the weather/bend topic, and a weather teach no longer spends
 *     the cap's.
 *
 * Cases tagged RED-ON-R13 were run RED on round 13's tree (`scratchpad/cap/r14/red-on-r13*.txt`).
 */
import { describe, expect, it } from "vitest";
import { makeViolation, type SimTick, type ViolationCode } from "../../rules";
import { tick } from "../../rules/__tests__/fixtures";
import { prog } from "../../rules/__tests__/taskCapProgrammes";
import { shiftProgramme, topicSpentPrefix } from "../../rules/__tests__/taskCapOrderProgrammes";
import { ORDER_PLACEMENTS, arrPair, orderKin, stampPair } from "../../rules/__tests__/taskCapWitnesses13";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordScPark45Drive } from "../../traces/scPark45";
import { recordScParkDepthDrive } from "../../traces/scParkDepth";
import { recordScParkPerpForwardDrive } from "../../traces/scParkPerpForward";
import { applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import { SC_PARK_45, SC_PARK_PERP_FORWARD } from "../scenario/templates-parking";
import { SC_PARK_DOUBLE } from "../scenario/templates-parking3";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState } from "../types";
import { falseObjectiveToastClaims, falsePrintedClaims } from "./taskCapPrinted";

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const CURVE = "SPEED_TOO_FAST_FOR_CURVE";
/** The uncapped practice lesson every task-cap round has driven (non-exam, no capped objective, no speed target). */
const UNCAPPED = "sc-follow-brake";
const explain = (code: string) => makeViolation(code as ViolationCode, 0).explanationBg;

interface Card {
  code: string;
  t: number;
  charged: boolean;
  text: string;
}
export interface Seen {
  score: number;
  passed: boolean;
  officialPassed: boolean;
  mistakes: string[];
  coached: string[];
  /** Every teach card and every violation/lesson toast, keyed by what it says (a toast carries no code). */
  cards: Card[];
  toasts: string[];
}
function session(f: readonly SimTick[]): Seen {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === UNCAPPED);
  if (spec === undefined) throw new Error(`no template ${UNCAPPED}`);
  let s: LessonSessionState = createLessonSession(compileScenario(spec, 1));
  const cards: Card[] = [];
  const toasts: string[] = [];
  for (const x of f) {
    const r = applyTick(s, x);
    s = r.state;
    for (const m of r.teachMoments ?? []) cards.push({ code: m.code, t: m.t, charged: m.charged === true, text: m.explanationBg });
    for (const h of r.hudEvents as Array<{ kind: string; titleBg?: string; explanationBg?: string }>) {
      if ((h.kind === "violation" || h.kind === "lesson") && h.explanationBg !== undefined) toasts.push(`${h.titleBg}|${h.explanationBg}`);
    }
  }
  const ended = s.phase === "driving" || s.phase === "preDrive" ? finishSession(s, f[f.length - 1].t) : s;
  const res = buildLessonResult(ended);
  return {
    score: res.score,
    passed: res.passed,
    officialPassed: res.summary.passed,
    mistakes: res.summary.mistakes.map((m) => `${m.code}@${m.t.toFixed(2)}|${m.points}`),
    coached: (ended.coachedMistakes ?? []).map((c) => `${c.code}@${c.t.toFixed(2)}`),
    cards,
    toasts,
  };
}
/** The same frames with every cap field removed — the lesson with no cap, as the ruling compares it. */
export function stripCap(f: readonly SimTick[]): SimTick[] {
  return f.map((x) => {
    const { taskSpeedCap: _c, taskCapArrival: _a, ...rest } = x;
    return rest as SimTick;
  });
}
const notTask = (row: string) => !row.startsWith(TASK);
const taskTitle = makeViolation(TASK as ViolationCode, 0).titleBg;
const taskPoints = (s: Seen) => s.mistakes.filter((m) => m.startsWith(TASK)).reduce((a, m) => a + Number(m.slice(m.indexOf("|") + 1)), 0);

/**
 * THE RULING AS A PROPERTY, on one drive: run with the cap and with the cap fields removed. Returns both runs.
 */
export function capAddsOnly(f: readonly SimTick[], label: string): { cap: Seen; noCap: Seen } {
  const cap = session(f);
  const noCap = session(stripCap(f));
  // (i) THE NO-CAP LEDGER: every bill that is not the cap's is the same bill, the same row, the same card text.
  expect(cap.mistakes.filter(notTask), `${label} — charged mistakes other than the cap's`).toEqual(noCap.mistakes);
  expect(cap.coached.filter(notTask), `${label} — coached rows other than the cap's`).toEqual(noCap.coached);
  expect(
    cap.cards.filter((c) => c.code !== TASK).map((c) => `${c.code}@${c.t}|${c.charged}|${c.text}`),
    `${label} — cards other than the cap's`,
  ).toEqual(noCap.cards.map((c) => `${c.code}@${c.t}|${c.charged}|${c.text}`));
  // A card the rate limit turns into a toast is still a card: what every toast of another code says is unchanged.
  expect(cap.toasts.filter((x) => !x.startsWith(`${taskTitle}|`)), `${label} — toasts other than the cap's`).toEqual(noCap.toasts);
  expect(noCap.mistakes.some((m) => m.startsWith(TASK)) || noCap.coached.some((m) => m.startsWith(TASK)), `${label} — no cap, no cap bill`).toBe(false);
  // (ii) THE SUM: the score with the cap is the score with no cap plus the cap's own points — never less.
  expect(cap.score, `${label} — score = no-cap score + the cap's points`).toBe(noCap.score + taskPoints(cap));
  expect(cap.score, `${label} — the cap never lowers the score`).toBeGreaterThanOrEqual(noCap.score);
  // (iii) THE VERDICT is never better with the cap.
  expect(cap.passed && !noCap.passed, `${label} — the verdict is never better with the cap`).toBe(false);
  expect(cap.officialPassed && !noCap.officialPassed, `${label} — the official verdict is never better with the cap`).toBe(false);
  return { cap, noCap };
}

// ---------------------------------------------------------------------------
// A · THE LONG ACT (the round-13 verifier's zz-v13-longact, frame for frame)
// ---------------------------------------------------------------------------

function longAct(o: { mark: boolean; rain: boolean; bends: number; cruise: number; endCorrect: boolean }): SimTick[] {
  const f: SimTick[] = [];
  for (let i = 0; i < 460; i++) {
    const t = i / 10;
    let v = o.cruise;
    const x: Record<string, unknown> = {};
    if (t < 0.9 - 1e-9) v = 49;
    else if (t < 1.0 - 1e-9) v = o.mark ? 56.2 : o.cruise;
    if (o.mark && Math.abs(t - 1.0) < 1e-9) x.taskCapArrival = { capKmh: 50, shownKmh: 50, graceKmh: 5, blownAtSec: 1.0, arrivalKmh: 56.2 };
    const bends = ([[6, 10], [20, 24], [34, 38]] as Array<[number, number]>).slice(0, o.bends);
    if (bends.some(([a, b]) => t >= a - 1e-9 && t < b - 1e-9)) x.curveAdvisoryKmh = 30;
    if (o.rain && t >= 12 - 1e-9 && t < 30 - 1e-9) {
      x.rain = true;
      x.headlights = "low";
    }
    if (o.endCorrect && t >= 40 - 1e-9) v = 45;
    f.push(tick(t, { maxSpeedKmh: 50, speedKmh: v, ...x } as Partial<SimTick>));
  }
  return f;
}

describe("A · THE LONG ACT — the drive that blew a mark is charged the same weather and bend bills as the drive that did not", () => {
  it("RED-ON-R13 · posted 50, the ≤50 mark passed at 56.2, then 53 in the sign's grace band through three bends in the rain: 7 with no cap AND 7 plus the cap's own with the mark blown (round 13: 1)", () => {
    const { cap, noCap } = capAddsOnly(longAct({ mark: true, rain: true, bends: 3, cruise: 53, endCorrect: false }), "rain, 3 bends, 53");
    expect(noCap.score).toBe(7);
    expect(cap.score).toBe(7 + taskPoints(cap));
    // The cap's own bill stands on its own: the blown mark is taught (its own topic, fresh), never absorbed.
    expect([...cap.coached, ...cap.mistakes].some((r) => r.startsWith(TASK))).toBe(true);
  });
  it("RED-ON-R13 · the same drive dry: 6 with no cap and 6 plus the cap's own with the mark blown (round 13: 0)", () => {
    const { cap, noCap } = capAddsOnly(longAct({ mark: true, rain: false, bends: 3, cruise: 53, endCorrect: false }), "dry, 3 bends, 53");
    expect(noCap.score).toBe(6);
    expect(cap.score).toBeGreaterThanOrEqual(6);
  });
  it("RED-ON-R13 · the verifier's whole grid (cruise 53/49 × rain × 1–3 bends × ending corrected or not): the ruling holds on every row", () => {
    for (const cruise of [53, 49])
      for (const rain of [false, true])
        for (const bends of [1, 2, 3])
          for (const endCorrect of [true, false]) capAddsOnly(longAct({ mark: true, rain, bends, cruise, endCorrect }), `cruise ${cruise} rain ${rain} bends ${bends} endCorrect ${endCorrect}`);
  });
});

// ---------------------------------------------------------------------------
// B · ORDER — a bend's first bill moved across the stamp, on a FRESH and on a SPENT чл. 20, ал. 2 topic
// ---------------------------------------------------------------------------

describe("B · ORDER NEVER MATTERS — a bend's first bill moved by fractions of a second across a stamp-billed arrival", () => {
  for (const len of [4, 12]) {
    it(`RED-ON-R13 · SPENT topic (a taught weather overspeed before the act), ${len} s stretch: the same score in every placement, and it is the no-cap score plus the cap's own (round 13: 3 or 1 by which card landed first)`, () => {
      const scores = new Set<number>();
      for (const p of ORDER_PLACEMENTS) {
        const f = [...topicSpentPrefix(60), ...shiftProgramme(orderKin("BEND", p.off, len), 10)];
        const { cap, noCap } = capAddsOnly(f, `spent, ${len} s, bend ${p.tag}`);
        // The no-cap ledger: the bend's bill on a topic the weather spent is charged 3 — in every placement.
        expect(noCap.mistakes.filter((m) => m.startsWith(CURVE)).map((m) => m.slice(m.indexOf("|") + 1))).toEqual(["3"]);
        scores.add(cap.score);
      }
      expect([...scores]).toHaveLength(1);
    });
    it(`RED-ON-R13 · FRESH topic, ${len} s stretch: the same score in every placement, and it is the no-cap score plus the cap's own`, () => {
      const scores = new Set<number>();
      for (const p of ORDER_PLACEMENTS) scores.add(capAddsOnly(orderKin("BEND", p.off, len), `fresh, ${len} s, bend ${p.tag}`).cap.score);
      expect([...scores]).toHaveLength(1);
    });
    it(`RED-ON-R13 · the topic spent by an earlier blown CAP (the cap's grace spent, the weather/bend topic fresh), ${len} s: the bend is TAUGHT in every placement and the cap is charged on its own`, () => {
      const capFirst = prog(
        [
          { from: 0, to: 0.9, v: 40 },
          { from: 0.9, to: 1.0, v: 47 },
          { from: 1.0, to: 1.1, v: 47, o: arrPair(35, 35, 1.0, 47) },
          { from: 1.1, to: 10, v: 25 },
        ],
        { maxSpeedKmh: 50 },
      );
      const scores = new Set<number>();
      for (const p of ORDER_PLACEMENTS) {
        const { cap, noCap } = capAddsOnly([...capFirst, ...shiftProgramme(orderKin("BEND", p.off, len), 10)], `cap-spent, ${len} s, bend ${p.tag}`);
        expect(noCap.coached.some((r) => r.startsWith(CURVE))).toBe(true);
        expect(cap.coached.some((r) => r.startsWith(CURVE))).toBe(true);
        expect(cap.mistakes.some((r) => r.startsWith(TASK))).toBe(true);
        scores.add(cap.score);
      }
      expect([...scores]).toHaveLength(1);
    });
  }
  it("RED-ON-R13 · a weather first bill moved across the stamp, spent and fresh: the same score in every placement", () => {
    for (const spent of [false, true]) {
      const scores = new Set<number>();
      for (const p of ORDER_PLACEMENTS) {
        const act = orderKin("RAIN", p.off, 12);
        scores.add(capAddsOnly(spent ? [...topicSpentPrefix(60), ...shiftProgramme(act, 10)] : act, `rain ${p.tag} spent=${spent}`).cap.score);
      }
      expect([...scores], `spent=${spent}`).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// C · THE PRINTED NUMBERS ARE TRUE
// ---------------------------------------------------------------------------

/** A ≤35 mark (gate = glass = 35) on a posted 50 in the rain, which leaves 42.5 of the sign; passed at `v`, then held. */
function wetMark(v: number, holdSec: number): SimTick[] {
  return prog(
    [
      { from: 0, to: 0.9, v: 30, o: { rain: true } },
      { from: 0.9, to: 1.0, v, o: { rain: true } },
      { from: 1.0, to: 1.1, v, o: { rain: true, ...arrPair(35, 35, 1.0, v), ...stampPair(35, 35, 1.0) } },
      { from: 1.1, to: 1.1 + holdSec, v, o: { rain: true, ...stampPair(35, 35, 1.0) } },
      { from: 1.1 + holdSec, to: 1.1 + holdSec + 6, v: 30, o: { rain: true } },
    ],
    { maxSpeedKmh: 50 },
  );
}

describe("C · THEO-4 — every number a card prints is true, and every comparison it states holds between the PRINTED numbers", () => {
  it("RED-ON-R13 · the arrival card at 42,8 through «≤35» in the rain on a posted 50: never «над 43 км/ч» (42,8 is not over 43); the rain's 42,5 is printed as it is", () => {
    const s = session(wetMark(42.8, 0));
    const card = s.cards.find((c) => c.code === TASK);
    expect(card).toBeDefined();
    expect(falsePrintedClaims(card!.text)).toEqual([]);
    expect(card!.text).toBe(`Мина точката на задачата с 42,8 км/ч при таван на задачата 35 км/ч — и над 42,5 км/ч, които дъждът оставя от знака 50. ${explain(TASK)}`);
  });
  it("RED-ON-R13 · the stretch's charged card (the act's one re-grade) at 42,8: never «над 43»", () => {
    const s = session(wetMark(42.8, 12));
    const texts = [...s.cards.map((c) => c.text), ...s.toasts.map((x) => x.slice(x.indexOf("|") + 1))].filter((x) => x.includes("таван на задачата"));
    expect(texts.length).toBeGreaterThanOrEqual(2);
    for (const x of texts) expect(falsePrintedClaims(x), x).toEqual([]);
    expect(texts.some((x) => x.startsWith("Отчетена скорост 42,8 км/ч при таван на задачата 35 км/ч — и над 42,5 км/ч, които дъждът оставя от знака 50."))).toBe(true);
  });
  it("RED-ON-R13 · where the PRINTED speed is not over the printed envelope (42,53 prints «42,5», the rain leaves 42,5) the clause is not said at all — the card names only what its own numbers show; WHO IS BILLED does not move", () => {
    const s = session(wetMark(42.53, 0));
    const card = s.cards.find((c) => c.code === TASK);
    expect(card?.text).toBe(`Мина точката на задачата с 42,5 км/ч при таван на задачата 35 км/ч. ${explain(TASK)}`);
    expect(falsePrintedClaims(card!.text)).toEqual([]);
  });
  it("RED-ON-R13 · one step over it (42,56 prints «42,6») the clause is said, with the envelope as it is", () => {
    const s = session(wetMark(42.56, 0));
    expect(s.cards.find((c) => c.code === TASK)?.text).toBe(
      `Мина точката на задачата с 42,6 км/ч при таван на задачата 35 км/ч — и над 42,5 км/ч, които дъждът оставя от знака 50. ${explain(TASK)}`,
    );
  });
});

// ---------------------------------------------------------------------------
// D · THE WEATHER CARD IS THE NO-CAP WEATHER CARD
// ---------------------------------------------------------------------------

describe("D · the weather card says exactly what it says on the same drive with no cap", () => {
  it("RED-ON-R13 · rain on a posted 70 (59,5 of the sign), a ≤60 stamp, the car at 66: the weather card carries no «и над тавана на задачата» clause — the cap's own card speaks for the cap", () => {
    const f = prog(
      [
        { from: 0, to: 1.0, v: 50, o: { ...stampPair(60, 60, 0.5) } },
        { from: 1.0, to: 6.0, v: 66, o: { rain: true, ...stampPair(60, 60, 0.5) } },
        { from: 6.0, to: 16, v: 50 },
      ],
      { maxSpeedKmh: 70 },
    );
    const { cap, noCap } = capAddsOnly(f, "weather card");
    const w = cap.cards.find((c) => c.code === COND);
    expect(w).toBeDefined();
    expect(w!.text).toBe(noCap.cards.find((c) => c.code === COND)!.text);
    expect(w!.text).toBe(explain(COND));
  });
});

// ---------------------------------------------------------------------------
// E · THE CAP'S OWN FIRST-FAULT GRACE (ruling 16 applied to the cap's own fault)
// ---------------------------------------------------------------------------

describe("E · the cap's first-fault grace is its own — it neither spends nor reads the weather/bend topic", () => {
  const capThenWeather = prog(
    [
      { from: 0, to: 0.9, v: 40 },
      { from: 0.9, to: 1.0, v: 47 },
      { from: 1.0, to: 1.1, v: 47, o: arrPair(35, 35, 1.0, 47) },
      { from: 1.1, to: 10, v: 25 },
      { from: 10, to: 16, v: 47, o: { rain: true } },
      { from: 16, to: 26, v: 25 },
    ],
    { maxSpeedKmh: 50 },
  );
  it("RED-ON-R13 · a taught cap, then a weather overspeed later in the drive: the weather is TAUGHT (its topic is fresh), exactly as with no cap", () => {
    const { cap } = capAddsOnly(capThenWeather, "cap then weather");
    expect(cap.coached.map((r) => r.slice(0, r.indexOf("@")))).toEqual([TASK, COND]);
    expect(cap.mistakes).toEqual([]);
  });
  it("RED-ON-R13 · a taught weather overspeed, then a blown cap: the cap is TAUGHT (its own grace), the weather row unchanged", () => {
    const weatherThenCap = prog(
      [
        { from: 0, to: 6, v: 47, o: { rain: true } },
        { from: 6, to: 14.9, v: 25 },
        { from: 14.9, to: 15.0, v: 47 },
        { from: 15.0, to: 15.1, v: 47, o: arrPair(35, 35, 15.0, 47) },
        { from: 15.1, to: 24, v: 25 },
      ],
      { maxSpeedKmh: 50 },
    );
    const { cap } = capAddsOnly(weatherThenCap, "weather then cap");
    expect(cap.coached.map((r) => r.slice(0, r.indexOf("@")))).toEqual([COND, TASK]);
    expect(cap.mistakes).toEqual([]);
  });
  it("a second blown cap later is the cap's repeat — charged on its own, whatever the weather/bend topic", () => {
    const twice = prog(
      [
        { from: 0, to: 0.9, v: 40 },
        { from: 0.9, to: 1.0, v: 47 },
        { from: 1.0, to: 1.1, v: 47, o: arrPair(35, 35, 1.0, 47) },
        { from: 1.1, to: 10, v: 25 },
        { from: 10, to: 10.9, v: 40 },
        { from: 10.9, to: 11.0, v: 47 },
        { from: 11.0, to: 11.1, v: 47, o: arrPair(35, 35, 11.0, 47) },
        { from: 11.1, to: 20, v: 25 },
      ],
      { maxSpeedKmh: 50 },
    );
    const { cap } = capAddsOnly(twice, "the cap twice");
    expect(cap.coached).toEqual([`${TASK}@1.00`]);
    expect(cap.mistakes).toEqual([`${TASK}@11.00|1`]);
  });
});

// ---------------------------------------------------------------------------
// F · R1 AS A CLASS — the printed-number grid
// ---------------------------------------------------------------------------

describe("F · R1 as a class — over every sign the catalogue posts and every weather factor, at speeds a hair either side of what the weather leaves: every number the cap's card prints is the frame's own, and every comparison it states holds between its printed numbers", () => {
  it("25 signs × rain/fog/snow × 11 offsets around the envelope (exactly on it, then 0,001 … 0,55 km/h over): the card names the envelope exactly when the printed speed is over the printed envelope, prints it to its last decimal, and never claims what its numbers do not show", () => {
    const factors = { rain: 0.85, fog: 0.6, snow: 0.5 } as const;
    const deltas = [-0.04, 0, 0.001, 0.01, 0.04, 0.049, 0.05, 0.051, 0.06, 0.3, 0.55];
    const bad: string[] = [];
    let cards = 0;
    let clauses = 0;
    let decimalEnvelopes = 0;
    let withheldByPrinting = 0;
    for (let sign = 20; sign <= 140; sign += 5) {
      for (const [w, factor] of Object.entries(factors)) {
        const env = sign * factor;
        for (const d of deltas) {
          const v = Math.round((env + d) * 1000) / 1000;
          const cap = Math.floor(v) - 6;
          if (cap < 3) continue;
          const flag = { [w]: true, ...(w === "fog" ? { fogLightsOn: true } : {}) };
          const f = prog(
            [
              { from: 0, to: 0.9, v: cap - 2, o: flag },
              { from: 0.9, to: 1.0, v, o: flag },
              { from: 1.0, to: 1.1, v, o: { ...flag, ...arrPair(cap, cap, 1.0, v) } },
              { from: 1.1, to: 2.1, v: cap - 2, o: flag },
            ],
            { maxSpeedKmh: sign },
          );
          const card = session(f).cards.find((c) => c.code === TASK);
          if (card === undefined) {
            bad.push(`${sign} ${w} ${v}: no cap card`);
            continue;
          }
          cards++;
          for (const b of falsePrintedClaims(card.text)) bad.push(`${sign} ${w} ${v}: ${b}`);
          const m = /— и над (\d+(?:,\d+)?) км\/ч, които/.exec(card.text);
          const printedV = Number(card.text.match(/с (\d+(?:,\d+)?) км\/ч/)![1].replace(",", "."));
          const shouldSay = v > env && printedV > Math.round(env * 100) / 100;
          if (shouldSay !== (m !== null)) bad.push(`${sign} ${w} ${v}: the clause is ${m !== null ? "said" : "not said"} (env ${env})`);
          if (m !== null) {
            clauses++;
            const printedEnv = Number(m[1].replace(",", "."));
            if (Math.abs(printedEnv - env) > 1e-9) bad.push(`${sign} ${w} ${v}: printed envelope ${m[1]} is not the frame's ${env}`);
            if (!Number.isInteger(printedEnv)) decimalEnvelopes++;
          } else if (v > env) withheldByPrinting++;
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(cards).toBeGreaterThan(600);
    expect(clauses).toBeGreaterThan(300);
    expect(decimalEnvelopes).toBeGreaterThan(100);
    expect(withheldByPrinting).toBeGreaterThan(30);
  }, 300_000);
});

describe("G · R1 AS A CLASS — the objective's own speed toasts print numbers that bear their comparison out", () => {
  const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");
  const world = (id: string): unknown => JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;
  type Recorder = (district: unknown, name: never, extra: { onTick: (t: SimTick) => void }) => unknown;
  /** Every objective toast that opens «Задачата иска» and prints a speed, on one committed recorder leg. */
  function objectiveToasts(spec: typeof SC_PARK_45, lv: ScenarioLevel, record: Recorder, name: string): string[] {
    let s = createLessonSession(compileScenario(spec, lv));
    const out: string[] = [];
    record(world(spec.map.districtId), name as never, {
      onTick: (tick) => {
        if (s.phase !== "driving" && s.phase !== "preDrive") return;
        const r = applyTick(s, tick);
        s = r.state;
        for (const h of r.hudEvents ?? []) {
          const x = h as { kind: string; explanationBg?: string };
          if (x.kind === "lesson" && x.explanationBg !== undefined && x.explanationBg.startsWith("Задачата иска") && x.explanationBg.includes(" км/ч")) out.push(x.explanationBg);
        }
      },
    });
    return out;
  }
  it("the 9 committed legs that read «… не повече от 10 км/ч, а стигна дотук с 10 км/ч» (and the same at 8 and at 6) now state a speed the printed numbers bear out", () => {
    const legs: Array<[typeof SC_PARK_45, ScenarioLevel, Recorder, string]> = [
      [SC_PARK_45, 3, recordScPark45Drive as unknown as Recorder, "shadow-correct"],
      [SC_PARK_45, 5, recordScPark45Drive as unknown as Recorder, "shadow-correct"],
      [SC_PARK_45, 3, recordScPark45Drive as unknown as Recorder, "mistake-overshoot"],
      [SC_PARK_45, 5, recordScPark45Drive as unknown as Recorder, "mistake-overshoot"],
      [SC_PARK_PERP_FORWARD, 1, recordScParkPerpForwardDrive as unknown as Recorder, "mistake-early-turn"],
      [SC_PARK_PERP_FORWARD, 2, recordScParkPerpForwardDrive as unknown as Recorder, "mistake-early-turn"],
      [SC_PARK_PERP_FORWARD, 3, recordScParkPerpForwardDrive as unknown as Recorder, "mistake-early-turn"],
      [SC_PARK_PERP_FORWARD, 5, recordScParkPerpForwardDrive as unknown as Recorder, "mistake-early-turn"],
      [SC_PARK_DOUBLE, 1, ((d: unknown, name: never, extra: { onTick: (t: SimTick) => void }) => recordScParkDepthDrive(d, "sc-park-double" as never, name, extra)) as Recorder, "mistake-wide-run-up"],
    ];
    const opened: string[] = [];
    for (const [spec, lv, rec, name] of legs) {
      const toasts = objectiveToasts(spec, lv, rec, name).filter((x) => x.includes("не повече от"));
      expect(toasts.length, `${spec.id} L${lv} ${name}`).toBeGreaterThan(0);
      for (const x of toasts) expect(falsePrintedClaims(x), `${spec.id} L${lv} ${name}: ${x.slice(0, 140)}`).toEqual([]);
      opened.push(...toasts.map((x) => x.split(" — ")[0]));
    }
    // what the student now reads where the whole number would have been false
    expect(opened.every((x) => !/не повече от (\d+) км\/ч, а стигна дотук с \1 км\/ч/.test(x))).toBe(true);
  }, 300_000);
  it("the reader refutes the false forms and passes the true ones, independently of the builder", () => {
    expect(falseObjectiveToastClaims("Задачата иска да си тук с не повече от 10 км/ч, а стигна дотук с 10 км/ч — затова още не се отчита.")).toHaveLength(1);
    expect(falseObjectiveToastClaims("Задачата иска да минеш тук с поне 30 км/ч, а мина с 30 км/ч. Съобразена…")).toHaveLength(1);
    expect(falseObjectiveToastClaims("Задачата иска да си тук с не повече от 10 км/ч, а стигна дотук с 10,3 км/ч — затова още не се отчита.")).toEqual([]);
    expect(falseObjectiveToastClaims("Задачата иска да си тук с не повече от 10 км/ч, а стигна дотук с малко над 10 км/ч — затова още не се отчита.")).toEqual([]);
    expect(falseObjectiveToastClaims("Задачата иска да си тук с не повече от 10 км/ч, а върху точката вдигна скоростта до 12 км/ч — затова още не се отчита.")).toEqual([]);
    expect(falseObjectiveToastClaims("Задачата иска да минеш тук с поне 30 км/ч, а мина с 29,6 км/ч. Съобразена…")).toEqual([]);
    expect(falseObjectiveToastClaims("Задачата иска да минеш тук с поне 30 км/ч, а мина с малко под 30 км/ч. Съобразена…")).toEqual([]);
    // a speed in a shape the reader does not know is reported, never passed
    expect(falseObjectiveToastClaims("Задачата иска да си тук под 10 км/ч и с 12 км/ч.")).toHaveLength(1);
  });
});
