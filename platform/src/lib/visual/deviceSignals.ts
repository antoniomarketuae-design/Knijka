/**
 * WHAT THIS DEVICE CAN AFFORD — read once, decided by whoever asked.
 *
 * The landing hero built this first (components/marketing/hero/heroCapability),
 * and its comment is the policy for the whole product: "A wrong 'yes' costs a
 * teenager megabytes of their data plan." The authenticated app now has its own
 * expensive-looking layer to gate (components/deck), which means either a
 * second copy of this reasoning or one shared module. Two copies of a
 * capability gate is how a product ends up honouring `prefers-reduced-motion`
 * on its landing page and ignoring it everywhere behind the login.
 *
 * So: the SIGNALS and the VOCABULARY live here. The POLICY does not — each
 * surface answers its own question with its own door, because the questions are
 * genuinely different (heroCapability's `decideHeroStage` asks "can this
 * visitor afford a three.js runtime"; deckCapability's `decideDeckRung` asks
 * "may this page's backdrop move at all"). Sharing the reading and the words
 * makes those doors comparable; sharing the door would make them wrong.
 *
 * Pure data & math except for the two functions at the bottom, which only READ
 * the DOM and decide nothing — that split is what lets vitest exercise every
 * branch of every door in plain Node.
 */

/**
 * Why a door stayed shut. Not decoration: the surfaces put it on a
 * `data-*-decline` attribute so "why is there no 3D on my machine" is a
 * DevTools question, not a bisect. One vocabulary across every surface, so the
 * word means the same thing wherever it appears.
 */
export type DeviceDeclineReason =
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
 * Everything a decision reads, in one plain object so the tests can build a
 * device by hand. `null` means "this browser would not tell us" and is ALWAYS
 * treated as "no evidence against", never as a device class — deviceMemory is
 * Chromium-only and hardwareConcurrency is capped/lied about for privacy in
 * Safari, so gating hard on either would silently turn the effect off for every
 * Firefox and Safari desktop.
 */
export interface DeviceSignals {
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
   * yet, which is the normal state for a cheap first pass: probing costs a real
   * GL context, so a door only spends one after everything else has said yes.
   */
  webgl: boolean | null;
}

/**
 * Connection classes that never get the expensive rung. 3g is in the list
 * deliberately: on a real Bulgarian 3g cell a JS chunk alone is several seconds
 * of a blank surface, and the cheap rung is already the finished image.
 */
export const SLOW_CONNECTIONS: readonly string[] = ["slow-2g", "2g", "3g"];

/** The pre-hydration / SSR answer. Every field unknown, so every door is shut. */
export const UNKNOWN_SIGNALS: DeviceSignals = {
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

/** True when the browser reported a connection class we refuse to spend on. */
export function isSlowConnection(signals: DeviceSignals): boolean {
  const ect = signals.effectiveConnectionType;
  return ect !== null && SLOW_CONNECTIONS.includes(ect);
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
 * exception — an exception here would take the whole surface down, including
 * the cheap rung that was supposed to be the safe answer.
 */
export function readDeviceSignals(): DeviceSignals {
  if (typeof window === "undefined") return UNKNOWN_SIGNALS;

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
    // Never probed here: creating a GL context is expensive, and a door may
    // reject the device for free before it would have needed the answer.
    webgl: null,
  };
}

/**
 * Try to create — and immediately throw away — a WebGL context.
 *
 * Called at most once per page load, and only after a cheaper door has already
 * said yes, because it is not free: some drivers cap live contexts at 8–16 per
 * document and a leaked probe context is one the real Canvas cannot have.
 * `loseContext()` hands it back immediately rather than waiting for GC.
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
