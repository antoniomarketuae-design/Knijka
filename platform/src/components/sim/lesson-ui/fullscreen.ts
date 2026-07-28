/**
 * Fullscreen, feature-detected — the phone half of QW1.
 *
 * WHY THIS FILE EXISTS. `LessonPlayShell` used to call
 *
 *     void el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
 *
 * directly inside a mount effect. On **iPhone Safari `Element.requestFullscreen`
 * does not exist at all** (iOS exposes fullscreen only on `<video>`, via
 * `HTMLVideoElement.webkitEnterFullscreen`), so that line threw a *synchronous*
 * `TypeError: el.requestFullscreen is not a function` — not a rejected promise,
 * which is all the `.catch()` could ever have absorbed. React unwound the
 * effect to the nearest error boundary and every iPhone student got the
 * „Нещо се обърка" segment error page instead of the simulator, on every
 * lesson, every time, with „Опитай отново" re-mounting straight back into the
 * same crash. Measured on a 390×844 phone profile, 2026-07-28.
 *
 * So: nothing here may ever throw, and the caller must be able to ASK whether
 * fullscreen exists before it offers a button for it. Everything takes the
 * element/document as arguments so it is testable without a DOM.
 *
 * `webkit*` is kept because iPadOS and older desktop Safari implement exactly
 * that spelling; the unprefixed names cover everything else.
 */

/**
 * The subset of Element the fullscreen dance touches. `navigationUI` is typed
 * as the DOM lib's own union so a real `HTMLElement` structurally satisfies
 * this interface — the whole point is to accept `rootRef.current` unchanged.
 */
export interface FullscreenTarget {
  requestFullscreen?: (options?: {
    navigationUI?: "auto" | "hide" | "show";
  }) => unknown;
  webkitRequestFullscreen?: () => unknown;
}

/** The subset of Document the fullscreen dance touches. */
export interface FullscreenDocument {
  fullscreenElement?: unknown;
  webkitFullscreenElement?: unknown;
  exitFullscreen?: () => unknown;
  webkitExitFullscreen?: () => unknown;
}

/**
 * Both spellings of the change event. Subscribe to both: a browser that only
 * has `webkitRequestFullscreen` also only fires `webkitfullscreenchange`, and
 * an unheard-of event name is a no-op listener, never an error.
 */
export const FULLSCREEN_CHANGE_EVENTS = [
  "fullscreenchange",
  "webkitfullscreenchange",
] as const;

/** True when this browser can put an arbitrary element into fullscreen. */
export function supportsFullscreen(el: FullscreenTarget | null): boolean {
  if (el === null) return false;
  return (
    typeof el.requestFullscreen === "function" ||
    typeof el.webkitRequestFullscreen === "function"
  );
}

/** Whatever element is currently fullscreen, or null. Never throws. */
export function fullscreenElementOf(doc: FullscreenDocument | null): unknown {
  if (doc === null) return null;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/**
 * Ask for fullscreen. Returns false when the API is absent (the caller then
 * knows to letterbox instead of hoping); a *denied* request still returns true
 * — it was made, the browser simply said no, and the change event never fires.
 */
export function requestFullscreen(
  el: FullscreenTarget | null,
  doc: FullscreenDocument | null,
): boolean {
  if (el === null) return false;
  if (fullscreenElementOf(doc) !== null) return true;
  try {
    if (typeof el.requestFullscreen === "function") {
      settle(el.requestFullscreen({ navigationUI: "hide" }));
      return true;
    }
    if (typeof el.webkitRequestFullscreen === "function") {
      settle(el.webkitRequestFullscreen());
      return true;
    }
  } catch {
    // A synchronous throw (permissions policy, detached node) is the same
    // outcome for the student as no API at all: stay letterboxed.
    return false;
  }
  return false;
}

/** Leave fullscreen if we are in it. Returns whether an exit was issued. */
export function exitFullscreen(doc: FullscreenDocument | null): boolean {
  if (doc === null || fullscreenElementOf(doc) === null) return false;
  try {
    if (typeof doc.exitFullscreen === "function") {
      settle(doc.exitFullscreen());
      return true;
    }
    if (typeof doc.webkitExitFullscreen === "function") {
      settle(doc.webkitExitFullscreen());
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Swallow a returned promise's rejection without caring whether it is one. */
function settle(result: unknown): void {
  if (
    typeof result === "object" &&
    result !== null &&
    typeof (result as { then?: unknown }).then === "function"
  ) {
    void (result as Promise<unknown>).catch(() => {});
  }
}
