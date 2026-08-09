/**
 * Scenario templates — the SIGNALS family, dead/flashing-signal capability
 * wave (doc 72 JU-20 „Мигащо жълто / Flashing-amber (dead signal) fallback").
 * DATA ONLY (the templates.ts law): coordinates are denormalized from the
 * committed sx-v1.json (the signalized X-junction, tools/maps/gen_signal_x.mjs)
 * so nothing loads world JSON at runtime; the sx-district battery asserts the
 * pinned geometry and the sc-signals trace gate replays the drives through the
 * production stack.
 *
 * THE CAPABILITY (doc 72 JU-20 „Engine: NEW signal-mode state … grading falls
 * back to the EXISTING give-way/RHR adjudication once the mode maps to
 * unsignalized"): the runtime signal cluster can be dialed DARK / on FLASHING
 * AMBER at session start (recorder signalModes → runtime setSignalClusterMode).
 * A cluster in either mode carries NO phase — no signal codes fire on its stop
 * lines — and the junction is governed by the shipped right-hand-rule tracker
 * (conflictFromRight → prioritySituation{right-hand-rule} → FAILED_TO_YIELD /
 * YIELDED_TO_PRIORITY). Both templates below run the SAME priorityFromRight
 * runner the uncontrolled junction family already ships (sc-junction-rhr /
 * sc-junction-blind), on sx-n-c, with junctionControl "uncontrolled".
 *
 * Two distinct drives, one capability:
 *   sc-signal-dead     — a DEAD (загаснал) signal; the player turns LEFT from
 *                        the south stem to the west arm and gives way to the
 *                        car from the right (east). Mirrors sc-junction-blind's
 *                        proven left-turn RHR dynamics on the signalized map.
 *   sc-signal-flashing — FLASHING AMBER; the player drives STRAIGHT through
 *                        (south → north), still giving way to the car from the
 *                        right (east). A different maneuver on the same fallback.
 *
 * Geometry pinned to sx-v1 (battery sx-district.test.ts):
 *   - sx-n-c is ONE single-node signal cluster at the origin (degree 4);
 *   - drawn lane centers sit ±4.0625 m off the road centerline;
 *   - the derived stop line on every arm is 27.725 m from the node (mouth
 *     27.125 + 0.6 paint inset), NOT the 17 m of tj-rhr/tj-occluded — sx-v1's
 *     ns road is `secondary`, so its half-width carries a parking band and its
 *     corner radius is the arterial 15 m. T7 (ledger §2) was exactly this
 *     confusion: `lineDistM 18` copied tj-rhr's mouth onto a map whose paint is
 *     9.7 m further out. Both shadows now yield at y = −29.5 — 1.78 m SHORT of
 *     the line, the proven sc-signal-redyellow / sc-jx-blocked-exit hold pose —
 *     and still well outside the engine's 18 m right-hand-rule core.
 */

import type { ScenarioSpec } from "./types";
import type {
  BrakingLeadCarSpec,
  PriorityFromRightSpec,
  TrafficControllerSpec,
} from "../../contracts";
import { l5BusyStreet } from "./complications";

/** Drawn lane-center offset from the road centerline on sx-v1, m. */
export const SIGNAL_LANE_CENTER_M = 4.0625;

// ---------------------------------------------------------------------------
// L4 (ledger §4) — the регулировчик's gestures, and what each one MEANS
// ---------------------------------------------------------------------------

/** A posture the JU-18 officer can hold (ППЗДвП чл. 29, ал. 3). */
export type ControllerPosture = "sideProfile" | "chestOrBack" | "armRaised";

/**
 * One gesture, explained the way the founder asked for it: not „that is the
 * side profile" but **who may go, who must stop, and whose priority it is.**
 *
 * THEO-4: a student watching a figure change pose learns nothing from the pose
 * alone — the simulator has to say what it MEANS, in the same breath, or it is
 * a bare correct/wrong verdict wearing a costume. `lawRef` is retrieval, not
 * recall (ADR-002): ППЗДвП чл. 29, ал. 3 defines these three postures and ЗДвП чл. 7
 * puts them above the lamps and the signs.
 *
 * CITATION CORRECTED 2026-08-03. Every posture here used to cite „ППЗДвП
 * чл. 66". ППЗДвП чл. 66 is „Другите средства за сигнализиране имат следните
 * форми, изображения, наименования и значения: 1. „Направляващо стълбче" —
 * С1…" — marker posts, cones and barriers. It has nothing to do with a
 * регулировчик. The postures are ППЗДвП чл. 29, ал. 3, retrieved verbatim:
 *
 *   „(3) Сигнали на регулировчика са следните положения на тялото и ръцете му:
 *   1. дясна ръка, вдигната вертикално - означава „Внимание, спри!"… При
 *   подаване на този сигнал на кръстовище участниците в движението, които са
 *   навлезли в кръстовището, трябва да го освободят;
 *   2. ръка или ръце, протегнати хоризонтално встрани - след като е подал този
 *   сигнал, регулировчикът може да свали ръката или ръцете си. Сигналът
 *   означава: а) „Преминаването е разрешено" за водачите, които се намират
 *   срещу лявото или дясното рамо на регулировчика…; б) „Преминаването е
 *   забранено" за всички останали участници в движението;
 *   3. дясна ръка, протегната хоризонтално напред…"
 *
 * The three sentences below were already faithful to that text — only the
 * article number was wrong.
 */
export interface ControllerGesture {
  posture: ControllerPosture;
  /** What the student is looking at — the physical read. */
  poseBg: string;
  /** Who may go. */
  goBg: string;
  /** Who must stop. */
  stopBg: string;
  /** Whose priority it is, and why it beats what the lamp says. */
  priorityBg: string;
  lawRef: string;
}

/**
 * The three postures, in the order the drills teach them.
 *
 * WHERE THIS IS CONSUMED, and the honest gap. The founder asked twice for a
 * BUBBLE ABOVE THE OFFICER carrying these sentences while he holds each pose,
 * and that is the right place for them — a caption on the thing you are being
 * asked to read. Rendering it needs `traffic/TrafficLayer.tsx` (an `Html`
 * label anchored to the staged `directTraffic` figure, which already knows the
 * live posture from the cluster's controller schedule) and a carrier field on
 * `TrafficControllerSpec` in `contracts.ts`. Both files belong to other lanes
 * in this wave, so this lane authors the CONTENT — typed, exported, pinned by
 * controller-gestures.test.ts, and ready for a one-line import — and ships the
 * same three questions today through the copy channel it does own: every
 * posture named in the three controller drills' `instructionsBg` and `teach`
 * now answers go / stop / priority explicitly, instead of naming the pose.
 */
export const CONTROLLER_GESTURES: readonly ControllerGesture[] = [
  {
    posture: "sideProfile",
    poseBg: "Страничен профил към теб, ръцете отпуснати надолу",
    goBg: "Минаваш ТИ и всички по твоята посока — направо, надясно и наляво.",
    stopBg: "Спира напречното направление, което гледа гърдите или гърба му.",
    priorityBg:
      "Предимството е твое, дори лампата да свети червено: сигналът на регулировчика е над светофара, над знаците и над маркировката. Изчакваш само пешеходците, които вече са стъпили на платното.",
    lawRef: "ППЗДвП сигнали на регулировчика; ЗДвП чл. 7",
  },
  {
    posture: "chestOrBack",
    poseBg: "Обърнат е с ГЪРДИ или с ГРЪБ към теб — виждаш го анфас, не отстрани",
    goBg: "Минава напречното направление — това, което вижда профила му.",
    stopBg: "Спираш ТИ, преди стоп-линията, и чакаш там.",
    priorityBg:
      "Предимството не е твое, дори лампата да свети зелено. Зеленото не отменя регулировчика — той го отменя. Тръгването срещу гърдите му е опасна грешка и прекратява изпита.",
    lawRef: "ППЗДвП сигнали на регулировчика; ЗДвП чл. 7",
  },
  {
    posture: "armRaised",
    poseBg: "Едната ръка вдигната вертикално нагоре",
    goBg: "Никой. Вдигнатата ръка не пуска никого — тя е „внимание“.",
    stopBg:
      "Спират ВСИЧКИ посоки. Който вече е навлязъл в кръстовището, го освобождава и излиза.",
    priorityBg:
      "Това е смяна на фазите: регулировчикът прибира едното направление, за да пусне другото. Най-скъпата грешка тук е да я прочетеш като „тръгвай“ — потегляш точно в секундата, в която напречното платно се освобождава за някой друг.",
    lawRef: "ППЗДвП сигнали на регулировчика",
  },
];

/** The three staged JU-18 controller events these gestures explain — the ids a
 *  renderer keys the bubble off. Pinned by controller-gestures.test.ts. */
export const CONTROLLER_GESTURE_EVENT_IDS: readonly string[] = [
  "sc-sctrl-controller", // sc-signal-controller
  "sc-sctl-officer", // sc-sig-controller-live
  "sc-sctp-officer", // sc-sig-controller-postures
];

// ---------------------------------------------------------------------------
// sc-signal-dead — „Загаснал светофар" (JU-20) on sx-v1
// ---------------------------------------------------------------------------

/**
 * The staged conflict: a car crosses the (now uncontrolled) junction from the
 * player's RIGHT (east arm → west arm, straight through), timed by the
 * priorityFromRight runner against the player's approach up the south stem.
 * junctionControl "uncontrolled": with sx-n-c dialed DARK the runtime's own
 * right-hand-rule tracker adjudicates (FAILED_TO_YIELD / YIELDED_TO_PRIORITY).
 * leadSec is NEGATIVE — the car reaches the node ~3.5 s AFTER the player's
 * projected crossing, so a barging player cuts across the still-inbound car
 * while a yielding player watches it pass. Values mirror the proven
 * SC_JUNCTION_BLIND_CONFLICT (same 18 m core, same actor geometry).
 */
export const SC_SIGNAL_DEAD_CONFLICT: PriorityFromRightSpec = {
  id: "sc-sdead-conflict",
  kind: "priorityFromRight",
  libraryEventId: "JU-20",
  junction: { nodeId: "sx-n-c", x: 0, y: 0 },
  junctionControl: "uncontrolled",
  actor: {
    pathNodes: ["sx-n-e", "sx-n-c", "sx-n-w"],
    hold: { nodeIndex: 1, offsetM: -95 }, // 95 m east of the junction
    cruiseSpeedMps: 8,
  },
  junctionNodeIndex: 1,
  armDistM: 70,
  leadSec: -3.5,
  /**
   * T7 (ledger §2) — this used to read 18, which is not a stop line on sx-v1:
   * it is `RHR_CORE_RADIUS_M` (runtime/worldRuntime.ts), the engine's
   * right-hand-rule conviction core, borrowed as if it were the paint. sx-v1's
   * derived line sits at 27.725 m (secondary half-width 12.125 + arterial
   * corner 15 + paint inset 0.6 — battery sx-district.test.ts pins
   * `sx-e-s@92.3` at y = −27.725), so `lineDistM 18` under-measured the whole
   * approach by 9.7 m and did two separate harms:
   *
   *   1. the DEMONSTRATED-CORRECT ghost was authored to yield "outside the
   *      core" at y = −19.55 — 8.17 m PAST the painted line the same session
   *      grades. At L1 the shadow car is on, so the student follows a
   *      ghost over the line and is then graded against it;
   *   2. the witness release could never fire from a LAWFUL stop. Stopped at
   *      the paint the player sits at d ≈ 29.8, so with lineDistM 18
   *      `playerLineDist ≈ 11.8` — outside `nearLineM 6` — and at 0 km/h the
   *      raw ETA floors to 11.8/0.5 = 23.6 s, outside `etaSec 8`. Both witness
   *      tests failed forever and the staged car waited for a student who had
   *      already arrived («I let everybody pass … but Error appeared»).
   *
   * At the true 27.7 a lawful stop reads `playerLineDist ≈ 2.1` and clears
   * `nearLineM` on the same frame. The sibling specs in this file (`:486`) and
   * in templates-signals2.ts already carry 27.7 — this is the value, not a tune.
   */
  lineDistM: 27.7,
  clearSpeedMps: 11.5,
  // Doc 62 S2 (founder R3 #17 „колата минава много рано"): the release is
  // gated on the player's true arrival at the mouth, so the dead-signal
  // right-of-way decision is made against a car that is actually there.
  witnessArm: { etaSec: 8, nearLineM: 6 },
};

export const SC_SIGNAL_DEAD: ScenarioSpec = {
  id: "sc-signal-dead",
  family: "signals",
  tagsBg: ["светофар", "загаснал светофар", "предимство", "дясното правило"],
  titleBg: "Загаснал светофар",
  objectiveBg:
    "Светофарът не работи — кръстовището става равнозначно: приближи с готовност за спиране, пропусни идващия отдясно и завий наляво чак когато пътят е чист. Тъмният светофар не дава предимство.",
  archetypeIds: ["JU-20", "JU-01"],
  conceptIds: ["c-right-hand-rule", "c-signal-hierarchy", "c-junction-approach"],
  map: {
    archetype: "x-junction",
    // Mirrored in sx-v1.json meta.scenario.params (the signalized X-junction);
    // the dead-signal mode is a runtime session-start dial, not a map property.
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
    { n: 1, textBg: "Тръгни по булеварда на север — напред е светофарно кръстовище, но светофарът е ЗАГАСНАЛ." },
    {
      n: 2,
      textBg:
        "Тъмен светофар означава равнозначно кръстовище: важат знаците, а щом няма и знаци — правилото на дясното. Намали отрано.",
    },
    { n: 3, textBg: "Пусни ляв мигач — ще завиваш наляво по западното направление." },
    {
      n: 4,
      textBg:
        "Огледай се: първо наляво, после НАДЯСНО. Кола отдясно има предимство — спри преди кръстовището и я изчакай да премине изцяло.",
    },
    { n: 5, textBg: "Щом пътят е чист, завий наляво и продължи на запад." },
  ],
  success: [
    {
      id: "sc-sdead-approach",
      titleBg: "Приближи угасналото кръстовище бавно, с готовност за спиране",
      // Stem lane center, before the junction area (mouth at ~17 m).
      // FR-24: the mark is 2.275 m short of the sx-e-s stop line, but the L1
      // aid ladder widens radius 8 → 12, so the disc reached 9.72 m INTO the
      // junction and credited „approach the dead junction ready to stop" to a
      // car standing in the middle of it. The cut ends the acceptance at the
      // paint at every rung. (Value = mark − line, derived and re-asserted
      // against the district's own line in scene/stop-line-grading.test.ts.)
      params: {
        kind: "reachZone",
        x: 4.06,
        y: -30,
        radiusM: 8,
        maxSpeedKmh: 25,
        acceptBeforeMarkM: -2.275,
      },
    },
    {
      id: "sc-sdead-cross",
      titleBg: "Премини наляво, след като пропуснеш идващия отдясно",
      // West-arm westbound lane center, past the 40 m junction area (the
      // right-hand-rule tracker commends on leaving it).
      params: { kind: "reachZone", x: -50, y: 4.06, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 65 },
  shadow: { path: "content/traces/sc-signal-dead/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-signal-dead/mistake-barge.trace.json" },
      titleBg: "Тъмният светофар като зелено",
      whatWentWrongBg:
        "Колата навлезе в кръстовището с непроменена скорост, сякаш светофарът свети зелено — а отдясно приближаваше автомобил с предимство. Загасналият светофар не дава предимство: кръстовището е равнозначно и минава този отдясно.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-signal-dead/mistake-cut.trace.json" },
      titleBg: "Потегляне пред идващия отдясно",
      whatWentWrongBg:
        "Колата понамали, но не спря и не изчака — вмъкна се в завоя пред приближаващата отдясно кола с предимство. На равнозначно кръстовище предимството се дава реално: пропускаш идващия отдясно да премине, не го изпреварваш.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "Когато светофар не работи — угаснал при авария или изключен нощем. Кръстовището веднага става равнозначно: важат пътните знаци, а ако няма — правилото на дясното. Мнозина шофьори не са го виждали на живо и продължават по инерция.",
    whyBg:
      "Загасналият светофар е класически капан: водачите приемат, че „все още имат зелено“, и навлизат без да пропуснат. Точно затова там стават тежки странични сблъсъци. Който намали и потърси идващия отдясно, връща сигурността, която светофарът е спрял да дава.",
    lawRef: "ЗДвП чл. 50",
    examinerBg:
      "Изпитващият гледа: осезаемо намаляване пред неработещия светофар, оглеждане наляво и надясно и реално пропускане на идващия отдясно, преди навлизане. Преминаване през угаснал светофар без пропускане е опасна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5BusyStreet(),
  ],
  staged: [SC_SIGNAL_DEAD_CONFLICT],
  // The LIVE half of the recorder's dial (doc 62 S1 #17 — the drill showed a
  // LIVE GREEN and graded signal codes because nothing dialed the mode in
  // live play): sx-n-c goes DARK at session start, the same node→mode map
  // traces/scSignals.ts records with. Grading falls back to the right-hand
  // rule and the lamps render unlit (signalLampState "dark").
  signalModes: { "sx-n-c": "dark" },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-signal-flashing — „Мигащо жълто" (JU-20) on sx-v1 (map REUSED; the player
// drives STRAIGHT through instead of turning — a distinct maneuver on the same
// unsignalized fallback)
// ---------------------------------------------------------------------------

/**
 * The staged conflict: identical actor geometry to SC_SIGNAL_DEAD_CONFLICT (a
 * car from the player's RIGHT, east → west), timed against the player's
 * STRAIGHT approach up the south stem. With sx-n-c dialed to FLASHING AMBER the
 * junction is uncontrolled — the same right-hand-rule tracker adjudicates. The
 * player crosses the car's path going straight north, so barging in front of
 * the still-inbound car is отнемане на предимство (FAILED_TO_YIELD).
 */
export const SC_SIGNAL_FLASHING_CONFLICT: PriorityFromRightSpec = {
  id: "sc-sflash-conflict",
  kind: "priorityFromRight",
  libraryEventId: "JU-20",
  junction: { nodeId: "sx-n-c", x: 0, y: 0 },
  junctionControl: "uncontrolled",
  actor: {
    pathNodes: ["sx-n-e", "sx-n-c", "sx-n-w"],
    hold: { nodeIndex: 1, offsetM: -95 },
    cruiseSpeedMps: 8,
  },
  junctionNodeIndex: 1,
  armDistM: 70,
  leadSec: -3.5,
  // T7 (ledger §2): 18 was the RHR conviction-core radius, not sx-v1's stop
  // line — see the long note on SC_SIGNAL_DEAD_CONFLICT above. 27.7 m is the
  // paint the world draws and the runtime grades on this map.
  lineDistM: 27.7,
  clearSpeedMps: 11.5,
  // Doc 62 S2 (founder R3 #18): same witness release as sc-signal-dead —
  // the flashing-amber caution is graded against a present car, any pace.
  witnessArm: { etaSec: 8, nearLineM: 6 },
};

export const SC_SIGNAL_FLASHING: ScenarioSpec = {
  id: "sc-signal-flashing",
  family: "signals",
  tagsBg: ["светофар", "мигащо жълто", "предимство", "дясното правило"],
  titleBg: "Мигащо жълто",
  objectiveBg:
    "Мигащото жълто означава „премини с повишено внимание, като пропуснеш предимството“: приближи готов за спиране, пропусни идващия отдясно и премини правó напред чак когато пътят е чист.",
  archetypeIds: ["JU-20", "JU-01"],
  conceptIds: ["c-right-hand-rule", "c-signal-hierarchy", "c-junction-approach"],
  map: {
    archetype: "x-junction",
    // Map REUSED from sc-signal-dead — mirrored in sx-v1.json params. The
    // flashing-amber mode is a runtime session-start dial, not a map property.
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
    { n: 1, textBg: "Тръгни по булеварда на север — светофарът напред мига в ЖЪЛТО. Ще преминеш правó напред." },
    {
      n: 2,
      textBg:
        "Мигащото жълто не е зелено: то значи „внимание, пропусни предимството“. Кръстовището работи като равнозначно — важи правилото на дясното.",
    },
    { n: 3, textBg: "Намали отрано и бъди готов за спиране — не влизай с инерция." },
    {
      n: 4,
      textBg:
        "Огледай наляво и НАДЯСНО. Кола отдясно има предимство — спри и я изчакай да премине изцяло, преди да продължиш.",
    },
    { n: 5, textBg: "Когато пътят е чист, премини правó напред и продължи на север." },
  ],
  success: [
    {
      id: "sc-sflash-approach",
      titleBg: "Приближи мигащото жълто бавно, с готовност за спиране",
      // FR-24 — same mark, same line, same ladder as sc-sdead-approach.
      params: {
        kind: "reachZone",
        x: 4.06,
        y: -30,
        radiusM: 8,
        maxSpeedKmh: 25,
        acceptBeforeMarkM: -2.275,
      },
    },
    {
      id: "sc-sflash-cross",
      titleBg: "Премини правó напред, след като пропуснеш идващия отдясно",
      // North-arm northbound lane center, past the 40 m junction area.
      params: { kind: "reachZone", x: 4.06, y: 45, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 65 },
  shadow: { path: "content/traces/sc-signal-flashing/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-signal-flashing/mistake-barge.trace.json" },
      titleBg: "Мигащото жълто като зелено",
      whatWentWrongBg:
        "Колата премина мигащото жълто без изобщо да намали, сякаш е зелено — докато отдясно приближаваше автомобил с предимство. Мигащото жълто изисква повишено внимание и пропускане: то не дава предимство, а го отнема от теб.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-signal-flashing/mistake-cut.trace.json" },
      titleBg: "Преминаване пред идващия отдясно",
      whatWentWrongBg:
        "Колата понамали, но не изчака — навлезе право напред пред приближаващата отдясно кола с предимство. На мигащо жълто предимството се дава реално: пропускаш идващия отдясно, не се провираш пред него.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "Когато светофар мига в жълто — най-често нощем или в слаб трафик, когато режимът се превключва на предупредителен. Кръстовището действа като равнозначно: важат знаците, а без тях — правилото на дясното.",
    whyBg:
      "Мигащото жълто често се приема погрешно за „почти зелено“ и водачите влизат с инерция. Затова там се случват страничните сблъсъци — точно когато никой не очаква да отстъпи. Повишеното внимание и пропускането на идващия отдясно превръщат капана в безопасно преминаване.",
    lawRef: "ППЗДвП светлинни сигнали за регулиране на движението",
    examinerBg:
      "Изпитващият гледа: намаляване и готовност за спиране при мигащо жълто, оглеждане наляво-надясно и реално пропускане на идващия отдясно. Преминаване с непроменена скорост, все едно е зелено, е опасна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5BusyStreet(),
  ],
  staged: [SC_SIGNAL_FLASHING_CONFLICT],
  // The LIVE half of the recorder's dial (doc 62 S1 #18 — no yellow blink in
  // live play because nothing dialed the mode): sx-n-c FLASHES AMBER at
  // session start, matching traces/scSignals.ts. Grading falls back to the
  // right-hand rule; the lamps blink on the runtime clock (signalLampState
  // amberFlashOn/Off).
  signalModes: { "sx-n-c": "flashingAmber" },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-signal-hesitation — „Спане на зелено" (doc 72 JU-09) on sx-v1 (map REUSED;
// a LIVE green phase pinned over the encounter — the graded fault is the
// driver's own delay, and the lesson now SHOWS him somebody committing it)
// ---------------------------------------------------------------------------

/**
 * THE SUBJECT OF THE LESSON — doc 87 B40, and it is his sentence verbatim:
 *
 *   „it says sleeping on green but who ? who is sleeping on green yes Ok I stop
 *    on the green cyrcle but is that it ? … just that there is no traffic car."
 *
 * He is right, and the register never named the actual hole: this template
 * shipped with `staged` absent entirely. A lesson called «Спане на зелено» had
 * no one asleep in it. The student was told about a fault and shown an empty
 * crossroads, and the only thing on screen was the objective marker he stopped
 * on — which is what „I stop on the green cyrcle but is that it" describes.
 *
 * So: ONE CAR, standing at the FAR stop line of the same north–south axis,
 * facing him, on the same green, not moving. He watches it through the whole
 * approach; it wakes and drives off as he crosses. That is a picture of the
 * fault, in the lesson about the fault.
 *
 * WHY THE ONCOMING LINE AND NOT HIS OWN LANE. Putting the sleeper in front of
 * the student is the obvious staging and it breaks three things at once, all
 * of them measured against the shipped code rather than guessed:
 *
 *  1. IT DISABLES THE DETECTOR THE LESSON EXISTS FOR. `HESITATION_AT_GREEN`
 *     (rules/engine.ts) is gated on `leadGapM === null || leadGapM >
 *     cfg.hesitationClearGapM` (12 m) — a lead car within 12 m is a lawful
 *     reason to sit still, so a student stopped behind the sleeper cannot be
 *     graded on the one thing this drill grades.
 *  2. IT CAN DEADLOCK. `BrakingLeadCarRunner` arms on `nearLead &&
 *     input.speedKmh > 4`: a student who comes to a full stop behind a car
 *     that is waiting for him to move has no way out. That is exactly the
 *     shape of B15 („the roundabout convicts you for a car that never comes"),
 *     and shipping a second one would be inexcusable.
 *  3. THE SHADOW GHOST WOULD DRIVE THROUGH IT. The committed L1 demonstration
 *     (traces/scSignalHesitation.ts) crosses y = −28.6 at 22 km/h and knows
 *     nothing about staged actors — the student would watch the teaching car
 *     pass through a parked one, which is the founder's items 22/23/24 defect
 *     at car scale.
 *
 * Across the box it costs none of that: nothing blocks the student's lane, the
 * detector stays armed, the ghost's path is clear, and the demonstration is
 * MORE legible, not less — two cars have the same green, one of them goes.
 *
 * MECHANISM, stated plainly rather than disguised. This reuses
 * `brakingLeadCar` for its HOLD-then-CRUISE half only: `armDistM` 50 keeps the
 * actor asleep until the student is at the junction mouth, and `slamAt` is
 * placed off the map on purpose so the brake half NEVER arms. The event
 * therefore resolves no outcome and contributes nothing to the debrief — it is
 * scenery with a teaching job, the same standing as an `ambient: true` walker,
 * and it must stay that way: the fault this lesson scores is the STUDENT'S.
 */
export const SC_SIGNAL_HESITATION_SLEEPER: BrakingLeadCarSpec = {
  id: "sc-shes-sleeper",
  kind: "brakingLeadCar",
  libraryEventId: "JU-09",
  actor: {
    // Southbound down the same axis: it holds at the NORTH stop line, nose
    // toward the student, and leaves down the south stem past him.
    pathNodes: ["sx-n-n", "sx-n-c", "sx-n-s"],
    // sx-v1's ns stop line is at 27.725 m from the node (traces/
    // scSignalHesitation.ts pins the southern one at y = −27.725); 29 m back
    // puts it AT its own line rather than in the box.
    hold: { nodeIndex: 1, offsetM: -29 },
    cruiseSpeedMps: 7,
    colorIndex: 2,
  },
  // The wake-up. MEASURED on the production runner + traffic system, player
  // driven up the south stem from the spawn at y = −105:
  //   at 35 km/h it stands motionless for 8.9 s and wakes at player y = −18.1
  //   at 18 km/h it stands motionless for 17.1 s and wakes at player y = −19.3
  // Both are PAST his own stop line (y = −27.725), so the car is still asleep
  // at the moment he has to decide, and pulls away in front of him as he enters
  // the box. Met at full pace and at half — the encounter battery's invariant,
  // which is exactly the founder's items 8/15/17/18 („by the time I reach the
  // crossroad it already has passed").
  armDistM: 50,
  paceMode: "scheduledCruise",
  paceSpeedMps: 7,
  // Unused under scheduledCruise + armDistM; carried because the spec requires
  // them (the siblings in templates-following.ts keep them for the same reason).
  followGapM: 20,
  maxMatchSpeedMps: 14,
  // DELIBERATELY UNREACHABLE — sx-v1's south stem ends at y = −120, so the
  // brake half of the runner can never latch and the encounter never
  // adjudicates. See the block above: this actor is shown, never scored.
  slamAt: { x: 0, y: -400 },
  slamRadiusM: 1,
  slamDecelMps2: 3,
  minSlamSpeedKmh: 999,
  proximityFallbackM: 0,
  triggersHazard: false,
  resumeAfterSec: 3,
};

/** JU-09 — закъснели действия на зелено (ППЗДвП чл. 31: зеленият сигнал
 *  разрешава преминаването; ЗДвП чл. 20 — водачът контролира ППС и не създава
 *  ненужни пречки за движението). Distinct from the dead/flashing fallbacks: a
 *  LIVE green light where the taught fault is FREEZING instead of proceeding.
 *  No staged conflict — the drives cross straight through on green, so the ONLY
 *  gradeable event is the hesitation (config-free: HESITATION_AT_GREEN is a
 *  default-on detector that the shipped junction shadows deliberately avoid). */
export const SC_SIGNAL_HESITATION: ScenarioSpec = {
  id: "sc-signal-hesitation",
  family: "signals",
  tagsBg: ["светофар", "зелено", "закъснели действия", "спане на зелено"],
  titleBg: "Спане на зелено",
  objectiveBg:
    "Светофарът свети зелено и напред е чисто: тръгни без бавене. Зеленото разрешава преминаване — замразяването на зелено блокира кръстовището и е закъсняло действие, което изпитващият отбелязва.",
  archetypeIds: ["JU-09"],
  conceptIds: ["c-traffic-light-signals", "c-signal-hierarchy", "c-junction-approach"],
  map: {
    archetype: "x-junction",
    // Map REUSED from the signals family — mirrored in sx-v1.json params. The
    // green phase is a runtime session-start dial (signalOffsets), not a map
    // property.
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
    { n: 1, textBg: "Тръгни по булеварда на север — напред е светофарно кръстовище, което свети ЗЕЛЕНО." },
    { n: 2, textBg: "Зеленото не значи „чакай“, а „премини, ако е безопасно“. Провери, че кутията на кръстовището е чиста." },
    // The founder's question — „who is sleeping on green?" — answered on the
    // screen, then named in the card so the student knows what he is looking at.
    // Doc 87 B40, and the copy is written from a FRAME, not from the staging.
    // Driven to y = −33.5 (exactly the pose this step points at) and zoomed:
    // the sleeper is 62 m out, LEFT of the guidance line, nose-on, with a
    // taller van standing behind it. „Погледни колата отсреща" pointed at a
    // ~30 px shape in a row of stationary vehicles and did not say which one or
    // how to tell. These three cues are what the frame actually contains: the
    // side of the road it is on, that it faces you (a car you see head-on is
    // one coming AT you, not one parked), and — the only cue that survives the
    // distance — that it does not move while the seconds pass.
    {
      n: 3,
      textBg:
        "Сега намери СПЯЩИЯ: гледай отвъд кръстовището, ВЛЯВО от твоята линия — в насрещната лента, на другата стоп-линия. Колата там е с ЛИЦЕ към теб, значи не е паркирана, а чака. Брой наум до три: зеленото ѝ свети, а тя не помръдва. Ето кой „спи на зелено“.",
    },
    {
      n: 4,
      textBg:
        "Зеленият сигнал разрешава преминаването (ППЗДвП — светлинните сигнали) — той не е покана да чакаш. Всяка изпусната секунда на зелено държи кръстовището заето за всички останали.",
    },
    { n: 5, textBg: "Щом напред е чисто, премини правó напред без излишно спиране и бавене." },
    { n: 6, textBg: "Не замръзвай на зелено „за всеки случай“ — това блокира кръстовището и колоната зад теб." },
    { n: 7, textBg: "Продължи спокойно на север след кръстовището." },
  ],
  success: [
    {
      id: "sc-shes-approach",
      titleBg: "Приближи зеленото кръстовище с готовност",
      // FR-24: mark 7.275 m short of sx-e-s, radius 8 → 12 at L1.
      params: {
        kind: "reachZone",
        x: 4.06,
        y: -35,
        radiusM: 8,
        maxSpeedKmh: 35,
        acceptBeforeMarkM: -7.275,
      },
    },
    {
      id: "sc-shes-cross",
      titleBg: "Премини правó напред на зелено, без да замръзваш",
      // North-arm northbound lane center, past the 40 m junction area.
      params: { kind: "reachZone", x: 4.06, y: 45, radiusM: 9 },
    },
  ],
  // The lesson's subject, staged. It grades nothing (see the spec's own doc).
  staged: [SC_SIGNAL_HESITATION_SLEEPER],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scSignalHesitation.ts; the §5 gate (shadow replays ZERO violations)
  // and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-signal-hesitation-traces.test.ts (re-record RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-signal-hesitation/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-signal-hesitation/mistake-freeze.trace.json" },
      titleBg: "Замръзване на зелено",
      whatWentWrongBg:
        "Светофарът свети зелено и напред е чисто, но колата спря на линията и не потегли няколко секунди. Зеленото разрешава преминаване — ненужното изчакване е закъсняло действие, което блокира кръстовището и колоната отзад.",
      codeRefs: ["HESITATION_AT_GREEN"],
    },
    {
      traceRef: { path: "content/traces/sc-signal-hesitation/mistake-filter.trace.json" },
      titleBg: "Изпуснато зелено",
      whatWentWrongBg:
        "Колата спря преди линията на зелено и се колеба прекалено дълго „за всеки случай“ — цялото зелено се изпусна, а кръстовището остана блокирано. Чист път напред на зелено означава тръгвай, а не изчаквай.",
      codeRefs: ["HESITATION_AT_GREEN"],
    },
  ],
  teach: {
    whenBg:
      "Когато светофарът свети зелено, кутията на кръстовището е чиста и все пак се колебаеш дали да тръгнеш — най-често от притеснение на изпита или пред зелена стрелка. Зеленото е за движение, не за изчакване.",
    whyBg:
      "Замразяването на зелено запушва кръстовището, вбесява движението отзад и е сред най-често отбелязваните „закъснели действия“ на изпита. Който тръгва решително на зелено с чист път — след кратка проверка, че напред е свободно — държи кръстовището да работи, вместо да го блокира.",
    lawRef: "ППЗДвП светлинни сигнали за регулиране на движението",
    examinerBg:
      "Изпитващият очаква тръгване в рамките на секунда-две при зелено и чист път напред. Ненужното застояване на зелено е второстепенна грешка („закъснели действия“) и при натрупване проваля изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5BusyStreet(),
  ],
  // LIVE arrival pin (LessonSpec.signalPlan — the founder traffic-light fix):
  // the JU-09 lesson is DECIDING on a live green, so the student must MEET a
  // live green — greenFresh rebases the cluster to a full 20 s green when the
  // approach reaches 45 m, mirroring the recordings' pinned green hold
  // (scSignalHesitation offset 44) without touching them. Wall-clock arrival
  // could land on red and turn the anti-hesitation drill into a red wait.
  signalPlan: { arm: "greenFresh", triggerM: 45 },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-signal-controller — „Регулировчик на кръстовището" (doc 72 JU-18, ADR-006
// stage 1d) on sx-v1 (map REUSED; the lamps stay LIVE and misleading — the
// controller's signals override them: the signal-hierarchy lesson)
// ---------------------------------------------------------------------------

/**
 * The staged authority: a CONTROLLER posted at sx-n-c. Session-start dials
 * (the signalOffsets/signalModes discipline, all authored constants):
 *  - signalOffsetSec 45 pins the ns lamps GREEN for session time t ∈ [5, 25)
 *    of each 50 s cycle — the player approaches a GREEN light (the misleading
 *    lamp; every drive below crosses/arrives inside that window);
 *  - haltedGroup "ns" halts the player's south-stem approach from t = 0;
 *  - flipAtSec 30 is the single authored permission flip: from t = 30 the ns
 *    axis is PERMITTED (by then the lamps have cycled to red — so the shadow
 *    proceeds on a RED lamp under the controller's permission: the hierarchy
 *    proven in BOTH directions).
 * Grading is 100% the production pipeline: stopLineCrossed carries the
 * controller permission; the reducer grades halt → CONTROLLER_SIGNAL_VIOLATED
 * (опасна, ЗДвП чл. 7), proceed → innocent. The figure (pose "directTraffic",
 * one arm extended horizontally + hi-vis, ADR-001 fictional) is purely visual.
 */
export const SC_SIGNAL_CONTROLLER_EVENT: TrafficControllerSpec = {
  id: "sc-sctrl-controller",
  kind: "trafficController",
  libraryEventId: "JU-18",
  signalNodeId: "sx-n-c",
  junction: { x: 0, y: 0 },
  /**
   * The post: ON the centre line of the approach he is halting, 11 m south of
   * the node — not at the junction's geometric centre.
   *
   * Founder review 2026-07-27: „the officer that is regulating the traffic is
   * small not well visible from user POV". At (0, 0) he stood 28 m beyond the
   * south stop line, so at the DECISION moment — the frame where the demo
   * crosses that line against him — he was a ~30-pixel figure lost against the
   * far kerb. At (0, −11) he is 16 m from the stop line and 3–4 m off the
   * player's lane: roughly twice the apparent height, dead centre of the chase
   * frame, and (which matters more) unmistakably addressing THIS approach —
   * which is where a real регулировчик stands when he stops an axis.
   *
   * PURELY VISUAL, by construction: TrafficControllerRunner uses `officer` only
   * to stage the figure's standing path (speed 0, pose "directTraffic"). Every
   * graded quantity comes from `signalNodeId` / `junction` / `lineDistM` and the
   * cluster's controller schedule, none of which moved. The one thing to keep an
   * eye on is that he is a staged PEDESTRIAN: the runtime's pedestrian duty
   * reads pedestrianOnCrossing only, and sx-v1's south arm carries no crossing
   * here — the trace gate re-proves all three drives' exact codes.
   */
  officer: { x: 0, y: -11 },
  facing: { x: 0, y: -1 },
  haltedGroup: "ns",
  flipAtSec: 30,
  signalOffsetSec: 45,
  // sx-v1 south-approach stop line sits 27.7 m south of the node (the scaled
  // junction mouth — sx-e-s@92.3, battery sx-district.test.ts).
  lineDistM: 27.7,
};

export const SC_SIGNAL_CONTROLLER: ScenarioSpec = {
  id: "sc-signal-controller",
  family: "signals",
  tagsBg: ["регулировчик", "светофар", "йерархия на сигналите", "предимство"],
  titleBg: "Регулировчик на кръстовището",
  objectiveBg:
    "На кръстовището има регулировчик и неговите сигнали са над светофара: спри преди линията, докато той спира твоето направление — дори светофарът да свети зелено — и премини едва когато той разреши посоката ти.",
  archetypeIds: ["JU-18"],
  conceptIds: ["c-signal-hierarchy", "c-traffic-light-signals", "c-junction-approach"],
  map: {
    archetype: "x-junction",
    // Map REUSED from the signals family — mirrored in sx-v1.json params. The
    // controller (mode + timetable + lamp pin) is a runtime session-start
    // dial armed by the staged event, not a map property.
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
        "Тръгни по булеварда на север — на кръстовището напред стои РЕГУЛИРОВЧИК, а светофарът продължава да работи.",
    },
    {
      n: 2,
      textBg:
        "Запомни йерархията: сигналите на регулировчика са над светофара и над знаците. Каквото показва той, това важи.",
    },
    {
      n: 3,
      textBg:
        "Той е с ГЪРДИ към теб. Това значи: минава напречното направление, а ти спираш преди стоп-линията. Предимството не е твое, колкото и зелено да свети лампата — зеленото не отменя регулировчика, той отменя зеленото.",
    },
    {
      n: 4,
      textBg:
        "Ако вдигне ръка нагоре, това НЕ е „тръгвай“: вдигнатата ръка спира всички посоки, за да смени фазите. Който вече е в кръстовището, го освобождава; който чака — продължава да чака.",
    },
    {
      n: 5,
      textBg:
        "Щом се обърне със СТРАНИЧЕН ПРОФИЛ към теб и отпусне ръце, минаваш ти и всички по твоята посока, а напречното спира. Тогава преминаваш правó напред — дори светофарът междувременно да е станал червен: неговият сигнал е по-силен (ППЗДвП — сигналите на регулировчика; ЗДвП чл. 7).",
    },
  ],
  success: [
    {
      id: "sc-sctrl-approach",
      titleBg: "Приближи кръстовището с регулировчика с готовност за спиране",
      // Stem lane center, before the 27.7 m stop line.
      params: { kind: "reachZone", x: 4.06, y: -42, radiusM: 8, maxSpeedKmh: 30 },
    },
    {
      id: "sc-sctrl-cross",
      titleBg: "Премини кръстовището след разрешение от регулировчика",
      // North-arm northbound lane center, past the 40 m junction area.
      params: { kind: "reachZone", x: 4.06, y: 45, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 70 },
  shadow: { path: "content/traces/sc-signal-controller/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-signal-controller/mistake-run.trace.json" },
      titleBg: "Зеленото „печели“ срещу регулировчика",
      whatWentWrongBg:
        "Колата гледаше само светофара: зелено — газ, и премина линията, докато регулировчикът спираше нейното направление. Йерархията е обратна: регулировчикът е над светофара, а преминаването срещу неговия сигнал е опасна грешка, с която изпитът се прекратява.",
      codeRefs: ["CONTROLLER_SIGNAL_VIOLATED"],
    },
    {
      traceRef: { path: "content/traces/sc-signal-controller/mistake-creep.trace.json" },
      titleBg: "Припълзяване през линията",
      whatWentWrongBg:
        "Колата уж намали, но продължи бавно и „припълзя“ през стоп-линията, докато регулировчикът още спираше посоката ѝ. Спрян си, когато стоиш ПРЕДИ линията — бавното преминаване е също преминаване срещу сигнала на регулировчика.",
      codeRefs: ["CONTROLLER_SIGNAL_VIOLATED"],
    },
  ],
  teach: {
    whenBg:
      "Когато на кръстовището има регулировчик — при неработещ или объркан светофар, протоколни събития, ПТП или задръстване. Неговите сигнали заменят всичко останало: светофар, знаци, маркировка.",
    whyBg:
      "Най-честата грешка е да гледаш лампите вместо човека: зелено „за теб“ и потегляш право срещу ръката на регулировчика. Точно това е официална опасна грешка, с която изпитът се прекратява — и реален страничен сблъсък в живота, защото напречното направление вече е пуснато от него.",
    lawRef: "ЗДвП чл. 7",
    examinerBg:
      "Изпитващият гледа едно: подчиняваш ли се на регулировчика, а не на светофара. Спиране преди линията при спряно направление — независимо от зеленото — и решително преминаване чак след неговото разрешение. Преминаване срещу сигнала му прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5BusyStreet(),
  ],
  staged: [SC_SIGNAL_CONTROLLER_EVENT],
  // NO signalPlan (deliberate): the lamps here are pinned at session start by
  // the staged event's signalOffsetSec 45, synchronized with the controller's
  // SESSION-TIME timetable (flipAtSec 30) — an approach-relative rebase would
  // desync the misleading-green window from the permission flip and break the
  // hierarchy lesson. Same for sc-signal-dead / sc-signal-flashing above:
  // their cluster carries NO phase (dark / flashing amber), a pin is inert.
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-signal-redyellow — „Тръгване на червено-жълто" (doc 72 JU-08) on sx-v1
// (map REUSED; the 1 s red+yellow window pinned by signalOffsets)
// ---------------------------------------------------------------------------

/** JU-08 — потегляне на червено-жълто (ППЗДвП чл. 31: червено + жълто ЗАЕДНО
 *  подготвя, но НЕ разрешава преминаването — тръгва се чак на чисто зелено).
 *  The runtime models redYellow as its OWN 1 s lamp state and the reducer
 *  grades a line crossing in it as RED_YELLOW_CROSSED — so this drill is pure
 *  authoring: the recorder's determinism pins the 1 s window forever (the
 *  byte-identity gate). No staged conflict; the fault is the driver's own
 *  anticipation. */
export const SC_SIGNAL_REDYELLOW: ScenarioSpec = {
  id: "sc-signal-redyellow",
  family: "signals",
  tagsBg: ["светофар", "червено-жълто", "потегляне", "изпреварване на зеленото"],
  titleBg: "Тръгване на червено-жълто",
  // Founder R3 #21 (doc 62 — „drill incomprehensible; revise"): the copy now
  // walks the WHOLE lamp arc stъпка по стъпка (спри на червено → изчакай →
  // на червено-жълто се готви → потегли на чисто зелено), with honest timing
  // expectations from the runtime's own SIGNAL_TIMING (red 26 s, redYellow
  // 1 s, green 20 s) so the wait reads as intended, not broken. Rule wording
  // per the content bank (q-signali-i-markirovka-002): „Червено плюс жълто
  // означава „приготви се" — зеленото идва след миг, но докато не светне,
  // преминаването остава забранено (ППЗДвП, чл. 31)."
  objectiveBg:
    "Мини целия цикъл на светофара стъпка по стъпка: спри на червено, изчакай търпеливо, на червено + жълто се приготви — и премини чак на чисто зелено. Комбинираният сигнал означава „приготви се“: подготвя тръгването, но преминаването остава забранено.",
  archetypeIds: ["JU-08"],
  conceptIds: ["c-traffic-light-signals", "c-signal-hierarchy", "c-junction-approach"],
  map: {
    archetype: "x-junction",
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
    { n: 1, textBg: "Тръгни на север. Светофарът пред теб ще светне ЧЕРВЕНО — приближи спокойно и спри плавно преди стоп-линията." },
    {
      n: 2,
      textBg:
        "Изчакай на червено. Търпение: пълното червено трае около 20–25 секунди, точно както на истинско кръстовище — това чакане Е част от урока.",
    },
    {
      n: 3,
      textBg:
        "Гледай светофара: когато към червеното светне и ЖЪЛТО (двете ЗАЕДНО, около секунда), това значи „приготви се“ — но кракът остава на спирачката: преминаването е още забранено.",
    },
    { n: 4, textBg: "Светне ли ЧИСТО зелено: бърз поглед наляво и надясно — и потегли решително през кръстовището." },
    { n: 5, textBg: "Продължи на север с равномерна скорост. Запомни реда: червено → червено-жълто → зелено." },
  ],
  success: [
    {
      id: "sc-sry-approach",
      titleBg: "Спри на стоп-линията на червено",
      // FR-24, and here the title says it outright: „спри на стоп-линията".
      // The mark is 6.275 m short of sx-e-s; the L1 ladder widened radius 8 →
      // 12, so the objective ticked itself off 5.72 m PAST the paint — the
      // lesson named the line and then graded the far side of it.
      params: {
        kind: "reachZone",
        x: 4.06,
        y: -34,
        radiusM: 8,
        maxSpeedKmh: 40,
        acceptBeforeMarkM: -6.275,
      },
    },
    {
      id: "sc-sry-pass",
      titleBg: "Премини кръстовището на зелено",
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
      id: "sc-sry-exit",
      titleBg: "Излез от кръстовището на север",
      params: { kind: "reachZone", x: 4.06, y: 45, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 60 },
  shadow: { path: "content/traces/sc-signal-redyellow/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-signal-redyellow/mistake-creep.trace.json" },
      titleBg: "Пропълзяване на червено-жълто",
      whatWentWrongBg:
        "Колата тръгна с появата на жълтото към червеното и пресече линията, ПРЕДИ да светне зелено. Червено + жълто подготвя тръгването — преминаването остава забранено, а напречното направление може още да дочиства кръстовището.",
      codeRefs: ["RED_YELLOW_CROSSED"],
    },
    {
      traceRef: { path: "content/traces/sc-signal-redyellow/mistake-jump.trace.json" },
      titleBg: "Изстрелване преди зеленото",
      whatWentWrongBg:
        "Ускорение „на изпреварване“ — колата се изстреля в секундата на червено-жълтото, за да „хване“ зеленото. Печели се под секунда, а се влиза в кръстовище, което насрещните и пешеходците още не са освободили.",
      codeRefs: ["RED_YELLOW_CROSSED"],
    },
  ],
  teach: {
    whenBg:
      "На всяко светофарно кръстовище с червено-жълта фаза — тя трае около секунда и изкушава да се тръгне отрано, особено при колона отзад.",
    whyBg:
      "Секундата на червено-жълто е точно секундата, в която закъснелите от напречното направление дочистват кръстовището. Тръгналият отрано се среща с тях в центъра. Комбинираният сигнал е подарен старт за подготовка, не за движение.",
    lawRef: "ППЗДвП светлинни сигнали за регулиране на движението",
    examinerBg:
      "Изпитващият гледа: пълно изчакване на червено, готовност на червено-жълто И потегляне чак на чисто зелено. Пресичане на линията преди зеленото е грешка срещу сигнала.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5BusyStreet(),
  ],
  // LIVE arrival pin (LessonSpec.signalPlan — the founder traffic-light fix):
  // the JU-08 lesson IS waiting out the red into the 1 s red-yellow window,
  // so the student must ARRIVE at a fresh red — redFresh rebases the cluster
  // to the start of the full 26 s red at 45 m, guaranteeing the whole taught
  // arc (red → redYellow → clean green) on every attempt. Wall-clock arrival
  // could land on green and skip the entire lesson.
  signalPlan: { arm: "redFresh", triggerM: 45 },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The SIGNALS-family dead/flashing-signal templates (registered in templates.ts). */
export const SCENARIO_TEMPLATES_SIGNALS: readonly ScenarioSpec[] = [
  SC_SIGNAL_DEAD,
  SC_SIGNAL_FLASHING,
  SC_SIGNAL_HESITATION,
  SC_SIGNAL_CONTROLLER,
  SC_SIGNAL_REDYELLOW,
];
