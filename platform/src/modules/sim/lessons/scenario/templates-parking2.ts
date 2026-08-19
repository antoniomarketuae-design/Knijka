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
 *  - sc-pk-double-park   „Двойното паркиране блокира улицата"  (pk-double-v1,
 *    tools/maps/gen_pk_double.mjs — the one member whose ban is posted by
 *    nothing at all: the parked cars themselves are the sign)
 *  - sc-park-bay-exit-rev „Излизане на заден от перпендикулярно място"
 *    (lot-perp-v1, map REUSED — the ONE member that is not a ban drill at all:
 *    the mirror image of the P0, see its own header block below)
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

import type { OncomingStreamSpec, PedestrianDartOutSpec } from "../../contracts";
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
    { n: 1, textBg: "Потегли по улицата. Задачата е „спри някъде тук за малко“ — но къде точно е позволено, решаваш ти. Ако е тъмно, включи късите светлини: и кръстовището, и пътеката се разпознават само осветени." },
    { n: 2, textBg: "Напред има кръстовище. На него и на по-малко от 5 метра от него престоят е забранен от самия закон (чл. 98) — важи и без табела." },
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
    {
      // L5 „Усложнени" (doc 86 L13 — this template shipped no L5 at all).
      // The rung is the lesson's own argument made visible: чл. 98 т. 1 exists
      // because a car standing at the zebra IS the wall the pedestrian steps
      // out from, and at night with people actually on the pavement that stops
      // being a sentence and becomes the drive. pk-banx-v1 is the ONE district
      // in this file with a `crossings` entry (the others have zero), so it is
      // the only one where an ambient pedestrian count anchors to anything —
      // authored here and nowhere else on purpose (doc 86 L12).
      // The lights duty is stated in instruction 1 (doc 86 L10).
      level: 5,
      conditions: { night: true },
      traffic: { pedestrianCount: 6 },
    },
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
        "Джобът беше празен и колата влезе в него — „нали автобус няма, за секунда е“. Чл. 98, ал. 1 забранява на спирката дори краткия престой: спирката е работното място на автобуса. Зает джоб принуждава автобуса да спре на платното, а пътниците му — баби, деца, хора с колички — да слизат между движещите се коли. Секундата ти е чужда опасност.",
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
    // NO L5, ON PURPOSE — and lane 15 tried to add one and took it back. The
    // author of this template pinned the reason in s-w2-bot-completion.ts:304:
    // „the fault is a DECISION, not a condition — rain and night would decorate
    // it without teaching it", and he is right. The skill here is recognising
    // that the zigzag zone is bigger than the shelter and that an EMPTY pocket
    // is still occupied; no amount of weather makes that recognition harder in
    // a way the student can act on. Doc 86 L13 asks for rungs that MEAN
    // something, not for five rungs everywhere — a decorative L5 is the dead L5
    // the founder complained about, just with rain on it.
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
    {
      // L5 „Усложнени" (doc 86 L13 — no L5 shipped before; and doc 86 L12, „the
      // empty world"). NOT a weather re-skin: the difference between В28 and
      // В27 is what the driver may do with the LANE, and on an empty street
      // that difference costs nothing either way. With traffic actually using
      // the road, the престой under В28 is a lane taken from somebody for the
      // seconds the passenger needs — which is exactly the distinction чл. 93
      // draws and the only thing that makes „престой, не паркиране" feel like a
      // rule rather than a definition. pk-ban2-v1's single edge is class
      // `residential`, so it IS in the lane graph (the `service` lot aisles are
      // not) and ambient vehicles can actually be placed here.
      level: 5,
      traffic: { vehicleCount: 4 },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-pk-double-park — the ban nobody posted: the parked cars ARE the sign
//                     (pk-double-v1)
// ---------------------------------------------------------------------------

/** The single northbound lane center of pk-double-v1 (1+1, perceptual scale). */
const PKD_LANE = 4.06;
/** The oncoming lane center — where the stream lives, 8.12 m over. */
const PKD_ONCOMING = -4.06;
/** |x| of both parked rows (east = the driver's own curb). */
const PKD_ROW_X = 6.8;
/** The parked row: first and last car. */
const PKD_ROW_FROM_Y = 75;
const PKD_ROW_TO_Y = 205;
/** The чл. 98 second-line span — the row ± a bumper's margin. */
const PKD_BAN_FROM_Y = 70;
const PKD_BAN_TO_Y = 210;
/** The ONE free curb bay: 80 m past the row, outside the span. */
const PKD_BAY_Y = 290;
/** Street length (the map's own run-out past the bay). */
const PKD_LENGTH = 360;

/**
 * The oncoming stream (OncomingStreamSpec) — the squeeze, not a conflict.
 *
 * TWO cars southbound at 5 m/s (18 km/h), released on the player's first
 * movement, so from then on their positions are pure functions of time. The
 * crawl is not timidity: 18 km/h is the honest pace of a street whose passage
 * has been narrowed to one car by the people who parked on it, and it is what
 * makes the cars still be HERE, beside the player, while he sits on the second
 * line — the whole visual argument. Car 0 holds at arc 73 (instant-model y 287)
 * so it draws level with a hero stopped at y = 175 around t ≈ 24 s; car 1 holds
 * 20 m behind it (north) and arrives ~4 s later, which is the beat the second
 * demo's contact is fired on.
 *
 * THE GAP CEILING IS REAL, NOT A PREFERENCE. runners.ts holds car i at
 * holdArc − gapsM[i−1], so a gap wider than car 0's own hold arc silently
 * places car 1 off the path's start and the stream collapses into a nose-to-tail
 * pair (the ov-oncoming battery pins the same law as holdArc − gap ≥ 0). Here
 * that ceiling is 73 m, and the authored 20 m sits well under it — but only
 * because the stream crawls: at a 29 km/h cruise, meeting the player this deep
 * into a 360 m street would need a hold arc of ~5 m and leave no room for a
 * second car at all.
 *
 * WHY THE STREAM CANNOT ACQUIT THE REST IT MOTIVATES. leadGapFor (traffic/
 * system.ts) is direction-agnostic: any vehicle ahead within LEAD_CORRIDOR_M
 * (4.0 m lateral) counts as a lead, and a lead within banZoneStopQueueGapM (8 m)
 * makes a rest queue-innocent. The oncoming bank sits 8.12 m over — one full
 * perceptual lane, comfortably outside the corridor — so an approaching car can
 * fill the windscreen and still leave `leadGapM === Infinity`. That margin is
 * the reason this template may stage traffic at all where its siblings could
 * not stage a single bus, and it is pinned in the trace gate.
 */
const PKD_STREAM: OncomingStreamSpec = {
  id: "sc-pkd-stream",
  kind: "oncomingStream",
  libraryEventId: "PK-06",
  actor: {
    pathNodes: ["pkd-n-end", "pkd-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: 73 }, // instant-model y 287
    cruiseSpeedMps: 5,
    colorIndex: 2,
  },
  count: 2,
  gapsM: [20], // car 1 held 20 m behind (north of) the head — under the 73 m ceiling
  releaseKmh: 3,
};

/**
 * „Двойното паркиране блокира улицата" — the FIFTH cue of the чл. 98 detector,
 * and the only one with nothing to read. The other four parking drills all end
 * in an act of READING: pk-ban-v1 a В27 plate, pk-ban2-v1 which of two plates,
 * pk-busstop-v1 the зигзаг, pk-banx-v1 the zebra and the corner. Here the road
 * is bare. No plate, no paint, no geometry — the ban is a RELATION: чл. 98,
 * ал. 1 forbids stopping beside a vehicle already standing at the curb on your
 * side, so the ban exists exactly where other people have already parked, and
 * it evaporates the metre their row ends. The only way to know is to look at
 * the other cars. Source questions q-spirane-i-parkirane-009 („спреш успоредно
 * до вече паркиран автомобил, откъм страната на движението"), -055 („улицата е
 * тясна… заради мястото за преминаване") and -061 („всеки, който те заобикаля,
 * трябва да навлезе в насрещното" — which is this template's second demo,
 * verbatim).
 *
 * WHY ITS OWN MAP (pk-double-v1, tools/maps/gen_pk_double.mjs). The ban's cause
 * has to BE on the map: a second-line span with no row beside it would be an
 * arbitrary forbidden stretch, i.e. exactly the plate-reading drill this
 * template exists to be the opposite of. So the district authors 27 parked cars
 * in `meta.scenario.bays` — the same single truth the parking-lot family uses —
 * and the span [70, 210] is the row and only the row. Occupied bays become
 * PRECISE hittable colliders (ScenarioObstacles in the scene, ObstacleRect2D in
 * the recorder), because they are neighbours, not scenery: the backlog's own
 * note, honoured.
 *
 * WHY BOTH CURBS ARE PARKED. One row makes the double-parker rude; two make the
 * street NARROW, and narrow is what makes чл. 98 lethal rather than pedantic.
 * With both curbs full, the through passage is a single shared lane over the
 * осева — so a car stopped in it does not slow the oncoming, it puts the
 * oncoming into the stopper's half, with the west row denying it anywhere else
 * to be. That is q-spirane-i-parkirane-061 rendered in geometry.
 *
 * WHERE THE DEMOS REST (the §9 stage-5 auto-assert). Both grade
 * ILLEGAL_STOP_IN_BAN_ZONE (основна, чл. 98) inside pkd-z-second-line, at marks
 * that mean different things — and the second one shows the bill:
 *   - „Спиране на втора линия" → y = 130 (mid-row: the excuse, alone);
 *   - „Двойно спиране, което вкарва насрещния в твоята половина" → y = 175
 *     (deep in the row, with the stream arriving) → + COLLISION.
 *
 * HONEST SCOPE — the COLLISION is an AUTHORED consequence, not a geometric one,
 * and the reason is the perceptual road scale. OncomingStreamRunner does emit a
 * real head-on collision, but it needs centre-to-centre < 3 m; the two banks of
 * this „narrow" street sit 8.12 m apart, because PERCEPTUAL_ROAD_SCALE (×2.5)
 * draws a 6.5 m carriageway as 16 m. The squeeze is real in Sofia and not real
 * in the geometry. Faking it would mean narrowing the lanes below the scale
 * every other district uses — so the second demo's contact is instead a scripted
 * narrative beat (the `collision` DriveStep, the same seam the no-observation
 * demos use for „пешеходец зад колата"), fired while the stream is genuinely
 * abreast of the stopped hero. What is NOT authored is the conviction beside it:
 * the чл. 98 rest bills through the real reducer, with the row unable to acquit
 * it (bays are colliders, never traffic) and the oncoming unable to acquit it
 * (8.12 m > the 4 m lead corridor). Both pinned in
 * world/__tests__/pk-double-districts.test.ts.
 *
 * THE CAPABILITY THIS TEMPLATE IS WAITING FOR: a per-district lane-width scale
 * (or a `narrowStreet` flag the runtime honours) would let the two banks close
 * to within VEHICLE_CONTACT_M and make the squeeze grade itself. It lives in
 * shared runtime/spatial code, so it is named here rather than taken.
 */
export const SC_PK_DOUBLE_PARK: ScenarioSpec = {
  id: "sc-pk-double-park",
  family: "parking",
  tagsBg: ["престой", "паркиране", "втора линия", "тясна улица", "насрещно движение", "чл. 98"],
  titleBg: "Двойното паркиране блокира улицата",
  objectiveBg:
    "Не спирай успоредно до вече паркирана кола „само за малко“ — продължи до свободното легално място напред.",
  archetypeIds: ["PK-06"],
  conceptIds: [
    "c-parking-prohibitions",
    "c-stop-parking-definitions",
    "c-stopping-standing-rules",
    "c-oncoming-passing",
  ],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in pk-double-v1.json meta.scenario.params
    // (tools/maps/gen_pk_double.mjs); the district battery asserts the match.
    params: {
      lengthM: PKD_LENGTH,
      maxspeedKmh: 50,
      rowFromM: PKD_ROW_FROM_Y,
      rowToM: PKD_ROW_TO_Y,
      banFromM: PKD_BAN_FROM_Y,
      banToM: PKD_BAN_TO_Y,
      legalBayY: PKD_BAY_Y,
      banKind: "noStopping",
      banBasis: "law",
    },
    districtId: "pk-double-v1",
  },
  start: {
    spawnPointId: "pkd-spawn-start",
    vehicleStart: "ready",
  },
  staged: [PKD_STREAM],
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата. Задачата е „спри някъде тук“ — а улицата напред е паркирана и от двете страни." },
    { n: 2, textBg: "Тук забраната я пишат самите коли — до вече спряла кола откъм страната на движението не се спира (чл. 98, ал. 1), със или без знак." },
    { n: 3, textBg: "Виж колко е останало за минаване: между двете редици има място за ЕДНА кола. Спреш ли, улицата не се стеснява — тя се затваря." },
    { n: 4, textBg: "Насреща идва кола. Тя няма къде да отбие — редицата вляво ѝ е стена, а ти си ѝ пътят." },
    { n: 5, textBg: "Подмини цялата редица, без да спираш до нея — колкото и празно да изглежда платното вляво от теб." },
    { n: 6, textBg: "След редицата, на 290-ия метър, има свободно място до бордюра. Подай десен мигач, влез в него и спри — там колата ти не пречи на никого." },
  ],
  success: [
    {
      id: "sc-pkd-past-row",
      titleBg: "Подмини цялата паркирана редица, без да спираш до нея",
      // A checkpoint on the clear road past the row's end (y = 210).
      params: { kind: "reachZone", x: PKD_LANE, y: 225, radiusM: 6 },
    },
    {
      id: "sc-pkd-legal-park",
      titleBg: "Спри на свободното място до бордюра след редицата",
      // Completable ONLY at near-stop speed AT THE CURB (x = 6.8, not at lane
      // center): the drill's answer is a place where the car stops being an
      // obstacle, and that place is the free bay — 80 m past every чл. 98 metre.
      params: { kind: "reachZone", x: PKD_ROW_X, y: PKD_BAY_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
  ],
  rubric: { parTimeSec: 80 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scPkDoublePark.ts; gates in
  // traces/__tests__/sc-pk-double-park-traces.test.ts (RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-pk-double-park/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pk-double-park/mistake-second-line.trace.json" },
      titleBg: "Спиране на втора линия",
      whatWentWrongBg:
        "Колата спря успоредно до паркираната редица — „за две минути, никого не бавя“. Чл. 98, ал. 1 забранява спирането до вече спряло превозно средство откъм страната на движението, и то без никакъв знак: забраната я поставят другите коли, а не табела. Разликата между теб и тях е, че те са до бордюра, а ти си в платното — и платното е за движение. Двете минути на втора линия не струват две минути на никого: те струват по няколко на всеки, който идва след теб.",
      codeRefs: ["ILLEGAL_STOP_IN_BAN_ZONE"],
    },
    {
      traceRef: { path: "content/traces/sc-pk-double-park/mistake-oncoming-squeeze.trace.json" },
      titleBg: "Двойно спиране, което вкарва насрещния в твоята половина",
      whatWentWrongBg:
        "Водачът спря на втора линия по средата на редицата — там, където между двете паркирани редици остава място точно за една кола. Насрещният нямаше избор: вляво от него е стена от паркирани коли, а единственият проход минава през твоята половина. Затова спрялата на втора линия кола не „забавя“ движението — тя го изтласква в насрещното, и следващият, който заобикаля, го прави сляпо. Ти не си там, за да видиш какво става после: това е разликата между пречка и опасност.",
      codeRefs: ["ILLEGAL_STOP_IN_BAN_ZONE", "COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки ден, на всяка тясна улица в квартала: мястото го няма, бързаш „за две минути“, а вдясно вече стои цяла редица коли, която сякаш ти казва, че тук се спира. Точно обратното е: редицата е знакът, че тук вече НЕ се спира. Забраната по чл. 98 не е поставена с табела — поставили са я хората, които са паркирали преди теб.",
    whyBg:
      "Паркиралите до бордюра са извън платното; ти, спрял до тях, си В платното — и на тясна улица платното е точно колкото една кола. Затова двойното паркиране не забавя движението, а го измества: всеки, който те заобикаля, влиза в насрещната лента, при това сляпо, защото твоята кола му крие какво идва. Насрещният, от своя страна, няма къде да отбие — вляво от него е втората редица. Така „само за малко“ превръща една улица в едно платно, по което две коли се разминават на доверие. Същата логика важи и за пожарната, и за линейката: те не могат да те заобиколят, а спрелият на втора линия почти никога не е в колата си. Затова изпитът брои престоя в забранена зона като основна грешка — не заради глобата, а защото мястото, което си взел, не е било твое.",
    lawRef: "ЗДвП чл. 98, ал. 1",
    examinerBg:
      "Изпитващият казва „спри някъде тук“ и мълчи — изборът на място Е изпитът. Спиране или паркиране до вече спряло пътно превозно средство откъм страната на движението е основна грешка, независимо колко кратко е и колко „широко изглежда“ платното. Очаква се да прочетеш заетия бордюр като забрана, да подминеш цялата редица без да намаляваш до нея, да подадеш десен мигач и да спреш плътно вдясно на първото свободно място след нея. Оправданието „щях да тръгна веднага“ не се приема: чл. 98 не брои минути.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    {
      // L5 „Усложнени" (doc 86 L13 — no L5 shipped before; and doc 86 L12,
      // „the empty world"). This drill's entire claim is „спреш ли, улицата не
      // се стеснява — тя се затваря", and until now the only vehicle that ever
      // proved it was the single staged oncoming stream. At L5 the street is
      // actually used: ambient cars in both directions, so the one-car gap
      // between the two parked rows is a queue the student is standing in
      // rather than a sentence in the briefing. pk-double-v1's edge is class
      // `residential` — in the lane graph, unlike the `service` lot aisles —
      // so this is the one complication this map can honestly carry.
      level: 5,
      traffic: { vehicleCount: 4 },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-park-bay-exit-rev — „Излизане на заден от перпендикулярно място"
//    (doc 72 PK-02/PK-11/PK-05) on lot-perp-v1 — the map REUSED, untouched
// ---------------------------------------------------------------------------

/**
 * WHY THIS TEMPLATE IS NOT sc-park-perp-rev BACKWARDS. The P0 teaches getting
 * IN: the bay is the target, the aisle is the workshop, and the only traffic is
 * the geometry. This one starts where the P0 ends — parked nose-in, boxed by an
 * occupied bay on each side — and teaches getting OUT, which is the half of the
 * maneuver that actually hurts people. The driver reversing INTO a bay is
 * looking at the thing he is aiming for; the driver reversing OUT of one is
 * aiming at everything he cannot see. Чл. 40 is written for exactly this
 * direction: убеди се, че пътят зад теб е свободен, ПРЕДИ да потеглиш.
 *
 * SAME DISTRICT, MIRRORED POSE. `map.reuse` — not one byte of
 * content/world/lot-perp-v1.json is touched. The start is an explicit POSE
 * instead of a spawn point (ScenarioStart.position, the one seam that lets a
 * template begin somewhere the generator never authored a spawn): the centre of
 * lot-bay-3 (5.03, 0) facing 90° — nose east, deep in the bay, exactly where
 * the P0's shadow does NOT end (it reverses in and rests nose-out). The two
 * templates are therefore the two halves of one bay, never the same drive.
 *
 * THE GRADED CONTRACT IS A CORRIDOR, NOT A BAY. parkInBay grades a rect you
 * come to rest in; there is no such rect here — the whole point is leaving one.
 * So the success pair is two reachZone gates that bracket the maneuver:
 *   - sc-pbe-out   — the aisle exit point (1.0, −3.03), armed at maxSpeedKmh 8:
 *     the ONLY way through it is at пешеходна скорост, in the arc;
 *   - sc-pbe-away  — the checkpoint up the aisle (0, 20), past the whole row.
 * Consequently the rubric carries NO placement/economy component (both read the
 * parkInBay detail channel and would score `measured: false` — a silent lie);
 * observation + par time are the honest channels, and the star fold falls back
 * to official cleanliness, which is what a corridor drill actually measures.
 *
 * THE STAGED WALKER, AND WHY SHE CROSSES WHERE SHE DOES. The taught fault is
 * blind reversing, and the live encounter that punishes it must be able to FIRE:
 * PedestrianDartOutRunner only triggers on a player who is `approaching` the
 * crossing point (±80° of heading) at/above minTriggerSpeedKmh. A walker staged
 * BEHIND the reversing car is unreachable by that test — reverse keeps the car's
 * heading pointed INTO the bay while it travels the other way. So the staged
 * walker crosses the aisle at (1.0, 10), on the drive-away leg, and
 * minTriggerSpeedKmh 7 puts her strictly above the 4 km/h reverse: she can only
 * ever fire on the forward leg, never mid-arc. The person BEHIND the car — the
 * one чл. 40 is about — is where she belongs: in the mistake demo, where she is
 * demonstrated and never practised (doc 76 §0).
 * Her `crossingId` names no zone in lot-perp-v1 (a lot has no zebras, and the
 * district battery pins crossings.length === 0). That is deliberate and it costs
 * nothing: the id is only the traffic system's occupancy key, so the
 * PEDESTRIAN_NOT_YIELDED path stays dark and the encounter grades on CONTACT
 * alone — which is the honest reading. Nobody has right of way on a zebra that
 * does not exist; a person in a parking aisle simply must not be hit.
 *
 * HONEST SCOPE — the L5 the backlog asked for. The brief's L5 is „a car rolls
 * down the aisle mid-maneuver — pause, let it pass, resume". It cannot be built
 * on this district today: lot-e-aisle is class "service", and
 * DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses keeps service edges OUT of the lane
 * graph (lot-perp-district.test.ts pins graph.lanes.length === 2 — the approach
 * road only). Every staged VEHICLE resolves its path through that graph
 * (resolveStagedVehiclePath), so no car can be put on the aisle at all; a staged
 * vehicle authored there fails to stage and throws. Rather than fake it, L5
 * escalates on the axes this map does support: night (a lot after closing —
 * mirrors carry less, the reverse lights are the whole story) plus a SECOND
 * walker who steps out later and closer than the L1–L4 one. The aisle car is
 * named as a capability need, not taken: it wants either a `service` edge opted
 * into the lane graph per-district, or a free-path staged vehicle (the
 * pedestrian seam already has one).
 *
 * THE SWING-OUT CONTACT IS SCRIPTED, AND SAYS SO. „Изнасяне със замах в минаваща
 * кола" needs a car moving down the aisle — the same thing L5 cannot stage. The
 * demo therefore fires the contact through the `collision` DriveStep (the
 * authored-consequence seam the P0's own „пешеходец зад колата" demo uses), at
 * the frame the tail is genuinely across the aisle lane. What is NOT authored is
 * the grading: the COLLISION bills through the real reducer at
 * collisionMinKmh 0, and the arc it is fired from is the same one the shadow
 * proves clean — so the ONLY difference between the demo and the shadow is the
 * two missing pauses and the missing look. That is the lesson, and it is real.
 *
 * Family: "parking" — the doc-76 §2 chip; the id (sc-park-*) matches the P0's
 * sc-park-<slug> form, since this is the P0's other half.
 */

/** Target bay lot-bay-3's centre — the START pose of this drill (the P0's
 *  finish). Pinned from content/world/lot-perp-v1.json meta.scenario.bays. */
const LOT_BAY_X = 5.03;
const LOT_BAY_Y = 0;
/** Nose-in heading: the bay axis (headingDeg 90), nose pointing east, deep. */
const LOT_BAY_NOSE_DEG = 90;
/** The aisle exit point the reverse arc lands on — see traces/scParkBayExitRev
 *  (straight back to x = 4.03, then a quarter arc of radius 3.03). Kept in the
 *  lane-detector-safe band: |x − 4.0625| = 3.06 < 3.25 (the P0's envelope note). */
const LOT_EXIT_X = 1.0;
const LOT_EXIT_Y = -3.03;
/** The staged walker's aisle crossing point (no zebra exists — see the header). */
const LOT_WALK_Y = 10;

/** L1–L4: the walker who crosses the aisle on the drive-away leg. */
const PBE_WALKER: PedestrianDartOutSpec = {
  id: "pbe-aisle-walker",
  kind: "pedestrianDartOut",
  libraryEventId: "ev-uturn-reverse",
  // Names no district zone by design (lot-perp-v1 has no crossings): the id is
  // the occupancy key only, so this encounter grades on contact alone.
  crossingId: "lot-aisle-walk",
  crossing: { x: LOT_EXIT_X, y: LOT_WALK_Y },
  start: { x: -4.2, y: LOT_WALK_Y },
  dir: { x: 1, y: 0 },
  speedMps: 1.3,
  travelM: 8.4,
  roadFromM: 1.2,
  roadToM: 7.2,
  // Range 9..15 m after the runner's ±3 m seeded jitter — she arms on the
  // drive-away leg from its first metres.
  triggerDistM: 12,
  // ABOVE the 4 km/h reverse and BELOW the 9 km/h drive-away: the one dial that
  // keeps her out of the arc, where the runner's `approaching` test cannot see
  // a reversing car anyway.
  minTriggerSpeedKmh: 7,
};

/** L5 only: the second walker — later, closer, in the dark. */
const PBE_WALKER_LATE: PedestrianDartOutSpec = {
  id: "pbe-aisle-walker-late",
  kind: "pedestrianDartOut",
  libraryEventId: "ev-uturn-reverse",
  crossingId: "lot-aisle-walk-late",
  crossing: { x: LOT_EXIT_X, y: 16 },
  start: { x: 4.6, y: 16 },
  dir: { x: -1, y: 0 },
  speedMps: 1.5,
  travelM: 8.8,
  roadFromM: 1.4,
  roadToM: 7.4,
  // Tighter than the first walker's 12: she appears with less road left.
  triggerDistM: 8,
  minTriggerSpeedKmh: 7,
};

/**
 * PK-02 mirrored (перпендикулярно място — the exit half), PK-11 (заден ход с
 * пълно наблюдение и спиране за участници) and PK-05 (потеглянето от място е
 * маневра и започва с оглеждане). Law: ЗДвП чл. 40 (движение назад — водачът е
 * длъжен да се убеди, че пътят зад него е свободен и да пропусне останалите
 * участници), the same ref content/concepts.json c-reversing cites.
 */
export const SC_PARK_BAY_EXIT_REV: ScenarioSpec = {
  id: "sc-park-bay-exit-rev",
  family: "parking",
  tagsBg: ["паркиране", "заден ход", "излизане от място", "перпендикулярно", "чл. 40", "изпитни упражнения"],
  titleBg: "Излизане на заден от перпендикулярно място",
  objectiveBg:
    "Две задачи, в този ред: първо излез на заден ход от заетото отвсякъде място с пешеходна скорост — оглед през рамо ПРЕДИ включване и спиране при всяко движение зад теб; после се подравни по алеята и я напусни напред, пропускайки всеки пешеходец.",
  // Doc-72 provenance: PK-02 owns the bay geometry and the swing-out, PK-11 the
  // reverse-with-observation discipline, PK-05 the „потеглянето е маневра" duty.
  archetypeIds: ["PK-02", "PK-11", "PK-05"],
  conceptIds: ["c-reversing", "c-maneuver-principles", "c-mirrors-blind-spots"],
  map: {
    archetype: "parking-lot",
    // The P0's generator recipe verbatim — the map is REUSED, not regenerated
    // (tools/maps/gen_parking_lot.mjs; mirrored in lot-perp-v1.json
    // meta.scenario.params, asserted by world/__tests__/lot-exit-districts).
    params: {
      bays: 5,
      bayWidthM: 2.7,
      bayDepthM: 5,
      angle: "90",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
    },
    districtId: "lot-perp-v1",
  },
  start: {
    // An explicit POSE, not a spawn point: the generator authored no spawn
    // inside a bay, and the whole drill starts there (lot-bay-3's centre,
    // nose-in on the bay axis). The district battery pins the pose inside the
    // bay rect and clear of both neighbours.
    position: { x: LOT_BAY_X, y: LOT_BAY_Y },
    headingDeg: LOT_BAY_NOSE_DEG,
    vehicleStart: "ready",
  },
  staged: [PBE_WALKER],
  instructionsBg: [
    { n: 1, textBg: "Колата е паркирана с предницата навътре, а вляво и вдясно има коли. Нищо зад теб не се вижда от седалката — затова оглеждането е ПРЕДИ включването на задната, не след него. Ако паркингът е тъмен, първо включи късите светлини: те не ти показват какво е зад теб, но показват теб на всеки, който минава по алеята." },
    { n: 2, textBg: "Двете огледала, после поглед през ДЯСНОТО рамо и през задното стъкло. Чак когато си сигурен, че алеята зад теб е чиста, включи задна." },
    { n: 3, textBg: "Излез бавно НАЗАД около метър, без да завърташ волана — така предницата още не подрязва съседа." },
    { n: 4, textBg: "Чак когато задницата е в алеята, завърти волана и изнеси плавно, с пешеходна скорост — не повече от 4-5 км/ч." },
    { n: 5, textBg: "Спри при всяко движение зад теб и се огледай отново. Двете спирания по време на маневрата не са загубено време — те са маневрата." },
    { n: 6, textBg: "Изправи волана в алеята, погледни по нея в двете посоки и чак тогава потегли напред. Пропусни всеки пешеходец — в паркинга хората вървят по платното." },
  ],
  success: [
    {
      id: "sc-pbe-out",
      titleBg: "Задача 1: излез от мястото на заден ход, с пешеходна скорост",
      // The corridor gate (NOT parkInBay — see the header): the aisle exit
      // point the arc lands on, armed at walking speed. Coordinates pinned to
      // content/world/lot-perp-v1.json like every lesson pins its district.
      params: { kind: "reachZone", x: LOT_EXIT_X, y: LOT_EXIT_Y, radiusM: 2.5, maxSpeedKmh: 8 },
    },
    {
      id: "sc-pbe-away",
      titleBg: "Задача 2: подравни се по алеята и напусни зоната напред",
      // Past the whole bay row (bays span y ∈ [−5.4, 5.4]) and past the staged
      // walker's crossing (y = 10) — the checkpoint completes at y ≈ 14, so the
      // encounter can never be skipped by finishing early.
      params: { kind: "reachZone", x: 0, y: 20, radiusM: 6, maxSpeedKmh: 20 },
    },
  ],
  rubric: {
    // No placement/economy: both read the parkInBay detail channel this drill
    // never produces (the header's corridor note) — a component that cannot
    // measure must not pretend to.
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и през рамо ПРЕДИ включване на задна" },
        { id: "obs-during-reverse", titleBg: "Оглед назад при всяко спиране по време на маневрата" },
        { id: "obs-before-moveoff", titleBg: "Поглед по алеята в двете посоки преди потегляне напред" },
      ],
    },
    parTimeSec: 75,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scParkBayExitRev.ts; the §5 gate (shadow replays with ZERO
  // violations, parked-car obstacles armed at collisionMinKmh 0) and the §9
  // stage-5 code asserts run in
  // traces/__tests__/sc-park-bay-exit-rev-traces.test.ts (RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-park-bay-exit-rev/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-park-bay-exit-rev/mistake-blind-reverse.trace.json" },
      titleBg: "Заден ход без оглед — пешеходец зад колата",
      whatWentWrongBg:
        "Задната предавка влезе веднага — без огледала, без рамо. Между двете съседни коли се вижда точно нищо, а зад колата вървеше човек: от седалката той не е бил невидим случайно, а по устройство. Чл. 40 не иска от теб да внимаваш, докато излизаш — иска да си се убедил, че пътят зад теб е свободен, ПРЕДИ да потеглиш назад. И понеже дори одраскването е ПТП, това тук не е „контакт на паркинга“ — това е пътнотранспортно произшествие с пострадал пешеходец, със спиране на място и повикване на органите. Единственото, което щеше да го предотврати, са двете секунди преди задната.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-park-bay-exit-rev/mistake-swing-out.trace.json" },
      titleBg: "Изнасяне със замах в минаваща кола",
      whatWentWrongBg:
        "Същата дъга като на правилната маневра — но изкарана наведнъж, без нито едно спиране и без нито един поглед назад. По алеята минаваше кола; докато задницата излизаше, тя вече беше отстрани и нямаше как да спре. Заден ход от място между коли се прави на части точно заради това: спираш, поглеждаш, продължаваш — защото излизащият назад е този, който трябва да пропусне, а не минаващият по алеята. „Замахът“ не печели секунди: той просто маха проверките, при които щеше да я видиш. И тук ламарината пак е ПТП — с попълване на протокол и с виновен, който е излязъл, без да пропусне.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато си паркирал с предницата навътре — пред мола, пред блока, на служебния паркинг. Влизането е избор; излизането не е: рано или късно трябва да излезеш назад между две коли, които крият всичко. Именно затова обратното паркиране е по-безопасно — то мести този момент в началото, когато алеята е още пред очите ти.",
    whyBg:
      "Излизането на заден от място между коли е ситуацията с най-лошата видимост, която един водач изпълнява доброволно. Съседните коли режат цялата картина настрани, огледалата не показват алеята, докато задницата не е вече в нея, а точно по алеята вървят хора — деца до количките, човек с торби, някой между колите. Затова законът обръща тежестта: при движение назад НИЕ пропускаме всички. Оттам идват и трите неща, които маневрата изисква — оглед преди включването, пешеходна скорост (за да можеш да спреш в рамките на видяното) и спиране при всяко движение зад теб. Дори леко закачане тук е пътнотранспортно произшествие по определение, а не „нищо работа“: с него идват задължението да спреш, да обозначиш и да не местиш колата. Никой не излиза бавно, защото се страхува — излиза бавно, защото не вижда.",
    lawRef: "ЗДвП чл. 40",
    examinerBg:
      "Изпитващият гледа реда, не резултата: оглеждане ПРЕДИ да влезе задната (огледала + през рамо, не само камерата), скорост на пешеходец през цялата маневра, прекъсване и нов оглед при всяко движение зад колата, и подравняване в алеята преди потеглянето напред. Заден ход без предварителен оглед е основна грешка дори когато нищо не се случи — оценява се убеждаването, а не късметът.",
  },
  levels: [
    {
      level: 1,
      // Пълна помощ: the ladder's full aid set + shadow (compile defaults).
    },
    {
      level: 2,
      // Частична помощ: ribbon + idle hints (ladder defaults).
    },
    {
      level: 3,
      // Самостоятелно: no aids, evaluator defaults.
    },
    {
      level: 4,
      // Изпитни условия: examMode (ladder) + the full cold-start protocol —
      // on the exam the car is standing and switched off in the bay.
      vehicleStart: "cold",
    },
    {
      level: 5,
      // Усложнени: the lot after dark + a second walker, later and closer.
      // NOT the backlog's aisle car — see the header's honest-scope note.
      conditions: { night: true },
      stagedAdd: [PBE_WALKER_LATE],
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-mv-uturn-ban — „Къде обратният завой е забранен" (wave 6; doc 72 OV-17
// „Обратен завой" / PK-12 „Обръщане"; ЗДвП чл. 38) on the purpose-built
// mv-uturn-v1 boulevard (tools/maps/gen_mv_uturn.mjs).
//
// WHY THIS IS NOT sc-maneuver-uturn AGAIN. The shipped OV-17 template teaches
// the ARC: wb-boulevard-v1 is 200 m of empty boulevard with nothing on it, so
// every metre of it is a legal place to turn and the whole drill is vehicle
// control. This one keeps that arc — the SAME shipped threePointTurn evaluator,
// the same „в едно движение" contract — and puts it at the END of a decision.
// The first 220 m carry an М1 непрекъсната осева + a В23 posting: the boulevard
// is wide, the car would fit, and the turn is banned. 150 m on the median opens
// at a cross street and the identical maneuver is lawful. Nothing about the
// maneuver changed; the READING is the lesson (source questions q-manevri-020 /
// -021 / -052 / -053, q-osnovni-026).
//
// THE TWO DEMOS ARE THE TWO HALVES OF чл. 38, and they fail differently on
// purpose: „Обръщане през плътната линия" grades EXACTLY CROSSED_SOLID_LINE
// (опасна) — the WHERE; „Обратен завой пред насрещния поток" grades
// FAILED_TO_YIELD + COLLISION at the LAWFUL gap — the WHEN. A student who reads
// only the first learns to drive to the opening and turn into a moving car.
// ---------------------------------------------------------------------------

/** Northbound OUTER (curb) lane centre of mv-uturn-v1 (2+2, perceptual scale). */
const MVU_LANE_OUT = 12.19;
/** Northbound INNER lane centre — обръщането се започва от лентата до осевата. */
const MVU_LANE_IN = 4.06;
/** The tempting-but-banned spot (mv-uturn-v1 meta.scenario.temptingSpotY). */
const MVU_TEMPTING_Y = 130;
/** The legal median gap = the cross-street junction node (…legalGapY). */
const MVU_GAP_Y = 280;

/**
 * The deterministic ONCOMING STREAM of sc-mv-uturn-ban: three cars southbound
 * at 8 m/s (~29 km/h — urban boulevard flow), released together on the player's
 * first movement, so their positions are pure functions of the session clock and
 * the drive scripts are authored against them (the sc-ov-oncoming-gap recipe).
 * The runner emits NOTHING but a contact; the runtime's JU-10 left-turn tracker
 * does all the grading, reading these cars through the same
 * TrafficSystem.oncomingNear query ambient traffic rides.
 *
 * WHY extraRightOffsetM PUTS THE STREAM IN THE INNER LANE — the load-bearing
 * dial of this template, and not a styling choice. The traffic lane graph parks
 * every actor in the CURB lane of its direction (traffic/graph.laneOffsetFor:
 * (perDir − 0.5) × laneWidth = x = −12.19 here). The JU-10 tracker measures its
 * gap from the JUNCTION NODE (0, 280), so a car 12.19 m off that axis carries a
 * permanent lateral term: gapSec = dist²/(d·v) bottoms out at 2·12.19/8 = 3.05 s
 * — ABOVE the 2.0 s convict bar, at every speed and every distance. On the curb
 * lane the тежката грешка of this drill is structurally ungradable. Shifted
 * 8.125 m back toward the осева (the negative = leftward offset), the same
 * arithmetic bottoms out at 1.02 s and the tight band is a real 1.7 s window.
 * It is also the truer picture: the lane a U-turn crosses FIRST, and the one
 * whose driver has no room to swerve, is the one against the centre line.
 *
 * The authored arrivals, in INSTANT-CRUISE terms (a released car accelerates at
 * the staged default 2.6 m/s², losing v²/2a ≈ 12.3 m against an instant-cruise
 * clock at 8 m/s — the holds sit 12.3 m further back so that, once at cruise,
 * each car tracks y = Y − 8·t exactly; release lands at t ≈ 0.37 s, when the
 * player first rolls). The path runs mvu-n-end → mvu-n-gap → mvu-n-start, so
 * hold arc s ⇒ y = 620 − s:
 *  - car 0, hold s 160 (y 460, instant-model Y 472.3): reaches the gap at
 *    t ≈ 24 s — just as the shadow arrives. It is the car the patient driver
 *    lets go and the impatient one thinks was the only one;
 *  - car 1, +40 m (5 s of headway): the one that makes „чисто е" a guess;
 *  - car 2, +80 m: the car the mistake demo turns in front of, and the reason
 *    the shadow does not move for another ten seconds. That wait IS the drill.
 */
const MVU_STREAM: OncomingStreamSpec = {
  id: "sc-mvu-stream",
  kind: "oncomingStream",
  libraryEventId: "ev-uturn-reverse",
  actor: {
    pathNodes: ["mvu-n-end", "mvu-n-gap", "mvu-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: 160 }, // y 460 → instant-model Y 472.3
    cruiseSpeedMps: 8,
    // −8.125 m of the graph's own curb offset = the INNER oncoming lane
    // (x = −4.06). See the block above: without it the JU-10 gap can never
    // reach the convict band and mistake #2 grades nothing.
    extraRightOffsetM: -8.125,
    colorIndex: 1,
  },
  count: 3,
  gapsM: [40, 80], // car i's EXTRA hold arc vs car 0 → 5 s / 10 s of headway
  releaseKmh: 3,
};

/**
 * OV-17 / PK-12 — „Къде обратният завой е забранен" (ЗДвП чл. 38: обратен завой
 * се извършва там, където не е забранен и водачът има видимост; Наредба
 * № 2/2001 М1: непрекъснатата осева не се пресича — вж. и знак В23 „Забранено е
 * завиването в обратна посока", Наредба № РД-02-21-1/2023, прил. № 3).
 */
export const SC_MV_UTURN_BAN: ScenarioSpec = {
  id: "sc-mv-uturn-ban",
  family: "parking",
  tagsBg: [
    "обратен завой",
    "забрана",
    "плътна осева",
    "плътна осева М1",
    "широк булевард",
    "изпитни упражнения",
  ],
  titleBg: "Къде обратният завой е забранен",
  objectiveBg:
    "Разчети мястото: плътната осева значи НЕ — продължи до разрешения участък, където тя се прекъсва, и обърни там с пълен оглед.",
  archetypeIds: ["OV-17", "PK-12"],
  conceptIds: [
    "c-u-turn",
    "c-prohibition-signs",
    "c-longitudinal-markings",
    "c-left-turn-oncoming",
    "c-mirrors-blind-spots",
  ],
  map: {
    archetype: "straight-street",
    // Mirrored in mv-uturn-v1.json meta.scenario.params (tools/maps/gen_mv_uturn.mjs).
    params: { lengthM: 620, maxspeedKmh: 50, lanes: 4, banFromM: 40, banToM: 220, gapY: MVU_GAP_Y },
    districtId: "mv-uturn-v1",
  },
  start: {
    spawnPointId: "mvu-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // THE В23 THAT IS DECLARED AND NEVER BUILT (sweep161 sc-mv-uturn-ban).
    // MEASURED: mv-uturn-v1's `meta.scenario.uturnBanSign` really does author
    // { signRef: "В23", atY: 40, spanY: 40→220, graded: false } — and
    // `grep -rn uturnBanSign src/` returns NOTHING outside tests. The only
    // builder that posts signs from map data is world/builders/zoneSigns.ts and
    // it reads `district.zones`; this district's single zone is
    // { kind: "solidCenterLine", signRef: "М1" }, which `ZONE_SIGN_KIND` does
    // not list because it is marking-only. So no post ever stands at y = 40.
    //
    // WHAT IS REAL IS THE LINE. markings.ts draws the М1 solid centre line over
    // 40→220 m, the student can see it, and the `graded: false` on the sign
    // says out loud that the ban is enforced off the MARKING, not off a post.
    // The lesson is unchanged in substance — „плътна осева значи НЕ" is the
    // whole чл. 63 skill — it simply stops asking him to read furniture that
    // is not there.
    //
    // Routed: zoneSigns.ts should post `meta.scenario.uturnBanSign` (world
    // lane). On the day it does, this copy earns the sign back.
    {
      n: 1,
      textBg:
        "Тръгни по булеварда в дясната лента. Още от 40-ия метър осевата линия е ПЛЪТНА — а плътната осева сама по себе си забранява обратния завой.",
    },
    {
      n: 2,
      textBg:
        "На 130-ия метър платното е широко и празно — изглежда идеално за обръщане. Не е: плътната осева не се пресича, а тя е още под теб. Подмини я.",
    },
    {
      n: 3,
      textBg:
        "От 220-ия метър маркировката се прекъсва — това е първият знак, че забраната свършва. Огледай се, включи ляв мигач и премини във вътрешната лента, до осевата.",
    },
    {
      n: 4,
      textBg:
        "На 280-ия метър разделителната ивица се отваря при страничната улица — тук обръщането е разрешено. Спри и се убеди, че насрещните са преминали: широчината не е предимство.",
    },
    {
      n: 5,
      textBg:
        "Когато потокът мине, завърти волана наляво и опиши ЕДНА плавна дъга с пешеходна скорост през насрещните ленти. Изправи волана в дясната лента на обратната посока и спри.",
    },
  ],
  success: [
    {
      id: "sc-mvu-pass-ban",
      titleBg: "Подмини забраненото място и стигни до разрешения отвор",
      // The gate that IS the lesson: the inner lane, PAST the М1 span, at
      // approach speed. It is unreachable by anyone who turned at y = 130 —
      // objectives advance sequentially, so „обърнах по-рано" completes nothing.
      params: { kind: "reachZone", x: MVU_LANE_IN, y: 250, radiusM: 6, maxSpeedKmh: 40 },
    },
    {
      id: "sc-mvu-turn",
      titleBg: "Обърни посоката на 180° в отвора, след като потокът мине",
      // Corridor-locked threePointTurn (Наредба-38), the sc-maneuver-uturn
      // contract verbatim: reversed travel direction, at rest inside the turn
      // box facing back. On this WIDE boulevard the reversal is a single
      // forward arc — the evaluator reports movements = 1. halfLengthM 20 is
      // the map's own uturnCorridor (meta.scenario): an arc launched from a
      // standstill in the inner lane exits ~16 m short of the node.
      params: {
        kind: "completeManeuver",
        maneuver: "threePointTurn",
        corridor: { x: 0, y: MVU_GAP_Y, halfWidthM: 15, halfLengthM: 20 },
        startHeadingDeg: 0,
        toleranceDeg: 20,
        holdSec: 0.6,
      },
    },
  ],
  rubric: {
    // Economy = direction-change movements. A clean single-arc U-turn on a wide
    // boulevard is ONE movement (no reverse shunt); two is still acceptable.
    // No placement channel (threePointTurn publishes no parkInBay detail).
    economy: { objectiveId: "sc-mvu-turn", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    parTimeSec: 60,
  },
  // RECORDED: committed deterministic recordings of traces/scMvUturnBan.ts; the
  // §5 gate (shadow replays ZERO violations, passes the ban, waits the stream
  // out and completes the turn in ONE movement) and the §9 stage-5 code asserts
  // run in traces/__tests__/sc-mv-uturn-ban-traces.test.ts (RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-mv-uturn-ban/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-mv-uturn-ban/mistake-cross-solid.trace.json" },
      titleBg: "Обръщане през плътната линия",
      whatWentWrongBg:
        "Мястото беше широко и празно — и точно затова изглеждаше разрешено. Не беше: осевата линия е непрекъсната (М1), а непрекъснатата осева не се пресича по никаква причина, включително за обръщане. Широчината на платното не отменя маркировката — тя само те кара да мислиш, че ще успееш.",
      codeRefs: ["CROSSED_SOLID_LINE"],
    },
    {
      traceRef: { path: "content/traces/sc-mv-uturn-ban/mistake-into-stream.trace.json" },
      titleBg: "Обратен завой пред насрещния поток",
      whatWentWrongBg:
        "Мястото беше правилно — моментът не. След първата кола водачът реши, че е чисто, и тръгна пред втората. Обръщането пресича и двете насрещни ленти и отнема секунди, в които не можеш да спреш и не можеш да се върнеш: пропускаш ЦЕЛИЯ поток, не първата кола. „Разрешено“ казва къде, не кога.",
      codeRefs: ["FAILED_TO_YIELD", "COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Винаги, когато ти трябва обратна посока в града. Обратният завой не се прави „където има място“, а където законът го позволява: не се пресича непрекъсната осева, не се обръща под знак В23, на кръстовище със знак В23, на магистрала, на мост, в тунел или при видимост под 100 м.",
    whyBg:
      "Обръщането е най-бавната маневра, която пресича насрещното движение — колата стои напряко на платното секунди наред. Затова забраните стоят точно там, където няма как да те видят навреме или няма как да те заобиколят. Плътната осева и знакът не са формалност: те казват „тук ще те ударят“. Който ги прочете и потърпи 150 метра, прави същата маневра на място, където тя е безопасна.",
    lawRef: "ЗДвП чл. 38",
    examinerBg:
      "Изпитващият гледа: прочете ли маркировката и знака и подмина ли забраненото място без колебание; избра ли вътрешната лента с мигач и оглеждане; спря ли на отвора и пропусна ли ЦЕЛИЯ насрещен поток, а не първата кола; една плавна дъга с пешеходна скорост и обърната посока в дясната лента. Обръщане през плътна осева е опасна грешка и се оценява като такава.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      // Doc 86 D7 — the exam rung grades the movement count tighter: on a road
      // this wide „в едно движение" is the specification, and a shunt across
      // the oncoming lanes is the thing the ban exists to prevent.
      rubric: { economy: { objectiveId: "sc-mvu-turn", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    {
      level: 5,
      // DENSER oncoming — the backlog's own L5 dial. A second stream INTERLEAVED
      // 20 m behind each car of the first (hold 140 vs 160), so arrivals at the
      // gap fall every ~2.5 s instead of every 5: the road is never briefly
      // empty, and the hole the L3 driver turned into no longer exists. The L5
      // delta here is PATIENCE, not grip — no weather and no physics dial
      // (ADR-006 stage 4a: this ghost is dry-tuned, and rain would add a braking
      // story a creep-speed arc cannot honour).
      toleranceScale: 0.8,
      stagedAdd: [
        {
          ...MVU_STREAM,
          id: "sc-mvu-stream-2",
          actor: {
            ...MVU_STREAM.actor,
            hold: { nodeIndex: 0, offsetM: 140 }, // y 480 → 2.5 s behind car 0
            colorIndex: 2,
          },
        } as OncomingStreamSpec,
      ],
    },
  ],
  staged: [MVU_STREAM],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-pk-rail-ban — the ban whose two halves carry DIFFERENT codes: чл. 98 owns
//                  the approach, the rails own themselves (pk-rail-v1)
// ---------------------------------------------------------------------------

/** The single northbound lane center of pk-rail-v1 (1+1, perceptual scale). */
const PKR_LANE = 4.06;
/** Where the чл. 98 ban starts — 50 m before the near rail, with no plate. */
const PKR_BAN_FROM_Y = 150;
/** The authored track band: the six metres чл. 98 does NOT cover (see below). */
const PKR_BAND_FROM_Y = 200;
const PKR_BAND_TO_Y = 206;
/** Where the чл. 98 ban ends — the same reach on the far side. */
const PKR_BAN_TO_Y = 256;
/** The ONE legal stopping mark: 74 m past the whole zone. */
const PKR_BAY_Y = 330;

/**
 * „Никакъв престой около жп прелез" — the SIXTH cue of the чл. 98 detector, and
 * the only one where the ban does not answer to a single code. The other five
 * parking drills all end in one verdict: pk-ban-v1 reads a В27 plate, pk-ban2-v1
 * chooses between two plates, pk-busstop-v1 reads the зигзаг, pk-banx-v1 reads
 * the zebra and the corner, pk-double-v1 reads the other cars. Each of them
 * grades ILLEGAL_STOP_IN_BAN_ZONE and nothing else, because each of them bans a
 * stretch of ordinary street. This one bans a stretch of street WITH SIX METRES
 * OF RAILWAY IN THE MIDDLE OF IT, and those six metres are not the same kind of
 * forbidden as the fifty on either side. Source questions
 * q-spirane-i-parkirane-056 (the zone around the crossing), -011 („забранени,
 * дори когато на мястото няма забранителен знак") and -008 (the чл. 98 family).
 *
 * WHERE THE TWO DETECTORS SPLIT, AND WHY THAT IS THE LESSON. The district
 * (tools/maps/gen_pk_rail.mjs) authors the ban spans up to the near rail and
 * from the far rail on — never over the band:
 *   - y ∈ [150, 200] and [206, 256] → pkr-z-ban-before / pkr-z-ban-after: a rest
 *     is ILLEGAL_STOP_IN_BAN_ZONE (основна), and it is QUEUE-INNOCENT — a lead
 *     within banZoneStopQueueGapM acquits it, because being stuck in traffic
 *     before a crossing is not престой;
 *   - y ∈ [200, 206] → pkr-z-railcrossing: a rest is RAIL_CROSSING_VIOLATION
 *     (опасна, detail "stopped-on-track"), and the queue acquits NOTHING —
 *     engine.ts refuses that exemption by name, because following the column
 *     onto the tracks IS the taught kill.
 * Six metres apart, the same excuse works and then does not. A single ban span
 * laid over the whole stretch would bill one code everywhere and teach that the
 * rails are just more forbidden street. The asymmetry is pinned end-to-end
 * through the real reducer in world/__tests__/pk-rail-districts.test.ts („THE
 * ASYMMETRY: a queue lead acquits the ban rest — and never acquits the rails
 * rest").
 *
 * WHY THE CROSSING IS GUARDED, AND WHY THAT IS NOT A CONVENIENCE. An unguarded
 * crossing (А35) carries чл. 52's MANDATORY full stop before the band — which on
 * this map would land inside pkr-z-ban-before, i.e. the law would order the
 * student to commit the fault the drill grades. Чл. 52 asks no stop of a
 * guarded-open crossing, so here the correct drive really is one unbroken
 * motion and „спрях за малко пред прелеза" really is a choice. The А34 variant
 * is what makes this template authorable at all.
 *
 * WHERE THE DEMOS REST (the §9 stage-5 auto-assert). One per detector — the pair
 * maps the whole forbidden stretch:
 *   - „Престой в зоната пред прелеза" → y = 175, in pkr-z-ban-before →
 *     ILLEGAL_STOP_IN_BAN_ZONE;
 *   - „Спиране върху самата прелезна ивица" → y = 203, mid-band →
 *     RAIL_CROSSING_VIOLATION.
 *
 * HONEST SCOPE — the exact distance is the content bank's OPEN QUESTION, so the
 * copy does not drill it. q-spirane-i-parkirane-056 keys „на самия прелез и на
 * по-малко от 50 метра от двете му страни", but it ships `status: needs-review`
 * with „[REVIEW: потвърди точното разстояние (50 м?)]" and lawRef „чл. 98?". The
 * SUBSTANCE is certain (the zone around a crossing stays clear, both sides, band
 * included) and that is what every card below teaches; the metre count is not,
 * so no instruction, teach card or debrief states one — ADR-002 is retrieval +
 * citation, never free recall, and a number the bank itself flags is not
 * retrieved, it is guessed. The MAP still needs a length, so banReachM = 50
 * mirrors that item's keyed option as data; when review confirms the distance,
 * the generator's one param changes and this template needs no edit.
 *
 * HONEST SCOPE — the barrier never falls, and that is authored, not lucky. The
 * timetable is real data (down [480, 540) of a 600 s cycle) but sits outside the
 * 180 s drill window, because a wait at a lowered barrier inside a ban span is
 * LAWFUL (чл. 93: that is спиране for a traffic reason, not престой) and
 * ILLEGAL_STOP_IN_BAN_ZONE cannot see it — its innocent-context set reads leads,
 * stop lines and signals, never tick.railCrossing/railBarred. A drill that
 * dropped the barrier over the span would convict a student for obeying it. THE
 * CAPABILITY THIS TEMPLATE IS WAITING FOR: `tick.railBarred === true` joining
 * banZoneQueue/banZoneControl in the detector's innocent set (rules/engine.ts —
 * a shared file), which would unlock the drill this one cannot be: „изчакай
 * бариерата, без да се разкараш из зоната". Named here rather than taken; the
 * district battery pins the barrier's real schedule so the day it lands, the map
 * is ready.
 *
 * Family: "parking" — the doc-76 §2 chip; the ban is the subject, the railway is
 * the reason. The rail FAMILY drills (templates-rail/rail2) teach crossing the
 * band; this one teaches not standing near it.
 */
export const SC_PK_RAIL_BAN: ScenarioSpec = {
  id: "sc-pk-rail-ban",
  family: "parking",
  tagsBg: ["престой", "паркиране", "жп прелез", "релси", "бариера", "чл. 98"],
  titleBg: "Никакъв престой около жп прелез",
  objectiveBg:
    "В зоната на жп прелеза не спираш и не паркираш — прелезната ивица трябва да е винаги чиста за колоната и влака.",
  archetypeIds: ["PK-06", "RX-03"],
  conceptIds: [
    "c-parking-prohibitions",
    "c-stop-parking-definitions",
    "c-stopping-standing-rules",
    "c-railway-crossing",
  ],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in pk-rail-v1.json meta.scenario.params
    // (tools/maps/gen_pk_rail.mjs); the district battery asserts the match.
    params: {
      lengthM: 400,
      maxspeedKmh: 50,
      bandFromM: PKR_BAND_FROM_Y,
      bandToM: PKR_BAND_TO_Y,
      banReachM: 50,
      legalBayY: PKR_BAY_Y,
      banKind: "noStopping",
      banBasis: "law",
      guarded: "guarded",
    },
    districtId: "pk-rail-v1",
  },
  start: {
    spawnPointId: "pkr-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата. Задачата е „спри някъде тук за малко“ — но напред е железопътен прелез, а около него правилата са други." },
    { n: 2, textBg: "Забраната започва много преди релсите — тя е в самия закон: около прелеза престоят и паркирането са забранени от двете страни (чл. 98)." },
    { n: 3, textBg: "Прелезът е охраняем (А34) и бариерата е вдигната — не си длъжен да спираш. Не спирай и „за всеки случай“: спрялата тук кола е точно това, което не бива да е тук." },
    { n: 4, textBg: "Премини коловоза на едно движение. Върху релсите не се спира при никакви обстоятелства — там колата ти няма изход." },
    { n: 5, textBg: "След релсите забраната продължава още дълго: „минах прелеза, вече може“ е същата грешка, само от другата страна." },
    { n: 6, textBg: "Чак когато цялата зона е зад теб, подай десен мигач и спри плътно вдясно на свободното място край платното." },
  ],
  success: [
    {
      id: "sc-pkr-cross",
      titleBg: "Премини коловоза на едно движение, без да спираш върху релсите",
      // A checkpoint past the far rail. It cannot be reached by anyone who is
      // still on the band, and the ONLY lawful way to it is a transit — the
      // guarded-open crossing asks no stop (чл. 52), and stopping on it grades.
      params: { kind: "reachZone", x: PKR_LANE, y: 230, radiusM: 6 },
    },
    {
      id: "sc-pkr-past-zone",
      titleBg: "Подмини цялата забранена зона, без престой в нея",
      // The clear road past the run-out ban's end (y = 256): the far side of the
      // whole чл. 98 stretch, where „вече може" finally becomes true.
      params: { kind: "reachZone", x: PKR_LANE, y: 275, radiusM: 6 },
    },
    {
      id: "sc-pkr-legal-stop",
      titleBg: "Спри на разрешеното място далеч след прелеза",
      // Completable ONLY at near-stop speed at the legal mark (the
      // pk-smooth-stop mark discipline) — 74 m past every чл. 98 metre and every
      // rail metre. This gate is the drill's answer: the stop was never
      // forbidden, only the PLACE was.
      params: { kind: "reachZone", x: PKR_LANE, y: PKR_BAY_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
  ],
  rubric: { parTimeSec: 85 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scPkRailBan.ts; gates in
  // traces/__tests__/sc-pk-rail-ban-traces.test.ts (RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-pk-rail-ban/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pk-rail-ban/mistake-stop-before-crossing.trace.json" },
      titleBg: "Престой в зоната пред прелеза",
      whatWentWrongBg:
        "Колата спря на десетина метра пред релсите — „бариерата е вдигната, никого не преча, за секунда е“. Чл. 98 забранява престоя и паркирането около прелеза от двете му страни, и то без никакъв знак. Причината не е формална: спрялата тук кола е стената, зад която не се вижда идващият влак, и е препятствието, което кара следващия да спре точно върху коловоза. Ти си пред релсите, но грешката ти чака зад теб.",
      codeRefs: ["ILLEGAL_STOP_IN_BAN_ZONE"],
    },
    {
      traceRef: { path: "content/traces/sc-pk-rail-ban/mistake-stop-on-rails.trace.json" },
      titleBg: "Спиране върху самата прелезна ивица",
      whatWentWrongBg:
        "Шест метра по-нататък същото решение вече не е нарушение на реда, а въпрос на живот: колата спря между релсите. Тук законът не признава никакво извинение — нито „колоната спря“, нито „само за миг“: на прелеза се влиза само когато отсрещната страна е свободна за ЦЯЛАТА кола. Влакът спира след километър и не завива, а бариерата се спуска за секунди. Разликата между тази грешка и предишната е шест метра — и точно затова изпитът ги оценява различно: престоят пред прелеза е основна грешка, спирането върху него е опасна.",
      codeRefs: ["RAIL_CROSSING_VIOLATION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато прелезът е точно там, където ти трябва: магазинът до него, човекът, който слиза „ей тук“, колоната, която пълзи през релсите в пиков час. Около прелеза няма табела „не спирай“ — има закон, и той важи от двете страни, доста преди и доста след самите релси.",
    whyBg:
      "Прелезът е единственото място по пътя, където другият участник не може да спре и не може да завие. Затова зоната около него трябва да е празна по три причини наведнъж. Първо — видимост: спрялата кола крие идващия влак от всички зад нея, а те решават да минат по това, което виждат. Второ — изход: колоната пред прелеза се движи на пресекулки, и всеки, който е спрял в зоната, отнема на следващия метрите, в които той трябва да спре ПРЕДИ релсите, а не върху тях. Трето — самата ивица: тя не е „по-забранена улица“, тя е капан. Колата върху коловоза няма накъде — назад е следващият, напред е колоната, а бариерата се спуска за секунди. Затова законът пази цялата зона, а не само релсите: който спре до прелеза, обикновено не е този, който плаща.",
    lawRef: "ЗДвП чл. 98",
    examinerBg:
      "Изпитващият казва „спри някъде тук“ и мълчи — изборът на място Е изпитът. Очаква се да разпознаеш зоната на прелеза без знак, да я подминеш без спиране и без колебание, да преминеш коловоза на едно движение (при вдигната бариера охраняемият прелез не изисква спиране) и да спреш чак когато цялата зона е зад теб. Престой в забранената зона около прелеза е основна грешка. Спиране върху самия прелез е опасна грешка и се оценява като такава, независимо от причината — включително „колоната пред мен спря“.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // NO L5, ON PURPOSE — and lane 15 tried to add a fog rung and took it back.
    // The author pinned the reason in s-w7-bot-completion.ts:213: „the
    // difficulty axis here is KNOWING an unmarked zone, not grip or light …
    // night would only hide a crossing whose А34 post does not render yet
    // anyway". Fog would have hidden a sign that is not built — the exact
    // teaches-falsehood shape doc 86 T13/T15 is about. The rung is a capability
    // need (the А34 post), not an authoring gap.
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The parking templates of this file, in catalog order (the array is spread
 *  into SCENARIO_TEMPLATES by templates.ts; the integration pass owns that edit
 *  and the s2-catalog-integrity id list). The first four are the law-implied-ban
 *  set the file was opened for; sc-park-bay-exit-rev is the wave-5 lot-maneuver
 *  member, sc-mv-uturn-ban the wave-6 U-turn-ban member and sc-pk-rail-ban the
 *  wave-7 rail-zone member — same family chip, different subjects (see their
 *  headers). */
export const SCENARIO_TEMPLATES_PARKING2: readonly ScenarioSpec[] = [
  SC_PK_CROSSING_BAN,
  SC_PK_BUSSTOP_BAN,
  SC_PK_STOP_VS_PARK,
  SC_PK_DOUBLE_PARK,
  SC_PARK_BAY_EXIT_REV,
  SC_MV_UTURN_BAN,
  SC_PK_RAIL_BAN,
];
