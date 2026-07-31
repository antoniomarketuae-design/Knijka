/**
 * Session-end scenario actions — WHICH forward buttons the end screen offers,
 * and with what weight. Pure: the screen renders this answer, it does not
 * decide it (docs/architecture/05 — business logic lives in modules).
 *
 * Founder 2026-07-17: one CTA was not enough — „the button for next lesson
 * currently goes to stage 2 of the same lesson … we also have to add a button
 * that switches to the NEXT LESSON, not just the next stage". So the row
 * carries up to two targets, which answer two different questions:
 *   „Следващо ниво"    — the SAME maneuver, one rung harder (drill deeper);
 *   „Следващ сценарий" — the next card in the library (move on).
 * The rung is the natural continuation, so it takes the accent and the
 * neighbour stays neutral. With only ONE target that one takes the accent —
 * a lone neutral button beside „Повтори" would read as equally optional.
 *
 * A missing target is a DECISION taken upstream, never a styling detail:
 * nextStep.ts withholds the level step when the rung is star-locked (doc 76
 * §8 — actions.ts refuses a locked attempt with LEVEL_LOCKED, so an
 * offered-then-refused button costs the student a whole drive and the result
 * with it). This builder therefore never synthesizes a target; it only ranks
 * the ones it is handed, and renders one, two or none accordingly.
 */

/** Which kind of step a button leads to — also its React key. */
export type SessionEndCtaId = "level" | "template";

/**
 * A resolved destination. Label and handler are ONE object on purpose: the
 * screen cannot half-render a named button with nowhere to go, or demote
 * „Повтори" for a CTA that never appears.
 */
export interface SessionEndScenarioTarget {
  /** Names the destination — „<заглавие> · Ниво N". */
  labelBg: string;
  onStart: () => void;
}

export interface SessionEndCta extends SessionEndScenarioTarget {
  id: SessionEndCtaId;
  /** The kind line above the destination — „Следващо ниво". */
  leadBg: string;
  /**
   * FR-06: one sentence UNDER the destination, present only when the button
   * needs explaining — today, the forward step offered after a run that did
   * not pass. THEO-4: the student is never handed a bare control; he is told
   * what it does to the lesson he is leaving.
   */
  noteBg?: string;
  /** Button class from the globals.css system: at most one accent per row. */
  className: "btn-accent" | "btn-ghost";
}

const LEAD_BG: Record<SessionEndCtaId, string> = {
  level: "Следващо ниво",
  template: "Следващ сценарий",
};

/**
 * FR-06 — the lead line after a run that did NOT pass. „Следващ сценарий"
 * reads like a reward and this is not one: it is permission to move on. The
 * word he used was „continue".
 */
const LEAD_UNPASSED_BG = "Продължи напред";

/**
 * …and the sentence that makes it honest. Two facts, both of which he asked
 * for by name: the lesson is not finished, and it is not lost.
 */
const NOTE_UNPASSED_BG =
  "Този урок не е взет, но остава отворен — върни се към него, когато поискаш.";

/** Order = weight: the level rung first (accent), the next card after it. */
const CTA_ORDER: readonly SessionEndCtaId[] = ["level", "template"];

export interface ScenarioCtaOptions {
  /**
   * Did the attempt pass with every objective done? Default true keeps every
   * green-run call site byte-identical. FALSE demotes the whole row to ghost
   * so the accent stays on „Повтори" — after a mistake, re-driving is still
   * the recommended move; going on is the student's own choice, offered
   * plainly rather than pushed.
   */
  passed?: boolean;
}

/**
 * Build the forward-action row. Absent/null targets simply do not appear, so
 * the row is 0, 1 or 2 buttons — and only the first one is ever the accent.
 */
export function scenarioCtaRow(
  targets: {
    level?: SessionEndScenarioTarget | null;
    template?: SessionEndScenarioTarget | null;
  },
  opts: ScenarioCtaOptions = {},
): SessionEndCta[] {
  const passed = opts.passed ?? true;
  return CTA_ORDER.flatMap((id) => {
    const target = targets[id];
    return target ? [{ id, target }] : [];
  }).map(({ id, target }, i) => ({
    id,
    leadBg: passed ? LEAD_BG[id] : LEAD_UNPASSED_BG,
    labelBg: target.labelBg,
    ...(passed ? {} : { noteBg: NOTE_UNPASSED_BG }),
    onStart: target.onStart,
    className: (passed && i === 0 ? "btn-accent" : "btn-ghost") as "btn-accent" | "btn-ghost",
  }));
}

/**
 * „Повтори" is THE action while nothing leads forward — and also while the
 * row leads forward but carries no accent, which is the FR-06 failed-run
 * shape: the escape exists, and the instructor's recommendation is still to
 * drive it again.
 */
export function retryCtaClass(row: readonly SessionEndCta[]): "btn-accent" | "btn-ghost" {
  return row.some((c) => c.className === "btn-accent") ? "btn-ghost" : "btn-accent";
}
