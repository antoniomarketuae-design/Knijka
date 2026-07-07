import type { ReadinessSnapshot } from "@/components/dashboard/data";

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function band(score: number): { color: string; labelBg: string } {
  if (score >= 75) return { color: "var(--success)", labelBg: "Почти готов" };
  if (score >= 50) return { color: "var(--warning)", labelBg: "Напредваш" };
  return { color: "var(--danger)", labelBg: "В началото си" };
}

/**
 * Readiness score ring (0–100) — analytics module's exam-readiness
 * prediction v1. Pure SVG, server-rendered.
 */
export function ReadinessRing({ readiness }: { readiness: ReadinessSnapshot }) {
  const score = Math.max(0, Math.min(100, Math.round(readiness.score)));
  const { color, labelBg } = band(score);
  const offset = CIRCUMFERENCE * (1 - score / 100);

  return (
    <figure className="flex flex-col items-center gap-3">
      <div
        role="img"
        aria-label={`Готовност за изпит: ${score} от 100 — ${labelBg}`}
        className="relative"
      >
        <svg viewBox="0 0 128 128" className="h-40 w-40" aria-hidden>
          <circle
            cx="64"
            cy="64"
            r={RADIUS}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth="10"
          />
          <circle
            cx="64"
            cy="64"
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 64 64)"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <div
          aria-hidden
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="text-4xl font-black tabular-nums">{score}</span>
          <span className="text-xs font-semibold text-muted">от 100</span>
        </div>
      </div>
      <figcaption className="text-center">
        <span
          className="rounded-full px-3 py-1 text-xs font-bold"
          style={{ color, backgroundColor: "var(--surface-2)" }}
        >
          {labelBg}
        </span>
      </figcaption>
    </figure>
  );
}
