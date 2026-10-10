/**
 * WITNESS — sc-mv-uturn-ban:e98407b1, clause 4b, THE RIGHT SIDE AT THE EDGE OF
 * THE GAP: «a lawful turn-round begun where the axis is broken is praised
 * wherever inside the gap it is made».
 *
 * THE DEFECT (rig-w2, 2026-10-08, at 43b4109, /dev/drive-rig with the real
 * LessonPlayShell). UTURN_PAST_SOLID_AXIS «Подмина забраната, обърна на
 * прекъснатата осева» was minted on three lawful drives (R/pc-L3, R/pc-L1,
 * R/phone-L3 — arc max y 276.03 / 276.09 / 274.37) and LOST on two equally
 * lawful, violation-free, ИЗДЪРЖАН ones (R-edge-handoff/pc-L3 and /phone-L3 —
 * arc max y 279.06 / 276.94). On those two the locator handed the tick from the
 * boulevard (`mvu-e-ban`) to the side street (`mvu-e-cross`) in the middle of
 * the arc (pc at y 279.05, 95° round; phone at y 276.37, 102° round), and the
 * rule engine's ADR-013 tracker began a fresh tracker on the side street: the
 * turn-round that had begun on the boulevard where the axis is broken was never
 * confirmed, `uTurnPlaceRecord` stayed {0, 0} and gate G1 withheld the praise.
 * Instruction 4 tells the student to stop «На 280-ия метър», so a student who
 * did as told turned in the no-praise case.
 *
 * THE REPAIR (rules/engine.ts `solidCrossTurnHoldsRoad`, R7-1): while a
 * turn-round is in progress — the nose out of the 45° band, its swing still
 * going — a frame the locator gives to ANOTHER road is read against the road
 * it began on (the heading half, bank held, no station), so the ONE tracker
 * confirms it by the one confirmation, at the place it began. No second
 * definition of the act.
 *
 * EVERY DRIVE here runs the live rung chain (`witnessLiveRung`: the compiled
 * rung → createLessonSession → applyTick → buildLessonResult → buildDebrief),
 * L1 to L5. The rig drives are replayed from their capture sidecars
 * (E:/AI driver/.audit-frames/rig-w2/sc-mv-uturn-ban/<key>/<lens>.json `path`,
 * the 0.5 s samples between the departure from the opening and the rest in the
 * turn box), the approach being the lesson's own shadow route into the inner
 * lane.
 *
 *   §H1 the two LOST rig drives                       → praised (red on base)
 *   §H2 instruction 4: stops at y 272 and at y 280    → praised (red on base)
 *   §H3 the three already-praised rig drives          → praised, as on base
 *   §H4 a turn-round begun at y 217 (inside the span), crossing only on the
 *       dashes, then the lawful one at the gap        → never praised
 *   §H5 an in-span turn-round, then a detour round the side street that
 *       re-sights the boulevard, then the lawful one  → never praised (the
 *       drive's record carries across a re-sight: kills «carry removed»)
 *   §H6 into the side street and backed out of it, nose south — no
 *       turn-round on the record, as on base (R6-1)    → never praised
 *   §H7 (round 2, verifier F1/F2) a stop at y 262–268, a bend to 30–43°, a
 *       12–15 m creep across the dashes toward the mouth, an r5 sweep round:
 *       the side street takes the tick 30–43° round, BEFORE the nose leaves
 *       the 45° band (R7-2, `solidCrossTurnHoldsRoad` «approach»)
 *                                                      → praised (red on base
 *       and on round 1: place {0, 0})
 */

import { describe, expect, it } from "vitest";
import { uTurnPlaceRecord } from "../../../rules";
import type { DriveScript } from "../../../traces/recorder";
import { scMvUturnBanShadowScript } from "../../../traces/scMvUturnBan";
import { SC_MV_UTURN_BAN } from "../templates-parking2";
import { oracle, SPAN } from "./uturnActOracle";
import { driveLiveRung, type LiveRungOutcome } from "./witnessLiveRung";

const PRAISE_CODE = "UTURN_PAST_SOLID_AXIS";
const PRAISE_TITLE = "Подмина забраната, обърна на прекъснатата осева";
const ALL_RUNGS = [1, 2, 3, 4, 5] as const;
type Rung = (typeof ALL_RUNGS)[number];
type Steps = DriveScript["steps"];
type Pt = [number, number];
const LANE_OUT = 12.19;
const LANE_IN = 4.06;
const REFUSED = ["CROSSED_SOLID_LINE", "CENTER_LINE_TOUCHED", "FAILED_TO_YIELD", "COLLISION"];
const rad = (d: number) => (d * Math.PI) / 180;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** An arc of radius r from pose (x0, y0, heading h0 — degrees LEFT of north), turning `turnDeg` (+ = left), 3° vertices. */
function arc(x0: number, y0: number, h0: number, r: number, turnDeg: number, stepDeg = 3): { pts: Pt[]; x: number; y: number } {
  const left = turnDeg >= 0;
  const cx = x0 + r * (left ? -Math.cos(rad(h0)) : Math.cos(rad(h0)));
  const cy = y0 + r * (left ? -Math.sin(rad(h0)) : Math.sin(rad(h0)));
  const pts: Pt[] = [];
  const n = Math.max(1, Math.ceil(Math.abs(turnDeg) / stepDeg));
  let x = x0;
  let y = y0;
  for (let i = 0; i <= n; i++) {
    const h = h0 + (turnDeg * i) / n;
    x = cx - r * (left ? -Math.cos(rad(h)) : Math.cos(rad(h)));
    y = cy - r * (left ? -Math.sin(rad(h)) : Math.sin(rad(h)));
    pts.push([r3(x), r3(y)]);
  }
  return { pts, x, y };
}

// ---------------------------------------------------------------------------
// The rig drives, from their capture sidecars (rig-w2, 43b4109). `rest` is the
// stop at the opening (stops[1]); `arc` the pose path from the departure to the
// rest in the turn box. `arcMaxY` / `handoff` restate the sidecar's own
// `arcs[0].maxY` and the first `roadFixTimeline` row on `mvu-e-cross`.
// ---------------------------------------------------------------------------
interface RigDrive {
  key: string;
  rest: Pt;
  arcMaxY: number;
  arc: Pt[];
}
const RIG_LOST: RigDrive[] = [
  {
    key: "R-edge-handoff/pc-L3", // handoff t 58.79 at (-4.99, 279.05)
    rest: [3.94, 271.96],
    arcMaxY: 279.06,
    arc: [[3.94, 272], [3.86, 272.36], [3.65, 273.12], [3.28, 274.07], [2.78, 275.01], [2.16, 275.88], [1.43, 276.68], [0.61, 277.37], [-0.28, 277.95], [-1.25, 278.42], [-2.26, 278.77], [-3.31, 278.98], [-4.39, 279.06], [-5.45, 279.01], [-6.5, 278.82], [-7.53, 278.51], [-8.5, 278.07], [-9.42, 277.5], [-10.26, 276.83], [-11, 276.06], [-11.64, 275.21], [-12.17, 274.27], [-12.58, 273.29], [-12.87, 272.25], [-13.02, 271.2], [-13.04, 270.12], [-12.95, 269.1]],
  },
  {
    key: "R-edge-handoff/phone-L3", // handoff t 63.05 at (-7.65, 276.37)
    rest: [3.97, 269.02],
    arcMaxY: 276.94,
    arc: [[3.97, 269.03], [3.94, 269.29], [3.84, 269.96], [3.56, 271.04], [3.18, 272], [2.67, 272.94], [2.05, 273.81], [1.31, 274.6], [0.48, 275.29], [-0.43, 275.88], [-1.36, 276.32], [-2.4, 276.66], [-3.39, 276.86], [-4.48, 276.94], [-5.5, 276.89], [-6.68, 276.67], [-7.65, 276.37], [-8.61, 275.92], [-9.51, 275.37], [-10.44, 274.6], [-11.06, 273.95], [-11.72, 273.08], [-12.22, 272.2], [-12.68, 271.1], [-12.93, 270.14], [-13.09, 269.11], [-13.02, 267.11], [-12.98, 266.9], [-12.62, 265.03], [-12.6, 264.86]],
  },
];
const RIG_PRAISED: RigDrive[] = [
  {
    key: "R/pc-L3",
    rest: [4.03, 268.95],
    arcMaxY: 276.03,
    arc: [[4.01, 269.05], [3.89, 269.56], [3.64, 270.4], [3.21, 271.36], [2.67, 272.29], [2.01, 273.13], [1.26, 273.89], [0.4, 274.56], [-0.49, 275.08], [-1.49, 275.52], [-2.53, 275.82], [-3.58, 275.99], [-4.65, 276.03], [-5.69, 275.93], [-6.76, 275.7], [-7.77, 275.34], [-8.73, 274.86], [-9.62, 274.26], [-10.42, 273.56], [-11.14, 272.75], [-11.74, 271.88], [-12.23, 270.92], [-12.6, 269.92], [-12.84, 268.88], [-12.95, 267.81], [-12.92, 266.7], [-12.83, 265.85]],
  },
  {
    key: "R/pc-L1",
    rest: [4.09, 268.95],
    arcMaxY: 276.09,
    arc: [[4.05, 269.19], [3.89, 269.86], [3.57, 270.77], [3.09, 271.75], [2.52, 272.64], [1.82, 273.46], [1.04, 274.18], [0.16, 274.8], [-0.78, 275.31], [-1.76, 275.69], [-2.81, 275.95], [-3.88, 276.08], [-4.92, 276.07], [-6.01, 275.92], [-7.05, 275.65], [-8.04, 275.25], [-8.98, 274.73], [-9.84, 274.09], [-10.62, 273.36], [-11.29, 272.53], [-11.86, 271.62], [-12.3, 270.67], [-12.64, 269.62], [-12.84, 268.57], [-12.9, 267.5], [-12.83, 266.44], [-12.73, 265.65]],
  },
  {
    key: "R/phone-L3",
    rest: [4.23, 267.0],
    arcMaxY: 274.37,
    arc: [[4.23, 267.02], [4.18, 267.35], [4.01, 268.05], [3.67, 269.07], [3.21, 270], [2.63, 270.91], [2, 271.66], [1.14, 272.47], [0.34, 273.04], [-0.69, 273.6], [-1.59, 273.95], [-2.74, 274.24], [-3.8, 274.36], [-4.78, 274.35], [-5.85, 274.22], [-6.85, 273.96], [-7.95, 273.52], [-8.84, 273.03], [-9.63, 272.46], [-10.49, 271.65], [-11.1, 270.93], [-11.73, 269.95], [-12.15, 269.07], [-12.53, 267.93], [-12.71, 266.98], [-12.79, 265.96], [-12.7, 264.55], [-12.54, 263.75], [-12.33, 262.57], [-12.27, 262.15]],
  },
];

/** The lesson's own shadow route up to the roll to the opening, then the roll to `stop`, the left glance and the wait for the stream. */
function headTo(stop: Pt, wait = 14.5): Steps {
  const shadow = scMvUturnBanShadowScript().steps;
  const roll = shadow.findIndex((s) => s.kind === "drive" && s.targetKmh === 22);
  if (roll < 0) throw new Error("the shadow script no longer rolls up to the opening at 22 km/h");
  return [
    ...shadow.slice(0, roll),
    { kind: "drive", points: [[LANE_IN, 235], stop], targetKmh: 22 },
    { kind: "glance", mirror: "left" },
    { kind: "pause", sec: wait, brake: true },
  ];
}

function rigReplay(d: RigDrive): DriveScript {
  return {
    steps: [
      ...headTo(d.rest),
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: d.arc, targetKmh: 8 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2, brake: true },
    ],
  };
}

/**
 * Instruction 4 taken at its word: stop in the inner lane at y `stopY`, one left
 * arc (r 8.125, inner lane → opposite outer lane), settle. `stepDeg` is the
 * drawing: 3° vertices, or the lesson's own 15° (`traces/scMvUturnBan.ts
 * uturnArc`), whose 2.1 m straight runs end the swing between vertices and
 * resume it at the next one (R6-5) — the same turn-round either way.
 */
function stopAtThenTurn(stopY: number, stepDeg = 3): DriveScript {
  const a = arc(LANE_IN, stopY, 0, 8.125, 180, stepDeg);
  return {
    steps: [
      ...headTo([LANE_IN, stopY]),
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: a.pts, targetKmh: 8, stopAtEnd: false },
      { kind: "drive", points: [[r3(a.x), r3(a.y)], [r3(a.x), r3(a.y - 1)]], targetKmh: 8 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2, brake: true },
    ],
  };
}

/**
 * §H4 — a turn-round BEGUN at y 217, three metres inside the end of the span,
 * from the inner lane: its centre crosses the axis at y ≈ 224, over the dashes,
 * so no crossing of the solid axis is billed. The car waits in the opposite
 * outer lane for the stream, backs out along the same arc (a second
 * turn-round, begun there too), then takes the lesson's route to the opening
 * and makes the lawful turn there. Every task completes; only «began where the
 * axis is solid» can withhold the praise.
 */
function turnBegunAt217ThenLawful(): DriveScript {
  const a = arc(LANE_IN, 217, 0, 8.125, 180);
  const back = [...a.pts].reverse();
  const lawful = arc(LANE_IN, 264, 0, 8.125, 180);
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_OUT, 15], [LANE_OUT, 150], [LANE_OUT, 180]], targetKmh: 40, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[LANE_OUT, 180], [8, 195], [LANE_IN, 205], [LANE_IN, 217]], targetKmh: 25 },
      { kind: "pause", sec: 1, brake: true },
      { kind: "drive", points: a.pts, targetKmh: 8 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 22, brake: true },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: back, targetKmh: 5, reverse: true },
      { kind: "pause", sec: 1, brake: true },
      { kind: "drive", points: [[LANE_IN, 217], [LANE_IN, 264]], targetKmh: 22 },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "pause", sec: 2, brake: true },
      { kind: "drive", points: lawful.pts, targetKmh: 8, stopAtEnd: false },
      { kind: "drive", points: [[r3(lawful.x), r3(lawful.y)], [r3(lawful.x), r3(lawful.y - 1)]], targetKmh: 8 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2, brake: true },
    ],
  };
}

/**
 * §H5 — TWO TURN-ROUNDS INSIDE THE SPAN, THEN A DETOUR ROUND THE SIDE STREET.
 * From the kerb at y 120 a full circle on the own half (r 6.2, the centre never
 * reaches the axis — nothing is billed: the recorded class of the praise
 * witness's D1), on north into the inner lane, the stream waited out at the
 * opening, a left turn INTO the side street (90°, no turn-round), west along
 * it, then backing out of it onto the boulevard's other half (nose north) and
 * across the dashes into the inner lane, and the lawful turn at the opening.
 * The tick is on `mvu-e-cross` and comes back to `mvu-e-ban`: the boulevard
 * sees the car for the first time again, and the drive's record of where its
 * turn-rounds began must still hold the two made inside the ban.
 */
function inSpanThenSideStreetDetourThenLawful(): DriveScript {
  const c1 = arc(14.5, 120, 0, 6.2, 180);
  const c2 = arc(c1.x, c1.y, 180, 6.2, 180);
  const into = arc(LANE_IN, 266, 0, 15.5, 90);
  const lawful = arc(LANE_IN, 262, 0, 8.125, 180);
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_OUT, 15], [LANE_OUT, 80], [14.5, 100], [14.5, 120]], targetKmh: 40 },
      { kind: "pause", sec: 0.8, brake: true },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [...c1.pts, ...c2.pts.slice(1)], targetKmh: 9, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[r3(c2.x), r3(c2.y)], [LANE_OUT, 140], [LANE_OUT, 195]], targetKmh: 40, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[LANE_OUT, 195], [8, 215], [LANE_IN, 235]], targetKmh: 34, stopAtEnd: false },
      { kind: "drive", points: [[LANE_IN, 235], [LANE_IN, 266]], targetKmh: 22 },
      { kind: "pause", sec: 14.5, brake: true },
      // Into the side street: a quarter turn left, then west along its right-hand lane.
      { kind: "drive", points: [...into.pts, [-40, r3(into.y)]], targetKmh: 10 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1, brake: true },
      // Back out of it: east along the street, the tail swinging south onto the boulevard's west half.
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[-40, r3(into.y)], [-16, r3(into.y)], [-11, 280.5], [-7.5, 277], [-5.2, 272.5], [-4.3, 268], [-4.06, 263], [-4.06, 240]],
        targetKmh: 5,
        reverse: true,
      },
      { kind: "pause", sec: 1, brake: true },
      // Forward, north, over the dashes into the inner lane, up to the opening.
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[-4.06, 240], [0, 246], [LANE_IN, 252], [LANE_IN, 262]], targetKmh: 15 },
      { kind: "indicator", setting: "left" },
      { kind: "pause", sec: 2, brake: true },
      { kind: "drive", points: lawful.pts, targetKmh: 8, stopAtEnd: false },
      { kind: "drive", points: [[r3(lawful.x), r3(lawful.y)], [r3(lawful.x), r3(lawful.y - 1)]], targetKmh: 8 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2, brake: true },
    ],
  };
}

/**
 * §H6 — THROUGH THE SIDE STREET, NOT A TURN-ROUND AT THE GAP (R6-1, unchanged):
 * the lesson's route to the opening and the wait, a quarter turn left INTO the
 * side street and along it, then backing out of it, the tail swinging north up
 * the boulevard's west half (nose south), and forward into the turn box. Each
 * 90° swing ENDS with the car straight on the other road, so the boulevard
 * sees it come back for the first time and reads its direction off its heading
 * (R6-1): the rule engine records no turn-round, and the praise — which is for
 * one — is not minted. An excursion held across a side street must let go when
 * its swing has ended.
 */
function throughTheSideStreet(): DriveScript {
  const into = arc(LANE_IN, 266, 0, 15.5, 90);
  const y = r3(into.y);
  const tail = arc(-14, y, -90, 9.94, 90); // the TAIL travels east, then north up the boulevard west half
  return {
    steps: [
      ...headTo([LANE_IN, 266]),
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [...into.pts, [-24, y]], targetKmh: 10 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1, brake: true },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[-24, y], ...tail.pts, [r3(tail.x), 297]], targetKmh: 5, reverse: true },
      { kind: "pause", sec: 1, brake: true },
      { kind: "drive", points: [[r3(tail.x), 297], [r3(tail.x), 285]], targetKmh: 10 },
      { kind: "pause", sec: 2, brake: true },
    ],
  };
}

/**
 * §H7 — THE DIAGONAL CREEP TO THE MOUTH (round 2, verifier F1/F2), restated
 * from the verifier's tape (D:/knijka-lanes/scratch/uturnedge-verify, «dsweep»):
 * up the outer lane, over into the inner lane, a stop at y `stopY` and the wait
 * for the stream; then a bend of radius 6 to `d`° left (3° vertices), a
 * straight creep of `m` metres across the dashes toward the side street's
 * mouth, one arc of radius 5 round to heading 180 (5° vertices), and settle.
 * The locator hands the tick to `mvu-e-cross` while the nose is still 30–43°
 * round — before it has left the 45° band.
 */
function approachOuterThenInner(stop: Pt, wait = 18): Steps {
  return [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: [[LANE_OUT, 15], [LANE_OUT, 120], [LANE_OUT, 190]], targetKmh: 38, stopAtEnd: false },
    { kind: "glance", mirror: "left" },
    { kind: "indicator", setting: "left" },
    { kind: "drive", points: [[LANE_OUT, 190], [8.5, 205], [LANE_IN, 222], [LANE_IN, 240]], targetKmh: 30, stopAtEnd: false },
    { kind: "drive", points: [[LANE_IN, 240], [stop[0], stop[1] - 6], stop], targetKmh: 18 },
    { kind: "glance", mirror: "left" },
    { kind: "pause", sec: wait, brake: true },
  ];
}
function diagonalCreepThenArc(stopY: number, d: number, m: number): DriveScript {
  const bend = arc(LANE_IN, stopY, 0, 6, d, 3);
  const bendEnd: Pt = bend.pts[bend.pts.length - 1];
  const creepEnd: Pt = [r3(bendEnd[0] - Math.sin(rad(d)) * m), r3(bendEnd[1] + Math.cos(rad(d)) * m)];
  const round = arc(creepEnd[0], creepEnd[1], d, 5, 180 - d, 5);
  const end: Pt = round.pts[round.pts.length - 1];
  return {
    steps: [
      ...approachOuterThenInner([LANE_IN, stopY]),
      { kind: "drive", points: [...bend.pts, creepEnd], targetKmh: 7, stopAtEnd: false },
      { kind: "drive", points: round.pts, targetKmh: 7, stopAtEnd: false },
      { kind: "drive", points: [end, [end[0], r3(end[1] - 1.2)]], targetKmh: 6 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2.5, brake: true },
    ],
  };
}
/** The verifier's ten lost geometries: (stop y, bend to d°, creep m metres). */
const DIAGONAL_CREEPS = [
  [262, 30, 15],
  [262, 35, 15],
  [264, 30, 15],
  [264, 35, 15],
  [266, 35, 12],
  [266, 35, 15],
  [266, 40, 12],
  [266, 43, 12],
  [268, 40, 12],
  [268, 43, 12],
] as const;

const cache = new Map<string, LiveRungOutcome>();
function drive(name: string, script: () => DriveScript, level: Rung): LiveRungOutcome {
  const key = `${name}@L${level}`;
  let o = cache.get(key);
  if (o === undefined) {
    o = driveLiveRung(SC_MV_UTURN_BAN, level, script());
    cache.set(key, o);
  }
  return o;
}
const praises = (o: LiveRungOutcome) =>
  o.session.events.filter((e) => e.kind === "commendation" && (e.code as string) === PRAISE_CODE);
const otherCommendations = (o: LiveRungOutcome) =>
  o.session.events.filter((e) => e.kind === "commendation" && (e.code as string) !== PRAISE_CODE).map((e) => e.code);

/** The arc's highest point after the stop at the opening (the sidecars' `arcs[0].maxY`). */
function arcMaxY(o: LiveRungOutcome, fromT: number): number {
  return Math.max(...o.ticks.filter((t) => t.t >= fromT).map((t) => t.position.y));
}
/** The first frame the tick is on the side street, and how far round the nose is then (degrees from north). */
function firstOnSideStreet(o: LiveRungOutcome): { t: number; y: number; roundDeg: number } | null {
  const t = o.ticks.find((k) => k.edgeAlignment?.edgeId === "mvu-e-cross");
  if (t === undefined) return null;
  const h = ((t.headingDeg % 360) + 360) % 360;
  return { t: t.t, y: t.position.y, roundDeg: h > 180 ? 360 - h : h };
}

function expectPraisedOnce(o: LiveRungOutcome): void {
  const p = praises(o);
  expect(p).toHaveLength(1);
  expect(p[0].titleBg).toBe(PRAISE_TITLE);
  expect(p[0].t).toBe(o.session.endedAtSec);
  expect(o.result.summary.commendations.filter((c) => c.titleBg === PRAISE_TITLE)).toHaveLength(1);
  expect(o.debrief).toContain(`• ${PRAISE_TITLE}`);
  expect(o.debrief.indexOf(`• ${PRAISE_TITLE}`)).toBeGreaterThan(o.debrief.indexOf("Какво се получи добре:"));
}
function expectLawfulPass(o: LiveRungOutcome): void {
  expect(o.session.phase).toBe("completed");
  expect(o.done).toEqual({ "sc-mvu-pass-ban": true, "sc-mvu-turn": true });
  expect(o.result.passed).toBe(true);
  expect(o.result.score).toBe(0);
  expect(o.scored).toEqual([]);
  expect(o.coached).toEqual([]);
}
/** The truth from the raw pose (no product state): ONE turn-round, begun on the dashes past the span; no solid crossing. */
function expectOneLawfulTurnRound(o: LiveRungOutcome): void {
  const truth = oracle(o.ticks);
  expect(truth.turnRounds).toHaveLength(1);
  expect(truth.turnRounds[0].beginSolid).toBe(false);
  expect(truth.turnRounds[0].beginY).toBeGreaterThan(SPAN.toY);
  expect(truth.crossings.filter((c) => c.solid)).toEqual([]);
}
function expectNowhere(o: LiveRungOutcome): void {
  expect(praises(o)).toEqual([]);
  expect(o.result.summary.commendations.map((c) => c.titleBg)).not.toContain(PRAISE_TITLE);
  expect(o.debrief).not.toContain(PRAISE_TITLE);
}

describe("§H1 the two rig drives that lost the praise — the arc reaches the side street's edge", () => {
  for (const d of RIG_LOST) {
    for (const level of ALL_RUNGS) {
      it(`L${level}: ${d.key} (rest y ${d.rest[1]}, arc max y ${d.arcMaxY}) → praised once; verdict and scores unchanged`, () => {
        const o = drive(d.key, () => rigReplay(d), level);
        // The premise, as the capture measured it: the arc reaches y ≥ 276.9 and
        // the tick is handed to the side street MID turn-round (the nose 80–135° round).
        expect(arcMaxY(o, 40)).toBeGreaterThanOrEqual(276.9);
        const side = firstOnSideStreet(o);
        expect(side).not.toBeNull();
        expect(side!.roundDeg).toBeGreaterThan(80);
        expect(side!.roundDeg).toBeLessThan(135);
        expectOneLawfulTurnRound(o);
        // The rule engine's own record: one turn-round, begun where the axis is broken.
        expect(uTurnPlaceRecord(o.session.rules)).toEqual({ atBrokenAxis: 1, elsewhere: 0 });
        expectPraisedOnce(o);
        expectLawfulPass(o);
        expect(otherCommendations(o)).toEqual(["SAFE_LANE_CHANGE", "CLEAN_DRIVING"]);
      });
    }
  }
});

describe("§H2 instruction 4 at its word — «На 280-ия метър»: stop at y 272 and at y 280, one arc", () => {
  // The other commendations are the drive's own and the same as base gave it (measured at c38086a): the
  // 15° drawing also earns YIELDED_TO_PRIORITY, the 3° one does not.
  const OTHERS = {
    3: ["SAFE_LANE_CHANGE", "CLEAN_DRIVING"],
    15: ["SAFE_LANE_CHANGE", "CLEAN_DRIVING", "YIELDED_TO_PRIORITY"],
  } as const;
  for (const [stopY, stepDeg] of [[272, 3], [280, 3], [272, 15], [280, 15]] as const) {
    for (const level of ALL_RUNGS) {
      it(`L${level}: stop at y ${stopY}, arc max y ${stopY + 8.125} drawn in ${stepDeg}° vertices → praised once`, () => {
        const o = drive(`stop${stopY}@${stepDeg}`, () => stopAtThenTurn(stopY, stepDeg), level);
        expect(arcMaxY(o, 40)).toBeGreaterThanOrEqual(277);
        const side = firstOnSideStreet(o);
        expect(side).not.toBeNull();
        expect(side!.roundDeg).toBeLessThan(135);
        expectOneLawfulTurnRound(o);
        expect(uTurnPlaceRecord(o.session.rules)).toEqual({ atBrokenAxis: 1, elsewhere: 0 });
        expectPraisedOnce(o);
        expectLawfulPass(o);
        expect(otherCommendations(o)).toEqual(OTHERS[stepDeg]);
      });
    }
  }
});

describe("§H7 a diagonal creep to the side street's mouth, handed to it before the nose leaves the 45° band — praised", () => {
  for (const [stopY, d, m] of DIAGONAL_CREEPS) {
    for (const level of ALL_RUNGS) {
      it(`L${level}: stop at y ${stopY}, bend to ${d}°, creep ${m} m, r5 round → praised once, place {1, 0}`, () => {
        const o = drive(`diag${stopY}/${d}/${m}`, () => diagonalCreepThenArc(stopY, d, m), level);
        // The premise (verifier F2): the side street has the tick while the nose
        // is still inside the band — 30–43° round — and the arc reaches past y 277.
        const side = firstOnSideStreet(o);
        expect(side).not.toBeNull();
        expect(side!.roundDeg).toBeGreaterThanOrEqual(29.9);
        expect(side!.roundDeg).toBeLessThan(45);
        expect(arcMaxY(o, 40)).toBeGreaterThanOrEqual(277);
        expectOneLawfulTurnRound(o);
        expect(oracle(o.ticks).turnRounds[0].beginY).toBeGreaterThanOrEqual(277);
        expect(uTurnPlaceRecord(o.session.rules)).toEqual({ atBrokenAxis: 1, elsewhere: 0 });
        expectPraisedOnce(o);
        expectLawfulPass(o);
        expect(otherCommendations(o)).toEqual(["SAFE_LANE_CHANGE", "CLEAN_DRIVING", "YIELDED_TO_PRIORITY"]);
      });
    }
  }
});

describe("§H3 the three rig drives that were already praised — unchanged", () => {
  for (const d of RIG_PRAISED) {
    for (const level of ALL_RUNGS) {
      it(`L${level}: ${d.key} (rest y ${d.rest[1]}, arc max y ${d.arcMaxY}) → praised once, the tick never leaves the boulevard`, () => {
        const o = drive(d.key, () => rigReplay(d), level);
        expect(arcMaxY(o, 40)).toBeLessThan(276.9);
        expect(firstOnSideStreet(o)).toBeNull();
        expectOneLawfulTurnRound(o);
        expect(uTurnPlaceRecord(o.session.rules)).toEqual({ atBrokenAxis: 1, elsewhere: 0 });
        expectPraisedOnce(o);
        expectLawfulPass(o);
      });
    }
  }
});

describe("§H4 a turn-round begun at y 217, inside the span, crossing only on the dashes — never praised", () => {
  for (const level of ALL_RUNGS) {
    it(`L${level}: begun at y 217, then the lawful turn at the opening → no praise`, () => {
      const o = drive("h4", turnBegunAt217ThenLawful, level);
      const truth = oracle(o.ticks);
      // The premise, from the pose: the first turn-round begins inside the span
      // (y 216–219), every crossing of the axis is over the dashes, and the last
      // turn-round is the lawful one at the opening.
      expect(truth.turnRounds.length).toBeGreaterThanOrEqual(2);
      expect(truth.turnRounds[0].beginSolid).toBe(true);
      expect(truth.turnRounds[0].beginY).toBeGreaterThanOrEqual(216);
      expect(truth.turnRounds[0].beginY).toBeLessThanOrEqual(219);
      expect(truth.crossings.length).toBeGreaterThan(0);
      expect(truth.crossings.filter((c) => c.solid)).toEqual([]);
      const last = truth.turnRounds[truth.turnRounds.length - 1];
      expect(last.beginSolid).toBe(false);
      expect(last.beginY).toBeGreaterThan(SPAN.toY);
      // …and the product: nothing the praise refuses on, every task done — so
      // only «began where the axis is solid» (G2) can withhold it.
      for (const code of REFUSED) expect([...o.scored, ...o.coached]).not.toContain(code);
      expect(o.session.phase).toBe("completed");
      expect(o.done).toEqual({ "sc-mvu-pass-ban": true, "sc-mvu-turn": true });
      const place = uTurnPlaceRecord(o.session.rules);
      expect(place.atBrokenAxis).toBe(1);
      expect(place.elsewhere).toBe(truth.turnRounds.length - 1);
      expectNowhere(o);
    });
  }
});

describe("§H6 into the side street and backed out of it — no turn-round on the record, never praised (R6-1, as base)", () => {
  for (const level of ALL_RUNGS) {
    it(`L${level}: a quarter turn in, backed out nose south → record {0, 0}, no praise`, () => {
      const o = drive("h6", throughTheSideStreet, level);
      // The premise: the tick is on the side street while the car is straight on it, and comes back to the boulevard.
      const side = firstOnSideStreet(o);
      expect(side).not.toBeNull();
      expect(o.ticks.some((k) => k.t > side!.t && k.edgeAlignment?.edgeId !== "mvu-e-cross" && k.edgeAlignment?.edgeId !== null)).toBe(true);
      expect(uTurnPlaceRecord(o.session.rules)).toEqual({ atBrokenAxis: 0, elsewhere: 0 });
      expectNowhere(o);
    });
  }
});

describe("§H5 in-span turn-rounds, then a detour round the side street that re-sights the boulevard — never praised", () => {
  for (const level of ALL_RUNGS) {
    it(`L${level}: two unbilled turn-rounds in the span, the side street and back, the lawful turn → no praise`, () => {
      const o = drive("h5", inSpanThenSideStreetDetourThenLawful, level);
      const truth = oracle(o.ticks);
      // The premise: two turn-rounds begun inside the span, no solid crossing;
      // the tick goes onto the side street and comes back to the boulevard
      // before the last turn-round, which is the lawful one at the opening.
      const inSpanRounds = truth.turnRounds.filter((r) => r.beginSolid === true);
      expect(inSpanRounds).toHaveLength(2);
      expect(truth.crossings.filter((c) => c.solid)).toEqual([]);
      const side = firstOnSideStreet(o);
      expect(side).not.toBeNull();
      const last = truth.turnRounds[truth.turnRounds.length - 1];
      expect(last.beginSolid).toBe(false);
      expect(last.beginY).toBeGreaterThan(SPAN.toY);
      const backOnBoulevard = o.ticks.find((k) => k.t > side!.t && k.edgeAlignment?.edgeId === "mvu-e-ban");
      expect(backOnBoulevard).toBeDefined();
      expect(backOnBoulevard!.t).toBeLessThan(last.confirmedT);
      for (const code of REFUSED) expect([...o.scored, ...o.coached]).not.toContain(code);
      expect(o.session.phase).toBe("completed");
      expect(o.done).toEqual({ "sc-mvu-pass-ban": true, "sc-mvu-turn": true });
      // The drive's record carries across the re-sight: the two in-span turn-rounds are still on it.
      const place = uTurnPlaceRecord(o.session.rules);
      expect(place.elsewhere).toBeGreaterThanOrEqual(2);
      expect(place.atBrokenAxis).toBeGreaterThanOrEqual(1);
      expectNowhere(o);
    });
  }
});
