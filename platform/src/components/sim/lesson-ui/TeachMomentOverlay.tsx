"use client";

/**
 * Teach-moment overlay (A9) — the visible half of teach-first-then-grade.
 *
 * The first time a driver meets a teachable scenario, the lesson engine emits
 * a TeachMoment instead of a drive-by toast (doc 65 §5, founder-approved:
 * first-encounter mistakes PAUSE the sim with a mini-lesson). The shell
 * freezes physics (the proven MicroQuizOverlay mechanism) and this card shows
 * the violation title, the catalog's authored law-cited WHY (ADR-002 — no
 * free-form AI text), a category pictogram, and what a repeat would cost.
 *
 * DISMISSAL (founder review 2026-07-28 — „everytime a mistake when driving
 * pops up that the belt is not on … it only makes the user nervous because most
 * of the times he forgets and than he has to click on the screen"):
 *
 *  - SPACE resumes, and so does Enter. Space is the thumb key every driver
 *    already rests on; Enter was the only binding and it was printed in 11 px
 *    grey under the button, below the fold on a phone. The listener runs in the
 *    WINDOW CAPTURE phase and stops propagation, because Space is also the
 *    parking-brake toggle (CabinControls listens on window, bubble phase, and
 *    is NOT muted during a pause) — dismissing a warning must never yank the
 *    handbrake as a side effect.
 *  - The affordance is VISIBLE: a key hint sits inside the button itself, not
 *    as a footnote that scrolls away.
 *  - On a phone there is no Space at all, so the acknowledge control is a
 *    full-width, thumb-height button PINNED to the bottom of the card (sticky)
 *    — reachable without scrolling the modal, which is what actually happened
 *    on a 390 px screen before this.
 *
 * A mistake cluster merges into ONE pause: the shell queues the moments and
 * this card pages through them (`remaining` shows the queue depth).
 * Safety note: опасна/terminating mistakes never reach this overlay — the
 * engine grades them from the first encounter with a non-blocking toast, so a
 * modal never interrupts evasive handling (see lessons/engine.ts applyTick).
 *
 * ---------------------------------------------------------------------------
 * `compact` — THE BOTTOM SHEET (founder review 2026-07-28, second pass).
 *
 * Verbatim: the teach hints are „each almost 50% of the screen when popped
 * which is also unacceptable". Measured on the 844×390 landscape profile it was
 * worse than he thought: `absolute inset-0` meant 100 % of the scene box —
 * 72.8 % of the entire viewport — and the card was laid straight over the
 * status dashboard, which is founder complaint #3 („two overlays fighting for
 * one strip"). A student who had just been interrupted mid-drive could see
 * neither the road nor their own speed.
 *
 * Compact keeps every word and throws away the furniture:
 *   · a SHEET, not a modal. It rises from the bottom edge and stops ABOVE the
 *     instrument band (`bottom: var(--sim-dash-h)`), so the two can never
 *     overlap again — the offset is the band's own height, not a guess.
 *   · NO full-screen scrim. The drive is frozen by the shell already; dimming
 *     the road as well just hides the situation being explained.
 *   · the 96 px pictogram STAGE is dropped (the pictogram itself survives as a
 *     20 px glyph in the header) and the explanation is clamped to two lines
 *     with „Повече" opening the rest in place.
 *
 * THEO-4 („no bare correct/wrong, ever") is the reason for the exact split.
 * What is on screen WITHOUT any tap: the mistake's title, the authored
 * law-cited WHY (two lines of it), the lawRef chip, and the severity. What
 * „Повече" adds: the remainder of the explanation and the repeat-cost stake.
 * The card never degrades to a verdict — it degrades to a shorter explanation
 * with the rest one thumb away.
 *
 * ---------------------------------------------------------------------------
 * WHICH POINTS (founder, photographed at t=22 of his own drive).
 *
 * This card said „При повторение: −10 т." beside a chip reading only „ЗДвП
 * чл. 21, ал. 1", and he read it as his DRIVING LICENCE being docked ten
 * контролни точки. Unqualified „точки" means exactly that to a Bulgarian, and
 * the chip made it worse rather than better: чл. 21 sets the SPEED LIMIT — the
 * rule he broke — and says nothing at all about a ten-point mark. That comes
 * from Наредба № 38, приложение № 5, т. 10, б. „в“.
 *
 * So the number now carries its scale (`minusPointsBg("exam", …)`, the one
 * formatter in `modules/sim/rules/scales.ts`), the clause it comes out of is
 * named next to it, the citation chip is labelled „правило" so it stops
 * impersonating the source of the mark, and one sentence says what these points
 * are not. The result screen was repaired first; this is the same repair on the
 * screen he actually meets first.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  IconBolt,
  IconBook,
  IconGear,
  IconShield,
  IconTarget,
  IconWheel,
} from "@/components/icons";
import type { TeachMoment } from "@/modules/sim/lessons";
import {
  EXAM_POINTS_SHORT_NOTE_BG,
  examMarkCitationBg,
  minusPointsBg,
} from "@/modules/sim/rules";
import { OVERLAY_SCRIM_CLASS } from "./playArea";

/** No Space bar, no hover: the card shows a big tap target instead of a key. */
function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(hover: none)").matches === true || navigator.maxTouchPoints > 0;
}

/* ───────────────────────────────────────────────────────────────────────────
   THE TEACHING CARDS SAY WHEN THEY CONTINUE BELOW THE FOLD
   — catalogue sweep 161, the teaching-surfaces lane, 2026-08-19.
   ───────────────────────────────────────────────────────────────────────────

   Filed against these surfaces over and over, in words that all name the same
   missing thing: «cut off mid-sentence by the bottom of its own panel with no
   scroll or expand affordance» (sc-signal-response/pc-right/04-t044s), «sliced
   horizontally by the card's bottom edge, and the tail of the sentence — the
   part that says WHY it was right — is unreachable» (sc-pe-parked-row-scan/
   pc-right/04-t039s), «truncated mid-sentence at the panel edge … the
   consequence framing is cut exactly where it becomes informative»
   (sc-turn-left-oncoming/pc-wrong/04-t028s). Those three frames are the
   HudToasts column, not this file — routed on, see the lane report — but the
   defect they name is structurally present here too and was unguarded:

     · `OVERLAY_SCRIM_CLASS` scrolls, so a card taller than the stage was
       always REACHABLE. What it was not is ANNOUNCED. WebKit — the founder's
       engine — paints an overlay bar only DURING a scroll, and the sweep's own
       harness runs Chromium with `--hide-scrollbars`; neither the student nor
       the instrument could see one.
     · `MistakeConsequenceOverlay` had nothing at all: no height bound, no
       inner scroller and no pinned action, on a card that is `max-w-3xl`, two
       columns, a media block and eight paragraphs — and, unlike this card, it
       renders on the PHONE too (the shell gates this one behind `!compact`,
       that one behind nothing). Its «Сега опитай правилно →», the entire point
       of THEO-3 mistake mode, sat below a fold nothing announced.

   THE SHAPE OF THE ANSWER, and it is the shell's, landed the same day for the
   debrief scrim: a measured sentence is true on every engine and in every
   screenshot, where a scrollbar is true on neither.

   WHY THE ARITHMETIC IS RESTATED HERE. `LessonPlayShell` exports the identical
   `scrollRemainingPx`, and this file cannot import it: the shell imports both
   teaching overlays, so the edge would close a cycle. One copy lives here and
   `MistakeConsequenceOverlay` imports THIS one, so the rule has two homes in
   the tree and not three. Lifting both into a shared sibling module touches
   `LessonPlayShell.tsx` and its lane's open test file — routed, not done here.

   Same shape as the shell's and as `rowsBelowFold`'s: `clientHeight <= 0` is
   „not laid out yet", not „everything is hidden", or the line flashes on every
   mount — and a line that is always on is the «↓ ОЩЕ 6 РЕДА» badge this same
   sweep filed twice for sitting on the sentence it was counting. */

/**
 * Sub-pixel slack, px. Fractional line boxes stack, so a scroller the student
 * HAS read to the end reports 1–3 px left over on both engines; 4 px is past
 * that and still well under one 11 px line, which is the smallest thing that
 * could be a lost sentence.
 */
export const TEACH_FOLD_SLACK_PX = 4;

/** px of content below the fold, 0 when there is nothing left to read. */
export function foldRemainingPx(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): number {
  if (clientHeight <= 0) return 0;
  const left = scrollHeight - clientHeight - scrollTop;
  return left <= TEACH_FOLD_SLACK_PX ? 0 : Math.round(left);
}

/**
 * The measuring half: a ref for the card's own reading region, the scroll
 * handler, and a boolean.
 *
 * The MEASUREMENT is px and the STATE is a boolean, deliberately — the handler
 * runs on every scroll event and the number changes on every one of them, so
 * storing it would re-render the card per event for a line whose text never
 * changes. React bails out on an identical value, so this re-renders exactly
 * twice: when the fold appears and when the student reaches the end.
 */
export function useFoldWatch(): {
  scrollRef: RefObject<HTMLDivElement | null>;
  measure: () => void;
  hasMore: boolean;
} {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (el === null) return;
    setHasMore(foldRemainingPx(el.scrollTop, el.clientHeight, el.scrollHeight) > 0);
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    if (typeof ResizeObserver === "undefined") {
      // jsdom / ancient Safari: one reading, and a later growth goes unnoticed.
      // A stale sentence still beats the silence this exists to end.
      measure();
      return;
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // ── AND THE CONTENT, NOT ONLY THE BOX. A ResizeObserver on a scroller
    // fires for changes to the SCROLLER's size, never to what is inside it —
    // and both of these cards grow after they mount: the lazy `MistakeMedia`
    // clip replaces its 144 px placeholder, and this card's own text block
    // reflows when the queue pages to a longer moment. Observing the box alone
    // would report the card as it was before the explanation arrived, i.e.
    // stale in the reassuring direction. `firstElementChild` is the content
    // column, which is why each scroller below wraps its blocks in exactly one.
    const content = el.firstElementChild;
    if (content !== null) ro.observe(content);
    return () => ro.disconnect();
  }, [measure]);
  return { scrollRef, measure, hasMore };
}

/** The line itself, shared by both teaching cards so they cannot drift.
 *  `pointer-events-none` so it can never take a tap meant for the control it
 *  floats over; the scroll it asks for works on the region regardless. */
export function FoldContinuesLine({ children }: { children: string }) {
  return (
    <p
      aria-live="polite"
      className="pointer-events-none sticky bottom-0 z-10 self-center rounded-full border border-border bg-background/95 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-muted"
    >
      {children}
    </p>
  );
}

/** The two declarations the product's other HUD scrollers carry (the briefing
 *  list, the pre-drive checklist, the controls panel, the debrief scrim):
 *  `overflow-y-auto` alone paints nothing at rest in WebKit. */
export const HUD_SCROLLER_CLASS =
  "overflow-y-auto [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]";

const SEVERITY_LABEL: Record<TeachMoment["severity"], string> = {
  opasna: "опасна грешка",
  osnovna: "основна грешка",
  vtorostepenna: "второстепенна грешка",
};

/**
 * Simple diagram slot v1: a category pictogram per violation family. A real
 * illustrated diagram per scenario can replace this map without touching the
 * card layout — the slot is the rounded stage below the header.
 */
const CATEGORY_ICONS: Record<string, typeof IconBook> = {
  // Speed & distance
  SPEEDING_OVER_LIMIT: IconBolt,
  SPEEDING_DANGEROUS: IconBolt,
  SPEED_TOO_FAST_FOR_CONDITIONS: IconBolt,
  FOLLOWING_TOO_CLOSE: IconBolt,
  // Junctions, signs & priority
  STOP_SIGN_NO_FULL_STOP: IconTarget,
  FAILED_TO_YIELD: IconTarget,
  // Lane discipline & maneuvers
  TURN_WITHOUT_INDICATOR: IconWheel,
  LANE_CHANGE_WITHOUT_INDICATOR: IconWheel,
  LANE_CHANGE_WITHOUT_MIRROR_CHECK: IconWheel,
  POOR_LANE_KEEPING: IconWheel,
  NOT_KEEPING_RIGHT: IconWheel,
  WRONG_WAY: IconWheel,
  // Vulnerable road users
  PEDESTRIAN_CROSSING_TOO_FAST: IconShield,
  PEDESTRIAN_NOT_YIELDED: IconShield,
  // Vehicle state & controls
  SEATBELT_OFF_WHILE_MOVING: IconGear,
  HANDBRAKE_LEFT_ON: IconGear,
  HEADLIGHTS_OFF_AT_NIGHT: IconGear,
  HEADLIGHTS_OFF_IN_RAIN: IconGear,
  FOG_LIGHTS_OFF_IN_FOG: IconGear,
};

export function TeachMomentOverlay({
  moment,
  remaining,
  onAcknowledge,
  compact = false,
}: {
  moment: TeachMoment;
  /** Queued teach moments behind this one (a mistake cluster in one pause). */
  remaining: number;
  /** Advance to the next queued card, or resume the drive when none remain. */
  onAcknowledge: () => void;
  /** Phone-shaped viewport: the bottom sheet above the instrument band. */
  compact?: boolean;
}) {
  // Space (and Enter) acknowledges. CAPTURE phase + stopPropagation: Space is
  // the parking-brake toggle on CabinControls' own window listener (bubble
  // phase, live even while paused), so without this a student dismissing the
  // belt warning would also release/engage the handbrake. Capture on `window`
  // runs before the target and before every bubble listener.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code !== "Space" && e.key !== "Enter") return;
      // Enter on a focused button/link is that control's own activation.
      const tag = e.target instanceof HTMLElement ? e.target.tagName : "";
      if (e.key === "Enter" && (tag === "BUTTON" || tag === "A")) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) onAcknowledge();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onAcknowledge]);

  // Touch devices have no Space bar; they get the big button instead of a key
  // hint. Safe as a lazy initializer (the LessonPlayShell grammar): this
  // overlay only ever mounts inside a client-only play session, so there is no
  // SSR pass to mismatch.
  const [touch] = useState(isTouchDevice);
  // Compact only: „Повече" opens the rest of the authored text in place.
  //
  // The open state stores WHICH moment is expanded rather than a boolean, so
  // paging to the next card in a cluster folds back with no effect and no reset
  // render — an expanded sheet inherited by the next mistake would be the
  // half-screen card the founder rejected, arriving by accident.
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const momentKey = `${moment.code}|${moment.titleBg}`;
  const expanded = expandedFor === momentKey;

  const CategoryIcon = CATEGORY_ICONS[moment.code] ?? IconBook;
  // Roomy only — the compact sheet below already bounds itself with
  // `--sim-vh` and scrolls inside its own text block.
  const fold = useFoldWatch();

  if (compact) {
    return (
      <div
        // Positioned, not covering: the sheet's own box IS the dialog, and it
        // stops at the top of the instrument band. `--sim-dash-h` is written by
        // the play shell from the SAME constant the band is sized with, so the
        // two cannot drift apart.
        className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center"
        style={{ bottom: "var(--sim-dash-h, 0px)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="teach-moment-title"
      >
        <section
          // §I20 COMPANION, AND ON A PHONE IT IS THE ONE THAT MATTERS. The
          // scrim §I20 named on this file is the ROOMY branch (:308); a phone
          // takes THIS branch, so the blur a student actually pays for during
          // a teach moment — the most frequent pause in the product — is this
          // one. It is smaller than a full viewport but it is still a
          // `backdrop-filter` over a live canvas, and the fill it was blurring
          // was already 95 % covered. Opaque: same picture, no compositor pass.
          className="pointer-events-auto flex w-full max-w-2xl flex-col gap-1.5 rounded-t-2xl border-x border-t border-accent-2/45 bg-background px-3 pb-2 pt-2"
          // TEACH_SHEET_MAX_FRACTION of the live viewport height. `--sim-vh` is
          // the play shell's measured `visualViewport.height` (see its header
          // on why 100dvh alone is not trustworthy inside iOS Safari), so a
          // fully expanded sheet still cannot reach the half-screen the founder
          // rejected — it scrolls inside itself instead.
          style={{ maxHeight: "calc(var(--sim-vh, 100dvh) * 0.62)" }}
        >
          {/* Header — one line: what this is, how bad, how many are queued. */}
          <div className="flex shrink-0 items-center gap-2">
            <span
              aria-hidden
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent-2/15 text-accent-2"
            >
              <CategoryIcon className="h-3.5 w-3.5" />
            </span>
            <p className="text-[10px] font-black uppercase tracking-wider text-accent-2">
              Учебен момент
            </p>
            <span className="text-[10px] font-semibold text-muted">
              · {SEVERITY_LABEL[moment.severity]}
            </span>
            {remaining > 0 ? (
              <span className="ml-auto shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-muted">
                още {remaining}
              </span>
            ) : null}
          </div>

          {/* The mistake + the authored law-cited WHY. Two lines by default —
              never zero, because a verdict without a reason is the one thing
              THEO-4 forbids. */}
          <div className="min-w-0 shrink overflow-y-auto">
            <h2 id="teach-moment-title" className="text-sm font-extrabold leading-tight">
              {moment.titleBg}
            </h2>
            <p
              className={`mt-0.5 text-xs leading-snug text-foreground ${
                expanded ? "" : "line-clamp-2"
              }`}
            >
              {moment.explanationBg}
            </p>
            {expanded ? (
              <>
                <p className="mt-1.5 text-[11px] leading-snug text-muted">
                  Първа среща — <strong className="text-foreground">не се брои в резултата</strong>.
                  При повторение:{" "}
                  <strong className="text-foreground">{minusPointsBg("exam", moment.points)}</strong>{" "}
                  ({SEVERITY_LABEL[moment.severity]}) по {examMarkCitationBg(moment.severity)}, а
                  повторните грешки тежат още повече (×1.5 / ×2.0).
                </p>
                {/* THE SENTENCE THAT ANSWERS THE MISREADING. He met „−10 т." here,
                    minutes before the result screen, and read it as his licence. */}
                <p className="mt-1 text-[10px] leading-snug text-muted">
                  {EXAM_POINTS_SHORT_NOTE_BG}
                </p>
              </>
            ) : null}
          </div>

          {/* Law ref + the expander + the thumb-sized acknowledge. */}
          <div className="flex shrink-0 items-center gap-2">
            {/* THE CHIP HE PHOTOGRAPHED read „ЗДвП чл. 21, ал. 1" next to a
                10-point mark, and чл. 21 is the SPEED LIMIT — not the source of
                the mark. Labelled „правило", because that is what it is; the
                clause the number comes out of is named with the number itself. */}
            {moment.lawRef ? (
              <span className="shrink-0 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-bold text-muted">
                правило: {moment.lawRef}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setExpandedFor(expanded ? null : momentKey)}
              aria-expanded={expanded}
              className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-muted transition hover:text-foreground"
            >
              {expanded ? "По-малко ▴" : "Повече ▾"}
            </button>
            <button
              type="button"
              onClick={onAcknowledge}
              className="btn-accent ml-auto shrink-0 justify-center px-4 py-2 text-xs"
            >
              Разбрах
              {!touch ? (
                <kbd className="rounded bg-background/30 px-1 py-0.5 font-mono text-[10px] font-bold">
                  Space
                </kbd>
              ) : null}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      // §I20: opaque scrim, no backdrop-filter — see OVERLAY_SCRIM_CLASS.
      className={`absolute inset-0 z-30 ${OVERLAY_SCRIM_CLASS}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="teach-moment-title"
    >
      {/* BOUNDED, so the card can no longer be longer than the stage it is
          drawn in. `max-h-full` is the scrim's own content box (it is
          `absolute inset-0`, so its height is definite), which means the
          browser clips against THIS element and the reading region below is
          the only thing that scrolls — the header keeps the verdict on screen
          and the acknowledgement keeps the way out of it. Before this the
          whole card overflowed the scrim, silently. */}
      <section className="card my-auto flex max-h-full w-full min-h-0 max-w-lg flex-col gap-4 p-5 sm:p-6">
        {/* Header — "paused to teach" */}
        <div className="flex shrink-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-2/15 text-accent-2"
          >
            <IconBook className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="teach-moment-title" className="text-sm font-black leading-tight">
              Учебен момент
            </h2>
            <p className="text-xs text-muted">Пауза — първа среща с тази ситуация</p>
          </div>
          {remaining > 0 ? (
            <span className="ml-auto rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-muted">
              още {remaining}
            </span>
          ) : null}
        </div>

        {/* THE READING REGION — the only part that scrolls, and it says so.
            One element child (the column below), because `useFoldWatch`
            observes `firstElementChild` to notice the card growing. */}
        <div
          ref={fold.scrollRef}
          onScroll={fold.measure}
          className={`flex min-h-0 shrink flex-col ${HUD_SCROLLER_CLASS}`}
        >
          <div className="flex flex-col gap-4">
            {/* Diagram slot — category pictogram (v1; per-scenario art can slot in) */}
            <div
              aria-hidden
              className="flex shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2/60 py-6"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-2/15 text-accent-2">
                <CategoryIcon className="h-9 w-9" />
              </span>
            </div>

            {/* The mistake + the authored law-cited WHY */}
            <div className="min-w-0">
              <h3 className="text-base font-extrabold leading-snug">{moment.titleBg}</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{moment.explanationBg}</p>
              {/* TWO CHIPS, NOT ONE — and this is the founder's photographed defect.
                  He saw „−10 т." beside a single chip reading „ЗДвП чл. 21, ал. 1".
                  чл. 21 sets the SPEED LIMIT: it is the rule he broke, and it is not
                  where the ten comes from. The ten comes from приложение № 5 of
                  Наредба № 38, which nothing on this card had ever said. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {moment.lawRef ? (
                  <span className="inline-block rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-muted">
                    правило: {moment.lawRef}
                  </span>
                ) : null}
                <span className="inline-block rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-muted">
                  оценка: {examMarkCitationBg(moment.severity)}
                </span>
              </div>
            </div>

            {/* The teach-first promise + the stake on repeat */}
            <div className="rounded-xl border border-accent-2/40 bg-accent-2/10 p-4">
              <p className="text-sm leading-relaxed">
                Първа среща — <strong>не се брои в резултата</strong>. При повторение:{" "}
                <strong>{minusPointsBg("exam", moment.points)}</strong> (
                {SEVERITY_LABEL[moment.severity]}), а повторните грешки тежат още повече
                (×1.5 / ×2.0).
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {EXAM_POINTS_SHORT_NOTE_BG}
              </p>
            </div>
          </div>
          {/* THE SENTENCE, not a scrollbar. It names WHAT is below — the
              repeat-cost stake and the note about which points these are —
              because on the frames this lane read, the severed tail was always
              the half that explains, and naming it is the difference between a
              scroll hint and a reason to scroll. */}
          {fold.hasMore ? (
            <FoldContinuesLine>↓ Обяснението продължава — превърти</FoldContinuesLine>
          ) : null}
        </div>

        {/* Acknowledge → resume. STICKY: on a 390 px phone this card is taller
            than the scene box and the button used to sit below the fold — the
            student had to scroll a modal that had just interrupted their drive.
            Pinned to the bottom of the scroll container it is always one thumb
            away, and the key hint rides INSIDE the label so the affordance
            cannot scroll out of sight. */}
        {/* …and since 2026-08-19 it is also `shrink-0` in a BOUNDED column, so
            the pin no longer depends on `sticky` resolving against a scrim
            that may or may not be the scrolling ancestor. */}
        <div className="sticky bottom-0 -mx-5 -mb-5 flex shrink-0 flex-wrap items-center gap-3 rounded-b-xl bg-surface/95 px-5 pb-5 pt-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6">
          <button
            type="button"
            onClick={onAcknowledge}
            className="btn-accent w-full justify-center py-3 text-base sm:w-auto sm:py-2 sm:text-sm"
          >
            Разбрах — продължи
            {!touch ? (
              <kbd className="rounded bg-background/30 px-1.5 py-0.5 font-mono text-[11px] font-bold">
                Space
              </kbd>
            ) : null}
          </button>
          {!touch ? (
            <span className="text-xs text-muted">или натисни Space / Enter</span>
          ) : (
            <span className="text-xs text-muted">Докосни, за да продължиш</span>
          )}
        </div>
      </section>
    </div>
  );
}
