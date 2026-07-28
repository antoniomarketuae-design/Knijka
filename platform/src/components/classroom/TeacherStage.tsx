"use client";

/**
 * The teacher slot.
 *
 * The founder's ruling is that the teacher is a HUMAN — filmed or rendered,
 * not drawn — and that the interruption problem is a presentation problem to
 * be solved rather than a reason to substitute something else. This component
 * is that solution's front half: one figure, one clearly-signalled state, and
 * a source that can be swapped from underneath without the room noticing.
 *
 * THE STATES ARE THE FEATURE. A recording „cannot be interrupted" only if you
 * ship one loop. Ship a talking loop, an attentive listening loop and a
 * one-beat resume, and the interruption becomes a cut between two clips of the
 * same person — which is what a real classroom looks like from the back row.
 * The state chrome here (the ring, the caption, the mouth meter) is what makes
 * those cuts legible even before any footage exists.
 *
 * THE PLACEHOLDER IS DELIBERATELY UGLY. Until the sourcing lane delivers, this
 * renders a dashed wireframe bust with „ЗАПАЗЕНО МЯСТО" written on it. It must
 * never be mistakable for a finished teacher — a pretty stand-in is how a
 * placeholder survives to a founder review.
 */

import { useEffect, useRef, useState } from "react";
import { TEACHER_STATE_BG } from "./player";
import type { TeacherSource, TeacherState } from "./types";

/** Per-state ring/label colour. `warn` is never used for a person's face. */
const STATE_TINT: Record<TeacherState, string> = {
  idle: "var(--control-edge)",
  speaking: "var(--accent)",
  listening: "var(--accent-2)",
  thinking: "var(--accent-2)",
  answering: "var(--accent)",
  resuming: "var(--accent-soft)",
};

/**
 * The mouth meter — three bars that move only while the teacher is speaking.
 * It is the „is this thing talking?" cue for a muted phone, and it doubles as
 * the honest signal that the current source has no lip movement of its own.
 */
function SpeechMeter({ active }: { active: boolean }) {
  return (
    <span aria-hidden className="flex items-end gap-[3px]" style={{ height: 12 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={active ? "cl-speech-bar" : ""}
          style={{
            width: 3,
            height: active ? undefined : 4,
            borderRadius: 2,
            background: "currentColor",
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
    </span>
  );
}

/** The wireframe bust. Not art — a hole in the page with a label on it. */
function PlaceholderFigure({ state }: { state: TeacherState }) {
  const tint = STATE_TINT[state];
  return (
    <svg
      viewBox="0 0 120 150"
      className="h-full w-full"
      role="img"
      aria-label="Запазено място за преподавателя — записът още не е добавен"
      style={{ color: tint }}
    >
      {/* shoulders */}
      <path
        d="M8 150 C 10 108, 34 96, 60 96 C 86 96, 110 108, 112 150"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray="7 5"
        opacity={0.75}
      />
      {/* head */}
      <ellipse
        cx={60}
        cy={56}
        rx={30}
        ry={36}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray="7 5"
        opacity={0.75}
      />
      {/* eye line + mouth line: enough to read as a face, too little to be one */}
      <path d="M44 50 h12 M64 50 h12" stroke="currentColor" strokeWidth={2} opacity={0.5} />
      <path
        d={state === "speaking" || state === "answering" ? "M50 72 q10 8 20 0" : "M50 72 h20"}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        opacity={0.5}
      />
      {/* the label that makes this unmistakably unfinished */}
      <text
        x={60}
        y={126}
        textAnchor="middle"
        fontSize={9}
        letterSpacing={1.2}
        fill="currentColor"
        opacity={0.9}
      >
        ЗАПАЗЕНО МЯСТО
      </text>
    </svg>
  );
}

/** Video/frames source. One short loop per state; missing ⇒ idle ⇒ poster. */
function SourceFigure({ source, state }: { source: TeacherSource; state: TeacherState }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [frame, setFrame] = useState(0);

  const loopSrc =
    source.kind === "video" ? (source.loops[state] ?? source.loops.idle ?? null) : null;
  const sequence =
    source.kind === "frames" ? (source.sequences[state] ?? source.sequences.idle ?? null) : null;
  const fps = source.kind === "frames" ? source.fps : 0;

  // Image sequences: one interval, cleared whenever the state changes. The
  // counter is never reset — it is read modulo the sequence length below, so a
  // cut to a different state cannot leave it pointing past the end, and no
  // setState happens in the effect body.
  useEffect(() => {
    if (!sequence || sequence.length < 2 || fps <= 0) return;
    const id = window.setInterval(() => setFrame((f) => f + 1), 1000 / fps);
    return () => window.clearInterval(id);
  }, [sequence, fps]);

  // A state change is a cut to a different loop — restart it from frame 0 so
  // „listening" never opens halfway through a nod.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !loopSrc) return;
    v.currentTime = 0;
    v.play().catch(() => {});
  }, [loopSrc]);

  const poster = source.kind === "placeholder" ? undefined : source.posterSrc;

  if (loopSrc) {
    return (
      <video
        ref={videoRef}
        src={loopSrc}
        poster={poster}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden
        className="h-full w-full object-cover"
      />
    );
  }
  if (sequence && sequence.length > 0) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- frame sequences
         are pre-sized assets swapped every 1/fps; next/image would re-run its
         optimizer pipeline per frame. */
      <img
        src={sequence[frame % sequence.length]}
        alt=""
        aria-hidden
        className="h-full w-full object-cover"
      />
    );
  }
  if (poster) {
    /* eslint-disable-next-line @next/next/no-img-element -- see above */
    return <img src={poster} alt="" aria-hidden className="h-full w-full object-cover" />;
  }
  return <PlaceholderFigure state={state} />;
}

export function TeacherStage({
  source,
  state,
  /** Compact = the portrait bust standing in front of the board. */
  compact = false,
  className,
}: {
  source: TeacherSource;
  state: TeacherState;
  compact?: boolean;
  className?: string;
}) {
  const tint = STATE_TINT[state];
  const talking = state === "speaking" || state === "answering";

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className ?? ""}`}>
      <div
        // The figure sits in a rounded plinth so it reads as standing IN the
        // room rather than floating over it. `overflow-hidden` clips a video
        // source to the same silhouette the placeholder draws.
        className="relative w-full overflow-hidden rounded-t-[46%] rounded-b-2xl border bg-surface-2/70"
        style={{
          // Head-and-shoulders normally; a tighter crop on a phone held
          // sideways, where every vertical pixel the figure takes is a pixel
          // the board loses.
          aspectRatio: compact ? "1 / 1" : "4 / 5",
          borderColor: tint,
          // The state ring: the single strongest „what is happening" cue, and
          // the only thing on this component that animates.
          boxShadow: talking
            ? `0 0 0 1px ${tint}, 0 0 22px -6px ${tint}`
            : `0 0 0 1px color-mix(in srgb, ${tint} 55%, transparent)`,
          opacity: state === "idle" ? 0.72 : 1,
          transition: "box-shadow 220ms ease, opacity 220ms ease",
        }}
      >
        <SourceFigure source={source} state={state} />

        {/* Listening is the state the founder's design lives or dies on, so it
            gets its own unmistakable overlay rather than a colour change. */}
        {(state === "listening" || state === "thinking") && (
          <div
            aria-hidden
            className="absolute inset-0 flex items-end justify-center pb-2"
            style={{ background: "linear-gradient(to top, rgba(4,7,14,0.66), transparent 62%)" }}
          >
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide"
              style={{ background: tint, color: "var(--accent-foreground)" }}
            >
              {state === "listening" ? "СЛУША" : "МИСЛИ"}
            </span>
          </div>
        )}

      </div>

      <div
        className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wide"
        style={{ color: tint }}
      >
        <SpeechMeter active={talking} />
        <span>{TEACHER_STATE_BG[state]}</span>
      </div>
    </div>
  );
}

export default TeacherStage;
