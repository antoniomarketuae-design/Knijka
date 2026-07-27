/**
 * Instrument-cluster ATLAS — the one texture every emissive quad samples.
 *
 * Painted ONCE per cluster mount and never redrawn: this is the difference
 * from the canvas cluster it replaces, which re-rendered its whole face at
 * 10 Hz and still could not show depth. Here the canvas holds only SHAPES —
 * telltale glyphs, a mono character strip, two captions, a radial halo and a
 * solid-white patch — all in flat white, and the vertex colours decide what is
 * lit, in which colour, and how hard. One texture, one upload, no per-frame
 * canvas work at all.
 *
 * Everything is drawn white-on-transparent so a single cell serves a lamp in
 * every state; a lamp is "off" when its vertex colour is the dark rule colour
 * and "on" when it is the warning colour with a halo behind it.
 */

import {
  ATLAS_H,
  ATLAS_W,
  CHAR_CELL_H,
  CHAR_CELL_W,
  CHAR_SET,
  GLYPH_CELL,
  HALO_CELL,
  LAMP_KEYS,
  MARK_CELL,
  UNIT_CELL,
  WHITE_CELL,
  glyphCell,
  type AtlasCell,
  type LampKey,
} from "./clusterLayout";

/** Mono telemetry type (doc 83) — the readout must read as an instrument, not
 *  as UI. Falls through to whatever mono the device has. */
const MONO_STACK = 'ui-monospace, "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace';
const SANS_STACK = 'system-ui, "Segoe UI", Roboto, sans-serif';

/** Paint the whole atlas into a 2D context sized ATLAS_W × ATLAS_H. */
export function drawClusterAtlas(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const key of LAMP_KEYS) {
    const cell = glyphCell(key);
    ctx.save();
    ctx.translate(cell.x + GLYPH_CELL / 2, cell.y + GLYPH_CELL / 2);
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 7;
    drawGlyph(ctx, key);
    ctx.restore();
  }

  // Character strip — digits, then the selector letters.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < CHAR_SET.length; i++) {
    const ch = CHAR_SET[i];
    if (ch === " ") continue;
    const cx = i * CHAR_CELL_W + CHAR_CELL_W / 2;
    const cy = 128 + CHAR_CELL_H / 2;
    // Sized to fill the cell: at reel scale these are the numbers the founder
    // could not read, so they get the whole cell rather than a polite margin.
    ctx.font = `700 ${Math.round(CHAR_CELL_H * 0.86)}px ${MONO_STACK}`;
    ctx.fillText(ch, cx, cy + 2);
  }

  // Captions. Both are drawn to FILL their cell — see the R1 note on UNIT_CELL:
  // a word floating in a wide cell renders at a fraction of the size its quad
  // promises, which is how „км/ч" reached the cockpit as a smudge. fitText
  // measures and condenses so the ink lands on the cell edges instead.
  fitText(ctx, "км/ч", UNIT_CELL, 0.9, 46);
  // Spaced by hand rather than via ctx.letterSpacing — that property is not in
  // every browser's canvas yet, and the atlas must paint identically everywhere
  // (a capture machine and the founder's laptop must produce the same frame).
  fitText(ctx, "В И Т О К", MARK_CELL, 0.94, 40);

  // Radial halo — the light a lit telltale throws onto its housing.
  const hx = HALO_CELL.x + HALO_CELL.w / 2;
  const hy = HALO_CELL.y + HALO_CELL.h / 2;
  const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, HALO_CELL.w / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.34)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(HALO_CELL.x, HALO_CELL.y, HALO_CELL.w, HALO_CELL.h);

  // The solid patch untextured quads (ticks, rules, needle blade) sample.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(WHITE_CELL.x, WHITE_CELL.y, WHITE_CELL.w, WHITE_CELL.h);
}

/**
 * Draw `text` centred in `cell`, condensed horizontally so its ink spans
 * `fill` of the cell width at `size` px.
 *
 * The horizontal squeeze is deliberate and is the whole point: font metrics
 * differ between the founder's laptop, a phone and the SwiftShader capture box,
 * so a fixed font size fills a different fraction of the cell on each. Scaling
 * to a MEASURED width makes the rendered caption the same size everywhere,
 * which is the same promise `drawClusterAtlas` already makes for the glyphs.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cell: AtlasCell,
  fill: number,
  size: number,
): void {
  ctx.save();
  ctx.font = `700 ${size}px ${SANS_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  const measured = ctx.measureText(text).width || 1;
  const cx = cell.x + cell.w / 2;
  const cy = cell.y + cell.h / 2;
  ctx.translate(cx, cy);
  ctx.scale((cell.w * fill) / measured, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** One telltale glyph, drawn centred on the current origin in a ±64 box. */
function drawGlyph(ctx: CanvasRenderingContext2D, key: LampKey): void {
  switch (key) {
    case "belt":
      // Occupant + the diagonal strap: the ECE telltale, and the one lamp that
      // has to be unmistakable at a glance (the readiness reel's whole lesson).
      ctx.beginPath();
      ctx.arc(0, -32, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-22, 38);
      ctx.lineTo(-22, 2);
      ctx.quadraticCurveTo(-22, -10, -8, -10);
      ctx.lineTo(8, -10);
      ctx.quadraticCurveTo(22, -10, 22, 2);
      ctx.lineTo(22, 38);
      ctx.stroke();
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(-26, 34);
      ctx.lineTo(26, -6);
      ctx.stroke();
      break;
    case "brake":
      // (P) — the parking-brake / brake-system lamp.
      ctx.beginPath();
      ctx.arc(0, 0, 36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.setLineDash([8, 9]);
      ctx.arc(0, 0, 47, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `700 46px ${SANS_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P", 0, 2);
      break;
    case "engine":
      // Engine-block silhouette (the MIL).
      ctx.beginPath();
      ctx.moveTo(-40, 12);
      ctx.lineTo(-40, -8);
      ctx.lineTo(-26, -8);
      ctx.lineTo(-26, -22);
      ctx.lineTo(-6, -22);
      ctx.lineTo(0, -32);
      ctx.lineTo(16, -32);
      ctx.lineTo(16, -22);
      ctx.lineTo(34, -22);
      ctx.lineTo(34, -2);
      ctx.lineTo(42, -2);
      ctx.lineTo(42, 12);
      ctx.lineTo(34, 12);
      ctx.lineTo(34, 26);
      ctx.lineTo(-26, 26);
      ctx.lineTo(-26, 12);
      ctx.closePath();
      ctx.stroke();
      break;
    case "oil":
      // Oil can + drip.
      ctx.beginPath();
      ctx.moveTo(-40, 18);
      ctx.lineTo(-40, -6);
      ctx.lineTo(-4, -6);
      ctx.lineTo(10, -22);
      ctx.lineTo(10, -6);
      ctx.lineTo(24, -6);
      ctx.lineTo(24, 18);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(24, 2);
      ctx.lineTo(46, 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(40, 14);
      ctx.quadraticCurveTo(48, 26, 40, 32);
      ctx.quadraticCurveTo(32, 26, 40, 14);
      ctx.stroke();
      break;
    case "battery":
      ctx.strokeRect(-40, -20, 80, 42);
      ctx.fillRect(-26, -28, 16, 8);
      ctx.fillRect(12, -28, 16, 8);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.lineTo(-6, 0);
      ctx.moveTo(-16, -10);
      ctx.lineTo(-16, 10);
      ctx.moveTo(8, 0);
      ctx.lineTo(28, 0);
      ctx.stroke();
      break;
    case "temp":
      // Thermometer over coolant waves (the N11 / VP-06 staged telltale).
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 8, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 5;
      for (let row = 0; row < 2; row++) {
        const wy = 26 + row * 14;
        ctx.beginPath();
        ctx.moveTo(-42, wy);
        for (let i = 0; i < 4; i++) {
          const x0 = -42 + i * 21;
          ctx.quadraticCurveTo(x0 + 10, wy + (i % 2 === 0 ? -9 : 9), x0 + 21, wy);
        }
        ctx.stroke();
      }
      break;
    case "arrowLeft":
    case "arrowRight": {
      const dir = key === "arrowLeft" ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(dir * 40, 0);
      ctx.lineTo(dir * -6, -38);
      ctx.lineTo(dir * -6, -16);
      ctx.lineTo(dir * -40, -16);
      ctx.lineTo(dir * -40, 16);
      ctx.lineTo(dir * -6, 16);
      ctx.lineTo(dir * -6, 38);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
}
