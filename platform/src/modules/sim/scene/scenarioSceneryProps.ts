/**
 * scenarioSceneryProps — HELD scenario scenery (the render-only audit wave):
 * bodies for things the drills already grade against but never showed.
 *
 * Two sources, composed by heldSceneryFor() into the ScenarioObstacles list
 * LessonScene mounts (scenario lessons only — the existing gate):
 *
 *  1. DISTRICT CONES (meta.scenario.cones): hz-roadworks-v1's authored seam,
 *     flagged "ready for that edit" in traces/scMergeRoadworksShift.ts. Cones
 *     mount through the ScenarioObstacles PROP path — mesh + slim collider —
 *     so a live brush grades COLLISION as "staticObject" (VehicleRig's
 *     untagged fallback), exactly the code the recorded „Провиране през
 *     конусите" demo cites (compile writes collisionMinKmh 0 for every
 *     scenario lesson, so the geometric contact registers at any speed).
 *
 *  2. TEMPLATE DRESSING (keyed by template id — never by district, because
 *     districts are shared: ac-rain-v1 also hosts the van-less rain/fog
 *     drills; poligon-v1 also hosts reverse-line and free drive):
 *      - the stalled/wreck vehicles are VISUAL-ONLY (`visual: true`,
 *        no collider): for these templates the collision consequence is the
 *        RECORDER's ObstacleRect2D channel + the objective zones BY DESIGN
 *        (each template header names it — "a RECORDER obstacle rect, not a
 *        live prop"), so a live crash surface would be a new grading path
 *        the specs never authored. Visual bodies match the TrafficLayer
 *        curb-decoration convention: visible, not hittable.
 *      - the sc-ed-poligon-chain bay cones DO collide: the trace harness
 *        calls its rects "the headless twins of the scene's cone colliders"
 *        (traces/scEdPoligonChain.ts) — this is the scene side of that pair,
 *        and „Удар в конус" is the drill's own graded mistake.
 *
 *  3. DERIVED BUS-STOP SHELTERS (sweep 161 repair): the навес a district
 *     authors as a STOP SPAN and nothing draws — see `busStopSheltersOf()`.
 *     Derived from the same authored key rule 2b already reads, so there is no
 *     third list to keep in sync.
 *
 * Every coordinate is pinned BY VALUE from its single truth (the district
 * meta / the trace-harness rect), cited at each entry; the unit test
 * re-asserts the pins against the committed district JSON and the public
 * trace exports where they exist (scenarioSceneryProps.test.ts).
 */

import { parseScenarioLessonId, scenarioById } from "@/modules/sim/lessons";
import type { ScenarioObstacleSpec, ScenarioPropObstacle } from "./obstacleSpec";

// ---------------------------------------------------------------------------
// Source 1 — district-authored cones (meta.scenario.cones)
// ---------------------------------------------------------------------------

/**
 * Defensive read of `meta.scenario.cones` from a raw district document (the
 * contracts.ts scenarioBaysOf mold). A cone is radially symmetric, so the
 * authored payload carries no heading; districts without the payload yield [].
 */
export function scenarioConesOf(districtRaw: unknown): ScenarioPropObstacle[] {
  if (typeof districtRaw !== "object" || districtRaw === null) return [];
  const meta = (districtRaw as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return [];
  const scenario = (meta as { scenario?: unknown }).scenario;
  if (typeof scenario !== "object" || scenario === null) return [];
  const cones = (scenario as { cones?: unknown }).cones;
  if (!Array.isArray(cones)) return [];
  const out: ScenarioPropObstacle[] = [];
  for (const raw of cones) {
    if (typeof raw !== "object" || raw === null) continue;
    const c = raw as Record<string, unknown>;
    if (
      typeof c.x !== "number" ||
      typeof c.y !== "number" ||
      !Number.isFinite(c.x) ||
      !Number.isFinite(c.y)
    ) {
      continue;
    }
    out.push({ kind: "prop", prop: "cone", x: c.x, y: c.y, headingDeg: 0 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Source 2 — per-template held dressing
// ---------------------------------------------------------------------------

/** The stopped delivery-van silhouette every "stop short of it" drill stages. */
const VAN_MODEL = "kargo_v";

/**
 * The sc-pe-parked-row-scan row on pe-child-v1 („Покрай редицата паркирани
 * коли" — the audit found the titular row missing; the template header calls
 * it DRESSING, which is exactly this: bodies, no colliders, no grading).
 *
 * Geometry against the pinned map/harness values (traces/scPeParkedRowScan.ts,
 * templates-pe2.ts): east curb x = 9.73, carriageway edge x = 8.125, zebra
 * pe-x-1 at y = 78, child occupancy starts 4 m off the curb (x = 5.73 — the
 * "hidden behind the row" contract). Cars parallel-park on the right edge at
 * x = 7.0: a ~2 m-wide body spans ≈ [6.0, 8.0] — flush with the curb line,
 * covering the occlusion band, and still clear of the mistake-hug ghost line
 * (X_HUG 5.0, hero half-width 0.85 → right flank 5.85). The south block ends
 * at y = 68 (front bumper ≈ 70.25 — the чл. 98 five metres before the zebra);
 * the north block resumes past it. Models: civilian mix, deterministic.
 */
const PARKED_ROW_X = 7.0;
const PARKED_ROW: readonly ScenarioObstacleSpec[] = (
  [
    [19, "vela_h3"],
    [26, "corva_s"],
    [33, "pino"],
    [40, "dret_90"],
    [47, "corva_sw"],
    [54, "arden_x"],
    [61, "pino"],
    [68, "vela_h3"], // last before the zebra — front bumper ~70.25, > 5 m short
    [86, "corva_s"], // row resumes past the crossing
    [93, "tarpan"],
    [100, "vela_h3"],
  ] as const
).map(([y, model], i) => ({
  kind: "vehicle" as const,
  x: PARKED_ROW_X,
  y,
  headingDeg: 0,
  model,
  seed: i,
  visual: true as const,
}));

/**
 * Template id → held dressing. Poses are the trace-harness rect centres BY
 * VALUE (the L7 copy law — each entry cites its truth); `visual: true` on
 * every vehicle (see the header for why), colliders on the poligon cones.
 */
/**
 * SWEEP 161 — THE sc-follow-standstill „колона" MOVED OUT OF THIS TABLE, and
 * the entry is gone rather than retuned. Recorded here because the pose it
 * used to hold is the one thing a future editor would otherwise re-add.
 *
 * It was two visual-only cars at (4.0625, 298) and (4.0625, 306), answering
 * founder R3 #40 („line of cars is ONE car") behind FS_LEAD_CAR's y = 290
 * rest. Two things were true of them at once:
 *
 *  1. THEY WERE NEVER VISIBLE. Same lane centre, same 1.45 m fleet roofline
 *     (ScenarioObstacles rigTopY's own default), seen from COCKPIT_EYE 1.20 m
 *     up (vehicle/tuning.ts) with the student at rest at y ≈ 281. Over the
 *     lead's roof at 9 m the sight line climbs 0.25/9 = 0.0278 m per metre, so
 *     at the first body (17 m) it is already 1.67 m and at the second (25 m)
 *     1.89 m — both roofs 1.45 m. A same-height body directly behind another
 *     on one line can never poke above it from an eye BELOW the rooflines, at
 *     any distance. The frame agrees: `.audit-frames/sweep161/
 *     sc-follow-standstill/pc-right/05-stopped.png` shows one car and bare
 *     tarmac behind it. Height is the only axis that clears a roofline.
 *  2. THEY NOW STAND INSIDE REAL BODIES. templates-following.ts stages the
 *     column as ACTORS with rooflines — FS_QUEUE_AHEAD, a `van` held at
 *     offsetM 298 and a `truck` at 307 on the same lane — so these two cars
 *     were drawn inside a 5.2 m van (0.0 m of centres apart) and 1 m from a
 *     7.5 m truck's centre. Two vehicles in one volume is the very defect the
 *     held tables exist to remove.
 *
 * So the dressing tier has nothing left to add here: a body that the actor
 * layer already stages, at a height that layer can set and this one cannot,
 * is not dressing. `__tests__/held-vs-staged.test.ts` is the guard — it fails
 * if any held body is ever re-seated inside a staged actor's hold pose.
 *
 * Nothing else moves: `parkedClearZonesFor` loses the two RULE-3 circles these
 * bodies opened, and that removes no decoration — fo-follow-v1's curb row
 * stands at |x| = 10.13, 6.07 m from the lane centre, against a circle of
 * 2.247 + 2.442 = 4.69 m (measured in the same test).
 */

/**
 * The sc-ov-narrow corridor dressing (founder R3 #49 — „street not actually
 * narrow"): parked rows on BOTH curbs squeeze the 1+1 street visually without
 * touching the map or the choreography. Truths (traces/scOvNarrow.ts +
 * templates-lanes.ts NARROW_MEETING): driven lines span x ∈ [−4.06, 4.06]
 * with corner cuts at x = 1..2 over y ∈ [96, 114] and [146, 154]; the staged
 * in-lane row sits at (4.06, 120/135); the oncoming holds at (−4.06, 200) and
 * transits the west lane. Bodies hug the carriageway edge at |x| = 7.0 (spans
 * |6.0..8.0|, edge 8.125 — the pe-child parked-row convention), so every
 * driven line keeps ≥ 1.09 m of flank clearance (worst case: lane center
 * |4.06| + hero half-width 0.85 = 4.91 vs body flank 6.0). The squeeze
 * section itself (y ∈ [105, 150]) stays undressed on the west side — the
 * meeting corridor — and on the east the staged row IS the obstruction.
 * Visual-only: no colliders, no grading change, no re-record.
 */
const NARROW_ROWS: readonly ScenarioObstacleSpec[] = (
  [
    // East (player) curb — south approach, clear of the wait pose (4.06, 104).
    [7.0, 25, 0, "vela_h3"],
    [7.0, 40, 0, "pino"],
    [7.0, 55, 0, "corva_s"],
    [7.0, 70, 0, "dret_90"],
    [7.0, 85, 0, "arden_x"],
    // East curb — past the section, clear of the return cut (ends y 154).
    [7.0, 162, 0, "corva_sw"],
    [7.0, 177, 0, "pino"],
    [7.0, 192, 0, "vela_h3"],
    // West (oncoming) curb — parked facing south; the section (y 105..150)
    // and the staged oncoming's hold (−4.06, 200) stay clear.
    [-7.0, 25, 180, "corva_s"],
    [-7.0, 45, 180, "tarpan"],
    [-7.0, 65, 180, "vela_h3"],
    [-7.0, 85, 180, "pino"],
    [-7.0, 160, 180, "dret_90"],
    [-7.0, 176, 180, "corva_sw"],
    [-7.0, 192, 180, "arden_x"],
  ] as const
).map(([x, y, headingDeg, model], i) => ({
  kind: "vehicle" as const,
  x,
  y,
  headingDeg,
  model,
  seed: 30 + i,
  visual: true as const,
}));

/**
 * THE „ПАРКИРАН РЕД" THAT WAS ONE VAN — sc-ln-obstacle-meeting, ov-narrow-v1
 * (wave 8, critical). The frame the finding was read off:
 * `.audit-frames/sweep161/sc-ln-obstacle-meeting/mobile-right/04-t074s.png` —
 * a 5× crop of it shows ONE dark-navy box body with a red rear-lamp band
 * (`kargo_v`, the fleet van) standing alone on the tarmac, with open lane on
 * both sides of it, while instruction 1 says «Напред в ТВОЯТА лента е паркиран
 * ред — половината ти платно е затворено».
 *
 * WHY ONE BODY AND NOT A ROW, exactly. templates-lanes2.ts stages the row as
 * `LNOM_MEETING.props`: two held actors on the SAME path at `offsetM` 148 and
 * 161, both at `extraRightOffsetM` 0 ⇒ x = 4.06, the lane centre. That is one
 * file of two bodies, 13 m apart, at identical height, seen from COCKPIT_EYE
 * 1.20 m — which is the geometry this file already worked out in full for
 * sc-follow-standstill above: a same-height body directly behind another on
 * one line can never poke above it from an eye BELOW the rooflines, at any
 * distance. So the second van is not missing; it is exactly behind the first,
 * and the drill's „ред" has always rendered as „кола".
 *
 * WHAT THIS ADDS, and it is the picture rather than a number: the kerb file the
 * word „ред" names, at the |x| = 7.0 the SIBLING TENANT of this very map
 * already uses (NARROW_ROWS above — same district, same convention, so the two
 * drills dress ov-narrow-v1 the same way). Bodies span x ∈ [5.95, 8.05] against
 * the driven carriageway edge at 8.125: flush with the edge line, and the two
 * staged vans then read as double-parked OUTSIDE the row, which is what a
 * closed half of a Sofia street actually looks like.
 *
 * HITTABLE, deliberately, and against the `visual: true` of the two parked rows
 * above it. Those two are dressing whose collision consequence is authored in
 * the RECORDER's ObstacleRect2D channel; there is no rect twin for a kerb row
 * here, so `visual: true` would be a phantom — «a visual-only body would show
 * him an obstacle the world lets him drive through», this file's own rule, and
 * on this drill the whole taught act is that his half is not passable. The
 * three committed traces are untouched either way: the recorder replays against
 * ObstacleRect2D and never mounts scene bodies.
 *
 * WHAT IT DOES NOT DISTURB, measured against the committed drives themselves
 * (content/traces/sc-ln-obstacle-meeting/*.trace.json, read sample by sample):
 *   • the shadow — through y ∈ [134, 176] it runs x = 3.00 (y 134) → 1.43
 *     (139) → −4.06 (147…165) → 0.11 (173) → 1.39 (175). Its widest RIGHT
 *     flank anywhere in the row's y-span is 3.85 m (hero half-width 0.85 at
 *     y = 134) against a body flank of 5.95: 2.10 m of clearance at the worst
 *     sample, and ≥ 4.7 m over y ∈ [141, 171];
 *   • the two mistake demos — pull-out sits at x = −4.06 for every sample in
 *     the span, squeeze never reaches it (its last sample is y = 131.96);
 *   • the three objective gates — wait (4.06, 130 r4), round (−4.06, 155 r4),
 *     home (4.06, 205 r4). The row starts at y = 136 (rear face 133.95) and
 *     ends at y = 171 (front face 173.05), so no gate circle is entered;
 *   • the staged vans — x = 4.06 ± 0.99 = [3.07, 5.05] against [5.95, 8.05]:
 *     0.90 m of daylight, so `held-vs-staged.test.ts` sees no re-seating;
 *   • the curb decoration — rule 3 below opens a 4.69 m circle per body, which
 *     culls the x = 10.125 band over the row's span. That is the rule doing its
 *     job: an identical second row of strangers 3.1 m outboard is the exact
 *     defect the sc-ov-narrow census entry names («the corridor rows at
 *     |x| = 7.0 got a SECOND row of strangers at |x| = 10.13»).
 *
 * WHAT IS *NOT* FIXED HERE, and it is the rest of the finding's sentence.
 * «Половината ти платно е затворено» is still not literally true of the tarmac:
 * bodies now hold x ∈ [3.07, 8.05] of an 8.125 m lane, leaving a 3.07 m gap on
 * the centre-line side that a 1.70 m hero fits through without touching the
 * осева. That gap is PERCEPTUAL_ROAD_SCALE (contracts.ts:31 — a founder call),
 * which draws a 3.25 m lane as 8.125 m while a fleet car stays 1.84 m wide: in
 * Sofia one file of parked cars leaves 1.41 m and closes the lane; here it
 * leaves 6.29 m. Closing it with bodies would need ~2.5 cars abreast — a street
 * picture no student will ever meet — so it is left measured and routed, not
 * faked. It is the same per-district lane scale templates-lanes2.ts:2016 and
 * templates-parking2.ts:631 already name as the missing capability.
 */
const LNOM_PARKED_ROW: readonly ScenarioObstacleSpec[] = (
  [
    // Kerb file, parked facing the direction of travel, 7 m pitch (a 4.1 m car
    // with 2.9 m of gap — the pitch a real kerbside row keeps). Brackets the
    // two staged vans at y = 148 / 161 so they read as part of one obstruction.
    [136, "vela_h3"],
    [143, "corva_s"],
    [150, "pino"],
    [157, "dret_90"],
    [164, "corva_sw"],
    [171, "arden_x"],
  ] as const
).map(([y, model], i) => ({
  kind: "vehicle" as const,
  x: 7.0,
  y,
  headingDeg: 0,
  model,
  seed: 50 + i,
}));

const HELD_SCENERY: Record<string, readonly ScenarioObstacleSpec[]> = {
  // traces/scHazardObstacle.ts hazardObstacleRects(): the stalled car
  // curb-side of the driving line the ease-around bends past.
  "sc-hazard-obstacle": [
    { kind: "vehicle", x: 5.5, y: 130, headingDeg: 0, model: "dret_90", seed: 4, visual: true },
  ],
  // ── THE „ПРЕПЯТСТВИЕ" THAT WAS ONLY A PAINTED RING (sweep 161) ───────────
  //
  // «There is no physical obstacle at the stop mark. The task „Спри преди
  // препятствието — с пълна спирачка, В своята лента" is represented only by a
  // flat orange ring painted on the tarmac, a cyan light beam and a „Спри тук"
  // floating label. Nothing occupies the lane, so the full-force stop is a stop
  // before an abstraction.»  (.audit-frames/wave-c/frames/
  // sc-hz-brake-dont-swerve__pc-right/04-t093s.png says the same thing on the
  // current tree: empty lane, ring, beam, label.)
  //
  // The drill's own trace file had already filed it against itself:
  // traces/scHzBrakeDontSwerve.ts — „Honest gap, flagged: there is no debris
  // GLB and no «падащ товар» world zone — the object grades correctly, it does
  // not yet render as itself." This is that body, and it is code geometry
  // because a chunk of fallen load has no fleet model: a low block, not a
  // vehicle. The teach copy names exactly this class of thing — „паднал товар
  // от камион, отчупена гума, клон, дупка".
  //
  // PINNED, footprint-for-footprint, to hzBrakeDontSwerveObstacles()'s single
  // rect (4.06, 190, halfWidthM 0.8, halfLengthM 1.2): a `wall` collider is
  // [thicknessM/2, heightM/2, lengthM/2], so thicknessM 1.6 and lengthM 2.4
  // ARE the rect's half-extents doubled — the painted body and the graded rect
  // are the same rectangle (the L7 law). scenarioSceneryProps.test.ts asserts
  // that equality against the trace export itself, not against a copy.
  //
  // HITTABLE, and this is the one place in this table where that choice is
  // argued rather than inherited. The stalled/wreck bodies above are
  // `visual: true` because their consequence is authored in the recorder
  // channel; here the recorder channel says the same thing THE LIVE STUDENT
  // must be told — mistake demo 2 is „Късно спиране в препятствието" with
  // codeRefs ["COLLISION"] against this very rect, and a scene `wall` is
  // untagged, so VehicleRig grades contact as "staticObject", which is the
  // rect's own `withWhat`. Same code, same rectangle, same drill: not a new
  // grading path, the authored one finally reaching the person driving. The
  // file's own hittable rule points here too — „a visual-only body would show
  // him an obstacle the world lets him drive through", which is precisely the
  // lesson this drill cannot afford to teach.
  //
  // WHAT IT DOES NOT DISTURB, measured:
  //   • the stop objective — `sc-hzbds-stop` is a 4 m zone at (4.06, 184); the
  //     block spans y ∈ [188.8, 191.2] and the hero at rest on the mark reaches
  //     y = 186.05 (CHASSIS half-length 2.05). 2.75 m of daylight;
  //   • the escort — it rides x = −4.06 the whole approach, a full 8.125 m lane
  //     pitch away, and `held-vs-staged.test.ts` re-measures that;
  //   • the recorded traces — the recorder replays against ObstacleRect2D and
  //     never mounts scene bodies, so all three committed drives are untouched;
  //   • the reveal — the rect stays inert past 30 m out (trigger), and a solid
  //     body cannot be reached from further than that anyway, so the „nothing
  //     about the approach is a trap" promise survives;
  //   • the curb pass — rule 3 below opens a 3.88 m circle here and the nearest
  //     decoration body is 6.07 m away on the kerb, so hz-debris-v1 loses ZERO
  //     bodies (measured on the shipped `computeParkedCars`; the test pins it).
  //
  // Height 0.8 m is deliberate and is NOT free: it is a load-bearing number, so
  // the test moves it and expects red. Below ~0.5 m the block hides under the
  // bonnet line from COCKPIT_EYE 1.20 m at the 30 m reveal and the student
  // brakes for nothing he can see; at vehicle height it stops being „паднал
  // товар" and becomes the stopped car of the sibling drill, whose lesson is a
  // different one.
  "sc-hz-brake-dont-swerve": [
    { kind: "wall", x: 4.06, y: 190, headingDeg: 0, lengthM: 2.4, heightM: 0.8, thicknessM: 1.6 },
  ],
  // traces/scCrossingBusShadow.ts BUS_OBSTACLE: the stopped large occluder at
  // the near (east) curb, nose just south of the zebra — founder R3 #26 („NO
  // BUS AT ALL") ruling: the PROCEDURAL BOX TRUCK stands in until a real bus
  // rig exists (the audit's costed stopgap; the template copy honestly says
  // „камион"). Center/heading are the trace rect's own (8.0, 80, north);
  // `visual: true` keeps the collision consequence in the trace channel where
  // the drill authored it (the graded rect stays the recorder's SAT test).
  "sc-crossing-bus-shadow": [
    { kind: "vehicle", x: 8.0, y: 80, headingDeg: 0, model: "box_truck", seed: 7, visual: true },
  ],
  // traces/scPkSmoothStop.ts pkVanObstacle(): the stopped van behind the
  // smooth-stop mark (test-pinned against the public export).
  "sc-pk-smooth-stop": [
    { kind: "vehicle", x: 4.06, y: 120, headingDeg: 0, model: VAN_MODEL, seed: 2, visual: true },
  ],
  // traces/scAcWetBraking.ts wetVanObstacle(): the wet-envelope stop's van.
  "sc-ac-wet-braking": [
    { kind: "vehicle", x: 4.06, y: 310, headingDeg: 0, model: VAN_MODEL, seed: 2, visual: true },
  ],
  // traces/scAcSnow.ts snowVanObstacle() (the wet obstacle, verbatim).
  "sc-ac-snow": [
    { kind: "vehicle", x: 4.06, y: 310, headingDeg: 0, model: VAN_MODEL, seed: 3, visual: true },
  ],
  // traces/scHzAccidentScene.ts hzAccidentObstacles(): two damaged cars
  // askew in the curb-half of the lane (the wide-pass tableau) — PINNED, plus
  // one body of pure dressing that is pinned to nothing (see below).
  //
  // Doc 88 sweep, „the crash scene is not a crash": the briefing promises
  // „смачкани коли и хора около тях" and the frame showed ONE dark saloon
  // standing square on the kerb line 12 m ahead of another — two parked cars,
  // not a collision. Both are askew by only 20° / −15°, which at 12 m apart
  // reads as bad parking; nothing in the tableau is ACROSS anything.
  //
  // The two pinned bodies may not move: they are the recorder's own graded
  // rects (the drill's COLLISION channel) and the three committed traces were
  // recorded against them, so a nudge here would break the painted-rect-
  // equals-graded-rect law. What the tableau CAN gain is a third body that is
  // dressing only — and one car lying BROADSIDE is the single cue that turns a
  // kerb queue into a crash.
  //
  // Pose measured against the whole committed envelope, so it adds a picture
  // and not a new consequence (all numbers from the drill's own artefacts):
  //   • lane depth — heading 100° puts its x-extent at 7.6 ± 2.179 =
  //     [5.42, 9.78]. That is the SAME curb-half depth the pinned wrecks
  //     already reach (5.40 / 5.78), so the shadow's widest sample in the
  //     band (x = 4.06, flank 4.91) clears it by 0.51 m — the pinned wreck's
  //     own margin is 0.49 m — and the squeeze demo, which holds x = 5.50
  //     (flank 6.35) from y 138 to 164 precisely so it CLIPS the wreckage,
  //     clips this body too, exactly as it already clips the other two.
  //   • the two bystanders — y-extent 158.3 ± 1.262 = [157.04, 159.56]. The
  //     staged walks run at y = 152 (x 4.4→7.8) and y = 155.2 (x 4.6→7.8);
  //     the nearer of them clears the body by 1.49 m of walker shoulder.
  //   • the tangle — it stops 0.22 m short of the second wreck's y-extent
  //     ([159.78, 164.22]), so the three bodies read as one mass from 147.8 to
  //     164.2 m instead of two cars with 7.5 m of empty kerb between them.
  //   • nothing else is there — hz-accident-v1's east-side street furniture in
  //     y ∈ [130, 190] is one streetlight at (12.03, 144), and the curb pass's
  //     nearest decoration body is 33.6 m away.
  // `visual: true`, like every other wreck body: the consequence stays in the
  // trace channel the drill authored.
  //
  // NOT fixed here, and it is the rest of the finding: «изял е половината от
  // твоята лента» is not true of ANY body this table may place. The ego lane
  // is x ∈ [0, 8.125] and the demonstrated-correct line runs to x = 4.06 —
  // the wreckage would have to reach the lane centre to eat half of it, and
  // the shadow would then drive through it. Half the lane needs a re-recorded
  // shadow (traces/scHzAccidentScene.ts) or a briefing that says „half the
  // curb side"; both are owned elsewhere.
  "sc-hz-accident-scene": [
    { kind: "vehicle", x: 7.0, y: 150, headingDeg: 20, model: "corva_s", seed: 5, visual: true },
    { kind: "vehicle", x: 7.2, y: 162, headingDeg: -15, model: "vela_h3", seed: 6, visual: true },
    // DRESSING (no rect twin): the car that was hit broadside, still across
    // the kerb line where it was pushed. 100° = nose east, i.e. square across
    // the direction of travel.
    { kind: "vehicle", x: 7.6, y: 158.3, headingDeg: 100, model: "arden_x", seed: 9, visual: true },
  ],
  // ── THE БЕНЗИНОСТАНЦИЯ THAT WAS A BARE GREY APRON (wave 8) ──────────────
  //
  // «There is no petrol station. The briefing places the student at the exit of
  // a бензиностанция facing a boulevard, with a pavement and a cycle lane in
  // between; the world is a bare grey apron on an empty green plain with
  // distant mountains — no pumps, no canopy, no shop, no forecourt.»
  // (.audit-frames/sweep161/sc-merge-from-property/mobile-right/05-stopped.png
  // — read at full size: apron, mountains, one ghost car, nothing else.)
  //
  // THIS IS THE SEAM THE ROW WAS ROUTED TO, twice: templates-merging.ts:1613
  // («HELD_SCENERY["sc-merge-from-property"] in scene/scenarioSceneryProps.ts»)
  // and the wave-7 reroute («a template cannot dress a district»). It has stood
  // at „NOT-DONE (BLOCKED, costed) | Comment only" since; this is the body.
  //
  // WHY IT IS NOT DECORATION. The drill is ЗДвП чл. 25 — a driver leaving a
  // PROPERTY gives way to everything already on the road. The reason a student
  // must creep out and look twice is that he is coming off private ground, and
  // a car standing on featureless tarmac has no reason to yield to anyone. The
  // forecourt IS the premise of the rule.
  //
  // GEOMETRY, entirely from mg-property-v1's own numbers:
  //   • the exit drive `mgp-e-drive` runs (0,0) → (68,0), one lane each way at
  //     |y| = 4.06, so its drawn ribbon is |y| ≤ 8.125;
  //   • the ego spawns at `mgp-spawn-forecourt` (62, 4.06) heading 270 (west);
  //   • the shop `mgp-b-shop` already exists at x ∈ [38, 78], y ∈ [14, 34] —
  //     so the canopy abuts a building that is already there instead of
  //     inventing one, which is why the deck stops at y = 14.
  // The canopy is 26 m along the drive (x ∈ [45, 71]) by 28 m across
  // (y ∈ [−14, 14]) at 5.2 m clearance. Its four columns stand at
  // (46.2, ±13.1) and (69.8, ±13.1): 4.98 m clear of the drive ribbon on the
  // inside and 0.67 m clear of the shop frontage on the outside. The two pump
  // islands sit at y = ±10.5 (spanning ±[9.7, 11.3]) over x ∈ [50, 66], with
  // their pumps at x = 54.4 and 61.6 — the nearest of them 6.45 m off the
  // spawn pose, i.e. in plain sight the moment the student looks right.
  //
  // NOTHING DRIVEN GOES NEAR IT, measured on all three committed drives
  // (content/traces/sc-merge-from-property/*.trace.json): every sample with
  // x > 40 is at y = 4.06 exactly, on all three. The nearest body edge is the
  // island kerb at |y| = 9.7 — 4.79 m from a hero flank at 4.91.
  //
  // WHAT IS ROUTED AND NOT DONE. The Е7 „Бензиностанция" plate the reroute
  // pairs with this entry is NOT emitted here and cannot be: `SignKind` carries
  // "fuel" (world/types.ts) and nothing places it, because there is no district
  // signal to derive it from — `DistrictBuilding.kind` admits only "school" and
  // "busStop", so `mgp-b-shop` cannot say what it is. The honest fix is one
  // `kind: "fuel"` on that building in BOTH copies of mg-property-v1.json plus
  // an emitter in world/builders/props.ts, and `content/world/` is outside this
  // lane's ownership, so the pair is reported rather than half-shipped. The
  // briefing's тротоар and велоалея are likewise a district-geometry ask, not a
  // dressing one.
  "sc-merge-from-property": [
    {
      kind: "fuelStation",
      x: 58,
      y: 0,
      headingDeg: 90, // length runs along the drive (district +x)
      lengthM: 26,
      widthM: 28,
      clearanceM: 5.2,
      islandOffsetsM: [-10.5, 10.5],
      islandHalfLengthM: 8,
    },
  ],
  // ── THE „РЕМОНТЕН УЧАСТЪК" THAT WAS A LINE OF LOOSE CONES (wave 8) ───────
  //
  // «The briefing promises people working between the cones — which is the
  // entire reason it tells you to switch on dipped beams — and no worker, works
  // vehicle, barrier, beacon or advance warning board exists. The "roadworks"
  // is a bare line of loose cones on open tarmac.»
  // (.audit-frames/sweep161/sc-merge-roadworks-shift/mobile-wrong/07-end.png —
  // read at full size: ten cones, clean tarmac, nothing else in the closure.)
  //
  // The sentence the world was failing is not decoration. Instruction 1 —
  // «в ремонтен участък между конусите работят хора и те те виждат само
  // осветен» — and instruction 6 — «между конусите се работи» — are the whole
  // reason this drill arms HEADLIGHTS_OFF_AT_NIGHT (чл. 70) on its L5 rung. A
  // student who switched the lights on for nobody learned a checklist item; a
  // student who saw three people in vests inside the closure learned why.
  //
  // WHAT IS BODIED HERE, and it is the two the scene can carry honestly: the
  // WORKERS (the new `worker` kind — see obstacleSpec.ts for why it can render
  // and must not grade) and a WORKS VEHICLE inside the closure. Both are
  // district-pinned, not eyeballed: hz-roadworks-v1's own meta.scenario says
  // `laneClosedX` 4.06, `laneOpenX` −4.06, `worksFromY` 240, `worksToY` 276 and
  // a cone line at `coneLineX` 0.6, so the closed side of the works section is
  // exactly x ∈ [0.9, 8.125] (cone half 0.3) over y ∈ [240, 276]. Everything
  // below stands inside it.
  //
  // CLEARANCES, measured against the three committed drives sample by sample
  // (content/traces/sc-merge-roadworks-shift/*.trace.json):
  //   • shadow-correct and mistake-no-indicator are on x = −4.06 for every
  //     sample past y = 233, so nothing here is within 7 m of either;
  //   • mistake-squeeze-cones is the one that goes through the closure — it
  //     threads the cone line and holds x = −0.25 from y = 247 to y = 279, i.e.
  //     a right flank of 0.60 m (hero half-width 0.85). The nearest body here
  //     is the y = 250 worker at x = 2.6, whose own left edge is 2.35: 1.75 m
  //     of daylight, so the ghost never drives through a body it cannot hit.
  //     The works truck's left flank is 3.40 — 2.80 m clear of the same ghost.
  //
  // WHAT IS NOT DONE, and why it is not faked. The finding also names a
  // BARRIER, a BEACON and an ADVANCE WARNING BOARD. The barrier is the only one
  // the kit could draw (a `wall` renders as a flat grey box) and it is left out
  // deliberately: the honest place for it is ACROSS the closed lane at the
  // taper head (y ≈ 241), and mistake-squeeze-cones is at x = 1.22 there with a
  // right flank of 2.07 — the transverse panel and the committed ghost share
  // ground, so drawing it would put a solid face through a replayed drive. The
  // beacon needs an animated emissive the obstacle layer has no frame loop for.
  // The board is an А23 „Пътни работи" face, and the sign kit has none
  // (`world/types.ts` SIGN_KINDS): this module's own law is that a builder
  // places NOTHING rather than guess a face, so it is art-blocked, not coded.
  "sc-merge-roadworks-shift": [
    // The works vehicle: the procedural box truck (7.5 × 2.4), nose north,
    // mid-closure. HITTABLE like every other real vehicle body — a student who
    // is beside it has already driven past the cone colliders.
    { kind: "vehicle", x: 4.6, y: 262, headingDeg: 0, model: "box_truck", seed: 61 },
    // Three workers, spread over the closure so the section reads as worked-on
    // rather than as one figure standing still. Poses are turned away from the
    // carriageway (the crew faces its own work), which is also the pose that
    // puts the reflective band where the headlights are.
    { kind: "worker", x: 2.6, y: 250, headingDeg: 200, visual: true },
    { kind: "worker", x: 5.2, y: 256, headingDeg: 250, visual: true },
    { kind: "worker", x: 3.4, y: 268, headingDeg: 160, visual: true },
  ],
  // traces/scEdPoligonChain.ts poligonChainConeObstacles(): the bay-mouth
  // cones („Подмини гнездото между конусите") — HITTABLE, the twin contract.
  "sc-ed-poligon-chain": [
    { kind: "prop", prop: "cone", x: 140, y: -129, headingDeg: 0 },
    { kind: "prop", prop: "cone", x: 146.5, y: -129, headingDeg: 0 },
  ],
  "sc-pe-parked-row-scan": PARKED_ROW,
  // sc-follow-standstill has NO entry on purpose — see the block above the
  // NARROW_ROWS comment: its column is staged actors with rooflines now.
  "sc-ov-narrow": NARROW_ROWS,
  // The kerb file the briefing's „паркиран ред" names — see the block above
  // LNOM_PARKED_ROW for the geometry, the clearances and the half that is
  // measured-and-routed rather than faked.
  "sc-ln-obstacle-meeting": LNOM_PARKED_ROW,
  // traces/scReels.ts accidentMistake(): the parked car the „собствено ПТП"
  // demo hits then flees. The demo authors the COLLISION as a recorder beat
  // (withWhat "staticObject") but hz-obstacle-v1 shows no body there — the clip
  // read as „a car on an open road" (founder R0). Bodied here at the collision
  // point: the mistakes drift RIGHT to x=5.7 and clip it (right flank ≈ 6.55 vs
  // body left flank ≈ 5.5), while the shadow passes LEFT at x=2.2 (≈ 2.5 m
  // clear). `visual: true` (the stalled/parked-car convention): the graded
  // COLLISION stays the recorder's authored beat, so no new live grading path.
  "sc-accident-own-conduct": [
    { kind: "vehicle", x: 6.4, y: 149, headingDeg: 0, model: "corva_s", seed: 8, visual: true },
  ],
  // templates-reels.ts SC_ANIMAL_HAZARD: the „животно на пътя" quadruped. The
  // template supplies it via hazard.presentation "animal" on the ballDartOut
  // path — but that only renders while TrafficLayer's hazardActiveRef is true,
  // and the trace RECORDER has no hazard channel, so recorded reel clips never
  // trigger the dart and the animal never appeared (the clip read as an empty
  // road, founder R0). Held here as STATIC scenery instead: an animal standing
  // in the ego's travel lane (LANE_RIGHT 4.06) at the hazard's own crossing
  // point (y = 152), broadside (headingDeg 90) so it reads as an animal in the
  // road the driver must brake straight for — not swerve across the M1 line.
  // `visual: true` — animals mount NO collider (the swerve/collision is graded
  // in the authored trace); this is pure dressing, like the stalled vehicles.
  "sc-animal-hazard": [
    { kind: "animal", x: 4.06, y: 152, headingDeg: 90, visual: true },
  ],

  // ---- PARKING-DEPTH: the two neighbours a parking lot cannot express -------
  //
  // A gen_parking_lot district says only „bay N is occupied", and the scene
  // answers that with a deterministic civilian car. Two of the ten new drills
  // are ABOUT a neighbour that is not a car, so their bodies are authored here
  // and their headless twins live in traces/scParkDepth.ts (PARK_DEPTH_VAN /
  // PARK_DEPTH_WALL) — pinned against each other by the unit test below, the
  // same pairing sc-pk-smooth-stop's van uses.
  //
  // Both are HITTABLE, unlike the stalled/wreck dressing above: here the live
  // student is graded against exactly these surfaces (the drills' own mistake
  // demos are geometric contacts with them), so a visual-only body would show
  // him an obstacle the world lets him drive through.

  // sc-park-van: the kargo_v standing in lotvn-bay-2, which the district leaves
  // FREE on purpose so no civilian car is drawn on top of it. Wider and ~0.45 m
  // longer than a compact — it protrudes further into the aisle than the parked
  // cars beside it, which is the sight-line the drill teaches around.
  //
  // „The bay is left free on purpose" was a SENTENCE, not a guard, and the doc
  // 88 sweep read the frame as two vehicles in one volume. Measured, they are
  // not: the van (kargo_v body 1.98 × 5.34, traffic/types VEHICLE_PROFILE_WIDTH_M
  // „van") at y = −2.70 spans y ∈ [−3.69, −1.71]; lotvn-bay-1 is `occupied` and
  // its civilian (1.84 wide) at y = −5.40 spans y ∈ [−6.32, −4.48]. Daylight
  // 0.79 m — a real 2.7 m bay pitch leaves 0.86 m, so this is a normal
  // neighbour, and what the frame shows is the nearer, lower saloon correctly
  // occluding the further, taller box. The sentence is now a gate as well:
  // scenery-held-conflicts.test.ts fails if any held body's FOOTPRINT ever
  // touches an occupied bay's, and it convicts a van moved one bay south.
  "sc-park-van": [
    { kind: "vehicle", x: 5.03, y: -2.7, headingDeg: 90, model: "kargo_v", seed: 41 },
  ],

  // sc-park-wall: the garage end wall closing lot-wall-v1's row 1.65 m past the
  // last bay's line. `wall` renders as code geometry with an exact cuboid
  // collider and grades as „staticObject" (the untagged fallback) — the code
  // the drill's own mistake demo cites.
  "sc-park-wall": [
    { kind: "wall", x: 5.03, y: 8.6, headingDeg: 90, lengthM: 6.0, heightM: 1.6, thicknessM: 0.4 },
  ],
};

// ---------------------------------------------------------------------------
// Source 3 — parked-decoration CLEAR ZONES (doc 66 R5, founder v1 №9;
// re-derived for doc 86 L9/D10)
// ---------------------------------------------------------------------------

/** A circle (district space) inside which the TrafficLayer parked-car curb
 *  pass must not seat a decoration body. Purely visual — the curb pass has no
 *  colliders and feeds no proximity query, so removing a body changes zero
 *  grading. */
export interface ParkedClearZone {
  x: number;
  y: number;
  radiusM: number;
}

/**
 * The zones are DERIVED, never authored (doc 86 L9/D10).
 *
 * This used to be a hand-written allowlist with exactly one entry —
 * `sc-junction-stop: [{0, 0, 16}]` — put there because the curb pass seated a
 * body at (11, −10.125), 15.0 m from the junction node, and both committed
 * ghost lines cut the corner through its footprint at 0.84 / 0.85 m. Two
 * sibling drills on the same map (`sc-junction-scan`, `sc-junction-gap`) had
 * the identical body and no entry, because an allowlist only covers what
 * somebody remembered to list.
 *
 * The junction case is now structural: `TrafficLayer.computeParkedCars`
 * measures the curb walk against the junction mouth `nodeOpenRadiusM` opens
 * plus ЗДвП чл. 98's 5 m, so no body can stand in a junction on ANY of the 90
 * districts and the allowlist entry is dead. What is left here are the classes
 * the district alone cannot know, because they are SCENARIO content and not map
 * content: a staged pedestrian's authored walk line (rule 1, below), the kerb a
 * bus stop needs empty (rule 2 — as a shelter FRONTAGE, and since sweep 161 as
 * an authored kerb SPAN too, rule 2b), and the ground the drill's own held
 * dressing stands on (rule 3).
 *
 * A `pedestrianDartOut` walks a 2-point polyline (orchestrator/runners.ts
 * stages `[start, start + dir·travelM]`) with no obstacle query of any kind —
 * so wherever that line runs through a curb slot, the walker crossed inside a
 * parked car. Measured on the shipped specs: `sc-hz-emergency-stop`'s child
 * STARTS inside the body at (10.13, 149.60) — clearance 0.00 m — and
 * `sc-driver-distraction` (1.35 m) and `sc-hz-accident-scene` (1.38 m) pass
 * within a shoulder of one. Their maps have no authored `crossings[]` entry
 * at the walk (they are mid-block walks), so the district-side crossing rule
 * cannot see them.
 *
 * One rule, no list: cover the walk polyline in overlapping circles wide
 * enough that a body centre inside one cannot reach the line.
 */

/** Half the walker's shoulder width, m — the body the line represents. */
const WALKER_HALF_W_M = 0.35;
/** Worst-case parked-body half-diagonal (2.25 × 0.95 footprint), m. */
const PARKED_HALF_DIAG_M = Math.hypot(2.25, 0.95);
/** Radius of each corridor circle: a body whose centre is outside every
 *  circle cannot overlap the walk line. */
const WALK_CLEAR_RADIUS_M = WALKER_HALF_W_M + PARKED_HALF_DIAG_M;
/** Circle pitch along the walk — ≤ radius, so the union has no gaps. */
const WALK_CLEAR_PITCH_M = WALK_CLEAR_RADIUS_M;
/** Kerb kept clear either side of an authored bus stop, m past the frontage's
 *  own half-diagonal. ЗДвП чл. 98 bans stopping AT the spirka; the extra
 *  metres are the bay a bus needs to pull in and out of, which is exactly the
 *  span that has to be empty for the shelter to be visible from the road. */
const BUS_STOP_NO_PARK_MARGIN_M = 6;
/** Centre of TrafficLayer's curb-decoration band, m outboard of the driven
 *  carriageway edge — `PARK_BAND_CENTER_M`, pinned BY VALUE (the L7 copy law;
 *  __tests__/bus-stop-kerb.test.ts re-asserts it against the real
 *  `computeParkedCars` row rather than trusting the copy). */
const PARKED_BAND_CENTER_M = 2.0;

// --- RULE 3 (doc 88): NOTHING IS PARKED ON TOP OF THE LESSON'S OWN PROP -----
//
// The curb pass and the held table place bodies from two different frames and
// neither has ever seen the other. Census on the shipped tree, `computeParkedCars`
// against `heldSceneryFor` for every template that has dressing: 12 decoration
// bodies over 5 drills stand inside a held body's own footprint radius —
//
//   sc-ov-narrow           27 -> 20   (the corridor rows at |x| = 7.0 got a
//                                      SECOND row of strangers at |x| = 10.13)
//   sc-pe-parked-row-scan   2 ->  0   (the titular „редица" doubled the same way)
//   sc-hazard-obstacle     27 -> 26   (a stranger at (10.13, 129.8), beside the
//                                      stalled car at (5.5, 130) the whole
//                                      lesson is about)
//   sc-accident-own-conduct 27 -> 26  ((10.13, 149.6) beside the struck car)
//   sc-merge-roadworks-shift 32 -> 31 ((10.13, 215.6) inside the cone taper)
//
// — and the harm is the same one every time: the object the drill points at
// stops reading as special, because an identical body is standing next to it.
// That is exactly how the doc 88 sweep read the crash tableau ("ONE undamaged
// dark pickup parked square on the kerb line").
//
// One derived rule, no list, same doctrine as the two above: a held body opens
// a circle wide enough that no decoration body's FOOTPRINT can reach it. The
// curb pass has no colliders and feeds no proximity query, so this only ever
// deletes pixels — 429 bodies over these templates become 417 and every
// surviving one keeps its coordinates, model and seed. (It read 470 -> 458
// until sweep 161 dropped sc-follow-standstill's dressing, which took that
// drill's 41-body map out of the census walk; none of the 41 moved.)

/** Held-body half-diagonals, m — pinned BY VALUE from the rigs that draw them
 *  (vehicleFleet TRUCK_DIMENSIONS 7.5 × 2.4 and ANIMAL_DIMENSIONS 1.1 × 0.28
 *  half-extents; traffic/types VEHICLE_PROFILE_* „car" 4.1 × 1.84 and „van"
 *  kargo_v 5.34 × 1.98). Re-asserted in scenery-held-conflicts.test.ts. */
const HELD_CAR_HALF_DIAG_M = Math.hypot(2.05, 0.92);
const HELD_VAN_HALF_DIAG_M = Math.hypot(2.67, 0.99);
const HELD_TRUCK_HALF_DIAG_M = Math.hypot(3.75, 1.2);
const HELD_ANIMAL_HALF_DIAG_M = Math.hypot(1.1, 0.28);
/** A worker on foot — the rig's widest slice is shoulder-to-shoulder across the
 *  arms (0.46 m) by chest depth (0.30 m), so half-extents 0.23 × 0.15
 *  (components/sim/ScenarioObstacles.tsx ObstacleWorker's body plan). */
const HELD_WORKER_HALF_DIAG_M = Math.hypot(0.23, 0.15);
/** A cone/pole is a slim marker (0.25 m half-extents); its own reach is nearly
 *  negligible beside the 2.44 m the parked body brings, but it is not zero. */
const HELD_PROP_HALF_DIAG_M = Math.hypot(0.25, 0.25);

/** Half-diagonal of one held body's footprint, m. */
function heldHalfDiagM(o: ScenarioObstacleSpec): number {
  switch (o.kind) {
    case "wall":
      return Math.hypot(o.lengthM / 2, (o.thicknessM ?? 0.3) / 2);
    case "prop":
      return HELD_PROP_HALF_DIAG_M;
    case "animal":
      return HELD_ANIMAL_HALF_DIAG_M;
    case "worker":
      return HELD_WORKER_HALF_DIAG_M;
    // A forecourt's own canopy footprint — the piece a decoration body could
    // stand inside, and the widest thing the station occupies on the ground.
    case "fuelStation":
      return Math.hypot(o.lengthM / 2, o.widthM / 2);
    default:
      return o.model === "box_truck"
        ? HELD_TRUCK_HALF_DIAG_M
        : o.model === "kargo_v"
          ? HELD_VAN_HALF_DIAG_M
          : HELD_CAR_HALF_DIAG_M;
  }
}

/**
 * The x of the curb-decoration band on the RIGHT-hand kerb of a district that
 * authors `meta.scenario.laneCenterRightM` + `lanesPerDirection`; null when it
 * authors neither (every map written before the scenario-street generator).
 * `laneCenterRightM` is the OUTERMOST lane centre, which sits (2L − 1) half
 * lanes from the centre line, so one half-lane is C/(2L − 1) and the driven
 * edge is 2L of them. Sign carries the side — a spirka is on the right.
 */
function parkedKerbXOf(scenario: Record<string, unknown>): number | null {
  const c = scenario.laneCenterRightM;
  const l = scenario.lanesPerDirection;
  if (typeof c !== "number" || !Number.isFinite(c) || c === 0) return null;
  if (typeof l !== "number" || !Number.isFinite(l) || l < 1) return null;
  const halfLane = Math.abs(c) / (2 * l - 1);
  return Math.sign(c) * (2 * l * halfLane + PARKED_BAND_CENTER_M);
}

/** The bus-stop spans a district authors in `meta.scenario` (district y). */
function authoredStopSpansOf(
  scenario: Record<string, unknown>,
): Array<{ fromY: number; toY: number }> {
  const out: Array<{ fromY: number; toY: number }> = [];
  for (const key of ["busBayY", "busStopPocketY"]) {
    const span = scenario[key];
    if (typeof span !== "object" || span === null) continue;
    const { fromY, toY } = span as { fromY?: unknown; toY?: unknown };
    if (typeof fromY !== "number" || !Number.isFinite(fromY)) continue;
    if (typeof toY !== "number" || !Number.isFinite(toY)) continue;
    out.push({ fromY: Math.min(fromY, toY), toY: Math.max(fromY, toY) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Source 3 for BODIES — the навес a district authors and nothing draws
// ---------------------------------------------------------------------------
//
// SWEEP 161, sc-pk-busstop-ban (critical): «The world does not contain the
// landmark the lesson is entirely about … The briefing's навес (shelter) is
// absent … The zone exists only as a translucent teal/amber tint painted by
// the HUD, so the student is trained to read a coaching overlay instead of the
// street.» And sc-merge-bus-pullout (major): «The briefing says the right lane
// is a bus lane … в нея е спирката» — with no spirka rendered anywhere on it.
//
// The shelter is not decoration on these two maps: the lesson IS the shelter.
// sc-pk-busstop-ban's instruction 2 is «Зоната ѝ не започва ПРИ НАВЕСА —
// започва там, където започва зигзагът», and its second mistake card explains
// «Водачът спря ПРЕДИ НАВЕСА и реши, че е извън спирката». Both sentences name
// a thing the student cannot see, so the drill's whole claim — the zone is
// bigger than the shelter — has one of its two terms missing. A student who
// never saw the навес learns nothing he can carry to a real street.
//
// WHY IT IS DERIVED AND NOT A THIRD LIST. `props.ts` builds a modelled shelter
// from a `buildings[].kind === "busStop"` FRONTAGE, and the two districts whose
// entire lesson is the stop author theirs as a SPAN in `meta.scenario` instead
// (`busBayY` / `busStopPocketY` — measured: `buildings[].kind` is `null` on
// both). That is the SAME blind spot rule 2b below was written for, so this
// reads the same authored key through the same two helpers: a map that names a
// stop gets one, the 90 that name none are byte-identical, and a map that
// authors a real `busStop` frontage keeps the modelled one and gets no second.
//
// WHAT IT IS, HONESTLY: a stopgap, exactly like the procedural box truck that
// stands in for a bus above. There is no shelter GLB reachable from this table
// and `wall` is the only structural primitive the obstacle spec has, so this
// draws the ONE face of a навес a driver actually reads from the carriageway —
// its back panel, 4.5 m along the kerb and 2.5 m tall. It is a landmark, not a
// model. The costed fix is in `world/builders/props.ts`: teach the bus-stop
// pass to accept an authored SPAN as a candidate, and this derivation retires.
//
// WHERE IT STANDS, from the district's own numbers only:
//   • along the street — the span's own midpoint (mg-busstop-v1 bay 130..176 →
//     y = 153; pk-busstop-v1 pocket 180..210 → y = 195);
//   • across it — `parkedKerbXOf` (the curb-decoration band, rebuilt from
//     `laneCenterRightM`) plus one setback: mg 18.25 → 19.75, pk 10.12 → 11.62.
//     Both clear the nearest building frontage by 2.5 m (mg `mgb-b-stop-block`
//     face x = 22.25, pk `pkbs-b-stop-block` face x = 14.13) and neither
//     reaches the DRIVEN carriageway edge (16.25 / 8.12). The sign of
//     `laneCenterRightM` picks the side, so the opposite kerb is never touched.
//
// CORRECTED 2026-08-23 (adversarial verify) — „BEHIND the parked band, on the
// pavement" WAS WRITTEN HERE AND IS NOT TRUE ON EITHER MAP. `parkedKerbXOf`
// returns the DECORATION-BAND CENTRE, and that centre's distance from the real
// kerb differs by the whole 4 m parking band depending on the edge's class
// (`world/builders/network.edgeHalfWidth` = travel half + `PARKING_LANE_WIDTH_M`
// on PARKING_LANE_CLASSES only), so ONE constant setback cannot land on the
// pavement on both. Measured against the shipped cross-section:
//
//   mg-busstop-v1  edge class `tertiary` → the band IS drawn; the carriageway
//     ribbon runs out to halfWidth 20.25 and the pavement is [20.25, 23.75].
//     The panel is [19.653, 19.853] — ON THE PARKING-BAND ASPHALT, 0.40 m short
//     of the kerb, i.e. a hittable wall standing inside the drivable ribbon.
//   pk-busstop-v1  edge class `residential` → NO band; kerb = halfWidth = 8.125
//     and the pavement is [8.125, 11.625]. The panel is [11.52, 11.72] — 0.105 m
//     of it on the pavement and 0.095 m overhanging the outer lip above the
//     0.35 m skirt, 3.40 m BACK from the kerb instead of at it.
//
// Left as measured rather than re-aimed, because the honest kerb (halfWidth +
// ~1 m) collides with a second, budgeted defect: on the class with no band
// `computeParkedCars` already seats its row ON the footway (FR-21,
// traffic/__tests__/parked-on-footway.test.ts), so a навес put where a навес
// belongs would stand among bodies that are themselves in the wrong place.
// That is a placement decision with a second file in it, not a typo.
//
// AND IT TAKES NOTHING AWAY. Rule 3 opens a clear circle around every held
// body, so a new body normally costs decoration pixels — here it costs none:
// both spans are already empty kerb (mg because rule 2b cleared the bay, pk
// because its pocket sits inside an authored `noStopping` zone), and the test
// asserts `computeParkedCars` is body-for-body identical before and after.

/**
 * THE НАВЕС MOVED TO THE MODULE THAT OWNS THE MODEL — wave 8.
 *
 * This file used to derive the shelter itself, as a `kind: "wall"` obstacle
 * 4.5 × 2.5 × 0.2 m. The predicate was live (`heldSceneryFor` → lessonWorldRecipe
 * → LessonScene) and the pixels were still not a спирка: every wall renders
 * through ONE branch, `components/sim/ScenarioObstacles.tsx` ObstacleWall, a
 * single flat boxGeometry in #8d8a83 — so pk-busstop-v1's student was shown a
 * grey fence panel edge-on against a grey pavement in front of a grey building,
 * and sc-pk-busstop-ban stayed open through three waves with the code that
 * placed it passing its own tests.
 *
 * `world/builders/props.ts` reads the SAME authored keys now and pushes a
 * `world.busStops` transform instead, which `WorldProps.tsx` draws as the real
 * modelled shelter — canopy, legs, and a separate emissive face that lights at
 * night — the same object the frontage and junction passes have always placed.
 * One навес, one recipe, one look, and it stands AT the kerb rather than at a
 * decoration-band centre that sits a whole parking band further out on one edge
 * class than the other (the placement error the old derivation documented at
 * length here and could not fix from this side).
 *
 * WHAT STAYS HERE is rule 2b below: the kerb the stop needs empty. That is a
 * property of the curb-decoration pass, which this file is the seam for, and
 * it is what keeps the new shelter from standing behind a parked car.
 */
/** Circles covering the kerb line x = kerbX from fromY to toY, each wide
 *  enough that a decoration body CENTRED on that kerb inside the span is
 *  caught (the curb pass tests centres, not footprints). */
function kerbSpanZones(kerbX: number, fromY: number, toY: number): ParkedClearZone[] {
  const out: ParkedClearZone[] = [];
  const steps = Math.max(1, Math.ceil((toY - fromY) / PARKED_HALF_DIAG_M));
  for (let i = 0; i <= steps; i++) {
    out.push({
      x: kerbX,
      y: fromY + ((toY - fromY) * i) / steps,
      radiusM: PARKED_HALF_DIAG_M,
    });
  }
  return out;
}

/** Circles covering the segment (ax,ay)→(bx,by) at WALK_CLEAR_RADIUS_M. */
function corridorZones(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): ParkedClearZone[] {
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(len / WALK_CLEAR_PITCH_M));
  const out: ParkedClearZone[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({
      x: ax + (bx - ax) * t,
      y: ay + (by - ay) * t,
      radiusM: WALK_CLEAR_RADIUS_M,
    });
  }
  return out;
}

const walkZoneCache = new Map<string, readonly ParkedClearZone[]>();

/**
 * Clear zones for one lesson's parked-car curb pass ([] when the template
 * stages no walker, its map names no bus stop and its template holds no
 * dressing). Flows through LessonWorldCore so the drill and the capture rig
 * mount the SAME filtered decoration (doc 66 R5 — one recipe). Purely visual:
 * the curb pass has no colliders and feeds no proximity query, so removing a
 * body changes zero grading.
 */
export function parkedClearZonesFor(
  lessonId: string,
  districtRaw?: unknown,
): readonly ParkedClearZone[] {
  const parsed = parseScenarioLessonId(lessonId);
  if (!parsed) return [];
  // The district is an OPTIONAL second input (the bus-stop rule below), so the
  // cache must not serve a district-less answer to a district-ful caller.
  const cacheKey = `${parsed.templateId}|${districtRaw === undefined ? 0 : 1}`;
  const cached = walkZoneCache.get(cacheKey);
  if (cached) return cached;
  const spec = scenarioById(parsed.templateId);
  const zones: ParkedClearZone[] = [];
  // ── RULE 2 (doc 87 B64): NOBODY PARKS AT A BUS STOP. ─────────────────────
  //
  // ЗДвП чл. 98, ал. 1, т. 4 — спиране и престой на спирка на превозно средство
  // от редовните линии е забранено. The curb pass did not know that, so on
  // `sp-creep-v1` the decorative row ran unbroken straight past the frontage
  // the drill points at, and the shelter that now stands there was behind a
  // parked car from the driving seat: „I stopped at my bus stop" with the bus
  // stop hidden by the thing that may not be there.
  //
  // Derived from the same authored key that places the shelter, so there is no
  // list to keep in sync — a map that names a stop clears its own kerb, and
  // the 90 districts that name none are byte-identical. Radius covers the
  // frontage plus the ban's own margin rather than a guessed number.
  if (districtRaw !== null && typeof districtRaw === "object") {
    const buildings = (districtRaw as { buildings?: unknown }).buildings;
    if (Array.isArray(buildings)) {
      for (const b of buildings as Array<{
        kind?: string;
        footprint?: Array<[number, number]>;
      }>) {
        if (b.kind !== "busStop" || !Array.isArray(b.footprint) || b.footprint.length < 3) continue;
        let cx = 0;
        let cy = 0;
        let half = 0;
        for (const [px, py] of b.footprint) {
          cx += px;
          cy += py;
        }
        cx /= b.footprint.length;
        cy /= b.footprint.length;
        for (const [px, py] of b.footprint) half = Math.max(half, Math.hypot(px - cx, py - cy));
        zones.push({ x: cx, y: cy, radiusM: half + BUS_STOP_NO_PARK_MARGIN_M });
      }
    }
    // ── RULE 2b (sweep 161): A STOP IS A SPAN OF KERB, NOT ONLY A SHELTER. ──
    //
    // Rule 2 above reads `buildings[].kind === "busStop"`, and it was written
    // against `sp-creep-v1`, which has one. TWO districts in the shipped tree
    // author a bus stop as a SPAN in `meta.scenario` instead — and they are the
    // two whose entire lesson IS the stop:
    //
    //   mg-busstop-v1  busBayY        { fromY 130, toY 176 }  sc-merge-bus-pullout
    //   pk-busstop-v1  busStopPocketY { fromY 180, toY 210 }  sc-pk-busstop-ban
    //
    // Neither carries a `busStop` building (measured: `buildings[].kind` is
    // `null` on both), so rule 2 was a silent no-op exactly where the founder
    // and the sweep were looking. Sweep 161 on `sc-merge-bus-pullout`: „an
    // unbroken row of privately parked cars occupying the supposed bus lane"
    // — and it is unbroken, straight through the bay. Measured against the real
    // `computeParkedCars`: SIX decoration bodies stand inside the authored bay
    // (y = 129.8, 136.4, 149.6, 156.2, 162.8, 169.4 at the x = 18.25 kerb),
    // i.e. six private cars parked in the bus stop the drill is about, on a
    // street whose every metre is also a `busLane` zone (ЗДвП чл. 98, ал. 1 —
    // спиране и престой на спирка е забранено).
    //
    // Derived, no list, same doctrine as rules 2/3: the span and the kerb both
    // come from the district's OWN authored numbers. The kerb line is where the
    // curb pass puts its band — `laneWidth × lanes ÷ 2 + PARK_BAND_CENTER_M`,
    // rebuilt here from `laneCenterRightM` (the OUTERMOST lane centre, i.e.
    // (2·lanesPerDirection − 1) half-lanes out) so no lane width is guessed:
    //   mg-busstop-v1  L=2, C=12.19 → half-lane 4.063, edge 16.25, kerb 18.25
    //   pk-busstop-v1  L=1, C=4.06  → half-lane 4.06,  edge  8.12, kerb 10.12
    // both within 0.01 m of the row `computeParkedCars` actually emits, and the
    // circles are PARKED_HALF_DIAG_M wide, so the slop cannot matter. Stops sit
    // on the right-hand kerb, so the sign of `laneCenterRightM` picks the side
    // and the opposite kerb is never touched.
    //
    // pk-busstop-v1 is the control: its pocket is already inside an authored
    // `noStopping` zone, so the curb pass keeps that kerb empty on its own and
    // this rule removes NOTHING there — the test asserts that byte-for-byte, so
    // a rule that started deleting kerbs it has no business deleting fails.
    const scenario = (districtRaw as { meta?: { scenario?: unknown } }).meta?.scenario;
    if (typeof scenario === "object" && scenario !== null) {
      const kerbX = parkedKerbXOf(scenario as Record<string, unknown>);
      if (kerbX !== null) {
        for (const span of authoredStopSpansOf(scenario as Record<string, unknown>)) {
          zones.push(
            ...kerbSpanZones(
              kerbX,
              span.fromY - BUS_STOP_NO_PARK_MARGIN_M,
              span.toY + BUS_STOP_NO_PARK_MARGIN_M,
            ),
          );
        }
      }
    }
  }
  // ── RULE 3 (doc 88): nothing parks on the lesson's own prop. ─────────────
  // Derived from the SAME table that places the dressing, so a new held body
  // clears its own kerb and a template without dressing is byte-identical.
  for (const held of heldSceneryFor(lessonId, districtRaw)) {
    zones.push({
      x: held.x,
      y: held.y,
      radiusM: heldHalfDiagM(held) + PARKED_HALF_DIAG_M,
    });
  }
  if (spec) {
    const staged = [
      ...(spec.staged ?? []),
      ...spec.levels.flatMap((level) => level.stagedAdd ?? []),
    ];
    for (const event of staged) {
      if (event.kind !== "pedestrianDartOut") continue;
      zones.push(
        ...corridorZones(
          event.start.x,
          event.start.y,
          event.start.x + event.dir.x * event.travelM,
          event.start.y + event.dir.y * event.travelM,
        ),
      );
    }
  }
  const frozen: readonly ParkedClearZone[] = zones;
  walkZoneCache.set(cacheKey, frozen);
  return frozen;
}

// ---------------------------------------------------------------------------
// The composition LessonScene mounts
// ---------------------------------------------------------------------------

/**
 * All held scenery for one scenario lesson: the template's dressing + the
 * district's authored cones + the shelter its authored stop span earns. Pure
 * data — the caller appends it to the occupied-bay obstacle list and mounts ONE
 * ScenarioObstacles.
 *
 * The two derived sources are DISTRICT properties, not template ones: every
 * lesson that loads the map sees the same street, which is the point — a
 * spirka that appeared only on the drill about spirki would be one more thing
 * the world says only when it is being graded.
 */
export function heldSceneryFor(
  lessonId: string,
  districtRaw: unknown,
): ScenarioObstacleSpec[] {
  const parsed = parseScenarioLessonId(lessonId);
  const dressing = (parsed && HELD_SCENERY[parsed.templateId]) || [];
  return [...dressing, ...scenarioConesOf(districtRaw)];
}
