"use client";

/**
 * SceneSlot — THE 3D MOUNT POINT. This placeholder is the ONLY component the
 * integrator replaces when wiring the real Three.js/R3F scene; everything
 * around it (HUD, lesson engine, persistence, select screen) is finished and
 * must keep working unchanged.
 *
 * ======================= INTEGRATOR CONTRACT =======================
 * Replace the body of <SceneSlot> (keep the props signature!) with the real
 * scene. The real implementation MUST:
 *
 * 1. Load the 3D stack client-side only (next/dynamic, ssr:false — see the
 *    existing src/components/sim/SimulatorApp.tsx for the pattern; rapier
 *    wasm must never run during SSR/build).
 * 2. Spawn the vehicle at `lesson.spawn` (pointId → district-v1.json
 *    spawnPoints; or the explicit position/headingDeg fallback).
 * 3. Create the WorldRuntime (contracts.ts) for district-v1.json and, once
 *    per rendered frame:
 *      - runtime.update(dt)
 *      - const tick = runtime.sample(vehicleSample, tSec, isNight)
 *      - onTick(tick)               // feeds rules + objectives + HUD
 *    `tSec` is seconds since session start, monotonic (SimTick contract).
 * 4. Pre-drive phase (lesson.preDrive) — the A2 performed contract:
 *      - OBSERVE the real vehicle transitions (driveline.subscribe, cabin
 *        state polls, glances, raw pedals) and resolve them to steps via
 *        procedures/performedSteps.ts, reporting each via onPreDriveStep —
 *        performable steps NEVER complete from clicks; only the checklist's
 *        info steps confirm through the shell.
 *      - While `driveLocked`, zero the drive inputs into the physics; a
 *        throttle press while the driveline is genuinely ready to move off
 *        IS the "move-off" step (it completes the procedure and unlocks the
 *        gate), an earlier press reports onBlockedDriveAttempt (the shell
 *        rate-limits the explanation).
 *      - In instruction mode, pulse the cockpit hotspot(s) named by
 *        `preDriveHighlightStepId` (doc-69 names, hotspotsForStep map).
 * 5. Feed the minimap a few times per second (NOT per frame):
 *    onMinimapFrame({ polylines, transform }) using the runtime's minimap
 *    builder (hud/Minimap.tsx documents the projection).
 * 6. Respect `paused` (freeze physics + input) and `quality` (environment
 *    preset). Ignore input after the shell stops passing onTick? No — the
 *    shell keeps accepting ticks and ignores them itself once the session is
 *    completed/aborted; the scene may simply keep rendering.
 * 7. Show "© OpenStreetMap contributors" INSIDE the 3D viewport or leave the
 *    shell's attribution footer visible (ODbL — district-v1.json meta).
 * ====================================================================
 */

import dynamic from "next/dynamic";
import type {
  LessonSpec,
  NearMissEvent,
  NearMissStats,
  StagedEventOutcome,
} from "@/modules/sim/lessons";
import type { MinimapFrame } from "@/modules/sim/hud";
import type { PreDriveStepId } from "@/modules/sim/procedures";
import type { SimTick } from "@/modules/sim/rules";
import type { DrivelineSnapshot } from "@/modules/sim/vehicle";
import type { QualityPreset } from "./types";

export interface SceneSlotProps {
  lesson: LessonSpec;
  quality: QualityPreset;
  paused: boolean;
  /** QW10: true while the lesson is in the pre-drive phase — the scene must
   *  keep the vehicle stationary (zero throttle/brake into the physics). */
  driveLocked: boolean;
  /** A2 instruction mode: the pending procedure step whose cockpit hotspot(s)
   *  should pulse, or null (practice/assess/driving — no highlights). */
  preDriveHighlightStepId: PreDriveStepId | null;
  /** A7 route guidance: 0-based index of the ACTIVE objective from the lesson
   *  engine (≥ objectives.length once all are done). The scene renders the
   *  in-world ghost route / turn arrows / objective marker from it. */
  activeObjectiveIndex: number;
  /** Authoritative frame feed → lesson engine (rules + objectives + HUD). */
  onTick: (tick: SimTick) => void;
  /** A2: a pre-drive step was PERFORMED on a real control — the scene's
   *  transition observer resolved it (procedures/performedSteps.ts). */
  onPreDriveStep: (stepId: PreDriveStepId, tSec: number) => void;
  /** QW10: throttle pressed while driveLocked — the shell shows the
   *  "завърши подготовката" explanation (rate-limited there). */
  onBlockedDriveAttempt: () => void;
  /** Low-frequency minimap data → HUD minimap. */
  onMinimapFrame: (frame: MinimapFrame) => void;
  /** A1: low-frequency driveline state (ignition/selector/parking brake/
   *  hazards/…) → HUD telltales (GearIndicatorCard). */
  onDriveline?: (snap: DrivelineSnapshot) => void;
  /** P1: shell-owned fullscreen toggle (QW1 — the shell root is the
   *  fullscreen element) so the scene's touch overlay can offer ⛶. */
  onToggleFullscreen?: () => void;
  /** A8 (additive): a staged encounter resolved — the measurement record
   *  (reaction time, stop gap, …). The shell folds it via applyStagedOutcome
   *  so A10's objective locks + A15's end-screen readouts see it. */
  onStagedOutcome?: (outcome: StagedEventOutcome) => void;
  /** A11→A15 (additive): a near-miss encounter resolved — session stat only,
   *  never graded; the shell records it for the end-screen mistake map. */
  onNearMiss?: (event: NearMissEvent, stats: NearMissStats) => void;
}

// The heavy Three.js/rapier bundle loads client-side only (rapier wasm must
// never run during SSR/build). The select screen stays 3D-free upstream.
const LessonScene = dynamic(() => import("../LessonScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3 text-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="text-sm">Зареждане на симулатора…</p>
      </div>
    </div>
  ),
});

export function SceneSlot(props: SceneSlotProps) {
  return <LessonScene {...props} />;
}
