import { FAULT_KEYFRAME_INDEX } from "@/modules/clips/view";
import type { FeaturedMistake } from "./featuredMistakes";

/**
 * A captured mistake, played as its five rig keyframes.
 *
 * Server component, zero JavaScript — the motion is the `.reel-frame`
 * primitive in globals.css §5, which is defined only inside
 * `prefers-reduced-motion: no-preference` and whose resting state is the
 * FAULT frame. That inversion is the foundation layer's rule (docs/platform/83
 * §4) and it is what makes a still version of this component still correct:
 * with motion off, the visitor sees the single frame that carries the ❌.
 *
 * WHY NOT THE .webm. The real clips are here and they are 2.5 MB each. Five
 * WebP stills are 85 KB, they need no decoder, they are immune to the
 * MediaRecorder duration bug the why-panel has to work around
 * (clips/view/webmDuration.ts), and they dodge autoplay policy entirely.
 * On the mid-range Android this product is built for, that is the difference
 * between a hero-adjacent proof that loads and one that does not.
 *
 * WHY BACKGROUND-IMAGES AND NOT <img>. The stills are gitignored; a checkout
 * without them must degrade to nothing, and a failed background paints
 * nothing while a failed <img> paints a broken-image icon. `featuredMistakes`
 * already refuses to emit a reel whose files are absent at build, so this is
 * the second of two guards, not the only one.
 */

/** Slot 2 is deliberately absent: the base layer IS the fault frame, so
 *  leaving its slot empty lets the base show through in the middle of the
 *  cycle and keeps the sequence reading k0 → k1 → k2 → k3 → k4 in order. */
const OVERLAY_SLOTS: readonly number[] = [0, 1, 3, 4];

export interface MistakeReelProps {
  mistake: FeaturedMistake;
  /** Seconds for one full pass of the five frames. */
  cycleSec?: number;
  className?: string;
}

export function MistakeReel({ mistake, cycleSec = 10, className = "" }: MistakeReelProps) {
  const { titleBg, frames, faultFrame } = mistake;

  return (
    <div
      // One image to a screen reader, not five layers of one.
      role="img"
      aria-label={`Кадър от симулатора: ${titleBg}. Колата е маркирана в червено в момента на грешката.`}
      className={`panel-inset relative aspect-video w-full overflow-hidden bg-surface-2 bg-cover bg-center ${className}`}
      style={{ backgroundImage: `url("${faultFrame}")` }}
    >
      {OVERLAY_SLOTS.map((slot) => (
        <div
          key={slot}
          aria-hidden
          className="reel-frame absolute inset-0 bg-cover bg-center opacity-0"
          style={{
            // Only READ inside the no-preference media query, so a
            // reduced-motion visitor never fetches these four files.
            ["--reel-src" as string]: `url("${frames[slot]}")`,
            ["--reel-slot" as string]: slot,
            ["--reel-cycle" as string]: `${cycleSec}s`,
          }}
        />
      ))}

      {/* Grades the frame into the cluster palette. The captures are lit for a
          dusk sky that is brighter than this page's ground, and without this
          the panel reads as a photo pasted onto the section.

          The bottom stop is heavy (0.78) because the caption below sits on it
          and the ground underneath CHANGES — five frames cycle through, and
          one of them is a rain-lit road that is much brighter than the still
          this was eyeballed against. The scrim has to guarantee the contrast
          for the worst frame, not the representative one. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(0deg, rgba(4,6,11,0.78) 0%, rgba(4,6,11,0.4) 22%, rgba(4,6,11,0) 46%), linear-gradient(180deg, rgba(4,6,11,0.3) 0%, rgba(4,6,11,0) 30%)",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="grain h-full w-full" />
      </div>

      {/* The provenance strip. It matters that this says WHERE the picture
          came from: the claim being made is "this is our engine", and an
          unlabelled render is indistinguishable from stock art. */}
      <p className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-muted">
        <span className="text-accent-2">● запис от симулатора</span>
        <span aria-hidden className="text-border-strong">
          /
        </span>
        <span>кадър {FAULT_KEYFRAME_INDEX} — моментът на грешката</span>
      </p>
    </div>
  );
}
