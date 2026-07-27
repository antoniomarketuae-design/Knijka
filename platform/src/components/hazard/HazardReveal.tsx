"use client";

/**
 * The reveal — everything the student was not allowed to know until they had
 * committed to an answer.
 *
 * WHY THIS IS THE MOST IMPORTANT COMPONENT IN THE FEATURE. Hazard perception is
 * the one part of the product that measures a skill the ДАИ exam does not test.
 * A student who only ever sees „3/5" learns to click earlier — which is the
 * exact wrong lesson, and the pattern the UK test voids for. What actually
 * transfers to a road is the CUE CHAIN: the parked van, then the gap under it,
 * then the ball. So the score is deliberately the smallest thing on this panel,
 * and the timeline + the three sentences under it are the largest.
 *
 * Doc 64 THEO-4 (founder-ratified) in one line: no bare verdicts, anywhere,
 * ever. This panel is that rule applied to a video.
 *
 * ADR-002: `hazardBg` / `developingBg` / `correctiveBg` / `lawRefs` arrive
 * already written, retrieved by the engine from the item bank and the 58-entry
 * rule catalog. This component RENDERS them. It does not summarise them, does
 * not reorder them, does not add a word of its own to a legal claim, and there
 * is no model anywhere on this path.
 */

import {
  HAZARD_VERDICT_COPY,
  formatLeadSecBg,
  formatPointsBg,
  type HazardVerdictTone,
} from "./copy";
import type { HazardItemFeedback } from "./types";

/** Verdict tone → semantic token classes. Never a hex, never a raw colour. */
const TONE_TEXT: Record<HazardVerdictTone, string> = {
  success: "text-success",
  accent: "text-accent",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-muted",
};

const TONE_EDGE: Record<HazardVerdictTone, string> = {
  success: "border-success/45",
  accent: "border-accent/45",
  warning: "border-warning/45",
  danger: "border-danger/45",
  muted: "border-border",
};

interface HazardRevealProps {
  feedback: HazardItemFeedback;
  /** The clip's own length — where playback was cut. */
  durationSec: number;
  /** Called by the „напред" control. Null while the run is being advanced. */
  onContinue: (() => void) | null;
  /** Label for the forward control — „Следващ клип" or „Виж резултата". */
  continueLabelBg: string;
}

export function HazardReveal({
  feedback,
  durationSec,
  onContinue,
  continueLabelBg,
}: HazardRevealProps) {
  const copy = HAZARD_VERDICT_COPY[feedback.verdict];
  const leadSec =
    feedback.reactionAtSec === null ? null : feedback.hazardAtSec - feedback.reactionAtSec;

  return (
    <section
      aria-labelledby={`hz-verdict-${feedback.itemId}`}
      className={`panel enter rounded-2xl border p-4 sm:p-5 ${TONE_EDGE[copy.tone]}`}
    >
      {/* ── verdict + score ── */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="hud-label">Оценка на реакцията</p>
          <h3
            id={`hz-verdict-${feedback.itemId}`}
            className={`mt-1 font-display text-xl font-black tracking-tight ${TONE_TEXT[copy.tone]}`}
          >
            {copy.labelBg}
          </h3>
        </div>
        <div className="text-right">
          <p className="hud-label">Точки</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums">
            {formatPointsBg(feedback.points, feedback.maxPoints)}
          </p>
        </div>
      </header>

      <p className="mt-3 text-sm leading-relaxed text-muted">{copy.bodyBg}</p>

      <HazardTimeline feedback={feedback} durationSec={durationSec} />

      {/* ── lead time: the number that means something on a road ──
          Shown as its own readout because it is the only figure here that
          translates directly into metres of road. Hidden when there was no
          reaction: „—" beside a bold caption reads as a broken widget. */}
      {leadSec !== null ? (
        <p className="mt-3 text-sm">
          <span className="hud-label">Изпревари опасността с</span>{" "}
          <span className="font-mono font-bold tabular-nums text-accent-2">
            {formatLeadSecBg(leadSec)}
          </span>
        </p>
      ) : null}

      {/* ── the teaching ── */}
      <dl className="mt-4 flex flex-col gap-3 border-t border-border pt-4 text-sm">
        <div>
          <dt className="hud-label">Каква беше опасността</dt>
          <dd className="mt-1 leading-relaxed">{feedback.hazardBg}</dd>
        </div>
        <div>
          <dt className="hud-label">Как се задаваше</dt>
          <dd className="mt-1 leading-relaxed text-muted">{feedback.developingBg}</dd>
        </div>
        <div>
          <dt className="hud-label">Какво прави добрият шофьор</dt>
          <dd className="mt-1 leading-relaxed">{feedback.correctiveBg}</dd>
        </div>
      </dl>

      {feedback.lawRefs.length > 0 ? (
        <ul aria-label="Правни основания" className="mt-4 flex flex-wrap gap-1.5">
          {feedback.lawRefs.map((l, i) => (
            <li
              key={`${l.act}-${l.ref}-${i}`}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted"
            >
              {l.act} · {l.ref}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5">
        <button
          type="button"
          className="btn-accent w-full sm:w-auto"
          onClick={onContinue ?? undefined}
          disabled={onContinue === null}
        >
          {continueLabelBg}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The timeline
// ---------------------------------------------------------------------------

/**
 * Where the hazard was, where the clip stopped, and where the student pressed —
 * on one axis.
 *
 * THE AXIS RUNS PAST THE END OF THE CLIP ON PURPOSE. The engine-computed fault
 * timestamp normally lands AFTER the cut: the clip is trimmed before the hazard
 * becomes unmissable, precisely so the student cannot answer by reacting to the
 * event itself. Drawing that gap is the single most persuasive thing on the
 * panel — „ти спря да гледаш тук; ударът щеше да е тук" — and it is only
 * legible if the axis extends beyond the frame the student saw.
 *
 * A bar chart is meaningless to a screen reader, so the whole figure carries
 * one `aria-label` that says the same thing in a sentence. That is not a
 * fallback, it is the primary version for anyone not using their eyes.
 */
function HazardTimeline({
  feedback,
  durationSec,
}: {
  feedback: HazardItemFeedback;
  durationSec: number;
}) {
  // Guard the axis: a zero-length span would divide by zero, and a fault that
  // (wrongly) sits before the cut must still leave the marker on the track.
  const axisEnd = Math.max(durationSec, feedback.hazardAtSec, 0.001) * 1.04;
  const pct = (sec: number) => `${Math.min(100, Math.max(0, (sec / axisEnd) * 100))}%`;

  const windowLeft = pct(feedback.windowStartSec);
  const windowWidth = `${Math.max(
    0,
    Math.min(100, ((feedback.windowEndSec - feedback.windowStartSec) / axisEnd) * 100),
  )}%`;

  const spoken = [
    `Прозорецът за реакция е от ${feedback.windowStartSec.toFixed(1)} до ${feedback.windowEndSec.toFixed(1)} секунда.`,
    feedback.reactionAtSec === null
      ? "Ти не реагира."
      : `Ти реагира на ${feedback.reactionAtSec.toFixed(1)} секунда.`,
    `Клипът спира на ${durationSec.toFixed(1)} секунда, а опасността се случва на ${feedback.hazardAtSec.toFixed(1)} секунда.`,
  ].join(" ");

  return (
    <figure className="mt-4">
      <figcaption className="hud-label mb-2">Времева линия на клипа</figcaption>

      <div role="img" aria-label={spoken} className="panel-inset relative h-12 rounded-lg">
        {/* the window a reaction could score in */}
        <span
          aria-hidden
          className="absolute inset-y-2 rounded-sm border border-accent-2/50 bg-accent-2/20"
          style={{ left: windowLeft, width: windowWidth }}
        />

        {/* where the clip was cut */}
        <span
          aria-hidden
          className="absolute inset-y-1 w-px bg-muted"
          style={{ left: pct(durationSec) }}
        />

        {/* where the hazard actually materialised */}
        <span
          aria-hidden
          className="absolute inset-y-0 w-0.5 rounded-full bg-danger"
          style={{ left: pct(feedback.hazardAtSec) }}
        />

        {/* the student's scoring reaction */}
        {feedback.reactionAtSec !== null ? (
          <span
            aria-hidden
            className="absolute inset-y-0 w-1 rounded-full bg-foreground shadow-glow-sm"
            style={{ left: pct(feedback.reactionAtSec) }}
          />
        ) : null}
      </div>

      {/* Legend. Swatch + word: colour alone is never the only carrier of
          meaning (WCAG 1.4.1), and on a timeline that rule bites hard. */}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <LegendItem swatch="bg-accent-2/60" labelBg="прозорец за реакция" />
        <LegendItem swatch="bg-foreground" labelBg="твоята реакция" />
        <LegendItem swatch="bg-muted" labelBg="краят на клипа" />
        <LegendItem swatch="bg-danger" labelBg="опасността се случва" />
      </ul>
    </figure>
  );
}

function LegendItem({ swatch, labelBg }: { swatch: string; labelBg: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className={`h-2 w-2 rounded-full ${swatch}`} />
      {labelBg}
    </li>
  );
}
