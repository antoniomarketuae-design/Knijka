/**
 * Scenario templates — the JUNCTION/PRIORITY family, waves 1+3.
 * DATA ONLY (the templates.ts law): coordinates are denormalized from the
 * committed district files (content/world/jx-equal-v1.json —
 * tools/maps/gen_jx_equal.mjs; content/world/tj-stop-v1.json —
 * tools/maps/gen_t_junction.mjs) so nothing loads world JSON at runtime; the
 * jx-equal / tj batteries assert every pinned value against the generated
 * files, and the trace gates replay the drives through the production stack.
 *
 * TWO templates — the two halves of предимство:
 *
 *   sc-jx-equal-left (JU-01 + JU-10, wave 1) — an uncontrolled equal X. The
 *     player turns LEFT, which means BOTH чл. 37 duties land in one maneuver:
 *     пропусни идващия отдясно (the runtime's right-hand-rule tracker, east
 *     arm) AND пропусни насрещния направо (the N1 left-turn-across-path
 *     tracker, north arm). Both grade FAILED_TO_YIELD / YIELDED_TO_PRIORITY.
 *
 *   sc-jx-priority-confidence (JU-04 + JU-13 + SP-11, wave 3) — the MIRROR: the
 *     player is the one WITH предимство (чл. 48), and the graded fault is no
 *     longer taking someone's right of way but refusing to USE your own. See
 *     its own section header for why that inversion is structurally safe here.
 *
 * SEQUENCING IS THE DESIGN (sc-jx-equal-left). The two conflicts are never live
 * together below L5: the priorityFromRight runner commits its car on PLAYER
 * PROXIMITY (playerLineDist <= 22 m — while the student is still rolling), while
 * the oncomingLeftTurn runner holds its car until the student STOPS
 * (speedKmh <= 8) and only then releases it over 70 m. So the right-hand car
 * arrives, clears, and only then does the oncoming become a conflict — one
 * teach-pause card at a time, exactly the ladder the objective states. L5 is
 * where they close up (rain + a live stream), because by then the student has
 * met each one alone.
 *
 * Geometry truths (battery: jx-equal-districts.test.ts):
 *   - drawn lane centers sit ±4.0625 m off the road centerline;
 *   - four equal residential arms → ZERO stop lines, jx-n-c uncontrolled at
 *     degree 4;
 *   - all four corners are open (buildings clear |x|,|y| >= 30) — this is the
 *     INVERSE of JU-17: the lesson is the priority ladder, not the peek.
 */

import type { ScenarioSpec } from "./types";
import type {
  OncomingLeftTurnSpec,
  PriorityFromRightSpec,
  RearTailgaterSpec,
} from "../../contracts";

/** Drawn lane-center offset from the road centerline on every junction map, m. */
export const JUNCTION3_LANE_CENTER_M = 4.0625;
/**
 * The shadow's yield pose on the south arm, m from the node. Deliberately
 * OUTSIDE the runtime's 18 m right-hand-rule conviction core (RHR_CORE_RADIUS_M)
 * — hypot(4.0625, 19.5) = 19.92 — so a student waiting here for either car is
 * structurally innocent while both conflicts play out.
 */
export const JUNCTION3_YIELD_Y = -19.5;

// ---------------------------------------------------------------------------
// sc-jx-equal-left — „Ляв завой на равнозначно кръстовище" (JU-01 + JU-10)
// on jx-equal-v1
// ---------------------------------------------------------------------------

/**
 * Conflict 1 — the car from the RIGHT (east → west, straight through), timed by
 * the priorityFromRight runner against the player's approach. junctionControl
 * "uncontrolled": the runtime's own right-hand-rule tracker adjudicates
 * (FAILED_TO_YIELD / YIELDED_TO_PRIORITY) and emits its own commendation on
 * leaving the junction. Timing mirrors SC_JUNCTION_BLIND_CONFLICT — the
 * near-node dynamics are arm-independent — but the corners here are OPEN: the
 * student can see this car coming from 100 m and still has to give way, which
 * is the чл. 37 point (predimstvo is a rule, not a surprise).
 */
export const SC_JX_EQUAL_RIGHT_CONFLICT: PriorityFromRightSpec = {
  id: "sc-jxeq-right",
  kind: "priorityFromRight",
  libraryEventId: "JU-01",
  junction: { nodeId: "jx-n-c", x: 0, y: 0 },
  junctionControl: "uncontrolled",
  actor: {
    pathNodes: ["jx-n-e", "jx-n-c", "jx-n-w"],
    hold: { nodeIndex: 1, offsetM: -95 },
    cruiseSpeedMps: 8,
  },
  junctionNodeIndex: 1,
  armDistM: 70,
  leadSec: -3.5,
  lineDistM: 18,
  clearSpeedMps: 11.5,
};

/**
 * Conflict 2 — the ONCOMING car (north → south, straight through), graded by
 * the runtime's N1 left-turn tracker. Two dials do the SEQUENCING here, and
 * neither is a difficulty dial:
 *
 *  - gapSec 12 keeps the runner's arrival sync wanting the actor at
 *    (playerNodeEta + 12) x 8 m/s ≈ 145–160 m from the node all through the
 *    approach — always BEYOND its 125 m hold — so the sync commands ~0 and the
 *    car genuinely waits. This is the dial that matters: at gapSec 8 the sync's
 *    desired stand-off dips UNDER 125 m late in the approach and quietly walks
 *    the car ~30 m forward, landing it at the node 4 s early (measured).
 *  - hold −125 m is the SPACING: the runner releases this car the moment the
 *    student drops to yield speed (≤ 8 km/h), which is ~7 s BEFORE the
 *    right-hand car has cleared. 125 m at 8 m/s = ~15.6 s of travel, so it
 *    reaches the node ~8 s AFTER the right-hand conflict resolves — one card,
 *    then the other. A shorter hold fuses the two into a single unteachable
 *    moment (measured: at −70 m the two conflicts land 0.4 s apart).
 *
 * colorIndex 2 tells it apart from the right-hand car in the ghost replay.
 */
export const SC_JX_EQUAL_ONCOMING_CONFLICT: OncomingLeftTurnSpec = {
  id: "sc-jxeq-oncoming",
  kind: "oncomingLeftTurn",
  libraryEventId: "JU-10",
  junction: { nodeId: "jx-n-c", x: 0, y: 0 },
  actor: {
    pathNodes: ["jx-n-n", "jx-n-c", "jx-n-s"],
    hold: { nodeIndex: 1, offsetM: -125 },
    cruiseSpeedMps: 8,
    colorIndex: 2,
  },
  junctionNodeIndex: 1,
  armDistM: 65,
  gapSec: 12,
  clearSpeedMps: 12.5,
};

/**
 * L5 — the complication rung the conditionsNote asks for: „двата конфликта в
 * един пас". A SECOND oncoming car holds only 60 m out, so the same yield
 * trigger that releases both delivers this one to the node in ~8.6 s — i.e.
 * WHILE the right-hand car is still crossing. The base oncoming still arrives
 * later, so L5 is the full ladder compressed: right-hand car and oncoming
 * together, then one more oncoming, in the rain. Same-path phase offset is the
 * house pattern (SC_LTAP_TIGHT/SC_LTAP_FOLLOW, templates-junctions.ts).
 *
 * Rain is VISUAL only — no physics.wetGrip on this template (ADR-006): the
 * authored ghost envelopes are dry-tuned, and a rung that silently changed the
 * braking distance under them would teach a lie.
 */
export const SC_JX_EQUAL_ONCOMING_EARLY: OncomingLeftTurnSpec = {
  id: "sc-jxeq-oncoming-2",
  kind: "oncomingLeftTurn",
  libraryEventId: "JU-10",
  junction: { nodeId: "jx-n-c", x: 0, y: 0 },
  actor: {
    pathNodes: ["jx-n-n", "jx-n-c", "jx-n-s"],
    hold: { nodeIndex: 1, offsetM: -60 },
    cruiseSpeedMps: 7,
    colorIndex: 4,
  },
  junctionNodeIndex: 1,
  armDistM: 65,
  gapSec: 14,
  clearSpeedMps: 12.5,
};

export const SC_JX_EQUAL_LEFT: ScenarioSpec = {
  id: "sc-jx-equal-left",
  family: "junction",
  tagsBg: ["кръстовище", "равнозначно", "ляв завой", "предимство", "дясното правило"],
  titleBg: "Ляв завой на равнозначно кръстовище",
  objectiveBg:
    "На кръстовище без знаци пропусни идващия отдясно И насрещния направо, чак тогава завий наляво.",
  archetypeIds: ["JU-01", "JU-10"],
  conceptIds: [
    "c-right-hand-rule",
    "c-equal-junction",
    "c-left-turn-oncoming",
    "c-turning-left-junction",
  ],
  map: {
    archetype: "x-junction",
    // Mirrored in jx-equal-v1.json meta.scenario.params.
    params: {
      control: "none",
      ewArmM: 130,
      nsArmM: 130,
      lanes: 2,
      maxKmh: 40,
      sightClearM: 30,
    },
    districtId: "jx-equal-v1",
  },
  start: {
    spawnPointId: "jx-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Тръгни по южната улица към кръстовището. Огледай се: няма никакви знаци и никакъв светофар — четирите улици са равнозначни.",
    },
    {
      n: 2,
      textBg:
        "Точно затова важи правилото на дясното: щом няма знак, предимството е на този, който идва отдясно. Намали отрано и пусни ляв мигач.",
    },
    {
      n: 3,
      textBg:
        "Спри преди кръстовището и пропусни колата, която идва отдясно (по източната улица). Тя минава първа — това не подлежи на преценка.",
    },
    {
      n: 4,
      textBg:
        "Не тръгвай веднага щом тя мине. Левият завой пресича и насрещното платно: изчакай и колата, която идва срещу теб направо от север.",
    },
    {
      n: 5,
      textBg:
        "Чак когато и двете са преминали и пътят е чист, завий наляво по западната улица и изключи мигача.",
    },
  ],
  success: [
    {
      id: "sc-jxeq-approach",
      titleBg: "Приближи равнозначното кръстовище с готовност да пропуснеш",
      params: { kind: "reachZone", x: 4.06, y: -30, radiusM: 8, maxSpeedKmh: 22 },
    },
    {
      id: "sc-jxeq-cross",
      titleBg: "Завий наляво, след като пропуснеш и десния, и насрещния",
      // West-arm westbound lane center, past the 40 m junction area.
      params: { kind: "reachZone", x: -50, y: 4.06, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 80 },
  shadow: { path: "content/traces/sc-jx-equal-left/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-jx-equal-left/mistake-cut-right.trace.json" },
      titleBg: "Завой пред колата отдясно",
      whatWentWrongBg:
        "Кръстовището беше празно откъм знаци — и водачът реши, че е празно и откъм задължения. Колата отдясно приближаваше открито, но той влезе пред нея със същата скорост. На равнозначно кръстовище липсата на знак НЕ значи, че имаш предимство: значи, че предимството е на десния.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-jx-equal-left/mistake-cut-oncoming.trace.json" },
      titleBg: "Ляв завой през носа на насрещния",
      whatWentWrongBg:
        "Десният беше пропуснат коректно — и точно това приспа водача: щом единият мине, тръгваме. Но левият завой пресича и насрещното платно, а отсреща идваше кола направо. Тя има предимство пред завиващия наляво; изчакването не свършва с първата кола, а когато пътят е чист.",
      codeRefs: ["FAILED_TO_YIELD", "COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръстовище без знаци и без светофар — квартални улици, вили, промишлени зони. Липсата на знак е самата информация: улиците са равнозначни и се движиш по правилото на дясното. Левият завой е най-тежкият случай, защото събира две задължения наведнъж.",
    whyBg:
      "Двете най-чести грешки тук са огледални. Първата: „няма знак, значи мога“ — и колата отдясно спира заради теб. Втората е по-коварна: пропускаш десния коректно, но щом той мине, тръгваш — а левият завой пресича насрещното платно, където вече идва някой. Завиващият наляво пропуска насрещния направо винаги; изчакването свършва не когато мине първата кола, а когато пътят е чист.",
    lawRef: "ЗДвП чл. 37; чл. 48",
    examinerBg:
      "Изпитващият гледа: разпознаваш ли равнозначното кръстовище без подсказка от знак, намаляваш ли отрано, пропускаш ли идващия отдясно БЕЗ той да реагира заради теб, и изчакваш ли насрещния, преди да завиеш наляво. Всяко от двете непропускания е отнемане на предимство — опасна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    {
      // L5: двата конфликта в един пас + дъжд (визуално — сухата физика държи
      // авторския плик на призрака, ADR-006: без physics.wetGrip тук).
      level: 5,
      conditions: { weather: "rain" },
      stagedAdd: [SC_JX_EQUAL_ONCOMING_EARLY],
    },
  ],
  staged: [SC_JX_EQUAL_RIGHT_CONFLICT, SC_JX_EQUAL_ONCOMING_CONFLICT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-jx-priority-confidence — „По пътя с предимство" (JU-04 + JU-13 + SP-11)
// on tj-stop-v1 (wave 3)
// ---------------------------------------------------------------------------

/**
 * WHY THIS TEMPLATE IS STRUCTURALLY SAFE — the one fact the whole drill rests on.
 *
 * Every other priorityFromRight template stages the car that TAKES priority from
 * the player. This one inverts it: the player rides the primary arm of
 * tj-stop-v1 and the staged car sits on the stem behind a Б2. The staged car is
 * still literally „от дясната страна" (the stem leaves the node southward; the
 * player runs west→east, so the stem is their RIGHT) — which is exactly the
 * misconception the lesson kills: on a signed junction дясното правило does not
 * apply at all.
 *
 * That is not just narrative. It is the runtime's own classification
 * (worldRuntime.ts): uncontrolledJunctions excludes any node carrying a derived
 * stop line, and tj-stop-v1's primary/residential pair makes the stop-sign
 * heuristic derive exactly ONE Б2 line, on the stem, at tj-n-c. So
 * isUncontrolledJunction("tj-n-c") is FALSE and the right-hand-rule tracker
 * never arms here — the player cannot be billed FAILED_TO_YIELD by a car that
 * approaches from their right. The player's own edge carries no line either, so
 * the give-way conflictNear check has nothing to fire on. The template's whole
 * premise („предимството е твое, карай") is enforced by the district's geometry,
 * not by tuning. The tj battery pins both halves (debugStopLines() length 1 at
 * sM 92.275, debugUncontrolledJunctions() === []); the trace gate proves no
 * prioritySituation event of ANY kind fires in ANY of the three drives.
 *
 * WHAT ACTUALLY GRADES, then:
 *   - SP-11/VP-09 HARSH_BRAKING_NO_CAUSE — the phantom brake. This is the
 *     taught fault, and it is a REAL detector, not a proxy: a car BEHIND you is
 *     never a forward cause (the cause ledger reads only the forward gap
 *     channel), so the лепка actor raises the stakes without ever grading.
 *   - COLLISION — the L5 нахлуващ.
 *   - JU-13 (junction approach speed) is cited as provenance ONLY: doc 72 marks
 *     its approach-envelope detector 🔴 NEW. The positive „равномерно и уверено"
 *     half is graded by the objective gates + SPEEDING_OVER_LIMIT + par time, and
 *     an unnecessary GENTLE stop is honestly not graded today (see notes).
 */

/** The Б2 stop line tj-stop-v1's heuristic derives on the stem, m from tj-n-c.
 *  Pinned by the tj battery (line sM 92.275 on the 120 m stem → y = −27.725). */
export const TJ_STOP_B2_LINE_M = 27.725;

/**
 * THE CAR THAT DOES ITS JOB — a priorityFromRight actor tuned to the ONE
 * behavior the base rungs need: обездвижена на своя Б2, all the way through the
 * player's pass. Two dials do it, and neither is a difficulty dial:
 *
 *  - armDistM 22 is the load-bearing one. The runner's approach SYNC (the branch
 *    that walks a car toward the node to meet the player) only runs once the
 *    player is inside armDistM; with lineDistM 0, playerLineDist === the player's
 *    euclidean distance to the node, so the very first tick that arms the runner
 *    (d <= 22) ALSO satisfies its commit test (PRIORITY_COMMIT_PLAYER_M = 22).
 *    The sync branch is therefore unreachable by construction, and the car is
 *    DORMANT at its authored hold for the whole approach — not "held by a
 *    command that happens to be 0". That immunity is why this spec does not care
 *    what PRIORITY_COMMIT_CAR_M is, and the trace gate pins it (the car's arc is
 *    byte-identical until the player is 22 m out).
 *  - lineDistM 0 is the honest value, not a tuning choice: playerLineDist is the
 *    player's distance to THEIR OWN stop line, and a driver on the priority arm
 *    has none. d − 0 = d.
 *
 * What the student sees: a car waiting at the Б2 for the entire approach, which
 * starts to roll only once they are 22 m away — i.e. it pulls out BEHIND them,
 * the way a driver who read the sign correctly does. cruiseSpeedMps 4.5 from
 * −27.725 m needs > 5 s to reach the player's lane; the player at 46 km/h is
 * through the box in 1.7 s. The pull-out is a consequence of the pass, never a
 * conflict with it. Measured on the shadow: the car sits at exactly
 * (4.06, −27.72) — its authored hold, to the centimetre — until the player is
 * 22 m out, and the closest the two ever come is 16.5 m.
 *
 * Path exits WEST (a left turn off the stem) on purpose: it keeps this car out
 * of the eastbound lane the лепка actor occupies, so the two staged cars can
 * never overlap in the ghost replay.
 */
export const SC_JX_PRIO_WAITING_CAR: PriorityFromRightSpec = {
  id: "sc-jxpc-waiter",
  kind: "priorityFromRight",
  libraryEventId: "JU-04",
  junction: { nodeId: "tj-n-c", x: 0, y: 0 },
  // The node IS guarded — by the Б2 on the OTHER arm. The runner reads this only
  // to decide whether to emit the give-way commendation itself, and its sawYield
  // gate (playerLineDist <= 14 AND speedKmh <= 8) can never latch for a player
  // who correctly never slows: no commendation, no event, no grading. Which is
  // the point — nothing about this car may touch the player's ledger.
  junctionControl: "stopLine",
  actor: {
    pathNodes: ["tj-n-s", "tj-n-c", "tj-n-w"],
    hold: { nodeIndex: 1, offsetM: -TJ_STOP_B2_LINE_M },
    cruiseSpeedMps: 4.5,
  },
  junctionNodeIndex: 1,
  armDistM: 22,
  leadSec: 0, // sync-only dial; the sync branch is unreachable (see above)
  lineDistM: 0,
  clearSpeedMps: 8,
};

/**
 * THE PRESSURE — the лепка behind you, and the entire reason the phantom brake
 * is a real-world fault rather than a merely inelegant one. Contract (doc 72
 * FO-07, RearTailgaterSpec): this runner emits ZERO SimTick events, so it cannot
 * grade the player either way; it exists to make „не спирай без причина" cost
 * something. pressureSec 30 outlasts every authored drive (~20 s) — the car
 * stays glued rather than laneShift-passing into the oncoming lane of a two-way
 * road mid-lesson.
 */
export const SC_JX_PRIO_TAILGATER: RearTailgaterSpec = {
  id: "sc-jxpc-tail",
  kind: "rearTailgater",
  libraryEventId: "FO-07",
  actor: {
    pathNodes: ["tj-n-w", "tj-n-c", "tj-n-e"],
    hold: { nodeIndex: 0, offsetM: 5 }, // dormant ~10 m behind the west spawn
    cruiseSpeedMps: 13,
    extraRightOffsetM: 0, // the player's OWN lane
    colorIndex: 3,
  },
  releaseGapM: 14,
  followBehindM: 9, // ~9 m of centers ≈ 5 m of bumpers — the лепка
  maxMatchSpeedMps: 17,
  pressureSec: 30,
  passShiftM: -8.125,
  passSpeedMps: 16,
  passAheadM: 25,
  easeKmh: 8,
};

/**
 * L5 — the q-predimstvo-002 case made physical: „автомобил от пресичащия път не
 * намалява". A SECOND stem car, held 7.7 m OVER its Б2 (−20 vs −27.725: it has
 * already crept), which pulls out into the player's path instead of waiting.
 *
 * lineDistM 34 is the COMMIT-DISTANCE dial, and it is the only dial that can be:
 * the runner's commit test is playerLineDist = max(0, d − lineDistM) <= 22, so
 * this car launches when the player is d = 56 m out — ~4.5 s at 46 km/h, which is
 * what its 15.9 m crawl to the player's lane needs (cruise 4.2 m/s from a
 * standstill). With lineDistM 0 (the waiter's honest value) the commit lands at
 * d = 22, i.e. 1.7 s, and NO creep speed can make the conflict; the field's
 * arithmetic is the only seam the runner offers for "decides to go while the
 * player is still far out", and nothing else reads it here (the sync branch is
 * unreachable — carDist 20 <= 28 pins the car at 0 until the commit — and
 * sawYield needs speedKmh <= 8, which a defensive L5 student at ~31 km/h never
 * reaches). Documented, not smuggled.
 *
 * Tuned against the blind-priority demo until the crash is EMERGENT: measured
 * closest approach 0.3 m, so the runner's own contact test (VEHICLE_CONTACT_M
 * 3.0) fires and resolves detail "collision" — the demo's COLLISION is the
 * production stack's verdict, not an authored `collision` step.
 *
 * The taught response is чл. 20's готовност да спреш: shed ~15 km/h with the
 * brake already covered and the car crosses ahead of you. Blind priority is the
 * mistake demo. Held BEHIND the waiter is impossible (it must nose out first),
 * so it holds IN FRONT of it — which is also what the road looks like: the
 * impatient one at the line, the patient one queued behind.
 */
export const SC_JX_PRIO_CREEPER: PriorityFromRightSpec = {
  id: "sc-jxpc-creeper",
  kind: "priorityFromRight",
  libraryEventId: "JU-04",
  junction: { nodeId: "tj-n-c", x: 0, y: 0 },
  junctionControl: "stopLine",
  actor: {
    pathNodes: ["tj-n-s", "tj-n-c", "tj-n-w"],
    hold: { nodeIndex: 1, offsetM: -20 }, // already 7.7 m over the Б2
    cruiseSpeedMps: 4.2,
    colorIndex: 2,
  },
  junctionNodeIndex: 1,
  armDistM: 75,
  leadSec: 0,
  lineDistM: 34, // commit at d = 56 m — see above
  clearSpeedMps: 6,
};

export const SC_JX_PRIORITY_CONFIDENCE: ScenarioSpec = {
  id: "sc-jx-priority-confidence",
  family: "junction",
  tagsBg: ["кръстовище", "предимство", "път с предимство", "готовност за спиране", "еко-каране"],
  titleBg: "По пътя с предимство — без излишни спирания",
  objectiveBg:
    "Когато си на пътя с предимство, премини през кръстовището равномерно и уверено: покрий спирачката, но не спирай без причина — и бъди готов, ако някой не ти го даде.",
  archetypeIds: ["JU-04", "JU-13", "SP-11"],
  conceptIds: [
    "c-priority-road",
    "c-priority-concept",
    "c-signed-junction",
    "c-junction-approach",
    "c-hazard-perception",
    "c-sudden-braking-slow-driving",
  ],
  map: {
    archetype: "t-junction",
    // Mirrored in tj-stop-v1.json meta.scenario.params — the SAME committed
    // district sc-junction-stop (JU-03) drives from the stem. That reuse is the
    // teaching point, not a shortcut: one junction, two seats. There the student
    // is the one who must stop; here they are the one everyone else stops for.
    params: {
      control: "stop",
      priorityArmM: 150,
      minorArmM: 120,
      lanes: 2,
      priorityMaxKmh: 50,
      minorMaxKmh: 40,
    },
    districtId: "tj-stop-v1",
  },
  start: {
    spawnPointId: "tj-spawn-west",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Тръгни на изток по главната улица. Ти си по пътя с предимство — на кръстовището напред страничната улица излиза на знак Б2 „Спри!“.",
    },
    {
      n: 2,
      textBg:
        "Отдясно, на страничната улица, чака кола. Погледни я, но не ѝ отстъпвай: тя е длъжна да спре и да те пропусне. „Отдясно“ не значи нищо, когато има знаци.",
    },
    {
      n: 3,
      textBg:
        "Премести крака над спирачката, без да натискаш — това е готовността по чл. 20. Задръж равномерна скорост до 50 и не сваляй газта на пресекулки.",
    },
    {
      n: 4,
      textBg:
        "Погледни в огледалото: отзад те следва кола, залепена за теб. Спреш ли без причина на предимство, ударът отзад е твой проблем — затова се спира само по причина.",
    },
    {
      n: 5,
      textBg:
        "Премини кръстовището равномерно и продължи на изток. Ако чакащият все пак потегли срещу теб — вече си с крак на спирачката и намаляваш, вместо да разчиташ на правото си.",
    },
  ],
  success: [
    {
      id: "sc-jxpc-approach",
      titleBg: "Приближи кръстовището по пътя с предимство, без превишение",
      // West-arm eastbound lane center, outside the harsh-brake junction window.
      params: { kind: "reachZone", x: -40, y: -4.06, radiusM: 8, maxSpeedKmh: 52 },
    },
    {
      id: "sc-jxpc-cross",
      titleBg: "Премини кръстовището и продължи по главната",
      // East-arm eastbound lane center, past the junction area.
      params: { kind: "reachZone", x: 60, y: -4.06, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 40 },
  shadow: { path: "content/traces/sc-jx-priority-confidence/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-jx-priority-confidence/mistake-phantom-brake.trace.json",
      },
      titleBg: "Паническо спиране на предимство с кола зад теб",
      whatWentWrongBg:
        "Чакащата кола на Б2 не помръдна — но водачът я видя „отдясно“, паникьоса се и заби спирачката на празен път. Спирането без причина по пътя с предимство не е предпазливост: то е изненада за залепения отзад и е самостоятелно нарушение (рязко спиране, което създава предпоставка за ПТП). Предимството се използва — иначе кръстовището спира да работи и опасността се мести зад теб.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
    {
      traceRef: {
        path: "content/traces/sc-jx-priority-confidence/mistake-blind-priority.trace.json",
      },
      titleBg: "Сляпо държане на предимството срещу нахлуващ",
      whatWentWrongBg:
        "Този път колата на страничната улица изпълзя пред линията и потегли — а водачът задържа скоростта, защото „предимството е мое“. И беше негово. Само че чл. 20 иска готовност да спреш при възникнала опасност, а не да докажеш правото си: предимството е право, не е спирачка за чуждата кола. Едно сваляне на газта и покрита спирачка щяха да го разминат.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръстовище, където твоят път е обозначен като път с предимство (жълт ромб) или пресичащите го имат Б1 „Пропусни“ / Б2 „Спри!“. Знакът работи за целия път — на всяко следващо кръстовище, докато не дойде знакът за край.",
    whyBg:
      "Тук грешките са две и са в двете посоки. Първата: не смееш да използваш предимството си — влачиш се, спираш „за всеки случай“ и изненадваш всички зад себе си; кръстовището работи само ако този с предимството минава. Втората е обратната и е по-скъпа: предимството е право, но то не спира чужда кола. Затова минаваш равномерно И с покрита спирачка — увереност и готовност не се изключват, а се събират.",
    lawRef: "ЗДвП чл. 48; чл. 20",
    examinerBg:
      "Изпитващият гледа за две неща наведнъж: използваш ли предимството си (равномерно преминаване, без излишно спиране и без пълзене) и виждаш ли чакащия отстрани (поглед към страничната улица, крак над спирачката). Излишното спиране на предимство се отчита; неготовността срещу нахлуващ се отчита още по-тежко.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    {
      // L5: чакащият не изчаква — изпълзява пред линията и потегля. Дъждът е
      // ВИЗУАЛЕН (ADR-006: без physics.wetGrip — авторският плик на призрака е
      // сух-тунингован и рунг, който тихо променя спирачния път под него, учи лъжа).
      level: 5,
      conditions: { weather: "rain" },
      stagedAdd: [SC_JX_PRIO_CREEPER],
    },
  ],
  staged: [SC_JX_PRIO_WAITING_CAR, SC_JX_PRIO_TAILGATER],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The JUNCTION/PRIORITY wave-1 + wave-3 templates (registered in templates.ts). */
export const SCENARIO_TEMPLATES_JUNCTIONS3: readonly ScenarioSpec[] = [
  SC_JX_EQUAL_LEFT,
  SC_JX_PRIORITY_CONFIDENCE,
];
