/**
 * The one seam the offline renderer needs in the live hero scene.
 *
 * The pre-rendered loop that phones get (HeroLoopVideo) is not a second,
 * hand-made version of the hero — it is THIS scene, screenshotted frame by
 * frame at real GPU quality by tools/clips/headless/render-hero-loop.mjs. That
 * only works if the renderer can put the scene at an exact time and know the
 * pixels it grabs belong to it: at 25 fps a frame that renders 3 ms late is
 * 4 cm of road out of place, and 180 of those is a visible jitter in a loop
 * that is supposed to be the calmest thing on the page.
 *
 * The scene is already built for this. Every animated quantity in
 * HeroScene3D — camera pose, road scroll, wheel spin — is a pure function of
 * elapsed seconds (heroScene.ts), and nothing accumulates. So the whole
 * capture affordance is: let a caller substitute the clock. One optional prop,
 * one `??`, no branch anywhere else.
 *
 * It lives in its own file rather than inside HeroScene3D because that module
 * is the heavy dynamic chunk — three, R3F, drei — and the dev capture route
 * needs the TYPE at build time without dragging any of that into its own
 * graph.
 *
 * In production `timeSec` is never passed, `sceneTime` is one nullish
 * coalesce per animated component per frame, and the branch is dead.
 */

export interface HeroClockProps {
  /**
   * OFFLINE CAPTURE ONLY — scene time in seconds, replacing the wall clock.
   *
   * `null`/omitted is the live behaviour: the scene reads R3F's own clock and
   * runs in real time. A number freezes the scene at that instant, so the
   * renderer can seek, wait for a repaint, and screenshot a frame it can prove
   * is the one it asked for.
   */
  timeSec?: number | null;
}

/**
 * The clock an animated component should read this frame.
 *
 * Written as an explicit helper rather than inlined at each of the three call
 * sites so the next animated part of the scene has an obvious thing to copy —
 * a component that quietly reads `state.clock.elapsedTime` directly would
 * animate during an offline capture and put motion blur into a still.
 */
export function sceneTime(timeSec: number | null | undefined, elapsedSec: number): number {
  return timeSec ?? elapsedSec;
}
