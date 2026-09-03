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
 * WHAT THIS FILE ADDS, and it is deliberately the two halves the row names
 * that can be built without inventing a physics or damage model:
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
 * WHAT IS NOT BUILT, named rather than implied: the SHAKE and the DAMAGE the
 * row also asks for. A shake belongs to the camera itself (`CameraRig`, which
 * every lesson and both other POVs share) and damage needs a deformation or
 * swap model this fleet has none of; neither is a lane-sized change and both
 * would have to be measured, not merely added. The row's blank frame is closed
 * by the cut; the two remaining asks are named in the agent report.
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

/** What `LessonScene.handleCollision` calls. Filled by the component on mount. */
export interface ImpactCutHandle {
  /** A graded contact just landed, at this closing speed (km/h). */
  impact(impactKmh: number): void;
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
      }
      const from = cameraModeRef.current;
      const next = impactCutView(from, impactKmh, restoreToRef.current !== null, manoeuvring);
      if (next === null) return;
      restoreToRef.current = from;
      applyCameraMode(next);
    },
    [applyCameraMode, cameraModeRef, manoeuvring],
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
