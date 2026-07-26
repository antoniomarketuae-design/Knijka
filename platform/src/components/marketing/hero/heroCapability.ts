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
 * plain Node. `readHeroSignals()` at the bottom is the one DOM-touching
 * function and it only READS; it makes no decision.
 */

/** What the hero is showing right now. */
export type HeroStageMode =
  /** The zero-JS dusk plate. The default, and the only thing most phones see. */
  | "plate"
  /** The plate plus the live WebGL scene crossfaded over it. */
  | "live3d";

/**
 * Why the door stayed shut. Not decoration: the stage puts it on a
 * `data-hero-decline` attribute so "why is there no 3D on my machine" is a
 * DevTools question, not a bisect.
 */
export type HeroDeclineReason =
  /** No window yet — SSR, or the first render before signals are read. */
  | "server"
  /** The visitor asked the OS for less motion. Non-negotiable. */
  | "reduced-motion"
  /** The visitor asked the browser to save data. Also non-negotiable. */
  | "save-data"
  /** navigator.connection says 3G or worse. */
  | "slow-network"
  /** Too little horizontal room for the shot to read as cinema. */
  | "narrow-viewport"
  /** Touch is the primary pointer — a phone or tablet, whatever its width. */
  | "touch-primary"
  /** navigator.deviceMemory below the floor (Chromium only; null = unknown). */
  | "low-memory"
  /** navigator.hardwareConcurrency below the floor. */
  | "few-cores"
  /** No WebGL context available (blocked, blacklisted, or already exhausted). */
  | "no-webgl";

/**
 * Everything the decision reads, in one plain object so the tests can build
 * a device by hand. `null` means "this browser would not tell us" and is
 * ALWAYS treated as "no evidence against", never as a device class —
 * deviceMemory is Chromium-only and hardwareConcurrency is capped/lied about
 * for privacy in Safari, so gating hard on either would silently turn the 3D
 * off for every Firefox and Safari desktop.
 */
export interface HeroSignals {
  /** prefers-reduced-motion: reduce */
  reducedMotion: boolean | null;
  /** navigator.connection.saveData */
  saveData: boolean | null;
  /** navigator.connection.effectiveType — "slow-2g" | "2g" | "3g" | "4g". */
  effectiveConnectionType: string | null;
  /** window.innerWidth in CSS px. */
  viewportWidthPx: number | null;
  /** pointer: coarse */
  coarsePointer: boolean | null;
  /** any-pointer: fine — a tablet with a stylus/trackpad still reads coarse. */
  anyFinePointer: boolean | null;
  /** navigator.deviceMemory, GB (Chromium only, clamped by the browser to 8). */
  deviceMemoryGb: number | null;
  /** navigator.hardwareConcurrency. */
  hardwareConcurrency: number | null;
  /**
   * Whether a WebGL context could actually be created. `null` = not probed
   * yet, which is the normal state for the cheap first pass: probing costs a
   * real GL context, so the stage only spends one after everything else has
   * already said yes.
   */
  webgl: boolean | null;
}

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
 * Connection classes that never get the 3D. 3g is in the list deliberately:
 * on a real Bulgarian 3g cell the three.js chunk alone is several seconds of
 * a blank hero, and the plate is already the finished image.
 */
export const HERO_SLOW_CONNECTIONS: readonly string[] = ["slow-2g", "2g", "3g"];

/** The pre-hydration / SSR answer. Every field unknown, so the door is shut. */
export const HERO_UNKNOWN_SIGNALS: HeroSignals = {
  reducedMotion: null,
  saveData: null,
  effectiveConnectionType: null,
  viewportWidthPx: null,
  coarsePointer: null,
  anyFinePointer: null,
  deviceMemoryGb: null,
  hardwareConcurrency: null,
  webgl: null,
};

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
  const ect = signals.effectiveConnectionType;
  if (ect !== null && HERO_SLOW_CONNECTIONS.includes(ect)) return decline("slow-network");

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
// The DOM side — reads only, decides nothing.
// ---------------------------------------------------------------------------

/** Shape of the (still non-standard) Network Information API we consume. */
interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Snapshot the live device. Every lookup is guarded: a browser that throws on
 * `matchMedia` or hides `navigator.connection` must yield `null`, not an
 * exception — an exception here would take the whole hero down, including the
 * plate.
 */
export function readHeroSignals(): HeroSignals {
  if (typeof window === "undefined") return HERO_UNKNOWN_SIGNALS;

  const mq = (query: string): boolean | null => {
    try {
      return typeof window.matchMedia === "function" ? window.matchMedia(query).matches : null;
    } catch {
      return null;
    }
  };

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: NetworkInformationLike;
  };
  const connection = nav.connection;

  return {
    reducedMotion: mq("(prefers-reduced-motion: reduce)"),
    saveData: typeof connection?.saveData === "boolean" ? connection.saveData : null,
    effectiveConnectionType:
      typeof connection?.effectiveType === "string" ? connection.effectiveType : null,
    viewportWidthPx: window.innerWidth || null,
    coarsePointer: mq("(pointer: coarse)"),
    anyFinePointer: mq("(any-pointer: fine)"),
    deviceMemoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency > 0
        ? nav.hardwareConcurrency
        : null,
    // Never probed here: creating a GL context is the single most expensive
    // thing on this page, and `decideHeroStage` may reject the device for
    // free before we would have needed the answer.
    webgl: null,
  };
}

/**
 * Try to create — and immediately throw away — a WebGL context.
 *
 * Called at most once, and only after `decideHeroStage` has already said yes,
 * because it is not free: some drivers cap live contexts at 8–16 per page and
 * a leaked probe context is one the real Canvas cannot have. `loseContext()`
 * hands it back immediately rather than waiting for GC.
 */
export function probeWebgl(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ??
      (canvas.getContext("webgl") as WebGLRenderingContext | null);
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
