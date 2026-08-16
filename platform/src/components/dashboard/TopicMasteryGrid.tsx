import Link from "next/link";
import type { ReadinessSnapshot, TopicMastery } from "@/lib/dashboard/data";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { masteryBarColor, masteryInkColor } from "@/components/ui/mastery";

function Bar({ item }: { item: TopicMastery }) {
  const pct = Math.round(item.mastery * 100);
  const started = item.questionsSeen > 0;
  const color = masteryBarColor(item.mastery);

  return (
    <li className="flex items-center gap-3">
      <span className="panel-inset metric flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] text-muted">
        {item.topic.order}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-semibold" title={item.topic.titleBg}>
            {item.topic.titleBg}
          </span>
          <span
            className="metric shrink-0 text-xs"
            style={{ color: masteryInkColor(item.mastery, started) }}
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
          className="track h-1.5 overflow-hidden rounded-full"
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
    <section
      aria-labelledby="mastery-title"
      className="hud-panel p-5 [--panel-pad:1.25rem] sm:p-6 sm:[--panel-pad:1.5rem]"
    >
      <div className="panel-head panel-head-bleed">
        <h2 id="mastery-title" className="font-display text-base font-extrabold">
          Усвояване по теми
        </h2>
        {/* 78.4 x 16 BEFORE THIS, and 17px to a thumb — the smallest hit
            target the harness found anywhere on /dashboard (WebKit, iPhone 16,
            both orientations, deployed build). It is the only way out of this
            panel and into the topic list.

            The BOX is not grown: this link sits on a `.panel-head` baseline
            next to the „Усвояване по теми" heading, and a 44px box there would
            push the rule under the heading out of alignment on every panel in
            the product that shares the pattern. The TAP AREA is grown instead,
            with an absolutely positioned ::before at −14px top and bottom
            (16 + 28 = 44) — the technique lesson-ui/QualityPresetSelector
            established for the same reason and the one tools/mobile/lib/probe.mjs
            already unions into its hit rects. `relative` is what the ::before
            resolves against; without it the pseudo-element would size against
            the panel and swallow the heading's taps. */}
        <Link
          href="/theory"
          className="relative text-xs font-bold text-accent before:absolute before:-inset-y-3.5 before:left-0 before:right-0 before:content-[''] hover:underline"
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
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="hud-label">Препоръчано за упражнение</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {weakestConcepts.map((c) => (
              <li key={c.conceptId}>
                {/* 30px tall before this, on every device profile, and 31px to
                    a thumb — five of them, and they are the product's own
                    recommendation of what to practise next, i.e. the row a
                    student is most likely to aim at from this panel.

                    `min-h-11` GROWS THE BOX here rather than the ::before trick
                    used on „Всички теми" above, and the difference is the
                    layout, not taste: these wrap in a `gap-2` list, so a
                    pseudo-element reaching the 14px it would need (30 + 14)
                    would eat the whole 8px gutter and overlap the row below by
                    3px — a tap landing between two rows would be a coin flip
                    over which topic it opens. A taller box keeps the 8px gutter
                    intact and every pill unambiguous. */}
                <Link
                  href={c.href}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-hair bg-surface-2 px-3 py-1.5 text-xs font-semibold transition duration-200 hover:border-border-strong hover:text-accent motion-reduce:transition-none"
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: masteryBarColor(c.mastery) }}
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
