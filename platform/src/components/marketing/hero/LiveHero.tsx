/**
 * The hero shell — plate underneath, live scene over it, copy on top.
 *
 * A Server Component, deliberately: everything here except <HeroStage/> is
 * markup that ships as HTML and costs the browser no JavaScript at all. The
 * caller supplies the headline and the calls to action as `children`, so this
 * file owns the IMAGE and the composition and never the copy — the landing
 * page keeps its own voice, and this stays reusable for a schools page or a
 * pricing hero later.
 *
 * Contrast: the plate's left two-thirds sit under 0.09 relative luminance
 * (see HeroPlate's scrim), so `--foreground` (#e7eef9) over it is ~17:1 and
 * `--muted` (#94a6c4) is ~7.4:1 — both clear WCAG AA for body text with
 * room to spare. That headroom is the reason the copy column belongs on the
 * left; a caller who moves it right must re-check, because the sun band and
 * the tail lamps live over there.
 */

import type { CSSProperties, ReactNode } from "react";
import { HeroPlate } from "./HeroPlate";
import { HeroStage } from "./HeroStage";

/**
 * The dark marketing scope.
 *
 * globals.css ships BOTH themes and follows the OS via
 * `prefers-color-scheme`, which is right for the authenticated app: a student
 * revising at 14:00 in a bright room should get the daylight HUD. The hero is
 * different — it is a photograph of dusk, and there is no light-mode version
 * of that image. Left to the OS, this section renders its edge gradients
 * white and its headline navy over a night sky.
 *
 * `data-surface="cluster"` is the scope globals.css declares for exactly this
 * (see the block's own comment there, and docs/platform/83): it re-binds the
 * same semantic token NAMES to cluster values on one ancestor, so every
 * existing utility inside — bg-surface, border-hair, .btn-accent, .hud-label
 * — renders in the committed night identity while everything outside is
 * untouched. Nothing here re-declares a colour; a second copy of the palette
 * is exactly how two dark themes start to drift.
 *
 * `color` still has to be set by hand: `body { color: var(--foreground) }` was
 * already computed by the time this element redefines the variable, and an
 * inherited colour does not re-resolve.
 */
const SCOPE_TEXT = { color: "var(--foreground)" } as CSSProperties;

export interface LiveHeroProps {
  /** The headline, subhead and CTAs. Rendered above both visual layers. */
  children: ReactNode;
  /** Extra classes on the section wrapper — sizing is the caller's call. */
  className?: string;
}

export function LiveHero({ children, className = "" }: LiveHeroProps) {
  return (
    <div
      data-surface="cluster"
      style={SCOPE_TEXT}
      className={`relative isolate flex min-h-[34rem] w-full flex-col justify-center overflow-hidden bg-background sm:min-h-[40rem] lg:min-h-[44rem] ${className}`}
    >
      {/* Layer 0 — the plate. Always mounted, never replaced. */}
      <div className="absolute inset-0 z-0">
        <HeroPlate />
      </div>

      {/* Layer 1 — the live scene, when the visitor can afford it. No z-index
          here on purpose: the stage must not form a stacking context, or its
          pause control could never rise above the scrim in layer 2. */}
      <HeroStage className="absolute inset-0" />

      {/* Layer 2 — the reading scrim, ABOVE both visual layers.
          It sits here rather than inside the plate for one reason: the copy's
          contrast must not depend on which image happens to be underneath.
          The live scene renders a golden dusk sky whose luminance the plate
          cannot predict, so one scrim over both is the only version of this
          that can be reasoned about. Left-weighted because the headline
          column is on the left; the top band exists because the sky is the
          brightest thing in either layer. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: [
            "linear-gradient(90deg, rgba(4,6,11,0.9) 0%, rgba(4,6,11,0.62) 34%, rgba(4,6,11,0.12) 64%, rgba(4,6,11,0) 82%)",
            "linear-gradient(0deg, rgba(4,6,11,0.75) 0%, rgba(4,6,11,0) 38%)",
            "linear-gradient(180deg, rgba(4,6,11,0.62) 0%, rgba(4,6,11,0) 26%)",
          ].join(", "),
        }}
      />

      {/* Layer 2b — the joins. The hero has to end INTO the page rather than at
          a hard edge, or the whole section reads as a pasted-in banner. Both
          gradients resolve to --background, so they follow the theme. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28"
        style={{
          background: "linear-gradient(to top, var(--background) 0%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24"
        style={{
          background: "linear-gradient(to bottom, var(--background) 0%, transparent 100%)",
        }}
      />
      {/* Filmic grain over everything — it is what stops a wide dark gradient
          from banding on an 8-bit panel, and it ties the drawn plate and the
          rendered scene into one image. The class goes on an INNER element
          because `.grain` sets `position: relative` and would otherwise beat
          Tailwind's `absolute` (it is unlayered, utilities are layered). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
        <div className="grain h-full w-full" />
      </div>

      {/* Layer 3 — the copy. */}
      <div className="relative z-20 w-full">{children}</div>
    </div>
  );
}
