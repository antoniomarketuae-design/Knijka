"use client";

/**
 * /simulator client orchestrator: lesson select ⇄ play shell.
 *
 * Progression (which lessons are unlocked) is computed server-side in
 * page.tsx from persisted SimSessions; this component only navigates between
 * the two screens and owns the quality preset. After a passed attempt the
 * unlock state on the server has moved on — "Следващ урок" therefore starts
 * the next lesson directly, and returning to the select screen refreshes the
 * server data (router.refresh()).
 *
 * NOTE for the 3D integrator: the heavy Three.js/rapier bundle belongs
 * BEHIND the SceneSlot replacement via next/dynamic + ssr:false (see the
 * old SimulatorApp wiring in git history / SceneSlot.tsx docs) — the select
 * screen must stay 3D-free so the route renders instantly.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LessonPlayShell } from "@/components/sim/lesson-ui/LessonPlayShell";
import { LessonSelectScreen } from "@/components/sim/lesson-ui/LessonSelectScreen";
import { useQualityPreset } from "@/components/sim/lesson-ui/QualityPresetSelector";
import type { LessonEntryView } from "@/components/sim/lesson-ui/types";
import {
  SessionHistorySection,
  type SessionHistoryEntry,
} from "./session-history";

export function SimulatorClient({
  entries,
  history = [],
}: {
  entries: LessonEntryView[];
  /** A15: recent-session rows for „История на сесиите" (server-built). */
  history?: SessionHistoryEntry[];
}) {
  const router = useRouter();
  const [quality, setQuality] = useQualityPreset();
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  const active = entries.find((e) => e.lesson.id === activeLessonId) ?? null;

  if (active === null) {
    return (
      <div className="flex flex-col gap-8">
        <LessonSelectScreen
          entries={entries}
          quality={quality}
          onQualityChange={setQuality}
          onStart={setActiveLessonId}
        />
        {/* A15: past sessions — result + stored debrief on expand. */}
        <SessionHistorySection entries={history} />
      </div>
    );
  }

  const next =
    entries.find((e) => e.lesson.order === active.lesson.order + 1)?.lesson ?? null;

  return (
    <LessonPlayShell
      // Remount (fresh session state) whenever the lesson changes.
      key={active.lesson.id}
      lesson={active.lesson}
      quality={quality}
      nextLesson={next ? { id: next.id, titleBg: next.titleBg } : null}
      onExitToSelect={() => {
        setActiveLessonId(null);
        router.refresh(); // pull fresh progression after new attempts
      }}
      onStartLesson={setActiveLessonId}
    />
  );
}
