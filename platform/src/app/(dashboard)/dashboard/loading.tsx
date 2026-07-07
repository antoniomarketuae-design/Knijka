/**
 * Instant loading skeleton for the hub — mirrors the page's layout so the
 * swap-in doesn't shift content. Pure presentational.
 */
export default function DashboardLoading() {
  return (
    <div
      className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none"
      role="status"
      aria-label="Зареждане на таблото"
    >
      {/* Greeting row */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded-lg bg-surface-2" />
          <div className="h-4 w-72 rounded-lg bg-surface-2" />
        </div>
        <div className="flex gap-3">
          <div className="h-14 w-32 rounded-xl bg-surface-2" />
          <div className="h-14 w-full rounded-xl bg-surface-2 sm:w-80" />
        </div>
      </div>

      {/* Hero card */}
      <div className="h-48 rounded-xl bg-surface-2" />

      {/* Module cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-40 rounded-xl bg-surface-2" />
        <div className="h-40 rounded-xl bg-surface-2" />
        <div className="h-40 rounded-xl bg-surface-2" />
        <div className="h-40 rounded-xl bg-surface-2" />
      </div>

      {/* Readiness + mission */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="h-72 rounded-xl bg-surface-2" />
        <div className="h-72 rounded-xl bg-surface-2" />
      </div>

      {/* Mastery grid */}
      <div className="h-96 rounded-xl bg-surface-2" />

      {/* Achievements */}
      <div className="flex gap-3">
        <div className="h-36 w-56 shrink-0 rounded-xl bg-surface-2" />
        <div className="h-36 w-56 shrink-0 rounded-xl bg-surface-2" />
        <div className="h-36 w-56 shrink-0 rounded-xl bg-surface-2" />
      </div>

      <span className="visually-hidden">Зареждане…</span>
    </div>
  );
}
