"use client";

/**
 * Speed card — glassy bottom-left readout with an animated limit ring.
 * The ring fills with the current speed relative to the legal limit
 * (WorldRuntime.speedLimitAt feeds `limitKmh`) and changes tone the moment
 * the driver leaves legality: accent under the limit, amber over it,
 * red beyond +10 km/h (the official "dangerous" band, doc 32).
 */

const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;
/** Ring is full at 140% of the limit — headroom so red still reads as growth. */
const RING_HEADROOM = 1.4;

export function SpeedCard({ speedKmh, limitKmh }: { speedKmh: number; limitKmh: number }) {
  const speed = Math.max(0, Math.round(speedKmh));
  const limit = Math.max(1, Math.round(limitKmh));

  const tone =
    speed > limit + 10 ? "var(--danger)" : speed > limit ? "var(--warning)" : "var(--accent)";
  const fraction = Math.min(1, speedKmh / (limit * RING_HEADROOM));

  return (
    <div className="pointer-events-none flex items-center gap-3 rounded-2xl border border-border bg-surface/75 py-2.5 pl-3 pr-4 shadow-glow-sm backdrop-blur-md select-none">
      <div className="relative h-[72px] w-[72px]" aria-hidden>
        <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
          <circle
            cx="36"
            cy="36"
            r={RING_R}
            fill="none"
            stroke="var(--border)"
            strokeWidth="5"
          />
          <circle
            cx="36"
            cy="36"
            r={RING_R}
            fill="none"
            stroke={tone}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - fraction)}
            style={{
              transition:
                "stroke-dashoffset 0.25s ease-out, stroke 0.25s ease-out",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-2xl font-black leading-none tabular-nums"
            style={{ color: tone }}
          >
            {speed}
          </span>
          <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-muted">
            км/ч
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted">
          Ограничение
        </span>
        {/* Stylized В26-type limit disc, drawn with tokens so both themes work. */}
        <span
          aria-label={`Ограничение ${limit} км/ч`}
          className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] bg-surface text-sm font-black tabular-nums text-foreground"
          style={{ borderColor: "var(--danger)" }}
        >
          {limit}
        </span>
      </div>
    </div>
  );
}
