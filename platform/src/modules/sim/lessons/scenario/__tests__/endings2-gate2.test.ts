/**
 * GATE 2 SAYS WHAT GATE 2 MEASURED — lane endings2 (sc-crossing-dart:1c7a07d8,
 * exam path; merge verifier N1 at the en landing; integrator rulings N1, N1b).
 *
 * Gate 2 (`finish.ts terminalRescueZone`, „simply stuck") used to end an EXAM
 * drive on «Стигна края на маршрута…» whatever the car had done — 6.6 m short
 * of the mark, beside a bay with no arrival mark, or driven away from a
 * roundabout — and a LESSON on «Спря в края на маршрута…» on an outside anchor
 * whose region face latches at any speed. The ending is now keyed on the
 * anchor's mode and on E1's arrival predicate (`stoppedStuckEndingCopy`).
 *
 * Every case is a REAL compiled lesson driven through `applyTick` — committed
 * demo tapes through the live chain (`liveChainReplay`) where the catalogue has
 * the drive, a tick stream built on the lesson's own geometry where it does not
 * (each says which) — and every assertion reads the sentence the engine pushed
 * on the frame that ended the drive.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { HudEvent } from "../../../contracts";
import type { SimTick } from "../../../rules";
import { parseScenarioTrace } from "../../../traces/parse";
import { makeTick } from "../../__tests__/fixtures";
import { applyTick, createLessonSession } from "../../engine";
import {
  FINISH_STANDSTILL_KMH,
  ROUTE_RUNOUT_ARRIVE_M,
  routeApproachFrom,
  routeEndMark,
  stoppedStuckEndingCopy,
  terminalRescueZone,
} from "../../finish";
import { parseObjectiveParams } from "../../objectives";
import type { LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

const EXAM_TITLE = "Край на изпитния маршрут";
const LESSON_TITLE = "Край на маршрута";
const EXAM_ARRIVED =
  "Стигна края на маршрута, затова изпитът приключва тук. Част от задачите останаха неизпълнени и изпитът не е издържан — разборът показва всяка от тях и всяка допусната грешка.";
const EXAM_INSIDE =
  "Колата стоя неподвижно при края на маршрута, но не всички задачи се отчетоха, затова изпитът приключва тук и не е издържан. Разборът показва всяка неизпълнена задача и всяка допусната грешка.";
const EXAM_OUTSIDE =
  "Колата напусна мястото, където свършва маршрутът, но не всички задачи се отчетоха, затова изпитът приключва тук и не е издържан. Разборът показва всяка неизпълнена задача и всяка допусната грешка.";
const LESSON_OUTSIDE =
  "Колата напусна мястото, където свършва маршрутът, но не всички задачи се отчетоха, затова урокът приключва тук. Разборът показва какво точно остана неизпълнено и как да го направиш следващия път.";
const LESSON_INSIDE =
  "Спря в края на маршрута, но задачата тук не се отчете — затова урокът приключва, вместо да те държи на място. Разборът показва какво точно остана неизпълнено и как да го направиш следващия път.";

interface Ended {
  events: Array<Extract<HudEvent, { kind: "lesson" }>>;
  state: LessonSessionState;
  /** The tick the ending was pushed on. */
  at: SimTick | null;
  /** Gate 2 latched and gate 1 did not — the stoppedStuck branch. */
  gate2: boolean;
}

const ENDING_TITLE = /^Край на (маршрута|изпитния маршрут)$/u;

function lessonOf(id: string, L: ScenarioLevel) {
  return compileScenario(SCENARIO_TEMPLATES.find((x) => x.id === id)!, L);
}

/** A committed demo tape through the live chain (LessonScene's stack). */
function replay(id: string, file: string, L: ScenarioLevel): Ended {
  const lesson = lessonOf(id, L);
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === id)!;
  const trace = parseScenarioTrace(
    JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", id, file), "utf-8")),
  )!;
  const out: Ended = { events: [], state: undefined as never, at: null, gate2: false };
  const o = liveChainReplay({
    lesson,
    districtRaw: loadDistrict(spec.map.districtId),
    trace,
    holdAfterSec: 30,
    afterApply: ({ tick, step }) => {
      for (const e of step.hudEvents) {
        if (e.kind === "lesson" && ENDING_TITLE.test(e.titleBg)) {
          out.events.push(e);
          out.at = tick;
          out.gate2 = step.state.finishGate?.reachedAtSec == null && step.state.finishRescueGate?.reachedAtSec != null;
        }
      }
    },
  });
  out.state = o.session;
  return out;
}

/** A tick stream on the lesson's own geometry, straight through `applyTick`. */
function drive(lesson: ReturnType<typeof lessonOf>, ticks: SimTick[]): Ended {
  let s = createLessonSession(lesson);
  const out: Ended = { events: [], state: s, at: null, gate2: false };
  for (const k of ticks) {
    const step = applyTick(s, k);
    s = step.state;
    for (const e of step.hudEvents) {
      if (e.kind === "lesson" && ENDING_TITLE.test(e.titleBg)) {
        out.events.push(e);
        out.at = k;
        out.gate2 = s.finishGate?.reachedAtSec == null && s.finishRescueGate?.reachedAtSec != null;
      }
    }
  }
  out.state = s;
  return out;
}

const DT = 0.05;

/**
 * sc-ed-reverse-line@L4 (exam): forward 11 m to the start pose, reverse 2 m
 * through the line checkpoint, reverse on to rest `lateralM` beside the kerb
 * mark and `shortM` short of it along the approach, and stand there.
 * Built on the compiled rung's own coordinates (spawn (−132, −136.4) heading
 * 90; marks (−121, −136.4), (−134, −136.4) reverse, (−144, −136.4) r 2.2).
 */
function reverseLineDrive(lateralM: number, shortM: number, standSec = 20): SimTick[] {
  const y0 = -136.4;
  const ticks: SimTick[] = [];
  let t = 0;
  let x = -132;
  const push = (speedKmh: number, gear: number, y = y0) => {
    ticks.push(makeTick({ t, speedKmh, gear, headingDeg: 90, position: { x, y } }));
    t = +(t + DT).toFixed(6);
  };
  // forward to the start pose at 8 km/h, stop
  while (x < -121) { push(8, 1); x += (8 / 3.6) * DT; }
  for (let i = 0; i < 30; i++) push(0, 1);
  // reverse west at 3 km/h onto the line, then on toward the kerb mark
  const endX = -144 + shortM;
  while (x > endX) {
    const k = Math.min(1, (x - endX) / 1);
    const y = y0 + lateralM * Math.min(1, Math.max(0, (-134 - x) / (-134 - endX)));
    push(-3, -1, y);
    x -= (3 / 3.6) * DT * Math.max(k, 0.3);
  }
  const yEnd = y0 + lateralM;
  for (let i = 0; i < standSec / DT; i++) ticks.push(makeTick({ t: +(t + i * DT).toFixed(6), speedKmh: 0, gear: -1, headingDeg: 90, position: { x: endX, y: yEnd } }));
  return ticks;
}

/**
 * sc-rb-exit-signal: the committed `mistake-exit-no-signal` tape (no right
 * signal on the exit, so the ring objective stays active) up to the moment the
 * car is heading west on the exit arm (t ≤ 57.6 s), then — instead of the
 * tape's stop — it keeps DRIVING away west at 30 km/h for `awaySec`.
 */
function ringDriveAway(awaySec: number): SimTick[] {
  const trace = parseScenarioTrace(
    JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", "sc-rb-exit-signal", "mistake-exit-no-signal.trace.json"), "utf-8")),
  )!;
  const ticks: SimTick[] = [];
  let last: { t: number; x: number; y: number } | null = null;
  for (const p of trace.samples) {
    if (p.tSec > 57.6) break;
    ticks.push(makeTick({ t: p.tSec, speedKmh: p.speedKmh, gear: p.gear, headingDeg: p.headingDeg, indicator: p.indicator, position: { x: p.x, y: p.y } }));
    last = { t: p.tSec, x: p.x, y: p.y };
  }
  let { t, x } = last!;
  const y = last!.y;
  for (let i = 0; i < awaySec / DT; i++) {
    t = +(t + DT).toFixed(6);
    x -= (30 / 3.6) * DT;
    ticks.push(makeTick({ t, speedKmh: 30, gear: 1, headingDeg: 270, indicator: "off", position: { x, y } }));
  }
  return ticks;
}

function only(d: Ended) {
  expect(d.events.length).toBe(1);
  return d.events[0];
}

describe("N1 — the exam's gate-2 ending claims an arrival only for a car that arrived", () => {
  it("sc-park-parallel-exit/mistake-no-room@L4 (committed tape): at rest 6.6 m SHORT of the mark → «Колата стоя неподвижно…», never «Стигна»", () => {
    const d = replay("sc-park-parallel-exit", "mistake-no-room.trace.json", 4);
    const e = only(d);
    expect(d.gate2).toBe(true);
    const mark = routeEndMark(d.state.lesson.objectives.map(parseObjectiveParams))!;
    const dist = Math.hypot(d.at!.position.x - mark.x, d.at!.position.y - mark.y);
    expect(dist).toBeGreaterThan(6);
    expect(Math.abs(d.at!.speedKmh)).toBeLessThanOrEqual(FINISH_STANDSTILL_KMH);
    expect(e.titleBg).toBe(EXAM_TITLE);
    expect(e.explanationBg).toBe(EXAM_INSIDE);
    expect(e.explanationBg).not.toMatch(/Стигна/u);
  });

  it("sc-ed-reverse-line@L4: at rest 2.4 m beside the kerb mark (≤ ROUTE_RUNOUT_ARRIVE_M, outside the 2.2 m disc) → «Стигна края…» (an arrival)", () => {
    const lesson = lessonOf("sc-ed-reverse-line", 4);
    const d = drive(lesson, reverseLineDrive(2.4, 0.05));
    const e = only(d);
    expect(d.gate2).toBe(true);
    const mark = routeEndMark(lesson.objectives.map(parseObjectiveParams))!;
    const dist = Math.hypot(d.at!.position.x - mark.x, d.at!.position.y - mark.y);
    expect(dist).toBeLessThanOrEqual(ROUTE_RUNOUT_ARRIVE_M);
    expect(dist).toBeGreaterThan(2.2);
    expect(e.explanationBg).toBe(EXAM_ARRIVED);
  });

  it("sc-pk-ban-stop/mistake-stop-at-edge@L4 (committed tape): at rest 4.95 m PAST the mark → «Стигна края…» (arrival by the half-plane, not by distance)", () => {
    const d = replay("sc-pk-ban-stop", "mistake-stop-at-edge.trace.json", 4);
    const e = only(d);
    expect(d.gate2).toBe(true);
    const params = d.state.lesson.objectives.map(parseObjectiveParams);
    const mark = routeEndMark(params)!;
    const from = routeApproachFrom(params, d.at!.position);
    const dist = Math.hypot(d.at!.position.x - mark.x, d.at!.position.y - mark.y);
    const along = ((d.at!.position.x - mark.x) * (mark.x - from.x) + (d.at!.position.y - mark.y) * (mark.y - from.y)) / Math.hypot(mark.x - from.x, mark.y - from.y);
    expect(dist).toBeGreaterThan(ROUTE_RUNOUT_ARRIVE_M);
    expect(along).toBeGreaterThan(0);
    expect(e.explanationBg).toBe(EXAM_ARRIVED);
  });

  it("sc-park-perp-rev/mistake-no-observation@L4 (committed tape): a parkInBay terminal has NO arrival mark → «Колата стоя неподвижно…»", () => {
    const d = replay("sc-park-perp-rev", "mistake-no-observation.trace.json", 4);
    const e = only(d);
    expect(d.gate2).toBe(true);
    expect(routeEndMark(d.state.lesson.objectives.map(parseObjectiveParams))).toBeNull();
    expect(e.explanationBg).toBe(EXAM_INSIDE);
  });

  it("sc-rb-exit-signal@L4 driven AWAY from the ring at 30 km/h: an outside anchor latches on its region face while moving → «Колата напусна мястото…», no standstill claimed", () => {
    const lesson = lessonOf("sc-rb-exit-signal", 4);
    expect(terminalRescueZone(lesson.objectives.map(parseObjectiveParams))?.mode).toBe("outside");
    const d = drive(lesson, ringDriveAway(30));
    const e = only(d);
    expect(d.gate2).toBe(true);
    expect(Math.abs(d.at!.speedKmh)).toBeGreaterThan(5);
    expect(e.titleBg).toBe(EXAM_TITLE);
    expect(e.explanationBg).toBe(EXAM_OUTSIDE);
    expect(e.explanationBg).not.toMatch(/Стигна|неподвижно|Спря/u);
  });

  it("sc-park-zebra/mistake-hidden-pedestrian@L4 (committed tape): gate 2 latches with the FIRST task still open — the sentence names no «последната» task and claims no arrival", () => {
    const d = replay("sc-park-zebra", "mistake-hidden-pedestrian.trace.json", 4);
    const e = only(d);
    expect(d.gate2).toBe(true);
    expect(d.state.objectives[0].status).not.toBe("done");
    expect(e.explanationBg).not.toMatch(/последн/u);
    expect(e.explanationBg).not.toMatch(/Стигна/u);
    expect(e.explanationBg).toBe(EXAM_INSIDE);
  });
});

describe("N1b — a LESSON ended on an outside anchor no longer says «Спря в края»", () => {
  it("sc-rb-exit-signal@L1 driven away at 30 km/h → «Колата напусна мястото… урокът приключва…»", () => {
    const d = drive(lessonOf("sc-rb-exit-signal", 1), ringDriveAway(30));
    const e = only(d);
    expect(d.gate2).toBe(true);
    expect(Math.abs(d.at!.speedKmh)).toBeGreaterThan(5);
    expect(e.titleBg).toBe(LESSON_TITLE);
    expect(e.explanationBg).toBe(LESSON_OUTSIDE);
  });

  it("sc-rb-exit-signal/mistake-exit-no-signal@L1 (committed tape, the car at rest beyond the ring) → the outside sentence too", () => {
    const d = replay("sc-rb-exit-signal", "mistake-exit-no-signal.trace.json", 1);
    const e = only(d);
    expect(d.gate2).toBe(true);
    expect(e.explanationBg).toBe(LESSON_OUTSIDE);
    expect(e.explanationBg).not.toMatch(/Спря в края/u);
  });

  it("CONTROL — sc-park-perp-rev/mistake-no-observation@L1 (inside anchor, lesson) keeps «Спря в края…» byte for byte", () => {
    const d = replay("sc-park-perp-rev", "mistake-no-observation.trace.json", 1);
    const e = only(d);
    expect(d.gate2).toBe(true);
    expect(e.titleBg).toBe(LESSON_TITLE);
    expect(e.explanationBg).toBe(LESSON_INSIDE);
  });
});

describe("stoppedStuckEndingCopy — the five cases, their titles and the catalogue band", () => {
  it("returns exactly the ruled sentence per case, the titles unchanged, each ≤ 319 characters", () => {
    const cases: Array<[boolean, "inside" | "outside", boolean, string, string]> = [
      [true, "inside", true, EXAM_TITLE, EXAM_ARRIVED],
      [true, "inside", false, EXAM_TITLE, EXAM_INSIDE],
      [true, "outside", false, EXAM_TITLE, EXAM_OUTSIDE],
      [true, "outside", true, EXAM_TITLE, EXAM_OUTSIDE],
      [false, "outside", false, LESSON_TITLE, LESSON_OUTSIDE],
      [false, "inside", false, LESSON_TITLE, LESSON_INSIDE],
      [false, "inside", true, LESSON_TITLE, LESSON_INSIDE],
    ];
    for (const [exam, mode, arrived, title, text] of cases) {
      const c = stoppedStuckEndingCopy(exam, mode, arrived);
      expect(c).toEqual({ kind: "lesson", titleBg: title, explanationBg: text });
      expect([...c.explanationBg].length).toBeLessThanOrEqual(319);
    }
  });
});
