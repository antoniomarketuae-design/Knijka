/**
 * BG road-sign textures. Primary path: rasterize the real SVGs from
 * content/signs/svg (Б1, Б2, В26, Д11) fetched from `signSvgBaseUrl`.
 * Fallback: procedural canvas replicas (same shapes/colors as the SVG
 * catalog) so the world renders correctly even before the sign assets are
 * exposed at a URL. CLIENT ONLY.
 */

import * as THREE from "three";
import type { SignKind } from "../types";

export const SIGN_SVG_FILES: Record<SignKind, string> = {
  giveWay: "b1.svg",
  stop: "b2.svg",
  limit50: "v26.svg",
  roundabout: "d11.svg",
};

const SIGN_RED = "#c1121f";
const SIGN_BLUE = "#0059a3";
const INK = "#1d1d1b";

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (typeof document === "undefined") {
    throw new Error("sim/world sign textures are client-only");
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");
  return { canvas, ctx };
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Procedural replicas of the catalog SVGs (200x200 viewBox scaled to size).
 * Transparent background — plates use alphaTest.
 */
export function proceduralSignTexture(kind: SignKind, size: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const s = size / 200; // match the SVG viewBox coordinates
  ctx.scale(s, s);
  ctx.lineJoin = "round";
  switch (kind) {
    case "stop": {
      // Octagon, white rim, STOP.
      const pts = [
        [183, 134], [134, 183], [66, 183], [17, 134], [17, 66], [66, 17], [134, 17], [183, 66],
      ];
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x!, y!) : ctx.lineTo(x!, y!)));
      ctx.closePath();
      ctx.fillStyle = SIGN_RED;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 52px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("STOP", 100, 118);
      break;
    }
    case "giveWay": {
      ctx.beginPath();
      ctx.moveTo(14, 30);
      ctx.lineTo(186, 30);
      ctx.lineTo(100, 178);
      ctx.closePath();
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = SIGN_RED;
      ctx.lineWidth = 16;
      ctx.stroke();
      break;
    }
    case "limit50": {
      ctx.beginPath();
      ctx.arc(100, 100, 88, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = SIGN_RED;
      ctx.lineWidth = 20;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = "bold 72px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("50", 100, 126);
      break;
    }
    case "roundabout": {
      // Д11 — mandatory roundabout: blue disc, three white arrows CCW.
      ctx.beginPath();
      ctx.arc(100, 100, 90, 0, Math.PI * 2);
      ctx.fillStyle = SIGN_BLUE;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 14;
      ctx.lineCap = "round";
      for (let k = 0; k < 3; k++) {
        const a0 = (k * 2 * Math.PI) / 3;
        const a1 = a0 + (2 * Math.PI) / 3 - 0.55;
        ctx.beginPath();
        ctx.arc(100, 100, 46, a0, a1);
        ctx.stroke();
        // Arrowhead at the end of each arc (counter-clockwise flow).
        const hx = 100 + 46 * Math.cos(a1);
        const hy = 100 + 46 * Math.sin(a1);
        const tangent = a1 + Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(hx + 16 * Math.cos(tangent), hy + 16 * Math.sin(tangent));
        ctx.lineTo(hx + 13 * Math.cos(a1 + Math.PI), hy + 13 * Math.sin(a1 + Math.PI));
        ctx.moveTo(hx + 16 * Math.cos(tangent), hy + 16 * Math.sin(tangent));
        ctx.lineTo(hx + 13 * Math.cos(a1), hy + 13 * Math.sin(a1));
        ctx.stroke();
      }
      break;
    }
  }
  return finish(canvas);
}

/**
 * Try to rasterize the real catalog SVG. `limit50` reuses В26 with its
 * example value swapped to the BG urban default 50. Resolves null on any
 * failure (caller keeps the procedural texture).
 */
export async function loadSignTextureFromSvg(
  kind: SignKind,
  baseUrl: string,
  size: number,
): Promise<THREE.CanvasTexture | null> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/${SIGN_SVG_FILES[kind]}`);
    if (!res.ok) return null;
    let svg = await res.text();
    if (kind === "limit50") {
      svg = svg.replace(/>\s*60\s*</, ">50<");
    }
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("svg decode failed"));
        el.src = url;
      });
      const { canvas, ctx } = makeCanvas(size);
      ctx.drawImage(img, 0, 0, size, size);
      return finish(canvas);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
