/**
 * THE LEE OF A TALL VEHICLE — how much of the crosswind reaches the student's
 * car, as a function of where the car is beside a body that blocks it.
 *
 * WHY THIS FILE EXISTS — `sc-ac-wind-truck-pass:ff1d4290`, the restage of
 * 2026-10-08 (the founder's delegation of that date; the integrator's
 * decision: «restage the truck-pass crosswind lesson so the truck can really
 * be passed and its lee reached»). The lesson's whole subject is a transition:
 * beside a truck you are sheltered, and as you clear its cab the wind is back
 * at once. Until now the wind had no position term at all (`VehicleSim` added
 * the same `currentWindN()` on every step from t = 0), so the briefing had to
 * tell the student that «завет няма».
 *
 * ONE DEFINITION OF THE WIND, AND THE SHELTER MULTIPLIES IT. ADR-012 is
 * unchanged: the force is `lessonWind.ts crosswindForceAtN` and the pull is
 * `crosswindPull.ts crosswindSteerPullRad` of that force. This module returns
 * a FACTOR in [`WIND_SHELTER_RESIDUAL`, 1] which `VehicleSim.currentWindN()`
 * multiplies the force by — so the chassis force, the yaw pull, the head lean
 * (`windLatAccelMs2`), the gust instrument and the drawn air
 * (`windLateralNow`) all read the sheltered number, because they all already
 * read that one getter.
 *
 * THE GEOMETRY (district space; the wind blows along ±X, `windSignX` is the
 * sign of its force):
 *
 *      wind →            ┌───────────┐
 *   (force +X)           │   body    │→ heading          LEE: downwind of the
 *                        └───────────┘                    body's flank, and in
 *            ░░ wake ░░▓▓▓▓▓▓▓ lee ▓▓▓▓▓▒ ← one car      its wake behind it
 *                                          length
 *
 *  · ALONG THE BODY (`a`, metres ahead of the body's centre on its heading):
 *    the car is sheltered by the share of its own LENGTH that is still behind
 *    the body's nose — full shelter while the car's nose is behind the body's,
 *    none once the car's tail has passed it. So the wind returns over exactly
 *    one car length of relative travel past the cab (`CHASSIS` 4.04 m): at a
 *    30 км/ч closing speed that is half a second. Behind the body the same
 *    rule runs off the end of its WAKE, `WIND_SHELTER_WAKE_M` behind its tail
 *    — the dead air a moving box drags after it.
 *  · ACROSS THE WIND (`e`, metres DOWNWIND of the body's centre line): full
 *    shelter from the body's own line out to `WIND_SHELTER_REACH_M` to
 *    leeward, fading to none over `WIND_SHELTER_FADE_M` more; none to
 *    windward of the body (fading over `WIND_SHELTER_WINDWARD_FADE_M` from its
 *    windward flank). A car directly behind the body, in its lane, is in the
 *    wake; a car beside it on the WINDWARD side is in the open wind.
 *
 * THE NUMBERS, and where they come from:
 *  · `WIND_SHELTER_RESIDUAL` 0.30 — beside a box body the wind is not gone:
 *    it comes under the chassis and curls round the ends. 30 % of the open
 *    force is 210–510 N across the shipped 700–1700 N gust envelope, which is
 *    ABOVE the gust chip's side dead band (0.15 m/s² × 1220 kg = 183 N,
 *    `LessonScene` `WIND_PUSH_SIDE_DEADBAND_MS2`) on every sample — so the chip
 *    keeps naming the side the air takes the car in the lee and does not blink
 *    off and on at each trough.
 *  · `WIND_SHELTER_REACH_M` 12, `WIND_SHELTER_FADE_M` 4 — the lee of a bluff
 *    body runs some three to four of its heights downwind; the box rig is
 *    about 3.4 m tall. mw-v1's lanes are 8.12 m apart (the product's road
 *    scale), so the whole overtaking lane beside the truck (its far edge is
 *    12.2 m from the truck's line) is in the lee and the median verge is not.
 *  · `WIND_SHELTER_WAKE_M` 13 — the dead air the box drags behind it, and
 *    SHORTER THAN THE NEAREST A CAR MAY FOLLOW IT WITHOUT BEING BILLED. The
 *    rule engine bills FOLLOWING_TOO_CLOSE under `followFireRatio` of the
 *    `followSafeSeconds` gap (0.7 × 1.8 s = 1.26 s of the follower's own
 *    speed, `rules/types.ts`), which behind the one truck that carries a lee
 *    — 40 км/ч, sc-ac-wind-truck-pass — is 14.0 m between the bumpers. The
 *    shelter begins on the frame the car's NOSE crosses the wake's end, so at
 *    every gap the product does not call too close the factor is exactly 1.
 *    ONE METRE UNDER THE LINE, NOT ON IT: the wind is stepped with the
 *    physics and the following gap is read with the traffic, a frame apart,
 *    and the truck moves 0.19 m in a 60 Hz frame (measured on the live stack:
 *    with the wake AT 14.0 a car the engine read at 14.18 m had 0.01 % of a
 *    lee). A metre is that offset down to about 11 frames a second. (It was 15
 *    in round 1: its verifier, F-05, followed at 14.27 m with 13 % of a lee
 *    and no card. `vehicle/` may not import the rule config, so
 *    `lessons/scenario/__tests__/wind-truck-pass-restage.test.ts` derives the
 *    14.0 from the engine's own numbers and holds this constant under it.)
 *
 * SCOPE. The factor is exactly 1 with no body, and `VehicleSim` multiplies by
 * it only when a caller has set one (`setWindShelterFactor`); the scene sets
 * one only on a lesson that authors `physics.crosswind` AND stages an actor
 * with `windShelter: true` (`lessonWindShelterActorIds`). Every other lesson
 * never reaches this file.
 *
 * PURE, TOTAL, NO PHYSICS. No rapier, no clock, no React, no lesson contracts
 * (structural types only — `vehicle/` may not import the layers that import
 * it).
 */

import { CHASSIS_HALF_EXTENTS } from "./tuning";

/** Share of the open wind's force that still reaches a car in the full lee. */
export const WIND_SHELTER_RESIDUAL = 0.3;
/** Full shelter out to this far downwind of the body's centre line, m. */
export const WIND_SHELTER_REACH_M = 12;
/** …fading to none over this much more, m. */
export const WIND_SHELTER_FADE_M = 4;
/** The wake behind the body's tail that is still sheltered, m. */
export const WIND_SHELTER_WAKE_M = 13;
/** To windward of the body's windward flank the shelter fades out over this, m. */
export const WIND_SHELTER_WINDWARD_FADE_M = 1;
/** The student's car, nose to tail, m — the length the wind returns over. */
export const WIND_SHELTER_CAR_LENGTH_M = 2 * CHASSIS_HALF_EXTENTS.z;

/** A body that blocks the wind, district space. */
export interface WindShelterBody {
  x: number;
  y: number;
  /** Its heading as a direction (need not be unit length). */
  dirX: number;
  dirY: number;
  halfLengthM: number;
  halfWidthM: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * How deep in the body's lee the car is: 0 = open wind, 1 = the full lee.
 * `windSignX` is the sign of the wind's force along district +X (−1 = it blows
 * west, the shipped lessons' wind); 0 = no wind, no lee.
 */
export function windShelterDepth(carX: number, carY: number, body: WindShelterBody, windSignX: number): number {
  if (windSignX === 0) return 0;
  const dLen = Math.hypot(body.dirX, body.dirY);
  if (!(dLen > 0)) return 0;
  const dx = body.dirX / dLen;
  const dy = body.dirY / dLen;
  // The wind blows along ±X. A body travelling along the wind (|dy| small)
  // presents its end to it, not its flank: there is no crosswind lee to speak
  // of, and every lesson that stages one runs it across the wind.
  const across = Math.abs(dy);
  if (across < 0.5) return 0;

  const rx = carX - body.x;
  const ry = carY - body.y;
  // Ahead of the body's centre on its own heading.
  const a = rx * dx + ry * dy;
  // Downwind of the body's centre line (perpendicular to its heading, toward
  // the side the wind's force points to).
  const right = rx * dy - ry * dx; // + = to the body's right
  const windToRight = windSignX * dy; // + = the wind blows toward the body's right
  const e = windToRight >= 0 ? right : -right;

  const halfCar = WIND_SHELTER_CAR_LENGTH_M / 2;
  // The share of the car's length behind the body's nose…
  const behindNose = clamp01((body.halfLengthM - (a - halfCar)) / WIND_SHELTER_CAR_LENGTH_M);
  // …and ahead of the end of its wake.
  const wakeEnd = -body.halfLengthM - WIND_SHELTER_WAKE_M;
  const aheadOfWakeEnd = clamp01((a + halfCar - wakeEnd) / WIND_SHELTER_CAR_LENGTH_M);
  const along = Math.min(behindNose, aheadOfWakeEnd);
  if (along <= 0) return 0;

  let lateral: number;
  if (e >= -body.halfWidthM) {
    lateral = clamp01((WIND_SHELTER_REACH_M + WIND_SHELTER_FADE_M - e) / WIND_SHELTER_FADE_M);
  } else {
    lateral = clamp01((e + body.halfWidthM + WIND_SHELTER_WINDWARD_FADE_M) / WIND_SHELTER_WINDWARD_FADE_M);
  }
  return along * lateral * across;
}

/**
 * THE RIG'S OWN STEP — hand this physics step's lee to the sim, from where the
 * chassis is. The ONE function `components/sim/VehicleRig.tsx` calls for it,
 * inside `useBeforePhysicsStep` and before `sim.update` reads the wind, and
 * the one the live-wind harness calls in its place
 * (`lessons/scenario/__tests__/liveWindDrive.ts`).
 *
 * WHY IT IS A FUNCTION AND NOT THREE LINES IN THE COMPONENT (round 2, the
 * round-1 verifier's F-02). It was three lines in `VehicleRig`, and the
 * harness had its own copy of them — so a rig that worked the factor out and
 * never handed it to the sim (mutant V4) left the browser with no lee at all
 * and every test green. A component cannot be executed under vitest here; a
 * function can. `vehicle/windShelter.test.ts` runs this one against the real
 * `VehicleSim`, and `vehicle/lessonWind.test.ts` holds the component's source
 * to calling it, in that place.
 *
 * `translation` is the chassis body's rapier translation (three.js space);
 * the lee is asked in district space — x = world x, y = −world z, the mapping
 * `scene/vehicleSample.ts` publishes the pose with. Returns the factor it set,
 * or `null` when there is nothing to set (no sheltering vehicle on this
 * lesson, or no body yet) — and then the sim is NOT touched, which is what
 * keeps a lesson without a lee bit-identical.
 */
export function stepRigWindShelter(
  sim: { setWindShelterFactor(factor: number): void },
  shelterAt: ((x: number, y: number) => number) | null | undefined,
  translation: { x: number; z: number } | null | undefined,
): number | null {
  if (!shelterAt || !translation) return null;
  const factor = shelterAt(translation.x, -translation.z);
  sim.setWindShelterFactor(factor);
  return factor;
}

/**
 * THE RIG'S LEE, HELD ACROSS RENDERS — what `components/sim/VehicleRig.tsx`
 * keeps for the life of the component (round 3, the round-2 verifier's
 * F2-03(a)).
 *
 * WHAT WAS FOUND. The rig copied its `windShelterAt` prop into a ref from an
 * effect; given an EMPTY dependency list that effect runs once, the rig keeps
 * the first lesson's shelter function for as long as it is mounted, and every
 * test was green (29/29) — nothing executed the copy. So the copy is this
 * object's `follow`, called on EVERY render of the rig (no dependency list to
 * get wrong), and the physics callback calls its `step` — both executed
 * against the real `VehicleSim` in `vehicle/windShelter.test.ts`, the call
 * sites held by `vehicle/lessonWind.test.ts`.
 *
 * …AND A LEE THAT GOES AWAY IS GIVEN BACK. The sim outlives a change of the
 * function when the wind's scalars do not change (its effect is keyed on them
 * alone), so a factor set beside one lesson's truck would otherwise stay on it
 * after the function became `null`. `step` puts the sim back in the open
 * wind ONCE in that case — and only in that case: a rig that never set a
 * factor never touches the sim (the bit-identity of every lesson without a lee).
 */
export interface RigWindShelter {
  /** Follow the scene's CURRENT shelter function — call on every render. */
  follow(shelterAt: ((x: number, y: number) => number) | null | undefined): void;
  /** This physics step: `stepRigWindShelter` with the function last followed;
   *  returns the factor set, or `null` when the sim was not touched. */
  step(
    sim: { setWindShelterFactor(factor: number): void },
    translation: { x: number; z: number } | null | undefined,
  ): number | null;
}

export function createRigWindShelter(): RigWindShelter {
  let current: ((x: number, y: number) => number) | null = null;
  let leeSet = false;
  return {
    follow(shelterAt) {
      current = shelterAt ?? null;
    },
    step(sim, translation) {
      if (current !== null) {
        const set = stepRigWindShelter(sim, current, translation);
        if (set !== null) leeSet = true;
        return set;
      }
      if (leeSet) {
        sim.setWindShelterFactor(1);
        leeSet = false;
        return 1;
      }
      return null;
    },
  };
}

/**
 * The factor the wind's force is multiplied by for a car at (carX, carY) among
 * `bodies`: 1 in the open, `WIND_SHELTER_RESIDUAL` in the full lee of any one
 * of them. The deepest lee wins — two walls do not shelter twice.
 */
export function windShelterFactor(
  carX: number,
  carY: number,
  bodies: readonly WindShelterBody[],
  windSignX: number,
): number {
  let depth = 0;
  for (const b of bodies) {
    const d = windShelterDepth(carX, carY, b, windSignX);
    if (d > depth) depth = d;
  }
  return 1 - (1 - WIND_SHELTER_RESIDUAL) * depth;
}
