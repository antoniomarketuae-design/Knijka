import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Страницата не е намерена · Книжка.AI",
};

/**
 * App-wide 404 — catches unmatched URLs and any notFound() throw. Rendered
 * inside the root layout, so a broken link (or a route still in "Скоро") lands
 * on a cockpit-styled panel with a way back, never on Next's raw English page.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-16">
      <section className="hud-panel grain relative w-full max-w-md overflow-hidden p-8 text-center sm:p-10">
        <p className="hud-label !text-accent-2">Грешка · 404</p>

        <p
          aria-hidden
          className="mt-3 font-display text-6xl font-black leading-none tracking-tight text-accent"
          style={{ textShadow: "0 0 32px var(--glow)" }}
        >
          404
        </p>

        <h1 className="mt-5 font-display text-2xl font-black sm:text-3xl">
          Тази страница я няма
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
          Връзката може да е остаряла или разделът още е в разработка. Върни се
          към таблото и продължи оттам.
        </p>

        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/dashboard" className="btn-accent w-full sm:w-auto">
            Към таблото
          </Link>
          <Link href="/" className="btn-ghost w-full sm:w-auto">
            Начало
          </Link>
        </div>
      </section>
    </main>
  );
}
