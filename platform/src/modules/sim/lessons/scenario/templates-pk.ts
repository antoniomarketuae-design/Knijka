/**
 * Scenario templates — the PRECISION-STOP form of the PARKING/LOW-SPEED family,
 * S3 batch 6 (doc 72 §11 „Family PK", archetype PK-14 „Плавно спиране на
 * позиция"): a FULL parking-family form NOT among the four shipped bay
 * maneuvers (perp-rev / parallel / 45 / narrow), staged on a purpose-built
 * straight-street micro-map, DATA ONLY in the templates.ts mold (coordinates
 * denormalized from the committed district file so nothing loads world JSON at
 * runtime; the trace-gate battery asserts every pinned value against the map):
 *
 *  - sc-pk-smooth-stop  „Плавно спиране на позиция"  (PK-14, pk-stop-v1)
 *
 * A stopped delivery van sits in the lane ahead (a recorder obstacle rect, not
 * a lane actor). The driver must bring the car to a SMOOTH, CONTROLLED stop
 * precisely at the mark a few metres short of it. Each mistake demo cites a
 * SHIPPED rules-catalog code and grades EXACTLY it through the production stack
 * (the §5/§9 gate, traces/__tests__/sc-pk-smooth-stop-traces):
 *   - shadow → ZERO violations; completes the smoothStop maneuver (eased to a
 *     stop under the harsh-decel ceiling) AND the low-speed stop-mark reachZone;
 *   - „Претърколи се в спрелия автомобил" → EXACTLY COLLISION (lifted off too
 *     late, rolled past the mark into the van);
 *   - „Твърде бърз подход" → EXACTLY COLLISION (approached far too fast to stop
 *     in the distance and ploughed into the van).
 *
 * Н38 grades a harsh/late stop as второстепенна → основна, but the recorder's
 * kinematic core cannot manufacture the > 7 m/s² deceleration the harsh-brake
 * detector needs (SCRIPT_DECEL 4.6), so the gradeable failure of a lost
 * stopping plan here is the OVERRUN — the two demos both grade COLLISION (the
 * same same-code mistake pair as sc-follow-brake / sc-park-perp-rev). The
 * smoothStop objective is what proves the CORRECT stop was controlled.
 *
 * Family: "parking" — the doc-76 §2 chip (already in ScenarioFamily +
 * FAMILY_ICONS 🅿️); the id (sc-pk-*) matches the sc-<family>-<slug> standard.
 */

import type { ScenarioSpec } from "./types";

/** Right-lane center of the 1-lane-per-direction street (pk-stop-v1). */
const LANE_X = 4.06;
/** The stop mark: the driver eases to a full stop here, ~6 m short of the van. */
const STOP_MARK_Y = 112;

/**
 * PK-14 — плавно спиране на маркирана позиция (ЗДвП чл. 20 ал. 2: водачът
 * съобразява скоростта така, че да може да спре пред всяко предвидимо
 * препятствие; плавното, предвидимо спиране е и част от техниката за паркиране
 * и спиране по знак/маркировка).
 */
export const SC_PK_SMOOTH_STOP: ScenarioSpec = {
  id: "sc-pk-smooth-stop",
  family: "parking",
  tagsBg: ["плавно спиране", "контрол на спирачката", "точност", "изпитни упражнения"],
  titleBg: "Плавно спиране на позиция",
  objectiveBg:
    "Спри плавно и точно на маркираната позиция — вдигни газта рано, натисни спирачката меко и предвидимо и спри на няколко метра пред спрелия отпред автомобил, без рязкост и без да го докоснеш.",
  archetypeIds: ["PK-14"],
  conceptIds: ["c-braking-distance", "c-stopping-distance-total", "c-sudden-braking-slow-driving"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in pk-stop-v1.json meta.scenario.params
    // (tools/maps/gen_pk_smoothstop.mjs).
    params: { lengthM: 200, maxspeedKmh: 50 },
    districtId: "pk-stop-v1",
  },
  start: {
    spawnPointId: "pk-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица и се движи спокойно в дясната лента." },
    {
      n: 2,
      textBg:
        "Напред в лентата е спрял автомобил. Ще спреш плавно на маркираната позиция на няколко метра зад него.",
    },
    {
      n: 3,
      textBg:
        "Вдигни газта рано — още отдалеч — и остави колата да намали. Не изчаквай последния момент.",
    },
    {
      n: 4,
      textBg:
        "Натисни спирачката меко и постепенно; отпусни леко точно преди спиране, за да няма клъвване напред.",
    },
    { n: 5, textBg: "Спри напълно на позицията, с малка дистанция до спрелия отпред, и задръж колата." },
  ],
  success: [
    {
      id: "sc-pk-approach",
      titleBg: "Приближи позицията с готовност за спиране",
      // A mid-street progress checkpoint the calm approach passes through.
      params: { kind: "reachZone", x: LANE_X, y: 60, radiusM: 12 },
    },
    {
      id: "sc-pk-mark",
      titleBg: "Спри точно на маркираната позиция",
      // Completable ONLY at near-stop speed at the mark: the precision skill —
      // a car that overruns (into the van) blows through this zone at speed and
      // never rests inside it. (A recorder-driven smoothStop maneuver objective
      // is not usable here: the kinematic recorder can only brake at a fixed
      // ~4.6 m/s² and zeroes the last ~2 km/h in one frame, a spike no sane
      // maxDecelMs2 accepts — so the graded FAILURE of a lost stopping plan is
      // the overrun/COLLISION, and the controlled arrival is graded by this
      // low-speed stop-mark zone; smoothness is coached in the instructions.)
      params: { kind: "reachZone", x: LANE_X, y: STOP_MARK_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED (S3 batch 6): committed deterministic recordings of the authored
  // scripts in traces/scPkSmoothStop.ts; the §5 gate (shadow replays with ZERO
  // violations + completes smoothStop) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-pk-smooth-stop-traces.test.ts (re-record with
  // RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-pk-smooth-stop/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pk-smooth-stop/mistake-overshoot.trace.json" },
      titleBg: "Претърколи се в спрелия автомобил",
      whatWentWrongBg:
        "Спирачката дойде твърде късно и меко — колата подмина маркираната позиция и се претърколи в спрелия отпред автомобил. Съобразената скорост е тази, при която спираш пред предвидимото препятствие: газта се вдига рано, а спирането се планира, не се изчаква.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-pk-smooth-stop/mistake-too-fast.trace.json" },
      titleBg: "Твърде бърз подход",
      whatWentWrongBg:
        "Подходът към позицията беше твърде бърз — на тази скорост спирачният път не стигна и колата се вряза в спрелия отпред автомобил. Спирачният път расте квадратично със скоростта: към точка на спиране се приближава бавно и с готовност за спиране.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "При всяко спиране на определена позиция — зад спрял автомобил, на стоп-линия, на автобусна маркировка, пред бариера. Плавното, планирано спиране е основата и на паркирането, и на спокойното градско каране.",
    whyBg:
      "Рязкото и закъсняло спиране е предпоставка за удар — отпред, ако не стигне спирачният път, и отзад, защото изненадва движещите се след теб. Който вдига газта рано и спира меко, владее и дистанцията, и габаритите на колата, и не кара пътниците да клъвват напред.",
    lawRef: "ЗДвП чл. 20",
    examinerBg:
      "Изпитващият следи спирането по целия маршрут: ранно вдигане на газта, меко и постепенно натискане на спирачката, спиране точно на посочената позиция без рязкост и без да докоснеш препятствието отпред. Рязкото спиране, което създава предпоставка за ПТП, е грешка.",
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

/** The PK precision-stop templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_PK: readonly ScenarioSpec[] = [SC_PK_SMOOTH_STOP];
