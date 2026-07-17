"use client";

// Reverse-view setting store — module-level (no new deps), persisted to
// localStorage, consumed via useSyncExternalStore. Same shape as the quality
// store (environment/qualityStore.ts, the exemplar): one module-level value, a
// listener set, and a persist() that tolerates storage being unavailable.
//
// DEFAULT ON: the swing is the pedagogy — a driver who reverses without
// looking back is precisely what this teaches away from — so the student opts
// OUT, never in. Key K toggles it (bound by CameraRig, advertised in the
// LessonScene legend); the setting only ever DISABLES the automatic swing, it
// never forces a view.

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "aidrive.sim.reverseView.v1";

const DEFAULT_ENABLED = true;

function loadStored(): boolean {
  if (typeof window === "undefined") return DEFAULT_ENABLED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_ENABLED;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "boolean" ? parsed : DEFAULT_ENABLED;
  } catch {
    return DEFAULT_ENABLED;
  }
}

let enabled: boolean = loadStored();

const listeners = new Set<() => void>();

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
  } catch {
    // Storage may be unavailable (private mode, quota) — the setting still
    // works for the session, it just won't be remembered.
  }
}

/**
 * Current setting. Read per FRAME by CameraRig — a plain module read, no hook,
 * no subscription, no allocation.
 */
export function getReverseViewEnabled(): boolean {
  return enabled;
}

export function setReverseViewEnabled(next: boolean): void {
  if (next === enabled) return;
  enabled = next;
  persist();
  for (const fn of listeners) fn();
}

/** K — flip the setting (the legend row reflects the result live). */
export function toggleReverseViewEnabled(): void {
  setReverseViewEnabled(!enabled);
}

export function subscribeReverseView(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The setting as a React hook (the legend; any future settings UI). */
export function useReverseViewEnabled(): boolean {
  return useSyncExternalStore(
    subscribeReverseView,
    getReverseViewEnabled,
    () => DEFAULT_ENABLED,
  );
}

export { STORAGE_KEY as REVERSE_VIEW_STORAGE_KEY };
