import type { Metadata } from "next";
import { AchievementsRow } from "@/components/dashboard/AchievementsRow";
import { ContinueLessonCard } from "@/components/dashboard/ContinueLessonCard";
import { DailyMissionCard } from "@/components/dashboard/DailyMissionCard";
import { ExamCountdown } from "@/components/dashboard/ExamCountdown";
import { ModuleGrid } from "@/components/dashboard/ModuleGrid";
import { ReadinessRing } from "@/components/dashboard/ReadinessRing";
import { SimWeakSpotsCard } from "@/components/dashboard/SimWeakSpotsCard";
import { StreakBadge } from "@/components/dashboard/StreakBadge";
import { TopicMasteryGrid } from "@/components/dashboard/TopicMasteryGrid";
import { XpBar } from "@/components/dashboard/XpBar";
import {
  getContinueLesson,
  getDailyMission,
  getGamification,
  getReadiness,
  getRecentAchievements,
  getSimWeakSpots,
  getStudentProfile,
} from "@/lib/dashboard/data";

export const metadata: Metadata = {
  title: "Начало · Книжка.AI",
  description: "Твоят напредък към шофьорската книжка — на едно място.",
};

/** The hub. Server component: awaits the (mock) module APIs, streams via loading.tsx. */
export default async function DashboardPage() {
  const [
    profile,
    readiness,
    gamification,
    mission,
    achievements,
    lesson,
    simWeakSpots,
  ] = await Promise.all([
    getStudentProfile(),
    getReadiness(),
    getGamification(),
    getDailyMission(),
    getRecentAchievements(),
    getContinueLesson(),
    getSimWeakSpots(),
  ]);

  return (
    <div className="relative flex flex-col gap-6">
      {/* Projection grid — a HUD casting down from the top of the cluster */}
      <div
        aria-hidden
        className="hud-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 opacity-50"
        style={{
          maskImage: "linear-gradient(to bottom, black, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
        }}
      />

      {/* Greeting + streak + level/XP */}
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="hud-label">Табло · Категория B</p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight sm:text-4xl">
            Здравей, {profile.firstName}!
            {profile.isAdmin ? (
              <span className="ml-2 inline-block translate-y-[-0.35em] rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 align-middle font-mono text-[10px] font-bold uppercase tracking-widest text-accent">
                админ
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Днес е добър ден да станеш по-добър шофьор.
          </p>
          {/* Onboarding answers, finally surfaced (exam date + daily goal). */}
          <ExamCountdown />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <StreakBadge gamification={gamification} />
          <div className="card flex w-full flex-col justify-center px-4 py-2.5 sm:w-80">
            <XpBar gamification={gamification} />
          </div>
        </div>
      </header>

      {/* Hero: continue lesson */}
      <ContinueLessonCard lesson={lesson} />

      {/* Module cards */}
      <ModuleGrid />

      {/* Readiness + daily mission */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section
          aria-labelledby="readiness-title"
          className="hud-panel flex flex-col items-center gap-3 p-5 sm:p-6"
        >
          <div className="flex w-full items-center justify-between gap-2">
            <h2 id="readiness-title" className="font-display text-base font-extrabold">
              Готовност за изпит
            </h2>
            <span className="hud-label">Прогноза</span>
          </div>
          <ReadinessRing readiness={readiness} />
          <p className="text-center text-xs leading-relaxed text-muted">
            Прогноза на база твоите отговори и карането ти в симулатора.
            Официалният изпит изисква{" "}
            <span className="font-mono font-bold tabular-nums text-foreground">
              ≥87
            </span>{" "}
            от{" "}
            <span className="font-mono tabular-nums">97</span> точки.
          </p>
        </section>

        <DailyMissionCard mission={mission} />
      </div>

      {/* Per-topic mastery (16 topics) */}
      <TopicMasteryGrid readiness={readiness} />

      {/* Sim weak spots (A14) — hidden until the user has driven recently */}
      <SimWeakSpotsCard snapshot={simWeakSpots} />

      {/* Achievements */}
      <AchievementsRow achievements={achievements} />
    </div>
  );
}
