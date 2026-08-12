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
 * MEDIA: `preDriveTutorialMedia()` decides still-vs-clip. A step with no entry
 * in `PRE_DRIVE_TUTORIAL_CLIPS` renders the inline SVG still; a step with one
 * renders the tap-to-play clip below.
 *
 * ── A CLIP COSTS NOTHING UNTIL THE STUDENT ASKS FOR IT (founder, 2026-08-10) ──
 *   „each video loads and then disappears, and the next loads when the user
 *    clicks — so he only loads 8.99 MB on this one, and when he presses next,
 *    close that one automatically and load the new one"
 *
 * KEEP THE TWO SIZES APART, THEY ARE NOT THE SAME NUMBER:
 *  · DEPLOY SIZE — bytes in platform/public/, in git, on the VPS. Thirteen
 *    Kling-grade clips is ~60–120 MB and NOTHING on this screen changes it.
 *  · SESSION DOWNLOAD — what one 17-year-old's phone actually pulls. That is
 *    the number this file owns, and it used to be „every card that opened,
 *    in full, unasked", because the <video> carried `autoPlay muted`. A card
 *    that opens BY ITSELF (instruction mode auto-opens the pending step) and
 *    then spends 2–9 MB of a prepaid plan is not a feature, it is a bill.
 *
 * So, in order of how much each one is worth:
 *  1. NO <video> SRC UNTIL THE TAP. `src` is deliberately NOT a React prop —
 *    it is set by hand in `playClip` and removed by hand in `tearDownVideo`,
 *    because it is a network resource handle, not a piece of view state. Until
 *    the student presses the button the element has no source and the browser
 *    has nothing to fetch. `preload="none"` on top of that so not even
 *    metadata moves. THE CARD OPENS AT ZERO VIDEO BYTES.
 *  2. THE POSTER IS WHAT MAKES (1) FAIR. A student cannot decide whether a
 *    video is worth his data from an empty grey box, so every clip ships its
 *    own first frame as a WebP — 27 KB against 2.0 MB for `adjust-seat`, i.e.
 *    1.4 % — and the button prints the price of the tap.
 *  3. HARD TEARDOWN, NOT `key=`. `key={clip.src}` makes React drop the element
 *    on a step change, and that is the founder's „close that one
 *    automatically" half — but a DROPPED element is not a CANCELLED fetch in
 *    every browser, and a half-pulled 9 MB clip that keeps streaming after the
 *    student has moved on is exactly the bill he is trying to stop. So the
 *    element is torn down BY HAND — pause() → removeAttribute("src") →
 *    load() — from the ref callback (fires the instant React detaches it), on
 *    unmount, and synchronously in every control that closes or cancels.
 *  4. THE STILL IS THE FLOOR AND STAYS THE FLOOR. The inline SVG costs zero
 *    bytes, works offline and cannot be anatomically wrong; the checklist has
 *    taught the whole procedure from it since the day it shipped. A student
 *    who never taps play, whose poster 404s, or whose connection dies mid-clip
 *    gets the diagram and the complete WHY / HOW / ЗАПОМНИ — the video is an
 *    upgrade to the lesson, never a precondition for it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckControl } from "@/components/ui/CheckControl";
import {
  PRE_DRIVE_STEP_CONTROLS,
  PRE_DRIVE_STEPS,
  PRE_DRIVE_TUTORIALS,
  preDriveClipWeightBg,
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
// THE CLIP: opt-in playback, hand-managed teardown
// ---------------------------------------------------------------------------

/**
 * `idle` — poster on screen, element has no `src`, nothing has been fetched.
 * `loading` — the student tapped; bytes are moving and the SAME button now
 *   cancels, because on a bad connection the ability to stop is worth more
 *   than the video.
 * `playing` — native `controls` take over the surface.
 * `failed` — the still comes back with a retry. A dead network must never
 *   leave the student staring at a broken rectangle.
 */
type ClipPhase = "idle" | "loading" | "playing" | "failed";

/**
 * ABANDON an in-flight media fetch. All three calls are load-bearing and in
 * this order: `pause()` stops playback, `removeAttribute("src")` empties the
 * source so the resource-selection algorithm has nothing left to want, and
 * `load()` is what actually re-runs that algorithm — which is the step that
 * aborts the current fetch. Dropping the element alone does not reliably do
 * this; that is the whole reason this function exists rather than a `key=`.
 *
 * Idempotent and safe on a detached element, because it is called from a ref
 * callback, from an unmount cleanup and from click handlers, and those will
 * overlap.
 */
function tearDownVideo(el: HTMLVideoElement | null): void {
  if (el === null) return;
  try {
    el.pause();
    el.removeAttribute("src");
    // No <source> children by construction — `src` is the only handle, and a
    // <source> would survive removeAttribute() and keep the fetch alive.
    el.load();
  } catch {
    // Already reset, or the element is mid-detach. Nothing left to cancel.
  }
}

/** Bulgarian label on the one clip control, by phase. */
function clipButtonBg(phase: ClipPhase): string {
  switch (phase) {
    case "idle":
      return "▶ Пусни видеото";
    case "loading":
      return "⏹ Спри зареждането";
    case "failed":
      return "↻ Опитай пак";
    case "playing":
      return "";
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

  // ── CLIP STATE ────────────────────────────────────────────────────────────
  const clip = media.kind === "clip" ? media.clip : null;
  const [clipPhase, setClipPhase] = useState<ClipPhase>("idle");
  // A poster that 404s or fails to decode is not an error the student should
  // ever meet; it is simply the moment the SVG floor becomes visible again.
  const [posterFailed, setPosterFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /**
   * REF CALLBACK, not `useRef` alone: React hands this `null` at the exact
   * commit in which it detaches the element — on unmount and on a `key`
   * change — which is the earliest moment a teardown can run. A passive
   * effect cleanup fires later and, for a step change, would already be
   * looking at the NEW element.
   */
  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    if (node === null) tearDownVideo(videoRef.current);
    videoRef.current = node;
  }, []);

  // A new step is a new clip: never inherit the previous card's playing state.
  // (This component is NOT remounted per step — PreDriveChecklist reuses one
  // instance and only changes `stepId` — so this reset is the thing that
  // makes „press next → close that one automatically" true.)
  useEffect(() => {
    tearDownVideo(videoRef.current);
    setClipPhase("idle");
    setPosterFailed(false);
  }, [stepId]);

  // …and the unmount net, for every path that closes the card without a step
  // change: ✕, Escape, «Разбрах», the lesson ending, a route change.
  useEffect(() => () => tearDownVideo(videoRef.current), []);

  /** THE TAP. This is the only place a byte of video is ever requested. */
  const playClip = useCallback(() => {
    const el = videoRef.current;
    if (el === null || clip === null) return;
    setClipPhase("loading");
    // `src` is set by hand rather than rendered as a prop — see the file
    // header. Assigning it starts the fetch; `play()` is what a `preload="none"`
    // element needs to begin at all, and it runs inside the click so the
    // gesture that authorises playback is still the student's.
    el.setAttribute("src", clip.src);
    el.load();
    void el.play().catch(() => {
      // Autoplay policy or a decode refusal — `onError` below owns the
      // student-visible outcome, and a rejected promise must never surface as
      // an unhandled rejection in the middle of a lesson.
    });
  }, [clip]);

  /** THE CANCEL — the control that matters most on a bad connection. */
  const stopClip = useCallback(() => {
    tearDownVideo(videoRef.current);
    setClipPhase("idle");
  }, []);

  /** The two states in which the inline SVG — not the video — is what the
   *  student is looking at, and therefore what he is being taught from. */
  const stillIsFloor = (clipPhase === "idle" && posterFailed) || clipPhase === "failed";

  /**
   * ONE CONTROL, THREE LABELS, TWO POSITIONS. Play → cancel → retry share a
   * single element so there is exactly one new touch target on this card to
   * measure, and it is gone entirely while the clip plays so it can never sit
   * on the native control bar. Where it sits is decided by `stillIsFloor`; the
   * two call sites below say why.
   */
  const clipControl =
    clip === null || clipPhase === "playing" ? null : (
      <button
        type="button"
        data-predrive-clip-play=""
        onClick={clipPhase === "loading" ? stopClip : playClip}
        className={`flex min-h-11 min-w-11 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-full border border-border-strong bg-background/90 px-4 py-2 text-xs font-black text-foreground shadow-lg transition hover:bg-background motion-reduce:transition-none ${
          stillIsFloor
            ? "self-center"
            : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        }`}
      >
        <span>{clipButtonBg(clipPhase)}</span>
        {/* THE PRICE, ON ITS OWN LINE. It was appended to the label with a „·"
            and the pill wrapped mid-phrase on every phone profile, leaving the
            separator dangling at the end of line one. Two deliberate lines
            read the same on all four and state the two facts a student on a
            data plan is deciding between. */}
        {clipPhase === "idle" ? (
          <span className="text-[10px] font-bold text-muted">
            {preDriveClipWeightBg(clip.bytes)} · {clip.durationSec} с
          </span>
        ) : null}
      </button>
    );

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

  // EVERY EXIT TEARS THE CLIP DOWN FIRST, synchronously. Unmounting would get
  // there too (`attachVideo(null)`), but „the instant they move on" is a
  // promise about the click, not about React's commit schedule.
  const close = useCallback(() => {
    tearDownVideo(videoRef.current);
    onClose();
  }, [onClose]);
  const continueStep = useCallback(() => {
    tearDownVideo(videoRef.current);
    onContinue();
  }, [onContinue]);
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
    // CENTRED BY `m-auto`, NOT BY `items-center` — and that is not a style
    // preference, it is the only version a student can scroll.
    //
    // MEASURED, WebKit, 2026-08-11, with this card open on the four harness
    // profiles. `items-center` on an `overflow-y-auto` box centres an item that
    // is TALLER than the box by pushing its top ABOVE the scroll origin, and
    // `scrollTop: 0` cannot go back for it. The card is 743 px:
    //   · iPhone 16 landscape (852×393): cardTop −175.1 at scrollTop 0 — the
    //     step title, «Подготовка · стъпка N от 13» and the ✕ were all off the
    //     top and UNREACHABLE BY SCROLLING;
    //   · small Android portrait (360×780): cardTop −31;
    //   · small Android landscape (780×360): 16 px of the play button itself.
    // Flex auto margins centre the same way when there IS free space and
    // collapse to 0 when there is not, so the card starts at the top and the
    // whole of it scrolls. Same look on a roomy screen, reachable on a small one.
    <div
      // §I20, SEVENTH SITE — AND ON A PHONE IT IS THE WORST ONE IN THE PRODUCT.
      // §I20 listed four full-screen scrims and this file was not among them,
      // because the row was written against `components/sim/` and this lives in
      // `modules/sim/hud/`. It is `fixed inset-0` with a viewport-sized
      // `backdrop-filter: blur(8px)` — and unlike the teach card, the quiz and
      // the debrief, THE WORLD IS NOT PAUSED BEHIND IT. The pre-drive holds
      // `driveLocked`, not `paused`, so §I19's `frameloop="demand"` does not
      // apply: the canvas underneath is rendering at the panel's full rate,
      // for as long as the student reads a thirteen-step procedure. That makes
      // this the longest-lived blur-over-a-live-canvas the product has, on the
      // exact surface he called "ultra hard to put BElts".
      // Opaque for the reasons on OVERLAY_SCRIM_CLASS (lesson-ui/playArea.ts);
      // not the shared constant, because this one is `fixed` rather than
      // `absolute` and does not centre — only the paint is shared.
      className="fixed inset-0 z-50 flex overflow-y-auto bg-background p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Стъпка ${stepNumber} от ${stepTotal}: ${spec.titleBg}`}
    >
      {/* ── DOC 91 · C3/L8/U5 · §I4(a) — THE BELT TRAP ─────────────────────────
          „it is ultra hard to put BElts and all the requried buttons to do so."

          THE CARD SCROLLS, NOT THE BACKDROP. `m-auto` (above) fixed
          REACHABILITY — the top of the card stopped being pushed above the
          scroll origin — and it did nothing for VISIBILITY: the card had no
          height cap, so on a 393 px landscape screen it laid out an 821 px
          column and the button row was **300–423 px below the fold on 13 of 13
          steps**, with nothing on screen saying so. A student who cannot see
          «Разбрах» and does not know the backdrop scrolls is stuck on step 1 of
          a thirteen-step procedure.

          Three parts, and each is doing one thing:
            · `max-h-full` — the cap. Resolves against the fixed backdrop's
              content box (its `p-4` is already subtracted), so the card can
              never be taller than the screen it is drawn on.
            · `overflow-y-auto` — the scroll moves INTO the card. The backdrop
              keeps its own `overflow-y-auto` as a floor for any browser that
              disagrees about the percentage.
            · `overscroll-contain` — a flick that reaches the end of the card
              must not become a scroll of the page underneath it.
          `m-auto` still centres, because auto margins collapse to 0 exactly
          when there is no free space left. Nothing changes on a desktop, where
          the card was never taller than the window. The sticky button row at
          the bottom is the other half — see it for why it carries the card's
          own background and negative margins. ─────────────────────────────── */}
      <div className="card m-auto flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto overscroll-contain p-5">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-accent-2">
              Подготовка · стъпка {stepNumber} от {stepTotal}
            </p>
            <h2 className="text-base font-extrabold leading-tight">{spec.titleBg}</h2>
          </div>
          {/* MEASURED 27.8 × 22 px on all four harness profiles — under the
              44 px thumb minimum row C2 was closed on, on the very control
              this card's brief is about („stop costing them the instant they
              move on"). `data-hud-close` is the handle for the hit-area rule
              already shipping in `lesson-ui/PlayAreaStyles` — a ::before that
              is 2.75rem in both axes, centred on the glyph and painting
              nothing — so the target grows to 44 px with no change to how the
              card looks and no new CSS. The same trick, for the same reason,
              as `HudCloseButton`. */}
          <button
            type="button"
            data-hud-close=""
            onClick={close}
            aria-label="Затвори обяснението"
            className="shrink-0 touch-manipulation rounded-lg border border-border px-2 py-0.5 text-xs font-bold text-muted transition hover:text-foreground motion-reduce:transition-none"
          >
            ✕
          </button>
        </header>

        {/* The inline still always; a clip on top of it, but only on request. */}
        <figure className="flex flex-col gap-1">
          {clip === null ? (
            <PreDriveStill stepId={stepId} />
          ) : (
            // ONE BOX, FIXED ASPECT, THREE LAYERS. The ratio is the still's own
            // 320:170, so a step with a clip and a step without are exactly the
            // same height and NOTHING on this card moves when the poster
            // arrives, when the video replaces it, or when either fails. The
            // founder's phone sweep counts a layout that reflows around a popup
            // as a defect; a media box that sizes itself from whatever loaded
            // first is that defect with a network attached.
            <div
              className="relative w-full overflow-hidden rounded-xl border border-border bg-surface-2"
              style={{ aspectRatio: "320 / 170" }}
            >
              {/* LAYER 0 — THE FLOOR. Zero bytes, no network, offline-proof.
                  Visible whenever the clip is not: before the tap if the poster
                  is unusable, and after a failure. */}
              {stillIsFloor ? (
                <div className="absolute inset-0">
                  <PreDriveStill stepId={stepId} />
                </div>
              ) : null}

              {/* LAYER 1 — THE POSTER. An <img>, not the <video poster>
                  attribute, for one reason: an <img> tells us when it FAILED,
                  and a video element does not. That is what lets layer 0 come
                  back instead of leaving a black rectangle. `object-contain`
                  because a teaching frame must never be cropped. */}
              {clipPhase === "idle" && !posterFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={clip.posterSrc}
                  alt={media.captionBg}
                  onError={() => setPosterFailed(true)}
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : null}

              {/* LAYER 2 — THE CLIP. Mounted at all times so the ref (and its
                  teardown) is stable, but carrying NO `src` until `playClip`
                  sets one: an element with no source fetches nothing, and
                  `preload="none"` says so a second time. `poster` here as well,
                  so the identical frame stays on screen while the video
                  buffers — the swap from layer 1 is invisible.
                  `controls` only once there is something to control; a control
                  bar over a poster is a dead tap target sitting on top of the
                  live one, which is the overlap class of defect this HUD has
                  already paid for six times. */}
              <video
                key={clip.src}
                ref={attachVideo}
                poster={posterFailed ? undefined : clip.posterSrc}
                preload="none"
                controls={clipPhase === "playing"}
                muted
                playsInline
                hidden={clipPhase === "idle" || clipPhase === "failed"}
                onPlaying={() => setClipPhase("playing")}
                // AN ERROR ON A SOURCELESS ELEMENT IS NOT A FAILED VIDEO. The
                // teardown ends with `load()` on an element whose `src` has
                // just been removed; the spec says that ends the resource
                // selection algorithm without firing `error`, and neither
                // WebKit nor Chromium fired one when this was measured — but if
                // a browser ever did, the student who pressed «Спри
                // зареждането» would be told the video had failed, which is
                // both false and alarming. So the handler asks whether there
                // was anything to fail.
                onError={() => {
                  if (videoRef.current?.getAttribute("src")) setClipPhase("failed");
                }}
                className="absolute inset-0 h-full w-full bg-black object-contain"
              >
                {clip.transcriptBg}
              </video>

              {/* LAYER 3 — THE ONE CONTROL, over the PHOTOGRAPH only. Covering
                  the middle of a poster frame is the universal „this is a
                  video" affordance and costs the student nothing. Covering the
                  DIAGRAM would cost him the lesson — see below. */}
              {stillIsFloor ? null : clipControl}

              {/* Announced, not just painted — the card is otherwise silent
                  about a download that can take a while on a 3G phone. */}
              <p role="status" aria-live="polite" className="sr-only">
                {clipPhase === "loading"
                  ? "Видеото се зарежда. Може да спреш зареждането и да продължиш с рисунката."
                  : clipPhase === "failed"
                    ? "Видеото не се зареди. Показана е рисунката."
                    : ""}
              </p>
            </div>
          )}
          <figcaption className="text-[11px] font-semibold leading-snug text-muted">
            {media.captionBg}
            {clip === null ? (
              <span className="ml-1 text-muted/70">(схема)</span>
            ) : clipPhase === "failed" ? (
              <span className="ml-1 font-bold text-warning">
                (видеото не се зареди — рисунката показва същото, можеш да продължиш)
              </span>
            ) : (
              // The SIZE is deliberately not repeated here. It belongs on the
              // button, where it is a price attached to a decision; in the
              // caption it is just one more thing on a 360 px screen, and the
              // two of them a centimetre apart read as clutter.
              <span className="ml-1 text-muted/70">(видео · {clip.durationSec} с)</span>
            )}
          </figcaption>
          {/* …AND WHEN THE DIAGRAM IS SHOWING, THE CONTROL COMES OUT OF THE
              PICTURE. Caught by looking at the rendered failure state, not by
              reasoning about it: with the clip dead the inline SVG IS the
              lesson, and a pill centred on a 320×170 schematic sat across the
              driver's shoulder and the «китка върху волана» label — the one
              annotation the step is about. So in exactly the two states where
              the floor is what the student is being taught from, the control
              moves below the figure and occludes nothing. */}
          {stillIsFloor ? clipControl : null}
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

        {/* ── §I4(a), THE OTHER HALF: «РАЗБРАХ» IS ON SCREEN AT EVERY SIZE ─────
            The cap above stops the card growing past the screen; this is what
            keeps the ONE control that closes it visible while the student
            scrolls the 400-character explanation above it.

            `sticky bottom-0` inside the card's own scroll box, with:
              · `-mx-5 -mb-5 px-5 pb-5` — the row is pulled out to the card's
                edges so its background covers the full width as content passes
                UNDER it, then given the padding back as its own. Without this
                the text would slide through a 40 px gutter either side.
              · `bg-surface` — the card's own fill (`.card` = `bg-surface`),
                stated literally because a sticky row over scrolling text must
                be opaque; a translucent one turns the label into a smear.
              · `pt-3` + a hairline top border — so the row reads as a footer
                rather than as a button floating on the paragraph it covers. */}
        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-5 pb-5 pt-3">
          <button
            ref={continueRef}
            type="button"
            className="btn-accent"
            onClick={isInfoStep ? continueStep : close}
          >
            {isInfoStep ? "Разбрах — потвърди стъпката" : "Разбрах — продължи"}
          </button>
          {/* MEASURED 189.9 × 16.5 px — a full-width strip a thumb cannot miss
              horizontally and cannot hit vertically. The <label> is the real
              target (a click anywhere on it toggles the box inside it), so the
              44 px goes HERE rather than on the shared `CheckControl`, whose
              16 px box is deliberate and is used all over the product. Costs
              no height: the row already stands 44 px tall for «Разбрах». */}
          <label className="flex min-h-11 cursor-pointer touch-manipulation items-center gap-1.5 text-[11px] font-semibold text-muted">
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
