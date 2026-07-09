"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Holographic Speedometer — the signature HUD instrument (doc 64).
 *
 * A 270° tachometer-style gauge with a sweeping needle and count-up numeral.
 * Reusable at any scale for lesson progress / XP / exam-readiness. Pure SVG +
 * CSS variables (no WebGL). Animates once on mount; honours reduced-motion by
 * snapping straight to the final value.
 */

const START = -135; // degrees from top (12 o'clock), negative = left
const SWEEP = 270; // total arc; 90° gap centred at the bottom
const TICKS = 10;

type Tone = "brand" | "cyan" | "auto";

interface GaugeProps {
  /** Current value. */
  value: number;
  /** Full-scale value (default 100). */
  max?: number;
  /** Big unit under the number, e.g. "% готовност" or "XP". */
  unit?: string;
  /** Optional pill label under the gauge (e.g. band name). */
  label?: string;
  /** Diameter in px (default 200). */
  size?: number;
  /** Colour: fixed brand/cyan, or "auto" to band by value. */
  tone?: Tone;
  /**
   * Explicit fill/needle colour (any CSS colour, e.g. "var(--success)"). When
   * set it wins over `tone` — use it to drive the gauge from meaning (exam
   * verdict, "just started" onboarding) rather than raw value.
   */
  color?: string;
  /** Accessible description of the whole instrument. */
  ariaLabel: string;
  /** Format the centre number (default: rounded integer). */
  format?: (shown: number) => string;
}

function pt(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function arcPath(cx: number, cy: number, r: number, frac: number): string {
  const span = SWEEP * Math.max(0, Math.min(1, frac));
  if (span <= 0.01) return "";
  const [x0, y0] = pt(cx, cy, r, START);
  const [x1, y1] = pt(cx, cy, r, START + span);
  const large = span > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function autoColor(frac: number): { color: string; band: string } {
  if (frac >= 0.75) return { color: "var(--success)", band: "Почти готов" };
  if (frac >= 0.5) return { color: "var(--warning)", band: "Напредваш" };
  return { color: "var(--danger)", band: "В началото си" };
}

export function Gauge({
  value,
  max = 100,
  unit,
  label,
  size = 200,
  tone = "brand",
  color: colorOverride,
  ariaLabel,
  format,
}: GaugeProps) {
  const target = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const [frac, setFrac] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setFrac(target);
      return;
    }
    const DURATION = 1300;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / DURATION);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setFrac(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target]);

  const cx = 100;
  const cy = 100;
  const r = 80;
  const resolved =
    tone === "auto"
      ? autoColor(target)
      : { color: tone === "cyan" ? "var(--accent-2)" : "var(--accent)", band: label ?? "" };
  const color = colorOverride ?? resolved.color;
  const bandLabel = label ?? (tone === "auto" ? resolved.band : "");

  const shownValue = Math.round(frac * max);
  const centre = format ? format(shownValue) : String(shownValue);
  const needleAngle = START + SWEEP * frac;
  const [nx, ny] = pt(cx, cy, r - 14, needleAngle);

  return (
    <figure className="flex flex-col items-center gap-3" style={{ margin: 0 }}>
      <div
        role="img"
        aria-label={ariaLabel}
        className="relative"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden>
          {/* Tick marks — instrument detailing */}
          {Array.from({ length: TICKS + 1 }, (_, i) => {
            const a = START + (SWEEP * i) / TICKS;
            const [x1, y1] = pt(cx, cy, r + 9, a);
            const [x2, y2] = pt(cx, cy, r + 14, a);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--hair)"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            );
          })}
          {/* Track */}
          <path
            d={arcPath(cx, cy, r, 1)}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth={12}
            strokeLinecap="round"
          />
          {/* Fill */}
          <path
            d={arcPath(cx, cy, r, frac)}
            fill="none"
            stroke={color}
            strokeWidth={12}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 7px ${color})` }}
          />
          {/* Needle */}
          <line
            x1={cx}
            y1={cy}
            x2={nx}
            y2={ny}
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 5px ${color})` }}
          />
          <circle cx={cx} cy={cy} r={6} fill={color} />
          <circle cx={cx} cy={cy} r={3} fill="var(--surface)" />
        </svg>
        <div
          aria-hidden
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <span
            className="font-mono font-bold tabular-nums leading-none"
            style={{ fontSize: size * 0.24 }}
          >
            {centre}
          </span>
          {unit ? (
            <span className="mt-1 hud-label" style={{ fontSize: size * 0.05 }}>
              {unit}
            </span>
          ) : null}
        </div>
      </div>
      {bandLabel ? (
        <figcaption>
          <span
            className="rounded-full px-3 py-1 text-xs font-bold"
            style={{ color, backgroundColor: "var(--surface-2)" }}
          >
            {bandLabel}
          </span>
        </figcaption>
      ) : null}
    </figure>
  );
}
