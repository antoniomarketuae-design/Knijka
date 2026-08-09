/**
 * streetwall-plan.mjs — THE POPULATE PLAN, AND THE ONE FUNCTION THAT APPLIES IT.
 *
 * WHY THIS FILE WAS SPLIT OUT OF gen_streetwall.mjs.
 *
 * The driver's header promised „a re-run on an already-populated repo is a
 * zero-byte diff". It was not true, and nothing could say so. Measured
 * 2026-08-09 against the committed tree:
 *
 *     d2-v1         380 sw- buildings shipped, 378 regenerated  (-4, +2)
 *     tj-emerge-v1   14 sw- buildings shipped,  13 regenerated  (-1)
 *
 * and all five of the vanished plots turned out to be standing INSIDE a spawn
 * keep-out — 14.51–15.80 m from a spawn point that wants 18 (d2, CITY preset),
 * 11.98 m from one that wants 12 (tj-emerge, JUNCTION preset). Nothing was
 * wrong with the generator: the DISTRICTS moved under it. A later pass edited
 * those two maps' `spawnPoints`, the wall was never re-stamped, and the repo
 * has been carrying five buildings that break rule 4's own keep-out ever since.
 *
 * The damage was not the five buildings. It was that the next person to run
 * `node tools/maps/gen_streetwall.mjs` — for any reason, on any other map —
 * silently rewrote those two districts as a side effect, which moves colliders,
 * which is how an earlier wave collected four trace-determinism failures and
 * spent a day looking for the cause in the traces.
 *
 * So the plan and the transform now live here, apart from the I/O, and there is
 * exactly ONE function that turns a district file's bytes into the bytes the
 * pass wants it to have. The driver calls it to write; `../streetwall.test.mjs`
 * calls it to assert `f(shipped) === shipped` for every target. A test that
 * re-implemented the driver could pass while the driver drifted — this one
 * cannot, because it is the driver.
 */

import { generateStreetwall, serializeDistrict, stripStreetwall } from "./streetwall.mjs";

// ---------------------------------------------------------------------------
// Config presets
// ---------------------------------------------------------------------------

/**
 * CITY — the OSM cut. Short blocks (median edge 51 m) and 102 junctions, so
 * the wall is fine-grained and every junction keeps a 24 m × 9 m corner splay:
 * with 283 edges the sight rule is doing real work here, and a flush corner
 * would hide the cross traffic the right-hand rule is graded on.
 */
export const CITY = {
  frontageM: 18,
  frontageJitterM: 8,
  gapM: 6,
  depthM: 14,
  depthJitterM: 6,
  setbackM: 5,
  setbackJitterM: 3,
  sightLegM: 24,
  sightSplayM: 9,
};

/**
 * STREET — the straight scenario micro-maps (one edge, 140–420 m). These are
 * the frames students actually see: a single 12 × 18 m prism beside 400 m of
 * asphalt is what „test level" looks like. A continuous wall both sides at a
 * shallow setback is the whole point, so the plots are longer and closer than
 * the city's.
 */
export const STREET = {
  frontageM: 24,
  frontageJitterM: 10,
  gapM: 7,
  depthM: 16,
  depthJitterM: 8,
  setbackM: 4,
  setbackJitterM: 3,
  sightLegM: 20,
  sightSplayM: 8,
  // A micro-map's spawn points and crossings sit ON the carriageway, so the
  // CITY preset's 18 m radial keep-out would veto a wall that is only ever
  // 16 m to one SIDE of them. 10 m keeps the first thing a student sees from
  // being a facade without emptying a 140 m street.
  spawnClearM: 10,
  crossingClearM: 10,
};

/**
 * JUNCTION — scenario junction/roundabout maps. Same fabric as STREET but with
 * the corner splay opened well past it: the hand-authored equal-junction
 * contract (`jx-equal-districts.test.ts`: „OPEN CORNERS are the contract")
 * keeps 30 m clear of both arms, and on a micro-map the junction IS the lesson
 * — the approach must stay readable from the full braking distance. This is
 * deliberately the most conservative row, and it is why sx-v1 earns a third of
 * the plots a straight street of the same length would.
 */
export const JUNCTION = {
  ...STREET,
  frontageM: 20,
  frontageJitterM: 8,
  sightLegM: 30,
  sightSplayM: 10,
  spawnClearM: 12,
  crossingClearM: 12,
};

/**
 * ROUNDABOUT — the ring itself is excluded from hosting (roundabout edges are
 * skipped by the generator), and entry judgement is made from inside the
 * approach at low speed rather than across a corner, so the arms carry the
 * STREET splay. With the JUNCTION row they carried ONE building on 116 m arms,
 * which is not a populated map.
 */
export const ROUNDABOUT = {
  ...STREET,
  sightLegM: 24,
  sightSplayM: 10,
  spawnClearM: 12,
  crossingClearM: 12,
};

// ---------------------------------------------------------------------------
// Targets — the flagship city + the ~20 maps the 150 scenario templates run in
// most often (counted from `districtId:` across
// platform/src/modules/sim/lessons/scenario/templates*.ts).
// ---------------------------------------------------------------------------

export const TARGETS = [
  { id: "d2-v1", style: "records", cfg: CITY, why: "the exam city — 21.7 km of road, zero buildings" },
  { id: "sx-v1", style: "compact", cfg: JUNCTION, why: "signalised X — 12 templates, the busiest map in the catalog" },
  { id: "ln-v1", style: "compact", cfg: STREET, why: "2+2 boulevard — 9 templates (lane change family)" },
  { id: "fo-follow-v1", style: "compact", cfg: STREET, why: "following-distance street — 6 templates" },
  { id: "rb-mini-v1", style: "compact", cfg: ROUNDABOUT, why: "mini roundabout — 4 templates" },
  { id: "vp-ready-v1", style: "compact", cfg: STREET, why: "vehicle-preparation street — 4 templates" },
  { id: "hz-obstacle-v1", style: "compact", cfg: STREET, why: "hazard/obstacle street — 4 templates" },
  { id: "ac-rain-v1", style: "compact", cfg: STREET, why: "rain conditions street — 4 templates" },
  { id: "tj-stop-v1", style: "compact", cfg: JUNCTION, why: "Б2 T-junction — 3 templates" },
  { id: "ov-narrow-v1", style: "compact", cfg: STREET, why: "narrow-street overtaking — 3 templates" },
  { id: "tj-rhr-v1", style: "compact", cfg: JUNCTION, why: "right-hand-rule T — 2 templates" },
  { id: "tj-emerge-v1", style: "compact", cfg: JUNCTION, why: "emerging onto a priority road — 2 templates" },
  { id: "wb-boulevard-v1", style: "compact", cfg: STREET, why: "wide boulevard — 2 templates" },
  { id: "vu-pass-v1", style: "compact", cfg: STREET, why: "passing a vulnerable user — 2 templates" },
  { id: "sp-rain-v1", style: "compact", cfg: STREET, why: "speed in rain — 2 templates" },
  { id: "pe-jay-v1", style: "compact", cfg: JUNCTION, why: "jaywalking junction — 2 templates" },
  { id: "pe-dart-v1", style: "compact", cfg: STREET, why: "darting pedestrian — 2 templates" },
  { id: "pe-child-v1", style: "compact", cfg: STREET, why: "child at the kerb — 2 templates" },
  { id: "fo-brake-v1", style: "compact", cfg: STREET, why: "lead-car braking — 2 templates" },
  { id: "pe-zone-v1", style: "compact", cfg: STREET, why: "живее зона — the shipped clip frame doc 82 §1.2 opens with" },
  { id: "zb-v1", style: "compact", cfg: STREET, why: "zebra street — the pedestrian-crossing archetype" },
  { id: "sp-zone30-v1", style: "compact", cfg: STREET, why: "Зона 30 — a signed urban zone must look urban" },
  // Founder register B65 — „the Map is very Raw, boring". The two maps below
  // were the omission behind the loudest half of it. B65 was RENDERED ON
  // sp-creep-v1 and the verdict names the symptom exactly: „past y≈220 the
  // buildings stop entirely and the road runs on as bare grey tarmac across a
  // flat green plain until the world ends." Its sibling sp-rain-v1 is on this
  // list and its sibling sp-zone30-v1 is on this list; sp-creep-v1 and
  // sp-danger-v1 are the same generator, the same 360–400 m of street and the
  // same four authored buildings, and they were simply never added — so the
  // one map the founder actually drove for this row was the one with no
  // frontage past the middle of it.
  { id: "sp-creep-v1", style: "compact", cfg: STREET, why: "B65 — the map he drove: frontage stopped at y≈220" },
  { id: "sp-danger-v1", style: "compact", cfg: STREET, why: "B65 — same generator, same gap (+10 km/h drill)" },
];

/**
 * NOT POPULATED, and why. Kept in the source because „which maps did you skip"
 * is the first question this pass raises, and a silent omission would read as
 * an oversight rather than a decision.
 */
export const EXCLUDED = [
  ["mw-v1 / mw-entry-v1 / mw-exit-v1", "автомагистрала — no sidewalks, no urban fabric by design (gen_motorway)"],
  ["poligon-v1 / poligon chain", "полигон — a fenced training ground, not a street"],
  ["lot-*-v1", "parking lots — the surrounding fabric is authored as the lot itself"],
  ["ov-oncoming-v1 / ov-crest-v1", "authored as open country: the rural sightline IS the overtaking lesson"],
  ["tj-occluded-v1", "its ONE corner building is the JU-17 occluder — the lesson is the peek"],
  ["jx-equal-v1", "„OPEN CORNERS are the contract" + " — four authored corners, battery-pinned"],
  ["ac-bridge-v1 / ac-ice-v1 / ac-aqua-v1", "surface + structure lessons; ac-bridge's 4 blocks encode the deck"],
  ["district-v1", "already 248 authored footprints — the one map that reads as a real place"],
];

// ---------------------------------------------------------------------------
// The transform — the ONLY place a district's bytes are decided
// ---------------------------------------------------------------------------

/**
 * Line endings are NOT drift. `serializeDistrict` emits `\n`; this repo sets
 * `core.autocrlf=true` and ships `content/world/*.json` with no `.gitattributes`
 * override, so a fresh clone on Windows materialises them CRLF. Comparing raw
 * bytes there would report all 24 districts as „not a fixed point" and the
 * driver would rewrite all 24 on first run — the exact defect this module was
 * written to end, one layer down, and invisible from inside it. So the
 * comparison is made on normalised text. (What gets WRITTEN is still `\n`;
 * git normalises the index either way.)
 */
const lf = (text) => text.replace(/\r\n/g, "\n");

/**
 * Apply the populate pass to one district file's TEXT and return the text it
 * should have. Pure: no fs, no console, no argv. `f(f(x)) === f(x)` by
 * construction (the `sw-` set is stripped before it is regenerated), and
 * `f(shipped) === shipped` is the property the test holds the REPO to.
 *
 * Throws when the pass would move any key other than `buildings` — the check
 * is worth keeping even though the current implementation cannot, because the
 * serializer writes a FIXED key set and a district that grew a new top-level
 * key would otherwise lose it silently.
 *
 * @param {string} beforeText  the district JSON exactly as it sits on disk
 * @param {{id:string, style:"records"|"compact", cfg:object}} target
 * @returns {{ text: string, changed: boolean, report: object, authored: number }}
 */
export function applyStreetwall(beforeText, target) {
  const district = JSON.parse(beforeText);
  const keysBefore = Object.keys(district);

  const authored = stripStreetwall(district.buildings);
  const { buildings, report } = generateStreetwall(district, target.cfg);
  district.buildings = [...authored, ...buildings];

  const text = serializeDistrict(district, target.style);
  const roundTrip = JSON.parse(text); // validity self-check

  // Rule 1, proved against what was actually WRITTEN rather than against the
  // in-memory object: the serializer emits a fixed key set, so this is the
  // check that catches a district growing a key the serializer forgets.
  const dropped = keysBefore.filter((k) => !(k in roundTrip));
  if (dropped.length > 0) {
    throw new Error(`${target.id}: serialization dropped ${dropped.join(", ")}`);
  }
  for (const key of keysBefore) {
    if (key === "buildings") continue;
    if (JSON.stringify(district[key]) !== JSON.stringify(roundTrip[key])) {
      throw new Error(`${target.id}: the pass changed a key other than buildings (${key})`);
    }
  }

  return { text, changed: text !== lf(beforeText), report, authored: authored.length };
}

/**
 * Is this district file already the pass's output? The one predicate the
 * driver's `--check` and the test both ask, so they cannot disagree about what
 * „unchanged" means.
 */
export function isStreetwallCurrent(beforeText, target) {
  return applyStreetwall(beforeText, target).text === lf(beforeText);
}
