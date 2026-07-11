/**
 * Instant loading skeleton for the simulator select screen — mirrors the
 * lesson-ladder layout (header, lesson cards, session history). Pure
 * presentational; the 3D scene itself mounts later inside the play shell.
 */
export default function SimulatorLoading() {
  return (
    <div
      className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none"
      role="status"
      aria-label="Зареждане на симулатора"
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="h-9 w-56 rounded-lg bg-surface-2" />
        <div className="h-4 w-80 max-w-full rounded-lg bg-surface-2" />
      </div>

      {/* Lesson ladder cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-44 rounded-xl bg-surface-2" />
        ))}
      </div>

      {/* Session history */}
      <div className="space-y-3">
        <div className="h-5 w-48 rounded-lg bg-surface-2" />
        <div className="h-14 rounded-xl bg-surface-2" />
        <div className="h-14 rounded-xl bg-surface-2" />
      </div>

      <span className="visually-hidden">Зареждане…</span>
    </div>
  );
}
