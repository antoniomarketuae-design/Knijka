"use client";

/**
 * AudioLessonPrompt — the „звукът е част от урока" line (doc 82 §4.4).
 *
 * A muted session teaches a systematically faster car than the student will
 * actually drive (~3.2 km/h over-production without audio, ~10% in
 * visual-only sims). This chip states that once, in the instructor's voice,
 * and gets out of the way: it disappears the moment the AudioContext unlocks
 * (any pointerdown/keydown — LessonScene already wires the gesture), and the
 * „Разбрах" control persists a dismissal so it never returns.
 *
 * Self-contained additive block, the RearProximityCue pattern: it polls the
 * SimAudio instance off the shared ref at 2 Hz instead of subscribing, so it
 * adds no frame-loop wiring and cannot touch grading. Every rule lives in the
 * pure scene/audioPrompt.ts; this file only renders the result.
 */

import { useCallback, useEffect, useState, type RefObject } from "react";
import {
  audioPromptState,
  audioPromptTextBg,
  loadAudioPromptDismissed,
  storeAudioPromptDismissed,
  AUDIO_PROMPT_DISMISS_BG,
  type AudioPromptState,
} from "@/modules/sim/scene/audioPrompt";
import type { SimAudio } from "@/modules/sim/scene/simAudio";

/** 2 Hz — the state changes at most a handful of times per session. */
const POLL_MS = 500;

/** Speaker glyph with the sound waves struck through while silent. */
function MutedSpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
      <path
        d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M16 9.5l4.5 5M20.5 9.5l-4.5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AudioLessonPrompt({
  audioRef,
  hidden = false,
}: {
  audioRef: RefObject<SimAudio | null>;
  /** True while a pause/quiz/end overlay is up — the line waits its turn. */
  hidden?: boolean;
}) {
  const [state, setState] = useState<AudioPromptState>(null);
  const [dismissed, setDismissed] = useState(true); // pessimistic until read

  // Storage is client-only; read it once on mount rather than during render.
  useEffect(() => {
    setDismissed(loadAudioPromptDismissed());
  }, []);

  useEffect(() => {
    if (hidden || dismissed) return;
    const id = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      setState(
        audioPromptState({ unlocked: audio.unlocked, muted: audio.muted, dismissed: false }),
      );
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [audioRef, hidden, dismissed]);

  const dismiss = useCallback(() => {
    storeAudioPromptDismissed();
    setDismissed(true);
  }, []);

  if (hidden || dismissed || state === null) return null;

  const text = audioPromptTextBg(state);
  return (
    // `data-hud` is the one vocabulary the scene tree and the shell's CSS
    // share (the follow-hint / controls-help precedent). Rows C1+C2 use it to
    // put this chip in the overlay priority order and to grow its «Разбрах»
    // to a thumb — see lesson-ui/PlayAreaStyles.tsx.
    <div
      data-hud="audio-prompt"
      className="absolute left-1/2 top-3 z-20 w-[min(30rem,calc(100%-1.5rem))] -translate-x-1/2"
    >
      <div
        role="status"
        className="flex items-center gap-2.5 rounded-xl border bg-background/90 px-3 py-2 text-xs shadow-glow-sm backdrop-blur"
        style={{ borderColor: "var(--border-strong)" }}
      >
        <MutedSpeakerIcon />
        <span className="flex-1 leading-snug">{text}</span>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg border px-2 py-1 text-[0.7rem] font-bold"
          style={{ borderColor: "var(--border-strong)" }}
        >
          {AUDIO_PROMPT_DISMISS_BG}
        </button>
      </div>
    </div>
  );
}
