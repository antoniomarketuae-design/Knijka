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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070b14" },
    { media: "(prefers-color-scheme: light)", color: "#eef3fb" },
  ],
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
