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
 */

import { useEffect, useState } from "react";
import {
  IconBolt,
  IconBook,
  IconGear,
  IconShield,
  IconTarget,
  IconWheel,
} from "@/components/icons";
import type { TeachMoment } from "@/modules/sim/lessons";

/** No Space bar, no hover: the card shows a big tap target instead of a key. */
function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(hover: none)").matches === true || navigator.maxTouchPoints > 0;
}

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
}: {
  moment: TeachMoment;
  /** Queued teach moments behind this one (a mistake cluster in one pause). */
  remaining: number;
  /** Advance to the next queued card, or resume the drive when none remain. */
  onAcknowledge: () => void;
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

  const CategoryIcon = CATEGORY_ICONS[moment.code] ?? IconBook;

  return (
    <div
      className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="teach-moment-title"
    >
      <section className="card my-auto flex w-full max-w-lg flex-col gap-4 p-5 sm:p-6">
        {/* Header — "paused to teach" */}
        <div className="flex items-center gap-3">
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

        {/* Diagram slot — category pictogram (v1; per-scenario art can slot in) */}
        <div
          aria-hidden
          className="flex items-center justify-center rounded-xl border border-border bg-surface-2/60 py-6"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-2/15 text-accent-2">
            <CategoryIcon className="h-9 w-9" />
          </span>
        </div>

        {/* The mistake + the authored law-cited WHY */}
        <div className="min-w-0">
          <h3 className="text-base font-extrabold leading-snug">{moment.titleBg}</h3>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{moment.explanationBg}</p>
          {moment.lawRef ? (
            <span className="mt-3 inline-block rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-muted">
              {moment.lawRef}
            </span>
          ) : null}
        </div>

        {/* The teach-first promise + the stake on repeat */}
        <div className="rounded-xl border border-accent-2/40 bg-accent-2/10 p-4">
          <p className="text-sm leading-relaxed">
            Първа среща — <strong>не се брои в резултата</strong>. При повторение:{" "}
            <strong>−{moment.points} т.</strong> ({SEVERITY_LABEL[moment.severity]}), а
            повторните грешки тежат още повече (×1.5 / ×2.0).
          </p>
        </div>

        {/* Acknowledge → resume. STICKY: on a 390 px phone this card is taller
            than the scene box and the button used to sit below the fold — the
            student had to scroll a modal that had just interrupted their drive.
            Pinned to the bottom of the scroll container it is always one thumb
            away, and the key hint rides INSIDE the label so the affordance
            cannot scroll out of sight. */}
        <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-3 rounded-b-xl bg-surface/95 px-5 pb-5 pt-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6">
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
