/**
 * THE TASK CEILING, ROUND 3 — founder ruling 2026-09-25 (register item 17,
 * „Bill it"), rows `sc-ac-truck-spray:990e5f64` (critical) and `:8ed4d8b3`.
 *
 * Round 2 was REFUTED by an adversarial verifier. Every case below is one of
 * its probes (`zz-v3-probe.test.ts` P1–P5, `zz-v2-attack.test.ts` A1–A7,
 * `zz-v2-nocap.test.ts`), ported as a pinned assertion and run RED on round 2
 * before any product code moved:
 *
 *   R1  the stretch was an unbounded half-line — on a roundabout it pointed at
 *       the ring's centre with radius 0, so the ≤20 ceiling bound the whole
 *       exit arm (posted 50) and billed a driver who had corrected on the ring;
 *   R2  the stamp flickered twice a lap (the far edge of the half-line, and
 *       the objective's fresh-approach reset), each flicker ended the act, and
 *       a constant 30 round the ≤20 ring was billed once PER LAP;
 *   R3  the finish-time settlement charged the task code on a driver braking
 *       back toward the cap who had never been TAUGHT it;
 *   R4  a breach AT the mark shorter than the task code's sustain (100 through
 *       the ≤80 mark, then 78) left praise unscoped — with a commendation
 *       whose window covered the mark itself;
 *   C1  the conditions code was settled at the end of drives with NO cap;
 *   C2  taught weather/curve rows scoped praise on drives with NO cap;
 *   C3  an act held open in the task's grace band swallowed a later, separate
 *       weather breach without showing its card.
 *
 * ROUND 4 (2026-09-25): the founder ANSWERED C1/C2 — «Yes, same as speeding» —
 * so a taught weather or bend overspeed on a no-cap drive is settled and scopes
 * the praise after all (three no-cap pins below moved, and only those), and
 * ruled «Only the named stretch», so a capped mark binds only through the
 * feature its task names (the A5 guards and the region unit tests say which
 * cases are the region's and which the zone's). The round-4 cases are
 * `task-cap-round4.test.ts`.
 *
 * ROUND 6 (2026-09-26, founder ruling 4 in the integrator's reading: the
 * arrival is billed at EVERY blown cap, and it is one act with any over-cap
 * stretch that follows on the named feature): a mark blown at a graded cap is
 * now always ONE taught TASK event at the blow, named feature or not, and a held
 * correction on the same stretch no longer opens a new act. The pins that said
 * «never TASK» for a blown feature mark now say «the arrival, once, and nothing
 * after it»; each moved pin says so where it moved.
 *
 * The reducer half is `rules/__tests__/task-cap-round3.test.ts`; the span
 * census over every committed shadow route is `task-cap-span-census.test.ts`.
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
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../contracts";
import { VIOLATIONS, type SimTick } from "../../rules";
import { buildDebrief } from "../debrief";
import { abortSession, applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import {
  FINISH_BAY_RADIUS_M,
  TASK_CAP_CORRIDOR_HALF_WIDTH_M,
  TASK_CAP_STRETCH_START,
  stepTaskCapStretch,
  taskCapStretch,
  withinTaskCapStretch,
} from "../finish";
import { parseObjectiveParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import { SC_AC_TRUCK_SPRAY } from "../scenario/templates-conditions2";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState, ObjectiveParams } from "../types";
import { gradeFinishWire, serializeRuleEvents, serializeTaskCapBreaches } from "../wire";
import { CURTAIN_OBJECTIVE_ID, makeTick } from "./fixtures";

const TASK = "TASK_SPEED_CAP_EXCEEDED";
const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
const CLEAN_TITLE = "Чисто и спокойно каране";
/** Every sentence this product has ever used to hold a drive up as clean. */
const UNSCOPED_PRAISE = /чисто каране без нито едно нарушение|задръж това ниво|чисто каране по изпитния лист|карането беше чисто по изпитния лист/u;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

// ---------------------------------------------------------------------------
// The verifier's drive harness, ported: a polyline, a speed law, 0.1 s frames.
// ---------------------------------------------------------------------------

type Edge = { maxspeed: number; geometry: number[][] };
const edgeCache = new Map<string, Edge[]>();
/** The posted limit at a point, off the committed district — the nearest edge. */
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
  flags?: Partial<SimTick>;
  accel?: number;
  decel?: number;
  handEnd?: (c: Ctx) => boolean;
  endKind?: "finish" | "abort";
  maxT?: number;
  /** The capped objective whose blow is timed (its evaluator's `approachCap`). */
  capIdx?: number;
}
interface Bill {
  code: string;
  t: number;
}
interface Out {
  naturally: boolean;
  endedAt: number;
  score: number;
  charged: Bill[];
  coached: Bill[];
  esc: number[];
  /** Every scored event's position (A15), paired by code and time. */
  positions: Array<{ code: string; t: number; x: number; y: number }>;
  /** Frame by frame: where the car was and whether the reducer saw a task stamp. */
  frames: Array<{ t: number; x: number; y: number; stamped: boolean }>;
  cards: Array<{ code: string; t: number; explanationBg: string }>;
  /** Every lesson or violation toast, with the frame it landed on (round 6, C4). */
  toasts: Array<{ kind: string; titleBg: string; t: number; explanationBg: string }>;
  /** The first frame on which the capped objective recorded `approachCap: "blown"`. */
  blow: { t: number; x: number; y: number } | null;
  debrief: string;
}

function drive(lesson: LessonSpec, o: Opts): Out {
  let s = createLessonSession(lesson);
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
  const frames: Out["frames"] = [];
  const cards: Out["cards"] = [];
  const toasts: Out["toasts"] = [];
  let blow: Out["blow"] = null;
  while (d < total && t < (o.maxT ?? 400) && s.phase === "driving") {
    t = Math.round((t + 0.1) * 10) / 10;
    const [x0, y0] = at(d);
    const target = o.speed({ d, x: x0, y: y0, t, v: v * 3.6, s }) / 3.6;
    v = v < target ? Math.min(target, v + (o.accel ?? 3) * 0.1) : Math.max(target, v - (o.decel ?? 5) * 0.1);
    d = Math.min(total, d + v * 0.1);
    const [x, y, h] = at(d);
    const posted = typeof o.posted === "number" ? o.posted : o.posted(x, y);
    const r = applyTick(
      s,
      makeTick({ t, speedKmh: v * 3.6, maxSpeedKmh: posted, position: { x, y }, headingDeg: h, ...(o.flags ?? {}) }),
    );
    s = r.state;
    const lt = (s as unknown as { lastTick?: { taskSpeedCap?: unknown } }).lastTick;
    frames.push({ t, x, y, stamped: lt?.taskSpeedCap !== undefined });
    for (const m of r.teachMoments ?? []) cards.push({ code: m.code, t: m.t, explanationBg: m.explanationBg });
    for (const h of r.hudEvents) {
      if (h.kind === "lesson" || h.kind === "violation") {
        toasts.push({ kind: h.kind, titleBg: h.titleBg, t, explanationBg: h.explanationBg });
      }
    }
    if (blow === null && o.capIdx !== undefined) {
      const st = s.evalStates[o.capIdx] as { approachCap?: string } | undefined;
      if (st?.approachCap === "blown") blow = { t, x, y };
    }
    if (o.handEnd && o.handEnd({ d, x, y, t, v: v * 3.6, s })) break;
  }
  const naturally = s.phase !== "driving";
  const ended = naturally ? s : o.endKind === "abort" ? abortSession(s, t) : finishSession(s, t);
  const result = buildLessonResult(ended);
  const debrief = buildDebrief(ended.lesson, result, { coachedMistakes: result.coachedMistakes }).text;
  return {
    naturally,
    endedAt: t,
    score: result.score,
    charged: ended.events.filter((e) => e.kind === "violation").map((e) => ({ code: e.code as string, t: e.t })),
    coached: (ended.coachedMistakes ?? []).map((c) => ({ code: c.code, t: c.t })),
    esc: ended.penaltyEscalations.map((p) => p.multiplier),
    positions: (ended.eventPositions ?? []).map((p) => ({ code: p.code as string, t: p.t, x: p.x, y: p.y })),
    frames,
    cards,
    toasts,
    blow,
    debrief,
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
const taskBills = (o: Out) => [...o.charged, ...o.coached].filter((b) => b.code === TASK);
const codes = (bills: Bill[]) => bills.map((b) => b.code);

// ROUND 4 (founder ruling 2026-09-25 «Only the named stretch»): a mark may carry
// an `id`. A capped mark that borrows `CURTAIN_OBJECTIVE_ID` names a feature
// running to its next goal (round 3's stretch); any other capped mark names only
// its own zone and binds across that zone.
function straight(id: string, marks: Array<{ y: number; cap?: number; r?: number; id?: string }>, posted: number): LessonSpec {
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
    objectives: marks.map((m, i) => ({
      id: m.id ?? `o-${i}`,
      titleBg: `Точка ${i}`,
      kind: "reachZone" as const,
      params: { x: 0, y: m.y, radiusM: m.r ?? 12, ...(m.cap !== undefined ? { maxSpeedKmh: m.cap } : {}) },
    })),
  };
}
const line = (y1: number): Array<[number, number]> => [
  [0, 15],
  [0, y1],
];

/** Any line that holds this drive up as clean without saying what it was measured over. */
function unscopedPraise(text: string): string[] {
  const out: string[] = [];
  for (const l of text.split("\n")) {
    if (UNSCOPED_PRAISE.test(l)) out.push(l);
    if (l.includes(CLEAN_TITLE) && !l.includes("но само на отделни отсечки")) out.push(l);
  }
  return out;
}

/**
 * CLEAN_DRIVING commendations whose 250 m window covers the frame the mark was
 * blown on: anything minted at or after the blow, before the car could have
 * driven a whole fresh window past it.
 */
function coveringCommendations(o: Out): Array<{ t: number; y: number }> {
  if (o.blow === null) return [];
  const b = o.blow;
  return o.positions
    .filter((p) => p.code === "CLEAN_DRIVING" && p.t >= b.t)
    .filter((p) => Math.hypot(p.x - b.x, p.y - b.y) < 245)
    .map((p) => ({ t: p.t, y: p.y }));
}

// ===========================================================================
// R1 — THE STRETCH IS A BOUNDED REGION
// ===========================================================================

describe("R1 — the ceiling stops binding on the roundabout's exit arm (sc-rb-lane-choice)", () => {
  const sp = spec("sc-rb-lane-choice");
  const posted = postedFn(sp.map.districtId);
  const base = shadowPts("sc-rb-lane-choice");
  const last = base[base.length - 1];
  const prev = base[base.length - 6];
  const n = Math.hypot(last[0] - prev[0], last[1] - prev[1]);
  const ux = (last[0] - prev[0]) / n;
  const uy = (last[1] - prev[1]) / n;
  const pts: Array<[number, number]> = [...base, [last[0] + ux * 300, last[1] + uy * 300]];
  let markD = 0;
  {
    let best = Infinity;
    let cum = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) cum += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const dd = Math.hypot(pts[i][0], pts[i][1] - 21.94);
      if (dd < best) {
        best = dd;
        markD = cum;
      }
    }
  }
  // The ring's own work site: `enterRadiusM` 33 (finish.ts O23 — the arming
  // circle CONTAINS the ring). Past it the car is on the exit arm, posted 50.
  // ROUND 5 (2026-09-26, verifier F2): the RING the task names governs, and its
  // authored outer edge is 26 + 2 lanes × 4.0625 = 34.125 (the feature table,
  // pinned by `task-cap-features.test.ts`) — 1.1 m outside the arming circle,
  // on the ring's own outer lane. «Past the ring» is past that edge.
  const outsideRing = (f: { x: number; y: number }) => Math.hypot(f.x, f.y) > 34.125 + 0.5;

  for (const lv of [1, 2, 3, 5] as ScenarioLevel[]) {
    for (const armKmh of [30, 45]) {
      it(`P1 L${lv}: blown at 32, corrected to 18 on the ring, exit arm at ${armKmh} — the arrival only, never stamped past the ring`, () => {
        const o = drive(compileScenario(sp, lv), {
          pts,
          posted,
          accel: 2,
          decel: 3,
          capIdx: 1,
          speed: (c) => {
            const r = Math.hypot(c.x, c.y);
            if (c.d < markD - 12) return r < 34 ? 24 : 30;
            if (c.d < markD + 4) return 32;
            if (c.x > -30) return 18;
            return armKmh;
          },
        });
        expect(o.blow, "the ≤20 mark must actually be blown").not.toBeNull();
        expect(o.frames.some((f) => f.stamped), "the ceiling is stamped on the ring").toBe(true);
        expect(o.frames.filter((f) => f.stamped && outsideRing(f))).toEqual([]);
        // ROUND 6 (ruling 4, the integrator's reading): the blow at 32 through
        // the ≤20 mark IS the offence — ONE taught TASK event at the blow — and
        // nothing on the exit arm bills it again (round 3 pinned [] here).
        expect(taskBills(o)).toHaveLength(1);
        expect(o.coached.filter((b) => b.code === TASK)).toHaveLength(1);
        expect(Math.abs(taskBills(o)[0].t - (o.blow as { t: number }).t)).toBeLessThanOrEqual(0.25);
      });
    }
  }

  for (const lv of [1, 3] as ScenarioLevel[]) {
    for (const armKmh of [28, 20]) {
      it(`A1 L${lv}: exit arm at ${armKmh} after a real correction on the ring — the arrival only`, () => {
        const o = drive(compileScenario(sp, lv), {
          pts: shadowPts("sc-rb-lane-choice"),
          posted,
          accel: 2,
          decel: 3,
          capIdx: 1,
          speed: (c) => {
            const r = Math.hypot(c.x, c.y);
            if (c.d < markD - 12) return r < 34 ? 24 : 30;
            if (c.d < markD + 4) return 32;
            if (c.x > -30) return 18;
            return armKmh;
          },
        });
        expect(o.blow).not.toBeNull();
        expect(o.frames.filter((f) => f.stamped && outsideRing(f))).toEqual([]);
        // ROUND 6: the arrival at the blow, taught, and nothing after it.
        expect(taskBills(o)).toHaveLength(1);
        expect(Math.abs(taskBills(o)[0].t - (o.blow as { t: number }).t)).toBeLessThanOrEqual(0.25);
      });
    }
  }
});

describe("R1 — past the junction the ≤30 approach no longer binds the priority road (sc-junction-gap)", () => {
  const sp = spec("sc-junction-gap");
  const posted = postedFn(sp.map.districtId);
  const pts = shadowPts("sc-junction-gap");
  // The next goal is the stop line's passSignal: node (4.06, −27.73), radius 45.
  const NODE = { x: 4.06, y: -27.73, r: 45 };
  for (const roadKmh of [45, 50]) {
    it(`A2 L3: blown at 45, stop at the line, then ${roadKmh} east — no stamp once the junction's own disc is behind the car`, () => {
      let stoppedFor = 0;
      const o = drive(compileScenario(sp, 3), {
        pts,
        posted,
        accel: 3,
        decel: 6,
        capIdx: 0,
        speed: (c) => {
          if (c.y < -29.5 && c.x < 5) return 45;
          if (c.y < -29 && c.x < 5 && stoppedFor < 5) {
            if (c.v < 0.5) stoppedFor += 0.1;
            return 0;
          }
          if (c.x < 10) return 15;
          return roadKmh;
        },
      });
      expect(o.blow).not.toBeNull();
      let reached = false;
      const leaked: Array<{ t: number; x: number; y: number }> = [];
      for (const f of o.frames) {
        const dd = Math.hypot(f.x - NODE.x, f.y - NODE.y);
        if (dd <= NODE.r) reached = true;
        else if (reached && f.stamped) leaked.push(f);
      }
      expect(reached).toBe(true);
      expect(leaked).toEqual([]);
    });
  }
});

// ===========================================================================
// R2 — NO FLICKER
// ===========================================================================

describe("R2 — one continuous 30 km/h round the ≤20 ring is ONE act: one teach, one charge", () => {
  const sp = spec("sc-rb-lane-choice");
  const posted = postedFn(sp.map.districtId);
  const base = shadowPts("sc-rb-lane-choice");
  let iEast = base.findIndex((p) => Math.hypot(p[0], p[1]) < 23 && p[0] > 15);
  if (iEast < 0) iEast = 0;
  for (const laps of [1, 2, 3]) {
    const ring: Array<[number, number]> = [];
    const phi0 = Math.atan2(base[iEast][1], base[iEast][0]);
    for (let k = 0; k <= 72 * laps + 36; k++) {
      const phi = phi0 + (k * Math.PI * 2) / 72;
      ring.push([21.94 * Math.cos(phi), 21.94 * Math.sin(phi)]);
    }
    const pts: Array<[number, number]> = [...base.slice(0, iEast), ...ring];
    it(`P2 L3, ${laps + 0.5} laps at 30: TASK taught once and charged once, nothing before the mark, the stamp never drops on the ring`, () => {
      const o = drive(compileScenario(sp, 3), { pts, posted, accel: 2, decel: 3, capIdx: 1, speed: () => 30 });
      expect(o.blow).not.toBeNull();
      const blowT = o.blow!.t;
      expect(codes(o.coached.filter((b) => b.code === TASK))).toEqual([TASK]);
      expect(codes(o.charged)).toEqual([TASK]);
      expect(o.score).toBe(1);
      expect(o.esc).toEqual([]);
      for (const b of taskBills(o)) expect(b.t).toBeGreaterThanOrEqual(blowT);
      // Stamped on every ring frame from the one after the blow to the end.
      const gaps = o.frames.filter((f) => f.t > blowT + 0.15 && Math.hypot(f.x, f.y) <= 32 && !f.stamped);
      expect(gaps).toEqual([]);
    });
  }
});

// ===========================================================================
// R3 — THE SETTLEMENT BILLS A CODE ONLY AFTER ITS OWN TEACH
// ===========================================================================

describe("R3 — a driver braking back toward the cap when the drive ends, never taught TASK, is never settled", () => {
  const pts = line(2400);
  for (const lv of [1, 3] as ScenarioLevel[]) {
    for (const endAtKmh of [110, 95, 88, 86, null]) {
      it(`P3 L${lv}: 125 in the rain, through the ≤80 mark at 125, braking to 75 — end at ≤${endAtKmh ?? "never"}: no TASK`, () => {
        let braking = false;
        const o = drive(compileScenario(SC_AC_TRUCK_SPRAY, lv), {
          pts,
          posted: 140,
          flags: { rain: true, motorway: true },
          accel: 4,
          decel: 6,
          capIdx: 0,
          speed: (c) => {
            if (c.y >= 452) braking = true;
            return braking ? 75 : 125;
          },
          handEnd: (c) => endAtKmh !== null && braking && c.v <= endAtKmh,
          maxT: endAtKmh === null ? 60 : 400,
        });
        expect(o.blow).not.toBeNull();
        expect(codes(o.coached)).toContain(COND);
        expect(codes(o.charged)).not.toContain(TASK);
        expect(o.score).toBe(0);
      });
    }
  }

  const lesson = straight("t-a3", [{ y: 450, cap: 80 }, { y: 3000 }], 140);
  for (const endAfter of [0.6, 1.2, 2.0, 2.8]) {
    it(`A3: 125 through the mark (the conditions code named the act), then 100 — hand-end ${endAfter}s after the mark: nothing settled`, () => {
      let tMark: number | null = null;
      const o = drive(lesson, {
        pts: line(3200),
        posted: 140,
        flags: { rain: true },
        accel: 4,
        decel: 6,
        speed: (c) => (c.y < 452 ? 125 : 100),
        handEnd: (c) => {
          if (tMark === null && c.y >= 450) tMark = c.t;
          return tMark !== null && c.t - tMark >= endAfter;
        },
      });
      expect(codes(o.charged)).toEqual([]);
      expect(o.score).toBe(0);
    });
  }

  it("POSITIVE CONTROL — taught at 110 (dry), then hand-ended once the task's own 3 s have run, still at 110: the task's own withheld charge IS settled", () => {
    // ROUND 6: the card is now the ARRIVAL, at the blow; the sustained episode's
    // own first bill (absorbed into the act the arrival named) lands 3 s later,
    // and R3's rule — settle only after the code's own episode billed — is read
    // off that. So the hand-end is 5 s after the card (was 2 s after a card that
    // itself came 3 s after the mark). The +2 s ending is pinned just below.
    let taughtAt: number | null = null;
    const o = drive(compileScenario(SC_AC_TRUCK_SPRAY, 3), {
      pts,
      posted: 140,
      flags: { motorway: true },
      accel: 4,
      decel: 6,
      capIdx: 0,
      speed: () => 110,
      handEnd: (c) => {
        if (taughtAt === null && (c.s.coachedMistakes ?? []).some((m) => m.code === TASK)) taughtAt = c.t;
        return taughtAt !== null && c.t - taughtAt >= 5;
      },
    });
    expect(codes(o.coached)).toEqual([TASK]);
    expect(codes(o.charged)).toEqual([TASK]);
  });

  it("ROUND 6 — hand-ended 2 s after the ARRIVAL card, still at 110: not settled — the sustained episode's own 3 s have not run (R3 unchanged)", () => {
    let taughtAt: number | null = null;
    const o = drive(compileScenario(SC_AC_TRUCK_SPRAY, 3), {
      pts,
      posted: 140,
      flags: { motorway: true },
      accel: 4,
      decel: 6,
      capIdx: 0,
      speed: () => 110,
      handEnd: (c) => {
        if (taughtAt === null && (c.s.coachedMistakes ?? []).some((m) => m.code === TASK)) taughtAt = c.t;
        return taughtAt !== null && c.t - taughtAt >= 2;
      },
    });
    expect(codes(o.coached)).toEqual([TASK]);
    expect(codes(o.charged)).toEqual([]);
  });
});

// ===========================================================================
// R4 — NO PRAISE AFTER A BREACHED CAP, INCLUDING A SUB-SUSTAIN BREACH AT THE MARK
// ===========================================================================

describe("R4 — a mark the objective itself marks blown is never followed by unscoped praise", () => {
  const pts = line(2400);
  const profiles: Array<[number, number, boolean]> = [
    [100, 78, false],
    [100, 78, true],
    [95, 75, true],
    [88, 83, true],
    [92, 84, true],
  ];
  for (const lv of [1, 3] as ScenarioLevel[]) {
    for (const [mark, after, rain] of profiles) {
      it(`P4 L${lv}: ${mark} through the ≤80 mark, then ${after}${rain ? " (rain)" : " (dry)"} — no commendation covers the mark, no unscoped praise`, () => {
        const o = drive(compileScenario(SC_AC_TRUCK_SPRAY, lv), {
          pts,
          posted: 140,
          flags: { ...(rain ? { rain: true } : {}), motorway: true },
          accel: 3,
          decel: 7,
          capIdx: 0,
          speed: (c) => (c.y < 458 ? mark : after),
        });
        // Non-vacuity: every L3 profile blows the ≤80 mark (bill line 85), and
        // at L1 (the widened gate) so does every profile over the widened line.
        if (lv === 3) expect(o.blow).not.toBeNull();
        if (o.blow === null) return;
        expect(codes(o.charged)).toEqual([]);
        expect(coveringCommendations(o)).toEqual([]);
        expect(unscopedPraise(o.debrief)).toEqual([]);
        for (const l of o.debrief.split("\n").filter((x) => x.includes(CLEAN_TITLE))) {
          expect(l).toContain("мина над тавана на задачата");
        }
      });
    }
  }

  for (const [markKmh, after] of [
    [95, 78],
    [100, 75],
  ] as Array<[number, number]>) {
    it(`A7: ≤80 at y 450 on a dry 140 — ${markKmh} through the mark, ${after} from 5 m past it: the same`, () => {
      const o = drive(straight("t-a7", [{ y: 450, cap: 80 }, { y: 1500 }], 140), {
        pts: line(1600),
        posted: 140,
        decel: 7,
        capIdx: 0,
        speed: (c) => (c.y < 455 ? markKmh : after),
      });
      expect(o.blow).not.toBeNull();
      expect(coveringCommendations(o)).toEqual([]);
      expect(unscopedPraise(o.debrief)).toEqual([]);
    });
  }

  it("CONTROL — the same drive braked to 78 BEFORE the mark is never blown, and its praise stands unqualified", () => {
    const o = drive(straight("t-a7c", [{ y: 450, cap: 80 }, { y: 1500 }], 140), {
      pts: line(1600),
      posted: 140,
      decel: 7,
      capIdx: 0,
      speed: (c) => (c.y < 380 ? 100 : 78),
    });
    expect(o.blow).toBeNull();
    const clean = o.debrief.split("\n").filter((x) => x.includes(CLEAN_TITLE));
    expect(clean.length).toBeGreaterThan(0);
    for (const l of clean) expect(l).not.toContain("но само на отделни отсечки");
  });
});

// ===========================================================================
// C1 / C2 — DRIVES WITH NO TASK CAP GRADE EXACTLY AS BASE
// ===========================================================================

/**
 * The verifier's no-cap set, pinned to what BASE (4112566) produced for each
 * drive — score, the full event stream, the coached rows, the escalation count,
 * and SHA-256 prefixes of the whole debrief text and of every teach card
 * (`nocap-base.jsonl`). Byte-identity, not resemblance: round 2 changed three
 * of these (a conditions settlement at a hand end/abort, and a praise scope for
 * a taught weather breach) on drives that never had a cap.
 *
 * ROUND 4 — THE FOUNDER ANSWERED, «Yes, same as speeding» (2026-09-25), and
 * those SAME THREE drives now move, deliberately and only they: a weather
 * overspeed TAUGHT at 48.5 s and still running at the hand-end / abort 2 s later
 * is settled (0 → 1 point, the regrade-marked bill at 50.6 s), and the drive
 * that was taught and corrected keeps its eight commendations SCOPED («…кара
 * по-бързо, отколкото позволяват условията (виж «Учебни моменти»)»). Their pins
 * below are the round-4 values (`ROUND4_RULING3` marks them); the other
 * thirteen — every lawful drive among them — are byte-identical to base still.
 */
const ROUND4_RULING3 = new Set([
  "rain 100 then 125, hand-end 2 s after the conditions teach",
  "rain 100 then 125, abort 2 s after the conditions teach",
  "rain 100, 125 for ~150 m, back to 100 (corrected, never charged), long",
]);
const NOCAP_BASE: Record<
  string,
  { score: number; events: string[]; coached: string[]; esc: number; debrief: string; cards: string }
> = {
  "dry 45/50 natural": { score: 0, events: ["commendation:CLEAN_DRIVING@22.10","commendation:CLEAN_DRIVING@42.10","commendation:CLEAN_DRIVING@62.10"], coached: [], esc: 0, debrief: "92648da0e1e52b46", cards: "4f53cda18c2baa0c" },
  "dry 59/50 natural": { score: 3, events: ["violation:SPEEDING_OVER_LIMIT@13.10R","violation:SPEEDING_OVER_LIMIT@27.10","violation:SPEEDING_OVER_LIMIT@47.10"], coached: ["SPEEDING_OVER_LIMIT@7.10"], esc: 2, debrief: "72b60f3ff25b4b40", cards: "62368943117b76c6" },
  "dry 59/50 hand-end 2s after teach-ish": { score: 1, events: ["violation:SPEEDING_OVER_LIMIT@13.10R"], coached: ["SPEEDING_OVER_LIMIT@7.10"], esc: 0, debrief: "e91316510738ee55", cards: "62368943117b76c6" },
  "rain 125/140 natural long": { score: 1, events: ["violation:SPEED_TOO_FAST_FOR_CONDITIONS@20.10R"], coached: ["SPEED_TOO_FAST_FOR_CONDITIONS@14.10"], esc: 0, debrief: "fdfc0ef05895da91", cards: "0a35a872dbfa6e03" },
  "rain 125/140 hand-end at 20s": { score: 1, events: ["violation:SPEED_TOO_FAST_FOR_CONDITIONS@20.10R"], coached: ["SPEED_TOO_FAST_FOR_CONDITIONS@14.10"], esc: 0, debrief: "0a796a8e1548483b", cards: "0a35a872dbfa6e03" },
  "rain 125/140 abort at 20s": { score: 1, events: ["violation:SPEED_TOO_FAST_FOR_CONDITIONS@20.10R"], coached: ["SPEED_TOO_FAST_FOR_CONDITIONS@14.10"], esc: 0, debrief: "d2bc5e4f1d78bbc0", cards: "0a35a872dbfa6e03" },
  "rain 125/140 natural end 2s after teach": { score: 1, events: ["violation:SPEED_TOO_FAST_FOR_CONDITIONS@20.10R"], coached: ["SPEED_TOO_FAST_FOR_CONDITIONS@14.10"], esc: 0, debrief: "fdfc0ef05895da91", cards: "0a35a872dbfa6e03" },
  "rain 100/140 then 125 late, finish at y 1500": { score: 1, events: ["commendation:CLEAN_DRIVING@13.60","commendation:CLEAN_DRIVING@22.60","commendation:CLEAN_DRIVING@31.60","commendation:CLEAN_DRIVING@40.60","violation:SPEED_TOO_FAST_FOR_CONDITIONS@54.50R"], coached: ["SPEED_TOO_FAST_FOR_CONDITIONS@48.50"], esc: 0, debrief: "a1ba8a6201243956", cards: "6065d51a8d815ff9" },
  "fog 40/50 natural": { score: 2, events: ["violation:SPEED_TOO_FAST_FOR_CONDITIONS@11.80R","violation:FOG_LIGHTS_OFF_IN_FOG@13.50R"], coached: ["FOG_LIGHTS_OFF_IN_FOG@3.50","SPEED_TOO_FAST_FOR_CONDITIONS@5.80"], esc: 0, debrief: "091e51b4f9146a8d", cards: "d3c90e776322b13d" },
  "fog 40/50 hand-end 16s": { score: 2, events: ["violation:SPEED_TOO_FAST_FOR_CONDITIONS@11.80R","violation:FOG_LIGHTS_OFF_IN_FOG@13.50R"], coached: ["FOG_LIGHTS_OFF_IN_FOG@3.50","SPEED_TOO_FAST_FOR_CONDITIONS@5.80"], esc: 0, debrief: "238f9f2a788ebd30", cards: "d3c90e776322b13d" },
  "snow 30/50 natural": { score: 1, events: ["violation:SPEED_TOO_FAST_FOR_CONDITIONS@11.40R"], coached: ["SPEED_TOO_FAST_FOR_CONDITIONS@5.40"], esc: 0, debrief: "fdfc0ef05895da91", cards: "bb548482a1c9ab3a" },
  "night 50/50": { score: 0, events: ["commendation:CLEAN_DRIVING@20.30","commendation:CLEAN_DRIVING@38.30","commendation:CLEAN_DRIVING@56.30"], coached: [], esc: 0, debrief: "92648da0e1e52b46", cards: "4f53cda18c2baa0c" },
  // ROUND 4 (ruling «Yes, same as speeding») — base was score 0, debrief 47074b069ddedc23:
  "rain 100 then 125, hand-end 2 s after the conditions teach": { score: 1, events: ["commendation:CLEAN_DRIVING@13.60","commendation:CLEAN_DRIVING@22.60","commendation:CLEAN_DRIVING@31.60","commendation:CLEAN_DRIVING@40.60","violation:SPEED_TOO_FAST_FOR_CONDITIONS@50.60R"], coached: ["SPEED_TOO_FAST_FOR_CONDITIONS@48.50"], esc: 0, debrief: "6c64d8c224064566", cards: "6065d51a8d815ff9" },
  // ROUND 4 (ruling «Yes, same as speeding») — base was score 0, debrief 01b0487cb6f13152:
  "rain 100 then 125, abort 2 s after the conditions teach": { score: 1, events: ["commendation:CLEAN_DRIVING@13.60","commendation:CLEAN_DRIVING@22.60","commendation:CLEAN_DRIVING@31.60","commendation:CLEAN_DRIVING@40.60","violation:SPEED_TOO_FAST_FOR_CONDITIONS@50.60R"], coached: ["SPEED_TOO_FAST_FOR_CONDITIONS@48.50"], esc: 0, debrief: "39a804266f679edd", cards: "6065d51a8d815ff9" },
  // ROUND 4 (ruling «Yes, same as speeding») — the praise is scoped; base debrief was c165feb9e491bca7:
  "rain 100, 125 for ~150 m, back to 100 (corrected, never charged), long": { score: 0, events: ["commendation:CLEAN_DRIVING@13.60","commendation:CLEAN_DRIVING@22.60","commendation:CLEAN_DRIVING@31.60","commendation:CLEAN_DRIVING@40.60","commendation:CLEAN_DRIVING@57.50","commendation:CLEAN_DRIVING@66.50","commendation:CLEAN_DRIVING@75.50","commendation:CLEAN_DRIVING@84.50"], coached: ["SPEED_TOO_FAST_FOR_CONDITIONS@48.50"], esc: 0, debrief: "b61c2ac028dd6b7d", cards: "6065d51a8d815ff9" },
  "rain lawful 110/140": { score: 0, events: ["commendation:CLEAN_DRIVING@13.30","commendation:CLEAN_DRIVING@21.50","commendation:CLEAN_DRIVING@29.60","commendation:CLEAN_DRIVING@37.80","commendation:CLEAN_DRIVING@46.00"], coached: [], esc: 0, debrief: "cd0ee6054a1a68f6", cards: "4f53cda18c2baa0c" },
};

function nocapLesson(posted: number, endY: number): LessonSpec {
  return {
    id: "t-nocap",
    order: 1,
    titleBg: "Без таван",
    descriptionBg: "",
    conceptIds: [],
    postedLimitKmh: posted,
    spawn: { position: { x: 0, y: 15 }, headingDeg: 0 },
    preDrive: false,
    vehicleStart: "ready",
    objectives: [
      { id: "o-a", titleBg: "Точка", kind: "reachZone", params: { x: 0, y: 400, radiusM: 12 } },
      { id: "o-b", titleBg: "Край", kind: "reachZone", params: { x: 0, y: endY, radiusM: 12 } },
    ],
  };
}
function nocapRun(o: {
  posted: number;
  endY: number;
  flags?: Partial<SimTick>;
  speed: (y: number, t: number) => number;
  end?: "finish" | "abort";
  endAt?: (y: number, t: number) => boolean;
}) {
  let s = createLessonSession(nocapLesson(o.posted, o.endY));
  let y = 15;
  let v = 0;
  let t = 0;
  const cards: string[] = [];
  while (s.phase === "driving" && t < 300) {
    t = Math.round((t + 0.1) * 10) / 10;
    const target = o.speed(y, t) / 3.6;
    v = v < target ? Math.min(target, v + 0.3) : Math.max(target, v - 0.5);
    y += v * 0.1;
    const r = applyTick(s, {
      t,
      speedKmh: v * 3.6,
      maxSpeedKmh: o.posted,
      position: { x: 0, y },
      headingDeg: 0,
      laneOffsetM: 0,
      laneId: 0,
      indicator: "off",
      headlights: "low",
      seatbeltOn: true,
      handbrakeOn: false,
      gear: 1,
      isNight: false,
      events: [],
      ...(o.flags ?? {}),
    } as SimTick);
    s = r.state;
    for (const m of r.teachMoments ?? []) cards.push(`${m.code}@${m.t.toFixed(1)}|${m.explanationBg}`);
    if (o.endAt && o.endAt(y, t)) break;
  }
  const ended = s.phase !== "driving" ? s : o.end === "abort" ? abortSession(s, t) : finishSession(s, t);
  const result = buildLessonResult(ended);
  const debrief = buildDebrief(ended.lesson, result, { coachedMistakes: result.coachedMistakes }).text;
  const h = (x: string) => createHash("sha256").update(x).digest("hex").slice(0, 16);
  return {
    score: result.score,
    events: ended.events.map(
      (e) => `${e.kind}:${e.code}@${e.t.toFixed(2)}${(e as { regrade?: boolean }).regrade ? "R" : ""}`,
    ),
    coached: (ended.coachedMistakes ?? []).map((c) => `${c.code}@${c.t.toFixed(2)}`),
    esc: ended.penaltyEscalations.length,
    debrief: h(debrief),
    cards: h(JSON.stringify(cards)),
  };
}

describe("C1/C2 — a drive with no task cap is graded, carded and debriefed exactly as base (round 4: except ruling 3's three taught-overspeed drives)", () => {
  const runs: Array<[string, Parameters<typeof nocapRun>[0]]> = [
    ["dry 45/50 natural", { posted: 50, endY: 800, speed: () => 45 }],
    ["dry 59/50 natural", { posted: 50, endY: 800, speed: () => 59 }],
    ["dry 59/50 hand-end 2s after teach-ish", { posted: 50, endY: 5000, speed: () => 59, endAt: (_y, t) => t > 16 }],
    ["rain 125/140 natural long", { posted: 140, endY: 2500, flags: { rain: true }, speed: () => 125 }],
    ["rain 125/140 hand-end at 20s", { posted: 140, endY: 5000, flags: { rain: true }, speed: () => 125, endAt: (_y, t) => t > 20 }],
    ["rain 125/140 abort at 20s", { posted: 140, endY: 5000, flags: { rain: true }, speed: () => 125, end: "abort", endAt: (_y, t) => t > 20 }],
    ["rain 125/140 natural end 2s after teach", { posted: 140, endY: 560, flags: { rain: true }, speed: () => 125 }],
    ["rain 100/140 then 125 late, finish at y 1500", { posted: 140, endY: 1500, flags: { rain: true }, speed: (y) => (y < 1100 ? 100 : 125) }],
    ["fog 40/50 natural", { posted: 50, endY: 800, flags: { fog: true }, speed: () => 40 }],
    ["fog 40/50 hand-end 16s", { posted: 50, endY: 5000, flags: { fog: true }, speed: () => 40, endAt: (_y, t) => t > 16 }],
    ["snow 30/50 natural", { posted: 50, endY: 700, flags: { snow: true }, speed: () => 30 }],
    ["night 50/50", { posted: 50, endY: 800, flags: { isNight: true }, speed: () => 50 }],
    ["rain 100 then 125, hand-end 2 s after the conditions teach", { posted: 140, endY: 5000, flags: { rain: true }, speed: (y) => (y < 1100 ? 100 : 125), endAt: (_y, t) => t > 50.5 }],
    ["rain 100 then 125, abort 2 s after the conditions teach", { posted: 140, endY: 5000, flags: { rain: true }, speed: (y) => (y < 1100 ? 100 : 125), end: "abort", endAt: (_y, t) => t > 50.5 }],
    ["rain 100, 125 for ~150 m, back to 100 (corrected, never charged), long", { posted: 140, endY: 2500, flags: { rain: true }, speed: (y) => (y < 1100 ? 100 : y < 1250 ? 125 : 100) }],
    ["rain lawful 110/140", { posted: 140, endY: 1500, flags: { rain: true }, speed: () => 110 }],
  ];
  it("the pin table covers every drive of the verifier's no-cap set", () => {
    expect(Object.keys(NOCAP_BASE).sort()).toEqual(runs.map((r) => r[0]).sort());
    // Round 4 moved exactly three pins, and each is a drive with a TAUGHT
    // weather overspeed (a coached conditions row) — no lawful drive moved.
    expect(ROUND4_RULING3.size).toBe(3);
    for (const tag of ROUND4_RULING3) expect(NOCAP_BASE[tag].coached).toEqual(["SPEED_TOO_FAST_FOR_CONDITIONS@48.50"]);
  });
  for (const [tag, run] of runs) {
    it(tag, () => {
      expect(nocapRun(run)).toEqual(NOCAP_BASE[tag]);
    });
  }
});

// ===========================================================================
// C3 — A SEPARATE WEATHER BREACH IS NEVER SWALLOWED WITHOUT ITS CARD
// ===========================================================================

describe("C3 — an act held open in the task's grace band does not silently absorb a later weather breach", () => {
  // rain, posted 140, ≤80 at 450: 110 through the mark (TASK taught + charged),
  // then 83 (over the shown 80, inside the 85 bill line: the task episode is
  // neither accruing nor corrected) for ~60 s, then 125 (over the 119 envelope).
  const prof = (c: Ctx) => (c.y < 1100 ? 110 : c.y < 2500 ? 83 : 125);
  it("CONTROL — the same drive with no cap is taught and charged the conditions code (base)", () => {
    const o = drive(straight("t-a6c", [{ y: 450 }, { y: 6000 }], 140), {
      pts: line(3300),
      posted: 140,
      flags: { rain: true },
      speed: prof,
    });
    expect(codes(o.coached)).toEqual([COND]);
    expect(codes(o.charged)).toEqual([COND]);
  });
});

// ===========================================================================
// GUARDS THAT HELD ON ROUND 2 AND MUST KEEP HOLDING (P5, A4, A5)
// ===========================================================================

describe("guards — never two charges for one act, however long the dip (P5, dry)", () => {
  const pts = line(2400);
  // ROUND 6 (ruling 4, the integrator's reading): the arrival and every over-cap
  // stretch that follows it on the named feature are ONE act, so a held
  // correction on the curtain no longer separates acts. The 8 s dip used to end
  // the act with the car too far down the curtain to open another; the card now
  // lands at the blow, 3 s earlier, the second 110 stretch is on the curtain,
  // and the act's ONE charge is settled at the route's end while still over
  // (round 3 pinned 0 here). «Never two for one act» holds for every hold.
  const expected: Record<string, number> = { "1.5": 1, "3": 1, "5": 1, "8": 1 };
  for (const holdSec of [1.5, 3, 5, 8]) {
    it(`L3: 110, dip to 75 held ${holdSec}s, 110 again — ${expected[String(holdSec)]} charge(s), never two for one act`, () => {
      let taughtAt: number | null = null;
      let dipStart: number | null = null;
      const o = drive(compileScenario(SC_AC_TRUCK_SPRAY, 3), {
        pts,
        posted: 140,
        flags: { motorway: true },
        accel: 4,
        decel: 7,
        capIdx: 0,
        speed: (c) => {
          if (taughtAt === null && (c.s.coachedMistakes ?? []).some((m) => m.code === TASK)) taughtAt = c.t;
          if (taughtAt === null) return 110;
          if (c.t < taughtAt + 1) return 110;
          if (dipStart === null && c.v <= 75.01) dipStart = c.t;
          if (dipStart === null || c.t < dipStart + holdSec) return 75;
          return 110;
        },
      });
      expect(codes(o.coached)).toEqual([TASK]);
      expect(o.charged.filter((b) => b.code === TASK).length).toBe(expected[String(holdSec)]);
    });
  }
});

describe("guards — lawful corrections before a hand-end are never settled (A4)", () => {
  const cases: Array<[string, number, number, Record<number, number>]> = [
    ["back to 80, end 0.5 s later", 80, 0.5, { 1: 0, 3: 0 }],
    ["back to 84, end 3 s later", 84, 3, { 1: 0, 3: 0 }],
    ["back to 79, end 10 s later", 79, 10, { 1: 0, 3: 0 }],
    // ROUND 15 (founder ruling 2026-10-03 «LIKE A SPEED SIGN»): 88 is over BOTH rungs' line now — the glass figure (80)
    // plus the sign's tolerance (5) on every rung; L1's widened gate (85 + 5 = 90) no longer moves the bill line.
    ["still at 88, end 3 s later (over the glass figure's line, 85, on every rung)", 88, 3, { 1: 1, 3: 1 }],
  ];
  for (const lv of [1, 3] as ScenarioLevel[]) {
    for (const [label, backTo, holdAfter, want] of cases) {
      it(`L${lv}: taught at 110, then ${label}`, () => {
        let tBack: number | null = null;
        let taught = false;
        const o = drive(compileScenario(SC_AC_TRUCK_SPRAY, lv), {
          pts: line(2400),
          posted: 140,
          flags: { rain: true, motorway: true },
          accel: 3,
          decel: 6,
          speed: (c) => {
            if (!taught && (c.s.coachedMistakes ?? []).some((m) => m.code === TASK)) taught = true;
            return taught ? backTo : 110;
          },
          handEnd: (c) => {
            if (taught && tBack === null && c.v <= backTo + 0.01) tBack = c.t;
            return tBack !== null && c.t - tBack >= holdAfter;
          },
        });
        expect(codes(o.coached)).toEqual([TASK]);
        expect(o.score).toBe(want[lv]);
      });
    }
  }
});

describe("guards — the stretch ends at the next goal's far edge on a straight road (A5)", () => {
  // ROUND 4 (founder ruling 2026-09-25 «Only the named stretch»). The region to
  // the next goal is now the OUTER bound only. A mark that names nothing beyond
  // its own zone binds across that zone (r 12 past a blow at the mark ≈ 1 s at
  // 45) — never long enough to teach — whatever the next goal:
  // ROUND 5 (2026-09-26, founder ruling «Bill the arrival»): …and such a mark
  // is an ARRIVAL cap, so passing it at 45 over ≤30 is itself the offence — ONE
  // event at the blow, taught (the topic's first encounter), never charged, and
  // the same one whatever the next goal (the stretch still never teaches).
  for (const nextY of [240, 280, 320, 360, 420]) {
    it(`≤30 at y 200 on a 50 street, next goal y ${nextY}, 45 throughout — a zone: ONE TASK row, the arrival, taught at the blow`, () => {
      const o = drive(straight("t-a5", [{ y: 200, cap: 30 }, { y: nextY }, { y: 1500 }], 50), {
        pts: line(900),
        posted: 50,
        accel: 3,
        speed: () => 45,
      });
      expect(o.charged.filter((b) => b.code === TASK)).toEqual([]);
      const taught = o.coached.filter((b) => b.code === TASK);
      expect(taught.length).toBe(1);
      const at = o.frames.find((f) => f.t === taught[0].t)!;
      expect(at.y).toBeGreaterThanOrEqual(200);
      expect(at.y).toBeLessThan(212);
    });
  }
  // …and a mark whose named feature runs past its next goal (the curtain id)
  // keeps round 3's measured table: the region still ends at the next goal's
  // far edge.
  const want: Record<number, { charged: number; coached: number }> = {
    240: { charged: 0, coached: 1 },
    280: { charged: 0, coached: 1 },
    320: { charged: 1, coached: 1 },
    360: { charged: 1, coached: 1 },
    420: { charged: 1, coached: 1 },
  };
  for (const nextY of [240, 280, 320, 360, 420]) {
    it(`≤30 at y 200 on a 50 street, next goal y ${nextY}, 45 throughout — a feature to the next goal: round 3's table`, () => {
      const o = drive(
        straight("t-a5g", [{ y: 200, cap: 30, id: CURTAIN_OBJECTIVE_ID }, { y: nextY }, { y: 1500 }], 50),
        {
          pts: line(900),
          posted: 50,
          accel: 3,
          speed: () => 45,
        },
      );
      expect(o.charged.filter((b) => b.code === TASK).length).toBe(want[nextY].charged);
      expect(o.coached.filter((b) => b.code === TASK).length).toBe(want[nextY].coached);
    });
  }
  it("a breach that begins 5 m past the stretch's far end is never TASK", () => {
    const o = drive(straight("t-a5b", [{ y: 200, cap: 30 }, { y: 300 }, { y: 1500 }], 50), {
      pts: line(900),
      posted: 50,
      accel: 3,
      speed: (c) => (c.y < 190 ? 45 : c.y < 317 ? 30 : 45),
    });
    expect(taskBills(o)).toEqual([]);
  });
});

// ===========================================================================
// R1 — THE REGION ITSELF (finish.ts taskCapStretch / stepTaskCapStretch)
// ===========================================================================

describe("R1 — the stretch's region: the goal's own AREA, the road to it, and spent once left", () => {
  const W = TASK_CAP_CORRIDOR_HALF_WIDTH_M;
  it("the corridor's half-width is one and a half lane pitches (8.125 m each)", () => {
    expect(W).toBeCloseTo(12.1875, 6);
  });

  it("a roundabout goal is its ARMING circle, never the centre with radius 0 (sc-rb-lane-choice)", () => {
    const lesson = compileScenario(spec("sc-rb-lane-choice"), 3);
    const params = lesson.objectives.map((o) => parseObjectiveParams(o));
    // Round 5: the REGION is asked for explicitly (`{ kind: "goal" }`) — a ring
    // row in the feature table is an AREA and no longer goes through it.
    const st = taskCapStretch(params, 1, { x: 8, y: 20 }, { kind: "goal" })!;
    expect(st.goal).toEqual({ x: 0, y: 0, radiusM: 33 });
    // Anywhere on the ring is inside — before AND after the north mark — and the
    // exit arm past the arming circle is not.
    for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const a = (deg * Math.PI) / 180;
      expect(withinTaskCapStretch(st, { x: 21.94 * Math.cos(a), y: 21.94 * Math.sin(a) }), `ring ${deg}°`).toBe(true);
    }
    expect(withinTaskCapStretch(st, { x: -40, y: 12 })).toBe(false);
    expect(withinTaskCapStretch(st, { x: -75, y: 12 })).toBe(false);
  });

  it("a turn box is its circumradius; a bay is its finish disc", () => {
    const mark: ObjectiveParams = { kind: "reachZone", x: 4.06, y: 250, radiusM: 6, maxSpeedKmh: 40 };
    const turn = {
      kind: "completeManeuver",
      maneuver: "threePointTurn",
      corridor: { x: 0, y: 280, halfWidthM: 15, halfLengthM: 20 },
      startHeadingDeg: 0,
      toleranceDeg: 20,
      holdSec: 0.6,
    } as unknown as ObjectiveParams;
    // Round 5: the region, asked for explicitly (a bare mark is its own zone now).
    expect(taskCapStretch([mark, turn], 0, { x: 4.06, y: 240 }, { kind: "goal" })!.goal).toEqual({ x: 0, y: 280, radiusM: 25 });
    const bay = {
      kind: "completeManeuver",
      maneuver: "parkInBay",
      bay: { x: 10, y: 300, headingDeg: 0, lengthM: 6, widthM: 3 },
    } as unknown as ObjectiveParams;
    expect(taskCapStretch([mark, bay], 0, { x: 4.06, y: 240 }, { kind: "goal" })!.goal.radiusM).toBe(FINISH_BAY_RADIUS_M);
  });

  it("a goal off to one side (a turn): the widened triangle mark–corner–goal, never behind the mark, never past the corner or down the crossing street", () => {
    // Approach east along y = −4.06; the goal is 41 m south of the corner.
    const mark: ObjectiveParams = { kind: "reachZone", x: -22, y: -4.06, radiusM: 9, maxSpeedKmh: 35 };
    const goal: ObjectiveParams = { kind: "reachZone", x: -4.06, y: -45, radiusM: 10 };
    const st = taskCapStretch([mark, goal], 0, { x: -40, y: -4.06 }, { kind: "goal" })!;
    expect(st.corner?.x).toBeCloseTo(-4.06, 6);
    expect(st.corner?.y).toBeCloseTo(-4.06, 6);
    expect(withinTaskCapStretch(st, { x: -10, y: -4.06 })).toBe(true); // along the approach
    expect(withinTaskCapStretch(st, { x: -2, y: -8 })).toBe(true); // through the turn
    expect(withinTaskCapStretch(st, { x: -4.06, y: -30 })).toBe(true); // down the goal leg
    expect(withinTaskCapStretch(st, { x: -23, y: -4.06 })).toBe(false); // behind the mark
    expect(withinTaskCapStretch(st, { x: 30, y: -4.06 })).toBe(false); // straight on past the corner
    expect(withinTaskCapStretch(st, { x: -4.06, y: 30 })).toBe(false); // the crossing street the other way
  });

  it("a bend from the mark round to the goal lies inside the triangle (sc-sp-curve's shadow, mark to finish)", () => {
    const lesson = compileScenario(spec("sc-sp-curve"), 3);
    const params = lesson.objectives.map((o) => parseObjectiveParams(o));
    const idx = lesson.objectives.findIndex((o) => o.id === "sc-spcv-curve");
    const cap = params[idx] as Extract<ObjectiveParams, { kind: "reachZone" }>;
    const samples = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "content", "traces", "sc-sp-curve", "shadow-correct.trace.json"), "utf-8"),
    ).samples as Array<{ x: number; y: number }>;
    let iMark = 0;
    samples.forEach((p, i) => {
      if (Math.hypot(p.x - cap.x, p.y - cap.y) < Math.hypot(samples[iMark].x - cap.x, samples[iMark].y - cap.y)) iMark = i;
    });
    let iA = iMark;
    while (iA > 0 && Math.hypot(samples[iA].x - cap.x, samples[iA].y - cap.y) < 8) iA--;
    // The REGION alone (round 4: `{ kind: "goal" }` — no feature end inside it).
    const st = taskCapStretch(params, idx, samples[iA], { kind: "goal" })!;
    expect(st.corner).not.toBeNull();
    let progress = TASK_CAP_STRETCH_START;
    const outside: Array<{ x: number; y: number }> = [];
    for (let i = iMark + 1; i < samples.length && !progress.reached; i++) {
      const s = stepTaskCapStretch(st, progress, samples[i]);
      progress = s.progress;
      if (!s.inside) outside.push(samples[i]);
    }
    expect(outside).toEqual([]);
    expect(progress.reached).toBe(true);
  });

  it("SPENT for good: once the car has left the goal behind, and once it has left the region before reaching it", () => {
    const mark: ObjectiveParams = { kind: "reachZone", x: 0, y: 200, radiusM: 12, maxSpeedKmh: 30 };
    const next: ObjectiveParams = { kind: "reachZone", x: 0, y: 300, radiusM: 12 };
    // The REGION alone (round 4: `{ kind: "goal" }` — no feature end inside it).
    const st = taskCapStretch([mark, next], 0, { x: 0, y: 150 }, { kind: "goal" })!;
    let p = TASK_CAP_STRETCH_START;
    const walk = (pts: Array<[number, number]>) =>
      pts.map(([x, y]) => {
        const s = stepTaskCapStretch(st, p, { x, y });
        p = s.progress;
        return s.inside;
      });
    // Through the goal and out the far side, then back into it (a U-turn): spent.
    expect(
      walk([
        [0, 210],
        [0, 295],
        [0, 312.5],
        [0, 305],
        [0, 250],
      ]),
    ).toEqual([true, true, false, false, false]);
    // Into the goal and straight back out of it INTO the corridor (a U-turn in
    // the goal's own area, driving back toward the mark): spent on leaving the
    // goal, although the corridor would contain the car.
    p = TASK_CAP_STRETCH_START;
    expect(
      walk([
        [0, 210],
        [0, 295],
        [0, 282],
        [0, 250],
      ]),
    ).toEqual([true, true, false, false]);
    // Out sideways (a side street) before the goal: spent, and never re-bound.
    p = TASK_CAP_STRETCH_START;
    expect(
      walk([
        [0, 210],
        [20, 230],
        [0, 250],
        [0, 300],
      ]),
    ).toEqual([true, false, false, false]);
  });
});

// ===========================================================================
// R2 / R4 — THE LATCH AND ITS BREACH RECORD
// ===========================================================================

/** The spray at L3, 100 through the ≤80 mark and 78 from 8 m past it (P4). */
function sprayBlownThen78() {
  let s = createLessonSession(compileScenario(SC_AC_TRUCK_SPRAY, 3));
  let y = 15;
  let v = 0;
  let t = 0;
  for (let i = 1; i <= 700 && s.phase === "driving"; i++) {
    t = i / 10;
    const target = (y < 458 ? 100 : 78) / 3.6;
    v = v < target ? Math.min(target, v + 0.3) : Math.max(target, v - 0.7);
    y += v * 0.1;
    s = applyTick(s, makeTick({ t, speedKmh: v * 3.6, maxSpeedKmh: 140, position: { x: 0, y }, motorway: true })).state;
  }
  const ended = s.phase === "driving" ? finishSession(s, t) : s;
  return { ended, result: buildLessonResult(ended) };
}

describe("R2/R4 — one latch per blow, and the record of every graded blow", () => {
  it("a blown, graded cap leaves ONE breach row on the result — and (round 6) its arrival is taught, never charged (100 → 78)", () => {
    const { result } = sprayBlownThen78();
    // ROUND 6: the blow is the offence even on a named feature (round 3 pinned
    // no coached row here) — the one row is the arrival, taught.
    expect((result.coachedMistakes ?? []).map((c) => c.code)).toEqual([TASK]);
    expect(result.summary.mistakes).toEqual([]);
    expect(result.taskCapBreaches?.map((b) => b.objectiveId)).toEqual(["sc-acts-gap"]);
  });

  it("…and the spotless-sheet line says what the driving did — never «…не за карането» — with the corrective at the foot, said once", () => {
    const { ended, result } = sprayBlownThen78();
    const text = buildDebrief(ended.lesson, result, { coachedMistakes: result.coachedMistakes }).text;
    expect(text).not.toContain("не за карането");
    // ROUND 6: the arrival card is now shown, so the reservation says both
    // true things — a violation was shown and not charged, and the mark was
    // passed over its cap — and the card itself is under «Учебни моменти».
    expect(text).toContain(
      "Но чистият лист не значи чисто каране: едно нарушение беше показано и този път не влезе в точките; мина точката на задачата над тавана, който тя показва.",
    );
    expect(text).toContain("Учебни моменти (не влизат в точките):");
    // …and the corrective at the foot, said ONCE: now under the card's own
    // «→ Правилното действие», so the practice line points at it instead of
    // repeating it (round 3 counted the practice line's own wording here).
    expect(text.split(VIOLATIONS.TASK_SPEED_CAP_EXCEEDED.correctiveBg).length - 1).toBe(1);
    expect(text.split("мини точката на задачата под тавана").length - 1).toBeLessThanOrEqual(1);
  });

  it("a cap honoured at its mark is never stamped and leaves no row", () => {
    const o = drive(straight("t-r4h", [{ y: 450, cap: 80 }, { y: 1500 }], 140), {
      pts: line(1600),
      posted: 140,
      capIdx: 0,
      speed: (c) => (c.y < 380 ? 100 : 78),
    });
    expect(o.blow).toBeNull();
    expect(o.frames.some((f) => f.stamped)).toBe(false);
  });

  it("the stamp names its latch: every stamped frame of one blow carries the same blownAtSec", () => {
    const seen = new Set<number>();
    let s = createLessonSession(straight("t-r2n", [{ y: 450, cap: 80 }, { y: 1500 }], 140));
    let y = 15;
    for (let i = 1; i <= 400 && s.phase === "driving"; i++) {
      y += (110 / 3.6) * 0.1;
      s = applyTick(s, makeTick({ t: i / 10, speedKmh: 110, maxSpeedKmh: 140, position: { x: 0, y } })).state;
      const cap = s.lastTick?.taskSpeedCap;
      if (cap !== undefined) seen.add(cap.blownAtSec);
    }
    expect(seen.size).toBe(1);
  });
});

// ===========================================================================
// R4 — THE SERVER DEBRIEF (the text the student reads) SEES THE BREACH TOO
// ===========================================================================

describe("R4 — the breach record crosses the wire, and the server debrief scopes the praise", () => {
  function payload(ended: LessonSessionState, result: ReturnType<typeof buildLessonResult>, withBreaches: boolean) {
    return {
      lessonId: ended.lesson.id,
      startedAtMs: 0,
      finishedAtMs: 70_000,
      aborted: result.aborted,
      ruleEvents: serializeRuleEvents(ended.events, ended.penaltyEscalations, ended.eventPositions ?? []),
      objectives: result.objectives.map((o) => ({ id: o.id, done: o.done, completedAtSec: o.completedAtSec })),
      ...(withBreaches && result.taskCapBreaches ? { taskCapBreaches: serializeTaskCapBreaches(result.taskCapBreaches) } : {}),
    };
  }

  it("round-trips: the server result carries the row and its debrief prints no unscoped praise", () => {
    const { ended, result } = sprayBlownThen78();
    expect(result.summary.commendations.length).toBeGreaterThan(0);
    const graded = gradeFinishWire(payload(ended, result, true));
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.result.taskCapBreaches?.map((b) => b.objectiveId)).toEqual(["sc-acts-gap"]);
    const text = buildDebrief(graded.lesson, graded.result, { coachedMistakes: graded.result.coachedMistakes }).text;
    expect(unscopedPraise(text)).toEqual([]);
  });

  it("TRUST — an id that is not one of the lesson's capped objectives is dropped; a malformed list refuses the payload", () => {
    const { ended, result } = sprayBlownThen78();
    const base = payload(ended, result, false);
    const forged = gradeFinishWire({
      ...base,
      taskCapBreaches: [
        { objectiveId: "sc-acts-finish", t: 20 },
        { objectiveId: "nope", t: 20 },
      ],
    });
    expect(forged.status).toBe("ok");
    if (forged.status === "ok") expect(forged.result.taskCapBreaches).toBeUndefined();
    expect(gradeFinishWire({ ...base, taskCapBreaches: [{ objectiveId: 7, t: 20 }] }).status).toBe("invalid");
    expect(gradeFinishWire({ ...base, taskCapBreaches: "x" }).status).toBe("invalid");
  });
});

describe("R2 — a spent stretch is re-bound only by a NEW blow of its mark", () => {
  // ≤80 at y 450, next goal at 700 (the stretch is spent at 712). Frames are
  // placed, not integrated, so the car can be put back on the approach.
  function run(back: { y: number } | null, reblowKmh: number) {
    let s = createLessonSession(straight("t-rearm", [{ y: 450, cap: 80 }, { y: 700 }, { y: 5000 }], 140));
    let y = 300;
    let t = 0;
    const stamps: Array<{ t: number; y: number; blownAtSec: number }> = [];
    const step = (speed: number) => {
      t = Math.round((t + 0.1) * 10) / 10;
      y += (speed / 3.6) * 0.1;
      s = applyTick(s, makeTick({ t, speedKmh: speed, maxSpeedKmh: 140, position: { x: 0, y } })).state;
      const cap = s.lastTick?.taskSpeedCap;
      if (cap !== undefined) stamps.push({ t, y, blownAtSec: cap.blownAtSec });
    };
    while (y < 760) step(110);
    if (back !== null) {
      y = back.y;
      while (y < 600) step(reblowKmh);
    }
    return { stamps, s };
  }
  it("driven back onto the approach and through the mark again at 110: a new latch — stamps resume under a NEW blownAtSec", () => {
    const { stamps } = run({ y: 380 }, 110);
    const names = [...new Set(stamps.map((x) => x.blownAtSec))];
    expect(names).toHaveLength(2);
    expect(stamps.filter((x) => x.y > 712.5 && x.blownAtSec === names[0])).toEqual([]);
  });
  it("…but back in the corridor WITHOUT a fresh approach through the mark (put down at y 500): the spent stretch stays spent", () => {
    const { stamps } = run({ y: 500 }, 110);
    expect(new Set(stamps.map((x) => x.blownAtSec)).size).toBe(1);
    expect(stamps.filter((x) => x.t > 30)).toEqual([]);
  });
  it("…and through the mark again UNDER the cap: the objective honours it, nothing is re-stamped", () => {
    const { stamps, s } = run({ y: 380 }, 70);
    expect(new Set(stamps.map((x) => x.blownAtSec)).size).toBe(1);
    expect(s.objectives[0].status).toBe("done");
  });
});

describe("R4 — a clean window that falls due ON the blow's own frame is withdrawn", () => {
  it("the mark placed so the car first crosses it over the cap on the very frame its first 250 m window is paid: no CLEAN_DRIVING on that frame", () => {
    // Probe with no cap: the frame and place the first window is paid at 100 km/h.
    const probeLesson = straight("t-bf0", [{ y: 3000 }], 140);
    const frame = (y0: number) => y0; // positions are the same law in both runs
    void frame;
    let s = createLessonSession(probeLesson);
    let y = 15;
    let v = 0;
    let prevY = y;
    let paid: { t: number; y: number; prevY: number } | null = null;
    for (let i = 1; i <= 400 && paid === null; i++) {
      const t = i / 10;
      v = Math.min(100 / 3.6, v + 0.3);
      prevY = y;
      y += v * 0.1;
      const r = applyTick(s, makeTick({ t, speedKmh: v * 3.6, maxSpeedKmh: 140, position: { x: 0, y } }));
      s = r.state;
      if (r.state.events.some((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING")) paid = { t, y, prevY };
    }
    expect(paid).not.toBeNull();
    // The capped run: the ≤80 mark sits between the frame before the payout and
    // the payout's own frame, so the blow (100 > 85, past the mark) is that frame.
    const markY = (paid!.prevY + paid!.y) / 2;
    let c = createLessonSession(straight("t-bf1", [{ y: markY, cap: 80 }, { y: 3000 }], 140));
    y = 15;
    v = 0;
    let blowT: number | null = null;
    const clean: number[] = [];
    for (let i = 1; i <= Math.round(paid!.t * 10) + 5; i++) {
      const t = i / 10;
      v = Math.min(100 / 3.6, v + 0.3);
      y += v * 0.1;
      c = applyTick(c, makeTick({ t, speedKmh: v * 3.6, maxSpeedKmh: 140, position: { x: 0, y } })).state;
      if (blowT === null && (c.evalStates[0] as { approachCap?: string }).approachCap === "blown") blowT = t;
    }
    for (const e of c.events) if (e.kind === "commendation" && e.code === "CLEAN_DRIVING") clean.push(e.t);
    expect(blowT).toBeCloseTo(paid!.t, 6);
    expect(clean).toEqual([]);
  });
});

describe("C1 — a drive with no task cap keeps base's settlement record shape", () => {
  // ROUND 4 (founder ruling «Yes, same as speeding»): the no-task settlement now
  // re-checks a taught weather overspeed at a hand ending, so while such an
  // episode is open the flags the envelope is derived from ride on lastTick. A
  // lawful drive keeps exactly base's four fields (task-cap-round4.test.ts).
  it("a rainy, foggy night drive with no cap, taught the conditions code and still over: lastTick carries the three flags", () => {
    let s = createLessonSession(straight("t-lt", [{ y: 400 }, { y: 3000 }], 140));
    let y = 15;
    for (let i = 1; i <= 200; i++) {
      y += (125 / 3.6) * 0.1;
      s = applyTick(
        s,
        makeTick({ t: i / 10, speedKmh: 125, maxSpeedKmh: 140, position: { x: 0, y }, rain: true, fog: true, isNight: true }),
      ).state;
    }
    expect(Object.keys(s.lastTick ?? {}).sort()).toEqual(["fog", "isNight", "maxSpeedKmh", "position", "rain", "speedKmh", "t"]);
  });
});

describe("C4 — a conditions card never claims the task's number when the car is under it", () => {
  // Round 4: the curtain id keeps the stamp on past the ≤100 zone, where the
  // conditions bill falls due — the frame C4 is about.
  //
  // ROUND 6 (ruling 4 in the integrator's reading): the ARRIVAL now names the
  // act at the blow, so a conditions first bill that merely continues the
  // breach it was already in is absorbed and shows nothing. A conditions bill
  // that DOES reach the glass with the stamp on and the car under the task's
  // 100 now comes one of two ways, and C4 must hold on both — wherever the copy
  // lands (a pause card, or the rate-limited toast that carries the same text):
  //  · a SEPARATE act: the car drops back under both lines and holds it, so the
  //    act ends, then drives 88 on the curtain — a new snow breach under the
  //    task's line, which names its own act and is CHARGED on the topic the
  //    arrival's card spent (ruling 1);
  //  · the SAME continuous act: the task's own episode has billed (held over
  //    3 s, absorbed), a 2 s dip stays inside its re-arm, and the 88 after it is
  //    a new breach begun after the owner's lapse — C3's surfaced card, free.
  const SNOW = "t-snow";
  const lesson = () => straight(SNOW, [{ y: 450, cap: 100, id: CURTAIN_OBJECTIVE_ID }, { y: 3000 }], 140);
  const COND_TITLE = VIOLATIONS.SPEED_TOO_FAST_FOR_CONDITIONS.titleBg;
  const condCopy = (o: Out) => [
    ...o.cards.filter((c) => c.code === COND).map((c) => ({ t: c.t, text: c.explanationBg, via: "card" })),
    ...o.toasts.filter((h) => h.titleBg === COND_TITLE).map((h) => ({ t: h.t, text: h.explanationBg, via: h.kind })),
  ];
  const run = (speed: (c: Ctx) => number) =>
    drive(lesson(), {
      pts: line(1600),
      posted: 140,
      flags: { snow: true, headlights: "low" },
      accel: 8,
      decel: 12,
      capIdx: 0,
      speed,
    });

  it("…and the same 88 inside the SAME continuous act (110 held past the task's 3 s, a 2 s dip to 60, then 88): the surfaced conditions bill is shown free, the act keeps ONE charge, and no copy claims the task's 100", () => {
    // The blow is read off the evaluator the harness hands the speed profile.
    let blownT: number | null = null;
    let dipAt: number | null = null;
    const o = run((c) => {
      const st = c.s.evalStates[0] as { approachCap?: string } | undefined;
      if (blownT === null && st?.approachCap === "blown") blownT = c.t;
      if (c.y < 380) return 65;
      if (blownT === null || c.t - blownT < 3.5) return 110;
      if (dipAt === null) dipAt = c.t;
      return c.t - dipAt < 2 ? 60 : 88;
    });
    expect(o.blow).not.toBeNull();
    expect(o.coached.filter((b) => b.code === TASK)).toHaveLength(1);
    // The surfaced bill: shown and recorded as coached, never charged itself…
    const surfaced = o.coached.filter((b) => b.code === COND);
    expect(surfaced).toHaveLength(1);
    // …and the act's ONE charge — its re-grade, the 88 held 9 s in the snow —
    // is the only point the whole act carries, later than the surfaced card.
    const kinCharged = o.charged.filter((b) => b.code === COND || b.code === TASK);
    expect(kinCharged.length).toBeLessThanOrEqual(1);
    for (const c of kinCharged) expect(c.t).toBeGreaterThan(surfaced[0].t + 5);
    const copy = condCopy(o);
    expect(copy.length).toBeGreaterThanOrEqual(1);
    expect(copy[0].t).toBe(surfaced[0].t);
    for (const c of copy) {
      const at = o.frames.find((fr) => fr.t === c.t);
      expect(at?.stamped, "the task stamp is on when the conditions copy falls due").toBe(true);
      expect(c.text).not.toContain("над тавана на задачата");
      expect(c.text).toBe(VIOLATIONS.SPEED_TOO_FAST_FOR_CONDITIONS.explanationBg);
    }
  });
});
