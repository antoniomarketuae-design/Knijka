import { masteryBarColor, masteryInkColor } from "@/components/ui/mastery";
import type { TopicOverview } from "@/modules/learning";
import { stateLabel, topicState } from "./deck";

/**
 * One topic as an instrument on the board: a dial, a number, a state lamp and
 * a title. Sixteen of these are the theory hub.
 *
 * It is a <button>, not a <Link>, because pressing it does not navigate — it
 * opens the topic's sheet over the board. That is the whole point of the
 * redesign: choosing a topic must not move the page (docs: the founder's
 * „this choose scroll down is very old and unsatisfying"), and a chooser that
 * navigates away costs a round trip and the student's place on the board.
 *
 * Pure — no hooks — so the parent decides whether it renders on the server or
 * inside the client deck.
 */
export function TopicGauge({
  topic,
  index,
  onOpen,
}: {
  topic: TopicOverview;
  /** Position in the rendered order; drives the ring's power-on stagger. */
  index: number;
  onOpen: (topicId: string) => void;
}) {
  const pct = Math.round(topic.avgMastery * 100);
  const started = topic.seenConceptCount > 0;
  const state = topicState(topic);
  const ring = masteryBarColor(topic.avgMastery);
  const ink = masteryInkColor(topic.avgMastery, started);
  const due = topic.dueCount;

  /**
   * One string, read out in full, because a screen-reader user gets no help
   * from the ring or the border colour that carry this for everyone else.
   */
  const label =
    `Тема ${topic.order}: ${topic.titleBg}. ` +
    (started ? `Усвояване ${pct} процента. ` : "Още не е започната. ") +
    `${topic.seenConceptCount} от ${topic.conceptCount} понятия. ` +
    (due > 0 ? `${due} за преговор. ` : "") +
    "Отвори разделите.";

  return (
    <button
      type="button"
      onClick={() => onOpen(topic.topicId)}
      className="gauge-tile w-full"
      data-state={state}
      data-due={due > 0 ? "1" : "0"}
      aria-label={label}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="gauge h-12 w-12"
          style={
            {
              "--gauge-arc": `${started ? Math.max(pct, 2) : 0}%`,
              "--gauge-color": ring,
              "--gauge-track": "var(--border-strong)",
              "--gauge-thickness": "4px",
              "--gauge-lit": started
                ? `0 0 10px -1px color-mix(in srgb, ${ring} 55%, transparent)`
                : "none",
              // Only the NEEDLES sweep on load, never the tiles: a board whose
              // instruments fade in one by one is a board that is not ready to
              // be tapped for a second. Clamped so tile 16 is not still
              // powering up a second and a quarter after tile 1.
              "--enter-i": Math.min(index, 10),
            } as React.CSSProperties
          }
        >
          <span aria-hidden className="gauge-ring" />
          <span
            aria-hidden
            className="font-mono text-[13px] font-bold leading-none tabular-nums"
            style={{ color: ink }}
          >
            {started ? pct : "—"}
            {started ? <span className="text-[9px]">%</span> : null}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-end gap-1.5">
          <span
            aria-hidden
            className="font-mono text-[11px] font-bold leading-none text-muted"
          >
            {String(topic.order).padStart(2, "0")}
          </span>
          <StateLamp state={state} due={due} />
        </div>
      </div>

      <h3 className="line-clamp-2 font-display text-[13px] font-bold leading-tight text-foreground sm:text-sm">
        {topic.titleBg}
      </h3>

      <p className="mt-auto text-[11px] leading-none text-muted">
        <span className="font-mono font-bold tabular-nums">
          {topic.seenConceptCount}/{topic.conceptCount}
        </span>{" "}
        понятия
      </p>
    </button>
  );
}

/**
 * The lamp beside the dial. Due outranks mastered on purpose: a mastered topic
 * with reviews waiting is a topic you are about to stop having mastered, and
 * that is the state worth showing. The tile's border in globals.css resolves
 * the same conflict the same way, which is why both read the same two fields.
 */
function StateLamp({ state, due }: { state: ReturnType<typeof topicState>; due: number }) {
  if (due > 0) {
    return (
      <span
        aria-hidden
        className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-warning ring-1 ring-warning/25"
      >
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 3v6h-6" />
        </svg>
        <span className="font-mono tabular-nums">{due}</span>
      </span>
    );
  }
  if (state === "mastered") {
    return (
      <span
        aria-hidden
        className="inline-flex items-center gap-1 rounded-full bg-success/12 px-1.5 py-0.5 text-[10px] font-bold leading-none text-success ring-1 ring-success/25"
      >
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {stateLabel("mastered")}
      </span>
    );
  }
  if (state === "fresh") {
    return (
      <span
        aria-hidden
        className="rounded-full border border-hair px-1.5 py-0.5 text-[10px] font-bold leading-none text-muted"
      >
        Нова
      </span>
    );
  }
  return <span aria-hidden className="h-[17px]" />;
}
