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
 *  carries two diagonals (the X), В28 one.
 *
 *  `g9` (Г9 „Преминаване отдясно на знака") is the third rider on that same
 *  round blue plate, and here too the plate is a byte match with g2/g3/g12:
 *  `<circle cx="100" cy="100" r="90" fill="#0057a8" data-plate="true"/>` plus
 *  the white ring `r=84 stroke-width=5`. Only the arrow's `rotate()` differs
 *  (Г2 90°, Г9 135° — the oblique „take it on this side" arrow). It is the
 *  plate the roundabout CENTRAL ISLAND carries facing each entry; before it
 *  the island was a mound of grass with no legal statement on it at all
 *  (sc-rb-ped-exit). */
export type SignFaceArt = "v26" | "v33" | "d4" | "g2" | "g3" | "a19" | "v28" | "g9";

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

/** One `<text>…</text>` whose content holds no markup — the shape the numeral
 *  swap can act on. Global so the count can be taken; `matchAll`/`replace` both
 *  work from a fresh internal clone, so no `lastIndex` state leaks between
 *  calls. Content with a nested `<tspan>` does not match at all, which is the
 *  honest outcome: a numeral this code cannot read is a numeral it must not
 *  claim to have written. */
const NUMERAL_TEXT_NODE = /(<text\b[^>]*>)([^<]*)(<\/text>)/g;

/**
 * Swap the numeral on В26 / В33. The source files ship with "60" in them (they
 * are the generic plate); the swap is verified, and a miss returns null instead
 * of rendering the source's own number on a road that does not carry it.
 *
 * WHY THE VERIFICATION IS READ BACK OUT OF THE ELEMENT. The check here used to
 * be `swapped.includes(">" + numeral + "<")`, which is satisfied by the
 * substitution's OWN output — so it could only ever fail when the regex matched
 * nothing, and had no teeth at all against a match that landed on the wrong
 * element. Measured 2026-08-19 against that code: a face carrying a units
 * legend before its numeral
 *
 *     <text class="legend">km/h</text><text class="numeral">60</text>
 *
 * returned a CERTIFIED face whose legend read „30" and whose plate still read
 * „60" — on a road the reducer grades at 30. That is doc 86 T4 restaged inside
 * the very function written to close it, so the swap now demands exactly ONE
 * swappable `<text>`, demands that it currently hold a bare number, and
 * re-reads that element afterwards. Two `<text>` nodes means this code cannot
 * tell which one carries the limit — and a face it cannot read is a KIND it
 * drops, never one it guesses at. Both shipped faces (v26, v33) carry exactly
 * one; the guard is on the next copy.
 */
function withNumeral(svg: string, numeral: number): string | null {
  const before = [...svg.matchAll(NUMERAL_TEXT_NODE)];
  if (before.length !== 1) return null;
  if (!/^\s*\d+\s*$/.test(before[0]![2]!)) return null;
  const swapped = svg.replace(NUMERAL_TEXT_NODE, `$1${numeral}$3`);
  const after = [...swapped.matchAll(NUMERAL_TEXT_NODE)];
  return after.length === 1 && after[0]![2] === String(numeral) ? swapped : null;
}

/** Give the root <svg> an intrinsic pixel size so every browser rasterises it
 *  at full resolution (a viewBox-only SVG has no intrinsic size in Firefox).
 *
 *  Any width/height already on the root is REMOVED first. Appending a second
 *  copy of an attribute makes the document unparseable, `<img>` then fails to
 *  decode it, the face comes back null and the caller drops the whole KIND —
 *  i.e. a lesson that narrates a sign the world never builds (the O39/O40
 *  shape). All eight shipped faces are viewBox-only today, so this guards the
 *  next byte-copy out of content/signs/svg, not a live break. */
function withIntrinsicSize(svg: string, px: number): string {
  return svg.replace(/<svg\b[^>]*>/, (rootTag) =>
    rootTag
      .replace(/\s+(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/<svg\b/, `<svg width="${px}" height="${px}"`),
  );
}

/** Test seam for the two pure string passes above (doc 86 T4's honesty rule is
 *  a property of these, and vitest runs with `environment: "node"` — there is
 *  no canvas here, so the rasteriser itself stays unreachable from a test).
 *  Not part of the module's render-time API; nothing in src/ imports it. */
export const __signFaceInternals = { withNumeral, withIntrinsicSize };

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
