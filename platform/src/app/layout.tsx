import type { Metadata, Viewport } from "next";
import { Exo_2, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { InstallHint } from "@/components/pwa/InstallHint";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import { PinnedBarInset } from "@/components/ui/PinnedBarInset";
import { IOS_SPLASH_PLATES } from "@/lib/pwa/iosSplash.generated";
import "./globals.css";

/* Cockpit / HUD type system (doc 64). Every face ships a Cyrillic subset —
   a hard requirement for a Bulgarian product. Variables feed globals.css. */

// Display — squared-geometric, HUD-native (headlines, big readouts).
const display = Exo_2({
  variable: "--ff-display",
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

// Body — IBM Plex Sans handles Bulgarian well (reading surfaces).
const body = IBM_Plex_Sans({
  variable: "--ff-body",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Telemetry — timers, %, scores, stats.
const mono = JetBrains_Mono({
  variable: "--ff-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const TITLE = "Книжка.AI — вземи книжка с AI учител до теб";
const DESCRIPTION =
  "AI академия за шофьорския изпит в България: адаптивна теория, пробни изпити 1:1 с официалния формат и AI учител, който отговаря с цитат от закона.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  applicationName: "Книжка.AI",
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "bg_BG",
    url: "/",
    siteName: "Книжка.AI",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Книжка.AI — AI академия за шофьорския изпит",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
  // favicon.ico + manifest are wired automatically by the app/ file
  // conventions; only the Apple touch icons need an explicit pointer. 180 is
  // what a phone takes; 152/167 stop an iPad upscaling the phone icon.
  icons: {
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/icons/apple-touch-icon-152.png", sizes: "152x152", type: "image/png" },
      { url: "/icons/apple-touch-icon-167.png", sizes: "167x167", type: "image/png" },
    ],
  },
  /**
   * THE iOS HALF OF INSTALLABILITY — and it is a different mechanism, not a
   * variation of the Android one.
   *
   * `capable: true` is what makes Home-Screen launches run WITHOUT Safari's
   * chrome; the manifest's `display: standalone` alone does not do it on iOS.
   * That chrome is the ~19% of the landscape screen the founder measured, and
   * this line is the one that removes it.
   *
   * `statusBarStyle: "black"` and not "black-translucent": translucent gains
   * ~47px in portrait by drawing the page UNDER the status bar, which then
   * requires every pinned surface in the app to respect
   * `env(safe-area-inset-top)` or have its top row sit behind the clock. In
   * landscape — the orientation that actually needs the pixels — iOS hides the
   * status bar entirely, so translucent would buy nothing there and risk a
   * regression everywhere else. "black" paints the strip in the cluster ground
   * and changes no layout.
   *
   * `startupImage` is the launch plate. Without one, iOS shows a WHITE
   * rectangle while a standalone app boots — a white flash into a near-black
   * cockpit. The list is generated (scripts/generate-icons.mjs) because iOS
   * matches these by exact device metrics: a near-miss is ignored, not scaled.
   */
  appleWebApp: {
    capable: true,
    title: "Книжка.AI",
    statusBarStyle: "black",
    startupImage: IOS_SPLASH_PLATES.map(({ url, media }) => ({ url, media })),
  },
  other: {
    // BOTH SPELLINGS ARE NEEDED, and only one of them is emitted for us.
    // Measured on the served HTML: `appleWebApp.capable` above makes Next 16
    // write the STANDARDISED `mobile-web-app-capable` and nothing else — the
    // vendor-prefixed name it used to emit is gone. Safari only started reading
    // the standard one in iOS 15.4, and every iPhone older than that (still a
    // real share of a 17-year-old's hand-me-down phone) reads exclusively
    // `apple-mobile-web-app-capable`. Without this line those phones install
    // the app and then launch it back inside Safari's chrome — the 19% this
    // whole feature exists to remove.
    "apple-mobile-web-app-capable": "yes",
  },
  formatDetection: { telephone: false },
};

/**
 * ONE theme colour, and it is the cockpit floor.
 *
 * `theme-color` is what the phone paints in the strip the page does not own:
 * Android Chrome's URL bar and the band it flashes during a pull-to-refresh,
 * iOS Safari's status/tab area. It is the other half of the founder's „black
 * sides" report — the part of the frame that is not the CSS canvas.
 *
 * The pair this replaces predates the cluster scope, and both halves were
 * wrong once the scope shipped. `#eef3fb` is a colour no pinned surface paints:
 * marketing, auth and the whole authenticated shell force the dark instrument
 * palette regardless of `prefers-color-scheme` (globals.css §CLUSTER), so a
 * student whose phone is in light mode got a WHITE browser bar hard against a
 * near-black page. And the dark half, `#070b14`, is the app's old navy ground,
 * not the cluster's `#05070c` — close enough to look like a seam rather than a
 * choice.
 *
 * `#05070c` is `--background` inside the cluster scope, so the browser chrome
 * and the page now meet at the same value. The one surface this is not pinned
 * to is the (legal) group, which still follows the OS: four static documents
 * with a dark bar is a better trade than every other screen with a light one.
 */
/**
 * `viewportFit: "cover"` — the OTHER half of the founder's "black sides".
 *
 * WHY (measured on the iPhone 16 landscape frames, 2026-07-28). The default
 * `viewport-fit=auto` tells iOS Safari to lay the page out INSIDE the display's
 * safe area. In landscape on a notched phone that is a black bar down BOTH
 * sides — roughly 10 % of the width the founder was never getting a single
 * pixel of road in ("left + right letterbox ~10% of WIDTH"). No amount of CSS
 * inside the page can reclaim it: the page was never given those columns.
 * `cover` hands the page the whole display and makes `env(safe-area-inset-*)`
 * non-zero so we can place things around the notch ourselves.
 *
 * THE COST, AND WHERE IT IS PAID BACK. With `cover`, ordinary in-flow content
 * would run under the notch and under the home indicator. It does not, because
 * `globals.css` gives <body> exactly the inset padding the browser used to
 * apply for us — so every normal page lays out pixel-identically to before.
 * A `position: fixed` surface is resolved against the VIEWPORT, not the padded
 * body, so the one screen that wants the whole display — the immersive
 * simulator shell — gets it, and places its own controls inside the insets
 * (LessonPlayShell, TouchControls).
 */
export const viewport: Viewport = {
  themeColor: "#05070c",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="bg"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* PWA, mounted once for the whole product.

            RegisterServiceWorker installs /sw.js — an offline shell and
            nothing else (read the header of public/sw.js for the long list of
            things it deliberately does not cache).

            InstallHint gates itself: it renders on two routes, never in
            standalone, never after a refusal, and never inside an in-app
            webview that has no Add to Home Screen. See lib/pwa/install.ts for
            why the simulator and both runners are excluded.

            PinnedBarInset is what makes the hint cost the page the strip it
            actually occupies. Without it the bar is `fixed bottom-0` over a
            layout that reserved nothing, and on /dashboard it sat on 49 % of
            the „Теория" card and owned the centre pixel of a practice link
            outright — measured on the deployed build, both orientations. The
            wrapper generates no box (`display: contents`); all it does is
            publish the bar's measured height as `--pinned-bar-h` for
            globals.css §BODY and the dashboard shell to spend. */}
        <RegisterServiceWorker />
        <PinnedBarInset>
          <InstallHint />
        </PinnedBarInset>
      </body>
    </html>
  );
}
