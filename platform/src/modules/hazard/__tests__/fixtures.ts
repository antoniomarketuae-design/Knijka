/**
 * Test fixtures for the hazard engine.
 *
 * Banks are built from literals through `buildHazardBank`, i.e. through the
 * real validator — a fixture that skipped it would let a test pass on geometry
 * the shipped loader would reject.
 */

import { buildHazardBank, type HazardBank } from "../bank";
import type { HazardItemSource, HazardWindow } from "../types";

/** A valid item; override anything. Geometry defaults to the shipped shape. */
export function makeItemSource(
  id: string,
  overrides: Partial<HazardItemSource> = {},
): HazardItemSource {
  const slug = id.replace(/^hz-/, "");
  return {
    id,
    status: "approved",
    clip: {
      id: `sc-${slug}__m0`,
      templateId: `sc-${slug}`,
      mistakeIndex: 0,
      tracePath: `content/traces/sc-${slug}/mistake-x.trace.json`,
    },
    clipStartSec: 6,
    faultSec: 14,
    windowOpenSec: 4,
    cutSec: 8,
    difficulty: 2,
    titleBg: "Заглавие",
    briefBg: "Караш по улица.",
    hazardBg: "Опасността беше X.",
    developingBg: "Ето какво я издаваше.",
    violationCode: "PEDESTRIAN_CROSSING_TOO_FAST",
    lawRefEcho: "ЗДвП чл. 119, ал. 1",
    notesBg: "",
    ...overrides,
  };
}

export function makeBank(sources: HazardItemSource[]): HazardBank {
  return buildHazardBank({ version: 1, items: sources });
}

/** The window every scoring test uses unless it needs a different shape. */
export const WINDOW: HazardWindow = { openSec: 4, closeSec: 8 };
