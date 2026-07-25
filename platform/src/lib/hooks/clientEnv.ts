"use client";

/**
 * Client-environment hooks — the two "what is true only in the browser?"
 * questions this app asks over and over, answered through
 * `useSyncExternalStore` instead of a mount effect.
 *
 * Audit M-21. The pattern being replaced looked like this:
 *
 *   const [mounted, setMounted] = useState(false);
 *   useEffect(() => { setMounted(true); }, []);
 *
 * It works, but it is a synchronous setState inside an effect: React commits
 * the server-shaped render, then immediately re-renders. On the HUD that is a
 * wasted commit; in the R3F tree it is a wasted commit that can drag a scene
 * graph with it. It is also exactly the shape React Compiler is documented to
 * miscompile, which is why the rule is an error rather than a warning — and
 * render performance is a product feature on the one surface these run on.
 *
 * `useSyncExternalStore` says the same thing in one render: the server
 * snapshot is the pre-hydration answer, the client snapshot is the real one,
 * and React reconciles them without an extra commit.
 */

import { useSyncExternalStore } from "react";

/** Nothing to subscribe to: hydration happens once and never un-happens. */
function subscribeNever(): () => void {
  return () => {};
}

/**
 * False during SSR and the hydration render, true afterwards.
 *
 * Use it for things that genuinely cannot exist on the server — a portal into
 * `document.body`, a `window`-dependent measurement — NOT to hide content the
 * server could have rendered (that costs the user a blank first paint).
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function reducedMotionList(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(REDUCED_MOTION_QUERY);
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const list = reducedMotionList();
  if (list === null) return () => {};
  // The preference can flip mid-session (OS accessibility toggle); the old
  // effect-based readers sampled it once and never noticed.
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/**
 * The user's `prefers-reduced-motion` setting, live.
 *
 * The server snapshot is `false` — motion allowed — deliberately: the animated
 * markup is the richer one, so a reduced-motion user gets a single corrective
 * render on hydration rather than everyone else getting one.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => reducedMotionList()?.matches ?? false,
    () => false,
  );
}
