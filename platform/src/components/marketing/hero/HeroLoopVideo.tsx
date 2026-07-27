"use client";

/**
 * The middle rung of the hero: the dusk drive as a pre-rendered loop.
 *
 * WHY THIS FILE EXISTS. The founder opened the landing page on his phone and
 * called it broken — "the car and the road dont move at all so this dont
 * work". The plate was doing exactly what heroCapability.ts asks of it, and
 * that was the bug: on a page selling a driving SIMULATOR, a motionless
 * photograph at the top does not read as a considered fallback, it reads as an
 * asset that failed to load. So the phone gets motion — just not by shipping
 * three.js to it.
 *
 * WHAT IT COSTS, AND WHY THAT IS THE WHOLE ARGUMENT. The live scene is a
 * three.js runtime, an R3F reconciler, a Draco decoder, a GLB and a GPU
 * context that keeps drawing for as long as the section is visible. This is
 * one cacheable file that a phone hands to a fixed-function video decoder —
 * the same hardware path that plays every clip in the student's social feed,
 * at a fraction of the battery of the scroll animations already on this page.
 * That difference is why `decideHeroLoop` is a separate, far more permissive
 * door than `decideHeroStage`.
 *
 * THE FOUR GUARANTEES, each of which is a line of code below:
 *   - it never blocks first paint — the stage mounts this only at idle, after
 *     the plate has already won the LCP race, so the element (and therefore
 *     the request) does not exist during hydration;
 *   - it never plays when the visitor asked for less motion or fewer bytes —
 *     that is `decideHeroLoop`, upstream, and it is re-evaluated live when the
 *     OS setting changes;
 *   - it never shows a hole — opacity stays 0 until the decoder reports it is
 *     actually PLAYING, so a blocked autoplay (iOS Low Power Mode), a 404, a
 *     codec neither source satisfies, or a stalled network all resolve to
 *     "the plate, unchanged";
 *   - it stops when nobody is looking — the stage pauses it off-screen, on a
 *     hidden tab, and on the WCAG 2.2.2 control.
 *
 * TWO SOURCES, IN PREFERENCE ORDER. VP9-in-WebM is markedly smaller at this
 * grade (a dark, low-detail, slow-moving frame is what VP9 is best at) and
 * every Android and every desktop browser takes it. H.264-in-MP4 is the
 * fallback that covers older iOS, where WebM support only arrived recently and
 * a hero that silently does nothing on an iPhone would be the same bug in a
 * different hemisphere. The browser picks one and fetches one.
 */

import { useEffect, useRef, useState } from "react";
import { HERO_BAND_CLASS } from "./HeroPlate";

/**
 * The rendered loop. Produced by tools/clips/headless/render-hero-loop.mjs
 * from the very scene HeroScene3D draws, so the desktop's live 3D and the
 * phone's video are the same shot rather than two interpretations of it.
 */
export const HERO_LOOP_WEBM = "/hero/hero-loop.webm";
export const HERO_LOOP_MP4 = "/hero/hero-loop.mp4";

/** How long the video takes to fade up over the plate, ms — HeroStage's number. */
const FADE_MS = 900;

export interface HeroLoopVideoProps {
  /** Fired on the first `playing` event: the pixels are real, fade them up. */
  onPlaying?: () => void;
  /** Off-screen, hidden tab, or the visitor pressed Пауза. */
  paused?: boolean;
  /** True once the caller has crossfaded this layer in. */
  visible?: boolean;
}

export function HeroLoopVideo({ onPlaying, paused = false, visible = false }: HeroLoopVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Latched, not derived: once the loop has proven it can play we keep it
  // mounted and let `paused` drive it. A `playing` event that arrives twice
  // (a resume) must not restart the crossfade.
  const [started, setStarted] = useState(false);

  // `autoPlay` alone is not enough to rely on. Browsers apply the muted-
  // autoplay policy at slightly different moments, and an element inserted
  // into an ALREADY-hydrated tree (which this one always is — the stage mounts
  // it at idle) is the case most likely to miss the automatic start. Calling
  // play() explicitly and swallowing the rejection covers it without changing
  // what happens when it is genuinely refused: no `playing` event, opacity
  // stays 0, the plate remains the hero.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) {
      video.pause();
      return;
    }
    const attempt = video.play();
    // Older Safari returns undefined rather than a promise.
    if (attempt && typeof attempt.catch === "function") attempt.catch(() => {});
  }, [paused]);

  return (
    // The IDENTICAL box the plate crops its drawing into (HERO_BAND_CLASS) —
    // on a narrow screen the plate is a band across the lower two-thirds, and
    // a full-bleed video over it would be a different composition, so the
    // crossfade would read as a cut instead of as the same frame gaining
    // motion.
    <div
      className={`${HERO_BAND_CLASS} transition-opacity motion-reduce:transition-none`}
      style={{ transitionDuration: `${FADE_MS}ms`, opacity: visible ? 1 : 0 }}
    >
      <video
        ref={videoRef}
        // `playsInline` is not optional: without it iOS takes any autoplaying
        // video fullscreen, which would replace the landing page with a
        // silent film of a road.
        playsInline
        // `muted` is what makes autoplay legal at all. There is no audio track
        // in the file either — see the renderer's `-an`.
        muted
        loop
        autoPlay
        // The stage only mounts this after the plate has painted, so "auto" is
        // an idle-time fetch, not a competitor for the critical path. Anything
        // lazier just delays the motion the founder asked for.
        preload="auto"
        // Decorative, exactly like the plate and the canvas: the section owns
        // the accessible name, and none of the three carries information the
        // copy does not already carry.
        aria-hidden
        tabIndex={-1}
        disablePictureInPicture
        // `object-right-bottom` is the CSS spelling of the plate SVG's
        // `preserveAspectRatio="xMaxYMax slice"`. The right-hand third is where
        // the composition lives — the car, the sun band, the vanishing point —
        // and anchoring anywhere else would crop the car out on exactly the
        // devices this file exists for.
        className="h-full w-full object-cover object-right-bottom"
        onPlaying={() => {
          if (started) return;
          setStarted(true);
          onPlaying?.();
        }}
      >
        <source src={HERO_LOOP_WEBM} type="video/webm" />
        <source src={HERO_LOOP_MP4} type="video/mp4" />
      </video>
    </div>
  );
}

export default HeroLoopVideo;
