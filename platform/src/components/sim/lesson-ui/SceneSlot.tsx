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
 * 4. While the shell shows the pre-drive checklist (lesson.preDrive), forward
 *    cockpit interactions (key presses per the checklist key hints and/or
 *    clicks on cockpit hotspots) as onPreDriveStep(stepId, tSec). The shell
 *    also calls the machine when the student clicks the checklist directly —
 *    both paths are valid and idempotent.
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
import type { LessonSpec } from "@/modules/sim/lessons";
import type { MinimapFrame } from "@/modules/sim/hud";
import type { PreDriveStepId } from "@/modules/sim/procedures";
import type { SimTick } from "@/modules/sim/rules";
import type { QualityPreset } from "./types";

export interface SceneSlotProps {
  lesson: LessonSpec;
  quality: QualityPreset;
  paused: boolean;
  /** Authoritative frame feed → lesson engine (rules + objectives + HUD). */
  onTick: (tick: SimTick) => void;
  /** Cockpit interactions during the pre-drive phase. */
  onPreDriveStep: (stepId: PreDriveStepId, tSec: number) => void;
  /** Low-frequency minimap data → HUD minimap. */
  onMinimapFrame: (frame: MinimapFrame) => void;
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
