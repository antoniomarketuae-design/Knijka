/**
 * png.mjs — decode a PNG to raw RGBA, with nothing but node:zlib.
 *
 * WHY THIS EXISTS AND IS NOT `sharp`. The steering control law has to look at
 * the pixels of the road, and the pixels only exist as a `page.screenshot()`
 * buffer: the sim's canvas is WebGL without `preserveDrawingBuffer`, so the
 * page cannot read its own picture. That leaves three ways to turn a PNG into
 * numbers, and two of them are worse than they look:
 *
 *   · SHIP IT BACK INTO THE PAGE as a base64 data URL and decode it with
 *     `createImageBitmap`. This is what the round-3 steering PROOF does. It
 *     costs a CDP round trip with the whole image inline, and — MEASURED HERE,
 *     2026-08-21 — it does not even run on the leg that matters: WebKit has no
 *     `OffscreenCanvas`, so the first draft of the survey died with
 *     `ReferenceError: Can't find variable: OffscreenCanvas` on the iPhone
 *     profile, which is the ONLY profile the mobile sweep uses.
 *   · `sharp`, which IS installed — in `platform/node_modules`, i.e. inside the
 *     application under test. A harness that imports from the product's own
 *     dependency tree is one `npm prune` away from a sweep that cannot steer,
 *     and the failure would arrive as "the ribbon was never seen" — a SILENT
 *     revert to straight-line driving, which is the single failure mode this
 *     whole round exists to make impossible.
 *
 * So: zlib, which ships with Node, and ~90 lines. Playwright emits 8-bit
 * non-interlaced PNG; anything else is REFUSED BY NAME rather than decoded
 * wrong, because a decoder that quietly mis-reads a colour type would feed the
 * control law plausible garbage.
 */
import { inflateSync } from "node:zlib";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Bytes per pixel by PNG colour type, at bit depth 8. */
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

/**
 * @param {Buffer} buf a PNG file
 * @returns {{ width:number, height:number, channels:number, data:Buffer }}
 *          `data` is row-major, `channels` bytes per pixel, R first.
 */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error("not a PNG (signature)");
  }
  let width = 0, height = 0, depth = 0, colour = -1, interlace = 0;
  const idat = [];
  let p = 8;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colour = body[9];
      interlace = body[12];
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    p += 12 + len; // length + type + body + CRC
  }
  if (depth !== 8) throw new Error(`PNG bit depth ${depth} is not supported (8 only)`);
  if (interlace !== 0) throw new Error("interlaced PNG is not supported");
  const channels = CHANNELS[colour];
  if (!channels) throw new Error(`PNG colour type ${colour} is not supported`);
  if (!idat.length) throw new Error("PNG carried no IDAT");

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.allocUnsafe(stride * height);
  let ip = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[ip++];
    const row = raw.subarray(ip, ip + stride);
    ip += stride;
    const o = y * stride;
    const prev = o - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[o + x - channels] : 0; // left
      const b = y > 0 ? out[prev + x] : 0; //                  up
      const c = y > 0 && x >= channels ? out[prev + x - channels] : 0; // up-left
      const v = row[x];
      let r;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: {
          // Paeth
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`PNG filter type ${filter} on row ${y}`);
      }
      out[o + x] = r & 0xff;
    }
  }
  return { width, height, channels, data: out };
}
