import Link from "next/link";
import { IconArrowRight } from "@/components/icons";
import { masteryBarColor, masteryInkColor } from "@/components/ui/mastery";
import type { TopicOverview } from "@/modules/learning";

/** One curriculum topic as a clickable card that starts topic practice. */
export function TopicCard({ topic }: { topic: TopicOverview }) {
  const pct = Math.round(topic.avgMastery * 100);
  const started = topic.seenConceptCount > 0;
  const barColor = masteryBarColor(topic.avgMastery);

  return (
    <Link
      href={`/theory/practice?topic=${topic.slug}`}
      className="card group flex h-full flex-col gap-4 p-5 transition duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:shadow-glow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-hair bg-surface-2 font-mono text-xs font-bold text-muted"
        >
          {String(topic.order).padStart(2, "0")}
        </span>
        {topic.dueCount > 0 ? (
          <span className="rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-bold text-warning">
            {topic.dueCount} за преговор
          </span>
        ) : null}
      </div>

      <h3 className="line-clamp-2 font-display text-[15px] font-bold leading-snug">
        {topic.titleBg}
      </h3>

      <div className="mt-auto flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="hud-label">Усвояване</span>
          <span
            className="font-mono text-xs font-bold tabular-nums"
            style={{ color: masteryInkColor(topic.avgMastery, started) }}
          >
            {started ? `${pct}%` : "—"}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`Усвояване: ${topic.titleBg}`}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={started ? `${pct}%` : "все още не е започната"}
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{
              width: `${Math.max(pct, started ? 2 : 0)}%`,
              backgroundColor: barColor,
              boxShadow: started
                ? `0 0 8px color-mix(in srgb, ${barColor} 45%, transparent)`
                : "none",
            }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs">
          <span className="text-muted">
            {topic.seenConceptCount}/{topic.conceptCount} понятия
          </span>
          <span className="flex items-center gap-1 font-bold text-accent">
            Тренирай
            <IconArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
          </span>
        </div>
      </div>
    </Link>
  );
}
