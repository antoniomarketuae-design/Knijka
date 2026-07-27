"use client";

/**
 * End of a run.
 *
 * WHAT IS DELIBERATELY ABSENT: a pass mark. Hazard perception is not on the ДАИ
 * exam, so „изкара/скъса" would be a verdict this product invented about a test
 * that does not exist — and, worse, it would push the student to optimise the
 * score by pressing earlier. The headline figure is therefore the MEDIAN LEAD:
 * how much warning this student gave themselves, in seconds, across the run.
 * That number has a physical meaning (at 50 km/h one second is about fourteen
 * metres of road), it cannot be gamed by tapping — an early press scores zero
 * and contributes no lead at all — and it is the number the ДАИ outcome
 * capture in @/modules/outcomes will eventually be correlated against.
 *
 * Points are still shown, small, because a student who just did eight clips is
 * owed a total. They are simply not the story.
 */

import Link from "next/link";
import {
  HAZARD_DOOR_RETURN_HREF,
  HAZARD_DOOR_RETURN_LABEL_BG,
  HAZARD_VERDICT_COPY,
  formatLeadSecBg,
  formatPointsBg,
} from "./copy";
import type { HazardRunSummary } from "./types";

interface HazardSummaryProps {
  summary: HazardRunSummary;
  /** „Още една тренировка" — null while a new run is being dealt. */
  onRestart: (() => void) | null;
}

export function HazardSummary({ summary, onRestart }: HazardSummaryProps) {
  const scored = summary.items.filter((i) => i.leadSec !== null).length;

  return (
    <section aria-labelledby="hz-summary-title" className="flex flex-col gap-4">
      <header className="enter">
        <p className="hud-label">Край на тренировката</p>
        <h2
          id="hz-summary-title"
          className="mt-1 font-display text-2xl font-black tracking-tight"
        >
          {summary.medianLeadSec === null
            ? "Този път не хвана нито една навреме"
            : `Средно изпреварваше опасността с ${formatLeadSecBg(summary.medianLeadSec)}`}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          {summary.medianLeadSec === null
            ? "Не е провал — това е точно умението, което се тренира. Гледай разбора на всеки клип: признакът винаги е бил там преди събитието."
            : "Толкова време печелиш, преди ситуацията да стане неизбежна. На 50 км/ч всяка секунда е около 14 метра път, който още е твой."}
        </p>
      </header>

      {/* Readouts. Median first — the hierarchy is the argument. */}
      <div className="panel grid grid-cols-2 gap-4 rounded-2xl p-4 sm:grid-cols-4 sm:p-5">
        <Stat
          label="Средно преднина"
          value={formatLeadSecBg(summary.medianLeadSec)}
          tone="text-accent-2"
        />
        <Stat
          label="Реагира навреме"
          value={`${scored} / ${summary.items.length}`}
          tone="text-foreground"
        />
        <Stat
          label="Пропуснати"
          value={String(summary.missed)}
          tone={summary.missed > 0 ? "text-warning" : "text-foreground"}
        />
        <Stat
          label="Точки"
          value={formatPointsBg(summary.points, summary.maxPoints)}
          tone="text-muted"
        />
      </div>

      {/* Voided items get their own line rather than a footnote: a student who
          tapped through a clip needs to be told plainly, once, why it scored
          nothing — otherwise the zero looks like a bug in the player. */}
      {summary.voided > 0 ? (
        <p className="rounded-xl border border-border bg-surface-2 p-3 text-sm text-muted">
          {summary.voided === 1 ? "Един клип не се брои" : `${summary.voided} клипа не се броят`}{" "}
          — натискаше твърде често. Клип, покрит с натискания, не показва дали си
          видял нещо.
        </p>
      ) : null}

      {/* Per-item table. Rendered as a real <table>: it is tabular data, and a
          grid of divs would be unreadable to anyone using a screen reader. */}
      <div className="panel overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <caption className="sr-only">Резултат по клипове</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="hud-label px-4 py-3">
                Клип
              </th>
              <th scope="col" className="hud-label px-4 py-3">
                Реакция
              </th>
              <th scope="col" className="hud-label px-4 py-3 text-right">
                Преднина
              </th>
              <th scope="col" className="hud-label px-4 py-3 text-right">
                Точки
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.items.map((line) => (
              <tr key={line.itemId} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold">{line.titleBg}</td>
                <td className="px-4 py-3 text-muted">
                  {HAZARD_VERDICT_COPY[line.verdict].labelBg}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-accent-2">
                  {formatLeadSecBg(line.leadSec)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {line.points}/{line.maxPoints}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-accent"
          onClick={onRestart ?? undefined}
          disabled={onRestart === null}
        >
          Още една тренировка
        </button>
        <Link href={HAZARD_DOOR_RETURN_HREF[summary.door]} className="btn-ghost">
          {HAZARD_DOOR_RETURN_LABEL_BG[summary.door]}
        </Link>
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="hud-label">{label}</span>
      <span className={`font-mono text-xl font-bold leading-none tabular-nums ${tone}`}>
        {value}
      </span>
    </div>
  );
}
