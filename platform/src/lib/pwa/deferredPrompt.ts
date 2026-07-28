"use client";

/**
 * Holds Chromium's `beforeinstallprompt` event so a React component can use it
 * later.
 *
 * WHY A MODULE AND NOT A useEffect. The event fires ONCE, on the browser's
 * schedule, and it cannot be re-requested: miss it and the install button never
 * appears for that page view. On a repeat visit — service worker already
 * installed, manifest already cached — Chromium can fire it before React has
 * hydrated, so a listener attached in `useEffect` is attached too late.
 *
 * Module scope is the earliest point the app's own JavaScript runs, and this
 * module is pulled into the initial client bundle by the root layout, so the
 * listener is attached as the first bundle executes rather than after the tree
 * mounts. `preventDefault()` suppresses Chromium's own mini-infobar — which is
 * the point: the affordance is ours, it is dismissible, and it stays out of
 * the way (see lib/pwa/install.ts for where it is allowed to appear).
 *
 * `appinstalled` clears the stored event: once the app is on the home screen
 * there is nothing left to prompt, and holding a spent event would let a stale
 * button call `prompt()` into an error.
 *
 * No identifiers, no storage, no network. ADR-004.
 */

/** The Chromium-only event. Not in lib.dom, so it is declared here. */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

/** The captured event, or null if the browser never offered one. */
export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

/** Subscribe to capture/clear. Returns the unsubscribe function. */
export function subscribeDeferredPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Open the OS install sheet. Returns the student's answer, or `"unavailable"`
 * when there was no event to spend (a second click, or a browser that never
 * fired one).
 *
 * The event is discarded either way: `prompt()` may be called at most once per
 * event, and Chromium fires a fresh one if the app becomes installable again.
 */
export async function promptInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = null;
  emit();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  } catch {
    return "unavailable";
  }
}
