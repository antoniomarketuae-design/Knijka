/**
 * Instant loading skeleton for the exams hub — mirrors the page layout
 * (header, rules panel with 4 stats + CTA, history rows). Pure presentational.
 */
export default function ExamsLoading() {
  return (
    <div
      className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none"
      role="status"
      aria-label="Зареждане на пробните изпити"
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="h-4 w-40 rounded-lg bg-surface-2" />
        <div className="h-9 w-56 rounded-lg bg-surface-2" />
        <div className="h-4 w-80 max-w-full rounded-lg bg-surface-2" />
      </div>

      {/* Rules panel: title + 4 stat tiles + text + CTA */}
      <div className="rounded-xl border border-hair bg-surface-2/40 p-5 sm:p-6">
        <div className="h-6 w-72 max-w-full rounded-lg bg-surface-2" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="h-24 rounded-xl bg-surface-2" />
          <div className="h-24 rounded-xl bg-surface-2" />
          <div className="h-24 rounded-xl bg-surface-2" />
          <div className="h-24 rounded-xl bg-surface-2" />
        </div>
        <div className="mt-4 h-4 w-full rounded-lg bg-surface-2" />
        <div className="mt-2 h-4 w-2/3 rounded-lg bg-surface-2" />
        <div className="mt-5 h-11 w-full rounded-xl bg-surface-2 sm:w-56" />
      </div>

      {/* History */}
      <div className="space-y-3">
        <div className="h-5 w-44 rounded-lg bg-surface-2" />
        <div className="h-14 rounded-xl bg-surface-2" />
        <div className="h-14 rounded-xl bg-surface-2" />
        <div className="h-14 rounded-xl bg-surface-2" />
      </div>

      <span className="visually-hidden">Зареждане…</span>
    </div>
  );
}
