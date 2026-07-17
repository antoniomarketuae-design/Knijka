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
  /** Button class from the globals.css system: exactly one accent per row. */
  className: "btn-accent" | "btn-ghost";
}

const LEAD_BG: Record<SessionEndCtaId, string> = {
  level: "Следващо ниво",
  template: "Следващ сценарий",
};

/** Order = weight: the level rung first (accent), the next card after it. */
const CTA_ORDER: readonly SessionEndCtaId[] = ["level", "template"];

/**
 * Build the forward-action row. Absent/null targets simply do not appear, so
 * the row is 0, 1 or 2 buttons — and only the first one is ever the accent.
 */
export function scenarioCtaRow(targets: {
  level?: SessionEndScenarioTarget | null;
  template?: SessionEndScenarioTarget | null;
}): SessionEndCta[] {
  return CTA_ORDER.flatMap((id) => {
    const target = targets[id];
    return target ? [{ id, target }] : [];
  }).map(({ id, target }, i) => ({
    id,
    leadBg: LEAD_BG[id],
    labelBg: target.labelBg,
    onStart: target.onStart,
    className: i === 0 ? "btn-accent" : "btn-ghost",
  }));
}

/** „Повтори" is THE action only while nothing leads forward. */
export function retryCtaClass(row: readonly SessionEndCta[]): "btn-accent" | "btn-ghost" {
  return row.length > 0 ? "btn-ghost" : "btn-accent";
}
