/**
 * THE TASK CEILING, ROUND 10 — the lesson engine: what the student is shown
 * and charged.
 *
 * The round-9 verifier drove its witnesses through a REAL lesson session so the
 * coach decides teach or charge: a compiled L1 lesson with NO capped objective
 * (`sc-follow-brake`), so `stepTaskCapLatch` stamps nothing and the tick's own
 * task-cap fields reach the reducer unchanged (`applyTick`: `ruleTick = tick`
 * when the lesson stamps nothing) — `verify9/relaunch/probes/zz-v9r-lwit.test.ts`,
 * ported here with the verifier's frames.
 *
 * A · R1-STALE-LAPSE: STALE3 scored 4 where the same drive without the 0.5 s dip
 *     scores 3 — the extra charged point is gone.
 * B · ROUND 9's LINES: E4_ON (score 3 → 4 under E4), C3_HELD / C3_WAIT (a
 *     surfaced TASK card under E5 / E9), and E11 — on the verifier's committed
 *     catalogue rows (its act-placement probe, `verify9/probes/zz-v9-act.test.ts`,
 *     the ON placement: a weather or bend first bill ON the latch frame of a
 *     sign-bound blow on the committed shadow drive; E11 charged TASK on 134 of
 *     its rows, 10 of them on a spent topic) and on two synthetic drives.
 * C · THE ABSORBED LATCH, both sides, as the student meets them: inside the
 *     continuous act nothing more is shown or charged; after it, the new act's
 *     TASK is charged on the topic the act's own teach spent («a point on
 *     repeat»).
 *
 * Cases marked RED-ON-R9 were run RED on round 9's engine
 * (`scratchpad/cap/r10/red-on-r9*.txt`).
 *
 * ROUND 14 — RETIRED HERE: 12 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
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
import type { SimTick } from "../../rules";
import { tick } from "../../rules/__tests__/fixtures";
import { applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { REACH_ZONE_CAP_SLACK_KMH, REACH_ZONE_GRACE_M } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState } from "../types";

// `import.meta.glob` is Vite's compile-time transform (vitest runs it); the app's
// tsconfig carries no `vite/client` types, so the one signature used is declared here.
declare global {
  interface ImportMeta {
    glob(pattern: string, options: { eager: true }): Record<string, Record<string, unknown>>;
  }
}

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const CURVE = "SPEED_TOO_FAST_FOR_CURVE";

const spec = (id: string) => {
  const s = SCENARIO_TEMPLATES.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no template ${id}`);
  return s;
};

// ---------------------------------------------------------------------------
// The verifier's lesson-level harness (zz-v9r-lwit.test.ts)
// ---------------------------------------------------------------------------

type Seg = { from: number; to: number; v: number; o?: Record<string, unknown> };
function prog(segs: Seg[], base: Record<string, unknown>): SimTick[] {
  const out: SimTick[] = [];
  for (const s of segs) for (let i = Math.round(s.from * 10); i < Math.round(s.to * 10); i++) out.push(tick(i / 10, { maxSpeedKmh: 50, ...base, speedKmh: s.v, ...(s.o ?? {}) } as Partial<SimTick>));
  return out;
}
const arr = (cap: number, b: number, v: number) => ({ taskCapArrival: { capKmh: cap, shownKmh: cap, graceKmh: 5, blownAtSec: b, arrivalKmh: v } });
const stamp = (cap: number, b: number) => ({ taskSpeedCap: { capKmh: cap, shownKmh: cap, graceKmh: 5, blownAtSec: b } });
const rain = { rain: true };
const head = (lapse: boolean): Seg[] => [
  { from: 0, to: 3.1, v: 46 },
  { from: 3.1, to: 3.2, v: 46, o: { ...arr(35, 3.1, 46), ...stamp(35, 3.1) } },
  { from: 3.2, to: 4.1, v: 46, o: stamp(35, 3.1) },
  { from: 4.1, to: 4.6, v: lapse ? 41 : 46, o: stamp(35, 3.1) },
  { from: 4.6, to: 8.6, v: 46, o: { curveAdvisoryKmh: 30 } },
];

/** The uncapped L1 lesson the verifier drove (the first non-exam template with no capped objective). */
const UNCAPPED = "sc-follow-brake";
interface Seen {
  score: number;
  mistakes: string[];
  coached: string[];
  cards: string[];
}
function session(f: SimTick[]): Seen {
  let s: LessonSessionState = createLessonSession(compileScenario(spec(UNCAPPED), 1));
  const cards: string[] = [];
  for (const x of f) {
    const r = applyTick(s, x);
    s = r.state;
    for (const m of r.teachMoments ?? []) cards.push(`${m.code}@${m.t}${m.charged === true ? ":CHARGED" : ":teach"}`);
  }
  const ended = s.phase === "driving" || s.phase === "preDrive" ? finishSession(s, f[f.length - 1].t) : s;
  const res = buildLessonResult(ended);
  return {
    score: res.score,
    mistakes: res.summary.mistakes.map((m) => `${m.code}@${m.t.toFixed(2)}|${m.points}`),
    coached: (ended.coachedMistakes ?? []).map((c) => `${c.code}@${c.t.toFixed(2)}`),
    cards,
  };
}

describe("the harness is what the verifier drove", () => {
  it(`${UNCAPPED} L1 is a non-exam lesson with NO capped objective — so the frames' own task-cap fields reach the reducer unchanged`, () => {
    const l = compileScenario(spec(UNCAPPED), 1);
    expect(l.examMode).toBeFalsy();
    expect(l.objectives.every((o) => (o.params as { maxSpeedKmh?: number }).maxSpeedKmh === undefined)).toBe(true);
    const first = SCENARIO_TEMPLATES.find((s) => {
      const c = compileScenario(s, 1);
      return !c.examMode && c.objectives.every((o) => (o.params as { maxSpeedKmh?: number }).maxSpeedKmh === undefined);
    });
    expect(first?.id).toBe(UNCAPPED);
  });
});

// ---------------------------------------------------------------------------
// A · R1-STALE-LAPSE
// ---------------------------------------------------------------------------

const STALE3 = (dip: boolean) =>
  prog(
    [
      { from: 0, to: 4, v: 46 },
      { from: 4, to: 4.1, v: 58, o: arr(50, 4, 58) },
      ...(dip
        ? [
            { from: 4.1, to: 4.6, v: 46, o: { curveAdvisoryKmh: 30 } },
            { from: 4.6, to: 5.1, v: 41, o: { curveAdvisoryKmh: 30 } },
            { from: 5.1, to: 9.5, v: 46, o: { curveAdvisoryKmh: 30 } },
          ]
        : [{ from: 4.1, to: 9.5, v: 46, o: { curveAdvisoryKmh: 30 } }]),
      { from: 9.5, to: 9.6, v: 58, o: { curveAdvisoryKmh: 30, ...arr(50, 9.5, 58) } },
      { from: 9.6, to: 30, v: 28, o: { curveAdvisoryKmh: 30 } },
    ],
    rain,
  );

// ROUND 14: «A · R1-STALE-LAPSE — the extra charged point is gone» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// ---------------------------------------------------------------------------
// B · ROUND 9's LINES — E4, E5, E9, E11, as the student meets them
// ---------------------------------------------------------------------------

// ROUND 14: «B · round 9's lines, as the student meets them (verifier E4, E5, E9, E11)» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// ---------------------------------------------------------------------------
// B (cont.) · E11 on the committed catalogue — the verifier's ON placement
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const districts = new Map<string, unknown>();
function district(id: string): unknown {
  if (!districts.has(id)) districts.set(id, JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")));
  return districts.get(id);
}
type Rec = (...a: unknown[]) => unknown;
const mods = import.meta.glob("../../traces/sc*.ts", { eager: true }) as Record<string, Record<string, unknown>>;
const three = new Map<string, Rec>();
for (const m of Object.values(mods)) {
  for (const [name, fn] of Object.entries(m)) {
    if (typeof fn !== "function" || !/^record\w*Drive$/.test(name) || (fn as Rec).length >= 4) continue;
    const id = name.replace(/^record/, "").replace(/Drive$/, "").replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "");
    three.set(id, fn as Rec);
    three.set(id.replace(/-/g, ""), fn as Rec);
  }
}
function shadowTicks(id: string): SimTick[] {
  const f = three.get(id) ?? three.get(id.replace(/-/g, ""));
  if (f === undefined) throw new Error(`no recorder for ${id}`);
  const ticks: SimTick[] = [];
  f(district(spec(id).map.districtId), "shadow-correct", { onTick: (t: SimTick) => ticks.push(t) });
  return ticks;
}
const graceBand = (posted: number) => posted + Math.min(posted * 0.1, 5) - 0.5;
/**
 * The verifier's act-placement drive, byte-for-byte in behaviour: 400 m before the mark the sign's grace band,
 * at the mark cap + slack + 0.2 (the blow), 1 s of grace band, then sign − 1.5 for 8 s (the held correction),
 * else as recorded; no weather, no bend — except, on [w0, w1], rain (W) or a bend advised sign − 1.5 − 13 (B).
 */
function placementDrive(id: string, lv: ScenarioLevel, objectiveId: string, plan: { kind: "none" | "W" | "B"; w0: number; w1: number }) {
  const lesson = compileScenario(spec(id), lv);
  const k = lesson.objectives.findIndex((o) => o.id === objectiveId);
  if (k < 0) throw new Error(`no objective ${objectiveId}`);
  const p = lesson.objectives[k].params as { x: number; y: number; radiusM: number; maxSpeedKmh: number };
  let s: LessonSessionState = createLessonSession(lesson);
  let blownT: number | null = null;
  let latchT: number | null = null;
  let lastT = 0;
  const frames: number[] = [];
  const cards: string[] = [];
  const taskShown: number[] = [];
  const kinFirst: string[] = [];
  let prevCond = false;
  let prevCurve = false;
  for (const tk0 of shadowTicks(id)) {
    if (s.phase !== "driving" && s.phase !== "preDrive") break;
    const st = s.evalStates[k] as { approachCap?: string } | undefined;
    const d = Math.hypot(tk0.position.x - p.x, tk0.position.y - p.y);
    const near = d <= p.radiusM + REACH_ZONE_GRACE_M + 3;
    const sign = tk0.maxSpeedKmh;
    const low = Math.max(1, sign - 1.5);
    let v = tk0.speedKmh;
    if (blownT === null) {
      if (s.currentObjectiveIndex === k && near && st?.approachCap !== "blown") v = p.maxSpeedKmh + REACH_ZONE_CAP_SLACK_KMH + 0.2;
      else if (s.currentObjectiveIndex === k && d <= 400 && st?.approachCap !== "blown") v = graceBand(sign);
    } else {
      const dt = tk0.t - blownT;
      if (dt < 1) v = graceBand(sign);
      else if (dt < 9) v = low;
    }
    const inWin = plan.kind !== "none" && tk0.t >= plan.w0 - 1e-9 && tk0.t <= plan.w1 + 1e-9;
    const tk: SimTick = { ...tk0, speedKmh: v, rain: plan.kind === "W" && inWin, fog: false, snow: false };
    if (plan.kind === "B" && inWin) tk.curveAdvisoryKmh = Math.max(5, low - 13);
    else delete (tk as { curveAdvisoryKmh?: number }).curveAdvisoryKmh;
    const preCoached = s.coachedMistakes.length;
    const preEvents = s.events.length;
    const r = applyTick(s, tk);
    s = r.state;
    lastT = tk0.t;
    frames.push(tk0.t);
    const rules = s.rules as unknown as { taskSignAct: unknown | null; conditionsSpeed: { emitted: boolean }; curveSpeed: { emitted: boolean } };
    if (rules.conditionsSpeed.emitted && !prevCond) kinFirst.push(`W@${tk0.t}`);
    if (rules.curveSpeed.emitted && !prevCurve) kinFirst.push(`B@${tk0.t}`);
    prevCond = rules.conditionsSpeed.emitted;
    prevCurve = rules.curveSpeed.emitted;
    if (latchT === null && rules.taskSignAct !== null) latchT = tk0.t;
    for (const c of s.coachedMistakes.slice(preCoached)) if (c.code === TASK) taskShown.push(tk0.t);
    for (const e of s.events.slice(preEvents)) if (e.kind === "violation" && e.code === TASK && (e as { regrade?: boolean }).regrade !== true) taskShown.push(tk0.t);
    for (const m of r.teachMoments ?? []) cards.push(`${m.code}@${m.t}`);
    if (blownT === null && (s.evalStates[k] as { approachCap?: string } | undefined)?.approachCap === "blown") blownT = tk0.t;
  }
  const preFinal = s.coachedMistakes.length + s.events.length;
  const ended = s.phase === "driving" ? finishSession(s, lastT) : s;
  const settled = ended.coachedMistakes.length + ended.events.length - preFinal;
  return { latchT, frames, cards, taskShown, kinFirst, settled, result: buildLessonResult(ended) };
}

// ROUND 14: «B (cont.) · E11 on the committed catalogue — the verifier's ON placement: a kin first bill ON the latch frame of a committed sign-bound blow» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// ---------------------------------------------------------------------------
// C · THE ABSORBED LATCH — both sides, as the student meets them
// ---------------------------------------------------------------------------

const S1_HEAD: Seg[] = [
  { from: 0, to: 3.2, v: 54, o: rain },
  { from: 3.2, to: 4.2, v: 42, o: rain },
  { from: 4.2, to: 4.5, v: 58, o: rain },
  { from: 4.5, to: 4.6, v: 58, o: { ...rain, ...arr(50, 4.5, 58) } },
];
const SP_HEAD: Seg[] = [
  { from: 0, to: 3.0, v: 58 },
  { from: 3.0, to: 3.1, v: 58, o: arr(50, 3.0, 58) },
];
const stretch = (from: number, to: number, latch: number): Seg => ({ from, to, v: 60, o: { maxSpeedKmh: 70, ...stamp(50, latch) } });
const after70 = (from: number, to: number): Seg => ({ from, to, v: 40, o: { maxSpeedKmh: 70 } });

// ROUND 14: «C · THE ABSORBED LATCH — inside the continuous act nothing more is shown or charged; after it, the new act is a point on repeat» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.
