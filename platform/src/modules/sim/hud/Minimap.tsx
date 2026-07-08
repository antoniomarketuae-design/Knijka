"use client";

/**
 * Minimap — canvas 2D, bottom right. North-up view of the district around
 * the vehicle.
 *
 * DATA CONTRACT (stub until the runtime lands its minimap builder):
 * the runtime workstream will provide a builder that projects the district
 * graph into `MinimapFrame` = { polylines, transform }. This component only
 * DRAWS whatever it receives — no world knowledge here, so the runtime can
 * evolve the builder without touching the HUD.
 *
 *   world → canvas: px = size/2 + (x − transform.centerX) · pxPerMeter
 *                   py = size/2 − (y − transform.centerY) · pxPerMeter
 *   (world x = east, y = north — see contracts.ts / district-v1 meta)
 */

import { useEffect, useRef } from "react";

export interface MinimapPolyline {
  /** World-space [x, y] meter pairs. */
  points: Array<[number, number]>;
  /** road = neutral, route = accent (lesson path), boundary = faint. */
  kind?: "road" | "route" | "boundary";
}

export interface MinimapTransform {
  /** World point rendered at the minimap center (usually the vehicle). */
  centerX: number;
  centerY: number;
  /** Zoom: canvas pixels per world meter. */
  pxPerMeter: number;
}

export interface MinimapFrame {
  polylines: MinimapPolyline[];
  transform: MinimapTransform;
}

export interface MinimapMarker {
  x: number;
  y: number;
  kind: "objective" | "spawn";
}

export function Minimap({
  polylines,
  transform,
  vehicle,
  markers = [],
  sizePx = 168,
}: MinimapFrame & {
  vehicle?: { x: number; y: number; headingDeg: number } | null;
  markers?: MinimapMarker[];
  sizePx?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = sizePx * dpr;
    canvas.height = sizePx * dpr;
    ctx.scale(dpr, dpr);

    const css = getComputedStyle(canvas);
    const color = (v: string, fallback: string) =>
      css.getPropertyValue(v).trim() || fallback;
    const roadColor = color("--border-strong", "#33466a");
    const routeColor = color("--accent", "#3fa1ff");
    const boundaryColor = color("--border", "#24334d");
    const vehicleColor = color("--foreground", "#e6edf7");
    const objectiveColor = color("--warning", "#ffb02e");

    const half = sizePx / 2;
    const toPx = (wx: number, wy: number): [number, number] => [
      half + (wx - transform.centerX) * transform.pxPerMeter,
      half - (wy - transform.centerY) * transform.pxPerMeter,
    ];

    ctx.clearRect(0, 0, sizePx, sizePx);

    // Clip everything to the round face.
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.clip();

    for (const line of polylines) {
      if (line.points.length < 2) continue;
      const kind = line.kind ?? "road";
      ctx.strokeStyle =
        kind === "route" ? routeColor : kind === "boundary" ? boundaryColor : roadColor;
      ctx.lineWidth = kind === "route" ? 3 : kind === "boundary" ? 1 : 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const [x0, y0] = toPx(line.points[0][0], line.points[0][1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < line.points.length; i++) {
        const [x, y] = toPx(line.points[i][0], line.points[i][1]);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    for (const m of markers) {
      const [x, y] = toPx(m.x, m.y);
      ctx.fillStyle = m.kind === "objective" ? objectiveColor : routeColor;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (vehicle) {
      const [x, y] = toPx(vehicle.x, vehicle.y);
      // headingDeg: 0 = north (up), clockwise — canvas rotate is clockwise.
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((vehicle.headingDeg * Math.PI) / 180);
      ctx.fillStyle = vehicleColor;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }, [polylines, transform, vehicle, markers, sizePx]);

  return (
    <div
      aria-label="Мини карта"
      className="pointer-events-none overflow-hidden rounded-full border border-border bg-surface/75 backdrop-blur-md select-none"
      style={{ width: sizePx, height: sizePx }}
    >
      <canvas ref={canvasRef} style={{ width: sizePx, height: sizePx }} />
    </div>
  );
}
