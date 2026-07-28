"use client";

/**
 * Client half of the HUD-UX review harness: the real LessonPlayShell on the
 * полигон free-drive spec with no-op navigation callbacks. Client-only (the
 * shell pulls the 3D stack through SceneSlot's ssr:false dynamic import).
 */

import { useSearchParams } from "next/navigation";
import { compileScenario, lessonById, scenarioById } from "@/modules/sim/lessons";
import { LessonPlayShell } from "@/components/sim/lesson-ui/LessonPlayShell";

const noop = () => undefined;

export function HudUxClient() {
  // ?lesson=<id> picks the spec (default: полигон free drive). The city free
  // drive has the long straights needed to check the cluster at speed, and
  // ?scenario=<templateId> compiles a scenario rung — the only way to reach a
  // motorway district, where the cluster can be checked at 130+ km/h.
  const params = useSearchParams();
  const scenarioId = params.get("scenario");
  const spec = scenarioId !== null ? scenarioById(scenarioId) : undefined;
  const lesson =
    spec !== undefined
      ? compileScenario(spec, 3)
      : (lessonById(params.get("lesson") ?? "l0p-poligon-free") ??
        lessonById("l0p-poligon-free"));
  if (!lesson) return null;
  return (
    <div className="min-h-screen bg-background p-2">
      <LessonPlayShell
        lesson={lesson}
        quality="medium"
        nextLesson={null}
        onExitToSelect={noop}
        onStartLesson={noop}
      />
    </div>
  );
}
