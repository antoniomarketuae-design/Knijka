import Link from "next/link";
import { IconArrowRight, IconBolt } from "@/components/icons";
import { masteryBarColor, masteryInkColor } from "@/components/ui/mastery";
import type { TopicOverview } from "@/modules/learning";
import { deckReadiness, pickFocus } from "./deck";

/**
 * The head of the theory hub: the page's identity, one big readiness gauge and
 * the single recommendation the board exists to deliver.
 *
 * IT REPLACED TWO PANELS, NOT ONE. The old hub opened with a 181px title band
 * and then a separate smart-training card — 520px of chrome on a 844px screen
 * before the first topic appeared, which is most of why only one topic was
 * above the fold. Merging them is not tidying: the title band said nothing the
 * navigation had not already said, and the training card recommended without
 * ever saying what it was recommending.
 *
 * THE RECOMMENDATION SPEAKS. Doc 64 THEO-4 forbids a bare verdict anywhere in
 * the theory module, and „start here" is a verdict about the student's own
 * knowledge. `pickFocus` therefore returns the sentence with the topic, and
 * this component has no way to render one without the other.
 *
 * Server component — no hooks, no client JS. The whole head of the page is
 * static HTML the moment it streams.
 */
export function TheoryFocus({
  topics,
  sectionCount,
  questionsLabel,
}: {
  topics: TopicOverview[];
  sectionCount: number;
  questionsLabel: string;
}) {
  const readiness = deckReadiness(topics);
  const focus = pickFocus(topics);
  const pct = Math.round(readiness.avgMastery * 100);
  const started = readiness.seenConceptCount > 0;
  const ring = masteryBarColor(readiness.avgMastery);
  const ink = masteryInkColor(readiness.avgMastery, started);

  return (
    <header className="panel-glass relative isolate overflow-hidden p-4 short:p-2 sm:p-6">
      {/* Two decorative layers, both static: the aurora wash the theory surface
          already uses for its "calm reading" register, and the perspective
          floor that gives the board a horizon to sit on. Neither repaints on
          scroll and neither carries text. */}
      <div
        aria-hidden
        className="aurora-drift pointer-events-none absolute inset-0 -z-10"
        style={{
          opacity: 0.4,
          background:
            "linear-gradient(115deg, transparent 0%, color-mix(in srgb, var(--accent) 24%, transparent) 22%, color-mix(in srgb, #8b5cf6 20%, transparent) 48%, color-mix(in srgb, var(--accent-2) 22%, transparent) 74%, transparent 100%)",
          backgroundSize: "220% 220%",
          animation: "aurora-drift 16s ease-in-out infinite",
          maskImage: "radial-gradient(130% 150% at 12% 0%, black 0%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(130% 150% at 12% 0%, black 0%, transparent 70%)",
        }}
      />
      <div aria-hidden className="deck-floor -z-10" />

      {/* ON A LANDSCAPE PHONE THIS WHOLE HEAD IS ONE ROW. MEASURED WHY:
          on an iPhone 16 turned sideways (852 x 393) this header alone was
          322px of a 393px screen, and with the lens row under it the FIRST
          TOPIC TILE started at y=458 — 199px below the bottom of the glass.
          The founder, verbatim: „In theory ... only 20% visible to choose the
          topic". In landscape it was 0%: not one tile, on the screen whose only
          job is choosing one.

          So `short:` lays the identity, the dial and the recommendation across
          the 852px of width the screen has instead of down the 393px it does
          not, which brings the head to ~100px and puts the first row of topics
          on the screen the student lands on. Nothing is dropped that carries
          meaning: the readiness dial, the focus title, its REASON (THEO-4 — a
          recommendation without the why is a bare verdict) and both actions all
          survive; what goes is the „ПОДГОТОВКА ЗА ИЗПИТА" eyebrow and the
          16/54/1000 stat line, neither of which a student acts on. */}
      <div className="short:flex short:items-center short:gap-3">
      <div className="flex items-start gap-4 short:shrink-0 short:items-center short:gap-2">
        <div className="min-w-0 flex-1 short:order-2 short:flex-none">
          <p className="hud-label short:hidden">Подготовка за изпита</p>
          <h1 className="mt-1 font-display text-[26px] font-black leading-none tracking-tight short:mt-0 short:text-lg sm:text-4xl">
            Теория
          </h1>
          <p className="mt-1.5 text-[11px] leading-tight text-muted short:hidden sm:text-xs">
            {topics.length} теми <span aria-hidden>·</span> {sectionCount} раздела{" "}
            <span aria-hidden>·</span> {questionsLabel} въпроса
          </p>
        </div>

        {/* The headline dial: how much of the whole curriculum is learned. */}
        <div
          className="gauge h-[76px] w-[76px] short:order-1 short:h-11 short:w-11 sm:h-[92px] sm:w-[92px]"
          style={
            {
              "--gauge-arc": `${started ? Math.max(pct, 2) : 0}%`,
              "--gauge-color": ring,
              "--gauge-track": "var(--border-strong)",
              "--gauge-thickness": "6px",
              "--gauge-lit": started
                ? `0 0 16px -2px color-mix(in srgb, ${ring} 65%, transparent)`
                : "none",
            } as React.CSSProperties
          }
          role="img"
          aria-label={
            started
              ? `Обща готовност ${pct} процента — ${readiness.seenConceptCount} от ${readiness.conceptCount} понятия`
              : `Обща готовност: още не си започнал. 0 от ${readiness.conceptCount} понятия.`
          }
        >
          <span aria-hidden className="gauge-ring" />
          <span aria-hidden className="flex flex-col items-center leading-none">
            <span
              className="font-mono text-lg font-black tabular-nums short:text-[11px] sm:text-2xl"
              style={{ color: ink }}
            >
              {started ? pct : "—"}
              {started ? <span className="text-[11px] short:text-[8px] sm:text-sm">%</span> : null}
            </span>
            {/* The caption goes at 44px — the number and the ring still say
                what it is, and the dial keeps its full aria-label, so the
                sentence a screen reader gets is unchanged. */}
            <span className="mt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-muted short:hidden sm:text-[9px]">
              готовност
            </span>
          </span>
        </div>
      </div>

      {/* The recommendation, recessed like a readout slot in a dashboard. */}
      <div className="panel-inset mt-3 p-3 short:mt-0 short:min-w-0 short:flex-1 short:p-2 sm:mt-4 sm:p-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent ring-1 ring-accent/25 short:h-5 short:w-5"
          >
            <IconBolt className="h-3.5 w-3.5" />
          </span>
          <p className="hud-label text-accent">{focus.title}</p>
        </div>

        {/* In `short` the reason and the two actions share a row: the buttons
            are 44px whatever happens, so putting the sentence beside them
            costs nothing at all in height. */}
        <div className="short:flex short:items-center short:gap-3">
        <p className="mt-1.5 text-[13px] leading-snug text-foreground short:mt-1 short:min-w-0 short:flex-1 short:text-[12px] sm:text-sm sm:leading-relaxed">
          {focus.reason}
        </p>

        {/* `min-h-11` on both. The base `.btn-accent` / `.btn-ghost` are 44px
            by construction (py-3 + text-sm); these two override the padding to
            `py-2.5` for a tighter recessed slot and landed at 40.6px, measured
            on every phone profile. The tighter padding is worth keeping — the
            44px is not negotiable, so it is stated instead of inferred. This is
            the first thing a student taps on the theory hub. */}
        <div className="mt-3 flex flex-wrap gap-2 short:mt-0 short:shrink-0 short:flex-nowrap">
          <Link
            href="/theory/practice"
            className="btn-accent min-h-11 flex-1 px-4 py-2.5 text-[13px] short:flex-none sm:flex-none sm:px-6"
          >
            Умна тренировка
          </Link>
          {focus.topic ? (
            <Link
              href={`/theory/practice?topic=${focus.topic.slug}`}
              className="btn-ghost min-h-11 px-4 py-2.5 text-[13px]"
            >
              Тема {String(focus.topic.order).padStart(2, "0")}
              <IconArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
        </div>
      </div>
      </div>
    </header>
  );
}
