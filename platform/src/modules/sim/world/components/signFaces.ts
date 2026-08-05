"use client";

/**
 * Sign faces rasterised from the project's OWN law-cited SVG artwork.
 *
 * Doc 86 T4: the 3D kit shipped exactly one speed face (В26-50), so 83 of 154
 * scenarios sat on a 30 / 40 / 90 / 140 km/h street wearing a „50" plate — at
 * SCENARIO_SIGN_SCALE, i.e. the most legible object on the map, stating the
 * opposite of the number `tick.maxSpeedKmh` grades. Baking one GLB per numeral
 * would mean 13 more binary assets and a Blender round-trip for every future
 * limit; instead the ONE shipped В26 body is reused and only its face texture
 * is swapped.
 *
 * WHERE THE ART COMES FROM. `public/sim/signs/faces/*.svg` are byte-copies of
 * `content/signs/svg/{v26,v33,d4}.svg` — the same reviewed, `lawRefs`-carrying
 * files `content/signs/signs.json` indexes and the theory surface serves
 * through `/api/signs/<code>`. So the В26 a student meets in the simulator is
 * pixel-identical to the В26 in his theory question, which is the whole
 * argument for this route over fresh artwork. It is also what the offline kit
 * already did: `tools/blender/signs.py` rasterises the very same SVGs through
 * sharp and swaps v26's numeral (`FACES["v26"] = ("v26.svg", ("60", "50"))`).
 * This module is that pipeline moved to load time, so a numeral costs nothing.
 *
 * HONESTY RULE. Every failure path returns `null`, and a null face makes the
 * caller drop the KIND rather than fall back to another numeral. A sign that
 * states the wrong limit is worse than no sign — that is the defect this file
 * exists to close, and a silent fallback would re-create it.
 *
 * Client-only: `fetch` + `<img>` + `<canvas>`. Nothing here runs in vitest or
 * on the server (WorldProps guards its asset build on `typeof window`).
 */

import * as THREE from "three";

/** Where the byte-copied SVG faces live (see the header on WHY they are copies). */
const FACE_BASE = "/sim/signs/faces";
/** Rasterised face resolution. Matches tools/blender/signs.py FACE_PX. */
const FACE_PX = 512;

/** Which SVG carries each parametrised face.
 *
 *  `g2` / `g3` (Г2 „Движение само надясно" / Г3 „…наляво") ride the SAME round
 *  blue plate the Г12 roundabout sign is baked on — identical plate geometry in
 *  the source art (circle r=90 + white ring r=84), so the face swaps cleanly and
 *  no new GLB is needed. Doc 86 L3 / founder item 47.
 *
 *  `a19` (А19 „Деца") rides the A18 „Пешеходна пътека" GLB for the same reason:
 *  both source files open with the IDENTICAL warning plate
 *  (`points="100,22 186,170 14,170"`, `stroke-width="16"`, `#c1121f`), so only
 *  the pictogram inside it differs. Founder items 60/61 (the school zone with
 *  no school and no children) — a школска зона must carry the sign that names
 *  the reason for its limit.
 *
 *  `v28` (В28 „Забранено е паркирането") rides the В27 „Забранени са престоят и
 *  паркирането" GLB on the same argument, and here the proof is a byte match:
 *  both source SVGs open with
 *  `<circle cx="100" cy="100" r="88" fill="#0057a8" stroke="#c1121f"
 *  stroke-width="20" data-plate="true"/>` and differ only in the face — В27
 *  carries two diagonals (the X), В28 one. */
export type SignFaceArt = "v26" | "v33" | "d4" | "g2" | "g3" | "a19" | "v28";

const svgSource = new Map<SignFaceArt, Promise<string | null>>();

async function loadFaceSvg(art: SignFaceArt): Promise<string | null> {
  let pending = svgSource.get(art);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(`${FACE_BASE}/${art}.svg`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text.includes("<svg")) throw new Error("not an SVG");
        return text;
      } catch (err) {
        console.warn(
          `sim/world: sign face art ${art}.svg failed to load (${String(err)}) — ` +
            "every kind that needs it will be SKIPPED rather than shown with the wrong face",
        );
        return null;
      }
    })();
    svgSource.set(art, pending);
  }
  return pending;
}

/**
 * Swap the first `<text>` element's content — the numeral on В26 / В33. The
 * source files ship with "60" in them (they are the generic plate); the swap
 * is verified, and a miss returns null instead of rendering the source's own
 * number on a road that does not carry it.
 */
function withNumeral(svg: string, numeral: number): string | null {
  const swapped = svg.replace(/(<text\b[^>]*>)([^<]*)(<\/text>)/, `$1${numeral}$3`);
  return swapped.includes(`>${numeral}<`) ? swapped : null;
}

/** Give the root <svg> an intrinsic pixel size so every browser rasterises it
 *  at full resolution (a viewBox-only SVG has no intrinsic size in Firefox). */
function withIntrinsicSize(svg: string, px: number): string {
  return svg.replace(/<svg\b/, `<svg width="${px}" height="${px}"`);
}

async function rasterise(svg: string): Promise<THREE.CanvasTexture | null> {
  const blob = new Blob([withIntrinsicSize(svg, FACE_PX)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg decode failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = FACE_PX;
    canvas.height = FACE_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, FACE_PX, FACE_PX);
    ctx.drawImage(img, 0, 0, FACE_PX, FACE_PX);
    const tex = new THREE.CanvasTexture(canvas);
    // glTF textures are authored top-left-origin and GLTFLoader sets flipY
    // false; the baked webp face this replaces came out of the SAME SVG through
    // sharp, so the canvas must be sampled the same way or the numeral lands
    // upside down.
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  } catch (err) {
    console.warn(`sim/world: sign face rasterise failed (${String(err)}) — kind skipped`);
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * A face texture for `art`, with the В26/В33 numeral substituted when given.
 * Returns null on any failure — the caller must then skip the kind entirely.
 */
export async function makeSignFaceTexture(
  art: SignFaceArt,
  numeral?: number,
): Promise<THREE.CanvasTexture | null> {
  const source = await loadFaceSvg(art);
  if (source === null) return null;
  let svg = source;
  if (numeral !== undefined) {
    const swapped = withNumeral(source, numeral);
    if (swapped === null) {
      console.warn(
        `sim/world: ${art}.svg has no <text> numeral to swap for ${numeral} — ` +
          "skipping the kind rather than posting the source's own number",
      );
      return null;
    }
    svg = swapped;
  }
  return rasterise(svg);
}
