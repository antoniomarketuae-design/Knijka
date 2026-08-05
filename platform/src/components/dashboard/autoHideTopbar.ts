"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer } from "react";

/**
 * THE TOP BAR STANDS DOWN WHILE A QUESTION IS UP — row C5, landscape half.
 *
 * THE ARITHMETIC. Portrait passes 18 of 18. Landscape passes 14, and all four
 * misses are under 48px — which is exactly `short:h-12`, the height of the
 * shared top bar (DashboardShell.tsx). The founder ruled on the fix himself:
 * auto-hide the bar while a question is on screen, bring it back on an upward
 * scroll or a tap near the top edge. He rejected shrinking it further, because
 * the hamburger inside it is the 44x44 control row C6 was closed on, and he
 * rejected relaxing „it all have to be on the screen without scrolling".
 *
 * FOUR PROPERTIES THIS FILE EXISTS TO GUARANTEE.
 *
 * 1. IT NEVER TOUCHES PORTRAIT. `AUTO_HIDE_MEDIA_QUERY` is the same 520px
 *    height cut `short:` uses (globals.css), and the shortest portrait viewport
 *    this product is tested on is 745px (iPhone 16 with Safari's toolbars up).
 *    A portrait phone cannot match this query, so the 18-of-18 that already
 *    passes cannot be regressed by anything in here. The width half keeps it
 *    off `lg`, where the sidebar — not this bar — is the navigation.
 *
 * 2. IT NEVER HIDES THE ONLY WAY OUT. Two conditions have to hold at once: the
 *    pathname has to be a question RUNNER (`isAutoHideRoute`) and a question
 *    has to be mounted RIGHT NOW (`QUESTION_SURFACE_SELECTOR`). The second is
 *    what makes „not during a mock exam's result state" true rather than
 *    hoped-for: ExamRunner swaps its <fieldset> for <ExamResultView> on submit
 *    and PracticeSession returns <SessionSummary> instead of its own, so the
 *    selector stops matching and the bar comes back on its own — on the two
 *    screens a student is most likely to want to leave from.
 *
 * 3. IT IS A TRANSFORM, NOT A REFLOW. The bar switches to `position: fixed`
 *    and slides on `translateY` in ONE commit, at the moment it arms — before
 *    anything downstream has measured the screen. Nothing animates the page's
 *    box: no height, no margin, no padding transition, so there is no
 *    per-frame layout for the C8 stability probe's „elements moved" to catch,
 *    and the bar is either fully on screen or fully off it — never half over
 *    the content, which is what „overlaps" would catch.
 *
 *    THE FRAME-0 PART IS NOT A DETAIL. `useQuestionBudget` clamps the question
 *    text against whatever height it finds within ~6 frames of mount, and it
 *    only ever SHRINKS inside one question. Reclaim the 48px a beat too late
 *    and every one of the four failing questions ends up clipped into a
 *    scroller for space that is, by then, free — the bar would be gone and the
 *    question STILL cut off. So the reclaim happens on the first client commit
 *    and the visible slide is what the student reads as „it left".
 *
 * 4. THE WAY BACK IS VISIBLE. Four of them, and none is a shrunken control:
 *    an upward scroll, a tap anywhere in the top `TOPBAR_REVEAL_BAND_PX`, focus
 *    entering the bar (keyboard and switch users never lose the nav), and the
 *    bar returning by itself the moment the question surface goes away. The
 *    edge affordance the founder asked for is a 3px lit hairline drawn by the
 *    shell — deliberately NOT a <button>: a 3px button would be a control under
 *    44px on a dashboard route, i.e. the exact row C6 finding he refused to pay
 *    for space, and a 44px invisible one would sit on top of the question.
 *
 *    AND THE TAP IS NOT ONE OPTION OF TWO — ON THESE SCREENS IT IS THE ONLY
 *    GESTURE THERE IS. The founder named „scroll up or a tap near the top
 *    edge", and measured on the rig at 852x393 (WebKit) the document scroll on
 *    the heaviest practice question is 0px, and 0px on the six heaviest exam
 *    items too: after this change nothing on those surfaces scrolls, which is
 *    the entire objective of row C5, so there is no upward scroll to make. The
 *    scroll path still works and was verified where scrolling still exists —
 *    the exam surface on the 780x360 Android floor, 19px of document scroll:
 *    down keeps the bar away, up brings it back to y=0. This is the whole
 *    argument for „a thin persistent edge affordance is better than an
 *    invisible hotspot": on a page that cannot scroll, an invisible hotspot
 *    would have been the ONLY way back, and unfindable.
 */

/**
 * The viewport where the 48px is worth taking. Height half: the same cut as the
 * `short:` variant in globals.css (`(max-height: 520px)`) — every phone in
 * landscape is under it, every phone in portrait is over it. Width half: below
 * `lg`, i.e. the viewports where this bar IS the navigation; from 1024px up the
 * sidebar is on screen and the bar is `lg:hidden` anyway.
 */
export const AUTO_HIDE_MEDIA_QUERY =
  "(max-height: 520px) and (max-width: 1023px)";

/**
 * The bar is only allowed to leave on a QUESTION RUNNER. A pathname test is the
 * cheap half of the gate and the one that can be reasoned about without a DOM:
 * /outcome carries two <fieldset>s of its own (the „как мина изпитът?" consent
 * form) and must keep its navigation, and so must /settings, /pricing and every
 * hub. Anchored and segment-exact so `/exams` (the hub) never matches while
 * `/exams/<attemptId>` (the runner) does.
 *
 * `/dev/fold-rig` is here on purpose: it mounts DashboardShell and the group
 * layout's own <main> verbatim, and it is the surface the fold sweep measures.
 * A rig that renders a bar the product hides would report the product's
 * geometry wrongly by exactly the 48px this change is about.
 */
const AUTO_HIDE_ROUTES: readonly RegExp[] = [
  /^\/theory\/practice(?:\/|$)/,
  /^\/exams\/[^/]+(?:\/|$)/,
  /^\/dev\/fold-rig(?:\/|$)/,
];

export function isAutoHideRoute(pathname: string): boolean {
  return AUTO_HIDE_ROUTES.some((re) => re.test(pathname));
}

/**
 * „A QUESTION IS ON SCREEN", as a thing that can be looked up rather than
 * assumed — and the reason this hook needs no wiring inside either runner.
 *
 * Both question surfaces render their stem and their options as a real
 * <fieldset> (PracticeSession's is `<fieldset><legend><span data-question-box>`,
 * ExamRunner's is `<fieldset><legend>{q.textBg}`), because that is what a group
 * of radio/checkbox controls with a shared prompt IS in HTML — it is the markup
 * that gives the option group its accessible name. Neither result surface has
 * one: ExamResultView is headings and a review list, SessionSummary is a score
 * card. So „a fieldset is mounted inside the content region" is not a proxy for
 * „a question is up" — on these routes it is the same statement.
 *
 * Scoped to `#main-content` so a fieldset inside the nav drawer or a portal
 * could never arm it. Tag-only, no `:has()`, so it resolves the same on every
 * engine the mobile harness runs (WebKit is the primary one).
 *
 * IF THIS EVER STOPS MATCHING the feature fails SAFE — the bar simply never
 * leaves — which is silent, and silent is how row C3 lost a whole phase to a
 * fold selector that matched nothing. `autoHideTopbar.test.ts` therefore
 * asserts the tag against the runners' real markup, and `warnIfHandleMissing`
 * says so out loud in development.
 */
export const QUESTION_SURFACE_SELECTOR = "#main-content fieldset";

/** How far the page must move before a scroll counts as a gesture, not jitter. */
export const SCROLL_GESTURE_PX = 8;

/**
 * „A tap near the top edge." 44px — the same number every touch target in this
 * app is held to, so the gesture is thumb-sized without a 44px control being
 * added on top of the question. Nothing here is a control: the band is a
 * passive pointer test on the document that neither swallows the event nor
 * preventDefaults it, so whatever the student tapped still receives its tap.
 */
export const TOPBAR_REVEAL_BAND_PX = 44;

/** How long the bar takes to slide out of, or back into, the screen. */
export const TOPBAR_SLIDE_MS = 300;

/* ------------------------------------------------------------------ machine */

export interface AutoHideState {
  /** The shell is in reclaiming mode: the bar is out of flow, page owns the 48px. */
  readonly armed: boolean;
  /** The bar is translated off the top edge. Only ever true while `armed`. */
  readonly hidden: boolean;
  /** The scroll position the last gesture was measured from. */
  readonly anchorY: number;
}

export type AutoHideEvent =
  /** A question surface came up in a viewport that needs the space. */
  | { readonly type: "arm"; readonly y: number }
  /** The question went away, the phone was rotated, or the route changed. */
  | { readonly type: "disarm" }
  /** The document scrolled. */
  | { readonly type: "scroll"; readonly y: number }
  /** An explicit way back: the edge band, focus entering the bar, a scroll up. */
  | { readonly type: "reveal" }
  /** The student went back to the question — a pointer landed outside the bar. */
  | { readonly type: "dismiss" };

export const INITIAL_AUTO_HIDE_STATE: AutoHideState = {
  armed: false,
  hidden: false,
  anchorY: 0,
};

/**
 * The whole behaviour, as a pure function — so „hidden when a question is up in
 * landscape / back on the gesture / never hidden in portrait" is provable in a
 * unit run instead of only in a screenshot.
 */
export function autoHideReducer(
  state: AutoHideState,
  event: AutoHideEvent,
): AutoHideState {
  switch (event.type) {
    case "arm":
      // Arming IS hiding: the space is reclaimed on the same commit that takes
      // the bar out of flow (see property 3 in the header comment).
      if (state.armed) return state;
      return { armed: true, hidden: true, anchorY: event.y };

    case "disarm":
      // The bar always comes back in flow when it stands down — a page that is
      // not a live question keeps its navigation where it has always been.
      if (!state.armed && !state.hidden) return state;
      return { armed: false, hidden: false, anchorY: state.anchorY };

    case "scroll": {
      if (!state.armed) return { ...state, anchorY: event.y };
      const delta = event.y - state.anchorY;
      // Below the threshold the anchor is LEFT ALONE, so a slow drag
      // accumulates into a gesture instead of being eaten a pixel at a time.
      if (Math.abs(delta) < SCROLL_GESTURE_PX) return state;
      return { ...state, hidden: delta > 0, anchorY: event.y };
    }

    case "reveal":
      if (!state.armed || !state.hidden) return state;
      return { ...state, hidden: false };

    case "dismiss":
      if (!state.armed || state.hidden) return state;
      return { ...state, hidden: true };

    default:
      return state;
  }
}

/**
 * Whether a pointer event should be read as „bring the bar back". Exported and
 * pure because the two ways to get this wrong are both silent: revealing on a
 * tap that was meant for a control (the layout would move 48px under a finger
 * that is mid-tap), and revealing on a tap that was nowhere near the edge.
 */
export function isEdgeRevealPointer(input: {
  readonly clientY: number;
  readonly onInteractiveTarget: boolean;
}): boolean {
  if (input.onInteractiveTarget) return false;
  return isInRevealBand(input.clientY);
}

/** The top `TOPBAR_REVEAL_BAND_PX` of the viewport, as a predicate. */
function isInRevealBand(clientY: number): boolean {
  return clientY >= 0 && clientY <= TOPBAR_REVEAL_BAND_PX;
}

/** What counts as „the student was aiming at something", for the test above. */
export const INTERACTIVE_TARGET_SELECTOR =
  "a, button, input, select, textarea, label, summary, [role='button'], [tabindex]";

/** The two halves of a tap, as the DOM delivers them. */
export type PointerPhase = "down" | "up";

/** Everything about a pointer event this decision depends on. */
export interface PointerFacts {
  readonly phase: PointerPhase;
  readonly clientY: number;
  /** The pointer landed on the bar itself — its own controls own the event. */
  readonly insideTopbar: boolean;
  /** The nav drawer is open and the pointer landed in it. */
  readonly insideDialog: boolean;
  /** The pointer landed on a link, a button, an option row… */
  readonly onInteractiveTarget: boolean;
}

/**
 * A WHOLE TAP, DECIDED IN ONE PLACE — and the reason this function exists
 * instead of two handlers each deciding half of it.
 *
 * THE DEFECT IT WAS EXTRACTED TO FIX WAS INVISIBLE TO EVERY UNIT TEST AND
 * PLAIN ON THE SCREEN. Reveal fired on pointer-DOWN and dismiss on pointer-UP,
 * each correct on its own and each covered — but a tap is a down AND an up
 * about 50 ms apart, so the edge tap revealed the bar and then hid it again
 * before the frame was painted. Photographed at 852x393 on WebKit: the „bar
 * back after the gesture" frame came out BYTE-IDENTICAL to the „bar gone" one,
 * `data-topbar-hidden` still `on`, the bar still at y=-48. The founder's
 * primary way back did not work at all, and 54 green tests said it did.
 *
 * So the phases are decided together, statelessly: a lift INSIDE the band is
 * the second half of the reveal tap, never a dismiss. Stateless rather than a
 * „this gesture already revealed" flag on purpose — engines that send both
 * `touch*` and `pointer*` for one tap deliver two downs and two ups, and a
 * one-shot flag would be cleared by the first up and let the second one
 * dismiss. Every decision here is idempotent under duplicate events.
 *
 * Returns the event to dispatch, or null for „this pointer means nothing to
 * the bar". Nothing is consumed either way: the tap that brings the bar back
 * also does whatever else it was going to do.
 */
export function autoHideEventForPointer(f: PointerFacts): AutoHideEvent | null {
  // The bar's own controls, and the drawer that opens over everything.
  if (f.insideTopbar || f.insideDialog) return null;

  if (f.phase === "down") {
    return isEdgeRevealPointer({
      clientY: f.clientY,
      onInteractiveTarget: f.onInteractiveTarget,
    })
      ? { type: "reveal" }
      : null;
  }

  // A lift in the band is the tail of the reveal tap. Anywhere else, the
  // student has gone back to the question and the bar stands down again.
  //
  // DISMISS IS ON THE LIFT, NOT THE PRESS: by the time a pointer is raised the
  // browser has already hit-tested the click, so re-hiding cannot steal the tap
  // that is in flight.
  return isInRevealBand(f.clientY) ? null : { type: "dismiss" };
}

/* --------------------------------------------------------------------- hook */

export interface AutoHideTopbar {
  /** The bar is out of flow and the page has the 48px. */
  readonly armed: boolean;
  /** The bar is translated off the top edge right now. */
  readonly hidden: boolean;
  /** Bring it back — focus entering the bar calls this. */
  readonly reveal: () => void;
}

/**
 * Development-only tripwire for the row-C3 failure mode: the route says this is
 * a question runner, the viewport says the space is needed, and the handle
 * matches nothing — so the feature is silently off. The unit test is the real
 * guard; this is the one that fires while someone is looking at the screen.
 */
function warnIfHandleMissing(pathname: string): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.warn(
    `[topbar] ${QUESTION_SURFACE_SELECTOR} matched nothing on ${pathname}. ` +
      `The top bar auto-hide is OFF on a route that expects it — the runner's ` +
      `<fieldset> was probably renamed. See autoHideTopbar.ts.`,
  );
}

/**
 * A pointer, however the engine chose to describe it. Playwright's WebKit
 * `touchscreen.tap()` delivered `touchstart` and NO `pointerdown`, so the first
 * cut of the edge gesture did nothing on the only engine this product is
 * measured on — it passed every unit test and failed on the screen. Both
 * families are listened for; the action is idempotent, so a browser that sends
 * both costs one extra no-op dispatch.
 */
const DOWN_EVENTS = ["pointerdown", "touchstart"] as const;
/** `touchend` carries the lifted finger in `changedTouches`, not `touches`. */
const UP_EVENTS = ["pointerup", "touchend"] as const;

function pointerPoint(
  e: Event,
): { clientY: number; target: Element | null } | null {
  const target = e.target instanceof Element ? e.target : null;
  if (typeof TouchEvent !== "undefined" && e instanceof TouchEvent) {
    const touch = e.changedTouches[0] ?? e.touches[0];
    return touch ? { clientY: touch.clientY, target } : null;
  }
  if (e instanceof MouseEvent) return { clientY: e.clientY, target };
  return null;
}

/**
 * `useLayoutEffect` on the client, `useEffect` on the server — React warns
 * about the former during SSR and this component renders on both.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useAutoHideTopbar(pathname: string): AutoHideTopbar {
  const [state, dispatch] = useReducer(autoHideReducer, INITIAL_AUTO_HIDE_STATE);

  /**
   * ONE LAYOUT EFFECT, ONE COMMIT — AND THAT IS THE WHOLE DIFFERENCE BETWEEN A
   * WHOLE QUESTION AND A CLIPPED ONE.
   *
   * The first cut of this split the decision across three passive effects
   * (viewport → question → arm), which is three commits AFTER paint. Rendered
   * at 852x393 on WebKit it looked right and measured wrong: the bar was gone,
   * the page did not scroll — and the question stem was clipped by 22px behind
   * the „there is more" fade, on a screen with 72px of empty deck under the
   * answers. `useQuestionBudget` had already run (child passive effects run
   * before a parent's), measured the 5px the un-reclaimed layout overflowed by,
   * clamped the stem, and it only ever shrinks within a question — so the 48px
   * arrived too late to be spent on the words it was taken for.
   *
   * A layout effect runs in the commit phase, before paint and before every
   * passive effect in the tree, and React flushes the state update it schedules
   * synchronously. So the bar is out of flow and the page is 393px tall the
   * first time anything downstream measures the screen.
   */
  useIsomorphicLayoutEffect(() => {
    if (!isAutoHideRoute(pathname)) {
      dispatch({ type: "disarm" });
      return;
    }
    const mq = window.matchMedia(AUTO_HIDE_MEDIA_QUERY);
    let warned = false;
    // The question half. A MutationObserver rather than a one-shot: the exam
    // runner swaps its <fieldset> for the result view IN PLACE and the practice
    // runner does the same for its summary, so „the question went away" is a
    // DOM change with no route change and no prop to hang off.
    const evaluate = () => {
      const found = document.querySelector(QUESTION_SURFACE_SELECTOR) !== null;
      if (!found && mq.matches && !warned) {
        warned = true;
        warnIfHandleMissing(pathname);
      }
      // Both dispatches are no-ops when nothing changed (the reducer returns
      // the same object), so React bails out and this observer costs a
      // querySelector per mutation batch and nothing else.
      dispatch(
        mq.matches && found
          ? { type: "arm", y: window.scrollY }
          : { type: "disarm" },
      );
    };
    evaluate();
    const observer = new MutationObserver(evaluate);
    observer.observe(document.body, { childList: true, subtree: true });
    mq.addEventListener("change", evaluate);
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", evaluate);
    };
  }, [pathname]);

  // The ways back, and the one way out.
  useEffect(() => {
    if (!state.armed) return;

    const onScroll = () => dispatch({ type: "scroll", y: window.scrollY });

    // THE ADAPTER, AND NOTHING ELSE. Every decision is in
    // `autoHideEventForPointer` so that a whole tap — down then up — can be
    // replayed in a unit run. All this does is read the DOM facts out of the
    // event and hand them over; the listeners are passive and capture-phase, so
    // nothing here consumes or defers a tap the student meant for the page.
    const onPointer = (phase: PointerPhase) => (e: Event) => {
      const point = pointerPoint(e);
      if (!point) return;
      const event = autoHideEventForPointer({
        phase,
        clientY: point.clientY,
        insideTopbar: point.target?.closest("[data-app-topbar]") != null,
        insideDialog: point.target?.closest("[role='dialog']") != null,
        onInteractiveTarget:
          point.target?.closest(INTERACTIVE_TARGET_SELECTOR) != null,
      });
      if (event) dispatch(event);
    };

    const onDown = onPointer("down");
    const onUp = onPointer("up");

    window.addEventListener("scroll", onScroll, { passive: true });
    for (const type of DOWN_EVENTS) {
      document.addEventListener(type, onDown, { capture: true, passive: true });
    }
    for (const type of UP_EVENTS) {
      document.addEventListener(type, onUp, { capture: true, passive: true });
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      for (const type of DOWN_EVENTS) {
        document.removeEventListener(type, onDown, true);
      }
      for (const type of UP_EVENTS) {
        document.removeEventListener(type, onUp, true);
      }
    };
  }, [state.armed]);

  const reveal = useCallback(() => dispatch({ type: "reveal" }), []);

  return { armed: state.armed, hidden: state.hidden, reveal };
}
