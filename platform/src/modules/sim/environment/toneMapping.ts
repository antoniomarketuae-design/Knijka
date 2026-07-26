// The simulator's tone-mapping operator — ONE switch, two consumers.
//
// It lives in its own module because the two paths that must agree now sit in
// two different BUNDLE CHUNKS (doc 82 §2.3 fix 3): the renderer fallback is in
// SimEnvironment (always parsed), the composer's ToneMapping effect is in
// SimComposer (lazily parsed, med + high only). Putting the constant in either
// one would drag that chunk into the other; this file imports nothing but two
// three.js constants, so both can read it for free.
//
// "agx" is the doc 71 §4.3 ruling (A/B winner over ACES: hue preservation
// under the warm low sun + parity with Blender 4/5's default view transform).
// Flip this ONE constant to compare — SimComposer maps it to the equivalent
// postprocessing ToneMappingMode, so the paths cannot drift.

import { ACESFilmicToneMapping, AgXToneMapping } from "three";

export const SIM_TONE_MAPPING = "agx" as "agx" | "aces";

/** The three.js constant for the renderer's own tone map (no-composer path). */
export const TONE_MAPPING_THREE =
  SIM_TONE_MAPPING === "aces" ? ACESFilmicToneMapping : AgXToneMapping;
