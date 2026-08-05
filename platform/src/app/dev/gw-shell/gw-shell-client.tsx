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

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import type { LessonStepResult, ScenarioLevel } from "@/modules/sim/lessons";
import { compileScenario, lessonById, scenarioById } from "@/modules/sim/lessons";
import type { SimTick } from "@/modules/sim/rules";
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

/**
 * Dev-only drive telemetry on `window.__gwShell` — the missing half of this
 * harness (register B15/B29).
 *
 * This route already renders the REAL LessonPlayShell, so it is the only
 * login-free surface that shows the fault cards and the objective chain. What
 * it could not do was say WHERE the car was or WHAT the session engine thought
 * — so „the lesson ended itself while I was stopped at the give-way line" had
 * no observable behind it, and three separate runs could describe the symptom
 * without ever naming the mechanism. `LessonPlayShell.onDevTelemetry` is the
 * read-only tap that exists for exactly this; it just had no caller.
 *
 * Position + speed answer „where was he standing"; the two FINISH GATES answer
 * „what was counting down while he stood there". No React state (per-frame
 * callback), no effect on the shell: absent on /simulator, so the graded path
 * is byte-identical.
 */
function useDevTelemetry(): (tick: SimTick, step: LessonStepResult) => void {
  return useCallback((tick: SimTick, step: LessonStepResult) => {
    const s = step.state;
    (window as unknown as { __gwShell?: unknown }).__gwShell = {
      t: tick.t,
      speedKmh: tick.speedKmh,
      x: tick.position.x,
      y: tick.position.y,
      headingDeg: tick.headingDeg,
      gear: tick.gear,
      phase: s.phase,
      objectiveIndex: s.currentObjectiveIndex,
      objectiveStatus: s.objectives.map((o) => o.status),
      /** The stalled-chain finish gate and the terminal-rescue gate. */
      finishGate: s.finishGate ?? null,
      finishRescueGate: s.finishRescueGate ?? null,
      /** Seconds this session has spent lawfully stationary at a yield. */
      yieldWaitSec: s.yieldWaitSec ?? 0,
      /** Whether THIS frame is one of them (the finish gates are frozen). */
      yieldHolding: s.yieldWait?.holding ?? false,
      /** Stop-line context the runtime published for this frame. */
      nextStopLineM: tick.nextStopLineM ?? null,
      nextStopLineControl: tick.nextStopLineControl ?? null,
      nextStopLineState: tick.nextStopLineState ?? null,
      hudEvents: step.hudEvents.map((e) =>
        "titleBg" in e ? `${e.kind}:${e.titleBg}` : e.kind,
      ),
    };
  }, []);
}

export function GwShellClient() {
  const onDevTelemetry = useDevTelemetry();
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
        onDevTelemetry={onDevTelemetry}
      />
    </div>
  );
}
