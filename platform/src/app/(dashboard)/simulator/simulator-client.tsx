"use client";

/**
 * /simulator client orchestrator: lesson select ⇄ exam briefing ⇄ play shell.
 *
 * Progression (which lessons are unlocked) is computed server-side in
 * page.tsx from persisted SimSessions; this component only navigates between
 * the screens and owns the quality preset. After a passed attempt the
 * unlock state on the server has moved on — "Следващ урок" therefore starts
 * the next lesson directly, and returning to the select screen refreshes the
 * server data (router.refresh()).
 *
 * A13 exam flow: the „Изпитен режим" card (server-gated via isExamUnlocked)
 * opens the examiner BRIEFING first; only its „Започни изпита" click mounts
 * the play shell — so the shell's fullscreen request rides that click's user
 * activation, and nobody lands in an exam without the protocol rules.
 *
 * NOTE for the 3D integrator: the heavy Three.js/rapier bundle belongs
 * BEHIND the SceneSlot replacement via next/dynamic + ssr:false (see the
 * old SimulatorApp wiring in git history / SceneSlot.tsx docs) — the select
 * screen must stay 3D-free so the route renders instantly.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExamBriefingCard } from "@/components/sim/lesson-ui/ExamBriefingCard";
import { ExamModeCard } from "@/components/sim/lesson-ui/ExamModeCard";
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
  examEntry = null,
  history = [],
}: {
  entries: LessonEntryView[];
  /** A13: the exam card's view (server-gated unlock); null hides the card. */
  examEntry?: LessonEntryView | null;
  /** A15: recent-session rows for „История на сесиите" (server-built). */
  history?: SessionHistoryEntry[];
}) {
  const router = useRouter();
  const [quality, setQuality] = useQualityPreset();
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  // A13: the exam briefing screen (between the card and the session).
  const [briefingOpen, setBriefingOpen] = useState(false);

  const allEntries = examEntry !== null ? [...entries, examEntry] : entries;
  const active = allEntries.find((e) => e.lesson.id === activeLessonId) ?? null;

  if (active === null) {
    if (briefingOpen && examEntry !== null) {
      return (
        <ExamBriefingCard
          onStart={() => {
            setBriefingOpen(false);
            setActiveLessonId(examEntry.lesson.id);
          }}
          onBack={() => setBriefingOpen(false)}
        />
      );
    }
    const prerequisiteTitle =
      entries.find((e) => e.lesson.id === examEntry?.lesson.unlockAfterLessonId)?.lesson
        .titleBg ?? null;
    return (
      <div className="flex flex-col gap-8">
        <LessonSelectScreen
          entries={entries}
          quality={quality}
          onQualityChange={setQuality}
          onStart={setActiveLessonId}
        />
        {/* A13: the exam is the product promise — its own gated section. */}
        {examEntry !== null ? (
          <ExamModeCard
            entry={examEntry}
            prerequisiteTitleBg={prerequisiteTitle}
            onOpen={() => setBriefingOpen(true)}
          />
        ) : null}
        {/* A15: past sessions — result + stored debrief on expand. */}
        <SessionHistorySection entries={history} />
      </div>
    );
  }

  // The exam has no "next lesson" — it is the end of the ladder; training
  // lessons keep the linear „Следващ урок" affordance.
  const next =
    active.lesson.examMode === true
      ? null
      : entries.find((e) => e.lesson.order === active.lesson.order + 1)?.lesson ?? null;

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
