/**
 * DEV-ONLY cluster seed — a way to LOOK at the instrument at a speed the
 * harness cannot otherwise produce.
 *
 * WHY THIS EXISTS. The speed readout is the single element the founder said he
 * could not read, and it had never once been photographed showing anything but
 * „0". The only surface that renders the real cockpit from the driver's seat is
 * /dev/ghost-demo, and there the route is driven by a GHOST car while the
 * player's own vehicle stays parked — so every frame anyone has ever captured
 * of this cluster read zero. „The digits are legible" was therefore proven for
 * exactly one value, and the cases that decide the layout are the two- and
 * three-digit ones: they are wider, and they are the ones that can run into the
 * „км/ч" caption, the vertical divider and the gear letter.
 *
 * WHAT IT DOES. `?clusterSpeed=58&clusterGear=D` on a dev route overwrites the
 * two PRESENTATION channels of ClusterInputs after the cockpit has sampled the
 * real ones. That is the whole mechanism.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. ClusterInputs is a display struct: it is
 * written once per frame, read by the cluster's pure readout law, and read by
 * nothing else. Seeding it moves the needle, the digits and the lit arc, and it
 * cannot move the vehicle, the rule engine, scenario timing or a recorded
 * trace — VehicleSim.speedKmh is never assigned here. So this is an honest
 * picture of the INSTRUMENT at 58 km/h, and it is not a picture of a car doing
 * 58 km/h; the two frames it produces answer a typography question, and no
 * other question.
 *
 * PRODUCTION. `readClusterDevSeed()` returns null under a production NODE_ENV
 * before it looks at anything, so the bundler folds the parse away and no
 * student's URL can reach it — the same gate the /dev routes themselves use
 * (they notFound()) and the same shape as LessonScene's `?ghost=demo` flag.
 */

import type { ClusterInputs } from "./clusterReadout";

/** A parsed seed. A null field means „leave the real value alone", which is
 *  what lets `?clusterSpeed=132` be given without also inventing a selector. */
export interface ClusterDevSeed {
  speedKmh: number | null;
  gearLabel: string | null;
}

/** Above the dial's own ceiling the readout clamps anyway; this only stops an
 *  absurd query string from reaching the display law as NaN or Infinity. */
const MAX_SEED_KMH = 999;

/** The selector labels the cluster knows how to draw (clusterReadout.gearGlyph
 *  takes the first character, and the atlas has cells for exactly these). */
const GEAR_PATTERN = /^[PRNDM][0-9]?$/;

/**
 * Pure parse — exported so the behaviour is testable without a `window`.
 * Returns null when the search string asks for nothing usable, so the caller
 * can skip the per-frame write entirely.
 */
export function parseClusterDevSeed(search: string): ClusterDevSeed | null {
  const params = new URLSearchParams(search);
  const rawSpeed = params.get("clusterSpeed");
  const rawGear = params.get("clusterGear");

  let speedKmh: number | null = null;
  if (rawSpeed !== null && rawSpeed.trim() !== "") {
    const parsed = Number(rawSpeed);
    if (Number.isFinite(parsed)) {
      speedKmh = Math.min(MAX_SEED_KMH, Math.max(0, parsed));
    }
  }

  const gearLabel = rawGear !== null && GEAR_PATTERN.test(rawGear) ? rawGear : null;

  if (speedKmh === null && gearLabel === null) return null;
  return { speedKmh, gearLabel };
}

/** Read the seed off the current URL. Null in production, always. */
export function readClusterDevSeed(): ClusterDevSeed | null {
  if (process.env.NODE_ENV === "production") return null;
  try {
    return parseClusterDevSeed(window.location.search);
  } catch {
    return null;
  }
}

/**
 * Overwrite the seeded channels on a freshly sampled frame. Mutates in place
 * and allocates nothing — it is called from inside the cluster's per-frame
 * sampler, which is the sim's ref-feed grammar.
 */
export function applyClusterDevSeed(seed: ClusterDevSeed | null, out: ClusterInputs): void {
  if (!seed) return;
  if (seed.speedKmh !== null) out.speedKmh = seed.speedKmh;
  if (seed.gearLabel !== null) out.gearLabel = seed.gearLabel;
}
