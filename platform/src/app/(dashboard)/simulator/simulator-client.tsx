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
 * B1b exam bank: opening the briefing DRAWS a fresh variant from the
 * 14k+-variant bank (entropy lives HERE, at the UI boundary — the bank
 * itself is pure and deterministic per id). The briefing shows the variant
 * code, offers a redraw („Нов изпит") and accepts a pasted code for an exact
 * replay; starting mounts the play shell with the GENERATED spec, whose id
 * IS the variant code — so the session persists under it and the server
 * regrades by regenerating the same spec (wire.ts).
 *
 * NOTE for the 3D integrator: the heavy Three.js/rapier bundle belongs
 * BEHIND the SceneSlot replacement via next/dynamic + ssr:false (see the
 * old SimulatorApp wiring in git history / SceneSlot.tsx docs) — the select
 * screen must stay 3D-free so the route renders instantly.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  drawExamVariantId,
  generateExamVariant,
  isExamVariantId,
} from "@/modules/sim/lessons";
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

/** Client-boundary entropy for „Нов изпит" — the bank stays pure/seeded. */
function freshSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Date.now() % 0xffffffff);
}

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
  // B1b: the drawn/pasted exam-bank variant shown on the briefing.
  const [examVariantId, setExamVariantId] = useState<string | null>(null);

  // Regenerating from the id is pure and cheap — the id IS the spec recipe.
  const examVariant = useMemo(
    () => (examVariantId !== null ? generateExamVariant(examVariantId) : null),
    [examVariantId],
  );

  const variantEntry: LessonEntryView | null =
    examVariant !== null && examEntry !== null
      ? {
          lesson: examVariant,
          unlocked: examEntry.unlocked,
          passed: false,
          attempts: 0,
          bestScore: null,
        }
      : null;

  const allEntries = [
    ...entries,
    ...(examEntry !== null ? [examEntry] : []),
    ...(variantEntry !== null ? [variantEntry] : []),
  ];
  const active = allEntries.find((e) => e.lesson.id === activeLessonId) ?? null;

  if (active === null) {
    if (briefingOpen && examEntry !== null) {
      return (
        <ExamBriefingCard
          variantId={examVariantId}
          variantDescriptionBg={examVariant?.descriptionBg ?? null}
          onRedraw={() => setExamVariantId(drawExamVariantId(freshSeed()))}
          onReplayCode={(code) => {
            const normalized = code.trim().toUpperCase();
            if (!isExamVariantId(normalized)) return false;
            setExamVariantId(normalized);
            return true;
          }}
          onStart={() => {
            setBriefingOpen(false);
            // The drawn variant is the exam; the static lex-exam-1 remains
            // the fallback if a draw somehow never happened.
            setActiveLessonId(examVariant?.id ?? examEntry.lesson.id);
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
            onOpen={() => {
              // B1b: every briefing opens on a FRESH draw (replay stays a
              // paste away) — „нов изпит всеки път" is the product promise.
              setExamVariantId(drawExamVariantId(freshSeed()));
              setBriefingOpen(true);
            }}
          />
        ) : null}
        {/* A15: past sessions — result + stored debrief on expand. */}
        <SessionHistorySection entries={history} />
      </div>
    );
  }

  // The exam has no "next lesson" — it is the end of the ladder; training
  // lessons keep the linear „Следващ урок" affordance.
  const nextEntry =
    active.lesson.examMode === true
      ? null
      : entries.find((e) => e.lesson.order === active.lesson.order + 1) ?? null;
  // „Следващ урок" must never start a LOCKED lesson. Our `entries` snapshot is
  // stale after a pass, so allow the CTA when the snapshot already says
  // unlocked OR when the just-passed lesson IS the next one's prerequisite
  // (explicit unlockAfterLessonId for полигон-style cards, previous order in
  // the curriculum chain). Example this guards: passing „Полигон — свободно
  // каране“ (0.5) must NOT offer „Полигон — начални маневри“ (1.5), which
  // unlocks only after „Подготовка и потегляне“ (1).
  const nextPrereqId =
    nextEntry === null
      ? undefined
      : nextEntry.lesson.unlockAfterLessonId ??
        entries.find((e) => e.lesson.order === nextEntry.lesson.order - 1)
          ?.lesson.id;
  const next =
    nextEntry !== null &&
    (nextEntry.unlocked || nextPrereqId === active.lesson.id)
      ? nextEntry.lesson
      : null;

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
