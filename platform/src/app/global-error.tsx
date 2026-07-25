"use client"; // Error boundaries must be Client Components

import "./globals.css";

/**
 * Last-resort boundary: replaces the ROOT layout when even it fails to
 * render, so it must ship its own <html>/<body>. Design tokens come from the
 * globals.css import; the branded fonts may be gone — system fallbacks are
 * acceptable at this depth. Keep zero app imports: anything this file pulls
 * in can itself be the thing that crashed.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="bg">
      <body className="flex min-h-dvh flex-col items-center justify-center px-4 py-16">
        <title>Нещо се обърка · Книжка.AI</title>
        <section className="hud-panel w-full max-w-md p-8 text-center sm:p-10">
          <p className="hud-label">Системен доклад</p>
          <h1 className="mt-5 font-display text-2xl font-black">
            Нещо се обърка
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
            Приложението не успя да зареди. Опитай отново — прогресът ти е
            запазен на сървъра.
          </p>
          {error.digest ? (
            <p className="mt-3 font-mono text-[11px] text-muted">
              Код: {error.digest}
            </p>
          ) : null}
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="btn-accent w-full sm:w-auto"
            >
              Опитай отново
            </button>
            {/* A hard <a>, not next/link, on purpose: global-error replaces the
                root layout because the React tree below it already failed. A
                client-side navigation would re-mount into that same broken tree;
                a full document load is the only thing guaranteed to recover. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="btn-ghost w-full sm:w-auto">
              Начало
            </a>
          </div>
        </section>
      </body>
    </html>
  );
}
