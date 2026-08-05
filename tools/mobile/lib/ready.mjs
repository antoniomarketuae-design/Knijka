// -----------------------------------------------------------------------------
// ready.mjs — HAS THE 3D WORLD ACTUALLY RENDERED?
//
// THE DEFECT THIS FILE EXISTS FOR. Every driving-shell number this harness has
// ever produced described a LOADING SCREEN. The route spec says
// `waitFor: "canvas"` with `state: "attached"`, and a canvas is attached the
// instant React mounts it — before the world data is built, before the GLB and
// KTX2 assets arrive, before three.js has drawn a single triangle. The probe
// then waited a fixed `settleMs` (6 s) and started measuring. On a warm box
// that happened to be enough; on a cold one it was not, and nothing anywhere
// noticed the difference, because a black canvas has perfectly stable geometry
// and settles beautifully. Frames from the run behind row C8's „1,190 ms pass"
// show a black canvas with the lesson menu open over it. The instrument was
// measuring the shell and reporting it as the product.
//
// A TIMEOUT IS NOT A READINESS SIGNAL. This module asks the canvas itself, in
// the only currency that cannot be faked: PIXELS, taken through Playwright's
// screenshot path — the same compositor output a student's eye receives. Three
// facts have to hold together before a sample may be recorded:
//
//   1. the canvas exists, is visible, and is big enough to be the road surface;
//   2. no loading card („Зареждане на …") and no failure card („Светът не се
//      зареди") is in the document — the app's own admission that it is not up;
//   3. the centre of the canvas is a RENDERED IMAGE and not a cleared buffer:
//      many distinct colours, real luminance variance, no single colour owning
//      the frame.
//
// …and (3) has to hold on two consecutive reads, so one lucky frame during a
// fade-in cannot open the gate.
//
// WHY NOT ASK THE PAGE. `canvas.toDataURL()` / `gl.readPixels()` on a WebGL
// canvas created without `preserveDrawingBuffer` return an empty buffer once
// the frame has been presented, so an in-page check would have to race the
// render loop and would report "black" for a perfectly good world. It would
// also be a signal the app could accidentally satisfy while showing nothing.
// The screenshot is what the founder sees; that is the whole standard.
//
// The thresholds below are MEASURED, not invented — see WORLD_FRAME.
// -----------------------------------------------------------------------------
import { inflateSync } from "node:zlib";

// -----------------------------------------------------------------------------
// PNG, decoded here rather than by a dependency. Playwright hands back an 8-bit
// non-interlaced PNG; that is the entire surface this needs to read, and a
// native image library on this box is a 30 MB install and a rebuild risk for
// forty lines of arithmetic.
// -----------------------------------------------------------------------------

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** colour type -> channels per pixel. */
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };
/**
 * How far apart the two pixels of a `busyShare` pair are, in DEVICE pixels.
 * A phone profile renders at devicePixelRatio 3, so adjacent device pixels sit
 * inside the same CSS pixel and are identical by construction — comparing them
 * measures the upscaler, not the image. Three is one CSS pixel there and still
 * a flat distance inside a UI panel at ratio 1.
 */
const NEIGHBOUR_STEP = 3;

/**
 * Decode an 8-bit, non-interlaced PNG to raw samples.
 * @param {Buffer} buffer
 * @returns {{width:number,height:number,channels:number,data:Buffer}}
 */
export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error("[ready] not a PNG buffer");
  }
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (!header) throw new Error("[ready] PNG had no IHDR");
  if (header.depth !== 8 || header.interlace !== 0 || !CHANNELS[header.colorType]) {
    throw new Error(
      `[ready] unsupported PNG (depth ${header.depth}, colour type ${header.colorType}, ` +
        `interlace ${header.interlace}) — this decoder handles 8-bit non-interlaced only`,
    );
  }

  const channels = CHANNELS[header.colorType];
  const stride = header.width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * header.height);

  // The five PNG filters, applied per scanline against the previous one.
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      const v = line[x];
      let value;
      if (filter === 0) value = v;
      else if (filter === 1) value = v + a;
      else if (filter === 2) value = v + b;
      else if (filter === 3) value = v + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`[ready] unknown PNG filter ${filter} on row ${y}`);
      cur[x] = value & 0xff;
    }
  }
  return { width: header.width, height: header.height, channels, data: out };
}

/**
 * Describe a frame in the numbers that separate "a rendered street" from "a
 * cleared buffer with chrome painted over it".
 *
 * `distinct` counts colours quantised to 4 bits per channel (4,096 buckets), so
 * dithering and compression noise cannot inflate it and a genuine scene cannot
 * be hidden by it. `topShare` is the fraction of the sample owned by the single
 * most common bucket — the number that makes a flat fill obvious no matter what
 * colour it is filled with.
 *
 * `busyShare` IS THE ONE THAT DECIDES, and it is here because the first version
 * of this gate was fooled by exactly the frame it was written to reject: the
 * capture behind row C8 has a black canvas with the lesson menu and a „Пауза"
 * modal painted over it, and those panels alone gave the centre band 110
 * distinct colours and a luminance spread of 49.7. Colour statistics cannot
 * tell a rendered world from a dialog. Spatial ones can: a 3D frame varies
 * between NEIGHBOURING pixels almost everywhere (asphalt grain, sky gradient,
 * antialiased edges), while flat UI panels vary only at their text edges and a
 * cleared buffer does not vary at all. `busyShare` is the fraction of
 * horizontally adjacent pairs whose luminance differs by 2 or more.
 *
 * `rect` EXISTS SO THIS CAN BE TESTED AGAINST FRAMES ALREADY ON DISK. Live,
 * `worldVitals` crops with Playwright's own `clip` and hands over a buffer that
 * is already the centre band. A stored full-page capture — the black canvas
 * behind row C8, a known-good driving frame — has to be cropped here instead,
 * and the gate has to be exercised through the SAME arithmetic that runs live
 * or the test vouches for code nobody uses. See ready.test.mjs.
 *
 * @param {Buffer} png
 * @param {{x:number,y:number,width:number,height:number}} [rect] region in image pixels
 * @returns {{pixels:number,distinct:number,topShare:number,meanLuma:number,
 *            stdLuma:number,darkShare:number,busyShare:number}}
 */
export function frameVitals(png, rect = null) {
  const decoded = decodePng(png);
  const { channels, data } = decoded;
  const full = { width: decoded.width, height: decoded.height };
  const x0 = rect ? Math.max(0, Math.round(rect.x)) : 0;
  const y0 = rect ? Math.max(0, Math.round(rect.y)) : 0;
  const width = rect ? Math.min(full.width - x0, Math.round(rect.width)) : full.width;
  const height = rect ? Math.min(full.height - y0, Math.round(rect.height)) : full.height;
  if (width <= 0 || height <= 0) {
    throw new Error(`[ready] region ${JSON.stringify(rect)} is outside a ${full.width}x${full.height} image`);
  }
  const at = (x, y) => ((y0 + y) * full.width + (x0 + x)) * channels;
  const counts = new Map();
  let sum = 0;
  let sumSq = 0;
  let dark = 0;
  let pixels = 0;
  let busy = 0;
  let pairs = 0;
  const luma = (i) => {
    const r = data[i];
    const g = channels >= 3 ? data[i + 1] : r;
    const b = channels >= 3 ? data[i + 2] : r;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = at(x, y);
      const r = data[i];
      const g = channels >= 3 ? data[i + 1] : r;
      const b = channels >= 3 ? data[i + 2] : r;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += l;
      sumSq += l * l;
      if (l < 24) dark += 1;
      pixels += 1;
      if (x + NEIGHBOUR_STEP < width) {
        pairs += 1;
        if (Math.abs(l - luma(i + channels * NEIGHBOUR_STEP)) >= 2) busy += 1;
      }
    }
  }
  const mean = pixels > 0 ? sum / pixels : 0;
  const variance = pixels > 0 ? Math.max(0, sumSq / pixels - mean * mean) : 0;
  let top = 0;
  for (const n of counts.values()) if (n > top) top = n;
  return {
    width,
    height,
    pixels,
    distinct: counts.size,
    // Rounded to 3 dp like `darkShare` and `busyShare`. It was the one vital
    // left raw, which meant the only number a report printed in full precision
    // was one nobody could reproduce by hand from a rounded table.
    topShare: pixels > 0 ? Math.round((top / pixels) * 1000) / 1000 : 1,
    meanLuma: Math.round(mean * 10) / 10,
    stdLuma: Math.round(Math.sqrt(variance) * 10) / 10,
    darkShare: pixels > 0 ? Math.round((dark / pixels) * 1000) / 1000 : 1,
    busyShare: pairs > 0 ? Math.round((busy / pairs) * 1000) / 1000 : 0,
  };
}

/**
 * WHERE THESE NUMBERS COME FROM — MEASURED, and re-measured from the frames
 * themselves rather than carried over from the run that first wrote them. Every
 * row below was recomputed by this file's own `frameVitals` over the centre 50%
 * band of a capture still on disk under `tools/mobile/.out/`, all WebKit, all
 * from this harness's own device profiles. The exact numbers are locked into
 * ready.test.mjs as `MEASURED`, so a change to the arithmetic that would move
 * them fails a test instead of quietly re-scoring the fleet.
 *
 *                                            distinct  top     std   busy   dark
 *   loading shell, stability i01/i02/i03           35  0.996    5.9  0.003  0.997
 *   service-worker offline card                    57  0.862   43.9  0.095  0.879
 *   world rendered, then WENT OUT mid-row          44  0.977   18.4  0.016  0.989
 *   black canvas + menu + „Пауза" (C8, portrait)  110  0.592   49.7  0.023  0.864
 *   black canvas + menu + „Пауза" (C8, landscape) 101  0.422   49.8  0.035  0.851
 *   world up, driving          (portrait)         456  0.153   54.1  0.136  0.110
 *   world up, ambient          (portrait)         463  0.141   52.6  0.139  0.110
 *   world up, intro popup over it (portrait)      450  0.141   60.0  0.117  0.186
 *   world up, driving          (landscape)        431  0.239   37.3  0.225  0.136
 *   world up, ambient          (landscape)        410  0.227   35.4  0.213  0.133
 *
 * The two C8 rows are the ones that matter: they are the frames row C8's
 * „1,190 ms" and „996 ms" were taken from — a black canvas with the lesson menu
 * open and a „Пауза" modal stacked on it — and their DOM panels alone give the
 * band 110 colours and a luminance spread of 49.7.
 *
 * WHICH LIMIT ACTUALLY DOES THE WORK, stated honestly, because an earlier
 * version of this comment claimed all five were separated by 2x and that is
 * not what the frames say:
 *
 *   distinct   worlds 410..463   not-worlds 35..110   CLEAN — 3.7x gap, the
 *              limit sits between with room on both sides. Every rejection
 *              above fires on this one first.
 *   darkShare  worlds .110..186  not-worlds .851..997 CLEAN — the widest
 *              separation in the table. A cleared buffer is black; a lit street
 *              is not, whatever is painted over it.
 *   topShare   worlds ≤.239      not-worlds ≥.422     CLEAN, narrower: the
 *              limit has 1.5x headroom over the busiest world.
 *   busyShare  worlds ≥.117      not-worlds ≤.095     DISCRIMINATES, but the
 *              limit is deliberately a floor at .06, BELOW the offline card's
 *              .095 — it is here to catch the two black-canvas classes (.003,
 *              .023) without risking a calm scene (fog, a night lesson) that
 *              happens to be smooth. It is not load-bearing alone.
 *   stdLuma    worlds ≥35.4      not-worlds 5.9..49.8 DOES NOT DISCRIMINATE.
 *              The C8 frame's spread (49.8) is HIGHER than a real landscape
 *              world's (35.4), because bright dialog text on black is the
 *              highest-contrast thing on the screen. This limit is a floor
 *              against a uniform fill and nothing more. Colour statistics
 *              cannot tell a rendered street from a dialog; that is precisely
 *              why all five are required TOGETHER.
 *
 * `maxDarkShare` assumes a lit scene, which every scenario this probe measures
 * is. A night lesson would need it raised — do that explicitly at the call
 * site, and say so in the report, rather than widening it here for everyone.
 */
export const WORLD_FRAME = {
  /** Fewer than this many distinct colours is a fill, not a scene. */
  minDistinct: 200,
  /** One colour owning more than this much of the band is a fill. */
  maxTopShare: 0.35,
  /** A scene has contrast; a cleared buffer has none. */
  minStdLuma: 12,
  /** Spatial texture — the one a dialog cannot fake. */
  minBusyShare: 0.06,
  /** A cleared buffer is black. A rendered street is not. */
  maxDarkShare: 0.6,
  /** The road surface has to be at least this big to be the road surface. */
  minCanvasPx: 200,
};

/**
 * @param {ReturnType<typeof frameVitals>} vitals
 * @returns {{ok:boolean, reason:string|null}}
 */
export function isWorldFrame(vitals, limits = WORLD_FRAME) {
  if (vitals.distinct < limits.minDistinct) {
    return { ok: false, reason: `only ${vitals.distinct} distinct colours (need ${limits.minDistinct})` };
  }
  if (vitals.topShare > limits.maxTopShare) {
    return {
      ok: false,
      reason: `one colour owns ${(vitals.topShare * 100).toFixed(1)}% of the frame (max ${(limits.maxTopShare * 100).toFixed(0)}%)`,
    };
  }
  if (vitals.stdLuma < limits.minStdLuma) {
    return { ok: false, reason: `luminance spread ${vitals.stdLuma} (need ${limits.minStdLuma})` };
  }
  if (vitals.busyShare < limits.minBusyShare) {
    return {
      ok: false,
      reason:
        `only ${(vitals.busyShare * 100).toFixed(1)}% of the frame varies between neighbouring ` +
        `pixels (need ${(limits.minBusyShare * 100).toFixed(0)}%) — flat fill, not a rendered scene`,
    };
  }
  if (vitals.darkShare > limits.maxDarkShare) {
    return {
      ok: false,
      reason: `${(vitals.darkShare * 100).toFixed(1)}% of the frame is near-black (max ${(limits.maxDarkShare * 100).toFixed(0)}%)`,
    };
  }
  return { ok: true, reason: null };
}

/** The app's own admission that it is not up. Returned verbatim so it can be quoted. */
export const NOT_UP_TEXTS = [
  "Зареждане на", // LessonScene's loading card, and SceneSlot's
  "Светът не се зареди", // LessonScene's GateCard when the world build threw
  "Данните за", // …its body text
];

/**
 * The largest visible canvas, in CSS pixels, or null.
 * @param {import("playwright").Page} page
 */
export async function canvasBox(page) {
  return page
    .evaluate(() => {
      let best = null;
      for (const c of document.querySelectorAll("canvas")) {
        const r = c.getBoundingClientRect();
        const cs = getComputedStyle(c);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (!best || r.width * r.height > best.width * best.height) {
          best = { x: r.x, y: r.y, width: r.width, height: r.height };
        }
      }
      return best;
    })
    .catch(() => null);
}

/**
 * Screenshot the middle of the canvas and describe it.
 *
 * THE CENTRE BAND, because that is where the road is and where the harness's
 * own overlay budget says nothing may paint („any pixel a control paints on is
 * NOT road"). A corner would sample the HUD; the whole canvas would let a busy
 * HUD carry a blank world past the gate.
 *
 * @param {import("playwright").Page} page
 * @param {{band?:number}} options fraction of the canvas to sample, centred
 */
export async function worldVitals(page, { band = 0.5 } = {}) {
  const box = await canvasBox(page);
  if (!box) return { box: null, vitals: null, reason: "no visible canvas" };
  if (box.width < WORLD_FRAME.minCanvasPx || box.height < WORLD_FRAME.minCanvasPx) {
    return {
      box,
      vitals: null,
      reason: `canvas is ${Math.round(box.width)}x${Math.round(box.height)} CSS px — too small to be the road`,
    };
  }
  const w = Math.max(32, Math.round(box.width * band));
  const h = Math.max(32, Math.round(box.height * band));
  const clip = {
    x: Math.round(box.x + (box.width - w) / 2),
    y: Math.round(box.y + (box.height - h) / 2),
    width: w,
    height: h,
  };
  const shot = await page.screenshot({ clip, animations: "allow" }).catch(() => null);
  if (!shot) return { box, vitals: null, reason: "screenshot failed" };
  return { box, clip, vitals: frameVitals(shot), reason: null };
}

/**
 * Is the app admitting, in its own words, that the world is not up?
 * @param {import("playwright").Page} page
 */
export async function loadingText(page) {
  return page
    .evaluate((needles) => {
      const text = document.body?.innerText || "";
      return needles.find((n) => text.includes(n)) ?? null;
    }, NOT_UP_TEXTS)
    .catch(() => null);
}

/**
 * WAIT FOR THE WORLD, AND SAY WHAT HAPPENED.
 *
 * Returns rather than throws: the caller decides whether a route that never
 * rendered is a failed row or a skipped one, and the timeline is the evidence
 * either way. `ms` is the wait itself — it is NOT part of any settle number and
 * must never be reported as one.
 *
 * @param {import("playwright").Page} page
 * @param {{timeoutMs?:number, pollMs?:number, band?:number, consecutive?:number, onStep?:Function}} options
 * @returns {Promise<{ready:boolean, ms:number, reads:number, reason:string|null,
 *                    vitals:object|null, timeline:Array}>}
 */
export async function waitForWorld(
  page,
  { timeoutMs = 120_000, pollMs = 750, band = 0.5, consecutive = 2, onStep = null } = {},
) {
  const started = Date.now();
  const timeline = [];
  let good = 0;
  let reads = 0;
  let last = null;

  for (;;) {
    const at = Date.now() - started;
    const loading = await loadingText(page);
    const { box, vitals, reason } = loading
      ? { box: null, vitals: null, reason: `app says „${loading}…"` }
      : await worldVitals(page, { band });
    reads += 1;
    const verdict = vitals ? isWorldFrame(vitals) : { ok: false, reason };
    last = { at, ok: verdict.ok, reason: verdict.reason, ...(vitals ?? {}), box: box ?? undefined };
    timeline.push({
      at,
      ok: verdict.ok,
      reason: verdict.reason,
      distinct: vitals?.distinct ?? null,
      topShare: vitals ? Math.round(vitals.topShare * 1000) / 1000 : null,
      stdLuma: vitals?.stdLuma ?? null,
    });
    if (onStep) onStep(timeline[timeline.length - 1]);

    good = verdict.ok ? good + 1 : 0;
    if (good >= consecutive) {
      return { ready: true, ms: Date.now() - started, reads, reason: null, vitals: last, timeline };
    }
    if (Date.now() - started >= timeoutMs) {
      return {
        ready: false,
        ms: Date.now() - started,
        reads,
        reason: verdict.reason ?? "unknown",
        vitals: last,
        timeline,
      };
    }
    await page.waitForTimeout(pollMs);
  }
}
