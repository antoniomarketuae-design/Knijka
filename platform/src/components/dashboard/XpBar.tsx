import type { GamificationSummary } from "@/lib/dashboard/data";
import { IconBolt } from "@/components/icons";

/** Level badge + XP progress towards the next level. */
export function XpBar({ gamification }: { gamification: GamificationSummary }) {
  const { level, xp, xpIntoLevel, xpForNextLevel } = gamification;
  const pct = Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100));

  return (
    <div className="flex items-center gap-3">
      <span
        aria-label={`Ниво ${level}`}
        className="edge-lit metric flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-base font-black text-accent shadow-glow-sm"
      >
        {level}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="metric truncate text-xs font-normal text-muted">
            {xp.toLocaleString("bg-BG")} XP
          </span>
          <span className="metric flex shrink-0 items-center gap-1 text-xs text-accent">
            <IconBolt className="h-3.5 w-3.5" />
            {xpIntoLevel}/{xpForNextLevel}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`Напредък към ниво ${level + 1}`}
          aria-valuenow={xpIntoLevel}
          aria-valuemin={0}
          aria-valuemax={xpForNextLevel}
          className="track h-2.5 overflow-hidden rounded-full"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 shadow-glow-sm"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
