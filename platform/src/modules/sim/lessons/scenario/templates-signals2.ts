/**
 * Scenario templates — the SIGNALS family, wave-2 file: the FLASHING-AMBER ×
 * PEDESTRIAN drill (doc 72 JU-20 „Мигащо жълто" crossed with PE-01 „Приближаване
 * без готовност" / PE-02 „Внезапен пешеходец на пътеката").
 * DATA ONLY (the templates.ts law): coordinates are denormalized from the
 * committed pe-jay-v1.json (tools/maps/gen_pe_jaywalk.mjs) so nothing loads
 * world JSON at runtime; the pe-jay-district battery asserts the pinned geometry
 * and the sc-sig-flash-amber-ped trace gate replays the drives through the
 * production stack.
 *
 * WHY pe-jay-v1 AND NOT sx-v1 (the deliberate map choice): this drill grades the
 * PEDESTRIAN duty under flashing amber, so it needs a junction cluster AND a
 * marked crossing in one district. sx-v1 (the signals-family home) carries
 * `crossings: []` — the CrossingZoneTracker builds its zones from district
 * `crossings[]` alone, so NO crossingZoneEntered/crossingPassed can ever fire
 * there and both PEDESTRIAN_* detectors are structurally unreachable. pe-jay-v1
 * is the same signal-x builder (identical sx-n-* node ids, spawn, ±27.7 stop
 * lines) PLUS the one post-processed crossing pej-x-1 — the only committed map
 * that carries both. No map file is touched.
 *
 * THE CAPABILITY (shipped): the runtime cluster is dialed FLASHING AMBER at
 * session start (recorder signalModes → runtime setSignalClusterMode). A cluster
 * in that mode carries NO phase — fireLine returns early, so NO signal code can
 * fire on its stop lines — and the junction is governed as uncontrolled. With no
 * staged vehicle from the right the right-hand-rule tracker stays silent, which
 * leaves the crossing chain as the ONLY graded axis: exactly the teach goal.
 *
 * Distinct from sc-signal-flashing (templates-signals.ts): that template teaches
 * the give-way fallback under flashing amber (a car from the right, sx-v1). This
 * one teaches the чл. 119 pedestrian duty under the same lamp.
 *
 * Geometry pinned to pe-jay-v1 (battery pe-jay-district.test.ts):
 *   - ns road on x = 0, northbound right-lane center 4.06, limit 50;
 *   - sx-n-c is ONE single-node signal cluster at the origin (degree 4);
 *   - crossing pej-x-1 at (0, 34) on the north exit arm sx-e-n — the 35 m
 *     crossing zone therefore arms at y ≈ −0.76 from the southern approach.
 */

import type { PedestrianDartOutSpec, TrafficControllerSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";

/** Northbound right-lane center of pe-jay-v1's ns road, m. */
const LANE_2 = 4.06;
/** West curb of the carriageway the walker steps off, m (pe-jay-v1). */
const CURB_X = -9.73;
/** The staged crossing (pej-x-1) on the north exit arm, m. */
const Y_CROSSING = 34;

// ---------------------------------------------------------------------------
// sc-sig-flash-amber-ped — „Мигащо жълто и пешеходец на пътеката" on pe-jay-v1
// ---------------------------------------------------------------------------

/**
 * The staged encounter: a pedestrian steps off the WEST curb onto pej-x-1 and
 * walks east across the 16.25 m carriageway (roadFromM 1.6 → roadToM 17.85 along
 * her path; the player's lane center sits at her s = 13.79), released when the
 * player is 55 m from the crossing — i.e. as the approach reaches the junction's
 * southern stop line. Geometry/pacing mirror the proven PE-13 walker on this
 * same crossing (traces/scPeJaywalker), so the three drives below inherit its
 * verified timing envelope:
 *   - a 28 km/h approach meets her ON the carriageway (under the 30 km/h
 *     crossing cap — the shadow's only lawful way past is to stop and wait);
 *   - a 45 km/h approach trips the too-fast sustain BEFORE the brake lands;
 *   - either way she is clear of the roadway ~11.9 s after release, so a drive
 *     that actually waits passes an EMPTY crossing (no непропускане).
 * The walker is lawful here — under flashing amber the junction is unregulated
 * and чл. 119 gives her the crossing outright; nothing about her is a violation
 * to be graded, which is what keeps the fault squarely on the driver.
 */
export const SC_SIG_FLASH_AMBER_PED_PED: PedestrianDartOutSpec = {
  id: "sc-sfap-ped",
  kind: "pedestrianDartOut",
  crossingId: "pej-x-1",
  crossing: { x: 0, y: Y_CROSSING },
  start: { x: CURB_X, y: Y_CROSSING },
  dir: { x: 1, y: 0 },
  speedMps: 1.5,
  travelM: 23.45, // curb → across the 16.25 m carriageway → 5.6 m walk-out
  roadFromM: 1.6,
  roadToM: 17.85,
  triggerDistM: 55,
  minTriggerSpeedKmh: 10,
};

export const SC_SIG_FLASH_AMBER_PED: ScenarioSpec = {
  id: "sc-sig-flash-amber-ped",
  family: "signals",
  tagsBg: ["светофар", "мигащо жълто", "пешеходци", "пътека", "несъобразена скорост"],
  titleBg: "Мигащо жълто и пешеходец на пътеката",
  objectiveBg:
    "При мигащ жълт сигнал премини с повишено внимание — кръстовището е нерегулирано и пешеходецът на пътеката е с предимство.",
  archetypeIds: ["JU-20", "PE-01", "PE-02"],
  conceptIds: [
    "c-crosswalk-yield",
    "c-pedestrian-rights-duties",
    "c-signal-hierarchy",
    "c-speed-adaptation",
    "c-junction-approach",
  ],
  map: {
    archetype: "x-junction",
    // Mirrored in pe-jay-v1.json meta.scenario.params (gen_pe_jaywalk.mjs:
    // buildSignalXDistrict + the one post-processed crossing). The
    // flashing-amber mode is a runtime session-start dial, not a map property.
    params: {
      armNorthM: 120,
      armSouthM: 120,
      armEastM: 90,
      armWestM: 90,
      nsClass: "secondary",
      ewClass: "residential",
      nsMaxKmh: 50,
      ewMaxKmh: 40,
    },
    districtId: "pe-jay-v1",
  },
  start: {
    spawnPointId: "sx-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Тръгни по булеварда на север — светофарът на кръстовището напред мига в ЖЪЛТО, а веднага след него има пешеходна пътека.",
    },
    {
      n: 2,
      textBg:
        "Мигащото жълто не е зелено: то значи „внимание, кръстовището е нерегулирано“. Намали отрано — влизаш готов за спиране, не с инерция.",
    },
    {
      n: 3,
      textBg:
        "Дръж под 30 км/ч покрай пътеката и гледай ОТВЪД лампата: пешеходец слиза на платното от твоята лява страна.",
    },
    {
      n: 4,
      textBg:
        "Спри преди пътеката и го изчакай да освободи платното напълно. Мигащото жълто не му отнема предимството — чл. 119 е на негова страна.",
    },
    { n: 5, textBg: "Щом пътеката е чиста, продължи спокойно на север." },
  ],
  success: [
    {
      id: "sc-sfap-approach",
      titleBg: "Приближи мигащото жълто с намалена скорост",
      // Stem lane center, before the junction mouth (stop line at −27.7).
      params: { kind: "reachZone", x: LANE_2, y: -30, radiusM: 8, maxSpeedKmh: 35 },
    },
    {
      id: "sc-sfap-clear",
      titleBg: "Премини пътеката след кръстовището, когато е свободна",
      // North-arm northbound lane center, well past the crossing at y = 34.
      params: { kind: "reachZone", x: LANE_2, y: 70, radiusM: 10 },
    },
  ],
  rubric: { parTimeSec: 85 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scSigFlashAmberPed.ts; the §5 gate (shadow replays ZERO violations)
  // and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-sig-flash-amber-ped-traces.test.ts (re-record RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-sig-flash-amber-ped/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-sig-flash-amber-ped/mistake-hot-approach.trace.json" },
      titleBg: "Преминаване с несъобразена скорост покрай пътеката",
      whatWentWrongBg:
        "Колата подмина мигащото жълто с 45 км/ч и профуча покрай пътеката, докато пешеходецът беше още на платното — спирачката дойде чак в последния момент. „Повишено внимание“ означава скорост, от която можеш да спреш: покрай заета пътека това е под 30 км/ч. Паническото спиране накрая не поправя подхода — то е доказателството, че скоростта е била несъобразена.",
      codeRefs: ["PEDESTRIAN_CROSSING_TOO_FAST"],
    },
    {
      traceRef: { path: "content/traces/sc-sig-flash-amber-ped/mistake-no-yield.trace.json" },
      titleBg: "Непропускане на пешеходеца",
      whatWentWrongBg:
        "Скоростта беше премерена, но колата премина през заетата пътека, без да спре — „нали мигащото жълто разрешава“. Мигащото жълто разрешава преминаване през КРЪСТОВИЩЕТО, а не през пешеходеца: човекът, стъпил на пътеката, се пропуска винаги (чл. 119).",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "Когато светофар мига в жълто — най-често нощем или в слаб трафик, когато режимът се превключва на предупредителен. Кръстовището спира да бъде регулирано, но пешеходната пътека след него остава точно толкова пътека, колкото и на зелено.",
    whyBg:
      "Мигащото жълто се приема погрешно за „почти зелено“ и водачите минават с инерция — точно там, където светофарът вече не пази пешеходеца вместо тях. Затова ударите на такива кръстовища са нощни и тежки: скоростта е висока, човекът е в тъмното, а никой не очаква да отстъпи. Повишеното внимание не е поглед към лампата, а скорост, от която спираш пред пътеката.",
    lawRef: "ППЗДвП чл. 31; ЗДвП чл. 119",
    examinerBg:
      "Изпитващият гледа: осезаемо намаляване пред мигащото жълто, оглеждане наляво-надясно на нерегулираното кръстовище и реално спиране пред пътеката при пешеходец на платното. Преминаване покрай пресичащ пешеходец е опасна грешка; несъобразената скорост покрай заета пътека се отбелязва и без сблъсък.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5: мигащо жълто НОЩЕМ — изпитната класика (режимът се включва вечер) и
    // пешеходецът се появява в снопа на фаровете късно.
    { level: 5, conditions: { night: true } },
  ],
  staged: [SC_SIG_FLASH_AMBER_PED_PED],
  // NO signalPlan (deliberate): the cluster is dialed flashingAmber, so it
  // carries no phase at all — an approach-relative green/red pin would be inert.
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-sig-green-wave — „Зелена вълна" on the committed sig-wave-v1 avenue
// ---------------------------------------------------------------------------

/** Northbound right-lane center of sig-wave-v1's avenue, m (2×8.125 carriageway). */
const WAVE_LANE = 4.0625;

/**
 * The doc-72 SP-09 („Спурт между светофари / Red-light drag racing") host, and
 * the first template whose CONTENT IS THE MAP'S TIMING. sig-wave-v1 carries
 * three signalized X-junctions 264 m apart on one 50 km/h arterial, and its
 * signal nodes are named so the runtime's own fnv1a phase offsets land on
 * 36 / 17 / 48 s — exactly 19 s apart, which is exactly 264 m at 50 km/h. A
 * driver holding the limit therefore meets the SAME cycle-local phase at all
 * three lamps; the offsets ARE the lesson (tools/maps/gen_sig_wave.mjs asserts
 * the invariant; battery: world/__tests__/sig-wave-districts.test.ts).
 *
 * WHY the wave lives in the district and not in a runtime dial: LessonSpec has
 * no per-cluster offset map — only the single-cluster, approach-relative
 * `signalPlan` — so a wave pinned through the recorder's `signalOffsets` would
 * exist for the ghost and NOT for the student. Baking it into the node ids is
 * what makes the recorded drives and the live session read the same avenue.
 * Consequence (accepted, and what instructionsBg step 1 exists for): the wave
 * rides the SESSION clock, so it rewards a prompt departure — the authored
 * 304 m approach puts a bot that leaves at once ~8 s into the first green,
 * i.e. ~12 s of dawdle tolerance before the first lamp is missed.
 *
 * Measured on the production stack (traces/scSigGreenWave.ts):
 *   - 49.9 km/h throughout → green at all three lines (t = 22.0 / 41.1 / 60.1)
 *     and ZERO violations;
 *   - 57.9 km/h between the lamps → red on every approach from ~120 m out, one
 *     phantom slam, and the THIRD line reached at t = 61.6 — 1.5 s LATER than
 *     the driver who never exceeded 50. That measurement is the template's
 *     whole thesis, and the trace gate asserts it.
 *
 * NO staged actors and no crossings on the map: the only thing graded here is
 * how the driver spends the avenue.
 */
export const SC_SIG_GREEN_WAVE: ScenarioSpec = {
  id: "sc-sig-green-wave",
  family: "signals",
  tagsBg: ["светофар", "зелена вълна", "равномерна скорост", "икономично шофиране", "предвиждане"],
  titleBg: "Зелена вълна",
  objectiveBg:
    "Дръж равномерно 50 и хвани зелената вълна на три поредни светофара — който препуска между тях, стига до всяко червено и не печели нищо.",
  archetypeIds: ["SP-09", "SP-01", "SP-11", "JU-09"],
  conceptIds: [
    "c-eco-techniques",
    "c-fuel-factors",
    "c-traffic-light-signals",
    "c-speed-limits",
    "c-general-care-duty",
  ],
  map: {
    // "x-junction" is the nearest MAP_ARCHETYPES member (types.ts): sig-wave-v1
    // IS the signal-x archetype, three times along one axis. The wave-specific
    // truth lives in the district's meta.scenario.wave payload.
    archetype: "x-junction",
    // Mirrored from sig-wave-v1.json meta.scenario.params (gen_sig_wave.mjs).
    params: {
      armSouthM: 304,
      blockM: 264,
      armNorthM: 120,
      crossArmM: 90,
      avenueClass: "secondary",
      crossClass: "residential",
      avenueMaxKmh: 50,
      crossMaxKmh: 40,
      waveSpeedKmh: 50,
    },
    districtId: "sig-wave-v1",
  },
  start: {
    spawnPointId: "sw-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Тръгни веднага — трите светофара по булеварда са съгласувани помежду си и зеленото вече пътува на север без теб.",
    },
    {
      n: 2,
      textBg:
        "Ускори спокойно до 50 и ги задръж. 50 не е препоръка, а ключът: вълната е настроена точно за тази скорост.",
    },
    {
      n: 3,
      textBg:
        "Между светофарите не форсирай. Ако видиш червено напред — вдигни газта и остави колата да се търкаля; то ще стане зелено, преди да си стигнал.",
    },
    {
      n: 4,
      textBg:
        "Не спирай без нужда и не се колебай на зелено: всяка изгубена секунда те изхвърля от вълната и следващият светофар вече е чужд.",
    },
    {
      n: 5,
      textBg: "Мини и трите на зелено, без нито едно спиране, и излез по булеварда на север.",
    },
  ],
  success: [
    {
      id: "sc-sgw-tl1",
      titleBg: "Премини първия светофар на зелено",
      params: { kind: "passSignal", nodeId: "sw-n-tl1", x: 0, y: 0, radiusM: 40, control: "trafficLight" },
    },
    {
      id: "sc-sgw-steady",
      titleBg: "Дръж 50 между светофарите — без спринт",
      // Mid-block-1 (the first signal is at y = 0, the second at y = 264), on
      // the northbound lane center. maxSpeedKmh 53 is the gate: a wave rider
      // passes at 49.9, the „спринт" demo arrives at 57.9 and FAILS it — the
      // objective, not just the violation, refuses the sprint.
      params: { kind: "reachZone", x: WAVE_LANE, y: 132, radiusM: 10, maxSpeedKmh: 53 },
    },
    {
      id: "sc-sgw-tl3",
      titleBg: "Излез и от третия светофар на зелено",
      params: { kind: "passSignal", nodeId: "sw-n-tl3", x: 0, y: 528, radiusM: 40, control: "trafficLight" },
    },
  ],
  // Informational only (doc 76 §6): the shadow rides the whole avenue in ~72 s.
  // The wave rider is the FASTEST lawful way through — the sprint demo reaches
  // the third line 1.5 s later — so par time is the honest reward here.
  rubric: { parTimeSec: 80 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scSigGreenWave.ts; the §5 gate (shadow replays ZERO violations) and
  // the §9 stage-5 code asserts run in
  // traces/__tests__/sc-sig-green-wave-traces.test.ts (re-record RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-sig-green-wave/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-sig-green-wave/mistake-sprint.trace.json" },
      titleBg: "Спринт до всяко червено",
      whatWentWrongBg:
        "Газта до дупка между светофарите — 58 в петдесетака — и всеки път едно и също: пристигаш пред лампата, ПРЕДИ тя да е станала зелена, и гледаш червено от 120 метра. После идва заковаването насред отсечката, където няма нищо: спирачка от 12 м/с² на празен булевард е предпоставка за удар отзад, а не реакция — светофарът беше на 180 метра. И сметката е измерена: до третата стоп-линия стигаш ПО-КЪСНО от този, който не вдигна над 50. Спринтът между светофарите не купува време — купува гориво, спирачки и две отсъдени грешки.",
      codeRefs: ["SPEEDING_OVER_LIMIT", "HARSH_BRAKING_NO_CAUSE"],
    },
    {
      traceRef: { path: "content/traces/sc-sig-green-wave/mistake-sleep-at-green.trace.json" },
      titleBg: "Заспиване на потеглящото зелено",
      whatWentWrongBg:
        "Скоростта беше точната и вълната беше под колата — но на втория светофар колата спря на зелено и остана така седем секунди. Зеленото не чака: седемте изгубени секунди не се наваксват с ускоряване, защото следващият светофар е закован за часовника, а не за теб. Затова третата лампа те посреща с жълто и червено — една незапочната маневра изяде цялата отсечка. „Закъснели действия“ е второстепенна грешка на изпита и точно това е цената ѝ.",
      codeRefs: ["HESITATION_AT_GREEN"],
    },
  ],
  teach: {
    whenBg:
      "По големите градски булеварди, където светофарите не работят поотделно, а са пуснати с изместване един спрямо друг — „зелена вълна“. В София това е нормата по главните артерии: лампите са настроени за движение с разрешената скорост.",
    whyBg:
      "Зелената вълна е най-честият случай, в който бързането е физически безсмислено, а хората пак бързат. Светофарът напред е закован за часовник, не за теб: ускоряването само те докарва по-рано до червено, където чакаш точно спечелените секунди — но вече си изгорил двойно гориво, износил си спирачките и си създал предпоставка за удар отзад с всяко заковаване. Равномерните 50 не са бавната опция, а бързата. Същата монета има и обратна страна: вълната не чака и заспалите — секундите на зелено са също толкова изгубени, колкото и профуканите.",
    lawRef: "ЗДвП чл. 21; Наредба № 37",
    examinerBg:
      "Изпитващият гледа равномерността: държиш ли 50 без люлеене на газта, четеш ли лампата напред отрано и пускаш ли колата да се търкаля вместо да заковаваш. Превишаването между светофарите е второстепенна грешка, рязкото спиране без причина — основна (предпоставка за ПТП), а колебанието на зелено се отбелязва като „закъснели действия“.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [],
  // NO signalPlan (deliberate): a one-shot pin would rebase the FIRST cluster
  // alone and break its 19 s relationship with the other two — i.e. it would
  // destroy the very wave this template teaches. The district's natural offsets
  // are the truth; see the header.
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-sig-controller-live — „Регулировчикът бие светофара" on sx-v1 (map REUSED;
// the lamps run LIVE and contradict the officer in both directions)
// ---------------------------------------------------------------------------

/** Northbound right-lane center of sx-v1's ns road, m (battery sx-district). */
const SX_LANE = 4.0625;

/**
 * The staged authority: a CONTROLLER posted at sx-n-c with the cluster's lamps
 * LEFT RUNNING (mode "controlled" — runtime/signals.ts: the phase machine keeps
 * cycling, only stop-line adjudication reads the officer). Session-start dials,
 * all authored constants (the signalOffsets discipline — no step-time RNG):
 *
 *  - signalOffsetSec 23 puts the ns lamps on RED for session time t ∈ [0, 26)
 *    of the 50 s cycle, GREEN for t ∈ [27, 47), yellow to 50, red again after;
 *  - haltedGroup "ew" halts the CROSS axis from t = 0 — i.e. the player's south
 *    approach is PERMITTED while its own lamp shows red;
 *  - flipAtSec 26 is the single authored flip: from t = 26 the halt moves onto
 *    the ns axis — the player is stopped exactly as their lamp turns green.
 *
 * THE INVERSION IS THE TEMPLATE (and the whole reason it is not a second
 * sc-signal-controller): that drill runs halt→proceed, so its shadow WAITS and
 * the lesson is patience. This one runs proceed→halt, so its shadow must ACT on
 * a permission its own red lamp contradicts — the half of ЗДвП чл. 7 a driver
 * never believes until he has done it. The two mistakes are then the two ways of
 * refusing to: leaving on „your" green (t ≈ 28, lamp GREEN) and dithering until
 * even the lamp forbids it (t ≈ 52, lamp RED). Both grade the same code, and the
 * red one proves the point twice — the officer's halt REPLACES the lamp grading,
 * so it is never RED_LIGHT_CROSSED.
 *
 * ACCEPTED CONSEQUENCE (instructionsBg step 4 exists for it): the permission
 * window rides the SESSION clock and the schedule carries ONE flip
 * (SignalControllerSchedule), so a student who dawdles past t = 26 is halted for
 * the rest of the attempt and must retry. That is the drill: the officer's wave
 * is an instruction with an expiry, not a standing offer.
 *
 * Grading is 100% the production pipeline: the runtime attaches the permission
 * to stopLineCrossed and the reducer grades it (halt → CONTROLLER_SIGNAL_VIOLATED
 * even on green; proceed → innocent even on red). No ruleConfig, no physics.
 * HESITATION_AT_GREEN is structurally unreachable here: with a controller posted
 * the runtime surfaces the EFFECTIVE signal, so a halted approach reads "red"
 * however green its lamp is (worldRuntime.ts) — waiting is never billed, only
 * moving is. The figure (pose "directTraffic", ADR-001 fictional) is a static
 * visual anchor; the authored timetable is the law the drill grades.
 *
 * Geometry pinned to sx-v1 (battery sx-district.test.ts): single-node cluster
 * sx-n-c at the origin; south-approach stop line 27.725 m south of it
 * (sx-e-s@92.3, group "ns"); drawn lane centers at ±4.0625; spawn at (0, −105).
 */
export const SC_SIG_CONTROLLER_LIVE_EVENT: TrafficControllerSpec = {
  id: "sc-sctl-officer",
  kind: "trafficController",
  libraryEventId: "JU-18",
  signalNodeId: "sx-n-c",
  junction: { x: 0, y: 0 },
  // The junction-center post, facing the south approach the officer talks to
  // for the whole drill — first waving it through, then stopping it.
  officer: { x: 0, y: 0 },
  facing: { x: 0, y: -1 },
  haltedGroup: "ew",
  flipAtSec: 26,
  signalOffsetSec: 23,
  lineDistM: 27.7,
};

export const SC_SIG_CONTROLLER_LIVE: ScenarioSpec = {
  id: "sc-sig-controller-live",
  family: "signals",
  tagsBg: ["регулировчик", "светофар", "йерархия на сигналите", "червен сигнал", "предимство"],
  titleBg: "Регулировчикът бие светофара",
  objectiveBg:
    "Подчини се на регулировчика дори когато работещият светофар показва друго — неговите сигнали са над светлините, знаците и маркировката.",
  archetypeIds: ["JU-18"],
  conceptIds: ["c-signal-hierarchy", "c-traffic-light-signals", "c-junction-approach"],
  map: {
    archetype: "x-junction",
    // Map REUSED from the signals family — mirrored in sx-v1.json params. The
    // controller (mode + timetable + lamp pin) is a runtime session-start dial
    // armed by the staged event, not a map property.
    params: {
      armNorthM: 90,
      armSouthM: 120,
      armEastM: 120,
      armWestM: 170,
      nsClass: "secondary",
      ewClass: "residential",
      nsMaxKmh: 50,
      ewMaxKmh: 40,
    },
    districtId: "sx-v1",
  },
  start: {
    spawnPointId: "sx-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Тръгни по булеварда на север — светофарът на кръстовището напред работи нормално, но на самото кръстовище стои РЕГУЛИРОВЧИК.",
    },
    {
      n: 2,
      textBg:
        "Редът е един и той не се обсъжда: регулировчик → светофар → знаци → маркировка. Има ли регулировчик, важи само неговият сигнал.",
    },
    {
      n: 3,
      textBg:
        "Твоята лампа свети ЧЕРВЕНО, а регулировчикът е отворил твоята посока. Приближи с намалена скорост, огледай се и премини — червеното не е забрана срещу неговото разрешение.",
    },
    {
      n: 4,
      textBg:
        "Не чакай „своето“ зелено. Регулировчикът пуска посоките една по една: докато гледаш лампата, той вече е отворил напречното направление — и тогава зеленото пред теб не разрешава нищо.",
    },
    {
      n: 5,
      textBg: "Премини кръстовището спокойно и продължи на север.",
    },
  ],
  success: [
    {
      id: "sc-sctl-read",
      titleBg: "Приближи бавно и прочети регулировчика, не лампата",
      // Stem lane center, 6 m short of the 27.725 m stop line: the drive must be
      // slow enough here to have actually LOOKED at the officer.
      params: { kind: "reachZone", x: SX_LANE, y: -34, radiusM: 7, maxSpeedKmh: 20 },
    },
    {
      id: "sc-sctl-cross",
      titleBg: "Премини стоп-линията по разрешение на регулировчика — въпреки червената лампа",
      // requireRedMet is not decoration here, it is the drill's thesis made
      // gradable: the ONLY way this run completes is a crossing the lamp said no
      // to (objectives.ts: lightState "red" at the crossing IS a met red). A
      // student who waits for green never satisfies it — by then the officer has
      // halted him, and the crossing costs the 10-point опасна instead.
      params: {
        kind: "passSignal",
        nodeId: "sx-n-c",
        x: 0,
        y: 0,
        radiusM: 45,
        control: "trafficLight",
        requireRedMet: true,
      },
    },
    {
      id: "sc-sctl-exit",
      titleBg: "Излез от кръстовището на север",
      params: { kind: "reachZone", x: SX_LANE, y: 45, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scSigControllerLive.ts; the §5 gate (shadow replays ZERO violations,
  // crossing probed for lightState "red" + controller "proceed") and the §9
  // stage-5 code asserts run in
  // traces/__tests__/sc-sig-controller-live-traces.test.ts (RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-sig-controller-live/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-sig-controller-live/mistake-wait-for-green.trace.json" },
      titleBg: "Тръгване на „твоето“ зелено срещу регулировчика",
      whatWentWrongBg:
        "Колата спря на червената лампа и изчака зеленото — само че регулировчикът беше отворил нейната посока още докато чакаше, а щом лампата стана зелена, той вече пускаше напречното направление. Зеленото не е разрешение, когато на кръстовището има регулировчик: то е просто лампа, която в този момент никого не командва. Преминаването срещу неговия сигнал е опасна грешка, с която изпитът се прекратява — и реален страничен сблъсък, защото отляво и отдясно вече се движат по негова команда.",
      codeRefs: ["CONTROLLER_SIGNAL_VIOLATED"],
    },
    {
      traceRef: {
        path: "content/traces/sc-sig-controller-live/mistake-refuse-then-creep.trace.json",
      },
      titleBg: "Отказ да минеш на червено при негов знак — после засечка",
      whatWentWrongBg:
        "Регулировчикът пусна посоката, но „нали свети червено“ — и колата остана на линията. След това моментът отмина: зеленото дойде и си отиде, а колата най-накрая припълзя през линията тогава, когато вече и лампата, и регулировчикът ѝ забраняваха. Отказът да изпълниш сигнала на регулировчика не е предпазливост — той просто премества грешката по-нататък. Забележи и кое е отсъдено: не „преминаване на червено“, а неподчинение на регулировчика — при него лампата изобщо не се брои, нито за, нито против.",
      codeRefs: ["CONTROLLER_SIGNAL_VIOLATED"],
    },
  ],
  teach: {
    whenBg:
      "Когато на кръстовището има регулировчик, а светофарът ПРОДЪЛЖАВА да работи — при ПТП, повреда в контролера, протоколно преминаване или тежко задръстване, когато лампите вече не подреждат нищо. Тогава двата сигнала си противоречат открито и точно това е ситуацията, в която важи чл. 7.",
      whyBg:
      "Този урок е по-трудният от двата: да спреш на зелено е неприятно, но да ТРЪГНЕШ на червено изисква доверие — и точно затова водачите замръзват на линията, макар регулировчикът да им маха. Замръзването не е безопасно: зад теб има колона, а той е разчел кръстовището за секунди напред и вече е пуснал напречното. Който чака „своето“ зелено, го получава чак когато отсрещните вече се движат — и минава точно в тях.",
    lawRef: "ЗДвП чл. 7",
    examinerBg:
      "Изпитващият гледа кого слушаш: при регулировчик преминаването по негов сигнал — независимо от червената лампа — е правилното изпълнение, а изчакването на зеленото и потеглянето срещу него е опасна грешка, с която изпитът се прекратява. Очаква се намален подход, оглед и решително, но спокойно преминаване, без ускоряване в кръстовището.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // No L5 (the backlog's own rung list): the difficulty axis here is the
    // CLOCK — rain or night would only add a grip/visibility story the
    // dry-tuned ghost cannot honour (ADR-006 stage 4a), and a cold start at L4
    // already spends the permission window's slack.
  ],
  staged: [SC_SIG_CONTROLLER_LIVE_EVENT],
  // NO signalPlan (deliberate, the sc-signal-controller ruling): the lamps are
  // pinned at session start by the staged event's signalOffsetSec, synchronized
  // with the controller's SESSION-TIME timetable (flipAtSec) — an
  // approach-relative rebase would desync the red-permission window from the
  // flip and dissolve the hierarchy lesson.
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The SIGNALS-family wave-2 templates (registered in templates.ts). */
export const SCENARIO_TEMPLATES_SIGNALS2: readonly ScenarioSpec[] = [
  SC_SIG_FLASH_AMBER_PED,
  SC_SIG_GREEN_WAVE,
  SC_SIG_CONTROLLER_LIVE,
];
