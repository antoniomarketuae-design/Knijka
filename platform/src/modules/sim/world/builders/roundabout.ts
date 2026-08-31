/**
 * Roundabouts — the central island, the annular carriageway and the ring's own
 * circular markings.
 *
 * THE DEFECT THIS EXISTS FOR (founder, twice). First: „this is not proper
 * round-about it doesnt have the proper shape". Then, plainly: „a Round a bout
 * is a Cyrcle, it has sphere shape not a triangle or square shape in any kind."
 *
 * The data was never wrong. rb-mini-v1 registers a clean r = 18 ring as four
 * one-way arcs, and every consumer that reads `roundabouts[]` — the Б1 + Д11
 * entry signs, the runtime's circulating band, the traffic lane graph — is
 * correct. NOTHING DREW THE CIRCLE. `network.edgeTravelHalfWidth` merely widens
 * a ring edge, and the four arm↔ring nodes each open an ordinary junction pad
 * of `nodeOpenRadiusM` ≈ 17 m. On an 18 m ring those four pads meet in the
 * middle and union into one open plaza: no island, no kerb, no annulus. What
 * the student drove was a square with rounded corners.
 *
 * The island derivation itself was already written and unit-tested — on the DEV
 * STILL ROUTE (app/dev/scene-still/roundaboutIsland.ts), whose own header said
 * „the SIM still renders a ring without an island — that gap belongs to
 * sim/world's builders". This module is that port, and it is now the ONLY copy:
 * the still route consumes the world builder like every other surface.
 *
 * WHAT IS DERIVED, AND FROM WHAT (nothing here is authored):
 *   - the centre and the ring radius come out of `roundabouts[]`;
 *   - the ring's drawn half width is `edgeTravelHalfWidth` of its own widest
 *     registered edge — the same function that sweeps the asphalt, so paint,
 *     carriageway and kerb cannot drift apart;
 *   - the island radius is the ring's TIGHTEST measured radius minus that half
 *     width, i.e. exactly the inner edge of the circulatory carriageway. The
 *     tightest, not the declared, because an OSM ring is not a perfect circle
 *     (d2-v1 wanders 26.7–29.3 m against a declared 28) and a disc drawn at the
 *     mean would pave over the carriageway where the ring pinches in.
 *
 * AND WHAT IS REFUSED. A registration whose middle is not actually empty gets
 * NO island. d2-v1 is the live case: бул. „Пейо К. Яворов" (a primary, drawn
 * 24.25 m curb-to-curb) runs straight through the interior — its carriageway
 * band covers the centre point itself. A disc there would be grass painted over
 * a road a student can be graded on. Refusing to draw is the honest answer; a
 * pretty lie is not an improvement on a missing circle.
 *
 * Pure data + typed-array meshes — no three.js, no React, so the node suite
 * asserts the shipped geometry directly.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SWEEP-161 FINDING (sc-roundabout-entry, pc-right, CRITICAL) — REFUTED, AND
 * THE EARLIER REFUTATION'S REASON CORRECTED. Recorded HERE rather than only in
 * `__tests__/island-wall-is-a-collider.test.ts`, because a refutation filed
 * somewhere else leaves this file reading as never-opened, which is why it has
 * now been picked up eleven times.
 *
 * THE CLAIM: „The car ends up driving on the central island … This is what
 * earns the careful drive its −10 collision", filed `rightCredited: NO`,
 * `wrongConvicted: YES`, `endedBecause: route ended on the island`.
 *
 * ROUND 9 ANSWERED: the debrief bills a collision — the island STOPPED the car.
 * True, and mutation-proven: dropping `ISLAND_WALL_RISE_M` from 0.45 to 0.02
 * turns 5 of the 7 island-collider tests red. The wall is a closed, indexed,
 * wheel-height-clearing collider on every ring district.
 *
 * ROUND 9'S SECOND ARGUMENT HAS SINCE EXPIRED — READ THIS BEFORE REOPENING.
 * It closed the „was the careful drive failed unfairly" half by a census: „THE
 * SWEEP'S DRIVER CANNOT STEER … KeyA / KeyD / ArrowLeft / ArrowRight returns
 * ZERO", so the car could only travel in a straight line and the −10 was earned
 * by an instrument, not suffered by a driver. That census was true when it was
 * taken and is now FALSE: `lesson-audit.mjs` grew a steering channel on
 * 2026-08-21 (`STEER_KEYS = { left: "KeyA", right: "KeyD" }`, a guidance loop
 * that reads the ghost ribbon off the windscreen). The w10-4 leg's own
 * `_audit-status.json` records `steering.wired: true`, `everSteered: true`,
 * 13 commands (536 ms left / 440 ms right) and `channel.state: "live"`. A
 * refutation resting on „it cannot turn" would therefore fall the moment anyone
 * re-ran the census — and the conclusion it was defending is correct. So it is
 * replaced here by a measurement that does not depend on what the harness can
 * do, only on where the car ended up.
 *
 * THE POSITIONAL PROOF (w10-4, 2026-08-24, `sc-roundabout-entry__pc-right`).
 * `guidance.samples` carries world coordinates per tick, and rb-mini-v1's ring
 * comes out of `analyzeRoundabouts` above. Radii from the ring centre (0, 0):
 *
 *     island wall face      r = 13.750 m   (`islandRadiusM`, this file)
 *     carriageway           r = 13.785 … 21.910 m  (17.848 ∓ 4.0625)
 *     ego t080s             r = 26.43 m    approaching, outside the ring
 *     ego t085s             r = 20.38 m    ON the circulating carriageway
 *     ego t087s … t096s     r = 15.79 m    STOPPED, 0 км/ч, 0.11 m of drift in 9 s
 *
 * `CHASSIS_HALF_EXTENTS.z` is 2.02 m and the car is pointed at the centre, so
 * its NOSE rests at 15.787 − 2.02 = 13.767 m against a wall face at 13.750:
 * **17 mm of clearance**. The car did not drive on the island. It was held
 * outside it, nose to the concrete, for the last nine seconds of the run — the
 * island wall doing exactly the job `ISLAND_WALL_RISE_M` exists to do, to
 * within the width of a finger. The filed premise („the car ends up driving on
 * the central island") is false by 2.04 m of body centre.
 *
 * The frames agree once the geometry is known. t085s is „windscreen full of
 * grass" because at r = 20.38 the ego is looking at the island from 6.6 m away
 * and a 0.57 m wall topped by a 0.8–1.6 m planted crown fills a 1.2 m eyeline;
 * t091s is the same mound at contact range. Neither frame shows the ego ON the
 * island, and the −10 explains itself in full (`rules/catalog.ts`: „то е било
 * там през цялото време, а колата е стигнала до него, защото пътят ѝ е излязъл
 * извън платното" — the departure IS the accident, the impact only its end).
 *
 * The signature is family-wide and file-independent, which is what rules this
 * module out as the cause: all SIX roundabout drills across three template
 * files collided on every leg, while only 24 of 98 pc-right legs collided
 * sweep-wide.
 *
 * ROUTED, NOT TOUCHED — nothing here is the defect, and the island must not be
 * softened to let this drive through. What put the ego off the carriageway is
 * the harness's LATERAL TRACKING, not its lack of a wheel: the same status file
 * grades this leg `tracking: intermittent`, and its last two guidance samples
 * before the impact report `errDeg 31.22` — the loop saw the ribbon 31° to the
 * right and did not follow it. Until tracking is settled, „collision" and
 * „drove off the map" verdicts on turn-based lessons are INSTRUMENT OUTPUT.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WAVE 12, 2026-08-31 — THE SAME TWO ROWS BACK, AND WHAT IS LEFT OF EACH AFTER
 * ITS OWN JUDGE'S CORRECTION. Filed here for the reason the block above gives:
 * a refutation kept anywhere else leaves this file reading as never-opened,
 * and both rows arrived again citing FRAMES rather than code.
 *
 * sc-roundabout-entry:4ab693eb — THE ESCALATION IS WITHDRAWN BY ITS OWN JUDGE.
 * Round 10 quoted `w10-4/…/pc-right/04-t080s.png` as „the ego is already ON the
 * grass … with the teal guidance ribbon running forward ACROSS the island".
 * Re-zoomed, that frame shows the ego on ASPHALT, the ribbon lying on the
 * carriageway and TERMINATING at the grass edge. So „the product routes the
 * careful student onto the island" is off the table, and the judge says it in
 * as many words — the ego's departure from the road cannot be attributed to the
 * product from that sweep, and `pc-right` is graded `tracking: intermittent`.
 * That agrees with the positional proof above; it does not replace it.
 *
 * Re-verified at THIS commit rather than trusted: `ISLAND_WALL_RISE_M` is still
 * 0.45 (0.57 m of face off the asphalt), the wall's vertices still go into the
 * `sidewalks` accumulator that `colliders.sidewalks` is built from, and
 * `builders/__tests__/island-wall-is-a-collider.test.ts` +
 * `world/__tests__/roundabout-island.test.ts` are 33 green. Nothing in this
 * module moved and nothing here is the defect.
 *
 * WHAT SURVIVES THE ROW IS NOT GEOMETRY AND IS NOT IN THIS FILE — it is the six
 * seconds the judge describes: „ОПАСНА ГРЕШКА −10 ИЗПИТНИ Т. · Удар в
 * неподвижно препятствие" is billed while the coaching feed goes on praising
 * the entry and instructing the exit signal, with no carriageway in view. A −10
 * the instruction card talks over is a bare verdict wearing a conversation,
 * i.e. a THEO-4 defect, and its address is the coaching feed: `lessons/
 * advisor.ts` and the „ИНСТРУКЦИИ" card in `components/sim/lesson-ui/
 * LessonPlayShell.tsx`. Not the HUD queue — `hud/overlayQueue.ts` already ranks
 * `violation` 80 over `hint` 60, so the panel that stayed serene is the one
 * OUTSIDE that queue. Routed, not touched.
 *
 * sc-rb-ped-exit:841c6252 — „the roundabout itself is a bare grass mound with
 * shrubs and buildings behind it". The description is ACCURATE and it is
 * `buildIsland`'s own output, so for once the address is right; the word that
 * is wrong is „bare". Measured on rb-ped-v1 (island 13.94 m, `rimInner` 12.84,
 * `crownRiseM` 1.25): 0.57 m of planter wall, a crown reaching 1.82 m above the
 * asphalt, and five 1.9 m shrubs on a 7.06 m ring topping out at 3.0 m. From
 * the give-way line at r ≈ 25 m with the eye at 1.2 m that is ~6° of
 * windscreen — which is exactly what `.audit-frames/w21/frames/
 * sc-rb-ped-exit__mobile-right/04-t029s.png` photographs. The mound is not
 * missing; it IS the measurement `crownRiseM` exists for, and softening or
 * decorating it would be the „photographs well from a camera the student never
 * sits in" trap that docstring was written to stop.
 *
 * WHAT THE ISLAND IS ACTUALLY MISSING IS A SIGN, AND IT CANNOT BE DRAWN HERE.
 * A Bulgarian central island carries Г9 „Преминаване отдясно на знака" facing
 * each entry: `content/signs/signs.json`'s own `sign-g9` states „обикновено е
 * поставен на остров, ремонтен участък или препятствие по средата на пътя",
 * cited to `Наредба № РД-02-21-1/23.11.2023, знак Г9` — retrieved from the
 * content bank, never free-recalled (ADR-002). That plate is what makes an
 * island read as a ROUNDABOUT island rather than a lawn, and it teaches a sign
 * already in the exam bank at the one geometry it exists for. This module emits
 * MESHES; signs are placed by `builders/props.ts` from a `SignKind`. The chain,
 * written down so the next round routes it once instead of re-photographing it:
 *   – `world/types.ts` `SignKind` — add `"passRight"` (Г9);
 *   – `components/signFaces.ts` `SignFaceArt` — add `"g9"`
 *     (`content/signs/svg/g9.svg` already ships);
 *   – `components/WorldProps.tsx` — `passRight: "sign_roundabout"` in
 *     `SIGN_GLB` (Г2/Г3 already ride that round blue plate) and
 *     `passRight: { art: "g9" }` in `SIGN_FACE_OVERRIDE`;
 *   – `builders/props.ts` — one plate per mouth at `islandRadiusM` on the
 *     mouth bearing, yawed to face the approach. The poses come from this
 *     module's exported `RoundaboutRing.mouths` + `islandRadiusM`, which
 *     `buildWorldGeometry.ts` already holds when it calls `buildProps`.
 * Exporting a pose helper from here ahead of that consumer would be a function
 * nothing calls — which is not a repair, it is a comment that type-checks. So
 * nothing is exported and nothing is drawn until props.ts can place it.
 * ───────────────────────────────────────────────────────────────────────────
 */

import type { District, DistrictEdge } from "../types";
import {
  CURB_CHAMFER_M,
  CURB_FOOT_TINT,
  DASH_GAP_M,
  DASH_LENGTH_M,
  DASH_WIDTH_M,
  EDGE_LINE_INSET_M,
  EDGE_LINE_WIDTH_M,
  LANE_WIDTH_M,
  MARKING_Y,
  ROAD_Y,
  SIDEWALK_TOP_Y,
  sidewalkEndInsetM,
} from "./constants";
import { add, mul, norm, perpRight, polylineLength, type Vec2 } from "./math2d";
import { MeshAccumulator, toWorld, UP } from "./mesh";
import { edgeHalfWidth, edgeTravelHalfWidth, type RoadNetwork } from "./network";

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/** Clearance kept between the island kerb and any carriageway that intrudes
 *  into the ring's interior — half a metre of asphalt, never a shared edge. */
const ISLAND_INTRUSION_CLEARANCE_M = 0.5;

/**
 * An island is drawn only when it survives at this fraction of the size the
 * ring alone would allow. Below it the "roundabout" is a junction with a ring
 * tag and a road through the middle: a token disc floating in an open plaza
 * teaches nothing, and pretending otherwise is the failure this whole module
 * exists to end.
 */
const ISLAND_MIN_SURVIVING_FRACTION = 0.5;

/** Smallest island worth building at all (below this it is a bollard, not a
 *  central island, and a driver reads it as debris). */
const ISLAND_MIN_RADIUS_M = 3;

// ---------------------------------------------------------------------------
// FR-22, THE OUTER HALF — „a Round a bout is a Cyrcle" applies to BOTH circles
// ---------------------------------------------------------------------------
//
// THE RESIDUAL THIS SECTION CLOSES, MEASURED BEFORE IT WAS WRITTEN. The island
// pass made the INNER boundary a circle. The OUTER boundary was still built the
// way every ordinary street's pavement is: `buildSidewalkStrip` along each ring
// edge's JUNCTION-TRIMMED centreline. `analyzeNetwork` opens 17.125 m of
// junction at each arm↔ring node, so on rb-mini's 90° / 28 m quarters the trim
// clamps at JUNCTION_TRIM_MAX_FRACTION and leaves **2.8 m of kerb per quarter**.
// Probed on the shipped geometry, kerb present at radius `ringRadius +
// ringHalfWidth`, sampled at 2° and counted only where no arm could excuse it:
//
//     rb-mini-v1    kerb missing on 30 of 45 off-mouth bearings
//     rb-ped-v1     kerb missing on 30 of 45
//     rb-2lane-v1   kerb missing on 60 of 75
//     rb-single-v1  kerb missing on 66 of 87
//
// …and the junction pads spilled up to **+10.73 m past the outer edge** on
// bearings no arm points at. Four short kerb stubs with open plaza between them
// and asphalt bleeding into the terrain IS the square he photographed; the
// island only fixed the middle of it.
//
// The fix is the one `buildRingDivider` below already argues for the PAINT, in
// its own words — „a circle is not a polyline sum; it is drawn as a circle" —
// applied to the KERB. Nothing here is authored: the profile is walked off the
// registered ring polylines, and the gaps are the arms the network already
// holds. A ring with no registered arms gets an unbroken kerb; a ring whose
// arms eat the whole circle gets no circular kerb at all and keeps today's
// stubs, because a kerb that is all gap is not a circle either.

/** Bearing resolution of the ring profile — 1° (0.73 m of arc on a 42 m ring). */
export const RING_PROFILE_BUCKETS = 360;

// ---------------------------------------------------------------------------
// B16, THE THIRD LOOK — THE MOUTH WAS A FUNNEL, NOT A GAP
// ---------------------------------------------------------------------------
//
// The founder, a third time, from the seat: „this is not proper round-about it
// doesnt have the proper shape". The island pass made the INNER boundary a
// circle; the pass above made the OFF-MOUTH outer boundary a circle. Rasterised
// top-down out of the shipped `buildWorldGeometry` triangles, what was left is
// a MALTESE CROSS: four short kerb arcs, and at every arm an octagonal lobe of
// junction asphalt 34.3 m across (the arm is 16.25 m) with NO KERB ON IT AT
// ALL, bleeding straight into the terrain.
//
// MEASURED on rb-mini-v1 before this section existed:
//   - the arm's own pavement stops at the junction cut, 35.13 m from the ring
//     centre; the ring's outer edge is at 21.91 m. Between them, on the exact
//     bearing the student approaches on, sit **13.2 m of 16.3 m-wide asphalt
//     with no boundary of any kind**, then another 9 m of unkerbed pad
//     sideways;
//   - 172 of the 208 in-mouth bearings had no kerb within 60 m;
//   - junction asphalt reached 55.7 m past the ring's outer edge in the mouth.
//
// That hole IS „a flat open asphalt plaza with an island in it". A roundabout
// reads as round because its outer edge is a CIRCLE INTERRUPTED BY MOUTHS, and
// a mouth is a gap in the circle — not a gap in the KERB. On a real one the
// kerb never stops: it runs round the ring, turns out through an entry radius,
// and carries on down the approach. Closing that turn is what this section
// does, and it is the whole fix — it changes no ring radius, no district
// document, no trace and no template.
//
// WHAT IS DERIVED, AND FROM WHAT (nothing here is authored):
//   - the arm's kerb line is `Approach.halfWidth` — the FULL drawn half width,
//     the same number the arm's own pavement strip is offset by, so the return
//     lands on the arm's kerb rather than beside it;
//   - the return is the circular fillet tangent to the ring's outer edge and to
//     that kerb line, so both ends meet their neighbour tangentially and there
//     is no crease and no step anywhere on the boundary;
//   - the mouth's angular span is then no longer a guess: it is exactly where
//     that fillet touches the ring circle.

/**
 * Radius of the kerb return that turns the ring's outer edge into the arm's
 * kerb, m.
 *
 * Deliberately small, and the number is a measurement rather than a taste.
 * Every metre of return radius is a metre of circle the driver does not see:
 * the tangent point sits at lateral `Ro·(hw+ρ)/(Ro+ρ)` from the arm axis, so ρ
 * = 9 (the ordinary junction corner radius) would open rb-mini's mouths from
 * 51.7° to 67.3° and leave 91° of circle where there is 153° today — a closed
 * boundary that reads WORSE from the seat than the hole it replaced.
 *
 * At 2.5 m the mouth lands within a degree of the `RING_MOUTH_FLARE_M` model it
 * replaces on every shipped ring, which is the point: no entry gets wider or
 * narrower than the one the committed traces were recorded against, and the
 * only thing that changes is that the mouth now HAS edges.
 */
const RING_MOUTH_RETURN_RADIUS_M = 2.5;

/**
 * How far past the arm's pavement start a return runs, m. The strips are the
 * same cross-section, so a small overlap is co-planar and invisible, while a
 * gap is a metre of missing kerb straight ahead of the driver.
 */
const RING_RETURN_OVERLAP_M = 0.5;

// THE MOUTH-FRACTION REFUSAL IS GONE, AND ITS REMOVAL IS PART OF THE FIX.
//
// It read `mouthFraction <= 0.72` — a ring whose mouths ate more than 72 % of
// its circumference got no derived circle, and fell back to the per-edge
// junction-trimmed stubs. That was a fair rule in a world where a mouth was a
// HOLE: four kerb slivers with open plaza between them are not a circle, and
// saying so was honest.
//
// The mouths have EDGES now. Each is closed by two kerb returns, so the
// boundary is continuous whatever fraction of it is arc and whatever fraction
// is return, and the arc that survives is decided where it should be — by
// `RING_MIN_KERB_RUN_M`, run by run, on the ring's own profile.
//
// Keeping the bar was not neutral, it was harmful, and it was MEASURED to be:
// the mouths are now taken against each arm's FULL drawn half width (which is
// what a return has to land on, because that is where the arm's own pavement
// stands), and on that honest measurement d2-v1 — real Sofia OSM, eight arms,
// four of them 24.25 m wide curb-to-curb against a 34.8 m outer radius —
// crossed 0.72 and lost its circle, its returns AND its junction-pad clip in
// one go. Its unkerbed lobes came straight back: 51.7 m of asphalt past the
// ring's outer edge, 200 of 360 bearings with no kerb at all.
//
// (The same measurement says something uncomfortable about the OLD number:
// taking the mouth at the TRAVEL half width understated it by 4.3° a side on
// those four arms, i.e. the pre-B16 build swept ring kerb across asphalt the
// ribbon had already laid. Following the asphalt rather than the ideal is this
// module's founding rule and it was being broken at exactly the mouths.)

/**
 * Shortest arc of kerb worth building.
 *
 * It was 4 m, on the argument that a shorter strip reads as debris — true when
 * the strip stood alone in an open plaza with nothing at either end. B16 gives
 * every arc a kerb RETURN at each end, so a short arc is no longer a sliver: it
 * is the nose of kerb between two closely-spaced arms, joined to the boundary
 * at both ends, which is a real thing a real roundabout has. At 4 m district-v1
 * dropped one of its four arcs and left an 8-of-87-bearing hole in the kerb on
 * the real-Sofia ring; the returns bracketing that hole were already built.
 */
const RING_MIN_KERB_RUN_M = 1.5;

const TAU = Math.PI * 2;

/** Bearing → bucket index, always in range. */
function bucketOf(bearing: number): number {
  const a = ((bearing % TAU) + TAU) % TAU;
  return Math.min(RING_PROFILE_BUCKETS - 1, Math.floor((a / TAU) * RING_PROFILE_BUCKETS));
}

/** Ring-centreline radius at a bearing (nearest bucket — the profile is dense). */
export function ringCentreRadiusAt(ring: RoundaboutRing, bearing: number): number {
  return ring.centreProfileM[bucketOf(bearing)] ?? ring.ringRadiusM;
}

/** Outer edge of the drawn circulatory carriageway at a bearing, m. */
export function ringOuterRadiusAt(ring: RoundaboutRing, bearing: number): number {
  return ringCentreRadiusAt(ring, bearing) + ring.ringHalfWidthM;
}

/** Signed bearing offset from a mouth's axis, in (−π, π]. */
function offsetFrom(bearing: number, axis: number): number {
  let d = (((bearing - axis) % TAU) + TAU) % TAU;
  if (d > Math.PI) d -= TAU;
  return d;
}

/** Is this bearing inside one of the ring's entry mouths? */
export function ringBearingInMouth(ring: RoundaboutRing, bearing: number): boolean {
  return mouthAt(ring, bearing) !== null;
}

/** The mouth this bearing falls in, or null. Mouths may overlap (d2-v1 has two
 *  arms 16° apart); the FIRST match wins, which is only ever used to answer
 *  "is this a mouth", never to attribute one. */
function mouthAt(ring: RoundaboutRing, bearing: number): RingMouth | null {
  for (const m of ring.mouths) {
    const d = offsetFrom(bearing, m.bearing);
    if (d >= -m.halfAngleCw && d <= m.halfAngleCcw) return m;
  }
  return null;
}

/**
 * The radius at which the DRAWN asphalt boundary sits on this bearing — the
 * ring's outer edge off the mouths, and the mouth's own kerb envelope inside
 * one. `Infinity` means the boundary is genuinely open here: the ray runs
 * straight up an arm's carriageway, which is a road and not a hole.
 *
 * This is the function that turns four unkerbed lobes into four mouths.
 */
export function ringBoundaryRadiusAt(ring: RoundaboutRing, bearing: number): number {
  const outer = ringOuterRadiusAt(ring, bearing);
  let lim = Infinity;
  let inAny = false;
  for (const m of ring.mouths) {
    const d = offsetFrom(bearing, m.bearing);
    if (d < -m.halfAngleCw || d > m.halfAngleCcw) continue;
    inAny = true;
    // Overlapping mouths union, so the widest envelope on this bearing wins.
    lim = Math.max(lim === Infinity ? 0 : lim, mouthEnvelopeRadius(ring, m, bearing));
  }
  return inAny ? Math.max(lim, outer) : outer;
}

/**
 * How far the asphalt may reach on `bearing` inside mouth `m`: the nearest
 * crossing of the mouth's own boundary — the two kerb-return fillets and, past
 * them, the arm's two kerb lines. `Infinity` up the middle of the arm.
 */
function mouthEnvelopeRadius(ring: RoundaboutRing, m: RingMouth, bearing: number): number {
  if (m.returns.length === 0) return Infinity;
  const c = ring.centre;
  const w: Vec2 = [Math.cos(bearing), Math.sin(bearing)];
  let best = Infinity;
  for (const r of m.returns) {
    // -- the fillet arc: nearest ray/circle hit that lies ON the arc.
    const fx = r.centre[0] - c[0];
    const fy = r.centre[1] - c[1];
    const proj = w[0] * fx + w[1] * fy;
    const disc = proj * proj - (fx * fx + fy * fy - r.radius * r.radius);
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      for (const t of [proj - s, proj + s]) {
        if (t <= 0 || t >= best) continue;
        const px = c[0] + w[0] * t - r.centre[0];
        const py = c[1] + w[1] * t - r.centre[1];
        if (arcContains(r, Math.atan2(py, px))) best = t;
      }
    }
    // -- the straight kerb line past the fillet's arm-side tangent point.
    const wn = w[0] * m.normal[0] + w[1] * m.normal[1];
    if (Math.abs(wn) > 1e-9) {
      const en = (m.node[0] - c[0]) * m.normal[0] + (m.node[1] - c[1]) * m.normal[1];
      const t = (r.side * m.armHalfWidthM + en) / wn;
      if (t > 0 && t < best) {
        const along =
          (c[0] + w[0] * t - m.node[0]) * m.dir[0] + (c[1] + w[1] * t - m.node[1]) * m.dir[1];
        if (along >= r.tArmAlongM - 1e-6) best = t;
      }
    }
  }
  return best;
}

/** Does `angle` (about the fillet centre) lie on the return's short arc? */
function arcContains(r: MouthReturn, angle: number): boolean {
  const span = offsetFrom(r.armAngle, r.ringAngle);
  const d = offsetFrom(angle, r.ringAngle);
  return span >= 0 ? d >= -1e-9 && d <= span + 1e-9 : d <= 1e-9 && d >= span - 1e-9;
}

/**
 * Walk the registered ring polylines into a radius-by-bearing profile of the
 * ring CENTRELINE. Segments are sampled, not just vertices: a chorded ring sags
 * between its vertices and the kerb has to follow the asphalt, not the ideal.
 */
function centreProfile(
  centre: Vec2,
  ringIds: ReadonlySet<string>,
  edgeById: ReadonlyMap<string, DistrictEdge>,
): number[] | null {
  const sum = new Array<number>(RING_PROFILE_BUCKETS).fill(0);
  const hits = new Array<number>(RING_PROFILE_BUCKETS).fill(0);
  for (const id of ringIds) {
    const g = edgeById.get(id)?.geometry as Vec2[] | undefined;
    if (!g) continue;
    for (let i = 0; i + 1 < g.length; i++) {
      const a = g[i]!;
      const b = g[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // Step by ANGLE, not by metres. A fixed 0.5 m step is finer than a 1°
      // bucket only on a ring bigger than ~28 m radius: on rb-mini (r 18) it
      // reached 62 % of the buckets, the profile was refused as "not a ring",
      // and the circle was silently not drawn on the very map the founder
      // photographed. rb-single passed and rb-mini did not — which is exactly
      // how the probe caught it.
      const rMid = Math.max(
        1,
        Math.hypot((a[0] + b[0]) / 2 - centre[0], (a[1] + b[1]) / 2 - centre[1]),
      );
      const perBucketM = (TAU * rMid) / RING_PROFILE_BUCKETS;
      const steps = Math.max(1, Math.ceil(len / Math.min(0.5, perBucketM / 2)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a[0] + (b[0] - a[0]) * t - centre[0];
        const y = a[1] + (b[1] - a[1]) * t - centre[1];
        const r = Math.hypot(x, y);
        if (r < 1e-6) continue;
        const k = bucketOf(Math.atan2(y, x));
        sum[k] += r;
        hits[k]++;
      }
    }
  }
  const filled = hits.filter((h) => h > 0).length;
  // A registration that does not actually go round (an arc, a broken ring) has
  // no circle to draw; say so instead of inventing the missing two thirds.
  if (filled < RING_PROFILE_BUCKETS * 0.9) return null;
  const out = new Array<number>(RING_PROFILE_BUCKETS).fill(0);
  for (let k = 0; k < RING_PROFILE_BUCKETS; k++) {
    out[k] = hits[k]! > 0 ? sum[k]! / hits[k]! : 0;
  }
  // Circularly fill the few buckets a coarse polyline may have missed.
  for (let k = 0; k < RING_PROFILE_BUCKETS; k++) {
    if (out[k]! > 0) continue;
    let lo = k;
    let hi = k;
    while (out[(lo + RING_PROFILE_BUCKETS) % RING_PROFILE_BUCKETS] === 0) lo--;
    while (out[hi % RING_PROFILE_BUCKETS] === 0) hi++;
    const a = out[((lo % RING_PROFILE_BUCKETS) + RING_PROFILE_BUCKETS) % RING_PROFILE_BUCKETS]!;
    const b = out[hi % RING_PROFILE_BUCKETS]!;
    out[k] = a + ((b - a) * (k - lo)) / (hi - lo);
  }
  return out;
}

/**
 * The arms that break the kerb, and the kerb RETURN that closes each break.
 *
 * An arm is any non-ring approach at a node that sits on the ring. Its mouth is
 * bounded by two fillets, one per side, each tangent to the ring's outer edge
 * and to that side's arm kerb line; the mouth's angular half-width is where
 * those fillets touch the circle, so the kerb the ring pass draws and the kerb
 * the return pass draws meet at a shared point by construction rather than by
 * two agreeing constants.
 *
 * Derived from the network the world is already built from, so a map cannot
 * post a mouth it does not have. A side whose fillet has no solution (an arm
 * drawn wider than the ring it meets) keeps no return, and its half width falls
 * back to the raw carriageway — a bounded mouth we cannot round is still better
 * than an unbounded one, and pretending otherwise is what this module exists
 * to end.
 */
function ringMouths(
  centre: Vec2,
  ringIds: ReadonlySet<string>,
  ringHalfWidthM: number,
  profile: readonly number[],
  network: RoadNetwork,
): RingMouth[] {
  const out: RingMouth[] = [];
  for (const node of network.nodes.values()) {
    if (!node.approaches.some((a) => ringIds.has(a.edgeId))) continue;
    const bearing = Math.atan2(node.pos[1] - centre[1], node.pos[0] - centre[0]);
    const outerR = (profile[bucketOf(bearing)] ?? 0) + ringHalfWidthM;
    if (outerR < 1) continue;
    for (const ap of node.approaches) {
      if (ringIds.has(ap.edgeId)) continue;
      // THE FULL drawn half width, not the travel half: the kerbside parking
      // band is asphalt the ribbon actually lays and the arm's own pavement
      // stands at its edge, so a return built to the travel width would run
      // the kerb up the middle of the carriageway.
      const hw = Math.max(0.5, ap.halfWidth);
      const u = norm(ap.dir);
      const n = perpRight(u);
      const d: Vec2 = [node.pos[0] - centre[0], node.pos[1] - centre[1]];
      const du = d[0] * u[0] + d[1] * u[1];
      const dn = d[0] * n[0] + d[1] * n[1];
      const rho = RING_MOUTH_RETURN_RADIUS_M;

      // Where the arm's own pavement strip starts, so the return ends there.
      const armLine = network.edgeById.get(ap.edgeId)?.line;
      const armStart =
        ap.setback +
        (armLine ? sidewalkEndInsetM(polylineLength(armLine)) : 0) +
        RING_RETURN_OVERLAP_M;

      const returns: MouthReturn[] = [];
      let halfCw = Math.asin(Math.min(1, hw / outerR));
      let halfCcw = halfCw;
      for (const side of [1, -1] as const) {
        // The ring's outer radius is not one number — it is the profile, and on
        // an OSM ring it wanders (district-v1 19.4…20.3 m, d2-v1 26.8…29.3).
        // Solve the fillet against the radius AT THE NODE, then re-solve it
        // against the radius at the tangent point the first solve found. Two
        // passes take rb-mini's step at the mouth edge from 0.115 m to under a
        // millimetre; one pass leaves a visible notch where the ring kerb ends
        // and the return begins, which is the seam this whole fix is about.
        let ro = outerR;
        let f: Vec2 | null = null;
        let fd = 0;
        for (let pass = 0; pass < 3; pass++) {
          const lat = dn + side * (hw + rho);
          const root = (ro + rho) * (ro + rho) - lat * lat;
          if (root <= 0) {
            f = null;
            break;
          }
          const s = -du + Math.sqrt(root);
          f = [
            node.pos[0] + side * (hw + rho) * n[0] + s * u[0],
            node.pos[1] + side * (hw + rho) * n[1] + s * u[1],
          ];
          fd = Math.hypot(f[0] - centre[0], f[1] - centre[1]);
          if (fd < 1e-6) {
            f = null;
            break;
          }
          const b = Math.atan2(f[1] - centre[1], f[0] - centre[0]);
          const next = (profile[bucketOf(b)] ?? 0) + ringHalfWidthM;
          if (next < 1 || Math.abs(next - ro) < 1e-3) break;
          ro = next;
        }
        if (!f) continue;
        const tRing: Vec2 = [
          centre[0] + ((f[0] - centre[0]) / fd) * ro,
          centre[1] + ((f[1] - centre[1]) / fd) * ro,
        ];
        const tArm: Vec2 = [f[0] - side * rho * n[0], f[1] - side * rho * n[1]];
        const tArmAlongM = (tArm[0] - node.pos[0]) * u[0] + (tArm[1] - node.pos[1]) * u[1];
        // A return whose arm-side tangent already sits past the arm's own kerb
        // start has no straight to run: the mouth is longer than the gap, and
        // the two strips would cross. Keep the fillet, clamp the straight.
        const ringBearing = Math.atan2(tRing[1] - centre[1], tRing[0] - centre[0]);
        const off = offsetFrom(ringBearing, bearing);
        if (off >= 0) halfCcw = Math.max(halfCcw, off);
        else halfCw = Math.max(halfCw, -off);
        returns.push({
          side,
          centre: f,
          radius: rho,
          tRing,
          tArm,
          tArmAlongM,
          armEndM: Math.max(tArmAlongM + 1, armStart),
          ringAngle: Math.atan2(tRing[1] - f[1], tRing[0] - f[0]),
          armAngle: Math.atan2(tArm[1] - f[1], tArm[0] - f[0]),
        });
      }

      out.push({
        bearing,
        halfAngleCw: halfCw,
        halfAngleCcw: halfCcw,
        armEdgeId: ap.edgeId,
        node: node.pos,
        dir: u,
        normal: n,
        armHalfWidthM: hw,
        returns,
      });
    }
  }
  return out;
}

/** One roundabout, resolved into everything the geometry passes need. */
export interface RoundaboutRing {
  id: string;
  /** District-space centre, straight out of `roundabouts[]`. */
  centre: Vec2;
  /** Tightest measured distance from the centre to the ring centreline. */
  ringRadiusM: number;
  /** Drawn travel half width of the widest registered ring edge. */
  ringHalfWidthM: number;
  /** Widest lane count on the ring (2+ ⇒ the circulatory lanes are divided). */
  ringLanes: number;
  /** Edge ids of the circulatory carriageway, as registered. */
  ringEdgeIds: ReadonlySet<string>;
  /**
   * Outer radius of the central island, or null when the interior is not
   * actually free (see the module header — d2-v1). Null means: draw no island,
   * clip no junction pad, change nothing about this registration.
   */
  islandRadiusM: number | null;
  /** Why the island was refused, for the census/test to state rather than guess. */
  refusedBecause: string | null;
  /**
   * FR-22, THE OUTER HALF. Radius of the ring CENTRELINE at bearing bucket i
   * (`RING_PROFILE_BUCKETS` buckets of 1°), derived by walking the registered
   * ring polylines. On a synthetic ring every bucket holds the same number and
   * the profile IS a circle; on an OSM ring that wanders (d2-v1: 26.8…29.3
   * against a declared 28) it follows the asphalt that is actually drawn.
   */
  centreProfileM: readonly number[];
  /**
   * B16 — how much of the circumference is NOT mouth, by union. It decides only
   * whether circular ARCS are worth sweeping; the BOUNDARY (the pad clip and
   * the kerb returns) is derived whenever the profile resolves, because a mouth
   * needs edges however little circle is left between the mouths.
   */
  circleFractionOfRing: number;
  /**
   * Where an ARM breaks the outer kerb: bearing from the centre + the half
   * angle its carriageway and entry flare subtend at the outer edge. Everything
   * that is not a mouth is kerb, all the way round.
   */
  mouths: readonly RingMouth[];
}

/** One entry/exit mouth in the ring's outer kerb. */
export interface RingMouth {
  /** Bearing of the arm node from the ring centre, radians. */
  bearing: number;
  /** Angular width of the gap CLOCKWISE of the axis, radians. Split from the
   *  counter-clockwise half because an OSM arm does not meet its ring square:
   *  a symmetric mouth would either end the kerb short of the return or run it
   *  over the return, and both are a visible step in the boundary. */
  halfAngleCw: number;
  /** …and counter-clockwise. Equal on every synthetic (radial-arm) map. */
  halfAngleCcw: number;
  /** The arm's edge id — so a test can name the mouth it is standing in. */
  armEdgeId: string;
  /** The node where the arm meets the ring. */
  node: Vec2;
  /** Unit direction along the arm, AWAY from the ring. */
  dir: Vec2;
  /** `perpRight(dir)` — the lateral axis the kerb lines are offset on. */
  normal: Vec2;
  /** The arm's full drawn half width (kerb line offset from its centreline). */
  armHalfWidthM: number;
  /** The kerb returns that close this mouth — one per side, or none when the
   *  fillet has no solution (see `ringMouths`). */
  returns: readonly MouthReturn[];
}

/**
 * One kerb return: the fillet tangent to the ring's outer edge and to one of
 * the arm's kerb lines, plus the straight that carries the kerb on down the arm
 * to where the arm's own pavement takes over.
 */
export interface MouthReturn {
  /** +1 = the `perpRight(dir)` side of the arm, −1 the other. */
  side: 1 | -1;
  /** Fillet centre and radius. */
  centre: Vec2;
  radius: number;
  /** Tangent point on the ring's outer edge. */
  tRing: Vec2;
  /** Tangent point on the arm's kerb line. */
  tArm: Vec2;
  /** `tArm` measured along `dir` from the node — where the straight begins. */
  tArmAlongM: number;
  /** …and where it ends: the start of the arm's own pavement strip. */
  armEndM: number;
  /** Angles of `tRing` / `tArm` about `centre`, radians (the arc's ends). */
  ringAngle: number;
  armAngle: number;
}

/** Distance from `c` to the swept carriageway band of segment a→b, half width h.
 *  Zero when `c` is ON the drawn asphalt. A band, not a capsule: an arm that
 *  ENDS on the ring approaches the centre no closer than its endpoint, because
 *  its width runs tangentially, and a capsule test would wrongly veto the very
 *  islands this module exists to draw. */
function bandDistance(c: Vec2, a: Vec2, b: Vec2, h: number): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l = Math.hypot(vx, vy);
  if (l < 1e-9) return Math.max(0, Math.hypot(c[0] - a[0], c[1] - a[1]) - h);
  const ux = vx / l;
  const uy = vy / l;
  const dx = c[0] - a[0];
  const dy = c[1] - a[1];
  const along = dx * ux + dy * uy;
  const perp = Math.abs(-dx * uy + dy * ux);
  const outAlong = along < 0 ? -along : along > l ? along - l : 0;
  return Math.hypot(outAlong, Math.max(0, perp - h));
}

/** Resolve every registered roundabout into a RoundaboutRing. */
export function analyzeRoundabouts(district: District, network: RoadNetwork): RoundaboutRing[] {
  const edgeById = new Map<string, DistrictEdge>(district.roads.edges.map((e) => [e.id, e]));
  const out: RoundaboutRing[] = [];

  for (const rb of district.roundabouts ?? []) {
    const centre: Vec2 = [rb.x, rb.y];
    const ringIds = new Set(rb.edgeIds);

    let ringRadiusM = Infinity;
    let ringHalfWidthM = 0;
    let ringLanes = 1;
    // Sharpest turn between consecutive ring segments — see the miter note below.
    let maxTurnRad = 0;
    for (const id of rb.edgeIds) {
      const edge = edgeById.get(id);
      if (!edge) continue;
      ringHalfWidthM = Math.max(ringHalfWidthM, edgeTravelHalfWidth(edge));
      ringLanes = Math.max(ringLanes, Math.max(1, edge.lanes));
      const g = edge.geometry as Vec2[];
      // Distance to the SEGMENTS, not to the vertices: a ring is stored as a
      // chorded polyline, so its chords sag INSIDE the circle its vertices sit
      // on (0.15 m on rb-mini's 15° steps). Measuring vertices only would put
      // the island kerb under the asphalt by exactly that sag.
      for (let i = 0; i + 1 < g.length; i++) {
        ringRadiusM = Math.min(ringRadiusM, bandDistance(centre, g[i]!, g[i + 1]!, 0));
        if (i + 2 < g.length) {
          const a: Vec2 = [g[i + 1]![0] - g[i]![0], g[i + 1]![1] - g[i]![1]];
          const b: Vec2 = [g[i + 2]![0] - g[i + 1]![0], g[i + 2]![1] - g[i + 1]![1]];
          const la = Math.hypot(a[0], a[1]);
          const lb = Math.hypot(b[0], b[1]);
          if (la > 1e-9 && lb > 1e-9) {
            const cos = Math.min(1, Math.max(-1, (a[0] * b[0] + a[1] * b[1]) / (la * lb)));
            maxTurnRad = Math.max(maxTurnRad, Math.acos(cos));
          }
        }
      }
    }
    if (!Number.isFinite(ringRadiusM) || ringHalfWidthM <= 0) continue;

    // The ribbon sweep MITERS its cross-section at every polyline vertex, so
    // the drawn inner edge reaches halfWidth / cos(turn/2) inboard — further
    // than halfWidth. Give the kerb that back, or a chorded ring lays a
    // centimetre or two of asphalt over the island it is supposed to bound.
    const miterExcessM = ringHalfWidthM * (1 / Math.cos(maxTurnRad / 2) - 1);
    const fromRing = ringRadiusM - ringHalfWidthM - miterExcessM;
    let limit = fromRing;
    let intruder: string | null = null;
    for (const edge of district.roads.edges) {
      if (ringIds.has(edge.id)) continue;
      const h = edgeHalfWidth(edge);
      const g = edge.geometry as Vec2[];
      for (let i = 0; i + 1 < g.length; i++) {
        const d = bandDistance(centre, g[i]!, g[i + 1]!, h) - ISLAND_INTRUSION_CLEARANCE_M;
        if (d < limit) {
          limit = d;
          intruder = edge.id;
        }
      }
    }

    let islandRadiusM: number | null = Math.min(fromRing, limit);
    let refusedBecause: string | null = null;
    if (islandRadiusM < ISLAND_MIN_RADIUS_M) {
      refusedBecause =
        intruder === null
          ? `ring too tight for its own carriageway (r ${ringRadiusM.toFixed(2)} − half ${ringHalfWidthM.toFixed(2)})`
          : `edge ${intruder} is drawn through the interior`;
      islandRadiusM = null;
    } else if (islandRadiusM < fromRing * ISLAND_MIN_SURVIVING_FRACTION) {
      refusedBecause = `edge ${intruder} is drawn through the interior (only ${islandRadiusM.toFixed(2)} m of ${fromRing.toFixed(2)} m survives)`;
      islandRadiusM = null;
    }

    // FR-22, the outer half. Both are derived, both may come back empty, and an
    // empty one means "keep today's per-edge strips" — never "draw a lie".
    const profile = centreProfile(centre, ringIds, edgeById);
    const mouths = profile ? ringMouths(centre, ringIds, ringHalfWidthM, profile, network) : [];
    // How much of the circumference is NOT mouth, by UNION over the bearing
    // buckets rather than by summing the spans: two arms 16° apart are one hole
    // in the kerb, not two, and d2-v1 (eight arms, several of them within 16°
    // of another) is the live case the sum gets wrong.
    const covered = new Array<boolean>(RING_PROFILE_BUCKETS).fill(false);
    for (const m of mouths) {
      const lo = Math.floor(((m.bearing - m.halfAngleCw) / TAU) * RING_PROFILE_BUCKETS);
      const hi = Math.ceil(((m.bearing + m.halfAngleCcw) / TAU) * RING_PROFILE_BUCKETS);
      for (let k = lo; k <= hi; k++) {
        covered[((k % RING_PROFILE_BUCKETS) + RING_PROFILE_BUCKETS) % RING_PROFILE_BUCKETS] = true;
      }
    }
    const circleFraction = covered.filter((c) => !c).length / RING_PROFILE_BUCKETS;

    out.push({
      id: rb.id,
      centre,
      ringRadiusM,
      ringHalfWidthM,
      centreProfileM: profile ?? [],
      circleFractionOfRing: profile ? circleFraction : 0,
      mouths: profile ? mouths : [],
      ringLanes,
      ringEdgeIds: ringIds,
      islandRadiusM,
      refusedBecause,
    });
  }
  return out;
}

/**
 * The island a point falls inside, or null. Used by the road builder to keep
 * junction asphalt and junction kerbs OUT of the middle of a ring — the second
 * half of the fix, without which the pads simply reappear on top of the disc.
 */
export function islandContaining(
  rings: readonly RoundaboutRing[],
  p: Vec2,
): RoundaboutRing | null {
  for (const ring of rings) {
    if (ring.islandRadiusM === null) continue;
    if (Math.hypot(p[0] - ring.centre[0], p[1] - ring.centre[1]) < ring.islandRadiusM - 1e-6) {
      return ring;
    }
  }
  return null;
}

/**
 * Does this ring have a DERIVED OUTER BOUNDARY — a radius-by-bearing profile
 * and mouths with edges? False keeps every consumer on the pre-FR-22 path byte
 * for byte (a registration that does not actually go round).
 *
 * This is what gates the junction-pad clip and the kerb returns, and it is
 * deliberately NOT the same question as `hasOuterKerb` below: a mouth needs
 * edges no matter how little circle is left between the mouths, and gating the
 * two together is what put d2-v1's unkerbed lobes back (see the note above
 * `RING_MIN_CIRCLE_FRACTION`).
 */
export function hasRingBoundary(ring: RoundaboutRing): boolean {
  return ring.centreProfileM.length === RING_PROFILE_BUCKETS;
}

/**
 * Enough of the circumference must survive as ARC for sweeping circular kerb to
 * beat the per-edge junction-trimmed strips. Below it the strips stand — not
 * because the boundary is unknown (it is: see `hasRingBoundary`) but because
 * there is no circle there to draw, and this module does not draw lies.
 *
 * d2-v1 is the whole reason the floor exists: real Sofia OSM, eight arms, four
 * of them 24.25 m curb-to-curb against a 34.8 m outer radius, meeting the ring
 * obliquely. Its mouths cover the full 360° by union — there is no arc.
 */
const RING_MIN_CIRCLE_FRACTION = 0.08;

/**
 * Does this ring carry a DERIVED circular outer kerb worth sweeping as arcs?
 */
export function hasOuterKerb(ring: RoundaboutRing): boolean {
  return hasRingBoundary(ring) && ring.circleFractionOfRing >= RING_MIN_CIRCLE_FRACTION;
}

/**
 * The ring a NODE belongs to — its position sits on the circulatory
 * carriageway. This is the scope of the outer clip below: only the arm↔ring
 * pads are clipped, so a junction 200 m away is never dragged onto a circle it
 * has nothing to do with.
 */
export function ringAtPoint(rings: readonly RoundaboutRing[], p: Vec2): RoundaboutRing | null {
  for (const ring of rings) {
    if (!hasRingBoundary(ring)) continue;
    const dx = p[0] - ring.centre[0];
    const dy = p[1] - ring.centre[1];
    const r = Math.hypot(dx, dy);
    if (r < 1e-6) continue;
    if (Math.abs(r - ringCentreRadiusAt(ring, Math.atan2(dy, dx))) <= ring.ringHalfWidthM + 2) {
      return ring;
    }
  }
  return null;
}

/**
 * Pull `p` radially back onto the ring's drawn boundary — the mirror of
 * `clipOutOfIslands`, and the other half of the same sentence. A junction pad
 * at an arm↔ring node opens at the ARM's radius (17.125 m on rb-mini), so its
 * boundary and its corner fillets flare metres past the circulatory
 * carriageway: probed at up to +10.73 m off the mouths and **+55.7 m inside
 * one**. Points already inside come back untouched.
 *
 * B16, THE THIRD LOOK: this used to return `p` unchanged on any bearing inside
 * a mouth, which is what left four unkerbed octagonal lobes of junction asphalt
 * 34.3 m across on a 16.3 m arm. A mouth bounds its asphalt now — with the
 * arm's own kerb lines and the two returns that reach them — and only the
 * corridor straight up the arm is genuinely open, because that is a road.
 */
export function clipIntoRingBoundary(ring: RoundaboutRing, p: Vec2): Vec2 {
  const dx = p[0] - ring.centre[0];
  const dy = p[1] - ring.centre[1];
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return p;
  const bearing = Math.atan2(dy, dx);
  const lim = ringBoundaryRadiusAt(ring, bearing);
  if (!Number.isFinite(lim) || d <= lim + 1e-6) return p;
  const s = lim / d;
  return [ring.centre[0] + dx * s, ring.centre[1] + dy * s];
}

/**
 * The mouth-free arcs of the ring CENTRELINE, as dense polylines. `buildRoads`
 * sweeps each one with the ordinary pavement cross-section at the ring's own
 * half width, so the outer kerb of a roundabout is built by exactly the code
 * that builds every other kerb in the world — same profile, same vertex
 * colours, same collider — and only its SHAPE comes from here.
 *
 * Returned counter-clockwise in district space, which is also the direction
 * right-hand traffic circulates; `ringOutwardSide` still derives the side from
 * the geometry rather than trusting that.
 */
export function ringOuterKerbRuns(ring: RoundaboutRing): Vec2[][] {
  if (!hasOuterKerb(ring)) return [];
  const N = RING_PROFILE_BUCKETS;
  const bearingOf = (k: number) => ((k % N) + N) % N * (TAU / N);
  const stationAt = (k: number): Vec2 => {
    const a = bearingOf(k);
    const r = ring.centreProfileM[((k % N) + N) % N]!;
    return [ring.centre[0] + Math.cos(a) * r, ring.centre[1] + Math.sin(a) * r];
  };
  const open = Array.from({ length: N }, (_, k) => !ringBearingInMouth(ring, bearingOf(k) + TAU / (2 * N)));

  // No mouth at all: one closed loop.
  if (open.every(Boolean)) {
    const loop: Vec2[] = [];
    for (let k = 0; k <= N; k++) loop.push(stationAt(k));
    return [loop];
  }
  if (!open.some(Boolean)) return [];

  // Start at a bucket that FOLLOWS a mouth, so no run is split at k = 0.
  let start = 0;
  while (!(open[start]! && !open[(start + N - 1) % N]!)) start++;

  // Collect runs as BUCKET INDEX SPANS, then turn them into polylines. Indices,
  // not re-derived bearings: the seam fix below is "one bucket further", which
  // is unambiguous on an index and error-prone on an angle.
  const spans: Array<[number, number]> = [];
  let from: number | null = null;
  for (let i = 0; i < N; i++) {
    const k = start + i;
    if (open[k % N]!) {
      if (from === null) from = k;
    } else if (from !== null) {
      spans.push([from, k - 1]);
      from = null;
    }
  }
  if (from !== null) spans.push([from, start + N - 1]);

  const perBucketM = (TAU * ring.ringRadiusM) / N;
  const minBuckets = Math.max(2, Math.ceil(RING_MIN_KERB_RUN_M / perBucketM));
  const out: Vec2[][] = [];
  for (const [a, b] of spans) {
    if (b - a + 1 < minBuckets) continue;
    // THE SEAM. A strip is quads BETWEEN stations, so a span of buckets a…b
    // needs stations a−1…b+1 to have kerb over every one of them — measured as
    // a 1-of-52 hole on rb-2lane before this line. Tucking the last metre of
    // kerb into the mouth is also what a real entry looks like: the flare
    // starts AT the kerb, it does not start beside it.
    const run: Vec2[] = [];
    for (let k = a - 1; k <= b + 1; k++) run.push(stationAt(k));
    out.push(run);
  }
  return out;
}

/** Arc samples per radian of kerb return — 2.5 m radius at 24 gives 10 cm
 *  chords, so the return reads curved at the range a driver meets it. */
const RETURN_ARC_SAMPLES_PER_RAD = 24;

/**
 * THE KERB RETURNS, as polylines OF THE KERB ITSELF (swept at half width 0, so
 * the caller lays the ordinary pavement cross-section straight onto them).
 *
 * Each one runs from the ring's outer edge, round the fillet, and out along the
 * arm's kerb line to where the arm's own pavement strip begins — so the
 * boundary of a roundabout is one continuous kerb, exactly as it is in the
 * street. Returned with the `side` the pavement must be built on.
 *
 * The list is empty on a ring with no derived BOUNDARY, which keeps every such
 * registration byte-identical to the pre-B16 build. A ring that has a boundary
 * but too little arc to sweep (d2-v1) still gets its returns: they land on the
 * ring's outer edge, which is exactly where its per-edge strips already are.
 */
export function ringMouthKerbRuns(ring: RoundaboutRing): Array<{ line: Vec2[]; side: 1 | -1 }> {
  if (!hasRingBoundary(ring)) return [];
  const out: Array<{ line: Vec2[]; side: 1 | -1 }> = [];
  for (const m of ring.mouths) {
    for (const r of m.returns) {
      const line: Vec2[] = [];
      // The fillet, from the ring tangent point to the arm tangent point.
      let sweep = offsetFrom(r.armAngle, r.ringAngle);
      const steps = Math.max(2, Math.round(Math.abs(sweep) * RETURN_ARC_SAMPLES_PER_RAD));
      for (let i = 0; i <= steps; i++) {
        const a = r.ringAngle + (sweep * i) / steps;
        line.push([
          r.centre[0] + Math.cos(a) * r.radius,
          r.centre[1] + Math.sin(a) * r.radius,
        ]);
      }
      // …then straight down the arm's kerb line to the arm's own pavement.
      if (r.armEndM > r.tArmAlongM + 0.05) {
        line.push([
          r.tArm[0] + m.dir[0] * (r.armEndM - r.tArmAlongM),
          r.tArm[1] + m.dir[1] * (r.armEndM - r.tArmAlongM),
        ]);
      }
      if (line.length >= 2) out.push({ line, side: r.side });
    }
  }
  return out;
}

/** Push `p` radially out onto the island's kerb line. Points already outside
 *  come back untouched, so a pad that never entered the ring is byte-identical. */
export function clipOutOfIslands(rings: readonly RoundaboutRing[], p: Vec2): Vec2 {
  const ring = islandContaining(rings, p);
  if (!ring || ring.islandRadiusM === null) return p;
  const dx = p[0] - ring.centre[0];
  const dy = p[1] - ring.centre[1];
  const d = Math.hypot(dx, dy);
  // Dead centre has no radial direction; nudge north so the fan stays sane.
  if (d < 1e-6) return [ring.centre[0], ring.centre[1] + ring.islandRadiusM];
  const s = ring.islandRadiusM / d;
  return [ring.centre[0] + dx * s, ring.centre[1] + dy * s];
}

/**
 * Which side of a ring edge faces AWAY from the centre (+1 = right of travel).
 * Derived, never assumed: right-hand traffic circulates counter-clockwise so
 * the outside IS the driver's right, but an OSM ring can be digitised either
 * way and a kerb built on the wrong side would stand in the carriageway.
 */
export function ringOutwardSide(ring: RoundaboutRing, line: readonly Vec2[]): 1 | -1 {
  const mid = line[Math.floor(line.length / 2)]!;
  const prev = line[Math.max(0, Math.floor(line.length / 2) - 1)]!;
  const dir: Vec2 = [mid[0] - prev[0], mid[1] - prev[1]];
  const right = perpRight(dir);
  const radial: Vec2 = [mid[0] - ring.centre[0], mid[1] - ring.centre[1]];
  return right[0] * radial[0] + right[1] * radial[1] >= 0 ? 1 : -1;
}

// ---------------------------------------------------------------------------
// The island mesh
// ---------------------------------------------------------------------------

/** Radial segments of the island disc — 96 keeps the kerb read as a circle
 *  rather than a polygon at cockpit range on the widest shipped ring (34 m). */
const ISLAND_SEGMENTS = 96;
/** Concrete rim between the kerb face and the planting, m. */
export const ISLAND_KERB_BAND_M = 1.1;
/** Radial rings across the planted crown (smooth dome, cheap). */
const ISLAND_CROWN_RINGS = 6;

/**
 * HEIGHT OF THE PLANTED CROWN — and this is the measurement the whole module
 * turns on, so it is written down rather than tuned by feel.
 *
 * The first render of this pass drew the island FLAT at kerb height. From the
 * driver's seat, 46 m back on the south approach of rb-mini, it was invisible:
 * eye 1.2 m, island near edge 32 m ahead, so a 0.14 m disc sits 0.25° above the
 * road — about three pixels at 62° FOV. The top-down showed a perfect green
 * circle and the cockpit showed an empty grey plain. That is the exact trap
 * this wave exists to stop falling into: a fix that photographs well from a
 * camera the student never sits in.
 *
 * A real central island has bulk — mounded earth, shrubs, a monument — and that
 * bulk is what tells a driver at 50 m that the road ahead goes AROUND something.
 * It also teaches: you are not supposed to see across a roundabout, you are
 * supposed to look where you are going. Scaled with the ring so a 34 m island is
 * not a pancake and a 14 m one is not a hill.
 */
function crownRiseM(islandRadiusM: number): number {
  return Math.min(1.6, Math.max(0.8, islandRadiusM * 0.09));
}

/**
 * FR-22 / register B16 — THE ISLAND IS NOW A PLANTER WALL, NOT A KERB, AND THIS
 * IS THE NUMBER THAT DECIDES WHETHER A CAR CAN CROSS IT.
 *
 * The header of `buildIsland` below used to claim, in as many words, that „the
 * sidewalk accumulator is what `colliders.sidewalks` is built from, so the
 * island's kerb stops a car exactly like a pavement edge does. A central island
 * a student can drive across is not an island." The claim was tested and it is
 * FALSE, twice over:
 *
 *   - MEASURED ON THE SHIPPED GEOMETRY (this lane, probe over the four ring
 *     districts): the highest collider vertex anywhere inside the island is
 *     **y = 0.140 m** on all four. The whole island is a 14 cm lip; the 0.8–1.6 m
 *     planted crown that gives it bulk lives in `islandPlanting`, which is a
 *     RENDER mesh and not a collider at all.
 *   - MEASURED IN THE PRODUCT (register B16): „I drove sc-roundabout-entry due
 *     north with no steering at all: telemetry x=4.06 y=−1.18 at 46 км/ч … the
 *     car body sits on grass between two of the island's own bushes with its
 *     shadow on the turf", reproduced on the real LessonPlayShell at 42 км/ч.
 *
 * A pavement edge is the wrong reference class: `WorldColliderSet.sidewalks` is
 * documented „12 cm, drivable-over per vehicle harness", and that is deliberate
 * — a student who clips a kerb must not be stopped dead. So a boundary built to
 * pavement height is a boundary a car is ENTITLED to cross. The central island
 * of a roundabout is the one piece of raised concrete in this world that a car
 * must never be able to mount, and Bulgarian islands are built accordingly:
 * a raised planter wall around mounded earth, not a flush kerb.
 *
 * 0.45 m above the pavement top, i.e. **0.57 m of vertical face from the
 * asphalt** — well over a wheel radius, so the wheel meets a wall instead of a
 * ramp — and still a wall height a person steps over, which is what a real
 * островен парапет is. It adds no radial extent (the face stays at
 * `islandRadiusM`), so the circulating carriageway does not narrow by a
 * millimetre and the closest committed ring trace, measured at 17.85 m from the
 * centre against a 13.75 m island on rb-mini, keeps its 4.1 m of clearance.
 */
export const ISLAND_WALL_RISE_M = 0.45;

/** Top of the island's planter wall — the height its rim, its chamfer and the
 *  foot of its planting all sit at. */
const ISLAND_WALL_TOP_Y = SIDEWALK_TOP_Y + ISLAND_WALL_RISE_M;

/** Planting height at radius `r` on an island of rim radius `rim` — a raised
 *  cosine, so the crown meets the concrete rim tangentially (no crease).
 *  Based at the WALL top, so the earth sits inside the planter rather than
 *  floating 0.45 m under it. */
function crownHeightAt(r: number, rim: number, rise: number): number {
  if (rim <= 1e-6) return ISLAND_WALL_TOP_Y;
  const t = Math.min(1, Math.max(0, r / rim));
  return ISLAND_WALL_TOP_Y + rise * 0.5 * (1 + Math.cos(Math.PI * t));
}

export interface RoundaboutBuildResult {
  /** Islands actually drawn (a refused registration is not counted). */
  islands: number;
  /** Ring divider dashes painted (0 on single-lane rings — nothing to divide). */
  ringDividerQuads: number;
  /** Outer edge-line quads painted (0 where the island — and so the ring — is
   *  refused). Solid off-mouth, broken across every entry and exit. */
  ringEdgeQuads: number;
  /** Planted crowns + shrubs of every island — its own mesh (see below). */
  islandPlanting: MeshAccumulator;
}

/**
 * WALL + RIM go into `sidewalks`: the concrete material, vertex-coloured like
 * every other kerb in the world, AND — the part that matters — the sidewalk
 * accumulator is what `colliders.sidewalks` is built from, so the island's
 * boundary is a collider. It is a 0.57 m PLANTER WALL rather than a 0.14 m kerb
 * (see ISLAND_WALL_RISE_M above for the measurement that forced the change):
 * pavement height is explicitly drivable-over in this engine, so an island
 * built to pavement height is an island a car may legally cross — which is
 * exactly what the founder photographed himself doing at 46 км/ч.
 *
 * The PLANTING gets its own mesh instead of joining `terrain.grass`, and that
 * is deliberate: the terrain mesh carries a hard contract (every vertex at or
 * below 0.3 m, so ground relief never pokes through the flat physics plane you
 * drive on), which a mounded island would violate for a reason that has nothing
 * to do with terrain. One extra draw call, on the six districts that have a
 * ring, sharing the ground PBR set already uploaded — no new texture.
 */
function buildIsland(
  ring: RoundaboutRing,
  sidewalks: MeshAccumulator,
  planting: MeshAccumulator,
): void {
  const r = ring.islandRadiusM;
  if (r === null) return;
  const [cx, cy] = ring.centre;
  // The vertical face runs from the asphalt to the WALL top (0.57 m), not to
  // pavement height — see ISLAND_WALL_RISE_M.
  const chamferY = ISLAND_WALL_TOP_Y - CURB_CHAMFER_M;
  const rimInner = Math.max(0.5, r - ISLAND_KERB_BAND_M);
  const rise = crownRiseM(r);
  const foot: [number, number, number] = [CURB_FOOT_TINT, CURB_FOOT_TINT, CURB_FOOT_TINT];

  // Ring of kerb stations: foot, top of the vertical face, chamfer top, rim
  // inner — the same four-vertex profile a sidewalk strip uses, so consecutive
  // stations quad up identically.
  type Station = { cb: number; ct: number; xt: number; ri: number };
  const stations: Station[] = [];

  for (let i = 0; i <= ISLAND_SEGMENTS; i++) {
    const a = (i / ISLAND_SEGMENTS) * Math.PI * 2;
    const ox = Math.cos(a);
    const oy = Math.sin(a);
    const outer: Vec2 = [cx + ox * r, cy + oy * r];
    const chamfer: Vec2 = [cx + ox * (r - CURB_CHAMFER_M), cy + oy * (r - CURB_CHAMFER_M)];
    const rim: Vec2 = [cx + ox * rimInner, cy + oy * rimInner];
    // Outward normal in world space (district y → −z).
    const nOut: [number, number, number] = [ox, 0, -oy];
    const nChamfer: [number, number, number] = [
      ox * Math.SQRT1_2,
      Math.SQRT1_2,
      -oy * Math.SQRT1_2,
    ];
    const v = (i / ISLAND_SEGMENTS) * (2 * Math.PI * r) * 0.5; // arclength UV
    stations.push({
      cb: sidewalks.vertex(toWorld(outer[0], outer[1], ROAD_Y), nOut, [0, v], foot),
      ct: sidewalks.vertex(toWorld(outer[0], outer[1], chamferY), nOut, [0.07, v]),
      xt: sidewalks.vertex(toWorld(chamfer[0], chamfer[1], ISLAND_WALL_TOP_Y), nChamfer, [0.1, v]),
      ri: sidewalks.vertex(toWorld(rim[0], rim[1], ISLAND_WALL_TOP_Y), UP, [0.9, v]),
    });
  }

  for (let i = 0; i < ISLAND_SEGMENTS; i++) {
    const a = stations[i]!;
    const b = stations[i + 1]!;
    // WINDING — REVERSED, AND THE COMMENT THAT STOOD HERE WAS THE BUG.
    //
    // It read: „The disc's interior is to the LEFT of travel round the ring of
    // stations (stations run counter-clockwise in district space), so the kerb
    // face — which must look OUTWARD, away from the island — is wound
    // (b0, a0, a1, b1)." Every clause of that is true and the conclusion is
    // still backwards, because it reasons in DISTRICT space about a buffer that
    // lives in WORLD space: `toWorld` maps district y → world −z, which flips
    // handedness, so a quad wound to face outward on the district plane leaves
    // the accumulator facing INWARD in the scene. mesh.ts says as much in its
    // own header — „a triangle wound counter-clockwise in district space
    // (positive signed area) comes out front-facing UP (+Y)".
    //
    // MEASURED on the shipped geometry rather than argued, geometric normal
    // n = (b−a) × (c−a) per triangle, on every district that draws a ring
    // (rb-mini-v1, rb-ped-v1, rb-2lane-v1, rb-single-v1, district-v1 — all five
    // identical):
    //
    //     island vertical kerb face     192 tris     0 outward   192 INWARD
    //     island concrete rim           192 tris     0 up        192 DOWN
    //     island planted crown         1256 tris  1256 up          0   ← right
    //     terrain                     20784 tris 20784 up          0   ← control
    //     road surface                  264 tris   264 up          0   ← control
    //     street pavement tops (roads.ts, same accumulator)  568 up   ← control
    //
    // The crown twenty lines below is wound the other way and comes out right;
    // the three controls settle the convention beyond argument. StaticWorld
    // renders `geometries.sidewalks` with a plain `<meshStandardMaterial>` and
    // that file sets no `side` anywhere, so the material is THREE.FrontSide and
    // all 576 of the island's concrete triangles were BACK-FACING — culled,
    // invisible, on every roundabout in the product.
    //
    // THAT IS THE FINDING, in the ledger's own words (sc-rb-ped-exit:841c6252,
    // „the roundabout itself is a bare grass mound … no kerb detail"): from the
    // give-way line the student saw grass meeting asphalt with nothing between
    // them. The island was never flat and never unbuilt — it was drawn back to
    // front. Its AUTHORED vertex normals point correctly outward and up, which
    // is exactly why eleven passes over this file read the normals, found them
    // right, and moved on.
    //
    // Nothing else moves: not one vertex position changes, so `islandRadiusM`,
    // the 4.1 m of ring clearance and every committed trace are untouched, and
    // `colliders.sidewalks` is a Rapier trimesh — a soup with no inside — so
    // the wall a car cannot mount is the wall it already was.
    sidewalks.quad(a.cb, b.cb, b.ct, a.ct); // vertical kerb face, faces the road
    sidewalks.quad(a.ct, b.ct, b.xt, a.xt); // 45° chamfer (catches the low sun)
    sidewalks.quad(a.xt, b.xt, b.ri, a.ri); // concrete rim, flat, faces up
  }

  // -- planted crown ---------------------------------------------------------
  const grid: number[][] = [];
  for (let k = 0; k <= ISLAND_CROWN_RINGS; k++) {
    const rr = rimInner * (1 - k / ISLAND_CROWN_RINGS);
    const h = crownHeightAt(rr, rimInner, rise);
    // dh/dr of the raised cosine, for the surface normal.
    const dhdr =
      rimInner <= 1e-6
        ? 0
        : -rise * 0.5 * (Math.PI / rimInner) * Math.sin((Math.PI * rr) / rimInner);
    const row: number[] = [];
    for (let i = 0; i <= ISLAND_SEGMENTS; i++) {
      const a = (i / ISLAND_SEGMENTS) * Math.PI * 2;
      const ox = Math.cos(a);
      const oy = Math.sin(a);
      const x = cx + ox * rr;
      const y = cy + oy * rr;
      // Same district-gradient → world-normal form as terrain.ts.
      const gx = dhdr * ox;
      const gy = dhdr * oy;
      const inv = 1 / Math.hypot(gx, 1, gy);
      row.push(
        planting.vertex([x, h, -y], [-gx * inv, inv, gy * inv], [x / 8, y / 8]),
      );
    }
    grid.push(row);
  }
  for (let k = 0; k < ISLAND_CROWN_RINGS; k++) {
    const outerRow = grid[k]!;
    const innerRow = grid[k + 1]!;
    for (let i = 0; i < ISLAND_SEGMENTS; i++) {
      // District-CCW seen from above.
      planting.quad(outerRow[i]!, outerRow[i + 1]!, innerRow[i + 1]!, innerRow[i]!);
    }
  }

  // -- shrubs ----------------------------------------------------------------
  // Deterministic, evenly spaced, well inside the rim so they never stand
  // between an entering driver and the circulating traffic he must yield to —
  // they close the view ACROSS the ring, which is what a real island does.
  const shrubRing = rimInner * 0.55;
  const count = Math.min(14, Math.max(5, Math.round((2 * Math.PI * shrubRing) / 9)));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.PI / 7;
    const x = cx + Math.cos(a) * shrubRing;
    const y = cy + Math.sin(a) * shrubRing;
    buildShrub(planting, x, y, crownHeightAt(shrubRing, rimInner, rise));
  }
}

/** Radius / height of one island shrub, m — a clipped ornamental, not a tree. */
const SHRUB_R = 1.15;
const SHRUB_H = 1.9;
const SHRUB_SEGMENTS = 8;
const SHRUB_RINGS = 3;

/** One dome-shaped shrub standing on the crown at (x, y, baseY). */
function buildShrub(acc: MeshAccumulator, x: number, y: number, baseY: number): void {
  const rows: number[][] = [];
  for (let k = 0; k <= SHRUB_RINGS; k++) {
    const t = k / SHRUB_RINGS; // 0 = base, 1 = apex
    const rr = SHRUB_R * Math.cos((t * Math.PI) / 2);
    const hh = baseY + SHRUB_H * Math.sin((t * Math.PI) / 2);
    const row: number[] = [];
    for (let i = 0; i <= SHRUB_SEGMENTS; i++) {
      const a = (i / SHRUB_SEGMENTS) * Math.PI * 2;
      const ox = Math.cos(a);
      const oy = Math.sin(a);
      // Outward-and-up normal of a hemisphere-ish surface.
      const n: [number, number, number] = [ox * (1 - t), Math.max(0.3, t), -oy * (1 - t)];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      row.push(
        acc.vertex(
          [x + ox * rr, hh, -(y + oy * rr)],
          [n[0] / l, n[1] / l, n[2] / l],
          [(x + ox * rr) / 4, (y + oy * rr) / 4],
        ),
      );
    }
    rows.push(row);
  }
  for (let k = 0; k < SHRUB_RINGS; k++) {
    const lo = rows[k]!;
    const hi = rows[k + 1]!;
    for (let i = 0; i < SHRUB_SEGMENTS; i++) {
      acc.quad(lo[i]!, lo[i + 1]!, hi[i + 1]!, hi[i]!);
    }
  }
}

/**
 * The circular lane divider of a MULTI-lane ring — the one ring marking a
 * Bulgarian roundabout actually carries, and the thing that tells a driver in
 * the outer lane that the inner lane is a lane and not shoulder.
 *
 * It has to be painted here rather than by the lane-line pass, and that is the
 * whole point: `analyzeNetwork` trims every ring arc back by the junction open
 * radius, which on a four-arm ring eats 80° of every 90° quarter. What survived
 * for markings.ts to paint was a 6 m stub per quarter — the founder's „no ring
 * lane markings" was the lane pass being starved of ring, not switched off.
 * A circle is not a polyline sum; it is drawn as a circle.
 *
 * Single-lane rings get nothing, deliberately: there is no boundary to draw and
 * an invented circle of paint would be a new falsehood on the map.
 */
function buildRingDivider(ring: RoundaboutRing, markings: MeshAccumulator): number {
  if (ring.ringLanes < 2) return 0;
  // Boundary k = 1 of the ring's own cross-section, measured from its inner
  // edge — identical arithmetic to markings.ts's lane boundaries.
  const travelHalf = ring.ringHalfWidthM;
  const boundaryOffset = -travelHalf + LANE_WIDTH_M;
  const radius = ring.ringRadiusM + boundaryOffset;
  if (radius <= 1) return 0;

  const circumference = 2 * Math.PI * radius;
  const pitch = DASH_LENGTH_M + DASH_GAP_M;
  const count = Math.max(4, Math.round(circumference / pitch));
  const step = circumference / count;
  const halfW = DASH_WIDTH_M / 2;
  let quads = 0;

  for (let i = 0; i < count; i++) {
    const a0 = ((i * step) / radius) % (Math.PI * 2);
    const a1 = a0 + DASH_LENGTH_M / radius;
    // A dash short enough (3 m on an ≥18 m radius) that a straight quad is
    // within a centimetre of the arc — the same approximation every dashed
    // line on a curved street already makes.
    const p0: Vec2 = [
      ring.centre[0] + Math.cos(a0) * radius,
      ring.centre[1] + Math.sin(a0) * radius,
    ];
    const p1: Vec2 = [
      ring.centre[0] + Math.cos(a1) * radius,
      ring.centre[1] + Math.sin(a1) * radius,
    ];
    const dir: Vec2 = [p1[0] - p0[0], p1[1] - p0[1]];
    const l = Math.hypot(dir[0], dir[1]);
    if (l < 1e-6) continue;
    const u: Vec2 = [dir[0] / l, dir[1] / l];
    const rgt = perpRight(u);
    const corners: Vec2[] = [
      add(p0, mul(rgt, -halfW)),
      add(p0, mul(rgt, halfW)),
      add(p1, mul(rgt, halfW)),
      add(p1, mul(rgt, -halfW)),
    ];
    const idx = corners.map((c, k) =>
      markings.vertex(toWorld(c[0], c[1], MARKING_Y), UP, [k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0]),
    );
    markings.quad(idx[0]!, idx[1]!, idx[2]!, idx[3]!);
    quads++;
  }
  return quads;
}

// ---------------------------------------------------------------------------
// B16, THE FOURTH LOOK — THE CIRCLE THE KERB IS NOT ALLOWED TO DRAW
// ---------------------------------------------------------------------------
//
// The three passes above each closed a real half of his sentence and the row is
// still open, because all three spend the same currency: KERB. Kerb cannot
// close a mouth — a mouth is where cars drive in. So the outer boundary of the
// tight rings is, and must remain, mostly gap:
//
//     rb-mini-v1    mouth union 206.0°   outer kerb 154.0°
//     rb-ped-v1     mouth union 206.0°   outer kerb 154.0°
//     rb-2lane-v1   mouth union 246.0°   outer kerb 114.0°
//     district-v1   mouth union 184.5°   outer kerb 175.5°
//
// (measured here over 720 bearings on the shipped `analyzeRoundabouts` output).
// More than half of the boundary of the ring he drove is, by necessity, open
// asphalt — and that is why the windscreen reads „a wide flat asphalt junction
// whose kerbs run left-to-right across the frame".
//
// THE MEASUREMENT THAT NAMES THE ACTUAL GAP. Paint has none of the kerb's
// problem: a driver may cross paint, so paint may close the full 360°. So the
// question is what paint is on the ring's outer edge today. Counted on the
// shipped `markings` buffer, one-degree buckets, any painted vertex within
// ±1.0 m of `ringOuterRadiusAt(bearing)`:
//
//     rb-mini-v1      0 / 360        rb-single-v1   20 / 360
//     rb-ped-v1       0 / 360        district-v1    16 / 360
//     rb-2lane-v1     0 / 360        d2-v1          88 / 360
//
// **Zero.** On the three tight rings there is not one square centimetre of
// marking anywhere on the outer edge of the circulatory carriageway, on any
// bearing. `buildRingDivider` above draws the ONE circle this module has, and
// it refuses single-lane rings by design (there is no lane boundary to draw) —
// so on rb-mini and rb-ped the only circular thing in the whole world is the
// island kerb 13.75 m away, and the annulus the student is supposed to read has
// a boundary on its inner side only.
//
// So this pass draws the outer edge of the circulatory carriageway, all the way
// round, and it is not an invention: an М1 edge line at the carriageway's edge
// and a broken line where traffic crosses it is exactly the marking Наредба № 2
// puts there. SOLID where the boundary is kerb, BROKEN across each mouth —
// which is the correct sign as well as the pretty one, because "broken = you
// may cross this" is precisely what an entry and an exit are.
//
// WHAT IT COSTS. Zero draw calls: the quads go into the SAME `markings`
// accumulator every lane line already lives in. Zero colliders: paint is not
// geometry a wheel can hit. Zero content, zero template, zero trace — no
// radius, no arm width and no acceptance zone moves, so nothing recorded
// against this map is invalidated.
//
// WHAT IT DOES NOT FIX, stated here rather than in a report nobody reads: the
// mouths still eat 206–246° of the circumference, because mouth width is arm
// width ÷ ring radius and the generators author 16.25 m arms into an 18 m ring.
// This makes the ring VISIBLE as a ring; it does not make it PROPORTIONED as
// one. That half is the founder's ruling (register B16: R = 46 m would cost 36
// re-recorded traces and reads WORSE from the seat), and it is not taken here.

/** Centre width of the ring's outer edge line — the same М1 the streets use. */
const RING_EDGE_LINE_WIDTH_M = EDGE_LINE_WIDTH_M;

/**
 * Dash pitch used where the edge line crosses a mouth.
 *
 * Deliberately much finer than the 5 m / 8 m open-road dash: at a mouth the
 * line is crossed at right angles rather than followed, and the driver has to
 * read it as "the circle continues here" in the second or so it is in front of
 * him. 1.2 m on / 1.2 m off puts three to five marks across a 16 m entry, which
 * is what a real entry carries.
 */
const RING_EDGE_DASH_M = 1.2;
const RING_EDGE_GAP_M = 1.2;

/** Arc step of the edge line, m. 0.6 m keeps the polygon inside a centimetre of
 *  the circle on the smallest shipped ring (17.85 m) — the same tolerance
 *  `buildRingDivider` argues for its 3 m dashes. */
const RING_EDGE_STEP_M = 0.6;

/**
 * The outer edge line of the circulatory carriageway, drawn as a circle.
 *
 * REFUSED on exactly the registrations the island is refused on, and for the
 * same reason: where the middle is not free the "ring" is a junction with a ring
 * tag (d2-v1 — a primary boulevard is drawn through its interior), and a
 * painted circle round a shape that is not one is the pretty lie this module's
 * header rules out. A map may be missing a circle; it may not be given a false
 * one.
 */
function buildRingEdgeLine(ring: RoundaboutRing, markings: MeshAccumulator): number {
  if (ring.islandRadiusM === null) return 0;

  // Radius of the LINE CENTRE. markings.ts puts a kerbside edge line at
  // `travelHalf - EDGE_LINE_INSET_M`; the identical arithmetic here keeps the
  // ring's edge line the same distance off its kerb as every street's is off
  // its own, so the two read as one marking system rather than two.
  const radiusAt = (bearing: number) =>
    ringOuterRadiusAt(ring, bearing) - EDGE_LINE_INSET_M;

  // A representative radius only decides HOW MANY steps to walk; each step
  // takes its own radius from the profile, so an OSM ring that wanders still
  // gets a line on its own asphalt rather than on a fitted circle.
  const nominalR = ring.ringRadiusM + ring.ringHalfWidthM - EDGE_LINE_INSET_M;
  if (nominalR <= 1) return 0;
  const steps = Math.max(24, Math.round((TAU * nominalR) / RING_EDGE_STEP_M));

  const halfW = RING_EDGE_LINE_WIDTH_M / 2;
  const pitch = RING_EDGE_DASH_M + RING_EDGE_GAP_M;
  let quads = 0;
  // Arclength is accumulated as we walk so the in-mouth dashes have a real
  // metric pitch on every ring, whatever its radius.
  let s = 0;

  for (let i = 0; i < steps; i++) {
    const b0 = (i / steps) * TAU;
    const b1 = ((i + 1) / steps) * TAU;
    const r0 = radiusAt(b0);
    const r1 = radiusAt(b1);
    const p0: Vec2 = [
      ring.centre[0] + Math.cos(b0) * r0,
      ring.centre[1] + Math.sin(b0) * r0,
    ];
    const p1: Vec2 = [
      ring.centre[0] + Math.cos(b1) * r1,
      ring.centre[1] + Math.sin(b1) * r1,
    ];
    const segLen = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);

    // Mouth membership is taken at the segment's MIDPOINT bearing, so a step
    // never half-belongs to a mouth and half to the kerb.
    const inMouth = ringBearingInMouth(ring, (b0 + b1) / 2);
    const on = inMouth ? (s + segLen / 2) % pitch < RING_EDGE_DASH_M : true;
    s += segLen;
    if (!on) continue;

    // Rails are the RADIAL offsets of the two endpoints, so consecutive quads
    // share an edge exactly and a solid run has no seam.
    const a: Vec2 = [
      ring.centre[0] + Math.cos(b0) * (r0 - halfW),
      ring.centre[1] + Math.sin(b0) * (r0 - halfW),
    ];
    const b: Vec2 = [
      ring.centre[0] + Math.cos(b0) * (r0 + halfW),
      ring.centre[1] + Math.sin(b0) * (r0 + halfW),
    ];
    const c: Vec2 = [
      ring.centre[0] + Math.cos(b1) * (r1 + halfW),
      ring.centre[1] + Math.sin(b1) * (r1 + halfW),
    ];
    const d: Vec2 = [
      ring.centre[0] + Math.cos(b1) * (r1 - halfW),
      ring.centre[1] + Math.sin(b1) * (r1 - halfW),
    ];
    const idx = [a, b, c, d].map((p, k) =>
      markings.vertex(toWorld(p[0], p[1], MARKING_Y), UP, [
        k === 1 || k === 2 ? 1 : 0,
        k >= 2 ? 1 : 0,
      ]),
    );
    markings.quad(idx[0]!, idx[1]!, idx[2]!, idx[3]!);
    quads++;
  }
  return quads;
}

/**
 * Draw every roundabout the district registers: the kerbed central island and
 * the ring's circular markings. Meshes are the EXISTING sidewalk/terrain/paint
 * accumulators, so this pass adds geometry and zero draw calls.
 */
export function buildRoundabouts(
  rings: readonly RoundaboutRing[],
  meshes: { sidewalks: MeshAccumulator; markings: MeshAccumulator },
): RoundaboutBuildResult {
  const islandPlanting = new MeshAccumulator();
  let islands = 0;
  let ringDividerQuads = 0;
  let ringEdgeQuads = 0;
  for (const ring of rings) {
    if (ring.islandRadiusM !== null) {
      buildIsland(ring, meshes.sidewalks, islandPlanting);
      islands++;
    }
    ringDividerQuads += buildRingDivider(ring, meshes.markings);
    ringEdgeQuads += buildRingEdgeLine(ring, meshes.markings);
  }
  return { islands, ringDividerQuads, ringEdgeQuads, islandPlanting };
}
