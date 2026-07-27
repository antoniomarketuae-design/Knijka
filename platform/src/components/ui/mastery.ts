/**
 * Mastery → colour, for the progress bars on the theory hub and the dashboard.
 *
 * This lived as four near-identical private copies, each carrying a "keep them
 * in sync" comment. They stayed in sync and were wrong together, which is the
 * failure mode a comment cannot catch: all four returned `--border-strong` at
 * zero mastery, and three of them fed that value to a `color:` as well as to
 * the bar's `background-color:`.
 *
 * That is the split this module makes explicit, because the two have different
 * floors:
 *
 *   BAR is a graphic. An untouched topic drawing its hairline colour is the
 *   intended "empty bar" look, and WCAG 1.4.11 does not ask a decorative fill
 *   to be legible — nothing is identified by it.
 *
 *   INK is text, so it owes 4.5 : 1. `--border-strong` measures 1.57 : 1 on the
 *   cluster `--surface` the whole authenticated app is now pinned to (1.72 : 1
 *   in both legacy themes) — a hairline token used as ink. `--muted` is the
 *   ink token for the same register and scores 7.25 : 1 there.
 *
 * The bug was not the threshold table, it was the mismatch beside it: the call
 * sites decided "has this student started?" with `seenConceptCount > 0` but the
 * colour branched on `mastery > 0`, so opening a topic and scoring 0% — the
 * single most common state for a beginner — fell through to the hairline.
 */

/**
 * The shared thresholds. `null` means "nothing earned yet"; the two exported
 * wrappers disagree about what to paint in that case, and only about that.
 *
 * Started-but-low is neutral accent, never danger-red — red is for genuine
 * answer-level errors, not an early learner's progress bar.
 */
function masteryTier(mastery: number): string | null {
  if (mastery >= 0.75) return "var(--success)";
  if (mastery >= 0.45) return "var(--warning)";
  if (mastery > 0) return "var(--accent)";
  return null;
}

/** Fill for the progress-bar track and the weak-concept dots — graphics. */
export function masteryBarColor(mastery: number): string {
  return masteryTier(mastery) ?? "var(--border-strong)";
}

/**
 * Ink for the percentage figure beside the bar — 11px text, so it needs a text
 * token in every branch.
 *
 * `started` is a parameter rather than an inference from `mastery` because the
 * two are computed from different sources on the dashboard (`questionsSeen`
 * comes from the topic overview, `mastery` from the readiness score), and it
 * has to mirror whatever the caller renders: a not-started topic shows an
 * em-dash, and a dash is furniture.
 */
export function masteryInkColor(mastery: number, started: boolean): string {
  if (!started) return "var(--muted)";
  return masteryTier(mastery) ?? "var(--muted)";
}
