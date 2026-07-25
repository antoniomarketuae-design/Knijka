import type { ReadinessSnapshot } from "@/lib/dashboard/data";
import { Gauge } from "@/components/hud/Gauge";

/** Band name for the accessible label + the pill under the gauge. */
function bandLabel(score: number): string {
  if (score >= 75) return "Почти готов";
  if (score >= 50) return "Напредваш";
  return "В началото си";
}

/**
 * Fill colour by band. The "just started" floor is neutral/interactive accent —
 * never danger-red: a day-one 0 is a starting point to encourage, not a warning
 * light to punish. Red stays reserved for genuine answer-level errors.
 */
function bandColor(score: number): string {
  if (score >= 75) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--accent)";
}

/**
 * Readiness score (0–100) — the analytics module's exam-readiness prediction,
 * rendered on the signature holographic speedometer. Thin wrapper over <Gauge>
 * so the whole cluster shares one instrument; the band colour is passed
 * explicitly so a beginner reads neutral, not danger-red. Server-rendered; the
 * Gauge itself is the only client boundary.
 */
export function ReadinessRing({ readiness }: { readiness: ReadinessSnapshot }) {
  const score = Math.max(0, Math.min(100, Math.round(readiness.score)));
  const label = bandLabel(score);

  return (
    <Gauge
      value={score}
      max={100}
      unit="/ 100"
      size={196}
      color={bandColor(score)}
      label={label}
      ariaLabel={`Готовност за изпит: ${score} от 100 точки — ${label}`}
    />
  );
}
