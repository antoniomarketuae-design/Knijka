"use client";

/**
 * CoverageTab — the "does every visualizable question have a 3D reel?" audit,
 * so a topic silently falling back to the 2D canvas can never hide again (the
 * gap the founder caught on 2026-07-22). One row per why-panel event: how many
 * questions it covers, the reel it resolves to, and a green "3D" / amber "2D"
 * badge. Fallbacks sort to the top. Data is computed server-side (coverageData).
 */

import { useMemo, useState } from "react";
import type { CoverageRow, CoverageSummary } from "./coverageData";

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

export function CoverageTab({ coverage }: { coverage: CoverageSummary }) {
  const [onlyGaps, setOnlyGaps] = useState(false);

  const rows = useMemo(() => {
    const sorted = [...coverage.rows].sort((a, b) => {
      // fallbacks first, then by question count desc
      if (a.has3dReel !== b.has3dReel) return a.has3dReel ? 1 : -1;
      return b.questionCount - a.questionCount;
    });
    return onlyGaps ? sorted.filter((r) => !r.has3dReel) : sorted;
  }, [coverage.rows, onlyGaps]);

  const reelPct = pct(coverage.reelQuestions, coverage.totalQuestions);
  const gapEvents = coverage.rows.filter((r) => !r.has3dReel).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-2/40 p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-3xl font-black text-success">{reelPct}%</span>
          <span className="text-sm text-muted">
            от поведенческите въпроси показват 3D ролка ({coverage.reelQuestions} от{" "}
            {coverage.totalQuestions})
          </span>
        </div>
        {/* Bar */}
        <div className="h-3 w-full overflow-hidden rounded-full border border-border bg-surface">
          <div
            className="h-full rounded-full bg-success/70"
            style={{ width: `${reelPct}%` }}
            aria-hidden
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-success/50 bg-success/10 px-2.5 py-0.5 font-bold text-success">
            ✓ {coverage.totalEvents - gapEvents} теми с ролка
          </span>
          <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-0.5 font-bold text-amber-600">
            ⚠ {gapEvents} теми на 2D ({coverage.fallbackQuestions} въпроса)
          </span>
          <button
            type="button"
            onClick={() => setOnlyGaps((v) => !v)}
            aria-pressed={onlyGaps}
            className={`ml-auto rounded-full border px-3 py-1 text-xs font-bold transition motion-reduce:transition-none ${
              onlyGaps
                ? "border-amber-500 bg-amber-500/15 text-amber-600"
                : "border-border bg-surface text-muted hover:text-foreground"
            }`}
          >
            ⚠ Само празнините
          </button>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          „Тема&quot; = събитие от разбора (mistake-type). 585 поведенчески въпроса се
          свеждат до тези теми; всяка с ролка → ученикът вижда 3D, иначе 2D
          платно. Целта: всички визуализируеми въпроси → 3D.
        </p>
      </div>

      {/* Rows */}
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <CoverageRowItem key={r.event} row={r} />
        ))}
      </ul>
    </div>
  );
}

function CoverageRowItem({ row }: { row: CoverageRow }) {
  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 ${
        row.has3dReel ? "border-border bg-surface" : "border-amber-500/40 bg-amber-500/5"
      }`}
    >
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
          row.has3dReel
            ? "border-success/50 bg-success/10 text-success"
            : "border-amber-500/50 bg-amber-500/10 text-amber-600"
        }`}
      >
        {row.has3dReel ? "3D ✓" : "2D ⚠"}
      </span>
      <span className="min-w-0 flex-1 font-mono text-xs">
        <span className="font-bold text-foreground">{row.event}</span>
        {row.templateId ? (
          <span className="text-muted"> → {row.templateId}</span>
        ) : (
          <span className="text-muted"> → (без ролка)</span>
        )}
      </span>
      {row.mistakeTitleBg ? (
        <span className="hidden max-w-[40%] truncate text-xs text-muted sm:inline" title={row.mistakeTitleBg}>
          {row.mistakeTitleBg}
        </span>
      ) : null}
      <span className="shrink-0 rounded-full border border-border bg-surface-2/60 px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted">
        {row.questionCount} въпр.
      </span>
    </li>
  );
}
