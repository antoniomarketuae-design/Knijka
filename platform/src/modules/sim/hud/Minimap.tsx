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
 *
 * A15 adds `MistakeMap`: the STATIC post-session variant of the same
 * machinery — same polylines, fit-to-content transform instead of a live
 * vehicle center, and severity-coded event markers the student can tap to
 * jump to the matching mistake row on the session-end screen.
 */

import { useEffect, useMemo, useRef, useState } from "react";

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

// ---------------------------------------------------------------------------
// Shared drawing helpers (live minimap + static mistake map)
// ---------------------------------------------------------------------------

interface PolylineColors {
  road: string;
  route: string;
  boundary: string;
}

type ToPx = (wx: number, wy: number) => [number, number];

function drawPolylines(
  ctx: CanvasRenderingContext2D,
  polylines: ReadonlyArray<MinimapPolyline>,
  toPx: ToPx,
  colors: PolylineColors,
): void {
  for (const line of polylines) {
    if (line.points.length < 2) continue;
    const kind = line.kind ?? "road";
    ctx.strokeStyle =
      kind === "route" ? colors.route : kind === "boundary" ? colors.boundary : colors.road;
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
}

function cssColor(el: HTMLElement, v: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(v).trim() || fallback;
}

// ---------------------------------------------------------------------------
// Live minimap (unchanged behavior)
// ---------------------------------------------------------------------------

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

    const colors: PolylineColors = {
      road: cssColor(canvas, "--border-strong", "#33466a"),
      route: cssColor(canvas, "--accent", "#3fa1ff"),
      boundary: cssColor(canvas, "--border", "#24334d"),
    };
    const vehicleColor = cssColor(canvas, "--foreground", "#e6edf7");
    const objectiveColor = cssColor(canvas, "--warning", "#ffb02e");

    const half = sizePx / 2;
    const toPx: ToPx = (wx, wy) => [
      half + (wx - transform.centerX) * transform.pxPerMeter,
      half - (wy - transform.centerY) * transform.pxPerMeter,
    ];

    ctx.clearRect(0, 0, sizePx, sizePx);

    // Clip everything to the round face.
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.clip();

    drawPolylines(ctx, polylines, toPx, colors);

    for (const m of markers) {
      const [x, y] = toPx(m.x, m.y);
      ctx.fillStyle = m.kind === "objective" ? objectiveColor : colors.route;
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
    // „The minimap is a faint line drawing" (doc 89 §1, from the reference
    // frames — there it is a pale route with an arrow and no disc behind it).
    // The canvas keeps drawing exactly what it drew; the glass disc it sat on
    // is what goes. The ring stays: it is the only thing telling a student
    // where the map ends and the road begins.
    <div
      aria-label="Мини карта"
      className="hud-ghost pointer-events-none overflow-hidden rounded-full border border-border select-none"
      style={{ width: sizePx, height: sizePx }}
    >
      <canvas ref={canvasRef} style={{ width: sizePx, height: sizePx }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// A15 — static mistake map (session-end screen)
// ---------------------------------------------------------------------------

/**
 * Marker taxonomy of the mistake map. The three official severity classes
 * render as filled dots in their session-end colors; near-misses (A11 — the
 * "you got away with it" stat, never graded) as HOLLOW rings; commendations
 * as small positive dots (the end screen toggles them).
 */
export type MistakeMapMarkerKind =
  | "opasna"
  | "osnovna"
  | "vtorostepenna"
  | "nearMiss"
  | "commendation";

export interface MistakeMapMarker {
  /** Stable id — the end screen keys its mistake rows by the same id. */
  id: string;
  x: number;
  y: number;
  kind: MistakeMapMarkerKind;
}

/**
 * Fit-to-content transform: center the bounding box of `points` and pick the
 * zoom that shows it all with padding. Pure (exported for tests). Zoom is
 * clamped so a single-marker session does not zoom into a 4-meter blob and a
 * cross-district drive stays readable.
 */
export function fitMapTransform(
  points: ReadonlyArray<[number, number]>,
  widthPx: number,
  heightPx: number,
): MinimapTransform {
  if (points.length === 0 || widthPx <= 0 || heightPx <= 0) {
    return { centerX: 0, centerY: 0, pxPerMeter: 1 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const PAD = 0.14; // fraction of each canvas dimension kept clear around content
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const pxPerMeter = Math.min(
    (widthPx * (1 - 2 * PAD)) / spanX,
    (heightPx * (1 - 2 * PAD)) / spanY,
  );
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    pxPerMeter: Math.min(4, Math.max(0.05, pxPerMeter)),
  };
}

/** Canvas hit radius for marker taps, px (finger-friendly). */
const MARKER_HIT_RADIUS_PX = 16;

/**
 * The static post-session map: draws the district/route polylines once,
 * fitted to the ROUTE + the markers (context roads still render around
 * them), and plots every marker. Clicking/tapping a marker calls
 * `onSelect(id)` — the end screen scrolls to + flashes the matching row.
 */
export function MistakeMap({
  polylines,
  markers,
  selectedId,
  onSelect,
  heightPx = 260,
}: {
  polylines: MinimapPolyline[];
  markers: MistakeMapMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  heightPx?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [widthPx, setWidthPx] = useState(0);

  // Track the container width (the end screen column is responsive).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidthPx(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit to the lesson route + the markers; the rest of the district is
  // context and may fall outside. No route (free drive) → fit markers only.
  const transform = useMemo(() => {
    const pts: Array<[number, number]> = [];
    for (const line of polylines) {
      if (line.kind === "route") pts.push(...line.points);
    }
    for (const m of markers) pts.push([m.x, m.y]);
    if (pts.length === 0) for (const line of polylines) pts.push(...line.points);
    return fitMapTransform(pts, widthPx, heightPx);
  }, [polylines, markers, widthPx, heightPx]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || widthPx === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = widthPx * dpr;
    canvas.height = heightPx * dpr;
    ctx.scale(dpr, dpr);

    const colors: PolylineColors = {
      road: cssColor(canvas, "--border-strong", "#33466a"),
      route: cssColor(canvas, "--accent", "#3fa1ff"),
      boundary: cssColor(canvas, "--border", "#24334d"),
    };
    const markerColor: Record<MistakeMapMarkerKind, string> = {
      opasna: cssColor(canvas, "--danger", "#ff5c5c"),
      osnovna: cssColor(canvas, "--warning", "#ffb02e"),
      vtorostepenna: cssColor(canvas, "--accent-soft", "#7fb8ff"),
      nearMiss: cssColor(canvas, "--warning", "#ffb02e"),
      commendation: cssColor(canvas, "--success", "#41d18b"),
    };
    const haloColor = cssColor(canvas, "--foreground", "#e6edf7");

    const toPx: ToPx = (wx, wy) => [
      widthPx / 2 + (wx - transform.centerX) * transform.pxPerMeter,
      heightPx / 2 - (wy - transform.centerY) * transform.pxPerMeter,
    ];

    ctx.clearRect(0, 0, widthPx, heightPx);
    drawPolylines(ctx, polylines, toPx, colors);

    // Draw order = visual priority: commendations under near-misses under
    // graded mistakes (a dangerous marker must never hide beneath a dot).
    const order: MistakeMapMarkerKind[] = [
      "commendation",
      "nearMiss",
      "vtorostepenna",
      "osnovna",
      "opasna",
    ];
    for (const kind of order) {
      for (const m of markers) {
        if (m.kind !== kind) continue;
        const [x, y] = toPx(m.x, m.y);
        const selected = m.id === selectedId;
        if (selected) {
          ctx.strokeStyle = haloColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 10, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (kind === "nearMiss") {
          // Hollow ring — nothing touched, nothing graded.
          ctx.strokeStyle = markerColor.nearMiss;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, selected ? 7 : 6, 0, Math.PI * 2);
          ctx.stroke();
        } else if (kind === "commendation") {
          ctx.fillStyle = markerColor.commendation;
          ctx.globalAlpha = 0.75;
          ctx.beginPath();
          ctx.arc(x, y, selected ? 4.5 : 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = markerColor[kind];
          ctx.beginPath();
          ctx.arc(x, y, selected ? 6.5 : 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, [polylines, markers, selectedId, transform, widthPx, heightPx]);

  const hitTest = (clientX: number, clientY: number): MistakeMapMarker | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    let best: MistakeMapMarker | null = null;
    let bestD = MARKER_HIT_RADIUS_PX;
    for (const m of markers) {
      const mx = widthPx / 2 + (m.x - transform.centerX) * transform.pxPerMeter;
      const my = heightPx / 2 - (m.y - transform.centerY) * transform.pxPerMeter;
      const d = Math.hypot(mx - px, my - py);
      if (d <= bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  };

  return (
    <div ref={wrapRef} className="w-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Карта на грешките: ${markers.length} отбелязани събития. Докосни маркер, за да видиш грешката в списъка.`}
        className="w-full rounded-xl border border-border bg-surface-2/60"
        style={{ height: heightPx, touchAction: "manipulation" }}
        onClick={(e) => {
          const hit = hitTest(e.clientX, e.clientY);
          if (hit) onSelect(hit.id);
        }}
        onMouseMove={(e) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          canvas.style.cursor = hitTest(e.clientX, e.clientY) ? "pointer" : "default";
        }}
      />
    </div>
  );
}
