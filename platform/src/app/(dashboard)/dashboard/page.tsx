import type { Metadata } from "next";
import { AchievementsRow } from "@/components/dashboard/AchievementsRow";
import { ContinueLessonCard } from "@/components/dashboard/ContinueLessonCard";
import { DailyMissionCard } from "@/components/dashboard/DailyMissionCard";
import { ModuleGrid } from "@/components/dashboard/ModuleGrid";
import { ReadinessRing } from "@/components/dashboard/ReadinessRing";
import { StreakBadge } from "@/components/dashboard/StreakBadge";
import { TopicMasteryGrid } from "@/components/dashboard/TopicMasteryGrid";
import { XpBar } from "@/components/dashboard/XpBar";
import {
  getContinueLesson,
  getDailyMission,
  getGamification,
  getReadiness,
  getRecentAchievements,
  getStudentProfile,
} from "@/components/dashboard/data";

export const metadata: Metadata = {
  title: "Начало · Книжка.AI",
  description: "Твоят напредък към шофьорската книжка — на едно място.",
};

/** The hub. Server component: awaits the (mock) module APIs, streams via loading.tsx. */
export default async function DashboardPage() {
  const [profile, readiness, gamification, mission, achievements, lesson] =
    await Promise.all([
      getStudentProfile(),
      getReadiness(),
      getGamification(),
      getDailyMission(),
      getRecentAchievements(),
      getContinueLesson(),
    ]);

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting + streak + level/XP */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black sm:text-3xl">
            Здравей, {profile.firstName}!
          </h1>
          <p className="mt-1 text-sm text-muted">
            Днес е добър ден да станеш по-добър шофьор.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <StreakBadge gamification={gamification} />
          <div className="card w-full px-4 py-2.5 sm:w-80">
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
          className="card flex flex-col items-center gap-2 p-5 sm:p-6"
        >
          <h2 id="readiness-title" className="self-start text-base font-extrabold">
            Готовност за изпит
          </h2>
          <ReadinessRing readiness={readiness} />
          <p className="text-center text-xs leading-relaxed text-muted">
            Прогноза на база твоите отговори. Официалният изпит изисква ≥87 от
            97 точки.
          </p>
        </section>

        <DailyMissionCard mission={mission} />
      </div>

      {/* Per-topic mastery (16 topics) */}
      <TopicMasteryGrid readiness={readiness} />

      {/* Achievements */}
      <AchievementsRow achievements={achievements} />
    </div>
  );
}
