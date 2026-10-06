/**
 * WITNESS, ROUND 4 — sc-mv-uturn-ban: WHERE THE TURN-ROUND IS MADE decides
 * whether a completed reversal is the lesson's U-turn. Nothing that came
 * before it does.
 *
 * Round 3 named a row the U-turn whenever the car reversed while its centre
 * was still past a solid axis it had crossed — and was refuted by an
 * adversarial pass on a defect it introduced (journal wf_16d79e13-c1c,
 * verifier finding X1): a student who let his centre sit 5 cm over the line
 * for the last six metres of the span, held that to the gap, stopped, and made
 * the lesson's own LAWFUL arc at y 264 was told, 21 s after a correct crossing
 * card and 48.7 m past the end of the solid line, that he had made «обратен
 * завой, а на това място той е забранен», and advised to go on to where the
 * axis is dashed and turn there — which is what he had done.
 *
 * THE TWO INTEGRATOR RULINGS THIS FILE PINS, every act through the live-rung
 * chain (witnessLiveRung: the compiled rung → createLessonSession → applyTick
 * → buildLessonResult → buildDebrief):
 *
 *  R4-1 PLACE. A reversal names a row the U-turn ONLY if the turn-round itself
 *       is made where the axis is SOLID, read off the built road's own record
 *       of the axis under the car (`tick.solidCenterLine` — the source the
 *       crossing bill reads) at THE TURN STATION:
 *
 *         the centre's station on the first frame of the turn-round — the last
 *         unbroken run of frames, ending at the completed reversal, on which
 *         the centre is past the axis AND the nose is no longer WITH the
 *         direction the car was travelling (more than 45° off it).
 *
 *       The run is followed past the kerb too (§R4-1 PAST THE KERB): a
 *       turn-round made on the verge is placed where it is made, and one made
 *       where the road has no fix on the car at all is unplaced — never the
 *       place of an earlier swing.
 *
 *       So for a car that turns ACROSS the axis that is where the centre
 *       crosses it (or, begun beside the axis, where the nose passes 45° a
 *       metre or two on); for a car ALREADY across — astride, or pulled out —
 *       it is where it stops travelling along the road and swings round. A
 *       reversal whose turn station is over a DASHED axis is a lawful U-turn:
 *       it is not billed and it NEVER renames an earlier row, however long
 *       the car has straddled or stayed across since.
 *  R4-2 PULL-OUT THEN TURN-ROUND. ANY reversal made inside the solid span by a
 *       car that is across or astride the solid axis is the lesson's U-turn —
 *       named, with the U-turn's corrective — whatever came before it: a
 *       straddle, a full pull-out that ran parallel for any distance, a
 *       continuous shallow lead-in that never runs parallel. The 5 m / 10°
 *       pull-out carve-out is gone: it decided nothing the place test does
 *       not decide.
 *
 * THE TRUTH IS MEASURED HERE INDEPENDENTLY OF THE PRODUCT: the turn station is
 * recomputed from the raw pose (this road runs due north with its axis at
 * x = 0 and its М1 from y 40 to y 220) and compared with what the row says.
 *
 * Every act of §X1 and §R4-2 is the round-3 verifier's own geometry
 * (D:/knijka-lanes/scratch/uturn-verifier-r2/r3, rows N21*, N1, N2, N31, G1),
 * ported unchanged.
 *
 * ROUND 5 (integrator ruling R5-1 … R5-3, journal wf_74b8f25e-b7e → round 5)
 * REPLACED THE PLACE'S DEFINITION and three pins of this file moved with it:
 * the place is where the turn-round BEGINS (the last frame before the swing
 * that carries the nose out of the 45° band), on whichever half the centre
 * is — not the first frame the centre is across with the nose past 45°. So
 * §«THE SAME TURN either side of the end» now builds its acts by where the
 * turn BEGINS; an arc begun beside the axis 4.8 m before the end of the solid
 * line (round 4's «band that remains») is the U-turn; the outer-lane arc begun
 * at y 30, over the dashes, whose centre crosses at y 42.2 keeps the
 * crossing's copy; and the southbound turn back begun at y 43.5 is the U-turn.
 * The Y1 class this definition was ruled for is pinned in
 * mv-uturn-ban-one-definition-of-the-act.test.ts.
 *
 * KILL-CHECKS (each reddens this file on an assertion; restored, sha-verified):
 *   · the place test removed (any reversal past a standing solid crossing names);
 *   · the place test reading the BILL's station instead of the turn's;
 *   · R4-2 reverted (the 5 m / 10° pull-out carve-out decides the name again);
 *   · the turn station HELD past the kerb (not followed there), and a turn-round
 *     with no fix on the road left placed.
 */

import { describe, expect, it } from "vitest";
import { PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../../collision/bodies";
import type { SimTick } from "../../../rules";
import type { DriveScript } from "../../../traces/recorder";
import { scMvUturnBanShadowScript } from "../../../traces/scMvUturnBan";
import { SC_MV_UTURN_BAN } from "../templates-parking2";
import { oracle } from "./uturnActOracle";
import { driveLiveRung, type LiveRungOutcome } from "./witnessLiveRung";

const UTURN_ACT = "u-turn";
const ASTRIDE_ACT = "astride";
const UTURN_TITLE = "Обратен завой през непрекъсната осева линия";
const CROSSING_TITLE = "Пресичане на непрекъсната осева линия";
const WHOLLY_SENTENCE = "Пресече изцяло непрекъснатата осева линия и навлезе в насрещната половина на платното.";
const ASTRIDE_SENTENCE =
  "Застъпи непрекъснатата осева линия и навлезе с повече от половината автомобил в насрещната половина на платното.";
const UTURN_SENTENCE = "Пресече непрекъснатата осева линия и зави в обратна посока";
const FORBIDDEN_HERE = /обратен завой, а на това място той е забранен/u;
const OVERTAKING_ADVICE = /Изпреварвай или заобикаляй|дори предният да пълзи/u;
const UTURN_CORRECTIVE = "Обратен завой не се прави през плътна линия";
const CLEAN_PRAISE = /чисто каране по изпитния лист|оценката е за незавършения маршрут, не за карането/u;
const ALL_RUNGS = [1, 2, 3, 4, 5] as const;
type Rung = (typeof ALL_RUNGS)[number];

/** The authored М1 of mv-uturn-v1 (content/world/mv-uturn-v1.json, zone mvu-z-solidcenterline). */
const SPAN = { fromY: 40, toY: 220 } as const;
/** The engine's «WITH a bank» band and the crossing detector's sustain, restated — this file must not import them. */
const WITH_DEG = 45;
const SUSTAIN_SEC = 0.6;

// ---------------------------------------------------------------------------
// geometry — the verifier's own helpers (zz-v3-all.test.ts), verbatim
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
/** The verifier's round-3 lead-in: outer lane → `xTo` at `yTo`, parallel. */
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

// ---- §X1 acts: a straddle or a stay-across held to the gap, then the lawful arc ----

/** N21 — slide over inside the span, hold `over` past the axis to the gap, wait 14.5 s there, the lesson's own arc at y 264. */
function n21(over: number, yOver: number): DriveScript {
  const a = arc(-over, 264, 0, 8.125, 180);
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[12.19, 15], [12.19, yOver - 80]], targetKmh: 46, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[12.19, yOver - 80], [6, yOver - 50], [1.2, yOver - 25], [-over, yOver], [-over, 264]], targetKmh: 22 },
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: 14.5, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 8, stopAtEnd: false },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [r3(a.x), r3(a.y - 1)]], targetKmh: 8 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}
/** N21b — the same straddle from y 205, the turn made at y 240 (the dashed run-in). */
function n21b(): DriveScript {
  const a = arc(-0.2, 240, 0, 8.125, 180);
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[12.19, 15], [12.19, 125]], targetKmh: 46, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[12.19, 125], [6, 155], [1.2, 180], [-0.2, 205], [-0.2, 240]], targetKmh: 22 },
      { kind: "pause", sec: 14.5, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 8, stopAtEnd: false },
      ...tail(a.x, a.y, 180, 20),
    ],
  };
}
/** N21c — THE CLEAN FORM: wait 22 s in lane at y 180 for the stream, THEN sit `over` past the axis from `yOver` to the gap, stop 3 s, lawful arc at y 264. */
function n21c(over: number, yOver: number): DriveScript {
  const a = arc(-over, 264, 0, 8.125, 180);
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[12.19, 15], [12.19, 110]], targetKmh: 46, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[12.19, 110], [6, 140], [2.2, 165], [2.2, 180]], targetKmh: 22 },
      { kind: "pause", sec: 22, brake: true },
      { kind: "drive", points: [[2.2, 180], [2.2, yOver - 12], [-over, yOver], [-over, 264]], targetKmh: 22 },
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: 3, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 8, stopAtEnd: false },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [r3(a.x), r3(a.y - 1)]], targetKmh: 8 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}
/** N21d — control for N21c: the SAME drive with the centre kept 0.05 m on its OWN side of the axis. */
function n21d(): DriveScript {
  const a = arc(0.05, 264, 0, 8.125, 180);
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[12.19, 15], [12.19, 110]], targetKmh: 46, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[12.19, 110], [6, 140], [2.2, 165], [2.2, 180]], targetKmh: 22 },
      { kind: "pause", sec: 22, brake: true },
      { kind: "drive", points: [[2.2, 180], [2.2, 202], [0.05, 214], [0.05, 264]], targetKmh: 22 },
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: 3, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 8, stopAtEnd: false },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [r3(a.x), r3(a.y - 1)]], targetKmh: 8 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}
/** N21e — astride 0.6 m from y 120 for 145 m (as when going round something), on to the gap, lawful turn there. */
function n21e(): DriveScript {
  const a = arc(-0.6, 264, 0, 8.125, 180);
  return {
    steps: [
      ...lead(4.06, 100),
      { kind: "drive", points: [[4.06, 100], [-0.6, 120], [-0.6, 264]], targetKmh: 30 },
      { kind: "pause", sec: 3, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 8, stopAtEnd: false },
      ...tail(a.x, a.y, 180, 12),
    ],
  };
}
/** N22 — the straddle from y 205, the centre BACK on its own half (x +0.4) from y 235, then the lawful turn. */
function n22(): DriveScript {
  const a = arc(0.4, 264, 0, 8.125, 180);
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[12.19, 15], [12.19, 125]], targetKmh: 46, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[12.19, 125], [6, 155], [1.2, 180], [-0.2, 205], [-0.2, 225], [0.4, 235], [0.4, 264]], targetKmh: 22 },
      { kind: "pause", sec: 14.5, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 8, stopAtEnd: false },
      ...tail(a.x, a.y, 180, 20),
    ],
  };
}
/** N23 — astride the line for 100 m, never reversing, back into lane. */
function n23(): DriveScript {
  return {
    steps: [
      ...lead(1.2, 90),
      { kind: "drive", points: [[1.2, 90], [-0.4, 100], [-0.4, 200], [4.06, 215], [4.06, 230]], targetKmh: 30 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** N33 — a REAL pull-out, wholly across (centre 4.06 m over) from y 150, on to the gap, turn-round at the gap from the oncoming lane. */
function n33(): DriveScript {
  const a = arc(-4.06, 264, 0, 6, 180);
  return {
    steps: [
      ...lead(4.06, 130),
      { kind: "drive", points: [[4.06, 130], [-4.06, 150], [-4.06, 264]], targetKmh: 30 },
      { kind: "pause", sec: 2, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 8, stopAtEnd: false },
      ...tail(a.x, a.y, 180, 12),
    ],
  };
}

// ---- §R4-2 acts: across or astride, then round INSIDE the span ----------------

/** N1 / N31 — the centre `over` past the axis, `run` metres parallel, then one arc of radius r round (at `kmh` on the run). */
function overThenRound(over: number, run: number, r: number, kmh: number): DriveScript {
  const a = arc(-over, 112 + run, 0, r, 180);
  return {
    steps: [
      ...lead(1.2, 100),
      { kind: "drive", points: [[1.2, 100], [-over, 112], [-over, 112 + run]], targetKmh: kmh, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      ...tail(a.x, a.y, 180),
    ],
  };
}
/** G1 (L3 variants) — slide to `over` past the axis, `run` metres parallel at `kmh`, then r = 7 round. */
function g1(over: number, run: number, kmh: number): DriveScript {
  const slideLen = 12;
  const a = arc(-over, 100 + slideLen + run, 0, 7, 180);
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[12.19, 15], [12.19, 50]], targetKmh: 46, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[12.19, 50], [6, 72], [1.2, 90], [1.2, 100]], targetKmh: 20, stopAtEnd: false },
      { kind: "drive", points: [[1.2, 100], [-over, 100 + slideLen], [-over, 100 + slideLen + run]], targetKmh: kmh, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: Math.min(kmh, 12), stopAtEnd: false },
      ...tail(a.x, a.y, 180),
    ],
  };
}
/** N2 — ONE continuous diagonal at `deg` from 1.1 m inside the lane, `L` metres past the axis, then full lock (r = 6). Never parallel. */
function diagThenLock(deg: number, L: number): DriveScript {
  const toAxis = line(1.1, 100, deg, 1.1 / Math.sin(rad(deg)));
  const run = line(toAxis.x, toAxis.y, deg, L);
  const a = arc(run.x, run.y, deg, 6, 180 - deg);
  return {
    steps: [
      ...lead(1.1, 100),
      { kind: "drive", points: [...toAxis.pts, ...run.pts.slice(1), ...a.pts.slice(1)], targetKmh: 9, stopAtEnd: false },
      ...tail(a.x, a.y, 180),
    ],
  };
}
/** The builder's round-3 A6 — from 1.1 m inside the lane: straight at `deg` to the axis, `L` metres more, then full lock left (r = 6). */
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
/** Round 2's own pin: across at ~17°, FORTY metres up the oncoming lane, a stop, and only then a turn round over there. */
function pullOutFortyThenSpin(): DriveScript {
  const a = arc(-4.06, 166, 0, 5, 180);
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[12.19, 15], [12.19, 70]], targetKmh: 46, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[12.19, 70], [9, 84], [4.06, 100]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[4.06, 100], [-4.06, 126], [-4.06, 166]], targetKmh: 30 },
      { kind: "pause", sec: 0.5, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[-14.06, 166], [-14.06, 140]], targetKmh: 25 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

// ---- §R4-1 acts: the SAME turn either side of the span's end ------------------

/**
 * ASTRIDE, THEN ROUND: the centre `over` past the axis from y 190 (inside the
 * span), held parallel, then one arc of radius r BEGUN at `beginY` — the place
 * of the turn-round (round 5: where it begins; round 4 built these acts so that
 * the nose passed 45° at the given station, `to45(r)` further on).
 */
function astrideThenTurnAt(beginY: number, over = 0.3, r = 8.125): DriveScript {
  const y0 = beginY;
  const a = arc(-over, y0, 0, r, 180);
  return {
    steps: [
      ...lead(2.2, 170),
      { kind: "drive", points: [[2.2, 170], [-over, 190], [-over, r3(y0)]], targetKmh: 22, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: 8, stopAtEnd: false },
      ...tail(a.x, a.y, 180, 16),
    ],
  };
}
/** PULLED OUT, THEN ROUND: wholly in the oncoming lane (centre 4.06 m over) from y 170, then r = 6 round, BEGUN at `beginY`. */
function pulledOutThenTurnAt(beginY: number): DriveScript {
  const r = 6;
  const y0 = beginY;
  const a = arc(-4.06, y0, 0, r, 180);
  return {
    steps: [
      ...lead(4.06, 150),
      { kind: "drive", points: [[4.06, 150], [-4.06, 170], [-4.06, r3(y0)]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: 8, stopAtEnd: false },
      ...tail(a.x, a.y, 180, 16),
    ],
  };
}
/** ONE ARC ACROSS THE AXIS from the inner lane beside it (x 1.1), the demo radius, begun at `y0`. */
function hugArcFrom(y0: number): DriveScript {
  const a = arc(1.1, y0, 0, 8.125, 180);
  return { steps: [...approach(1.1, y0), { kind: "drive", points: a.pts, targetKmh: 8, stopAtEnd: false }, ...tail(a.x, a.y, 180, 16)] };
}
/** ONE ARC ACROSS THE AXIS from the OUTER lane on the lane-to-lane radius (12.19): the centre crosses square to the road at `crossY`. */
function outerArcCrossingAt(crossY: number): DriveScript {
  const a = arc(12.19, crossY - 12.19, 0, 12.19, 180);
  return {
    steps: [...outerApproach(12.19, crossY - 12.19), { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false }, ...tail(a.x, a.y, 180, 16)],
  };
}

/**
 * PAST THE KERB. Pulled out wholly into the oncoming lane inside the span, the
 * nose swung 50° to the left at `ySwing` — over the solid axis — and the car
 * leaves the carriageway over the west kerb (the road stops measuring it at
 * x ≈ −21.2), straightens and runs NORTH along the verge at x ≈ −26. At `yTurn`
 * it turns round out there (to the right, r = 4.5) and comes back onto the
 * oncoming half southbound, 95° round as it re-crosses the kerb.
 */
function swingThenVergeThenTurnOnTheVergeAt(ySwing: number, yTurn: number): DriveScript {
  const a1 = arc(-12.19, ySwing, 0, 6, 50);
  const l1 = line(a1.x, a1.y, 50, (a1.x + 24) / Math.sin(rad(50)));
  const a2 = arc(l1.x, l1.y, 50, 6, -50);
  const a3 = arc(a2.x, yTurn, 0, 4.5, -180);
  return {
    steps: [
      ...lead(4.06, ySwing - 50),
      { kind: "drive", points: [[4.06, ySwing - 50], [-12.19, ySwing - 20], [-12.19, ySwing]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [...a1.pts, ...l1.pts.slice(1), ...a2.pts.slice(1), [r3(a2.x), yTurn]], targetKmh: 14, stopAtEnd: false },
      { kind: "drive", points: a3.pts, targetKmh: 8, stopAtEnd: false },
      ...tail(a3.x, a3.y, 180, 10),
    ],
  };
}
/**
 * INTO THE FIELD. The same swing over the solid axis at y 200, held as a 50°
 * diagonal out over the kerb and on to x = −40 — past where the road has any
 * fix on the car — then north out there, round to the right at `yTurn`, and
 * back onto the oncoming half southbound.
 */
function swingThenFieldThenTurnInTheFieldAt(ySwing: number, yTurn: number): DriveScript {
  const a1 = arc(-12.19, ySwing, 0, 6, 50);
  const l1 = line(a1.x, a1.y, 50, (a1.x + 38) / Math.sin(rad(50)));
  const a2 = arc(l1.x, l1.y, 50, 6, -50);
  const a3 = arc(a2.x, yTurn, 0, 11, -180);
  return {
    steps: [
      ...lead(4.06, ySwing - 50),
      { kind: "drive", points: [[4.06, ySwing - 50], [-12.19, ySwing - 20], [-12.19, ySwing]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [...a1.pts, ...l1.pts.slice(1), ...a2.pts.slice(1), [r3(a2.x), yTurn]], targetKmh: 14, stopAtEnd: false },
      { kind: "drive", points: a3.pts, targetKmh: 8, stopAtEnd: false },
      ...tail(a3.x, a3.y, 180, 10),
    ],
  };
}

// ---- controls -----------------------------------------------------------------

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
/** B4 — a lawful U-turn at / near the gap: one arc of radius r from (x0, y0), after a 14.5 s wait for the stream. */
function lawfulAt(x0: number, y0: number, r: number): DriveScript {
  const a = arc(x0, y0, 0, r, 180);
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[12.19, 15], [12.19, 150]], targetKmh: 46, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[12.19, 150], [(12.19 + x0) / 2, 180], [x0, 205], [x0, y0]], targetKmh: 30 },
      { kind: "pause", sec: 14.5, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 8, stopAtEnd: false },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [-12.19, 200], [-12.19, 120]], targetKmh: 40 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** B1 — the lawful U-turn, then (southbound on the west half) a drift over the axis and back near `yDrift`. */
function lawfulThenDrift(yDrift: number, kmh: number): DriveScript {
  return {
    steps: [
      ...lawfulHead(),
      { kind: "drive", points: [[-12.19, 264], [-12.19, 250], [-4.06, yDrift + 22]], targetKmh: kmh, stopAtEnd: false },
      { kind: "drive", points: [[-4.06, yDrift + 22], [3, yDrift - 5], [3, yDrift - 25]], targetKmh: kmh, stopAtEnd: false },
      { kind: "drive", points: [[3, yDrift - 25], [-4.06, yDrift - 50], [-4.06, yDrift - 60]], targetKmh: kmh },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

// ---------------------------------------------------------------------------
// what the product returned — and the truth, from the raw pose
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
function reachAcrossM(k: SimTick): number {
  const psi = rad(k.headingDeg);
  return PLAYER_HALF_WIDTH_M * Math.abs(Math.cos(psi)) + PLAYER_HALF_LENGTH_M * Math.abs(Math.sin(psi));
}
/** The whole body is west of the axis (the far half for a car that set out northbound on the east one). */
const bodyWhollyWest = (k: SimTick): boolean => k.position.x + reachAcrossM(k) <= 0;
const inSpan = (y: number): boolean => y >= SPAN.fromY && y <= SPAN.toY;
function crossingGlass(o: LiveRungOutcome): LiveRungOutcome["glass"] {
  return o.glass.filter((g) => g.titleBg === CROSSING_TITLE || g.titleBg === UTURN_TITLE);
}

/**
 * THE FIRST TURN-ROUND OF THE DRIVE, FROM THE POSE ALONE — for a car that set
 * out northbound on the east half (x > 0): «turned» is the nose more than 45°
 * off north; the reversal completes when the centre has been west of the axis
 * with the nose within 45° of south for the sustain. `station` is the first
 * frame of the last unbroken run of west-of-the-axis-and-turned frames before
 * that — R4-1's turn station — and `crossed` the frame the centre went over.
 */
function firstTurnRound(o: LiveRungOutcome): null | { station: SimTick; crossed: SimTick; completed: SimTick } {
  let runStart: SimTick | null = null;
  let crossed: SimTick | null = null;
  let withSince: number | null = null;
  for (const k of o.ticks) {
    const west = k.position.x < 0;
    const off = Math.abs(wrap180(k.headingDeg));
    if (!west) {
      runStart = null;
      crossed = null;
      withSince = null;
      continue;
    }
    if (crossed === null) crossed = k;
    if (off > WITH_DEG) {
      if (runStart === null) runStart = k;
    } else {
      runStart = null;
    }
    if (180 - off <= WITH_DEG) {
      if (withSince === null) withSince = k.t;
      if (k.t - withSince >= SUSTAIN_SEC - 1e-9 && runStart !== null) return { station: runStart, crossed, completed: k };
    } else {
      withSince = null;
    }
  }
  return null;
}

/** Every sentence the glass printed about the crossing is true on its frame (the round-3 check, restated). */
function expectGlassTrue(o: LiveRungOutcome): number {
  const shown = crossingGlass(o);
  for (const g of shown) {
    const at = tickAt(o, g.t);
    const where = `${g.src} «${g.explanationBg.slice(0, 40)}…» at t=${g.t.toFixed(2)} x=${at.position.x.toFixed(2)} h=${wrap180(at.headingDeg).toFixed(1)}`;
    expect({ where, centreAcross: at.position.x < 0 }).toEqual({ where, centreAcross: true });
    if (g.titleBg === UTURN_TITLE) {
      expect(g.explanationBg).toContain(UTURN_SENTENCE);
      expect({ where, turnedRound: Math.abs(wrap180(at.headingDeg - 180)) <= WITH_DEG }).toEqual({ where, turnedRound: true });
      continue;
    }
    const wholly = bodyWhollyWest(at);
    expect({ where, saysWholly: g.explanationBg.includes("изцяло") }).toEqual({ where, saysWholly: wholly });
    expect(g.explanationBg.startsWith(wholly ? WHOLLY_SENTENCE : ASTRIDE_SENTENCE)).toBe(true);
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
 * ONE bill, and it STAYS the crossing — the crossing's title and its own
 * corrective, on whichever of its two true reasons the bill frame earned;
 * nothing anywhere says a U-turn was made where it is forbidden.
 */
function expectCrossingKept(o: LiveRungOutcome, level: Rung): Row {
  const rows = crossingRows(o);
  expect(rows.map((r) => r.where)).toEqual([level === 4 ? "scored" : "coached"]);
  expect([undefined, ASTRIDE_ACT]).toContain(rows[0].detail);
  expect(rows[0].titleBg).toBe(CROSSING_TITLE);
  expect(o.debrief).toContain(CROSSING_TITLE);
  expect(o.debrief).not.toContain(UTURN_TITLE);
  expect(o.debrief).not.toMatch(FORBIDDEN_HERE);
  expect(o.debrief).not.toContain(UTURN_SENTENCE);
  expect(o.debrief).not.toContain(UTURN_CORRECTIVE);
  for (const g of o.glass) expect(g.titleBg).not.toBe(UTURN_TITLE);
  // The recorder's own rule log and the lesson's ledgers agree: no act named.
  const logged = o.drive.ruleEvents.filter((e) => e.kind === "violation" && e.code === "CROSSED_SOLID_LINE");
  expect(logged.map((e) => (e as { detail?: string }).detail ?? "pooled")).not.toContain(UTURN_ACT);
  expect((o.result.lessonMistakes ?? []).map((h) => h.detail)).not.toContain(UTURN_ACT);
  // The row's reason agrees with the body on the bill frame.
  expect(rows[0].detail).toBe(bodyWhollyWest(tickAt(o, rows[0].t)) ? undefined : ASTRIDE_ACT);
  if (level === 4) {
    const billed = o.result.summary.mistakes.filter((m) => m.code === "CROSSED_SOLID_LINE");
    expect(billed.map((m) => [m.titleBg, m.severityClass, m.points])).toEqual([[CROSSING_TITLE, "osnovna", 3]]);
  }
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
  expect(o.debrief).not.toMatch(FORBIDDEN_HERE);
}

/**
 * THE X1 SHAPE, WHOLE: the centre went over the SOLID axis inside the span and
 * stayed over; the turn-round was made where the axis is DASHED; the crossing
 * row was billed before the turn began and keeps its own copy; the lawful turn
 * is billed by nothing.
 */
function expectCrossedInSpanTurnedAtTheDashes(o: LiveRungOutcome, level: Rung): void {
  expectTurnedRound(o);
  const turn = firstTurnRound(o)!;
  expect(turn).not.toBeNull();
  // The centre crossed over the solid axis, inside the span …
  expect(inSpan(turn.crossed.position.y)).toBe(true);
  expect(turn.crossed.solidCenterLine).toBe(true);
  // … and the turn-round was made past its end, where the road's own record says the axis is not solid.
  expect(turn.station.position.y).toBeGreaterThan(SPAN.toY);
  expect(turn.station.solidCenterLine).not.toBe(true);
  const row = expectCrossingKept(o, level);
  // The one row is the crossing's, billed before the turn began.
  expect(row.t).toBeLessThan(turn.station.t);
  expect(expectGlassTrue(o)).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------

describe("§X1 a straddle or a stay-across held to the gap, then the LAWFUL arc — the row keeps the crossing's copy and the lawful turn names nothing (the verifier's 18 drives)", () => {
  for (const level of ALL_RUNGS) {
    it(`L${level}: N21c — wait 22 s in lane for the stream, the centre 0.05 m over the line for the last 6 m of the span, held to the gap, stop, the lesson's own arc at y 264`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, n21c(0.05, 214));
      expectCrossedInSpanTurnedAtTheDashes(o, level);
      const turn = firstTurnRound(o)!;
      // The cleanest act's own measurements: 5 cm over, the body 0.8 m short of
      // across, and the turn made more than 45 m past the end of the solid line.
      const row = crossingRows(o)[0];
      const at = tickAt(o, row.t);
      expect(at.position.x).toBeGreaterThan(-0.06);
      expect(row.detail).toBe(ASTRIDE_ACT);
      expect(turn.station.position.y - SPAN.toY).toBeGreaterThan(45);
      expect(turn.completed.t - row.t).toBeGreaterThan(15);
      // What the debrief must NOT do is advise the thing the student did.
      expect(o.debrief).not.toMatch(/Подмини мястото и продължи в лентата си, докато осевата стане прекъсната/u);
    });
  }

  for (const [over, yOver, level] of [
    [0.3, 200, 3],
    [0.3, 200, 2],
    [0.84, 190, 3],
    [0.05, 219, 3],
  ] as const) {
    it(`L${level}: N21c — wait, then ${over} m over from y ${yOver}, held to the gap, lawful arc`, () => {
      expectCrossedInSpanTurnedAtTheDashes(driveLiveRung(SC_MV_UTURN_BAN, level, n21c(over, yOver)), level);
    });
  }

  for (const level of [1, 2, 3, 5] as const) {
    it(`L${level}: N21 — no wait: 0.2 m over from y 205, held to the gap, 14.5 s there, lawful arc`, () => {
      expectCrossedInSpanTurnedAtTheDashes(driveLiveRung(SC_MV_UTURN_BAN, level, n21(0.2, 205)), level);
    });
  }
  for (const [over, yOver] of [
    [0.05, 214],
    [0.5, 180],
    [0.8, 150],
  ] as const) {
    it(`L3: N21 — ${over} m over from y ${yOver}, held to the gap, lawful arc`, () => {
      expectCrossedInSpanTurnedAtTheDashes(driveLiveRung(SC_MV_UTURN_BAN, 3, n21(over, yOver)), 3);
    });
  }

  it("L3: N21b — 0.2 m over from y 205, the turn made at y 240 on the dashed run-in", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, n21b());
    expectCrossedInSpanTurnedAtTheDashes(o, 3);
    expect(firstTurnRound(o)!.station.position.y).toBeLessThan(250);
  });

  it("L3: N21e — astride 0.6 m from y 120 for 145 m (going round something), on to the gap, lawful arc there", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, n21e());
    expectCrossedInSpanTurnedAtTheDashes(o, 3);
    expect(firstTurnRound(o)!.crossed.position.y).toBeLessThan(125);
  });
});

describe("§X1 controls — the same drive either side of it", () => {
  it("L3: N21d — the centre kept 0.05 m on its OWN side all the way, lawful arc at the gap → nothing billed", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, n21d());
    expectTurnedRound(o);
    expectNoCrossing(o);
  });

  it("L3: N22 — the straddle from y 205, the centre BACK on its own half from y 235, lawful arc at the gap → the crossing, and the turn (which crosses over dashes) names nothing", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, n22());
    expectTurnedRound(o);
    expectCrossingKept(o, 3);
    const turn = firstTurnRound(o)!;
    // This turn's own crossing is over the dashes: nothing about it is the line's business.
    expect(turn.crossed.position.y).toBeGreaterThan(SPAN.toY);
    expect(turn.crossed.solidCenterLine).not.toBe(true);
  });

  it("L3: N23 — astride the line for 100 m, never reversing, back into lane → the crossing", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, n23());
    expect(firstTurnRound(o)).toBeNull();
    expectCrossingKept(o, 3);
    expect(o.debrief).toMatch(OVERTAKING_ADVICE);
  });

  for (const level of [1, 3, 4] as const) {
    it(`L${level}: N33 — a REAL pull-out, wholly across from y 150, that leaves the span and turns round at the gap → the crossing keeps the crossing's copy (R4-2: no reversal inside the span)`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, n33());
      expectCrossedInSpanTurnedAtTheDashes(o, level);
      // He really was pulled out: the whole body across, nose along the road, for over 100 m.
      const out = o.ticks.filter((k) => bodyWhollyWest(k) && Math.abs(wrap180(k.headingDeg)) <= 10).map((k) => k.position.y);
      expect(Math.max(...out) - Math.min(...out)).toBeGreaterThan(100);
      expect(o.debrief).toMatch(OVERTAKING_ADVICE);
    });
  }
});

describe("§R4-2 ANY reversal made inside the solid span by a car across or astride the solid axis is the U-turn — whatever came before it", () => {
  // The verifier's 18 in-span rows that kept «Изпреварвай или заобикаляй…» on round 3 (finding X2).
  for (const [over, run] of [
    [0.9, 6],
    [0.9, 12],
    [1.2, 4],
    [1.2, 6],
    [1.2, 12],
  ] as const) {
    it(`L3: N1 — the centre ${over} m over, ${run} m parallel, then r = 7 round → named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, overThenRound(over, run, 7, 9));
      expectTurnedRound(o);
      expectNamedUTurn(o, 3);
      expectGlassTrue(o);
    });
  }
  for (const [over, run] of [
    [1.0, 6],
    [2.0, 6],
    [4.06, 30],
  ] as const) {
    it(`L3: N31 — a pull-out ${over} m over, ${run} m along the oncoming half at 14 км/ч, then r = 6 round → named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, overThenRound(over, run, 6, 14));
      expectTurnedRound(o);
      expectNamedUTurn(o, 3);
      expectGlassTrue(o);
    });
  }
  for (const [over, run, kmh] of [
    [2, 10, 20],
    [4.06, 30, 30],
  ] as const) {
    it(`L3: G1 — ${over} m over, ${run} m parallel at ${kmh} км/ч, then r = 7 round → named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, g1(over, run, kmh));
      expectTurnedRound(o);
      expectNamedUTurn(o, 3);
      expectGlassTrue(o);
    });
  }
  for (const [deg, L] of [
    [4, 20],
    [4, 30],
    [7, 14],
    [7, 20],
    [7, 30],
    [9.5, 14],
    [9.5, 20],
    [9.5, 30],
  ] as const) {
    it(`L3: N2 — one continuous ${deg}° diagonal, ${L} m past the axis, then full lock (never parallel) → named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, diagThenLock(deg, L));
      expectTurnedRound(o);
      expectNamedUTurn(o, 3);
      expectGlassTrue(o);
    });
  }

  // Every rung, on the fullest pull-out of the set: wholly in the oncoming
  // lane (the centre 4.06 m over) for 30 m, then round.
  for (const level of ALL_RUNGS) {
    it(`L${level}: a FULL pull-out — the centre 4.06 m over, 30 m along the oncoming lane, then round inside the span → the U-turn, with the U-turn's corrective, never the overtaking advice`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, overThenRound(4.06, 30, 6, 14));
      expectTurnedRound(o);
      const row = expectNamedUTurn(o, level);
      // He WAS pulled out by round 3's own test: the whole body across, nose within 10° of the road, for far more than 5 m …
      const out = o.ticks.filter((k) => bodyWhollyWest(k) && Math.abs(wrap180(k.headingDeg)) <= 10).map((k) => k.position.y);
      expect(Math.max(...out) - Math.min(...out)).toBeGreaterThan(25);
      // … and the turn-round was made inside the span, where the road's record says the axis is solid.
      const turn = firstTurnRound(o)!;
      expect(inSpan(turn.station.position.y)).toBe(true);
      expect(turn.station.solidCenterLine).toBe(true);
      expect(row.t).toBeLessThan(turn.station.t);
      expect(expectGlassTrue(o)).toBeGreaterThan(0);
    });
  }
  for (const level of [1, 4] as const) {
    it(`L${level}: N2 — a continuous 7° diagonal, 20 m past the axis, then full lock → named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, diagThenLock(7, 20));
      expectTurnedRound(o);
      expectNamedUTurn(o, level);
    });
    it(`L${level}: N1 — the centre 1.2 m over, 6 m parallel, then r = 7 round → named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, overThenRound(1.2, 6, 7, 9));
      expectTurnedRound(o);
      expectNamedUTurn(o, level);
    });
  }

  // The builder's own round-3 pull-out-then-round pins, which kept the crossing's copy there.
  it("L3: round 3's «the rule's own two sides» — the body WHOLLY across (1.5 m over) for 3 m then round, and for 8 m then round → both named", () => {
    for (const run of [3, 8]) {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, g1(1.5, run, 9));
      expectTurnedRound(o);
      expectNamedUTurn(o, 3);
    }
  });
  it("L3: round 3's A6 at 8° — 12 m and 16 m past the axis, then full lock → both named", () => {
    for (const L of [12, 16]) {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, a6(8, L, 9));
      expectTurnedRound(o);
      expectNamedUTurn(o, 3);
    }
  });
  for (const level of [3, 4] as const) {
    it(`L${level}: round 2's pin — across at ~17°, FORTY metres up the oncoming lane, a stop, then a turn round over there → named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, pullOutFortyThenSpin());
      expectTurnedRound(o);
      expectNamedUTurn(o, level);
      expect(inSpan(firstTurnRound(o)!.station.position.y)).toBe(true);
    });
  }
});

describe("§R4-2 controls — where NO reversal is made inside the span the crossing keeps the crossing's copy", () => {
  for (const [deg, runM, kmh] of [
    [12, 40, 40],
    [30, 30, 30],
    [44, 20, 20],
    [44, 2, 6],
  ] as const) {
    it(`L3: B3 — across at ${deg}°, ${runM} m up the oncoming lane at ${kmh} км/ч, and back → the crossing`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, pullOutAndBack(deg, runM, kmh));
      expect(firstTurnRound(o)).toBeNull();
      expectCrossingKept(o, 3);
      expect(o.debrief).toMatch(OVERTAKING_ADVICE);
      expectGlassTrue(o);
    });
  }
  for (const level of [1, 4] as const) {
    it(`L${level}: B3 — across at 30°, 30 m up the oncoming lane, and back → the crossing`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, pullOutAndBack(30, 30, 30));
      expectCrossingKept(o, level);
    });
  }
  it("L3: a pull-out that carries on up the oncoming half and stops there → the crossing", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, pullOutAndCarryOn());
    expect(firstTurnRound(o)).toBeNull();
    expectCrossingKept(o, 3);
  });
});

describe("§R4-1 → R5 THE SAME TURN either side of the end of the solid axis (y 220) — the place is where the turn-round BEGINS (round 5, ruling R5-1; round 4 read it where the nose passes 45°, which put a turn begun 4 m before the end over the dashes — verifier Y5)", () => {
  for (const [name, script] of [
    ["astride (0.3 m over from y 190), then the demo radius", astrideThenTurnAt],
    ["pulled out (wholly in the oncoming lane from y 170), then r = 6", pulledOutThenTurnAt],
  ] as const) {
    for (const level of [1, 3, 4] as const) {
      it(`L${level}: ${name} — the turn begun 5 m INSIDE the span → the U-turn; 5 m PAST its end → the crossing keeps its copy and the turn is lawful`, () => {
        const inside = driveLiveRung(SC_MV_UTURN_BAN, level, script(SPAN.toY - 5));
        expectTurnedRound(inside);
        const tIn = oracle(inside.ticks).turnRounds[0];
        expect(Math.abs(tIn.beginY! - (SPAN.toY - 5))).toBeLessThan(0.75);
        expect(tIn.beginSolid).toBe(true);
        expect(inside.ticks[tIn.beginI].solidCenterLine).toBe(true);
        expectNamedUTurn(inside, level);
        expectGlassTrue(inside);

        const past = driveLiveRung(SC_MV_UTURN_BAN, level, script(SPAN.toY + 5));
        const tOut = oracle(past.ticks).turnRounds[0];
        expect(Math.abs(tOut.beginY! - (SPAN.toY + 5))).toBeLessThan(0.75);
        expect(past.ticks[tOut.beginI].solidCenterLine).not.toBe(true);
        expectCrossedInSpanTurnedAtTheDashes(past, level);
      });
    }
    it(`L3: ${name} — and close to: begun 1 m inside → the U-turn; 1 m past → lawful`, () => {
      const inside = driveLiveRung(SC_MV_UTURN_BAN, 3, script(SPAN.toY - 1));
      const tIn = oracle(inside.ticks).turnRounds[0];
      expect(tIn.beginY!).toBeLessThan(SPAN.toY);
      expect(tIn.beginY!).toBeGreaterThan(SPAN.toY - 2);
      expect(inside.ticks[tIn.beginI].solidCenterLine).toBe(true);
      expectNamedUTurn(inside, 3);
      const past = driveLiveRung(SC_MV_UTURN_BAN, 3, script(SPAN.toY + 1));
      const tOut = oracle(past.ticks).turnRounds[0];
      expect(tOut.beginY!).toBeGreaterThan(SPAN.toY);
      expect(tOut.beginY!).toBeLessThan(SPAN.toY + 2);
      expectCrossedInSpanTurnedAtTheDashes(past, 3);
    });
  }

  it("L3: the place is where the turn BEGINS, not where the nose passes 45°, where it completes or where the car ends up — astride, the turn begun 1 m inside the span: the nose is 45° round, and square to the road, over the dashes, and it is still the U-turn", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, astrideThenTurnAt(SPAN.toY - 1));
    const turn = oracle(o.ticks).turnRounds[0];
    const begin = o.ticks[turn.beginI];
    // 45° round, and square across the road, he is already past the end of the solid line …
    const at45 = o.ticks.find((k) => k.t > begin.t && Math.abs(wrap180(k.headingDeg)) > WITH_DEG)!;
    expect(at45.position.y).toBeGreaterThan(SPAN.toY);
    expect(at45.solidCenterLine).not.toBe(true);
    const square = o.ticks.find((k) => k.t > begin.t && Math.abs(wrap180(k.headingDeg)) >= 90)!;
    expect(square.position.y).toBeGreaterThan(SPAN.toY);
    // … and the turn began where it is solid.
    expect(begin.solidCenterLine).toBe(true);
    expectNamedUTurn(o, 3);
  });

  for (const level of [3, 4] as const) {
    it(`L${level}: ONE ARC ACROSS the axis from the outer lane (the centre crosses square to the road) — crossing 5 m inside the span → billed and named; 5 m past its end → the centre went over where the axis is dashed: nothing billed`, () => {
      const inside = driveLiveRung(SC_MV_UTURN_BAN, level, outerArcCrossingAt(SPAN.toY - 5));
      expectTurnedRound(inside);
      const tIn = firstTurnRound(inside)!;
      expect(Math.abs(tIn.crossed.position.y - (SPAN.toY - 5))).toBeLessThan(0.75);
      expect(oracle(inside.ticks).turnRounds[0].beginSolid).toBe(true);
      expectNamedUTurn(inside, level);
      const past = driveLiveRung(SC_MV_UTURN_BAN, level, outerArcCrossingAt(SPAN.toY + 5));
      expectTurnedRound(past);
      expect(Math.abs(firstTurnRound(past)!.crossed.position.y - (SPAN.toY + 5))).toBeLessThan(0.75);
      // It BEGAN inside the span — and with no solid crossing there is nothing to name (R5-2 i).
      expect(oracle(past.ticks).turnRounds[0].beginSolid).toBe(true);
      expectNoCrossing(past);
    });
  }

  it("L3: …and at the START of the span (y 40) — the outer-lane arc begun at y 30, over the dashes: the centre crosses at y 42.2, where the axis is solid → billed, on the CROSSING's copy: the turn-round did not begin where the axis is solid (R5-2 iii; round 4 placed it at the crossing and named it)", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, outerArcCrossingAt(SPAN.fromY + 2.19));
    expectTurnedRound(o);
    const turn = firstTurnRound(o)!;
    expect(turn.crossed.position.y).toBeGreaterThan(SPAN.fromY);
    expect(turn.crossed.solidCenterLine).toBe(true);
    const tr = oracle(o.ticks).turnRounds[0];
    expect(Math.abs(tr.beginY! - 30)).toBeLessThan(0.75);
    expect(o.ticks[tr.beginI].solidCenterLine).not.toBe(true);
    expectCrossingKept(o, 3);
    expectGlassTrue(o);
  });

  it("L3: ONE ARC ACROSS the axis begun beside it (1.1 m, the demo radius) — begun 12 m before the end → named; begun past the end → nothing; and BETWEEN: begun 4.8 m before the end, the centre crosses the last metre of solid line 30° round and the nose passes 45° over the dashes → the turn-round BEGAN over the solid axis and its centre went over the solid axis: the U-turn (round 4 kept the crossing's copy here — its «band that remains»)", () => {
    const inside = driveLiveRung(SC_MV_UTURN_BAN, 3, hugArcFrom(SPAN.toY - 12));
    expectTurnedRound(inside);
    const tIn = firstTurnRound(inside)!;
    expect(tIn.crossed.position.y).toBeLessThan(tIn.station.position.y);
    expect(tIn.station.position.y).toBeLessThan(SPAN.toY);
    expectNamedUTurn(inside, 3);

    const past = driveLiveRung(SC_MV_UTURN_BAN, 3, hugArcFrom(SPAN.toY + 1));
    expectTurnedRound(past);
    expectNoCrossing(past);

    const band = driveLiveRung(SC_MV_UTURN_BAN, 3, hugArcFrom(SPAN.toY - 4.8));
    expectTurnedRound(band);
    const tBand = firstTurnRound(band)!;
    expect(tBand.crossed.position.y).toBeLessThan(SPAN.toY);
    expect(tBand.crossed.solidCenterLine).toBe(true);
    expect(Math.abs(wrap180(tBand.crossed.headingDeg))).toBeLessThan(WITH_DEG);
    // The nose passes 45° over the dashes …
    expect(tBand.station.position.y).toBeGreaterThan(SPAN.toY);
    expect(tBand.station.solidCenterLine).not.toBe(true);
    // … and the turn-round began 4.8 m before them.
    const begin = oracle(band.ticks).turnRounds[0];
    expect(Math.abs(begin.beginY! - (SPAN.toY - 4.8))).toBeLessThan(0.75);
    expect(band.ticks[begin.beginI].solidCenterLine).toBe(true);
    // (Turning there he also cuts up the oncoming stream — that row is his; the headline names both.)
    const rows = crossingRows(band);
    expect(rows.map((r) => [r.where, r.detail, r.titleBg])).toEqual([["coached", UTURN_ACT, UTURN_TITLE]]);
    expect(band.debrief).toContain(UTURN_TITLE);
    expect(band.debrief).toContain(UTURN_CORRECTIVE);
    expect(band.debrief).not.toContain(CROSSING_TITLE);
    expect(band.debrief).not.toMatch(OVERTAKING_ADVICE);
    expectGlassTrue(band);
  });
});

describe("§R4-1 PAST THE KERB — the turn-round is placed where it is MADE, also when the car has left the carriageway in between", () => {
  /** The pose's own account of a frame: is the centre past the west kerb (the runtime's own flag)? */
  const offRoad = (k: SimTick): boolean => k.edgeAlignment?.offCarriageway === true;

  for (const level of [1, 3, 4] as const) {
    it(`L${level}: pulled out, the nose swung 50° over the solid axis at y 200, off over the kerb, north along the verge, and the turn-round made OUT THERE past the end of the span (y 226) → the crossing keeps its copy; nothing says a U-turn was made where it is forbidden`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, swingThenVergeThenTurnOnTheVergeAt(200, 226));
      // What was driven: a 50° swing where the axis is solid …
      const swing = o.ticks.find((k) => k.position.x < 0 && Math.abs(wrap180(k.headingDeg)) > WITH_DEG)!;
      expect(inSpan(swing.position.y)).toBe(true);
      expect(swing.solidCenterLine).toBe(true);
      expect(offRoad(swing)).toBe(false);
      // … then along the verge, pointing up the road again, across the end of the span …
      const alongTheVerge = o.ticks.filter((k) => offRoad(k) && Math.abs(wrap180(k.headingDeg)) < 5);
      expect(alongTheVerge.length).toBeGreaterThan(60);
      expect(Math.max(...alongTheVerge.map((k) => k.position.y))).toBeGreaterThan(SPAN.toY);
      // … and THE TURN-ROUND itself out there, past the end of the solid axis.
      const turn = firstTurnRound(o)!;
      expect(offRoad(turn.station)).toBe(true);
      expectCrossedInSpanTurnedAtTheDashes(o, level);
    });
  }

  // (L4 is not driven here: the изпитен лист ends at its fail gate 3 s after the crossing bill, before the car reaches the verge — W4, recorded.)
  for (const level of [1, 3] as const) {
    it(`L${level}: …and the SAME drive with the turn-round made on the verge INSIDE the span (y 150) → the U-turn: the road still says where he is, and the axis is solid there`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, swingThenVergeThenTurnOnTheVergeAt(110, 150));
      expectTurnedRound(o);
      const turn = firstTurnRound(o)!;
      expect(offRoad(turn.station)).toBe(true);
      expect(inSpan(turn.station.position.y)).toBe(true);
      expect(turn.station.solidCenterLine).toBe(true);
      // Along the verge in between he was pointing up the road: this is not the swing's station held.
      const between = o.ticks.filter((k) => k.t < turn.station.t && offRoad(k) && Math.abs(wrap180(k.headingDeg)) < 5);
      expect(between.length).toBeGreaterThan(60);
      expectNamedUTurn(o, level);
    });
  }

  it("L3: out into the FIELD, where the road has no fix on the car at all, and the turn-round made out there past the end of the span → unplaced: the crossing keeps its copy", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, swingThenFieldThenTurnInTheFieldAt(200, 232));
    const noFix = o.ticks.filter((k) => k.edgeAlignment !== undefined && k.edgeAlignment.deg === null);
    expect(noFix.length).toBeGreaterThan(60);
    // He comes back onto the carriageway already more than 45° round, and completes the reversal on it.
    const turn = firstTurnRound(o)!;
    expect(turn.station.edgeAlignment?.deg ?? null).toBeNull();
    expect(offRoad(turn.completed)).toBe(false);
    expectCrossedInSpanTurnedAtTheDashes(o, 3);
  });

  it("L3: …and the limit, stated: the same turn-round made in the field INSIDE the span is unplaced too — the crossing keeps the crossing's copy (never a place the road did not measure)", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, swingThenFieldThenTurnInTheFieldAt(100, 150));
    expectTurnedRound(o);
    const turn = firstTurnRound(o)!;
    expect(turn.station.edgeAlignment?.deg ?? null).toBeNull();
    expect(inSpan(turn.station.position.y)).toBe(true);
    expectCrossingKept(o, 3);
  });
});

// The round-3 verifier's surviving mutant v8 («a completed reversal keeps the
// old excursion's bill») is KILLED AT THE RULE LAYER
// (rules/__tests__/solid-cross-uturn-act.test.ts, «X3/v8»), and measured NOT
// killable by this drive: on an arc tight enough to end within the 0.8 m of the
// axis that is «not in lane», the centre crosses with the nose already past
// 135°, so the first bill is the reversal's own and there is no earlier bill
// for the mutant to keep. What a drive can show is the behaviour the pin
// protects: two acts, two bills.
describe("§two U-turns back to back, never «in lane» between them, are two acts", () => {
  /** A tight U-turn from x 8.125 on r = 4.2 (it ends 0.28 m past the axis, southbound) and AT ONCE a second one back across. */
  function twoUTurnsBackToBack(): DriveScript {
    const a = arc(8.125, 120, 0, 4.2, 180);
    const b = arc(a.x, a.y, 180, 4.2, 180);
    return {
      steps: [
        { kind: "glance", mirror: "rear" },
        { kind: "drive", points: [[12.19, 15], [12.19, 80], [8.125, 100], [8.125, 120]], targetKmh: 40 },
        { kind: "pause", sec: 0.8, brake: true },
        { kind: "indicator", setting: "left" },
        { kind: "drive", points: [...a.pts, ...b.pts.slice(1)], targetKmh: 6, stopAtEnd: false },
        ...tail(b.x, b.y, 0, 12),
      ],
    };
  }
  for (const level of [3, 4] as const) {
    it(`L${level}: two U-turns across the solid axis with no lane between them → two acts, two bills, each the U-turn`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, twoUTurnsBackToBack());
      // He ends northbound on his own half again, having been across and back.
      const last = o.ticks[o.ticks.length - 1];
      expect(Math.abs(wrap180(last.headingDeg))).toBeLessThan(5);
      expect(last.position.x).toBeGreaterThan(5);
      // Between the two turns the centre never left the axis by more than 0.3 m — he was never «in lane».
      const first = firstTurnRound(o)!;
      const between = o.ticks.filter((k) => k.t > first.completed.t && k.position.x < 0);
      expect(Math.min(...between.map((k) => k.position.x))).toBeGreaterThan(-0.35);
      const rows = crossingRows(o);
      expect(rows.map((r) => [r.where, r.detail, r.titleBg])).toEqual([
        [level === 4 ? "scored" : "coached", UTURN_ACT, UTURN_TITLE],
        ["scored", UTURN_ACT, UTURN_TITLE],
      ]);
      expect(rows[1].t - rows[0].t).toBeGreaterThan(1);
      expect(o.debrief).not.toMatch(OVERTAKING_ADVICE);
    });
  }
});

// ---------------------------------------------------------------------------
// §R4-1 SOUTHBOUND — the same rule for a car going the other way (builder,
// round 4 continuation). The lesson's own lawful U-turn makes the WEST half
// the one he travels with; the solid axis he then runs beside ENDS, for him,
// at y 40 — where it began for the northbound car. Round 4's sweep reached
// this side only at the rule layer: its live southbound acts straddled for
// 60 m first and the route ended («Край на маршрута», ~76 s) before the
// reversal. These turn back at once, so the session is still open when the
// turn completes — and each asserts that it was.
// ---------------------------------------------------------------------------

/**
 * The lesson's own lawful U-turn at the gap, then south down the west half
 * and a U-turn BACK (left, toward the east half) on radius r begun at
 * (x0, y0). `runKmh` is the speed south, `brakeM` the metres before y0 over
 * which he slows to `arcKmh`. The span's start is 220 m from the gap and the
 * route ends ~26 s after the lawful turn, so the two acts at y ≈ 45 run south
 * at 60 км/ч (10 over the limit — that row is his, and is not what is asserted
 * here) and brake for the turn.
 */
function lawfulThenTurnBack(x0: number, y0: number, r: number, runKmh: number, brakeM: number, arcKmh: number): DriveScript {
  const a = arc(x0, y0, 180, r, 180);
  return {
    steps: [
      ...lawfulHead(),
      { kind: "drive", points: [[-12.19, 264], [-12.19, 250], [x0, 236], [x0, r3(y0 + brakeM)]], targetKmh: runKmh, stopAtEnd: false },
      { kind: "drive", points: [[x0, r3(y0 + brakeM)], [x0, r3(y0)]], targetKmh: arcKmh, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: arcKmh, stopAtEnd: false },
      ...tail(a.x, a.y, 0, 10),
    ],
  };
}

/** The whole body is EAST of the axis (the far half for a car travelling south on the west one). */
const bodyWhollyEast = (k: SimTick): boolean => k.position.x - reachAcrossM(k) >= 0;

/**
 * THE TURN BACK, FROM THE POSE ALONE — `firstTurnRound`'s mirror, read from
 * the frame the lawful turn left him west of the axis and pointing south:
 * «turned» is the nose more than 45° off SOUTH; the reversal completes when
 * the centre has been east of the axis with the nose within 45° of north for
 * the sustain.
 */
function turnBackSouthbound(o: LiveRungOutcome): null | { station: SimTick; crossed: SimTick; completed: SimTick } {
  const from = o.ticks.findIndex((k) => k.position.x < 0 && Math.abs(wrap180(k.headingDeg - 180)) <= WITH_DEG);
  if (from < 0) return null;
  let runStart: SimTick | null = null;
  let crossed: SimTick | null = null;
  let withSince: number | null = null;
  for (const k of o.ticks.slice(from)) {
    const east = k.position.x > 0;
    const off = Math.abs(wrap180(k.headingDeg - 180));
    if (!east) {
      runStart = null;
      crossed = null;
      withSince = null;
      continue;
    }
    if (crossed === null) crossed = k;
    if (off > WITH_DEG) {
      if (runStart === null) runStart = k;
    } else {
      runStart = null;
    }
    if (180 - off <= WITH_DEG) {
      if (withSince === null) withSince = k.t;
      if (k.t - withSince >= SUSTAIN_SEC - 1e-9 && runStart !== null) return { station: runStart, crossed, completed: k };
    } else {
      withSince = null;
    }
  }
  return null;
}

/** `expectGlassTrue` for the car that crossed from the WEST half: every crossing sentence on the glass is true on its frame. */
function expectGlassTrueSouthbound(o: LiveRungOutcome): number {
  const shown = crossingGlass(o);
  for (const g of shown) {
    const at = tickAt(o, g.t);
    const where = `${g.src} «${g.explanationBg.slice(0, 40)}…» at t=${g.t.toFixed(2)} x=${at.position.x.toFixed(2)} h=${wrap180(at.headingDeg).toFixed(1)}`;
    expect({ where, centreAcross: at.position.x > 0 }).toEqual({ where, centreAcross: true });
    if (g.titleBg === UTURN_TITLE) {
      expect(g.explanationBg).toContain(UTURN_SENTENCE);
      expect({ where, turnedRound: Math.abs(wrap180(at.headingDeg)) <= WITH_DEG }).toEqual({ where, turnedRound: true });
      continue;
    }
    const wholly = bodyWhollyEast(at);
    expect({ where, saysWholly: g.explanationBg.includes("изцяло") }).toEqual({ where, saysWholly: wholly });
    expect(g.explanationBg.startsWith(wholly ? WHOLLY_SENTENCE : ASTRIDE_SENTENCE)).toBe(true);
  }
  return shown.length;
}

/** The turn back was made, and the session was still open when it completed (a route that had ended would prove nothing). */
function expectTurnedBackInTime(o: LiveRungOutcome): { station: SimTick; crossed: SimTick; completed: SimTick } {
  const turn = turnBackSouthbound(o);
  expect(turn).not.toBeNull();
  const endedAt = o.session.endedAtSec ?? Number.POSITIVE_INFINITY;
  expect({ completed: turn!.completed.t < endedAt }).toEqual({ completed: true });
  return turn!;
}

describe("§R4-1 SOUTHBOUND — after the lawful turn the west half is the one he travels with, and the turn station decides a turn BACK the same way: inside the span, and either side of the solid axis's other end (y 40)", () => {
  for (const level of [1, 3, 4] as const) {
    it(`L${level}: the lesson's lawful U-turn at the gap, then a U-turn BACK across the solid axis at y ≈ 195 → the lawful turn is billed by nothing, the turn back is the U-turn`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, lawfulThenTurnBack(-2.2, 200, 6, 45, 20, 14));
      const turn = expectTurnedBackInTime(o);
      expect(inSpan(turn.crossed.position.y)).toBe(true);
      expect(turn.crossed.solidCenterLine).toBe(true);
      expect(inSpan(turn.station.position.y)).toBe(true);
      expect(turn.station.solidCenterLine).toBe(true);
      // ONE row, and it is this turn's: nothing was billed before he crossed back.
      const row = expectNamedUTurn(o, level);
      expect(row.t).toBeGreaterThanOrEqual(turn.crossed.t);
      expect(expectGlassTrueSouthbound(o)).toBeGreaterThan(0);
    });
  }

  it("L3: THE TURN BACK near y 40, where the solid axis ends for him — begun at y 46 and at y 43.5, the centre crossing over the solid axis both times (y 43.6 and y 41.1): BOTH turn-rounds begin where the axis is solid → the U-turn both times (round 4 gave the second the crossing's copy because its nose passed 45° at y 39.2, over the dashes — verifier Y5; the astride pair either side of y 40 is in mv-uturn-ban-one-definition-of-the-act)", () => {
    for (const y0 of [46, 43.5]) {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, lawfulThenTurnBack(-0.5, y0, 6, 60, 22, 18));
      const t = expectTurnedBackInTime(o);
      expect(t.crossed.position.y).toBeGreaterThan(SPAN.fromY);
      expect(t.crossed.solidCenterLine).toBe(true);
      const back = oracle(o.ticks).turnRounds[1];
      expect(Math.abs(back.beginY! - y0)).toBeLessThan(0.75);
      expect(o.ticks[back.beginI].solidCenterLine).toBe(true);
      expectNamedUTurn(o, 3);
      expect(expectGlassTrueSouthbound(o)).toBeGreaterThan(0);
    }
    // The nose of the second one passes 45° past the end of the solid line — which no longer decides anything.
    const second = driveLiveRung(SC_MV_UTURN_BAN, 3, lawfulThenTurnBack(-0.5, 43.5, 6, 60, 22, 18));
    const t2 = expectTurnedBackInTime(second);
    expect(t2.station.position.y).toBeLessThan(SPAN.fromY);
    expect(t2.station.solidCenterLine).not.toBe(true);
  });

  it("L3: …and one arc from the lane beside the axis — the centre crossing at y 42.2, over the solid axis → billed and named; at y 39.2, over the dashes → a lawful U-turn, nothing billed", () => {
    const inside = driveLiveRung(SC_MV_UTURN_BAN, 3, lawfulThenTurnBack(-2.2, 47, 6, 60, 22, 18));
    const a = expectTurnedBackInTime(inside);
    expect(a.crossed.position.y).toBeGreaterThan(SPAN.fromY);
    expect(a.crossed.solidCenterLine).toBe(true);
    expectNamedUTurn(inside, 3);
    expect(expectGlassTrueSouthbound(inside)).toBeGreaterThan(0);

    const past = driveLiveRung(SC_MV_UTURN_BAN, 3, lawfulThenTurnBack(-2.2, 44, 6, 60, 22, 18));
    const b = expectTurnedBackInTime(past);
    expect(b.crossed.position.y).toBeLessThan(SPAN.fromY);
    expect(b.crossed.solidCenterLine).not.toBe(true);
    expectNoCrossing(past);
  });
});

describe("§controls — the lawful U-turn at the gap is billed by nothing (the verifier's 14), and a lawful turn is evidence for nothing after it", () => {
  for (const level of ALL_RUNGS) {
    it(`L${level}: B4 — the lesson's own correct drive → no crossing, 0 т.`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, scMvUturnBanShadowScript());
      expectNoCrossing(o);
      expect(o.result.passed).toBe(true);
      expect(o.scored).toEqual([]);
      expect(o.coached).toEqual([]);
    });
  }
  for (const [x0, y0, r] of [
    [4.06, 240, 8.125],
    [4.06, 225, 8.125],
    [4.06, 214, 8.125],
    [4.06, 272, 8.125],
    [4.06, 276, 10],
    [12.19, 268, 12.19],
    [1.1, 222, 6],
    [4.06, 284, 8.125],
    [12.19, 250, 14],
  ] as const) {
    it(`L3: B4 — a U-turn at / near the gap from (${x0}, ${y0}) on r = ${r} → no crossing`, () => {
      expectNoCrossing(driveLiveRung(SC_MV_UTURN_BAN, 3, lawfulAt(x0, y0, r)));
    });
  }
  for (const [yDrift, level] of [
    [200, 3],
    [190, 3],
    [150, 3],
  ] as const) {
    it(`L${level}: B1 — the lawful U-turn, then a drift over the solid axis and back near y ${yDrift} → ONE crossing row, never named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, lawfulThenDrift(yDrift, yDrift === 190 ? 30 : 40));
      const rows = crossingRows(o);
      expect(rows).toHaveLength(1);
      expect(rows[0].titleBg).toBe(CROSSING_TITLE);
      expect([undefined, ASTRIDE_ACT]).toContain(rows[0].detail);
      expect(o.debrief).not.toContain(UTURN_TITLE);
      expect(o.debrief).not.toMatch(FORBIDDEN_HERE);
    });
  }
});
