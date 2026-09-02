/**
 * P5 integration contracts — the seams between the sim's parallel workstreams.
 * Owned by the integrator (main session). Implementations live in:
 *   world/     — district geometry + visual world (renders district-v1.json)
 *   runtime/   — logic layer: signals, zones, lane tracking, SimTick emission
 *   lessons/   — lesson specs, objectives, session orchestration
 *   traffic/   — scripted traffic agents
 *   environment/ — sky, lighting, weather, time-of-day, quality presets
 *
 * The rule engine's SimTick/SimTickEvent (rules/types.ts) is the *authoritative*
 * frame contract — runtime produces it, nothing else redefines it.
 */

import type { RuleEngineConfig, SimTick } from "./rules/types";
import type { PreDriveMode } from "./procedures/types";
// The tier a lesson may open on. Type-only, and `vehicle/` imports nothing
// from here, so this cannot close a cycle.
import type { DifficultyMode } from "./vehicle/difficultyMode";

/**
 * PERCEPTUAL ROAD SCALE — the single dial for how exaggerated the road
 * network is versus textbook Bulgarian dimensions (founder call 2026-07-10:
 * perception over textbook; tunable). Driving games run 1.5–2.5× lane
 * exaggeration because textbook-width lanes read miniature on screen; we run
 * 2.5×. The CAR stays real-size — only the road world scales. EVERY road
 * dimension (lane width, paint, setbacks, grading tolerances, traffic-AI
 * offsets) must derive from this constant so one edit re-tunes the world
 * coherently — visual geometry, grading geometry, traffic AI and paint have
 * to agree or detectors misfire.
 */
export const PERCEPTUAL_ROAD_SCALE = 2.5;

/** Vehicle state sampled from the physics rig each frame (world space, meters). */
export interface VehicleSample {
  position: { x: number; y: number }; // ground plane; x=east, y=north (district space)
  headingDeg: number; // 0 = north, clockwise positive
  speedKmh: number;
  indicator: "off" | "left" | "right";
  headlights: "off" | "low" | "high";
  seatbeltOn: boolean;
  handbrakeOn: boolean;
  gear: number;
  /** Set on the frame a glance is latched. `"shoulder"` is the blind-spot
   *  check — a look, not a mirror (rules/types.ts `GlanceKind`). */
  mirrorGlance: "left" | "right" | "rear" | "shoulder" | null;
  /**
   * B1a (doc 72 VP-04): the driveline's latched stall flag (DrivelineState
   * .stalled — set by a stall, cleared by the next successful restart).
   * Additive; absent = the rig has no stall channel (automatic fleet / older
   * callers). The rule engine grades the RISING EDGE as the official
   * второстепенна „загасване".
   */
  stalled?: boolean;
  /**
   * Front fog lamps on (the driveline's fogLightsOn channel — cockpit V key).
   * Additive; absent = the rig has no fog-lamp channel = treated as off. Only
   * graded when the world is in FOG (FOG_LIGHTS_OFF_IN_FOG), so existing
   * callers stay byte-identically innocent.
   */
  fogLightsOn?: boolean;
}

/** Traffic-signal runtime state, per signal node id from district-v1.json. */
export type SignalPhase = "red" | "redYellow" | "green" | "yellow";

/**
 * What a signal head's LAMPS show — the render read model (founder review R3,
 * doc 62 S1 "signal render desync"). A superset of SignalPhase: a cluster
 * dialed DARK shows no lamp at all, and a FLASHING-AMBER cluster alternates
 * "amberFlashOn"/"amberFlashOff" on the runtime's own signal clock (so the
 * blink and the grading share one clock — never a render-side second timer).
 * Derived from the SAME mode + offset state stop-line adjudication reads
 * (SignalController), so the rendered lamp can never disagree with the graded
 * phase: dark/flashing clusters grade as UNCONTROLLED junctions and render
 * unlit/blinking; live and "controlled" clusters render the live cycle
 * ("controlled" lamps stay misleading-but-visible by design, ЗДвП чл. 7).
 */
export type SignalLampState = SignalPhase | "dark" | "amberFlashOn" | "amberFlashOff";

export interface WorldRuntime {
  /** Advance signal phases etc.; call once per render frame. */
  update(dtSec: number): void;
  /** Produce the authoritative SimTick for the rule engine from a vehicle sample.
   *  `fog` (additive, default false) is the FOG condition flag — it reaches the
   *  tick exactly like `rain` does (the doc 72 AC-03 seam); `snow` (additive,
   *  default false) is the SNOW condition flag, the same seam again (AC-08).
   *  `vruAheadM` (additive, default Infinity) is the bumper-to-body distance to
   *  the nearest STAGED PERSON standing in the car's own path — `leadGapM` for
   *  the road user чл. 5, ал. 2 puts first. It reaches the tick the same way
   *  `leadGapM` does and it can only ever ACQUIT (`rules/engine.ts`, the
   *  ban-zone block); `Infinity` means „nobody there or nobody could answer",
   *  which is what every caller that omits it says. Measured by
   *  `orchestrator/contact.ts vruAheadMeters`. */
  sample(
    v: VehicleSample,
    tSec: number,
    isNight: boolean,
    rain?: boolean,
    leadGapM?: number,
    fog?: boolean,
    snow?: boolean,
    vruAheadM?: number,
  ): SimTick;
  /** Current phase for a signal node (grading/traffic read model; ignores
   *  cluster MODES — a dark cluster still reports its underlying cycle). */
  signalPhase(signalNodeId: string): SignalPhase;
  /**
   * Lamp state for a signal HEAD the world renderer lights (doc 62 S1 fix):
   * mode-aware (dark → "dark", flashingAmber → the blink pair on the runtime
   * clock) and approach-aware (`approachBearingDeg` = compass bearing of
   * travel INTO the junction on the head's arm — omit to fall back to the
   * node's own axis-group). This is THE render source of truth: it reads the
   * same cluster mode + (pin-rebased) offset stop-line grading reads.
   */
  signalLampState(signalNodeId: string, approachBearingDeg?: number): SignalLampState;
  /** Resolved speed limit at a position (edge maxspeed or BG urban default 50). */
  speedLimitAt(pos: { x: number; y: number }): number;
  /** Nearest drivable edge + lane info (for HUD/minimap and lane tracking). */
  locate(pos: { x: number; y: number }): {
    edgeId: string | null;
    laneId: number;
    laneOffsetM: number;
  };
}

/**
 * Multi-map seam (doc 74 §5.1): the district a lesson without `world` plays
 * on — the original Студентски град map. Every existing spec omits the field,
 * so the default keeps them byte-identical in behavior.
 */
export const DEFAULT_DISTRICT_ID = "district-v1";

/** Resolved district id of a lesson (absent `world` = the city default). */
export function lessonDistrictId(lesson: Pick<LessonSpec, "world">): string {
  return lesson.world?.districtId ?? DEFAULT_DISTRICT_ID;
}

/**
 * Ambient-traffic sizing the scene used to hardcode (doc 74 §5.5) — now the
 * per-lesson `traffic` field's fallback. These ARE the pre-seam city values;
 * changing them re-tunes every lesson that doesn't override.
 */
export const DEFAULT_LESSON_TRAFFIC = {
  vehicleCount: 26,
  pedestrianCount: 20,
  anchorRadiusM: 280,
} as const;

/**
 * One numbered briefing step, as the student reads it.
 *
 * Structurally identical to `ScenarioSpec.StepText` and deliberately NOT
 * imported from it: `contracts.ts` is the boundary the exam bank and the
 * curriculum share, and it may not depend on the scenario layer.
 */
export interface LessonBriefingStep {
  /** 1-based; the list is contiguous 1..n. */
  n: number;
  textBg: string;
}

/** A scored driving lesson. Specs are data; orchestration lives in lessons/. */
export interface LessonSpec {
  id: string; // "l-first-drive"
  order: number;
  titleBg: string;
  descriptionBg: string;
  /**
   * THE BRIEFING THE STUDENT IS ACTUALLY SHOWN — the numbered „какво ще
   * правиш" steps, rendered by `LessonPlayShell` (the „Инструкции" card on a
   * roomy screen, a queue line with the whole list one tap behind it on a
   * phone).
   *
   * WHY THIS FIELD EXISTS (2026-08-02, and it is the whole lesson of the
   * wave). `ScenarioSpec.instructionsBg` carries hand-authored numbered steps
   * on all 157 templates — and `compileScenario` DROPPED them. Nothing
   * rendered them, so the copy reached the type, the validator and the tests
   * and stopped there. The world-referent gate then read that field as proof
   * that a night drill had told the student to switch the lights on, which
   * meant a lane could clear 214 rung-codes of HEADLIGHTS_OFF_* by writing
   * Bulgarian into a void: the fault still fired, the student was still never
   * told, and the gate could no longer see it. A referent may only ever read
   * evidence a student can perceive, which is what
   * `world/referents.ts EVIDENCE_CHANNELS` now asserts — and this is the
   * field it points at.
   *
   * Absent = no briefing (curriculum + exam-bank lessons brief through
   * `descriptionBg` and the objective banner; bit-identical to before).
   */
  briefingBg?: LessonBriefingStep[];
  /** Concept ids this lesson exercises (links sim ↔ knowledge graph). */
  conceptIds: string[];
  /**
   * B-multi-map (doc 74 §5.1): which world file this lesson plays on —
   * LessonScene fetches `/world/${districtId}.json`. Absent =
   * DEFAULT_DISTRICT_ID (district-v1, Студентски град). Everything downstream
   * of the fetch (runtime, builder, traffic, minimap, spawns, guidance) is
   * parameterized by the parsed document — proven map-agnostic by the
   * poligon-district test suite.
   */
  world?: { districtId: string };
  /**
   * THE STREET'S OWN POSTED LIMIT, km/h — carried so no channel that SPEAKS to
   * the student can print a number above the sign (doc 87 B58).
   *
   * The founder's finding was an in-world gate bar reading «не по-бързо от 57
   * км/ч» on a street posted 50, inside the drill that grades speeding. Two of
   * the three channels that print a cap are fixed elsewhere — the ladder that
   * generated the 57 (`scenario/params.ts` widenSpeedCap) and the world label
   * (`RouteGuidance.postedLimitAt`, which reads the district edge under the
   * marker and so handles a 50→30 transition per gate). The third is the
   * ADVISOR card, which is a pure derivation over the session and has no
   * district in hand — hence this field, set by `compileScenario` from the
   * template's own map recipe.
   *
   * Absent (curriculum + exam-bank lessons, any test double) ⇒ every channel
   * behaves exactly as before.
   */
  postedLimitKmh?: number;
  /**
   * B-multi-map (doc 74 §5.5): per-lesson ambient traffic sizing. Absent
   * fields fall back to DEFAULT_LESSON_TRAFFIC (the city values). The полигон
   * runs ~2 vehicles / 2 pedestrians — an учебна площадка is not a highway.
   */
  traffic?: {
    vehicleCount?: number;
    pedestrianCount?: number;
    anchorRadiusM?: number;
    /**
     * THE REST OF THE ROUTE, for a lesson that travels — stations in route
     * order, past the spawn the scene anchors on.
     *
     * Ambient loops are built once, near the spawn, and a lesson that drives
     * 900 m away from it therefore runs its second half down an empty street
     * (`sc-ed-d2-priority-run:76d2e929`). Naming the corridor deals those loops
     * along it instead. See `traffic/routes.ts` for the measurement.
     *
     * Absent ⇒ one station ⇒ every route is exactly what it was.
     */
    anchorPath?: readonly { x: number; y: number }[];
    /**
     * Ambient PAVEMENT walkers — people on the footway who never step onto the
     * carriageway, so they arm no crossing duty and change no grading (the
     * „SIDEWALK-ONLY WALKERS" block in `traffic/pedestrians.ts` carries the
     * proof). Absent ⇒ the live scene sizes them from the DISTRICT'S OWN
     * walkable kerb length (`ambientSidewalkBudget`), which is why this is an
     * override and not a required number: an empty pavement is a property of
     * the street, and every scenario map inherited one by default.
     *
     * Set it to 0 to author a genuinely deserted road on purpose.
     */
    sidewalkPedestrianCount?: number;
  };
  /** Spawn point id from the lesson's district JSON, or explicit pose. */
  spawn: { pointId?: string; position?: { x: number; y: number }; headingDeg?: number };
  /** Whether the 13-step pre-drive procedure runs before driving. */
  preDrive: boolean;
  /**
   * A2 pre-drive mode (Instruction→Practice→Assess ladder, doc 68 §5).
   * Default (absent) = "instruction": guided prompts + hotspot highlights,
   * order coached. "practice" = no guidance, order-tolerant, idle hints.
   * "assess" = exam-strict order scoring. Only read when `preDrive` is true.
   */
  preDriveMode?: PreDriveMode;
  /**
   * Vehicle state at spawn (A1 driveline). Default (absent) = "cold": engine
   * OFF, selector P, parking brake ON — the pre-drive reality every lesson
   * should start from. "ready" = engine running in D with the brake released;
   * reserved for acclimatization free-drive (L0).
   */
  vehicleStart?: "cold" | "ready";
  /**
   * The difficulty tier the scene OPENS on. Absent = `DEFAULT_DIFFICULTY`,
   * which is every lesson but the clutch drill — and the tier is what decides
   * the GEARBOX (`transmissionModeFor`: "advanced" → manual + clutch). See
   * `ScenarioStartSpec.openingTier` for the measurement (sc-vp-stall:e4dfb43f)
   * and for why a lesson may state which car it hands over. Seeds the picker's
   * opening state only; the tier pill still switches it mid-drive.
   */
  openingTier?: DifficultyMode;
  /** Ordered objectives; each completes via a predicate over runtime state. */
  objectives: LessonObjective[];
  /** Optional time-of-day/weather override. `fog` = dense FOG (doc 72 AC-03):
   *  the scene renders the thick FogExp2 + dimmed rig, and the runtime feeds
   *  tick.fog so the fog conditions envelope + fog-lamp duty arm. `snow` =
   *  SNOW weather (doc 72 AC-08 winter grip): a LIGHTER cold haze + milder
   *  dim (SimEnvironment snowWeather specs), and the runtime feeds tick.snow
   *  so the snow conditions envelope arms (no lamp duty). Additive — absent =
   *  today's clear/rain behavior, byte-identical.
   *
   *  THERE IS NO SEASON HERE, AND THAT IS THE ADDRESS OF TWO STANDING AUDIT
   *  ROWS — sc-ac-bridge-ice:7eb16029 and sc-ac-ice:5372f176. Both lessons
   *  author `weather: "dry"` (correctly: black ice is invisible and a dry
   *  black street IS the lesson) and both open on a briefing that says
   *  «зимна сутрин е около нулата» over full-leaf green trees, a blue sky and
   *  warm sun on the facades. Re-measured 2026-08-28 on
   *  `.audit-frames/w14/frames/sc-ac-ice__pc-right/03-ready.png` and
   *  `…/sc-ac-bridge-ice__pc-right/03-ready.png` — two DIFFERENT districts,
   *  mean sRGB over identical rectangles: sky 153.8/170.8/191.6 in both,
   *  facade 137.6/148.5/161.7 vs 137.5/148.5/161.6, tree canopy 73.4/97.4/75.5
   *  vs 73.8/97.7/75.6, near road L117.3 vs L117.5. Two lessons, one summer
   *  morning, to within a third of a level on every band.
   *
   *  THAT MEASUREMENT IS THE BEFORE. The season now exists — `winter` below —
   *  and it landed as one chain rather than as a boolean with no reader, which
   *  is the failure mode this corpus has measured 51 times in 82 repairs:
   *  `ConditionAxis.winter` (lessons/scenario/types.ts) → `compileScenario`'s
   *  environment fold → `LessonScene` → `SimEnvironment` + `SkyDome`
   *  (`winterGrade`, the LIGHT half) and `DistrictWorld` (the seasonal
   *  dormancy uniform, the FOLIAGE half), with `winter: true` authored on both
   *  ice templates. The AFTER has not been photographed: no drive was taken at
   *  this commit, so the R0 look is owed and the re-drive that settles it is
   *  the same `pc-right/03-ready.png` pair the numbers above come from.
   *
   *  sc-ac-snow was DELIBERATELY left un-wintered. The plan that stood here
   *  named it as a third template to flag, but its picture is already carried
   *  by the snow haze, the snowed carriageway and the prop snow cover, its
   *  compiled environment is pinned by four tests, and stacking a second
   *  seasonal grade under falling snow is a look that needs its own R0 rather
   *  than a same-lane guess.
   *
   *  THE „IDENTICAL STREET" HALF OF 5372f176 IS REPAIRED — RE-MEASURED
   *  2026-08-30, and recorded here because the paragraph that stood in this
   *  slot asserted the opposite. It said: „the two ice lessons are IDENTICAL"
   *  is `worldRim.ts:264`, whose mass ids (`world-rim-${side}-${i}`) carry no
   *  district. That is FALSE at HEAD. f91dd1c (wave 8) put the district INTO
   *  the id: `worldRim.ts:267` takes `districtKey = district.meta.district`
   *  and `:319` builds `world-rim-${districtKey}-${run.side}-${i}`, so the rim
   *  hash, the run heights and `facadeVariant` now diverge per district. The
   *  pair runs on TWO maps (`ac-ice-v1` / `ac-bridge-v1`) and the belts are no
   *  longer one street: on the w15 03-ready frames — captured 12:01, AFTER
   *  f91dd1c landed at 09:30 the same day, so they already carry the fix —
   *  identical rectangles read facade 147.2/152.3/156.3 vs 158.9/165.8/172.1
   *  and the right-hand block 152.6/159.4/164.2 vs 126.9/106.9/92.3.
   *
   *  WHAT THE JUDGE MEASURED AS IDENTICAL IS EXACTLY WHAT THE RIM DOES NOT
   *  DRAW. Its three probes were sky, asphalt and tree canopy; on those same
   *  frames the sky is 150.8/169.4/191.3 in BOTH to a tenth of a level, and
   *  green-dominant pixels still cover 0.8–3.4% of the viewport. Sky tone,
   *  road tone and foliage come from the shared environment preset and the
   *  world's summer trees — never from the building belt, which is why the
   *  rim repair moved the facades and left those three probes untouched.
   *  So 5372f176 never had a second cause: BOTH ice rows reduced to the
   *  missing season, which is what `winter` below is. */
  environment?: {
    timeOfDay?: "day" | "dusk" | "night";
    rain?: boolean;
    fog?: boolean;
    snow?: boolean;
    /**
     * THE SEASON. Orthogonal to `timeOfDay` and to every weather flag above:
     * a lesson may be a winter night, or winter with snow falling, or — as the
     * two ice lessons are — a clear, dry, winter morning. Spelled here rather
     * than as a fourth `TimeOfDay` because that union is `Record`-keyed in
     * `RainStreaks.tsx` and `SnowFlakes.tsx`.
     *
     * WHAT IT ACTUALLY MOVES, both halves shipped together so this is not a
     * value with no consumer:
     *  · LIGHT — `SimEnvironment` grades the preset through `winterGrade`
     *    (environment/presets.ts): pale blue-white key at 0.78 of summer with
     *    doc 71's 3.5:1 key:fill ratio preserved, cold-grey ground bounce in
     *    place of the warm facade one, thicker pale haze, a quarter-stop less
     *    exposure — and `SkyDome` takes the same grade, so the dome goes milky
     *    over a snow-lit Vitosha instead of staying #3f76c4 summer blue.
     *  · FOLIAGE — `DistrictWorld` browns off the canopies and the verge
     *    (world/textures/snowCover.ts's dormancy term, weighted by each
     *    fragment's own greenness, so steel, concrete, asphalt, sign faces and
     *    signal lenses are all untouched and stay exactly as legible).
     * Neither half closes the row alone: a winter light grade under full-leaf
     * green canopies still photographs as July.
     *
     * It does NOT touch grip. Winter physics stays the explicit `physics`
     * opt-in below and the district's own icePatch data — the same discipline
     * that keeps `rain` from implying `wetGrip`.
     */
    winter?: boolean;
  };
  /**
   * ADR-006 stage 4a — OPT-IN physics overrides for the LIVE VehicleSim.
   * `wetGrip: true` runs the hero car at tuning.WET_GRIP_FACTOR (0.7): tyre μ
   * and service-brake force scale down → ~1.4× braking distance, reduced
   * cornering grip. `snowGrip: true` runs it at tuning.SNOW_GRIP_FACTOR
   * (0.4, packed snow → ~2.5× braking distance); when both are authored the
   * MOST RESTRICTIVE factor wins (min — the condition-factor discipline).
   * `crosswind: true` (doc 72 AC-12 — the wind unlock) blows a constant
   * westward lateral wind + a deterministic sine gust through the LIVE
   * session (tuning.CROSSWIND_BRIDGE_N ± CROSSWIND_GUST_*, world −X =
   * district west; on a northbound street it shoves the car toward the
   * center line — the AC-12 story). An ORTHOGONAL channel: it composes with
   * the grip flags and touches force, never μ.
   * DELIBERATELY DECOUPLED from environment.rain/snow (and every weather
   * tag): today's rain lessons were authored and recorded against dry, CALM
   * physics, and flipping them would silently change shipped feel — only a
   * scenario that AUTHORS the physics field (compileScenario ←
   * ScenarioSpec.physics) gets reduced-grip or wind dynamics. Absent =
   * gripFactor 1.0, wind 0 = bit-identical dry physics (the CI harness
   * baselines are the proof). Recorded traces are kinematic and never read
   * this field — their wet/snow/wind honesty is authored in the trace
   * scripts (the dual-channel notes in traces/scAcWetBraking.ts and
   * traces/scAcCrosswind.ts).
   */
  physics?: { wetGrip?: boolean; snowGrip?: boolean; crosswind?: boolean };
  /**
   * Per-lesson rule-engine config override (merged over DEFAULT_RULE_CONFIG;
   * createLessonSession opts win over this). Scenario drills for config-gated
   * detectors (e.g. JUNCTION_SCAN_INCOMPLETE, FOLLOWING_TOO_CLOSE_FOR_RAIN,
   * default-OFF so they never touch the exam bank / free-drive) set it here so
   * the LIVE student session grades the taught fault — not only the recorded
   * shadow. compileScenario propagates it from ScenarioSpec.ruleConfig.
   */
  ruleConfig?: Partial<RuleEngineConfig>;
  /**
   * Approach-relative signal pin for this lesson's taught junction (see
   * SignalPlanSpec — founder bug 2026-07-17). LessonScene arms it on the
   * world runtime after the build; the trace RECORDER never reads it, so
   * recorded traces keep their authored signalOffsets byte-identically.
   * compileScenario propagates it from ScenarioSpec.signalPlan; absent =
   * wall-clock phases (today's behavior, bit-identical).
   */
  signalPlan?: SignalPlanSpec;
  /**
   * Session-start signal-cluster MODE dials, per signal node id (doc 62 S1 —
   * the live half of the recorder's `signalModes` option): LessonScene applies
   * each through runtime.setSignalClusterMode right after the runtime is
   * built, so a „загаснал светофар"/„мигащо жълто" drill is DARK / FLASHING
   * AMBER in LIVE play exactly as in its recorded traces — grading falls back
   * to the uncontrolled-junction rules AND the lamps render unlit/blinking
   * from the same mode state. Only the two teaching dials are authorable
   * ("controlled" is armed by the trafficController staged runner, never
   * here). compileScenario propagates it from ScenarioSpec.signalModes; the
   * trace RECORDER never reads this field (its truth is the trace scripts'
   * own signalModes option — the byte-identity contract). Absent = every
   * cluster live, today's behavior bit-identical.
   */
  signalModes?: Readonly<Record<string, "dark" | "flashingAmber">>;
  /** Marked parking bay this lesson's park objective targets (L7). The world
   * paints every lesson-authored bay by default (buildWorldGeometry ←
   * LESSON_PARKING_BAYS from lessons/specs). */
  parkingBay?: ParkingBaySpec;
  /** Sudden-obstacle stimulus for emergency-stop lessons (L5). Render-side
   * lives in TrafficLayer; the trigger is A8's job. */
  hazard?: HazardStimulusSpec;
  /**
   * A8 staged encounters — deterministic scripted events the scenario
   * orchestrator (modules/sim/orchestrator) directs during this lesson.
   * DATA ONLY, pinned to district-v1.json like every other spec field;
   * absent/empty = free ambient traffic only (pre-A8 behavior).
   */
  stagedEvents?: StagedEventSpec[];
  /**
   * Doc 87 B40(a) — captions anchored to a STAGED ACTOR, for the case where
   * the lesson's subject is a car the student cannot read at the range the
   * lesson asks him to read it at. Render-only: `TrafficLayer` draws one
   * billboarded world plane per entry while the named actor is genuinely
   * standing still, and nothing here is graded (see
   * `traffic/stagedActorLabels.ts` for the measurement and the honesty rule).
   * Absent on every lesson but «Спане на зелено» — one `?? null` per frame.
   */
  actorLabels?: readonly ActorLabelSpec[];
  /**
   * A13 exam session mode („Пробен практически изпит"). Additive; absent =
   * training lesson. True flips the session to exam-strict behavior:
   *  - coach OFF — every violation grades at catalog points from the FIRST
   *    encounter (no teach moments, no warn-once, no escalation multipliers;
   *    lessons/engine.ts wires it through scenarios/coach `examMode`);
   *  - live official termination — any опасна, any collision, > 9 total
   *    points or > 6 points from основни ends the session immediately
   *    („Изпитът се прекратява", lessons/exam.ts);
   *  - the shell suppresses route guidance and micro-quizzes — the student
   *    navigates by the objective banner's examiner instructions.
   */
  examMode?: boolean;
  /**
   * A13 unlock gate for out-of-curriculum entries (the exam card on
   * /simulator): the entry unlocks once THIS lesson id has a passed session
   * (lessons/progression.ts isExamUnlocked). Linear curriculum progression
   * ignores it; absent = always unlocked.
   */
  unlockAfterLessonId?: string;
  /**
   * S0 Scenario Studio (doc 76 §7) — per-level learning aids of a compiled
   * scenario micro-lesson. ADDITIVE + DATA ONLY: absent (every existing
   * lesson) = no aids, byte-identical behavior. The scenario compiler
   * (lessons/scenario) writes it per difficulty level; LessonScene/the shell
   * consume it when the S0-View workstream lands the ghost/top-down/timeline
   * renderers — until then the field is inert data riding the existing
   * LessonSpec prop path.
   */
  aids?: LessonAidsSpec;
  /**
   * S1 (doc 76 §0 low-speed fidelity): minimum impact speed, km/h, that
   * grades a contact as COLLISION in this lesson. Absent = the street
   * nudge-tolerance default (VehicleRig COLLISION_MIN_KMH = 10). The scenario
   * compiler writes 0 for maneuver drills — in a parking task a 2 km/h
   * bumper touch on a parked car IS the graded mistake. Additive: every
   * existing lesson omits it and keeps street behavior byte-identical.
   */
  collisionMinKmh?: number;
  /**
   * THEO-3 mistake-experience mode („Направи грешката", doc 64): the student
   * performs the template's demonstrated WRONG action ON PURPOSE in a
   * sandboxed, never-scored pass. When present the session engine routes
   * EVERY violation through the coach's existing learn-only suppression
   * channel (nothing scores, nothing terminates — scenarios/coach.ts
   * `learnOnly`) and emits the ONE-SHOT consequence moment the first time a
   * `codes` member fires (the shell pauses on it — consequence overlay).
   * `codes` is the targeted mistake's codeRefs, denormalized at compile time
   * (the parkingBay single-truth pattern). Written ONLY by compileScenario's
   * mistakeExperience opt-in (the ruleConfig/signalPlan precedent); absent =
   * normal graded session, bit-identical.
   */
  mistakeExperience?: { mistakeIndex: number; codes: readonly string[] };
}

/**
 * Approach-relative signal pinning (founder bug 2026-07-17: „зеленото и
 * червеното сменят твърде бързо, жълто не видях — потеглям на зелено, а
 * минавам на червено"). Signal clusters run on the WALL CLOCK from scene
 * start, and the pre-drive procedure takes 20–40 s — so the phase a student
 * ARRIVED at was arbitrary. A signalPlan makes the arrival approach-relative
 * instead: the FIRST time the player comes within `triggerM` of the plan's
 * cluster, the runtime rebases that cluster's phase offset so the phase
 * facing the player's approach STARTS at that moment —
 *  - "greenFresh": a full 20 s green begins (drive through / decide on a
 *    fresh green — the light can no longer expire underneath the approach);
 *  - "redFresh": a full red begins (arrive on red, wait it out, see
 *    redYellow then green — the taught signal arc, JU-05/JU-08).
 * ONE-SHOT and deterministic (a pure function of the player's own
 * trajectory); after the fire the normal 50 s cycle continues from the
 * rebased clock, so later staged re-pins (e.g. the JU-06 amberDilemma
 * runner) land over it exactly as they land over the natural offset today.
 * Authoring notes: keep the spawn OUTSIDE the trigger ring (a spawn inside
 * fires the pin on frame one and the wall clock owns the arrival again),
 * and keep triggerM ABOVE any staged runner's own pin-arming distance when
 * both target the same cluster (the staged pin must fire second). LIVE
 * sessions only: LessonScene arms it on the world runtime; the trace
 * recorder never does — recorded traces pin via authored signalOffsets
 * (the byte-identity gate). Absent = today's behavior, bit-identical.
 */
/**
 * Which authored caption a staged actor wears (doc 87 B40(a)).
 *
 * The union lives here, in the leaf, and the COPY lives in
 * `traffic/stagedActorLabels.ts` — the same split `SignalLampState` /
 * `world/components/signalHeadLabels.ts` uses, and for the same reason:
 * `contracts.ts` may not import from a layer that imports it.
 *
 * `"standingOnGreen"` — a car holding still while its own signal is green,
 * i.e. the demonstration «Спане на зелено» stages and the founder could not
 * find („who ? who is sleeping on green").
 */
export type StagedActorLabelKind = "standingOnGreen";

/** One caption, anchored to one staged actor for as long as its claim is true. */
export interface ActorLabelSpec {
  /** `StagedEventSpec.id` — the orchestrator stages the actor under this id,
   *  so it is also `TrafficSystem.staged(id)`'s handle. */
  actorId: string;
  kind: StagedActorLabelKind;
}

export interface SignalPlanSpec {
  arm: "greenFresh" | "redFresh";
  /** Trigger ring radius around the target cluster's centroid, m (~45). */
  triggerM: number;
  /** Target cluster (cluster id or any member signal-node id); absent =
   * the cluster nearest the lesson spawn. */
  clusterId?: string;
}

/**
 * S1 — one bay of a scenario district's meta.scenario payload (the parking-lot
 * generator's single geometric truth): a ParkingBaySpec rect + occupancy.
 * Occupied bays receive precise hittable parked cars (ScenarioObstacles in the
 * scene; ObstacleRect2D in the headless trace recorder), free bays are
 * maneuver targets. Parsed defensively — a district without the payload
 * (city, полигон) simply yields [].
 */
export interface ScenarioBayMeta extends ParkingBaySpec {
  id: string;
  occupied: boolean;
}

/** Defensive read of `meta.scenario.bays` from a raw district document. */
export function scenarioBaysOf(districtRaw: unknown): ScenarioBayMeta[] {
  if (typeof districtRaw !== "object" || districtRaw === null) return [];
  const meta = (districtRaw as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return [];
  const scenario = (meta as { scenario?: unknown }).scenario;
  if (typeof scenario !== "object" || scenario === null) return [];
  const bays = (scenario as { bays?: unknown }).bays;
  if (!Array.isArray(bays)) return [];
  const out: ScenarioBayMeta[] = [];
  for (const raw of bays) {
    if (typeof raw !== "object" || raw === null) continue;
    const b = raw as Record<string, unknown>;
    if (
      typeof b.id !== "string" ||
      typeof b.x !== "number" ||
      typeof b.y !== "number" ||
      typeof b.headingDeg !== "number" ||
      typeof b.widthM !== "number" ||
      typeof b.lengthM !== "number" ||
      typeof b.occupied !== "boolean" ||
      ![b.x, b.y, b.headingDeg, b.widthM, b.lengthM].every(Number.isFinite)
    ) {
      continue;
    }
    out.push({
      id: b.id,
      x: b.x,
      y: b.y,
      headingDeg: b.headingDeg,
      widthM: b.widthM,
      lengthM: b.lengthM,
      occupied: b.occupied,
    });
  }
  return out;
}

/**
 * The Scenario Studio aid ladder contract (doc 76 §7, one flag per aid the
 * table names). Every flag is optional; absent = off. Consumers:
 *  - shadowCar / followHints — S0-View's ghost playback + deviation hints;
 *  - pathRibbon — the A7 guidance ribbon restyled as the correct-path overlay;
 *  - pauseOnError — the shell freezes physics on the first graded mistake
 *    (beyond the A9 teach-moment machinery, which stays coach-policy-driven);
 *  - topdownAllowed — the orthographic top-down POV may be used WHILE DRIVING.
 *    A POV, not an aid (founder ruling 2026-07-17): every scenario rung L1..L5
 *    and every curriculum/exam-bank lesson grants it; a rung opts OUT only by
 *    authoring the flag false. Demo/replay views are always free to use it.
 *    Doc 76 §4's cockpit-lock governs GRADED views — grading never reads the
 *    camera;
 *  - hintsAfterIdleSec — idle seconds before a contextual hint (L2 pattern).
 */
export interface LessonAidsSpec {
  /** Translucent ghost car replaying the correct recorded trace. */
  shadowCar?: boolean;
  /** Correct-path ground ribbon (the reference image's colored line). */
  pathRibbon?: boolean;
  /** Live follow-the-ghost deviation hints („0,8 м встрани от линията"). */
  followHints?: boolean;
  /** Freeze + card on the first graded mistake. */
  pauseOnError?: boolean;
  /** Top-down ortho camera allowed while driving (grading stays cockpit/chase-only elsewhere). */
  topdownAllowed?: boolean;
  /** Seconds of idling before a contextual hint appears; absent = no idle hints. */
  hintsAfterIdleSec?: number;
}

export interface LessonObjective {
  id: string;
  titleBg: string; // shown in the objective banner
  /** Reach a zone, maintain behavior, or pass a checkpoint — kinds the
   * lessons engine implements; keep this union in sync there. */
  kind: "reachZone" | "passSignal" | "completeManeuver" | "driveDistance";
  params: Record<string, unknown>;
}

/**
 * Painted parking-bay rectangle, district space (doc 68 A5): center (x, y),
 * headingDeg along the street (0 = north, cw), lengthM along the heading,
 * widthM across it. The world markings builder paints it as a white U-shape
 * (side line toward the roadway + both end lines; the curb closes the fourth
 * side). Scoring note: the parkInBay maneuver stays coordinate-free for now —
 * A10 (objective hardening) is what locks the objective to this rect.
 */
export interface ParkingBaySpec {
  x: number;
  y: number;
  headingDeg: number;
  widthM: number;
  lengthM: number;
}

/**
 * Sudden-obstacle stimulus for emergency-stop lessons (doc 68 A5): a bright
 * ball darts from (x, y) along the unit direction (dirX, dirY) at speedMps
 * for travelM meters, crossing the road in front of the student. DATA ONLY —
 * TrafficLayer renders/animates it while its `hazardActiveRef` is true; the
 * A8 scenario orchestrator owns WHEN to flip that ref (nothing triggers it
 * until A8 lands).
 */
export interface HazardStimulusSpec {
  kind: "ballDartOut";
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speedMps: number;
  travelM: number;
  /**
   * Dart VISUAL (render-only; TrafficLayer). Default/absent = the bright ball
   * (doc 68 A5). "animal" mounts the procedural quadruped rig (vehicleFleet
   * buildAnimalRig) on the SAME (x,y,dir,speed,travel) integrator — the
   * animal-hazard drill ("животно на пътя") reuses the ballDartOut path
   * mechanics but renders four legs + a head, not a ball. Grading is
   * untouched: the stimulus is data-only and the ego's own trace earns the
   * codes (a panic swerve across the solid line into the oncoming stream).
   */
  presentation?: "ball" | "animal";
}

// ---------------------------------------------------------------------------
// A8 staged scenario events (doc 68 A8; event library: docs/simulation/65).
//
// Each spec is authored DATA describing one deterministic encounter: the
// actor's scripted path (district node ids resolved against the same lane
// graph ambient traffic drives), its dormant hold pose, and the arm/trigger
// geometry the orchestrator evaluates against the player each frame.
// Outcomes are reported as SimTick events the EXISTING rule engine already
// grades (prioritySituation / crossing events / collision) — staged events
// add no new ViolationCodes.
// ---------------------------------------------------------------------------

/** Scripted vehicle path + dormant pose (resolved by traffic.stage()). */
export interface StagedActorPathSpec {
  /** District node ids; consecutive pairs must be lane-graph-connected. */
  pathNodes: string[];
  /** Dormant hold: arc of pathNodes[nodeIndex] + offsetM (negative = before). */
  hold: { nodeIndex: number; offsetM: number };
  /** Default cruise speed, m/s. */
  cruiseSpeedMps: number;
  /** Acceleration toward cruise on release, m/s² (default the staged 2.6).
   *  Authored down to ≤ the ghost's own ramp where a rear-approach actor must
   *  NOT out-accelerate a still-accelerating player off the line (VU-09: an
   *  ambulance that surges past the player's slow-speed launch arms the yield
   *  duty while the player is under the make-way threshold and the runner reads
   *  the slow launch as a yield — hold it to the player's pace so the duty
   *  arms only once the player is at cruise, in the corridor, refusing). */
  accelMps2?: number;
  /** Curb-side extra offset, m (cyclist proxy rides right of lane center). */
  extraRightOffsetM?: number;
  /** Closed loop path (roundabout circulation). */
  loop?: boolean;
  /** Presentation palette index. */
  colorIndex?: number;
  /**
   * Vehicle size/type profile (doc 72 §9 FO-06 „Зад камион"): "truck" renders
   * the box-truck rig, "van" the panel van, "bus" (doc 72 §15 VU-11, ЗДвП
   * чл. 67) the 12 m GLAZED city-bus rig with a route board — author it for
   * every спирка / редовна линия drill, because the duty чл. 67 creates is
   * owed to a scheduled-route vehicle and a windowless cargo box does not
   * announce one, "emergency" (doc 72 §15 N9,
   * VU-09) the white special-regime rig with the blue light bar, "tram"
   * (doc 72 §12 RX-04/RX-05, ADR-006 stage 3b) the articulated two-segment
   * tram rig — a tram actor is path-locked like every staged vehicle; its
   * authored polyline IS the tram track (street-running rails share the
   * traffic lane; no separate rail physics exists, honestly); "cyclist" /
   * "childCyclist" render the procedural bicycle + rider rigs (adult / child
   * size). Cyclist actors normally need NOT author this: the
   * CyclistRightHookRunner defaults its actor's render profile to "cyclist"
   * at stage time (runtime only — compiled specs are untouched); author it
   * explicitly only when another runner stages the rider (the child-cyclist
   * cut-in) or the child size is wanted. Absent =
   * "car" (the deterministic fleet pick — byte-identical pre-profile
   * behavior). Visual + data only: the leadGap/conflict queries stay
   * point-based (ADR-001: rigs fictional).
   */
  profile?:
    | "car"
    | "van"
    | "truck"
    | "bus"
    | "emergency"
    | "tram"
    | "train"
    | "cyclist"
    | "childCyclist"
    | "animal";
  /**
   * RESTING TURN INDICATOR — the blinker the actor shows from the moment it is
   * staged, before any runner has commanded anything.
   *
   * WHY IT EXISTS (2026-08-04, `clips/whyPanelPairing.MISSING_DRILLS` #1). The
   * ЗАОБИКАЛЯНЕ drill that ЗДвП чл. 43б (new in ДВ бр. 64/2025) needs opens on
   * «спрял на осевата с ляв мигач автомобил, който чака да завие наляво» — a
   * car STANDING STILL with its left indicator on. That blinker is not
   * decoration: § 6 т. 80 ДР defines заобикаляне as passing a STATIONARY
   * participant, which чл. 41 ал. 2's „движещото се" excludes, so the whole
   * reason this is a different manoeuvre from изпреварване is that the car
   * ahead is stopped and has ANNOUNCED why. Take the blinker away and the
   * student sees an abandoned car.
   *
   * The channel already exists end to end — `setIndicator` (ledger L6, founder
   * items 43/44) publishes `TrafficVehicleState.indicator` and the fleet
   * renders it. What did not exist was any way for a TEMPLATE to ask for it:
   * `setIndicator` is a runner-issued command, and a scenario spec cannot
   * reach the traffic port. So a stationary announced car — the defining image
   * of three withheld questions (q-krastovishta-051, q-manevri-024,
   * q-manevri-060) — was unauthorable, and that is why the drill is on the
   * missing list rather than merely unbuilt.
   *
   * OPT-IN, on the FR-56 `rollingStart` / B72 `paceProfile` precedent: absent =
   * the runner never issues a command and every one of the catalogue's staged
   * actors is byte-identical. It is a RESTING state, not a script — a runner
   * that drives its own indicator (the cut-in's announced shift, the
   * lane-shift pass) overwrites it on its own schedule and owns it from then
   * on, which is correct: the announcement stops being true once the car moves.
   *
   * NO HAZARD OPTION, deliberately. `traffic/types.VehicleIndicator` is
   * `"left" | "right" | "off"` and nothing renders both lamps at once, so
   * offering „аварийни светлини" here would be a field that types-checks and
   * shows a LEFT blinker — the broken-down-car image (чл. 41 ал. 2's other
   * seat) needs a new VehicleIndicator member and a renderer that blinks both
   * sides, which is a real change in the presentation layer, not a spec field.
   */
  indicator?: "left" | "right";
}

export type StagedEventKind =
  | "pedestrianDartOut"
  | "priorityFromRight"
  | "brakingLeadCar"
  | "cyclistRightHook"
  | "roundaboutEntry"
  | "amberDilemma"
  | "oncomingLeftTurn"
  | "narrowMeeting"
  | "emergencyApproach"
  | "policeStop"
  | "trafficController"
  | "cutInLeadCar"
  | "rearTailgater"
  | "telltaleStimulus"
  | "oncomingStream"
  | "trainPass";

interface StagedEventBase {
  /** Unique per lesson, e.g. "l4-dart-out". */
  id: string;
  kind: StagedEventKind;
  /** 45-event library id (docs/simulation/65) for traceability. */
  libraryEventId?: string;
}

/** A pedestrian steps onto a specific crossing as the player approaches at
 * speed — crossing occupancy drives the existing PEDESTRIAN_* grading. */
export interface PedestrianDartOutSpec extends StagedEventBase {
  kind: "pedestrianDartOut";
  /** Crossing id from district-v1.json (occupancy + zone grading key). */
  crossingId: string;
  crossing: { x: number; y: number };
  /** Curb start point + unit dart direction (across the road). */
  start: { x: number; y: number };
  dir: { x: number; y: number };
  speedMps: number;
  /** Total walk length (across + a few metres of walk-out), m. */
  travelM: number;
  /** Roadway span along the dart path (crossing-occupancy window), m. */
  roadFromM: number;
  roadToM: number;
  /** Trigger: player nearer than this to the crossing (± seeded jitter)… */
  triggerDistM: number;
  /** …approaching it, at or above this speed. */
  minTriggerSpeedKmh: number;
  /**
   * OPTIONAL TIME-TO-ARRIVAL RELEASE — the fix for a hazard that CAREFUL
   * DRIVING SUPPRESSED (2026-08-14, sc-zebra-approach / PE-01).
   *
   * `triggerDistM` is metres; the walk is a clock. ZEBRA_PED released at 55 m
   * and needs 12.75 s to clear the 16.25 m carriageway at 1.4 m/s. So a student
   * who obeyed «вдигни крака от газта и бъди готов да спреш» either never
   * released her (the `minTriggerSpeedKmh` floor) or released her early enough
   * that she had finished crossing before he arrived — and the car reached a
   * BARE zebra while the card congratulated him for yielding. Obeying the
   * instruction deleted the hazard the instruction was teaching.
   *
   * With this authored, the walker is released on the first frame the player's
   * time-to-arrival drops to it — `d <= speed × triggerEtaSec` — AND he is
   * still inside `triggerDistM`. The distance becomes an OUTER bound, so
   * nobody is released earlier than the authored metres and every committed
   * recording is untouched; the seconds become what actually fires. She is
   * therefore at the SAME point of her walk when the car arrives, whatever
   * speed it came in at.
   *
   * IT DOES NOT WEAKEN `minTriggerSpeedKmh`: the floor is still ANDed onto the
   * release, so nothing steps out in front of a car parked at spawn, and the
   * reversing geometries that rely on the floor do not author this field.
   *
   * ABSENT = the pure distance gate, byte for byte.
   */
  triggerEtaSec?: number;
  /**
   * Presentation body variant of the walker (founder R3 #25–28, doc 62 P6):
   * "child" renders the small pedestrian rig (~0.72 scale, bigger head — the
   * CHILD_CYCLIST proportion precedent), "elder" the stooped rig CARRYING THE
   * WHITE CANE (PE-14's признак — the cane IS the recognition cue, so only
   * the white-cane drill authors it; the PE-08 slow crosser deliberately does
   * NOT — a cane there would dilute the unique lesson). Visual + data only:
   * flows through StagedPedestrianSpec.variant onto the published
   * TrafficPedestrianState; no query, detector or timing reads it. Absent =
   * the adult rig, byte-identical staging.
   */
  variant?: "child" | "elder";
  /**
   * AMBIENT SCENERY — a figure the student must SEE but who never enters the
   * carriageway.
   *
   * The founder asked for children on the pavement outside the school („no kids
   * are playing on the sidewalks and we should do that it will attract the user
   * to watch closely"). That is atmosphere with a teaching job — the reason a
   * driver slows in a school zone — and it is NOT a dart-out hazard.
   *
   * WHY THIS FLAG EXISTS AT ALL, given the encounter battery deliberately has
   * no escape hatch: the battery's REACHABILITY invariant asserts every staged
   * actor is MET at full pace and at half of it, because the founder's lessons
   * 8/15/17/18 were all conflict actors that had already gone by the time he
   * arrived. That invariant is right for a hazard and meaningless for a child
   * standing on a pavement, who must never be "met" at all.
   *
   * THE EXEMPTION IS EARNED BY A STRICTER ASSERTION, NOT A WEAKER ONE. An
   * ambient walker is excused from REACHABILITY and in exchange the battery
   * proves it can NEVER reach the carriageway, at any speed, on any rung. So
   * this cannot be used to silence a hazard that merely fails its timing: mark
   * a real dart-out ambient and the new assertion fails instead. The only thing
   * it buys is the right description of a child who stays on the pavement.
   */
  ambient?: true;
  /**
   * PE-04 ball warning cue (founder R3 #27 — „ball rolls out, child follows"):
   * when authored, the TRIGGER first flips the runner's `hazardActive` (the
   * lesson's `hazard` ballDartOut visual starts rolling — the WHY the lesson
   * teaches: the ball IS the warning) and releases the walker only this many
   * seconds LATER. The reaction stopwatch arms at the BALL (the stimulus the
   * anticipation lesson grades). Deterministic — pure tSec arithmetic, no
   * RNG. Absent = the walker releases on the trigger frame, byte-identical.
   */
  ballLeadSec?: number;
  /**
   * Stationary prop vehicles dressing the encounter (ADR-006 stage 3b —
   * RX-04's tram halted at the island stop): staged held actors in the
   * narrowMeeting-props mold (doc 72 OV-18's "stage() with a hold pose"
   * pattern) — cruiseSpeedMps 0, NEVER commanded; `profile` renders the rig
   * ("tram" = the articulated two-segment rig). Purely scenery + physics
   * presence; the dart-out grading chain is untouched by their existence.
   */
  props?: Array<{
    pathNodes: string[];
    hold: { nodeIndex: number; offsetM: number };
    /** Keep 0/negative — a positive curb offset tags the state as a cyclist
     *  proxy (A11 vehicleCollisionKind). */
    extraRightOffsetM?: number;
    colorIndex?: number;
    profile?: "car" | "van" | "truck" | "emergency" | "tram";
  }>;
}

/** A scripted car crosses the player's guarded junction from the right,
 * timed to arrive just before the player's projected line-crossing. Grading:
 * the runtime's existing junction adjudication (give-way conflict at the
 * stop line via conflictNear, right-hand rule via conflictFromRight at
 * uncontrolled nodes) fires on the staged car like on any other vehicle. */
export interface PriorityFromRightSpec extends StagedEventBase {
  kind: "priorityFromRight";
  junction: { nodeId: string; x: number; y: number };
  /**
   * Which runtime detector guards the junction (default "stopLine"): the
   * stop-line give-way check needs the orchestrator to emit the yielded
   * commendation itself; the uncontrolled right-hand-rule tracker emits its
   * own on leaving the junction.
   */
  junctionControl?: "stopLine" | "uncontrolled";
  actor: StagedActorPathSpec;
  /** Index of the junction node within actor.pathNodes (timing reference). */
  junctionNodeIndex: number;
  /** Player distance to the junction that starts the arrival sync, m. */
  armDistM: number;
  /** Car passes the node this long before the player's projected crossing, s. */
  leadSec: number;
  /** Approximate player stop-line distance from the junction node, m. */
  lineDistM: number;
  /** Speed after clearing the junction (leave the conflict radius fast), m/s. */
  clearSpeedMps: number;
  /**
   * S2 witness gate (doc 62 founder R3 — staged-car timing vs live pacing):
   * reaching the near-line commit distance alone does NOT release the held car
   * through the box. The release additionally waits until the player is
   * genuinely about to arrive: raw (unfloored) ETA to their own stop line
   * at/under `etaSec`, OR within `nearLineM` of the line, OR stopped at the
   * mouth. This guarantees the conflict is PRESENT when a slow live player
   * reaches the junction, at any pace — while a scripted-pace approach
   * (≳ 10 km/h at the commit gate) commits on the same frame as the legacy
   * rule, keeping recorded choreography identical.
   *
   * ABSENT = the DEFAULT gate `{ etaSec: 8, nearLineM: 6 }` (ledger L7 — it
   * was opt-in and eight of thirteen specs never opted in, so a student
   * obeying «приближи бавно» reached an empty junction). Author it only to
   * TIGHTEN or LOOSEN those numbers; there is no way to ask for an
   * unwitnessed release, because there is no lesson in one.
   *
   * `stoppedNearM` — HOW FAR BACK A STANDSTILL STILL COUNTS AS WITNESSING,
   * m; absent = the runner's `WITNESS_STOPPED_NEAR_M` (14), so every spec
   * that does not author it is byte-identical. Author it when THIS lesson
   * grades a yield from further back than 14 m: the drill must not credit a
   * stop at a pose where its own conflict is then re-pinned and never
   * crosses. Measured case, doc 87 B30 — `sc-jx-giveway-b1` grades the yield
   * over y ∈ [90, 122.275] while its Б1 line is 27.725 m out, so a stop at
   * the graded circle's own centre sits 13.97 m from the line and one 30 cm
   * further back sits 14.27 m: the first sees the car cross, the second is
   * marooned watching an empty boulevard. A 30 cm cliff deciding whether the
   * lesson happens is not a design.
   */
  witnessArm?: { etaSec: number; nearLineM: number; stoppedNearM?: number };
  /**
   * ONE CROSSING PER APPROACH — the ladder rung, authored (FR-B5-RECHOREOGRAPH,
   * runners.ts; sc-jx-equal-left:4274eddb).
   *
   * FR-B5-RETURN (traffic/staged.ts) sends a retired actor back to the start of
   * its own path so a priority road keeps producing cars, and FR-B5-CROSS
   * measured why that matters: without it `sc-jxgb-conflict` crossed ONCE and
   * then stood still for 150 s of a 210 s lesson, teaching a student who waits
   * that waiting is free. Two of this catalogue's drills are built on exactly
   * that — the boulevard is the lesson, and every car it produces is one more
   * gap to judge.
   *
   * The other design is a LADDER: a template that stages a fixed set of
   * conflicts and spaces them so the student meets ONE teach card at a time,
   * then declares the junction clear («чак когато и двете са преминали и пътят
   * е чист» — sc-jx-equal-left instruction 5). An unscripted third car
   * contradicts the instruction the student was given, and the runtime's
   * trackers grade it exactly as if the template had staged it: measured over
   * 3 slow-from points x 7 wait lengths of that briefing, 6 of 21 pacings were
   * billed опасна FAILED_TO_YIELD, in two bands one actor round trip apart.
   * FR-B5-RETURN's own guard 2 already refuses a second run for the one hazard
   * whose ladder it could see (`railPath`, the RX train — „a second train
   * crossing a level crossing the lesson has just declared clear would convict
   * a student who did exactly as told"). This is that sentence, made authorable
   * for a car instead of inferred from riding a rail.
   *
   * TRUE = after this encounter has resolved, a returning actor is held short
   * of the box — stationary, so it is below `CONFLICT_MIN_SPEED_MPS`, makes no
   * priority claim and can convict nobody — until the player has left
   * `armDistM` and can approach the junction afresh, at which point it is a
   * fully choreographed encounter again. It is NOT „the car disappears": the
   * actor still returns rather than parking at the far end of its road, which
   * is the FR-B5-EXIT defect this must not reintroduce.
   *
   * ABSENT/false = FR-B5-CROSS's behaviour, unchanged and byte-identical: the
   * road keeps producing cars for as long as the student is there.
   */
  oneCrossingPerApproach?: boolean;
}

/** A lead car matches the player's speed at a fixed gap, then brake-slams at
 * a staged point (with the lesson's ballDartOut visual as the WHY). The
 * orchestrator measures stimulus→brake-onset reaction time. */
export interface BrakingLeadCarSpec extends StagedEventBase {
  kind: "brakingLeadCar";
  actor: StagedActorPathSpec;
  /** Gap held ahead of the player while matching, m. */
  followGapM: number;
  maxMatchSpeedMps: number;
  /** The staged slam point on the lead car's path (district space). */
  slamAt: { x: number; y: number };
  slamRadiusM: number;
  slamDecelMps2: number;
  /** Player must be at least this fast for the slam (else it defers until the
   *  player closes within proximityFallbackM of the held car). */
  minSlamSpeedKmh: number;
  proximityFallbackM: number;
  /** C1: player-to-lead distance that arms the encounter, m. Absent = legacy
   * spawn-corridor behaviour (arms on the first player movement); set it for
   * MID-ROUTE corridors so the held lead waits for the player instead of
   * driving its corridor alone at session start. */
  armDistM?: number;
  /** Flip the lesson's HazardStimulusSpec visual (ball dart) at the slam. */
  triggersHazard: boolean;
  /** Seconds after resolution before the lead car drives on. */
  resumeAfterSec: number;
  /**
   * How the lead PACES before the slam (ledger T17). Default "matchPlayer" —
   * the historical rubber band `target = playerSpeed + 0.55 × (gapM − gap)`,
   * whose fixed point is `gap = gapM`: the metric distance is frozen, so a
   * TIME-gap fault like FOLLOWING_TOO_CLOSE becomes a pure function of the
   * speedometer and the taught corrective action (ease off, let the gap grow)
   * is physically impossible — the lead slows to close it again.
   *
   * "scheduledCruise" drives a fixed speed along the actor's OWN arc instead,
   * with `playerGuard` as the only remaining coupling: the lead waits at its
   * hold pose until the player closes to `armDistM` (or, absent that, the
   * follow gap + 12 m), then cruises `paceSpeedMps`. Backing off then really
   * does open the gap. Following drills that grade a GAP want this; drills
   * that need the actor pinned alongside the player (blind-spot pace cars)
   * want the band.
   */
  paceMode?: "matchPlayer" | "scheduledCruise";
  /** Scheduled-cruise speed, m/s. Default `actor.cruiseSpeedMps`. Ignored
   *  under "matchPlayer". */
  paceSpeedMps?: number;
  /**
   * B72 / FR-53 — an authored SPEED PROFILE for a `scheduledCruise` lead: the
   * ease-and-resume the founder asked for, keyed to the ROAD instead of to him.
   *
   * WHY IT EXISTS. T17 killed the rubber band, and the measurement says it
   * stayed dead — driven with a deliberate 24→8→34→10→26 km/h program the
   * player's speed had sd 8.2 km/h against the truck's sd 0.2, r = −0.026. But
   * the cure produced the founder's OTHER complaint in a purer form: with only
   * one `paceSpeedMps` the lead is a metronome at a dead-constant 20.2 km/h for
   * the whole 360 m («very boring»), and a metronome is a gap you set once and
   * then stop thinking about. What he asked for is a lead that DOES something —
   * «slows a bit, speeds a bit» — so following it is a task rather than a
   * cruise-control setting. B72's close-out named this field exactly: „give the
   * truck an authored speed profile instead of a single `paceSpeedMps` — a
   * scheduled ease-and-resume (e.g. 5.6 → 3.5 → 5.6 m/s at authored y)".
   *
   * SHAPE. A piecewise-constant schedule, sorted by `atS` ascending: the target
   * is the LAST leg whose `atS` the lead's own arc position has reached; before
   * the first leg the base `paceSpeedMps ?? actor.cruiseSpeedMps` applies. `atS`
   * is arc metres along the actor's OWN resolved path (the same
   * `StagedActorView.s` the runners already read). On the straight fo-* streets
   * the path starts at the district origin and runs +y, so an arc metre IS a
   * district y — which is why the authored profiles read as the "authored y
   * positions" the review asked for. The lead ramps between legs through the
   * staged actor's ordinary accel/decel, so an ease is a real ease and not a
   * teleport of the speedometer.
   *
   * WHY IT IS OPT-IN AND NOT A CHANGED DEFAULT — the FR-56 `rollingStart`
   * precedent verbatim. `brakingLeadCar` is the most borrowed staged kind in
   * the catalogue (ledger T17 counts 16 lead actors across 16 scenarios) and
   * most of them are not following drills at all: pace cars pinned abeam for a
   * blind-spot check, inert queue tails, brake-slam stimuli whose choreography
   * is timed off a constant approach. Re-timing all of them to give two drills
   * a personality is precisely the mistake FR-56 documented, where one
   * unconditional line broke four assertions in three files. ABSENT = the
   * runner never enters this code path and the drive is byte-identical.
   *
   * DETERMINISM. The active leg is a pure function of the actor's own arc
   * position, itself a pure function of (spec, command stream, dt sequence) —
   * no player term, no RNG, no wall clock. Ignored under "matchPlayer": a band
   * and a schedule are two different commands, and authoring both is a template
   * bug the scenario-data battery rejects.
   */
  paceProfile?: ReadonlyArray<{ atS: number; speedMps: number }>;
}

/** A slow "cyclist" (narrow scripted vehicle-agent — honest v1 actor-model
 * limitation, audit C3) rides curb-side toward a junction the player turns
 * right at; turning across it is the classic right hook. Graded via existing
 * vocabulary: prioritySituation (FAILED_TO_YIELD / YIELDED_TO_PRIORITY) and
 * collision(cyclist) on contact. */
export interface CyclistRightHookSpec extends StagedEventBase {
  kind: "cyclistRightHook";
  junction: { nodeId: string; x: number; y: number };
  actor: StagedActorPathSpec;
  junctionNodeIndex: number;
  /** Player distance to the junction that releases the cyclist, m. */
  releaseDistM: number;
  /** Right turn started with the cyclist within this of the player = hook, m. */
  dangerRadiusM: number;
  /** Cyclist within this of the player near the junction = a real conflict
   *  existed (gates the yielded commendation), m. */
  conflictWindowM: number;
}

/** A scripted car circulates the roundabout timed to the player's approach —
 * the runtime's existing circulatingConflict query grades the entry. */
export interface RoundaboutEntrySpec extends StagedEventBase {
  kind: "roundaboutEntry";
  center: { x: number; y: number };
  ringRadiusM: number;
  /** Closed ring loop (loop: true). */
  actor: StagedActorPathSpec;
  /** Player's entry mouth (district space) + its ring node index. */
  entry: { x: number; y: number };
  entryNodeIndex: number;
  /** Desired car arc upstream of the entry when the player arrives, m. */
  conflictLeadM: number;
  /** Player distance to the ring center that starts the sync, m. */
  armDistM: number;
  minSyncSpeedMps: number;
  maxSyncSpeedMps: number;
}

/**
 * B1a — the first phase-driven staged event (doc 72 JU-06, capability N2).
 * No actor: the director pins the junction's signal-cluster phase offset when
 * the player ARMS the approach, so the green→yellow flip lands exactly
 * `flipEtaSec` of travel time before the player's stop line — the dilemma
 * window, guaranteed per seed. Grading stays in the EXISTING pipeline: the
 * runtime's stopLineCrossed reports yellow/redYellow/red at crossing (plus
 * the amber `stoppable` adjudication) and the rule engine grades it; the
 * runner only records the outcome.
 */
export interface AmberDilemmaSpec extends StagedEventBase {
  kind: "amberDilemma";
  /** Signal node id (member of the junction's controller cluster). */
  signalNodeId: string;
  /** Junction node position, district space. */
  junction: { x: number; y: number };
  /** Player distance to the junction that pins the phase, m. */
  armDistM: number;
  /** Player must be at least this fast at arm, km/h. */
  minTriggerSpeedKmh: number;
  /** Stop-line setback from the junction node on the player's approach, m. */
  lineDistM: number;
  /**
   * Player's time-to-line at the green→yellow flip, s (± seeded jitter).
   * The dilemma dial: ≥ ~4 s = a comfortable stop exists (stopping is the
   * graded correct answer — carrying on lands on red); ≤ ~2 s = committed
   * (proceeding through the yellow is correct).
   */
  flipEtaSec: number;
}

/**
 * N1 (doc 72 JU-10 — the #1 ranked capability gap): an oncoming car drives
 * STRAIGHT through the junction the player turns LEFT at, timed so it is
 * `gapSec` short of the junction node when the player's projected arrival at
 * the node lands — the left-turn-across-path dilemma, guaranteed per seed.
 * Grading is the runtime's own N1 tracker (prioritySituation
 * "left-turn-oncoming" → FAILED_TO_YIELD / YIELDED_TO_PRIORITY); the runner
 * records the outcome + the ACCEPTED GAP measurement (acceptedGapSec).
 *
 * `gapSec` is the tier dial (exam-bank style):
 *  - ≤ ~1.6 s "tight"  — turning grades the 10-point опасна; waiting is the
 *    only correct resolution;
 *  - ~2.6–3.0 s "advisory" — legal but unsafe: no violation, the outcome's
 *    acceptedGapSec < 3 s lets the scenario rubric coach it;
 *  - ≥ ~5 s "safe" — a clean gap; turning immediately is correct.
 */
export interface OncomingLeftTurnSpec extends StagedEventBase {
  kind: "oncomingLeftTurn";
  junction: { nodeId: string; x: number; y: number };
  /** Opposing-approach path straight through the junction. */
  actor: StagedActorPathSpec;
  /** Index of the junction node within actor.pathNodes (timing reference). */
  junctionNodeIndex: number;
  /** Player distance to the junction that starts the arrival sync, m. */
  armDistM: number;
  /** Oncoming's time-to-node at the player's projected node arrival, s
   * (± seeded jitter) — the gap-class tier dial, see above. The sync holds
   * the actor at (playerEta + gapSec) × cruise metres from the node, so it
   * arrives AT CRUISE SPEED with the authored gap. */
  gapSec: number;
  /** Speed after clearing the junction (leave the conflict radius fast), m/s. */
  clearSpeedMps: number;
}

/**
 * N1 (doc 72 OV-14 — „разминаване в тясна улица"): a parked row narrows the
 * road to ONE usable lane; an oncoming actor is timed to transit the section
 * as the player arrives. ЗДвП narrow-passage priority: the side WITH the
 * obstruction yields. The runner adjudicates (no runtime detector can see
 * authored obstruction sides) and emits ONLY the reserved vocabulary:
 * prioritySituation "narrow-meeting" → FAILED_TO_YIELD (barging into the
 * oncoming's priority) / YIELDED_TO_PRIORITY (waiting at the widening).
 */
export interface NarrowMeetingSpec extends StagedEventBase {
  kind: "narrowMeeting";
  /** Narrow-section span on the ROAD CENTERLINE, district space:
   * `sectionStart` = the player-side entrance, `sectionEnd` = the far end. */
  sectionStart: { x: number; y: number };
  sectionEnd: { x: number; y: number };
  /** Which side carries the obstruction — and therefore must yield. */
  obstructionSide: "player" | "oncoming";
  /** Oncoming actor scripted through the section toward the player. */
  actor: StagedActorPathSpec;
  /** The actor-path arc of ITS section entrance (the sectionEnd side):
   * nodeS[nodeIndex] + offsetM — the runner's timing reference. */
  actorEntry: { nodeIndex: number; offsetM: number };
  /** Player distance to sectionStart that begins the arrival sync, m. */
  armDistM: number;
  /** Actor speed while transiting the section, m/s (default: cruise). */
  transitSpeedMps?: number;
  /** Stationary prop vehicles forming the parked row (staged held actors —
   * doc 72 OV-18's "stage() with a hold pose" pattern; never commanded). */
  props?: Array<{
    pathNodes: string[];
    hold: { nodeIndex: number; offsetM: number };
    extraRightOffsetM?: number;
    colorIndex?: number;
  }>;
}

/**
 * ADR-006 stage 1b (doc 72 §15 N9 — VU-09 „Линейка отзад", ЗДвП чл. 91): an
 * EMERGENCY actor (profile "emergency" — white rig + blue light bar) closes
 * FROM BEHIND at higher speed, pathed on the player's left edge (author the
 * actor path with a negative extraRightOffsetM so it passes to the LEFT).
 * The graded duty is to MAKE WAY — ease right and/or slow so it can pass,
 * never block it. No runtime detector looks behind the player, so the
 * ADJUDICATION lives in the runner (cyclist-right-hook precedent), emitting
 * ONLY the reserved prioritySituation vocabulary ("emergency" → the reducer
 * grades EMERGENCY_NOT_YIELDED / YIELDED_TO_PRIORITY).
 *
 * Choreography: the actor holds dormant behind the spawn; once the player is
 * `releaseGapM` ahead along its path it starts its run at cruise. The DUTY
 * arms when the actor is behind within `armBehindM` and closing; the player
 * then has a GENEROUS `responseWindowSec` to show a yield response — a
 * rightward lane-offset shift ≥ `yieldShiftM` (covers the full lane change
 * right too), OR slowing to ≤ `yieldSlowKmh` while keeping right, OR already
 * standing (≤ ~3 km/h, the stopped-at-the-curb innocent). Only a window that
 * EXPIRES with the player still centered/blocking AT SPEED convicts; once the
 * actor has passed (`passAheadM` ahead) the runner stands down — one
 * adjudication per approach, and a fast pass convicts nobody.
 */
export interface EmergencyApproachSpec extends StagedEventBase {
  kind: "emergencyApproach";
  /** The emergency actor: path from behind the spawn along the player's road,
   *  offset LEFT (negative extraRightOffsetM), profile "emergency", cruise
   *  faster than the player's plausible speed (special-regime exemption). */
  actor: StagedActorPathSpec;
  /** Player this far ahead of the held actor (along its path direction)
   *  releases the run, m (± seeded jitter). */
  releaseGapM: number;
  /** The yield DUTY arms when the actor is behind within this and closing, m. */
  armBehindM: number;
  /** Generous response window from duty-arm to adjudication, s (± jitter). */
  responseWindowSec: number;
  /** Rightward lateral shift vs the duty-arm baseline that counts as making
   *  way, m (a full lane change right trivially exceeds it). */
  yieldShiftM: number;
  /** At/below this speed counts as the slowing response while keeping right,
   *  km/h (author ~10 under the road's limit). */
  yieldSlowKmh: number;
  /** Actor this far ahead of the player = passed → stand down, m. */
  passAheadM: number;
  /** Speed after passing (clears ahead and away), m/s. Default: cruise. */
  clearSpeedMps?: number;
}

/**
 * ADR-006 stage 1c (doc 72 §3 VP-11 — „Спиране по полицейски сигнал",
 * Наредба-38 / ЗДвП чл. 170): a uniformed OFFICER FIGURE stands at the curb
 * signalling THE PLAYER to stop (a staged pedestrian actor that never walks —
 * pose "stopSignal" renders the raised arm + hi-vis vest, ADR-001 fictional).
 *
 * SCENERY + MEASUREMENT ONLY — deliberately NOT an adjudicator: the runner
 * stages the figure and records an outcome ("yielded" when the player rests
 * at the curb-side halt point, "passedWithoutStopping" when the officer falls
 * `passBeyondM` behind without a compliant stop), but emits ZERO SimTick
 * events, so NO violation can ever grade from it (the A12 bias — an
 * unmodelled duty must not convict). The graded contract lives entirely in
 * the scenario's EXISTING objectives (a low-speed curb-side reachZone = the
 * pull-over-and-stop completion, the sc-pk-smooth-stop stop-mark pattern).
 */
export interface PoliceStopSpec extends StagedEventBase {
  kind: "policeStop";
  /** Officer's standing point (sidewalk, clear of the roadway), district space. */
  officer: { x: number; y: number };
  /** Unit facing direction (toward the roadway) — the figure's pose heading. */
  facing: { x: number; y: number };
  /** Curb-side halt point the compliant driver rests at (mirrors the
   *  scenario's graded stop-zone objective — single truth by value). */
  stop: { x: number; y: number };
  /** Within this of `stop`… */
  stopRadiusM: number;
  /** …at/below this speed = complied (outcome "yielded"), km/h. */
  stopSpeedKmh: number;
  /** Officer this far behind the player (player-frame arc) without a
   *  compliant stop = the signal was ignored (outcome only, no grading), m. */
  passBeyondM: number;
}

/**
 * N11 cockpit-stimuli (doc 72 §3 VP-06 „Контролна лампа по време на движение",
 * ЗДвП чл. 20 / чл. 139; library ev-warning-light — doc 65's only drivable
 * vehicle-knowledge action): a warning telltale lights on the dashboard
 * mid-drive and its COLOUR is the protocol — RED = pull over safely now (not a
 * panic-slam in-lane, and not another kilometre), AMBER = carry on calmly to a
 * garage.
 *
 * STIMULUS + MEASUREMENT ONLY (the policeStop discipline): the runner stages
 * NO actor — it flips the director's cockpit-lamp channel (`telltaleLit`, the
 * hazardActive-style scene seam: the cluster lights the lamp, the L1/L2 HUD
 * shows the cue) at the authored trigger and records the outcome
 * ("yielded" = compliant curb-side rest, with `reactionTimeSec` as the
 * stimulus→first-brake respondedSec; "passedWithoutStopping" = ignored) — but
 * emits ZERO SimTick events, so no violation can ever grade from this runner
 * (A12: an unmodelled duty must not convict). The graded contract is the
 * scenario's curb-side low-speed reachZone objective (the sc-vp-police-stop
 * stop-mark pattern); a post-stimulus mid-lane slam grades through the
 * SHIPPED HARSH_BRAKING_NO_CAUSE — a dashboard lamp is not a forward cause
 * in the harsh-brake ledger (it reads leadGap/signal/junction/crossing
 * channels only), and that is the honest read: the lamp asks for a PLANNED
 * pull-over, never an emergency stop.
 */
interface TelltaleStimulusBase extends StagedEventBase {
  kind: "telltaleStimulus";
  /** The lamp lights when the player first comes within `triggerDistM` of
   *  this point while moving (or has already passed it — the backstop, so a
   *  crawling player can never reach the stop zone unlit). */
  trigger: { x: number; y: number };
  triggerDistM: number;
  /** Trigger point this far behind the player (player-frame arc) = the cue is
   *  spent. On a RED lamp with no compliant stop that is the IGNORE (outcome
   *  "passedWithoutStopping"); on an AMBER one it is the taught carry-on
   *  (outcome "clear"). Author a red one comfortably BEYOND its stop zone so a
   *  compliant pull-over always resolves first. */
  ignoreBeyondM: number;
}

/**
 * THE LAMP CHANNEL, AND IT IS READ — two bits, two lamps, two colours.
 * `TelltaleStimulusRunner` raises the channel the spec NAMES:
 * `telltaleLit` for "temperature", `telltaleCautionLit` for "checkEngine".
 * The director ORs each across its runners (`orchestrator/director.ts`),
 * `LessonScene` copies both into render-free refs, `VitokCockpit` assigns
 * them to `tempWarnOn` / `cautionWarnOn`, and `cockpit/clusterReadout.ts`
 * turns them into `out.temp` "warn" (red) and `out.engine` "caution" (amber).
 *
 * THE COLOUR IS THE DUTY (doc-65 ev-warning-light; ЗДвП чл. 20 / чл. 139):
 * RED = спри безопасно СЕГА, so a red cue authors a curb-side halt contract
 * and the runner measures the rest against it. AMBER = внимателно, до сервиз,
 * без аварийно спиране — it asks for no manoeuvre, so it authors no halt
 * contract at all. That is why these are a UNION and not one interface with
 * optional fields: an amber cue cannot author a stop it does not demand, and
 * a red one cannot omit the halt point its whole grading rests on.
 *
 * A lesson that teaches the TRIAGE stages BOTH on one route — the amber
 * earlier, the red later (SC_VP_TELLTALE_RED). Until 2026-09-02 it could not:
 * the channel was a single boolean, so the one discriminating cue the lesson
 * is built on never appeared on the glass (sc-vp-telltale-red:775b58cc).
 */
export interface TelltaleStopSpec extends TelltaleStimulusBase {
  lamp: "temperature";
  /** Curb-side halt point the compliant driver rests at (mirrors the
   *  scenario's graded stop-zone objective — single truth by value). */
  stop: { x: number; y: number };
  /** Within this of `stop`… */
  stopRadiusM: number;
  /** …at/below this speed = responded (outcome "yielded"), km/h. */
  stopSpeedKmh: number;
}

/** The AMBER half of the same stimulus — see the docblock above. */
export interface TelltaleCautionSpec extends TelltaleStimulusBase {
  lamp: "checkEngine";
}

export type TelltaleStimulusSpec = TelltaleStopSpec | TelltaleCautionSpec;

/**
 * ADR-006 stage 1d (doc 72 §3 JU-18 — „Регулировчик на кръстовището", ЗДвП
 * чл. 7 / Наредба-38 termination item): a traffic CONTROLLER stands at a
 * SIGNALIZED junction whose lamps keep cycling, and the controller's hand
 * signals — not the lamps — govern every approach. THE HIERARCHY LESSON:
 * green lamps do not acquit a crossing the controller halted.
 *
 * The runner arms the whole mechanic at session start (the signalOffsets /
 * signalModes discipline, deterministic authored constants):
 *  - dials the cluster to mode "controlled" with the authored permission
 *    timetable (`haltedGroup` + optional single `flipAtSec` flip) through the
 *    SignalDirectorPort → runtime setSignalClusterController;
 *  - optionally pins the cluster's lamp offset (`signalOffsetSec`) so the
 *    lamps show the authored misleading phase (green for the halted player);
 *  - stages the officer FIGURE (a staged pedestrian that never walks — pose
 *    "directTraffic": one arm extended horizontally + hi-vis, ADR-001
 *    fictional). Purely visual.
 *
 * GRADING IS 100% THE EXISTING PIPELINE: the runtime's stopLineCrossed
 * carries the controller permission and the reducer grades it (halt →
 * CONTROLLER_SIGNAL_VIOLATED, proceed → innocent even on red lamps). The
 * runner emits ZERO SimTick events — it only watches those same events to
 * record the outcome (the amberDilemma precedent).
 */
export interface TrafficControllerSpec extends StagedEventBase {
  kind: "trafficController";
  /** Signal node id (member of the junction's controller cluster). */
  signalNodeId: string;
  /** Junction node position, district space (line-event ownership window). */
  junction: { x: number; y: number };
  /** Officer FIGURE standing point (the junction-center post), district space. */
  officer: { x: number; y: number };
  /** Unit facing direction of the figure (toward the halted approach). */
  facing: { x: number; y: number };
  /** Axis-group the controller HALTS from session start ("ns" | "ew"). */
  haltedGroup: "ns" | "ew";
  /** Controller time (session s) at which the halt flips to the other axis;
   *  absent = static halt for the whole session. */
  flipAtSec?: number;
  /** Cluster lamp-phase offset pinned at stage time (the misleading-but-
   *  visible lamp staging — e.g. green for the halted player); absent = the
   *  map's natural FNV-1a offset. */
  signalOffsetSec?: number;
  /** Approximate player stop-line setback from the junction node, m (scopes
   *  which stopLineCrossed events belong to this junction). */
  lineDistM: number;
}

/**
 * Doc 72 FO-03 „Вклиняване" — the cut-in actor recipe: a car paces the player
 * from the ADJACENT lane (author the actor path with extraRightOffsetM ≈ −one
 * lane width; matchPlayer keeps it `paceAheadM` ahead so the encounter is
 * slaved to the player's own progress), then at the staged cut point executes
 * the traffic port's `laneShift` glide into the player's lane while locking a
 * plain cruise — the 2-second cushion is STOLEN through no fault of the
 * player's. GRADING IS FULLY SHIPPED (doc 72): the rule engine's
 * FOLLOWING_TOO_CLOSE with its followRecoveryRateMps guard — the innocent
 * stolen-gap phase never bills while the driver is re-opening the gap;
 * HOLDING the stolen gap at speed bills exactly once. The runner emits ONLY
 * a collision on physical contact (rear-ending the cutter — the
 * brakingLeadCar precedent); its outcome is the additive measurement channel.
 */
export interface CutInLeadCarSpec extends StagedEventBase {
  kind: "cutInLeadCar";
  /** Adjacent-lane path (extraRightOffsetM ≈ −one lane width = the lane to
   *  the player's LEFT; keep it ≤ 0 — a positive curb offset tags the actor
   *  as a cyclist proxy, A11). */
  actor: StagedActorPathSpec;
  /** Center-to-center arc gap held AHEAD of the player while pacing in the
   *  adjacent lane, m (± seeded jitter). */
  paceAheadM: number;
  maxMatchSpeedMps: number;
  /** The staged cut point on the ACTOR's path (district space). */
  cutAt: { x: number; y: number };
  /** Actor within this of cutAt (with the player at speed) fires the cut, m. */
  cutRadiusM: number;
  /** Player must be at least this fast for the cut to trigger, km/h. */
  minCutSpeedKmh: number;
  /** Lateral laneShift executed at the cut, m rightward (≈ +one lane width —
   *  into the player's lane, landing ~paceAheadM ahead of their bumper). */
  cutShiftM: number;
  /** laneShift glide duration, s. */
  cutRampSec: number;
  /** Cruise speed locked at the cut, m/s — a PLAIN cruise (not matchPlayer),
   *  so the player's lift genuinely re-opens the gap (the graded recovery). */
  cutSpeedMps: number;
  /** Actor this far ahead of the player (player frame) = encounter over, m. */
  clearAheadM: number;
  /**
   * How the actor PACES before the cut (ledger T17/L11). Default
   * "matchPlayer" — the rubber band, correct for a true cut-in where the
   * cutter must stay abeam until it dives in.
   *
   * "scheduledCruise" makes the actor a plain slow vehicle driving its own
   * fixed profile: it holds until the player closes to `paceAheadM`, then
   * cruises `paceSpeedMps` (default `actor.cruiseSpeedMps`) and can be
   * genuinely OVERTAKEN in world space. This is what an "overtake the slow
   * truck" lesson needs: under the band the rig paced the player forever and
   * the pass was never completed in world space, yet both success gates
   * ticked — the lesson scored a pass for an overtake that never happened.
   */
  paceMode?: "matchPlayer" | "scheduledCruise";
  /** Scheduled-cruise speed, m/s. Default `actor.cruiseSpeedMps`. Ignored
   *  under "matchPlayer". */
  paceSpeedMps?: number;
}

/**
 * Doc 72 FO-07 „Лепка отзад" — the rear-tailgater actor: matchPlayer with a
 * NEGATIVE gap paces the actor 3–6 m of bumper behind the player in their OWN
 * lane (the emergencyApproach rear-sync precedent, without the offset path).
 * PRESSURE SCENERY under the learn-only policy (doc 72): the runner emits
 * ZERO SimTick events — no violation can ever grade from it (the policeStop
 * discipline). The taught response (ease off, grow the FRONT gap, let them
 * pass) and the taught mistake (brake-check) grade through EXISTING channels:
 * the front leadGap telemetry and HARSH_BRAKING_NO_CAUSE (a rear car is not a
 * forward cause — the cause ledger only reads the forward gap channel).
 * After `pressureSec` of glued pressure the actor laneShift-passes on the
 * left and drives off — the situation resolves like the real one does.
 *
 * playerGuard is intentionally OFF for this actor (the guard's stop-6-m-short
 * corridor would forbid the sub-6 m лепка pose); safety is the matchPlayer
 * proportional controller itself (it backs off as the gap error flips) plus
 * an authored decel cap that out-brakes any player slam.
 */
export interface RearTailgaterSpec extends StagedEventBase {
  kind: "rearTailgater";
  /** The player's own lane (extraRightOffsetM 0), path from behind the spawn. */
  actor: StagedActorPathSpec;
  /** Player this far ahead of the held actor (along its path) releases the
   *  run, m (± seeded jitter). */
  releaseGapM: number;
  /** Center-to-center arc gap held BEHIND the player, m (positive; ± jitter).
   *  ~9 m of centers ≈ 5 m of bumpers — the лепка. */
  followBehindM: number;
  maxMatchSpeedMps: number;
  /** Glued pressure duration from the latch to the pass command, s (± jitter). */
  pressureSec: number;
  /** laneShift used for the pass, m (negative = the lane to the LEFT). */
  passShiftM: number;
  /** Cruise speed locked for the pass, m/s. */
  passSpeedMps: number;
  /** Actor this far ahead of the player = passed → resolve, m. */
  passAheadM: number;
  /** Outcome measurement only: easing ≥ this below the latch speed marks the
   *  taught response ("yielded"), km/h. Nothing grades off it (learn-only). */
  easeKmh: number;
  /**
   * FR-56 — release this actor AT THE PLAYER'S OWN SPEED instead of letting it
   * accelerate out of a dormant standstill.
   *
   * The founder's лепка complaint: *"the car behind that is sticking to the
   * user car is sticking very late, it must be sticking much earlier."* He is
   * right, and measured on ln-v1 at constant player speed the glued pose used
   * to arrive at 7.4 s (30 km/h) / 9.1 s (40) / 13.7 s (50) — a car that only
   * starts pressing you a quarter-minute in is not the lesson.
   *
   * WHY THIS IS OPT-IN AND NOT THE DEFAULT, which is the whole point of this
   * flag: `rearTailgater` is borrowed by TWELVE templates as a generic "vehicle
   * that comes past you", and only a few of them are about a tailgater at all.
   * Shipping the rolling start unconditionally re-timed every one of them and
   * broke three whose choreography was authored against the launch-from-rest
   * profile — sc-ln-decisive-change and sc-vu-blindspot-moto lost their
   * blind-spot contact entirely (the car had already gone by), and
   * sc-ov-being-overtaken stopped trapping the overtaker. Bisected: commenting
   * out the one line turned all three files green; restoring it reproduced
   * exactly those four assertions.
   *
   * So the behaviour the founder asked for belongs to the drills that teach
   * being tailgated, and the other nine keep the timing their traces were
   * recorded against. Absent = byte-identical to before FR-56.
   */
  rollingStart?: true;
}

/**
 * OVERTAKE-CORRIDOR oncoming stream (doc 72 OV-05/OV-08 — the N1 oncoming
 * machinery's mid-block form): `count` staged vehicles on the ONCOMING bank
 * (author the path node order southbound, the narrowMeeting-actor recipe),
 * held at authored arc gaps and released TOGETHER at fixed cruise when the
 * player first moves. PRESSURE SCENERY under the learn-only policy: the
 * runner emits ZERO SimTick events except a collision on physical contact
 * (the oncomingLeftTurn contact check) — ALL gap adjudication lives in the
 * runtime's overtake-corridor tracker, which reads these cars through the
 * SAME TrafficSystem.oncomingNear query ambient traffic rides. Determinism:
 * release is keyed to the player's own first movement (every recorded script
 * moves off at t ≈ 0, so the stream clock is the session clock; a live
 * student's move-off starts it the same way), car positions are then pure
 * functions of time. playerGuard stays ON — the staged oncoming
 * emergency-brakes rather than ram a player who gambles wrong; the runtime's
 * gap-memory latch keeps the conviction honest against the guard's rescue.
 */
export interface OncomingStreamSpec extends StagedEventBase {
  kind: "oncomingStream";
  /** Oncoming-bank path (southbound node order) — the template each car of
   *  the stream is staged from; `hold` positions car 0. */
  actor: StagedActorPathSpec;
  /** Cars in the stream (1..6 — one spec, `${id}-<i>` staged ids). */
  count: number;
  /** Extra hold arc of car i vs car 0, m (length count-1; authored spacing —
   *  the tight window / safe window choreography lives HERE, not in code). */
  gapsM: number[];
  /** Player speed that releases the whole stream at cruise, km/h. */
  releaseKmh: number;
}

/**
 * RX-02 / RX-01 (doc 72 §12 — „жп прелез"): a real TRAIN crosses the road at a
 * railway level crossing, timed to the player's approach so „stop and look" is
 * a genuine hazard, not a ritual against empty rails. The train is a
 * path-locked staged actor (profile "train") riding an authored PERPENDICULAR
 * rail polyline (StagedVehicleSpec.railPath, mirrored in the map's
 * meta.scenario.railCrossing.railPath) over the rendered rail deck.
 *
 * PURE CHOREOGRAPHY — the runner emits ZERO SimTick events (the policeStop /
 * oncomingStream discipline), so grading is BYTE-IDENTICAL: the existing
 * world-data rail-crossing detectors alone convict a driver who fails to stop.
 * The train never brakes for the player (playerGuard OFF — it is the hazard);
 * a driver who blocks the tracks meets it through the ordinary physics shell,
 * ungraded here. Determinism: release is keyed to the player's own approach
 * distance, positions then a pure function of the dt sequence.
 */
export interface TrainPassSpec extends StagedEventBase {
  kind: "trainPass";
  /** The authored rail polyline (district space) — crosses the carriageway at
   *  the railCrossing band centre. Mirrors the map's
   *  meta.scenario.railCrossing.railPath (pinned by the template). */
  railPath: ReadonlyArray<{ x: number; y: number }>;
  /** Dormant hold: arc offset from the path start (m) where the train waits
   *  off-frame before release (its centre sits partway down the rail). */
  holdOffsetM: number;
  /** Train cruise speed across the crossing, m/s. */
  cruiseSpeedMps: number;
  /** Acceleration toward cruise on release, m/s² (default the staged 2.6). */
  accelMps2?: number;
  /** Player distance to the crossing point that releases the train, m. */
  triggerPlayerDistM: number;
  /** The crossing point on the player's lane (district space) — the approach
   *  beat the release is timed to. */
  crossing: { x: number; y: number };
  colorIndex?: number;
}

export type StagedEventSpec =
  | PedestrianDartOutSpec
  | PriorityFromRightSpec
  | BrakingLeadCarSpec
  | CyclistRightHookSpec
  | RoundaboutEntrySpec
  | AmberDilemmaSpec
  | OncomingLeftTurnSpec
  | NarrowMeetingSpec
  | EmergencyApproachSpec
  | PoliceStopSpec
  | TrafficControllerSpec
  | CutInLeadCarSpec
  | RearTailgaterSpec
  | TelltaleStimulusSpec
  | OncomingStreamSpec
  | TrainPassSpec;

/**
 * Resolution record of one staged encounter (A8). The GRADING already
 * happened through the rule engine (the orchestrator emits only existing
 * SimTick vocabulary); this record is the additive measurement channel —
 * A10 locks lesson objectives to it (e.g. L5 reaction time).
 */
export interface StagedEventOutcome {
  eventId: string;
  kind: StagedEventKind;
  /** True = the student resolved the encounter correctly. */
  success: boolean;
  detail:
    | "yielded" // conflict existed, player gave way
    | "clear" // encounter resolved without a live conflict
    | "violation" // graded FAILED_TO_YIELD / PEDESTRIAN_* path
    | "collision" // physical contact with the staged actor
    | "stoppedInTime" // brakingLeadCar: full stop with gap left
    | "hitLeadCar" // brakingLeadCar: rear-ended the lead
    | "passedWithoutStopping" // brakingLeadCar: swerved past the stimulus
    /**
     * The encounter never happened — the player drove past the site without
     * the actor ever being released (ledger L8). Always `success: false`: a
     * pedestrian drill in which no pedestrian stepped onto the carriageway is
     * not a pass, and the debrief must say «тази ситуация не се случи» rather
     * than award the lesson. Consumers that switch on `detail` should treat it
     * as "not measured", never as a clean run.
     */
    | "notEncountered";
  /** Session time of resolution, s. */
  tSec: number;
  /** Stimulus onset → first brake application, s (dart-out + lead car). */
  reactionTimeSec?: number;
  /** Remaining bumper gap at full stop, m (brakingLeadCar). */
  stopGapM?: number;
  /** Player speed at the moment the stimulus fired, km/h. */
  approachSpeedKmh?: number;
  /**
   * N1 gap-acceptance measurement (oncomingLeftTurn): seconds until the
   * oncoming vehicle would reach the junction, measured at the player's turn
   * commit. Rubric thresholds (doc 72 JU-10 evidence): < 3 s = unsafe-but-
   * legal advisory (NOT a violation — the 10-point conviction band lives in
   * the runtime at ≤ 2 s), ≥ 4 s = the taught norm. Absent = no oncoming was
   * inbound at commit (waited it out / clear road).
   */
  acceptedGapSec?: number;
}

// ---------------------------------------------------------------------------
// A11 hittable traffic — near-miss session stat (doc 68 A11; audit C1).
//
// A near-miss is the player passing a MOVING NPC with almost no lateral
// clearance at a real relative speed — nothing touched, so nothing is graded
// (deliberately NOT a ViolationCode). It is an ADDITIVE measurement channel
// like StagedEventOutcome: A15's feedback map consumes it to show "you got
// away with these". Detection lives in traffic/proximity.ts (pure); the
// NpcColliders physics layer runs it and reports through LessonScene.
// ---------------------------------------------------------------------------

/** One resolved near-miss encounter (reported when the bodies separate). */
export interface NearMissEvent {
  /** Session time at resolution, s. */
  tSec: number;
  /** What was nearly hit (staged cyclist proxies report "cyclist"). */
  kind: "vehicle" | "pedestrian" | "cyclist";
  /** Published traffic state id (staged actors >= 1000). */
  npcId: number;
  /** Tightest body-envelope clearance during the encounter, m (0 = brushed). */
  clearanceM: number;
  /** Peak relative speed during the encounter, m/s. */
  relSpeedMps: number;
}

/** Running session aggregate — `worst` is the tightest-clearance encounter. */
export interface NearMissStats {
  count: number;
  worst: NearMissEvent | null;
}

/** Events the HUD listens to (toasts, banners). Emitted by lessons/runtime. */
export type HudEvent =
  /** A graded mistake. Carries the catalog's authored WHY (explanationBg) +
   * law citation — the toast must teach at the moment of the error (QW7). */
  | { kind: "violation"; titleBg: string; explanationBg: string; points: number; severity: "opasna" | "osnovna" | "vtorostepenna"; lawRef?: string }
  | { kind: "commendation"; titleBg: string }
  /** A first, teachable encounter — coached, not scored (teach-first-then-grade). */
  | { kind: "lesson"; titleBg: string; explanationBg: string; lawRef?: string }
  | { kind: "objectiveComplete"; titleBg: string }
  | { kind: "quiz"; questionId: string };
