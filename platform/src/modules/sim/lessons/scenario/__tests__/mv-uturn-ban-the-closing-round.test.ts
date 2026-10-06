/**
 * WITNESS, ROUND 6 — sc-mv-uturn-ban: THE CLOSING ROUND.
 *
 * Round 5 («one definition of the act») was signed off on 598 verifier drives
 * with conditions (journal wf_0e0b8b7a-edb, verifier findings C1 … C4 and N4).
 * This file pins what closes them, every act through the live-rung chain
 * (witnessLiveRung: the compiled rung → createLessonSession → applyTick →
 * buildLessonResult → buildDebrief) and judged from the raw pose by
 * `uturnActOracle.ts`, never from the product's tracker:
 *
 *  R6-1 THE TRACKER SURVIVES THE JUNCTION (C2). The boulevard is two edges
 *       split at y 280. The car's travel direction, reference half, swing,
 *       begin station and any open crossing carry across a change of edge on
 *       the same road, and when a road first sees a car its travel direction
 *       is taken from its heading and its reference half is the half it is
 *       on. So nothing — the plain detector included — bills a crossing the
 *       centre has not made; and a real U-turn made after a turn-round past
 *       the junction is billed and named exactly as R5-2 says.
 *  R6-2 ONE ACT, ONE BILL ENDS WITH THE SWING (C3). A second crossing on the
 *       same swing as a billed turn-round is not billed again. Once that swing
 *       has ended, home is the half of the car's NEW travel direction: a
 *       centre then across the solid axis from that half for the sustain is a
 *       new crossing with a bill of its own.
 *  R6-3 THE CROSSING'S REASON NEVER NAMES THE WRONG HALF (C1). «…и навлезе …
 *       в насрещната половина на платното» is printed only for a car entering
 *       the half whose traffic runs AGAINST its travel direction. A car that
 *       has turned round and crosses into the half of its own direction is
 *       told «Пресече изцяло / Застъпи непрекъснатата осева линия.» and the
 *       pooled second sentence.
 *  R6-4 THE THREE GAPS ONLY THE VERIFIER'S DRIVES KILLED (C4): Z9d, Z12n, E5.
 *  R6-5 THE SWING DOES NOT DEPEND ON THE SAMPLE STEP (N4): the same path drawn
 *       in 0.25°, 0.5°, 1° and 3° vertices gives the same place.
 *
 * Every act of §C1 … §C4 is the round-5 verifier's own geometry
 * (D:/knijka-lanes/scratch/uturn-verifier-r5/zz-v5-all.test.ts, rows E1, E2,
 * E4, E5, P1, P2, Q5, Q6, Z2, Z9d, Z12n, Z30, Z33, Z42), ported unchanged.
 *
 * KILL-CHECKS (each reddens this file on an assertion; restored, sha-verified):
 *   · the tracker reset on a change of edge of the same road;
 *   · the reference half taken from «the first half the car travels WITH»;
 *   · home after a billed turn-round left on the half the centre is on;
 *   · the direction flag dropped from the crossing's reason;
 *   · the swing ended by «2 m without a degree» alone (no resume by rate).
 */

import { describe, expect, it } from "vitest";
import { PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../../collision/bodies";
import { makeViolation, VIOLATIONS, type SimTick, type ViolationCode } from "../../../rules";
import type { DriveScript } from "../../../traces/recorder";
import { scMvUturnBanShadowScript } from "../../../traces/scMvUturnBan";
import { SC_MV_UTURN_BAN } from "../templates-parking2";
import {
  billIsOfACrossing,
  crossingBilledAt,
  inSpan,
  oncomingAt,
  oracle,
  SPAN,
  wrap180,
  type OracleTruth,
} from "./uturnActOracle";
import { buildDebrief } from "../../debrief";
import { driveLiveRung, type LiveRungOutcome } from "./witnessLiveRung";

const UTURN_ACT = "u-turn";
const UTURN_TITLE = "Обратен завой през непрекъсната осева линия";
const CROSSING_TITLE = "Пресичане на непрекъсната осева линия";
const SECOND_SENTENCE =
  "Единичната непрекъсната линия (М1) не се застъпва и не се пресича — тя стои точно там, където насрещното движение или видимостта правят навлизането отсреща опасно.";
/** The four reasons a crossing can carry: [whole body across?][entered half is oncoming?]. */
const REASON = {
  whollyOncoming: `Пресече изцяло непрекъснатата осева линия и навлезе в насрещната половина на платното. ${SECOND_SENTENCE}`,
  astrideOncoming: `Застъпи непрекъснатата осева линия и навлезе с повече от половината автомобил в насрещната половина на платното. ${SECOND_SENTENCE}`,
  whollyOwnWay: `Пресече изцяло непрекъснатата осева линия. ${SECOND_SENTENCE}`,
  astrideOwnWay: `Застъпи непрекъснатата осева линия. ${SECOND_SENTENCE}`,
} as const;
const ACT_OF_REASON: Record<string, string | undefined> = {
  [REASON.whollyOncoming]: undefined,
  [REASON.astrideOncoming]: "astride",
  [REASON.whollyOwnWay]: "own-way",
  [REASON.astrideOwnWay]: "astride-own-way",
};
/** The reason the catalogue prints for a crossing row's act (a coached row carries the act, not the sentence). */
function reasonOfAct(detail: string | undefined): string {
  const hit = Object.entries(ACT_OF_REASON).find(([, act]) => act === detail);
  return hit === undefined ? "" : hit[0];
}
const ONCOMING_CLAUSE = "в насрещната половина на платното";
const UTURN_CORRECTIVE = "Обратен завой не се прави през плътна линия";
const CROSSING_CORRECTIVE = "Плътна линия = стена: остани в своята лента, дори предният да пълзи.";
const CLEAN_PRAISE = /чисто каране по изпитния лист|оценката е за незавършения маршрут, не за карането/u;
type Rung = 1 | 2 | 3 | 4 | 5;

// ---------------------------------------------------------------------------
// geometry — the verifier's own helpers (zz-v5-all.test.ts), verbatim
// ---------------------------------------------------------------------------

type Pt = [number, number];
type Steps = DriveScript["steps"];
const rad = (d: number) => (d * Math.PI) / 180;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** An arc of radius r from pose (x0, y0, heading h0 — degrees LEFT of north), turning `turnDeg` (+ = left), drawn in `stepDeg` vertices. */
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
    // Fine sweeps (R6-5) need more than a millimetre of resolution in their vertices.
    pts.push(stepDeg < 3 ? [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6] : [r3(x), r3(y)]);
  }
  return { pts, x, y, h };
}
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
/** The lesson's own correct drive up to and including a lawful arc at y 228 (the verifier's `southLead`). */
function southLead(): Steps {
  const a = arc(4.06, 228, 0, 8.125, 180);
  return [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: [[12.19, 15], [12.19, 150]], targetKmh: 46, stopAtEnd: false },
    { kind: "glance", mirror: "left" },
    { kind: "indicator", setting: "left" },
    { kind: "drive", points: [[12.19, 150], [8, 180], [4.06, 205], [4.06, 228]], targetKmh: 30 },
    { kind: "pause", sec: 14.5, brake: true },
    { kind: "drive", points: a.pts, targetKmh: 8, stopAtEnd: false },
    { kind: "indicator", setting: "off" },
  ];
}

// ---- §C2 the junction (verifier E1, E2, E4) ----

/** E1 — the own-half turn-round (r 6) begun at y0, then south the wrong way and over the solid axis at y ≈ 213. */
function e1(y0: number): DriveScript {
  const a = arc(12.19, y0, 0, 6.0, 180);
  return {
    steps: [
      ...outerApproach(12.19, y0),
      { kind: "pause", sec: 13, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [r3(a.x), 214], [-4.06, 190], [-4.06, 165]], targetKmh: 22 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** E2 — the same turn-round, then south the wrong way down his own half, NEVER crossing. */
function e2(y0: number): DriveScript {
  const a = arc(12.19, y0, 0, 6.0, 180);
  return {
    steps: [
      ...outerApproach(12.19, y0),
      { kind: "pause", sec: 13, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [r3(a.x), 236], [4.06, 215], [4.06, 150]], targetKmh: 22 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** E4 — the same turn-round, south the wrong way into the span, then a RIGHT-hand round (r 5) across the solid axis begun at y 160. */
function e4(y0: number): DriveScript {
  const a = arc(12.19, y0, 0, 6.0, 180);
  const b = arc(4.06, 160, 180, 5, -180);
  return {
    steps: [
      ...outerApproach(12.19, y0),
      { kind: "pause", sec: 13, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [r3(a.x), 236], [4.06, 222], [4.06, 160.001]], targetKmh: 22, stopAtEnd: false },
      { kind: "drive", points: b.pts, targetKmh: 9, stopAtEnd: false },
      ...tail(b.x, b.y, 0, 15),
    ],
  };
}

// ---- §C3 the over-rotated U-turn (verifier Z30) ----

/** Z30 — the U-turn from the outer lane on r 6.5 that over-rotates on the same swing back over the solid axis, then 40 m southbound on the EAST half, then back. */
function z30(): DriveScript {
  const a1 = arc(12.19, 150, 0, 6.5, 180);
  const a2 = arc(a1.x, a1.y, 180, 15, 20);
  const d = line(a2.x, a2.y, 200, 10);
  return {
    steps: [
      ...outerApproach(12.19, 150),
      { kind: "drive", points: [...a1.pts, ...a2.pts.slice(1), ...d.pts.slice(1), [4.06, r3(d.y - 8)], [4.06, r3(d.y - 48)], [-4.06, r3(d.y - 70)], [-4.06, r3(d.y - 85)]], targetKmh: 12 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** R2c with a LONG run afterwards — pulled out wholly across, a right-hand round on r 5 back over the solid axis, then `runM` southbound on the half he set out from. */
function r2cThenRun(runM: number): DriveScript {
  const a = arc(-4.06, 130, 0, 5, -180);
  return {
    steps: [
      ...lead(4.06, 80),
      { kind: "drive", points: [[4.06, 80], [-4.06, 100], [-4.06, 130]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      ...tail(a.x, a.y, 180, runM),
    ],
  };
}

/**
 * THE U-TURN AT THE END OF THE SOLID LINE THAT OVER-ROTATES (the round-6 fuzz,
 * drives 607#230 and 602#230): from x 11 on r 5.75 begun at y0 — the centre
 * goes over the axis 156° round, 2.3 m further up the road, AFTER the
 * turn-round is confirmed — then the same swing 25° on (r 14) back over the
 * axis, and `runM` southbound on the half he set out from.
 */
function uTurnAtTheSpanEndThatOverRotates(y0: number, runM: number): DriveScript {
  const a1 = arc(11, y0, 0, 5.75, 180);
  const a2 = arc(a1.x, a1.y, 180, 14, 25);
  const len = (2 - a2.x) / Math.sin(rad(25));
  const yOut = a2.y - Math.cos(rad(25)) * len;
  return {
    steps: [
      ...outerApproach(11, y0),
      { kind: "drive", points: [...a1.pts, ...a2.pts.slice(1), [2, r3(yOut)], [2, r3(yOut - runM)]], targetKmh: 9 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

// ---- §C1 the P class (verifier P1, P2, Q5, Q6, Z2, Z33, Z42) ----

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
/** Z2 — SOUTHBOUND after a lawful turn: the own-half turn-round on the WEST half, then north the wrong way, then over the solid axis to the east half. */
function southOwnHalfTurn(y0: number, r: number, hold: number, crossDeg = 10): DriveScript {
  const a = arc(-12.19, y0, 180, r, 180);
  const y1 = a.y + hold;
  const dy = (4.06 - a.x) / Math.tan(rad(crossDeg));
  return {
    steps: [
      ...southLead(),
      { kind: "drive", points: [[-12.19, 228], [-12.19, y0]], targetKmh: 35 },
      { kind: "pause", sec: 0.8, brake: true },
      { kind: "drive", points: [...a.pts, [r3(a.x), r3(y1 + 0.01)], [4.06, r3(y1 + dy)], [4.06, r3(y1 + dy + 25)]], targetKmh: 9 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** Z33 — Y1 by a RIGHT-hand round on his own half at y 240, then south and over the solid axis. */
function z33(): DriveScript {
  const a = arc(4.06, 240, 0, 5.9, -180);
  return {
    steps: [
      ...approach(4.06, 240),
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [r3(a.x), 225], [-4.06, 170.3], [-4.06, 150]], targetKmh: 20 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** Z42 — Y1 fast: the own-half turn at y 240, then 35 км/ч the wrong way and over the solid axis on a 35° diagonal. */
function z42(): DriveScript {
  const a = arc(12.19, 240, 0, 6.0, 180);
  return {
    steps: [
      ...outerApproach(12.19, 240),
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [r3(a.x), 215], [-4.06, 208.9], [-4.06, 175]], targetKmh: 35 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** A plain northbound pull-out over the solid axis and back (20° diagonals, 12 m out). */
function pullOutAndBack(): DriveScript {
  const out = line(4.06, 100, 20, (4.06 + 4.06) / Math.sin(rad(20)));
  const run = line(out.x, out.y, 0, 12);
  const back = line(run.x, run.y, -20, (4.06 + 4.06) / Math.sin(rad(20)));
  return {
    steps: [
      ...approach(4.06, 100, false),
      { kind: "drive", points: [...out.pts, ...run.pts.slice(1), ...back.pts.slice(1), [4.06, 170]], targetKmh: 20 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** A plain northbound straddle: the centre 0.3 m over the solid axis for 30 m, and back. */
function straddleAndBack(): DriveScript {
  return {
    steps: [
      ...lead(1.2, 110),
      { kind: "drive", points: [[1.2, 110], [-0.3, 122], [-0.3, 152], [4.06, 172], [4.06, 185]], targetKmh: 14 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

// ---- §C4 the three gaps (verifier Z9d, Z12n, E5) ----

/** Z9d — from the outer lane, r 5 to 150°, then the SAME swing eased out on r 30: the centre goes over the solid axis with the nose ~164° round. */
function z9d(y0: number): DriveScript {
  const a1 = arc(12.19, y0, 0, 5, 150);
  const a2 = arc(a1.x, a1.y, 150, 30, 30);
  return {
    steps: [
      ...outerApproach(12.19, y0),
      { kind: "drive", points: [...a1.pts, ...a2.pts.slice(1)], targetKmh: 9, stopAtEnd: false },
      ...tail(a2.x, a2.y, 180, 20),
    ],
  };
}
/** Z12n — a 40° diagonal over the solid axis and off into the west field (the nose never out of the band), the turn-round made OUT THERE past the fix, then back onto the west half southbound. */
function z12n(): DriveScript {
  const d = line(4.06, 100, 40, 62);
  const a = arc(d.x, d.y, 40, 6, 140);
  return {
    steps: [
      ...approach(4.06, 100, false),
      { kind: "drive", points: [...d.pts, ...a.pts.slice(1)], targetKmh: 14, stopAtEnd: false },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [-30, a.y - 14], [-12.19, a.y - 40], [-12.19, a.y - 60]], targetKmh: 18 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}
/** E5 — the own-half turn over the dashes (y 240), south the wrong way HUGGING the axis at x0, then a RIGHT-hand round across the solid axis at y 160. */
function e5(x0: number, r: number, kmh: number): DriveScript {
  const a = arc(12.19, 240, 0, 6.0, 180);
  const b = arc(x0, 160, 180, r, -180);
  return {
    steps: [
      ...outerApproach(12.19, 240),
      { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [r3(a.x), 200], [x0, 185], [x0, 160.001]], targetKmh: 22, stopAtEnd: false },
      { kind: "drive", points: b.pts, targetKmh: kmh, stopAtEnd: false },
      ...tail(b.x, b.y, 0, 15),
    ],
  };
}

// ---- §R6-5 one path, four sample steps ----

/**
 * ASTRIDE 0.3 m from y 152; at `yStart` a sweep to the left on radius `R` until
 * the car is 20 m further up the road; then full lock (r 6) to 180° round. The
 * whole path is drawn in `stepDeg` vertices.
 */
function sweepThenLock(yStart: number, R: number, stepDeg: number, sweepDegIn?: number): DriveScript {
  const sweepDeg = sweepDegIn ?? (Math.asin(Math.min(1, 20 / R)) * 180) / Math.PI;
  const a1 = arc(-0.3, yStart, 0, R, sweepDeg, stepDeg);
  const a2 = arc(a1.x, a1.y, sweepDeg, 6, 180 - sweepDeg, stepDeg);
  return {
    steps: [
      ...lead(1.2, 140),
      { kind: "drive", points: [[1.2, 140], [-0.3, 152], [-0.3, yStart]], targetKmh: 14, stopAtEnd: false },
      { kind: "drive", points: [...a1.pts, ...a2.pts.slice(1)], targetKmh: 9, stopAtEnd: false },
      ...tail(a2.x, a2.y, 180, 12),
    ],
  };
}
const SAMPLE_STEPS = [0.25, 0.5, 1, 3] as const;

// ---------------------------------------------------------------------------
// what the product returned, and what the pose says of it
// ---------------------------------------------------------------------------

interface Row {
  where: "coached" | "scored";
  t: number;
  detail: string | undefined;
  titleBg: string;
  explanationBg: string;
}
function crossingRows(o: LiveRungOutcome): Row[] {
  const rows: Row[] = [];
  for (const c of o.result.coachedMistakes ?? []) {
    if (c.code === "CROSSED_SOLID_LINE") rows.push({ where: "coached", t: c.t, detail: c.detail, titleBg: c.titleBg, explanationBg: reasonOfAct(c.detail) });
  }
  for (const e of o.session.events) {
    if (e.kind === "violation" && e.code === "CROSSED_SOLID_LINE") {
      // A charged row carries the sentence itself: it must be the catalogue's for its act.
      if (e.detail !== UTURN_ACT) expect(e.explanationBg).toBe(reasonOfAct(e.detail));
      rows.push({ where: "scored", t: e.t, detail: e.detail, titleBg: e.titleBg, explanationBg: e.explanationBg });
    }
  }
  return rows.sort((a, b) => a.t - b.t);
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

/** The reason a crossing billed on frame `i` has earned: the body, and the half against the travel direction. */
function reasonEarnedAt(o: LiveRungOutcome, truth: OracleTruth, i: number): string[] {
  const wholly = bodyClear(o.ticks[i]);
  const oncoming = oncomingAt(truth, o.ticks, i);
  const own = wholly ? REASON.whollyOwnWay : REASON.astrideOwnWay;
  const onc = wholly ? REASON.whollyOncoming : REASON.astrideOncoming;
  // No travel direction yet: the pooled wording, as shipped. A boundary frame: either.
  if (oncoming === null) return [onc];
  if (oncoming === "boundary") return [own, onc];
  return [oncoming ? onc : own];
}

/**
 * EVERY ROW AND EVERY CROSSING SENTENCE AGAINST THE POSE (rounds 5 and 6):
 *  · a bill goes out only for a crossing the centre has MADE (R6-1): across
 *    from home on its frame, or the sustain after the centre really went over;
 *  · a row is the U-turn exactly when R5-2 says the crossing it bills is —
 *    and the bill R6-2 gives the wrong-half run after a U-turn is a standing
 *    crossing like any other: a crossing, unless a LATER turn-round begun
 *    over the solid axis makes it the U-turn too;
 *  · a crossing's reason is the one the body and the travel direction earned
 *    on its bill frame (R6-3), on the row and on every glass surface.
 */
function expectEveryBillTrue(o: LiveRungOutcome): { rows: Row[]; truth: OracleTruth } {
  const truth = oracle(o.ticks);
  const rows = crossingRows(o);
  for (const r of rows) {
    const i = indexAt(o, r.t);
    const k = o.ticks[i];
    const where = `row at t=${r.t.toFixed(2)} x=${k.position.x.toFixed(2)} y=${k.position.y.toFixed(1)} h=${wrap180(k.headingDeg).toFixed(0)} (${r.detail ?? "pooled"})`;
    expect({ where, ofACrossingTheCentreMade: billIsOfACrossing(truth, o.ticks, i) }).toEqual({ where, ofACrossingTheCentreMade: true });
    const run = truth.wrongHalfRuns.find((w) => r.t >= w.fromT + RUN_BILL_FROM && r.t <= w.fromT + RUN_BILL_TO);
    const c = crossingBilledAt(truth, r.t);
    const uTurn = run !== undefined ? run.uTurn : c !== null && c.uTurn;
    expect({ where, named: r.detail === UTURN_ACT }).toEqual({ where, named: uTurn });
    expect({ where, title: r.titleBg }).toEqual({ where, title: uTurn ? UTURN_TITLE : CROSSING_TITLE });
    if (!uTurn) {
      expect({ where, reasonEarned: reasonEarnedAt(o, truth, i).includes(r.explanationBg) }).toEqual({ where, reasonEarned: true });
      expect({ where, act: r.detail }).toEqual({ where, act: ACT_OF_REASON[r.explanationBg] });
    }
  }
  for (const g of o.glass) {
    if (g.titleBg !== CROSSING_TITLE) continue;
    const i = indexAt(o, g.t);
    const k = o.ticks[i];
    const where = `${g.src} at t=${g.t.toFixed(2)} x=${k.position.x.toFixed(2)} h=${wrap180(k.headingDeg).toFixed(0)}: «${g.explanationBg.slice(0, 60)}…»`;
    expect({ where, reasonEarned: reasonEarnedAt(o, truth, i).includes(g.explanationBg) }).toEqual({ where, reasonEarned: true });
  }
  // R6-2: a wrong-half run that outlasts the sustain (with room to spare) has its bill.
  for (const w of truth.wrongHalfRuns) {
    const ended = o.session.endedAtSec ?? Number.POSITIVE_INFINITY;
    if (w.heldSec < 1.5 || w.fromT + 1.5 > ended) continue;
    const where = `wrong-half run from t=${w.fromT.toFixed(2)} y=${w.y.toFixed(1)} held ${w.heldSec.toFixed(1)} s`;
    // …the sustain after the swing ended — not earlier: the swing's own crossings are the U-turn's.
    expect({ where, billed: rows.some((r) => r.t >= w.fromT + RUN_BILL_FROM && r.t <= w.fromT + RUN_BILL_TO && (r.detail === UTURN_ACT) === w.uTurn) }).toEqual({ where, billed: true });
  }
  return { rows, truth };
}

const whereOf = (level: Rung): "coached" | "scored" => (level === 4 ? "scored" : "coached");
/**
 * WHEN THE BILL OF A WRONG-HALF RUN IS DUE (R6-2), seconds after the swing
 * ended: the detector's sustain (0.6 s) — counted from the frame the manoeuvre
 * is closed, which is the swing's end or, where the U-turn's own bill is still
 * inside ITS sustain then, that bill (at most 0.6 s later).
 */
const RUN_BILL_FROM = 0.5;
const RUN_BILL_TO = 1.3;

/**
 * R6-2, THE OTHER HALF OF «ONE ACT, ONE BILL»: after the U-turn's row, the only
 * further rows are the bills of the wrong-half runs the pose shows — one each,
 * a crossing, charged, saying «насрещната» (it is: the half runs against the
 * car's new travel direction) — and a run the session stayed open for is billed.
 */
function expectOnlyTheWrongHalfBills(o: LiveRungOutcome, extra: Row[], truth: OracleTruth): void {
  const ended = o.session.endedAtSec ?? Number.POSITIVE_INFINITY;
  const due = truth.wrongHalfRuns.filter((w) => w.heldSec >= 1.5 && w.fromT + 1.5 <= ended);
  const possible = truth.wrongHalfRuns.filter((w) => w.heldSec >= 0.55 && w.fromT + 0.55 <= ended);
  expect(extra.length).toBeGreaterThanOrEqual(due.length);
  expect(extra.length).toBeLessThanOrEqual(possible.length);
  for (const r of extra) {
    const where = `extra row at t=${r.t.toFixed(2)} (${r.detail ?? "pooled"})`;
    const run = truth.wrongHalfRuns.find((w) => r.t >= w.fromT + RUN_BILL_FROM && r.t <= w.fromT + RUN_BILL_TO);
    expect({ where, isAWrongHalfRunBill: run !== undefined }).toEqual({ where, isAWrongHalfRunBill: true });
    expect(r.titleBg).toBe(CROSSING_TITLE);
    expect(r.where).toBe("scored");
    expect(r.explanationBg).toContain(ONCOMING_CLAUSE);
  }
}

// ---------------------------------------------------------------------------

describe("§C2 / R6-1 THE TRACKER SURVIVES THE JUNCTION — a turn-round made on either edge of the boulevard is the same turn-round", () => {
  for (const y0 of [240, 280, 300, 305] as const) {
    it(`L3: E1 — the own-half turn-round begun at y ${y0}${y0 > 290 ? " (the car is on the edge BEYOND the junction)" : ""}, south the wrong way, over the solid axis at y ≈ 213 → ONE crossing row, billed after the centre is over, never before`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, e1(y0));
      const { rows, truth } = expectEveryBillTrue(o);
      const solid = truth.crossings.filter((c) => c.solid);
      expect(solid.map((c) => c.why)).toEqual(["after-the-turn-round"]);
      expect(rows.map((r) => `${r.where}:${r.titleBg}`)).toEqual([`coached:${CROSSING_TITLE}`]);
      // The bill is the crossing's: it goes out the sustain after the centre went over, with the centre across.
      expect(rows[0].t).toBeGreaterThanOrEqual(solid[0].t + 0.5);
      expect(o.ticks[indexAt(o, rows[0].t)].position.x).toBeLessThan(0);
      // R6-3: he is travelling south and enters the half that runs south.
      expect(rows[0].explanationBg).not.toContain(ONCOMING_CLAUSE);
      expect(o.debrief).not.toContain(UTURN_TITLE);
      expect(o.debrief).not.toContain(UTURN_CORRECTIVE);
    });
  }
  it("the turn at y 300 and y 305 really is made on the other edge, and the car comes back to the span's edge before the span", () => {
    for (const y0 of [300, 305] as const) {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, e1(y0));
      const edges: string[] = [];
      for (const k of o.ticks) {
        const e = k.edgeAlignment?.edgeId ?? "none";
        if (edges[edges.length - 1] !== e) edges.push(e);
      }
      expect(edges).toEqual(["mvu-e-ban", "mvu-e-beyond", "mvu-e-ban"]);
      const truth = oracle(o.ticks);
      expect(truth.turnRounds.length).toBe(1);
      const during = o.ticks.slice(truth.turnRounds[0].beginI, truth.turnRounds[0].confirmedI + 1).map((k) => k.edgeAlignment?.edgeId);
      expect(new Set(during)).toEqual(new Set(["mvu-e-beyond"]));
    }
  });
  for (const y0 of [240, 280, 305] as const) {
    it(`L3: E2 — the own-half turn-round at y ${y0}, then south the wrong way down his own half through the whole span, NEVER crossing → nothing bills a crossing (wrong-way travel that crosses nothing is the recorded, unbilled class)`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, e2(y0));
      const { rows, truth } = expectEveryBillTrue(o);
      expect(truth.crossings).toEqual([]);
      // He really does run the span the wrong way, well above walking pace.
      const inSpanWrongWay = o.ticks.filter((k) => inSpan(k.position.y) && Math.abs(wrap180(k.headingDeg - 180)) < 45 && k.position.x > 0 && k.speedKmh > 15);
      expect(inSpanWrongWay.length).toBeGreaterThan(300);
      expect(rows).toEqual([]);
      for (const g of o.glass) expect(g.titleBg).not.toBe(CROSSING_TITLE);
      expect(o.debrief).not.toContain(CROSSING_TITLE);
      expect(o.debrief).not.toContain(UTURN_TITLE);
    });
  }
  for (const y0 of [240, 305] as const) {
    for (const level of [1, 3, 4] as const) {
      it(`L${level}: E4 — the own-half turn-round at y ${y0}, south the wrong way into the span (billed by nothing), then a RIGHT-hand round across the solid axis begun at y 160 → that U-turn is billed and named; the only other row there can be is R6-2's, for running on north on the half that runs south`, () => {
        const o = driveLiveRung(SC_MV_UTURN_BAN, level, e4(y0));
        const { rows, truth } = expectEveryBillTrue(o);
        expect(truth.turnRounds.length).toBe(2);
        expect(truth.turnRounds[1].beginSolid).toBe(true);
        expect(Math.abs(truth.turnRounds[1].beginY! - 160)).toBeLessThan(0.5);
        const solid = truth.crossings.filter((c) => c.solid);
        expect(solid.map((c) => c.uTurn)).toEqual([true]);
        // The session is still open when the turn-round is confirmed.
        expect(truth.turnRounds[1].confirmedT).toBeLessThan(o.session.endedAtSec ?? Number.POSITIVE_INFINITY);
        expect(`${rows[0].where}:${rows[0].detail}`).toBe(`${whereOf(level)}:${UTURN_ACT}`);
        expect(rows[0].t).toBeGreaterThan(solid[0].t);
        // He ends northbound on the WEST half: across the solid axis from the half of his new direction.
        expectOnlyTheWrongHalfBills(o, rows.slice(1), truth);
        expect(o.debrief).toContain(UTURN_TITLE);
        expect(o.debrief).toContain(UTURN_CORRECTIVE);
        expect(o.debrief).not.toMatch(CLEAN_PRAISE);
      });
    }
  }
});

describe("§C3 / R6-2 ONE ACT, ONE BILL ENDS WITH THE SWING — after the U-turn's swing, home is the half of the new travel direction", () => {
  for (const level of [1, 3, 4] as const) {
    it(`L${level}: Z30 — the U-turn from the outer lane on r 6.5 (named), the same swing over-rotating back over the solid axis (not billed again), then 40 m southbound on the EAST half → that run is a NEW crossing with its own bill, and it says «насрещната»: it is`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, z30());
      const { rows, truth } = expectEveryBillTrue(o);
      // From the pose: one turn-round begun over the solid axis; the centre goes over, back on the same swing, and home 20 s later.
      expect(truth.turnRounds.length).toBe(1);
      const tr = truth.turnRounds[0];
      const solid = truth.crossings.filter((c) => c.solid);
      expect(solid.map((c) => [c.from, c.uTurn])).toEqual([
        ["E", true],
        ["W", true],
        ["E", false],
      ]);
      expect(solid[1].i).toBeLessThanOrEqual(tr.endI);
      expect(truth.wrongHalfRuns.length).toBe(1);
      const run = truth.wrongHalfRuns[0];
      expect(run.fromT).toBeGreaterThan(solid[1].t);
      expect(run.heldSec).toBeGreaterThan(15);
      // The first row is the U-turn…
      expect(rows[0].detail).toBe(UTURN_ACT);
      expect(rows[0].where).toBe(whereOf(level));
      expect(rows[0].t).toBeLessThan(solid[1].t);
      const ended = o.session.endedAtSec ?? Number.POSITIVE_INFINITY;
      // (Stated, so the branch below cannot hide a rung: the session outlives the run's bill at every rung driven
      // here — at L4 by a frame: the second основна closes the exam.)
      expect(run.fromT + 0.6).toBeLessThanOrEqual(ended + 0.02);
      if (run.fromT + 0.6 <= ended + 0.02) {
        // …the second crossing of the same swing got no bill of its own…
        expect(rows.filter((r) => r.t > solid[1].t && r.t < run.fromT - 0.05)).toEqual([]);
        // …and the wrong-half run is billed once, as a crossing, the sustain after the swing ended.
        expect(rows.length).toBe(2);
        expect(rows[1].titleBg).toBe(CROSSING_TITLE);
        expect(rows[1].where).toBe("scored");
        expect(rows[1].t - run.fromT).toBeGreaterThanOrEqual(0.5);
        expect(rows[1].t - run.fromT).toBeLessThan(1.0);
        const at = o.ticks[indexAt(o, rows[1].t)];
        expect(at.position.x).toBeGreaterThan(0);
        expect(Math.abs(wrap180(at.headingDeg - 180))).toBeLessThan(45);
        expect(rows[1].explanationBg).toContain(ONCOMING_CLAUSE);
        // The debrief speaks for each act (R5-4).
        expect(o.debrief).toContain(UTURN_TITLE);
        expect(o.debrief).toContain(UTURN_CORRECTIVE);
        expect(o.debrief).toContain(`• ${CROSSING_TITLE} — основна`);
        expect(o.debrief).toContain(`→ Правилното действие: ${CROSSING_CORRECTIVE}`);
      } else {
        expect(rows.length).toBe(1);
      }
    });
  }
  it("L3: the same rule for a round to the RIGHT — pulled out wholly across, a right-hand round on r 5 back over the solid axis (the pull-out's row is named the U-turn), then 40 m southbound on the half he set out from → the swing left him across the solid axis from the half of his new direction: a new crossing, billed once", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, r2cThenRun(40));
    const { rows, truth } = expectEveryBillTrue(o);
    expect(truth.wrongHalfRuns.length).toBe(1);
    expect(rows.map((r) => `${r.where}:${r.detail === UTURN_ACT ? UTURN_ACT : "crossing"}`)).toEqual([`coached:${UTURN_ACT}`, "scored:crossing"]);
    expect(rows[1].t - truth.wrongHalfRuns[0].fromT).toBeGreaterThanOrEqual(0.5);
    expect(rows[1].explanationBg).toContain(ONCOMING_CLAUSE);
  });
  it("L3: …and a classic U-turn that ends on the half of its new direction is one row and stays one row, however long he then drives", () => {
    const a = arc(4.06, 150, 0, 8.125, 180);
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, { steps: [...approach(4.06, 150), { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false }, ...tail(a.x, a.y, 180, 60)] });
    const { rows, truth } = expectEveryBillTrue(o);
    expect(truth.wrongHalfRuns).toEqual([]);
    expect(rows.map((r) => r.detail)).toEqual([UTURN_ACT]);
  });
});

describe("§R5-2 in the TAIL, the way back (found by the round-6 fuzz) — a U-turn begun just before the solid line ends carries the centre out over the DASHES, is confirmed out there, and over-rotates back over the SOLID axis on the same swing", () => {
  for (const level of [1, 3, 4] as const) {
    it(`L${level}: begun at y 219.3, 0.7 m before the end of the solid line → the centre's only crossing of the SOLID axis is the way back, made during a turn-round begun over the solid axis: the U-turn, billed for that crossing (round 5 had no turn-round left to name a way back made after the confirmation); and the run that follows on the half against his new direction is R6-2's`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, uTurnAtTheSpanEndThatOverRotates(219.3, 25));
      const { rows, truth } = expectEveryBillTrue(o);
      const tr = truth.turnRounds[0];
      expect(tr.beginSolid).toBe(true);
      // From the pose: out over the dashes after the turn-round is confirmed, back over the solid axis before its swing ends.
      expect(truth.crossings.map((c) => [c.from, c.solid, c.uTurn])).toEqual([
        ["E", false, false],
        ["W", true, true],
      ]);
      expect(truth.crossings[0].i).toBeGreaterThan(tr.confirmedI);
      expect(truth.crossings[1].i).toBeLessThanOrEqual(tr.endI);
      expect(`${rows[0].where}:${rows[0].detail}`).toBe(`${whereOf(level)}:${UTURN_ACT}`);
      // Billed for THAT crossing: on its frame, or the sustain after it (he had settled on the far half in between).
      expect(rows[0].t - truth.crossings[1].t).toBeGreaterThan(-0.02);
      expect(rows[0].t - truth.crossings[1].t).toBeLessThan(0.7);
      expectOnlyTheWrongHalfBills(o, rows.slice(1), truth);
      expect(o.debrief).toContain(UTURN_CORRECTIVE);
    });
  }
  it("L3: the same turn begun at y 222, over the DASHES → no row is the U-turn and nothing says one was made where it is forbidden (the turn-round did not begin where the axis is solid)", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, uTurnAtTheSpanEndThatOverRotates(222, 25));
    const { rows, truth } = expectEveryBillTrue(o);
    expect(truth.turnRounds[0].beginSolid).toBe(false);
    for (const r of rows) expect(r.titleBg).toBe(CROSSING_TITLE);
    expect(o.debrief).not.toContain(UTURN_TITLE);
    expect(o.debrief).not.toContain(UTURN_CORRECTIVE);
  });
});

describe("§C1 / R6-3 THE CROSSING'S REASON NEVER NAMES THE WRONG HALF — «насрещната половина» only for the half whose traffic runs against the car's travel direction", () => {
  const P: Array<[string, Rung, () => DriveScript]> = [
    ...([1, 2, 3, 4, 5] as const).map((l): [string, Rung, () => DriveScript] => ["P1 — the own-half turn begun at y 226 (r 6.0), 10 m south, then over the solid axis", l, () => ownHalfTurn(12.19, 226, 6.0, 10, false)]),
    ["P1 — THE CLEANEST ACT: wait at the lesson's own gap (y 264), full lock, 50 m south, then over the solid axis", 1, () => ownHalfTurn(12.19, 264, 6.0, 50, true)],
    ["P1 — THE CLEANEST ACT: wait at the lesson's own gap (y 264), full lock, 50 m south, then over the solid axis", 3, () => ownHalfTurn(12.19, 264, 6.0, 50, true)],
    ["P2 — r 5.5 at y 240, 25 m south, then over", 3, () => ownHalfTurn(12.19, 240, 5.5, 25, false)],
    ["N26 — the own-half turn INSIDE the span at y 150, 10 m south, then over", 3, () => ownHalfTurn(12.19, 150, 6.0, 10, false)],
    ["Z33 — a RIGHT-hand round on his own half at y 240, then south and over", 3, () => z33()],
    ["Z42 — the own-half turn at y 240, then 35 км/ч and a 35° diagonal over the solid axis", 3, () => z42()],
    ["Z2 — SOUTHBOUND after the lawful turn: the own-half turn on the WEST half at y 150, north the wrong way, over the solid axis to the east half", 3, () => southOwnHalfTurn(150, 6.0, 10)],
  ];
  for (const [name, level, build] of P) {
    it(`L${level}: ${name} → the row is a crossing and its reason has NO «насрещната» clause: he enters the half that runs his own way`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, build());
      const { rows, truth } = expectEveryBillTrue(o);
      const row = rows[rows.length - 1];
      const i = indexAt(o, row.t);
      // From the pose, on the bill frame: the half the centre is on runs the way the car is travelling.
      expect(oncomingAt(truth, o.ticks, i)).toBe(false);
      expect(row.titleBg).toBe(CROSSING_TITLE);
      expect(row.explanationBg).not.toContain(ONCOMING_CLAUSE);
      expect([REASON.whollyOwnWay, REASON.astrideOwnWay]).toContain(row.explanationBg);
      expect(row.explanationBg.endsWith(SECOND_SENTENCE)).toBe(true);
      // The debrief prints that reason for the row it coaches, and no surface says «насрещната» of this crossing.
      for (const g of o.glass) if (g.titleBg === CROSSING_TITLE && Math.abs(g.t - row.t) < 0.05) expect(g.explanationBg).toBe(row.explanationBg);
      if (row.where === "coached") expect(o.debrief).toContain(`→ Защо: ${row.explanationBg}`);
      // The corrective stays the pooled one (recorded).
      expect(o.debrief).toContain(CROSSING_CORRECTIVE);
    });
  }
  for (const level of [1, 3] as const) {
    it(`L${level}: Q6 — a pull-out billed inside the span (northbound: «насрещната» is TRUE and stays printed), a right-hand round over the dashes, south, over the solid axis (southbound into the half that runs south: no clause) → two rows, two reasons, each true of its own frame`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, q6());
      const { rows, truth } = expectEveryBillTrue(o);
      expect(rows.length).toBe(2);
      expect(oncomingAt(truth, o.ticks, indexAt(o, rows[0].t))).toBe(true);
      expect(rows[0].explanationBg).toBe(REASON.whollyOncoming);
      expect(oncomingAt(truth, o.ticks, indexAt(o, rows[1].t))).toBe(false);
      expect(rows[1].explanationBg).not.toContain(ONCOMING_CLAUSE);
    });
  }
  it("L3: Q5 — astride to the gap (billed «Застъпи … в насрещната половина»: northbound, true), a right-hand round there, south, over the solid axis → the second row carries no clause", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, q5());
    const { rows } = expectEveryBillTrue(o);
    expect(rows.length).toBe(2);
    expect(rows[0].explanationBg).toBe(REASON.astrideOncoming);
    expect(rows[1].explanationBg).not.toContain(ONCOMING_CLAUSE);
  });
  for (const level of [1, 3, 4] as const) {
    it(`L${level}: CONTROL — a plain northbound pull-out over the solid axis and back → «… и навлезе … в насрещната половина на платното.», word for word as shipped`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, pullOutAndBack());
      const { rows, truth } = expectEveryBillTrue(o);
      expect(rows.length).toBe(1);
      expect(oncomingAt(truth, o.ticks, indexAt(o, rows[0].t))).toBe(true);
      expect([REASON.whollyOncoming, REASON.astrideOncoming]).toContain(rows[0].explanationBg);
      expect(rows[0].explanationBg).toContain(ONCOMING_CLAUSE);
    });
  }
  it("L3: CONTROL — a plain northbound straddle → «Застъпи … и навлезе с повече от половината автомобил в насрещната половина на платното.», as shipped", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, straddleAndBack());
    const { rows } = expectEveryBillTrue(o);
    expect(rows.length).toBe(1);
    expect(rows[0].explanationBg).toBe(REASON.astrideOncoming);
    expect(rows[0].detail).toBe("astride");
  });
  it("L3: CONTROL, SOUTHBOUND — after the lawful turn, a pull-out east over the solid axis (the half that runs north: oncoming for him) → the clause is printed", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, {
      steps: [
        ...southLead(),
        { kind: "drive", points: [[-12.19, 228], [-12.19, 200], [-4.06, 180], [-4.06, 165], [4.06, 145], [4.06, 120], [-4.06, 100], [-4.06, 90]], targetKmh: 30 },
        { kind: "pause", sec: 1, brake: true },
      ],
    });
    const { rows, truth } = expectEveryBillTrue(o);
    expect(rows.length).toBe(1);
    const at = o.ticks[indexAt(o, rows[0].t)];
    expect(at.position.x).toBeGreaterThan(0);
    expect(oncomingAt(truth, o.ticks, indexAt(o, rows[0].t))).toBe(true);
    expect(rows[0].explanationBg).toContain(ONCOMING_CLAUSE);
  });
});

describe("§C4 / R6-4 the three gaps only the verifier's drives killed — ported", () => {
  for (const [y0, named] of [
    [221.5, false],
    [224, false],
    [200, true],
  ] as const) {
    it(`L3: Z9d — from the outer lane, r 5 to 150° then the same swing eased out on r 30 (the centre goes over the solid axis with the nose ~164° round, in the TAIL of the turn-round), begun at y ${y0} → ${named ? "begun over the solid axis: the U-turn" : "begun over the DASHES: a tail crossing is named only by a turn-round begun where the axis is solid — the crossing"}`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, z9d(y0));
      const { rows, truth } = expectEveryBillTrue(o);
      const tr = truth.turnRounds[0];
      expect(tr.beginSolid).toBe(named);
      const c = truth.crossings.find((k) => k.solid)!;
      // The crossing is made after the nose arrived in the opposite band and before the swing ended.
      expect(c.i).toBeGreaterThan(tr.arrivedI);
      expect(c.i).toBeLessThanOrEqual(tr.endI);
      expect(c.why).toBe(named ? "" : "begun-over-dashes");
      expect(rows.map((r) => r.detail === UTURN_ACT)).toEqual([named]);
      if (!named) {
        expect(o.debrief).not.toContain(UTURN_TITLE);
        expect(o.debrief).not.toContain(UTURN_CORRECTIVE);
      }
    });
  }
  it("L3: Z12n — a 40° diagonal over the solid axis and off into the field, the turn-round made OUT THERE where the road has no station for it, then back past the kerb onto the far half → the turn-round is UNPLACED and names nothing (A12): the crossing", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, z12n());
    const { rows, truth } = expectEveryBillTrue(o);
    expect(Math.min(...o.ticks.map((k) => k.position.x))).toBeLessThan(-30);
    expect(truth.turnRounds.length).toBe(1);
    expect(truth.turnRounds[0].beginSolid).toBeNull();
    expect(truth.crossings.filter((c) => c.solid).map((c) => c.why)).toEqual(["unplaced"]);
    expect(rows.map((r) => r.titleBg)).toEqual([CROSSING_TITLE]);
    expect(o.debrief).not.toContain(UTURN_TITLE);
  });
  for (const [x0, r, kmh, level] of [
    [0.19, 5, 9, 1],
    [0.19, 5, 9, 3],
    [0.19, 5, 9, 4],
    [0.5, 6, 5, 3],
  ] as const) {
    it(`L${level}: E5 — the own-half turn over the dashes, south the wrong way hugging the axis at x ${x0}, then a RIGHT-hand round (r ${r}, ${kmh} км/ч) across the solid axis at y 160: the centre goes over ~16° into the swing and the nose is «with the far half» for the next 30° of it → the swing the centre crossed on is the turn-round: the U-turn`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, e5(x0, r, kmh));
      const { rows, truth } = expectEveryBillTrue(o);
      expect(truth.turnRounds.length).toBe(2);
      const tr = truth.turnRounds[1];
      expect(tr.beginSolid).toBe(true);
      const c = truth.crossings.find((k) => k.solid)!;
      expect(c.uTurn).toBe(true);
      // The centre crosses early in the swing, with the nose still within 45° of the way it was going.
      expect(Math.abs(wrap180(o.ticks[c.i].headingDeg - 180))).toBeLessThan(45);
      if (tr.confirmedT < (o.session.endedAtSec ?? Number.POSITIVE_INFINITY)) {
        expect(rows[0].detail).toBe(UTURN_ACT);
        expectOnlyTheWrongHalfBills(o, rows.slice(1), truth);
        expect(o.debrief).toContain(UTURN_CORRECTIVE);
      }
    });
  }
});

describe("§C4 the debrief's «Какво да упражниш» asks whether THIS ACT's corrective is on the page (the round-5 verifier's mutant m12)", () => {
  it("L3: a U-turn (the lesson's mistake, coached), a drift over the solid axis (charged) — and a sheet so full that the charged REPEAT of the U-turn is cut by the mistake-list cap while the crossing's row is printed → the closing line gives the U-turn's OWN corrective in full: the crossing's corrective being on the page does not stand in for it", () => {
    // The live drive: V1 — the demo-radius U-turn at y 150, then a drift east over the solid axis and back.
    const a = arc(4.06, 150, 0, 8.125, 180);
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, {
      steps: [
        ...approach(4.06, 150),
        { kind: "drive", points: a.pts, targetKmh: 9, stopAtEnd: false },
        { kind: "drive", points: [[r3(a.x), r3(a.y)], [-12.19, 130], [-4.06, 110], [2.5, 92], [2.5, 80], [-4.06, 62], [-4.06, 50]], targetKmh: 25 },
        { kind: "pause", sec: 1, brake: true },
      ],
    });
    const hits = o.result.lessonMistakes ?? [];
    expect(hits[0]).toMatchObject({ code: "CROSSED_SOLID_LINE", detail: UTURN_ACT });
    const crossing = o.result.summary.mistakes.find((m) => m.code === "CROSSED_SOLID_LINE" && m.detail !== UTURN_ACT)!;
    expect(crossing).toBeDefined();
    // The sheet, loaded past its cap: the U-turn repeated and charged (one row, 3 т.), the crossing twice (6 т. —
    // it sorts above), and three опасни rows of other codes. Every row is the catalogue's own (makeViolation).
    const heavy = (Object.keys(VIOLATIONS) as ViolationCode[])
      .filter((c) => c !== "COLLISION" && c !== "CROSSED_SOLID_LINE" && makeViolation(c, 1).severityClass === "opasna")
      .slice(0, 3);
    expect(heavy.length).toBe(3);
    const end = o.ticks[o.ticks.length - 1].t;
    const result = {
      ...o.result,
      summary: {
        ...o.result.summary,
        mistakes: [
          ...o.result.summary.mistakes,
          makeViolation("CROSSED_SOLID_LINE", end - 3, { detail: UTURN_ACT }),
          { ...crossing, t: end - 2 },
          ...heavy.map((c, k) => makeViolation(c, end - 1 + k * 0.1)),
        ],
      },
    };
    const d = buildDebrief(o.lesson, result, { coachedMistakes: result.coachedMistakes }).text;
    // The cap cut the U-turn's row and kept the crossing's, with its corrective.
    expect(d).toContain("…и още");
    expect(d).not.toContain(`• ${UTURN_TITLE} —`);
    expect(d).toContain(`• ${CROSSING_TITLE}`);
    expect(d).toContain(`→ Правилното действие: ${CROSSING_CORRECTIVE}`);
    // So the U-turn's corrective is on the page nowhere else — and the closing line prints it.
    const closing = d.slice(d.lastIndexOf("Какво да упражниш:"));
    expect(closing).toContain(`повтори урока без „${UTURN_TITLE}“ — ${UTURN_CORRECTIVE}`);
    expect(d.split(UTURN_CORRECTIVE).length - 1).toBe(1);
  });
});

describe("§N4 / R6-5 THE SWING IS A RATE OVER A WINDOW — the same path gives the same place whatever step its heading is sampled in", () => {
  for (const R of [25, 60, 80, 100, 115] as const) {
    it(`L3: astride the solid axis, a sweep on r ${R} begun at y 204 (over the SOLID axis), full lock from y 224 (over the dashes) — drawn in 0.25°, 0.5°, 1° and 3° vertices → one swing from the sweep's first degree every time: the same begin station, and the U-turn all four times`, () => {
      const begins: number[] = [];
      for (const step of SAMPLE_STEPS) {
        const o = driveLiveRung(SC_MV_UTURN_BAN, 3, sweepThenLock(204, R, step));
        const { rows, truth } = expectEveryBillTrue(o);
        const where = `r ${R} in ${step}° vertices`;
        expect({ where, turnRounds: truth.turnRounds.length }).toEqual({ where, turnRounds: 1 });
        const tr = truth.turnRounds[0];
        begins.push(tr.beginY!);
        // The full lock begins 4 m past the end of the solid line; the place is the sweep's start.
        expect(204 + 20).toBeGreaterThan(SPAN.toY + 2.5);
        expect({ where, beginSolid: tr.beginSolid }).toEqual({ where, beginSolid: true });
        expect({ where, named: rows.map((r) => r.detail) }).toEqual({ where, named: [UTURN_ACT] });
      }
      // The same place, to within what one frame travels.
      expect(Math.max(...begins) - Math.min(...begins)).toBeLessThan(0.3);
      expect(Math.abs(begins[0] - 204)).toBeLessThan(0.3);
    });
    it(`L3: …and the same path begun 18 m further on (y 222, over the DASHES) on r ${R} → the same place four times, and a crossing four times`, () => {
      const begins: number[] = [];
      for (const step of SAMPLE_STEPS) {
        const o = driveLiveRung(SC_MV_UTURN_BAN, 3, sweepThenLock(222, R, step));
        const { rows, truth } = expectEveryBillTrue(o);
        const where = `r ${R} in ${step}° vertices`;
        const tr = truth.turnRounds[0];
        begins.push(tr.beginY!);
        expect({ where, beginSolid: tr.beginSolid }).toEqual({ where, beginSolid: false });
        expect({ where, titles: rows.map((r) => r.titleBg) }).toEqual({ where, titles: [CROSSING_TITLE] });
      }
      expect(Math.max(...begins) - Math.min(...begins)).toBeLessThan(0.3);
      expect(Math.abs(begins[0] - 222)).toBeLessThan(0.3);
    });
  }
  for (const R of [80, 115] as const) {
    it(`L3: THE PLACE IS WHERE THE NOSE LEAVES ITS HEADING — the same sweep on r ${R} begun at y 219, ONE METRE before the solid line ends: drawn in 0.25°, 0.5° and 1° vertices its first whole degree only arrives 1.4–2 m on, over the dashes; the place is still y 219, so all four steps give the U-turn (round 5 placed it where the first degree arrived: a crossing at three of the four)`, () => {
      for (const step of SAMPLE_STEPS) {
        const o = driveLiveRung(SC_MV_UTURN_BAN, 3, sweepThenLock(219, R, step));
        const { rows, truth } = expectEveryBillTrue(o);
        const where = `r ${R} in ${step}° vertices`;
        expect({ where, begin: Math.abs(truth.turnRounds[0].beginY! - 219) < 0.3 }).toEqual({ where, begin: true });
        expect({ where, named: rows.map((r) => r.detail) }).toEqual({ where, named: [UTURN_ACT] });
      }
    });
  }
  it("L3: A SWEEP DRAWN IN 3° VERTICES ON A 115 m RADIUS — 6.02 m between degrees — is one swing (it resumes at the rate), so a 12° sweep begun over the solid axis at y 204 into a full lock over the dashes is the U-turn at all four steps", () => {
    for (const step of SAMPLE_STEPS) {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, sweepThenLock(204, 115, step, 12));
      const { rows, truth } = expectEveryBillTrue(o);
      const where = `r 115 to 12° in ${step}° vertices`;
      expect({ where, beginSolid: truth.turnRounds[0].beginSolid }).toEqual({ where, beginSolid: true });
      expect({ where, named: rows.map((r) => r.detail) }).toEqual({ where, named: [UTURN_ACT] });
    }
  });
  it("L3: THE OTHER SIDE OF THE RATE — a drift gentler than one degree in 2.5 m (r 200, begun at y 204, drawn as finely as the harness draws: 0.25° vertices) is not a swing: the turn-round begins where the full lock does, over the dashes → a crossing. (Drawn more coarsely a drift this gentle is a row of separate kinks, not a sweep, and is outside what R6-5 asks.)", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, sweepThenLock(204, 200, 0.25));
    const { rows, truth } = expectEveryBillTrue(o);
    const tr = truth.turnRounds[0];
    expect(tr.beginSolid).toBe(false);
    // Placed within the rate's own window (2.5 m) of where the lock begins (y 224).
    expect(tr.beginY!).toBeGreaterThan(224 - 2.6);
    expect(tr.beginY!).toBeLessThan(224 + 0.3);
    expect(rows.map((r) => r.titleBg)).toEqual([CROSSING_TITLE]);
  });
});

describe("the lesson's own lawful drive is still billed by nothing", () => {
  for (const level of [1, 2, 3, 4, 5] as const) {
    it(`L${level}: the shadow-correct drive (the U-turn at the gap) → no crossing row, 0 т.`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, scMvUturnBanShadowScript());
      const { rows } = expectEveryBillTrue(o);
      expect(rows).toEqual([]);
      expect(o.scored).toEqual([]);
      expect(o.result.passed).toBe(true);
    });
  }
});
