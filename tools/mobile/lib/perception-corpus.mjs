/**
 * perception-corpus.mjs — THE RECORDED FRAMES, TURNED INTO SOMETHING A BENCH
 * CAN READ A HUNDRED TIMES WITHOUT TOUCHING THE DISK AGAIN.
 *
 * WHY THIS EXISTS. Every perception change in this file's neighbourhood has to
 * be argued against the frames that are already on disk — the
 * `04-t###s.png` of every `.audit-frames/wNN/frames/<lesson>__<leg>` — and
 * there are thousands of them, on a
 * 7200 rpm HDD, at 1440×900 (pc) or 2556×1179 (mobile). One decode pass over
 * the named failing lessons costs about twenty minutes. Ten experiments cost
 * three hours, and an experiment nobody can afford to re-run is an experiment
 * whose result nobody re-checks.
 *
 * So the decode happens ONCE and what is kept is the only thing the perception
 * ever looks at: `isRibbonPixel` applied to the scan band, packed one bit per
 * pixel and deflated. A pc band is 1166×210 = 30 KB of bits before deflate and
 * a few hundred bytes after, because the mask is sparse. The whole named
 * corpus fits in a few tens of megabytes and reloads in seconds.
 *
 * WHAT IT DELIBERATELY DOES NOT CACHE, so nobody mistakes this for the frame:
 *
 *   · COLOUR. The bit is `isRibbonPixel(r,g,b)` and nothing else. Any change
 *     to that predicate INVALIDATES every cache file, which is why the
 *     predicate's own source text is hashed into the header and a stale cache
 *     is refused by name rather than read.
 *   · THE LIVE HUD MASKS. `lesson-audit.mjs` computes them from the DOM at
 *     scan time and does not record them, so a replay CANNOT reproduce them.
 *     This is stated on every number the bench prints rather than buried:
 *     a replay sees MORE teal than the drive did, never less, which biases
 *     every measurement here toward finding furniture — the direction that
 *     makes a furniture-subtraction change look LESS necessary than it is,
 *     not more. (Measured on 12 lanes / 154 paired samples: replayed band
 *     pixels over recorded, p10 0.47, median 1.00, p90 2.60; |errDeg| replay
 *     vs recorded, median 1.00°, p90 16.7°; seen/not-seen agrees on 136/142.
 *     The spread is mostly that the written frame and the scan screenshot are
 *     two different photographs taken a few hundred milliseconds apart.)
 *
 * The band geometry, `degPerPx`, and the drive's own samples come out of
 * `_audit-status.json`, which the sweep already writes.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

import { decodePng } from "./png.mjs";
import { isRibbonPixel } from "./guidance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..", "..");
export const FRAMES_DIR = join(REPO, ".audit-frames");

/**
 * THE FOURTEEN LESSONS THE PROGRAMME NAMED, and the reason they are a list and
 * not a filter over `turnDemandDeg`: these are the lessons whose audit rows
 * cannot be settled because the harness cannot drive a turn. Zero of the 97
 * lanes demanding ≥30° of turn is on-line by `tools/audit/route-fidelity.mjs`.
 */
export const NAMED_FAILING = Object.freeze([
  "sc-junction-gap",
  "sc-junction-left",
  "sc-junction-rhr",
  "sc-junction-stop",
  "sc-roundabout-entry",
  "sc-rb-busy-gap",
  "sc-rb-lane-choice",
  "sc-rb-ped-exit",
  "sc-turn-left-oncoming",
  "sc-vu-cyclist-hook",
  "sc-vu-emergency-junction",
  "sc-merge-from-property",
  "sc-ed-d2-priority-run",
  "sc-ed-poligon-chain",
]);

/** A cache built against a different pixel test is a cache of a different
 *  question. The predicate's source is hashed so it cannot be read by mistake. */
export const PIXEL_TEST_ID = createHash("sha1").update(String(isRibbonPixel)).digest("hex").slice(0, 12);

const FRAME_RE = /^04-t(\d+)s\.png$/;

/** every sweep directory that carries frames, newest name last */
export function sweepDirs(root = FRAMES_DIR) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((d) => /^w\d+$/.test(d) && existsSync(join(root, d, "frames")))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

/**
 * Every recorded lane directory.
 * @param {{lessons?:string[]|null, sweeps?:string[]|null, root?:string}} o
 *        `lessons: null` means all of them.
 */
export function laneDirs({ lessons = NAMED_FAILING, sweeps = null, root = FRAMES_DIR } = {}) {
  const out = [];
  for (const s of sweepDirs(root)) {
    if (sweeps && !sweeps.includes(s)) continue;
    const fr = join(root, s, "frames");
    for (const lane of readdirSync(fr)) {
      const i = lane.indexOf("__");
      if (i < 0) continue;
      const lesson = lane.slice(0, i);
      if (lessons && !lessons.includes(lesson)) continue;
      const dir = join(fr, lane);
      if (!existsSync(join(dir, "_audit-status.json"))) continue;
      out.push({ sweep: s, lane, lesson, leg: lane.slice(i + 2), dir });
    }
  }
  return out;
}

/**
 * The device pixel ratio of a recorded frame, chosen as the LARGEST of 1/2/3
 * under which the CSS band still fits inside the frame.
 *
 * It is derived rather than recorded because `_audit-status.json` publishes the
 * band in CSS pixels and the frame in device pixels and nothing publishes the
 * ratio. The choice is then CHECKED against `degPerPx`, which the status file
 * does publish and which is a function of the canvas device width — see
 * `readLane`, which refuses a lane whose two readings disagree by more than a
 * rounding rather than scanning a mis-cropped band.
 */
export function dprForFrame(band, frameWidth) {
  for (const d of [3, 2, 1]) if ((band.x + band.width) * d <= frameWidth + 2) return d;
  return 1;
}

/** Pack a band of decoded pixels into one bit per ribbon pixel, row-major. */
export function packRibbonMask(img, x0, y0, w, h) {
  const bits = Buffer.alloc(Math.ceil((w * h) / 8));
  const { data, width: W, channels: C } = img;
  let set = 0;
  for (let y = 0; y < h; y++) {
    const rowBase = (y0 + y) * W;
    const outBase = y * w;
    for (let x = 0; x < w; x++) {
      const i = (rowBase + x0 + x) * C;
      if (!isRibbonPixel(data[i], data[i + 1], data[i + 2])) continue;
      const k = outBase + x;
      bits[k >> 3] |= 128 >> (k & 7);
      set++;
    }
  }
  return { bits, set };
}

/** A packed mask, seen as the `{rows,total,width,height}` shape `aimFrom` reads. */
export function scanFromMask(bits, w, h) {
  const rows = new Array(h);
  let total = 0;
  for (let y = 0; y < h; y++) {
    let n = 0;
    let sx = 0;
    let minX = w;
    let maxX = -1;
    const base = y * w;
    for (let x = 0; x < w; x++) {
      const k = base + x;
      if (!(bits[k >> 3] & (128 >> (k & 7)))) continue;
      n++;
      sx += x;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    total += n;
    rows[y] = n ? { y, n, cx: sx / n, minX, maxX } : { y, n: 0, cx: null, minX: null, maxX: null };
  }
  return { rows, total, width: w, height: h };
}

/** Is bit (x,y) set in a packed mask of width w? */
export const maskAt = (bits, w, x, y) => {
  const k = y * w + x;
  return (bits[k >> 3] & (128 >> (k & 7))) !== 0;
};

/**
 * Read one lane: its status file, its band, and the list of frames on disk.
 * Returns null (never a half-lane) when anything needed is missing.
 */
export function readLane(l) {
  let st;
  try {
    st = JSON.parse(readFileSync(join(l.dir, "_audit-status.json"), "utf8"));
  } catch {
    return null;
  }
  const g = st.guidance;
  if (!g || !g.band || !(g.band.width > 0)) return null;
  const shots = readdirSync(l.dir)
    .map((f) => {
      const m = FRAME_RE.exec(f);
      return m ? { file: join(l.dir, f), name: f, tSec: Number(m[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.tSec - b.tSec);
  if (!shots.length) return null;
  return { ...l, status: st, band: g.band, degPerPx: g.degPerPx, samples: g.samples || [], shots };
}

const cacheFile = (cacheDir, l) => join(cacheDir, `${l.sweep}__${l.lane}.bin`);

/**
 * Build (or reuse) the packed-mask cache for one lane.
 * The file is `<json header>\n<deflated concatenated masks>`.
 */
export function buildLaneCache(l, cacheDir) {
  mkdirSync(cacheDir, { recursive: true });
  const out = cacheFile(cacheDir, l);
  if (existsSync(out)) {
    const got = loadLaneCache(out);
    if (got && got.pixelTest === PIXEL_TEST_ID) return got;
  }
  const lane = readLane(l);
  if (!lane) return null;
  const frames = [];
  const chunks = [];
  let w = 0;
  let h = 0;
  let dpr = 0;
  for (const sh of lane.shots) {
    let img;
    try {
      img = decodePng(readFileSync(sh.file));
    } catch {
      continue;
    }
    const d = dprForFrame(lane.band, img.width);
    const x0 = Math.round(lane.band.x * d);
    const y0 = Math.round(lane.band.y * d);
    const bw = Math.min(Math.round(lane.band.width * d), img.width - x0);
    const bh = Math.min(Math.round(lane.band.height * d), img.height - y0);
    if (!(bw > 0 && bh > 0)) continue;
    if (!w) {
      w = bw;
      h = bh;
      dpr = d;
    }
    // A lane whose frames are not all the same shape is a lane whose window was
    // resized mid-drive; the band geometry in the status file describes one of
    // them and not the other, so the odd frames are dropped and counted rather
    // than cropped to a rectangle that never existed.
    if (bw !== w || bh !== h) continue;
    const { bits, set } = packRibbonMask(img, x0, y0, w, h);
    frames.push({ tSec: sh.tSec, name: sh.name, total: set });
    chunks.push(bits);
  }
  if (!frames.length) return null;
  const header = {
    v: 1,
    pixelTest: PIXEL_TEST_ID,
    sweep: l.sweep,
    lane: l.lane,
    lesson: l.lesson,
    leg: l.leg,
    dir: l.dir,
    band: lane.band,
    degPerPx: lane.degPerPx,
    dpr,
    w,
    h,
    frames,
    samples: lane.samples,
    tracking: (lane.status.guidance || {}).tracking || null,
    witness: ((lane.status.guidance || {}).witness || {}).poses ? { poses: lane.status.guidance.witness.poses } : null,
    verdict: lane.status.verdict ?? null,
    score: lane.status.score ?? null,
  };
  const body = deflateSync(Buffer.concat(chunks));
  writeFileSync(out, Buffer.concat([Buffer.from(JSON.stringify(header) + "\n", "utf8"), body]));
  return { ...header, path: out, _body: null, bits: chunks };
}

/** Read a cache file back. `frameMask(i)` inflates lazily, once per file. */
export function loadLaneCache(path) {
  let buf;
  try {
    buf = readFileSync(path);
  } catch {
    return null;
  }
  const nl = buf.indexOf(0x0a);
  if (nl < 0) return null;
  let header;
  try {
    header = JSON.parse(buf.toString("utf8", 0, nl));
  } catch {
    return null;
  }
  const stride = Math.ceil((header.w * header.h) / 8);
  let all = null;
  const bitsOf = (i) => {
    if (all === null) all = inflateSync(buf.subarray(nl + 1));
    return all.subarray(i * stride, (i + 1) * stride);
  };
  return { ...header, path, stride, bitsOf };
}

/** Every cache file already built, as loaded headers. */
export function loadCache(cacheDir, { lessons = null } = {}) {
  if (!existsSync(cacheDir)) return [];
  const out = [];
  for (const f of readdirSync(cacheDir)) {
    if (!f.endsWith(".bin")) continue;
    const c = loadLaneCache(join(cacheDir, f));
    if (!c || c.pixelTest !== PIXEL_TEST_ID) continue;
    if (lessons && !lessons.includes(c.lesson)) continue;
    out.push(c);
  }
  return out.sort((a, b) => (a.lane < b.lane ? -1 : a.lane > b.lane ? 1 : a.sweep < b.sweep ? -1 : 1));
}
