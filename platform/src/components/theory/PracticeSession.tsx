"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { submitPracticeAnswer } from "@/app/(dashboard)/theory/practice/actions";
import { IconArrowRight, IconCheck, IconTarget, IconX } from "@/components/icons";
import { CheckControl } from "@/components/ui/CheckControl";
import { Gauge } from "@/components/hud/Gauge";
import type { PracticeQuestionDto, PracticeSubmitResult } from "./types";
import {
  ARTWORK_MIN_PX,
  hasSignOptions,
  QuestionArtwork,
  SignFace,
  useArtworkBudget,
} from "./QuestionMedia";
import { useIsShort, useQuestionBudget } from "./questionBudget";
import { WhyPanel, WhyPanelIdle } from "./WhyPanel";
import { buildWhyPanelModel } from "@/modules/clips/view";

/**
 * Client-side practice runner: one question at a time, immediate feedback
 * after each answer via the submitPracticeAnswer server action, summary at
 * the end. All grading happens on the server — the client never sees the
 * correct options before submitting.
 *
 * THEO-2 (doc 64): every submitted answer feeds the why-panel — on desktop a
 * SIDE PANEL ~20% of the viewport width beside the card (founder ruling,
 * never a modal), on mobile an in-card section right under the verdict. One
 * mount point at a time (matchMedia), so the replay never double-fetches.
 * The panel never blocks „Напред" — answering replaces its content.
 */

/** Tailwind lg — the side-panel/in-card switch. */
const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeDesktop(onChange: () => void): () => void {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function readDesktop(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

const REASON_BADGES: Record<
  PracticeQuestionDto["reason"],
  { labelBg: string; className: string }
> = {
  "due-review": { labelBg: "Преговор", className: "bg-warning/15 text-warning" },
  // Info tone, not danger: this flags a concept to focus on *before* answering —
  // it must not wear the same red as a wrong answer.
  "weak-concept": { labelBg: "Слабо място", className: "bg-accent-2/15 text-accent-2" },
  "new-concept": { labelBg: "Ново", className: "bg-accent/15 text-accent" },
};

/**
 * THE ANSWER BOX lives in components/ui/CheckControl — drawn by us, not by the
 * user agent, because `accent-color` on a bare native control tints only the
 * CHECKED fill and the cluster scope's `color-scheme: dark` had Chromium
 * painting the empty one at 1.66 : 1. That file carries the measurements, the
 * two Tailwind scanner traps, and the reason it must stay a real <input>.
 *
 * It is imported rather than copied now that eight screens mount the same box.
 * The import is safe in the direction that used to worry us — CheckControl is a
 * leaf with no dependency of its own, so the exam route can take it without
 * dragging the why-panel or the clip replay along.
 */

function toPct(value: number): number {
  return Math.round(value * 100);
}

function deltaClass(delta: number): string {
  if (delta > 0) return "text-success";
  if (delta < 0) return "text-danger";
  return "text-muted";
}

function formatDelta(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${delta}%`;
}

interface AnswerRecord {
  questionId: string;
  conceptId: string;
  conceptTitleBg: string;
  topicSlug: string | null;
  topicTitleBg: string | null;
  correct: boolean;
  masteryBefore: number;
  masteryAfter: number;
}

export function PracticeSession({
  questions,
  ticket,
  quota = null,
}: {
  questions: PracticeQuestionDto[];
  /**
   * The signed list of questions this session dealt (audit M-10). Sent back on
   * every submit; the server answers with the key ONLY for a question on it.
   * Not a secret — it is scoped to this user, these ids and one sitting — which
   * is exactly why it is safe to hand to the client at all.
   */
  ticket: string;
  /** Free-tier counter („Днес: X от Y безплатни въпроса"); null = unlimited. */
  quota?: { usedToday: number; limit: number } | null;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<PracticeSubmitResult | null>(null);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, startChecking] = useTransition();

  const current = index < questions.length ? questions[index] : null;
  const isLast = index === questions.length - 1;

  const toggleOption = (optionId: string): void => {
    if (current === null || result !== null || isChecking) return;
    setSelected((prev) =>
      current.type === "single"
        ? [optionId]
        : prev.includes(optionId)
          ? prev.filter((id) => id !== optionId)
          : [...prev, optionId],
    );
  };

  const check = (): void => {
    if (current === null || result !== null || isChecking || selected.length === 0) {
      return;
    }
    setError(null);
    startChecking(async () => {
      try {
        const submitted = await submitPracticeAnswer(current.id, selected, ticket);
        setResult(submitted);
        setAnswers((prev) => [
          ...prev,
          {
            questionId: current.id,
            conceptId: current.conceptId,
            conceptTitleBg: current.conceptTitleBg,
            topicSlug: current.topicSlug,
            topicTitleBg: current.topicTitleBg,
            correct: submitted.correct,
            masteryBefore: submitted.masteryBefore,
            masteryAfter: submitted.masteryAfter,
          },
        ]);
      } catch {
        setError("Проверката не мина. Провери връзката и опитай отново.");
      }
    });
  };

  const next = (): void => {
    if (result === null) return;
    setResult(null);
    setSelected([]);
    setError(null);
    setIndex((i) => i + 1);
  };

  // Keyboard shortcuts: 1–9 / A–H pick an option, Enter confirms/advances.
  // Registered fresh each render so the handler always closes over current
  // state; buttons and links keep their native Enter activation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || current === null) return;
      const key = e.key.toLowerCase();

      if (result === null) {
        let optionIndex = -1;
        if (/^[1-9]$/.test(key)) optionIndex = Number(key) - 1;
        else if (key.length === 1 && key >= "a" && key <= "h") {
          optionIndex = key.charCodeAt(0) - "a".charCodeAt(0);
        }
        if (optionIndex >= 0 && optionIndex < current.options.length) {
          e.preventDefault();
          toggleOption(current.options[optionIndex].id);
          return;
        }
      }

      if (e.key === "Enter") {
        const tag = e.target instanceof HTMLElement ? e.target.tagName : "";
        if (tag === "BUTTON" || tag === "A") return;
        e.preventDefault();
        if (result === null) check();
        else next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // THEO-2: one why-panel mount point at a time — the desktop side column or
  // the in-card mobile section — so MistakeReplay never fetches twice. Safe
  // for hydration: `result` is always null at SSR, so nothing renders early.
  const isDesktop = useSyncExternalStore(subscribeDesktop, readDesktop, () => false);
  // Row C5: a phone held sideways. Server-rendered as false, so nothing moves
  // before hydration and the markup the crawler sees is the ordinary one.
  const isShort = useIsShort();

  // Phase 5: the artwork gives back whatever this card is over the fold by.
  const cardRef = useRef<HTMLElement>(null);
  const artworkPx = useArtworkBudget(
    cardRef,
    current?.id ?? "",
    current?.media != null && result === null,
  );
  // ROW C5 — AND THEN, ONLY THEN, THE WORDS.
  //
  // On a phone held sideways the picture bottoming out at 44px is not enough
  // on the heaviest items: the answers still landed 4–79px under the pinned
  // „Провери" strip on 13 of the bank's 18 worst questions, which is the one
  // thing the founder actually cannot work around — you cannot choose an
  // answer you cannot see. So the ANSWERS stop moving and the QUESTION gives:
  // it keeps whatever height is left and scrolls inside its own box for the
  // rest. `enabled` is false until the artwork budget has bottomed out, so the
  // words are never clipped while a diagram still has room to shrink.
  const questionBoxRef = useRef<HTMLSpanElement>(null);
  const questionMaxPx = useQuestionBudget(
    cardRef,
    questionBoxRef,
    current?.id ?? "",
    result === null &&
      (current?.media == null || artworkPx <= ARTWORK_MIN_PX),
  );
  const panelModel = useMemo(
    () =>
      result === null || current === null
        ? null
        : // THEO Half A: feed the answered question's media + options so the
          // panel can draw the picture card (correct sign / diagram) beside
          // the stored explanation. `result` already carries correctOptionIds.
          buildWhyPanelModel({
            ...result,
            media: current.media,
            options: current.options,
          }),
    [result, current],
  );

  if (current === null) {
    return <SessionSummary answers={answers} />;
  }

  const answeredCount = answers.length;
  const correctCount = answers.reduce((n, a) => n + (a.correct ? 1 : 0), 0);
  const badge = REASON_BADGES[current.reason];
  // Any sign-face option switches the whole list to the picture grid.
  const signGrid = hasSignOptions(current.options);

  // TWO columns on a phone held sideways — ALWAYS, and the „three once there
  // are more than four options" rule that used to be here was measured on the
  // wrong phone and is now falsified.
  //
  // That rule was derived at 852x393, where a third column is a modest win. On
  // the 780x360 Android floor it is a LOSS, and a large one, because the option
  // text column is what decides how many lines an answer wraps to. Re-derived
  // on this tree, WebKit, 780x360, q-vehicle-058 (five options, the worst item
  // in the bank on this viewport):
  //
  //   three columns  text column 240px  rows h[64,109,132,132,86]  269px tall
  //   two columns    text column 363px  rows h[64, 64, 86, 86,64]  225px tall
  //
  // A grid row is as tall as its TALLEST cell, so the 132px option inflated the
  // whole row and the two-line option beside it was drawn into a five-line box
  // — visible in the capture as a half-empty tile next to an answer cut off by
  // the „Провери" strip. Widening the column removes the wrapping that made the
  // tall cell tall, and that is worth more than the extra column ever was: 45px
  // of overhang to none.
  //
  // It costs nothing where it loses. The one shape two columns is worse for is
  // six SHORT options (q-vehicle-005: three rows of 44px instead of two), and
  // that item finishes 162px clear of the fold on the iPhone and 90px clear on
  // the Android floor. Measured on both phones, both orientations, before the
  // rule changed — and CSS cannot know an option's height, so the rule has to
  // be the one that is safe on the worst case rather than optimal on the best.
  //
  // Hoisted out of the JSX deliberately, and it stays hoisted now that it is a
  // constant: inline, the ternary defeated BOTH source scanners that guard this
  // file (checkControl.test.ts mis-parsed the element's props and
  // mobileFold.test.ts read the closing brace as a concatenation seam). A class
  // string a scanner cannot read is a class string Tailwind might not emit.
  const shortOptionColumns = "short:sm:grid-cols-2";

  // THE COMPARISON GRID, AND WHY IT IS 2x2 AND NOT 3+1.
  //
  // Every „Кой от показаните знаци…" item in the bank has exactly FOUR sign
  // options — all 18 of them, across 8 topic files. `sm:grid-cols-3` therefore
  // never once produced three tidy columns: it produced three tiles and one
  // orphan on a second row, on every sign question the product has, at every
  // width from 640px up. Rendered and looked at (the founder's standing R0
  // rule) before this line changed.
  //
  // It is not only untidy, it removes the teaching. These four are a
  // COMPARISON: q-signs-066 offers А1/А2 (single curve, right/left) against
  // А3/А4 (double curve, right-first/left-first). In 2x2 the pairs sit above
  // each other and the student SEES the two axes; in 3+1 А3 is stranded on its
  // own row next to nothing and the pairing is gone.
  //
  // 2x2 is also what the founder already approved next door — the sim's
  // mid-drive micro-quiz (MicroQuizOverlay: `grid-cols-2`, 96px faces). Same
  // question shape, same component, so it is now the same grid. The >4 branch
  // stays for a future six-sign item that does not exist yet.
  const signGridColumns =
    current.options.length > 4 ? "sm:grid-cols-3" : "sm:grid-cols-2";

  // Row C5: the artwork strip belongs in the action bar exactly when it has
  // stopped being a picture — landscape phone, budget on the floor, question
  // not yet answered (after answering the why-panel owns the teaching and the
  // card is free to grow again).
  const artworkInBar =
    isShort &&
    current.media !== null &&
    result === null &&
    artworkPx <= ARTWORK_MIN_PX;

  return (
    // `max-sm:-mb-6` cancels <main>'s bottom padding on phones. That padding
    // is breathing room under a page you scroll; here the card ends in an
    // action bar that is already pinned to the bottom of the screen, so all it
    // did was make the document 24px taller than the viewport — which is
    // enough, on its own, to pin the bar over the last answer. `short:-mb-2`
    // is the same cancellation against the layout's landscape `short:py-2`.
    //
    // `max-sm:flex-1 short:flex-1` — THE CARD IS THE SCREEN ON A PHONE.
    // Measured before this (WebKit, iPhone 16 portrait, a four-option item):
    // the card ended at 55% of the screen and 37.7% below it was bare backdrop.
    // The card now reaches the bottom, which buys three things and no pixels of
    // new furniture: „Провери" sits in the thumb zone at the bottom edge
    // instead of floating halfway up; the artwork budget has room to draw a
    // sign a student can actually read; and the space the why-panel needs after
    // answering is ALREADY CLAIMED, so the verdict no longer shoves the layout
    // down the moment it appears. Tablets and desktops keep the content-height
    // card — this is a phone problem and it is fixed at phone sizes only.
    // `short:max-w-none`: the 2xl reading cap is right for a desktop column and
    // wrong for a phone held sideways, where it left 180px of bare backdrop
    // down each side — 21% of the screen, measured, doing nothing.
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 max-sm:-mb-6 max-sm:flex-1 short:-mb-1 short:max-w-none short:flex-1 lg:max-w-none lg:flex-row lg:items-start lg:justify-center lg:gap-6">
    <section
      ref={cardRef}
      aria-label={`Въпрос ${index + 1} от ${questions.length}`}
      // FULL BLEED ON A PHONE, AND THE READING MARGIN IS UNCHANGED.
      // <main> gives every dashboard page a 16px gutter; on this screen that
      // gutter was 8.1% of an iPhone spent on bare backdrop beside a card that
      // is the only thing on the page. `-mx-4` gives it back and `px-4` puts
      // the same 16px INSIDE the card instead — so the distance from the screen
      // edge to the question text goes 28px -> 16px (the iOS body margin) and
      // the ANSWER text column goes 287px -> 311px, which is one fewer wrapped
      // line on the long options. `rounded-none border-x-0` because a rounded
      // corner and a hairline at the physical edge of the glass read as a
      // rendering fault, not as a card.
      // `w-auto` is load-bearing next to `-mx-4`, and it is a mistake worth
      // recording: with `w-full` the card's width is 100% of the container, so
      // the negative margin MOVED it 16px left instead of widening it — a card
      // bleeding off one edge with a 32px gutter on the other. Captured, seen,
      // fixed. Width auto lets the flex cross-axis stretch do the work, which
      // is container + both margins = the full screen.
      // `short:pt-2 narrow-tall:pt-2` — the card's top padding, 12px -> 8px on
      // a phone. The BOTTOM stays 12px on purpose: the action bar's `-mb-3`
      // cancels exactly that much, so trimming both ends would leave the bar
      // 4px short of the card's edge and put a hairline of backdrop under it.
      className="card flex w-full min-w-0 flex-col gap-2.5 p-3 max-sm:-mx-4 max-sm:w-auto max-sm:flex-1 max-sm:rounded-none max-sm:border-x-0 max-sm:px-4 narrow-tall:pt-2 short:-mx-4 short:w-auto short:flex-1 short:gap-2.5 short:rounded-none short:border-x-0 short:p-3 short:px-4 short:pt-2 sm:gap-6 sm:p-7 lg:max-w-2xl"
    >
      {/* Progress — `sm` and up.
          MOBILE FOLD (founder review): every row of chrome here is 393x852
          real estate stolen from the answers. The counter, the streak, the
          reason badge and the points used to occupy three stacked rows —
          ~90px before the question even starts.

          PHASE 5 takes the last of it. Below `sm` this whole block moves into
          the sticky action bar at the bottom of the card — the strip that was
          already pinned there for „Провери" and was two thirds empty. That is
          the Gran Turismo lesson the founder sent as a reference: the readouts
          live hard against an edge and the middle of the screen is the thing
          you are actually doing. It buys 38px directly above the question,
          which is the row a long answer needs, and the counters end up MORE
          visible than they were — they no longer scroll away.

          The screen reader is not paying for it: the section's aria-label
          („Въпрос N от M") carries the sentence, and exactly one of the two
          progressbars is in the tree at any width (the other is display:none). */}
      {/* `short:hidden` sends this whole strip back into the action bar on a
          phone held SIDEWAYS too — same reason as below `sm`, against 393px of
          height instead of 852. The action-bar readouts carry `short:flex`, so
          exactly one of the pair is on screen at any viewport. */}
      <div className="hidden flex-col gap-1 short:hidden sm:flex sm:gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold tabular-nums text-muted">
            <span>
              Въпрос <span className="font-bold text-foreground">{index + 1}</span>{" "}
              от {questions.length}
            </span>
            {answeredCount > 0 ? (
              <span className="text-xs font-semibold text-accent-2">
                ({correctCount} верни досега)
              </span>
            ) : null}
            {quota !== null ? (
              // Live free-tier meter: answers in this session count toward today.
              <span className="font-mono text-[11px] font-bold text-muted">
                · Днес:{" "}
                <span className="text-accent">
                  {Math.min(quota.limit, quota.usedToday + answeredCount)}
                </span>{" "}
                от {quota.limit} безплатни въпроса
              </span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold sm:py-1 ${badge.className}`}
            >
              {badge.labelBg}
            </span>
            <span className="rounded-full border border-hair px-2.5 py-0.5 font-mono text-[11px] font-bold text-muted sm:py-1">
              {current.points} т.
            </span>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Напредък в тренировката"
          aria-valuemin={0}
          aria-valuemax={questions.length}
          aria-valuenow={answeredCount}
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* THEO-1: visual media renders ABOVE the question text. Sign codes
          and scene data describe the situation, never the answer.

          On a phone the artwork is drawn to a HEIGHT BUDGET and the block is a
          button that opens it full screen — see QuestionArtwork for why that
          reverses the previous pass's „the artwork never shrinks" rule. 96px
          is what is left here once the progress strip, a two-line question,
          four answers and the action bar have taken theirs; the viewer then
          gives 361px, three times what the inline block ever showed. From
          `sm` up this is the same component at the same size as before.

          AND ON A PHONE HELD SIDEWAYS IT CAN LEAVE THE CARD ENTIRELY. Once the
          budget has bottomed out the block is no longer a picture — it is a
          44px „Виж схемата ⤢" strip, i.e. a CONTROL — and a control belongs in
          the bar the thumb is already on. Measured at 852x393: the strip plus
          its gap is 54px of the ~258 the whole question has, and moving it took
          all six of the bank's heaviest artwork items from 12–35px under the
          action bar to clear. While the picture still fits it stays here, where
          it can be looked at without a tap. */}
      {current.media !== null && !artworkInBar ? (
        <QuestionArtwork media={current.media} heightPx={artworkPx} />
      ) : null}

      {/* Question + options */}
      <fieldset className="min-w-0" disabled={isChecking}>
        {/* `short:` holds the phone sizes on a landscape phone: 20px glyphs on
            1.625 leading are a desktop's, and this screen has 393px of height.
            The GLYPHS are not shrunk below the phone size — `text-lg` is the
            same 18px a portrait phone gets.

            `short:max-w-none` — the 62ch reading cap is right for a desktop
            column and wrong for a phone held sideways. Measured at 852x393: the
            legend was 670px inside an 804px card, so 134px of the widest screen
            the product runs on was doing nothing while the question below it
            wrapped to five lines. The cap stays everywhere it is a cap.

            THE FADE IS THE AFFORDANCE, and it is only drawn when the box is
            actually clamped. A question cut off mid-line with nothing to say so
            reads as a rendering fault, not as „there is more" — the same
            argument that took the rounded corner off the card's physical edge.
            It washes the box's 12px tail padding, not a line of type, so
            scrolling to the end still shows the last line clean. */}
        {/* `narrow-tall:relative` is the portrait twin of `short:relative`: it
            is what the „there is more" fade is positioned against. Without it
            the fade would be absolute against the card and wash the wrong
            box — which is why the twins are added as a set, never one at a
            time (questionBudget.ts PHONE_FOLD_QUERY says the same in JS). */}
        <legend className="max-w-[62ch] text-lg font-bold leading-snug text-foreground narrow-tall:relative short:relative short:max-w-none short:text-lg short:leading-snug sm:text-xl sm:leading-relaxed">
          <span
            ref={questionBoxRef}
            data-question-box
            // `overscroll-contain`: a flick that runs out of question text must
            // not then scroll the page out from under the answers.
            //
            // THE TAIL PADDING IS CONDITIONAL, and the first cut of this was
            // not. `short:pb-3` on every question spends 12px of a 393px screen
            // on 1 013 four-option items that never needed it — measured, it
            // put 2–4px of scroll back onto five questions that had just been
            // cleared. It is only there to give the fade something to wash that
            // is not a line of type, so it only exists when the fade does.
            className={`block narrow-tall:overflow-y-auto narrow-tall:overscroll-contain short:overflow-y-auto short:overscroll-contain ${
              questionMaxPx === null ? "" : "narrow-tall:pb-3 short:pb-3"
            }`}
            style={questionMaxPx === null ? undefined : { maxHeight: questionMaxPx }}
          >
            {current.textBg}
          </span>
          {questionMaxPx === null ? null : (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-3 bg-gradient-to-t from-surface to-transparent narrow-tall:block short:block"
            />
          )}
        </legend>
        {/* `short:hidden` — on a landscape phone this line moves into the action
            bar as a pill, next to the readouts that already live there. It is
            22px of the ~59 the six-option worst case is short by, and it is the
            same move the exam runner already made with its own „Всички верни".
            Exactly one of the two is in the accessibility tree at any viewport. */}
        {current.type === "multi" ? (
          <p className="mt-1.5 text-xs font-bold text-accent short:hidden sm:mt-2">
            Избери всички верни отговори.
          </p>
        ) : null}
        {/* TWO COLUMNS WHEN THE SCREEN IS WIDE AND SHORT, i.e. a phone held
            sideways. `short:sm:` is exactly that pair of conditions and nothing
            else: a portrait phone (narrow) keeps one column, a desktop (tall)
            keeps one column. Four options stop being four 44px rows and become
            two, which is 50px back out of 393 — the difference between the
            answers being on the screen and being under it. There is room for it
            horizontally: the card is ~820px wide in landscape and an option
            row's text column was measured at 285px on a portrait phone. */}
        {/* `short:mt-1 narrow-tall:mt-1` — 4px, and on the Android floor 4px is
            the difference between a nudge and clean. This is the gap between
            the question and the first answer on a screen where the question,
            the answers and the action bar are the ONLY three things; 8px of it
            was a desktop measure inherited by a phone. */}
        <ul
          className={
            signGrid
              ? `mt-2 grid grid-cols-2 gap-1.5 short:mt-1 short:gap-1.5 narrow-tall:mt-1 sm:mt-4 sm:gap-2.5 ${signGridColumns}`
              : `mt-2 flex flex-col gap-1.5 short:mt-1 short:gap-1.5 narrow-tall:mt-1 short:sm:grid sm:mt-4 sm:gap-2.5 ${shortOptionColumns}`
          }
        >
          {current.options.map((option, optionIndex) => {
            const isSelected = selected.includes(option.id);
            const isCorrectOption =
              result !== null && result.correctOptionIds.includes(option.id);
            const isWrongPick = result !== null && isSelected && !isCorrectOption;

            let stateClasses =
              "border-border bg-surface-2/50 hover:border-border-strong hover:bg-surface-2";
            if (result === null) {
              if (isSelected)
                stateClasses =
                  "border-accent bg-accent/10 shadow-glow-sm motion-safe:scale-[1.01]";
            } else if (isCorrectOption) {
              stateClasses =
                "border-success bg-success/10 shadow-[0_0_18px_-6px_var(--success)] motion-safe:scale-[1.01]";
            } else if (isWrongPick) {
              stateClasses = "border-danger bg-danger/10";
            } else {
              stateClasses = "border-border opacity-55";
            }

            if (signGrid) {
              // Sign-identification: a tappable picture tile per option. The
              // whole tile is the label; textBg stays the accessible name.
              return (
                <li key={option.id} className="min-w-0">
                  <label
                    className={`flex h-full flex-col items-center gap-1.5 rounded-xl border p-2 transition duration-200 ease-out focus-within:ring-2 focus-within:ring-accent/50 motion-reduce:transition-none motion-reduce:transform-none sm:gap-2 sm:p-3 ${stateClasses} ${
                      result === null ? "cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <input
                      type={current.type === "single" ? "radio" : "checkbox"}
                      name={`practice-${current.id}`}
                      value={option.id}
                      checked={isSelected}
                      onChange={() => toggleOption(option.id)}
                      disabled={result !== null}
                      className="sr-only"
                    />
                    <span className="flex w-full items-center justify-between">
                      <span
                        aria-hidden
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-hair bg-surface font-mono text-[11px] font-bold text-muted"
                      >
                        {optionIndex + 1}
                      </span>
                      {isCorrectOption ? (
                        <IconCheck aria-hidden className="h-4 w-4 text-success" />
                      ) : isWrongPick ? (
                        <IconX aria-hidden className="h-4 w-4 text-danger" />
                      ) : null}
                    </span>
                    {option.media !== null ? (
                      <SignFace
                        signRef={option.media.signRef}
                        altBg={option.textBg}
                        className="h-20 w-20 sm:h-24 sm:w-24"
                      />
                    ) : (
                      <span className="flex min-h-20 items-center text-center text-sm leading-relaxed">
                        {option.textBg}
                      </span>
                    )}
                    {isCorrectOption ? (
                      <span className="text-[11px] font-bold text-success">
                        Верен отговор
                      </span>
                    ) : isWrongPick ? (
                      <span className="text-[11px] font-bold text-danger">
                        Твоят избор
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            }

            return (
              <li key={option.id}>
                {/* THE OPTION ROW, AND WHERE ITS PIXELS ACTUALLY WENT.
                    Every previous pass at the fold traded VERTICAL padding and
                    ran out of room. The real cost is HORIZONTAL: at 393px the
                    card column is 337px and this row spent 64 of them — 19 % —
                    on furniture before a single character of the answer
                    (px-4 = 32, the tick box 16, two gap-3 = 24, the ordinal
                    badge 24). A narrower text column is more wrapped lines, and
                    a line costs 23px four times over.

                    So on phones the ordinal badge is gone and the paddings
                    tighten: the answer text column goes 233px -> 285px, +22 %,
                    which is roughly one line back on any option that wrapped to
                    four — WITHOUT touching the 14px the seventeen-year-old is
                    reading. The badge is not a loss: it exists to label the
                    1–9 keyboard shortcuts, and the line that explains those is
                    itself `md:block`. It returns from `sm` up with the
                    keyboard.

                    `min-h-11` (44px) replaces py-3 as the guarantee that the
                    row is thumb-sized — it is the property that actually
                    matters, stated directly instead of inferred from padding.

                    AND IT IS WHAT MAKES THE PHONE PADDINGS SPENDABLE. On the
                    360-wide Android the row padding is the only furniture that
                    repeats once per answer, so it is the only one worth more
                    than a rounding error: `short:py-1.5` and `narrow-tall:py-2`
                    take 4px off each row, which is 24px on a six-option item in
                    portrait and 12px on a three-row landscape grid. Nothing
                    shrinks below the thumb guarantee — `min-h-11` still floors
                    every row at 44px, and the sweep re-checks every control on
                    every row (row C6's „0 controls under 44px"): the smallest
                    row this produces on any of the four profiles is exactly 44.
                    The 14px the seventeen-year-old is reading is untouched. */}
                <label
                  className={`flex min-h-11 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition duration-200 ease-out focus-within:ring-2 focus-within:ring-accent/50 motion-reduce:transition-none motion-reduce:transform-none short:gap-2.5 short:px-3 short:py-1.5 narrow-tall:py-2 sm:gap-3 sm:px-4 sm:py-3.5 ${stateClasses} ${
                    result === null ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  <CheckControl
                    type={current.type === "single" ? "radio" : "checkbox"}
                    name={`practice-${current.id}`}
                    value={option.id}
                    checked={isSelected}
                    onChange={() => toggleOption(option.id)}
                    disabled={result !== null}
                    className="mt-1"
                  />
                  <span
                    aria-hidden
                    // `short:hidden`: it labels the 1–9 keyboard shortcuts, and
                    // a phone held sideways has no keyboard either. 24px of
                    // horizontal furniture back, in the orientation where the
                    // option list is two columns wide.
                    className="mt-0.5 hidden h-6 w-6 shrink-0 items-center justify-center rounded-md border border-hair bg-surface font-mono text-[11px] font-bold text-muted short:hidden sm:flex"
                  >
                    {optionIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1 leading-[1.45] sm:leading-relaxed">
                    {option.textBg}
                  </span>
                  {isCorrectOption ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-success">
                      <IconCheck className="h-4 w-4" />
                      Верен отговор
                    </span>
                  ) : null}
                  {isWrongPick ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-danger">
                      <IconX className="h-4 w-4" />
                      Твоят избор
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {/* Feedback — the live region stays mounted so the update is announced.
          Verdict + mastery stay in-card; the why-panel teaches beside (lg)
          or right below (mobile — the honest bottom section, not a sheet). */}
      {/* `-my-2.5` WHILE EMPTY — a 20px bug, and the first cut of it fixed HALF.
          This live region must stay MOUNTED before the first answer or the
          verdict is never announced, but an empty flex child still takes a
          `gap-2.5` on BOTH sides: 20px spent on a zero-height box, every
          question, in the orientation with the least room. `short:-mt-2.5`
          cancelled exactly one of the two, on the reasoning that the bar's
          `mt-auto` eats the other — which is true only while there is SLACK
          above the bar. On the questions this row is about there is none, and
          the surviving 10px was the entire overhang on q-vehicle-063 and
          q-vehicle-056 at 780x360 (11px of document scroll, nothing hidden) and
          half of q-krastovishta-062's at 360x780. Cancelling both takes those
          to zero.
          `narrow-tall:` because the bug was never landscape-only — portrait
          simply had a phone wide enough to absorb it. `display:none` would have
          been simpler and would have silenced the announcement. */}
      <div
        aria-live="polite"
        className={result === null ? "short:-my-2.5 narrow-tall:-my-2.5" : ""}
      >
        {result !== null ? (
          <div className="flex flex-col gap-3">
            <VerdictStrip result={result} conceptTitleBg={current.conceptTitleBg} />
            {!isDesktop && panelModel !== null ? (
              <WhyPanel key={current.id} model={panelModel} />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Actions.
          On phones this is a STICKY footer inside the card (`max-sm:sticky
          bottom-0`, pulled out to the card edges with negative margins). It is
          the fix for the second half of the founder's complaint: even when the
          options fit, „Провери" sat 90–280px below the fold on every single
          question, so confirming an answer cost a scroll — and after answering
          the why-panel pushed „Напред" further still. Sticky, it is always one
          tap. Desktop keeps the plain in-flow row. */}
      {/* `max-sm:mt-auto short:mt-auto` — WHAT THE RECLAIMED 37.7% IS FOR.
          Now that the card reaches the bottom of the phone, `margin-top: auto`
          in a flex column puts this bar hard against that edge and leaves the
          slack ABOVE it, between the last answer and the bar. That slack is not
          waste: it is exactly the room the why-panel needs, so answering fills
          it instead of shoving the whole layout down. And the primary control
          of the most repeated action in the product ends up where a thumb
          already is rather than floating in the middle of the screen.

          The `short:` copies of the pin are the same bar on a phone held
          sideways, where 393px of height makes it matter more, not less. */}
      {/* `py-1.5` rather than `py-2` on a phone: 4px, and the FOLD IS THE TOP OF
          THIS BAR, so every pixel taken off its padding is a pixel handed back
          to the answers above it — the only furniture in this file that pays
          twice. „Провери" is 45px on its own, so the bar is 57px and the
          control is still over the 44px floor.

          THE HOME INDICATOR IS PAID FOR ONCE, BY <body>, AND THIS BAR USED TO
          PAY FOR IT AGAIN. It carried
          `[padding-bottom:calc(0.375rem+env(safe-area-inset-bottom))]`, which
          is correct for a `fixed` surface — those resolve against the viewport
          — but this bar is `sticky` inside the card, inside <main>, inside
          <body>, and globals.css already pads <body> by exactly that inset.
          Charged twice it is not safety, it is 34px of dead glass in portrait
          and 21px in landscape, taken off the answers directly above it.

          MEASURED, WebKit, iPhone 16 with the real insets emulated
          (tools/mobile/lib/insets.mjs), before and after on the same page: the
          lowest control in this bar sat 41px above the top of the home-indicator
          band in portrait and 28px in landscape; it now sits 7px above it,
          which is the 6px of `py-1.5` this comment always claimed. The bar's
          bottom edge lands on <body>'s padding, so the band itself is still
          nobody's to paint on. Worth 34px / 21px back to the answers on every
          question, and it took `q-vehicle-058` in the landscape exam from 18px
          of document scroll to zero. */}
      <div className="relative flex flex-wrap items-center gap-3 max-sm:sticky max-sm:bottom-0 max-sm:z-20 max-sm:-mx-4 max-sm:-mb-3 max-sm:mt-auto max-sm:rounded-b-none max-sm:border-t max-sm:border-hair max-sm:bg-surface/95 max-sm:px-4 max-sm:py-1.5 max-sm:backdrop-blur short:sticky short:bottom-0 short:z-20 short:-mx-4 short:-mb-3 short:mt-auto short:rounded-b-none short:border-t short:border-hair short:bg-surface/95 short:px-4 short:py-1.5 short:backdrop-blur">
        {/* The phone instrument strip: the session's progress as a 2px rule
            along the bar's lit top edge, and the readouts beside the button. */}
        <div
          role="progressbar"
          aria-label="Напредък в тренировката"
          aria-valuemin={0}
          aria-valuemax={questions.length}
          aria-valuenow={answeredCount}
          className="absolute inset-x-0 top-0 h-[2px] overflow-hidden bg-surface-2 short:block sm:hidden"
        >
          <div
            className="h-full bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
        {/* THE WAY OUT, ON A PHONE HELD SIDEWAYS.
            A landscape phone drops the page's header row entirely — it is the
            one viewport where a 44px title band costs more than the founder's
            85% budget has to give (the app topbar is already 12.2% of it). The
            link it carried does NOT get dropped with it: it moves here, into
            the bar the thumb is already on, and grows from a 16px-tall line of
            text into a 44px control on the way. `short:` only, so a portrait
            phone still gets it in the header where it belongs and nobody sees
            it twice. */}
        <Link
          href="/theory"
          className="btn-ghost hidden min-h-11 px-3 py-2 text-[13px] short:inline-flex"
        >
          ← Теми
        </Link>
        {/* The diagram/sign opener, on a phone held sideways, once it has
            stopped being a picture. Same component and the same full-screen
            viewer — only the mount point moves, so there is exactly one dialog
            and one `open` state. `w-auto shrink-0` REPLACES the block's
            `block w-full`; appending would leave two `w-*` utilities fighting
            over stylesheet order. */}
        {artworkInBar ? (
          <QuestionArtwork
            media={current.media}
            heightPx={artworkPx}
            buttonClassName="inline-block w-auto shrink-0"
          />
        ) : null}
        {result === null ? (
          <button
            type="button"
            onClick={check}
            disabled={selected.length === 0 || isChecking}
            className="btn-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
          >
            {isChecking ? "Проверявам…" : "Провери"}
          </button>
        ) : (
          <button type="button" onClick={next} className="btn-accent">
            {isLast ? "Виж резултата" : "Напред"}
            <IconArrowRight className="h-4 w-4" />
          </button>
        )}
        {error !== null ? (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        ) : null}

        {/* The multi-answer warning, on a phone held sideways. Its in-card
            twin is `short:hidden`; this one is `short:inline-flex`, so the
            student is told exactly once and the card gets its 22px back. */}
        {current.type === "multi" ? (
          <span className="hidden shrink-0 items-center rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent short:inline-flex">
            Всички верни
          </span>
        ) : null}

        {/* Phone readouts, right of the button: which question, how many right,
            what today's free quota is at, and what this one is worth. */}
        <p
          aria-hidden
          className="ml-auto flex items-center gap-1.5 font-mono text-[11px] font-bold tabular-nums text-muted short:flex sm:hidden"
        >
          <span className="text-foreground">{index + 1}</span>/{questions.length}
          {answeredCount > 0 ? (
            <span className="text-accent-2">· {correctCount}✓</span>
          ) : null}
          {quota !== null ? (
            <span>
              ·{" "}
              <span className="text-accent">
                {Math.min(quota.limit, quota.usedToday + answeredCount)}
              </span>
              /{quota.limit}
            </span>
          ) : null}
          <span className={`rounded-full px-1.5 py-0.5 ${badge.className}`}>
            {current.points} т.
          </span>
        </p>

        {/* `short:hidden`: a phone held sideways is wide enough to trip `md`
            and has no keyboard to shortcut with. Telling a student to press
            „1" on a touch screen is a lie, and it costs a row. */}
        <p className="ml-auto hidden font-mono text-[11px] text-muted short:hidden md:block">
          Клавиши 1–{Math.min(current.options.length, 9)} избират отговор ·
          Enter потвърждава
        </p>
      </div>
    </section>

    {/* THEO-2 founder ruling: the why-panel as a SIDE PANEL ~20% of the
        viewport width on desktop (min-width keeps it readable), sticky so
        the explanation stays in view over long option lists. Rendered even
        before the first answer (idle hint) so the card never jumps. */}
    <aside
      aria-label="Защо-панел"
      className="hidden lg:sticky lg:top-6 lg:block lg:w-[20vw] lg:min-w-[250px] lg:shrink-0"
    >
      <div aria-live="polite">
        {isDesktop && panelModel !== null ? (
          <WhyPanel key={current.id} model={panelModel} />
        ) : (
          <WhyPanelIdle />
        )}
      </div>
    </aside>
    </div>
  );
}

/* ----------------------------------------------------------- feedback */

/**
 * Slim in-card verdict: correct/wrong + the mastery move. The TEACHING
 * (explanation, citations, replay) lives in the why-panel — the founder rule
 * "never a bare Correct/Wrong" is satisfied by the pair, with the panel
 * directly below this strip on mobile and beside the card on desktop.
 */
function VerdictStrip({
  result,
  conceptTitleBg,
}: {
  result: PracticeSubmitResult;
  conceptTitleBg: string;
}) {
  const before = toPct(result.masteryBefore);
  const after = toPct(result.masteryAfter);
  const delta = after - before;

  return (
    <div
      className={`rounded-xl border p-3 sm:p-4 ${
        result.correct
          ? "border-success/40 bg-success/10"
          : "border-danger/40 bg-danger/10"
      }`}
    >
      <p
        className={`flex items-center gap-2 font-display text-sm font-extrabold ${
          result.correct ? "text-success" : "text-danger"
        }`}
      >
        {result.correct ? (
          <IconCheck className="h-5 w-5" />
        ) : (
          <IconX className="h-5 w-5" />
        )}
        {result.correct ? "Правилен отговор!" : "Грешен отговор"}
      </p>
      <p className="mt-2 font-mono text-[11px] font-semibold text-muted">
        Усвояване на „{conceptTitleBg}“: {before}% → {after}%{" "}
        <span className={`font-bold ${deltaClass(delta)}`}>
          ({formatDelta(delta)})
        </span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ summary */

interface ConceptSummary {
  conceptId: string;
  titleBg: string;
  topicSlug: string | null;
  topicTitleBg: string | null;
  before: number;
  after: number;
  correct: number;
  total: number;
}

function SessionSummary({ answers }: { answers: AnswerRecord[] }) {
  const router = useRouter();
  const [isRestarting, startRestarting] = useTransition();

  const total = answers.length;
  const correctCount = answers.reduce((n, a) => n + (a.correct ? 1 : 0), 0);
  const ratio = total === 0 ? 0 : correctCount / total;

  const concepts = useMemo<ConceptSummary[]>(() => {
    const byId = new Map<string, ConceptSummary>();
    for (const a of answers) {
      const row = byId.get(a.conceptId);
      if (row === undefined) {
        byId.set(a.conceptId, {
          conceptId: a.conceptId,
          titleBg: a.conceptTitleBg,
          topicSlug: a.topicSlug,
          topicTitleBg: a.topicTitleBg,
          before: a.masteryBefore,
          after: a.masteryAfter,
          correct: a.correct ? 1 : 0,
          total: 1,
        });
      } else {
        row.after = a.masteryAfter;
        row.correct += a.correct ? 1 : 0;
        row.total += 1;
      }
    }
    return [...byId.values()];
  }, [answers]);

  const weakest =
    concepts.length > 0
      ? concepts.reduce((min, c) => (c.after < min.after ? c : min))
      : null;

  const headline =
    ratio >= 0.8 ? "Отлична работа!" : ratio >= 0.5 ? "Добър напредък!" : "Продължавай — струва си.";
  const note =
    ratio >= 0.8
      ? "Движиш се уверено към изпита."
      : ratio >= 0.5
        ? "Прегледай обясненията на грешките — там е следващият скок."
        : "Всяка грешка тук е една по-малко на изпита.";

  return (
    <section
      aria-labelledby="session-summary-title"
      className="card mx-auto flex w-full max-w-2xl flex-col gap-6 p-5 sm:p-8"
    >
      <header className="flex flex-col items-center text-center">
        <h2
          id="session-summary-title"
          className="font-display text-xl font-black sm:text-2xl"
        >
          {headline}
        </h2>
        <p className="mt-1 max-w-[52ch] text-sm text-muted">{note}</p>
        <div className="mt-5">
          <Gauge
            value={Math.round(ratio * 100)}
            max={100}
            unit="% верни"
            size={168}
            tone="auto"
            label=""
            ariaLabel={`Резултат: ${correctCount} от ${total} верни отговора`}
          />
        </div>
        <p className="mt-3 text-sm font-bold tabular-nums text-muted">
          <span
            className={
              ratio >= 0.8 ? "text-success" : ratio >= 0.5 ? "text-warning" : "text-danger"
            }
          >
            {correctCount}
          </span>
          <span> / {total} </span>
          <span className="text-xs font-semibold uppercase tracking-wide">
            верни отговора
          </span>
        </p>
      </header>

      {concepts.length > 0 ? (
        <div>
          <h3 className="hud-label">Промяна в усвояването</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {concepts.map((c) => {
              const before = toPct(c.before);
              const after = toPct(c.after);
              const delta = after - before;
              return (
                <li
                  key={c.conceptId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2/50 px-4 py-3 transition-colors hover:border-border-strong motion-reduce:transition-none"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" title={c.titleBg}>
                      {c.titleBg}
                    </p>
                    <p className="text-xs text-muted">
                      {c.correct}/{c.total} верни
                    </p>
                  </div>
                  <p className="font-mono text-sm font-bold tabular-nums text-muted">
                    {before}% → <span className="text-foreground">{after}%</span>{" "}
                    <span className={deltaClass(delta)}>({formatDelta(delta)})</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {weakest !== null && weakest.after < 0.8 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <IconTarget className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <p className="text-sm leading-relaxed">
              Най-слабото ти място от тази тренировка:{" "}
              <strong>{weakest.titleBg}</strong>
              {weakest.topicTitleBg !== null ? (
                <> (тема „{weakest.topicTitleBg}“)</>
              ) : null}
              .
            </p>
          </div>
          {weakest.topicSlug !== null ? (
            <Link
              href={`/theory/practice?topic=${weakest.topicSlug}`}
              className="btn-ghost shrink-0 px-4 py-2 text-xs"
            >
              Тренирай темата
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => startRestarting(() => router.refresh())}
          disabled={isRestarting}
          className="btn-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
        >
          {isRestarting ? "Подготвям…" : "Нова тренировка"}
        </button>
        <Link href="/theory" className="btn-ghost">
          Към темите
        </Link>
        <Link href="/dashboard" className="btn-ghost">
          Начало
        </Link>
      </div>
    </section>
  );
}
