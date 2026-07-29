import type { CSSProperties } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DeckBackdrop } from "@/components/deck/DeckBackdrop";

/**
 * `color` has to be restated on the scope element for the same reason the
 * marketing shell restates it: `body { color: var(--foreground) }` was already
 * computed against :root by the time this element redefines the variable, and
 * an inherited colour does not re-resolve. The :root rule in globals.css makes
 * this redundant in every browser that supports `:has()`; it stays because the
 * fallback for the ones that don't must be a correctly-inked app, not a black
 * page with dark-navy text on it.
 */
const SCOPE_TEXT = { color: "var(--foreground)" } as CSSProperties;

/**
 * Shared chrome for every authenticated screen in the (dashboard) group:
 * sidebar/topbar navigation + skip link. Pages render inside <main>.
 *
 * WHY THE CLUSTER SCOPE IS ON THIS LAYOUT. Landing and auth were pinned to the
 * instrument-cluster identity (doc 83); everything behind the login was
 * deliberately left following `prefers-color-scheme`, so on a light-mode OS the
 * „Вход" button dropped a student out of a black cockpit and onto a pale SaaS
 * dashboard mid-gesture. Founder review, verbatim: „If we take this Design, we
 * must from dark landing futuristic 3d page go into same futuristic dashboard".
 *
 * This one attribute is the whole change. The scope re-binds the same semantic
 * token NAMES (globals.css §CLUSTER), so the 538 `card` / 407 `text-muted` /
 * 171 `border-border` call sites behind the login, the theory reader, the exam
 * runner and the sim HUD all render in cluster colours without a single markup
 * edit — and the light theme stays intact for anything outside the group.
 *
 * It is also the accessibility fix it looks like a taste change: the app's
 * light theme paints `--success` at 3.39 : 1 on `--surface` (3.02 : 1 on the
 * practice reader's own success tile — that is „Верен отговор", the most
 * load-bearing label in the theory module), where the cluster palette scores
 * 11.31 and 9.57. Numbers in clusterScope.test.ts, computed from globals.css.
 *
 * The wrapper is a flex column rather than a bare <div>: <body> is
 * `min-h-full flex flex-col`, so an inert wrapper here would collapse the
 * shell's `min-h-dvh` child out of the column it was sized against.
 *
 * WHY IT IS ALSO `isolate`, WHICH IS NOT HYGIENE — IT IS A BUG FIX.
 * The backdrop below is `fixed … -z-10`. A negative-z child paints in step 3 of
 * its stacking context; a non-positioned block's own background paints in step
 * 4. This wrapper carries `bg-background` and formed NO stacking context, so
 * the nearest one was the root — which put the wrapper's opaque fill ON TOP of
 * the layer that was supposed to sit behind everything. `.haze` shipped in
 * exactly this position and was never once visible on an authenticated page:
 * captured at 1440×900 and 390×844, the plane is flat #05070c edge to edge, so
 * the depth primitive doc 83 §6 calls load-bearing was doing nothing at all
 * here. That is a large part of why the founder's verdict on the whole app was
 * „we made it dark but nothing much changes".
 *
 * `isolation: isolate` makes this element the stacking context, so its own
 * background paints FIRST and the backdrop lands above it and below every
 * panel — the order the markup always implied. Nothing inside needs to escape
 * it: the only portalled surface (Celebration) mounts on document.body, which
 * is outside this element entirely.
 */
export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-surface="cluster"
      style={SCOPE_TEXT}
      className="isolate flex flex-1 flex-col bg-background"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-accent-foreground"
      >
        Към съдържанието
      </a>
      {/* THE DECK. A dark theme without a horizon is not a space, it is a black
          rectangle — doc 83 §6 calls `.haze` the load-bearing primitive for
          exactly this. It was mounted here, in this position, and (see the
          `isolate` note above) it never painted a single visible pixel on an
          authenticated page.

          And even had it painted, three gradients are not enough. Founder
          review, verbatim: „here in the background of this page, I want
          futuristic 3d background like we did in the landing page, currently
          this dark background is purely old and not futuristic". A glow is not
          a SPACE: there is no horizon in it, no distance, and nothing that
          could only be this product.

          So this plane now holds the landing page's own road at dusk, under
          Vitosha, from the driver's seat — the same geometry, out of the same
          module (@/lib/visual/roadPlate), so logging in moves the student from
          behind the car to inside it instead of into a different product.
          components/deck/DeckBackdrop has the composition and the cost; the
          short version is that it is still a `fixed` element that never
          repaints on scroll, and every colour in it is at or under the
          brightest pixel `.haze` was already painting — which is why not one of
          the contrast ratios clusterScope.test.ts pins can move. */}
      <DeckBackdrop className="fixed inset-0 -z-10" />
      <DashboardShell>
        <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </DashboardShell>
    </div>
  );
}
