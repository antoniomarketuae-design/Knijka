"use client";

/**
 * The gate between the plate and the live 3D — and the only Client Component
 * the landing page pays for up front.
 *
 * Everything expensive is behind `next/dynamic(..., { ssr: false })`, so the
 * landing route's bundle carries this file plus heroCapability.ts and nothing
 * else; three.js, the R3F reconciler, the Draco decoder and the car GLB are a
 * separate chunk that is fetched only after this component has decided the
 * visitor can afford it. That decision happens at IDLE, never during
 * hydration: the plate is the LCP element and nothing on this page is allowed
 * to compete with it.
 *
 * The three states, in order of how many visitors see them:
 *   plate            — the SVG below, untouched. Most phones. Final.
 *   plate + loading  — eligible, chunk in flight. Still the plate on screen.
 *   plate + scene    — the canvas crossfaded over the plate, both mounted.
 *
 * The plate is NEVER unmounted. It is what shows through the canvas's alpha
 * on the first frames, what remains if the GL context is lost mid-session,
 * and what the page falls back to with no repaint if the scene is removed.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  decideHeroStage,
  probeWebgl,
  readHeroSignals,
  type HeroStageDecision,
} from "./heroCapability";

/**
 * `ssr: false` is load-bearing twice over: the scene needs a WebGL context
 * that does not exist on the server, and prerendering it would put its whole
 * import graph into the route's server bundle for a component most visitors
 * never receive.
 */
const HeroScene3D = dynamic(() => import("./HeroScene3D"), {
  ssr: false,
  // No loading UI on purpose — the plate underneath IS the loading UI, and a
  // spinner over a finished image would be a downgrade.
  loading: () => null,
});

/** How long the canvas takes to fade up over the plate, ms. */
const CROSSFADE_MS = 900;

/**
 * Run `task` when the browser is idle, with a hard ceiling so a permanently
 * busy main thread still gets there. `requestIdleCallback` is not in Safari
 * until 17, hence the timeout path.
 */
function scheduleIdle(task: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const ric = (window as Window & { requestIdleCallback?: typeof requestIdleCallback })
    .requestIdleCallback;
  if (typeof ric === "function") {
    const handle = ric(() => task(), { timeout: 2500 });
    const cic = (window as Window & { cancelIdleCallback?: typeof cancelIdleCallback })
      .cancelIdleCallback;
    return () => cic?.(handle);
  }
  const handle = window.setTimeout(task, 900);
  return () => window.clearTimeout(handle);
}

export interface HeroStageProps {
  className?: string;
}

export function HeroStage({ className = "" }: HeroStageProps) {
  // Start closed. "server" is the honest reason before any signal is read,
  // and it means a hydration mismatch is impossible: the server and the first
  // client render both produce an empty stage.
  const [decision, setDecision] = useState<HeroStageDecision>({
    mode: "plate",
    reason: "server",
  });
  const [sceneReady, setSceneReady] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);

  const hostRef = useRef<HTMLDivElement>(null);
  // Probed at most once per page load: some drivers cap live WebGL contexts
  // per document, and a probe we keep re-running is a context the real Canvas
  // eventually cannot get.
  const webglRef = useRef<boolean | null>(null);

  const evaluate = useCallback(() => {
    const signals = readHeroSignals();
    const cheap = decideHeroStage(signals);
    if (cheap.mode !== "live3d") {
      setDecision(cheap);
      return;
    }
    if (webglRef.current === null) webglRef.current = probeWebgl();
    setDecision(decideHeroStage({ ...signals, webgl: webglRef.current }));
  }, []);

  useEffect(() => scheduleIdle(evaluate), [evaluate]);

  // Re-decide when the answer could genuinely have changed. Reduced motion is
  // the important one: a visitor who turns it on mid-session must get the
  // still plate back immediately, not on the next navigation.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => evaluate();
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      // Debounced: a viewport dragged across the 1024 px threshold should
      // settle once, not thrash the decision through every intermediate width.
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

  // Stop rendering when nobody is looking. An idle WebGL canvas still costs a
  // GPU frame every 16 ms, and this one sits at the top of a page people
  // scroll past in two seconds.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setOffscreen(!entry.isIntersecting),
      { rootMargin: "80px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => setTabHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const live = decision.mode === "live3d";
  const paused = userPaused || offscreen || tabHidden;

  const onReady = useCallback(() => setSceneReady(true), []);

  return (
    <div
      ref={hostRef}
      className={`pointer-events-none ${className}`}
      // Not decoration: "why is there no 3D on this machine" should be one
      // look at the DOM, not a bisect.
      data-hero-mode={decision.mode}
      data-hero-decline={decision.reason ?? undefined}
    >
      {live ? (
        <div
          // z-10 puts the canvas level with the plate's own layer and UNDER
          // LiveHero's reading scrim. The stage root deliberately carries no
          // z-index of its own, so it forms no stacking context and the pause
          // control below can sit ABOVE that scrim while the scene sits under
          // it — the control has to stay legible, the scene has to be graded.
          className="absolute inset-0 z-10 transition-opacity motion-reduce:transition-none"
          style={{
            transitionDuration: `${CROSSFADE_MS}ms`,
            opacity: sceneReady ? 1 : 0,
          }}
        >
          <HeroScene3D onReady={onReady} paused={paused} />
        </div>
      ) : null}

      {/* WCAG 2.2.2 (Pause, Stop, Hide): the scene is auto-playing motion that
          runs longer than five seconds alongside the copy, so a control to
          stop it is a requirement, not a courtesy. It appears only once the
          motion actually exists — on the plate there is nothing to pause. */}
      {live && sceneReady ? (
        <button
          type="button"
          onClick={() => setUserPaused((was) => !was)}
          aria-pressed={userPaused}
          className="pointer-events-auto absolute bottom-4 right-4 z-30 rounded-full border border-border-strong bg-background/85 px-3.5 py-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-foreground backdrop-blur-sm transition hover:border-accent hover:text-accent motion-reduce:transition-none"
        >
          {userPaused ? "Пусни" : "Пауза"}
          <span className="visually-hidden">
            {userPaused ? " — пусни движението в сцената" : " — спри движението в сцената"}
          </span>
        </button>
      ) : null}
    </div>
  );
}
