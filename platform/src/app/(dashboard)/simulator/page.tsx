import type { Metadata } from "next";
import { requireUser } from "@/modules/auth";
import {
  computeProgression,
  LESSONS,
  type LessonAttemptRow,
} from "@/modules/sim/lessons";
import { getSimSessionStore } from "@/modules/sim/lessons/store";
import type { LessonEntryView } from "@/components/sim/lesson-ui/types";
import { SimulatorClient } from "./simulator-client";

export const metadata: Metadata = {
  title: "Симулатор · Книжка.AI",
  description:
    "Учебни маршрути по истинската улична мрежа на Студентски град с оценяване в реално време.",
};

/**
 * /simulator v2 — lesson select + play shell. Server component: loads the
 * student's SimSessions, computes the unlock progression and hands plain
 * data to the client orchestrator. The 3D scene itself mounts later inside
 * the play shell's <SceneSlot/> (integrator's seam).
 */
export default async function SimulatorPage() {
  const user = await requireUser();

  let attempts: LessonAttemptRow[] = [];
  try {
    const rows = await getSimSessionStore().listSessions(user.id);
    attempts = rows
      .filter((r) => r.score !== null)
      .map((r) => ({ lessonId: r.lessonId, passed: r.passed, score: r.score as number }));
  } catch (err) {
    // No DB (fresh checkout / offline dev): the select screen still renders
    // with default progression — only L0 open, nothing persisted.
    console.warn("simulator: listSessions failed, using empty progression", err);
  }

  const entries: LessonEntryView[] = computeProgression(LESSONS, attempts).map((e) => ({
    lesson: e.lesson,
    unlocked: e.unlocked,
    passed: e.passed,
    attempts: e.attempts,
    bestScore: e.bestScore,
  }));

  return <SimulatorClient entries={entries} />;
}
