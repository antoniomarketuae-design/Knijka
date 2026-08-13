#!/usr/bin/env node
// =============================================================================
// wave12-cluster.mjs — THE SPEEDOMETER, MEASURED IN THE PIXELS A STUDENT GETS.
//
// WHY A NEW INSTRUMENT AGAIN. wave11 declared its own blind spot in its own
// output and was right to: the analogue dial and its 40/80/120/160 are QUADS
// INSIDE THE WEBGL CANVAS sampling a texture atlas. They have no DOM node, no
// rect and no computed style, so detectors A–E — every one of which starts from
// `getBoundingClientRect()` — cannot see them. Seven waves have now scored the
// cluster zero for that reason, while the founder's own frames show the numbers
// as mush.
//
// So this file does not look for text. It PROJECTS THE GEOMETRY.
//
//   1. `__THREE_DEVTOOLS__` is installed as an EventTarget before the first
//      script runs. three's Scene and WebGLRenderer constructors both dispatch
//      an `observe` event to it (three.core.js:15135 / three.module.js:19563).
//      That hands us the live renderer without touching a line of app code and
//      without a /dev/ route — the founder's build, unmodified.
//   2. The renderer instance's own `render` is wrapped once so the ACTIVE
//      CAMERA is captured every frame. R3F keeps the camera in a hook; this is
//      the only place it is handed out.
//   3. The cluster's face mesh is found by its ATLAS: the one material in the
//      scene whose `map.image` is a 1024x512 canvas (clusterLayout ATLAS_W/H).
//      Its `matrixWorld` maps the 512x256 design grid straight to world space.
//   4. Every element of the face whose position is a CONSTANT in
//      clusterLayout.ts — the five dial numerals, the three big digits, the
//      «км/ч» cell, the gear letter, the tick ring — is projected corner by
//      corner through that matrix and the live camera into CSS pixels.
//   5. THE ATLAS IS READ BACK. `map.image` is the actual canvas the app
//      painted, so `getImageData` over a character cell gives the TRUE ink
//      bounding box. A 32-unit quad is not a 32-unit glyph: the ink fills some
//      fraction of its cell, and guessing that fraction is how «км/ч» once
//      shipped as a 3-pixel smudge (clusterLayout's own R1 note). Nothing here
//      is assumed; the ink is measured off the texture that is on the GPU.
//
// WHAT COMES OUT is a number a human can check: the height in CSS px, and in
// the device px his retina actually receives, of every glyph on the instrument
// — beside the height of the ONE element on the same texture at the same
// distance that the founder says he CAN read («0 км/ч D»). Same atlas, same
// material, same camera: if one is legible and the other is not, the variable
// is the authored size and nothing else.
//
// AND IT DRIVES. The founder's frames are at 0 км/ч. A dial is a RATE
// instrument; judging one at rest is judging the half that does not move. This
// file takes the real drive pad with a real pointer — never a /dev/ rig — holds
// throttle until the car is in the 40–50 km/h band the exam grades, and
// re-measures with the needle live.
//
// USAGE
//   node wave12-cluster.mjs                        # all six profiles
//   node wave12-cluster.mjs --device iphone16-landscape
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "./lib/pw.mjs";
import { DEFAULT_DEVICE_IDS, resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = `${HERE}/.out/wave12-cluster`;
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const BASE = arg("base", process.env.KNIJKA_BASE_URL || "https://icon-undertaken-earliest-zope.trycloudflare.com");
const EMAIL = arg("email", process.env.KNIJKA_EMAIL || "founder@knijka.ai");
const PASSWORD = arg("password", process.env.KNIJKA_PASSWORD || "Knijka2026!");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const ENGINE_NAME = arg("engine", "webkit");
const MOTION = arg("motion", "allow"); // MANDATORY argument to newDeviceContext
const DEVICE_IDS = arg("device", "") ? arg("device", "").split(",") : DEFAULT_DEVICE_IDS;
const TARGET_KMH = Number(arg("kmh", "45"));
const DRIVE_MS = Number(arg("driveMs", "26000"));
const TAG = "cluster";

const devices = resolveDevices(DEVICE_IDS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chromium needs a GPU story; WebKit brings its own. Same list wave11 used.
const GL = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];

// -----------------------------------------------------------------------------
// THE HOOK — installed before the app's first script.
// -----------------------------------------------------------------------------
// Read-only except for ONE wrapped method on ONE renderer instance, and the
// wrapper calls through unconditionally. Nothing here can change a frame.
const THREE_HOOK = () => {
  const w = /** @type {any} */ (window);
  const store = { scenes: [], renderers: [], camera: null, scene: null, frames: 0 };
  w.__w12 = store;
  const target = new EventTarget();
  target.addEventListener("observe", (event) => {
    const d = /** @type {any} */ (event).detail;
    if (!d) return;
    if (d.isScene) {
      store.scenes.push(d);
      return;
    }
    // WebGLRenderer: has render() and a domElement. Wrap once.
    if (typeof d.render === "function" && d.domElement && !d.__w12wrapped) {
      d.__w12wrapped = true;
      store.renderers.push(d);
      const inner = d.render.bind(d);
      d.render = function wrapped(scene, camera) {
        // Only the MAIN pass interests us — the mirror rigs render the same
        // scene through their own cameras many times a frame, and one of those
        // cameras is not what the student is looking through. The main pass is
        // the one whose target is null.
        try {
          if (d.getRenderTarget && d.getRenderTarget() === null) {
            store.camera = camera;
            store.scene = scene;
            store.frames += 1;
          }
        } catch {
          /* never let the probe break a frame */
        }
        return inner(scene, camera);
      };
    }
  });
  w.__THREE_DEVTOOLS__ = target;
};

// Same fullscreen veto wave11 used: Chromium's fullscreen request throws and
// the sweep must stay on the founder's arm (a Safari tab, chrome visible).
const NO_FULLSCREEN = () => {
  const proto = /** @type {any} */ (Element).prototype;
  proto.requestFullscreen = () => Promise.reject(new Error("blocked by probe"));
  proto.webkitRequestFullscreen = () => {};
};

// -----------------------------------------------------------------------------
// THE MEASUREMENT — runs in the page, returns plain JSON.
// -----------------------------------------------------------------------------
const MEASURE = () => {
  const w = /** @type {any} */ (window);
  const store = w.__w12;
  const out = {
    ok: false,
    why: null,
    frames: store ? store.frames : -1,
    scenes: store ? store.scenes.length : -1,
    renderers: store ? store.renderers.length : -1,
  };
  if (!store || !store.camera || !store.scene) {
    out.why = "no camera captured — the devtools hook saw no main-pass render";
    return out;
  }

  // ── locate the cluster by its atlas ────────────────────────────────────────
  let faceMesh = null;
  let atlasCanvas = null;
  store.scene.traverse((o) => {
    if (faceMesh) return;
    const m = o.material;
    const mats = Array.isArray(m) ? m : m ? [m] : [];
    for (const mat of mats) {
      const img = mat && mat.map && mat.map.image;
      if (img && img.width === 1024 && img.height === 512 && typeof img.getContext === "function") {
        faceMesh = o;
        atlasCanvas = img;
        return;
      }
    }
  });
  if (!faceMesh) {
    out.why = "no mesh in the scene samples a 1024x512 canvas atlas — cluster not found";
    return out;
  }

  const canvas = document.querySelector("canvas");
  if (!canvas) {
    out.why = "no <canvas> in the document";
    return out;
  }
  const rect = canvas.getBoundingClientRect();
  const camera = store.camera;
  const V3 = camera.position.constructor;

  // The face mesh carries the group's scale through matrixWorld, so a design
  // point goes straight to world with localToWorld.
  const project = (x, y, z) => {
    const v = new V3(x, y, z || 0);
    faceMesh.localToWorld(v);
    v.project(camera);
    return {
      x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
      z: v.z,
    };
  };

  // ── the atlas, read back: TRUE ink extents per character cell ─────────────
  const actx = atlasCanvas.getContext("2d", { willReadFrequently: true });
  const CHAR_SET = "0123456789PRNDM ";
  const CHAR_CELL_W = 64;
  const CHAR_CELL_H = 128;
  const inkCache = {};
  const inkOf = (ch) => {
    if (inkCache[ch]) return inkCache[ch];
    const i = CHAR_SET.indexOf(ch);
    const idx = i < 0 ? CHAR_SET.length - 1 : i;
    const cell = { x: idx * CHAR_CELL_W, y: 128, w: CHAR_CELL_W, h: CHAR_CELL_H };
    let box = null;
    try {
      const data = actx.getImageData(cell.x, cell.y, cell.w, cell.h).data;
      let x0 = 1e9;
      let y0 = 1e9;
      let x1 = -1e9;
      let y1 = -1e9;
      for (let py = 0; py < cell.h; py++) {
        for (let px = 0; px < cell.w; px++) {
          if (data[(py * cell.w + px) * 4 + 3] > 24) {
            if (px < x0) x0 = px;
            if (px > x1) x1 = px;
            if (py < y0) y0 = py;
            if (py > y1) y1 = py;
          }
        }
      }
      box =
        x1 < x0
          ? { empty: true }
          : {
              empty: false,
              // fraction of the CELL the ink occupies, and where in the cell
              fx0: x0 / cell.w,
              fx1: (x1 + 1) / cell.w,
              fy0: y0 / cell.h,
              fy1: (y1 + 1) / cell.h,
              wFrac: (x1 + 1 - x0) / cell.w,
              hFrac: (y1 + 1 - y0) / cell.h,
              // did the ink hit the cell wall? then the atlas itself clips it
              clipL: x0 === 0,
              clipR: x1 === cell.w - 1,
              clipT: y0 === 0,
              clipB: y1 === cell.h - 1,
            };
    } catch (e) {
      box = { empty: true, error: String(e && e.message) };
    }
    inkCache[ch] = box;
    return box;
  };

  // ── clusterLayout.ts constants, transcribed (design units) ────────────────
  const DIAL_CX = -164;
  const DIAL_CY = 30;
  const DIAL_NUM_R = 48;
  const DIAL_NUM_CHAR_W = 16;
  const DIAL_NUM_CHAR_H = 32;
  const DIAL_NUM_TRACK = 14;
  const DIAL_MAX_KMH = 160;
  const DIAL_START_DEG = 225;
  const DIAL_SWEEP_DEG = 270;
  const TICK_R_MAJOR = 90;
  const TICK_R_INNER = 74;
  const DIGIT_W = 48;
  const DIGIT_H = 96;
  const DIGIT_GAP = 4;
  const DIGIT_COUNT = 3;
  const DIGITS_CX = 8;
  const DIGITS_CY = 76;
  const UNIT_W = 68;
  const UNIT_H = 34;
  const UNIT_CX = 122;
  const UNIT_CY = 54;
  const GEAR_CX = 206;
  const GEAR_CY = DIGITS_CY;
  const GEAR_W = 76;
  const GEAR_H = 96;
  const FACE_W = 512;
  const FACE_H = 256;
  const dialAngleRad = (kmh) => {
    const v = Math.min(Math.max(Math.abs(kmh), 0), DIAL_MAX_KMH);
    return ((DIAL_START_DEG - (DIAL_SWEEP_DEG * v) / DIAL_MAX_KMH) * Math.PI) / 180;
  };

  // A quad measured on screen: its four projected corners, the on-screen size
  // of the QUAD, and the on-screen size of the INK inside it.
  const measureQuad = (cx, cy, wUnits, hUnits, ch, label) => {
    const hw = wUnits / 2;
    const hh = hUnits / 2;
    const c = [
      project(cx - hw, cy - hh, 0),
      project(cx + hw, cy - hh, 0),
      project(cx + hw, cy + hh, 0),
      project(cx - hw, cy + hh, 0),
    ];
    const xs = c.map((p) => p.x);
    const ys = c.map((p) => p.y);
    const l = Math.min(...xs);
    const r = Math.max(...xs);
    const t = Math.min(...ys);
    const b = Math.max(...ys);
    const quadW = r - l;
    const quadH = b - t;
    const ink = ch ? inkOf(ch) : null;
    const rec = {
      label,
      ch: ch || null,
      centre: project(cx, cy, 0),
      quad: { l, t, w: quadW, h: quadH },
      quadWpx: quadW,
      quadHpx: quadH,
      onGlass:
        r > 0 && l < window.innerWidth && b > 0 && t < window.innerHeight,
      offLeftPx: Math.max(0, 0 - l),
      offRightPx: Math.max(0, r - window.innerWidth),
      offTopPx: Math.max(0, 0 - t),
      offBottomPx: Math.max(0, b - window.innerHeight),
    };
    if (ink && !ink.empty) {
      // ink fractions are in CELL space with y DOWN; the quad's v axis is
      // flipped by cellUv, so a cell-space y maps to quad-space (1 - y).
      rec.inkWpx = quadW * ink.wFrac;
      rec.inkHpx = quadH * ink.hFrac;
      rec.inkL = l + quadW * ink.fx0;
      rec.inkR = l + quadW * ink.fx1;
      rec.inkT = t + quadH * ink.fy0;
      rec.inkB = t + quadH * ink.fy1;
      rec.atlasInk = ink;
      // How many atlas texels are being squeezed into one screen pixel. With
      // generateMipmaps=false + LinearFilter this is the aliasing factor: at
      // 1 the texture is sampled 1:1, at 20 the GPU picks 4 texels out of 400
      // and the glyph is noise.
      rec.texelsPerPx = quadH > 0 ? CHAR_CELL_H / quadH : Infinity;
    }
    return rec;
  };

  // ── the five dial numerals ────────────────────────────────────────────────
  const numerals = [];
  for (let kmh = 0; kmh <= DIAL_MAX_KMH; kmh += 40) {
    const label = String(kmh);
    const a = dialAngleRad(kmh);
    const cx = DIAL_CX + Math.cos(a) * DIAL_NUM_R;
    const cy = DIAL_CY + Math.sin(a) * DIAL_NUM_R;
    const x0 = cx - ((label.length - 1) * DIAL_NUM_TRACK) / 2;
    const chars = [];
    for (let k = 0; k < label.length; k++) {
      chars.push(
        measureQuad(
          x0 + k * DIAL_NUM_TRACK,
          cy,
          DIAL_NUM_CHAR_W,
          DIAL_NUM_CHAR_H,
          label[k],
          `dial:${label}[${k}]`,
        ),
      );
    }
    // The gap between adjacent characters' INK — this is what turns «120» into
    // «12B»: two glyphs whose ink boxes touch at 5 px are one shape.
    const gaps = [];
    for (let k = 1; k < chars.length; k++) {
      const prev = chars[k - 1];
      const cur = chars[k];
      if (prev.inkR != null && cur.inkL != null) gaps.push(cur.inkL - prev.inkR);
    }
    const inkL = Math.min(...chars.map((c) => (c.inkL == null ? Infinity : c.inkL)));
    const inkR = Math.max(...chars.map((c) => (c.inkR == null ? -Infinity : c.inkR)));
    numerals.push({
      kmh,
      text: label,
      chars,
      inkGapPx: gaps,
      minInkGapPx: gaps.length ? Math.min(...gaps) : null,
      inkHpx: Math.max(...chars.map((c) => c.inkHpx || 0)),
      wholeInk: { l: inkL, r: inkR, w: inkR - inkL },
      centre: project(cx, cy, 0),
    });
  }
  // Separation between whole LABELS around the ring.
  const labelGaps = [];
  for (let i = 1; i < numerals.length; i++) {
    const a = numerals[i - 1].centre;
    const b = numerals[i].centre;
    labelGaps.push(Math.hypot(b.x - a.x, b.y - a.y));
  }

  // ── the digital readout on the SAME texture — the control ─────────────────
  const digitsSpan = DIGIT_COUNT * DIGIT_W + (DIGIT_COUNT - 1) * DIGIT_GAP;
  const digits = [];
  for (let i = 0; i < DIGIT_COUNT; i++) {
    const cx = DIGITS_CX - digitsSpan / 2 + DIGIT_W / 2 + i * (DIGIT_W + DIGIT_GAP);
    digits.push(measureQuad(cx, DIGITS_CY, DIGIT_W, DIGIT_H, "0", `digit[${i}]`));
  }
  const gear = measureQuad(GEAR_CX, GEAR_CY, GEAR_W, GEAR_H, "D", "gear");
  const unit = measureQuad(UNIT_CX, UNIT_CY, UNIT_W, UNIT_H, null, "unit-км/ч");

  // ── the dial as a disc, and how much of it is on the glass ────────────────
  const ringPts = [];
  for (let d = 0; d < 360; d += 5) {
    const a = (d * Math.PI) / 180;
    ringPts.push(
      project(DIAL_CX + Math.cos(a) * TICK_R_MAJOR, DIAL_CY + Math.sin(a) * TICK_R_MAJOR, 0),
    );
  }
  const ringOn = ringPts.filter(
    (p) => p.x >= 0 && p.x <= window.innerWidth && p.y >= 0 && p.y <= window.innerHeight,
  ).length;
  const ringXs = ringPts.map((p) => p.x);
  const ringYs = ringPts.map((p) => p.y);
  const dial = {
    centre: project(DIAL_CX, DIAL_CY, 0),
    box: {
      l: Math.min(...ringXs),
      r: Math.max(...ringXs),
      t: Math.min(...ringYs),
      b: Math.max(...ringYs),
    },
    diameterPx: Math.max(...ringXs) - Math.min(...ringXs),
    onGlassFraction: ringOn / ringPts.length,
    offLeftPx: Math.max(0, 0 - Math.min(...ringXs)),
    offRightPx: Math.max(0, Math.max(...ringXs) - window.innerWidth),
    offBottomPx: Math.max(0, Math.max(...ringYs) - window.innerHeight),
    innerR: TICK_R_INNER,
  };

  // ── the whole face plate, for the „how big is the instrument" line ────────
  const facePts = [
    project(-FACE_W / 2, -FACE_H / 2, 0),
    project(FACE_W / 2, -FACE_H / 2, 0),
    project(FACE_W / 2, FACE_H / 2, 0),
    project(-FACE_W / 2, FACE_H / 2, 0),
  ];
  const faceBox = {
    l: Math.min(...facePts.map((p) => p.x)),
    r: Math.max(...facePts.map((p) => p.x)),
    t: Math.min(...facePts.map((p) => p.y)),
    b: Math.max(...facePts.map((p) => p.y)),
  };

  // ── DOM text printed ON TOP of the dial — defect #3, measured ─────────────
  const overprint = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const dialRect = { l: dial.box.l, r: dial.box.r, t: dial.box.t, b: dial.box.b };
  let node;
  while ((node = walker.nextNode())) {
    const s = (node.nodeValue || "").trim();
    if (!s) continue;
    const el = node.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()];
    for (const r of rects) {
      if (r.width < 1 || r.height < 1) continue;
      const ix = Math.min(r.right, dialRect.r) - Math.max(r.left, dialRect.l);
      const iy = Math.min(r.bottom, dialRect.b) - Math.max(r.top, dialRect.t);
      if (ix > 0 && iy > 0) {
        overprint.push({
          text: s.slice(0, 40),
          rect: { l: r.left, t: r.top, w: r.width, h: r.height },
          overlapPx: Math.round(ix * iy),
          fontSize: cs.fontSize,
          hud: el.closest("[data-hud]")?.getAttribute("data-hud") || null,
        });
        break;
      }
    }
  }

  // ── camera + material facts, so the mechanism is in the record ────────────
  const mat = Array.isArray(faceMesh.material) ? faceMesh.material[0] : faceMesh.material;
  out.ok = true;
  out.camera = {
    fovDeg: camera.fov,
    aspect: camera.aspect,
    near: camera.near,
    far: camera.far,
    // horizontal FOV implied by the vertical one at this aspect
    hFovDeg: (2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect) * 180) / Math.PI,
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
  };
  out.distanceM = (() => {
    const c = new V3(DIAL_CX, DIAL_CY, 0);
    faceMesh.localToWorld(c);
    return c.distanceTo(camera.position);
  })();
  out.scale = { x: faceMesh.matrixWorld.elements[0], note: "world metres per design unit (row 0 length is only exact for an unrotated mount)" };
  out.texture = {
    generateMipmaps: !!(mat && mat.map && mat.map.generateMipmaps),
    minFilter: mat && mat.map ? mat.map.minFilter : null,
    magFilter: mat && mat.map ? mat.map.magFilter : null,
    anisotropy: mat && mat.map ? mat.map.anisotropy : null,
    LinearFilter: 1006,
    LinearMipmapLinearFilter: 1008,
  };
  out.viewport = {
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    dpr: window.devicePixelRatio,
    canvas: { l: rect.left, t: rect.top, w: rect.width, h: rect.height },
    canvasBackingW: canvas.width,
    canvasBackingH: canvas.height,
    simCamera: document.documentElement.getAttribute("data-sim-camera"),
  };
  out.faceBox = faceBox;
  out.dial = dial;
  out.numerals = numerals;
  out.labelGapPx = labelGaps;
  out.digits = digits;
  out.gear = gear;
  out.unit = unit;
  out.overprint = overprint.sort((a, b) => b.overlapPx - a.overlapPx).slice(0, 12);

  // ── the app's own speed, two independent ways ─────────────────────────────
  // `[data-hud="speed-block"]` is display:none in the cockpit camera
  // (PlayAreaStyles ROW C7) but its TEXT still exists, so it is readable here
  // and it is the app's own number. The needle's rotation is the cluster's.
  const block = document.querySelector('[data-hud="speed-block"]');
  out.speedDom = block ? (block.textContent || "").replace(/\s+/g, " ").trim() : null;
  let needleKmh = null;
  const parent = faceMesh.parent;
  if (parent) {
    for (const child of parent.children) {
      if (child.isGroup || (child.children && child.children.length && child !== faceMesh)) {
        const rz = child.rotation && child.rotation.z;
        if (typeof rz === "number") {
          const deg = (rz * 180) / Math.PI;
          const v = ((DIAL_START_DEG - deg) * DIAL_MAX_KMH) / DIAL_SWEEP_DEG;
          if (v >= -1 && v <= DIAL_MAX_KMH + 1) needleKmh = v;
        }
      }
    }
  }
  out.needleKmh = needleKmh;
  return out;
};

// Gate: are we in the product, in a lesson, with a live canvas?
const GATE = () => {
  const canvas = document.querySelector("canvas");
  const r = canvas ? canvas.getBoundingClientRect() : null;
  return {
    url: location.href,
    hasCanvas: canvas !== null,
    canvas: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
    touchControls: !!document.querySelector('[data-hud="touch-controls"]'),
    catalogCards: document.querySelectorAll('[data-testid="lesson-card"]').length,
    simCamera: document.documentElement.getAttribute("data-sim-camera"),
  };
};

// -----------------------------------------------------------------------------
// Reporting
// -----------------------------------------------------------------------------
const f2 = (n) => (n == null || !Number.isFinite(n) ? "—" : n.toFixed(2));

/**
 * PANEL PITCH, in physical pixels per inch. SPEC DATA, not measured — the same
 * status as devices.mjs's safe-area insets, and labelled as such wherever it is
 * printed. It is here because CSS pixels are not a size: „5.6 px tall" says
 * nothing about whether a human can read it, and the whole question in this
 * file is whether a human can read it. mm and arcminutes are the only units in
 * which „legible" has a published threshold.
 */
const PANEL_PPI = {
  "iphone16-portrait": 460,
  "iphone16-landscape": 460,
  "small-portrait": 400,
  "small-landscape": 400,
  "galaxy-gesturebar-portrait": 385,
  "galaxy-gesturebar-landscape": 385,
};
/** Held-phone viewing distance, mm. The figure used across handset HMI work. */
const VIEW_MM = 300;

/** CSS px → mm on this panel, and the angle it subtends at arm's length. */
function physical(cssPx, device) {
  const ppi = PANEL_PPI[device.id];
  if (!ppi || cssPx == null || !Number.isFinite(cssPx)) return { mm: null, arcmin: null };
  const cssPpi = ppi / device.dpr; // CSS px per inch
  const mm = (cssPx / cssPpi) * 25.4;
  const arcmin = (Math.atan(mm / VIEW_MM) * 180 * 60) / Math.PI;
  return { mm, arcmin };
}

/**
 * THE FLOOR THIS REPORT JUDGES AGAINST, stated once so no number here is an
 * opinion. Automotive/handset practice puts the minimum character height for a
 * GLANCE-read value at about 20–25 arcminutes (the familiar form is „5 mm at
 * 700 mm", which is 24.6′). Below that a number is not read, it is guessed at —
 * and this instrument is glanced at while the student is steering.
 */
const GLANCE_ARCMIN_FLOOR = 20;

function report(title, m, device) {
  console.log(`\n  ${"─".repeat(96)}`);
  console.log(`  ${title}`);
  console.log(`  ${"─".repeat(96)}`);
  if (!m.ok) {
    console.log(`  UNMEASURED · ${m.why} (frames ${m.frames}, scenes ${m.scenes}, renderers ${m.renderers})`);
    return;
  }
  console.log(
    `  camera · vFOV ${f2(m.camera.fovDeg)}°  hFOV ${f2(m.camera.hFovDeg)}°  aspect ${f2(m.camera.aspect)}  ` +
      `eye→dial ${f2(m.distanceM)} m  sim-camera «${m.viewport.simCamera}»`,
  );
  // THE RENDER SCALE, AND WHY IT IS NOT device.dpr. The Canvas is wired
  // `dpr={[1, maxDpr]}` and a handset cold-starts on the `low` tier, whose cap
  // is 1.0 (quality.ts maxDprFor / TOUCH_MAX_DPR). So the drawing buffer is 1:1
  // with CSS pixels and then upscaled 3x onto the panel: a glyph 5 CSS px tall
  // is FIVE REAL RENDERED PIXELS, not fifteen. Reporting `css * device.dpr`
  // here would overstate every number in this file by 3x.
  const renderScale = m.viewport.canvasBackingW / Math.max(1, m.viewport.canvas.w);
  console.log(
    `  glass  · ${m.viewport.innerW}x${m.viewport.innerH} css @dpr${m.viewport.dpr}  canvas backing ${m.viewport.canvasBackingW}x${m.viewport.canvasBackingH}` +
      `  → RENDER SCALE ${f2(renderScale)} (the buffer is ${renderScale >= m.viewport.dpr - 0.01 ? "native" : "UPSCALED " + f2(m.viewport.dpr / renderScale) + "x to the panel"})`,
  );
  console.log(
    `  face   · ${f2(m.faceBox.r - m.faceBox.l)} x ${f2(m.faceBox.b - m.faceBox.t)} css px on screen` +
      `   dial ⌀ ${f2(m.dial.diameterPx)} px, ${(m.dial.onGlassFraction * 100).toFixed(0)}% of its rim on the glass` +
      (m.dial.offLeftPx > 0.5 ? `, ${f2(m.dial.offLeftPx)} px OFF THE LEFT EDGE` : "") +
      (m.dial.offBottomPx > 0.5 ? `, ${f2(m.dial.offBottomPx)} px below the bottom edge` : ""),
  );
  console.log(
    `  texture· generateMipmaps ${m.texture.generateMipmaps} · minFilter ${m.texture.minFilter}` +
      ` (${m.texture.minFilter === 1006 ? "LinearFilter — NO mip chain" : "mipmapped"}) · anisotropy ${m.texture.anisotropy}`,
  );
  console.log(`  speed  · DOM «${m.speedDom}»   needle ${f2(m.needleKmh)} km/h`);

  const line = (name, cssPx, extra) => {
    const p = physical(cssPx, device);
    const verdict =
      p.arcmin == null ? "" : p.arcmin >= GLANCE_ARCMIN_FLOOR ? "  READABLE" : "  BELOW THE GLANCE FLOOR";
    return (
      `      ${name.padEnd(11)}${f2(cssPx).padEnd(9)}css px${("  " + f2(p.mm) + " mm").padEnd(12)}` +
      `${(f2(p.arcmin) + "′").padEnd(9)}${extra || ""}${verdict}`
    );
  };

  console.log(`\n    THE DIAL NUMERALS — the thing a student reads a speed off`);
  console.log(
    `      (ink height on the panel, and the angle it subtends at ${VIEW_MM} mm; the glance floor is ${GLANCE_ARCMIN_FLOOR}′)`,
  );
  console.log(
    `      ${"label".padEnd(11)}${"ink h".padEnd(15)}${"on panel".padEnd(12)}${"angle".padEnd(9)}${"ink gap".padEnd(10)}${"texels/px".padEnd(11)}on glass`,
  );
  for (const n of m.numerals) {
    const h = n.inkHpx;
    const p = physical(h, device);
    const tp = n.chars[0] ? n.chars[0].texelsPerPx : null;
    const on = n.chars.every((c) => c.onGlass) ? "yes" : n.chars.some((c) => c.onGlass) ? "PARTLY OFF" : "NO — off screen";
    console.log(
      `      ${String(n.kmh).padEnd(11)}${(f2(h) + " css px").padEnd(15)}${(f2(p.mm) + " mm").padEnd(12)}${(f2(p.arcmin) + "′").padEnd(9)}` +
        `${(n.minInkGapPx == null ? "—" : f2(n.minInkGapPx)).padEnd(10)}${f2(tp).padEnd(11)}${on}`,
    );
  }
  console.log(`      label-to-label centre distance around the ring: ${m.labelGapPx.map(f2).join(" · ")} px`);
  console.log(
    `      INK GAP IS THE AUTHORED ZERO, NOT A RENDERING ARTEFACT: DIAL_NUM_TRACK is 14 units and the measured ink is ` +
      `${f2(m.numerals[0].chars[0].atlasInk.wFrac * 16)} units wide, so two digits of one label are laid down TOUCHING by arithmetic.`,
  );

  console.log(`\n    THE DIGITAL READOUT — same atlas, same material, same camera, same distance`);
  const d0 = m.digits[0];
  console.log(line("big digit", d0.inkHpx, `texels/px ${f2(d0.texelsPerPx)}`));
  console.log(line("gear «D»", m.gear.inkHpx, `texels/px ${f2(m.gear.texelsPerPx)}`));
  console.log(`      «км/ч»     quad ${f2(m.unit.quadWpx)} x ${f2(m.unit.quadHpx)} css px`);
  const ratio = d0.inkHpx && m.numerals[0].inkHpx ? d0.inkHpx / m.numerals[0].inkHpx : null;
  console.log(
    `      → THE READOUT IS ${f2(ratio)}x THE HEIGHT OF A DIAL NUMERAL, because DIGIT_H is 96 design units and\n` +
      `        DIAL_NUM_CHAR_H is 32. The atlas, the shader, the camera and the distance are IDENTICAL.\n` +
      `        The only variable is the authored size, and it is the one that decides legibility.`,
  );
  console.log(
    `      → THE SAME COMPONENT ALSO MOUNTS IN THE REELS at 0.42 of a 1280 px frame = 538 px of face\n` +
      `        (CaptureScene CLUSTER_FRAME_FRACTION). Here the face is ${f2(m.faceBox.r - m.faceBox.l)} px.` +
      ` THE NUMERALS WERE AUTHORED AND\n        SIGNED OFF AT ${f2(538 / (m.faceBox.r - m.faceBox.l))}x THE SIZE THEY SHIP AT.`,
  );

  if (m.overprint.length) {
    console.log(`\n    DOM TEXT PRINTED OVER THE DIAL (${m.overprint.length})`);
    for (const o of m.overprint) {
      console.log(
        `      «${o.text}» ${f2(o.rect.w)}x${f2(o.rect.h)} at (${f2(o.rect.l)},${f2(o.rect.t)}) · ${o.overlapPx} px² on the dial · font ${o.fontSize} · data-hud «${o.hud}»`,
      );
    }
  } else {
    console.log(`\n    DOM TEXT OVER THE DIAL: none`);
  }
}

// -----------------------------------------------------------------------------
// Run
// -----------------------------------------------------------------------------
const launcher = ENGINE_NAME === "webkit" ? webkit : chromium;
const browser = await launcher.launch(ENGINE_NAME === "webkit" ? {} : { args: GL });

console.log("█".repeat(100));
console.log(`[w12] THE SPEEDOMETER, MEASURED IN THE PIXELS A STUDENT GETS`);
console.log(`[w12] engine ${ENGINE_NAME}${ENGINE_NAME === "webkit" ? " — THE FOUNDER'S ENGINE" : " — SECOND OPINION ONLY"}`);
console.log(`[w12] base ${BASE}`);
console.log(`[w12] route ${ROUTE}   ← A LESSON, not the menu`);
console.log(`[w12] motion ${MOTION} · target ${TARGET_KMH} km/h`);
console.log("█".repeat(100));

const { context: authCtx } = await newDeviceContext(browser, devices[0], {
  motion: MOTION,
  insets: "real",
});
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
console.log(`[w12] signed in ONCE as ${EMAIL}\n`);

const results = [];

for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: MOTION,
    insets: "real",
    storageState,
  });
  await context.addInitScript(THREE_HOOK);
  await context.addInitScript(NO_FULLSCREEN);
  const page = await context.newPage();
  const rec = {
    device: device.id,
    label: device.label,
    orientation: device.orientation,
    engine: ENGINE_NAME,
    viewport: { w: device.width, h: device.height, dpr: device.dpr },
    insetBanner: insetBanner(device, inset),
    states: {},
  };
  console.log(`\n${"═".repeat(100)}`);
  console.log(`${device.label}   ${device.width}x${device.height} @dpr${device.dpr}`);
  console.log(`  ${rec.insetBanner}`);

  const shoot = async (name, extra = []) => {
    const shots = [];
    const add = async (suffix, opts) => {
      const p = `${OUT}/${TAG}-${device.id}-${name}-${suffix}.png`;
      try {
        await page.screenshot({ path: p, ...opts });
        shots.push(p);
      } catch (e) {
        shots.push(`${p} FAILED: ${e.message}`);
      }
    };
    await add("full", { scale: "device" });
    for (const c of extra) await add(c.name, { scale: "device", clip: c.clip });
    return shots;
  };

  // Crop boxes derived from the MEASUREMENT, so the picture and the number
  // describe the same pixels.
  const cropsFor = (m) => {
    if (!m || !m.ok) return [];
    const W = device.width;
    const H = device.height;
    const clamp = (b) => {
      const x = Math.max(0, Math.floor(b.l));
      const y = Math.max(0, Math.floor(b.t));
      const w = Math.min(W - x, Math.ceil(b.r - b.l));
      const h = Math.min(H - y, Math.ceil(b.b - b.t));
      return w > 3 && h > 3 ? { x, y, width: w, height: h } : null;
    };
    const out = [];
    const pad = 14;
    const dialBox = clamp({
      l: m.dial.box.l - pad,
      t: m.dial.box.t - pad,
      r: m.dial.box.r + pad,
      b: m.dial.box.b + pad,
    });
    if (dialBox) out.push({ name: "dial", clip: dialBox });
    const faceBox = clamp({
      l: m.faceBox.l - pad,
      t: m.faceBox.t - pad,
      r: m.faceBox.r + pad,
      b: m.faceBox.b + pad,
    });
    if (faceBox) out.push({ name: "face", clip: faceBox });
    // the digital readout on its own, beside the dial crop
    const dl = Math.min(...m.digits.map((d) => d.quad.l));
    const dr = Math.max(...m.digits.map((d) => d.quad.l + d.quad.w));
    const dt = Math.min(...m.digits.map((d) => d.quad.t));
    const db = Math.max(...m.digits.map((d) => d.quad.t + d.quad.h));
    const digitsBox = clamp({ l: dl - pad, t: dt - pad, r: Math.max(dr, m.gear.quad.l + m.gear.quad.w) + pad, b: db + pad });
    if (digitsBox) out.push({ name: "readout", clip: digitsBox });
    return out;
  };

  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(7000);

    const g = await page.evaluate(GATE);
    console.log(`  GATE · ${JSON.stringify(g)}`);
    if (!g.hasCanvas || !g.canvas || g.canvas.w < 40 || g.canvas.h < 40 || !g.touchControls || g.catalogCards > 0) {
      rec.fatal = `NOT A LIVE LESSON — ${JSON.stringify(g)}`;
      console.log(`  FATAL · ${rec.fatal}`);
      results.push(rec);
      await context.close();
      continue;
    }

    // The hook needs at least one main-pass render before it has a camera.
    await page.waitForFunction(() => (window.__w12?.frames || 0) > 4, null, { timeout: 60_000 }).catch(() => {});

    // ── STATE 1 — AT REST, the frame he photographed ────────────────────────
    const m1 = await page.evaluate(MEASURE);
    rec.states.rest = m1;
    report("AT REST — 0 km/h, the frame the founder sent", m1, device);
    rec.states.rest.shots = await shoot("1-rest", cropsFor(m1));

    // ── dismiss the pre-drive cards so the car can be driven ────────────────
    for (let i = 0; i < 10; i += 1) {
      const c = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((n) =>
          /^(Разбрах|Продължи|Започни|Ясно|Хайде|Готов съм|Напред)$/.test((n.textContent || "").trim()),
        );
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      if (!c) break;
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await sleep(70);
      await page.mouse.up();
      await sleep(380);
    }

    // ── FASTEN THE BELT FIRST, exactly as a student is taught to. ──────────
    // The first sweep drove unbelted, the product raised «УЧЕБЕН МОМЕНТ —
    // движение без предпазен колан» and PAUSED the lesson, and the car sat at
    // 18–31 km/h. That is the product working; the probe was the thing at
    // fault for calling it a speed ceiling. Belt on, no fault, the car drives.
    const belted = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((n) =>
        /колан/i.test(n.getAttribute("aria-label") || n.textContent || ""),
      );
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { label: b.getAttribute("aria-label"), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    if (belted) {
      await page.mouse.click(belted.x, belted.y);
      await sleep(600);
      console.log(`  BELT · pressed «${belted.label}»`);
    } else {
      console.log(`  BELT · no belt control on screen`);
    }

    // ── DRIVE. The real pad, a real pointer, held. ──────────────────────────
    // `driveAxisFromPadY` reads WHERE the thumb is, absolutely: a motionless
    // press above the pad's centre is full throttle for as long as it is held.
    const pad = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[role="slider"]')].find((n) =>
        /газ|скорост|напред|назад|ход/i.test(n.getAttribute("aria-label") || ""),
      ) || [...document.querySelectorAll('[role="slider"]')].pop();
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        label: el.getAttribute("aria-label"),
        l: r.left, t: r.top, w: r.width, h: r.height,
        cx: Math.round(r.left + r.width / 2),
        cy: Math.round(r.top + r.height / 2),
      };
    });
    rec.pad = pad;
    console.log(`\n  DRIVE PAD · ${pad ? `«${pad.label}» ${Math.round(pad.w)}x${Math.round(pad.h)} at (${Math.round(pad.l)},${Math.round(pad.t)})` : "NOT FOUND"}`);

    let peak = 0;
    const trace = [];
    if (pad) {
      // Top third of the pad = a firm, sustained throttle without leaving the box.
      const throttleY = Math.round(pad.t + pad.h * 0.12);
      await page.mouse.move(pad.cx, pad.cy);
      await page.mouse.down();
      await page.mouse.move(pad.cx, throttleY, { steps: 6 });
      const t0 = Date.now();
      let stalled = 0;
      let dismissals = 0;
      let lastDismiss = 0;
      while (Date.now() - t0 < DRIVE_MS) {
        await sleep(700);
        // keep the pointer alive at the same absolute position
        await page.mouse.move(pad.cx, throttleY);
        const s = await page.evaluate(() => {
          const b = document.querySelector('[data-hud="speed-block"]');
          const txt = b ? (b.textContent || "").replace(/\s+/g, " ").trim() : "";
          const n = txt.match(/(\d+(?:[.,]\d+)?)/);
          // A fault card («УЧЕБЕН МОМЕНТ») PAUSES the lesson mid-drive, and the
          // first run of this file plateaued at 29–31 km/h for that reason and
          // for no other — the frame shows the ⏸ glyph. A probe that reports
          // „the car will not go faster" when what actually happened is „the
          // product stopped the car to teach" has measured its own impatience.
          const card = [...document.querySelectorAll("button")].find((el) =>
            /^(Разбрах|Продължи|Ясно|Хайде)$/i.test((el.textContent || "").trim()),
          );
          const r = card ? card.getBoundingClientRect() : null;
          return {
            txt,
            kmh: n ? Number(n[1].replace(",", ".")) : null,
            card: r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null,
          };
        });
        // A DISMISS COSTS THE THROTTLE. Playwright drives one pointer, so
        // tapping a card means lifting the accelerator — and the first version
        // of this loop tapped on EVERY poll, released the pedal 300 ms in every
        // 700, and then reported 18 km/h as the car's ceiling. It was reporting
        // its own hand on the brake. Bounded: at most a few, seconds apart.
        if (s.card && dismissals < 4 && Date.now() - lastDismiss > 7000) {
          dismissals += 1;
          lastDismiss = Date.now();
          await page.mouse.up();
          await page.mouse.click(s.card.x, s.card.y);
          await sleep(260);
          await page.mouse.move(pad.cx, pad.cy);
          await page.mouse.down();
          await page.mouse.move(pad.cx, throttleY, { steps: 4 });
          trace.push({ ms: Date.now() - t0, kmh: s.kmh, dismissed: true });
          continue;
        }
        if (s.kmh != null) {
          trace.push({ ms: Date.now() - t0, kmh: s.kmh });
          if (s.kmh <= peak) stalled += 1;
          else stalled = 0;
          peak = Math.max(peak, s.kmh);
          if (s.kmh >= TARGET_KMH) break;
          if (stalled > 22) break; // genuinely at its ceiling, not paused
        }
      }
      console.log(
        `  DROVE · ${trace.map((t) => (t.dismissed ? `[card@${t.kmh}]` : t.kmh)).join(" → ")} km/h  (peak ${peak})`,
      );
    }
    rec.driveTrace = trace;
    rec.peakKmh = peak;

    // ── STATE 2 — AT SPEED, throttle still held so the needle is live ───────
    const m2 = await page.evaluate(MEASURE);
    rec.states.atSpeed = m2;
    report(`AT SPEED — the DOM says «${m2.speedDom}», the needle says ${f2(m2.needleKmh)} km/h`, m2, device);
    rec.states.atSpeed.shots = await shoot("2-at-speed", cropsFor(m2));

    if (pad) await page.mouse.up();
  } catch (e) {
    rec.error = String(e && e.stack ? e.stack : e);
    console.log(`  ERROR · ${rec.error}`);
  }

  results.push(rec);
  await context.close();
}

await browser.close();
const path = `${OUT}/cluster-${ENGINE_NAME}.json`;
writeFileSync(path, JSON.stringify({ base: BASE, route: ROUTE, engine: ENGINE_NAME, at: new Date().toISOString(), results }, null, 2));
console.log(`\n[w12] census → ${path}`);
console.log(`[w12] frames → ${OUT}`);
