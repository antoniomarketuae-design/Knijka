"use client";

/**
 * Mistake-consequence overlay (THEO-3, doc 64) — the MOMENT of the
 * mistake-experience mode: the targeted wrong action fired (or the student
 * asked for the demonstration), the shell froze physics (the proven
 * teach-pause `paused` mechanism), and this card presents the consequence:
 *
 *   „Какво направи" — the STORED whatWentWrongBg of the template mistake +
 *   the lawRef citation, SIDE BY SIDE with the recorded replay of that same
 *   mistake (MistakeMedia — the real-engine clip when the manifest has one,
 *   the THEO Stage 1 2D canvas as fallback; the WhyPanel component, shared,
 *   no forks), framed by the mistake's OFFICIAL severity class
 *   (опасна/основна/второстепенна — stored in the rules catalog, never
 *   invented). „Сега опитай правилно →" restarts the SAME rung in normal
 *   graded mode (the shell's onStartScenario seam).
 *
 * ADR-002: every teaching string here is either STORED content
 * (whatWentWrongBg, catalog titles/lawRefs) or a FIXED per-class framing
 * constant (UI chrome, like the why-panel headers) — never generated law.
 */

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { IconArrowRight, IconShield } from "@/components/icons";
import { traceUrlForRepoPath } from "@/modules/clips/view";
import type { MistakeDemo, TeachMoment } from "@/modules/sim/lessons";
import {
  COLLISION_TERMINATION_SHORT_BG,
  EXAM_POINTS_SHORT_NOTE_BG,
  examMarkCitationBg,
  gravestViolation,
  minusPointsBg,
  type SeverityClass,
} from "@/modules/sim/rules";
import { OVERLAY_SCRIM_CLASS } from "./playArea";
// The fold instrument lives in `TeachMomentOverlay` — see its header for why
// it is there and not imported from `LessonPlayShell` (the shell imports both
// of these cards, so that edge would close a cycle).
import { FoldContinuesLine, HUD_SCROLLER_CLASS, useFoldWatch } from "./TeachMomentOverlay";

const MistakeMedia = dynamic(() => import("@/components/theory/MistakeMedia"), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="h-36 w-full animate-pulse rounded-xl border border-border bg-surface-2/50 motion-reduce:animate-none"
    />
  ),
});

/** Fixed severity framing („това щеше да е катастрофа/глоба") — UI chrome
 *  keyed by the STORED official class, exported for tests.
 *
 *  2026-08-10 — THE опасна LINE WAS A MISSTATEMENT OF THE LAW, on every one of
 *  the fifteen опасни codes. It read „на изпита прекратява изпита на място",
 *  and only one fault in the catalogue does that: Наредба № 38, чл. 48, ал. 3
 *  ends a practical exam „при повторна намеса на комисията … и при допускане на
 *  ПТП" and reaches nothing else. Not spotting Б2, running a red — those cost
 *  10 наказателни точки and т. 11 allows 9, so they make the exam НЕИЗДЪРЖАН.
 *  Different fact, different provision, different moment. The class-level line
 *  now states the one that is true of the whole class; the termination is a
 *  rider printed only where `ExamMark.terminatesExam` says so. */
export const CONSEQUENCE_FRAMING_BG: Record<SeverityClass, string> = {
  opasna:
    "На пътя това щеше да е катастрофа. Опасна грешка — 10 наказателни точки за самото деяние, а за целия изпит се допускат 9: една такава грешка сама прави изпита неиздържан.",
  osnovna:
    "На пътя това е глоба и реален риск от сблъсък. Основна грешка — на изпита тежи с основни наказателни точки.",
  vtorostepenna:
    "На изпита това е второстепенна грешка — но на пътя точно от такива навици се раждат инцидентите.",
};

const SEVERITY_LABEL_BG: Record<SeverityClass, string> = {
  opasna: "опасна грешка",
  osnovna: "основна грешка",
  vtorostepenna: "второстепенна грешка",
};

export function MistakeConsequenceOverlay({
  demo,
  districtId,
  moment,
  onRetryCorrect,
  onDismiss,
}: {
  /** The targeted template mistake (stored copy + recorded trace). */
  demo: MistakeDemo;
  /** The drill's district (the replay's home map). */
  districtId: string;
  /** The live consequence moment; null = the „Виж демонстрацията" path
   *  (the student never managed the mistake — never a dead end). */
  moment: TeachMoment | null;
  /** „Сега опитай правилно →" — restart the SAME rung, normal graded mode.
   *  Null hides the CTA (no launcher seam — should not happen in practice). */
  onRetryCorrect: (() => void) | null;
  /** Close the overlay and keep driving in the sandbox. */
  onDismiss: () => void;
}) {
  // Enter = the primary CTA (the teach-pause overlay convention).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "Enter") return;
      const tag = e.target instanceof HTMLElement ? e.target.tagName : "";
      if (tag === "BUTTON" || tag === "A") return;
      e.preventDefault();
      if (onRetryCorrect !== null) onRetryCorrect();
      else onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRetryCorrect, onDismiss]);

  // ALL FOUR CITATIONS COME OFF THE GRAVEST FAULT THE CARD SHOWS.
  //
  // They used to come off `codeRefs[0]` (and, on the live path, off whichever
  // targeted code the engine's one-shot latch happened to reach first). Both
  // are authoring accidents, not law: the fast-row demo cites SPEEDING_OVER_
  // LIMIT, PEDESTRIAN_CROSSING_TOO_FAST and COLLISION in the order its lesson
  // tells them, so the card that ends with a child under the bumper badged
  // «второстепенна · −1» with no termination line — and on the live path the
  // badge was decided by a 33-millisecond race between two detectors. Наредба
  // № 38, приложение № 5, т. 10 prices a fault by its CLASS and чл. 48, ал. 3
  // ends the exam for one of them; neither provision knows what order anyone
  // typed. `gravestViolation` is that ordering, and it lives in rules/ because
  // it is a reading of the act, not a component detail.
  //
  // The live moment is folded into the pool rather than preferred over it: its
  // own severity/points/lawRef are read out of this same catalogue, so it can
  // only ever agree — and it can never again UNDER-state the card by being the
  // first thing that fired.
  const gravest = gravestViolation(
    moment !== null ? [moment.code, ...demo.codeRefs] : demo.codeRefs,
  );
  const severity: SeverityClass = gravest?.spec.severityClass ?? "osnovna";
  const lawRef = gravest?.spec.lawRef;
  const points = gravest?.spec.points;
  // Only a ПТП ends the exam (Наредба № 38, чл. 48, ал. 3) — read off the
  // catalogue's own flag rather than inferred from the class, which is exactly
  // the inference the old framing string made and got wrong.
  const terminatesExam = gravest?.spec.terminateSession === true;
  const fold = useFoldWatch();

  return (
    <div
      // §I20: opaque scrim, no backdrop-filter — see OVERLAY_SCRIM_CLASS.
      className={`absolute inset-0 z-30 ${OVERLAY_SCRIM_CLASS}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mistake-consequence-title"
    >
      {/* BOUNDED — 2026-08-19, and this card had none of it.
          Three columns of defence its sibling `TeachMomentOverlay` grew in
          July and this one never did: a height bound, a reading region that
          scrolls, and an action that cannot leave the fold. It is the TALLER
          of the two (`max-w-3xl`, two columns, a lazy media block and eight
          paragraphs) and it is the one that renders on a PHONE — the shell
          gates the teach card behind `!compact` and gates this behind nothing
          — so on a 393 px-tall landscape stage the whole of «Сега опитай
          правилно →», the point of THEO-3 mistake mode, was below a fold
          nothing announced. `max-h-full` resolves against the scrim's content
          box (`absolute inset-0`, definite height), so the card now clips
          against itself and only the middle moves. */}
      <section className="card my-auto flex max-h-full w-full min-h-0 max-w-3xl flex-col gap-4 p-5 sm:p-6">
        {/* Header — the mistake happened (or is being demonstrated). PINNED:
            the severity class and the point cost are the verdict, and THEO-4
            forbids a verdict the student can scroll away from its reason. */}
        <div className="flex shrink-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger"
          >
            <IconShield className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="mistake-consequence-title" className="text-sm font-black leading-tight">
              {moment !== null ? "Какво направи" : "Демонстрация на грешката"}
            </h2>
            <p className="text-xs text-muted">
              Преживей грешката — пауза. Нищо от това не се брои в резултат.
            </p>
          </div>
          {/* THE STAKE, WITH ITS SCALE. This card is a rehearsal — nothing here
              is scored — so the number is what a repeat in a GRADED drive would
              cost on the изпитен лист, and it says which sheet that is. */}
          <span className="ml-auto shrink-0 rounded-full border border-danger/50 bg-danger/10 px-2.5 py-1 text-[11px] font-bold text-danger">
            {SEVERITY_LABEL_BG[severity]}
            {points !== undefined ? ` · ${minusPointsBg("exam", points)}` : ""}
          </span>
        </div>

        {/* THE READING REGION — everything that explains, and the only part
            that moves. One element child (the grid), because `useFoldWatch`
            observes `firstElementChild`: this card GROWS after it mounts, when
            the lazy `MistakeMedia` clip replaces its 144 px placeholder, and a
            fold measured before that arrives is stale in the reassuring
            direction. */}
        <div
          ref={fold.scrollRef}
          onScroll={fold.measure}
          className={`flex min-h-0 shrink flex-col ${HUD_SCROLLER_CLASS}`}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* The stored teaching copy + the citation + the severity framing */}
            <div className="min-w-0">
              <h3 className="text-base font-extrabold leading-snug">{demo.titleBg}</h3>
              {/* STORED what-went-wrong text (ADR-002). */}
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {demo.whatWentWrongBg}
              </p>
              {/* The rule and the mark are two different citations. The chip used
                  to carry only the rule, next to a point figure it does not set. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {lawRef ? (
                  <span className="inline-block rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-muted">
                    правило: {lawRef}
                  </span>
                ) : null}
                {points !== undefined ? (
                  <span className="inline-block rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-muted">
                    оценка: {examMarkCitationBg(severity)}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-3">
                <p className="text-sm leading-relaxed">{CONSEQUENCE_FRAMING_BG[severity]}</p>
                {/* THEO-4: the exam does not merely end — it ends by a named
                    article, and only for this one fault. */}
                {terminatesExam ? (
                  <p className="mt-1.5 text-sm font-semibold leading-relaxed">
                    {COLLISION_TERMINATION_SHORT_BG}
                  </p>
                ) : null}
                {points !== undefined ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    {EXAM_POINTS_SHORT_NOTE_BG}
                  </p>
                ) : null}
              </div>
            </div>

            {/* The consequence visual: the recorded replay of this same
                mistake (MistakeMedia — real-engine clip if produced, the
                Stage 1 2D canvas otherwise; lazy either way). */}
            <div className="min-w-0">
              <p className="hud-label">Погледни отстрани</p>
              <MistakeMedia
                tracePath={traceUrlForRepoPath(demo.traceRef.path)}
                districtId={districtId}
                className="mt-1.5"
              />
            </div>
          </div>

          {/* It names WHAT is below rather than that something is: on this
              card the hidden tail is the stored what-went-wrong copy and the
              severity framing — the only two things here that explain. */}
          {fold.hasMore ? (
            <FoldContinuesLine>↓ Разборът продължава — превърти за обяснението</FoldContinuesLine>
          ) : null}
        </div>

        {/* The retry — the whole point: same rung, this time graded. `shrink-0`
            in a bounded column, so it is on screen from the first frame of the
            pause instead of behind a scroll the student was never told about. */}
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {onRetryCorrect !== null ? (
            <button type="button" onClick={onRetryCorrect} className="btn-accent">
              Сега опитай правилно
              <IconArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button type="button" onClick={onDismiss} className="btn-ghost px-4 py-2 text-xs">
            Продължи в пясъчника
          </button>
          {onRetryCorrect !== null ? (
            <span className="text-xs text-muted">или натисни Enter</span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
