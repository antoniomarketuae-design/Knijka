"use client";

/**
 * Pre-drive TUTORIAL popup — the founder's redesign of Урок 1 (2026-07-30,
 * ledger 86 D9). His words, verbatim:
 *
 *   „The moment I entered the lesson and saw that I had to remember and press
 *    thirteen different keyboard shortcuts, my first instinct was to skip the
 *    lesson entirely. … Instead of simply displaying `Press B`, the simulator
 *    should open a tutorial popup … After the tutorial finishes, the user
 *    clicks Next with the mouse. Only then does the lesson continue."
 *
 * So each step gets its own card: an illustration, WHY it matters, HOW it is
 * done, what to REMEMBER, the law it comes from (retrieved, never recalled —
 * ADR-002), and one mouse button to continue.
 *
 * THE ORDER OF THE THREE INPUTS IS THE FIX. The card leads with the DASHBOARD
 * CLICK („Щракни предпазния колан до седалката") because that is the real
 * car's gesture and the doc-69 hotspots have supported it since A2; the
 * keyboard is one demoted line at the bottom, marked „за напреднали". Before
 * this the checklist showed a bare <kbd>B</kbd> and nothing else — which is
 * exactly the thirteen-shortcut wall he hit.
 *
 * MEDIA: `preDriveTutorialMedia()` decides still-vs-clip. Today every step is
 * a still (no video-generation balance); the day a 10–15 s clip is authored in
 * `PRE_DRIVE_TUTORIAL_CLIPS`, this component renders <video> for it with no
 * other edit anywhere. That branch is written and tested now, so the swap is
 * a data commit.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckControl } from "@/components/ui/CheckControl";
import {
  PRE_DRIVE_STEP_CONTROLS,
  PRE_DRIVE_STEPS,
  PRE_DRIVE_TUTORIALS,
  preDrivePrimaryInput,
  preDriveTutorialLaw,
  preDriveTutorialMedia,
  type PreDriveStepId,
} from "../procedures";
import { PreDriveStill } from "./PreDriveStill";

/** Persisted „open the card by itself" preference. Absent = auto (the default
 *  a first-time student needs); "manual" = only the row's „?" opens it. */
export const PRE_DRIVE_TUTORIAL_STORAGE_KEY = "aidrive.sim.predriveTutorial.v1";

/** Pure parse of the stored value — null when nothing/foreign is stored. */
export function parseStoredTutorialAutoOpen(v: unknown): boolean | null {
  if (v === "auto") return true;
  if (v === "manual") return false;
  return null;
}

export function serializeTutorialAutoOpen(auto: boolean): "auto" | "manual" {
  return auto ? "auto" : "manual";
}

export function readTutorialAutoOpen(): boolean {
  try {
    return (
      parseStoredTutorialAutoOpen(window.localStorage.getItem(PRE_DRIVE_TUTORIAL_STORAGE_KEY)) ??
      true
    );
  } catch {
    return true;
  }
}

function writeTutorialAutoOpen(auto: boolean): void {
  try {
    window.localStorage.setItem(PRE_DRIVE_TUTORIAL_STORAGE_KEY, serializeTutorialAutoOpen(auto));
  } catch {
    // Private mode — the preference simply does not survive the session.
  }
}

// ---------------------------------------------------------------------------

export function PreDriveTutorial({
  stepId,
  stepNumber,
  stepTotal,
  /** Info steps confirm the step itself; performed steps just close the card
   *  and leave the student in front of the (pulsing) dashboard control. */
  isInfoStep,
  onContinue,
  onClose,
}: {
  stepId: PreDriveStepId;
  stepNumber: number;
  stepTotal: number;
  isInfoStep: boolean;
  onContinue: () => void;
  onClose: () => void;
}) {
  const spec = PRE_DRIVE_STEPS[stepId];
  const tutorial = PRE_DRIVE_TUTORIALS[stepId];
  const control = PRE_DRIVE_STEP_CONTROLS[stepId];
  const media = preDriveTutorialMedia(stepId);
  const lawRef = preDriveTutorialLaw(stepId);
  const primary = preDrivePrimaryInput(stepId);
  const [autoOpen, setAutoOpen] = useState(true);
  const continueRef = useRef<HTMLButtonElement | null>(null);
  // PORTAL GUARD — see the return statement for why this card must leave the
  // checklist's DOM subtree entirely.
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setAutoOpen(readTutorialAutoOpen());
    setPortalReady(true);
  }, []);

  // The card is the only thing on screen that matters right now — land the
  // caret on the one mouse action so keyboard and screen-reader users are not
  // second-class in a card whose whole subject is „use the mouse".
  useEffect(() => {
    continueRef.current?.focus();
  }, [stepId]);

  const close = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  const toggleAuto = (next: boolean) => {
    setAutoOpen(next);
    writeTutorialAutoOpen(next);
  };

  // ── WHY THIS IS A PORTAL, AND WHY NOT TO <body> ───────────────────────────
  // Both halves of this were measured in rendered frames, not reasoned.
  //
  // 1. It has to LEAVE the checklist. The card is `position: fixed`, and it
  //    was rendered as a child of PreDriveChecklist — a panel with
  //    `backdrop-blur-md`. A backdrop-filter makes an element a CONTAINING
  //    BLOCK for fixed descendants, so `inset-0` resolved to the 320 px panel
  //    in the top-left corner: `items-center justify-center` centred the card
  //    inside a sliver, the illustration and the „Защо/Как" section were
  //    clipped off the top, and it landed exactly where the „Клавиши" legend
  //    lives. That is the geometry behind the founder's row about the legend
  //    and the tutorial card sharing a corner.
  // 2. It must NOT go to <body>. LessonPlayShell puts the lesson in real
  //    fullscreen, and the browser paints the fullscreen element in the TOP
  //    LAYER — above every z-index in the page. A card portalled to <body> is
  //    therefore painted UNDER the canvas: Playwright's own log for the run
  //    that proved it reads „<canvas …> intercepts pointer events", and the
  //    „Разбрах" button could not be clicked at all.
  // So it goes to the shell root (`data-sim-shell`), which is inside the
  // fullscreen tree and carries no transform/filter/backdrop-filter. Falls
  // back to <body> for any mount outside the shell (dev harnesses).
  const card = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Стъпка ${stepNumber} от ${stepTotal}: ${spec.titleBg}`}
    >
      <div className="card flex w-full max-w-lg flex-col gap-3 p-5">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-accent-2">
              Подготовка · стъпка {stepNumber} от {stepTotal}
            </p>
            <h2 className="text-base font-extrabold leading-tight">{spec.titleBg}</h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Затвори обяснението"
            className="shrink-0 rounded-lg border border-border px-2 py-0.5 text-xs font-bold text-muted transition hover:text-foreground motion-reduce:transition-none"
          >
            ✕
          </button>
        </header>

        {/* Illustration today, generated clip the moment one exists. */}
        <figure className="flex flex-col gap-1">
          {media.kind === "clip" ? (
            <video
              key={media.clip.src}
              src={media.clip.src}
              poster={media.clip.posterSrc}
              controls
              autoPlay
              muted
              playsInline
              className="w-full rounded-xl border border-border"
            >
              {media.clip.transcriptBg}
            </video>
          ) : (
            <PreDriveStill stepId={stepId} />
          )}
          <figcaption className="text-[11px] font-semibold leading-snug text-muted">
            {media.captionBg}
            {media.kind === "clip" ? null : (
              <span className="ml-1 text-muted/70">(схема)</span>
            )}
          </figcaption>
        </figure>

        <section className="flex flex-col gap-2 text-xs leading-relaxed">
          <p>
            <strong className="font-black text-accent-2">Защо: </strong>
            {tutorial.whyBg}
          </p>
          <p>
            <strong className="font-black text-accent-2">Как: </strong>
            {tutorial.howBg}
          </p>
          <p className="rounded-xl bg-surface-2 p-2.5">
            <strong className="font-black text-foreground">Запомни: </strong>
            {tutorial.rememberBg}
          </p>
          {lawRef !== undefined ? (
            <p className="text-[11px] font-bold text-muted">Основание: {lawRef}</p>
          ) : null}
        </section>

        {/* THE TAUGHT PATH — mouse first, keyboard demoted. */}
        <section className="flex flex-col gap-1.5 rounded-xl border border-accent/40 bg-accent/5 p-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-accent">
            Как да го направиш сега
          </p>
          {primary === "click" && control?.clickBg !== undefined ? (
            <p className="text-xs font-bold leading-snug text-foreground">
              <span aria-hidden className="mr-1">
                🖱
              </span>
              {control.clickBg}
              <span className="ml-1 font-semibold text-muted">
                — контролата свети в кабината, докато стъпката чака.
              </span>
            </p>
          ) : null}
          {/* PEDAL STEPS. Until 2026-07-30 this branch read „Тази стъпка е с
              педал — няма контрола на таблото, която да щракнеш." It was true
              and it is exactly where the founder's mouse-only run of the
              lesson stopped. A desktop now carries the two on-screen pedal
              pads (lesson-ui/MousePedals.tsx) writing into the same input
              source the phone pads use, so the sentence names the pad. */}
          {primary === "pedal" && control?.pedalBg !== undefined ? (
            <p className="text-xs font-bold leading-snug text-foreground">
              <span aria-hidden className="mr-1">
                🖱
              </span>
              {control.pedalBg}
              <span className="ml-1 font-semibold text-muted">
                — педалът работи като истински: държиш го натиснат, не го щракваш веднъж.
              </span>
            </p>
          ) : null}
          {primary === "confirm" ? (
            <p className="text-xs font-bold leading-snug text-foreground">
              Направи проверката в реалния свят, после потвърди с бутона отдолу.
            </p>
          ) : null}
          {control !== undefined ? (
            <p className="text-[11px] font-semibold text-muted">
              За напреднали — същото с клавиатура:{" "}
              {control.keys.split(" ").map((k) => (
                <kbd
                  key={k}
                  className="ml-1 rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent"
                >
                  {k}
                </kbd>
              ))}
            </p>
          ) : null}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            ref={continueRef}
            type="button"
            className="btn-accent"
            onClick={isInfoStep ? onContinue : close}
          >
            {isInfoStep ? "Разбрах — потвърди стъпката" : "Разбрах — продължи"}
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-muted">
            <CheckControl
              type="checkbox"
              checked={!autoOpen}
              onChange={(e) => toggleAuto(!e.target.checked)}
            />
            Не отваряй обясненията сами
          </label>
        </div>
      </div>
    </div>
  );

  if (!portalReady || typeof document === "undefined") return null;
  const host = document.querySelector("[data-sim-shell]") ?? document.body;
  return createPortal(card, host);
}
