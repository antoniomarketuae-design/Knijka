import type { Metadata, Viewport } from "next";
import { Exo_2, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
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
  // conventions; only the Apple touch icon needs an explicit pointer.
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Книжка.AI",
    statusBarStyle: "default",
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
export const viewport: Viewport = {
  themeColor: "#05070c",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
