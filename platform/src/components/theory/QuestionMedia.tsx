"use client";

/**
 * Question media rendering (THEO-1): the ONE component both the practice
 * runner and the exam runner mount for the data-driven media kinds, so the
 * two surfaces can never diverge.
 *
 *  - sign       → <SignFace>, an <img> over the platform's own sign-artwork
 *                 endpoint (/api/signs/<code> streams content/signs/svg).
 *  - sceneStill → <SceneStill>, the static top-down canvas scene.
 *  - legacy image/video refs render nothing here (callers may keep their own
 *    placeholder); no bank item uses them.
 */

import { useEffect, useState, type CSSProperties } from "react";
import type { QuestionMedia, SignMediaRef } from "@/lib/content/types";
import { SceneStill } from "./SceneStill";

export function signArtworkUrl(signRef: string): string {
  return `/api/signs/${encodeURIComponent(signRef)}`;
}

/**
 * One sign face. `altBg` is the accessible label — pass "" (decorative) when
 * adjacent text already names the option, and NEVER leak the answer through
 * it on identification questions (the neutral default is deliberate).
 */
export function SignFace({
  signRef,
  altBg = "Пътен знак",
  className,
  style,
}: {
  signRef: string;
  altBg?: string;
  className?: string;
  /** Only for a computed size (QuestionArtwork's phone cap). */
  style?: CSSProperties;
}) {
  return (
    // Plain <img>: the svg renders in its own image context (no id/style
    // collisions between multiple inline faces) and caches across questions.
    // No lazy loading: the sign IS the question — it must never pop in late.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={signArtworkUrl(signRef)}
      alt={altBg}
      draggable={false}
      decoding="async"
      style={style}
      className={`select-none ${className ?? ""}`}
    />
  );
}

/**
 * True when the option list should render as a sign picture grid.
 *
 * THIS IS THE „Кой от показаните знаци…" SHAPE, AND IT IS THE ONLY ONE.
 * A four-sign comparison carries its artwork on the OPTIONS — one sign per
 * option, in option order — and leaves `question.media` null, because there is
 * no single picture to draw above the question text. That is the schema's
 * answer to „a media kind that holds an ordered set of signs": the ordered set
 * is the option list (content/SCHEMA.md, „the comparison shape").
 *
 * So do not add a `signSet`/`multiSign` question-media kind. Three surfaces
 * already render this one through <SignFace> — practice, exam, and the sim's
 * mid-drive micro-quiz — and a second representation would mean a second grid
 * to keep in step with them.
 *
 * The corollary bit anyone auditing the bank: a check that reads
 * `question.media` and stops there sees `null` on every one of these and
 * concludes „nothing is shown". Nine perfectly answerable questions were filed
 * as unanswerable that way (docs/education/90 §4.1). Read `options[].media`.
 */
export function hasSignOptions(
  options: readonly { media?: SignMediaRef | null }[],
): boolean {
  return options.some((o) => o.media != null);
}

/**
 * Media block above the question text. Returns null for legacy/absent.
 *
 * `maxHeightPx` is a CAP, not a size: absent, every rendering is exactly what
 * it always was (a 112/128px sign face, a scene still at 0.72 × its column
 * width). It exists for <QuestionArtwork> below — see the note there for why a
 * phone gets a capped artwork and a full-screen viewer instead of an
 * uncapped one it has to scroll past.
 */
export function QuestionMediaView({
  media,
  className,
  maxHeightPx,
}: {
  media: QuestionMedia | null;
  className?: string;
  maxHeightPx?: number;
}) {
  if (media === null || !("kind" in media)) return null;

  if (media.kind === "sign") {
    // The frame padding is chosen HERE, not appended by the caller: `p-4` and
    // a caller's `p-2` are the same Tailwind property, so which one wins is
    // decided by stylesheet order rather than by the markup — a coin flip that
    // moves the block by 16px and, on a phone, moves the last answer with it.
    return (
      <div
        className={`flex justify-center rounded-xl border border-border bg-surface-2/40 ${
          maxHeightPx === undefined ? "p-4" : "p-2"
        } ${className ?? ""}`}
      >
        <SignFace
          signRef={media.signRef}
          className={maxHeightPx === undefined ? "h-28 w-28 sm:h-32 sm:w-32" : ""}
          style={
            maxHeightPx === undefined
              ? undefined
              : { height: maxHeightPx, width: maxHeightPx }
          }
        />
      </div>
    );
  }

  return <SceneStill media={media} className={className} maxHeightPx={maxHeightPx} />;
}

/**
 * THE ARTWORK, ON A PHONE — capped, and one tap from full screen.
 *
 * WHAT CHANGED AND WHY. The previous fold pass left the artwork at its desktop
 * size on phones and shrank only the decorative frame, reasoning that „the sign
 * IS the question, so a smaller one is a harder question". That reasoning is
 * right about legibility and wrong about the trade it was making: an uncapped
 * scene still is 237px tall in a 329px column — 28 % of an iPhone 16's height —
 * and it pushed the answers of every scene question off the screen, which is the
 * exact thing the founder has now raised three times. „A thumbnail that expands
 * on tap is legitimate; making the student scroll is not."
 *
 * So below `sm` the artwork is drawn to a height budget and the whole block is a
 * button that opens it FULL SCREEN. The student who wants to study the sign gets
 * 361px of it — more than three times the 112px they used to get — and the
 * student who already knows it never loses the answers. From `sm` up nothing
 * changes at all: same component, same sizes, no button.
 *
 * `heightPx` is passed by the caller because only the caller knows what is left
 * after its own chrome.
 */
export const ARTWORK_MAX_PX = 150;
/** Below this the inline artwork is not artwork any more — see the strip. */
export const ARTWORK_MIN_PX = 44;

/**
 * THE ARTWORK'S HEIGHT BUDGET — measured, not guessed.
 *
 * A fixed cap is wrong in both directions: 150px pushes the answers of the
 * bank's three heaviest scene questions off a 852px screen, and 96px shrinks
 * the other twenty-five for no reason. So the runner hands this hook the card
 * it wants to keep on screen, and the artwork gives back exactly the pixels
 * that card is over by, down to a floor — at which point <QuestionArtwork>
 * stops pretending and draws a strip that says „tap to see the diagram".
 *
 * Phones only, and only while there IS artwork; on desktop and on the 92 % of
 * questions with none, this hook does nothing at all. It only ever SHRINKS
 * within a question (reset on the next one), so it converges in at most a
 * couple of frames instead of oscillating.
 *
 * `visualViewport.height` rather than `innerHeight`: on a real iPhone the
 * Safari toolbars own 80–110px that `innerHeight` still counts, and measuring
 * against the wrong one is precisely how a fix passes on this box and fails on
 * the founder's phone.
 */
export function useArtworkBudget(
  ref: { current: HTMLElement | null },
  resetKey: string,
  enabled: boolean,
): number {
  const [px, setPx] = useState(ARTWORK_MAX_PX);
  const [seenKey, setSeenKey] = useState(resetKey);

  // Reset DURING RENDER, not in an effect: React's documented way to adjust
  // state when a prop changes. In an effect it costs an extra commit and one
  // painted frame of the previous question's artwork size — visible as a jump
  // on exactly the questions this hook exists for.
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setPx(ARTWORK_MAX_PX);
  }

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    // A LANDSCAPE PHONE IS NOT A DESKTOP, AND THIS LINE SAID IT WAS.
    // `(min-width: 640px)` alone switched the budget OFF on an iPhone 16 held
    // sideways (852 x 393), so the artwork was drawn at the full 150px cap on
    // the shortest screen the product has. Measured on the fold rig, WebKit,
    // landscape: the six heaviest artwork questions pushed their answer options
    // 92–304px below the bottom of the glass, with the budget that exists to
    // prevent exactly that sitting disabled. Both dimensions, so the guard now
    // means what it always meant — „there is room" — instead of „it is wide".
    // Same pair of conditions as the `wide-tall:` variant in globals.css.
    if (window.matchMedia("(min-width: 640px) and (min-height: 521px)").matches) {
      return;
    }

    const measure = (): void => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const scroller = document.scrollingElement ?? document.documentElement;
      // TWO measurements, and the DOCUMENT one is the one that matters. A card
      // that fits the viewport can still leave the page scrolling by the
      // <main> padding under it — and the moment the page scrolls, the action
      // bar pins itself over the last answer. Measured: three scene questions
      // sat exactly 1px under a pinned bar for precisely that reason.
      const over = Math.ceil(
        Math.max(scroller.scrollHeight - vh, el.getBoundingClientRect().bottom - vh),
      );
      if (over <= 0) return;
      setPx((prev) => Math.max(ARTWORK_MIN_PX, prev - over));
    };

    // A RESIZE OBSERVER, not a one-shot after render. A scene still is a
    // FETCH: it paints a placeholder, then swaps in a canvas plus a 21px
    // caption when the district json lands. A hook that measured once
    // measured the placeholder, shrank by the wrong amount and stopped —
    // three questions ended up 22px past the fold with the budget still
    // claiming there was room. The observer re-runs on every layout change,
    // and because the budget only ever shrinks (it resets on the next
    // question) the loop terminates.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.visualViewport?.addEventListener("resize", measure);

    // A short frame chain on top of the observer. The observer catches size
    // CHANGES; this catches the frames where the size was already right but
    // the value React had not yet committed — measured as a stubborn 2–9px of
    // residual scroll on sign questions that the observer never re-fired for.
    let frames = 0;
    let raf = 0;
    const tick = (): void => {
      measure();
      frames += 1;
      if (frames < 8) raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [enabled, ref, resetKey]);

  return px;
}

export function QuestionArtwork({
  media,
  heightPx,
  labelBg = "Уголеми изображението",
  buttonClassName,
}: {
  media: QuestionMedia | null;
  /** Phone height budget for the artwork itself (not the frame). */
  heightPx: number;
  labelBg?: string;
  /**
   * Replaces the phone button's own box classes (NOT appended to them: two
   * competing `w-*` utilities in one string are decided by stylesheet order,
   * which is a coin flip). The practice runner passes this when the artwork has
   * bottomed out on a landscape phone and the „Виж схемата ⤢" strip moves into
   * the action bar — where it is one control among several rather than a
   * full-width block.
   */
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  // Escape closes, and the body must not scroll behind the viewer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (media === null || !("kind" in media)) return null;

  // Under the floor the picture stops being readable, so it stops pretending:
  // a 44px strip that names what is behind it and opens it full screen. That
  // happens on the handful of items whose question text alone is a screenful —
  // the alternative there is not a bigger picture, it is a scroll.
  const asStrip = heightPx <= ARTWORK_MIN_PX;
  const stripLabel =
    media.kind === "sign" ? "Виж пътния знак" : "Виж схемата на ситуацията";

  return (
    <>
      {/* Phones: capped + tappable. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={labelBg}
        /* The budget the artwork actually settled on. It is here so the fold
           rig can read it out of the DOM instead of inferring it from a box
           height — see src/app/dev/fold-rig. */
        data-artwork-px={heightPx}
        className={`relative rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent wide-tall:hidden ${
          buttonClassName ?? "block w-full"
        }`}
      >
        {asStrip ? (
          <span className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface-2/40 px-3 text-xs font-bold text-muted">
            <ArtworkIcon />
            {stripLabel}
            <span aria-hidden className="ml-auto font-mono text-[13px]">
              ⤢
            </span>
          </span>
        ) : (
          <>
            <QuestionMediaView media={media} maxHeightPx={heightPx} />
            <span
              aria-hidden
              className="absolute bottom-1.5 right-1.5 rounded-md border border-hair bg-surface/90 px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted"
            >
              ⤢
            </span>
          </>
        )}
      </button>

      {/* From `sm` up AND with vertical room: exactly the block this
          component replaced.  and not  — a landscape phone is
          852px WIDE and 393px tall, and it was taking the uncapped picture. */}
      <div className="hidden wide-tall:block">
        <QuestionMediaView media={media} />
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={labelBg}
          /* OPAQUE, not a 95 % wash. Captured at 393x852 the translucent
             version let the question text and four option rows read straight
             through the diagram — on the one screen whose entire job is to
             show the diagram clearly. */
          className="fixed inset-0 z-50 flex flex-col justify-center bg-background p-4 wide-tall:hidden"
        >
          <QuestionMediaView media={media} />
          <button
            type="button"
            onClick={() => setOpen(false)}
            autoFocus
            className="btn-ghost mt-4 self-center"
          >
            Затвори
          </button>
        </div>
      ) : null}
    </>
  );
}

function ArtworkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-4 w-4 shrink-0"
    >
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9Zm1.5 0v6.19l2.22-2.22a.75.75 0 0 1 1.06 0l1.72 1.72 1.72-1.72a.75.75 0 0 1 1.06 0l1.22 1.22V3.5h-9Zm7.25 1a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" />
    </svg>
  );
}
