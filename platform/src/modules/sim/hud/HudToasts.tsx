"use client";

/**
 * Violation / commendation toasts — right side, newest on top.
 * Severity-colored with the official class name and a law-ref chip; the rule
 * engine authors every string (ADR-002 — no free-form AI text in the loop).
 *
 * Violation and lesson toasts carry the catalog's authored explanation + law
 * citation (QW7 — the WHY must be visible at the moment of the mistake), so
 * they live longer than the short commendation praise.
 *
 * `useHudToastQueue` owns ids + expiry; the component is presentational.
 *
 * ---------------------------------------------------------------------------
 * DOC 86 · L14 — THE DESKTOP REWORK
 *
 * The mobile wave routed compact layouts through `overlayQueue.ts` and left
 * this file — the ROOMY path, the one the founder reviewed on — exactly as it
 * was: the column `pointer-events-none`, every card `w-72` (288 px), up to
 * FOUR stacked, expiring only on a TTL. His verdict: „they need to be able to
 * be removed when clicked with the mouse … currently they are much much
 * annoying, important but annoying, we need a complete rework of those
 * notifications."
 *
 * What changed, all four of his asks:
 *  · CLICK REMOVES IT. The card is a real `<button>` — `pointer-events-auto`,
 *    a hit area the size of the whole card, `aria-label` „Скрий известието",
 *    and a ✕ affordance so it LOOKS dismissible before it is clicked.
 *  · TWO, NOT FOUR — `TOAST_MAX_VISIBLE`; one in quiet mode.
 *  · NARROWER — 288 px → 240 px (`TOAST_CARD_WIDTH_CLASS`).
 *  · A SETTING — „По-тихи известия" (persisted; the shell owns the control),
 *    which drops PRAISE only. A violation or a teach card keeps its authored
 *    explanation and its law chip in every mode, because that explanation is
 *    THEO-4's requirement zero and the only reason the toast exists.
 *
 * NO KEYBOARD BINDING HERE, ON PURPOSE. Space is the parking-brake toggle
 * (`engine/input.ts:223`) and a toast fires with the car moving; the Space
 * acknowledgement the founder asked for belongs to the end-of-lesson popup,
 * where the drive is over. See the note at the top of `hudPreferences.ts`.
 * ---------------------------------------------------------------------------
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { HudEvent } from "../contracts";
import { minusPointsBg } from "../rules";
import {
  TOAST_CARD_WIDTH_CLASS,
  TOAST_MAX_VISIBLE,
  visibleToasts,
} from "./hudPreferences";
// THE SHADE, TAKEN AND NOT RESTATED — same module, same lane. `SimOverlay`
// owns the derivation of α 0.80 and of the feather, and its own test derives
// its assertions from these exports; a second copy of either number here is
// how the roomy card and the phone's peek would drift apart again. See the
// block above `ToastGround`.
import {
  PEEK_SCRIM_FEATHER_PX,
  peekScrimBackgroundCss,
  peekScrimMaskCss,
} from "./SimOverlay";

export interface HudToast {
  id: number;
  event: HudEvent;
  /**
   * WHEN THIS CARD WAS RAISED — `Date.now()` at `push`, see `stampToasts`.
   *
   * OPTIONAL, AND ABSENT MEANS „NO CLAIM". `app/dev/popup-rig` builds
   * `HudToast` literals by hand and a required field would only teach it to
   * invent a moment; an unstamped card prints no age at all, which is the
   * founder's standing ruling in `FaultCard`'s header — an honest blank beats a
   * guess — and is the one direction that cannot put a false anchor on a
   * verdict. Everything the student actually drives goes through
   * `useHudToastQueue`, which always stamps.
   */
  raisedAtMs?: number;
}

/** Short-lived praise ("Браво") — no body text to read. */
const TOAST_TTL_MS = 4000;
/** Violation/lesson toasts render 1–3 sentences of explanation — give the
 * student time to read them (~15 chars/s reading speed at driving load). */
const TEACHING_TOAST_TTL_MS = 8000;
/**
 * The queue holds a little more than the column shows: quiet mode filters
 * praise out at render time, and dropping a card from the store as well would
 * make „по-тихи известия" retroactively delete history the debrief still
 * counts. `visibleToasts` is the one place the cap is applied.
 */
const MAX_QUEUED = TOAST_MAX_VISIBLE + 2;

function ttlFor(event: HudEvent): number {
  return event.kind === "violation" || event.kind === "lesson"
    ? TEACHING_TOAST_TTL_MS
    : TOAST_TTL_MS;
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE CARD SAYS WHAT, AND FOR EIGHT SECONDS IT DID NOT SAY WHEN.

   MEASURED, deployed build, Chromium 1440 × 900 —
   `.audit-frames/sweep161/sc-junction-stop/pc-wrong/04-t099s.png`. This
   component's own violation card, fully painted, nothing clipped:

     ВТОРОСТЕПЕННА                                     −1 изпитна т.  ✕
     Превишена скорост
     Движеше се над разрешената скорост. Ограничението е таван, не цел …
     ЗДвП чл. 21, ал. 1

   …and the cluster 40 px below it reads **33 км/ч**, under a posted 40 chip and
   a ≤60 mode cap. The catalogue's sentence is honest — «Движеше се» is a past
   tense — but the CARD carries no moment, so from that frame a student cannot
   tell a record of something eight seconds ago from an accusation about the 33
   he is doing now. The auditor could not either, and wrote so: „Either the toast
   outlives its cause with no timestamp shown, or the conviction is wrong; from
   the frame a student cannot tell which."

   BOTH READINGS ARE THE CRIME THIS PROJECT EXISTS TO STOP. If it is live, the
   engine has failed a student who is inside the limit — the founder's own
   roundabout complaint, a FALSE FAILURE. If it is a record, the card taught him
   that 33 under 40 is speeding. The card cannot choose between them, so it must
   stop being ambiguous.

     `sc-sp-curve/mobile-wrong/04-t030s.png` is the same shape with the gap
     opened wider: «Превишена скорост» beside a cluster reading 18 under a
     posted 90, the offence six seconds and a whole open field earlier.

   AND THE DEBRIEF ALREADY DOES IT. `FaultCard` — the same fault, the same
   wording, three minutes later — ends every row with «в 1:39» (`atBg`). So one
   surface of this product anchors the fault in time and the other did not: the
   glass said one thing and the debrief another about one event, which is this
   lane's whole subject.

   WHY RELATIVE AND NOT THE SESSION CLOCK. This column has no session clock and
   may not invent one — `HudEvent` (contracts.ts) carries no `t`, and a
   plausible-looking «в 1:39» composed here would be a fabricated figure on a
   verdict. What the column DOES own is the moment it raised the card, and that
   moment is measured on exactly the clock that will remove it again: the TTL
   above is a `window.setTimeout`, i.e. wall time, and it keeps running while a
   teach moment freezes the drive. So the age and the card's own lifetime are
   read off one clock and cannot disagree — a card that says «преди 8 с» is a
   card about to expire, and that is true by construction rather than by tuning.

   THE SLOT IS ALWAYS PAINTED, «сега» first. An age that appears a second or two
   in would move every card below it on a column the founder has already been
   moved by („elements moving when popups appear"), and a card whose anchor is
   sometimes missing teaches the student to stop looking for it.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Below this the card is not a record of anything, it is the present, and
 * «преди 2 с» would be a worse answer than «сега». 2 000 and not 1 500 so that
 * the first figure ever printed is 2 — `Math.round` at a 1 500 boundary skips
 * «преди 1 с» entirely, and a scale whose first step is missing reads as a bug.
 */
export const TOAST_AGE_NOW_MAX_MS = 2000;

/** How often the printed age is refreshed while a teaching card is up, ms. */
export const TOAST_AGE_TICK_MS = 1000;

/**
 * „сега" / „преди 8 с" — the card's own moment, in the card's own words.
 *
 * A clock that has gone backwards (`nowMs < raisedAtMs` — a system-time change
 * mid-drive) yields «сега» rather than a negative or a future age: the anchor
 * may be uninformative, never wrong.
 */
export function toastAgeBg(raisedAtMs: number, nowMs: number): string {
  const ms = nowMs - raisedAtMs;
  if (!Number.isFinite(ms) || ms < TOAST_AGE_NOW_MAX_MS) return "сега";
  return `преди ${Math.round(ms / 1000)} с`;
}

/**
 * Which kinds carry an age. The two TEACHING kinds — a graded violation and a
 * «Научи» card — because those are the ones that state a verdict about a moment
 * that has passed. „Браво" is a 4 s pat on the back with no explanation and no
 * moment to be wrong about, and dating it would only spend a line.
 */
export function toastCarriesAge(kind: HudEvent["kind"]): boolean {
  return kind === "violation" || kind === "lesson";
}

/**
 * The ONE place a `HudToast` is built, so the stamp cannot be forgotten on some
 * future second path. Pure, and therefore assertable without a DOM —
 * `__tests__/hud-toast-moment.test.tsx` runs it rather than trusting `push`.
 */
export function stampToasts(
  events: ReadonlyArray<HudEvent>,
  firstId: number,
  raisedAtMs: number,
): HudToast[] {
  return events.map((event, i) => ({ id: firstId + i, event, raisedAtMs }));
}

export function useHudToastQueue(): {
  toasts: HudToast[];
  /** `ttlMs` overrides the kind-derived TTL — short control hints (e.g. the
   *  driveline-rejection feedback) live 3–4 s, not the 8 s teaching TTL. */
  push: (events: ReadonlyArray<HudEvent>, ttlMs?: number) => void;
  /** L14: the student clicked a card away before its TTL ran out. */
  dismiss: (id: number) => void;
  clear: () => void;
} {
  const [toasts, setToasts] = useState<HudToast[]>([]);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const push = useCallback((events: ReadonlyArray<HudEvent>, ttlMs?: number) => {
    if (events.length === 0) return;
    // The stamp is taken ONCE for the batch: a tick that raises two faults
    // raised them in the same frame, and two ages a millisecond apart on one
    // screen would be a distinction the engine cannot actually make.
    const added = stampToasts(events, nextId.current, Date.now());
    nextId.current += events.length;
    setToasts((prev) => [...added.reverse(), ...prev].slice(0, MAX_QUEUED));
    for (const toast of added) {
      const timer = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, ttlMs ?? ttlFor(toast.event));
      timers.current.push(timer);
    }
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clear = useCallback(() => setToasts([]), []);

  return { toasts, push, dismiss, clear };
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

const SEVERITY_META = {
  opasna: { label: "Опасна грешка", color: "var(--danger)" },
  osnovna: { label: "Основна грешка", color: "var(--warning)" },
  vtorostepenna: { label: "Второстепенна", color: "var(--accent-soft)" },
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   THE ROOMY CARD NEVER GOT THE GROUND THE PHONE'S DID — 2026-08-27, wave 6.

   TWO DEFECTS, ONE SENTENCE OF ARITHMETIC, and they compound rather than sit
   side by side.

   1 · NO GROUND. `SimOverlay`'s 2026-08-19 block („THE CARD HAD NO GROUND, AND
       ON A BRIGHT WORLD THAT IS 1.3 : 1") measured the world this HUD's cards
       stand on across four filed frames and found the brightest pixel to be
       rgb(204, 205, 206) — render-white facade. It then gave the PHONE's peek a
       shade at α 0.80 and proved the number from both sides. THIS card is the
       same card on the roomy leg, it is on the same `GHOST_SURFACES` list (so
       `PlayAreaStyles`' UNPANEL sweep strips its fill to `transparent
       !important`), and it was left standing on bare world. Against that pixel:

                                    bare world   under the 0.80 ground
         --foreground  the title       1.47 : 1        11.87 : 1
         --muted       the WHY         1.01 : 1         8.18 : 1   ← THE ROW
         --danger      ОПАСНА ГРЕШКА   1.77 : 1         4.57 : 1     THAT IS
         --warning     Основна грешка  1.01 : 1         8.01 : 1     THE POINT
         --accent-2    📚 Научи         1.05 : 1         7.73 : 1

       1.01 : 1 is not „low contrast". The authored explanation — the half of
       this card THEO-4 requirement zero exists for, the reason the toast is not
       a bare verdict — and the facade behind it are the same colour to a
       hundredth. `sc-roundabout-entry/pc-right/04-t090s.png` and
       `sc-ov-solid-return/mobile-right/04-t041s.png` are the same reading with
       and without the shade, twelve hours apart on the same build.

   2 · AND THE CARD DIMMED ITSELF ON TOP OF IT. `opacity-90` rode on the
       INTERACTIVE arm of the class list — i.e. on every card in production,
       because the shell passes `onDismiss={dismiss}` (`LessonPlayShell.tsx`,
       the `<HudToasts …>` mount). It is a tenth off the whole subtree: the
       class word, the «−10 изпитни т.», the fault name, the explanation, the
       law chip and the two-stop black text-shadow the UNPANEL register uses to
       buy contrast without a box — so the thing that restores legibility is
       dimmed in lockstep with the ink it is restoring. `hover:opacity-100` was
       the remedy, on a card the student reads with both hands on the wheel.

       `SimOverlay` has already ruled on this exact class, on this exact token:
       „AND IT IS AT FULL OPACITY, 2026-08-19. It carried `opacity-90` … on a
       ГРУБА violation that is `--danger`, so 0.9 of it over the shade below
       reads 3.97 : 1 — under AA". `sim-overlay-scrim.test.ts` wrote that up as
       a rule with a name — „no element on this card knocks its own ink back
       under the floor" — and this card was knocking ALL of its ink back, over
       no shade at all.

   THE TWO ARE ONE REPAIR AND NOT TWO, which is why they land together: with
   the ground added and `opacity-90` left in place, `--danger` reads 3.95 : 1 —
   still under AA. The dimming has to go for the ground to deliver anything.

   THE SHADE IS THE PEEK'S, IMPORTED RATHER THAN RESTATED. `PEEK_SCRIM_*` and
   its two CSS builders are exported from `SimOverlay.tsx` — the same lane, the
   same module — and they carry the whole derivation with them: α 0.80 is the
   alpha at which the quietest ink clears AA against the brightest world the
   sweep photographed, capped by the founder's other rule that the world under
   it must stay „dimmed, and still plainly two different things" (1.37 : 1), so
   a hazard is never hidden. A second copy of 0.80 here is how the two would
   drift, and `sim-overlay-scrim.test.ts` derives its assertions from those
   exports, so this card inherits that guard instead of needing its own.

   AND IT IS STILL NOT A PANEL — the 2026-08-03 ruling that took the box off
   this column („a full-width rounded strip ending in a SOLID BRAND-BLUE
   «Разбрах» button. THAT IS A COOKIE BANNER") is about a SHAPE: a border, a
   radius, an edge. The shade has none of the three, every side ramps to alpha
   0 outside the card's own box, and it claims not one pixel the card was not
   already standing on. The left rule in the fault's colour still paints ABOVE
   it, so the severity glance is unchanged.

   WHAT REPLACES THE DIMMING AS THE „THIS IS CLICKABLE" CUE: the ✕ that is
   already in the header row brightens on hover (`group` here,
   `group-hover:text-foreground` on `DismissGlyph`). The affordance moves onto
   the one glyph whose whole job is to say „press me" and off the verdict.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The column's own gap, as a number — `gap-2` on the `<div>` at the bottom of
 * this file, restated here because the shade has to know it and Tailwind class
 * strings are not readable at runtime. `hud-toast-ground.test.ts` asserts the
 * class is still what this says it is, so the two cannot drift silently.
 */
const TOAST_COLUMN_GAP_PX = 8;

/**
 * The shade's bleed, and the ONE number that is not the peek's.
 *
 * THE PEEK IS A COLUMN OF ONE; THIS IS A COLUMN OF TWO. `TOAST_MAX_VISIBLE`
 * stacks cards 8 px apart, and the peek's 16 px bottom feather would put the
 * older card's ramp 8 px INSIDE the newer one's flat 0.80 core — two shades on
 * one pixel, i.e. 1 − (1 − 0.8)(1 − 0.4) ≈ 0.88 in an 8 px band across the top
 * of every card below the first. That is past the 0.80 the block above spends
 * two paragraphs deriving, and past it in the one direction the founder's
 * „still plainly two different things" rule bounds. So the bottom bleed is
 * clamped to the gap: the ramp still lives entirely OUTSIDE the card's own box
 * (feather === bleed, which is what keeps the flat core coincident with the box
 * — see `peekScrimMaskCss`), and it now stops before it reaches anything else's.
 *
 * `Math.min` and not a literal 8: if a later wave narrows the peek's feather
 * below the gap, this follows it down rather than quietly becoming the larger
 * of the two. The other three sides are the peek's, untouched — left faces the
 * road and is the long ramp, right and top face the stage's own edge.
 */
const TOAST_SCRIM_FEATHER_PX = {
  ...PEEK_SCRIM_FEATHER_PX,
  bottom: Math.min(PEEK_SCRIM_FEATHER_PX.bottom, TOAST_COLUMN_GAP_PX),
} as const;

/**
 * The card's ground: the peek's shade, on the card that never got one.
 *
 * `aria-hidden` + `pointer-events: none` — it is a shade. It must not be
 * announced and it must not eat the click that dismisses the card, which on
 * this surface IS the whole `<button>`.
 *
 * `data-hud-ink` IS WHAT LETS IT PAINT AT ALL, and is not tidiness: the UNPANEL
 * sweep is `[data-sim-stage] .hud-ghost :is(div, …):not([data-hud-ink])` with
 * `background-image: none !important`, and this element is a `<div>` inside a
 * `.hud-ghost`. Without the attribute this whole component would be a diff that
 * changes no pixel — the way the tier picker's filled segment survived a whole
 * unpanel pass. `unpanelInkExemption.test.ts` holds the stylesheet end of the
 * same contract for the peek's shade and the touch hint's.
 */
function ToastGround() {
  return (
    <div
      data-hud="toast-scrim"
      data-hud-ink=""
      aria-hidden
      style={{
        position: "absolute",
        top: `${-TOAST_SCRIM_FEATHER_PX.top}px`,
        right: `${-TOAST_SCRIM_FEATHER_PX.right}px`,
        // NO overhang term, unlike the peek's. That card is `max-height`-capped
        // by its column and paints rows past its own border box, so its shade
        // has to be measured. This column caps nothing — `LessonPlayShell`
        // scrolls it instead — so the card's box IS what the card paints, and a
        // measured inset here would be arithmetic with no question behind it.
        bottom: `${-TOAST_SCRIM_FEATHER_PX.bottom}px`,
        left: `${-TOAST_SCRIM_FEATHER_PX.left}px`,
        zIndex: -1,
        pointerEvents: "none",
        backgroundImage: peekScrimBackgroundCss(TOAST_SCRIM_FEATHER_PX),
        // Both spellings: `mask-image` is unprefixed in current WebKit and
        // prefixed in the versions still on phones in this market.
        WebkitMaskImage: peekScrimMaskCss(TOAST_SCRIM_FEATHER_PX),
        maskImage: peekScrimMaskCss(TOAST_SCRIM_FEATHER_PX),
      }}
    />
  );
}

/**
 * The dismissible shell every card shares.
 *
 * A `<button>` and not a `<div onClick>`: the whole card is the hit area, it is
 * reachable by keyboard and by screen reader, and the accessible name says what
 * clicking does. `text-left` because a button centres its content by default
 * and this one holds a paragraph.
 */
function ToastShell({
  color,
  onDismiss,
  onWhy,
  cardRef,
  children,
}: {
  color: string;
  onDismiss: (() => void) | null;
  /** Present only on a card that prints a «Защо» chip — a press that lands on
   *  the chip runs this instead of the card's own activation. See „…AND ON PC
   *  THE SUMMARY BECAME THE LAST WORD" for why it is a region and not a
   *  nested `<button>`. */
  onWhy?: () => void;
  /** The card's root element, for the fit measurement `ViolationToast` makes —
   *  see „THE CARD PRINTED A PARAGRAPH IT HAD NO ROOM AND NO TIME FOR". */
  cardRef?: (el: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const interactive = onDismiss !== null;
  const hasWhy = onWhy !== undefined;
  // ONE composition, exported and asserted (`toastCardPressAction`), so the
  // gate runs the branch the card runs instead of a transcription of it —
  // `SimOverlay`'s ✕ shipped green twice on exactly that difference.
  const press = (e: MouseEvent<HTMLElement>) => {
    const action = toastCardPressAction(e.target, { interactive, hasWhy });
    if (action === "why") onWhy?.();
    else if (action === "dismiss") onDismiss?.();
  };
  // THE KEYBOARD DRIVES THE CAR, so a press of «Защо» may not leave focus on a
  // card whose own activation is DISMISS: Chromium focuses a `<button>` on
  // mousedown, and the next Enter would then delete the paragraph the student
  // just asked for. Cancelling the mousedown keeps focus where it was; the
  // `click` that toggles still fires. Presses anywhere else are untouched.
  const holdFocus = (e: MouseEvent<HTMLElement>) => {
    if (hasWhy && pressLandedOnToastWhy(e.target)) e.preventDefault();
  };
  // `hud-ghost` — the founder's words about this exact column were „those pop
  // ups … are much much annoying, important but annoying". The information is
  // not the annoyance; the opaque blurred card that parks itself on his road is.
  // In the reference the equivalent lane — sector times, position deltas — is a
  // stack of coloured numbers straight on the image. So the card goes and the
  // authored explanation and its law chip stay exactly as they are (THEO-4):
  // the toast still says WHY, it just no longer paints a box to say it in.
  // A left rule in the fault's own colour replaces the border-on-a-fill so the
  // severity is still readable at a glance.
  //
  // ── `relative isolate`, AND NEITHER IS A BOX. 2026-08-27, wave 6. They are
  //    what the shade below needs and nothing else: `relative` makes this card
  //    the containing block for it, `isolate` makes it the shade's STACKING
  //    CONTEXT so a `z-index: -1` child cannot climb past this card and sink
  //    behind the WebGL backdrop. `SimOverlay`'s own block on the peek's shade
  //    has the WebKit screenshot where that exact escape produced a fix which
  //    changed no pixel while every unit assertion stayed green. Still no
  //    border, no radius, no blur, no `backdrop-filter` on this element.
  //
  // ── AND `opacity-90` IS GONE FROM THE INTERACTIVE ARM. See the block above
  //    `ToastGround` for the arithmetic; the short version is that it was a
  //    tenth off the WHOLE card — the class word, the points, the fault name
  //    and the authored explanation — applied for no reason except that the
  //    card happens to be clickable, with `hover:opacity-100` as the remedy on
  //    a surface the student reads while driving and never hovers.
  const className =
    `hud-ghost hud-toast-in ${TOAST_CARD_WIDTH_CLASS} relative isolate border-l-2 py-1 pl-2.5 pr-1 text-left ` +
    (interactive ? "group pointer-events-auto cursor-pointer" : "pointer-events-none");
  const style = { borderColor: color };

  if (!interactive) {
    // The inert column (no `onDismiss`) still owes a «Защо» chip its press:
    // the chip is `pointer-events-auto`, and its click bubbles to here.
    return (
      <div
        ref={cardRef}
        onClick={hasWhy ? press : undefined}
        onMouseDown={hasWhy ? holdFocus : undefined}
        className={className}
        style={style}
      >
        <ToastGround />
        {children}
      </div>
    );
  }
  return (
    <button
      ref={cardRef}
      type="button"
      onClick={press}
      onMouseDown={hasWhy ? holdFocus : undefined}
      aria-label="Скрий известието"
      title="Щракни, за да го скриеш"
      className={className}
      style={style}
    >
      <ToastGround />
      {children}
    </button>
  );
}

/**
 * The card's last row: the law chip and the moment, on one line.
 *
 * HERE AND NOT IN THE HEADER, measured rather than preferred. The header row
 * already carries «ОПАСНА ГРЕШКА» (≈86 px at these classes), «−10 изпитни т.»
 * (≈92) and the ✕ inside a 224 px content box; «преди 8 с» is another ≈47 and
 * the row overflows by about 25 px, which on this card means the severity word
 * gets an ellipsis. Trading a legible class for a legible age is not a trade —
 * the class is also carried by the left rule's colour and by the mark's colour,
 * so it survives being small, while the moment exists nowhere else on the glass.
 *
 * `flex-wrap` and not `truncate`: a citation is THEO-4's evidence and may not be
 * shortened to make room for the thing standing next to it. A long ЗДвП ref
 * takes a second line, which costs 10 px on the card at the TOP of a column
 * whose newest card is the top one — so what moves is the older cards below it,
 * never the one being read.
 *
 * The age renders whether or not there is a `lawRef`: an anchor that only
 * appears on cited faults would be missing from exactly the rows that have the
 * least other evidence.
 */
function ToastFooter({
  lawRef,
  ageBg,
  trailing = null,
}: {
  lawRef: string | undefined;
  ageBg: string | null;
  /** The «Защо» chip on a summarised violation card, right-aligned after the
   *  moment. Last on the row, so under `flex-wrap` it is the one that takes a
   *  second line — never the citation. */
  trailing?: ReactNode;
}) {
  if (lawRef === undefined && ageBg === null && trailing === null) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {lawRef !== undefined ? (
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted">
          {lawRef}
        </span>
      ) : null}
      {ageBg !== null ? (
        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-muted">{ageBg}</span>
      ) : null}
      {trailing}
    </div>
  );
}

/**
 * The ✕ hint in the card's header row — it must LOOK dismissible.
 *
 * AND IT IS NOW WHERE THE HOVER FEEDBACK LIVES. 2026-08-27: the card used to
 * say „clickable" by sitting at `opacity-90` and going to 100 on hover, i.e. by
 * dimming the verdict, the points and the authored explanation by a tenth for
 * the whole of every drive to buy a mouse-over cue nobody driving ever
 * collects. The cue moves onto this glyph, whose only job is to say „press me":
 * `group` is on the card (`ToastShell`), so the ink change is the same
 * interaction with none of the cost. `text-muted → text-foreground` is a
 * brighten, so the glyph never gets quieter than it is now, and `motion-reduce`
 * drops the transition rather than the change.
 */
function DismissGlyph({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      aria-hidden
      className="ml-1 shrink-0 text-[11px] font-black leading-none text-muted transition group-hover:text-foreground motion-reduce:transition-none"
    >
      ✕
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE CARD PRINTED A PARAGRAPH IT HAD NO ROOM AND NO TIME FOR —
   sc-roundabout-entry:fe081cf1, re-judged STILL on w47.

   THE FRAME, opened before anything here was written:
   `.audit-frames/w47/frames/sc-roundabout-entry__pc-right/04-t058s.png`
   (1440 × 900, swept on 7648edf; this file, the shell's column and the
   catalogue row are byte-identical from there to 4209dad). −10 ОПАСНА ГРЕШКА
   «Влизане без пропускане», and the body is `FAILED_TO_YIELD_SITUATION_COPY`'s
   ring paragraph: 674 characters. The column's reading window holds about ten
   body lines of it, and the glass ends at «…или Б2» — character 322 — faded
   under «↓ обяснението продължава — покажи». The same leg at `04-t107s` cuts
   the 305-character «Удар в пешеходец» paragraph at «…а не след това». The
   judge's ruling on the control is the one this block accepts: a renamed
   teaser over a severed explanation is chrome, not a repair.

   TWO BUDGETS, AND THE PARAGRAPH BROKE BOTH.
     · SPACE. The window is the shell's (`notifyColumnCapPx`, less the banner,
       the recall pill and whatever the briefing still holds), and nothing in
       this file can make it taller.
     · TIME. `TEACHING_TOAST_TTL_MS` at the top of this file is 8 000 ms, sized
       for „1–3 sentences … ~15 chars/s at driving load" — 120 characters. The
       card removes itself after about a sixth of the ring paragraph however it
       is laid out, so paging the column with «покажи» was never a route to its
       end.

   THE CATALOGUE HAS ALREADY AUTHORED WHAT FITS BOTH, AND THE JUDGE CREDITED IT.
   `peekBg` is REQUIRED on every row (`rules/catalog.ts`, since 2026-09-11) and
   rides this very event (`lessons/engine.ts` → `HudEvent.peekBg`). The phone
   card prints it in preference to the paragraph
   (`overlayQueue.overlayPeekBodyBg`), and the w47 judge read that card whole
   and ruled the structure „not to be undone". For the ring act it is «Колата в
   кръга има предимство и идва отляво.» — WHO has the right and WHERE to look,
   44 characters. ADR-002: retrieved from the catalogue, not written here.
   THEO-4: it is a reason, not a verdict, and the law chip stays beside it.

   BUT ONLY WHERE THE PARAGRAPH IS ACTUALLY CUT — which is why this is a
   measurement and not `overlayPeekBodyBg` copied across. Measured against the
   catalogue, the median pooled paragraph is 206 characters and fits this
   window whole, and `lessons/engine.ts` writes figures into some of them that
   the summary does not carry («Отчетена скорост 58 км/ч при разрешени 50
   км/ч», «Дистанция в момента: 0,8 с»). Swapping every card would spend that
   evidence on ~50 codes to repair the ten or so pooled rows (plus the per-act
   copies) whose paragraphs overflow a window this size. So the card keeps the
   paragraph whenever it can be seen whole, and prints the summary only when it
   cannot. The gap readout is a SUFFIX, i.e. the part the column already cut
   first on any card long enough to fall back, so nothing legible is lost
   there; SPEEDING_OVER_LIMIT/_DANGEROUS carry their readout as a PREFIX on a
   paragraph under 130 characters that fits. SPEED_TOO_FAST_FOR_CURVE is the
   exception and is named rather than hidden: 266 characters plus its ~65
   character prefix can fall back in a window this tight and take a readout
   that WAS on its first line with it.

   HOW IT IS MEASURED, and the four choices that are not arbitrary:
     · ONCE, AT ARRIVAL, BEFORE PAINT (`useLayoutEffect`), THEN LATCHED. A body
       that changes while it is being read is the founder's „elements moving"
       complaint; the student sees exactly one body for the life of the card
       unless HE asks for the other (the «Защо» chip, below), and the age tick
       re-rendering it every second cannot re-open the question.
     · `offsetHeight`, NOT `getBoundingClientRect`. `hud-toast-in`
       (`HudStyles.tsx`) enters from `scale(0.96)` and this effect runs on the
       animation's first frame, so a transformed rect under-reads a tall card by
       4 % — a cut card measured as one that fits.
     · AGAINST `[data-hud-toast-scroller]`'s `clientHeight` — the shell's box,
       named by its attribute exactly as the shell names `[data-hud="toasts"]`
       in this file. No such ancestor (`app/dev/popup-rig`, a server render, a
       test) or an unlaid box (0 px) is NO CLAIM, and no claim keeps the
       paragraph: the one direction that is exactly the card as it shipped.
     · …AND THE PARAGRAPH TAKES NO HEIGHT UNTIL THE CHOICE IS MADE — see
       „THE SHELL SAW THE PARAGRAPH FOR ONE FRAME" below for the frame that
       made this necessary and the arithmetic that makes it exact.

   WHAT IT COSTS, stated rather than found later:
     · On a card that falls back, the paragraph is one press away rather than
       on the glass — the «Защо» chip, see „…AND ON PC THE SUMMARY BECAME THE
       LAST WORD". It is also whole in the debrief (`FaultCard` prints
       `event.explanationBg`). A measured readout riding that paragraph (the
       curve case above) goes behind the chip with it; carrying a readout as
       its own field is a `contracts.ts` + `lessons/engine.ts` change, not this
       file's.
     · Arrival-only means a window that SHRINKS afterwards — the fold row
       mounting under a second card, a banner growing — can still cut a card
       that fitted when it arrived. That residue is a line or two, not half a
       paragraph, and it is the shell's fold control's to announce.
     · The roomy leg still has no car-stopping route to the whole text, and the
       chip does not add one: it expands the card inside the same eight-second
       TTL. The shell records that as an open decision about what this column
       IS (`LessonPlayShell.tsx`, the block above `revealMoreToasts`); this
       does not make it.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
   THE SHELL SAW THE PARAGRAPH FOR ONE FRAME — the verifier's third item on the
   repair above, 5 of 5 trials.

   WHAT HAPPENED, in React's own order. The arrival commit painted nothing
   wrong: the layout effect chose the summary and its state update is
   processed before the browser paints. But React flushes the PREVIOUS
   commit's passive effects before it starts that synchronous re-render, and
   the shell's arrival effect (`LessonPlayShell.tsx`, the `newestToastId`
   effect → `measureToastFold`) is one of them. So the shell measured the card
   while it still held the 674-character paragraph, counted it cut, and
   scheduled «↓ обяснението продължава — покажи». Its `ResizeObserver` then
   read the summary card and took the row away again — one painted frame
   later. Recorded per animation frame in the verifier's rig:
   `summary|fold summary|- summary|- …`, on every trial of both long rows.

   A LAYOUT EFFECT CANNOT WIN THAT RACE, and a lasting DOM write behind
   React's back (swapping the text in the effect) would, at the cost of a node
   React believes it owns. So the card does the declarative thing instead:
   until the choice is made it renders nothing the shell can measure. The body
   `<p>` is in the tree at its true width — but at `height: 0; overflow:
   hidden`, so the card the shell's passive effect reads is the card WITHOUT
   its body. That undercounts, and undercounting is the safe direction for a
   fold row: the worst it can do is appear one frame late when a real fold
   exists, never announce a cut that does not.

   THE FIT TEST IS THE SAME TWO READS IT WAS VERIFIED ON — card `offsetHeight`
   against scroller `clientHeight`, with the paragraph in flow. The effect lets
   the body back into flow for exactly those two reads and collapses it again
   before it returns (`measureToastBodyChoice` has why that is not optional:
   the scroller's height FOLLOWS its content, so a collapsed card cannot be
   measured against it).

   `"pending"` IS NEVER PAINTED — it is resolved inside the same layout effect
   the choice always lived in. It is printed on `data-hud-toast-body` anyway,
   so a frame-by-frame probe can prove that rather than assume it. A server
   render (no `document`) starts at `"paragraph"`, because there is nothing to
   measure there and no claim keeps the paragraph whole; no toast is ever
   server-rendered in the product (`useHudToastQueue` starts empty, and the
   popup rig's literal cards carry no `peekBg`), so the two starting states
   cannot meet in a hydration.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The shell's toast scroller — the box whose height is this card's window. */
export const TOAST_SCROLLER_SELECTOR = "[data-hud-toast-scroller]";

/**
 * Rounding slack for the fit test, px. `offsetHeight` and `clientHeight` are
 * both integer-rounded layout reads, so a card that exactly fills its window
 * can read one pixel over. Anything past that is a cut, and is called one.
 */
export const TOAST_FIT_SLACK_PX = 1;

/**
 * Can a card of this height be seen whole in a window of this height?
 *
 * Unmeasurable input — a non-finite read, or a zero from a box that has not
 * been laid out (a server render, a test DOM) — answers TRUE. That is not
 * optimism: `true` keeps the paragraph, i.e. the card exactly as it shipped,
 * so an instrument that cannot read never changes what the student is shown.
 */
export function toastCardFitsWindow(cardHeightPx: number, windowHeightPx: number): boolean {
  if (!Number.isFinite(cardHeightPx) || !Number.isFinite(windowHeightPx)) return true;
  if (cardHeightPx <= 0 || windowHeightPx <= 0) return true;
  return cardHeightPx <= windowHeightPx + TOAST_FIT_SLACK_PX;
}

/**
 * The violation card's body: the authored paragraph while it fits (or once the
 * student has opened it with «Защо»), the catalogue's summary otherwise. A
 * missing or blank summary keeps the paragraph — a cut sentence is a defect, a
 * blank body is a bare verdict, and only the first is allowed to survive this
 * function.
 */
export function violationToastBodyBg(
  event: { explanationBg: string; peekBg?: string },
  showParagraph: boolean,
): string {
  if (showParagraph) return event.explanationBg;
  const peek = event.peekBg;
  return typeof peek === "string" && peek.trim().length > 0 ? peek : event.explanationBg;
}

/**
 * Where the card's body stands. `"pending"` exists for exactly one commit and
 * is never painted — see „THE SHELL SAW THE PARAGRAPH FOR ONE FRAME".
 */
export type ToastBodyChoice = "pending" | "paragraph" | "summary";

/**
 * The body a card starts from. Only a card that HAS a summary to fall back to
 * and a DOM to measure in waits for the measurement; every other card is the
 * paragraph from its first render, exactly as it shipped.
 */
export function initialToastBodyChoice(
  canSummarise: boolean,
  canMeasure: boolean,
): ToastBodyChoice {
  return canSummarise && canMeasure ? "pending" : "paragraph";
}

/**
 * The pending body: in the tree at its true width, contributing no height and
 * painting no line. `overflow: hidden` is what keeps a zero-height paragraph
 * from spilling its lines over the footer — and whatever the pending card's
 * margins then do, it can only be SHORTER than the card that follows it, which
 * is the direction the shell's fold count may safely be wrong in.
 */
const TOAST_BODY_PENDING_STYLE = { height: 0, overflow: "hidden" } as const;

/**
 * The measurement itself, on a card whose body is still pending. No card, no
 * body or no scroller is no claim: paragraph.
 *
 * THE BODY IS LET BACK INTO FLOW FOR THE TWO READS AND COLLAPSED AGAIN BEFORE
 * THIS RETURNS — and that is the only way to ask the question at all, found by
 * getting it wrong first. The scroller is not a fixed box: it is a flex item
 * that grows with its content up to the column's cap, so its `clientHeight`
 * against a COLLAPSED card is the collapsed card's height, and the first draft
 * of this function (body-less card + `body.scrollHeight` against that) called
 * the 127-character SPEEDING_OVER_LIMIT paragraph „cut" in the verifier's
 * Chromium rig, 5 of 5, on a card that fits with room to spare. With the body
 * in flow the two reads are the same two reads the repair was verified on:
 * the card's `offsetHeight` against the window the column actually gives it.
 *
 * The writes are to the inline style React set for `"pending"` and are put
 * back to the exact strings read, synchronously, with no paint and no
 * `ResizeObserver` delivery in between — so the DOM React committed is the DOM
 * the shell's passive effect then reads. `offsetHeight`/`clientHeight` here
 * force the layout; nothing is left changed by it.
 */
function measureToastBodyChoice(
  card: HTMLElement | null,
  body: HTMLElement | null,
): "paragraph" | "summary" {
  if (card === null || body === null) return "paragraph";
  const scroller = card.closest(TOAST_SCROLLER_SELECTOR);
  if (!(scroller instanceof HTMLElement)) return "paragraph";
  const collapsed = { height: body.style.height, overflow: body.style.overflow };
  body.style.height = "";
  body.style.overflow = "";
  const fits = toastCardFitsWindow(card.offsetHeight, scroller.clientHeight);
  body.style.height = collapsed.height;
  body.style.overflow = collapsed.overflow;
  return fits ? "paragraph" : "summary";
}

/**
 * The measurement, latched. A card with a summary starts `"pending"` and
 * leaves it in its arrival commit's layout effect, before paint; nothing moves
 * it again. The effect keys on `choice` alone, so neither the age tick's
 * once-a-second re-render nor the student opening «Защо» can re-run it.
 */
function useToastBodyChoice(canSummarise: boolean): {
  setCard: (el: HTMLElement | null) => void;
  bodyRef: { current: HTMLParagraphElement | null };
  choice: ToastBodyChoice;
} {
  const cardRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLParagraphElement | null>(null);
  // A stable callback ref: an inline one would be detached and re-attached on
  // every tick of the age clock.
  const setCard = useCallback((el: HTMLElement | null) => {
    cardRef.current = el;
  }, []);
  const [choice, setChoice] = useState<ToastBodyChoice>(() =>
    initialToastBodyChoice(canSummarise, typeof document !== "undefined"),
  );
  useLayoutEffect(() => {
    if (choice !== "pending") return;
    setChoice(measureToastBodyChoice(cardRef.current, bodyRef.current));
  }, [choice]);
  return { setCard, bodyRef, choice };
}

/* ═══════════════════════════════════════════════════════════════════════════
   …AND ON PC THE SUMMARY BECAME THE LAST WORD — the verifier's second item.

   The w48 re-route that sent this row here specified „render event.peekBg ??
   event.explanationBg with the paragraph behind an in-card toggle", and the
   repair above shipped the first half. The phone's card has carried that
   toggle all along: «ЗАЩО» (`SimOverlay`) opens the whole authored paragraph
   from the summary. On PC the summary was all there was until the debrief —
   a reason, but the SHORT reason, with the law and the explanation it
   compresses unreachable for the eight seconds the fault is live. THEO-4 does
   not accept „it is in the debrief" for the moment of the mistake; the chip is
   what keeps the summary a summary rather than a verdict with a caption.

   THE SHAPE, and each property is a constraint rather than a taste:
     · THE PHONE'S WORD. «Защо» set `uppercase`, the same label `SimOverlay`
       prints, with ↓ closed / ↑ open. One product, one name for „the rest of
       the reason".
     · ONLY ON A SUMMARISED CARD. A card showing its paragraph has nothing
       behind a chip, and a control that opens what is already open is chrome.
     · A POINTER TARGET, NOT A KEY. The keyboard drives the car (see the file
       header: no binding here, on purpose). The chip is sized like the
       shell's own «покажи» fold row — `rounded-full border px-2.5 py-1
       text-[9px]` — because that is the affordance this column already
       teaches for „there is more, press here".
     · A REGION OF THE CARD, NOT A `<button>` IN A `<button>`. The interactive
       card IS a `<button>` (click removes it — the founder's A6). A second
       button inside it is invalid HTML, React warns on it, and `SimOverlay`
       has already refused that nesting once and solved the same problem by
       asking WHERE the press landed (`pressOnDismissGlyph`). Here the target
       is the chip's own element, so `closest` answers it without geometry:
       a press on the chip toggles, a press anywhere else still dismisses.
     · IT DOES NOT RE-OPEN THE FIT QUESTION, AND IT SURVIVES THE CLOCK. The
       open state is this component's own `useState`, keyed by the toast id,
       so the age tick re-renders it without resetting it; the measurement
       keys on `choice` and never sees it.

   WHAT OPENING IT DOES TO THE COLUMN, stated: the paragraph comes back at the
   size it has, which on the ring row is taller than the window. That is the
   student's explicit choice, the shell's `ResizeObserver` on
   `[data-hud="toasts"]` sees the card grow, and its fold row then offers
   «↓ обяснението продължава — покажи» to page through it, exactly as it did
   for every long card before the repair above.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The attribute that marks the «Защо» chip — and the press region it is. */
export const TOAST_WHY_ATTR = "data-hud-toast-why";

/** The chip's label, in the phone card's word (`SimOverlay`: „Защо"). */
export const TOAST_WHY_LABEL_BG = { closed: "Защо ↓", open: "Защо ↑" } as const;

/**
 * Did this press land on a «Защо» chip? Structural rather than `instanceof
 * Element`, so the gate can ask it of a stand-in without a DOM; anything that
 * cannot answer `closest` (a text node, `null`) is not on the chip.
 */
export function pressLandedOnToastWhy(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false;
  const closest = (target as { closest?: unknown }).closest;
  if (typeof closest !== "function") return false;
  return (target as Pick<Element, "closest">).closest(`[${TOAST_WHY_ATTR}]`) !== null;
}

/** What one press of a card does. `"none"` is the inert column off the chip. */
export type ToastPressAction = "why" | "dismiss" | "none";

/**
 * THE CARD'S PRESS, AS ONE FUNCTION THE COMPONENT CALLS AND THE GATE RUNS. A
 * card with a chip toggles when the press lands on it; otherwise an
 * interactive card dismisses, as it always has, and an inert one does nothing.
 */
export function toastCardPressAction(
  target: unknown,
  card: { interactive: boolean; hasWhy: boolean },
): ToastPressAction {
  if (card.hasWhy && pressLandedOnToastWhy(target)) return "why";
  return card.interactive ? "dismiss" : "none";
}

/**
 * The chip. `pointer-events-auto` because the inert column's card is
 * `pointer-events-none`; `title` because the card's own „Щракни, за да го
 * скриеш" would otherwise be the tooltip over the one spot where it is false.
 * Its colour is the fault's, as the phone's «Защо» label is.
 */
function ToastWhyChip({ open, color }: { open: boolean; color: string }) {
  return (
    <span
      data-hud-toast-why={open ? "open" : "closed"}
      title={open ? "Свий обяснението" : "Покажи цялото обяснение"}
      className="pointer-events-auto ml-auto shrink-0 cursor-pointer rounded-full border px-2.5 py-1 text-[9px] font-black uppercase leading-none tracking-wider"
      style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}
    >
      {open ? TOAST_WHY_LABEL_BG.open : TOAST_WHY_LABEL_BG.closed}
    </span>
  );
}

function ViolationToast({
  event,
  ageBg,
  onDismiss,
}: {
  event: Extract<HudEvent, { kind: "violation" }>;
  ageBg: string | null;
  onDismiss: (() => void) | null;
}) {
  const meta = SEVERITY_META[event.severity];
  const canSummarise = typeof event.peekBg === "string" && event.peekBg.trim().length > 0;
  const { setCard, bodyRef, choice } = useToastBodyChoice(canSummarise);
  const [whyOpen, setWhyOpen] = useState(false);
  const toggleWhy = useCallback(() => setWhyOpen((open) => !open), []);
  const summarised = choice === "summary";
  const showParagraph = !summarised || whyOpen;
  return (
    <ToastShell
      color={meta.color}
      onDismiss={onDismiss}
      onWhy={summarised ? toggleWhy : undefined}
      cardRef={setCard}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10px] font-black uppercase tracking-wide"
          style={{ color: meta.color }}
        >
          {meta.label}
        </span>
        <span className="flex items-center gap-1">
          {/* The unit rides ON the number. A bare „−10 т." on a toast is the
              same misreading as on the result screen, three minutes earlier. */}
          <span
            className="whitespace-nowrap text-xs font-black tabular-nums"
            style={{ color: meta.color }}
          >
            {minusPointsBg("exam", event.points)}
          </span>
          <DismissGlyph show={onDismiss !== null} />
        </span>
      </div>
      <p className="mt-1 text-sm font-bold leading-snug text-foreground">{event.titleBg}</p>
      {/* The WHY — same layout as the "lesson" teaching toast below (QW7):
          our moat is the law-cited explanation at the moment of learning.
          Quiet mode NEVER removes this; it removes praise. What CAN change it
          is the fit test above: a paragraph the column would cut is replaced
          by the catalogue's own summary of it, never by nothing — and the
          «Защо» chip in the footer brings the paragraph back on request.
          `data-hud-toast-body` names which one is in the box, so a sweep can
          read the choice off the DOM instead of inferring it from a crop;
          `"pending"` there is the one commit before the choice, never painted. */}
      <p
        ref={bodyRef}
        data-hud-toast-body={choice === "pending" ? "pending" : showParagraph ? "paragraph" : "summary"}
        className="mt-1 text-xs leading-snug text-muted"
        style={choice === "pending" ? TOAST_BODY_PENDING_STYLE : undefined}
      >
        {violationToastBodyBg(event, showParagraph)}
      </p>
      <ToastFooter
        lawRef={event.lawRef}
        ageBg={ageBg}
        trailing={summarised ? <ToastWhyChip open={whyOpen} color={meta.color} /> : null}
      />
    </ToastShell>
  );
}

function ToastCard({
  event,
  ageBg,
  onDismiss,
}: {
  event: HudEvent;
  /** „сега" / „преди 8 с", or null when this card carries no moment. */
  ageBg: string | null;
  onDismiss: (() => void) | null;
}) {
  if (event.kind === "violation") {
    // Its own component because it holds hooks (the fit measurement), and a
    // hook called in one arm of this `if` chain is outside the rules of hooks.
    return <ViolationToast event={event} ageBg={ageBg} onDismiss={onDismiss} />;
  }

  if (event.kind === "commendation") {
    return (
      <ToastShell color="var(--success)" onDismiss={onDismiss}>
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[10px] font-black uppercase tracking-wide"
            style={{ color: "var(--success)" }}
          >
            Браво
          </span>
          <DismissGlyph show={onDismiss !== null} />
        </div>
        <p className="mt-1 text-sm font-bold leading-snug text-foreground">{event.titleBg}</p>
      </ToastShell>
    );
  }

  if (event.kind === "lesson") {
    // A first, teachable encounter — coached, not scored. Framed to teach, not scold.
    return (
      <ToastShell color="var(--accent-2)" onDismiss={onDismiss}>
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[10px] font-black uppercase tracking-wide"
            style={{ color: "var(--accent-2)" }}
          >
            📚 Научи
          </span>
          <DismissGlyph show={onDismiss !== null} />
        </div>
        <p className="mt-1 text-sm font-bold leading-snug text-foreground">{event.titleBg}</p>
        <p className="mt-1 text-xs leading-snug text-muted">{event.explanationBg}</p>
        {/* A «Научи» card is where the sweep found a live-tense sentence outliving
            its own truth: `sc-merge-from-property/mobile-right/05-stopped.png`
            reads «…а в момента караш 16 км/ч» with the cluster below it at 0.
            The sentence is composed in `lessons/engine.ts` and is that file's to
            fix; the moment is this card's, and with it on the glass the claim is
            at least dated instead of asserted about a present that has moved. */}
        <ToastFooter lawRef={event.lawRef} ageBg={ageBg} />
      </ToastShell>
    );
  }

  // objectiveComplete is rendered by the banner; quiz belongs to the tutor
  // layer (v2) — neither shows as a toast.
  return null;
}

export function HudToasts({
  toasts,
  quiet = false,
  onDismiss,
  onDismissAll,
}: {
  toasts: HudToast[];
  /** „По-тихи известия": one card at a time, and no praise. */
  quiet?: boolean;
  /** L14: omit and the column stays inert (the pre-rework behaviour). */
  onDismiss?: (id: number) => void;
  /** Shown only while more than one card is up — one click clears the lot. */
  onDismissAll?: () => void;
}) {
  const shown = visibleToasts(toasts, quiet);

  // ── THE AGE HAS TO MOVE, OR IT IS NOT AN AGE ─────────────────────────────
  // Hooks before the early return below, which is why `shown` is computed
  // first and the `null` is returned after them.
  //
  // The interval exists only while a card that PRINTS an age is up: praise and
  // an empty column cost nothing, and the longest this can run is the 8 s
  // teaching TTL. `Date.now()` and not a counter, so a tab that was
  // backgrounded (WebKit throttles timers hard on a phone) comes back with the
  // true age rather than with the number of ticks it was awake for.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const ticking = shown.some((t) => toastCarriesAge(t.event.kind) && t.raisedAtMs !== undefined);
  useEffect(() => {
    if (!ticking) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), TOAST_AGE_TICK_MS);
    return () => window.clearInterval(timer);
  }, [ticking]);

  if (shown.length === 0) return null;
  return (
    // The WRAPPER stays inert so the column never eats a click meant for the
    // road behind it; only the cards themselves are `pointer-events-auto`.
    <div className="pointer-events-none flex flex-col items-end gap-2 select-none">
      {/* ═══════════════════════════════════════════════════════════════════
          `[data-hud="toasts"]` HOLDS CARDS AND ONLY CARDS — 2026-08-28, w8.

          THE BOX IS NOT DECORATION, IT IS A MEASURING INSTRUMENT. The shell
          counts the fold off THIS element's children and says so at its own
          site: „The rows are read off `[data-hud="toasts"]`'s children —
          `HudToasts` owns that box, so this measures what is actually painted"
          (`LessonPlayShell.tsx`, `measureToastFold`, ~5185). Those children
          then go through `rowsFullyBelowFold`, whose count picks the SENTENCE
          the fold control prints, and that sentence is a claim about GRADED
          FAULTS: „N is the number of graded faults the student has not seen a
          pixel of" (`LessonPlayShell.tsx`, the label, ~6531).

          «Изчисти известията» WAS THE LAST OF THOSE CHILDREN. It renders
          exactly when `shown.length > 1`, i.e. on the busiest moment the column
          has, and it is a CONTROL — so from the moment a second fault arrives
          the counter had one more „graded fault" in it than the drive
          contained, and the miscount was always in the direction of alarm.

          MEASURED, AND THE FRAME PROVES IT ARITHMETICALLY RATHER THAN BY EYE.
          `.audit-frames/w14/frames/sc-ac-crosswind__pc-wrong/04-t021s.png`
          (1440 × 900, driven on 6399a8d, and this file is byte-identical from
          there to HEAD) prints «↓ ОЩЕ 2 ИЗВЕСТИЯ — ПОКАЖИ» under a single
          «Удар в пешеходец» card. `TOAST_MAX_VISIBLE` is 2. One card is on the
          glass, so AT MOST ONE other notification can exist — «още 2 известия»
          is not a debatable reading, it is impossible. The third child was this
          button. Same sentence on
          `w14/frames/sc-junction-rhr__pc-wrong/04-t016s.png`.

          WHY IT IS WORTH A WAVE. The student is seventeen and the card he is
          reading is cut mid-clause («…Затова към пешеходците се кара с»). The
          one control offered to him announces OTHER notifications, and it
          over-announces them. He presses it expecting a second fault, gets the
          rest of a sentence and a button, and learns that the count on a fault
          column is not to be trusted — on the surface whose entire job is to
          make him believe the verdict enough to change how he drives.

          THE FIX IS THE BOX AND NOT THE ARITHMETIC. `rowsFullyBelowFold` is
          right; it was fed a control. Nothing about the button changes — same
          markup, same classes, same place on the screen, still inside the
          shell's scroller so a wheel still reaches it — it simply stops being a
          row in the list the instrument reads. The one thing that moves is
          `aria-live`, which follows the cards: a polite region should announce
          faults, not the appearance of the control that clears them.
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        aria-live="polite"
        data-hud="toasts"
        className="flex w-full flex-col items-end gap-2"
      >
        {shown.map((t) => (
          <ToastCard
            key={t.id}
            event={t.event}
            ageBg={
              t.raisedAtMs !== undefined && toastCarriesAge(t.event.kind)
                ? toastAgeBg(t.raisedAtMs, nowMs)
                : null
            }
            onDismiss={onDismiss ? () => onDismiss(t.id) : null}
          />
        ))}
      </div>
      {onDismissAll && shown.length > 1 ? (
        <button
          type="button"
          onClick={onDismissAll}
          className="hud-ghost pointer-events-auto rounded-full border border-border px-2.5 py-1 text-[10px] font-bold text-muted transition hover:text-foreground motion-reduce:transition-none"
        >
          Изчисти известията
        </button>
      ) : null}
    </div>
  );
}
