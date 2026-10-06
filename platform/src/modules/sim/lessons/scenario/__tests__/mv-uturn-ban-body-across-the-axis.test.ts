/**
 * WITNESS, ROUND 3 — sc-mv-uturn-ban: WHERE THE CAR IS ON THE ROAD, NOT WHICH
 * WAY ITS NOSE POINTS, DECIDES THREE THINGS.
 *
 * Round 2 decided «this crossing is a U-turn» from the road (the reversal
 * across the solid axis) and was refuted by an adversarial pass on three
 * points (journal wf_ff88a52b-6aa, verifier findings W1, W2, W3). Every act
 * below is that verifier's own geometry (zz-v2-glass / zz-v2-probe in
 * D:/knijka-lanes/scratch/uturn-verifier-r2), ported unchanged and driven
 * through the same live-rung chain (witnessLiveRung: the compiled rung →
 * createLessonSession → applyTick → buildLessonResult → buildDebrief).
 *
 *  W1  A COMPLETED U-turn kept the pooled title and the overtaking corrective
 *      whenever the centre was past the axis and within 10° of the road for
 *      about 5 m before the turn. The pull-out carve-out counted METRES with
 *      no lateral test: at 0.05–0.4 m past the axis the car (half-width
 *      0.85 m) still has its right wheels on its own half — it has not pulled
 *      out. Round 3 let a run count toward a pull-out only while the BODY was
 *      wholly on the far half; ROUND 4 (integrator ruling R4-2) removed the
 *      carve-out altogether — any reversal made inside the span by a car
 *      across or astride the solid axis is the U-turn, and the two §W1 pins
 *      that held «a real pull-out, then round, keeps the crossing» are
 *      flipped below (the witness for R4-1 / R4-2 is
 *      mv-uturn-ban-where-the-turn-is-made.test.ts).
 *  W2  The crossing card was shown BEFORE the centre crossed on tight U-turns
 *      from the outer lane (centre up to 4.4 m short of the axis, the crossing
 *      up to 2.2 s later), and a turn-round that NEVER crossed was billed as a
 *      crossing and the lesson refused for it. The plain detector reads «the
 *      nose opposes the bank the centre is on», which is true on the car's OWN
 *      half once the nose is past 90°. Now, in this lesson, nothing bills a
 *      crossing while the centre is still on the bank the car was travelling
 *      with.
 *  W3  «Пресече ИЗЦЯЛО …» was printed while the body still straddled the line.
 *      A centre across a solid axis is a crossing whatever the speed (that
 *      stays), but the sentence has to be true: «изцяло» is now printed only
 *      when the whole body is across, and a bill that lands on a straddle
 *      frame says what was measured — «Застъпи … и навлезе с повече от
 *      половината автомобил …» (ППЗДвП чл. 63, ал. 2, т. 1, retrieved from the
 *      bank: М1 „е забранено да я застъпват и пресичат").
 *
 * THE BODY IS MEASURED HERE INDEPENDENTLY OF THE PRODUCT: the chassis
 * rectangle (collision/bodies) turned to the tick's own heading, against the
 * axis of this straight road (x = 0). The product's own figure
 * (`SimTick.edgeAlignment.axisClearM`) is compared with it in §W3.
 *
 * KILL-CHECKS (each reddens this file on an assertion; restored, sha-verified):
 *   · (round 3; the rule it mutated is gone in round 4) the pull-out's lateral
 *     test removed;
 *   · the plain detector allowed to bill on the car's own half again;
 *   · «изцяло» printed on every crossing bill / on none.
 */

import { describe, expect, it } from "vitest";
import { PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../../collision/bodies";
import { VIOLATIONS, type SimTick } from "../../../rules";
import type { DriveScript } from "../../../traces/recorder";
import { SC_MV_UTURN_BAN } from "../templates-parking2";
import { driveLiveRung, type LiveRungOutcome } from "./witnessLiveRung";

const UTURN_ACT = "u-turn";
const ASTRIDE_ACT = "astride";
const UTURN_TITLE = "Обратен завой през непрекъсната осева линия";
const CROSSING_TITLE = "Пресичане на непрекъсната осева линия";
const WHOLLY_SENTENCE = "Пресече изцяло непрекъснатата осева линия и навлезе в насрещната половина на платното.";
const ASTRIDE_SENTENCE =
  "Застъпи непрекъснатата осева линия и навлезе с повече от половината автомобил в насрещната половина на платното.";
const UTURN_SENTENCE = "Пресече непрекъснатата осева линия и зави в обратна посока";
const OVERTAKING_ADVICE = /Изпреварвай или заобикаляй|дори предният да пълзи/u;
const UTURN_CORRECTIVE = "Обратен завой не се прави през плътна линия";
const CLEAN_PRAISE = /чисто каране по изпитния лист|оценката е за незавършения маршрут, не за карането/u;
const ALL_RUNGS = [1, 2, 3, 4, 5] as const;
type Rung = (typeof ALL_RUNGS)[number];

// ---------------------------------------------------------------------------
// geometry — the verifier's own helpers (zz-v2-glass.test.ts), verbatim
// ---------------------------------------------------------------------------

type Pt = [number, number];
type Steps = DriveScript["steps"];
const rad = (d: number) => (d * Math.PI) / 180;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
function wrap180(d: number): number {
  let x = d;
  while (x > 180) x -= 360;
  while (x <= -180) x += 360;
  return x;
}
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
/** The slide every straddle act starts with: outer lane → 1.2 m from the axis, parallel. */
const slideIn = (y0: number): Steps => [
  { kind: "glance", mirror: "rear" },
  { kind: "drive", points: [[12.19, 15], [12.19, y0 - 50]], targetKmh: 46, stopAtEnd: false },
  { kind: "glance", mirror: "left" },
  { kind: "indicator", setting: "left" },
  { kind: "drive", points: [[12.19, y0 - 50], [6, y0 - 28], [1.2, y0 - 10], [1.2, y0]], targetKmh: 20, stopAtEnd: false },
];

// ---- W1 acts ---------------------------------------------------------------

/** G9 — ease left over the line at 6° until the centre is 0.4 m past it, then the demo radius at once. */
function g9(): DriveScript {
  const sl = line(1.2, 100, 6, 1.6 / Math.sin(rad(6)));
  const a = arc(-0.4, sl.y, 0, 8.125, 180);
  return {
    steps: [
      ...slideIn(100),
      { kind: "drive", points: [...sl.pts, [r3(-0.4), r3(sl.y + 0.001)]], targetKmh: 9, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      ...tail(a.x, a.y, 180),
    ],
  };
}
/** G1 (every rung) — centre 0.15 m over the line, 6 m parallel, then one arc of r = 7. */
function g1Rung(): DriveScript {
  const over = 0.15;
  const a = arc(-over, 126, 0, 7, 180);
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[12.19, 15], [12.19, 60]], targetKmh: 46, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[12.19, 60], [6, 80], [1.2, 100], [-over, 120], [-over, 126]], targetKmh: 14, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      ...tail(a.x, a.y, 180),
    ],
  };
}
/** G1 (L3 variants) — slide to `over` metres past the axis, `run` metres parallel, then r = 7 round. */
function g1(over: number, run: number, kmh: number): DriveScript {
  const slideLen = 12;
  const a = arc(-over, 100 + slideLen + run, 0, 7, 180);
  return {
    steps: [
      ...slideIn(100),
      { kind: "drive", points: [[1.2, 100], [-over, 100 + slideLen], [-over, 100 + slideLen + run]], targetKmh: kmh, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: Math.min(kmh, 12), stopAtEnd: false },
      ...tail(a.x, a.y, 180),
    ],
  };
}
/** G8 — slide over at `deg`, hold `run` metres parallel with the centre `over` past the axis, then one arc of radius r. */
function g8(deg: number, over: number, run: number, r: number): DriveScript {
  const slideLen = (1.2 + over) / Math.sin(rad(deg));
  const sl = line(1.2, 100, deg, slideLen);
  const a = arc(-over, sl.y + run, 0, r, 180);
  return {
    steps: [
      ...slideIn(100),
      { kind: "drive", points: [...sl.pts, [r3(-over), r3(sl.y + run + 0.001)]], targetKmh: 9, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      ...tail(a.x, a.y, 180),
    ],
  };
}
/** A6 — from 1.1 m inside the lane: straight at `deg` to the axis, `L` metres more, then full lock left (r = 6). */
function a6(deg: number, L: number, kmh: number): DriveScript {
  const toAxis = line(1.1, 118, deg, 1.1 / Math.sin(rad(deg)));
  const run = line(toAxis.x, toAxis.y, deg, L);
  const a = arc(run.x, run.y, deg, 6, 180 - deg);
  return {
    steps: [
      ...approach(1.1, 118, false),
      { kind: "drive", points: [...toAxis.pts, ...run.pts.slice(1), ...a.pts.slice(1)], targetKmh: kmh, stopAtEnd: false },
      ...tail(a.x, a.y, 180),
    ],
  };
}
/** B3 — a real pull-out: across at `deg` to the middle of the oncoming lane, `runM` metres along it, and back. */
function pullOutAndBack(deg: number, runM: number, kmh: number): DriveScript {
  const out = line(4.06, 100, deg, (4.06 + 4.06) / Math.sin(rad(deg)));
  const run = line(out.x, out.y, 0, runM);
  const back = line(run.x, run.y, -deg, (4.06 + 4.06) / Math.sin(rad(deg)));
  return {
    steps: [
      ...approach(4.06, 100, false),
      { kind: "drive", points: [...out.pts, ...run.pts.slice(1), ...back.pts.slice(1)], targetKmh: kmh, stopAtEnd: false },
      ...tail(back.x, back.y, 0, 20),
    ],
  };
}
/** A real pull-out that simply carries on up the oncoming half and stops there. */
function pullOutAndCarryOn(): DriveScript {
  const out = line(4.06, 100, 20, (4.06 + 4.06) / Math.sin(rad(20)));
  return {
    steps: [
      ...approach(4.06, 100, false),
      { kind: "drive", points: [...out.pts, [-4.06, r3(out.y + 60)]], targetKmh: 30 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** The body WHOLLY across (`over` ≥ 1.5 m), `run` metres parallel, then r = 7 round — the pull-out rule's own two sides. */
const whollyAcrossThenRound = (over: number, run: number): DriveScript => g1(over, run, 9);

/**
 * A real pull-out and back (30°, 10 m up the oncoming lane at 30 км/ч), and
 * THEN — a second act, forty metres on — the demo's own U-turn.
 */
function pullOutAndBackThenUTurn(): DriveScript {
  const out = line(4.06, 100, 30, (4.06 + 4.06) / Math.sin(rad(30)));
  const run = line(out.x, out.y, 0, 10);
  const back = line(run.x, run.y, -30, (4.06 + 4.06) / Math.sin(rad(30)));
  const yTurn = r3(back.y + 30);
  const a = arc(4.06, yTurn, 0, 8.125, 180);
  return {
    steps: [
      ...approach(4.06, 100, false),
      { kind: "drive", points: [...out.pts, ...run.pts.slice(1), ...back.pts.slice(1)], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[r3(back.x), r3(back.y)], [4.06, yTurn]], targetKmh: 20 },
      { kind: "pause", sec: 0.8, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      ...tail(a.x, a.y, 180),
    ],
  };
}

// ---- W2 acts ---------------------------------------------------------------

/** G2 — one arc of radius r from (x0, 120): tight turns from the outer lane. */
function outerArc(x0: number, r: number): DriveScript {
  const a = arc(x0, 120, 0, r, 180);
  return { steps: [...outerApproach(x0, 120), { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false }, ...tail(a.x, a.y, 180, 20)] };
}
/**
 * G2b — the nose 115° round on the OWN half, then steered back to north. From
 * the outer lane (`x0` = 12.19, back on r = 6 — the verifier's act) the swing
 * back carries the car ACROSS the axis and it ends northbound on the far half;
 * from the kerb (`x0` = 14.5, back on r = 3) it never reaches the axis.
 */
function ownHalfThenBack(x0: number, rBack: number): DriveScript {
  const a = arc(x0, 120, 0, 6.5, 115);
  const b = arc(a.x, a.y, 115, rBack, -115);
  return {
    steps: [...outerApproach(x0, 120), { kind: "drive", points: [...a.pts, ...b.pts.slice(1)], targetKmh: 9, stopAtEnd: false }, ...tail(b.x, b.y, 0, 20)],
  };
}

/**
 * A turn-round made wholly on the OWN half from the kerb (never crosses), and
 * then — now southbound on the northbound half — a drift over the solid axis
 * onto the far half.
 */
function ownHalfTurnThenCross(): DriveScript {
  const a = arc(14.5, 120, 0, 6.2, 180);
  return {
    steps: [
      ...outerApproach(14.5, 120),
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [r3(a.x), 110], [-4.06, 90], [-4.06, 70]], targetKmh: 25 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

// ---- W3 acts ---------------------------------------------------------------

/** G7 — creeping straddle: the centre 0.3 m over the line for 10 m at 4 км/ч, then back into lane. */
function creepStraddle(): DriveScript {
  return {
    steps: [
      ...approach(1.1, 110),
      { kind: "drive", points: [[1.1, 110], [-0.3, 118], [-0.3, 128], [1.1, 136], [1.1, 150]], targetKmh: 4 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** G7 — creeps in at about 90° and stops with the centre 0.4 m past the axis. */
function noseInStop(): DriveScript {
  const a = arc(4.06, 124, 0, 4.46, 90);
  return { steps: [...approach(4.06, 124), { kind: "drive", points: a.pts, targetKmh: 4 }, { kind: "pause", sec: 4, brake: true }] };
}
/** G5 — the demo radius from the inner lane. */
function demoInner(): DriveScript {
  const a = arc(4.06, 124, 0, 8.125, 180);
  return { steps: [...approach(4.06, 124), { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false }, ...tail(a.x, a.y, 180)] };
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
/**
 * How far the chassis rectangle reaches ACROSS this road from its centre:
 * h·|cos ψ| + l·|sin ψ| for a nose ψ off the road's direction (the road runs
 * due north, so ψ is the heading itself).
 */
function reachAcrossM(k: SimTick): number {
  const psi = rad(k.headingDeg);
  return PLAYER_HALF_WIDTH_M * Math.abs(Math.cos(psi)) + PLAYER_HALF_LENGTH_M * Math.abs(Math.sin(psi));
}
/** The whole body is west of the axis (the far half for a car that set out northbound on the east one). */
const bodyWhollyWest = (k: SimTick): boolean => k.position.x + reachAcrossM(k) <= 0;
/** The glass entries that speak of this crossing — whichever surface printed them. */
function crossingGlass(o: LiveRungOutcome): LiveRungOutcome["glass"] {
  return o.glass.filter((g) => g.titleBg === CROSSING_TITLE || g.titleBg === UTURN_TITLE);
}

/**
 * EVERY SENTENCE THE GLASS PRINTED ABOUT THE CROSSING IS TRUE ON ITS FRAME —
 * for a car that set out northbound on the east half (x > 0), so «the far
 * half» is x < 0:
 *   · nothing is shown while the centre is still on the car's own half, and
 *     the centre has been across for the crossing's own sustain (W2);
 *   · «изцяло» is printed only when the whole body is across; a bill on a
 *     straddle frame says «Застъпи … с повече от половината автомобил» (W3);
 *   · the U-turn's sentence is printed only on a frame where the car has
 *     turned round (nose within 45° of the far half's direction).
 * Returns how many entries it checked.
 */
function expectGlassTrue(o: LiveRungOutcome): number {
  const shown = crossingGlass(o);
  for (const g of shown) {
    const at = tickAt(o, g.t);
    const where = `${g.src} «${g.explanationBg.slice(0, 40)}…» at t=${g.t.toFixed(2)} x=${at.position.x.toFixed(2)} h=${wrap180(at.headingDeg).toFixed(1)}`;
    // W2 — the centre is across, and has been for the sustain.
    expect({ where, centreAcross: at.position.x < 0 }).toEqual({ where, centreAcross: true });
    let since = at.t;
    for (let i = o.ticks.indexOf(at); i >= 0 && o.ticks[i].position.x < 0; i--) since = o.ticks[i].t;
    expect({ where, acrossForSec: at.t - since >= 0.55 }).toEqual({ where, acrossForSec: true });
    // W3 — the sentence matches the body.
    if (g.titleBg === UTURN_TITLE) {
      expect(g.explanationBg).toContain(UTURN_SENTENCE);
      expect({ where, turnedRound: Math.abs(wrap180(at.headingDeg - 180)) <= 45 }).toEqual({ where, turnedRound: true });
      continue;
    }
    const wholly = bodyWhollyWest(at);
    expect({ where, saysWholly: g.explanationBg.includes("изцяло") }).toEqual({ where, saysWholly: wholly });
    // Round 6, R6-3 — the first sentence says «…в насрещната половина на платното» unless the car has already
    // turned round and is entering the half that runs its own way; then it is the same sentence without that clause.
    const ownWay = !g.explanationBg.includes("насрещната половина");
    const first = ownWay
      ? wholly
        ? "Пресече изцяло непрекъснатата осева линия."
        : "Застъпи непрекъснатата осева линия."
      : wholly
        ? WHOLLY_SENTENCE
        : ASTRIDE_SENTENCE;
    expect({ where, ownWayOnlyOnceTurnedRound: !ownWay || Math.abs(wrap180(at.headingDeg - 180)) < 90 }).toEqual({ where, ownWayOnlyOnceTurnedRound: true });
    expect(g.explanationBg.startsWith(first)).toBe(true);
    // The rest of the reason — what the М1 forbids — is the pooled row's own, on all four.
    expect(g.explanationBg.slice(first.length)).toBe(
      VIOLATIONS.CROSSED_SOLID_LINE.explanationBg.slice(WHOLLY_SENTENCE.length),
    );
  }
  return shown.length;
}

function expectTurnedRound(o: LiveRungOutcome): void {
  const last = o.ticks[o.ticks.length - 1];
  expect(Math.abs(wrap180(last.headingDeg - 180))).toBeLessThan(5);
  expect(last.position.x).toBeLessThan(0);
}

/** ONE bill, and it is the U-turn — row, debrief, corrective; never the overtaking advice, never praise. */
function expectNamedUTurn(o: LiveRungOutcome, level: Rung): Row {
  const rows = crossingRows(o);
  expect(rows.map((r) => `${r.where}:${r.detail ?? "pooled"}`)).toEqual([`${level === 4 ? "scored" : "coached"}:${UTURN_ACT}`]);
  expect(rows[0].titleBg).toBe(UTURN_TITLE);
  expect(o.debrief).toContain(UTURN_TITLE);
  expect(o.debrief).toContain(UTURN_CORRECTIVE);
  expect(o.debrief).not.toContain(CROSSING_TITLE);
  expect(o.debrief).not.toMatch(OVERTAKING_ADVICE);
  expect(o.debrief).not.toMatch(CLEAN_PRAISE);
  expect(o.result.passed).toBe(false);
  if (level === 4) {
    const billed = o.result.summary.mistakes.filter((m) => m.code === "CROSSED_SOLID_LINE");
    expect(billed.map((m) => [m.detail, m.titleBg, m.severityClass, m.points])).toEqual([[UTURN_ACT, UTURN_TITLE, "osnovna", 3]]);
  } else {
    const hits = (o.result.lessonMistakes ?? []).filter((h) => h.code === "CROSSED_SOLID_LINE");
    expect(hits.map((h) => [h.detail, h.charged])).toEqual([[UTURN_ACT, false]]);
    expect(o.debrief).toContain(`не е взет: допусна „${UTURN_TITLE}“ — точно грешката, която този урок учи`);
  }
  return rows[0];
}

/**
 * ONE bill, and it is the plain crossing — the crossing's title and the pooled
 * corrective, on whichever of its two true reasons the bill frame earned
 * (`pooled` = «изцяло», `astride` = the straddle); never the U-turn's.
 * (Round 6, R6-3: or one of the same two for a car that has already turned
 * round and enters the half that runs its own way — `own-way`,
 * `astride-own-way` — the reason without «…в насрещната половина».)
 */
function expectPlainCrossing(o: LiveRungOutcome, level: Rung): Row {
  const rows = crossingRows(o);
  expect(rows).toHaveLength(1);
  expect(rows[0].where).toBe(level === 4 ? "scored" : "coached");
  expect([undefined, ASTRIDE_ACT, "own-way", "astride-own-way"]).toContain(rows[0].detail);
  expect(rows[0].titleBg).toBe(CROSSING_TITLE);
  expect(o.debrief).toContain(CROSSING_TITLE);
  expect(o.debrief).not.toContain(UTURN_TITLE);
  expect(o.debrief).not.toMatch(/обратен завой, а/u);
  expect(o.debrief).not.toContain(UTURN_CORRECTIVE);
  for (const g of o.glass) expect(g.titleBg).not.toBe(UTURN_TITLE);
  // The row's act agrees with the body on the bill frame (whichever way the half it entered runs).
  const body = rows[0].detail === "own-way" ? undefined : rows[0].detail === "astride-own-way" ? ASTRIDE_ACT : rows[0].detail;
  expect(body).toBe(bodyWhollyWest(tickAt(o, rows[0].t)) ? undefined : ASTRIDE_ACT);
  return rows[0];
}

/** No crossing was billed, shown or held against the lesson. */
function expectNoCrossing(o: LiveRungOutcome): void {
  expect(crossingRows(o)).toEqual([]);
  expect(crossingGlass(o)).toEqual([]);
  expect((o.result.lessonMistakes ?? []).filter((h) => h.code === "CROSSED_SOLID_LINE")).toEqual([]);
  expect(o.drive.ruleEvents.filter((e) => e.kind === "violation" && e.code === "CROSSED_SOLID_LINE")).toEqual([]);
  expect(o.debrief).not.toContain(CROSSING_TITLE);
  expect(o.debrief).not.toContain(UTURN_TITLE);
  expect(o.debrief).not.toContain("изцяло");
}

// ---------------------------------------------------------------------------

describe("§W1 a U-turn begun astride the line is the U-turn — a straddle is not a pull-out", () => {
  for (const level of ALL_RUNGS) {
    it(`L${level}: G9 — ease left at 6° to 0.4 m past the axis, then the demo radius at once, 9 км/ч → named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, g9());
      expectTurnedRound(o);
      const row = expectNamedUTurn(o, level);
      // The W1 condition itself: at the bill the nose is within 10° of the road
      // and the body still straddles the line — round 2 began counting a
      // «pull-out» here.
      const at = tickAt(o, row.t);
      expect(Math.abs(wrap180(at.headingDeg))).toBeLessThan(10);
      expect(at.position.x).toBeLessThan(0);
      expect(bodyWhollyWest(at)).toBe(false);
      expect(expectGlassTrue(o)).toBeGreaterThan(0);
    });
  }

  for (const level of ALL_RUNGS) {
    it(`L${level}: G1 — the centre 0.15 m over the line, 6 m parallel, then r = 7 → named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, g1Rung());
      expectTurnedRound(o);
      expectNamedUTurn(o, level);
      expect(expectGlassTrue(o)).toBeGreaterThan(0);
    });
  }

  for (const [over, run, kmh] of [
    [0.05, 6, 9],
    [0.15, 5.5, 9],
    [0.5, 8, 14],
    [0.84, 6, 9],
  ] as const) {
    it(`L3: G1 — ${over} m over, ${run} m parallel at ${kmh} км/ч, then round → named (the body never left the line)`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, g1(over, run, kmh));
      expectTurnedRound(o);
      expectNamedUTurn(o, 3);
      expectGlassTrue(o);
    });
  }

  for (const [deg, L, kmh, level] of [
    [8, 6, 9, 1],
    [8, 6, 9, 3],
    [8, 6, 9, 4],
    [8, 12, 9, 3],
    [5, 6, 14, 3],
    [9.5, 6, 6, 3],
  ] as const) {
    it(`L${level}: A6 — a ${deg}° lead-in from 1.1 m inside the lane, ${L} m past the axis at ${kmh} км/ч, then full lock → named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, a6(deg, L, kmh));
      expectTurnedRound(o);
      expectNamedUTurn(o, level);
      expectGlassTrue(o);
    });
  }

  // 16 of the verifier's 36 pooled G8 rows — every slide angle, both
  // overshoots, runs 0–4 m, both radii.
  for (const [deg, over, run, r] of [
    [3, 0.05, 3, 8.125],
    [3, 0.05, 4, 5.5],
    [3, 0.4, 0, 5.5],
    [3, 0.4, 0, 8.125],
    [3, 0.4, 4, 8.125],
    [6, 0.05, 4, 5.5],
    [6, 0.4, 0, 8.125],
    [6, 0.4, 1, 5.5],
    [6, 0.4, 3, 8.125],
    [9, 0.05, 4, 8.125],
    [9, 0.4, 2, 5.5],
    [9, 0.4, 4, 8.125],
    [12, 0.05, 4, 8.125],
    [12, 0.4, 4, 8.125],
    [20, 0.05, 4, 8.125],
    [20, 0.4, 4, 8.125],
  ] as const) {
    it(`L3: G8 — slide ${deg}°, ${over} m over, ${run} m straight, r = ${r} → named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, g8(deg, over, run, r));
      expectTurnedRound(o);
      expectNamedUTurn(o, 3);
      expectGlassTrue(o);
    });
  }
});

describe("§W1 controls — a REAL pull-out (the body wholly on the far half, running parallel) that does NOT turn round keeps the crossing's copy", () => {
  for (const [deg, runM, kmh] of [
    [12, 40, 40],
    [30, 30, 30],
    [44, 20, 20],
  ] as const) {
    it(`L3: across at ${deg}°, ${runM} m up the oncoming lane at ${kmh} км/ч, and back → the crossing, never the U-turn`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, pullOutAndBack(deg, runM, kmh));
      const last = o.ticks[o.ticks.length - 1];
      expect(Math.abs(wrap180(last.headingDeg))).toBeLessThan(5);
      expect(last.position.x).toBeGreaterThan(0);
      // The body really was wholly across, for well over five metres.
      expect(o.ticks.filter(bodyWhollyWest).length).toBeGreaterThan(30);
      expectPlainCrossing(o, 3);
      expect(o.debrief).toMatch(OVERTAKING_ADVICE);
      expectGlassTrue(o);
    });
  }

  it("L3: a pull-out that carries on up the oncoming half and stops there → the crossing, never the U-turn", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, pullOutAndCarryOn());
    const last = o.ticks[o.ticks.length - 1];
    expect(Math.abs(wrap180(last.headingDeg))).toBeLessThan(5);
    expect(last.position.x).toBeLessThan(-3);
    expectPlainCrossing(o, 3);
    expectGlassTrue(o);
  });

  it("ROUND 4 (R4-2), flipped: the body WHOLLY across (1.5 m over) for 3 m then round → named; for 8 m then round → ALSO named (round 3: «the crossing was a pull-out»)", () => {
    const short = driveLiveRung(SC_MV_UTURN_BAN, 3, whollyAcrossThenRound(1.5, 3));
    expectTurnedRound(short);
    expectNamedUTurn(short, 3);
    const long = driveLiveRung(SC_MV_UTURN_BAN, 3, whollyAcrossThenRound(1.5, 8));
    expectTurnedRound(long);
    expectNamedUTurn(long, 3);
    // …though on that drive the body was wholly across, nose along the road, for more than 5 m —
    // round 3's own measure of a pull-out. He turned round inside the span all the same.
    const parallelAcross = long.ticks.filter((k) => bodyWhollyWest(k) && Math.abs(wrap180(k.headingDeg)) <= 10);
    const ys = parallelAcross.map((k) => k.position.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(5);
    expectGlassTrue(long);
  });
});

describe("§W1 the envelope's own edges, measured — round 3 drew a line here; round 4 (R4-2) names both sides of it", () => {
  // The A6 lead-in at 8°: the body (reach 1.12 m at 8°) is wholly across only
  // once the centre is 8 m past the crossing, so a 12 m lead-in has run under
  // 5 m «in the oncoming lane» and a 16 m one more than 5.
  it("L3: A6 at 8° — 12 m past the axis is the U-turn; and 16 m past it, where the car has been wholly in the oncoming lane, nose along the road, for over 5 m, it is the U-turn too (round 3: «a pull-out by the rule»)", () => {
    const named = driveLiveRung(SC_MV_UTURN_BAN, 3, a6(8, 12, 9));
    const whollyParallel = (o: LiveRungOutcome) =>
      o.ticks.filter((k) => bodyWhollyWest(k) && Math.abs(wrap180(k.headingDeg)) <= 10).map((k) => k.position.y);
    const span = (ys: number[]) => (ys.length === 0 ? 0 : Math.max(...ys) - Math.min(...ys));
    expect(span(whollyParallel(named))).toBeLessThan(5);
    expectNamedUTurn(named, 3);
    const pulledOut = driveLiveRung(SC_MV_UTURN_BAN, 3, a6(8, 16, 9));
    expectTurnedRound(pulledOut);
    expect(span(whollyParallel(pulledOut))).toBeGreaterThan(5);
    expectNamedUTurn(pulledOut, 3);
    expectGlassTrue(pulledOut);
  });

  it("L3: one drive, two acts — a pull-out and back, then the U-turn: the amendment names the bill it is addressed to, and the pull-out's row stays the crossing", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, pullOutAndBackThenUTurn());
    expectTurnedRound(o);
    const rows = crossingRows(o);
    // The first is the lesson's mistake the first time (coached); the second is
    // a repeat and goes on the sheet — and only IT is the U-turn.
    expect(rows.map((r) => [r.where, r.detail ?? "pooled", r.titleBg])).toEqual([
      ["coached", "pooled", CROSSING_TITLE],
      ["scored", UTURN_ACT, UTURN_TITLE],
    ]);
    expect(rows[1].t - rows[0].t).toBeGreaterThan(5);
    expectGlassTrue(o);
  });
});

describe("§W2 nothing bills a crossing while the centre is still on the car's own half", () => {
  for (const [x0, r, level] of [
    [12.19, 6.3, 3],
    [12.19, 6.5, 3],
    [12.19, 6.5, 1],
    [12.19, 6.5, 4],
    [12.19, 7.5, 3],
    [12.19, 9, 3],
    [8.125, 5.5, 3],
  ] as const) {
    it(`L${level}: a tight U-turn from x = ${x0} on r = ${r} — the nose is past 90° long before the centre crosses → nothing shown before the crossing, then named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, outerArc(x0, r));
      expectTurnedRound(o);
      // The W2 condition itself: on this arc the plain detector's own condition
      // («the nose opposes its bank», moving, inside the span) held while the
      // centre was still more than a metre short of the axis.
      const early = o.ticks.filter((k) => k.opposingBank === true && k.solidCenterLine === true && k.position.x > 1);
      expect(early.length).toBeGreaterThan(20);
      const row = expectNamedUTurn(o, level);
      // The bill is on a frame where the centre is across …
      expect(tickAt(o, row.t).position.x).toBeLessThan(0);
      // … and so is everything the glass printed.
      expect(expectGlassTrue(o)).toBeGreaterThan(0);
      // The recorder's own rule log agrees: one row, at the same frame.
      const logged = o.drive.ruleEvents.filter((e) => e.kind === "violation" && e.code === "CROSSED_SOLID_LINE");
      expect(logged.map((e) => e.t)).toEqual([row.t]);
    });
  }

  for (const [name, script, minX, level] of [
    ["outer lane, r = 6.0 (closest approach 0.19 m short of the axis)", outerArc(12.19, 6.0), 0.15, 3],
    ["outer lane, r = 6.0 (closest approach 0.19 m short of the axis)", outerArc(12.19, 6.0), 0.15, 4],
    ["from x = 14.5, r = 6.2 (closest approach 2.1 m short)", outerArc(14.5, 6.2), 2, 3],
    ["115° round on the own half from the kerb, then steered back north", ownHalfThenBack(14.5, 3), 0.9, 3],
  ] as const) {
    it(`L${level}: a turn-round that NEVER crosses — ${name} → not billed as a crossing, and the lesson is not refused for one`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, script);
      // The centre never reached the axis …
      expect(Math.min(...o.ticks.map((k) => k.position.x))).toBeGreaterThan(minX);
      // … though the nose was past 90° on its own half for seconds (what base billed).
      expect(o.ticks.filter((k) => k.opposingBank === true && k.solidCenterLine === true).length).toBeGreaterThan(30);
      expectNoCrossing(o);
      // «Урокът … не е взет: допусна …» is the refusal the false bill used to earn.
      expect(o.result.lessonMistakes ?? []).toEqual([]);
      expect(o.debrief).not.toContain("не е взет");
    });
  }
});

describe("§W2 …and a crossing that follows such a swing is billed where the centre crosses, as what it is", () => {
  it("L3: G2b — 115° round on the own half, then steered back north ACROSS the axis → nothing shown before the centre crosses; a crossing, never a U-turn", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, ownHalfThenBack(12.19, 6));
    // He ends northbound on the far half: across, and not turned round.
    const last = o.ticks[o.ticks.length - 1];
    expect(Math.abs(wrap180(last.headingDeg))).toBeLessThan(5);
    expect(last.position.x).toBeLessThan(-5);
    // The nose was past 90° on his own half first — the frames base and round 2 billed.
    expect(o.ticks.filter((k) => k.opposingBank === true && k.solidCenterLine === true && k.position.x > 1).length).toBeGreaterThan(20);
    const row = expectPlainCrossing(o, 3);
    expect(tickAt(o, row.t).position.x).toBeLessThan(0);
    expect(expectGlassTrue(o)).toBeGreaterThan(0);
  });
});

describe("§W2 → R5-2 (ii): turned round on the own half, THEN across the solid axis — the crossing is made by a car already travelling the other way: ONE bill, the crossing's own (round 3 named it the U-turn; the integrator's round-5 ruling: a turn-round names a crossing made before or during it, never one made after it)", () => {
  for (const level of [3, 4] as const) {
    it(`L${level}: nothing while he turns round short of the line; when the centre then crosses it he has crossed the solid axis → ONE bill, the crossing's, true on its frame; nothing says a U-turn was made where it is forbidden`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, ownHalfTurnThenCross());
      expectTurnedRound(o);
      const row = expectPlainCrossing(o, level);
      // Round 6, R6-3 — he is travelling south by then and enters the half that runs south: the reason does not say «насрещната».
      expect(["own-way", "astride-own-way"]).toContain(row.detail);
      for (const g of o.glass) if (g.titleBg === CROSSING_TITLE) expect(g.explanationBg).not.toContain("насрещната половина");
      // The turn-round itself was made on the own half, 2 m short of the axis …
      const turned = o.ticks.find((k) => Math.abs(wrap180(k.headingDeg - 180)) < 1)!;
      expect(turned.position.x).toBeGreaterThan(2);
      expect(turned.t).toBeLessThan(row.t - 2);
      // … and the bill waits for the crossing: the centre across, the nose already the other way.
      const at = tickAt(o, row.t);
      expect(at.position.x).toBeLessThan(0);
      expect(Math.abs(wrap180(at.headingDeg - 180))).toBeLessThan(45);
      expect(expectGlassTrue(o)).toBeGreaterThan(0);
      for (const g of crossingGlass(o)) expect(g.titleBg).toBe(CROSSING_TITLE);
      expect(o.debrief).not.toContain(UTURN_TITLE);
      expect(o.debrief).not.toContain(UTURN_CORRECTIVE);
    });
  }
});

describe("§W3 «изцяло» is printed only when the whole body is across — a straddle bill says what was measured", () => {
  for (const level of [3, 4] as const) {
    it(`L${level}: G7 — a creeping straddle (centre ~0.3 m over at 4 км/ч, then back) is STILL billed, and the reason does not say «изцяло»`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, creepStraddle());
      const row = expectPlainCrossing(o, level);
      const at = tickAt(o, row.t);
      // A centre across a solid axis is a crossing whatever the speed …
      expect(at.position.x).toBeLessThan(0);
      expect(at.speedKmh).toBeLessThan(5);
      // … but the body is astride the line there, and never got wholly across at all.
      expect(o.ticks.some(bodyWhollyWest)).toBe(false);
      expect(row.detail).toBe(ASTRIDE_ACT);
      expect(expectGlassTrue(o)).toBeGreaterThan(0);
      expect(o.debrief).toContain(ASTRIDE_SENTENCE);
      expect(o.debrief).not.toContain("изцяло");
      // The product's own figure for the body agrees with the independent one.
      expect(at.edgeAlignment?.axisClearM).toBeCloseTo(-at.position.x - reachAcrossM(at), 3);
      expect(at.edgeAlignment!.axisClearM!).toBeLessThan(0);
    });
  }

  it("L3: G7 — nose-in at ~90°, stopped with the centre 0.4 m past the axis → billed, on the straddle sentence", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, noseInStop());
    const row = expectPlainCrossing(o, 3);
    expect(row.detail).toBe(ASTRIDE_ACT);
    expect(o.ticks.some(bodyWhollyWest)).toBe(false);
    expect(expectGlassTrue(o)).toBeGreaterThan(0);
    expect(o.debrief).not.toContain("изцяло");
  });

  for (const level of [1, 3, 4] as const) {
    it(`L${level}: G5 — the demo radius from the inner lane: the bill lands with the tail still on the own half → the straddle sentence on the glass, the U-turn in the debrief`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, demoInner());
      expectTurnedRound(o);
      const row = expectNamedUTurn(o, level);
      const at = tickAt(o, row.t);
      expect(at.position.x).toBeLessThan(0);
      expect(bodyWhollyWest(at)).toBe(false);
      const shown = crossingGlass(o);
      expect(shown.length).toBeGreaterThan(0);
      for (const g of shown) {
        expect(g.titleBg).toBe(CROSSING_TITLE);
        expect(g.explanationBg.startsWith(ASTRIDE_SENTENCE)).toBe(true);
      }
      expectGlassTrue(o);
      expect(o.debrief).not.toContain("изцяло");
    });
  }

  it("L3: a pull-out at 30° and 30 км/ч — the bill lands with the whole body across → «Пресече изцяло» is printed, and is true", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, pullOutAndBack(30, 30, 30));
    const row = expectPlainCrossing(o, 3);
    const at = tickAt(o, row.t);
    expect(bodyWhollyWest(at)).toBe(true);
    expect(row.detail).toBeUndefined();
    const shown = crossingGlass(o);
    expect(shown.length).toBeGreaterThan(0);
    for (const g of shown) expect(g.explanationBg).toBe(VIOLATIONS.CROSSED_SOLID_LINE.explanationBg);
    expectGlassTrue(o);
    expect(at.edgeAlignment?.axisClearM).toBeCloseTo(-at.position.x - reachAcrossM(at), 3);
    expect(at.edgeAlignment!.axisClearM!).toBeGreaterThanOrEqual(0);
  });
});
