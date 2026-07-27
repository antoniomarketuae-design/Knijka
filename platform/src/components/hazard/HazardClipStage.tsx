"use client";

/**
 * The clip stage — the surface a student actually reacts on.
 *
 * ─ THE ONE THING THIS COMPONENT MUST GET RIGHT ─────────────────────────────
 * A reaction is recorded from `video.currentTime`, never from a wall clock.
 * That is not a micro-optimisation, it is the difference between measuring
 * PERCEPTION and measuring the student's phone. Our audience is 17 and mostly
 * on mid-range Androids; a 300 ms decode stall, a garbage-collection pause or
 * a backgrounded tab all move wall-clock time while the picture is frozen. If
 * presses were timed with `performance.now()` the student would be charged for
 * their hardware, and the resulting number could never support a safety claim.
 * Media time only advances while frames are actually being shown, so a stutter
 * costs nothing — and, usefully, the same property makes the server's
 * plausibility check one-directional (media time may LAG the wall clock freely;
 * only running AHEAD of it is impossible — hazard-play attempts.ts, property 4).
 *
 * ─ TOUCH FIRST ────────────────────────────────────────────────────────────
 * The press target is the WHOLE frame, not a button under the video. On a phone
 * "hit the small button in time" measures thumb travel, not perception. The
 * target is a real <button> filling the stage, so it is one tap anywhere — and
 * being a real button it is keyboard-operable and announced for free.
 *
 * Pointer presses are taken on `pointerdown`, not `click`, because `click`
 * fires on RELEASE and a lazy release would silently cost tenths of a second.
 * Keyboard presses are taken on `keydown` for the same reason, with the default
 * action prevented so the browser's synthesised click cannot count the same
 * physical press twice.
 *
 * ─ WHAT THIS COMPONENT DOES NOT KNOW ──────────────────────────────────────
 * When the hazard starts, when it ends, what it is, or whether the student was
 * right. It reports observations upward and nothing else. There is no scoring
 * window in this file — not hidden, not encoded, not lazily fetched — which is
 * why reading the page source cannot help anyone.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks/clientEnv";
import { clipsPluralBg, formatRunPositionBg } from "./copy";
import type { HazardItemCard } from "./types";

/**
 * Presses closer together than this are one press.
 *
 * A touch device that also synthesises a mouse event, a bouncing switch, a
 * repeating key — all land inside ~40 ms, and no human produces two intentional
 * reactions that close. This guard keeps the student's own on-screen counter
 * honest; the server de-duplicates independently (at 1 ms), so nothing about
 * scoring depends on this number being exactly right.
 */
const PRESS_COALESCE_SEC = 0.04;

/** Playback is cut this far before the authored end, to survive frame timing. */
const CUT_EPSILON_SEC = 0.02;

/** How long the press confirmation ring stays up, in ms. */
const ECHO_MS = 380;

/**
 * Progress-bar quantisation for reduced-motion users, in steps across the clip.
 *
 * A bar that slides continuously is animation, and a student who has asked the
 * OS for less of it should not have to watch one for the length of every clip.
 * Twelve discrete steps still answer "how much is left?" — which is the only
 * question the bar exists to answer — without anything gliding.
 */
const REDUCED_MOTION_STEPS = 12;

type StagePhase =
  /** Poster + brief. Nothing has been shown yet. */
  | "ready"
  /** Rolling. The only phase in which a press counts. */
  | "playing"
  /** Reached the cut. Handed upward; waiting for the verdict. */
  | "ended"
  /** The file would not load. Never graded — see the handler. */
  | "error";

interface HazardClipStageProps {
  card: HazardItemCard;
  /**
   * Fired exactly once per item, when the clip reaches its cut point.
   * `pressesMediaSec` is ascending media time; `watchedToSec` is how far the
   * player actually got (normally the full length).
   */
  onFinished: (pressesMediaSec: number[], watchedToSec: number) => void;
  /** True while the server is judging — the stage locks and says so. */
  busy: boolean;
}

/**
 * THE KEY LIVES HERE, NOT AT THE CALL SITE.
 *
 * Every item needs a completely fresh stage — fresh press list, fresh phase,
 * fresh "already finished" flag. The usual way to arrange that is `key` on the
 * caller, but this is precisely the wrong thing to leave to a caller: forget it
 * during a refactor and one clip's presses are scored against the next clip,
 * silently, with no error anywhere. Keying inside the component makes the reset
 * a property of the component rather than a convention its users must remember.
 *
 * (The alternative — resetting state from an effect on `card.itemId` — is a
 * cascading render, and React's own guidance is exactly this: to reset all
 * state when a prop changes, change the key.)
 */
export function HazardClipStage(props: HazardClipStageProps) {
  return <Stage key={props.card.itemId} {...props} />;
}

function Stage({ card, onFinished, busy }: HazardClipStageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const targetRef = useRef<HTMLButtonElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  const pressesRef = useRef<number[]>([]);
  const finishedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const echoTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<StagePhase>("ready");
  const [pressCount, setPressCount] = useState(0);
  const [echo, setEcho] = useState(false);
  const [stalled, setStalled] = useState(false);

  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    return () => {
      if (echoTimerRef.current !== null) window.clearTimeout(echoTimerRef.current);
    };
  }, []);

  const finish = useCallback(
    (watchedToSec: number) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setPhase("ended");
      videoRef.current?.pause();
      onFinished([...pressesRef.current], watchedToSec);
    },
    [onFinished],
  );

  /**
   * The playback loop. It runs on rAF rather than on `timeupdate` because
   * `timeupdate` fires roughly four times a second, which would let playback
   * overrun the authored cut by up to a quarter of a second — and the cut sits
   * just BEFORE the hazard becomes unmissable, so overrunning it shows the
   * student the answer they were being asked for.
   *
   * The bar is written through the DOM instead of through state: sixty React
   * renders a second, on a page that is also decoding video, is exactly the
   * avoidable work that turns into dropped frames on a mid-range Android.
   */
  useEffect(() => {
    if (phase !== "playing") return;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video !== null) {
        const t = video.currentTime;
        if (barRef.current !== null && card.durationSec > 0) {
          const raw = Math.min(1, Math.max(0, t / card.durationSec));
          const ratio = reduceMotion
            ? Math.round(raw * REDUCED_MOTION_STEPS) / REDUCED_MOTION_STEPS
            : raw;
          barRef.current.style.transform = `scaleX(${ratio})`;
        }
        if (t >= card.durationSec - CUT_EPSILON_SEC) {
          finish(Math.min(t, card.durationSec));
          return;
        }
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [phase, card.durationSec, finish, reduceMotion]);

  const registerPress = useCallback(() => {
    // Belt and braces: the target is `disabled` outside playback, so this
    // guard only ever catches a programmatic call.
    if (phase !== "playing") return;
    const video = videoRef.current;
    if (video === null) return;
    const t = video.currentTime;
    if (!Number.isFinite(t)) return;

    const list = pressesRef.current;
    const previous = list.length > 0 ? list[list.length - 1] : null;
    if (previous !== null && t - previous < PRESS_COALESCE_SEC) return;

    list.push(t);
    setPressCount(list.length);

    // Confirmation is a ring that is simply THERE for a moment and then is not:
    // no keyframes, nothing sliding or scaling, so it is identical for a
    // reduced-motion user rather than being switched off for them.
    setEcho(true);
    if (echoTimerRef.current !== null) window.clearTimeout(echoTimerRef.current);
    echoTimerRef.current = window.setTimeout(() => setEcho(false), ECHO_MS);
  }, [phase]);

  const start = useCallback(() => {
    const video = videoRef.current;
    if (video === null) return;
    setPhase("playing");
    // Focus moves to the press target the moment the clip rolls, so a keyboard
    // user is not hunting for it while the hazard develops.
    targetRef.current?.focus();
    void video.play().catch(() => {
      // Autoplay refusal cannot happen here (this call IS the user gesture and
      // the element is muted), but a decode failure surfaces the same way.
      setPhase("error");
    });
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== " " && event.key !== "Enter" && event.key !== "Spacebar") return;
      if (event.repeat) return;
      // Stops the browser turning this keydown into a click — a second press
      // for one physical action — and stops Space scrolling the page.
      event.preventDefault();
      registerPress();
    },
    [registerPress],
  );

  const rolling = phase === "playing";

  return (
    <div className="flex flex-col gap-3">
      {/* ── the frame ── */}
      <div className="panel relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          src={card.clipSrc}
          poster={card.posterSrc ?? undefined}
          className="h-full w-full object-cover"
          // Muted + inline: the clips carry no audio, and both attributes are
          // what lets a phone play the file in place instead of hijacking the
          // screen with the native fullscreen player mid-reaction.
          muted
          playsInline
          preload="auto"
          // No `controls`, deliberately: a scrub bar lets a student step
          // through the clip and FIND the hazard instead of perceiving it.
          controls={false}
          disablePictureInPicture
          onWaiting={() => setStalled(true)}
          onPlaying={() => setStalled(false)}
          onEnded={() => finish(videoRef.current?.currentTime ?? card.durationSec)}
          onError={() => setPhase("error")}
        />

        {/* Press target. Covers the frame; it IS the control. */}
        <button
          ref={targetRef}
          type="button"
          disabled={!rolling || busy}
          onPointerDown={registerPress}
          onKeyDown={handleKeyDown}
          aria-keyshortcuts="Space"
          aria-label="Натисни, когато забележиш, че се задава опасност"
          className="absolute inset-0 h-full w-full cursor-pointer bg-transparent disabled:cursor-default"
        >
          {echo && rolling ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-accent-2 shadow-glow-sm"
            />
          ) : null}
        </button>

        {/* ── brief overlay (phase: ready) ── */}
        {phase === "ready" ? (
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/60 to-black/15 p-4 sm:p-6">
            <p className="hud-label text-accent-2">
              Клип {formatRunPositionBg(card.index, card.total)}
            </p>
            <h2 className="mt-1 font-display text-lg font-black tracking-tight text-white sm:text-xl">
              {card.titleBg}
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/85">
              {card.briefBg}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={start} className="btn-accent">
                Пусни клипа
              </button>
              <p className="text-xs text-white/75">
                Натисни някъде върху видеото — или интервал.
              </p>
            </div>
          </div>
        ) : null}

        {/* ── buffering ── */}
        {stalled && rolling ? (
          <p className="hud-label absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-accent-2">
            Буферира — времето спира
          </p>
        ) : null}

        {/* ── the file did not load ── */}
        {phase === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
            <p className="text-sm font-semibold text-white">Клипът не се зареди.</p>
            {/* Deliberately NOT offering „оцени го така": grading a clip the
                student never saw would record a miss they did not make, and
                that row would then feed the safety statistics. */}
            <p className="max-w-sm text-xs text-white/75">
              Нищо не е записано. Този клип не се брои, докато не го изгледаш.
            </p>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                finishedRef.current = false;
                setPhase("ready");
                videoRef.current?.load();
              }}
            >
              Опитай пак
            </button>
          </div>
        ) : null}
      </div>

      {/* ── progress + reaction counter ── */}
      <div className="flex items-center gap-3">
        <div className="panel-inset h-1.5 flex-1 overflow-hidden rounded-full">
          <div
            ref={barRef}
            aria-hidden
            className="h-full w-full origin-left bg-accent-2"
            style={{ transform: "scaleX(0)" }}
          />
        </div>
        <p className="hud-label shrink-0 tabular-nums">
          {pressCount} {pressCount === 1 ? "реакция" : "реакции"}
        </p>
      </div>

      {/* One live region for the whole stage. `polite`, not `assertive`:
          interrupting a screen-reader user mid-clip is the accessibility
          equivalent of covering the road. */}
      <p aria-live="polite" className="visually-hidden">
        {phase === "ready"
          ? `Готов за клип ${card.index} от ${card.total}.`
          : phase === "playing"
            ? `Клипът върви. Отчетени реакции: ${pressCount}.`
            : phase === "ended"
              ? "Клипът приключи. Изчакай оценката."
              : "Клипът не се зареди."}
      </p>

      <p className="text-xs text-muted">
        {card.total} {clipsPluralBg(card.total)} в тази тренировка. Всеки се гледа
        по веднъж — както на пътя.
      </p>
    </div>
  );
}
