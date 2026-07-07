// Procedural canvas textures — zero external assets, so the spike runs
// offline and has no licensing footprint. All throwaway quality.

import * as THREE from 'three';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return [canvas, ctx];
}

function finish(canvas: HTMLCanvasElement, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

function speckle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  count: number,
  colors: readonly string[],
): void {
  for (let i = 0; i < count; i++) {
    const c = colors[i % colors.length];
    if (!c) continue;
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.16 + Math.random() * 0.2;
    const s = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

/** Asphalt with edge lines + dashed centre line. V axis runs along the road. */
export function roadTexture(lengthMeters: number, textureMeters = 8): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#34373c';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, 500, ['#43464c', '#2b2e33', '#3d4046']);
  // Solid edge lines.
  ctx.fillStyle = '#cfd3d8';
  ctx.fillRect(10, 0, 5, 256);
  ctx.fillRect(241, 0, 5, 256);
  // Dashed centre line (one dash per tile → 3 m dash / 5 m gap at 8 m tiles).
  ctx.fillStyle = '#e8e4d8';
  ctx.fillRect(125, 40, 6, 96);
  return finish(canvas, 1, Math.max(1, Math.round(lengthMeters / textureMeters)));
}

/** Plain asphalt (corner rings — lane markings would smear radially). */
export function asphaltTexture(repeat = 4): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#34373c';
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, 220, ['#43464c', '#2b2e33', '#3d4046']);
  return finish(canvas, repeat, repeat);
}

/** Grass with mottled patches. */
export function grassTexture(repeat = 80): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#4f7c3a';
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, 380, ['#5d8f45', '#446a31', '#57833f', '#3f6230']);
  return finish(canvas, repeat, repeat);
}

/** Red/white hazard stripes for curbs, stripes across U. */
export function curbTexture(lengthMeters: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 32);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#c8433b' : '#e8e6e0';
    ctx.fillRect(i * 32, 0, 32, 32);
  }
  return finish(canvas, Math.max(1, Math.round(lengthMeters / 1)), 1);
}
