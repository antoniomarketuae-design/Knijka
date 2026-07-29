import Link from "next/link";
import { IconArrowRight } from "@/components/icons";
import { masteryBarColor, masteryInkColor } from "@/components/ui/mastery";
import type { SectionOverview } from "@/modules/learning";

/**
 * One section of a topic, as a full-bleed row in the sheet's choice list.
 *
 * WHY FULL-BLEED, HAIRLINE-SEPARATED ROWS AND NOT CARDS IN A GAPPED STACK.
 * The founder, on his iPhone: „In theory ... only 20% visible to choose the
 * topic". The sheet he opened to PICK something spent its first 280px on a
 * ring, a title, a paragraph and a button, and then separated the choices from
 * each other with 10px of nothing and from the sheet's edge with 16px more. On
 * a 393px screen that margin is not breathing room — it is the difference
 * between four choices and six, and every pixel of it is untappable.
 *
 * So the row now runs edge to edge and the rows touch: the ENTIRE list region
 * of the sheet is a tap target, there are no dead lanes between the choices,
 * and the separator is a 1px hairline instead of a gap. This is also the native
 * iOS grouped-list shape, which is what a 17-year-old's thumb already knows.
 *
 * `last` extends the row's padding through the home-indicator inset so the
 * bottom row still ends at the screen edge (its text stays above the inset)
 * rather than leaving a dead strip of sheet under the last choice.
 */
export function SectionCard({
  section,
  last = false,
}: {
  section: SectionOverview;
  /** Bottom row: absorbs the safe-area inset instead of leaving it dead. */
  last?: boolean;
}) {
  const pct = Math.round(section.avgMastery * 100);
  const started = section.seenConceptCount > 0;
  const bar = masteryBarColor(section.avgMastery);
  const ink = masteryInkColor(section.avgMastery, started);

  return (
    <Link
      href={`/theory/practice?section=${section.sectionId}`}
      // The harness measures the sheet by this attribute: a "choice" is a
      // control that starts studying. Anything else in the sheet is overhead.
      data-sheet-choice="section"
      className={[
        "group relative flex min-h-[72px] items-center gap-3 border-t border-hair px-4",
        // Tailwind turns `_` into a space, and the space is not optional:
        // `calc(0.875rem+env(...))` is an INVALID declaration — CSS calc
        // requires whitespace around `+`, so the whole rule would be dropped
        // and the bottom row would end above the home indicator.
        last ? "pt-3.5 pb-[calc(0.875rem_+_env(safe-area-inset-bottom))]" : "py-3.5",
        "transition-colors duration-150 ease-out hover:bg-surface-2 active:bg-surface-2 motion-reduce:transition-none",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate font-display text-sm font-bold leading-snug">
            {section.titleBg}
          </h4>
          {section.dueCount > 0 ? (
            <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-warning">
              {section.dueCount} за преговор
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] leading-none text-muted">
          <span className="font-mono font-bold tabular-nums">
            {section.questionCount}
          </span>{" "}
          {section.questionCount === 1 ? "въпрос" : "въпроса"}
          {started ? (
            <>
              <span aria-hidden> · </span>
              <span
                data-mastery-ink
                className="font-mono font-bold tabular-nums"
                style={{ color: ink }}
              >
                {pct}%
              </span>{" "}
              усвоено
            </>
          ) : null}
        </p>
      </div>

      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-hair bg-surface text-muted transition group-hover:border-accent/40 group-hover:text-accent motion-reduce:transition-none"
      >
        <IconArrowRight className="h-4 w-4" />
      </span>

      {/* The mastery bar lies along the row's bottom edge instead of taking a
          line of its own: same information, zero vertical cost, and it reads as
          an instrument's fill rather than as another widget. */}
      <span
        role="progressbar"
        aria-label={`Усвояване: ${section.titleBg}`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={started ? `${pct}%` : "все още не е започнат"}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] overflow-hidden"
      >
        <span
          aria-hidden
          className="block h-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{
            width: `${Math.max(pct, started ? 3 : 0)}%`,
            backgroundColor: bar,
          }}
        />
      </span>
    </Link>
  );
}
