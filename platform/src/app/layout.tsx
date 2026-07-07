import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    { media: "(prefers-color-scheme: dark)", color: "#0a101e" },
    { media: "(prefers-color-scheme: light)", color: "#f4f7fc" },
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
