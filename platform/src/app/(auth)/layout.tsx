import type { CSSProperties } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";

/** Position in the shared entrance choreography (globals.css §1). */
const step = (i: number) => ({ ["--enter-i" as string]: i }) as CSSProperties;

/**
 * Shell for /login, /register, /forgot, /reset.
 *
 * WHY data-surface="cluster" IS ON THE <main>. These four screens are public
 * — a visitor reaches them straight off the landing page — so they belong to
 * the marketing identity, not to the app's OS-follows-you theme. Without the
 * scope, a light-mode laptop turns the cockpit into a pale form the moment the
 * "Регистрация" button is clicked, which is exactly the seam this task exists
 * to remove. The scope re-binds the same token NAMES, so every utility below
 * (bg-background, text-muted, .btn-accent) renders in cluster colours with no
 * other change, and nothing behind the login moves. See globals.css §CLUSTER.
 *
 * The atmosphere is three static layers and no JS: an instrument grid that
 * dissolves rather than stopping at an edge, the haze that gives a dark page a
 * horizon (without one, "dark theme" collapses to grey-on-black), and film
 * grain to kill gradient banding. Nothing here repaints on scroll.
 *
 * The card itself is OPAQUE, not glass, and that is a deliberate refusal:
 * glass over a haze costs contrast, and doc 83's measured ratios are for
 * --surface. A login form is a tool. Atmosphere goes around it, never through
 * the text a locked-out student is trying to read.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main
      data-surface="cluster"
      className="grain relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 text-foreground"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 hud-grid-fade" />
      <div aria-hidden className="pointer-events-none absolute inset-0 haze" />

      <div className="relative w-full max-w-md">
        {/* --enter-i places each block in the shared 70ms choreography; the
            animation only exists inside prefers-reduced-motion: no-preference,
            so the resting state here is already the final one. */}
        <Link
          href="/"
          style={step(0)}
          className="enter mb-7 flex items-center justify-center gap-2 rounded-lg font-display text-lg font-extrabold tracking-tight"
        >
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-black text-accent-foreground shadow-glow-sm"
          >
            К
          </span>
          <span>
            Книжка<span className="text-accent">.AI</span>
          </span>
        </Link>

        {/* `corners` = the four L-shaped HUD marks: the cheapest signal that
            this rectangle is an instrument readout and not a content box. */}
        <Panel
          corners
          style={step(1)}
          className="enter p-6 shadow-depth-2 sm:p-7"
        >
          {children}
        </Panel>

        <nav
          aria-label="Правна информация"
          style={step(2)}
          className="enter mt-6 flex justify-center gap-5"
        >
          <Link
            href="/terms"
            className="text-xs font-semibold text-muted transition hover:text-foreground motion-reduce:transition-none"
          >
            Условия за ползване
          </Link>
          <Link
            href="/privacy"
            className="text-xs font-semibold text-muted transition hover:text-foreground motion-reduce:transition-none"
          >
            Поверителност
          </Link>
        </nav>
      </div>
    </main>
  );
}
