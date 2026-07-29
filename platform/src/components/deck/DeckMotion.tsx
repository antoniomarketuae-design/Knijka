"use client";

/**
 * The only JavaScript the deck costs — and it exists to decide NOT to do
 * things.
 *
 * It renders one absolutely-positioned `<div>` whose whole job is a
 * transform-only CSS animation: a wide, dim warm glow crossing the horizon over
 * 240 seconds. Nothing else. No canvas, no context, no fetch, no image (see
 * deckCapability.ts for why there is no WebGL rung anywhere in this component
 * tree).
 *
 * FOUR THINGS TURN IT OFF, and each is a real cost avoided:
 *
 *   the door        `decideDeckRung` — reduced motion, save-data, 2g/3g, a
 *                   phone, a narrow window, a 2 GB machine. Evaluated at IDLE,
 *                   never during hydration, so it can never compete with the
 *                   page's own first paint.
 *   the route       /simulator owns the GPU outright; a compositor animation
 *                   under a live WebGL canvas is frames taken from the thing
 *                   being graded.
 *   the tab         `document.hidden` stops the animation dead. An animation
 *                   nobody is looking at is pure battery.
 *   the SSR answer  "server" until the first idle callback, so the markup the
 *                   server sends and the markup the client first renders are
 *                   identical and hydration cannot mismatch.
 *
 * It is deliberately NOT wrapped in next/dynamic: there is nothing heavy behind
 * it to defer, and a dynamic import would cost an extra chunk request to save
 * a component smaller than the request.
 */

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { readDeviceSignals } from "@/lib/visual/deviceSignals";
import { decideDeckRung, isDeckStillRoute, type DeckDecision } from "./deckCapability";

/**
 * Run `task` when the browser is idle, with a hard ceiling so a permanently
 * busy main thread still gets there. `requestIdleCallback` is not in Safari
 * until 17, hence the timeout path. (The hero's stage does the same, for the
 * same reason.)
 */
function scheduleIdle(task: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const ric = (window as Window & { requestIdleCallback?: typeof requestIdleCallback })
    .requestIdleCallback;
  if (typeof ric === "function") {
    const handle = ric(() => task(), { timeout: 3000 });
    const cic = (window as Window & { cancelIdleCallback?: typeof cancelIdleCallback })
      .cancelIdleCallback;
    return () => cic?.(handle);
  }
  const handle = window.setTimeout(task, 1200);
  return () => window.clearTimeout(handle);
}

export function DeckMotion() {
  // "server" is the honest pre-signal answer, and a still first render is what
  // makes a hydration mismatch impossible.
  const [decision, setDecision] = useState<DeckDecision>({ rung: "still", reason: "server" });
  const [tabHidden, setTabHidden] = useState(false);
  const pathname = usePathname();

  const evaluate = useCallback(() => setDecision(decideDeckRung(readDeviceSignals())), []);

  useEffect(() => scheduleIdle(evaluate), [evaluate]);

  // Re-decide when the answer could genuinely have changed. Reduced motion is
  // the important one: a student who turns it on mid-session must get the still
  // deck back immediately, not on the next navigation.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => evaluate();
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      // Debounced: a window dragged across the 1024 px threshold should settle
      // once, not thrash the decision through every intermediate width.
      resizeTimer = window.setTimeout(evaluate, 250);
    };
    motion.addEventListener("change", onMotion);
    window.addEventListener("resize", onResize);
    return () => {
      motion.removeEventListener("change", onMotion);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(resizeTimer);
    };
  }, [evaluate]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => setTabHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const stillRoute = isDeckStillRoute(pathname ?? "");
  if (decision.rung !== "depth" || stillRoute) {
    // Not decoration: "why does my deck not move" should be one look at the
    // DOM, and the vocabulary is the hero's (`@/lib/visual/deviceSignals`).
    return (
      <span
        aria-hidden
        hidden
        data-deck-rung="still"
        data-deck-decline={stillRoute ? "sim-route" : decision.reason ?? undefined}
      />
    );
  }

  return (
    <div
      aria-hidden
      data-deck-rung="depth"
      className="deck-drift"
      // `paused`, not unmounted: unmounting drops the layer and forces the
      // compositor to rebuild it on every tab switch, which is more work than
      // the animation it was saving.
      data-deck-paused={tabHidden ? "" : undefined}
    />
  );
}
