"use client";

/**
 * SceneStill — a static top-down traffic scene for visual questions (THEO-1,
 * doc 64): the question's authored poses and marks drawn over a committed
 * district map, using the SAME district/fit/draw discipline as MistakeReplay
 * (2D canvas, no three.js — theory pages stay feather-light). No animation
 * at all, so it is reduced-motion friendly by nature.
 *
 * The district json is fetched lazily on mount; the poses/marks/focus arrive
 * as validated content data via props. A failed fetch shows an honest inline
 * note (unlike the replay, the scene can be load-bearing for the question).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { SceneStillMedia, SceneStillPose } from "@/lib/content/types";
import type { MinimapPolyline } from "@/modules/sim/hud";
import {
  crossingPointsOf,
  districtRoadPolylines,
  replayToCanvas,
  type ReplayPoint,
  type ReplayView,
} from "@/modules/clips/replay/mistakeReplayCore";
import { fitSceneView, poseSizePx } from "@/modules/clips/replay/sceneStillCore";

interface DistrictLayers {
  roads: MinimapPolyline[];
  crossings: ReplayPoint[];
}

interface SceneColors {
  road: string;
  crossing: string;
  actor: string;
  ego: string;
  ped: string;
  danger: string;
  target: string;
}

function cssColor(el: HTMLElement, v: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(v).trim() || fallback;
}

const CULL_PAD_PX = 40;

function drawScene(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  view: ReplayView,
  layers: DistrictLayers,
  media: SceneStillMedia,
  colors: SceneColors,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, view.widthPx, view.heightPx);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Roads (culled off-canvas — district-v1 has ~a thousand edges).
  ctx.strokeStyle = colors.road;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const line of layers.roads) {
    if (line.points.length < 2) continue;
    let minPx = Infinity;
    let maxPx = -Infinity;
    let minPy = Infinity;
    let maxPy = -Infinity;
    const px: number[] = [];
    for (const [wx, wy] of line.points) {
      const [cx, cy] = replayToCanvas(view, wx, wy);
      px.push(cx, cy);
      if (cx < minPx) minPx = cx;
      if (cx > maxPx) maxPx = cx;
      if (cy < minPy) minPy = cy;
      if (cy > maxPy) maxPy = cy;
    }
    if (
      maxPx < -CULL_PAD_PX ||
      minPx > view.widthPx + CULL_PAD_PX ||
      maxPy < -CULL_PAD_PX ||
      minPy > view.heightPx + CULL_PAD_PX
    ) {
      continue;
    }
    ctx.moveTo(px[0], px[1]);
    for (let i = 2; i < px.length; i += 2) ctx.lineTo(px[i], px[i + 1]);
  }
  ctx.stroke();

  // Pedestrian-crossing context dots.
  ctx.fillStyle = colors.crossing;
  for (const c of layers.crossings) {
    const [cx, cy] = replayToCanvas(view, c.x, c.y);
    if (cx >= -8 && cx <= view.widthPx + 8 && cy >= -8 && cy <= view.heightPx + 8) {
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
  }

  // Marks under the actors: danger = filled pulse dot, target = open ring.
  for (const mark of media.marks ?? []) {
    const [cx, cy] = replayToCanvas(view, mark.x, mark.y);
    if (mark.kind === "danger") {
      ctx.fillStyle = colors.danger;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = colors.target;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Actors, real-world footprints at the view scale.
  for (const pose of media.poses) {
    drawPose(ctx, view, pose, colors);
  }
}

function drawPose(
  ctx: CanvasRenderingContext2D,
  view: ReplayView,
  pose: SceneStillPose,
  colors: SceneColors,
): void {
  const [cx, cy] = replayToCanvas(view, pose.x, pose.y);
  const { lengthPx, widthPx } = poseSizePx(pose.kind, view.scale);
  const fill =
    pose.variant === "ego" ? colors.ego : pose.kind === "ped" ? colors.ped : colors.actor;

  ctx.save();
  ctx.translate(cx, cy);
  // headingDeg: 0 = north (up), clockwise — canvas rotate is clockwise.
  ctx.rotate((pose.headingDeg * Math.PI) / 180);
  ctx.fillStyle = fill;

  if (pose.kind === "ped") {
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(widthPx / 2, 2.5), 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Body + a nose wedge so the travel direction reads at a glance.
    const halfL = lengthPx / 2;
    const halfW = widthPx / 2;
    ctx.beginPath();
    ctx.moveTo(-halfW, halfL);
    ctx.lineTo(-halfW, -halfL * 0.45);
    ctx.lineTo(0, -halfL);
    ctx.lineTo(halfW, -halfL * 0.45);
    ctx.lineTo(halfW, halfL);
    ctx.closePath();
    ctx.fill();
  }

  if (pose.variant === "ego") {
    // Halo so "your car" is unmistakable even in a busy scene.
    ctx.strokeStyle = colors.ego;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(lengthPx, widthPx) * 0.75 + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export function SceneStill({
  media,
  className,
  maxHeightPx,
}: {
  media: SceneStillMedia;
  className?: string;
  /**
   * Optional CAP on the drawn height. Omitted, the still is exactly what it
   * always was: 0.72 × the column width, clamped to 160–300px. Passed, the
   * scene is drawn smaller (fitSceneView scales by min(w,h), so nothing is
   * cropped — the whole focus window still reads, just at a smaller scale).
   *
   * Its only caller is QuestionArtwork's phone branch: at a 329px column this
   * still is 237px tall, 28 % of an iPhone 16, and that is what pushed the
   * answers of every scene question below the fold. See QuestionMedia.tsx.
   */
  maxHeightPx?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [layers, setLayers] = useState<DistrictLayers | null>(null);
  const [failed, setFailed] = useState(false);
  const [widthPx, setWidthPx] = useState(0);

  // Lazy district fetch — same discipline as MistakeReplay.
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/world/${media.districtId}.json`, { signal: ac.signal });
        if (!res.ok) throw new Error("fetch failed");
        const raw = (await res.json()) as unknown;
        const roads = districtRoadPolylines(raw);
        if (!roads) throw new Error("unusable district");
        if (!alive) return;
        setLayers({ roads, crossings: crossingPointsOf(raw) });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [media.districtId]);

  // The card column is responsive — track our own width. Re-observe when the
  // loading placeholder swaps for the figure (different nodes).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidthPx(el.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [layers, failed]);

  // The cap wins over the 160px floor when it is smaller — a floor that
  // overrides the caller's budget is not a budget.
  const capPx = maxHeightPx ?? 300;
  const heightPx = Math.max(
    Math.min(160, capPx),
    Math.min(capPx, Math.round(widthPx * 0.72)),
  );

  const view = useMemo(
    () => (layers && widthPx > 0 ? fitSceneView(media.focus, widthPx, heightPx) : null),
    [layers, media.focus, widthPx, heightPx],
  );

  // Single static draw per data/viewport/theme-token change — no rAF loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layers || !view) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(view.widthPx * dpr);
    canvas.height = Math.round(view.heightPx * dpr);

    const colors: SceneColors = {
      road: cssColor(canvas, "--border-strong", "#2c4066"),
      crossing: cssColor(canvas, "--border", "#24334d"),
      actor: cssColor(canvas, "--foreground", "#e6edf7"),
      ego: cssColor(canvas, "--accent", "#38bdf8"),
      ped: cssColor(canvas, "--accent-2", "#a78bfa"),
      danger: cssColor(canvas, "--danger", "#ff5b49"),
      target: cssColor(canvas, "--accent-soft", "#7cc4ff"),
    };

    drawScene(ctx, dpr, view, layers, media, colors);
  }, [layers, view, media]);

  if (failed) {
    return (
      <p
        role="status"
        className={`rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted ${className ?? ""}`}
      >
        Схемата към този въпрос не можа да се зареди. Провери връзката и
        презареди страницата.
      </p>
    );
  }

  const egoCount = media.poses.filter((p) => p.variant === "ego").length;
  const caption =
    egoCount > 0 ? (
      <figcaption className="text-[11px] font-semibold text-muted">
        Оцветеният автомобил с ореол си ти. Север е нагоре.
      </figcaption>
    ) : null;

  /* THE PLACEHOLDER IS THE SAME BOX AS THE DRAWN SCENE, caption included.
     It used to be a bare `h-40` div, so the block grew by the canvas delta
     PLUS 21px of caption the moment the district json landed. On a phone that
     is a jump under the reader's thumb, and it is also how a fold measurement
     taken during the fetch comes back clean and wrong: three scene questions
     ended up 22px past the fold with the artwork budget still reporting room,
     because the budget had measured a box that was about to grow. Everything
     the caption depends on (`media.poses`) is known before the fetch starts,
     so there is no reason to render a different shape. */
  if (!layers) {
    return (
      <figure
        ref={wrapRef}
        className={`flex w-full flex-col gap-1.5 ${className ?? ""}`}
      >
        <div
          aria-hidden
          style={{ height: heightPx }}
          className="w-full animate-pulse rounded-xl border border-border bg-surface-2/50 motion-reduce:animate-none"
        />
        {caption}
      </figure>
    );
  }

  return (
    <figure ref={wrapRef} className={`flex w-full flex-col gap-1.5 ${className ?? ""}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Схема на пътна ситуация отгоре: ${media.poses.length} участника${
          egoCount > 0 ? ", твоят автомобил е отбелязан" : ""
        }`}
        className="w-full rounded-xl border border-border bg-surface-2/60"
        style={{ height: heightPx }}
      />
      {caption}
    </figure>
  );
}

export default SceneStill;
