"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

/**
 * Celebration — the NEON "reward flourish" register (doc 64).
 *
 * A one-shot, high-energy congratulations moment for achievements (e.g.
 * passing a mock exam). Magenta→blue taillight streaks sweep once across the
 * viewport behind a glowing headline. Non-modal by design: it overlays the
 * page without trapping focus or blocking interaction — only the card and its
 * buttons capture pointer events, everything else falls through.
 *
 * Motion is transform/opacity only. Under `prefers-reduced-motion: reduce`
 * the streaks are removed and nothing animates — it degrades to a calm,
 * static congratulations panel. Accessible as a polite live region.
 */

interface CelebrationProps {
  /** When true (and not yet dismissed) the flourish is shown. Fires once. */
  show: boolean;
  /** Big glowing headline, e.g. "Взе изпита!". */
  title: string;
  /** Optional supporting line under the headline. */
  subtitle?: string;
}

/** Streak choreography — varied lanes, angles, speeds and stagger. */
const STREAKS: {
  top: string;
  rot: string;
  dur: string;
  delay: string;
  height: number;
  peak: number;
}[] = [
  { top: "16%", rot: "-16deg", dur: "1.7s", delay: "0.00s", height: 5, peak: 0.95 },
  { top: "33%", rot: "-21deg", dur: "2.0s", delay: "0.18s", height: 3, peak: 0.7 },
  { top: "47%", rot: "-14deg", dur: "1.6s", delay: "0.42s", height: 7, peak: 1 },
  { top: "61%", rot: "-23deg", dur: "2.1s", delay: "0.10s", height: 4, peak: 0.8 },
  { top: "74%", rot: "-17deg", dur: "1.85s", delay: "0.55s", height: 3, peak: 0.65 },
  { top: "88%", rot: "-19deg", dur: "1.95s", delay: "0.30s", height: 5, peak: 0.85 },
];

const CSS = `
.celebration-veil {
  background:
    radial-gradient(130% 90% at 50% 40%, rgba(255, 61, 127, 0.12), transparent 55%),
    radial-gradient(100% 75% at 50% 62%, var(--glow-soft), transparent 62%);
}
.celebration-streaks { display: none; }
.celebration-streak {
  position: absolute;
  left: -30vw;
  width: 62vw;
  border-radius: 999px;
  opacity: 0;
  background: linear-gradient(90deg, transparent, #FF3D7F 32%, var(--accent) 72%, transparent);
  box-shadow: 0 0 14px rgba(255, 61, 127, 0.55), 0 0 30px var(--glow);
  filter: blur(0.5px);
  will-change: transform, opacity;
}
.celebration-title {
  background: linear-gradient(100deg, #FF3D7F, var(--accent-soft) 58%, var(--accent));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 16px rgba(255, 61, 127, 0.45)) drop-shadow(0 0 34px var(--glow));
}
.celebration-card {
  border-radius: 1.25rem;
  border: 1px solid rgba(255, 61, 127, 0.5);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(12px);
  box-shadow:
    0 0 0 1px var(--glow-soft),
    0 24px 70px rgba(0, 0, 0, 0.5),
    0 0 46px rgba(255, 61, 127, 0.22);
}
@media (prefers-reduced-motion: no-preference) {
  .celebration-streaks { display: block; }
  .celebration-streak {
    animation: celebration-streak var(--dur, 1.9s) cubic-bezier(0.4, 0, 0.2, 1) var(--delay, 0s) 1 both;
  }
  .celebration-card { animation: celebration-rise 520ms ease-out both; }
  .celebration-title { animation: celebration-pop 660ms cubic-bezier(0.2, 0.9, 0.25, 1) both; }
}
@keyframes celebration-streak {
  0% { transform: translate3d(-30vw, 0, 0) rotate(var(--rot, -18deg)); opacity: 0; }
  14% { opacity: var(--peak, 0.9); }
  86% { opacity: var(--peak, 0.9); }
  100% { transform: translate3d(150vw, 0, 0) rotate(var(--rot, -18deg)); opacity: 0; }
}
@keyframes celebration-pop {
  0% { transform: scale(0.82); opacity: 0; }
  55% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes celebration-rise {
  0% { transform: translateY(16px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
`;

export function Celebration({ show, title, subtitle }: CelebrationProps) {
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!show || dismissed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDismissed(true);
    };
    window.addEventListener("keydown", onKey);

    // Auto-retire the flourish only when motion is allowed; under reduced
    // motion the calm panel stays until the user dismisses it.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) timer = setTimeout(() => setDismissed(true), 6200);

    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer) clearTimeout(timer);
    };
  }, [show, dismissed]);

  if (!mounted || !show || dismissed) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-4"
    >
      <style>{CSS}</style>

      {/* Ambient neon vignette */}
      <div aria-hidden className="celebration-veil absolute inset-0" />

      {/* Taillight-streak sweep (motion only) */}
      <div aria-hidden className="celebration-streaks absolute inset-0">
        {STREAKS.map((s, i) => (
          <span
            key={i}
            className="celebration-streak"
            style={
              {
                top: s.top,
                height: `${s.height}px`,
                "--rot": s.rot,
                "--dur": s.dur,
                "--delay": s.delay,
                "--peak": String(s.peak),
              } as CSSProperties
            }
          />
        ))}
      </div>

      {/* The reward card — the only interactive surface */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="celebration-card pointer-events-auto relative z-10 flex w-full max-w-md flex-col items-center gap-4 px-7 py-9 text-center"
      >
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Затвори"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none text-muted transition hover:bg-surface-2 hover:text-foreground motion-reduce:transition-none"
        >
          <span aria-hidden>×</span>
        </button>

        <span className="hud-label" style={{ color: "#FF3D7F" }}>
          Постижение отключено
        </span>

        <h2 className="celebration-title font-display text-4xl font-black leading-tight sm:text-5xl">
          {title}
        </h2>

        {subtitle ? (
          <p className="max-w-xs text-sm leading-relaxed text-muted">{subtitle}</p>
        ) : null}

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="btn-accent mt-2"
        >
          Продължи
        </button>
      </div>
    </div>,
    document.body,
  );
}
