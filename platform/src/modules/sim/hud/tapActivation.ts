"use client";

/**
 * tapActivation — the second way into every button in the simulator, because
 * the first one is dead exactly when a student is driving.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT (doc 91 · C2/D2/I2, measured, not inferred).
 *
 * With **no** finger on the glass, a tap on «Мигач надясно» fires
 * `pointerdown → pointerup → click` and the state flips. With **one** finger
 * already planted — on either thumb pad, or on the bare canvas, so it is not
 * pointer capture — the identical tap fires `pointerdown → pointerup` and **no
 * `click` at all**.
 *
 * That is not a bug in a browser. A `click` born of a touch is a
 * COMPATIBILITY MOUSE EVENT, and the Touch Events spec dispatches those only
 * for the **primary** touch point. A driving game is a two-finger interface by
 * construction, so `onClick` — the idiom every one of these buttons used — is
 * unreachable during the only activity the product exists for. Dead this way:
 * both indicators, **all three graded mirror glances**, «Пауза», the ⚙ that
 * opens the sheet holding seatbelt/lights/gear/camera/fullscreen/restart, every
 * cell inside that sheet, «РАЗБРАХ» on a teach card, and every row of the lesson
 * menu. The single survivor was the horn, which binds `onPointerDown`/`Up`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE IS. The horn's idiom, generalised once, so that four call
 * sites get it instead of four hand-rolled copies of it drifting apart.
 *
 * **`onClick` STAYS.** This is an addition, not a replacement. A pointer-only
 * button is a NEW accessibility bug: keyboard `Enter`/`Space`, a screen
 * reader's synthetic activation and `element.click()` all arrive as a `click`
 * and nothing else, and none of them produce a pointer event to hang off.
 * Mouse pointers are deliberately left entirely alone (`tapOwnsPointerType`) —
 * a mouse `click` was never broken, and the surest way not to break it is not
 * to touch it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FOUR WAYS THIS GOES WRONG IF WRITTEN CARELESSLY, each one a rule below.
 *
 * 1. DOUBLE FIRE. Our `pointerup` runs the action, then the compatibility
 *    `click` arrives and runs it again — an indicator toggles twice and ends
 *    where it started, which is indistinguishable from the button being dead.
 *    → every touch activation leaves a MARK; the next real (pointer-borne)
 *      click on that button consumes one mark and does nothing. Marks are a
 *      QUEUE, not a flag: on a saturated main thread — 29.6 React commits/s was
 *      measured on this screen — two taps can land before either compatibility
 *      click does, and a single flag would swallow one click and let the other
 *      through.
 *    → marks EXPIRE (`TAP_CLICK_SUPPRESS_MS`), because in the multi-touch case
 *      that started all this the compatibility click never comes at all, and a
 *      mark that waits forever would eat a legitimate click minutes later.
 *    → a click with `detail === 0` — keyboard, assistive technology,
 *      programmatic — is NEVER suppressed, whatever the marks say. Suppression
 *      may only ever cost a duplicate, never an only.
 *
 * 2. A PRESS THAT RELEASES SOMEWHERE ELSE. Touch pointers get IMPLICIT pointer
 *    capture, so `pointerup` is delivered to the element that saw
 *    `pointerdown` no matter where the finger actually lifted, and `pointerout`
 *    /`pointerleave` are suppressed while that capture holds. A naive
 *    "`pointerup` ⇒ fire" therefore fires on a thumb that slid off and lifted
 *    over the road — worse than `onClick`, which would not have.
 *    → the release point is hit-tested against the element's own rect.
 *    → and a ±3 px wobble still fires, with 19 px to spare: these are 44 px
 *      targets, so leaving one means travelling ~22 px from where the thumb
 *      landed. That is a decision, not a tremor. (±3 px is the tolerance the
 *      audit held the pads to; the buttons are held to the same one.)
 *
 * 3. A PRESS THAT WAS NEVER OURS. A drag that begins on the road and merely
 *    ENDS over a button must not press it — on a screen where a second finger
 *    is on the glass at all times, that is the difference between a control and
 *    a hazard.
 *    → `pointerup` fires only when it carries the `pointerId` of a
 *      `pointerdown` this element saw, and `pointercancel` disarms without
 *      firing (the browser taking the gesture for a scroll is not a tap).
 *
 * 4. A PRESS WHOSE END WE NEVER SEE. If an ancestor takes pointer capture
 *    mid-gesture, or the node is made inert under the finger, no `pointerup`
 *    and no `pointercancel` arrives and the arm is left standing.
 *    → `pointerdown` OVERWRITES the armed id; it never refuses because one is
 *      already held. This is the same shape as C1, where `drivePointer` kept a
 *      dead id and `if (drivePointer.current !== null) return;` then refused
 *      every future touch for the rest of the session. That failure mode is not
 *      getting a second home in this file.
 *
 * 5. A CLICK THAT LANDS ON A DIFFERENT CONTROL — 2026-11-05, lane «tapswallow»,
 *    sc-roundabout-entry:b63a8fea (rig-w3b phone-L1-ION, iPhone 16 landscape).
 *    The student strikes the island; the phone pauses on the teach card with
 *    «+2», and ONE `locator.tap` on «РАЗБРАХ» clears it — and in the same rAF
 *    the peek shows the OLDER hint at «+0». The graded −10 «Удар в неподвижно
 *    препятствие» never reached the phone glass. The ack runs in our
 *    `pointerup`, React commits that discrete update before the browser
 *    dispatches the touch's compatibility `click`, and the next card's ✕ sits
 *    where «РАЗБРАХ» was (frame 14: 17 CSS px apart, inside its 44 px). Rule
 *    1's mark belonged to «РАЗБРАХ»'s hook; the ✕ is a DIFFERENT hook with no
 *    mark, so the click activated it and removed a scored fault for good. (The
 *    re-target itself is PROBABLE until the owed device drive; the elimination
 *    and the composed replay are in the lane's PROGRESS.md.)
 *    → so the marks fold into ONE PAGE-WIDE LEDGER (`TapClickLedger`) that
 *      every `useTapActivation` hook obeys. Every mark is also one ledger
 *      entry, so no compatibility click is counted twice, and the ledger
 *      COUNTS (two taps before either click are two entries, never a flag).
 *      A pointer-borne click is decided by this ORDERED rule, first match wins
 *      (`tapClickActivates`):
 *        (1) `detail === 0` → ACT, and consume nothing. THIS is the clause that
 *            keeps keyboard, switch access and screen-reader activation from
 *            ever being eaten: it is answered before the ledger is read.
 *        (2) this hook holds its own unexpired mark → consume it and its
 *            matching ledger entry; SUPPRESS (rule 1, unchanged).
 *        (3) this hook holds the AUTHORIZING press → clear it; ACT. That is the
 *            page's most recent pointerdown, on this hook, that did NOT act on
 *            pointerup: any mouse press, or a touch/pen press released outside
 *            the rect. A touch/pen press that acted never authorizes — it left
 *            a mark instead. Cleared by its click, by pointercancel, by the
 *            next pointerdown on any hook, and TAP_CLICK_SUPPRESS_MS after its
 *            pointerup (a press still held does not expire, so a long mouse
 *            press keeps its click).
 *        (4) the ledger holds an unexpired entry → consume ONE, the oldest
 *            (with its owner's mark); SUPPRESS. The new clause: the
 *            compatibility click of a tap that already acted, wherever a
 *            re-render put it.
 *        (5) otherwise → ACT.
 *      «Suppression may only ever cost a duplicate, never an only» still holds:
 *      a click is refused only while a touch activation that ALREADY ACTED is
 *      owed its click (≤ TAP_CLICK_SUPPRESS_MS), and a click with a press of
 *      its own on this hook, or with nothing owed, always acts.
 *      THE ONE RESIDUAL, named: a detail-1 assistive click with no pointerdown
 *      that arrives while a touch tap is still owed its click (≤ 700 ms) is
 *      suppressed by (4) — and the owed click, when it then arrives, finds the
 *      ledger empty and acts on whatever it lands on. Keyboard / switch /
 *      programmatic activation (detail 0) is never in that residual.
 *      "The next pointerdown on any hook" stands in for "any pointerdown on the
 *      page" without loss: an owed entry is only ever made by a hook's own
 *      pointerdown + pointerup, and that pointerdown has already replaced any
 *      older authorizing press, so a press no hook saw can never stand between
 *      an owed entry and the click that (4) refuses.
 *    → the ledger is bound in ONE place, `useTapActivation` (the page
 *      singleton below). `createTapActivationState()` with no argument gets a
 *      FRESH PRIVATE ledger — the per-hook behaviour every older test was
 *      written against. `tap-page-ledger.test.ts` pins the call sites and the
 *      binding.
 *    → NOT REPAIRED HERE, recorded for the founder: a deliberate SECOND tap on
 *      the next card's ✕ is a real press and acts (layout and timing are out of
 *      this rule's reach), and a fault removed by a deliberate ✕ still has no
 *      way back.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ─────────────────────────────────────────────────────────────────────────────
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ THE TWO SWEEP-161 FINDINGS ROUTED AT THIS FILE ARE ABOUT WHERE THE TOUCH
 *   HINT IS DRAWN, AND THIS FILE DRAWS NOTHING. Checked 2026-08-19; recorded
 *   rather than silently declined.
 *
 * BOTH FRAMES, opened (`sc-fo-motorway-gap/mobile-wrong/04-t087s.png` and
 * `sc-hz-emergency-stop/mobile-right/05-stopped.png`, iPhone 16 landscape):
 * «Ляв палец — волан. Десен палец — нагоре газ, надолу спирачка. / Спряла кола:
 * пусни палеца и натисни пак надолу — минава на заден ход.» is printed straight
 * across the interior rear-view mirror, with «РАЗБРАХ» under it — in a lesson
 * family whose briefings repeatedly tell the student to check that mirror. The
 * reading is right and the routing is not. This module is pure pointer
 * arithmetic and four handlers; it has no JSX, no CSS, no coordinates of its
 * own, and cannot place anything anywhere. §2.6 O34's class again.
 *
 * THE THREE FILES THAT CAN ANSWER IT, and the state of each as read today:
 *
 *   WHEN it leaves — `components/sim/lesson-ui/touchHintLifetime.ts`. Already
 *     answered, and it answers the findings' actual claim („never dismisses",
 *     „permanently unavailable across the whole lesson"): `touchHintStandsDown`
 *     drops the card the first time the car passes 5 км/ч, and both frames show
 *     a MOVING car — 17 км/ч in `sc-fo-motorway-gap`. **On the shipped tree
 *     those two frames no longer reproduce**; they were photographed at the
 *     sweep baseline, before that exit landed. The residue that rule leaves is
 *     the 11 mobile runs in the sweep that never once read above the floor, for
 *     which `touchHintOutstayed` is written but, per that file's own ⚠, is not
 *     yet spent by `LessonScene`.
 *   WHICH CORNER — `hud/notifyColumn.ts`, in that file's words: „whether the
 *     top-right corridor lands on the rear-view mirror is that file's
 *     question." Answered there and now adopted: see the mirror-lane block.
 *   WHETHER «РАЗБРАХ» CAN BE PRESSED AT ALL — this file, and that half is the
 *     one this file really did own. It is the census entry above („the
 *     first-run touch hint's «Разбрах»"), and it is closed.
 *
 * So: not closed here, not closable here, and not open on the shipped tree for
 * the reason the first bullet gives. What is left of them belongs to the two
 * files named, and neither is this lane's.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `__tests__/tap-activation.test.ts` sweeps all three layers in the node
 * environment — no DOM, no browser, no emulator (same device as
 * `hudPreferences.ts`: a rule only a browser can check is a rule nobody
 * checks): the four predicates below as arithmetic; then `createTapHandlers`
 * driven through whole event SEQUENCES, because a predicate can be provably
 * right while the wiring into it is wrong and no assertion about the arithmetic
 * would move; then the four call sites, read as source text, because handlers
 * nobody bound are the bug this file exists to fix.
 */

import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// The pure half — no React, no DOM.
// ---------------------------------------------------------------------------

/**
 * How long a touch activation stays entitled to swallow one compatibility
 * click.
 *
 * The floor: with `touch-action: manipulation` the click is same-task and
 * arrives in single-digit milliseconds, but the rows of the lesson menu carry
 * no such declaration, so iOS's ~350 ms double-tap wait applies to them — and
 * every one of these numbers is measured on an idle main thread, which this
 * screen never has. The ceiling: it must be shorter than any plausible gap
 * between two deliberate presses of the same button, so that a mark left
 * behind by a click that never came cannot eat the next real one. 700 ms sits
 * between the two with room on both sides.
 */
export const TAP_CLICK_SUPPRESS_MS = 700;

export type TapPoint = { x: number; y: number };

/** The four numbers of a `DOMRect` that decide containment. */
export type TapRect = { left: number; top: number; right: number; bottom: number };

/** One compatibility click the page is still owed (rule 5 in the header). */
export type TapOwedClick = {
  /** Same clock as the marks; the entry is gone at this instant. */
  expiresAt: number;
  /** The hook whose activation is owed it — its mark is the same click. */
  owner: TapActivationState;
};

/** The page's most recent pointerdown, while it can still authorize a click. */
export type TapAuthorizingPress = {
  owner: TapActivationState;
  pointerId: number;
  /** null while the press is still held; set at its pointerup. */
  expiresAt: number | null;
};

/**
 * THE PAGE-WIDE LEDGER (rule 5). A COUNT of owed clicks, oldest first, and the
 * one press that may authorize a click on its own hook.
 */
export type TapClickLedger = {
  owed: TapOwedClick[];
  press: TapAuthorizingPress | null;
};

export function createTapClickLedger(): TapClickLedger {
  return { owed: [], press: null };
}

export type TapActivationState = {
  /** `pointerId` of the press this element owns, or null when idle. */
  pointerId: number | null;
  /** Expiry timestamps (ms, same clock as `now`) of activations still owed a
   *  compatibility click. Ascending, because `now` never goes backwards. Each
   *  one is also an entry in `ledger.owed`. */
  pendingClicks: number[];
  /** The ledger this hook obeys: the page's (`useTapActivation`) or, when none
   *  is passed, a private one of its own. */
  ledger: TapClickLedger;
};

/**
 * WHY THE LEDGER RIDES ON THE STATE (rather than a new argument on every
 * export): the low-level exports and `createTapHandlers` keep their exact
 * signatures, so no call site and no existing test changes, and the binding is
 * decided ONCE, where the state is made. Omitted → a fresh private ledger, i.e.
 * the per-hook behaviour that predates rule 5.
 */
export function createTapActivationState(
  ledger: TapClickLedger = createTapClickLedger(),
): TapActivationState {
  return { pointerId: null, pendingClicks: [], ledger };
}

/**
 * Do we take the pointer path for this device?
 *
 * Everything except a mouse. A mouse `click` fires under any number of other
 * fingers or buttons and always has; leaving it strictly alone is why this
 * change cannot regress the desktop. Pen is included — it is a direct-
 * manipulation device with the same compatibility-event rules as touch — and so
 * is the empty/unknown `pointerType` some webviews report, since taking it is
 * merely redundant (the mark de-duplicates the click that follows) whereas
 * skipping it would leave that webview with the dead button we are fixing.
 */
export function tapOwnsPointerType(pointerType: string): boolean {
  return pointerType !== "mouse";
}

/**
 * Is the release inside the control?
 *
 * Bounds are inclusive — a lift exactly on the edge of a 44 px target is a
 * press, not a miss. A rect with no area fails: an element collapsed between
 * press and release (a card animating out from under the thumb) is not
 * something the student can still be aiming at.
 */
export function tapPointWithin(point: TapPoint, rect: TapRect): boolean {
  if (rect.right <= rect.left || rect.bottom <= rect.top) return false;
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

function dropExpiredMarks(pendingClicks: number[], now: number): void {
  while (pendingClicks.length > 0 && pendingClicks[0] <= now) pendingClicks.shift();
}

/** The ledger's own expiry: owed entries on the marks' clock, and a RELEASED
 *  press TAP_CLICK_SUPPRESS_MS after its pointerup (a held press never). */
function dropExpiredLedger(ledger: TapClickLedger, now: number): void {
  while (ledger.owed.length > 0 && ledger.owed[0].expiresAt <= now) ledger.owed.shift();
  const press = ledger.press;
  if (press !== null && press.expiresAt !== null && press.expiresAt <= now) ledger.press = null;
}

/** Remove ONE occurrence of `value` — the same click, held in its other book. */
function removeOne<T>(list: T[], match: (item: T) => boolean): void {
  const i = list.findIndex(match);
  if (i >= 0) list.splice(i, 1);
}

/**
 * Arm the element for this press. Returns whether we took it.
 *
 * A mouse press is not taken AND does not disturb an armed touch: the two
 * paths are independent, and a mouse moving over a phone's touchscreen (a
 * hybrid laptop, a desk stand) must not be able to cancel a finger.
 */
export function tapPointerDown(
  state: TapActivationState,
  pointerId: number,
  pointerType: string,
): boolean {
  // Rule 5: EVERY press — mouse included — is now the page's most recent
  // pointerdown, so it replaces whatever press could authorize a click before
  // it. Overwrite, never refuse (rule 4). The per-hook arm below is untouched
  // by a mouse, exactly as before.
  state.ledger.press = { owner: state, pointerId, expiresAt: null };
  if (!tapOwnsPointerType(pointerType)) return false;
  // Overwrite, never refuse — see rule 4 in the header.
  state.pointerId = pointerId;
  return true;
}

/**
 * Release. Returns whether the control should act.
 *
 * Three gates, in this order: it must be the press we armed, the release must
 * land inside the control, and only then is a mark left for the compatibility
 * click that follows.
 */
export function tapPointerUp(
  state: TapActivationState,
  pointerId: number,
  point: TapPoint,
  rect: TapRect,
  now: number,
): boolean {
  // Rule 5: the release of the page's latest press starts that press's
  // clock, whichever hook hears it (a mouse lifts wherever the cursor is).
  const press = state.ledger.press;
  const releasesPress = press !== null && press.pointerId === pointerId && press.expiresAt === null;
  if (state.pointerId === null || state.pointerId !== pointerId) {
    if (releasesPress) press.expiresAt = now + TAP_CLICK_SUPPRESS_MS;
    return false;
  }
  state.pointerId = null;
  if (!tapPointWithin(point, rect)) {
    // A touch released outside acted on nothing: its click, if one comes,
    // is still its own and may act (rule 5, clause 3).
    if (releasesPress) press.expiresAt = now + TAP_CLICK_SUPPRESS_MS;
    return false;
  }
  // It acted, so it can never authorize a click: it is owed one instead.
  if (releasesPress) state.ledger.press = null;
  // Prune here as well as in `tapClickActivates`: in the multi-touch case the
  // click never arrives, so this is the only path that runs on a screen where
  // the student presses a button a hundred times in a session.
  dropExpiredMarks(state.pendingClicks, now);
  dropExpiredLedger(state.ledger, now);
  const expiresAt = now + TAP_CLICK_SUPPRESS_MS;
  state.pendingClicks.push(expiresAt);
  state.ledger.owed.push({ expiresAt, owner: state });
  return true;
}

/**
 * The browser took the gesture (a scroll started, the pointer was cancelled) —
 * disarm, fire nothing. Called with no id to reset unconditionally.
 */
export function tapPointerCancel(state: TapActivationState, pointerId?: number): void {
  // A cancelled press authorizes nothing (rule 5, clause 3) — on any device.
  const press = state.ledger.press;
  if (press !== null && press.owner === state && (pointerId === undefined || press.pointerId === pointerId)) {
    state.ledger.press = null;
  }
  if (pointerId !== undefined && state.pointerId !== pointerId) return;
  state.pointerId = null;
}

/**
 * Should this `click` run the action?
 *
 * `detail === 0` is the tell for an activation that had no pointer behind it —
 * keyboard `Enter`/`Space`, a screen reader, `element.click()`. Those are
 * answered before the marks are even looked at, so no amount of confusion in
 * the touch path can cost an assistive user their only way in.
 */
export function tapClickActivates(
  state: TapActivationState,
  detail: number,
  now: number,
): boolean {
  // (1) keyboard / assistive / programmatic: act, and consume NOTHING.
  if (detail === 0) return true;
  const ledger = state.ledger;
  dropExpiredMarks(state.pendingClicks, now);
  dropExpiredLedger(ledger, now);
  // (2) this hook's own mark: the click its own tap is owed.
  const own = state.pendingClicks.shift();
  if (own !== undefined) {
    removeOne(ledger.owed, (e) => e.owner === state && e.expiresAt === own);
    return false;
  }
  // (3) the press that authorizes this click: a press on THIS hook that did
  //     not act on its pointerup (a mouse, or a touch released outside).
  const press = ledger.press;
  if (press !== null && press.owner === state) {
    ledger.press = null;
    return true;
  }
  // (4) a click some OTHER hook's tap is owed, landing here after a re-render
  //     put this control under the finger. One entry, the oldest — and its
  //     owner's mark with it, so the same click is never counted twice.
  const owed = ledger.owed.shift();
  if (owed !== undefined) {
    removeOne(owed.owner.pendingClicks, (m) => m === owed.expiresAt);
    return false;
  }
  // (5) nothing owed, nothing pressed: act.
  return true;
}

// ---------------------------------------------------------------------------
// The React half — four props, one line at each call site.
// ---------------------------------------------------------------------------

/** One clock for the whole module, so the marks stay monotonic. */
function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/**
 * The five fields of a pointer event this module actually reads.
 * `React.PointerEvent` satisfies it structurally, so naming it costs the call
 * sites nothing — and it is what lets the COMPOSITION be tested rather than
 * only the arithmetic. The four predicates above can each be provably correct
 * while the wiring between them and a real event is wrong, and the two ways
 * that happens are `target` instead of `currentTarget` (hit-testing the release
 * against the 15 px glyph inside the button rather than the 44 px control) and
 * forgetting `event.detail` (which is the entire double-fire guard). Neither
 * would move a single assertion in the pure sweep.
 */
export type TapPointerLike = {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  currentTarget: { getBoundingClientRect: () => TapRect };
};

/** …and of a click. `detail` is the whole of it. */
export type TapClickLike = { detail: number };

export type TapActivationHandlers = {
  onPointerDown: (event: TapPointerLike) => void;
  onPointerUp: (event: TapPointerLike) => void;
  onPointerCancel: (event: TapPointerLike) => void;
  onClick: (event: TapClickLike) => void;
};

/**
 * The four handlers over one state object, with the clock injected.
 *
 * Separated from the hook for one reason: this repo's vitest environment is
 * `node` and there is no jsdom in it (component tests go through
 * `react-dom/server`, which binds no handlers at all). A hook cannot be driven
 * without a renderer; a factory can, so the full sequence — down, up, and the
 * compatibility click that follows — is exercised in the gate instead of only
 * on a phone.
 */
export function createTapHandlers(
  state: TapActivationState,
  onActivate: (() => void) | undefined,
  now: () => number,
): TapActivationHandlers {
  return {
    onPointerDown: (event) => {
      tapPointerDown(state, event.pointerId, event.pointerType);
    },
    onPointerUp: (event) => {
      // `currentTarget`, never `target`: every one of these buttons wraps its
      // glyph in a child element, and the child is what `target` reports.
      // Read at RELEASE, not at press, so a control that moved under the thumb
      // is judged where it actually is.
      const fired = tapPointerUp(
        state,
        event.pointerId,
        { x: event.clientX, y: event.clientY },
        event.currentTarget.getBoundingClientRect(),
        now(),
      );
      if (fired) onActivate?.();
    },
    onPointerCancel: (event) => {
      tapPointerCancel(state, event.pointerId);
    },
    onClick: (event) => {
      if (tapClickActivates(state, event.detail, now())) onActivate?.();
    },
  };
}

/**
 * THE PAGE'S LEDGER (rule 5). One per page, because a compatibility click is
 * one per touch whichever control a re-render put under it. Bound ONLY inside
 * `useTapActivation`; nothing else in production makes a ledger or a state
 * (`tap-page-ledger.test.ts`, the census pin). On the server no event ever
 * fires, so it stays empty there.
 */
const PAGE_TAP_LEDGER: TapClickLedger = createTapClickLedger();

/**
 * Spread onto any button that must work while a thumb is already on the glass:
 *
 *     const tap = useTapActivation(onClick);
 *     <button type="button" {...tap} …/>
 *
 * `onActivate` may be undefined (a cell rendered without an action) — the
 * handlers stay bound and simply do nothing, so the button never changes shape
 * between renders.
 */
export function useTapActivation(onActivate: (() => void) | undefined): TapActivationHandlers {
  // `useState` with a lazy initialiser, not a ref: one object per mounted
  // control, created once, read during render without tripping
  // `react-hooks/refs`. The setter is never called, so this costs no render.
  // Every hook obeys THE PAGE'S ledger (rule 5) — this line is the binding.
  const [state] = useState(() => createTapActivationState(PAGE_TAP_LEDGER));
  return useMemo(() => createTapHandlers(state, onActivate, nowMs), [state, onActivate]);
}
