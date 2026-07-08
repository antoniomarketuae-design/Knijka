"use client";

/**
 * Shared keyframes for the sim HUD (mounted once by the play shell).
 * Kept out of globals.css on purpose: these animations exist only while the
 * simulator is on screen, and the HUD ships as a self-contained package.
 * Every animation respects prefers-reduced-motion.
 */
export function HudStyles() {
  return (
    <style>{`
      @keyframes hud-toast-in {
        from { opacity: 0; transform: translateX(24px) scale(0.96); }
        to   { opacity: 1; transform: translateX(0) scale(1); }
      }
      @keyframes hud-pop {
        0%   { transform: scale(0.4); opacity: 0; }
        60%  { transform: scale(1.15); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes hud-banner-in {
        from { opacity: 0; transform: translateY(-10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes hud-blink {
        0%, 49% { opacity: 1; }
        50%, 100% { opacity: 0.15; }
      }
      .hud-toast-in { animation: hud-toast-in 0.22s ease-out both; }
      .hud-pop { animation: hud-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
      .hud-banner-in { animation: hud-banner-in 0.25s ease-out both; }
      .hud-blink { animation: hud-blink 0.8s step-start infinite; }
      @media (prefers-reduced-motion: reduce) {
        .hud-toast-in, .hud-pop, .hud-banner-in { animation: none; }
        .hud-blink { animation: none; opacity: 1; }
      }
    `}</style>
  );
}
