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
 *   - the 18 m right-hand-rule conviction core around the node is identical to
 *     tj-rhr/tj-occluded; the shadows yield at y = −19.5 — outside the core.
 */

import type { ScenarioSpec } from "./types";
import type { PriorityFromRightSpec } from "../../contracts";

/** Drawn lane-center offset from the road centerline on sx-v1, m. */
export const SIGNAL_LANE_CENTER_M = 4.0625;

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
  lineDistM: 18,
  clearSpeedMps: 11.5,
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
      params: { kind: "reachZone", x: 4.06, y: -30, radiusM: 8, maxSpeedKmh: 25 },
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
  ],
  staged: [SC_SIGNAL_DEAD_CONFLICT],
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
  lineDistM: 18,
  clearSpeedMps: 11.5,
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
      params: { kind: "reachZone", x: 4.06, y: -30, radiusM: 8, maxSpeedKmh: 25 },
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
    lawRef: "ППЗДвП чл. 31",
    examinerBg:
      "Изпитващият гледа: намаляване и готовност за спиране при мигащо жълто, оглеждане наляво-надясно и реално пропускане на идващия отдясно. Преминаване с непроменена скорост, все едно е зелено, е опасна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [SC_SIGNAL_FLASHING_CONFLICT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The SIGNALS-family dead/flashing-signal templates (registered in templates.ts). */
export const SCENARIO_TEMPLATES_SIGNALS: readonly ScenarioSpec[] = [
  SC_SIGNAL_DEAD,
  SC_SIGNAL_FLASHING,
];
