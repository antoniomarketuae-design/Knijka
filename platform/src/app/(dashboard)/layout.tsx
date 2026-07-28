import type { CSSProperties } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

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
      className="flex flex-1 flex-col bg-background"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-accent-foreground"
      >
        Към съдържанието
      </a>
      {/* THE DECK FLOOR. A dark theme without a horizon is not a space, it is a
          black rectangle — doc 83 §6 calls `.haze` the load-bearing primitive
          for exactly this and then never applied it behind the login, which is
          a large part of why the authenticated app read as „dark" rather than
          as a cockpit. One element, three STATIC gradients, `fixed` so scrolling
          never repaints it, and `-z-10` so it is behind every panel. It cannot
          cost a frame: nothing here animates and nothing here blurs. */}
      <div aria-hidden className="haze pointer-events-none fixed inset-0 -z-10" />
      <DashboardShell>
        <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </DashboardShell>
    </div>
  );
}
