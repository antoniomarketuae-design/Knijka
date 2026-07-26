import type { ReactNode } from "react";

/**
 * Telemetry readout — a mono microtype label over a tabular value.
 *
 * This is the cluster's TYPOGRAPHIC signature, and it is the piece most
 * easily got wrong by hand. The instrument-cluster look does not come from
 * making numbers big; it comes from the ratio: a dim, tracked-out, uppercase
 * mono caption above a bright tabular figure. Contrast lives in the number.
 * A label at full foreground brightness turns a readout back into a heading
 * and a paragraph — a template.
 *
 * `tabular-nums` is not decoration either: a value that ticks (a count-up, a
 * timer, a live speed) reflows its own width on proportional figures, and
 * that shimmer is exactly what a real instrument never does.
 *
 * Server component, zero JS.
 */

type ReadoutTone = "default" | "accent" | "cyan";
type ReadoutSize = "sm" | "md" | "lg";

interface ReadoutProps {
  /** The dim mono caption, e.g. "ФОРМАТ". Kept short — it is a caption. */
  label: string;
  /** The bright figure, e.g. "45 · 97 · 40". */
  value: ReactNode;
  /** Optional dim line under the value, e.g. "въпроса · точки · мин". */
  sub?: string;
  tone?: ReadoutTone;
  size?: ReadoutSize;
  className?: string;
}

const TONE_CLASS: Record<ReadoutTone, string> = {
  default: "text-foreground",
  accent: "text-accent",
  cyan: "text-accent-2",
};

const SIZE_CLASS: Record<ReadoutSize, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
};

export function Readout({
  label,
  value,
  sub,
  tone = "default",
  size = "md",
  className = "",
}: ReadoutProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <span className="hud-label">{label}</span>
      <span
        className={`font-mono font-bold leading-none tabular-nums ${SIZE_CLASS[size]} ${TONE_CLASS[tone]}`}
      >
        {value}
      </span>
      {sub ? <span className="text-xs text-muted">{sub}</span> : null}
    </div>
  );
}
