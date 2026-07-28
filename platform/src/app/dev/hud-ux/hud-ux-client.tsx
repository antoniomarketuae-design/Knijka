"use client";

/**
 * Client half of the HUD-UX review harness: the real LessonPlayShell on the
 * полигон free-drive spec with no-op navigation callbacks. Client-only (the
 * shell pulls the 3D stack through SceneSlot's ssr:false dynamic import).
 */

import { useSearchParams } from "next/navigation";
import { compileScenario, lessonById, scenarioById } from "@/modules/sim/lessons";
import { LessonPlayShell } from "@/components/sim/lesson-ui/LessonPlayShell";
import type { QualityPreset } from "@/components/sim/lesson-ui/types";

const noop = () => undefined;

function qualityFrom(value: string | null): QualityPreset {
  return value === "low" || value === "high" ? value : "medium";
}

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
  // `?quality=low|medium|high` drives the SCENE tier. It must be set together
  // with localStorage `sim.quality` — MirrorRig / HeroCarBody read the stored
  // preset directly — or the mirror cadence and the scene tier disagree and a
  // perf run measures a combination no student ever gets.
  const shell = (
    <LessonPlayShell
      lesson={lesson}
      quality={qualityFrom(params.get("quality"))}
      nextLesson={null}
      onExitToSelect={noop}
      onStartLesson={noop}
    />
  );
  // `?chrome=dashboard` reproduces the REAL /simulator geometry — the
  // (dashboard) group's 16rem sidebar column plus its
  // `mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8` <main> — because the
  // non-fullscreen scene box is sized by that column, and the bare harness
  // (full-bleed, p-2) cannot show what a student actually gets. Same class
  // strings as (dashboard)/layout.tsx + DashboardShell, deliberately: if those
  // move, this harness has to move with them.
  if (params.get("chrome") === "dashboard") {
    return (
      <div
        data-surface="cluster"
        className="min-h-dvh bg-background lg:grid lg:grid-cols-[16rem_1fr]"
      >
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-hair bg-surface p-4 lg:flex" />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {shell}
        </main>
      </div>
    );
  }
  return <div className="min-h-screen bg-background p-2">{shell}</div>;
}
