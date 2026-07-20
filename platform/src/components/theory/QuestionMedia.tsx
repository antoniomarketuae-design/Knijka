"use client";

/**
 * Question media rendering (THEO-1): the ONE component both the practice
 * runner and the exam runner mount for the data-driven media kinds, so the
 * two surfaces can never diverge.
 *
 *  - sign       → <SignFace>, an <img> over the platform's own sign-artwork
 *                 endpoint (/api/signs/<code> streams content/signs/svg).
 *  - sceneStill → <SceneStill>, the static top-down canvas scene.
 *  - legacy image/video refs render nothing here (callers may keep their own
 *    placeholder); no bank item uses them.
 */

import type { QuestionMedia, SignMediaRef } from "@/lib/content/types";
import { SceneStill } from "./SceneStill";

export function signArtworkUrl(signRef: string): string {
  return `/api/signs/${encodeURIComponent(signRef)}`;
}

/**
 * One sign face. `altBg` is the accessible label — pass "" (decorative) when
 * adjacent text already names the option, and NEVER leak the answer through
 * it on identification questions (the neutral default is deliberate).
 */
export function SignFace({
  signRef,
  altBg = "Пътен знак",
  className,
}: {
  signRef: string;
  altBg?: string;
  className?: string;
}) {
  return (
    // Plain <img>: the svg renders in its own image context (no id/style
    // collisions between multiple inline faces) and caches across questions.
    // No lazy loading: the sign IS the question — it must never pop in late.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={signArtworkUrl(signRef)}
      alt={altBg}
      draggable={false}
      decoding="async"
      className={`select-none ${className ?? ""}`}
    />
  );
}

/** True when the option list should render as a sign picture grid. */
export function hasSignOptions(
  options: readonly { media?: SignMediaRef | null }[],
): boolean {
  return options.some((o) => o.media != null);
}

/** Media block above the question text. Returns null for legacy/absent. */
export function QuestionMediaView({
  media,
  className,
}: {
  media: QuestionMedia | null;
  className?: string;
}) {
  if (media === null || !("kind" in media)) return null;

  if (media.kind === "sign") {
    return (
      <div
        className={`flex justify-center rounded-xl border border-border bg-surface-2/40 p-4 ${className ?? ""}`}
      >
        <SignFace
          signRef={media.signRef}
          className="h-28 w-28 sm:h-32 sm:w-32"
        />
      </div>
    );
  }

  return <SceneStill media={media} className={className} />;
}
