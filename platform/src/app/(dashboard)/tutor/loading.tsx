/**
 * Instant loading skeleton for the AI tutor — mirrors the page layout
 * (header + chat panel with a few message bubbles). Pure presentational.
 */
export default function TutorLoading() {
  return (
    <div
      className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none"
      role="status"
      aria-label="Зареждане на AI Учителя"
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="h-9 w-48 rounded-lg bg-surface-2" />
        <div className="h-4 w-96 max-w-full rounded-lg bg-surface-2" />
      </div>

      {/* Chat panel: alternating message bubbles + input row */}
      <div className="rounded-xl border border-hair bg-surface-2/40 p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="h-16 w-3/4 rounded-xl bg-surface-2" />
          <div className="ml-auto h-12 w-2/3 rounded-xl bg-surface-2" />
          <div className="h-20 w-3/4 rounded-xl bg-surface-2" />
        </div>
        <div className="mt-6 h-12 rounded-xl bg-surface-2" />
      </div>

      <span className="visually-hidden">Зареждане…</span>
    </div>
  );
}
