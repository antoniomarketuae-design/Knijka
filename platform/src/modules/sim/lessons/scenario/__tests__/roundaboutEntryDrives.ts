/**
 * Test support — the scripted DRIVES the roundabout-entry acceptance property
 * is swept over (rb-mini-v1: ring R = 18 about the origin, south-arm lane
 * centre x = 4.06, give-way line at y = −27.5).
 *
 * Two generations live here, kept apart because their timings differ:
 *
 *   · the round-3 grid (`singleStop`, `twoStop`, `roll`) — the 5,740-drive sweep;
 *   · the acts of the adversarial verifier that refuted round 3, ported with its
 *     own approach (`toLine` at 40 → 16 км/ч, glances included) so the numbers
 *     in its report reproduce: `lineStop` (R3-V3, and R3-V2's rear-end),
 *     `stopOnRing` (R3-V1 — enter ahead of the car and stop in the ring lane)
 *     and `slowOnRing`;
 *   · the acts of the verifier that conditioned round 4 (R4-V2): `nosePoke` —
 *     stop with the nose just over the ring's edge, wait, pull out — and
 *     `noseRock` — nose on, back off to the line, on again.
 *
 * Nothing in the product imports this.
 */

import type { DriveScript } from "../../../traces/recorder";

export const X_LANE = 4.06;
export const RING_R = 18;
export const LINE_Y = -27.5;

export type Steps = DriveScript["steps"];
type Pt = [number, number];

/** A point on the ring centreline, `phiDeg` counter-clockwise from due south. */
export const ring = (phiDeg: number): Pt => {
  const a = (phiDeg * Math.PI) / 180;
  return [RING_R * Math.sin(a), -RING_R * Math.cos(a)];
};
export const ringRun = (from: number, to: number): Pt[] => {
  const out: Pt[] = [];
  for (let p = from; p <= to; p += 10) out.push(ring(p));
  return out;
};

/** The lessons' own flat entry chord, from the give-way line onto the ring. */
export const CHORD: Pt[] = [[X_LANE, LINE_Y], [6.0, -23.0], [8.5, -18.5], [11.0, -15.0], ring(48), ring(55)];

/** Split a polyline `d` metres from its start: [up to and including the split point, from it on]. */
export function splitAt(pts: Pt[], d: number): [Pt[], Pt[]] {
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (acc + seg >= d) {
      const f = (d - acc) / seg;
      const p: Pt = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
      return [[...pts.slice(0, i + 1), p], [p, ...pts.slice(i + 1)]];
    }
    acc += seg;
  }
  return [pts, [pts[pts.length - 1]]];
}

// ── the round-3 grid ─────────────────────────────────────────────────────────

/** Round to the north exit and out of the roundabout's vicinity, signalled. */
export function leaveNorth(kmh = 11): Steps {
  return [
    { kind: "indicator", setting: "right" },
    {
      kind: "drive",
      points: [...ringRun(110, 150), [7.5, 19.0], [5.5, 22.0], [X_LANE, 26.0], [X_LANE, 40.0], [X_LANE, 58.0]],
      targetKmh: kmh,
    },
    { kind: "indicator", setting: "off" },
  ];
}

/** From the line: the lessons' own flat entry chord at `kmh`, then on round the east side. */
export function enterAndGo(kmh: number): Steps {
  return [
    { kind: "drive", points: CHORD, targetKmh: kmh, stopAtEnd: false },
    // A slow entry stays slow on the ring (the car behind catches it); a fast
    // one settles to the ring pace.
    { kind: "drive", points: ringRun(60, 100), targetKmh: Math.min(kmh, 11), stopAtEnd: false },
    ...leaveNorth(),
  ];
}

/** Rest on the give-way line, wait, enter. */
export function singleStop(waitSec: number, entryKmh: number): DriveScript {
  return {
    steps: [
      { kind: "drive", points: [[X_LANE, -93], [X_LANE, -60]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, -60], [X_LANE, -40], [X_LANE, LINE_Y]], targetKmh: 16 },
      { kind: "pause", sec: waitSec, brake: true },
      ...enterAndGo(entryKmh),
    ],
  };
}

/** Stop short, creep to the line, stop again, wait, enter — the more careful approach. */
export function twoStop(preWaitSec: number, creepKmh: number, waitSec: number, entryKmh: number): DriveScript {
  return {
    steps: [
      { kind: "drive", points: [[X_LANE, -93], [X_LANE, -60]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, -60], [X_LANE, -40], [X_LANE, -33]], targetKmh: 16 },
      { kind: "pause", sec: preWaitSec, brake: true },
      { kind: "drive", points: [[X_LANE, -33], [X_LANE, LINE_Y]], targetKmh: creepKmh },
      { kind: "pause", sec: waitSec, brake: true },
      ...enterAndGo(entryKmh),
    ],
  };
}

/** Never stop at the line: hold back at y = −50 for the phase, then one steady speed in. */
export function roll(phaseSec: number, kmh: number): DriveScript {
  return {
    steps: [
      { kind: "drive", points: [[X_LANE, -93], [X_LANE, -60], [X_LANE, -50]], targetKmh: 30 },
      { kind: "pause", sec: phaseSec, brake: true },
      {
        kind: "drive",
        points: [[X_LANE, -50], ...CHORD],
        targetKmh: kmh,
        stopAtEnd: false,
      },
      { kind: "drive", points: ringRun(60, 100), targetKmh: Math.min(kmh, 11), stopAtEnd: false },
      ...leaveNorth(),
    ],
  };
}

// ── the round-3 verifier's acts ──────────────────────────────────────────────

function toLine(): Steps {
  return [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: [[X_LANE, -93], [X_LANE, -60]], targetKmh: 40, stopAtEnd: false },
    { kind: "drive", points: [[X_LANE, -60], [X_LANE, -40], [X_LANE, LINE_Y]], targetKmh: 16, stopAtEnd: true },
    { kind: "glance", mirror: "left" },
  ];
}

function leaveNorthLooking(kmh: number): Steps {
  return [
    { kind: "indicator", setting: "right" },
    { kind: "glance", mirror: "right" },
    {
      kind: "drive",
      points: [...ringRun(110, 150), [7.5, 19.0], [5.5, 22.0], [X_LANE, 26.0], [X_LANE, 40.0], [X_LANE, 58.0]],
      targetKmh: kmh,
    },
    { kind: "indicator", setting: "off" },
    { kind: "pause", sec: 1.5, brake: true },
  ];
}

/** Stop on the line, wait `waitSec`, enter along the chord at `kmh`, carry on round the ring at `ringKmh`. */
export function lineStop(waitSec: number, kmh: number, ringKmh = Math.min(kmh, 9.5)): DriveScript {
  return {
    steps: [
      ...toLine(),
      { kind: "pause", sec: waitSec, brake: true },
      { kind: "drive", points: CHORD, targetKmh: kmh, stopAtEnd: false },
      { kind: "drive", points: ringRun(60, 100), targetKmh: ringKmh, stopAtEnd: false },
      ...leaveNorthLooking(ringKmh),
    ],
  };
}

/**
 * R3-V1 — ENTER AHEAD OF THE CAR AND STOP IN ITS LANE: stop on the line, wait,
 * enter at `kmh`, come to rest `alongM` metres along the chord (8–12 m is the
 * ring lane), hold `holdSec`, then drive on at `thenKmh`.
 */
export function stopOnRing(waitSec: number, kmh: number, alongM: number, holdSec: number, thenKmh = 12): DriveScript {
  const [pre, post] = splitAt(CHORD, alongM);
  return {
    steps: [
      ...toLine(),
      { kind: "pause", sec: waitSec, brake: true },
      { kind: "drive", points: pre, targetKmh: kmh, stopAtEnd: true },
      { kind: "pause", sec: holdSec, brake: true },
      { kind: "drive", points: post, targetKmh: thenKmh, stopAtEnd: false },
      { kind: "drive", points: ringRun(60, 100), targetKmh: Math.min(thenKmh, 11), stopAtEnd: false },
      ...leaveNorthLooking(Math.min(thenKmh, 11)),
    ],
  };
}

/** Enter at `kmh` for `alongM` metres of chord, then carry on at the slower `thenKmh` without stopping. */
export function slowOnRing(waitSec: number, kmh: number, alongM: number, thenKmh: number): DriveScript {
  const [pre, post] = splitAt(CHORD, alongM);
  return {
    steps: [
      ...toLine(),
      { kind: "pause", sec: waitSec, brake: true },
      { kind: "drive", points: pre, targetKmh: kmh, stopAtEnd: false },
      { kind: "drive", points: post, targetKmh: thenKmh, stopAtEnd: false },
      { kind: "drive", points: ringRun(60, 100), targetKmh: thenKmh, stopAtEnd: false },
      ...leaveNorthLooking(Math.max(thenKmh, 9)),
    ],
  };
}

// ── the round-4 verifier's acts (R4-V2) ──────────────────────────────────────

/**
 * R4-V2 — THE NOSE-POKE: stop on the line, wait `waitSec`, creep at `creepKmh`
 * until he is `alongM` metres along the entry chord — his nose comes over the
 * ring's edge about 5.4 m along it (the oracle reports how far onto the
 * carriageway it rests: `restNoseInM`) — stand there `holdSec`, then pull out
 * at `thenKmh` and go on round. The verifier's own act is
 * `nosePoke(18, 6, 5.6, 20, 17)`: nose 0.15 m over the edge for 20 s.
 */
export function nosePoke(waitSec: number, creepKmh: number, alongM: number, holdSec: number, thenKmh: number): DriveScript {
  return stopOnRing(waitSec, creepKmh, alongM, holdSec, thenKmh);
}

/**
 * NOSE-ROCKING: nose `alongM` metres along the chord (onto the ring), stand
 * `holdSec`, REVERSE back to the line, stand `hold2Sec`, then enter for good.
 */
export function noseRock(waitSec: number, kmh: number, alongM: number, holdSec: number, hold2Sec: number): DriveScript {
  const [pre] = splitAt(CHORD, alongM);
  return {
    steps: [
      ...toLine(),
      { kind: "pause", sec: waitSec, brake: true },
      { kind: "drive", points: pre, targetKmh: kmh, stopAtEnd: true },
      { kind: "pause", sec: holdSec, brake: true },
      { kind: "drive", points: [...pre].reverse(), targetKmh: 6, reverse: true, stopAtEnd: true },
      { kind: "pause", sec: hold2Sec, brake: true },
      { kind: "drive", points: CHORD, targetKmh: kmh, stopAtEnd: false },
      { kind: "drive", points: ringRun(60, 100), targetKmh: Math.min(kmh, 11), stopAtEnd: false },
      ...leaveNorthLooking(Math.min(kmh, 11)),
    ],
  };
}
