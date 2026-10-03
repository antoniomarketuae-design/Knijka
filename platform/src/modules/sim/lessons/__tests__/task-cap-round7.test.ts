/**
 * THE TASK CEILING, ROUND 7 — the lesson engine.
 *
 * FOUNDER RULING 4 («Bill the arrival»), IN THE INTEGRATOR'S READING (binding
 * for round 7): EVERY capped objective has a mark, so the arrival is billed at
 * EVERY blown cap mark — INCLUDING a cap the glass shows at or above the sign.
 * Where a SPEEDING_* bill also falls in that continuous act, the arrival and
 * the speeding are ONE act with ONE bill, never two charges for one act;
 * CLEAN_DRIVING is never minted at or after a blown cap in the same act, and
 * praise stays scoped.
 *
 * B · THE ROUND-6 VERIFIER'S R2. Round 6 billed the arrival only where the
 * glass cap was UNDER the sign (`graded`). Of the 514 blown caps per profile of
 * its arrival census, 192 were excluded (172 with the cap equal to the sign, 20
 * above it), and on the over profile 18 of them billed nothing of any speed
 * code: CLEAN_DRIVING was minted AT the blow and the debrief praised «Чисто и
 * спокойно каране» unscoped — the motorway tasks passed at 145.2 through
 * «≤140», and `sc-merge-roadworks-shift`'s works zone passed at 38.2 through a
 * glass «≤33» on a posted 30. All 18 are ported below with the verifier's own
 * harness (the committed recorder, the speed forced to cap + 5.2 near the
 * mark until the evaluator blows it) and are RED on round 6.
 *
 * WHAT A SIGN-BOUND ARRIVAL IS NOW (`rules/engine.ts` „THE SIGN-BOUND
 * ARRIVAL"): passing such a mark over the cap is necessarily passing it over
 * the sign, so it is one act with the speeding the car is already in. The
 * speeding code keeps every bill it had (nothing about SPEEDING_* moves): if
 * it has billed in that act, or bills before the act ends, the arrival is
 * absorbed into it; if the act ends without one, the arrival is billed there,
 * once, as the task's first bill; and a drive that ends inside the act settles
 * it at the end. ROUND 8 (round-7 verifier R5): the act ends where the SPEEDING_*
 * act ends — on the frame the M-16 correction (at or under the sign) has been
 * HELD `speedingRearmSec`, not on the first frame back at the sign — so the
 * cases below that pinned «the first frame back at the sign» now pin that frame.
 *
 * C · THE F7 EDGE (round-6 verifier C1, part 1). The arrival is billed on the
 * frame the lesson latches the blow — the frame AFTER the evaluator's blown
 * frame — and it read the weather act's state as that later frame left it: a car
 * dropping under the rain's line on it turned a blow INSIDE a weather act already
 * named into a surfaced second card. It now reads the state its blow frame left.
 * Every row the verifier listed is ported (its profiles, its recorders) and must
 * be absorbed.
 *
 * C1 part 2 is ruled behaviour and is pinned as such: on `sc-ac-aquaplane`
 * L3 a 40 s hold at 78 through «≤58» in the rain costs no exam point, because
 * it is the lesson's OWN mistake committed the first time (ADR-009, Ruling A) —
 * and the lesson reads «Не е взет».
 *
 * Every case was run RED on round 6 (`scratchpad/cap/r7/red-on-r6*.txt`) except
 * the ones marked GUARD.
 *
 * ROUND 14 — RETIRED HERE: 6 tests (founder ruling 2026-10-03, «Cap adds, never removes. The task cap
 * is an extra rule on top. Its bill stands on its own; the bend/weather bills are charged exactly as they would be in a
 * lesson with no cap. Blowing the cap can only add, never lower the score, and order never matters.»). Each pinned a
 * reading the ruling supersedes — a task-cap bill absorbing, or absorbed by, a weather, bend or SPEEDING_* bill, the kin
 * ledger's owners, lapses, surfaced cards and hand-overs, one bill per M-16 act — or read the state that carried them.
 * Their titles are in the round-14 hand-off log (`scratchpad/cap/r14/retired.txt`); what replaced them is the two-ledger
 * property (`rules/__tests__/taskCapTwoLedgers.ts`, `task-cap-property-census`), the two-ledger reference
 * (`task-cap-two-sided-census`), the lesson censuses and `task-cap-round14`. The tests left here pin readings the ruling
 * keeps (the cap ledger's own rules, the stretch of ruling 2, the card copy).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SimTick, ViolationEvent } from "../../rules";
import { shownObjectiveCapKmh } from "../advisor";
import { buildDebrief } from "../debrief";
import { applyTick, buildLessonResult, createLessonSession, finishSession, type LessonStepResult } from "../engine";
import { REACH_ZONE_CAP_SLACK_KMH, REACH_ZONE_GRACE_M } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState, TeachMoment } from "../types";
import { SESSION_VERDICT_LABEL_BG, sessionVerdict } from "../../hud/SessionEndScreen";
import { makeTick } from "./fixtures";

// `import.meta.glob` is Vite's compile-time transform (vitest runs it); the app's
// tsconfig carries no `vite/client` types, so the one signature used is declared here.
declare global {
  interface ImportMeta {
    glob(pattern: string, options: { eager: true }): Record<string, Record<string, unknown>>;
  }
}

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const TASK_TITLE = "Скорост над тавана на задачата";
const UNSCOPED = /чисто каране без нито едно нарушение|задръж това ниво|карането беше чисто по изпитния лист/u;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

const spec = (id: string) => {
  const s = SCENARIO_TEMPLATES.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no template ${id}`);
  return s;
};
const districts = new Map<string, unknown>();
function district(id: string): unknown {
  if (!districts.has(id)) {
    districts.set(id, JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")));
  }
  return districts.get(id);
}

// ---------------------------------------------------------------------------
// The verifier's recorder harness (`verify5/probes/zz-v5-arrival.test.ts`,
// `verify6/probes/zz-v6-arrival.test.ts`): the committed recorder of the
// template's shadow-correct drive, with the speed forced near ONE capped mark.
// ---------------------------------------------------------------------------

type Rec = (...a: unknown[]) => unknown;
const mods = import.meta.glob("../../traces/sc*.ts", { eager: true }) as Record<string, Record<string, unknown>>;
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

type Profile = "over" | "p20" | "hold" | "resume" | "hover" | "twice";
interface RecDrive {
  /** The evaluator's blown frame for the target mark. */
  blown: { t: number; v: number; posted: number } | null;
  /** The glass figure on the last frame before the blow. */
  shownBeforeBlow: number | null;
  /** The frame the lesson latched that blow (the arrival's frame). */
  latchT: number | null;
  /** The reducer's weather act as the BLOW frame left it (the frame before the latch). */
  kinAtBlow: { namedBy: string | null; ownerLapsed: boolean } | null;
  teach: TeachMoment[];
  hud: LessonStepResult["hudEvents"];
  ended: LessonSessionState;
  /** Every frame the session was handed: speed and posted limit. */
  frames: Array<{ t: number; v: number; posted: number }>;
}
function recorderDrive(id: string, lv: ScenarioLevel, objectiveId: string, prof: Profile): RecDrive {
  const sp = spec(id);
  const lesson = compileScenario(sp, lv);
  const k = lesson.objectives.findIndex((o) => o.id === objectiveId);
  if (k < 0) throw new Error(`no objective ${objectiveId} on ${id}@L${lv}`);
  const p = lesson.objectives[k].params as { x: number; y: number; radiusM: number; maxSpeedKmh: number };
  const cap = p.maxSpeedKmh;
  let s = createLessonSession(lesson);
  let blown: RecDrive["blown"] = null;
  let shownBeforeBlow: number | null = null;
  let latchT: number | null = null;
  let kinAtBlow: RecDrive["kinAtBlow"] = null;
  let holdFrom: number | null = null;
  let lastT = 0;
  const teach: TeachMoment[] = [];
  const hud: LessonStepResult["hudEvents"] = [];
  const frames: RecDrive["frames"] = [];
  const onTick = (tick: SimTick) => {
    if (s.phase !== "driving" && s.phase !== "preDrive") return;
    let tk = tick;
    const cur = s.currentObjectiveIndex;
    const st = s.evalStates[k] as { approachCap?: string } | undefined;
    const win = Math.hypot(tick.position.x - p.x, tick.position.y - p.y) <= p.radiusM + REACH_ZONE_GRACE_M + 30;
    const up = (v: number) => ({ ...tick, speedKmh: Math.max(tick.speedKmh, v) });
    const set = (v: number) => ({ ...tick, speedKmh: v });
    if (prof === "over" && cur === k && win && blown === null) tk = set(cap + REACH_ZONE_CAP_SLACK_KMH + 0.2);
    else if (prof === "p20" && cur === k && win && st?.approachCap !== "blown" && blown === null) tk = up(cap + 20);
    else if (prof === "hold" && cur === k) {
      if (holdFrom === null && win) holdFrom = tick.t;
      if (holdFrom !== null && tick.t - holdFrom <= 40) tk = up(cap + 20);
    } else if (prof === "resume" || prof === "hover" || prof === "twice") {
      if (blown === null) {
        if (cur === k && win && st?.approachCap !== "blown") tk = up(cap + 20);
      } else {
        const dt = tick.t - blown.t;
        if (prof === "resume") {
          if (dt < 6) tk = set(Math.max(3, cap - 10));
          else if (dt < 18) tk = set(cap + 20);
        } else if (prof === "hover") {
          if (dt < 10) tk = set(cap + REACH_ZONE_CAP_SLACK_KMH - 0.5);
          else if (dt < 22) tk = set(cap + 20);
        } else if (dt >= 3 && dt < 15) tk = up(cap + 20);
      }
    }
    const before = s.taskCapLatch?.blownAtSec;
    // Round 14: the kin ledger (its namer and its lapse) is gone with founder ruling 2026-10-03; nothing to record.
    const kinBefore: RecDrive["kinAtBlow"] = null;
    const r = applyTick(s, tk);
    s = r.state;
    lastT = tick.t;
    teach.push(...(r.teachMoments ?? []));
    hud.push(...r.hudEvents);
    const la = s.taskCapLatch;
    if (latchT === null && blown !== null && la !== undefined && la.objectiveIndex === k && la.blownAtSec !== before) {
      latchT = tick.t;
      kinAtBlow = kinBefore;
    }
    const st2 = s.evalStates[k] as { approachCap?: string } | undefined;
    if (blown === null && st2?.approachCap === "blown") blown = { t: tick.t, v: Math.abs(tk.speedKmh), posted: tk.maxSpeedKmh };
    if (blown === null && s.currentObjectiveIndex === k) {
      const o = s.objectives[k];
      // The figure the glass reads: the same derivation the strip and the latch use.
      shownBeforeBlow = shownObjectiveCapKmh(o.spec, cap, lesson.postedLimitKmh);
    }
    frames.push({ t: tick.t, v: Math.abs(tk.speedKmh), posted: tk.maxSpeedKmh });
  };
  const f = three.get(id) ?? three.get(id.replace(/-/g, "")) ?? three.get(ALIAS[id] ?? "");
  if (f) f(district(sp.map.districtId), "shadow-correct", { onTick });
  else {
    let ok = false;
    for (const g of four) {
      try {
        s = createLessonSession(lesson);
        blown = null;
        shownBeforeBlow = null;
        latchT = null;
        kinAtBlow = null;
        holdFrom = null;
        teach.length = 0;
        hud.length = 0;
        frames.length = 0;
        g(district(sp.map.districtId), id, "shadow-correct", { onTick });
        ok = true;
        break;
      } catch {
        /* the next generic recorder */
      }
    }
    if (!ok) throw new Error(`no recorder for ${id}`);
  }
  const ended = s.phase === "driving" ? finishSession(s, lastT) : s;
  return { blown, shownBeforeBlow, latchT, kinAtBlow, teach, hud, ended, frames };
}

const firstBills = (ended: LessonSessionState, code: string) => [
  ...(ended.coachedMistakes ?? []).filter((c) => c.code === code).map((c) => c.t),
  ...ended.events
    .filter((e) => e.kind === "violation" && e.code === code && (e as { regrade?: boolean }).regrade !== true)
    .map((e) => e.t),
];
const taskTexts = (d: { teach: TeachMoment[]; hud: LessonStepResult["hudEvents"] }) => [
  ...d.teach.filter((m) => m.code === TASK).map((m) => m.explanationBg),
  ...d.hud
    .filter((h) => (h.kind === "lesson" || h.kind === "violation") && h.titleBg === TASK_TITLE)
    .map((h) => (h as { explanationBg: string }).explanationBg),
];
const cleanAt = (ended: LessonSessionState) =>
  ended.events.filter((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING").map((e) => e.t);
/**
 * ROUND 8 — the frame the sign-bound act ends on (M-16): the first frame after
 * `fromT` on which the car has been continuously at or under the sign for
 * `speedingRearmSec` (4 s), compared exactly as the reducer compares it. null
 * when the drive ends inside the act.
 */
function m16End(frames: Array<{ t: number; v: number; posted: number }>, fromT: number): number | null {
  let since: number | null = null;
  for (const f of frames) {
    if (f.t <= fromT) continue;
    if (f.v > f.posted) {
      since = null;
      continue;
    }
    if (since === null) since = f.t;
    if (f.t - since >= 4) return f.t;
  }
  return null;
}
function praiseScoped(ended: LessonSessionState): string[] {
  const r = buildLessonResult(ended);
  const text = buildDebrief(ended.lesson, r, { coachedMistakes: r.coachedMistakes }).text;
  const bad: string[] = [];
  if (UNSCOPED.test(text)) bad.push("unscoped closing");
  for (const l of text.split("\n").filter((x) => x.includes("Чисто и спокойно каране"))) {
    if (!l.includes("но само на отделни отсечки")) bad.push(`unscoped «${l.trim().slice(0, 80)}»`);
  }
  return bad;
}

// ---------------------------------------------------------------------------
// B · the 18 rows
// ---------------------------------------------------------------------------

describe("B · ruling 4 at a cap the glass shows AT or ABOVE the sign — the round-6 verifier's 18 rows (R2)", () => {
  const ROWS: Array<[string, ScenarioLevel, string]> = [
    ["sc-mw-discipline", 1, "sc-mwd-lane"],
    ["sc-mw-discipline", 2, "sc-mwd-lane"],
    ["sc-mw-discipline", 3, "sc-mwd-lane"],
    ["sc-mw-discipline", 5, "sc-mwd-lane"],
    ["sc-mw-min-speed", 1, "sc-mwms-join"],
    ["sc-mw-min-speed", 1, "sc-mwms-hold"],
    ["sc-mw-min-speed", 2, "sc-mwms-join"],
    ["sc-mw-min-speed", 2, "sc-mwms-hold"],
    ["sc-mw-min-speed", 3, "sc-mwms-join"],
    ["sc-mw-min-speed", 3, "sc-mwms-hold"],
    ["sc-mw-min-speed", 5, "sc-mwms-join"],
    ["sc-mw-min-speed", 5, "sc-mwms-hold"],
    ["sc-fo-motorway-gap", 1, "sc-fmg-gap"],
    ["sc-fo-motorway-gap", 2, "sc-fmg-gap"],
    ["sc-fo-motorway-gap", 3, "sc-fmg-gap"],
    ["sc-fo-motorway-gap", 5, "sc-fmg-gap"],
    ["sc-merge-roadworks-shift", 3, "sc-mrs-works-pace"],
    ["sc-merge-roadworks-shift", 5, "sc-mrs-works-pace"],
  ];
  for (const [id, lv, obj] of ROWS) {
    it(`${id}@L${lv} ${obj}, passed at cap + 5.2: ONE task bill for the act, the card says the speed, the cap AND the sign, no praise minted at the blow, and the debrief's praise stays scoped`, () => {
      const d = recorderDrive(id, lv, obj, "over");
      expect(d.blown).not.toBeNull();
      const blow = d.blown!;
      // The row is what the verifier says it is: the glass cap is NOT under the sign.
      expect(d.shownBeforeBlow).not.toBeNull();
      expect(d.shownBeforeBlow!).toBeGreaterThanOrEqual(blow.posted);
      // No speed code of any kind billed it on round 6; the arrival does now — once, at the act's end.
      expect(firstBills(d.ended, "SPEEDING_OVER_LIMIT").concat(firstBills(d.ended, "SPEEDING_DANGEROUS")).filter((t) => t >= blow.t - 3 && t <= blow.t + 6)).toEqual([]);
      const task = firstBills(d.ended, TASK);
      expect(task).toHaveLength(1);
      // The harness puts the car back at the sign at once…
      const back = d.frames.find((f) => f.t > blow.t && f.v <= f.posted);
      expect(back).toBeDefined();
      expect(back!.t).toBeLessThanOrEqual(blow.t + 1);
      // …and the act ends where M-16 ends it (round 8): that correction HELD 4 s — or,
      // where the drive ends first (the works zone: the recorded shadow goes back over
      // the posted 30 at 29.7 and the drive completes at 30.5), the ending settles it.
      const end = m16End(d.frames, blow.t);
      expect(task[0]).toBe(end ?? d.frames[d.frames.length - 1].t);
      const text = taskTexts(d);
      if (end === null) {
        // Round 8: settled at the drive's ending — no card can follow a finished drive;
        // the debrief lists the arrival as a taught row (and scopes its praise, below).
        expect(text).toEqual([]);
        expect((d.ended.coachedMistakes ?? []).filter((c) => c.code === TASK).map((c) => c.t)).toEqual([task[0]]);
      } else {
        expect(text).toHaveLength(1);
        expect(text[0]).toMatch(
          new RegExp(
            `^Мина точката на задачата с ${(Math.round(blow.v * 10) / 10).toString().replace(".", ",")} км/ч при таван на задачата ${d.shownBeforeBlow} км/ч — и над ограничението от знака ${blow.posted} км/ч\\. `,
            "u",
          ),
        );
      }
      // CLEAN_DRIVING is not minted at the blow, nor in the act it opened.
      expect(cleanAt(d.ended).filter((t) => t >= blow.t - 0.01 && t <= task[0] + 0.01)).toEqual([]);
      expect(praiseScoped(d.ended)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// B · the one act with the speeding — the spray's ≤80 mark under a posted 80
// ---------------------------------------------------------------------------

interface SprayOpts {
  speed: (c: { y: number; t: number; blown: boolean; sinceBlow: number }) => number;
  posted?: (c: { y: number; t: number }) => number;
  endY?: number;
  maxT?: number;
  /** m/s² — the default 6 is a car; 20 reaches a step change within a few metres. */
  accel?: number;
  rain?: boolean;
}
interface SprayDrive {
  blownAt: number | null;
  teach: TeachMoment[];
  hud: LessonStepResult["hudEvents"];
  ended: LessonSessionState;
  /** Frames of the drive: speed and posted limit, for the act's end. */
  frames: Array<{ t: number; v: number; posted: number }>;
}
/** sc-ac-truck-spray L3 along x 0 (the ≤80 mark at y 450), dry; the posted limit chosen by the case. */
function spray(o: SprayOpts): SprayDrive {
  let s = createLessonSession(compileScenario(spec("sc-ac-truck-spray"), 3));
  let y = 15;
  let v = 0;
  let t = 0;
  let blownAt: number | null = null;
  const teach: TeachMoment[] = [];
  const hud: LessonStepResult["hudEvents"] = [];
  const frames: SprayDrive["frames"] = [];
  while (s.phase === "driving" && y < (o.endY ?? 900) && t < (o.maxT ?? 200)) {
    t = Math.round((t + 0.1) * 10) / 10;
    const sinceBlow = blownAt === null ? -1 : t - blownAt;
    const target = o.speed({ y, t, blown: blownAt !== null, sinceBlow }) / 3.6;
    v = v < target ? Math.min(target, v + (o.accel ?? 6) * 0.1) : Math.max(target, v - 100);
    y += v * 0.1;
    const posted = o.posted?.({ y, t }) ?? 80;
    const r = applyTick(s, makeTick({ t, speedKmh: v * 3.6, maxSpeedKmh: posted, position: { x: 0, y }, headingDeg: 0, rain: o.rain === true }));
    s = r.state;
    frames.push({ t, v: v * 3.6, posted });
    teach.push(...(r.teachMoments ?? []));
    hud.push(...r.hudEvents);
    const st = s.evalStates[0] as { approachCap?: string } | undefined;
    if (blownAt === null && st?.approachCap === "blown") blownAt = t;
  }
  const ended = s.phase !== "driving" ? s : finishSession(s, t);
  return { blownAt, teach, hud, ended, frames };
}
const speedingFirst = (ended: LessonSessionState) => [
  ...firstBills(ended, "SPEEDING_OVER_LIMIT"),
  ...firstBills(ended, "SPEEDING_DANGEROUS"),
];

describe("B · a sign-bound arrival and the speeding are ONE act with ONE bill (the spray's ≤80 mark, posted 80)", () => {
  it("88 through the mark, then straight back to 75: the arrival is billed ONCE, when that correction has been held 4 s (M-16, round 8), and its card says the speed, the cap and the sign", () => {
    const d = spray({ speed: (c) => (c.y < 425 ? 70 : !c.blown ? 88 : 75), accel: 20 });
    expect(d.blownAt).not.toBeNull();
    expect(speedingFirst(d.ended)).toEqual([]);
    const task = firstBills(d.ended, TASK);
    expect(task).toHaveLength(1);
    const back = d.frames.find((f) => f.t > (d.blownAt as number) && f.v <= f.posted)!;
    expect(task[0]).toBe(m16End(d.frames, d.blownAt as number));
    expect(task[0]).toBeGreaterThanOrEqual(back.t + 4 - 1e-9);
    expect(taskTexts(d)[0]).toMatch(/^Мина точката на задачата с 88 км\/ч при таван на задачата 80 км\/ч — и над ограничението от знака 80 км\/ч\. /u);
    expect(praiseScoped(d.ended)).toEqual([]);
  });
  it("88 through the mark, then 83 for 11.5 s (over the sign, under the speeding's line), then 75: NOTHING bills and NO praise is minted while that act runs; the arrival is billed when it ends", () => {
    // Round 8: 11.5 s rather than round 7's 15, so the correction to 75 is HELD 4 s
    // before the curtain's goal ends the drive (with 15 s the drive now ends inside
    // the act and the ending settles it — the case after this one).
    const d = spray({ speed: (c) => (c.y < 425 ? 70 : !c.blown ? 88 : c.sinceBlow < 11.5 ? 83 : 75), accel: 20 });
    expect(d.blownAt).not.toBeNull();
    const back = d.frames.find((f) => f.t > (d.blownAt as number) && f.v <= f.posted)!;
    expect(back.t).toBeGreaterThan((d.blownAt as number) + 11);
    // Round 8: the act ends where M-16 ends it — the correction to 75 held 4 s.
    const end = m16End(d.frames, d.blownAt as number) as number;
    expect(end).toBeGreaterThanOrEqual(back.t + 4 - 1e-9);
    expect(speedingFirst(d.ended)).toEqual([]);
    expect(firstBills(d.ended, TASK)).toEqual([end]);
    // 83 km/h for 11.5 s is ~265 m of driving — past the 250 m payout — and none of it minted in the act.
    expect(cleanAt(d.ended).filter((t) => t >= (d.blownAt as number) && t <= end)).toEqual([]);
  });
  it("88 through the mark and 83 to the end of the drive: the act never ended, so the drive's ending settles it — the arrival is taught and listed, and the praise stays scoped", () => {
    const d = spray({ speed: (c) => (c.y < 425 ? 70 : !c.blown ? 88 : 83), endY: 800, accel: 20 });
    expect(d.blownAt).not.toBeNull();
    expect(d.ended.phase).not.toBe("driving");
    expect(speedingFirst(d.ended)).toEqual([]);
    const coached = (d.ended.coachedMistakes ?? []).filter((c) => c.code === TASK);
    expect(coached).toHaveLength(1);
    expect(coached[0].t).toBeGreaterThan(d.blownAt as number);
    expect(praiseScoped(d.ended)).toEqual([]);
  });
  it("GUARD — the same mark under a posted 140 (the glass cap under the sign) is billed AT the blow, without waiting, exactly as round 6", () => {
    const d = spray({ speed: (c) => (c.y < 425 ? 70 : !c.blown ? 116 : 75), posted: () => 140, accel: 20 });
    expect(d.blownAt).not.toBeNull();
    const task = firstBills(d.ended, TASK);
    expect(task).toHaveLength(1);
    expect(Math.abs(task[0] - (d.blownAt as number))).toBeLessThanOrEqual(0.15);
    expect(taskTexts(d)[0]).toMatch(/^Мина точката на задачата с 116 км\/ч при таван на задачата 80 км\/ч\. /u);
  });
  it("GUARD — a lawful drive under the posted 80 blows nothing and bills nothing", () => {
    const d = spray({ speed: () => 76 });
    expect(d.blownAt).toBeNull();
    expect(firstBills(d.ended, TASK)).toEqual([]);
    expect(speedingFirst(d.ended)).toEqual([]);
  });
});

// ROUND 14: «B · «a point on repeat» at a sign-bound mark too (the spray's ≤80 mark, posted 80, in the rain)» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// ---------------------------------------------------------------------------
// B · the census: every blown cap the glass shows at or above the sign
// ---------------------------------------------------------------------------

// ROUND 14: «B · census — every capped flow objective of every practice rung, blown where the glass cap is NOT under the sign» retired whole — every case in it pinned the cross-ledger absorption that the founder ruling 2026-10-03 («the cap adds, never removes») removed.

// ---------------------------------------------------------------------------
// C · the F7 edge — the arrival reads its BLOW frame's weather act
// ---------------------------------------------------------------------------

describe("C · the F7 edge: a blow inside a weather act already named is ABSORBED, whatever the latch frame does (round-6 verifier C1, part 1)", () => {
  // The verifier's rows (its `arrival6-r6.txt`, «2 named first bills»): template, objective, profiles.
  const ROWS: Array<[string, string, Profile[]]> = [
    ["sc-speed-rain", "sc-rn-finish", ["over", "p20", "resume", "twice"]],
    ["sc-speed-rain", "sc-rn-adapted", ["over", "p20", "resume", "twice"]],
    ["sc-follow-rain-gap", "sc-fr-follow", ["p20", "resume", "twice", "hover"]],
    ["sc-crossing-rain-sprint", "sc-crs-approach", ["over", "p20", "resume", "twice", "hover"]],
    ["sc-ac-wet-braking", "sc-acw-approach", ["over", "p20", "resume", "twice"]],
    ["sc-ac-snow", "sc-acs-approach", ["over", "p20", "resume", "twice"]],
    ["sc-ac-night-overdrive", "sc-acno-adapted", ["over", "p20", "resume", "twice", "hover"]],
    ["sc-ac-fog", "sc-acf-adapted", ["over", "p20", "resume", "twice"]],
    ["sc-ac-rain-lights", "sc-acr-lit", ["over", "p20", "resume", "twice"]],
  ];
  const cases: Array<{ label: string; d: RecDrive }> = [];
  for (const [id, obj, profs] of ROWS) {
    for (const lvObj of spec(id).levels) {
      const lv = lvObj.level as ScenarioLevel;
      const lesson = compileScenario(spec(id), lv);
      if (lesson.examMode || !lesson.objectives.some((o) => o.id === obj)) continue;
      for (const prof of profs) cases.push({ label: `${id}@L${lv} ${obj} ${prof}`, d: recorderDrive(id, lv, obj, prof) });
    }
  }
  it("GUARD — …and every act still has its one card: the weather's, shown before the blow", () => {
    const f7 = cases.filter((c) => c.d.latchT !== null && c.d.kinAtBlow?.namedBy === COND && !c.d.kinAtBlow.ownerLapsed);
    const bad = f7.filter((c) => firstBills(c.d.ended, COND).filter((t) => t < (c.d.latchT as number)).length !== 1).map((c) => c.label);
    expect(bad).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C1 part 2 — the ADR-009 target pass-through, ruled behaviour
// ---------------------------------------------------------------------------

describe("GUARD — C1 part 2 is RULING A working as ruled: the lesson's own mistake, committed the first time, costs no exam point and the lesson is NOT taken", () => {
  it("sc-ac-aquaplane@L3 sc-acq-before, 78 held 40 s through «≤58» in the rain: score 0, one lesson mistake (the conditions code), and the verdict «Не е взет»", () => {
    const d = recorderDrive("sc-ac-aquaplane", 3, "sc-acq-before", "hold");
    expect(d.blown).not.toBeNull();
    const r = buildLessonResult(d.ended);
    expect(r.score).toBe(0);
    expect((r.lessonMistakes ?? []).map((m) => m.code)).toContain(COND);
    expect(r.passed).toBe(false);
    expect(sessionVerdict(r)).toBe("lessonMistake");
    expect(SESSION_VERDICT_LABEL_BG[sessionVerdict(r)]).toBe("Не е взет");
  });
});

// Keep the directory read the census depends on honest (a missing content tree is not a pass).
it("GUARD — the committed shadows the census drives exist", () => {
  expect(readdirSync(path.join(REPO_ROOT, "content", "traces")).length).toBeGreaterThan(100);
});
