/**
 * THE TASK CEILING, ROUND 5 — the lesson engine.
 *
 * FOUNDER RULING 2026-09-26 «Bill the arrival» (ruling 4 of register item 17).
 * For a cap that only asks the student to ARRIVE at a point at ≤N — the
 * zone-default objectives, which ruling 2 («Only the named stretch») left
 * unbillable because the car is past the point in under the task code's 3 s
 * sustain — passing the mark over the cap IS the offence. ONE event at the
 * blow: a teach card the first time (the per-topic first-fault grace, ruling
 * 16), a point on a repeat. The blow line is the product's own (cap +
 * REACH_ZONE_CAP_SLACK_KMH). One act, one bill. Correct demonstrations never
 * blow a mark, so a correct leg never changes. Its teach and charge copy state
 * the measured arrival speed and the cap.
 *
 * Round-4 verifier findings closed here, test-first:
 *  · F2 — the named FEATURE governs: where it runs past the next goal (the
 *    accident scene, the ice) the ceiling runs to the feature's end;
 *  · F4 — `sc-prs-row` names the parked row, which runs to the crossing
 *    pe-x-1 at (0, 78);
 *  · N3 — a mark swept inside one frame is blown (and now billed).
 *
 * Every case was run RED on round 4 (`scratchpad/cap/r5/red-r4-*.txt`) except
 * the ones marked GUARD.
 *
 * ROUND 14 — RETIRED HERE: 2 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
 * is an extra rule on top. Its bill stands on its own; the bend/weather bills are charged exactly as they would be in a
 * lesson with no cap. Blowing the cap can only add, never lower the score, and order never matters.»). Each pinned a
 * reading the ruling supersedes — a task-cap bill absorbing, or absorbed by, a weather, bend or SPEEDING_* bill, the kin
 * ledger's owners, lapses, surfaced cards and hand-overs, one bill per M-16 act — or read the state that carried them.
 * Their titles are in the round-14 hand-off log (`scratchpad/cap/r14/retired.txt`); what replaced them is the two-ledger
 * property (`rules/__tests__/taskCapTwoLedgers.ts`, `task-cap-property-census`), the two-ledger reference
 * (`task-cap-two-sided-census`), the lesson censuses and `task-cap-round14`. The tests left here pin readings the ruling
 * keeps (the cap ledger's own rules, the stretch of ruling 2, the card copy).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../contracts";
import { VIOLATIONS, type SimTick } from "../../rules";
import { buildDebrief } from "../debrief";
import { applyTick, buildLessonResult, createLessonSession, finishSession, type LessonStepResult } from "../engine";
import { TASK_CAP_STRETCH_START, stepTaskCapStretch, taskCapStretch } from "../finish";
import { createEvalState, parseObjectiveParams, stepObjective } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState, ObjectiveEvalState } from "../types";
import { CURTAIN_OBJECTIVE_ID, makeTick } from "./fixtures";

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const TASK_TITLE = "Скорост над тавана на задачата";
const CLEAN_TITLE = "Чисто и спокойно каране";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

// ---------------------------------------------------------------------------
// The round-4 drive harness, with the frame step as a parameter and the glass
// (teach moments, HUD toasts) collected.
// ---------------------------------------------------------------------------

type Edge = { maxspeed: number; geometry: number[][] };
const edgeCache = new Map<string, Edge[]>();
function postedFn(districtId: string): (x: number, y: number) => number {
  if (!edgeCache.has(districtId)) {
    const d = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${districtId}.json`), "utf-8"));
    edgeCache.set(districtId, d.roads.edges);
  }
  const edges = edgeCache.get(districtId)!;
  return (x, y) => {
    let best = Infinity;
    let sp = 50;
    for (const e of edges)
      for (let i = 0; i + 1 < e.geometry.length; i++) {
        const a = e.geometry[i];
        const b = e.geometry[i + 1];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const L2 = dx * dx + dy * dy;
        const u = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
        const dd = Math.hypot(x - (a[0] + u * dx), y - (a[1] + u * dy));
        if (dd < best) {
          best = dd;
          sp = e.maxspeed;
        }
      }
    return sp;
  };
}

interface Ctx {
  d: number;
  x: number;
  y: number;
  t: number;
  v: number;
  s: LessonSessionState;
}
interface Opts {
  pts: Array<[number, number]>;
  speed: (c: Ctx) => number;
  posted: number | ((x: number, y: number) => number);
  flags?: Partial<SimTick> | ((c: { x: number; y: number; d: number; t: number }) => Partial<SimTick>);
  accel?: number;
  decel?: number;
  dt?: number;
  maxT?: number;
  handEndAt?: number;
}
interface Frame {
  t: number;
  x: number;
  y: number;
  v: number;
  posted: number;
  stamped: boolean;
}
interface Out {
  charged: Array<{ code: string; t: number }>;
  coached: Array<{ code: string; t: number }>;
  teach: NonNullable<LessonStepResult["teachMoments"]>;
  hud: LessonStepResult["hudEvents"];
  frames: Frame[];
  breaches: number;
  score: number;
  debrief: string;
  ended: LessonSessionState;
}

function drive(lesson: LessonSpec, o: Opts): Out {
  let s = createLessonSession(lesson);
  const dt = o.dt ?? 0.1;
  const cum = [0];
  for (let i = 1; i < o.pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(o.pts[i][0] - o.pts[i - 1][0], o.pts[i][1] - o.pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (d: number): [number, number, number] => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const f = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    const x = o.pts[i - 1][0] + f * (o.pts[i][0] - o.pts[i - 1][0]);
    const y = o.pts[i - 1][1] + f * (o.pts[i][1] - o.pts[i - 1][1]);
    const h = (Math.atan2(o.pts[i][0] - o.pts[i - 1][0], o.pts[i][1] - o.pts[i - 1][1]) * 180) / Math.PI;
    return [x, y, h];
  };
  let d = 0;
  let v = 0;
  let t = 0;
  const frames: Frame[] = [];
  const teach: Out["teach"] = [];
  const hud: Out["hud"] = [];
  while (d < total && t < (o.maxT ?? 400) && s.phase === "driving") {
    t = Math.round((t + dt) * 100) / 100;
    const [x0, y0] = at(d);
    const target = o.speed({ d, x: x0, y: y0, t, v: v * 3.6, s }) / 3.6;
    v = v < target ? Math.min(target, v + (o.accel ?? 3) * dt) : Math.max(target, v - (o.decel ?? 5) * dt);
    d = Math.min(total, d + v * dt);
    const [x, y, h] = at(d);
    const posted = typeof o.posted === "number" ? o.posted : o.posted(x, y);
    const flags = typeof o.flags === "function" ? o.flags({ x, y, d, t }) : (o.flags ?? {});
    const r = applyTick(
      s,
      makeTick({ t, speedKmh: v * 3.6, maxSpeedKmh: posted, position: { x, y }, headingDeg: h, ...flags }),
    );
    s = r.state;
    teach.push(...(r.teachMoments ?? []));
    hud.push(...r.hudEvents);
    const lt = (s as unknown as { lastTick?: { taskSpeedCap?: unknown } }).lastTick;
    frames.push({ t, x, y, v: v * 3.6, posted, stamped: lt?.taskSpeedCap !== undefined });
    if (o.handEndAt !== undefined && t >= o.handEndAt) break;
  }
  const ended = s.phase !== "driving" ? s : finishSession(s, t);
  const result = buildLessonResult(ended);
  const debrief = buildDebrief(ended.lesson, result, { coachedMistakes: result.coachedMistakes }).text;
  return {
    charged: ended.events.filter((e) => e.kind === "violation").map((e) => ({ code: e.code as string, t: e.t })),
    coached: (ended.coachedMistakes ?? []).map((c) => ({ code: c.code, t: c.t })),
    teach,
    hud,
    frames,
    breaches: (result.taskCapBreaches ?? []).length,
    score: result.score,
    debrief,
    ended,
  };
}

const shadowPts = (id: string): Array<[number, number]> => {
  const samples = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "traces", id, "shadow-correct.trace.json"), "utf-8"),
  ).samples as Array<{ x: number; y: number }>;
  const out: Array<[number, number]> = [];
  for (const p of samples) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last[0], p.y - last[1]) > 0.3) out.push([p.x, p.y]);
  }
  return out;
};
const spec = (id: string) => SCENARIO_TEMPLATES.find((x) => x.id === id)!;
const taskCharged = (o: Out) => o.charged.filter((b) => b.code === TASK);
const taskCoached = (o: Out) => o.coached.filter((b) => b.code === TASK);
const taskTeach = (o: Out) => o.teach.filter((m) => m.code === TASK);
const stamped = (o: Out) => o.frames.filter((f) => f.stamped);
const arrivalLine = (kmh: number, cap: number) => `Мина точката на задачата с ${kmh} км/ч при таван на задачата ${cap} км/ч.`;

function lessonOf(id: string, objectives: LessonSpec["objectives"], posted: number, extra: Partial<LessonSpec> = {}): LessonSpec {
  return {
    id,
    order: 1,
    titleBg: "Проба",
    descriptionBg: "",
    conceptIds: [],
    postedLimitKmh: posted,
    spawn: { position: { x: 0, y: 15 }, headingDeg: 0 },
    preDrive: false,
    vehicleStart: "ready",
    objectives,
    ...extra,
  };
}
const capped = (id: string, y: number, cap: number, r = 10, x = 0): LessonSpec["objectives"][number] => ({
  id,
  titleBg: "Приближи мястото с готовност за спиране",
  kind: "reachZone",
  params: { x, y, radiusM: r, maxSpeedKmh: cap },
});
const wp = (id: string, y: number, r = 12, x = 0): LessonSpec["objectives"][number] => ({
  id,
  titleBg: `Точка ${id}`,
  kind: "reachZone",
  params: { x, y, radiusM: r },
});
/** A zone-default ≤30 mark at (0, 100) on a posted-50 straight, the finish far beyond. */
const ZONE_LESSON = (extra: Partial<LessonSpec> = {}) =>
  lessonOf("r5-zone", [capped("r5-zone-mark", 100, 30), wp("r5-finish", 600)], 50, extra);
const line = (y1: number): Array<[number, number]> => [
  [0, 15],
  [0, y1],
];

// ===========================================================================
// RULING 4 — «BILL THE ARRIVAL»
// ===========================================================================

describe("ruling 4 · the arrival at a zone-default mark over its cap is ONE event at the blow", () => {
  it("45 through a ≤30 mark (blow line 35): a TASK teach card at the blow, stating the arrival speed and the cap; no charge", () => {
    const o = drive(ZONE_LESSON(), { pts: line(300), posted: 50, maxT: 60, speed: () => 45 });
    expect(taskTeach(o).length).toBe(1);
    expect(taskCoached(o).length).toBe(1);
    expect(taskCharged(o)).toEqual([]);
    const card = taskTeach(o)[0];
    expect(card.titleBg).toBe(TASK_TITLE);
    expect(card.explanationBg.startsWith(arrivalLine(45, 30))).toBe(true);
    // At the blow: the car is at (or just past) the mark, inside its disc.
    const f = o.frames.find((x) => x.t === card.t)!;
    expect(f.y).toBeGreaterThanOrEqual(100);
    expect(f.y).toBeLessThan(110);
    expect(o.breaches).toBe(1);
    expect(o.score).toBe(0);
  });

  it("a REPEAT — the same mark blown again on a fresh approach — is a point, and its card states the second arrival speed", () => {
    // Through at 45, round a loop well outside the mark's ring, and back up the
    // same approach at 42.
    const pts: Array<[number, number]> = [
      [0, 15],
      [0, 140],
      [40, 140],
      [40, 30],
      [0, 30],
      [0, 300],
    ];
    let lap = 0;
    const o = drive(ZONE_LESSON(), {
      pts,
      posted: 50,
      maxT: 120,
      accel: 20,
      decel: 20,
      speed: (c) => {
        if (lap === 0 && c.x > 20) lap = 1;
        return lap === 0 ? 45 : 42;
      },
    });
    expect(taskCoached(o).length).toBe(1);
    expect(taskCharged(o).length).toBe(1);
    expect(o.score).toBe(1);
    const charge = o.hud.find((h) => h.kind === "violation" && h.titleBg === TASK_TITLE) as { explanationBg: string } | undefined;
    expect(charge).toBeDefined();
    expect(charge!.explanationBg.startsWith(arrivalLine(42, 30))).toBe(true);
    expect(o.breaches).toBe(2);
  });

  it("the swept mark: at the engine's 0.5 s frame cap, 90 through a 2.7 m disc with no frame inside it — blown, and billed", () => {
    // sc-ov-night-gap L3 geometry: the ≤45 mark (4.06, 124), radius 2.7, on a
    // posted-90 road. Frames at y 117 (in the approach capsule) and 129.5
    // (past the disc): only the SWEPT face can see the arrival.
    const lesson = lessonOf(
      "r5-swept",
      [{ id: "r5-swept-mark", titleBg: "Дръж своята лента под 45 км/ч", kind: "reachZone", params: { x: 4.06, y: 124, radiusM: 2.7, maxSpeedKmh: 45 } }, wp("r5-finish", 700, 12, 4.06)],
      90,
    );
    let s = createLessonSession(lesson);
    const teach: NonNullable<LessonStepResult["teachMoments"]> = [];
    const ys = [60, 72.5, 85, 97.5, 110, 117, 129.5, 142, 154.5, 167];
    ys.forEach((y, i) => {
      const r = applyTick(s, makeTick({ t: 0.5 * (i + 1), speedKmh: 90, maxSpeedKmh: 90, position: { x: 4.06, y }, headingDeg: 0 }));
      s = r.state;
      teach.push(...(r.teachMoments ?? []));
    });
    expect((s.evalStates[0] as { approachCap?: string }).approachCap).toBe("blown");
    expect(teach.filter((m) => m.code === TASK).length).toBe(1);
    expect(teach.find((m) => m.code === TASK)!.explanationBg.startsWith(arrivalLine(90, 45))).toBe(true);
  });

  it("the card states the speed the mark was PASSED at — the evaluator's frame — not the next frame's, when the student brakes at once", () => {
    // 45 through the mark; from the frame after the blow the car brakes at 30
    // m/s² (−10.8 km/h a frame).
    const o = drive(ZONE_LESSON(), {
      pts: line(300),
      posted: 50,
      accel: 20,
      decel: 30,
      maxT: 60,
      speed: (c) => (c.y < 100 ? 45 : 20),
    });
    expect(taskTeach(o).length).toBe(1);
    expect(taskTeach(o)[0].explanationBg.startsWith(arrivalLine(45, 30))).toBe(true);
  });

  it("the card states the cap the student READ (L1: shown 36), not the rung's compiled gate (41) — sc-follow-tailgater «Успокой темпото»", () => {
    const sp = spec("sc-follow-tailgater");
    const posted = postedFn(sp.map.districtId);
    const lesson = compileScenario(sp, 1);
    const mark = lesson.objectives.find((x) => x.id === "sc-ftg-ease")!;
    expect(mark.params.maxSpeedKmh).toBe(41);
    const o = drive(lesson, {
      pts: shadowPts("sc-follow-tailgater"),
      posted: (x, y) => posted(x, y),
      accel: 20,
      maxT: 80,
      speed: () => 50,
    });
    const glass = [
      ...o.teach.filter((m) => m.code === TASK).map((m) => m.explanationBg),
      ...o.hud.filter((h) => h.kind === "lesson" && h.titleBg === TASK_TITLE).map((h) => (h as { explanationBg: string }).explanationBg),
    ];
    expect(glass.length).toBe(1);
    expect(glass[0].startsWith(arrivalLine(50, 36))).toBe(true);
  });

  it("GUARD — the cap honoured (28 through the mark): nothing", () => {
    const o = drive(ZONE_LESSON(), { pts: line(300), posted: 50, maxT: 60, speed: () => 28 });
    expect(taskCoached(o)).toEqual([]);
    expect(taskCharged(o)).toEqual([]);
    expect(o.breaches).toBe(0);
  });

  // ROUND 15 (founder ruling 2026-10-03 «LIKE A SPEED SIGN»): the line is the glass figure plus the sign's tolerance,
  // 30 + 3 = 33 — rounds 5–14 put it at the gate plus the slack, 35.
  it("GUARD — at the bill line itself (33 through ≤30 + 3): not blown, nothing", () => {
    const o = drive(ZONE_LESSON(), { pts: line(300), posted: 50, maxT: 60, speed: () => 33 });
    expect(taskCoached(o)).toEqual([]);
    expect(taskCharged(o)).toEqual([]);
  });
  it("ROUND 15 — 35 through ≤30 (the old gate + slack line) is over the glass figure's line: ONE taught arrival", () => {
    const o = drive(ZONE_LESSON(), { pts: line(300), posted: 50, maxT: 60, speed: () => 35 });
    expect(taskCoached(o).length).toBe(1);
    expect(taskCharged(o)).toEqual([]);
  });

  it("ROUND 14 — a cap AT the sign (≤50 on a posted 50) passed at 60 is the cap's own offence too: ONE taught TASK arrival beside the sign's speeding (rounds 5–13: «the sign's to grade», no TASK)", () => {
    // Founder ruling 2026-10-03, «Cap adds, never removes … Its bill stands on its own»; the integrator's reading of
    // ruling 4 (round 7: every blown cap mark is the offence, caps at or above the sign included).
    const lesson = lessonOf("r5-atsign", [capped("r5-atsign-mark", 100, 50), wp("r5-finish", 600)], 50);
    const o = drive(lesson, { pts: line(300), posted: 50, maxT: 60, speed: () => 60 });
    expect(taskCoached(o)).toHaveLength(1);
    expect(taskCharged(o)).toEqual([]);
  });

  it("GUARD — an EXAM rung grades exactly the official sheet: no TASK arrival", () => {
    const o = drive(ZONE_LESSON({ examMode: true }), { pts: line(300), posted: 50, maxT: 60, speed: () => 45 });
    expect(taskCoached(o)).toEqual([]);
    expect(taskCharged(o)).toEqual([]);
    expect(taskTeach(o)).toEqual([]);
  });

  it("ROUND 6 — a mark whose task names a FEATURE (the curtain) IS an arrival cap too: through at 100, then 75 at once — ONE taught TASK, a breach row", () => {
    // Round 5 pinned «no TASK» here: the arrival reached only the zone-default
    // caps. The round-5 verifier refuted that scope (F1, F2) and the integrator
    // read ruling 4 as binding EVERY blown cap: every capped objective has a
    // mark, and passing it over the cap is the offence.
    const lesson = lessonOf(
      "r5-curtain",
      [capped(CURTAIN_OBJECTIVE_ID, 200, 80, 12), wp("r5-finish", 900)],
      140,
    );
    const o = drive(lesson, {
      pts: line(800),
      posted: 140,
      accel: 20,
      decel: 20,
      maxT: 60,
      speed: (c) => (c.y < 205 ? 100 : 75),
    });
    expect(taskCoached(o)).toHaveLength(1);
    expect(taskCharged(o)).toEqual([]);
    expect(taskTeach(o).map((m) => m.explanationBg.slice(0, 26))).toEqual(["Мина точката на задачата с"]);
    expect(o.breaches).toBe(1);
  });

  it("the praise: a drive whose only fault is a taught arrival carries no unscoped «Чисто и спокойно каране», and «Учебни моменти» names the task cap", () => {
    // 29 for 400 m (clean-driving windows are earned lawfully), then 45 through
    // a ≤30 mark at 500.
    const lesson = lessonOf("r5-praise", [capped("r5-praise-mark", 500, 30), wp("r5-finish", 900)], 50);
    const o = drive(lesson, {
      pts: line(800),
      posted: 50,
      accel: 20,
      decel: 20,
      maxT: 200,
      speed: (c) => (c.y < 470 ? 29 : c.y < 520 ? 45 : 29),
    });
    expect(taskCoached(o).length).toBe(1);
    const lines = o.debrief.split("\n");
    const bare = lines.filter((l) => l.startsWith(`• ${CLEAN_TITLE}`) && !l.includes(" — "));
    expect(bare).toEqual([]);
    expect(o.debrief).toContain(TASK_TITLE);
  });
});

describe("ruling 4 · on the committed catalogue", () => {
  // The approach arm tj-e-s is posted 40, so 43 is inside the sign's own grace
  // (graded above 44) and the only fault at the mark is the task's.
  it("sc-junction-gap L3: 43 through the ≤30 «Приближи знака Б2…» mark — taught at the blow, with the arrival speed and the cap on the card", () => {
    const sp = spec("sc-junction-gap");
    const posted = postedFn(sp.map.districtId);
    const o = drive(compileScenario(sp, 3), {
      pts: shadowPts("sc-junction-gap"),
      posted: (x, y) => posted(x, y),
      accel: 20,
      maxT: 60,
      speed: () => 43,
    });
    expect(o.charged).toEqual([]);
    expect(taskTeach(o).length).toBe(1);
    expect(taskTeach(o)[0].explanationBg.startsWith(arrivalLine(43, 30))).toBe(true);
    const f = o.frames.find((x) => x.t === taskTeach(o)[0].t)!;
    expect(Math.hypot(f.x - 4.06, f.y + 45)).toBeLessThan(8 + 1);
  });
});

describe("THEO-4 · every sentence on the TASK card is true for an arrival and for a sustained breach alike", () => {
  it("the explanation does not claim the student «продължи над него» (an arrival need not continue)", () => {
    expect(VIOLATIONS.TASK_SPEED_CAP_EXCEEDED.explanationBg).not.toContain("продължи над него");
    expect(VIOLATIONS.TASK_SPEED_CAP_EXCEEDED.explanationBg).toContain("Ти мина точката ѝ над него");
  });
  it("the corrective says the ceiling holds through the stretch the task names, not «до следващата точка от маршрута»", () => {
    const c = VIOLATIONS.TASK_SPEED_CAP_EXCEEDED.correctiveBg;
    expect(c).not.toContain("следващата точка");
    expect(c).toContain("участък, който задачата назовава");
  });
});

// ===========================================================================
// F2 — THE NAMED FEATURE GOVERNS (the region no longer cuts it short)
// ===========================================================================

describe("F2 · a feature that runs past the next goal binds to its own end", () => {
  it("sc-hz-accident-scene L3: 45 through the ≤35 «Влез в зоната на произшествието…» mark — the ceiling binds to the scene's end at 195, no early stop", () => {
    const sp = spec("sc-hz-accident-scene");
    const posted = postedFn(sp.map.districtId);
    const o = drive(compileScenario(sp, 3), {
      pts: shadowPts("sc-hz-accident-scene"),
      posted: (x, y) => posted(x, y),
      accel: 20,
      maxT: 80,
      speed: () => 45,
    });
    const st = stamped(o);
    expect(st.length).toBeGreaterThan(0);
    const first = st[0];
    // Every graded frame from the first stamp to the scene's end is stamped…
    const early = o.frames.filter((f) => f.t >= first.t && f.y < 194.5 && f.posted > 35 && !f.stamped);
    expect(early).toEqual([]);
    expect(Math.max(...st.map((f) => f.y))).toBeGreaterThan(193);
    // …and none past it.
    expect(st.filter((f) => f.y > 195.5)).toEqual([]);
    // Held over the cap for the scene's whole 70 m, the task is taught inside it.
    expect(taskCoached(o).length + taskCharged(o).length).toBeGreaterThan(0);
  });

  it("sc-ac-ice L3: 40 through the ≤30 «Намали до пълзене ПРЕДИ леда» mark — the ceiling binds across the whole ice to 300", () => {
    const sp = spec("sc-ac-ice");
    const posted = postedFn(sp.map.districtId);
    const o = drive(compileScenario(sp, 3), {
      // The committed shadow stops at the marked position (y 280), short of the
      // ice end; this drive carries on up the street (ac-ice-e-street runs to 360).
      pts: [
        [4.06, 15],
        [4.06, 350],
      ],
      posted: (x, y) => posted(x, y),
      accel: 20,
      maxT: 80,
      speed: () => 40,
    });
    const st = stamped(o);
    expect(st.length).toBeGreaterThan(0);
    const early = o.frames.filter((f) => f.t >= st[0].t && f.y < 299.5 && f.posted > 30 && !f.stamped);
    expect(early).toEqual([]);
    expect(st.filter((f) => f.y > 300.5)).toEqual([]);
  });

  it("GUARD — no leak: a car that turns off before the scene's end leaves the corridor and the ceiling with it", () => {
    // The scene row's own id on a hand-built road that turns east at y 150,
    // 45 m short of the scene's authored end.
    const lesson = lessonOf(
      "r5-leak",
      [capped("sc-hzac-slow", 122, 35, 12, 4.06), wp("r5-next", 155, 2.5, 1.8), wp("r5-finish", 900)],
      50,
    );
    const o = drive(lesson, {
      pts: [
        [4.06, 15],
        [4.06, 150],
        [200, 150],
      ],
      posted: 50,
      accel: 20,
      maxT: 60,
      speed: () => 45,
    });
    expect(stamped(o).length).toBeGreaterThan(0);
    expect(stamped(o).filter((f) => f.x > 4.06 + 12.19 + 8.125)).toEqual([]);
    expect(o.ended.taskCapLatch?.progress.spent).toBe(true);
  });
});

describe("F2 · the gate's own disc — a span whose road turns just before its end", () => {
  // The mark at the origin, approached from the south; the road runs north to
  // y 60 and turns east, and the named span ends 10 m along the eastbound road
  // (a gate at (10, 60) facing east). The chord from the mark to the gate ends
  // at the gate POINT, so a car on the eastbound lane two metres short of the
  // gate line projects past the chord's end: only the corridor-width disc round
  // the gate keeps it inside the span it has not yet left.
  const mark = { kind: "reachZone", x: 0, y: 0, radiusM: 8, maxSpeedKmh: 30 } as const;
  const next = { kind: "reachZone", x: 200, y: 60, radiusM: 10 } as const;
  const gate = { kind: "gate", x: 10, y: 60, ux: 1, uy: 0 } as const;
  it("inside all the way along the road to the gate line, and spent past it", () => {
    const st = taskCapStretch([mark, next], 0, { x: 0, y: -20 }, gate)!;
    let p = TASK_CAP_STRETCH_START;
    const path = [
      { x: 0, y: 5 },
      { x: 0, y: 30 },
      { x: 0, y: 55 },
      { x: 2, y: 61 },
      { x: 5, y: 62 },
      { x: 8, y: 62 },
      { x: 9.9, y: 62 },
    ];
    for (const q of path) {
      const r = stepTaskCapStretch(st, p, q);
      expect(r.inside, `(${q.x}, ${q.y})`).toBe(true);
      p = r.progress;
    }
    const past = stepTaskCapStretch(st, p, { x: 10.5, y: 62 });
    expect(past.inside).toBe(false);
    expect(past.progress.spent).toBe(true);
  });
});

describe("F4 · «Влез покрай редицата…» names the parked row, which ends at the crossing (0, 78)", () => {
  it("sc-pe-parked-row-scan L3: 40 through the ≤32 row mark — the ceiling binds along the row to the crossing, and not past it", () => {
    const sp = spec("sc-pe-parked-row-scan");
    const posted = postedFn(sp.map.districtId);
    const o = drive(compileScenario(sp, 3), {
      pts: shadowPts("sc-pe-parked-row-scan"),
      posted: (x, y) => posted(x, y),
      accel: 20,
      maxT: 80,
      speed: () => 40,
    });
    const st = stamped(o);
    expect(st.length).toBeGreaterThan(0);
    const early = o.frames.filter((f) => f.t >= st[0].t && f.y < 77.5 && f.posted > 32 && !f.stamped);
    expect(early).toEqual([]);
    expect(Math.max(...st.map((f) => f.y))).toBeGreaterThan(76);
    expect(st.filter((f) => f.y > 78.5)).toEqual([]);
    // ROUND 6: it names a feature AND its mark bills the arrival (the round-5
    // verifier's F2: at 50 the row is crossed inside the 3 s sustain, so the
    // arrival is its only bill). One card, at the blow — round 5 pinned none.
    const blowFrame = o.frames.find((f) => f.stamped)!;
    expect(taskTeach(o).filter((m) => m.t <= blowFrame.t + 0.5)).toHaveLength(1);
    expect(taskCoached(o)).toHaveLength(1);
  });
});

// ===========================================================================
// N3 — THE SWEPT FACE OF «BLOWN»
// ===========================================================================

describe("N3 · a mark swept inside one frame is blown", () => {
  // Pins BASE behaviour (it passes on round 4 by design): the verifier's mutant
  // N3 dropped the swept face and survived 82 files, because no test ever put
  // the arrival on a frame pair that straddles the disc.
  it("frames at y 117 (the approach capsule) and 129.5 (past the 2.7 m disc) at 90: `approachCap` is «blown» on the sweep", () => {
    const params = parseObjectiveParams({
      id: "o1",
      titleBg: "Дръж своята лента под 45 км/ч",
      kind: "reachZone",
      params: { x: 4.06, y: 124, radiusM: 2.7, maxSpeedKmh: 45 },
    });
    let st: ObjectiveEvalState = createEvalState(params);
    const seen: Array<string | undefined> = [];
    [100, 117, 129.5, 142].forEach((y, i) => {
      const r = stepObjective(params, st, makeTick({ t: 0.5 * i, speedKmh: 90, position: { x: 4.06, y } }));
      st = r.evalState;
      seen.push((st as { approachCap?: string }).approachCap);
    });
    // No frame is inside the disc (117 is 7 m short of the mark, 129.5 is 5.5 m past).
    expect(seen).toEqual([undefined, undefined, "blown", "blown"]);
  });
});

// ===========================================================================
// N15 — PROVED EQUIVALENT, and the proof's two premises pinned
// ===========================================================================

describe("N15 · pooled CLEAN_DRIVING bullets: OR and AND of `unclean` agree on every pool (the premises)", () => {
  // `commendationLines` pools rows by TITLE and ORs their `unclean` flags. The
  // round-4 verifier's mutant N15 (AND instead of OR) survived because no pool
  // can hold two rows whose flags differ. That is a theorem with two premises,
  // and these are they — if either ever breaks, the mutant stops being
  // equivalent and this block fails first.
  it("premise 1 — no other commendation title, pooled or per-situation, is CLEAN_DRIVING's", async () => {
    const { COMMENDATIONS, YIELD_PRAISE_SITUATION_COPY } = await import("../../rules/catalog");
    const clean = COMMENDATIONS.CLEAN_DRIVING.titleBg;
    const others = [
      ...Object.entries(COMMENDATIONS)
        .filter(([code]) => code !== "CLEAN_DRIVING")
        .map(([, c]) => c.titleBg),
      ...Object.values(YIELD_PRAISE_SITUATION_COPY).map((c) => c.titleBg),
    ];
    expect(others.length).toBeGreaterThan(5);
    expect(others.filter((t) => t === clean)).toEqual([]);
  });
  it("premise 2 — `unclean` reads the row's CODE only; every other input is the drive's, so two CLEAN rows of one drive agree", async () => {
    const { commendationRiderFlags } = await import("../debrief");
    const o = drive(ZONE_LESSON(), { pts: line(300), posted: 50, maxT: 60, speed: () => 45 });
    const r = buildLessonResult(o.ended);
    const a = commendationRiderFlags(r.summary, { code: "CLEAN_DRIVING", conceptId: "c-speed-limits" }, [], r.coachedMistakes ?? [], r.taskCapBreaches ?? []);
    const b = commendationRiderFlags(r.summary, { code: "CLEAN_DRIVING" }, [], r.coachedMistakes ?? [], r.taskCapBreaches ?? []);
    expect(a.unclean).toBe(true);
    expect(b.unclean).toBe(a.unclean);
    const c = commendationRiderFlags(r.summary, { code: "YIELDED_TO_PRIORITY" }, [], r.coachedMistakes ?? [], r.taskCapBreaches ?? []);
    expect(c.unclean).toBe(false);
  });
});
