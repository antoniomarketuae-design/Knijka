/**
 * Scenario templates — the LANE-DISCIPLINE family, wave 2 (doc 72 §14 „Family
 * SN — Signs, markings & road-signal furniture" + §3 JU-14): the lane-ARROW
 * slice, which templates-lanes.ts never reached because no committed map had
 * more than two lanes per direction. DATA ONLY, in the templates.ts mold
 * (coordinates denormalized from the committed district file so nothing loads
 * world JSON at runtime; the batteries assert every pinned value against the
 * generated map):
 *
 *  - sc-ln-turn-lane-arrows  „Лентови стрелки преди кръстовище" (SN-04 + JU-14,
 *                            ln-arrows-v1)
 *  - sc-ov-night-gap         „Изпреварване нощем — преценка по фаровете"
 *                            (OV-05 + AC-04, ov-oncoming-v1 REUSED at NIGHT)
 *  - sc-ov-being-overtaken   „Изпреварват те — не ускорявай" (OV-10 + OV-12,
 *                            ov-oncoming-v1 REUSED by day; wave 3)
 *  - sc-ov-crest-curve       „Забранено изпреварване преди било и завой"
 *                            (OV-06 + OV-05 + SP-05, ov-crest-v1 — the first
 *                            map carrying В24 + А1 spans on one edge; wave 4)
 *  - sc-ov-solid-return      „Прибери се преди плътната линия" (OV-04 + OV-09 +
 *                            SN-03, ov-solid2-v1 — the М2→М1 closing window;
 *                            wave 5)
 *  - sc-ln-boulevard-discipline „Лентова дисциплина на булеварда" (OV-11 +
 *                            OV-02 + OV-12, wb-boulevard-v1 REUSED — the urban
 *                            2+2 with a LEGITIMATE pass in the middle; wave 6)
 *  - sc-ln-obstacle-meeting  „Препятствието е в твоята половина" (OV-18 + OV-14,
 *                            ov-narrow-v1 REUSED — the чл. 44 queue: the second
 *                            oncoming car IS the lesson; wave 7)
 *
 * WHY THE MISTAKES GRADE WHAT THEY GRADE. The lane-intent layer (per-approach-
 * lane allowed movements in district data) is doc 72 N3 work that has NOT
 * landed: no detector reads a painted arrow, so „turned left from the
 * straight-only lane" has no code of its own. This template therefore grades
 * the arrow discipline the honest way:
 *   - SUCCESS is objective-gated — a reachZone of radius 4 m (< the 8.125 m
 *     lane pitch) on the LEFT-arrow lane's center is satisfiable ONLY from that
 *     lane, so the graded contract IS „take the lane your arrow commands";
 *   - the MISTAKE demos grade the act ITSELF (WRONG_LANE_FOR_DIRECTION — the
 *     М10 arrow channel added for audit M-17) plus the faults that always
 *     travel with it and have their own shipped detectors: turning without the
 *     indicator (TURN_WITHOUT_INDICATOR) and dragging the wrong lane through
 *     the exit (POOR_LANE_KEEPING); the late cross-two-lanes swerve grades the
 *     pair the lane-change tracker exists for (LANE_CHANGE_WITHOUT_INDICATOR /
 *     _MIRROR_CHECK).
 * The arrow assignment itself lives in the district's meta.scenario.laneArrows
 * (authored truth the teach cards + instructions read) — when the lane-intent
 * zone kind lands, that block is the migration source and this template gains
 * a dedicated code without any other change.
 *
 * Family: "lanes" — the existing catalog chip (doc 76 §2).
 */

import type {
  BrakingLeadCarSpec,
  NarrowMeetingSpec,
  OncomingStreamSpec,
  RearTailgaterSpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";
import { l5Night } from "./complications";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from ln-arrows-v1 by value — the L7
// pattern; ln-arrows-districts.test.ts asserts the copies match the map)
// ---------------------------------------------------------------------------

/** ln-arrows-v1 northbound lane centers (laneId 0 = curb lane, „само надясно";
 *  laneId 1 = 12.19, „само направо"). Only the LEFT-arrow lane is graded here —
 *  the drive scripts pin the other two. */
const LN_LANE_LEFT = 4.06; // laneId 2 — стрелка „само наляво"
/** ln-arrows-v1 west exit: the westbound lane center of the 1+1 cross street. */
const LN_WEST_LANE_Y = 4.06;

/** SN-04 / JU-14 — движение съобразно стрелките на платното: лентата се заема
 *  предварително, а сгрешена лента се кара докрай по стрелката, не се сменя на
 *  кръстовището (ЗДвП чл. 6; Наредба № 2/2001 — маркировка). */
export const SC_LN_TURN_LANE_ARROWS: ScenarioSpec = {
  id: "sc-ln-turn-lane-arrows",
  family: "lanes",
  tagsBg: ["ленти", "лентови стрелки", "маркировка", "кръстовище", "престрояване"],
  titleBg: "Лентови стрелки преди кръстовище",
  objectiveBg:
    "Заеми предварително лентата, чиято стрелка съответства на посоката ти, и продължи според стрелката, ако си сбъркал лентата.",
  archetypeIds: ["SN-04", "JU-14", "OV-02"],
  conceptIds: ["c-other-markings", "c-junction-approach", "c-lane-choice", "c-lane-change"],
  map: {
    archetype: "x-junction",
    // The generator recipe — mirrored in ln-arrows-v1.json meta.scenario.params
    // (tools/maps/gen_ln_arrows.mjs).
    params: {
      armNorthM: 100,
      armSouthM: 150,
      armEastM: 100,
      armWestM: 170,
      nsLanes: 6,
      ewLanes: 2,
      nsMaxKmh: 50,
      ewMaxKmh: 40,
      arrowsFromM: 120,
    },
    districtId: "ln-arrows-v1",
  },
  start: {
    // The curb lane — the lane whose arrow („само надясно") does NOT match the
    // authored route. The drill starts wrong on purpose.
    spawnPointId: "ln-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по булеварда. Стрелките на платното разпределят посоките: дясна лента — само надясно, средна — само направо, лява — само наляво." },
    { n: 2, textBg: "Маршрутът ти е НАЛЯВО. Ти си в дясната лента — нейната стрелка не води натам." },
    { n: 3, textBg: "Прочети стрелките отдалеч и започни престрояването рано: огледало, мигач, после маневра — лента по лента, не двете наведнъж." },
    { n: 4, textBg: "Заеми лявата лента („само наляво“) много преди стоп-линията и остави мигача включен — оттам нататък просто следваш стрелката." },
    { n: 5, textBg: "Ако си закъснял и си останал в грешната лента, продължи по нейната стрелка и се върни по-нататък — на самото кръстовище не се сменя лента." },
    { n: 6, textBg: "Премини на зелено и завий наляво в западната улица, като се установиш в средата на своята лента." },
  ],
  success: [
    {
      id: "sc-lnta-lane",
      titleBg: "Заеми лявата лента със стрелка „само наляво“",
      // Radius 4 < the 8.125 m lane pitch: the zone is satisfiable ONLY from
      // the LEFT-arrow lane — the „само направо" lane's center is 8.13 m away.
      // Placed clear of the stop line (y = −43.98) so the gate closes BEFORE
      // the junction: the arrow lane must be taken on approach, not inside it.
      params: { kind: "reachZone", x: LN_LANE_LEFT, y: -52, radiusM: 4, maxSpeedKmh: 55 },
    },
    {
      id: "sc-lnta-signal",
      titleBg: "Премини светофара от правилната лента",
      params: { kind: "passSignal", nodeId: "ln-n-c", x: 0, y: 0, radiusM: 50, control: "trafficLight" },
    },
    {
      id: "sc-lnta-finish",
      titleBg: "Завий наляво по стрелката и се установи в лентата",
      params: { kind: "reachZone", x: -60, y: LN_WEST_LANE_Y, radiusM: 5 },
    },
  ],
  rubric: { parTimeSec: 70 },
  // The LIVE session arrives on a fresh green (the founder signal pin): the
  // lesson under test is the ARROW, not the lamp — a red caught on approach
  // would turn a lane-choice drill into a signal drill. The recorded traces
  // pin their own phase through the recorder's signalOffsets (scLnTurnLaneArrows).
  signalPlan: { arm: "greenFresh", triggerM: 60, clusterId: "ln-n-c" },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scLnTurnLaneArrows.ts; gates in traces/__tests__/
  // sc-ln-turn-lane-arrows-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ln-turn-lane-arrows/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ln-turn-lane-arrows/mistake-left-from-through.trace.json" },
      titleBg: "Ляв завой от лента „само направо“",
      whatWentWrongBg:
        "Водачът се престрои една лента и спря дотам: остана в средната лента, чиято стрелка е „само направо“, и въпреки това зави наляво — без мигач и през чуждата лента. Стрелката на платното е нареждане, не съвет: тя е нарисувана, за да знаят и другите откъде ще тръгнеш. Завоят от грешната лента отрязва тези, които законно завиват отляво, и излиза широко в изходната улица — точно както се вижда тук.",
      // M-17: the act itself now has its own code. Before it, the card cited
      // only the collateral faults, so the debrief explained чл. 25 (signal)
      // for a manoeuvre that broke чл. 6 (marking) — the right severity for
      // the wrong law, which requirement-zero forbids.
      codeRefs: ["WRONG_LANE_FOR_DIRECTION", "TURN_WITHOUT_INDICATOR", "POOR_LANE_KEEPING"],
    },
    {
      traceRef: { path: "content/traces/sc-ln-turn-lane-arrows/mistake-late-two-lanes.trace.json" },
      titleBg: "Късно престрояване през две ленти на самото кръстовище",
      whatWentWrongBg:
        "Стрелките се появиха, водачът ги прочете късно — и на метри от стоп-линията пресече две ленти наведнъж, без огледало и без мигач. Точно там лентите са пълни с коли, които вече са заели своята посока: това е класическото „изведнъж отникъде“. Ако си пропуснал лентата, правилното е да продължиш по стрелката на своята и да се върнеш по-нататък.",
      codeRefs: ["LANE_CHANGE_WITHOUT_INDICATOR", "LANE_CHANGE_WITHOUT_MIRROR_CHECK"],
    },
  ],
  teach: {
    whenBg:
      "На всяко по-голямо кръстовище в града и на всеки разклон с повече от една лента в посока: стрелките се появяват върху платното десетки метри преди кръстовището, често дублирани със сини знаци от група Г над лентите. Прочети ги още щом ги видиш и се престрой веднага — местата за престрояване свършват, лентата не.",
    whyBg:
      "Стрелката на платното не е препоръка, а разпределение на посоките: всички около теб карат с очакването, че всяка лента ще тръгне натам, накъдето сочи нейната стрелка. Завой от „грешната“ лента отрязва тези, които завиват законно, и вкарва колата ти напреко през целия поток. А ако си сбъркал лентата, най-опасното решение е да се поправиш на самото кръстовище: продължи по стрелката, обиколи и се върни — губиш минута, а не предница.",
    lawRef: "ЗДвП чл. 6; Наредба № 2/2001",
    examinerBg:
      "Изпитващият следи кога прочиташ маркировката: очаква ранно, спокойно престрояване с огледало и мигач лента по лента, движение по стрелката на заетата лента и никакви поправки в самото кръстовище. Престрояване без мигач или без оглеждане е основна грешка; движение против стрелката на лентата се отбелязва като неразчитане на маркировката.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Night(),
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2. sc-ov-night-gap — „Изпреварване нощем" (OV-05 corridor × AC-04 night) on
//    ov-oncoming-v1, REUSED (the sc-ov-abort / sc-ov-return-gap shared-district
//    precedent: three corridor templates already live on this 900 m 1+1).
//
// WHAT IS NEW HERE IS THE NIGHT AXIS, NOT THE ADJUDICATION. The corridor
// tracker measures the oncoming gap in seconds from real positions — it does
// not care that it is dark. The DRIVER does: at night the only distance cue is
// a pair of headlights, and headlights carry no depth. So the template pairs
// the shipped corridor conviction with the night's own duty:
//   - OVERTAKE_INSUFFICIENT_GAP grades the pull-out against the „далечни"
//     headlights (the first car, deliberately authored INSIDE the convict band
//     — the taught act is REFUSING that window, чл. 42, ал. 1 / чл. 20);
//   - HIGH_BEAM_NOT_DIPPED grades the beam duty behind the lead the corridor
//     drill needs anyway (чл. 74) — the night's second half of the same story:
//     the long beam that keeps you from reading the road ahead of the car you
//     are about to pass.
// conditions.night is set on the TEMPLATE (every rung is dark — the drill has
// no daytime meaning); L5 adds drizzle as a RENDER/conditions axis only: no
// `physics`, so the dry-tuned ghost envelope stands (ADR-006 stage 4a).
// ---------------------------------------------------------------------------

/** ov-oncoming-v1 own (northbound) lane center / road length — pinned by value
 *  from the committed map (the L7 copy truth; ov-oncoming-district.test.ts
 *  asserts these against meta.scenario). */
const OVN_OWN = 4.06;
const OVN_LENGTH = 900;

/**
 * The slow LEAD of sc-ov-night-gap: the ~40 km/h crawler that makes passing
 * tempting, pacing the player's OWN lane (extraRightOffsetM 0). Two duties, one
 * actor: it is the car the overtake is FOR, and the car whose mirrors the long
 * beam dazzles — so its gap must sit in BOTH windows at once. followGapM 20
 * (centers ≈ 16 m of bumpers) is far above the following-distance fire band at
 * the authored ~34 km/h follow, and far inside the 150 m dip-duty window: the
 * only thing gradable against it is the BEAM. Its slam tier is authored out of
 * reach (the OVG/OVA mold) — deterministic moving traffic, not a braking drill.
 */
const OVN_LEAD_CAR: BrakingLeadCarSpec = {
  id: "sc-ovn-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["ovg-n-start", "ovg-n-end"],
    hold: { nodeIndex: 0, offsetM: 45 }, // dormant ~30 m ahead of the spawn
    cruiseSpeedMps: 11.1,
    extraRightOffsetM: 0, // own-lane center (the vehicle being overtaken)
    colorIndex: 2,
  },
  followGapM: 20,
  maxMatchSpeedMps: 11.1, // ~40 km/h — the slow rural lead
  slamAt: { x: OVN_OWN, y: 1300 }, // far past the 900 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * The NIGHT oncoming stream: TWO cars southbound at 12 m/s, released together
 * on the player's first movement — pure clockwork the drive scripts are
 * authored against. In INSTANT-CRUISE terms (a released car accelerates at the
 * staged default 2.6 m/s², losing v²/2a ≈ 28 m against an instant-cruise clock
 * at 12 m/s — the holds sit 28 m further along so each car tracks
 * y = Y − 12·t exactly once at cruise):
 *  - car 0, instant model y 310 (hold @ y 282): THE TRAP. Its headlights read
 *    „далеч" from the follow position, but a pull-out into its window measures
 *    ~2.3 s — deep inside OVERTAKE_CONVICT_GAP_SEC (4.0). Refusing it is the
 *    lesson; mistake-far-headlights takes it and is convicted.
 *  - car 1, +560 m (instant model y 870): the BIG, verified window behind the
 *    trap — the shadow's legal pass lives here with tens of measured seconds.
 * TWO cars, not three: at night the drill is „first headlights, then nothing" —
 * a middle car would add a second judgement the dark story does not need.
 * The 560 m gap is also the ceiling the geometry allows: car i is held
 * gapsM[i−1] BEHIND the head along the SAME path (runners.ts), so a gap larger
 * than the head's 618 m hold would place car 1 off the path's start — the
 * ov-oncoming battery asserts exactly that (holdArc − gap ≥ 0).
 */
const OVN_STREAM: OncomingStreamSpec = {
  id: "sc-ovn-stream",
  kind: "oncomingStream",
  libraryEventId: "OV-05",
  actor: {
    pathNodes: ["ovg-n-end", "ovg-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: OVN_LENGTH - 282 }, // instant-model y 310
    cruiseSpeedMps: 12,
    colorIndex: 1,
  },
  count: 2,
  gapsM: [560], // instant-model y 870 — the big window behind the trap
  releaseKmh: 3,
};

/** OV-05 × AC-04 — изпреварване нощем: прозорецът се преценява по фаровете, а
 *  фаровете нямат дълбочина (ЗДвП чл. 41–42: изпреварва се само при свободен
 *  път за ЦЯЛАТА маневра; чл. 20: скоростта и решенията се съобразяват с
 *  видимостта; чл. 74 — дългите се превключват зад движеща се кола). */
export const SC_OV_NIGHT_GAP: ScenarioSpec = {
  id: "sc-ov-night-gap",
  family: "lanes",
  tagsBg: ["изпреварване", "нощно каране", "фарове", "насрещно движение", "видимост"],
  titleBg: "Изпреварване нощем — преценка по фаровете",
  objectiveBg:
    "Нощем извън града прецени пролуката за изпреварване по фаровете на насрещния: ако не си сигурен колко е далеч — не започвай.",
  archetypeIds: ["OV-05", "AC-04"],
  conceptIds: [
    "c-overtaking-procedure",
    "c-night-visibility",
    "c-dazzle-handling",
    "c-general-care-duty",
  ],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-oncoming-v1.json meta.scenario
    // (tools/maps/gen_ov_oncoming.mjs; REUSED — the sc-ov-abort precedent).
    params: { lengthM: OVN_LENGTH, maxspeedKmh: 90 },
    districtId: "ov-oncoming-v1",
  },
  start: {
    spawnPointId: "ovg-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тъмно е и си извън града. Пред теб пълзи бавна кола на къси стопове, а далеч насреща светят фарове." },
    { n: 2, textBg: "Зад движещата се пред теб кола карай на КЪСИ светлини — дългите ѝ бият в огледалата и заслепяват водача ѝ (чл. 74)." },
    { n: 3, textBg: "Нощем виждаш фарове, не разстояние: два фара на хоризонта могат да са на 800 м или на 300 м, а разликата са секундите ти." },
    { n: 4, textBg: "Първите фарове НЕ са твоят прозорец — остани зад бавната кола и ги изчакай да минат. Съмняваш ли се колко са далеч, значи не започваш." },
    { n: 5, textBg: "Чак когато насрещната лента остане СЪВСЕМ тъмна: огледало, ляв мигач и решително изпреварване — колкото по-кратко си отсреща, толкова по-добре." },
    { n: 6, textBg: "Прибери се вдясно с мигач, щом видиш изпреварената кола в огледалото, и продължи до края на отсечката." },
  ],
  success: [
    {
      id: "sc-ovn-wait",
      titleBg: "Изчакай зад бавната кола, докато първите фарове минат",
      // Radius 4 < the 8.125 m lane pitch: satisfiable ONLY from the own-lane
      // center while the trap car is still inbound — the patience IS the drill.
      params: { kind: "reachZone", x: OVN_OWN, y: 150, radiusM: 4, maxSpeedKmh: 45 },
    },
    {
      id: "sc-ovn-finish",
      titleBg: "Изпревари в тъмния прозорец и завърши в своята лента",
      params: { kind: "reachZone", x: OVN_OWN, y: 540, radiusM: 5 },
    },
  ],
  rubric: { parTimeSec: 80 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scOvNightGap.ts; gates in traces/__tests__/
  // sc-ov-night-gap-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ov-night-gap/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-night-gap/mistake-far-headlights.trace.json" },
      titleBg: "Изпреварване срещу „далечни“ фарове",
      whatWentWrongBg:
        "Фаровете изглеждаха далеч — и колата излезе. Но нощем ти не виждаш насрещния автомобил, а само два светещи диска: те не ти казват нито колко е далеч, нито с каква скорост идва. Измереният прозорец тук се оказа около ДВЕ секунди — а „изглеждаше“ като цяла вечност. Точно затова правилото нощем е по-строго от дневното: не си ли сигурен колко е далеч — просто не започваш (чл. 42, ал. 1; чл. 20).",
      codeRefs: ["OVERTAKE_INSUFFICIENT_GAP"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-night-gap/mistake-high-beams.trace.json" },
      titleBg: "Следване на дълги светлини зад бавния",
      whatWentWrongBg:
        "Водачът остана зад бавната кола с включени дълги светлини — „за да вижда по-добре дали да изпревари“. Ефектът е точно обратният: дългите бият в огледалата на предната кола и заслепяват нейния водач, а отразената светлина отнема и твоята нощна адаптация точно когато ти трябва да четеш насрещното. Зад движеща се кола се кара на къси; на дълги минаваш чак когато излезеш и лентата пред теб е празна (чл. 74).",
      codeRefs: ["HIGH_BEAM_NOT_DIPPED"],
    },
  ],
  teach: {
    whenBg:
      "На всеки извънградски път през нощта, всеки път когато настигнеш по-бавна кола. Уличното осветление по такъв път е рядко и не ти показва насрещния — денем прозорецът се вижда, нощем се ЧЕТЕ по фаровете. Това е случаят, в който правилният отговор почти винаги е „не сега“.",
    whyBg:
      "Нощем очите ти нямат с какво да измерят разстоянието: два фара на прав път изглеждат еднакво „далечни“ на 800 и на 300 метра, а тъмнината скрива всичко между вас — банкет, дупка, велосипедист без светлини. При изпреварване скоростите се СЪБИРАТ, така че грешка от 200 метра в преценката е грешка от няколко секунди в маневрата — точно тези, които не ти достигат. Затова нощното изпреварване се прави само в напълно тъмна насрещна лента, а зад предната кола се кара на къси: дългите заслепяват нея през огледалата ѝ, а отразената светлина — теб.",
    lawRef: "ЗДвП чл. 41–42; чл. 20",
    examinerBg:
      "Изпитващият следи нощната преценка: търпеливо изчакване зад бавната кола, докато насрещните фарове преминат, къси светлини през цялото следване и решително изпреварване едва при празна насрещна лента. Излизане срещу приближаващи фарове е опасна грешка и проваля изпита; оставените дълги зад предната кола са второстепенна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — ръмеж: RENDER/conditions axis only (night carries from the template
    // conditions: compileScenario spreads rung over template). No `physics`:
    // the authored ghost envelope is dry-tuned (ADR-006 stage 4a).
    { level: 5, conditions: { weather: "rain" } },
  ],
  staged: [OVN_LEAD_CAR, OVN_STREAM],
  conditions: { weather: "dry", night: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-ov-being-overtaken — „Изпреварват те — не ускорявай" (OV-10 „Ускоряване
//    докато те изпреварват" × OV-12 „Возене по линията") on ov-oncoming-v1,
//    REUSED by DAY — the fourth corridor template on this 900 m 1+1, and the
//    first that puts the player on the OTHER side of the maneuver: here someone
//    overtakes YOU, and the whole drill is what you must NOT do about it.
//
// WHY THE MISTAKES GRADE WHAT THEY GRADE. Doc 72 OV-10 marks the being-
// overtaken detector 🔴 NEW ("speed increase while an actor occupies the
// alongside-left window — needs OV-03's alongside telemetry"): it has NOT
// landed, and the rearTailgater actor that plays the overtaker emits ZERO
// SimTick events by contract (learn-only pressure scenery, A12). So NOTHING
// grades off the actor, and the template takes the sc-ln-turn-lane-arrows road
// — grade the honest way, on the player's OWN channels:
//   - SUCCESS is objective-gated: a reachZone carrying maxSpeedKmh 75 sits at
//     the point where the overtaker is alongside. A driver who holds (or eases
//     off) 70 satisfies it; a driver who answers the pass with throttle cannot.
//     The speed CEILING at that spot IS the чл. 42, ал. 2 contract — the same
//     "the patience IS the drill" gate sc-ov-night-gap uses to grade a refusal.
//   - The MISTAKE demos grade the faults that always TRAVEL with the чл. 42
//     breach and do have shipped detectors: the ego throttle-up runs past the
//     90 limit (SPEEDING_OVER_LIMIT) and traps the overtaker in the oncoming
//     lane (COLLISION — the authored consequence, see the trace script), and
//     the left drift against the overtaker is doc 72 OV-12 itself.
//
// OV-12's CODE, PRECISELY. Doc 72 pins OV-12 to POOR_LANE_KEEPING, but that
// note predates the engine's "one act, one code" ruling (rules/engine.ts stage
// 2b): on a two-way edge, a sustained off-centre ride TOWARD the оncoming side
// with the indicator off arms centerLineCond, which SUPPRESSES the generic
// lane-keep episode (`!centerLineCond`) and bills CENTER_LINE_TOUCHED instead —
// whose catalog title is „Настъпване на осевата линия", the exact Bulgarian
// phrase doc 72 uses to NAME OV-12. On this 1+1 the generic code is reachable
// only by drifting the OTHER way, toward the shoulder, which is a different
// lesson. So the left pull grades CENTER_LINE_TOUCHED: same severity band
// (второстепенна), strictly more specific code, doc-72 story intact.
// ---------------------------------------------------------------------------

/** ov-oncoming-v1 lane pitch — the shift that takes the overtaker from the
 *  player's own lane onto the oncoming bank (4.0625 → −4.0625). */
const OVBO_LANE_PITCH = 8.125;

/**
 * The OVERTAKER: the shipped rearTailgater actor doing the one job its runner
 * exists for — close, sit, then laneShift past on the left. PRESSURE SCENERY
 * (the runner emits ZERO SimTick events, ever — no violation and no collision
 * can grade from it, doc 72 FO-07 / A12), which is exactly what this template
 * needs: the чл. 42, ал. 2 duty is the PLAYER's, and it must be graded on the
 * player's own channels or not at all.
 *
 * passSpeedMps 25 (90 km/h — the posted limit, so the overtaker is never the
 * lawbreaker in its own story) is the hinge the whole drill turns on, ONE spec
 * serving both outcomes:
 *   - hold/ease at 65–70 km/h (18–19.4 m/s) and the pass closes at ~6 m/s —
 *     the overtaker clears passAheadM and resolves "yielded";
 *   - answer it with throttle at 99.5 km/h (27.6 m/s) and the actor CANNOT get
 *     ahead: it never resolves, and stays pinned alongside in the oncoming
 *     lane. The trap the bank describes („ускориш ли, оставяш изпреварващия в
 *     капан на насрещното платно", q-manevri-015) is literally what the
 *     kinematics do — not a story the card tells over a scripted fake.
 * easeKmh 4: the shadow's 5 km/h lift off 70 latches the taught response
 * ("yielded") with a margin. Nothing grades off it (learn-only measurement).
 */
const OVBO_OVERTAKER: RearTailgaterSpec = {
  id: "sc-ovbo-overtaker",
  kind: "rearTailgater",
  libraryEventId: "ev-overtake",
  actor: {
    pathNodes: ["ovg-n-start", "ovg-n-end"], // northbound — the player's own direction
    hold: { nodeIndex: 0, offsetM: 2 }, // dormant y = 2, ~13 m behind the spawn
    cruiseSpeedMps: 14,
    extraRightOffsetM: 0, // the player's OWN lane — it arrives from behind
    colorIndex: 3,
  },
  releaseGapM: 20,
  followBehindM: 12, // an overtaker closing up, not a лепка: ~8 m of bumpers
  maxMatchSpeedMps: 22, // 79 km/h — it can still sit behind a 70 km/h player
  pressureSec: 5,
  passShiftM: -OVBO_LANE_PITCH, // the pass runs one lane LEFT = the oncoming bank
  passSpeedMps: 25, // 90 km/h — see the doc above: the hinge of both outcomes
  passAheadM: 30,
  easeKmh: 4,
};

/**
 * The oncoming stream — TWO cars southbound at 12 m/s, released together on the
 * player's first movement (pure clockwork, the OVN mold). Their job is to make
 * the WHY visible: this is a 1+1 with real traffic in the other lane, so the
 * lane the overtaker borrows is a lane that belongs to someone else.
 *
 * Both are authored to MEET THE PLAYER EARLY — well before the overtaker
 * commits — so the oncoming lane is empty when the pass runs: that emptiness is
 * why the overtaker can legally pass at all, and it keeps the shadow's story
 * honest ("against thin oncoming traffic"). The danger of the throttle-up is
 * then carried by the kinematics (the actor pinned alongside) and the authored
 * consequence, not by a third car the player never had a duty toward.
 *
 * THE EMPTINESS IS ALSO A HARD CONSTRAINT, not just a preference. The shipped
 * RearTailgaterRunner issues ONE laneShift at pass time and never a return, so
 * the overtaker stays on the oncoming bank for the rest of the drive. Any car
 * timed to arrive AFTER the pass commits would therefore meet it head-on — an
 * actor-actor absurdity the runtime does not model and the player has no duty
 * toward. Hence: all oncoming traffic is spent BEFORE the overtaker commits,
 * and no card in this template narrates oncoming headlights during the pass.
 * In INSTANT-CRUISE terms (a released car accelerating at the staged default
 * 2.6 m/s² loses v²/2a ≈ 28 m against an instant clock at 12 m/s, so a hold at
 * y tracks y + 28 − 12·t): car 0 holds at offsetM 745 ⇒ y 155 ⇒ instant model
 * y 183; car 1 sits 90 m further north (offsetM 655 ⇒ instant model y 273).
 */
const OVBO_STREAM: OncomingStreamSpec = {
  id: "sc-ovbo-stream",
  kind: "oncomingStream",
  libraryEventId: "ev-overtake",
  actor: {
    pathNodes: ["ovg-n-end", "ovg-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: 745 }, // y 155 ⇒ instant model y 183
    cruiseSpeedMps: 12,
    colorIndex: 1,
  },
  count: 2,
  gapsM: [90], // car 1 held 90 m behind the head ⇒ instant model y 273
  releaseKmh: 3,
};

/** OV-10 × OV-12 — изпреварваният не ускорява (ЗДвП чл. 42, ал. 2: на
 *  изпреварвания е забранено да увеличава скоростта си, докато го изпреварват)
 *  и се държи вдясно (чл. 15). Bank-verified: q-manevri-015 („Изпреварваният
 *  няма право да ускорява… оставяш изпреварващия в капан на насрещното
 *  платно"), q-manevri-043 и q-magistrali-i-izvangradsko-035 („не ускорява и не
 *  пречи… а се държи вдясно"), q-magistrali-i-izvangradsko-055 (насрещният по
 *  време на изпреварване). */
export const SC_OV_BEING_OVERTAKEN: ScenarioSpec = {
  id: "sc-ov-being-overtaken",
  family: "lanes",
  tagsBg: ["изпреварване", "изпреварван", "скорост", "дясно в лентата", "осева линия"],
  titleBg: "Изпреварват те — не ускорявай",
  objectiveBg:
    "Когато кола вече те изпреварва, задръж или леко намали скоростта и стой вдясно — ускоряването под изпреварване е забранено и вкарва двамата в челен риск.",
  archetypeIds: ["OV-10", "OV-12"],
  conceptIds: [
    "c-overtaken-duties",
    "c-overtaking-procedure",
    "c-speed-limits",
    "c-general-care-duty",
  ],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-oncoming-v1.json meta.scenario
    // (tools/maps/gen_ov_oncoming.mjs; REUSED — the sc-ov-abort precedent).
    params: { lengthM: OVN_LENGTH, maxspeedKmh: 90 },
    districtId: "ov-oncoming-v1",
  },
  start: {
    spawnPointId: "ovg-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Извънградски път, по една лента в посока, ограничение 90. Карай спокойно около 70 км/ч в своята лента." },
    { n: 2, textBg: "Погледни в огледалото: колата зад теб се приближава и излиза наляво — започва да те изпреварва." },
    { n: 3, textBg: "От този момент маневрата е негова, но безопасността е обща. Твоята работа е пасивна: НЕ ускорявай (чл. 42, ал. 2) и се дръж вдясно в лентата (чл. 15)." },
    { n: 4, textBg: "Ако можеш, свали 5 км/ч — така съкращаваш времето, което той прекарва в насрещното платно. Практическото мерило през цялата маневра: стрелката НЕ минава 75 км/ч, макар пътят да е ограничен на 90 — важи скоростта, с която караше, а не разрешената." },
    { n: 5, textBg: "Не се дърпай наляво „да го погледнеш“ и не настъпвай осевата — там е точно колата, която те изпреварва." },
    { n: 6, textBg: "Изчакай го да те подмине и чак тогава се върни в средата на лентата и към нормалната си скорост." },
  ],
  success: [
    {
      id: "sc-ovbo-hold",
      // LEDGER D4 (doc 86 §5): the 75 km/h ceiling was a HIDDEN contract — the
      // road is posted 90, nothing on screen said 75, and a student holding a
      // perfectly lawful 80 failed a gate whose title only said „не ускорявай".
      // A speed contract the student cannot see is not a lesson, it is a trap;
      // the number now lives in the title and in instruction 4.
      titleBg: "Не ускорявай, докато те изпреварват — задръж под 75 км/ч",
      // THE speed-band gate. y = 380 is the ALONGSIDE point, measured not
      // guessed: the overtaker resolves passAheadM at t ≈ 28.1 with the shadow
      // at y ≈ 459, and closes the 42 m from −12 m at ~6.9 m/s, so actorAheadM
      // ≈ 0 lands at y ≈ 380. maxSpeedKmh 75 is the ceiling a holder/easer
      // clears (the shadow is at 65.1 here) and a throttler cannot (the mistake
      // demo is at 99.4 here) — the чл. 42, ал. 2 duty, graded where it bites.
      // radius 6 < the 8.125 m lane pitch: it also fails from the oncoming bank.
      params: { kind: "reachZone", x: OVN_OWN, y: 380, radiusM: 6, maxSpeedKmh: 75 },
    },
    {
      id: "sc-ovbo-finish",
      titleBg: "Пусни го да се прибере и продължи в своята лента",
      params: { kind: "reachZone", x: OVN_OWN, y: 520, radiusM: 6 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scOvBeingOvertaken.ts; gates in traces/__tests__/
  // sc-ov-being-overtaken-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ov-being-overtaken/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-being-overtaken/mistake-accelerating.trace.json" },
      titleBg: "Ускоряване, докато те изпреварват",
      whatWentWrongBg:
        "Колата отляво излезе да изпревари — и водачът натисна газта. Инстинктът е човешки („не ме изпреварвай“), последицата е забранена: скоростта мина 90 и изпреварващият остана в капан в насрещното платно, защото вече не можеше нито да те подмине, нито да се прибере зад теб. Точно това забранява чл. 42, ал. 2 — изпреварваният няма право да увеличава скоростта си. Тук маневрата свърши единствено защото другият се хвърли обратно в твоята лента.",
      codeRefs: ["SPEEDING_OVER_LIMIT", "COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-being-overtaken/mistake-drifting-left.trace.json" },
      titleBg: "Ляво дърпане срещу изпреварващия",
      whatWentWrongBg:
        "Скоростта беше наред, но колата тръгна наляво — водачът се „обърна“ към изпреварващия и повлече волана след погледа си. Резултатът е возене по осевата линия точно там, където минава другият: той няма накъде да се дръпне, освен още по-навътре в насрещното. Задължението ти е обратното — дръж се ВДЯСНО в лентата си (чл. 15) и остави коридора му максимално широк.",
      codeRefs: ["CENTER_LINE_TOUCHED"],
    },
  ],
  teach: {
    whenBg:
      "На всеки двупосочен извънградски път, всеки път когато зад теб се появи по-бърза кола — а с бавен автомобил и колона отзад това е въпрос на минути. Моментът е разпознаваем: колата в огледалото се приближава, дръпва се наляво и излиза. Оттам нататък ти вече си участник в чужда маневра.",
    whyBg:
      "Изпреварването е единствената маневра, при която единият участник поема целия риск, а другият държи ключа за него: докато те изпреварват, другият е в насрещното платно и времето му там зависи от ТВОЯТА скорост. Ускориш ли, удължаваш престоя му срещу насрещните — при изпреварване скоростите се събират, така че две секунди повече са стотици метри по-малко за всички. Затова законът не оставя това на добрата воля: на изпреварвания е ЗАБРАНЕНО да увеличава скоростта си. Помощта ти е пасивна и много проста — задръж или свали малко, дръж се вдясно и не настъпвай осевата. „Режисирането“ с мигачи и махане с ръка не е твоя работа и подвежда.",
    lawRef: "ЗДвП чл. 42, ал. 2; чл. 15",
    examinerBg:
      "Изпитващият гледа реакцията ти към колата, която те изпреварва: очаква стабилна или леко намалена скорост, спокойно държане вдясно в лентата и нула „състезание“. Ускоряване по време на изпреварване е основна грешка; настъпването на осевата линия към изпреварващия се отбелязва като второстепенна.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [OVBO_OVERTAKER, OVBO_STREAM],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 4. sc-ov-crest-curve — „Забранено изпреварване преди било и завой" (OV-06 ban
//    × OV-05 corridor × SP-05 curve) on ov-crest-v1, the FIRST map carrying a
//    В24 noOvertaking span and an А1 curveAdvisory span on ONE edge: a rural
//    1+1 posted 90, a 90° blind bend with a slope block inside its arc, and a
//    450 m straight after it where passing is legal (tools/maps/gen_ov_crest.mjs).
//
// „БИЛО" IS NARRATIVE, THE CURVE IS REAL. Doc 76 flags hill-ramp as a reserved
// archetype with no ramp geometry — no elevation exists in this engine. So the
// bank's crest frame (q-manevri-012 „изкачваш се към билото… зад бавен камион")
// is taught here through its twin, the closed bend (q-manevri-013 „в участък с
// ограничена видимост, например в закрит завой"; q-magistrali-i-izvangradsko-014
// „пред вас има десен завой, след който пътят не се вижда"): SAME law, SAME
// decision, geometry we can actually build. Every line of copy below is
// curve-based — nothing claims a slope the map does not have.
//
// WHY THE MISTAKES GRADE WHAT THEY GRADE. The В24 span is authored, posted and
// on the tick (tick.noOvertakeZone — the district battery pins all three), and
// yet OVERTAKING_IN_BAN_ZONE CANNOT fire here, by construction: the detector
// rides the denoised lane-change signal (rules/engine.ts stage 3 — a laneId
// DELTA), and on a 1+1 laneId is „rightmost lane OF THE VEHICLE'S CARRIAGEWAY"
// (locator.ts), i.e. 0 on BOTH banks. Crossing the осева flips travelDir, never
// laneId — which is exactly why sc-ov-ban-overtake had to live on a 2+2
// boulevard. A blind rural bend is a 1+1 or it is a lie, so this template grades
// the honest way, on what a pass here ACTUALLY is:
//   - „Изпреварване в слепия завой" grades OVERTAKE_INSUFFICIENT_GAP — the
//     corridor tracker measures the real window against the car that comes out
//     of the bend, which IS чл. 43's whole point: the ban exists because the
//     window cannot be seen, and the demo shows the window that was not there;
//   - „Прекалена скорост в дъгата" grades SPEED_TOO_FAST_FOR_CURVE off the А1
//     advisory span (ЗДвП чл. 20, ал. 2).
// SUCCESS carries the ban itself, objective-gated (the sc-ln-turn-lane-arrows
// road, above): a radius-4 patience gate on the OWN lane inside the bend, with
// a speed ceiling — satisfiable only by the driver who neither pulls out nor
// carries speed in. ov-crest-districts.test.ts pins the negative so the day the
// ban detector learns about 1+1 banks it fails loudly and this template gains
// its code deliberately.
// ---------------------------------------------------------------------------

/** ov-crest-v1 pins, denormalized from the committed map by value (the L7 copy
 *  law — ov-crest-districts.test.ts asserts every one against meta.scenario). */
const OVCC_OWN = 4.06; // approach right-lane center
/** The mid-arc point of the OWN lane — the patience gate's anchor
 *  (meta.scenario.laneCurveMid). The opposing bank's mid-arc sits one 8.125 m
 *  lane pitch away, so a radius-4 gate here is unreachable from an excursion. */
const OVCC_ARC_MID_X = 42.41;
const OVCC_ARC_MID_Y = 332.59;
/** Exit-leg lane centers: own (eastbound) and the oncoming bank the legal pass
 *  borrows (meta.scenario.exitLaneY / exitOncomingLaneY). */
const OVCC_EXIT_Y = 370.94;
const OVCC_EXIT_ONCOMING_Y = 379.06;

/**
 * The slow LEAD of sc-ov-crest-curve: a TRUCK (profile — visual/data only; the
 * leadGap query stays point-based, ADR-001) pacing the player's own lane at
 * ~57 km/h on a 90 km/h road. This is the bank's „бавен камион" and it is the
 * single most load-bearing number in the template, because ONE spec has to
 * serve three drives that want opposite things:
 *   - maxMatchSpeedMps 15.8 (~56.9 km/h) sits ABOVE the 54 km/h guilty-curve
 *     demo, so that demo's overspeed NEVER becomes a following fault: the truck
 *     simply keeps pace and the only thing billed is the arc. One demo, one
 *     lesson — the whole point of the §9 exact-code assert;
 *   - …and it sits far enough under the posted 90 that the shadow's legal pass
 *     in the straight closes at ~28 km/h and completes inside the authored
 *     450 m window (the generator asserts the window fits a whole pass);
 *   - followGapM 38 (≈ 34 m of bumpers) is chosen against the SAME 54 km/h:
 *     the follow band there is followFireRatio 0.7 × followSafeSeconds 1.8 ×
 *     15 m/s ≈ 19 m, so every drive here keeps its distance by construction and
 *     FOLLOWING_TOO_CLOSE can never leak into a demo about anything else.
 * Its slam tier is authored out of reach (the OVN/OVB mold): this is
 * deterministic moving traffic, not a braking drill.
 */
const OVCC_LEAD_TRUCK: BrakingLeadCarSpec = {
  id: "sc-ovcc-lead",
  kind: "brakingLeadCar",
  libraryEventId: "ev-overtake",
  actor: {
    pathNodes: ["ovc-n-start", "ovc-n-end"],
    hold: { nodeIndex: 0, offsetM: 55 }, // dormant ~40 m ahead of the spawn
    cruiseSpeedMps: 15.8,
    extraRightOffsetM: 0, // own-lane center (the vehicle being overtaken)
    colorIndex: 2,
    profile: "truck",
  },
  followGapM: 38,
  maxMatchSpeedMps: 15.8, // ~57 km/h — see the doc above: the hinge of all three
  slamAt: { x: OVCC_OWN, y: 1400 }, // far past the 902 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * The car that comes OUT OF THE BEND — the reason for the ban, made physical.
 * TWO cars southbound at 12 m/s, released together on the player's first
 * movement: pure clockwork the drive scripts are authored against (the OVN
 * mold). Both are timed to meet the player INSIDE the arc, which does two jobs
 * at once and is why the count is 2 and not 1:
 *   - in the shadow they sweep past while the bot waits in its own lane —
 *     the lesson's „ето защо" arrives unprompted, at zero grading cost (the
 *     corridor is disarmed on the own bank);
 *   - in the blind-pass demo they are what the excursion runs into: the tracker
 *     reads distM / closingMps against a 12 m/s car, so the convict band
 *     (OVERTAKE_CONVICT_GAP_SEC 4.0) is ~48 m of real road — a window that was
 *     never visible from behind the truck.
 * And by spending BOTH inside the bend they leave the legal straight genuinely
 * empty, which is what makes the shadow's pass there lawful rather than lucky.
 */
const OVCC_STREAM: OncomingStreamSpec = {
  id: "sc-ovcc-stream",
  kind: "oncomingStream",
  libraryEventId: "ev-overtake",
  actor: {
    pathNodes: ["ovc-n-end", "ovc-n-start"], // southbound = oncoming
    // In INSTANT-CRUISE terms (a released car accelerating at the staged
    // default 2.6 m/s² loses v²/2a ≈ 27.7 m against an instant clock at 12
    // m/s): held at path arc 215 ⇒ road position 902.04 − 215 ⇒ the instant
    // model has car 0 crossing road-s = 934.54 − 12·t. Tuned so it meets a
    // 40–44 km/h drive at road-s ≈ 360, i.e. PAST the arc's midpoint — which is
    // what puts the blind-pass demo's whole excursion, conviction included,
    // ACROSS the bend's blindest point instead of short of it.
    hold: { nodeIndex: 0, offsetM: 215 },
    cruiseSpeedMps: 12,
    colorIndex: 1,
  },
  count: 2,
  gapsM: [90], // car 1 rides 90 m further up the road — ~4 s behind car 0
  releaseKmh: 3,
};

/** OV-06 × OV-05 × SP-05 — изпреварване при ограничена видимост (ЗДвП чл. 43:
 *  забранено е изпреварването при ограничена видимост — в закрит завой и при
 *  приближаване към връх на изкачване; чл. 42: изпреварва се само при свободен
 *  насрещен участък за ЦЯЛАТА маневра; чл. 20, ал. 2: скоростта се съобразява с
 *  видимостта и с обозначения завой). Bank-verified: q-manevri-012 („зад билото
 *  не виждаш дали идва насрещен автомобил"), q-manevri-013 („в участък с
 *  ограничена видимост, например в закрит завой"), q-magistrali-i-izvangradsko-014
 *  („едва след завоя, когато видя достатъчно дълъг свободен насрещен участък"),
 *  q-manevri-065. */
export const SC_OV_CREST_CURVE: ScenarioSpec = {
  id: "sc-ov-crest-curve",
  family: "lanes",
  tagsBg: ["изпреварване", "забрана за изпреварване", "знак В24", "сляп завой", "ограничена видимост"],
  titleBg: "Забранено изпреварване преди било и завой",
  objectiveBg:
    "Не започвай изпреварване там, където пътят се крие — преди връх на изкачване или сляп завой изчакваш, колкото и бавен да е предният.",
  archetypeIds: ["OV-06", "OV-05", "SP-05"],
  conceptIds: [
    "c-overtaking-prohibitions",
    "c-overtaking-procedure",
    "c-speed-adaptation",
    "c-warning-signs",
  ],
  map: {
    archetype: "rural-curve",
    // The generator recipe — mirrored in ov-crest-v1.json meta.scenario.params
    // (tools/maps/gen_ov_crest.mjs).
    params: {
      approachM: 240,
      radiusM: 135,
      sweepDeg: 90,
      exitM: 450,
      maxspeedKmh: 90,
      advisoryKmh: 40,
      banAheadM: 90,
    },
    districtId: "ov-crest-v1",
  },
  start: {
    spawnPointId: "ovc-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Ledger L10: the L5 rung compiles rain and HEADLIGHTS_OFF_IN_RAIN grades
    // unconditionally (ЗДвП чл. 70).
    { n: 1, textBg: "Извънградски път, по една лента в посока, ограничение 90. Пред теб пълзи бавен камион и ти се иска да го подминеш. Вали ли, включи късите светлини още сега (чл. 70) — в закрит завой те не са, за да виждаш ти, а за да те види насрещният секунда по-рано." },
    { n: 2, textBg: "Отдалеч се появява знак В24 „Забранено е изпреварването“, а след него знак А1 с табела 40 — напред пътят завива надясно и се скрива зад склона." },
    { n: 3, textBg: "Не започвай нищо. Забраната важи от знака, а не от завоя: маневра, започната „на ръба“, ЗАВЪРШВА вътре в слепия участък." },
    { n: 4, textBg: "Свали скоростта още на правата — в дъгата дръж около 40 и остани зад камиона, дори да ти се струва, че насреща е чисто. Празното платно, което виждаш, свършва там, където свършва и погледът ти." },
    { n: 5, textBg: "Изчакай завоя да те изведе на дългата права. Чак когато видиш свободен насрещен участък за ЦЯЛАТА маневра: огледало, ляв мигач, решително изпреварване." },
    { n: 6, textBg: "А ако правата не ти покаже такъв участък — остани зад камиона до края. Това НЕ е провален урок: чл. 42 разрешава изпреварването само при свободна насрещна лента, така че „не сега“ е също толкова правилен отговор, колкото и чистото изпреварване." },
    { n: 7, textBg: "Изпревариш ли, прибери се вдясно с мигач, щом видиш камиона в огледалото, и завърши в своята лента." },
  ],
  success: [
    {
      id: "sc-ovcc-patience",
      titleBg: "Изчакай зад камиона през целия сляп завой",
      // THE drill, in one gate. Radius 4 < the 8.125 m lane pitch, so it is
      // satisfiable ONLY from the OWN lane at the arc's midpoint — an excursion
      // onto the oncoming bank is 8.13 m away and fails it. maxSpeedKmh 46 sits
      // just above the А1 advisory band (40 + the engine's 5 km/h grace) — the
      // driver who carries speed through the bend fails the SAME gate. Both
      // taught faults, one objective: patience IS being here, slow, on your side.
      params: { kind: "reachZone", x: OVCC_ARC_MID_X, y: OVCC_ARC_MID_Y, radiusM: 4, maxSpeedKmh: 46 },
    },
    {
      id: "sc-ovcc-pass",
      titleBg: "Излез на правата — изпревари САМО ако видиш свободен насрещен участък",
      // LEDGER B8 (doc 86 §3) — THE NORTH-STAR INVERSION, REPAIRED.
      //
      // This gate used to sit at (300, OVCC_EXIT_ONCOMING_Y) with radius 4, i.e.
      // ONLY on the oncoming bank, 8.12 m from the own-lane centre. It was a
      // MANDATORY success objective, so the drive could not be completed unless
      // the student committed the overtake — and a student who chose to stay
      // behind the truck (always legal, and here the safer read of чл. 42, since
      // he cannot know the straight is clear until he is on it) finished with
      // `completedAll: false` → stars 1 → SCENARIO_UNLOCK_MIN_STARS 2 → the next
      // rung locked. The simulator scored the safest lawful choice as a failure.
      // CLAUDE.md's north-star test forbids exactly that.
      //
      // The repair keeps the gate WHERE it is (the ribbon still leads the student
      // down the legal straight, and the taught order wait → straight → settle is
      // unchanged) and makes it satisfiable from EITHER lane: centre y = 375.00 is
      // the midpoint of own 370.94 and oncoming 379.06, radius 8 admits both lane
      // centres with 3.9 m of slack and, on this 1+1, no third lane exists to
      // admit falsely. The pass is now a taught OPTION with a stated precondition
      // — which is what чл. 42 actually says — instead of a toll gate.
      params: { kind: "reachZone", x: 300, y: (OVCC_EXIT_Y + OVCC_EXIT_ONCOMING_Y) / 2, radiusM: 8 },
    },
    {
      id: "sc-ovcc-finish",
      titleBg: "Прибери се вдясно и завърши в своята лента",
      params: { kind: "reachZone", x: 545, y: OVCC_EXIT_Y, radiusM: 5 },
    },
  ],
  rubric: { parTimeSec: 95 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scOvCrestCurve.ts; gates in traces/__tests__/
  // sc-ov-crest-curve-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ov-crest-curve/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-crest-curve/mistake-blind-pass.trace.json" },
      titleBg: "Изпреварване в слепия завой",
      whatWentWrongBg:
        "„Камионът пълзи, а насреща е чисто“ — и колата излезе в дъгата. Само че „чисто“ там значи единствено „не виждам“: зад склона на завоя пътят продължава, а по него идва кола. Тя се появи, когато маневрата вече беше започнала — измереният прозорец се оказа секунди, а не метри. Точно това забранява чл. 43: не се изпреварва при ограничена видимост, независимо колко бавен е предният и колко празно изглежда платното. Знакът В24 стои 90 метра преди завоя именно защото решението се взема ТАМ, не в дъгата.",
      codeRefs: ["OVERTAKE_INSUFFICIENT_GAP"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-crest-curve/mistake-curve-speed.trace.json" },
      titleBg: "Прекалена скорост в дъгата",
      whatWentWrongBg:
        "Тук никой не изпреварва — водачът просто влезе в обозначения завой с около 54 км/ч при табела 40 под знака А1. Табелата не е препоръка за плахите: тя е скоростта, при която успяваш да спреш в отсечката, която ВИЖДАШ. В сляп завой пред теб може да стои спрял автомобил, паднал клон или насрещен, който реже дъгата — а сцеплението, което харчиш за скоростта, вече не ти достига за спирачката. Намаляването се прави на правата ПРЕДИ завоя; в дъгата кракът стои спокоен (чл. 20, ал. 2).",
      codeRefs: ["SPEED_TOO_FAST_FOR_CURVE"],
    },
  ],
  teach: {
    whenBg:
      "На всеки двупосочен извънградски път зад по-бавно превозно средство — камион, каравана, трактор — щом напред пътят се скрие: закрит завой, връх на изкачване, стеснение. Разпознава се лесно: виждаш знак В24 или просто не виждаш края на маневрата си. Това е моментът, в който отговорът почти винаги е „не сега, след завоя“.",
    whyBg:
      "Изпреварването е единствената нормална маневра, при която доброволно излизаш в насрещното платно — и остава безопасна само докато виждаш целия участък, който ще ти трябва. При изпреварване скоростите се СЪБИРАТ: срещу теб и другия се затварят по 50 метра в секунда, така че прозорец, който „изглежда достатъчен“ на 300 метра, е шест секунди — колкото самата маневра. А в закрит завой или зад било ти не виждаш 300 метра: виждаш склона. Празното платно пред теб не е информация, а липса на информация — насрещният излиза иззад дъгата вече на стотина метра и вие оставате без нищо освен спирачки, каквито няма къде да използвате. Затова законът не оставя това на преценка: при ограничена видимост изпреварването е ЗАБРАНЕНО. Цената на търпението е минута зад камиона; цената на грешката е челен удар, при който двете скорости се събират.",
    lawRef: "ЗДвП чл. 43",
    examinerBg:
      "Изпитващият следи къде вземаш решението, а не колко си бърз: очаква да разчетеш В24 и А1 отдалеч, да свалиш скоростта преди дъгата, да останеш зад бавния през целия участък с ограничена видимост и да изпревариш чисто чак на правата след него. Започнато изпреварване в зоната на забраната или в закрит завой е опасна грешка и проваля изпита; несъобразената скорост в обозначения завой е основна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — дъжд: a RENDER/conditions axis only. `physics` is a TEMPLATE-wide
    // field (LevelSpec carries no physics override), so authoring wetGrip for
    // this rung would run L1–L4 on wet grip too and invalidate the dry-tuned
    // ghost envelope of every committed trace (ADR-006 stage 4a) — the same
    // ruling sc-ov-night-gap took for its drizzle rung.
    { level: 5, conditions: { weather: "rain" } },
  ],
  staged: [OVCC_LEAD_TRUCK, OVCC_STREAM],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 5. sc-ov-solid-return — „Прибери се преди плътната линия" (OV-04 × OV-09 ×
//    SN-03) on ov-solid2-v1, the CLOSING-WINDOW road: a rural 1+1 posted 90,
//    285 m of dashed М2 with a crawler to pass, 60 m of lengthened warning
//    dashes, then an М1 solid span at y ∈ [300, 500] (tools/maps/gen_ov_solid2.mjs).
//
// WHY THIS IS NOT sc-ov-solid-line, AND WHY IT NEEDED ITS OWN MAP. The live
// template teaches the WALL: „не пресичай" — a pure line-discipline drive on
// ov-solid-v1, no lead, no oncoming, nothing to plan. This one teaches the
// WINDOW: the same marking read forward, as the clock it actually is. The
// backlog asked for the shipped district and its own feasibility note flagged
// the fallback; the arithmetic settled it. ov-solid-v1's М1 span starts at
// y = 90 and its spawn sits at y = 15 — 75 m of dashed road, while a ~62 km/h
// pass of a 40 km/h crawler closes ~6 m/s and needs ~100 m of travel to gain
// its 36 m. The maneuver does not fit before the span at all, let alone
// „finished 30 m early" as the lesson's whole contract requires. So the map is
// its own file (gen_ov_solid2.mjs, the gen_ban_zones.mjs mold by way of
// gen_pk_ban2.mjs), exactly as the item's fallback directs.
//
// WHY THE MISTAKES GRADE WHAT THEY GRADE — and why these two codes and no
// others can BOTH be reached on one road. The М1 span is a hard seam in the
// runtime: `ocArmed` (worldRuntime) requires `tick.solidCenterLine !== true`,
// so an excursion that rides into the span drops out of the corridor's and the
// return tracker's arming on that very frame — and the return adjudication's
// exit test (`returned`) fails, because the bank has not flipped home yet. The
// episode is discarded silently and the act becomes CROSSED_SOLID_LINE's alone
// (the stage-2b one-act-one-code ruling). That seam is what lets the two taught
// faults be told apart by the ONE thing that separates them in real life —
// WHERE the return landed:
//   - „Връщане върху вече плътната линия": the excursion crosses y = 300 still
//     on the oncoming bank and lands inside the span → EXACTLY
//     CROSSED_SOLID_LINE (опасна). The return tracker is structurally silent
//     here, so the card names the marking and nothing else;
//   - „Отрязване на изпреварения при късното прибиране": the same late start,
//     but the driver SEES the line coming and cuts back onto the dashed road in
//     front of the crawler → EXACTLY OVERTAKE_RETURN_TOO_EARLY (основна). Same
//     mis-timed window, the other way out of it, and the price is the
//     brake-forcing cut instead of the wall.
// The two demos are one decision apart, which is the pedagogy: by the time you
// are choosing between them you have already made the mistake — 200 m earlier,
// when you started.
//
// SUCCESS carries the timing itself, objective-gated (the sc-ln-turn-lane-arrows
// road). No detector reads the М2 warning dashes — no ZoneKind carries them and
// none could grade INFORMATION — so the drill is graded as geometry: a radius-5
// gate on the oncoming bank early in the window (the pass must START early) and
// a radius-4 gate on the own-lane center at y = 270, the authored returnByY (be
// HOME, 30 m before the wall). A driver still out at 270 is a full 8.125 m lane
// pitch away from it.
// ---------------------------------------------------------------------------

/** ov-solid2-v1 pins, denormalized from the committed map by value (the L7 copy
 *  law — ov-solid2-districts.test.ts asserts every one against meta.scenario). */
const OVS2_LENGTH = 620;
const OVS2_OWN = 4.06;
/** The committed-pass line on the oncoming bank (the sc-ov-return-gap x). */
const OVS2_OUT = -2.5;
/** The М1 span — the wall the window closes against (meta.scenario.banZone). */
const OVS2_SOLID_FROM = 300;
const OVS2_SOLID_TO = 500;
/** Where the М2 dashes lengthen — the warning (meta.scenario.warningDashSpanY).
 *  Authored, UNGRADED: the copy and the gates carry it, no detector reads it. */
const OVS2_WARN_FROM = 240;
/** The drill's contract as a coordinate (meta.scenario.returnByY): fully home
 *  by here, 30 m before the wall. */
const OVS2_RETURN_BY = 270;

/**
 * The CRAWLER — the reason to overtake at all, and the mate the late return
 * cuts off. The ovgLeadCar mold (matchPlayer ~20 m of centers ≈ 16 m of bumpers
 * ahead, capped 11.1 m/s ≈ 40 km/h), pacing the player's OWN lane. ONE spec
 * serves three drives that want different things, and the cap is the hinge:
 *   - capped at 11.1 m/s on a 90 km/h road, a ~62 km/h pass closes ~6 m/s and
 *     completes inside the authored 285 m window with the 30 m landing margin
 *     intact — the generator asserts the window fits it;
 *   - the same cap makes the two LATE demos late for the same reason a real
 *     driver is: they dawdle behind it and start the identical maneuver 70 m
 *     further up the road;
 *   - followGapM 20 keeps every trail phase (30–38 km/h here) far above the
 *     following-distance fire band (0.7 × 1.8 s × 10.6 m/s ≈ 13 m), so
 *     FOLLOWING_TOO_CLOSE can never leak into a demo about the marking.
 * Its slam tier is authored out of reach (the OVN/OVCC mold): deterministic
 * moving traffic, not a braking drill.
 */
const OVS2_LEAD_CAR: BrakingLeadCarSpec = {
  id: "sc-ovsr-lead",
  kind: "brakingLeadCar",
  libraryEventId: "ev-overtake",
  actor: {
    pathNodes: ["ovs2-n-start", "ovs2-n-end"],
    hold: { nodeIndex: 0, offsetM: 45 }, // dormant ~30 m ahead of the spawn
    cruiseSpeedMps: 11.1,
    extraRightOffsetM: 0, // own-lane center (the vehicle being overtaken)
    colorIndex: 2,
  },
  followGapM: 20,
  maxMatchSpeedMps: 11.1, // ~40 km/h — the slow rural lead
  slamAt: { x: OVS2_OWN, y: 1400 }, // far past the 620 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur
  triggersHazard: false,
  resumeAfterSec: 3,
};

/**
 * The ONCOMING STREAM — the reason the window is SHORTER than the marking says.
 * TWO cars southbound at 12 m/s, released together on the player's first
 * movement: pure clockwork the drive scripts are authored against (the OVN
 * mold). Both are timed to MEET THE PLAYER EARLY, during the trail phase, and
 * that timing is the template's whole first act:
 *   - they eat the first ~100 m of the 285 m window, so the driver who „waits
 *     for a chance" arrives at the decision with two thirds of his dashes left,
 *     not all of them — the window on the paint and the window in the world are
 *     different numbers, and the second one is the one that counts;
 *   - having spent them BEFORE any excursion, the oncoming lane is genuinely
 *     empty for the rest of the drive. That is deliberate and load-bearing: the
 *     corridor tracker convicts an excursion whose measured oncoming gap sits
 *     under 4 s, and this template is not about the head-on gamble (that is
 *     sc-ov-oncoming-gap / sc-ov-abort, one district over). Here the pass is
 *     always SAFE and always legal — and still wrong, because it was late. One
 *     act, one lesson.
 * In INSTANT-CRUISE terms (a released car accelerating at the staged default
 * 2.6 m/s² loses v²/2a ≈ 28 m against an instant clock at 12 m/s, so a hold at
 * y tracks y + 28 − 12·t): car 0 holds at path arc 498 ⇒ y 122 ⇒ instant model
 * y 150; car 1 rides 60 m further up (instant model y 210), ~5 s behind it.
 */
const OVS2_STREAM: OncomingStreamSpec = {
  id: "sc-ovsr-stream",
  kind: "oncomingStream",
  libraryEventId: "ev-overtake",
  actor: {
    pathNodes: ["ovs2-n-end", "ovs2-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: OVS2_LENGTH - 122 }, // instant model y 150
    cruiseSpeedMps: 12,
    colorIndex: 1,
  },
  count: 2,
  gapsM: [60], // instant model y 210 — the second half of the early pair
  releaseKmh: 3,
};

/** OV-04 × OV-09 × SN-03 — комбинираната надлъжна маркировка като ЧАСОВНИК
 *  (Наредба № 2/2001: М2 е прекъсната осева — пресича се при изпреварване; М1 е
 *  непрекъсната — не се пресича и не се застъпва; удължените прекъсвания на М2
 *  предупреждават, че следва М1. ЗДвП чл. 42: изпреварването включва и
 *  ВРЪЩАНЕТО вдясно, без засичане на изпреварения). Bank-verified:
 *  q-signali-i-markirovka-055, q-signali-i-markirovka-054 (прекъсната срещу
 *  непрекъсната осева), q-signali-i-markirovka-014 (удължени прекъсвания —
 *  предупреждение за наближаваща непрекъсната), q-manevri-048 (маневрата
 *  завършва изцяло в своята лента). */
export const SC_OV_SOLID_RETURN: ScenarioSpec = {
  id: "sc-ov-solid-return",
  family: "lanes",
  tagsBg: ["изпреварване", "осева линия", "непрекъсната линия", "маркировка", "прибиране вдясно"],
  titleBg: "Прибери се преди плътната линия",
  objectiveBg:
    "Планирай изпреварването така, че връщането вдясно да приключи ПРЕДИ началото на непрекъснатата линия — комбинираната маркировка ти казва кога прозорецът се затваря.",
  archetypeIds: ["OV-04", "OV-09", "SN-03"],
  conceptIds: [
    "c-longitudinal-markings",
    "c-overtaking-procedure",
    "c-overtaking-prohibitions",
    "c-general-care-duty",
  ],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ov-solid2-v1.json meta.scenario.params
    // (tools/maps/gen_ov_solid2.mjs).
    params: {
      lengthM: OVS2_LENGTH,
      maxspeedKmh: 90,
      banKind: "solidCenterLine",
      banFromM: OVS2_SOLID_FROM,
      banToM: OVS2_SOLID_TO,
      warnFromM: OVS2_WARN_FROM,
      returnMarginM: 30,
    },
    districtId: "ov-solid2-v1",
  },
  start: {
    spawnPointId: "ovs2-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Извънградски път, по една лента в посока, ограничение 90. Пред теб пълзи бавна кола с около 40 км/ч." },
    { n: 2, textBg: "Осевата линия е ПРЕКЪСНАТА (М2): изпреварването тук е разрешено. Но напред, на 300-ия метър, тя става НЕПРЕКЪСНАТА (М1) — там прозорецът свършва." },
    { n: 3, textBg: "Първо изчакай насрещните коли да минат — докато те идват, прозорецът не е твой, колкото и прекъсната да е линията." },
    { n: 4, textBg: "Щом насрещното платно се изчисти, ЗАПОЧНИ ВЕДНАГА: огледало, ляв мигач, решително излизане. Всяка изчакана секунда е метри, отнети от връщането ти." },
    { n: 5, textBg: "Виж ли, че прекъсванията се удължават — това е предупреждението: плътната линия е на 60 метра. Оттам вече не се започва нищо." },
    { n: 6, textBg: "Прибери се вдясно с мигач, щом видиш ЦЯЛАТА изпреварена кола в огледалото — и бъди изцяло в своята лента най-късно на 270-ия метър." },
    { n: 7, textBg: "Прецениш ли, че прозорецът вече не стига — не започвай. Оставането зад бавната кола до края на участъка е пълноценно изпълнение на този урок: маневра без изход не се прави, а решението „не сега“ е самото умение, което се учи тук." },
    { n: 8, textBg: "Продължи в своята лента през целия участък с непрекъсната линия до края на отсечката." },
  ],
  success: [
    {
      id: "sc-ovsr-pass",
      titleBg: "Стигни последната точка, от която пасът още се побира (м. 180)",
      // LEDGER B8 (doc 86 §3) — the second of the two coerced overtakes.
      //
      // This gate was x = OVS2_OUT (−2.5) radius 5: 6.56 m off the own-lane
      // centre, so it was satisfiable ONLY from a committed excursion into the
      // oncoming lane. As a MANDATORY objective it meant the drill could not be
      // finished without overtaking — the student who read «прекъсната линия, но
      // насреща идва кола, ще изчакам» made the choice чл. 42 wants and was
      // scored `completedAll: false`, one star, next rung locked.
      //
      // Repaired the same way as sc-ovcc-pass: the gate keeps its POSITION on the
      // road (y = 180 is still the last mark from which a whole pass plus the
      // 30 m landing margin fits, and it still fires BEFORE sc-ovsr-home, so the
      // taught order is intact) and becomes lane-agnostic — centre x = 0.78 is
      // the midpoint of own 4.06 and the committed-pass line −2.50, radius 6
      // admits both with ~2.7 m of slack. What the drill grades is unchanged and
      // undiluted: CROSSED_SOLID_LINE and OVERTAKE_RETURN_TOO_EARLY still bill
      // the late pass, and sc-ovsr-home still demands being fully home by 270.
      params: { kind: "reachZone", x: (OVS2_OWN + OVS2_OUT) / 2, y: 180, radiusM: 6 },
    },
    {
      id: "sc-ovsr-home",
      titleBg: "Бъди изцяло в своята лента преди началото на М1",
      // THE drill, in one gate — the map's own returnByY. Radius 4 < the
      // 8.125 m lane pitch: a driver still on the oncoming bank at y = 270 is a
      // full lane away and fails it, whether he is about to cross the solid
      // line or about to cut back in front of the crawler. Both taught faults,
      // one objective.
      params: { kind: "reachZone", x: OVS2_OWN, y: OVS2_RETURN_BY, radiusM: 4 },
    },
    {
      id: "sc-ovsr-finish",
      titleBg: "Премини участъка с непрекъсната линия в своята лента",
      params: { kind: "reachZone", x: OVS2_OWN, y: 560, radiusM: 5 },
    },
  ],
  rubric: { parTimeSec: 85 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scOvSolidReturn.ts; gates in traces/__tests__/
  // sc-ov-solid-return-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ov-solid-return/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ov-solid-return/mistake-return-on-solid.trace.json" },
      titleBg: "Връщане върху вече плътната линия",
      whatWentWrongBg:
        "Изпреварването беше законно, когато започна — и незаконно, когато свърши. Водачът се помая зад бавната кола, излезе чак на 190-ия метър и подмина чисто; само че връщането го завари СЛЕД 300-ия метър, където осевата вече е непрекъсната. И той я пресече, защото друг избор вече нямаше. Точно това е капанът на комбинираната маркировка: М1 не забранява само излизането — тя забранява и прибирането, а маневра, започната в прозореца, ЗАВЪРШВА там, където линията вече е плътна. Удължените прекъсвания от 240-ия метър бяха предупреждението, което щеше да го спре навреме.",
      codeRefs: ["CROSSED_SOLID_LINE"],
    },
    {
      traceRef: { path: "content/traces/sc-ov-solid-return/mistake-late-cut.trace.json" },
      titleBg: "Отрязване на изпреварения при късното прибиране",
      whatWentWrongBg:
        "Същото закъсняло излизане, другият изход от него: този водач видя плътната линия да идва и се хвърли обратно вдясно — на метри пред носа на изпреварения, под секунда дистанция. Изпревареният натисна спирачка заради чужда маневра. Забележи какво НЕ е сгрешено тук: насрещното платно беше празно, линията беше прекъсната, прибирането стана навреме спрямо маркировката. Сгрешено е планирането — прозорецът беше премерен за подминаването, а не за цялата маневра. Прибираш се едва когато видиш целия изпреваран в огледалото (чл. 42), а това означава да излезеш достатъчно рано, че да имаш място за него.",
      codeRefs: ["OVERTAKE_RETURN_TOO_EARLY"],
    },
  ],
  teach: {
    whenBg:
      "На всеки двупосочен извънградски път зад по-бавно превозно средство — тоест почти при всяко изпреварване извън града. Маркировката те предупреждава два пъти и двата пъти отдалеч: прекъснатата осева казва „може“, удължените прекъсвания казват „остават ти шейсет метра“, а непрекъснатата казва „свърши“. Решението се взема при ПЪРВИЯ знак, не при последния.",
    whyBg:
      "Изпреварването е една маневра, а не две: излизане, подминаване и ВРЪЩАНЕ — и законна е само ако цялата се побира там, където е разрешена. Точно това пропуска мисленето „ще успея да го мина“: успяваш да го минеш, а нямаш къде да се прибереш. Оттам нататък всички изходи са лоши — или пресичаш непрекъснатата линия, нарисувана именно защото там навлизането в насрещното убива, или се хвърляш вдясно пред носа на изпреварения и го караш да спира заради теб. Затова маркировката е часовник, а не декорация: прекъснатата линия ти дава прозорец, удължените прекъсвания ти казват колко е останало от него, а плътната идва точно там, където видимостта или ширината вече не прощават. Прочети ги отдалеч, започни рано или изобщо не започвай — минута зад бавната кола не струва нищо, а маневра без изход струва челен удар или чужда спирачка.",
    lawRef: "Наредба № 2/2001; ЗДвП чл. 42",
    examinerBg:
      "Изпитващият гледа кога вземаш решението, а не колко бързо минаваш: очаква да разчетеш комбинираната маркировка отдалеч, да изчакаш насрещните, да излезеш решително в отворения прозорец и да си изцяло в своята лента преди началото на непрекъснатата линия. Пресичане на непрекъснатата осева при прибирането е основна грешка (3 т.), а срещу идваща кола — опасна и проваля изпита; засичането на изпреварения е основна грешка. Започнато изпреварване след удължените прекъсвания се отбелязва като неразчитане на маркировката дори когато „се размине“.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [OVS2_LEAD_CAR, OVS2_STREAM],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 6. sc-ln-boulevard-discipline — „Лентова дисциплина на булеварда" (OV-11
//    keep-right × OV-02 lane-change signalling × OV-12 lane keeping) on
//    wb-boulevard-v1, REUSED: a 200 m URBAN 2+2 posted 40, whose only other
//    tenant is the sc-maneuver-uturn drill (different file, no conflict).
//
// WHY THIS IS NOT sc-ov-keep-right, AND WHY IT NEEDED A CAR. The live OV-11
// template is a PURE ride: 360 m of rural-feeling boulevard, no actor, and the
// whole contract is „never leave laneId 0". That teaches half of чл. 15 — the
// half that says where you live. It cannot teach the other half, because
// nothing on that map ever gives you a REASON to leave: „лявата е за
// изпреварване" is a sentence the student reads, never a thing the student
// does. This template is the other half: the same law on an urban 2+2, with a
// legitimate pass-and-return arc in the middle. Keeping right is not the drill;
// COMING BACK is.
//
// THE BACKLOG SAID `staged: []` AND ALSO „a signaled pass of a slow prop car".
// Those cannot both be true, and the shadow plan wins: a pass of nothing is
// theatre, and without the pass this template is sc-ov-keep-right with a
// shorter road. So the slow car is staged — in the OVN/OVCC/OVS2 mold
// (brakingLeadCar with its slam tier authored out of reach), the house pattern
// for „deterministic slow traffic you overtake", never a braking drill.
//
// WHY THE MISTAKES GRADE WHAT THEY GRADE. Both faults have shipped detectors
// and this map arms them cleanly — no honest-proxy footnote needed:
//   - „Постоянно каране в лявата лента" → NOT_KEEPING_RIGHT (чл. 15), the 12 s
//     keep-right sustain in laneId 1 with the left indicator OFF. The demo
//     enters the left lane BY THE BOOK (mirror → indicator → move, so no
//     lane-change code can leak) and then simply never comes home: the isolated
//     fault is the STAY, which is exactly the урбанистичен грях this template
//     exists for;
//   - „Лутане между лентите без мигач" → LANE_CHANGE_WITHOUT_INDICATOR +
//     POOR_LANE_KEEPING. The weave glances every time (mirrorOk holds, so the
//     _MIRROR_CHECK code never leaks) and signals never — three crossings, one
//     code — and the long straddle of the LANE BOUNDARY bills the lane-keep
//     episode.
//
// THE STRADDLE'S SIDE IS LOAD-BEARING, not decoration. centerLineCond
// (rules/engine.ts stage 4) arms on `laneId === laneCount-1 && laneOffsetM >
// laneKeepMaxOffsetM` — i.e. the LEFTMOST lane drifting TOWARD the осева — and
// when it arms it SUPPRESSES the generic lane-keep episode and bills
// CENTER_LINE_TOUCHED instead (one act, one code). So a weave that wanders
// toward x = 0 would grade the wrong code entirely. This one straddles the
// 0/1 LANE BOUNDARY (x ≈ 8.125) from the left lane: |laneOffsetM| ≈ 3.9 > the
// 3.25 m tolerance (offCentre ✓) while laneOffsetM is NEGATIVE (centerLineCond
// ✗, it is a drift toward the CURB side of its own lane) — POOR_LANE_KEEPING,
// which is what doc 72 OV-12 names and what „лутане" actually looks like.
//
// NO CLEAN_DRIVING HERE, AND THAT IS THE MAP'S FAULT, NOT THE DRIVE'S:
// cleanDrivingDistanceM is 250 m and this boulevard is 200 m long, so the
// shadow's ~170 m of violation-free road cannot reach the streak. Its gate
// asserts ZERO violations + the TWO SAFE_LANE_CHANGE commendations the arc
// earns (out and back) — the positive evidence this road can actually pay.
// ---------------------------------------------------------------------------

/** wb-boulevard-v1 lane centers, pinned by value from the committed map (the L7
 *  copy law — wb-district.test.ts asserts both against meta.scenario). laneId 0
 *  = the curb lane you live in; laneId 1 = the lane you only VISIT. */
const LNBD_RIGHT = 12.19;
const LNBD_LEFT = 4.06;
/** wb-boulevard-v1 road length / posted limit (meta.scenario.params). */
const LNBD_LENGTH = 200;
const LNBD_LIMIT = 40;

/**
 * The CRAWLER („бавната кола") — the only reason lane 1 exists on this drill,
 * and the single
 * most load-bearing number in the template. The OVN/OVCC/OVS2 mold: a
 * brakingLeadCar whose slam tier is authored out of reach (slamAt 700 m past a
 * 200 m road + minSlamSpeedKmh 250 + proximityFallbackM 0.3), so the encounter
 * never resolves and never grades — deterministic moving traffic, not a braking
 * drill. extraRightOffsetM 0 = the traffic graph's curb-lane centerline, which
 * on a 2+2 lands on x = 12.19 (the ln-v1 precedent; the wb battery pins it).
 *
 * maxMatchSpeedMps 5.5 (~20 km/h) is the hinge ONE spec has to swing three ways:
 *   - the shadow approaches at 38 and closes ~5 m/s, so the pass is a real
 *     overtake that still completes inside 200 m of road with the return landed
 *     ~25 m clear of the crawler's nose;
 *   - the left-lane hog leaves at y ≈ 44 and never comes back, so the crawler
 *     is never its lead again — its 12 s in laneId 1 bill NOTHING but чл. 15;
 *   - the weave runs at ~22 km/h, one hair over the crawler's pace, so the
 *     45 m followGapM barely closes across the whole demo: at 6.1 m/s the
 *     follow band is 0.7 × 1.8 s × 6.1 ≈ 7.7 m of bumpers, and the gap never
 *     goes near it. FOLLOWING_TOO_CLOSE cannot leak into a demo about mirrors.
 */
const LNBD_CRAWLER: BrakingLeadCarSpec = {
  id: "sc-lnbd-crawler",
  kind: "brakingLeadCar",
  libraryEventId: "ev-lane-discipline",
  actor: {
    pathNodes: ["wb-n-start", "wb-n-end"],
    hold: { nodeIndex: 0, offsetM: 60 }, // dormant 45 m ahead of the spawn
    cruiseSpeedMps: 5.5,
    extraRightOffsetM: 0, // curb-lane center = the player's own lane
    colorIndex: 2,
  },
  followGapM: 45,
  maxMatchSpeedMps: 5.5, // ~20 km/h — see the doc above: the hinge of all three
  slamAt: { x: LNBD_RIGHT, y: 900 }, // far past the 200 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur
  triggersHazard: false,
  resumeAfterSec: 3,
};

/** OV-11 × OV-02 × OV-12 — лентова дисциплина на многолентов път в населено
 *  място (ЗДвП чл. 15, ал. 1: извън изпреварване и ляв завой водачът се движи
 *  възможно най-вдясно; чл. 25: маневрата се обявява и се прави след оглед).
 *  Bank-verified: q-manevri-032 и q-manevri-004 (дясната лента е лентата за
 *  движение; лявата — за изпреварване), q-magistrali-i-izvangradsko-003
 *  („възможно най-вдясно"), q-manevri-005 и q-manevri-058 (престрояването е
 *  маневра: огледало, мигач, оглед). */
export const SC_LN_BOULEVARD_DISCIPLINE: ScenarioSpec = {
  id: "sc-ln-boulevard-discipline",
  family: "lanes",
  tagsBg: ["ленти", "лентова дисциплина", "булевард", "дръж вдясно", "изпреварване в града"],
  titleBg: "Лентова дисциплина на булеварда",
  objectiveBg:
    "На многолентов булевард се движиш в дясната лента, лявата е за изпреварване и ляв завой — без лутане между лентите.",
  archetypeIds: ["OV-11", "OV-02", "OV-12"],
  conceptIds: ["c-right-side-rule", "c-lane-choice", "c-lane-change", "c-overtaking-procedure"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in wb-boulevard-v1.json meta.scenario.params
    // (tools/maps/gen_wide_boulevard.mjs; REUSED — sc-maneuver-uturn is the
    // other tenant, and it never leaves the mid-block turn corridor).
    params: { lengthM: LNBD_LENGTH, maxspeedKmh: LNBD_LIMIT, lanes: 4 },
    districtId: "wb-boulevard-v1",
  },
  start: {
    spawnPointId: "wb-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Градски булевард с две ленти в посока, ограничение 40. Потегли и се установи в ДЯСНАТА лента — тя е лентата ти за движение." },
    { n: 2, textBg: "Пред теб пълзи бавна кола с около 20 км/ч. Ето сега лявата лента ти трябва — и точно за това е тя." },
    { n: 3, textBg: "По реда: огледало, ляв мигач, поглед през рамо, после плавно излизане в лявата лента." },
    { n: 4, textBg: "Изпревари решително и без да превишаваш 40 — лявата лента е за маневра, а не за скорост." },
    { n: 5, textBg: "Щом видиш ЦЯЛАТА изпреварена кола в огледалото: десен мигач и веднага се прибери вдясно. Тук свършва маневрата — не „като стане нужда“." },
    { n: 6, textBg: "Продължи в дясната лента до края на отсечката. Едно излизане, едно прибиране — без лутане между лентите." },
  ],
  success: [
    {
      id: "sc-lnbd-right",
      titleBg: "Установи се в дясната лента",
      // Radius 4 < the 8.125 m lane pitch: satisfiable ONLY from the curb lane.
      // Placed BEFORE the pass — the drill starts where you belong.
      params: { kind: "reachZone", x: LNBD_RIGHT, y: 40, radiusM: 4, maxSpeedKmh: 45 },
    },
    {
      id: "sc-lnbd-pass",
      titleBg: "Изпревари бавната кола през лявата лента",
      // The other half of чл. 15: the ban is „не живей там", not „не влизай".
      // Radius 4 on the LEFT-lane center — reachable only by actually committing
      // the pass. maxSpeedKmh 45 keeps it a MANEUVER, not a sprint.
      params: { kind: "reachZone", x: LNBD_LEFT, y: 115, radiusM: 4, maxSpeedKmh: 45 },
    },
    {
      id: "sc-lnbd-home",
      titleBg: "Прибери се вдясно и завърши в своята лента",
      // THE drill, in one gate: a driver still in laneId 1 at y = 175 is a full
      // 8.125 m lane pitch away from it and fails — which is precisely the
      // left-lane hog's verdict.
      params: { kind: "reachZone", x: LNBD_RIGHT, y: 175, radiusM: 4 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scLnBoulevardDiscipline.ts; gates in traces/__tests__/
  // sc-ln-boulevard-discipline-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ln-boulevard-discipline/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ln-boulevard-discipline/mistake-left-lane-hog.trace.json" },
      titleBg: "Постоянно каране в лявата лента",
      whatWentWrongBg:
        "Излизането беше учебникарско — огледало, мигач, плавно — и точно затова грешката личи толкова ясно: този водач не сгреши маневрата, а забрави, че тя има край. Бавната кола остана далеч назад, дясната лента е празна цялата отсечка, а колата продължава вляво „за всеки случай“, „и без това пак ще изпреварвам“. Не пак: сега. Лявата лента не е по-бърза, а по-подредена — тя е празното място, което другите ползват, за да минат. Като стоиш в нея, зад теб се събира колона, която няма законен изход, и рано или късно някой ще те подмине отдясно — най-опасното изпреварване, което съществува. Извън изпреварване и ляв завой мястото ти е във възможно най-дясната свободна лента (чл. 15).",
      codeRefs: ["NOT_KEEPING_RIGHT"],
    },
    {
      traceRef: { path: "content/traces/sc-ln-boulevard-discipline/mistake-weaving.trace.json" },
      titleBg: "Лутане между лентите без мигач",
      whatWentWrongBg:
        "Наляво, надясно, пак наляво — и нито един мигач. Водачът дори се оглеждаше: проблемът не е, че не гледа, а че никой друг не знае какво е видял. Мигачът не е за теб, а за останалите: той е единственият начин колата ти да обяви решение, преди да го изпълни. Между двете дръпвания колата увисна на самата линия между лентите — нито в едната, нито в другата, тоест в двете едновременно: в лявата някой те изпреварва, в дясната някой те подминава, и двамата се оказват до колa, която не заема нито едно място докрай. На булевард лентата е обещание — заеми една, обяви я и я дръж; смяната е отделно решение, не навик на волана.",
      codeRefs: ["LANE_CHANGE_WITHOUT_INDICATOR", "POOR_LANE_KEEPING"],
    },
  ],
  teach: {
    whenBg:
      "На всеки градски булевард с две и повече ленти в посока — тоест по цялата „Цариградско“, по всяко околовръстно, на всеки изход от квартала към голямата улица. Правилото работи всяка секунда, а не само когато има трафик: пътуваш в най-дясната свободна лента, влизаш в лявата само за да изпревариш или да завиеш наляво, и се прибираш веднага щом маневрата свърши.",
    whyBg:
      "Многолентовият булевард е по-безопасен от еднолентовата улица само докато лентите значат нещо. Значението е просто: дясната е за пътуване, лявата е свободното място, през което другите минават. Който се настани вляво, изяжда точно това свободно място — зад него се трупа колона без законен изход, а натискът намира най-лошия: изпреварване отдясно, през лентата, в която никой не очаква изпреварващ. Втората половина на същия закон е връщането: маневрата не е „излизане“, а излизане И прибиране, и незавършената маневра оставя колата ти легнала върху чуждото решение. А лутането между лентите без мигач е третата страна на същата монета — то не нарушава лентата, а обещанието: другите планират спрямо мястото, което заемаш, и когато то се мени без предупреждение, планът им е грешен, преди да си направил нещо забранено.",
    lawRef: "ЗДвП чл. 15",
    examinerBg:
      "Изпитващият следи лентовата ти дисциплина през целия маршрут: движение в дясната лента, ползване на лявата само за изпреварване или ляв завой, огледало и мигач преди всяко престрояване и своевременно прибиране вдясно веднага след маневрата. Продължителното движение в лявата лента без причина е второстепенна грешка; престрояването без мигач е основна; непрекъснатото местене между лентите се отбелязва като липса на лентова дисциплина.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [LNBD_CRAWLER],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 7. sc-ln-obstacle-meeting — „Препятствието е в твоята половина" (OV-18
//    „Обект на платното — заобикаляне" × OV-14 narrow meeting) on ov-narrow-v1,
//    REUSED: the live sc-ov-narrow (templates-flow-era, templates-lanes.ts) is
//    the other tenant of this 240 m 1+1, and the two are deliberately different
//    drills on the same street.
//
// WHAT THIS TEACHES THAT sc-ov-narrow DOES NOT. The live template is a
// SYMMETRIC negotiation: a parked row narrows the street, someone comes, and the
// lesson is the rule („from whose side the obstruction is, he waits"). Its
// mistakes grade FAILED_TO_YIELD — the priority ABSTRACTION. This one is the
// bank's own frame (q-manevri-016: „паркиран бус заема половината от твоята
// лента, а насреща идва автомобил"; q-predimstvo-030; q-manevri-050 — the
// mirrored case; q-manevri-049 — the obstacle that closes the lane entirely),
// and it teaches the CONSEQUENCE instead: the metre of tarmac you are about to
// borrow belongs to a car that is already using it, and чл. 44's „не пречи на
// насрещните" is a description of physics before it is a rule. So the drill is
// a QUEUE — the first oncoming car passes, and the second one is the whole
// lesson: the driver who reads „the road is clear" from the first car's tail
// lights is the driver this template exists for.
//
// WHY THE MISTAKES GRADE WHAT THEY GRADE. Meeting priority has no dedicated
// detector and deliberately gets none (doc 76's deferred list; the OV-14 runner
// adjudicates the narrow-passage act and its vocabulary is spoken for by
// sc-ov-narrow). The honest grading here is therefore the pair the act carries
// with it in the real world:
//   - the pull-out in front of an approaching car ends in CONTACT — a real one:
//     both demos physically hit the staged oncoming car through the shipped
//     OncomingStreamRunner contact check (the staged car's playerGuard brakes it
//     to a standstill 6 m short — and the demo drives into it anyway, which is
//     exactly what „изнасяне пред идваща кола" looks like from inside the other
//     car). Nothing is narrated: no scripted collision beat is used;
//   - the squeeze-past („провиране") rides the осева with the indicator dark for
//     4 s before it ever meets anyone, which is CENTER_LINE_TOUCHED verbatim
//     (rules/engine.ts stage 4: `laneId === laneCount-1 && laneOffsetM >
//     3.25 && indicator === "off"` — on this 1+1 the whole road is laneId 0 with
//     laneCount 1, so the band is |x| < 0.81 m, the paint itself).
// SUCCESS is objective-gated, and the gates are the drill: a reachZone of radius
// 4 (< the 8.125 m lane pitch) with maxSpeedKmh 6 behind the obstacle can only
// be satisfied by a car that ACTUALLY STOPPED in its own half, and the pass gate
// on the opposing lane centre can only be satisfied by a car that actually went
// around. Wait → round → home, in that order.
//
// THE TWO CONVICTIONS THE DEMOS MUST NOT LEAK, and why they cannot:
//   - FAILED_TO_YIELD (the OV-14 runner's narrow-passage bill) needs the player
//     BARGING INSIDE the section (`playerAlong >= -2`, i.e. y >= 138) for 0.9 s.
//     Both demos die at y ≈ 128-133 — a dozen metres short of the section — so
//     the barge condition is never even armed. That is not a dodge: they never
//     reach the стеснение, because the car that had the right of way was already
//     there. The runner's own contact check never fires either (its actor is the
//     SECOND car, still north of the section when both demos end).
//   - OVERTAKE_INSUFFICIENT_GAP (the corridor tracker) arms on opposingBank and
//     needs > 20 km/h (OVERTAKE_COMMIT_MIN_KMH) to count as committed. Both
//     demos cross the line at 14-16 km/h — a squeeze, not a pass — so the
//     corridor never bills. The shadow's own pass is 12 km/h for the same
//     reason. This is honest for the map: заобикалянето на препятствие is not
//     изпреварване, and grading it as one would teach the wrong law.
// ---------------------------------------------------------------------------

/** ov-narrow-v1 lane centres / road length / posted limit — pinned by value
 *  from the committed map (the L7 copy law; nm-district.test.ts asserts every
 *  one of these against meta.scenario + the runtime's own lane fix). */
const LNOM_OWN = 4.06;
const LNOM_ONC = -4.06;
const LNOM_LENGTH = 240;
const LNOM_LIMIT = 40;

/**
 * The obstacle + the FIRST oncoming car, in one shipped spec. The OV-14
 * narrowMeeting runner is the only staged event that carries held PROPS on the
 * player's own lane, and it is what makes this street a стеснение at all:
 *  - `props` = the parked row at y = 148 and y = 161, on the traffic graph's
 *    own lane centre (extraRightOffsetM 0 ⇒ x = 4.06 — the player's half,
 *    closed). They are staged held actors, never commanded (cruiseSpeedMps 0);
 *  - `obstructionSide: "player"` is the чл. 44 truth of the scene and the
 *    runner's adjudication axis: the side WITH the obstruction waits. The
 *    shadow's wait in its own lane earns YIELDED_TO_PRIORITY through it;
 *  - the ACTOR is oncoming car #2 — the one the runner syncs to arrive as the
 *    player arrives (armDistM 70), so the meeting is guaranteed no matter how
 *    fast the student drove up. It holds at y = 228, NORTH of the stream car
 *    below, so the queue arrives in authored order and no staged car ever
 *    drives through another.
 * Section [140, 174] wraps the parked row with ~8 m of margin at each end.
 * The car-rig HONESTY footnote: NarrowMeetingSpec.props carries no `profile`
 * field (PedestrianDartOutSpec.props does), so the „бус" of q-manevri-016 is
 * rendered by the default car rig and the copy says „паркирани коли" — the
 * lesson is the closed half of the carriageway, not the make of what closed it.
 */
const LNOM_MEETING: NarrowMeetingSpec = {
  id: "sc-lnom-meeting",
  kind: "narrowMeeting",
  libraryEventId: "ev-oncoming-meeting",
  sectionStart: { x: 0, y: 140 },
  sectionEnd: { x: 0, y: 174 },
  obstructionSide: "player",
  actor: {
    pathNodes: ["nm-n-end", "nm-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: 12 }, // y = 228 — behind the stream car
    cruiseSpeedMps: 6,
    colorIndex: 2,
  },
  // The actor's section entrance = the far (north) end: path arc 240 − 174.
  actorEntry: { nodeIndex: 0, offsetM: 66 },
  armDistM: 70,
  transitSpeedMps: 6,
  props: [
    { pathNodes: ["nm-n-start", "nm-n-end"], hold: { nodeIndex: 0, offsetM: 148 } },
    { pathNodes: ["nm-n-start", "nm-n-end"], hold: { nodeIndex: 0, offsetM: 161 } },
  ],
};

/**
 * Oncoming car #1 — the FIRST of the queue, and the template's whole difference
 * from sc-ov-narrow. ONE car (count 1, gapsM []), because the drill is not
 * „traffic": it is the single most expensive misreading in this scene — „едната
 * мина, значи мога". The oncomingStream runner is the right vehicle for it
 * precisely because it is CLOCKWORK: released the moment the player first moves
 * and then a pure function of time (no sync, no reaction to the student's
 * pace), so the car that arrives while you are still deciding is the same car
 * every single run. It emits ZERO SimTick events except a collision on physical
 * contact — which is exactly the grading channel both mistake demos ride.
 * hold y = 215 at 5.5 m/s ⇒ (instant-cruise model: hold + v²/2a ≈ +5.8 m) it
 * tracks y ≈ 221 − 5.5·t and passes the shadow's stopped nose at t ≈ 17 s.
 */
const LNOM_STREAM: OncomingStreamSpec = {
  id: "sc-lnom-stream",
  kind: "oncomingStream",
  libraryEventId: "ev-oncoming-meeting",
  actor: {
    pathNodes: ["nm-n-end", "nm-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: 25 }, // y = 215
    cruiseSpeedMps: 5.5,
    colorIndex: 1,
  },
  count: 1,
  gapsM: [],
  releaseKmh: 3,
};

/** OV-18 × OV-14 — препятствие в собствената половина (ЗДвП чл. 44: при
 *  разминаване водачът, от чиято страна е препятствието, изчаква насрещните и
 *  ги пропуска; самото разминаване става с достатъчно странично разстояние).
 *  Bank-verified: q-manevri-016 („Ти изчакваш — препятствието е в твоята
 *  половина от платното"), q-predimstvo-030 („нямаш предимство — изчакваш
 *  насрещния"), q-manevri-050 (огледалният случай: препятствието е в НЕГОВАТА
 *  половина, минаваш пръв, но с готовност да намалиш), q-manevri-049
 *  (заобикалянето започва едва след като насрещната лента е свободна). */
export const SC_LN_OBSTACLE_MEETING: ScenarioSpec = {
  id: "sc-ln-obstacle-meeting",
  family: "lanes",
  tagsBg: ["разминаване", "препятствие", "тясна улица", "предимство", "паркирани коли"],
  titleBg: "Препятствието е в твоята половина",
  objectiveBg:
    "Паркиран ред затваря ТВОЯТА половина: насрещният има предимство — изчакай зад препятствието и премини едва когато насрещното е чисто.",
  archetypeIds: ["OV-18", "OV-14"],
  conceptIds: [
    "c-oncoming-passing",
    "c-priority-concept",
    "c-maneuver-principles",
    "c-animals-obstacles",
  ],
  map: {
    archetype: "narrow-street",
    // The generator recipe — mirrored in ov-narrow-v1.json meta.scenario.params
    // (tools/maps/gen_narrow_street.mjs; REUSED — sc-ov-narrow is the other
    // tenant, and its own section sits at y ∈ [110, 145], clear of this one).
    params: { lengthM: LNOM_LENGTH, maxspeedKmh: LNOM_LIMIT },
    districtId: "ov-narrow-v1",
  },
  start: {
    spawnPointId: "nm-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Ledger L10: the L5 rung compiles night and HEADLIGHTS_OFF_AT_NIGHT is an
    // основна fault that grades unconditionally (ЗДвП чл. 70).
    { n: 1, textBg: "Тясна двупосочна улица, ограничение 40. Напред в ТВОЯТА лента е паркиран ред — половината ти платно е затворено и заобикалянето минава през насрещната лента. По тъмно провери първо късите светлини (чл. 70): в стеснение насрещният решава дали да тръгне по това дали те вижда." },
    { n: 2, textBg: "Точно това решава спора: препятствието е от твоята страна, значи предимството е на насрещния. Ти изчакваш, той минава (чл. 44)." },
    { n: 3, textBg: "Намали навреме и спри в СВОЯТА лента на няколко метра пред препятствието — оттам виждаш насрещното платно и не пречиш на никого." },
    { n: 4, textBg: "Насреща идват ДВЕ коли. Първата ще мине бързо — не тръгвай след нея: втората вече е зад завоя на вниманието ти." },
    { n: 5, textBg: "Изчакай и двете да отминат покрай теб. Чак когато насрещната лента е празна докрай: ляв мигач, оглед и една спокойна дъга покрай паркираните коли." },
    { n: 6, textBg: "Минавай с достатъчно странично разстояние от паркираните коли и се прибери в своята лента веднага след тях — маневрата свършва там, не по-късно." },
  ],
  success: [
    {
      id: "sc-lnom-wait",
      titleBg: "Спри в своята лента пред препятствието",
      // Radius 4 < the 8.125 m lane pitch: satisfiable ONLY from the own-lane
      // centre, and maxSpeedKmh 6 makes it unsatisfiable in motion. The gate IS
      // чл. 44: a car that rolled through here never waited for anybody.
      params: { kind: "reachZone", x: LNOM_OWN, y: 130, radiusM: 4, maxSpeedKmh: 6 },
    },
    {
      id: "sc-lnom-round",
      titleBg: "Заобиколи препятствието през свободната насрещна лента",
      // The other half of the act, and lane-exclusive the same way: this point
      // is reachable only from the opposing lane, beside the parked row — the
      // pass a driver who never committed cannot narrate.
      params: { kind: "reachZone", x: LNOM_ONC, y: 155, radiusM: 4, maxSpeedKmh: 30 },
    },
    {
      id: "sc-lnom-home",
      titleBg: "Прибери се в своята лента и завърши отсечката",
      // Radius 4 again: the маневра ends where you came home, so the last gate
      // is unsatisfiable by a car still hanging in the opposing lane 30 m past
      // the parked row — прибирането е част от заобикалянето, not an afterthought.
      params: { kind: "reachZone", x: LNOM_OWN, y: 205, radiusM: 4 },
    },
  ],
  rubric: { parTimeSec: 90 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scLnObstacleMeeting.ts; gates in traces/__tests__/
  // sc-ln-obstacle-meeting-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ln-obstacle-meeting/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ln-obstacle-meeting/mistake-pull-out.trace.json" },
      titleBg: "Изнасяне в насрещното пред идваща кола",
      whatWentWrongBg:
        "Колата не спря — изнесе се в насрещната лента точно пред приближаващия автомобил и го удари челно. Обърни внимание какво НЕ спаси положението: другият водач наби спирачки и спря напълно, а ударът все пак се случи, защото инерцията на изнеслия се не пита кой е прав. Тук няма „ще се разминем“ — при разминаване през стеснение платното не се дели наполовина: щом препятствието е в твоята половина, насрещният има предимство и ти нямаш какво да делиш с него. Заобикалянето започва след като насрещната лента е свободна, а не докато някой се движи по нея (чл. 44).",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-ln-obstacle-meeting/mistake-squeeze.trace.json" },
      titleBg: "Провиране с настъпване на осевата под насрещен",
      // GEOMETRY CORRECTION 2026-08-10. COLLISION was the second code and it
      // was the isotropic 3 m circle talking: this drive leans to x = −2.0
      // against a car on x = −4.06, i.e. 2.06 m of CENTRES between a 1.70 m
      // body and a 1.84 m body = 0.29 m of clear air. Exact geometry finds no
      // contact, and it is right — on THIS street. The reason is the one
      // sc-pk-double-park's header already documents at length:
      // PERCEPTUAL_ROAD_SCALE (×2.5) draws a 6.5 m carriageway as 16.25 m, so
      // the squeeze that is real in Sofia has 29 cm of spare asphalt here. The
      // card keeps the act it can prove (the осева) and stops claiming an
      // impact the geometry does not produce. THE CAPABILITY THIS IS WAITING
      // FOR is the same one named in templates-parking2: a per-district lane
      // width, after which this demo's contact becomes real and the code
      // returns on its own.
      //
      // COPY 2026-08-10, and the 0.29 above is NOT the number the card may
      // print. 0.29 is the NOMINAL clearance of the authored line (x = −2.0);
      // the DRIVE is steering, so the boxes are rotated, and the tightest frame
      // the production ContactProbe actually computes on this recording is
      // 0.192 m — measured by instrumenting ContactProbe.prototype through
      // recordScLnObstacleMeetingDrive, against `sc-lnom-stream-0` (the first
      // oncoming car), player at (−1.56, 126.52) doing 15.0 km/h. A card that
      // teaches „сантиметри" must name the ones the engine saw, so the prose
      // carries 0,19 m. It is also why the near miss is worth a card at all:
      // 19 cm is the whole margin the manoeuvre bought.
      whatWentWrongBg:
        "Класическото „ще се промъкна“: колата не изчака, а увисна върху осевата — нито в своята лента, нито в насрещната — и продължи така срещу приближаващата кола. Никой не се удари: най-тясното между двете купета е измерено и е 0,19 м. Деветнайсет сантиметра не са преценка, а късмет. Затова се отсъжда това, което наистина стана — трайно настъпване на осевата линия: второстепенна грешка, 1 наказателна точка от изпитния лист по Наредба № 38 (приложение № 5, т. 10, б. „б“), не контролни точки по книжката. Малкото число е цената на изхода, не на постъпката. Правилно: спираш В СВОЯТА лента зад препятствието, изчакваш насрещната да е ПРАЗНА докрай и минаваш цял, с достатъчно странично разстояние (ЗДвП чл. 44; чл. 20, ал. 2).",
      codeRefs: ["CENTER_LINE_TOUCHED"],
    },
  ],
  teach: {
    whenBg:
      "Всеки ден, във всеки квартал: паркиран бус, спрял камион на доставка, контейнер, паднал клон — нещо заема твоята половина от тясната двупосочна улица и единственият път напред минава през насрещната лента. Същото правило важи и огледално: когато препятствието е в НЕГОВАТА половина, ти минаваш пръв, но с готовност да намалиш, ако той вече е тръгнал.",
    whyBg:
      "Правилото звучи като въпрос за предимство, но всъщност е въпрос за пространство. Насрещната лента не е ничия — тя вече се ползва от някого, и когато твоята половина е затворена, ти си този, който иска чуждото място назаем. Затова законът е категоричен и удобно лесен за помнене: от чиято страна е препятствието, той изчаква. Двете грешки, които този урок показва, са двете страни на нетърпението — изнасянето пред идваща кола и провирането по осевата — и двете свършват на едно и също място, защото тясното платно не се дели наполовина: половин лента за теб и половин за насрещния е челен удар с добри намерения. Опасната част не е първата кола, а втората: щом първата отмине, пътят „изглежда чист“ точно в мига, в който не е. Затова се чака, докато насрещната лента е празна ДОКРАЙ, а не докато отмине този, когото си видял.",
    lawRef: "ЗДвП чл. 44",
    examinerBg:
      "Изпитващият гледа преценката при препятствие: навременно намаляване, спиране в собствената лента преди стеснението, изчакване на ЦЕЛИЯ насрещен поток и едва след това една спокойна дъга покрай препятствието с достатъчно странично разстояние и своевременно прибиране. Навлизането в насрещната лента пред движещ се насрещен автомобил е опасна грешка; возенето по осевата линия е второстепенна.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — нощем: the headlights are the only thing that says a car is coming,
    // and „чакай втората" gets much harder when the first pair of lights leaves
    // the street black behind it. RENDER/conditions axis only — no `physics`:
    // the authored ghost envelope is dry-tuned (ADR-006 stage 4a).
    { level: 5, conditions: { night: true } },
  ],
  staged: [LNOM_STREAM, LNOM_MEETING],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The lane-arrow templates, in catalog order (registered in templates.ts by
 *  the integration pass). */
export const SCENARIO_TEMPLATES_LANES2: readonly ScenarioSpec[] = [
  SC_LN_TURN_LANE_ARROWS,
  SC_OV_NIGHT_GAP,
  SC_OV_BEING_OVERTAKEN,
  SC_OV_CREST_CURVE,
  SC_OV_SOLID_RETURN,
  SC_LN_BOULEVARD_DISCIPLINE,
  SC_LN_OBSTACLE_MEETING,
];
