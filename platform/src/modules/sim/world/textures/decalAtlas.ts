/**
 * Procedural road-decal atlas — CLIENT ONLY (canvas). v1 of doc 71 §4.4's
 * decal pass: 6 grungy grayscale decals (2 tar-crack networks, 1 repair
 * patch, 1 oil stain, 1 manhole cover, 1 dirt pool) drawn deterministically
 * into a 4x4-cell RGBA atlas. Alpha IS the decal mask — the batched quad
 * mesh (builders/decals.ts) renders the whole set in ONE draw call.
 *
 * Cell layout comes from the shared manifest DECAL_CELLS so the UVs the pure
 * builder writes always address the cell drawn here. Manifest rows count
 * from the BOTTOM (UV v0); CanvasTexture flipY maps canvas row 0 (top) to
 * v = 1, so this generator flips the row when positioning each cell.
 *
 * Swap-out path: replace this module with a real CC0 atlas (cgbookcase
 * manholes, 3DTexel cracks) under public/sim/textures/decals later — the
 * manifest and mesh stay untouched.
 */

import * as THREE from "three";
import { mulberry32 } from "../builders/math2d";
import { DECAL_ATLAS_GRID, DECAL_CELLS, type DecalKind } from "../builders/decals";

function cellPainter(
  ctx: CanvasRenderingContext2D,
  kind: DecalKind,
  x0: number,
  y0: number,
  cs: number,
  rng: () => number,
): void {
  const cx = x0 + cs / 2;
  const cy = y0 + cs / 2;

  const crack = (branches: number) => {
    ctx.lineCap = "round";
    for (let b = 0; b < branches; b++) {
      let x = x0 + cs * (0.15 + rng() * 0.7);
      let y = y0 + cs * (0.15 + rng() * 0.7);
      let ang = rng() * Math.PI * 2;
      const steps = 14 + Math.floor(rng() * 10);
      ctx.strokeStyle = `rgba(12,12,14,${0.55 + rng() * 0.3})`;
      ctx.lineWidth = cs * (0.006 + rng() * 0.01);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < steps; s++) {
        ang += (rng() - 0.5) * 1.1;
        const step = cs * (0.02 + rng() * 0.045);
        x = Math.max(x0 + cs * 0.06, Math.min(x0 + cs * 0.94, x + Math.cos(ang) * step));
        y = Math.max(y0 + cs * 0.06, Math.min(y0 + cs * 0.94, y + Math.sin(ang) * step));
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Faint tar halo along the crack.
      ctx.strokeStyle = "rgba(30,30,32,0.16)";
      ctx.lineWidth = cs * 0.03;
      ctx.stroke();
    }
  };

  const blob = (bx: number, by: number, r: number, dark: number, alpha: number) => {
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, `rgba(${dark},${dark},${dark + 2},${alpha})`);
    g.addColorStop(0.75, `rgba(${dark},${dark},${dark + 2},${alpha * 0.45})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(bx - r, by - r, r * 2, r * 2);
  };

  switch (kind) {
    case "crackA":
      crack(4);
      break;
    case "crackB":
      crack(2);
      // crackB reads as one long tar-sealed snake + spurs.
      crack(3);
      break;
    case "patch": {
      // Darker fresh-asphalt rectangle with a ragged edge + seam outline.
      const w = cs * 0.74;
      const h = cs * 0.6;
      const px = cx - w / 2;
      const py = cy - h / 2;
      ctx.fillStyle = "rgba(20,21,24,0.62)";
      ctx.beginPath();
      const jag = (from: number, to: number, fixed: number, horiz: boolean) => {
        const steps = 9;
        for (let s = 0; s <= steps; s++) {
          const t = from + ((to - from) * s) / steps;
          const j = (rng() - 0.5) * cs * 0.03;
          const [qx, qy] = horiz ? [t, fixed + j] : [fixed + j, t];
          if (s === 0 && from === px && horiz && fixed === py) ctx.moveTo(qx, qy);
          else ctx.lineTo(qx, qy);
        }
      };
      jag(px, px + w, py, true);
      jag(py, py + h, px + w, false);
      jag(px + w, px, py + h, true);
      jag(py + h, py, px, false);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(8,8,10,0.5)"; // tar seam around the patch
      ctx.lineWidth = cs * 0.014;
      ctx.stroke();
      // Light speckle so the patch isn't a flat slab.
      for (let s = 0; s < 160; s++) {
        ctx.fillStyle = `rgba(70,72,76,${0.06 + rng() * 0.08})`;
        ctx.fillRect(px + rng() * w, py + rng() * h, 1.5, 1.5);
      }
      break;
    }
    case "oil": {
      blob(cx, cy, cs * 0.3, 8, 0.75);
      for (let s = 0; s < 5; s++) {
        blob(
          cx + (rng() - 0.5) * cs * 0.4,
          cy + (rng() - 0.5) * cs * 0.4,
          cs * (0.06 + rng() * 0.12),
          10,
          0.5,
        );
      }
      break;
    }
    case "manhole": {
      const r = cs * 0.36;
      // Outer collar (asphalt shadow ring), rim, lid.
      blob(cx, cy, r * 1.25, 10, 0.5);
      ctx.fillStyle = "rgba(24,25,28,0.96)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(64,66,70,0.9)";
      ctx.lineWidth = cs * 0.02;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      // Radial tread pattern + centre ring.
      ctx.strokeStyle = "rgba(58,60,64,0.7)";
      ctx.lineWidth = cs * 0.012;
      for (let s = 0; s < 16; s++) {
        const a = (s / 16) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3);
        ctx.lineTo(cx + Math.cos(a) * r * 0.84, cy + Math.sin(a) * r * 0.84);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "dirt": {
      for (let s = 0; s < 7; s++) {
        blob(
          cx + (rng() - 0.5) * cs * 0.55,
          cy + (rng() - 0.5) * cs * 0.55,
          cs * (0.1 + rng() * 0.16),
          26,
          0.22 + rng() * 0.14,
        );
      }
      break;
    }
  }
}

/**
 * Build the atlas texture (square, `size` px; 512 -> 128² cells is plenty
 * for grazing-angle road decals). Deterministic; caller disposes.
 */
export function makeDecalAtlasTexture(size: number): THREE.CanvasTexture {
  if (typeof document === "undefined") {
    throw new Error("sim/world textures are client-only (render inside <Canvas>)");
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");
  const cs = size / DECAL_ATLAS_GRID;
  const rng = mulberry32(0xdeca1);
  for (const cell of DECAL_CELLS) {
    // Manifest rows count from the bottom (UV space); canvas y runs top-down.
    const x0 = cell.cell[0] * cs;
    const y0 = (DECAL_ATLAS_GRID - 1 - cell.cell[1]) * cs;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, cs, cs);
    ctx.clip();
    cellPainter(ctx, cell.kind, x0, y0, cs, rng);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
