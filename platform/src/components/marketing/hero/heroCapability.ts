/**
 * Can THIS visitor afford the live 3D hero — and if not, exactly why?
 *
 * The landing page is the funnel, and the funnel's median device is a
 * mid-range Android on mobile data (docs/simulation/82 §2.2: Galaxy A16 /
 * Redmi Note class, dpr cap 1.0, first-playable wire ≤3.5 MB). The 3D hero
 * costs a three.js runtime + the Draco decoder + the hero-car GLB before it
 * draws a single pixel — a cost that buys nothing on a phone, because the
 * phone visitor already gets the whole composition from the zero-JS plate.
 *
 * So this file is the door, and it is deliberately CLOSED by default: every
 * unknown resolves to the plate. A wrong "yes" costs a teenager megabytes of
 * their data plan; a wrong "no" costs us a camera move they were never going
 * to see on a 6-inch screen anyway.
 *
 * Pure data & math — no DOM, no three.js, no React (the presets.ts /
 * quality.ts split, for the same reason): vitest exercises every branch in
 * plain Node. The DOM-touching half (`readHeroSignals`, `probeWebgl`) moved to
 * `@/lib/visual/deviceSignals` when the authenticated app grew a door of its
 * own (components/deck). The SIGNALS and the decline VOCABULARY are now shared,
 * so the two doors are comparable; the POLICY below stays here, because "can
 * this visitor afford three.js" is not the question the deck asks. Every name
 * this module used to export is still exported, with the same value.
 */

import {
  isSlowConnection,
  SLOW_CONNECTIONS,
  UNKNOWN_SIGNALS,
  type DeviceDeclineReason,
  type DeviceSignals,
} from "@/lib/visual/deviceSignals";

export { probeWebgl, readDeviceSignals as readHeroSignals } from "@/lib/visual/deviceSignals";

/** What the hero is showing right now. */
export type HeroStageMode =
  /** The zero-JS dusk plate. The default, and the only thing most phones see. */
  | "plate"
  /** The plate plus the live WebGL scene crossfaded over it. */
  | "live3d";

/**
 * Why the door stayed shut. The union itself is `DeviceDeclineReason` in
 * `@/lib/visual/deviceSignals`, so the hero's `data-hero-decline` and the
 * deck's `data-deck-decline` cannot drift into two vocabularies for one idea.
 */
export type HeroDeclineReason = DeviceDeclineReason;

/**
 * Everything the decision reads — `DeviceSignals` in
 * `@/lib/visual/deviceSignals`. See there for why every `null` means "no
 * evidence against" and never a device class.
 */
export type HeroSignals = DeviceSignals;

export interface HeroStageDecision {
  mode: HeroStageMode;
  /** `null` exactly when mode is "live3d". */
  reason: HeroDeclineReason | null;
}

/**
 * Narrowest viewport that gets the live scene, CSS px.
 *
 * 1024 is not a phone/desktop guess — it is the width below which the shot
 * itself stops working: the composition puts the headline column beside the
 * car, and under ~1024 the two collide and the 3D degrades into an expensive
 * texture behind text. The touch gate below catches phones; this one catches
 * a half-width desktop window, where the plate is also simply the better image.
 */
export const HERO_MIN_VIEWPORT_PX = 1024;

/**
 * Device-memory floor, GB. 4 rather than 8 on purpose: Chromium clamps the
 * reported value to 8, so 8 would exclude every 8 GB laptop that reports
 * exactly the cap, and the scene itself is far inside the phone budget
 * (docs/simulation/82 §2.2) once it is loaded. This gate is about the 2 GB
 * netbook class, not about grading laptops.
 */
export const HERO_MIN_DEVICE_MEMORY_GB = 4;

/** Core floor. Below 4, decoding the Draco GLB competes with the main thread. */
export const HERO_MIN_CORES = 4;

/**
 * Connection classes that never get the 3D. 3g is in the list deliberately: on
 * a real Bulgarian 3g cell the three.js chunk alone is several seconds of a
 * blank hero, and the plate is already the finished image. Shared, because the
 * deck refuses the same classes for the same reason.
 */
export const HERO_SLOW_CONNECTIONS = SLOW_CONNECTIONS;

/** The pre-hydration / SSR answer. Every field unknown, so the door is shut. */
export const HERO_UNKNOWN_SIGNALS: HeroSignals = UNKNOWN_SIGNALS;

/**
 * The door. Ordered, first match wins — and the order is not arbitrary: the
 * two signals the VISITOR set (reduced motion, save data) are checked before
 * anything we inferred about their hardware, so the reported reason is the
 * one they would recognise as their own choice.
 */
export function decideHeroStage(signals: HeroSignals): HeroStageDecision {
  const decline = (reason: HeroDeclineReason): HeroStageDecision => ({
    mode: "plate",
    reason,
  });

  // Explicit user preferences first — these are consent-shaped, not hints.
  if (signals.reducedMotion === true) return decline("reduced-motion");
  if (signals.saveData === true) return decline("save-data");

  // Network: cheap to check, and the most expensive thing to get wrong.
  if (isSlowConnection(signals)) return decline("slow-network");

  // Viewport: unknown width means we are not in a browser yet.
  if (signals.viewportWidthPx === null) return decline("server");
  if (signals.viewportWidthPx < HERO_MIN_VIEWPORT_PX) return decline("narrow-viewport");

  // A touch-primary device is a phone or a tablet however wide it claims to
  // be. `anyFinePointer` is the escape hatch for a touchscreen laptop, which
  // reports coarse for its screen and fine for its trackpad.
  if (signals.coarsePointer === true && signals.anyFinePointer !== true) {
    return decline("touch-primary");
  }

  // Hardware floors — skipped entirely when the browser withheld the number.
  if (signals.deviceMemoryGb !== null && signals.deviceMemoryGb < HERO_MIN_DEVICE_MEMORY_GB) {
    return decline("low-memory");
  }
  if (signals.hardwareConcurrency !== null && signals.hardwareConcurrency < HERO_MIN_CORES) {
    return decline("few-cores");
  }

  // WebGL last: `null` is "not probed yet" and passes, because the stage
  // probes only after this function has already cleared everything cheaper.
  if (signals.webgl === false) return decline("no-webgl");

  return { mode: "live3d", reason: null };
}

// ---------------------------------------------------------------------------
// The second door: does the FALLBACK move?
// ---------------------------------------------------------------------------

/**
 * What the fallback layer is doing while the live 3D is off.
 *
 * The founder opened the landing page on his phone and reported it as broken:
 * "the car and the road dont move at all so this dont work". The plate was
 * behaving exactly as designed — and that is the problem. A perfectly still
 * dusk photograph at the top of a page whose whole promise is a DRIVING
 * simulator reads as a failed asset, not as a design decision. Motion is the
 * proof that the product runs.
 *
 * So there is a middle rung between the still plate and the live scene: a
 * short, silent, pre-rendered loop of the SAME shot (heroScene.ts's
 * `heroLoopVideoTime`), decoded by the platform's video pipeline instead of by
 * three.js.
 */
export type HeroLoopMode =
  /** Nothing moves. The still plate is final. */
  | "still"
  /** The pre-rendered dusk loop plays over the plate. */
  | "loop";

export interface HeroLoopDecision {
  mode: HeroLoopMode;
  /** `null` exactly when mode is "loop". */
  reason: HeroDeclineReason | null;
}

/**
 * The fallback door — and it is a DIFFERENT door from `decideHeroStage`,
 * because it is answering a different question.
 *
 * `decideHeroStage` is about a WebGL runtime: megabytes of JavaScript, a Draco
 * decoder, a GLB, a live GPU context and a render loop that keeps costing
 * battery for as long as the section is on screen. Every hardware doubt
 * resolves against it.
 *
 * This one is about ONE cacheable video file of a few hundred KB that a phone
 * decodes in fixed-function silicon — cheaper than the scroll animations
 * already on this page. Hardware cannot sensibly veto it: a machine too weak
 * to play a 1200×480 loop is too weak to render the page. So only the three
 * signals about COST OR CONSENT can, and they are checked in the same order
 * and reported with the same vocabulary as the stage decision, so
 * `data-hero-decline` means one thing wherever it appears.
 *
 *   reduced-motion  the visitor asked for less motion — a looping video is
 *                   exactly what they asked us not to autoplay,
 *   save-data       they asked the browser to spend fewer bytes,
 *   slow-network    2g/3g, where the file would arrive after they have gone,
 *   server          no signals read yet; the still plate is the SSR answer and
 *                   the loop is an upgrade applied at idle, never at hydration.
 *
 * Note what is NOT here: `no-webgl`, `low-memory`, `few-cores`,
 * `narrow-viewport` and `touch-primary` all send a visitor to the plate and
 * then straight on to the loop. That is the whole point — the phone is the
 * device the founder was holding.
 */
export function decideHeroLoop(signals: HeroSignals): HeroLoopDecision {
  const decline = (reason: HeroDeclineReason): HeroLoopDecision => ({
    mode: "still",
    reason,
  });

  if (signals.reducedMotion === true) return decline("reduced-motion");
  if (signals.saveData === true) return decline("save-data");

  if (isSlowConnection(signals)) return decline("slow-network");

  // The same "are we in a browser yet" proxy `decideHeroStage` uses. Without
  // it the server would render a <video> the client might immediately have to
  // take away, and the plate is the honest pre-hydration answer.
  if (signals.viewportWidthPx === null) return decline("server");

  return { mode: "loop", reason: null };
}
