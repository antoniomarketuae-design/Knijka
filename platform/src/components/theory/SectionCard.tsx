import Link from "next/link";
import { IconArrowRight } from "@/components/icons";
import type { SectionOverview } from "@/modules/learning";

/** Same mastery thresholds as TopicCard / the dashboard — keep them in sync.
 *  Started-but-low reads neutral accent („тепърва загрява"), never danger-red —
 *  red is for genuine answer-level errors, not an early learner's progress bar. */
function masteryColor(mastery: number): string {
  if (mastery >= 0.75) return "var(--success)";
  if (mastery >= 0.45) return "var(--warning)";
  if (mastery > 0) return "var(--accent)";
  return "var(--border-strong)";
}

/**
 * One section (a finer study chunk inside a topic) as a compact row that
 * launches practice scoped to the section's concepts. Sections are a
 * presentation grouping; practice still runs on the underlying concepts.
 */
export function SectionCard({ section }: { section: SectionOverview }) {
  const pct = Math.round(section.avgMastery * 100);
  const started = section.seenConceptCount > 0;
  const barColor = masteryColor(section.avgMastery);

  return (
    <Link
      href={`/theory/practice?section=${section.sectionId}`}
      className="group flex items-center gap-4 rounded-xl border border-hair bg-surface-2/40 p-3.5 transition duration-200 ease-out hover:border-border-strong hover:bg-surface-2 hover:shadow-glow-sm motion-reduce:transition-none sm:p-4"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate font-display text-sm font-bold leading-snug">
            {section.titleBg}
          </h4>
          {section.dueCount > 0 ? (
            <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">
              {section.dueCount} за преговор
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div
            role="progressbar"
            aria-label={`Усвояване: ${section.titleBg}`}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={started ? `${pct}%` : "все още не е започнат"}
            className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-surface-2 sm:w-20"
          >
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{
                width: `${Math.max(pct, started ? 3 : 0)}%`,
                backgroundColor: barColor,
              }}
            />
          </div>
          <span className="text-[11px] text-muted">
            {section.questionCount}{" "}
            {section.questionCount === 1 ? "въпрос" : "въпроса"}
            {started ? (
              <span
                className="ml-1.5 font-mono font-bold tabular-nums"
                style={{ color: barColor }}
              >
                {pct}%
              </span>
            ) : null}
          </span>
        </div>
      </div>
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-hair bg-surface text-muted transition group-hover:border-accent/40 group-hover:text-accent motion-reduce:transition-none"
      >
        <IconArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
      </span>
    </Link>
  );
}
