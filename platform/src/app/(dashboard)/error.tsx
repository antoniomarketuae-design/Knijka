"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";

/**
 * Error boundary for every authed screen in the (dashboard) group. A thrown
 * server/render error lands on this cockpit-styled card (mirroring
 * not-found.tsx) instead of Next's raw English screen. „Опитай отново" uses
 * unstable_retry(), which re-fetches and re-renders the failed segment —
 * transient DB/network hiccups recover in place.
 */
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Server errors are redacted client-side; the digest links the log line.
    console.error("dashboard segment error", error.digest ?? error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center px-4 py-16">
      <section className="hud-panel grain relative w-full max-w-md overflow-hidden p-8 text-center sm:p-10">
        <p className="hud-label !text-accent-2">Системен доклад</p>

        <h1 className="mt-5 font-display text-2xl font-black sm:text-3xl">
          Нещо се обърка
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">
          Не е по твоя вина — секцията отказа да зареди. Прогресът ти е запазен.
          Опитай отново или се върни към таблото.
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
          <Link href="/dashboard" className="btn-ghost w-full sm:w-auto">
            Към таблото
          </Link>
        </div>
      </section>
    </div>
  );
}
