/**
 * THE MINI RING — the lines every demo on rb-mini-v1 and rb-ped-v1 is cut from
 * (catalogue-demo-curvature:dae908c7, family curvring). Five lessons share one
 * single-lane ring (centreline R = 18 about (0, 0), counter-clockwise; arms
 * with one 8.125 m lane each way, lane centre 4.06 m right of the axis), so
 * they share ONE entry curve and ONE exit curve, authored once here with the
 * kit in ./ringDrive and proven drivable in
 * traces/__tests__/ring-demos-drivable.test.ts.
 *
 * WHERE THE CAR WAITS. The give-way bar (М8) of every mouth of these rings is
 * painted 35.725 m from the centre (asserted against the district's own paint
 * in the drivability test). A demo that yields stops with its NOSE 0.8 m short
 * of that bar — where the product draws the student's own «Карай до линията за
 * пропускане» gate (scene/guidanceRoute.ts THROUGH_GATE_BEFORE_LINE_M) — so the
 * ghost stands where the student is told to stand: MINI_BAR_STOP_Y. Until
 * 2026-10-11 the demos rolled 11 m past the bar and waited at y = −27.5, 3.6 m
 * from the ring's edge, under the caption «Спри на линията».
 *
 * THE ENTRY (`MINI_ENTRY`). Straight on from the stop, a right turn on a 10 m
 * body-centre radius (wound on and off over 4 m), a short straight chord, and
 * the wheel wound left over 6 m onto the ring's own curvature: the car is ON
 * the ring's centreline at φ = 55°. It is the «flat chord» the family has
 * always entered by — a nearly straight north-east line rather than a hook
 * round the island — with the corners taken out: 44.5° of right turn in all,
 * under the turn detector's 55° (an entry is not a signalled turn), and never
 * closer than 1.5 m to the mouth's kerb.
 *
 * THE EXIT (`miniExit`). The wheel comes off the ring's curvature 50° of ring
 * before the exit road's axis (north exit: φ = 130°), a 1.4 m chord, and a
 * right turn on a 9 m radius (wound over 3 m) that ends ON the outbound lane's
 * centre, 26 m from the ring's centre — straight, with a metre to spare, where
 * sc-rb-ped-exit stops in its pocket. It passes 1.3 m from the «exit approach»
 * gate the lessons stand 20° before the mouth and 2.1 m inside the mouth's kerb.
 *
 * THE MARGIN. The tightest radius any demo cut from this file asks for is
 * MINI_SNAP_EXIT's 6.5 m (the «рязък завой» of the two no-signal mistake
 * demos; sc-rb-circulate-priority's wandering line turns 6.35 m on its own
 * programme); the correct drives' tightest is the exit's 9 m, and
 * MINI_ENTRY_FROM_MOUTH's 8 m for sc-rb-busy-gap. The product car's limit is
 * 3.955 m (kinematic) and ≈ 4.17 m (physics, walking pace); the floor every
 * drivable demo is held to is 4.6 m (the curvdepth family's
 * DRIVABLE_MIN_CENTRE_RADIUS_M): the mistakes keep ≥ 38 % over it, the
 * correct drives ≥ 74 %.
 */

import { CHASSIS_HALF_EXTENTS } from "../vehicle";
import {
  RingPathBuilder,
  type RingEntryOptions,
  type RingExitOptions,
} from "./ringDrive";

/** Ring centreline radius (rb-mini-v1 / rb-ped-v1 meta.scenario.params). */
export const MINI_R = 18;
/** Arm right-lane centre: the south arm northbound, the north arm outbound. */
export const MINI_LANE_X = 4.06;
/** The south spawn (rbm-spawn-south / rbp-spawn-south). */
export const MINI_SPAWN_Y = -93;
/** The М8 give-way bar across the south arm — the district's own paint. */
export const MINI_GIVE_WAY_BAR_Y = -35.725;
/** How far short of the bar the nose stops: the product's own gate offset. */
export const STOP_NOSE_BEFORE_BAR_M = 0.8;
/** Where a yielding demo's centre rests: nose 0.8 m short of the bar. */
export const MINI_BAR_STOP_Y = MINI_GIVE_WAY_BAR_Y - STOP_NOSE_BEFORE_BAR_M - CHASSIS_HALF_EXTENTS.z;

/** Azimuth at which the entry is ON the ring's centreline. */
export const MINI_ENTRY_LAND_PHI_DEG = 55;

/** The family's entry curve (see the header). */
export const MINI_ENTRY: Omit<RingEntryOptions, "from"> = {
  ringR: MINI_R,
  landPhiDeg: MINI_ENTRY_LAND_PHI_DEG,
  turnRadiusM: 10,
  rampInM: 4,
  rampOutM: 4,
  joinRampM: 6,
};

/**
 * The same landing from a car already standing INSIDE the mouth (sc-rb-busy-gap
 * grades its halt in a 3 m disc at y = −26): 11 m less run-up, so the turn is
 * on an 8 m radius.
 */
export const MINI_ENTRY_FROM_MOUTH: Omit<RingEntryOptions, "from"> = {
  ...MINI_ENTRY,
  turnRadiusM: 8,
};

export type MiniExitArm = "north" | "west";
const EXIT_AXIS: Record<MiniExitArm, { phiDeg: number; headingDeg: number }> = {
  north: { phiDeg: 180, headingDeg: 0 },
  west: { phiDeg: 270, headingDeg: 270 },
};
/** How much ring before the exit road's axis the wheel starts to come off. */
export const MINI_EXIT_PEEL_LEAD_DEG = 50;

/** The family's exit curve onto the named arm's outbound lane (see the header). */
export function miniExit(arm: MiniExitArm): Omit<RingExitOptions, "ringR"> {
  const axis = EXIT_AXIS[arm];
  return {
    peelPhiDeg: axis.phiDeg - MINI_EXIT_PEEL_LEAD_DEG,
    exitHeadingDeg: axis.headingDeg,
    laneOffsetM: MINI_LANE_X,
    turnRadiusM: 9,
    rampInM: 3,
    rampOutM: 3,
    joinRampM: 6,
  };
}

/**
 * THE SNAP EXIT of the two «изход без мигач» mistake demos — late and sharp.
 *
 * WHY IT IS SHAPED LIKE THIS. The product calls a manoeuvre a turn when the
 * direction of travel changes by more than 55° inside 3 s (runtime/turns.ts);
 * that, with no indicator, is the graded fault of these demos. The family's
 * own exit turns 49.5° — a driver who leaves the ring on that line is not seen
 * to turn at all. The old demo got its 60° from three corners (20.7° + 24.3° +
 * 15°), i.e. from pivoting on the spot. A car can only turn that far that late
 * by using the road it has: it holds the ring 20° longer than the correct
 * drive (peel 30° before the axis), swings 64.8° on a 6.5 m radius, and comes
 * out of the turn in the LEFT half of its own 8.125 m lane — 1.6 m from the
 * arm's axis instead of 4.06 — before it eases back to the lane's centre. The
 * turn itself is 9.4 m: 2.4 s at the demo's 14 км/ч.
 */
export const MINI_SNAP_PEEL_LEAD_DEG = 30;
export const MINI_SNAP_LAND_OFFSET_M = 1.6;
export const MINI_SNAP_TURN_RADIUS_M = 6.5;
export function miniSnapExit(arm: MiniExitArm): Omit<RingExitOptions, "ringR"> {
  const axis = EXIT_AXIS[arm];
  return {
    peelPhiDeg: axis.phiDeg - MINI_SNAP_PEEL_LEAD_DEG,
    exitHeadingDeg: axis.headingDeg,
    laneOffsetM: MINI_SNAP_LAND_OFFSET_M,
    turnRadiusM: MINI_SNAP_TURN_RADIUS_M,
    rampInM: 2,
    rampOutM: 2,
    joinRampM: 3,
  };
}

/** A fresh path at the south spawn, headed north. */
export function miniPathFromSpawn(): RingPathBuilder {
  return new RingPathBuilder({ x: MINI_LANE_X, y: MINI_SPAWN_Y, headingDeg: 0 });
}
