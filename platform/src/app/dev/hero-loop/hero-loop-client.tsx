"use client";

/**
 * Hero-loop capture client (DEV ONLY) — the browser half of the loop renderer.
 *
 * Mounts the REAL marketing hero scene (HeroScene3D, ssr:false — it touches
 * three and the GLB loader) with its clock taken over, and publishes a small
 * control surface on `window.__heroLoop` for the Playwright driver in
 * tools/clips/headless/render-hero-loop.mjs:
 *
 *   state    "loading" | "ready" | "error"   poll until ready, then shoot
 *   fps      frame rate the times below were spaced at
 *   times    scene time (s) for every frame of the loop, in order
 *   seek(i)  put the scene at times[i]
 *
 * `times` comes straight from `heroLoopVideoTime` rather than being recomputed
 * in the driver. The window that makes this loop seamless is a real piece of
 * the shot's design (heroScene.ts explains the arithmetic), and a second copy
 * of it in a .mjs file is exactly the kind of drift that would show up as a
 * jump every 7.2 s on a phone nobody in this repo is holding.
 *
 * There is deliberately no chrome, no scrim, no copy and no plate here: the
 * driver screenshots the viewport, so the viewport must be nothing but the
 * scene. LiveHero's scrim and grain are applied over the video at runtime;
 * baking them into the file would double them on the phone.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  HERO_LOOP_VIDEO_FPS,
  HERO_LOOP_VIDEO_FRAMES,
  heroLoopVideoTime,
} from "@/components/marketing/hero/heroScene";

const HeroScene3D = dynamic(() => import("@/components/marketing/hero/HeroScene3D"), {
  ssr: false,
});

interface HeroLoopApi {
  state: "loading" | "ready" | "error";
  error?: string;
  fps: number;
  times: number[];
  seek: (index: number) => void;
}

declare global {
  interface Window {
    __heroLoop?: HeroLoopApi;
  }
}

/** Every frame's scene time, computed once — the driver reads this list. */
const TIMES = Array.from({ length: HERO_LOOP_VIDEO_FRAMES }, (_, i) => heroLoopVideoTime(i));

export function HeroLoopClient() {
  // Frame 0 is the pose the driver will grab first; starting anywhere else
  // would make the first capture the only one preceded by a camera jump.
  const [timeSec, setTimeSec] = useState(TIMES[0]);
  const [ready, setReady] = useState(false);

  // The published `seek` has to survive React re-renders, so it closes over a
  // ref rather than over the setter's current identity.
  const setTimeRef = useRef(setTimeSec);
  setTimeRef.current = setTimeSec;

  const onReady = useCallback(() => {
    setReady(true);
    if (window.__heroLoop) window.__heroLoop.state = "ready";
  }, []);

  useEffect(() => {
    window.__heroLoop = {
      state: "loading",
      fps: HERO_LOOP_VIDEO_FPS,
      times: TIMES,
      seek: (index: number) => {
        const t = TIMES[index];
        if (t === undefined) return;
        setTimeRef.current(t);
      },
    };
    // Boot once — nothing in the surface depends on a changing value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main
      data-hero-loop="scene"
      data-ready={ready ? "1" : "0"}
      // Fixed to the viewport so `page.screenshot()` with no clip IS the frame:
      // no scroll, no margin, no letterbox to crop out later. The background is
      // the plate's own zenith so a dropped frame would be obvious rather than
      // blending into a white page.
      style={{ position: "fixed", inset: 0, background: "#04060b" }}
    >
      <HeroScene3D timeSec={timeSec} onReady={onReady} />
    </main>
  );
}
