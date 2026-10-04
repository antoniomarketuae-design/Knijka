/**
 * THE TASK CEILING, ROUND 15 — THE ARRIVAL IS DECIDED AT THE MARK, AND THE TOAST NAMES THE REASON THAT HOLDS.
 *
 * Two findings of the capcheck investigation, each replayed through the REAL lesson session from the RECORDED live
 * poses of the w72 `sc-follow-tailgater` wrong legs (`w72-tailgater-live-poses.fixture.json`: one row per SimTick the
 * live LessonPlayShell fed `applyTick`, through the real world runtime, traffic and scenario director):
 *
 *  · `sc-follow-tailgater:4b342eee` [major] — «slow early, then speed up through the mark» escaped the arrival bill.
 *    The latch read the evaluator's approach verdict, and an approach HONOURED anywhere on the capsule (up to
 *    REACH_ZONE_GRACE_M behind the disc — 20 m short of the mark on L1's radius 15) kept «honoured» through the mark:
 *    eased to 38 by y = 178, 39,6 at y = 180,02, +2,5 m/s², the mark passed at 53,6 over a bill line of 46 — no latch,
 *    no breach row, no task bill. Round 15 decides the arrival where the car CROSSES the mark, at the speed
 *    interpolated between the frame short of it and the frame at or past it, against the glass figure plus the sign's
 *    tolerance (founder ruling 2026-10-03 «LIKE A SPEED SIGN»: «≤36» bills above 39,6).
 *  · `sc-follow-tailgater:5a56612e` [major] — the toast «…вдигна скоростта до 41 км/ч — затова още не се отчита. Намали
 *    СЕГА…» on the pc wrong leg (frame `w72-cap-pc/frames/sc-follow-tailgater__pc-wrong/04-t042s.png`) gave a cause and
 *    a remedy that were false on that frame: the tick was withheld by `requireBrakingClean` (the leg's dead stop on the
 *    open road at 46,9 s), which slowing down cannot undo.
 *
 * Every «billed now» row below was RED on base 7c73590; the guards were green there and stay green.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../../runtime";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict } from "../../../traffic/types";
import { createScenarioDirector } from "../../../orchestrator/director";
import type { VehicleSample } from "../../../contracts";
import type { SimTick } from "../../../rules";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import type { LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { SC_FOLLOW_TAILGATER } from "../templates-following";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const TASK = "TASK_SPEED_CAP_EXCEEDED";

interface Row {
  t: number;
  x: number;
  y: number;
  headingDeg: number;
  speedKmh: number;
  gear: number;
}
const FIXTURE = JSON.parse(readFileSync(path.join(HERE, "w72-tailgater-live-poses.fixture.json"), "utf-8")) as {
  legs: Record<"pc" | "mobile", { rows: number[][] }>;
};
const legRows = (leg: "pc" | "mobile"): Row[] =>
  FIXTURE.legs[leg].rows.map(([t, x, y, headingDeg, speedKmh, gear]) => ({ t, x, y, headingDeg, speedKmh, gear }));

/** Before the recording starts: rest at the spawn, then a constant-acceleration ramp onto the first recorded row. */
function synthPrefix(first: Row, spawnY: number, dt: number): Row[] {
  const s = Math.max(0, first.y - spawnY);
  const v = Math.max(0.1, first.speedKmh / 3.6);
  const tau = (2 * s) / v;
  const a = v / tau;
  const tStart = first.t - tau;
  const out: Row[] = [];
  for (let t = dt; t < first.t - 1e-6; t += dt) {
    if (t < tStart) out.push({ t, x: first.x, y: spawnY, headingDeg: first.headingDeg, speedKmh: 0, gear: 1 });
    else {
      const tt = t - tStart;
      out.push({ t, x: first.x, y: spawnY + 0.5 * a * tt * tt, headingDeg: first.headingDeg, speedKmh: a * tt * 3.6, gear: 1 });
    }
  }
  return out;
}

interface Replay {
  session: LessonSessionState;
  /** Every task bill the student saw or paid: coached rows and charged mistakes, `code@t`. */
  taskRows: string[];
  taskCards: Array<{ t: number; text: string }>;
  toasts: Array<{ t: number; y: number; title: string; text: string }>;
  breaches: string[];
  arrivals: Array<{ t: number; arrivalKmh: number; shownKmh: number }>;
  rows: Row[];
}

/** One recorded (or counterfactually edited) leg of `sc-follow-tailgater` L1 through the real session. */
function replay(leg: "pc" | "mobile", mutate?: (rows: Row[]) => Row[]): Replay {
  const lesson = compileScenario(SC_FOLLOW_TAILGATER, 1);
  const district = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${lesson.world!.districtId}.json`), "utf-8"));
  const env = lesson.environment ?? {};
  const isNight = env.timeOfDay === "night";
  const rain = env.rain === true;
  const fog = env.fog === true;
  const snow = env.snow === true;
  const runtime = createWorldRuntime(district);
  const traffic = createTrafficSystem(district as TrafficDistrict, {
    seed: 7,
    vehicleCount: lesson.traffic?.vehicleCount ?? 0,
    pedestrianCount: lesson.traffic?.pedestrianCount ?? 0,
  });
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r, s) => traffic.conflictFromRight(jx, jy, px, py, h, r, s));
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) => traffic.circulatingConflict(cx, cy, px, py, h, r));
  runtime.setCyclistQuery((px, py, h, r) => traffic.cyclistNear(px, py, h, r));
  runtime.setOvertakenQuery((px, py, h, r) => traffic.overtakenNear(px, py, h, r));
  runtime.setSameDirVehiclesQuery((px, py, h, r) => traffic.sameDirVehiclesNear(px, py, h, r));
  const staged = lesson.stagedEvents ?? [];
  const director = staged.length > 0 ? createScenarioDirector(staged, traffic, { seed: 7, signals: runtime }) : null;
  const live = legRows(leg);
  const rows0 = [...synthPrefix(live[0], 15, leg === "pc" ? 1 / 60 : 0.2), ...live];
  const rows = mutate ? mutate(rows0) : rows0;
  let session: LessonSessionState = createLessonSession(lesson);
  const taskCards: Replay["taskCards"] = [];
  const toasts: Replay["toasts"] = [];
  const arrivals: Replay["arrivals"] = [];
  let prevT = 0;
  let prevV = 0;
  for (const r of rows) {
    const dt = Math.max(1e-4, r.t - prevT);
    runtime.update(dt);
    traffic.update(dt, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x: r.x, y: r.y },
      playerSpeedKmh: Math.abs(r.speedKmh),
      playerHeadingDeg: r.headingDeg,
    });
    const leadGap = traffic.leadGapMeters(r.x, r.y, r.headingDeg);
    const decel = (prevV - r.speedKmh) / 3.6 / dt;
    const vs: VehicleSample = {
      position: { x: r.x, y: r.y },
      headingDeg: r.headingDeg,
      speedKmh: r.speedKmh,
      indicator: "off",
      headlights: isNight || rain ? "low" : "off",
      seatbeltOn: true,
      handbrakeOn: false,
      gear: r.gear,
      mirrorGlance: null,
      stalled: false,
      fogLightsOn: false,
    };
    const tick: SimTick = runtime.sample(vs, r.t, isNight, rain, leadGap, fog, snow);
    if (director) {
      const res = director.step({ tSec: r.t, dtSec: dt, x: r.x, y: r.y, speedKmh: r.speedKmh, headingDeg: r.headingDeg, brakePedal: decel > 2 ? 1 : 0, tickEvents: tick.events });
      for (const e of res.events) tick.events.push(e);
    }
    if (session.phase === "completed" || session.phase === "aborted") break;
    const step = applyTick(session, tick);
    session = step.state;
    for (const m of step.teachMoments ?? []) if (m.code === TASK) taskCards.push({ t: m.t, text: m.explanationBg });
    for (const h of step.hudEvents as Array<{ kind: string; titleBg?: string; explanationBg?: string; code?: string }>) {
      if (h.kind === "lesson" && h.explanationBg !== undefined) toasts.push({ t: r.t, y: r.y, title: h.titleBg ?? "", text: h.explanationBg });
      if (h.kind === "violation" && h.titleBg === "Скорост над тавана на задачата" && h.explanationBg !== undefined) taskCards.push({ t: r.t, text: h.explanationBg });
    }
    prevT = r.t;
    prevV = r.speedKmh;
  }
  const result = buildLessonResult(session);
  const taskRows = [
    ...(result.coachedMistakes ?? []).filter((c) => c.code === TASK).map((c) => `coached:${c.code}@${c.t.toFixed(2)}`),
    ...result.summary.mistakes.filter((m) => m.code === TASK).map((m) => `charged:${m.code}@${m.t.toFixed(2)}`),
  ];
  const seen = new Set<string>();
  for (const c of taskCards) {
    if (seen.has(`${c.t}|${c.text}`)) continue;
    seen.add(`${c.t}|${c.text}`);
    const m = /^Мина точката на задачата с ([\d,]+) км\/ч при таван на задачата (\d+) км\/ч/.exec(c.text);
    if (m) arrivals.push({ t: c.t, arrivalKmh: Number(m[1].replace(",", ".")), shownKmh: Number(m[2]) });
  }
  return { session, taskRows, taskCards, toasts, breaches: (result.taskCapBreaches ?? []).map((b) => `${b.objectiveId}@${b.t.toFixed(2)}`), arrivals, rows };
}

/** The speed the reported samples carry where the car crosses y = `markY` (linear in the fraction of the segment). */
function crossingKmh(rows: Row[], markY: number): { t: number; kmh: number } {
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    if (a.y < markY && b.y >= markY) {
      const f = (markY - a.y) / (b.y - a.y);
      return { t: b.t, kmh: Math.abs(a.speedKmh) + f * (Math.abs(b.speedKmh) - Math.abs(a.speedKmh)) };
    }
  }
  throw new Error(`the leg never crosses y = ${markY}`);
}
const kmhTxt = (v: number) => (Math.round(v * 10) / 10).toString().replace(".", ",");

/**
 * COUNTERFACTUAL B (the investigation's own): keep the recorded leg up to y = 150 on the approach to its second stop,
 * then ease to `E` km/h by y = 178 (inside the approach capsule, so the approach is HONOURED there) and accelerate at
 * `A` m/s² through the mark and on — the student who slows early and speeds up through the mark.
 */
const easeThenAccelerate =
  (E: number, A: number) =>
  (rows: Row[]): Row[] => {
    const k = rows.findIndex((r) => r.y >= 150 && r.t > 50);
    const out = rows.slice(0, k + 1);
    let { t, y, speedKmh: v } = rows[k];
    const { x, headingDeg } = rows[k];
    const dt = 1 / 60;
    const v0 = v / 3.6;
    const vE = E / 3.6;
    const dec = (v0 * v0 - vE * vE) / (2 * (178 - y));
    while (y < 178) {
      const vm = Math.max(vE, v / 3.6 - dec * dt);
      v = vm * 3.6;
      t += dt;
      y += vm * dt;
      out.push({ t, x, y, headingDeg, speedKmh: v, gear: 3 });
    }
    while (y < 300) {
      const vm = Math.min(60 / 3.6, v / 3.6 + A * dt);
      v = vm * 3.6;
      t += dt;
      y += vm * dt;
      out.push({ t, x, y, headingDeg, speedKmh: v, gear: 3 });
    }
    return out;
  };

/** Keep the recorded leg up to y = 150, then `profile(y)` km/h (60 Hz) to y = 300. */
const speedProfile =
  (profile: (y: number, v: number) => number, hz = 60) =>
  (rows: Row[]): Row[] => {
    const k = rows.findIndex((r) => r.y >= 150 && r.t > 50);
    const out = rows.slice(0, k + 1);
    let { t, y, speedKmh: v } = rows[k];
    const { x, headingDeg } = rows[k];
    const dt = 1 / hz;
    while (y < 300) {
      const v2 = profile(y, v);
      t += dt;
      y += ((v + v2) / 2 / 3.6) * dt;
      v = v2;
      out.push({ t, x, y, headingDeg, speedKmh: v, gear: 3 });
    }
    return out;
  };

const MARK_Y = 200;
const LINE = 36 + Math.min(36 * 0.1, 5);

describe("4b342eee — the arrival is decided where the car CROSSES the mark, against the glass figure plus the sign's tolerance", () => {
  it("counterfactual B 38 / 2,5 — eased to 38 by y = 178 (the approach HONOURED in the capsule), then +2,5 m/s² through the mark: billed at the crossing — the first commission coached, its card quoting the speed AT the mark, a breach row written (base: no latch, no row, no bill)", () => {
    const r = replay("pc", easeThenAccelerate(38, 2.5));
    const x = crossingKmh(r.rows, MARK_Y);
    expect(x.kmh).toBeGreaterThan(50);
    expect(r.taskRows).toEqual([`coached:${TASK}@${x.t.toFixed(2)}`]);
    expect(r.arrivals).toEqual([{ t: x.t, arrivalKmh: Math.round(x.kmh * 10) / 10, shownKmh: 36 }]);
    expect(r.breaches).toEqual([`sc-ftg-ease@${x.t.toFixed(2)}`]);
  });
  it("counterfactual B 40 / 2,2 — the same shape from 40: billed at the crossing frame, the card quoting the crossing speed", () => {
    const r = replay("pc", easeThenAccelerate(40, 2.2));
    const x = crossingKmh(r.rows, MARK_Y);
    expect(r.taskRows).toEqual([`coached:${TASK}@${x.t.toFixed(2)}`]);
    expect(r.arrivals).toEqual([{ t: x.t, arrivalKmh: Math.round(x.kmh * 10) / 10, shownKmh: 36 }]);
  });
  it("a coarse-tick crossing (2 Hz, accelerating 44 → 56 across the mark, never under the gate on the approach) quotes the speed interpolated AT the mark — not the speed of the first frame past it (base quoted that frame's speed, a whole tick later)", () => {
    const r = replay("pc", speedProfile((y, v) => (y < 160 ? 44 : Math.min(56, v + 1.5)), 2));
    const x = crossingKmh(r.rows, MARK_Y);
    const after = r.rows.find((row) => row.y >= MARK_Y)!;
    expect(Math.abs(after.speedKmh - x.kmh)).toBeGreaterThan(0.3);
    expect(r.arrivals.map((a) => a.arrivalKmh)).toEqual([Math.round(x.kmh * 10) / 10]);
    expect(r.taskCards[0].text.startsWith(`Мина точката на задачата с ${kmhTxt(x.kmh)} км/ч при таван на задачата 36 км/ч`)).toBe(true);
  });

  // ── THE GUARDS: nothing billed where the car is at or under the line AT the mark ──────────────────────────────────
  it("GUARD — braking from 44,5 at the disc's edge (y = 185): the mark is crossed well under the line — no task bill, no breach row", () => {
    const r = replay("pc", speedProfile((y, v) => (y < 185 ? 44.5 : Math.max(10, v - 0.25))));
    expect(crossingKmh(r.rows, MARK_Y).kmh).toBeLessThan(LINE);
    expect(r.taskRows).toEqual([]);
    expect(r.breaches).toEqual([]);
  });
  it("GUARD — the mark passed AT the glass figure (a steady 36): no task bill", () => {
    const r = replay("pc", speedProfile((y, v) => (y < 170 ? Math.max(36, v - 0.1) : 36)));
    expect(crossingKmh(r.rows, MARK_Y).kmh).toBeCloseTo(36, 6);
    expect(r.taskRows).toEqual([]);
    expect(r.breaches).toEqual([]);
  });
  it("THE RECORDED MOBILE LEG (w72) — braked to rest at y = 194,6, short of the mark, then crawled through it: the mark is crossed at ~20 km/h, under the line — no task bill (slowing down before the mark still saves the approach)", () => {
    const r = replay("mobile");
    const x = crossingKmh(r.rows, MARK_Y);
    expect(x.kmh).toBeLessThan(25);
    expect(r.taskRows).toEqual([]);
    expect(r.breaches).toEqual([]);
  });
  it("THE RECORDED PC LEG (w72) — rested at y = 175,9, then accelerated from rest through the mark at ~40,8 km/h: over the new line (39,6), under the old one (46) — billed NOW: the first commission is coached at the crossing (0 points), a breach row written", () => {
    const r = replay("pc");
    const x = crossingKmh(r.rows, MARK_Y);
    expect(x.kmh).toBeGreaterThan(LINE);
    expect(x.kmh).toBeLessThan(46);
    expect(r.taskRows).toEqual([`coached:${TASK}@${x.t.toFixed(2)}`]);
    expect(r.arrivals).toEqual([{ t: x.t, arrivalKmh: Math.round(x.kmh * 10) / 10, shownKmh: 36 }]);
    expect(r.breaches).toEqual([`sc-ftg-ease@${x.t.toFixed(2)}`]);
  });
});

describe("5a56612e — when the tick is withheld for a reason slowing down cannot undo, the card says so and promises nothing", () => {
  const TAIL =
    "— но задачата няма да се отчете и при по-ниска скорост: по-рано в този урок колата спря без причина на открит път, а тя се отчита само ако това не се е случило. Затова намаляването сега не може да я отчете. Урокът продължава и разборът показва задачата накрая.";
  it("THE PHOTOGRAPHED PC FRAME (w72 04-t042s) — «вдигна скоростта до 41 км/ч» is followed by the dead stop that withholds the task (`requireBrakingClean`), not by «затова още не се отчита. Намали СЕГА»", () => {
    const r = replay("pc");
    const cards = r.toasts.filter((x) => x.title === "Стигна точката, но твърде бързо");
    expect(cards).toHaveLength(1);
    expect(cards[0].text).toBe(`Задачата иска да си тук с не повече от 36 км/ч, а върху точката вдигна скоростта до 41 км/ч ${TAIL}`);
  });
  it("THE MOBILE LEG — the same dead stop (46,4 s) withholds the task when the car arrives at 44: the card names it, and gives no «Намали СЕГА»", () => {
    const r = replay("mobile");
    const cards = r.toasts.filter((x) => x.title === "Стигна точката, но твърде бързо");
    expect(cards).toHaveLength(1);
    expect(cards[0].text).toBe(`Задачата иска да си тук с не повече от 36 км/ч, а стигна дотук с 44 км/ч ${TAIL}`);
  });
});
