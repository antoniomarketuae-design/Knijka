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
  hasSignOptions,
  QuestionArtwork,
  SignFace,
  useArtworkBudget,
} from "./QuestionMedia";
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
  quota = null,
}: {
  questions: PracticeQuestionDto[];
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
        const submitted = await submitPracticeAnswer(current.id, selected);
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

  // Phase 5: the artwork gives back whatever this card is over the fold by.
  const cardRef = useRef<HTMLElement>(null);
  const artworkPx = useArtworkBudget(
    cardRef,
    current?.id ?? "",
    current?.media != null && result === null,
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

  // THREE columns once there are more than four options, on a phone held
  // sideways only. Measured on the worst six-option item in the bank
  // (q-vehicle-063) at 852x393: three 264px columns give two rows of 109px =
  // 224px, against 240px for three rows of two. A real but MODEST win, not the
  // halving the row count suggests, because a narrower column wraps each option
  // to more lines — recorded because the obvious reading overstates it 5x.
  //
  // Hoisted out of the JSX deliberately: inline, the ternary defeated BOTH
  // source scanners that guard this file (checkControl.test.ts mis-parsed the
  // element's props and mobileFold.test.ts read the closing brace as a
  // concatenation seam). A class string a scanner cannot read is a class string
  // Tailwind might not emit, which is the failure those tests exist to catch.
  const shortOptionColumns =
    current.options.length > 4 ? "short:sm:grid-cols-3" : "short:sm:grid-cols-2";

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
      className="card flex w-full min-w-0 flex-col gap-2.5 p-3 max-sm:-mx-4 max-sm:w-auto max-sm:flex-1 max-sm:rounded-none max-sm:border-x-0 max-sm:px-4 short:-mx-4 short:w-auto short:flex-1 short:gap-2.5 short:rounded-none short:border-x-0 short:p-3 short:px-4 sm:gap-6 sm:p-7 lg:max-w-2xl"
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
          `sm` up this is the same component at the same size as before. */}
      {current.media !== null ? (
        <QuestionArtwork media={current.media} heightPx={artworkPx} />
      ) : null}

      {/* Question + options */}
      <fieldset className="min-w-0" disabled={isChecking}>
        {/* `short:` holds the phone sizes on a landscape phone: 20px glyphs on
            1.625 leading are a desktop's, and this screen has 393px of height.
            The GLYPHS are not shrunk below the phone size — `text-lg` is the
            same 18px a portrait phone gets. */}
        <legend className="max-w-[62ch] text-lg font-bold leading-snug text-foreground short:text-lg short:leading-snug sm:text-xl sm:leading-relaxed">
          {current.textBg}
        </legend>
        {current.type === "multi" ? (
          <p className="mt-1.5 text-xs font-bold text-accent sm:mt-2">
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
        <ul
          className={
            signGrid
              ? "mt-2 grid grid-cols-2 gap-1.5 short:mt-2 short:gap-1.5 sm:mt-4 sm:grid-cols-3 sm:gap-2.5"
              : `mt-2 flex flex-col gap-1.5 short:mt-2 short:gap-1.5 short:sm:grid sm:mt-4 sm:gap-2.5 ${shortOptionColumns}`
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
                    matters, stated directly instead of inferred from padding. */}
                <label
                  className={`flex min-h-11 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition duration-200 ease-out focus-within:ring-2 focus-within:ring-accent/50 motion-reduce:transition-none motion-reduce:transform-none short:gap-2.5 short:px-3 short:py-2 sm:gap-3 sm:px-4 sm:py-3.5 ${stateClasses} ${
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
      <div aria-live="polite">
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
      <div className="relative flex flex-wrap items-center gap-3 max-sm:sticky max-sm:bottom-0 max-sm:z-20 max-sm:-mx-4 max-sm:-mb-3 max-sm:mt-auto max-sm:rounded-b-none max-sm:border-t max-sm:border-hair max-sm:bg-surface/95 max-sm:px-4 max-sm:py-2 max-sm:backdrop-blur max-sm:[padding-bottom:calc(0.5rem+env(safe-area-inset-bottom))] short:sticky short:bottom-0 short:z-20 short:-mx-4 short:-mb-3 short:mt-auto short:rounded-b-none short:border-t short:border-hair short:bg-surface/95 short:px-4 short:py-2 short:backdrop-blur short:[padding-bottom:calc(0.5rem+env(safe-area-inset-bottom))]">
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
