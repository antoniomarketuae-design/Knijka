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
import { memo } from "react";
import type {
  LessonSpec,
  NearMissEvent,
  NearMissStats,
  StagedEventOutcome,
} from "@/modules/sim/lessons";
import type { DashboardStatus, MinimapFrame } from "@/modules/sim/hud";
import type { PreDriveStepId } from "@/modules/sim/procedures";
import type { SimTick } from "@/modules/sim/rules";
import type { LiveTraceRecorder } from "@/modules/sim/traces";
import type { ReverseStuckDirection, StuckStartReason } from "@/modules/sim/engine";
import type {
  DrivelineRejection,
  DrivelineSnapshot,
  SelectorPosition,
  TransmissionMode,
} from "@/modules/sim/vehicle";
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
  /** A rejected driveline action (start interlock / selector gate) + a fresh
   *  snapshot — the shell explains WHY via a HUD hint and flashes the gear
   *  telltale (refusals must never be silent — founder bug 2026-07-10). */
  onDrivelineRejection?: (rejection: DrivelineRejection, snap: DrivelineSnapshot) => void;
  /** The pedal-remap guard (engine/reverseAssist.ts LAW 2) has been refusing
   *  a held pedal long enough to be confusion — the shell says WHY the car
   *  will not move and how to free it. Same reason as the line above: a
   *  silently refused input is a bare verdict, which THEO-4 forbids. */
  onReversePedalStuck?: (direction: ReverseStuckDirection) => void;
  /** Nothing GUARDED the pedal — the car itself cannot move (engine off,
   *  selector P/N, parking brake on) and the throttle has been down at a
   *  standstill long enough to be confusion (engine/stuckStart.ts). The QW10
   *  hint says this already, but only in the pre-drive phase, which no
   *  compiled scenario rung has. */
  onStuckStart?: (reason: StuckStartReason) => void;
  /** The TIER PILL moved the student's own gear lever. `switchTransmission`
   *  (vehicle/driveline.ts) puts a standing car into N on the way into
   *  „Напреднал" — first gear with the clutch up is a stall by definition —
   *  and did it silently until 2026-08-11. Fired only when the lever really
   *  moved, so a tier click that changes nothing stays quiet. */
  onTransmissionChanged?: (
    transmission: TransmissionMode,
    movedSelectorTo: SelectorPosition,
  ) => void;
  /** The mouse pedals yielded to the keyboard and left the screen, on a
   *  student who had been holding them (lesson-ui/MousePedals.tsx). Once per
   *  session — the shell says it and how to bring them back. */
  onMousePedalsYielded?: () => void;
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
  /** S1 (additive): the shell's live attempt recorder (scenario sessions) —
   *  the scene streams the student's 20 Hz kinematics + glance/signal/
   *  driveline events into it; absent = recording off (default). */
  attemptRecorderRef?: React.RefObject<LiveTraceRecorder | null>;
  /** Status-dashboard channel (additive): the scene MUTATES this shared
   *  object once per frame from the live cabin/driveline/sample state; the
   *  shell's StatusDashboard bar samples it on a low-Hz interval (see
   *  hud/dashboardStatus.ts). Absent = no writes (bar shows cold defaults). */
  dashboardStatusRef?: React.RefObject<DashboardStatus>;
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

/**
 * §I22 / §D12e — THE HUD TICK MUST NOT REACH THE CANVAS.
 *
 * THE MEASUREMENT THIS EXISTS FOR (doc 91 §D12e, re-measured on production in
 * §N4): **29.4 React commits a second while driving — 18.05 on the DOM root
 * and 11.3 on R3F's own reconciler** — with thirty component types doing work
 * in every commit, `StaticWorld`, `TrafficLayer`, `HeroCarBody`, `VehicleRig`,
 * `CabinRoof` and `RouteGuidance` among them. And they do not stop when the
 * world does: 13.4 + 6.7 per second with a teach card up and physics frozen.
 *
 * WHY IT HAPPENS. `LessonPlayShell` polls the session every `HUD_POLL_MS`
 * (150 ms) and `snapshotOf()` returns a FRESH OBJECT every tick, so `setSnap`
 * always changes identity and the whole shell re-renders — and the shell
 * renders `SceneSlot` → `LessonScene` → the entire R3F tree, which was not
 * memoized against it. A speedometer that ticks six times a second was
 * re-rendering a driving simulator.
 *
 * WHY `memo` HERE IS THE RIGHT SHAPE, and doc 91 §I22 names it as option (b):
 * every prop this component takes is a primitive, a stable `useCallback`, or a
 * ref object. `driveLocked`, `preDriveHighlightStepId` and
 * `activeObjectiveIndex` are read off `snap`, but they are a boolean, a step id
 * and an integer — they change when the LESSON changes, not when the speedo
 * does. So a shallow compare passes on a HUD tick and fails on everything that
 * genuinely has to reach the scene. **It cannot drop an update: `memo` compares
 * every prop, so a prop that changed still re-renders.** The worst case if a
 * callback identity is ever destabilised upstream is that we are back to
 * today's behaviour, not a stale scene.
 *
 * WHAT IT DOES NOT FIX, STATED PLAINLY: the DOM-root commits. Those are a live
 * speed readout, a live objective progress bar and a live vehicle position for
 * the minimap — `HudSnapshot` carries `speedKmh`, `objectiveProgress` and
 * `vehicle`, all of which genuinely change every tick, so no equality guard can
 * take them to zero while the numbers are on screen. **What was pure waste is
 * the R3F half, and that is what this removes.** Option (a) — moving `snap` to
 * `useSyncExternalStore` so only the leaves that read it re-render — is still
 * the right long-term shape and is deliberately NOT smuggled in here.
 *
 * §M5 SAID "DO NOT ATTEMPT THIS UNTIL THE FURTHER UPDATE SOURCES ARE
 * ENUMERATED", and they now are — eight independent pollers, not the two the
 * audit knew about:
 *   `LessonPlayShell.tsx:1998` HUD_POLL_MS 150 — **unguarded, fresh object**
 *   `LessonPlayShell.tsx:1431` HUD_POLL_MS 150 — key-guarded (armed telltales)
 *   `LessonPlayShell.tsx:1976` PRACTICE_HINT_POLL_MS 2000 — pre-drive only
 *   `TouchControls.tsx:1159`   CABIN_POLL_MS 250 — `sameSnap` guarded
 *   `StatusDashboard.tsx:370`  DASHBOARD_POLL_MS — hash-guarded, but the hash
 *                              contains the SPEED, so it commits while moving
 *   `TelltaleEdgePings.tsx:59` — key-guarded
 *   `RearProximityCue.tsx:93`  — folded through `stepRearCue`
 *   `CameraAidHint.tsx:96,134` · `PreDriveChecklist.tsx:127` — phase/measure
 * Six of the eight already use the `prev === next ? prev : next` idiom. The one
 * that does not is the one that renders the canvas, which is this row.
 */
export const SceneSlot = memo(function SceneSlot(props: SceneSlotProps) {
  return <LessonScene {...props} />;
});
