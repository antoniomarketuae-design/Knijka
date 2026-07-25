// Instrument-cluster canvas renderer for the „Виток" dashboard.
//
// The cluster face (dial markings, gear, warning lamps, fuel gauge) is a
// 512x256 CanvasTexture redrawn ONLY when its state hash changes (blink
// edges, gear changes, lamp toggles — a few times per second at most).
// The speedo NEEDLE is a separate 3D mesh so it sweeps at full frame rate.

export const CLUSTER_W = 512;
export const CLUSTER_H = 256;

/** Speedo dial geometry — shared by the canvas face and the 3D needle. */
export const DIAL_CX = 140;
export const DIAL_CY = 132;
export const DIAL_R = 100;
export const DIAL_MAX_KMH = 160;
/** 0 km/h points to 225° (lower-left), full scale to -45° — a 270° sweep. */
export const DIAL_START_DEG = 225;
export const DIAL_SWEEP_DEG = 270;

/** Needle angle (rad, CCW-positive as the driver sees it) for a speed. */
export function needleAngleRad(speedKmh: number): number {
  const v = Math.min(Math.abs(speedKmh), DIAL_MAX_KMH);
  return ((DIAL_START_DEG - (DIAL_SWEEP_DEG * v) / DIAL_MAX_KMH) * Math.PI) / 180;
}

export interface ClusterData {
  gear: string;
  indicatorLeftLit: boolean;
  indicatorRightLit: boolean;
  seatbeltOn: boolean;
  handbrakeOn: boolean;
  headlights: "off" | "low" | "high";
  /** N11 (VP-06): the red engine-temperature warning telltale — lit by the
   *  scenario director's telltaleLit channel (a staged cockpit stimulus). */
  tempWarnOn: boolean;
}

/** Cheap change detector so the texture only uploads when something changed. */
export function clusterHash(d: ClusterData): string {
  return `${d.gear}|${d.indicatorLeftLit ? 1 : 0}${d.indicatorRightLit ? 1 : 0}${
    d.seatbeltOn ? 1 : 0
  }${d.handbrakeOn ? 1 : 0}${d.tempWarnOn ? 1 : 0}|${d.headlights}`;
}

const BG = "#0c1016";
const PANEL_EDGE = "#232c38";
const TICK = "#c9d4e2";
const TICK_DIM = "#5c6878";
const TEXT = "#dfe6ee";
const MUTED = "#7c8899";
const ACCENT = "#39c46d";
const AMBER = "#ffa022";
const RED = "#ff4433";
const BLUE = "#5aa4ff";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Canvas angle (y-down, CW) for a dial speed — mirror of needleAngleRad. */
function dialCanvasRad(v: number): number {
  return ((-DIAL_START_DEG + (DIAL_SWEEP_DEG * v) / DIAL_MAX_KMH) * Math.PI) / 180;
}

function drawIndicatorArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dir: 1 | -1,
  lit: boolean,
): void {
  ctx.fillStyle = lit ? AMBER : "#3a3325";
  ctx.beginPath();
  ctx.moveTo(cx + dir * 16, cy - 12);
  ctx.lineTo(cx - dir * 8, cy);
  ctx.lineTo(cx + dir * 16, cy + 12);
  ctx.closePath();
  ctx.fill();
  if (lit) {
    ctx.shadowColor = AMBER;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

export function drawCluster(ctx: CanvasRenderingContext2D, d: ClusterData): void {
  ctx.clearRect(0, 0, CLUSTER_W, CLUSTER_H);

  // Panel
  roundRect(ctx, 2, 2, CLUSTER_W - 4, CLUSTER_H - 4, 22);
  ctx.fillStyle = BG;
  ctx.fill();
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 3;
  ctx.stroke();

  // --- Speedometer dial -----------------------------------------------------
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(DIAL_CX, DIAL_CY, DIAL_R + 6, dialCanvasRad(0), dialCanvasRad(DIAL_MAX_KMH));
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let v = 0; v <= DIAL_MAX_KMH; v += 10) {
    const a = dialCanvasRad(v);
    const major = v % 20 === 0;
    const r0 = DIAL_R - (major ? 14 : 8);
    ctx.strokeStyle = major ? TICK : TICK_DIM;
    ctx.lineWidth = major ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(DIAL_CX + Math.cos(a) * r0, DIAL_CY + Math.sin(a) * r0);
    ctx.lineTo(DIAL_CX + Math.cos(a) * DIAL_R, DIAL_CY + Math.sin(a) * DIAL_R);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = TEXT;
      ctx.font = "bold 17px system-ui, sans-serif";
      ctx.fillText(
        String(v),
        DIAL_CX + Math.cos(a) * (DIAL_R - 30),
        DIAL_CY + Math.sin(a) * (DIAL_R - 30),
      );
    }
  }
  ctx.fillStyle = MUTED;
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillText("км/ч", DIAL_CX, DIAL_CY + 44);
  // Hub (the 3D needle pivots over this)
  ctx.fillStyle = PANEL_EDGE;
  ctx.beginPath();
  ctx.arc(DIAL_CX, DIAL_CY, 9, 0, Math.PI * 2);
  ctx.fill();

  // --- Wordmark -------------------------------------------------------------
  ctx.fillStyle = MUTED;
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("В И Т О К", 372, 34);

  // --- Indicator arrows + gear ----------------------------------------------
  drawIndicatorArrow(ctx, 296, 92, -1, d.indicatorLeftLit);
  drawIndicatorArrow(ctx, 448, 92, 1, d.indicatorRightLit);

  roundRect(ctx, 344, 62, 56, 60, 10);
  ctx.fillStyle = "#131922";
  ctx.fill();
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = d.gear === "R" ? AMBER : ACCENT;
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.fillText(d.gear, 372, 93);

  // --- Warning lamps row ----------------------------------------------------
  // Seatbelt (red when NOT buckled — like the real telltale)
  const lampY = 152;
  const beltLit = !d.seatbeltOn;
  roundRect(ctx, 282, lampY - 18, 54, 36, 8);
  ctx.fillStyle = beltLit ? "rgba(255,68,51,0.16)" : "#11161d";
  ctx.fill();
  ctx.strokeStyle = beltLit ? RED : PANEL_EDGE;
  ctx.lineWidth = 2;
  ctx.stroke();
  const beltC = beltLit ? RED : "#3c4552";
  ctx.strokeStyle = beltC;
  ctx.lineWidth = 3;
  ctx.beginPath(); // person + diagonal strap
  ctx.arc(309, lampY - 8, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(300, lampY + 12);
  ctx.lineTo(318, lampY - 2);
  ctx.stroke();

  // Handbrake (P)
  const hbLit = d.handbrakeOn;
  roundRect(ctx, 344, lampY - 18, 54, 36, 8);
  ctx.fillStyle = hbLit ? "rgba(255,68,51,0.16)" : "#11161d";
  ctx.fill();
  ctx.strokeStyle = hbLit ? RED : PANEL_EDGE;
  ctx.stroke();
  ctx.strokeStyle = hbLit ? RED : "#3c4552";
  ctx.beginPath();
  ctx.arc(371, lampY, 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = hbLit ? RED : "#3c4552";
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillText("P", 371, lampY + 1);

  // Headlights (green low / blue high)
  const hlLit = d.headlights !== "off";
  const hlColor = d.headlights === "high" ? BLUE : ACCENT;
  roundRect(ctx, 406, lampY - 18, 54, 36, 8);
  ctx.fillStyle = hlLit
    ? d.headlights === "high"
      ? "rgba(90,164,255,0.16)"
      : "rgba(57,196,109,0.14)"
    : "#11161d";
  ctx.fill();
  ctx.strokeStyle = hlLit ? hlColor : PANEL_EDGE;
  ctx.stroke();
  const hc = hlLit ? hlColor : "#3c4552";
  ctx.strokeStyle = hc;
  ctx.lineWidth = 3;
  ctx.beginPath(); // lamp shape
  ctx.arc(426, lampY, 9, Math.PI * 0.5, Math.PI * 1.5);
  ctx.stroke();
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(432, lampY + i * 8 + (d.headlights === "high" ? 0 : 2));
    ctx.lineTo(446, lampY + i * 8 + (d.headlights === "high" ? 0 : -2));
    ctx.stroke();
  }

  // --- Engine-temperature warning telltale (N11 VP-06) ----------------------
  // Sits in the dial's unswept bottom sector (the 270° sweep leaves the
  // down-pointing gap free) — where real clusters put the coolant lamp.
  // Dark housing when off; RED + glow when the director's stimulus lights it.
  {
    const tw = d.tempWarnOn;
    const tx = 140; // dial centre x
    const ty = 210; // below "км/ч" (y 176), inside the panel
    roundRect(ctx, tx - 27, ty - 18, 54, 36, 8);
    ctx.fillStyle = tw ? "rgba(255,68,51,0.16)" : "#11161d";
    ctx.fill();
    ctx.strokeStyle = tw ? RED : PANEL_EDGE;
    ctx.lineWidth = 2;
    ctx.stroke();
    const tc = tw ? RED : "#3c4552";
    ctx.strokeStyle = tc;
    ctx.lineWidth = 3;
    if (tw) {
      ctx.shadowColor = RED;
      ctx.shadowBlur = 10;
    }
    // Thermometer stem + bulb…
    ctx.beginPath();
    ctx.moveTo(tx, ty - 12);
    ctx.lineTo(tx, ty + 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tx, ty + 4, 3.5, 0, Math.PI * 2);
    ctx.stroke();
    // …over two coolant waves.
    for (let row = 0; row < 2; row++) {
      const wy = ty + 10 + row * 5;
      ctx.beginPath();
      ctx.moveTo(tx - 14, wy);
      for (let i = 0; i < 4; i++) {
        const x0 = tx - 14 + i * 7;
        ctx.quadraticCurveTo(x0 + 3.5, wy + (i % 2 === 0 ? -3 : 3), x0 + 7, wy);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  // --- Fuel gauge (static, ~62 %) -------------------------------------------
  const fx = 292;
  const fy = 210;
  const fw = 168;
  roundRect(ctx, fx, fy - 7, fw, 14, 7);
  ctx.fillStyle = "#11161d";
  ctx.fill();
  ctx.strokeStyle = PANEL_EDGE;
  ctx.lineWidth = 2;
  ctx.stroke();
  roundRect(ctx, fx + 2, fy - 5, (fw - 4) * 0.62, 10, 5);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  ctx.fillStyle = MUTED;
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Г", fx - 14, fy + 1);
  ctx.textAlign = "center";
}
