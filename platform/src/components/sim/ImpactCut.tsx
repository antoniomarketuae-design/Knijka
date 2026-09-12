"use client";

/**
 * ImpactCut — what the student sees at the instant he crashes.
 *
 * sweep161 `sc-hz-brake-dont-swerve:f0023997` (major), verbatim:
 *
 *   „When the reckless drive collides, the camera clips inside the struck
 *    geometry and the entire windscreen becomes a flat, untextured tan
 *    rectangle spanning the full view. There is no impact effect, no shake, no
 *    damage, no exterior cut — just a blank orange wall with the coach still
 *    talking over it. The same failure mode appears in sc-fo-brakelight-chain
 *    pc-wrong t047 as a flat blue slab."
 *
 * MEASURED ON THE CITED FRAMES, because the row's own address was wrong and
 * the mechanism decides where the repair goes.
 * `.audit-frames/sweep161/sc-hz-brake-dont-swerve/pc-wrong/` — the tan quad is
 * already on the glass at 04-t022s (4 км/ч), fills it at 04-t028s (0 км/ч) and
 * is STILL there at 04-t033s (0 км/ч), with the building's storey bands legible
 * above it: the drive left the carriageway on the blind swerve and came to rest
 * against a district FACADE. #D7A06A is nothing this repo authors as a body —
 * `ObstacleWall` paints #8d8a83 and no fleet palette entry is within reach of
 * it — so the row's filed owner (`components/sim/ScenarioObstacles.tsx`) cannot
 * contain the defect: it renders authored scenario obstacles, and the struck
 * body is city scenery. The sibling frame the row cites,
 * `sc-fo-brakelight-chain/pc-wrong/04-t047s.png`, is the same shape against a
 * different body — a lead car's rear glazing at half a metre, with the red
 * bodywork below it.
 *
 * SO THE DEFECT IS NOT IN ANY ONE BODY. At the cockpit eye a car standing flush
 * against ANY large flat panel fills the whole windscreen — 1.35 m from the
 * glass, `COCKPIT_HFOV_RAD` spans ±1.04 m, and every candidate panel is wider
 * than that — and correct physics produces exactly this frame. What was missing
 * is everything that should happen AROUND it: `VehicleRig.onCollisionEnter`
 * ships a `thump()` and a haptic pulse and NOTHING visual, and the view stays
 * in a cockpit whose only content is the thing it just hit. Grepped over
 * `src/` before writing a line of this file: no flash, no shake, no veil, no
 * damage state, no camera response — the audio was the whole of the feedback.
 *
 * WHAT THIS FILE ADDS — three of the four halves the row names, all of them
 * buildable without inventing a physics or damage model:
 *
 *  · THE IMPACT EFFECT — one short flash keyed to the impact, over the play
 *    area. It is the only thing on screen that says a contact HAPPENED at the
 *    moment it happens; the fault toast's own words arrive a beat later.
 *  · THE EXTERIOR CUT — the view switches to CHASE, which is what removes the
 *    blank wall rather than dressing it. From behind the car the student sees
 *    the thing he hit and his own car in it, which is the frame the mistake is
 *    actually legible in, and it is the truthful one: this is what you did.
 *
 * AND IT GIVES THE VIEW BACK. The cut is held only while the car is stopped in
 * the mess it made; the first time he drives away again (`RELEASE_KMH`) the
 * view returns to the seat he chose. If he changed the view himself in between,
 * the restore stands down — `cameraModeRef.current !== "chase"` is the whole
 * test, so a student who reached for C is never overruled by this file.
 *
 * ── THE SHAKE, ADDED 2026-09-12 (the same row, its third ask) ──────────────
 * The paragraph that stood here said the shake was not built, „because a shake
 * belongs to the camera itself (`CameraRig`, which every lesson and both other
 * POVs share)". That is where it now is — and the sentence was right about the
 * risk and wrong about the size. What made it lane-sized was fixing WHICH
 * quantity is allowed to move: ROTATION ONLY. `cam.position` is what the B67
 * founder row is pinned to (`__camProbe.errM` < 0.15 m car-local against
 * COCKPIT_EYE at 145 км/ч), so a positional shake could not be added without
 * re-opening it; a camera-local rotation multiplied in after the pose is
 * written moves nothing that any contract reads. See the block above
 * `IMPACT_SHAKE_MS` for the shape and `CameraRig` for the single application
 * point.
 *
 * WHAT IS STILL NOT BUILT, named rather than implied: the DAMAGE. It needs a
 * deformation or body-swap model this fleet has none of — that is a modelling
 * project, not a lane — and it is the one ask of the four left standing.
 *
 * GATE: `IMPACT_MIN_KMH` = `VehicleRig.COLLISION_MIN_KMH`. Parking drills pass
 * `collisionMinKmh: 0` so that a 2 км/ч cone touch grades — and a student
 * mid-manoeuvre in a bay, who is looking down the side of his own car, must not
 * be thrown into chase for a kerb kiss.
 *
 * ── AND THAT NUMBER SILENCED THE CRASHES IT WAS NEVER AIMED AT ──────────────
 * `sc-turn-left-oncoming:e91c1e01` (major), the same blank-orange-wall frame
 * one lesson over. The ≥ 10 км/ч half of it is what the file above closes; this
 * paragraph is the half that was left, and it is live:
 *
 *  · `compile.ts:1346` writes `collisionMinKmh: 0` for ALL 150 scenario
 *    templates — street drills included, not just the parking family (that
 *    file's own comment calls the „street lessons keep 10" carve-out a thing
 *    „this code has never had"). `VehicleRig.gradedContactMinKmh` re-raises the
 *    floor to 10 for ONE class, the district's drive-over surface, so a kerb
 *    scuff is already not a contact this file ever hears about.
 *  · So on a street lesson a 4 км/ч roll into an oncoming car IS billed:
 *    ПТП, опасна грешка, −10 наказателни точки, изпитът се прекратява
 *    (Наредба № 38, чл. 48, ал. 3). And the second floor here refused the
 *    flash AND the cut for exactly those, leaving the camera inside the struck
 *    body with the coach talking over an orange wall — the row's frame, for the
 *    most severe verdict the product can hand out. Under doc 64 THEO-4 that is
 *    a bare verdict: the moment convicts and shows nothing.
 *
 * SO THE GATE IS NOW WHAT IT ALWAYS MEANT. `handleCollision` is reached ONLY
 * for contacts `VehicleRig` has already graded, so this file re-deciding that
 * question could only ever subtract. Every graded contact flashes. The chase
 * cut keeps the bay carve-out — but expressed as the thing it actually is, a
 * MANOEUVRING drill (`LessonSpec.parkingBay`), rather than as a speed that also
 * catches every slow street crash. A 30 км/ч crash in a bay still cuts.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import type { CameraMode } from "./CameraRig";
import { COLLISION_MIN_KMH } from "./VehicleRig";

/** The street's nudge tolerance. Still the line the CHASE CUT uses inside a
 *  manoeuvring drill (see the GATE note) — never the line for whether a graded
 *  contact is shown at all, which `VehicleRig` has already decided. */
export const IMPACT_MIN_KMH = COLLISION_MIN_KMH;
/** The student is driving again; give him back the view he chose, km/h. */
export const IMPACT_RELEASE_KMH = 5;
/** How long the impact flash lasts, ms (the CSS keyframes below own the shape). */
export const IMPACT_FLASH_MS = 700;
/** Release poll, ms — the RearProximityCue cadence, for the same reason. */
const POLL_MS = 200;

/**
 * ── THE THIRD ASK: THE SHAKE ───────────────────────────────────────────────
 *
 * The row names four things the crash was missing — an impact effect, a shake,
 * damage, an exterior cut. The flash and the cut above closed two of them and
 * the header named the other two rather than implying them. This is the shake,
 * and it is built where the row's own words put it: „no impact effect, no
 * shake" — the two halves of what a body FEELS, as against what the fault card
 * says. Damage stays unbuilt and stays named: it needs a deformation or a
 * body-swap model this fleet does not have, and inventing one is not a lane.
 *
 * WHY IT IS HERE AND APPLIED IN `CameraRig`. The maths is pure and lives beside
 * the rest of the crash response, so the whole moment is one file and one test.
 * The APPLICATION has to be in the rig, because the camera pose is written once
 * a frame inside `useFrame` and a second writer would fight it — but the rig
 * only ever multiplies the offset in, it never decides anything.
 *
 * WHAT IT IS ALLOWED TO TOUCH, measured against the contracts that already pin
 * this camera:
 *  · ROTATION ONLY. `cam.position` is never written, so the B67 probe's
 *    car-local offset (`__camProbe.errM`, contract: < 0.15 m against
 *    COCKPIT_EYE at 145 км/ч) reads exactly what it read before. A positional
 *    shake would have moved that number and re-opened a founder row.
 *  · APPLIED BEFORE THE MIRROR QUADS, which park themselves with
 *    `applyQuaternion(cam.quaternion)` — so the interior mirror and the door
 *    windows ride the jolt with the head instead of swimming across it. Their
 *    RTT cameras are aimed off the CHASSIS quaternion and are untouched: the
 *    glass shakes, what is in the glass does not, which is what a mirror does.
 *  · DETERMINISTIC. No `Math.random()` — the same crash shakes the same way on
 *    every machine, which is the only way a frame of it can ever be judged.
 *
 * AND IT ENDS. The envelope is driven by WALL CLOCK, not by accumulated delta,
 * so `impactShakeOffsetRad` returns null the moment the window is over and the
 * offset is exactly zero rather than nearly zero. That matters because the
 * Canvas runs `frameloop="demand"` while a card is up: a shake that integrated
 * per-frame could be frozen mid-tilt by a pause. `CameraRig` also asks R3F for
 * one frame after the window closes, so even a world that pauses inside it
 * comes back level.
 */
/** How long the impact shake runs, ms — shorter than the flash on purpose: the
 *  jolt is over before the light is, the way a real one is. */
export const IMPACT_SHAKE_MS = 420;
/** Peak head rotation at IMPACT_SHAKE_FULL_KMH and above, radians (~2.3°). */
export const IMPACT_SHAKE_MAX_RAD = 0.04;
/** The closing speed the peak is authored at — the blind-swerve demo's own. */
export const IMPACT_SHAKE_FULL_KMH = 50;
/** Oscillations across the decay window. */
const IMPACT_SHAKE_CYCLES = 3.5;

/** What `LessonScene.handleCollision` calls. Filled by the component on mount. */
export interface ImpactCutHandle {
  /** A graded contact just landed, at this closing speed (km/h). */
  impact(impactKmh: number): void;
}

/** What `CameraRig` fills for this file: the one door to the camera's jolt. */
export interface ImpactShakeHandle {
  /** Start the shake for a contact at this closing speed (km/h). */
  shake(impactKmh: number): void;
}

/** A crash-shake offset in camera-local radians (YXZ, the rig's own order). */
export interface ImpactShakeOffset {
  pitch: number;
  roll: number;
  yaw: number;
}

/**
 * Does this viewer want motion? Read at CALL time, never at module load: a
 * student can change the OS setting mid-session and the next crash must obey
 * it. Wrapped, because `matchMedia` is absent in jsdom-less test envs and
 * throws on a bad query string in some older WebViews.
 */
export function impactShakeReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Peak rotation for this contact, radians. Pure.
 *
 * √ of the speed ratio, not the ratio itself: a graded contact is a ПТП at ANY
 * speed (see the GATE note — `collisionMinKmh: 0` on all 150 templates), so a
 * 5 км/ч roll into an oncoming car must still be FELT, and a linear ramp would
 * hand it a tenth of a degree nobody can see. Zero when the student has asked
 * the OS for no motion, and zero for a speed that is not a number — the same
 * refusal `impactFlashes` makes, for the same reason.
 */
export function impactShakeAmplitudeRad(impactKmh: number, reducedMotion = false): number {
  if (reducedMotion) return 0;
  if (!Number.isFinite(impactKmh)) return 0;
  const ratio = Math.min(Math.abs(impactKmh) / IMPACT_SHAKE_FULL_KMH, 1);
  return IMPACT_SHAKE_MAX_RAD * Math.sqrt(ratio);
}

/**
 * The offset this many ms after the bang, or null for „leave the pose alone".
 * Pure, so the whole shape is testable without a renderer.
 *
 * Null outside the window BY VALUE, not by a small number: the last frame of a
 * shake must hand the camera back exactly the pose the rig computed, or a
 * lesson would end a hair off-level with nothing on screen to explain it.
 */
export function impactShakeOffsetRad(
  amplitudeRad: number,
  elapsedMs: number,
): ImpactShakeOffset | null {
  if (!Number.isFinite(amplitudeRad) || amplitudeRad <= 0) return null;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= IMPACT_SHAKE_MS) return null;
  const t = elapsedMs / IMPACT_SHAKE_MS;
  // Quadratic ease-out: hardest at the contact, gone by the end of the window.
  const a = amplitudeRad * (1 - t) * (1 - t);
  const w = IMPACT_SHAKE_CYCLES * 2 * Math.PI * t;
  // Three incommensurate phases so the head does not read as one clean sine —
  // pitch leads (the body is thrown forward), roll and yaw trail it.
  return {
    pitch: a * Math.sin(w),
    roll: a * 0.75 * Math.sin(w * 0.83 + 1.1),
    yaw: a * 0.45 * Math.sin(w * 1.31 + 2.3),
  };
}

/** The pose fields this file reads off the scene's shared per-frame sample. */
export interface ImpactCutPose {
  speedKmh: number;
}

/**
 * Does this contact get a flash? Pure. Every contact that reaches this file has
 * ALREADY been graded by `VehicleRig.onCollisionEnter` — a ПТП on the card, ten
 * наказателни точки, опасна грешка — so the only question left is whether the
 * student is allowed to see the thing he is being convicted of, and the answer
 * to that is yes. The only refusal is a speed that is not a number.
 */
export function impactFlashes(impactKmh: number): boolean {
  return Number.isFinite(impactKmh);
}

/**
 * The view this contact should cut to, or null for „leave the view alone".
 *
 * Null in four cases, each of them a refusal on purpose: the speed is not a
 * number; a cut is already held (a second bang must not overwrite the seat the
 * student is owed back); he is not in the cockpit, where chase and top-down
 * already show the car and the blank-wall frame cannot occur; or this is a
 * MANOEUVRING drill and the contact was a manoeuvring-speed touch — a bay is
 * driven at 2–4 км/ч and `IMPACT_RELEASE_KMH` would hold the cut for the rest
 * of it, so the seat he is parking from stays his. A real crash in a bay, above
 * the street tolerance, still cuts.
 */
export function impactCutView(
  from: CameraMode,
  impactKmh: number,
  held: boolean,
  manoeuvring = false,
): CameraMode | null {
  if (!impactFlashes(impactKmh)) return null;
  if (manoeuvring && Math.abs(impactKmh) < IMPACT_MIN_KMH) return null;
  if (held) return null;
  if (from !== "cockpit") return null;
  return "chase";
}

/**
 * Should a held cut be given back on this sample? Pure, so the release rule is
 * testable without a renderer: the student is moving again under his own power,
 * and he has not already taken the view back himself.
 */
export function impactCutGivesBack(
  current: CameraMode,
  speedKmh: number | null | undefined,
): boolean {
  if (current !== "chase") return false;
  return typeof speedKmh === "number" && Math.abs(speedKmh) > IMPACT_RELEASE_KMH;
}

export function ImpactCut({
  handleRef,
  sampleRef,
  cameraModeRef,
  applyCameraMode,
  shakeRef,
  manoeuvring = false,
}: {
  /** Filled with this component's handle on mount; nulled on unmount. */
  handleRef: RefObject<ImpactCutHandle | null>;
  /** The scene's shared per-frame vehicle sample (read-only here). */
  sampleRef: RefObject<ImpactCutPose | null>;
  /** The live view, CameraRig's own per-frame source of truth (read-only). */
  cameraModeRef: RefObject<CameraMode>;
  /** LessonScene's single writer for the view. */
  applyCameraMode: (next: CameraMode) => void;
  /** The camera's jolt, filled by `CameraRig` inside the Canvas. Optional so a
   *  scene without a rig (and every unit test) still gets the flash and cut. */
  shakeRef?: RefObject<ImpactShakeHandle | null>;
  /** True on a drill driven at manoeuvring speed — a lesson with a graded bay.
   *  Holds the cut back for a touch under the street tolerance; see the GATE. */
  manoeuvring?: boolean;
}) {
  const [flashKey, setFlashKey] = useState(0);
  /** The view to give back, or null while no cut is held. */
  const restoreToRef = useRef<CameraMode | null>(null);
  /** Last flash, ms — a car SCRAPING a body re-enters contact repeatedly, and a
   *  strobe is the one thing worse than no impact effect at all. */
  const lastFlashMsRef = useRef(0);

  const impact = useCallback(
    (impactKmh: number) => {
      if (!impactFlashes(impactKmh)) return;
      const now = Date.now();
      if (now - lastFlashMsRef.current >= IMPACT_FLASH_MS) {
        lastFlashMsRef.current = now;
        // Re-key rather than toggle: a fresh contact after the refractory
        // window must restart it, and a keyed element restarts its animation.
        setFlashKey((k) => k + 1);
        // The jolt shares the flash's refractory window, and for the identical
        // reason: a car SCRAPING a body re-enters contact every few frames, and
        // a head that is re-kicked on each of them is a seizure, not a crash.
        // It rides inside the window rather than beside it so the light and the
        // jolt can never disagree about whether this bang was one bang.
        shakeRef?.current?.shake(impactKmh);
      }
      const from = cameraModeRef.current;
      const next = impactCutView(from, impactKmh, restoreToRef.current !== null, manoeuvring);
      if (next === null) return;
      restoreToRef.current = from;
      applyCameraMode(next);
    },
    [applyCameraMode, cameraModeRef, manoeuvring, shakeRef],
  );

  useEffect(() => {
    handleRef.current = { impact };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, impact]);

  // Give the view back on the first sample that says he is driving again.
  useEffect(() => {
    const id = window.setInterval(() => {
      const back = restoreToRef.current;
      if (back === null) return;
      if (cameraModeRef.current !== "chase") {
        // He reached for the view himself. Nothing is owed any more — and the
        // hold must be dropped, or the NEXT crash would find a cut still held
        // and refuse to cut at all.
        restoreToRef.current = null;
        return;
      }
      if (!impactCutGivesBack(cameraModeRef.current, sampleRef.current?.speedKmh)) {
        return;
      }
      restoreToRef.current = null;
      applyCameraMode(back);
    }, POLL_MS);
    return () => {
      window.clearInterval(id);
      restoreToRef.current = null;
    };
  }, [applyCameraMode, cameraModeRef, sampleRef]);

  // Clear the flash element once its animation is over, so the overlay is not
  // a permanent (transparent) layer over the canvas.
  useEffect(() => {
    if (flashKey === 0) return;
    const id = window.setTimeout(() => setFlashKey(0), IMPACT_FLASH_MS);
    return () => window.clearTimeout(id);
  }, [flashKey]);

  if (flashKey === 0) return null;
  return (
    <>
      <style>{`
        @keyframes sim-impact-flash {
          0%   { opacity: 0.92; }
          12%  { opacity: 0.72; }
          100% { opacity: 0; }
        }
        .sim-impact-flash {
          animation: sim-impact-flash ${IMPACT_FLASH_MS}ms ease-out forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          /* No strobe: one steady, brief scrim that still marks the moment. */
          .sim-impact-flash { animation: none; opacity: 0.45; }
        }
      `}</style>
      <div
        key={flashKey}
        data-hud="impact-flash"
        aria-hidden="true"
        // z-[1]: over the canvas, under every HUD card (z-10 and up) — the
        // fault toast's authored explanation must stay readable THROUGH the
        // impact, since that card is the half of this moment that teaches.
        className="sim-impact-flash pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 45%, rgba(255,244,232,0.96) 0%, rgba(255,138,74,0.72) 38%, rgba(24,10,6,0.9) 100%)",
        }}
      />
    </>
  );
}
