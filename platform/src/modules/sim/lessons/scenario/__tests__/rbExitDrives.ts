/**
 * Test support — the drives of the ring-exit hand-over battery
 * (sc-rb-lane-choice:ffdffd55, clause 1b). Nothing in the product imports it.
 *
 * THE JUDGE'S DRIVE is the rig-w2 capture's careful drive (2026-10-08, at
 * 43b4109, D:/knijka-lanes/scratch/rig-w2/sc-rb-lane-choice/rb-drive.mjs): the
 * authored approach, wait and inner-lane entry, the inner lane past the east
 * and north mouths, right mirror + right indicator, a lane change out, the
 * outer lane to φ 233, ONE right arc (ρ ≈ 14.8 m) onto the west arm's kerb lane
 * y = 12.19, then straight west — at the lesson's own «около 12 км/ч»
 * (instruction 4) until r > `accelAtR`, and only then the arm's 20 km/h. The
 * capture's primary drives used 40 m; its «x20» variants, the only ones the
 * product passed, 34.5 m.
 *
 * THE EXIT IS THE SUBJECT and is the capture's number for number. The lane
 * change before it is the authored shadow's own smoothstep ramp (φ 185 → 231)
 * rather than the capture's quintic (φ 188 → 231): the recorder follows a
 * polyline EXACTLY, the rig's car rounded the quintic by up to 0.76 m, and
 * followed exactly its 38° swing reads as a turn the car never made.
 */

import type { DriveScript } from "../../../traces/recorder";
import { SC_RB_LANE_CHOICE_GEOMETRY } from "../../../traces/scRbLaneChoice";

const G = SC_RB_LANE_CHOICE_GEOMETRY;
const D2R = Math.PI / 180;

/** Ring point at circulation angle φ (from the SOUTH node, CCW through east). */
export const ring = (phiDeg: number, radius: number): [number, number] => [
  radius * Math.sin(phiDeg * D2R),
  -radius * Math.cos(phiDeg * D2R),
];

/**
 * The capture's MEASURED ring pace, km/h («inner ring lane r ≈ 21.5–21.9 at
 * 11.6–11.7 km/h» under a 12 km/h request). The recorder holds its target
 * exactly, so the request here is the pace the rig's car actually made.
 */
export const JUDGE_RING_KMH = 11.6;
/** Lane-change window (the shadow's ramp start; the capture's end) and the φ
 *  at which the capture's exit arc leaves the outer lane. */
const LC0 = 185;
const LC1 = 231;
const OUT1 = 233;

/** Lane change, outer lane, one right arc — up to the arc's end on y = 12.19. */
function exitOntoWestArm(): { points: Array<[number, number]>; endX: number } {
  const points: Array<[number, number]> = [];
  for (let p = LC0; p <= LC1 + 1e-9; p += 1) {
    const u = (p - LC0) / (LC1 - LC0);
    points.push(ring(p, G.LANE_INNER_R + (G.LANE_OUTER_R - G.LANE_INNER_R) * (u * u * (3 - 2 * u))));
  }
  for (let p = LC1 + 1; p <= OUT1 + 1e-9; p += 1) points.push(ring(p, G.LANE_OUTER_R));
  const pq = ring(OUT1, G.LANE_OUTER_R);
  const h0 = (((90 - OUT1) % 360) + 360) % 360;
  const rightOf = (h: number): [number, number] => [Math.cos(h * D2R), -Math.sin(h * D2R)];
  const rho = (pq[1] - G.WEST_CURB_Y) / (1 + Math.sin(h0 * D2R));
  const c: [number, number] = [pq[0] + rho * rightOf(h0)[0], pq[1] + rho * rightOf(h0)[1]];
  for (let h = h0 + 1.5; h < 270; h += 1.5) points.push([c[0] - rho * rightOf(h)[0], c[1] - rho * rightOf(h)[1]]);
  points.push([c[0], G.WEST_CURB_Y]);
  return { points, endX: c[0] };
}

export interface JudgeDriveOptions {
  /** Ring-and-exit pace, km/h (default: the capture's measured 11.6). */
  ringKmh?: number;
  /** Radius beyond which the west arm's 20 km/h is asked for (capture: 40);
   *  `null` holds the ring pace all the way out — instruction 4 to the letter. */
  accelAtR?: number | null;
  /** West-arm lateral line the drive settles on (default: the kerb-lane centre
   *  12.19). The blend runs over the first 10 m of the arm straight. */
  armY?: number;
  /** How far west the drive runs (default −72, past the lesson's r > 46 end). */
  toX?: number;
}

export function judgeDriveScript(opts: JudgeDriveOptions = {}): DriveScript {
  const ringKmh = opts.ringKmh ?? JUDGE_RING_KMH;
  const accelAtR = opts.accelAtR === undefined ? 40 : opts.accelAtR;
  const armY = opts.armY ?? G.WEST_CURB_Y;
  const toX = opts.toX ?? -72;
  const exit = exitOntoWestArm();
  const slow: Array<[number, number]> = [...exit.points];
  const fast: Array<[number, number]> = [];
  for (let x = exit.endX - 0.5; x >= toX; x -= 0.5) {
    const u = Math.min(1, (exit.endX - x) / 10);
    const y = G.WEST_CURB_Y + (armY - G.WEST_CURB_Y) * (u * u * (3 - 2 * u));
    (accelAtR === null || Math.hypot(x, y) <= accelAtR ? slow : fast).push([x, y]);
  }
  const inner: Array<[number, number]> = [];
  for (let p = 40; p <= 180 + 1e-9; p += 10) inner.push(ring(p, G.LANE_INNER_R));
  const steps: DriveScript["steps"] = [
    { kind: "glance", mirror: "left" },
    { kind: "indicator", setting: "left" },
    { kind: "glance", mirror: "rear" },
    {
      kind: "drive",
      points: [
        [G.ARM_INNER_X, -101],
        [G.ARM_INNER_X, -70],
        [G.ARM_INNER_X, -45],
      ],
      targetKmh: 35,
      stopAtEnd: false,
    },
    {
      kind: "drive",
      points: [
        [G.ARM_INNER_X, -45],
        [G.ARM_INNER_X, G.HOLD_Y],
      ],
      targetKmh: 14,
    },
    { kind: "glance", mirror: "left" },
    { kind: "pause", sec: G.WAIT_SEC, brake: true },
    {
      kind: "drive",
      points: [[G.ARM_INNER_X, G.HOLD_Y], [5.5, -30], [7.5, -26], ring(30, G.LANE_INNER_R), ring(40, G.LANE_INNER_R)],
      targetKmh: 15,
      stopAtEnd: false,
    },
    { kind: "drive", points: inner, targetKmh: ringKmh, stopAtEnd: false },
    { kind: "indicator", setting: "right" },
    { kind: "glance", mirror: "right" },
    { kind: "drive", points: [ring(180, G.LANE_INNER_R), ...slow], targetKmh: ringKmh, stopAtEnd: fast.length === 0 },
  ];
  if (fast.length > 0) steps.push({ kind: "drive", points: [slow[slow.length - 1], ...fast], targetKmh: 20 });
  steps.push({ kind: "indicator", setting: "off" }, { kind: "pause", sec: 1.5, brake: true });
  return { steps };
}
