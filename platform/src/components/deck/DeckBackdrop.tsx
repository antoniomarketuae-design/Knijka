/**
 * THE DECK — the layer behind the whole authenticated app.
 *
 * Founder review, verbatim: „here in the background of this page, I want
 * futuristic 3d background like we did in the landing page, currently this dark
 * background is purely old and not futuristic", and before that, of the app as
 * a whole: „we made it dark but nothing much changes".
 *
 * He is right, and the diagnosis has two halves.
 *
 * FIRST, THERE WAS NOTHING THERE. Doc 83 gave this plane `.haze` — three static
 * gradients — and the (dashboard) layout mounted it at `fixed inset-0 -z-10`,
 * behind a wrapper that painted an opaque `bg-background` and formed no
 * stacking context. So the negative-z layer painted UNDER that fill and was
 * never visible on an authenticated page: captured at 1440×900 and 390×844, the
 * plane was flat #05070c edge to edge. See the `isolate` note on the layout.
 *
 * SECOND, EVEN VISIBLE IT WOULD NOT HAVE BEEN ENOUGH. A glow is not a SPACE.
 * There is nothing in three gradients: no horizon line, no distance, nothing
 * that could only be this product. Every dark SaaS dashboard on the internet has
 * that gradient.
 *
 * So the deck replaces it — in the same plane, at the same cost class, under
 * the same contrast ceiling — with the thing the landing page already
 * established: a Bulgarian road at dusk under Vitosha, seen from the driver's
 * seat, with a heading tape etched across the horizon. Doc 84 gave the panels
 * a bezel and a graticule; this is the bay they are mounted in.
 *
 * FOUR LAYERS, and the order is the whole composition:
 *
 *   0  the ground        `--background`, so nothing can ever show through.
 *   1  the plate         the drawn road, ridge, sky and graticule (DeckPlate,
 *                        a Server Component: zero JS, zero requests).
 *   2  the drift         one compositor-only CSS animation, desktop only,
 *                        paused when the tab is hidden (DeckMotion).
 *   3  the cabin         vignette + edge falloff, over everything, so the
 *                        content sits in a lit pool and the frame is moulded
 *                        darkness. Pure darkening, so it can only ever IMPROVE
 *                        contrast.
 *
 * COST, measured (tools/clips/headless/deck-cost.mjs). Layers 0, 1 and 3 are
 * one paint of a `fixed` element that never repaints on scroll — the same class
 * of work `.haze` was already doing — plus 9.2 KB of inline SVG, 1.6 KB
 * gzipped, at zero requests and zero JavaScript. Layer 2 is a transform on a
 * promoted layer, and only on a machine that asked for it.
 *
 * CONTRAST. Every colour in layers 1 and 3 is at or under the brightest pixel
 * `.haze` already painted (deckScene.ts states the invariant and the proof;
 * deckScene.test.ts checks every ingredient). That is why this change cannot
 * move a single one of the ratios clusterScope / checkControl / mastery pin.
 *
 * A Server Component apart from DeckMotion, and `aria-hidden` throughout: a
 * screen reader must not announce a drawing of a road.
 */

import { DeckMotion } from "./DeckMotion";
import { DeckPlate } from "./DeckPlate";

export interface DeckBackdropProps {
  /** Extra classes on the root. Positioning is the caller's business. */
  className?: string;
}

export function DeckBackdrop({ className = "" }: DeckBackdropProps) {
  return (
    <div aria-hidden className={`deck pointer-events-none ${className}`}>
      <DeckPlate className="absolute inset-0" />
      <DeckMotion />
      {/* The cabin. It is a separate element rather than more SVG because it is
          VIEWPORT-relative, not scene-relative: a vignette belongs to the frame
          you are looking through, and must not scale or crop with the drawing
          behind it. */}
      <div aria-hidden className="deck-cabin absolute inset-0" />
    </div>
  );
}
