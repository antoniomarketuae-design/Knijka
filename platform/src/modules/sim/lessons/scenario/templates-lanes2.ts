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
 *
 * WHY THE MISTAKES GRADE WHAT THEY GRADE. The lane-intent layer (per-approach-
 * lane allowed movements in district data) is doc 72 N3 work that has NOT
 * landed: no detector reads a painted arrow, so „turned left from the
 * straight-only lane" has no code of its own. This template therefore grades
 * the arrow discipline the honest way:
 *   - SUCCESS is objective-gated — a reachZone of radius 4 m (< the 8.125 m
 *     lane pitch) on the LEFT-arrow lane's center is satisfiable ONLY from that
 *     lane, so the graded contract IS „take the lane your arrow commands";
 *   - the MISTAKE demos grade the faults that always travel with an arrow
 *     violation and DO have shipped detectors: turning without the indicator
 *     (TURN_WITHOUT_INDICATOR) and dragging the wrong lane through the exit
 *     (POOR_LANE_KEEPING); the late cross-two-lanes swerve grades the pair the
 *     lane-change tracker exists for (LANE_CHANGE_WITHOUT_INDICATOR /
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
  OncomingStreamSpec,
  RearTailgaterSpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";

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
      codeRefs: ["TURN_WITHOUT_INDICATOR", "POOR_LANE_KEEPING"],
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
    { n: 4, textBg: "Ако можеш, свали 5 км/ч — така съкращаваш времето, което той прекарва в насрещното платно." },
    { n: 5, textBg: "Не се дърпай наляво „да го погледнеш“ и не настъпвай осевата — там е точно колата, която те изпреварва." },
    { n: 6, textBg: "Изчакай го да те подмине и чак тогава се върни в средата на лентата и към нормалната си скорост." },
  ],
  success: [
    {
      id: "sc-ovbo-hold",
      titleBg: "Не ускорявай, докато те изпреварват",
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

/** The lane-arrow templates, in catalog order (registered in templates.ts by
 *  the integration pass). */
export const SCENARIO_TEMPLATES_LANES2: readonly ScenarioSpec[] = [
  SC_LN_TURN_LANE_ARROWS,
  SC_OV_NIGHT_GAP,
  SC_OV_BEING_OVERTAKEN,
];
