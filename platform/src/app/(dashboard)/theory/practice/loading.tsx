/**
 * Instant loading skeleton for a practice session — mirrors the header +
 * question card layout so the swap-in doesn't shift content.
 */
export default function PracticeLoading() {
  return (
    <div
      className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none"
      role="status"
      aria-label="Зареждане на тренировката"
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-surface-2" />
        <div className="h-8 w-64 max-w-full rounded-lg bg-surface-2" />
        <div className="h-4 w-80 max-w-full rounded-lg bg-surface-2" />
      </div>

      {/* Question card */}
      <div className="card flex flex-col gap-5 p-5 sm:p-6">
        <div className="h-4 w-44 rounded bg-surface-2" />
        <div className="h-1.5 w-full rounded-full bg-surface-2" />
        <div className="h-6 w-3/4 rounded-lg bg-surface-2" />
        <div className="flex flex-col gap-2">
          <div className="h-12 rounded-xl bg-surface-2" />
          <div className="h-12 rounded-xl bg-surface-2" />
          <div className="h-12 rounded-xl bg-surface-2" />
        </div>
        <div className="h-11 w-32 rounded-xl bg-surface-2" />
      </div>

      <span className="visually-hidden">Зареждане…</span>
    </div>
  );
}
