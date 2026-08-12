/**
 * Scenario templates — the PEDESTRIAN family, waves 1+4+7+9 (doc 72 §6 „Family
 * PE"), DATA ONLY in the templates.ts mold (coordinates denormalized from the
 * committed district files so nothing loads world JSON at runtime; the
 * batteries assert every pinned value against the generated maps):
 *
 *  - sc-pe-school-patrol  „Училищна пътека със стоп-палка"  (PE-07 + PE-02,
 *    pe-school-v1 — the 50 → 30 school zone with a zebra deep inside it)
 *  - sc-pe-night-unlit    „Неосветена пътека нощем"        (PE-09 + PE-02,
 *    pe-dart-v1 — the live daytime dart's district, driven at NIGHT)
 *  - sc-pe-zone-living    „Жилищна зона — гостите са пешеходците" (PE-15 +
 *    PE-02, pe-zone-v1 — the 50 → 20 Д15 zone whose crossing is UNMARKED,
 *    because чл. 61–62 shares the whole carriageway)
 *  - sc-pe-parked-row-scan „Покрай редицата паркирани коли" (PE-04, wave 9 —
 *    REUSES pe-child-v1: the SUSTAINED row-scan discipline, distinct from the
 *    live single-ball sc-crossing-child-ball; see its own section header)
 *
 * PE-07 („Училищна зона") was 🟡 PARTIAL in doc 72 for exactly one reason:
 * „SPEEDING_* grades automatically once maxSpeedKmh reflects the zone; NEW:
 * speed-zone map layer". tools/maps/gen_pe_school.mjs IS that layer for this
 * street — the zone segment posts its own `maxspeed` 30, so the shipped
 * speeding detectors grade the school zone with no engine change at all.
 *
 * THE TWO-ACTOR SPLIT (the honest design — read before editing):
 *  - the PATROL WARDEN is a `policeStop` staged spec: the shipped stopSignal
 *    pose (raised arm + hi-vis vest, ADR-001 fictional) standing at the curb.
 *    That runner is SCENERY + MEASUREMENT ONLY by contract — it emits ZERO
 *    SimTick events, so the paddle can never itself convict (the A12 bias: an
 *    unmodelled duty must not grade). Its outcome channel records „yielded"
 *    when the driver rests at the halt point, „passedWithoutStopping" when the
 *    raised paddle is driven past — the debrief's proof, not the grade.
 *  - the CHILD GROUP is a `pedestrianDartOut` at pes-x-1: the LAW's duty
 *    (чл. 119 — пропусни стъпилите на пътеката) and the whole graded contract.
 *    Driving past the raised paddle therefore grades PEDESTRIAN_NOT_YIELDED
 *    honestly: the people on the zebra are the reason the paddle is up.
 * So „подминаване на вдигната стоп-палка" convicts through the pedestrians it
 * endangers, never through a paddle detector that does not exist.
 *
 * HONEST GAP (see gen_pe_school.mjs): the А19 „Деца" plate has no SignKind and
 * no GLB in the shipped kit, so the zone's visual anchor is the school block
 * + the automatic В26 entry post. Render-only — grading reads `maxspeed` and
 * the crossing, never a sign placement.
 */

import type { PedestrianDartOutSpec, PoliceStopSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the district files by value — the L7
// pattern; the matching batteries assert the copies match the maps). Every PE
// micro-map is the same 1+1 street on x = 0 with the same curb stand-back, so
// LANE_2 / CURB_X / the dart's occupancy span are ONE convention across
// pe-school-v1, pe-dart-v1 and pe-zone-v1 — pe-school-districts.test.ts,
// pe-districts.test.ts and pe-zone-districts.test.ts each pin their own copy.
// ---------------------------------------------------------------------------

/** Right-lane center of the 1-lane-per-direction street. */
const LANE_2 = 4.06;
/** The 50 → 30 school-zone entry (pes-n-mid). */
const ZONE_ENTRY_Y = 140;
/** The zebra pes-x-1, 110 m inside the zone. */
const CROSSING_Y = 250;
/** West curb: half-carriageway 8.125 + 0.4 curb + 1.2 stand-back. */
const CURB_X = -9.72;
/** Road-occupancy span along the dart path (west edge → east edge across the
 *  16.25 m carriageway): 9.72 − 8.125 ≈ 1.6 m in, 9.72 + 8.125 ≈ 17.85 m out. */
const ROAD_FROM_M = 1.6;
const ROAD_TO_M = 17.85;
/** Curb → across the carriageway → a few metres of east walk-out. */
const TRAVEL_M = 23.45;
/** The compliant halt: 6 m short of the zebra, the PE-family stop distance. */
const HALT_Y = CROSSING_Y - 6;

// ---------------------------------------------------------------------------
// sc-pe-school-patrol — „Училищна пътека със стоп-палка" (PE-07 + PE-02)
// ---------------------------------------------------------------------------

/**
 * The PATROL WARDEN at the west curb beside the zebra (kind "policeStop" —
 * scenery + measurement only, see contracts.ts): stands at (−9.72, 246)
 * facing the roadway (east), right arm raised — the стоп-палка pose, hi-vis
 * vest, fictional per ADR-001. The runner emits ZERO SimTick events: the
 * graded duty lives in the child group below and in this template's
 * objectives, so no paddle detector exists to false-fire (A12).
 *
 * `stop` is single truth with the graded halt objective: the driver who stops
 * for the paddle rests exactly where the чл. 119 duty puts them — short of the
 * crossing. passBeyondM 25 = the warden falls a quarter-block behind without a
 * compliant stop → outcome "passedWithoutStopping" (the debrief's receipt).
 */
const SCHOOL_WARDEN: PoliceStopSpec = {
  id: "sc-pesp-warden",
  kind: "policeStop",
  libraryEventId: "ev-ped-crossing-marked",
  officer: { x: CURB_X, y: CROSSING_Y - 4 },
  facing: { x: 1, y: 0 }, // toward the roadway (east)
  stop: { x: LANE_2, y: HALT_Y }, // single truth with sc-pesp-halt below
  stopRadiusM: 4,
  stopSpeedKmh: 4,
  passBeyondM: 25,
};

/**
 * The CHILD GROUP at pes-x-1 (0, 250): steps off the WEST curb at 1.1 m/s (a
 * school group's shuffle — slower than the adult 1.4 tier, so the occupancy
 * lasts long enough to be a real wait) once the player closes within ~40 m.
 *
 * triggerDistM 40 is deliberately INSIDE the crossing zone (which arms at
 * ~35 m… the trigger fires a hair before it) and well PAST the speed-only
 * window the map guarantees (y 140..215): that is what lets „бърз подход"
 * grade EXACTLY SPEEDING_OVER_LIMIT — the speeding episode completes and
 * resets before any child is ever seen, so no crossing code can pile on.
 */
const SCHOOL_CHILDREN: PedestrianDartOutSpec = {
  id: "sc-pesp-children",
  kind: "pedestrianDartOut",
  crossingId: "pes-x-1",
  crossing: { x: 0, y: CROSSING_Y },
  start: { x: CURB_X, y: CROSSING_Y },
  dir: { x: 1, y: 0 },
  speedMps: 1.1,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 40,
  minTriggerSpeedKmh: 8,
  variant: "child", // R3 P6: the school figure RENDERS as the child rig
};

/**
 * THE REST OF THE GROUP (doc 86 D2 — „plural copy against a singular staged
 * actor"). Instruction 5 says «Изчакай ЦЯЛАТА група… Децата не вървят в права
 * линия — едно може да се върне» and the mistake copy says «децата вече бяха
 * стъпили на платното», while the drill staged exactly ONE child. Two
 * companions now walk it with her, offset along the zebra (which is 6 m long,
 * y ∈ [247, 253] — both stay on the paint) and at their own paces, so the group
 * strings out across the carriageway the way a real school group does and
 * „ЦЯЛАТА група" is a thing the student can actually see and count.
 *
 * Both are FASTER than the lead (1.2 / 1.15 vs 1.1 m/s), so the group clears
 * the carriageway no later than the single child did — the shadow's 13 s wait
 * is unchanged and the recorded demos keep grading exactly their own codes.
 * Same crossing id, so `pedestrianOnCrossing` simply counts three
 * (the sc-pe-zone-living precedent).
 */
const SCHOOL_CHILD_2: PedestrianDartOutSpec = {
  ...SCHOOL_CHILDREN,
  id: "sc-pesp-child2",
  start: { x: CURB_X, y: CROSSING_Y + 1.5 },
  speedMps: 1.2,
};
const SCHOOL_CHILD_3: PedestrianDartOutSpec = {
  ...SCHOOL_CHILDREN,
  id: "sc-pesp-child3",
  start: { x: CURB_X, y: CROSSING_Y - 1.4 },
  speedMps: 1.15,
};

/** PE-07 + PE-02 — училищна зона със стоп-палка (ЗДвП чл. 119: пропусни
 *  стъпилите на пътеката пешеходци; чл. 61–62: режимът на зоната — в
 *  училищната зона ограничението е 30 и се кара с готовност за спиране). */
export const SC_PE_SCHOOL_PATROL: ScenarioSpec = {
  id: "sc-pe-school-patrol",
  family: "pedestrians",
  tagsBg: ["пешеходци", "училищна зона", "деца", "пешеходна пътека", "градско каране"],
  titleBg: "Училищна пътека със стоп-палка",
  objectiveBg:
    "Спри напълно, когато отговорникът на пътеката вдигне стоп-палката, и потегли чак когато пътеката е напълно освободена.",
  archetypeIds: ["PE-07", "PE-02"],
  conceptIds: [
    "c-crosswalk-yield",
    "c-children-on-road",
    "c-child-safety",
    "c-speed-signs-zone",
    "c-pedestrian-rights-duties",
  ],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-school-v1.json meta.scenario.params
    // (tools/maps/gen_pe_school.mjs).
    params: { crossings: 1, signalized: "no", approachM: 140, zoneCrossingM: 110, zoneKmh: 30 },
    districtId: "pe-school-v1",
  },
  start: {
    spawnPointId: "pes-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли и се движи спокойно в своята лента — улицата пред теб минава край училище." },
    {
      n: 2,
      textBg:
        "Вали ли (ниво 5), включи късите светлини още преди да тръгнеш: в дъжд те не са за да виждаш ти, а за да те видят децата от бордюра — и спирачният път пред училището е с около 40% по-дълъг.",
    },
    {
      n: 3,
      textBg:
        "Улицата минава край училище и ограничението пада на 30. Свали скоростта отрано — още щом видиш училищната сграда — и в зоната дръж 25–28 км/ч.",
    },
    {
      n: 4,
      textBg:
        "Виж отговорника на пътеката до бордюра. Вдигне ли стоп-палката, тя е разпореждане — не е молба.",
    },
    {
      n: 5,
      textBg: "Спри напълно на няколко метра преди пътеката — не навлизай в нея и не пълзи напред.",
    },
    {
      n: 6,
      textBg:
        "Изчакай ЦЯЛАТА група да освободи платното, включително твоята лента. Децата са три и не вървят в права линия — едно изостава, друго може да се върне.",
    },
    { n: 7, textBg: "Огледай се и потегли плавно едва когато пътеката е напълно чиста." },
  ],
  success: [
    {
      id: "sc-pesp-zone",
      titleBg: "Влез в училищната зона със скорост на зоната",
      // 30 m past the entry, at/below 30: the зона-30 regime, graded as a gate.
      params: { kind: "reachZone", x: LANE_2, y: ZONE_ENTRY_Y + 30, radiusM: 12, maxSpeedKmh: 30 },
    },
    {
      id: "sc-pesp-halt",
      titleBg: "Спри пред пътеката по сигнала на стоп-палката",
      // Single truth with SCHOOL_WARDEN.stop — the compliant halt IS the duty.
      params: { kind: "reachZone", x: LANE_2, y: HALT_Y, radiusM: 4, maxSpeedKmh: 5 },
    },
    {
      id: "sc-pesp-clear",
      titleBg: "Премини, след като групата е освободила платното",
      params: { kind: "reachZone", x: LANE_2, y: CROSSING_Y + 40, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 95 },
  shadow: { path: "content/traces/sc-pe-school-patrol/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pe-school-patrol/mistake-ignored-paddle.trace.json" },
      titleBg: "Подминаване на вдигната стоп-палка",
      whatWentWrongBg:
        "Палката беше вдигната, децата вече бяха стъпили на платното — а колата продължи. Стоп-палката не е учтива молба: тя се вдига именно защото хора са на пътеката. Затова грешката се отсъжда като непропускане на пешеходец по чл. 119 — най-тежката грешка на изпита.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
    {
      traceRef: { path: "content/traces/sc-pe-school-patrol/mistake-fast-approach.trace.json" },
      titleBg: "Бърз подход към зоната на училището",
      whatWentWrongBg:
        "Водачът влезе в училищната зона, без да свали скоростта — държеше близо 38 км/ч там, където зоната позволява 30. Спря коректно после, но е късно: в зона 30 резервът за спиране е целият смисъл на ограничението, а децата излизат без да гледат.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
  ],
  teach: {
    whenBg:
      "Пред всяко училище в учебен ден: зона 30, отговорник на пътеката със стоп-палка и групи деца, които пресичат. Палката се вдига, докато групата е на платното, и се сваля, когато го освободи.",
    whyBg:
      "Детето не е нисък възрастен: то не преценява скорост и разстояние, тръгва внезапно и се връща след изпусната топка. Затова законът сваля скоростта на 30 — от 30 км/ч спираш за около 13 м, от 50 км/ч — за около 27 м, а разликата е точно ширината на пътеката. Стоп-палката е последната предпазна мрежа, когато детето вече е на платното.",
    lawRef: "ЗДвП чл. 119; чл. 61–62",
    examinerBg:
      "Изпитващият очаква видимо сваляне на скоростта още ПРЕДИ зоната, пълно спиране на сигнала на отговорника и потегляне едва след като платното е чисто. Превишаване с над 10 км/ч в зона 30 е опасна грешка; непропускането на пешеходец на пътеката прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — дъжд: същият дълг, по-дълъг спирачен път и по-лоша видимост към
    // бордюра. Physics stays DRY on purpose: the authored ghost envelopes are
    // dry-tuned (the doc 76 §7 rule — only a template that AUTHORS `physics`
    // gets reduced grip).
    { level: 5, conditions: { weather: "rain" } },
  ],
  staged: [SCHOOL_WARDEN, SCHOOL_CHILDREN, SCHOOL_CHILD_2, SCHOOL_CHILD_3],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-pe-night-unlit — „Неосветена пътека нощем" (PE-09 + PE-02) on pe-dart-v1
// ---------------------------------------------------------------------------

/**
 * THE DELTA AGAINST THE LIVE DAYTIME DART (read before editing): this template
 * REUSES pe-dart-v1 — the same street, the same zebra at y = 80, the same
 * corner shop west of it. Nothing about the map is new; the axes that are:
 *
 *  1. NIGHT (`conditions.night`, all five rungs). PE-09's defining condition.
 *  2. THE BEAM LEASH: triggerDistM 30 — the figure is released only at the
 *     edge of what low beams show, because at night she does not exist until
 *     she is in the beam. (The day dart, since its R3 #25 suddenness retune,
 *     releases even later — 26 m — but at a bolt; see 3.)
 *  3. A CALMER FIGURE: 1.4 m/s (the adult walk tier) against the day dart's
 *     2.5 m/s bolt (R3 #25). The night lesson is not „react to a sprinter";
 *     it is „you never saw her at all" — she is walking normally, in the
 *     dark. The two templates cannot play identically.
 *
 * WHAT GRADES, HONESTLY (the A12 discipline): PE-09's own doc-72 line asks for
 * a per-segment LIGHTING flag so SPEED_TOO_FAST_FOR_CONDITIONS arms on unlit
 * blocks. That flag does not exist, and this template does NOT fake one:
 * `ruleConfig` is absent, so conditionSpeedNightFactor stays the shipped 1 and
 * the night NEVER bills a conditions-speed code here. The graded contract is
 * PE-02's crossing vocabulary — crossingApproachMaxKmh (30) with a pedestrian
 * on the zebra, the чл. 119 yield, and the lights channel — which is exactly
 * the duty чл. 20 + чл. 119 put on the driver of q-uyazvimi-026's frame
 * („нощ, дъжд, разрешените 50, неосветена пътека"). The unlit-segment envelope
 * is authored ONE district over, on sc-ac-night-overdrive (templates-
 * conditions2.ts), where the drill IS the envelope; here it would be a second
 * detector firing on the same metre of road.
 *
 * TWO HONEST GAPS, both render-only (neither touches grading):
 *  - „darker clothing colorway" (the backlog's L5 wish): PedestrianDartOutRunner
 *    hardcodes colorIndex 3 for every dart — the colourway is not an authored
 *    channel. L5 therefore carries rain, not wardrobe.
 *  - L5 `wetGrip`: LevelSpec has no `physics` seam (compileScenario reads
 *    physics off the TEMPLATE, never off the rung), so a per-rung wet-grip
 *    opt-in is not expressible today. Authoring template-wide physics would
 *    hand L1–L4 a wet car their dry-tuned ghost envelopes were never recorded
 *    against — the doc 76 §7 rule. L5 is the rain RENDER + the longer real
 *    stopping story in the copy; the grip stays dry until the rung seam lands
 *    (the same call sc-ac-night-overdrive made in wave 2).
 */

/** The zebra pe-x-1 of pe-dart-v1 (the day dart's own crossing). */
const NU_CROSSING_Y = 80;
/**
 * The compliant halt: 6 m short of the zebra — the PE-family stop distance,
 * single truth with the graded halt objective below.
 */
const NU_HALT_Y = NU_CROSSING_Y - 6;

/**
 * The staged NIGHT FIGURE at pe-x-1 (0, 80): steps off the WEST curb at
 * 1.4 m/s — an ordinary walk, no sprint — only when the player closes within
 * ~30 m (± the director's seeded 3 m jitter). She is at the edge of what low
 * beams show, in dark clothes, on an unlit zebra: the last 30 m ARE the whole
 * encounter, which is why a 50 km/h city approach cannot end well.
 *
 * The occupancy span is the PE family's shared symmetric road window: the
 * west-curb stand-back is the same L4 convention templates-pe.ts pins at
 * −9.73 (the 1 cm is rounding of one 9.725 m stand-back — it never reaches
 * grading, which reads roadFromM/roadToM, not the curb x).
 */
const NIGHT_UNLIT_PED: PedestrianDartOutSpec = {
  id: "sc-pnu-ped",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: NU_CROSSING_Y },
  start: { x: CURB_X, y: NU_CROSSING_Y },
  dir: { x: 1, y: 0 },
  speedMps: 1.4,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 30,
  minTriggerSpeedKmh: 10,
};

/** PE-09 / PE-02 — неосветената пътека нощем (ЗДвП чл. 20: скорост според
 *  видимостта, не според табелата; чл. 119: пропусни стъпилия на пътеката). */
export const SC_PE_NIGHT_UNLIT: ScenarioSpec = {
  id: "sc-pe-night-unlit",
  family: "pedestrians",
  tagsBg: ["пешеходци", "пешеходна пътека", "нощно каране", "неосветен участък", "видимост"],
  titleBg: "Неосветена пътека нощем",
  objectiveBg:
    "Нощем и в дъжд приближавай неосветената пътека с готовност да спреш — пешеходецът се появява едва в снопа на фаровете.",
  archetypeIds: ["PE-09", "PE-02"],
  conceptIds: [
    "c-crosswalk-yield",
    "c-night-visibility",
    "c-speed-adaptation",
    "c-pedestrian-rights-duties",
    "c-lights-overview",
  ],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-dart-v1.json meta.scenario.params
    // (tools/maps/gen_pe_crossings.mjs). REUSED map: no generator work.
    params: { crossings: 1, signalized: "no", approachM: 80 },
    districtId: "pe-dart-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Нощ е и улицата е неосветена. Провери, че късите светлини са включени — без тях нямаш дори 40-те метра, които те показват.",
    },
    {
      n: 2,
      textBg:
        "Знакът разрешава 50, но ти виждаш докъдето стигат фаровете. Ограничението е таван, не цел — карай със скорост, с която спираш в осветеното.",
    },
    {
      n: 3,
      textBg:
        "Пътеката отпред е неосветена: свали скоростта ПРЕДИ нея, под 30 км/ч, докато още не виждаш никого. Готовността се създава рано, не при появата.",
    },
    {
      n: 4,
      textBg:
        "На ръба на снопа се появява тъмна фигура — човек в тъмни дрехи вече стъпва на зебрата. Спирачка, без да завиваш встрани.",
    },
    { n: 5, textBg: "Спри напълно на няколко метра преди зебрата и я изчакай да освободи цялото платно." },
    { n: 6, textBg: "Огледай се и премини спокойно едва когато пътеката е свободна." },
  ],
  success: [
    {
      id: "sc-pnu-approach",
      titleBg: "Приближи неосветената пътека със скорост за видимостта",
      // 12 m before the zebra, at/below the 30 km/h crossing-approach cap —
      // the readiness the dark demands, graded as a gate.
      params: { kind: "reachZone", x: LANE_2, y: NU_CROSSING_Y - 12, radiusM: 10, maxSpeedKmh: 30 },
    },
    {
      id: "sc-pnu-halt",
      titleBg: "Спри пред пътеката за появилия се пешеходец",
      // Single truth with the shadow's rest point — the чл. 119 duty, as a mark.
      params: { kind: "reachZone", x: LANE_2, y: NU_HALT_Y, radiusM: 4, maxSpeedKmh: 5 },
    },
    {
      id: "sc-pnu-clear",
      titleBg: "Премини, след като пътеката е свободна",
      params: { kind: "reachZone", x: LANE_2, y: NU_CROSSING_Y + 38, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 85 },
  shadow: { path: "content/traces/sc-pe-night-unlit/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pe-night-unlit/mistake-city-speed.trace.json" },
      titleBg: "Градска скорост срещу невидимия пешеходец",
      whatWentWrongBg:
        "Колата държеше обичайната градска скорост към неосветената пътека — законна, но сляпа. Пешеходката влезе в снопа на фаровете, когато вече беше твърде късно: приближаването без готовност се отсъжда по чл. 119, а ударът прекратява изпита. Разрешените километри в час не удължават нито фаровете, нито спирачния път — нощем таванът ти е осветеното, не табелата (чл. 20).",
      codeRefs: ["PEDESTRIAN_CROSSING_TOO_FAST", "COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-pe-night-unlit/mistake-lights-off.trace.json" },
      titleBg: "Нощно каране без светлини",
      whatWentWrongBg:
        "Скоростта беше премерена, но колата пое в тъмната улица с изгасени светлини — и спря още преди пътеката, защото без къси светлини зебрата на 40 метра просто не съществува. Тъмната фигура върху нея — също. Късите се включват със запалването по тъмно; чак след това се говори за скорост.",
      codeRefs: ["HEADLIGHTS_OFF_AT_NIGHT"],
    },
  ],
  teach: {
    whenBg:
      "На всяка пешеходна пътека без улично осветление след мръкване — в кварталите, по околовръстните улици, пред блоковете. Пешеходецът е в тъмни дрехи, няма светлоотразител и е убеден, че щом ТОЙ вижда твоите фарове, ти виждаш него.",
    whyBg:
      "Това е най-смъртоносната комбинация за пешеходци у нас. На къси светлини човек в тъмни дрехи се появява на около 30–50 метра; от 50 км/ч ти трябват близо 27 метра до спиране, а преди тях реагираш още 14 — резервът се стопява точно там, където пътеката е неосветена. Дъждът добавя и мокър асфалт, и отблясъци по стъклото. Затова отговорът не е по-остра реакция, а по-ниска скорост ПРЕДИ пътеката: тя връща едновременно и метрите, и секундата за реакция.",
    lawRef: "ЗДвП чл. 119; чл. 20",
    examinerBg:
      "Изпитващият очаква включени къси светлини по тъмно, видимо намаляване пред всяка неосветена пътека още преди да се е появил някой, отчетлива реакция със спирачка при появата на пешеходеца и потегляне едва след освобождаването на платното. Преминаване покрай пресичащ пешеходец е опасна грешка, а удар — прекратяване на изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — дъжд върху нощта (q-uyazvimi-026's exact frame). Conditions/render
    // axis only: night carries from the template conditions (compileScenario
    // spreads the rung OVER the template), rain adds the reflections and the
    // longer real stopping distance the copy teaches. NO `physics` — see the
    // header's second honest gap (LevelSpec has no per-rung physics seam, and
    // the ghosts are dry-tuned).
    { level: 5, conditions: { weather: "rain" } },
  ],
  staged: [NIGHT_UNLIT_PED],
  conditions: { weather: "dry", night: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-pe-zone-living — „Жилищна зона — гостите са пешеходците" (PE-15 + PE-02)
// on the wave-7 district pe-zone-v1 (tools/maps/gen_pe_zone.mjs)
// ---------------------------------------------------------------------------

/**
 * PE-15 („Жилищна зона / Residential zone (Д15/Д16)") was 🟡 PARTIAL in doc 72
 * for one reason: „SPEEDING_* + care grading work once the zone caps
 * maxSpeedKmh (PE-07's zone layer); free-roaming ped actors in-zone are the
 * pedestrian-actor variant capability". gen_pe_zone.mjs IS that zone layer for
 * this street — the zone segment posts its own `maxspeed` 20 and carries the
 * (previously reserved) `zone: "residential"` legality tag, so the shipped
 * speeding detectors grade the жилищна зона with no engine change at all.
 *
 * THE UNMARKED CROSSING (the design crux — read before editing). A living zone
 * has NO zebra: чл. 61–62 gives pedestrians the WHOLE carriageway, so painting
 * a pedestrian pathway here would teach the opposite of the law. But the
 * shipped yield duty grades off crossing events only — PEDESTRIAN_NOT_YIELDED
 * fires from `crossingPassed` with occupancy, and the CrossingZoneTracker
 * derives its zones from district `crossings[]` (the sc-hz-emergency-stop
 * finding). So pz-x-1 is authored `kind: "unmarked"`: world/builders/markings.ts
 * paints ONLY "marked" | "signals", so the crossing renders as bare asphalt
 * while the runtime still arms the zone and fires the pass event. The battery
 * asserts BOTH halves (zebraCrossings = 0, and crossingPassed still fires).
 * The people walking the road are graded exactly as the law owes them, on a
 * street that looks exactly like the law describes.
 *
 * THREE HONEST GAPS, all reported, none faked:
 *  1. Д15/Д16 have no SignKind and no GLB (world/types.ts), so the zone has no
 *     plate — its visual anchors are the residential blocks, the В26-50
 *     boundary posts and the Б1 the ranks put on the exit (below). Render-only:
 *     grading reads `maxspeed` and the crossing, never a sign placement (the
 *     call gen_pe_school.mjs made for А19).
 *  2. THE EXIT DUTY. чл. 25's „включване в движението — пропускаш всички"
 *     (content bank q-signs-049) has NO adjudicator. The closest shipped one is
 *     the right-hand-rule tracker, which grades the from-the-RIGHT subset — so
 *     the map joins the ordinary street from the EAST (a northbound driver's
 *     right) and the modelled subset AGREES with the law instead of
 *     contradicting it. The mouth also earns a real Б1 „Пропусни движещите се"
 *     plate for free (props.ts: minor-meets-higher, maxRank < 5 ⇒ giveWay), so
 *     the duty is VISIBLE. It is still not BILLED: no arm reaches arterial rank,
 *     so stoplines.ts derives zero graded lines there (battery-asserted). The
 *     full duty is taught (instructions + teach card) and gated by the
 *     sc-pzl-exit objective — never by a detector that does not model it (A12).
 *  3. THE HORN. „Клаксон и провиране" names a horn the sim has no channel for
 *     (no VehicleSample field, no detector). The demo's graded fault is the one
 *     that IS modelled and IS the law: driving past people on the road
 *     (чл. 119/62–63). The horn lives in the copy, where it belongs — it is the
 *     attitude the mistake is made of, not a code.
 *
 * L5's „ball dart between parked cars" (the backlog's wish) is NOT authored:
 * parked-car props would need a `bays` layer + trace obstacles, and a ball is
 * not an actor kind. L5 ships the honest half — a SECOND walker, stepping off
 * the EAST curb into the same shared carriageway, so the driver is threading
 * people from both sides at once (pedestrianOnCrossing is a COUNT, so the two
 * compose — battery-asserted).
 */

/** The Д15 entry (pz-n-entry): the 50 → 20 living-zone boundary. */
const ZL_ENTRY_Y = 120;
/** The walkers' UNMARKED crossing pz-x-1, 95 m inside the zone. */
const ZL_CROSSING_Y = 215;
/** The Д16 exit mouth (pz-n-exit) — the uncontrolled T onto the ordinary street. */
const ZL_EXIT_Y = 285;
/** The compliant halt: 6 m short of the walkers — the PE-family stop distance. */
const ZL_HALT_Y = ZL_CROSSING_Y - 6;
/** East curb: half-carriageway 8.125 + 0.4 curb + 1.2 stand-back (r2 → 9.73). */
const CURB_X_EAST = 9.73;

/**
 * THE WEST WALKER at pz-x-1 (0, 215): steps off the west curb once the player
 * closes within ~30 m. She is not crossing anything: in a жилищна зона the
 * carriageway IS the pedestrian's, and she is simply walking on it
 * (чл. 61–62). The engine still grades her through the crossing vocabulary,
 * which is why pz-x-1 exists at all (see the header).
 *
 * HER PACE IS THE STAGING (founder R0: „the car and the pedestrian are very
 * very very far away from each other … the pedestrian is not on the road at
 * all, he is just standing there on the side"). At the old 1.1 m/s shuffle she
 * needed 12.5 s to walk the 13.8 m from the west curb to the player's lane —
 * far longer than the ~5.5 s the player takes to cover the last 30 m of the
 * trigger. So at BOTH decisive moments — the shadow's halt and the
 * push-through's pass — she was still ~7 m away on the FAR half of the road,
 * a distant figure off to the left rather than a person in the way, and the
 * demos read as „the car stopped for nothing" / „the car passed nobody".
 * 1.9 m/s (a purposeful walk, still not a dart) puts her ~3 m in front of the
 * halted shadow and ~2.5 m off the push-through's flank — the squeeze the
 * lesson is named after. It stays UNDER the pace that would make the
 * push-through a contact (PEDESTRIAN_CONTACT_M is 1.5 m), so the demo keeps
 * grading непропускане and never COLLISION.
 *
 * triggerDistM 30 sits just INSIDE the ~35 m crossing zone and well past the
 * map's SPEED-ONLY WINDOW (y 120..180): that is what lets „квартална улица с
 * 50" grade EXACTLY SPEEDING_DANGEROUS — the speeding episode completes and
 * resets before anyone is on the road, so no crossing code can pile on. The
 * pace change deliberately leaves that trigger alone, so the window invariant
 * (pe-zone-districts.test) is untouched.
 * minTriggerSpeedKmh 6 is deliberately BELOW the zone's own 20 cap: at
 * walking-pace-plus a 10 km/h threshold would let a correct driver creep under
 * the trigger and the encounter would never happen.
 */
const ZONE_WALKER_WEST: PedestrianDartOutSpec = {
  id: "sc-pzl-walker-w",
  kind: "pedestrianDartOut",
  crossingId: "pz-x-1",
  crossing: { x: 0, y: ZL_CROSSING_Y },
  start: { x: CURB_X, y: ZL_CROSSING_Y },
  dir: { x: 1, y: 0 },
  speedMps: 1.9,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 30,
  minTriggerSpeedKmh: 6,
};

/**
 * THE SECOND WEST WALKER — template-wide (doc 86 D2). The halt objective is
 * titled «Спри пред ХОРАТА на платното» and the teach card describes „хора с
 * чанти" between the parked cars, but the drill staged exactly one figure. A
 * companion walks with her, three metres SOUTH (nearer the approaching car) so
 * the pair reads as two people crossing together rather than one figure with a
 * clone. A living zone has NO zebra — чл. 61–62 gives the whole carriageway to
 * pedestrians — so an off-centre companion is the legally correct picture, not
 * a paint violation.
 *
 * The southward offset is the SAFE one: measured constant-speed closest
 * approach at the 20 km/h zone cap is 3.02–4.98 m across the trigger jitter
 * (the lead walker's own is 2.44–4.40), so the push-through demo keeps grading
 * непропускане and never COLLISION.
 */
const ZONE_WALKER_WEST_2: PedestrianDartOutSpec = {
  id: "sc-pzl-walker-w2",
  kind: "pedestrianDartOut",
  crossingId: "pz-x-1",
  crossing: { x: 0, y: ZL_CROSSING_Y },
  start: { x: CURB_X, y: ZL_CROSSING_Y - 3 },
  dir: { x: 1, y: 0 },
  speedMps: 1.9,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 30,
  minTriggerSpeedKmh: 6,
};

/**
 * THE EAST WALKER — L5 only (`stagedAdd`). The mirror image: off the east curb,
 * westbound across the same shared carriageway, so the driver is threading
 * people from both sides at once.
 *
 * ⚠ doc 86 S5 (found by the lane-10 gradient sweep, NOT in the ledger's list):
 * this actor shipped at 1.0 m/s / triggerDistM 26 and carried the same inverted
 * fault surface as T11. It is a NEAR-SIDE dart — 5.67 m from the east curb to
 * the driving line — so at 1.0 m/s it needed 7.17 s to clear the 1.5 m contact
 * band while a driver holding the zone's own 20 km/h cap arrived after only
 * 4.63 s: measured closest approach 0.49–1.57 m, i.e. a COLLISION for obeying
 * the cap, while 30 km/h cleared at 2.21–2.93 m. 1.9 m/s (the west walker's own
 * purposeful pace) + triggerDistM 28 inverts it back: 2.62–4.58 m at the cap,
 * contact from 24 km/h upwards. The trigger stays past the map's SPEED-ONLY
 * window (release at y ≈ 187, the window ends at 180 — pe-zone-districts.test).
 * NOT recorded (L5-only stagedAdd), so no trace moves.
 */
const ZONE_WALKER_EAST: PedestrianDartOutSpec = {
  id: "sc-pzl-walker-e",
  kind: "pedestrianDartOut",
  crossingId: "pz-x-1",
  crossing: { x: 0, y: ZL_CROSSING_Y },
  start: { x: CURB_X_EAST, y: ZL_CROSSING_Y },
  dir: { x: -1, y: 0 },
  speedMps: 1.9,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 28,
  minTriggerSpeedKmh: 6,
};

/** PE-15 + PE-02 — жилищната зона.
 *
 *  CITATION CORRECTED 2026-08-03: this shelf cited „чл. 62–63". чл. 63 is the
 *  TUNNEL article („При движение в тунел, началото на който е обозначено с
 *  пътен знак, водачът е длъжен…"). The residential zone is чл. 61 + чл. 62,
 *  retrieved verbatim:
 *    чл. 61: „Жилищната зона е обособена, специално устроена територия в
 *      населено място, която е обозначена като такава на входовете и изходите
 *      й с пътни знаци и където действат специални правила за движение."
 *    чл. 62: „В жилищната зона действат следните специални правила: 1.
 *      пешеходците могат да използват за движение, а децата за игра пътя по
 *      цялата му широчина, без ненужно да пречат на движението на превозните
 *      средства; 2. водачите… са длъжни да се движат със скорост не по-голяма
 *      от 20 km/h…; 3. паркирането в жилищната зона е разрешено само на
 *      специално обозначените места; 4. при излизане от жилищна зона на друг
 *      път водачите… са длъжни да пропуснат участниците в движението,
 *      движещи се по него."
 *
 *  So the exit yield is чл. 62, т. 4 by name — чл. 25 is the general-maneuver
 *  article and merely the fallback. */
export const SC_PE_ZONE_LIVING: ScenarioSpec = {
  id: "sc-pe-zone-living",
  family: "pedestrians",
  tagsBg: ["пешеходци", "жилищна зона", "деца", "ниска скорост", "градско каране"],
  titleBg: "Жилищна зона — гостите са пешеходците",
  objectiveBg:
    "В жилищната зона пешеходците и играещите деца ползват цялото платно и са винаги с предимство — карай с пешеходна готовност докрай на зоната.",
  archetypeIds: ["PE-15", "PE-02"],
  conceptIds: [
    "c-residential-zone",
    "c-pedestrian-rights-duties",
    "c-general-care-duty",
    "c-children-on-road",
    "c-speed-signs-zone",
  ],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-zone-v1.json meta.scenario.params
    // (tools/maps/gen_pe_zone.mjs).
    params: { crossings: 1, signalized: "no", approachM: 120, zoneCrossingM: 95, crossingExitM: 70, zoneKmh: 20 },
    districtId: "pe-zone-v1",
  },
  start: {
    spawnPointId: "pz-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли и карай спокойно по обикновената улица — отпред е входът на жилищна зона." },
    {
      n: 2,
      textBg:
        "На входа на зоната — стеснението между жилищните блокове — ограничението пада на 20 км/ч. Свали скоростта ПРЕДИ входа: 20 е пешеходно темпо, не „бавно шофиране“.",
    },
    {
      n: 3,
      textBg:
        "Вътре няма пешеходни пътеки и никой не е длъжен да върви по тротоара — цялото платно е на хората. Хора върху платното тук не нарушават нищо: ти си гостът.",
    },
    {
      n: 4,
      textBg:
        "Появят ли се пешеходци пред теб, спри и ги изчакай да минат. Не подавай клаксон и не се провирай — те са с предимство навсякъде в зоната.",
    },
    {
      n: 5,
      textBg: "Потегли отново едва когато платното пред теб е чисто, и продължи със същите 20 до края на зоната.",
    },
    {
      n: 6,
      textBg:
        "На изхода — устието към обикновената улица, със знак Б1 пред него — излизането от зоната е включване в движението: пълзи, огледай наляво и надясно и пропусни всичко по улицата — ти нямаш никакво предимство.",
    },
    { n: 7, textBg: "Чак когато улицата е чиста, влез в нея и вдигни до нормалната градска скорост." },
  ],
  success: [
    {
      id: "sc-pzl-zone",
      titleBg: "Влез в жилищната зона с 20",
      // 30 m past the Д15 entry, at/below 20: the зона's regime, graded as a gate.
      params: { kind: "reachZone", x: LANE_2, y: ZL_ENTRY_Y + 30, radiusM: 12, maxSpeedKmh: 20 },
    },
    {
      id: "sc-pzl-halt",
      titleBg: "Спри пред хората на платното",
      // Single truth with the shadow's rest point — the чл. 61–62 duty, as a mark.
      params: { kind: "reachZone", x: LANE_2, y: ZL_HALT_Y, radiusM: 4, maxSpeedKmh: 5 },
    },
    {
      id: "sc-pzl-clear",
      titleBg: "Продължи, след като платното е свободно",
      // FR-24: the mark is 5.275 m short of the pz-e-zone М8 bar and the L1
      // ladder widens radius 12 → 14.5, so credit reached 9.23 m past the
      // paint of a ЖИЛИЩНА ЗОНА exit — the one place the copy insists you
      // clear the carriageway BEFORE it. The cut ends acceptance at the bar.
      params: {
        kind: "reachZone",
        x: LANE_2,
        y: ZL_CROSSING_Y + 40,
        radiusM: 12,
        maxSpeedKmh: 20,
        acceptBeforeMarkM: -5.275,
      },
    },
    {
      id: "sc-pzl-exit",
      titleBg: "Пълзи до устието на изхода и пропусни улицата",
      // The чл. 25 exit duty as a GATE, not a detector (see the header's second
      // honest gap): 8 m short of the mouth, at/below 10 km/h — the speed from
      // which you can actually stop for anything on the street you are joining.
      params: { kind: "reachZone", x: LANE_2, y: ZL_EXIT_Y - 8, radiusM: 5, maxSpeedKmh: 10 },
    },
    {
      id: "sc-pzl-out",
      titleBg: "Излез на обикновената улица",
      params: { kind: "reachZone", x: LANE_2, y: ZL_EXIT_Y + 45, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 130 },
  shadow: { path: "content/traces/sc-pe-zone-living/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pe-zone-living/mistake-city-speed.trace.json" },
      titleBg: "Квартална улица с 50",
      whatWentWrongBg:
        "„Това е просто квартална уличка“ — и колата влезе в зоната с почти 50 там, където зоната позволява 20. Превишението е над 10 км/ч, тоест ОПАСНА грешка, и то не е формално: в жилищна зона детето излиза иззад кола на два метра пред теб. От 20 км/ч спираш за около 7 метра; от 50 — за около 27. Разликата е точно между спирачка и удар. Водачът намали и после пропусна хората коректно — но безопасността в зоната се решава на входа ѝ, не пред пешеходеца.",
      codeRefs: ["SPEEDING_DANGEROUS"],
    },
    {
      traceRef: { path: "content/traces/sc-pe-zone-living/mistake-push-through.trace.json" },
      titleBg: "Клаксон и провиране между пешеходците",
      whatWentWrongBg:
        "Скоростта беше законна — 18 в зона 20 — и точно затова грешката е чиста: колата не спря, а се провря покрай хората на платното, „подканяйки“ ги с клаксон. В жилищната зона това е обърната логика. Пешеходецът върху платното тук не е нарушител, а ползва правото си по чл. 61–62; клаксонът не му отнема предимството и не е разрешение да минеш. Отсъжда се като непропускане на пешеходец — опасна грешка, която прекратява изпита.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "Във всеки квартал със синия правоъгълен знак Д15: Студентски град, „Дружба“, вътрешните улици на панелните комплекси. Няма тротоар, няма пътеки, коли са паркирани от двете страни, а между тях играят деца и вървят хора с чанти. Зоната важи до знака Д16 — не до „първото кръстовище“ и не до „където улицата се оправи“.",
    whyBg:
      "Жилищната зона е единственото място, където законът обръща приоритета: платното е на хората, а колата е гост в него (чл. 61–62). Затова таванът е 20 км/ч — скорост, от която спираш за около 7 метра, тоест в рамките на разстоянието, на което дете изскача иззад паркирана кола. От 50 км/ч същото дете е удар: реагираш 14 метра и спираш още 27. И понеже няма тротоар, „изчакай да се приберат отстрани“ няма смисъл — няма отстрани. Изчакваш ги да минат. На изхода логиката се обръща обратно: при излизане от жилищна зона на друг път си длъжен да пропуснеш движещите се по него (чл. 62, т. 4) — нямаш никакво предимство пред никого.",
    lawRef: "ЗДвП чл. 62, т. 1 и т. 2; чл. 62, т. 4; чл. 61",
    examinerBg:
      "Изпитващият очаква видимо сваляне на скоростта още ПРЕДИ входа на зоната и задържане около 20 през цялата ѝ дължина, пълно спиране и изчакване при хора на платното без клаксон и без провиране, и пълзящо, оглеждащо се излизане на улицата в края. Превишаване с над 10 км/ч в зоната е опасна грешка; непропускането на пешеходец прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — вторият пешеходец от отсрещния бордюр: платното е заето от двете
    // страни едновременно и „ще се промуша между тях" престава да е опция.
    // NO `physics`: the authored ghost envelopes are dry-tuned (the doc 76 §7
    // rule — only a template that AUTHORS `physics` gets reduced grip).
    { level: 5, stagedAdd: [ZONE_WALKER_EAST] },
  ],
  staged: [ZONE_WALKER_WEST, ZONE_WALKER_WEST_2],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-pe-parked-row-scan — „Покрай редицата паркирани коли" (PE-04, wave 9) on
// the REUSED pe-child-v1 district (tools/maps/gen_pe_crossings.mjs)
// ---------------------------------------------------------------------------

/**
 * THE DELTA AGAINST THE LIVE sc-crossing-child-ball (read before editing). Both
 * templates are PE-04 („Дете между паркирани коли / Child occluded by parked
 * cars, unmarked") on the SAME pe-child-v1 district (crossing pe-x-1 at y = 78,
 * 40 km/h residential). sc-crossing-child-ball is the SINGLE ball event — the
 * emergency-brake reflex. This one grades the SUSTAINED DISCIPLINE over a long
 * row: the fault is RELAXING along the parked cars, so the dart is placed LATE
 * (a small triggerDistM) and the two graded mistakes are the ways a driver loses
 * the row — carrying speed past the parked cars, and hugging them so the child
 * is invisible until it is under the bumper. Nothing about the map is new; the
 * axes that are (the „new spans/trigger points only" of the backlog note):
 *
 *  1. THE DART COMES FROM THE RIGHT (the parked row). The child steps off the
 *     EAST curb (x = +9.73) westbound INTO the driver's lane — the row is on the
 *     driver's side, which is why the objective is „премести се леко наляво": you
 *     move away from the cars for the sight line. (The live child-ball dart is
 *     the west-curb convention; the two cannot play identically.)
 *  2. A NEAR-SIDE dart has no crossing time to warn you. The west-curb siblings
 *     give the driver the whole oncoming lane (13.8 m ≈ 5 s at 2.6 m/s) before
 *     the figure reaches the driving line; this one gives 5.67 m ≈ 2.2 s. That
 *     is the whole difficulty of the archetype, and it is why the release
 *     distance has to be LARGER here, not smaller (see the T11 note below).
 *
 * ⚠ DOC 86 T11 — THE INVERTED FAULT SURFACE, FIXED HERE (read before re-tuning).
 * The drill shipped with `triggerDistM 14` and `roadFromM 4.0`, and the two
 * numbers together inverted the whole lesson:
 *   - 14 m of release against a reaction-plus-braking distance of 14.5 m at the
 *     objective's own 32 km/h cap: the taught corrective action („спирачка,
 *     право напред") was physically impossible;
 *   - a constant-speed closest-approach sweep hit at 18–32 km/h (the OBEDIENT
 *     band, worst clearance 0.14 m) and CLEARED at 34–50 km/h;
 *   - `roadFromM 4.0` — 2.4 m past the true carriageway edge at 9.73 − 8.125 =
 *     1.605 — held `pedestrianOnCrossing` false until the child was 0.8 m off
 *     the bumper, so the speeding driver who cleared could not be billed
 *     PEDESTRIAN_NOT_YIELDED either. Driving correctly was punished and driving
 *     illegally graded nothing.
 * The fix is the two honest numbers: the family's real occupancy window (1.6 /
 * 17.85 — the geometry, not a grading dial) and a release far enough out that
 * the cap can stop inside it. Pinned by
 * __tests__/lane10-pe-vru-truth.test.ts (G1 gradient, G2 stoppability,
 * G3 occupancy honesty).
 *
 * WHAT GRADES, HONESTLY (the A12 discipline): the SUSTAINED row-scan discipline
 * is TAUGHT (instructions + teach card) and gated by the reachZone objectives'
 * speed caps across the row's length; the covered brake and the half-metre left
 * offset are the shadow's demonstration, not a detector. The graded contract is
 * PE-04's crossing vocabulary — the posted 40-limit speeding detectors on the
 * run past the cars, the чл. 119 yield once the child is on the carriageway,
 * and the strike. THE PARKED ROW IS DRESSING, not props:
 * parked-car obstacles would need a bays layer + trace obstacles (the
 * sc-pe-zone-living honest gap); the row lives in the copy and the corner-shop
 * occluder pe-child-v1 already ships, exactly as child-ball treats it.
 *
 * TWO HONEST GAPS, both render/condition-only (neither touches grading):
 *  - „DUSK" (the L5 wish): ConditionAxis has no dusk value (dry/rain/fog/snow ×
 *    night). L5 renders the low light as `night: true` — the closest sub-daylight
 *    axis that compiles — and carries NO `physics` (the authored ghost envelopes
 *    are dry-tuned; the doc 76 §7 rule). The recorded drives are the dry day.
 *  - „A SECOND DART LATER IN THE ROW": pe-child-v1 has ONE crossing (pe-x-1), so
 *    a truly-further-along second zebra would need a NEW map (out of scope —
 *    map.reuse). L5 ships the modelled „no let-up": a SECOND child at the same
 *    pe-x-1, off the OPPOSITE (west) curb a beat later, so the driver is
 *    threading a dart from each side (pedestrianOnCrossing is a COUNT, so the two
 *    compose — the sc-pe-zone-living precedent). Compile-only: NOT recorded.
 */

/** The staged crossing pe-x-1 (y = 78) of the reused pe-child-v1. */
const ROW_CROSSING_Y = 78;
/** East curb: the parked-row side the child emerges from (r2 of the west −9.73). */
const ROW_CURB_EAST = 9.73;
/** West curb — the L5 second dart's side. */
const ROW_CURB_WEST = -9.73;
/**
 * The TRUE occupancy window, identical to every other PE crossing (doc 86 T11):
 * the curb stand-back is 9.73 m and the carriageway half-width 8.125 m, so the
 * walker is on the driving surface from arc 1.6 m to arc 17.85 m. This is
 * GEOMETRY, not a grading dial — the previous 4.0 hid the child from
 * `pedestrianOnCrossing` for the 2.4 m in which it was already on the tarmac
 * and inside the driver's lane.
 */
const ROW_ROAD_FROM_M = 1.6;
const ROW_ROAD_TO_M = 17.85;
/** Curb → across the 16.25 m carriageway → a few metres of walk-out. */
const ROW_TRAVEL_M = 23.45;

/**
 * THE PARKED-ROW CHILD at pe-x-1 (0, 78): steps off the EAST curb (x = +9.73)
 * WESTBOUND at 2.6 m/s — a small child bolting out of the row's last gap into
 * the driver's own lane, the child-ball dart profile.
 *
 * `triggerDistM 30` (was 14 — doc 86 T11) is DERIVED, not chosen. For a
 * near-side dart the compliant driver has to reach the crossing AFTER the child
 * has crossed the driving line, because the near side gives no crossing time as
 * warning. The child leaves the 1.5 m contact band at arc (5.67 + 1.5) / 2.6 =
 * 2.76 s, so the release has to sit further back than 2.76 s × 8.89 m/s
 * (the 32 km/h objective cap) = 24.5 m. With the director's ± 3 m seeded
 * jitter the worst case is 30 − 3 = 27 → 26.7 m of longitudinal release: 2.2 m
 * of margin on the sweep, and 12.2 m of margin on reaction-plus-braking
 * (14.5 m at 32 km/h). Measured closest approach at the cap is now 2.05–3.75 m
 * across the jitter band; the collision band starts at 36 km/h and runs to
 * 50 — ABOVE the cap, which is the point.
 */
const PARKED_ROW_CHILD: PedestrianDartOutSpec = {
  id: "sc-prs-child",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: ROW_CROSSING_Y },
  start: { x: ROW_CURB_EAST, y: ROW_CROSSING_Y },
  dir: { x: -1, y: 0 }, // westbound, into the driver's lane
  speedMps: 2.6,
  travelM: ROW_TRAVEL_M,
  roadFromM: ROW_ROAD_FROM_M,
  roadToM: ROW_ROAD_TO_M,
  triggerDistM: 30,
  minTriggerSpeedKmh: 10,
  variant: "child", // R3 P6: renders as the small child rig
};

/**
 * THE SECOND CHILD — L5 only (`stagedAdd`). The mirror image: off the WEST curb,
 * eastbound across the same pe-x-1, released only once the driver is right at
 * the crossing (triggerDistM 14, ± 3 m jitter) — so it steps out while the
 * driver is still stopped for the FIRST one and has to be waited out too:
 * „no let-up". A touch lower trigger speed (6 km/h) so it still fires if the
 * driver crawls out of the first stop, and the runner's 8 m creep-release
 * backstop covers a driver who is fully stationary. 14 (was 10) is what makes
 * the release reliable now that the first child releases 30 m out and the
 * compliant stop rests ~8 m short of the zebra.
 *
 * It is a FAR-side dart (13.79 m from the west curb to the driving line, 5.3 s
 * at 2.6 m/s), so it can never be a contact for a driver still rolling at the
 * cap: measured closest approach 9.9 m. It is a WAIT, not a trap.
 * Occupancy span measured from the west curb, so grading (which reads
 * roadFromM/roadToM along the walk, not the curb x) is identical.
 */
const ROW_SECOND_CHILD: PedestrianDartOutSpec = {
  id: "sc-prs-child2",
  kind: "pedestrianDartOut",
  crossingId: "pe-x-1",
  crossing: { x: 0, y: ROW_CROSSING_Y },
  start: { x: ROW_CURB_WEST, y: ROW_CROSSING_Y },
  dir: { x: 1, y: 0 }, // eastbound, from the opposite curb
  speedMps: 2.6,
  travelM: ROW_TRAVEL_M,
  roadFromM: ROW_ROAD_FROM_M,
  roadToM: ROW_ROAD_TO_M,
  triggerDistM: 14,
  minTriggerSpeedKmh: 6,
  variant: "child", // R3 P6: renders as the small child rig
};

/** PE-04 — покрай редицата паркирани коли (ЗДвП чл. 20: скорост и разстояние,
 *  позволяващи спиране пред всяко предвидимо препятствие; чл. 21: спазвай
 *  ограничението — по цялата дължина на редицата, не само пред зебрата). */
export const SC_PE_PARKED_ROW_SCAN: ScenarioSpec = {
  id: "sc-pe-parked-row-scan",
  family: "pedestrians",
  tagsBg: ["пешеходци", "паркирани коли", "дете", "закрита гледка", "градско каране"],
  titleBg: "Покрай редицата паркирани коли",
  objectiveBg:
    "Дълга редица паркирани коли крие крака, врати и деца: премести се леко наляво, свали скоростта и дръж спирачката покрита по цялата дължина.",
  archetypeIds: ["PE-04"],
  conceptIds: ["c-hazard-perception", "c-speed-adaptation", "c-children-on-road", "c-general-care-duty"],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-child-v1.json meta.scenario.params
    // (tools/maps/gen_pe_crossings.mjs). REUSED map: no generator work.
    params: { crossings: 1, signalized: "no", approachM: 78 },
    districtId: "pe-child-v1",
  },
  start: {
    spawnPointId: "pe-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Преди да потеглиш провери светлините: в здрач и нощем (ниво 5) късите светлини се включват ПРЕДИ да ти потрябват — покрай редица паркирани коли те са единственото, което прави детето видимо навреме.",
    },
    {
      n: 2,
      textBg:
        "Отдясно започва дълга редица паркирани коли. Тя крие крака, отварящи се врати и деца — свали скоростта и премести колата леко наляво за по-добра видимост.",
    },
    {
      n: 3,
      textBg:
        "Дръж спирачката покрита по ЦЯЛАТА дължина на редицата: дете може да изскочи между две коли във всеки момент, не само пред зебрата.",
    },
    {
      n: 4,
      textBg:
        "В края на редицата, на самата пешеходна пътека, изскача дете от твоята страна на платното. Реагирай веднага — спирачка, право напред, без да завиваш встрани.",
    },
    { n: 5, textBg: "Спри напълно преди пешеходната пътека и изчакай детето да освободи цялото платно." },
    { n: 6, textBg: "Продължи спокойно едва когато платното пред теб е чисто — включително иззад отсрещния бордюр." },
  ],
  success: [
    {
      id: "sc-prs-row",
      titleBg: "Влез покрай редицата с намалена скорост",
      // Already slow at the head of the row: the sustained discipline as a gate.
      params: { kind: "reachZone", x: LANE_2, y: 35, radiusM: 12, maxSpeedKmh: 32 },
    },
    {
      id: "sc-prs-approach",
      titleBg: "Приближи мястото на изскачане с готовност за спиране",
      params: { kind: "reachZone", x: LANE_2, y: 64, radiusM: 10, maxSpeedKmh: 32 },
    },
    {
      id: "sc-prs-clear",
      titleBg: "Премини пътеката, след като е свободна",
      params: { kind: "reachZone", x: LANE_2, y: 116, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 85 },
  shadow: { path: "content/traces/sc-pe-parked-row-scan/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pe-parked-row-scan/mistake-fast-row.trace.json" },
      titleBg: "Детето е ударено — 50 покрай редица, която го крие",
      whatWentWrongBg:
        "Колата удари детето. Това се казва първо, защото всичко останало тук е причината за него — и защото само тази грешка спира и самия изпит (Наредба № 38, чл. 48, ал. 3). Ударът не е лош късмет, а сбор от три неща. Скоростта: близо 50 в зона 40 се брои самостоятелно (чл. 21) — но по-важното е, че покрай редица паркирани коли таванът ти е видимостта, а не табелата (чл. 20). Готовността: детето ВЕЧЕ беше стъпило на платното, а колата продължи към пътеката с непроменена скорост, докато чл. 119 иска скорост, ПОЗВОЛЯВАЩА спиране пред стъпил пешеходец. И разстоянието за реакция, което просто го нямаше: от 50 км/ч детето се появява изпод бронята. От 30 км/ч същото това дете спира колата с метри резерв — затова скоростта не е отделна грешка ДО удара, а неговата причина.",
      // FOUNDER RULING 2026-08-10: this demo LEADS WITH THE STRIKE, and the
      // speeding is framed as its cause. Until the exact-contact geometry
      // landed, the 1.5 m isotropic circle measured from the car's CENTRE while
      // its nose sat 2.02 m further forward, so the engine never saw the child
      // and this card was authored around a speeding fault. The engine now
      // grades her struck at 0.113 m inside the body.
      //
      // The badge no longer depends on this order — rules/gravest.ts derives
      // severity, points, law chip and the чл. 48 rider from the gravest code
      // present — but the ORDER still states what the demo is about, and a card
      // that opens on a speed limit while a child is under the car does not.
      //
      // Kept from doc 86 T11: the чл. 119 approach code only became billable
      // once `roadFromM` was corrected from 4.0 (2.4 m past the real carriageway
      // edge) to an honest 1.6, so a child already on the tarmac and inside the
      // driver's lane counts as „on the crossing".
      codeRefs: ["COLLISION", "PEDESTRIAN_CROSSING_TOO_FAST", "SPEEDING_OVER_LIMIT"],
    },
    {
      traceRef: { path: "content/traces/sc-pe-parked-row-scan/mistake-hug-row.trace.json" },
      titleBg: "Плътно покрай колите въпреки свободното вляво",
      whatWentWrongBg:
        "Скоростта беше законна, но колата се движеше плътно покрай паркираните коли, макар вляво да имаше свободно място. Точно това затвори гледката: детето между колите се появи под самата броня, без разстояние за реакция. Половин метър наляво връща и сектора на видимост, и спирачния резерв — заради него ударът щеше да е спиране (чл. 20).",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "По всяка улица с непрекъсната редица паркирани коли отдясно — кварталните улици, търговските булеварди, зоните пред блоковете. Опасността не е на едно място: тя е по цялата дължина на редицата, защото дете или пешеходец може да излезе между всеки две коли.",
    whyBg:
      "Паркираните коли са плътна стена пред очите ти: детето е ниско, появява се внезапно между две коли и е на метри пред теб, когато го видиш. Две неща връщат резерва — по-ниската скорост (от 30 км/ч спираш за метри, от 50 прегазваш) и половин метър наляво, който отваря гледка между колите и създава странична дистанция. И двете трябва да са налице по ЦЯЛАТА редица, не да се създават при появата: тогава вече е късно.",
    lawRef: "ЗДвП чл. 20; чл. 21",
    examinerBg:
      "Изпитващият очаква видимо намалена скорост покрай паркираните коли, леко изместване наляво за видимост и странична дистанция, покрита спирачка по цялата дължина на редицата и отчетливо пълно спиране при появата на дете. Превишаване покрай редицата е грешка, а удар в пешеходец прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — здрач + втори дарт от отсрещния бордюр веднага след първия: гледката е
    // по-лоша и „ще си отдъхна след първото" престава да е опция. „Здрач" се
    // рендира като night (единствената под-дневна ос, която компилира — виж
    // header-а); NO `physics` (сухите призрачни обвивки — doc 76 §7).
    { level: 5, conditions: { night: true }, stagedAdd: [ROW_SECOND_CHILD] },
  ],
  staged: [PARKED_ROW_CHILD],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The PE-family wave-1 + wave-4 + wave-7 + wave-9 templates (registered in
 *  templates.ts by the main session's SCENARIO_TEMPLATES_PE2 spread). */
export const SCENARIO_TEMPLATES_PE2: readonly ScenarioSpec[] = [
  SC_PE_SCHOOL_PATROL,
  SC_PE_NIGHT_UNLIT,
  SC_PE_ZONE_LIVING,
  SC_PE_PARKED_ROW_SCAN,
];
