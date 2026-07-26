import type { ReactNode } from "react";

/**
 * Static chrome for the (auth) route group. Server components only — nothing
 * here holds state, so the four auth screens ship no JS for their layout.
 *
 * The heading shape (dim mono eyebrow → bright display title → muted lead) is
 * the cluster's readout ratio applied to a page header: contrast lives in the
 * one line that matters. See components/ui/Readout for the same idea at
 * instrument scale.
 */

export function AuthHeading({
  eyebrow,
  title,
  lead,
}: {
  /** Dim mono caption above the title — the surface's "channel name". */
  eyebrow: string;
  title: string;
  lead?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <p className="hud-label">{eyebrow}</p>
      <h1 className="mt-1.5 font-display text-2xl font-black tracking-tight">
        {title}
      </h1>
      {lead ? (
        <p className="mt-2 text-sm leading-relaxed text-muted">{lead}</p>
      ) : null}
    </header>
  );
}

/**
 * The quiet line under the form ("no account? register"). Separated from the
 * form by a fading hairline rather than a full-width rule — a 1px line at
 * constant opacity across a panel is the single most template-looking element
 * on any page (doc 83 §6).
 */
export function AuthFooterNote({ children }: { children: ReactNode }) {
  return (
    <>
      <div aria-hidden role="presentation" className="rule mt-6" />
      <p className="mt-4 text-center text-sm text-muted">{children}</p>
    </>
  );
}
