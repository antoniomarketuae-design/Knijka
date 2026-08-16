import type { CSSProperties } from "react";
import Link from "next/link";

/**
 * The public marketing shell — header, footer, and the one thing that makes
 * this a brand rather than an OS preference: the pinned cluster scope.
 *
 * WHY THE SCOPE LIVES HERE AND NOT ON EACH PAGE. globals.css ships both
 * themes and follows `prefers-color-scheme`, which is correct for the
 * authenticated app (a student revising at 14:00 wants the daylight HUD) and
 * wrong for marketing: on a light-mode laptop the public site rendered as a
 * pale SaaS template that nobody designed — an OS setting did. Putting
 * `data-surface="cluster"` on the group's layout means every public page
 * inherits the committed night identity, and adding one is not a chance to
 * forget it. See docs/platform/83 §2 for the mechanism (the scope re-binds
 * the same semantic token NAMES, so every existing utility inside just works
 * and nothing outside the group moves).
 *
 * `cluster` and not `cluster-band`: this shell OWNS the viewport, so it
 * should also claim the root's colour-scheme — otherwise a light-mode OS
 * paints a white scrollbar gutter beside a black page.
 *
 * `color` has to be restated: `body { color: var(--foreground) }` was already
 * computed against :root by the time this element redefines the variable, and
 * an inherited colour does not re-resolve.
 */
const SCOPE_TEXT = { color: "var(--foreground)" } as CSSProperties;

/** Kept in sync with the legal group's footer — same four documents. */
const LEGAL_LINKS = [
  { href: "/terms", labelBg: "Условия за ползване" },
  { href: "/privacy", labelBg: "Поверителност" },
  { href: "/cookies", labelBg: "Бисквитки" },
  { href: "/contact", labelBg: "Контакт" },
] as const;

function Wordmark() {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-black text-accent-foreground shadow-glow-sm"
      >
        К
      </span>
      Книжка<span className="text-accent">.AI</span>
    </span>
  );
}

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      data-surface="cluster"
      style={SCOPE_TEXT}
      className="relative flex min-h-dvh flex-col bg-background"
    >
      {/* Skip link. Parked off the top edge with a transform rather than
          `.visually-hidden` — it stays a normally-laid-out, always-focusable
          element, so there is no clip/overflow state to un-do on focus and
          nothing for a future utility to fight with. */}
      <a
        href="#content"
        className="absolute left-4 top-4 z-[60] -translate-y-24 rounded-xl border border-control-edge bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-transform focus:translate-y-0 motion-reduce:transition-none"
      >
        Към съдържанието
      </a>

      {/* The bar does not sit on a solid fill: it is a hairline over the hero
          with a blur, so the 3D scene keeps running underneath it instead of
          being cropped by a header-shaped box. */}
      <header className="sticky top-0 z-50 border-b border-hair bg-background/70 backdrop-blur-md">
        {/* EVERY CONTROL IN THIS BAR WAS UNDER 44px, and this is the first
            screen in the product. Measured on the deployed build (WebKit,
            iPhone 16, real insets, both orientations), box AND hit area, which
            for these agree because none of them enlarges itself:

              „Книжка.AI — начало"  136.5 x 32
              „За автошколи"        123.1 x 36   (≥sm only)
              „Вход"                 56.8 x 36
              „Регистрация"         125.8 x 36

            „Вход" and „Регистрация" are the two controls the whole landing page
            exists to be tapped through, and they were 8px short on a phone.
            `min-h-11` states the 44 directly instead of hoping padding adds up
            to it — the same instrument the dashboard topbar's hamburger uses
            after the same finding. The bar's own height does not move: it is
            `py-3.5` around a 36px row, i.e. 64px, and a 44px row inside 64px
            still has 10px of clearance a side. */}
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link
            href="/"
            aria-label="Книжка.AI — начало"
            className="flex min-h-11 items-center rounded-lg"
          >
            <Wordmark />
          </Link>

          <nav aria-label="Основна навигация" className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/za-avtoshkoli"
              className="hidden min-h-11 items-center rounded-xl px-3 py-2 text-sm font-semibold text-muted transition hover:text-foreground motion-reduce:transition-none sm:flex"
            >
              За автошколи
            </Link>
            <Link
              href="/login"
              className="flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-semibold text-muted transition hover:text-foreground motion-reduce:transition-none"
            >
              Вход
            </Link>
            <Link href="/register" className="btn-accent min-h-11 px-4 py-2">
              Регистрация
            </Link>
          </nav>
        </div>
      </header>

      <main id="content" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-sm">
              <Wordmark />
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Подготовка за теоретичния изпит, категория B, и шофьорски
                симулатор в браузъра. Проектът е в разработка — пиши ни, ако
                намериш грешка.
              </p>
            </div>

            {/* 15px tall, all four of them, and 16px to a thumb — the smallest
                targets on the landing page. These are the privacy notice, the
                terms and the cookie policy, on a product whose users are minors
                (ADR-004): „reachable on a phone" is not a nicety here, it is
                the consent surface.

                Grown rather than pseudo-enlarged, for the reason the dashboard
                chips were: they are stacked in a `gap-2` column, so a ::before
                reaching the 29px it would need would overlap the row below and
                make a tap between two rows a coin flip over which legal
                document opens. `w-fit` so the 44px row is only as wide as its
                own label — a full-width block here would put an invisible tap
                target across the whole footer column. */}
            <nav aria-label="Правна информация">
              <p className="hud-label">Документи</p>
              <ul className="mt-1 flex flex-col">
                {LEGAL_LINKS.map(({ href, labelBg }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="flex min-h-11 w-fit items-center text-xs font-semibold text-muted transition hover:text-foreground motion-reduce:transition-none"
                    >
                      {labelBg}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <p className="mt-8 border-t border-border pt-6 text-xs text-muted">
            © 2026 Книжка.AI · България
          </p>
        </div>
      </footer>
    </div>
  );
}
