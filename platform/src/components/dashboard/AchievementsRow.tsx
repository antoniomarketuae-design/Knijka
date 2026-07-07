import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import type { Achievement } from "@/components/dashboard/data";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  IconBolt,
  IconFlame,
  IconMedal,
  IconShield,
  IconStar,
  IconTrophy,
} from "@/components/icons";

const ICONS: Record<Achievement["icon"], ComponentType<SVGProps<SVGSVGElement>>> = {
  medal: IconMedal,
  flame: IconFlame,
  bolt: IconBolt,
  shield: IconShield,
  star: IconStar,
  trophy: IconTrophy,
};

const DATE_FMT = new Intl.DateTimeFormat("bg-BG", {
  day: "numeric",
  month: "short",
});

/** Horizontal strip of the most recent achievements. */
export function AchievementsRow({ achievements }: { achievements: Achievement[] }) {
  return (
    <section aria-labelledby="achievements-title">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="achievements-title" className="text-base font-extrabold">
          Последни постижения
        </h2>
        <Link
          href="/leaderboard"
          className="text-xs font-bold text-accent hover:underline"
        >
          Виж всички
        </Link>
      </div>

      {achievements.length === 0 ? (
        <EmptyState
          title="Все още нямаш постижения"
          hint="Реши първия си тест или задръж серия от 3 дни, за да отключиш първото."
        />
      ) : (
        <ul className="flex gap-3 overflow-x-auto pb-2">
          {achievements.map((a) => {
            const Icon = ICONS[a.icon];
            return (
              <li
                key={a.id}
                className="card flex w-56 shrink-0 flex-col gap-2 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-gold">
                    <Icon className="h-5 w-5" />
                  </span>
                  <time
                    dateTime={a.earnedAt}
                    className="text-[11px] font-semibold text-muted"
                  >
                    {DATE_FMT.format(new Date(a.earnedAt))}
                  </time>
                </div>
                <h3 className="text-sm font-extrabold">{a.titleBg}</h3>
                <p className="text-xs leading-relaxed text-muted">
                  {a.descriptionBg}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
