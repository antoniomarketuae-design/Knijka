/**
 * PAINT-TRUTH battery for builders/markings.ts — sweep-161 audit follow-up.
 *
 * Six BROKEN findings were routed here, and all six say the same thing in
 * different words: „the lesson names a marking the world does not have".
 * Read off the frames they cite:
 *   sc-ov-lane-keeping  (critical) „no centre line and no lane lines"
 *   sc-ov-keep-right              „its sibling carries none at all"
 *   sc-junction-left              „no stop line is painted anywhere"
 *   sc-junction-blind             „a bare grey asphalt blob"
 *   sc-jx-blocked-exit            „the only junction with a painted stop line"
 *
 * Five of the six are refuted by the built mesh — the paint IS there, measured
 * below to the centimetre — and the sixth (the junction mouths) had a real
 * cause in this file. A refutation that lives only in a report is worth
 * nothing the next time somebody squints at a screenshot, so every one of them
 * is a test here: each asserts, from the quads the builder actually emits, the
 * exact marking whose absence was reported.
 *
 * Every claim is paired with its opposite so no assertion can be satisfied by
 * painting more: the две равнозначни junctions must carry NO transverse line
 * (ЗДвП чл. 50 — priority to the right, no М7 anywhere), and the dash counts
 * must equal the fixed-pitch walk's, so re-spacing the rhythm cannot smuggle
 * in extra paint.
 *
 * That sentence was FALSE AS WRITTEN for one wave and is worth reading twice
 * before trusting the rest. When the instrument above was rebuilt, three
 * assertions were re-expressed in terms the rewritten reader could serve, and
 * each of the three quietly stopped being able to fail — the file went green,
 * the paint was fine, and nothing guarded it. An adversarial re-read found all
 * three by construction, not by argument; §3 now carries the constructions
 * themselves, so „this check is real" is a check. What went wrong, in one line
 * each, because it is the same mistake three times:
 *
 *   the reader identified a dash BY ITS OWN LENGTH ALONE (`dashesOn`: quads
 *   5.000 m ± 1 mm) and asserted position from the quad CENTROID alone. A
 *   centroid is invariant under rotation, so every lateral claim became
 *   unfalsifiable; a length filter is blind to paint of any other length, so
 *   every „and nothing else" claim became unfalsifiable too.
 *
 * Both readings are still taken — they are exact and they are what pins the
 * paint to the millimetre — but no claim rests on them alone any more: lateral
 * claims are made on the CORNERS (`tLo`/`tHi`, `cornerSpread`) and „nothing
 * else" claims on a CENSUS OF EVERY QUAD (`censusOnEdge`), never on the dash
 * filter that found the paint in the first place.
 *
 * ── THE INSTRUMENT, and why it is written the way it is ────────────────────
 * This file shipped RED: fifteen of its twenty-eight tests failed the first
 * time anybody ran it, and FOURTEEN of the fifteen were the MEASUREMENT and
 * not the paint. Every one lied in the direction of „there is a defect here",
 * which is the mirror of the reassuring instrument bugs this project keeps
 * finding — and just as expensive, because a false alarm sends someone to
 * change working paint. The three faults, each fixed at its site below:
 *
 *  1. the point collector claimed every vertex within 30 m of an edge, so a
 *     COLLINEAR OPPOSITE ARM's dashes and a CROSS STREET's edge lines arrived
 *     as this edge's paint, clamped onto its endpoint. That alone produced the
 *     „trailing margin −17.93 m" reading on jx-equal-v1. Ownership is now
 *     „nearest edge, projecting onto its interior" — see `resolveOwned`;
 *  2. the dash counter clustered VERTICES with a gap threshold of
 *     DASH_LENGTH_M / 2 = 2.5 m, while a dash quad's OWN two ends are
 *     DASH_LENGTH_M = 5.0 m apart. Every dash was therefore counted twice: 46
 *     for the 23 ov-lane-v1 carries, 16 for 8, 22 for 11. The whole battery now
 *     reads QUADS out of the index buffer — see `readQuads` / `dashesOn`;
 *  3. the zebra reader took „the first four vertices near the crossing", and
 *     buildMarkings paints lane lines BEFORE zebras, so it measured the axis
 *     of a dashed осева and would have reported 0° for every skew. It now
 *     measures the paint the crossing ADDS — see `crossingPaint`.
 *
 * The fifteenth failure was real and belonged to none of the three: two
 * fixtures here omitted `intersections` / `roundabouts` / `spawnPoints`,
 * `assertDistrict` never checked those fields although `District` declares them
 * required, and the build died 300 lines away inside `analyzeNetwork`. The
 * guard is fixed in world/types.ts and pinned by its own describe block at the
 * foot of this file. The same never-run fixtures also authored a crossing
 * `kind` that does not exist, so the zebra tests were grading paint the builder
 * had correctly declined to lay.
 *
 * ── WHAT EACH ASSERTION HERE ACTUALLY DEFENDS ──────────────────────────────
 * A green battery proves nothing on its own — this one was green on its own
 * doubled dash counts for as long as nobody ran it. Every claim below was
 * therefore driven backwards: the thing it protects was broken in the SOURCE,
 * one change at a time, and the named tests went red. Reproduce any line by
 * making that edit and running this file.
 *
 *   markings.dashStations → old fixed-pitch walk .... 6 „leading === trailing"
 *   markings.dashStations → one dash FEWER .......... 14, incl. every count
 *   markings.dashStations → one dash MORE ........... 9, incl. every count
 *   markings.paintStopLine `from` → −outer .......... the М7 incoming-half test
 *   markings.paintStopLine `base` → ap.cut .......... the М7 arclength test
 *   markings lane loop → осева at DASH_WIDTH_M ...... both осева-stroke tests
 *   markings ZEBRA_MAX_SKEW_DEG 60 → 89 ............. the skew-90 quad ceiling
 *   markings ZEBRA_MAX_SKEW_DEG 60 → 0 .............. both skew tests
 *   markings paintZebra → barDir = roadDir .......... both skew tests
 *   types.assertDistrict → drop the `intersections` row ... the refusal test
 *   types.assertDistrict → refuse any map over 3 edges .... the corpus test
 *
 * The last two are the pair that matters most: one proves the guard convicts a
 * broken document, the other proves it still acquits all 105 real ones.
 *
 * And the three the weakened wave could NOT convict. Each was run against this
 * file as it stood — 31/31 GREEN on every one — and against it as it stands:
 *
 *   paintDashedLine → turn every dash 10° off the axis
 *       was: 31/31 green, corners 0.619 m out, „ON THE AXIS" passing
 *       now: RED — осева corner 0.619 m vs the 0.302 m the bend allows,
 *            ov-keepright divider corner 0.557 m vs 0.125 m
 *   paintDashedLine → turn every dash 15° off the axis
 *       was: 31/31 green, corners 0.828 m out — 4.4× the осева's half-stroke
 *       now: RED, same two assertions
 *   paintDashedLine → one 3.0 m dash centred on a run that fits none
 *       was: 31/31 green, a 3 m осева painted s = 2.50…5.50 m of an 8 m stub,
 *            under a test titled „must not invent the stub's first dash"
 *       now: RED — the stub carries paint at |t| < 1 m
 *   lane loop → one extra dashed line at t = +4.06 m in 4.00 m dashes
 *       was: 31/31 green, 25 phantom dashes on ov-lane-v1 beside the 23 real
 *            ones, markingQuads 103 → 128, a lane boundary down the middle of
 *            the lane the student is being taught to hold
 *       now: RED — 25 unclassified quads on ov-lane-v1, 30 on ov-keepright-v1
 *
 * Reproduce them the same way as the rows above: make the edit in markings.ts
 * and run this file. §3 also carries each one as a MESH-level mutation that
 * needs no edit at all.
 *
 * ── AND THE FOURTH, WHICH SURVIVED ALL OF THAT ─────────────────────────────
 * The row above was answered by a census — and the census was written PER EDGE,
 * against the two edges the file names. Its own refuter then walked through the
 * gap that leaves, with the same phantom line SUPPRESSED on exactly those two:
 *
 *   lane loop → the same line, suppressed on ov-ln-street and ov-kr-road
 *       was: 34/34 GREEN, exit 0. 173 phantom quads on the five districts no
 *            test names an edge of — jx-equal-v1 40 → 76, sx-v1 42 → 73,
 *            tj-emerge-v1 32 → 60, tj-occluded-v1 32 → 61, jxg-giveway-v1
 *            82 → 131 — a false lane boundary down the middle of the driver's
 *            own lane on every junction approach in the battery
 *       now: RED, twelve tests, each naming the edge and the offset. §5
 *            censuses EVERY district and every quad, so „no other paint" no
 *            longer means „no other paint on the two edges I looked at"
 *
 * Both halves of that row were run, not reasoned: the battery as it stood at
 * the previous commit, with `buildMarkings` wrapped so every call site received
 * the mutation, reports 34 passed / exit 0; the same wrapper against this file
 * reports 12 failed / 39 passed, and the two districts the mutation spares are
 * the two that stay green. §4's identity is silent on it in both — the mutation
 * books every quad it draws, and BOOKING IS NOT PAINT TRUTH.
 *
 * ── AND THE FIFTH: THE RIGHT SHAPE IN THE WRONG PLACE ──────────────────────
 * That census closed the SHAPE axis across 50 districts and left the PLACE axis
 * wide open. Every classification it made was a shape test plus a band — right
 * length, right stroke, within half a lane of the boundary — and half a lane is
 * 4.06 m. The same phantom wearing the RIGHT shape walked straight through it,
 * and so did the one regression this file has ever caught in markings.ts. Three
 * forgeries, each RUN against the file as it stood, each silent, each now red:
 *
 *   every dash TURNED 10° across the road, on the five districts no test names
 *   an edge of
 *       was: `paintFindings` [] on all five. Same length, same stroke, same
 *            centroid, same count, same booking — 0.685 m of corner standing
 *            out of the lane it divides, on every dash of every arm
 *       now: RED on all 91 domain districts, each naming the boundary, the
 *            worst corner and the budget its own bend allows
 *   every dash SHOVED 0.5 m sideways off its boundary
 *       was: [] again — it is still inside the band that files it, and the band
 *            has to be that wide so a nudged dash is convicted BY NAME instead
 *            of vanishing into `offences`
 *       now: RED on all 91 — it was 50 when this was written
 *   every dash in the whole domain RE-LAID at the OLD fixed-pitch stations —
 *   the defect that shipped: 11.27 m of unpainted осева at jx-equal-v1's four
 *   junction mouths, 0.28 m at sx-v1's, same class, same junction, phase luck
 *       was: 50 districts silent, 0 convicted. It fits the SAME n dashes, so no
 *            count moves, no booking moves, and §2 sees it only on the six
 *            edges it names by id
 *       now: RED on every district whose stations actually move, each naming
 *            the dash, where it stands and where the rhythm puts it
 *
 * Reproduce any of the three from `turnDashes`, `shiftDashes` and
 * `fixedPitchRelay`; §5 carries all three as tests over the whole domain.
 *
 * ── AND ONE EMITTER THAT COULD BE DELETED IN SILENCE ───────────────────────
 * `paintFindings`' М1 strip-count line was live code with no test: commenting
 * it out left 51/51 GREEN. It now has both directions — a strip spliced out of
 * ov-lane-v1's mesh reports „ov-ln-street: 79 М1 edge-line strips, not 80", and
 * a strip SLID one metre along its own rail (same width, same offset, same
 * count) is convicted by the rectangle licence while the per-edge band rule,
 * asserted in the same test, still files it as perfectly good paint.
 *
 * Two false-refusals were found while wiring that up, and fixed at their sites:
 * the per-boundary dash count was taken from the CENTRELINE's length for every
 * boundary, and an offset line on a bend is not the same length (two corpus
 * edges disagree by a whole dash; none in the domain, so the count was right by
 * luck); and a strip was matched on `|across − 0.300 m| < 1 mm` when a strip's
 * own width is 0.300 · miter — 76 of ov-lane-v1's 80 strips are wider than
 * 0.300 m, and a sharper joint than anything in this corpus would have had a
 * real edge line convicted as unauthored paint.
 *
 * ── AND THE TITLE, WHICH OVER-CLAIMED ──────────────────────────────────────
 * §5's block was called „every quad the world paints is a quad the world was
 * authored to paint" while it graded 1,599 quads of 10,690 — 14.96%, one in
 * 6.7 — because 55 of the 105 districts carried paint the catalogue could not
 * name. Retiring the title was the honest move and it closed nothing; the 55
 * were attributed one by one to the gate that stopped them, which turned the
 * debt into a work list.
 *
 * ── AND THIS LANE SPENT IT: 50 DISTRICTS → 91 ──────────────────────────────
 * Taken in the order of how many districts each gate held. ZONES (25) and
 * ZEBRAS (20, 16 of them held by nothing else) were 41 of the 55, and both are
 * now restated from the painter's own arithmetic:
 *   · `authoredSolids` + `zoneSolidLicences` — the continuous М1 осева over a
 *     В24 span, EVERY same-direction divider inside it, the bus and emergency
 *     curb seams, each licensed as the exact rectangle of road it covers;
 *   · `boundaryFrames` — the other half of a zone, which is that a solid
 *     SUPPRESSES the dashes it covers. Without it a zoned edge's dash count is
 *     not the fitted walk's and the census convicts real paint;
 *   · `zebraLicences` — `paintZebra` restated bar for bar, including the ±60°
 *     skew clamp markings.ts keeps private, the 1/cos span widening, the refuge
 *     island's kerbed gap and the staggered half's walk along the street.
 * The catalogue now grades
 * 4,367 of the corpus's 10,690 marking quads — 40.85%, up from one in 6.7. It
 * is 87% of the DISTRICTS and 41% of the PAINT because the 14 still outside are
 * the biggest maps in the corpus. They are attributed one by one, as before: 6
 * painted numerals, 5 roundabout rings, 3 arrow maps. Every number in that
 * sentence is a test rather than a claim — including the sentence itself, which
 * „the catalogue's reach is measured, not claimed in a comment" GENERATES from
 * the mesh and requires to appear verbatim both here and on `censusCorpus`.
 *
 * Widening a domain is the one change that can WEAKEN a census while looking
 * like progress, so every forgery §5 carries is run over all 91 rather than the
 * 50 it was written for, and four more were built for the paint the widening
 * admits: a zone solid slid along its own rail, a zone solid missing, a zebra
 * bar turned 10° about its own centre, a В24 span whose осева stayed dashed.
 * The last of those is the founder's own verdict-board note as a test.
 *
 * ── AND THAT SHARE WAS WRONG, IN THIS FILE'S OWN SUBJECT ───────────────────
 * It read 14.8% for a wave, under a test titled „measured, not claimed in a
 * comment", because it was measured off the wrong thing: `markingQuads` is a
 * BOOKING counter, not a quad count. This file proves that twice and then did
 * not use it — §4 pins `triangles === 2·markingQuads − giveWayTriangles` and
 * §5 pins `census.quads === markingQuads − giveWayTriangles`, both of which
 * say a give-way TRIANGLE is booked in `markingQuads` while occupying one
 * triangle and not two. The corpus carries 108 of them, so the denominator was
 * over-booked by 108 and the reach was reported a tenth of a point low. Every
 * share here is now taken off the MESH — the same `readQuads` every other claim
 * rests on — and so is every quad total this file prints, including the
 * domain's: 14 of the 108 triangles are inside the widened domain, so the same
 * mistake made there would now cost 0.13 of a point rather than 0.10.
 *
 * ── THE COST, MEASURED ─────────────────────────────────────────────────────
 * Widening to 91 districts multiplies every domain-wide forgery by 1.8, and
 * this lane added six more of them. Paid for rather than absorbed, in three
 * places, each of which was a repeated computation of something that depends
 * only on the district:
 *   · `build()` memoises — 156 calls over 105 distinct districts were 51
 *     rebuilds, and 527 ms of a district's 607 ms is `load()` off a 7200 rpm
 *     disk;
 *   · `boundaryFrames`, `edgeFrames`, `drawableEdges` and the whole licence
 *     list memoise per `Built`. `dashChordOffsetM` walks each boundary at
 *     0.25 m and projects two corners back at every step, and the census used
 *     to redo it for the real mesh and again for every forgery;
 *   · the licence list is spatially indexed, so matching a quad is a 3×3 cell
 *     probe rather than a scan of the district's whole catalogue.
 * Measured on this box, warm, `--maxWorkers=2`: this file alone 2.21 s before
 * the widening, 4.42 s widened, 1.84 s widened WITH those three — faster than
 * it started while grading 1.8× the districts and running 62 tests instead of
 * 56.
 *
 * Its share of the world suite was measured as a PAIR, run and re-run, because
 * a single number off a shared box is not a measurement. Quiet, before this
 * lane: 72.75 s for `src/modules/sim/world` and 70.88 s for the same run with
 * this file excluded — the file cost 1.87 s, or 2.6%. Under load, after this
 * lane: 150.34 s with and 156.11 s without, i.e. the difference is below the
 * noise floor of a box where the same suite takes twice as long depending on
 * who else is running. Worth writing down because the brief this lane was
 * opened by carried „the file costs the world suite 20% (98 s → 118 s warm)",
 * and that is not reproducible here in either direction: 2.6% before, unmeasur-
 * able after. The optimisations above are still the right ones — they are what
 * kept 1.8× the work from becoming 1.8× the time — but the 20% was not the
 * reason and should not be quoted as one.
 *
 * And the 5 s default timeout is off every assertion that can meet a cold disk:
 * the 105-district corpus build is hoisted into `beforeAll` with 180 s, and the
 * two tests that read all 210 JSON files themselves — the corpus guard and the
 * byte-for-byte `public/world` comparison — carry 180 s of their own. That is
 * not tidiness. The same cold cache that measured the corpus build at 19.4 s,
 * 40.9 s and 65.8 s on three runs blew the 5 s default on the browser-copy test
 * in 1 run of 2, and a suite that goes red on a cold cache teaches everyone to
 * re-run until it is green, which is how a real red gets ignored.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assertDistrict, type District } from "../../types";
import {
  DASH_GAP_M,
  DASH_LENGTH_M,
  LANE_WIDTH_M,
  STOP_LINE_WIDTH_M,
  ZEBRA_LENGTH_M,
  ZEBRA_GAP_M,
  ZEBRA_STRIPE_ACROSS_M,
  CENTER_LINE_WIDTH_M,
  DASH_WIDTH_M,
  EDGE_LINE_WIDTH_M,
  EDGE_LINE_INSET_M,
  BUS_LANE_SEAM_WIDTH_M,
  EMERGENCY_LANE_SEAM_WIDTH_M,
  SOLID_CENTER_LINE_WIDTH_M,
  SOLID_LANE_DIVIDER_WIDTH_M,
  MARKED_CLASSES,
  EDGE_LINE_CLASSES,
  paintsZebra,
  livingZoneCarriageway,
} from "../constants";
import {
  add,
  mul,
  norm,
  offsetPolyline,
  perpRight,
  pointAlong,
  polylineLength,
  projectOntoPolyline,
  sub,
  trimPolyline,
  type Vec2,
} from "../math2d";
import {
  buildCrossingFurniture,
  buildMarkings,
  crossingIslandHalfWidthM,
  type MarkingBuildResult,
} from "../markings";
import { MeshAccumulator } from "../mesh";
// §d/§e drive the REAL grader and the REAL reducer against this file's painter
// (O32). Same module (`sim`), so these are intra-module imports, and nothing
// below mutates them — the point is that a re-derivation cannot catch a defect
// whose whole shape is „the grader asks a different question".
import { DistrictIndex } from "../../../runtime/spatial";
import type { District as RuntimeDistrict } from "../../../runtime/district";
import { CrossingZoneTracker } from "../../../runtime/zones";
import type { SimTickEvent } from "../../../rules/types";
import { createRuleEngine, reduceTick } from "../../../rules/engine";
import { tick } from "../../../rules/__tests__/fixtures";
import {
  analyzeNetwork,
  junctionPriorityControls,
  STOP_LINE_BEYOND_CUT_M,
  type RoadNetwork,
} from "../network";

// ---------------------------------------------------------------------------
// harness
// ---------------------------------------------------------------------------

/** content/world — the committed district corpus, from either cwd vitest uses. */
const WORLD_DIR = [
  path.join(process.cwd(), "content", "world"),
  path.resolve(process.cwd(), "..", "content", "world"),
].find((dir) => fs.existsSync(dir));

/**
 * platform/public/world — the copy the BROWSER actually fetches.
 *
 * Everything else in this file grades `content/world`, which is the authored
 * source and not the served bytes. Those two being the same file is a build
 * convention, not a law, and a student drives the served copy: a district that
 * passes here and diverges there is paint nobody proved. They are byte-identical
 * across all 105 today and the corpus test at the foot of this file keeps them
 * so, which is what lets every other assertion here speak for the browser too.
 */
const PUBLIC_WORLD_DIR = [
  path.join(process.cwd(), "public", "world"),
  path.resolve(process.cwd(), "platform", "public", "world"),
].find((dir) => fs.existsSync(dir));

function load(id: string): District {
  if (!WORLD_DIR) throw new Error("content/world not found from " + process.cwd());
  const file = path.join(WORLD_DIR, `${id}.json`);
  if (!fs.existsSync(file)) throw new Error(`${file} not found`);
  return assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")));
}

/**
 * The Б1/Б2 approach keys buildMarkings is fed in production. Derived from
 * `junctionPriorityControls` — the SAME call builders/props.ts makes, skipping
 * signalized nodes exactly as it does — so this battery grades the painter on
 * the sets it really receives rather than on invented ones.
 */
function priorityKeys(net: RoadNetwork): { stop: Set<string>; give: Set<string> } {
  const stop = new Set<string>();
  const give = new Set<string>();
  for (const node of net.nodes.values()) {
    if (node.signalized) continue;
    const controls = junctionPriorityControls(
      node.approaches.map((ap) => ({
        edgeId: ap.edgeId,
        class: ap.edge.class,
        incoming: ap.incoming,
        roundabout: ap.edge.roundabout,
      })),
    );
    for (const [edgeId, control] of controls) {
      (control === "stopSign" ? stop : give).add(`${node.id}:${edgeId}`);
    }
  }
  return { stop, give };
}

interface Built {
  district: District;
  net: RoadNetwork;
  markings: MarkingBuildResult;
}

/**
 * Every district built at most once per RUN, not once per assertion.
 *
 * `censusCorpus` below memoises its own 105-district sweep, but every `build(id)`
 * outside it paid again: 156 calls over 105 distinct districts, i.e. 51 rebuilds
 * of a district some other assertion had already read. That was affordable while
 * the census graded 50 maps and stops being so at 91 — the domain walks below run
 * seven forgeries over every member, and each rebuild is a `load()` off a 7200 rpm
 * disk (527 ms of the file's 607 ms of build time is JSON, measured).
 *
 * Handing the SAME object to every caller is safe here because nothing in this
 * file mutates a `Built`: every mutation is made on a COPY of the index buffer
 * (`[...mesh.indicesView]`) or on a fresh `MeshQuad[]` handed to
 * `districtCensus(built, quads)`, which is the whole reason the census takes an
 * override rather than editing the mesh. A district built from a literal fixture
 * is NOT cached — those are one-offs, and two fixtures may share an id.
 */
const buildCache = new Map<string, Built>();

/**
 * …and everything DERIVED from a `Built` that is a pure function of it, kept
 * beside the district that produced it.
 *
 * The census asks the same four questions of the same district over and over —
 * where its edges are, which lines its boundaries are drawn on, how far a
 * straight dash may chord off each of them, what rectangles it is licensed to
 * paint — and this file now asks them 91 times per forgery over seven forgeries.
 * `dashChordOffsetM` alone walks every boundary line at 0.25 m and projects two
 * corners back onto it at each step, which is the single most expensive reading
 * here and depends on nothing but the geometry.
 *
 * A WeakMap keyed on the `Built` and not a string: two districts can share an id
 * only if one is a hand-written fixture, and a fixture's derived data must never
 * be served for the corpus district of the same name.
 */
function perBuilt<T>(store: WeakMap<Built, T>, built: Built, make: () => T): T {
  const hit = store.get(built);
  if (hit !== undefined) return hit;
  const made = make();
  store.set(built, made);
  return made;
}

function build(source: string | District): Built {
  if (typeof source === "string") {
    const hit = buildCache.get(source);
    if (hit) return hit;
  }
  const district = typeof source === "string" ? load(source) : source;
  const net = analyzeNetwork(district);
  const { stop, give } = priorityKeys(net);
  const built: Built = { district, net, markings: buildMarkings(district, net, stop, give, []) };
  if (typeof source === "string") buildCache.set(source, built);
  return built;
}

/** An edge polyline with its cumulative arclength — one candidate owner. */
interface EdgeFrame {
  id: string;
  geom: Vec2[];
  cum: number[];
}

const edgeFramesMemo = new WeakMap<Built, EdgeFrame[]>();

function edgeFrames(built: Built): EdgeFrame[] {
  return perBuilt(edgeFramesMemo, built, () => edgeFramesOf(built));
}

function edgeFramesOf(built: Built): EdgeFrame[] {
  const out: EdgeFrame[] = [];
  for (const eb of built.net.edgeById.values()) {
    const geom = eb.edge.geometry as Vec2[];
    const cum = [0];
    for (let i = 1; i < geom.length; i++) {
      cum.push(
        cum[i - 1]! + Math.hypot(geom[i]![0] - geom[i - 1]![0], geom[i]![1] - geom[i - 1]![1]),
      );
    }
    out.push({ id: eb.edge.id, geom, cum });
  }
  return out;
}

/**
 * (s, t) of `(x, y)` in one edge's frame, or null when the point lies BEYOND
 * that edge's polyline — i.e. when the nearest point of the polyline is one of
 * its two extreme ends and the foot of the perpendicular is off the strip.
 *
 * A clamp at an INTERNAL vertex is kept: that is the outside of a kink, where
 * a straight dash quad legitimately overhangs the bend, and dropping it would
 * delete half of a real dash on ov-lane-v1's S-curve.
 */
function frameOn(f: EdgeFrame, x: number, y: number): { s: number; t: number; d: number } | null {
  let best = Infinity;
  let bestS = 0;
  let bestT = 0;
  let bestK = -1;
  let bestU = 0;
  for (let k = 0; k < f.geom.length - 1; k++) {
    const a = f.geom[k]!;
    const b = f.geom[k + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const segLen = Math.hypot(dx, dy);
    if (segLen === 0) continue;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (segLen * segLen)));
    const px = a[0] + dx * u;
    const py = a[1] + dy * u;
    const d = Math.hypot(x - px, y - py);
    if (d < best) {
      best = d;
      bestS = f.cum[k]! + u * segLen;
      // perpRight of the unit tangent (dy, -dx)/len — math2d's convention.
      bestT = ((x - px) * dy - (y - py) * dx) / segLen;
      bestK = k;
      bestU = u;
    }
  }
  if (bestK < 0) return null;
  if (bestK === 0 && bestU === 0) return null; // past geometry[0]
  if (bestK === f.geom.length - 2 && bestU === 1) return null; // past the last vertex
  return { s: bestS, t: bestT, d: best };
}

/** One painted QUAD, with where in the index buffer it was found. */
interface MeshQuad {
  /** Its four corners, district space, in paintQuad's emission order:
   *  back-left, back-right, front-right, front-left. */
  corners: [Vec2, Vec2, Vec2, Vec2];
  /** Offset of its first index — what a mutation has to splice out. */
  idx0: number;
}

/**
 * Every QUAD in a markings index buffer, read back as four district-space
 * corners.
 *
 * The mesh is the only honest unit here. `MeshAccumulator.quad(a,b,c,d)` pushes
 * `a,b,c, a,c,d`, so two consecutive triangles that share their first and third
 * vertices ARE one painted quad; anything else is a lone triangle (the М18
 * give-way symbol is the only one this file meets) and is skipped rather than
 * mistaken for half a rectangle.
 *
 * Why not cluster loose vertices, which is what this file shipped with? Because
 * a vertex cloud cannot tell a dash from anything else that happens to have a
 * vertex nearby, and two of the fifteen arrival failures were exactly that:
 * `paintStopLine` starts its bar at `inner = 0.15 m` from the осева, i.e. INSIDE
 * the осева's own half-stroke of 0.1875 m, so the М7 line's two inner corners
 * land in any lateral band drawn around the centre line. A quad has a length and
 * a width, and a dash is 5.00 × 0.375 m while that bar is 0.80 × 7.78 m.
 */
function readQuads(idx: readonly number[], pos: readonly number[]): MeshQuad[] {
  const at = (i: number): Vec2 => [pos[i * 3]!, -pos[i * 3 + 2]!];
  const out: MeshQuad[] = [];
  let t = 0;
  while (t + 6 <= idx.length) {
    const a = idx[t]!;
    const b = idx[t + 1]!;
    const c = idx[t + 2]!;
    if (idx[t + 3] === a && idx[t + 4] === c) {
      out.push({ corners: [at(a), at(b), at(c), at(idx[t + 5]!)], idx0: t });
      t += 6;
    } else {
      t += 3; // a lone triangle — not a quad
    }
  }
  return out;
}

/** Vertex index of corner `n` (0..3) of the quad whose indices start at `idx0`. */
function idxOfCorner(idx: readonly number[], idx0: number, n: 0 | 1 | 2 | 3): number {
  return idx[idx0 + (n === 3 ? 5 : n)]!; // a,b,c,a,c,d
}

/** One painted quad resolved into one edge's own frame. */
interface EdgeQuad {
  /** Arclength of the quad's CENTRE along the edge geometry, m. */
  s: number;
  /** Lateral offset of that centre, + = right of geometry-forward. */
  t: number;
  /**
   * Lateral offset of its LEFTMOST and RIGHTMOST CORNER — the reading `t`
   * cannot make.
   *
   * A rectangle's centroid is INVARIANT under rotation about its own centre, so
   * a centroid-only lateral assertion cannot fail at ANY angle: turn every dash
   * on ov-lane-v1 ten degrees across the road and `t` still reads 6e-15 m while
   * the corners stand 0.685 m off the axis — 3.7× the осева's own half-stroke.
   * That is measured, not argued (§3, „the осева check convicts a dash TURNED
   * across the road"), and it is why every lateral claim here is made on the
   * corners and only pinned on the centroid.
   */
  tLo: number;
  tHi: number;
  /** Arclengths of its nearest and furthest corner. */
  from: number;
  to: number;
  /** Its own long edge (corner 0 → corner 3), m — exact, not projected. */
  along: number;
  /** Its own short edge (corner 0 → corner 1), m — exact, not projected. */
  across: number;
  idx0: number;
}

/**
 * The quads this EDGE owns, in its (s, t) frame.
 *
 * `along` and `across` are the quad's OWN edge lengths, measured between
 * corners in district space, so they are exact whatever the road does
 * underneath: `paintQuad` builds every rectangle as centre ± alongHalf·dir ±
 * acrossHalf·perp, which makes |c0→c3| ≡ 2·alongHalf and |c0→c1| ≡ 2·acrossHalf
 * on a bend exactly as on a straight. Only the CENTRE is projected, and for a
 * dash the centre is `pointAlong(line, s)` offset by the boundary — a point that
 * lies on the drawn line itself.
 */
function quadsOnEdge(built: Built, edgeId: string, quads?: MeshQuad[]): EdgeQuad[] {
  const frames = edgeFrames(built);
  const mine = frames.find((f) => f.id === edgeId);
  if (!mine) throw new Error(`no edge ${edgeId}`);
  const src =
    quads ?? readQuads(built.markings.markings.indicesView, built.markings.markings.positionsView);
  const out: EdgeQuad[] = [];
  for (const q of src) {
    const inFrame = q.corners.map((c) => resolveOwned(frames, mine, c));
    if (inFrame.some((r) => r === null)) continue; // not this edge's paint
    const ss = inFrame.map((r) => r!.s);
    const ts = inFrame.map((r) => r!.t);
    const centre: Vec2 = [
      (q.corners[0][0] + q.corners[1][0] + q.corners[2][0] + q.corners[3][0]) / 4,
      (q.corners[0][1] + q.corners[1][1] + q.corners[2][1] + q.corners[3][1]) / 4,
    ];
    const mid = frameOn(mine, centre[0], centre[1]);
    if (!mid) continue;
    out.push({
      s: mid.s,
      t: mid.t,
      tLo: Math.min(...ts),
      tHi: Math.max(...ts),
      from: Math.min(...ss),
      to: Math.max(...ss),
      along: Math.hypot(q.corners[3][0] - q.corners[0][0], q.corners[3][1] - q.corners[0][1]),
      across: Math.hypot(q.corners[1][0] - q.corners[0][0], q.corners[1][1] - q.corners[0][1]),
      idx0: q.idx0,
    });
  }
  return out.sort((a, b) => a.s - b.s);
}

/**
 * `p` in `mine`'s frame, but only if no other edge's polyline is closer.
 *
 * Ownership is „this edge is the NEAREST one", not „within N metres of this
 * edge", and the difference is why this file misread the paint on arrival. With
 * the flat 30 m window it shipped with:
 *  · jx-equal-v1's north arm is COLLINEAR with its south arm, so the north
 *    arm's dashes fell inside the south arm's window, projected onto the south
 *    arm's far endpoint (u clamped to 1) and arrived as four phantom vertices
 *    at s = 130.00 m with t ≈ 0 — read out as a dash 17.93 m PAST the end of the
 *    drawn line, i.e. a trailing margin of −17.93 m against the 4.00 m the
 *    painter really lays. Three „the rhythm is not fitted" failures were that
 *    and nothing else;
 *  · tj-emerge-v1's primary cross street contributed eight more at |t| = 27.93.
 * Ties (a point exactly equidistant from two edges) go to the first edge in
 * network order; nothing in this corpus is equidistant, and a tie would be a
 * degenerate map rather than a marking.
 */
function resolveOwned(
  frames: EdgeFrame[],
  mine: EdgeFrame,
  p: Vec2,
): { s: number; t: number } | null {
  const owner = ownerOf(frames, p);
  return owner && owner.id === mine.id ? { s: owner.s, t: owner.t } : null;
}

/**
 * The edge nearest `p`, and `p` in THAT edge's frame — the one question
 * `resolveOwned` was asking F times over to answer once.
 *
 * Same answer, same tie-break (first edge in network order), one pass. The
 * district census asks it of four corners per quad and then compares the four
 * answers; asking „does edge f own this point?" of every f in turn cost
 * O(4·F²) frame projections per quad for a fact each corner already knows.
 */
function ownerOf(frames: EdgeFrame[], p: Vec2): { id: string; s: number; t: number } | null {
  let best = Infinity;
  let out: { id: string; s: number; t: number } | null = null;
  for (const f of frames) {
    const r = frameOn(f, p[0], p[1]);
    if (!r) continue;
    if (r.d < best) {
      best = r.d;
      out = { id: f.id, s: r.s, t: r.t };
    }
  }
  return out;
}

/**
 * THE DASHES on one edge — every quad whose own long edge is DASH_LENGTH_M.
 *
 * Selected by SHAPE ALONG THE ROAD and by nothing else, deliberately: where the
 * dash sits and how wide its stroke is are what the tests below assert, and a
 * counter that filtered on those first could only ever agree with itself. The
 * competing paint on these edges is 0.80 m (the М7 bar), 6.00 m (a zebra bar)
 * or the whole drawn line (a solid edge-line strip), so 5.00 m ± a millimetre
 * picks out dashes and nothing else.
 *
 * It counts QUADS, so it cannot double-count the way the shipped counter did:
 * that one clustered vertices with a gap threshold of DASH_LENGTH_M / 2 = 2.5 m
 * while a dash's own two ends are 5.0 m apart, and reported 46 dashes for
 * ov-lane-v1's 23, 16 for jx-equal-v1's 8, 22 for sx-v1's 11. (No gap threshold
 * could have worked: `dashStations` pays a run's slack into its gaps and only
 * guarantees them above DASH_GAP_M / 2 = 4.0 m, which is less than a dash.)
 */
function dashesOn(built: Built, edgeId: string, quads?: MeshQuad[]): EdgeQuad[] {
  return quadsOnEdge(built, edgeId, quads).filter(
    (q) => Math.abs(q.along - DASH_LENGTH_M) < 1e-3,
  );
}

/** The осева dashes — the ones on the axis rather than on a lane divider. */
function centreDashesOn(built: Built, edgeId: string): EdgeQuad[] {
  return dashesOn(built, edgeId).filter((q) => Math.abs(q.t) < 1);
}

/**
 * How far the quad's furthest CORNER stands from the boundary at `off`, m.
 *
 * This is the quantity „on the line" means to a driver: a dash whose centre is
 * on the осева but whose ends swing 0.7 m into the oncoming lane is not on the
 * осева. Asserted against `dashChordOffsetM(line) + stroke/2`, which is the
 * whole budget a straight dash is entitled to on a bending line — the chord's
 * sagitta plus its own half-width — and not a metre more.
 */
function cornerSpread(q: EdgeQuad, off: number): number {
  return Math.max(Math.abs(q.tHi - off), Math.abs(q.tLo - off));
}

/** The junction-trimmed line markings.ts actually walks on this edge. */
function drawnLine(built: Built, edgeId: string): { line: Vec2[]; s0: number; length: number } {
  const eb = built.net.edgeById.get(edgeId)!;
  const line = trimPolyline(eb.line as Vec2[], 0.8, 0.8, 2.5);
  if (!line) throw new Error(`edge ${edgeId} draws no line`);
  return { line, s0: eb.trimFrom + 0.8, length: polylineLength(line) };
}

/**
 * The most a STRAIGHT dash can stand off a BENDING line: walk the line and take
 * the worst distance from the far corner of a dash centred at each station back
 * to the line itself. Only stations where a whole dash FITS are sampled — past
 * them the corner is off the end of the line, and the distance measured there
 * is the overhang, not the sagitta.
 *
 * Measured, never assumed: ov-lane-v1 is an S-curve, and this file shipped
 * asserting every centre-line vertex within a flat 0.25 m of the axis when half
 * the stroke is 0.1875 m and the worst corner sits at 0.2568 m. That 0.069 m is
 * this quantity — the chord's sagitta over a 5 m dash on a ~45 m radius bend.
 * Nothing was wrong with the paint; real crews lay straight dashes on bends too.
 */
function dashChordOffsetM(line: Vec2[], dashLen = DASH_LENGTH_M): number {
  const total = polylineLength(line);
  let worst = 0;
  for (let s = dashLen / 2; s <= total - dashLen / 2; s += 0.25) {
    const at = pointAlong(line, s);
    for (const sign of [-1, 1] as const) {
      const corner: Vec2 = [
        at.point[0] + at.tangent[0] * sign * (dashLen / 2),
        at.point[1] + at.tangent[1] * sign * (dashLen / 2),
      ];
      worst = Math.max(worst, projectOntoPolyline(line, corner).distance);
    }
  }
  return worst;
}

// ---------------------------------------------------------------------------
// The painter's own three rules, restated once each
//
// Every „is this quad authored?" question below reduces to these. They are
// RESTATED from buildMarkings rather than imported from it, for the reason the
// rest of this file restates things: a check that asks the painter what it
// painted agrees with the painter by construction and guards nothing. They are
// stated ONCE, though — the per-edge census and the district census below share
// them, so the two instruments cannot drift into disagreeing about what „a lane
// boundary" is and quietly license each other's blind spot.
// ---------------------------------------------------------------------------

/**
 * The lateral offsets this edge is authored to carry a DASHED lane boundary on
 * — buildMarkings' lane-line loop, verbatim: every internal multiple of a lane
 * width from the left travel edge, dropped when it lands within 0.4 m of the
 * carriageway edge.
 *
 * The two hand-written boundary lists in §1 are asserted against this, which is
 * what makes them more than a comment: a painter that grew a fourth boundary on
 * ov-kr-road would satisfy any test whose expectation was „the three I typed".
 */
function authoredBoundaries(built: Built, edgeId: string): number[] {
  return authoredBoundaryPlan(built, edgeId).map((b) => b.off);
}

/** …and the LOOP INDEX each of those offsets came from. `buildMarkings` keys its
 *  zone-solid dash suppression by `k`, never by the offset, so a boundary that
 *  has to be matched against a suppression span has to carry its `k` with it. */
function authoredBoundaryPlan(built: Built, edgeId: string): Array<{ k: number; off: number }> {
  const eb = built.net.edgeById.get(edgeId)!;
  const travelHalf = eb.halfWidth - eb.parkingM;
  const lanes = Math.max(1, eb.edge.lanes);
  const out: Array<{ k: number; off: number }> = [];
  for (let k = 1; k < lanes; k++) {
    const off = -travelHalf + k * LANE_WIDTH_M;
    if (Math.abs(off) > travelHalf - 0.4) continue;
    out.push({ k, off });
  }
  return out;
}

/**
 * Where the solid М1 carriageway edge lines run on this edge, ±. With a parking
 * band the line sits ON the travel/parking boundary; without one it stays inset
 * from the curb so paint never underlaps it.
 */
function edgeLineOffset(built: Built, edgeId: string): number {
  const eb = built.net.edgeById.get(edgeId)!;
  const travelHalf = eb.halfWidth - eb.parkingM;
  return eb.parkingM > 0 ? travelHalf : travelHalf - EDGE_LINE_INSET_M;
}

/** Does this edge's class carry М1 edge lines at all? (`service` and
 *  `living_street` do not — a car-park aisle carries bay paint.) */
function paintsEdgeLines(built: Built, edgeId: string): boolean {
  return EDGE_LINE_CLASSES.has(built.net.edgeById.get(edgeId)!.edge.class);
}

/**
 * The stroke a dash on boundary `off` is entitled to. T16: the осева — the one
 * line on the carriageway with oncoming traffic behind it — is 1.5× a
 * same-direction divider, and that width is the one cue telling the student
 * which line he may legally cross.
 */
function dashStrokeAt(built: Built, edgeId: string, off: number): number {
  const eb = built.net.edgeById.get(edgeId)!;
  return !eb.edge.oneway && Math.abs(off) < 1e-6 ? CENTER_LINE_WIDTH_M : DASH_WIDTH_M;
}

/** Every quad on one edge, sorted into what the painter may lay there and what it may not. */
interface PaintCensus {
  /** Dash quads per authored lane boundary, keyed by that boundary's offset. */
  onBoundary: Map<number, EdgeQuad[]>;
  /** The solid М1 carriageway edge-line strips, both sides. */
  edgeLines: EdgeQuad[];
  /** Paint that is neither — the bucket every „no other paint" claim empties. */
  other: EdgeQuad[];
  /** Where the edge lines run, ±, from the painter's own arithmetic. */
  edgeOff: number;
  /** The most a straight 5 m dash may chord off this edge's drawn line. */
  sagitta: number;
}

/**
 * EVERY quad on one edge, sorted — the instrument the „no other paint" claims
 * are made with.
 *
 * They used to be made with `dashesOn`, which selects quads whose own long edge
 * is 5.000 m, so they could only ever see paint that ALREADY LOOKED LIKE A
 * DASH. Its refuter added one dashed line to every edge of every district at
 * t = +4.06 m — `laneCenterRightM`, i.e. straight down the middle of the lane
 * the student drives in — with 4.00 m dashes instead of 5.00 m: 25 phantom
 * dashes appeared on ov-lane-v1 beside the 23 real ones, `markingQuads` went
 * 103 → 128, and all 31 tests here stayed GREEN. It slipped past „the whole
 * carriageway carries no OTHER dash", past „three internal boundaries and no
 * fourth", and past `triangles === 2·markingQuads − giveWayTriangles` (which
 * holds because the extra quads were booked honestly). A phantom lane boundary
 * down the middle of a 1+1 residential road is the exact defect class this file
 * exists to catch, inverted — so the census reads ALL quads and classifies by
 * SHAPE AND PLACE, and the tests assert the leftover bucket is empty.
 *
 * On a marked, zoneless, crossing-free, junction-free edge — which is what both
 * overtaking districts are — the painter lays exactly two kinds of quad:
 *  · a DASH on an authored boundary: 5.000 m long, at that boundary's own
 *    stroke (T16 — CENTER_LINE_WIDTH_M on the осева, DASH_WIDTH_M on a
 *    same-direction divider), within half a lane of the boundary. The BAND is
 *    deliberately loose and the stroke deliberately exact: a dash nudged off
 *    its boundary must land in a boundary's bucket and be convicted there by
 *    `cornerSpread`, not vanish into `other` where the diagnosis is vaguer;
 *  · a SOLID EDGE-LINE strip: EDGE_LINE_WIDTH_M across, centred within its own
 *    half-stroke of ±edgeOff, one quad per geometry segment (so its `along` is
 *    whatever that segment is — 6.99…7.90 m on ov-lane-v1's 41-vertex S-curve,
 *    358.40 m on ov-keepright-v1's single straight).
 * Edge lines are matched FIRST: they are pinned to a place no lane boundary
 * occupies, so the order cannot cost a dash its bucket.
 */
function censusOnEdge(
  built: Built,
  edgeId: string,
  boundaries: readonly number[],
  quads?: MeshQuad[],
): PaintCensus {
  const edgeOff = edgeLineOffset(built, edgeId);
  const sagitta = dashChordOffsetM(drawnLine(built, edgeId).line);
  const strokeAt = (off: number): number => dashStrokeAt(built, edgeId, off);

  const onBoundary = new Map<number, EdgeQuad[]>(boundaries.map((b) => [b, []]));
  const edgeLines: EdgeQuad[] = [];
  const other: EdgeQuad[] = [];
  for (const q of quadsOnEdge(built, edgeId, quads)) {
    if (
      Math.abs(q.across - EDGE_LINE_WIDTH_M) < 1e-3 &&
      Math.abs(Math.abs(q.t) - edgeOff) < EDGE_LINE_WIDTH_M / 2
    ) {
      edgeLines.push(q);
      continue;
    }
    const home = boundaries.find(
      (b) =>
        Math.abs(q.along - DASH_LENGTH_M) < 1e-3 &&
        Math.abs(q.across - strokeAt(b)) < 1e-9 &&
        Math.abs(q.t - b) < LANE_WIDTH_M / 2,
    );
    if (home === undefined) other.push(q);
    else onBoundary.get(home)!.push(q);
  }
  return { onBoundary, edgeLines, other, edgeOff, sagitta };
}

/**
 * How many dashes the OLD fixed-pitch walk fitted on a run this long — the
 * count the re-spaced rhythm must reproduce exactly. Written out longhand
 * rather than imported so the test cannot be satisfied by the same arithmetic
 * bug on both sides.
 */
function fixedPitchDashCount(total: number): number {
  let n = 0;
  for (let s = DASH_GAP_M / 2; s + DASH_LENGTH_M < total; s += DASH_LENGTH_M + DASH_GAP_M) n++;
  return n;
}

/**
 * WHERE those dashes stand — `dashStations`' fitted walk, restated longhand.
 *
 * The COUNT above is what §2 and §5 have always asserted, and a count cannot
 * see the one real defect this file ever found in markings.ts: the old walk
 * anchored at gapLen/2 from the near end and paid ALL its slack out at the far
 * end, which on a junction-trimmed arm is the junction mouth — 11.27 m of
 * unpainted осева on jx-equal-v1's four arms, 0.28 m on sx-v1's north arm, same
 * class, same junction, pure phase luck. The fitted walk fits the SAME n
 * dashes, so reverting it changes no count anywhere; §2 catches it only on the
 * six edges it names by id, and re-laying every dash in the whole 50-district
 * domain at the old fixed-pitch stations was measured GREEN on this file —
 * 50 districts silent, 0 convicted — before this function existed.
 *
 * Written out rather than imported for the reason everything here is: a check
 * that asks `dashStations` where it put the dashes agrees with it by
 * construction. Restated, a change to the rhythm has to be made in two places
 * or it fails.
 */
function fittedDashStations(total: number): number[] {
  const n = fixedPitchDashCount(total);
  if (n === 0) return [];
  if (n === 1) return [total / 2]; // one dash has no rhythm to fit — centre it
  const margin = DASH_GAP_M / 2;
  const gap = (total - 2 * margin - n * DASH_LENGTH_M) / (n - 1);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(margin + i * (DASH_LENGTH_M + gap) + DASH_LENGTH_M / 2);
  return out;
}

/**
 * How far a quad's furthest CORNER stands from a POLYLINE, m — `cornerSpread`
 * generalised off the edge frame.
 *
 * `cornerSpread` reads `tLo`/`tHi`, which are offsets in the EDGE's frame, and
 * compares them to a boundary's nominal offset. That is exact on the осева
 * (offset 0 IS the edge) and only approximate on a divider: `offsetPolyline`
 * scales its offset by the joint miter, so a divider LANE_WIDTH_M out from a
 * bend does not sit at t = LANE_WIDTH_M there, and a check written that way
 * would have to carry a fudge factor big enough to hide the defect it hunts.
 *
 * Measured against the boundary's OWN painted line there is no fudge at all: the
 * worst corner of the worst dash in the domain stands at exactly 1.0000× its
 * budget — half a stroke on a straight run, half a stroke plus the chord's
 * sagitta on a bend — and a dash turned 10° stands at 0.685 m against a 0.302 m
 * budget. Tight enough that the epsilon matters, and the epsilon is 1 µm.
 *
 * That was measured when the domain was 50 districts, and admitting 41 more is
 * admitting 41 new sets of bends — any one of which could have forced the budget
 * open and left it convicting nothing. It did not, and that is no longer a note:
 * „the widened domain really carries the paint it was widened for" measures the
 * worst ratio over all 91 and requires it to be at once ≤ 1 and > 0.9. It reads
 * above 0.99999, i.e. the same 1.0000× on the wider domain.
 */
function cornerOffsetFrom(corners: readonly Vec2[], line: Vec2[]): number {
  let worst = 0;
  for (const c of corners) worst = Math.max(worst, projectOntoPolyline(line, c).distance);
  return worst;
}

// Districts behind the six findings, by the lesson that named them.
const OV_LANE = "ov-lane-v1"; // sc-ov-lane-keeping (S-curve, residential 1+1)
const OV_KEEPRIGHT = "ov-keepright-v1"; // sc-ov-keep-right  (tertiary 2+2)
const TJ_EMERGE = "tj-emerge-v1"; // sc-junction-left  (Б2 stem into a primary)
const TJ_OCCLUDED = "tj-occluded-v1"; // sc-junction-blind (равнозначно T)
const JX_EQUAL = "jx-equal-v1"; // sc-jx-equal-left  (равнозначно ×)
const SX = "sx-v1"; // sc-jx-blocked-exit (signalized ×)
const JXG = "jxg-giveway-v1"; // the Б1 map — the only give-way paint shipped

// ---------------------------------------------------------------------------
// 1. The markings the audit reported missing
// ---------------------------------------------------------------------------

describe("the marking each lesson names is on the road", () => {
  it(`${OV_LANE}: the осева IS painted — sc-ov-lane-keeping's critical finding, refuted`, () => {
    // «The road through the S-bend has no centre line and no lane lines — only
    // white kerb edge lines … The student is graded against paint that is not
    // on the road.» Measured here: 23 М3 dashes centred on the road axis, over
    // 297 m of a 305 m drawn line.
    const built = build(OV_LANE);
    const dashes = dashesOn(built, "ov-ln-street");
    expect(dashes.length).toBeGreaterThanOrEqual(20);

    // ON THE AXIS, not merely near it, and at the осева's own stroke. All three
    // are asserted AFTER the fact — `dashesOn` selects on length alone — so
    // none can be satisfied by the filter that found them.
    //
    // The CENTROID claim is exact: a dash quad's centre is `pointAlong(line, s)`
    // itself, a point on the drawn line, so it holds through the S-bend at
    // 6e-15 m. It is also, on its own, UNFALSIFIABLE — a rectangle's centroid
    // does not move when the rectangle turns about it — and this file spent a
    // wave asserting only that: rotate every dash 10° across the road and the
    // test titled „ON THE AXIS, not merely near it" still passed, with corners
    // 0.685 m out. So the load-bearing claim is the CORNER one below.
    //
    // Its budget is measured, not chosen: `dashChordOffsetM` walks this edge's
    // own drawn line and returns 0.11488 m — the most a straight 5 m dash can
    // chord off a bend of this radius — and half the осева's stroke is
    // 0.1875 m. Worst corner actually painted: 0.25679 m against the 0.30238 m
    // allowed. That is 0.046 m of headroom, and about one degree of turn spends
    // it (10° reads 0.685 m). The 0.25 m FLAT number this file shipped with
    // left 0.0625 m over the half-stroke for a sagitta that measures 0.0693 m,
    // which is why it fired on good paint — real crews lay straight dashes on
    // bends too. „No wider than the geometry forces" is the check; deleting it
    // was not the way to stop it firing.
    const bound = dashChordOffsetM(drawnLine(built, "ov-ln-street").line) + CENTER_LINE_WIDTH_M / 2 + 1e-6;
    for (const d of dashes) {
      expect(Math.abs(d.t)).toBeLessThan(1e-6);
      expect(cornerSpread(d, 0)).toBeLessThan(bound);
      expect(d.across).toBeCloseTo(CENTER_LINE_WIDTH_M, 9);
    }
    // …and the whole carriageway carries no OTHER PAINT — a 1+1 residential has
    // exactly one internal boundary, so nothing is painted at ±LANE_WIDTH_M.
    // Read off the CENSUS, not off `dashesOn`: the version that asked only
    // „is there another 5.000 m quad?" was green with 25 extra 4.00 m dashes
    // laid down the middle of the driver's own lane. Every one of this edge's
    // 103 quads must be the осева's 23 dashes or the 80 М1 edge-line strips.
    expect(authoredBoundaries(built, "ov-ln-street")).toEqual([0]);
    const census = censusOnEdge(built, "ov-ln-street", [0]);
    expect(census.other).toEqual([]);
    // …and the осева carries the count the fixed-pitch walk fits, not „however
    // many the reader found".
    //
    // That is the whole edit on this line. It used to read `.toBe(dashes.length)`
    // — and `onBoundary(0)` IS `dashes`, filtered by the very predicate the loop
    // above has just asserted of every member, so the two sides could not
    // disagree for any input whatsoever: delete a dash and both fall to 22,
    // paint an extra one and both rise to 24. A line no input can fail is not a
    // check, and this file has now been bitten three times by exactly that
    // shape. Against `fixedPitchDashCount` it is falsifiable in BOTH directions,
    // and both are constructed in §5 („convicts one MISSING dash" / „convicts
    // one EXTRA dash").
    expect(census.onBoundary.get(0)!.length).toBe(
      fixedPitchDashCount(drawnLine(built, "ov-ln-street").length),
    );
    expect(census.edgeLines.length).toBeGreaterThan(0);
    // …and no quad escaped the census by being painted somewhere else in the
    // district either: ov-lane-v1 is ONE edge, it paints no М18 triangle, so
    // every quad the builder booked has to have been read back on it.
    expect(census.other.length + census.edgeLines.length + census.onBoundary.get(0)!.length).toBe(
      built.markings.markingQuads,
    );

    // And it runs the WHOLE street, not just the straight bit — the S-bend is
    // the lesson. Both ends inside a dash pitch of the drawn line's own ends.
    const { s0, length } = drawnLine(built, "ov-ln-street");
    const pitch = DASH_LENGTH_M + DASH_GAP_M;
    expect(dashes[0]!.from - s0).toBeLessThan(pitch);
    expect(s0 + length - dashes[dashes.length - 1]!.to).toBeLessThan(pitch);
  });

  it(`${OV_KEEPRIGHT}: three internal lane boundaries, one per divider — the sibling comparison`, () => {
    // «This lesson's carriageway carries dashed lane lines; sc-ov-lane-keeping
    // … carries none at all.» Both carry exactly what their lane count asks
    // for: a 2+2 tertiary has three internal boundaries (±W and the осева), a
    // 1+1 residential has one. That is the SAME rule, not two.
    const built = build(OV_KEEPRIGHT);
    const dashes = dashesOn(built, "ov-kr-road");
    const BOUNDARIES = [-LANE_WIDTH_M, 0, LANE_WIDTH_M];
    // …and „three" is the painter's number, not the author's guess: a fourth
    // boundary would satisfy every expectation written as „the three I typed".
    expect(authoredBoundaries(built, "ov-kr-road")).toEqual(BOUNDARIES);
    // The chord allowance is the offset lines' own: a divider LANE_WIDTH_M out
    // from a bending axis chords across the bend, so its quad centres read a
    // few centimetres in. Derived from this edge's drawn line, not chosen —
    // and on this one it is 5.7e-14 m, because ov-kr-road is a single straight
    // segment. Which is why the CORNER bound below bites so hard here.
    const slack = dashChordOffsetM(drawnLine(built, "ov-kr-road").line) + 1e-6;
    for (const off of BOUNDARIES) {
      const stroke = off === 0 ? CENTER_LINE_WIDTH_M : DASH_WIDTH_M;
      const on = dashes.filter((d) => Math.abs(d.t - off) < LANE_WIDTH_M / 2);
      expect(on.length, `boundary at ${off} m`).toBeGreaterThanOrEqual(20);
      for (const d of on) {
        expect(Math.abs(d.t - off), `boundary at ${off} m`).toBeLessThan(slack);
        // …with its ENDS on the boundary too, not just its middle. Same reason
        // as on the осева: the centroid claim above cannot fail at any angle,
        // and on a straight road the whole budget a dash has is its own
        // half-stroke — 0.125 m on a divider, 0.1875 m on the осева, which is
        // exactly what the paint measures.
        expect(cornerSpread(d, off), `boundary at ${off} m`).toBeLessThan(slack + stroke / 2);
        // …painted at the стъпка that boundary is entitled to: the осева is
        // 1.5× a same-direction divider (T16), and that width is the one cue
        // telling the student which line has oncoming traffic behind it.
        expect(d.across, `boundary at ${off} m`).toBeCloseTo(stroke, 9);
      }
    }
    // Three internal boundaries and no fourth — and no other PAINT of any
    // shape, which is the half that was missing. Filtering `dashesOn` asked
    // only whether a fourth boundary was drawn in 5.000 m dashes; a fourth
    // drawn in 4.00 m dashes at t = +4.06 m (the centre of the driver's own
    // lane) sailed through it. All 83 quads: 81 dashes on the three
    // boundaries, 2 М1 edge-line strips, nothing else.
    const census = censusOnEdge(built, "ov-kr-road", BOUNDARIES);
    expect(census.other).toEqual([]);
    expect(census.edgeLines.length).toBe(2);
    // …and the corner bound above really was as tight as it looks: this edge is
    // one straight segment, so a dash on it has no sagitta to spend and the
    // whole budget is its own half-stroke.
    expect(census.sagitta).toBeLessThan(1e-9);
    // The М1 edge lines sit on the travel/parking boundary here (parkingM = 4 m,
    // so `edgeOff` is travelHalf itself and not travelHalf − EDGE_LINE_INSET_M).
    expect(census.edgeOff).toBeCloseTo(16.25, 9);
    for (const strip of census.edgeLines) expect(Math.abs(strip.t)).toBeCloseTo(census.edgeOff, 9);
    for (const off of BOUNDARIES) {
      expect(census.onBoundary.get(off)!.length, `boundary at ${off} m`).toBeGreaterThanOrEqual(20);
    }
    expect(
      census.edgeLines.length + BOUNDARIES.reduce((n, o) => n + census.onBoundary.get(o)!.length, 0),
    ).toBe(built.markings.markingQuads);
  });

  it(`${TJ_EMERGE}: the Б2 arm carries a solid М7 stop line at its mouth — sc-junction-left, refuted`, () => {
    // «The objective and the coach caption both name a stop line the world
    // does not have … No stop line is painted anywhere in front of the sign.»
    // One IS painted, and this pins WHERE: at the junction cut plus
    // STOP_LINE_BEYOND_CUT_M, which is the arclength runtime/stoplines.ts
    // grades at. Paint and grading coincide or a driver who stops on the paint
    // is failed for not stopping.
    const built = build(TJ_EMERGE);
    expect(built.markings.stopLines).toBe(1);

    const eb = built.net.edgeById.get("tj-e-s")!;
    const geomLen = polylineLength(eb.edge.geometry as Vec2[]);
    // trimTo is the cut at the node end; the arm's node end is s = geomLen.
    const expectedS = geomLen - eb.trimTo - STOP_LINE_BEYOND_CUT_M;

    // The bar is the one TRANSVERSE quad on this arm: STOP_LINE_WIDTH_M along
    // the road and metres across it. Picked by that shape, NOT by a lateral
    // band — a band is what this file shipped with (|t| ∈ (1, 8.1) m) and it
    // also caught the eight end vertices of the two longitudinal EDGE LINES,
    // which sit at |t| = 7.475…7.775 m because residential is in
    // EDGE_LINE_CLASSES. Ten „transverse" vertices where one quad has four.
    // (`paintStopLine` builds the bar with its `dir` pointing ACROSS the road,
    // so the quad's long edge — `along` here — is the span over the lanes and
    // its short edge is STOP_LINE_WIDTH_M along the carriageway.)
    const bars = quadsOnEdge(built, "tj-e-s").filter(
      (q) => Math.abs(q.across - STOP_LINE_WIDTH_M) < 1e-6 && q.along > 1,
    );
    expect(bars.length).toBe(1);
    const bar = bars[0]!;

    // WHERE: on the arclength runtime/stoplines.ts grades at, to the millimetre.
    expect(bar.s).toBeCloseTo(expectedS, 3);
    // …and it spans the INCOMING half only, never the oncoming lane: from the
    // осева (paintStopLine's `inner` = 0.15 m) out to the kerb-side edge of the
    // travel lanes (`outer` = travelHalf − 0.2 m), entirely on one side of the
    // axis. Measured: 7.775 m of bar centred 4.0375 m right of the осева.
    expect(bar.along).toBeCloseTo(LANE_WIDTH_M - 0.2 - 0.15, 6);
    expect(Math.abs(bar.t)).toBeCloseTo((LANE_WIDTH_M - 0.2 + 0.15) / 2, 6);
    expect(Math.abs(bar.t) - bar.along / 2).toBeGreaterThan(0); // never crosses t = 0
    // Right of geometry-forward, which on this south-to-north arm is the half a
    // driver approaching the junction travels on.
    expect(Math.sign(bar.t)).toBe(1);
  });

  it(`${SX}: the signalized × carries one stop line per arm — sc-jx-blocked-exit`, () => {
    // «the only one whose junction has a painted stop line» — true, and it is
    // the only SIGNALIZED one. Four arms, four lines.
    const built = build(SX);
    expect(built.markings.stopLines).toBe(4);
  });

  it(`${TJ_OCCLUDED} / ${JX_EQUAL}: равнозначни junctions carry NO transverse line`, () => {
    // The no-false-credit direction of every assertion above. sc-junction-blind
    // and sc-jx-equal-left were reported as „bare" — and a равнозначно
    // кръстовище IS bare of М7: priority is the right-hand rule, and painting a
    // stop line there would teach a duty the law does not impose. If a later
    // change „fixes" the bare junctions by painting lines everywhere, this
    // fails.
    for (const id of [TJ_OCCLUDED, JX_EQUAL]) {
      const built = build(id);
      expect(built.markings.stopLines, id).toBe(0);
      expect(built.markings.giveWayTriangles, id).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The one finding whose cause WAS in this file: the junction-mouth tail
// ---------------------------------------------------------------------------

describe("the dashed rhythm is fitted to its run, both ends alike", () => {
  // The old walk anchored at gapLen/2 from the near end and paid ALL its slack
  // out at the far end — which on a junction-trimmed arm is the junction mouth.
  // Measured before the fix: jx-equal-v1's four arms and tj-occluded-v1's stem
  // stopped 11.27 m short of their own mouth, tj-emerge-v1's Б2 stem 10.28 m,
  // while sx-v1's north arm stopped 0.28 m short — same class, same junction,
  // pure phase luck. That is the audit's „the same road class renders three
  // different ways across the set", and on the равнозначни maps it is 11 m of
  // unpainted осева on top of the 17 m junction patch.
  const CASES: Array<[string, string]> = [
    [JX_EQUAL, "jx-e-s"],
    [JX_EQUAL, "jx-e-n"],
    [TJ_OCCLUDED, "tj-e-s"],
    [TJ_EMERGE, "tj-e-s"],
    [SX, "sx-e-w"],
    [OV_LANE, "ov-ln-street"],
  ];

  for (const [id, edgeId] of CASES) {
    it(`${id}/${edgeId}: leading margin === trailing margin === DASH_GAP_M/2`, () => {
      const built = build(id);
      const { s0, length } = drawnLine(built, edgeId);
      const dashes = centreDashesOn(built, edgeId);
      expect(dashes.length).toBeGreaterThan(1);

      const leading = dashes[0]!.from - s0;
      const trailing = s0 + length - dashes[dashes.length - 1]!.to;
      expect(leading).toBeCloseTo(DASH_GAP_M / 2, 1);
      expect(trailing).toBeCloseTo(DASH_GAP_M / 2, 1);
    });

    it(`${id}/${edgeId}: re-spacing adds no dash the fixed-pitch walk did not fit`, () => {
      // The no-free-paint direction. Fitting the rhythm may MOVE paint; it may
      // never mint any. The count must still be the fixed-pitch walk's.
      const built = build(id);
      const { length } = drawnLine(built, edgeId);
      expect(centreDashesOn(built, edgeId).length).toBe(fixedPitchDashCount(length));
    });
  }

  it("the dash counter convicts paint that is NOT there", () => {
    // A counter that cannot notice missing paint is worthless — it would credit
    // a бяла осева that was never laid, which is this file's whole subject
    // pointed the other way. So: count jx-equal-v1's south arm, then DELETE one
    // dash from the mesh — splice its six indices out of the index buffer, the
    // same surgery a builder regression would perform — and count again. It
    // must say 7, and the seven survivors must be the seven that survived.
    const built = build(JX_EQUAL);
    const mesh = built.markings.markings;
    const whole = centreDashesOn(built, "jx-e-s");
    expect(whole.length).toBe(8);

    const gone = whole[3]!;
    const idx = [...mesh.indicesView];
    idx.splice(gone.idx0, 6);
    const holed = quadsOnEdge(built, "jx-e-s", readQuads(idx, mesh.positionsView)).filter(
      (q) => Math.abs(q.along - DASH_LENGTH_M) < 1e-3 && Math.abs(q.t) < 1,
    );
    expect(holed.length).toBe(7);
    expect(holed.map((d) => d.s.toFixed(2))).toEqual(
      whole.filter((d) => d !== gone).map((d) => d.s.toFixed(2)),
    );

    // …and it is not fooled the other way either: a quad that is NOT a dash is
    // not counted as one. Shorten the same dash to half its length in the
    // vertex buffer and it drops out rather than being rounded up — 5.00 m is
    // what a dash is, and 2.50 m of paint is a defect, not a dash.
    const pos = [...mesh.positionsView];
    const c0 = idxOfCorner(mesh.indicesView, gone.idx0, 0);
    const c3 = idxOfCorner(mesh.indicesView, gone.idx0, 3);
    const c1 = idxOfCorner(mesh.indicesView, gone.idx0, 1);
    const c2 = idxOfCorner(mesh.indicesView, gone.idx0, 2);
    for (const [near, far] of [
      [c0, c3],
      [c1, c2],
    ] as const) {
      for (const axis of [0, 2]) {
        pos[far * 3 + axis] = (pos[near * 3 + axis]! + pos[far * 3 + axis]!) / 2;
      }
    }
    const shrunk = quadsOnEdge(built, "jx-e-s", readQuads(mesh.indicesView, pos)).filter(
      (q) => Math.abs(q.along - DASH_LENGTH_M) < 1e-3 && Math.abs(q.t) < 1,
    );
    expect(shrunk.length).toBe(7);
  });

  it("a run too short for one whole dash stays unpainted", () => {
    // The other no-free-paint direction: fitting a rhythm to a stub must not
    // invent the stub's first dash. gapLen/2 + dashLen = 9 m is the threshold
    // the fixed-pitch walk had, and it is unchanged.
    expect(fixedPitchDashCount(DASH_GAP_M / 2 + DASH_LENGTH_M)).toBe(0);
    expect(fixedPitchDashCount(DASH_GAP_M / 2 + DASH_LENGTH_M + 0.01)).toBe(1);

    const built = build(STUB);
    // The absence of PAINT, not the absence of 5.000 m quads. Asked the second
    // way — `dashesOn(built, "stub-e")` — this test cannot fail: emit ONE 3.00 m
    // dash on the too-short run and the stub carries a 3 m осева from y = 2.50
    // to y = 5.50 with all 31 tests green, which is precisely the „must not
    // invent the stub's first dash" the comment above claims to forbid. A
    // painter that invents a dash is not going to invent it at the one length
    // the reader looks for.
    const census = censusOnEdge(built, "stub-e", [0]);
    expect(quadsOnEdge(built, "stub-e").filter((q) => Math.abs(q.t) < 1)).toEqual([]);
    expect(census.onBoundary.get(0)).toEqual([]);
    expect(census.other).toEqual([]);
    // …and the edge is genuinely marked otherwise, so the zeroes above are the
    // dash rule and not a district the painter skipped wholesale: 6.40 m of
    // drawn line still carries its two М1 edge-line strips at t = ±7.625 m.
    expect(built.markings.markingQuads).toBeGreaterThan(0);
    expect(census.edgeLines.length).toBe(built.markings.markingQuads);
    expect(census.edgeLines.length).toBe(2);
    expect(census.edgeOff).toBeCloseTo(7.625, 9);
    for (const strip of census.edgeLines) {
      expect(Math.abs(strip.t)).toBeCloseTo(census.edgeOff, 9);
      expect(strip.along).toBeCloseTo(drawnLine(built, "stub-e").length, 9);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The three checks this battery once deleted, each pinned by the mutation
//    that walked through the hole
// ---------------------------------------------------------------------------

/**
 * Every DASH quad in `quads`, turned `deg` about its OWN centroid.
 *
 * The mesh-level twin of turning `paintDashedLine`'s `mid.tangent` by the same
 * angle, and exactly equivalent to it: `paintQuad` builds a rectangle as
 * centre ± alongHalf·dir ± acrossHalf·perpRight(dir), so rotating `dir` rotates
 * all four corners about that centre and moves nothing else. Done here rather
 * than in markings.ts because a mutation that has to be applied by hand, to a
 * file this test does not own, gets applied once and then remembered wrongly.
 */
function turnDashes(quads: readonly MeshQuad[], deg: number): MeshQuad[] {
  return quads.map((q) => {
    const along = Math.hypot(q.corners[3][0] - q.corners[0][0], q.corners[3][1] - q.corners[0][1]);
    return Math.abs(along - DASH_LENGTH_M) < 1e-3 ? turnQuad(q, deg) : q;
  });
}

/** The quad's own centre — the reading a rotation cannot move. */
function quadCentre(q: MeshQuad): Vec2 {
  return [
    (q.corners[0][0] + q.corners[1][0] + q.corners[2][0] + q.corners[3][0]) / 4,
    (q.corners[0][1] + q.corners[1][1] + q.corners[2][1] + q.corners[3][1]) / 4,
  ];
}

/** One quad turned `deg` about its OWN centroid, whatever kind of quad it is —
 *  a dash, an М7 bar, a zebra bar or a ribbon strip. */
function turnQuad(q: MeshQuad, deg: number): MeshQuad {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const c = quadCentre(q);
  const turn = (p: Vec2): Vec2 => [
    c[0] + (p[0] - c[0]) * cos - (p[1] - c[1]) * sin,
    c[1] + (p[0] - c[0]) * sin + (p[1] - c[1]) * cos,
  ];
  return { corners: q.corners.map(turn) as [Vec2, Vec2, Vec2, Vec2], idx0: q.idx0 };
}

/** One quad slid `dm` metres along its own long axis — the forgery a COUNT of
 *  matched paint cannot see, because nothing about the quad changes but where
 *  on the road it lies. */
function slideQuad(q: MeshQuad, dm: number): MeshQuad {
  const dir = norm(sub(q.corners[3], q.corners[0]));
  return {
    corners: q.corners.map((c) => add(c, mul(dir, dm))) as [Vec2, Vec2, Vec2, Vec2],
    idx0: q.idx0,
  };
}

/**
 * THE RETIRED LICENCE RULE, kept so the forgeries it could not see can be shown
 * walking past it in the same test that convicts them.
 *
 * Until this lane an М7 quad was matched on its CENTRE (1 µm), its own long edge
 * and its own short edge. All three are invariant under rotation about the
 * quad's centre — which §3 proves for dashes and is no less true of a stop bar —
 * so a bar turned across its own mouth matched its licence exactly, and both a
 * turned М7 and a turned zebra bar were authored paint as far as this file could
 * tell. `coversLicence` asks the four corners instead. This function is what
 * makes „that is a new check" a check rather than a claim.
 */
function centroidMatch(q: MeshQuad, L: QuadLicence): boolean {
  const twin: MeshQuad = { corners: L.corners, idx0: -1 };
  const a = quadCentre(q);
  const b = quadCentre(twin);
  const edge = (x: MeshQuad, i: 1 | 3): number =>
    Math.hypot(x.corners[i][0] - x.corners[0][0], x.corners[i][1] - x.corners[0][1]);
  return (
    Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6 &&
    Math.abs(edge(q, 3) - edge(twin, 3)) < 1e-6 &&
    Math.abs(edge(q, 1) - edge(twin, 1)) < 1e-6
  );
}

/** Is this quad a lane dash? 5.000 m long at one of the two lane strokes —
 *  never an М1 strip, whose 0.300 m width no dash carries. */
function isDashQuad(q: MeshQuad): boolean {
  const along = Math.hypot(q.corners[3][0] - q.corners[0][0], q.corners[3][1] - q.corners[0][1]);
  if (Math.abs(along - DASH_LENGTH_M) >= 1e-3) return false;
  const across = Math.hypot(q.corners[1][0] - q.corners[0][0], q.corners[1][1] - q.corners[0][1]);
  return (
    Math.abs(across - DASH_WIDTH_M) < 1e-9 || Math.abs(across - CENTER_LINE_WIDTH_M) < 1e-9
  );
}

/**
 * Every DASH quad in `quads`, moved `dt` metres ACROSS its own axis — the
 * mesh-level twin of a lane-line loop that offsets by `off + dt`.
 *
 * The lateral forgery `turnDashes` cannot make: a turned dash still averages
 * back onto its boundary, a shoved one does not, and the census filed both
 * under the boundary they belong to and said nothing about either.
 */
function shiftDashes(quads: readonly MeshQuad[], dt: number): MeshQuad[] {
  return quads.map((q) => {
    if (!isDashQuad(q)) return q;
    const p = perpRight(norm(sub(q.corners[3], q.corners[0])));
    return {
      corners: q.corners.map((c) => add(c, mul(p, dt))) as [Vec2, Vec2, Vec2, Vec2],
      idx0: q.idx0,
    };
  });
}

/**
 * A district's mesh with every lane dash RE-LAID at the old fixed-pitch
 * stations — the mesh-level twin of reverting `dashStations` to the walk it
 * replaced.
 *
 * The old walk started each dash at gapLen/2 from the near end and stepped
 * dashLen + gapLen, spending nothing on the far end. It fits the same n dashes
 * as the fitted rhythm by construction (that is `fixedPitchDashCount`), so the
 * quad count, the booking and every per-boundary total are untouched and only
 * the STATIONS move — which is exactly why nothing in this file could see it
 * outside the six edges §2 names.
 */
function fixedPitchRelay(built: Built): MeshQuad[] {
  const real = readQuads(
    built.markings.markings.indicesView,
    built.markings.markings.positionsView,
  );
  const out = real.filter((q) => !isDashQuad(q));
  for (const { id } of markedEdges(built)) {
    for (const b of boundaryFrames(built, id)) {
      const total = polylineLength(b.line);
      for (let s = DASH_GAP_M / 2; s + DASH_LENGTH_M < total; s += DASH_LENGTH_M + DASH_GAP_M) {
        const mid = s + DASH_LENGTH_M / 2;
        // …and the old walk suppressed what a zone solid covers exactly as the
        // new one does (`paintDashedLineExcluding` skips on the MIDPOINT, and
        // reverting the rhythm never touched that). Without this the relay
        // re-lays every dash a bus-lane seam silences, which is a DIFFERENT
        // mutation — one that adds paint — and it convicts itself through the
        // booking identity instead of through the stations this test is about.
        if (b.exclude.some((ex) => mid >= ex.from && mid <= ex.to)) continue;
        const f = pointAlong(b.line, mid);
        out.push(paintQuadTwin(f.point, f.tangent, DASH_LENGTH_M / 2, b.stroke / 2));
      }
    }
  }
  return out;
}

/**
 * One extra rectangle on an edge's drawn line, `alongM` × `acrossM`, centred
 * `s` along that line and `t` beside it — the mesh-level twin of one extra
 * `paintQuad` call. `idx0` is −1: nothing here splices it back into a buffer.
 */
function phantomQuad(
  built: Built,
  edgeId: string,
  at: { s: number; t: number; alongM: number; acrossM: number },
): MeshQuad {
  const { line } = drawnLine(built, edgeId);
  const f = pointAlong(line, at.s);
  return paintQuadTwin(
    add(f.point, mul(perpRight(f.tangent), at.t)),
    f.tangent,
    at.alongM / 2,
    at.acrossM / 2,
  );
}

/**
 * `paintQuad`'s own construction, in test space — a rectangle centred at `c`,
 * ±alongHalf along `dir` and ±acrossHalf across it, corners in the emission
 * order `readQuads` reads back (back-left, back-right, front-right, front-left).
 *
 * Every forgery below is built with it rather than by hand, so a phantom is
 * shaped the way the painter shapes real paint and a census that convicts one
 * is convicting it on WHAT IT IS and WHERE IT SITS — never on some tell in how
 * the test happened to assemble it. `idx0` is −1: nothing here splices a
 * phantom back into an index buffer.
 */
function paintQuadTwin(c: Vec2, dir: Vec2, alongHalf: number, acrossHalf: number): MeshQuad {
  const r = perpRight(dir);
  const corner = (a: number, b: number): Vec2 =>
    add(add(c, mul(dir, a * alongHalf)), mul(r, b * acrossHalf));
  return { corners: [corner(-1, -1), corner(-1, 1), corner(1, 1), corner(1, -1)], idx0: -1 };
}

/** A whole extra dashed line at offset `t`, walked at the fixed pitch. */
function phantomLine(built: Built, edgeId: string, t: number, alongM: number, acrossM: number): MeshQuad[] {
  const total = polylineLength(drawnLine(built, edgeId).line);
  const out: MeshQuad[] = [];
  for (let s = DASH_GAP_M / 2; s + alongM < total; s += alongM + DASH_GAP_M) {
    out.push(phantomQuad(built, edgeId, { s, t, alongM, acrossM }));
  }
  return out;
}

describe("the three checks a green wave deleted, and the paint each one lets through", () => {
  // These are not hypotheticals. Each mutation below was constructed by the
  // refuter that reopened this file, applied to markings.ts, and run: all 31
  // tests stayed GREEN on every one of them. They are reproduced here on the
  // mesh — which is where every assertion in this file reads anyway — so that
  // „this check is real" is itself a check, and so the next person to answer a
  // failing assertion by widening it has to delete a test that says why.

  it("the осева check convicts a dash TURNED across the road — 10° and 15°", () => {
    // A · the centroid hole. `|t| < 1e-6` on the quad CENTRE replaced `|t| <
    // 0.25` on every VERTEX, and a rectangle's centroid does not move when the
    // rectangle turns about it, so the assertion titled „ON THE AXIS, not
    // merely near it" could not fail at ANY angle — 10°, 15°, or 90°.
    const built = build(OV_LANE);
    const real = readQuads(built.markings.markings.indicesView, built.markings.markings.positionsView);
    const bound = dashChordOffsetM(drawnLine(built, "ov-ln-street").line) + CENTER_LINE_WIDTH_M / 2 + 1e-6;
    expect(bound).toBeCloseTo(0.3024, 4);

    for (const [deg, corner] of [
      [10, 0.685],
      [15, 0.892],
    ] as const) {
      const turned = dashesOn(built, "ov-ln-street", turnDashes(real, deg));
      // …invisible to everything the weakened test asserted: same 23 dashes,
      // same 5.000 m length, same 0.375 m stroke, centroids still on the axis
      // to 6e-15 m. Every one of these lines passes on the mutated mesh.
      expect(turned.length).toBe(23);
      for (const d of turned) {
        expect(Math.abs(d.t), `${deg}°`).toBeLessThan(1e-6);
        expect(d.across, `${deg}°`).toBeCloseTo(CENTER_LINE_WIDTH_M, 9);
      }
      // …and convicted the moment the corners are read. 0.685 m at 10° is
      // 3.7× the осева's own half-stroke: paint standing that far out of the
      // lane it divides is the defect a student would drive into.
      const worst = Math.max(...turned.map((d) => cornerSpread(d, 0)));
      expect(worst, `${deg}°`).toBeGreaterThan(bound);
      expect(worst, `${deg}°`).toBeCloseTo(corner, 2);
    }
  });

  it("the stub check convicts ONE invented 3 m dash", () => {
    // B · the shape hole. „A run too short for one whole dash stays unpainted"
    // was asserted as „there is no 5.000 m quad here", which is not what it
    // says: the natural way to break it is a painter that CENTRES A SHORTER
    // dash when the fixed walk fits none — 3.00 m because that is what fits,
    // from y = 2.50 to y = 5.50 down the middle of an 8 m stub. All 31 tests
    // were green with that осева painted.
    const built = build(STUB);
    const real = readQuads(built.markings.markings.indicesView, built.markings.markings.positionsView);
    const { line } = drawnLine(built, "stub-e");
    const invented = phantomQuad(built, "stub-e", {
      s: polylineLength(line) / 2,
      t: 0,
      alongM: 3,
      acrossM: CENTER_LINE_WIDTH_M,
    });
    const mutated = [...real, invented];

    // The assertion that was here says nothing at all about this paint…
    expect(dashesOn(built, "stub-e", mutated)).toEqual([]);
    // …while the paint is unmistakably there, 3.00 m of осева from s = 2.50 m
    // to s = 5.50 m of an edge whose whole drawn line is 6.40 m.
    const painted = quadsOnEdge(built, "stub-e", mutated).filter((q) => Math.abs(q.t) < 1);
    expect(painted.length).toBe(1);
    expect(painted[0]!.along).toBeCloseTo(3, 9);
    expect(painted[0]!.from).toBeCloseTo(2.5, 9);
    expect(painted[0]!.to).toBeCloseTo(5.5, 9);
    // …and the census convicts it as paint the painter had no licence to lay.
    expect(censusOnEdge(built, "stub-e", [0], mutated).other.length).toBe(1);
  });

  it("the census convicts a phantom boundary down the middle of the driver's own lane", () => {
    // C · the length hole. Every „no other paint" claim read `dashesOn`, so it
    // could only see 5.000 m quads. One extra dashed line at t = +4.06 m — the
    // `laneCenterRightM` both districts author, i.e. the centre of the lane the
    // student is being taught to hold — drawn in 4.00 m dashes was invisible to
    // all of them: 25 phantom dashes on ov-lane-v1 beside the 23 real ones,
    // markingQuads 103 → 128, 31/31 green.
    for (const [id, edgeId, boundaries] of [
      [OV_LANE, "ov-ln-street", [0]],
      [OV_KEEPRIGHT, "ov-kr-road", [-LANE_WIDTH_M, 0, LANE_WIDTH_M]],
    ] as const) {
      const built = build(id);
      const real = readQuads(built.markings.markings.indicesView, built.markings.markings.positionsView);
      const phantom = phantomLine(built, edgeId, 4.06, 4, DASH_WIDTH_M);
      expect(phantom.length, id).toBeGreaterThan(20);
      const mutated = [...real, ...phantom];

      // Not one of the 4 m dashes is a „dash" to the reader that was here…
      expect(dashesOn(built, edgeId, mutated).length, id).toBe(dashesOn(built, edgeId).length);
      // …and t = +4.06 m is inside boundary 0's half-lane band, so even a band
      // widened to catch it would have filed it under the осева rather than
      // reporting it. The census convicts on SHAPE AND PLACE together.
      expect(Math.abs(4.06 - 0)).toBeLessThan(LANE_WIDTH_M / 2);
      expect(censusOnEdge(built, edgeId, boundaries, mutated).other.length, id).toBe(phantom.length);
    }
    // The count the refuter reported on ov-lane-v1, pinned: 25 phantom dashes.
    const built = build(OV_LANE);
    expect(phantomLine(built, "ov-ln-street", 4.06, 4, DASH_WIDTH_M).length).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// 4. markingQuads counts the paint it emitted — including the Б1 М7 line
// ---------------------------------------------------------------------------

describe("WorldStats.markingQuads is a count, not an estimate", () => {
  // Every paintQuad is 2 triangles and every М18 give-way symbol is 1, so the
  // markings mesh satisfies  triangles === 2·markingQuads − giveWayTriangles
  // exactly — unless a pass emits geometry it does not book. It used to:
  // paintStopLine drew `n` dashes for a Б1 линия за изчакване and the caller
  // booked 1, so jxg-giveway-v1 reported 70 quads for the 82 it painted.
  const IDS = [JXG, TJ_EMERGE, SX, JX_EQUAL, TJ_OCCLUDED, OV_LANE, OV_KEEPRIGHT];

  for (const id of IDS) {
    it(`${id}: triangles === 2·markingQuads − giveWayTriangles`, () => {
      const built = build(id);
      const m = built.markings;
      expect(m.markings.triangleCount).toBe(2 * m.markingQuads - m.giveWayTriangles);
    });
  }

  it(`${JXG}: each Б1 approach books its whole dashed line, not one quad`, () => {
    // The give-way branch is the one that was mis-booked, so it gets its own
    // assertion rather than relying on the identity alone: four Б1 mouths add
    // 20 quads (4 × 4 М7 dashes + 4 М18 triangles), never 4 + 4.
    const district = load(JXG);
    const net = analyzeNetwork(district);
    const { stop, give } = priorityKeys(net);
    expect(give.size).toBeGreaterThan(0);
    const withSigns = buildMarkings(district, net, stop, give, []);
    const bare = buildMarkings(district, net, new Set(), new Set(), []);
    const added = withSigns.markingQuads - bare.markingQuads;
    expect(withSigns.stopLines).toBe(4);
    expect(withSigns.giveWayTriangles).toBe(4);
    // > one quad per line is the whole point; the exact figure pins the М7
    // dash count so a silently thinner line is caught too.
    expect(added).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// 5. THE DISTRICT-WIDE CENSUS — every district, every edge, every quad
// ---------------------------------------------------------------------------

/**
 * One quad the painter is licensed to lay at one EXACT rectangle of road — the
 * catalogue every marking except a lane dash is graded against.
 *
 * Lane paint is licensed by shape and band (a dash may sit anywhere along its
 * boundary, and where it sits is the subject of §2). NOTHING ELSE IS. A stop line
 * has one lawful position per approach, `cut + STOP_LINE_BEYOND_CUT_M`, because
 * runtime/stoplines.ts grades at that arclength and a driver who stops on paint
 * laid anywhere else is failed for stopping correctly. A zebra bar has one, or
 * the пешеходна пътека does not join the two kerbs it is there to join. An М1
 * strip and a zone solid each cover one segment of one rail. So all four name
 * their rectangle and the census matches paint against it rather than sorting it
 * into a bucket — which is also what lets one reading convict extra paint,
 * missing paint, doubled paint and right-shape-wrong-place at once.
 */
interface QuadLicence {
  /** The four corners it licenses, in `paintQuad`'s own emission order. */
  corners: [Vec2, Vec2, Vec2, Vec2];
  /** „М7bar@node:edge", „М8bar3@x-1", „М1@ov-ln-street+ seg 17" — what a failure
   *  has to name to be actionable. */
  what: string;
}

/**
 * A licence written as the RECTANGLE it covers rather than as a centre and two
 * lengths — and that is not a refactor, it is a hole this file already knows how
 * to describe.
 *
 * The М7 licence used to match `|centre − L.centre| < 1 µm` plus `along` plus
 * `across`. Every one of those three readings is INVARIANT UNDER ROTATION about
 * the quad's own centre: §3 proves it for dashes („a centroid is invariant under
 * rotation, so every lateral claim became unfalsifiable"), and a stop bar is the
 * same rectangle. Measured, on tj-emerge-v1's one authored bar turned 10° about
 * its own centre: the old licence matched it, `paintFindings` returned [], and a
 * 7.775 m М7 line standing 0.68 m out of square across a Б2 mouth was authored
 * paint as far as this file could tell — a driver stopping ON it stops askew of
 * the arclength `runtime/stoplines.ts` grades. Four corners cannot be rotated
 * without moving, so the licence is four corners.
 */
function licenceAt(
  what: string,
  c: Vec2,
  dir: Vec2,
  alongHalf: number,
  acrossHalf: number,
): QuadLicence {
  return { corners: paintQuadTwin(c, dir, alongHalf, acrossHalf).corners, what };
}

/**
 * Every М7 quad this district's junctions authorise, and no others.
 *
 * `paintStopLine`'s arithmetic restated: the same approach frame, the same
 * `inner`/`outer` span, the same 1.8 m dash pitch for the Б1 линия за изчакване.
 * The APPROACH SET is restated too, from the same `junctionPriorityControls`
 * call builders/props.ts makes — degree ≥ 3, incoming only, signalized or Б2
 * gets the solid bar, Б1 gets the dashed one. Which means the two равнозначни
 * maps produce an EMPTY catalogue, and any М7-shaped paint on them is an
 * offence by construction rather than by a counter's say-so.
 *
 * That distinction is the reason this exists. §1 already asserts
 * `stopLines === 0` on both равнозначни junctions — but `stopLines` is a
 * BOOKING, incremented next to the paint call and not derived from the mesh, so
 * it says only that the painter did not think it drew a line. Paint the bar and
 * forget the counter and the assertion still passes; §5 constructs exactly that
 * forgery („convicts an М7 bar painted where the law imposes no duty") and the
 * catalogue convicts it.
 */
function stopLineLicences(built: Built): QuadLicence[] {
  const { stop, give } = priorityKeys(built.net);
  const out: QuadLicence[] = [];
  for (const node of built.net.nodes.values()) {
    if (node.degree < 3) continue;
    for (const ap of node.approaches) {
      if (!ap.incoming) continue;
      const key = `${node.id}:${ap.edgeId}`;
      const solid = node.signalized || stop.has(key);
      const dashed = !solid && give.has(key);
      if (!solid && !dashed) continue;
      const away = ap.cutTangentAway;
      const lineDir = perpRight(away);
      const outer = ap.halfWidth - ap.parkingM - 0.2;
      const from = ap.edge.oneway ? -outer : 0.15; // `inner` = 0.15 m off the осева
      const base = add(ap.cut, mul(away, STOP_LINE_BEYOND_CUT_M));
      const span = outer - from;
      if (!dashed) {
        out.push(
          licenceAt(
            `М7bar@${key}`,
            add(base, mul(lineDir, -(from + outer) / 2)),
            lineDir,
            span / 2,
            STOP_LINE_WIDTH_M / 2,
          ),
        );
        continue;
      }
      const n = Math.max(2, Math.floor(span / 1.8));
      for (let i = 0; i < n; i++) {
        out.push(
          licenceAt(
            `М7dash${i}@${key}`,
            add(base, mul(lineDir, -(from + (span * (i + 0.5)) / n))),
            lineDir,
            0.5,
            STOP_LINE_WIDTH_M / 2,
          ),
        );
      }
    }
  }
  return out;
}

/**
 * Every М8 zebra bar this district's crossings authorise, and no others.
 *
 * `buildMarkings`' crossing loop and `paintZebra` restated together, because the
 * two only mean anything as a pair: the loop decides WHICH crossings paint
 * (`paintsZebra`, a host edge that exists, and a 25 m projection guard against a
 * map glitch), and the painter decides where each bar lands (the ±60° skew
 * clamp, the 1/cos span widening, the refuge island's kerbed gap, the staggered
 * half's walk along the street).
 *
 * ZEBRAS WERE THE SECOND-LARGEST GATE on this census — 20 districts attributed
 * to them, 16 of which have nothing else in the way — and the reason to restate
 * rather than import is the reason the rest of this file restates: a reader that
 * asks `paintZebra` where it put the bars agrees with it by construction. Every
 * number below is therefore written out, INCLUDING the 60° clamp, which is a
 * `const` markings.ts does not export. §6 already grades the clamp's behaviour
 * at 18° and 90°; this grades every shipped crossing against it, on 46 of them
 * in one district.
 */
function zebraLicences(built: Built): QuadLicence[] {
  const out: QuadLicence[] = [];
  for (const crossing of built.district.crossings) {
    if (!crossing.edgeId) continue;
    if (!paintsZebra(crossing)) continue;
    const eb = built.net.edgeById.get(crossing.edgeId);
    if (!eb) continue;
    const proj = projectOntoPolyline(eb.edge.geometry as Vec2[], [crossing.x, crossing.y]);
    if (proj.distance > 25) continue; // the painter's own data-glitch guard
    // ZEBRA_MAX_SKEW_DEG, written out: markings.ts keeps it module-private, and
    // a clamp restated here is a clamp that cannot be widened in silence.
    const skew = Math.max(-60, Math.min(60, crossing.skewDeg ?? 0));
    const islandHalfW = crossing.island ? crossing.island.widthM / 2 : 0;
    const stagger = crossing.staggerM ?? 0;
    const barDir = turn2d(proj.tangent, skew);
    const r = perpRight(barDir);
    const step = ZEBRA_STRIPE_ACROSS_M + ZEBRA_GAP_M;
    const span = (eb.halfWidth * 2 - 0.5) / Math.cos((skew * Math.PI) / 180);
    const count = Math.max(2, Math.floor(span / step));
    const start = -((count - 1) * step) / 2;
    let painted = 0;
    for (let i = 0; i < count; i++) {
      const off = start + i * step;
      // No bar on the refuge island's kerbed nose.
      if (islandHalfW > 0 && Math.abs(off) < islandHalfW + ZEBRA_STRIPE_ACROSS_M / 2) continue;
      const along = stagger !== 0 && off < 0 ? mul(proj.tangent, stagger) : ([0, 0] as Vec2);
      out.push(
        licenceAt(
          `М8bar${painted}@${crossing.id}`,
          add(add(proj.point, mul(r, off)), along),
          barDir,
          ZEBRA_LENGTH_M / 2,
          ZEBRA_STRIPE_ACROSS_M / 2,
        ),
      );
      painted++;
    }
  }
  return out;
}

/** `rotate` from markings.ts — a unit direction turned `deg` toward the road's
 *  right, with its own zero short-circuit so a 0° crossing is bit-identical. */
function turn2d(d: Vec2, deg: number): Vec2 {
  if (deg === 0) return d;
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [d[0] * c - d[1] * s, d[0] * s + d[1] * c];
}

/**
 * Every edge with a drawable line, marked class or not — `paintZoneSolids`' own
 * loop.
 *
 * The distinction matters and it is the painter's, not this file's: the lane-line
 * loop walks MARKED_CLASSES only, but the zone-solid pass walks every edge,
 * "a residential host authoring an М1 span paints no dashes yet must still show
 * the solid осева". A census restricted to marked edges reported that solid as
 * „paint on an unmarked edge", which is a false refusal on real, legally
 * required paint — and the reason `residential` maps with a В24 span could not
 * enter the domain.
 */
const drawableEdgesMemo = new WeakMap<Built, Array<{ id: string; line: Vec2[] }>>();

function drawableEdges(built: Built): Array<{ id: string; line: Vec2[] }> {
  return perBuilt(drawableEdgesMemo, built, () => drawableEdgesOf(built));
}

function drawableEdgesOf(built: Built): Array<{ id: string; line: Vec2[] }> {
  const out: Array<{ id: string; line: Vec2[] }> = [];
  for (const eb of built.net.edges) {
    if (!eb.line) continue;
    const line = trimPolyline(eb.line as Vec2[], 0.8, 0.8, 2.5);
    if (!line) continue;
    out.push({ id: eb.edge.id, line });
  }
  return out;
}

/** The edges buildMarkings actually walks: marked class, with a drawable line. */
function markedEdges(built: Built): Array<{ id: string; line: Vec2[] }> {
  return drawableEdges(built).filter((e) =>
    MARKED_CLASSES.has(built.net.edgeById.get(e.id)!.edge.class),
  );
}

/**
 * One authored lane boundary WITH THE LINE ITS DASHES ARE PAINTED ON — the
 * place half of the licence.
 *
 * `authoredBoundaries` gives the offsets, which is what the census classified
 * on and all it classified on: a quad of the right length at the right stroke
 * anywhere within half a lane of the offset counted as that boundary's dash.
 * That band is 4.06 m wide, and inside it a dash may be turned across the road,
 * shoved a metre into the oncoming lane, or re-spaced to the old broken rhythm
 * without the census saying a word. All three were run against this file before
 * this interface existed and all three were silent on all 50 districts.
 *
 * So the boundary carries its own painted line — `offsetPolyline(drawn, off)`,
 * the exact argument `paintDashedLine` receives — and with it the two things a
 * dash on that line has to satisfy:
 *  · `budget`: the most a straight 5 m dash's far corner may stand off it,
 *    `dashChordOffsetM` + half its own stroke, per `cornerOffsetFrom`;
 *  · `stations`: where each dash's centre must be, `fittedDashStations` of the
 *    OFFSET line's own length.
 *
 * That last word is the second correction here. The dash count used to be taken
 * from the CENTRELINE's length for every boundary, and an offset line on a bend
 * is not the same length: `d2-v1/e29435479.0` at −12.19 m runs 72.13 m against
 * its centreline's 75.04 m (6 dashes vs 5) and `district-v1/e904964434.0` at
 * −4.06 m runs 87.08 m against 86.47 m (7 vs 6). Neither is in the census
 * domain — the count was right on all 107 boundaries it grades, and is now
 * right for the reason rather than by luck.
 */
interface BoundaryFrame {
  off: number;
  /** `offsetPolyline(drawn, off)` — the line the painter walks. */
  line: Vec2[];
  stroke: number;
  budget: number;
  /** The fitted walk MINUS every station a zone solid covers. */
  stations: number[];
  /** Those covering spans, kept so a mutation that re-lays this boundary lays
   *  the same dashes the painter would — see `fixedPitchRelay`. */
  exclude: Array<{ from: number; to: number }>;
}

/**
 * …memoised per district, and taking the edge id ALONE.
 *
 * It used to take the drawn line as an argument, which every caller obtained the
 * same way — `trimPolyline(eb.line, 0.8, 0.8, 2.5)`, the painter's own trim — and
 * a parameter every caller computes identically is a chance for one of them to
 * compute it differently. It is derived here instead, from `drawnLine`, which is
 * that same trim written once.
 */
const boundaryFramesMemo = new WeakMap<Built, Map<string, BoundaryFrame[]>>();

function boundaryFrames(built: Built, edgeId: string): BoundaryFrame[] {
  const byEdge = perBuilt(boundaryFramesMemo, built, () => new Map<string, BoundaryFrame[]>());
  const hit = byEdge.get(edgeId);
  if (hit) return hit;
  const made = boundaryFramesOf(built, edgeId);
  byEdge.set(edgeId, made);
  return made;
}

function boundaryFramesOf(built: Built, edgeId: string): BoundaryFrame[] {
  const drawn = drawnLine(built, edgeId).line;
  const solids = authoredSolids(built, edgeId);
  return authoredBoundaryPlan(built, edgeId).map(({ k, off }) => {
    const line = off === 0 ? drawn : offsetPolyline(drawn, off);
    const stroke = dashStrokeAt(built, edgeId, off);
    // A zone solid on this boundary SUPPRESSES the dashes it covers — the
    // painter's `paintDashedLineExcluding`, which walks the same fitted
    // stations and skips every one whose midpoint falls inside a solid span.
    // Keyed by `k` and not by `off`, because that is what buildMarkings keys
    // its `suppress` map by: on an edge whose travel half is not exactly
    // lanes·W/2 the осева solid is laid at off 0 while the dash it silences is
    // boundary k = lanes/2, wherever that lands. Matching on `off` would agree
    // with the painter on every map in this corpus and disagree on the first
    // one where those two part company.
    const exclude = solids.filter((b) => b.k === k).flatMap((b) => b.segs);
    return {
      off,
      line,
      stroke,
      budget: dashChordOffsetM(line) + stroke / 2,
      stations: fittedDashStations(polylineLength(line)).filter(
        (s) => !exclude.some((ex) => s >= ex.from && s <= ex.to),
      ),
      exclude,
    };
  });
}

/**
 * One authored SOLID marking on one edge — `authoredSolidBoundaries` restated.
 *
 * ZONES WERE THE LARGEST GATE on this census: 25 districts attributed to them,
 * every one excluded for the same two reasons, both of which live here. A zone
 * ADDS paint the catalogue could not name (a continuous М1 осева over a В24 span,
 * every same-direction divider inside it, a bus or emergency-lane curb seam) and
 * it SUPPRESSES paint the catalogue insisted on (the dashes that solid covers),
 * so a zoned district failed the census in both directions at once.
 *
 * Restated rather than imported, as everything here is — and the restatement is
 * load-bearing in a way the М1 rails' is not, because these offsets are the ones
 * a grader has to agree with: `noOvertaking` paints EVERY divider inside its span
 * solid, not only the осева, because the detector it answers to grades a laneId
 * CHANGE and on a 2+2 boulevard that change crosses the divider at ±W. A zone
 * whose paint stopped at the centre line would post a ban on a road whose paint
 * invites the exact manoeuvre it grades — the founder's own verdict-board note.
 * Restating it here means the painter and this file have to be wrong the SAME way
 * for that to pass unnoticed.
 *
 * `k` is carried alongside `off` because the suppression above is keyed by it.
 */
interface AuthoredSolid {
  /** Dashed-boundary index this solid replaces, or −1 when it silences none. */
  k: number;
  off: number;
  width: number;
  /** Spans in the DRAWN line's own arclength, clamped to its extent. */
  segs: Array<{ from: number; to: number }>;
}

function authoredSolids(built: Built, edgeId: string): AuthoredSolid[] {
  const zones = built.district.zones ?? [];
  if (zones.length === 0) return [];
  const eb = built.net.edgeById.get(edgeId)!;
  const lineLen = polylineLength(drawnLine(built, edgeId).line);
  const s0 = eb.trimFrom + 0.8;
  const travelHalf = eb.halfWidth - eb.parkingM;
  const lanes = Math.max(1, eb.edge.lanes);
  const W = LANE_WIDTH_M;
  const out: AuthoredSolid[] = [];
  const addSeg = (k: number, off: number, width: number, fromM: number, toM: number): void => {
    const from = Math.max(0, Math.min(lineLen, fromM - s0));
    const to = Math.max(0, Math.min(lineLen, toM - s0));
    if (to - from <= 0.5) return; // span outside the drawn extent
    let b = out.find((x) => x.k === k && Math.abs(x.off - off) < 1e-6 && x.width === width);
    if (!b) out.push((b = { k, off, width, segs: [] }));
    b.segs.push({ from, to });
  };
  for (const z of zones) {
    if (z.edgeId !== edgeId) continue;
    if (!(Number.isFinite(z.fromM) && Number.isFinite(z.toM) && z.fromM < z.toM)) continue;
    if (z.kind === "solidCenterLine" || z.kind === "noOvertaking") {
      addSeg(lanes % 2 === 0 ? lanes / 2 : -1, 0, SOLID_CENTER_LINE_WIDTH_M, z.fromM, z.toM);
      if (z.kind === "noOvertaking") {
        for (let k = 1; k < lanes; k++) {
          const off = -travelHalf + k * W;
          if (Math.abs(off) < 1e-6) continue; // the осева, added above
          if (Math.abs(off) > travelHalf - 0.4) continue; // the dash loop's own skip
          addSeg(k, off, SOLID_LANE_DIVIDER_WIDTH_M, z.fromM, z.toM);
        }
      }
    } else if (z.kind === "busLane" || z.kind === "emergencyLane") {
      const emergency = z.kind === "emergencyLane";
      const seamW = emergency ? EMERGENCY_LANE_SEAM_WIDTH_M : BUS_LANE_SEAM_WIDTH_M;
      const lanesPerDir = eb.edge.oneway ? Math.max(1, lanes) : Math.max(1, Math.floor(lanes / 2));
      if (lanesPerDir < 2) continue; // no boundary between laneId 0 and 1 to seam
      const outerW = emergency && !EDGE_LINE_CLASSES.has(eb.edge.class) ? EDGE_LINE_WIDTH_M : 0;
      const outerOff = travelHalf - EDGE_LINE_INSET_M;
      if (eb.edge.oneway) {
        const k = lanesPerDir - 1;
        addSeg(k, -travelHalf + k * W, seamW, z.fromM, z.toM);
        if (outerW) addSeg(-1, outerOff, outerW, z.fromM, z.toM);
      } else {
        addSeg(lanes - 1, -travelHalf + (lanes - 1) * W, seamW, z.fromM, z.toM);
        addSeg(1, -travelHalf + W, seamW, z.fromM, z.toM);
        if (outerW) {
          addSeg(-1, outerOff, outerW, z.fromM, z.toM);
          addSeg(-1, -outerOff, outerW, z.fromM, z.toM);
        }
      }
    }
  }
  return out;
}

/**
 * Every quad `paintZoneSolids` is authorised to lay on this edge, each as the
 * exact rectangle of road it must cover — the М1 rail licence applied to the
 * zone pass, which sweeps the same ribbon with the same call.
 */
function zoneSolidLicences(built: Built, edgeId: string): QuadLicence[] {
  const drawn = drawnLine(built, edgeId).line;
  const lineLen = polylineLength(drawn);
  const out: QuadLicence[] = [];
  for (const b of authoredSolids(built, edgeId)) {
    for (let j = 0; j < b.segs.length; j++) {
      const seg = b.segs[j]!;
      const sub = trimPolyline(drawn, seg.from, lineLen - seg.to, 0.5);
      if (!sub) continue;
      const offSub = b.off === 0 ? sub : offsetPolyline(sub, b.off);
      // Named by boundary index, offset, stroke AND span, all four: an
      // emergency lane's inner seam and its outer carriageway line can land at
      // the same offset with the same 0.300 m stroke under different `k`, and a
      // finding that cannot tell two solids apart is a finding nobody can act
      // on. `addSeg` buckets on exactly this tuple, so the name is unique by the
      // same rule that made the bucket.
      out.push(
        ...ribbonLicences(
          offSub,
          b.width,
          `М1zone@${edgeId} k${b.k}/${b.off.toFixed(2)}m/${b.width.toFixed(3)}m span${j}`,
        ),
      );
    }
  }
  return out;
}

/**
 * One М1 edge-line strip the painter is authorised to lay, as the exact segment
 * of road it must cover.
 *
 * `paintSolidLine` sweeps a ribbon between consecutive vertices of the offset
 * line — corners `inner[i-1], outer[i-1], outer[i], inner[i]`, where the two
 * rails are that line offset by ∓ half the stroke — so a strip's licence is the
 * whole rectangle, written the painter's own way, and matching needs no
 * tolerance argument at all. Measured when the domain was 50: all 284 strips
 * matched a distinct licence to 0.000e+0 m, none unmatched, none doubled, none
 * unused. It is no longer a measurement kept in a comment — every licence in the
 * catalogue must be used EXACTLY once, on all 91 districts, so an unmatched, a
 * doubled and an unused strip are each a named finding.
 *
 * The census used to file a strip by shape and a lateral band of ±0.15 m, which
 * says nothing about where along the road it lies: slide one strip a metre down
 * its own rail and `across` is unchanged, `t` is unchanged, the count is
 * unchanged, and the district reports clean.
 *
 * And the shape half was itself a false-refusal waiting to happen. It asked
 * `|across − EDGE_LINE_WIDTH_M| < 1 mm`, but a strip's own width is
 * `EDGE_LINE_WIDTH_M · miter` at its joints — `offsetPolyline` divides by
 * cos(half turn), clamped at 2.5× — so 76 of ov-lane-v1's 80 perfectly good
 * strips are WIDER than 0.300 m, and on a sharper joint than anything in this
 * corpus a real strip would have been convicted of being unlicensed paint. The
 * licence carries the miter because it is built by the same call, so the
 * question „how wide may a strip be here" is not asked and cannot be answered
 * wrongly.
 */
/** `paintSolidLine`'s own sweep: one quad per vertex pair of `line`, between the
 *  two rails ∓ half a stroke away. Both the М1 edge lines and the zone solids
 *  are drawn by that one call, so both are licensed by this one restatement. */
function ribbonLicences(line: Vec2[], width: number, what: string): QuadLicence[] {
  if (line.length < 2) return [];
  const outer = offsetPolyline(line, width / 2);
  const inner = offsetPolyline(line, -width / 2);
  const out: QuadLicence[] = [];
  for (let i = 1; i < line.length; i++) {
    out.push({
      corners: [inner[i - 1]!, outer[i - 1]!, outer[i]!, inner[i]!],
      what: `${what} seg ${i}`,
    });
  }
  return out;
}

function edgeLineLicences(built: Built, edgeId: string): QuadLicence[] {
  const drawn = drawnLine(built, edgeId).line;
  if (!paintsEdgeLines(built, edgeId)) return [];
  const off = edgeLineOffset(built, edgeId);
  const out: QuadLicence[] = [];
  for (const side of [-1, 1] as const) {
    out.push(
      ...ribbonLicences(
        offsetPolyline(drawn, side * off),
        EDGE_LINE_WIDTH_M,
        `М1@${edgeId}${side > 0 ? "+" : "-"}`,
      ),
    );
  }
  return out;
}

/** Does this quad cover exactly the rectangle `L` licenses? */
function coversLicence(q: MeshQuad, L: QuadLicence): boolean {
  for (let i = 0; i < 4; i++) {
    const a = q.corners[i]!;
    const b = L.corners[i]!;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-9) return false;
  }
  return true;
}

/**
 * The licence list, bucketed by the metre-square its first corner falls in.
 *
 * Asking every quad against every licence is O(n²) in a district's own paint,
 * and the domain this lane widens to carries maps with 500+ of each: the census
 * over the corpus went from 10,690 quads against 50 districts' licences to
 * 10,690 against 105 districts' licences, and the honest way to pay for that is
 * an index rather than a smaller domain.
 *
 * A 1 m cell with a 3×3 probe, not an exact-key hash: the licence and the paint
 * are computed by the same arithmetic and today agree bit for bit, but a check
 * that DEPENDS on bit-identity turns any harmless re-association in math2d into
 * „the world stopped painting its edge lines" — a false refusal, which is the
 * failure direction this project spends its time on. The 1 µm tolerance
 * `coversLicence` applies is what decides; the index only narrows the candidates.
 */
function licenceIndex(list: readonly QuadLicence[]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!.corners[0];
    const key = `${Math.round(p[0])}|${Math.round(p[1])}`;
    const bucket = m.get(key);
    if (bucket) bucket.push(i);
    else m.set(key, [i]);
  }
  return m;
}

/**
 * The licence this quad covers, or −1.
 *
 * An UNUSED licence is preferred over a used one, which matters exactly where
 * two authored spans overlap: two zones of the same kind over the same stretch
 * paint the ribbon twice and are licensed twice, and a matcher that always
 * returned the first hit would book both quads against one licence and then
 * report the other as never painted. Real paint convicted for being real is the
 * failure this file exists to prevent; it costs one boolean.
 */
function matchLicence(
  list: readonly QuadLicence[],
  index: Map<string, number[]>,
  used: readonly number[],
  q: MeshQuad,
): number {
  const cx = Math.round(q.corners[0][0]);
  const cy = Math.round(q.corners[0][1]);
  let fallback = -1;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = index.get(`${cx + dx}|${cy + dy}`);
      if (!bucket) continue;
      for (const i of bucket) {
        if (!coversLicence(q, list[i]!)) continue;
        if (used[i] === 0) return i;
        if (fallback < 0) fallback = i;
      }
    }
  }
  return fallback;
}

/**
 * EVERY exactly-placed quad one district is authorised to paint, with the index
 * that finds them — the four catalogues in one list, built once per district.
 *
 * Assembled here rather than inside `districtCensus` because the census is called
 * once per district for the real mesh and again for every forgery, and the
 * licence list depends on the DISTRICT, never on the quads handed in. The list is
 * shared and must be treated as frozen: `used` is a parallel array the caller
 * owns, so two censuses of the same district cannot see each other's tallies.
 */
const districtLicencesMemo = new WeakMap<
  Built,
  { licences: QuadLicence[]; index: Map<string, number[]> }
>();

function districtLicences(built: Built): {
  licences: QuadLicence[];
  index: Map<string, number[]>;
} {
  return perBuilt(districtLicencesMemo, built, () => {
    const licences: QuadLicence[] = [...stopLineLicences(built), ...zebraLicences(built)];
    for (const { id } of markedEdges(built)) licences.push(...edgeLineLicences(built, id));
    // …and the zone solids, off EVERY drawable edge rather than every marked
    // one: `paintZoneSolids` has no MARKED_CLASSES gate, because a residential
    // host authoring an М1 span paints no dashes and must still show the solid
    // осева.
    for (const { id } of drawableEdges(built)) licences.push(...zoneSolidLicences(built, id));
    return { licences, index: licenceIndex(licences) };
  });
}

/** A quad no licence covers, described well enough to find it on the road. */
interface PaintOffence {
  /** The edge whose frame owns it, or null when NO edge's frame does. */
  edgeId: string | null;
  along: number;
  across: number;
  /** Lateral offset in the owner's frame, NaN when unowned. */
  t: number;
  why: string;
}

/** One dash the census filed under a boundary, with WHERE it actually is. */
interface DashSighting {
  /** Its centre's arclength along that boundary's own painted line, m. */
  s: number;
  /** Its furthest corner's distance from that line, m — `cornerOffsetFrom`. */
  corner: number;
}

interface DistrictPaintCensus {
  /** Quads read out of the mesh — triangles are not quads and are excluded. */
  quads: number;
  /** edgeId → boundary offset → the dashes found there, each with its place. */
  dashes: Map<string, Map<number, DashSighting[]>>;
  /** Every exactly-placed quad this district is authorised to paint: М7 bars and
   *  Б1 dashes, М8 zebra bars, М1 edge-line strips, zone-solid ribbon strips. */
  licences: QuadLicence[];
  /** How many quads matched each licence, in `licences` order. */
  used: number[];
  offences: PaintOffence[];
}

/**
 * EVERY quad in a district's markings mesh, classified — the instrument this
 * lane exists to build.
 *
 * `censusOnEdge` above does the same job for ONE named edge, and that is
 * precisely how far it reaches. Its refuter added a dashed line at
 * t = +4.06 m — `laneCenterRightM`, the centre of the lane the student is being
 * taught to hold — in 4.00 m dashes to every edge of every district, SUPPRESSED
 * only on `ov-ln-street` and `ov-kr-road`, the two edges any test here names.
 * Measured on this file as it stood, 34/34 GREEN, exit 0:
 *
 *   jx-equal-v1    markingQuads  40 →  76   (+9 on each of four arms)
 *   sx-v1                        42 →  73   (+7 +5 +12 +7)
 *   tj-emerge-v1                 32 →  60   (+11 +11 +6)
 *   tj-occluded-v1               32 →  61   (+10 +10 +9)
 *   jxg-giveway-v1               82 → 131   (+8 +8 +5 +7 +7 +7 +7)
 *                                            = 173 phantom quads
 *
 * A false lane boundary down the middle of the driver's own lane on every
 * junction approach in the battery, invisible to all 34 tests. The identity in
 * §4 does not see it either — `triangles === 2·markingQuads − giveWayTriangles`
 * holds because `paintDashedLine` books its quads honestly. BOOKING IS NOT
 * PAINT TRUTH, and that sentence is the whole reason for this function.
 *
 * So: no edge is named. The census walks the MESH, and every quad must be one
 * of exactly two authored things —
 *   · a quad covering, corner for corner, one entry of this district's LICENCE
 *     LIST: an М7 bar or Б1 wait-line dash (`stopLineLicences`), an М8 zebra bar
 *     (`zebraLicences`), an М1 edge-line strip (`edgeLineLicences`), or a
 *     zone-authored solid ribbon strip (`zoneSolidLicences`). Each licence names
 *     ONE rectangle of road and must be covered exactly once, so this axis
 *     convicts extra paint, missing paint, doubled paint and paint of the right
 *     shape in the wrong place with the same reading;
 *   · a DASH on a boundary `authoredBoundaries` derives, at the stroke T16
 *     gives that boundary, within half a lane of it — and then recorded WHERE
 *     on that boundary's own line it stands (`DashSighting`), which is what
 *     `paintFindings` grades. A dash is deliberately NOT exactly licensed: its
 *     band is half a lane wide so a dash nudged off its line is convicted BY
 *     NAME on the boundary it belongs to rather than vanishing into `offences`.
 * — and anything else is an offence, INCLUDING a quad no edge's frame will own
 * (`quadsOnEdge` silently drops those; a census that drops what it cannot
 * explain is not a census).
 *
 * THE SHAPE AXIS AND THE PLACE AXIS ARE DIFFERENT AXES, and this function used
 * to close only the first. Every classification above was a shape test plus a
 * band: right length, right stroke, within half a lane. Half a lane is 4.06 m.
 * Three forgeries were run against the finished census and all three were
 * silent on every district it grades:
 *   · every dash on jx-equal-v1, sx-v1, tj-emerge-v1, tj-occluded-v1 and
 *     jxg-giveway-v1 TURNED 10° across the road — findings [] on all five;
 *   · every dash SHOVED 0.5 m sideways off its boundary — findings [] again;
 *   · every dash in the whole 50-district domain RE-LAID at the old
 *     fixed-pitch stations, the one regression this file has ever caught in
 *     markings.ts — 50 silent, 0 convicted.
 * The first two are the phantom this lane was opened by, wearing the right
 * shape; the third is a defect that shipped once already. A boundary now
 * carries the line its dashes must stand on and the stations they must stand
 * at (`BoundaryFrame`), every solid carries the rectangle it must cover
 * (`QuadLicence`), and both are graded in `paintFindings`.
 *
 * AND THE CATALOGUE NOW NAMES ZONE SOLIDS AND ZEBRA BARS, which is what took the
 * census from 50 districts to 91. Those two gates held 41 of the 55 excluded
 * maps, and neither exclusion was ever about whether that paint was RIGHT — a
 * zoned map both added paint no licence covered and suppressed dashes the count
 * insisted on, and a zebra map painted 6.00 m bars the reader could only file as
 * unexplained. Both are restated above from the painter's own arithmetic, so a
 * В24 span whose осева stayed dashed, a bus-lane seam that moved, or a crossing
 * whose bars drifted off the kerb is now convicted on 41 more districts.
 *
 * Ownership is per-QUAD and unanimous: all four corners must resolve to the
 * same edge. A quad straddling two edges is not that edge's paint and is not
 * the other's either — it is reported, not split.
 */
function districtCensus(built: Built, quads?: MeshQuad[]): DistrictPaintCensus {
  const frames = edgeFrames(built);
  const src =
    quads ?? readQuads(built.markings.markings.indicesView, built.markings.markings.positionsView);
  const marked = new Map(markedEdges(built).map((e) => [e.id, e]));
  const dashes = new Map<string, Map<number, DashSighting[]>>();
  /** Each marked edge's boundary lines, built once. */
  const places = new Map<string, BoundaryFrame[]>();
  for (const [id] of marked) {
    const bounds = boundaryFrames(built, id);
    dashes.set(id, new Map(bounds.map((b) => [b.off, [] as DashSighting[]])));
    places.set(id, bounds);
  }
  const { licences, index } = districtLicences(built);
  const used = new Array<number>(licences.length).fill(0);
  const offences: PaintOffence[] = [];

  for (const q of src) {
    const centre: Vec2 = [
      (q.corners[0][0] + q.corners[1][0] + q.corners[2][0] + q.corners[3][0]) / 4,
      (q.corners[0][1] + q.corners[1][1] + q.corners[2][1] + q.corners[3][1]) / 4,
    ];
    const along = Math.hypot(q.corners[3][0] - q.corners[0][0], q.corners[3][1] - q.corners[0][1]);
    const across = Math.hypot(q.corners[1][0] - q.corners[0][0], q.corners[1][1] - q.corners[0][1]);

    // 1 — an exactly-placed quad, matched against the rectangle of road its
    // licence names. Taken first for two reasons: a stop bar and a zebra bar sit
    // over an edge's own frame and would otherwise read as unexplained paint on
    // that edge, and a strip's own width is EDGE_LINE_WIDTH_M · miter, so a joint
    // with miter 1.25 draws a 0.375 m strip — the осева's stroke exactly — which
    // a reader asking the dash question first could file as a centre-line dash.
    // Nothing in this corpus does that today; the order costs nothing and closes
    // the trap rather than noting it.
    const hit = matchLicence(licences, index, used, q);
    if (hit >= 0) {
      used[hit]!++;
      continue;
    }

    // 2 — otherwise it is one edge's paint, or it is nobody's. Each corner's
    // owner is the edge nearest IT; unanimity makes the quad that edge's.
    const owners = q.corners.map((p) => ownerOf(frames, p));
    const first = owners[0];
    const ownerId =
      first && owners.every((o) => o !== null && o.id === first.id) ? first.id : null;
    if (ownerId === null) {
      offences.push({ edgeId: null, along, across, t: NaN, why: "no edge owns all four corners" });
      continue;
    }
    const mine = frames.find((f) => f.id === ownerId)!;
    const t = frameOn(mine, centre[0], centre[1])!.t;
    if (!marked.has(ownerId)) {
      offences.push({ edgeId: ownerId, along, across, t, why: "paint on an unmarked edge" });
      continue;
    }
    const home = places.get(ownerId)!.find(
      (b) =>
        Math.abs(along - DASH_LENGTH_M) < 1e-3 &&
        Math.abs(across - b.stroke) < 1e-9 &&
        Math.abs(t - b.off) < LANE_WIDTH_M / 2,
    );
    if (home === undefined) {
      offences.push({ edgeId: ownerId, along, across, t, why: "no licence for this paint" });
      continue;
    }
    // Filed under the boundary — and then MEASURED against it. The band above
    // is 4.06 m wide on purpose (a dash nudged off its line must land in a
    // boundary's bucket and be convicted there by name, not vanish into
    // `offences` where the diagnosis is vaguer); these two numbers are what
    // convict it.
    dashes
      .get(ownerId)!
      .get(home.off)!
      .push({
        s: projectOntoPolyline(home.line, centre).s,
        corner: cornerOffsetFrom(q.corners, home.line),
      });
  }
  return { quads: src.length, dashes, licences, used, offences };
}

/**
 * Everything the census can convict a district of, as one list of readable
 * findings — empty exactly when the district paints what it was authored to
 * paint and nothing else.
 *
 * Folded into one list rather than a dozen assertions on purpose: it is asserted
 * with `toEqual([])`, so a failure PRINTS the offence instead of printing
 * „expected 24 to be 23" for a number the reader then has to go and find.
 *
 * It convicts in BOTH directions, which is this project's standing rule and the
 * reason a phantom-hunting census cannot be written as a phantom-hunting census
 * alone: „no unauthored paint" answered on its own is one loosened threshold
 * away from acquitting everything, so every authored thing is COUNTED too —
 * dashes against the fixed-pitch walk, strips against their own rail licences,
 * and each М7 licence against exactly one quad. Paint that vanishes is as loud
 * here as paint that appears.
 *
 * And on THREE axes rather than one, which is what this lane added. A count
 * answers „is the right amount of paint here"; it cannot answer „is it in the
 * right place", and the census that only counted was measured silent on every
 * dash in the domain turned 10°, on every dash shoved 0.5 m sideways, and on
 * the whole domain re-laid at the old broken rhythm. Each boundary is now
 * graded on:
 *   COUNT ..... `fittedDashStations`' length — one finding, as before;
 *   STATION ... each dash's arclength on that boundary's own line, against the
 *               walk. Reported only when the count agrees, because when it does
 *               not the count line already names the defect and every station
 *               after the hole is a consequence of it, not a second fact;
 *   LATERAL ... each dash's furthest corner off that line, against the sagitta
 *               its own bend forces plus half its own stroke.
 * Strips are graded on the segment each one covers (`edgeLineLicences`) and
 * counted off the same list. The two of those that fire on real paint today:
 * none, on any of the 105 districts.
 */
function paintFindings(built: Built, census = districtCensus(built)): string[] {
  const out: string[] = [];
  const booked = built.markings.markingQuads - built.markings.giveWayTriangles;
  if (census.quads !== booked) {
    out.push(`mesh holds ${census.quads} quads, markingQuads books ${booked}`);
  }
  for (const o of census.offences) {
    out.push(
      `${o.why}: ${o.along.toFixed(3)} × ${o.across.toFixed(3)} m on ${o.edgeId ?? "no edge"}` +
        (Number.isNaN(o.t) ? "" : ` at t = ${o.t.toFixed(3)} m`),
    );
  }
  for (const { id } of markedEdges(built)) {
    for (const b of boundaryFrames(built, id)) {
      const seen = census.dashes.get(id)!.get(b.off)!;
      const where = `${id}: boundary at ${b.off.toFixed(2)} m`;
      if (seen.length !== b.stations.length) {
        out.push(`${where} carries ${seen.length} dashes, not ${b.stations.length}`);
      } else {
        // The PLACE axis, and the reason a count is not enough: the fitted
        // rhythm fits the SAME n dashes the old fixed-pitch walk did, so
        // reverting it moves every dash on every arm and changes no count
        // anywhere. Reported once per boundary — a slipped rhythm moves the
        // whole line, and 23 copies of one fact is not 23 findings.
        const stations = seen.map((d) => d.s).sort((x, y) => x - y);
        for (let i = 0; i < stations.length; i++) {
          if (Math.abs(stations[i]! - b.stations[i]!) > 1e-6) {
            out.push(
              `${where} has dash ${i + 1} at s = ${stations[i]!.toFixed(3)} m, not the ` +
                `${b.stations[i]!.toFixed(3)} m the rhythm fits`,
            );
            break;
          }
        }
      }
      // …and the LATERAL half of place, which no count and no station can see:
      // a dash turned across the road keeps its length, its stroke, its
      // centroid and its station, and stands 0.685 m into the lane it divides
      // at 10°. Budget = the chord's sagitta on this boundary's own line plus
      // half the dash's stroke, +1 µm — measured tight, worst real dash in the
      // domain sits at exactly 1.0000× it.
      const strays = seen.filter((d) => d.corner > b.budget + 1e-6);
      if (strays.length) {
        const worst = Math.max(...strays.map((d) => d.corner));
        out.push(
          `${where} has ${strays.length} of ${seen.length} dashes off it, worst corner ` +
            `${worst.toFixed(3)} m against the ${b.budget.toFixed(3)} m it allows`,
        );
      }
    }
  }
  // Every exactly-placed quad, counted against the ONE rectangle it is licensed
  // for. This replaces a per-edge strip COUNT („79 М1 strips, not 80"), and the
  // difference is not cosmetic: a count says how much paint is on the edge and
  // cannot say WHICH segment lost it, so a missing strip and a strip slid one
  // metre along its own rail produced the same sentence. One line per licence
  // names the segment, and it convicts a doubled quad — which no count of
  // matches against a licence list could ever report as wrong.
  for (let i = 0; i < census.licences.length; i++) {
    if (census.used[i] !== 1) {
      out.push(`${census.licences[i]!.what}: ${census.used[i]} quads painted for it, not 1`);
    }
  }
  return out;
}

/**
 * The districts whose ENTIRE paint the catalogue above can account for, built
 * once and shared.
 *
 * The gate is read off the painter's OWN counters, not off the JSON: a district
 * is in the domain when buildMarkings reports no parking bay, no lane arrow and
 * no speed numeral, and the network flags no roundabout edge. Asking the result
 * rather than the source is what stops the domain from drifting when a map grows
 * a feature: the district simply leaves the domain and says so.
 *
 * 91 districts of 105 — and
 * 4,367 of the corpus's 10,690 marking quads — 40.85%, which is the number that
 * matters, because a district is not a unit of paint. This block was titled
 * „every quad the world paints is a quad the world was authored to paint" while
 * it graded one quad in 6.7. It is now titled what it does, and the fraction is
 * MEASURED OFF THE MESH — „the catalogue's reach is measured, not claimed in a
 * comment", below — so the title cannot drift back into a claim: extend the
 * catalogue and that test fails until these numbers are corrected, here and in
 * the file header both. It is read off the mesh and not off `markingQuads`
 * because `markingQuads` books each give-way triangle as a quad; taking the
 * share off the counter reported 14.8% for a true 14.96% when the domain was 50.
 *
 * The other 14 are excluded by paint this catalogue cannot yet name, and by
 * NOTHING about whether their paint is right. Measured today, each district
 * attributed to the first gate that stops it — the order the code below asks in:
 *    3  lane-intent arrows      (paintLaneArrows' glyphs)
 *    6  a painted „30"/„20"     (paintSpeedGlyphs' seven-segment numerals)
 *    5  a roundabout edge       (the ring's own paint, not yet restated)
 *    0  a parking bay
 * The two gates that used to hold 41 of the 55 — an authored zone and a zebra
 * crossing — are gone: `zoneSolidLicences` and `zebraLicences` restate both, and
 * the dash suppression a zone imposes is restated in `boundaryFrames`. What is
 * left is the honest limit of this lane: a phantom laid only on a numeral map or
 * a roundabout is still invisible, and closing it needs the catalogue extended
 * to the numerals, the arrow glyphs and the ring — in that order, since the
 * numerals are 6 of the 14 and the arrows are the smallest restatement. Named
 * here, and asserted below, so the next wave can route it rather than
 * rediscover it.
 *
 * And the gate is itself guarded: a change that quietly emptied the domain would
 * make every claim in §5 vacuous, so the domain's size, its membership and its
 * share of the corpus's paint are all asserted.
 */
type CensusExclusion = "parkingBay" | "laneArrow" | "speedGlyph" | "roundabout";

/** Every district in the corpus, built once, each tagged with what (if anything)
 *  puts it outside the catalogue's reach. */
const censusCorpus = (() => {
  let cache: Array<{ id: string; built: Built; outside: CensusExclusion | null }> | null = null;
  return (): Array<{ id: string; built: Built; outside: CensusExclusion | null }> => {
    if (cache) return cache;
    const out: Array<{ id: string; built: Built; outside: CensusExclusion | null }> = [];
    for (const f of fs.readdirSync(WORLD_DIR!).filter((n) => n.endsWith(".json"))) {
      const id = f.replace(/\.json$/, "");
      const built = build(id);
      const m = built.markings;
      const outside: CensusExclusion | null = m.parkingBays
        ? "parkingBay"
        : m.laneArrowQuads
          ? "laneArrow"
          : m.speedGlyphQuads
            ? "speedGlyph"
            : built.net.roundaboutEdgeIds.size
              ? "roundabout"
              : null;
      out.push({ id, built, outside });
    }
    cache = out;
    return out;
  };
})();

/** The districts whose ENTIRE paint the catalogue can account for. */
function censusDomain(): Array<{ id: string; built: Built }> {
  return censusCorpus().filter((d) => d.outside === null);
}

describe("every quad these 91 districts paint is a quad they were authored to paint", () => {
  /**
   * The corpus, built ONCE for the whole block.
   *
   * `censusCorpus` memoises its sweep and `build()` now memoises each district,
   * so no assertion here ever rebuilds one another has already built — 156
   * `build()` calls over 105 DISTINCT districts across the whole file, of which
   * 51 used to be a second read off the disk and are now a Map lookup. What a
   * memo cannot decide is WHICH test pays for the first sweep, and the answer
   * was „whichever one happens to run first" — which left a 105-district corpus
   * build inside some unrelated assertion's 5 s default timeout.
   *
   * That is not hypothetical. On this box — 7200 rpm HDD, 16 GB, other work
   * running — that first call was measured at 19.4 s, 40.9 s and 65.8 s on
   * three separate runs, against 0.23 s on a run where the page cache still
   * held the corpus. A 280× spread, and all of it disk: only 80 ms of the
   * file's 607 ms of build time is analyzeNetwork + buildMarkings, the other
   * 527 ms is `load()` reading and parsing JSON. Hoisting it here gives that
   * cost one explicit budget and leaves every `it` below on the 5 s default,
   * where 5 s is still a real ceiling on that assertion's OWN work.
   *
   * The budget is generous and it is still finite, which is the point: the
   * failure a timeout exists to catch here is UNBOUNDED — §6 documents an
   * unclamped zebra widening that asks for ~1.9e17 bars and never returns —
   * so 180 s catches that exactly as well as 5 s did, while 5 s also caught a
   * cold disk and called it a defect. A suite that goes red on a cold cache
   * teaches everyone to re-run until it is green, which is how a real red
   * gets ignored.
   */
  beforeAll(() => {
    censusCorpus();
  }, 180_000);

  const BATTERY = [OV_LANE, OV_KEEPRIGHT, TJ_EMERGE, TJ_OCCLUDED, JX_EQUAL, SX, JXG];
  /** The five with no edge any test here names — where the phantom lived. */
  const UNNAMED: Array<[string, number]> = [
    [TJ_EMERGE, 28],
    [TJ_OCCLUDED, 29],
    [JX_EQUAL, 36],
    [SX, 31],
    [JXG, 49],
  ];

  for (const id of BATTERY) {
    it(`${id}: every quad accounted for, on every edge`, () => {
      const built = build(id);
      expect(paintFindings(built), id).toEqual([]);
      // …and the census SAW paint rather than classifying an empty mesh: a
      // census with nothing in it convicts nothing and passes.
      const census = districtCensus(built);
      expect(census.quads, id).toBe(built.markings.markingQuads - built.markings.giveWayTriangles);
      expect(census.quads, id).toBeGreaterThan(0);
      expect([...census.dashes.values()].some((m) => [...m.values()].some((d) => d.length > 0)), id).toBe(
        true,
      );
    });
  }

  it("…and so does every district whose paint this catalogue covers", () => {
    // THE FALSE-REFUSAL DIRECTION, at corpus scale. A census that convicts
    // unauthored paint is one bad threshold from convicting the real world, and
    // the founder has already been failed by an engine for a manoeuvre he
    // performed correctly. So it is not enough that the seven districts behind
    // the findings pass: every district the catalogue can speak for must, and
    // all 91 do — including the 41 this lane admitted, which is the direction a
    // widening fails in. A catalogue that named zone solids and zebra bars
    // WRONGLY would convict 41 maps of paint they were authored to carry, and
    // this is the assertion that would say so.
    const domain = censusDomain();
    for (const { id, built } of domain) expect(paintFindings(built), id).toEqual([]);
    // …over real paint, not over 91 empty meshes. 4,367 quads today, counted off
    // the MESH and not off `markingQuads`: the booking reads 4,381 because it
    // books each of the domain's 14 give-way triangles as a quad, and this file
    // exists to know the difference.
    const painted = domain.reduce(
      (n, d) =>
        n +
        readQuads(d.built.markings.markings.indicesView, d.built.markings.markings.positionsView)
          .length,
      0,
    );
    expect(painted).toBeGreaterThan(4000);
  });

  it("the domain gate is neither empty nor a loophole", () => {
    // If the gate silently stopped selecting districts, every claim above would
    // pass over nothing. It selects 91 of the corpus's 105 today; the floor is
    // set below that so a map growing a painted numeral does not fail this, and
    // far above zero so a gate that broke does.
    const domain = censusDomain();
    expect(domain.length).toBeGreaterThan(80);
    expect(domain.length).toBeLessThanOrEqual(
      fs.readdirSync(WORLD_DIR!).filter((n) => n.endsWith(".json")).length,
    );
    // …and it still covers all seven districts the audit's findings named. This
    // is the assertion that stops the domain becoming a place to hide a failing
    // map: excluding one of these would have to be done in the open.
    const ids = new Set(domain.map((d) => d.id));
    for (const id of BATTERY) expect(ids.has(id), id).toBe(true);
  });

  it("convicts the phantom boundary on every district — not only on the two named edges", () => {
    // THE MUTATION THIS LANE WAS OPENED BY, reproduced on the mesh. One extra
    // dashed line at t = +4.06 m in 4.00 m dashes on every edge of the five
    // districts that have no edge any test here inspects by name. Against this
    // file before §5 existed: 34/34 green, exit 0, 173 phantom quads.
    let total = 0;
    for (const [id, phantoms] of UNNAMED) {
      const built = build(id);
      // Clean before, so the conviction below is the phantom and not the map.
      expect(paintFindings(built), id).toEqual([]);
      const real = readQuads(
        built.markings.markings.indicesView,
        built.markings.markings.positionsView,
      );
      const phantom = markedEdges(built).flatMap((e) =>
        phantomLine(built, e.id, 4.06, 4, DASH_WIDTH_M),
      );
      expect(phantom.length, id).toBe(phantoms);
      total += phantom.length;

      const census = districtCensus(built, [...real, ...phantom]);
      // Convicted on the LICENCE — asserted on `census.offences` and not on
      // `paintFindings`, deliberately. The source mutation books every quad it
      // draws, so §4's identity is silent on it and the conviction has to come
      // from the paint; this mesh twin does not book at all, so `paintFindings`
      // would also report the booking gap and the assertion would no longer show
      // which of the two caught it. It is the licence.
      expect(census.offences.length, id).toBe(phantoms);
      for (const o of census.offences) {
        expect(o.why, id).toBe("no licence for this paint");
        expect(o.along, id).toBeCloseTo(4, 9);
      }
      // …and the reader that could not see it still cannot, so this is a new
      // check and not the old one rephrased: not one 4.00 m quad is a „dash".
      for (const e of markedEdges(built)) {
        expect(dashesOn(built, e.id, [...real, ...phantom]).length, `${id}/${e.id}`).toBe(
          dashesOn(built, e.id).length,
        );
      }
    }
    expect(total).toBe(173);
  });

  it("convicts a phantom on EVERY district in the domain, not just the battery", () => {
    // The same forgery, everywhere the catalogue reaches — 50 of 50 today, and
    // every phantom quad convicted on every one of them.
    //
    // The two counts are separated on purpose. A district whose drawn lines fit
    // no 4 m dash receives no phantom, and it is evidence of nothing: counting
    // it as a pass would let this test decay into a test of nothing if the
    // corpus ever filled with stubs. So `probed` carries the reach (asserted to
    // be most of the domain) and `convicted` carries the verdict (asserted to be
    // ALL of what was reached, not most of it).
    let probed = 0;
    let convicted = 0;
    for (const { id, built } of censusDomain()) {
      const real = readQuads(
        built.markings.markings.indicesView,
        built.markings.markings.positionsView,
      );
      const phantom = markedEdges(built).flatMap((e) =>
        phantomLine(built, e.id, 4.06, 4, DASH_WIDTH_M),
      );
      if (phantom.length === 0) continue;
      probed++;
      if (districtCensus(built, [...real, ...phantom]).offences.length === phantom.length) {
        convicted++;
      } else {
        expect.fail(`${id}: ${phantom.length} phantom quads, not all convicted`);
      }
    }
    expect(probed).toBeGreaterThan(80);
    expect(convicted).toBe(probed);
  });

  it("convicts one EXTRA dash on a boundary that is real", () => {
    // The hole an offence bucket alone cannot see, and the reason the census
    // counts what it classifies. This phantom is not misshapen and not
    // misplaced: 5.000 m at the осева's own 0.375 m stroke, exactly on the axis,
    // in the middle of the largest interior gap. It IS licensed paint — it is
    // simply one more than the run fits, which on the road is a dash of осева
    // with no gap in front of it.
    const built = build(JX_EQUAL);
    const real = readQuads(
      built.markings.markings.indicesView,
      built.markings.markings.positionsView,
    );
    const { length } = drawnLine(built, "jx-e-s");
    const extra = phantomQuad(built, "jx-e-s", {
      s: length / 2,
      t: 0,
      alongM: DASH_LENGTH_M,
      acrossM: CENTER_LINE_WIDTH_M,
    });
    const census = districtCensus(built, [...real, extra]);
    // Classified as authored — no offence at all…
    expect(census.offences).toEqual([]);
    expect(census.dashes.get("jx-e-s")!.get(0)!.length).toBe(9);
    // …and convicted anyway, twice over: once because a mesh grew a quad the
    // booking did not, and once by the count that is the subject here.
    expect(paintFindings(built, census)).toEqual([
      "mesh holds 41 quads, markingQuads books 40",
      "jx-e-s: boundary at 0.00 m carries 9 dashes, not 8",
    ]);

    // …and the count line is load-bearing ON ITS OWN, which the pair above does
    // not show: the booking line would have convicted this mesh even if the
    // dash count never existed. So the same claim again with the booking
    // undisturbed — MOVE a dash instead of adding one. Lift ov-keepright-v1's
    // 11th dash off the left divider and re-lay it, same length, same 0.25 m
    // stroke, same station, on the RIGHT divider: quad total unchanged, nothing
    // unauthored on the road, both dividers still „carrying dashes". On the
    // carriageway it is a lane line that jumps a lane, and only the per-boundary
    // count can see it.
    const kr = build(OV_KEEPRIGHT);
    const krReal = readQuads(kr.markings.markings.indicesView, kr.markings.markings.positionsView);
    const { s0 } = drawnLine(kr, "ov-kr-road");
    const lifted = dashesOn(kr, "ov-kr-road").filter(
      (d) => Math.abs(d.t + LANE_WIDTH_M) < 1e-6,
    )[10]!;
    const relaid = phantomQuad(kr, "ov-kr-road", {
      s: lifted.s - s0,
      t: LANE_WIDTH_M,
      alongM: DASH_LENGTH_M,
      acrossM: DASH_WIDTH_M,
    });
    const moved = districtCensus(kr, [
      ...krReal.filter((q) => q.idx0 !== lifted.idx0),
      relaid,
    ]);
    expect(moved.quads).toBe(krReal.length); // booking identity untouched
    expect(moved.offences).toEqual([]); // nothing unlicensed on the road
    expect(paintFindings(kr, moved)).toEqual([
      `ov-kr-road: boundary at ${(-LANE_WIDTH_M).toFixed(2)} m carries 26 dashes, not 27`,
      `ov-kr-road: boundary at ${LANE_WIDTH_M.toFixed(2)} m carries 28 dashes, not 27`,
    ]);
  });

  it("convicts one MISSING dash — the same crime pointed the other way", () => {
    // A census that only hunts phantoms would credit a бяла осева that was never
    // laid, which is the finding family this whole file was opened by. Splice
    // one dash's six indices out of the buffer — the surgery a builder
    // regression performs — and the count convicts it. This is also the
    // construction that gives the ov-lane осева line in §1 its teeth: asserted
    // against `dashes.length` it read 22 === 22 here and passed.
    const built = build(OV_LANE);
    const mesh = built.markings.markings;
    const gone = centreDashesOn(built, "ov-ln-street")[7]!;
    const idx = [...mesh.indicesView];
    idx.splice(gone.idx0, 6);
    const holed = readQuads(idx, mesh.positionsView);

    const census = districtCensus(built, holed);
    expect(census.offences).toEqual([]); // nothing unauthored was ADDED
    expect(census.dashes.get("ov-ln-street")!.get(0)!.length).toBe(22);
    expect(paintFindings(built, census)).toEqual([
      "mesh holds 102 quads, markingQuads books 103",
      "ov-ln-street: boundary at 0.00 m carries 22 dashes, not 23",
    ]);
    // …and the per-edge census in §1 now falls over too, where before the edit
    // it could not: `onBoundary(0).length` and `dashes.length` moved together.
    expect(censusOnEdge(built, "ov-ln-street", [0], holed).onBoundary.get(0)!.length).toBe(22);
    expect(fixedPitchDashCount(drawnLine(built, "ov-ln-street").length)).toBe(23);
  });

  it("convicts an М7 bar painted where the law imposes no duty", () => {
    // The равнозначно direction, and the demonstration that a BOOKING is not
    // paint. §1 asserts `stopLines === 0` on jx-equal-v1 — a counter incremented
    // beside the paint call, not derived from the mesh — so paint the bar
    // without touching the counter and that assertion is untroubled. Proved
    // here: `stopLines` still reads 0 with the bar unmistakably on the road.
    //
    // The forgery is not approximate. It is `paintStopLine`'s own output for
    // this approach, to the last digit: same cut, same STOP_LINE_BEYOND_CUT_M,
    // same 0.15 m inner offset off the осева, same 7.775 m span over the
    // incoming half. A равнозначно кръстовище carries priority to the right and
    // no М7 anywhere (ЗДвП чл. 50), so a bar there teaches a duty the law does
    // not impose — and it is convicted because the catalogue for this district
    // is EMPTY, not because the bar looks wrong.
    const built = build(JX_EQUAL);
    expect(stopLineLicences(built)).toEqual([]);
    expect(built.markings.stopLines).toBe(0);

    const node = [...built.net.nodes.values()].find((n) => n.degree >= 3)!;
    const ap = node.approaches.find((a) => a.edgeId === "jx-e-s" && a.incoming)!;
    const away = ap.cutTangentAway;
    const lineDir = perpRight(away);
    const outer = ap.halfWidth - ap.parkingM - 0.2;
    const from = 0.15;
    const forged = paintQuadTwin(
      add(
        add(ap.cut, mul(away, STOP_LINE_BEYOND_CUT_M)),
        mul(lineDir, -(from + outer) / 2),
      ),
      lineDir,
      (outer - from) / 2,
      STOP_LINE_WIDTH_M / 2,
    );
    // The same bar tj-emerge-v1's Б2 arm really carries, measured in §1.
    expect(
      Math.hypot(forged.corners[3][0] - forged.corners[0][0], forged.corners[3][1] - forged.corners[0][1]),
    ).toBeCloseTo(LANE_WIDTH_M - 0.2 - 0.15, 6);

    const real = readQuads(
      built.markings.markings.indicesView,
      built.markings.markings.positionsView,
    );
    const census = districtCensus(built, [...real, forged]);
    expect(census.offences.length).toBe(1);
    expect(census.offences[0]!.why).toBe("no licence for this paint");
    expect(census.offences[0]!.across).toBeCloseTo(STOP_LINE_WIDTH_M, 9);
    // …while the counter every other test reads is still, untruthfully, zero.
    expect(built.markings.stopLines).toBe(0);
  });

  it("convicts an М7 bar that is authored but NOT painted", () => {
    // And the reverse: tj-emerge-v1's Б2 arm is authored one bar, so a mesh
    // without it is a lesson whose objective names a stop line the world does
    // not have — the sc-junction-left finding verbatim. Drop the bar's quad and
    // the licence goes unused.
    const built = build(TJ_EMERGE);
    const licences = stopLineLicences(built);
    expect(licences.length).toBe(1);
    expect(paintFindings(built)).toEqual([]);

    const real = readQuads(
      built.markings.markings.indicesView,
      built.markings.markings.positionsView,
    );
    const without = real.filter(
      (q) =>
        Math.abs(
          Math.hypot(q.corners[1][0] - q.corners[0][0], q.corners[1][1] - q.corners[0][1]) -
            STOP_LINE_WIDTH_M,
        ) > 1e-6,
    );
    expect(without.length).toBe(real.length - 1);
    const findings = paintFindings(built, districtCensus(built, without));
    expect(findings).toContain(`${licences[0]!.what}: 0 quads painted for it, not 1`);
  });

  // ── THE PLACE AXIS ────────────────────────────────────────────────────────
  // The four below are one argument in four forgeries: a quad can be the right
  // SHAPE and still be wrong. Each was run against this file as it stood before
  // this lane — the census that counted — and each was measured SILENT on every
  // district it grades; each is now convicted on every district that carries a
  // dash at all. They are asserted the same way every mutation in §3 is: the
  // reader that could not see it is shown still not seeing it, in the same test.

  it("convicts a dash TURNED across the road — on every district, not two named edges", () => {
    // §3 already convicts this on ov-lane-v1, because §1 measures that edge's
    // corners by name. Nothing measured corners anywhere else: turn every dash
    // on jx-equal-v1, sx-v1, tj-emerge-v1, tj-occluded-v1 and jxg-giveway-v1
    // ten degrees across the road and `paintFindings` returned [] on all five.
    // A dash at 10° stands 0.685 m out of the line it divides — on the road
    // that is a lane boundary pointing the driver into the oncoming lane.
    let probed = 0;
    let convicted = 0;
    for (const { id, built } of censusDomain()) {
      const real = readQuads(
        built.markings.markings.indicesView,
        built.markings.markings.positionsView,
      );
      const turned = turnDashes(real, 10);
      const census = districtCensus(built, turned);
      const dashes = [...census.dashes.values()].reduce(
        (n, m) => n + [...m.values()].reduce((k, d) => k + d.length, 0),
        0,
      );
      if (dashes === 0) continue; // nothing to turn — evidence of nothing
      probed++;
      // …still classified, still counted, still booked: every reading the
      // census had before this lane is undisturbed by the mutation.
      expect(census.offences, id).toEqual([]);
      expect(census.quads, id).toBe(readQuads(
        built.markings.markings.indicesView,
        built.markings.markings.positionsView,
      ).length);
      const findings = paintFindings(built, census);
      expect(findings.length, id).toBeGreaterThan(0);
      // …and every one of them is the corner reading, not a count that moved.
      for (const f of findings) expect(f, id).toMatch(/dashes off it, worst corner/);
      convicted++;
    }
    expect(probed).toBeGreaterThan(80);
    expect(convicted).toBe(probed);
  });

  it("convicts a dash SHOVED 0.5 m off its boundary, inside the band that files it", () => {
    // The lateral forgery the band cannot refuse by construction: the band is
    // half a lane — 4.06 m — and it has to be, so that a nudged dash is
    // convicted BY NAME on its own boundary instead of vanishing into
    // `offences`. Half a metre is well inside it, and half a metre of осева is
    // a centre line laid into the oncoming lane.
    let probed = 0;
    let convicted = 0;
    for (const { id, built } of censusDomain()) {
      const real = readQuads(
        built.markings.markings.indicesView,
        built.markings.markings.positionsView,
      );
      const shoved = shiftDashes(real, 0.5);
      const census = districtCensus(built, shoved);
      const filed = [...census.dashes.values()].reduce(
        (n, m) => n + [...m.values()].reduce((k, d) => k + d.length, 0),
        0,
      );
      if (filed === 0) continue;
      probed++;
      // Filed under their own boundaries exactly as before — no offence, no
      // count moved, so the census as it stood had nothing to say…
      expect(census.offences, id).toEqual([]);
      const lateral = paintFindings(built, census).filter((f) =>
        /dashes off it, worst corner/.test(f),
      );
      expect(lateral.length, id).toBeGreaterThan(0);
      convicted++;
    }
    expect(probed).toBeGreaterThan(80);
    expect(convicted).toBe(probed);
  });

  it("convicts the OLD fixed-pitch rhythm — the one regression this file ever caught", () => {
    // The defect that shipped. The old walk anchored at gapLen/2 from the near
    // end and paid all its slack out at the far end, which on a junction-trimmed
    // arm is the junction mouth: jx-equal-v1's four arms and tj-occluded-v1's
    // stem stopped 11.27 m short of their own mouth, sx-v1's north arm 0.28 m —
    // same class, same junction, pure phase luck.
    //
    // It fits the SAME n dashes, so no count anywhere moves and `markingQuads`
    // is unchanged. §2 catches it on the six edges it names by id and on
    // nothing else: re-laid across the whole domain, this file reported 50
    // districts silent and 0 convicted.
    //
    // ON A ZONED EDGE THAT IS NOT QUITE TRUE, and the widening to 91 districts
    // is what surfaced it. A zone solid suppresses a dash on its MIDPOINT, and
    // the two rhythms put their midpoints in different places, so the dash that
    // straddles the end of a В24 or bus-lane span can be painted under one walk
    // and skipped under the other: pe-dart-v1 goes 24 quads → 23. There the
    // mutation IS visible to the count — a reading this file already tests two
    // ways — so those districts are counted apart rather than quietly dropped,
    // and the strict claim („invisible to count, licence and booking; every
    // finding is a station") is still made on all the rest.
    let probed = 0;
    let stationOnly = 0;
    let countMoved = 0;
    for (const { id, built } of censusDomain()) {
      const real = readQuads(
        built.markings.markings.indicesView,
        built.markings.markings.positionsView,
      );
      const relaid = fixedPitchRelay(built);
      const census = districtCensus(built, relaid);
      // Does the old rhythm actually differ here? On a run whose slack happens
      // to be zero the two walks coincide, and a district that was never moved
      // is evidence of nothing — counting it as a pass is how a mutation test
      // decays into a test of nothing.
      let moved = false;
      for (const { id: eid } of markedEdges(built)) {
        for (const b of boundaryFrames(built, eid)) {
          const seen = census.dashes.get(eid)!.get(b.off)!.map((d) => d.s).sort((x, y) => x - y);
          if (seen.length !== b.stations.length) {
            moved = true;
            continue;
          }
          if (seen.some((s, i) => Math.abs(s - b.stations[i]!) > 1e-6)) moved = true;
        }
      }
      if (!moved) continue;
      probed++;
      // Convicted either way — that is the claim this test makes about every
      // district it probes, and it is asserted before the split so neither
      // branch can be the one that quietly passes on nothing.
      const findings = paintFindings(built, census);
      expect(findings.length, id).toBeGreaterThan(0);
      if (relaid.length !== real.length) {
        countMoved++;
        continue;
      }
      // Every count is still right, nothing is unlicensed, the booking is
      // untouched — the mutation is invisible to all three…
      expect(census.offences, id).toEqual([]);
      expect(census.quads, id).toBe(real.length);
      // …and every finding is a STATION, named with the metre it should be at.
      for (const f of findings) expect(f, id).toMatch(/has dash \d+ at s = .* the rhythm fits/);
      stationOnly++;
    }
    expect(probed).toBeGreaterThan(80);
    expect(stationOnly + countMoved).toBe(probed);
    // …and the station reading is what carries almost all of it, which is the
    // point: if the count could see this defect it would never have shipped.
    expect(stationOnly).toBeGreaterThan(80);
  });

  it("convicts an М1 edge-line strip that is missing, and one slid along its own rail", () => {
    // THE DEAD EMITTER. `paintFindings`' strip line could be deleted outright
    // and this file stayed 51/51 GREEN — measured by deleting it. It is not
    // dead code (splice a strip quad out and it says so), it simply had no test,
    // which is the same thing as far as the next regression is concerned.
    //
    // A · the strip that is NOT there. ov-lane-v1's S-curve draws 40 strips a
    // side; drop one and the М1 edge line has a 7 m hole in it, on the lesson
    // whose critical finding was „no paint on this road".
    const built = build(OV_LANE);
    const mesh = built.markings.markings;
    const real = readQuads(mesh.indicesView, mesh.positionsView);
    const strips = real.filter((q) => !isDashQuad(q));
    expect(strips.length).toBe(80);
    const holed = real.filter((q) => q !== strips[17]);
    // …and the finding NAMES THE SEGMENT. This used to read „ov-ln-street: 79
    // М1 edge-line strips, not 80" — true, and useless to whoever has to go and
    // look, because 80 strips lie along 358 m of S-curve and the sentence says
    // nothing about which 7 m of it lost its paint.
    expect(paintFindings(built, districtCensus(built, holed))).toEqual([
      "mesh holds 102 quads, markingQuads books 103",
      "М1@ov-ln-street- seg 18: 0 quads painted for it, not 1",
    ]);

    // B · the strip that is there and in the WRONG PLACE — the half a count
    // cannot reach. Slide the same strip a metre along its own rail instead of
    // deleting it: its width is unchanged, its lateral offset moves by the
    // sagitta of one metre of a 45 m bend, and there are still 80 of them. The
    // shape-and-band rule the PER-EDGE census still uses files it as a
    // perfectly good edge line — asserted here, so „this is a new check" is
    // itself a check — while the rectangle licence convicts it.
    const dir = norm(sub(strips[17]!.corners[3], strips[17]!.corners[0]));
    const slid: MeshQuad = {
      corners: strips[17]!.corners.map((c) => add(c, mul(dir, 1))) as [Vec2, Vec2, Vec2, Vec2],
      idx0: strips[17]!.idx0,
    };
    const mutated = [...holed, slid];
    const perEdge = censusOnEdge(built, "ov-ln-street", [0], mutated);
    expect(perEdge.edgeLines.length).toBe(80);
    expect(perEdge.other).toEqual([]);
    // The district census, which asks WHICH RECTANGLE OF ROAD it covers.
    const census = districtCensus(built, mutated);
    expect(census.offences.length).toBe(1);
    expect(census.offences[0]!.why).toBe("no licence for this paint");
    expect(census.offences[0]!.edgeId).toBe("ov-ln-street");
    const findings = paintFindings(built, census);
    expect(findings.length).toBe(2);
    expect(findings[0]).toMatch(/^no licence for this paint: .* on ov-ln-street at t = /);
    expect(findings[1]).toBe("М1@ov-ln-street- seg 18: 0 quads painted for it, not 1");
  });

  // ── THE PAINT THE DOMAIN WIDENED FOR ──────────────────────────────────────
  // Widening a census is the one change that can WEAKEN it while looking like
  // progress: admit 41 districts on a licence that cannot fail and the reach
  // number goes up while the instrument goes down. Every forgery above already
  // runs over all 91 — that is the first half. These six are the second: each
  // attacks the paint the widening ADMITTED, on every district that carries it,
  // and the two that a rotation used to walk through are shown walking through
  // the retired reader in the same assertion that convicts them.

  it("the widened domain really carries the paint it was widened for", () => {
    // The vacuity check, and it is not hypothetical: 16 of the 25 zone-gated
    // districts author only kinds that paint nothing (noStopping, curveAdvisory,
    // railCrossing, water/ice patches), so a domain that grew by 41 could have
    // grown entirely on maps whose new licences are never exercised. Then every
    // assertion below would pass over an empty list and say nothing.
    const domain = censusDomain();
    let zoneDistricts = 0;
    let zoneStrips = 0;
    let zebraDistricts = 0;
    let zebraBars = 0;
    let suppressed = 0;
    for (const { built } of domain) {
      const solids = drawableEdges(built).flatMap((e) => zoneSolidLicences(built, e.id));
      if (solids.length) zoneDistricts++;
      zoneStrips += solids.length;
      const bars = zebraLicences(built);
      if (bars.length) zebraDistricts++;
      zebraBars += bars.length;
      for (const { id } of markedEdges(built)) {
        for (const b of boundaryFrames(built, id)) {
          suppressed += fittedDashStations(polylineLength(b.line)).length - b.stations.length;
        }
      }
    }
    expect({ zoneDistricts: zoneDistricts > 0, zebraDistricts: zebraDistricts > 0 }).toEqual({
      zoneDistricts: true,
      zebraDistricts: true,
    });
    expect(zoneStrips).toBeGreaterThan(50);
    expect(zebraBars).toBeGreaterThan(200);
    // …and the SUPPRESSION half of a zone is exercised too. A zone that adds a
    // solid and silences no dash would leave `boundaryFrames`' filter dead.
    expect(suppressed).toBeGreaterThan(0);

    // AND THE LATERAL BUDGET IS STILL TIGHT ON THE WIDER DOMAIN. Admitting 41
    // districts is admitting 41 new sets of bends, and a budget that no real
    // dash comes near is a budget that convicts nothing: the 10° test above
    // proves it catches a turn, this proves there is no slack left over. The
    // worst real dash in the domain stands at this fraction of what its own
    // bend and stroke allow — measured, and asserted as a band rather than a
    // point so a corpus edit does not redden it for a non-defect.
    let worstRatio = 0;
    for (const { built } of domain) {
      const census = districtCensus(built);
      for (const { id } of markedEdges(built)) {
        for (const b of boundaryFrames(built, id)) {
          for (const d of census.dashes.get(id)!.get(b.off)!) {
            worstRatio = Math.max(worstRatio, d.corner / b.budget);
          }
        }
      }
    }
    expect(worstRatio).toBeLessThanOrEqual(1 + 1e-9);
    expect(worstRatio).toBeGreaterThan(0.9);
  });

  it("convicts a zone solid slid along its own rail, and one that is missing", () => {
    // The place axis on the paint this lane admitted. A zone solid is a ribbon
    // strip, and a strip slid along its own rail keeps its width, its offset and
    // its count — the same forgery that walked past the per-edge strip census on
    // ov-lane-v1, now aimed at the В24 осева and the bus-lane seam.
    let probed = 0;
    let slidConvicted = 0;
    let goneConvicted = 0;
    for (const { id, built } of censusDomain()) {
      const licences = drawableEdges(built).flatMap((e) => zoneSolidLicences(built, e.id));
      if (licences.length === 0) continue;
      probed++;
      const real = readQuads(
        built.markings.markings.indicesView,
        built.markings.markings.positionsView,
      );
      const painted = real.find((q) => coversLicence(q, licences[0]!));
      // The licence is covered by real paint before anything is forged — so a
      // conviction below is the forgery and not a licence nobody honours.
      expect(painted, `${id}: ${licences[0]!.what}`).toBeDefined();

      // A · slid one metre down its own rail. The quad count is unchanged, so
      // the booking line cannot fire and the conviction has to come from the
      // paint: the licence it left goes unused, and the quad it became is
      // unexplained. `why` is not asserted — a bus-lane seam on a car-park
      // aisle lands on an UNMARKED edge and is reported as such, which is the
      // same offence with a more precise name.
      const slid = [...real.filter((q) => q !== painted), slideQuad(painted!, 1)];
      const slidCensus = districtCensus(built, slid);
      expect(slidCensus.quads, id).toBe(real.length);
      expect(slidCensus.offences.length, id).toBe(1);
      expect(paintFindings(built, slidCensus), id).toContain(
        `${licences[0]!.what}: 0 quads painted for it, not 1`,
      );
      slidConvicted++;

      // B · not painted at all — the false-CERTIFICATE direction. A В24 span
      // whose solid осева was never laid is a ban posted on a road that does not
      // show it, and the booking moves with it, so both lines fire.
      const gone = real.filter((q) => q !== painted);
      const goneFindings = paintFindings(built, districtCensus(built, gone));
      expect(goneFindings, id).toContain(`${licences[0]!.what}: 0 quads painted for it, not 1`);
      expect(goneFindings, id).toContain(
        `mesh holds ${gone.length} quads, markingQuads books ${
          built.markings.markingQuads - built.markings.giveWayTriangles
        }`,
      );
      goneConvicted++;
    }
    expect(probed).toBeGreaterThan(5);
    expect(slidConvicted).toBe(probed);
    expect(goneConvicted).toBe(probed);
  });

  it("convicts a В24 span whose осева stayed DASHED — the founder's own note", () => {
    // „it must be unbroken line and currently is broken line which is allowing
    // overtake." That was a real defect on a real map, and the fix was to paint
    // the solid AND suppress the dashes underneath it. This is the second half
    // as a test: put the suppressed dashes back — the painter that draws the
    // solid and forgets to silence what it covers — and the census convicts the
    // boundary by name, on every district in the domain that has one.
    //
    // Nothing else here can see it. The dashes are the right length, the right
    // stroke, exactly on their own boundary, at stations the fitted rhythm
    // really produces; they are simply dashes over a span the law says must be
    // continuous, and only the SUPPRESSED station list knows that.
    let probed = 0;
    let convicted = 0;
    for (const { id, built } of censusDomain()) {
      const real = readQuads(
        built.markings.markings.indicesView,
        built.markings.markings.positionsView,
      );
      const unsilenced: MeshQuad[] = [];
      const expected: RegExp[] = [];
      for (const { id: eid } of markedEdges(built)) {
        for (const b of boundaryFrames(built, eid)) {
          const all = fittedDashStations(polylineLength(b.line));
          const hidden = all.filter((s) => !b.stations.includes(s));
          if (hidden.length === 0) continue;
          for (const s of hidden) {
            const f = pointAlong(b.line, s);
            unsilenced.push(paintQuadTwin(f.point, f.tangent, DASH_LENGTH_M / 2, b.stroke / 2));
          }
          // The boundary must be named, and the number it SHOULD carry must be
          // the suppressed count. What it is found carrying is left open: on
          // mw-exit-v1 one un-silenced dash falls where a slip road's frame is
          // nearer than its own edge's, so it is reported as owned by no edge
          // and never reaches the bucket. Pinning that number would be pinning
          // an ownership tie-break this test is not about.
          expected.push(
            new RegExp(
              `^${eid}: boundary at ${b.off.toFixed(2)} m carries \\d+ dashes, ` +
                `not ${b.stations.length}$`,
            ),
          );
        }
      }
      if (unsilenced.length === 0) continue;
      probed++;
      const census = districtCensus(built, [...real, ...unsilenced]);
      const findings = paintFindings(built, census);
      // The un-silenced dashes are ORDINARY paint — right length, right stroke,
      // on their own boundary, at stations the fitted rhythm really produces —
      // so almost none of them lands in `offences` and the offence bucket is not
      // what convicts this. (Almost: on mw-exit-v1 one suppressed station sits
      // where a slip road's frame is nearer than its own edge's, so that one quad
      // is reported as owned by no edge. It is convicted either way; the point is
      // that the rest are not, and the count line below still fires for all.)
      expect(census.offences.length, id).toBeLessThan(unsilenced.length);
      // It is the COUNT on the boundary the solid covers that says the ban is
      // not being shown.
      for (const rx of expected) {
        expect(findings.some((f) => rx.test(f)), `${id} ${rx.source}`).toBe(true);
      }
      convicted++;
    }
    expect(probed).toBeGreaterThan(0);
    expect(convicted).toBe(probed);
  });

  it("convicts a zebra bar TURNED 10° — and the retired reader still cannot see it", () => {
    // The forgery the old centre-and-lengths licence was built to miss. Turn
    // every М8 bar ten degrees about its own centre and the crossing stops being
    // perpendicular to the kerbs it joins: same centre, same 6.00 m length, same
    // 0.80 m stroke, same count, same booking. A пешеходна пътека painted askew
    // is one whose bars run partly along the traffic they are supposed to stop.
    let probed = 0;
    let convicted = 0;
    let blindToRetired = 0;
    for (const { id, built } of censusDomain()) {
      const bars = zebraLicences(built);
      if (bars.length === 0) continue;
      probed++;
      const real = readQuads(
        built.markings.markings.indicesView,
        built.markings.markings.positionsView,
      );
      const isBar = (q: MeshQuad): boolean => bars.some((L) => coversLicence(q, L));
      const turned = real.map((q) => (isBar(q) ? turnQuad(q, 10) : q));
      expect(turned.filter((q, i) => q !== real[i]).length, id).toBe(bars.length);
      // THE RETIRED READER, shown still blind: every turned bar still satisfies
      // centre + own length + own width against the licence it came from.
      const seenByRetired = turned.filter(
        (q, i) => real[i] !== q && bars.some((L) => centroidMatch(q, L)),
      ).length;
      expect(seenByRetired, id).toBe(bars.length);
      blindToRetired++;
      // …and convicted by the corners, every bar of every crossing. The count is
      // the assertion: not one turned bar was re-matched to some OTHER licence,
      // which is the only way this could pass without the corners doing the
      // work. `why` is left unasserted because a crossing on a car-park aisle
      // (lot-zebra-v1) sits on an UNMARKED edge and is reported under that name.
      const census = districtCensus(built, turned);
      expect(census.offences.length, id).toBe(bars.length);
      const findings = paintFindings(built, census);
      for (const L of bars) {
        expect(findings, id).toContain(`${L.what}: 0 quads painted for it, not 1`);
      }
      convicted++;
    }
    expect(probed).toBeGreaterThan(10);
    expect(convicted).toBe(probed);
    expect(blindToRetired).toBe(probed);
  });

  it("convicts a zebra crossing that is authored but NOT painted", () => {
    // The false-certificate direction on the same paint. A lesson that grades a
    // пешеходна пътека the world never drew is the sc-junction-left finding
    // wearing different clothes — the student is failed, or credited, against
    // paint that is not on the road. Delete one crossing's bars and every
    // licence it holds goes unused.
    let probed = 0;
    let convicted = 0;
    for (const { id, built } of censusDomain()) {
      const bars = zebraLicences(built);
      if (bars.length === 0) continue;
      const one = bars.filter((L) => L.what.endsWith(bars[0]!.what.split("@")[1]!));
      probed++;
      const real = readQuads(
        built.markings.markings.indicesView,
        built.markings.markings.positionsView,
      );
      const without = real.filter((q) => !one.some((L) => coversLicence(q, L)));
      expect(without.length, id).toBe(real.length - one.length);
      const findings = paintFindings(built, districtCensus(built, without));
      for (const L of one) expect(findings, id).toContain(`${L.what}: 0 quads painted for it, not 1`);
      convicted++;
    }
    expect(probed).toBeGreaterThan(10);
    expect(convicted).toBe(probed);
  });

  it("convicts an М7 bar TURNED 10° — the hole the retired licence left open", () => {
    // The same rotation, on the marking whose PLACE is law: `runtime/stoplines.ts`
    // grades at `cut + STOP_LINE_BEYOND_CUT_M`, and a bar turned across its own
    // mouth puts one end of the paint ahead of that arclength and the other
    // behind it. A student who stops on the line is then stopped correctly at one
    // end of his car and short at the other, and which one he is graded on is
    // luck. This is a hole that existed in this file until this lane, on the one
    // authored bar in the corpus, and it is asserted both ways here.
    const built = build(TJ_EMERGE);
    const licences = stopLineLicences(built);
    expect(licences.length).toBe(1);
    const real = readQuads(
      built.markings.markings.indicesView,
      built.markings.markings.positionsView,
    );
    const bar = real.find((q) => coversLicence(q, licences[0]!))!;
    expect(bar, licences[0]!.what).toBeDefined();
    const turned = real.map((q) => (q === bar ? turnQuad(q, 10) : q));
    // The retired reader is satisfied — centre, length and width all unmoved.
    expect(centroidMatch(turned.find((q) => q !== bar && q.idx0 === bar.idx0)!, licences[0]!)).toBe(
      true,
    );
    // The corners are not: 0.68 m of a 7.775 m bar standing out of square.
    const census = districtCensus(built, turned);
    expect(census.offences.length).toBe(1);
    expect(census.offences[0]!.why).toBe("no licence for this paint");
    expect(paintFindings(built, census)).toContain(
      `${licences[0]!.what}: 0 quads painted for it, not 1`,
    );
  });

  it("the catalogue's reach is measured, not claimed in a comment", () => {
    // This block was titled „every quad the world paints…" while it graded one
    // district's paint in seven. The title now says 91 districts, and this test
    // is what keeps that honest: the reach is counted, and every district
    // outside it is outside for a NAMED reason, so no map can drift out of the
    // census quietly. Extend the catalogue and this fails until the numbers
    // above are corrected — which is the point, and which is exactly what
    // happened when this lane extended it: 50 → 91 districts, 14.96% → 40.85%
    // of the corpus's paint, and this test was the thing that would not let the
    // prose stay at the old numbers.
    //
    // AND THE COUNT USED TO BE TAKEN OFF THE WRONG NUMBER, under this exact
    // title. `markingQuads` is what the painter BOOKED, and this file pins
    // twice over that a booking is not a quad: §4 pins
    // `triangles === 2·markingQuads − giveWayTriangles` and the per-district
    // test above pins `census.quads === markingQuads − giveWayTriangles`. Both
    // say the same thing — a give-way М7 triangle is booked in `markingQuads`
    // and occupies ONE triangle, not two — and the corpus carries 108 of them.
    // So both totals are stated below, the booking and the mesh, and the share
    // is taken off the mesh: 4,367 / 10,690 = 40.85%. Off the bookings it would
    // read 4,381 / 10,798 = 40.57%, and the gap is the 14 give-way triangles
    // the domain now contains.
    const corpus = censusCorpus();
    const domain = censusDomain();
    /** What the painter BOOKED — one per rectangle, and one per М7 triangle. */
    const booked = (rows: Array<{ built: Built }>): number =>
      rows.reduce((n, d) => n + d.built.markings.markingQuads, 0);
    /** How many of those bookings are triangles. */
    const bookedTriangles = (rows: Array<{ built: Built }>): number =>
      rows.reduce((n, d) => n + d.built.markings.giveWayTriangles, 0);
    /** What the MESH holds, walked out of the index buffer by the reader every
     *  other claim in this file rests on. Not a restatement of the counter: the
     *  two are proved equal below, over all 105, which is the only place the 14
     *  districts OUTSIDE the domain have their geometry counted at all. */
    const meshQuads = (rows: Array<{ built: Built }>): number =>
      rows.reduce(
        (n, d) =>
          n +
          readQuads(d.built.markings.markings.indicesView, d.built.markings.markings.positionsView)
            .length,
        0,
      );
    expect({
      districts: corpus.length,
      booked: booked(corpus),
      triangles: bookedTriangles(corpus),
    }).toEqual({ districts: 105, booked: 10798, triangles: 108 });
    expect({
      districts: domain.length,
      booked: booked(domain),
      triangles: bookedTriangles(domain),
    }).toEqual({ districts: 91, booked: 4381, triangles: 14 });
    // The mesh, and the booking it is supposed to equal. 59% of the denominator
    // below still sits in the 14 excluded districts — they are the biggest maps
    // in the corpus, which is why 87% of the DISTRICTS is only 41% of the PAINT
    // — and nothing else here reads their index buffers: this line is the only
    // place the reach is checked against geometry rather than against a counter.
    const corpusMesh = meshQuads(corpus);
    const domainMesh = meshQuads(domain);
    expect(corpusMesh).toBe(booked(corpus) - bookedTriangles(corpus)); // 10,690
    expect(domainMesh).toBe(booked(domain) - bookedTriangles(domain)); //  4,367
    const share = ((domainMesh / corpusMesh) * 100).toFixed(2);
    expect(share).toBe("40.85");
    // „NOT CLAIMED IN A COMMENT" IS NOW ITSELF A CHECK. The line this replaces
    // — `expect(share.toFixed(1)).toBe("14.8")` — could not fail: with both
    // totals pinned exactly two lines above it, the ratio was arithmetic, and
    // no state of the world reddened the share without reddening a total first.
    // It was a restatement wearing an assertion's clothes, and it restated a
    // WRONG number for a wave without ever being able to say so.
    //
    // What a share assertion CAN guard, and what this test's title promises, is
    // the prose: a comment is the one part of a test file that nothing else can
    // falsify, and this file shipped a header whose arithmetic was wrong. So the
    // sentence is GENERATED from the measurement and required to appear, word
    // for word, at both places that state the reach — the file header and
    // `censusCorpus`'s doc block. Edit either one and this goes red; extend the
    // catalogue and it stays red until both are corrected.
    const group = (v: number): string => v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const claim = `${group(domainMesh)} of the corpus's ${group(corpusMesh)} marking quads — ${share}%`;
    const self = fs.readFileSync(path.join(__dirname, "markings-paint-truth.test.ts"), "utf8");
    expect(self.split(claim).length - 1, claim).toBe(2);
    // …and no OTHER denominator is stated anywhere in the file's prose, so a
    // stale copy of this sentence cannot survive elsewhere in the header.
    expect([...self.matchAll(/of the corpus's ([\d,]+) marking quads/g)].map((m) => m[1])).toEqual([
      group(corpusMesh),
      group(corpusMesh),
    ]);

    // AND THE MESH READING IS A SECOND INSTRUMENT, not the counter in a hat —
    // proved by construction, on an EXCLUDED district, because those are the
    // ones no other assertion in this file reads. Splice one quad's six indices
    // out of its index buffer, the surgery a builder regression performs, and
    // the mesh total moves while `markingQuads` does not: that is the whole
    // difference between the two readings, and it is why the equality asserted
    // above is capable of failing. `whole.length` is asserted first, so the
    // construction cannot pass by measuring an empty mesh.
    const outside = corpus.find((d) => d.outside !== null)!;
    const mesh = outside.built.markings.markings;
    const whole = readQuads(mesh.indicesView, mesh.positionsView);
    expect(whole.length, outside.id).toBeGreaterThan(0);
    const idx = [...mesh.indicesView];
    idx.splice(whole[0]!.idx0, 6);
    expect(readQuads(idx, mesh.positionsView).length, outside.id).toBe(whole.length - 1);
    // …and the counter is untouched by that surgery. This is the pair the old
    // share could not tell apart: 10,690 − 1 ≠ 10,690 is what convicts it, and
    // 10,798 stays 10,798 throughout.
    expect(outside.built.markings.markingQuads).toBe(booked([outside]));

    // Every excluded district, attributed to the first gate that stops it —
    // the tally the doc comment on `censusCorpus` carries, asserted rather than
    // asserted-in-a-comment. The zebra and zone rows are GONE because this lane
    // closed them, which is what took 41 districts into the domain; of the 14
    // left, the numerals are the biggest and the arrows the cheapest, and that
    // is the order the next wave should extend the catalogue in.
    const tally: Record<string, number> = { in: 0 };
    for (const d of corpus) {
      const key = d.outside ?? "in";
      tally[key] = (tally[key] ?? 0) + 1;
    }
    expect(tally).toEqual({ in: 91, laneArrow: 3, speedGlyph: 6, roundabout: 5 });
  });

  it("convicts paint whose corners straddle two edges", () => {
    // The last way a quad can escape a per-edge reader: `quadsOnEdge` drops any
    // quad whose corners do not all resolve to the edge being asked about, so a
    // 40 m slab lying across a junction belongs to no edge and is invisible to
    // every per-edge claim in this file. The census reports it instead of
    // dropping it — „no edge owns all four corners" is a finding, not a skip.
    const built = build(JX_EQUAL);
    const real = readQuads(
      built.markings.markings.indicesView,
      built.markings.markings.positionsView,
    );
    const node = [...built.net.nodes.values()].find((n) => n.degree >= 3)!;
    const straddle = paintQuadTwin(node.pos, [1, 0], 20, 0.125);
    const census = districtCensus(built, [...real, straddle]);
    expect(census.offences.length).toBe(1);
    expect(census.offences[0]!.why).toBe("no edge owns all four corners");
    expect(census.offences[0]!.edgeId).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// 6. An angled crossing cannot hang the build
// ---------------------------------------------------------------------------

/**
 * Minimal district-v1 with one marked street and one crossing on it.
 *
 * It carries `intersections`, `roundabouts` and `spawnPoints` — empty, but
 * PRESENT — because `District` declares all three required and `analyzeNetwork`
 * dereferences the first two unguarded. When this file shipped they were
 * missing, `assertDistrict` did not check them, and all three tests below died
 * inside network.ts with „Cannot read properties of undefined (reading
 * 'filter')" — an error naming neither the fixture nor the field. The guard
 * now checks every required field (world/types.ts), so this fixture could not
 * be written wrong again without saying so.
 */
function skewedCrossingDistrict(skewDeg: number): District {
  return assertDistrict({
    format: "district-v1",
    // `boundsLocalMeters` is read by no painter — it is here because §e builds
    // a `DistrictIndex`, which derives its uniform-grid origin and column count
    // from these four numbers (runtime/district.ts).
    meta: {
      district: "skew",
      label: "skew",
      attribution: { text: "test fixture" },
      boundsLocalMeters: { minX: -60, minY: -60, maxX: 60, maxY: 180 },
    },
    roads: {
      nodes: [
        { id: "skew-a", x: 0, y: 0 },
        { id: "skew-b", x: 0, y: 120 },
      ],
      edges: [
        {
          id: "skew-e",
          from: "skew-a",
          to: "skew-b",
          class: "residential",
          oneway: false,
          roundabout: false,
          lanes: 2,
          lanesSource: "tag",
          maxspeed: 50,
          maxspeedSource: "tag",
          length: 120,
          geometry: [
            [0, 0],
            [0, 120],
          ],
        },
      ],
    },
    intersections: [],
    // `kind: "marked"` — a пешеходна пътека that is actually painted. It said
    // `"uncontrolled"` on arrival, which is not a `CrossingKind` at all
    // (`"signals" | "marked" | "unmarked" | "unknown"`), so `paintsZebra`
    // refused it and every assertion below was measuring a crossing the painter
    // had skipped. `assertDistrict` cannot catch that — it is the cheap seam
    // guard, not a schema validator — which is precisely why a fixture must be
    // RUN before it is believed.
    crossings: [{ id: "skew-c", x: 0, y: 60, kind: "marked", signalized: false, edgeId: "skew-e", skewDeg }],
    roundabouts: [],
    buildings: [],
    spawnPoints: [],
  });
}

const STUB_ID = "stub";
/** A marked street too short to fit one dash — the stub case above. */
const STUB: District = assertDistrict({
  format: "district-v1",
  meta: { district: STUB_ID, label: "stub", attribution: { text: "test fixture" } },
  roads: {
    nodes: [
      { id: "stub-a", x: 0, y: 0 },
      { id: "stub-b", x: 0, y: 8 },
    ],
    edges: [
      {
        id: "stub-e",
        from: "stub-a",
        to: "stub-b",
        class: "residential",
        oneway: false,
        roundabout: false,
        lanes: 2,
        lanesSource: "tag",
        maxspeed: 50,
        maxspeedSource: "tag",
        length: 8,
        geometry: [
          [0, 0],
          [0, 8],
        ],
      },
    ],
  },
  intersections: [],
  crossings: [],
  roundabouts: [],
  buildings: [],
  spawnPoints: [],
});

/**
 * The vertices the CROSSING adds, and nothing else — the same district built
 * twice, once with `crossings: []`.
 *
 * NOT „the first four vertices near the crossing point", which is what this
 * file shipped with: buildMarkings paints every lane line BEFORE any zebra, so
 * that reader handed back a corner of the dashed осева, whose axis is the
 * ROAD's — it would have measured 0° for every skew and passed only by luck.
 * A differential measurement cannot be fooled by paint order, and the prefix
 * assertion below is itself a claim worth making: a crossing must not move one
 * vertex of the carriageway's own paint.
 */
function crossingPaint(district: District, net: RoadNetwork): Vec2[] {
  const bare = buildMarkings({ ...district, crossings: [] }, net, new Set(), new Set(), []);
  const full = buildMarkings(district, net, new Set(), new Set(), []);
  const a = bare.markings.positionsView;
  const b = full.markings.positionsView;
  expect(b.length).toBeGreaterThan(a.length);
  expect(Array.from(b.slice(0, a.length))).toEqual(Array.from(a));
  const out: Vec2[] = [];
  for (let i = a.length; i < b.length; i += 3) out.push([b[i]!, -b[i + 2]!]);
  return out;
}

/**
 * Angle of the zebra bars off the road axis, read back out of the mesh —
 * signed CCW in district space, the same handedness `markings.rotate` uses, so
 * a skew of +18° reads +18°. (The reader this file shipped with returned a
 * COMPASS bearing, `atan2(dx, dy)`, which is clockwise: it negated every angle
 * it measured and would have failed at −18 against +18 even had it found a bar.)
 */
function barSkewDeg(district: District, net: RoadNetwork): number {
  const v = crossingPaint(district, net);
  expect(v.length % 4).toBe(0);
  // paintQuad emits back-left, back-right, front-right, front-left; corner 0
  // to corner 3 is the along-bar edge, i.e. `barDir`.
  const bar = sub(v[3]!, v[0]!);
  // Its length is the bar's own — proof that what was measured IS a bar.
  expect(Math.hypot(bar[0], bar[1])).toBeCloseTo(ZEBRA_LENGTH_M, 6);
  const g = district.roads.edges[0]!.geometry as Vec2[];
  const road = norm(sub(g[g.length - 1]!, g[0]!));
  return (Math.atan2(road[0] * bar[1] - road[1] * bar[0], road[0] * bar[0] + road[1] * bar[1]) * 180) / Math.PI;
}

describe("paintZebra survives an out-of-domain skew", () => {
  it("a shipped skew (18°) turns the bars by exactly that much", () => {
    // The clamp must be INERT inside its domain — gen_pe_crossings.mjs ships
    // 18° and −12°, and a guard that quietly straightened them would be the
    // false-failure half of the same crime.
    for (const skew of [18, -12, 45]) {
      const district = skewedCrossingDistrict(skew);
      const net = analyzeNetwork(district);
      const m = buildMarkings(district, net, new Set(), new Set(), []);
      expect(m.zebraCrossings, `${skew}°`).toBe(1);
      expect(barSkewDeg(district, net), `${skew}°`).toBeCloseTo(skew, 6);
    }
  });

  it("skew 90° neither hangs the build nor deletes the crossing", { timeout: 20_000 }, () => {
    // Unclamped, the 1/cos widening asks for a 2.6e17 m span on this 16.25 m
    // street — about 1.9e17 bars — and the bar loop never returns: a world
    // build that hangs forever, with no error, from one bad number in a map
    // generator. assertDistrict validates nothing about skewDeg (it is a
    // number in range 0…360 as far as the schema is concerned), so the domain
    // has to live in the painter.
    const district = skewedCrossingDistrict(90);
    const net = analyzeNetwork(district);
    const m = buildMarkings(district, net, new Set(), new Set(), []);
    // Still PAINTED: runtime/zones grades this crossing off `paintsZebra`,
    // which knows nothing about skew, so refusing the paint would grade a
    // пешеходна пътека the world never drew.
    //
    // `zebraCrossings` alone cannot carry that claim — buildMarkings increments
    // it per crossing it VISITS, whatever paintZebra then returns — so the paint
    // itself is proved by `crossingPaint` below, which fails unless the crossing
    // added vertices. Both are asserted; only the second one is load-bearing.
    expect(m.zebraCrossings).toBe(1);
    // Clamped at 60°, the widening is 2× and the street takes 22 bars. Without
    // the clamp this number is ~1.9e17 and the build never returns.
    expect(m.markingQuads).toBeLessThan(200);
    expect(barSkewDeg(district, net)).toBeCloseTo(60, 6);
  });
});

// ---------------------------------------------------------------------------
// 7. `zebraCrossings` counts the PAINT, not the visit
// ---------------------------------------------------------------------------
//
// The skew tests above already say it in a comment — „buildMarkings increments
// it per crossing it VISITS, whatever paintZebra then returns" — and a defect
// named in a comment is a defect nobody has to fix. `WorldStats.zebraCrossings`
// is what ~70 district batteries read as „this world has N зебри"; incremented
// per visit it is A NUMBER THAT CANNOT FALL WHEN THE PAINT DISAPPEARS, i.e. it
// is silent about the one event it exists to report, and the audit's own
// complaint family is „the lesson names a marking the world does not have".
//
// The reachable zero is the refuge ISLAND. `count` is floored at 2 and only the
// island `continue` can skip a bar, so paint vanishes exactly when the kerb is
// wide enough to swallow the outermost bar — and nothing validates
// `island.widthM` (assertDistrict is the cheap seam guard, not a schema
// validator), while `buildCrossingFurniture` raises its prism from the same
// unclamped number. A map generator can therefore lay a kerb across the whole
// carriageway, paint no пешеходна пътека on it, and be booked for one zebra.
//
// §a sweeps the width so the claim is made at EVERY value rather than at two
// hand-picked ones: the count must equal „did this crossing add vertices", and
// the sweep self-checks that it contains both outcomes, so it cannot pass by
// containing only easy rows. It fails under `zebraCrossings++` (the wide rows
// book a zebra with no paint) AND under a guard that refuses everybody (the
// narrow rows lose theirs) — the two directions this programme keeps confusing.

/** The §6 fixture, unskewed, with a central refuge island of the given FULL
 *  width. `approachM`/`departM` are the shipped shape (pe-cane's 20/6) and are
 *  read only by `buildCrossingFurniture`, never by the painter. */
function islandCrossingDistrict(widthM: number): District {
  const base = skewedCrossingDistrict(0);
  const c = base.crossings[0]!;
  return assertDistrict({
    ...base,
    crossings: [{ ...c, island: { widthM, approachM: 20, departM: 6 } }],
  });
}

/**
 * How many vertices the CROSSING adds — `crossingPaint`'s reader without its
 * „and there must be some" precondition, because zero is the answer under test.
 * The prefix identity is still asserted: a crossing must not move one vertex of
 * the carriageway's own paint, which is what makes „everything past `a.length`"
 * the crossing's own and not an artefact of paint order.
 */
function crossingVertexCount(district: District, net: RoadNetwork): number {
  const bare = buildMarkings({ ...district, crossings: [] }, net, new Set(), new Set(), []);
  const full = buildMarkings(district, net, new Set(), new Set(), []);
  const a = bare.markings.positionsView;
  const b = full.markings.positionsView;
  expect(Array.from(b.slice(0, a.length))).toEqual(Array.from(a));
  return (b.length - a.length) / 3;
}

/** The width at which the UNCLAMPED painter's last bar disappeared, measured
 *  2026-08-19 by the sweep below before the O32 clamp landed: paint survived to
 *  13.0 m and was gone from 13.5 m, because the floored bar count puts the
 *  outermost bar at ±7.0 m rather than at the kerb. Written down as a NUMBER,
 *  not re-derived from the painter's own arithmetic, so §a's self-check cannot
 *  drift with the thing it is checking. */
const ISLAND_WIDTH_THAT_ONCE_ERASED_THE_ZEBRA_M = 13.5;

describe("zebraCrossings counts the paint, not the visit", () => {
  it("§a no island width erases the пешеходна пътека (O32)", () => {
    const rows: Array<{
      widthM: number;
      vertices: number;
      counted: number;
      clampedHalfW: number;
      nearestPaintM: number;
    }> = [];
    // 0…20 m in 0.5 m steps. The street is 16.25 m wide, so the top of the
    // range is a kerb wider than the carriageway — absurd as a road and exactly
    // what a generator bug writes, since `assertDistrict` validates nothing
    // about `island.widthM`.
    for (let half = 0; half <= 40; half++) {
      const widthM = half / 2;
      const district = islandCrossingDistrict(widthM);
      const net = analyzeNetwork(district);
      const vertices = crossingVertexCount(district, net);
      // The road runs +y from (0,0), so a vertex's x IS its offset across the
      // carriageway, and the nearest |x| is the innermost bar's near corner.
      const nearestPaintM =
        vertices > 0 ? Math.min(...crossingPaint(district, net).map((p) => Math.abs(p[0]))) : NaN;
      rows.push({
        widthM,
        vertices,
        counted: buildMarkings(district, net, new Set(), new Set(), []).zebraCrossings,
        clampedHalfW: crossingIslandHalfWidthM(widthM / 2, net.edgeById.get("skew-e")!.halfWidth, 0),
        nearestPaintM,
      });
    }
    // SELF-CHECK, and this is the whole reason the sweep is a sweep: it must
    // reach PAST the width that used to erase the crossing, or every row below
    // is an easy one and the loop proves nothing. Before the clamp this file
    // asserted the opposite — `rows.some((r) => r.vertices === 0)` — because a
    // zero was reachable; that assertion is what fails on the fixed painter,
    // which is the mutation proof that the two states are distinguishable.
    expect(rows.some((r) => r.widthM >= ISLAND_WIDTH_THAT_ONCE_ERASED_THE_ZEBRA_M)).toBe(true);
    // …and the clamp must actually BITE somewhere in the range, and NOT bite
    // everywhere: a clamp that fired on the 2.0 m shipped islands would be the
    // false-refusal direction, silently shrinking three authored kerbs.
    expect(rows.some((r) => r.clampedHalfW < r.widthM / 2 - 1e-6)).toBe(true);
    expect(rows.some((r) => r.widthM > 0 && r.clampedHalfW === r.widthM / 2)).toBe(true);

    for (const r of rows) {
      // THE INVARIANT O32 BUYS: paint exists at every authorable width, so the
      // grader — which arms off `paintsZebra`, i.e. off `kind`, and cannot see
      // bars — never convicts чл. 119 at a пътека the world did not draw.
      expect(r.vertices, `island ${r.widthM} m painted no bars`).toBeGreaterThan(0);
      expect(r.counted, `island ${r.widthM} m painted ${r.vertices} vertices`).toBe(1);
      // AND THE KERB NEVER COVERS THE PAINT — the half that made "clamp the
      // bars alone" unsafe. The road runs +y from (0,0), so a vertex's x IS its
      // offset across the carriageway; the near corner of the innermost bar
      // must sit outside the island the prism is raised from, which is the same
      // clamped number `buildCrossingFurniture` reads.
      if (r.widthM === 0) continue;
      const v = crossingPaint(islandCrossingDistrict(r.widthM), analyzeNetwork(islandCrossingDistrict(r.widthM)));
      const worst = Math.min(...v.map((p) => Math.abs(p[0])));
      expect(worst, `island ${r.widthM} m: paint ${worst.toFixed(3)} m from centreline`).toBeGreaterThanOrEqual(
        r.clampedHalfW - 1e-9,
      );
    }
  });

  it("§b the three shipped islands still paint, still count, and leave a real gap", () => {
    // The false-refusal direction. pe-bus 2.0, pe-cane 2.2, pe-slow 2.4 — every
    // island in content/world. A guard that answered „no zebra" here would
    // delete three пешеходни пътеки from three pedestrian lessons.
    for (const widthM of [2.0, 2.2, 2.4]) {
      const district = islandCrossingDistrict(widthM);
      const net = analyzeNetwork(district);
      const m = buildMarkings(district, net, new Set(), new Set(), []);
      expect(m.zebraCrossings, `${widthM} m`).toBe(1);
      // …and the count is not right for the wrong reason: the road runs +y from
      // (0,0), so a vertex's x IS its offset across the carriageway. Bars stand
      // on BOTH halves, and none is painted over the kerb — the quad's near
      // corner sits at |off| − ZEBRA_STRIPE_ACROSS_M/2 ≥ islandHalfW.
      const v = crossingPaint(district, net);
      const halfW = widthM / 2;
      expect(v.some((p) => p[0] < -halfW), `${widthM} m: no bar left of the island`).toBe(true);
      expect(v.some((p) => p[0] > halfW), `${widthM} m: no bar right of the island`).toBe(true);
      const worst = Math.min(...v.map((p) => Math.abs(p[0])));
      expect(worst, `${widthM} m: paint ${worst.toFixed(3)} m from the centreline`).toBeGreaterThan(
        halfW - 1e-9,
      );
    }
  });

  it("§c no committed district names a zebra the painter drops", () => {
    // What the counter is FOR, run over the corpus: every crossing that clears
    // the loop's data guards must contribute paint. The eligibility half is
    // re-derived here from the district alone — cheap, and deliberately not the
    // painter's own answer, or this would be `x === x`.
    const files = fs.readdirSync(WORLD_DIR!).filter((f) => f.endsWith(".json"));
    let zebras = 0;
    let islands = 0;
    for (const f of files) {
      const district = load(f.replace(/\.json$/, ""));
      const net = analyzeNetwork(district);
      let eligible = 0;
      for (const c of district.crossings) {
        if (!c.edgeId) continue;
        if (!paintsZebra(c)) continue;
        const eb = net.edgeById.get(c.edgeId);
        if (!eb) continue;
        if (projectOntoPolyline(eb.edge.geometry as Vec2[], [c.x, c.y]).distance > 25) continue;
        eligible++;
        if (c.island && c.island.widthM > 0) islands++;
      }
      const m = buildMarkings(district, net, new Set(), new Set(), []);
      expect(m.zebraCrossings, f).toBe(eligible);
      zebras += eligible;
    }
    // Measured 2026-08-19, and asserted so the corpus cannot silently shrink to
    // a set with no zebras and no islands, under which the loop above is vacuous.
    expect(files.length).toBeGreaterThanOrEqual(105);
    expect(zebras).toBeGreaterThanOrEqual(20);
    expect(islands).toBe(3);
  });

  // -------------------------------------------------------------------------
  // §d / §e — THE GRADER AGAINST THE PAINTER (O32)
  // -------------------------------------------------------------------------
  //
  // Everything above this line grades the PAINTER against itself: §c even says
  // so, re-deriving eligibility "deliberately not the painter's own answer".
  // That is a re-derivation of the same predicate, and a re-derivation cannot
  // catch the defect O32 is about, because the defect is that the GRADER asks a
  // DIFFERENT question. `runtime/zones.CrossingZoneTracker` arms off
  // `gradesCrossingDuty` → `paintsZebra`, which reads `kind`; the painter's bars
  // answer to `kind` AND the refuge island AND the host-edge projection. Two
  // predicates over different evidence, agreeing on the committed corpus by
  // luck rather than by construction.
  //
  // So these two run the REAL tracker, and §e runs the real reducer behind it.
  // MEASURED before the fix, on the §7 fixture with `island.widthM = 14`: 0
  // marking vertices, 1 armed zone, and PEDESTRIAN_CROSSING_TOO_FAST — a
  // 10-point опасна under чл. 119 at a пешеходна пътека the world never drew.

  /**
   * The runtime's `District` and the world parser's `District` are the same
   * document under two type names: `runtime/district.ts` narrows `edge.class`
   * to `RoadClass` where `world/types.ts` keeps it `string` (the parser has to
   * accept whatever the JSON carries; `assertDistrict` is the seam guard that
   * makes them agree at runtime). The runtime side is the NARROWER one, so this
   * is a widening the compiler cannot see through, not a lie about shape —
   * `runtime/__tests__/lane-paint-referent.test.ts` bridges it the same way.
   */
  const asRuntime = (d: District): RuntimeDistrict => d as unknown as RuntimeDistrict;

  /** Every crossing id the GRADER arms, obtained by DRIVING the tracker rather
   *  than by reading its privates: park the car on each crossing point, on that
   *  crossing's own host edge, and collect the zones that report entry. */
  function armedCrossingIds(district: District, index: DistrictIndex): Set<string> {
    const tracker = new CrossingZoneTracker(asRuntime(district), index);
    const out = new Set<string>();
    for (const c of district.crossings) {
      const host = c.edgeId ? index.edgeRtById(c.edgeId) : null;
      const evs: SimTickEvent[] = [];
      tracker.update(c.x, c.y, 0, host ? host.idx : -1, () => false, evs);
      for (const e of evs) if (e.kind === "crossingZoneEntered") out.add(e.crossingId);
    }
    return out;
  }

  /** Every crossing id the PAINTER actually drew bars for — one build per
   *  crossing, so a district's total cannot hide which one it came from. */
  function paintedCrossingIds(district: District, net: RoadNetwork): Set<string> {
    const out = new Set<string>();
    for (const c of district.crossings) {
      const one = { ...district, crossings: [c] };
      if (buildMarkings(one, net, new Set(), new Set(), []).zebraCrossings > 0) out.add(c.id);
    }
    return out;
  }

  it("§d over the whole corpus, GRADED === PAINTED ∪ жилищна зона", { timeout: 180_000 }, () => {
    const files = fs.readdirSync(WORLD_DIR!).filter((f) => f.endsWith(".json"));
    let armed = 0;
    let painted = 0;
    let livingZone = 0;
    for (const f of files) {
      const district = load(f.replace(/\.json$/, ""));
      if (district.crossings.length === 0) continue;
      const net = analyzeNetwork(district);
      const index = new DistrictIndex(asRuntime(district));
      const edgeById = new Map(district.roads.edges.map((e) => [e.id, e]));
      const paintedIds = paintedCrossingIds(district, net);
      // The ONE lawful graded-without-paint case: чл. 61–62 gives pedestrians
      // the whole carriageway in a жилищна зона, so the referent is the STREET.
      // A zebra painted there would teach the opposite of the law.
      const zoneIds = new Set(
        district.crossings
          .filter((c) => {
            const host = c.edgeId ? edgeById.get(c.edgeId) : undefined;
            return !paintsZebra(c) && host !== undefined && livingZoneCarriageway(host);
          })
          .map((c) => c.id),
      );
      const expected = [...new Set([...paintedIds, ...zoneIds])].sort();
      const actual = [...armedCrossingIds(district, index)].sort();
      // BOTH DIRECTIONS IN ONE EQUALITY, which is the point:
      //  ⊆ — nothing is graded that the world did not draw (the FALSE FAILURE,
      //      the founder's own roundabout complaint pointed at a zebra);
      //  ⊇ — nothing the world DID draw escapes grading (the FALSE CERTIFICATE:
      //      «Непропускане на пешеходец» is one of the two faults the reference
      //      lesson exists to teach, and deleting it is the same crime).
      expect(actual, f).toEqual(expected);
      armed += actual.length;
      painted += paintedIds.size;
      livingZone += zoneIds.size;
    }
    // Measured 2026-08-19 across 105 districts / 128 authored crossings. Pinned
    // so the corpus cannot shrink to one with no zebras, under which the
    // equality above is satisfied by two empty sets.
    expect(files.length).toBeGreaterThanOrEqual(105);
    expect(painted).toBeGreaterThanOrEqual(100);
    expect(livingZone).toBe(1);
    expect(armed).toBe(painted + livingZone);
  });

  it("§e the island that once erased the crossing now paints, and the kerb stays off the paint", () => {
    // The fixture drive, end to end through the three layers that disagreed.
    // 14 m of kerb on a 16.25 m street: absurd as a road, one number in a map
    // generator, and before O32 it produced a conviction with no пътека at all.
    const district = islandCrossingDistrict(14);
    const net = analyzeNetwork(district);
    const index = new DistrictIndex(asRuntime(district));

    // 1. THE PAINTER now draws the crossing (it drew 0 vertices before).
    const bars = crossingPaint(district, net);
    expect(bars.length).toBeGreaterThan(0);

    // 2. THE GRADER arms it — unchanged, and it must stay that way: standing
    //    the duty down here is the false-certificate direction.
    expect([...armedCrossingIds(district, index)]).toEqual(["skew-c"]);

    // 3. THE REDUCER still bills чл. 119 — and now the conviction is backed by
    //    paint the student could see. Same drive as before the fix; the only
    //    thing that changed is that the пешеходна пътека exists.
    const host = index.edgeRtById("skew-e")!;
    const tracker = new CrossingZoneTracker(asRuntime(district), index);
    let state = createRuleEngine();
    const codes: string[] = [];
    for (let i = 0; i <= 12; i++) {
      const y = 20 + i * 2.5;
      const evs: SimTickEvent[] = [];
      tracker.update(0, y, 0, host.idx, () => true, evs);
      const r = reduceTick(state, tick(i * 0.5, { speedKmh: 50, position: { x: 0, y }, events: evs }));
      state = r.state;
      for (const e of r.events) codes.push(e.code);
    }
    expect(codes).toContain("PEDESTRIAN_CROSSING_TOO_FAST");

    // 4. THE KERB IS OFF THE PAINT. `buildCrossingFurniture` raises its prism
    //    from the SAME clamp, so the island shrank with the gap instead of
    //    being drawn over the bars — the half that made "clamp the bars alone"
    //    unsafe. Sidewalk-mesh x is district x (mesh.toWorld is [x, h, −y]).
    const sidewalks = new MeshAccumulator();
    buildCrossingFurniture(district, net, { sidewalks, markings: new MeshAccumulator() });
    const kerbHalfW = Math.max(...[...sidewalks.positionsView].filter((_, i) => i % 3 === 0).map(Math.abs));
    const clamped = crossingIslandHalfWidthM(7, net.edgeById.get("skew-e")!.halfWidth, 0);
    expect(kerbHalfW).toBeCloseTo(clamped, 6);
    const nearestBar = Math.min(...bars.map((p) => Math.abs(p[0])));
    expect(nearestBar).toBeGreaterThanOrEqual(kerbHalfW - 1e-9);
    // …and the clamp really shrank it: 7 m was asked for, well under 7 given.
    expect(clamped).toBeLessThan(7);
  });
});

// ---------------------------------------------------------------------------
// 8. assertDistrict guards every field District declares required
// ---------------------------------------------------------------------------

describe("assertDistrict checks what District declares", () => {
  // It used to check `format`, `roads.nodes`, `roads.edges`, `buildings` and
  // `meta.attribution.text` — and nothing else — while the interface declares
  // `intersections`, `crossings`, `roundabouts` and `spawnPoints` required and
  // `analyzeNetwork` dereferences the first two unguarded. A document without
  // them PASSED the guard and crashed 300 lines later with a message naming
  // neither the field nor the file at fault. Three of this battery's fifteen
  // arrival failures were exactly that.
  //
  // Both directions are pinned, because a guard is a place where over-refusal
  // costs exactly what under-refusal does: the founder has been failed by an
  // engine for a manoeuvre he performed correctly, and credited by one for a
  // skill it never measured, and this file exists because of both.

  // 180 s, not the 5 s default, for the same reason §5 hoists its census: the
  // whole cost of these two is reading district JSON off disk for the first
  // time in the process, and on this box that is 0.07 s when the page cache
  // holds it and tens of seconds when it does not. Measured on the pair below,
  // one run each: 0.12 s and 0.59 s warm, 53.8 s COLD for the byte-for-byte
  // one, which blew the 5 s default and failed a corpus that was perfectly
  // fine. Neither number is a budget for computation — there is none here —
  // and a guard that hangs still hangs unboundedly, so a finite ceiling this
  // wide loses nothing a timeout was ever able to catch.
  it("every committed district still passes — the false-refusal direction", { timeout: 180_000 }, () => {
    // Making a guard stricter is only safe if the real corpus is proved
    // against it. It is: all of content/world/*.json already carry all four
    // arrays, so nothing on disk changes hands.
    expect(WORLD_DIR).toBeTruthy();
    const files = fs.readdirSync(WORLD_DIR!).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(90);
    for (const f of files) {
      const raw: unknown = JSON.parse(fs.readFileSync(path.join(WORLD_DIR!, f), "utf8"));
      expect(() => assertDistrict(raw), f).not.toThrow();
    }
  });

  it("…and so does the copy the BROWSER fetches, byte for byte", { timeout: 180_000 }, () => {
    // Every other assertion in this file reads content/world. A STUDENT reads
    // platform/public/world — `runtime/district.ts` fetches `/world/<id>.json`
    // — and the two being the same bytes is a build convention, not a law. A
    // corpus proved on the source while the served copy drifts is the same
    // shape of mistake as a booking that does not match its paint: the thing
    // measured is not the thing driven.
    //
    // They are identical today across all 105, which is what lets §5's census
    // and §7's guard speak for the browser. If a generator ever writes one and
    // not the other, this says so by name rather than letting a lesson grade a
    // world nobody checked.
    //
    // It is also the only test in src/modules/sim/world that opens
    // platform/public/world at all, so its 105 reads are ALWAYS cold there,
    // however warm content/world is by the time it runs — which is why this
    // one test was the whole of this file's cost in that suite, and why it was
    // the one that went red at 5 s while everything around it passed. The read
    // is the price of proving what a student actually downloads, and nothing
    // cheaper proves it: sizes can match while bytes do not, and only one of
    // the two copies is the one that gets driven.
    expect(PUBLIC_WORLD_DIR).toBeTruthy();
    const src = fs.readdirSync(WORLD_DIR!).filter((f) => f.endsWith(".json")).sort();
    const pub = fs.readdirSync(PUBLIC_WORLD_DIR!).filter((f) => f.endsWith(".json")).sort();
    // Two empty directories are byte-identical. 105 today, and the floor is its
    // own so this cannot pass on a corpus that vanished.
    expect(src.length).toBeGreaterThan(90);
    expect(pub).toEqual(src);
    const differ: string[] = [];
    for (const f of src) {
      if (!fs.readFileSync(path.join(PUBLIC_WORLD_DIR!, f)).equals(fs.readFileSync(path.join(WORLD_DIR!, f)))) {
        differ.push(f);
      }
    }
    expect(differ).toEqual([]);
  });

  it("…and a document missing any required field is refused at the seam", () => {
    const ok = skewedCrossingDistrict(0) as unknown as Record<string, unknown>;
    for (const field of [
      "roads",
      "intersections",
      "crossings",
      "roundabouts",
      "buildings",
      "spawnPoints",
    ]) {
      const broken: Record<string, unknown> = { ...ok };
      delete broken[field];
      expect(() => assertDistrict(broken), field).toThrow(/district-v1/);
    }
    // …and the named field is in the message, so the next person reading a CI
    // log does not have to bisect a builder to find out which one it was.
    const noRoundabouts: Record<string, unknown> = { ...ok };
    delete noRoundabouts.roundabouts;
    expect(() => assertDistrict(noRoundabouts)).toThrow(/roundabouts/);
    // The checks that were already there stay there.
    expect(() => assertDistrict({ ...ok, format: "district-v2" })).toThrow();
    expect(() => assertDistrict({ ...ok, meta: { attribution: {} } })).toThrow();
    expect(() => assertDistrict(null)).toThrow();
  });
});
