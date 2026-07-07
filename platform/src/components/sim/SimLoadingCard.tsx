"use client";

/**
 * Placeholder card while the simulator bundle (three + rapier wasm) loads,
 * and during the first-client-render capability check. Matches the canvas
 * footprint so the page does not jump.
 */
export function SimLoadingCard() {
  return (
    <div
      className="flex aspect-video w-full items-center justify-center rounded-xl border border-border bg-surface"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3">
        <span
          aria-hidden
          className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
        />
        <p className="text-sm font-semibold text-muted">Зареждане на симулатора…</p>
      </div>
    </div>
  );
}
