/**
 * THE TASK CEILING, ROUND 13 — the committed-lesson drive the lesson-level census and its witnesses share (not a test
 * file).
 *
 * WHY IT EXISTS (the integrator's ruling for round 13, C1). Every generated programme of rounds 11–12 carried the glass
 * figure EQUAL to the compiled gate on every frame, while 306 of the 521 committed capped objectives show a figure under
 * their gate — so a mutant that read the gate where the product reads the glass (the round-12 verifier's V16, V33,
 * V34) changed what a student sees on committed lessons and survived every test. This helper drives a REAL compiled
 * lesson session along its committed shadow route (the recorder the catalogue ships), forcing only the speed near ONE
 * capped mark, and records what the student is SHOWN from the surfaces that show it:
 *
 *  · THE GLASS — the figure the strip printed, read off the shell's own snapshot (`LessonPlayShell.snapshotOf` →
 *    `taskCapKmh`, parsed back out of the advisor's sentence). It is NOT `shownObjectiveCapKmh`, the function the
 *    latch under test calls: the two meet only on the glass.
 *  · THE TAP — every tick the lesson handed the rule engine and the events it got back. The caller's `vi.mock` wraps
 *    `reduceTick` (instrumentation only: the real function runs and its result is returned untouched), so the stamps
 *    the lesson placed (`taskSpeedCap`, `taskCapArrival`) are read where they are consumed.
 *  · THE CARDS, ROWS AND POINTS — the teach moments, the HUD toasts, the breach rows, the coached rows, the charged
 *    mistakes and the score of the finished session.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCENARIO_TEMPLATES,
  applyTick,
  buildLessonResult,
  compileScenario,
  createLessonSession,
  finishSession,
  type LessonSessionState,
} from "@/modules/sim/lessons";
import { REACH_ZONE_CAP_SLACK_KMH, REACH_ZONE_GRACE_M } from "@/modules/sim/lessons/objectives";
import type { ScenarioLevel } from "@/modules/sim/lessons/scenario/types";
import { createRuleEngine, type RuleEvent, type SimTick } from "@/modules/sim/rules";
import { snapshotOf, type HudSnapshot } from "../LessonPlayShell";

// `import.meta.glob` is Vite's compile-time transform (vitest runs it); the app's tsconfig carries no `vite/client`
// types, so the one signature used is declared here.
declare global {
  interface ImportMeta {
    glob(pattern: string, options: { eager: true }): Record<string, Record<string, unknown>>;
  }
}

export const SLACK = REACH_ZONE_CAP_SLACK_KMH;
export const TASK = "TASK_SPEED_CAP_EXCEEDED";
export const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
export const CURVE = "SPEED_TOO_FAST_FOR_CURVE";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

const districts = new Map<string, unknown>();
function district(id: string): unknown {
  if (!districts.has(id)) districts.set(id, JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")));
  return districts.get(id);
}

type Rec = (...a: unknown[]) => unknown;
const mods = import.meta.glob("../../../../modules/sim/traces/sc*.ts", { eager: true }) as Record<string, Record<string, unknown>>;
const three = new Map<string, Rec>();
const four: Rec[] = [];
for (const m of Object.values(mods)) {
  for (const [name, fn] of Object.entries(m)) {
    if (typeof fn !== "function" || !/^record\w*Drive$/.test(name)) continue;
    const id = name
      .replace(/^record/, "")
      .replace(/Drive$/, "")
      .replace(/([A-Z])/g, "-$1")
      .toLowerCase()
      .replace(/^-/, "");
    if ((fn as Rec).length >= 4) four.push(fn as Rec);
    else {
      three.set(id, fn as Rec);
      three.set(id.replace(/-/g, ""), fn as Rec);
    }
  }
}
const ALIAS: Record<string, string> = {
  "sc-vu-cyclist-hook": "sc-vu-cyclist",
  "sc-vu-pass-clearance": "sc-vu-pass",
  "sc-vu-door-zone": "sc-vu-door",
  "sc-rx-tram-stop-doors": "sc-rx-tram-stop",
};

/**
 * What the rule engine was handed and what it answered — filled by the caller's `vi.mock` of `rules/engine`, and ONLY
 * while `armed`: the recorder that walks the shadow route runs a lesson session of its own (the committed correct
 * drive), so its calls reach the same function; this drive arms the tap around its own `applyTick` alone.
 */
export interface Tap {
  armed: boolean;
  /**
   * ROUND 14 — while armed, hand the reducer the tick WITHOUT the cap fields (`taskSpeedCap`, `taskCapArrival`): the
   * same drive, the same lesson, the rule engine seeing no cap — «the same lesson with the cap removed» (founder ruling
   * 2026-10-03), compared with the drive that has it by the census's link F.
   */
  strip?: boolean;
  calls: Array<{ tick: SimTick; events: RuleEvent[] }>;
}

/** One committed capped objective of one non-exam rung. */
export interface CappedRow {
  id: string;
  lv: ScenarioLevel;
  k: number;
  objectiveId: string;
  /** The compiled gate (`params.maxSpeedKmh`). */
  gate: number;
  /** The lesson's own posted limit, as compiled. */
  posted: number | undefined;
}

/** Every capped reachZone objective of every non-exam rung of every template that ships a shadow-correct route. */
export function committedCappedRows(): CappedRow[] {
  const out: CappedRow[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    let hasShadow = true;
    try {
      readFileSync(path.join(REPO_ROOT, "content", "traces", spec.id, "shadow-correct.trace.json"));
    } catch {
      hasShadow = false;
    }
    if (!hasShadow) continue;
    for (const lvObj of spec.levels) {
      const lv = lvObj.level as ScenarioLevel;
      const lesson = compileScenario(spec, lv);
      if (lesson.examMode) continue;
      // The SESSION's objectives carry the evaluator's kind (the compiled spec's params do not).
      createLessonSession(lesson).objectives.forEach((o, k) => {
        const p = o.params as { kind: string; maxSpeedKmh?: number };
        // Above the halt band (≤ 8 is a stop, never a flow cap — `objectives.ts isFlowCap`).
        if (p.kind !== "reachZone" || p.maxSpeedKmh === undefined || p.maxSpeedKmh <= 8) return;
        out.push({ id: spec.id, lv, k, objectiveId: lesson.objectives[k].id, gate: p.maxSpeedKmh, posted: lesson.postedLimitKmh });
      });
    }
  }
  return out;
}

/** What the plan may read to decide the speed of a frame. */
export interface PlanCtx {
  tick: SimTick;
  /** The capped objective is the active one. */
  active: boolean;
  /** Within 30 m / 3 m of the mark's acceptance. */
  win: boolean;
  near: boolean;
  gate: number;
  /** The evaluator has already judged the mark blown. */
  approachBlown: boolean;
  /** The blow, once the lesson has latched it (the frame the latch appeared). */
  blow: { t: number; sign: number } | null;
  /** Seconds since the blow frame. */
  dt: number;
}
/** Returns the speed to force on this frame, or `undefined` to keep the recorder's own. */
export type SpeedPlan = (c: PlanCtx) => number | undefined;

/** The sign's own grace band, half a km/h under its bill line: over the sign, never a SPEEDING bill. */
export const graceBand = (posted: number) => posted + Math.min(posted * 0.1, 5) - 0.5;

export const PLANS: Record<string, SpeedPlan> = {
  /** EXACTLY on the blow line (gate + slack): the evaluator refuses only strictly above it — never blown. */
  line: (c) => (c.active && c.win && c.blow === null ? c.gate + SLACK : undefined),
  /** A late blow, 0.2 over the line, and the recorder's own driving after it. */
  late: (c) => (c.blow === null && c.active && c.near && !c.approachBlown ? c.gate + SLACK + 0.2 : undefined),
  /** A late blow, then 14 s held 8 km/h over the higher of the gate and the sign's graded line, then the recorder's own. */
  hold: (c) => {
    if (c.blow === null) return c.active && c.near && !c.approachBlown ? c.gate + SLACK + 0.2 : undefined;
    return c.dt < 14 ? Math.max(c.gate + SLACK, c.tick.maxSpeedKmh) + 3 : undefined;
  },
  /** A late blow, then the sign's grace band for 12 s (over the sign, no speeding bill, never a correction). */
  grace: (c) => {
    if (c.blow === null) return c.active && c.near && !c.approachBlown ? c.gate + SLACK + 0.2 : undefined;
    return c.dt < 12 ? graceBand(c.tick.maxSpeedKmh) : undefined;
  },
  /**
   * ROUND 14 (R1-THEO4-ROUNDED-ENVELOPE, the round-13 verifier's truth probe): wherever the weather reduces the sign, the
   * mark passed 0,3 km/h over what the weather leaves of it (over the unrounded envelope, under its rounded whole number
   * where the envelope is fractional) when that speed also blows the mark, and that speed held for 14 s after the blow —
   * the speeds at which a card that rounds its threshold says «над 43» at 42,8.
   */
  wet: (c) => {
    const env = envelopeOfTick(c.tick);
    if (env === null) return undefined;
    if (c.blow === null) return c.active && c.near && !c.approachBlown && env + 0.3 > c.gate + SLACK ? env + 0.3 : undefined;
    return c.dt < 14 ? env + 0.3 : undefined;
  },
};

/** What the weather leaves of the sign on a frame, by the default config's factors (the strictest governs); null in the dry. */
const DEFAULT_FACTORS = createRuleEngine().config;
function envelopeOfTick(x: SimTick): number | null {
  const f = Math.min(
    x.snow === true ? DEFAULT_FACTORS.conditionSpeedSnowFactor : 1,
    x.fog === true ? DEFAULT_FACTORS.conditionSpeedFogFactor : 1,
    x.rain === true ? DEFAULT_FACTORS.conditionSpeedRainFactor : 1,
    x.isNight === true ? DEFAULT_FACTORS.conditionSpeedNightFactor : 1,
  );
  return f < 1 ? x.maxSpeedKmh * f : null;
}

export interface Card {
  code: string;
  t: number;
  charged: boolean;
  text: string;
}
export interface GlassDrive {
  row: CappedRow;
  err: string | null;
  /** The figure the strip printed on the last frame before the blow while the objective was active. */
  glassBeforeBlow: number | undefined;
  /** The blow: the frame the latch appeared, the sign on it, the speed the evaluator judged (the frame before). */
  blow: { t: number; sign: number; arrivalKmh: number; latch: number } | null;
  /** Latches created during the drive (`blownAtSec`), in order. */
  latches: number[];
  /** Every tick the lesson handed the reducer while this drive ran, with the events it answered. */
  tap: Array<{ tick: SimTick; events: RuleEvent[] }>;
  /** The strip's figure AFTER each tapped frame (index-aligned with `tap`), `undefined` when the strip shows none. */
  glass: Array<number | undefined>;
  /** Teach cards (the pause) and HUD toasts that state a violation, with their text. */
  cards: Card[];
  toasts: Array<{ kind: string; titleBg: string; text: string; t: number }>;
  ended: LessonSessionState;
  breaches: string[];
  coached: string[];
  mistakes: string[];
  score: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Drive one committed capped objective along the template's shadow-correct route under one speed plan. */
export function glassDrive(row: CappedRow, plan: SpeedPlan, tap: Tap): GlassDrive {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === row.id);
  if (spec === undefined) throw new Error(`no template ${row.id}`);
  const lesson = compileScenario(spec, row.lv);
  const p = lesson.objectives[row.k].params as { x: number; y: number; radiusM: number; maxSpeedKmh: number };
  let s: LessonSessionState = createLessonSession(lesson);
  let prevSnap: HudSnapshot | null = null;
  let glassBeforeBlow: number | undefined;
  let blow: GlassDrive["blow"] = null;
  let lastT = 0;
  let lastSpeed = 0;
  let latches: number[] = [];
  let glass: Array<number | undefined> = [];
  let cards: Card[] = [];
  let toasts: GlassDrive["toasts"] = [];
  let tapFrom = tap.calls.length;
  const reset = () => {
    s = createLessonSession(lesson);
    prevSnap = null;
    glassBeforeBlow = undefined;
    blow = null;
    lastT = 0;
    lastSpeed = 0;
    latches = [];
    glass = [];
    cards = [];
    toasts = [];
    tapFrom = tap.calls.length;
  };
  const onTick = (tick: SimTick) => {
    if (s.phase !== "driving" && s.phase !== "preDrive") return;
    const st = s.evalStates[row.k] as { approachCap?: string } | undefined;
    const d = Math.hypot(tick.position.x - p.x, tick.position.y - p.y);
    const forced = plan({
      tick,
      active: s.currentObjectiveIndex === row.k,
      win: d <= p.radiusM + REACH_ZONE_GRACE_M + 30,
      near: d <= p.radiusM + REACH_ZONE_GRACE_M + 3,
      gate: row.gate,
      approachBlown: st?.approachCap === "blown",
      blow: blow === null ? null : { t: blow.t, sign: blow.sign },
      dt: blow === null ? 0 : tick.t - blow.t,
    });
    const tk = forced === undefined ? tick : { ...tick, speedKmh: forced };
    const prevLatch = (s.taskCapLatch as { blownAtSec: number } | undefined)?.blownAtSec;
    const before = tap.calls.length;
    tap.armed = true;
    const r = applyTick(s, tk);
    tap.armed = false;
    s = r.state;
    const snap = snapshotOf(s, tk, null, prevSnap);
    prevSnap = snap;
    // one glass reading per tapped frame (the lesson calls the reducer once per live frame)
    for (let i = before; i < tap.calls.length; i++) glass.push(snap.taskCapKmh);
    for (const m of (r as { teachMoments?: Array<{ code: string; t: number; charged?: boolean; explanationBg: string }> }).teachMoments ?? []) {
      cards.push({ code: m.code, t: r2(m.t), charged: m.charged === true, text: m.explanationBg });
    }
    for (const h of r.hudEvents as Array<{ kind: string; titleBg?: string; explanationBg?: string }>) {
      if ((h.kind === "violation" || h.kind === "lesson") && h.explanationBg !== undefined) toasts.push({ kind: h.kind, titleBg: h.titleBg ?? "", text: h.explanationBg, t: r2(tick.t) });
    }
    const latch = (s.taskCapLatch as { objectiveIndex: number; blownAtSec: number } | undefined);
    if (latch !== undefined && latch.blownAtSec !== prevLatch) {
      latches.push(latch.blownAtSec);
      if (blow === null && latch.objectiveIndex === row.k) blow = { t: tick.t, sign: tk.maxSpeedKmh, arrivalKmh: Math.abs(lastSpeed), latch: latch.blownAtSec };
    }
    if (blow === null && s.currentObjectiveIndex === row.k && snap.taskCapKmh !== undefined) glassBeforeBlow = snap.taskCapKmh;
    lastT = tick.t;
    lastSpeed = tk.speedKmh;
  };
  let err: string | null = null;
  try {
    const f = three.get(row.id) ?? three.get(row.id.replace(/-/g, "")) ?? three.get(ALIAS[row.id] ?? "");
    if (f) f(district(spec.map.districtId), "shadow-correct", { onTick });
    else {
      let ok = false;
      for (const g of four) {
        try {
          reset();
          g(district(spec.map.districtId), row.id, "shadow-correct", { onTick });
          ok = true;
          break;
        } catch {
          /* the next generic recorder */
        }
      }
      if (!ok) err = "no-recorder";
    }
  } catch (e) {
    err = String(e).slice(0, 160);
  }
  const ended = s.phase === "driving" ? finishSession(s, lastT) : s;
  const result = buildLessonResult(ended);
  return {
    row,
    err,
    glassBeforeBlow,
    blow,
    latches,
    tap: tap.calls.slice(tapFrom),
    glass,
    cards,
    toasts,
    ended,
    breaches: (result.taskCapBreaches ?? []).map((b) => `${b.objectiveId}@${b.t.toFixed(2)}`),
    coached: (ended.coachedMistakes ?? []).map((c) => `${c.code}@${c.t.toFixed(2)}`),
    mistakes: result.summary.mistakes.map((x) => `${x.code}@${x.t.toFixed(2)}|${x.points}`),
    score: result.score,
  };
}

/** `lessons/engine.ts kmhTxt`, restated: one decimal, a decimal comma, no trailing «,0». */
export function kmhText(v: number): string {
  return (Math.round(v * 10) / 10).toString().replace(".", ",");
}
