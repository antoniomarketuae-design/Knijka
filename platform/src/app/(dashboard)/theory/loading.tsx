/**
 * Instant loading skeleton for the theory hub — mirrors the page layout
 * (header, smart-training card, topic grid). Pure presentational.
 */
export default function TheoryLoading() {
  return (
    <div
      className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none"
      role="status"
      aria-label="Зареждане на темите"
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="h-8 w-40 rounded-lg bg-surface-2" />
        <div className="h-4 w-80 max-w-full rounded-lg bg-surface-2" />
      </div>

      {/* Smart training card */}
      <div className="h-28 rounded-xl bg-surface-2" />

      {/* Topic grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="h-40 rounded-xl bg-surface-2" />
        ))}
      </div>

      <span className="visually-hidden">Зареждане…</span>
    </div>
  );
}
