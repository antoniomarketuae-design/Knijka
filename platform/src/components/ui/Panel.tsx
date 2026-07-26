import type { CSSProperties, ReactNode } from "react";

/**
 * Instrument panel — the cluster's one surface primitive.
 *
 * Doc 64 gave us `.card` (flat) and `.hud-panel` (glass) as two unrelated
 * classes, and call sites have been choosing between them by feel. This
 * component makes the choice explicit and, more usefully, makes it CHEAP to
 * get right: the glass variant is the expensive one (backdrop-filter costs
 * 15–30% FPS on the mid-range Androids our students own, doc 64 §7), so it
 * has to be something you ask for by name rather than something you inherit.
 *
 * Deliberately a server component with no state and no hooks: a landing page
 * made of these ships zero extra JS. Hover physics are opt-in via `lift` and
 * are pure CSS.
 *
 * Depth here is a lit top edge plus a hairline, not a drop shadow — on the
 * near-black cluster ground a shadow is invisible. See the DEPTH PRIMITIVES
 * block in globals.css for why.
 */

type PanelTone =
  /** Opaque instrument surface. The default; use it freely. */
  | "solid"
  /** Glass. Budget: 1–2 per screen, never over a live 3D canvas on mobile. */
  | "glass"
  /** Recessed well — gauge tracks, readouts, anything set INTO the panel. */
  | "inset";

/** Tags a panel is allowed to be. Kept a closed set so `as` cannot smuggle
 *  interactive elements in — a panel with hover physics that is secretly a
 *  <button> needs real button semantics, not a div with a lift class. */
type PanelTag = "div" | "section" | "article" | "aside" | "li" | "figure";

interface PanelProps {
  children: ReactNode;
  /** Semantic element. Default "div". */
  as?: PanelTag;
  /** Surface treatment. Default "solid". */
  tone?: PanelTone;
  /** Four L-shaped HUD framing corners. Decorative; adds `relative`. */
  corners?: boolean;
  /** Hover physics (lift + lit edge). Only meaningful if the panel is a link
   *  or contains one — a card that lifts but does nothing is a lie. */
  lift?: boolean;
  className?: string;
  /** Escape hatch for the choreography custom properties only (--enter-i,
   *  --reveal-delay). Colour and spacing belong in className. */
  style?: CSSProperties;
}

const TONE_CLASS: Record<PanelTone, string> = {
  solid: "panel",
  glass: "panel-glass",
  inset: "panel-inset",
};

/** Four L-shaped framing corners — the cheapest signal that a rectangle is
 *  an instrument readout and not a content box. */
function Corners() {
  const base = "pointer-events-none absolute h-3.5 w-3.5 border-accent-2/60";
  return (
    <>
      <span aria-hidden className={`${base} left-2.5 top-2.5 border-l border-t`} />
      <span aria-hidden className={`${base} right-2.5 top-2.5 border-r border-t`} />
      <span aria-hidden className={`${base} bottom-2.5 left-2.5 border-b border-l`} />
      <span aria-hidden className={`${base} bottom-2.5 right-2.5 border-b border-r`} />
    </>
  );
}

export function Panel({
  children,
  as: Tag = "div",
  tone = "solid",
  corners = false,
  lift = false,
  className = "",
  style,
}: PanelProps) {
  const classes = [
    TONE_CLASS[tone],
    corners ? "relative" : "",
    lift ? "lift" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} style={style}>
      {corners ? <Corners /> : null}
      {children}
    </Tag>
  );
}
