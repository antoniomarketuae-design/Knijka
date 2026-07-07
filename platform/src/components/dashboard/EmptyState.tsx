import type { ReactNode } from "react";

/** Shared empty state for data surfaces that have nothing to show yet. */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-8 text-center">
      <p className="text-sm font-semibold">{title}</p>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
