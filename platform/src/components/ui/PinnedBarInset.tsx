"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A BOTTOM-PINNED BAR HAS TO PAY FOR THE STRIP IT SITS ON.
 *
 * WHAT WENT WRONG. `components/pwa/InstallHint` renders
 * `fixed inset-x-0 bottom-0 z-40`, and nothing in the layout reserved a single
 * pixel for it — <body>'s bottom padding is `env(safe-area-inset-bottom)`, i.e.
 * the home indicator, which is a different strip for a different reason. So the
 * page simply ran underneath the bar. Measured on the deployed build, WebKit,
 * iPhone 16 with the real insets emulated, signed in, at rest on /dashboard:
 *
 *   portrait   the bar's card occupies y 723–818 of an 852px viewport and
 *              overlaps the „Теория" module card by 34,284 px² — 49 % of that
 *              card. `document.elementFromPoint` at the centre of the
 *              „Елементи на пътя" practice link returns the BAR, not the link:
 *              the control's own middle is not tappable.
 *   landscape  the bar is 52px of a 393px viewport and overlaps the
 *              „ПРОДЪЛЖИ УРОКА" hero card by 34,944 px² — 21 % of it.
 *
 * That is the founder's „the install banner covers the lesson card", and it is
 * the second time this shape of bug has been paid for here: the same brief that
 * excluded the practice and exam runners from the hint's allow-list did so
 * because a fixed bottom bar would sit on „Провери"/„Следващ". The exclusion
 * list treated the symptom on two routes; the bar still overlays every route it
 * IS allowed on.
 *
 * WHY A MEASURED VARIABLE AND NOT A CONSTANT. The bar has at least four
 * heights and three of them are decided at runtime: 141px portrait, 85px
 * landscape (`[@media(max-height:460px)]` drops the badge and the pitch),
 * taller again while „Как?" is expanded (`IosSteps` is a third list item), and
 * zero when the student dismisses it — which happens without a navigation. A
 * hard-coded number would be wrong in three of those four states, and the
 * fourth would leave a permanent empty strip at the bottom of every page for a
 * bar nobody is looking at any more.
 *
 * WHAT IT PUBLISHES. `--pinned-bar-h` on <html>: the border-box height of the
 * pinned child, or the property removed entirely when there is no child. The
 * two consumers both spend it through `max()` against the safe-area inset
 * rather than adding to it — see globals.css §BODY and DashboardShell's root
 * min-height. `max()` is what makes this non-circular AND correct: the bar
 * already pays `max(0.75rem, env(safe-area-inset-bottom))` at its own bottom,
 * so its height ALREADY contains the home-indicator strip. Adding the two would
 * reserve that strip twice and leave a 34px hole under every page.
 *
 * `display: contents` so this wrapper generates no box of its own: the child is
 * `position: fixed` and must keep resolving against the viewport, and on the
 * routes where the hint renders nothing this element must be as absent from
 * layout as it is from the screen.
 *
 * WHY BOTH OBSERVERS. ResizeObserver alone cannot see the bar ARRIVE or LEAVE —
 * it observes an element, and on a route the hint is not allowed on there is no
 * element. That is not a corner case: /dashboard → /theory is a client
 * navigation, the bar unmounts, and without the MutationObserver the reserved
 * strip would outlive it on every subsequent page of the session.
 */

/** The custom property this publishes. Exported so the tests read one spelling. */
export const PINNED_BAR_VAR = "--pinned-bar-h";

export function PinnedBarInset({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = document.documentElement;

    // Removed rather than set to "0px" when there is no bar: an absent custom
    // property falls through to the `var(…, 0px)` fallback the consumers
    // already carry, so the resting stylesheet is byte-identical to the one
    // that shipped before this file existed. A literal 0px would be a value
    // that has to be right, instead of a value that is not there.
    const publish = (height: number) => {
      if (height > 0.5) root.style.setProperty(PINNED_BAR_VAR, `${Math.ceil(height)}px`);
      else root.style.removeProperty(PINNED_BAR_VAR);
    };

    let resize: ResizeObserver | null = null;

    const attach = () => {
      resize?.disconnect();
      resize = null;
      const bar = el.firstElementChild as HTMLElement | null;
      if (!bar) {
        publish(0);
        return;
      }
      // getBoundingClientRect, not ResizeObserver's contentRect: the strip that
      // has to be reserved is the BORDER box (the bar's own padding is most of
      // its landscape height), and contentRect excludes it.
      resize = new ResizeObserver(() => publish(bar.getBoundingClientRect().height));
      resize.observe(bar);
      publish(bar.getBoundingClientRect().height);
    };

    const mounted = new MutationObserver(attach);
    mounted.observe(el, { childList: true });
    attach();

    return () => {
      mounted.disconnect();
      resize?.disconnect();
      publish(0);
    };
  }, []);

  return (
    <div ref={host} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
