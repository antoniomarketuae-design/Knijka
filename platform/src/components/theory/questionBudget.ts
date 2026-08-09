"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

/**
 * THE QUESTION TEXT'S HEIGHT BUDGET — the sibling of `useArtworkBudget`, and
 * the last thing that gives on a phone held sideways.
 *
 * WHAT IT IS FOR. Founder review row C5, verbatim: „it all have to be on the
 * screen without scrolling", and his point 8 names orientation explicitly. At
 * 852 x 393 that is arithmetic, not polish: the app topbar takes 48px and the
 * pinned action bar 61, which leaves ~258px for a picture, a question and the
 * answers. The bank's heaviest item (q-krastovishta-029: a 284-character
 * question under a top-down scene) asks for 342. Something has to give, and
 * there are only four candidates:
 *
 *   the reading sizes   protected — 18px question, 14px answers, phone and
 *                       desktop alike (components/mobileFold.test.ts)
 *   the touch targets   protected — 44px option rows
 *   the ANSWERS         the thing he is complaining about. An option painted
 *                       under the „Провери" strip cannot be read OR tapped,
 *                       and 13 of the 18 heaviest questions had one.
 *   the QUESTION TEXT   this hook.
 *
 * So the answers stop moving and the question gives. It keeps whatever is left
 * after the artwork, the answers and the bar have taken theirs, and scrolls
 * inside its own box for the remainder. That is not the sentence he wrote — it
 * is the closest thing to it that 393px of glass permits — but it puts the
 * trade where it belongs: a student can always SEE every answer they are
 * choosing between, and the two or three heaviest questions in the bank cost a
 * flick inside a text box instead of hiding the choices.
 *
 * ORDER MATTERS, AND THE CALLER ENFORCES IT. The picture shrinks FIRST (down to
 * ARTWORK_MIN_PX, at which point it is a „Виж схемата ⤢" strip); only then may
 * the words be clipped. Clipping a question while a 150px diagram sits above it
 * would be exactly the wrong trade, so the caller passes `enabled` false until
 * the artwork budget has bottomed out.
 *
 * IT ONLY EVER SHRINKS within a question (reset on the next one), so it
 * converges in a couple of frames instead of oscillating against the artwork
 * budget it runs after.
 *
 * `visualViewport.height` rather than `innerHeight`, for the same reason the
 * artwork budget uses it: on a real iPhone the Safari toolbars own 80–110px
 * that `innerHeight` still counts, and measuring against the wrong one is how a
 * fix passes on this box and fails on the founder's phone.
 */

/**
 * Below this the box stops being a question and becomes a ransom note. Two
 * lines of the 18px question type (leading-snug) plus the box's own 12px tail
 * padding. If a viewport cannot give even this, the clamp stops and the
 * residual is left VISIBLE as document scroll rather than hidden — a budget
 * that silently swallows its own failure is how „every option fits" gets
 * reported for a screen with an option under the bar.
 */
export const QUESTION_MIN_PX = 62;

/** The `short:` variant, spelled once (globals.css owns the other copy). */
const SHORT_QUERY = "(max-height: 520px)";

/** The `narrow-tall:` variant — a phone in PORTRAIT (globals.css owns the other copy). */
const NARROW_TALL_QUERY = "(max-width: 639px) and (min-height: 521px)";

/**
 * WHERE THE CLAMP IS ALLOWED TO BIND — and it is no longer „a phone held
 * sideways" only, because that was a statement about ONE PHONE.
 *
 * The gate used to be SHORT_QUERY alone, on the argument that portrait passes.
 * Portrait passed on a 393px iPhone. It does not pass on the 360px Android
 * floor, and the reason is the 33px: at 360px the bank's heaviest stem
 * (q-krastovishta-029) wraps to TEN lines and stands 248px tall under its own
 * scene — a third of the screen — where the same stem on the iPhone is 9 lines
 * and the page fits. Re-derived on this tree at 360x780, WebKit: three of the
 * twenty heaviest practice questions did not fit, and on two of them an ANSWER
 * was under the „Провери" strip (q-vehicle-063 by 10px, q-krastovishta-029 by
 * 28px). The union of the two CSS variants is „a phone", which is what the
 * clamp was always about.
 *
 * It is spelled as the union of the two variants rather than simplified to
 * `(max-height:520px), (max-width:639px)` — the two are equivalent, but this
 * form cannot drift away from the `short:` / `narrow-tall:` twins in globals.css
 * that draw the scroller and the fade, and a clamp whose CSS twin is missing is
 * a maxHeight with no `overflow-y`, i.e. a question with its last line simply
 * gone. mobileFold.test.ts pins the pair.
 *
 * The ORDER is unchanged and still load-bearing: the picture gives first, then
 * the FURNITURE (paddings and the gaps around the empty live region), and only
 * the residual reaches the words. On this bank at these four viewports the
 * furniture is enough on every question but one, so this gate is mostly a net —
 * which is the net working, not the net missing.
 */
const PHONE_FOLD_QUERY = `${SHORT_QUERY}, ${NARROW_TALL_QUERY}`;

function subscribeShort(onChange: () => void): () => void {
  const mq = window.matchMedia(SHORT_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function readShort(): boolean {
  return window.matchMedia(SHORT_QUERY).matches;
}

/**
 * `short:` AS A SUBSCRIPTION — a phone held sideways, in JavaScript.
 *
 * WHERE a control is mounted is a DOM decision, not a CSS one. Once the artwork
 * budget bottoms out the block has stopped being a picture and become a „Виж
 * схемата ⤢" CONTROL, and a control belongs in the bar the thumb is already on
 * — which means moving the element, not restyling it.
 *
 * It lives beside the query it reads because BOTH runners need that decision
 * now. The practice runner had a private copy; the exam runner adopting a
 * second one would leave two spellings of „short" one edit apart from
 * disagreeing, which is exactly how the fold selector silently matched nothing
 * for a whole phase.
 *
 * The server snapshot is `false`, so nothing moves before hydration and the
 * markup a crawler sees is the ordinary one.
 */
export function useIsShort(): boolean {
  return useSyncExternalStore(subscribeShort, readShort, () => false);
}

export function useQuestionBudget(
  cardRef: RefObject<HTMLElement | null>,
  boxRef: RefObject<HTMLElement | null>,
  resetKey: string,
  enabled: boolean,
): number | null {
  const [px, setPx] = useState<number | null>(null);
  const [seenKey, setSeenKey] = useState(resetKey);

  /**
   * A CLAMP MUST PAY FOR ITSELF — the guard, and the defect it closes.
   *
   * `measure()` reads „how far past the bottom of the screen does this document
   * go" and hands the whole number to the question to give back. That is only
   * sound while the number is the question's to give. It was not, on the
   * founder's phone, for the life of this hook:
   *
   *   app/layout ships `viewportFit: "cover"`, globals.css pays the inset back
   *   as `body { padding-bottom: env(safe-area-inset-bottom) }`, and the shell
   *   asked for a full `min-h-dvh` inside that padded box — so the document was
   *   permanently 34px (portrait) / 21px (landscape) taller than the viewport.
   *   Against a min-height FLOOR, shrinking the question shrinks NOTHING.
   *   `over` stayed at 34 on every ResizeObserver tick and this hook subtracted
   *   it again, and again, until the stem hit QUESTION_MIN_PX.
   *
   * Measured on the tree before the fix, WebKit, iPhone 16 with the real insets
   * emulated (tools/mobile/lib/insets.mjs), 20 heaviest questions per surface:
   * the stem was clamped to 62px on 20 of 20 PORTRAIT cases on both runners,
   * hiding 49–173px of the question — three of five lines gone on
   * q-predimstvo-042 — while ~900 device px of the card sat empty below the
   * answers. No sweep had ever seen it, because the desktop WebKit port
   * resolves env(safe-area-inset-*) to 0 and every mobile number this project
   * had produced was taken on a phone with no notch.
   *
   * The shell's height is fixed now (DashboardShell), so `over` reaches 0 the
   * ordinary way. This is the NET, and it is deliberately mechanism-blind: it
   * does not know about safe areas, min-heights or anything else. It asks one
   * question — did the last cut make the page shorter? — and if the answer is
   * no, it refunds every pixel that bought nothing and stops until the viewport
   * changes. The residual is then left VISIBLE as document scroll, which is the
   * rule the rest of this file already states: a budget that silently swallows
   * its own failure is how „every option fits" gets reported for a screen with
   * an option under the bar.
   *
   * `<= 0` (not „less than it cost") is chosen because it cannot misfire on a
   * transient: a layout still settling always moves the number a little. A cut
   * that moves it by NOTHING is not a slow cut, it is a wasted one.
   */
  const pxRef = useRef<number | null>(null);
  const chaseRef = useRef<{ overAtStart: number; over: number; px: number } | null>(null);
  /** The viewport height we gave up at; cleared when the viewport changes. */
  const frozenAtRef = useRef<number | null>(null);

  // Reset DURING RENDER, not in an effect — React's documented way to adjust
  // state when a prop changes. In an effect it costs an extra commit and one
  // painted frame of the previous question's clamp, which is visible as a jump
  // on exactly the questions this hook exists for.
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setPx(null);
  }

  useEffect(() => {
    // The ledger belongs to one question at one viewport. `resetKey` and
    // `enabled` are both in this effect's deps, so this runs before the first
    // measure of a new question and before the first measure after the gate
    // opens — which is also why the refs are cleared here rather than during
    // render, where a discarded render would corrupt them.
    pxRef.current = null;
    chaseRef.current = null;
    frozenAtRef.current = null;

    if (!enabled) {
      // A clamp must never outlive the condition that justified it: rotating
      // back to portrait, or answering (the why-panel needs the card to grow
      // again), has to hand the question its full height back.
      setPx((prev) => (prev === null ? prev : null));
      return;
    }
    const card = cardRef.current;
    const box = boxRef.current;
    if (!card || !box) return;

    // `pxRef` is the source of truth and `px` is its mirror for rendering. It
    // used to be a functional `setPx(prev => …)`, which is the usual answer to
    // a stale closure — but the guard below has to read the CURRENT clamp and
    // write a ledger entry in the same breath, and a state updater is not a
    // place to have side effects (React may call it twice).
    const apply = (next: number | null): void => {
      if (pxRef.current === next) return;
      pxRef.current = next;
      setPx(next);
    };

    const measure = (): void => {
      // A PHONE IS THE ONLY VIEWPORT THIS TOUCHES, and the check is inside
      // `measure` rather than around the effect so a rotation re-evaluates the
      // gate instead of leaving a question clipped to the other orientation's
      // height. (It was `SHORT_QUERY` — see PHONE_FOLD_QUERY for the 360px
      // Android portrait measurements that widened it.)
      if (!window.matchMedia(PHONE_FOLD_QUERY).matches) {
        chaseRef.current = null;
        frozenAtRef.current = null;
        apply(null);
        return;
      }
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const scroller = document.scrollingElement ?? document.documentElement;
      // TWO measurements, and the DOCUMENT one is the one that matters: a card
      // that fits the viewport can still leave the page scrolling by the
      // padding under it — and the moment the page scrolls, the sticky action
      // bar pins itself over the last answer.
      const over = Math.ceil(
        Math.max(
          scroller.scrollHeight - vh,
          card.getBoundingClientRect().bottom - vh,
        ),
      );
      if (over <= 0) {
        chaseRef.current = null;
        frozenAtRef.current = null;
        return;
      }
      // Already established that these pixels are not this question's to give,
      // at this viewport height. Rotating or a toolbar collapse re-asks.
      if (frozenAtRef.current !== null && Math.abs(frozenAtRef.current - vh) < 1) return;

      // `scrollHeight` is the UNCLAMPED text height even while clamped (the box
      // keeps its overflow), so this is the height to subtract from and it stays
      // correct across a reflow that rewraps the stem.
      const natural = box.scrollHeight;
      const current = pxRef.current ?? natural;
      const chase = chaseRef.current;

      if (chase !== null) {
        const spent = chase.px - current; // px the words gave up on the last tick
        const gained = chase.over - over; // px the page got shorter by
        if (spent > 0 && gained <= 0) {
          // THE REFUND. Everything this question has given up since the chase
          // started bought `overAtStart - over` px of page, and not one pixel
          // more is coming. Hand the rest back and stop.
          const useful = Math.max(0, chase.overAtStart - over);
          const keep = natural - useful;
          apply(useful === 0 || keep >= natural ? null : Math.max(QUESTION_MIN_PX, keep));
          frozenAtRef.current = vh;
          return;
        }
      }

      const next = Math.max(QUESTION_MIN_PX, current - over);
      // A CLAMP THAT DOES NOT CLAMP IS NOT FREE, and the first cut of this
      // returned one. On a two-line question the floor is ABOVE the text's
      // own height, so `next` bound nothing — but it was still a non-null
      // value, so the caller drew the „there is more" fade over nothing and
      // paid its 12px of tail padding. Measured at 852x393: 12px back on
      // q-eco-062, q-vehicle-063, q-vehicle-058 and q-ptp-062, which is the
      // whole of q-eco-062's overhang. Not binding means not there.
      const applied = next >= natural ? null : next;
      chaseRef.current = {
        overAtStart: chase?.overAtStart ?? over,
        over,
        px: applied ?? natural,
      };
      apply(applied);
    };

    // A ResizeObserver, not a one-shot: a scene still is a FETCH that swaps a
    // placeholder for a canvas plus a caption, and the option rows reflow when
    // it does. Terminates because the budget only ever shrinks.
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    window.visualViewport?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);

    // A short frame chain on top of the observer, for the frames where the
    // size was already right but React had not yet committed the value.
    let frames = 0;
    let raf = 0;
    const tick = (): void => {
      measure();
      frames += 1;
      if (frames < 6) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.visualViewport?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [cardRef, boxRef, enabled, resetKey]);

  return px;
}
