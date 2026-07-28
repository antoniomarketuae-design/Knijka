import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { IOS_SPLASH_PLATES } from "./iosSplash.generated";
import {
  INSTALL_DISMISSED_KEY,
  installHintAllowed,
  installSurface,
  isInAppBrowser,
  isIos,
  isStandalone,
  readDismissed,
  writeDismissed,
  type InstallEnvironment,
} from "./install";

/**
 * THE INSTALLABLE-APP GATE.
 *
 * Why any of this is worth a test file: installability fails SILENTLY. A
 * manifest that declares an icon which is not there, or declares 512x512 for a
 * file that is actually 511 px, does not throw and does not warn on the page —
 * the browser simply never becomes installable, `beforeinstallprompt` never
 * fires, and the only symptom is that a button the founder was told exists is
 * not there on his phone. Same for the iOS launch plates: iOS matches them on
 * exact device metrics and IGNORES a near-miss, so a typo in one media query
 * is a white flash that nobody can reproduce on a desktop.
 *
 * So everything the manifest and the layout promise is checked against the
 * bytes on disk, here, in the same `npx vitest run` gate as everything else.
 */

const PLATFORM = path.resolve(__dirname, "../../..");
const PUBLIC = path.join(PLATFORM, "public");

/** Pixel dimensions straight out of the PNG IHDR chunk — no image library. */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  // 8-byte signature, then a 4-byte length + "IHDR", then width/height.
  expect(buf.subarray(1, 4).toString("ascii"), `${file} is not a PNG`).toBe("PNG");
  expect(buf.subarray(12, 16).toString("ascii"), `${file} has no IHDR`).toBe("IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("web app manifest", () => {
  const m = manifest();

  it("declares the fields a browser requires before it will offer an install", () => {
    // Chromium's installability criteria, in full: name (or short_name), a
    // start_url, a display mode that is not "browser", and 192 + 512 icons.
    // Any one of them missing and the install prompt never appears.
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe("/dashboard");
    expect(m.display).toBe("standalone");
    expect(m.scope).toBe("/");

    const png = (m.icons ?? []).filter((i) => i.type === "image/png");
    const any = png.filter((i) => i.purpose !== "maskable");
    expect(any.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    // Maskable is what stops an Android launcher clipping the К's corners.
    const maskable = png.filter((i) => i.purpose === "maskable");
    expect(maskable.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });

  it("resolves every declared icon, at the size it declares", () => {
    for (const icon of m.icons ?? []) {
      const file = path.join(PUBLIC, icon.src.replace(/^\//, ""));
      expect(existsSync(file), `${icon.src} is declared but not in public/`).toBe(true);
      if (icon.type !== "image/png") continue;
      const [w, h] = (icon.sizes ?? "").split("x").map(Number);
      expect(pngSize(file), `${icon.src} is not ${icon.sizes}`).toEqual({
        width: w,
        height: h,
      });
    }
  });

  it("resolves every screenshot and every shortcut icon", () => {
    for (const shot of m.screenshots ?? []) {
      const file = path.join(PUBLIC, shot.src.replace(/^\//, ""));
      expect(existsSync(file), `${shot.src} is declared but not in public/`).toBe(true);
      const [w, h] = (shot.sizes ?? "").split("x").map(Number);
      expect(pngSize(file)).toEqual({ width: w, height: h });
    }
    for (const shortcut of m.shortcuts ?? []) {
      // A shortcut pointing at a route that does not exist is a dead entry in
      // the OS long-press menu, which the student cannot tell from a bug.
      expect(shortcut.url.startsWith("/")).toBe(true);
      for (const icon of shortcut.icons ?? []) {
        expect(existsSync(path.join(PUBLIC, icon.src.replace(/^\//, "")))).toBe(true);
      }
    }
  });

  it("paints the launch plate, the OS chrome and the first frame the same colour", () => {
    // #05070c is --background inside the cluster scope (globals.css §CLUSTER)
    // and the value layout.tsx pins `theme-color` to. Three surfaces, one
    // colour: any drift here reads as a seam on the way into the app.
    expect(m.background_color).toBe("#05070c");
    expect(m.theme_color).toBe("#05070c");
    const layout = readFileSync(path.join(PLATFORM, "src/app/layout.tsx"), "utf8");
    expect(layout).toContain('themeColor: "#05070c"');
  });

  it("does not lock orientation", () => {
    // Theory and exams are read in portrait; the simulator wants landscape.
    // Locking either would break the other half of the product.
    expect(m.orientation).toBe("any");
  });
});

describe("iOS launch images", () => {
  it("renders every plate the layout declares, at the declared pixel size", () => {
    expect(IOS_SPLASH_PLATES.length).toBeGreaterThanOrEqual(18);
    for (const plate of IOS_SPLASH_PLATES) {
      const file = path.join(PUBLIC, plate.url.replace(/^\//, ""));
      expect(existsSync(file), `${plate.url} is declared but not in public/`).toBe(true);
      expect(pngSize(file), `${plate.url} is the wrong size`).toEqual({
        width: plate.width,
        height: plate.height,
      });
    }
  });

  it("gives every device both orientations, with matching media queries", () => {
    // iOS carries orientation in the `orientation` term ONLY — device-width and
    // device-height do not swap when the phone is rotated. Getting that wrong
    // is the classic mistake: the plates render, and iOS silently uses none of
    // them. So each device must appear exactly twice, with the SAME
    // device-width/device-height and different orientations, while the IMAGE
    // dimensions are the ones that swap.
    const byMetrics = new Map<string, typeof IOS_SPLASH_PLATES>();
    for (const plate of IOS_SPLASH_PLATES) {
      const metrics = plate.media.replace(/ and \(orientation: \w+\)/, "");
      byMetrics.set(metrics, [...(byMetrics.get(metrics) ?? []), plate]);
    }
    for (const [metrics, plates] of byMetrics) {
      expect(plates.length, metrics).toBe(2);
      const portrait = plates.find((p) => p.media.includes("orientation: portrait"))!;
      const landscape = plates.find((p) => p.media.includes("orientation: landscape"))!;
      expect(portrait, metrics).toBeDefined();
      expect(landscape, metrics).toBeDefined();
      expect(portrait.height).toBeGreaterThan(portrait.width);
      expect(landscape.width).toBe(portrait.height);
      expect(landscape.height).toBe(portrait.width);
    }
  });

  it("keeps every media query in the exact shape iOS matches", () => {
    for (const plate of IOS_SPLASH_PLATES) {
      expect(plate.media).toMatch(
        /^\(device-width: \d+px\) and \(device-height: \d+px\) and \(-webkit-device-pixel-ratio: [123]\) and \(orientation: (portrait|landscape)\)$/,
      );
    }
  });

  it("covers the phone the founder actually reported from", () => {
    // iPhone 16 — 393x852 CSS px at dpr 3. The whole run exists because of the
    // three screenshots he took on it.
    const iphone16 = IOS_SPLASH_PLATES.filter((p) =>
      p.media.startsWith("(device-width: 393px) and (device-height: 852px)"),
    );
    expect(iphone16).toHaveLength(2);
  });
});

describe("service worker", () => {
  const sw = readFileSync(path.join(PUBLIC, "sw.js"), "utf8");
  /** The file with its comments removed — these assertions are about CODE.
      sw.js documents at length what it deliberately does not cache, and a test
      that reads the prose instead of the statements would fail on its own
      explanation. */
  const code = sw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

  it("versions its cache, so a deploy cannot be served the old one", () => {
    expect(code).toMatch(/const VERSION = "[\w.-]+"/);
    expect(code).toContain("`knijka-shell-${VERSION}`");
  });

  it("takes over immediately and deletes superseded caches", () => {
    // The pair that makes a deploy actually reach a phone: without
    // skipWaiting + claim, a new worker sits idle until every tab is closed —
    // and a PWA tab is never closed.
    expect(sw).toContain("skipWaiting()");
    expect(sw).toContain("clients.claim()");
    expect(sw).toContain("caches.delete");
  });

  it("precaches the offline shell and nothing else", () => {
    // THE ANTI-STALE RULE. Caching HTML or /_next/ chunks is how a service
    // worker serves a bug forever; a student cannot clear it and cannot even
    // describe it. If this list ever grows, that decision needs its own
    // argument in the sw.js header.
    const precache = /const PRECACHE = \[([^\]]*)\]/.exec(code)?.[1] ?? "";
    expect(precache.replace(/\s/g, "")).toBe("OFFLINE_URL");
    expect(code).not.toContain("/_next/");
  });

  it("never touches a request that is not a page load", () => {
    expect(code).toContain('if (request.method !== "GET") return;');
    expect(code).toContain('if (request.mode !== "navigate") return;');
    expect(code).toContain('url.pathname.startsWith("/api/")');
  });

  it("registers no push handler — the users are minors (ADR-004)", () => {
    // A push handler is the doorway to a subscription endpoint, which is a
    // per-device identifier. Not without a DPIA, and not by accident.
    expect(code).not.toMatch(/addEventListener\(\s*"push"/);
    expect(code).not.toContain("pushManager");
    expect(code).not.toContain("Notification");
  });
});

describe("offline shell", () => {
  const raw = readFileSync(path.join(PUBLIC, "offline.html"), "utf8");
  /** Comments stripped: the file explains its own constraints, and the copy
      assertions below are about what a student actually reads. */
  const html = raw.replace(/<!--[\s\S]*?-->/g, "");

  it("depends on no sub-resource at all", () => {
    // The page shown precisely when the network is gone must not fetch
    // anything: a cached HTML file whose stylesheet was never cached renders
    // as unstyled black-on-white, which is worse than the browser's own error.
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
    expect(html).not.toMatch(/<script/);
    expect(html).not.toMatch(/<img/);
    expect(html).not.toMatch(/url\(["']?https?:/);
    expect(html).toContain("<style>");
  });

  it("is in Bulgarian and on the cluster ground", () => {
    expect(html).toContain('lang="bg"');
    expect(html).toContain("#05070c");
    expect(html).toContain("Няма връзка");
  });

  it("does not promise offline lessons it cannot deliver", () => {
    // The worker caches this page and nothing else. Telling a student the
    // questions work offline and then showing an empty bank is the kind of lie
    // the whole product's credibility is built on not telling.
    expect(html).not.toMatch(/работи офлайн|достъпни офлайн/);
  });
});

describe("install affordance", () => {
  const base: InstallEnvironment = {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    maxTouchPoints: 5,
    displayModeStandalone: false,
    iosStandalone: false,
    hasDeferredPrompt: false,
    dismissed: false,
  };
  const android =
    "Mozilla/5.0 (Linux; Android 14; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

  it("explains the Share menu on iOS, where there is no install API", () => {
    expect(installSurface(base)).toBe("ios-share");
  });

  it("offers the real prompt when Chromium hands one over", () => {
    expect(installSurface({ ...base, userAgent: android, hasDeferredPrompt: true })).toBe(
      "android-prompt",
    );
  });

  it("says nothing on Android until the browser says it is installable", () => {
    // No deferred prompt means Chromium has not accepted the app as
    // installable. A button that opens nothing is worse than no button.
    expect(installSurface({ ...base, userAgent: android, maxTouchPoints: 5 })).toBe("none");
  });

  it("disappears once the app is installed — by either signal", () => {
    expect(installSurface({ ...base, displayModeStandalone: true })).toBe("none");
    expect(installSurface({ ...base, iosStandalone: true })).toBe("none");
    expect(
      installSurface({ ...base, userAgent: android, hasDeferredPrompt: true, iosStandalone: true }),
    ).toBe("none");
  });

  it("never comes back after a refusal", () => {
    expect(installSurface({ ...base, dismissed: true })).toBe("none");
    expect(
      installSurface({ ...base, userAgent: android, hasDeferredPrompt: true, dismissed: true }),
    ).toBe("none");
  });

  it("stays silent inside Instagram/Facebook/Viber webviews", () => {
    // A large share of first taps in this audience arrive from a social app,
    // and those embedded browsers have no Add to Home Screen at all. The
    // instruction would be an instruction to press a button that is not there.
    for (const ua of [
      `${base.userAgent} Instagram 300.0.0.0`,
      `${base.userAgent} [FBAN/FBIOS;FBAV/450.0]`,
      `${android} Viber/20.0`,
    ]) {
      expect(isInAppBrowser(ua), ua).toBe(true);
      expect(installSurface({ ...base, userAgent: ua, hasDeferredPrompt: true })).toBe("none");
    }
  });

  it("recognises the iPad that claims to be a Mac", () => {
    // iPadOS 13+ sends a desktop macOS user agent. maxTouchPoints is the only
    // signal left; without it every iPad in the country is shown nothing.
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15";
    expect(isIos({ ...base, userAgent: mac, maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ ...base, userAgent: mac, maxTouchPoints: 0 })).toBe(false);
    expect(installSurface({ ...base, userAgent: mac, maxTouchPoints: 0 })).toBe("none");
  });

  it("reads both standalone signals", () => {
    expect(isStandalone({ ...base, displayModeStandalone: true })).toBe(true);
    expect(isStandalone({ ...base, iosStandalone: true })).toBe(true);
    expect(isStandalone(base)).toBe(false);
  });

  it("appears on the landing page and the dashboard, and nowhere that would cost screen", () => {
    expect(installHintAllowed("/")).toBe(true);
    expect(installHintAllowed("/dashboard")).toBe(true);

    // The simulator: the entire reason this feature exists is that it has too
    // little screen. The two runners: mobileFold.test.ts pinned „Провери" and
    // „Следващ" to the bottom of the viewport, and a bar there would cover the
    // most repeated control in the product, under a 40-minute exam clock.
    // Checkout and auth: never interrupt a payment or a login with an upsell.
    for (const route of [
      "/simulator",
      "/simulator/lesson-1",
      "/theory/practice",
      "/exams/abc123",
      "/checkout",
      "/checkout/return",
      "/login",
      "/register",
      "/tutor",
      "/hazard",
      "/settings",
    ]) {
      expect(installHintAllowed(route), route).toBe(false);
    }
  });

  it("survives a localStorage that throws (Safari private mode)", () => {
    const hostile = {
      getItem() {
        throw new Error("SecurityError");
      },
      setItem() {
        throw new Error("SecurityError");
      },
    };
    expect(readDismissed(hostile)).toBe(false);
    expect(() => writeDismissed(hostile)).not.toThrow();
    expect(readDismissed(null)).toBe(false);
  });

  it("persists nothing but a local boolean (ADR-004: users are minors)", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    writeDismissed(storage);
    expect([...store.entries()]).toEqual([[INSTALL_DISMISSED_KEY, "1"]]);
    expect(readDismissed(storage)).toBe(true);
  });
});
