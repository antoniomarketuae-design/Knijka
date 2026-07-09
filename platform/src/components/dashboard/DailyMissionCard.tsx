import Link from "next/link";
import type { DailyMission } from "@/components/dashboard/data";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { IconBolt, IconCheck, IconTarget } from "@/components/icons";

/** Daily mission card — one focused goal per day, XP reward on completion. */
export function DailyMissionCard({ mission }: { mission: DailyMission | null }) {
  return (
    <section
      aria-labelledby="mission-title"
      className="hud-panel flex flex-col p-5 sm:p-6"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <IconTarget className="h-5 w-5" />
          </span>
          <h2 id="mission-title" className="font-display text-base font-extrabold">
            Дневна мисия
          </h2>
        </div>
        <span className="hud-label">Днес</span>
      </div>

      {!mission ? (
        <EmptyState
          title="Няма мисия за днес"
          hint="Ела утре — всяка сутрин те чака нова цел."
        />
      ) : (
        <div className="flex flex-1 flex-col">
          <p className="text-sm leading-relaxed">{mission.descriptionBg}</p>

          <div className="mt-4">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="font-mono text-xs font-bold tabular-nums text-muted">
                {mission.progress} / {mission.target}
              </span>
              <span className="flex items-center gap-1 font-mono text-xs font-bold tabular-nums text-accent">
                <IconBolt className="h-3.5 w-3.5" />+{mission.xpReward} XP
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Напредък по дневната мисия"
              aria-valuenow={mission.progress}
              aria-valuemin={0}
              aria-valuemax={mission.target}
              className="h-2.5 overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 shadow-glow-sm"
                style={{
                  width: `${Math.min(100, Math.round((mission.progress / mission.target) * 100))}%`,
                }}
              />
            </div>
          </div>

          <div className="mt-auto pt-5">
            {mission.completed ? (
              <p className="flex items-center gap-2 text-sm font-bold text-success">
                <IconCheck className="h-4 w-4" />
                Изпълнена — браво!
              </p>
            ) : (
              <Link href="/theory" className="btn-ghost w-full">
                Към мисията
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
