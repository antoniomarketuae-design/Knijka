// -----------------------------------------------------------------------------
// devices.mjs — the phones this product is judged on.
//
// The founder tests on an iPhone 16. That is the target, so it is first and it
// is the default. A SECOND, SMALLER phone is mandatory in every sweep: the
// whole failure mode this harness exists to end is "it looked right on the one
// device we checked". 360x780 is the common floor of the Android fleet that
// Bulgarian 17-year-olds actually carry, and it is 33px narrower and 72px
// shorter than the iPhone — enough to break any layout that was tuned to one
// number.
//
// SAFE-AREA INSETS ARE PROFILE DATA, NOT MEASURED. Playwright's WebKit is the
// desktop WebKit port; there is no notch, so env(safe-area-inset-*) resolves to
// 0 no matter what viewport we set. Reporting that as "no safe-area problem"
// would be a lie of exactly the kind rule 1 was written against. So each
// profile carries the REAL device insets and the probe treats them as the
// unsafe bands, while still reporting what env() actually returned (they will
// differ, and both facts matter: if a layout depends on env() it will silently
// get 0 here, which is itself worth seeing).
//
// iPhone 16 (6.1", Dynamic Island) insets, in CSS px:
//   portrait  top 59, bottom 34, sides 0
//   landscape top 0,  bottom 21, sides 59
//
// AND SINCE 2026-08-09 THEY ARE ALSO SUBSTITUTED INTO THE PAGE. Carrying the
// numbers here was only half the job: the APP still laid out at env() = 0, so
// „the notch band is unsafe" was checked against a document that had never
// heard of the notch. `lib/insets.mjs` rewrites the app's own
// env(safe-area-inset-*) declarations to these values before the first layout,
// and `newDeviceContext` is now the only way this harness opens a context.
// Everything measured before that date — every fold column, every screen-share
// percentage — describes a phone with no cutout and no home indicator.
//
// WHY `top: 59` IS CARRIED BUT COSTS THIS APP NOTHING. It is the DEVICE's
// inset. What a PAGE sees on top depends on the presentation: in a Safari tab
// the browser chrome already owns that strip, and this app ships
// `appleWebApp.statusBarStyle: "black"` (opaque, app/layout.tsx), so a
// standalone launch is positioned below the status bar too — both report 0.
// globals.css therefore pays back left/right/bottom on <body> and deliberately
// not top. Emulating 59 here is still the right conservative choice: it is what
// a `black-translucent` switch would hand the page, and the only places the app
// reads the top inset are the skip link and the nav drawer, which are `fixed`
// and must survive it.
//
// THE TWO ANDROID PROFILES ARE THE DELIBERATE ZERO-INSET CONTROL, and that is
// a statement, not an omission. Chrome reports a non-zero bottom inset only for
// an edge-to-edge page on Android 15+ with gesture navigation (~24dp), and this
// project has never measured one of those phones. Guessing a number here would
// put a fabricated 24px into every Android column; leaving them at 0 keeps one
// device in the ladder where env() genuinely is 0, which is also the control
// that proves the emulation is doing something on the other two. If a real
// Android measurement ever arrives, it belongs here and nowhere else.
// -----------------------------------------------------------------------------

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 6a) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/128.0.0.0 Mobile Safari/537.36";

// A real Galaxy string, Android 15. Samsung is the largest vendor in Bulgaria
// (34.57%) and had no row in this ladder until 2026-08-11 — see the two
// galaxy-* profiles below, which exist for the gesture-bar inset rather than
// for the viewport size.
const SAMSUNG_UA =
  "Mozilla/5.0 (Linux; Android 15; SM-A566B) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Mobile Safari/537.36";

/** @typedef {{id:string,label:string,width:number,height:number,dpr:number,ua:string,safeArea:{top:number,right:number,bottom:number,left:number},orientation:"portrait"|"landscape",primary:boolean}} DeviceProfile */

/** @type {Record<string, DeviceProfile>} */
export const DEVICES = {
  "iphone16-portrait": {
    id: "iphone16-portrait",
    label: "iPhone 16 — portrait",
    width: 393,
    height: 852,
    dpr: 3,
    ua: IOS_UA,
    safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
    orientation: "portrait",
    primary: true,
  },
  "iphone16-landscape": {
    id: "iphone16-landscape",
    label: "iPhone 16 — landscape",
    width: 852,
    height: 393,
    dpr: 3,
    ua: IOS_UA,
    safeArea: { top: 0, right: 59, bottom: 21, left: 59 },
    orientation: "landscape",
    primary: true,
  },
  "small-portrait": {
    id: "small-portrait",
    label: "Small Android — portrait (360x780)",
    width: 360,
    height: 780,
    dpr: 3,
    ua: ANDROID_UA,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    orientation: "portrait",
    primary: false,
  },
  "small-landscape": {
    id: "small-landscape",
    label: "Small Android — landscape (780x360)",
    width: 780,
    height: 360,
    dpr: 3,
    ua: ANDROID_UA,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    orientation: "landscape",
    primary: false,
  },

  // SAMSUNG, ADDED 2026-08-11 — and it is here for the INSET, not for the size.
  //
  // Samsung is 34.57% of the Bulgarian handset market, the largest single
  // vendor, and until today this ladder had no Samsung in it: both Android rows
  // carry a Pixel UA and, more importantly, a hard zero safe-area. The header
  // above says so itself — "Chrome reports a non-zero bottom inset only for an
  // edge-to-edge page on Android 15+ with gesture navigation (~24dp), and this
  // project has never measured one of those phones."
  //
  // That is the gap. Android 15 made edge-to-edge the default for apps
  // targeting SDK 35, and a gesture-navigation bar hands the page a ~24dp
  // bottom inset — 24 CSS px at any dpr, since dp IS the CSS pixel. This app
  // ships viewportFit:"cover" and globals.css pays back
  // padding-bottom: env(safe-area-inset-bottom) on <body>, so on such a phone
  // the bottom 24px is a band our layout has NEVER been measured against. The
  // driving controls live in exactly that band.
  //
  // 360x780 is deliberately the SAME viewport as small-portrait. This row is
  // not a new size — it is the same size WITH the gesture bar, so the pair is a
  // controlled A/B: any difference between them is the inset and nothing else.
  // Keeping small-portrait at zero preserves the control the header argues for.
  //
  // The 24 is a SPEC NUMBER, not a measurement, and it stays labelled as one
  // until a real Galaxy is profiled. It is the documented Android gesture-bar
  // height; a real device may report a few px either side. The header's rule
  // stands: if a real Android measurement ever arrives, it replaces this.
  "galaxy-gesturebar-portrait": {
    id: "galaxy-gesturebar-portrait",
    label: "Samsung Galaxy — portrait, Android 15 gesture bar (360x780, bottom 24)",
    width: 360,
    height: 780,
    dpr: 3,
    ua: SAMSUNG_UA,
    safeArea: { top: 0, right: 0, bottom: 24, left: 0 },
    orientation: "portrait",
    primary: false,
  },
  "galaxy-gesturebar-landscape": {
    id: "galaxy-gesturebar-landscape",
    label: "Samsung Galaxy — landscape, Android 15 gesture bar (780x360, bottom 24)",
    width: 780,
    height: 360,
    dpr: 3,
    ua: SAMSUNG_UA,
    safeArea: { top: 0, right: 0, bottom: 24, left: 0 },
    orientation: "landscape",
    primary: false,
  },
};

/**
 * The sweep every baseline and every budget run uses unless told otherwise.
 *
 * `small-landscape` IS IN THIS LIST, and it was not. The profile has existed
 * since the ladder was written, but nothing ran it by default — so the only
 * numbers anyone ever had for 780x360 came from probes that named it by hand,
 * and the last one recorded 1 of 18 and was never re-run. A profile that is
 * defined but not in the default ladder is a profile nobody notices has gone
 * stale, which is the same „it looked right on the one device we checked"
 * failure this file's header is about, one level down.
 *
 * It is also the HARDEST viewport in the set, not a rounding error: 360px of
 * height minus a 48px topbar and a 61px pinned action bar leaves ~251px for a
 * question and its answers — 33px less than the founder's phone gets sideways.
 * The Android fleet Bulgarian 17-year-olds actually carry is the 360-wide
 * class, and they rotate it.
 */
export const DEFAULT_DEVICE_IDS = [
  "iphone16-portrait",
  "iphone16-landscape",
  "small-portrait",
  "small-landscape",
  // In the DEFAULT ladder on purpose, by the same argument the comment above
  // makes for small-landscape: a profile that exists but is never run by
  // default is a profile nobody notices has gone stale. The gesture bar is a
  // band the driving controls sit in, so it has to be swept every time, not
  // when someone remembers to name it.
  "galaxy-gesturebar-portrait",
  "galaxy-gesturebar-landscape",
];

export function resolveDevices(ids) {
  const list = ids && ids.length > 0 ? ids : DEFAULT_DEVICE_IDS;
  return list.map((id) => {
    const device = DEVICES[id];
    if (!device) {
      throw new Error(
        `[mobile-harness] unknown device "${id}". Known: ${Object.keys(DEVICES).join(", ")}`,
      );
    }
    return device;
  });
}

// -----------------------------------------------------------------------------
// MOTION IS A RUN PARAMETER, NOT A CONSTANT — AND IT NEVER WAS ONE.
//
// `reducedMotion: "reduce"` was hard-coded into this function, on EVERY profile,
// with no way to say otherwise and nothing that printed it. That is defensible
// as a default for a LAYOUT sweep — an entry transition caught mid-flight makes
// two captures of the same screen differ, and geometry that is still animating
// is not geometry — but it has a consequence nobody had written down: under
// `prefers-reduced-motion: reduce` the app's animations DO NOT PLAY. So any
// claim about an animation made through this harness compared a reduced-motion
// frame against a reduced-motion frame. It could not have failed. It was not a
// check; it was a shape.
//
// So the mode is now a REQUIRED argument. Not a default with an override — a
// caller that says nothing gets an error, because the failure mode being closed
// here is precisely "nobody stated it and nobody noticed". Every probe passes it
// explicitly, every report prints it, and `MOTION_MODES` names what the two
// values mean so the next reader does not have to infer it from Playwright.
// -----------------------------------------------------------------------------

/** @type {Record<string,{playwright:"reduce"|"no-preference", says:string}>} */
export const MOTION_MODES = {
  /** `prefers-reduced-motion: reduce` — the app's animations are SUPPRESSED. */
  reduce: {
    playwright: "reduce",
    says:
      "animations SUPPRESSED (prefers-reduced-motion: reduce) — geometry is deterministic, " +
      "and NO CLAIM ABOUT AN ANIMATION CAN BE MADE FROM THIS RUN",
  },
  /** No preference — the app animates exactly as it does on a student's phone. */
  allow: {
    playwright: "no-preference",
    says:
      "animations ENABLED (no prefers-reduced-motion) — this is what a student sees; " +
      "expect frame-to-frame geometry to differ while a transition is in flight",
  },
};

export const MOTION_MODE_IDS = Object.keys(MOTION_MODES);

/** Resolve and validate a mode id. Throws rather than guessing. */
export function resolveMotion(mode) {
  const found = MOTION_MODES[mode];
  if (!found) {
    throw new Error(
      `[mobile-harness] motion mode must be one of ${MOTION_MODE_IDS.join(", ")} — got ${JSON.stringify(mode)}. ` +
        `It is required, not optional: a sweep that does not state whether animations were playing ` +
        `cannot be read, and every animation claim ever made through this harness was made with ` +
        `reducedMotion silently forced to "reduce".`,
    );
  }
  return { id: mode, ...found };
}

/**
 * Playwright context options for a profile.
 *
 * @param {DeviceProfile} device
 * @param {{motion: "reduce"|"allow", colorScheme?: "dark"|"light"}} options
 *        `motion` is REQUIRED — see MOTION_MODES above.
 */
export function contextOptions(device, options) {
  if (!options || typeof options.motion !== "string") {
    throw new Error(
      "[mobile-harness] contextOptions(device, { motion }) — `motion` is required. " +
        `Pass one of ${MOTION_MODE_IDS.join(", ")} and PRINT it in the report.`,
    );
  }
  const motion = resolveMotion(options.motion);
  return {
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.dpr,
    isMobile: true,
    hasTouch: true,
    userAgent: device.ua,
    locale: "bg-BG",
    timezoneId: "Europe/Sofia",
    // ADR-004: users are minors. Nothing here collects or transmits anything.
    reducedMotion: motion.playwright,
    colorScheme: options.colorScheme ?? "dark",
  };
}
