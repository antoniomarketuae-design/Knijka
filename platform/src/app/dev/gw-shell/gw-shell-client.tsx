"use client";

/**
 * Client half of the give-way/roundabout verification harness: the real
 * LessonPlayShell, on any scenario template at any RUNG, or on any authored
 * curriculum lesson, with no-op navigation callbacks.
 *
 *   /dev/gw-shell?scenario=sc-roundabout-entry&level=5
 *   /dev/gw-shell?lesson=l2-intersections
 *
 * Client-only (the shell pulls the 3D stack through SceneSlot's ssr:false
 * dynamic import).
 */

import { useSearchParams } from "next/navigation";
import type { ScenarioLevel } from "@/modules/sim/lessons";
import { compileScenario, lessonById, scenarioById } from "@/modules/sim/lessons";
import { LessonPlayShell } from "@/components/sim/lesson-ui/LessonPlayShell";
import type { QualityPreset } from "@/components/sim/lesson-ui/types";

const noop = () => undefined;

function qualityFrom(value: string | null): QualityPreset {
  return value === "low" || value === "high" ? value : "medium";
}

function levelFrom(value: string | null): ScenarioLevel {
  const n = Number(value ?? "1");
  return ([1, 2, 3, 4, 5] as const).includes(n as ScenarioLevel) ? (n as ScenarioLevel) : 1;
}

export function GwShellClient() {
  const params = useSearchParams();
  const scenarioId = params.get("scenario");
  const spec = scenarioId !== null ? scenarioById(scenarioId) : undefined;
  const lesson =
    spec !== undefined
      ? compileScenario(spec, levelFrom(params.get("level")))
      : (lessonById(params.get("lesson") ?? "l0p-poligon-free") ??
        lessonById("l0p-poligon-free"));
  if (!lesson) return null;
  return (
    <div className="min-h-screen bg-background p-2">
      <LessonPlayShell
        lesson={lesson}
        quality={qualityFrom(params.get("quality"))}
        nextLesson={null}
        onExitToSelect={noop}
        onStartLesson={noop}
      />
    </div>
  );
}
