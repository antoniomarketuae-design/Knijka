/**
 * WITNESS, ROUND 5 — sc-mv-uturn-ban: ONE DEFINITION OF THE ACT.
 *
 * Round 4 placed the turn-round on the first frame the car's CENTRE was across
 * the axis, and an adversarial pass refuted it on one class (journal
 * wf_74b8f25e-b7e, verifier finding Y1): a student who waited at the lesson's
 * own gap, turned round on full lock over the DASHES without his centre ever
 * reaching the axis, drove fifty metres back and then eased over the solid
 * axis was billed «Обратен завой през непрекъсната осева линия» — «…това е
 * обратен завой, а на това място той е забранен» — and advised to go on to
 * where the axis is dashed and turn there. That is where he had turned.
 *
 * THE INTEGRATOR'S RULING THIS FILE PINS, every act through the live-rung chain
 * (witnessLiveRung: the compiled rung → createLessonSession → applyTick →
 * buildLessonResult → buildDebrief), with the truth recomputed from the raw
 * pose by `uturnActOracle.ts` — never from the product's tracker:
 *
 *  R5-1 A turn-round is an event of the HEADING against the road: the nose
 *       goes from within 45° of the direction the car was travelling to within
 *       45° of the opposite one. It BEGINS where the swing that carries the
 *       nose out of the band begins; it COMPLETES when that swing ends.
 *  R5-2 A billed crossing of the solid axis is the U-turn iff (i) the centre
 *       crossed where the axis is solid, (ii) a turn-round completed at or
 *       after that crossing — never before it — and (iii) the axis is solid
 *       where that turn-round begins.
 *  R5-3 A place measured on the road is kept while the road has no fix.
 *  R5-4 The debrief gives each named act its own reason and corrective.
 *
 * Every act of §Y1 … §Y5 is the round-4 verifier's own geometry
 * (D:/knijka-lanes/scratch/uturn-verifier-r4/zz-v4-all.test.ts, rows P, Q5, Q6,
 * R2, R2c, R7, R10, S1, S2, V1), ported unchanged.
 *
 * ROUND 6 RE-BASED THREE THINGS HERE, each by an integrator ruling (the acts
 * and what R5-2 says of them are untouched; `mv-uturn-ban-the-closing-round
 * .test.ts` has the rulings' own witnesses):
 *   · R6-3 — a crossing made by a car that has already turned round carries
 *     the reason WITHOUT «…в насрещната половина на платното» (the acts
 *     `own-way` / `astride-own-way`): `crossingActAt` below reads the
 *     travel direction off the oracle;
 *   · R6-2 — after a named U-turn that leaves the car on the half AGAINST its
 *     new travel direction (every round to the RIGHT of §Y4), the run that
 *     follows is a new crossing with a bill of its own:
 *     `expectOneNamedUTurn` allows exactly those rows and nothing else;
 *   · R6-2 — so «R2 on r 6.2: ONE act and ONE row» is now the U-turn's row
 *     (the second crossing of the same swing is still not billed) plus the
 *     bill of the 24 m he then drives 0.21 m over the axis the wrong way.
 *
 * KILL-CHECKS (each reddens this file on an assertion; restored, sha-verified):
 *   · the reference direction following the BANK again (a car across and
 *     travelling with the far bank «has turned round» on its crossing frame);
 *   · a turn-round naming a LATER crossing;
 *   · the begin station read at the crossing frame / where the nose passes 45°;
 *   · a measured place dropped when the road loses its fix on the car;
 *   · the debrief keyed by code only.
 */

import { describe, expect, it } from "vitest";
import { PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../../collision/bodies";
import type { SimTick } from "../../../rules";
import type { DriveScript } from "../../../traces/recorder";
import { scMvUturnBanShadowScript } from "../../../traces/scMvUturnBan";
import { SC_MV_UTURN_BAN } from "../templates-parking2";
import { crossingBilledAt, inSpan, oncomingAt, oracle, SPAN, wrap180, type OracleTruth } from "./uturnActOracle";
import { driveLiveRung, type LiveRungOutcome } from "./witnessLiveRung";

const UTURN_ACT = "u-turn";
const ASTRIDE_ACT = "astride";
const OWN_WAY_ACT = "own-way";
const ASTRIDE_OWN_WAY_ACT = "astride-own-way";
const UTURN_TITLE = "Обратен завой през непрекъсната осева линия";
const CROSSING_TITLE = "Пресичане на непрекъсната осева линия";
const WHOLLY_SENTENCE = "Пресече изцяло непрекъснатата осева линия и навлезе в насрещната половина на платното.";
const ASTRIDE_SENTENCE =
  "Застъпи непрекъснатата осева линия и навлезе с повече от половината автомобил в насрещната половина на платното.";
/** Round 6 (R6-3): the same two first sentences for a car entering the half that runs its own way. */
const WHOLLY_OWN_WAY_SENTENCE = "Пресече изцяло непрекъснатата осева линия. Единичната";
const ASTRIDE_OWN_WAY_SENTENCE = "Застъпи непрекъснатата осева линия. Единичната";
const UTURN_SENTENCE = "Пресече непрекъснатата осева линия и зави в обратна посока";
const FORBIDDEN_HERE = /обратен завой, а на това място той е забранен/u;
const TURN_WHERE_DASHED = /Подмини мястото и продължи в лентата си, докато осевата стане прекъсната/u;
const OVERTAKING_ADVICE = /Изпреварвай или заобикаляй|дори предният да пълзи/u;
const UTURN_CORRECTIVE = "Обратен завой не се прави през плътна линия";
const CROSSING_CORRECTIVE = "Плътна линия = стена: остани в своята лента, дори предният да пълзи.";
const CLEAN_PRAISE = /чисто каране по изпитния лист|оценката е за незавършения маршрут, не за карането/u;
const ALL_RUNGS = [1, 2, 3, 4, 5] as const;
type Rung = (typeof ALL_RUNGS)[number];

// ---------------------------------------------------------------------------
// geometry — the verifier's own helpers (zz-v4-all.test.ts), verbatim
// ---------------------------------------------------------------------------

type Pt = [number, number];
type Steps = DriveScript["steps"];
const rad = (d: number) => (d * Math.PI) / 180;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** An arc of radius r from pose (x0, y0, heading h0 — degrees LEFT of north), turning `turnDeg` (+ = left). */
function arc(x0: number, y0: number, h0: number, r: number, turnDeg: number, stepDeg = 3): { pts: Pt[]; x: number; y: number; h: number } {
  const left = turnDeg >= 0;
  const nx = left ? -Math.cos(rad(h0)) : Math.cos(rad(h0));
  const ny = left ? -Math.sin(rad(h0)) : Math.sin(rad(h0));
  const cx = x0 + r * nx;
  const cy = y0 + r * ny;
  const pts: Pt[] = [];
  const n = Math.max(1, Math.ceil(Math.abs(turnDeg) / stepDeg));
  let x = x0;
  let y = y0;
  let h = h0;
  for (let i = 0; i <= n; i++) {
    h = h0 + (turnDeg * i) / n;
    const mx = left ? -Math.cos(rad(h)) : Math.cos(rad(h));
    const my = left ? -Math.sin(rad(h)) : Math.sin(rad(h));
    x = cx - r * mx;
    y = cy - r * my;
    pts.push([r3(x), r3(y)]);
  }
  return { pts, x, y, h };
}
/** `len` metres straight on heading h (degrees left of north). */
function line(x0: number, y0: number, h: number, len: number): { pts: Pt[]; x: number; y: number; h: number } {
  const x = x0 - Math.sin(rad(h)) * len;
  const y = y0 + Math.cos(rad(h)) * len;
  return { pts: [[r3(x0), r3(y0)], [r3(x), r3(y)]], x, y, h };
}
function approach(xLane: number, yTurn: number, stop = true): Steps {
  const s: Steps = [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: [[12.19, 15], [12.19, Math.min(70, yTurn - 54)]], targetKmh: 46, stopAtEnd: false },
    { kind: "glance", mirror: "left" },
    { kind: "indicator", setting: "left" },
    { kind: "drive", points: [[12.19, Math.min(70, yTurn - 54)], [(12.19 + xLane) / 2 + (xLane < 11 ? 1 : 0), yTurn - 40], [xLane, yTurn - 24]], targetKmh: 30, stopAtEnd: false },
    { kind: "drive", points: [[xLane, yTurn - 24], [xLane, yTurn]], targetKmh: 14, ...(stop ? {} : { stopAtEnd: false }) },
  ];
  if (stop) s.push({ kind: "pause", sec: 0.8, brake: true });
  return s;
}
const tail = (x: number, y: number, h: number, len = 24, kmh = 25): Steps => [
  { kind: "indicator", setting: "off" },
  { kind: "drive", points: line(x, y, h, len).pts, targetKmh: kmh },
  { kind: "pause", sec: 1, brake: true },
];
const outerApproach = (x: number, y: number): Steps => [
  { kind: "glance", mirror: "rear" },
  { kind: "drive", points: x === 12.19 ? [[12.19, 15], [12.19, y]] : [[12.19, 15], [12.19, y - 40], [x, y - 20], [x, y]], targetKmh: 40 },
  { kind: "pause", sec: 0.8, brake: true },
  { kind: "indicator", setting: "left" },
];
const lead = (xTo: number, yTo: number): Steps => [
  { kind: "glance", mirror: "rear" },
  { kind: "drive", points: [[12.19, 15], [12.19, yTo - 50]], targetKmh: 46, stopAtEnd: false },
  { kind: "glance", mirror: "left" },
  { kind: "indicator", setting: "left" },
  { kind: "drive", points: [[12.19, yTo - 50], [6, yTo - 28], [xTo, yTo - 10], [xTo, yTo]], targetKmh: 20, stopAtEnd: false },
];
/** The lesson's own correct drive up to and including its lawful arc at the gap. */
function lawfulHead(): Steps {
  const shadow = scMvUturnBanShadowScript();
  const arcIdx = shadow.steps.findIndex((s) => s.kind === "drive" && s.targetKmh === 8);
  return [...shadow.steps.slice(0, arcIdx + 1), { kind: "indicator", setting: "off" }];
}

// ---- §Y1: the turn-round made on the OWN HALF (too tight to cross), then the wrong way back and over the solid axis ----

/** P — one arc of radius r from (x0, y0); `holdM` metres south on the own half; a 10° ease over the axis to the far inner lane. */
function ownHalfTurn(x0: number, y0: number, r: number, holdM: number, wait: boolean): DriveScript {
  const a = arc(x0, y0, 0, r, 180);
  const y1 = a.y - holdM;
  const dy = (a.x + 4.06) / Math.tan(rad(10));
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: x0 === 12.19 ? [[12.19, 15], [12.19, y0]] : [[12.19, 15], [12.19, y0 - 40], [x0, y0 - 20], [x0, y0]], targetKmh: 40 },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "pause", sec: wait ? 14.5 : 0.8, brake: true },
      { kind: "drive", points: [...a.pts, [r3(a.x), r3(y1 - 0.01)], [-4.06, r3(y1 - dy)], [-4.06, r3(y1 - dy - 25)]], targetKmh: 9 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** Q5 — astride 0.3 m to the gap, a RIGHT-hand round at y 240 onto the own half, south into the span, then over the solid axis. */
function q5(): DriveScript {
  const a = arc(-0.3, 240, 0, 6, -180);
  return {
    steps: [
      ...lead(1.2, 180),
      { kind: "drive", points: [[1.2, 180], [-0.3, 195], [-0.3, 240]], targetKmh: 22 },
      { kind: "pause", sec: 2, brake: true },
      { kind: "drive", points: [...a.pts, [r3(a.x), 216], [-4.06, 190], [-4.06, 165]], targetKmh: 12 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** Q6 — a pull-out billed inside the span, held to y 240; a RIGHT-hand round there (dashes) onto the own half; south; over the solid axis. */
function q6(): DriveScript {
  const a = arc(-12.19, 240, 0, 8, -180);
  return {
    steps: [
      ...lead(4.06, 130),
      { kind: "drive", points: [[4.06, 130], [-12.19, 160], [-12.19, 240]], targetKmh: 30 },
      { kind: "pause", sec: 2, brake: true },
      { kind: "drive", points: [...a.pts, [r3(a.x), 216], [-4.06, 192], [-4.06, 170]], targetKmh: 12 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

// ---- §Y4: pulled out, then a round to the RIGHT back over the solid axis ----

/** R2c — pull-out wholly across for 20 m, right-hand round on r 5, ending southbound in his own inner lane. */
function r2c(): DriveScript {
  const a = arc(-4.06, 130, 0, 5, -180);
  return {
    steps: [
      ...lead(4.06, 80),
      { kind: "drive", points: [[4.06, 80], [-4.06, 100], [-4.06, 130]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      ...tail(a.x, a.y, 180, 24),
    ],
  };
}
/** R2 — pull-out to the oncoming outer lane, 30 m, a right-hand round on radius r. */
function r2(r: number): DriveScript {
  const a = arc(-12.19, 140, 0, r, -180);
  return {
    steps: [
      ...lead(4.06, 80),
      { kind: "drive", points: [[4.06, 80], [-12.19, 110], [-12.19, 140]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      ...tail(a.x, a.y, 180, 24),
    ],
  };
}
/** R10 — astride 0.4 m, a RIGHT-hand round on r 5 over the own half, then straight back onto the far half. */
function r10(): DriveScript {
  const a = arc(-0.4, 150, 0, 5, -180);
  return {
    steps: [
      ...lead(1.2, 100),
      { kind: "drive", points: [[1.2, 100], [-0.4, 110], [-0.4, 150]], targetKmh: 14, stopAtEnd: false },
      { kind: "drive", points: [...a.pts, [r3(a.x), 142], [-4.06, 112], [-4.06, 90]], targetKmh: 9 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

// ---- §Y5: the same turn either side of the end of the solid line ----

/** S1 — astride 0.3 m from y 152, one arc on r begun at y0. */
function s1(y0: number, r = 6): DriveScript {
  const a = arc(-0.3, y0, 0, r, 180);
  return {
    steps: [
      ...lead(1.2, 140),
      { kind: "drive", points: [[1.2, 140], [-0.3, 152], [-0.3, y0 + 0.001]], targetKmh: 14, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      ...tail(a.x, a.y, 180, 12),
    ],
  };
}
/** S2 — pulled out wholly across (4.06 m) from y 160, one arc on r 6 begun at y0. */
function s2(y0: number): DriveScript {
  const a = arc(-4.06, y0, 0, 6, 180);
  return {
    steps: [
      ...lead(4.06, 140),
      { kind: "drive", points: [[4.06, 140], [-4.06, 160], [-4.06, y0 + 0.001]], targetKmh: 22, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      ...tail(a.x, a.y, 180, 12),
    ],
  };
}
/** U — southbound after the lawful turn: astride the solid axis 0.3 m to the EAST from y 190, one arc back north on r 7 begun at y0. */
function southboundAstrideThenRoundAt(y0: number): DriveScript {
  const a = arc(0.3, y0, 180, 6, 180);
  return {
    steps: [
      ...lawfulHead(),
      // 60 км/ч south (10 over the limit — that row is his, and is not what is
      // asserted here): the route ends ~26 s after the lawful turn.
      { kind: "drive", points: [[-12.19, 264], [-12.19, 250], [-4.06, 225], [0.3, 200], [0.3, r3(y0 + 22)]], targetKmh: 60, stopAtEnd: false },
      { kind: "drive", points: [[0.3, r3(y0 + 22)], [0.3, r3(y0)]], targetKmh: 18, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: 18, stopAtEnd: false },
      ...tail(a.x, a.y, 0, 10),
    ],
  };
}

// ---- §Y2: the very wide turn through the field ----

/** R7 — from the outer lane at y 100, one arc of radius r, out past where the road has a fix, and back onto the far half. */
function r7(r: number): DriveScript {
  const a = arc(12.19, 100, 0, r, 180);
  return {
    steps: [
      ...outerApproach(12.19, 100),
      { kind: "drive", points: a.pts, targetKmh: 12, stopAtEnd: false },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [-12.19, a.y - 30], [-12.19, a.y - 50]], targetKmh: 20 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

// ---- §Y3: a U-turn and a later crossing in one drive ----

/** V1 — the demo-radius U-turn at y 150, then (southbound) a drift east over the solid axis at y ≈ 95 and back. */
function v1(): DriveScript {
  const a = arc(4.06, 150, 0, 8.125, 180);
  return {
    steps: [
      ...approach(4.06, 150),
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [-12.19, 130], [-4.06, 110], [2.5, 92], [2.5, 80], [-4.06, 62], [-4.06, 50]], targetKmh: 25 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** The other order: a pull-out and back (a crossing), then the demo-radius U-turn at y 190. */
function crossingThenUTurn(): DriveScript {
  const out = line(4.06, 100, 20, (4.06 + 4.06) / Math.sin(rad(20)));
  const run = line(out.x, out.y, 0, 12);
  const back = line(run.x, run.y, -20, (4.06 + 4.06) / Math.sin(rad(20)));
  const a = arc(4.06, 190, 0, 8.125, 180);
  return {
    steps: [
      ...approach(4.06, 100, false),
      { kind: "drive", points: [...out.pts, ...run.pts.slice(1), ...back.pts.slice(1), [4.06, 190]], targetKmh: 20 },
      { kind: "pause", sec: 0.8, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      ...tail(a.x, a.y, 180, 16),
    ],
  };
}

// ---- §R5-1 controls ----

/** One arc from the OUTER lane on radius r, begun at y0. */
function outerArc(r: number, y0 = 120, kmh = 9): DriveScript {
  const a = arc(12.19, y0, 0, r, 180);
  return { steps: [...outerApproach(12.19, y0), { kind: "drive", points: a.pts, targetKmh: kmh, stopAtEnd: false }, ...tail(a.x, a.y, 180)] };
}

// ---------------------------------------------------------------------------
// what the product returned
// ---------------------------------------------------------------------------

interface Row {
  where: "coached" | "scored";
  t: number;
  detail: string | undefined;
  titleBg: string;
}
function crossingRows(o: LiveRungOutcome): Row[] {
  const rows: Row[] = [];
  for (const c of o.result.coachedMistakes ?? []) {
    if (c.code === "CROSSED_SOLID_LINE") rows.push({ where: "coached", t: c.t, detail: c.detail, titleBg: c.titleBg });
  }
  for (const e of o.session.events) {
    if (e.kind === "violation" && e.code === "CROSSED_SOLID_LINE") {
      rows.push({ where: "scored", t: e.t, detail: e.detail, titleBg: e.titleBg });
    }
  }
  return rows.sort((a, b) => a.t - b.t);
}
function tickAt(o: LiveRungOutcome, t: number): SimTick {
  return o.ticks.reduce((b, k) => (Math.abs(k.t - t) < Math.abs(b.t - t) ? k : b));
}
function indexAt(o: LiveRungOutcome, t: number): number {
  let best = 0;
  for (let i = 1; i < o.ticks.length; i++) if (Math.abs(o.ticks[i].t - t) < Math.abs(o.ticks[best].t - t)) best = i;
  return best;
}
function reachAcrossM(k: SimTick): number {
  const psi = rad(k.headingDeg);
  return PLAYER_HALF_WIDTH_M * Math.abs(Math.cos(psi)) + PLAYER_HALF_LENGTH_M * Math.abs(Math.sin(psi));
}
/** The whole body is on one side of the axis. */
const bodyClear = (k: SimTick): boolean => Math.abs(k.position.x) - reachAcrossM(k) >= 0;
/**
 * The act a CROSSING billed at `t` carries: the body on that frame (wholly
 * across / astride), and — round 6, R6-3 — whether the half it has entered
 * runs against the car's travel direction there (from the oracle).
 */
function crossingActAt(o: LiveRungOutcome, t: number): string | undefined {
  const i = indexAt(o, t);
  const wholly = bodyClear(o.ticks[i]);
  const ownWay = oncomingAt(oracle(o.ticks), o.ticks, i) === false;
  if (ownWay) return wholly ? OWN_WAY_ACT : ASTRIDE_OWN_WAY_ACT;
  return wholly ? undefined : ASTRIDE_ACT;
}
/** R6-2: the wrong-half run (after a named U-turn's swing) the row at `t` is the bill of, if any. */
function wrongHalfRunBilledAt(truth: OracleTruth, t: number): OracleTruth["wrongHalfRuns"][number] | undefined {
  // (the sustain after the swing ended — or after the U-turn's own bill, where that came later)
  return truth.wrongHalfRuns.find((w) => t >= w.fromT + 0.5 && t <= w.fromT + 1.3);
}
const isWrongHalfRunBill = (truth: OracleTruth, t: number): boolean => wrongHalfRunBilledAt(truth, t) !== undefined;

/**
 * EVERY ROW AGAINST THE ORACLE: a CROSSED_SOLID_LINE row is the U-turn exactly
 * when R5-2 says the crossing it bills is; a row that is not carries the
 * reason the body earned on its bill frame. Returns the truth for more asserts.
 */
function expectRowsMatchTheRuling(o: LiveRungOutcome): { rows: Row[]; truth: OracleTruth } {
  const truth = oracle(o.ticks);
  const rows = crossingRows(o);
  for (const r of rows) {
    const c = crossingBilledAt(truth, r.t);
    const where = `row at t=${r.t.toFixed(2)} (${r.detail ?? "pooled"}) ↔ crossing ${c === null ? "none" : `t=${c.t.toFixed(2)} y=${c.y.toFixed(1)} ${c.why || "U-TURN"}`}`;
    expect({ where, solidCrossing: c !== null }).toEqual({ where, solidCrossing: true });
    // (R6-2: the bill of the run that follows a U-turn on the half against the new direction is a standing
    // crossing of its own — the U-turn only if a LATER turn-round, begun over the solid axis, makes it one.)
    const run = wrongHalfRunBilledAt(truth, r.t);
    const uTurn = run !== undefined ? run.uTurn : c!.uTurn;
    expect({ where, named: r.detail === UTURN_ACT }).toEqual({ where, named: uTurn });
    expect({ where, title: r.titleBg }).toEqual({ where, title: uTurn ? UTURN_TITLE : CROSSING_TITLE });
  }
  return { rows, truth };
}

/** Nothing anywhere says a U-turn was made where it is forbidden. */
function expectNoUTurnSaid(o: LiveRungOutcome): void {
  expect(o.debrief).not.toContain(UTURN_TITLE);
  expect(o.debrief).not.toMatch(FORBIDDEN_HERE);
  expect(o.debrief).not.toContain(UTURN_SENTENCE);
  expect(o.debrief).not.toContain(UTURN_CORRECTIVE);
  expect(o.debrief).not.toMatch(TURN_WHERE_DASHED);
  for (const g of o.glass) {
    expect(g.titleBg).not.toBe(UTURN_TITLE);
    expect(g.explanationBg).not.toMatch(FORBIDDEN_HERE);
  }
  const logged = o.drive.ruleEvents.filter((e) => e.kind === "violation" && e.code === "CROSSED_SOLID_LINE");
  expect(logged.map((e) => (e as { detail?: string }).detail ?? "pooled")).not.toContain(UTURN_ACT);
  expect((o.result.lessonMistakes ?? []).map((h) => h.detail)).not.toContain(UTURN_ACT);
}

/** Every crossing sentence the glass printed is true of the body on its frame. */
function expectCrossingGlassTrue(o: LiveRungOutcome): void {
  for (const g of o.glass) {
    if (g.titleBg !== CROSSING_TITLE) continue;
    const at = tickAt(o, g.t);
    const wholly = bodyClear(at);
    const where = `${g.src} at t=${g.t.toFixed(2)} x=${at.position.x.toFixed(2)} h=${wrap180(at.headingDeg).toFixed(1)}`;
    expect({ where, saysWholly: g.explanationBg.includes("изцяло") }).toEqual({ where, saysWholly: wholly });
    const act = crossingActAt(o, g.t);
    const ownWay = act === OWN_WAY_ACT || act === ASTRIDE_OWN_WAY_ACT;
    expect({ where, saysOncoming: g.explanationBg.includes("насрещната половина") }).toEqual({ where, saysOncoming: !ownWay });
    expect(g.explanationBg.startsWith(ownWay ? (wholly ? WHOLLY_OWN_WAY_SENTENCE : ASTRIDE_OWN_WAY_SENTENCE) : wholly ? WHOLLY_SENTENCE : ASTRIDE_SENTENCE)).toBe(true);
  }
}

/** ONE row, named the U-turn, with the U-turn's reason and corrective and never the overtaking advice. */
function expectOneNamedUTurn(o: LiveRungOutcome, level: Rung): Row {
  const rows = crossingRows(o);
  expect(`${rows[0].where}:${rows[0].detail ?? "pooled"}`).toBe(`${level === 4 ? "scored" : "coached"}:${UTURN_ACT}`);
  expect(rows[0].titleBg).toBe(UTURN_TITLE);
  // ROUND 6, R6-2 — the only other rows there can be are the bills of the runs
  // the pose shows on the half AGAINST the new travel direction after the
  // U-turn's swing: a crossing each, charged, on a reason that says «насрещната».
  const truth = oracle(o.ticks);
  const extra = rows.slice(1);
  for (const r of extra) {
    expect({ t: r.t, wrongHalfRunBill: isWrongHalfRunBill(truth, r.t) }).toEqual({ t: r.t, wrongHalfRunBill: true });
    expect(r.titleBg).toBe(CROSSING_TITLE);
    expect(r.where).toBe("scored");
    expect([undefined, ASTRIDE_ACT]).toContain(r.detail);
  }
  expect(extra.length).toBeLessThanOrEqual(truth.wrongHalfRuns.length);
  expect(o.debrief).toContain(UTURN_TITLE);
  expect(o.debrief).toContain(UTURN_CORRECTIVE);
  if (extra.length === 0) {
    expect(truth.wrongHalfRuns.filter((w) => w.heldSec >= 1.5 && w.fromT + 1.5 <= (o.session.endedAtSec ?? Number.POSITIVE_INFINITY))).toEqual([]);
    expect(o.debrief).not.toContain(CROSSING_TITLE);
    expect(o.debrief).not.toMatch(OVERTAKING_ADVICE);
  }
  expect(o.debrief).not.toMatch(CLEAN_PRAISE);
  expect(o.result.passed).toBe(false);
  return rows[0];
}

/** ONE row, and it stays the crossing, on the reason its bill frame earned. */
function expectOneCrossingKept(o: LiveRungOutcome, level: Rung): Row {
  const rows = crossingRows(o);
  expect(rows.map((r) => r.where)).toEqual([level === 4 ? "scored" : "coached"]);
  expect(rows[0].titleBg).toBe(CROSSING_TITLE);
  expect(rows[0].detail).toBe(crossingActAt(o, rows[0].t));
  expect(o.debrief).toContain(CROSSING_TITLE);
  expectNoUTurnSaid(o);
  expectCrossingGlassTrue(o);
  return rows[0];
}

// ---------------------------------------------------------------------------

describe("§Y1 a turn-round made over the DASHES on the car's own half, then a LATER crossing of the solid axis — the crossing keeps the crossing's copy (the verifier's 17 drives)", () => {
  const Y1: Array<[string, Rung, () => DriveScript]> = [
    ...ALL_RUNGS.map((l): [string, Rung, () => DriveScript] => ["P1 — the turn begun at y 226 (r 6.0), 10 m south, then over the solid axis", l, () => ownHalfTurn(12.19, 226, 6.0, 10, false)]),
    ["P1 — the turn begun at y 222, 4 m south, then over", 3, () => ownHalfTurn(12.19, 222, 6.0, 4, false)],
    ["P1 — the turn begun at y 222, 12 m south, then over", 3, () => ownHalfTurn(12.19, 222, 6.0, 12, false)],
    ["P1 — the turn begun at y 235, 20 m south, then over", 3, () => ownHalfTurn(12.19, 235, 6.0, 20, false)],
    ...ALL_RUNGS.map((l): [string, Rung, () => DriveScript] => ["P1 — THE CLEANEST ACT: wait 14.5 s at the lesson's own gap (y 264), full lock, 50 m south, then over the solid axis at y ≈ 213", l, () => ownHalfTurn(12.19, 264, 6.0, 50, true)]),
    ["P1 — the same, 60 m south", 3, () => ownHalfTurn(12.19, 264, 6.0, 60, true)],
    ["P2 — r 5.5 at y 240, ending 1.19 m inside his own lane, 25 m south, then over", 1, () => ownHalfTurn(12.19, 240, 5.5, 25, false)],
    ["P2 — r 5.5 at y 240, ending 1.19 m inside his own lane, 25 m south, then over", 3, () => ownHalfTurn(12.19, 240, 5.5, 25, false)],
    ["P3 — from x 14.5 on r 6.2 at y 264, 50 m south, then over", 3, () => ownHalfTurn(14.5, 264, 6.2, 50, true)],
  ];
  it("the list is the verifier's 17", () => expect(Y1.length).toBe(17));

  for (const [name, level, build] of Y1) {
    it(`L${level}: ${name} → «Пресичане на непрекъсната осева линия», and nothing says the turn was forbidden`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, build());
      const { truth } = expectRowsMatchTheRuling(o);
      // The act, from the pose: ONE turn-round, begun past the end of the solid
      // line and finished on his own half; the centre goes over the solid axis
      // only after that turn-round's swing has ended.
      expect(truth.turnRounds.length).toBe(1);
      const tr = truth.turnRounds[0];
      expect(tr.beginY!).toBeGreaterThan(SPAN.toY);
      expect(tr.beginSolid).toBe(false);
      expect(o.ticks[tr.confirmedI].position.x).toBeGreaterThan(0);
      const solid = truth.crossings.filter((c) => c.solid);
      expect(solid.length).toBe(1);
      expect(solid[0].i).toBeGreaterThan(tr.endI);
      expect(solid[0].why).toBe("after-the-turn-round");
      const row = expectOneCrossingKept(o, level);
      expect(row.t).toBeGreaterThan(tr.endT);
      expect(inSpan(tickAt(o, row.t).position.y)).toBe(true);
      // What the debrief must not do is advise the thing the student did.
      expect(o.debrief).not.toMatch(TURN_WHERE_DASHED);
      if (level !== 4) {
        // «не е взет: допусна „…“ — точно грешката, която този урок учи», or, where
        // the tight turn also cut up the oncoming stream, «„…“ е грешката, която този урок учи».
        expect(o.debrief).toMatch(new RegExp(`„${CROSSING_TITLE}“[^\n]*грешката, която този урок учи`, "u"));
      }
    });
  }

  for (const level of [1, 3, 4] as const) {
    it(`L${level}: Q5 — astride 0.3 m to the gap (billed «Застъпи…»), a RIGHT-hand round at y 240 onto his own half, south, over the solid axis → the second bill is a crossing too; neither is the U-turn`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, q5());
      const { rows, truth } = expectRowsMatchTheRuling(o);
      expect(truth.turnRounds.length).toBe(1);
      expect(truth.turnRounds[0].beginSolid).toBe(false);
      // (At L4 the exam's fail gate closes the session before he is back in the span: one row.)
      expect(rows.length).toBe(level === 4 ? 1 : 2);
      for (const r of rows) expect(r.titleBg).toBe(CROSSING_TITLE);
      expect(rows[0].detail).toBe(ASTRIDE_ACT);
      if (rows.length === 2) expect(rows[1].t - rows[0].t).toBeGreaterThan(20);
      expectNoUTurnSaid(o);
      expectCrossingGlassTrue(o);
    });
  }
  for (const level of [1, 3] as const) {
    it(`L${level}: Q6 — a pull-out billed «Пресече изцяло…» inside the span, held to y 240, a RIGHT-hand round there, south, over the solid axis → THE ROW BILLED 35 s EARLIER IS NOT RENAMED`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, q6());
      const { rows, truth } = expectRowsMatchTheRuling(o);
      expect(truth.turnRounds.length).toBe(1);
      expect(truth.turnRounds[0].beginSolid).toBe(false);
      expect(rows[0].detail).toBeUndefined();
      expect(rows[0].titleBg).toBe(CROSSING_TITLE);
      expect(rows[0].t).toBeLessThan(25);
      for (const r of rows) expect(r.titleBg).toBe(CROSSING_TITLE);
      expectNoUTurnSaid(o);
      expectCrossingGlassTrue(o);
    });
  }

  it("L3: control — the same tight turn at y 264, then over the DASHES at y ≈ 259 → nothing billed", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, ownHalfTurn(12.19, 264, 6.0, 4, true));
    expect(crossingRows(o)).toEqual([]);
    expect(oracle(o.ticks).crossings.filter((c) => c.solid)).toEqual([]);
    expectNoUTurnSaid(o);
  });

  it("L3: R5-2 (ii), inside the span too — the turn-round made wholly on his own half at y 150 (billed by nothing: the recorded class), 10 m back, THEN over the solid axis → a crossing made by a car already travelling the other way: the crossing's copy", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, ownHalfTurn(12.19, 150, 6.0, 10, false));
    const { truth } = expectRowsMatchTheRuling(o);
    expect(truth.turnRounds[0].beginSolid).toBe(true);
    expect(truth.crossings.filter((c) => c.solid).map((c) => c.why)).toEqual(["after-the-turn-round"]);
    expectOneCrossingKept(o, 3);
  });
});

describe("§R5-1 the turn-round COMPLETES when its swing ends — a crossing made while the nose is still swinging round is made during it, however far round the nose already is", () => {
  for (const r of [6.3, 6.5, 7.0] as const) {
    it(`L3: ONE ARC from the outer lane on r ${r} — the nose is 135° round before the centre reaches the axis, and the centre goes over the solid axis on the same swing → the U-turn`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, outerArc(r));
      const { truth } = expectRowsMatchTheRuling(o);
      const tr = truth.turnRounds[0];
      const c = truth.crossings.find((k) => k.solid)!;
      // The crossing is after the nose entered the opposite band, and before the swing ended.
      expect(c.i).toBeGreaterThan(tr.arrivedI);
      expect(c.i).toBeLessThanOrEqual(tr.endI);
      expect(c.uTurn).toBe(true);
      expectOneNamedUTurn(o, 3);
    });
  }
  it("L3: THE TWO SIDES OF «THE SWING HAS ENDED», stated (2 m without a degree more) — a turn from the outer lane at y 150 that comes off the lock 170° round and runs out straight: on r 6.0 the centre is 0.28 m short of the axis there and goes over it 1.6 m on → still the turn-round's swing, the U-turn; on r 5.9 it is 0.48 m short and goes over 2.8 m on → a crossing by a car already travelling the other way", () => {
    const runOut = (r: number): DriveScript => {
      const a = arc(12.19, 150, 0, r, 170);
      const l = line(a.x, a.y, 170, 30);
      return { steps: [...outerApproach(12.19, 150), { kind: "drive", points: [...a.pts, ...l.pts.slice(1)], targetKmh: 9 }, { kind: "pause", sec: 1, brake: true }] };
    };
    const during = driveLiveRung(SC_MV_UTURN_BAN, 3, runOut(6.0));
    const a = expectRowsMatchTheRuling(during);
    const ca = a.truth.crossings.find((c) => c.solid)!;
    expect(ca.uTurn).toBe(true);
    expect(ca.i).toBeLessThanOrEqual(a.truth.turnRounds[0].endI);
    expectOneNamedUTurn(during, 3);

    const after = driveLiveRung(SC_MV_UTURN_BAN, 3, runOut(5.9));
    const b = expectRowsMatchTheRuling(after);
    const cb = b.truth.crossings.find((c) => c.solid)!;
    expect(cb.why).toBe("after-the-turn-round");
    expect(cb.i).toBeGreaterThan(b.truth.turnRounds[0].endI);
    expectOneCrossingKept(after, 3);
  });
  it("L3: …and steering BACK ends the swing at once — the full-lock turn on his own half at y 150 (r 6.0, 180° round, the centre 0.19 m short of the axis), then eased the other way over the axis with no straight between → a crossing", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, ownHalfTurn(12.19, 150, 6.0, 0, false));
    const { truth } = expectRowsMatchTheRuling(o);
    expect(truth.crossings.find((c) => c.solid)!.why).toBe("after-the-turn-round");
    expectOneCrossingKept(o, 3);
  });
});

describe("§Y4 pulled out or astride, then a round to the RIGHT back over the solid axis inside the span — the U-turn, wherever he ends", () => {
  for (const level of [1, 3, 4] as const) {
    it(`L${level}: R2c — wholly across for 20 m, a right-hand round on r 5, ending southbound in his OWN inner lane → the pull-out's row is named the U-turn, with the U-turn's corrective`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, r2c());
      const { truth } = expectRowsMatchTheRuling(o);
      const tr = truth.turnRounds[0];
      expect(tr.beginSolid).toBe(true);
      // He ends on the half he set out on, facing its traffic.
      const last = o.ticks[o.ticks.length - 1];
      expect(last.position.x).toBeGreaterThan(0);
      expect(Math.abs(wrap180(last.headingDeg - 180))).toBeLessThan(5);
      const row = expectOneNamedUTurn(o, level);
      // The row is the pull-out's own bill, named when the turn-round is confirmed.
      expect(row.t).toBeLessThan(tr.confirmedT);
    });
  }
  it("L3: R2 — pulled out to the oncoming outer lane, a right-hand round on r 8 ending at x +3.8 on his own half → named", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, r2(8));
    expectRowsMatchTheRuling(o);
    expect(o.ticks[o.ticks.length - 1].position.x).toBeGreaterThan(0);
    expectOneNamedUTurn(o, 3);
  });
  it("L3: R2 on r 6.2 — the round brings the centre back over the axis only at its very end (0.21 m onto his own half, 165° round, after the turn-round was confirmed and had named the pull-out's row) → still ONE U-turn: the second crossing of the same swing is not billed again (round 4 billed it as a second crossing). ROUND 6, R6-2: he then drives 24 m southbound 0.21 m over the axis on the half that runs north — once the swing has ended that is a new crossing, billed once", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, r2(6.2));
    const { truth } = expectRowsMatchTheRuling(o);
    expect(truth.turnRounds.length).toBe(1);
    // Two solid crossings — out, and back at the end of the round — and both belong to the one turn-round.
    const solid = truth.crossings.filter((c) => c.solid);
    expect(solid.map((c) => c.uTurn)).toEqual([true, true]);
    expect(solid[1].i).toBeGreaterThan(truth.turnRounds[0].confirmedI);
    const last = o.ticks[o.ticks.length - 1];
    expect(last.position.x).toBeGreaterThan(0);
    expect(last.position.x).toBeLessThan(0.5);
    expectOneNamedUTurn(o, 3);
    for (const g of o.glass) expect(g.titleBg).not.toBe(UTURN_TITLE);
    const rows = crossingRows(o);
    expect(rows.map((r) => r.detail)).toEqual([UTURN_ACT, ASTRIDE_ACT]);
    // Nothing is billed between the U-turn's row and the end of its swing — the second crossing is the same act.
    expect(rows[1].t).toBeGreaterThan(truth.wrongHalfRuns[0].fromT + 0.5);
    expect(truth.wrongHalfRuns[0].fromT).toBeGreaterThan(solid[1].t);
  });
  it("L3: R10 — ASTRIDE 0.4 m, a right-hand round on r 5 (the centre is back on his own half 23° round, mid-swing), then on to the far half → the straddle's row is the U-turn (the turn-round began astride the solid axis); the later crossing is a crossing", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, r10());
    const { rows } = expectRowsMatchTheRuling(o);
    expect(rows[0].detail).toBe(UTURN_ACT);
    for (const r of rows.slice(1)) expect(r.titleBg).toBe(CROSSING_TITLE);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(o.debrief).toContain(UTURN_CORRECTIVE);
  });
});

describe("§R5-2 (i) asks WHERE the centre crossed the axis, not which way it was going", () => {
  /**
   * After the lesson's lawful turn (southbound on the west half): out over the
   * DASHES near y 233 onto the oncoming half, on into the span on it, and a
   * round to the right (toward his own half) on r 6.3 begun at y0.
   */
  function outOverDashesThenRoundBack(y0: number): DriveScript {
    const a = arc(4.06, y0, 180, 6.3, -180);
    return {
      steps: [
        ...lawfulHead(),
        { kind: "drive", points: [[-12.19, 264], [-12.19, 255], [-4.06, 243], [4.06, 224], [4.06, r3(y0)]], targetKmh: 40, stopAtEnd: false },
        { kind: "drive", points: a.pts, targetKmh: 12, stopAtEnd: false },
        ...tail(a.x, a.y, 0, 8),
      ],
    };
  }
  for (const level of [1, 3] as const) {
    it(`L${level}: out over the dashes, into the span on the oncoming half (billed there by the plain detector, as on every lesson — the recorded class X4), and a round to the right begun at y 195 BACK over the solid axis → the turn-round began over the solid axis and the centre went over the solid axis during it: that bill is named the U-turn (one row)`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, outOverDashesThenRoundBack(195));
      const truth = oracle(o.ticks);
      // From the pose: the way OUT is over the dashes, the way BACK over the solid axis, during a turn-round begun inside the span.
      const after = truth.crossings.filter((c) => c.t > truth.turnRounds[0].confirmedT);
      expect(after.map((c) => [c.from, c.solid, c.uTurn])).toEqual([
        ["W", false, false],
        ["E", true, true],
      ]);
      const back = truth.turnRounds[1];
      expect(back.beginSolid).toBe(true);
      expect(back.confirmedT).toBeLessThan(o.session.endedAtSec ?? Number.POSITIVE_INFINITY);
      const rows = crossingRows(o);
      expect([rows[0].detail, rows[0].titleBg]).toEqual([UTURN_ACT, UTURN_TITLE]);
      // (R6-2: he ends northbound on the half that runs north — home; no further row.)
      expect(rows.slice(1).filter((r) => !isWrongHalfRunBill(truth, r.t))).toEqual([]);
      // The bill went out on the oncoming half, before he came back over the axis.
      expect(rows[0].t).toBeLessThan(after[1].t);
      expect(tickAt(o, rows[0].t).position.x).toBeGreaterThan(0);
      expect(o.debrief).toContain(UTURN_CORRECTIVE);
      if (rows.length === 1) expect(o.debrief).not.toMatch(OVERTAKING_ADVICE);
    });
  }
});

describe("§Y5 THE PLACE IS WHERE THE TURN-ROUND BEGINS — the same turn either side of each end of the solid line", () => {
  for (const [y0, level] of [
    [212, 3],
    [214, 3],
    [215.5, 3],
    [216, 1],
    [216, 3],
    [216, 4],
    [217, 3],
    [219, 3],
  ] as const) {
    it(`L${level}: S1 — astride 0.3 m, the turn (r 6) begun at y ${y0}, ${(SPAN.toY - y0).toFixed(1)} m before the solid line ends → the U-turn`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, s1(y0));
      const { truth } = expectRowsMatchTheRuling(o);
      const tr = truth.turnRounds[0];
      expect(Math.abs(tr.beginY! - y0)).toBeLessThan(0.5);
      expect(tr.beginSolid).toBe(true);
      expectOneNamedUTurn(o, level);
    });
  }
  for (const [y0, level] of [
    [221, 1],
    [221, 3],
    [221, 4],
    [220.5, 3],
    [225, 3],
  ] as const) {
    it(`L${level}: S1 — the same, begun at y ${y0}, ${(y0 - SPAN.toY).toFixed(1)} m past the end → the crossing keeps the crossing's copy`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, s1(y0));
      const { truth } = expectRowsMatchTheRuling(o);
      expect(truth.turnRounds[0].beginSolid).toBe(false);
      expectOneCrossingKept(o, level);
    });
  }
  it("L3: S1 on the demo radius (8.125) — begun 4 m before the end → the U-turn; 1 m past it → the crossing", () => {
    const before = driveLiveRung(SC_MV_UTURN_BAN, 3, s1(216, 8.125));
    expectRowsMatchTheRuling(before);
    expectOneNamedUTurn(before, 3);
    const past = driveLiveRung(SC_MV_UTURN_BAN, 3, s1(221, 8.125));
    expectRowsMatchTheRuling(past);
    expectOneCrossingKept(past, 3);
  });
  for (const [y0, named] of [
    [215, true],
    [216, true],
    [219, true],
    [221, false],
  ] as const) {
    it(`L3: S2 — pulled out wholly across, the turn (r 6) begun at y ${y0} → ${named ? "the U-turn" : "the crossing"}`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, s2(y0));
      expectRowsMatchTheRuling(o);
      if (named) expectOneNamedUTurn(o, 3);
      else expectOneCrossingKept(o, 3);
    });
  }
  for (const level of [1, 3] as const) {
    it(`L${level}: THE OTHER END (y 40), SOUTHBOUND after the lawful turn — astride the solid axis, the turn back north begun at y 44, 4 m before the solid line ends for him → the U-turn; begun at y 39, 1 m past it → the crossing; the lawful turn is billed by nothing either time`, () => {
      const before = driveLiveRung(SC_MV_UTURN_BAN, level, southboundAstrideThenRoundAt(44));
      const b = expectRowsMatchTheRuling(before);
      const turnBack = b.truth.turnRounds[1];
      // The session was still open when the turn back was confirmed (the route ends ~2 s later).
      expect(turnBack.confirmedT).toBeLessThan(before.session.endedAtSec ?? Number.POSITIVE_INFINITY);
      expect(turnBack.beginY!).toBeGreaterThan(SPAN.fromY);
      expect(turnBack.beginSolid).toBe(true);
      expect(b.rows.map((r) => r.detail)).toEqual([UTURN_ACT]);
      expect(before.debrief).toContain(UTURN_CORRECTIVE);

      const past = driveLiveRung(SC_MV_UTURN_BAN, level, southboundAstrideThenRoundAt(39));
      const p = expectRowsMatchTheRuling(past);
      expect(p.truth.turnRounds[1].confirmedT).toBeLessThan(past.session.endedAtSec ?? Number.POSITIVE_INFINITY);
      expect(p.truth.turnRounds[1].beginY!).toBeLessThan(SPAN.fromY);
      expect(p.truth.turnRounds[1].beginSolid).toBe(false);
      expect(p.rows.map((r) => r.titleBg)).toEqual([CROSSING_TITLE]);
      expectNoUTurnSaid(past);
    });
  }
  it("L3: R5-2 (iii) at the START of the span, northbound — the outer-lane arc begun at y 30, over the dashes, whose centre crosses at y 42.2 where the axis is solid → billed, on the crossing's copy: the turn-round did not begin where the axis is solid", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, outerArc(12.19, 30));
    const { truth } = expectRowsMatchTheRuling(o);
    expect(truth.turnRounds[0].beginSolid).toBe(false);
    expect(truth.crossings.find((c) => c.solid)!.why).toBe("begun-over-dashes");
    expectOneCrossingKept(o, 3);
  });
});

describe("§Y2 a place measured on the carriageway is KEPT when the road later loses its fix on the car", () => {
  for (const r of [19, 22, 25] as const) {
    it(`L3: R7 — from the outer lane at y 100, one arc on r ${r} (${(2 * r - 12.19).toFixed(1)} m past the axis at its widest), and back onto the far half → the U-turn`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, r7(r));
      const { truth } = expectRowsMatchTheRuling(o);
      const tr = truth.turnRounds[0];
      expect(tr.beginSolid).toBe(true);
      expect(Math.abs(tr.beginY! - 100)).toBeLessThan(1.5);
      expectOneNamedUTurn(o, 3);
    });
  }
  it("the r 22 and r 25 turns really do leave the road's fix (the centre more than 30 m from the axis), and r 19 does not", () => {
    const far = (r: number) => Math.min(...driveLiveRung(SC_MV_UTURN_BAN, 3, r7(r)).ticks.map((k) => k.position.x));
    expect(far(19)).toBeGreaterThan(-30);
    expect(far(22)).toBeLessThan(-30);
    expect(far(25)).toBeLessThan(-30);
  });
});

describe("§Y3 / R5-4 THE DEBRIEF SPEAKS FOR EACH ACT — a drive with a U-turn and a plain crossing gives each its own reason and its own corrective", () => {
  for (const level of [1, 3] as const) {
    it(`L${level}: V1 — the demo-radius U-turn at y 150 (coached, the lesson's own mistake), then a drift east over the solid axis and back (charged) → the U-turn keeps «Защо» and the U-turn's corrective; the crossing keeps the crossing's`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, v1());
      const { rows } = expectRowsMatchTheRuling(o);
      expect(rows.map((r) => `${r.where}:${r.detail ?? "pooled"}`)).toEqual([`coached:${UTURN_ACT}`, `scored:${ASTRIDE_ACT}`]);
      const d = o.debrief;
      expect(d).toContain(`не е взет: допусна „${UTURN_TITLE}“ — точно грешката, която този урок учи`);
      // The named U-turn has its own block: title, reason, corrective.
      const block = d.slice(d.indexOf("Грешката на този урок"));
      expect(d).toContain("Грешката на този урок");
      expect(block).toContain(`• ${UTURN_TITLE}`);
      expect(block).toContain(`→ Защо: ${UTURN_SENTENCE}`);
      expect(block).toContain(`→ Правилното действие: ${UTURN_CORRECTIVE}`);
      // The charged crossing has its own row with the crossing's corrective.
      expect(d).toContain(`• ${CROSSING_TITLE} — основна`);
      expect(d).toContain(`→ Правилното действие: ${CROSSING_CORRECTIVE}`);
      // Each corrective once: nothing is said twice.
      expect(d.split(UTURN_CORRECTIVE).length - 1).toBe(1);
      expect(d.split(CROSSING_CORRECTIVE).length - 1).toBe(1);
    });
  }
  it("L4: V1 — both rows are charged, and each prints its own corrective", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 4, v1());
    expectRowsMatchTheRuling(o);
    expect(o.debrief).toContain(`• ${UTURN_TITLE} — основна`);
    expect(o.debrief).toContain(`→ Правилното действие: ${UTURN_CORRECTIVE}`);
    expect(o.debrief).toContain(`• ${CROSSING_TITLE} — основна`);
    expect(o.debrief).toContain(`→ Правилното действие: ${CROSSING_CORRECTIVE}`);
  });
  for (const level of [1, 3] as const) {
    it(`L${level}: THE OTHER ORDER — a pull-out and back (coached, a crossing), then the demo-radius U-turn (charged) → the un-named crossing is given the crossing's corrective, never the U-turn's; the U-turn row has its own`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, crossingThenUTurn());
      const { rows } = expectRowsMatchTheRuling(o);
      expect(rows.map((r) => `${r.where}:${r.detail === UTURN_ACT ? UTURN_ACT : "crossing"}`)).toEqual(["coached:crossing", `scored:${UTURN_ACT}`]);
      const d = o.debrief;
      const block = d.slice(d.indexOf("Грешката на този урок"), d.indexOf("При повторение вече влиза и в изпитния лист."));
      expect(block).toContain(`• ${CROSSING_TITLE}`);
      expect(block).toContain(`→ Правилното действие: ${CROSSING_CORRECTIVE}`);
      expect(block).not.toContain(UTURN_CORRECTIVE);
      expect(block).not.toMatch(FORBIDDEN_HERE);
      expect(d).toContain(`• ${UTURN_TITLE} — основна`);
      expect(d).toContain(`→ Правилното действие: ${UTURN_CORRECTIVE}`);
    });
  }
});
