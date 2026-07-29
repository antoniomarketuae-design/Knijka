/**
 * How much backdrop can THIS device afford — and why there is no WebGL rung.
 *
 * The landing hero's door (heroCapability.ts) grades a WebGL runtime, because
 * that is what a hero is: a thing you look AT, worth a three.js chunk on a
 * machine that can take it. The deck is the opposite kind of layer. It is the
 * thing you look THROUGH, behind text, on every authenticated page, many times
 * a day. So its ladder grades something else entirely — MOTION — and the top
 * rung is deliberately not a 3D scene.
 *
 * THREE REASONS THE DECK HAS NO WEBGL RUNG, written down so the next person
 * does not add one by reflex:
 *
 *   1. THE SIMULATOR OWNS THE GPU. /simulator is inside the (dashboard) group,
 *      so a canvas mounted in that layout is mounted UNDER the simulator too —
 *      a second live GL context on the one route whose frame budget is the
 *      product. Some drivers cap contexts per document; all of them charge for
 *      the second one.
 *
 *   2. A STILL LAYER DOES NOT NEED A 3D ENGINE. The whole brief for this
 *      surface is that it must not move much, and a frozen WebGL render is a
 *      picture with ~600 KB of runtime attached. The drawn plate IS the
 *      picture, at zero requests and zero JavaScript. That is the same
 *      conclusion heroCapability reaches for most visitors — "the only thing
 *      most phones see" — applied to a surface where it holds for everyone.
 *
 *   3. IT WOULD BE PAID FOR ON EVERY NAVIGATION. A hero is one page. This is
 *      the shell around the whole app.
 *
 * So the rungs are `still` and `depth`, and the delta between them is one
 * compositor-only CSS animation — no bytes, no context, no main-thread work.
 *
 * Pure data & math, like the hero's door, so vitest exercises every branch in
 * plain Node.
 */

import {
  isSlowConnection,
  type DeviceDeclineReason,
  type DeviceSignals,
} from "@/lib/visual/deviceSignals";

/** What the deck is doing right now. */
export type DeckRung =
  /**
   * Nothing moves. The drawn plate is final — and it is the SSR answer, the
   * phone answer, the reduced-motion answer and the answer for anything we are
   * unsure about.
   */
  | "still"
  /**
   * The plate plus one very slow light drift along the horizon: a
   * transform-only CSS animation, 240 s per traverse, paused whenever the tab
   * is hidden. It is not a feature you notice; it is the reason the page is
   * never quite the same twice.
   */
  | "depth";

export interface DeckDecision {
  rung: DeckRung;
  /** `null` exactly when rung is "depth". */
  reason: DeckDeclineReason | null;
}

/** Same vocabulary as the hero's door — see `@/lib/visual/deviceSignals`. */
export type DeckDeclineReason = DeviceDeclineReason;

/**
 * Narrowest viewport that gets the drift, CSS px.
 *
 * The same 1024 the hero uses, and for a related reason rather than the same
 * one: under it we are almost certainly on a battery, and a compositor
 * animation that runs for as long as the page is open is a battery cost with
 * no visual payoff at that size — the drift's whole traverse is wider than the
 * screen it would be crossing.
 */
export const DECK_MIN_VIEWPORT_PX = 1024;

/** Memory and core floors. Same numbers as the hero's, same netbook class. */
export const DECK_MIN_DEVICE_MEMORY_GB = 4;
export const DECK_MIN_CORES = 4;

/**
 * The door. Ordered, first match wins, and the order matches the hero's: the
 * two signals the STUDENT set come before anything we inferred about their
 * hardware, so the reported reason is the one they would recognise as their
 * own choice.
 *
 * Note what is missing compared with `decideHeroStage`: there is no `no-webgl`
 * branch, because the deck never asks for a context (see the header). A
 * machine with WebGL blacklisted gets exactly the same deck as one without.
 */
export function decideDeckRung(signals: DeviceSignals): DeckDecision {
  const decline = (reason: DeckDeclineReason): DeckDecision => ({
    rung: "still",
    reason,
  });

  // Consent-shaped, not hints. A backdrop that keeps moving behind a page of
  // theory is precisely what "reduce motion" is asking us not to do.
  if (signals.reducedMotion === true) return decline("reduced-motion");
  // Save-Data costs nothing here (the drift ships no bytes), but a student who
  // set it is telling us they are on a metered, probably weak device — and the
  // honest reading of that is "spend less", not "spend less bandwidth".
  if (signals.saveData === true) return decline("save-data");
  if (isSlowConnection(signals)) return decline("slow-network");

  // Unknown width means we are not in a browser yet. The still plate is the
  // SSR answer, always, so hydration can never have to take motion away.
  if (signals.viewportWidthPx === null) return decline("server");
  if (signals.viewportWidthPx < DECK_MIN_VIEWPORT_PX) return decline("narrow-viewport");

  // A touch-primary device is a phone or a tablet however wide it claims to be,
  // and phones are the device this product is actually used on. `anyFinePointer`
  // is the escape hatch for a touchscreen laptop.
  if (signals.coarsePointer === true && signals.anyFinePointer !== true) {
    return decline("touch-primary");
  }

  // Hardware floors — skipped entirely when the browser withheld the number,
  // because Chromium clamps deviceMemory and Safari lies about core counts.
  if (signals.deviceMemoryGb !== null && signals.deviceMemoryGb < DECK_MIN_DEVICE_MEMORY_GB) {
    return decline("low-memory");
  }
  if (signals.hardwareConcurrency !== null && signals.hardwareConcurrency < DECK_MIN_CORES) {
    return decline("few-cores");
  }

  return { rung: "depth", reason: null };
}

/**
 * Routes the deck never animates behind, matched by prefix.
 *
 * /simulator is the one route in the group that owns the GPU outright: a
 * compositor animation running under a live WebGL canvas is frames taken from
 * the thing being graded. The STILL plate stays — it is a static paint, which
 * is exactly what `.haze` was doing there before — but nothing on that route
 * is allowed to keep the compositor awake.
 */
export const DECK_STILL_ROUTES: readonly string[] = ["/simulator"];

/** True when this path must not animate, whatever the device could afford. */
export function isDeckStillRoute(pathname: string): boolean {
  return DECK_STILL_ROUTES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
