import type { GamificationSummary } from "@/components/dashboard/data";
import { IconFlame } from "@/components/icons";

/** Streak flame counter. Greys out if today hasn't been counted yet. */
export function StreakBadge({
  gamification,
}: {
  gamification: GamificationSummary;
}) {
  const { streakDays, streakActiveToday } = gamification;
  const lit = streakDays > 0 && streakActiveToday;

  return (
    <p
      className="card flex items-center gap-2.5 px-4 py-2.5"
      title={
        lit
          ? "Серията ти е активна за днес."
          : "Учи днес, за да запазиш серията си!"
      }
    >
      <IconFlame
        className={`h-6 w-6 ${lit ? "text-flame" : "text-muted"}`}
        style={lit ? { filter: "drop-shadow(0 0 6px var(--flame))" } : undefined}
      />
      <span className="font-mono text-xl font-black tabular-nums leading-none">
        {streakDays}
      </span>
      <span className="hud-label leading-tight">
        дни
        <br />
        серия
      </span>
      <span className="visually-hidden">
        {lit
          ? `Серия от ${streakDays} поредни дни, активна днес.`
          : `Серия от ${streakDays} дни — днес още не си учил.`}
      </span>
    </p>
  );
}
