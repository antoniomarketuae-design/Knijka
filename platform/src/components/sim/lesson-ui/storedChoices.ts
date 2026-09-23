"use client";

/**
 * THE STUDENT'S REMEMBERED CHOICES — hydration-safe (lane D, round 2).
 *
 * THE DEFECT. `LessonPlayShell` read three per-browser choices in lazy
 * `useState` initializers — the minimap, the „Съветник" toggle and the
 * micro-quiz frequency — each under the comment „safe: this shell mounts
 * client-side only, so there is no SSR/hydration pass to mismatch". That
 * belief is false on every `/simulator?scenario=…` deep link (see
 * `./useHintInput.ts` for the capture that proved it). The server has no
 * `localStorage`, so it wrote the DEFAULT; a returning student's hydration
 * render read the STORED value and produced different markup in the one layout
 * both passes agree on (roomy — `useCompactHud` is effect-resolved, so the
 * hydration render is roomy even on a phone):
 *
 *   minimap   „Карта изкл." → „Карта вкл.", the toggle's aria-pressed and
 *             ring, `--sim-minimap-clearance`, and the `<Minimap>` disc itself
 *             mounted where the server wrote nothing;
 *   advisor   the top-bar button „Съветник вкл." ↔ „Съветник изкл." (and its
 *             aria-pressed), whenever the stored choice differs from the
 *             lesson's default;
 *   quiz      `QuizFrequencySelector`'s pressed segment.
 *
 * React answers a text mismatch by discarding the subtree and regenerating it
 * on the client — the same failure mode as the hint vocabulary.
 *
 * THE FIX IS THE SAME PATTERN AS `useHintInput`: `useSyncExternalStore` with a
 * server snapshot of `null` („nothing stored — the server cannot know"), so the
 * server and the hydration render both print the default, and React re-renders
 * once with the stored value after hydration. A mount that is NOT hydrating
 * (the lesson was picked from the catalogue) reads the stored value on its
 * first render, so there is no default-flash there.
 *
 * The store also carries writes: a toggle writes through `writeStoredChoice`,
 * which updates an in-memory copy FIRST (so private mode, where `setItem`
 * throws, still honours the choice for the session — the old behaviour), then
 * tries `localStorage`, then notifies subscribers.
 *
 * NOT MIGRATED HERE, DELIBERATELY: `toastsQuiet`, `endAutoOpen` and the
 * briefing auto-open flag (the block at the shell's „Doc 86 L14/L15"), which
 * another lane is rewriting. They carry the same false comment and the same
 * class of risk; they are this module's next consumers.
 */

import { useCallback, useSyncExternalStore } from "react";
import {
  ADVISOR_STORAGE_KEY,
  defaultAdvisorEnabled,
  parseStoredAdvisorSetting,
  serializeAdvisorSetting,
  type LessonSpec,
  type QuizFrequency,
} from "@/modules/sim/lessons";
import { MICRO_QUIZ_STORAGE_KEY } from "./types";

// ---------------------------------------------------------------------------
// The store: raw strings by key.
// ---------------------------------------------------------------------------

const memory = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

/** The raw stored string, or null. What the CLIENT snapshot returns. */
export function readStoredChoice(key: string): string | null {
  const held = memory.get(key);
  if (held !== undefined) return held;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** What the SERVER snapshot (and so the hydration render) returns. */
export function serverStoredChoice(): string | null {
  return null;
}

/** Persist a choice; a throwing store leaves the in-memory value in charge. */
export function writeStoredChoice(key: string, value: string): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode etc. — the in-memory value still applies this session.
  }
  listeners.get(key)?.forEach((notify) => notify());
}

export function subscribeStoredChoice(key: string, notify: () => void): () => void {
  let set = listeners.get(key);
  if (set === undefined) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(notify);
  return () => {
    set.delete(notify);
  };
}

/** Tests only: forget every in-memory write and subscriber. */
export function resetStoredChoicesForTests(): void {
  memory.clear();
  listeners.clear();
}

/** The raw stored string for `key` — null during SSR and hydration. */
export function useStoredChoice(key: string): string | null {
  const subscribe = useCallback((notify: () => void) => subscribeStoredChoice(key, notify), [key]);
  const getSnapshot = useCallback(() => readStoredChoice(key), [key]);
  return useSyncExternalStore(subscribe, getSnapshot, serverStoredChoice);
}

// ---------------------------------------------------------------------------
// The three choices. Pure mappers (raw → value) + the hooks the shell calls.
// ---------------------------------------------------------------------------

/**
 * Minimap (founder review 2026-07-28): DEFAULT OFF, remembered per browser.
 * The key is unchanged from the shell's original `MINIMAP_STORAGE_KEY`, so
 * every existing student's choice survives the move.
 */
export const MINIMAP_STORAGE_KEY = "aidrive.sim.minimap.v1";

export function minimapOnFromStored(raw: string | null): boolean {
  return raw === "on";
}

export function useMinimapChoice(): [boolean, () => void] {
  const on = minimapOnFromStored(useStoredChoice(MINIMAP_STORAGE_KEY));
  // Reads the STORE, not a closure: the P key and the button share one stable
  // callback and can never toggle from a stale value.
  const toggle = useCallback(() => {
    const next = !minimapOnFromStored(readStoredChoice(MINIMAP_STORAGE_KEY));
    writeStoredChoice(MINIMAP_STORAGE_KEY, next ? "on" : "off");
  }, []);
  return [on, toggle];
}

/** Micro-quiz frequency; anything unrecognised is the default. */
export const DEFAULT_QUIZ_FREQUENCY: QuizFrequency = "occasional";

export function quizFrequencyFromStored(raw: string | null): QuizFrequency {
  return raw === "off" || raw === "occasional" || raw === "frequent"
    ? raw
    : DEFAULT_QUIZ_FREQUENCY;
}

export function useQuizFrequency(): [QuizFrequency, (f: QuizFrequency) => void] {
  const freq = quizFrequencyFromStored(useStoredChoice(MICRO_QUIZ_STORAGE_KEY));
  const update = useCallback((f: QuizFrequency) => writeStoredChoice(MICRO_QUIZ_STORAGE_KEY, f), []);
  return [freq, update];
}

/**
 * „Съветник": a persisted choice wins; nothing stored → the lesson-level
 * default (ON for beginner rungs, OFF from level 3 — advisor.ts).
 */
export function advisorOnFromStored(raw: string | null, lesson: LessonSpec): boolean {
  return parseStoredAdvisorSetting(raw) ?? defaultAdvisorEnabled(lesson);
}

export function useAdvisorChoice(lesson: LessonSpec): [boolean, () => void] {
  const on = advisorOnFromStored(useStoredChoice(ADVISOR_STORAGE_KEY), lesson);
  const toggle = useCallback(() => {
    const next = !advisorOnFromStored(readStoredChoice(ADVISOR_STORAGE_KEY), lesson);
    writeStoredChoice(ADVISOR_STORAGE_KEY, serializeAdvisorSetting(next));
  }, [lesson]);
  return [on, toggle];
}
