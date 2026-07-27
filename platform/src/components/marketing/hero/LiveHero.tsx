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
 *
 * ...and that whole paragraph is a DESKTOP statement. Below `lg` the shot is
 * not a left-copy/right-car composition at all — both visual layers crop to
 * their right edge and go full-bleed under copy that spans the screen — so
 * the scrim needed a second shape. See SCRIM_WIDE / SCRIM_NARROW.
 */

import type { CSSProperties, ReactNode } from "react";
import { HeroPlate } from "./HeroPlate";
import { HeroStage } from "./HeroStage";
import { HERO_SCRIM_NARROW, HERO_SCRIM_WIDE } from "./heroContrast";

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

/**
 * THE READING SCRIM COMES IN TWO SHAPES, BECAUSE THE COMPOSITION DOES.
 *
 * The scrim's job is stated below at layer 2 and it is absolute: the copy's
 * contrast must not depend on which image happens to be underneath. There is
 * one scrim over the plate, the loop and the live scene, so it can be reasoned
 * about once.
 *
 * It was written weighted HORIZONTALLY, and on a desktop that is exactly
 * right: the copy column is `max-w-2xl` on the left, the sun band and the tail
 * lamps are on the right, so darkening left-to-right buys the text its
 * contrast and costs the picture nothing.
 *
 * On a phone that weighting is meaningless. `HERO_BAND_CLASS` and the plate's
 * `xMaxYMax slice` (and `object-cover object-right-bottom` on the loop) crop
 * both layers to their right-hand slice and stretch it across the full width,
 * while the copy also spans the full width — so the horizontal gradient's dark
 * end lands on the left margin and its transparent end lands on the right half
 * of every line of body text. Measured on a 390 × 844 capture, the loop's sky
 * band sits at 0.16 relative luminance behind the subhead, where `--muted`
 * scores 1.96 : 1. WCAG AA wants 4.5. The still plate scored 5.74 in the same
 * place and only because the drawing happens to be near-black there — which is
 * the invariant failing quietly rather than holding.
 *
 * So below `lg` the weighting turns VERTICAL, which is where this shot's
 * luminance actually varies: sky at the top, road at the bottom.
 *
 *   0 → 62 %   0.78 flat. The copy block (eyebrow, headline, subhead) lives
 *              here and so does the entire bright sky band. 0.78 takes the
 *              sky's 0.32 down to ~0.015 — the plate's own level, so the
 *              crossfade from plate to loop stops being a cut — and leaves
 *              `--muted` at 6.9 : 1.
 *   62 → 84 %  released to 0.16. This is the ROAD, and releasing it is not a
 *              concession to the picture, it is the point: the streaming lane
 *              dashes are the only thing in the mobile crop with real local
 *              contrast, i.e. the only thing a phone can actually see MOVING.
 *              The old bottom-up 0.75 band crushed them to black, which is how
 *              a moving hero still managed to read as a photograph. Nothing
 *              needs the scrim down here — the CTAs at this height carry their
 *              own opaque fills.
 *   84 → 100 % back up to 0.5, so the section still resolves into the page.
 *
 * `lg` (1024 px) is the switch because it is already the line this product
 * draws between the two compositions: `HERO_MIN_VIEWPORT_PX` is 1024, so above
 * it a visitor may get the live scene and the desktop framing, and below it
 * everyone gets the cropped one.
 *
 * BOTH GRADIENTS ARE BUILT IN heroContrast.ts, not here, and that is the part
 * worth keeping. The old scrim was a template literal in this file and its
 * WCAG claim was a sentence in the docblock above it — which is precisely why
 * a second visual layer could break the claim without breaking anything a
 * reviewer or a test could see. Over there the stop tables are data, the
 * compositing is arithmetic, and heroContrast.test.ts checks the ratios that
 * this comment asserts. The wide table is byte-for-byte the gradient that
 * shipped; only the phone's is new.
 */

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
          that can be reasoned about.

          Two elements rather than one CSS variable swap: a `background` set
          from a media query needs either a stylesheet or a duplicated custom
          property, and a pair of siblings that each own one composition is the
          version a reader can check against the numbers in SCRIM_NARROW. Only
          one is ever painted. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 lg:hidden"
        style={{ background: HERO_SCRIM_NARROW }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 hidden lg:block"
        style={{ background: HERO_SCRIM_WIDE }}
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
