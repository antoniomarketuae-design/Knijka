/**
 * WITNESS, ROUND 2 — sc-mv-uturn-ban: «THIS CROSSING IS A U-TURN» IS DECIDED
 * FROM THE ROAD, NOT FROM HOW FAR THE NOSE SWUNG RECENTLY.
 *
 * Round 1 named the act when the car's own heading had swung ≥ 45° to the left
 * inside the last 10 s of movement. An adversarial pass refuted it on its own
 * acts (journal wf_80e737d6-9b4, verifier findings V1, V2, V5), and every one of
 * those acts is driven here through the same live-rung chain (witnessLiveRung:
 * the compiled rung → createLessonSession → applyTick → buildLessonResult →
 * buildDebrief → gradeFinishWire):
 *
 *  V1  A complete single-arc U-turn across the М1 on the demo's own radius
 *      (8.125 m), begun with the car's centre 0.9–1.7 m from the axis at
 *      6 км/ч, was billed with the POOLED title and the overtaking corrective
 *      at L1–L5: the nose is only 34–44° round when the bill lands. A diagonal
 *      crossing at 30°, 38° or 44° that then completes the turn fell through
 *      the same way. — Instruction 3 itself tells the student to sit «във
 *      вътрешната лента, до осевата».
 *  V2  The act copy showed where it was FALSE: a lawful U-turn at the gap,
 *      followed 6.7–7.6 s later by a 14.7° drift over the М1, was titled
 *      «Обратен завой през непрекъсната осева линия»; so was a 29° right swerve
 *      followed by an 18° pull-out.
 *  V5  (older than round 1) A U-turn from the OUTER lane on the natural
 *      lane-to-lane arc was not billed at all, and the debrief praised «чисто
 *      каране».
 *
 * THE RULE NOW (rules/engine.ts «THE REVERSAL ACROSS THE SOLID AXIS»): the car
 * crossed the solid axis inside the ban span AND its travel direction relative
 * to the edge REVERSED — it was travelling with one bank of the road and is now
 * on the other bank, travelling with THAT one. Radius, start lane, speed and
 * how long it took do not enter into it; a crossing that returns without
 * reversing is a crossing; a lawful U-turn made earlier is not evidence for
 * anything that happens after it.
 *
 * WHAT THE GLASS SAYS IN BETWEEN, AND WHY IT IS TRUE. The plain crossing bills
 * where it always did (centre across for 0.6 s), and at that frame the turn is
 * not finished — the student may still abandon it — so the card on the glass
 * carries the POOLED copy («Пресичане на непрекъсната осева линия»: he did
 * cross it). When the reversal completes, the SAME bill is named
 * (`ActAmendment`): one act, one bill, and the debrief, the изпитен лист and
 * the stored verdict speak of the обратен завой. Where the plain detector could
 * not see the crossing (V5: the car is already pointing across the road at the
 * axis), the crossing is billed by POSITION, at the crossing, with the same
 * pooled card, and named the same way. Only where NOTHING billed the crossing
 * (it was made in reverse gear) is the completed reversal itself the bill, and
 * then its card is the U-turn's — shown on a frame where the car has already
 * turned round. §G pins all three.
 *
 * ROUND 3 moved one thing these acts can see (the body-referenced witness
 * `mv-uturn-ban-body-across-the-axis.test.ts` has the rest): the crossing's
 * bill says «Пресече ИЗЦЯЛО …» only when the whole body is across on the bill
 * frame; where the tail is still over the line it carries the act `astride` —
 * the same title and corrective, the reason «Застъпи … и навлезе с повече от
 * половината автомобил …». «The pooled card» below therefore reads «the
 * crossing's card, on whichever of its two reasons the body earned», and
 * `expectPlainCrossing` checks the row against the body independently.
 *
 * KILL-CHECKS (each reddens this file on an assertion; restored, sha-verified):
 *   · the round-1 heading-history evidence put back in place of the reversal;
 *   · the reversal test removed (every crossing named / none named);
 *   · the V5 bill removed (a reversal the plain detector missed is unbilled).
 */

import { describe, expect, it } from "vitest";
import type { DriveScript } from "../../../traces/recorder";
import { scMvUturnBanShadowScript } from "../../../traces/scMvUturnBan";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { SC_MV_UTURN_BAN } from "../templates-parking2";
import { driveLiveRung, type LiveRungOutcome } from "./witnessLiveRung";

const UTURN_ACT = "u-turn";
/** Round 3: the crossing billed with the body still astride the line (`catalog.ts SOLID_CROSS_ACT_ASTRIDE`). */
const ASTRIDE_ACT = "astride";
const ASTRIDE_SENTENCE =
  "Застъпи непрекъснатата осева линия и навлезе с повече от половината автомобил в насрещната половина на платното.";
const UTURN_TITLE = "Обратен завой през непрекъсната осева линия";
const POOLED_TITLE = "Пресичане на непрекъсната осева линия";
const OVERTAKING_ADVICE = /Изпреварвай или заобикаляй|дори предният да пълзи/u;
/** What the base debrief said over the unbilled outer-lane U-turn (verifier V5, probe-P3-outer-L3). */
const CLEAN_PRAISE = /чисто каране по изпитния лист|оценката е за незавършения маршрут, не за карането/u;
const BAN = { fromY: 40, toY: 220 };
const ALL_RUNGS = [1, 2, 3, 4, 5] as const;
type Rung = (typeof ALL_RUNGS)[number];

function wrap180(d: number): number {
  let x = d;
  while (x > 180) x -= 360;
  while (x <= -180) x += 360;
  return x;
}

// ---------------------------------------------------------------------------
// the acts — the verifier's own geometry (zz-verifier-uturn-probe / -sweep),
// ported unchanged except where the brief asks for a completed reversal
// ---------------------------------------------------------------------------

/** Left arc of radius r from a northbound pose at (x0, y0), swept fromDeg..toDeg. */
function arcL(
  x0: number,
  y0: number,
  r: number,
  fromDeg: number,
  toDeg: number,
  stepDeg = 3,
): Array<[number, number]> {
  const cx = x0 - r;
  const pts: Array<[number, number]> = [];
  for (let d = fromDeg; d <= toDeg + 1e-9; d += stepDeg) {
    const th = (d * Math.PI) / 180;
    pts.push([Math.round((cx + r * Math.cos(th)) * 1000) / 1000, Math.round((y0 + r * Math.sin(th)) * 1000) / 1000]);
  }
  return pts;
}

/** Outer lane → the lane position `xLane`, then a stop at `yTurn` (the demo's own setup). */
function approach(xLane: number, yTurn: number): DriveScript["steps"] {
  return [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: [[12.19, 15], [12.19, 70]], targetKmh: 46, stopAtEnd: false },
    { kind: "glance", mirror: "left" },
    { kind: "indicator", setting: "left" },
    { kind: "drive", points: [[12.19, 70], [(12.19 + xLane) / 2 + 1, 84], [xLane, 100]], targetKmh: 30, stopAtEnd: false },
    { kind: "drive", points: [[xLane, 100], [xLane, yTurn]], targetKmh: 14 },
    { kind: "pause", sec: 0.8, brake: true },
  ];
}

/** V1 — the whole U-turn on the demo's radius, begun `x0` metres from the axis. */
function hugUTurn(x0: number, kmh: number, r = 8.125): DriveScript {
  return {
    steps: [
      ...approach(x0, 124),
      { kind: "drive", points: arcL(x0, 124, r, 0, 180), targetKmh: kmh, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[x0 - 2 * r, 124], [x0 - 2 * r, 100]], targetKmh: 25 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

/** The diagonal's far end and the left arc that finishes the turn from it. */
function diagonalLeg(deg: number): { end: [number, number]; round: Array<[number, number]>; exitX: number } {
  const x0 = 4.06;
  const y0 = 118;
  const th = (deg * Math.PI) / 180;
  const endX = -6;
  const endY = y0 + (x0 - endX) / Math.tan(th);
  // A car heading `deg` left of north turns on a centre to its LEFT.
  const r = 4;
  const cx = endX - r * Math.cos(th);
  const cy = endY - r * Math.sin(th);
  const round: Array<[number, number]> = [];
  for (let d = deg; d <= 180 + 1e-9; d += 3) {
    const a = (d * Math.PI) / 180;
    round.push([Math.round((cx + r * Math.cos(a)) * 1000) / 1000, Math.round((cy + r * Math.sin(a)) * 1000) / 1000]);
  }
  const last = round[round.length - 1];
  return { end: [endX, Math.round(endY * 1000) / 1000], round, exitX: last[0] };
}

/** V1 — a straight diagonal across the axis at `deg`, which then COMPLETES the turn. */
function diagonalThenRound(deg: number): DriveScript {
  const leg = diagonalLeg(deg);
  const yExit = leg.round[leg.round.length - 1][1];
  return {
    steps: [
      ...approach(4.06, 118),
      { kind: "drive", points: [[4.06, 118], leg.end], targetKmh: 9, stopAtEnd: false },
      { kind: "drive", points: leg.round, targetKmh: 9, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[leg.exitX, yExit], [leg.exitX, yExit - 24]], targetKmh: 25 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

/** The A12 control for it — the verifier's P2 exactly: across at `deg`, and STOP at the far kerb. */
function diagonalAndStop(deg: number): DriveScript {
  const dx = 16.5;
  const dy = dx / Math.tan((deg * Math.PI) / 180);
  return {
    steps: [
      ...approach(4.06, 118),
      { kind: "drive", points: [[4.06, 118], [4.06 - dx, 118 + dy]], targetKmh: 9 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

/** V2 — the lesson's own LAWFUL U-turn at the gap, then a shallow drift over the М1 heading south. */
function lawfulThenDrift(yDrift: number, kmh: number): DriveScript {
  const shadow = scMvUturnBanShadowScript();
  const arcIdx = shadow.steps.findIndex((s) => s.kind === "drive" && s.targetKmh === 8);
  return {
    steps: [
      ...shadow.steps.slice(0, arcIdx + 1),
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[-12.19, 264], [-12.19, 250], [-4.06, yDrift + 22]], targetKmh: kmh, stopAtEnd: false },
      { kind: "drive", points: [[-4.06, yDrift + 22], [3, yDrift - 5], [3, yDrift - 25]], targetKmh: kmh, stopAtEnd: false },
      { kind: "drive", points: [[3, yDrift - 25], [-4.06, yDrift - 50], [-4.06, yDrift - 60]], targetKmh: kmh },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

/** V2 — a 29° swerve to the RIGHT, then an 18° pull-out to the left across the axis, and back. */
function weave(): DriveScript {
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[12.19, 15], [12.19, 70]], targetKmh: 46, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[12.19, 70], [8, 84], [4.06, 100]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[4.06, 100], [8, 107]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[8, 107], [-3, 140], [-3, 160]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[-3, 160], [4.06, 190], [4.06, 200]], targetKmh: 30 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

/** V5 — straight from the OUTER lane, where instruction 1 puts the student. */
function outerLaneUTurn(r: number): DriveScript {
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[12.19, 15], [12.19, 120]], targetKmh: 40 },
      { kind: "pause", sec: 0.8, brake: true },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: arcL(12.19, 120, r, 0, 180), targetKmh: 9, stopAtEnd: false },
      { kind: "drive", points: [[12.19 - 2 * r, 120], [12.19 - 2 * r, 100]], targetKmh: 25 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

/**
 * An overtaking pull-out that is NOT abandoned: across at ~17°, forty metres
 * up the oncoming half pointing the original way, and only then a turn round
 * inside that half — all of it inside the span. Rounds 2 and 3 held that «the
 * crossing was a pull-out; what follows it is another act on the far side of
 * the line»; round 4 (integrator ruling R4-2): he turned round where it is
 * forbidden, and that is the U-turn whatever came before it.
 */
function pullOutThenSpin(): DriveScript {
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[12.19, 15], [12.19, 70]], targetKmh: 46, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[12.19, 70], [9, 84], [4.06, 100]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[4.06, 100], [-4.06, 126], [-4.06, 166]], targetKmh: 30 },
      { kind: "pause", sec: 0.5, brake: true },
      { kind: "drive", points: arcL(-4.06, 166, 5, 0, 180), targetKmh: 9, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[-14.06, 166], [-14.06, 140]], targetKmh: 25 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

/**
 * The U-turn as a THREE-POINT TURN: forward across the axis at 40° to the far
 * side, back in reverse with the nose swinging further round (to 110°), and
 * forward again to finish facing the other way — all on the far half.
 */
function threePointTurn(): DriveScript {
  const P1: [number, number] = [-10, Math.round((118 + 14.06 / Math.tan((40 * Math.PI) / 180)) * 1000) / 1000];
  // Reverse: the car TRAVELS on bearings 140° → 70° (anticlockwise, r = 6), so
  // its nose goes from 320° to 250° — 40° to 110° left of north.
  const bearingArc = (
    from: [number, number],
    r: number,
    b0: number,
    b1: number,
  ): Array<[number, number]> => {
    const rad = (b: number) => (b * Math.PI) / 180;
    const cx = from[0] - r * Math.cos(rad(b0));
    const cy = from[1] + r * Math.sin(rad(b0));
    const pts: Array<[number, number]> = [];
    for (let b = b0; b >= b1 - 1e-9; b -= 5) {
      pts.push([Math.round((cx + r * Math.cos(rad(b))) * 1000) / 1000, Math.round((cy - r * Math.sin(rad(b))) * 1000) / 1000]);
    }
    return pts;
  };
  const back = bearingArc(P1, 6, 140, 70);
  const P2 = back[back.length - 1];
  const fwd = bearingArc(P2, 5, 250, 180);
  const P3 = fwd[fwd.length - 1];
  return {
    steps: [
      ...approach(4.06, 118),
      { kind: "drive", points: [[4.06, 118], P1], targetKmh: 9 },
      { kind: "pause", sec: 1, brake: true },
      { kind: "drive", points: back, targetKmh: 6, reverse: true },
      { kind: "pause", sec: 1, brake: true },
      { kind: "drive", points: fwd, targetKmh: 8, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [P3, [P3[0], P3[1] - 22]], targetKmh: 25 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

/**
 * The turn made the other way about: swing the nose RIGHT on his own half,
 * BACK across the solid axis tail first (the nose coming round to face south
 * as he goes), then drive off forward on the far half.
 */
function reverseAcrossTurn(): DriveScript {
  const rad = (b: number) => (b * Math.PI) / 180;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  // Forward, clockwise (to the right), r = 4: nose 0° → 100°.
  const fwd: Array<[number, number]> = [];
  for (let h = 0; h <= 100 + 1e-9; h += 5) fwd.push([r3(4.06 + 4 * (1 - Math.cos(rad(h)))), r3(118 + 4 * Math.sin(rad(h)))]);
  const A = fwd[fwd.length - 1];
  // Reverse: TRAVEL on bearing 280° for 10 m (nose stays at 100°) …
  const B: [number, number] = [r3(A[0] + 10 * Math.sin(rad(280))), r3(A[1] + 10 * Math.cos(rad(280)))];
  // … then travel bearing 280° → 360° clockwise, r = 4 (nose 100° → 180°).
  const back: Array<[number, number]> = [A, B];
  const cx = B[0] + 4 * Math.sin(rad(280 + 90));
  const cy = B[1] + 4 * Math.cos(rad(280 + 90));
  for (let b = 285; b <= 360 + 1e-9; b += 5) back.push([r3(cx + 4 * Math.sin(rad(b - 90))), r3(cy + 4 * Math.cos(rad(b - 90)))]);
  const C = back[back.length - 1];
  return {
    steps: [
      ...approach(4.06, 118),
      { kind: "drive", points: fwd, targetKmh: 7 },
      { kind: "pause", sec: 1, brake: true },
      { kind: "drive", points: back, targetKmh: 6, reverse: true },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [C, [C[0], C[1] - 24]], targetKmh: 25 },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
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

/** Every CROSSED_SOLID_LINE row the drive produced, coached and charged alike. */
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

function tickAt(o: LiveRungOutcome, t: number) {
  return o.ticks.reduce((b, k) => (Math.abs(k.t - t) < Math.abs(b.t - t) ? k : b));
}

/** Degrees the nose has turned from due north (the car's original direction on this road). */
function noseRoundDeg(o: LiveRungOutcome, t: number): number {
  return Math.abs(wrap180(tickAt(o, t).headingDeg));
}

function serverFold(o: LiveRungOutcome) {
  return gradeFinishWire({
    lessonId: o.lesson.id,
    startedAtMs: 1_000,
    finishedAtMs: 1_000 + Math.round(o.result.durationSec * 1000),
    aborted: false,
    ruleEvents: serializeRuleEvents(o.session.events),
    objectives: o.result.objectives.map((ob) => ({
      id: ob.id,
      done: ob.done,
      completedAtSec: ob.completedAtSec,
      ...(ob.detail !== undefined ? { detail: ob.detail } : {}),
    })),
    coachedMistakes: (o.result.coachedMistakes ?? []).map((c) => ({
      code: c.code,
      t: c.t,
      ...(c.detail !== undefined ? { detail: c.detail } : {}),
    })),
  });
}

/** The drive ended facing back the way it came, on the far half: the reversal is real. */
function expectTurnedRound(o: LiveRungOutcome): void {
  const last = o.ticks[o.ticks.length - 1];
  expect(Math.abs(wrap180(last.headingDeg - 180))).toBeLessThan(5);
  expect(last.position.x).toBeLessThan(0);
}

/**
 * ONE bill, and it is the U-turn — on the row, in the debrief, on the изпитен
 * лист (L4) or in «Грешката на този урок» (practice), and in the stored verdict.
 */
function expectNamedUTurn(o: LiveRungOutcome, level: Rung): Row {
  const rows = crossingRows(o);
  expect(rows.map((r) => `${r.where}:${r.detail ?? "pooled"}`)).toEqual([
    `${level === 4 ? "scored" : "coached"}:${UTURN_ACT}`,
  ]);
  expect(rows[0].titleBg).toBe(UTURN_TITLE);
  expect(o.debrief).toContain(UTURN_TITLE);
  expect(o.debrief).not.toContain(POOLED_TITLE);
  expect(o.debrief).not.toMatch(OVERTAKING_ADVICE);
  expect(o.debrief).not.toMatch(CLEAN_PRAISE);
  expect(o.result.passed).toBe(false);
  if (level === 4) {
    const billed = o.result.summary.mistakes.filter((m) => m.code === "CROSSED_SOLID_LINE");
    expect(billed).toHaveLength(1);
    expect(billed[0].detail).toBe(UTURN_ACT);
    expect(billed[0].titleBg).toBe(UTURN_TITLE);
    expect(billed[0].severityClass).toBe("osnovna");
    expect(billed[0].points).toBe(3);
    expect(o.debrief).toContain(`• ${UTURN_TITLE} — основна, `);
  } else {
    const hits = (o.result.lessonMistakes ?? []).filter((h) => h.code === "CROSSED_SOLID_LINE");
    expect(hits).toHaveLength(1);
    expect(hits[0].detail).toBe(UTURN_ACT);
    expect(hits[0].charged).toBe(false);
    expect(o.debrief).toContain(`не е взет: допусна „${UTURN_TITLE}“ — точно грешката, която този урок учи`);
    const graded = serverFold(o);
    expect(graded.status).toBe("ok");
    if (graded.status === "ok") {
      expect((graded.result.lessonMistakes ?? []).map((h) => `${h.code}|${h.detail}|${h.titleBg}`)).toEqual([
        `CROSSED_SOLID_LINE|${UTURN_ACT}|${UTURN_TITLE}`,
      ]);
    }
  }
  return rows[0];
}

/**
 * The whole chassis rectangle (0.85 × 2.02 m half-extents, `vehicle/tuning`)
 * is on the `far` side of the axis x = 0 of this straight, north-running road.
 */
function bodyWhollyAcross(o: LiveRungOutcome, t: number, far: "west" | "east"): boolean {
  const k = tickAt(o, t);
  const yaw = (k.headingDeg * Math.PI) / 180;
  const reach = 0.85 * Math.abs(Math.cos(yaw)) + 2.02 * Math.abs(Math.sin(yaw));
  return far === "west" ? k.position.x + reach <= 0 : k.position.x - reach >= 0;
}

/**
 * ONE bill, and it is the plain crossing: the crossing's title, never the
 * U-turn's — on the pooled reason («изцяло») if the whole body was across when
 * the bill landed, on the straddle's if it was not. `far` is the half the car
 * crossed INTO (west for a car that set out northbound; east after the lawful
 * U-turn at the gap).
 */
function expectPlainCrossing(o: LiveRungOutcome, level: Rung, far: "west" | "east" = "west"): Row {
  const rows = crossingRows(o);
  expect(rows).toHaveLength(1);
  const wholly = bodyWhollyAcross(o, rows[0].t, far);
  expect(rows.map((r) => `${r.where}:${r.detail ?? "pooled"}`)).toEqual([
    `${level === 4 ? "scored" : "coached"}:${wholly ? "pooled" : ASTRIDE_ACT}`,
  ]);
  expect(rows[0].titleBg).toBe(POOLED_TITLE);
  expect(o.debrief).toContain(POOLED_TITLE);
  expect(o.debrief).not.toContain(UTURN_TITLE);
  expect(o.debrief).not.toMatch(/обратен завой, а/u);
  // The debrief never prints the reason the body did NOT earn; on a practice
  // rung it prints the one it did («→ Защо:»; the exam sheet's row gives the
  // remedy and the citation only).
  if (wholly) expect(o.debrief).not.toContain(ASTRIDE_SENTENCE);
  else expect(o.debrief).not.toContain("изцяло");
  if (level !== 4) expect(o.debrief).toContain(wholly ? "Пресече изцяло непрекъснатата осева линия" : ASTRIDE_SENTENCE);
  for (const c of o.cards) expect(c.titleBg).not.toBe(UTURN_TITLE);
  return rows[0];
}

// ---------------------------------------------------------------------------

describe("§A (V1) a U-turn begun close to the axis is the U-turn — whatever the nose had swung at the bill", () => {
  for (const level of ALL_RUNGS) {
    it(`L${level}: demo radius 8.125 m, centre 1.1 m from the axis, 6 км/ч → named, at every rung`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, hugUTurn(1.1, 6));
      expectTurnedRound(o);
      const row = expectNamedUTurn(o, level);
      // The V1 condition itself: when the bill landed the nose was LESS than
      // 45° round — the act round 1 answered with the overtaking advice.
      expect(noseRoundDeg(o, row.t)).toBeLessThan(45);
      expect(tickAt(o, row.t).position.y).toBeGreaterThanOrEqual(BAN.fromY);
      expect(tickAt(o, row.t).position.y).toBeLessThanOrEqual(BAN.toY);
    });
  }

  for (const [x0, kmh] of [
    [0.9, 6],
    [1.7, 6],
    [0.9, 9],
    [0.9, 14],
  ] as const) {
    it(`L3: centre ${x0} m from the axis at ${kmh} км/ч → named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, hugUTurn(x0, kmh));
      expectTurnedRound(o);
      const row = expectNamedUTurn(o, 3);
      expect(noseRoundDeg(o, row.t)).toBeLessThan(45);
    });
  }

  for (const deg of [30, 38, 44]) {
    it(`L3: a straight diagonal across at ${deg}° that then completes the turn → named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, 3, diagonalThenRound(deg));
      expectTurnedRound(o);
      const row = expectNamedUTurn(o, 3);
      expect(Math.abs(noseRoundDeg(o, row.t) - deg)).toBeLessThan(2);
    });
  }

  it("L4: the 38° diagonal that completes the turn is ONE основна (3 т.) on the изпитен лист, named", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 4, diagonalThenRound(38));
    expectTurnedRound(o);
    expectNamedUTurn(o, 4);
  });

  it("A12 CONTROL (L3): the same 38° diagonal that STOPS at the far kerb never reversed — a crossing, not a U-turn", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, diagonalAndStop(38));
    const last = o.ticks[o.ticks.length - 1];
    expect(Math.abs(Math.abs(wrap180(last.headingDeg)) - 38)).toBeLessThan(2);
    expectPlainCrossing(o, 3);
  });
});

describe("§B (V2) a crossing that does not reverse is never called a U-turn — whatever the car did before it", () => {
  for (const [yDrift, level] of [
    [215, 3],
    [200, 3],
    [215, 4],
  ] as const) {
    it(`L${level}: a LAWFUL U-turn at the gap, then a 14.7° drift over the М1 near y=${yDrift} → pooled copy`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, lawfulThenDrift(yDrift, 40));
      const row = expectPlainCrossing(o, level, "east");
      // The V2 condition itself: the lawful turn finished only seconds before
      // this bill (round 1's look-back was 10 s of movement) …
      const done = o.ticks.find((k) => Math.abs(wrap180(k.headingDeg - 180)) < 1 && k.position.y > 230);
      expect(done).toBeDefined();
      expect(row.t - done!.t).toBeGreaterThan(5);
      expect(row.t - done!.t).toBeLessThan(9);
      // … the car is heading SOUTH, 14.7° off the road, inside the ban span …
      const at = tickAt(o, row.t);
      expect(Math.abs(Math.abs(wrap180(at.headingDeg - 180)) - 14.7)).toBeLessThan(1);
      expect(at.position.y).toBeLessThanOrEqual(BAN.toY);
      // … and it never turned round after the crossing: it ends still southbound.
      const last = o.ticks[o.ticks.length - 1];
      expect(Math.abs(wrap180(last.headingDeg - 180))).toBeLessThan(20);
    });
  }

  it("L3: a 29° swerve to the right, then an 18° pull-out across the axis and back → pooled copy", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, weave());
    const row = expectPlainCrossing(o, 3);
    expect(Math.abs(noseRoundDeg(o, row.t) - 18.4)).toBeLessThan(1);
    const last = o.ticks[o.ticks.length - 1];
    expect(Math.abs(wrap180(last.headingDeg))).toBeLessThan(5);
  });

  it("L3: ROUND 4 (R4-2), flipped — a pull-out held for 40 m up the oncoming half, THEN a turn round inside that half, inside the span → the U-turn, with the U-turn's corrective (rounds 2–3: «the crossing stays a crossing», with the overtaking advice)", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, pullOutThenSpin());
    expectTurnedRound(o);
    expectNamedUTurn(o, 3);
    // (He WAS pulled out by round 3's measure: the BODY wholly across, nose
    // along the road, for more than 5 m — here for 40.)
    const out = o.ticks.filter((k) => Math.abs(wrap180(k.headingDeg)) <= 10 && bodyWhollyAcross(o, k.t, "west"));
    expect(Math.max(...out.map((k) => k.position.y)) - Math.min(...out.map((k) => k.position.y))).toBeGreaterThan(30);
  });
});

describe("§C (V5) a reversal across the М1 inside the ban span is the lesson's offence from ANY lane", () => {
  for (const level of ALL_RUNGS) {
    it(`L${level}: from the OUTER lane on the natural lane-to-lane arc (r = 12.19) → billed as the U-turn, never praised`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, outerLaneUTurn(12.19));
      expectTurnedRound(o);
      const row = expectNamedUTurn(o, level);
      const at = tickAt(o, row.t);
      expect(at.position.y).toBeGreaterThanOrEqual(BAN.fromY);
      expect(at.position.y).toBeLessThanOrEqual(BAN.toY);
      // Billed AT THE CROSSING — the centre across the axis, the car already
      // pointing back-left across the road (which is why the plain detector,
      // «the nose opposes its bank», never saw it) — and named when it turned round.
      expect(at.position.x).toBeLessThan(0);
      expect(at.solidCenterLine).toBe(true);
      expect(noseRoundDeg(o, row.t)).toBeGreaterThan(90);
      expect(noseRoundDeg(o, row.t)).toBeLessThan(135);
    });
  }

  for (const r of [8.125, 10, 14]) {
    for (const level of [3, 4] as const) {
      it(`L${level}: from the outer lane at r = ${r} → still ONE bill for one turn, named`, () => {
        const o = driveLiveRung(SC_MV_UTURN_BAN, level, outerLaneUTurn(r));
        expectTurnedRound(o);
        expectNamedUTurn(o, level);
      });
    }
  }

  it("L3: at 4 км/ч — under the plain detector's own moving floor — the turn is still billed and named", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, hugUTurn(4.06, 4));
    expectTurnedRound(o);
    const row = expectNamedUTurn(o, 3);
    expect(tickAt(o, row.t).speedKmh).toBeLessThan(5);
  });

  for (const level of [3, 4] as const) {
    it(`L${level}: as a THREE-POINT turn (forward across, back in reverse, forward again) → ONE bill, named`, () => {
      const o = driveLiveRung(SC_MV_UTURN_BAN, level, threePointTurn());
      expectTurnedRound(o);
      expect(o.ticks.some((k) => k.gear < 0 && Math.abs(k.speedKmh) > 1)).toBe(true);
      expectNamedUTurn(o, level);
    });
  }
});

describe("§G the glass between the bill and the reversal — every card true on the frame it shows on", () => {
  it("V1 at L3: the card at the bill is the CROSSING's (he HAS crossed; he has not yet turned round) — on the straddle's reason, his tail still over the line; the debrief names the act", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, hugUTurn(1.1, 6));
    const cards = o.cards.filter((c) => c.code === "CROSSED_SOLID_LINE");
    expect(cards).toHaveLength(1);
    expect(cards[0].titleBg).toBe(POOLED_TITLE);
    expect(bodyWhollyAcross(o, cards[0].t, "west")).toBe(false);
    expect(cards[0].explanationBg.startsWith(ASTRIDE_SENTENCE)).toBe(true);
    expect(cards[0].explanationBg).not.toContain("изцяло");
    // True on that frame: the centre is across the axis, inside the span …
    const at = tickAt(o, cards[0].t);
    expect(at.position.x).toBeLessThan(0);
    expect(at.solidCenterLine).toBe(true);
    // … and the turn is NOT finished there — a card saying «обратен завой»
    // would be claiming something the student could still abandon.
    expect(noseRoundDeg(o, cards[0].t)).toBeLessThan(90);
    // The same bill, named once the reversal completed.
    const row = expectNamedUTurn(o, 3);
    expect(row.t).toBe(cards[0].t);
    // …and the recorder's own rule log (the trace gate's channel) names it too:
    // one CROSSED_SOLID_LINE, at the same frame, carrying the act.
    const logged = o.drive.ruleEvents.filter((e) => e.kind === "violation" && e.code === "CROSSED_SOLID_LINE");
    expect(logged.map((e) => [e.t, e.kind === "violation" ? e.detail : null, e.titleBg])).toEqual([
      [row.t, UTURN_ACT, UTURN_TITLE],
    ]);
  });

  it("V5 at L3: the crossing the plain detector could not see is billed AT the crossing, the crossing's card, and named after", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, outerLaneUTurn(12.19));
    const cards = o.cards.filter((c) => c.code === "CROSSED_SOLID_LINE");
    expect(cards).toHaveLength(1);
    expect(cards[0].titleBg).toBe(POOLED_TITLE);
    // The car is square across the road here, its tail 2 m short of the line:
    // the straddle's reason, not «Пресече изцяло».
    expect(bodyWhollyAcross(o, cards[0].t, "west")).toBe(false);
    expect(cards[0].explanationBg.startsWith(ASTRIDE_SENTENCE)).toBe(true);
    // «… навлезе с повече от половината автомобил» — true on that frame: the
    // centre has been on the far half, over a solid axis, for the sustain.
    const at = tickAt(o, cards[0].t);
    expect(at.position.x).toBeLessThan(0);
    expect(at.solidCenterLine).toBe(true);
    const crossed = o.ticks.find((k) => k.position.x < 0)!;
    expect(crossed.solidCenterLine).toBe(true);
    expect(cards[0].t - crossed.t).toBeGreaterThan(0.55);
    expect(cards[0].t - crossed.t).toBeLessThan(0.75);
    // …and the plain detector's own condition never held on this drive at all.
    expect(o.ticks.filter((k) => k.opposingBank === true)).toHaveLength(0);
    const row = expectNamedUTurn(o, 3);
    expect(row.t).toBe(cards[0].t);
  });

  it("the same arc STOPPED square across the far half (120° round, never finished) → billed as a crossing, not praised, not a U-turn", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, {
      steps: [
        { kind: "glance", mirror: "rear" },
        { kind: "drive", points: [[12.19, 15], [12.19, 120]], targetKmh: 40 },
        { kind: "pause", sec: 0.8, brake: true },
        { kind: "indicator", setting: "left" },
        { kind: "drive", points: arcL(12.19, 120, 12.19, 0, 120), targetKmh: 9 },
        { kind: "pause", sec: 6, brake: true },
      ],
    });
    const last = o.ticks[o.ticks.length - 1];
    expect(last.position.x).toBeLessThan(0);
    expect(Math.abs(Math.abs(wrap180(last.headingDeg)) - 120)).toBeLessThan(2);
    expectPlainCrossing(o, 3);
    expect(o.debrief).not.toMatch(CLEAN_PRAISE);
    expect(o.result.passed).toBe(false);
  });

  it("the turn made by BACKING across the axis: nothing bills a reverse crossing, so the completed reversal IS the bill — and its card is the U-turn's", () => {
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, reverseAcrossTurn());
    expectTurnedRound(o);
    const cards = o.cards.filter((c) => c.code === "CROSSED_SOLID_LINE");
    expect(cards).toHaveLength(1);
    expect(cards[0].titleBg).toBe(UTURN_TITLE);
    // True on that frame: across the axis (crossed where it is solid, tail
    // first) and turned round to face the other way.
    const at = tickAt(o, cards[0].t);
    expect(at.position.x).toBeLessThan(0);
    expect(noseRoundDeg(o, cards[0].t)).toBeGreaterThanOrEqual(135);
    const crossed = o.ticks.find((k) => k.position.x < 0)!;
    expect(crossed.solidCenterLine).toBe(true);
    expect(crossed.gear).toBeLessThan(0);
    const row = expectNamedUTurn(o, 3);
    expect(row.t).toBe(cards[0].t);
  });

  it("V1 abandoned (L3): across the line and back WITHOUT finishing the turn → the pooled card was the whole truth", () => {
    // The demo radius begun 1.1 m from the axis, cut at 60°, and then steered
    // back onto his own side: he crossed, he did not turn round.
    const start = arcL(1.1, 124, 8.125, 0, 60);
    const tip = start[start.length - 1];
    const o = driveLiveRung(SC_MV_UTURN_BAN, 3, {
      steps: [
        ...approach(1.1, 124),
        { kind: "drive", points: start, targetKmh: 6, stopAtEnd: false },
        { kind: "drive", points: [tip, [tip[0] - 0.6, tip[1] + 2], [2.5, tip[1] + 12], [4.06, tip[1] + 24], [4.06, tip[1] + 34]], targetKmh: 9 },
        { kind: "pause", sec: 1, brake: true },
      ],
    });
    const last = o.ticks[o.ticks.length - 1];
    expect(Math.abs(wrap180(last.headingDeg))).toBeLessThan(5);
    expect(last.position.x).toBeGreaterThan(0);
    expectPlainCrossing(o, 3);
  });
});
