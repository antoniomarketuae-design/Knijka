import type { SectionOverview, TopicOverview } from "@/modules/learning";
import { SectionCard } from "./SectionCard";

/** Same mastery thresholds as TopicCard / the dashboard — keep them in sync. */
function masteryColor(mastery: number): string {
  if (mastery >= 0.75) return "var(--success)";
  if (mastery >= 0.45) return "var(--warning)";
  if (mastery > 0) return "var(--danger)";
  return "var(--border-strong)";
}

/**
 * One curriculum topic rendered as a collapsible group of its sections. Native
 * <details>/<summary> — no client JS — so the whole theory hub stays a server
 * component. Topics with pending reviews open by default so due work is never
 * hidden a click away.
 */
export function TopicSectionGroup({
  topic,
  sections,
}: {
  topic: TopicOverview;
  sections: SectionOverview[];
}) {
  const pct = Math.round(topic.avgMastery * 100);
  const started = topic.seenConceptCount > 0;
  const barColor = masteryColor(topic.avgMastery);

  return (
    <details
      className="group card overflow-hidden p-0 [&_summary::-webkit-details-marker]:hidden"
      open={topic.dueCount > 0}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 transition-colors hover:bg-surface-2/50 sm:gap-4 sm:p-5">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hair bg-surface-2 font-mono text-xs font-bold text-muted"
        >
          {String(topic.order).padStart(2, "0")}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-[15px] font-bold leading-snug">
              {topic.titleBg}
            </h3>
            {topic.dueCount > 0 ? (
              <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">
                {topic.dueCount} за преговор
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div
              role="progressbar"
              aria-label={`Усвояване: ${topic.titleBg}`}
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-surface-2 sm:w-32"
            >
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{
                  width: `${Math.max(pct, started ? 2 : 0)}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
            <span className="text-[11px] text-muted">
              {sections.length} {sections.length === 1 ? "раздел" : "раздела"}
              <span aria-hidden> · </span>
              <span
                className="font-mono font-bold tabular-nums"
                style={{ color: started ? barColor : "var(--muted)" }}
              >
                {started ? `${pct}%` : "—"}
              </span>
            </span>
          </div>
        </div>

        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      <div className="border-t border-hair p-3 sm:p-4">
        <ul className="flex flex-col gap-2.5">
          {sections.map((section) => (
            <li key={section.sectionId}>
              <SectionCard section={section} />
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
