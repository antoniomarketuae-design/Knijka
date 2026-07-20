"use client";

/**
 * MistakeMedia — the ONE shared mistake visual (why-panel + consequence
 * overlay, no forks). Founder ruling (the clip pilot, docs 62..64 follow-up):
 * when the clip manifest has a pre-produced REAL-ENGINE video of this
 * mistake trace, play the video; the 2D canvas replay (MistakeReplay) stays
 * as the placeholder/fallback — no clip, manifest missing, or the .webm
 * 404s (clips live outside git; a fresh clone has none).
 *
 * Video hygiene: preload="none" until the element is actually visible
 * (IntersectionObserver), then metadata loads and playback starts — muted,
 * looped, inline, with controls. prefers-reduced-motion never auto-plays.
 * The box gets the SAME height formula as the canvas replay, so swapping
 * between the resolving placeholder, the video and the canvas never jumps
 * the panel layout.
 */

import { useEffect, useRef, useState } from "react";
import {
  clipForTracePath,
  fetchClipManifest,
  type MistakeClip,
} from "./clipManifest";
import MistakeReplay from "./MistakeReplay";

/** The canvas replay's height rule — kept identical to avoid layout jumps. */
function mediaHeightPx(widthPx: number): number {
  return Math.max(140, Math.min(240, Math.round(widthPx * 0.72)));
}

function ClipVideo({
  clip,
  className,
  onFail,
}: {
  clip: MistakeClip;
  className?: string;
  /** The quiet 404/decode fallback — the parent swaps in the canvas. */
  onFail: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [widthPx, setWidthPx] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidthPx(el.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // preload=none until the section scrolls into view; play only while seen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (visible) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // play() upgrades the load itself; reduced motion keeps the first
      // frame (metadata) and leaves starting to the visible controls.
      if (!reduced) video.play().catch(() => {});
    } else if (!video.paused) {
      video.pause();
    }
  }, [visible]);

  return (
    <div ref={wrapRef} className={`w-full ${className ?? ""}`}>
      {/* No poster asset in the manifest contract — the first frame stands
          in once metadata loads (visible → preload="metadata"). */}
      <video
        ref={videoRef}
        src={clip.src}
        preload={visible ? "metadata" : "none"}
        muted
        loop
        playsInline
        controls
        onError={onFail}
        aria-label={`Видео от симулатора: ${clip.titleBg}`}
        className="w-full rounded-xl border border-border bg-surface-2/60 object-contain"
        style={{ height: mediaHeightPx(widthPx) }}
      />
    </div>
  );
}

export function MistakeMedia({
  tracePath,
  districtId,
  className,
}: {
  /** Public trace URL ("/traces/…") or repo path — the matcher normalizes. */
  tracePath: string;
  /** District under public/world/ — the canvas fallback's home map. */
  districtId: string;
  className?: string;
}) {
  // The resolve is keyed by its trace, so a tracePath change derives back to
  // "resolving" (and a stale failure stops applying) without effect resets.
  const [resolved, setResolved] = useState<{
    trace: string;
    clip: MistakeClip | null;
  } | null>(null);
  const [failedClipId, setFailedClipId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // One tiny cached fetch per page lifetime (clipManifest.ts); any failure
    // resolves [] → canvas fallback, exactly today's behavior.
    fetchClipManifest().then((clips) => {
      if (alive) setResolved({ trace: tracePath, clip: clipForTracePath(clips, tracePath) });
    });
    return () => {
      alive = false;
    };
  }, [tracePath]);

  const clip =
    resolved !== null && resolved.trace === tracePath ? resolved.clip : undefined;
  const videoFailed = clip != null && failedClipId === clip.id;

  if (clip === undefined) {
    // Same pulse box as the dynamic-import loading state — no jump while the
    // (cached, tiny) manifest resolves.
    return (
      <div className={className}>
        <div
          aria-hidden
          className="h-36 w-full animate-pulse rounded-xl border border-border bg-surface-2/50 motion-reduce:animate-none"
        />
      </div>
    );
  }

  if (clip === null || videoFailed) {
    return <MistakeReplay tracePath={tracePath} districtId={districtId} className={className} />;
  }

  return <ClipVideo clip={clip} className={className} onFail={() => setFailedClipId(clip.id)} />;
}

export default MistakeMedia;
