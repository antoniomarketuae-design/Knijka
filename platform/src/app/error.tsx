"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";

/**
 * Root-level error boundary for the public pages (landing, auth, legal,
 * onboarding). The (dashboard) group has its own error.tsx, which wins for
 * authed screens. Same cockpit language as not-found.tsx — a Bulgarian
 * teenager never sees Next's default English error screen.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("app error", error.digest ?? error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-16">
      <section className="hud-panel grain relative w-full max-w-md overflow-hidden p-8 text-center sm:p-10">
        <p className="hud-label !text-accent-2">Системен доклад</p>

        <h1 className="mt-5 font-display text-2xl font-black sm:text-3xl">
          Нещо се обърка
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
          Страницата отказа да зареди. Опитай отново — ако проблемът остане,
          върни се към началото.
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
          <Link href="/" className="btn-ghost w-full sm:w-auto">
            Начало
          </Link>
        </div>
      </section>
    </main>
  );
}
