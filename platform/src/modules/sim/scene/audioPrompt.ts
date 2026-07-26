// audioPrompt.ts — „звукът е част от урока" (doc 82 §4.4).
//
// This is the cheapest PEDAGOGICAL win in the whole feel plan, and it is not
// a nicety. Removing auditory feedback makes drivers UNDERESTIMATE speed and
// over-produce it by ~3.2 km/h; visual-only simulators over-produce speed by
// ~10% (Frontiers in Psychology 2024; Ergonomics / ScienceDirect). A muted
// session therefore teaches a systematically FASTER car than the student will
// actually drive — which is the exact opposite of the north star.
//
// So audio is treated as part of the lesson, not as a preference: one line at
// the existing unlock gesture, dismissible, never nagging. Pure and
// node-testable; the React shell (components/sim/AudioLessonPrompt) only
// renders whatever state this returns.

/** Persisted dismissal — once the student has read it, it stays read. */
export const AUDIO_PROMPT_STORAGE_KEY = "knijka.sim.audioPromptSeen";

/**
 * What the prompt is currently saying, or null for "say nothing":
 *  - "locked" — the AudioContext has never been unlocked (no gesture yet), so
 *    the student is driving in silence without having chosen to.
 *  - "muted"  — the graph exists but the student muted it. Same pedagogical
 *    problem, different fix, so it gets its own line.
 */
export type AudioPromptState = "locked" | "muted" | null;

/** bg-BG copy. Instructor register — states the reason, never scolds. */
export const AUDIO_PROMPT_LOCKED_BG =
  "Звукът е част от урока — без него ще караш по-бързо, отколкото усещаш.";
export const AUDIO_PROMPT_MUTED_BG =
  "Звукът е изключен. Включи го — двигателят и гумите носят половината от усещането за скорост.";
/** Dismiss control label. */
export const AUDIO_PROMPT_DISMISS_BG = "Разбрах";

/**
 * The single rule. Dismissal wins over everything: a student who has read the
 * line and still chooses silence is making an informed choice, and doc 82 §7
 * rule 31 (do not make the coaching layer chatty) applies to this line too.
 */
export function audioPromptState(input: {
  unlocked: boolean;
  muted: boolean;
  dismissed: boolean;
}): AudioPromptState {
  if (input.dismissed) return null;
  if (!input.unlocked) return "locked";
  if (input.muted) return "muted";
  return null;
}

/** The bg-BG line for a state (never called with null). */
export function audioPromptTextBg(state: Exclude<AudioPromptState, null>): string {
  return state === "locked" ? AUDIO_PROMPT_LOCKED_BG : AUDIO_PROMPT_MUTED_BG;
}

/** Read the persisted dismissal (false when storage is blocked). */
export function loadAudioPromptDismissed(): boolean {
  try {
    return window.localStorage.getItem(AUDIO_PROMPT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the dismissal (non-fatal when storage is blocked). */
export function storeAudioPromptDismissed(): void {
  try {
    window.localStorage.setItem(AUDIO_PROMPT_STORAGE_KEY, "1");
  } catch {
    // non-fatal — the prompt simply returns next session
  }
}
