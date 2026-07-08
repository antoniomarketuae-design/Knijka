import type { ReadinessSnapshot } from "@/components/dashboard/data";
import { Gauge } from "@/components/hud/Gauge";

/** Band name for the accessible label (Gauge bands identically for its colour). */
function bandLabel(score: number): string {
  if (score >= 75) return "Почти готов";
  if (score >= 50) return "Напредваш";
  return "В началото си";
}

/**
 * Readiness score (0–100) — the analytics module's exam-readiness prediction,
 * rendered on the signature holographic speedometer. Thin wrapper over <Gauge>
 * so the whole cluster shares one instrument; tone="auto" bands the needle by
 * score. Server-rendered; the Gauge itself is the only client boundary.
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
      tone="auto"
      ariaLabel={`Готовност за изпит: ${score} от 100 точки — ${label}`}
    />
  );
}
