/**
 * THE LENS THE РЕГУЛИРОВЧИК CARD IS READ THROUGH — shared by the two gates that
 * size it (`officer-and-caption-legibility.test.ts`, the geometry;
 * `controller-bubble.test.ts`, the painter), so «how many CSS px is this line»
 * has ONE answer in the tree.
 *
 * WHY IT IS NOT `PX_PER_RAD` FROM THE LEGIBILITY FILE. That constant (1702
 * device px per radian) was read off a sweep161 frame of the OLD 3.6 m card and
 * is paired there with a 0.72 cap ratio; the pair is kept, and still asserted,
 * because the FR-OFC-CARD floors are stated in it. It is 6 % generous against
 * the shipped lens, which matters the moment a floor is a founder's number:
 * a line that „measures 11" on the generous pair measures 10.4 on the glass.
 *
 * So this file derives the scale from the product's own camera instead of from
 * a photograph: the cockpit holds a constant HORIZONTAL field of view
 * (`COCKPIT_HFOV_RAD`, doc 71 §4.9), so a viewport `cssW` CSS px wide has a
 * focal length of (cssW / 2) / tan(hFOV / 2) CSS px per radian at its centre —
 * 551.1 on the audited 852 × 393 phone.
 *
 * CHECKED AGAINST THE FRAMES IT HAS TO PREDICT (w61, the tree a0a3ac7 built,
 * `sc-sig-controller-postures__mobile-right`, native 2556 × 1179 = DPR 3):
 *   · 04-t018s — car at rest 48 m from the officer, inside the constant-size
 *     band. The card's border spans 721 device px; this lens says
 *     4.95 / 11.5 rad × 551.1 × 3 = 712. The answer line's capitals stand
 *     24 device px; this lens says 68/540 × 1.9/11.5 rad × 0.70 × 1653 = 24.1.
 *   · 04-t005s — car 72.5 m out, PAST the band's far end (54.6 m), so the card
 *     is at 54.6 / 72.5 = 75 % of its pinned size: it spans 536 device px
 *     (0.75 × 712 = 536). That is the frame the row's «≈ 8 CSS px of ink» was
 *     read on — a 24 px ink band, capitals to descenders, on a card a quarter
 *     smaller than the reference — and the same 24 px is the CAPITALS alone at
 *     the reference size. Two different measurements that happen to agree on
 *     the number; the ruling's ratio (8 → 11, ×1.375) is the same on either.
 */
import { COCKPIT_HFOV_RAD } from "@/modules/sim/vehicle/tuning";

import { BUBBLE_H_M, BUBBLE_TEX_H, bubbleScale } from "../TrafficLayer";

/** The phone the row was audited on: 2556 × 1179 device px at DPR 3. */
export const AUDITED_PHONE = { cssW: 852, cssH: 393, dpr: 3 } as const;

/** The desktop canvases the pc legs are photographed at, CSS px (DPR 1). */
export const PC_LENSES = [
  { name: "pc 1264 × 620", cssW: 1264, cssH: 620 },
  { name: "pc 1920 × 1080", cssW: 1920, cssH: 1080 },
] as const;

/** Cap height of the card's sans stack as a fraction of the em — Segoe UI's
 *  own (1434 / 2048), which is what the w61 frames above were rasterised in. */
export const CAP_RATIO = 0.7;

/** CSS px per radian at the centre of a viewport `cssW` CSS px wide. */
export function focalCssPx(cssW: number): number {
  return cssW / 2 / Math.tan(COCKPIT_HFOV_RAD / 2);
}

/**
 * Cap height, in CSS px, of a card line authored at `fontPx` texture px, seen
 * from `eyeD` metres through a viewport `cssW` CSS px wide.
 *
 * `card` defaults to the shipped plane; the reviewed-card literals are passed
 * in when a test needs „what this line measured before the change".
 */
export function lineCapCssPx(
  fontPx: number,
  eyeD: number,
  cssW: number,
  card: { hM: number; texH: number; scale: (d: number) => number } = {
    hM: BUBBLE_H_M,
    texH: BUBBLE_TEX_H,
    scale: bubbleScale,
  },
): number {
  const apparentCardH = (card.hM * card.scale(eyeD)) / eyeD; // rad
  return focalCssPx(cssW) * apparentCardH * (fontPx / card.texH) * CAP_RATIO;
}
