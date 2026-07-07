import Link from "next/link";
import { DraftBanner } from "./legal-ui";

/**
 * Shared chrome for the public legal pages: /terms, /privacy, /cookies,
 * /contact. Same header/footer language as the landing page, a mandatory
 * „работна версия“ banner on every page, and a ~65ch prose column for
 * comfortable long-form reading.
 */

const LEGAL_NAV = [
  { href: "/terms", labelBg: "Условия за ползване" },
  { href: "/privacy", labelBg: "Поверителност" },
  { href: "/cookies", labelBg: "Бисквитки" },
  { href: "/contact", labelBg: "Контакт" },
] as const;

export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-extrabold tracking-tight"
          >
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-black text-accent-foreground shadow-glow-sm"
            >
              К
            </span>
            Книжка<span className="text-accent">.AI</span>
          </Link>
          <nav aria-label="Навигация">
            <Link
              href="/"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-muted transition hover:text-foreground motion-reduce:transition-none"
            >
              Начало
            </Link>
          </nav>
        </div>
      </header>

      <DraftBanner />

      <main className="mx-auto w-full max-w-[70ch] flex-1 px-4 py-10 sm:px-6 sm:py-14">
        {children}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-muted">
            © 2026 Книжка.AI · Подготовка за теоретичния изпит, категория B ·
            България
          </p>
          <nav aria-label="Правна информация">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {LEGAL_NAV.map(({ href, labelBg }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-xs font-semibold text-muted transition hover:text-foreground motion-reduce:transition-none"
                  >
                    {labelBg}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
