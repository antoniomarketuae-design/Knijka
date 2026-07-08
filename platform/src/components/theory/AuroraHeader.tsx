import type { ReactNode } from "react";

/**
 * Calm header band for the THEORY / PRACTICE surfaces ("Calm Reading" register).
 *
 * A slow aurora — electric blue → violet → holo-cyan — drifts behind the title,
 * masked into a soft top-left glow so it reads as ambient light, never as
 * telemetry behind reading text. The `aurora-drift` keyframes live in
 * globals.css; the animation is declared inline here, and the `aurora-drift`
 * class lets the reduced-motion rule (`animation: none !important`) freeze it to
 * a static wash. Pure CSS (background-position), no WebGL, no repaint on scroll.
 *
 * Server component (no client hooks) so it composes into the server pages.
 */
export function AuroraHeader({
  children,
  intensity = "full",
}: {
  children: ReactNode;
  /** `soft` dims the band further for pages where reading follows immediately. */
  intensity?: "full" | "soft";
}) {
  return (
    <header className="relative isolate overflow-hidden rounded-2xl border border-hair bg-surface/50 px-6 py-8 sm:px-9 sm:py-10">
      <div
        aria-hidden
        className="aurora-drift pointer-events-none absolute inset-0 -z-10"
        style={{
          opacity: intensity === "soft" ? 0.38 : 0.55,
          background:
            "linear-gradient(115deg, transparent 0%, color-mix(in srgb, var(--accent) 24%, transparent) 22%, color-mix(in srgb, #8b5cf6 22%, transparent) 48%, color-mix(in srgb, var(--accent-2) 24%, transparent) 74%, transparent 100%)",
          backgroundSize: "220% 220%",
          animation: "aurora-drift 16s ease-in-out infinite",
          maskImage:
            "radial-gradient(130% 150% at 12% 0%, black 0%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(130% 150% at 12% 0%, black 0%, transparent 70%)",
        }}
      />
      <div className="relative">{children}</div>
    </header>
  );
}
