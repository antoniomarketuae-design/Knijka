/**
 * Scenario templates — the LAW-IMPLIED BAN form of the PARKING family (doc 72
 * §11 „Family PK", archetype PK-06 „Спиране в забранена зона"), staged on the
 * purpose-built pk-banx-v1 micro-map (tools/maps/gen_pk_banx.mjs). DATA ONLY
 * in the templates.ts mold — every coordinate is denormalized from the
 * committed district file, and the batteries assert each pinned value against
 * the map (world/__tests__/pk-banx-districts.test.ts) and against the
 * production stack (traces/__tests__/sc-pk-crossing-ban-traces.test.ts).
 *
 *  - sc-pk-crossing-ban  „Спиране до пешеходна пътека — къде е позволено"
 *  - sc-pk-busstop-ban   „Спирка не е паркинг"
 *  - sc-pk-stop-vs-park  „В27 срещу В28 — престой и паркиране"  (pk-ban2-v1,
 *    tools/maps/gen_pk_ban2.mjs — the one member of this file that DOES ride a
 *    plate, because its whole subject is WHICH plate)
 *
 * WHY THIS IS NOT sc-pk-ban-stop AGAIN. The shipped PK-06 template teaches the
 * SIGN: a В27 plate marks a span, and the drill is to read the plate. The first
 * two here teach the LAW: чл. 98, ал. 1 bans stopping at the zebra (т. 1) and
 * at the junction (т. 2) with NO plate anywhere — the zebra and the corner ARE
 * the ban. Same detector, opposite cue: there is nothing to read but the road.
 * The third teaches what a plate does NOT say: В28 and В27 look alike and ban
 * different things, so reading the plate is only half the skill (see its own
 * header block below).
 *
 * WHERE THE TWO DEMOS REST (the §9 stage-5 auto-assert). Both grade EXACTLY
 * ILLEGAL_STOP_IN_BAN_ZONE (основна, чл. 98) and rest in DIFFERENT authored
 * spans — the junction ban is two spans because the node splits the street:
 *   - „Престой на метри преди кръстовището" → pkx-z-jx-before (чл. 98 т. 2);
 *   - „Спиране върху ъгъла на кръстовището" → pkx-z-jx-after  (чл. 98 т. 2).
 *
 * HONEST SCOPE — why neither demo rests at the ZEBRA. The backlog asked for
 * „престой точно преди пътеката" as the first demo. The engine cannot grade it
 * today: ILLEGAL_STOP_IN_BAN_ZONE requires `s.crossing === null`, and the
 * CrossingZoneTracker arms ~35 m out from every zebra, so a rest in the 5 m
 * before a crossing — the exact fault т. 1 names — is structurally acquitted as
 * a possibly-lawful yielding stop. Weakening the assert to fit was not an
 * option, and a demo with no code fails validate.ts (codeRefs must be
 * non-empty), so both demos moved to the т. 2 spans, which convict cleanly.
 * The т. 1 span is still AUTHORED on the map, still taught by the objective,
 * the instructions and the shadow (which parks past the zebra) — it simply
 * grades nothing yet. The armor's intended narrowing (`s.crossing` acquits only
 * when a pedestrian was actually SEEN) is pinned in the district battery.
 *
 * Family: "parking" — the doc-76 §2 chip; the id (sc-pk-*) matches the
 * sc-<family>-<slug> standard.
 */

import type { ScenarioSpec } from "./types";

/** The single northbound lane center of pk-banx-v1 (1+1, perceptual scale). */
const PKX_LANE = 4.06;
/** The unsignalized degree-4 junction — the чл. 98 т. 2 ban's reason. */
const PKX_JUNCTION_Y = 150;
/** The marked zebra — the чл. 98 т. 1 ban's reason. */
const PKX_ZEBRA_Y = 260;
/** The ONE legal stopping mark: past the zebra, outside every span. */
const PKX_BAY_Y = 300;

export const SC_PK_CROSSING_BAN: ScenarioSpec = {
  id: "sc-pk-crossing-ban",
  family: "parking",
  tagsBg: ["престой", "паркиране", "пешеходна пътека", "кръстовище", "чл. 98"],
  titleBg: "Спиране до пешеходна пътека — къде е позволено",
  objectiveBg:
    "Спри за престой на легално място СЛЕД пътеката, никога в 5-метровата зона преди нея, където колата ти скрива пешеходците.",
  archetypeIds: ["PK-06"],
  conceptIds: [
    "c-parking-prohibitions",
    "c-stop-parking-definitions",
    "c-stopping-standing-rules",
    "c-crosswalk-yield",
  ],
  map: {
    archetype: "x-junction",
    // The generator recipe — mirrored in pk-banx-v1.json meta.scenario.params
    // (tools/maps/gen_pk_banx.mjs); the district battery asserts the match.
    params: {
      lengthM: 360,
      maxspeedKmh: 50,
      junctionY: PKX_JUNCTION_Y,
      zebraY: PKX_ZEBRA_Y,
      legalBayY: PKX_BAY_Y,
      banKind: "noStopping",
      banBasis: "law",
    },
    districtId: "pk-banx-v1",
  },
  start: {
    spawnPointId: "pkx-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата. Задачата е „спри някъде тук за малко“ — но къде точно е позволено, решаваш ти." },
    { n: 2, textBg: "Напред има кръстовище. На него и на по-малко от 5 метра от него престоят е забранен — знак няма, забраната е в закона (чл. 98)." },
    { n: 3, textBg: "Подмини кръстовището, без да спираш на ъгъла — там спрялата кола крие идващите по напречната улица." },
    { n: 4, textBg: "След това идва пешеходна пътека. Пред нея не се спира: твоята кола е стената, зад която пешеходецът не се вижда." },
    { n: 5, textBg: "Премини пътеката, подай десен мигач и спри плътно вдясно на свободното място след нея." },
    { n: 6, textBg: "Задръж колата спряна — това е правилният отговор на „пусни ме тук“." },
  ],
  success: [
    {
      id: "sc-pkx-past-junction",
      titleBg: "Подмини кръстовището, без да спираш в забранената зона",
      // A progress checkpoint on the clear road between the two ban groups.
      params: { kind: "reachZone", x: PKX_LANE, y: 200, radiusM: 6 },
    },
    {
      id: "sc-pkx-past-zebra",
      titleBg: "Премини пешеходната пътека, без да спираш пред нея",
      params: { kind: "reachZone", x: PKX_LANE, y: 275, radiusM: 6 },
    },
    {
      id: "sc-pkx-legal-stop",
      titleBg: "Спри на разрешеното място след пътеката",
      // Completable ONLY at near-stop speed at the legal mark (the
      // pk-smooth-stop mark discipline) — outside every чл. 98 span.
      params: { kind: "reachZone", x: PKX_LANE, y: PKX_BAY_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scPkCrossingBan.ts; gates in
  // traces/__tests__/sc-pk-crossing-ban-traces.test.ts (RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-pk-crossing-ban/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pk-crossing-ban/mistake-stop-before-junction.trace.json" },
      titleBg: "Престой на метри преди кръстовището",
      whatWentWrongBg:
        "Колата спря на няколко метра преди кръстовището — „то тук е широко, ще се разминат“. Чл. 98 забранява престоя на кръстовището и на по-малко от 5 метра от него, и то без никакъв знак: спрялата тук кола крие от теб идващите по напречната улица, а теб — от тях. Изчакай и спри след кръстовището.",
      codeRefs: ["ILLEGAL_STOP_IN_BAN_ZONE"],
    },
    {
      traceRef: { path: "content/traces/sc-pk-crossing-ban/mistake-stop-on-corner.trace.json" },
      titleBg: "Спиране върху ъгъла на кръстовището",
      whatWentWrongBg:
        "Водачът подмина кръстовището и спря веднага след него, върху ъгъла. Забраната важи от двете страни — на кръстовището и на 5 метра от него. Ъгълът е мястото, където завиващите трябва да минат, а пешеходците — да пресекат: спрялата там кола ги избутва в платното.",
      codeRefs: ["ILLEGAL_STOP_IN_BAN_ZONE"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато някой ти каже „спри тук за секунда“ — пред блока, пред магазина, до училището. Забраните по чл. 98 не са поставени със знак: кръстовището, пътеката и спирката сами забраняват престоя. Търсиш ли табела, ще спреш точно там, където не бива.",
    whyBg:
      "Спрялата кола е стена. До пешеходната пътека тази стена крие точно пешеходеца, който тръгва да пресича — и водачът в съседната лента го вижда чак когато е пред него. На ъгъла на кръстовището същата стена крие идващите по напречната улица. „Само за минутка“ е точно минутата, в която детето излиза иззад колата ти. Затова законът иска 5 метра, а изпитът брои престоя в забранена зона като основна грешка.",
    lawRef: "ЗДвП чл. 98, ал. 1",
    examinerBg:
      "Изпитващият казва „спри някъде тук, където е позволено“ и мълчи — изборът на място Е изпитът. Спиране на кръстовището или на по-малко от 5 метра от него, както и на пешеходната пътека или на 5 метра преди нея, е основна грешка. Очаква се да подминеш забранените места, да подадеш десен мигач и да спреш плътно вдясно на първото разрешено място след тях.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-pk-busstop-ban — the spirka is bigger than the shelter (pk-busstop-v1)
// ---------------------------------------------------------------------------

/** The single northbound lane center of pk-busstop-v1 (1+1, perceptual scale). */
const PKBS_LANE = 4.06;
/** Where the зигзаг — and the ban — starts. */
const PKBS_MARKING_FROM_Y = 150;
/** Where the bay itself starts (the half drivers DO count as „the stop"). */
const PKBS_POCKET_FROM_Y = 180;
/** Where the bay — and the ban — ends. */
const PKBS_POCKET_TO_Y = 210;
/** The ONE legal stopping mark: 40 m past the zone, outside every span. */
const PKBS_BAY_Y = 250;

/**
 * „Спирка не е паркинг" — the THIRD cue of the same чл. 98 detector, and the
 * one that costs learners the most: pk-ban-v1 bans by a В27 PLATE, pk-banx-v1
 * bans by geometry you can see (a zebra, a corner), and this map bans by a ZONE
 * whose real extent is invisible unless you read the зигзаг. „Аз не съм на
 * спирката, аз съм малко преди нея" is the sentence this template exists to
 * refute: the marked approach IS the spirka (Наредба № 2/2001 marks it out;
 * ЗДвП чл. 98, ал. 1 bans even а momentary престой across all of it).
 *
 * WHY THE POCKET IS EMPTY (and stays empty). A staged bus in the bay would be a
 * lead vehicle within banZoneStopQueueGapM, which makes every rest behind it
 * QUEUE-INNOCENT by construction — the drill would look identical and grade
 * nothing. The empty pocket is not a missing prop; „свободна е, само за
 * секунда" is precisely the misconception being taught. Pinned end-to-end in
 * world/__tests__/pk-busstop-districts.test.ts („the SAME rest behind a queue
 * lead stays innocent").
 *
 * WHERE THE TWO DEMOS REST (the §9 stage-5 auto-assert). Both grade EXACTLY
 * ILLEGAL_STOP_IN_BAN_ZONE (основна, чл. 98) and rest in DIFFERENT authored
 * spans — one continuous ban, two different excuses:
 *   - „Само да сваля пътник" върху спирката      → pkbs-z-stop-pocket  (y 195);
 *   - „Престой в зоната на маркировката преди"   → pkbs-z-stop-marking (y 165).
 *
 * WHY THIS MAP GRADES WHAT pk-banx-v1 COULD NOT. sc-pk-crossing-ban's zebra
 * span is structurally acquitted (ILLEGAL_STOP_IN_BAN_ZONE requires
 * `s.crossing === null`, and CrossingZoneTracker arms ~35 m out from any
 * zebra). This district carries ZERO crossings and ZERO intersections, so no
 * armor arms at all and BOTH authored spans convict — the archetype's clean
 * room. No engine change was needed; the map is the answer.
 */
export const SC_PK_BUSSTOP_BAN: ScenarioSpec = {
  id: "sc-pk-busstop-ban",
  family: "parking",
  tagsBg: ["престой", "паркиране", "автобусна спирка", "зигзаг", "чл. 98"],
  titleBg: "Спирка не е паркинг",
  objectiveBg:
    "Не спирай върху автобусна спирка „само за секунда“ — намери легалното място след зоната на спирката.",
  archetypeIds: ["PK-06"],
  conceptIds: [
    "c-parking-prohibitions",
    "c-stop-parking-definitions",
    "c-stopping-standing-rules",
  ],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in pk-busstop-v1.json meta.scenario.params
    // (tools/maps/gen_pk_busstop.mjs); the district battery asserts the match.
    params: {
      lengthM: 340,
      maxspeedKmh: 50,
      markingFromM: PKBS_MARKING_FROM_Y,
      pocketFromM: PKBS_POCKET_FROM_Y,
      pocketToM: PKBS_POCKET_TO_Y,
      legalBayY: PKBS_BAY_Y,
      banKind: "noStopping",
      banBasis: "law",
    },
    districtId: "pk-busstop-v1",
  },
  start: {
    spawnPointId: "pkbs-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата. Задачата е „остави ме тук“ — а ти решаваш къде спирането е позволено." },
    { n: 2, textBg: "Напред вдясно има автобусна спирка. Зоната ѝ не започва при навеса — започва там, където започва зигзагът по платното." },
    { n: 3, textBg: "Не намалявай към джоба на спирката: там престоят е забранен от закона, дори за секунда (чл. 98, ал. 1)." },
    { n: 4, textBg: "Джобът е празен — това не го прави свободен. Автобусът идва след минута и трябва да намери мястото си празно." },
    { n: 5, textBg: "Подмини цялата зона на спирката, подай десен мигач и спри плътно вдясно на свободното място след нея." },
    { n: 6, textBg: "Задръж колата спряна — това е правилният отговор на „само за секунда“." },
  ],
  success: [
    {
      id: "sc-pkbs-past-zone",
      titleBg: "Подмини цялата зона на спирката, без да спираш в нея",
      // A checkpoint on the clear road past the pocket's end (y = 210).
      params: { kind: "reachZone", x: PKBS_LANE, y: 225, radiusM: 6 },
    },
    {
      id: "sc-pkbs-legal-stop",
      titleBg: "Спри на разрешеното място след зоната на спирката",
      // Completable ONLY at near-stop speed at the legal mark (the
      // pk-smooth-stop mark discipline) — 40 m past every чл. 98 span.
      params: { kind: "reachZone", x: PKBS_LANE, y: PKBS_BAY_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
  ],
  rubric: { parTimeSec: 70 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scPkBusstopBan.ts; gates in
  // traces/__tests__/sc-pk-busstop-ban-traces.test.ts (RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-pk-busstop-ban/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pk-busstop-ban/mistake-stop-on-pocket.trace.json" },
      titleBg: "„Само да сваля пътник“ върху спирката",
      whatWentWrongBg:
        "Джобът беше празен и колата влезе в него — „нали автобус няма, за секунда е“. Чл. 98, ал. 1 забранява на спирката дори краткия престой, и то без никакъв знак: спирката е работното място на автобуса. Зает джоб принуждава автобуса да спре на платното, а пътниците му — баби, деца, хора с колички — да слизат между движещите се коли. Секундата ти е чужда опасност.",
      codeRefs: ["ILLEGAL_STOP_IN_BAN_ZONE"],
    },
    {
      traceRef: { path: "content/traces/sc-pk-busstop-ban/mistake-stop-on-marking.trace.json" },
      titleBg: "Престой в зоната на маркировката преди спирката",
      whatWentWrongBg:
        "Водачът спря преди навеса и реши, че е извън спирката. Не е: зоната на спирката е тази, която зигзагът очертава по платното (Наредба № 2/2001), и тя започва десетки метри преди табелата. Спрялата тук кола отнема на автобуса пътя, по който той влиза в джоба — затова той спира накриво или изобщо не влиза. „Аз съм преди спирката“ не е място, а извинение.",
      codeRefs: ["ILLEGAL_STOP_IN_BAN_ZONE"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато спирката е „точно там, където ти трябва“ — пред мола, пред блока, пред гарата. Джобът е широк, празен и примамлив, а автобусът още не се вижда. Точно тогава се решава дали си от водачите, които го заемат „само за секунда“.",
    whyBg:
      "Спирката е единственото място, където автобусът може да опре вратите си до бордюра. Заемеш ли я, той спира във втората лента — и тогава пътниците му слизат не на тротоара, а между колите: там, където никой не ги очаква. Зоната на спирката е по-голяма от навеса и е очертана със зигзаг по платното, защото автобусът има нужда от място да влезе и да излезе, не само да стои. Затова законът забранява тук дори престоя, а изпитът го брои като основна грешка — за разлика от В28, където престоят за слизане е позволен.",
    lawRef: "ЗДвП чл. 98, ал. 1",
    examinerBg:
      "Изпитващият казва „спри някъде тук“ и мълчи — изборът на място Е изпитът. Престой на спирката на превозните средства за обществен превоз, включително в очертаната със зигзаг зона преди нея, е основна грешка, независимо колко кратък е и дали има автобус. Очаква се да разпознаеш зоната по маркировката, да я подминеш без да намаляваш към джоба, да подадеш десен мигач и да спреш плътно вдясно на първото разрешено място след нея.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-pk-stop-vs-park — В27 срещу В28: which plate takes your passenger
//                      (pk-ban2-v1)
// ---------------------------------------------------------------------------

/** The single northbound lane center of pk-ban2-v1 (1+1, perceptual scale). */
const PKB2_LANE = 4.06;
/** Where В28 — and the signed street — begins. */
const PKB2_PARK_FROM_Y = 70;
/** The seam: В28 ends and В27 begins on this meter, with no legal road between. */
const PKB2_SEAM_Y = 170;
/** Where В27 — and the signed street — ends. */
const PKB2_STOP_TO_Y = 290;
/** Where the lawful passenger stop happens: mid-В28. */
const PKB2_DROPOFF_Y = 120;
/** The ONE place a car may be LEFT: past both plates. */
const PKB2_BAY_Y = 330;

/**
 * „В27 срещу В28 — престой и паркиране" — the fourth cue of the чл. 98
 * detector, and the only one that is not about finding a ban. The other three
 * parking drills all ask the same question in different clothes („is stopping
 * forbidden here?"): pk-ban-v1 answers it with a plate, pk-banx-v1 with the
 * zebra and the corner, pk-busstop-v1 with the зигзаг. This one asks a question
 * none of them can: the ban is posted, you have read it, and it still does not
 * tell you what you may do — because В28 and В27 are different bans. Под В28
 * престоят за слизане на пътник е РАЗРЕШЕН (ЗДвП чл. 93 defines престой as
 * exactly that: a stop for boarding/loading with the driver present); под В27
 * не спираш изобщо. Source questions q-spirane-i-parkirane-013/014/063/042.
 *
 * WHY ITS OWN MAP (pk-ban2-v1, tools/maps/gen_pk_ban2.mjs). The backlog asked
 * this template to reuse pk-ban-v1, IF that map authored both kinds. It does
 * not — and neither does any other file in content/world: gen_ban_zones.mjs
 * emits ONE zone per district and every shipped ban span is `noStopping`. So
 * pk-ban2-v1 is the first and only district carrying a В28 span at all, and the
 * two spans ABUT (В28 [70,170] → В27 [170,290], no legal meter between) because
 * the seam is the lesson: y = 165 is lawful престой and y = 175 is основна
 * грешка, and the only thing that changed is the plate.
 *
 * WHERE THE DRIVES REST (the §9 stage-5 auto-assert). The shadow's rest is the
 * template's thesis and grades NOTHING (y = 120, В28 — престой, разрешен);
 * both demos grade EXACTLY ILLEGAL_STOP_IN_BAN_ZONE inside the В27 span, at
 * marks that mean different things:
 *   - „Пренесох правилото на В28 отвъд знака" → y = 180 (five meters past the
 *     seam: the permission that did not travel);
 *   - „Само за минутка" под В27           → y = 230 (mid-span: the excuse that
 *     never worked anywhere).
 * The identical-rest pair (innocent at 120, основна at 230 — same 6 s, same
 * everything but the plate) is pinned through the real reducer in
 * world/__tests__/pk-ban2-districts.test.ts.
 *
 * HONEST SCOPE — why the „дълъг престой под В28" demo does not exist. The
 * backlog asked for it as the second demo, and it is a real чл. 93 fault: a
 * minute at the curb under В28 is паркиране, which the plate bans. The engine
 * cannot grade it today. ILLEGAL_STOP_IN_BAN_ZONE reads `tick.noStopZone` and
 * nothing else; `tick.noParkZone` surfaces on the tick and no detector consumes
 * it, because — engine.ts says this out loud — паркиране and престой are
 * indistinguishable with current telemetry (the same A12 bar). The missing
 * capability is a rest-DURATION threshold on the noParking span, which lives in
 * rules/engine.ts + rules/types.ts: shared files this template may not touch.
 * Weakening the assert to fit was not an option, and a demo with no code fails
 * validate.ts (codeRefs must be non-empty), so the second demo moved to the
 * seam — a fault of exactly the same misconception, from the other side. The
 * В28 span is still AUTHORED, still flagged on the tick, still the shadow's
 * rest, still taught by the objective, the instructions and the teach card. Its
 * ungraded long stay is pinned as a live tripwire („the В28 span grades NOTHING
 * even at 60 s") in the district battery: the day the threshold lands, that
 * test fails and names this template as the one waiting for it.
 */
export const SC_PK_STOP_VS_PARK: ScenarioSpec = {
  id: "sc-pk-stop-vs-park",
  family: "parking",
  tagsBg: ["престой", "паркиране", "В27", "В28", "забранителни знаци", "чл. 93"],
  titleBg: "В27 срещу В28 — престой и паркиране",
  objectiveBg:
    "Под В28 можеш да спреш за слизане на пътник, но не и да паркираш; под В27 не спираш изобщо — покажи, че четеш разликата.",
  archetypeIds: ["PK-06"],
  conceptIds: [
    "c-parking-signs-zones",
    "c-stop-parking-definitions",
    "c-parking-prohibitions",
    "c-stopping-standing-rules",
    "c-sign-scope",
  ],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in pk-ban2-v1.json meta.scenario.params
    // (tools/maps/gen_pk_ban2.mjs); the district battery asserts the match.
    params: {
      lengthM: 380,
      maxspeedKmh: 50,
      parkFromM: PKB2_PARK_FROM_Y,
      parkToM: PKB2_SEAM_Y,
      stopToM: PKB2_STOP_TO_Y,
      legalBayY: PKB2_BAY_Y,
      banKind: "noParking+noStopping",
      banBasis: "sign",
    },
    districtId: "pk-ban2-v1",
  },
  start: {
    spawnPointId: "pkb2-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата. С теб пътува приятел, който слиза тук — а после трябва да оставиш колата някъде и ти." },
    { n: 2, textBg: "На 70-ия метър вдясно е знак В28: паркирането е забранено, но престоят — не. Тук можеш да спреш, за да слезе пътникът, стига да останеш зад волана." },
    { n: 3, textBg: "Спри плътно вдясно, изчакай няколко секунди да слезе, и потегли. Не оставяй колата — престоят свършва в момента, в който я напуснеш (чл. 93)." },
    { n: 4, textBg: "Напред знакът се сменя: на 170-ия метър започва В27. Той забранява и престоя — разрешението на В28 не продължава след него." },
    { n: 5, textBg: "Премини целия участък под В27, без да спираш — нито „за минутка“, нито „почти в края“." },
    { n: 6, textBg: "След 290-ия метър двата знака са зад теб. Подай десен мигач и паркирай плътно вдясно на свободното място." },
  ],
  success: [
    {
      id: "sc-pkb2-dropoff",
      titleBg: "Спри за слизане на пътник под В28 — там престоят е разрешен",
      // Completable ONLY at near-stop speed INSIDE the В28 span (radius 4 m
      // around y = 120, the span's middle). This objective IS the template's
      // thesis: the drill is scored on USING a permission most learners refuse
      // to believe exists, not merely on avoiding a ban.
      params: { kind: "reachZone", x: PKB2_LANE, y: PKB2_DROPOFF_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
    {
      id: "sc-pkb2-past-ban",
      titleBg: "Премини участъка под В27, без да спираш в него",
      // A progress checkpoint on the clear road past the В27 span's end (290).
      params: { kind: "reachZone", x: PKB2_LANE, y: 305, radiusM: 6 },
    },
    {
      id: "sc-pkb2-legal-park",
      titleBg: "Паркирай на разрешеното място след двата знака",
      // Completable ONLY at near-stop speed at the legal mark (the
      // pk-smooth-stop mark discipline) — 40 m past every span.
      params: { kind: "reachZone", x: PKB2_LANE, y: PKB2_BAY_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
  ],
  rubric: { parTimeSec: 85 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scPkStopVsPark.ts; gates in
  // traces/__tests__/sc-pk-stop-vs-park-traces.test.ts (RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-pk-stop-vs-park/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pk-stop-vs-park/mistake-permission-past-seam.trace.json" },
      titleBg: "Пренесох правилото на В28 отвъд знака В27",
      whatWentWrongBg:
        "Водачът прочете В28, разбра го правилно — „престоят тук е разрешен“ — и продължи да го прилага и след 170-ия метър, където знакът вече е друг. Зоната на един забранителен знак свършва при следващото кръстовище или при знака, който я отменя или заменя: В27 не смекчава В28, а го затяга. Пет метра след табелата разрешеният престой стана основна грешка — не защото водачът не е чел, а защото е чел веднъж.",
      codeRefs: ["ILLEGAL_STOP_IN_BAN_ZONE"],
    },
    {
      traceRef: { path: "content/traces/sc-pk-stop-vs-park/mistake-minute-under-v27.trace.json" },
      titleBg: "„Само за минутка“ под В27",
      whatWentWrongBg:
        "По средата на участъка под В27 колата спря — „нали е за секунда, никого не преча“. В27 не прави разлика между престой и паркиране: под него не се спира изобщо. Знакът стои точно там, където спряла кола стеснява платното или крие нещо — затова законът не е оставил вратичка за „минутката“, а изпитът брои престоя в забранена зона като основна грешка.",
      codeRefs: ["ILLEGAL_STOP_IN_BAN_ZONE"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато возиш някого и той казва „остави ме тук“, а улицата е подписана. Двата знака си приличат — червен кръг, син фон — и повечето водачи ги помнят като един („тук не се спира“). Разликата решава дали ще свалиш пътника на място, или ще го свалиш там, където това е основна грешка.",
    whyBg:
      "В28 забранява паркирането — тоест оставянето на колата, — но не и престоя: спирането за качване и слизане на пътник или за товарене, докато си при автомобила (чл. 93). В27 забранява и двете. Разликата не е формална: В28 стои там, където спряла за минута кола не пречи, но оставена за час — пречи; В27 стои там, където всяка спряла кола пречи веднага. Водачът, който помни само „знак — не спирай“, губи място за престой, което законът му дава; водачът, който помни само „нали беше разрешено“, спира под В27. И двете грешки идват от едно: знакът е прочетен веднъж, а зоната му свършва при следващото кръстовище или при следващия знак.",
    lawRef: "ЗДвП чл. 93, чл. 98; Наредба № РД-02-21-1/2023",
    examinerBg:
      "Изпитващият казва „остави ме тук“ и мълчи — изборът на място Е изпитът. Очаква се да разпознаеш кой знак е поставен: под В28 да спреш плътно вдясно, да останеш зад волана и да потеглиш веднага след слизането; под В27 да не спираш и да продължиш до първото разрешено място. Престой в зоната на В27 е основна грешка, независимо колко кратък е. Обратната грешка — да подминеш и разрешеното място под В28 — не се брои като нарушение, но издава водач, който не чете знаците, а само се плаши от тях.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The law-implied-ban parking templates, in catalog order (registered in
 *  templates.ts by the integration pass). */
export const SCENARIO_TEMPLATES_PARKING2: readonly ScenarioSpec[] = [
  SC_PK_CROSSING_BAN,
  SC_PK_BUSSTOP_BAN,
  SC_PK_STOP_VS_PARK,
];
