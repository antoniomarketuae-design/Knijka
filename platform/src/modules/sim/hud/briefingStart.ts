/**
 * briefingStart — WHEN THE LESSON'S STEPS OPEN BY THEMSELVES, decided against
 * the RESOLVED surface and never against a guess.
 *
 * FOUNDER RULING 2026-09-20: «…taking alot of space on the screen to we have to
 * hide it and make it optional if the user wants it on». `hudPreferences.ts`
 * wrote the rule (`BRIEFING_AUTO_DEFAULT_COMPACT = false`) and the shell wired
 * it into two LAZY `useState` initialisers. That is where the ruling died:
 *
 *   `useCompactHud()` is `useState(false)` and learns the viewport in an
 *   EFFECT, so on the only render a lazy initialiser ever reads, every phone
 *   is a desktop. `briefingAutoDefault(false)` is the roomy default — OPEN —
 *   and `useState(() => …)` froze it. The w60 frames
 *   (`.audit-frames/w60/frames/*mobile-right/01-arrival.png`) show the result:
 *   «ИНСТРУКЦИИ … ПРОЧЕТИ ↓N / РАЗБРАХ» holding the drive at arrival on the
 *   surface the ruling was about.
 *
 * THE FIX IS A STATE MACHINE, NOT A BETTER INITIALISER, because the defect was
 * a question asked before its answer existed. The machine will not decide
 * until the render in which the compact flag is known:
 *
 *   awaitingViewport ── mounted ──▶ viewportRead ── resolve(compact) ──▶ decided
 *
 * `mounted` is dispatched from the shell's first effect run. React runs a
 * component's effects in hook order and batches their updates, and
 * `useCompactHud` is called before this machine, so the render that follows
 * `mounted` is the render that carries the RESOLVED compact value. Only then
 * does `resolve` read it. Nothing is open before `decided` — the card starts
 * closed and a phone never sees it flash open and shut; the roomy stage gets
 * its card one committed frame later, which is the cost of not guessing.
 *
 * THE STUDENT'S OWN CHOICES WIN OVER THE DEFAULT, in both directions:
 *   - a stored МЕНЮ opt-in («Инструкции при старт: вкл.») opens it on a phone,
 *     a stored opt-out keeps it shut on a laptop (`briefingAutoSetting`);
 *   - an in-session ✕/«Разбрах» (`dismiss`) or a МЕНЮ recall (`recall`) is
 *     final for this showing, even if it arrives before the viewport resolved
 *     — a late `resolve` never reopens a card the student sent away.
 *
 * THEO-4: hiding by default is not deleting. The authored steps stay one tap
 * away for the whole drive through the МЕНЮ row «Инструкции · N стъпки»
 * (`recallBriefing` in LessonPlayShell → `recall` here).
 *
 * PURE: no React, no DOM, no storage. The shell passes the stored flag in.
 */

import { briefingAutoDefault } from "./hudPreferences";

/**
 * The persisted setting's effective value on a surface: the student's stored
 * choice if there is one, else the surface default. This is also what the МЕНЮ
 * row prints («вкл.»/«изкл.»), so the row and the behaviour cannot disagree.
 */
export function briefingAutoSetting(compact: boolean, stored: boolean | null): boolean {
  return stored ?? briefingAutoDefault(compact);
}

/**
 * The value the МЕНЮ toggle «Инструкции при старт» writes when tapped: the
 * OPPOSITE OF WHAT THE ROW PRINTS, i.e. of the effective setting — never the
 * opposite of the raw stored choice. With nothing stored the two differ: the
 * roomy row prints «вкл.» (the surface default), so the first tap must turn it
 * OFF; `!stored` would compute `!null === true` and write «on» over a setting
 * that was already on — a tap that changes nothing the student can see. On a
 * phone with nothing stored the row prints «изкл.» and the first tap turns it
 * ON. Once a choice is stored, the tap flips it.
 *
 * Round-2 verifier (lane E): the shell's inline `!briefingAutoOpen` and the
 * wrong `!briefingAutoStored` were indistinguishable to the suite. This
 * function is what makes them distinguishable — `briefing-start.test.ts`
 * executes it, `briefing-auto-open.test.ts` pins that the shell calls it.
 */
export function briefingAutoToggled(compact: boolean, stored: boolean | null): boolean {
  return !briefingAutoSetting(compact, stored);
}

export type BriefingStartPhase = "awaitingViewport" | "viewportRead" | "decided";

export interface BriefingStartState {
  readonly phase: BriefingStartPhase;
  /** Meaningful only once `phase === "decided"`; read via `briefingIsOpen`. */
  readonly open: boolean;
}

export type BriefingStartEvent =
  /** The shell committed once; the viewport hook has now read the screen. */
  | { readonly type: "mounted" }
  /** The first render with the resolved compact flag: make the start decision. */
  | { readonly type: "resolve"; readonly compact: boolean; readonly stored: boolean | null }
  /** ✕ or «Разбрах» — be rid of it for this showing. */
  | { readonly type: "dismiss" }
  /** The МЕНЮ row / roomy pill asked for the steps back. */
  | { readonly type: "recall" }
  /** A retry: „a retry's first showing is an arrival again", on this surface. */
  | { readonly type: "arrive"; readonly compact: boolean; readonly stored: boolean | null };

export const BRIEFING_START_INITIAL: BriefingStartState = Object.freeze({
  phase: "awaitingViewport",
  open: false,
});

export function briefingStartReducer(
  state: BriefingStartState,
  event: BriefingStartEvent,
): BriefingStartState {
  switch (event.type) {
    case "mounted":
      return state.phase === "awaitingViewport" ? { phase: "viewportRead", open: false } : state;
    case "resolve":
      // Only the render AFTER `mounted` may decide — that is the one carrying
      // the resolved compact value. Once decided (including by the student),
      // a resolve is ignored: the start decision is made once per arrival.
      return state.phase === "viewportRead"
        ? { phase: "decided", open: briefingAutoSetting(event.compact, event.stored) }
        : state;
    case "dismiss":
      return { phase: "decided", open: false };
    case "recall":
      return { phase: "decided", open: true };
    case "arrive":
      // A retry happens long after mount, so the compact value is resolved.
      return { phase: "decided", open: briefingAutoSetting(event.compact, event.stored) };
  }
}

/** Is the briefing card up? Never before the start decision exists. */
export function briefingIsOpen(state: BriefingStartState): boolean {
  return state.phase === "decided" && state.open;
}

/**
 * Does the roomy stage offer the «ⓘ Инструкции · N» recall pill?
 *
 * Only once the start decision EXISTS and the card is not up. Before `decided`
 * the card is closed because nobody has decided yet, not because the student
 * sent it away — gating the pill on `!briefingIsOpen` alone painted it for the
 * two committed frames before the roomy card arrived (round-1 verifier, low
 * finding): a control offering back a card that is about to appear anyway, then
 * vanishing under the student's pointer. A phone with nothing stored decides
 * CLOSED on that same frame, so it gets its pill no later than before.
 */
export function briefingRecallOffered(state: BriefingStartState): boolean {
  return state.phase === "decided" && !state.open;
}

/**
 * THE SHELL'S EFFECT BODY, as a function of what that render saw.
 *
 * The shell runs `useEffect(() => { const e = nextBriefingStartEvent(state,
 * compact, stored); if (e) dispatch(e); }, [state, compact, stored])`. Keeping
 * the body here is what lets the suite drive the SAME code through the same
 * render sequence React does (`briefing-start.test.ts`), instead of asserting a
 * predicate the component might have stopped calling.
 */
export function nextBriefingStartEvent(
  state: BriefingStartState,
  compact: boolean,
  stored: boolean | null,
): BriefingStartEvent | null {
  switch (state.phase) {
    case "awaitingViewport":
      // `compact` here is the value of the FIRST render — the hook's
      // `useState(false)` — and must not be trusted. Only acknowledge the mount.
      return { type: "mounted" };
    case "viewportRead":
      return { type: "resolve", compact, stored };
    case "decided":
      return null;
  }
}
