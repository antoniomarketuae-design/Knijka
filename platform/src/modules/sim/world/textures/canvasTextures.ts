/**
 * Procedural canvas textures — CLIENT ONLY (needs document). Everything is
 * deterministic (seeded PRNG), sized by quality preset, and kept <= 1024 px
 * per the world performance budget.
 *
 * Style target: stylized-modern — muted Sofia palette, soft noise, readable
 * shapes; no photo textures.
 */

import * as THREE from "three";
import { mulberry32 } from "../builders/math2d";

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (typeof document === "undefined") {
    throw new Error("sim/world textures are client-only (render inside <Canvas>)");
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");
  return { canvas, ctx };
}

function finishTexture(canvas: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Scatter translucent single-pixel-ish speckles. */
function speckle(
  ctx: CanvasRenderingContext2D,
  size: number,
  count: number,
  rng: () => number,
  colors: string[],
  maxR = 1.6,
): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)]!;
    ctx.globalAlpha = 0.05 + rng() * 0.1;
    const r = 0.4 + rng() * maxR;
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Large soft blotches for tonal variation. */
function blotches(
  ctx: CanvasRenderingContext2D,
  size: number,
  count: number,
  rng: () => number,
  color: string,
  alpha: number,
): void {
  for (let i = 0; i < count; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = size * (0.08 + rng() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = alpha * (0.5 + rng() * 0.5);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------

export function makeAsphaltTexture(size: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const rng = mulberry32(101);
  ctx.fillStyle = "#35383c";
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, 10, rng, "rgba(22,24,27,1)", 0.16);
  blotches(ctx, size, 8, rng, "rgba(78,82,88,1)", 0.1);
  speckle(ctx, size, size * 3, rng, ["#565b61", "#212428", "#4a4e54", "#2c3033"]);
  return finishTexture(canvas);
}

export function makeSidewalkTexture(size: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const rng = mulberry32(202);
  ctx.fillStyle = "#9fa3a1";
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, 6, rng, "rgba(120,124,122,1)", 0.14);
  speckle(ctx, size, size * 2, rng, ["#8b8f8d", "#b2b6b3", "#7e827f"]);
  // Paving tile grooves along v (strip length direction).
  ctx.strokeStyle = "rgba(70,74,72,0.5)";
  ctx.lineWidth = Math.max(1, size / 256);
  const tiles = 4;
  for (let i = 0; i <= tiles; i++) {
    const y = (i * size) / tiles;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  return finishTexture(canvas);
}

export function makeGrassTexture(size: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const rng = mulberry32(303);
  ctx.fillStyle = "#77875c";
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, 12, rng, "rgba(94,110,70,1)", 0.22);
  blotches(ctx, size, 8, rng, "rgba(139,128,92,1)", 0.12); // dry patches
  blotches(ctx, size, 6, rng, "rgba(122,140,88,1)", 0.16);
  speckle(ctx, size, size * 3, rng, ["#5f7247", "#8a9a68", "#6c7d53", "#93855e"], 2.2);
  return finishTexture(canvas);
}

export function makeRoofTexture(size: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const rng = mulberry32(404);
  ctx.fillStyle = "#585c60";
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, 8, rng, "rgba(40,43,46,1)", 0.18);
  speckle(ctx, size, size * 2, rng, ["#6a6e72", "#464a4e", "#75797d"]);
  return finishTexture(canvas);
}

// ---------------------------------------------------------------------------
// Facades — 4 Sofia-plausible palettes; texture = 4x4 window bays (one bay
// per 3 m x 3 m of wall). Returned pair: albedo (day) + emissive (lit
// windows for night). Same layout so the two line up.
// ---------------------------------------------------------------------------

export interface FacadePalette {
  base: string;
  trim: string;
  window: string;
  seams: "panel" | "brick" | "none";
}

export const FACADE_PALETTES: FacadePalette[] = [
  { base: "#b6b2ab", trim: "#a19d95", window: "#2c3540", seams: "panel" }, // panelka
  { base: "#9d6d55", trim: "#8a5d48", window: "#262f38", seams: "brick" }, // brick
  { base: "#d0c2a5", trim: "#b9ab8e", window: "#303b46", seams: "none" }, // warm plaster
  { base: "#adb8bd", trim: "#98a3a8", window: "#242e39", seams: "none" }, // cool plaster
];

export function makeFacadeTextures(
  variant: number,
  size: number,
): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const palette = FACADE_PALETTES[variant % FACADE_PALETTES.length]!;
  const rng = mulberry32(1000 + variant * 77);
  const bays = 4;
  const cell = size / bays;

  const day = makeCanvas(size);
  const night = makeCanvas(size);
  day.ctx.fillStyle = palette.base;
  day.ctx.fillRect(0, 0, size, size);
  night.ctx.fillStyle = "#000000";
  night.ctx.fillRect(0, 0, size, size);

  blotches(day.ctx, size, 6, rng, "rgba(0,0,0,1)", 0.06);
  speckle(day.ctx, size, size, rng, [palette.trim, "#ffffff"], 1.2);

  // Seams.
  if (palette.seams === "panel") {
    day.ctx.strokeStyle = "rgba(60,60,60,0.35)";
    day.ctx.lineWidth = Math.max(1, size / 256);
    for (let i = 0; i <= bays; i++) {
      day.ctx.beginPath();
      day.ctx.moveTo(i * cell, 0);
      day.ctx.lineTo(i * cell, size);
      day.ctx.stroke();
      day.ctx.beginPath();
      day.ctx.moveTo(0, i * cell);
      day.ctx.lineTo(size, i * cell);
      day.ctx.stroke();
    }
  } else if (palette.seams === "brick") {
    day.ctx.strokeStyle = "rgba(70,45,35,0.28)";
    day.ctx.lineWidth = Math.max(1, size / 512);
    const rows = 24;
    for (let i = 0; i <= rows; i++) {
      const y = (i * size) / rows;
      day.ctx.beginPath();
      day.ctx.moveTo(0, y);
      day.ctx.lineTo(size, y);
      day.ctx.stroke();
    }
  }

  // Windows: one per bay. Canvas y=0 is texture TOP (v=1), but bays tile so
  // orientation doesn't matter. ~35% lit at night, warm tones.
  const w = cell * 0.46;
  const h = cell * 0.56;
  for (let bx = 0; bx < bays; bx++) {
    for (let by = 0; by < bays; by++) {
      const x = bx * cell + (cell - w) / 2;
      const y = by * cell + cell * 0.2;
      // Frame + glass with per-window shade jitter.
      day.ctx.fillStyle = palette.trim;
      day.ctx.fillRect(x - cell * 0.03, y - cell * 0.03, w + cell * 0.06, h + cell * 0.06);
      const shade = 0.85 + rng() * 0.3;
      day.ctx.fillStyle = palette.window;
      day.ctx.fillRect(x, y, w, h);
      day.ctx.fillStyle = `rgba(160,190,215,${0.1 * shade})`;
      day.ctx.fillRect(x, y, w, h * 0.45); // sky reflection band
      // Mullion.
      day.ctx.strokeStyle = palette.trim;
      day.ctx.lineWidth = Math.max(1, size / 384);
      day.ctx.beginPath();
      day.ctx.moveTo(x + w / 2, y);
      day.ctx.lineTo(x + w / 2, y + h);
      day.ctx.stroke();

      if (rng() < 0.35) {
        const warm = 200 + Math.floor(rng() * 55);
        night.ctx.fillStyle = `rgb(${warm},${Math.floor(warm * 0.72)},${Math.floor(warm * 0.38)})`;
        night.ctx.fillRect(x, y, w, h);
        if (rng() < 0.4) {
          // Half-lit (curtain) variant.
          night.ctx.fillStyle = "#000000";
          night.ctx.fillRect(x, y, w / 2, h);
        }
      }
    }
  }

  return { map: finishTexture(day.canvas), emissiveMap: finishTexture(night.canvas) };
}
