/**
 * INSTALLABILITY — the decision logic, kept out of the component.
 *
 * WHY THIS EXISTS AT ALL. The founder opened the simulator on his own iPhone 16
 * in landscape and measured Safari's chrome — URL bar, tab strip, share row —
 * at ~19% of the screen height before the road gets a single pixel. On iOS the
 * Fullscreen API does not exist for non-video elements, so that 19% CANNOT be
 * reclaimed from inside a browser tab: no CSS, no JS, no viewport meta. The
 * only mechanism that removes it is installing to the Home Screen and running
 * in `display: standalone`, which is what the manifest declares.
 *
 * WHAT IT DOES NOT BUY. A standalone PWA is the SAME browser engine running the
 * SAME code. It buys screen area and a home-screen icon. It does not buy frame
 * rate, faster physics, or a smaller download. Nothing in this module or the UI
 * it drives claims otherwise.
 *
 * THE TWO PLATFORMS DIVERGE, AND THAT IS THE WHOLE COMPLEXITY:
 *
 *   Android / Chromium — fires `beforeinstallprompt`. We capture it, hold it,
 *   and hand the student a real button that opens the OS install sheet.
 *
 *   iOS / Safari — fires NOTHING and exposes no API. Add to Home Screen lives
 *   in the Share menu and can only be reached by the user's own hand. So the
 *   only honest affordance is an instruction, which is why this file separates
 *   "can I prompt" from "must I explain".
 *
 * GDPR / ADR-004: the users are minors. Nothing here reads or writes an
 * identifier. The one persisted value is a local boolean meaning "this person
 * already said no" — it never leaves the device and is not attached to a user.
 */

/** What the UI is allowed to offer, given the browser we are actually in. */
export type InstallSurface =
  /** Chromium handed us a deferred prompt — we can open the real install sheet. */
  | "android-prompt"
  /** iOS Safari: no API exists, so we explain the Share > Add to Home Screen path. */
  | "ios-share"
  /** Already installed, already declined, or a browser that cannot install. */
  | "none";

/** Everything the decision depends on, read once at mount by the component. */
export interface InstallEnvironment {
  /** `navigator.userAgent`. */
  userAgent: string;
  /** `navigator.maxTouchPoints` — the only way to tell an iPad from a Mac. */
  maxTouchPoints: number;
  /** `matchMedia("(display-mode: standalone)").matches`. */
  displayModeStandalone: boolean;
  /** `navigator.standalone` — Safari's legacy flag, the iOS truth before iOS 17. */
  iosStandalone: boolean;
  /** A `beforeinstallprompt` event has been captured and not yet used. */
  hasDeferredPrompt: boolean;
  /** The student pressed „Не, благодаря" at some point (persisted locally). */
  dismissed: boolean;
}

/**
 * The localStorage key. Versioned in the NAME, not in the value: if the hint is
 * ever re-designed enough to be worth re-asking, the new build asks under a new
 * key and the old refusal is simply forgotten — no migration, no parsing.
 */
export const INSTALL_DISMISSED_KEY = "knijka.pwa.install-hint.v1";

/**
 * Running as an installed app.
 *
 * BOTH checks are load-bearing. `display-mode: standalone` is the standard and
 * is what Android reports; `navigator.standalone` is the non-standard property
 * Safari has shipped since 2008 and is the reliable signal on iOS, where the
 * media query has historically been the one that lied. Either one means the
 * chrome is already gone and there is nothing left to sell.
 */
export function isStandalone(env: InstallEnvironment): boolean {
  return env.displayModeStandalone || env.iosStandalone;
}

/**
 * iOS/iPadOS, including the iPad that pretends to be a Mac.
 *
 * Since iPadOS 13, Safari on an iPad sends a desktop macOS user-agent string.
 * The only distinguishing signal left is that a Mac reports `maxTouchPoints: 0`
 * and an iPad reports 5. Without the second clause, every iPad in the country
 * would be told nothing and shown nothing.
 */
export function isIos(env: InstallEnvironment): boolean {
  if (/iPad|iPhone|iPod/.test(env.userAgent)) return true;
  return /Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1;
}

/**
 * In-app webviews — Instagram, Facebook, TikTok, Viber, Telegram, WeChat.
 *
 * This is not a nicety for a Bulgarian product aimed at 17–18-year-olds: a
 * large share of first taps arrive from an Instagram or Viber link, and those
 * embedded browsers have NO Share > Add to Home Screen. Showing the iOS
 * instruction there is an instruction to press a button that does not exist,
 * which reads as the app being broken. Say nothing instead.
 */
export function isInAppBrowser(userAgent: string): boolean {
  return /(FBAN|FBAV|FB_IAB|Instagram|Twitter|TikTok|Snapchat|Viber|Line\/|MicroMessenger|OKApp|VKAndroidApp)/i.test(
    userAgent,
  );
}

/** What, if anything, to offer this browser right now. */
export function installSurface(env: InstallEnvironment): InstallSurface {
  if (isStandalone(env)) return "none";
  if (env.dismissed) return "none";
  if (isInAppBrowser(env.userAgent)) return "none";
  // Chromium's own signal wins wherever it exists: it is the only one that can
  // open a real install sheet, and it already encodes the browser's own
  // installability verdict (manifest valid, icons present, https).
  if (env.hasDeferredPrompt) return "android-prompt";
  if (isIos(env)) return "ios-share";
  // Desktop Chrome without a deferred prompt, Firefox, Safari on macOS: either
  // not installable or installable through UI we cannot reach. Offer nothing
  // rather than instructions for a menu that may not be there.
  return "none";
}

/**
 * The surfaces the hint may appear on. An ALLOW-list, deliberately.
 *
 * A deny-list would have been shorter and would have been wrong the first time
 * someone adds a route. Three constraints shape this list:
 *
 *   1. The simulator is excluded outright. The entire reason this feature
 *      exists is that the sim has too little screen; a banner over it would
 *      take back part of what installing gives.
 *   2. The theory practice runner and the exam runner are excluded. Both pin
 *      their primary control to the bottom of the viewport (see
 *      components/mobileFold.test.ts — „Провери" and „Следващ" were moved there
 *      precisely so they are always one tap away). A fixed bar at the bottom of
 *      those screens would cover the single most repeated control in the
 *      product, under a 40-minute exam clock.
 *   3. Checkout and the auth screens are excluded: never interrupt a payment or
 *      a login with an upsell.
 *
 * What is left is the landing page (the founder's marketing reason) and the
 * dashboard (the home surface of the authenticated app, no pinned footer).
 */
export function installHintAllowed(pathname: string): boolean {
  return pathname === "/" || pathname === "/dashboard";
}

/**
 * Read the refusal flag. Any storage failure means "not dismissed": Safari in
 * private mode throws on `localStorage` access, and an exception there must
 * degrade to showing the hint, never to a blank screen.
 */
export function readDismissed(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the refusal. Same rule: a storage failure must not break the page. */
export function writeDismissed(storage: Pick<Storage, "setItem"> | null): void {
  try {
    storage?.setItem(INSTALL_DISMISSED_KEY, "1");
  } catch {
    /* private mode / storage disabled — the hint simply returns next session */
  }
}

/** Clear the refusal, so /settings can offer the install again on demand. */
export function clearDismissed(storage: Pick<Storage, "removeItem"> | null): void {
  try {
    storage?.removeItem(INSTALL_DISMISSED_KEY);
  } catch {
    /* nothing to do — the flag stays and /settings still shows instructions */
  }
}
