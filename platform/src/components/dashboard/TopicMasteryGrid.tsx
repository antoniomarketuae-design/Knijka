import Link from "next/link";
import type { ReadinessSnapshot, TopicMastery } from "@/components/dashboard/data";
import { EmptyState } from "@/components/dashboard/EmptyState";

// Kept in sync with TopicCard / TopicSectionGroup. A started-but-low topic reads
// neutral/accent ("just getting going"), never danger-red — red is for genuine
// answer-level errors, not an early learner's progress bar.
function masteryColor(m: number): string {
  if (m >= 0.75) return "var(--success)";
  if (m >= 0.45) return "var(--warning)";
  if (m > 0) return "var(--accent)";
  return "var(--border-strong)";
}

function Bar({ item }: { item: TopicMastery }) {
  const pct = Math.round(item.mastery * 100);
  const started = item.questionsSeen > 0;
  const color = masteryColor(item.mastery);

  return (
    <li className="flex items-center gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-2 font-mono text-[11px] font-bold tabular-nums text-muted">
        {item.topic.order}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-semibold" title={item.topic.titleBg}>
            {item.topic.titleBg}
          </span>
          <span
            className="shrink-0 font-mono text-xs font-bold tabular-nums"
            style={{ color: started ? color : "var(--muted)" }}
          >
            {started ? `${pct}%` : "—"}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`Усвояване: ${item.topic.titleBg}`}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={started ? `${pct}%` : "все още не е започната"}
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(pct, started ? 2 : 0)}%`,
              backgroundColor: color,
              boxShadow: started ? `0 0 6px ${color}` : undefined,
            }}
          />
        </div>
      </div>
    </li>
  );
}

/**
 * Per-topic mastery mini-bars (all 16 curriculum topics) + the weakest
 * concepts the learning module recommends attacking first.
 */
export function TopicMasteryGrid({ readiness }: { readiness: ReadinessSnapshot }) {
  const { perTopic, weakestConcepts } = readiness;

  return (
    <section aria-labelledby="mastery-title" className="hud-panel p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 id="mastery-title" className="font-display text-base font-extrabold">
          Усвояване по теми
        </h2>
        <Link
          href="/theory"
          className="text-xs font-bold text-accent hover:underline"
        >
          Всички теми
        </Link>
      </div>

      {perTopic.length === 0 ? (
        <EmptyState
          title="Още няма данни за напредък"
          hint="Реши първите си въпроси и тук ще виждаш силните и слабите си теми."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
          {perTopic.map((item) => (
            <Bar key={item.topic.id} item={item} />
          ))}
        </ul>
      )}

      {weakestConcepts.length > 0 ? (
        <div className="mt-5 border-t border-hair pt-4">
          <h3 className="hud-label">Препоръчано за упражнение</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {weakestConcepts.map((c) => (
              <li key={c.conceptId}>
                <Link
                  href={c.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-surface-2 px-3 py-1.5 text-xs font-semibold transition duration-200 hover:border-border-strong hover:text-accent motion-reduce:transition-none"
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: masteryColor(c.mastery) }}
                  />
                  {c.titleBg}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
