/**
 * THE CABIN TELLTALE RAIL — where the eight lamps go when a steering wheel is
 * in front of the cluster.
 *
 * ── THE DEFECT, AS PHOTOGRAPHED ─────────────────────────────────────────────
 * Three CRITICAL catalogue rows say the same thing in three lessons:
 *
 *   sc-vp-telltale:103674db      „The red engine-temperature lamp never
 *                                 appears … at every sampled moment on both
 *                                 mobile and PC."
 *   sc-vp-telltale-red:622bf269  „no lamp of any colour renders on the
 *                                 instrument cluster in any frame of any lane"
 *                                 — for a lesson whose briefing says
 *                                 «цветът на лампата решава какво правиш».
 *   sc-vp-handbrake:0aa6e3a6     „The student is told to check an indicator
 *                                 that does not exist" («Свети ли още —
 *                                 ръчната не е долу.»).
 *
 * They are right about the frame and wrong about the cause, and the difference
 * matters: the state IS fed (VitokCockpit's `sampleCluster` copies the
 * director's `telltaleLit` into `tempWarnOn`) and the painter DOES paint it
 * (InstrumentCluster's frame loop tints the glyph and opens the halo). The rail
 * is simply BEHIND THE STEERING WHEEL. clusterLayout's R3 block measured that
 * and shipped `faceVisibleFraction`; clusterOcclusion.test.ts pinned it and
 * said, in as many words, that the fix is a move nobody had made yet.
 *
 * ── WHERE THE LAMPS GO, MEASURED OFF THE FRAMES RATHER THAN CHOSEN ──────────
 * Re-measured on this lane, per column rather than at five samples, by mapping
 * design units onto the shipped pixels and reading the lowest still-visible
 * row (.audit-frames/sweep161/sc-vp-readiness/mobile-right/04-t102s.png, plate
 * at x 867…1348 / y 859…1049 px, so 0.9434 px per design unit across and
 * 0.7422 down — the dash tilt foreshortens the vertical). The wheel's upper
 * silhouette, in design units:
 *
 *     x −238 → −47   x −114 → −16   x −2 → +40 (the boss)   x +106 → −47
 *     x +158 → −70   x +206 → −96   x +238 → below the plate
 *
 * That agrees with FACE_WHEEL_SILHOUETTE at every one of its five samples, and
 * it says the only clear ground on the whole face is the wedge RIGHT of the
 * boss and BELOW the readouts: x ≳ 110, y ≲ 22. It is 152 design units wide,
 * which is why the authored eight-across rail at LAMP_PITCH 56 (392 units)
 * cannot be lifted in one piece and why this is a 4 × 2 block instead.
 *
 * The grid below was drawn back onto the MOBILE frame and every cell lands on
 * bare plate there, glyphs clearing by 8…83 design units. „Every '0 defects'
 * report in this project was an instrument that had never looked."
 *
 * ── AND ON THE PC FRAME HALF OF THE LOWER ROW DOES NOT — 2026-08-23 ────────
 * Re-drawn on sc-vp-telltale/pc-right/04-t063s.png by the adversarial pass,
 * calibrated off that frame's own plate (x 664…879 px) and its selector
 * divider (the run measures design y 122.8 → 23.5 against an authored 122 →
 * 22, so the mapping is good to ~1 unit). The PC camera foreshortens the face
 * far less than the phone does — 0.91 vertical-to-horizontal against mobile's
 * 0.79 — so the rim crosses this wedge HIGHER in design space:
 *
 *     x        110    130    158    190    220    240
 *     mobile   −50    −57    −70    −85   −104   −119
 *     PC       −24    −31    −42    −55    −73    −84
 *
 * The upper row (y 1) clears on both. The lower row (y −29) does not clear on
 * PC: measured on three frames of that lesson (t001s / t022s / t063s), `oil`
 * at (130,−29) is 9…17 units BEHIND the rim, `battery` at (160,−29) is −6…+2,
 * and `temp` at (190,−29) keeps its glyph but has its halo clipped in two of
 * the three. So this grid delivers eight lamps on the phone and five-and-a-
 * half on the desktop, and sc-vp-telltale:103674db says «on both mobile and
 * PC» in as many words.
 *
 * NOT PATCHED HERE, because it is a re-solve and not a nudge: with the halo
 * top bounded by DIVIDER_Y0 (22) the upper row cannot rise, and on the PC
 * silhouette no second row of four fits beneath it anywhere in this wedge at
 * any column offset. The wedge holds ONE row of four on the strict
 * projection. Whoever takes that lane re-measures both cameras first — and
 * note that clusterLayout's provenance note calls mobile „the strict one",
 * which is true below the boss and false on this right shoulder.
 *
 * ── WHAT THIS DOES NOT FIX, SO THE NEXT READER DOES NOT STOP HERE ───────────
 * A 28-unit cell on a face that is ~158 CSS px wide in the founder's landscape
 * cockpit is ~9 CSS px of quad. That is enough to read PRESENCE and COLOUR —
 * which is exactly the discrimination sc-vp-telltale-red is built on (red =
 * stop now, amber = drive to a garage) and all sc-vp-handbrake needs (lit or
 * not) — and it is NOT enough to read the GLYPH: a thermometer and a battery
 * are the same smudge at 9 px, by the same arithmetic that took the dial
 * numerals away (clusterLayout's R2 block, GLANCE_FLOOR_CSS_PX).
 *
 * The product already owns the instrument that solves that — `TelltaleEdgePings`
 * (modules/sim/hud), the founder's own „a ping where the user can see what is
 * missing". It is switched OFF in cockpit view (LessonScene.tsx, `active={!cockpit
 * && !physicsPaused}`) on the stated premise that „the real cluster IS in frame
 * and lights its own telltales" — the premise these three frames refute. Lifting
 * that exemption is a different lane's file and is the other half of this fix.
 */

import { LAMP_KEYS, type ClusterFaceMesh, type LampKey } from "@/modules/sim/cockpit";

/** An axis-aligned element on the face, in design units — structurally the
 *  same shape clusterLayout's `FaceRect` occlusion helpers take. */
export interface RailRect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/**
 * Slot centres, in design units.
 *
 * SOLVED, NOT CHOSEN. The grid is the largest 4 × 2 block for which every lamp
 * AND every halo clears the measured silhouette whole, sits inside the bezel,
 * and touches none of the four things the driver reads on this half of the face
 * (the three speed cells, the gear letter, the «км/ч» caption and the selector
 * divider). Search it and the ceiling is a 29.5-unit cell; the numbers below are
 * that optimum rounded to whole units, with the resulting clearances:
 *
 *     slot        (130, 1)  (160, 1)  (190, 1)  (220, 1)
 *     glyph clear    40        57        74        91
 *     slot       (130,−29) (160,−29) (190,−29) (220,−29)
 *     glyph clear    10        27        44        61
 *
 * COLUMNS stop at 220 because 220 + LAMP_HALO·0.7/2 = 239.6, and the face ends
 * at 240. ROWS: the upper one's HALO tops out at 20.6, just under DIVIDER_Y0
 * (22) — the halo, not the cell, is what fixes that row, because a glow washing
 * over a hairline reads as a smudge on it. The lower row is one cell below.
 *
 * The tight one is (130, −29), and it is tight on purpose: one column further
 * left puts its edge at x 84, where the wheel BOSS's shoulder stands at −30,
 * and the lower row goes straight back behind the wheel.
 */
export const CABIN_RAIL_COL_X: readonly number[] = [130, 160, 190, 220];
export const CABIN_RAIL_ROW_Y: readonly number[] = [1, -29];

/**
 * WHICH LAMP TAKES WHICH SLOT — and it is not LAMP_KEYS order.
 *
 * `cabinRailSlot` fills the grid in reading order, so whatever list is walked
 * decides which four lamps get the row that clears BOTH cameras (y 1) and which
 * four get the row this file's own PC measurement says does not (y −29: `oil`
 * 9…17 units behind the rim, `battery` −6…+2, `temp` glyph kept but HALO
 * CLIPPED in two of three frames). Until 2026-08-27 that list was LAMP_KEYS,
 * whose order is the AUTHORED single-row rail's — „outboard turn arrows like a
 * real cluster" (clusterLayout) — a choice made when the rail was one row of
 * eight and nothing was hidden by anything. Read against a 4 × 2 grid it hands
 * the safe row to `arrowLeft, belt, brake, engine` and the clipped row to
 * `oil, battery, temp, arrowRight`.
 *
 * `temp` IS THE ONE LAMP THAT CANNOT AFFORD IT, and the reason is not a
 * preference: it is the only telltale in the product with NO TWIN ANYWHERE ELSE
 * ON THE GLASS. The status dashboard's strip carries Двигател · Колан ·
 * Светлини · Мъгла · Чистачки · Ръчна · Авар. (read straight off
 * `w13/frames/sc-hz-breakdown-pulloff__pc-wrong/run.log`'s own HUD dump) and no
 * temperature row at all, and the turn arrows are repeated at cockpit scale by
 * the «МИГАЧ» rail controls the student is already pressing. It is the RED lamp
 * the DIRECTOR lights (`TelltaleStopSpec`, contracts.ts — since 2026-09-02 the
 * channel also carries an AMBER twin on `engine`, which sits in the same
 * clears-on-both row), and it is the entire red stimulus of three lessons —
 * sc-hz-breakdown-pulloff (critical: «на таблото
 * светва червената контролна лампа … Червено значи: спри безопасно сега»),
 * sc-vp-telltale and sc-vp-telltale-red. And the halo is not decoration: this
 * file's own header says a 28-unit cell is enough to read PRESENCE and COLOUR
 * and not the glyph, so on the desktop the clipped half was the half that made
 * the red read as a warning at all.
 *
 * `temp` TAKES SLOT 3 — (220, 1), the roomiest cell on the PC silhouette (rim
 * at −84 there against −24 at x 130), because the column table above is the one
 * that gets worse to the left and the lamp a lesson is BUILT on should sit in
 * the cell with the most margin, not merely in the safe row.
 *
 * WHAT THE DEMOTED PAIR LOSE, stated rather than glossed: `arrowLeft` and
 * `arrowRight` move into the clipped row, so on the desktop their halos are
 * cut the way `temp`'s was. That is the cheaper loss twice over — they are
 * `go`-green confirmations rather than warnings (clusterReadout's tone law),
 * and they are the two telltales with a full-size HUD twin. `oil` and
 * `battery` do not move at all; they were already in the lower row, they light
 * only while the engine is NOT running (clusterReadout: „ignition on, engine
 * not running, both red lamps lit"), and that is a stationary pre-drive moment
 * where the student can lean in.
 *
 * NOTHING ELSE MOVES. `LAMP_KEYS` is untouched, so the authored reel rail —
 * the layout the founder signed off, and the mount with no wheel in front of
 * it — is byte-identical.
 */
export const CABIN_RAIL_PRIORITY: readonly LampKey[] = [
  // Row 0 (y 1) — clears the rim on mobile AND on PC.
  "belt",
  "brake",
  "engine",
  "temp",
  // Row 1 (y −29) — clips on PC; nothing here is a warning without a twin.
  "oil",
  "battery",
  "arrowLeft",
  "arrowRight",
];

/**
 * Cell scale against the authored rail: 40 → 28 units of glyph, 56 → 39.2 of
 * halo, so the halo/glyph ratio the founder's „a label is not a telltale"
 * ruling produced survives intact.
 *
 * 0.7 is not a taste call, it is what the wedge holds. Four columns have to fit
 * between the boss's shoulder and the bezel, and the leftmost column's LOWER
 * row has to clear a silhouette that gets worse the further left the block
 * reaches — so cell size and column reach trade against each other, and the
 * exchange rate runs out at 29.5. At the authored 40 the lower row clears by
 * 0.7 units (inside the measurement's own error) and the upper row's halo runs
 * into the selector divider.
 */
export const CABIN_RAIL_SCALE = 0.7;

export interface CabinRailOptions {
  /** Column centres, left → right. */
  cols?: readonly number[];
  /** Row centres, top → bottom. */
  rows?: readonly number[];
  /** Cell scale against the authored LAMP_CELL / LAMP_HALO. */
  scale?: number;
  /** Slot order (CABIN_RAIL_PRIORITY by default) — the mutation tests drive
   *  the grid with the old LAMP_KEYS order through this seam. */
  order?: readonly LampKey[];
}

/** Slot i (LAMP_KEYS order) as a reading-order cell of the cols × rows grid. */
export function cabinRailSlot(
  i: number,
  options: CabinRailOptions = {},
): { cx: number; cy: number } {
  const cols = options.cols ?? CABIN_RAIL_COL_X;
  const rows = options.rows ?? CABIN_RAIL_ROW_Y;
  const col = i % cols.length;
  const row = Math.floor(i / cols.length);
  return { cx: cols[col]!, cy: rows[row]! };
}

/**
 * The bounding rect of one quad, read back out of a built mesh.
 *
 * Tests measure the SHIPPED geometry with this rather than re-deriving it from
 * the constants above: a placement table that agrees with itself proves
 * nothing, and the thing that actually reaches the student is the buffer.
 */
export function quadRect(positions: Float32Array, quad: number): RailRect {
  const o = quad * 12;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < 4; k++) {
    const x = positions[o + k * 3]!;
    const y = positions[o + k * 3 + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

/** Move + scale one quad about its own centre, leaving z (and therefore the
 *  builder's load-bearing back-to-front submission order) alone. */
function moveQuad(
  positions: Float32Array,
  quad: number,
  cx: number,
  cy: number,
  scale: number,
): void {
  const r = quadRect(positions, quad);
  const o = quad * 12;
  for (let k = 0; k < 4; k++) {
    const ix = o + k * 3;
    const iy = ix + 1;
    positions[ix] = cx + (positions[ix]! - r.cx) * scale;
    positions[iy] = cy + (positions[iy]! - r.cy) * scale;
  }
}

/**
 * Relocate the telltale rail into the clear wedge, in place.
 *
 * ALL EIGHT LAMPS MOVE, lit and unlit alike. „An unlit lamp is still there — a
 * dark glyph in its housing, like a real cluster at night. Reading 'nothing is
 * wrong' is information too" (InstrumentCluster) — a rail that only showed the
 * armed ones would take that away, and would teach a student that the dashboard
 * is empty until something is broken.
 *
 * Only positions change: the atlas cells, the vertex-colour writes, the pulse
 * and the halo law are all untouched, so a lamp that lights in the reel lights
 * here, in the same tone, on the same frame.
 */
export function applyCabinTelltaleRail(
  face: ClusterFaceMesh,
  options: CabinRailOptions = {},
): void {
  const cols = options.cols ?? CABIN_RAIL_COL_X;
  const rows = options.rows ?? CABIN_RAIL_ROW_Y;
  const scale = options.scale ?? CABIN_RAIL_SCALE;
  const order = options.order ?? CABIN_RAIL_PRIORITY;
  // MORE LAMPS THAN SLOTS: relocate the ones that fit and leave the rest where
  // the layout authored them. Three behaviours were available and this is the
  // least harmful of them. Stacking two lamps in one slot makes a telltale
  // unreadable while LOOKING like a working rail — the failure mode this whole
  // lane exists to remove. Throwing takes the cockpit down for a student over
  // a display detail. Leaving the overflow authored reproduces the old defect
  // for exactly the new lamp and for nothing else, and it cannot ship: the test
  // beside this file pins `cols × rows === LAMP_KEYS.length`, so a ninth lamp
  // goes red in the gate with a message that says the wedge needs re-solving.
  const slots = cols.length * rows.length;
  order.forEach((key, i) => {
    if (i >= slots) return;
    const { cx, cy } = cabinRailSlot(i, { cols, rows });
    // Halo first, glyph second — same order the builder emits them in, so a
    // reader of either file sees the same pair in the same sequence.
    moveQuad(face.positions, face.lampHaloQuad[key], cx, cy, scale);
    moveQuad(face.positions, face.lampGlyphQuad[key], cx, cy, scale);
  });
}
