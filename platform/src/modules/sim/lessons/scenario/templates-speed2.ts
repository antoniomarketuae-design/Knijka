/**
 * Scenario templates — the SPEED-MANAGEMENT family, wave 2 (doc 72 §8 „Family
 * SP"): the SIGN-SCOPE rung, DATA ONLY in the templates.ts mold (coordinates
 * denormalized from the committed district file so nothing loads world JSON at
 * runtime; the batteries assert every pinned value against the generated map).
 *
 *  - sc-sp-limit-end  „Докъде важи ограничението"  (SP-03, sp-signs-v1)
 *
 * templates-sp.ts already teaches where a В26 restriction STARTS
 * (sc-speed-transition: the 50→30 entry). This file opens the family's OTHER
 * half: where a restriction ENDS. Both halves ride the same shipped detectors —
 * the district's per-edge `maxspeed` surface IS the legal endpoint, so no new
 * engine capability is involved.
 *
 * Family: "speed" — the existing catalog chip (doc 72 §8); the id follows the
 * sc-<family>-<slug> naming standard.
 */

import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated district BY VALUE — the
// L7 pattern; world/__tests__/sp-signs-district.test.ts asserts the copy
// matches tools/maps/gen_sp_signs.mjs)
// ---------------------------------------------------------------------------

/** Right-lane center of a 1-lane-per-direction street (sp-signs-v1). */
const LANE_X = 4.06;
/** ENDPOINT 1 — the junction that cancels the first В26 span (meta.scenario). */
const JUNCTION_Y = 340;
/** ENDPOINT 2 — the end-of-restriction plate that cancels the second span. */
const END_SIGN_Y = 700;

// ---------------------------------------------------------------------------
// 1. sc-sp-limit-end — „Докъде важи ограничението" (SP-03) on sp-signs-v1: a
//    800 m street carrying TWO В26-40 spans with TWO DIFFERENT legal endpoints
//    — span 1 (y 100..340) dies at a junction, span 2 (y 460..700) dies at an
//    explicit end plate. The route reads 50 → 40 → 50 → 40 → 50, and the runtime
//    grades PER EDGE, so accelerating before EITHER endpoint fires the speeding
//    codes against the LOCAL 40, not against the 50 that is still ahead.
// ---------------------------------------------------------------------------

/**
 * SP-03 (the scope half) — обхватът на знака В26 (ЗДвП чл. 21; Наредба №
 * РД-02-21-1/2023). The distinct value vs sc-speed-transition (which teaches the
 * anticipatory lift AT the entry sign): here the taught fault is the opposite
 * instinct — cancelling the limit YOURSELF, early, because the road looks clear
 * or a junction is „basically here". ONE template, TWO DISTINCT codes against
 * the LOCAL 40 limit:
 *   - „Ускоряване 200 м преди края на зоната" (~48 km/h held to the junction) →
 *     SPEEDING_OVER_LIMIT (above the graced 44, under the dangerous 50 →
 *     второстепенна);
 *   - „Голямо превишение в зоната" (~57 km/h through span 2) →
 *     SPEEDING_DANGEROUS (> +10 = > 50 → опасна). The throttle carries the car
 *     across the 44–50 minor band in well under the 2 s sustain, so only the
 *     dangerous code arms (the sc-speed-dangerous „flooring" pattern).
 * Both detectors are default-ON and read only `tick.maxSpeedKmh`, so no
 * ruleConfig is needed — the LIVE student session grades the same two faults.
 */
export const SC_SP_LIMIT_END: ScenarioSpec = {
  id: "sc-sp-limit-end",
  family: "speed",
  tagsBg: ["скорост", "знак В26", "обхват на знака", "край на ограничението", "кръстовище"],
  titleBg: "Докъде важи ограничението",
  objectiveBg:
    "Знак В26 важи до знака за край или до следващото кръстовище — ускорявай чак след тях, не когато „пътят се оправи“.",
  archetypeIds: ["SP-03"],
  conceptIds: ["c-sign-scope", "c-speed-signs-zone", "c-speed-limits", "c-prohibition-signs"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-signs-v1.json meta.scenario.params
    // (tools/maps/gen_sp_signs.mjs): 100 @ 50 → 240 @ 40 → [кръстовище] →
    // 120 @ 50 → 240 @ 40 → [знак за край] → 100 @ 50.
    params: {
      approachM: 100,
      limit1M: 240,
      betweenM: 120,
      limit2M: 240,
      tailM: 100,
      baseKmh: 50,
      limitKmh: 40,
      sideArmM: 60,
    },
    districtId: "sp-signs-v1",
  },
  start: {
    spawnPointId: "sp-sg-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата — тук ограничението все още е 50 км/ч." },
    { n: 2, textBg: "Напред следва знак В26 „40“. Свали скоростта преди знака и влез в зоната вече около 37–38 км/ч." },
    { n: 3, textBg: "Дръж 40 до самото кръстовище: то е краят на тази зона. Не ускорявай, защото „пътят се отваря“ — знакът важи до последния метър." },
    { n: 4, textBg: "СЛЕД кръстовището ограничението е отменено — там вече можеш да се върнеш към 50 км/ч." },
    { n: 5, textBg: "Втори знак В26 „40“: тази зона свършва при знака за край на забраната, не при кръстовище. Дръж 40 до самата табела." },
    { n: 6, textBg: "След знака за край ускори плавно обратно към 50 км/ч и продължи до края на отсечката." },
  ],
  success: [
    {
      id: "sc-sple-hold-to-junction",
      titleBg: "Стигни кръстовището, още в зоната и под 40 км/ч",
      // 30 m short of ENDPOINT 1, deep inside span 1. Cap 43 sits just under the
      // graced limit (44): the disciplined ~37 drive satisfies it; the demo that
      // accelerated 200 m early (~48) is over the cap and misses the gate.
      params: { kind: "reachZone", x: LANE_X, y: JUNCTION_Y - 30, radiusM: 12, maxSpeedKmh: 43 },
    },
    {
      id: "sc-sple-hold-to-sign",
      titleBg: "Стигни знака за край, още в зоната и под 40 км/ч",
      // The same discipline at ENDPOINT 2 — the OTHER scope rule, same cap.
      params: { kind: "reachZone", x: LANE_X, y: END_SIGN_Y - 30, radiusM: 12, maxSpeedKmh: 43 },
    },
    {
      id: "sc-sple-finish",
      titleBg: "Стигни края на отсечката след знака за край",
      params: { kind: "reachZone", x: LANE_X, y: 780, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 105 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scSpLimitEnd.ts; gates in traces/__tests__/sc-sp-limit-end-traces
  // .test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-sp-limit-end/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-sp-limit-end/mistake-early-accel.trace.json" },
      titleBg: "Ускоряване 200 м преди края на зоната",
      whatWentWrongBg:
        "Колата видя кръстовището напред и си отмени знака сама: 200 метра преди края на зоната кракът натисна и скоростта се качи на около 48 км/ч. Знакът В26 обаче важи ДО кръстовището, а не „почти до него“ — тези 200 метра са си зона 40 и 48 км/ч в тях е второстепенна грешка.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
    {
      traceRef: { path: "content/traces/sc-sp-limit-end/mistake-big-overspeed.trace.json" },
      titleBg: "Голямо превишение в зоната",
      whatWentWrongBg:
        "Във втората зона колата подмина знака В26 „40“ и вдигна около 57 км/ч — „нали скоро свършва“. Свършва при табелата за край, до която има още стотици метри: 57 в зона 40 е над +10 км/ч, тоест опасна грешка и отпадане от изпита. Краят на зоната се чете от знака, не от усещането.",
      codeRefs: ["SPEEDING_DANGEROUS"],
    },
  ],
  teach: {
    whenBg:
      "При всеки знак В26 — щом го подминеш, въпросът вече не е „колко“, а „докога“. Отговорът е само два: до знака за край на забраната или до следващото кръстовище. Всичко останало — че пътят се разширява, че къщите свършват, че отдавна караш бавно — не отменя нищо.",
    whyBg:
      "Ограничението стои заради нещо, което често не се вижда от колата: изход на двор, спирка, тесен тротоар, деца зад завой. Затова законът дава на зоната ТОЧНИ краища — знак или кръстовище — вместо да я оставя на преценка. Водачът, който си я отменя 200 метра по-рано, ускорява точно в частта от зоната, която още пази някого; а на изпита същите метри са грешка независимо дали нещо се е случило.",
    lawRef: "ЗДвП чл. 21; Наредба № РД-02-21-1/2023",
    examinerBg:
      "Изпитващият знае къде свършва всяка зона по маршрута и следи скоростта спрямо знаците през целия път. Ранното ускоряване в края на зоната е грешка, а превишаването с повече от 10 км/ч в нея е опасна грешка и прекратява изпита. Дръж ограничението до знака за край или до кръстовището — и чак тогава ускорявай.",
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

/** The wave-2 speed templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_SPEED2: readonly ScenarioSpec[] = [SC_SP_LIMIT_END];
