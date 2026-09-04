/**
 * Objective-param serialization: typed ObjectiveParams (the evaluator union,
 * lessons/types.ts) → the { kind, params } record shape LessonObjective
 * carries and parseObjectiveParams narrows at session start.
 *
 * Shared by validate.ts (round-trip check: a spec that validates can never
 * fail inside createLessonSession) and compile.ts (the actual compile) —
 * kept in its own file so those two stay cycle-free.
 *
 * `toleranceScale` is where a difficulty rung becomes an actual number (doc
 * 76 §7, doc 86 L13). It reaches two kinds of gate and treats them
 * differently on purpose — see WIDEN-ONLY below.
 */

import type { LessonObjective } from "../../contracts";
import {
  PARK_CENTER_TOL_M,
  PARK_HEADING_TOL_DEG,
  REACH_ZONE_GRACE_M,
  REACH_ZONE_HALT_CAP_KMH,
} from "../objectives";
import type { ObjectiveParams } from "../types";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Extra km/h a waypoint's speed cap gains per 1.0 of tolerance above 1. The
 * L1 ladder rung is 1.5, so the fully-aided rung forgives **5 km/h** — the
 * same absolute slack the rule engine's own `speedingGraceMaxKmh` (rules/
 * types.ts) already gives every driver against a posted limit. L2 (1.25)
 * forgives 2.5; L3/L4/L5 forgive nothing.
 *
 * Additive, never multiplicative, and that is the point: multiplying would
 * turn an authored «мини на не повече от 30» into a 45 km/h gate at L1 and
 * the objective's own Bulgarian title would then be a lie (doc 86 D3 —
 * „objective titles promise acts the gates do not measure"). A flat 5 km/h
 * of slack keeps the title true and still stops one honest frame at 33 from
 * locking a beginner out of the rest of the chain (doc 86 B4).
 */
export const SPEED_CAP_GRACE_KMH_PER_TOLERANCE = 10;

/**
 * WIDEN-ONLY (doc 86 B3/B5). A waypoint radius or speed cap is a
 * COMPLETABILITY gate, not a skill: 50 of 154 terminal radii already sit
 * below the 8.125 m lane pitch, and a blown speed-capped waypoint is
 * unrecoverable on 127 scenarios. Difficulty at L4/L5 comes from the aids
 * coming off, exam protocol, traffic, weather and physics — never from
 * shrinking the target, so a `toleranceScale < 1` leaves waypoints alone.
 */
const widenFactor = (toleranceScale: number) => Math.max(1, toleranceScale);

/**
 * Widen a waypoint radius, bounded twice:
 *  - by `maxRadiusWidenM`, which compileScenario derives from the objective
 *    CHAIN so a forgiving rung can never make two consecutive zones overlap
 *    (a zone already containing the car when the previous gate completes is a
 *    graded gate the student never drove);
 *  - by REACH_ZONE_GRACE_M as the standing ceiling — the aided rung never
 *    gets more room than the along-approach grace the evaluator already
 *    grants on EVERY rung (objectives.ts).
 */
function widenRadius(radiusM: number, toleranceScale: number, maxRadiusWidenM: number): number {
  const wanted = radiusM * widenFactor(toleranceScale) - radiusM;
  const allowed = Math.max(0, Math.min(wanted, maxRadiusWidenM, REACH_ZONE_GRACE_M));
  return r2(radiusM + allowed);
}

/**
 * Widen a waypoint's speed cap by the flat grace above.
 *
 * A HALT DEMAND IS NEVER WIDENED. `stepReachZone` treats a cap at or below
 * REACH_ZONE_HALT_CAP_KMH (8) as „come to rest here" and unlocks the
 * approach-grace capsule for it; pushing a 5 km/h gate to 10 would both make
 * «спри напълно» accept a rolling car and strip the very capsule that makes
 * stopping a metre short count. So the 42 halt gates in the catalog read the
 * same at L1 as at L4 — «спри» means спри on every rung.
 *
 * THE POSTED-LIMIT CEILING (doc 87 B58, and B56 before it). The compiled cap
 * is not a private number: `RouteGuidance` prints it in the world, on the gate
 * bar across the lane, as «не по-бързо от N км/ч» — an INSTRUCTION the student
 * reads and obeys. On `sc-speed-dangerous` — the drill whose entire subject is
 * that 51–60 км/ч in a 50 zone is a scored fault — the L1 ladder turned an
 * authored 52 into a bar reading **57 on a street posted 50**, so the world
 * instructed the exact offence it was about to bill. The founder's B58 words
 * for the class: „a student who obeys the number the world shows him commits
 * the mistake the world is grading."
 *
 * The census that made this a class rather than an anecdote: **126** compiled
 * reachZone gates across the catalog carried a cap above their district's
 * posted limit, and **94 of them were the ladder's doing** (authored ≤ posted,
 * compiled above it) — every aided rung of every speed, overtaking and
 * lane-discipline drill, plus the motorway (authored 140 = posted 140 → an L1
 * bar reading 145). Grace is forgiveness for a beginner's speedometer; it was
 * never a licence to post a higher number than the sign.
 *
 * So the grace is bounded by the posted limit, and by `maxSpeedKmh` itself so
 * the WIDEN-ONLY rule above still holds exactly: a template that authored a
 * cap ABOVE its own posted limit keeps that authored cap (tightening it is an
 * authoring decision, not the ladder's, and would move 32 graded gates), it
 * simply stops being inflated further. `postedLimitKmh` absent ⇒ behaviour is
 * bit-identical to before, which is what keeps the 446 gates on maps that
 * declare no limit unchanged.
 *
 * ── …AND „UP TO THE SIGN" IS STILL FAR ENOUGH TO EMPTY THE GATE — w10-4,
 *    2026-08-25 (sc-hazard-obstacle:b103ec20, sc-ac-highbeam-lead:5b87547e) ──
 *
 * B58 stopped the ladder printing a number ABOVE the sign. It left it free to
 * walk a gate all the way UP TO the sign, and a gate standing on the posted
 * limit demands exactly what the law already demands — which is to say
 * nothing. Six compiled gates were in that state, measured through
 * `compileScenario` over all 167 templates × every rung:
 *
 *   sc-ac-highbeam-lead  L1 sc-ahl-follow    authored 45 · posted 50 · gate 50
 *   sc-hazard-obstacle   L1 sc-obs-approach  authored 46 · posted 50 · gate 50
 *   sc-vu-blindspot-moto L1 sc-vubs-let-pass authored 45 · posted 50 · gate 50
 *   sc-ln-decisive-change L1+L2 sc-lndc-wait authored 48 · posted 50 · gate 50
 *   sc-sign-warning      L1 reach-end        authored 45 · posted 50 · gate 50
 *
 * `.audit-frames/w10-4/frames/sc-hazard-obstacle__pc-wrong/08-debrief-p3.png`
 * is what that looks like from the student's seat: «✓ Приближи обекта с
 * контролирана скорост 0:32 · ✓ Задмини обекта и продължи напред 0:39 · ✓
 * Стигни края на отсечката 0:42», ★★★, on a run whose own `run.log` reads
 * „14 · 56 · 59 км/ч" past a stalled car in a street posted 50. On the
 * BEGINNER rung — the one rung where the gate is the only thing telling him
 * what „контролирана" means — «контролирана скорост» had been compiled into
 * „the legal maximum".
 *
 * THE BOUND: THE GRACE MAY SPEND AT MOST HALF THE HEADROOM THE AUTHOR LEFT.
 * Whatever distance a template put between its own cap and the sign, the aided
 * rung keeps at least half of it, so a gate can never be widened into the law
 * itself. Where the author left plenty (58 under a 90 sign; 130 under 140) the
 * half is bigger than the grace and NOTHING changes — which is why this moves
 * six rows and not nine hundred and fifty-three.
 *
 * IT CANNOT REFUSE A DRIVE THE AUTHOR WOULD HAVE PASSED, and that is the whole
 * safety argument: the clamp is bounded below by `maxSpeedKmh` itself, so every
 * aided rung stays at or above the cap the template authored and grades at L3.
 * A drive that earns the tick on the author's own gate earns it on every rung
 * below — narrowing forgiveness is not tightening the gate.
 * `gate-keeps-half-its-headroom.test.ts` sweeps that direction over all 953
 * capped gates rather than restating it here.
 *
 * A template that WANTS its aided rung at the sign says so by authoring the
 * sign: authored ≥ posted keeps the old arithmetic exactly (the headroom is
 * zero or negative and the WIDEN-ONLY floor takes over), which is what leaves
 * sc-speed-dangerous's 52-on-a-50 and the motorway's 140-on-a-140 untouched.
 */
function widenSpeedCap(
  maxSpeedKmh: number,
  toleranceScale: number,
  postedLimitKmh?: number,
): number {
  if (maxSpeedKmh <= REACH_ZONE_HALT_CAP_KMH) return maxSpeedKmh;
  const grace = SPEED_CAP_GRACE_KMH_PER_TOLERANCE * Math.max(0, toleranceScale - 1);
  if (grace <= 0) return maxSpeedKmh;
  const widened = r1(maxSpeedKmh + grace);
  if (postedLimitKmh === undefined || !Number.isFinite(postedLimitKmh)) return widened;
  // Half the author's own headroom under the sign — and never below what he
  // authored, so the aided rung is never stricter than the rung that grades
  // his number. `Math.max(0, …)` keeps an authored cap at or above the sign on
  // the pre-existing branch: the ceiling collapses to `maxSpeedKmh` and the
  // WIDEN-ONLY floor returns it unchanged.
  //
  // …AND THE HALF IS FLOORED TO A WHOLE KM/H, BECAUSE THE CHIP IS. Verifier
  // pass on this repair, 2026-08-25: the first cut of this clamp landed
  // sc-ac-highbeam-lead / sc-sign-warning / sc-vu-blindspot-moto L1 on 47.5
  // while `RouteGuidance.capLineBg` prints `Math.round(min(cap, posted))` —
  // «не по-бързо от 48 км/ч» across the lane over a gate that grades 47.5,
  // and `objectives.ts` compares `speedKmh <= cap` with no slack on
  // `contractEarned`. That is B58's own defect turned one decimal place
  // inward: the student obeys the number the world paints him and fails.
  // Flooring the half keeps every compiled cap a whole km/h wherever the
  // author wrote one, so `Math.round` on the glass is the identity and the
  // painted number IS the graded number. It also only ever moves the ceiling
  // DOWN, so the safety argument above is unchanged.
  const halfHeadroom = Math.floor(Math.max(0, postedLimitKmh - maxSpeedKmh) / 2);
  return Math.max(maxSpeedKmh, Math.min(widened, r1(maxSpeedKmh + halfHeadroom)));
}

/**
 * `toleranceScale` widens parkInBay tolerances (L1/L2 forgiveness); absent
 * tolerances scale from the evaluator defaults so the delta is explicit in
 * the compiled data (no hidden defaults at grading time).
 *
 * `maxRadiusWidenM` is the chain-derived ceiling described on widenRadius;
 * it defaults to the standing REACH_ZONE_GRACE_M ceiling so a caller that
 * only has one objective in hand (validate.ts's round-trip) still behaves.
 *
 * `postedLimitKmh` is the street's own limit (`spec.map.params.maxspeedKmh`,
 * mirrored in the district's `meta.scenario.params`). Optional for the same
 * reason: a caller round-tripping a single objective has no map in hand, and
 * absent it the ladder behaves exactly as it always did. See widenSpeedCap —
 * the gate's number is printed in the world, so it may not exceed the sign.
 */
export function serializeObjectiveParams(
  p: ObjectiveParams,
  toleranceScale = 1,
  maxRadiusWidenM = REACH_ZONE_GRACE_M,
  postedLimitKmh?: number,
): { kind: LessonObjective["kind"]; params: Record<string, unknown> } {
  switch (p.kind) {
    case "reachZone": {
      const params: Record<string, unknown> = {
        x: p.x,
        y: p.y,
        radiusM: widenRadius(p.radiusM, toleranceScale, maxRadiusWidenM),
      };
      if (p.maxSpeedKmh !== undefined) {
        params.maxSpeedKmh = widenSpeedCap(p.maxSpeedKmh, toleranceScale, postedLimitKmh);
      }
      // THE LOWER EDGE OF THE SAME CONTRACT, and it is on the whitelist for the
      // reason the block below states in full: a term the evaluator reads is
      // still a term the product never sees until its name appears here.
      //
      // NOT LADDERED, unlike the ceiling one line up, and that asymmetry is the
      // design. The ladder forgives PRECISION, and the forgiving direction for
      // a speed band is „wider": `widenSpeedCap` lifts the ceiling at L1/L2
      // while the floor stays put, so the beginner's band is the widest one and
      // the expert's the tightest. `parseObjectiveParams parseSpeedFloor` still
      // refuses a band narrower than REACH_ZONE_CAP_SLACK_KMH, measured at the
      // TIGHTEST rung (validate.ts round-trips at toleranceScale 1), so no rung
      // can be handed a gate it cannot drive.
      if (p.minSpeedKmh !== undefined) params.minSpeedKmh = p.minSpeedKmh;
      // B18/FR-24 — carried through untouched by the ladder, and that IS the
      // point: the widening above stretches the acceptance backwards down the
      // approach at L1/L2 and this flag stops it stretching forwards over the
      // paint. An aided rung forgives a student who stops early; no rung
      // forgives one who stops past the line.
      if (p.acceptBeforeMarkM !== undefined) params.acceptBeforeMarkM = p.acceptBeforeMarkM;
      // ── THE WITNESS DEMANDS SURVIVE THE LADDER, AND THIS LINE IS WHY THEY
      //    ARE NOT DEAD CODE (wave 2) ────────────────────────────────────────
      //
      // THIS FUNCTION IS A WHITELIST. Everything the switch above does not name
      // is dropped, silently, on the way from the authored template to the
      // compiled `LessonSpec` — and EVERY scenario lesson a student plays goes
      // through here (`compileScenario` → `LessonSpec.objectives` →
      // `createLessonSession` → `parseObjectiveParams`). So a term added to
      // `ReachZoneParams` and read by `stepReachZone` is still a term the
      // product never sees until its name appears on this line.
      //
      // MEASURED, not reasoned: `requireRailClear` was authored on
      // `sc-rxg-finish`, parsed correctly by `parseObjectiveParams`, read
      // correctly by the evaluator, gated by its own test at template level —
      // and `rail-clear-gate.test.ts`, which drives `applyTick` on the compiled
      // rung, showed the barred creep still collecting its certificate. The key
      // never reached the session. That is the dead-predicate class exactly: a
      // measurement wired to no consumer, green in every test that does not
      // cross this boundary.
      //
      // NOT LADDERED, either of them, and unlike the radius that is not an
      // omission. The aid ladder forgives PRECISION — a wider disc, a softer
      // cap — because a beginner's hands are less exact. Neither of these is a
      // precision: „did you strike something" and „was the boom down when you
      // went over the rails" have the same answer at L1 and at L5, and a rung
      // that forgave them would teach the opposite of the lesson it belongs to.
      if (p.requireNoContact === true) params.requireNoContact = true;
      if (p.requireRailClear === true) params.requireRailClear = true;
      // …AND THE THIRD AUTHORED WITNESS TERM, on this whitelist for exactly the
      // reason the block above measured on `requireRailClear`: parsed, read and
      // gated at template level, a key that is not named HERE never reaches the
      // session the student plays. NOT LADDERED either, and for the same reason
      // as its two neighbours — the aid ladder forgives PRECISION, and „did you
      // stand still inside the forbidden stretch" has the same answer at L1 as
      // at L5. A rung that forgave it would forgive the whole subject of the
      // drill.
      if (p.requireRestClean !== undefined) params.requireRestClean = p.requireRestClean;
      // …AND THE FOURTH (`requireSolidLineClean`), on this whitelist for the
      // identical measured reason and NOT laddered for the identical one:
      // „did you cross the непрекъсната осева" has the same answer at L1 as at
      // L5, and sc-ov-solid-return's whole subject IS that line. A rung that
      // forgave it would teach the opposite of the lesson it belongs to.
      if (p.requireSolidLineClean === true) params.requireSolidLineClean = true;
      // …AND THE SIXTH (`requireSpeedClean`), on this whitelist for the identical
      // measured reason — and it was measured AGAIN here rather than assumed: the
      // key was authored on `sc-swp-finish`, parsed by `parseObjectiveParams`,
      // read by `stepReachZone` and voided by `speedFaultVoidsObjective`, and the
      // drill's two ❌ demonstrations still collected the certificate through
      // `compileScenario → applyTick`. It reached the session on the line below
      // and not before. NOT LADDERED for its neighbours' reason: „did you go over
      // the ceiling the road gave you" has the same answer at L1 as at L5, and
      // this drill's whole subject IS that ceiling.
      if (p.requireSpeedClean === true) params.requireSpeedClean = true;
      // …AND THE SEVENTH (`requireBrakingClean`), on this whitelist for the
      // identical measured reason — a key that is not named HERE is parsed,
      // typed and evaluated and still never reaches the session the student
      // plays, which is exactly how `requireSpeedClean` shipped inert once
      // already. NOT LADDERED for its neighbours' reason: „did you answer the
      // car behind you with the brake pedal" has the same answer at L1 as at
      // L5, and sc-follow-tailgater's whole subject IS that answer.
      if (p.requireBrakingClean === true) params.requireBrakingClean = true;
      // …AND THE FIFTH (`requireFullStop`), on this whitelist for the identical
      // measured reason and NOT laddered for a sharper one than its neighbours':
      // the aid ladder cannot forgive this even in principle. «Спри напълно» is
      // the Б2's own demand — «на СТОП се спира напълно ВИНАГИ, дори пътят да
      // изглежда празен» (catalog.ts) — so a rung that let a beginner's rolling
      // stop keep the tick would teach exactly the thing the sign forbids, and
      // would do it while the same sheet bills him ten points for it.
      if (p.requireFullStop === true) params.requireFullStop = true;
      // …AND THE ONE TERM HERE THAT REFUSES NOTHING (`reportOncomingGapSec`).
      // It is on this whitelist for the same measured reason as its three
      // neighbours — a key not named here never reaches the session — and NOT
      // laddered for a reason of its own: it is not a tolerance but the NORM
      // the drill's own briefing prints. A rung that quietly relaxed „four
      // seconds" would put a different standard on the debrief from the one in
      // the instructions the same student just read.
      if (p.reportOncomingGapSec !== undefined) {
        params.reportOncomingGapSec = p.reportOncomingGapSec;
      }
      // …AND THE EIGHTH (`requireKerbwardM`), on this whitelist for the same
      // measured reason as every key above it — a term parsed and evaluated but
      // not NAMED here never reaches the session the student plays.
      //
      // NOT LADDERED, and on this template that is the whole point rather than
      // a footnote. The ladder's only dial on `sc-vpps-stop` is the radius
      // (`widenRadius`: 3.00 → 4.50 at L1), so laddering the lateral demand too
      // would re-open at L1 exactly the acceptance this term closes — while
      // pinning the RADIUS instead would collapse L1 ≡ L2 ≡ L3 into one lesson,
      // which `__tests__/level-seam.test.ts` S4 refuses. Splitting the two axes
      // is what lets the aided rungs stay genuinely more forgiving ALONG the
      // road while „did you pull over, or did you stop in the roadway" keeps the
      // same answer at L1 as at L5.
      if (p.requireKerbwardM !== undefined) params.requireKerbwardM = p.requireKerbwardM;
      return { kind: "reachZone", params };
    }
    case "passSignal": {
      const params: Record<string, unknown> = {
        nodeId: p.nodeId,
        x: p.x,
        y: p.y,
        // NOT laddered, deliberately. A passSignal completes on a
        // stopLineCrossed EVENT near the node — the radius is a proximity
        // window the student never feels, so widening it forgives nothing and
        // relieves none of doc 86's blocked-student band. It is also what the
        // guidance layer sizes its ground ring from (scene/guidanceRoute.ts):
        // a rung-dependent 45 → 50 m ring would move a rendered object for no
        // pedagogical gain. The ladder stays out of it.
        radiusM: p.radiusM,
        control: p.control,
      };
      if (p.requireRedMet) params.requireRedMet = true;
      return { kind: "passSignal", params };
    }
    case "driveDistance":
      return { kind: "driveDistance", params: { meters: p.meters } };
    case "completeManeuver":
      switch (p.maneuver) {
        case "smoothStop":
          return {
            kind: "completeManeuver",
            params: {
              maneuver: "smoothStop",
              minApproachKmh: p.minApproachKmh,
              maxDecelMs2: p.maxDecelMs2,
            },
          };
        case "emergencyStop":
          return {
            kind: "completeManeuver",
            params: { maneuver: "emergencyStop", stagedEventId: p.stagedEventId },
          };
        case "roundabout":
          // enter/exitRadiusM DESCRIBE the ring — they are geometry, not
          // tolerance. Widening exitRadiusM would move where „left the ring"
          // is measured and change what objectives.ts voids the traversal
          // for (doc 86 B6), so the ladder leaves them exactly as authored.
          return {
            kind: "completeManeuver",
            params: {
              maneuver: "roundabout",
              x: p.x,
              y: p.y,
              enterRadiusM: p.enterRadiusM,
              exitRadiusM: p.exitRadiusM,
            },
          };
        case "parkInBay":
          return {
            kind: "completeManeuver",
            params: {
              maneuver: "parkInBay",
              holdSec: p.holdSec,
              bay: { ...p.bay },
              // A MANEUVER tolerance, so it scales both ways: a tighter rung
              // asks for a more precise park, which is real difficulty and
              // always still achievable (the bay does not move).
              centerTolM: r2((p.centerTolM ?? PARK_CENTER_TOL_M) * toleranceScale),
              headingTolDeg: r2((p.headingTolDeg ?? PARK_HEADING_TOL_DEG) * toleranceScale),
              // S2: only the non-default entry gate rides the wire — absent
              // stays byte-identical for every reverse-entry lesson.
              ...(p.entry === "forward" ? { entry: "forward" } : {}),
            },
          };
        case "threePointTurn":
          return {
            kind: "completeManeuver",
            params: {
              maneuver: "threePointTurn",
              corridor: { ...p.corridor },
              startHeadingDeg: p.startHeadingDeg,
              // toleranceScale widens the heading tolerance for the guided rungs
              // (L1/L2), symmetric with parkInBay's tolerance widening.
              toleranceDeg: r2(p.toleranceDeg * toleranceScale),
              holdSec: p.holdSec,
            },
          };
      }
  }
}
