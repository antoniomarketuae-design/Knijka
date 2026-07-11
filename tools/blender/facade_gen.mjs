#!/usr/bin/env node
/**
 * Procedural facade texture author (doc 71 §4.5 / doc 70 REF 1) — the Node
 * replacement for the fragile Cycles bake in facade_atlas.py, which shipped
 * flat-white/empty textures. Everything here is deterministic pixel raster
 * (typed-array scene + sharp encode), the same self-authored, CC0-by-
 * construction approach as tools/blender/streetscape.py's marking atlas.
 *
 * Emits the SAME contract facade_atlas.py did, so pack_textures.mjs and
 * district_kit_v3.py consume it unchanged:
 *
 *   tools/blender/work/facade_bakes/<set>/{color,normal,orm,emissive}.png
 *   tools/blender/work/facade_bakes/layout.json
 *
 * Five sets, each a seamless tiling material at TRUE world scale
 * (bay tile = 12.0 m U x 11.4 m V = 3 floors; trim atlas = 12.0 m U x 13.7 m
 * of stacked strips):
 *
 *   bay_grid     beige/grey exposed-concrete PUNCHED GRID (deep window
 *                recesses in chamfered piers, dark glass, per-cell lit)
 *   bay_strip    cream precast VERTICAL FINS + full-height glazing strips
 *   bay_curtain  bronze unitized CURTAIN WALL, tight 1.5 m mullion grid, most lit
 *   bay_band     white HORIZONTAL BANDS + dark glass ribbons (corporate HQ)
 *   trim         1024^2 atlas: podium stone / retail glazing / parapet /
 *                red signage / dark louver band
 *
 * For each set four coherent maps are derived from one authored "scene"
 * (albedo + a height field + per-pixel roughness/metal/emissive):
 *   color     sRGB albedo (concrete grunge + window grid drawn in)
 *   normal    tangent-space, Sobel of the height field (real recess relief)
 *   orm       R=AO (baked contact shadow in the recesses / under sills),
 *             G=roughness (glass smooth ~0.1, concrete rough ~0.8),
 *             B=metalness (glass slightly metallic, concrete 0)
 *   emissive  a random 15-35 % subset of panes lit warm (night + bloom)
 *
 * Authored at 2x (SS) and box-downsampled for clean edges. All geometry snaps
 * to each system's whole-bay module so the tile is seamless at the module
 * rhythm the kit UVs (district_kit_v3.py) and prism UVs (buildings.ts) expect.
 *
 *   node tools/blender/facade_gen.mjs [outDir]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join as joinPath } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import process from "node:process";

const platformDir = fileURLToPath(new URL("../../platform/", import.meta.url));
const requireFromPlatform = createRequire(pathToFileURL(joinPath(platformDir, "package.json")));
const sharp = requireFromPlatform("sharp");

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const outDir = process.argv[2] ?? joinPath(repoRoot, "tools", "blender", "work", "facade_bakes");

// ---------------------------------------------------------------------------
// shared tile contract (mirrors facade_atlas.py — do NOT change without also
// updating manifest layout + the kit/prism UV scale)
// ---------------------------------------------------------------------------
const FLOOR_H = 3.8;
const TILE_U = 12.0; // bay texture world width  (m)
const TILE_V = 3 * FLOOR_H; // bay texture world height (m) = 11.4
const BAY_RES = 512; // final px for the 4 bay sets
const TRIM_RES = 1024; // final px for the trim atlas
const SS = 2; // supersample factor (author 2x, box-downsample)
const TRIM_TILE_U = 12.0;
const TRIM_TOTAL_V = 13.7;

// trim strips: [z0, z1] board metres, bottom-up (mirrors facade_atlas.py)
const TRIM_STRIPS = {
  podium: [0.0, 4.5],
  retail: [4.8, 8.7],
  parapet: [9.0, 11.2],
  sign: [11.5, 12.4],
  louver: [12.7, 13.7],
};

// per-system bay module (whole-bay snap step) + lit-window percentage
const BAY_MODULE = { grid: 3.0, strip: 2.4, curtain: 1.5, band: 3.0 };
const LIT_PCT = { grid: 0.3, strip: 0.22, curtain: 0.35, band: 0.2 };

// ---------------------------------------------------------------------------
// deterministic PRNG + value noise (self-made)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1]. */
function vnoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Fractal (fbm) value noise in [0,1]. */
function fbm(x, y, seed, oct = 4) {
  let f = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    f += amp * vnoise(x, y, seed + o * 101);
    norm += amp;
    x *= 2.03;
    y *= 2.01;
    amp *= 0.5;
  }
  return f / norm;
}

// ---------------------------------------------------------------------------
// the authored "scene": per-pixel albedo + height + roughness + metal + emit,
// in board space (x right in metres, z up in metres). Row 0 of the emitted PNG
// is the TOP (glTF v=0 at image top; loader uses flipY=false) — z=tileV maps to
// the top row, z=0 to the bottom — matching facade_atlas.py's saved orientation.
// ---------------------------------------------------------------------------
class Scene {
  constructor(tileU, tileV, wPx, hPx) {
    this.tileU = tileU;
    this.tileV = tileV;
    this.W = wPx;
    this.H = hPx;
    const n = wPx * hPx;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.h = new Float32Array(n); // height 0..1 (front = 1)
    this.rough = new Float32Array(n).fill(0.85);
    this.metal = new Float32Array(n);
    this.er = new Float32Array(n);
    this.eg = new Float32Array(n);
    this.eb = new Float32Array(n);
  }

  col(x) {
    return (x / this.tileU) * this.W;
  }
  row(z) {
    return (1 - z / this.tileV) * this.H;
  }

  /** Fill a board-space rect [x0,x1] x [z0,z1] with props, wrapping on BOTH
   *  axes (torus) so anything crossing a tile edge stays seamless. */
  rect(x0, x1, z0, z1, p) {
    const c0 = this.col(x0);
    const c1 = this.col(x1);
    const r1 = this.row(z0); // z0 (low) -> larger row (bottom)
    const r0 = this.row(z1); // z1 (high) -> smaller row (top)
    const ca = Math.round(Math.min(c0, c1));
    const cb = Math.round(Math.max(c0, c1));
    const ra = Math.round(Math.min(r0, r1));
    const rb = Math.round(Math.max(r0, r1));
    for (let rr = ra; rr < rb; rr++) {
      const yy = ((rr % this.H) + this.H) % this.H;
      for (let cc = ca; cc < cb; cc++) {
        const xx = ((cc % this.W) + this.W) % this.W;
        const i = yy * this.W + xx;
        if (p.r !== undefined) {
          this.r[i] = p.r;
          this.g[i] = p.g;
          this.b[i] = p.b;
        }
        if (p.h !== undefined) this.h[i] = p.h;
        if (p.rough !== undefined) this.rough[i] = p.rough;
        if (p.metal !== undefined) this.metal[i] = p.metal;
        if (p.er !== undefined) {
          this.er[i] = p.er;
          this.eg[i] = p.eg;
          this.eb[i] = p.eb;
        }
      }
    }
  }

  /** Thin vertical line (mullion / joint) centred at board x, width w metres. */
  vline(x, w, z0, z1, p) {
    this.rect(x - w / 2, x + w / 2, z0, z1, p);
  }
  /** Thin horizontal line centred at board z, height w metres. */
  hline(z, w, x0, x1, p) {
    this.rect(x0, x1, z - w / 2, z + w / 2, p);
  }
}

// ---------------------------------------------------------------------------
// palettes (sRGB 0..1). Bay concretes authored NEUTRAL/light: district_kit_v3
// tints them per tone (COLOR_0) and both prisms + towers multiply facadeTint.
// ---------------------------------------------------------------------------
const C = {
  concreteGrid: [0.74, 0.71, 0.66],
  concreteGridDk: [0.52, 0.5, 0.47],
  cream: [0.82, 0.74, 0.56],
  creamDk: [0.6, 0.53, 0.4],
  bandWhite: [0.86, 0.85, 0.82],
  bandWhiteDk: [0.62, 0.61, 0.59],
  glassDark: [0.05, 0.06, 0.085],
  glassDarkDeep: [0.03, 0.038, 0.055],
  glassBronze: [0.15, 0.105, 0.06],
  glassBronzeDeep: [0.09, 0.06, 0.035],
  glassBronzeSky: [0.26, 0.2, 0.14],
  mullionDark: [0.11, 0.115, 0.125],
  mullionBronze: [0.46, 0.33, 0.18],
  stone: [0.55, 0.5, 0.42],
  stoneDk: [0.4, 0.36, 0.3],
  plinth: [0.19, 0.175, 0.16],
  parapet: [0.78, 0.77, 0.74],
  metalDark: [0.1, 0.1, 0.11],
  signRed: [0.34, 0.04, 0.05],
};

// warm interior-light emissive (varied warmth/brightness)
function litColor(rng) {
  const warm = rng();
  const bright = 0.62 + 0.38 * rng();
  return [1.0 * bright, (0.6 + 0.16 * warm) * bright, (0.3 + 0.2 * warm) * bright];
}

function jitterRGB(base, dk, t) {
  return [base[0] + (dk[0] - base[0]) * t, base[1] + (dk[1] - base[1]) * t, base[2] + (dk[2] - base[2]) * t];
}

// ---------------------------------------------------------------------------
// SYSTEM A — bay_grid: exposed-concrete punched grid
// ---------------------------------------------------------------------------
function buildGrid(W, H) {
  const s = new Scene(TILE_U, TILE_V, W, H);
  const rng = mulberry32(1101);
  const PITCH = 3.0;
  const PIER = 0.9;
  const nBays = Math.round(TILE_U / PITCH); // 4
  const nFloors = Math.round(TILE_V / FLOOR_H); // 3

  // 1) dark glass backing across the whole board (recessed)
  s.rect(0, TILE_U, 0, TILE_V, {
    r: C.glassDarkDeep[0], g: C.glassDarkDeep[1], b: C.glassDarkDeep[2],
    h: 0.12, rough: 0.12, metal: 0.55,
  });

  // 2) concrete spandrel bands (raised, front plane) at each floor line
  for (let f = 0; f <= nFloors; f++) {
    const z = f * FLOOR_H;
    s.rect(0, TILE_U, z - 0.9, z + 0.7, {
      r: C.concreteGrid[0], g: C.concreteGrid[1], b: C.concreteGrid[2],
      h: 0.9, rough: 0.82, metal: 0.0,
    });
  }

  // 3) vertical piers (raised) — chamfer read via a darker inner reveal edge
  for (let c = 0; c <= nBays; c++) {
    const x = c * PITCH;
    s.vline(x, PIER, 0, TILE_V, {
      r: C.concreteGrid[0], g: C.concreteGrid[1], b: C.concreteGrid[2],
      h: 0.95, rough: 0.8, metal: 0.0,
    });
    // chamfer shadow reveals on both faces of the pier
    s.vline(x - PIER / 2 + 0.08, 0.06, 0, TILE_V, {
      r: C.concreteGridDk[0], g: C.concreteGridDk[1], b: C.concreteGridDk[2], h: 0.72,
    });
    s.vline(x + PIER / 2 - 0.08, 0.06, 0, TILE_V, {
      r: C.concreteGridDk[0], g: C.concreteGridDk[1], b: C.concreteGridDk[2], h: 0.72,
    });
  }

  // 4) per-cell recessed glass pane + mullion frame + lit subset
  for (let c = 0; c < nBays; c++) {
    for (let f = 0; f < nFloors; f++) {
      const x0 = c * PITCH + PIER / 2;
      const x1 = (c + 1) * PITCH - PIER / 2;
      const z0 = f * FLOOR_H + 0.7;
      const z1 = (f + 1) * FLOOR_H - 0.9;
      // recessed dark glass pane (slight per-cell tone variation)
      const t = 0.15 * rng();
      const gc = jitterRGB(C.glassDark, C.glassDarkDeep, t);
      s.rect(x0, x1, z0, z1, { r: gc[0], g: gc[1], b: gc[2], h: 0.18, rough: 0.1, metal: 0.5 });
      // mullion frame around the pane (mid depth, thin)
      const mp = { r: C.mullionDark[0], g: C.mullionDark[1], b: C.mullionDark[2], h: 0.62, rough: 0.4, metal: 0.4 };
      s.rect(x0, x1, z0, z0 + 0.09, mp);
      s.rect(x0, x1, z1 - 0.09, z1, mp);
      s.vline(x0 + 0.05, 0.09, z0, z1, mp);
      s.vline(x1 - 0.05, 0.09, z0, z1, mp);
      // central transom bar
      s.hline((z0 + z1) / 2, 0.09, x0, x1, mp);
      // lit interior
      if (rng() < LIT_PCT.grid) {
        const L = litColor(rng);
        s.rect(x0 + 0.12, x1 - 0.12, z0 + 0.12, z1 - 0.12, {
          r: L[0] * 0.14, g: L[1] * 0.14, b: L[2] * 0.14, er: L[0], eg: L[1], eb: L[2], rough: 0.3,
        });
      }
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// SYSTEM B — bay_strip: cream precast vertical fins + glazing strips
// ---------------------------------------------------------------------------
function buildStrip(W, H) {
  const s = new Scene(TILE_U, TILE_V, W, H);
  const rng = mulberry32(2102);
  const PITCH = 2.4;
  const FIN = 1.0;
  const nBays = Math.round(TILE_U / PITCH); // 5
  const nFloors = Math.round(TILE_V / FLOOR_H);

  // 1) full-height dark glass strips (recessed) across everything
  s.rect(0, TILE_U, 0, TILE_V, {
    r: C.glassDark[0], g: C.glassDark[1], b: C.glassDark[2], h: 0.2, rough: 0.11, metal: 0.55,
  });

  // 2) horizontal spandrel slab behind glass at each floor line (darker glass)
  for (let f = 0; f <= nFloors; f++) {
    const z = f * FLOOR_H;
    s.rect(0, TILE_U, z - 0.5, z + 0.35, {
      r: C.glassBronzeDeep[0] * 0.6, g: C.glassBronzeDeep[1] * 0.6, b: C.glassBronzeDeep[2] * 0.7,
      h: 0.45, rough: 0.5, metal: 0.3,
    });
    // thin cream sill lip on top of each spandrel
    s.hline(z + 0.35, 0.12, 0, TILE_U, {
      r: C.cream[0], g: C.cream[1], b: C.cream[2], h: 0.72, rough: 0.7, metal: 0,
    });
  }

  // 3) projecting cream fins (raised, strong side reveal)
  for (let c = 0; c <= nBays; c++) {
    const x = c * PITCH;
    s.vline(x, FIN, 0, TILE_V, { r: C.cream[0], g: C.cream[1], b: C.cream[2], h: 0.96, rough: 0.7, metal: 0 });
    // darker deep-reveal edges (the projecting shadow flanks)
    s.vline(x - FIN / 2 + 0.06, 0.06, 0, TILE_V, {
      r: C.creamDk[0], g: C.creamDk[1], b: C.creamDk[2], h: 0.66,
    });
    s.vline(x + FIN / 2 - 0.06, 0.06, 0, TILE_V, {
      r: C.creamDk[0], g: C.creamDk[1], b: C.creamDk[2], h: 0.66,
    });
  }

  // 4) lit interiors scattered in the glazing strips
  for (let c = 0; c < nBays; c++) {
    for (let f = 0; f < nFloors; f++) {
      if (rng() < LIT_PCT.strip) {
        const x0 = c * PITCH + FIN / 2 + 0.12;
        const x1 = (c + 1) * PITCH - FIN / 2 - 0.12;
        const z0 = f * FLOOR_H + 0.6;
        const z1 = (f + 1) * FLOOR_H - 0.2;
        const L = litColor(rng);
        s.rect(x0, x1, z0, z1, {
          r: L[0] * 0.14, g: L[1] * 0.14, b: L[2] * 0.14, er: L[0], eg: L[1], eb: L[2], rough: 0.3,
        });
      }
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// SYSTEM C — bay_curtain: bronze curtain wall, tight 1.5 m mullion grid
// ---------------------------------------------------------------------------
function buildCurtain(W, H) {
  const s = new Scene(TILE_U, TILE_V, W, H);
  const rng = mulberry32(3103);
  const MOD = 1.5;
  const nBays = Math.round(TILE_U / MOD); // 8
  const nFloors = Math.round(TILE_V / FLOOR_H);
  const subPerFloor = 2; // one intermediate transom per floor

  // 1) bronze-tinted glass field (shallow recess — curtain walls are flat-ish)
  s.rect(0, TILE_U, 0, TILE_V, {
    r: C.glassBronze[0], g: C.glassBronze[1], b: C.glassBronze[2], h: 0.4, rough: 0.09, metal: 0.75,
  });
  // per-pane tone variation
  const rowsZ = nFloors * subPerFloor;
  for (let c = 0; c < nBays; c++) {
    for (let rz = 0; rz < rowsZ; rz++) {
      const x0 = c * MOD + 0.06;
      const x1 = (c + 1) * MOD - 0.06;
      const dz = FLOOR_H / subPerFloor;
      const z0 = rz * dz + 0.06;
      const z1 = (rz + 1) * dz - 0.06;
      // ~22% of panes read as brighter sky-reflecting glass so the curtain
      // wall reads as a lit grid, not a murky brown slab
      const sky = rng() < 0.22;
      const gc = sky
        ? jitterRGB(C.glassBronzeSky, C.glassBronze, 0.4 * rng())
        : jitterRGB(C.glassBronze, C.glassBronzeDeep, 0.5 * rng());
      s.rect(x0, x1, z0, z1, { r: gc[0], g: gc[1], b: gc[2], h: 0.42, rough: 0.06 + 0.05 * rng(), metal: 0.8 });
      if (rng() < LIT_PCT.curtain) {
        const L = litColor(rng);
        s.rect(x0 + 0.08, x1 - 0.08, z0 + 0.08, z1 - 0.08, {
          r: L[0] * 0.16, g: L[1] * 0.16, b: L[2] * 0.16, er: L[0], eg: L[1], eb: L[2], rough: 0.3,
        });
      }
    }
  }

  // 2) raised bronze mullion grid (vertical every module + horizontal transoms)
  const mp = { r: C.mullionBronze[0], g: C.mullionBronze[1], b: C.mullionBronze[2], h: 0.8, rough: 0.26, metal: 0.9 };
  for (let c = 0; c <= nBays; c++) s.vline(c * MOD, 0.13, 0, TILE_V, mp);
  const dz = FLOOR_H / subPerFloor;
  const nz = Math.round(TILE_V / dz);
  for (let rz = 0; rz <= nz; rz++) {
    const z = rz * dz;
    // floor lines are heavier than the intermediate transoms
    const heavy = rz % subPerFloor === 0;
    s.hline(z, heavy ? 0.18 : 0.1, 0, TILE_U, mp);
  }
  return s;
}

// ---------------------------------------------------------------------------
// SYSTEM D — bay_band: white horizontal bands + dark glass ribbons
// ---------------------------------------------------------------------------
function buildBand(W, H) {
  const s = new Scene(TILE_U, TILE_V, W, H);
  const rng = mulberry32(4104);
  const nFloors = Math.round(TILE_V / FLOOR_H);
  const nCol = 4; // subtle vertical mullions every 3 m

  // 1) dark glass ribbon field (recessed)
  s.rect(0, TILE_U, 0, TILE_V, {
    r: C.glassDark[0], g: C.glassDark[1], b: C.glassDark[2], h: 0.3, rough: 0.1, metal: 0.55,
  });

  // 2) per-floor: white concrete band (raised) over the lower part of the floor
  for (let f = 0; f < nFloors; f++) {
    const z = f * FLOOR_H;
    // the glass ribbon occupies z+1.35 .. z+3.8; band occupies z-0.05 .. z+1.35
    s.rect(0, TILE_U, z - 0.02, z + 1.35, {
      r: C.bandWhite[0], g: C.bandWhite[1], b: C.bandWhite[2], h: 0.95, rough: 0.55, metal: 0,
    });
    // shadow reveal along the band's bottom drip + top edge
    s.hline(z + 1.35, 0.08, 0, TILE_U, { r: C.bandWhiteDk[0], g: C.bandWhiteDk[1], b: C.bandWhiteDk[2], h: 0.6 });
    s.hline(z - 0.02, 0.06, 0, TILE_U, { r: C.bandWhiteDk[0], g: C.bandWhiteDk[1], b: C.bandWhiteDk[2], h: 0.55 });
    // per-cell glass tone + lit subset in the ribbon
    for (let c = 0; c < nCol; c++) {
      const x0 = c * (TILE_U / nCol) + 0.12;
      const x1 = (c + 1) * (TILE_U / nCol) - 0.12;
      const z0 = z + 1.5;
      const z1 = z + 3.7;
      const t = 0.2 * rng();
      const gc = jitterRGB(C.glassDark, C.glassDarkDeep, t);
      s.rect(x0, x1, z0, z1, { r: gc[0], g: gc[1], b: gc[2], h: 0.32, rough: 0.09, metal: 0.6 });
      if (rng() < LIT_PCT.band) {
        const L = litColor(rng);
        s.rect(x0 + 0.1, x1 - 0.1, z0 + 0.1, z1 - 0.1, {
          r: L[0] * 0.14, g: L[1] * 0.14, b: L[2] * 0.14, er: L[0], eg: L[1], eb: L[2], rough: 0.3,
        });
      }
    }
  }

  // 3) thin vertical mullions dividing the glass ribbon
  const mp = { r: C.mullionDark[0], g: C.mullionDark[1], b: C.mullionDark[2], h: 0.5, rough: 0.35, metal: 0.4 };
  for (let c = 0; c <= nCol; c++) {
    const x = c * (TILE_U / nCol);
    for (let f = 0; f < nFloors; f++) s.vline(x, 0.08, f * FLOOR_H + 1.4, f * FLOOR_H + 3.75, mp);
  }
  return s;
}

// ---------------------------------------------------------------------------
// TRIM atlas — podium stone / retail glazing / parapet / signage / louver
// ---------------------------------------------------------------------------
function buildTrim(W, H) {
  const s = new Scene(TRIM_TILE_U, TRIM_TOTAL_V, W, H);
  const rng = mulberry32(7107);
  const U = TRIM_TILE_U;

  // neutral fill (gutters between strips read as plain concrete)
  s.rect(0, U, 0, TRIM_TOTAL_V, { r: 0.5, g: 0.48, b: 0.45, h: 0.7, rough: 0.8, metal: 0 });

  // --- podium stone 0..4.5: coursing (0.75 m) + vertical joints (3 m) --------
  {
    const [z0, z1] = TRIM_STRIPS.podium;
    s.rect(0, U, z0, z1, { r: C.stone[0], g: C.stone[1], b: C.stone[2], h: 0.85, rough: 0.82, metal: 0 });
    // dark plinth at the base
    s.rect(0, U, z0, z0 + 0.6, { r: C.plinth[0], g: C.plinth[1], b: C.plinth[2], h: 0.8, rough: 0.6, metal: 0 });
    // horizontal course joints (recessed dark lines)
    for (let z = z0 + 0.75; z < z1; z += 0.75) {
      s.hline(z, 0.05, 0, U, { r: C.stoneDk[0], g: C.stoneDk[1], b: C.stoneDk[2], h: 0.55 });
    }
    // vertical joints, offset per course (running bond)
    let course = 0;
    for (let z = z0 + 0.6; z < z1; z += 0.75) {
      const off = course % 2 ? 1.5 : 0;
      for (let x = off; x <= U; x += 3.0) {
        s.rect(x - 0.03, x + 0.03, z, Math.min(z + 0.75, z1), { r: C.stoneDk[0], g: C.stoneDk[1], b: C.stoneDk[2], h: 0.55 });
      }
      course++;
    }
  }

  // --- retail glazing 4.8..8.7: storefront glass + mullions + lit interiors --
  {
    const [z0, z1] = TRIM_STRIPS.retail;
    s.rect(0, U, z0, z1, { r: C.glassDark[0], g: C.glassDark[1], b: C.glassDark[2], h: 0.35, rough: 0.09, metal: 0.5 });
    // stallriser (dark base) + fascia (dark top band)
    s.rect(0, U, z0, z0 + 0.45, { r: C.plinth[0], g: C.plinth[1], b: C.plinth[2], h: 0.8, rough: 0.6, metal: 0 });
    s.rect(0, U, z1 - 0.55, z1, { r: C.metalDark[0], g: C.metalDark[1], b: C.metalDark[2], h: 0.82, rough: 0.4, metal: 0.3 });
    // storefront mullions every 1.5 m + a transom
    const mp = { r: 0.13, g: 0.13, b: 0.14, h: 0.7, rough: 0.35, metal: 0.4 };
    for (let x = 0; x <= U; x += 1.5) s.vline(x, 0.09, z0 + 0.45, z1 - 0.55, mp);
    s.hline(z0 + 2.9, 0.09, 0, U, mp);
    // lit storefront interiors (~45 %)
    for (let c = 0; c < Math.round(U / 1.5); c++) {
      if (rng() < 0.45) {
        const x0 = c * 1.5 + 0.1;
        const x1 = (c + 1) * 1.5 - 0.1;
        const L = litColor(rng);
        s.rect(x0, x1, z0 + 0.55, z1 - 0.65, {
          r: L[0] * 0.18, g: L[1] * 0.18, b: L[2] * 0.18, er: L[0] * 0.9, eg: L[1] * 0.9, eb: L[2] * 0.9, rough: 0.3,
        });
      }
    }
  }

  // --- parapet 9.0..11.2: neutral concrete slab, chamfer top ----------------
  {
    const [z0, z1] = TRIM_STRIPS.parapet;
    s.rect(0, U, z0, z1, { r: C.parapet[0], g: C.parapet[1], b: C.parapet[2], h: 0.9, rough: 0.72, metal: 0 });
    // top chamfer catches light (raised), a drip groove below (recessed)
    s.hline(z1 - 0.12, 0.24, 0, U, { r: 0.84, g: 0.83, b: 0.8, h: 1.0 });
    s.hline(z0 + 0.35, 0.05, 0, U, { r: C.bandWhiteDk[0], g: C.bandWhiteDk[1], b: C.bandWhiteDk[2], h: 0.6 });
  }

  // --- signage 11.5..12.4: red back + lit lettering blocks -------------------
  {
    const [z0, z1] = TRIM_STRIPS.sign;
    s.rect(0, U, z0, z1, { r: C.signRed[0], g: C.signRed[1], b: C.signRed[2], h: 0.7, rough: 0.42, metal: 0 });
    let x = 0.3;
    let k = 0;
    while (x < U - 0.3) {
      const w = 0.35 + rng() * 0.9;
      if (rng() < 0.7) {
        const L = litColor(rng);
        s.rect(x, Math.min(x + w, U - 0.2), z0 + 0.2, z1 - 0.2, {
          r: 0.9, g: 0.85, b: 0.8, er: L[0], eg: L[1] * 0.9, eb: L[2] * 0.8, h: 0.78, rough: 0.4,
        });
      }
      x += w + 0.25 + rng() * 0.4;
      k++;
    }
  }

  // --- louver 12.7..13.7: dark metal blades ----------------------------------
  {
    const [z0, z1] = TRIM_STRIPS.louver;
    s.rect(0, U, z0, z1, { r: C.plinth[0], g: C.plinth[1], b: C.plinth[2], h: 0.5, rough: 0.5, metal: 0.4 });
    for (let z = z0; z < z1; z += 0.14) {
      s.hline(z + 0.07, 0.09, 0, U, { r: C.metalDark[0], g: C.metalDark[1], b: C.metalDark[2], h: 0.8, rough: 0.35, metal: 0.6 });
      s.hline(z + 0.02, 0.03, 0, U, { r: 0.04, g: 0.04, b: 0.045, h: 0.55 }); // shadow line under each blade
    }
  }

  return s;
}

// ---------------------------------------------------------------------------
// derive the 4 maps from a Scene, box-downsample SS->1, write PNGs
// ---------------------------------------------------------------------------
function boxDown(src, W, H, ss) {
  if (ss === 1) return { data: src, w: W, h: H };
  const w = W / ss;
  const h = H / ss;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) {
          acc += src[(y * ss + dy) * W + (x * ss + dx)];
        }
      }
      out[y * w + x] = acc / (ss * ss);
    }
  }
  return { data: out, w, h };
}

function toSRGBbyteFromArr(arr) {
  const n = arr.length;
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(0, Math.min(255, Math.round(arr[i] * 255)));
  return out;
}

async function writeSet(name, scene, res, tag) {
  const dir = joinPath(outDir, name);
  mkdirSync(dir, { recursive: true });
  const W = scene.W;
  const H = scene.H;
  const ss = SS;
  const fw = res;
  const fh = Math.round(res * (scene.tileV / scene.tileU) * (scene.tileU / scene.tileV)); // = res (square PNG)

  // downsample every channel
  const dR = boxDown(scene.r, W, H, ss).data;
  const dG = boxDown(scene.g, W, H, ss).data;
  const dB = boxDown(scene.b, W, H, ss).data;
  const dH = boxDown(scene.h, W, H, ss).data;
  const dRo = boxDown(scene.rough, W, H, ss).data;
  const dMe = boxDown(scene.metal, W, H, ss).data;
  const dER = boxDown(scene.er, W, H, ss).data;
  const dEG = boxDown(scene.eg, W, H, ss).data;
  const dEB = boxDown(scene.eb, W, H, ss).data;
  const w = W / ss;
  const h = H / ss;
  const n = w * h;

  // --- concrete grunge multiplied into albedo (metal<0.3 only) --------------
  const colorBuf = Buffer.alloc(n * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let rr = dR[i];
      let gg = dG[i];
      let bb = dB[i];
      if (dMe[i] < 0.3) {
        const gr = 0.86 + 0.2 * fbm(x / 26, y / 26, tag * 13, 4) + 0.06 * (fbm(x / 6, y / 6, tag * 7, 3) - 0.5);
        rr *= gr;
        gg *= gr;
        bb *= gr;
        // faint vertical streaking (weathering) under band/sill edges
        const streak = 0.05 * (fbm(x / 3, y / 40, tag * 17, 2) - 0.5);
        rr -= streak;
        gg -= streak;
        bb -= streak;
      }
      colorBuf[i * 3] = Math.max(0, Math.min(255, Math.round(rr * 255)));
      colorBuf[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(gg * 255)));
      colorBuf[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(bb * 255)));
    }
  }

  // --- normal from height (Sobel, wrapped) ----------------------------------
  const at = (x, y) => dH[(((y % h) + h) % h) * w + (((x % w) + w) % w)];
  const normalBuf = Buffer.alloc(n * 3);
  const NSTR = 2.4; // relief strength
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const gy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      // image y grows downward = world-down; flip gy so green points up (OpenGL)
      let nx = gx * NSTR;
      let ny = -gy * NSTR;
      let nz = 1.0;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv;
      ny *= inv;
      nz *= inv;
      const i = y * w + x;
      normalBuf[i * 3] = Math.round((nx * 0.5 + 0.5) * 255);
      normalBuf[i * 3 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalBuf[i * 3 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }

  // --- AO from height: recess darkening + contact shadow (blurred-height delta)
  // cheap separable box blur of the height field
  const R = Math.max(2, Math.round(w / 48));
  const blur = new Float32Array(n);
  {
    const tmp = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let k = -R; k <= R; k++) acc += at(k, y);
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / (2 * R + 1);
        acc += at(x + R + 1, y) - at(x - R, y);
      }
    }
    const at2 = (x, yy) => tmp[(((yy % h) + h) % h) * w + x];
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -R; k <= R; k++) acc += at2(x, k);
      for (let y = 0; y < h; y++) {
        blur[y * w + x] = acc / (2 * R + 1);
        acc += at2(x, y + R + 1) - at2(x, y - R);
      }
    }
  }

  const ormBuf = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const hgt = dH[i];
    const delta = Math.max(0, blur[i] - hgt); // how much lower than surroundings
    let ao = (0.5 + 0.5 * hgt) * (1 - 0.85 * delta);
    ao = Math.max(0.22, Math.min(1, ao));
    ormBuf[i * 3] = Math.round(ao * 255); // R = AO
    ormBuf[i * 3 + 1] = Math.round(Math.max(0, Math.min(1, dRo[i])) * 255); // G = roughness
    ormBuf[i * 3 + 2] = Math.round(Math.max(0, Math.min(1, dMe[i])) * 255); // B = metalness
  }

  // --- emissive -------------------------------------------------------------
  const emitBuf = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    emitBuf[i * 3] = Math.max(0, Math.min(255, Math.round(dER[i] * 255)));
    emitBuf[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(dEG[i] * 255)));
    emitBuf[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(dEB[i] * 255)));
  }

  const raw = (buf) => sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png();
  await raw(colorBuf).toFile(joinPath(dir, "color.png"));
  await raw(normalBuf).toFile(joinPath(dir, "normal.png"));
  await raw(ormBuf).toFile(joinPath(dir, "orm.png"));
  await raw(emitBuf).toFile(joinPath(dir, "emissive.png"));

  // quick stats so a flat/empty result is caught in the log
  const stat = (buf) => {
    let mn = 255;
    let mx = 0;
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      sum += v;
    }
    return `min=${mn} max=${mx} mean=${(sum / buf.length).toFixed(1)}`;
  };
  console.log(`  ${name.padEnd(12)} color[${stat(colorBuf)}] normal[${stat(normalBuf)}] orm[${stat(ormBuf)}] emit[${stat(emitBuf)}]  ${w}x${h}`);
  void fw;
  void fh;
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
async function main() {
  mkdirSync(outDir, { recursive: true });
  console.log(`facade_gen -> ${outDir}`);
  const bw = BAY_RES * SS;
  const tw = TRIM_RES * SS;

  await writeSet("bay_grid", buildGrid(bw, bw), BAY_RES, 1);
  await writeSet("bay_strip", buildStrip(bw, bw), BAY_RES, 2);
  await writeSet("bay_curtain", buildCurtain(bw, bw), BAY_RES, 3);
  await writeSet("bay_band", buildBand(bw, bw), BAY_RES, 4);
  await writeSet("trim", buildTrim(tw, tw), TRIM_RES, 5);

  const layout = {
    bay: { tile_u_m: TILE_U, tile_v_m: TILE_V, module_m: BAY_MODULE, lit_pct: LIT_PCT },
    trim: {
      tile_u_m: TRIM_TILE_U,
      total_v_m: TRIM_TOTAL_V,
      strips_m: Object.fromEntries(Object.entries(TRIM_STRIPS).map(([k, v]) => [k, [...v]])),
    },
    maps: ["color", "normal", "orm", "emissive"],
  };
  writeFileSync(joinPath(outDir, "layout.json"), JSON.stringify(layout, null, 2));
  console.log("layout.json written");
  console.log("FACADE_GEN_OK");
}

main().catch((err) => {
  console.error("facade_gen failed:", err);
  process.exit(1);
});
