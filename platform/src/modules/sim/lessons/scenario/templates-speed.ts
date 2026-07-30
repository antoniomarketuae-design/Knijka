/**
 * SPEED-family scenario templates (wave-7 revival) — the „eco-coast" drill the
 * assembly line first BLOCKED and now ships honestly.
 *
 * sc-sp-eco-coast — „Видиш ли червено отдалеч, пусни газта" on the committed
 * sx-v1 signal junction (map REUSED from the signals family). The lesson is
 * anticipation: read the red early, LIFT OFF, and let the engine brake the car
 * down to the line smoothly — instead of keeping the gas on and stabbing the
 * brake at the last metre. c-eco-techniques is literal here („спиране с
 * двигател вместо с рязка спирачка") and the irony the concept names — the eco
 * style IS the safe style — is the whole template.
 *
 * WHY THE FIRST ATTEMPT WAS BLOCKED, AND WHAT CHANGED (the honesty note): the
 * original mistake 1 was HARSH_BRAKING_NO_CAUSE, which is UNREACHABLE on this
 * premise — the engine treats any visible red within harshBrakeSignalCauseM
 * (120 m) as a lawful CAUSE to brake, and the entire sx-v1 approach lives
 * inside that window, so a hard stab toward the red can never be „causeless".
 * The lift-off lesson is sound; only that code was wrong. This template keeps
 * the pedagogy and grades the two faults the engine CAN honestly see:
 *   - STOP_LINE_OVERSHOOT (второстепенна) — keep the gas on and the late brake
 *     no longer fits: the nose runs PAST the stop line into the junction mouth.
 *     The overrun is the visible cost of not lifting off (the harsh brake
 *     itself, being a lawful red response, is never billed);
 *   - HESITATION_AT_GREEN (второстепенна) — the wasted stop's second cost: a
 *     car that stopped when it could have flowed is then slow off the mark.
 * Both are reachable and both grade EXACTLY (proven in the trace gate).
 */

import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// sc-sp-eco-coast — „Видиш ли червено отдалеч, пусни газта" (SP-11 / JU-09)
// ---------------------------------------------------------------------------

/** Northbound right-lane center of sx-v1's ns road, m. */
const SX_LANE = 4.06;

export const SC_SP_ECO_COAST: ScenarioSpec = {
  id: "sc-sp-eco-coast",
  family: "speed",
  tagsBg: ["икономично шофиране", "предвиждане", "светофар", "пускане на газта", "спиране с двигател"],
  titleBg: "Видиш ли червено отдалеч, пусни газта",
  objectiveBg:
    "Видиш ли червения светофар отдалеч, пусни газта отрано и остави колата да се търкаля — стигни линията плавно, без рязко спиране, и тръгни без колебание на зеленото.",
  // Doc-72 provenance: SP-11 (анти-модел: рязкото късно спиране, тук изразено
  // като преминаване на линията) и JU-09 („закъснели действия" на зелено).
  archetypeIds: ["SP-11", "JU-09"],
  conceptIds: [
    "c-eco-techniques",
    "c-speed-adaptation",
    "c-traffic-light-signals",
    "c-general-care-duty",
  ],
  map: {
    archetype: "x-junction",
    // Map REUSED from the signals family — mirrored in sx-v1.json params. The
    // red-light approach (offset pin) is a recorder/session dial, not a map
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
    {
      n: 1,
      textBg: "Тръгни на север по булеварда — светофарът напред свети червено и се вижда от далеч.",
    },
    {
      n: 2,
      textBg:
        "Не дръж газта до последно. Щом видиш червеното, вдигни крак и остави колата да се забавя сама — двигателят спира по-плавно от спирачката.",
    },
    {
      n: 3,
      textBg:
        "Стигни линията плавно и спри меко пред нея, ако е още червено — без нито един рязък сантиметър и без да навлизаш в кръстовището.",
    },
    {
      n: 4,
      textBg: "Следи светофара, докато чакаш: на зелено потегли веднага и плавно, без да заспиваш.",
    },
    {
      n: 5,
      textBg: "Премини кръстовището на зелено и продължи на север с равномерна скорост.",
    },
  ],
  success: [
    {
      id: "sc-ecoc-coast",
      titleBg: "Пусни газта отрано — стигни зоната пред линията вече намалил",
      // The anti-race gate: ~17 m short of the line, on the northbound lane
      // centre, capped at 36 km/h. A driver who lifted off at ~80 m is already
      // under it here (the shadow reads ~23 km/h); a driver who keeps the gas on
      // arrives at ~50 and misses the gate entirely — the coast, not just the
      // copy, is what completes step one.
      params: { kind: "reachZone", x: SX_LANE, y: -45, radiusM: 7, maxSpeedKmh: 36 },
    },
    {
      // D3 (ledger §5), same class as sc-sgw-tl1/tl3: `passSignal` tracks
      // PROGRESSION only — objectives.ts documents that a crossing on red still
      // completes it — so «на зелено» was a tick the gate could not verify. The
      // colour is graded where it belongs, by RED_LIGHT_CROSSED; the title now
      // names the act that is actually measured, plus the thing this drill is
      // about (arriving already slowed, so the wait is short and the start
      // prompt).
      id: "sc-ecoc-pass",
      titleBg: "Изчакай червеното пред линията и премини светофара",
      params: {
        kind: "passSignal",
        nodeId: "sx-n-c",
        x: 0,
        y: 0,
        radiusM: 45,
        control: "trafficLight",
      },
    },
    {
      id: "sc-ecoc-exit",
      titleBg: "Излез от кръстовището на север",
      params: { kind: "reachZone", x: SX_LANE, y: 45, radiusM: 9 },
    },
  ],
  // Informational only (doc 76 §6): the shadow rides the approach, waits the
  // last of the red and clears in ~25 s. There is no economy/placement channel
  // here — the coast quality is graded by the gate above and the two mistakes.
  rubric: { parTimeSec: 45 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scSpEcoCoast.ts; the §5 gate (shadow replays ZERO violations, crosses
  // on GREEN) and the §9 stage-5 asserts run in
  // traces/__tests__/sc-sp-eco-coast-traces.test.ts (re-record RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-sp-eco-coast/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-sp-eco-coast/mistake-late-brake.trace.json" },
      titleBg: "Газ до последно, после закова",
      whatWentWrongBg:
        "Газта остана на пода към червеното, а спирачката дойде на последния момент — и спирачният път не стигна: предницата премина стоп-линията и навлезе в устието на кръстовището. Самото рязко спиране пред червен светофар е ЗАКОНЕН отговор и не се наказва — но преминаването на линията е второстепенна грешка и предпоставка за произшествие: закриваш пешеходната пътека и пречиш на завиващите. Ако беше пуснал газта още щом видя червеното на 80 метра, колата щеше да се забави сама и да спре меко ПРЕД линията. Планираното спиране започва рано; закованото започва късно и винаги свършва твърде далеч.",
      codeRefs: ["STOP_LINE_OVERSHOOT"],
    },
    {
      traceRef: { path: "content/traces/sc-sp-eco-coast/mistake-sleep-at-green.trace.json" },
      titleBg: "Заспиване на зеленото",
      whatWentWrongBg:
        "Приближаването беше чисто — колата пусна газта и спря меко на линията. Но после проспа зеленото: светна, пътят беше свободен, а колата остана на място секунди наред. „Закъснелите действия“ са второстепенна грешка на изпита — кръстовището пропуска по-малко коли, а колоната зад теб чака точно теб. Урокът за пускането на газта има две страни: не бързай към червеното, но и не се успивай на зеленото. Докато чакаш, дръж светофара под око и бъди готов да потеглиш в мига, в който светне.",
      codeRefs: ["HESITATION_AT_GREEN"],
    },
  ],
  teach: {
    whenBg:
      "На всяко приближаване към червен или жълт светофар, който виждаш отдалеч — в града това е десетки пъти на ден. Колкото по-рано пуснеш газта, толкова по-плавно и по-икономично спираш, а често светофарът става зелен, преди изобщо да е трябвало да спреш.",
    whyBg:
      "Пускането на газта отрано е и най-икономичното, и най-безопасното. Двигателят забавя колата плавно и предвидимо — без износване на спирачки, без гориво, изгорено за нищо, и без рязко заковаване, което изненадва движещите се зад теб. Който държи газта до последно, плаща три пъти: с гориво, със спирачки и със спирачен път, който често не стига — предницата минава линията и навлиза там, където нямаш работа. А същата монета има и обратна страна: спреш ли, не се успивай — секундите, изгубени на зеленото, са също толкова изгубени, колкото профуканите на червеното.",
    lawRef: "ЗДвП чл. 20, ал. 2; Наредба № 37",
    examinerBg:
      "Изпитващият гледа предвиждането: четеш ли светофара отрано, пускаш ли газта навреме и спираш ли плавно ПРЕД линията, без да навлизаш в кръстовището. Спиране с предницата отвъд стоп-линията е второстепенна грешка, както и колебанието при потегляне на зелено („закъснели действия“).",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // No L5 by design: the difficulty axis here is ANTICIPATION TIMING (reading
    // the red early enough to coast), not grip or light. Rain/night would want
    // the ADR-006 stage-4a physics opt-in the dry-tuned ghost cannot honour and
    // would only add a story this single-light drill does not teach.
  ],
  staged: [],
  // LIVE arrival pin (LessonSpec.signalPlan — the founder traffic-light fix):
  // the lesson is reading a red from afar and coasting to it, so the student
  // must ARRIVE on a red. redFresh rebases the ns cluster to the start of the
  // full red at 45 m, guaranteeing a red-then-green approach on every attempt;
  // a wall-clock arrival could land on green and delete the entire drill. The
  // recorded ghost pins the same arc through the recorder's signalOffsets (the
  // sc-signal-redyellow discipline — an accepted ghost/live phase difference:
  // both meet the red and leave on green, which is all the lesson asks).
  signalPlan: { arm: "redFresh", triggerM: 45 },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The SPEED-family templates (registered in templates.ts by the main session). */
export const SCENARIO_TEMPLATES_SPEED: readonly ScenarioSpec[] = [SC_SP_ECO_COAST];
