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
      className="grain relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 text-foreground short:py-2"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 hud-grid-fade" />
      <div aria-hidden className="pointer-events-none absolute inset-0 haze" />

      {/* `short:` — THE VARIANT THIS SHELL NEVER GOT (globals.css §short).
          Measured in WebKit at 852x393, the iPhone 16 held sideways: the panel
          ran 689px, #password ended at 399 and the submit button at 415-459, so
          elementFromPoint at its centre returned null — a student saw the e-mail
          field and neither of the two controls they need next. The utilities
          below buy back 135px of chrome above the button and nothing else
          changes: at any normal height every one of them is inert.

          THAT WAS MEASURED AT REST, AND /login IS NOT ALWAYS AT REST. Re-measured
          on the same rig with the status banner up — /login?reset=1, ?changed=1
          and ?revoked=1, the three URLs a student reaches while ALREADY having
          password trouble — plus one wrong password, the submit button was back
          at 404-448 and elementFromPoint returned null again. The banner and a
          FormError are 124px the first pass never counted. So the brand lockup
          now stands down too (`short:sr-only`, like the lead in auth-ui): 40px
          of the 393 spent on a logo above a login form is the cheapest 40px in
          the group, and sr-only keeps the link home in the accessibility tree
          and in the tab order. After it: banner + wrong password ends at 369,
          24px clear of the fold; at rest the button ends at 257 and the whole
          page is 396px, down from 689. */}
      <div className="relative w-full max-w-md">
        {/* --enter-i places each block in the shared 70ms choreography; the
            animation only exists inside prefers-reduced-motion: no-preference,
            so the resting state here is already the final one. */}
        <Link
          href="/"
          style={step(0)}
          className="enter mb-7 flex items-center justify-center gap-2 rounded-lg font-display text-lg font-extrabold tracking-tight short:sr-only short:focus:not-sr-only"
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
          className="enter p-6 shadow-depth-2 short:p-4 sm:p-7"
        >
          {children}
        </Panel>

        <nav
          aria-label="Правна информация"
          style={step(2)}
          className="enter mt-6 flex justify-center gap-5 short:mt-3"
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
