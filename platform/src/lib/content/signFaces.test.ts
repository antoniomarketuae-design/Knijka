/**
 * Sign-face geometry gate — the artwork equivalent of the content validator.
 *
 * WHY THIS EXISTS: the catalogue faces in content/signs/svg are ORIGINAL
 * geometric renditions (README: Vienna-Convention style, never traced from the
 * ordinance annexes), and hand-authored vector art has one failure mode that
 * hand review keeps missing — the glyph spills over the plate border. A
 * warning triangle whose barrier symbol pokes through the red edge, a
 * roundabout whose arrow ring overruns the apex, a pedestrian whose legs hang
 * below the base: every one of those shipped, and the founder caught them by
 * eye on the verdict board. Twice. Eyes are not a gate; this is.
 *
 * The invariant, stated once: EVERYTHING DRAWN ON TOP OF THE PLATE MUST LIE
 * INSIDE THE PLATE'S FIELD, WITH CLEARANCE. No per-sign pixel goldens (they
 * rot on every legitimate redraw) — the check is derived from each file's own
 * plate primitives, so a new sign is covered the moment it is added.
 *
 * How the field is derived (uniform rule, no hand-tabulated geometry):
 *   field = ∩ over the plate primitives of (path interior ⊖ strokeWidth/2)
 * That one rule handles every plate in the catalogue — a filled triangle with
 * a red border (А), a filled disc with a red ring (В), a blue disc with an
 * inset white ring drawn as `fill="none"` (Г), a blue square with a white
 * triangle on it (Д17) — because in all four cases the drawable white/blue
 * space is exactly the path interior minus the half of the stroke that falls
 * inside it. `safe` is then `field` eroded by CLEARANCE_UNITS.
 *
 * The plate primitives are DECLARED by the artwork (`data-plate`) rather than
 * sniffed from document order. Inference looked tempting — the plate is always
 * drawn first — but it silently mistook Г19's chain-symbol circle and Б4's
 * inner yellow diamond for plate layers, i.e. it widened the very boundary it
 * was supposed to police. A gate that can be fooled by the file it inspects is
 * not a gate; one attribute per plate element buys certainty.
 *
 * Two escape hatches, both explicit in the artwork rather than in a list here:
 *   - `data-span="face"` marks an element whose OFFICIAL design crosses the
 *     whole face — the cancellation/prohibition bar of Б4, В27, В28, В33, Г18,
 *     Д12. Those are measured against the plate silhouette instead, so the bar
 *     may touch the border (it must, on the real sign) but still may not leave
 *     it.
 *   - `<text>` is measured ANALYTICALLY, not from the raster, because the
 *     rasteriser resolves "Arial, Helvetica, sans-serif" to whatever the host
 *     has (Arial here, DejaVu/Liberation on the deploy box) and a raster gate
 *     would either be flaky or would bless a face that overflows on a student's
 *     phone. The bound below is a pessimistic upper envelope over the bold
 *     sans-serifs a browser can plausibly pick, so passing it means the face is
 *     safe in ALL of them — which is the property we actually want.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { resolveContentDir } from "./loader";
import { contentRepo } from "./loader";

// --------------------------------------------------------------------------
// Gate constants
// --------------------------------------------------------------------------

/** All catalogue faces are authored in a 200×200 viewBox (content/signs/README). */
const VIEWBOX = 200;
/** 2 px per viewBox unit — enough to resolve a 4-unit clearance, cheap to scan. */
const RASTER = 400;
const PX_PER_UNIT = RASTER / VIEWBOX;

/**
 * Minimum gap between any glyph ink and the plate's border, in viewBox units
 * (2% of the face). Not a style preference — it is the margin that makes the
 * difference between "the symbol reaches the border" (correct on a real sign)
 * and "the symbol eats the border", which is the defect class this file exists
 * to stop. Authored glyphs sit at or inside it by construction.
 */
const CLEARANCE_UNITS = 4;
const CLEARANCE_PX = CLEARANCE_UNITS * PX_PER_UNIT;

/** A pixel counts as glyph ink when it differs from the bare plate this much. */
const INK_DELTA = 60;

/**
 * Pessimistic text metrics, in em, covering the bold sans-serifs a rasteriser
 * or browser can resolve "Arial, Helvetica, sans-serif" to. Arial/Liberation
 * Bold caps run ≈0.61–0.78 em and digits 0.556 em; DejaVu Sans Bold is the
 * wide end at ≈0.70 em digits / 0.79 em caps. 0.80 clears both with room, so a
 * face that passes here cannot overflow on a font we did not test.
 */
const ADVANCE_EM = 0.8;
/** Cap height above the baseline / descender below it, same pessimism. */
const CAP_EM = 0.78;
const DESCENT_EM = 0.25;

// --------------------------------------------------------------------------
// SVG splitting
// --------------------------------------------------------------------------

interface Element {
  tag: string;
  /** The element's full source, including children. */
  source: string;
  /** Attributes of the opening tag. */
  attrs: Record<string, string>;
  /** Inner source for container elements ("" for self-closing). */
  inner: string;
}

function parseAttrs(open: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of open.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]!] = m[2]!;
  return out;
}

/** Split a fragment into its top-level elements (the catalogue nests shallowly). */
function topLevel(fragment: string): Element[] {
  const out: Element[] = [];
  let i = 0;
  while (i < fragment.length) {
    const lt = fragment.indexOf("<", i);
    if (lt < 0) break;
    const gt = fragment.indexOf(">", lt);
    if (gt < 0) break;
    const open = fragment.slice(lt, gt + 1);
    const tag = /^<\s*([\w:-]+)/.exec(open)![1]!;
    if (open.endsWith("/>")) {
      out.push({ tag, source: open, attrs: parseAttrs(open), inner: "" });
      i = gt + 1;
      continue;
    }
    // Container: walk to its matching close tag, honouring nesting.
    let depth = 1;
    let j = gt + 1;
    while (depth > 0) {
      const next = fragment.indexOf(`<${tag}`, j);
      const close = fragment.indexOf(`</${tag}`, j);
      if (close < 0) throw new Error(`unclosed <${tag}>`);
      if (next >= 0 && next < close) {
        depth++;
        j = next + tag.length + 1;
      } else {
        depth--;
        j = close + tag.length + 3;
      }
    }
    const source = fragment.slice(lt, j);
    out.push({
      tag,
      source,
      attrs: parseAttrs(open),
      inner: source.slice(open.length, source.lastIndexOf(`</${tag}`)),
    });
    i = j;
  }
  return out;
}

interface Face {
  head: string;
  /** <defs> etc. — replayed into every render so url(#…) refs resolve. */
  prelude: string;
  /** The declared plate primitives (data-plate), outermost first. */
  plate: Element[];
  /** Officially face-spanning elements (data-span="face"). */
  spans: Element[];
  /** Everything else drawn on the plate. */
  glyph: Element[];
}

function splitFace(svg: string): Face {
  const headEnd = svg.indexOf(">", svg.indexOf("<svg"));
  const head = svg.slice(0, headEnd + 1);
  const body = svg
    .slice(headEnd + 1, svg.lastIndexOf("</svg>"))
    .replace(/<title[\s\S]*?<\/title>/g, "");

  const prelude: string[] = [];
  const plate: Element[] = [];
  const spans: Element[] = [];
  const glyph: Element[] = [];
  for (const el of topLevel(body)) {
    if (el.tag === "defs") prelude.push(el.source);
    else if (el.attrs["data-plate"] !== undefined) plate.push(el);
    else if (el.attrs["data-span"] === "face") spans.push(el);
    else glyph.push(el);
  }
  return { head, prelude: prelude.join(""), plate, spans, glyph };
}

// --------------------------------------------------------------------------
// Rasterising + masks
// --------------------------------------------------------------------------

interface Raster {
  data: Buffer;
  /** RGBA stride. */
  ch: number;
}

async function raster(svg: string): Promise<Raster> {
  const { data, info } = await sharp(Buffer.from(svg), { density: 384 })
    .resize(RASTER, RASTER, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, ch: info.channels };
}

/** Re-render one plate primitive as its own interior: black fill, stroke masked white. */
function interiorSvg(head: string, prelude: string, el: Element): string {
  const w = el.attrs["stroke-width"];
  const solo = el.source
    .replace(/\sfill="[^"]*"/, "")
    .replace(/\sstroke="[^"]*"/, "")
    .replace(/\sstroke-width="[^"]*"/, "")
    .replace(/\/>$/, ` fill="#000000"${w ? ` stroke="#ffffff" stroke-width="${w}"` : ""}/>`);
  return `${head}${prelude}${solo}</svg>`;
}

/** Whole-plate silhouette: fill AND stroke, both opaque. */
function silhouetteSvg(head: string, prelude: string, plate: Element[]): string {
  const solo = plate
    .map((el) =>
      el.source
        .replace(/\sfill="[^"]*"/, "")
        .replace(/\sstroke="[^"]*"/, "")
        .replace(/\/>$/, ' fill="#000000" stroke="#000000"/>'),
    )
    .join("");
  return `${head}${prelude}${solo}</svg>`;
}

const solid = (r: Raster, i: number) => r.data[i * r.ch + 3]! > 200 && r.data[i * r.ch]! < 80;

/**
 * Chamfer (3,4) distance from every set pixel to the nearest unset one, in
 * thirds of a pixel. Two passes, O(n) — a brute-force disc erosion at this
 * raster size is ~160M probes per sign and would make the gate unrunnable.
 */
function insideDistance(mask: Uint8Array): Int32Array {
  const n = RASTER;
  const d = new Int32Array(n * n);
  const BIG = 1 << 28;
  for (let i = 0; i < n * n; i++) d[i] = mask[i] ? BIG : 0;
  const relax = (i: number, j: number, w: number) => {
    const v = d[j]! + w;
    if (v < d[i]!) d[i] = v;
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (d[i] === 0) continue;
      if (y > 0) relax(i, i - n, 3);
      if (x > 0) relax(i, i - 1, 3);
      if (y > 0 && x > 0) relax(i, i - n - 1, 4);
      if (y > 0 && x < n - 1) relax(i, i - n + 1, 4);
    }
  }
  for (let y = n - 1; y >= 0; y--) {
    for (let x = n - 1; x >= 0; x--) {
      const i = y * n + x;
      if (d[i] === 0) continue;
      if (y < n - 1) relax(i, i + n, 3);
      if (x < n - 1) relax(i, i + 1, 3);
      if (y < n - 1 && x < n - 1) relax(i, i + n + 1, 4);
      if (y < n - 1 && x > 0) relax(i, i + n - 1, 4);
    }
  }
  return d;
}

// --------------------------------------------------------------------------
// Per-sign measurement
// --------------------------------------------------------------------------

interface Spill {
  /** Ink pixels outside the safe area. */
  count: number;
  /** Worst offender in viewBox units, for a message a human can act on. */
  worst: { x: number; y: number; overUnits: number } | null;
}

async function measure(svgSource: string): Promise<Spill> {
  const face = splitFace(svgSource);
  const { head, prelude, plate, spans, glyph } = face;

  // Glyph ink = whatever the glyph layer adds on top of plate + spanning bars.
  // Text is excluded here and bounded analytically (see the header).
  const baseSrc = `${head}${prelude}${plate.map((e) => e.source).join("")}${spans
    .map((e) => e.source)
    .join("")}</svg>`;
  const glyphSrc = glyph.map((e) => e.source.replace(/<text[\s\S]*?<\/text>/g, "")).join("");
  const [base, full] = await Promise.all([raster(baseSrc), raster(`${baseSrc.slice(0, -6)}${glyphSrc}</svg>`)]);

  // field = ∩ of every plate primitive's interior (stroke masked off).
  const field = new Uint8Array(RASTER * RASTER).fill(1);
  for (const el of plate) {
    const r = await raster(interiorSvg(head, prelude, el));
    for (let i = 0; i < field.length; i++) if (!solid(r, i)) field[i] = 0;
  }
  const dist = insideDistance(field);

  let count = 0;
  let worst: Spill["worst"] = null;
  for (let i = 0; i < RASTER * RASTER; i++) {
    const o = i * full.ch;
    const isInk =
      full.data[o + 3]! > 40 &&
      (Math.abs(full.data[o]! - base.data[o]!) > INK_DELTA ||
        Math.abs(full.data[o + 1]! - base.data[o + 1]!) > INK_DELTA ||
        Math.abs(full.data[o + 2]! - base.data[o + 2]!) > INK_DELTA ||
        Math.abs(full.data[o + 3]! - base.data[o + 3]!) > INK_DELTA);
    if (!isInk) continue;
    const clear = dist[i]! / 3; // chamfer thirds → px
    if (clear >= CLEARANCE_PX) continue;
    count++;
    const overUnits = (CLEARANCE_PX - clear) / PX_PER_UNIT;
    if (!worst || overUnits > worst.overUnits) {
      worst = {
        x: +((i % RASTER) / PX_PER_UNIT).toFixed(1),
        y: +(((i / RASTER) | 0) / PX_PER_UNIT).toFixed(1),
        overUnits: +overUnits.toFixed(1),
      };
    }
  }
  return { count, worst };
}

/** Face-spanning bars: allowed to reach the border, never to leave the plate. */
async function measureSpans(svgSource: string): Promise<number> {
  const { head, prelude, plate, spans } = splitFace(svgSource);
  if (spans.length === 0) return 0;
  const plateSrc = plate.map((e) => e.source).join("");
  const [bare, withBars, sil] = await Promise.all([
    raster(`${head}${prelude}${plateSrc}</svg>`),
    raster(`${head}${prelude}${plateSrc}${spans.map((e) => e.source).join("")}</svg>`),
    raster(silhouetteSvg(head, prelude, plate)),
  ]);
  let out = 0;
  for (let i = 0; i < RASTER * RASTER; i++) {
    const o = i * bare.ch;
    const changed =
      Math.abs(withBars.data[o]! - bare.data[o]!) > INK_DELTA ||
      Math.abs(withBars.data[o + 1]! - bare.data[o + 1]!) > INK_DELTA ||
      Math.abs(withBars.data[o + 2]! - bare.data[o + 2]!) > INK_DELTA ||
      Math.abs(withBars.data[o + 3]! - bare.data[o + 3]!) > INK_DELTA;
    if (changed && !solid(sil, i)) out++;
  }
  return out;
}

// --------------------------------------------------------------------------
// Analytic text bound
// --------------------------------------------------------------------------

interface TextBox {
  text: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Worst-case ink box of every <text>, with inherited presentation attributes. */
function textBoxes(svgSource: string): TextBox[] {
  const { head, prelude, plate, spans, glyph } = splitFace(svgSource);
  void head;
  void prelude;
  void plate;
  const out: TextBox[] = [];

  const walk = (els: Element[], inherited: Record<string, string>, transformed: boolean) => {
    for (const el of els) {
      const attrs = { ...inherited, ...el.attrs };
      const moved = transformed || el.attrs["transform"] !== undefined;
      if (el.tag === "text") {
        // A transform on a <text> ancestor would silently invalidate the box
        // below. No catalogue face does it; fail loudly if one starts to.
        if (moved) throw new Error(`<text> under a transform is not measurable: ${el.source}`);
        const size = Number(attrs["font-size"]);
        if (!Number.isFinite(size)) throw new Error(`<text> without font-size: ${el.source}`);
        const spacing = Number(attrs["letter-spacing"] ?? 0) || 0;
        const content = el.inner.replace(/\s+/g, " ").trim();
        const width = content.length * ADVANCE_EM * size + Math.max(0, content.length - 1) * spacing;
        const x = Number(attrs["x"] ?? 0);
        const y = Number(attrs["y"] ?? 0);
        const anchor = attrs["text-anchor"] ?? "start";
        const minX = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
        out.push({
          text: content,
          minX,
          maxX: minX + width,
          minY: y - CAP_EM * size,
          maxY: y + DESCENT_EM * size,
        });
        continue;
      }
      if (el.inner) walk(topLevel(el.inner), attrs, moved);
    }
  };
  walk([...spans, ...glyph], {}, false);
  return out;
}

// --------------------------------------------------------------------------
// The gate
// --------------------------------------------------------------------------

const SVG_DIR = path.join(resolveContentDir(), "signs", "svg");
const CATALOGUE = contentRepo
  .signs()
  .map((s) => ({ code: s.code, file: path.join(resolveContentDir(), s.svgFile) }))
  .sort((a, b) => a.code.localeCompare(b.code));

describe("sign catalogue artwork", () => {
  it("covers every catalogue entry with an svg the gate can parse", () => {
    expect(CATALOGUE.length).toBeGreaterThan(0);
    for (const { code, file } of CATALOGUE) {
      expect(fs.existsSync(file), `${code}: ${file}`).toBe(true);
      const face = splitFace(fs.readFileSync(file, "utf8"));
      // No plate means the gate has nothing to measure against — that is a
      // hole in the guard, not a passing sign.
      expect(face.plate.length, `${code} has no plate primitive`).toBeGreaterThan(0);
    }
  });

  it("leaves no orphan svg outside the catalogue", () => {
    const referenced = new Set(CATALOGUE.map((c) => path.basename(c.file)));
    for (const f of fs.readdirSync(SVG_DIR)) {
      if (f.endsWith(".svg")) expect(referenced.has(f), `${f} is not in signs.json`).toBe(true);
    }
  });

  // The defect the founder caught by eye, twice: glyph art that overruns the
  // plate border. One case per sign so a failure names the sign.
  for (const { code, file } of CATALOGUE) {
    it(`${code}: glyph stays inside the plate's safe area`, async () => {
      const spill = await measure(fs.readFileSync(file, "utf8"));
      expect(
        spill.count,
        spill.worst
          ? `${code}: glyph ink at (${spill.worst.x}, ${spill.worst.y}) is ${spill.worst.overUnits}u ` +
            `inside the ${CLEARANCE_UNITS}u border clearance (${spill.count} px). Redraw the glyph ` +
            `smaller / higher in the face — do not widen the plate.`
          : `${code}: ${spill.count} glyph px outside the safe area`,
      ).toBe(0);
    }, 20_000);
  }

  it("keeps every face-spanning bar inside the plate silhouette", async () => {
    for (const { code, file } of CATALOGUE) {
      const out = await measureSpans(fs.readFileSync(file, "utf8"));
      expect(out, `${code}: data-span="face" art leaves the plate (${out} px)`).toBe(0);
    }
  }, 60_000);

  it("keeps every <text> inside the safe area for ANY bold sans-serif", async () => {
    for (const { code, file } of CATALOGUE) {
      const source = fs.readFileSync(file, "utf8");
      const boxes = textBoxes(source);
      if (boxes.length === 0) continue;

      const { head, prelude, plate } = splitFace(source);
      const field = new Uint8Array(RASTER * RASTER).fill(1);
      for (const el of plate) {
        const r = await raster(interiorSvg(head, prelude, el));
        for (let i = 0; i < field.length; i++) if (!solid(r, i)) field[i] = 0;
      }
      const dist = insideDistance(field);

      for (const box of boxes) {
        // Every corner of the worst-case ink box must clear the border. The
        // box is an upper envelope over the fonts a browser may substitute, so
        // clearing it here means clearing it on the student's device.
        for (const [x, y] of [
          [box.minX, box.minY],
          [box.maxX, box.minY],
          [box.minX, box.maxY],
          [box.maxX, box.maxY],
        ] as const) {
          const px = Math.round(x * PX_PER_UNIT);
          const py = Math.round(y * PX_PER_UNIT);
          const inside =
            px >= 0 &&
            py >= 0 &&
            px < RASTER &&
            py < RASTER &&
            dist[py * RASTER + px]! / 3 >= CLEARANCE_PX;
          expect(
            inside,
            `${code}: "${box.text}" can reach (${x.toFixed(1)}, ${y.toFixed(1)}) in a wide ` +
              `bold sans-serif, which is outside the safe area. Shrink font-size or move it.`,
          ).toBe(true);
        }
      }
    }
  }, 60_000);
});
