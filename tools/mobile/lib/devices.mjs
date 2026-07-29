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
// -----------------------------------------------------------------------------

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 6a) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/128.0.0.0 Mobile Safari/537.36";

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
};

/** The sweep every baseline and every budget run uses unless told otherwise. */
export const DEFAULT_DEVICE_IDS = [
  "iphone16-portrait",
  "iphone16-landscape",
  "small-portrait",
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

/** Playwright context options for a profile. */
export function contextOptions(device) {
  return {
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.dpr,
    isMobile: true,
    hasTouch: true,
    userAgent: device.ua,
    locale: "bg-BG",
    timezoneId: "Europe/Sofia",
    // ADR-004: users are minors. Nothing here collects or transmits anything;
    // reduced motion also keeps entry animations from being screenshotted
    // mid-flight, which made earlier captures unreproducible.
    reducedMotion: "reduce",
    colorScheme: "dark",
  };
}
