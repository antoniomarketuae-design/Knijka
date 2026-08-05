"use client";

import {
  useEffect,
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

  // Reset DURING RENDER, not in an effect — React's documented way to adjust
  // state when a prop changes. In an effect it costs an extra commit and one
  // painted frame of the previous question's clamp, which is visible as a jump
  // on exactly the questions this hook exists for.
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setPx(null);
  }

  useEffect(() => {
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

    const measure = (): void => {
      // A PHONE IS THE ONLY VIEWPORT THIS TOUCHES, and the check is inside
      // `measure` rather than around the effect so a rotation re-evaluates the
      // gate instead of leaving a question clipped to the other orientation's
      // height. (It was `SHORT_QUERY` — see PHONE_FOLD_QUERY for the 360px
      // Android portrait measurements that widened it.)
      if (!window.matchMedia(PHONE_FOLD_QUERY).matches) {
        setPx((prev) => (prev === null ? prev : null));
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
      if (over <= 0) return;
      setPx((prev) => {
        // `scrollHeight` is the UNCLAMPED text height, which is what the first
        // pass has to subtract from; after that the previous clamp is the
        // truth (scrollHeight would still report the full text).
        const natural = box.scrollHeight;
        const current = prev ?? natural;
        const next = Math.max(QUESTION_MIN_PX, current - over);
        // A CLAMP THAT DOES NOT CLAMP IS NOT FREE, and the first cut of this
        // returned one. On a two-line question the floor is ABOVE the text's
        // own height, so `next` bound nothing — but it was still a non-null
        // value, so the caller drew the „there is more" fade over nothing and
        // paid its 12px of tail padding. Measured at 852x393: 12px back on
        // q-eco-062, q-vehicle-063, q-vehicle-058 and q-ptp-062, which is the
        // whole of q-eco-062's overhang. Not binding means not there.
        return next >= natural ? null : next;
      });
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
