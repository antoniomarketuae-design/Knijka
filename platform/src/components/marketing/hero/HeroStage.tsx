"use client";

/**
 * The gate between the plate, the pre-rendered loop and the live 3D — and the
 * only Client Component the landing page pays for up front.
 *
 * Everything expensive is behind `next/dynamic(..., { ssr: false })`, so the
 * landing route's bundle carries this file plus heroCapability.ts and nothing
 * else; three.js, the R3F reconciler, the Draco decoder and the car GLB are a
 * separate chunk that is fetched only after this component has decided the
 * visitor can afford it. That decision happens at IDLE, never during
 * hydration: the plate is the LCP element and nothing on this page is allowed
 * to compete with it.
 *
 * The four states, in order of how many visitors see them:
 *   plate            — the SVG below, untouched. The SSR answer, and final for
 *                      anyone who asked for less motion or fewer bytes.
 *   plate + loop     — the pre-rendered dusk video crossfaded over the plate.
 *                      MOST PHONES. See HeroLoopVideo for why this rung exists.
 *   plate + loading  — eligible for 3D, chunk in flight. Still the plate.
 *   plate + scene    — the canvas crossfaded over the plate, both mounted.
 *
 * TWO DOORS, NOT ONE. `decideHeroStage` answers "can this visitor afford a
 * WebGL runtime"; `decideHeroLoop` answers "may this visitor be shown moving
 * pixels at all". A phone fails the first and passes the second, which is the
 * entire point — the founder's complaint was about a still hero on a phone,
 * and folding the two questions into one gate is how it got that way.
 *
 * The plate is NEVER unmounted. It is what shows through the canvas's alpha
 * on the first frames, what shows under a video that has not decoded yet, what
 * remains if the GL context is lost mid-session, and what the page falls back
 * to with no repaint if either upper layer is removed.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  decideHeroLoop,
  decideHeroStage,
  probeWebgl,
  readHeroSignals,
  type HeroLoopDecision,
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

/**
 * The loop is dynamic too, for a smaller but real reason: `ssr: false` is a
 * hard guarantee that no `<video autoplay preload="auto">` ever reaches the
 * server HTML, where the browser's preload scanner would start fetching it
 * before this component has read a single signal — including
 * `prefers-reduced-motion`. The bytes are then spent on someone who asked us
 * not to spend them, whatever we render afterwards.
 */
const HeroLoopVideo = dynamic(
  () => import("./HeroLoopVideo").then((m) => ({ default: m.HeroLoopVideo })),
  { ssr: false, loading: () => null },
);

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
  // Same rule, same reason: "server" is the honest pre-signal answer, and a
  // still first render is what makes hydration mismatch impossible.
  const [loop, setLoop] = useState<HeroLoopDecision>({ mode: "still", reason: "server" });
  const [sceneReady, setSceneReady] = useState(false);
  const [loopPlaying, setLoopPlaying] = useState(false);
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
    // Read once, decide twice. The loop answer is independent of the WebGL
    // probe (it is the door for the machines that FAIL that probe), so it is
    // settled before the expensive question is even asked.
    setLoop(decideHeroLoop(signals));
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
  // The loop is the fallback's motion, so it runs only when the 3D does not.
  // Both at once would decode a video nobody can see behind an opaque canvas —
  // the one combination that costs a visitor twice for one image.
  const looping = !live && loop.mode === "loop";
  const paused = userPaused || offscreen || tabHidden;

  const onReady = useCallback(() => setSceneReady(true), []);
  const onLoopPlaying = useCallback(() => setLoopPlaying(true), []);
  // Either upper layer, once it is actually showing pixels, is auto-playing
  // motion beside the copy — which is what WCAG 2.2.2 attaches the control to.
  const motionOnScreen = (live && sceneReady) || (looping && loopPlaying);

  return (
    <div
      ref={hostRef}
      className={`pointer-events-none ${className}`}
      // Not decoration: "why is there no 3D on this machine" should be one
      // look at the DOM, not a bisect.
      data-hero-mode={decision.mode}
      data-hero-decline={decision.reason ?? undefined}
      // The second door gets its own pair, for the same debugging reason: on a
      // phone `data-hero-decline` will always say "narrow-viewport", and the
      // question worth answering there is why the FALLBACK is or is not moving.
      data-hero-loop={looping ? "loop" : "still"}
      data-hero-loop-decline={loop.reason ?? undefined}
    >
      {looping ? (
        // Under the scene's z-10 layer is irrelevant (the two are mutually
        // exclusive) but it must sit under LiveHero's reading scrim, exactly
        // like the canvas, so the headline's contrast is guaranteed by one
        // layer whichever image is underneath.
        <div className="absolute inset-0 z-10">
          <HeroLoopVideo
            onPlaying={onLoopPlaying}
            paused={paused}
            visible={loopPlaying}
          />
        </div>
      ) : null}

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

      {/* WCAG 2.2.2 (Pause, Stop, Hide): both upper layers are auto-playing
          motion that runs longer than five seconds alongside the copy, so a
          control to stop it is a requirement, not a courtesy. It appears only
          once the motion actually exists — on the plate there is nothing to
          pause, and on a phone whose autoplay was refused there is nothing
          either.

          `top-…` on a phone, `bottom-…` on a desktop, and that is not a taste
          call. On desktop the hero is 44 rem tall and the landing page's
          telemetry rail sits comfortably inside it, so the bottom-right corner
          is empty. On a phone the copy alone fills the section and the rail
          hangs off the bottom edge on a `-mt-8`, directly over that corner:
          captured at 390 × 844, a bottom-anchored control came out half-buried
          behind the rail's panel. A control that satisfies 2.2.2 has to be
          operable, so on narrow screens it moves to the top of the band —
          `top-4` clears the sticky header, which ends well above the hero.

          It is the ONLY thing in this component that may sit above LiveHero's
          scrim (z-30 vs the scrim's z-10), which is why the stage root
          deliberately establishes no stacking context. */}
      {motionOnScreen ? (
        <button
          type="button"
          onClick={() => setUserPaused((was) => !was)}
          aria-pressed={userPaused}
          className="pointer-events-auto absolute right-4 top-4 z-30 rounded-full border border-border-strong bg-background/85 px-3.5 py-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-foreground backdrop-blur-sm transition hover:border-accent hover:text-accent motion-reduce:transition-none lg:bottom-4 lg:top-auto"
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
