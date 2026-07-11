/**
 * Instant loading skeleton for /pricing — mirrors the page layout
 * (header, two pack cards, comparison table, FAQ rows). Pure presentational.
 */
export default function PricingLoading() {
  return (
    <div
      className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none"
      role="status"
      aria-label="Зареждане на плановете"
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="h-9 w-44 rounded-lg bg-surface-2" />
        <div className="h-4 w-96 max-w-full rounded-lg bg-surface-2" />
      </div>

      {/* Pack cards */}
      <div className="grid grid-cols-1 gap-4 pt-3 md:grid-cols-2">
        <div className="h-80 rounded-xl bg-surface-2" />
        <div className="h-80 rounded-xl bg-surface-2" />
      </div>

      {/* Comparison table */}
      <div className="space-y-3">
        <div className="h-5 w-72 max-w-full rounded-lg bg-surface-2" />
        <div className="h-64 rounded-xl bg-surface-2" />
      </div>

      {/* FAQ */}
      <div className="space-y-2">
        <div className="h-5 w-40 rounded-lg bg-surface-2" />
        <div className="h-16 rounded-xl bg-surface-2" />
        <div className="h-16 rounded-xl bg-surface-2" />
        <div className="h-16 rounded-xl bg-surface-2" />
      </div>

      <span className="visually-hidden">Зареждане…</span>
    </div>
  );
}
